import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { manualClock } from '../../../../src/server/clock.ts';
import { startPlaybackController } from '../../../../src/server/playback-controller.ts';
import { parseSet } from '../../../../src/server/set-parser.ts';
import { createSongTimer } from '../../../../src/server/song-timings.ts';
import { startFakeLive } from '../../../../src/fake-live/fake-live.ts';
import { loaded, removeManifestFiles, startRig, writeManifestFile } from '../../../../test/harness.ts';
import { startE2eRig } from '../../../../e2e/rig.ts';
import { timeLeft } from '../../../../web/src/durations.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const require = createRequire(resolve(REPO_ROOT, 'package.json'));

test('finding 1: untimed last song returns null set time instead of at least 0:00', () => {
  const oneSong = parseSet([
    { name: '1 - Count Off (Only Song)', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '1 - End', time: 24 },
  ]);
  const inOnlySong = timeLeft(oneSong, {}, {
    now: { song: 1, section: 1, next: 'end', bar: 1, bars: 4, fraction: 0 },
    position: 8,
    jump: null,
    countIn: false,
    loop: null,
  });
  assert.deepEqual(inOnlySong, { song: null, set: null, approximate: false });

  const twoSongs = parseSet([
    { name: '1 - Count Off (First)', time: 0 },
    { name: '1 - End', time: 16 },
    { name: '2 - Verse (Second)', time: 24 },
    { name: '2 - End', time: 40 },
  ]);
  const inUntimedLast = timeLeft(twoSongs, { 1: { sections: [8], gap: null, source: 'tempo' } }, {
    now: { song: 2, section: 0, next: 'end', bar: 1, bars: 4, fraction: 0 },
    position: 24,
    jump: null,
    countIn: false,
    loop: null,
  });
  assert.deepEqual(inUntimedLast, { song: null, set: null, approximate: false });

  const jumpToUntimedLast = timeLeft(twoSongs, {}, {
    now: { song: 1, section: 0, next: 'end', bar: 1, bars: 4, fraction: 0 },
    position: 4,
    jump: { song: 2, section: 0 },
    countIn: false,
    loop: null,
  });
  assert.deepEqual(jumpToUntimedLast, { song: null, set: null, approximate: false });
});

test('finding 2: Live reconnect while playing an unvisited song uses the new tempo, not the pre-disconnect tempo', async () => {
  const TWO_SONGS = [
    { name: '1 - Count Off (Fast Song)', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '1 - End', time: 24 },
    { name: '2 - Count Off (Slow Song)', time: 32 },
    { name: '2 - Verse', time: 40 },
    { name: '2 - End', time: 56 },
  ];

  // Part A: full server + UDP bridge reconnect in LISTENED_PROPERTIES order (position, playing, tempo).
  const rig = await startRig(TWO_SONGS, { playing: true, position: 10, tempo: 140 }, {});
  let freshLive;
  try {
    const leader = await rig.connectLeader();
    await leader.snapshot((s) => loaded(s) && s.songTimings[1] !== undefined);

    rig.live.holdReplies();
    for (let i = 0; i < 4; i += 1) rig.clock.advance(1000);
    await leader.snapshot((s) => s.live === 'not-connected');

    const livePort = rig.live.port;
    await rig.stopLive();
    freshLive = await startFakeLive({
      cuePoints: TWO_SONGS,
      port: livePort,
      position: 42,
      playing: true,
      tempo: 70,
    });
    rig.clock.advance(1000);
    const reconnected = await leader.snapshot((s) => s.live === 'connected' && s.playing && s.songTimings[2] !== undefined);
    // 8 beats and 16 beats at 70 BPM (~6.857s and ~13.714s), not 140 BPM (~3.429s and ~6.857s).
    assert.ok(Math.abs(reconnected.songTimings[2].sections[0] - (8 * 60) / 70) < 1e-3, `got ${JSON.stringify(reconnected.songTimings[2])}`);
    assert.ok(Math.abs(reconnected.songTimings[2].sections[1] - (16 * 60) / 70) < 1e-3, `got ${JSON.stringify(reconnected.songTimings[2])}`);
  } finally {
    await freshLive?.close();
    await rig.close();
  }

  // Part B: initial tempo report arriving after position + playing triggers onChange so pages receive timings.
  const clock = manualClock();
  const changes = [];
  const controller = startPlaybackController(
    {
      onChange: (state) => changes.push(state),
      jump: () => {},
      continuePlaying: () => {},
      startPlaying: () => {},
      stopPlaying: () => {},
      loopOn: () => {},
      loopOff: () => {},
      requestCuePoints: () => {},
      fadeOut: () => {},
      fadeIn: () => {},
      countOff: () => {},
    },
    clock,
  );
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'cue-points', cuePoints: TWO_SONGS });
  controller.fromLive({ kind: 'position', beats: 10 });
  controller.fromLive({ kind: 'playing', playing: true });
  const beforeTempo = changes.length;
  controller.fromLive({ kind: 'tempo', bpm: 96 });
  assert.equal(changes.length, beforeTempo + 1, 'first tempo report while playing must notify onChange');
});

test('finding 3: createSongTimer clears cached tempo timings when a different set is loaded', async () => {
  const SET_ALPHA = [
    { name: '1 - Count Off (Song Alpha)', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '1 - End', time: 24 },
  ];
  const SET_BETA = [
    { name: '1 - Count Off (Song Beta)', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '1 - End', time: 24 },
  ];
  const rig = await startRig(SET_ALPHA, { playing: true, position: 10, tempo: 96 }, {});
  try {
    const leader = await rig.connectLeader();
    const first = await leader.snapshot((s) => loaded(s) && s.songTimings[1] !== undefined);
    assert.deepEqual(first.songTimings[1], { sections: [5, 10], gap: null, source: 'tempo' });

    rig.live.setPlaying(false);
    await leader.snapshot((s) => loaded(s) && !s.playing && s.songTimings[1] !== undefined);
    rig.live.setCuePoints(SET_BETA);
    rig.live.setTempo(140);
    rig.live.setPosition(0);
    leader.send({ kind: 'refresh' });

    const stoppedBeta = await leader.snapshot((s) => s.set?.songs[0]?.title === 'Song Beta');
    assert.deepEqual(stoppedBeta.songTimings, {}, 'new set must not inherit previous set cached timing while stopped');

    rig.live.setPlaying(true);
    const playingBeta = await leader.snapshot((s) => s.playing && s.set?.songs[0]?.title === 'Song Beta' && s.songTimings[1] !== undefined);
    assert.ok(Math.abs(playingBeta.songTimings[1].sections[0] - (8 * 60) / 140) < 1e-3, `got ${JSON.stringify(playingBeta.songTimings[1])}`);
  } finally {
    await rig.close();
  }
});

test('finding 4: .now-time-left fits without clipping on Pixel 7 with at least and loop markers', async () => {
  const { chromium, devices } = require('@playwright/test');
  const SET = [1, 2, 3].flatMap((number) => {
    const start = 48 * (number - 1);
    return [
      { name: `${number} - Count Off (Song ${number})`, time: start },
      { name: `${number} - Verse`, time: start + 8 },
      { name: `${number} - Chorus`, time: start + 24 },
      { name: `${number} - End`, time: start + 40 },
    ];
  });
  const span = (beats, seconds) => ({ beats, seconds });
  const MANIFEST = [
    { title: 'Song 1', stemsKey: 'G', durations: { sections: [span(8, 4), span(16, 96), span(16, 96)], gap: span(8, 4) } },
    { title: 'Song 2', stemsKey: 'D', durations: { sections: [span(8, 4), span(16, 1000), span(16, 1120)], gap: span(8, 4) } },
  ];
  const e2e = await startE2eRig(
    { playing: true, position: 8, loop: { on: true, start: 8, length: 16 } },
    SET,
    { setManifest: await writeManifestFile(MANIFEST) },
  );
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    const watcher = await e2e.rig.connectViewer();
    await watcher.snapshot((s) => loaded(s) && s.songTimings[1] !== undefined);
    await page.goto(e2e.leaderUrl);
    const line = page.getByRole('region', { name: 'Now playing' }).locator('.now-time-left');
    await line.waitFor();
    const measured = await line.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        text: element.textContent,
        cut: element.scrollWidth > element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        lines: range.getClientRects().length,
      };
    });
    assert.equal(measured.cut, false, `clipped on Pixel 7: ${JSON.stringify(measured)}`);
    assert.equal(measured.lines, 1, `wrapped on Pixel 7: ${JSON.stringify(measured)}`);
  } finally {
    await browser.close();
    await e2e.close();
    await removeManifestFiles();
  }
});

test('finding 5: createSongTimer does not time a song from its Pad or Pad Out section', () => {
  const timeSongs = createSongTimer();
  const set = parseSet([
    { name: '1 - Count Off (First)', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '1 - Pad', time: 24 },
    { name: '1 - Pad Out', time: 84 },
    { name: '1 - End', time: 100 },
  ]);
  const inPad = timeSongs(set, [], {
    now: { song: 1, section: 2, next: 3, bar: 1, bars: 15, fraction: 0 },
    playing: true,
    tempo: 63,
  });
  assert.deepEqual(inPad, {});

  const inPadOut = timeSongs(set, [], {
    now: { song: 1, section: 3, next: 'end', bar: 1, bars: 4, fraction: 0 },
    playing: true,
    tempo: 63,
  });
  assert.deepEqual(inPadOut, {});
});

test('finding 6: count-in before Live enters Count Off counts the target Count Off, not the previous section', () => {
  const set = parseSet([
    { name: '1 - Count Off (First)', time: 0 },
    { name: '1 - Bridge', time: 8 },
    { name: '1 - End', time: 68 },
    { name: '2 - Count Off (Second)', time: 76 },
    { name: '2 - Verse', time: 84 },
    { name: '2 - Chorus', time: 100 },
    { name: '2 - End', time: 116 },
  ]);
  const timings = {
    1: { sections: [4, 60], gap: 4, source: 'build' },
    2: { sections: [4, 8, 8], gap: null, source: 'build' },
  };
  const beforeJumpReport = timeLeft(set, timings, {
    now: { song: 1, section: 1, next: 'end', bar: 1, bars: 15, fraction: 0 },
    position: 8,
    jump: { song: 2, section: 2 },
    countIn: true,
    loop: null,
  });
  assert.deepEqual(beforeJumpReport, { song: 12, set: { seconds: 12, atLeast: false }, approximate: false });
});
