import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';

// A fake Planning Center for the --plan tests: a local HTTP server on a port the OS assigns, answering from the recorded
// fixtures in test/fixtures/planning-center, each `{ path, status, body }`. It checks every request's Authorization
// header against the token it was started with, and records each request with its Authorization and User-Agent, so a
// test can show what the command asked for, how it named itself, and that it asked nothing of the real API. No test
// reaches the real API.

export const PLANNING_CENTER_FIXTURES = resolve(import.meta.dirname, 'fixtures/planning-center');

// The second recording, of 2026-10-22 (#168): only the files that differ from PLANNING_CENTER_FIXTURES, which a test lays
// over them by request path. It sits outside that folder because the scrubber empties that one and writes it again from a
// recording (its README says more).
export const PLANNING_CENTER_FIXTURES_2026_10_22 = resolve(import.meta.dirname, 'fixtures/planning-center-2026-10-22');

// The real API's base, as the recorded bodies' links write it. The fake rewrites it to its own base, so a `links.next`
// comes back to the fake.
const REAL_API = 'https://api.planningcenteronline.com/services/v2';

export type RecordedRequest = { method: string; path: string; authorization: string | undefined; userAgent: string | undefined };

export type PlanningCenter = {
  // The base URL the command is pointed at by PCO_API_BASE.
  base: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
};

export type Fixture = { path: string; status: number; body: unknown };

// The keys a made-up chart is typed in, one picked by the arrangement's id.
const MADE_UP_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb'];

// A made-up chord chart for the arrangement with id `id`, as Planning Center's Arrangement holds one in its chord_chart
// and chord_chart_key attributes: two headings, each over a line of words with chords in square brackets, the words
// naming the id, so each arrangement's chart differs from every other's. The recorded fixtures hold no real chart, since
// the scrub removes them.
export function madeUpChart(id: string): { chord_chart: string; chord_chart_key: string } {
  const key = MADE_UP_KEYS[Number(id) % MADE_UP_KEYS.length] ?? 'C';
  return { chord_chart: `VERSE\n[${key}]Made up words for arrangement ${id}\n\nCHORUS\nA made up [${key}]chorus line`, chord_chart_key: key };
}

// The body with madeUpChart laid onto each Arrangement record in its `data` and `included` that has no chord_chart
// attribute of its own, so a test opts a song out with a chord_chart of null, or gives it text of its own.
function withMadeUpCharts(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const document = structuredClone(body) as { data?: unknown; included?: unknown };
  for (const records of [document.data, document.included]) {
    for (const record of Array.isArray(records) ? records : []) {
      const { type, id, attributes } = (record ?? {}) as { type?: unknown; id?: unknown; attributes?: Record<string, unknown> };
      if (type === 'Arrangement' && typeof id === 'string' && attributes !== undefined && !('chord_chart' in attributes)) Object.assign(attributes, madeUpChart(id));
    }
  }
  return document;
}

// A request path as the fake looks it up: the path, then the query's decoded key=value pairs, sorted, so
// `include=song,key,arrangement` and `include=song%2Ckey%2Carrangement` are one request.
export function requestKey(path: string): string {
  const url = new URL(path, 'http://fake');
  const query = [...url.searchParams].map(([key, value]) => `${key}=${value}`).toSorted();
  return query.length === 0 ? url.pathname : `${url.pathname}?${query.join('&')}`;
}

// The recorded fixtures in `folder`, the Phase 0 set by default.
export async function readFixtures(folder = PLANNING_CENTER_FIXTURES): Promise<Fixture[]> {
  const files = (await readdir(folder)).filter((file) => file.endsWith('.json'));
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(join(folder, file), 'utf8')) as Fixture));
}

// Starts the fake. A known path gets its fixture's status and body as JSON, each Arrangement with a made-up chart unless
// it has a chord_chart of its own (madeUpChart), an unknown one 404, and a request whose Authorization is not
// `Basic base64(clientId:secret)` 401, before any lookup. `fixtures` replaces the recorded ones, for a test that derives
// a case from them.
export async function startPlanningCenter({ clientId, secret, fixtures }: { clientId: string; secret: string; fixtures?: Fixture[] }): Promise<PlanningCenter> {
  const answers = new Map((fixtures ?? (await readFixtures())).map((fixture) => [requestKey(fixture.path), { ...fixture, body: withMadeUpCharts(fixture.body) }]));
  const expected = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
  const requests: RecordedRequest[] = [];
  let base = '';
  const server = createServer((request, response) => {
    const path = request.url ?? '/';
    requests.push({ method: request.method ?? '', path, authorization: request.headers.authorization, userAgent: request.headers['user-agent'] });
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body).replaceAll(REAL_API, base));
    };
    if (request.headers.authorization !== expected) return send(401, { errors: [{ status: '401', title: 'Unauthorized' }] });
    const fixture = answers.get(requestKey(path));
    if (fixture === undefined) return send(404, { errors: [{ status: '404', title: 'Not Found' }] });
    send(fixture.status, fixture.body);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    requests,
    close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  };
}
