import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { madeUpChart, readFixtures, requestKey, startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import {
  addPad,
  addPadTrack,
  copySongAs,
  createWorkspace,
  GOODNESS,
  GRACE,
  GREAT_ARE,
  locatorList,
  noTemplateLine,
  projectFolder,
  readSet,
  readSetXml,
  REPO_ROOT,
  removeWorkspaces,
  setPath,
  snapshotFolder,
  type Workspace,
} from './set-builder-harness.ts';

// `pnpm build-set --plan`: the set built from the week's plan in Planning Center. Every test here points the command at
// the fake Planning Center by PCO_API_BASE and at a token file in its workspace by PCO_ENV, so none reaches the real API
// or reads the real token.

const CLIENT_ID = 'fake-client-id-3f9a';
const SECRET = 'fake-secret-b71c';
const BASIC = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64');

// The recorded November 1 plan: This Is Amazing Grace in D, Great Are You Lord in D, Fall Like Rain in E.
const NOVEMBER_1 = '2026-11-01';
// Fall Like Rain's folder, in the plan's key E, made in a workspace from another fixture song: the build reads the key
// from the folder name alone.
const FALL_LIKE_RAIN = 'Fall Like Rain-Passion-E-70.00bpm';
// The requests a November 1 build makes, as recorded: the service types, the type's future plans, its past plans, the
// plan's items, and the plan's items again with their notes.
const NOVEMBER_1_REQUESTS = [
  'GET /service_types?per_page=100',
  'GET /service_types/997539/plans?filter=future&order=sort_date&per_page=100',
  'GET /service_types/997539/plans?filter=past&order=-sort_date&per_page=25',
  'GET /service_types/997539/plans/90897397/items?include=song,key,arrangement&per_page=100',
  'GET /service_types/997539/plans/90897397/items?include=item_notes&per_page=100',
];
// The November 1 plan's items with their songs, keys and arrangements, as recorded.
const NOVEMBER_1_ITEMS = '/service_types/997539/plans/90897397/items?include=song,key,arrangement&per_page=100';

// The Phase 0 test plan: WELCOME HOME in F with an "Overlap" note, Yes And Amen in G, an item "Prayer", Fall Like Rain in
// E, and a second "Prayer" after the message.
const PHASE_0 = '2027-01-03';
const PHASE_0_ITEMS = '/service_types/997539/plans/92852532/items?include=song,key,arrangement&per_page=100';
const PHASE_0_NOTES = '/service_types/997539/plans/92852532/items?include=item_notes&per_page=100';
const WELCOME_HOME = 'WELCOME HOME-Elevation Rhythm-F-98.00bpm';
const YES_AND_AMEN = 'Yes And Amen-Jesus Culture-G-72.00bpm';
// Yes And Amen's and Fall Like Rain's items in the Phase 0 plan.
const YES_AND_AMEN_ITEM = '1248613325';
const FALL_LIKE_RAIN_ITEM = '1248613327';

const fakes: PlanningCenter[] = [];

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await removeWorkspaces();
});

// The fake Planning Center, which takes CLIENT_ID and `secret` and 401s any other token.
async function planningCenter(secret = SECRET): Promise<PlanningCenter> {
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret });
  fakes.push(fake);
  return fake;
}

// The token file, in the workspace, with `mode`.
async function tokenFile(workspace: Workspace, mode = 0o600): Promise<string> {
  const file = join(workspace.dir, 'pco.env');
  await writeFile(file, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET='${SECRET}'\n`);
  await chmod(file, mode);
  return file;
}

// The command as the operator runs it, through the package.json script, against the fake and the workspace's token file.
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

// A Planning Center that answers every request with `answer`, for an answer the recorded fixtures cannot give: a body
// that is not JSON, or one cut off mid-way.
async function brokenPlanningCenter(answer: (response: ServerResponse) => void): Promise<PlanningCenter> {
  const requests: PlanningCenter['requests'] = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method ?? '', path: request.url ?? '/', authorization: request.headers.authorization, userAgent: request.headers['user-agent'] });
    answer(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const fake: PlanningCenter = {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
  fakes.push(fake);
  return fake;
}

// An answer a test gives at `path`, 200 unless it names its status.
type Replacement = { path: string; status?: number; body: unknown };

// The recorded Planning Center, with each replacement answering at its path: in place of the recorded answer there, or
// as a new one.
async function planningCenterWith(...replacements: Replacement[]): Promise<PlanningCenter> {
  const fixtures = await readFixtures();
  for (const { path, status = 200, body } of replacements) {
    const at = fixtures.findIndex((fixture) => requestKey(fixture.path) === requestKey(path));
    if (at === -1) fixtures.push({ path, status, body });
    else fixtures[at] = { path, status, body };
  }
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET, fixtures });
  fakes.push(fake);
  return fake;
}

// A recorded body, as far as a test edits it.
type ItemRecord = { type: string; id: string; attributes: Record<string, unknown>; relationships?: Record<string, { data: unknown }> };
type ItemsBody = { data: ItemRecord[]; included?: ItemRecord[]; links?: Record<string, string> };

// A copy of the recorded body at `path`, for a test to derive a case from.
async function recorded(path: string): Promise<ItemsBody> {
  const fixture = (await readFixtures()).find((each) => requestKey(each.path) === requestKey(path));
  if (fixture === undefined) throw new Error(`No fixture records ${path}`);
  return structuredClone(fixture.body) as ItemsBody;
}

// The record in `body` with item id `id`.
function item(body: ItemsBody, id: string): ItemRecord {
  const found = body.data.find((record) => record.id === id);
  if (found === undefined) throw new Error(`No item ${id}`);
  return found;
}

// A non-song item, or a header, at `sequence` in the plan's items, with no relationships, as an item added in Planning
// Center between two recorded ones.
function addItem(body: ItemsBody, id: string, sequence: number, title: string, itemType = 'item'): void {
  body.data.push({ type: 'Item', id, attributes: { item_type: itemType, sequence, title } });
}

// An item note whose text is `content`, on the item with id `id`, in an items body with include=item_notes.
function addNote(body: ItemsBody, id: string, noteId: string, content: string): void {
  const relationships = (item(body, id).relationships ??= {});
  const links = (relationships.item_notes?.data ?? []) as unknown[];
  relationships.item_notes = { data: [...links, { type: 'ItemNote', id: noteId }] };
  (body.included ??= []).push({ type: 'ItemNote', id: noteId, attributes: { category_name: 'Audio/Visual', content } });
}

// A build's paths, each inside the workspace, so it never writes the real ~/Music/Ableton/Sets or set manifest, and never
// reads or writes the real Eos show folder, ~/Documents/ETC.
const paths = (workspace: Workspace) => ['--library', workspace.library, '--template', workspace.template, '--output-root', workspace.outputRoot, '--set-manifest', workspace.setManifest, '--show-folder', workspace.showFolder];
// A listing's library, and its output root in the workspace, so it never looks in the real ~/Music/Ableton/Sets.
const listPaths = (workspace: Workspace) => ['--library', workspace.library, '--output-root', workspace.outputRoot];

// Each test here spawns pnpm build-set, which a loaded CI runner can take past vitest's 5 s default, so every describe
// gives its tests 30 s, as set-builder-lights.test.ts does. A build that hangs still fails, at 30 s.
describe('pnpm build-set --plan', { timeout: 30_000 }, () => {
  it('takes no song name: a song named with --plan is a usage problem, exit 2, and asks Planning Center nothing', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();

    const result = await run(['--plan', 'grace', '--date', '2026-11-01', ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(2);
    expect(result.stderr.startsWith('--plan takes the songs from the plan, not "grace".\n\nUsage:')).toBe(true);
    expect(result.stdout).toBe('');
    expect(fake.requests).toEqual([]);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it.each([
    ['others', 0o644],
    ['the group', 0o640],
  ])('refuses a token file %s can read, with the chmod 600 that fixes it, exit 1, before any request', async (_, mode) => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();
    const token = await tokenFile(workspace, mode);

    const result = await run(['--plan', '--date', '2026-11-01', ...paths(workspace)], fake, token);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain(`chmod 600 ${token}`);
    expect(result.stderr).not.toContain(SECRET);
    expect(fake.requests).toEqual([]);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('builds the set from the recorded November 1 plan, each song in its folder by title and key, with no pad, since its only "Prayer" follows the message: the very set the typed command builds', async () => {
    const workspace = await createWorkspace();
    // The fixture library has no Fall Like Rain. A second This Is Amazing Grace, in C, is Goodness of God's set, so the
    // summary's 63 BPM and bar count would show it if the build took it over the plan's key D.
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    await copySongAs(workspace, GOODNESS, 'This Is Amazing Grace-Live-C-63.00bpm');
    const fake = await planningCenter();

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        '2026-11-01 Sunday',
        '1. This Is Amazing Grace  bar 1  98 BPM  4/4  gap',
        '2. Great Are You Lord  bar 71  72 BPM  6/8  gap',
        '3. Fall Like Rain  bar 162  63 BPM  4/4',
        setPath(workspace, NOVEMBER_1),
        noTemplateLine(workspace),
        '',
      ].join('\n'),
    );
    const countOffs = locatorList(await readSet(setPath(workspace, NOVEMBER_1)))
      .map(({ name }) => name)
      .filter((name) => name.includes('Count Off'));
    expect(countOffs).toEqual(['1 - Count Off (This Is Amazing Grace)', '2 - Count Off (Great Are You Lord)', '3 - Count Off (Fall Like Rain)']);
    expect(fake.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(NOVEMBER_1_REQUESTS);

    // The typed command for the same three folders prints the same summary and writes the same set. Paths in the set hold
    // its project folder, so the typed build replaces the plan's in the same workspace.
    const planned = await readSetXml(setPath(workspace, NOVEMBER_1));
    const typed = await run([GRACE, GREAT_ARE, FALL_LIKE_RAIN, '--date', NOVEMBER_1, '--replace', projectFolder(workspace, NOVEMBER_1), ...paths(workspace)], fake, await tokenFile(workspace));
    expect(typed.stderr).toBe('');
    expect(typed.stdout).toBe(result.stdout);
    expect(await readSetXml(setPath(workspace, NOVEMBER_1))).toBe(planned);
  });

  it('sends the token as HTTP Basic on every request, and prints it nowhere', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenter();

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(0);
    expect(fake.requests).toHaveLength(NOVEMBER_1_REQUESTS.length);
    for (const request of fake.requests) expect(request.authorization).toBe(`Basic ${BASIC}`);
    for (const secret of [CLIENT_ID, SECRET, BASIC]) {
      expect(result.stdout).not.toContain(secret);
      expect(result.stderr).not.toContain(secret);
    }
  });

  // Planning Center asks every request to name the app and a way to reach its maker, `<app name> (<link or email>)`, and
  // may answer 403 to one that does not. Node's fetch alone sends `node`.
  it('names the app and a contact in the User-Agent of every request', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenter();

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(0);
    expect(fake.requests).toHaveLength(NOVEMBER_1_REQUESTS.length);
    for (const request of fake.requests) expect(request.userAgent).toBe('setlist-controller (https://github.com/nick-vogel/setlist-controller)');
  });

  // A 2xx answer that is not a whole JSON:API document stops the build with one problem line naming the path, never a
  // stack trace or the body it was sent.
  const BODY_MARK = 'captive-portal-page-5e1d';
  const notADocument: [string, () => Promise<PlanningCenter>, string][] = [
    [
      'a body that is not JSON',
      () =>
        brokenPlanningCenter((response) => {
          response.writeHead(200, { 'content-type': 'text/html' });
          response.end(`<html>${BODY_MARK}</html>`);
        }),
      '/service_types',
    ],
    ['a JSON object with no data', () => planningCenterWith({ path: '/service_types?per_page=100', body: { meta: BODY_MARK } }), '/service_types'],
    ['a JSON:API error document', () => planningCenterWith({ path: '/service_types?per_page=100', body: { errors: [{ status: '500', title: BODY_MARK }] } }), '/service_types'],
    ['a record with no attributes', () => planningCenterWith({ path: '/service_types?per_page=100', body: { data: [{ type: 'ServiceType', id: BODY_MARK }] } }), '/service_types'],
    [
      'an included that is not a list',
      () =>
        planningCenterWith({
          path: NOVEMBER_1_ITEMS,
          body: {
            data: [{ type: 'Item', id: '1', attributes: { item_type: 'song', title: 'x' }, relationships: { key: { data: { type: 'Key', id: '1' } } } }],
            included: { note: BODY_MARK },
          },
        }),
      '/service_types/997539/plans/90897397/items',
    ],
  ];
  it.each(notADocument)('stops with one problem line naming the path, exit 1, for %s', async (_, start, path) => {
    const workspace = await createWorkspace();
    const fake = await start();

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Planning Center sent an answer to ${path} that cannot be read.\n`);
    expect(result.stderr).not.toContain(BODY_MARK);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });
});

// The real API's base, as the recorded bodies write their links; the fake rewrites it to its own.
const REAL_API = 'https://api.planningcenteronline.com/services/v2';
const SERVICE_TYPES = '/service_types?per_page=100';
const FUTURE_PLANS = '/service_types/997539/plans?filter=future&order=sort_date&per_page=100';
const PAST_PLANS = '/service_types/997539/plans?filter=past&order=-sort_date&per_page=25';
// The recorded past list's next page, as its `links.next` names it.
const PAST_PLANS_PAGE_2 = '/service_types/997539/plans?filter=past&offset=25&order=-sort_date&per_page=25';
const NOVEMBER_1_NOTES = '/service_types/997539/plans/90897397/items?include=item_notes&per_page=100';
const itemsPath = (plan: string) => `/service_types/997539/plans/${plan}/items?include=song,key,arrangement&per_page=100`;
const notesPath = (plan: string) => `/service_types/997539/plans/${plan}/items?include=item_notes&per_page=100`;
// Fall Like Rain's item in the November 1 plan.
const NOVEMBER_1_FALL_LIKE_RAIN_ITEM = '1223369525';

// The summary of the November 1 set, its three songs in plan order, and the lights step's line after it.
const novemberSummary = (workspace: Workspace) =>
  [
    '2026-11-01 Sunday',
    '1. This Is Amazing Grace  bar 1  98 BPM  4/4  gap',
    '2. Great Are You Lord  bar 71  72 BPM  6/8  gap',
    '3. Fall Like Rain  bar 162  63 BPM  4/4',
    setPath(workspace, NOVEMBER_1),
    noTemplateLine(workspace),
    '',
  ].join('\n');

// The November 1 plan's items, both requests, answering for plan `plan` instead, so a derived plan has the November 1
// songs; `edit` changes both bodies alike.
async function novemberItemsFor(plan: string, edit: (body: ItemsBody) => void = () => {}): Promise<Replacement[]> {
  const items = await recorded(NOVEMBER_1_ITEMS);
  const notes = await recorded(NOVEMBER_1_NOTES);
  edit(items);
  edit(notes);
  return [
    { path: itemsPath(plan), body: items },
    { path: notesPath(plan), body: notes },
  ];
}

// A plan record copied from the recorded future list, with its own id, sort date and title.
async function planRecord(id: string, sortDate: string, title: string | null): Promise<ItemRecord> {
  const [first] = (await recorded(FUTURE_PLANS)).data;
  if (first === undefined) throw new Error('No recorded future plan');
  return { ...first, id, attributes: { ...first.attributes, title, sort_date: sortDate, last_time_at: sortDate } };
}

const requestKeys = (fake: PlanningCenter) => fake.requests.map(({ path }) => requestKey(path));

describe('pnpm build-set --plan, finding the plan', { timeout: 30_000 }, () => {
  it.each([
    ['--service-type', 'Service'],
    ['--plan-id', '90897397'],
    ['--skip', '1'],
  ])('takes %s only with --plan: without it, a usage problem, exit 2, and asks Planning Center nothing', async (flag, value) => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();

    const result = await run([GRACE, flag, value, '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`${flag} needs --plan.\n\nUsage:`), result.stderr).toBe(true);
    expect(fake.requests).toEqual([]);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('takes no empty --plan-id=: a usage problem, exit 2, before the token is read or any request goes out', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--plan-id=', '--date', NOVEMBER_1, ...paths(workspace)], fake, join(workspace.dir, 'no-token.env'));

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith("--plan-id names no plan. Give it the plan's id: --plan-id <id>.\n\nUsage:"), result.stderr).toBe(true);
    expect(fake.requests).toEqual([]);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('finds a past plan on the date and builds it: the recorded October 18 plan', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenterWith(...(await novemberItemsFor('90897395')));

    const result = await run(['--plan', '--date', '2026-10-18', ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe('2026-10-18 Sunday');
    expect(songLines(result.stdout)).toHaveLength(3);
    expect(requestKeys(fake)).toEqual([SERVICE_TYPES, FUTURE_PLANS, PAST_PLANS, itemsPath('90897395'), notesPath('90897395')].map(requestKey));
  });

  it('finds a plan on the second page of past plans, following the next link', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const page2 = { data: [await planRecord('900000301', '2026-04-26T10:30:00Z', null)], links: { self: `${REAL_API}${PAST_PLANS_PAGE_2}` } };
    const fake = await planningCenterWith({ path: PAST_PLANS_PAGE_2, body: page2 }, ...(await novemberItemsFor('900000301')));

    const result = await run(['--plan', '--date', '2026-04-26', ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe('2026-04-26 Sunday');
    expect(songLines(result.stdout)).toHaveLength(3);
    expect(requestKeys(fake)).toEqual(
      [SERVICE_TYPES, FUTURE_PLANS, PAST_PLANS, PAST_PLANS_PAGE_2, itemsPath('900000301'), notesPath('900000301')].map(requestKey),
    );
  });

  it('finds a plan on the second page of future plans, following the next link while a page ends before the date', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    // The recorded future list in two pages: October 25 alone on the first, which ends before November 1, and November 1
    // on, on the second.
    const future = await recorded(FUTURE_PLANS);
    const nextPath = '/service_types/997539/plans?filter=future&offset=1&order=sort_date&per_page=100';
    const page1 = { data: future.data.slice(0, 1), links: { self: `${REAL_API}${FUTURE_PLANS}`, next: `${REAL_API}${nextPath}` } };
    const page2 = { data: future.data.slice(1), links: { self: `${REAL_API}${nextPath}` } };
    expect(page1.data.map((plan) => plan.attributes.sort_date)).toEqual(['2026-10-25T10:30:00Z']);
    const fake = await planningCenterWith({ path: FUTURE_PLANS, body: page1 }, { path: nextPath, body: page2 });

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(novemberSummary(workspace));
    expect(requestKeys(fake)).toContain(requestKey(nextPath));
  });

  // The November 1 items in two pages: through This Is Amazing Grace on the first, with the records they include, and the
  // rest on the second, with theirs.
  async function twoItemPages(next: string): Promise<{ page1: ItemsBody; page2: ItemsBody }> {
    const body = await recorded(NOVEMBER_1_ITEMS);
    const linked = (items: ItemRecord[]) => {
      const links = items.flatMap((each) => Object.values(each.relationships ?? {}).map(({ data }) => data as { type: string; id: string } | null));
      return (body.included ?? []).filter((record) => links.some((link) => link?.type === record.type && link.id === record.id));
    };
    const first = body.data.filter((each) => Number(each.attributes.sequence) <= 6);
    const rest = body.data.filter((each) => Number(each.attributes.sequence) > 6);
    return {
      page1: { data: first, included: linked(first), links: { self: `${REAL_API}${NOVEMBER_1_ITEMS}`, next } },
      page2: { data: rest, included: linked(rest), links: { self: next } },
    };
  }

  it('builds every song of a plan whose items come in two pages, following the next link', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const nextPath = '/service_types/997539/plans/90897397/items?include=song%2Ckey%2Carrangement&offset=6&per_page=100';
    const { page1, page2 } = await twoItemPages(`${REAL_API}${nextPath}`);
    const fake = await planningCenterWith({ path: NOVEMBER_1_ITEMS, body: page1 }, { path: nextPath, body: page2 });

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(novemberSummary(workspace));
    expect(requestKeys(fake)).toContain(requestKey(NOVEMBER_1_ITEMS));
    expect(requestKeys(fake)).toContain(requestKey(nextPath));
  });

  it('reads a next link it has already read once, so a page that names itself as the next one ends the paging', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const body = await recorded(NOVEMBER_1_ITEMS);
    body.links = { self: `${REAL_API}${NOVEMBER_1_ITEMS}`, next: `${REAL_API}${NOVEMBER_1_ITEMS}` };
    const fake = await planningCenterWith({ path: NOVEMBER_1_ITEMS, body });

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(novemberSummary(workspace));
    expect(requestKeys(fake).filter((key) => key === requestKey(NOVEMBER_1_ITEMS))).toHaveLength(1);
  });

  it('does not follow a next link outside the API base, so the token goes to no other host: one problem line, exit 1', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const { page1 } = await twoItemPages('https://elsewhere.example/service_types/997539/plans/90897397/items?offset=6');
    const fake = await planningCenterWith({ path: NOVEMBER_1_ITEMS, body: page1 });

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Planning Center sent a next page outside ${fake.base}.\n`);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  // The recorded future list with a second plan on November 1, "Evening" at 18:00, whose items are the November 1 items
  // without Fall Like Rain.
  const EVENING = '900000201';
  async function twoPlansOnNovember1(): Promise<PlanningCenter> {
    const future = await recorded(FUTURE_PLANS);
    const at = future.data.findIndex((plan) => plan.id === '90897397');
    future.data.splice(at + 1, 0, await planRecord(EVENING, '2026-11-01T18:00:00Z', 'Evening'));
    const withoutFallLikeRain = (body: ItemsBody) => (body.data = body.data.filter((each) => each.id !== NOVEMBER_1_FALL_LIKE_RAIN_ITEM));
    return planningCenterWith({ path: FUTURE_PLANS, body: future }, ...(await novemberItemsFor(EVENING, withoutFallLikeRain)));
  }

  it('stops on two plans on the date, listing each plan\'s id, title and time, exit 1, before reading any items', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await twoPlansOnNovember1();

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `Planning Center has 2 "Service" plans on 2026-11-01. Name one with --plan-id: 90897397 untitled at 10:30, ${EVENING} "Evening" at 18:00.\n`,
    );
    expect(requestKeys(fake).some((key) => key.includes('/items'))).toBe(false);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('builds the plan --plan-id names of the two on the date', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await twoPlansOnNovember1();

    const evening = await run(['--plan', '--plan-id', EVENING, '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(evening.stderr).toBe('');
    expect(evening.code).toBe(0);
    expect(songLines(evening.stdout).map(ends)).toEqual([
      ['1. This Is Amazing Grace', 'gap'],
      ['2. Great Are You Lord', '6/8'],
    ]);

    const morning = await run(['--plan', '--plan-id', '90897397', '--date', NOVEMBER_1, '--replace', projectFolder(workspace, NOVEMBER_1), ...paths(workspace)], fake, await tokenFile(workspace));

    expect(morning.stderr).toBe('');
    expect(morning.code).toBe(0);
    expect(morning.stdout).toBe(novemberSummary(workspace));
  });

  // setlist-controller#230, review 10 finding 1's case as a plan build: the date is November 1, and --replace names the
  // November 8 set folder. The build stops before the token is read or any request goes out, and the November 1 set
  // folder built before is still there.
  it('stops on a --replace that names another set folder than the one it would write, exit 2, asks Planning Center nothing, and writes nothing', async () => {
    const workspace = await createWorkspace();
    const folder = projectFolder(workspace, NOVEMBER_1);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'built before.txt'), 'the set built before\n');
    const token = await tokenFile(workspace);
    const before = await snapshotFolder(workspace.dir);
    const fake = await planningCenter();

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace), '--replace', projectFolder(workspace, '2026-11-08')], fake, token);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`--replace names ${projectFolder(workspace, '2026-11-08')}, which is not the set folder for this command's date and output root. Run --list, or --plan --list, without --replace:`), result.stderr).toBe(true);
    expect(result.stderr).not.toContain(folder);
    expect(fake.requests).toEqual([]);
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });

  it('stops on a --plan-id that names none of the plans on the date, listing them, exit 1', async () => {
    const workspace = await createWorkspace();
    const fake = await twoPlansOnNovember1();

    const result = await run(['--plan', '--plan-id', '90897398', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `--plan-id 90897398 is not a "Service" plan on 2026-11-01. The plans on 2026-11-01: 90897397 untitled at 10:30, ${EVENING} "Evening" at 18:00.\n`,
    );
    expect(requestKeys(fake).some((key) => key.includes('/items'))).toBe(false);
  });

  it('says there is no plan on the date for a --plan-id on a date with no plan, exit 1', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--plan-id', '1', '--date', '2026-12-25', ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('--plan-id 1 is not a "Service" plan on 2026-12-25. There is no "Service" plan on 2026-12-25.\n');
    expect(requestKeys(fake).some((key) => key.includes('/items'))).toBe(false);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('lists the service types there are for an unknown --service-type, exit 1, and asks for no plans', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--service-type', 'Christmas', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Planning Center has no service type "Christmas". Its service types: Service (997539), Hospitality (1000011), Nursery (1000012), ' +
        'Sunday Service (1000013), Kids Team (1000014), Host/Check-In (1000015), Youth Night (1000016), Prayer - Sunday Service (1000017), ' +
        'Life Safety Team (1000018), Event (1000019), Kids (1000020), Youth (1000021), YTH - Mid (1000022).\n',
    );
    expect(requestKeys(fake)).toEqual([requestKey(SERVICE_TYPES)]);
  });

  it('takes a --service-type by its id', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    const fake = await planningCenter();

    const result = await run(['--plan', '--service-type', '997539', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(novemberSummary(workspace));
  });

  it.each([['997539'], ['service']])('names the type by its own name when --service-type %s has no plan on the date, exit 1', async (serviceType) => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--service-type', serviceType, '--date', '2026-12-25', ...listPaths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('"Service" has no plan on 2026-12-25 in Planning Center.\n');
  });

  it('takes a --service-type by its name under the name rule, "sunday service" picking Sunday Service and not Service', async () => {
    const workspace = await createWorkspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--service-type', 'sunday service', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    // Sunday Service's plans are not recorded, so the fake answers 404 for them.
    expect(result.stderr).toBe('Planning Center answered 404 to /service_types/1000013/plans.\n');
  });

  it('says Planning Center refused the token, naming its file, on a 401, exit 1, and prints the token nowhere', async () => {
    const workspace = await createWorkspace();
    const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: 'a-secret-the-token-file-lacks' });
    fakes.push(fake);
    const token = await tokenFile(workspace);

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, token);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Planning Center refused the token in ${token}. Make a new personal access token, put it in that file, and build again.\n`);
    for (const secret of [CLIENT_ID, SECRET, BASIC]) expect(result.stderr).not.toContain(secret);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it.each([
    ['sends nothing back', () => {}],
    [
      'stops partway through its answer',
      (response: ServerResponse) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write('{"data":[');
      },
    ],
  ])('gives one problem line, exit 1, when Planning Center %s', async (_, answer) => {
    const workspace = await createWorkspace();
    const fake = await brokenPlanningCenter(answer);

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace), { PCO_TIMEOUT_MS: '300' });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `Planning Center at ${fake.base} did not answer within 0.3 seconds. Build the set while this Mac is on the internet, before it joins the stage network.\n`,
    );
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('says it cannot reach Planning Center, with the offline advice, when the connection drops partway through an answer, exit 1, and prints none of the body', async () => {
    const mark = 'partway-body-7c2e';
    const workspace = await createWorkspace();
    const fake = await brokenPlanningCenter((response) => {
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': '5000' });
      response.write(`{"data":[{"type":"${mark}"`);
      setTimeout(() => response.socket?.destroy(), 20);
    });

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace), { PCO_TIMEOUT_MS: '30000' });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Cannot reach Planning Center at ${fake.base}. Build the set while this Mac is on the internet, before it joins the stage network.\n`);
    expect(result.stderr).not.toContain(mark);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('says the answer cannot be read when a whole gzip body will not inflate, exit 1, and prints none of the body', async () => {
    const mark = 'not-gzip-4b8e';
    const workspace = await createWorkspace();
    const fake = await brokenPlanningCenter((response) => {
      response.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
      response.end(mark);
    });

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace), { PCO_TIMEOUT_MS: '30000' });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Planning Center sent an answer to /service_types that cannot be read.\n');
    expect(result.stderr).not.toContain(mark);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('says it cannot reach Planning Center when nothing listens at the API base, exit 1', async () => {
    const workspace = await createWorkspace();
    const server = createServer();
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await new Promise((done) => server.close(done));

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], { base, requests: [], close: async () => {} }, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Cannot reach Planning Center at ${base}. Build the set while this Mac is on the internet, before it joins the stage network.\n`);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });
});

describe('pnpm build-set --plan, a plan with no songs', { timeout: 30_000 }, () => {
  // The recorded November 1 plan with every song item taken out: a plan made from its template before the songs are added.
  async function planWithNoSongs(): Promise<PlanningCenter> {
    const body = await recorded(NOVEMBER_1_ITEMS);
    body.data = body.data.filter((record) => record.attributes.item_type !== 'song');
    return planningCenterWith({ path: NOVEMBER_1_ITEMS, body });
  }

  it.each([
    ['--plan', (workspace: Workspace) => ['--plan', '--date', NOVEMBER_1, ...paths(workspace)]],
    ['--plan --list', (workspace: Workspace) => ['--plan', '--list', '--date', NOVEMBER_1, ...listPaths(workspace)]],
  ])('%s stops with one line that names the plan and the fix, exit 1, and writes nothing', async (_, args) => {
    const workspace = await createWorkspace();
    const fake = await planWithNoSongs();

    const result = await run(args(workspace), fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('The "Service" plan on 2026-11-01 has no songs in Planning Center. Add them to the plan, then build again.\n');
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });
});

// The workspace a Phase 0 build needs: a folder for each of its songs in the plan's key, made from fixture songs whose
// pairs take an overlap and a pad (grace into great are, great are with a pad into goodness), the template's PAD track,
// and the pad in E.
async function phase0Workspace(): Promise<Workspace> {
  const workspace = await createWorkspace();
  await copySongAs(workspace, GRACE, WELCOME_HOME);
  await copySongAs(workspace, GREAT_ARE, YES_AND_AMEN);
  await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
  await addPadTrack(workspace);
  await addPad(workspace, 'E', 120);
  return workspace;
}

// The summary's song lines, numbered from 1, without the set's name, its warnings and its path.
const songLines = (stdout: string) => stdout.split('\n').filter((line) => /^\d+\. /.test(line));

// A summary line's first field, the song's number and title, and its last, the transition after it, or its meter when
// it has none.
const ends = (line: string | undefined) => {
  const fields = (line ?? '').split('  ');
  return [fields[0], fields.at(-1)];
};

describe('pnpm build-set --plan, transitions from the plan', { timeout: 30_000 }, () => {
  it('builds the Phase 0 plan with an overlap after WELCOME HOME, from its "Overlap" note, and a pad after Yes And Amen, from the "Prayer" after it, as the typed command does', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const lines = songLines(result.stdout);
    expect(lines).toHaveLength(3);
    expect(ends(lines[0])).toEqual(['1. WELCOME HOME', 'overlap']);
    expect(ends(lines[1])).toEqual(['2. Yes And Amen', 'pad in E']);
    expect(ends(lines[2])).toEqual(['3. Fall Like Rain', '4/4']);
    expect(existsSync(join(projectFolder(workspace, PHASE_0), 'Songs/_pads/E.wav'))).toBe(true);

    const typed = await phase0Workspace();
    const typedResult = await run([WELCOME_HOME, YES_AND_AMEN, FALL_LIKE_RAIN, '--overlap', '1', '--pad', '2', '--date', PHASE_0, ...paths(typed)], fake, await tokenFile(typed));
    expect(typedResult.code).toBe(0);
    // The plan's build warns of the plan's tempo and meter, which a typed build has none of.
    const withoutWarnings = (stdout: string) => stdout.split('\n').filter((line) => !line.startsWith('Warning: ')).join('\n');
    // The set's path and the lights step's line each name a folder of the workspace.
    expect(withoutWarnings(result.stdout).replaceAll(workspace.dir, '')).toBe(typedResult.stdout.replaceAll(typed.dir, ''));
  });

  it('reads every page of the item notes, so an "Overlap" note on the second page still overlaps', async () => {
    const workspace = await phase0Workspace();
    // The recorded Phase 0 notes in two pages: the pre-service items, which have no notes, on the first, and WELCOME HOME
    // on, with the notes they link, on the second.
    const body = await recorded(PHASE_0_NOTES);
    const nextPath = '/service_types/997539/plans/92852532/items?include=item_notes&offset=5&per_page=100';
    const linked = (items: ItemRecord[]) => {
      const links = items.flatMap((each) => (each.relationships?.item_notes?.data ?? []) as { type: string; id: string }[]);
      return (body.included ?? []).filter((record) => links.some((link) => link.type === record.type && link.id === record.id));
    };
    const first = body.data.filter((each) => Number(each.attributes.sequence) < 6);
    const rest = body.data.filter((each) => Number(each.attributes.sequence) >= 6);
    const page1 = { data: first, included: linked(first), links: { self: `${REAL_API}${PHASE_0_NOTES}`, next: `${REAL_API}${nextPath}` } };
    const page2 = { data: rest, included: linked(rest), links: { self: `${REAL_API}${nextPath}` } };
    const fake = await planningCenterWith({ path: PHASE_0_NOTES, body: page1 }, { path: nextPath, body: page2 });

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(ends(songLines(result.stdout)[0])).toEqual(['1. WELCOME HOME', 'overlap']);
    expect(requestKeys(fake)).toContain(requestKey(nextPath));
  });

  // The November 1 plan with its items moved or added, each case one edit to the recorded order of service.
  const prayerCases: { name: string; edit: (body: ItemsBody) => void; pad?: string; line: number; expected: string }[] = [
    {
      name: 'a "Prayer" right after the last song puts a pad after it, in its own key',
      edit: (body) => (item(body, '1223369631').attributes.sequence = 8.5),
      pad: 'E',
      line: 3,
      expected: '3. Fall Like Rain  bar 162  63 BPM  4/4  pad in E',
    },
    {
      name: 'a "Prayer" before the first song adds nothing',
      edit: (body) => (item(body, '1223369631').attributes.sequence = 5.5),
      line: 1,
      expected: '1. This Is Amazing Grace  bar 1  98 BPM  4/4  gap',
    },
    {
      name: 'a "Prayer" after another non-song item between two songs adds nothing',
      edit: (body) => {
        addItem(body, '900000001', 6.3, 'Welcome');
        addItem(body, '900000002', 6.6, 'Prayer');
      },
      line: 1,
      expected: '1. This Is Amazing Grace  bar 1  98 BPM  4/4  gap',
    },
    {
      name: 'a "Prayer" after a header between two songs, in another case and spacing, puts a pad in the next song\'s key',
      edit: (body) => {
        addItem(body, '900000001', 6.3, 'RESPONSE', 'header');
        addItem(body, '900000002', 6.6, '  prayer ');
      },
      pad: 'D',
      line: 1,
      expected: '1. This Is Amazing Grace  bar 1  98 BPM  4/4  pad in D',
    },
  ];
  it.each(prayerCases)('$name', async ({ edit, pad, line, expected }) => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    if (pad !== undefined) {
      await addPadTrack(workspace);
      await addPad(workspace, pad, 120);
    }
    const body = await recorded(NOVEMBER_1_ITEMS);
    edit(body);
    const fake = await planningCenterWith({ path: NOVEMBER_1_ITEMS, body });

    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout)[line - 1]).toBe(expected);
  });

  it('stops on an "overlap" note on the last song, exit 1, and writes nothing', async () => {
    const workspace = await phase0Workspace();
    const body = await recorded(PHASE_0_NOTES);
    addNote(body, FALL_LIKE_RAIN_ITEM, '900000101', 'overlap');
    const fake = await planningCenterWith({ path: PHASE_0_NOTES, body });

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('The plan\'s "overlap" note on song 3, "Fall Like Rain", names the last song, which has no song after it to overlap into.\n');
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('stops on an "overlap" note on the last song with a "Prayer" after it as the last-song problem, exit 1, and writes nothing; --pad and --gap on it build', async () => {
    const workspace = await phase0Workspace();
    const items = await recorded(PHASE_0_ITEMS);
    addItem(items, '900000201', 9.5, 'Prayer');
    const notes = await recorded(PHASE_0_NOTES);
    addNote(notes, FALL_LIKE_RAIN_ITEM, '900000101', 'overlap');
    const fake = await planningCenterWith({ path: PHASE_0_ITEMS, body: items }, { path: PHASE_0_NOTES, body: notes });

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('The plan\'s "overlap" note on song 3, "Fall Like Rain", names the last song, which has no song after it to overlap into.\n');
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();

    for (const flag of ['--pad', '--gap']) {
      const overridden = await run(['--plan', flag, '3', '--replace', projectFolder(workspace, PHASE_0), '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

      expect(overridden.stderr).toBe('');
      expect(overridden.code).toBe(0);
    }
  });

  it('stops on a song change the plan gives both a "Prayer" item and an "overlap" note, exit 1, and writes nothing; --gap on it builds', async () => {
    const workspace = await phase0Workspace();
    const body = await recorded(PHASE_0_NOTES);
    addNote(body, YES_AND_AMEN_ITEM, '900000101', 'overlap');
    const fake = await planningCenterWith({ path: PHASE_0_NOTES, body });

    const result = await run(['--plan', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'The plan gives the song change after song 2, "Yes And Amen", both a "Prayer" item and an "overlap" note. Give each song change one transition.\n',
    );
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();

    const overridden = await run(['--plan', '--gap', '2', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(overridden.stderr).toBe('');
    expect(overridden.code).toBe(0);
    expect(songLines(overridden.stdout).map(ends)).toEqual([
      ['1. WELCOME HOME', 'overlap'],
      ['2. Yes And Amen', 'gap'],
      ['3. Fall Like Rain', '4/4'],
    ]);
  });

  // The plan's own transitions are an overlap after song 1 and a pad in E after song 2, so each row's other lines are
  // the plan's.
  it.each([
    { flags: ['--gap', '1'], pad: undefined, expected: ['gap', 'pad in E', '4/4'] },
    { flags: ['--gap', '2'], pad: undefined, expected: ['overlap', 'gap', '4/4'] },
    { flags: ['--overlap', '2'], pad: undefined, expected: ['overlap', 'overlap', '4/4'] },
    { flags: ['--pad', '1=G'], pad: 'G', expected: ['pad in G', 'pad in E', '4/4'] },
    { flags: ['--pad', '3'], pad: undefined, expected: ['overlap', 'pad in E', 'pad in E'] },
  ])('overrides the plan for the position $flags names and keeps the plan\'s transitions at the others', async ({ flags, pad, expected }) => {
    const workspace = await phase0Workspace();
    if (pad !== undefined) await addPad(workspace, pad, 120);
    const fake = await planningCenter();

    const result = await run(['--plan', ...flags, '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout).map(ends)).toEqual([
      ['1. WELCOME HOME', expected[0]],
      ['2. Yes And Amen', expected[1]],
      ['3. Fall Like Rain', expected[2]],
    ]);
  });

  it('stops with a usage message, exit 2, and writes nothing when two transition flags name one of the plan\'s songs', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--gap', '1', '--overlap', '1', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith('Song 1 has both --gap and --overlap. Give each song change one transition.\n\nUsage:'), result.stderr).toBe(true);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });
});

// The token file `text` at `at` in a scratch home folder in the workspace, mode 600: the home folder, for HOME, so no
// test reads a token file in the real home folder, and the file.
async function homeToken(workspace: Workspace, text: string, at = 'pco.env'): Promise<{ home: string; file: string }> {
  const home = join(workspace.dir, 'home');
  const file = join(home, at);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, text);
  await chmod(file, 0o600);
  return { home, file };
}

const PLAIN_TOKEN = `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET=${SECRET}\n`;

// The credentials of each request the fake recorded, decoded from its Basic Authorization.
const sentCredentials = (fake: PlanningCenter) =>
  fake.requests.map(({ authorization }) => Buffer.from((authorization ?? '').replace(/^Basic /, ''), 'base64').toString());

// Neither output holds the client id or the secret.
function expectNoTokenValue(result: { stdout: string; stderr: string }): void {
  for (const output of [result.stdout, result.stderr]) {
    expect(output).not.toContain(CLIENT_ID);
    expect(output).not.toContain(SECRET);
  }
}

describe('pnpm build-set --plan, the token file and PCO_ENV', { timeout: 30_000 }, () => {
  const listArgs = (workspace: Workspace) => ['--plan', '--list', '--date', NOVEMBER_1, ...listPaths(workspace)];

  it('lists the plan with an absolute PCO_ENV and a plain token file', async () => {
    const workspace = await createWorkspace();
    const { home, file } = await homeToken(workspace, PLAIN_TOKEN);
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, file, { HOME: home });

    expect(result.stderr).toBe('');
    expect(result.stdout.startsWith('2026-11-01 Sunday\n')).toBe(true);
    expectNoTokenValue(result);
  });

  it('reads a PCO_ENV of ~/pco.env, its ~ unexpanded by a shell, from the home folder', async () => {
    const workspace = await createWorkspace();
    const { home } = await homeToken(workspace, PLAIN_TOKEN);
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, '~/pco.env', { HOME: home });

    expect(result.stderr).toBe('');
    expect(result.stdout.startsWith('2026-11-01 Sunday\n')).toBe(true);
    expectNoTokenValue(result);
  });

  it('sends a PCO_SECRET in double quotes without its quotes', async () => {
    const workspace = await createWorkspace();
    const { home, file } = await homeToken(workspace, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET="${SECRET}"\n`);
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, file, { HOME: home });

    expect(sentCredentials(fake)[0]).toBe(`${CLIENT_ID}:${SECRET}`);
    expect(result.stderr).toBe('');
    expect(result.stdout.startsWith('2026-11-01 Sunday\n')).toBe(true);
    expectNoTokenValue(result);
  });

  it('reads export NAME=value lines as NAME', async () => {
    const workspace = await createWorkspace();
    const { home, file } = await homeToken(workspace, `export PCO_CLIENT_ID=${CLIENT_ID}\nexport PCO_SECRET=${SECRET}\n`);
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, file, { HOME: home });

    expect(result.stderr).toBe('');
    expect(result.stdout.startsWith('2026-11-01 Sunday\n')).toBe(true);
    expectNoTokenValue(result);
  });

  it('reads the default token file under HOME when PCO_ENV is empty', async () => {
    const workspace = await createWorkspace();
    const { home } = await homeToken(workspace, PLAIN_TOKEN, '.config/setlist-controller/pco.env');
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, '', { HOME: home });

    expect(result.stderr).toBe('');
    expect(result.stdout.startsWith('2026-11-01 Sunday\n')).toBe(true);
    expectNoTokenValue(result);
  });

  // A comment after the value, read as a shell reads it. Each secret with a # in it holds SECRET, so expectNoTokenValue
  // catches a leak of the whole value too.
  it.each([
    ['a # after a space ends an unquoted value', `PCO_SECRET=${SECRET} # new token`, SECRET],
    ['a # after a tab ends an unquoted value', `PCO_SECRET=${SECRET}\t# new token`, SECRET],
    ['a # with no space or tab before it stays in an unquoted value', `PCO_SECRET=${SECRET}#cd`, `${SECRET}#cd`],
    ['a comment after a value in double quotes is dropped with the quotes', `PCO_SECRET="${SECRET}" # new token`, SECRET],
    ['a # inside double quotes stays in the value', `PCO_SECRET="${SECRET} # cd"`, `${SECRET} # cd`],
  ])('sends the secret when %s', async (_, line, secret) => {
    const workspace = await createWorkspace();
    const { home, file } = await homeToken(workspace, `PCO_CLIENT_ID=${CLIENT_ID}\n${line}\n`);
    const fake = await planningCenter(secret);

    const result = await run(listArgs(workspace), fake, file, { HOME: home });

    expect(sentCredentials(fake)[0]).toBe(`${CLIENT_ID}:${secret}`);
    expect(result.stderr).toBe('');
    expect(result.stdout.startsWith('2026-11-01 Sunday\n')).toBe(true);
    expectNoTokenValue(result);
  });

  it('ignores a commented-out PCO_SECRET line before the real one', async () => {
    const workspace = await createWorkspace();
    const { home, file } = await homeToken(workspace, `PCO_CLIENT_ID=${CLIENT_ID}\n# PCO_SECRET=old\nPCO_SECRET=${SECRET}\n`);
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, file, { HOME: home });

    expect(sentCredentials(fake)[0]).toBe(`${CLIENT_ID}:${SECRET}`);
    expect(result.stderr).toBe('');
    expect(result.stdout.startsWith('2026-11-01 Sunday\n')).toBe(true);
    expectNoTokenValue(result);
  });

  it('stops on a token file whose only PCO_SECRET line is commented out with the line that it has none, exit 1, before any request', async () => {
    const workspace = await createWorkspace();
    const { home, file } = await homeToken(workspace, `PCO_CLIENT_ID=${CLIENT_ID}\n# PCO_SECRET=${SECRET}\n`);
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, file, { HOME: home });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`The Planning Center token file ${file} has no PCO_SECRET.\n`);
    expect(fake.requests).toEqual([]);
    expectNoTokenValue(result);
  });

  it('stops on a PCO_ENV that names no file with the line that it cannot read it, exit 1, before any request', async () => {
    const workspace = await createWorkspace();
    const { home } = await homeToken(workspace, PLAIN_TOKEN);
    const missing = join(workspace.dir, 'no-token.env');
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, missing, { HOME: home });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Cannot read the Planning Center token file ${missing}.\n`);
    expect(fake.requests).toEqual([]);
  });

  it('stops on a token file no one can read, mode 000, with the line that it cannot read it, no chmod advice, exit 1, before any request', async () => {
    const workspace = await createWorkspace();
    const { home, file } = await homeToken(workspace, PLAIN_TOKEN);
    await chmod(file, 0o000);
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, file, { HOME: home });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Cannot read the Planning Center token file ${file}.\n`);
    expect(fake.requests).toEqual([]);
    expectNoTokenValue(result);
  });

  it('stops on a PCO_ENV that names a folder with the line that it cannot read it, no chmod advice, exit 1, before any request', async () => {
    const workspace = await createWorkspace();
    const { home } = await homeToken(workspace, PLAIN_TOKEN);
    const folder = join(workspace.dir, 'tokens');
    await mkdir(folder);
    await chmod(folder, 0o755);
    const fake = await planningCenter();

    const result = await run(listArgs(workspace), fake, folder, { HOME: home });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Cannot read the Planning Center token file ${folder}.\n`);
    expect(fake.requests).toEqual([]);
    expectNoTokenValue(result);
  });
});

// --skip <n> leaves plan song n out of the set (setlist-controller#31). Every other flag keeps the plan's numbers.
describe('pnpm build-set --plan --skip', { timeout: 30_000 }, () => {
  it('builds the set without the skipped song: the song before it overlaps into the next song not skipped, and the "Prayer" after the skipped song gives no pad', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--skip', '2', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout).map(ends)).toEqual([
      ['1. WELCOME HOME', 'overlap'],
      ['3. Fall Like Rain', '4/4'],
    ]);
  });

  it('writes the set manifest with the songs it built, each with its own chart, and none for the skipped song', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    expect((await run(['--plan', '--skip', '2', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace))).code).toBe(0);

    type ManifestSong = { title: string; chartText?: string };
    const { songs } = JSON.parse(await readFile(workspace.setManifest, 'utf8')) as { songs: ManifestSong[] };
    // WELCOME HOME's and Fall Like Rain's arrangements in the Phase 0 plan, each with its made-up chart.
    expect(songs.map(({ title, chartText }) => ({ title, chartText }))).toEqual([
      { title: 'WELCOME HOME', chartText: madeUpChart('36313264').chord_chart },
      { title: 'Fall Like Rain', chartText: madeUpChart('36302201').chord_chart },
    ]);
  });

  it('gives nothing for the "overlap" note on a skipped song', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--skip', '1', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout).map((line) => ends(line)[1])).toEqual(['pad in E', '4/4']);
  });

  it('numbers the songs of the summary and its warnings as the plan does, so the numbers match the flags', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--skip', '1', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(0);
    expect(songLines(result.stdout).map((line) => ends(line)[0])).toEqual(['2. Yes And Amen', '3. Fall Like Rain']);
    expect(result.stdout.split('\n').filter((line) => line.startsWith('Warning: '))).toEqual(['Warning: song 2, "Yes And Amen", is planned in 4/4, and its song starts in 6/8.']);
  });

  it('keeps the "Prayer" after the song before a skipped song as a pad, in the key of the next song not skipped', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    await addPadTrack(workspace);
    await addPad(workspace, 'E', 120);
    const body = await recorded(NOVEMBER_1_ITEMS);
    addItem(body, '900000002', 6.6, 'Prayer');
    const fake = await planningCenterWith({ path: NOVEMBER_1_ITEMS, body });

    const result = await run(['--plan', '--skip', '2', '--date', NOVEMBER_1, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout).map((line) => ends(line)[1])).toEqual(['pad in E', '4/4']);
  });

  it('stops on an "overlap" note on the last song not skipped as the last-song problem, exit 1, and writes nothing', async () => {
    const workspace = await phase0Workspace();
    const body = await recorded(PHASE_0_NOTES);
    addNote(body, YES_AND_AMEN_ITEM, '900000101', 'overlap');
    const fake = await planningCenterWith({ path: PHASE_0_NOTES, body });

    const result = await run(['--plan', '--skip', '3', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('The plan\'s "overlap" note on song 2, "Yes And Amen", names the last song, which has no song after it to overlap into.\n');
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });

  it('puts a pad after the last song not skipped when a "Prayer" follows it, in its own key', async () => {
    const workspace = await phase0Workspace();
    await addPad(workspace, 'G', 120);
    const fake = await planningCenter();

    const result = await run(['--plan', '--skip', '3', '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(songLines(result.stdout).map(ends)).toEqual([
      ['1. WELCOME HOME', 'overlap'],
      ['2. Yes And Amen', 'pad in G'],
    ]);
  });

  it.each([
    { flags: ['--skip', '4'], problem: '--skip must name a song by its position, a whole number from 1 to 3, not "4".' },
    { flags: ['--skip', 'two'], problem: '--skip must name a song by its position, a whole number from 1 to 3, not "two".' },
    { flags: ['--skip', '1', '--skip', '2', '--skip', '3'], problem: '--skip leaves out every song of the plan, so there is no set to build.' },
    { flags: ['--skip', '2', '--skip', '02'], problem: 'Song 2 has --skip twice, "2" and "02". Give --skip once for each song to leave out.' },
    { flags: ['--skip', '2', '--pad', '2'], problem: '--pad 2 names song 2, which --skip 2 leaves out of the set.' },
    { flags: ['--skip', '3', '--overlap', '3'], problem: '--overlap 3 names song 3, which --skip 3 leaves out of the set.' },
    { flags: ['--skip', '2', '--gap', '2'], problem: '--gap 2 names song 2, which --skip 2 leaves out of the set.' },
    { flags: ['--skip', '3', '--overlap', '2'], problem: '--overlap 2 names the last song, which has no song after it to overlap into.' },
  ])('stops on $flags with a usage message, exit 2, and writes nothing', async ({ flags, problem }) => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', ...flags, '--date', PHASE_0, ...paths(workspace)], fake, await tokenFile(workspace));

    expect(result.stdout).toBe('');
    expect(result.stderr.split('\n')[0]).toBe(problem);
    expect(result.code).toBe(2);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });
});
