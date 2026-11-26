import { spawn } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readFixtures, requestKey, startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import { copySongAs, createWorkspace, GOODNESS, GRACE, GREAT_ARE, REPO_ROOT, removeWorkspaces, snapshotFolder, type Workspace } from './set-builder-harness.ts';

// `pnpm build-set --plan` when the plan and the library disagree: each plan song's folder is found by its title and the
// plan's key, and every song that has no one folder is reported before the command exits 1, with nothing built. Every
// test points the command at the fake Planning Center by PCO_API_BASE and at a token file in its workspace by PCO_ENV,
// and derives its plan from the recorded November 1 plan by editing its song items.

const CLIENT_ID = 'fake-client-id-3f9a';
const SECRET = 'fake-secret-b71c';

// The recorded November 1 plan: This Is Amazing Grace in D, Great Are You Lord in D, Fall Like Rain in E. The fixture
// library has the first two, in D, and no Fall Like Rain.
const NOVEMBER_1 = '2026-11-01';
const NOVEMBER_1_ITEMS = '/service_types/997539/plans/90897397/items?include=song,key,arrangement&per_page=100';
const FALL_LIKE_RAIN = 'Fall Like Rain-Passion-E-70.00bpm';

const fakes: PlanningCenter[] = [];

afterEach(async () => {
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

// The command as the operator runs it, through the package.json script, against the fake and the workspace's token file.
function run(args: string[], fake: PlanningCenter, token: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, PCO_API_BASE: fake.base, PCO_ENV: token } });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// An edit to one song item of the recorded plan: a new title, or a new key name, where `null` leaves the item with no key
// name and no Key, so the plan has no key for it; or no key name and a new starting key and mode on its Key, so the plan's
// key is the Key's.
type SongEdit = { title?: string; key?: string | null; startingKey?: { key: string; minor: boolean } };

type Item = { type: string; id: string; attributes: Record<string, unknown>; relationships?: Record<string, { data: unknown }> };

// The recorded Planning Center, with the November 1 plan's song items edited by their recorded title.
async function planningCenterEditing(edits: Record<string, SongEdit> = {}): Promise<PlanningCenter> {
  const fixtures = (await readFixtures()).map((fixture) => {
    if (requestKey(fixture.path) !== requestKey(NOVEMBER_1_ITEMS)) return fixture;
    const body = structuredClone(fixture.body) as { data: Item[]; included?: Item[] };
    for (const item of body.data) {
      const edit = typeof item.attributes.title === 'string' ? edits[item.attributes.title] : undefined;
      if (edit === undefined) continue;
      if (edit.title !== undefined) item.attributes.title = edit.title;
      if (edit.key === null) {
        item.attributes.key_name = null;
        if (item.relationships?.key) item.relationships.key.data = null;
      } else if (edit.key !== undefined) item.attributes.key_name = edit.key;
      if (edit.startingKey !== undefined) {
        item.attributes.key_name = null;
        const link = item.relationships?.key?.data as { type: string; id: string } | null | undefined;
        const key = body.included?.find((record) => record.type === link?.type && record.id === link?.id);
        if (key === undefined) throw new Error(`No Key for ${String(item.attributes.title)}`);
        key.attributes.starting_key = edit.startingKey.key;
        key.attributes.starting_minor = edit.startingKey.minor;
      }
    }
    return { ...fixture, body };
  });
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET, fixtures });
  fakes.push(fake);
  return fake;
}

// A build's paths, each inside the workspace, so it never writes the real ~/Music/Ableton/Sets or set manifest, and never
// reads or writes the real Eos show folder, ~/Documents/ETC.
const paths = (workspace: Workspace) => ['--library', workspace.library, '--template', workspace.template, '--output-root', workspace.outputRoot, '--set-manifest', workspace.setManifest, '--show-folder', workspace.showFolder];
// A listing's library, and its output root in the workspace, so it never looks in the real ~/Music/Ableton/Sets.
const listPaths = (workspace: Workspace) => ['--library', workspace.library, '--output-root', workspace.outputRoot];

// The November 1 build in `workspace` against `fake`.
async function buildNovember1(workspace: Workspace, fake: PlanningCenter) {
  return run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));
}

// A build that stopped on `problems`, printed in that order, with nothing built.
async function expectStopped(workspace: Workspace, result: { code: number | null; stdout: string; stderr: string }, problems: string[]) {
  expect(result.stderr).toBe(problems.map((problem) => `${problem}\n`).join(''));
  expect(result.code).toBe(1);
  expect(result.stdout).toBe('');
  expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
}

// A build that built the set with `first` as its first song.
function expectBuilt(result: { code: number | null; stdout: string; stderr: string }, first: string) {
  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  expect(result.stdout.split('\n')[1]).toMatch(new RegExp(`^1\\. ${first}  bar 1  `));
}

// Each test here spawns pnpm build-set, which a loaded CI runner can take past vitest's 5 s default, so every describe
// gives its tests 30 s, as set-builder-lights.test.ts does. A build that hangs still fails, at 30 s.
describe('pnpm build-set --plan, a key in the plan', { timeout: 30_000 }, () => {
  it('finds a folder in C# for a song planned in Db', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, 'This Is Amazing Grace-The Ascension-C#-98.00bpm');
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'This Is Amazing Grace': { key: 'Db' } });

    expectBuilt(await buildNovember1(workspace, fake), 'This Is Amazing Grace');
    // The library also has the song in D at the same BPM, so only the folder the listing names shows which one it took.
    const listed = await run(['--plan', '--list', '--date', NOVEMBER_1, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(listed.code).toBe(0);
    expect(listed.stdout.split('\n')).toContain('1. This Is Amazing Grace  Db  This Is Amazing Grace-The Ascension-C#-98.00bpm  gap, the default');
  });

  it('does not find a folder in E for a song planned in Em', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'Fall Like Rain': { key: 'Em' } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [`"Fall Like Rain" is planned in Em, and ${workspace.library} has it only in E.`]);
  });
});

describe('pnpm build-set --plan, a song title', { timeout: 30_000 }, () => {
  it('stops on a song with no folder of its title, naming the song and the library folder', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenterEditing();

    await expectStopped(workspace, await buildNovember1(workspace, fake), [`"Fall Like Rain" has no song folder in ${workspace.library}. To leave it out of the set, give --skip 3.`]);
  });

  it('does not match "Grace" to This Is Amazing Grace', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'This Is Amazing Grace': { title: 'Grace' } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [`"Grace" has no song folder in ${workspace.library}. To leave it out of the set, give --skip 1.`]);
  });

  it('matches a title that differs only in letter case and spacing', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'This Is Amazing Grace': { title: '  this is   AMAZING grace ' } });

    expectBuilt(await buildNovember1(workspace, fake), 'This Is Amazing Grace');
  });
});

describe('pnpm build-set --plan, a key the library does not have', { timeout: 30_000 }, () => {
  it('stops on a song planned in a key the library does not have it in, naming the planned key and the keys it has', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'Great Are You Lord': { key: 'E' } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [`"Great Are You Lord" is planned in E, and ${workspace.library} has it only in D.`]);
  });

  it('names each key the library has the song in, once, in folder order', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    await copySongAs(workspace, GREAT_ARE, 'Great Are You Lord-Acoustic-C-72.00bpm');
    await copySongAs(workspace, GREAT_ARE, 'Great Are You Lord-Live-D-72.00bpm');
    await copySongAs(workspace, GREAT_ARE, 'Great Are You Lord-Studio-E-72.00bpm');
    const fake = await planningCenterEditing({ 'Great Are You Lord': { key: 'F' } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [`"Great Are You Lord" is planned in F, and ${workspace.library} has it only in C, D and E.`]);
  });
});

describe('pnpm build-set --plan, no key in the plan', { timeout: 30_000 }, () => {
  it('never picks a folder for a song with no key in the plan, even the title\'s one folder, and names the keys the library has', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'Great Are You Lord': { key: null } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [
      `"Great Are You Lord" has no key in the plan, and ${workspace.library} has it in D. Give it a key in the plan.`,
    ]);
  });
});

describe('pnpm build-set --plan, a folder whose name writes no key', { timeout: 30_000 }, () => {
  it.each([
    {
      name: 'names the title\'s one folder by its folder name for a song planned in a key',
      folders: ['Fall Like Rain-x'],
      key: undefined,
      problem: (library: string) => `"Fall Like Rain" is planned in E, and ${library} has it only in Fall Like Rain-x, whose name writes no key.`,
    },
    {
      name: 'names the title\'s one folder by its folder name for a song with no key in the plan',
      folders: ['Fall Like Rain-x'],
      key: null,
      problem: (library: string) => `"Fall Like Rain" has no key in the plan, and ${library} has it in Fall Like Rain-x, whose name writes no key. Give it a key in the plan.`,
    },
    {
      name: 'names the keyless folder after the keys the title\'s other folders write',
      folders: ['Fall Like Rain-Passion-D-70.00bpm', 'Fall Like Rain-x'],
      key: undefined,
      problem: (library: string) => `"Fall Like Rain" is planned in E, and ${library} has it only in D, and in Fall Like Rain-x, whose name writes no key.`,
    },
    {
      name: 'names two keyless folders together',
      folders: ['Fall Like Rain-x', 'Fall Like Rain-y'],
      key: undefined,
      problem: (library: string) => `"Fall Like Rain" is planned in E, and ${library} has it only in Fall Like Rain-x and Fall Like Rain-y, whose names write no key.`,
    },
  ])('$name', async ({ folders, key, problem }) => {
    const workspace = await createWorkspace();
    for (const folder of folders) await copySongAs(workspace, GOODNESS, folder);
    const fake = await planningCenterEditing(key === null ? { 'Fall Like Rain': { key: null } } : {});

    const result = await buildNovember1(workspace, fake);

    await expectStopped(workspace, result, [problem(workspace.library)]);
    expect(result.stderr).not.toContain('in no key');
  });
});

describe('pnpm build-set --plan, two folders in the key', { timeout: 30_000 }, () => {
  it('stops on a song with two folders of its title in the planned key, naming both', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    await copySongAs(workspace, GOODNESS, 'Fall Like Rain-Live-E-70.00bpm');
    const fake = await planningCenterEditing();

    await expectStopped(workspace, await buildNovember1(workspace, fake), [
      `"Fall Like Rain" in E has 2 song folders in ${workspace.library}; keep one:\n  Fall Like Rain-Live-E-70.00bpm\n  Fall Like Rain-Passion-E-70.00bpm`,
    ]);
  });

  it('names both folders when they spell the planned key two ways', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    await copySongAs(workspace, GRACE, 'This Is Amazing Grace-Live-Db-98.00bpm');
    await copySongAs(workspace, GRACE, 'This Is Amazing Grace-The Ascension-C#-98.00bpm');
    const fake = await planningCenterEditing({ 'This Is Amazing Grace': { key: 'Db' } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [
      `"This Is Amazing Grace" in Db has 2 song folders in ${workspace.library}; keep one:\n  This Is Amazing Grace-Live-Db-98.00bpm\n  This Is Amazing Grace-The Ascension-C#-98.00bpm`,
    ]);
  });
});

describe('pnpm build-set --plan, every problem at once', { timeout: 30_000 }, () => {
  it('reports every song\'s problem, in plan order, before it exits 1, and builds nothing', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenterEditing({ 'Great Are You Lord': { key: 'E' } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [
      `"Great Are You Lord" is planned in E, and ${workspace.library} has it only in D.`,
      `"Fall Like Rain" has no song folder in ${workspace.library}. To leave it out of the set, give --skip 3.`,
    ]);
  });

  it('reports a library it cannot read as its one problem, in every song\'s place', async () => {
    const workspace = await createWorkspace();
    const missing = join(workspace.dir, 'no-library');
    const fake = await planningCenterEditing({ 'Great Are You Lord': { key: 'E' } });

    const result = await run(['--plan', '--date', NOVEMBER_1, '--library', missing, '--template', workspace.template, '--output-root', workspace.outputRoot, '--set-manifest', workspace.setManifest, '--show-folder', workspace.showFolder], fake, await tokenFile(workspace));

    await expectStopped(workspace, result, [`Cannot read the song library ${missing}.`]);
  });
});

describe('pnpm build-set --plan, a plan key that is not a note name', { timeout: 30_000 }, () => {
  it('reads a plan key in lower case as its note name, e as E', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'Fall Like Rain': { key: 'e' } });

    expectBuilt(await buildNovember1(workspace, fake), 'This Is Amazing Grace');
  });

  it('reads a minor plan key in lower case as its note name, em as Em', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, 'Fall Like Rain-Passion-Em-70.00bpm');
    const fake = await planningCenterEditing({ 'Fall Like Rain': { key: 'em' } });

    expectBuilt(await buildNovember1(workspace, fake), 'This Is Amazing Grace');
  });

  it('takes the key of a song with no key name from its Key\'s starting key, in minor as Em, and lists the Em folder', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, 'Fall Like Rain-Passion-Em-70.00bpm');
    const fake = await planningCenterEditing({ 'Fall Like Rain': { startingKey: { key: 'E', minor: true } } });

    expectBuilt(await buildNovember1(workspace, fake), 'This Is Amazing Grace');
    const listed = await run(['--plan', '--list', '--date', NOVEMBER_1, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(listed.stderr).toBe('');
    expect(listed.code).toBe(0);
    expect(listed.stdout.split('\n')).toContain('3. Fall Like Rain  Em  Fall Like Rain-Passion-Em-70.00bpm');
  });

  it('reads a key change as the key the song starts in, D-E as D', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'This Is Amazing Grace': { key: 'D-E' } });

    expectBuilt(await buildNovember1(workspace, fake), 'This Is Amazing Grace');
  });

  it('stops on a plan key that is still no note name, naming it and pointing at the plan', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'Fall Like Rain': { key: 'Gm7' } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [
      '"Fall Like Rain" is planned in Gm7, which is not a key. A key is a note name, A to G, then # or b, then m for minor: G, F#, Bb, Em. Give it a key in the plan.',
    ]);
  });

  it('shows a plan key that is still no note name as its folder problem in --plan --list', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'Fall Like Rain': { key: 'Gm7' } });

    const result = await run(['--plan', '--list', '--date', NOVEMBER_1, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout.split('\n')).toContain(
      '3. Fall Like Rain  Gm7  "Fall Like Rain" is planned in Gm7, which is not a key. A key is a note name, A to G, then # or b, then m for minor: G, F#, Bb, Em. Give it a key in the plan.',
    );
  });

  it('shows a plan key in lower case as read in --plan --list, e as E', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterEditing({ 'Fall Like Rain': { key: 'e' } });

    const result = await run(['--plan', '--list', '--date', NOVEMBER_1, ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toContain(`3. Fall Like Rain  E  ${FALL_LIKE_RAIN}`);
  });

  it('names a folder whose key is no note name by its folder name and the key it writes', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, 'Fall Like Rain-x-e-70.00bpm');
    const fake = await planningCenterEditing({ 'Fall Like Rain': { key: 'e' } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [
      `"Fall Like Rain" is planned in E, and ${workspace.library} has it only in Fall Like Rain-x-e-70.00bpm (its folder name's key, "e", is not a note name).`,
    ]);
  });

  it('names a folder whose key is no note name by its folder name for a song with no key in the plan', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, 'Fall Like Rain-x-e-70.00bpm');
    const fake = await planningCenterEditing({ 'Fall Like Rain': { key: null } });

    await expectStopped(workspace, await buildNovember1(workspace, fake), [
      `"Fall Like Rain" has no key in the plan, and ${workspace.library} has it in Fall Like Rain-x-e-70.00bpm (its folder name's key, "e", is not a note name). Give it a key in the plan.`,
    ]);
  });
});
