// Phase 0 of setlist-controller#58: turn the raw Planning Center responses in dist/pco-raw/ (from
// scripts/record-pco-fixtures.mjs) into the committed fixtures in test/fixtures/planning-center/.
//
//   node scripts/scrub-pco-fixtures.mjs [--raw <dir>] [--out <dir>]
//
// --raw and --out default to dist/pco-raw/ and test/fixtures/planning-center/; a relative path resolves against the
// current directory. A run replaces every .json file in the output folder and leaves every other file (the README)
// where it is. It stops before it touches the output folder when the raw folder holds no .json file.
//
// Keeps the JSON:API shape (data, included, links, the meta the reader can use) and, per record type, only the
// attributes the plan reader reads or a test needs. Everything else goes: lyrics and chord charts, the people who
// created or edited a record, the organization in meta.parent, item descriptions and details, and the text of every
// note on an item that is not a song.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    raw: { type: 'string', default: resolve(import.meta.dirname, '../dist/pco-raw') },
    out: { type: 'string', default: resolve(import.meta.dirname, '../test/fixtures/planning-center') },
  },
});
const RAW = resolve(values.raw);
const OUT = resolve(values.out);

const ATTRIBUTES = {
  ServiceType: ['name', 'sequence'],
  Plan: ['title', 'dates', 'short_dates', 'sort_date', 'last_time_at', 'items_count'],
  Item: ['title', 'item_type', 'key_name', 'sequence', 'service_position', 'length'],
  Song: ['title'],
  Arrangement: ['name', 'bpm', 'meter', 'length', 'sequence', 'sequence_short'],
  Key: ['name', 'starting_key', 'starting_minor', 'ending_key', 'ending_minor'],
  ItemNote: ['category_name', 'content'],
};
const RELATIONSHIPS = {
  Plan: ['service_type'],
  Item: ['song', 'key', 'arrangement', 'item_notes', 'plan'],
  Arrangement: ['song'],
  Key: ['arrangement'],
  ItemNote: ['item'],
};
const META = ['count', 'total_count', 'next', 'can_include', 'can_filter', 'can_order_by', 'can_query_by'];

// The names in the raw folder, or none when a recording never made it.
function rawNames() {
  try {
    return readdirSync(RAW);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

const files = rawNames().filter((name) => name.endsWith('.json'));
if (files.length === 0) {
  console.error(`No recorded responses in ${RAW}. Record them first.`);
  process.exit(1);
}
// Every response is read before a fixture is removed, so a run whose --raw and --out name one folder (directly or
// through a symlink) scrubs it in place instead of deleting what it is about to read.
const responses = files.map((name) => [name, JSON.parse(readFileSync(join(RAW, name), 'utf8'))]);

// The ids of every song item in the recordings, so a note keeps its text only when it sits on a song.
const songItems = new Set();
for (const [, { body }] of responses) {
  for (const record of [body?.data, body?.included].flat(2).filter(Boolean)) {
    if (record.type === 'Item' && record.attributes.item_type === 'song') songItems.add(record.id);
  }
}

function pick(object, keys) {
  return Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));
}

function scrubRecord(record) {
  const attributes = pick(record.attributes ?? {}, ATTRIBUTES[record.type] ?? []);
  if (record.type === 'ItemNote' && !songItems.has(record.relationships?.item?.data?.id)) attributes.content = 'Scrubbed note.';
  const relationships = Object.fromEntries(
    (RELATIONSHIPS[record.type] ?? [])
      .filter((key) => record.relationships?.[key])
      .map((key) => [key, { data: record.relationships[key].data ?? null }]),
  );
  return { type: record.type, id: record.id, attributes, relationships };
}

mkdirSync(OUT, { recursive: true });
for (const entry of readdirSync(OUT, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.json')) rmSync(join(OUT, entry.name));
}
for (const [name, { path, status, body }] of responses) {
  const scrubbed = body && {
    links: body.links,
    data: Array.isArray(body.data) ? body.data.map(scrubRecord) : body.data && scrubRecord(body.data),
    included: (body.included ?? []).map(scrubRecord),
    meta: pick(body.meta ?? {}, META),
  };
  writeFileSync(join(OUT, name), `${JSON.stringify({ path, status, body: scrubbed }, null, 2)}\n`);
}
console.log(`${files.length} fixtures written to ${OUT}`);
