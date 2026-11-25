import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SetList } from '../shared/snapshot.ts';

// The playlist the producer picked for each set, kept in a small JSON file in the server's settings
// folder, so a pick survives a restart. A set is known by its songs as the server reads them from
// Live, each song's number and title, in order; its section names do not count, so a section edit
// during the week keeps the pick. A set the store has not seen has no pick. It keeps the most recent
// sets only.
//
//   { "sets": [ { "songs": [{ "number": 1, "title": "There Is Freedom" }], "playlist": { "id": "...", "name": "..." } } ] }
//
// The sets are oldest first. A missing or unreadable file is no picks, logged and never thrown, and
// so is a write that fails. A write goes to a temporary file in the same folder, then a rename, so a
// crash never leaves half a file.

export type StoredPlaylist = { id: string; name: string };

export type PicksStore = {
  // Reads the file. Until it resolves the store holds no picks.
  load(): Promise<void>;
  // The playlist picked for the set, or null when it has none.
  get(set: SetList): StoredPlaylist | null;
  // Keeps the playlist for the set, as its most recent, and writes the file. Resolves once written,
  // or once a failed write is logged.
  save(set: SetList, playlist: StoredPlaylist): Promise<void>;
};

// How many sets the file keeps, the most recent.
export const KEPT_SETS = 20;

type Songs = { number: number; title: string | null }[];
type Entry = { songs: Songs; playlist: StoredPlaylist };

const songsOf = (set: SetList): Songs => set.songs.map(({ number, title }) => ({ number, title }));
const keyOf = (songs: Songs) => JSON.stringify(songs.map(({ number, title }) => [number, title]));

export function picksStore(path: string): PicksStore {
  // Oldest first, by the set's key.
  let entries: Entry[] = [];
  // Writes go one at a time, in order, so the file holds the last.
  let writing: Promise<void> = Promise.resolve();
  let writes = 0;

  const write = async (text: string) => {
    writes += 1;
    const temporary = `${path}.${process.pid}.${writes}.tmp`;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(temporary, text);
      await rename(temporary, path);
    } catch (error) {
      console.error(`Setlist server: could not keep the ProPresenter playlist picks in ${path}`, error);
    }
  };

  return {
    async load() {
      let text: string;
      try {
        text = await readFile(path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`Setlist server: could not read the ProPresenter playlist picks in ${path}`, error);
        return;
      }
      try {
        entries = parse(JSON.parse(text));
      } catch (error) {
        console.error(`Setlist server: the ProPresenter playlist picks in ${path} could not be read, so every set asks for a pick again`, error);
      }
    },
    get(set) {
      const key = keyOf(songsOf(set));
      const entry = entries.find((candidate) => keyOf(candidate.songs) === key);
      return entry ? { ...entry.playlist } : null;
    },
    save(set, playlist) {
      const songs = songsOf(set);
      const key = keyOf(songs);
      entries = [...entries.filter((entry) => keyOf(entry.songs) !== key), { songs, playlist: { id: playlist.id, name: playlist.name } }].slice(-KEPT_SETS);
      const text = `${JSON.stringify({ sets: entries }, null, 2)}\n`;
      writing = writing.then(() => write(text));
      return writing;
    },
  };
}

// The file's sets, each checked; a file of another shape throws.
function parse(value: unknown): Entry[] {
  const sets = (value as { sets?: unknown } | null)?.sets;
  if (!Array.isArray(sets)) throw new Error('The file has no "sets" list.');
  return sets.map((entry: unknown) => {
    const { songs, playlist } = (entry ?? {}) as { songs?: unknown; playlist?: { id?: unknown; name?: unknown } };
    const good =
      Array.isArray(songs) &&
      songs.every((song: { number?: unknown; title?: unknown }) => Number.isInteger(song?.number) && (typeof song?.title === 'string' || song?.title === null)) &&
      typeof playlist?.id === 'string' &&
      typeof playlist.name === 'string';
    if (!good) throw new Error('A set in the file is not a list of songs with a playlist.');
    return entry as Entry;
  });
}
