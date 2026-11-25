import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CHURCH_SHOW, startFakeEos, type FakeEos, type FakeEosCue, type FakeEosLevels } from './fake-eos.ts';
import { startFakeProPresenter, type FakeProPresenter } from './fake-propresenter.ts';
import {
  addShowFile,
  addTemplateShow,
  addWeeklyShow,
  copySongAs,
  createWorkspace,
  DATE,
  GOODNESS,
  GREAT_ARE,
  lightsPaths,
  locatorList,
  projectFolder,
  readSet,
  REPO_ROOT,
  removeWorkspaces,
  setPath,
  snapshotFolder,
  TRUST,
  writeConnectionsConfig,
  type Workspace,
} from './set-builder-harness.ts';

// The lights mode of the set builder, `pnpm build-set --lights` (setlist-controller#500, setlist-controller#501): for the
// set built for a date, it labels each song cue of the weekly show file open in Eos with its song's title, gives the
// colour lights in it the colour of the song's ProPresenter background, saves the show and prints a summary. Every test
// runs the command as the operator runs it, against the fake Eos and the fake ProPresenter, each on a port the OS
// assigns, and reads what it prints, its exit code, what the show folder then holds and what the fake Eos holds and
// received. Every run of the mode passes --connections-config, --output-root and --show-folder with paths in its
// workspace: the command's defaults are the connections config in the home folder, which points at the real Eos and the
// real ProPresenter on this Mac, and Nick's own show folder. No test reaches a real Eos or a real ProPresenter, and no
// real show file is a fixture.

// One workspace for the file, made once: the mode only reads a built set, so the tests share the sets built in it, and
// each takes a show folder of its own (stage).
let shared: Workspace;
let stages = 0;
const fakes: { close(): Promise<void> }[] = [];

// The Sunday of the set of two songs, a week after DATE, the Sunday of the set of three.
const TWO_SONGS = '2026-10-25';
// The Sunday of the recorded playlist "November 15, 2026", whose three songs each have a picture.
const THREE_PICTURES = '2026-11-15';

// The Sunday of the recorded playlist "November 8, 2026", for a set of one song, Ancient Gates.
const ONE_PICTURE = '2026-11-08';
// The shared workspace with the output root a set of two songs with pictures is built under, for THREE_PICTURES too.
const twoPictures = (workspace: Workspace): Workspace => ({ ...workspace, outputRoot: join(shared.dir, 'Sets of two') });
// The shared workspace with the output root of one of the other sets built for THREE_PICTURES (setlist-controller#503).
// The recorded playlist "November 15, 2026" links three songs, so a larger set takes its other songs from the fixture
// library, songs that playlist does not link, which keep the template's colour. Four songs: Trust In God, This Is
// Amazing Grace, Yes and Amen and I Speak Jesus, the fourth with a picture. Five: Trust In God, Goodness of God, This Is
// Amazing Grace, Yes and Amen and I Speak Jesus, the fourth and the fifth with a picture. Four with the last unlinked:
// This Is Amazing Grace, Yes and Amen, I Speak Jesus and Trust In God. One title twice: This Is Amazing Grace, twice.
const fourSongs = (workspace: Workspace): Workspace => ({ ...workspace, outputRoot: join(shared.dir, 'Sets of four') });
const fiveSongs = (workspace: Workspace): Workspace => ({ ...workspace, outputRoot: join(shared.dir, 'Sets of five') });
const fourLastUnlinked = (workspace: Workspace): Workspace => ({ ...workspace, outputRoot: join(shared.dir, 'Sets of four, the last unlinked') });
const oneTitleTwice = (workspace: Workspace): Workspace => ({ ...workspace, outputRoot: join(shared.dir, 'Sets of one title twice') });

// The sets are built by the command, with a show folder that is not there, so no build makes a weekly show file. The
// first two are for the tests that stop before ProPresenter is read. The next three hold the songs of the playlists
// recorded on 2026-11-12, which each have a picture: the fixture library holds one of them, so the others are copies of
// fixture songs under the recorded titles, and the mode reads a title from the built set alone. The last four are the
// sets with more songs than the template has song cues, and the set with one title twice.
beforeAll(async () => {
  shared = await createWorkspace();
  await copySongAs(shared, GREAT_ARE, 'Yes and Amen-Housefires-D-72.00bpm');
  await copySongAs(shared, GOODNESS, 'I Speak Jesus-Here Be Lions-A-63.00bpm');
  await copySongAs(shared, TRUST, 'Ancient Gates-Brooke Ligertwood-A-74.00bpm');
  for (const [args, workspace] of [
    [['grace', 'great are', 'goodness', '--date', DATE], shared],
    [['trust', 'grace', '--date', TWO_SONGS], shared],
    [['grace', 'yes and', 'i speak', '--date', THREE_PICTURES], shared],
    [['grace', 'yes and', '--date', THREE_PICTURES], twoPictures(shared)],
    [['ancient', '--date', ONE_PICTURE], shared],
    [['trust', 'grace', 'yes and', 'i speak', '--date', THREE_PICTURES], fourSongs(shared)],
    [['trust', 'goodness', 'grace', 'yes and', 'i speak', '--date', THREE_PICTURES], fiveSongs(shared)],
    [['grace', 'yes and', 'i speak', 'trust', '--date', THREE_PICTURES], fourLastUnlinked(shared)],
    [['grace', 'grace', '--date', THREE_PICTURES], oneTitleTwice(shared)],
  ] as const) {
    const built = await run([...args, ...buildPaths(workspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);
  }
  expect(existsSync(shared.showFolder)).toBe(false);
}, 432_000);

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
});

afterAll(async () => {
  await removeWorkspaces();
});

// The shared workspace with a show folder no other test uses, not made yet.
function stage(): Workspace {
  stages += 1;
  return { ...shared, showFolder: join(shared.dir, `ETC ${stages}`) };
}

// A fake Eos and a fake ProPresenter that serves the 2026-11-12 session, both closed after the test, and a connections
// config in the workspace that points at the two.
async function fakeEos(workspace: Workspace, options: { refusing?: boolean } = {}): Promise<{ eos: FakeEos; pro: FakeProPresenter; config: string }> {
  const eos = await startFakeEos(options);
  fakes.push(eos);
  const pro = await startFakeProPresenter();
  fakes.push(pro);
  pro.serveNovember12();
  return { eos, pro, config: await writeConnectionsConfig(workspace, eos.port, pro.port) };
}

// Bytes no text is, so a copy that read the template as text would not equal it.
const showBytes = (label: string) => Buffer.concat([Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x0d, 0x0a]), Buffer.from(label), Buffer.from([0xc3, 0x28, 0x00])]);

// Every message the fake Eos received that is not a read, /eos/get/..., each as its address and arguments. With `from`,
// only those after that many messages, such as the ones of a second run.
const writes = (eos: FakeEos, from = 0) =>
  eos.received
    .slice(from)
    .filter((message) => !message.address.startsWith('/eos/get/'))
    .map((message) => [message.address, ...message.args]);
// The text of every Copy To the fake Eos received on the command line, in order.
const copyCommands = (eos: FakeEos, from = 0) => writes(eos, from).flatMap(([address, text]) => (address === '/eos/newcmd' && String(text).includes('Copy_To') ? [String(text)] : []));

// A stage with the weekly show file for `date` in its show folder, a fake Eos that has that file open, on `show`, and a
// fake ProPresenter. `sets` gives the stage another output root.
async function withShowOpen(
  date: string,
  show: FakeEosCue[],
  sets: (workspace: Workspace) => Workspace = (workspace) => workspace,
): Promise<{ workspace: Workspace; eos: FakeEos; pro: FakeProPresenter; config: string; weekly: string }> {
  const workspace = sets(stage());
  const weekly = await addWeeklyShow(workspace, date, '2026-10-15 20-00-00', showBytes('the weekly show file'));
  const { eos, pro, config } = await fakeEos(workspace);
  eos.setShow(show);
  eos.setShowPath(weekly);
  return { workspace, eos, pro, config, weekly };
}

// The six colour lights of config/lights.json.
const SIX = [1, 2, 3, 16, 17, 18];
// The levels of a template on the church show, each cue's own, every value one a float32 holds exactly. The six colour
// lights hold one colour on channels 1 to 3 and another on 16 to 18, from the first cue on, with an intensity above 0 in
// each song cue (1, 11 and 22). Cue 35, the first after the last song cue, holds no colour of its own, so it tracks.
// Cue 36 holds one of its own on channel 16. Channels 4 and 5 are colour lights the lights step leaves alone, and
// channel 24 is a dimmer.
const FRONT: [number, number, number] = [2.5, 0, 100];
const BACK: [number, number, number] = [50.5, 50.75, 100];
const each = (channels: number[], levels: FakeEosLevels) => Object.fromEntries(channels.map((channel) => [channel, levels]));
const TEMPLATE_LEVELS: Record<string, Record<number, FakeEosLevels>> = {
  '0.5': { ...each([1, 2, 3], { intensity: 0, colour: FRONT }), ...each([16, 17, 18], { intensity: 30, colour: BACK }), 4: { intensity: 40, colour: [10, 20, 30] }, 5: { intensity: 45, colour: [15, 25, 35] }, 24: { intensity: 75 } },
  '1': { ...each([1, 2, 3], { intensity: 62 }), ...each([16, 17, 18], { intensity: 63 }) },
  '11': { ...each([1, 2, 3], { intensity: 70 }), ...each([16, 17, 18], { intensity: 71 }), 4: { colour: [40, 50, 60] } },
  '22': { ...each([1, 2, 3], { intensity: 80 }), ...each([16, 17, 18], { intensity: 81 }), 24: { intensity: 20 } },
  '35': { 1: { intensity: 0 }, 16: { intensity: 0 }, 17: { intensity: 59 }, 18: { intensity: 71 }, 24: { intensity: 100 } },
  '36': { 2: { intensity: 46 }, 3: { intensity: 46 }, 16: { intensity: 50, colour: FRONT } },
};

// A song's line of the summary, read: its number, title and cue, its colour as hue and as red, green and blue, and the
// background file.
type SongLine = { position: number; title: string; cue: string; hue: number; rgb: number[]; file: string };
function songLines(stdout: string): SongLine[] {
  return stdout.split('\n').flatMap((line) => {
    const read = /^(\d+)\. (.+) {2}cue (\S+) {2}hue (\d+), red (\d+) green (\d+) blue (\d+) {2}(.+)$/.exec(line);
    return read ? [{ position: Number(read[1]), title: read[2]!, cue: read[3]!, hue: Number(read[4]), rgb: [Number(read[5]), Number(read[6]), Number(read[7])], file: read[8]! }] : [];
  });
}

// The line of a song that keeps the template's colour, read: its number, title and cue, and why it has no colour of its
// own, with its background file when it has one.
type TemplateLine = { position: number; title: string; cue: string; why: string };
function templateLines(stdout: string): TemplateLine[] {
  return stdout.split('\n').flatMap((line) => {
    const read = /^(\d+)\. (.+) {2}cue (\S+) {2}template colour {2}(.+)$/.exec(line);
    return read ? [{ position: Number(read[1]), title: read[2]!, cue: read[3]!, why: read[4]! }] : [];
  });
}

// A hue at that saturation and full value as red, green and blue percentages, by the test's own arithmetic.
function colourOf(hue: number, saturation = 80): number[] {
  const sector = hue / 60;
  const rising = 1 - Math.abs((sector % 2) - 1);
  const pure = [[1, rising, 0], [rising, 1, 0], [0, 1, rising], [0, rising, 1], [rising, 0, 1], [1, 0, rising]][Math.floor(sector) % 6]!;
  return pure.map((part) => 100 - saturation + saturation * part);
}

// A colour the fake Eos holds is the one sent as a float32, so it is compared to a thousandth.
function expectColour(held: FakeEosLevels | undefined, colour: number[], where: string): void {
  expect(held?.colour, where).toBeDefined();
  for (const [at, part] of colour.entries()) expect(held!.colour![at], where).toBeCloseTo(part, 3);
}

// The one line a run with a problem prints on stderr, with no stack.
function problemLine(result: Result): string {
  expect(result.stderr).not.toMatch(/^\s+at /m);
  const lines = result.stderr.trimEnd().split('\n');
  expect(lines, result.stderr).toHaveLength(1);
  return lines[0] ?? '';
}

type Result = { code: number | null; stdout: string; stderr: string };

// The command through the package.json script, with pnpm's own output silenced. `env` is added to its environment. HOME
// is the workspace, so a default the command took from the home folder would be a path in the workspace too.
// EOS_SETTLE_MS is 0: the mode waits a second after each Go To Cue for the real Eos, and the fake answers at once.
// PROPRESENTER_AGAIN_MS is 0: the mode waits a second before it asks ProPresenter for a picture again, and the fake
// gives the next answer at once.
function run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Result> {
  return output(spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, HOME: shared.dir, EOS_SETTLE_MS: '0', PROPRESENTER_AGAIN_MS: '0', ...env } }));
}

function output(child: ChildProcessWithoutNullStreams): Promise<Result> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// A build's paths, each inside the workspace, the show folder among them.
const buildPaths = (workspace: Workspace) => [
  '--library',
  workspace.library,
  '--template',
  workspace.template,
  '--output-root',
  workspace.outputRoot,
  '--set-manifest',
  workspace.setManifest,
  '--show-folder',
  workspace.showFolder,
];

// The command reads config/lights.json beside its own source, so each case runs a copy of src/ in the workspace with its
// own config/ beside it: the repo's stem map, and the lights config of the case, as the lights config cases of
// set-builder-weekly-show.test.ts do.
describe('pnpm build-set, the song cue label of the lights config', () => {
  const SHAPE = 'config/lights.json must give songCueLabel as the label of a song cue in quotes, with {n} where the number of the song goes, such as "Song {n}":';
  const NAMES = { templateShowName: 'Church Sunday template', weeklyShowNamePrefix: 'Church Sunday' };

  it.each([
    { name: 'gives no songCueLabel', config: NAMES, line: `${SHAPE} songCueLabel is missing.` },
    { name: 'gives songCueLabel as a list', config: { ...NAMES, songCueLabel: ['Song {n}'] }, line: `${SHAPE} songCueLabel is a list.` },
    { name: 'gives a songCueLabel with no {n} in it', config: { ...NAMES, songCueLabel: 'Song 1' }, line: `${SHAPE} songCueLabel holds no {n}.` },
  ])('prints one problem line without a stack, exits 1, builds no set and makes no copy when config/lights.json $name', { timeout: 30_000 }, async ({ config, line }) => {
    const workspace = await createWorkspace();
    const app = join(workspace.dir, 'app');
    await cp(join(REPO_ROOT, 'src'), join(app, 'src'), { recursive: true });
    await mkdir(join(app, 'config'));
    await cp(join(REPO_ROOT, 'config/stem-map.json'), join(app, 'config/stem-map.json'));
    await writeFile(join(app, 'config/lights.json'), `${JSON.stringify(config, null, 2)}\n`);
    await addTemplateShow(workspace, '2026-11-10 09-00-00', 'the template show file');
    const before = await snapshotFolder(workspace.showFolder);

    const result = await output(spawn(process.execPath, [join(app, 'src/set-builder/main.ts'), 'grace', '--date', DATE, ...buildPaths(workspace)], { cwd: workspace.dir }));

    expect(result.stderr.trimEnd()).toBe(line);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(existsSync(projectFolder(workspace))).toBe(false);
    expect(existsSync(workspace.setManifest)).toBe(false);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });

  it('stops the lights mode on a lights config with a problem too, with the same one line, before it reads the set or connects to Eos', { timeout: 30_000 }, async () => {
    const workspace = stage();
    const app = join(workspace.dir, `app ${stages}`);
    await cp(join(REPO_ROOT, 'src'), join(app, 'src'), { recursive: true });
    await mkdir(join(app, 'config'));
    await writeFile(join(app, 'config/lights.json'), `${JSON.stringify(NAMES, null, 2)}\n`);
    const { eos, config } = await fakeEos(workspace);

    const result = await output(
      spawn(process.execPath, [join(app, 'src/set-builder/main.ts'), '--lights', '--date', '2027-01-03', ...lightsPaths(workspace, config)], { cwd: workspace.dir, env: { ...process.env, HOME: workspace.dir } }),
    );

    expect(problemLine(result)).toBe(`${SHAPE} songCueLabel is missing.`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.accepted()).toBe(0);
    expect(existsSync(workspace.showFolder)).toBe(false);
  });

  it('gives "Song {n}" in the repository, beside the two show names, the six colour channels and the saturation', async () => {
    expect(JSON.parse(await readFile(join(REPO_ROOT, 'config/lights.json'), 'utf8'))).toEqual({ ...NAMES, songCueLabel: 'Song {n}', colourChannels: [1, 2, 3, 16, 17, 18], saturation: 80 });
  });
});

// A copy of src/ in the workspace with a config/ of its own beside it, the repo's stem map and that lights config, since
// the command reads config/lights.json beside its own source. Returns the copy's main.ts, to run with node.
async function appWith(workspace: Workspace, lights: unknown): Promise<string> {
  stages += 1;
  const app = join(workspace.dir, `app ${stages}`);
  await cp(join(REPO_ROOT, 'src'), join(app, 'src'), { recursive: true });
  await mkdir(join(app, 'config'));
  await cp(join(REPO_ROOT, 'config/stem-map.json'), join(app, 'config/stem-map.json'));
  await writeFile(join(app, 'config/lights.json'), `${JSON.stringify(lights, null, 2)}\n`);
  return join(app, 'src/set-builder/main.ts');
}

describe('pnpm build-set, the colour channels and the saturation of the lights config', () => {
  const CHANNELS = 'config/lights.json must give colourChannels as the channels of the colour lights, a list of whole numbers from 1 with none twice, such as [1, 2, 3, 16, 17, 18]:';
  const SATURATION = 'config/lights.json must give saturation as the saturation the colour lights take, a number from 0 to 100, such as 80:';
  const GOOD = { templateShowName: 'Church Sunday template', weeklyShowNamePrefix: 'Church Sunday', songCueLabel: 'Song {n}', colourChannels: [1, 2, 3, 16, 17, 18], saturation: 80 };
  const without = (key: keyof typeof GOOD) => Object.fromEntries(Object.entries(GOOD).filter(([name]) => name !== key));

  it.each([
    { name: 'gives no colourChannels', config: without('colourChannels'), line: `${CHANNELS} colourChannels is missing.` },
    { name: 'gives colourChannels as a string', config: { ...GOOD, colourChannels: '1-3' }, line: `${CHANNELS} colourChannels is a string.` },
    { name: 'gives an empty colourChannels', config: { ...GOOD, colourChannels: [] }, line: `${CHANNELS} colourChannels is empty.` },
    { name: 'gives a channel that is no whole number', config: { ...GOOD, colourChannels: [1, 2.5] }, line: `${CHANNELS} colourChannels holds 2.5.` },
    { name: 'gives a channel 0', config: { ...GOOD, colourChannels: [0, 1] }, line: `${CHANNELS} colourChannels holds 0.` },
    { name: 'gives a channel in quotes', config: { ...GOOD, colourChannels: [1, '2'] }, line: `${CHANNELS} colourChannels holds "2".` },
    { name: 'gives a channel twice', config: { ...GOOD, colourChannels: [1, 2, 1] }, line: `${CHANNELS} colourChannels holds 1 twice.` },
    { name: 'gives no saturation', config: without('saturation'), line: `${SATURATION} saturation is missing.` },
    { name: 'gives saturation in quotes', config: { ...GOOD, saturation: '80' }, line: `${SATURATION} saturation is a string.` },
    { name: 'gives a saturation over 100', config: { ...GOOD, saturation: 120 }, line: `${SATURATION} saturation is 120.` },
    { name: 'gives a saturation under 0', config: { ...GOOD, saturation: -1 }, line: `${SATURATION} saturation is -1.` },
  ])('prints one problem line without a stack, exits 1, builds no set and makes no copy when config/lights.json $name', { timeout: 30_000 }, async ({ config, line }) => {
    const workspace = await createWorkspace();
    const main = await appWith(workspace, config);
    await addTemplateShow(workspace, '2026-11-10 09-00-00', 'the template show file');
    const before = await snapshotFolder(workspace.showFolder);

    const result = await output(spawn(process.execPath, [main, 'grace', '--date', DATE, ...buildPaths(workspace)], { cwd: workspace.dir }));

    expect(problemLine(result)).toBe(line);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(existsSync(projectFolder(workspace))).toBe(false);
    expect(existsSync(workspace.setManifest)).toBe(false);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });

  it('stops the lights mode on them too, with the same one line, before it reads the set or connects to Eos', { timeout: 30_000 }, async () => {
    const workspace = stage();
    const main = await appWith(workspace, { ...GOOD, saturation: 120 });
    const { eos, config } = await fakeEos(workspace);

    const result = await output(spawn(process.execPath, [main, '--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], { cwd: workspace.dir, env: { ...process.env, HOME: workspace.dir } }));

    expect(problemLine(result)).toBe(`${SATURATION} saturation is 120.`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.accepted()).toBe(0);
    expect(existsSync(workspace.showFolder)).toBe(false);
  });
});

describe('pnpm build-set --lights, its usage errors', { timeout: 30_000 }, () => {
  // A connections config path in the workspace that names no file: each of these runs stops before it reads one.
  const paths = (workspace: Workspace) => lightsPaths(workspace, join(workspace.dir, 'no-connections.json'));

  it.each([
    { name: 'a song name', args: ['--lights', 'grace'], problem: '--lights labels the song cues of the set built for the date and takes no song name, not "grace".' },
    { name: '--plan', args: ['--lights', '--plan'], problem: '--lights takes only --date, --output-root, --show-folder, --connections-config and --playlist, not --plan.' },
    { name: '--library', args: ['--lights', '--library', 'songs'], problem: '--lights takes only --date, --output-root, --show-folder, --connections-config and --playlist, not --library.' },
    { name: '--replace', args: ['--lights', '--replace', 'a set folder'], problem: '--lights takes only --date, --output-root, --show-folder, --connections-config and --playlist, not --replace.' },
    { name: '--set-manifest', args: ['--lights', '--set-manifest', 'set-manifest.json'], problem: '--lights takes only --date, --output-root, --show-folder, --connections-config and --playlist, not --set-manifest.' },
    { name: '--pad', args: ['--lights', '--pad', '1'], problem: '--lights takes only --date, --output-root, --show-folder, --connections-config and --playlist, not --pad.' },
    { name: 'a --date that is no date', args: ['--lights', '--date', '2026-02-30'], problem: '--date must be a real date written YYYY-MM-DD, not 2026-02-30.' },
    { name: 'a --playlist that names no playlist', args: ['--lights', '--playlist', ''], problem: "--playlist names no playlist. Give it the playlist's name: --playlist <name>." },
    { name: 'a --playlist of spaces alone', args: ['--lights', '--playlist', '  '], problem: "--playlist names no playlist. Give it the playlist's name: --playlist <name>." },
  ])('stops on $name with one line and the usage text, exit 2, and prints nothing else', async ({ args, problem }) => {
    const workspace = stage();

    const result = await run([...args, ...paths(workspace)]);

    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(existsSync(workspace.showFolder)).toBe(false);
  });

  // Each other mode is found first, so it stops on --lights with its own line, as it stops on any flag it does not take.
  // These runs cannot name --connections-config, which each mode would stop on first, being earlier in the flags' order.
  // The lights mode never starts in them, and with HOME as the workspace its default connections config is a path in the
  // workspace that names no file.
  it.each([
    { mode: '--list', args: ['--list'], problem: '--list takes only --library, --pads, --date, --replace and --output-root, not --lights.' },
    {
      mode: '--plan --list',
      args: ['--plan', '--list'],
      problem: '--plan --list takes only --library, --pads, --template, --date, --service-type, --plan-id, --overlap, --pad, --gap, --replace and --output-root, not --lights.',
    },
    { mode: '--skeleton', args: ['--skeleton', 'grace'], problem: '--skeleton takes only --library and --pads, not --lights.' },
    { mode: '--plan --skeleton', args: ['--plan', '--skeleton'], problem: '--plan --skeleton takes only --library, --pads, --date, --service-type and --plan-id, not --lights.' },
  ])('is no flag of $mode, which stops on it with its own usage message, exit 2', async ({ args, problem }) => {
    const workspace = stage();

    const result = await run([...args, '--lights', '--library', workspace.library], { PCO_ENV: join(workspace.dir, 'pco.env') });

    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
  });

  it('stops a build that names a playlist, which only the lights mode reads: --playlist needs --lights', async () => {
    const workspace = stage();

    const result = await run(['grace', '--date', '2026-12-06', ...buildPaths(workspace), '--playlist', 'November 15, 2026']);

    expect(result.stderr.startsWith('--playlist needs --lights.\n\nUsage:'), result.stderr).toBe(true);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(existsSync(projectFolder(workspace, '2026-12-06'))).toBe(false);
  });

  it('stops a build that names a connections config, which only the lights mode reads: --connections-config needs --lights', async () => {
    const workspace = stage();

    const result = await run(['grace', '--date', '2026-12-06', ...buildPaths(workspace), '--connections-config', join(workspace.dir, 'no-connections.json')]);

    expect(result.stderr.startsWith('--connections-config needs --lights.\n\nUsage:'), result.stderr).toBe(true);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(existsSync(projectFolder(workspace, '2026-12-06'))).toBe(false);
  });
});

describe('pnpm build-set --lights, a date with no set to read', { timeout: 30_000 }, () => {
  // A Sunday no test builds a set for.
  const NO_SET = '2027-01-03';

  it.each([
    {
      name: 'has no set built for it',
      set: async () => {},
      line: (path: string) => `The lights step is not done: no set is built for 2027-01-03, since ${path} is not there. Build the set, then run the lights step again.`,
    },
    {
      name: 'has a set that is no Live set',
      set: async (path: string) => {
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, 'not a Live set\n');
      },
      line: (path: string) => ({ start: `The lights step is not done: the set built for 2027-01-03, ${path}, cannot be read: ` }),
    },
    {
      // The template project is a Live set with no locators.
      name: 'has a set with no song in it',
      set: async (path: string) => {
        await mkdir(join(path, '..'), { recursive: true });
        await cp(shared.template, path);
      },
      line: (path: string) => `The lights step is not done: the set built for 2027-01-03, ${path}, holds no song: none of its locators reads as "<song number> - <section name>".`,
    },
  ])('says so in one line, exits 1, connects to no Eos and leaves the show folder as it was when the date $name', async ({ set, line }) => {
    const workspace = { ...stage(), outputRoot: join(shared.dir, `Sets ${stages}`) };
    const path = setPath(workspace, NO_SET);
    expect(path).toBe(join(workspace.outputRoot, '2027-01-03 Sunday/2027-01-03 Sunday.als'));
    await set(path);
    await addTemplateShow(workspace, '2026-11-10 09-00-00', 'the template show file');
    await addWeeklyShow(workspace, NO_SET, '2026-12-30 20-00-00', 'the weekly show file');
    const before = await snapshotFolder(workspace.showFolder);
    const { eos, config } = await fakeEos(workspace);

    const result = await run(['--lights', '--date', NO_SET, ...lightsPaths(workspace, config)]);

    const expected = line(path);
    if (typeof expected === 'string') expect(problemLine(result)).toBe(expected);
    else expect(problemLine(result).startsWith(expected.start) && problemLine(result).length > expected.start.length + 1, result.stderr).toBe(true);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.accepted()).toBe(0);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

describe('pnpm build-set --lights, a connections config that names no Eos', { timeout: 30_000 }, () => {
  const NO_EOS = 'names no Eos to connect to:';

  // Every file names the fake Eos's port, never Eos's own 3032, so a run that connected after all would reach the fake.
  it.each([
    { name: 'is not there', file: undefined, reason: 'the file is not there.' },
    { name: 'is not JSON', file: (port: number) => `{ "targets": { "eos": { "host": "127.0.0.1", "port": ${port}, "cueList": 1, } } }\n`, reason: /^The connections config file at .* is not valid JSON: \S/ },
    {
      name: 'has no "targets" object',
      file: (port: number) => `{ "eos": { "host": "127.0.0.1", "port": ${port}, "cueList": 1 } }\n`,
      reason: 'The connections config file needs a "targets" object, such as { "targets": { "propresenter": { ... } } }.',
    },
    { name: 'has no "eos" section', file: (port: number) => `{ "targets": { "lights": { "host": "127.0.0.1", "port": ${port}, "cueList": 1 } } }\n`, reason: 'it has no "eos" section under "targets".' },
    { name: 'has an "eos" section that is no object', file: (port: number) => `{ "targets": { "eos": ${port} } }\n`, reason: 'The "eos" section needs to be an object, such as { ... }.' },
    {
      name: 'has an "eos" section the server would not take, with cue list 0',
      file: (port: number) => `{ "targets": { "eos": { "host": "127.0.0.1", "port": ${port}, "cueList": 0 } } }\n`,
      reason: 'The lights\' "cueList" must be the number of the cue list to follow, a whole number such as 1.',
    },
  ])('says so in one line that names the file, exits 1, connects to no Eos and writes nothing when the file $name', async ({ file, reason }) => {
    const workspace = stage();
    await addTemplateShow(workspace, '2026-11-10 09-00-00', 'the template show file');
    const before = await snapshotFolder(workspace.showFolder);
    const { eos } = await fakeEos(workspace);
    const config = join(workspace.dir, `connections ${stages}.json`);
    if (file !== undefined) await writeFile(config, file(eos.port));

    const result = await run(['--lights', '--date', DATE, ...lightsPaths(workspace, config)]);

    const start = `The lights step is not done: the connections config file ${config} ${NO_EOS} `;
    const line = problemLine(result);
    expect(line.startsWith(start), line).toBe(true);
    if (typeof reason === 'string') expect(line.slice(start.length)).toBe(reason);
    else expect(line.slice(start.length)).toMatch(reason);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.accepted()).toBe(0);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

describe('pnpm build-set --lights, a date with no weekly show file yet', { timeout: 30_000 }, () => {
  it('makes the weekly show file from the template show file as the build does, names it and the three steps, and says in one line that the lights step is not done until it is open, exit 1, with nothing sent to Eos', async () => {
    const workspace = stage();
    const template = await addTemplateShow(workspace, '2026-11-10 09-00-00', showBytes('the template show file'));
    // A weekly show file of another Sunday is none of this date's.
    const other = await addWeeklyShow(workspace, TWO_SONGS, '2026-10-20 20-00-00', showBytes('the show of another Sunday'));
    const { eos, config } = await fakeEos(workspace);
    eos.setShow(CHURCH_SHOW);
    eos.setShowPath(other);

    const result = await run(['--lights', '--date', DATE, ...lightsPaths(workspace, config)]);

    const made = (await readdir(workspace.showFolder)).filter((name) => ![basename(template), basename(other)].includes(name));
    expect(made).toHaveLength(1);
    const [weekly = ''] = made;
    expect(weekly).toMatch(/^Church Sunday 2026-10-18 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.esf3d$/);
    expect((await readFile(join(workspace.showFolder, weekly))).equals(showBytes('the template show file'))).toBe(true);
    expect(result.stdout).toBe([`Weekly show file: ${join(workspace.showFolder, weekly)}`, `Open it in ETCnomad: File, Open; ${weekly}; OK.`, ''].join('\n'));
    expect(problemLine(result)).toBe('The lights step is not done: the weekly show file for 2026-10-18 was made just now, so it is not the show open in Eos. Open it, then run the lights step again.');
    expect(result.code).toBe(1);
    expect(writes(eos)).toEqual([]);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.saves()).toBe(0);
  });

  it.each([
    { name: 'holds no template show file either', showFolder: async (workspace: Workspace) => void (await addShowFile(workspace, 'Church Sunday 2026-11-08', '2026-11-12 14-10-52', showBytes('the church show'))) },
    { name: 'is not there', showFolder: async () => {} },
  ])('makes nothing and says in one line that no template show file was found, exit 1, when the show folder $name', async ({ showFolder }) => {
    const workspace = stage();
    await showFolder(workspace);
    const before = await snapshotFolder(workspace.showFolder);
    const { eos, config } = await fakeEos(workspace);

    const result = await run(['--lights', '--date', DATE, ...lightsPaths(workspace, config)]);

    expect(problemLine(result)).toBe(`The lights step is not done: no template show file named "Church Sunday template" was found in ${workspace.showFolder}.`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.accepted()).toBe(0);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });

  it('says in one line that names the show folder and the cause, exit 1, when the show folder is a file', async () => {
    const workspace = stage();
    await writeFile(workspace.showFolder, 'a file where the show folder should be\n');
    const { eos, config } = await fakeEos(workspace);

    const result = await run(['--lights', '--date', DATE, ...lightsPaths(workspace, config)]);

    const start = `The lights step is not done: the weekly show file for 2026-10-18 cannot be found or made in ${workspace.showFolder}: `;
    const line = problemLine(result);
    expect(line.startsWith(start) && line.endsWith('.'), line).toBe(true);
    expect(line.slice(start.length)).toContain('ENOTDIR');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.accepted()).toBe(0);
    expect(await readFile(workspace.showFolder, 'utf8')).toBe('a file where the show folder should be\n');
  });
});

describe('pnpm build-set --lights, an Eos that does not answer', { timeout: 30_000 }, () => {
  it.each([
    { name: 'refuses the connection, as a Mac with ETCnomad closed does', refusing: true, env: {} },
    // The time limit is 3 seconds; EOS_TIMEOUT_MS makes it short for the test.
    { name: 'takes the connection and sends nothing', refusing: false, env: { EOS_TIMEOUT_MS: '300' } },
  ])('says in one line that the lights step is not done and that Eos at its address did not answer, exit 1, when Eos $name', async ({ refusing, env }) => {
    const workspace = stage();
    const weekly = await addWeeklyShow(workspace, DATE, '2026-10-15 20-00-00', showBytes('the weekly show file'));
    const before = await snapshotFolder(workspace.showFolder);
    const { eos, config } = await fakeEos(workspace, { refusing });
    eos.setShow(CHURCH_SHOW);
    eos.setShowPath(weekly);
    eos.silence();

    const result = await run(['--lights', '--date', DATE, ...lightsPaths(workspace, config)], env);

    expect(problemLine(result)).toBe(`The lights step is not done: Eos at 127.0.0.1:${eos.port} did not answer.`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.received).toEqual([]);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

describe('pnpm build-set --lights, another show open in Eos', { timeout: 30_000 }, () => {
  it.each([
    {
      name: 'a show of another name',
      open: (workspace: Workspace) => addShowFile(workspace, 'Church Sunday 2026-11-08', '2026-11-12 14-10-52', showBytes('the church show')),
    },
    {
      name: 'an older weekly show file of the same date',
      open: (workspace: Workspace) => addWeeklyShow(workspace, DATE, '2026-10-15 20-00-00', showBytes('the weekly show file as the build made it')),
    },
    {
      name: 'the weekly show file of another Sunday',
      open: (workspace: Workspace) => addWeeklyShow(workspace, TWO_SONGS, '2026-10-16 21-00-00', showBytes('the show of another Sunday')),
    },
  ])('writes nothing, names the open show in one line, exit 1, and names the newest weekly show file and the three steps, with $name open', async ({ open }) => {
    const workspace = stage();
    const opened = await open(workspace);
    const newest = await addWeeklyShow(workspace, DATE, '2026-10-16 08-30-00', showBytes('the weekly show file as Eos saved it'));
    const before = await snapshotFolder(workspace.showFolder);
    const { eos, pro } = await fakeEos(workspace);
    // The server's connections config holds more than the lights and ProPresenter: the mode reads those two sections alone.
    const config = await writeConnectionsConfig(workspace, eos.port, pro.port, { atem: { host: '127.0.0.1' } });
    eos.setShow(CHURCH_SHOW);
    eos.setShowPath(opened);

    const result = await run(['--lights', '--date', DATE, ...lightsPaths(workspace, config)]);

    expect(problemLine(result)).toBe(
      `The lights step is not done: the show open in Eos is ${opened}, not the weekly show file for 2026-10-18. Open the weekly show file, then run the lights step again.`,
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe([`Weekly show file: ${newest}`, 'Open it in ETCnomad: File, Open; Church Sunday 2026-10-18 2026-10-16 08-30-00.esf3d; OK.', ''].join('\n'));
    expect(writes(eos)).toEqual([]);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.saves()).toBe(0);
    expect(pro.requests).toEqual([]);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

describe('pnpm build-set --lights, a command line that does not read LIVE', { timeout: 30_000 }, () => {
  it('writes nothing and says in one line what the command line reads, exit 1', async () => {
    const { workspace, eos, config } = await withShowOpen(DATE, CHURCH_SHOW);
    // The line the Cue List Index left on the command line on 2026-11-02 (test/fixtures/eos/README.md).
    eos.setCommandLine('BLIND: Cue  1 / : Cue 1 / Back From First Wrap #');
    const before = await snapshotFolder(workspace.showFolder);

    const result = await run(['--lights', '--date', DATE, ...lightsPaths(workspace, config)]);

    expect(problemLine(result)).toBe(
      'The lights step is not done: the command line in Eos does not read LIVE, it reads "BLIND: Cue  1 / : Cue 1 / Back From First Wrap #". Put Eos in Live, then run the lights step again.',
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(writes(eos)).toEqual([]);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.saves()).toBe(0);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

describe('pnpm build-set --lights, a cue list with no cue for a song', { timeout: 30_000 }, () => {
  const relabelled = (labels: Record<string, string>) => CHURCH_SHOW.map((cue) => ({ ...cue, label: labels[cue.number] ?? cue.label }));

  it.each([
    {
      name: 'no cue labelled "Song 1"',
      show: relabelled({ '1': 'Opener' }),
      line: 'The lights step is not done: cue list 1 has no cue labelled "Song 1" (song 1, This Is Amazing Grace).',
    },
    {
      // A gap: song 3 has a cue, so song 2 is no song past the last song cue, and no copy would keep the songs in order.
      name: 'a cue for songs 1 and 3 and none for song 2',
      show: relabelled({ '11': 'Interlude' }),
      line: 'The lights step is not done: cue list 1 has no cue labelled "Song 2" (song 2, Great Are You Lord).',
    },
    {
      name: 'no song cue at all',
      show: relabelled({ '1': '', '11': 'Song 22', '22': 'Song' }),
      line: 'The lights step is not done: cue list 1 has no cue labelled "Song 1" (song 1, This Is Amazing Grace), "Song 2" (song 2, Great Are You Lord) or "Song 3" (song 3, Goodness of God).',
    },
  ])('writes no label, not even of a song that has a cue, copies no cue, and says in one line which is missing, exit 1, with $name', async ({ show, line }) => {
    const { workspace, eos, pro, config } = await withShowOpen(DATE, show);
    const before = await snapshotFolder(workspace.showFolder);

    const result = await run(['--lights', '--date', DATE, ...lightsPaths(workspace, config)]);

    expect(problemLine(result)).toBe(line);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(writes(eos)).toEqual([]);
    expect(eos.cues()).toEqual(show);
    expect(eos.saves()).toBe(0);
    expect(pro.requests).toEqual([]);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

describe('pnpm build-set --lights, a connections config that names no ProPresenter', { timeout: 30_000 }, () => {
  it.each([
    { name: 'has no "propresenter" section', section: undefined, reason: 'it has no "propresenter" section under "targets".' },
    { name: 'has a "propresenter" section the server would not take, with no host', section: { port: 50001 }, reason: 'ProPresenter\'s "host" must be its address, such as "192.168.10.50".' },
  ])('says so in one line that names the file, exits 1, connects to neither and writes nothing when the file $name', async ({ section, reason }) => {
    const workspace = stage();
    await addTemplateShow(workspace, '2026-11-10 09-00-00', 'the template show file');
    const before = await snapshotFolder(workspace.showFolder);
    const { eos, pro } = await fakeEos(workspace);
    const config = join(workspace.dir, `connections ${stages}.json`);
    await writeFile(config, `${JSON.stringify({ targets: { eos: { host: '127.0.0.1', port: eos.port, cueList: 1 }, ...(section === undefined ? {} : { propresenter: section }) } })}\n`);

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)]);

    expect(problemLine(result)).toBe(`The lights step is not done: the connections config file ${config} names no ProPresenter to connect to: ${reason}`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.accepted()).toBe(0);
    expect(pro.requests).toEqual([]);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

// The title each song's Count Off locator carries in the set built for `date`, in set order, read from the Live set with
// the harness, not through src/.
async function titlesInSet(date: string, workspace = shared): Promise<string[]> {
  const locators = locatorList(await readSet(setPath(workspace, date)));
  return locators.flatMap(({ name }) => /^\d+ - Count Off \((.*)\)$/.exec(name)?.[1] ?? []);
}

// What a run of the mode leaves that a test compares with another run's: the levels of every cue, and the songs' lines.
type End = { levels: ReturnType<FakeEos['levels']>; songs: SongLine[]; result: Result; eos: FakeEos; workspace: Workspace; weekly: string; before: ReturnType<FakeEos['levels']> };

// The set of three songs with pictures, run on the church show with the template's levels, or with the levels given.
async function threePictures(prepare: (fakes: { eos: FakeEos; pro: FakeProPresenter }) => void = () => {}, template = TEMPLATE_LEVELS): Promise<End> {
  const { workspace, eos, pro, config, weekly } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
  eos.setLevels(template);
  const before = eos.levels();
  prepare({ eos, pro });
  const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)]);
  return { levels: eos.levels(), songs: songLines(result.stdout), result, eos, workspace, weekly, before };
}

// An ordinary run of the set of three, each song with its recorded picture, run once for the tests that compare a run
// with it.
let ordinaryRun: Promise<End> | undefined;
const ordinary = () => (ordinaryRun ??= threePictures());

describe('pnpm build-set --lights, with the newest weekly show file open in Eos', { timeout: 60_000 }, () => {
  it("labels the cue of each song with its title and gives the six colour lights in it the hue of the song's picture at saturation 80, records the template's colour back into the first cue after the last song cue, changes no intensity, no other channel and no other cue, saves, and prints each song with its cue, its colour and its background file, then the saved show file", async () => {
    expect(await titlesInSet(THREE_PICTURES)).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);

    const { result, songs, levels, before, eos, workspace, weekly } = await threePictures();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues()).toEqual([
      { number: '0.5', label: 'Walk-in' },
      { number: '1', label: 'This Is Amazing Grace' },
      { number: '11', label: 'Yes and Amen' },
      { number: '22', label: 'I Speak Jesus' },
      { number: '35', label: 'Closing' },
      { number: '36', label: 'Meet and greet' },
      { number: '37', label: 'Speaker' },
      { number: '38', label: 'Walk-out' },
    ]);
    // Each song's line: its number, its title, its cue, its colour and the label of its presentation's first slide.
    expect(songs.map(({ position, title, cue, file }) => [position, title, cue, file])).toEqual([
      [1, 'This Is Amazing Grace', '1/1', 'OceanWaves_01_4K.mp4'],
      [2, 'Yes and Amen', '1/11', 'Blossom_01_4K.mp4'],
      [3, 'I Speak Jesus', '1/22', 'CityRain_09_4K.mp4'],
    ]);
    // Each hue is the colour its picture shows: tan rock, pink flowers, and the little colour of a grey city in rain.
    const [grace, amen, jesus] = songs.map(({ hue }) => hue);
    expect(grace).toBeGreaterThanOrEqual(20);
    expect(grace).toBeLessThanOrEqual(50);
    expect(amen! >= 350 || amen! <= 20, String(amen)).toBe(true);
    expect(jesus).toBeGreaterThanOrEqual(15);
    expect(jesus).toBeLessThanOrEqual(45);
    // Each song cue holds, on the six, the hue its line prints at saturation 80 and full value, and the line's red,
    // green and blue are that colour in whole percentages. Its intensities and its other channels are the template's.
    for (const [at, cue] of ['1', '11', '22'].entries()) {
      const colour = colourOf(songs[at]!.hue);
      expect(songs[at]!.rgb).toEqual(colour.map(Math.round));
      expect(Math.max(...colour)).toBe(100);
      expect(Math.min(...colour)).toBeCloseTo(20, 6);
      for (const channel of SIX) {
        expectColour(levels[cue]![channel], colour, `cue ${cue} channel ${channel}`);
        expect(levels[cue]![channel]!.intensity).toBe(before[cue]![channel]!.intensity);
        expect(before[cue]![channel]!.intensity).toBeGreaterThan(0);
      }
      for (const channel of [4, 5, 24]) expect(levels[cue]![channel]).toEqual(before[cue]![channel]);
    }
    // The first cue after the last song cue holds the template's colours, one on channels 1 to 3 and another on 16 to
    // 18, though the cue before it now holds song 3's: they are its own. Every other cue is as it was.
    for (const channel of SIX) expect(levels['35']![channel]!.colour).toEqual(channel < 4 ? FRONT : BACK);
    for (const cue of ['0.5', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    // Of what Eos received, nothing sets an intensity or names a channel that is not one of the six, and the only
    // command line commands go to a cue or record the six into one.
    const sent = writes(eos);
    for (const [address, ...args] of sent) {
      if (String(address).startsWith('/eos/chan/')) expect(address).toMatch(/^\/eos\/chan\/(1|2|3|16|17|18)\/param\/red\/green\/blue$/);
      else if (address === '/eos/newcmd') expect(args[0]).toMatch(/^(Go_To_Cue 1 \/ (1|11|22|35) Time 0|Chan 1 Thru 3 \+ 16 Thru 18 Record_Only Cue 1 \/ (1|11|22|35))#$/);
      else if (address === '/eos/cmd') expect(args).toEqual(['Enter']);
      else expect(String(address)).toMatch(/^\/eos\/(set\/cue\/1\/(1|11|22)\/label|key\/(shift|update))$/);
    }
    expect(sent.filter(([address]) => String(address).startsWith('/eos/set/')).toSorted()).toEqual([
      ['/eos/set/cue/1/1/label', 'This Is Amazing Grace'],
      ['/eos/set/cue/1/11/label', 'Yes and Amen'],
      ['/eos/set/cue/1/22/label', 'I Speak Jesus'],
    ]);
    expect(eos.saves()).toBe(1);
    const saved = eos.showPath() ?? '';
    // The save made a new file of the weekly show: not the file that was open, and not the path the saved event carries.
    expect(saved).toMatch(new RegExp(`^${workspace.showFolder}/Church Sunday 2026-11-15 \\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2}-\\d{2}\\.esf3d$`));
    expect(saved).not.toBe(weekly);
    expect(result.stdout.split('\n')).toHaveLength(5);
    expect(result.stdout.split('\n').slice(3)).toEqual([saved, '']);
    expect(result.stdout).not.toContain(join(workspace.showFolder, 'Church Sunday 2026-11-15.esf3d'));
  });

  it('records and saves on an Eos that keeps a level to a thousandth, where a colour does not read back as the float sent: each song cue holds its colour to that thousandth', async () => {
    const { result, songs, levels, eos } = await threePictures(({ eos }) => eos.roundColours());

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    // The run set a level a thousandth does not hold: without one, this Eos would read every float back as sent.
    const thousandth = (level: number) => Math.fround(Math.round(level * 1000) / 1000);
    const set = writes(eos).flatMap(([address, ...parts]) => (String(address).startsWith('/eos/chan/') ? (parts as number[]) : []));
    expect(set.some((level) => thousandth(level) !== level)).toBe(true);
    expect(songs).toHaveLength(3);
    for (const [at, cue] of ['1', '11', '22'].entries()) {
      const colour = colourOf(songs[at]!.hue).map(thousandth);
      for (const channel of SIX) expect(levels[cue]![channel]!.colour, `cue ${cue} channel ${channel}`).toEqual(colour);
    }
    for (const channel of SIX) expect(levels['35']![channel]!.colour).toEqual(channel < 4 ? FRONT : BACK);
    expect(eos.saves()).toBe(1);
  });

  it('writes no file: with an older weekly show file and the template beside the open one, the show folder is as it was', async () => {
    const { workspace, eos, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    await addWeeklyShow(workspace, THREE_PICTURES, '2026-10-14 09-00-00', showBytes('an older weekly show file'));
    await addTemplateShow(workspace, '2026-11-10 09-00-00', showBytes('the template show file'));
    const before = await snapshotFolder(workspace.showFolder);

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.saves()).toBe(1);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });

  it('gives the same end state with Record Confirm on, as the template has it, and with it off', async () => {
    const on = await threePictures();
    const off = await threePictures(({ eos }) => eos.setRecordConfirm(false));

    for (const { result } of [on, off]) {
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    }
    // With it on, each of the four Record Only commands got its Enter; with it off, none was sent.
    expect(writes(on.eos).filter(([address]) => address === '/eos/cmd')).toHaveLength(4);
    expect(writes(off.eos).filter(([address]) => address === '/eos/cmd')).toEqual([]);
    expect(off.levels).toEqual(on.levels);
    expect(off.levels).not.toEqual(off.before);
    expect(off.songs).toEqual(on.songs);
    expect(off.eos.cues()).toEqual(on.eos.cues());
    expect(off.eos.saves()).toBe(1);
  });

  it('finds the playlist when the date is its whole name, and when the date is part of a longer name', async () => {
    const whole = await threePictures();
    const part = await threePictures(({ pro }) => pro.renamePlaylist('5B02A251-921A-440A-A0C6-9FA5FF8C1A1A', 'Series Two - November 15, 2026'));

    for (const { result, songs } of [whole, part]) {
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(songs.map(({ file }) => file)).toEqual(['OceanWaves_01_4K.mp4', 'Blossom_01_4K.mp4', 'CityRain_09_4K.mp4']);
    }
    expect(part.songs).toEqual(whole.songs);
    expect(part.levels).toEqual(whole.levels);
  });

  it("gives a picture whose mean is close to white its water's hue: Ancient Gates is teal, and the next cue keeps the template's colour", async () => {
    const { workspace, eos, config } = await withShowOpen(ONE_PICTURE, CHURCH_SHOW);
    eos.setLevels(TEMPLATE_LEVELS);
    const before = eos.levels();
    expect(await titlesInSet(ONE_PICTURE)).toEqual(['Ancient Gates']);

    const result = await run(['--lights', '--date', ONE_PICTURE, ...lightsPaths(workspace, config)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const [song, ...others] = songLines(result.stdout);
    expect(others).toEqual([]);
    expect([song!.position, song!.title, song!.cue, song!.file]).toEqual([1, 'Ancient Gates', '1/1', 'TheCove_10_4K.mp4']);
    // Dark teal water under white surf: the mean of the picture is hue 358 at 3% saturation, close to white.
    expect(song!.hue).toBeGreaterThanOrEqual(170);
    expect(song!.hue).toBeLessThanOrEqual(200);
    const levels = eos.levels();
    for (const channel of SIX) expectColour(levels['1']![channel], colourOf(song!.hue), `channel ${channel}`);
    // Cue 11, the Song 2 cue this set has no song for, is the first cue after the last song cue: it holds the template's
    // colour as its own, and keeps its label.
    for (const cue of ['0.5', '11', '22', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    expect(eos.cues().map(({ label }) => label)).toEqual(['Walk-in', 'Ancient Gates', 'Song 2', 'Song 3', 'Closing', 'Meet and greet', 'Speaker', 'Walk-out']);
  });

  it('leaves the cue of a song the set does not have alone: a set of two songs keeps the label Song 3, and its colours', async () => {
    const { workspace, eos, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW, twoPictures);
    eos.setLevels(TEMPLATE_LEVELS);
    const before = eos.levels();
    expect(await titlesInSet(THREE_PICTURES, twoPictures(shared))).toEqual(['This Is Amazing Grace', 'Yes and Amen']);

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues().map(({ number, label }) => [number, label])).toEqual([
      ['0.5', 'Walk-in'],
      ['1', 'This Is Amazing Grace'],
      ['11', 'Yes and Amen'],
      ['22', 'Song 3'],
      ['35', 'Closing'],
      ['36', 'Meet and greet'],
      ['37', 'Speaker'],
      ['38', 'Walk-out'],
    ]);
    expect(songLines(result.stdout).map(({ position, title, cue }) => [position, title, cue])).toEqual([
      [1, 'This Is Amazing Grace', '1/1'],
      [2, 'Yes and Amen', '1/11'],
    ]);
    expect(result.stdout.split('\n').slice(2)).toEqual([eos.showPath(), '']);
    const levels = eos.levels();
    for (const cue of ['22', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    expect(levels['11']).not.toEqual(before['11']);
    // Nothing set the label of cue 22, and no cue was copied: the show holds the eight cues it had.
    expect(writes(eos).filter(([address]) => String(address).startsWith('/eos/set/')).map(([address]) => address)).toEqual(['/eos/set/cue/1/1/label', '/eos/set/cue/1/11/label']);
    expect(copyCommands(eos)).toEqual([]);
    expect(eos.cues()).toHaveLength(8);
  });

  it('finds a song cue by the shared name rule, in any letter case and spacing, and takes the first when two cues carry the label', async () => {
    const show = [
      { number: '1', label: ' song  1 ' },
      { number: '2', label: 'Song 1' },
      { number: '3', label: 'Song 2 reprise' },
      { number: '4.5', label: 'SONG 2' },
    ];
    const { workspace, eos, config } = await withShowOpen(THREE_PICTURES, show, twoPictures);

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues().map(({ number, label }) => [number, label])).toEqual([
      ['1', 'This Is Amazing Grace'],
      ['2', 'Song 1'],
      ['3', 'Song 2 reprise'],
      ['4.5', 'Yes and Amen'],
    ]);
    expect(songLines(result.stdout).map(({ position, title, cue }) => [position, title, cue])).toEqual([
      [1, 'This Is Amazing Grace', '1/1'],
      [2, 'Yes and Amen', '1/4.5'],
    ]);
  });
});

// A stage with the weekly show file for THREE_PICTURES open in a fake Eos on `show` with `levels`, for the set built
// under the output root `sets` gives. `lights` runs the mode on it, each time with the same paths.
async function onShow(sets: (workspace: Workspace) => Workspace, show: FakeEosCue[] = CHURCH_SHOW, levels = TEMPLATE_LEVELS) {
  const { workspace, eos, pro, config, weekly } = await withShowOpen(THREE_PICTURES, show, sets);
  eos.setLevels(levels);
  const before = eos.levels();
  const lights = (env: NodeJS.ProcessEnv = {}) => run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], env);
  return { workspace, eos, pro, weekly, before, lights };
}

// The church show with those labels in place of its own, and those cues added, in number order.
const churchShowWith = (labels: Record<string, string>, added: FakeEosCue[] = []) =>
  [...CHURCH_SHOW.map((cue) => ({ ...cue, label: labels[cue.number] ?? cue.label })), ...added].toSorted((a, b) => Number(a.number) - Number(b.number));

// The cue of every Record Only the fake Eos received on the command line, in order.
const recordOnlyCues = (eos: FakeEos, from = 0) => writes(eos, from).flatMap(([address, text]) => (address === '/eos/newcmd' ? (/Record_Only Cue 1 \/ (\S+)#$/.exec(String(text))?.[1] ?? []) : []));

// What a run left: the show's cues, every cue's levels, and how many messages the fake Eos has received.
const stateOf = (eos: FakeEos) => ({ cues: eos.cues(), levels: eos.levels(), received: eos.received.length });

// A second run of the mode on the show the first run wrote and saved. The fake Eos saves no file, it only changes its
// show path, so the test writes the file Eos's own save would have made, which the second run then finds as the newest
// weekly show file, the one open in Eos.
async function secondRun(eos: FakeEos, lights: () => Promise<Result>): Promise<Result> {
  await writeFile(eos.showPath()!, showBytes('the weekly show file as Eos saved it'));
  return lights();
}

// A second run finds each song's cue by its title, since no cue reads "Song 1" any more, and ends in the state the first
// run left (setlist-controller#503).
describe('pnpm build-set --lights, a second run on the weekly show file the first run saved', { timeout: 60_000 }, () => {
  it.each([
    { name: 'the set of three', sets: (workspace: Workspace) => workspace, cues: ['1/1', '1/11', '1/22'], song3: 'I Speak Jesus' },
    { name: 'the set of two, whose third song cue keeps its label Song 3 and its levels through both runs', sets: twoPictures, cues: ['1/1', '1/11'], song3: 'Song 3' },
  ])('copies no cue and ends with the cues, the labels and the levels of the first run, prints the same song lines, and saves again, exit 0, with $name', async ({ sets, cues, song3 }) => {
    const { eos, before, lights } = await onShow(sets);

    const first = await lights();
    const afterFirst = stateOf(eos);
    const saved = eos.showPath();
    const second = await secondRun(eos, lights);

    for (const result of [first, second]) {
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    }
    expect(eos.cues()).toEqual(afterFirst.cues);
    expect(eos.cues().map(({ number, label }) => [number, label]).slice(1, 4)).toEqual([['1', 'This Is Amazing Grace'], ['11', 'Yes and Amen'], ['22', song3]]);
    expect(eos.levels()).toEqual(afterFirst.levels);
    expect(eos.levels()).not.toEqual(before);
    if (song3 === 'Song 3') expect(eos.levels()['22']).toEqual(before['22']);
    expect(songLines(second.stdout)).toEqual(songLines(first.stdout));
    expect(songLines(second.stdout).map(({ cue }) => cue)).toEqual(cues);
    expect(copyCommands(eos)).toEqual([]);
    // The second run saved the show it had open, the file the first save made, as a newer file.
    expect(eos.saves()).toBe(2);
    expect(eos.showPath()).not.toBe(saved);
    expect(second.stdout.split('\n').at(-2)).toBe(eos.showPath());
  });

  it('gives two songs of one title a cue each on a second run too: song 1 keeps cue 1/1 and song 2 cue 1/11, since a cue is one song\'s', async () => {
    expect(await titlesInSet(THREE_PICTURES, oneTitleTwice(shared))).toEqual(['This Is Amazing Grace', 'This Is Amazing Grace']);
    const { eos, lights } = await onShow(oneTitleTwice);

    const first = await lights();
    const afterFirst = stateOf(eos);
    const second = await secondRun(eos, lights);

    for (const result of [first, second]) {
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(songLines(result.stdout).map(({ position, title, cue }) => [position, title, cue])).toEqual([
        [1, 'This Is Amazing Grace', '1/1'],
        [2, 'This Is Amazing Grace', '1/11'],
      ]);
    }
    expect(eos.cues().map(({ label }) => label)).toEqual(['Walk-in', 'This Is Amazing Grace', 'This Is Amazing Grace', 'Song 3', 'Closing', 'Meet and greet', 'Speaker', 'Walk-out']);
    expect(eos.cues()).toEqual(afterFirst.cues);
    expect(eos.levels()).toEqual(afterFirst.levels);
  });

  it("takes the cue labelled Song 1 for song 1 before a cue that carries the song's title, wherever the two stand in the list", async () => {
    const show = [
      { number: '1', label: 'This Is Amazing Grace' },
      { number: '2', label: 'Song 1' },
      { number: '3', label: 'Song 2' },
      { number: '4', label: 'Yes and Amen' },
    ];
    const { eos, lights } = await onShow(twoPictures, show, {});

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout).map(({ position, title, cue }) => [position, title, cue])).toEqual([
      [1, 'This Is Amazing Grace', '1/2'],
      [2, 'Yes and Amen', '1/3'],
    ]);
    expect(eos.cues().map(({ number, label }) => [number, label])).toEqual([
      ['1', 'This Is Amazing Grace'],
      ['2', 'This Is Amazing Grace'],
      ['3', 'Yes and Amen'],
      ['4', 'Yes and Amen'],
    ]);
  });
});

// A song past the last song that has a cue gets a copy of that song's cue, made with Copy To, which then takes the
// song's title and colour like any song cue (setlist-controller#503).
describe('pnpm build-set --lights, a set with more songs than the cue list has song cues', { timeout: 60_000 }, () => {
  const UNLINKED = 'no presentation or playlist item of its name in the playlist "November 15, 2026"';
  // The lines of a run's summary that name a copied cue.
  const copyLines = (stdout: string) => stdout.split('\n').filter((line) => line.includes(' is a copy of cue '));

  it("gives a fourth song a copy of the third song's cue, numbered between it and the next cue, with that cue's intensities and other channels, the fourth song's title and colour, leaves the first cue after it the template's colour, and names the copy and its source after the songs' lines", async () => {
    expect(await titlesInSet(THREE_PICTURES, fourSongs(shared))).toEqual(['Trust In God', 'This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);
    const { eos, before, lights } = await onShow(fourSongs);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues()).toEqual([
      { number: '0.5', label: 'Walk-in' },
      { number: '1', label: 'Trust In God' },
      { number: '11', label: 'This Is Amazing Grace' },
      { number: '22', label: 'Yes and Amen' },
      { number: '23', label: 'I Speak Jesus' },
      { number: '35', label: 'Closing' },
      { number: '36', label: 'Meet and greet' },
      { number: '37', label: 'Speaker' },
      { number: '38', label: 'Walk-out' },
    ]);
    // Song 1 has no presentation in the playlist, and keeps the template's colour. The other three have a picture each.
    expect(templateLines(result.stdout)).toEqual([{ position: 1, title: 'Trust In God', cue: '1/1', why: UNLINKED }]);
    const songs = songLines(result.stdout);
    expect(songs.map(({ position, title, cue, file }) => [position, title, cue, file])).toEqual([
      [2, 'This Is Amazing Grace', '1/11', 'OceanWaves_01_4K.mp4'],
      [3, 'Yes and Amen', '1/22', 'Blossom_01_4K.mp4'],
      [4, 'I Speak Jesus', '1/23', 'CityRain_09_4K.mp4'],
    ]);
    // The copy holds, on the six, the hue its own song's line prints at saturation 80, and cue 22 holds song 3's, another
    // colour. Its intensity on every channel, and its colour on the channels that are no colour channel, are cue 22's
    // from before the run.
    const levels = eos.levels();
    const [, amen, jesus] = songs;
    expect(colourOf(jesus!.hue)).not.toEqual(colourOf(amen!.hue));
    for (const channel of SIX) {
      expectColour(levels['23']![channel], colourOf(jesus!.hue), `cue 23 channel ${channel}`);
      expectColour(levels['22']![channel], colourOf(amen!.hue), `cue 22 channel ${channel}`);
      expect(levels['23']![channel]!.intensity, `cue 23 channel ${channel}`).toBe(before['22']![channel]!.intensity);
      expect(before['22']![channel]!.intensity).toBeGreaterThan(0);
    }
    for (const channel of [4, 5, 24]) expect(levels['23']![channel], `cue 23 channel ${channel}`).toEqual(before['22']![channel]);
    expect(before['22']![24]).toEqual({ intensity: 20 });
    // The first cue after the last song cue is now the cue after the copy. It holds the template's colours as its own,
    // and it and every cue after it read as before the run.
    for (const channel of SIX) expect(levels['35']![channel]!.colour, `cue 35 channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
    for (const cue of ['0.5', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    // The summary: the four songs, the copy and the cue it copies, then the saved show file.
    const lines = result.stdout.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines.slice(0, 4).map((line) => line.slice(0, 2))).toEqual(['1.', '2.', '3.', '4.']);
    expect(lines.slice(4)).toEqual(['Cue 1/23 (song 4, I Speak Jesus) is a copy of cue 1/22 (song 3, Yes and Amen).', eos.showPath(), '']);
    expect(eos.saves()).toBe(1);
    // One Copy To went out, and it got no Enter: every Enter confirms the Record Only sent straight before it.
    expect(copyCommands(eos)).toEqual(['Cue 1 / 22 Copy_To Cue 1 / 23#']);
    const sent = writes(eos);
    const enters = sent.flatMap(([address], at) => (address === '/eos/cmd' ? [at] : []));
    expect(enters).toHaveLength(5);
    for (const at of enters) expect(String(sent[at - 1]![1]), `the message before Enter ${at}`).toMatch(/^Chan 1 Thru 3 \+ 16 Thru 18 Record_Only Cue 1 \/ (1|11|22|23|35)#$/);
    // The copy is the first write: nothing but reads and the Go To Cue of the reads went out before it.
    const copyAt = sent.findIndex(([, text]) => String(text).includes('Copy_To'));
    for (const [address, text] of sent.slice(0, copyAt)) expect([address, String(text).slice(0, 10)]).toEqual(['/eos/newcmd', 'Go_To_Cue ']);
  });

  it("gives a fourth and a fifth song a copy each of the third song's cue, in set order between it and the next cue, each with its own title and colour, and names both copies", async () => {
    expect(await titlesInSet(THREE_PICTURES, fiveSongs(shared))).toEqual(['Trust In God', 'Goodness of God', 'This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);
    const { eos, before, lights } = await onShow(fiveSongs);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues().map(({ number, label }) => [number, label])).toEqual([
      ['0.5', 'Walk-in'],
      ['1', 'Trust In God'],
      ['11', 'Goodness of God'],
      ['22', 'This Is Amazing Grace'],
      ['23', 'Yes and Amen'],
      ['24', 'I Speak Jesus'],
      ['35', 'Closing'],
      ['36', 'Meet and greet'],
      ['37', 'Speaker'],
      ['38', 'Walk-out'],
    ]);
    expect(templateLines(result.stdout).map(({ position, cue, why }) => [position, cue, why])).toEqual([[1, '1/1', UNLINKED], [2, '1/11', UNLINKED]]);
    const songs = songLines(result.stdout);
    expect(songs.map(({ position, title, cue }) => [position, title, cue])).toEqual([
      [3, 'This Is Amazing Grace', '1/22'],
      [4, 'Yes and Amen', '1/23'],
      [5, 'I Speak Jesus', '1/24'],
    ]);
    // Three colours, each in its own song's cue, and each copy with cue 22's intensities and other channels.
    const levels = eos.levels();
    expect(new Set(songs.map(({ hue }) => hue)).size).toBe(3);
    for (const [at, cue] of ['22', '23', '24'].entries()) {
      for (const channel of SIX) {
        expectColour(levels[cue]![channel], colourOf(songs[at]!.hue), `cue ${cue} channel ${channel}`);
        expect(levels[cue]![channel]!.intensity, `cue ${cue} channel ${channel}`).toBe(before['22']![channel]!.intensity);
      }
      for (const channel of [4, 5, 24]) expect(levels[cue]![channel], `cue ${cue} channel ${channel}`).toEqual(before['22']![channel]);
    }
    for (const channel of SIX) expect(levels['35']![channel]!.colour, `cue 35 channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
    for (const cue of ['0.5', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    expect(copyLines(result.stdout)).toEqual([
      'Cue 1/23 (song 4, Yes and Amen) is a copy of cue 1/22 (song 3, This Is Amazing Grace).',
      'Cue 1/24 (song 5, I Speak Jesus) is a copy of cue 1/22 (song 3, This Is Amazing Grace).',
    ]);
    expect(result.stdout.split('\n').slice(5)).toEqual([...copyLines(result.stdout), eos.showPath(), '']);
    expect(copyCommands(eos)).toEqual(['Cue 1 / 22 Copy_To Cue 1 / 23#', 'Cue 1 / 22 Copy_To Cue 1 / 24#']);
  });

  it('numbers the copies with decimals when the next whole number is a cue: with a cue 23 after cue 22, two copies are 22.5 and 22.7, in set order, and cue 23, the first cue after them, keeps its label and holds the colours it had as its own', async () => {
    const { eos, before, lights } = await onShow(fiveSongs, churchShowWith({}, [{ number: '23', label: 'Offering' }]));

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues().map(({ number, label }) => [number, label]).slice(3, 8)).toEqual([
      ['22', 'This Is Amazing Grace'],
      ['22.5', 'Yes and Amen'],
      ['22.7', 'I Speak Jesus'],
      ['23', 'Offering'],
      ['35', 'Closing'],
    ]);
    const songs = songLines(result.stdout);
    expect(songs.map(({ position, cue }) => [position, cue])).toEqual([[3, '1/22'], [4, '1/22.5'], [5, '1/22.7']]);
    const levels = eos.levels();
    for (const [at, cue] of ['22', '22.5', '22.7'].entries()) for (const channel of SIX) expectColour(levels[cue]![channel], colourOf(songs[at]!.hue), `cue ${cue} channel ${channel}`);
    for (const channel of SIX) expect(levels['23']![channel]!.colour, `cue 23 channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
    for (const cue of ['23', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    expect(copyCommands(eos)).toEqual(['Cue 1 / 22 Copy_To Cue 1 / 22.5#', 'Cue 1 / 22 Copy_To Cue 1 / 22.7#']);
    expect(copyLines(result.stdout)).toEqual([
      'Cue 1/22.5 (song 4, Yes and Amen) is a copy of cue 1/22 (song 3, This Is Amazing Grace).',
      'Cue 1/22.7 (song 5, I Speak Jesus) is a copy of cue 1/22 (song 3, This Is Amazing Grace).',
    ]);
    // The first cue after the last song cue is cue 23: it got its own colours recorded into it, and cue 35 did not.
    expect(writes(eos).flatMap(([address, text]) => (address === '/eos/newcmd' ? (/Record_Only Cue 1 \/ (\S+)#$/.exec(String(text))?.[1] ?? []) : []))).toEqual(['1', '11', '22', '22.5', '22.7', '23']);
  });

  it.each([
    { name: 'two decimal places when one holds no number: between 22.9 and 23 the copy is 22.95', show: churchShowWith({ '22': 'Offering' }, [{ number: '22.9', label: 'Song 3' }, { number: '23', label: 'Prayer' }]), source: '22.9', copy: '22.95' },
    { name: 'three decimal places when two hold no number: between 22.99 and 23 the copy is 22.995', show: churchShowWith({ '22': 'Offering' }, [{ number: '22.99', label: 'Song 3' }, { number: '23', label: 'Prayer' }]), source: '22.99', copy: '22.995' },
    { name: 'the next whole number after a decimal cue: after 22.5 and before 35 the copy is 23', show: churchShowWith({ '22': 'Offering' }, [{ number: '22.5', label: 'Song 3' }]), source: '22.5', copy: '23' },
    { name: 'the next whole number when the song cue is the last cue of the list: after 38 the copy is 39, and no cue comes after it', show: churchShowWith({ '22': 'Offering', '38': 'Song 3' }), source: '38', copy: '39' },
  ])('numbers a copy with $name', async ({ show, source, copy }) => {
    const { eos, lights } = await onShow(fourSongs, show);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(copyCommands(eos)).toEqual([`Cue 1 / ${source} Copy_To Cue 1 / ${copy}#`]);
    expect(copyLines(result.stdout)).toEqual([`Cue 1/${copy} (song 4, I Speak Jesus) is a copy of cue 1/${source} (song 3, Yes and Amen).`]);
    const numbers = eos.cues().map(({ number }) => number);
    expect(numbers.slice(numbers.indexOf(source), numbers.indexOf(source) + 2)).toEqual([source, copy]);
    expect(eos.cues().find(({ number }) => number === copy)?.label).toBe('I Speak Jesus');
    expect(eos.saves()).toBe(1);
  });

  it('writes nothing and says in one line which song has no cue number free, and between which two cues, exit 1, when the cue after the last song cue is a thousandth after it', async () => {
    const show = churchShowWith({}, [{ number: '22.001', label: 'Offering' }]);
    const { eos, pro, before, lights } = await onShow(fourSongs, show);

    const result = await lights();

    expect(problemLine(result)).toBe('The lights step is not done: cue list 1 has no cue number free between cue 1/22 and cue 1/22.001 for the copy song 4, I Speak Jesus, needs.');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(writes(eos)).toEqual([]);
    expect(eos.cues()).toEqual(show);
    expect(eos.levels()).toEqual(before);
    expect(eos.saves()).toBe(0);
    expect(pro.requests).toEqual([]);
  });

  it("copies the last song cue the list has when the template has fewer song cues than the set has songs: with no Song 3 cue, song 3 gets a copy of song 2's cue, and the cue after it keeps its label and its colours", async () => {
    const show = churchShowWith({ '22': 'Offering' });
    const { eos, before, lights } = await onShow((workspace) => workspace, show);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues().map(({ number, label }) => [number, label]).slice(1, 6)).toEqual([
      ['1', 'This Is Amazing Grace'],
      ['11', 'Yes and Amen'],
      ['12', 'I Speak Jesus'],
      ['22', 'Offering'],
      ['35', 'Closing'],
    ]);
    const songs = songLines(result.stdout);
    expect(songs.map(({ position, title, cue }) => [position, title, cue])).toEqual([
      [1, 'This Is Amazing Grace', '1/1'],
      [2, 'Yes and Amen', '1/11'],
      [3, 'I Speak Jesus', '1/12'],
    ]);
    expect(copyLines(result.stdout)).toEqual(['Cue 1/12 (song 3, I Speak Jesus) is a copy of cue 1/11 (song 2, Yes and Amen).']);
    const levels = eos.levels();
    for (const channel of SIX) {
      expectColour(levels['12']![channel], colourOf(songs[2]!.hue), `cue 12 channel ${channel}`);
      expect(levels['12']![channel]!.intensity).toBe(before['11']![channel]!.intensity);
      expect(levels['22']![channel]!.colour, `cue 22 channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
    }
    for (const cue of ['22', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    expect(eos.saves()).toBe(1);
  });

  it("keeps the template's colour in the copy of a song with no presentation: the colour its source read before the run, recorded as the copy's own, and not the colour its source now holds", async () => {
    expect(await titlesInSet(THREE_PICTURES, fourLastUnlinked(shared))).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus', 'Trust In God']);
    const { eos, before, lights } = await onShow(fourLastUnlinked);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues().find(({ number }) => number === '23')).toEqual({ number: '23', label: 'Trust In God' });
    expect(templateLines(result.stdout)).toEqual([{ position: 4, title: 'Trust In God', cue: '1/23', why: UNLINKED }]);
    expect(copyLines(result.stdout)).toEqual(['Cue 1/23 (song 4, Trust In God) is a copy of cue 1/22 (song 3, I Speak Jesus).']);
    const levels = eos.levels();
    const jesus = songLines(result.stdout)[2]!;
    expect(jesus.cue).toBe('1/22');
    for (const channel of SIX) {
      expect(before['22']![channel]!.colour).toEqual(channel < 4 ? FRONT : BACK);
      expect(levels['23']![channel]!.colour, `cue 23 channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
      expectColour(levels['22']![channel], colourOf(jesus.hue), `cue 22 channel ${channel}`);
      expect(levels['22']![channel]!.colour).not.toEqual(levels['23']![channel]!.colour);
    }
    expect(levels['23']).toEqual(before['22']);
  });

  it('warns of a colour channel at intensity 0 in a copy too, since the copy takes the intensities of its source: one warning for the source and one for the copy, after the copy line and before the saved show file', async () => {
    const dark = { ...TEMPLATE_LEVELS, '22': { ...TEMPLATE_LEVELS['22'], 2: { intensity: 0 } } };
    const { eos, lights } = await onShow(fourSongs, CHURCH_SHOW, dark);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n').slice(4)).toEqual([
      'Cue 1/23 (song 4, I Speak Jesus) is a copy of cue 1/22 (song 3, Yes and Amen).',
      "Warning: channel 2 is at intensity 0 in cue 1/22 (song 3, Yes and Amen), so the song's colour will not show on it.",
      "Warning: channel 2 is at intensity 0 in cue 1/23 (song 4, I Speak Jesus), so the song's colour will not show on it.",
      eos.showPath(),
      '',
    ]);
    expect(eos.levels()['23']![2]!.intensity).toBe(0);
  });

  it('copies nothing on a second run: the copy the first run made is found by its title, the show ends with the nine cues, the labels and the levels of the first run, and the song lines are the same, with no line for a copy', async () => {
    const { eos, lights } = await onShow(fourSongs);

    const first = await lights();
    const afterFirst = stateOf(eos);
    const second = await secondRun(eos, lights);

    for (const result of [first, second]) {
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    }
    expect(copyCommands(eos)).toEqual(['Cue 1 / 22 Copy_To Cue 1 / 23#']);
    expect(copyCommands(eos, afterFirst.received)).toEqual([]);
    expect(eos.cues()).toHaveLength(9);
    expect(eos.cues()).toEqual(afterFirst.cues);
    expect(eos.levels()).toEqual(afterFirst.levels);
    expect(songLines(second.stdout)).toEqual(songLines(first.stdout));
    expect(templateLines(second.stdout)).toEqual(templateLines(first.stdout));
    expect(songLines(second.stdout).at(-1)).toMatchObject({ position: 4, title: 'I Speak Jesus', cue: '1/23' });
    expect(copyLines(first.stdout)).toHaveLength(1);
    expect(copyLines(second.stdout)).toEqual([]);
    expect(second.stdout.split('\n')).toEqual([...first.stdout.split('\n').slice(0, 4), eos.showPath(), '']);
    expect(eos.saves()).toBe(2);
  });
});

// A song owns its chain: its song cue and every cue that cue runs on into by a follow or a hang, cue after cue. The
// chain's cues take the song's colour, and each cue no chain holds that stands straight after one of a song's cues gets
// the template's colour back (setlist-controller#508). What Eos does with a follow, a hang and a link is as recorded
// (test/fixtures/eos/README.md, "Follows and links, 2026-10-24" and "A song cue with a follow or a hang, 2026-11-13").
describe('pnpm build-set --lights, a song cue that runs on into a chain', { timeout: 60_000 }, () => {
  // That show with the link, the follow and the hang given for each cue named, by its number.
  type Chains = Record<string, Pick<FakeEosCue, 'link' | 'follow' | 'hang'>>;
  const chained = (show: FakeEosCue[], chains: Chains) => show.map((cue) => ({ ...cue, ...chains[cue.number] }));
  // The colour the template gives each of the six colour lights, from the first cue on.
  const templateColour = (channel: number) => (channel < 4 ? FRONT : BACK);
  // A build with no label, with an intensity of its own on the six colour lights and no colour of its own.
  const build = (number: string): FakeEosCue => ({ number, label: '' });
  const BUILD_LEVELS = each(SIX, { intensity: 90 });

  it.each([
    { name: 'a follow', cue22: { follow: 3000 } },
    { name: 'a hang', cue22: { hang: 2000 } },
    { name: 'a follow and a hang', cue22: { follow: 3000, hang: 2000 } },
  ])("gives the build the last song cue runs on into by $name the last song's colour, and records the template's colour back into the first cue after the chain, Closing, with every other level as before", async ({ cue22 }) => {
    const show = chained(churchShowWith({}, [build('23')]), { '22': cue22 });
    const { eos, before, lights } = await onShow((workspace) => workspace, show, { ...TEMPLATE_LEVELS, '23': BUILD_LEVELS });

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const songs = songLines(result.stdout);
    expect(songs.map(({ position, title, cue }) => [position, title, cue])).toEqual([
      [1, 'This Is Amazing Grace', '1/1'],
      [2, 'Yes and Amen', '1/11'],
      [3, 'I Speak Jesus', '1/22'],
    ]);
    const levels = eos.levels();
    for (const channel of SIX) {
      expectColour(levels['22']![channel], colourOf(songs[2]!.hue), `cue 22 channel ${channel}`);
      expectColour(levels['23']![channel], colourOf(songs[2]!.hue), `cue 23 channel ${channel}`);
      expect(levels['23']![channel]!.intensity, `cue 23 channel ${channel}`).toBe(90);
      expect(colourOf(songs[2]!.hue)).not.toEqual(templateColour(channel));
    }
    // Closing holds the template's colours, and it and every cue after it read as before the run.
    for (const cue of ['0.5', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    for (const channel of SIX) expect(before['35']![channel]!.colour).toEqual(templateColour(channel));
    // The colours are recorded song by song, the song cue and then its chain, and the cue after the chain last: Closing
    // gets the template's colour as its own, and the build does not.
    expect(recordOnlyCues(eos)).toEqual(['1', '11', '22', '23', '35']);
    // The build keeps its label, none, and the song cue its follow and its hang.
    expect(eos.cues().slice(3, 6)).toEqual([{ number: '22', label: 'I Speak Jesus', ...cue22 }, { number: '23', label: '' }, { number: '35', label: 'Closing' }]);
    expect(eos.saves()).toBe(1);
  });

  it("follows a link: a last song cue with a follow and a link to cue 30 owns cue 30 and not cue 23, the next in the list, so cue 30 takes the song's colour, and cue 23 and Closing, each straight after one of the song's cues, get the template's colour back", async () => {
    const show = chained(churchShowWith({}, [{ number: '23', label: 'Announcements' }, build('30')]), { '22': { follow: 3000, link: 30 } });
    const { eos, before, lights } = await onShow((workspace) => workspace, show, { ...TEMPLATE_LEVELS, '30': BUILD_LEVELS });

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const [, , jesus] = songLines(result.stdout);
    const levels = eos.levels();
    for (const channel of SIX) {
      expectColour(levels['30']![channel], colourOf(jesus!.hue), `cue 30 channel ${channel}`);
      expect(levels['30']![channel]!.intensity, `cue 30 channel ${channel}`).toBe(90);
    }
    for (const cue of ['0.5', '23', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    for (const channel of SIX) expect(before['23']![channel]!.colour).toEqual(templateColour(channel));
    expect(recordOnlyCues(eos)).toEqual(['1', '11', '22', '30', '23', '35']);
  });

  it("gives a cue that is no song cue and stands between two song cues, holding no colour of its own, the template's colour back: it reads as before the run, and not as the song before it", async () => {
    const show = churchShowWith({}, [{ number: '5', label: 'Offering' }]);
    const { eos, before, lights } = await onShow((workspace) => workspace, show);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const [grace, amen] = songLines(result.stdout);
    const levels = eos.levels();
    for (const channel of SIX) {
      expectColour(levels['1']![channel], colourOf(grace!.hue), `cue 1 channel ${channel}`);
      expectColour(levels['11']![channel], colourOf(amen!.hue), `cue 11 channel ${channel}`);
      expect(before['5']![channel]!.colour).toEqual(templateColour(channel));
    }
    for (const cue of ['0.5', '5', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    // Each cue no chain holds that stands straight after a song cue is recorded, in list order, after the songs.
    expect(recordOnlyCues(eos)).toEqual(['1', '11', '22', '5', '35']);
  });

  it("gives the chain of an earlier song that song's colour, and the next song's cue its own: song 1's cue hangs into a build, which holds song 1's colour, and cue 11 holds song 2's", async () => {
    const show = chained(churchShowWith({}, [build('5'), build('6')]), { '1': { hang: 0 }, '5': { follow: 1000 } });
    const { eos, before, lights } = await onShow((workspace) => workspace, show, { ...TEMPLATE_LEVELS, '5': BUILD_LEVELS });

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const [grace, amen] = songLines(result.stdout);
    expect(colourOf(grace!.hue)).not.toEqual(colourOf(amen!.hue));
    const levels = eos.levels();
    for (const channel of SIX) {
      for (const cue of ['1', '5', '6']) expectColour(levels[cue]![channel], colourOf(grace!.hue), `cue ${cue} channel ${channel}`);
      expectColour(levels['11']![channel], colourOf(amen!.hue), `cue 11 channel ${channel}`);
      expect(levels['5']![channel]!.intensity).toBe(90);
    }
    for (const cue of ['0.5', '35', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    // A hang of 0 ms runs on as any hang does, and the chain goes on through cue 5's follow to cue 6, which runs on into
    // nothing.
    expect(recordOnlyCues(eos)).toEqual(['1', '5', '6', '11', '22', '35']);
  });

  it("keeps the template's colour in every cue of the chain of a song with no presentation: each cue takes the colour it had before the run, recorded as its own", async () => {
    const show = chained(churchShowWith({}, [build('5')]), { '1': { follow: 3000 } });
    const own: [number, number, number] = [9, 8, 7];
    const { eos, before, lights } = await onShow(fourSongs, show, { ...TEMPLATE_LEVELS, '5': { ...BUILD_LEVELS, 1: { intensity: 90, colour: own } } });

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(templateLines(result.stdout).map(({ position, title, cue }) => [position, title, cue])).toEqual([[1, 'Trust In God', '1/1']]);
    const levels = eos.levels();
    expect(levels['1']).toEqual(before['1']);
    expect(levels['5']).toEqual(before['5']);
    expect(levels['5']![1]!.colour).toEqual(own);
    for (const channel of SIX.slice(1)) expect(levels['5']![channel]!.colour).toEqual(templateColour(channel));
    expect(recordOnlyCues(eos).slice(0, 3)).toEqual(['1', '5', '11']);
  });

  it('takes a link with no follow and no hang for no chain: the song cue runs on into nothing, and the run is the run of a show with no chain', async () => {
    const show = chained(churchShowWith({}, [build('23')]), { '22': { link: 1 } });
    const { eos, before, lights } = await onShow((workspace) => workspace, show);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(recordOnlyCues(eos)).toEqual(['1', '11', '22', '23']);
    for (const cue of ['0.5', '23', '35', '36', '37', '38']) expect(eos.levels()[cue], `cue ${cue}`).toEqual(before[cue]);
    expect(result.stdout.split('\n')).toHaveLength(5);
  });

  it("ends a chain that links back to its own song cue there, with no problem: the build takes the song's colour, exit 0", async () => {
    const show = chained(churchShowWith({}, [build('23')]), { '22': { follow: 3000 }, '23': { hang: 1000, link: 22 } });
    const { eos, before, lights } = await onShow((workspace) => workspace, show);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const [, , jesus] = songLines(result.stdout);
    for (const channel of SIX) expectColour(eos.levels()['23']![channel], colourOf(jesus!.hue), `cue 23 channel ${channel}`);
    expect(eos.levels()['35']).toEqual(before['35']);
    expect(recordOnlyCues(eos)).toEqual(['1', '11', '22', '23', '35']);
    expect(eos.saves()).toBe(1);
  });

  it.each<{ name: string; chains: Chains; line: string }>([
    {
      name: "runs on into the next song's cue",
      chains: { '11': { follow: 3000 } },
      line: "the chain of cue 1/11 (song 2, Yes and Amen) runs on into cue 1/22, the cue of song 3, I Speak Jesus. A song's chain has to end before another song's cue.",
    },
    {
      name: "runs on by a link into an earlier song's cue",
      chains: { '22': { follow: 3000 }, '23': { hang: 0, link: 1 } },
      line: "the chain of cue 1/22 (song 3, I Speak Jesus) runs on into cue 1/1, the cue of song 1, This Is Amazing Grace. A song's chain has to end before another song's cue.",
    },
    {
      name: "runs on into a cue of another song's chain",
      chains: { '11': { follow: 3000, link: 23 }, '22': { hang: 2000 } },
      line: 'the chain of cue 1/22 (song 3, I Speak Jesus) runs on into cue 1/23, which is in the chain of cue 1/11 (song 2, Yes and Amen). A cue can be in the chain of one song only.',
    },
    {
      name: 'runs on by a link to a cue in another cue list',
      chains: { '22': { follow: 3000, link: '99/1' } },
      line: 'cue 1/22 (song 3, I Speak Jesus) runs on by a link to "99/1", which is no cue of cue list 1.',
    },
    {
      name: 'runs on by a link the lights step cannot read',
      chains: { '22': { follow: 3000 }, '23': { hang: 1000, link: 'Closing' } },
      line: 'cue 1/23, in the chain of cue 1/22 (song 3, I Speak Jesus), runs on by a link to "Closing", which is no cue of cue list 1.',
    },
    {
      name: 'runs on by a link to a cue the cue list does not hold',
      chains: { '22': { hang: 2000, link: 40 } },
      line: 'cue 1/22 (song 3, I Speak Jesus) runs on by a link to cue 40, which is no cue of cue list 1.',
    },
  ])('writes nothing and says so in one line, exit 1, before it reads ProPresenter, when a chain $name', async ({ chains, line }) => {
    const show = chained(churchShowWith({}, [build('23')]), chains);
    const { eos, pro, before, lights } = await onShow((workspace) => workspace, show);

    const result = await lights();

    expect(problemLine(result)).toBe(`The lights step is not done: ${line}`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(writes(eos)).toEqual([]);
    expect(eos.cues()).toEqual(show);
    expect(eos.levels()).toEqual(before);
    expect(eos.saves()).toBe(0);
    expect(pro.requests).toEqual([]);
  });

  // An extra song's copy stands past the chain of the song it copies, so no follow of that song fires it, and Eos gives
  // a copy its source's follow (chain-copy-to-follow.json), which the lights step takes off it.
  const CHANGED = 'The open show is changed and not saved: open the weekly show file again without saving, then run the lights step again.';
  // The text of every follow and every hang taken off a cue on the command line, in order.
  const takenOff = (eos: FakeEos, from = 0) => writes(eos, from).flatMap(([address, text]) => (address === '/eos/newcmd' && /(Follow|Hang)#$/.test(String(text)) ? [String(text)] : []));
  const labelsSet = (eos: FakeEos) => writes(eos).filter(([address]) => String(address).startsWith('/eos/set/'));
  // The church show with a build after the last song cue, which runs on into it as given.
  const lastSongChained = (cue22: Chains[string]) => chained(churchShowWith({}, [build('23')]), { '22': cue22 });

  it.each([
    { name: 'a follow', cue22: { follow: 3000 }, off: ['Cue 1 / 24 Follow#'] },
    { name: 'a hang', cue22: { hang: 2000 }, off: ['Cue 1 / 24 Hang#'] },
    { name: 'a follow and a hang', cue22: { follow: 3000, hang: 2000 }, off: ['Cue 1 / 24 Follow#', 'Cue 1 / 24 Hang#'] },
  ])("numbers a fourth song's copy past the build the third song's cue runs on into by $name, so the cue after cue 22 is still the build, and takes $name off the copy before any label; the copy holds the fourth song's colour, the build the third's, and Closing the template's", async ({ cue22, off }) => {
    const { eos, before, lights } = await onShow(fourSongs, lastSongChained(cue22), { ...TEMPLATE_LEVELS, '23': BUILD_LEVELS });

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    // The list reads 22, 23, 24, 35. Cue 22 keeps what it runs on by, and no link, so the cue it fires by itself is the
    // next in the list, the build, as before the run. The copy holds no follow and no hang.
    expect(eos.cues().slice(3, 7)).toEqual([
      { number: '22', label: 'Yes and Amen', ...cue22 },
      { number: '23', label: '' },
      { number: '24', label: 'I Speak Jesus' },
      { number: '35', label: 'Closing' },
    ]);
    expect(copyCommands(eos)).toEqual(['Cue 1 / 22 Copy_To Cue 1 / 24#']);
    expect(takenOff(eos)).toEqual(off);
    const sent = writes(eos).map(([address, text]) => (address === '/eos/newcmd' ? String(text) : String(address)));
    expect(sent.indexOf('Cue 1 / 22 Copy_To Cue 1 / 24#')).toBeLessThan(sent.indexOf(off[0]!));
    expect(sent.indexOf(off.at(-1)!)).toBeLessThan(sent.indexOf('/eos/set/cue/1/1/label'));
    const songs = songLines(result.stdout);
    expect(songs.map(({ position, title, cue }) => [position, title, cue])).toEqual([
      [2, 'This Is Amazing Grace', '1/11'],
      [3, 'Yes and Amen', '1/22'],
      [4, 'I Speak Jesus', '1/24'],
    ]);
    const [, amen, jesus] = songs;
    expect(colourOf(jesus!.hue)).not.toEqual(colourOf(amen!.hue));
    const levels = eos.levels();
    for (const channel of SIX) {
      expectColour(levels['22']![channel], colourOf(amen!.hue), `cue 22 channel ${channel}`);
      expectColour(levels['23']![channel], colourOf(amen!.hue), `cue 23 channel ${channel}`);
      expectColour(levels['24']![channel], colourOf(jesus!.hue), `cue 24 channel ${channel}`);
      expect(levels['24']![channel]!.intensity, `cue 24 channel ${channel}`).toBe(before['22']![channel]!.intensity);
      expect(levels['23']![channel]!.intensity, `cue 23 channel ${channel}`).toBe(90);
      // Closing holds the template's colours as its own.
      expect(levels['35']![channel]!.colour, `cue 35 channel ${channel}`).toEqual(templateColour(channel));
    }
    for (const cue of ['0.5', '36', '37', '38']) expect(levels[cue], `cue ${cue}`).toEqual(before[cue]);
    // Closing now stands after the copy, not after the build. Every level it holds as its own reads as before. Channels
    // 2 and 3, whose intensity it does not hold, tracked the build's 90 and now track the copy's 80, cue 22's: the
    // lights step sets no intensity, and a cue tracks what stands before it.
    for (const channel of [1, 16, 17, 18, 4, 5, 24]) expect(levels['35']![channel], `cue 35 channel ${channel}`).toEqual(before['35']![channel]);
    for (const channel of [2, 3]) {
      expect(before['35']![channel]!.intensity, `cue 35 channel ${channel} before`).toBe(90);
      expect(levels['35']![channel]!.intensity, `cue 35 channel ${channel}`).toBe(80);
    }
    expect(recordOnlyCues(eos)).toEqual(['1', '11', '22', '23', '24', '35']);
    expect(eos.saves()).toBe(1);
  });

  it('numbers two extra songs past the chain, 24 and 25, in set order, and takes the follow off each copy', async () => {
    const { eos, lights } = await onShow(fiveSongs, lastSongChained({ follow: 3000 }));

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(eos.cues().slice(3, 8)).toEqual([
      { number: '22', label: 'This Is Amazing Grace', follow: 3000 },
      { number: '23', label: '' },
      { number: '24', label: 'Yes and Amen' },
      { number: '25', label: 'I Speak Jesus' },
      { number: '35', label: 'Closing' },
    ]);
    expect(copyCommands(eos)).toEqual(['Cue 1 / 22 Copy_To Cue 1 / 24#', 'Cue 1 / 22 Copy_To Cue 1 / 25#']);
    expect(takenOff(eos)).toEqual(['Cue 1 / 24 Follow#', 'Cue 1 / 25 Follow#']);
    const songs = songLines(result.stdout);
    expect(songs.map(({ position, cue }) => [position, cue])).toEqual([[3, '1/22'], [4, '1/24'], [5, '1/25']]);
    const levels = eos.levels();
    for (const [at, cue] of ['22', '24', '25'].entries()) for (const channel of SIX) expectColour(levels[cue]![channel], colourOf(songs[at]!.hue), `cue ${cue} channel ${channel}`);
    for (const channel of SIX) expectColour(levels['23']![channel], colourOf(songs[0]!.hue), `cue 23 channel ${channel}`);
  });

  it('sends a copy of a song cue that does not run on no Follow and no Hang', async () => {
    const { eos, lights } = await onShow(fourSongs);

    const result = await lights();

    expect(result.code).toBe(0);
    expect(copyCommands(eos)).toEqual(['Cue 1 / 22 Copy_To Cue 1 / 23#']);
    expect(takenOff(eos)).toEqual([]);
  });

  it('copies nothing and takes no follow off on a second run on the show the first run saved: the same cues, labels and levels, and the same song lines', async () => {
    const { eos, lights } = await onShow(fourSongs, lastSongChained({ follow: 3000 }));

    const first = await lights();
    const afterFirst = stateOf(eos);
    const second = await secondRun(eos, lights);

    for (const result of [first, second]) {
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    }
    expect(copyCommands(eos, afterFirst.received)).toEqual([]);
    expect(takenOff(eos, afterFirst.received)).toEqual([]);
    expect(takenOff(eos)).toEqual(['Cue 1 / 24 Follow#']);
    expect(eos.cues()).toEqual(afterFirst.cues);
    expect(eos.levels()).toEqual(afterFirst.levels);
    expect(songLines(second.stdout)).toEqual(songLines(first.stdout));
    expect(templateLines(second.stdout)).toEqual(templateLines(first.stdout));
    expect(recordOnlyCues(eos, afterFirst.received)).toEqual(['1', '11', '22', '23', '24', '35']);
    expect(eos.saves()).toBe(2);
  });

  it('sets no label, saves nothing and quotes the command and the command line in one line that says the open show is changed, exit 1, when Eos rejects the Follow that takes the follow off a copy', async () => {
    const { eos, lights } = await onShow(fourSongs, lastSongChained({ follow: 3000 }));
    eos.rejectCommands(/Follow#/);

    const result = await lights();

    expect(problemLine(result)).toBe(
      `The lights step is not done: Eos rejected the command "Cue 1 / 24 Follow#", and its command line reads "LIVE: Cue  35 : Cue 1 / 24 Follow - Error: Syntax Error". ${CHANGED}`,
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.cues().find(({ number }) => number === '24')).toEqual({ number: '24', label: 'Song 3', follow: 3000 });
    expect(labelsSet(eos)).toEqual([]);
    expect(recordOnlyCues(eos)).toEqual([]);
    expect(eos.saves()).toBe(0);
  });

  it.each([
    { name: 'the follow', cue22: { follow: 3000 }, kept: 'the follow of cue 1/24, the copy of cue 1/22' },
    { name: 'the follow and the hang', cue22: { follow: 3000, hang: 2000 }, kept: 'the follow of cue 1/24, the copy of cue 1/22 and the hang of cue 1/24, the copy of cue 1/22' },
  ])('sets no label, saves nothing and says in one line what Eos did not take off and that the open show is changed, exit 1, when Eos answers and the copy keeps $name', async ({ cue22, kept }) => {
    const { eos, lights } = await onShow(fourSongs, lastSongChained(cue22));
    eos.holdFollows();

    const result = await lights({ EOS_TIMEOUT_MS: '400' });

    expect(problemLine(result)).toBe(`The lights step is not done: Eos did not take off ${kept}. ${CHANGED}`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.cues().find(({ number }) => number === '24')).toEqual({ number: '24', label: 'Song 3', ...cue22 });
    expect(labelsSet(eos)).toEqual([]);
    expect(recordOnlyCues(eos)).toEqual([]);
    expect(eos.saves()).toBe(0);
  });

  // The summary says the rule: which cues a chain gave to which song, and which copy lost a follow or a hang.
  it('prints one line for each cue of a chain, with the song cue and the song it belongs to, after the song lines and before the saved show file, in set order and then in the order Eos fires them', async () => {
    const show = chained(churchShowWith({}, [build('5'), build('6'), build('23')]), { '1': { hang: 0 }, '5': { follow: 1000 }, '22': { follow: 3000 } });
    const { eos, lights } = await onShow((workspace) => workspace, show);

    const result = await lights();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const lines = result.stdout.split('\n');
    expect(lines.slice(0, 3).map((line) => line.slice(0, 2))).toEqual(['1.', '2.', '3.']);
    expect(lines.slice(3)).toEqual([
      'Cue 1/5 is in the chain of cue 1/1 (song 1, This Is Amazing Grace), and is coloured as that song is.',
      'Cue 1/6 is in the chain of cue 1/1 (song 1, This Is Amazing Grace), and is coloured as that song is.',
      'Cue 1/23 is in the chain of cue 1/22 (song 3, I Speak Jesus), and is coloured as that song is.',
      eos.showPath(),
      '',
    ]);
  });

  it.each([
    { name: 'the follow', cue22: { follow: 3000 }, line: 'Cue 1/24 does not keep the follow of cue 1/22: the lights step took it off.' },
    { name: 'the hang', cue22: { hang: 2000 }, line: 'Cue 1/24 does not keep the hang of cue 1/22: the lights step took it off.' },
    { name: 'the follow and the hang', cue22: { follow: 3000, hang: 2000 }, line: 'Cue 1/24 does not keep the follow and the hang of cue 1/22: the lights step took them off.' },
  ])("prints, after the line of a copy, one line that says the copy does not keep $name of the cue it copies, and on a second run the chain's line and no line for a copy", async ({ cue22, line }) => {
    const dark = { ...TEMPLATE_LEVELS, '22': { ...TEMPLATE_LEVELS['22'], 2: { intensity: 0 } } };
    const { eos, lights } = await onShow(fourSongs, lastSongChained(cue22), dark);

    const first = await lights();
    const saved = eos.showPath();
    const second = await secondRun(eos, lights);

    for (const result of [first, second]) {
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
    }
    const chain = 'Cue 1/23 is in the chain of cue 1/22 (song 3, Yes and Amen), and is coloured as that song is.';
    const warnings = [
      "Warning: channel 2 is at intensity 0 in cue 1/22 (song 3, Yes and Amen), so the song's colour will not show on it.",
      "Warning: channel 2 is at intensity 0 in cue 1/24 (song 4, I Speak Jesus), so the song's colour will not show on it.",
    ];
    expect(first.stdout.split('\n').slice(4)).toEqual([chain, 'Cue 1/24 (song 4, I Speak Jesus) is a copy of cue 1/22 (song 3, Yes and Amen).', line, ...warnings, saved, '']);
    expect(second.stdout.split('\n')).toEqual([...first.stdout.split('\n').slice(0, 4), chain, ...warnings, eos.showPath(), '']);
  });
});

describe('pnpm build-set --lights, a Copy To that Eos does not take', { timeout: 60_000 }, () => {
  const CHANGED = 'The open show is changed and not saved: open the weekly show file again without saving, then run the lights step again.';
  const labelsSet = (eos: FakeEos) => writes(eos).filter(([address]) => String(address).startsWith('/eos/set/'));
  const recordOnlys = (eos: FakeEos) => writes(eos).filter(([address, text]) => address === '/eos/newcmd' && String(text).includes('Record_Only'));

  it('writes nothing and quotes the command and the command line in one line, exit 1, with no word of a changed show, when Eos rejects the first Copy To', async () => {
    const { eos, before, lights } = await onShow(fourSongs);
    eos.rejectCommands(/Copy_To/);

    const result = await lights();

    expect(problemLine(result)).toBe(
      'The lights step is not done: Eos rejected the command "Cue 1 / 22 Copy_To Cue 1 / 23#", and its command line reads "LIVE: Cue  35 : Cue 1 / 22 Copy To Cue 1 / 23 - Error: Syntax Error".',
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(labelsSet(eos)).toEqual([]);
    expect(recordOnlys(eos)).toEqual([]);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.levels()).toEqual(before);
    expect(eos.saves()).toBe(0);
  });

  it('sets no label, saves nothing and says in one line that the open show is changed, exit 1, when Eos rejects the second Copy To, after it made the first copy', async () => {
    const { eos, lights } = await onShow(fiveSongs);
    eos.rejectCommands(/Copy_To Cue 1 \/ 24/);

    const result = await lights();

    const line = problemLine(result);
    expect(line.startsWith('The lights step is not done: Eos rejected the command "Cue 1 / 22 Copy_To Cue 1 / 24#", and its command line reads "LIVE: Cue '), line).toBe(true);
    expect(line.endsWith(`: Cue 1 / 22 Copy To Cue 1 / 24 - Error: Syntax Error". ${CHANGED}`), line).toBe(true);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.cues().map(({ number, label }) => [number, label]).slice(3, 6)).toEqual([['22', 'Song 3'], ['23', 'Song 3'], ['35', 'Closing']]);
    expect(labelsSet(eos)).toEqual([]);
    expect(recordOnlys(eos)).toEqual([]);
    expect(eos.saves()).toBe(0);
  });

  it('sets no label and says in one line which copy Eos did not make and that the open show is changed, exit 1, when Eos answers the Copy To and the cue list never holds the new cue', async () => {
    const { eos, lights } = await onShow(fourSongs);
    eos.holdCopies();

    const result = await lights({ EOS_TIMEOUT_MS: '400' });

    expect(problemLine(result)).toBe(`The lights step is not done: Eos did not make cue 1/23, the copy of cue 1/22. ${CHANGED}`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(copyCommands(eos)).toEqual(['Cue 1 / 22 Copy_To Cue 1 / 23#']);
    expect(labelsSet(eos)).toEqual([]);
    expect(recordOnlys(eos)).toEqual([]);
    expect(eos.saves()).toBe(0);
  });

  it('says that the open show is changed when a label does not read back after a copy was made, since the copy is in the open show', async () => {
    const { eos, lights } = await onShow(fourSongs);
    eos.holdLabels();

    const result = await lights({ EOS_TIMEOUT_MS: '400' });

    expect(problemLine(result)).toBe(
      `The lights step is not done: Eos did not take the label of cue 1/1 (Trust In God), cue 1/11 (This Is Amazing Grace), cue 1/22 (Yes and Amen) and cue 1/23 (I Speak Jesus), so the show is not saved. ${CHANGED}`,
    );
    expect(result.code).toBe(1);
    expect(eos.cues()).toHaveLength(9);
    expect(recordOnlys(eos)).toEqual([]);
    expect(eos.saves()).toBe(0);
  });
});

describe('pnpm build-set --lights, the colour channels and the saturation of the lights config', { timeout: 60_000 }, () => {
  const NAMES = { templateShowName: 'Church Sunday template', weeklyShowNamePrefix: 'Church Sunday', songCueLabel: 'Song {n}' };
  // The mode from a copy of src/ with that lights config, on the set of three songs with pictures.
  async function runWith(lights: object, levels = TEMPLATE_LEVELS) {
    const { workspace, eos, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    eos.setLevels(levels);
    const before = eos.levels();
    const main = await appWith(workspace, { ...NAMES, ...lights });
    const env = { ...process.env, HOME: workspace.dir, EOS_SETTLE_MS: '0', PROPRESENTER_AGAIN_MS: '0' };
    const result = await output(spawn(process.execPath, [main, '--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], { cwd: workspace.dir, env }));
    return { result, eos, before };
  }

  it('writes the channels and the saturation the lights config gives: channels 4 and 5 at saturation 50, and the six of the repository are left as they were', async () => {
    const { result, eos, before } = await runWith({ colourChannels: [5, 4], saturation: 50 });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const songs = songLines(result.stdout);
    const levels = eos.levels();
    for (const [at, cue] of ['1', '11', '22'].entries()) {
      const colour = colourOf(songs[at]!.hue, 50);
      expect(Math.min(...colour)).toBeCloseTo(50, 6);
      expect(songs[at]!.rgb).toEqual(colour.map(Math.round));
      for (const channel of [4, 5]) expectColour(levels[cue]![channel], colour, `cue ${cue} channel ${channel}`);
    }
    // The cue after the last song cue gets each channel's own template colour back: channel 4's is the one cue 11 held.
    expect(levels['35']![4]!.colour).toEqual([40, 50, 60]);
    expect(levels['35']![5]!.colour).toEqual([15, 25, 35]);
    for (const cue of Object.keys(levels)) for (const channel of [...SIX, 24]) expect(levels[cue]![channel], `cue ${cue} channel ${channel}`).toEqual(before[cue]![channel]);
    const commands = writes(eos).filter(([address]) => address === '/eos/newcmd').map(([, text]) => String(text));
    expect(commands.filter((text) => text.startsWith('Chan '))).toEqual(['1', '11', '22', '35'].map((cue) => `Chan 4 Thru 5 Record_Only Cue 1 / ${cue}#`));
    expect(writes(eos).filter(([address]) => String(address).startsWith('/eos/chan/')).every(([address]) => /^\/eos\/chan\/(4|5)\/param\/red\/green\/blue$/.test(String(address)))).toBe(true);
  });

  it('names the channels of a Record Only as runs joined by " + ", a channel alone as its number', async () => {
    const { result, eos } = await runWith({ colourChannels: [18, 1, 2, 3, 5, 16], saturation: 80 });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const commands = writes(eos).filter(([address]) => address === '/eos/newcmd').map(([, text]) => String(text));
    expect(commands.filter((text) => text.startsWith('Chan '))[0]).toBe('Chan 1 Thru 3 + 5 + 16 + 18 Record_Only Cue 1 / 1#');
  });

  it('writes nothing and says in one line which channel is no colour light, exit 1, when a colour channel has no red, green and blue in Eos', async () => {
    const { result, eos, before } = await runWith({ colourChannels: [1, 24], saturation: 80 });

    expect(problemLine(result)).toBe('The lights step is not done: channel 24 has no red, green and blue in Eos, so it is no colour light. Check colourChannels in config/lights.json.');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.levels()).toEqual(before);
    expect(eos.saves()).toBe(0);
  });
});

describe('pnpm build-set --lights, a ProPresenter that does not answer', { timeout: 30_000 }, () => {
  it.each([
    { name: 'refuses the connection, as a Mac with ProPresenter closed does', down: (pro: FakeProPresenter) => pro.stop(), env: {} },
    // The time limit is 15 seconds a request; PROPRESENTER_TIMEOUT_MS makes it short for the test.
    { name: 'takes the request and never answers', down: async (pro: FakeProPresenter) => pro.hang(), env: { PROPRESENTER_TIMEOUT_MS: '300' } },
  ])('says in one line that the lights step is not done and that ProPresenter at its address did not answer, exit 1, and sends Eos nothing but reads, when ProPresenter $name', async ({ down, env }) => {
    const { workspace, eos, pro, config, weekly } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    eos.setLevels(TEMPLATE_LEVELS);
    const levels = eos.levels();
    const before = await snapshotFolder(workspace.showFolder);
    await down(pro);

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], env);

    expect(problemLine(result)).toBe(`The lights step is not done: ProPresenter at 127.0.0.1:${pro.port} did not answer.`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    // Not a label, not a Go To Cue, not a key: the show is as it was.
    expect(writes(eos)).toEqual([]);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.levels()).toEqual(levels);
    expect(eos.showPath()).toBe(weekly);
    expect(eos.saves()).toBe(0);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });

  it('says in one line what ProPresenter answered, exit 1, and writes nothing, when the read of the playlist for the date is no 200', async () => {
    const { workspace, eos, pro, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    // The one playlist that carries the date is one the fake has no read of, which it answers with a 404.
    pro.renamePlaylist('5B02A251-921A-440A-A0C6-9FA5FF8C1A1A', 'Next Sunday');
    pro.renamePlaylist('448C8C2F-9561-40BB-98C4-BF60258609CE', 'November 15, 2026');

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)]);

    expect(problemLine(result)).toBe(`The lights step is not done: ProPresenter at 127.0.0.1:${pro.port} answered 404 to GET /v1/playlist/448C8C2F-9561-40BB-98C4-BF60258609CE.`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(writes(eos)).toEqual([]);
  });
});

// A song the mode can get no colour for keeps the template's colour (setlist-controller#502): its song cue gets, on each
// colour channel, the colour read from that channel in it at the start, recorded into it, and its line says why. The
// pictures that are no picture are the files of the 2026-11-12 session, served on Yes and Amen's thumbnail by the fake.
describe('pnpm build-set --lights, a song with no picture', { timeout: 60_000 }, () => {
  const YES_AND_AMEN = '939B9443-1F81-4A44-9BB3-ED5CB53A895F';

  it.each([
    { name: "ProPresenter's grey placeholder with the two marks of a song's first slide", file: 'placeholder-with-marks-14-13.png' },
    { name: "ProPresenter's grey placeholder", file: 'v1_presentation_1A0F6B8F-9434-4462-854F-62D3CF499B68_thumbnail_0.png' },
    { name: 'the dark checkerboard ProPresenter draws for a slide with no background', file: 'v1_presentation_5A606BC5-9279-4509-983E-88092AE567F0_thumbnail_36.png' },
    { name: 'a picture with every pixel transparent', file: 'made-transparent.png' },
    { name: 'a frame that is black but for noise of 0 to 3 a channel', file: 'made-black-noise.png' },
    { name: 'a black frame with one level of red on every other pixel', file: 'made-black-red-speckle.png' },
  ])(
    "keeps the template's colour in the cue of a second song whose thumbnail is $name, recorded as the cue's own so the first song's does not track into it, says so on its line with the background file, and gives the other songs their colours, exit 0",
    async ({ file }) => {
      const usual = await ordinary();
      expect(usual.result.code).toBe(0);

      const { result, songs, levels, before, eos } = await threePictures(({ pro }) => pro.answerThumbnails(YES_AND_AMEN, [], file));

      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(templateLines(result.stdout)).toEqual([{ position: 2, title: 'Yes and Amen', cue: '1/11', why: 'no picture, Blossom_01_4K.mp4' }]);
      // Songs 1 and 3 keep the lines of an ordinary run, and song 2's line stands between them.
      expect(songs).toEqual([usual.songs[0], usual.songs[2]]);
      const lines = result.stdout.split('\n');
      expect(lines).toHaveLength(5);
      expect(lines[1]).toBe('2. Yes and Amen  cue 1/11  template colour  no picture, Blossom_01_4K.mp4');
      // Cue 1 holds song 1's colour, which is not the template's. Cue 11 held no colour of its own on the six, so it
      // would now track cue 1's: it holds the template's, the colours it tracked before the run, one on channels 1 to 3
      // and another on 16 to 18.
      for (const channel of SIX) {
        expectColour(levels['1']![channel], colourOf(songs[0]!.hue), `cue 1 channel ${channel}`);
        expect(levels['1']![channel]!.colour).not.toEqual(before['1']![channel]!.colour);
        expect(levels['11']![channel]!.colour, `cue 11 channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
        expectColour(levels['22']![channel], colourOf(songs[1]!.hue), `cue 22 channel ${channel}`);
        expect(levels['35']![channel]!.colour, `cue 35 channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
      }
      // Every intensity and every other channel of cue 11 is as before, and every other cue ends as an ordinary run's.
      expect(levels['11']).toEqual(before['11']);
      expect(levels).toEqual({ ...usual.levels, '11': before['11'] });
      // The cue is still labelled with its song's title, and the show is saved.
      expect(eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label)).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);
      expect(eos.saves()).toBe(1);
      expect(lines.slice(3)).toEqual([eos.showPath(), '']);
    },
  );

  it("gives a second song whose thumbnail is pale teal water with a dark warm shadow over an eighth of it the water's hue, not the shadow's orange, and leaves the other songs their lines, exit 0", async () => {
    const usual = await ordinary();

    const { result, songs, levels } = await threePictures(({ pro }) => pro.answerThumbnails(YES_AND_AMEN, [], 'made-teal-dark-shadow.png'));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(templateLines(result.stdout)).toEqual([]);
    expect([songs[1]!.position, songs[1]!.title, songs[1]!.cue, songs[1]!.file]).toEqual([2, 'Yes and Amen', '1/11', 'Blossom_01_4K.mp4']);
    expect(songs[1]!.hue).toBeGreaterThanOrEqual(180);
    expect(songs[1]!.hue).toBeLessThanOrEqual(195);
    for (const channel of SIX) expectColour(levels['11']![channel], colourOf(songs[1]!.hue), `cue 11 channel ${channel}`);
    expect([songs[0], songs[2]]).toEqual([usual.songs[0], usual.songs[2]]);
  });

  // One grey placeholder does not prove the background file is missing: it is also what a first request gets for a
  // picture ProPresenter has not drawn yet (thumbnail-first-request-then-again.json). So the mode asks again.
  const PLACEHOLDER = 'v1_presentation_1A0F6B8F-9434-4462-854F-62D3CF499B68_thumbnail_0.png';

  it.each([
    { name: 'on the first request only', placeholders: 1 },
    { name: 'on the first request and on the five after it', placeholders: 5 },
  ])("asks again and takes the picture's colour when ProPresenter gives the grey placeholder $name, then the picture: the run ends as an ordinary one", async ({ placeholders }) => {
    const usual = await ordinary();

    const { result, songs, levels, eos } = await threePictures(({ pro }) => pro.answerThumbnails(YES_AND_AMEN, Array.from({ length: placeholders }, () => PLACEHOLDER)));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(templateLines(result.stdout)).toEqual([]);
    // Pink flowers: the hue is pink to red, from the song's own background file.
    expect([songs[1]!.position, songs[1]!.title, songs[1]!.cue, songs[1]!.file]).toEqual([2, 'Yes and Amen', '1/11', 'Blossom_01_4K.mp4']);
    expect(songs[1]!.hue >= 350 || songs[1]!.hue <= 20, String(songs[1]!.hue)).toBe(true);
    expect(songs).toEqual(usual.songs);
    expect(levels).toEqual(usual.levels);
    expect(eos.saves()).toBe(1);
  });

  it('stops asking after the sixth answer with no picture: a picture ProPresenter would give on a seventh request is not waited for, and the song keeps the template colour', async () => {
    const { result, songs, levels, before } = await threePictures(({ pro }) => pro.answerThumbnails(YES_AND_AMEN, Array.from({ length: 6 }, () => PLACEHOLDER)));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(templateLines(result.stdout)).toEqual([{ position: 2, title: 'Yes and Amen', cue: '1/11', why: 'no picture, Blossom_01_4K.mp4' }]);
    expect(songs.map(({ position }) => position)).toEqual([1, 3]);
    expect(levels['11']).toEqual(before['11']);
  });

  // The wait is read from when the fake ProPresenter got each request for the song's picture, not from how long the run
  // took: a run takes 2 to 3 seconds with no wait at all, so its length says little of the waits. The mode starts each
  // wait after the answer came, so a slow machine makes a gap longer, never shorter, and cannot fail the test. The 10 ms
  // under the second are for a timer, which can end a millisecond early.
  it('waits a second before each time it asks again, when no test setting replaces the second: with three placeholders before the picture, each of the four requests for the picture comes a second after the one before, or later', async () => {
    const { workspace, eos, pro, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    eos.setLevels(TEMPLATE_LEVELS);
    pro.answerThumbnails(YES_AND_AMEN, [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER]);

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], { PROPRESENTER_AGAIN_MS: '' });

    const asked = pro.arrivals.filter((_, at) => pro.requests[at]!.path.startsWith(`/v1/presentation/${YES_AND_AMEN}/thumbnail/`));
    expect(asked).toHaveLength(4);
    const gaps = asked.slice(1).map((time, at) => time - asked[at]!);
    for (const gap of gaps) expect(gap, `the gaps in ms: ${gaps.map(Math.round).join(', ')}`).toBeGreaterThanOrEqual(990);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout).map(({ position, file }) => [position, file])).toEqual([[1, 'OceanWaves_01_4K.mp4'], [2, 'Blossom_01_4K.mp4'], [3, 'CityRain_09_4K.mp4']]);
  });

  // A thumbnail of a presentation this Mac is not authorized for is a 403 with no body, every time. The session's
  // folder holds no picture the decoder cannot read, so the fake serves one of its JSON files as the PNG.
  it.each([
    { name: 'ProPresenter refuses with a 403 every time', answer: 403, why: 'ProPresenter refused the picture (403), Blossom_01_4K.mp4' },
    { name: 'is no PNG the mode can read', answer: 'v1_playlists.json', why: 'the picture cannot be read, Blossom_01_4K.mp4' },
  ])("keeps the template's colour in the cue of a song whose picture $name, and says so on its line, exit 0, with the other songs coloured and the show saved", async ({ answer, why }) => {
    const usual = await ordinary();

    const { result, songs, levels, before, eos } = await threePictures(({ pro }) => pro.answerThumbnails(YES_AND_AMEN, [], answer));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[1]).toBe(`2. Yes and Amen  cue 1/11  template colour  ${why}`);
    expect(songs).toEqual([usual.songs[0], usual.songs[2]]);
    for (const channel of SIX) expect(levels['11']![channel]!.colour, `cue 11 channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
    expect(levels).toEqual({ ...usual.levels, '11': before['11'] });
    expect(eos.cues().find((cue) => cue.number === '11')?.label).toBe('Yes and Amen');
    expect(eos.saves()).toBe(1);
  });

  // The first thumbnail request to seven presentations answered 500 on 2026-10-24, before they answered 403.
  it('asks again after a status that is no 200 too: a 500 and then the picture gives the song its colour', async () => {
    const usual = await ordinary();

    const { result, songs, levels } = await threePictures(({ pro }) => pro.answerThumbnails(YES_AND_AMEN, [500]));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songs).toEqual(usual.songs);
    expect(levels).toEqual(usual.levels);
  });

  it('gives the reason of the last answer when the answers with no picture differ: a placeholder five times and then a 403 is a picture ProPresenter refused', async () => {
    const { result } = await threePictures(({ pro }) => pro.answerThumbnails(YES_AND_AMEN, Array.from({ length: 5 }, () => PLACEHOLDER), 403));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(templateLines(result.stdout)).toEqual([{ position: 2, title: 'Yes and Amen', cue: '1/11', why: 'ProPresenter refused the picture (403), Blossom_01_4K.mp4' }]);
  });

  it("gives the cue the colour read from each channel in that cue at the start, not the first cue's: a colour the template holds in the song cue itself on one channel stays on that channel", async () => {
    // Cue 11 holds a colour of its own on channel 2, and tracks the others.
    const OWN: [number, number, number] = [10, 90, 30];
    const template = { ...TEMPLATE_LEVELS, '11': { ...TEMPLATE_LEVELS['11'], 2: { intensity: 70, colour: OWN } } };

    const { result, levels, before } = await threePictures(({ pro }) => pro.answerThumbnails(YES_AND_AMEN, [], 'placeholder-with-marks-14-13.png'), template);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(templateLines(result.stdout).map(({ position, cue }) => [position, cue])).toEqual([[2, '1/11']]);
    expect(before['11']![2]!.colour).toEqual(OWN);
    for (const channel of SIX) expect(levels['11']![channel]!.colour, `channel ${channel}`).toEqual(channel === 2 ? OWN : channel < 4 ? FRONT : BACK);
    expect(levels['11']).toEqual(before['11']);
  });
});

// A colour light that is off in a song cue shows no colour there, so the summary says so (setlist-controller#502). The
// first test of "with the newest weekly show file open in Eos" pins the other side: with every intensity above 0 in the
// song cues, and two colour lights at 0 in the cue after the last, the summary has no warning.
describe('pnpm build-set --lights, a colour channel at intensity 0 in a song cue', { timeout: 60_000 }, () => {
  // The template's levels with those channels at intensity 0 in that cue.
  const dark = (levels: typeof TEMPLATE_LEVELS, cue: string, ...channels: number[]) => ({ ...levels, [cue]: { ...levels[cue], ...each(channels, { intensity: 0 }) } });

  it("prints one warning line that names the channel and the cue, after the songs' lines and before the saved show file, still gives the cue its song's colour on every colour channel, changes no intensity, and exits 0", async () => {
    const usual = await ordinary();

    const { result, songs, levels, before, eos } = await threePictures(() => {}, dark(TEMPLATE_LEVELS, '11', 2));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(before['11']![2]!.intensity).toBe(0);
    expect(songs).toEqual(usual.songs);
    const lines = result.stdout.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines.slice(0, 3).map((line) => line.slice(0, 2))).toEqual(['1.', '2.', '3.']);
    expect(lines.slice(3)).toEqual(["Warning: channel 2 is at intensity 0 in cue 1/11 (song 2, Yes and Amen), so the song's colour will not show on it.", eos.showPath(), '']);
    for (const channel of SIX) {
      expectColour(levels['11']![channel], colourOf(songs[1]!.hue), `cue 11 channel ${channel}`);
      expect(levels['11']![channel]!.intensity).toBe(before['11']![channel]!.intensity);
    }
    expect(eos.saves()).toBe(1);
  });

  it('prints one warning for each such channel of each song cue, in the order of the songs and then of the colour channels, for a song that keeps the template colour too', async () => {
    const { result } = await threePictures(({ pro }) => pro.answerThumbnails('939B9443-1F81-4A44-9BB3-ED5CB53A895F', [], 403), dark(dark(TEMPLATE_LEVELS, '22', 1), '11', 17, 2));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n').filter((line) => line.startsWith('Warning:'))).toEqual([
      "Warning: channel 2 is at intensity 0 in cue 1/11 (song 2, Yes and Amen), so the song's colour will not show on it.",
      "Warning: channel 17 is at intensity 0 in cue 1/11 (song 2, Yes and Amen), so the song's colour will not show on it.",
      "Warning: channel 1 is at intensity 0 in cue 1/22 (song 3, I Speak Jesus), so the song's colour will not show on it.",
    ]);
    expect(result.stdout.split('\n').slice(0, 3).map((line) => line.slice(0, 2))).toEqual(['1.', '2.', '3.']);
  });

  it('prints the warning with the songs when Eos does not say it saved, exit 1 for the save alone', async () => {
    const { workspace, eos, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    eos.setLevels(dark(TEMPLATE_LEVELS, '1', 18));
    eos.holdSaves();

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], { EOS_TIMEOUT_MS: '400' });

    expect(problemLine(result)).toBe('The lights step is not done: the song cues are labelled and coloured in the open show, but Eos did not say it saved the show. Save the show by hand in ETCnomad.');
    expect(result.code).toBe(1);
    expect(songLines(result.stdout)).toHaveLength(3);
    expect(result.stdout.split('\n').slice(3)).toEqual(["Warning: channel 18 is at intensity 0 in cue 1/1 (song 1, This Is Amazing Grace), so the song's colour will not show on it.", '']);
  });
});

// The set of 2026-10-25 holds Trust In God and This Is Amazing Grace. The recorded playlist of that date links neither,
// and the recorded "November 15, 2026" links the second.
describe('pnpm build-set --lights, a song with no presentation in the playlist', { timeout: 60_000 }, () => {
  // The Record Only commands the fake Eos received, each by the cue it records into.
  const recorded = (eos: FakeEos) =>
    writes(eos).flatMap(([address, text]) => (address === '/eos/newcmd' ? (/^Chan 1 Thru 3 \+ 16 Thru 18 Record_Only Cue 1 \/ (\S+)#$/.exec(String(text))?.[1] ?? []) : []));

  it("keeps the template's colour in the cue of every song the playlist links no presentation for, recorded as each cue's own, says why on each line with the playlist's name, labels the cues and saves, exit 0", async () => {
    const { workspace, eos, config } = await withShowOpen(TWO_SONGS, CHURCH_SHOW);
    eos.setLevels(TEMPLATE_LEVELS);
    const before = eos.levels();
    expect(await titlesInSet(TWO_SONGS)).toEqual(['Trust In God', 'This Is Amazing Grace']);

    const result = await run(['--lights', '--date', TWO_SONGS, ...lightsPaths(workspace, config)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toEqual([
      '1. Trust In God  cue 1/1  template colour  no presentation or playlist item of its name in the playlist "Series One - October 25, 2026"',
      '2. This Is Amazing Grace  cue 1/11  template colour  no presentation or playlist item of its name in the playlist "Series One - October 25, 2026"',
      eos.showPath(),
      '',
    ]);
    expect(eos.cues().map(({ label }) => label)).toEqual(['Walk-in', 'Trust In God', 'This Is Amazing Grace', 'Song 3', 'Closing', 'Meet and greet', 'Speaker', 'Walk-out']);
    // Each song cue holds the colours it had, and they were recorded into it, with the cue after the last song cue.
    expect(eos.levels()).toEqual(before);
    for (const cue of ['1', '11']) for (const channel of SIX) expect(eos.levels()[cue]![channel]!.colour, `cue ${cue} channel ${channel}`).toEqual(channel < 4 ? FRONT : BACK);
    expect(recorded(eos)).toEqual(['1', '11', '22']);
    expect(eos.saves()).toBe(1);
  });

  // A cold read of a presentation has answered 500 (test/fixtures/propresenter/README.md), and a presentation that is
  // not read matches no song.
  it('names each linked presentation ProPresenter did not give, with its status, in the reason of a song with no presentation, and gives the other songs their colours', async () => {
    const usual = await ordinary();

    const { result, songs, levels, before } = await threePictures(({ pro }) => pro.answerReads('3CE373C7-68E1-49F7-AADF-670D1712E759', 500));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe(
      '1. This Is Amazing Grace  cue 1/1  template colour  no presentation or playlist item of its name in the playlist "November 15, 2026", and ProPresenter did not give the presentation of "This Is Amazing Grace - [ Full ]" (500)',
    );
    expect(songs).toEqual(usual.songs.slice(1));
    expect(levels).toEqual({ ...usual.levels, '1': before['1'] });
  });
});

// A Planning Center import can name a presentation for its recording, "God I'm Just Grateful (Live)", and ProPresenter
// gives no way to change that own name. Its playlist item carries the song's title, as the producer renames it, so a
// song with no presentation of its own name takes the first presentation whose item has it (setlist-controller#578).
describe("pnpm build-set --lights, a song matched by its playlist item's name", { timeout: 60_000 }, () => {
  const NOVEMBER_15 = '5B02A251-921A-440A-A0C6-9FA5FF8C1A1A';
  const GRACE = '3CE373C7-68E1-49F7-AADF-670D1712E759';
  const LOOP = '15C678B7-4F41-4CD7-8280-E240623ECBA8';

  it('takes the colour of a presentation whose own name differs when its item, "This Is Amazing Grace - [ Full ]" less its arrangement, is the song\'s title, as a run with its own name gives', async () => {
    const usual = await ordinary();

    const { result, songs, levels } = await threePictures(({ pro }) => pro.renamePresentation(GRACE, 'This Is Amazing Grace (Live)'));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(templateLines(result.stdout)).toEqual([]);
    expect(songs).toEqual(usual.songs);
    expect(levels).toEqual(usual.levels);
  });

  it("takes the presentation of the song's own name over an earlier item that carries the song's title", async () => {
    const usual = await ordinary();

    const { result, songs, levels } = await threePictures(({ pro }) => pro.renameItem(NOVEMBER_15, LOOP, 'Yes and Amen'));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songs).toEqual(usual.songs);
    expect(levels).toEqual(usual.levels);
  });

  it("keeps the template's colour for a song that matches neither name, and says no presentation or playlist item has its name", async () => {
    const usual = await ordinary();

    const { result, songs, levels, before } = await threePictures(({ pro }) => {
      pro.renamePresentation(GRACE, 'This Is Amazing Grace (Live)');
      pro.renameItem(NOVEMBER_15, GRACE, 'Amazing Grace - [ Full ]');
    });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe('1. This Is Amazing Grace  cue 1/1  template colour  no presentation or playlist item of its name in the playlist "November 15, 2026"');
    expect(songs).toEqual(usual.songs.slice(1));
    expect(levels).toEqual({ ...usual.levels, '1': before['1'] });
  });
});

// A playlist the mode cannot choose is a question, not a guess (setlist-controller#502): nothing is written, the
// playlists it could mean are printed as the flag to type, and --playlist answers it.
describe('pnpm build-set --lights, a playlist the mode cannot choose', { timeout: 60_000 }, () => {
  const NOVEMBER_15 = '5B02A251-921A-440A-A0C6-9FA5FF8C1A1A';
  const NOVEMBER_8 = '306E3B2A-D71A-40B2-ACBD-DE96FC9FA5F5';
  // The 7 playlists of the 2026-11-12 session, in ProPresenter's order.
  const SESSION_PLAYLISTS = [
    'November 8, 2026',
    'November 15, 2026',
    'Series Two - November 1, 2026',
    'Series One - October 25, 2026',
    'Series One - October 11, 2026',
    'Series One - October 18, 2026',
    'Series One - October 4, 2026',
  ];
  const AGAIN = 'Run the lights step again with --playlist and the name of the one to use.';
  const asFlags = (names: string[]) => [...names.map((name) => `--playlist "${name}"`), ''].join('\n');

  // The set of three on the church show with the template's levels, with the playlists as `playlists` leaves them. Each
  // run is the mode with those flags after the paths, and `untouched` is whether the show and the show folder are as
  // they were before the first run.
  async function staged(playlists: (pro: FakeProPresenter) => void) {
    const { workspace, eos, pro, config, weekly } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    eos.setLevels(TEMPLATE_LEVELS);
    const levels = eos.levels();
    const folder = await snapshotFolder(workspace.showFolder);
    playlists(pro);
    return {
      eos,
      pro,
      runWith: (...flags: string[]) => run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config), ...flags]),
      async expectUntouched() {
        expect(writes(eos)).toEqual([]);
        expect(eos.cues()).toEqual(CHURCH_SHOW);
        expect(eos.levels()).toEqual(levels);
        expect(eos.showPath()).toBe(weekly);
        expect(eos.saves()).toBe(0);
        expect(await snapshotFolder(workspace.showFolder)).toEqual(folder);
      },
    };
  }
  // The run ended as an ordinary run of the set of three does.
  async function expectOrdinary(result: Result, eos: FakeEos) {
    const usual = await ordinary();
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout)).toEqual(usual.songs);
    expect(songLines(result.stdout)).toHaveLength(3);
    expect(eos.levels()).toEqual(usual.levels);
    expect(eos.saves()).toBe(1);
  }

  it('writes nothing, says in one line that no playlist carries the date and to run again with --playlist, exit 1, and lists every playlist of ProPresenter as the flag to type; --playlist then names the one to use, by the shared name rule', async () => {
    const { eos, pro, runWith, expectUntouched } = await staged((pro) => pro.renamePlaylist(NOVEMBER_15, 'Next Sunday'));

    const asked = await runWith();

    expect(problemLine(asked)).toBe(`The lights step is not done: ProPresenter has no playlist with "November 15, 2026" in its name. ${AGAIN}`);
    expect(asked.code).toBe(1);
    expect(asked.stdout).toBe(asFlags(SESSION_PLAYLISTS.map((name) => (name === 'November 15, 2026' ? 'Next Sunday' : name))));
    await expectUntouched();
    // No playlist's items were read, and no picture asked for.
    expect(pro.requests.map(({ path }) => path)).toEqual(['/v1/playlists']);

    const answered = await runWith('--playlist', ' next  sunday');

    await expectOrdinary(answered, eos);
  });

  it('writes nothing, says in one line that more than one playlist carries the date, exit 1, and lists those playlists and no other; --playlist then picks one of the two by its whole name', async () => {
    const { eos, pro, runWith, expectUntouched } = await staged((pro) => pro.renamePlaylist(NOVEMBER_8, 'Evening - november 15,  2026'));

    const asked = await runWith();

    expect(problemLine(asked)).toBe(`The lights step is not done: ProPresenter has more than one playlist with "November 15, 2026" in its name. ${AGAIN}`);
    expect(asked.code).toBe(1);
    expect(asked.stdout).toBe(asFlags(['Evening - november 15,  2026', 'November 15, 2026']));
    await expectUntouched();
    expect(pro.requests.map(({ path }) => path)).toEqual(['/v1/playlists']);

    const answered = await runWith('--playlist', 'November 15, 2026');

    await expectOrdinary(answered, eos);
  });

  it('writes nothing, names the playlist in one line, exit 1, and lists every playlist, when --playlist names one ProPresenter does not have: a part of a name is no name', async () => {
    const { runWith, expectUntouched } = await staged(() => {});

    const result = await runWith('--playlist', 'November 15');

    expect(problemLine(result)).toBe(`The lights step is not done: ProPresenter has no playlist named "November 15". ${AGAIN}`);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe(asFlags(SESSION_PLAYLISTS));
    await expectUntouched();
  });

  it('writes nothing and says in one line to rename one, exit 1, when two playlists have the name --playlist gives, which the flag cannot tell apart', async () => {
    const { runWith, expectUntouched } = await staged((pro) => pro.renamePlaylist(NOVEMBER_8, 'NOVEMBER 15,  2026'));

    const result = await runWith('--playlist', 'November 15, 2026');

    expect(problemLine(result)).toBe('The lights step is not done: ProPresenter has more than one playlist named "November 15, 2026". Rename one in ProPresenter, then run the lights step again.');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe(asFlags(['NOVEMBER 15,  2026', 'November 15, 2026']));
    await expectUntouched();
  });

  it('does not look for the date with --playlist: the set of another Sunday takes its colours from the playlist named, and its song the playlist does not link keeps the template colour without stopping the other', async () => {
    const { workspace, eos, config } = await withShowOpen(TWO_SONGS, CHURCH_SHOW);
    eos.setLevels(TEMPLATE_LEVELS);
    const before = eos.levels();

    const result = await run(['--lights', '--date', TWO_SONGS, ...lightsPaths(workspace, config), '--playlist', 'November 15, 2026']);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(templateLines(result.stdout)).toEqual([{ position: 1, title: 'Trust In God', cue: '1/1', why: 'no presentation or playlist item of its name in the playlist "November 15, 2026"' }]);
    // This Is Amazing Grace, song 2 of this set, takes the tan of its rock.
    const [grace, ...others] = songLines(result.stdout);
    expect(others).toEqual([]);
    expect([grace!.position, grace!.title, grace!.cue, grace!.file]).toEqual([2, 'This Is Amazing Grace', '1/11', 'OceanWaves_01_4K.mp4']);
    expect(grace!.hue).toBeGreaterThanOrEqual(20);
    expect(grace!.hue).toBeLessThanOrEqual(50);
    const levels = eos.levels();
    for (const channel of SIX) expectColour(levels['11']![channel], colourOf(grace!.hue), `cue 11 channel ${channel}`);
    expect(levels['1']).toEqual(before['1']);
    expect(eos.saves()).toBe(1);
  });
});

describe('pnpm build-set --lights, a command line command Eos rejects', { timeout: 30_000 }, () => {
  it('writes nothing and quotes the command line in one line, exit 1, when Eos rejects the first, a Go To Cue of the reads', async () => {
    const { eos, result, before } = await threePictures(({ eos }) => eos.rejectCommands());

    expect(problemLine(result)).toBe(
      'The lights step is not done: Eos rejected the command "Go_To_Cue 1 / 1 Time 0#", and its command line reads "LIVE: Cue   : Go To Cue 1 / 1 Time 0 - Error: Syntax Error".',
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(writes(eos)).toEqual([['/eos/newcmd', 'Go_To_Cue 1 / 1 Time 0#']]);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.levels()).toEqual(before);
    expect(eos.saves()).toBe(0);
  });

  it('does not save and says in one line that the open show is changed, exit 1, when Eos rejects a Record Only, after the labels', async () => {
    const { eos, result, before } = await threePictures(({ eos }) => eos.rejectCommands(/Record_Only/));

    expect(problemLine(result)).toBe(
      'The lights step is not done: Eos rejected the command "Chan 1 Thru 3 + 16 Thru 18 Record_Only Cue 1 / 1#", and its command line reads "LIVE: Cue  1 : Chan 1 Thru 3 + 16 Thru 18 Record Only Cue 1 / 1 - Error: Syntax Error". The open show is changed and not saved: open the weekly show file again without saving, then run the lights step again.',
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label)).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);
    expect(eos.levels()).toEqual(before);
    expect(eos.received.filter((message) => message.address.startsWith('/eos/key/'))).toEqual([]);
    expect(eos.saves()).toBe(0);
  });
});

describe('pnpm build-set --lights, a show that is not saved', { timeout: 60_000 }, () => {
  it('says in one line that the song cues are labelled and coloured and Eos did not say it saved, exit 1, and leaves no key held, when no saved event comes within the time limit', async () => {
    // The time limit for the saved event is 10 seconds; EOS_TIMEOUT_MS makes it short for the test.
    const { workspace, eos, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    eos.setLevels(TEMPLATE_LEVELS);
    const before = eos.levels();
    eos.holdSaves();

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], { EOS_TIMEOUT_MS: '400' });

    expect(problemLine(result)).toBe(
      'The lights step is not done: the song cues are labelled and coloured in the open show, but Eos did not say it saved the show. Save the show by hand in ETCnomad.',
    );
    expect(result.code).toBe(1);
    expect(songLines(result.stdout).map(({ position, title, cue }) => [position, title, cue])).toEqual([
      [1, 'This Is Amazing Grace', '1/1'],
      [2, 'Yes and Amen', '1/11'],
      [3, 'I Speak Jesus', '1/22'],
    ]);
    expect(result.stdout.split('\n')).toHaveLength(4);
    expect(eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label)).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);
    expect(eos.levels()['22']).not.toEqual(before['22']);
    const keys = eos.received.filter((message) => message.address.startsWith('/eos/key/')).map((message) => [message.address, ...message.args]);
    expect(keys.at(-1)).toEqual(['/eos/key/shift', 0]);
    expect(keys.filter(([address]) => address === '/eos/key/update').at(-1)).toEqual(['/eos/key/update', 0]);
  });

  it('sends no save and no colour and says in one line which cue did not take its label, exit 1, when a label does not read back within the time limit', async () => {
    const { workspace, eos, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW, twoPictures);
    eos.setLevels(TEMPLATE_LEVELS);
    const before = eos.levels();
    eos.holdLabels();

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], { EOS_TIMEOUT_MS: '400' });

    expect(problemLine(result)).toBe(
      'The lights step is not done: Eos did not take the label of cue 1/1 (This Is Amazing Grace) and cue 1/11 (Yes and Amen), so the show is not saved.',
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(eos.received.filter((message) => message.address.startsWith('/eos/key/') || message.address.startsWith('/eos/chan/'))).toEqual([]);
    expect(eos.saves()).toBe(0);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.levels()).toEqual(before);
  });

  it('records no colour, sends no save and says in one line which channels did not take their colour and that the open show is changed, exit 1, when a colour does not read back within the time limit', async () => {
    const { workspace, eos, config } = await withShowOpen(THREE_PICTURES, CHURCH_SHOW);
    eos.setLevels(TEMPLATE_LEVELS);
    const before = eos.levels();
    eos.holdColours();

    const result = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, config)], { EOS_TIMEOUT_MS: '400' });

    expect(problemLine(result)).toBe(
      'The lights step is not done: Eos did not take the colour of channels 1, 2, 3, 16, 17 and 18 for cue 1/1. The open show is changed and not saved: open the weekly show file again without saving, then run the lights step again.',
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(writes(eos).filter(([address, text]) => address === '/eos/newcmd' && String(text).includes('Record_Only'))).toEqual([]);
    expect(eos.received.filter((message) => message.address.startsWith('/eos/key/'))).toEqual([]);
    expect(eos.levels()).toEqual(before);
    expect(eos.saves()).toBe(0);
  });
});

describe('the usage text and the README, on the lights mode', { timeout: 30_000 }, () => {
  // The text with each run of white space, its line breaks included, as one space, so a sentence reads whole wherever the
  // text wraps it.
  const unwrapped = (text: string) => text.replace(/\s+/g, ' ');

  // The usage text, as the command prints it on a usage error: --lights with a song name stops before it reads anything.
  async function usageText(): Promise<string> {
    const workspace = stage();
    const result = await run(['--lights', 'grace', ...lightsPaths(workspace, join(workspace.dir, 'no-connections.json'))]);
    expect(result.code).toBe(2);
    return result.stderr.slice(result.stderr.indexOf('Usage:'));
  }

  it('gives the lights mode a synopsis line of its own, with the five flags it takes', async () => {
    const usage = await usageText();

    expect(usage.split('\n')).toContain('  pnpm build-set --lights [--date YYYY-MM-DD] [--output-root <folder>] [--show-folder <folder>] [--connections-config <path>] [--playlist <name>]');
  });

  it('says in the usage text what the mode reads, when it writes, what it writes and prints, and each way the lights step is not done', async () => {
    const usage = unwrapped(await usageText());

    for (const sentence of [
      "--lights runs the lights step for the set built for the date, and builds nothing: it labels each song cue of the weekly show file open in Eos with its song's title, gives the colour lights in it the colour of the song's ProPresenter background, and saves the show.",
      "It reads the songs, in order, from the set built for the date under the output root, the song cue label, the colour channels and the saturation from config/lights.json, and Eos's address and cue list from the eos section, and ProPresenter's address from the propresenter section, of the connections config, the file the server reads: --connections-config <path>, by default ~/Library/Application Support/setlist-controller/connections.json, and a relative one resolves as --output-root does.",
      'It writes to Eos only when the show open in Eos is the newest weekly show file for the date in the show folder, and only while the command line reads LIVE.',
      'Song n\'s cue is the first cue of the cue list labelled as the song cue label gives it for n, Song 1 for "Song {n}", trimmed, with each run of spaces as one, in any letter case, or, with none, the first cue labelled with the song\'s title, as a run before this one left it.',
      'A song owns its chain: every cue its song cue runs on into by a follow or a hang, cue after cue, by its link or with none into the next cue of the cue list.',
      'A link with no follow and no hang runs on into nothing.',
      "A set with more songs than the cue list has song cues gets, for each song after the last that has one, a copy of that song's cue, made with Copy To before anything else is written, numbered after that cue and every cue of its chain, and before the next cue: the next whole number when it is free, otherwise a decimal between the two.",
      'A follow or a hang Eos copies with the cue is taken off the copy, so the copy runs on into nothing.',
      'A set with fewer songs leaves the other song cues as they are.',
      'A second run on the same weekly show file copies nothing and leaves the show as the first did.',
      "Song n's colour comes from the one ProPresenter playlist whose name holds the date of the set, written as November 15, 2026, or with --playlist <name> from the one playlist of that whole name, by the same rule: from the picture of the first cue of the song's presentation in it: the first presentation it links whose own name is the song's title, by the same rule, or, with none, the first whose playlist item's name is the song's title, less a Planning Center arrangement such as \" - [ Full ]\".",
      'A presentation whose own name is not the song\'s title, as a Planning Center import names one for its recording, "<title> (Live)", matches once its playlist item is renamed to the song\'s title in ProPresenter.',
      'With no playlist for the date or more than one, or with --playlist and no playlist of that name or more than one, nothing is written to Eos, the playlists it could mean are printed, one a line, each as --playlist "<name>", and one line on stderr says why, exit 1.',
      "The colour is the hue of the most saturated of the picture's large areas that are not near black, never its mean, at the saturation of config/lights.json and full brightness.",
      "There is no picture when it has no opaque pixel, when it has no large area that is not near black, when the most saturated of those areas is under 5% saturation, as ProPresenter's grey placeholder and a slide with no background are, when ProPresenter refuses it, or when it cannot be read.",
      'ProPresenter gives the placeholder for a picture it has not drawn yet, so the mode asks for a picture it did not get again, once a second, up to 5 times, and takes the first it gets.',
      "A song that still has no picture, and a song with no presentation or playlist item of its name in the playlist, keeps the template's colour: on each colour channel the colour its song cue had, recorded into the cue so the colour of the song before it does not track into it.",
      "Each song cue's label becomes its song's title, as the set holds it, and its colour channels take the song's colour, recorded into the cue with Record Only, and into each cue of its chain, which keeps its label.",
      "For a song that keeps the template's colour, each cue of its chain keeps the colour it had.",
      "Each cue no chain holds that stands straight after one of a song's cues gets the colour it had recorded back into it, since a colour tracks into the cues after it, so a cue no chain reaches keeps the template's colour. Then the show is saved, as Shift and Update save it at the keypad.",
      'It prints one line per song, its number, its title, its cue, and its colour as hue and as red, green and blue with the background file the colour came from, or template colour and why; then one line for each cue of a chain, with the song it belongs to; then one line for each cue it copied, with the cue it is a copy of, and one more when a follow or a hang was taken off the copy; then one warning line for each colour channel at intensity 0 in a song cue, where the colour will not show; and last the path of the show file the save made.',
      'A warning never stops the run.',
      'It sets no intensity and no channel but the colour channels.',
      "When the lights step is not done, one line on stderr says why, exit 1. Nothing is written to Eos with no set built for the date, a connections config that names no Eos or no ProPresenter, Eos or ProPresenter not answering, another show open in Eos, a command line that does not read LIVE, no cue for song 1 or for a song before one that has a cue, a chain that runs on into another song's cue, into a cue of another song's chain or by a link to no cue of the cue list, no cue number free for a copy, or a playlist the mode cannot choose.",
      'With another show open, the weekly show file and the three steps that open it are printed too.',
      'With no weekly show file for the date, --lights makes one from the template show file, as a build does, prints it and the three steps, and stops there, since a file made just now is not the show open in Eos.',
      'When Eos sends no saved event, the song cues are labelled and coloured in the open show, and the line says to save the show by hand.',
      'When the run stops after it began to write, the line says that the open show is changed and not saved: open the weekly show file again without saving, then run the lights step again.',
      '--lights takes no song name, and no flag but --date, --output-root, --show-folder, --connections-config and --playlist. --connections-config and --playlist need --lights.',
    ]) {
      expect(usage).toContain(sentence);
    }
    // What the mode no longer stops on is not in the list of what stops it.
    expect(usage).not.toContain('a song with no cue,');
    expect(usage).not.toContain('a song with no presentation in the playlist, or');
    expect(usage).not.toContain('whose picture ProPresenter does not give');
    // The rule before a song owned its chain is gone (setlist-controller#508).
    expect(usage).not.toContain('The first cue after the last song cue');
    expect(usage).not.toContain('numbered after it and before the next cue');
    expect(usage).not.toContain('\u2014');
  });

  it('says in the README what the lights mode does, names its three flags with the default, and names songCueLabel, colourChannels and saturation in the lights config', async () => {
    const text = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
    const start = text.indexOf('## Building the Sunday set\n');
    const section = text.slice(start, text.indexOf('\n## ', start + 1));

    expect(section).toContain(
      '- `--lights`: runs the lights step for the set built for the date, and builds nothing: it labels each song cue of the weekly show file open in Eos with its song\'s title, gives the colour lights in it the colour of the song\'s ProPresenter background, and saves the show. It takes no song name, and no flag but `--date`, `--output-root`, `--show-folder`, `--connections-config` and `--playlist`.',
    );
    expect(section).toContain(
      "- `--playlist <name>`: the ProPresenter playlist the lights step takes the songs' colours from, for `--lights`, by its whole name, trimmed, with each run of spaces as one, in any letter case. Without it, the playlist is the one whose name holds the date of the set. Give it when the lights step says that no playlist carries the date, or that more than one does.",
    );
    expect(section).toContain(
      "- `--connections-config <path>`: the connections config, for `--lights`, which reads Eos's address and cue list from its `eos` section and ProPresenter's address from its `propresenter` section. It defaults to `~/Library/Application Support/setlist-controller/connections.json`, the file the server reads by default.",
    );
    expect(section).toContain('Once the weekly show file is open in ETCnomad, run the lights step for the same date: `pnpm build-set --lights`.');
    expect(section).toContain(
      [
        '<n>. <title>  cue <cue list>/<cue>  hue <hue>, red <red> green <green> blue <blue>  <background file>',
        '<n>. <title>  cue <cue list>/<cue>  template colour  <why>',
        'Cue <cue list>/<cue> is in the chain of cue <cue list>/<cue> (song <n>, <title>), and is coloured as that song is.',
        'Cue <cue list>/<cue> (song <n>, <title>) is a copy of cue <cue list>/<cue> (song <n>, <title>).',
        'Cue <cue list>/<cue> does not keep the follow of cue <cue list>/<cue>: the lights step took it off.',
        "Warning: channel <channel> is at intensity 0 in cue <cue list>/<cue> (song <n>, <title>), so the song's colour will not show on it.",
        '<show folder>/<weekly show name prefix> <date> <time of the save>.esf3d',
      ].join('\n'),
    );
    expect(section).toContain('With no playlist for the date or more than one, or with `--playlist` and no playlist of that name or more than one, nothing is written to Eos, the playlists it could mean are printed, one a line, each as `--playlist "<name>"`, and one line on stderr says why, exit 1.');
    expect(section).toContain("There is no picture when it has no opaque pixel, when it has no large area that is not near black, when the most saturated of those areas is under 5% saturation, as ProPresenter's grey placeholder and a slide with no background are, when ProPresenter refuses it, or when it cannot be read.");
    expect(section).toContain('the mode asks for a picture it did not get again, once a second, up to 5 times, and takes the first it gets');
    expect(section).toContain("A song that still has no picture, and a song with no presentation or playlist item of its name in the playlist, keeps the template's colour: on each colour channel the colour its song cue had, recorded into the cue so the colour of the song before it does not track into it.");
    for (const why of ['`no picture, <background file>`', '`ProPresenter refused the picture (<status>), <background file>`', '`the picture cannot be read, <background file>`', '`no presentation or playlist item of its name in the playlist "<playlist>"`']) expect(section).toContain(why);
    expect(section).toContain('A warning never stops the run and never sets exit 1.');
    expect(section).toContain('`--lights` takes no song name, and `--connections-config` or `--playlist` on a build is a usage error.');
    expect(section).not.toContain('whose picture ProPresenter does not give');
    expect(section).toContain('It writes to Eos only when the show open in Eos is the newest weekly show file for the date in the show folder, and only while the command line reads LIVE.');
    expect(section).toContain(
      "no set built for the date, a connections config that names no Eos or no ProPresenter, Eos or ProPresenter not answering, another show open in Eos, a command line that does not read LIVE, no cue for song 1 or for a song before one that has a cue, a chain that runs on into another song's cue, into a cue of another song's chain or by a link to no cue of the cue list, no cue number free for a copy, or a playlist the mode cannot choose",
    );
    expect(section).not.toContain('a song with no cue,');
    expect(section).toContain("in any letter case, or, with none, the first cue labelled with the song's title, as a run before this one left it.");
    expect(section).toContain('A song owns its chain: every cue its song cue runs on into by a follow or a hang, cue after cue, by its link or with none into the next cue of the cue list. A link with no follow and no hang runs on into nothing.');
    expect(section).toContain("Each cue of a song's chain takes the song's colour and keeps its label, and the summary names each one with its song. For a song that keeps the template's colour, each cue of its chain keeps the colour it had.");
    expect(section).toContain("Each cue no chain holds that stands straight after one of a song's cues gets the colour it had recorded back into it, so a cue no chain reaches keeps the template's colour, wherever it stands in the cue list.");
    expect(section).toContain("A chain that runs on into another song's cue, into a cue of another song's chain, or by a link to no cue of the cue list stops the lights step before anything is written.");
    expect(section).toContain(
      "A set with more songs than the cue list has song cues gets, for each song after the last that has one, a copy of that song's cue, made with Copy To before anything else is written, numbered after that cue and every cue of its chain, and before the next cue: the next whole number when it is free, otherwise a decimal between the two.",
    );
    expect(section).toContain('A follow or a hang Eos copies with the cue is taken off the copy, so the copy runs on into nothing, and the summary says so in a line after the line of the copy: `the follow`, `the hang`, or `the follow and the hang` with `took them off`.');
    expect(section).toContain("records the song's colour into the cue and into each cue of its chain on the colour channels, records the colour each cue straight after one of a song's cues had back into that cue, since a colour tracks into the cues after it,");
    expect(section).not.toContain('the first cue after the last song cue');
    expect(section).not.toContain('numbered after it and before the next cue');
    expect(section).toContain('The copy then takes its own song\'s title and colour like any song cue, and the summary names each copy and the cue it is a copy of.');
    expect(section).toContain('A set with fewer songs leaves the other song cues as they are, `Song n` label included.');
    expect(section).toContain('A second run on the same weekly show file copies nothing and leaves the show as the first did.');
    expect(section).toContain(
      'prints one line per song, then one line for each cue of a chain, then one line for each cue it copied, and one more when a follow or a hang was taken off the copy, then one warning line for each colour channel at intensity 0 in a song cue, and, last, the path of the show file the save made:',
    );
    expect(section).toContain('The lights step sets no intensity and no channel but the colour channels.');
    expect(section).toContain('the open show is changed and not saved: open the weekly show file again without saving, then run the lights step again');
    expect(section).toContain('and the label of a song cue as `songCueLabel`, with `{n}` where the number of the song goes, such as `Song {n}`');
    expect(section).toContain('the channels of the colour lights as `colourChannels`, such as `[1, 2, 3, 16, 17, 18]`, and the saturation they take a song\'s hue at as `saturation`, a number from 0 to 100');
    expect(section).not.toContain('\u2014');
  });
});
