import { describe, expect, it } from 'vitest';
import { parseChart } from '../src/shared/chart.ts';

// The chart module's transposition: each chord's root and slash bass moved from the chart key to the
// stems key, named with the stems key's sharps or flats, the rest of the chord as typed. Every chart
// text here is made up, and every expected chord is written out by hand.

// Every chord in the chart, in the order typed, a chunk with no chord left out.
function chords(text: string, keys?: Parameters<typeof parseChart>[1]): string[] {
  return parseChart(text, keys)
    .sections.flatMap(({ lines }) => lines)
    .flatMap((line) => (line.kind === 'lyrics' ? line.chunks.flatMap(({ chord }) => (chord === null ? [] : [chord])) : []));
}

// In G: I, IV, V over its 3rd, vi, ii, V, IV, the borrowed bVII, and I over its 3rd.
const IN_G = 'VERSE\n[G]Made up [Cmaj7]words a [D/F#]long the [Em7]way\n\nCHORUS\n[Am]sing [Dsus4]it [Cadd9]once a [F]gain, [G/B]home';
// In Em: i, iv, V, bVI, bVII, III over its 5th, iv, bVII, and bVII over its 3rd.
const IN_EM = 'VERSE\n[Em]Made up [Am7]words a [B7]long the [Cmaj7]way\n\nBRIDGE\n[D]sing [G/B]it [Asus4]once a [Dadd9]gain, [D/F#]home';

describe('the chart module transposes to the stems key', () => {
  it.each([
    { stemsKey: 'C', expected: ['C', 'Fmaj7', 'G/B', 'Am7', 'Dm', 'Gsus4', 'Fadd9', 'Bb', 'C/E'] },
    { stemsKey: 'G', expected: ['G', 'Cmaj7', 'D/F#', 'Em7', 'Am', 'Dsus4', 'Cadd9', 'F', 'G/B'] },
    { stemsKey: 'D', expected: ['D', 'Gmaj7', 'A/C#', 'Bm7', 'Em', 'Asus4', 'Gadd9', 'C', 'D/F#'] },
    { stemsKey: 'A', expected: ['A', 'Dmaj7', 'E/G#', 'F#m7', 'Bm', 'Esus4', 'Dadd9', 'G', 'A/C#'] },
    { stemsKey: 'E', expected: ['E', 'Amaj7', 'B/D#', 'C#m7', 'F#m', 'Bsus4', 'Aadd9', 'D', 'E/G#'] },
    { stemsKey: 'B', expected: ['B', 'Emaj7', 'F#/A#', 'G#m7', 'C#m', 'F#sus4', 'Eadd9', 'A', 'B/D#'] },
    { stemsKey: 'F#', expected: ['F#', 'Bmaj7', 'C#/F', 'D#m7', 'G#m', 'C#sus4', 'Badd9', 'E', 'F#/A#'] },
    { stemsKey: 'C#', expected: ['C#', 'F#maj7', 'G#/C', 'A#m7', 'D#m', 'G#sus4', 'F#add9', 'B', 'C#/F'] },
    { stemsKey: 'Gb', expected: ['Gb', 'Bmaj7', 'Db/F', 'Ebm7', 'Abm', 'Dbsus4', 'Badd9', 'E', 'Gb/Bb'] },
    { stemsKey: 'Db', expected: ['Db', 'Gbmaj7', 'Ab/C', 'Bbm7', 'Ebm', 'Absus4', 'Gbadd9', 'B', 'Db/F'] },
    { stemsKey: 'Ab', expected: ['Ab', 'Dbmaj7', 'Eb/G', 'Fm7', 'Bbm', 'Ebsus4', 'Dbadd9', 'Gb', 'Ab/C'] },
    { stemsKey: 'Eb', expected: ['Eb', 'Abmaj7', 'Bb/D', 'Cm7', 'Fm', 'Bbsus4', 'Abadd9', 'Db', 'Eb/G'] },
    { stemsKey: 'Bb', expected: ['Bb', 'Ebmaj7', 'F/A', 'Gm7', 'Cm', 'Fsus4', 'Ebadd9', 'Ab', 'Bb/D'] },
    { stemsKey: 'F', expected: ['F', 'Bbmaj7', 'C/E', 'Dm7', 'Gm', 'Csus4', 'Bbadd9', 'Eb', 'F/A'] },
  ])('a chart in G, for stems in $stemsKey', ({ stemsKey, expected }) => {
    expect(chords(IN_G, { chartKey: 'G', stemsKey })).toEqual(expected);
  });

  it.each([
    { stemsKey: 'Am', expected: ['Am', 'Dm7', 'E7', 'Fmaj7', 'G', 'C/E', 'Dsus4', 'Gadd9', 'G/B'] },
    { stemsKey: 'Em', expected: ['Em', 'Am7', 'B7', 'Cmaj7', 'D', 'G/B', 'Asus4', 'Dadd9', 'D/F#'] },
    { stemsKey: 'Bm', expected: ['Bm', 'Em7', 'F#7', 'Gmaj7', 'A', 'D/F#', 'Esus4', 'Aadd9', 'A/C#'] },
    { stemsKey: 'F#m', expected: ['F#m', 'Bm7', 'C#7', 'Dmaj7', 'E', 'A/C#', 'Bsus4', 'Eadd9', 'E/G#'] },
    { stemsKey: 'C#m', expected: ['C#m', 'F#m7', 'G#7', 'Amaj7', 'B', 'E/G#', 'F#sus4', 'Badd9', 'B/D#'] },
    { stemsKey: 'G#m', expected: ['G#m', 'C#m7', 'D#7', 'Emaj7', 'F#', 'B/D#', 'C#sus4', 'F#add9', 'F#/A#'] },
    { stemsKey: 'D#m', expected: ['D#m', 'G#m7', 'A#7', 'Bmaj7', 'C#', 'F#/A#', 'G#sus4', 'C#add9', 'C#/F'] },
    { stemsKey: 'Ebm', expected: ['Ebm', 'Abm7', 'Bb7', 'Bmaj7', 'Db', 'Gb/Bb', 'Absus4', 'Dbadd9', 'Db/F'] },
    { stemsKey: 'Bbm', expected: ['Bbm', 'Ebm7', 'F7', 'Gbmaj7', 'Ab', 'Db/F', 'Ebsus4', 'Abadd9', 'Ab/C'] },
    { stemsKey: 'Fm', expected: ['Fm', 'Bbm7', 'C7', 'Dbmaj7', 'Eb', 'Ab/C', 'Bbsus4', 'Ebadd9', 'Eb/G'] },
    { stemsKey: 'Cm', expected: ['Cm', 'Fm7', 'G7', 'Abmaj7', 'Bb', 'Eb/G', 'Fsus4', 'Bbadd9', 'Bb/D'] },
    { stemsKey: 'Gm', expected: ['Gm', 'Cm7', 'D7', 'Ebmaj7', 'F', 'Bb/D', 'Csus4', 'Fadd9', 'F/A'] },
    { stemsKey: 'Dm', expected: ['Dm', 'Gm7', 'A7', 'Bbmaj7', 'C', 'F/A', 'Gsus4', 'Cadd9', 'C/E'] },
  ])('a chart in Em, for stems in $stemsKey', ({ stemsKey, expected }) => {
    expect(chords(IN_EM, { chartKey: 'Em', stemsKey })).toEqual(expected);
  });

  it.each([
    {
      what: 'a chart in a flat key, Bb, for stems in a sharp one, D',
      text: 'VERSE\n[Bb]one [Eb]two [F/A]three [Gm7]four',
      chartKey: 'Bb',
      stemsKey: 'D',
      expected: ['D', 'G', 'A/C#', 'Bm7'],
    },
    {
      what: 'a chart in a sharp key, E, for stems in a flat one, F',
      text: 'VERSE\n[E]one [A]two [B/D#]three [C#m7]four',
      chartKey: 'E',
      stemsKey: 'F',
      expected: ['F', 'Bb', 'C/E', 'Dm7'],
    },
    {
      what: 'a chart in Em for stems in G, its relative major, which moves nothing',
      text: 'VERSE\n[Em]one [C]two [D]three [B7]four',
      chartKey: 'Em',
      stemsKey: 'G',
      expected: ['Em', 'C', 'D', 'B7'],
    },
    {
      what: 'a chart in G for stems in Am, through its relative major C',
      text: 'VERSE\n[G]one [D/F#]two [Em]three',
      chartKey: 'G',
      stemsKey: 'Am',
      expected: ['C', 'G/B', 'Am'],
    },
    {
      what: 'a chart in Gb for stems in F#, respelled with no movement',
      text: 'VERSE\n[Gb]one [Db/F]two [Ebm]three',
      chartKey: 'Gb',
      stemsKey: 'F#',
      expected: ['F#', 'C#/F', 'D#m'],
    },
    {
      what: 'keys in lower case and a key change, read as the song starts',
      text: 'VERSE\n[F]one [Bb]two [C/E]three',
      chartKey: ' f ',
      stemsKey: 'g-a',
      expected: ['G', 'C', 'D/F#'],
    },
  ])('$what', ({ text, chartKey, stemsKey, expected }) => {
    expect(chords(text, { chartKey, stemsKey })).toEqual(expected);
  });

  // Chromatic and borrowed chords take the letter the move gives them: V/vi over its 3rd, bIII, bVI
  // and bVII keep their function's name in the stems key. A letter that would need E#, B#, Cb, Fb or a
  // double sharp or flat takes the stems key's one name for that pitch instead.
  it.each([
    { chartKey: 'G', stemsKey: 'F', text: 'VERSE\n[B/D#]one [Bb]two [Eb]three [F]four', expected: ['A/C#', 'Ab', 'Db', 'Eb'] },
    { chartKey: 'G', stemsKey: 'D', text: 'VERSE\n[B/D#]one [Bb]two [Eb]three [F]four', expected: ['F#/A#', 'F', 'Bb', 'C'] },
    { chartKey: 'G', stemsKey: 'A', text: 'VERSE\n[B/D#]one [Bb]two [Eb]three [F]four', expected: ['C#/F', 'C', 'F', 'G'] },
    { chartKey: 'C', stemsKey: 'F', text: 'VERSE\n[E/G#]one [Eb]two [Ab]three [Bb]four', expected: ['A/C#', 'Ab', 'Db', 'Eb'] },
    { chartKey: 'D', stemsKey: 'Bb', text: 'VERSE\n[F#/A#]one [F]two [Bb]three [C]four', expected: ['D/F#', 'Db', 'Gb', 'Ab'] },
    { chartKey: 'E', stemsKey: 'Eb', text: 'VERSE\n[G#/B#]one [G]two [C]three [D]four', expected: ['G/B', 'Gb', 'B', 'Db'] },
    { chartKey: 'F#', stemsKey: 'Gb', text: 'VERSE\n[Bb]one [E]two [B/D#]three', expected: ['Bb', 'E', 'B/Eb'] },
  ])('a chart in $chartKey for stems in $stemsKey names its chromatic chords by their letter', ({ chartKey, stemsKey, text, expected }) => {
    expect(chords(text, { chartKey, stemsKey })).toEqual(expected);
  });

  // A chart key whose scale holds Cb, Fb, E# or B# has that note typed by its one name (Gb's IV as B,
  // F#'s vii as F, Ebm's bVI as B), and the note moves as the letter it stands for.
  it.each([
    { chartKey: 'Gb', stemsKey: 'F', text: 'VERSE\n[Gb]one [B]two [Db]three [Ebm]four [Abm]five', expected: ['F', 'Bb', 'C', 'Dm', 'Gm'] },
    { chartKey: 'F#', stemsKey: 'G', text: 'VERSE\n[F#]one [C#/F]two [B]three [Fdim]four', expected: ['G', 'D/F#', 'C', 'F#dim'] },
    { chartKey: 'Ebm', stemsKey: 'Dm', text: 'VERSE\n[Ebm]one [B]two [Db]three [Bb7]four', expected: ['Dm', 'Bb', 'C', 'A7'] },
    { chartKey: 'Gb', stemsKey: 'Eb', text: 'VERSE\n[Gb]one [Bmaj7]two [Db/F]three', expected: ['Eb', 'Abmaj7', 'Bb/D'] },
  ])('a chart in $chartKey for stems in $stemsKey moves a note typed by its one name as the letter of its scale', ({ chartKey, stemsKey, text, expected }) => {
    expect(chords(text, { chartKey, stemsKey })).toEqual(expected);
  });

  // A major flat key's borrowed bIII, bVI and bVII that need Cb, Fb or a double flat are typed by the
  // white key's name (Eb's bVI as B, Gb's bVII as E), and the chord moves as the flat it stands for. A
  // slash bass, a diminished or half-diminished chord (typed dim, °, ø or m7b5) and a B in F (its #4)
  // still move as the letter typed.
  it.each([
    { chartKey: 'Eb', stemsKey: 'F', text: 'VERSE\n[Eb]one [B]two [Cb]three', expected: ['F', 'Db', 'Db'] },
    { chartKey: 'Ab', stemsKey: 'Bb', text: 'VERSE\n[E]one [B]two', expected: ['Gb', 'Db'] },
    { chartKey: 'Gb', stemsKey: 'F', text: 'VERSE\n[E]one [A]two [D]three', expected: ['Eb', 'Ab', 'Db'] },
    { chartKey: 'Db', stemsKey: 'C', text: 'VERSE\n[B]one [A]two [E]three', expected: ['Bb', 'Ab', 'Eb'] },
    { chartKey: 'Eb', stemsKey: 'F', text: 'VERSE\n[G/B]one [Edim7]two [Bdim]three', expected: ['A/C#', 'F#dim7', 'C#dim'] },
    { chartKey: 'Ab', stemsKey: 'G', text: 'VERSE\n[Em7b5]one [Em7(b5)]two [Emi7b5]three [Eø7]four', expected: ['D#m7b5', 'D#m7(b5)', 'D#mi7b5', 'D#ø7'] },
    { chartKey: 'Eb', stemsKey: 'F', text: 'VERSE\n[Bm7b5]one [Bø7]two', expected: ['C#m7b5', 'C#ø7'] },
    { chartKey: 'Db', stemsKey: 'D', text: 'VERSE\n[Am7b5]one [Aø7]two', expected: ['A#m7b5', 'A#ø7'] },
    { chartKey: 'Gb', stemsKey: 'G', text: 'VERSE\n[Dmin7b5]one', expected: ['D#min7b5'] },
    { chartKey: 'F', stemsKey: 'G', text: 'VERSE\n[B]one', expected: ['C#'] },
  ])('a chart in $chartKey for stems in $stemsKey moves a borrowed chord typed by its white key as the flat it stands for', ({ chartKey, stemsKey, text, expected }) => {
    expect(chords(text, { chartKey, stemsKey })).toEqual(expected);
  });

  it('keeps what is not a chord as typed, and moves each chord in a bracket of several', () => {
    const text = 'VERSE\n[N.C.]one [x2]two []three [g]four [G  C]five [G x2]six [C6/9]seven [|]eight [Am7b5]nine';
    expect(chords(text, { chartKey: 'G', stemsKey: 'A' })).toEqual(['N.C.', 'x2', '', 'g', 'A  D', 'A x2', 'D6/9', '|', 'Bm7b5']);
  });

  it('keeps a word in a bracket as typed when it starts with a note name', () => {
    const cues = ['Coda', 'Build', 'Bridge', 'Ad lib', 'End', 'Drums', 'Bass', 'Capo 2', 'Chorus x2', 'Bsus4 Build'];
    const text = `VERSE\n${cues.map((cue) => `[${cue}]words`).join(' ')}`;
    expect(chords(text, { chartKey: 'G', stemsKey: 'A' })).toEqual(['Coda', 'Build', 'Bridge', 'Ad lib', 'End', 'Drums', 'Bass', 'Capo 2', 'Chorus x2', 'C#sus4 Build']);
  });

  it('moves a chord whose suffix is chord vocabulary', () => {
    const text = 'VERSE\n[Gmin7]a [Gdim7]b [Gaug]c [G+]d [GM7]e [G7#9]f [Gm7(b5)]g [Gsus2]h [Gmaj9#11]i [G°7]j [Gø7]k [G2]l';
    expect(chords(text, { chartKey: 'G', stemsKey: 'A' })).toEqual(['Amin7', 'Adim7', 'Aaug', 'A+', 'AM7', 'A7#9', 'Am7(b5)', 'Asus2', 'Amaj9#11', 'A°7', 'Aø7', 'A2']);
  });

  it('moves a chord spelled with Maj, ma, mi, no, a comma or a second sus', () => {
    const text = 'VERSE\n[GMaj7]a [Gma7]b [Gmi7]c [G(no3)]d [G7(b9,#11)]e [Gsus2/sus4]f [Gadd9/add11]g [Gmi7/B]h';
    expect(chords(text, { chartKey: 'G', stemsKey: 'A' })).toEqual(['AMaj7', 'Ama7', 'Ami7', 'A(no3)', 'A7(b9,#11)', 'Asus2/sus4', 'Aadd9/add11', 'Ami7/C#']);
  });

  it('leaves the headings, the words, the notes and the dropped lines as they were', () => {
    const text = 'a line before the first heading\nVERSE\n[G]Made up [C]words\n{ Keys only }\n\nTRANSPOSE KEY +1\nCHORUS\nwords with no chord';
    const typed = parseChart(text);
    const moved = parseChart(text, { chartKey: 'G', stemsKey: 'A' });

    expect(moved.dropped).toEqual(typed.dropped);
    expect(moved.sections.map(({ name }) => name)).toEqual(typed.sections.map(({ name }) => name));
    expect(moved.sections[0]?.lines).toEqual([
      {
        kind: 'lyrics',
        chunks: [
          { chord: 'A', text: 'Made up ' },
          { chord: 'D', text: 'words' },
        ],
      },
      { kind: 'note', text: 'Keys only' },
    ]);
    expect(moved.sections[1]?.lines).toEqual(typed.sections[1]?.lines);
  });
});

describe('the chart module shows the chords as typed', () => {
  // Chords in G and their spellings, which a chart moved to F would change.
  const text = 'VERSE\n[G]one [D/F#]two [Gb]three [A#m]four [Cmaj7]five';
  const asTyped = ['G', 'D/F#', 'Gb', 'A#m', 'Cmaj7'];

  it.each([
    { what: 'with no keys at all', keys: undefined },
    { what: 'for an empty chart key', keys: { chartKey: '', stemsKey: 'F' } },
    { what: 'for a chart key of spaces', keys: { chartKey: '  ', stemsKey: 'F' } },
    { what: 'for a missing chart key', keys: { stemsKey: 'F' } },
    { what: 'for a song with no stems key', keys: { chartKey: 'G', stemsKey: null } },
    { what: 'for a missing stems key', keys: { chartKey: 'G' } },
    { what: 'for a chart key that is not a note name', keys: { chartKey: 'H', stemsKey: 'F' } },
    { what: 'for a chart key written out in words', keys: { chartKey: 'E minor', stemsKey: 'F' } },
    { what: 'for a stems key that is not a note name', keys: { chartKey: 'G', stemsKey: 'H' } },
    { what: 'for an empty stems key', keys: { chartKey: 'G', stemsKey: '' } },
  ])('$what', ({ keys }) => {
    expect(chords(text, keys)).toEqual(asTyped);
  });

  // The stems in the chart's own key: borrowed and chromatic chords keep the names typed, whichever
  // side of the black keys the key takes.
  it.each([
    { chartKey: 'G', stemsKey: 'G' },
    { chartKey: 'D', stemsKey: 'D' },
    { chartKey: 'C', stemsKey: 'C' },
    { chartKey: 'F', stemsKey: 'F' },
    { chartKey: 'Em', stemsKey: 'G' },
  ])('for a chart in $chartKey and stems in $stemsKey, the same key', ({ chartKey, stemsKey }) => {
    const sameKey = 'VERSE\n[G]a [Bb]b [Eb]c [E/G#]d [D/F#]e [A#]f [D/Gb]g';
    expect(chords(sameKey, { chartKey, stemsKey })).toEqual(['G', 'Bb', 'Eb', 'E/G#', 'D/F#', 'A#', 'D/Gb']);
  });
});
