import type { Transition } from './build-set.ts';
import { setName } from './build-set.ts';
import { songNoteKey } from './pads.ts';
import type { FolderPick } from './plan-folders.ts';
import type { Plan } from './plan-reader.ts';
import { itemMeanings, type TransitionSource } from './plan-transitions.ts';

// `--plan --list`: what the plan resolves to, as lines to print, before a build. Pure: the command reads the plan, the
// folders and the songs' meters, and prints these lines.

export type PlanListingInput = {
  // The set's date, YYYY-MM-DD.
  date: string;
  plan: Plan;
  // Each plan song's folder, or its problem, by position.
  picks: FolderPick[];
  // The transitions after the flags (transitionsWithFlags), the problems left, and each position's source.
  transitions: Partial<Record<number, Transition>>;
  problems: Map<number, string>;
  sources: Map<number, TransitionSource>;
  // The warnings, in song order (planWarnings).
  warnings: string[];
  // The set folder for the date, when it already exists under the output root, and whether the command's --replace names
  // it. A --replace that names another folder never gets here: the command stops on it as a usage problem.
  existingSet?: { folder: string; replace: boolean };
};

// The listing: the set's name, then the plan's order of service from its first song on, then every warning, then a line
// for the set folder for the date when it already exists: `<folder> already exists. The build stops on it unless
// --replace "<folder>" replaces it.`, or with a --replace naming that folder `<folder> already exists, and --replace
// replaces it.` That line is no problem, so listingHasProblems never looks at it. A song line
// is `<n>. <title>  <plan key, or "no key">  <folder, or its problem>`, then the transition after it with its source
// (`gap, the default`, `overlap, from the plan`, `pad in G, from --pad 1=G`), or the position's transition problem; the
// last song has that field only when it has a transition, a flag or a problem. A folder problem of several lines, such as
// two folders in the key, takes the folder field with its first line, and its other lines, the folder names, follow the
// song's line as they are, so the transition stays on the song's own line and the problem's text is the build's. A
// non-song item is `<title>: a pad after song <n>`, with `, which <flag> replaces` when a flag names that song, or
// `<title>: no effect`.
export function planListing({ date, plan, picks, transitions, problems, sources, warnings, existingSet }: PlanListingInput): string[] {
  const songLine = (position: number): string => {
    const song = plan.songs[position - 1];
    const pick = picks[position - 1];
    const [folder = '', ...after] = (pick === undefined ? '' : pick.ok ? pick.folder : pick.problem).split('\n');
    const fields = [`${position}. ${song?.title ?? ''}`, song?.key ?? 'no key', folder];
    const problem = problems.get(position);
    const transition = transitions[position];
    const source = sources.get(position);
    if (problem !== undefined) fields.push(problem);
    else if (transition !== undefined || source !== undefined || position < plan.songs.length) {
      fields.push(`${transitionName(transition, padKey(position, transition, picks))}, ${sourceName(source)}`);
    }
    return [fields.join('  '), ...after].join('\n');
  };
  const entries = itemMeanings(plan).map((entry) => {
    if (entry.kind === 'song') return songLine(entry.position);
    const title = entry.title === '' ? 'untitled' : entry.title;
    if (entry.padAfter === undefined) return `${title}: no effect`;
    const source = sources.get(entry.padAfter);
    return `${title}: a pad after song ${entry.padAfter}${source?.from === 'flag' ? `, which ${source.flag} replaces` : ''}`;
  });
  return [setName(date), ...entries, ...warnings, ...(existingSet === undefined ? [] : [existingSetLine(existingSet)])];
}

// The line that says the set folder for the date already exists, and whether --replace replaces it. --list and
// --plan --list both print it last.
export function existingSetLine({ folder, replace }: { folder: string; replace: boolean }): string {
  return replace ? `${folder} already exists, and --replace replaces it.` : `${folder} already exists. The build stops on it unless --replace "${folder}" replaces it.`;
}

// Whether the listing exits 1: a song with a folder problem, or a transition problem left after the flags.
export function listingHasProblems({ picks, problems }: Pick<PlanListingInput, 'picks' | 'problems'>): boolean {
  return problems.size > 0 || picks.some((pick) => !pick.ok);
}

// The transition as the listing names it: `gap` for none, `overlap`, `pad in <key>`, or `pad` with no key known.
function transitionName(transition: Transition | undefined, key: string | undefined): string {
  if (transition === undefined || transition.type === 'gap') return 'gap';
  if (transition.type === 'overlap') return 'overlap';
  return key === undefined ? 'pad' : `pad in ${key}`;
}

function sourceName(source: TransitionSource | undefined): string {
  if (source === undefined) return 'the default';
  return source.from === 'plan' ? 'from the plan' : `from ${source.flag}`;
}

// A pad's key, as the build would play it: its own, else the next song's folder key, else, after the last song, its
// own song's; undefined when that folder is a problem or writes no note name.
function padKey(position: number, transition: Transition | undefined, picks: FolderPick[]): string | undefined {
  if (transition?.type !== 'pad') return undefined;
  if (transition.key !== undefined) return transition.key;
  const pick = picks[position] ?? picks[position - 1];
  if (pick === undefined || !pick.ok) return undefined;
  const key = songNoteKey(pick.folder);
  return key.ok ? key.key : undefined;
}
