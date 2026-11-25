import { expect, test } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

const SET: CuePoint[] = [
  { name: '1 - Intro (Build My Life)', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 32 },
  { name: '2 - Intro (Goodness of God)', time: 40 },
  { name: '2 - Chorus', time: 56 },
  { name: '2 - End', time: 72 },
];

const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';
const SONG_1_VERSE_CUE = 1;
const SONG_2_CHORUS_CUE = 4;

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

test('Safe Mode starts ON, syncs between leader (Setlist & Timeline) and producer, and is absent on viewer', async ({ browser }) => {
  e2e = await startE2eRig({ playing: false, position: 0 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot(loaded);

  const context = await browser.newContext();
  try {
    const leader = await context.newPage();
    const producer = await context.newPage();
    const viewer = await context.newPage();

    await Promise.all([leader.goto(e2e.leaderUrl), producer.goto(e2e.producerUrl), viewer.goto(e2e.viewerUrl)]);

    const leaderToggle = leader.getByRole('button', { name: /Safe Mode/ });
    const producerToggle = producer.getByRole('button', { name: /Safe Mode/ });

    await expect(leaderToggle).toHaveText('Safe Mode: On');
    await expect(leaderToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(producerToggle).toHaveText('Safe Mode: On');
    await expect(producerToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(viewer.getByRole('button', { name: /Safe Mode/ })).toHaveCount(0);

    // Producer toggles Safe Mode off -> leader updates live.
    await producerToggle.click();
    await expect(producerToggle).toHaveText('Safe Mode: Off');
    await expect(producerToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(leaderToggle).toHaveText('Safe Mode: Off');
    await expect(leaderToggle).toHaveAttribute('aria-pressed', 'false');

    // Switch leader to Timeline -> still shows Safe Mode: Off and toggles back on for both pages.
    await leader.getByRole('group', { name: 'Leader view' }).getByRole('button', { name: 'Timeline' }).click();
    await expect(leader.locator('.timeline-view')).toBeVisible();
    await expect(leaderToggle).toHaveText('Safe Mode: Off');
    await leaderToggle.click();
    await expect(leaderToggle).toHaveText('Safe Mode: On');
    await expect(producerToggle).toHaveText('Safe Mode: On');
  } finally {
    await context.close();
  }
});

test('Safe Mode guards cross-song jumps on Setlist and Timeline while playing, while Previous/Next song stay disabled regardless', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 4 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((s) => loaded(s) && s.playing && s.position === 4);

  const sentKinds: string[] = [];
  page.on('websocket', (socket) =>
    socket.on('framesent', ({ payload }) => {
      if (typeof payload === 'string') sentKinds.push((JSON.parse(payload) as { kind: string }).kind);
    }),
  );
  await page.goto(e2e.leaderUrl);

  // Setlist view with Safe Mode ON: Song 1 Play from start enabled, Song 2 Play from start disabled,
  // and Previous/Next song disabled.
  const song1Play = page.locator('section.song').nth(0).getByRole('button', { name: 'Play from start' });
  const song2Play = page.locator('section.song').nth(1).getByRole('button', { name: 'Play from start' });
  const prevSong = page.getByRole('button', { name: 'Previous song', exact: true });
  const nextSong = page.getByRole('button', { name: 'Next song', exact: true });

  await expect(song1Play).toBeEnabled();
  await expect(song2Play).toBeDisabled();
  await expect(prevSong).toBeDisabled();
  await expect(nextSong).toBeDisabled();

  // Turn Safe Mode OFF: Song 2 Play from start unlocks, but Previous/Next song stay disabled.
  const toggle = page.getByRole('button', { name: /Safe Mode/ });
  await toggle.click();
  await expect(toggle).toHaveText('Safe Mode: Off');
  await expect(song2Play).toBeEnabled();
  await expect(prevSong).toBeDisabled();
  await expect(nextSong).toBeDisabled();

  // Turn Safe Mode back ON and switch to Timeline view.
  await toggle.click();
  await expect(toggle).toHaveText('Safe Mode: On');
  await page.getByRole('group', { name: 'Leader view' }).getByRole('button', { name: 'Timeline' }).click();
  await expect(page.locator('.timeline-view')).toBeVisible();

  // Peek at Song 2 and click Song 2 Chorus -> guarded, no jump sent to Live.
  await page.getByRole('navigation', { name: 'Songs' }).getByRole('button', { name: /Goodness of God/ }).click();
  const song2Chorus = page.locator('.timeline-section[data-song="2"][data-section="1"]');
  await expect(song2Chorus).toHaveAttribute('aria-disabled', 'true');
  const sentBeforeTap = sentKinds.length;
  await song2Chorus.click({ force: true });

  // Same-song jump inside Song 1 still works while Safe Mode is ON, and Live holds it alone, so the
  // Song 2 tap before it sent nothing.
  await page.getByRole('button', { name: 'Follow' }).click();
  const song1Verse = page.locator('.timeline-section[data-song="1"][data-section="1"]');
  await song1Verse.click();
  await expect.poll(() => e2e?.rig.received(JUMP).map((m) => m.args)).toEqual([[SONG_1_VERSE_CUE]]);
  expect(sentKinds.slice(sentBeforeTap).filter((kind) => kind === 'jump')).toEqual(['jump']);

  // Turn Safe Mode OFF -> cross-song tap on Song 2 Chorus now jumps.
  await toggle.click();
  await expect(toggle).toHaveText('Safe Mode: Off');
  await page.getByRole('navigation', { name: 'Songs' }).getByRole('button', { name: /Goodness of God/ }).click();
  await expect(song2Chorus).not.toHaveAttribute('aria-disabled', 'true');
  await song2Chorus.click();
  await expect.poll(() => e2e?.rig.received(JUMP).at(-1)?.args).toEqual([SONG_2_CHORUS_CUE]);
});

test('Timeline Pause requires a one-second press-and-hold while Safe Mode is ON, and single-taps while Safe Mode is OFF', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 4 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((s) => loaded(s) && s.playing);

  await page.goto(e2e.leaderUrl);
  await page.getByRole('group', { name: 'Leader view' }).getByRole('button', { name: 'Timeline' }).click();
  await expect(page.locator('.timeline-view')).toBeVisible();

  // Safe Mode ON: Pause requires a 1-second hold.
  const holdPause = page.getByRole('button', { name: 'Pause Hold to pause' });
  await expect(holdPause).toBeVisible();
  await holdPause.hover();

  // A short press, and one just short of the second, do not stop Live.
  for (const pressMs of [300, 900]) {
    await page.mouse.down();
    await page.waitForTimeout(pressMs);
    await page.mouse.up();
    await page.waitForTimeout(1100);
    expect(e2e.rig.received(STOP), `${pressMs} ms press`).toEqual([]);
    expect(watcher.received.at(-1)?.playing).toBe(true);
  }

  // Full 1-second hold stops Live.
  await page.mouse.down();
  await expect(holdPause).toHaveClass(/holding/);
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect.poll(() => e2e?.rig.received(STOP).length).toBe(1);
  await watcher.snapshot((s) => !s.playing);

  // Resume playback and turn Safe Mode OFF -> single-tap Pause stops Live immediately.
  const from = watcher.received.length;
  e2e.rig.live.setPlaying(true);
  await watcher.snapshot((s) => s.playing && watcher.received.indexOf(s) >= from);

  const toggle = page.getByRole('button', { name: /Safe Mode/ });
  await toggle.click();
  await expect(toggle).toHaveText('Safe Mode: Off');

  const tapPause = page.getByRole('button', { name: 'Pause', exact: true });
  await expect(tapPause).toBeEnabled();
  await tapPause.click();
  await expect.poll(() => e2e?.rig.received(STOP).length).toBe(2);
  await watcher.snapshot((s) => !s.playing && watcher.received.indexOf(s) > from);
});
