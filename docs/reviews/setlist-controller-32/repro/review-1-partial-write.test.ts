import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { afterEach, expect, it } from 'vitest';
import { buildSet } from '../src/set-builder/build-set.ts';
import { createWorkspace, DATE, GOODNESS, libraryFile, projectFolder, readStemMap, removeWorkspaces } from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-32/pre-pr-review-1.md, finding 1. Copy into test/ to run.

afterEach(removeWorkspaces);

// A build without --replace that fails part way through writing (a WAV gone from the library) must leave the
// output root as it was, as the replacing build already does.
it('leaves no set folder behind when a build without replace fails part way through writing', async () => {
  const workspace = await createWorkspace();
  await rm(libraryFile(workspace, GOODNESS, 'AG 2.wav'));
  const options = { library: workspace.library, template: workspace.template, stemMap: await readStemMap(), songs: ['goodness'], date: DATE, outputRoot: workspace.outputRoot };

  await expect(buildSet(options)).rejects.toThrow('AG 2.wav');

  const left = existsSync(projectFolder(workspace)) ? await readdir(projectFolder(workspace), { recursive: true }) : [];
  expect(left).toEqual([]);
  expect(existsSync(projectFolder(workspace))).toBe(false);
});
