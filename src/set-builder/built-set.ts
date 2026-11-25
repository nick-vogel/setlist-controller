import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSet } from '../server/set-parser.ts';
import { songTitle } from '../shared/snapshot.ts';
import { child, childElements, readAls, valueOf } from './als.ts';
import { setFolder, setName } from './build-set.ts';

// The songs of the set built for a date, read back from its Live set, <output root>/<date> <weekday>/<date>
// <weekday>.als, where the build wrote it. The set manifest cannot say them: it is one file with no date, and every build
// replaces it. The locators are read as the server reads them from Live (parseSet), so a song's title here is the very
// string the server's lights match a cue's label by, and a song whose Count Off carries no title reads as "Song <n>", as
// it does there.

// A song of the set: its place in the set, from 1, and its title.
export type BuiltSong = { position: number; title: string };

// The set's songs in set order, or the one reason there are none to give, as a sentence: no set for the date, a set that
// cannot be read, or a set with no song in it.
export async function readBuiltSet(outputRoot: string, date: string): Promise<{ ok: true; songs: BuiltSong[] } | { ok: false; problem: string }> {
  const path = join(setFolder(outputRoot, date), `${setName(date)}.als`);
  if (!existsSync(path)) return { ok: false, problem: `no set is built for ${date}, since ${path} is not there. Build the set, then run the lights step again.` };
  let songs: BuiltSong[];
  try {
    const locators = childElements(child((await readAls(path)).root, 'LiveSet', 'Locators', 'Locators'), 'Locator');
    const cuePoints = locators.map((locator) => ({ name: valueOf(locator, 'Name'), time: Number(valueOf(locator, 'Time')) }));
    songs = parseSet(cuePoints).songs.map((song, index) => ({ position: index + 1, title: songTitle(song) }));
  } catch (error) {
    const cause = (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ').replace(/\.$/, '');
    return { ok: false, problem: `the set built for ${date}, ${path}, cannot be read: ${cause}.` };
  }
  if (songs.length === 0) return { ok: false, problem: `the set built for ${date}, ${path}, holds no song: none of its locators reads as "<song number> - <section name>".` };
  return { ok: true, songs };
}
