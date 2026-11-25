import { expect, test, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { loaded } from '../test/harness.ts';
import { startE2eRig, startProxiedE2eRig, type E2eRig } from './rig.ts';

// The chart view's pinned strip on a band member's device: the next section and the bars until it
// starts, counting down as Live plays, "Loop" with no countdown while the leader's loop is on, the
// next song's title and first section in a song's last section, and no countdown in the last section
// of a last song with no End. And the highlight moving at once on the leader's jump.

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// Two titled songs in 4/4. Song 1's Verse and Chorus are 8 bars each, its Bridge 4. Listed in time
// order, so a cue's index is its place, and section indexes into song 1 are its cue indexes.
const SET: CuePoint[] = [
  { name: '1 - Count Off (Made Up Song)', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Chorus', time: 56 },
  { name: '1 - Bridge', time: 88 },
  { name: '1 - End', time: 104 },
  { name: '2 - Count Off (Second Song)', time: 112 },
  { name: '2 - Verse', time: 120 },
  { name: '2 - End', time: 152 },
];
const VERSE_START = 24;
const CHORUS_START = 56;
const BRIDGE_START = 88;
const CHORUS = 3;
const BRIDGE = 4;

// A set whose last song has no End, so no locator closes its last section.
const OPEN_ENDED_SET: CuePoint[] = [
  { name: '1 - Intro (Made Up Song)', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 32 },
  { name: '2 - Count Off (Last Song)', time: 40 },
  { name: '2 - Outro', time: 48 },
];

const JUMP = '/live/song/cue_point/jump';

// At the fake Live's 120 BPM a beat is 500 ms, so a bar of 4/4 is 2 seconds.
const BAR_MS = 2000;
const BEATS_IN_A_BAR = 4;

const partSelect = (page: Page) => page.getByLabel('Part');
const strip = (page: Page) => page.locator('section.chart-strip');
const blocks = (page: Page) => page.locator('.chart-block');

// The page with Keys picked, its chart view drawn for the song the playhead is in.
async function pickKeys(page: Page, song: string) {
  await expect(partSelect(page)).toHaveValue('');
  await partSelect(page).selectOption('Keys');
  await expect(page.locator('.chart-song')).toHaveText(song);
}

test('the strip names the next section and counts down bar by bar as Live plays, pinned to the top of the screen', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: VERSE_START }, SET);
  const { rig } = e2e;
  const watcher = await rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page, 'Made Up Song');

  await expect(strip(page).locator('.label')).toHaveText('Next');
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Chorus');
  await expect(strip(page).locator('.chart-strip-bars')).toHaveText('in 8 bars');
  await expect(strip(page).locator('.chart-strip-song')).toHaveCount(0);

  for (let left = 7; left >= 1; left -= 1) {
    rig.live.advance(BAR_MS);
    const position = VERSE_START + (8 - left) * BEATS_IN_A_BAR;
    await watcher.snapshot((snapshot) => snapshot.position === position);
    await expect(strip(page).locator('.chart-strip-bars')).toHaveText(left === 1 ? 'in 1 bar' : `in ${left} bars`);
    await expect(strip(page).locator('.chart-strip-section')).toHaveText('Chorus');
  }

  // Into the Chorus: it is highlighted, and the strip names the Bridge.
  rig.live.advance(BAR_MS);
  await watcher.snapshot((snapshot) => snapshot.position === CHORUS_START);
  await expect(blocks(page).nth(CHORUS)).toHaveClass(/\bcurrent\b/);
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Bridge');
  await expect(strip(page).locator('.chart-strip-bars')).toHaveText('in 8 bars');

  // The page is scrolled down to the Chorus, and the strip holds to the top of the screen, there
  // still as the band scrolls on.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(strip(page)).toBeInViewport({ ratio: 1 });
  await expect.poll(async () => Math.abs((await strip(page).boundingBox())?.y ?? Infinity)).toBeLessThanOrEqual(1);
  const scrolled = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 200));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled);
  await expect(strip(page)).toBeInViewport({ ratio: 1 });
  expect(Math.abs((await strip(page).boundingBox())?.y ?? Infinity)).toBeLessThanOrEqual(1);
});

test('the leader turns the loop on, and the strip says Loop with no countdown, then names the next section again once it is off', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: CHORUS_START + 2 * BEATS_IN_A_BAR }, SET);
  const { rig } = e2e;
  const watcher = await rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page, 'Made Up Song');
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Bridge');
  await expect(strip(page).locator('.chart-strip-bars')).toHaveText('in 6 bars');

  const leader = await rig.connectLeader();
  await leader.snapshot(loaded);
  leader.send({ kind: 'loop' });
  await watcher.snapshot((snapshot) => snapshot.loop !== null);

  await expect(strip(page).locator('.chart-strip-loop')).toHaveText('Loop');
  await expect(strip(page).locator('.chart-strip-bars')).toHaveCount(0);
  await expect(strip(page).locator('.chart-strip-section')).toHaveCount(0);
  await expect(strip(page)).toHaveText('Loop');

  leader.send({ kind: 'loop' });
  await watcher.snapshot((snapshot) => snapshot.loop === null);

  await expect(strip(page).locator('.chart-strip-loop')).toHaveCount(0);
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Bridge');
  await expect(strip(page).locator('.chart-strip-bars')).toHaveText('in 6 bars');
});

test("in a song's last section the strip names the next song's title and first section, and the page changes song when it starts", async ({ page }) => {
  e2e = await startE2eRig({ playing: false, position: BRIDGE_START }, SET);
  const { rig } = e2e;
  const watcher = await rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page, 'Made Up Song');

  await expect(strip(page).locator('.chart-strip-song')).toHaveText('Second Song');
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Count Off');
  await expect(strip(page).locator('.chart-strip-bars')).toHaveText('in 4 bars');

  // Into song 2's Count Off: the page shows song 2, its own blocks, and the strip names its Verse.
  rig.live.setPosition(112);
  await watcher.snapshot((snapshot) => snapshot.position === 112);
  await expect(page.locator('.chart-song')).toHaveText('Second Song');
  await expect(page.locator('.chart-block-name')).toHaveText(['Count Off', 'Verse', 'End']);
  await expect(blocks(page).nth(0)).toHaveClass(/\bcurrent\b/);
  await expect(strip(page).locator('.chart-strip-song')).toHaveCount(0);
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Verse');
  await expect(strip(page).locator('.chart-strip-bars')).toHaveText('in 2 bars');
});

test("the leader's jump moves the highlight at once, stopped and on the bar line while playing", async ({ page }) => {
  e2e = await startE2eRig({ playing: false, position: VERSE_START }, SET);
  const { rig } = e2e;
  const watcher = await rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page, 'Made Up Song');
  await expect(blocks(page).nth(2)).toHaveClass(/\bcurrent\b/);

  const leader = await rig.connectLeader();
  await leader.snapshot(loaded);

  // Stopped, Live jumps at once.
  leader.send({ kind: 'jump', song: 1, section: CHORUS });
  await watcher.snapshot((snapshot) => snapshot.now?.section === CHORUS);
  await expect(blocks(page).nth(CHORUS)).toHaveClass(/\bcurrent\b/);
  await expect(page.locator('.chart-block.current')).toHaveCount(1);
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Bridge');

  // Playing, Live jumps on the next bar line.
  rig.live.setPlaying(true);
  await watcher.snapshot((snapshot) => snapshot.playing);
  leader.send({ kind: 'jump', song: 1, section: BRIDGE });
  await watcher.snapshot((snapshot) => snapshot.jump?.section === BRIDGE);
  // The jump reaches Live before the playhead moves, or Live would wait on the bar line after.
  await expect.poll(() => rig.received(JUMP).length).toBe(2);
  rig.live.advance(BAR_MS);
  await watcher.snapshot((snapshot) => snapshot.now?.section === BRIDGE);
  await expect(blocks(page).nth(BRIDGE)).toHaveClass(/\bcurrent\b/);
  await expect(page.locator('.chart-block.current')).toHaveCount(1);
  await expect(strip(page).locator('.chart-strip-song')).toHaveText('Second Song');
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Count Off');
});

test("in the last section of a last song with no End, the strip says Last section with no countdown", async ({ page }) => {
  e2e = await startE2eRig({ playing: false, position: 50 }, OPEN_ENDED_SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page, 'Last Song');

  await expect(blocks(page).nth(1)).toHaveClass(/\bcurrent\b/);
  await expect(strip(page).locator('.chart-strip-section')).toHaveText('Last section');
  await expect(strip(page).locator('.chart-strip-bars')).toHaveCount(0);
  await expect(strip(page).locator('.chart-strip-song')).toHaveCount(0);
  await expect(strip(page)).toHaveText('Last section');
});

test('the Reconnecting banner shows over the strip when the server drops with the chart view scrolled down', async ({ page }) => {
  const proxied = await startProxiedE2eRig({ playing: false, position: CHORUS_START }, SET);
  e2e = proxied;
  const watcher = await proxied.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(proxied.viewerUrl);
  await pickKeys(page, 'Made Up Song');

  // Scrolled down to the Chorus, so the strip is held to the top of the screen, where the banner goes.
  await expect(blocks(page).nth(CHORUS)).toHaveClass(/\bcurrent\b/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(async () => Math.abs((await strip(page).boundingBox())?.y ?? Infinity)).toBeLessThanOrEqual(1);

  proxied.proxy.drop();
  const banner = page.locator('.server-lost');
  await expect(banner).toHaveText('Reconnecting to the server.');
  // The page keeps its last snapshot, so the strip is still drawn under the banner.
  await expect(strip(page)).toHaveCount(1);
  const box = await banner.boundingBox();
  if (!box) throw new Error('The banner has no box');
  // What a band member sees at the banner's centre is the banner, not the strip under it.
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.server-lost, .chart-strip')?.className ?? null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(hit).toBe('server-lost');
});
