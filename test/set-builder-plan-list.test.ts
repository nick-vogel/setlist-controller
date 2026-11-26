import { spawn } from 'node:child_process';
import { access, chmod, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PLANNING_CENTER_FIXTURES_2026_10_22, readFixtures, requestKey, startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import {
  addPad,
  addPadTrack,
  copySongAs,
  createWorkspace,
  FIXTURE_TEMPLATE,
  GOODNESS,
  GRACE,
  GREAT_ARE,
  libraryFile,
  REPO_ROOT,
  removeLocator,
  noTemplateLine,
  removeWorkspaces,
  setPath,
  snapshotFolder,
  type Workspace,
} from './set-builder-harness.ts';

// `pnpm build-set --plan --list`, what the plan resolves to, with nothing written, and the tempo and meter warnings the
// list and the build's summary give when the plan and a song disagree. Every test points the command at the fake
// Planning Center by PCO_API_BASE and at a token file in its workspace by PCO_ENV, so none reaches the real API or reads
// the real token.

const CLIENT_ID = 'fake-client-id-3f9a';
const SECRET = 'fake-secret-b71c';

// The recorded November 1 plan: This Is Amazing Grace in D at 98 BPM in 4/4, Great Are You Lord in D at 72 BPM in 6/8,
// Fall Like Rain in E at 70 BPM in 4/4, then a "Prayer" after the message.
const NOVEMBER_1 = '2026-11-01';
const FALL_LIKE_RAIN = 'Fall Like Rain-Passion-E-70.00bpm';

// The Phase 0 test plan: WELCOME HOME in F at 134 BPM in 4/4 with an "Overlap" note, Yes And Amen in G at 72 BPM in 4/4,
// an item "Prayer", Fall Like Rain in E at 70 BPM in 4/4, and a second "Prayer" after the message. Its workspace makes
// WELCOME HOME from This Is Amazing Grace, which starts at 98 BPM in 4/4, and Yes And Amen from Great Are You Lord,
// which starts in 6/8.
const PHASE_0 = '2027-01-03';
const PHASE_0_ITEMS = '/service_types/997539/plans/92852532/items?include=song,key,arrangement&per_page=100';
const PHASE_0_NOTES = '/service_types/997539/plans/92852532/items?include=item_notes&per_page=100';
const WELCOME_HOME = 'WELCOME HOME-Elevation Rhythm-F-98.00bpm';
const YES_AND_AMEN = 'Yes And Amen-Jesus Culture-G-72.00bpm';
// Yes And Amen's item in the Phase 0 plan, and the arrangements of WELCOME HOME and Yes And Amen there.
const YES_AND_AMEN_ITEM = '1248613325';
const WELCOME_HOME_ARRANGEMENT = '36313264';
const YES_AND_AMEN_ARRANGEMENT = '21716143';

// The two warnings the Phase 0 plan gives in its workspace.
const PHASE_0_WARNINGS = [
  'Warning: song 1, "WELCOME HOME", is planned at 134 BPM, and its folder WELCOME HOME-Elevation Rhythm-F-98.00bpm is at 98 BPM.',
  'Warning: song 2, "Yes And Amen", is planned in 4/4, and its song starts in 6/8.',
];

const fakes: PlanningCenter[] = [];

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await removeWorkspaces();
});

async function planningCenter(): Promise<PlanningCenter> {
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET });
  fakes.push(fake);
  return fake;
}

// The token file, in the workspace, readable by its owner alone.
async function tokenFile(workspace: Workspace): Promise<string> {
  const file = join(workspace.dir, 'pco.env');
  await writeFile(file, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET='${SECRET}'\n`);
  await chmod(file, 0o600);
  return file;
}

// The command as the operator runs it, through the package.json script, against the fake and the workspace's token file,
// with any other environment `env` gives.
function run(args: string[], fake: PlanningCenter, token: string, env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, PCO_API_BASE: fake.base, PCO_ENV: token, ...env } });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// An answer a test gives at `path`, in place of the recorded answer there.
type Replacement = { path: string; body: unknown };

// The recorded Planning Center, with each replacement answering at its path.
async function planningCenterWith(...replacements: Replacement[]): Promise<PlanningCenter> {
  const fixtures = await readFixtures();
  for (const { path, body } of replacements) {
    const at = fixtures.findIndex((fixture) => requestKey(fixture.path) === requestKey(path));
    if (at === -1) fixtures.push({ path, status: 200, body });
    else fixtures[at] = { path, status: 200, body };
  }
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET, fixtures });
  fakes.push(fake);
  return fake;
}

// A recorded body, as far as a test edits it.
type ItemRecord = { type: string; id: string; attributes: Record<string, unknown>; relationships?: Record<string, { data: unknown }> };
type ItemsBody = { data: ItemRecord[]; included?: ItemRecord[] };

// A copy of the recorded body at `path`, for a test to derive a case from.
async function recorded(path: string): Promise<ItemsBody> {
  const fixture = (await readFixtures()).find((each) => requestKey(each.path) === requestKey(path));
  if (fixture === undefined) throw new Error(`No fixture records ${path}`);
  return structuredClone(fixture.body) as ItemsBody;
}

// The record in `records` with type `type` and id `id`.
function record(records: ItemRecord[] | undefined, type: string, id: string): ItemRecord {
  const found = records?.find((each) => each.type === type && each.id === id);
  if (found === undefined) throw new Error(`No ${type} ${id}`);
  return found;
}

// An item note whose text is `content`, on the item with id `id`, in an items body with include=item_notes.
function addNote(body: ItemsBody, id: string, noteId: string, content: string): void {
  const relationships = (record(body.data, 'Item', id).relationships ??= {});
  const links = (relationships.item_notes?.data ?? []) as unknown[];
  relationships.item_notes = { data: [...links, { type: 'ItemNote', id: noteId }] };
  (body.included ??= []).push({ type: 'ItemNote', id: noteId, attributes: { category_name: 'Audio/Visual', content } });
}

// A build's paths, each inside the workspace, so it never writes the real ~/Music/Ableton/Sets or set manifest, and never
// reads or writes the real Eos show folder, ~/Documents/ETC.
const paths = (workspace: Workspace) => ['--library', workspace.library, '--template', workspace.template, '--output-root', workspace.outputRoot, '--set-manifest', workspace.setManifest, '--show-folder', workspace.showFolder];
// A listing's library, and its output root in the workspace, so it never looks in the real ~/Music/Ableton/Sets.
const listPaths = (workspace: Workspace) => ['--library', workspace.library, '--output-root', workspace.outputRoot];

// The workspace a Phase 0 build needs: a folder for each of its songs in the plan's key, made from fixture songs whose
// pairs take an overlap and a pad, the template's PAD track, and the pad in E.
async function phase0Workspace(): Promise<Workspace> {
  const workspace = await createWorkspace();
  await copySongAs(workspace, GRACE, WELCOME_HOME);
  await copySongAs(workspace, GREAT_ARE, YES_AND_AMEN);
  await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
  await addPadTrack(workspace);
  await addPad(workspace, 'E', 120);
  return workspace;
}

// Each test here spawns pnpm build-set, which a loaded CI runner can take past vitest's 5 s default, so every describe
// gives its tests 30 s, as set-builder-lights.test.ts does. A build that hangs still fails, at 30 s.
describe('pnpm build-set --plan, tempo and meter warnings in the summary', { timeout: 30_000 }, () => {
  it('warns that WELCOME HOME is planned at another BPM than its folder and Yes And Amen in another meter than its song, after the song lines, and builds, exit 0', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toEqual(
      [
        '2027-01-03 Sunday',
        '1. WELCOME HOME  bar 1  98 BPM  4/4  overlap',
        expect.stringMatching(/^2\. Yes And Amen {2}bar \d+ {2}72 BPM {2}6\/8 {2}pad in E$/),
        expect.stringMatching(/^3\. Fall Like Rain {2}bar \d+ {2}63 BPM {2}4\/4$/),
        ...PHASE_0_WARNINGS,
        setPath(workspace, PHASE_0),
        noTemplateLine(workspace),
        '',
      ],
    );
  });

  it('gives no warning for a BPM or a meter the plan does not have', async () => {
    const workspace = await phase0Workspace();
    const items = await recorded(PHASE_0_ITEMS);
    record(items.included, 'Arrangement', WELCOME_HOME_ARRANGEMENT).attributes.bpm = null;
    record(items.included, 'Arrangement', YES_AND_AMEN_ARRANGEMENT).attributes.meter = null;
    const fake = await planningCenterWith({ path: PHASE_0_ITEMS, body: items });

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    // The set's name, three songs, the set's path, the lights step's line, and the last line's end.
    expect(result.stdout.split('\n')).toHaveLength(7);
    expect(result.stdout).not.toContain('Warning: ');
  });
});

describe('pnpm build-set --plan, a BPM of 0 in the plan', { timeout: 30_000 }, () => {
  it('gives no warning for a BPM of 0, the same as for no BPM, since 0 is never a tempo', async () => {
    const workspace = await phase0Workspace();
    const items = await recorded(PHASE_0_ITEMS);
    record(items.included, 'Arrangement', WELCOME_HOME_ARRANGEMENT).attributes.bpm = 0;
    record(items.included, 'Arrangement', YES_AND_AMEN_ARRANGEMENT).attributes.meter = null;
    const fake = await planningCenterWith({ path: PHASE_0_ITEMS, body: items });

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    // The set's name, three songs, the set's path, the lights step's line, and the last line's end.
    expect(result.stdout.split('\n')).toHaveLength(7);
    expect(result.stdout).not.toContain('Warning: ');
  });
});

// A listing that wrote nothing and only read from Planning Center.
async function expectReadOnly(workspace: Workspace, fake: PlanningCenter) {
  expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  expect(fake.requests.length).toBeGreaterThan(0);
  expect(fake.requests.every(({ method }) => method === 'GET')).toBe(true);
}

// The Phase 0 listing's lines after its songs: the non-song items after Fall Like Rain.
const PHASE_0_ITEMS_AFTER = ['FaceTime: no effect', 'MC: no effect', 'Scripture Reading: no effect', 'Message: no effect', 'Prayer: no effect', 'Dismissal: no effect'];

// The whole Phase 0 listing, as it prints with no problem, from the plan alone.
const PHASE_0_LISTING = [
  '2027-01-03 Sunday',
  `1. WELCOME HOME  F  ${WELCOME_HOME}  overlap, from the plan`,
  `2. Yes And Amen  G  ${YES_AND_AMEN}  pad in E, from the plan`,
  'Prayer: a pad after song 2',
  `3. Fall Like Rain  E  ${FALL_LIKE_RAIN}`,
  ...PHASE_0_ITEMS_AFTER,
  ...PHASE_0_WARNINGS,
  '',
].join('\n');

// The whole Phase 0 listing, then `line`, the one about the set folder for the date, last.
function withExistingSet(line: string): string {
  return `${PHASE_0_LISTING}${line}\n`;
}

// A Phase 0 workspace whose listing prints in full, then `problem` on stderr, exit 1, writing nothing, and whose build
// stops on the same line, writing nothing.
async function expectListingAndBuildStop(workspace: Workspace, problem: string) {
  const fake = await planningCenter();
  const token = await tokenFile(workspace);

  const listed = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, token);

  expect(listed.stdout).toBe(PHASE_0_LISTING);
  expect(listed.stderr).toBe(`${problem}\n`);
  expect(listed.code).toBe(1);
  await expectReadOnly(workspace, fake);

  const built = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, token);

  expect(built.stderr).toBe(`${problem}\n`);
  expect(built.code).toBe(1);
  expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
}

describe('pnpm build-set --plan --list', { timeout: 30_000 }, () => {
  it('lists the Phase 0 plan: each song with its key, its folder and the transition after it with its source, each non-song item from the first song on with what it means, then the warnings, exit 0, and writes nothing', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        '2027-01-03 Sunday',
        `1. WELCOME HOME  F  ${WELCOME_HOME}  overlap, from the plan`,
        `2. Yes And Amen  G  ${YES_AND_AMEN}  pad in E, from the plan`,
        'Prayer: a pad after song 2',
        `3. Fall Like Rain  E  ${FALL_LIKE_RAIN}`,
        ...PHASE_0_ITEMS_AFTER,
        ...PHASE_0_WARNINGS,
        '',
      ].join('\n'),
    );
    await expectReadOnly(workspace, fake);
  });

  it('names a transition flag as the source of the transition it gives, and says which plan item it replaces', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--gap', '2', '--pad', '3', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n').slice(1, 5)).toEqual([
      `1. WELCOME HOME  F  ${WELCOME_HOME}  overlap, from the plan`,
      `2. Yes And Amen  G  ${YES_AND_AMEN}  gap, from --gap 2`,
      'Prayer: a pad after song 2, which --gap 2 replaces',
      `3. Fall Like Rain  E  ${FALL_LIKE_RAIN}  pad in E, from --pad 3`,
    ]);
    await expectReadOnly(workspace, fake);
  });

  it('names a pad\'s own key from --pad n=<key>', async () => {
    const workspace = await phase0Workspace();
    await addPad(workspace, 'G', 120);
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--pad', '1=G', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[1]).toBe(`1. WELCOME HOME  F  ${WELCOME_HOME}  pad in G, from --pad 1=G`);
  });

  it('lists the November 1 plan with the default gap after each song but the last, and no warning', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', NOVEMBER_1, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const lines = result.stdout.split('\n');
    expect(lines[0]).toBe('2026-11-01 Sunday');
    expect(lines.filter((line) => /^\d+\. /.test(line))).toEqual([
      `1. This Is Amazing Grace  D  ${GRACE}  gap, the default`,
      `2. Great Are You Lord  D  ${GREAT_ARE}  gap, the default`,
      `3. Fall Like Rain  E  ${FALL_LIKE_RAIN}`,
    ]);
    expect(result.stdout).not.toContain('Warning: ');
    await expectReadOnly(workspace, fake);
  });

  it.each([
    ['--service-type', '997539'],
    ['--plan-id', '90897397'],
  ])('lists the November 1 plan the same with %s %s', async (flag, value) => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', NOVEMBER_1, flag, value, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const lines = result.stdout.split('\n');
    expect(lines[0]).toBe('2026-11-01 Sunday');
    expect(lines.filter((line) => /^\d+\. /.test(line))).toEqual([
      `1. This Is Amazing Grace  D  ${GRACE}  gap, the default`,
      `2. Great Are You Lord  D  ${GREAT_ARE}  gap, the default`,
      `3. Fall Like Rain  E  ${FALL_LIKE_RAIN}`,
    ]);
    await expectReadOnly(workspace, fake);
  });

  it('lists a song with no folder with its problem in its place, the other songs with theirs, exit 1', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', NOVEMBER_1, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(1);
    expect(result.stdout.split('\n').filter((line) => /^\d+\. /.test(line))).toEqual([
      `1. This Is Amazing Grace  D  ${GRACE}  gap, the default`,
      `2. Great Are You Lord  D  ${GREAT_ARE}  gap, the default`,
      `3. Fall Like Rain  E  "Fall Like Rain" has no song folder in ${workspace.library}. To leave it out of the set, give --skip 3.`,
    ]);
    await expectReadOnly(workspace, fake);
  });

  it('keeps the transition on the song\'s own line when the song has two folders in its key, the folder names on their own lines after it, exit 1', async () => {
    const workspace = await phase0Workspace();
    await copySongAs(workspace, GREAT_ARE, 'Yes And Amen-Live-G-72.00bpm');
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(1);
    expect(result.stdout.split('\n').slice(1, 6)).toEqual([
      `1. WELCOME HOME  F  ${WELCOME_HOME}  overlap, from the plan`,
      `2. Yes And Amen  G  "Yes And Amen" in G has 2 song folders in ${workspace.library}; keep one:  pad in E, from the plan`,
      `  ${YES_AND_AMEN}`,
      '  Yes And Amen-Live-G-72.00bpm',
      'Prayer: a pad after song 2',
    ]);
    await expectReadOnly(workspace, fake);
  });

  it('lists a song change the plan gives both a "Prayer" and an "overlap" note with the problem in its transition\'s place, exit 1', async () => {
    const workspace = await phase0Workspace();
    const notes = await recorded(PHASE_0_NOTES);
    addNote(notes, YES_AND_AMEN_ITEM, '900000101', 'overlap');
    const fake = await planningCenterWith({ path: PHASE_0_NOTES, body: notes });

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(1);
    expect(result.stdout.split('\n')[2]).toBe(
      `2. Yes And Amen  G  ${YES_AND_AMEN}  The plan gives the song change after song 2, "Yes And Amen", both a "Prayer" item and an "overlap" note. Give each song change one transition.`,
    );
    await expectReadOnly(workspace, fake);
  });

  it('prints the full listing, then a WAV missing from a song folder on stderr as the build gives it, exit 1, and writes nothing; the build stops on the same line', async () => {
    const workspace = await phase0Workspace();
    await rm(libraryFile(workspace, FALL_LIKE_RAIN, 'AG 3.wav'));

    await expectListingAndBuildStop(workspace, `${FALL_LIKE_RAIN}: MultiTracks/AG 3.wav is missing from the song folder.`);
  });

  it('prints the full listing, then a planned pad after a song with no Ending locator on stderr, exit 1, and writes nothing; the build stops on the same line', async () => {
    const workspace = await phase0Workspace();
    await removeLocator(workspace, YES_AND_AMEN, 'Ending');

    await expectListingAndBuildStop(workspace, `${YES_AND_AMEN}: the song has no locator named Ending, where a pad starts.`);
  });

  it('prints the full listing, then a planned pad whose key has no file in the pads folder on stderr, exit 1, and writes nothing; the build stops on the same line', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, WELCOME_HOME);
    await copySongAs(workspace, GREAT_ARE, YES_AND_AMEN);
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    await addPadTrack(workspace);
    await addPad(workspace, 'G', 120);

    await expectListingAndBuildStop(
      workspace,
      `The pad after song 2 is in E, the key of ${FALL_LIKE_RAIN}, and the pads folder ${join(workspace.library, '_pads')} has no E.wav. The keys it has are G.`,
    );
  });

  it('checks the songs against the template --template names, and reports one with no PAD track under a planned pad', async () => {
    const workspace = await phase0Workspace();
    const template = join(workspace.dir, 'no-pad-track.als');
    await copyFile(FIXTURE_TEMPLATE, template);
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace), '--template', template], fake, await tokenFile(workspace));

    expect(result.stdout).toBe(PHASE_0_LISTING);
    expect(result.stderr).toBe('The template has no single track named "PAD", which a pad plays on. Add an audio track named PAD outside every group.\n');
    expect(result.code).toBe(1);
    await expectReadOnly(workspace, fake);
  });

  it('builds a plan whose listing exits 0, exit 0, in the same workspace', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();
    const token = await tokenFile(workspace);

    const listed = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, token);

    expect(listed.stderr).toBe('');
    expect(listed.code).toBe(0);

    const built = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, token);

    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);
    await access(setPath(workspace, PHASE_0));
  });

  it('reports a set folder for the date that already exists at the build\'s default output root after the warnings, exit 0', async () => {
    const workspace = await phase0Workspace();
    // HOME is the workspace, so the default output root, ~/Music/Ableton/Sets, is inside it.
    const folder = join(workspace.dir, 'Music/Ableton/Sets/2027-01-03 Sunday');
    await mkdir(folder, { recursive: true });
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, '--library', workspace.library], fake, await tokenFile(workspace), { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(withExistingSet(`${folder} already exists. The build stops on it unless --replace "${folder}" replaces it.`));
  });

  it('reports the set folder for the date under --output-root, exit 0', async () => {
    const workspace = await phase0Workspace();
    const folder = join(workspace.outputRoot, '2027-01-03 Sunday');
    await mkdir(folder, { recursive: true });
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(withExistingSet(`${folder} already exists. The build stops on it unless --replace "${folder}" replaces it.`));
  });

  it('does not report a set folder for the date that exists only under the default output root when --output-root names another', async () => {
    const workspace = await phase0Workspace();
    // HOME is the workspace, so the default output root, ~/Music/Ableton/Sets, is inside it.
    await mkdir(join(workspace.dir, 'Music/Ableton/Sets/2027-01-03 Sunday'), { recursive: true });
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace), { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(PHASE_0_LISTING);
  });

  it('says --replace replaces the set folder for the date when the listing\'s --replace names it, exit 0', async () => {
    const workspace = await phase0Workspace();
    const folder = join(workspace.outputRoot, '2027-01-03 Sunday');
    await mkdir(folder, { recursive: true });
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace), '--replace', folder], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(withExistingSet(`${folder} already exists, and --replace replaces it.`));
  });

  it('says --replace replaces the set folder at the default output root too, exit 0', async () => {
    const workspace = await phase0Workspace();
    const folder = join(workspace.dir, 'Music/Ableton/Sets/2027-01-03 Sunday');
    await mkdir(folder, { recursive: true });
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, '--library', workspace.library, '--replace', folder], fake, await tokenFile(workspace), { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(withExistingSet(`${folder} already exists, and --replace replaces it.`));
  });

  it('stops on a --replace naming another set folder before it reads the token file, exit 2', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace), '--replace', join(workspace.outputRoot, '2027-01-10 Sunday')], fake, join(workspace.dir, 'no-token.env'));

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith('--replace names '), result.stderr).toBe(true);
    expect(fake.requests).toEqual([]);
  });

  // setlist-controller#230: a listing whose --replace names another set folder than the one its date and output root
  // point at stops as the build does, before the token is read or any request goes out.
  it.each([
    ['the set folder for another date', (workspace: Workspace) => ['--replace', join(workspace.outputRoot, '2027-01-10 Sunday')]],
    ['the set folder for the date under another output root', (workspace: Workspace) => ['--replace', join(workspace.dir, 'Other Sets/2027-01-03 Sunday')]],
    ['the set folder twice', (workspace: Workspace) => ['--replace', join(workspace.outputRoot, '2027-01-03 Sunday'), '--replace', join(workspace.outputRoot, '2027-01-03 Sunday')]],
  ])('stops on a --replace naming %s with a usage message, exit 2, and asks Planning Center nothing', async (_case, replace) => {
    const workspace = await phase0Workspace();
    const folder = join(workspace.outputRoot, '2027-01-03 Sunday');
    await mkdir(folder, { recursive: true });
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace), ...replace(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith('--replace '), result.stderr).toBe(true);
    // The fix it names is the listing without --replace, with no --replace to copy (#230 review 1 finding 1).
    expect(result.stderr).toContain('Run --list, or --plan --list, without --replace: its last line names the set folder for the date when it already exists.\n\nUsage:');
    // The problem, before the usage text, which quotes `--replace "<folder>"` with a placeholder and names no folder.
    expect(result.stderr.split('\n\nUsage:')[0]).not.toContain('--replace "');
    expect(fake.requests).toEqual([]);
  });

  it.each([
    [
      'a song with no folder',
      async (workspace: Workspace) => {
        await rm(join(workspace.library, YES_AND_AMEN), { recursive: true });
      },
      undefined,
      `"Yes And Amen" has no song folder in`,
    ],
    [
      'a song change the plan gives both a "Prayer" and an "overlap" note',
      async () => {},
      async (): Promise<Replacement> => {
        const notes = await recorded(PHASE_0_NOTES);
        addNote(notes, YES_AND_AMEN_ITEM, '900000101', 'overlap');
        return { path: PHASE_0_NOTES, body: notes };
      },
      'both a "Prayer" item and an "overlap" note',
    ],
  ])('keeps exit 1 and nothing on stderr for %s, with the line about the set folder for the date last', async (_case, change, replacement, problem) => {
    const workspace = await phase0Workspace();
    await change(workspace);
    const folder = join(workspace.outputRoot, '2027-01-03 Sunday');
    await mkdir(folder, { recursive: true });
    const fake = replacement === undefined ? await planningCenter() : await planningCenterWith(await replacement());

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(problem);
    expect(result.stdout.endsWith(`\n${folder} already exists. The build stops on it unless --replace "${folder}" replaces it.\n`), result.stdout).toBe(true);
  });

  it('keeps exit 1 and the build\'s problem on stderr for a WAV missing from a song folder, with the line about the set folder for the date last on stdout', async () => {
    const workspace = await phase0Workspace();
    await rm(libraryFile(workspace, FALL_LIKE_RAIN, 'AG 3.wav'));
    const folder = join(workspace.outputRoot, '2027-01-03 Sunday');
    await mkdir(folder, { recursive: true });
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stdout).toBe(withExistingSet(`${folder} already exists. The build stops on it unless --replace "${folder}" replaces it.`));
    expect(result.stderr).toBe(`${FALL_LIKE_RAIN}: MultiTracks/AG 3.wav is missing from the song folder.\n`);
    expect(result.code).toBe(1);
  });

  it('lists with --replace, then builds with the same --output-root and --replace, which replaces the set folder for the date, exit 0', async () => {
    const workspace = await phase0Workspace();
    const folder = join(workspace.outputRoot, '2027-01-03 Sunday');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'built before.txt'), 'the set built before\n');
    const fake = await planningCenter();
    const token = await tokenFile(workspace);

    const listed = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace), '--replace', folder], fake, token);

    expect(listed.stderr).toBe('');
    expect(listed.code).toBe(0);
    expect(listed.stdout).toBe(withExistingSet(`${folder} already exists, and --replace replaces it.`));

    const built = await run(['--plan', '--date', PHASE_0, ...paths(workspace), '--replace', folder], fake, token);

    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);
    await access(setPath(workspace, PHASE_0));
    await expect(access(join(folder, 'built before.txt'))).rejects.toThrow();
  });

  it.each([
    [['grace'], '--plan takes the songs from the plan, not "grace".'],
    [['--date', '2027-02-30'], '--date must be a real date written YYYY-MM-DD, not 2027-02-30.'],
    [['--plan-id='], "--plan-id names no plan. Give it the plan's id: --plan-id <id>."],
    [['--plan-id', ' '], "--plan-id names no plan. Give it the plan's id: --plan-id <id>."],
  ])('stops on %j with a usage message, exit 2, and asks Planning Center nothing', async (args, problem) => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', ...args, '--library', workspace.library], fake, await tokenFile(workspace));

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(fake.requests).toEqual([]);
  });

  it('stops on a transition flag that names no song change of the plan, as the build does, exit 2', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--overlap', '3', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith('--overlap 3 names the last song, which has no song after it to overlap into.\n\nUsage:'), result.stderr).toBe(true);
  });

  it('prints a library it cannot read alone, exit 1, with nothing listed', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();
    const missing = join(workspace.dir, 'no-library');

    const result = await run(['--plan', '--list', '--date', NOVEMBER_1, '--library', missing, '--output-root', workspace.outputRoot], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain(missing);
  });
});

// The recording of 2026-10-22 (#168): the Phase 0 plan with three songs Nick added after Dismissal, to record how
// Planning Center writes the forms the reader had guessed at. Build My Life with the key change G-A (its Key starts in G
// and ends in A), Holy Spirit in E with no BPM and no meter on its arrangement (null), and Oh How I Need You (Find You) in
// A with a BPM of 0 and a meter of 2/4 on its arrangement.
const BUILD_MY_LIFE = 'Build My Life-Passion-G-70.00bpm';
const HOLY_SPIRIT = 'Holy Spirit-Jesus Culture-E-66.00bpm';
const OH_HOW = 'Oh How I Need You (Find You)-All Sons & Daughters-A-68.00bpm';

// The Phase 0 recording with the files of the 2026-10-22 one in place of theirs, by request path, so only these tests see
// the three songs and the Phase 0 listing stays as it was recorded.
async function planningCenter20261022(): Promise<PlanningCenter> {
  const answers = new Map((await readFixtures()).map((fixture) => [requestKey(fixture.path), fixture]));
  for (const fixture of await readFixtures(PLANNING_CENTER_FIXTURES_2026_10_22)) answers.set(requestKey(fixture.path), fixture);
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET, fixtures: [...answers.values()] });
  fakes.push(fake);
  return fake;
}

// The Phase 0 workspace with a folder for each of the three songs in the key the plan gives it. Build My Life's folder
// is at the plan's 70 BPM. Holy Spirit's and Oh How I Need You's are at a BPM the plan does not give, so a warning about
// either would come from the plan's null or 0. All three songs start in 4/4.
async function workspace20261022(): Promise<Workspace> {
  const workspace = await phase0Workspace();
  await copySongAs(workspace, GOODNESS, BUILD_MY_LIFE);
  await copySongAs(workspace, GOODNESS, HOLY_SPIRIT);
  await copySongAs(workspace, GRACE, OH_HOW);
  return workspace;
}

// The listing of the 2026-10-22 recording's plan, in its workspace.
async function list20261022(): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const workspace = await workspace20261022();
  const fake = await planningCenter20261022();
  const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));
  await expectReadOnly(workspace, fake);
  return result;
}

const warnings = (stdout: string) => stdout.split('\n').filter((line) => line.startsWith('Warning: '));

describe('pnpm build-set --plan --list, the forms recorded from the real Planning Center on 2026-10-22', { timeout: 30_000 }, () => {
  it('reads the key change Planning Center writes as G-A as G, the key the song starts in, and finds its G folder', async () => {
    const result = await list20261022();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toContain(`4. Build My Life  G  ${BUILD_MY_LIFE}  gap, the default`);
  });

  it('gives no BPM or meter warning for an arrangement whose BPM and meter Planning Center sends as null', async () => {
    const result = await list20261022();

    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toContain(`5. Holy Spirit  E  ${HOLY_SPIRIT}  gap, the default`);
    expect(warnings(result.stdout).filter((line) => line.includes('"Holy Spirit"'))).toEqual([]);
  });

  it('gives no BPM warning for an arrangement whose BPM Planning Center sends as 0, and warns on its meter of 2/4', async () => {
    const result = await list20261022();

    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toContain(`6. Oh How I Need You (Find You)  A  ${OH_HOW}`);
    expect(warnings(result.stdout).filter((line) => line.includes('"Oh How I Need You (Find You)"'))).toEqual([
      'Warning: song 6, "Oh How I Need You (Find You)", is planned in 2/4, and its song starts in 4/4.',
    ]);
  });
});

// --skip <n> leaves plan song n out of the set (setlist-controller#31). The listing keeps its line, with its plan number,
// so the numbers the other flags take stay in view.
describe('pnpm build-set --plan --list --skip', { timeout: 30_000 }, () => {
  it('lists a skipped song with its number and key and no folder, gives it no warning, and reads the "Prayer" after it as no pad, exit 0', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--skip', '2', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        '2027-01-03 Sunday',
        `1. WELCOME HOME  F  ${WELCOME_HOME}  overlap, from the plan`,
        '2. Yes And Amen  G  skipped, from --skip 2',
        'Prayer: no effect',
        `3. Fall Like Rain  E  ${FALL_LIKE_RAIN}`,
        ...PHASE_0_ITEMS_AFTER,
        PHASE_0_WARNINGS[0],
        '',
      ].join('\n'),
    );
    await expectReadOnly(workspace, fake);
  });

  it('makes the last song not skipped the last song: the "Prayer" after it is a pad in its own key, and the song after it is skipped', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--skip', '3', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stdout.split('\n').slice(1, 5)).toEqual([
      `1. WELCOME HOME  F  ${WELCOME_HOME}  overlap, from the plan`,
      `2. Yes And Amen  G  ${YES_AND_AMEN}  pad in G, from the plan`,
      'Prayer: a pad after song 2',
      '3. Fall Like Rain  E  skipped, from --skip 3',
    ]);
  });

  it('names --skip as the fix for a plan song with no song folder, and lists the plan with it, exit 0', async () => {
    const workspace = await phase0Workspace();
    await rm(join(workspace.library, YES_AND_AMEN), { recursive: true });
    const fake = await planningCenter();

    const stopped = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(stopped.code).toBe(1);
    expect(stopped.stdout.split('\n')[2]).toBe(
      `2. Yes And Amen  G  "Yes And Amen" has no song folder in ${workspace.library}. To leave it out of the set, give --skip 2.  pad in E, from the plan`,
    );

    const skipped = await run(['--plan', '--list', '--skip', '2', '--date', PHASE_0, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(skipped.stderr).toBe('');
    expect(skipped.code).toBe(0);
    expect(skipped.stdout.split('\n')[2]).toBe('2. Yes And Amen  G  skipped, from --skip 2');
  });
});
