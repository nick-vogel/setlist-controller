import { afterEach, describe, expect, it } from 'vitest';
import { buildSet, type Transition } from '../src/set-builder/build-set.ts';
import { addPad, addPadTrack, createWorkspace, DATE, editSongTrack, GOODNESS, GRACE, readStemMap, removeLocator, removeWorkspaces, TRUST, type Workspace } from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-59/pre-pr-review-2.md, finding 2. Copy into test/ to run. Green at HEAD;
// each test goes red under its own mutation in repro/, which the set-builder suites do not catch.

afterEach(removeWorkspaces);

const moveBgvsTo = (workspace: Workspace, start: number) =>
  editSongTrack(workspace, GOODNESS, 'BGVS', (text) =>
    text.replace('<AudioClip Id="0" Time="0">', `<AudioClip Id="0" Time="${start}">`).replace('<CurrentStart Value="0" />', `<CurrentStart Value="${start}" />`),
  );

const build = async (workspace: Workspace, songs: string[], transitions: Record<number, Transition>) =>
  buildSet({ library: workspace.library, template: workspace.template, stemMap: await readStemMap(), songs, transitions, date: DATE, outputRoot: workspace.outputRoot });

describe('review 2 finding 2', () => {
  it("a BGVS clip on 309 starts ringing after Trust In God's silence point, so the pair builds (red under review-2-mutation-ring-raw-start.diff)", async () => {
    const workspace = await createWorkspace();
    await moveBgvsTo(workspace, 309);
    const result = await build(workspace, [GOODNESS, TRUST], { 1: { type: 'overlap' } });
    expect(result.ok ? 'ok' : result.problems).toBe('ok');
  });

  it('a pad after the last song, which has no section after its Count Off, builds (red under review-2-mutation-pad-after-last-needs-intro.diff)', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);
    await removeLocator(workspace, GOODNESS, 'Count Off');
    const result = await build(workspace, [GRACE, GOODNESS], { 2: { type: 'pad' } });
    expect(result.ok ? 'ok' : result.problems).toBe('ok');
  });

  it('a short pad with its own key into a name that matches no song gives only that name\'s problem (red under review-2-mutation-no-holder-guard.diff)', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 1);
    const result = await build(workspace, [GRACE, 'zzz'], { 1: { type: 'pad', key: 'A' } });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems.map((problem) => problem.slice(0, 32))).toEqual(['"zzz" matches no song folder in ']);
  });
});
