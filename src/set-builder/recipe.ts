import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setName, type StemMap, type Transition } from './build-set.ts';
import { isKey } from './pads.ts';
import { writeJsonAtomic } from './set-manifest.ts';

// The saved build recipe, `set-recipe.json`, written beside every built `.als` so `build-set edit`
// knows the exact songs, transitions, library/template/stem-map/pads paths, and optional plan and
// lighting settings without re-typing flags or reaching Planning Center again.

export const SET_RECIPE_FILE = 'set-recipe.json';

export const DEFAULT_STEM_MAP_PATH = resolve(import.meta.dirname, '../../config/stem-map.json');

export type RecipeSong = {
  folder: string;
  title: string;
  // The song's start beat in the built set.
  start: number;
  chartKey?: string;
  chartText?: string;
};

export type RecipePlan = {
  serviceType: string;
  planId?: string;
};

export type RecipeLights = {
  showFolder: string;
  connectionsConfig: string;
  playlist?: string;
  // The song titles, in set order, that Eos took as its song cue labels on the last lights run that succeeded.
  labelled?: string[];
};

export type RecipeSongChart = {
  chartKey?: string;
  chartText?: string;
};

// Extra metadata passed from the CLI (or editSet) into buildSet so set-recipe.json captures
// every output target and option alongside the resolved songs and transitions.
export type RecipeExtras = {
  stemMapPath?: string;
  setManifest?: string;
  showFolder?: string;
  plan?: RecipePlan;
  lights?: RecipeLights;
  charts?: (RecipeSongChart | undefined)[];
};

export type SetRecipe = {
  version: 1;
  date: string;
  library: string;
  template: string;
  outputRoot: string;
  stemMapPath?: string;
  stemMap?: StemMap;
  pads?: string;
  setManifest?: string;
  showFolder?: string;
  songs: RecipeSong[];
  transitions: Partial<Record<number, Transition>>;
  plan?: RecipePlan;
  lights?: RecipeLights;
};

export function recipePath(folder: string): string {
  return join(folder, SET_RECIPE_FILE);
}

// Builds the recipe saved beside the built `.als`. Transitions keep only non-gap entries, matching
// BuildOptions['transitions']. When `stemMapPath` is not provided (a buildSet call that names no
// stem map file), the inline `stemMap` is stored so the recipe stays self-contained.
export function buildRecipe({
  date,
  library,
  template,
  outputRoot,
  stemMap,
  pads,
  songs,
  transitions = {},
  extras,
}: {
  date: string;
  library: string;
  template: string;
  outputRoot: string;
  stemMap: StemMap;
  pads?: string;
  songs: { folder: string; title: string; start: number }[];
  transitions?: Partial<Record<number, Transition>>;
  extras?: RecipeExtras;
}): SetRecipe {
  const normalizedTransitions: Partial<Record<number, Transition>> = {};
  for (const [key, transition] of Object.entries(transitions)) {
    if (transition === undefined || transition.type === 'gap') continue;
    normalizedTransitions[Number(key)] = transition.type === 'pad' && transition.key !== undefined ? { type: 'pad', key: transition.key } : { type: transition.type };
  }
  const recipeSongs: RecipeSong[] = songs.map(({ folder, title, start }, index) => {
    const chart = extras?.charts?.[index];
    return {
      folder,
      title,
      start,
      ...(chart?.chartText === undefined ? {} : { ...(chart.chartKey === undefined ? {} : { chartKey: chart.chartKey }), chartText: chart.chartText }),
    };
  });
  return {
    version: 1,
    date,
    library: resolve(library),
    template: resolve(template),
    outputRoot: resolve(outputRoot),
    ...(extras?.stemMapPath === undefined ? { stemMap } : { stemMapPath: resolve(extras.stemMapPath) }),
    ...(pads === undefined ? {} : { pads: resolve(pads) }),
    ...(extras?.setManifest === undefined ? {} : { setManifest: resolve(extras.setManifest) }),
    ...(extras?.showFolder === undefined ? {} : { showFolder: resolve(extras.showFolder) }),
    songs: recipeSongs,
    transitions: normalizedTransitions,
    ...(extras?.plan === undefined ? {} : { plan: extras.plan }),
    ...(extras?.lights === undefined ? {} : { lights: extras.lights }),
  };
}

export async function writeRecipe(path: string, recipe: SetRecipe): Promise<void> {
  await writeJsonAtomic(path, recipe);
}

export async function readRecipe(folder: string): Promise<{ ok: true; recipe: SetRecipe } | { ok: false; problem: string }> {
  const path = recipePath(folder);
  if (!existsSync(path)) {
    return { ok: false, problem: `No ${SET_RECIPE_FILE} found in ${folder}. Rebuild the set first so its recipe is saved.` };
  }
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    return { ok: false, problem: `${path} cannot be read: ${oneLine(error)}` };
  }
  return parseRecipe(text, path);
}

// Updates `<folder>/set-recipe.json` in place (atomically). Returns false when the folder holds no recipe. A recipe that
// does not parse, or a write that fails, throws.
export async function updateRecipe(folder: string, update: (recipe: SetRecipe) => SetRecipe): Promise<boolean> {
  const path = recipePath(folder);
  if (!existsSync(path)) return false;
  const reading = await readRecipe(folder);
  if (!reading.ok) throw new Error(reading.problem);
  await writeRecipe(path, update(reading.recipe));
  return true;
}

export function parseRecipe(text: string, path: string): { ok: true; recipe: SetRecipe } | { ok: false; problem: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, problem: `${path} is not valid JSON: ${oneLine(error)}` };
  }
  if (!isObject(raw)) return { ok: false, problem: `${path} must be a JSON object.` };
  if (raw.version !== 1) return { ok: false, problem: `${path} has unsupported version ${String(raw.version)}; expected 1.` };
  if (!isNonEmptyString(raw.date)) return { ok: false, problem: `${path} is missing a valid "date".` };
  try {
    setName(raw.date);
  } catch (error) {
    return { ok: false, problem: `${path} has an invalid "date": ${oneLine(error)}` };
  }
  for (const field of ['library', 'template', 'outputRoot'] as const) {
    if (!isNonEmptyString(raw[field])) return { ok: false, problem: `${path} is missing "${field}".` };
  }
  if (raw.stemMapPath !== undefined && !isNonEmptyString(raw.stemMapPath)) {
    return { ok: false, problem: `${path} has an invalid "stemMapPath".` };
  }
  let stemMap: StemMap | undefined;
  if (raw.stemMap !== undefined) {
    try {
      stemMap = stemMapShape(raw.stemMap, path);
    } catch (error) {
      return { ok: false, problem: oneLine(error) };
    }
  }
  if (raw.stemMapPath === undefined && stemMap === undefined) {
    return { ok: false, problem: `${path} must record either "stemMapPath" or "stemMap".` };
  }
  for (const field of ['pads', 'setManifest', 'showFolder'] as const) {
    if (raw[field] !== undefined && !isNonEmptyString(raw[field])) {
      return { ok: false, problem: `${path} has an invalid "${field}".` };
    }
  }
  if (!Array.isArray(raw.songs) || raw.songs.length === 0) {
    return { ok: false, problem: `${path} must have a non-empty "songs" list.` };
  }
  const songs: RecipeSong[] = [];
  for (const entry of raw.songs) {
    if (!isObject(entry) || !isNonEmptyString(entry.folder) || !isNonEmptyString(entry.title) || typeof entry.start !== 'number' || !Number.isFinite(entry.start) || entry.start < 0) {
      return { ok: false, problem: `${path} has an invalid song entry in "songs".` };
    }
    if (entry.chartKey !== undefined && typeof entry.chartKey !== 'string') {
      return { ok: false, problem: `${path} has an invalid "chartKey" in "songs".` };
    }
    if (entry.chartText !== undefined && typeof entry.chartText !== 'string') {
      return { ok: false, problem: `${path} has an invalid "chartText" in "songs".` };
    }
    songs.push({
      folder: entry.folder,
      title: entry.title,
      start: entry.start,
      ...(entry.chartKey === undefined ? {} : { chartKey: entry.chartKey }),
      ...(entry.chartText === undefined ? {} : { chartText: entry.chartText }),
    });
  }
  if (!isObject(raw.transitions)) {
    return { ok: false, problem: `${path} must have a "transitions" object.` };
  }
  const transitions: Partial<Record<number, Transition>> = {};
  for (const [key, value] of Object.entries(raw.transitions)) {
    if (!/^[1-9]\d*$/.test(key) || !isObject(value)) {
      return { ok: false, problem: `${path} has an invalid transition at position "${key}".` };
    }
    const position = Number(key);
    if (value.type === 'gap' || value.type === 'overlap') {
      transitions[position] = { type: value.type };
    } else if (value.type === 'pad') {
      if (value.key !== undefined && (typeof value.key !== 'string' || !isKey(value.key))) {
        return { ok: false, problem: `${path} has an invalid pad key "${String(value.key)}" at position ${key}.` };
      }
      transitions[position] = value.key === undefined ? { type: 'pad' } : { type: 'pad', key: value.key };
    } else {
      return { ok: false, problem: `${path} has an unknown transition type "${String(value.type)}" at position ${key}.` };
    }
  }
  let plan: RecipePlan | undefined;
  if (raw.plan !== undefined) {
    if (!isObject(raw.plan) || !isNonEmptyString(raw.plan.serviceType) || (raw.plan.planId !== undefined && !isNonEmptyString(raw.plan.planId))) {
      return { ok: false, problem: `${path} has an invalid "plan" section.` };
    }
    plan = { serviceType: raw.plan.serviceType, ...(raw.plan.planId === undefined ? {} : { planId: raw.plan.planId }) };
  }
  let lights: RecipeLights | undefined;
  if (raw.lights !== undefined) {
    if (
      !isObject(raw.lights) ||
      !isNonEmptyString(raw.lights.showFolder) ||
      !isNonEmptyString(raw.lights.connectionsConfig) ||
      (raw.lights.playlist !== undefined && !isNonEmptyString(raw.lights.playlist)) ||
      (raw.lights.labelled !== undefined && (!Array.isArray(raw.lights.labelled) || !raw.lights.labelled.every(isNonEmptyString)))
    ) {
      return { ok: false, problem: `${path} has an invalid "lights" section.` };
    }
    lights = {
      showFolder: raw.lights.showFolder,
      connectionsConfig: raw.lights.connectionsConfig,
      ...(raw.lights.playlist === undefined ? {} : { playlist: raw.lights.playlist }),
      ...(raw.lights.labelled === undefined ? {} : { labelled: raw.lights.labelled as string[] }),
    };
  }
  return {
    ok: true,
    recipe: {
      version: 1,
      date: raw.date,
      library: raw.library as string,
      template: raw.template as string,
      outputRoot: raw.outputRoot as string,
      ...(raw.stemMapPath === undefined ? {} : { stemMapPath: raw.stemMapPath as string }),
      ...(stemMap === undefined ? {} : { stemMap }),
      ...(raw.pads === undefined ? {} : { pads: raw.pads as string }),
      ...(raw.setManifest === undefined ? {} : { setManifest: raw.setManifest as string }),
      ...(raw.showFolder === undefined ? {} : { showFolder: raw.showFolder as string }),
      songs,
      transitions,
      ...(plan === undefined ? {} : { plan }),
      ...(lights === undefined ? {} : { lights }),
    },
  };
}

// Reads and validates a stem-map JSON file (default: config/stem-map.json).
// Default-path messages keep literal "config/stem-map.json" prefixes so skill quote checks match.
export async function readStemMapFile(path = DEFAULT_STEM_MAP_PATH): Promise<StemMap> {
  const isDefault = resolve(path) === DEFAULT_STEM_MAP_PATH;
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(
      isDefault ? `config/stem-map.json cannot be read: ${oneLine(error)}` : `${path} cannot be read: ${oneLine(error)}`,
      { cause: error },
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(
      isDefault ? `config/stem-map.json is not valid JSON: ${oneLine(error)}` : `${path} is not valid JSON: ${oneLine(error)}`,
      { cause: error },
    );
  }
  return stemMapShape(value, isDefault ? undefined : path);
}

// The parsed stem map, once its top level is a plain object and each group's value is a list of stem names. A top level
// that is anything else throws one line that names the file and says what the top level is instead; then a group whose
// value is not a list of strings throws one line that names the file and every such group, in map order.
export function stemMapShape(value: unknown, displayName?: string): StemMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      displayName === undefined
        ? `config/stem-map.json must be an object that lists each group's stem names, and its top level is ${jsonKind(value)}.`
        : `${displayName} must be an object that lists each group's stem names, and its top level is ${jsonKind(value)}.`,
    );
  }
  const entries: [string, string[]][] = [];
  const groups: string[] = [];
  for (const [group, stems] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(stems) && stems.every((stem): stem is string => typeof stem === 'string')) entries.push([group, stems]);
    else groups.push(group);
  }
  if (groups.length > 0) {
    const names = groups.length === 1 ? groups[0] : `${groups.slice(0, -1).join(', ')} and ${groups.at(-1)}`;
    throw new Error(
      displayName === undefined
        ? `config/stem-map.json lists the stems of ${names} as something other than a list of stem names. Put each group's stems in brackets: "${groups[0]}": ["<stem>"].`
        : `${displayName} lists the stems of ${names} as something other than a list of stem names. Put each group's stems in brackets: "${groups[0]}": ["<stem>"].`,
    );
  }
  return Object.fromEntries(entries);
}

function jsonKind(value: unknown): string {
  if (Array.isArray(value)) return 'a list';
  if (value === null || typeof value === 'boolean') return String(value);
  return `a ${typeof value}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function oneLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ');
}
