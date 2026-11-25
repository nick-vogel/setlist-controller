// The spec's heading rule for a song's chart, as Planning Center's chord chart holds it: a line is a section heading when
// it holds one section word and an optional number, in any letter case, with the spaces around it trimmed, such as
// `VERSE 1` or `Chorus`. The number is written in digits after a space. Nothing else on the line, so `Chorus 2a`, a
// lyric line that holds a section word, and a line with a chord in brackets are no heading. The set builder's chart
// skeleton and the browser's chart view read headings by this one rule, so it holds no node import.

// The section words, in the spec's order.
export const SECTION_WORDS = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Tag', 'Interlude', 'Instrumental', 'Turnaround', 'Vamp', 'Ending'] as const;

export type SectionWord = (typeof SECTION_WORDS)[number];

// A heading as read: its section word, as SECTION_WORDS spells it, and its number when it has one.
export type ChartHeading = { word: SectionWord; number?: number };

// The heading `line` is, or undefined when it is no heading.
export function chartHeading(line: string): ChartHeading | undefined {
  const parts = /^(\S+)(?:\s+(\d+))?$/.exec(line.trim());
  if (parts === null) return undefined;
  const [, written = '', digits] = parts;
  const word = SECTION_WORDS.find((each) => each.toLowerCase() === written.toLowerCase());
  if (word === undefined) return undefined;
  return digits === undefined ? { word } : { word, number: Number(digits) };
}
