// Phase 0 of setlist-controller#58: record the Planning Center responses the plan reader's tests replay.
//
//   node scripts/record-pco-fixtures.mjs [--service-type <id>] --plan <plan id> [--plan <plan id> ...] [--date YYYY-MM-DD ...]
//
// Records, into dist/pco-raw/ (git-ignored), every response the plan reader makes for the named plans and for the
// plans on each --date in one service type ("Service", 997539, by default): the service types, that type's future plans
// and its newest past plans, and each plan's items with their songs, keys, arrangements and item notes. It reads no
// other service type, so no other team's plans are ever recorded. A file is named for its request path.
// scripts/scrub-pco-fixtures.mjs turns the raw responses into the committed fixtures.
//
// The token comes from ~/.config/setlist-controller/pco.env (PCO_CLIENT_ID, PCO_SECRET), or the file named by
// PCO_ENV, read by the build's own rules from src/set-builder/plan-reader.ts: the same path, mode check and parse. Every
// request sends that file's USER_AGENT, as the build's do. The script never prints the token or a response body: only
// paths, counts, dates and titles.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readToken, tokenFilePath, USER_AGENT } from '../src/set-builder/plan-reader.ts';

const { values } = parseArgs({
  options: {
    'service-type': { type: 'string', default: '997539' },
    plan: { type: 'string', multiple: true, default: [] },
    date: { type: 'string', multiple: true, default: [] },
  },
});
if (values.plan.length === 0 && values.date.length === 0) {
  console.error('Usage: node scripts/record-pco-fixtures.mjs --plan <plan id> [--plan ...] [--date YYYY-MM-DD ...]');
  process.exit(2);
}

const API = 'https://api.planningcenteronline.com/services/v2';
const OUT = resolve(import.meta.dirname, '../dist/pco-raw');
mkdirSync(OUT, { recursive: true });

const token = await readToken(tokenFilePath(process.env.PCO_ENV, process.cwd()));
if (!token.ok) {
  console.error(token.problem);
  process.exit(1);
}
const auth = token.authorization;

// GETs a path under the API, saves the body under its path, and returns it parsed. A path is relative to the API root,
// query included.
async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: auth, 'User-Agent': USER_AGENT } });
  const body = await res.text();
  const file = join(OUT, `${path.replace(/^\//, '').replace(/[/?&=,]/g, '_')}.json`);
  writeFileSync(file, JSON.stringify({ path, status: res.status, body: res.ok ? JSON.parse(body) : null }, null, 2));
  console.log(`${res.status} ${path.split('?')[0]}${path.includes('?') ? ' ?' + path.split('?')[1] : ''}`);
  if (!res.ok) return null;
  return JSON.parse(body);
}

// Every page of a list, following links.next. Each page is saved as its own file.
async function getAll(path) {
  const data = [];
  let next = path;
  while (next) {
    const page = await get(next);
    if (!page) break;
    data.push(...page.data);
    next = page.links?.next ? page.links.next.replace(API, '') : null;
  }
  return data;
}

const types = await getAll('/service_types?per_page=100');
console.log(`service types: ${types.map((t) => `${t.id} ${t.attributes.name.trim()}`).join(', ')}`);

const wanted = new Set(values.plan);
const dates = new Set(values.date);
const found = [];
for (const type of types.filter((t) => t.id === values['service-type'])) {
  // The past plans' first page only: the newest 25 are enough for a rebuild after a service, and every page of a
  // service type's history is not.
  const past = await get(`/service_types/${type.id}/plans?filter=past&order=-sort_date&per_page=25`);
  const plans = [...(await getAll(`/service_types/${type.id}/plans?filter=future&order=sort_date&per_page=100`)), ...(past?.data ?? [])];
  for (const plan of plans) {
    const date = plan.attributes.sort_date?.slice(0, 10);
    if (wanted.has(plan.id) || dates.has(date)) found.push({ type, plan, date });
  }
}

for (const { type, plan, date } of found) {
  console.log(`plan ${plan.id} in ${type.id} ${type.attributes.name.trim()}, ${date}, "${plan.attributes.title ?? ''}"`);
  const items = await getAll(`/service_types/${type.id}/plans/${plan.id}/items?include=song,key,arrangement&per_page=100`);
  console.log(`  items: ${items.map((i) => `${i.attributes.item_type}:${i.attributes.title.trim()}`).join(' | ')}`);
  // Item notes: try the include first, then each item's own notes, so the fixture shows which one the API answers.
  await get(`/service_types/${type.id}/plans/${plan.id}/items?include=item_notes&per_page=100`);
  for (const item of items) {
    const notes = await get(`/service_types/${type.id}/plans/${plan.id}/items/${item.id}/item_notes`);
    if (notes?.data?.length) console.log(`  notes on "${item.attributes.title.trim()}": ${notes.data.length}`);
  }
}
for (const id of wanted) if (!found.some(({ plan }) => plan.id === id)) console.log(`plan ${id} not found in any service type`);
