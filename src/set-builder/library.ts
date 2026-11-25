import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

// Finding the songs in the library by short name. A short name matches a song folder when it is a case-insensitive
// part of the folder's name, except that a short name that is one folder's whole name, in any letter case, matches that
// folder alone, whatever longer folder names hold it, as a Finder duplicate's `<name> copy` does. The song folders are the folders directly in the library, or linked into it, except
// _template, which holds the template, and _pads, which holds the pad files, neither ever a song, and the pads folder a
// build or a listing names, when it sits directly in the library; a file, such as the .DS_Store Finder leaves, is no
// song folder. The three are matched by their whole name in any letter case, as the Mac's disk opens them and as pad file
// names are matched, so _Pads is no song either. On a disk that minds letter case, the wider rule only hides a folder
// named like a reserved one, which no song is.

// The library's folder that holds the template, where the command looks for it by default.
export const TEMPLATE_FOLDER = '_template';

// The library's folder that holds the pad files, one WAV per key, where a build looks for them by default.
export const PADS_FOLDER = '_pads';

// A short name's one song folder, or the problem that stops the build on it.
export type SongMatch = { ok: true; folder: string } | { ok: false; problem: string };

// The song library a build or a listing reads, and the pads folder it names, when it names one. The two travel together,
// since the pads folder defaults to the library's _pads and, directly in the library, is never a song.
export type LibraryFolders = { library: string; pads?: string };

// The folder the pad files are read from, as an absolute path: `pads` when one is named, and otherwise the library's
// _pads.
export function padsFolder({ library, pads }: LibraryFolders): string {
  return resolve(pads ?? join(library, PADS_FOLDER));
}

// The library's song folders, sorted as the build matches and lists them; or undefined when the library cannot be
// listed. `pads` is the pads folder a build or a listing names: directly in the library, it is never a song, whatever its
// name. The reserved folders are left out by their whole name in any letter case, as the Mac's disk opens them.
export async function songFolders({ library, pads }: LibraryFolders): Promise<string[] | undefined> {
  const entries = await readdir(library, { withFileTypes: true }).catch(() => undefined);
  if (entries === undefined) return undefined;
  const padsUsed = padsFolder({ library, pads });
  const reserved = [TEMPLATE_FOLDER, PADS_FOLDER, ...(dirname(padsUsed).toLowerCase() === resolve(library).toLowerCase() ? [basename(padsUsed)] : [])].map((name) => name.toLowerCase());
  return (await Promise.all(entries.map(async (entry) => ((await isFolder(library, entry)) ? [entry.name] : []))))
    .flat()
    .filter((name) => !reserved.includes(name.toLowerCase()))
    .toSorted((a, b) => a.localeCompare(b));
}

// The folders of `folders` that `name` names: the one folder whose whole name it is, letter case ignored, when exactly one
// is; and otherwise those it is a part of, letter case ignored. Two folders whose whole name it is, which only a disk that
// minds letter case can hold, are both parts it names, so a build still stops and lists them.
export function foldersNamed(folders: string[], name: string): string[] {
  const key = nameKey(name);
  const whole = folders.filter((folder) => nameKey(folder) === key);
  if (whole.length === 1) return whole;
  return folders.filter((folder) => nameKey(folder).includes(key));
}

// A name as the matching compares it, letter case ignored: one rule for a whole name and a part alike.
function nameKey(name: string): string {
  return name.toLowerCase();
}

// The problem a library that cannot be listed gives, once, in its songs' place.
export function unreadableLibrary(library: string): string {
  return `Cannot read the song library ${library}.`;
}

// Each name's match, in the order named; or, when the library cannot be listed (a mistyped --library), its one problem,
// since every name would fail on it alike. `pads` is the pads folder the build names, when it names one (songFolders).
export async function matchSongs(
  { library, pads }: LibraryFolders,
  names: string[],
): Promise<{ ok: true; matches: SongMatch[] } | { ok: false; problems: string[] }> {
  const folders = await songFolders({ library, pads });
  if (folders === undefined) return { ok: false, problems: [unreadableLibrary(library)] };
  return {
    ok: true,
    matches: names.map((name): SongMatch => {
      const named = foldersNamed(folders, name);
      const [folder] = named;
      if (folder === undefined) return { ok: false, problem: `"${name}" matches no song folder in ${library}. The song folders are:${listed(folders)}` };
      if (named.length > 1) return { ok: false, problem: `"${name}" matches ${named.length} song folders; name one more fully:${listed(named)}` };
      return { ok: true, folder };
    }),
  };
}

// A folder, or a symbolic link to one, as a song folder kept on another drive may be. A link to a file, or to nothing, is
// no folder.
async function isFolder(library: string, entry: Dirent): Promise<boolean> {
  if (!entry.isSymbolicLink()) return entry.isDirectory();
  return (await stat(join(library, entry.name)).catch(() => undefined))?.isDirectory() === true;
}

// Folders as a problem lists them, one per line, indented two spaces: a typed command's problems, and a plan's two
// folders in its key.
export function listed(folders: string[]): string {
  return folders.map((folder) => `\n  ${folder}`).join('');
}
