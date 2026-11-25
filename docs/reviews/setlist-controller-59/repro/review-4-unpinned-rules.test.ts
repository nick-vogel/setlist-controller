import { afterEach, describe, expect, it } from 'vitest';
import { buildSet, type Transition } from '../src/set-builder/build-set.ts';
import { addPad, addPadTrack, createWorkspace, DATE, editSongTrack, GOODNESS, GRACE, locatorList, moveLocator, readSet, readStemMap, removeWorkspaces, TRUST, type Workspace } from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-59/pre-pr-review-4.md, finding 4. Copy into test/ to run:
// `cp docs/reviews/setlist-controller-59/repro/review-4-unpinned-rules.test.ts test/ && pnpm exec vitest run test/review-4-unpinned-rules.test.ts`.
// Green at ee13465; each test goes red under its own mutation in repro/, which the set-builder suites do not catch.

afterEach(removeWorkspaces);

const build = async (workspace: Workspace, songs: string[], transitions: Partial<Record<number, Transition>>) =>
  buildSet({ library: workspace.library, template: workspace.template, stemMap: await readStemMap(), songs, transitions, date: DATE, outputRoot: workspace.outputRoot });

describe('review 4 finding 4', () => {
  it('puts 1 - Pad on 318 when the audio end is exactly the tolerance past it (red under review-4-mutation-tolerance-strict.diff)', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);
    await editSongTrack(workspace, GOODNESS, 'BGVS', (text) => text.replace('<CurrentEnd Value="318.00004942973692" />', '<CurrentEnd Value="318.0001" />'));
    const result = await build(workspace, [GOODNESS, TRUST], { 1: { type: 'pad' } });
    if (!result.ok) throw new Error(result.problems.join('\n'));
    expect(locatorList(await readSet(result.setPath)).find(({ name }) => name === '1 - Pad')).toEqual({ time: 318, name: '1 - Pad' });
  });

  it.each<[string, Partial<Record<number, Transition>>]>([
    ['a gap', {}],
    ['a pad', { 1: { type: 'pad' } }],
  ])(
    'builds a short song that overlaps on, after %s, counting no ring of the song before it (red under review-4-mutation-walk-through-gap.diff)',
    async (_, before) => {
      const workspace = await createWorkspace();
      await addPadTrack(workspace);
      await addPad(workspace, 'D', 30);
      await moveLocator(workspace, GRACE, 'Ending', 12);
      const result = await build(workspace, [GOODNESS, GRACE, GOODNESS], { ...before, 2: { type: 'overlap' } });
      expect(result.ok ? 'ok' : result.problems).toBe('ok');
    },
  );
});
