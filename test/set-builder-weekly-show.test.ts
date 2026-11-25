import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import {
  addShowFile,
  addTemplateShow,
  copySongAs,
  createWorkspace,
  DATE,
  GOODNESS,
  projectFolder,
  REPO_ROOT,
  removeWorkspaces,
  setPath,
  snapshotFolder,
  type Workspace,
} from './set-builder-harness.ts';

// The weekly show file a build makes (setlist-controller#499): a copy of the newest template show file in the show
// folder, named for the date of the set. Every test runs the command as the operator runs it and reads what it prints
// and what the show folder then holds. Every build passes --show-folder with a folder in its workspace: the command's
// default is the real Eos show folder, ~/Documents/ETC. No test talks to Eos, and no real show file is a fixture.

const CLIENT_ID = 'fake-client-id-499';
const SECRET = 'fake-secret-499';
// The recorded November 1 plan: This Is Amazing Grace in D, Great Are You Lord in D, Fall Like Rain in E.
const NOVEMBER_1 = '2026-11-01';

const fakes: PlanningCenter[] = [];

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await removeWorkspaces();
});

type Result = { code: number | null; stdout: string; stderr: string };

// The command through the package.json script, with pnpm's own output silenced. `env` is added to its environment.
function run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Result> {
  return output(spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } }));
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
const paths = (workspace: Workspace) => [
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

// The usage text with each run of white space, its line breaks included, as one space, so a sentence reads whole
// wherever the text wraps it.
const unwrapped = (text: string) => text.replace(/\s+/g, ' ');

// A time as Eos writes it in a show file's name, YYYY-MM-DD HH-MM-SS in the Mac's local time, for the name of a show
// file a test makes.
function eosTime(time: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  const day = [time.getFullYear(), two(time.getMonth() + 1), two(time.getDate())].join('-');
  return `${day} ${[time.getHours(), time.getMinutes(), time.getSeconds()].map(two).join('-')}`;
}

// The moment a time in a show file's name names, read as the Mac's local time, in milliseconds; NaN for a text of
// another form.
function momentOf(time: string): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})$/.exec(time)?.slice(1).map(Number);
  if (parts === undefined) return Number.NaN;
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = parts;
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

// The names of the files in the workspace's show folder, sorted.
async function showFiles(workspace: Workspace): Promise<string[]> {
  return (await readdir(workspace.showFolder)).toSorted();
}

// The time in a weekly show file's name for the set of DATE, `Church Sunday 2026-10-18 <time>.esf3d`, or undefined for a
// file of any other name.
const weeklyTime = (name: string) => /^Church Sunday 2026-10-18 (\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2})\.esf3d$/.exec(name)?.[1];

// Bytes no text is, so a copy that read the template as text would not equal it.
const showBytes = (label: string) => Buffer.concat([Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x0d, 0x0a]), Buffer.from(label), Buffer.from([0xc3, 0x28, 0x00])]);

// The one new file in the show folder since `before`, a weekly show file for the set of DATE, and its bytes.
async function newWeekly(workspace: Workspace, before: string[]): Promise<{ name: string; bytes: Buffer }> {
  const added = (await showFiles(workspace)).filter((name) => !before.includes(name));
  expect(added).toHaveLength(1);
  const [name = ''] = added;
  expect(weeklyTime(name), name).toBeDefined();
  return { name, bytes: await readFile(join(workspace.showFolder, name)) };
}

// Each test here spawns pnpm build-set, which a loaded CI runner can take past vitest's 5 s default, so every describe
// gives its tests 30 s, as set-builder-lights.test.ts does. A build that hangs still fails, at 30 s.
describe('pnpm build-set, the weekly show file', { timeout: 30_000 }, () => {
  it('copies the template show file to a weekly show file named for the date of the set and the time of the copy, and names it and the three steps to open it after the set path', async () => {
    const workspace = await createWorkspace();
    const bytes = showBytes('the template show file');
    const template = await addTemplateShow(workspace, '2026-11-10 09-00-00', bytes);

    // The name holds whole seconds, so the copy's second starts no earlier than a second before the run.
    const before = Date.now() - 1000;
    const result = await run(['grace', '--date', DATE, ...paths(workspace)]);
    const after = Date.now();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const files = await showFiles(workspace);
    expect(files).toHaveLength(2);
    expect(files).toContain(basename(template));
    const [weekly = ''] = files.filter((name) => name !== basename(template));
    const copied = momentOf(weeklyTime(weekly) ?? '');
    expect(copied > before && copied <= after, `${weekly} names a time from ${new Date(before).toString()} to ${new Date(after).toString()}`).toBe(true);
    expect((await readFile(join(workspace.showFolder, weekly))).equals(bytes)).toBe(true);
    expect((await readFile(template)).equals(bytes)).toBe(true);
    expect(result.stdout).toBe(
      [
        '2026-10-18 Sunday',
        '1. This Is Amazing Grace  bar 1  98 BPM  4/4',
        setPath(workspace),
        `Weekly show file: ${join(workspace.showFolder, weekly)}`,
        `Open it in ETCnomad: File, Open; ${weekly}; OK.`,
        '',
      ].join('\n'),
    );
  });

  it('copies the template show file whose name holds the latest time, whichever was written first or last', async () => {
    const workspace = await createWorkspace();
    // Written oldest, newest, middle, and the newest by name is the oldest by modification time, so neither the order
    // the folder lists them in nor a file's own dates pick it.
    const oldest = await addTemplateShow(workspace, '2026-11-09 23-59-59', showBytes('the oldest save'));
    const newest = await addTemplateShow(workspace, '2026-11-10 09-00-00', showBytes('the newest save'));
    const middle = await addTemplateShow(workspace, '2026-11-10 08-59-59', showBytes('the middle save'));
    await utimes(newest, 1_700_000_000, 1_700_000_000);
    await utimes(oldest, 1_750_000_000, 1_750_000_000);
    await utimes(middle, 1_760_000_000, 1_760_000_000);
    const before = await showFiles(workspace);

    const result = await run(['grace', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const weekly = await newWeekly(workspace, before);
    expect(weekly.bytes.equals(showBytes('the newest save'))).toBe(true);
    expect(result.stdout.trimEnd().split('\n').slice(-2)).toEqual([`Weekly show file: ${join(workspace.showFolder, weekly.name)}`, `Open it in ETCnomad: File, Open; ${weekly.name}; OK.`]);
  });

  it('takes no file for the template but one named <template show name> <time>.esf3d, whatever later time another name holds', async () => {
    const workspace = await createWorkspace();
    await addTemplateShow(workspace, '2026-11-10 09-00-00', showBytes('the template show file'));
    // Each holds a later time than the template's, so one taken for a template would be the newest.
    await addShowFile(workspace, 'Church Sunday', '2026-10-18 2027-01-01 00-00-00', showBytes('a weekly show file'));
    await addShowFile(workspace, 'Church Sunday', '2027-01-02 00-00-00', showBytes('a show named by the prefix alone'));
    await addShowFile(workspace, 'Church Sunday template old', '2027-01-03 00-00-00', showBytes('a show whose name starts with the template show name'));
    await addShowFile(workspace, 'church sunday template', '2027-01-04 00-00-00', showBytes('a show named in another letter case'));
    await addShowFile(workspace, 'Church Sunday template', '2027-01-05', showBytes('a file with a date and no time'));
    await writeFile(join(workspace.showFolder, 'Church Sunday template.esf3d'), showBytes('a file with no time'));
    await writeFile(join(workspace.showFolder, 'Church Sunday template 2027-01-06 00-00-00.esf3d.bak'), showBytes('a file of another extension'));
    await writeFile(join(workspace.showFolder, 'Church Sunday template 2027-01-07 00-00-00.esf'), showBytes('a show file of an older Eos'));
    await mkdir(join(workspace.showFolder, 'Church Sunday template 2027-01-08 00-00-00.esf3d'));
    await mkdir(join(workspace.showFolder, 'Archive'));
    await writeFile(join(workspace.showFolder, 'Archive/Church Sunday template 2027-01-09 00-00-00.esf3d'), showBytes('a template in a folder inside the show folder'));
    const before = await showFiles(workspace);
    const snapshot = await snapshotFolder(workspace.showFolder);

    const result = await run(['grace', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const weekly = await newWeekly(workspace, before);
    expect(weekly.bytes.equals(showBytes('the template show file'))).toBe(true);
    // Every file that was there is there still, with its bytes.
    expect(await snapshotFolder(workspace.showFolder)).toMatchObject(snapshot ?? {});
  });
});

describe('pnpm build-set --replace, the weekly show file of a rebuild', { timeout: 30_000 }, () => {
  it('makes a newer weekly show file from the newest template and leaves the older weekly show file in place', async () => {
    const workspace = await createWorkspace();
    await addTemplateShow(workspace, '2026-11-10 09-00-00', showBytes('the template as first saved'));
    const args = ['grace', '--date', DATE, ...paths(workspace)];
    expect((await run(args)).code).toBe(0);
    const [first = '', ...others] = (await showFiles(workspace)).filter((name) => weeklyTime(name) !== undefined);
    expect(others).toEqual([]);
    expect((await readFile(join(workspace.showFolder, first))).equals(showBytes('the template as first saved'))).toBe(true);
    await addTemplateShow(workspace, '2026-11-11 09-00-00', showBytes('the template as saved again'));
    const before = await showFiles(workspace);
    const snapshot = await snapshotFolder(workspace.showFolder);

    const result = await run([...args, '--replace', projectFolder(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const second = await newWeekly(workspace, before);
    expect(second.bytes.equals(showBytes('the template as saved again'))).toBe(true);
    expect((weeklyTime(second.name) ?? '') > (weeklyTime(first) ?? ''), `${second.name} is newer than ${first}`).toBe(true);
    expect(result.stdout.trimEnd().split('\n').slice(-2)).toEqual([`Weekly show file: ${join(workspace.showFolder, second.name)}`, `Open it in ETCnomad: File, Open; ${second.name}; OK.`]);
    // Both templates and the first weekly show file are there still, each with its bytes: four files in all.
    expect(await snapshotFolder(workspace.showFolder)).toMatchObject(snapshot ?? {});
    expect(await showFiles(workspace)).toHaveLength(4);
  });

  // Two builds for one date within one second would give the weekly show file one name. Weekly show files already named
  // for this second and the two after it stand in for the earlier builds, so the copy meets a name that is taken.
  it('never replaces a weekly show file whose name its own would be: it takes the name of a later second', { timeout: 30_000 }, async () => {
    const workspace = await createWorkspace();
    await addTemplateShow(workspace, '2026-11-10 09-00-00', showBytes('the template show file'));
    const now = Date.now();
    const taken = [0, 1000, 2000].map((later) => eosTime(new Date(now + later)));
    for (const time of taken) await addShowFile(workspace, 'Church Sunday', `2026-10-18 ${time}`, showBytes(`the weekly show file of ${time}`));
    const before = await showFiles(workspace);
    const snapshot = await snapshotFolder(workspace.showFolder);

    const result = await run(['grace', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const weekly = await newWeekly(workspace, before);
    expect(weekly.bytes.equals(showBytes('the template show file'))).toBe(true);
    expect((weeklyTime(weekly.name) ?? '') > (taken.at(-1) ?? ''), `${weekly.name} is later than ${taken.at(-1)}`).toBe(true);
    expect(await snapshotFolder(workspace.showFolder)).toMatchObject(snapshot ?? {});
  });
});

describe('pnpm build-set, a show folder with no template show file', { timeout: 30_000 }, () => {
  it.each([
    { name: 'is not there', showFolder: async () => {} },
    { name: 'is empty', showFolder: async (workspace: Workspace) => void (await mkdir(workspace.showFolder)) },
    {
      name: 'holds only show files of other names',
      showFolder: async (workspace: Workspace) => {
        await addShowFile(workspace, 'Church Sunday', '2026-10-18 2026-10-15 20-00-00', showBytes('a weekly show file made before'));
        await addShowFile(workspace, 'Church Sunday 2026-11-08', '2026-11-12 14-10-52', showBytes('the church show'));
        await addShowFile(workspace, 'Colour test recording', '2026-11-12 15-40-53', showBytes('a test show'));
      },
    },
  ])('builds the set, exit 0, says in one line after the set path that the lights step is not done and why, and leaves a show folder that $name as it was', async ({ showFolder }) => {
    const workspace = await createWorkspace();
    await showFolder(workspace);
    const before = await snapshotFolder(workspace.showFolder);

    const result = await run(['grace', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        '2026-10-18 Sunday',
        '1. This Is Amazing Grace  bar 1  98 BPM  4/4',
        setPath(workspace),
        `The lights step is not done: no template show file named "Church Sunday template" was found in ${join(workspace.dir, 'ETC')}.`,
        '',
      ].join('\n'),
    );
    expect(existsSync(setPath(workspace))).toBe(true);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

describe('pnpm build-set, a weekly show file that cannot be made', { timeout: 30_000 }, () => {
  it('builds the set, prints its summary, then one line on stderr that names the show folder and the cause, exit 1, when the show folder is a file', async () => {
    const workspace = await createWorkspace();
    await writeFile(workspace.showFolder, 'a file where the show folder should be\n');

    const result = await run(['grace', '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe(['2026-10-18 Sunday', '1. This Is Amazing Grace  bar 1  98 BPM  4/4', setPath(workspace), ''].join('\n'));
    expect(result.stderr).not.toMatch(/^\s+at /m);
    const problems = result.stderr.trimEnd().split('\n');
    expect(problems).toHaveLength(1);
    const start = `The set is built, but the weekly show file cannot be made in ${workspace.showFolder}: `;
    const end = '. The lights step is not done.';
    expect(problems[0]?.startsWith(start) && problems[0].endsWith(end), problems[0]).toBe(true);
    expect(problems[0]?.slice(start.length, -end.length)).toContain('ENOTDIR');
    expect(existsSync(setPath(workspace))).toBe(true);
    expect(await readFile(workspace.showFolder, 'utf8')).toBe('a file where the show folder should be\n');
  });

  it('still makes the weekly show file when the set manifest cannot be written, since the set is built', async () => {
    const workspace = await createWorkspace();
    await addTemplateShow(workspace, '2026-11-10 09-00-00', showBytes('the template show file'));
    const before = await showFiles(workspace);
    await writeFile(join(workspace.dir, 'a file'), 'not a folder\n');
    const manifest = join(workspace.dir, 'a file', 'set-manifest.json');

    const result = await run(['grace', '--date', DATE, ...paths(workspace), '--set-manifest', manifest]);

    expect(result.code).toBe(1);
    expect(result.stderr.trimEnd().split('\n')).toHaveLength(1);
    expect(result.stderr.startsWith(`The set is built, but the set manifest ${manifest} cannot be written: `), result.stderr).toBe(true);
    const weekly = await newWeekly(workspace, before);
    expect(weekly.bytes.equals(showBytes('the template show file'))).toBe(true);
    expect(result.stdout.trimEnd().split('\n').slice(-3)).toEqual([setPath(workspace), `Weekly show file: ${join(workspace.showFolder, weekly.name)}`, `Open it in ETCnomad: File, Open; ${weekly.name}; OK.`]);
  });
});

describe('the commands that make no weekly show file', { timeout: 30_000 }, () => {
  it.each([
    { name: 'a song name that matches no song folder', args: ['no such song', '--date', DATE], code: 1, problem: /^"no such song" matches no song folder/ },
    { name: 'a set folder that already exists, with no --replace', args: ['grace', '--date', DATE], code: 1, problem: /already exists\. Build with --replace / },
    { name: 'a --date that is no date, a usage error', args: ['grace', '--date', '2026-02-30'], code: 2, problem: /^--date must be a real date written YYYY-MM-DD, not 2026-02-30\.\n\nUsage:/ },
  ])('a build that stops on $name leaves the show folder as it was', async ({ args, code, problem }) => {
    const workspace = await createWorkspace();
    await mkdir(projectFolder(workspace), { recursive: true });
    await addTemplateShow(workspace, '2026-11-10 09-00-00', showBytes('the template show file'));
    const before = await snapshotFolder(workspace.showFolder);

    const result = await run([...args, ...paths(workspace)]);

    expect(result.stderr).toMatch(problem);
    expect(result.code).toBe(code);
    expect(result.stdout).toBe('');
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });

  // The listings and the chart skeleton take no --show-folder, so each runs with HOME as the workspace and a template
  // show file in the default show folder under that home, Documents/ETC: a copy made there would show in the snapshot,
  // and none is ever made in the real one. The --plan forms read the recorded November 1 plan from the fake Planning
  // Center, with the token file in the workspace.
  it.each([
    { mode: '--list', args: ['--list'], first: 'rain  E  Fall Like Rain-Passion-E-70.00bpm' },
    { mode: '--plan --list', args: ['--plan', '--list', '--date', NOVEMBER_1], first: '2026-11-01 Sunday' },
    { mode: '--skeleton', args: ['--skeleton', 'grace'], first: '1. This Is Amazing Grace' },
    { mode: '--plan --skeleton', args: ['--plan', '--skeleton', '--date', NOVEMBER_1], first: '1. This Is Amazing Grace' },
  ])('$mode leaves the default show folder as it was, and writes nothing', async ({ args, first }) => {
    const workspace = await createWorkspace();
    // The fixture library has no Fall Like Rain; the plan's songs each need a folder to be listed without a problem.
    await copySongAs(workspace, GOODNESS, 'Fall Like Rain-Passion-E-70.00bpm');
    const home = { ...workspace, showFolder: join(workspace.dir, 'Documents/ETC') };
    await addTemplateShow(home, '2026-11-10 09-00-00', showBytes('the template show file'));
    const token = join(workspace.dir, 'pco.env');
    await writeFile(token, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET='${SECRET}'\n`);
    await chmod(token, 0o600);
    const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET });
    fakes.push(fake);
    const showFolderBefore = await snapshotFolder(home.showFolder);
    expect(Object.keys(showFolderBefore ?? {})).toEqual(['Church Sunday template 2026-11-10 09-00-00.esf3d']);
    const before = await snapshotFolder(workspace.dir);

    const result = await run([...args, '--library', workspace.library], { HOME: workspace.dir, PCO_API_BASE: fake.base, PCO_ENV: token });

    // The command ran, and printed what it lists.
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe(first);
    expect(await snapshotFolder(home.showFolder)).toEqual(showFolderBefore);
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });
});

describe('pnpm build-set --show-folder', { timeout: 30_000 }, () => {
  it('is a flag a build takes', async () => {
    const workspace = await createWorkspace();

    const result = await run(['grace', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(existsSync(setPath(workspace))).toBe(true);
  });

  // The listings and the chart skeleton read no show folder, so the flag is none of theirs, as --set-manifest is none.
  it.each([
    { mode: '--list', args: ['--list'], problem: '--list takes only --library, --pads, --date, --replace and --output-root, not --show-folder.' },
    {
      mode: '--plan --list',
      args: ['--plan', '--list'],
      problem: '--plan --list takes only --library, --pads, --template, --date, --service-type, --plan-id, --overlap, --pad, --gap, --replace and --output-root, not --show-folder.',
    },
    { mode: '--skeleton', args: ['--skeleton', 'grace'], problem: '--skeleton takes only --library and --pads, not --show-folder.' },
    { mode: '--plan --skeleton', args: ['--plan', '--skeleton'], problem: '--plan --skeleton takes only --library, --pads, --date, --service-type and --plan-id, not --show-folder.' },
  ])('is no flag of $mode, which stops on it with a usage message, exit 2', async ({ args, problem }) => {
    const workspace = await createWorkspace();

    // HOME and the token file's path are in the workspace, though the command stops before it reads either.
    const result = await run([...args, '--library', workspace.library, '--show-folder', workspace.showFolder], { HOME: workspace.dir, PCO_ENV: join(workspace.dir, 'pco.env') });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
  });
});

// The command reads config/lights.json beside its own source, as it reads the stem map, so each case runs a copy of src/
// in the workspace with its own config/ beside it: the repo's stem map, and the lights config of the case. node finds
// the packages up the tree, in the repo's node_modules.
describe('pnpm build-set, the lights config', { timeout: 30_000 }, () => {
  const SHAPE = 'config/lights.json must give templateShowName and weeklyShowNamePrefix each as a show name in quotes, not empty and with no "/" in it:';
  const lights = (value: unknown) => async (config: string) => writeFile(join(config, 'lights.json'), `${JSON.stringify(value, null, 2)}\n`);

  it.each([
    { name: 'missing', config: async () => {}, line: /^config\/lights\.json cannot be read: .*ENOENT/ },
    {
      name: 'not JSON, with a trailing comma',
      config: async (config: string) => writeFile(join(config, 'lights.json'), '{\n  "templateShowName": "Church Sunday template",\n  "weeklyShowNamePrefix": "Church Sunday",\n}\n'),
      line: /^config\/lights\.json is not valid JSON: \S/,
    },
    {
      name: 'a list at the top level',
      config: lights(['Church Sunday template', 'Church Sunday']),
      line: 'config/lights.json must be an object that gives templateShowName and weeklyShowNamePrefix, and its top level is a list.',
    },
    { name: 'without its templateShowName', config: lights({ weeklyShowNamePrefix: 'Church Sunday' }), line: `${SHAPE} templateShowName is missing.` },
    {
      name: 'giving weeklyShowNamePrefix as a number',
      config: lights({ templateShowName: 'Church Sunday template', weeklyShowNamePrefix: 7 }),
      line: `${SHAPE} weeklyShowNamePrefix is a number.`,
    },
    {
      name: 'giving an empty templateShowName and a weeklyShowNamePrefix with a "/" in it',
      config: lights({ templateShowName: ' ', weeklyShowNamePrefix: '../Church Sunday' }),
      line: `${SHAPE} templateShowName is empty, and weeklyShowNamePrefix holds a "/".`,
    },
  ])('prints one problem line without a stack, exits 1, builds no set and makes no copy when config/lights.json is $name', async ({ config, line }) => {
    const workspace = await createWorkspace();
    const app = join(workspace.dir, 'app');
    await cp(join(REPO_ROOT, 'src'), join(app, 'src'), { recursive: true });
    await mkdir(join(app, 'config'));
    await cp(join(REPO_ROOT, 'config/stem-map.json'), join(app, 'config/stem-map.json'));
    await config(join(app, 'config'));
    await addTemplateShow(workspace, '2026-11-10 09-00-00', 'the template show file');
    const before = await snapshotFolder(workspace.showFolder);

    const result = await output(spawn(process.execPath, [join(app, 'src/set-builder/main.ts'), 'grace', '--date', DATE, ...paths(workspace)], { cwd: workspace.dir }));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toMatch(/^\s+at /m);
    const problems = result.stderr.trimEnd().split('\n');
    expect(problems).toHaveLength(1);
    if (typeof line === 'string') expect(problems[0]).toBe(line);
    else expect(problems[0]).toMatch(line);
    expect(existsSync(projectFolder(workspace))).toBe(false);
    expect(existsSync(workspace.setManifest)).toBe(false);
    expect(await snapshotFolder(workspace.showFolder)).toEqual(before);
  });
});

describe('the usage text and the README, on the weekly show file', { timeout: 30_000 }, () => {
  // The usage text, as the command prints it on a usage error: with no song named, it stops before it reads or writes
  // anything.
  async function usageText(): Promise<string> {
    const workspace = await createWorkspace();
    const result = await run(['--date', DATE, ...paths(workspace)]);
    expect(result.code).toBe(2);
    return result.stderr.slice(result.stderr.indexOf('Usage:'));
  }

  it('names --show-folder on the two lines of a build and the line of the lights mode, and on no line of a listing or a chart skeleton', async () => {
    const usage = await usageText();

    const synopsis = usage.split('\n').filter((line) => line.startsWith('  pnpm build-set'));
    expect(synopsis).toHaveLength(8);
    expect(synopsis.filter((line) => line.endsWith(' [--set-manifest <path>] [--show-folder <folder>]')).map((line) => line.split(' [')[0])).toEqual([
      '  pnpm build-set <song>',
      '  pnpm build-set --plan',
    ]);
    expect(synopsis.filter((line) => line.includes('--show-folder')).map((line) => line.split(' [')[0])).toEqual(['  pnpm build-set <song>', '  pnpm build-set --plan', '  pnpm build-set --lights']);
  });

  it('says in the usage text what the weekly show file is, where its names come from, what prints, and what no template gives', async () => {
    const usage = unwrapped(await usageText());

    for (const sentence of [
      'After the set, every build makes the weekly show file for the lights in the show folder: a copy of the newest template show file there, named <weekly show name prefix> <date> <time of the copy>.esf3d.',
      'Eos names each save of a show <show name> <YYYY-MM-DD HH-MM-SS>.esf3d and keeps every save as its own file, so the newest is the one with the latest time in its name.',
      'The template show name and the weekly show name prefix come from config/lights.json in this repository.',
      "--show-folder <folder> names the show folder, by default ~/Documents/ETC, Eos's own, and a relative one resolves as --output-root does.",
      'After the summary, the build prints the path of the weekly show file and the three steps that open it in ETCnomad: File, Open; the file; OK.',
      'With no template show file in the show folder, the set is still built, exit 0, and one line after the summary says the lights step is not done, with the folder and the show name it looked for.',
      'The build never replaces or deletes a file in the show folder: a rebuild with --replace makes a newer weekly show file and leaves the older one.',
      'A build with a problem makes no weekly show file, and neither do --list, --plan --list and --skeleton, which take no --show-folder.',
      'The build talks to no Eos.',
    ]) {
      expect(usage).toContain(sentence);
    }
  });

  it('says in the README what the weekly show file is, names the flag with its default, and names config/lights.json as a thing the build expects', async () => {
    const text = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
    const start = text.indexOf('## Building the Sunday set\n');
    const section = text.slice(start, text.indexOf('\n## ', start + 1));

    expect(section).toContain("- `--show-folder <folder>`: the Eos show folder, where the build finds the template show file and makes the weekly show file. It defaults to `~/Documents/ETC`, Eos's own.");
    expect(section).toContain('a copy of the newest template show file in the show folder, named `<weekly show name prefix> <date> <time of the copy>.esf3d`, such as `Church Sunday 2026-10-18 2026-10-15 20-04-09.esf3d`');
    expect(section).toContain('the three steps that open it in ETCnomad: File, Open; the file; OK');
    expect(section).toContain('`The lights step is not done: no template show file named "Church Sunday template" was found in <show folder>.`');
    expect(section).toContain('The build expects four things:');
    expect(section).toContain('- The lights config at `config/lights.json` in this repository');
    expect(section).not.toContain('\u2014');
  });
});
