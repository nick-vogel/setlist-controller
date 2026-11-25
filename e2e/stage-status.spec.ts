import { expect, test, type Locator, type Page } from '@playwright/test';
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

// Whether the line or the timeline is what shows at a point on the screen, or at an element's centre.
async function topmostAt(page: Page, point: { x: number; y: number }): Promise<string | null> {
  return page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y)?.closest('.stage-status, .timeline-viewport');
    return hit ? (hit.classList.contains('stage-status') ? 'stage-status' : 'timeline-viewport') : null;
  }, point);
}

async function topmostAtCentre(page: Page, locator: Locator): Promise<string | null> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The element has no box');
  return topmostAt(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

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
  // In the Live not connected panel's warning colours.
  await expect(statusLine(page)).toHaveCSS('background-color', 'rgb(42, 18, 21)');
  await expect(statusLine(page).locator('.stage-status-message')).toHaveCSS('color', 'rgb(255, 99, 105)');
});

test('the status line says the server is out of reach while the page reconnects', async ({ page }) => {
  const proxied = await startProxiedE2eRig({ playing: true, position: 20 }, SET);
  e2e = proxied;
  await page.goto(e2e.leaderUrl);
  await expect(statusLine(page).locator('.stage-status-section')).toHaveText('Verse');

  // Scrolled down the setlist, where the Reconnecting banner of the other pages would cover the line.
  await page.getByRole('heading', { name: `Song Number ${SONGS}` }).scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  proxied.proxy.drop();
  await expect(statusLine(page)).toHaveText('Reconnecting to the server.');
  // The line says it once, in the banner's colours, and nothing covers it.
  await expect(page.getByText('Reconnecting to the server.')).toHaveCount(1);
  await expect(statusLine(page)).toHaveCSS('background-color', 'rgb(42, 31, 5)');
  await expect(statusLine(page).getByRole('status')).toHaveCSS('color', 'rgb(240, 180, 41)');
  await expectPinned(page);
  expect(await topmostAtCentre(page, statusLine(page))).toBe('stage-status');
});

test("the status line stays over the timeline's playhead as the leader page scrolls under it", async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 20 }, SET);
  await page.goto(e2e.leaderUrl);
  await page.getByRole('group', { name: 'Leader view' }).getByRole('button', { name: 'Timeline' }).click();
  const viewport = page.locator('.timeline-viewport');
  await expect(viewport).toBeVisible();

  // Room below the timeline, so the page scrolls on an iPad's screen too. The playhead takes no
  // pointer events, so here it takes them, for the hit test to find it where it paints.
  await page.addStyleTag({ content: 'main.timeline-page { padding-bottom: 150vh; } .timeline-playhead { pointer-events: auto; }' });
  const playhead = page.locator('.timeline-playhead');
  await expect(playhead).toBeVisible();

  // Scrolled until the top of the playhead, which runs the timeline's height, is under the line.
  const top = await viewport.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), top + 4);
  await expectPinned(page);
  const line = await statusLine(page).boundingBox();
  const under = await playhead.boundingBox();
  if (!line || !under) throw new Error('The line or the playhead has no box');
  const point = { x: under.x + under.width / 2, y: line.y + line.height / 2 };
  expect(under.y < point.y && under.y + under.height > point.y).toBe(true);

  // What the leader sees there is the line, not the playhead's red line over it.
  expect(await topmostAt(page, point)).toBe('stage-status');
});
