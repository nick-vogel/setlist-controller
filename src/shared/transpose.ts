// Keys and chords, for the chart view to show a chart's chords in the stems' key: each chord's root
// and slash bass moved from the key the chart is typed in to the key the stems are in, its letter moved
// as far as the key's letter moves, and the rest of the chord as typed. The browser runs it, so it holds no node
// import.

// How a key names the black keys: sharps for G, D, A, E, B and the keys written with a sharp, flats
// for F and the keys written with a flat, and for C and Am, which have none of their own, the names a
// worship chart in C uses: Bb, Ab and Eb for its borrowed chords, and F# for D/F#.
export type Spelling = 'sharps' | 'flats' | 'mixed';

export type Key = {
  // The key's tonic, a pitch class from 0 for C to 11 for B.
  tonic: number;
  // The tonic's letter, from 0 for C to 6 for B.
  letter: number;
  minor: boolean;
  spelling: Spelling;
};

// The move from a chart's key to the stems' key: the semitones up, 0 to 11, the letters up, 0 to 6,
// the stems key's side, and, by pitch class, the letter the chart key's scale names a white key with
// where that name is not the white key's own (Gb's Cb for B, F#'s E# for F), and likewise the letter
// of a borrowed bIII, bVI or bVII the chart key would name with Cb, Fb or a double flat (Eb's Cb for B).
export type KeyShift = {
  shift: number;
  letters: number;
  spelling: Spelling;
  scaleLetters: Readonly<Record<number, number>>;
  borrowedLetters: Readonly<Record<number, number>>;
};

// One name per pitch class, for a moved letter that would read E#, B#, Cb, Fb or a double sharp or
// flat, which a chart never shows.
const NAMES: Record<Spelling, readonly string[]> = {
  sharps: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  flats: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
  mixed: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
};

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTER_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const WHITE_KEYS = new Set(Object.values(LETTERS));
// A major scale's steps from its tonic, in semitones, one per letter.
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
// The accidental that lifts a letter to a pitch, by the semitones between them.
const ACCIDENTALS: Record<number, string> = { 0: '', 1: '#', 11: 'b' };

// The side a key with no accidental written takes, by its relative major: C's mixed, F's flats, and
// the sharps of G, D, A, E and B. The relative majors of Cm, Fm and Gm are Eb, Ab and Bb.
const UNWRITTEN_SIDE: Record<number, Spelling> = { 0: 'mixed', 2: 'sharps', 3: 'flats', 4: 'sharps', 5: 'flats', 7: 'sharps', 8: 'flats', 9: 'sharps', 10: 'flats', 11: 'sharps' };

// A key, as a song's folder name and Planning Center write it, is a note name: a letter A to G, then
// optionally `#` or `b`, then optionally `m` for minor.
const KEY = /^([A-G])([#b]?)(m?)$/;

// A chord: its root, the rest of it as typed, and an optional slash bass. The rest is chord vocabulary
// only (m, maj, Maj, ma, min, mi, dim, aug, sus, add, no, M, +, °, ø, digits, # and b, parentheses and
// commas), so a word typed in a bracket, such as `Coda` or `Build`, is no chord and stays as typed. A
// slash followed by a digit, `sus` or `add` stays in the rest, so `C6/9` is C with `6/9` and
// `Csus2/sus4` C with `sus2/sus4`.
const CHORD = /^([A-G])([#b]?)((?:maj|Maj|ma|min|mi|dim|aug|sus|add|no|m|M|\+|°|ø|\d|#|b|\(|\)|,|\/(?=\d|sus|add))*)(?:\/([A-G])([#b]?))?$/;

// A chord's rest that makes it diminished or half-diminished: `dim`, `°` or `ø`, or a minor chord with
// a flat fifth, `m7b5`, `m7(b5)`, `mi7b5`, `min7b5` or `mb5`.
const DIMINISHED = /^(?:dim|°|ø|(?:min|mi|m)\d*\(?b5)/;

function pitch(letter: string, accidental: string): number {
  return mod12((LETTERS[letter] ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function mod7(value: number): number {
  return ((value % 7) + 7) % 7;
}

// A key as written: trimmed, read up to a first hyphen, so the key change `G-A` is G, the key the song
// starts in, with its first letter upper-cased, so `f#m` is F#m. Undefined for a key that is empty,
// missing, or no note name, such as `H` or `E minor`.
export function readKey(written: string | null | undefined): Key | undefined {
  const read = written?.split('-')[0]?.trim() ?? '';
  const match = KEY.exec(read.charAt(0).toUpperCase() + read.slice(1));
  if (!match) return undefined;
  const [, letter = '', accidental = '', minor] = match;
  const tonic = pitch(letter, accidental);
  const major = mod12(tonic + (minor ? 3 : 0));
  // A written sharp or flat decides the side, so F# and D#m are sharps and Gb and Ebm flats.
  const spelling = accidental === '#' ? 'sharps' : accidental === 'b' ? 'flats' : (UNWRITTEN_SIDE[major] ?? 'sharps');
  return { tonic, letter: LETTER_ORDER.indexOf(letter), minor: minor === 'm', spelling };
}

// The move from a chart's key to the stems' key. A minor key is compared through its relative major,
// a minor third and two letters up, so Em to G moves nothing. Undefined, so the
// chords show as typed, when either key is empty, missing, or no note name, and when the two are one
// key, such as G and G or Em and G, so a chart in the stems' own key keeps its Bb and Eb. Two names of
// one key, such as Gb and F#, still respell to the stems key's side.
export function keyShift(chartKey: string | null | undefined, stemsKey: string | null | undefined): KeyShift | undefined {
  const chart = readKey(chartKey);
  const stems = readKey(stemsKey);
  if (!chart || !stems) return undefined;
  const major = (key: Key) => key.tonic + (key.minor ? 3 : 0);
  const majorLetter = (key: Key) => key.letter + (key.minor ? 2 : 0);
  const shift = mod12(major(stems) - major(chart));
  if (shift === 0 && chart.spelling === stems.spelling) return undefined;
  return {
    shift,
    letters: mod7(majorLetter(stems) - majorLetter(chart)),
    spelling: stems.spelling,
    scaleLetters: scaleLetters(chart),
    borrowedLetters: borrowedLetters(chart),
  };
}

// The white keys a key's scale names by another letter, such as Gb's Cb or F#'s E#, which a chart in
// that key types by the one name, B or F: by pitch class, the scale's letter.
function scaleLetters(key: Key): Record<number, number> {
  const tonic = key.tonic + (key.minor ? 3 : 0);
  const letter = key.letter + (key.minor ? 2 : 0);
  const letters: Record<number, number> = {};
  MAJOR_STEPS.forEach((step, index) => {
    const note = mod12(tonic + step);
    const scaleLetter = mod7(letter + index);
    if (WHITE_KEYS.has(note) && LETTERS[LETTER_ORDER[scaleLetter] ?? ''] !== note) letters[note] = scaleLetter;
  });
  return letters;
}

// The white keys a major key's borrowed bIII, bVI and bVII fall on where the flat's letter is not the
// white key's own, such as Eb's Cb for B and Gb's Fb, Bbb and Ebb for E, A and D, which a chart types
// by the white key's name: by pitch class, the flat's letter. None for a minor key, whose own scale
// holds its b3, b6 and b7.
function borrowedLetters(key: Key): Record<number, number> {
  const letters: Record<number, number> = {};
  if (key.minor) return letters;
  [2, 5, 6].forEach((index) => {
    const note = mod12(key.tonic + (MAJOR_STEPS[index] ?? 0) - 1);
    const flatLetter = mod7(key.letter + index);
    if (WHITE_KEYS.has(note) && LETTERS[LETTER_ORDER[flatLetter] ?? ''] !== note) letters[note] = flatLetter;
  });
  return letters;
}

// A bracket's text, each whitespace-separated token that is a chord moved up `move.shift` semitones,
// and anything else, such as `N.C.`, `x2` or a lower-case `g`, kept as typed, with the spacing between
// tokens. A moved note takes the letter `move.letters` up from its own, so G to F makes B/D# A/C#,
// and the sharp or flat that reaches its pitch. Where that would read E#, B#, Cb, Fb or a double sharp
// or flat, it takes the name `move.spelling` gives that pitch. A white key typed with no sharp or flat
// that the chart key's scale names by another letter moves as that letter, so Gb's B moves as Cb, and
// so does a root, not a slash bass or a diminished or half-diminished chord, on a borrowed flat of a
// major key, so Eb's B moves as Cb but the bass of its G/B and the roots of its Bdim and Bm7b5 as B.
export function transposeChord(text: string, move: KeyShift): string {
  return text
    .split(/(\s+)/)
    .map((token) => {
      const chord = CHORD.exec(token);
      if (!chord) return token;
      const [, root = '', accidental = '', rest = '', bass, bassAccidental = ''] = chord;
      const borrowed = DIMINISHED.test(rest) ? {} : move.borrowedLetters;
      const name = (letter: string, mark: string, borrowedLetters: Readonly<Record<number, number>> = {}) => {
        const typed = pitch(letter, mark);
        const moved = mod12(typed + move.shift);
        const from = (mark === '' ? (move.scaleLetters[typed] ?? borrowedLetters[typed]) : undefined) ?? LETTER_ORDER.indexOf(letter);
        const target = LETTER_ORDER[mod7(from + move.letters)] ?? letter;
        const accidental = ACCIDENTALS[mod12(moved - (LETTERS[target] ?? 0))];
        if (accidental === undefined || (accidental !== '' && WHITE_KEYS.has(moved))) return NAMES[move.spelling][moved];
        return `${target}${accidental}`;
      };
      return `${name(root, accidental, borrowed)}${rest}${bass === undefined ? '' : `/${name(bass, bassAccidental)}`}`;
    })
    .join('');
}

// A natural minor scale's steps from its tonic, in semitones, one per letter.
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
// One number per pitch above the tonic, for a pitch two semitones off its letter's degree, such as an
// Fb in G: the major key's b2, b3, #4, b6 and b7, and the minor key's b2, #3, #4, #6 and #7.
const PITCH_NUMBERS: Record<'major' | 'minor', readonly string[]> = {
  major: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
  minor: ['1', 'b2', '2', '3', '#3', '4', '#4', '5', '6', '#6', '7', '#7'],
};

// A bracket's text in Nashville numbers counted from the key's tonic: each whitespace-separated token
// that is a chord takes its root's degree and its slash bass's, each as the key names the letter (its
// scale's letters, so Gb's B is Cb and numbers 4, and for a root that is not diminished, a major key's
// borrowed flats, so Gb's E is Fb and numbers b7), with a `b` or `#` where the pitch is off that degree
// of the key's scale, major or natural minor. The rest of the chord is kept as typed, so Em7 in G is
// 6m7, and anything else, such as `N.C.` or `x2`, with the spacing between tokens.
export function numberChord(text: string, key: Key): string {
  const steps = key.minor ? MINOR_STEPS : MAJOR_STEPS;
  const scale = scaleLetters(key);
  const borrowed = borrowedLetters(key);
  const number = (letter: string, mark: string, borrowedLetters: Readonly<Record<number, number>>) => {
    const typed = pitch(letter, mark);
    const named = (mark === '' ? (scale[typed] ?? borrowedLetters[typed]) : undefined) ?? LETTER_ORDER.indexOf(letter);
    const degree = mod7(named - key.letter);
    const accidental = ACCIDENTALS[mod12(typed - key.tonic - (steps[degree] ?? 0))];
    if (accidental === undefined) return PITCH_NUMBERS[key.minor ? 'minor' : 'major'][mod12(typed - key.tonic)];
    return `${accidental}${degree + 1}`;
  };
  return text
    .split(/(\s+)/)
    .map((token) => {
      const chord = CHORD.exec(token);
      if (!chord) return token;
      const [, root = '', accidental = '', rest = '', bass, bassAccidental = ''] = chord;
      return `${number(root, accidental, DIMINISHED.test(rest) ? {} : borrowed)}${rest}${bass === undefined ? '' : `/${number(bass, bassAccidental, {})}`}`;
    })
    .join('');
}

// A key put into a mode by its relative, so G as a minor key is Em and Em as a major key is G, and a
// key already in that mode as it is.
export function relativeKey(key: Key, minor: boolean): Key {
  if (key.minor === minor) return key;
  const up = minor ? -1 : 1;
  return { tonic: mod12(key.tonic + 3 * up), letter: mod7(key.letter + 2 * up), minor, spelling: key.spelling };
}

// A key's name by its tonic's pitch class, for a capo's shape key: the name with fewer sharps or
// flats, and F# and Ebm where the two names tie at six.
const KEY_NAMES: Record<'major' | 'minor', readonly string[]> = {
  major: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  minor: ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'],
};

// The key a guitarist's shapes are in with a capo of `capo` on a song in `written`: the key that many
// semitones down, on the key's own side, major or minor. Undefined for a key that is no note name.
export function capoKey(written: string, capo: number): string | undefined {
  const key = readKey(written);
  return key && KEY_NAMES[key.minor ? 'minor' : 'major'][mod12(key.tonic - capo)];
}
