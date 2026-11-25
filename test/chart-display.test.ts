import { describe, expect, it } from 'vitest';
import type { ChartLine } from '../src/shared/chart.ts';
import { displayLines } from '../web/src/chart-display.ts';

// What each display keeps of a block's lines: chords over lyrics keeps them all, lyrics only keeps the
// words and the notes with no chord, and the section map keeps none.

const lyrics = (...chunks: [string | null, string][]): ChartLine => ({ kind: 'lyrics', chunks: chunks.map(([chord, text]) => ({ chord, text })) });
const words = (text: string): ChartLine => ({ kind: 'lyrics', chunks: [{ chord: null, text }] });
const note = (text: string): ChartLine => ({ kind: 'note', text });
const blank: ChartLine = { kind: 'blank' };

// A line of chords alone, as the Intro of the set manifest fixture types `[G] [C] [G] [D]`.
const chordsAlone = lyrics(['G', ' '], ['C', ' '], ['G', ' '], ['D', '']);

// A verse with a chord mid-word, a note, and a second stanza after a gap.
const VERSE: ChartLine[] = [
  lyrics([null, 'So '], ['G', 'Amaz'], ['D', 'ing']),
  note('Keys only'),
  blank,
  lyrics(['Em', 'Every line a '], ['C', 'borrowed thing']),
];

describe('the lines each display keeps of a block', () => {
  it('keeps every line, chords and all, for chords over lyrics', () => {
    expect(displayLines(VERSE, 'chords-over-lyrics')).toEqual(VERSE);
  });

  it('keeps no line for the section map, notes included', () => {
    expect(displayLines(VERSE, 'section-map')).toEqual([]);
  });

  it('keeps each line as its words with no chord, joining a word a chord falls in, and keeps the notes, for lyrics only', () => {
    expect(displayLines(VERSE, 'lyrics-only')).toEqual([words('So Amazing'), note('Keys only'), blank, words('Every line a borrowed thing')]);
  });

  it('drops a line of chords alone, and leaves one gap where it stood between two stanzas', () => {
    const lines = [words('First stanza'), blank, chordsAlone, blank, words('Second stanza')];
    expect(displayLines(lines, 'lyrics-only')).toEqual([words('First stanza'), blank, words('Second stanza')]);
  });

  it('leaves no gap at either end where a line of chords alone opened or closed the block', () => {
    expect(displayLines([chordsAlone, blank, words('The words'), blank, chordsAlone], 'lyrics-only')).toEqual([words('The words')]);
  });

  it('keeps no line of a block whose only line is chords alone', () => {
    expect(displayLines([chordsAlone], 'lyrics-only')).toEqual([]);
  });
});
