// Phase 0 of setlist-controller#84: turn the raw ProPresenter recordings in dist/propresenter-raw/ into the committed
// fixtures in test/fixtures/propresenter/.
//
//   node scripts/scrub-propresenter-fixtures.mjs [--raw <dir>] [--out <dir>]
//
// --raw and --out default to dist/propresenter-raw/ and test/fixtures/propresenter/; a relative path resolves against
// the current directory. A run replaces every .json file in the output folder and leaves every other file (the README)
// where it is. It stops before it touches the output folder when the raw folder holds no recording.
//
// Keeps every response's shape, status and ids. Replaces the words of every slide with a stand-in that names the
// presentation, the group, the slide and the line, so a test can still tell one slide from another; a line of only
// invisible characters (ProPresenter's zero-width spaces) stays as it is, and zero-width spaces in a line are kept
// at its end. The status stream's slide text gets the same stand-in as the slide it shows. The Mac's name and the
// library path before Libraries/ go too. Times are made relative to the moment the status stream opened.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    raw: { type: 'string', default: resolve(import.meta.dirname, '../dist/propresenter-raw') },
    out: { type: 'string', default: resolve(import.meta.dirname, '../test/fixtures/propresenter') },
  },
});
const RAW = resolve(values.raw);
const OUT = resolve(values.out);

function rawNames() {
  try {
    return readdirSync(RAW);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

const names = rawNames();
const responses = names.filter((name) => name.endsWith('.json'));
if (responses.length === 0) {
  console.error(`No recorded responses in ${RAW}. Record them first.`);
  process.exit(1);
}
const read = (name) => readFileSync(join(RAW, name), 'utf8');
const readLines = (name) => (names.includes(name) ? read(name).split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);

const INVISIBLE = /^[\s​ ﻿]*$/;
const standIns = new Map();

// The stand-in for one slide's text, remembered so the stream's copy of that slide gets the same one.
function standIn(text, where) {
  if (typeof text !== 'string' || INVISIBLE.test(text)) return text;
  if (standIns.has(text)) return standIns.get(text);
  const lines = text.split('\n').map((line, i) => {
    if (INVISIBLE.test(line)) return line;
    const zeroWidth = (line.match(/​/g) ?? []).join('');
    const ending = line.endsWith('\r') ? '\r' : '';
    return `${where} line ${i + 1}${zeroWidth}${ending}`;
  });
  const scrubbed = lines.join('\n');
  standIns.set(text, scrubbed);
  return scrubbed;
}

function scrubPresentation(presentation) {
  if (!presentation) return presentation;
  const title = presentation.id?.name ?? 'presentation';
  presentation.groups?.forEach((group, g) => {
    group.slides?.forEach((slide, s) => {
      const where = `${title} / ${group.name || `group ${g + 1}`} / slide ${s + 1}`;
      slide.text = standIn(slide.text, where);
      if (slide.notes) slide.notes = `${where} notes`;
    });
  });
  if (typeof presentation.presentation_path === 'string') {
    presentation.presentation_path = presentation.presentation_path.replace(/^.*?(?=Libraries\/)/, 'ProPresenter/');
  }
  return presentation;
}

const fixtures = new Map();
// The presentations first, so every slide's stand-in exists before the stream and the commands need it.
for (const name of responses.sort((a, b) => Number(b.includes('presentation_')) - Number(a.includes('presentation_')))) {
  const recording = JSON.parse(read(name));
  if (name === 'version.json') recording.body.name = 'ProPresenter-Mac';
  if (recording.body?.presentation) scrubPresentation(recording.body.presentation);
  fixtures.set(name, recording);
}

const chunks = readLines('stream-status-updates.jsonl');
const opened = chunks[0]?.t ?? 0;
const at = (ms) => Math.round(ms - opened);

function scrubFrame(frame) {
  if (frame.url === 'presentation/current') scrubPresentation(frame.data?.presentation);
  if (frame.url === 'status/slide') {
    for (const side of ['current', 'next']) {
      const slide = frame.data?.[side];
      if (slide?.text && !INVISIBLE.test(slide.text)) slide.text = standIns.get(slide.text) ?? 'unrecorded slide';
      if (slide?.notes) slide.notes = 'unrecorded notes';
    }
  }
  return frame;
}

if (chunks.length > 0) {
  const [head, ...rest] = chunks;
  const { date: _date, ...headers } = head.headers;
  fixtures.set('stream-status-updates.json', {
    method: 'POST',
    path: '/v1/status/updates',
    request: head.request,
    status: head.status,
    headers,
    // Each chunk ProPresenter sent, in order: the ms since the stream opened, and the one frame it held (every chunk
    // held exactly one, ending on a blank line).
    chunks: rest.map((chunk) => ({ t: at(chunk.t), frame: scrubFrame(JSON.parse(chunk.raw)) })),
  });
}

const commands = readLines('commands.jsonl');
if (commands.length > 0) {
  fixtures.set(
    'commands.json',
    commands.map(({ sent, answered, body, ...command }) => {
      let parsed = body;
      try {
        parsed = body ? JSON.parse(body) : body;
      } catch {
        // A body that is not JSON stays as it came.
      }
      if (parsed?.presentation) scrubPresentation(parsed.presentation);
      // GET /v1/status/slide answers in a status/slide frame's shape, so its slide text gets the same stand-in.
      if (parsed && typeof parsed === 'object' && ('current' in parsed || 'next' in parsed)) scrubFrame({ url: 'status/slide', data: parsed });
      return { ...command, sent: at(sent), answered: at(answered), body: parsed };
    }),
  );
}

mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT).filter((name) => name.endsWith('.json'))) rmSync(join(OUT, name));
for (const [name, fixture] of fixtures) writeFileSync(join(OUT, name), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`${fixtures.size} fixtures in ${OUT}`);
