import { expect, test } from '@playwright/test';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

const STOP = '/live/song/stop_playing';

test('a short press on Stop sends nothing, and a full hold stops Live', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 0 });
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);
  await page.goto(e2e.leaderUrl);
  const stop = page.getByRole('button', { name: 'Stop Hold to stop' });
  await stop.hover();

  // A brush of the button: well short of the second's hold.
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  // Past the full second from the press, so a stop the release failed to cancel would have gone.
  await page.waitForTimeout(1200);
  expect(e2e.rig.received(STOP)).toEqual([]);
  expect(watcher.received.at(-1)?.playing).toBe(true);

  // A full hold.
  await page.mouse.down();
  await expect(stop).toHaveClass(/holding/);
  await page.waitForTimeout(1200);
  await page.mouse.up();

  await expect.poll(() => e2e?.rig.received(STOP).length).toBe(1);
  await watcher.snapshot((snapshot) => !snapshot.playing);
});

// Playwright's touchscreen only taps, so a held finger is sent as the touch pointer events the
// iPad fires. A touch the browser takes back (a scroll, a callout) cancels the hold.
test('a touch on Stop that the browser cancels sends nothing, and a full touch hold stops Live', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 0 });
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);
  await page.goto(e2e.leaderUrl);
  const stop = page.getByRole('button', { name: 'Stop Hold to stop' });
  const touch = { pointerType: 'touch', pointerId: 2, isPrimary: true, button: 0 };
  // A dispatched event can land the moment the button renders, before its hold is set up, which no
  // finger can do. Wait until the button is stable, as a real press does.
  await stop.click({ trial: true });

  await stop.dispatchEvent('pointerdown', touch);
  await expect(stop).toHaveClass(/holding/);
  await page.waitForTimeout(300);
  await stop.dispatchEvent('pointercancel', touch);
  // Past the full second from the touch, so a stop the cancel failed to stop would have gone.
  await page.waitForTimeout(1200);
  expect(e2e.rig.received(STOP)).toEqual([]);
  expect(watcher.received.at(-1)?.playing).toBe(true);

  await stop.dispatchEvent('pointerdown', touch);
  await page.waitForTimeout(1200);
  await stop.dispatchEvent('pointerup', touch);

  await expect.poll(() => e2e?.rig.received(STOP).length).toBe(1);
  await watcher.snapshot((snapshot) => !snapshot.playing);
});
