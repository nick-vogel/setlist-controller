import { afterEach, expect, it } from 'vitest';
import { buildSet } from '../src/set-builder/build-set.ts';
import { addPad, addPadTrack, createWorkspace, DATE, GRACE, GREAT_ARE, readStemMap, removeWorkspaces } from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-59/pre-pr-review-1.md, finding 3. Copy into test/ to run.

afterEach(removeWorkspaces);

// A 1-second D.wav is shorter than one bar of Great Are You Lord's 6/8 at 72 BPM, so its Pad section would be 0 bars,
// and shorter than the tail clip under Great Are You Lord's count-off. The build should stop on it, as it stops on a
// pad file it cannot find, and write nothing.
it.each([
  { case: 'between two songs', songs: [GRACE, GREAT_ARE] },
  { case: 'after the last song', songs: [GRACE] },
])('stops on a pad file shorter than one bar, $case', async ({ songs }) => {
  const workspace = await createWorkspace();
  await addPadTrack(workspace);
  await addPad(workspace, 'D', 1);

  const result = await buildSet({
    library: workspace.library,
    template: workspace.template,
    stemMap: await readStemMap(),
    songs,
    transitions: { 1: { type: 'pad' } },
    date: DATE,
    outputRoot: workspace.outputRoot,
  });

  expect(result.ok).toBe(false);
});
