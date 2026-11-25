import { foldersNamed, songFolders, unreadableLibrary, type LibraryFolders } from './library.ts';
import { songNoteKey } from './pads.ts';
import { songTitle } from './song.ts';

// `pnpm build-set --list`: the library's song folders as the build matches them, each with a short name that names that
// one folder and the song's key as its folder name writes it (Em stays Em). It reads folder names only, never a song's
// set, and writes nothing.

// One song folder as the listing shows it.
export type ListedSong = {
  // A name the build matches to this one folder.
  shortName: string;
  // The song's key as its folder name writes it, when it is a note name (Em stays Em); undefined for a folder name with
  // no key, or a key that is no note name. Such a song still builds, but a pad cannot take its key from it by default.
  key?: string;
  folder: string;
};

// Each song folder, in the order the build matches them (songFolders); or the library's one problem when it cannot be
// listed, as a build gives it. The pads folder is the one a build would name.
export async function listSongs(libraryFolders: LibraryFolders): Promise<{ ok: true; songs: ListedSong[] } | { ok: false; problem: string }> {
  const folders = await songFolders(libraryFolders);
  if (folders === undefined) return { ok: false, problem: unreadableLibrary(libraryFolders.library) };
  return { ok: true, songs: folders.map((folder) => ({ shortName: shortName(folder, folders), key: listedKey(folder), folder })) };
}

// A song's line: its short name, quoted when it holds anything but lowercase letters and digits so that it goes onto a
// command as printed, its key or `no key`, and its folder name, two spaces apart:
// `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
export function songLine({ shortName, key, folder }: ListedSong): string {
  return [/^[a-z0-9]+$/.test(shortName) ? shortName : `"${shortName}"`, key ?? 'no key', folder].join('  ');
}

// The song's key from its folder name, when it is a note name (songNoteKey).
function listedKey(folder: string): string | undefined {
  const reading = songNoteKey(folder);
  return reading.ok ? reading.key : undefined;
}

// The first candidate that names `folder` alone among `folders`, one word winning over two: the title's lowercase words
// of three letters or more, from the last word to the first, then its shorter words, last to first, then its pairs of
// adjacent words, from the last pair to the first. A title's last word is most often its own noun, and a short word such
// as "of" reads badly on a command. A word is a title token, a run of non-space characters, with every character at its
// start and end that is no letter, mark or digit taken off, so `(live)` is `live` and `holy,` is `holy`, while `10,000`
// keeps its comma. A token that holds no letter or digit is no word, so a lone `&` or `+` in the title is no word, alone
// or in a pair. A pair is the title's own text from the start of one word to the end of the word in the next token, so
// `Holy, Holy` keeps its comma and its spacing and is always a part of the folder's name, which a name has to be to
// match it. When none names it alone, as for two downloads of one title, the short name is the whole folder name, which
// names that folder alone even when a longer folder name, such as a Finder copy's, holds it (foldersNamed); only two
// folders whose names differ in letter case alone, on a disk that minds letter case, share it. Every candidate is cut
// from the title, so one that names a single folder names `folder`; the check that it names `folder` itself stays, so
// that a listed short name can never build another song.
function shortName(folder: string, folders: string[]): string {
  const title = songTitle(folder).toLowerCase();
  const tokens = [...title.matchAll(/\S+/gu)].map(({ 0: token, index }) => {
    if (!/[\p{L}\p{N}]/u.test(token)) return undefined;
    const start = index + (/^[^\p{L}\p{M}\p{N}]*/u.exec(token)?.[0].length ?? 0);
    const end = index + token.length - (/[^\p{L}\p{M}\p{N}]*$/u.exec(token)?.[0].length ?? 0);
    return { start, end };
  });
  const words = tokens.flatMap((word) => (word === undefined ? [] : [title.slice(word.start, word.end)]));
  const pairs = tokens.slice(1).flatMap((second, index) => {
    const first = tokens[index];
    return first !== undefined && second !== undefined ? [title.slice(first.start, second.end)] : [];
  });
  const lastFirst = words.toReversed();
  const candidates = [...lastFirst.filter((word) => word.length >= 3), ...lastFirst.filter((word) => word.length < 3), ...pairs.toReversed()];
  const namesItAlone = (candidate: string) => {
    const named = foldersNamed(folders, candidate);
    return named.length === 1 && named[0] === folder;
  };
  return candidates.find(namesItAlone) ?? folder;
}
