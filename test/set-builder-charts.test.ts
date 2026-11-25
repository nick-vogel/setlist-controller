import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CHARTS_API } from '../src/shared/routes.ts';
import { parseSetManifest, SET_MANIFEST_FILE, type ManifestSong, type SetCharts, type SetManifest } from '../src/shared/set-manifest.ts';
import { readSetup, startRig, type Rig } from './harness.ts';
import { madeUpChart, readFixtures, requestKey, startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import { addPad, addPadTrack, copySongAs, createWorkspace, GOODNESS, GRACE, GREAT_ARE, noTemplateLine, projectFolder, REPO_ROOT, removeWorkspaces, setPath, type Workspace } from './set-builder-harness.ts';

// `pnpm build-set` and the set manifest: a --plan build pulls each song's chart from its arrangement in Planning Center,
// every build writes the manifest the server reads, and --plan --list warns for a song with no chart text or no chords.
// Every test points the command at the fake Planning Center by PCO_API_BASE, at a token file in its workspace by PCO_ENV,
// and at a manifest inside its workspace, so none reaches the real API, reads the real token or writes the real manifest.
// Every chart here is the fake's made-up one.

const CLIENT_ID = 'fake-client-id-c398';
const SECRET = 'fake-secret-5e2d';

// The Phase 0 test plan: WELCOME HOME in F, Yes And Amen in G, an item "Prayer", then Fall Like Rain in E. Its workspace
// makes each song's folder from a fixture song.
const PHASE_0 = '2027-01-03';
const PHASE_0_ITEMS = '/service_types/997539/plans/92852532/items?include=song,key,arrangement&per_page=100';
const WELCOME_HOME = 'WELCOME HOME-Elevation Rhythm-F-98.00bpm';
const YES_AND_AMEN = 'Yes And Amen-Jesus Culture-G-72.00bpm';
const FALL_LIKE_RAIN = 'Fall Like Rain-Passion-E-70.00bpm';
// The arrangements of the three songs in the Phase 0 plan.
const WELCOME_HOME_ARRANGEMENT = '36313264';
const YES_AND_AMEN_ARRANGEMENT = '21716143';
const FALL_LIKE_RAIN_ARRANGEMENT = '36302201';

const fakes: PlanningCenter[] = [];
let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await removeWorkspaces();
});

// The token file, in the workspace, readable by its owner alone.
async function tokenFile(workspace: Workspace): Promise<string> {
  const file = join(workspace.dir, 'pco.env');
  await writeFile(file, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET='${SECRET}'\n`);
  await chmod(file, 0o600);
  return file;
}

// The command as the operator runs it, through the package.json script, from `cwd`, against the fake and the workspace's
// token file, with any other environment `env` gives.
function run(
  args: string[],
  fake: PlanningCenter,
  token: string,
  { cwd = REPO_ROOT, env = {} }: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'build-set', ...args], { cwd, env: { ...process.env, PCO_API_BASE: fake.base, PCO_ENV: token, ...env } });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// A recorded body, as far as a test edits it.
type ItemRecord = { type: string; id: string; attributes: Record<string, unknown> };
type ItemsBody = { data: ItemRecord[]; included?: ItemRecord[] };

// The recorded Planning Center, with the Phase 0 items answer edited by `edit`, or as recorded with none.
async function planningCenter(edit?: (items: ItemsBody) => void): Promise<PlanningCenter> {
  const fixtures = await readFixtures();
  if (edit !== undefined) {
    const at = fixtures.findIndex((fixture) => requestKey(fixture.path) === requestKey(PHASE_0_ITEMS));
    const fixture = fixtures[at]!;
    const body = structuredClone(fixture.body) as ItemsBody;
    edit(body);
    fixtures[at] = { ...fixture, body };
  }
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET, fixtures });
  fakes.push(fake);
  return fake;
}

// The arrangement with id `id` in an items body.
function arrangement(body: ItemsBody, id: string): ItemRecord {
  const found = body.included?.find((each) => each.type === 'Arrangement' && each.id === id);
  if (found === undefined) throw new Error(`No Arrangement ${id}`);
  return found;
}

// The workspace a Phase 0 build needs: a folder for each of its songs in the plan's key, made from fixture songs, the
// template's PAD track, and the pad in E.
async function phase0Workspace(): Promise<Workspace & { manifest: string }> {
  const workspace = await createWorkspace();
  await copySongAs(workspace, GRACE, WELCOME_HOME);
  await copySongAs(workspace, GREAT_ARE, YES_AND_AMEN);
  await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
  await addPadTrack(workspace);
  await addPad(workspace, 'E', 120);
  return { ...workspace, manifest: join(workspace.dir, SET_MANIFEST_FILE) };
}

// A build's paths but its set manifest, each inside the workspace, the show folder too: the default is the real Eos show
// folder, ~/Documents/ETC.
const paths = (workspace: Workspace) => ['--library', workspace.library, '--template', workspace.template, '--output-root', workspace.outputRoot, '--show-folder', workspace.showFolder];
const listPaths = (workspace: Workspace) => ['--library', workspace.library, '--output-root', workspace.outputRoot];

// The manifest a build wrote, each song checked for the durations every build gives it and then shown without them. This
// is the one check that the command itself, not buildSet alone, writes them to the file; test/set-builder-durations.test.ts
// checks their values.
async function readManifest(path: string): Promise<SetManifest> {
  const manifest = JSON.parse(await readFile(path, 'utf8')) as SetManifest;
  for (const song of manifest.songs) expect(song.durations?.sections.length, song.title).toBeGreaterThan(0);
  return { songs: untimed(manifest.songs) };
}

function untimed(songs: ManifestSong[]): ManifestSong[] {
  return songs.map((song) => {
    const copy = { ...song };
    delete copy.durations;
    return copy;
  });
}

// A manifest song with the fake's made-up chart for its arrangement.
function charted(title: string, stemsKey: string, meter: string, arrangementId: string) {
  const { chord_chart, chord_chart_key } = madeUpChart(arrangementId);
  return { title, stemsKey, meter, chartKey: chord_chart_key, chartText: chord_chart };
}

// Yes And Amen is made from Great Are You Lord, which is in 6/8; the other two are in 4/4.
const PHASE_0_SONGS = [
  charted('WELCOME HOME', 'F', '4/4', WELCOME_HOME_ARRANGEMENT),
  charted('Yes And Amen', 'G', '6/8', YES_AND_AMEN_ARRANGEMENT),
  charted('Fall Like Rain', 'E', '4/4', FALL_LIKE_RAIN_ARRANGEMENT),
];

describe('pnpm build-set --plan and the set manifest', () => {
  it("writes each song's title, stems key, starting meter, and its arrangement's chart key and chart text, in set order", async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace), '--set-manifest', workspace.manifest], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(await readManifest(workspace.manifest)).toEqual({ songs: PHASE_0_SONGS });
  });

  it('writes no chart key and no chart text for a song whose arrangement has no chord chart', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter((items) => {
      Object.assign(arrangement(items, YES_AND_AMEN_ARRANGEMENT).attributes, { chord_chart: null, chord_chart_key: 'G' });
      Object.assign(arrangement(items, FALL_LIKE_RAIN_ARRANGEMENT).attributes, { chord_chart: ' \n ', chord_chart_key: 'E' });
    });

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace), '--set-manifest', workspace.manifest], fake, await tokenFile(workspace));

    expect(result.code).toBe(0);
    expect(await readManifest(workspace.manifest)).toEqual({
      songs: [PHASE_0_SONGS[0], { title: 'Yes And Amen', stemsKey: 'G', meter: '6/8' }, { title: 'Fall Like Rain', stemsKey: 'E', meter: '4/4' }],
    });
  });

  it('writes the chart text as Planning Center holds it, trimmed at its ends', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter((items) => {
      Object.assign(arrangement(items, WELCOME_HOME_ARRANGEMENT).attributes, { chord_chart: '\n  VERSE 1\n[F]Words  of  its own\n\n', chord_chart_key: ' F ' });
    });

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace), '--set-manifest', workspace.manifest], fake, await tokenFile(workspace));

    expect(result.code).toBe(0);
    expect((await readManifest(workspace.manifest)).songs[0]).toEqual({ title: 'WELCOME HOME', stemsKey: 'F', meter: '4/4', chartKey: 'F', chartText: 'VERSE 1\n[F]Words  of  its own' });
  });
});

// The Phase 0 listing with every song's chart, as it prints with no problem: the songs, the items after the first song,
// and the BPM and meter warnings the plan gives in its workspace.
const PHASE_0_LISTING = [
  '2027-01-03 Sunday',
  `1. WELCOME HOME  F  ${WELCOME_HOME}  overlap, from the plan`,
  `2. Yes And Amen  G  ${YES_AND_AMEN}  pad in E, from the plan`,
  'Prayer: a pad after song 2',
  `3. Fall Like Rain  E  ${FALL_LIKE_RAIN}`,
  'FaceTime: no effect',
  'MC: no effect',
  'Scripture Reading: no effect',
  'Message: no effect',
  'Prayer: no effect',
  'Dismissal: no effect',
  'Warning: song 1, "WELCOME HOME", is planned at 134 BPM, and its folder WELCOME HOME-Elevation Rhythm-F-98.00bpm is at 98 BPM.',
  'Warning: song 2, "Yes And Amen", is planned in 4/4, and its song starts in 6/8.',
];
const NO_CHART = 'Warning: song 2, "Yes And Amen", has no chart text in Planning Center, so the chart view shows "No chart for this song".';
const NO_CHORDS = 'Warning: song 3, "Fall Like Rain", has chart text in Planning Center with no chords in square brackets, so the chart view shows no chords for it.';

// Yes And Amen with no chord chart, and Fall Like Rain with a chart of words alone, a bracket holding only spaces.
function chartsMissing(items: ItemsBody): void {
  arrangement(items, YES_AND_AMEN_ARRANGEMENT).attributes.chord_chart = null;
  arrangement(items, FALL_LIKE_RAIN_ARRANGEMENT).attributes.chord_chart = 'VERSE\nMade up words with no chords [ ]\n\nCHORUS\nA made up chorus line';
}

describe('pnpm build-set --plan --list and the charts', () => {
  it('warns for a song with no chart text and for one whose chart has no chords in square brackets, after the BPM and meter warnings, and exits 0 as it does with every chart', async () => {
    const workspace = await phase0Workspace();
    const token = await tokenFile(workspace);

    const charted = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], await planningCenter(), token);
    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], await planningCenter(chartsMissing), token);

    expect(charted.stdout).toBe(`${PHASE_0_LISTING.join('\n')}\n`);
    expect(charted.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(`${[...PHASE_0_LISTING, NO_CHART, NO_CHORDS].join('\n')}\n`);
    expect(result.code).toBe(0);
  });

  it('warns for a song with no folder too, and exits 1 for the folder problem as it does without the warnings', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, WELCOME_HOME);
    await copySongAs(workspace, GREAT_ARE, YES_AND_AMEN);
    await addPadTrack(workspace);
    await addPad(workspace, 'E', 120);
    const token = await tokenFile(workspace);

    const charted = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], await planningCenter(), token);
    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], await planningCenter(chartsMissing), token);

    expect(charted.code).toBe(1);
    expect(charted.stdout).not.toContain('chart');
    expect(result.code).toBe(1);
    expect(result.stdout.split('\n').slice(-3)).toEqual([NO_CHART, NO_CHORDS, '']);
  });

  it('prints no chart warning in a build\'s summary', async () => {
    const workspace = await phase0Workspace();

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace), '--set-manifest', workspace.manifest], await planningCenter(chartsMissing), await tokenFile(workspace));

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('chart');
  });
});

describe('the commands that write nothing and --set-manifest', () => {
  it.each([
    { mode: '--list', args: ['--list'], problem: '--list takes only --library, --pads, --date, --replace and --output-root, not --set-manifest.' },
    {
      mode: '--plan --list',
      args: ['--plan', '--list'],
      problem: '--plan --list takes only --library, --pads, --template, --date, --service-type, --plan-id, --overlap, --pad, --gap, --replace and --output-root, not --set-manifest.',
    },
    { mode: '--skeleton', args: ['--skeleton', 'grace'], problem: '--skeleton takes only --library and --pads, not --set-manifest.' },
  ])('$mode refuses it as a usage error, exit 2, and writes no manifest', async ({ args, problem }) => {
    const workspace = await phase0Workspace();

    const result = await run([...args, '--library', workspace.library, '--set-manifest', workspace.manifest], await planningCenter(), await tokenFile(workspace));

    expect(result.code).toBe(2);
    expect(result.stderr.split('\n')[0]).toBe(problem);
    expect(existsSync(workspace.manifest)).toBe(false);
  });
});

describe('a manifest the build writes, read by the server', () => {
  // The Count Off and the first section of each Phase 0 song, as the built set names its locators.
  const SET = [
    { name: '1 - Count Off (WELCOME HOME)', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '2 - Count Off (Yes And Amen)', time: 40 },
    { name: '2 - Verse', time: 48 },
    { name: '3 - Count Off (Fall Like Rain)', time: 80 },
    { name: '3 - Verse', time: 88 },
    { name: '3 - End', time: 120 },
  ];

  it('is one the server reads: it serves the same songs, chart text and all', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();
    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace), '--set-manifest', workspace.manifest], fake, await tokenFile(workspace));
    expect(result.code).toBe(0);

    const parsed = parseSetManifest(await readFile(workspace.manifest, 'utf8'));
    if (!('manifest' in parsed)) throw new Error(parsed.problem);
    expect(parsed.manifest.songs.every((song) => song.durations !== undefined)).toBe(true);
    expect(untimed(parsed.manifest.songs)).toEqual(PHASE_0_SONGS);
    rig = await startRig(SET, {}, { setManifest: workspace.manifest });
    const served = (await readSetup<SetCharts>(rig.server.httpPort, CHARTS_API, 'the charts')).songs;
    expect(served).toEqual(parsed.manifest.songs);
  });
});

describe('pnpm build-set by song names and the set manifest', () => {
  it("writes each song's title and stems key with no chart key and no chart text, replacing a --plan build's manifest", async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();
    const token = await tokenFile(workspace);
    expect((await run(['--plan', '--date', PHASE_0, ...paths(workspace), '--set-manifest', workspace.manifest], fake, token)).code).toBe(0);

    const result = await run(
      [WELCOME_HOME, YES_AND_AMEN, FALL_LIKE_RAIN, '--date', PHASE_0, '--replace', projectFolder(workspace, PHASE_0), ...paths(workspace), '--set-manifest', workspace.manifest],
      fake,
      token,
    );

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(await readManifest(workspace.manifest)).toEqual({
      songs: [
        { title: 'WELCOME HOME', stemsKey: 'F', meter: '4/4' },
        { title: 'Yes And Amen', stemsKey: 'G', meter: '6/8' },
        { title: 'Fall Like Rain', stemsKey: 'E', meter: '4/4' },
      ],
    });
  });

  it('writes a null stems key for a song whose folder name writes no key that is a note name', async () => {
    const workspace = await phase0Workspace();
    await copySongAs(workspace, GRACE, 'Grace Acoustic-98.00bpm');
    const fake = await planningCenter();

    const result = await run(['acoustic', '--date', PHASE_0, ...paths(workspace), '--set-manifest', workspace.manifest], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(await readManifest(workspace.manifest)).toEqual({ songs: [{ title: 'Grace Acoustic', stemsKey: null, meter: '4/4' }] });
  });
});

describe('where a build writes the set manifest', () => {
  it("writes it by default to set-manifest.json in the app's support folder in the home folder, the server's own default", async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run([WELCOME_HOME, '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace), { env: { HOME: workspace.dir } });

    expect(result.code).toBe(0);
    expect(await readManifest(join(workspace.dir, 'Library/Application Support/setlist-controller', SET_MANIFEST_FILE))).toEqual({
      songs: [{ title: 'WELCOME HOME', stemsKey: 'F', meter: '4/4' }],
    });
  });

  it('resolves a relative --set-manifest against the folder the command runs in, and makes its folder', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run([WELCOME_HOME, '--date', PHASE_0, ...paths(workspace), '--set-manifest', 'charts/this-week.json'], fake, await tokenFile(workspace), {
      cwd: workspace.dir,
    });

    expect(result.code).toBe(0);
    expect(await readManifest(join(workspace.dir, 'charts/this-week.json'))).toEqual({ songs: [{ title: 'WELCOME HOME', stemsKey: 'F', meter: '4/4' }] });
  });

  it('leaves the last manifest as it was, byte for byte, when the build stops on a problem', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();
    const last = '{ "songs": [{ "title": "Last Week", "stemsKey": "A" }] }\n';
    await writeFile(workspace.manifest, last);

    const result = await run(['no such song', '--date', PHASE_0, ...paths(workspace), '--set-manifest', workspace.manifest], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(await readFile(workspace.manifest, 'utf8')).toBe(last);
  });

  it('prints one line naming the manifest it cannot write, exit 1, with the set built and its summary printed', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();
    await writeFile(join(workspace.dir, 'a file'), 'not a folder\n');
    const manifest = join(workspace.dir, 'a file', SET_MANIFEST_FILE);

    const result = await run([WELCOME_HOME, '--date', PHASE_0, ...paths(workspace), '--set-manifest', manifest], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(new RegExp(`^The set is built, but the set manifest ${escape(manifest)} cannot be written: [^\n]+\\. The chart view still shows the last manifest's charts\\.\n$`));
    expect(result.stdout.trim().split('\n').slice(-2)).toEqual([setPath(workspace, PHASE_0), noTemplateLine(workspace)]);
    expect(existsSync(setPath(workspace, PHASE_0))).toBe(true);
  });
});

// `text` as a regular expression matches it.
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
