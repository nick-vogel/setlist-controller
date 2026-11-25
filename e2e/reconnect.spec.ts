import { expect, test, type Page } from '@playwright/test';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded } from '../test/harness.ts';
import { CHORUS, startProxiedE2eRig, VERSE, type ProxiedE2eRig } from './rig.ts';

let e2e: ProxiedE2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

const JUMP = '/live/song/cue_point/jump';
// The page shows the current section here.
const currentSection = (page: Page) => page.locator('.now-section-name');

// Moves the playhead while the page is away: Live is stopped, so a jump lands at once.
async function jumpWhileAway(section: number, beats: number) {
  if (!e2e) throw new Error('Start the rig first');
  const leader = await e2e.rig.connectLeader();
  leader.send({ kind: 'jump', song: 1, section });
  await leader.snapshot((snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats);
}

// Counts the page's loads from here on. A reload would also clear the marker this sets on window.
async function watchForReload(page: Page) {
  let loads = 0;
  page.on('load', () => (loads += 1));
  await page.evaluate(() => Object.assign(window, { notReloaded: true }));
  return async () => {
    expect(loads).toBe(0);
    expect(await page.evaluate(() => 'notReloaded' in window)).toBe(true);
  };
}

test('after the connection drops and returns, the page shows the current state without a reload', async ({ page }) => {
  e2e = await startProxiedE2eRig({ playing: false, position: 0 });
  await page.goto(e2e.viewerUrl);
  await expect(currentSection(page)).toHaveText('Intro');
  const notReloaded = await watchForReload(page);

  e2e.proxy.drop();
  await jumpWhileAway(CHORUS, 32);
  e2e.proxy.restore();

  await expect(currentSection(page)).toHaveText('Chorus', { timeout: 5000 });
  await notReloaded();
});

test('says the server is out of reach while the connection is down, and stops saying so once it is back', async ({ page }) => {
  e2e = await startProxiedE2eRig({ playing: false, position: 0 });
  await page.goto(e2e.leaderUrl);
  await expect(currentSection(page)).toHaveText('Intro');
  await expect(page.getByText('Reconnecting to the server.')).toHaveCount(0);

  e2e.proxy.drop();
  await expect(page.getByText('Reconnecting to the server.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();

  e2e.proxy.restore();
  await expect(page.getByText('Reconnecting to the server.')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeEnabled();
});

test('after the device sleeps and wakes, the page shows the current state without a reload', async ({ page }) => {
  e2e = await startProxiedE2eRig({ playing: false, position: 0 });
  await page.goto(e2e.viewerUrl);
  await expect(currentSection(page)).toHaveText('Intro');
  const notReloaded = await watchForReload(page);

  // Asleep: the page is hidden, and its connection goes half-open, so no close ever reaches it.
  await setVisibility(page, 'hidden');
  e2e.proxy.freeze();
  await jumpWhileAway(CHORUS, 32);
  // Longer than the longest wait between tries: the page has not noticed on its own.
  await page.waitForTimeout(2000);
  await expect(currentSection(page)).toHaveText('Intro');

  await setVisibility(page, 'visible');

  await expect(currentSection(page)).toHaveText('Chorus', { timeout: 3000 });
  await notReloaded();
});

test('the leader page comes back as the leader', async ({ page }) => {
  e2e = await startProxiedE2eRig({ playing: false, position: 0 });
  await page.goto(e2e.leaderUrl);
  await expect(currentSection(page)).toHaveText('Intro');

  e2e.proxy.drop();
  await jumpWhileAway(VERSE, 16);
  e2e.proxy.restore();
  await expect(currentSection(page)).toHaveText('Verse', { timeout: 5000 });
  const jumpsBefore = e2e.rig.received(JUMP).length;

  await page.getByRole('button', { name: 'Chorus', exact: true }).click();

  await expect.poll(() => e2e?.rig.received(JUMP).slice(jumpsBefore)).toEqual([{ address: JUMP, args: [CHORUS], types: 'i' }]);
  await expect(currentSection(page)).toHaveText('Chorus');
});

// Playwright has no page visibility API, so this sets what the document reports and fires the event
// a browser fires on sleep and wake.
async function setVisibility(page: Page, state: DocumentVisibilityState) {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}
