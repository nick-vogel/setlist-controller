import { afterEach, describe, expect, it } from 'vitest';
import { buildSet, type BuildResult } from '../src/set-builder/build-set.ts';
import { parseSet } from '../src/server/set-parser.ts';
import type { SongDurations } from '../src/shared/set-manifest.ts';
import {
  addMainTrackEvents,
  createWorkspace,
  DATE,
  envelopeEvents,
  GOODNESS,
  GRACE,
  GREAT_ARE,
  locatorList,
  readSet,
  readStemMap,
  removeWorkspaces,
  setPath,
  TRUST,
  type Workspace,
} from './set-builder-harness.ts';

// How long each song of a built set plays, which the build hands the set manifest: each section and each gap between
// songs, in beats as Live's locators place them and in seconds through the set's tempo map, ramps included.

afterEach(removeWorkspaces);

async function build(workspace: Workspace, songs: string[], transitions: Parameters<typeof buildSet>[0]['transitions'] = {}): Promise<Extract<BuildResult, { ok: true }>> {
  const result = await buildSet({ library: workspace.library, template: workspace.template, stemMap: await readStemMap(), songs, transitions, date: DATE, outputRoot: workspace.outputRoot });
  if (!result.ok) throw new Error(result.problems.join('\n'));
  return result;
}

// The tempo at a set beat, from the built set's own envelope: Live ramps from each tempo event to the next.
function tempoAt(map: [number, number][], beat: number): number {
  const at = map.findLast(([time]) => time <= beat) ?? map[0]!;
  const next = map.find(([time]) => time > beat);
  return next ? at[1] + ((beat - at[0]) / (next[0] - at[0])) * (next[1] - at[1]) : at[1];
}

// The seconds from one set beat to another, summed in small steps of the tempo the set holds there: a measure of the
// built set that does not share the build's arithmetic.
function measured(map: [number, number][], from: number, to: number): number {
  const steps = Math.max(1, Math.ceil((to - from) * 64));
  const step = (to - from) / steps;
  let seconds = 0;
  for (let index = 0; index < steps; index += 1) seconds += (step * 60) / tempoAt(map, from + (index + 0.5) * step);
  return seconds;
}

// The durations the built set itself gives, measured from its locators and its tempo envelope.
async function measuredDurations(workspace: Workspace): Promise<SongDurations[]> {
  const root = await readSet(setPath(workspace));
  const map = envelopeEvents(root, 'Tempo');
  const { songs } = parseSet(locatorList(root));
  return songs.map((song, index) => {
    const nextStart = songs[index + 1]?.sections[0]?.time;
    return {
      sections: song.sections.map((section) => ({ beats: section.end! - section.time, seconds: measured(map, section.time, section.end!) })),
      gap: song.end === null || nextStart === undefined ? null : { beats: nextStart - song.end, seconds: measured(map, song.end, nextStart) },
    };
  });
}

function expectClose(found: SongDurations[], expected: SongDurations[]) {
  expect(found.map((song) => song.sections.length)).toEqual(expected.map((song) => song.sections.length));
  found.forEach((song, index) => {
    const want = expected[index]!;
    song.sections.forEach((section, at) => {
      expect(section.beats).toBeCloseTo(want.sections[at]!.beats, 6);
      expect(section.seconds).toBeCloseTo(want.sections[at]!.seconds, 3);
    });
    expect(song.gap === null).toBe(want.gap === null);
    if (song.gap && want.gap) {
      expect(song.gap.beats).toBeCloseTo(want.gap.beats, 6);
      expect(song.gap.seconds).toBeCloseTo(want.gap.seconds, 3);
    }
  });
}

describe("a build's song durations", () => {
  it("times each section of a song at a steady tempo as its beats at the song's BPM, and gives the last song no gap", async () => {
    const workspace = await createWorkspace();
    const result = await build(workspace, [GRACE]);

    const [song] = result.durations;
    expect(result.durations).toHaveLength(1);
    // Count Off, Intro, Verse 1, Chorus, Intro, Verse 2, Chorus, Bridge, Bridge, Chorus, Outro, Ending.
    expect(song!.sections.map(({ beats }) => beats)).toEqual([8, 16, 32, 32, 16, 32, 32, 16, 16, 32, 16, 16]);
    for (const section of song!.sections) expect(section.seconds).toBeCloseTo((section.beats * 60) / 98, 9);
    expect(song!.gap).toBeNull();
    expectClose(result.durations, await measuredDurations(workspace));
  });

  // Goodness of God holds 42 BPM for one beat, 299 to 300, the fermata before its Ending.
  it('times a section across a step in tempo', async () => {
    const workspace = await createWorkspace();
    const result = await build(workspace, [GOODNESS]);

    // The Tag, 284 to 300.
    const tag = result.durations[0]!.sections[12]!;
    expect(tag.beats).toBe(16);
    expect(tag.seconds).toBeCloseTo((15 * 60) / 63 + 60 / 42, 9);
    expectClose(result.durations, await measuredDurations(workspace));
  });

  it("times the gap between two songs at the next song's tempo, which comes in on the song's End", async () => {
    const workspace = await createWorkspace();
    const result = await build(workspace, [GRACE, GREAT_ARE]);

    const [first, second] = result.durations;
    // 4 bars of Great Are You Lord's 3/4 at its 72 BPM.
    expect(first!.gap).toEqual({ beats: 12, seconds: expect.closeTo(10, 9) });
    expect(second!.gap).toBeNull();
    expectClose(result.durations, await measuredDurations(workspace));
  });

  it('times a whole set of three songs, gaps included, as the built set measures it', async () => {
    const workspace = await createWorkspace();
    const result = await build(workspace, [GOODNESS, TRUST, GRACE]);

    expect(result.durations).toHaveLength(3);
    expectClose(result.durations, await measuredDurations(workspace));
  });

  // This Is Amazing Grace as if a ramp ran from 98 at its beat 0 to 120 at beat 100.
  it('times sections across a tempo ramp, wherever the song sits in the set', async () => {
    const workspace = await createWorkspace();
    await addMainTrackEvents(workspace, GRACE, 'FloatEvent', [
      [0, 98],
      [100, 120],
    ]);
    const result = await build(workspace, [GOODNESS, GRACE]);

    const grace = result.durations[1]!;
    // The ramp makes the song's first sections shorter than 98 BPM would.
    const [first] = grace.sections;
    expect(first!.seconds).toBeLessThan((first!.beats * 60) / 98);
    expectClose(result.durations, await measuredDurations(workspace));
  });

  it('gives an overlap no gap: the next song starts on the Ending', async () => {
    const workspace = await createWorkspace();
    const result = await build(workspace, [GOODNESS, GRACE], { 1: { type: 'overlap' } });

    expect(result.durations[0]!.gap).toEqual({ beats: 0, seconds: 0 });
    expectClose(result.durations, await measuredDurations(workspace));
  });
});
