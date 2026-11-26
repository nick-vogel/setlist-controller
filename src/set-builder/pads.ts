import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Transition } from './build-set.ts';
import type { Song } from './song.ts';
import { readWavHeader } from './wav.ts';

// A pad plays an ambient pad file between two songs, in the key of the song after it, or after the last song, in that
// song's key; a pad given its own key plays in that one. The pads folder holds one WAV per key, named by its key (`A.wav`,
// `Eb.wav`); a build reads it only when it asks for a pad.

// One pad file a build plays, as the clip that plays it and the copy in the project need it.
export type PadFile = {
  // The key it is in, and its file name in the pads folder: `A` and `A.wav`.
  key: string;
  name: string;
  // Its absolute path in the pads folder.
  path: string;
  // Its size in bytes and its modification time in Unix seconds, as Live records them for a clip's file.
  size: number;
  modified: number;
  // Its length in sample frames, and its sample rate, from its header.
  frames: number;
  sampleRate: number;
};

// One pad the build plays: the key it is asked to play in, as its own key or the song's folder name writes it, which the
// summary shows, and the pad file that plays that key, which may be named by another spelling of it: `Am` plays `A.wav`.
export type Pad = { key: string; file: PadFile };

// The pads the build plays, by the song position each pad follows, from 1; or the problems that stop the build.
export type PadsReading = { pads: Record<number, Pad>; problems: string[] };

// One pad file as read, or the problem that stops the build on it.
type PadFileReading = { ok: true; pad: PadFile } | { ok: false; problem: string };

// Where a pad file's copy goes, as the path from the project folder: its own folder beside the songs' folders.
export function padProjectFile(pad: PadFile): string {
  return `Songs/_pads/${pad.name}`;
}

// A song's key, from its folder name, `<title>-<artist>-<key>-<bpm>bpm`: the token before the BPM, so
// `Goodness of God-Victory-A-63.00bpm` is in A. Undefined when the name has no such token.
export function songKey(folder: string): string | undefined {
  return /-([^-]+)-\d+(?:\.\d+)?bpm$/i.exec(folder)?.[1]?.trim() || undefined;
}

// A key, as a pad is asked to play in and a song's folder name writes it, is a note name: a letter A to G, then
// optionally `#` or `b`, then optionally `m` for minor: `G`, `F#`, `Bb`, `Em`.
export function isKey(value: string): boolean {
  return /^[A-G][#b]?m?$/.test(value);
}

// What a key is (isKey), as a problem about one explains it.
export const KEY_GRAMMAR = 'A key is a note name, A to G, then # or b, then m for minor: G, F#, Bb, Em.';

// A song's key as its folder name writes it (songKey), when it is a note name (isKey), so Em stays Em: the key the listing
// prints, and the key a pad with no key of its own is asked to play in. When it is none, the key the name writes, if it
// writes one, for a problem to name.
export function songNoteKey(folder: string): { ok: true; key: string } | { ok: false; written?: string } {
  const key = songKey(folder);
  return key !== undefined && isKey(key) ? { ok: true, key } : { ok: false, written: key };
}

type PadTransition = Extract<Transition, { type: 'pad' }>;

// The pad file for each pad `transitions` asks for, in its key: its own key when it has one, and otherwise the key of
// the song after it, or of the last song itself for a pad after it. The file is the first of the key's pad file names
// (padFileNames) that `folder` has, in any letter case, under the name it has there. `service` holds the song at each
// position, or undefined where the position's name matched no song or its song could not be read: its own problem
// already names it, and a pad that takes its key from it is not read. The problems come in service order: a song whose
// folder name has no key, or a key that is not a note name, a pads folder that cannot be listed (once), a key with no
// file, which lists the names looked for and the keys the folder has, and a file that cannot be read as a WAV. A file
// two pads play, by one spelling of its key or another, is read once. A problem calls the song at a position by its
// number (numberOf).
export async function readPads(
  folder: string,
  service: (Song | undefined)[],
  transitions: Partial<Record<number, Transition>>,
  numberOf: (position: number) => number,
): Promise<PadsReading> {
  const asked = Object.entries(transitions)
    .flatMap(([position, transition]) => (transition?.type === 'pad' ? [[Number(position), transition] as const] : []))
    .toSorted(([a], [b]) => a - b);
  if (asked.length === 0) return { pads: {}, problems: [] };
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => undefined);
  const files = new Map<string, Promise<PadFileReading>>();
  const pads: Record<number, Pad> = {};
  const problems: string[] = [];
  for (const [position, transition] of asked) {
    const reading = padKey(position, transition, service, numberOf(position));
    if (reading === undefined) continue;
    if (!reading.ok) {
      problems.push(reading.problem);
      continue;
    }
    const { key, from } = reading;
    if (entries === undefined) {
      const unreadable = `Cannot read the pads folder ${folder}.`;
      if (!problems.includes(unreadable)) problems.push(unreadable);
      continue;
    }
    const names = padFileNames(key);
    const name = names
      .map((candidate) => entries.find((entry) => entry.name.toLowerCase() === candidate.toLowerCase() && !entry.isDirectory())?.name)
      .find((found) => found !== undefined);
    if (name === undefined) {
      const keyOf = from === undefined ? '' : `the key of ${from}, `;
      problems.push(`The pad after song ${numberOf(position)} is in ${key}, ${keyOf}and the pads folder ${folder} has no ${names.join(' or ')}. ${keysIn(entries)}`);
      continue;
    }
    if (!files.has(name)) files.set(name, readPad(folder, name));
    const file = await files.get(name);
    if (file?.ok) {
      pads[position] = { key, file: file.pad };
    } else if (file && !problems.includes(file.problem)) {
      problems.push(file.problem);
    }
  }
  return { pads, problems };
}

// The key the pad after song `position` is asked to play in: its own, or the key of the song after it, or of the last
// song itself for a pad after it, with that song's folder; or the problem that stops the build on the folder's key; or
// undefined when the song it takes its key from could not be read, whose own problem names it. A pad's own key is a
// note name: buildSet has already thrown on one that is not (checkTransitions). A problem calls the song by `number`.
function padKey(position: number, transition: PadTransition, service: (Song | undefined)[], number: number): { ok: true; key: string; from?: string } | { ok: false; problem: string } | undefined {
  if (transition.key !== undefined) return { ok: true, key: transition.key };
  // The song after the pad, at index `position` since positions count from 1; after the last song, the song itself.
  const song = position === service.length ? service[position - 1] : service[position];
  if (!song) return undefined;
  const reading = songNoteKey(song.folder);
  if (reading.ok) return { ok: true, key: reading.key, from: song.folder };
  if (reading.written === undefined) return { ok: false, problem: `${song.folder}: the folder name has no key before its BPM, which the pad after song ${number} is played in.` };
  return { ok: false, problem: `${song.folder}: the folder name's key, "${reading.written}", is not a note name, which the pad after song ${number} is played in.` };
}

// The five pairs of note names that are one key, each name mapped to its twin: for the pad files that play a key
// (padFileNames), and for whether a plan's key is a folder's key (sameKey).
const ENHARMONIC_TWINS = new Map(
  [
    ['C#', 'Db'],
    ['D#', 'Eb'],
    ['F#', 'Gb'],
    ['G#', 'Ab'],
    ['A#', 'Bb'],
  ].flatMap(([sharp = '', flat = '']) => [
    [sharp, flat],
    [flat, sharp],
  ]),
);

// A plan's key as the folder match reads it: the text before its first hyphen, trimmed, with its first letter in upper
// case, when that is a note name (isKey), so `e` is E, `f#m` is F#m and the key change `G-A` is G, the key the song
// starts in. Otherwise the key as the plan writes it, for a problem to name.
export function planKey(written: string): string {
  const read = written.split('-')[0]?.trim() ?? '';
  const key = read.charAt(0).toUpperCase() + read.slice(1);
  return isKey(key) ? key : written;
}

// Whether two keys are one key: both note names (isKey), both minor or both major, and their roots one note name or
// enharmonic twins, so Db is C# and Em is not E. A key that is not a note name is one key with nothing.
export function sameKey(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined || !isKey(a) || !isKey(b)) return false;
  if (a.endsWith('m') !== b.endsWith('m')) return false;
  const [rootA, rootB] = [a.replace(/m$/, ''), b.replace(/m$/, '')];
  return rootA === rootB || ENHARMONIC_TWINS.get(rootA) === rootB;
}

// The names of the pad files that play `key`, in the order they are looked for: its root's, the key without its minor
// `m`, so `Am` plays `A.wav`, then its root's enharmonic twin's, so `Db` plays `Db.wav`, or `C#.wav` when the folder has
// no `Db.wav`.
function padFileNames(key: string): string[] {
  const root = key.replace(/m$/, '');
  const twin = ENHARMONIC_TWINS.get(root);
  return [root, ...(twin === undefined ? [] : [twin])].map((name) => `${name}.wav`);
}

// The keys the pads folder has, each `.wav` file's name without `.wav`, in any letter case, sorted, as a problem lists
// them.
function keysIn(entries: Dirent[]): string {
  const keys = entries
    .filter((entry) => /\.wav$/i.test(entry.name) && !entry.isDirectory())
    .map((entry) => entry.name.slice(0, -'.wav'.length))
    .toSorted((a, b) => a.localeCompare(b));
  return keys.length === 0 ? 'It has no pad files.' : `The keys it has are ${keys.join(', ')}.`;
}

// The pad file `name`, which is named by its key, or the problem that stops the build on it.
async function readPad(folder: string, name: string): Promise<PadFileReading> {
  const path = join(folder, name);
  try {
    const [{ frames, sampleRate }, { size, mtimeMs }] = await Promise.all([readWavHeader(path), stat(path)]);
    return { ok: true, pad: { key: name.slice(0, -'.wav'.length), name, path, size, modified: Math.floor(mtimeMs / 1000), frames, sampleRate } };
  } catch (error) {
    return { ok: false, problem: `${path}: the pad file could not be read as a WAV: ${error instanceof Error ? error.message : String(error)}.` };
  }
}
