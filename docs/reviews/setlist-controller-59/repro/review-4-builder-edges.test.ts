import { afterEach, describe, expect, it } from 'vitest';
import { buildSet, type Transition } from '../src/set-builder/build-set.ts';
import { parseSet } from '../src/server/set-parser.ts';
import {
  addPad,
  addPadTrack,
  createWorkspace,
  DATE,
  element,
  elements,
  envelopeEvents,
  GOODNESS,
  GRACE,
  GREAT_ARE,
  locatorList,
  moveLocator,
  readSet,
  readStemMap,
  removeWorkspaces,
  value,
  type Workspace,
} from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-59/pre-pr-review-4.md, findings 1 and 2. Copy into test/ to run:
// `cp docs/reviews/setlist-controller-59/repro/review-4-builder-edges.test.ts test/ && pnpm exec vitest run test/review-4-builder-edges.test.ts`.
// Every test here is red at ee13465, and each passes once its finding is fixed.

afterEach(removeWorkspaces);

const build = async (workspace: Workspace, songs: string[], transitions: Record<number, Transition>) =>
  buildSet({ library: workspace.library, template: workspace.template, stemMap: await readStemMap(), songs, transitions, date: DATE, outputRoot: workspace.outputRoot });

// The seconds the set takes from `from` to `to`, through its stitched tempo map: Live's linear tempo between two
// points, an instant step being two points at one time.
function setSeconds(tempo: [number, number][], from: number, to: number): number {
  const points = tempo.toSorted((a, b) => a[0] - b[0]);
  const bpmAt = (beat: number): number => {
    const after = points.findIndex(([time]) => time > beat);
    if (after === -1) return points.at(-1)![1];
    if (after === 0) return points[0]![1];
    const [t0, v0] = points[after - 1]!;
    const [t1, v1] = points[after]!;
    return v0 + ((v1 - v0) * (beat - t0)) / (t1 - t0);
  };
  const steps = 100_000;
  let seconds = 0;
  for (let i = 0; i < steps; i++) seconds += ((to - from) / steps) * (60 / bpmAt(from + ((i + 0.5) * (to - from)) / steps));
  return seconds;
}

describe('review 4 finding 1: a locator of the song before a pad, at or after its Pad locator', () => {
  it.each([
    ['a 3-second pad, the locator past the section end', 3],
    ['a 30-second pad, the locator inside the section', 30],
  ])('stops the build, with %s', async (_, seconds) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'D', seconds);
    await moveLocator(workspace, GRACE, 'Outro', 466);
    const result = await build(workspace, [GRACE, GREAT_ARE], { 1: { type: 'pad' } });
    const outcome = result.ok
      ? { built: locatorList(await readSet(result.setPath)).map(({ time, name }) => `${time} ${name}`), warnings: parseSet(locatorList(await readSet(result.setPath))).warnings }
      : result.problems;
    expect(outcome).toEqual([expect.stringMatching(/^This Is Amazing Grace-The Ascension-D-98\.00bpm: .*"Outro".*466.*460/)]);
  });
});

describe('review 4 finding 2: a ring that outlasts a short middle song', () => {
  it("plays audio for exactly the set's seconds from its start to its end, through the next song's handoff", async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', 12);
    const result = await build(workspace, [GOODNESS, GRACE, GREAT_ARE], { 1: { type: 'overlap' }, 2: { type: 'overlap' } });
    if (!result.ok) throw new Error(result.problems.join('\n'));
    const root = await readSet(result.setPath);
    const tempo = envelopeEvents(root, 'Tempo');
    const clips = elements(element(root, 'LiveSet', 'Tracks'), 'AudioTrack').flatMap((track) =>
      elements(element(track, 'DeviceChain', 'MainSequencer', 'Sample', 'ArrangerAutomation', 'Events'), 'AudioClip'),
    );
    const cutOnSilence = clips.filter((clip) => Number(value(clip, 'CurrentStart')) === 0 && Number(value(clip, 'CurrentEnd')) === 314);
    expect(cutOnSilence.length).toBeGreaterThan(0);
    for (const clip of cutOnSilence) {
      const audio = Number(value(clip, 'Loop', 'LoopEnd')) - Number(value(clip, 'Loop', 'LoopStart'));
      expect(audio).toBeCloseTo(setSeconds(tempo, 0, 314), 2);
    }
  });
});
