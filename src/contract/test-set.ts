import type { Track } from '../fake-live/fake-live.ts';
import type { CuePoint } from '../shared/cue-point.ts';

// The one-song Live set the contract check runs against, in real Live and in the fake Live alike.
// docs/install.md lists the same locators and tracks, so edit the two together. Times are in beats;
// at 4 beats a bar, beat 16 is bar 5 in Live's notation (5.1.1).

export const TEST_SET_TEMPO = 120;
export const TEST_SET_SIGNATURE = { numerator: 4, denominator: 4 };
export const BEATS_PER_BAR = 4;
// The arrangement loop's brace, off, as Live sets it in a new set: from 1.1.1, four bars long. The
// loop step moves it to the Tag and puts it back, so a second run in the same Live session starts
// from the same brace.
export const TEST_SET_LOOP = { start: 0, length: 16 };

export const TEST_SET: CuePoint[] = [
  { name: '1 - Intro (Contract Check)', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  // One bar, so two turns of the loop take 4 seconds.
  { name: '1 - Tag', time: 48 },
  { name: '1 - End', time: 52 },
];

// The tracks, in Live's order: a group track holding one track, then a track on its own, so the list
// holds both values of the "is grouped" flag the fade reads. The volumes are the fake Live's, each
// exact in float32, so a volume read and set back over OSC compares equal. The check never compares
// them with real Live's, which sit wherever the faders are.
export const TEST_SET_TRACKS: Track[] = [
  { name: 'Group', grouped: false, volume: 0.75 },
  { name: 'Grouped', grouped: true, volume: 0.5 },
  { name: 'Single', grouped: false, volume: 1 },
];

// Whether a track sits inside a group, as the observations, the warning and the report say it.
export const groupedLabel = (grouped: boolean) => (grouped ? 'grouped' : 'not grouped');

// Whether tracks, as (name, grouped label) pairs, are the test set's.
export function isTestSetTracks(tracks: unknown): boolean {
  return JSON.stringify(tracks) === JSON.stringify(TEST_SET_TRACKS.map(({ name, grouped }) => [name, groupedLabel(grouped)]));
}

// Cue indexes in TEST_SET, as cue_point/jump takes them.
export const CUE = { intro: 0, verse: 1, chorus: 2, tag: 3, end: 4 } as const;
export type Cue = (typeof CUE)[keyof typeof CUE];

// The beat a cue's locator sits at. Throws for a cue the test set does not hold, so an edit to
// TEST_SET that drops one fails loudly instead of reading as beat 0.
export function cueTime(cue: Cue): number {
  const cuePoint = TEST_SET[cue];
  if (!cuePoint) throw new Error(`The test set has no cue ${cue}.`);
  return cuePoint.time;
}

const SECTIONS = ['Intro', 'Verse', 'Chorus', 'Tag'] as const;
export type Section = (typeof SECTIONS)[number] | 'after End' | 'before Intro';

// The section a beat falls in. The End locator closes the song, so a beat at or past it is after End.
export function sectionAt(beats: number): Section {
  const first = TEST_SET[0];
  if (!first || beats < first.time) return 'before Intro';
  for (let index = TEST_SET.length - 1; index >= 0; index -= 1) {
    const cuePoint = TEST_SET[index];
    if (cuePoint && beats >= cuePoint.time) return SECTIONS[index] ?? 'after End';
  }
  return 'before Intro';
}

// Whether locators, as (name, time) pairs the way get/cue_points reports them, are the test set's.
export function isTestSet(locators: unknown): boolean {
  return JSON.stringify(locators) === JSON.stringify(TEST_SET.map(({ name, time }) => [name, time]));
}

// One locator as the abort and the report list it, such as `1 - Verse at 5.1.1 (beat 16)`.
export function locatorLine({ name, time }: CuePoint): string {
  return `${name} at ${barBeat(time)} (beat ${time})`;
}

// One track as the warning and the report list it, such as `Grouped (grouped)`.
export function trackLine({ name, grouped }: Pick<Track, 'name' | 'grouped'>): string {
  return `${name} (${groupedLabel(grouped)})`;
}

// Live's notation for a beat: bar.beat.sixteenth, each counted from 1.
export function barBeat(beats: number): string {
  const bar = Math.floor(beats / BEATS_PER_BAR) + 1;
  const beat = Math.floor(beats % BEATS_PER_BAR) + 1;
  const sixteenth = Math.floor((beats % 1) * 4) + 1;
  return `${bar}.${beat}.${sixteenth}`;
}
