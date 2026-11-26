import { listed, songFolders, unreadableLibrary, type LibraryFolders } from './library.ts';
import { sameName } from './name-rule.ts';
import { isKey, KEY_GRAMMAR, sameKey, songKey, songNoteKey } from './pads.ts';
import type { PlanSong } from './plan-reader.ts';
import type { Skipped } from './plan-transitions.ts';
import { songTitle } from './song.ts';

// Each plan song's library folder: the folders whose title, the text before the folder name's first hyphen, is the plan
// song's title under the name rule, and among those the one whose folder name writes the plan's key, an enharmonic
// spelling being the same key (sameKey). Each song that has no one folder is one problem, checked in this order: no
// folder of its title, no key in the plan (never a folder picked without one, even when the title has one folder), a
// plan key that is not a note name (isKey) as read (planKey), no folder in the plan's key, and two or more folders in it. Every song's problem is reported, in plan order, before the
// build stops. A song --skip leaves out (skipped, by position from 1) gets no folder and no problem, so the folders are
// those of the songs kept, in plan order. An unreadable library is its one problem.
export async function planFolders(
  folders: LibraryFolders,
  songs: PlanSong[],
  skipped: Skipped,
): Promise<{ ok: true; folders: string[] } | { ok: false; problems: string[] }> {
  const picked = await pickFolders(folders, songs, skipped);
  if (!picked.ok) return { ok: false, problems: [picked.problem] };
  const picks = picked.picks.filter((pick) => pick !== undefined);
  const problems = picks.flatMap((pick) => (pick.ok ? [] : [pick.problem]));
  return problems.length === 0 ? { ok: true, folders: picks.flatMap((pick) => (pick.ok ? [pick.folder] : [])) } : { ok: false, problems };
}

// One plan song's folder, or its problem.
export type FolderPick = { ok: true; folder: string } | { ok: false; problem: string };

// Each plan song's folder or its problem, by planFolders's rule and wording, in plan order, so a listing of the plan can
// show every song's, and undefined for a song --skip leaves out (skipped); or the unreadable library's one problem.
export async function pickFolders(
  folders: LibraryFolders,
  songs: PlanSong[],
  skipped: Skipped,
): Promise<{ ok: true; picks: (FolderPick | undefined)[] } | { ok: false; problem: string }> {
  const library = await songFolders(folders);
  if (library === undefined) return { ok: false, problem: unreadableLibrary(folders.library) };
  return { ok: true, picks: songs.map((song, index) => (skipped.has(index + 1) ? undefined : pickFolder(folders.library, library, song, index + 1))) };
}

// A song with no folder of its title may be one the band plays with no track, such as a sung tag, so its problem names
// --skip, which leaves it out, as a fix (setlist-controller#31).
function pickFolder(libraryPath: string, library: string[], song: PlanSong, position: number): FolderPick {
  const titled = library.filter((folder) => sameName(songTitle(folder), song.title));
  if (titled.length === 0) return { ok: false, problem: `"${song.title}" has no song folder in ${libraryPath}. To leave it out of the set, give --skip ${position}.` };
  if (song.key === undefined) {
    return { ok: false, problem: `"${song.title}" has no key in the plan, and ${libraryPath} has it in ${keysOf(titled)}. Give it a key in the plan.` };
  }
  if (!isKey(song.key)) return { ok: false, problem: `"${song.title}" is planned in ${song.key}, which is not a key. ${KEY_GRAMMAR} Give it a key in the plan.` };
  const matches = titled.filter((folder) => sameKey(songKey(folder), song.key));
  const [folder] = matches;
  if (folder === undefined) return { ok: false, problem: `"${song.title}" is planned in ${song.key}, and ${libraryPath} has it only in ${keysOf(titled)}.` };
  if (matches.length === 1) return { ok: true, folder };
  return { ok: false, problem: `"${song.title}" in ${song.key} has ${matches.length} song folders in ${libraryPath}; keep one:${listed(matches)}` };
}

// The keys `folders` are in, as a problem names them, in folder order, joined `C, D and E`: each distinct note-name key a
// folder name writes (songNoteKey) once, and a folder whose name writes a key that is not a note name by its folder name
// and that key, `Odd-x-e-70.00bpm (its folder name's key, "e", is not a note name)`, since its name is what to fix. Then
// the folders whose names write no key, by folder name, since that is what to fix too: `A-x, whose name writes no key`,
// or `A-x and A-y, whose names write no key`, after any keys as `D, and in A-x, whose name writes no key`. The words "no
// key" never stand in for a key.
function keysOf(folders: string[]): string {
  const keys = [
    ...new Set(
      folders.flatMap((folder) => {
        const reading = songNoteKey(folder);
        if (reading.ok) return [reading.key];
        return reading.written === undefined ? [] : [`${folder} (its folder name's key, "${reading.written}", is not a note name)`];
      }),
    ),
  ];
  const keyless = folders.filter((folder) => songKey(folder) === undefined);
  const named = keyless.length === 0 ? undefined : `${joined(keyless)}, whose ${keyless.length === 1 ? 'name writes' : 'names write'} no key`;
  if (named === undefined) return joined(keys);
  return keys.length === 0 ? named : `${joined(keys)}, and in ${named}`;
}

// `items` joined as a problem lists them: `C`, `C and D`, `C, D and E`.
function joined(items: string[]): string {
  const last = items.at(-1) ?? '';
  return items.length <= 1 ? last : `${items.slice(0, -1).join(', ')} and ${last}`;
}
