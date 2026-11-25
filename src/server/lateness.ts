import type { ConnectionLateness } from '../shared/snapshot.ts';

// One target's record of how late its cues reach it: the lateness of each cue handed over, and of
// each the target reports it acted on, each kept as the last one and the last WINDOW for the median.
// It lives as long as the server, so it survives the target going offline or being disarmed.

// The cues the median counts, the latest ones.
const WINDOW = 50;

export type LatenessRecord = {
  // A cue handed to the target, late by ms.
  handed(ms: number): void;
  // The target acted on a cue, late by ms.
  acted(ms: number): void;
  read(): ConnectionLateness;
};

export function latenessRecord(): LatenessRecord {
  const handed: number[] = [];
  const acted: number[] = [];
  const add = (list: number[], ms: number) => {
    list.push(ms);
    if (list.length > WINDOW) list.shift();
  };
  return {
    handed: (ms) => add(handed, ms),
    acted: (ms) => add(acted, ms),
    read: () => ({ last: handed.at(-1) ?? null, median: median(handed), acted: acted.at(-1) ?? null, actedMedian: median(acted) }),
  };
}

export const NOT_MEASURED: ConnectionLateness = { last: null, median: null, acted: null, actedMedian: null };

// The median, by nearest rank, as `pnpm lateness` takes it (src/lateness/summary.ts). Null for none.
function median(values: number[]): number | null {
  return values.length === 0 ? null : nearestRank(values.toSorted((a, b) => a - b), 50);
}

// The value at the nearest rank for the percentile, of values sorted ascending: the value at rank
// ceil(p / 100 * n), counted from 1. The row's median and every percentile `pnpm lateness` prints
// take it, so the two never disagree.
export const nearestRank = (sorted: number[], percentile: number) => sorted[Math.max(1, Math.ceil((percentile / 100) * sorted.length)) - 1]!;
