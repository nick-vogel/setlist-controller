import { spawn } from 'node:child_process';
import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nameKey } from '../src/set-builder/name-rule.ts';
import { leftOutNote, skeletonLines, songSkeleton } from '../src/set-builder/skeleton.ts';
import { chartHeading } from '../src/shared/chart-heading.ts';
import { startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import {
  copySongAs,
  createWorkspace,
  editSongTrack,
  GOODNESS,
  GRACE,
  GREAT_ARE,
  libraryFile,
  REPO_ROOT,
  removeWorkspaces,
  setSongVersion,
  snapshotFolder,
  type Workspace,
} from './set-builder-harness.ts';

// The chart skeleton: each song's locator names, each once in first-played order, as the headings Nick pastes into the
// song's chord chart in Planning Center.

// Each test here spawns pnpm build-set, which a loaded CI runner can take past vitest's 5 s default, so every describe
// gives its tests 30 s, as set-builder-lights.test.ts does. A build that hangs still fails, at 30 s.
describe('the chart skeleton of a song', { timeout: 30_000 }, () => {
  it('gives each locator name the heading rule reads once, in first-played order, in upper case', () => {
    const names = ['Count Off', 'Intro', 'Verse 1', 'Chorus', 'Intro', 'Verse 2', 'Chorus', 'Bridge', 'Bridge', 'Chorus', 'Ending', ' '];

    expect(songSkeleton(names)).toEqual({ headings: ['INTRO', 'VERSE 1', 'CHORUS', 'VERSE 2', 'BRIDGE', 'ENDING'], leftOut: [] });
  });

  it('takes two names that are one name by the name rule of the set builder as one heading, spelled as first played', () => {
    expect(songSkeleton(['Chorus', ' chorus ', 'CHORUS', 'Verse  1', 'verse 1']).headings).toEqual(['CHORUS', 'VERSE 1']);
  });

  it('keeps a numbered name apart from the same word without its number', () => {
    expect(songSkeleton(['Chorus', 'Chorus 2', 'Chorus']).headings).toEqual(['CHORUS', 'CHORUS 2']);
  });

  it('leaves out Count Off and a blank locator without a word', () => {
    expect(songSkeleton(['Count Off', 'count off', '', ' ', 'Intro'])).toEqual({ headings: ['INTRO'], leftOut: [] });
  });

  it('leaves out every other name the heading rule does not read, once each, in first-played order', () => {
    const names = ['Count Off', 'Intro', 'Pre Chorus', 'Chorus', 'Breakdown', 'Outro', 'Pre Chorus', 'Outro', 'Ending', ' '];

    expect(songSkeleton(names)).toEqual({ headings: ['INTRO', 'CHORUS', 'ENDING'], leftOut: ['Pre Chorus', 'Breakdown', 'Outro'] });
  });

  it('gives an empty skeleton for a song with no locators', () => {
    expect(songSkeleton([])).toEqual({ headings: [], leftOut: [] });
  });
});

describe('the skeleton as printed', { timeout: 30_000 }, () => {
  it('gives each song its number and title, its headings one per line, and one blank line between songs', () => {
    const lines = skeletonLines([
      { number: 1, title: 'This Is Amazing Grace', headings: ['INTRO', 'VERSE 1'] },
      { number: 3, title: 'Goodness of God', headings: ['INTRO', 'TAG'] },
    ]);

    expect(lines).toEqual(['1. This Is Amazing Grace', 'INTRO', 'VERSE 1', '', '3. Goodness of God', 'INTRO', 'TAG']);
  });

  it('names the locators a song leaves out in one note', () => {
    expect(leftOutNote('Great Are You Lord', ['Pre Chorus', 'Breakdown', 'Outro'])).toBe(
      'Note: "Great Are You Lord" has the locators Pre Chorus, Breakdown and Outro, which are no chart heading, so the skeleton leaves them out. The chart view shows each with its name and bar count.',
    );
    expect(leftOutNote('This Is Amazing Grace', ['Outro'])).toBe(
      'Note: "This Is Amazing Grace" has the locator Outro, which is no chart heading, so the skeleton leaves it out. The chart view shows it with its name and bar count.',
    );
  });

  it('gives no note for a song that leaves nothing out', () => {
    expect(leftOutNote('Goodness of God', [])).toBeUndefined();
  });
});

// The command, `pnpm build-set --skeleton` and `pnpm build-set --plan --skeleton`, as Nick runs it, through the package.json
// script with pnpm's own output silenced. HOME is the test's workspace, so the command's default library and output root,
// under ~/Music, are inside it too, and `--library` points at the workspace's copy of the fixture library. The plan runs
// read the fake Planning Center by PCO_API_BASE with a token file in the workspace by PCO_ENV, so none reaches the real
// API or reads the real token.

const CLIENT_ID = 'fake-client-id-3f9a';
const SECRET = 'fake-secret-b71c';

// The Phase 0 test plan: WELCOME HOME in F, Yes And Amen in G, then Fall Like Rain in E. Its workspace makes WELCOME HOME
// from This Is Amazing Grace, Yes And Amen from Great Are You Lord and Fall Like Rain from Goodness of God.
const PHASE_0 = '2027-01-03';
const WELCOME_HOME = 'WELCOME HOME-Elevation Rhythm-F-98.00bpm';
const YES_AND_AMEN = 'Yes And Amen-Jesus Culture-G-72.00bpm';
const FALL_LIKE_RAIN = 'Fall Like Rain-Passion-E-70.00bpm';

// Each fixture song's skeleton, from the locators of its MultiTrack.als in time order.
const GRACE_HEADINGS = ['INTRO', 'VERSE 1', 'CHORUS', 'VERSE 2', 'BRIDGE', 'ENDING'];
const GOODNESS_HEADINGS = ['INTRO', 'VERSE 1', 'CHORUS', 'VERSE 2', 'BRIDGE', 'INTERLUDE', 'VAMP', 'TAG', 'ENDING'];
const GREAT_ARE_HEADINGS = ['INTRO', 'VERSE 1', 'CHORUS', 'INTERLUDE', 'VERSE 2', 'BRIDGE', 'ENDING'];
const TRUST_HEADINGS = ['INTRO', 'VERSE 1', 'CHORUS', 'VERSE 2', 'VAMP', 'BRIDGE', 'INSTRUMENTAL', 'VERSE 3', 'ENDING'];

const note = (title: string, names: string) =>
  `Note: "${title}" has the locators ${names}, which are no chart heading, so the skeleton leaves them out. The chart view shows each with its name and bar count.`;
const noteOne = (title: string, name: string) =>
  `Note: "${title}" has the locator ${name}, which is no chart heading, so the skeleton leaves it out. The chart view shows it with its name and bar count.`;

const fakes: PlanningCenter[] = [];

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await removeWorkspaces();
});

function run(args: string[], workspace: Workspace, env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, HOME: workspace.dir, ...env } });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const lines = (...each: string[]) => [...each, ''].join('\n');

async function planningCenter(): Promise<PlanningCenter> {
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET });
  fakes.push(fake);
  return fake;
}

// The environment a plan run reads the fake by, with the token file in the workspace, readable by its owner alone.
async function planEnv(workspace: Workspace, fake: PlanningCenter): Promise<Record<string, string>> {
  const file = join(workspace.dir, 'pco.env');
  await writeFile(file, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET='${SECRET}'\n`);
  await chmod(file, 0o600);
  return { PCO_API_BASE: fake.base, PCO_ENV: file };
}

describe('pnpm build-set --skeleton', { timeout: 30_000 }, () => {
  it('prints the skeleton of each song named, in the order named, each locator name once in first-played order, and the note on stderr', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--skeleton', 'grace', 'lord', '--library', workspace.library], workspace);

    expect(result.stdout).toBe(lines('1. This Is Amazing Grace', ...GRACE_HEADINGS, '', '2. Great Are You Lord', ...GREAT_ARE_HEADINGS));
    expect(result.stderr).toBe(lines(noteOne('This Is Amazing Grace', 'Outro'), note('Great Are You Lord', 'Pre Chorus, Breakdown and Outro')));
    expect(result.code).toBe(0);
  });

  it('gives no note for songs whose every locator is a heading or Count Off or blank', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--skeleton', 'goodness', 'trust', '--library', workspace.library], workspace);

    expect(result.stdout).toBe(lines('1. Goodness of God', ...GOODNESS_HEADINGS, '', '2. Trust In God', ...TRUST_HEADINGS));
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('prints for every fixture song only headings the heading rule reads, each once by the name rule', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--skeleton', 'goodness', 'trust', 'grace', 'lord', '--library', workspace.library], workspace);

    expect(result.code).toBe(0);
    const songs = result.stdout.trimEnd().split('\n\n').map((song) => song.split('\n'));
    expect(songs).toHaveLength(4);
    for (const [title, ...headings] of songs) {
      expect(title).toMatch(/^\d+\. /);
      expect(headings.length).toBeGreaterThan(0);
      for (const heading of headings) expect(chartHeading(heading), heading).toBeDefined();
      expect(new Set(headings.map(nameKey)).size).toBe(headings.length);
    }
  });

  it('writes nothing, under the workspace or the default output root in its HOME', async () => {
    const workspace = await createWorkspace();
    const before = await snapshotFolder(workspace.dir);

    const result = await run(['--skeleton', 'grace', 'lord', 'goodness', 'trust', '--library', workspace.library], workspace);

    expect(result.code).toBe(0);
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });

  it('prints every skeleton it can, then the problem of a name that matches no song folder on stderr, exit 1', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--skeleton', 'goodness', 'nothing', '--library', workspace.library], workspace);

    expect(result.stdout).toBe(lines('1. Goodness of God', ...GOODNESS_HEADINGS));
    expect(result.stderr).toContain(`"nothing" matches no song folder in ${workspace.library}.`);
    expect(result.code).toBe(1);
  });

  it('prints the other songs when a song cannot be read, then its problem on stderr, exit 1', async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace.library, GOODNESS, 'MultiTrack.als'), 'Not a gzipped Live set');

    const result = await run(['--skeleton', 'goodness', 'trust', '--library', workspace.library], workspace);

    expect(result.stdout).toBe(lines('2. Trust In God', ...TRUST_HEADINGS));
    expect(result.stderr).toBe(lines(`${GOODNESS}: the song could not be read: incorrect header check`));
    expect(result.code).toBe(1);
  });

  it('prints the other songs when a song was not saved by Live 12, then its problem on stderr, exit 1', async () => {
    const workspace = await createWorkspace();
    await setSongVersion(workspace, GOODNESS, { MinorVersion: '11.0_11300', Creator: 'Ableton Live 11.3.4' });

    const result = await run(['--skeleton', 'goodness', 'trust', '--library', workspace.library], workspace);

    expect(result.stdout).toBe(lines('2. Trust In God', ...TRUST_HEADINGS));
    expect(result.stderr).toBe(lines(`${GOODNESS}: saved by Ableton Live 11.3.4, not Live 12. Open the song in Live 12 and save it, then build again.`));
    expect(result.code).toBe(1);
  });

  // The content problems a build stops on: the skeleton reads the locators alone, so the song still gets its skeleton.
  it.each([
    { content: 'a WAV its clips play missing from its folder', change: (workspace: Workspace) => rm(libraryFile(workspace, GOODNESS, 'AG 3.wav')) },
    {
      content: 'a frozen stem',
      change: (workspace: Workspace) => editSongTrack(workspace, GOODNESS, 'EG 1', (text) => text.replace('<Freeze Value="false" />', '<Freeze Value="true" />')),
    },
  ])('prints the skeleton of a song with $content, with no problem, exit 0', async ({ change }) => {
    const workspace = await createWorkspace();
    await change(workspace);

    const result = await run(['--skeleton', 'goodness', 'trust', '--library', workspace.library], workspace);

    expect(result.stdout).toBe(lines('1. Goodness of God', ...GOODNESS_HEADINGS, '', '2. Trust In God', ...TRUST_HEADINGS));
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it.each([
    { args: ['--skeleton'], problem: 'Name at least one song.' },
    { args: ['--skeleton', '--list'], problem: '--skeleton prints the chart skeleton and takes no --list.' },
    { args: ['--skeleton', 'grace', '--output-root', 'Sets'], problem: '--skeleton takes only --library and --pads, not --output-root.' },
    { args: ['--skeleton', 'grace', '--date', PHASE_0], problem: '--skeleton takes only --library and --pads, not --date.' },
    { args: ['--plan', '--skeleton', 'grace'], problem: '--plan takes the songs from the plan, not "grace".' },
    { args: ['--plan', '--skeleton', '--replace', 'Sets'], problem: '--plan --skeleton takes only --library, --pads, --date, --service-type, --plan-id and --skip, not --replace.' },
  ])('refuses $args as a usage error, exit 2, writing nothing', async ({ args, problem }) => {
    const workspace = await createWorkspace();
    const before = await snapshotFolder(workspace.dir);

    const result = await run([...args, '--library', workspace.library], workspace);

    expect(result.stdout).toBe('');
    expect(result.stderr.split('\n')[0]).toBe(problem);
    expect(result.code).toBe(2);
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });
});

describe('pnpm build-set --plan --skeleton', { timeout: 30_000 }, () => {
  // The Phase 0 workspace: a folder for each of the plan's songs in its key.
  async function phase0Workspace(): Promise<Workspace> {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, WELCOME_HOME);
    await copySongAs(workspace, GREAT_ARE, YES_AND_AMEN);
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    return workspace;
  }

  it('prints the skeleton of each plan song in plan order, exit 0, and writes nothing', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();
    const env = await planEnv(workspace, fake);
    const before = await snapshotFolder(workspace.dir);

    const result = await run(['--plan', '--skeleton', '--date', PHASE_0, '--library', workspace.library], workspace, env);

    expect(result.stdout).toBe(lines('1. WELCOME HOME', ...GRACE_HEADINGS, '', '2. Yes And Amen', ...GREAT_ARE_HEADINGS, '', '3. Fall Like Rain', ...GOODNESS_HEADINGS));
    expect(result.stderr).toBe(lines(noteOne('WELCOME HOME', 'Outro'), note('Yes And Amen', 'Pre Chorus, Breakdown and Outro')));
    expect(result.code).toBe(0);
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
    expect(fake.requests.every(({ method }) => method === 'GET')).toBe(true);
  });

  it('prints the other songs when a plan song has no folder, then its problem on stderr, exit 1', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, WELCOME_HOME);
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenter();

    const result = await run(['--plan', '--skeleton', '--date', PHASE_0, '--library', workspace.library], workspace, await planEnv(workspace, fake));

    expect(result.stdout).toBe(lines('1. WELCOME HOME', ...GRACE_HEADINGS, '', '3. Fall Like Rain', ...GOODNESS_HEADINGS));
    expect(result.stderr).toBe(lines(noteOne('WELCOME HOME', 'Outro'), `"Yes And Amen" has no song folder in ${workspace.library}. To leave it out of the set, give --skip 2.`));
    expect(result.code).toBe(1);
  });
});

describe('pnpm build-set --plan --skeleton --skip', { timeout: 30_000 }, () => {
  it('leaves a skipped song out with no problem, and keeps the plan numbers of the others, exit 0 (setlist-controller#31)', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, WELCOME_HOME);
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenter();

    const result = await run(['--plan', '--skeleton', '--skip', '2', '--date', PHASE_0, '--library', workspace.library], workspace, await planEnv(workspace, fake));

    expect(result.stdout).toBe(lines('1. WELCOME HOME', ...GRACE_HEADINGS, '', '3. Fall Like Rain', ...GOODNESS_HEADINGS));
    expect(result.stderr).toBe(lines(noteOne('WELCOME HOME', 'Outro')));
    expect(result.code).toBe(0);
  });
});
