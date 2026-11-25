import { expect, test } from '@playwright/test';
import { PROBE_INTERVAL_MS, SILENT_BEFORE_LOST_MS } from '../src/server/live-bridge.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

test('every page says Live is not connected once Live stops, and shows the set again once it starts', async ({ context }) => {
  e2e = await startE2eRig({ position: 4 });
  const pages = [];
  for (const url of [e2e.viewerUrl, e2e.leaderUrl, e2e.setupUrl]) {
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('.now-section-name')).toHaveText('Intro');
    pages.push(page);
  }

  // The server's clock moves only when the test moves it, so Live goes silent for as long as the
  // bridge waits before it takes Live for lost.
  await e2e.rig.stopLive();
  e2e.rig.clock.advance(SILENT_BEFORE_LOST_MS);

  for (const page of pages) {
    // The panel itself, not the setup screen's status line, which says the same words.
    const panel = page.getByRole('alert').filter({ hasText: 'Live not connected' });
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.now-section-name')).toHaveCount(0);
  }

  // A restarted Live answers the bridge's next probe.
  await e2e.rig.startLive();
  e2e.rig.clock.advance(PROBE_INTERVAL_MS);

  for (const page of pages) {
    await expect(page.locator('.now-section-name')).toHaveText('Intro', { timeout: 5000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});
