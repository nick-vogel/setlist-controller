import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { SILENT_BEFORE_LOST_MS } from '../src/server/live-bridge.ts';
import { SOCKET_PATHS } from '../src/shared/routes.ts';
import { SET_MANIFEST_FILE, type SetManifest } from '../src/shared/set-manifest.ts';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

// The chart view on a band member's device: the part picker, one block per locator in played order,
// the current block highlighted and scrolled to the top, the part kept across a reload, and the
// viewer connection it shares with the view-only page, which never controls Live. Then each block's
// lyrics and chords from the set manifest, and a changed manifest reaching the open page. Then each
// part's default display, a changed display kept for the part, and a song with no chart.

let e2e: E2eRig | undefined;
// The folder a test's set manifest goes in, inside the worktree's dist, never the home folder.
let folder: string | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
});

// Song 1 plays its Chorus three times, and every section name is a bar count of its own in 4/4, so a
// block's name and count name one section. Song 2 is short. Section indexes into song 1 are its cue
// indexes, since song 1 comes first.
const CHART_SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Chorus', time: 56 },
  { name: '1 - Verse', time: 80 },
  { name: '1 - Chorus', time: 112 },
  { name: '1 - Bridge', time: 136 },
  { name: '1 - Chorus', time: 148 },
  { name: '1 - End', time: 172 },
  { name: '2 - Intro', time: 176 },
  { name: '2 - End', time: 192 },
];
const NAMES = ['Count Off', 'Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'End'];
const BARS = ['2 bars', '4 bars', '8 bars', '6 bars', '8 bars', '6 bars', '3 bars', '6 bars'];
const VERSE = 2;
const FIRST_CHORUS = 3;
const SECOND_CHORUS = 5;
const LAST_CHORUS = 7;

const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';

const partSelect = (page: Page) => page.getByLabel('Part');
const displaySelect = (page: Page) => page.getByLabel('Display');
const blocks = (page: Page) => page.locator('.chart-block');

// How far a block's top sits from the pinned strip's bottom edge, which the current block scrolls to.
async function underStrip(page: Page, block: number) {
  const strip = await page.locator('.chart-strip').boundingBox();
  const top = (await blocks(page).nth(block).boundingBox())?.y;
  return strip && top !== undefined ? Math.abs(top - (strip.y + strip.height)) : Infinity;
}

// The page with Keys picked, its chart view drawn for song 1.
async function pickKeys(page: Page) {
  await expect(partSelect(page)).toHaveValue('');
  await partSelect(page).selectOption('Keys');
  await expect(page.locator('.chart-block-name')).toHaveText(NAMES);
}

test('a part opens the chart view, one block per locator in played order, and the highlight follows the playhead', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, CHART_SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);
  await expect(page.locator('.song')).toHaveCount(2);

  await pickKeys(page);
  await expect(page.locator('.chart-song')).toHaveText('Song 1');
  await expect(page.locator('.chart-block-bars')).toHaveText(BARS);
  // The chart view replaces the setlist and the now-playing panel.
  await expect(page.locator('.song')).toHaveCount(0);
  await expect(page.locator('.now-playing')).toHaveCount(0);
  await expect(page.locator('.chart-block.current')).toHaveCount(1);
  await expect(blocks(page).nth(1)).toHaveClass(/\bcurrent\b/);

  // Into the second Chorus, and not the first.
  e2e.rig.live.setPosition(116);
  await watcher.snapshot((snapshot) => snapshot.position === 116);
  await expect(blocks(page).nth(SECOND_CHORUS)).toHaveClass(/\bcurrent\b/);
  await expect(page.locator('.chart-block.current')).toHaveCount(1);
  await expect(blocks(page).nth(FIRST_CHORUS)).not.toHaveClass(/\bcurrent\b/);

  // Into song 2.
  e2e.rig.live.setPosition(180);
  await watcher.snapshot((snapshot) => snapshot.position === 180);
  await expect(page.locator('.chart-song')).toHaveText('Song 2');
  await expect(page.locator('.chart-block-name')).toHaveText(['Intro', 'End']);
  await expect(blocks(page).nth(0)).toHaveClass(/\bcurrent\b/);
});

test('the current block scrolls to the top of the page, just under the pinned strip', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, CHART_SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);

  // The last Chorus, low on the page.
  e2e.rig.live.setPosition(150);
  await watcher.snapshot((snapshot) => snapshot.position === 150);
  await expect(blocks(page).nth(LAST_CHORUS)).toHaveClass(/\bcurrent\b/);
  await expect.poll(() => underStrip(page, LAST_CHORUS)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  // The strip holds to the top of the screen over it.
  expect(Math.abs((await page.locator('.chart-strip').boundingBox())?.y ?? Infinity)).toBeLessThanOrEqual(1);

  // Back up to the Count Off, the first block, which also goes to the top, under the strip.
  e2e.rig.live.setPosition(2);
  await watcher.snapshot((snapshot) => snapshot.position === 2);
  await expect(blocks(page).nth(0)).toHaveClass(/\bcurrent\b/);
  await expect.poll(() => underStrip(page, 0)).toBeLessThanOrEqual(1);
});

test('the Live not connected panel shows on screen when Live stops with the chart view scrolled down', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, CHART_SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);

  // The last Chorus, low on the page, so the page is scrolled down.
  e2e.rig.live.setPosition(150);
  await watcher.snapshot((snapshot) => snapshot.position === 150);
  await expect.poll(() => underStrip(page, LAST_CHORUS)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  // Live goes silent for as long as the bridge waits before it takes Live for lost.
  await e2e.rig.stopLive();
  e2e.rig.clock.advance(SILENT_BEFORE_LOST_MS);

  const panel = page.getByRole('alert').filter({ hasText: 'Live not connected' });
  await expect(panel).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.chart-block.current')).toHaveCount(0);
  // On screen, not above the blocks the page is scrolled to, and still there as the band scrolls on.
  await expect(panel).toBeInViewport({ ratio: 1 });
  const scrolled = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 200));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled);
  await expect(panel).toBeInViewport({ ratio: 1 });
});

test('the device keeps the part across a reload, and No part goes back to the view-only page', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, CHART_SET);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);

  await page.reload();
  await expect(partSelect(page)).toHaveValue('Keys');
  await expect(page.locator('.chart-block-name')).toHaveText(NAMES);
  await expect(page.locator('.song')).toHaveCount(0);

  await partSelect(page).selectOption({ label: 'No part' });
  await expect(page.locator('.song')).toHaveCount(2);
  await expect(page.locator('.chart-block')).toHaveCount(0);

  await page.reload();
  await expect(partSelect(page)).toHaveValue('');
  await expect(page.locator('.song')).toHaveCount(2);
  await expect(page.locator('.chart-block')).toHaveCount(0);
});

test("the chart view has no button, and a stop and a jump forced from its socket are rejected", async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 10 }, CHART_SET);
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(new URL(socket.url()).pathname));
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  await expect(page.getByRole('button')).toHaveCount(0);
  // The chart view watches on the view-only socket.
  expect(sockets).toEqual([SOCKET_PATHS.viewer]);

  // Force a stop and a jump to the first Chorus on that socket. The server answers the closing
  // handshake only after it has read every frame before it, so once the close comes back the server
  // has handled both commands.
  await page.evaluate(
    async ({ path, section }) => {
      const socket = new WebSocket(`ws://${location.host}${path}`);
      await new Promise((resolve) => socket.addEventListener('open', resolve));
      socket.send(JSON.stringify({ kind: 'stop' }));
      socket.send(JSON.stringify({ kind: 'jump', song: 1, section }));
      const closed = new Promise((resolve) => socket.addEventListener('close', resolve));
      socket.close();
      await closed;
    },
    { path: SOCKET_PATHS.viewer, section: FIRST_CHORUS },
  );

  // The leader's jump, sent after, reaches Live, and Live's messages arrive in order, so anything the
  // page sent would have reached it first.
  const leader = await e2e.rig.connectLeader();
  await leader.snapshot(loaded);
  leader.send({ kind: 'jump', song: 1, section: VERSE });
  await expect.poll(() => e2e?.rig.received(JUMP).length).toBe(1);

  expect(e2e.rig.received(JUMP)).toEqual([{ address: JUMP, args: [VERSE], types: 'i' }]);
  expect(e2e.rig.received(STOP)).toEqual([]);
  expect(leader.received.at(-1)?.playing).toBe(true);
  // The chart view marks the leader's waiting jump, never the forced one.
  await expect(blocks(page).nth(VERSE)).toHaveClass(/\bwaiting\b/);
  await expect(page.locator('.chart-block.waiting')).toHaveCount(1);
});

test('the chart view loads nothing from anywhere but the laptop', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, CHART_SET);
  const host = new URL(e2e.baseUrl).host;
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  page.on('websocket', (socket) => requested.push(socket.url()));
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  await page.reload();
  await expect(page.locator('.chart-block-name')).toHaveText(NAMES);

  expect(requested.length).toBeGreaterThan(0);
  expect(requested.filter((url) => new URL(url).host !== host)).toEqual([]);
});

// Made Up Song, with a made-up chart of one VERSE and two CHORUS headings, and Short Song, with none.
const FIXTURE = resolve(import.meta.dirname, '../test/fixtures/set-manifest/set-manifest.json');
// CHART_SET's sections, with each song's title on its first locator, so a chart matches it.
const TITLED_SET: CuePoint[] = [
  { name: '1 - Count Off (Made Up Song)', time: 0 },
  ...CHART_SET.slice(1, 9),
  { name: '2 - Intro (Short Song)', time: 176 },
  { name: '2 - End', time: 192 },
];
const lines = (page: Page, block: number) => blocks(page).nth(block).locator('.chart-line');

// A rig whose server reads the fixture, copied into a folder of the test's own, and the manifest's path.
async function rigWithManifest(): Promise<{ e2e: E2eRig; path: string }> {
  await mkdir(resolve(import.meta.dirname, '../dist'), { recursive: true });
  folder = await mkdtemp(resolve(import.meta.dirname, '../dist/chart-e2e-'));
  const path = join(folder, SET_MANIFEST_FILE);
  await copyFile(FIXTURE, path);
  e2e = await startE2eRig({ position: 10 }, TITLED_SET, { setManifest: path });
  return { e2e, path };
}

test("each block shows its chords over its lyrics, a repeated Chorus taking its matched heading each time, and Count Off its name and bar count only", async ({ page }) => {
  const { e2e } = await rigWithManifest();
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  await expect(page.locator('.chart-song')).toHaveText('Made Up Song');
  await expect(page.locator('.chart-block-bars')).toHaveText(BARS);

  await expect(lines(page, 1)).toHaveText(['G C G D']);
  await expect(lines(page, VERSE)).toHaveText(['GMorning comes on Cmade up wings', 'EmEvery line a D/F#borrowed thing']);
  // The first Chorus takes the first CHORUS heading, with its note; the second the second, and the
  // third, past the chart's last CHORUS, the last.
  await expect(lines(page, FIRST_CHORUS)).toHaveText(['CSing it Gonce, the Dfirst time round']);
  await expect(blocks(page).nth(FIRST_CHORUS).locator('.chart-note')).toHaveText('Keys only');
  await expect(lines(page, SECOND_CHORUS)).toHaveText(['CSing it Gtwice, a Dsecond sound']);
  await expect(lines(page, LAST_CHORUS)).toHaveText(['CSing it Gtwice, a Dsecond sound']);
  await expect(blocks(page).nth(SECOND_CHORUS).locator('.chart-note')).toHaveCount(0);

  // Count Off and End show their name and bar count alone.
  await expect(blocks(page).nth(0)).toHaveText('Count Off2 bars');
  await expect(blocks(page).nth(0).locator('.chart-lines')).toHaveCount(0);
  await expect(blocks(page).nth(8).locator('.chart-lines')).toHaveCount(0);

  // Each chord sits over the words it falls on: above them, from the same left edge.
  const chunk = blocks(page).nth(SECOND_CHORUS).locator('.chart-chunk').nth(1);
  await expect(chunk.locator('.chart-chord')).toHaveText('G');
  await expect(chunk.locator('.chart-lyric')).toHaveText('twice, a ');
  const chord = await chunk.locator('.chart-chord').boundingBox();
  const lyric = await chunk.locator('.chart-lyric').boundingBox();
  expect(chord && lyric).toBeTruthy();
  expect(chord!.y + chord!.height).toBeLessThanOrEqual(lyric!.y + 1);
  expect(Math.abs(chord!.x - lyric!.x)).toBeLessThanOrEqual(1);
});

test('a changed manifest reaches the open page, with no reload', async ({ page }) => {
  const { e2e, path } = await rigWithManifest();
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  await expect(lines(page, SECOND_CHORUS)).toHaveText(['CSing it Gtwice, a Dsecond sound']);
  // Gone if the page reloads.
  await page.evaluate(() => Object.assign(window, { notReloaded: true }));

  const manifest = JSON.parse(await readFile(path, 'utf8')) as SetManifest;
  const song = manifest.songs[0]!;
  song.chartText = song.chartText!.replace('[C]Sing it [G]twice, a [D]second sound', '[Am]A changed [F]chorus line');
  await writeFile(path, JSON.stringify(manifest));

  await expect(lines(page, SECOND_CHORUS)).toHaveText(['AmA changed Fchorus line']);
  await expect(lines(page, LAST_CHORUS)).toHaveText(['AmA changed Fchorus line']);
  await expect(lines(page, FIRST_CHORUS)).toHaveText(['CSing it Gonce, the Dfirst time round']);
  expect(await page.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded)).toBe(true);
});

// The display each part opens on, as the Display select shows it.
const DEFAULT_DISPLAYS = [
  ['Keys', 'chords-over-lyrics'],
  ['Guitar', 'chords-over-lyrics'],
  ['Bass', 'chords-over-lyrics'],
  ['Vocals', 'lyrics-only'],
  ['Drums', 'section-map'],
] as const;
const VERSE_CHORDS = ['GMorning comes on Cmade up wings', 'EmEvery line a D/F#borrowed thing'];
const VERSE_WORDS = ['Morning comes on made up wings', 'Every line a borrowed thing'];

test('each part opens on its default display', async ({ page }) => {
  const { e2e } = await rigWithManifest();
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  await expect(lines(page, VERSE)).toHaveText(VERSE_CHORDS);

  for (const [part, display] of DEFAULT_DISPLAYS) {
    await partSelect(page).selectOption(part);
    await expect(displaySelect(page), part).toHaveValue(display);
    await expect(page.locator('.chart-block-name'), part).toHaveText(NAMES);
    await expect(page.locator('.chart-block-bars'), part).toHaveText(BARS);
    if (display === 'chords-over-lyrics') {
      // The chords over the lyrics, the Intro's chords alone among them.
      await expect(lines(page, VERSE), part).toHaveText(VERSE_CHORDS);
      await expect(blocks(page).nth(VERSE).locator('.chart-chord').first(), part).toHaveText('G');
      await expect(lines(page, 1), part).toHaveText(['G C G D']);
    } else if (display === 'lyrics-only') {
      // The words and the note, with no chord, and the Intro, all chords, its name and bar count alone.
      await expect(lines(page, VERSE), part).toHaveText(VERSE_WORDS);
      await expect(blocks(page).nth(FIRST_CHORUS).locator('.chart-note'), part).toHaveText('Keys only');
      await expect(page.locator('.chart-chord'), part).toHaveCount(0);
      await expect(blocks(page).nth(1).locator('.chart-lines'), part).toHaveCount(0);
    } else {
      // Every block's name and bar count, with no lyrics and no chords.
      await expect(page.locator('.chart-lines'), part).toHaveCount(0);
      await expect(blocks(page).nth(VERSE), part).toHaveText('Verse8 bars');
    }
  }
  await expect(page.getByRole('button')).toHaveCount(0);
});

test('a changed display is kept for the part across a reload', async ({ page }) => {
  const { e2e } = await rigWithManifest();
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  await expect(displaySelect(page)).toHaveValue('chords-over-lyrics');
  await displaySelect(page).selectOption({ label: 'Lyrics only' });
  await expect(lines(page, VERSE)).toHaveText(VERSE_WORDS);
  await expect(page.locator('.chart-chord')).toHaveCount(0);

  await page.reload();
  await expect(partSelect(page)).toHaveValue('Keys');
  await expect(displaySelect(page)).toHaveValue('lyrics-only');
  await expect(lines(page, VERSE)).toHaveText(VERSE_WORDS);
  await expect(page.locator('.chart-chord')).toHaveCount(0);

  // Bass keeps its own default, and Keys its stored display.
  await partSelect(page).selectOption('Bass');
  await expect(displaySelect(page)).toHaveValue('chords-over-lyrics');
  await expect(lines(page, VERSE)).toHaveText(VERSE_CHORDS);
  await partSelect(page).selectOption('Keys');
  await expect(displaySelect(page)).toHaveValue('lyrics-only');
  await expect(lines(page, VERSE)).toHaveText(VERSE_WORDS);
});

const viewSelect = (page: Page) => page.getByLabel('View');

// A Display change resizes every block above the current one, so the current block scrolls again,
// in either view, and is not left behind the strip.
for (const view of ['This song', 'Whole set'] as const) {
  test(`a changed display keeps the current block just under the pinned strip, in the ${view} view`, async ({ page }) => {
    const { e2e } = await rigWithManifest();
    const watcher = await e2e.rig.connectViewer();
    await watcher.snapshot(loaded);
    await page.goto(e2e.viewerUrl);
    await pickKeys(page);
    await viewSelect(page).selectOption({ label: view });
    await expect(lines(page, VERSE)).toHaveText(VERSE_CHORDS);

    // The last Chorus, low on the page.
    e2e.rig.live.setPosition(150);
    await watcher.snapshot((snapshot) => snapshot.position === 150);
    await expect(blocks(page).nth(LAST_CHORUS)).toHaveClass(/\bcurrent\b/);
    await expect.poll(() => underStrip(page, LAST_CHORUS)).toBeLessThanOrEqual(1);

    await displaySelect(page).selectOption({ label: 'Section map' });
    await expect(page.locator('.chart-lines')).toHaveCount(0);
    await expect.poll(() => underStrip(page, LAST_CHORUS)).toBeLessThanOrEqual(1);
  });

  // The page draws the blocks before the charts arrive, and the lines then grow every block above the
  // current one, so the current block scrolls again once they do.
  test(`a reload mid-set keeps the current block just under the pinned strip once the charts arrive, in the ${view} view`, async ({ page }) => {
    const { e2e } = await rigWithManifest();
    const watcher = await e2e.rig.connectViewer();
    await watcher.snapshot(loaded);
    await page.goto(e2e.viewerUrl);
    await pickKeys(page);
    await viewSelect(page).selectOption({ label: view });

    // The last Chorus, low on the page.
    e2e.rig.live.setPosition(150);
    await watcher.snapshot((snapshot) => snapshot.position === 150);
    await expect(blocks(page).nth(LAST_CHORUS)).toHaveClass(/\bcurrent\b/);

    await page.reload();
    await expect(blocks(page).nth(LAST_CHORUS)).toHaveClass(/\bcurrent\b/);
    await expect(lines(page, VERSE)).toHaveText(VERSE_CHORDS);
    await expect.poll(() => underStrip(page, LAST_CHORUS)).toBeLessThanOrEqual(1);
  });
}

test("a song with no chart shows No chart for this song and its blocks' names and bar counts", async ({ page }) => {
  const { e2e } = await rigWithManifest();
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);
  await page.goto(e2e.viewerUrl);
  await pickKeys(page);
  // Made Up Song has a chart.
  await expect(lines(page, VERSE)).toHaveText(VERSE_CHORDS);
  await expect(page.getByText('No chart for this song')).toHaveCount(0);

  // Into Short Song, which has none.
  e2e.rig.live.setPosition(180);
  await watcher.snapshot((snapshot) => snapshot.position === 180);
  await expect(page.locator('.chart-song')).toHaveText('Short Song');
  await expect(page.locator('.chart-missing')).toHaveText('No chart for this song');
  await expect(page.locator('.chart-block-name')).toHaveText(['Intro', 'End']);
  await expect(page.locator('.chart-block-bars')).toHaveText(['4 bars']);
  await expect(page.locator('.chart-lines')).toHaveCount(0);
});
