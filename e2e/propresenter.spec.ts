import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { manualClock } from '../src/server/clock.ts';
import { proPresenterKind } from '../src/server/propresenter.ts';
import { startFakeProPresenter, writeProPresenterConfig, type FakeProPresenter } from '../test/fake-propresenter.ts';
import { SET, startE2eRig, type E2eRig } from './rig.ts';

// ProPresenter's row on the producer page, from a written connections config naming the fake
// ProPresenter (test/fake-propresenter.ts), which answers from the Phase 0 recordings. The config and
// the picks file go in a folder inside the worktree's dist, removed after the test.

const REPO_ROOT = resolve(import.meta.dirname, '..');
const OCTOBER_25 = { id: '49F3C197-E743-45AB-8670-C53959B82BDC', name: 'Series One - October 25, 2026' };

let e2e: E2eRig | undefined;
let pro: FakeProPresenter | undefined;
let folder: string | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  await pro?.close();
  pro = undefined;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
});

test("the producer page lists ProPresenter's playlists on its row, and picking one shows it and reads it", async ({ page }) => {
  pro = await startFakeProPresenter();
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  folder = await mkdtemp(join(REPO_ROOT, 'dist/e2e-propresenter-'));
  const config = await writeProPresenterConfig(folder, pro.port);
  const kind = proPresenterKind({ statePath: join(folder, 'propresenter-picks.json'), clock: manualClock() });
  e2e = await startE2eRig({}, SET, { connectionsConfig: config, targetKinds: { propresenter: kind } });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ProPresenter' });
  await expect(row).toContainText('Online');
  const playlist = row.getByRole('combobox', { name: 'Playlist' });
  // The 14 recorded playlists, after the prompt.
  await expect(playlist.locator('option')).toHaveCount(15);
  await expect(playlist).toBeEnabled();
  await expect(row).toContainText('No playlist picked');

  await playlist.selectOption({ label: OCTOBER_25.name });

  await expect(row).toContainText(`Playlist: ${OCTOBER_25.name}`);
  await expect(playlist).toHaveValue(OCTOBER_25.id);
  await expect.poll(() => pro?.requests.some(({ path }) => path === `/v1/playlist/${OCTOBER_25.id}`)).toBe(true);
});

test("the producer page shows ProPresenter's current and next slide text on its row", async ({ page }) => {
  pro = await startFakeProPresenter();
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  folder = await mkdtemp(join(REPO_ROOT, 'dist/e2e-propresenter-'));
  const config = await writeProPresenterConfig(folder, pro.port);
  const kind = proPresenterKind({ statePath: join(folder, 'propresenter-picks.json'), clock: manualClock() });
  e2e = await startE2eRig({}, SET, { connectionsConfig: config, targetKinds: { propresenter: kind } });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ProPresenter' });
  await expect(row).toContainText('Online');
  await pro.streaming();
  // The Chorus of There Is Freedom, as the recorded stream has it.
  await pro.send(251835);

  await expect(row).toContainText('Current slide: There Is Freedom / Chorus / slide 1 line 1 / There Is Freedom / Chorus / slide 1 line 2');
  await expect(row).toContainText(
    'Next slide: There Is Freedom / Chorus / slide 2 line 1 / There Is Freedom / Chorus / slide 2 line 2 / There Is Freedom / Chorus / slide 2 line 3',
  );
});

test("the producer page shows ProPresenter's slide buttons on its row, and a press reaches ProPresenter", async ({ page }) => {
  pro = await startFakeProPresenter();
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  folder = await mkdtemp(join(REPO_ROOT, 'dist/e2e-propresenter-'));
  const config = await writeProPresenterConfig(folder, pro.port);
  const kind = proPresenterKind({ statePath: join(folder, 'propresenter-picks.json'), clock: manualClock() });
  e2e = await startE2eRig({}, SET, { connectionsConfig: config, targetKinds: { propresenter: kind } });
  const sent = (path: string) => pro?.requests.filter((request) => request.path === path).length;

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ProPresenter' });
  await expect(row).toContainText('Online');
  const next = row.getByRole('button', { name: 'Next slide', exact: true });
  const previous = row.getByRole('button', { name: 'Previous slide', exact: true });
  const clear = row.getByRole('button', { name: 'Clear slide', exact: true });
  for (const button of [next, previous, clear]) await expect(button).toBeEnabled();

  await clear.click();
  await expect.poll(() => sent('/v1/clear/layer/slide')).toBe(1);

  // No presentation is active, so next has nothing to move, and the row says so.
  await next.click();
  await expect.poll(() => sent('/v1/presentation/active/next/trigger')).toBe(1);
  await expect(row).toContainText('Pressed Next slide: nothing to move.');
  await expect(row).toContainText('Online');
});
