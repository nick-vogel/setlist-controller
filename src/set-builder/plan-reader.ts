import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { sameName } from './name-rule.ts';
import { planKey } from './pads.ts';

// The plan reader: the only module that talks to Planning Center. It reads the token from its file, and the week's plan
// from the Services API, and returns a plain description of the plan's songs and its order of service, or the problems
// that stop the build. It never returns or prints the token or a response body.

// The token's file when PCO_ENV names none.
export const TOKEN_FILE = '~/.config/setlist-controller/pco.env';

// The token's file for a PCO_ENV of `pcoEnv`: TOKEN_FILE when it is unset or empty, else the file it names. A ~ alone or
// at the start of ~/ is the home folder, as a shell would have expanded it, and a relative path resolves from `from`.
export function tokenFilePath(pcoEnv: string | undefined, from: string): string {
  const file = pcoEnv === undefined || pcoEnv === '' ? TOKEN_FILE : pcoEnv;
  return resolve(from, file === '~' || file.startsWith('~/') ? homedir() + file.slice(1) : file);
}

// The values a token file's text names, by name, read as a shell reads them. A line that starts with #, after its
// leading white space, is a comment. Each other line holding an = is a name and a value: the trimmed text before the
// first =, after a leading export, and the value after it. A value that starts with a double or single quote, and ends
// at a matching quote followed by nothing, or by a space or a tab, a # and anything, is the text between the quotes,
// a # and spaces included. Any other value is cut at the first # that follows a space or a tab, and trimmed: a # with
// no space or tab before it stays, so ab#cd is ab#cd and ab # cd is ab.
export function tokenValues(text: string): Map<string, string> {
  return new Map(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const named = line.replace(/^export\s+/, '');
        const at = named.indexOf('=');
        const raw = named.slice(at + 1);
        const quoted = /^(["'])(.*?)\1(?:[ \t]+#.*)?$/.exec(raw.trimStart());
        return [named.slice(0, at).trim(), quoted === null ? raw.replace(/[ \t]#.*$/, '').trim() : (quoted[2] ?? '')] as const;
      }),
  );
}

// The Authorization header value for the token in `file`, HTTP Basic of PCO_CLIENT_ID and PCO_SECRET; or the one
// problem that stops the build. A path that is not a file cannot be read. A file the group or others can read is
// refused before it is read, with the chmod that fixes it. A problem names the file and the missing name, never a value.
export async function readToken(file: string): Promise<{ ok: true; authorization: string } | { ok: false; problem: string }> {
  const info = await stat(file).catch(() => undefined);
  if (info === undefined || !info.isFile()) return { ok: false, problem: `Cannot read the Planning Center token file ${file}.` };
  if ((info.mode & 0o044) !== 0) {
    return { ok: false, problem: `The Planning Center token file ${file} can be read by other users. Run chmod 600 ${file}, then build again.` };
  }
  const text = await readFile(file, 'utf8').catch(() => undefined);
  if (text === undefined) return { ok: false, problem: `Cannot read the Planning Center token file ${file}.` };
  const values = tokenValues(text);
  const missing = ['PCO_CLIENT_ID', 'PCO_SECRET'].find((name) => !values.get(name));
  if (missing !== undefined) return { ok: false, problem: `The Planning Center token file ${file} has no ${missing}.` };
  return { ok: true, authorization: `Basic ${Buffer.from(`${values.get('PCO_CLIENT_ID')}:${values.get('PCO_SECRET')}`).toString('base64')}` };
}

// The Services API's base when PCO_API_BASE names none. PCO_API_BASE is for the tests, and not a user setting.
export const API_BASE = 'https://api.planningcenteronline.com/services/v2';

// How every request to Planning Center names this app. Planning Center asks for `<app name> (<link or email>)` on every
// request and may answer 403 to one without it, and Node's fetch alone sends only `node`. The fixture recorder imports
// it too, so the two send the same value.
export const USER_AGENT = 'setlist-controller (https://github.com/nick-vogel/setlist-controller)';

// A song in the plan, in plan order: its title, its key (the item's key name, or the included Key's starting key, as
// read by planKey, so `e` is E and `G-A` is G), and its arrangement's BPM and meter, each when the plan has it (a BPM
// only when it is a number above 0, since 0 is never a tempo), the text of each of its item notes, and its arrangement's
// chord chart: its text, trimmed, when it holds any, and with it the chart's key as Planning Center holds it, trimmed and
// not read as a note name.
export type PlanSong = { title: string; key?: string; bpm?: number; meter?: string; notes: string[]; chartText?: string; chartKey?: string };

// An entry in the plan's order of service, headers left out: a song, by its position in `songs` counted from 1, or any
// other item, by its title ('' when it has none) and its Planning Center item type.
export type PlanItem = { kind: 'song'; position: number } | { kind: 'item'; title: string; type: string };

export type Plan = { songs: PlanSong[]; items: PlanItem[] };

export type PlanReading = { ok: true; plan: Plan } | { ok: false; problems: string[] };

// A JSON:API link to one record.
type ApiLink = { type: string; id: string };

// One JSON:API record, as far as the reader looks into it. A to-one relationship links one record or none, a to-many
// one a list.
type ApiRecord = {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: ApiLink | ApiLink[] | null } | undefined>;
};

// A JSON:API document, as far as the reader looks into it. Its `links` are read only for a `next` that is a string.
type ApiDocument = { data: ApiRecord[]; included?: ApiRecord[]; links?: unknown };

type Problems = { ok: false; problems: string[] };

// Every record of a list, across its pages: the pages' `data`, and their `included`, each concatenated in page order.
type ApiList = { ok: true; data: ApiRecord[]; included: ApiRecord[] };

// The plan of `serviceType` on `date`, YYYY-MM-DD, or the problems that stop the build. The type is the one whose id is
// `serviceType`, else the one named it under the name rule. The plans on the date are read from the type's future plans
// and its past plans, each list in date order and read page by page until it is past the date, so a rebuild after the
// service still finds its plan. One plan on the date is the plan; with several, `planId` names one of them. Then the
// plan's items, once with their songs, keys and arrangements, each arrangement with its chord chart, and once with their
// notes, every page of each, joined by item id; a plan with no song items is a problem. A plan's sort date is its
// service's wall time written with a Z, so `2026-11-01T10:30:00Z` is on 2026-11-01.
// Each request waits `timeoutMs` for its answer; a request that fails is one problem line, never a stack trace or a body.
export async function readPlan({
  apiBase,
  authorization,
  tokenFile,
  timeoutMs,
  serviceType,
  planId,
  date,
}: {
  apiBase: string;
  authorization: string;
  tokenFile: string;
  timeoutMs: number;
  serviceType: string;
  planId?: string;
  date: string;
}): Promise<PlanReading> {
  const fail = (problem: string): Problems => ({ ok: false, problems: [problem] });
  // A URL under the API base as a problem names it: its path below the base, without the query.
  const shown = (url: string) => url.slice(apiBase.length).split('?')[0];
  const offline = 'Build the set while this Mac is on the internet, before it joins the stage network.';
  const late = () => fail(`Planning Center at ${apiBase} did not answer within ${timeoutMs / 1000} seconds. ${offline}`);
  const timedOut = (error: unknown) => typeof error === 'object' && error !== null && 'name' in error && error.name === 'TimeoutError';
  // A compressed body that will not inflate: fetch throws the same error as for a dropped connection, and only the
  // zlib code (Z_DATA_ERROR and its kin) on its cause tells them apart.
  const inflateFailed = (error: unknown) =>
    error instanceof Error && typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause && typeof error.cause.code === 'string' && error.cause.code.startsWith('Z_');

  // One request, to `url` under the API base. The timeout covers the answer's headers and its body alike.
  const get = async (url: string): Promise<{ ok: true; document: ApiDocument } | Problems> => {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: authorization, Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      return timedOut(error) ? late() : fail(`Cannot reach Planning Center at ${apiBase}. ${offline}`);
    }
    if (response.status === 401) return fail(`Planning Center refused the token in ${tokenFile}. Make a new personal access token, put it in that file, and build again.`);
    if (!response.ok) return fail(`Planning Center answered ${response.status} to ${shown(url)}.`);
    // An answer that arrives but cannot be read is one problem, never the body itself: a whole body that is not JSON or
    // not a whole JSON:API document, and a compressed body that will not inflate. A body cut short on a connection that
    // closes with no length also arrives as JSON that does not parse, so it reads the same. A body the connection drops
    // partway through is the connection's problem, and one that stops coming the timeout's.
    let document: unknown;
    try {
      document = await response.json();
    } catch (error) {
      if (timedOut(error)) return late();
      if (!(error instanceof SyntaxError) && !inflateFailed(error)) return fail(`Cannot reach Planning Center at ${apiBase}. ${offline}`);
    }
    if (!isDocument(document)) return fail(`Planning Center sent an answer to ${shown(url)} that cannot be read.`);
    return { ok: true, document };
  };

  // Every page of the list at `path`, following each page's `links.next` until a page has none, or `done` says the
  // pages read so far hold all the list can give. A next page outside the API base is a problem, so the token goes to
  // no other host, and a next page already read ends the list, so a server that names one page forever cannot hold the
  // build.
  const list = async (path: string, done: (page: ApiDocument) => boolean = () => false): Promise<ApiList | Problems> => {
    const result: ApiList = { ok: true, data: [], included: [] };
    const read = new Set<string>();
    let url = `${apiBase}${path}`;
    for (;;) {
      read.add(url);
      const page = await get(url);
      if (!page.ok) return page;
      result.data.push(...page.document.data);
      result.included.push(...(page.document.included ?? []));
      const next = nextLink(page.document);
      if (next === undefined || done(page.document) || read.has(next)) return result;
      if (!next.startsWith(`${apiBase}/`)) return fail(`Planning Center sent a next page outside ${apiBase}.`);
      url = next;
    }
  };

  const types = await list('/service_types?per_page=100');
  if (!types.ok) return types;
  const type =
    types.data.find((record) => record.id === serviceType) ??
    types.data.find((record) => typeof record.attributes.name === 'string' && sameName(record.attributes.name, serviceType));
  if (type === undefined) {
    const known = types.data.map((record) => `${text(record.attributes.name) ?? 'unnamed'} (${record.id})`).join(', ');
    return fail(`Planning Center has no service type "${serviceType}". Its service types: ${known}.`);
  }
  const typeName = text(type.attributes.name) ?? serviceType;

  // The future plans come in date order and the past ones newest first, so a list is read once a page ends past the date.
  const dayOf = (plan: ApiRecord | undefined) => (typeof plan?.attributes.sort_date === 'string' ? plan.attributes.sort_date.slice(0, 10) : undefined);
  const endsPast = (past: (day: string) => boolean) => (page: ApiDocument) => {
    const day = dayOf(page.data.at(-1));
    return day !== undefined && past(day);
  };
  const plansPath = `/service_types/${encodeURIComponent(type.id)}/plans`;
  const future = await list(`${plansPath}?filter=future&order=sort_date&per_page=100`, endsPast((day) => day > date));
  if (!future.ok) return future;
  const past = await list(`${plansPath}?filter=past&order=-sort_date&per_page=25`, endsPast((day) => day < date));
  if (!past.ok) return past;
  // The two lists may share a plan, as the service passes between the two requests.
  const onDate = new Map<string, ApiRecord>();
  for (const plan of [...future.data, ...past.data]) if (dayOf(plan) === date && !onDate.has(plan.id)) onDate.set(plan.id, plan);
  const plans = [...onDate.values()].toSorted((a, b) => String(a.attributes.sort_date).localeCompare(String(b.attributes.sort_date)));
  // Each plan on the date as a problem lists it: its id, its title or "untitled", and its first time, from its sort date.
  const described = plans
    .map((each) => {
      const title = text(each.attributes.title);
      return `${each.id} ${title === undefined ? 'untitled' : `"${title}"`} at ${String(each.attributes.sort_date).slice(11, 16)}`;
    })
    .join(', ');
  // The id given is only compared with the plans listed, and never put in a URL.
  const plan = planId !== undefined ? onDate.get(planId) : plans.length === 1 ? plans[0] : undefined;
  if (plan === undefined) {
    if (planId !== undefined) {
      const there = plans.length === 0 ? `There is no "${typeName}" plan on ${date}.` : `The plans on ${date}: ${described}.`;
      return fail(`--plan-id ${planId} is not a "${typeName}" plan on ${date}. ${there}`);
    }
    if (plans.length === 0) return fail(`"${typeName}" has no plan on ${date} in Planning Center.`);
    return fail(`Planning Center has ${plans.length} "${typeName}" plans on ${date}. Name one with --plan-id: ${described}.`);
  }

  const itemsPath = `${plansPath}/${encodeURIComponent(plan.id)}/items`;
  const items = await list(`${itemsPath}?include=song,key,arrangement&per_page=100`);
  if (!items.ok) return items;
  const withNotes = await list(`${itemsPath}?include=item_notes&per_page=100`);
  if (!withNotes.ok) return withNotes;
  const { included } = items;
  const related = (item: ApiRecord, name: string) => {
    const link = item.relationships?.[name]?.data;
    return link && !Array.isArray(link) ? included.find((record) => record.type === link.type && record.id === link.id) : undefined;
  };
  // Each item's notes by the item's id: the text of each included ItemNote its item_notes relationship lists.
  const notesOf = new Map(
    withNotes.data.map((item) => {
      const links = item.relationships?.item_notes?.data;
      const notes = (Array.isArray(links) ? links : [])
        .map((link) => withNotes.included.find((record) => record.type === link.type && record.id === link.id))
        .map((note) => text(note?.attributes.content))
        .filter((note) => note !== undefined);
      return [item.id, notes] as const;
    }),
  );
  const songs: PlanSong[] = [];
  const order: PlanItem[] = [];
  for (const item of items.data.toSorted((a, b) => Number(a.attributes.sequence) - Number(b.attributes.sequence))) {
    const type = text(item.attributes.item_type) ?? '';
    if (type === 'header') continue;
    if (type !== 'song') {
      order.push({ kind: 'item', title: text(item.attributes.title) ?? '', type });
      continue;
    }
    const key = related(item, 'key')?.attributes;
    const arrangement = related(item, 'arrangement')?.attributes;
    const written = text(item.attributes.key_name) ?? (text(key?.starting_key) && `${text(key?.starting_key)}${key?.starting_minor === true ? 'm' : ''}`);
    const keyName = written ? planKey(written) : undefined;
    const bpm = arrangement?.bpm;
    const meter = text(arrangement?.meter);
    const chartText = text(arrangement?.chord_chart);
    const chartKey = text(arrangement?.chord_chart_key);
    songs.push({
      title: text(item.attributes.title) ?? '',
      ...(keyName ? { key: keyName } : {}),
      ...(typeof bpm === 'number' && bpm > 0 ? { bpm } : {}),
      ...(meter ? { meter } : {}),
      notes: notesOf.get(item.id) ?? [],
      ...(chartText === undefined ? {} : { chartText, ...(chartKey === undefined ? {} : { chartKey }) }),
    });
    order.push({ kind: 'song', position: songs.length });
  }
  // A plan made from its template before its songs are added: the build and the listing alike stop here, naming the plan.
  if (songs.length === 0) return fail(`The "${typeName}" plan on ${date} has no songs in Planning Center. Add them to the plan, then build again.`);
  return { ok: true, plan: { songs, items: order } };
}

// Whether `value` is a JSON:API document as far as the reader looks into it: a list of records in `data`, and in
// `included` when it is there, each with a string type and id and an attributes object.
function isDocument(value: unknown): value is ApiDocument {
  const isObject = (item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item);
  const isRecords = (items: unknown) =>
    Array.isArray(items) && items.every((item) => isObject(item) && typeof item.type === 'string' && typeof item.id === 'string' && isObject(item.attributes));
  return isObject(value) && isRecords(value.data) && (value.included === undefined || isRecords(value.included));
}

// The document's `links.next`, when it is a string.
function nextLink(document: ApiDocument): string | undefined {
  const { links } = document;
  const next = typeof links === 'object' && links !== null && 'next' in links ? links.next : undefined;
  return typeof next === 'string' ? next : undefined;
}

// A string attribute that holds text, or undefined.
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
