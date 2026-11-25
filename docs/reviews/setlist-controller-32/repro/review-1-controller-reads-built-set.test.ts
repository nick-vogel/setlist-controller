import { afterEach, expect, it } from 'vitest';
import { buildSet } from '../src/set-builder/build-set.ts';
import { parseSet } from '../src/server/set-parser.ts';
import { createWorkspace, DATE, element, elements, GOODNESS, GRACE, nameBlankLocator, readSet, readStemMap, removeWorkspaces, setPath, TRUST, value, type Workspace } from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-32/pre-pr-review-1.md, findings 2 and 3. Copy into test/ to run.

afterEach(removeWorkspaces);

// The built set's locators, read back from the .als, as the controller receives them.
async function controllerReads(workspace: Workspace) {
  const set = await readSet(setPath(workspace));
  const locators = elements(element(set, 'LiveSet', 'Locators', 'Locators'), 'Locator');
  return parseSet(locators.map((locator) => ({ name: value(locator, 'Name'), time: Number(value(locator, 'Time')) })));
}

async function build(workspace: Workspace, songs: string[]) {
  return buildSet({ library: workspace.library, template: workspace.template, stemMap: await readStemMap(), songs, date: DATE, outputRoot: workspace.outputRoot });
}

it('the controller reads the three-song service with zero warnings and every song titled', async () => {
  const workspace = await createWorkspace();
  expect(await build(workspace, [GRACE, GOODNESS, TRUST])).toMatchObject({ ok: true });

  const { songs, warnings } = await controllerReads(workspace);

  expect(warnings).toEqual([]);
  expect(songs.map((song) => [song.number, song.title])).toEqual([
    [1, 'This Is Amazing Grace'],
    [2, 'Goodness of God'],
    [3, 'Trust In God'],
  ]);
});

it('the controller reads a song whose end marker is named End with zero warnings and one End', async () => {
  const workspace = await createWorkspace();
  await nameBlankLocator(workspace, GRACE, 'End');
  expect(await build(workspace, [GRACE, GOODNESS])).toMatchObject({ ok: true });

  const { songs, warnings } = await controllerReads(workspace);

  expect(warnings).toEqual([]);
  expect(songs[0]?.end).toBe(468);
});
