import { describe, expect, it } from 'vitest';
import { parseChart } from '../src/shared/chart.ts';

// The chart module's Nashville numbers: each chord numbered from the shown key's tonic (the stems key,
// else the chart key), counted as the chart key's own degrees, its suffix kept as typed, its
// slash bass numbered too, and a root outside the scale marked with a flat or a sharp. Every chart text
// here is made up, and every expected number is written out by hand.

// Every chord in the chart, in the order typed, a chunk with no chord left out.
function chords(text: string, keys?: Parameters<typeof parseChart>[1]): string[] {
  return parseChart(text, keys)
    .sections.flatMap(({ lines }) => lines)
    .flatMap((line) => (line.kind === 'lyrics' ? line.chunks.flatMap(({ chord }) => (chord === null ? [] : [chord])) : []));
}

// A chart of one verse, a chord on each word.
function verse(...typed: string[]): string {
  return `VERSE\n${typed.map((chord, index) => `[${chord}]word${index} `).join('')}`;
}

describe('the chart module numbers the chords from the shown key', () => {
  it.each([
    {
      what: 'the scale of G, its suffixes and slash chords',
      chartKey: 'G',
      stemsKey: 'G',
      typed: ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim', 'Em7', 'Cmaj7', 'Dsus4', 'Cadd9', 'D7', 'G/B', 'D/F#', 'C/G'],
      expected: ['1', '2m', '3m', '4', '5', '6m', '7dim', '6m7', '4maj7', '5sus4', '4add9', '57', '1/3', '5/7', '4/1'],
    },
    {
      what: 'roots and a slash bass outside the scale of G',
      chartKey: 'G',
      stemsKey: 'G',
      typed: ['F', 'Bb', 'Eb', 'C#m7b5', 'E/G#', 'Db'],
      expected: ['b7', 'b3', 'b6', '#4m7b5', '6/#1', 'b5'],
    },
    {
      what: 'a pitch two semitones off its letter, numbered by its pitch',
      chartKey: 'G',
      stemsKey: 'G',
      typed: ['Fb'],
      expected: ['6'],
    },
    {
      what: 'a flat key, Bb',
      chartKey: 'Bb',
      stemsKey: 'Bb',
      typed: ['Bb', 'Cm', 'Dm', 'Eb', 'F', 'Gm', 'Ab', 'E', 'F/A'],
      expected: ['1', '2m', '3m', '4', '5', '6m', 'b7', '#4', '5/7'],
    },
    {
      what: 'a sharp key, E',
      chartKey: 'E',
      stemsKey: 'E',
      typed: ['E', 'A', 'B', 'C#m', 'G#m', 'D#dim', 'B/D#', 'D', 'C', 'G'],
      expected: ['1', '4', '5', '6m', '3m', '7dim', '5/7', 'b7', 'b6', 'b3'],
    },
    {
      what: 'Gb, where a B typed for its Cb is 4 and an E for its borrowed Fb is b7',
      chartKey: 'Gb',
      stemsKey: 'Gb',
      typed: ['Gb', 'B', 'Db', 'Ebm', 'E', 'Abm', 'Bbm', 'A', 'D'],
      expected: ['1', '4', '5', '6m', 'b7', '2m', '3m', 'b3', 'b6'],
    },
    {
      what: 'a chart typed in G for stems in Bb, numbered in Bb as in G',
      chartKey: 'G',
      stemsKey: 'Bb',
      typed: ['G', 'C', 'D/F#', 'Em', 'F'],
      expected: ['1', '4', '5/7', '6m', 'b7'],
    },
    {
      what: 'a minor key, Em, against its own scale',
      chartKey: 'Em',
      stemsKey: 'Em',
      typed: ['Em', 'F#m7b5', 'G', 'Am', 'B7', 'C', 'D', 'E/G#'],
      expected: ['1m', '2m7b5', '3', '4m', '57', '6', '7', '1/#3'],
    },
    {
      what: 'a flat minor key, Cm',
      chartKey: 'Cm',
      stemsKey: 'Cm',
      typed: ['Cm', 'Dm7b5', 'Eb', 'Fm', 'G7', 'Ab', 'Bb', 'C/E'],
      expected: ['1m', '2m7b5', '3', '4m', '57', '6', '7', '1/#3'],
    },
    {
      what: 'a chart in Em for stems in its relative G, numbered from G',
      chartKey: 'Em',
      stemsKey: 'G',
      typed: ['Em', 'Am', 'B7', 'C', 'D'],
      expected: ['6m', '2m', '37', '4', '5'],
    },
    {
      what: 'a key change stems key, read as the key it starts in',
      chartKey: 'G',
      stemsKey: 'G-A',
      typed: ['G', 'C', 'D'],
      expected: ['1', '4', '5'],
    },
    {
      what: 'a stems key that is no note name, numbered from the chart key',
      chartKey: 'G',
      stemsKey: 'H',
      typed: ['G', 'C'],
      expected: ['1', '4'],
    },
    {
      what: 'no stems key, numbered from the chart key',
      chartKey: 'D',
      stemsKey: null,
      typed: ['D', 'G', 'A'],
      expected: ['1', '4', '5'],
    },
    {
      what: 'no chart key, numbered from the stems key',
      chartKey: undefined,
      stemsKey: 'A',
      typed: ['A', 'D', 'E/G#'],
      expected: ['1', '4', '5/7'],
    },
    {
      what: 'no keys at all, shown as typed',
      chartKey: undefined,
      stemsKey: undefined,
      typed: ['G', 'C', 'D'],
      expected: ['G', 'C', 'D'],
    },
    {
      what: 'neither key a note name, shown as typed',
      chartKey: 'H',
      stemsKey: 'E minor',
      typed: ['G', 'C', 'D'],
      expected: ['G', 'C', 'D'],
    },
    {
      what: 'words and empty brackets, kept as typed, and the spacing between chords',
      chartKey: 'G',
      stemsKey: 'G',
      typed: ['N.C.', 'x2', 'Coda', '', 'G  C', 'G x2'],
      expected: ['N.C.', 'x2', 'Coda', '', '1  4', '1 x2'],
    },
  ])('$what', ({ chartKey, stemsKey, typed, expected }) => {
    expect(chords(verse(...typed), { chartKey, stemsKey, numbers: true })).toEqual(expected);
  });

  // A chart's numbers are its own degrees whatever key the stems are in, so a key whose move respells
  // a note (E# as F, B# as C) still numbers each chord as the chart key does.
  it.each([
    {
      what: 'a chart in G, its secondary dominants and chromatic chords',
      chartKey: 'G',
      stemsKeys: ['G', 'E', 'A', 'F#', 'Gb', 'B', 'C#', 'Db', 'D', 'Bb', 'F', 'C'],
      typed: ['G', 'E/G#', 'Am', 'B/D#', 'Em', 'C#m7b5', 'G#dim', 'F'],
      expected: ['1', '6/#1', '2m', '3/#5', '6m', '#4m7b5', '#1dim', 'b7'],
    },
    {
      what: 'a chart in Em, its major V and its raised third',
      chartKey: 'Em',
      stemsKeys: ['Em', 'C#m', 'G#m', 'D#m', 'Ebm', 'A#m', 'Bm', 'Fm'],
      typed: ['Em', 'E/G#', 'B7', 'C', 'D', 'Am'],
      expected: ['1m', '1/#3', '57', '6', '7', '4m'],
    },
  ])('$what numbers alike for every stems key', ({ chartKey, stemsKeys, typed, expected }) => {
    for (const stemsKey of stemsKeys) expect(chords(verse(...typed), { chartKey, stemsKey, numbers: true }), `stems in ${stemsKey}`).toEqual(expected);
  });

  it.each([
    { what: 'numbers off', numbers: false },
    { what: 'numbers not given', numbers: undefined },
  ])('with $what, the chords show in letters in the stems key', ({ numbers }) => {
    expect(chords(verse('G', 'C', 'D/F#'), { chartKey: 'G', stemsKey: 'Bb', numbers })).toEqual(['Bb', 'Eb', 'F/A']);
  });

  it('keeps the lyrics as typed', () => {
    const [section] = parseChart('VERSE\n[G]Morning comes on [C]made up wings', { chartKey: 'G', stemsKey: 'G', numbers: true }).sections;
    expect(section?.lines).toEqual([
      {
        kind: 'lyrics',
        chunks: [
          { chord: '1', text: 'Morning comes on ' },
          { chord: '4', text: 'made up wings' },
        ],
      },
    ]);
  });
});
