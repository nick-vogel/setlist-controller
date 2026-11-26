import type { Transition } from './build-set.ts';
import { sameName } from './name-rule.ts';
import type { Plan } from './plan-reader.ts';

// The plan songs --skip leaves out of the set, by position counted from 1: none by default.
export const NO_SKIPS: ReadonlySet<number> = new Set();

// The position of the last plan song of `count` that --skip does not leave out, or 0 when it leaves out every one.
export function lastKept(count: number, skipped: ReadonlySet<number>): number {
  for (let position = count; position >= 1; position -= 1) if (!skipped.has(position)) return position;
  return 0;
}

// The positions of the plan songs of `count` that --skip does not leave out, in plan order: song n of the set built is
// the plan song at index n - 1.
export function keptPositions(count: number, skipped: ReadonlySet<number>): number[] {
  return Array.from({ length: count }, (_, index) => index + 1).filter((position) => !skipped.has(position));
}

// The transitions the plan gives its song changes, by song position counted from 1, and the problems in them, by the
// position of the song change each is about. Under the name rule, an item "Prayer" that is the next item after a song,
// headers left out, makes a pad after that song, in the key a --pad without one takes. A "Prayer" anywhere else means
// nothing. A note on a song whose whole text is "overlap" makes an overlap after it. An overlap after the last song is a
// problem, whether or not a "Prayer" follows it, since no song comes after it to overlap into; a song change with both
// is the other problem. A problem gives no transition. A song --skip leaves out of the set (skipped) gives nothing, its
// notes and the "Prayer" after it included, and the last song is the last one not skipped. Pure, so that a listing of the
// plan can say what each item means by the same rule.
export function planTransitions(plan: Plan, skipped: ReadonlySet<number> = NO_SKIPS): { transitions: Partial<Record<number, Transition>>; problems: Map<number, string> } {
  const transitions: Partial<Record<number, Transition>> = {};
  const problems = new Map<number, string>();
  const last = lastKept(plan.songs.length, skipped);
  plan.items.forEach((entry, index) => {
    if (entry.kind !== 'song' || skipped.has(entry.position)) return;
    const { position } = entry;
    const song = plan.songs[position - 1];
    if (song === undefined) return;
    const pad = padAfter(plan, index);
    const overlap = song.notes.some((note) => sameName(note, 'overlap'));
    if (overlap && position === last) {
      problems.set(position, `The plan's "overlap" note on song ${position}, "${song.title}", names the last song, which has no song after it to overlap into.`);
    } else if (pad && overlap) {
      problems.set(
        position,
        `The plan gives the song change after song ${position}, "${song.title}", both a "Prayer" item and an "overlap" note. Give each song change one transition.`,
      );
    } else if (overlap) {
      transitions[position] = { type: 'overlap' };
    } else if (pad) {
      transitions[position] = { type: 'pad' };
    }
  });
  return { transitions, problems };
}

// A transition flag on a plan build, by the song position it names: the transition it gives, none for a --gap, and the
// flag as typed, `--pad 1=G`.
export type FlagTransition = { transition?: Transition; flag: string };

// Where the transition after a song position comes from: the plan, or a flag, named as typed.
export type TransitionSource = { from: 'plan' } | { from: 'flag'; flag: string };

// The plan's transitions and problems (planTransitions), with the songs --skip leaves out (skipped), each transition flag
// replacing the plan's for its position, problem and all, and the source of each position that has a transition or a
// flag. A position in neither is the default gap.
export function transitionsWithFlags(
  plan: Plan,
  flags: Map<number, FlagTransition>,
  skipped: ReadonlySet<number> = NO_SKIPS,
): { transitions: Partial<Record<number, Transition>>; problems: Map<number, string>; sources: Map<number, TransitionSource> } {
  const { transitions, problems } = planTransitions(plan, skipped);
  const sources = new Map<number, TransitionSource>(Object.keys(transitions).map((position) => [Number(position), { from: 'plan' }]));
  for (const [position, { transition, flag }] of flags) {
    problems.delete(position);
    if (transition === undefined) delete transitions[position];
    else transitions[position] = transition;
    sources.set(position, { from: 'flag', flag });
  }
  return { transitions, problems, sources };
}

// An entry of the plan's order of service from its first song on, as a listing of the plan shows it: a song, by its
// position, or another item, by its title, with the song position it makes a pad after when it does, by the rule
// planTransitions applies.
export type PlanEntry = { kind: 'song'; position: number } | { kind: 'item'; title: string; padAfter?: number };

// The plan's order of service from its first song on, each non-song item with what it means for the build. The items
// before the first song mean nothing and are left out, and an item after a song --skip leaves out (skipped) means nothing.
export function itemMeanings(plan: Plan, skipped: ReadonlySet<number> = NO_SKIPS): PlanEntry[] {
  const first = plan.items.findIndex((entry) => entry.kind === 'song');
  if (first === -1) return [];
  return plan.items.slice(first).map((entry, at): PlanEntry => {
    if (entry.kind === 'song') return entry;
    const previous = plan.items[first + at - 1];
    return previous?.kind === 'song' && !skipped.has(previous.position) && padAfter(plan, first + at - 1) ? { kind: 'item', title: entry.title, padAfter: previous.position } : { kind: 'item', title: entry.title };
  });
}

// Whether the item right after the song at `index` of the plan's items is a "Prayer", which makes a pad after the song.
function padAfter(plan: Plan, index: number): boolean {
  const next = plan.items[index + 1];
  return next?.kind === 'item' && sameName(next.title, 'Prayer');
}
