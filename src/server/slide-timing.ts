import { readFile } from 'node:fs/promises';
import { nameKey } from '../shared/match-name.ts';

// The slide timing file: per-song exceptions to how ProPresenter's slides follow the set
// (propresenter.ts), for a song whose words do not fit the even split of a section's bars or whose
// section has no group of its name. It lives at config/slide-timing.json in this repository, beside
// the stem map, and start-up hands its path to the ProPresenter kind; a test hands its own. A missing
// file means no exceptions.
//
//   {
//     "Ancient Gates": [{ "section": "Verse 3", "occurrence": 1, "changes": [3, 6] }],
//     "Great Are You Lord": [{ "section": "Outro", "occurrence": 1, "group": 15 }],
//     "Worthy Of It All": [{ "section": "Chorus", "occurrence": 1, "start": -0.625 }]
//   }
//
// Each top-level key is a song title, matched under the name rule (match-name.ts), and holds a list of
// entries. An entry names a section occurrence of the song by section, its name, and occurrence, which
// section of that name it is, counted from 1, and 1 when left out. Changes is the bar of each slide
// change after the first, counted from the section's start, decimals allowed. Group is a group's
// position in the presentation's group order, counted from 1 as ProPresenter lists them, every group
// counted, an unnamed one included; the section shows that group's slides, on the even split of its
// bars when the entry gives no changes. Start is where the section's first sung line starts, for a line
// sung on a pickup, in bars before the section's start, as a negative number counted as changes are:
// slide 1 goes up that much before the section's start, and the normal lead on top of it. An entry
// gives changes, a group, a start, or any of them.
//
// The rules, each checked against the set and the song's presentation by the ProPresenter check, in
// this order: the section names a section of the song; the occurrence is a whole number from 1 and the
// song has that many sections of the name; the entry gives changes, a group, a start, or any of them;
// the group is a whole number from 1 to the presentation's count of groups; with no group, the section
// has a group of its name for the changes or the start to move; changes is a list of numbers, one fewer
// than the group's slides, going up, each after the section's start and before its end; start is a
// number below 0; no earlier entry names the same section occurrence; and, once every entry is judged
// by the rules before it, the start lands after the last change of the section before, as those
// entries leave it, its last slide or its downbeat when it shows one slide or clears, or for a song's
// first section after the end of the song before it in the set, its End, or for a song with no End the
// last change of its last section, which runs to this song's first locator, and the set's start for
// the first song. An entry that breaks one is a problem in the check, and is ignored whole, so its
// section keeps the even split and the name match. Only entries of a song in the set are checked.
// Each title is checked too, against the set's songs and the presentations in ProPresenter's
// libraries, under the name rule: a title that matches neither is a problem, as a typo is, whether or
// not the song it misspells plays this week.
//
// The file is read with the set and the presentations, on each ProPresenter check, so on Refresh too,
// and an edit takes effect from the next Refresh with nothing to restart.

// A song whose value is not a list of entries: one entry that is this, so the check names the song.
export const NOT_A_LIST = Symbol('not a list');

// The file as read: each song by the name key of its title, in file order, with the title as the file
// first spells it and its entries in file order, two titles that match under the name rule joined in
// file order, each entry as the file holds it; and what is wrong with the file itself, which leaves no
// exceptions, or null.
export type SlideTimingSong = { title: string; entries: unknown[] };
export type SlideTiming = { songs: Map<string, SlideTimingSong>; problem: string | null };

export const NO_SLIDE_TIMING: SlideTiming = { songs: new Map(), problem: null };

// Reads the slide timing file at that path. A missing file is no exceptions and no problem. A file it
// cannot read, one that is not valid JSON, and one whose top level is not an object of songs are each
// one problem that names the file, with no exceptions.
export async function readSlideTiming(path: string): Promise<SlideTiming> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return NO_SLIDE_TIMING;
    return broken(path, `cannot be read: ${oneLine(error)}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return broken(path, `is not valid JSON: ${oneLine(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return broken(path, `must be an object of songs, and its top level is ${jsonKind(value)}`);
  const songs = new Map<string, SlideTimingSong>();
  for (const [title, entries] of Object.entries(value)) {
    const key = nameKey(title);
    const song = songs.get(key) ?? { title, entries: [] };
    songs.set(key, { title: song.title, entries: [...song.entries, ...(Array.isArray(entries) ? (entries as unknown[]) : [NOT_A_LIST])] });
  }
  return { songs, problem: null };
}

function broken(path: string, wrong: string): SlideTiming {
  return { songs: new Map(), problem: `slide timing file ${path}: ${wrong}` };
}

// An error's message on one line.
function oneLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ');
}

// What a JSON value is, as the end of a sentence: "a list", "null" or "a string".
function jsonKind(value: unknown): string {
  if (Array.isArray(value)) return 'a list';
  if (value === null || typeof value === 'boolean') return String(value);
  return `a ${typeof value}`;
}
