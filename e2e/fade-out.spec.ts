import { expect, test } from '@playwright/test';
import type { Track } from '../src/fake-live/fake-live.ts';
import { loaded } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// A group with two tracks in it, then two single tracks. Every volume is exact in float32.
const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Kick', grouped: true, volume: 0.5 },
  { name: 'Snare', grouped: true, volume: 1 },
  { name: 'Keys', grouped: false, volume: 0.5 },
  { name: 'Bass', grouped: false, volume: 0.25 },
];
const TOP_LEVEL_TRACKS = 3;

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const GET_VOLUME = '/live/track/get/volume';
const SET_VOLUME = '/live/track/set/volume';
const STOP = '/live/song/stop_playing';

test('a tap on Fade out fades the music to silence over 6 seconds with Live playing on, and a tap on Fade in brings it back', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 0, tracks: TRACKS });
  const { rig } = e2e;
  const watcher = await rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);
  await page.goto(e2e.leaderUrl);
  const fadeOut = page.getByRole('button', { name: 'Fade out' });
  await expect(fadeOut).toBeEnabled();

  await fadeOut.tap();

  // The steps start on the server's clock once every volume is read. Live's answers to the reads
  // come back ahead of a playhead report sent after them, so once the watcher sees it, they run.
  await expect.poll(() => rig.received(GET_VOLUME).length).toBe(TOP_LEVEL_TRACKS);
  rig.live.advance(BEAT_MS);
  await watcher.snapshot((snapshot) => snapshot.position === 1);
  await rig.advanceConnected(6000);

  // Silent, with Live still playing: the grouped tracks keep their volume, and nothing stopped Live.
  await expect.poll(() => rig.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
  await watcher.snapshot((snapshot) => snapshot.fade === 'silent' && snapshot.playing);
  expect(rig.received(STOP)).toEqual([]);
  const fadeIn = page.getByRole('button', { name: 'Fade in' });
  await expect(fadeIn).toBeEnabled();

  await fadeIn.tap();
  await watcher.snapshot((snapshot) => snapshot.fade === 'in');
  await rig.advanceConnected(6000);

  await expect.poll(() => rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  // Sixty steps down and sixty back up on each top-level track.
  expect(rig.received(SET_VOLUME)).toHaveLength(120 * TOP_LEVEL_TRACKS);
  expect(rig.received(STOP)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Fade out' })).toBeEnabled();
});
