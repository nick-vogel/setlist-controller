import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { SILENT_BEFORE_LOST_MS } from '../src/server/live-bridge.ts';
import { parseSet } from '../src/server/set-parser.ts';
import { createSongTimer } from '../src/server/song-timings.ts';
import type { ManifestSong } from '../src/shared/set-manifest.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, removeManifestFiles, startRig, writeManifestFile, type Rig } from './harness.ts';

// Each song's timing in the snapshot: the build's seconds from the set manifest, checked against Live's locators, and,
// for a song the manifest does not time, its beats at Live's tempo once the playhead has been in it.

// Song 1 is a Count Off of 8 beats, a Verse of 16 and an End; song 2 starts 8 beats after it.
const SET: CuePoint[] = [
  { name: '1 - Count Off (Built Song)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - End', time: 24 },
  { name: '2 - Intro (Second Song)', time: 32 },
  { name: '2 - Chorus', time: 48 },
  { name: '2 - End', time: 64 },
];

// The build's seconds: song 1 slows through its Verse, so its seconds are not its beats at any one tempo.
const BUILT: ManifestSong[] = [
  { title: 'Built Song', stemsKey: 'G', durations: { sections: [{ beats: 8, seconds: 4 }, { beats: 16, seconds: 9.5 }], gap: { beats: 8, seconds: 4.25 } } },
  { title: 'Second Song', stemsKey: 'D', durations: { sections: [{ beats: 16, seconds: 8 }, { beats: 16, seconds: 8 }], gap: null } },
];

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  await removeManifestFiles();
});

describe("each song's timing in the snapshot", () => {
  it('takes every song the set manifest times from the build, before Live plays in it', async () => {
    rig = await startRig(SET, { position: 0 }, { setManifest: await writeManifestFile(BUILT) });
    const leader = await rig.connectLeader();
    const snapshot = await leader.snapshot((found: Snapshot) => loaded(found) && found.songTimings[2] !== undefined);

    expect(snapshot.songTimings).toEqual({
      1: { sections: [4, 9.5], gap: 4.25, source: 'build' },
      2: { sections: [8, 8], gap: null, source: 'build' },
    });
  });

  it("times a song by Live's tempo when its locators no longer match the build's beats, and keeps a gap only while its beats match", async () => {
    const moved: ManifestSong[] = [
      // The Verse is 16 beats in Live, not 12, and the gap 8, not 4.
      { title: 'Built Song', stemsKey: 'G', durations: { sections: [{ beats: 8, seconds: 4 }, { beats: 12, seconds: 6 }], gap: null } },
      { ...BUILT[1]!, durations: { ...BUILT[1]!.durations!, gap: null } },
    ];
    const gapMoved: ManifestSong[] = [{ ...BUILT[0]!, durations: { ...BUILT[0]!.durations!, gap: { beats: 4, seconds: 2 } } }, BUILT[1]!];

    rig = await startRig(SET, { position: 40, tempo: 120 }, { setManifest: await writeManifestFile(moved) });
    const leader = await rig.connectLeader();
    const snapshot = await leader.snapshot((found: Snapshot) => loaded(found) && found.songTimings[2] !== undefined);
    // Song 1 has not been played in, so it has no timing.
    expect(snapshot.songTimings).toEqual({ 2: { sections: [8, 8], gap: null, source: 'build' } });

    await rig.close();
    rig = await startRig(SET, { position: 40 }, { setManifest: await writeManifestFile(gapMoved) });
    const again = await (await rig.connectLeader()).snapshot((found: Snapshot) => loaded(found) && found.songTimings[1] !== undefined);
    expect(again.songTimings[1]).toEqual({ sections: [4, 9.5], gap: null, source: 'build' });
  });

  it("times a song the manifest does not, by its beats at Live's tempo the first time Live plays in it, and keeps that timing", async () => {
    rig = await startRig(SET, { playing: true, position: 10, tempo: 96 }, {});
    const leader = await rig.connectLeader();
    const inFirst = await leader.snapshot((found: Snapshot) => loaded(found) && found.songTimings[1] !== undefined);

    // 8 beats and 16 at 96 BPM. Song 2 has not been played in.
    expect(inFirst.songTimings).toEqual({ 1: { sections: [5, 10], gap: null, source: 'tempo' } });

    // Live changes tempo while still in song 1, then plays into song 2.
    rig.live.setTempo(120);
    rig.live.setPosition(20);
    rig.live.setPosition(40);
    const inSecond = await leader.snapshot((found: Snapshot) => found.songTimings[2] !== undefined);
    expect(inSecond.songTimings).toEqual({
      1: { sections: [5, 10], gap: null, source: 'tempo' },
      2: { sections: [8, 8], gap: null, source: 'tempo' },
    });
  });

  // Live reports the playhead and that it plays before its tempo, each time its listeners start again.
  it.each([
    { what: 'Live comes back after it was lost', back: async (found: Rig) => {
      await found.stopLive();
      found.clock.advance(SILENT_BEFORE_LOST_MS);
      await found.startLive({ playing: true, position: 40, tempo: 70 });
      // The next probe finds Live again.
      found.clock.advance(1000);
    } },
    { what: 'AbletonOSC reloads', back: async (found: Rig) => {
      await found.stopLive();
      await found.startLive({ playing: true, position: 40, tempo: 70, startup: true });
    } },
  ])("times a song Live plays after $what by the tempo Live reports then, not the one before", async ({ back }) => {
    rig = await startRig(SET, { playing: true, position: 10, tempo: 140 }, {});
    const leader = await rig.connectLeader();
    await leader.snapshot((found: Snapshot) => loaded(found) && found.songTimings[1] !== undefined);

    await back(rig);
    const snapshot = await leader.snapshot((found: Snapshot) => found.songTimings[2] !== undefined);
    // 16 beats and 16 at 70 BPM.
    expect(snapshot.songTimings[2]).toEqual({ sections: [expect.closeTo(960 / 70, 9), expect.closeTo(960 / 70, 9)], gap: null, source: 'tempo' });
  });

  it('gives no timing by tempo while Live is stopped', async () => {
    rig = await startRig(SET, { playing: false, position: 10, tempo: 96 }, {});
    const snapshot = await (await rig.connectLeader()).snapshot(loaded);
    expect(snapshot.songTimings).toEqual({});
  });

  it('is empty before the set is known', async () => {
    rig = await startRig(SET, {}, { liveRunning: false });
    const snapshot = await (await rig.connectLeader()).snapshot();

    expect(snapshot.set).toBeNull();
    expect(snapshot.songTimings).toEqual({});
  });
});

// The timer alone, for what the rig cannot set up: a set whose songs the manifest lists out of order, and Live playing
// before it has reported a tempo.
describe('the song timer', () => {
  const set = parseSet(SET);
  const playingIn = (song: number) => ({ now: { song, section: 0, next: 1, bar: 1, bars: 2, fraction: 0 }, playing: true });

  it("finds a song's manifest durations by its title when the song at the same position has another title", () => {
    const timeSongs = createSongTimer();
    expect(timeSongs(set, [BUILT[1]!, BUILT[0]!], { now: null, playing: false, tempo: null })).toEqual({
      1: { sections: [4, 9.5], gap: 4.25, source: 'build' },
      2: { sections: [8, 8], gap: null, source: 'build' },
    });
  });

  it("does not take Live's 120 BPM stand-in before Live reports a tempo, and times the song once it does", () => {
    const timeSongs = createSongTimer();
    expect(timeSongs(set, [], { ...playingIn(1), tempo: null })).toEqual({});
    expect(timeSongs(set, [], { ...playingIn(1), tempo: 96 })).toEqual({ 1: { sections: [5, 10], gap: null, source: 'tempo' } });
  });

  it('forgets every timing by tempo when Live opens another set, even one whose songs have the same beats', () => {
    const timeSongs = createSongTimer();
    timeSongs(set, [], { ...playingIn(1), tempo: 96 });
    const other = parseSet(SET.map((cue) => ({ ...cue, name: cue.name.replace('Built Song', 'Other Song') })));
    expect(timeSongs(other, [], { now: null, playing: false, tempo: 140 })).toEqual({});
    expect(timeSongs(other, [], { ...playingIn(1), tempo: 120 })[1]).toEqual({ sections: [4, 8], gap: null, source: 'tempo' });
    expect(timeSongs(null, [], { now: null, playing: false, tempo: 120 })).toEqual({});
    expect(timeSongs(other, [], { now: null, playing: false, tempo: 120 })).toEqual({});
  });

  // A Pad and a Pad Out hold the next song's tempo, as the build writes them.
  it("does not time a song by the tempo of its Pad or Pad Out, and times it once Live plays another of its sections", () => {
    const padded = parseSet([
      { name: '1 - Count Off (Padded Song)', time: 0 },
      { name: '1 - Verse', time: 8 },
      { name: '1 - Pad', time: 24 },
      { name: '1 - Pad Out', time: 40 },
      { name: '1 - End', time: 48 },
    ]);
    const timeSongs = createSongTimer();
    const at = (section: number) => ({ now: { song: 1, section, next: 'end' as const, bar: 1, bars: 2, fraction: 0 }, playing: true });
    expect(timeSongs(padded, [], { ...at(2), tempo: 63 })).toEqual({});
    expect(timeSongs(padded, [], { ...at(3), tempo: 63 })).toEqual({});
    expect(timeSongs(padded, [], { ...at(1), tempo: 120 })[1]).toEqual({ sections: [4, 8, 8, 4], gap: null, source: 'tempo' });
  });

  it('keeps the first tempo it timed a song at while Live plays on in it, and times it again once its locators move', () => {
    const timeSongs = createSongTimer();
    timeSongs(set, [], { ...playingIn(1), tempo: 96 });
    expect(timeSongs(set, [], { ...playingIn(1), tempo: 60 })[1]).toEqual({ sections: [5, 10], gap: null, source: 'tempo' });
    const moved = parseSet(SET.map((cue) => (cue.name === '1 - End' ? { ...cue, time: 40 } : cue)));
    expect(timeSongs(moved, [], { ...playingIn(1), tempo: 60 })[1]).toEqual({ sections: [8, 32], gap: null, source: 'tempo' });
  });
});
