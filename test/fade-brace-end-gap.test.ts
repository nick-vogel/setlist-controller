import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint, Track } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

// Proof for setlist-controller#156 review-1 F1.1 (wrapfrom-null-ambiguity). A loop braced by hand over
// the gap between two songs ends on song 2's Count Off. The report on the brace end comes while the
// playhead was in no section, so the section kept from before it is none. A move on into song 2's
// Count Off after the loop is turned off is a move from no song, so the music must come back (#107).

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Song 1 ends at 32, song 2's Count Off starts at 36: a gap of a bar between them.
const GAP: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - End', time: 32 },
  { name: '2 - Count Off (Trust)', time: 36 },
  { name: '2 - Verse', time: 44 },
  { name: '2 - End', time: 60 },
];

const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Kick', grouped: true, volume: 0.5 },
  { name: 'Snare', grouped: true, volume: 1 },
  { name: 'Keys', grouped: false, volume: 0.5 },
  { name: 'Bass', grouped: false, volume: 0.25 },
];
const TOP_LEVEL = [0, 3, 4];
const BEAT_MS = 500;
const GET_VOLUME = '/live/track/get/volume';
const SET_VOLUME = '/live/track/set/volume';

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;
const playingNear = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.playing && near(snapshot.position, beats);
const sentTo = (track: number) =>
  (rig?.received(SET_VOLUME) ?? []).filter((message) => message.args[0] === track).map((message) => message.args[1] as number);

async function moveTo(leader: Client, beats: number) {
  rig!.live.setPosition(beats);
  return leader.snapshot(playingNear(beats));
}

const next = (leader: Client, matches: (snapshot: Snapshot) => boolean) => {
  const start = leader.received.length;
  return leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= start && matches(snapshot));
};

describe("a move on into song 2's Count Off after a report on the brace end of a loop braced by hand over the gap", () => {
  it('brings the music back when the loop is turned off at the laptop and playback goes on into the Count Off', async () => {
    // Playing in the gap at 33, a loop braced by hand over the gap (32 to 36), and the Fade out run to silence.
    rig = await startRig(GAP, { playing: true, position: 33, tracks: TRACKS, loop: { on: true, start: 32, length: 4 } });
    const leader = await rig.connectLeader();
    const start = await leader.snapshot((s) => playingNear(33)(s) && s.loop !== null);
    expect(start.now).toBeNull();
    leader.send({ kind: 'fade-out' });
    await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(TOP_LEVEL.length));
    rig.live.advance(BEAT_MS);
    await leader.snapshot(playingNear(34));
    await rig.advanceConnected(6000);
    await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length));
    expect(rig.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
    const silent = await leader.snapshot((s) => s.fade === 'silent');
    expect(silent.now).toBeNull();

    // The loop going round: a report on the brace end, which nowPlaying reads as song 2's Count Off.
    const onBrace = await moveTo(leader, Math.fround(35.99995));
    expect(onBrace.now).toMatchObject({ song: 2, section: 0 });
    expect(onBrace.fade).toBe('silent');

    // The loop turned off at the laptop before the next report, then playback goes on into the Count Off.
    rig.live.setLoop({ on: false });
    await next(leader, (snapshot) => snapshot.loop === null);
    const into = await moveTo(leader, 37);

    expect(into.now).toMatchObject({ song: 2, section: 0 });
    expect(into.fade).toBe('in');

    // Song 2's Count Off runs from 37 to its first downbeat at 44: 3500 ms, a step every 100 ms.
    const rising = 35;
    await rig.advanceConnected(3500 + 1000);
    await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength((60 + rising) * TOP_LEVEL.length));
    for (const track of TOP_LEVEL) {
      const steps = sentTo(track).slice(60);
      expect(steps.every((volume, step) => step === 0 || volume > steps[step - 1]!)).toBe(true);
    }
    expect(rig.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
  });

  // Control: the same move with no brace-end report before it, which the controller already gets right.
  it('control: brings the music back on the same move into the Count Off with no brace-end report before it', async () => {
    rig = await startRig(GAP, { playing: true, position: 33, tracks: TRACKS, loop: { on: true, start: 32, length: 4 } });
    const leader = await rig.connectLeader();
    await leader.snapshot((s) => playingNear(33)(s) && s.loop !== null);
    leader.send({ kind: 'fade-out' });
    await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(TOP_LEVEL.length));
    rig.live.advance(BEAT_MS);
    await leader.snapshot(playingNear(34));
    await rig.advanceConnected(6000);
    await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length));
    await moveTo(leader, 35);

    rig.live.setLoop({ on: false });
    await next(leader, (snapshot) => snapshot.loop === null);
    const into = await moveTo(leader, 37);

    expect(into.now).toMatchObject({ song: 2, section: 0 });
    expect(into.fade).toBe('in');
  });
});
