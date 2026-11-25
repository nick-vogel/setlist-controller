import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readAls } from './als.ts';
import { buildSet, setFolder, setName, type SongSummary, type StemMap, type Transition } from './build-set.ts';
import { EOS_LIMITS, type EosLimits } from './eos.ts';
import { matchSongs } from './library.ts';
import { lightsStep } from './lights.ts';
import { extractLiveEdits } from './live-edits.ts';
import { PROPRESENTER_AGAIN_MS, PROPRESENTER_TIMEOUT_MS } from './propresenter.ts';
import { readRecipe, readStemMapFile, updateRecipe, type RecipeSong, type RecipeSongChart, type SetRecipe } from './recipe.ts';
import { buildManifest, writeSetManifest } from './set-manifest.ts';
import { songTitle } from './song.ts';
import { padAfterLast } from './timeline.ts';

// `build-set edit`: changes one song of an already-built set (swaps, adds or drops it) using
// its saved `set-recipe.json`, carrying every untouched song's locators, track mixer volumes and
// clip gains from the existing `.als` into the new one, and regenerating every target
// recorded in the recipe (`.als` + APFS-cloned audio/pads, `set-manifest.json`, and Eos lighting
// cues when `--lights` was used). Any validation error leaves all existing files untouched.

export const LIGHTS_UNRECORDED = "The lights are done, but the set's recipe cannot record them, so build-set edit will not relabel the cues:";

export const EDIT_USAGE = `Usage:
  pnpm build-set edit [<set folder>] [--date YYYY-MM-DD] [--output-root <folder>] --swap <song> <replacement>
  pnpm build-set edit [<set folder>] [--date YYYY-MM-DD] [--output-root <folder>] --add <song> [--at <pos>]
  pnpm build-set edit [<set folder>] [--date YYYY-MM-DD] [--output-root <folder>] --drop <song>`;

export type EditAction =
  | { kind: 'swap'; song: string; replacement: string }
  | { kind: 'add'; song: string; at?: number }
  | { kind: 'drop'; song: string };

export type EditOptions = {
  folder: string;
  action: EditAction;
  limits?: EosLimits;
  proPresenterTimeoutMs?: number;
  proPresenterAgainMs?: number;
};

export type EditResult =
  | {
      ok: true;
      date: string;
      setPath: string;
      songs: SongSummary[];
      warnings: string[];
      lightsLines: string[];
      lightsProblem?: string;
      manifestProblem?: string;
    }
  | { ok: false; problems: string[] };

// Resolves a song selector against the built set's current songs: either a 1-based position number
// or a case-insensitive title / folder name match (exact match wins over substring).
export function resolveRecipeSong(songs: RecipeSong[], query: string): { ok: true; position: number } | { ok: false; problem: string } {
  const trimmed = query.trim();
  if (trimmed === '') return { ok: false, problem: `Song selector cannot be empty. The set's songs are:${listedSongs(songs)}` };
  if (/^\d+$/.test(trimmed)) {
    const position = Number(trimmed);
    if (position < 1 || position > songs.length) {
      return { ok: false, problem: `Song position ${trimmed} is out of range; the set has ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}:${listedSongs(songs)}` };
    }
    return { ok: true, position };
  }
  const key = trimmed.toLowerCase();
  const exact = songs.flatMap((song, index) => (song.title.toLowerCase() === key || song.folder.toLowerCase() === key ? [index + 1] : []));
  if (exact.length === 1) return { ok: true, position: exact[0]! };
  const matches = exact.length > 1 ? exact : songs.flatMap((song, index) => (song.title.toLowerCase().includes(key) || song.folder.toLowerCase().includes(key) ? [index + 1] : []));
  if (matches.length === 0) {
    return { ok: false, problem: `"${query}" matches no song in this set. The set's songs are:${listedSongs(songs)}` };
  }
  if (matches.length > 1) {
    const named = matches.map((position) => `\n  ${position}. ${songs[position - 1]!.title} (${songs[position - 1]!.folder})`).join('');
    return { ok: false, problem: `"${query}" matches ${matches.length} songs in this set; name it by position (1-${songs.length}) or more fully:${named}` };
  }
  return { ok: true, position: matches[0]! };
}

export async function editSet(options: EditOptions): Promise<EditResult> {
  const folder = resolve(options.folder);
  const reading = await readRecipe(folder);
  if (!reading.ok) return { ok: false, problems: [reading.problem] };
  const recipe = reading.recipe;
  const expectedFolder = setFolder(dirname(folder), recipe.date);
  if (folder !== expectedFolder) {
    return { ok: false, problems: [`${folder} is not the set folder for ${recipe.date}, which is ${expectedFolder}. Run build-set edit on that folder.`] };
  }

  const name = setName(recipe.date);
  const existingAlsPath = join(folder, `${name}.als`);
  if (!existsSync(existingAlsPath)) {
    return { ok: false, problems: [`Existing set file ${existingAlsPath} was not found.`] };
  }

  let liveEdits;
  try {
    liveEdits = extractLiveEdits(await readAls(existingAlsPath));
  } catch (error) {
    return { ok: false, problems: [`Existing set file ${existingAlsPath} cannot be read: ${oneLine(error)}`] };
  }

  const planned = await planEdit(recipe, options.action);
  if (!planned.ok) return { ok: false, problems: planned.problems };

  let stemMap: StemMap;
  try {
    stemMap = recipe.stemMapPath !== undefined ? await readStemMapFile(recipe.stemMapPath) : recipe.stemMap!;
  } catch (error) {
    return { ok: false, problems: [oneLine(error)] };
  }

  const outputRoot = dirname(folder);
  const charts: (RecipeSongChart | undefined)[] = planned.songs.map((song) =>
    song.chartText === undefined ? undefined : { ...(song.chartKey === undefined ? {} : { chartKey: song.chartKey }), chartText: song.chartText },
  );

  const built = await buildSet({
    library: recipe.library,
    template: recipe.template,
    stemMap,
    songs: planned.songs.map((song) => song.folder),
    date: recipe.date,
    outputRoot,
    replace: true,
    carryOver: true,
    transitions: planned.transitions,
    pads: recipe.pads,
    recipe: {
      ...(recipe.stemMapPath === undefined ? {} : { stemMapPath: recipe.stemMapPath }),
      ...(recipe.setManifest === undefined ? {} : { setManifest: recipe.setManifest }),
      ...(recipe.showFolder === undefined ? {} : { showFolder: recipe.showFolder }),
      ...(recipe.plan === undefined ? {} : { plan: recipe.plan }),
      ...(recipe.lights === undefined ? {} : { lights: recipe.lights }),
      charts,
    },
    liveEdits: {
      edits: liveEdits,
      untouched: planned.untouched,
      boundary: planned.boundary,
      oldStarts: new Map(recipe.songs.map((song, index) => [index + 1, song.start])),
    },
  });

  if (!built.ok) return { ok: false, problems: built.problems };

  let manifestProblem: string | undefined;
  if (recipe.setManifest !== undefined) {
    const manifest = buildManifest(built.songs, charts);
    const err = await writeSetManifest(recipe.setManifest, manifest).then(() => undefined, oneLine);
    if (err !== undefined) {
      manifestProblem = `The set is updated, but the set manifest ${recipe.setManifest} cannot be written: ${err}. The chart view still shows the last manifest's charts.`;
    }
  }

  let lightsLines: string[] = [];
  let lightsProblem: string | undefined;
  if (recipe.lights !== undefined) {
    const run = await lightsStep({
      date: recipe.date,
      outputRoot,
      showFolder: recipe.lights.showFolder,
      connectionsConfig: recipe.lights.connectionsConfig,
      limits: options.limits ?? EOS_LIMITS,
      proPresenterTimeoutMs: options.proPresenterTimeoutMs ?? PROPRESENTER_TIMEOUT_MS,
      proPresenterAgainMs: options.proPresenterAgainMs ?? PROPRESENTER_AGAIN_MS,
      playlist: recipe.lights.playlist,
      previousTitles: recipe.lights.labelled ?? recipe.songs.map((song) => song.title),
    });
    lightsLines = run.lines;
    lightsProblem = run.problem;
    if (run.problem === undefined) {
      const { labelled } = run;
      lightsProblem = await updateRecipe(folder, (next) => (next.lights === undefined ? next : { ...next, lights: { ...next.lights, labelled } })).then(
        () => undefined,
        (error: unknown) => `${LIGHTS_UNRECORDED} ${oneLine(error)}`,
      );
    }
  }

  return {
    ok: true,
    date: recipe.date,
    setPath: built.setPath,
    songs: built.songs,
    warnings: planned.warnings,
    lightsLines,
    ...(lightsProblem === undefined ? {} : { lightsProblem }),
    ...(manifestProblem === undefined ? {} : { manifestProblem }),
  };
}

type PlannedEdit = {
  songs: Omit<RecipeSong, 'start'>[];
  transitions: Partial<Record<number, Transition>>;
  // Maps each untouched song's NEW 1-based song number to its OLD 1-based song number.
  untouched: Map<number, number>;
  boundary: Set<number>;
  warnings: string[];
};

async function planEdit(recipe: SetRecipe, action: EditAction): Promise<{ ok: true } & PlannedEdit | { ok: false; problems: string[] }> {
  const { songs, transitions } = recipe;

  if (action.kind === 'swap') {
    const target = resolveRecipeSong(songs, action.song);
    if (!target.ok) return { ok: false, problems: [target.problem] };
    const matched = await matchSongs({ library: recipe.library, pads: recipe.pads }, [action.replacement]);
    if (!matched.ok) return { ok: false, problems: matched.problems };
    const [replacement] = matched.matches;
    if (!replacement || !replacement.ok) return { ok: false, problems: [replacement?.problem ?? `"${action.replacement}" matched no song.`] };
    const nextSongs = songs.map((song, index) => (index + 1 === target.position ? { folder: replacement.folder, title: songTitle(replacement.folder) } : song));
    const untouched = new Map<number, number>();
    for (let position = 1; position <= songs.length; position++) {
      if (position !== target.position) untouched.set(position, position);
    }
    const nextTransitions = { ...transitions };
    const warnings =
      replacement.folder === songs[target.position - 1]!.folder
        ? [`Song ${target.position} is rebuilt from ${replacement.folder} in the library, so its locators and clip gains start as the library has them.`]
        : padKeyWarnings(nextTransitions, nextSongs, target.position, true);
    return { ok: true, songs: nextSongs, transitions: nextTransitions, untouched, boundary: boundaryBefore(target.position, { transitions, count: songs.length }, { transitions: nextTransitions, count: nextSongs.length }), warnings };
  }

  if (action.kind === 'add') {
    const at = action.at ?? songs.length + 1;
    if (!Number.isInteger(at) || at < 1 || at > songs.length + 1) {
      return { ok: false, problems: [`--at must be a whole number from 1 to ${songs.length + 1}, not "${at}".`] };
    }
    const matched = await matchSongs({ library: recipe.library, pads: recipe.pads }, [action.song]);
    if (!matched.ok) return { ok: false, problems: matched.problems };
    const [added] = matched.matches;
    if (!added || !added.ok) return { ok: false, problems: [added?.problem ?? `"${action.song}" matched no song.`] };
    const nextSongs = [...songs.slice(0, at - 1), { folder: added.folder, title: songTitle(added.folder) }, ...songs.slice(at - 1)];
    const nextTransitions: Partial<Record<number, Transition>> = {};
    for (const [key, transition] of Object.entries(transitions)) {
      if (transition === undefined) continue;
      const position = Number(key);
      nextTransitions[position >= at ? position + 1 : position] = transition;
    }
    const untouched = new Map<number, number>();
    for (let oldPos = 1; oldPos <= songs.length; oldPos++) {
      untouched.set(oldPos >= at ? oldPos + 1 : oldPos, oldPos);
    }
    return { ok: true, songs: nextSongs, transitions: nextTransitions, untouched, boundary: boundaryBefore(at, { transitions, count: songs.length }, { transitions: nextTransitions, count: nextSongs.length }), warnings: padKeyWarnings(nextTransitions, nextSongs, at) };
  }

  const target = resolveRecipeSong(songs, action.song);
  if (!target.ok) return { ok: false, problems: [target.problem] };
  if (songs.length <= 1) {
    return { ok: false, problems: [`Cannot drop "${songs[0]!.title}" because it is the only song in the set.`] };
  }
  const nextSongs = songs.filter((_, index) => index + 1 !== target.position);
  const nextTransitions: Partial<Record<number, Transition>> = {};
  for (const [key, transition] of Object.entries(transitions)) {
    if (transition === undefined) continue;
    const position = Number(key);
    if (position === target.position) continue;
    const nextPos = position > target.position ? position - 1 : position;
    // An overlap cannot follow the new last song (only a pad can).
    if (nextPos === nextSongs.length && transition.type !== 'pad') continue;
    nextTransitions[nextPos] = transition;
  }
  const untouched = new Map<number, number>();
  for (let oldPos = 1; oldPos <= songs.length; oldPos++) {
    if (oldPos === target.position) continue;
    untouched.set(oldPos > target.position ? oldPos - 1 : oldPos, oldPos);
  }
  return {
    ok: true,
    songs: nextSongs,
    transitions: nextTransitions,
    untouched,
    boundary: boundaryBefore(target.position, { transitions, count: songs.length }, { transitions: nextTransitions, count: nextSongs.length }),
    warnings: padKeyWarnings(nextTransitions, nextSongs, target.position),
  };
}

function padKeyWarnings(transitions: Partial<Record<number, Transition>>, songs: { title: string }[], position: number, swap = false): string[] {
  const warnings: string[] = [];
  const pad = transitions[position - 1];
  if (pad?.type === 'pad' && pad.key !== undefined) {
    const next = songs[position - 1];
    warnings.push(`The pad after song ${position - 1} keeps its own key, ${pad.key}, and now ${next === undefined ? 'ends the set' : `leads into ${next.title}`}.`);
  }
  if (swap && position === songs.length) {
    const trailing = transitions[position];
    if (trailing?.type === 'pad' && trailing.key !== undefined) {
      warnings.push(`The pad after song ${position} keeps its own key, ${trailing.key}, and now follows ${songs[position - 1]!.title}.`);
    }
  }
  return warnings;
}

type PlacedSet = { transitions: Partial<Record<number, Transition>>; count: number };

function boundaryBefore(position: number, old: PlacedSet, next: PlacedSet): Set<number> {
  if (position <= 1) return new Set();
  const prev = position - 1;
  const beforeType = placedType(old, prev);
  const afterType = placedType(next, prev);
  return new Set(beforeType === 'pad' || afterType === 'pad' || beforeType !== afterType ? [prev] : []);
}

function placedType({ transitions, count }: PlacedSet, position: number): Transition['type'] {
  return (position === count ? padAfterLast(transitions[position]) : transitions[position])?.type ?? 'gap';
}

function listedSongs(songs: RecipeSong[]): string {
  return songs.map((song, index) => `\n  ${index + 1}. ${song.title} (${song.folder})`).join('');
}

function oneLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ');
}
