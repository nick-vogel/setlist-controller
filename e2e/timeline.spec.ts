import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CuePoint, Track } from '../src/fake-live/fake-live.ts';
import { SET_MANIFEST_FILE, type ManifestSong } from '../src/shared/set-manifest.ts';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const MIXED_SET: CuePoint[] = [
  { name: '1 - Count Off (Build My Life)', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Pad', time: 40 },
  { name: '1 - End', time: 46 },
  { name: '2 - Intro (Goodness of God)', time: 58 },
  { name: '2 - Chorus', time: 70 },
  { name: '2 - Pad Out', time: 82 },
  { name: '2 - End', time: 88 },
];

const MIXED_MANIFEST: ManifestSong[] = [
  { title: 'Build My Life', stemsKey: 'G', meter: '4/4' },
  { title: 'Goodness of God', stemsKey: 'A', meter: '6/8' },
];

const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Keys', grouped: false, volume: 0.5 },
];

const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';
const START = '/live/song/start_playing';
const SET_LOOP = '/live/song/set/loop';
const GET_VOLUME = '/live/track/get/volume';
const SONG_1_COUNT_OFF_CUE = 0;
const SONG_1_VERSE_SECTION = 2;
const SONG_1_PAD_CUE = 3;
const SONG_2_CHORUS_CUE = 6;
const BEAT_MS = 500;

let e2e: E2eRig | undefined;
let folder: string | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
});

async function manifestFile(songs: ManifestSong[]): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  folder = await mkdtemp(join(REPO_ROOT, 'dist/e2e-timeline-'));
  const path = join(folder, SET_MANIFEST_FILE);
  await writeFile(path, JSON.stringify({ songs }));
  return path;
}

async function switchToTimeline(page: Page) {
  await page.getByRole('group', { name: 'Leader view' }).getByRole('button', { name: 'Timeline' }).click();
  await expect(page.locator('.timeline-view')).toBeVisible();
}

async function scrollLeft(page: Page): Promise<number> {
  return page.locator('.timeline-scroll').evaluate((el) => el.scrollLeft);
}

test('leader page switches between Setlist and Timeline with localStorage persistence, while producer stays untouched', async ({ page }) => {
  e2e = await startE2eRig({ playing: false, position: 8 }, MIXED_SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);

  await page.goto(e2e.leaderUrl);
  const switcher = page.getByRole('group', { name: 'Leader view' });
  await expect(switcher.getByRole('button', { name: 'Setlist' })).toHaveAttribute('aria-pressed', 'true');
  await expect(switcher.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Stop Hold to stop' })).toBeVisible();

  await switchToTimeline(page);
  await expect(switcher.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop at end' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue into next song' })).toHaveCount(0);

  // Reloading keeps Timeline view on this device.
  await page.reload();
  await expect(page.locator('.timeline-view')).toBeVisible();
  await expect(switcher.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true');

  // Producer page never shows the switcher or Timeline, even with Timeline persisted in localStorage.
  await page.goto(e2e.producerUrl);
  await expect(page.getByRole('region', { name: 'Connections' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Leader view' })).toHaveCount(0);
  await expect(page.locator('.timeline-view')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop Hold to stop' })).toBeVisible();

  // Back on leader page: switch back to Setlist and confirm reload keeps Setlist.
  await page.goto(e2e.leaderUrl);
  await expect(page.locator('.timeline-view')).toBeVisible();
  await switcher.getByRole('button', { name: 'Setlist' }).click();
  await expect(page.locator('.timeline-view')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop Hold to stop' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.timeline-view')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop Hold to stop' })).toBeVisible();
});

test('whole-set timeline renders mixed-meter bar grids, Pad/Count Off/End/gap visuals, waveform layer, loop brace, and waiting jump target', async ({ page }) => {
  const manifestPath = await manifestFile(MIXED_MANIFEST);
  // Live sits in Song 1 (4/4) with an active arrangement loop on Song 1 Verse (beats 24..40),
  // before ever visiting Song 2 (6/8).
  e2e = await startE2eRig(
    { playing: true, position: 26, loop: { on: true, start: 24, length: 16 } },
    MIXED_SET,
    { setManifest: manifestPath },
  );
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.loop !== null);

  await page.goto(e2e.leaderUrl);
  await switchToTimeline(page);

  // Every section across both songs renders continuously in order.
  const sections = page.locator('.timeline-section');
  await expect(sections).toHaveCount(7);
  await expect(page.locator('.timeline-section-name')).toHaveText([
    'Count Off',
    'Intro',
    'Verse',
    'Pad',
    'Intro',
    'Chorus',
    'Pad Out',
  ]);

  const song1Verse = page.locator('.timeline-section[data-song="1"][data-section="2"]');
  const song2Intro = page.locator('.timeline-section[data-song="2"][data-section="0"]');
  expect((await song1Verse.boundingBox())?.width).toBeCloseTo(288, 0);
  expect((await song2Intro.boundingBox())?.width).toBeCloseTo(288, 0);
  await expect(song1Verse.locator('.timeline-bar-tick')).toHaveCount(4);
  await expect(song2Intro.locator('.timeline-bar-tick')).toHaveCount(4);

  await expect(page.locator('.timeline-waveform-layer')).toHaveCount(7);

  const regularBg = await song2Intro.evaluate((el) => getComputedStyle(el).backgroundColor);
  const pad = page.locator('.timeline-section[data-song="1"][data-section="3"]');
  const padOut = page.locator('.timeline-section[data-song="2"][data-section="2"]');
  const countOff = page.locator('.timeline-section[data-song="1"][data-section="0"]');
  const gap = page.locator('.timeline-gap');
  const ends = page.locator('.timeline-end');
  await expect(pad).toHaveCSS('background-image', /repeating-linear-gradient/);
  await expect(padOut).toHaveCSS('background-image', /repeating-linear-gradient/);
  await expect(countOff).not.toHaveCSS('background-color', regularBg);
  await expect(gap).toHaveCount(1);
  await expect(gap).not.toHaveCSS('background-color', regularBg);
  await expect(ends).toHaveCount(2);
  await expect(ends.first()).not.toHaveCSS('background-color', regularBg);

  const brace = page.locator('.timeline-loop-brace');
  await expect(brace).toBeVisible();
  const verseBox = await song1Verse.boundingBox();
  const braceBox = await brace.boundingBox();
  expect(braceBox!.x).toBeCloseTo(verseBox!.x, 0);
  expect(braceBox!.width).toBeCloseTo(verseBox!.width, 0);

  await pad.click();
  await watcher.snapshot((snapshot) => snapshot.jump?.song === 1 && snapshot.jump.section === 3);
  await expect(pad).toHaveCSS('outline-style', 'dashed');
  await expect(page.locator('.timeline-readout-jump')).toHaveText('Jumping to Pad.');
});

test('while playing: timeline tracks the pinned playhead, dragging peeks with Follow & idle auto-return, song tabs peek without moving Live, and section taps send quantized jumps', async ({ page }) => {
  const manifestPath = await manifestFile(MIXED_MANIFEST);
  e2e = await startE2eRig({ playing: true, position: 8 }, MIXED_SET, { setManifest: manifestPath });
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing && snapshot.position === 8);

  await page.goto(e2e.leaderUrl);
  await switchToTimeline(page);

  await expect.poll(() => scrollLeft(page)).toBeCloseTo(144, 0);
  await expect(page.locator('.timeline-readout-song')).toHaveText('Build My Life');
  await expect(page.locator('.timeline-readout-section')).toHaveText('Intro');
  await expect(page.locator('.timeline-readout-bar')).toHaveText('bar 1 of 4');

  e2e.rig.live.setPosition(24);
  await watcher.snapshot((snapshot) => snapshot.position === 24);
  await expect.poll(() => scrollLeft(page)).toBeCloseTo(432, 0);
  await expect(page.locator('.timeline-readout-section')).toHaveText('Verse');

  const song2Tab = page.getByRole('navigation', { name: 'Songs' }).getByRole('button', { name: /Goodness of God/ });
  await song2Tab.click();
  await expect.poll(() => scrollLeft(page)).toBeCloseTo(1152, 0);
  expect(e2e.rig.received(JUMP)).toEqual([]);
  expect(e2e.rig.received(STOP)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();

  const song2Chorus = page.locator('.timeline-section[data-song="2"][data-section="1"]');
  await song2Chorus.click();
  await expect.poll(() => e2e?.rig.received(JUMP).map((m) => m.args)).toEqual([[SONG_2_CHORUS_CUE]]);
  await expect(song2Chorus).toHaveCSS('outline-style', 'dashed');

  await page.getByRole('button', { name: 'Follow' }).click();
  await expect.poll(() => scrollLeft(page)).toBeCloseTo(432, 0);
  await expect(page.getByRole('button', { name: 'Follow' })).toHaveCount(0);

  const jumpCountBeforeDrag = e2e.rig.received(JUMP).length;
  const scrollBox = (await page.locator('.timeline-scroll').boundingBox())!;
  const dragY = scrollBox.y + scrollBox.height / 2;
  await page.mouse.move(scrollBox.x + scrollBox.width * 0.7, dragY);
  await page.mouse.down();
  await page.mouse.move(scrollBox.x + scrollBox.width * 0.2, dragY, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();
  expect(await scrollLeft(page)).toBeGreaterThan(452);
  expect(e2e.rig.received(JUMP).length).toBe(jumpCountBeforeDrag);

  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Follow' })).toHaveCount(0, { timeout: 4000 });
  await expect.poll(() => scrollLeft(page)).toBeCloseTo(432, 0);
});

test('holding a pointer on the timeline while peeking pauses auto-return and reschedules it on release', async ({ page }) => {
  const manifestPath = await manifestFile(MIXED_MANIFEST);
  e2e = await startE2eRig({ playing: true, position: 8 }, MIXED_SET, { setManifest: manifestPath });
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);

  await page.goto(e2e.leaderUrl);
  await switchToTimeline(page);

  await page.getByRole('navigation', { name: 'Songs' }).getByRole('button', { name: /Goodness of God/ }).click();
  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();

  await page.waitForTimeout(2500);
  const box = (await page.locator('.timeline-scroll').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();
  await page.mouse.up();

  await expect(page.getByRole('button', { name: 'Follow' })).toHaveCount(0, { timeout: 4500 });
  await expect.poll(() => scrollLeft(page)).toBeCloseTo(144, 0);
});

test('releasing an uncaptured pointer outside the timeline while peeking still resumes auto-return and does not lock out later gestures', async ({ page }) => {
  const manifestPath = await manifestFile(MIXED_MANIFEST);
  e2e = await startE2eRig({ playing: true, position: 8 }, MIXED_SET, { setManifest: manifestPath });
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);

  await page.goto(e2e.leaderUrl);
  await switchToTimeline(page);

  await page.getByRole('navigation', { name: 'Songs' }).getByRole('button', { name: /Goodness of God/ }).click();
  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();

  const scrollBox = (await page.locator('.timeline-scroll').boundingBox())!;
  const transportBox = (await page.locator('.timeline-transport').boundingBox())!;
  const x = scrollBox.x + scrollBox.width * 0.5;
  await page.mouse.move(x, scrollBox.y + scrollBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(x, transportBox.y + transportBox.height * 0.5);
  await page.mouse.up();

  await expect(page.getByRole('button', { name: 'Follow' })).toHaveCount(0, { timeout: 4500 });
  await expect.poll(() => scrollLeft(page)).toBeCloseTo(144, 0);

  await page.mouse.move(scrollBox.x + scrollBox.width * 0.7, scrollBox.y + scrollBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(scrollBox.x + scrollBox.width * 0.2, scrollBox.y + scrollBox.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Follow' })).toBeVisible();
});

test('MD transport bar: single-tap Pause stops Live (while Setlist Stop still holds), Loop/Prev/Next/Fade/Count in work with no song-end toggles', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 24, tracks: TRACKS }, MIXED_SET);
  const { rig } = e2e;
  const watcher = await rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing && snapshot.position === 24);

  await page.goto(e2e.leaderUrl);
  await switchToTimeline(page);

  const transport = page.getByRole('region', { name: 'Timeline transport' });
  await expect(page.getByRole('button', { name: 'Stop at end' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue into next song' })).toHaveCount(0);

  // Loop toggles an indefinite section loop on and off.
  const loopButton = transport.getByRole('button', { name: 'Loop' });
  await loopButton.click();
  await expect.poll(() => rig.received(SET_LOOP).at(-1)?.args).toEqual([1]);
  await watcher.snapshot((snapshot) => snapshot.loop !== null);
  await expect(loopButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.timeline-loop-brace')).toBeVisible();

  await loopButton.click();
  await expect.poll(() => rig.received(SET_LOOP).at(-1)?.args).toEqual([0]);
  await watcher.snapshot((snapshot) => snapshot.loop === null);
  await expect(loopButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.timeline-loop-brace')).toHaveCount(0);

  // Next and Previous send quantized section jumps.
  await transport.getByRole('button', { name: 'Next' }).click();
  await expect.poll(() => rig.received(JUMP).at(-1)?.args).toEqual([SONG_1_PAD_CUE]);
  await transport.getByRole('button', { name: 'Previous' }).click();
  await expect.poll(() => rig.received(JUMP).at(-1)?.args).toEqual([1]); // Song 1 Intro

  // Fade out and Fade in work in Timeline view without stopping Live.
  await transport.getByRole('button', { name: 'Fade out' }).click();
  await expect.poll(() => rig.received(GET_VOLUME).length).toBe(TRACKS.length);
  rig.live.advance(BEAT_MS);
  await watcher.snapshot((snapshot) => snapshot.position === 25);
  await rig.advanceConnected(6000);
  await watcher.snapshot((snapshot) => snapshot.fade === 'silent' && snapshot.playing);
  const fadeIn = transport.getByRole('button', { name: 'Fade in' });
  await expect(fadeIn).toBeEnabled();
  await fadeIn.click();
  await watcher.snapshot((snapshot) => snapshot.fade === 'in');
  await rig.advanceConnected(6000);
  await watcher.snapshot((snapshot) => snapshot.fade === null);

  // Single-tap Pause immediately stops Live with no press-and-hold.
  expect(rig.received(STOP)).toEqual([]);
  await transport.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => rig.received(STOP).length).toBe(1);
  await watcher.snapshot((snapshot) => !snapshot.playing);
  await expect(transport.getByRole('button', { name: 'Pause' })).toBeDisabled();

  // While stopped on Song 1 Verse, Count in starts playback through Count Off and highlights Verse.
  rig.live.setPosition(24);
  await watcher.snapshot((snapshot) => !snapshot.playing && snapshot.position === 24);
  await transport.getByRole('button', { name: 'Count in' }).click();
  await expect.poll(() => rig.received(JUMP).at(-1)?.args).toEqual([SONG_1_COUNT_OFF_CUE]);
  await expect.poll(() => rig.received(START).length).toBe(1);
  await watcher.snapshot((snapshot) => snapshot.countIn && snapshot.jump?.song === 1 && snapshot.jump.section === SONG_1_VERSE_SECTION);
  const countInTarget = page.locator('.timeline-section[data-song="1"][data-section="2"]');
  await expect(countInTarget).toHaveCSS('outline-style', 'dashed');
  await expect(countInTarget).not.toHaveCSS('box-shadow', 'none');

  // Switch back to Setlist view while playing: Setlist's Stop still requires a one-second hold.
  await page.getByRole('group', { name: 'Leader view' }).getByRole('button', { name: 'Setlist' }).click();
  const stop = page.getByRole('button', { name: 'Stop Hold to stop' });
  const stopsBefore = rig.received(STOP).length;
  await stop.hover();
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(1100);
  expect(rig.received(STOP).length).toBe(stopsBefore);
});
