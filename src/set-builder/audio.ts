import { constants, existsSync } from 'node:fs';
import { cp, mkdir, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import type { Element } from './als.ts';
import { padProjectFile, type PadFile } from './pads.ts';
import { fileInSong, type Song } from './song.ts';
import { saveTime } from './weekly-show.ts';

// The built set is a self-contained Live project: each song's audio is copied into Songs/<title>/ in the
// project folder, so that songs whose files share a name ("Bass.wav", "Click Track.wav") never collide, and each pad
// file into Songs/_pads/.

// Where a clip's WAV is copied, as the path from the project folder, written the way Live writes it. readSong has
// already stopped the build on a clip whose file is outside its song's folder, so the throw is a guard the build never
// reaches.
export function projectFile(song: Song, clip: Element): string {
  const file = fileInSong(clip);
  if (file === undefined) throw new Error(`A clip in ${song.folder} does not refer to a file inside the song's folder.`);
  return audioCopy(song, file).to;
}

// One file to copy: `from` is the path from the library folder, `to` the path from the project folder.
export type AudioCopy = { from: string; to: string };

function audioCopy(song: Song, file: string): AudioCopy {
  return { from: join(song.folder, file), to: `Songs/${song.title}/${basename(file)}` };
}

// One copy for each of the songs' clips, in service order. A clip whose file is outside its song's folder has none:
// readSong stops the build on it first.
function clipCopies(songs: Song[]): AudioCopy[] {
  return songs.flatMap((song) =>
    song.tracks
      .flatMap((track) => track.clips)
      .flatMap((clip) => {
        const file = fileInSong(clip);
        return file === undefined ? [] : [audioCopy(song, file)];
      }),
  );
}

// Every WAV the songs' clips refer to, once each, with the place its copy goes in the project. A song named twice
// in the service is copied once, and both point at that copy. buildSet has already stopped on two different files
// bound for one place (audioProblems).
export function audioCopies(songs: Song[]): AudioCopy[] {
  return [...new Map(clipCopies(songs).map(({ from, to }) => [to, from]))].map(([to, from]) => ({ from, to }));
}

// Each place in the project two different files are bound for, named as the first file bound there has it: two song
// folders with one title, or two files with one name in a song, would play each other's audio.
export function audioProblems(songs: Song[]): string[] {
  const firsts = new Map<string, AudioCopy>();
  const problems = new Set<string>();
  for (const copy of clipCopies(songs)) {
    const first = firsts.get(onDisk(copy.to));
    if (first === undefined) firsts.set(onDisk(copy.to), copy);
    else if (first.from !== copy.from) {
      problems.add(
        `${first.to} would hold two different files, ${first.from} and ${copy.from}. Each song's audio is copied to Songs/<title>/ by file name, so one set cannot hold two song folders with one title.`,
      );
    }
  }
  return [...problems];
}

// A place in the project as the disk tells places apart. APFS, as macOS formats it, ignores letter case and Unicode
// normalization in a name, so "Goodness of God" and "goodness of God" are one folder there.
function onDisk(place: string): string {
  return place.normalize('NFC').toLowerCase();
}

// A copy never replaces a file, keeps the library file's timestamps, so its modification time still matches the
// clip's LastModDate, and is a copy-on-write clone where the disk allows one, which on APFS takes no time and no
// space.
const COPY = { force: false, errorOnExist: true, preserveTimestamps: true, mode: constants.COPYFILE_FICLONE };

// Copies each WAV from the library into the project folder, with its .asd analysis file when the library has
// one. Not every WAV has one (Fall Like Rain refers to ten without), and Live writes a new one for a WAV that
// has none.
export async function copyAudio(library: string, projectFolder: string, copies: AudioCopy[]): Promise<void> {
  for (const { from, to } of copies) {
    await cp(join(library, from), join(projectFolder, to), COPY);
    const analysis = join(library, `${from}.asd`);
    if (existsSync(analysis)) await cp(analysis, join(projectFolder, `${to}.asd`), COPY);
  }
}

// Copies each pad file the set plays from the pads folder into the project, once each, at its place there
// (padProjectFile). Its .asd analysis file is not copied, even when the pads folder has one: Live writes one for a WAV it
// has never seen.
export async function copyPads(projectFolder: string, pads: PadFile[]): Promise<void> {
  for (const pad of new Map(pads.map((pad) => [pad.path, pad])).values()) {
    await cp(pad.path, join(projectFolder, padProjectFile(pad)), COPY);
  }
}

const PROJECT_INFO = 'Ableton Project Info';

// Live sees a folder as a project by its Ableton Project Info folder. The project takes the first song's, whole;
// when the first song has none, it gets an empty one, as Live 12 makes for a new project.
export async function copyProjectInfo(library: string, songs: Song[], projectFolder: string): Promise<void> {
  const [first] = songs;
  const source = first && join(library, first.folder, PROJECT_INFO);
  const target = join(projectFolder, PROJECT_INFO);
  if (source && existsSync(source)) await cp(source, target, { ...COPY, recursive: true });
  else await mkdir(target);
}

export async function carryOver(fromFolder: string, projectFolder: string): Promise<void> {
  for (const name of await readdir(fromFolder)) {
    if (!existsSync(join(projectFolder, name))) await cp(join(fromFolder, name), join(projectFolder, name), { ...COPY, recursive: true });
  }
}

export async function keepReplacedSet(alsPath: string, projectFolder: string, name: string, now: () => Date = () => new Date()): Promise<void> {
  await mkdir(join(projectFolder, 'Backup'), { recursive: true });
  for (;;) {
    const at = now();
    const kept = await cp(alsPath, join(projectFolder, 'Backup', `${name} (before edit ${saveTime(at)}).als`), COPY).then(
      () => true,
      (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ERR_FS_CP_EEXIST') return false;
        throw error;
      },
    );
    if (kept) return;
    await wait(1000 - at.getMilliseconds());
  }
}
