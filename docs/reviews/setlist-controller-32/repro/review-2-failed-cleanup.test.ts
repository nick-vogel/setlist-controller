import { existsSync } from 'node:fs';
import { chmod, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildSet } from '../src/set-builder/build-set.ts';
import { createWorkspace, DATE, GOODNESS, libraryFile, PROJECT_INFO, projectFolder, readStemMap, removeWorkspaces } from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-32/pre-pr-review-2.md, finding 1. Copy into test/ to run.

afterEach(removeWorkspaces);

const outcome = (build: Promise<unknown>) => build.then(() => 'resolved', (error: unknown) => String(error));

// The state that makes a plain build's cleanup fail: the song's Ableton Project Info is read-only in the library, so
// its copy is too, and a WAV is gone. The operator sees the cleanup's error, not the missing WAV. A --replace build
// over the leftover, while it is still read-only, swaps the new set in and then fails removing the old one.
it.skipIf(process.getuid?.() === 0)('shows what the operator sees when a plain build cannot clean up, and what --replace does next', async () => {
  const workspace = await createWorkspace();
  const stemMap = await readStemMap();
  const options = (songs: string[], replace: boolean) => ({ library: workspace.library, template: workspace.template, stemMap, songs, date: DATE, outputRoot: workspace.outputRoot, replace });
  await rm(libraryFile(workspace, GOODNESS, 'AG 2.wav'));
  const projectInfo = join(workspace.library, GOODNESS, PROJECT_INFO);
  await chmod(projectInfo, 0o555);

  const plain = await outcome(buildSet(options(['goodness'], false)));
  const replacing = await outcome(buildSet(options(['grace'], true)));
  const left = (await readdir(workspace.outputRoot)).toSorted();

  await chmod(projectInfo, 0o755);
  for (const entry of await readdir(workspace.outputRoot, { recursive: true })) {
    if (entry.endsWith(PROJECT_INFO)) await chmod(join(workspace.outputRoot, entry), 0o755);
  }
  expect(plain).toMatch(/EACCES/);
  expect(plain).not.toMatch(/AG 2\.wav/);
  expect(existsSync(join(projectFolder(workspace), 'Songs/This Is Amazing Grace'))).toBe(true);
  // Red: the replacing build rejects with EACCES on the old folder's read-only Project Info, after the swap.
  expect(replacing).toBe('resolved');
  expect(left).toEqual([`${DATE} Sunday`]);
});
