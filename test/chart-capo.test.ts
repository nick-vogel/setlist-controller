import { describe, expect, it } from 'vitest';
import { parseChart } from '../src/shared/chart.ts';

// The chart module's capo: with a capo of n, each chord shows n semitones below the shown key (the
// stems key, else the chart key), spelled for the shape key, moved in one step from the key the chart
// is typed in. Nashville numbers ignore the capo. Every chart text here is made up, and every expected
// chord is written out by hand.

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

// I, IV, V over its 3rd, vi, ii7, the borrowed bVII and bIII, typed in each key.
const IN_G = verse('G', 'C', 'D/F#', 'Em', 'Am7', 'F', 'Bb');
const IN_BB = verse('Bb', 'Eb', 'F/A', 'Gm', 'Cm7', 'Ab', 'Db');
const IN_EB = verse('Eb', 'Ab', 'Bb/D', 'Cm', 'Fm7', 'Db', 'Gb');
// Ab's bIII is Cb, typed by its white key's name.
const IN_AB = verse('Ab', 'Db', 'Eb/G', 'Fm', 'Bbm7', 'Gb', 'B');
const IN_E = verse('E', 'A', 'B/D#', 'C#m', 'F#m7', 'D', 'G');
const IN_B = verse('B', 'E', 'F#/A#', 'G#m', 'C#m7', 'A', 'D');
const IN_A = verse('A', 'D', 'E/G#', 'F#m', 'Bm7', 'G', 'C');
// i, iv7, V7, VI, VII and III, typed in each minor key.
const IN_BM = verse('Bm', 'Em7', 'F#7', 'G', 'A', 'D');
const IN_FSM = verse('F#m', 'Bm7', 'C#7', 'D', 'E', 'A');
const IN_CM = verse('Cm', 'Fm7', 'G7', 'Ab', 'Bb', 'Eb');

describe('the chart module shows a capo in its shape key', () => {
  it.each([
    { what: 'stems in G, capo 3, in E shapes', chart: IN_G, chartKey: 'G', stemsKey: 'G', capo: 3, expected: ['E', 'A', 'B/D#', 'C#m', 'F#m7', 'D', 'G'] },
    { what: 'stems in G, capo 2, in F shapes with its flats', chart: IN_G, chartKey: 'G', stemsKey: 'G', capo: 2, expected: ['F', 'Bb', 'C/E', 'Dm', 'Gm7', 'Eb', 'Ab'] },
    { what: 'stems in Bb, capo 1, in A shapes', chart: IN_BB, chartKey: 'Bb', stemsKey: 'Bb', capo: 1, expected: ['A', 'D', 'E/G#', 'F#m', 'Bm7', 'G', 'C'] },
    { what: 'stems in Bb, capo 3, in G shapes', chart: IN_BB, chartKey: 'Bb', stemsKey: 'Bb', capo: 3, expected: ['G', 'C', 'D/F#', 'Em', 'Am7', 'F', 'Bb'] },
    { what: 'stems in Eb, capo 1, in D shapes', chart: IN_EB, chartKey: 'Eb', stemsKey: 'Eb', capo: 1, expected: ['D', 'G', 'A/C#', 'Bm', 'Em7', 'C', 'F'] },
    { what: 'stems in Eb, capo 6, in A shapes', chart: IN_EB, chartKey: 'Eb', stemsKey: 'Eb', capo: 6, expected: ['A', 'D', 'E/G#', 'F#m', 'Bm7', 'G', 'C'] },
    { what: 'stems in Ab, capo 1, in G shapes', chart: IN_AB, chartKey: 'Ab', stemsKey: 'Ab', capo: 1, expected: ['G', 'C', 'D/F#', 'Em', 'Am7', 'F', 'Bb'] },
    { what: 'stems in E, capo 2, in D shapes', chart: IN_E, chartKey: 'E', stemsKey: 'E', capo: 2, expected: ['D', 'G', 'A/C#', 'Bm', 'Em7', 'C', 'F'] },
    { what: 'stems in B, capo 4, in G shapes', chart: IN_B, chartKey: 'B', stemsKey: 'B', capo: 4, expected: ['G', 'C', 'D/F#', 'Em', 'Am7', 'F', 'Bb'] },
    { what: 'stems in A, capo 7, in D shapes', chart: IN_A, chartKey: 'A', stemsKey: 'A', capo: 7, expected: ['D', 'G', 'A/C#', 'Bm', 'Em7', 'C', 'F'] },
    { what: 'a chart in G for stems in Bb, capo 3, back in G shapes as typed', chart: IN_G, chartKey: 'G', stemsKey: 'Bb', capo: 3, expected: ['G', 'C', 'D/F#', 'Em', 'Am7', 'F', 'Bb'] },
    { what: 'a chart in G for stems in Bb, capo 1, in A shapes', chart: IN_G, chartKey: 'G', stemsKey: 'Bb', capo: 1, expected: ['A', 'D', 'E/G#', 'F#m', 'Bm7', 'G', 'C'] },
    { what: 'stems in Bm, capo 2, in Am shapes', chart: IN_BM, chartKey: 'Bm', stemsKey: 'Bm', capo: 2, expected: ['Am', 'Dm7', 'E7', 'F', 'G', 'C'] },
    { what: 'stems in F#m, capo 2, in Em shapes', chart: IN_FSM, chartKey: 'F#m', stemsKey: 'F#m', capo: 2, expected: ['Em', 'Am7', 'B7', 'C', 'D', 'G'] },
    { what: 'stems in Cm, capo 3, in Am shapes', chart: IN_CM, chartKey: 'Cm', stemsKey: 'Cm', capo: 3, expected: ['Am', 'Dm7', 'E7', 'F', 'G', 'C'] },
    { what: 'no chart key, a chart typed in the stems key G, capo 3', chart: IN_G, chartKey: undefined, stemsKey: 'G', capo: 3, expected: ['E', 'A', 'B/D#', 'C#m', 'F#m7', 'D', 'G'] },
    { what: 'no stems key, the chart key G, capo 3', chart: IN_G, chartKey: 'G', stemsKey: null, capo: 3, expected: ['E', 'A', 'B/D#', 'C#m', 'F#m7', 'D', 'G'] },
    { what: 'no keys at all, capo 3, moved down from C', chart: verse('C', 'F', 'G/B', 'Am'), chartKey: undefined, stemsKey: undefined, capo: 3, expected: ['A', 'D', 'E/G#', 'F#m'] },
    { what: 'capo 0, the stems key', chart: IN_G, chartKey: 'G', stemsKey: 'Bb', capo: 0, expected: ['Bb', 'Eb', 'F/A', 'Gm', 'Cm7', 'Ab', 'Db'] },
    // A shape key 0 semitones down would name Gb as F#, so capo 0 must keep the stems key's own flats.
    { what: 'capo 0, the stems key Gb, not F# shapes', chart: IN_G, chartKey: 'G', stemsKey: 'Gb', capo: 0, expected: ['Gb', 'B', 'Db/F', 'Ebm', 'Abm7', 'E', 'A'] },
    { what: 'capo 8, out of range, no capo', chart: IN_G, chartKey: 'G', stemsKey: 'Bb', capo: 8, expected: ['Bb', 'Eb', 'F/A', 'Gm', 'Cm7', 'Ab', 'Db'] },
    { what: 'capo -1, out of range, no capo', chart: IN_G, chartKey: 'G', stemsKey: 'Bb', capo: -1, expected: ['Bb', 'Eb', 'F/A', 'Gm', 'Cm7', 'Ab', 'Db'] },
    { what: 'capo 2.5, not whole, no capo', chart: IN_G, chartKey: 'G', stemsKey: 'Bb', capo: 2.5, expected: ['Bb', 'Eb', 'F/A', 'Gm', 'Cm7', 'Ab', 'Db'] },
  ])('$what', ({ chart, chartKey, stemsKey, capo, expected }) => {
    expect(chords(chart, { chartKey, stemsKey, capo })).toEqual(expected);
  });

  it('keeps words, empty brackets and the spacing between chords', () => {
    expect(chords(verse('N.C.', 'x2', '', 'G  C'), { chartKey: 'G', stemsKey: 'G', capo: 3 })).toEqual(['N.C.', 'x2', '', 'E  A']);
  });
});

describe('Nashville numbers ignore the capo', () => {
  const capos = [undefined, 0, 1, 2, 3, 4, 5, 6, 7];
  it.each([
    { what: 'a chart in G for stems in G', chart: IN_G, chartKey: 'G', stemsKey: 'G', expected: ['1', '4', '5/7', '6m', '2m7', 'b7', 'b3'] },
    { what: 'a chart in G for stems in Bb', chart: IN_G, chartKey: 'G', stemsKey: 'Bb', expected: ['1', '4', '5/7', '6m', '2m7', 'b7', 'b3'] },
    { what: 'a chart in Ab for stems in Ab', chart: IN_AB, chartKey: 'Ab', stemsKey: 'Ab', expected: ['1', '4', '5/7', '6m', '2m7', 'b7', 'b3'] },
    { what: 'a chart in Bm for stems in Bm', chart: IN_BM, chartKey: 'Bm', stemsKey: 'Bm', expected: ['1m', '4m7', '57', '6', '7', '3'] },
    { what: 'a chart with no keys, shown as typed', chart: IN_G, chartKey: undefined, stemsKey: undefined, expected: ['G', 'C', 'D/F#', 'Em', 'Am7', 'F', 'Bb'] },
  ])('$what', ({ chart, chartKey, stemsKey, expected }) => {
    for (const capo of capos) expect(chords(chart, { chartKey, stemsKey, capo, numbers: true }), `capo ${capo}`).toEqual(expected);
  });
});
