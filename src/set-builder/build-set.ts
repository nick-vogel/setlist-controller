import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { child, readAls, valueOf, writeAls, type AlsDocument } from './als.ts';
import { audioCopies, audioProblems, carryOver, copyAudio, copyPads, copyProjectInfo, keepReplacedSet } from './audio.ts';
import { introProblems, overlapProblems, padProblems, padTrackProblems, stemProblems, templateProblems } from './checks.ts';
import { matchSongs, padsFolder, type SongMatch } from './library.ts';
import { timeSignature } from './meter.ts';
import { applyLiveEdits, type LiveEdits, type LocatorCarry } from './live-edits.ts';
import { isKey, readPads, type Pad, type PadsReading } from './pads.ts';
import { buildRecipe, SET_RECIPE_FILE, writeRecipe, type RecipeExtras } from './recipe.ts';
import { mainEvents, readSong, type Song, type SongReading } from './song.ts';
import { sharedTargetNames, templateTargets, type Target } from './template.ts';
import type { SongDurations } from '../shared/set-manifest.ts';
import { setDurations } from './set-durations.ts';
import { placeSongs, type PlacedSong } from './timeline.ts';
import { writeSet } from './write-set.ts';

// The set builder's one entry point, buildSet, and its checks alone, setProblems, which --plan --list runs. The command
// (main.ts) and the tests drive these functions; the pieces they call (finding each song in the library, finding the
// template's targets, reading a song and the pad files, checking the template, the songs and their audio against the
// stem map and each other, placing the songs on the timeline, writing the set, copying the audio and the pads) stay
// internal.

// Each template group or single-track name, mapped to the exact MultiTracks stem names it takes.
export type StemMap = Record<string, string[]>;

// How one song hands off to the next. A gap: the next song starts 4 bars after the song ends. An overlap: the next
// song's Count Off starts on the song's Ending, while the song's stems, but its click and guide, ring on. A pad: the pad
// file in its key starts on the song's Ending, under its last bars, and plays on through a 60 s Pad section after the
// song's audio, with the click at the next song's tempo, and the next song's Count Off starts at its end. A pad's key is
// a note name (isKey), its own when it is given one, and otherwise the next song's key. A pad may also follow the last
// song: its Pad section holds the song's own starting tempo and meter, its key is the song's own by default, and the set
// ends after a fade at its end.
export type Transition = { type: 'gap' } | { type: 'overlap' } | { type: 'pad'; key?: string };

// The transition after a song as the summary shows it: a pad with the key it is asked to play in, its own or its song's.
export type SummaryTransition = Exclude<Transition, { type: 'pad' }> | { type: 'pad'; key: string };

// What the build reads and checks: every input but where it writes the set. --plan --list checks a plan's songs with it
// (setProblems). The listing learns the output root, but these checks never take it, so a set folder that already exists
// is never one of the build's problems in the listing; the listing reports it as its own line.
export type CheckOptions = {
  library: string;
  template: string;
  stemMap: StemMap;
  // The songs' short names, in service order: each a case-insensitive part of one song folder's name, or its whole name
  // in any letter case, which names that folder even when longer folder names hold it.
  songs: string[];
  // The transition after each song position, counted from 1: `{ 1: { type: 'overlap' } }` overlaps song 1 into song
  // 2. A position left out is a gap. Only a pad may follow the last song.
  transitions?: Partial<Record<number, Transition>>;
  // The folder of pad files, one WAV per key named by its key (`A.wav`); `<library>/_pads` by default. A build with no
  // pad never reads it.
  pads?: string;
};

export type BuildOptions = CheckOptions & {
  // The set's date, YYYY-MM-DD.
  date: string;
  outputRoot: string;
  // Replace the set folder for the date when it already exists. Without it, an existing folder stops the build.
  replace?: boolean;
  // With replace, an edit's own: every top-level entry of the old set folder the new project does not hold is carried
  // into it, and the replaced .als is kept in its Backup folder, so an edit loses nothing of the set it did not write.
  carryOver?: boolean;
  // Optional metadata recorded into set-recipe.json alongside the built set.
  recipe?: RecipeExtras;
  // Optional preserved Live edits (untouched songs' locators, track mixer volumes, clip volumes) to reapply after
  // materializing the set.
  liveEdits?: { edits: LiveEdits } & Omit<LocatorCarry, 'placed'>;
};

// One song of a built set, as the command's summary shows it.
export type SongSummary = {
  folder: string;
  title: string;
  // The bar of the built set the song starts on, from 1.
  startBar: number;
  // The tempo, in BPM, and the time signature, written `6/8`, the song starts on.
  tempo: number;
  meter: string;
  // The transition after the song, on every song but the last, and on the last song when a pad follows it.
  transition?: SummaryTransition;
};

// A built set's songs as the summary shows them, and how long each plays, in set order, for the set manifest.
export type BuildResult = { ok: true; setPath: string; songs: SongSummary[]; durations: SongDurations[] } | { ok: false; problems: string[] };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The set's name for its date, `<date> <weekday>`, which names both its folder and its .als: `2026-10-18 Sunday`,
// `2026-12-24 Thursday`. The weekday is the date's own, read at midnight UTC, so the Mac's time zone never moves it.
export function setName(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day.getTime()) || !day.toISOString().startsWith(date)) {
    throw new Error(`${date} is not a real date written YYYY-MM-DD.`);
  }
  return `${date} ${WEEKDAYS[day.getUTCDay()]}`;
}

// The set folder for the date under the output root, `<output root>/<date> <weekday>`: where the build writes the set,
// and the folder --plan --list looks for.
export function setFolder(outputRoot: string, date: string): string {
  return join(outputRoot, setName(date));
}

// Every input is read and checked before anything is written, and every problem found comes back in one result: the
// problems setProblems gives, in its order, then a set folder that already exists. A build with a problem writes nothing.
export async function buildSet(options: BuildOptions): Promise<BuildResult> {
  checkInputs(options);
  const name = setName(options.date);
  const folder = setFolder(options.outputRoot, options.date);
  const setPath = join(folder, `${name}.als`);
  const existing = existsSync(folder) && !options.replace ? [`${folder} already exists. Build with --replace "${folder}" to replace it.`] : [];
  const { problems, inputs } = await readInputs(options);
  if (inputs === undefined || problems.length > 0 || existing.length > 0) return { ok: false, problems: [...problems, ...existing] };
  const { set, targets, songs, padReading } = inputs;
  const transitions = options.transitions ?? {};
  const { pads: padsRead } = padReading;
  const padFiles = Object.fromEntries(Object.entries(padsRead).map(([position, pad]) => [position, pad.file]));
  const placed = placeSongs(songs, transitions);
  writeSet(set, targets, placed, options.stemMap, { projectFolder: folder }, padFiles);
  if (options.liveEdits !== undefined) {
    const { edits, untouched, boundary, oldStarts } = options.liveEdits;
    applyLiveEdits(set, edits, { untouched, boundary, oldStarts, placed });
  }
  const copies = audioCopies(songs);
  const recipe = buildRecipe({
    date: options.date,
    library: options.library,
    template: options.template,
    outputRoot: options.outputRoot,
    stemMap: options.stemMap,
    pads: options.pads,
    songs: placed.map(({ song, offset }) => ({ folder: song.folder, title: song.title, start: offset })),
    transitions,
    extras: options.recipe,
  });
  // Nothing is written until every song is read and placed. The project folder must be new, so a build never
  // writes into one that exists, and the set is written once every file it refers to is in place, then the recipe beside
  // it, then, for an edit (carryOver), what the old set folder holds that the new project does not.
  const writeProject = async (into: string) => {
    await copyProjectInfo(options.library, songs, into);
    await copyAudio(options.library, into, copies);
    await copyPads(into, Object.values(padFiles));
    await writeAls(join(into, `${name}.als`), set);
    await writeRecipe(join(into, SET_RECIPE_FILE), recipe);
    if (options.carryOver === true && existsSync(folder)) {
      await carryOver(folder, into);
      await keepReplacedSet(setPath, into, name);
    }
  };
  await mkdir(options.outputRoot, { recursive: true });
  if (options.replace) {
    await replaceFolder(folder, writeProject);
  } else {
    await mkdir(folder);
    try {
      await writeProject(folder);
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
  }
  return { ok: true, setPath, songs: placed.map((song) => summary(song, padsRead)), durations: setDurations(set) };
}

// Every problem the build would stop on but a set folder that already exists, which --plan --list reports as its own
// line, read and checked as buildSet does and in its order, with nothing written: the template's first, a template with
// no PAD track for a build that asks for a pad last among them, then each song's in service order (a name that matches no one song folder gives its problem in the
// song's place), then each overlap's in service order, then each song an overlap or a pad goes into that has no section
// after its Count Off, in service order, then each pad's in service order, then each pad after a song with no Ending,
// and each pad file too short for its clip, in service order (padProblems), then the audio files the songs would copy to
// one place. A library that cannot be listed gives its one problem in the songs' place, and no song is read. It throws as
// the build does: on no song, a transition at no song position, and a template it cannot read.
export async function setProblems(options: CheckOptions): Promise<string[]> {
  checkInputs(options);
  return (await readInputs(options)).problems;
}

// What the build writes from, once every input is read: the template, its targets, the songs read in service order, and
// the pad files.
type Inputs = { set: AlsDocument; targets: Map<string, Target>; songs: Song[]; padReading: PadsReading };

// The song list and the transitions, which a build or a check of the set cannot go on without.
function checkInputs(options: CheckOptions): void {
  if (options.songs.length === 0) throw new Error('The build needs at least one song.');
  checkTransitions(options);
}

// Every input read, with the problems found (setProblems gives their order), and the inputs the build writes from;
// none when the library cannot be listed.
async function readInputs(options: CheckOptions): Promise<{ problems: string[]; inputs?: Inputs }> {
  const pads = padsFolder(options);
  const found = await matchSongs(options, options.songs);
  if (!found.ok) return { problems: [...(await readableTemplateProblems(options)), ...found.problems] };
  const { matches } = found;
  const set = await readAls(options.template);
  const liveSet = child(set.root, 'LiveSet');
  const targets = templateTargets(liveSet);
  // A song folder is read once, however often the service names it, by one name or two, so its problems come back once.
  // A name that matches no one folder stands in the service with its one problem, also once. So a reading is keyed by its
  // folder, or by the name's problem when the name matched none.
  const readingKey = (match: SongMatch) => (match.ok ? match.folder : match.problem);
  const toRead = new Map(matches.map((match) => [readingKey(match), match]));
  const readings = new Map(
    await Promise.all([...toRead].map(async ([key, match]) => [key, await readMatch(options.library, match)] as const)),
  );
  // The song at each position, or undefined where the name matched no song or its song could not be read.
  const service = matches.map((match) => readings.get(readingKey(match))?.song);
  const songs = service.filter((song) => song !== undefined);
  const transitions = options.transitions ?? {};
  const padReading = await readPads(pads, service, transitions);
  const problems = [
    ...templateProblems(targets, options.stemMap, sharedTargetNames(liveSet)),
    ...padTrackProblems(liveSet, transitions),
    ...[...readings.values()].flatMap(({ song, problems }) => (song ? [...problems, ...stemProblems(song, targets, options.stemMap)] : problems)),
    ...overlapProblems(service, transitions, targets, options.stemMap),
    ...introProblems(service, transitions),
    ...padReading.problems,
    ...padProblems(service, transitions, padReading.pads),
    ...audioProblems(songs),
  ];
  return { problems, inputs: { set, targets, songs, padReading } };
}

// A transition belongs to a song position that has a song after it, from 1 to the second-to-last song, but a pad, which
// may also follow the last song. A pad's own key is a note name.
function checkTransitions({ songs, transitions = {} }: CheckOptions): void {
  for (const [key, transition] of Object.entries(transitions)) {
    const position = Number(key);
    const last = transition?.type === 'pad' ? songs.length : songs.length - 1;
    if (!Number.isInteger(position) || position < 1 || position > last) {
      throw new Error(`A transition after song ${key} needs a song position from 1 to ${last}.`);
    }
    if (transition?.type === 'pad' && transition.key !== undefined && !isKey(transition.key)) {
      throw new Error(`The pad after song ${key} is in "${transition.key}", which is not a note name.`);
    }
  }
}

// A build that replaces writes the new project into a hidden folder beside the old one, and only once it is whole puts
// it in the old folder's place and removes the old folder. The new set is in place by then, so a file that cannot be
// removed leaves the hidden folder behind rather than failing the build. For a full --replace build, nothing of the old
// set (its audio, a file added by hand, Live's Backup folder) is left among the new one; an edit opts in to carryOver
// inside writeProject to clone untouched entries and the replaced .als across. A build that fails part way through
// writing, such as on a WAV the library holds but cannot read, removes what it wrote and leaves the old set as it was.
async function replaceFolder(folder: string, writeProject: (into: string) => Promise<void>): Promise<void> {
  const work = await mkdtemp(join(dirname(folder), `.${basename(folder)} replacing `));
  const next = join(work, 'new');
  try {
    await mkdir(next);
    await writeProject(next);
  } catch (error) {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  if (existsSync(folder)) await rename(folder, join(work, 'old'));
  await rename(next, folder);
  await rm(work, { recursive: true, force: true }).catch(() => undefined);
}

// The template's problems, for a build whose library cannot be listed. The default template lives in the library, so a
// template that cannot be read then adds none: the library's problem names the cause.
async function readableTemplateProblems({ template, stemMap, transitions = {} }: CheckOptions): Promise<string[]> {
  const set = await readAls(template).catch(() => undefined);
  if (set === undefined) return [];
  const liveSet = child(set.root, 'LiveSet');
  return [...templateProblems(templateTargets(liveSet), stemMap, sharedTargetNames(liveSet)), ...padTrackProblems(liveSet, transitions)];
}

// The song's starting tempo is the value it starts on at beat 0 (mainEvents); its starting meter is the one the timeline
// placed it by. The last song has no transition after it unless a pad follows it; a pad carries the key it is asked to
// play in.
function summary({ song, number, bar, meter, transition }: PlacedSong, pads: Record<number, Pad>): SongSummary {
  const tempo = Number(valueOf(mainEvents(song, 'Tempo').start));
  const started = { folder: song.folder, title: song.title, startBar: bar, tempo, meter: timeSignature(meter.start) };
  if (!transition) return started;
  if (transition.type !== 'pad') return { ...started, transition };
  const pad = pads[number];
  if (!pad) throw new Error(`The pad after song ${number} has no pad file.`);
  return { ...started, transition: { type: 'pad', key: pad.key } };
}

// The song a name matched, as read, or the name's own problem and no song.
function readMatch(library: string, match: SongMatch): Promise<SongReading> {
  if (!match.ok) return Promise.resolve({ problems: [match.problem] });
  return readSong(library, match.folder).catch(unreadable(match.folder));
}

// A song whose set cannot be read, such as one that is not a gzipped Live set, gives its one problem and no song, so
// the other inputs' problems still come back with it.
function unreadable(folder: string): (error: unknown) => SongReading {
  return (error) => ({ problems: [`${folder}: the song could not be read: ${error instanceof Error ? error.message : String(error)}`] });
}
