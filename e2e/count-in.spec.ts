import { expect, test, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// Song 1 opens on a Count Off of 2 bars of 4/4; song 2 has none. Every section name is unique in the
// set, so a page's text names one section. Listed in time order, so a cue's index is its place.
const SET: CuePoint[] = [
  { name: '1 - Count Off (Build My Life)', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Bridge', time: 40 },
  { name: '1 - End', time: 56 },
  { name: '2 - Opening (Goodness of God)', time: 64 },
  { name: '2 - Chorus', time: 72 },
  { name: '2 - End', time: 80 },
];
const COUNT_OFF_CUE = 0;
const BRIDGE = 3;
// Song 2's first locator.
const GOODNESS_OPENING_CUE = 5;

const JUMP = '/live/song/cue_point/jump';
const START = '/live/song/start_playing';

// The song's own heading, and its Count in button, whose name carries its reason when it has one.
const song = (page: Page, title: string) => page.locator('section.song').filter({ has: page.getByRole('heading', { name: title }) });
const countIn = (page: Page, title: string) => song(page, title).locator('button.count-in');
// The transport row's Count in, beside Fade out, for the song the playhead is in.
const topCountIn = (page: Page) => page.locator('section.transport button.count-in');
// The transport row's Play from start, beside the top Count in, for the song the playhead is in.
const topPlayFromStart = (page: Page) => page.locator('section.transport button.play-from-start');
// The transport row's Previous song and Next song, after the top Play from start.
const previousSong = (page: Page) => page.locator('section.transport button.song-step').filter({ hasText: /^Previous song$/ });
const nextSong = (page: Page) => page.locator('section.transport button.song-step').filter({ hasText: /^Next song$/ });
// The tap targets' labels: the sections of the song the playhead is in.
const tapTargets = (page: Page) => page.locator('.jump-targets button');

test("Count in sits beside Play from start, and is disabled while Live plays and with the playhead on a song's End", async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 24 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);
  await page.goto(e2e.leaderUrl);

  await expect(song(page, 'Build My Life').locator('.song-controls button')).toHaveText(['Play from start', 'Count in', 'Stop at end', 'Continue into next song']);
  await expect(countIn(page, 'Build My Life')).toBeDisabled();

  e2e.rig.live.setPlaying(false);
  await watcher.snapshot((snapshot) => !snapshot.playing);
  await expect(countIn(page, 'Build My Life')).toBeEnabled();

  // Song 1's End, between the two songs.
  e2e.rig.live.setPosition(56);
  await watcher.snapshot((snapshot) => snapshot.position === 56);
  await expect(countIn(page, 'Build My Life')).toBeDisabled();
});

test('Count in is disabled with its reason in a song with no Count Off', async ({ page }) => {
  e2e = await startE2eRig({ playing: false, position: 72 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.position === 72);
  await page.goto(e2e.leaderUrl);

  const button = countIn(page, 'Goodness of God');
  await expect(button).toHaveAccessibleName('Count in No Count Off');
  await expect(button).toBeDisabled();
  await expect(countIn(page, 'Build My Life')).toHaveAccessibleName('Count in');
});

test('a press after a tap while stopped counts in to the tapped section, and every page reads "Count in to" it', async ({ context }) => {
  e2e = await startE2eRig({ playing: false, position: 24 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.position === 24);
  const leader = await context.newPage();
  await leader.goto(e2e.leaderUrl);
  const viewer = await context.newPage();
  await viewer.goto(e2e.viewerUrl);

  // While stopped, a tap moves the playhead at once.
  await leader.locator('.jump-targets').getByRole('button', { name: 'Bridge' }).click();
  await watcher.snapshot((snapshot) => snapshot.position === 40);
  await countIn(leader, 'Build My Life').click();

  // Live plays the Count Off; the fake Live's playhead stays on it until the test moves it.
  await expect.poll(() => e2e?.rig.received(JUMP).at(-1)?.args).toEqual([COUNT_OFF_CUE]);
  await expect.poll(() => e2e?.rig.received(START).length).toBe(1);
  const counting = await watcher.snapshot((snapshot) => snapshot.countIn);
  expect(counting.jump).toEqual({ song: 1, section: BRIDGE });

  for (const page of [leader, viewer]) {
    await expect(page.locator('.now-jump')).toHaveText('Count in to Bridge.');
    await expect(page.locator('.now-section-name')).toHaveText('Count Off');
  }
});

test('the Count in beside Fade out counts in to the tapped section, and keeps the same rules', async ({ page }) => {
  e2e = await startE2eRig({ playing: false, position: 24 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.position === 24);
  await page.goto(e2e.leaderUrl);

  const transport = page.locator('section.transport button');
  await expect(transport).toHaveCount(6);
  await expect(transport.nth(0)).toHaveAccessibleName('Stop Hold to stop');
  await expect(transport.nth(1)).toHaveAccessibleName('Fade out');
  await expect(transport.nth(2)).toHaveAccessibleName('Count in');
  await expect(transport.nth(3)).toHaveAccessibleName('Play from start');
  await expect(transport.nth(4)).toHaveAccessibleName('Previous song');
  await expect(transport.nth(5)).toHaveAccessibleName('Next song');
  await expect(countIn(page, 'Build My Life')).toBeVisible();

  await page.locator('.jump-targets').getByRole('button', { name: 'Bridge' }).click();
  await watcher.snapshot((snapshot) => snapshot.position === 40);
  await topCountIn(page).click();

  await expect.poll(() => e2e?.rig.received(JUMP).at(-1)?.args).toEqual([COUNT_OFF_CUE]);
  await expect.poll(() => e2e?.rig.received(START).length).toBe(1);
  const counting = await watcher.snapshot((snapshot) => snapshot.countIn);
  expect(counting.jump).toEqual({ song: 1, section: BRIDGE });
  await expect(page.locator('.now-jump')).toHaveText('Count in to Bridge.');

  // Live plays the Count Off now, so the top Count in is disabled.
  await watcher.snapshot((snapshot) => snapshot.playing);
  await expect(topCountIn(page)).toBeDisabled();

  // In song 2, which has no Count Off, it carries the reason.
  e2e.rig.live.setPlaying(false);
  e2e.rig.live.setPosition(72);
  await watcher.snapshot((snapshot) => !snapshot.playing && snapshot.position === 72);
  await expect(topCountIn(page)).toHaveAccessibleName('Count in No Count Off');
  await expect(topCountIn(page)).toBeDisabled();
});

test('the Play from start beside the top Count in plays the song the playhead is in from its start, and keeps the same rules', async ({ page }) => {
  // Stopped on song 2's Chorus.
  e2e = await startE2eRig({ playing: false, position: 72 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.position === 72);
  await page.goto(e2e.leaderUrl);

  await expect(topPlayFromStart(page)).toBeEnabled();
  await topPlayFromStart(page).click();

  // One jump to song 2's first locator, and one start.
  await expect.poll(() => e2e?.rig.received(JUMP).map((message) => message.args)).toEqual([[GOODNESS_OPENING_CUE]]);
  await expect.poll(() => e2e?.rig.received(START).length).toBe(1);
  await expect(song(page, 'Goodness of God').getByRole('button', { name: 'Play from start' })).toBeVisible();

  // With Live playing it stays enabled.
  await watcher.snapshot((snapshot) => snapshot.playing);
  await expect(topPlayFromStart(page)).toBeEnabled();

  // Song 1's End, between the two songs, is in no song.
  e2e.rig.live.setPlaying(false);
  e2e.rig.live.setPosition(56);
  await watcher.snapshot((snapshot) => !snapshot.playing && snapshot.position === 56);
  await expect(topPlayFromStart(page)).toBeDisabled();
});

test('Previous song and Next song move the playhead to the first section of another song while Live is stopped, so a tap and the top Count in need no scroll', async ({ page }) => {
  // Stopped on song 1's Verse.
  e2e = await startE2eRig({ playing: false, position: 24 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.position === 24);
  await page.goto(e2e.leaderUrl);

  // The six transport buttons wrap rather than lie over one another, on the phone too. evaluateAll
  // reads the page as it is, so wait until it draws all six.
  await expect(page.locator('section.transport button')).toHaveCount(6);
  const boxes = await page.locator('section.transport button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON() as DOMRect));
  expect(boxes).toHaveLength(6);
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(false);
    }
  }

  // Song 1 is the set's first.
  await expect(previousSong(page)).toBeDisabled();
  await expect(nextSong(page)).toBeEnabled();

  // Next song: one jump to song 2's first locator, and nothing plays.
  await nextSong(page).click();
  await expect.poll(() => e2e?.rig.received(JUMP).map((message) => message.args)).toEqual([[GOODNESS_OPENING_CUE]]);
  await watcher.snapshot((snapshot) => snapshot.position === 64 && snapshot.now?.song === 2 && snapshot.jump === null);
  await expect(tapTargets(page)).toHaveText(['Opening', 'Chorus']);
  // Song 2 is the set's last.
  await expect(nextSong(page)).toBeDisabled();
  await expect(previousSong(page)).toBeEnabled();

  // Previous song: back to song 1's Count Off.
  await previousSong(page).click();
  await expect.poll(() => e2e?.rig.received(JUMP).map((message) => message.args)).toEqual([[GOODNESS_OPENING_CUE], [COUNT_OFF_CUE]]);
  await watcher.snapshot((snapshot) => snapshot.position === 0 && snapshot.now?.song === 1 && snapshot.jump === null);
  await expect(tapTargets(page)).toHaveText(['Count Off', 'Intro', 'Verse', 'Bridge']);
  expect(e2e.rig.received(START)).toEqual([]);
  expect(watcher.received.some((snapshot) => snapshot.playing)).toBe(false);

  // A tap on Bridge in the tap targets, then the top Count in, counts in to it.
  await page.locator('.jump-targets').getByRole('button', { name: 'Bridge' }).click();
  await watcher.snapshot((snapshot) => snapshot.position === 40);
  await topCountIn(page).click();
  await expect.poll(() => e2e?.rig.received(JUMP).at(-1)?.args).toEqual([COUNT_OFF_CUE]);
  await expect.poll(() => e2e?.rig.received(START).length).toBe(1);
  const counting = await watcher.snapshot((snapshot) => snapshot.countIn);
  expect(counting.jump).toEqual({ song: 1, section: BRIDGE });

  // During the count both are disabled.
  await expect(previousSong(page)).toBeDisabled();
  await expect(nextSong(page)).toBeDisabled();

  // Song 1's End, between the two songs, is in no song.
  e2e.rig.live.setPlaying(false);
  e2e.rig.live.setPosition(56);
  await watcher.snapshot((snapshot) => !snapshot.playing && snapshot.position === 56 && snapshot.now === null);
  await expect(previousSong(page)).toBeDisabled();
  await expect(nextSong(page)).toBeDisabled();
});
