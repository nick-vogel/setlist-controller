import { expect, test, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { SILENT_BEFORE_LOST_MS } from '../src/server/live-bridge.ts';
import { loaded } from '../test/harness.ts';
import { startE2eRig, startProxiedE2eRig, type E2eRig } from './rig.ts';

// The stage status line on the leader's iPad and on a phone: one line pinned to the top of the leader
// page while it scrolls, naming the song, the section, the next section and the transport, and moving
// at once as Live plays, a jump waits, and Live or the server goes.

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// Eight titled songs in 4/4, each an Intro, a Verse and a Chorus of 4 bars and an End, so the leader
// page is taller than an iPad's screen. Song n starts at beat 64 * (n - 1).
const SONGS = 8;
const SET: CuePoint[] = Array.from({ length: SONGS }, (_, index) => {
  const number = index + 1;
  const start = 64 * index;
  return [
    { name: `${number} - Intro (Song Number ${number})`, time: start },
    { name: `${number} - Verse`, time: start + 16 },
    { name: `${number} - Chorus`, time: start + 32 },
    { name: `${number} - End`, time: start + 48 },
  ];
}).flat();
const CHORUS = 2;

// At the fake Live's 120 BPM a beat is 500 ms, so a bar of 4/4 is 2 seconds.
const BAR_MS = 2000;

const statusLine = (page: Page) => page.getByRole('region', { name: 'Stage status' });

// The line is at the top of the screen, whole, and one line of text tall.
async function expectPinned(page: Page) {
  await expect(statusLine(page)).toBeInViewport({ ratio: 1 });
  await expect.poll(async () => Math.abs((await statusLine(page).boundingBox())?.y ?? Infinity)).toBeLessThanOrEqual(1);
  const lines = await statusLine(page).evaluate((element) => {
    const style = getComputedStyle(element);
    const content = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    // The tallest child sets the line's height: the transport's pill, a little taller than the text.
    const tallest = Math.max(...[...element.children].map((child) => child.getBoundingClientRect().height));
    return content / tallest;
  });
  expect(lines).toBeLessThan(1.5);
}

test('the status line names the song, the section and the next section, pinned to the top of the leader page as it scrolls', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 20 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);
  await page.goto(e2e.leaderUrl);

  await expect(statusLine(page).locator('.stage-status-state')).toHaveText('Playing');
  await expect(statusLine(page).locator('.stage-status-song')).toHaveText('Song Number 1');
  await expect(statusLine(page).locator('.stage-status-section')).toHaveText('Verse');
  await expect(statusLine(page).locator('.stage-status-next')).toHaveText('Next Chorus');

  // Far shorter than the now-playing panel under it.
  const line = await statusLine(page).boundingBox();
  const panel = await page.getByRole('region', { name: 'Now playing' }).boundingBox();
  expect(line && panel && line.height < panel.height / 2).toBe(true);

  // Down the setlist to the last song, and back up part of the way.
  await page.getByRole('heading', { name: `Song Number ${SONGS}` }).scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expectPinned(page);
  await page.evaluate(() => window.scrollBy(0, -150));
  await expectPinned(page);

  // Pinned, and still live: Live moves on to the Chorus while the leader is scrolled down.
  e2e.rig.live.setPosition(32);
  await expect(statusLine(page).locator('.stage-status-section')).toHaveText('Chorus');
  await expect(statusLine(page).locator('.stage-status-next')).toHaveText('Next End');
  await expectPinned(page);
});

test('the status line says a jump waits for the downbeat, then names the section it lands on', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 20 }, SET);
  const leader = await e2e.rig.connectLeader();
  await leader.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);
  await page.goto(e2e.leaderUrl);
  await expect(statusLine(page).locator('.stage-status-section')).toHaveText('Verse');

  leader.send({ kind: 'jump', song: 1, section: CHORUS });
  await leader.snapshot((snapshot) => snapshot.jump?.section === CHORUS);
  await expect(statusLine(page).locator('.stage-status-state')).toHaveText('Jumping to Chorus');
  await expect(statusLine(page).locator('.stage-status-section')).toHaveText('Verse');

  // The bar line at beat 24: the jump lands.
  e2e.rig.live.advance(BAR_MS);
  await leader.snapshot((snapshot) => snapshot.jump === null && snapshot.now?.section === CHORUS);
  await expect(statusLine(page).locator('.stage-status-state')).toHaveText('Playing');
  await expect(statusLine(page).locator('.stage-status-section')).toHaveText('Chorus');

  e2e.rig.live.setPlaying(false);
  await expect(statusLine(page).locator('.stage-status-state')).toHaveText('Stopped');
});

test('the status line says Live is not connected, and that the playhead is between songs', async ({ page }) => {
  e2e = await startE2eRig({ playing: false, position: 52 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.leaderUrl);
  // Song 1's End, before song 2's Intro.
  await expect(statusLine(page).locator('.stage-status-state')).toHaveText('Stopped');
  await expect(statusLine(page).locator('.stage-status-message')).toHaveText('Between songs');

  // The server's clock moves only when the test moves it, so Live goes silent for as long as the
  // bridge waits before it takes Live for lost.
  await e2e.rig.stopLive();
  e2e.rig.clock.advance(SILENT_BEFORE_LOST_MS);
  await expect(statusLine(page)).toHaveText('Live not connected');
  await expect(statusLine(page)).toHaveClass(/\bstage-status-disconnected\b/);
});

test('the status line says the server is out of reach while the page reconnects', async ({ page }) => {
  const proxied = await startProxiedE2eRig({ playing: true, position: 20 }, SET);
  e2e = proxied;
  await page.goto(e2e.leaderUrl);
  await expect(statusLine(page).locator('.stage-status-section')).toHaveText('Verse');

  proxied.proxy.drop();
  await expect(statusLine(page)).toHaveText('Server disconnected');
});
