import { expect, test, type Page } from '@playwright/test';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// How far, in pixels, the progress fill as drawn is from the given share of the bar it fills.
async function fillOffBy(page: Page, share: number): Promise<number> {
  const bar = await page.locator('.now-playing .progress').boundingBox();
  const fill = await page.locator('.now-playing .progress-fill').boundingBox();
  if (!bar || !fill) return Infinity;
  return Math.abs(fill.width - share * bar.width);
}

test('the view-only page draws the song, the section, the bar and the progress where the playhead is', async ({ page }) => {
  e2e = await startE2eRig();
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);

  // SET is in 4/4: song 1's Intro runs beats 0 to 16, and song 2's Opening beats 64 to 80.
  const places = [
    { beats: 6, song: 'Song 1', section: 'Intro', bar: 'bar 2 of 4', fill: 0.375 },
    { beats: 72, song: 'Song 2', section: 'Opening', bar: 'bar 3 of 4', fill: 0.5 },
  ];
  for (const place of places) {
    e2e.rig.live.setPosition(place.beats);
    await watcher.snapshot((snapshot) => snapshot.position === place.beats);

    await expect(page.locator('.now-song')).toHaveText(place.song);
    await expect(page.locator('.now-section-name')).toHaveText(place.section);
    await expect(page.locator('.now-bar')).toHaveText(place.bar);
    await expect.poll(() => fillOffBy(page, place.fill)).toBeLessThanOrEqual(1);
  }
});

test('the view-only page shows the section Live loops, as the leader page does', async ({ context }) => {
  // Live's arrangement loop braces the Verse, beats 16 to 32 of song 1.
  e2e = await startE2eRig({ position: 20, loop: { on: true, start: 16, length: 16 } });
  for (const url of [e2e.viewerUrl, e2e.leaderUrl]) {
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('.now-loop')).toHaveText('Looping Verse.');
  }
});
