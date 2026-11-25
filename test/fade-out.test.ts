import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint, Track } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { startFadeOut } from '../src/server/fade-out.ts';
import type { LiveEvent } from '../src/server/live-bridge.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// One song, long enough that no test's playhead reaches its End.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 64 },
];

// Two songs with a gap between them, so song 1 starts on "Stop at end".
const TWO_SONGS: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - End', time: 16 },
  { name: '2 - Intro', time: 24 },
  { name: '2 - Verse', time: 32 },
  { name: '2 - End', time: 64 },
];

// A group with two tracks in it, then two single tracks. Live lists a group's tracks right after it.
// Every volume is exact in float32, as OSC carries it.
const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Kick', grouped: true, volume: 0.5 },
  { name: 'Snare', grouped: true, volume: 1 },
  { name: 'Keys', grouped: false, volume: 0.5 },
  { name: 'Bass', grouped: false, volume: 0.25 },
];
// The top-level tracks, by index into TRACKS: the group and the two single tracks.
const TOP_LEVEL = [0, 3, 4];

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const TRACK_DATA = '/live/song/get/track_data';
const GET_VOLUME = '/live/track/get/volume';
const SET_VOLUME = '/live/track/set/volume';
const STOP = '/live/song/stop_playing';
const JUMP = '/live/song/cue_point/jump';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const playingAt = (beats: number) => (snapshot: Snapshot) => at(beats)(snapshot) && snapshot.playing;

// The volumes the server has set on a track, in order.
const sentTo = (track: number) =>
  (rig?.received(SET_VOLUME) ?? []).filter((message) => message.args[0] === track).map((message) => message.args[1]);

// The steps start on the server's clock once the last volume is read. Live sends a playhead report
// after its answers to the reads, on the same socket, so once a page shows the report, the fade's
// timer runs. The playhead moves by a beat, from `from`. `reads` is how many volumes the fade reads.
async function stepsStarted(client: Client, from: number, reads = TOP_LEVEL.length) {
  await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(reads));
  rig?.live.advance(BEAT_MS);
  await client.snapshot(playingAt(from + 1));
}

// Waits for Live to hold this many volume sets in all.
const setsReceived = (count: number) => vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength(count));

describe('the fade out', () => {
  it('reads the track list, then the volume of every top-level track and of no grouped track', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));

    leader.send({ kind: 'fade-out' });

    await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(TOP_LEVEL.length));
    expect(rig.received(TRACK_DATA)).toEqual([{ address: TRACK_DATA, args: [0, -1, 'track.name', 'track.is_grouped'], types: 'iiss' }]);
    expect(rig.received(GET_VOLUME)).toEqual(TOP_LEVEL.map((track) => ({ address: GET_VOLUME, args: [track], types: 'i' })));
  });

  it('steps every top-level track down to silence over 6 seconds, and Live plays on with the music silent', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);

    // Halfway, every top-level track is at half its volume, and the grouped tracks are as they were.
    await rig.advanceConnected(3000);
    await setsReceived(30 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0.375, 0.5, 1, 0.25, 0.125]);

    // A step short of the end, each is at a 60th of its volume.
    await rig.advanceConnected(2900);
    await setsReceived(59 * TOP_LEVEL.length);
    const nearlySilent = [0.75 / 60, 0.5, 1, 0.5 / 60, 0.25 / 60];
    rig.live.volumes().forEach((volume, track) => expect(volume).toBeCloseTo(nearlySilent[track]!, 6));

    await rig.advanceConnected(100);
    await setsReceived(60 * TOP_LEVEL.length);
    // Long after the fade, nothing more has gone: no stop, and no volume set back.
    await rig.advanceConnected(6000);

    // Sixty steps down on each top-level track, each lower than the one before, the last to silence.
    for (const track of TOP_LEVEL) {
      const steps = sentTo(track) as number[];
      expect(steps).toHaveLength(60);
      expect(steps.every((volume, step) => step === 0 || volume < steps[step - 1]!)).toBe(true);
      expect(steps.at(-1)).toBe(0);
    }
    expect(rig.received(STOP)).toEqual([]);
    expect(rig.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
    rig.live.advance(BEAT_MS);
    await leader.snapshot((snapshot) => snapshot.playing && snapshot.position !== null && snapshot.position > 5);
  });

  // Fades out to silence, from a press at `from` while Live plays.
  async function silent(leader: Client, from: number, reads = TOP_LEVEL.length) {
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, from, reads);
    await rig!.advanceConnected(6000);
    await setsReceived(60 * reads);
  }

  it('steps every faded track back up to its volume over 6 seconds on a press of Fade in, and Live plays on', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    await silent(leader, 4);

    leader.send({ kind: 'fade-in' });
    await leader.flush();
    // Halfway, every top-level track is back at half its volume.
    await rig.advanceConnected(3000);
    await setsReceived(90 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0.375, 0.5, 1, 0.25, 0.125]);
    await rig.advanceConnected(3000);
    await setsReceived(120 * TOP_LEVEL.length);
    await rig.advanceConnected(1000);

    // Sixty steps up on each top-level track, each higher than the one before, the last at its volume.
    for (const track of TOP_LEVEL) {
      const steps = (sentTo(track) as number[]).slice(60);
      expect(steps).toHaveLength(60);
      expect(steps.every((volume, step) => step === 0 || volume > steps[step - 1]!)).toBe(true);
    }
    expect(rig.received(SET_VOLUME)).toHaveLength(120 * TOP_LEVEL.length);
    expect(rig.received(STOP)).toEqual([]);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
    rig.live.advance(BEAT_MS);
    await leader.snapshot((snapshot) => snapshot.playing && snapshot.position !== null && snapshot.position > 5);
  });

  it('tells every page where the fade is: stepping out, silent, stepping back in, then none', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    expect((await leader.snapshot(playingAt(4))).fade).toBeNull();

    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await leader.snapshot((snapshot) => snapshot.fade === 'out');
    await rig.advanceConnected(6000);
    await setsReceived(60 * TOP_LEVEL.length);
    await leader.snapshot((snapshot) => snapshot.fade === 'silent');
    await viewer.snapshot((snapshot) => snapshot.fade === 'silent');

    leader.send({ kind: 'fade-in' });
    await leader.snapshot((snapshot) => snapshot.fade === 'in');
    await rig.advanceConnected(6000);
    await setsReceived(120 * TOP_LEVEL.length);
    await leader.snapshot((snapshot) => snapshot.fade === null && snapshot.playing);
  });

  it('sets every volume back at once when the playhead reaches the first locator of a song with no Count Off', async () => {
    rig = await startRig(TWO_SONGS, { playing: true, position: 2, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(2));
    await silent(leader, 2);

    // Play from start on song 2, which Live makes on the next bar line, at beat 4.
    leader.send({ kind: 'play-from-start', song: 2 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));
    rig.live.advance(BEAT_MS);
    await leader.snapshot(playingAt(24));

    await vi.waitFor(() => expect(rig?.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]));
    await rig.advanceConnected(6000);
    expect(rig.received(SET_VOLUME)).toHaveLength(61 * TOP_LEVEL.length);
    expect(rig.received(STOP)).toEqual([]);
  });

  it('sends nothing new for a press of Fade in while the fade steps down, or for either press while it steps back up', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-in' });
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await rig.advanceConnected(3000);
    await setsReceived(30 * TOP_LEVEL.length);
    leader.send({ kind: 'fade-in' });
    await leader.flush();
    await rig.advanceConnected(3000);
    await setsReceived(60 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);

    leader.send({ kind: 'fade-in' });
    await leader.flush();
    await rig.advanceConnected(3000);
    await setsReceived(90 * TOP_LEVEL.length);
    leader.send({ kind: 'fade-in' });
    leader.send({ kind: 'fade-out' });
    await leader.flush();
    await rig.advanceConnected(4000);

    expect(rig.received(TRACK_DATA)).toHaveLength(1);
    expect(rig.received(SET_VOLUME)).toHaveLength(120 * TOP_LEVEL.length);
    expect(rig.received(STOP)).toEqual([]);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  });

  it('sets every volume back at once on a Stop while the music is silent', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    await silent(leader, 4);

    leader.send({ kind: 'stop' });
    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    await setsReceived(61 * TOP_LEVEL.length);
    await leader.snapshot((snapshot) => loaded(snapshot) && !snapshot.playing);
    await rig.advanceConnected(6000);

    expect(rig.received(SET_VOLUME).slice(-TOP_LEVEL.length)).toEqual([
      { address: SET_VOLUME, args: [0, 0.75], types: 'if' },
      { address: SET_VOLUME, args: [3, 0.5], types: 'if' },
      { address: SET_VOLUME, args: [4, 0.25], types: 'if' },
    ]);
    expect(rig.received(SET_VOLUME)).toHaveLength(61 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  });

  it('sets every volume back at once when Live stops at a song End while the music is silent', async () => {
    rig = await startRig(TWO_SONGS, { playing: true, position: 2, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(2));
    await silent(leader, 2);

    // Song 1 is on "Stop at end", so Live stops at its End, at beat 16.
    rig.live.advance(12 * BEAT_MS);
    await leader.snapshot(playingAt(15));
    rig.live.advance(BEAT_MS);
    await leader.snapshot((snapshot) => at(16)(snapshot) && !snapshot.playing);
    await setsReceived(61 * TOP_LEVEL.length);
    await rig.advanceConnected(6000);

    expect(rig.received(SET_VOLUME)).toHaveLength(61 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  });

  // Song 1's End sits on song 2's Count Off, so song 1 continues into it. The Count Off runs 8 beats,
  // 4 seconds at 120 BPM, to song 2's first downbeat.
  const INTO_A_COUNT_OFF: CuePoint[] = [
    { name: '1 - Intro', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '1 - End', time: 16 },
    { name: '2 - Count Off', time: 16 },
    { name: '2 - Intro', time: 24 },
    { name: '2 - End', time: 64 },
  ];

  it("fades the music back in over the next song's Count Off, ending on its first downbeat, when a song continues into it", async () => {
    rig = await startRig(INTO_A_COUNT_OFF, { playing: true, position: 12, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(12));
    await silent(leader, 12);

    rig.live.advance(3 * BEAT_MS);
    await leader.snapshot(playingAt(16));
    // Halfway through the Count Off, every top-level track is back at half its volume.
    await rig.advanceConnected(2000);
    await setsReceived(80 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0.375, 0.5, 1, 0.25, 0.125]);
    await rig.advanceConnected(2000);
    await setsReceived(100 * TOP_LEVEL.length);
    await rig.advanceConnected(1000);

    // Forty steps up on each top-level track, each higher than the one before, the last at its volume.
    for (const track of TOP_LEVEL) {
      const steps = (sentTo(track) as number[]).slice(60);
      expect(steps).toHaveLength(40);
      expect(steps.every((volume, step) => step === 0 || volume > steps[step - 1]!)).toBe(true);
    }
    expect(rig.received(SET_VOLUME)).toHaveLength(100 * TOP_LEVEL.length);
    expect(rig.received(STOP)).toEqual([]);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  });

  // The built set's guide and click play on the single tracks the template names GUIDE and MT CLICK.
  // The band follows the guide, and MT CLICK carries the click when Live's metronome fails, so both
  // keep their level. A track named Guide, in another letter case, is not the template's, and fades.
  const WITH_GUIDE_AND_CLICK: Track[] = [
    { name: 'DRUMS', grouped: false, volume: 0.75 },
    { name: 'Kick', grouped: true, volume: 0.5 },
    { name: 'GUIDE', grouped: false, volume: 0.5 },
    { name: 'MT CLICK', grouped: false, volume: 1 },
    { name: 'Guide', grouped: false, volume: 0.25 },
  ];

  it('keeps the GUIDE and MT CLICK tracks at their level, with no step, and fades every other top-level track out and back in', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: WITH_GUIDE_AND_CLICK });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4, 2);

    // Halfway, the faded tracks are at half their volume, and GUIDE and MT CLICK are as they were.
    await rig.advanceConnected(3000);
    await setsReceived(30 * 2);
    expect(rig.live.volumes()).toEqual([0.375, 0.5, 0.5, 1, 0.125]);

    await rig.advanceConnected(3000);
    await setsReceived(60 * 2);
    await rig.advanceConnected(1000);

    expect(rig.received(GET_VOLUME)).toEqual([0, 4].map((track) => ({ address: GET_VOLUME, args: [track], types: 'i' })));
    expect(rig.live.volumes()).toEqual([0, 0.5, 0.5, 1, 0]);

    // And back in: the faded tracks rise, and GUIDE and MT CLICK still get nothing.
    leader.send({ kind: 'fade-in' });
    await leader.flush();
    await rig.advanceConnected(6000);
    await setsReceived(120 * 2);
    await rig.advanceConnected(1000);

    expect(sentTo(2)).toEqual([]);
    expect(sentTo(3)).toEqual([]);
    expect(rig.received(STOP)).toEqual([]);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 0.5, 1, 0.25]);
  });

  it('sets no volume and stops nothing when the set has no top-level track to fade', async () => {
    rig = await startRig(SET, { playing: true, position: 4 });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await vi.waitFor(() => expect(rig?.received(TRACK_DATA)).toHaveLength(1));
    // Live's answer to the read comes back ahead of this report.
    rig.live.advance(BEAT_MS);
    await leader.snapshot(playingAt(5));

    await rig.advanceConnected(5900);
    await rig.advanceConnected(1100);

    expect(rig.received(STOP)).toEqual([]);
    expect(rig.received(GET_VOLUME)).toEqual([]);
    expect(rig.received(SET_VOLUME)).toEqual([]);
    rig.live.advance(BEAT_MS);
    await leader.snapshot((snapshot) => snapshot.playing && snapshot.position !== null && snapshot.position > 5);
  });

  it('sends nothing new for a second press while the fade reads, or while it steps', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));

    leader.send({ kind: 'fade-out' });
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await rig.advanceConnected(3000);
    await setsReceived(30 * TOP_LEVEL.length);
    leader.send({ kind: 'fade-out' });
    await leader.flush();
    await rig.advanceConnected(3000);
    await setsReceived(60 * TOP_LEVEL.length);

    expect(rig.received(TRACK_DATA)).toHaveLength(1);
    expect(rig.received(GET_VOLUME)).toHaveLength(TOP_LEVEL.length);
    for (const track of TOP_LEVEL) expect(sentTo(track)).toHaveLength(60);
    expect(rig.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
    // Long after the fade, nothing more has gone.
    await rig.advanceConnected(1000);
    expect(rig.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length);
    expect(rig.received(STOP)).toEqual([]);
  });

  it('ends when Live stops on its own, sets every volume back at once, and never stops the song played next', async () => {
    rig = await startRig(TWO_SONGS, { playing: true, position: 14, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(14));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 14);
    await rig.advanceConnected(1000);
    await setsReceived(10 * TOP_LEVEL.length);

    // A second into the fade, song 1 reaches its End and Live stops there.
    rig.live.advance(BEAT_MS);
    await leader.snapshot((snapshot) => at(16)(snapshot) && !snapshot.playing);
    await vi.waitFor(() => expect(rig?.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]));

    // The leader starts song 2 inside the 6 seconds. It plays at its normal level, and nothing stops it.
    leader.send({ kind: 'play-from-start', song: 2 });
    await leader.snapshot(playingAt(24));
    await rig.advanceConnected(6000);

    expect(rig.received(STOP)).toHaveLength(1);
    for (const track of TOP_LEVEL) expect(sentTo(track)).toHaveLength(11);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
    rig.live.advance(BEAT_MS);
    await leader.snapshot(playingAt(25));
  });

  it('goes on stepping, and leaves the music silent, when the leader jumps inside the same song', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await rig.advanceConnected(1000);
    await setsReceived(10 * TOP_LEVEL.length);

    // A tap on the Verse, which Live makes on the next bar line, at beat 8.
    leader.send({ kind: 'jump', song: 1, section: 1 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));
    rig.live.advance(3 * BEAT_MS);
    await leader.snapshot(playingAt(16));
    await rig.advanceConnected(5000);
    await setsReceived(60 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);

    // Previous, back to the Intro, while the music is silent.
    leader.send({ kind: 'previous' });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(2));
    rig.live.advance(4 * BEAT_MS);
    await leader.snapshot(playingAt(0));
    await rig.advanceConnected(6000);

    expect(rig.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length);
    expect(rig.received(STOP)).toEqual([]);
    expect(rig.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
  });

  // Song 1 stops at its End, and song 2 counts off from beat 24: 8 beats, 4 seconds at 120 BPM.
  const TWO_SONGS_WITH_A_COUNT_OFF: CuePoint[] = [
    { name: '1 - Intro', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '1 - End', time: 16 },
    { name: '2 - Count Off', time: 24 },
    { name: '2 - Intro', time: 32 },
    { name: '2 - End', time: 64 },
  ];

  it("leaves the music silent when the leader taps the Count Off of the song that plays", async () => {
    rig = await startRig(TWO_SONGS_WITH_A_COUNT_OFF, { playing: true, position: 34, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(34));
    await silent(leader, 34);

    // A tap on song 2's Count Off, which Live makes on the next bar line, at beat 36.
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));
    rig.live.advance(BEAT_MS);
    await leader.snapshot(playingAt(24));
    await rig.advanceConnected(6000);

    expect(rig.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
  });

  it("fades the music back in over the song's Count Off on Play from start", async () => {
    rig = await startRig(TWO_SONGS_WITH_A_COUNT_OFF, { playing: true, position: 2, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(2));
    await silent(leader, 2);

    // Play from start on song 2, which Live makes on the next bar line, at beat 4.
    leader.send({ kind: 'play-from-start', song: 2 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));
    await rig.advanceConnected(1000);
    expect(rig.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length);
    rig.live.advance(BEAT_MS);
    await leader.snapshot(playingAt(24));
    await rig.advanceConnected(2000);
    await setsReceived(80 * TOP_LEVEL.length);
    expect(rig.live.volumes()).toEqual([0.375, 0.5, 1, 0.25, 0.125]);
    await rig.advanceConnected(3000);

    expect(rig.received(SET_VOLUME)).toHaveLength(100 * TOP_LEVEL.length);
    expect(rig.received(STOP)).toEqual([]);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  });

  // Live answers a moment after it acts: AbletonOSC handles what it receives once per tick, then
  // reports. The fake Live answers at once, so these tests hold its answers back to tell a fade the
  // server ends at the Stop from one it ends on Live's report of the stop.
  it('ends at the Stop: stops Live at once, sends no more steps, and sets every volume back without waiting for Live', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await rig.advanceConnected(2000);
    await setsReceived(20 * TOP_LEVEL.length);

    rig.live.holdReplies();
    leader.send({ kind: 'stop' });
    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    // The volumes go back with no word from Live.
    await setsReceived(21 * TOP_LEVEL.length);
    await rig.advanceConnected(1000);
    expect(rig.received(SET_VOLUME)).toHaveLength(21 * TOP_LEVEL.length);
    const stopEnd = rig.live.received.filter((message) => message.address === SET_VOLUME || message.address === STOP).slice(-4);
    expect(stopEnd).toEqual([
      { address: STOP, args: [], types: '' },
      { address: SET_VOLUME, args: [0, 0.75], types: 'if' },
      { address: SET_VOLUME, args: [3, 0.5], types: 'if' },
      { address: SET_VOLUME, args: [4, 0.25], types: 'if' },
    ]);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);

    // Live's report of the stop comes in, and long after it nothing more has gone.
    rig.live.releaseReplies();
    await leader.snapshot((snapshot) => loaded(snapshot) && !snapshot.playing);
    await rig.advanceConnected(6000);
    expect(rig.received(STOP)).toHaveLength(1);
    for (const track of TOP_LEVEL) expect(sentTo(track)).toHaveLength(21);
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  });

  it('ends at a Stop while it still reads the tracks: Live stops, and no volume is read or set', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));

    rig.live.holdReplies();
    leader.send({ kind: 'fade-out' });
    await vi.waitFor(() => expect(rig?.received(TRACK_DATA)).toHaveLength(1));
    leader.send({ kind: 'stop' });
    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    // Live's answer to the read comes back ahead of its report of the stop.
    rig.live.releaseReplies();
    await leader.snapshot((snapshot) => loaded(snapshot) && !snapshot.playing);
    await rig.advanceConnected(7000);

    expect(rig.received(GET_VOLUME)).toEqual([]);
    expect(rig.received(SET_VOLUME)).toEqual([]);
    expect(rig.received(STOP)).toHaveLength(1);
  });

  // In these tests the fade's steps start at server time 0, and the bridge probes on each whole
  // second. It reports Live lost at the fourth probe with no word back, 3 to 4 seconds after Live
  // went silent.

  // Each top-level track set back to the volume it had before the fade.
  const RESTORES = [
    { address: SET_VOLUME, args: [0, 0.75], types: 'if' },
    { address: SET_VOLUME, args: [3, 0.5], types: 'if' },
    { address: SET_VOLUME, args: [4, 0.25], types: 'if' },
  ];

  // Live restarted with each track at the volume the fade left it, so a restore shows in its volumes.
  const restartAt = (volumes: number[]) => rig!.startLive({ tracks: TRACKS.map((track, index) => ({ ...track, volume: volumes[index]! })) });

  it('sets every volume back when Live comes back, after Live went away mid-fade', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await rig.advanceConnected(1000);
    await setsReceived(10 * TOP_LEVEL.length);
    const dropped = rig.live.volumes();

    await rig.stopLive();
    // The bridge reports Live lost at 5 seconds, a second before the fade would end.
    rig.clock.advance(4000);
    await leader.snapshot((snapshot) => snapshot.live === 'not-connected');
    const lost = leader.received.length;
    // Long enough for a fade that stepped on to finish.
    rig.clock.advance(6000);
    await restartAt(dropped);
    rig.clock.advance(1000);

    await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toEqual(RESTORES));
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
    expect(rig.received(STOP)).toEqual([]);

    // Nothing else set a volume before the restore: the next press reads the tracks only after it.
    await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= lost && playingAt(4)(snapshot));
    leader.send({ kind: 'fade-out' });
    await vi.waitFor(() => expect(rig?.received(TRACK_DATA)).toHaveLength(1));
    const addresses = rig.live.received.map((message) => message.address);
    expect(addresses.indexOf(TRACK_DATA)).toBeGreaterThan(addresses.lastIndexOf(SET_VOLUME));
  });

  it('sets every volume back when Live comes back, after Live went away late in the fade and the bridge noticed only once it ended', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await rig.advanceConnected(5000);
    await setsReceived(50 * TOP_LEVEL.length);
    const dropped = rig.live.volumes();

    await rig.stopLive();
    // The last ten steps, the fade's stop and its restore all go to a Live that is gone, at 6
    // seconds. The bridge reports Live lost at 9 seconds.
    rig.clock.advance(4000);
    await leader.snapshot((snapshot) => snapshot.live === 'not-connected');
    await restartAt(dropped);
    rig.clock.advance(1000);

    await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toEqual(RESTORES));
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
    expect(rig.received(STOP)).toEqual([]);
  });

  it('sets every volume back when Live comes back, after Live went away mid-fade and the leader played from start and pressed Fade out again', async () => {
    rig = await startRig(TWO_SONGS, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await rig.advanceConnected(1000);
    await setsReceived(10 * TOP_LEVEL.length);
    const dropped = rig.live.volumes();

    // The bridge has not noticed yet, so the jump and the second press go nowhere.
    await rig.stopLive();
    leader.send({ kind: 'play-from-start', song: 2 });
    leader.send({ kind: 'fade-out' });
    await leader.flush();
    rig.clock.advance(4000);
    await leader.snapshot((snapshot) => snapshot.live === 'not-connected');
    await restartAt(dropped);
    rig.clock.advance(1000);

    await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toEqual(RESTORES));
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  });

  it('reads the tracks again on the next press, after Live went away while the fade read them', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));

    // Live is gone, but the bridge has not noticed yet, so the press goes through and its read goes
    // nowhere.
    await rig.stopLive();
    leader.send({ kind: 'fade-out' });
    await leader.flush();
    rig.clock.advance(4000);
    await leader.snapshot((snapshot) => snapshot.live === 'not-connected');
    const lost = leader.received.length;
    await rig.startLive();
    rig.clock.advance(1000);
    await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= lost && playingAt(4)(snapshot));

    leader.send({ kind: 'fade-out' });
    await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(TOP_LEVEL.length));
    expect(rig.received(TRACK_DATA)).toHaveLength(1);
    expect(rig.received(SET_VOLUME)).toEqual([]);
  });

  // Once Live holds a later command from the leader, it would hold anything the server sent before it.
  async function barrier(leader: Client) {
    const count = rig?.received(JUMP).length ?? 0;
    leader.send({ kind: 'jump', song: 1, section: 1 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(count + 1));
  }
  // Nothing of a fade has reached Live.
  const noFade = () => {
    expect(rig?.received(TRACK_DATA)).toEqual([]);
    expect(rig?.received(GET_VOLUME)).toEqual([]);
    expect(rig?.received(SET_VOLUME)).toEqual([]);
    expect(rig?.received(STOP)).toEqual([]);
  };

  it('is refused while Live is stopped', async () => {
    rig = await startRig(SET, { playing: false, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(4));

    leader.send({ kind: 'fade-out' });
    await barrier(leader);
    await rig.advanceConnected(7000);

    noFade();
  });

  it('is refused while Live is not connected: nothing reaches Live when it comes back, and the next press fades', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    await rig.stopLive();
    rig.clock.advance(4000);
    await leader.snapshot((snapshot) => snapshot.live === 'not-connected');
    const lost = leader.received.length;

    leader.send({ kind: 'fade-out' });
    await leader.flush();
    await rig.startLive();
    rig.clock.advance(1000);
    await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= lost && playingAt(4)(snapshot));
    // Live holds every probe the server sent, so it would hold anything sent before them.
    await rig.advanceConnected(7000);
    noFade();

    // A press accepted while Live was away would leave a fade waiting for a read that never came, and
    // that fade would ignore this press. Refused, it left nothing, so this one reads the tracks.
    leader.send({ kind: 'fade-out' });
    await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(TOP_LEVEL.length));
    expect(rig.received(TRACK_DATA)).toHaveLength(1);
  });

  it('is ignored from a view-only connection, and Live keeps playing', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot(playingAt(4));

    viewer.send({ kind: 'fade-out' });
    await viewer.flush();
    await barrier(leader);
    await rig.advanceConnected(7000);

    noFade();
    rig.live.advance(BEAT_MS);
    expect((await viewer.snapshot(at(5))).playing).toBe(true);
  });

  it('stops stepping when the server closes, so no step goes out on the closed socket, and sets every volume back', async () => {
    rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
    const leader = await rig.connectLeader();
    await leader.snapshot(playingAt(4));
    leader.send({ kind: 'fade-out' });
    await stepsStarted(leader, 4);
    await rig.advanceConnected(1000);
    await setsReceived(10 * TOP_LEVEL.length);
    expect(rig.live.volumes()).not.toEqual([0.75, 0.5, 1, 0.5, 0.25]);

    const closing = rig;
    rig = undefined;
    const { clock } = closing;
    leader.close();
    await closing.server.close();

    await vi.waitFor(() => expect(closing.received(SET_VOLUME)).toHaveLength(11 * TOP_LEVEL.length));
    expect(closing.received(SET_VOLUME).slice(-TOP_LEVEL.length)).toEqual([
      { address: SET_VOLUME, args: [0, 0.75], types: 'if' },
      { address: SET_VOLUME, args: [3, 0.5], types: 'if' },
      { address: SET_VOLUME, args: [4, 0.25], types: 'if' },
    ]);
    expect(closing.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
    expect(() => clock.advance(6000)).not.toThrow();
    expect(closing.received(SET_VOLUME)).toHaveLength(11 * TOP_LEVEL.length);
    await closing.stopLive();
  });
});

function fadeAlone() {
  const clock = manualClock();
  const sent: string[] = [];
  const fade = startFadeOut({
    clock,
    requestTrackData: () => sent.push('track_data'),
    requestTrackVolume: (track) => sent.push(`get ${track}`),
    setTrackVolume: (track, volume) => sent.push(`set ${track} ${volume}`),
    onPhase: () => {},
  });
  return { clock, sent, fade };
}

describe('the fade out on its own', () => {
  it('sets every saved volume back when the server closes after Live went away mid-fade', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, name: 'Track 0', grouped: false }, { track: 1, name: 'Track 1', grouped: false }] });
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(1000);
    fade.fromLive({ kind: 'connection', connected: false });
    sent.length = 0;

    fade.close();
    clock.advance(6000);

    expect(sent).toEqual(['set 0 0.5', 'set 1 0.25']);
  });

  it('sends no saved volume when the server closes more than 10 minutes after Live went away mid-fade', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, name: 'Track 0', grouped: false }, { track: 1, name: 'Track 1', grouped: false }] });
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(1000);
    fade.fromLive({ kind: 'connection', connected: false });
    clock.advance(10 * 60 * 1000 + 1);
    sent.length = 0;

    fade.close();
    clock.advance(6000);

    expect(sent).toEqual([]);
  });

  // The fade runs to silence, then rises for a second when `rising`. Then the bridge reports Live lost.
  const lostWhileSilent = (rising: boolean) => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive(TWO_TRACKS);
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(6000);
    if (rising) {
      fade.fadeIn();
      clock.advance(1000);
    }
    fade.fromLive({ kind: 'connection', connected: false });
    sent.length = 0;
    return { clock, sent, fade };
  };

  for (const rising of [false, true]) {
    const when = rising ? 'while the music rose back in' : 'while the music was silent';
    it(`sets every saved volume back when Live connects exactly 10 minutes after it went away ${when}, and none 1 ms later`, () => {
      const inTime = lostWhileSilent(rising);
      inTime.clock.advance(10 * 60 * 1000);
      inTime.fade.fromLive({ kind: 'connection', connected: true });
      inTime.clock.advance(6000);
      expect(inTime.sent).toEqual(['set 0 0.5', 'set 1 0.25']);

      const late = lostWhileSilent(rising);
      late.clock.advance(10 * 60 * 1000 + 1);
      late.fade.fromLive({ kind: 'connection', connected: true });
      late.clock.advance(6000);
      expect(late.sent).toEqual([]);
    });

    it(`sets every saved volume back when the server closes ${when}`, () => {
      const { clock, sent, fade } = fadeAlone();
      fade.fadeOut();
      fade.fromLive(TWO_TRACKS);
      fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
      fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
      clock.advance(6000);
      if (rising) {
        fade.fadeIn();
        clock.advance(1000);
      }
      sent.length = 0;

      fade.close();
      clock.advance(6000);

      expect(sent).toEqual(['set 0 0.5', 'set 1 0.25']);
    });
  }

  it('starts no fade on a press after the server closes, whatever the fade was doing', () => {
    for (const before of ['idle', 'stepping'] as const) {
      const { clock, sent, fade } = fadeAlone();
      if (before === 'stepping') {
        fade.fadeOut();
        fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, name: 'Track 0', grouped: false }] });
        fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
        clock.advance(1000);
      }
      fade.close();
      sent.length = 0;

      fade.fadeOut();
      clock.advance(6000);

      expect(sent, before).toEqual([]);
    }
  });

  it('sends nothing when the server closes while the fade still reads', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, name: 'Track 0', grouped: false }, { track: 1, name: 'Track 1', grouped: false }] });
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });

    fade.close();
    clock.advance(6000);

    expect(sent).toEqual(['track_data', 'get 0', 'get 1']);
  });

  // The server closes the fade before the bridge, and the bridge reports Live until it closes. A loss
  // then would take the close's restore as at risk, and a connection back would restore again.
  it('sends nothing after the close restores, when Live goes away and comes back before the bridge closes', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, name: 'Track 0', grouped: false }, { track: 1, name: 'Track 1', grouped: false }] });
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(1000);
    sent.length = 0;

    fade.close();
    expect(sent).toEqual(['set 0 0.5', 'set 1 0.25']);
    sent.length = 0;

    fade.fromLive({ kind: 'connection', connected: false });
    fade.fromLive({ kind: 'connection', connected: true });
    clock.advance(6000);

    expect(sent).toEqual([]);
  });

  const TWO_TRACKS: LiveEvent = { kind: 'track-data', tracks: [{ track: 0, name: 'Track 0', grouped: false }, { track: 1, name: 'Track 1', grouped: false }] };

  // A Stop pressed within one AbletonOSC tick of Fade out lands while the fade still reads volumes. The
  // Stop wins (story 57): the volume that comes back after it starts no fade.
  it('sets no volume after a Stop while it reads the volumes, when the last volume comes back after it', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive(TWO_TRACKS);
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.cancel();
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(6000);

    expect(sent).toEqual(['track_data', 'get 0', 'get 1']);
  });

  it('ignores a press up to a second after the press whose reads have not all come back', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    clock.advance(500);
    fade.fadeOut();
    fade.fromLive(TWO_TRACKS);
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    clock.advance(500);
    fade.fadeOut();

    expect(sent).toEqual(['track_data', 'get 0', 'get 1']);
  });

  it('reads the tracks again on a press more than a second after a read whose reply never came, and fades from the new read', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive(TWO_TRACKS);
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    clock.advance(1001);

    fade.fadeOut();
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.75 });
    fade.fromLive(TWO_TRACKS);
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(6000);

    expect(sent.slice(0, 6)).toEqual(['track_data', 'get 0', 'get 1', 'track_data', 'get 0', 'get 1']);
    expect(sent.slice(-2)).toEqual(['set 0 0', 'set 1 0']);
  });

  it('sets no volume and stops nothing while Live never answers a read, however often the leader presses', () => {
    const { clock, sent, fade } = fadeAlone();
    for (let press = 0; press < 3; press += 1) {
      fade.fadeOut();
      clock.advance(2000);
    }

    expect(sent).toEqual(['track_data', 'track_data', 'track_data']);
  });

  it('changes nothing for a volume it did not ask for, or asked for once already', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive(TWO_TRACKS);
    fade.fromLive({ kind: 'track-volume', track: 5, volume: 1 });
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.9 });
    expect(sent).toEqual(['track_data', 'get 0', 'get 1']);

    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(6000);

    expect(sent.slice(3, 5)).toEqual([`set 0 ${0.5 * (1 - 1 / 60)}`, `set 1 ${0.25 * (1 - 1 / 60)}`]);
    expect(sent.slice(-2)).toEqual(['set 0 0', 'set 1 0']);
  });

  // The fade runs to silence at 6 seconds, and a Stop then sets each volume back. The bridge reports
  // Live lost lossAfter ms after that restore, then Live comes back. Returns what the fade sends on
  // the reconnect.
  const reconnectAfterLoss = (lossAfter: number) => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive(TWO_TRACKS);
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(6000);
    fade.cancel();
    clock.advance(lossAfter);
    fade.fromLive({ kind: 'connection', connected: false });
    sent.length = 0;

    fade.fromLive({ kind: 'connection', connected: true });
    return sent;
  };

  it('sets every saved volume back when Live comes back, after the bridge reported the loss a probe tick late, 4101 ms after a Stop restored them', () => {
    expect(reconnectAfterLoss(4101)).toEqual(['set 0 0.5', 'set 1 0.25']);
  });

  // The window is 5100 ms: up to 4 seconds for the bridge to notice a silent Live, a probe interval
  // of slack for a late timer, and one AbletonOSC tick.
  it('sets every saved volume back when Live comes back, after a loss reported at the window edge, 5100 ms after a Stop restored them', () => {
    expect(reconnectAfterLoss(5100)).toEqual(['set 0 0.5', 'set 1 0.25']);
  });

  it('sets no volume when Live comes back, after a loss reported past the window, 5101 ms after a Stop restored them', () => {
    expect(reconnectAfterLoss(5101)).toEqual([]);
  });

  // The fade keeps its saved volumes by one of its two ways into the loss: Live goes 3000 ms after a
  // Stop set them back, inside the window, or 1 s into the steps. Live connects gap ms after the bridge
  // reported the loss. Returns what the fade sends on that connect, and the fade, for a press after it.
  const connectAfterLoss = (wayIn: 'after-restore' | 'stepping', gap: number) => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive(TWO_TRACKS);
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(wayIn === 'after-restore' ? 6000 : 1000);
    if (wayIn === 'after-restore') {
      fade.cancel();
      clock.advance(3000);
    }
    fade.fromLive({ kind: 'connection', connected: false });
    sent.length = 0;

    clock.advance(gap);
    fade.fromLive({ kind: 'connection', connected: true });
    return { sent, fade };
  };

  it('sets no volume when Live connects a week after a loss reported 3000 ms after a Stop restored them', () => {
    expect(connectAfterLoss('after-restore', 7 * 24 * 60 * 60 * 1000).sent).toEqual([]);
  });

  // Saved volumes wait 10 minutes from the loss: long enough to restart Live and reopen the set in a
  // service, far shorter than the time from one service's set to the next.
  it('sets no volume when Live connects more than 10 minutes after it went away 1 s into the steps, and ends the fade', () => {
    const { sent, fade } = connectAfterLoss('stepping', 10 * 60 * 1000 + 1);
    expect(sent).toEqual([]);

    // A press while the volumes wait does nothing, so a read here shows the connect ended the fade.
    fade.fadeOut();
    expect(sent).toEqual(['track_data']);
  });

  for (const wayIn of ['after-restore', 'stepping'] as const) {
    it(`sets every saved volume back when Live connects exactly 10 minutes after the loss, and none 1 ms later (${wayIn})`, () => {
      expect(connectAfterLoss(wayIn, 10 * 60 * 1000).sent).toEqual(['set 0 0.5', 'set 1 0.25']);
      expect(connectAfterLoss(wayIn, 10 * 60 * 1000 + 1).sent).toEqual([]);
    });
  }
});
