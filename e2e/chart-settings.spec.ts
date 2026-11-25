import { expect, test, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

// What a band member's device sets for itself on the chart view, and keeps across a reload: the
// whole-set view, every song one after the next under the one strip with the same highlight; the
// font size of the chart's text; and the Auto-Lock tip, shown on the first open and not after.

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// Three songs in 4/4, song 1 and song 2 each with a repeated section. In the whole-set view the
// blocks run on from song to song, so a block's index counts from song 1's Count Off.
const SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - Chorus', time: 24 },
  { name: '1 - Verse', time: 40 },
  { name: '1 - Chorus', time: 56 },
  { name: '1 - End', time: 72 },
  { name: '2 - Count Off', time: 76 },
  { name: '2 - Intro', time: 84 },
  { name: '2 - Chorus', time: 100 },
  { name: '2 - Chorus', time: 116 },
  { name: '2 - End', time: 132 },
  { name: '3 - Intro', time: 136 },
  { name: '3 - End', time: 152 },
];
const SONG_1 = ['Count Off', 'Verse', 'Chorus', 'Verse', 'Chorus', 'End'];
const SONG_2 = ['Count Off', 'Intro', 'Chorus', 'Chorus', 'End'];
const SONG_3 = ['Intro', 'End'];
// Song 1's second Chorus, and song 2's second Chorus, as blocks of the whole set.
const SONG_1_SECOND_CHORUS = 4;
const SONG_2_SECOND_CHORUS = SONG_1.length + 3;

// A label's text runs on into its select's options, so each select is found by a part of it.
const partSelect = (page: Page) => page.getByLabel('Part');
const viewSelect = (page: Page) => page.getByLabel('View');
const fontSizeSelect = (page: Page) => page.getByLabel('Font size');
const blocks = (page: Page) => page.locator('.chart-block');
const tip = (page: Page) => page.locator('.auto-lock-tip');

// How far a block's top sits from the pinned strip's bottom edge, which the current block scrolls to.
async function underStrip(page: Page, block: number) {
  const strip = await page.locator('.chart-strip').boundingBox();
  const top = (await blocks(page).nth(block).boundingBox())?.y;
  return strip && top !== undefined ? Math.abs(top - (strip.y + strip.height)) : Infinity;
}

// The page with Keys picked, its chart view drawn for song 1.
async function pickKeys(page: Page) {
  await partSelect(page).selectOption('Keys');
  await expect(page.locator('.chart-block-name')).toHaveText(SONG_1);
}

test('the whole-set view shows every song in set order, with the highlight on the current block, and the device keeps it', async ({ page }) => {
  e2e = await startE2eRig({ position: 58 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  await expect(viewSelect(page)).toHaveValue('song');
  await expect(page.locator('.chart-song')).toHaveText(['Song 1']);

  await viewSelect(page).selectOption({ label: 'Whole set' });
  await expect(page.locator('.chart-song')).toHaveText(['Song 1', 'Song 2', 'Song 3']);
  await expect(page.locator('.chart-block-name')).toHaveText([...SONG_1, ...SONG_2, ...SONG_3]);
  await expect(page.locator('.chart-strip')).toHaveCount(1);
  // The playhead is in song 1's second Chorus, and not its first.
  await expect(page.locator('.chart-block.current')).toHaveCount(1);
  await expect(blocks(page).nth(SONG_1_SECOND_CHORUS)).toHaveClass(/\bcurrent\b/);
  await expect.poll(() => underStrip(page, SONG_1_SECOND_CHORUS)).toBeLessThanOrEqual(1);

  // Into song 2's second Chorus: the highlight moves there, song 1 is still drawn above it, and the
  // block scrolls to just under the strip.
  e2e.rig.live.setPosition(118);
  await watcher.snapshot((snapshot) => snapshot.position === 118);
  await expect(blocks(page).nth(SONG_2_SECOND_CHORUS)).toHaveClass(/\bcurrent\b/);
  await expect(page.locator('.chart-block.current')).toHaveCount(1);
  await expect(page.locator('.chart-song')).toHaveText(['Song 1', 'Song 2', 'Song 3']);
  await expect.poll(() => underStrip(page, SONG_2_SECOND_CHORUS)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  // The device keeps the view across a reload.
  await page.reload();
  await expect(viewSelect(page)).toHaveValue('set');
  await expect(page.locator('.chart-song')).toHaveText(['Song 1', 'Song 2', 'Song 3']);
  await expect(blocks(page).nth(SONG_2_SECOND_CHORUS)).toHaveClass(/\bcurrent\b/);

  // Back to This song: the song the playhead is in, alone.
  await viewSelect(page).selectOption({ label: 'This song' });
  await expect(page.locator('.chart-song')).toHaveText(['Song 2']);
  await expect(page.locator('.chart-block-name')).toHaveText(SONG_2);
  await page.reload();
  await expect(viewSelect(page)).toHaveValue('song');
  await expect(page.locator('.chart-song')).toHaveText(['Song 2']);
});

test('a changed font size grows the chart text, and the device keeps it across a reload', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, SET);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  await expect(fontSizeSelect(page)).toHaveValue('medium');

  const size = (selector: string) => page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const medium = await size('.chart-block-name');
  const strip = await size('.chart-strip');
  const select = await size('.part-select');

  await fontSizeSelect(page).selectOption({ label: 'Largest' });
  await expect.poll(() => size('.chart-block-name')).toBeCloseTo(medium * 2, 1);
  expect(await size('.chart-strip')).toBeCloseTo(strip * 2, 1);
  // The selects keep their size.
  expect(await size('.part-select')).toBeCloseTo(select, 1);

  await page.reload();
  await expect(fontSizeSelect(page)).toHaveValue('largest');
  await expect(page.locator('.chart-block-name')).toHaveText(SONG_1);
  expect(await size('.chart-block-name')).toBeCloseTo(medium * 2, 1);

  await fontSizeSelect(page).selectOption({ label: 'Small' });
  await expect.poll(() => size('.chart-block-name')).toBeCloseTo(medium * 0.85, 1);
  await page.reload();
  await expect(fontSizeSelect(page)).toHaveValue('small');
  expect(await size('.chart-block-name')).toBeCloseTo(medium * 0.85, 1);
});

test('the Auto-Lock tip shows on the first open of the view-only page and not after a reload', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, SET);
  await page.goto(e2e.viewerUrl);

  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toContainText('Auto-Lock to Never');
  await expect(page.locator('.part-picker + .auto-lock-tip')).toHaveCount(1);
  // It stays for the visit, the chart view included, and has nothing to tap.
  await pickKeys(page);
  await expect(tip(page)).toBeVisible();
  await expect(page.locator('.font-size-picker + .auto-lock-tip')).toHaveCount(1);
  await expect(page.locator('button')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.chart-block-name')).toHaveText(SONG_1);
  await expect(tip(page)).toHaveCount(0);
  await partSelect(page).selectOption({ label: 'No part' });
  await expect(page.locator('.song')).toHaveCount(3);
  await expect(tip(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.song')).toHaveCount(3);
  await expect(tip(page)).toHaveCount(0);
});

test('the Auto-Lock tip shows on the first open of a device whose part is already kept, and not after a reload', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, SET);
  // A device that kept its part from before the tip, so its first open is the chart view.
  await page.addInitScript(() => localStorage.setItem('setlist-controller.part', 'Keys'));
  await page.goto(e2e.viewerUrl);

  await expect(page.locator('.chart-block-name')).toHaveText(SONG_1);
  await expect(tip(page)).toBeVisible();
  await expect(page.locator('.font-size-picker + .auto-lock-tip')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('.chart-block-name')).toHaveText(SONG_1);
  await expect(tip(page)).toHaveCount(0);
});

test('the Auto-Lock tip is not on the leader page', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, SET);
  await page.goto(e2e.leaderUrl);
  await expect(page.locator('.song')).toHaveCount(3);
  await expect(tip(page)).toHaveCount(0);
  await page.goto(e2e.viewerUrl);
  await expect(tip(page)).toBeVisible();
});
