import { chartHeading } from './chart-heading.ts';
import { capoKey, keyShift, numberChord, readKey, relativeKey, transposeChord } from './transpose.ts';

// A song's chart, read from its chart text as Planning Center's Lyrics & Chords editor holds it: its
// sections in the order typed, each with its lines and their inline chords. The browser runs it, so it
// holds no node import. A section's name is its heading line as typed, trimmed, so the shared
// occurrence matcher (occurrence.ts) compares it to a locator by the name rule. Given the key the chart
// is typed in and the stems' key, each chord shows in the stems' key (transpose.ts); with no keys, or a
// key it cannot read, each chord shows as typed.

export type ChartChunk = {
  // The chord typed in square brackets right before the text, or null for text before a line's first
  // chord.
  chord: string | null;
  text: string;
};

export type ChartLine =
  // Words, with the chords over them. A line of chords typed without brackets is words with no chord.
  | { kind: 'lyrics'; chunks: ChartChunk[] }
  // A line typed wholly as `{ note }` or `{{ note }}`, without its braces.
  | { kind: 'note'; text: string }
  // The gap between two stanzas.
  | { kind: 'blank' };

export type ChartSection = { name: string; lines: ChartLine[] };

export type Chart = {
  sections: ChartSection[];
  // The lines the chart view cannot show, as typed, for the Charts check to note: a key change, and
  // each line before the first heading, which belongs to no section.
  dropped: string[];
};

// Planning Center's formatting tags, whose text stays.
const FORMATTING_TAG = /<\/?(?:b|strong|i|em|u|t)>/gi;
// Planning Center's column and page breaks, bare or in double braces: layout, so dropped silently.
const BREAK = /^(?:\{\{\s*)?(?:COLUMN_BREAK|PAGE_BREAK)(?:\s*\}\})?$/i;
// A key change, which the chart view does not follow.
const KEY_CHANGE = /^(?:TRANSPOSE|REDEFINE)\s+KEY\b/i;
const NOTE = /^\{\{(.*)\}\}$|^\{(.*)\}$/;
const CHORD = /\[([^\]]*)\]/g;

// The keys a chart's chords move between, both from the set manifest, and how the device shows them:
// in Nashville numbers or in letters, and the capo, 0 to 7, for a guitarist's shapes.
export type ChartKeys = { chartKey?: string; stemsKey?: string | null; numbers?: boolean; capo?: number };

// The highest capo the chart view offers.
export const MAX_CAPO = 7;

export function parseChart(text: string, keys: ChartKeys = {}): Chart {
  const chord = chordOf(keys);
  const sections: ChartSection[] = [];
  const dropped: string[] = [];
  for (const typed of text.split(/\r?\n/)) {
    const line = typed.replace(FORMATTING_TAG, '').trimEnd();
    const trimmed = line.trim();
    if (BREAK.test(trimmed)) continue;
    const heading = chartHeading(trimmed);
    if (heading !== undefined) {
      sections.push({ name: trimmed, lines: [] });
      continue;
    }
    const current = sections.at(-1);
    if (trimmed === '') {
      // A run of blank lines is one gap, and a section opens on none.
      if (current && current.lines.length > 0 && current.lines.at(-1)?.kind !== 'blank') current.lines.push({ kind: 'blank' });
      continue;
    }
    if (current === undefined || KEY_CHANGE.test(trimmed)) {
      dropped.push(trimmed);
      continue;
    }
    current.lines.push(chartLine(line, trimmed, chord));
  }
  // A section ends on no gap.
  for (const section of sections) if (section.lines.at(-1)?.kind === 'blank') section.lines.pop();
  return { sections, dropped };
}

// How a bracket's text shows. The shown key is the stems key when it reads as a note name, else the
// chart key. With numbers on, each chord is numbered as typed from the chart key put into the shown
// key's mode (its relative major or minor), so the numbers count the stems key's degrees without the
// respelling a move to the stems key can make (E# as F); with no chart key, from the shown key; and
// with no key to count from, it shows as the letters would. The capo plays no part.
// With a capo, each chord moves in one step from the key it is typed in (the chart key, else the shown
// key) to the shape key, the shown key that many semitones down, or with no shown key, from C. Else
// each chord moves from the chart key to the stems key.
function chordOf(keys: ChartKeys): (typed: string) => string {
  const shownKey = [keys.stemsKey, keys.chartKey].find((key) => readKey(key) !== undefined) ?? undefined;
  const move = (from: string | null | undefined, to: string | null | undefined) => {
    const shift = keyShift(from, to);
    return shift ? (typed: string) => transposeChord(typed, shift) : (typed: string) => typed;
  };
  const moved = move(keys.chartKey, keys.stemsKey);
  if (keys.numbers) {
    const shown = readKey(shownKey);
    if (shown === undefined) return moved;
    const chart = readKey(keys.chartKey);
    const countFrom = chart === undefined ? shown : relativeKey(chart, shown.minor);
    return (typed: string) => numberChord(typed, countFrom);
  }
  const capo = keys.capo;
  if (capo === undefined || !Number.isInteger(capo) || capo < 1 || capo > MAX_CAPO) return moved;
  const typedIn = readKey(keys.chartKey) ? keys.chartKey : (shownKey ?? 'C');
  return move(typedIn, capoKey(shownKey ?? 'C', capo));
}

function chartLine(line: string, trimmed: string, chord: (typed: string) => string): ChartLine {
  const note = NOTE.exec(trimmed);
  if (note) return { kind: 'note', text: (note[1] ?? note[2] ?? '').trim() };
  // A bracket with no close is text, as any other character.
  const chords = [...line.matchAll(CHORD)];
  const first = chords[0]?.index ?? line.length;
  const chunks: ChartChunk[] = first > 0 || chords.length === 0 ? [{ chord: null, text: line.slice(0, first) }] : [];
  chords.forEach((match, index) => {
    chunks.push({ chord: chord(match[1] ?? ''), text: line.slice(match.index + match[0].length, chords[index + 1]?.index) });
  });
  return { kind: 'lyrics', chunks };
}
