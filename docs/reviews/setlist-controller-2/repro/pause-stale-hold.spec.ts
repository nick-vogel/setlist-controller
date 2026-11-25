import { expect, test, type Locator, type Page } from '@playwright/test';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

// Repro: TimelinePauseButton keeps `holding` true when a hold is interrupted by Safe Mode
// turning off from another device, because nothing calls setHolding(false)
// on that path. The test PASSES while the bug is present (it asserts the stale `holding` class).
// The Live-stopped variant does not reproduce: WebKit and Chromium both deliver pointerup and
// pointerleave to the disabled button, so release() runs.

const STOP = '/live/song/stop_playing';
let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

async function fillTransform(pause: Locator): Promise<string> {
  return pause.locator('.stop-fill').evaluate((el) => getComputedStyle(el).transform);
}

async function openTimeline(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole('group', { name: 'Leader view' }).getByRole('button', { name: 'Timeline' }).click();
  await expect(page.locator('.timeline-view')).toBeVisible();
}

async function followUpPressesBehave(page: Page, pause: Locator, rig: E2eRig) {
  // Second question: a short press then a full hold after the stale state.
  await pause.hover();
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  const afterShortRelease = await pause.getAttribute('class');
  await page.waitForTimeout(1100);
  console.log(`[follow-up] class after short release: "${afterShortRelease}"; STOPs after short press: ${rig.rig.received(STOP).length}`);
  expect(rig.rig.received(STOP)).toEqual([]);
  expect(afterShortRelease).not.toMatch(/holding/);

  await page.mouse.down();
  await expect(pause).toHaveClass(/holding/);
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect.poll(() => rig.rig.received(STOP).length).toBe(1);
  await page.waitForTimeout(300);
  console.log(`[follow-up] STOPs after full hold: ${rig.rig.received(STOP).length}`);
  expect(rig.rig.received(STOP).length).toBe(1);
}

test('BUG IF PASSES: Safe Mode turned off from producer mid-hold leaves Pause stuck in "holding" after Safe Mode returns (fine would be: no holding class, fill scaleX(0))', async ({ browser }) => {
  e2e = await startE2eRig({ playing: true, position: 4 });
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((s) => loaded(s) && s.playing);

  // Separate contexts so the producer's clicks cannot blur the leader's button.
  const leaderCtx = await browser.newContext();
  const producerCtx = await browser.newContext();
  try {
    const leader = await leaderCtx.newPage();
    const producer = await producerCtx.newPage();
    await openTimeline(leader, e2e.leaderUrl);
    await producer.goto(e2e.producerUrl);

    const leaderToggle = leader.getByRole('button', { name: /Safe Mode/ });
    const producerToggle = producer.getByRole('button', { name: /Safe Mode/ });
    await expect(leaderToggle).toHaveText('Safe Mode: On');

    const pause = leader.locator('button.timeline-pause');
    await pause.hover();
    await leader.mouse.down();
    await expect(pause).toHaveClass(/holding/);
    await leader.waitForTimeout(300);

    await producerToggle.click();
    await expect(leaderToggle).toHaveText('Safe Mode: Off');
    console.log(`[safe-off] class while Safe Mode off: "${await pause.getAttribute('class')}"`);
    await leader.mouse.up();
    // Lift off the button, as a finger does (touch fires pointerleave right after pointerup).
    await leader.mouse.move(1, 1);

    await producerToggle.click();
    await expect(leaderToggle).toHaveText('Safe Mode: On');
    await leader.waitForTimeout(1200);
    const cls = await pause.getAttribute('class');
    const transform = await fillTransform(pause);
    console.log(`[safe-off] after Safe Mode back on + 1.2s: class="${cls}" transform="${transform}" STOPs=${e2e.rig.received(STOP).length}`);
    expect(e2e.rig.received(STOP)).toEqual([]);
    expect(cls).toMatch(/holding/);
    expect(transform).toBe('matrix(1, 0, 0, 1, 0, 0)');

    await followUpPressesBehave(leader, pause, e2e);
  } finally {
    await leaderCtx.close();
    await producerCtx.close();
  }
});
