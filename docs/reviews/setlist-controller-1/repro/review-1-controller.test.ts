import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Repros for docs/reviews/setlist-controller-1/pre-pr-review-1.md, findings 2, 3 and 5. Copy into test/ to run.

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Song 1: Intro 0-16, Verse 16-32, Chorus 32-48, End 48. A bar of silence, then song 2 from 52.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
  { name: '2 - Intro', time: 52 },
  { name: '2 - End', time: 80 },
];
const BEAT_MS = 500;
const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';
const LOOP_START = '/live/song/set/loop_start';
const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

async function playBeats(beats: number) {
  for (let beat = 0; beat < beats; beat += 1) {
    rig!.live.advance(BEAT_MS);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('finding 2: Next on the last section', () => {
  it('stops Live at End on "Stop at end" when pressed more than a bar before End', async () => {
    rig = await startRig(SET, { playing: true, position: 34 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(34));
    leader.send({ kind: 'next' });
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    // Through the bar line at 36, where Live jumps to End at 48, and on past it.
    await playBeats(6);
    await leader.flush();
    expect(leader.received.map((snapshot) => snapshot.position)).toContain(48);
    expect(rig.received(STOP)).toHaveLength(1);
  });
});

describe('finding 3: a jump while stopped onto the spot the playhead holds', () => {
  it('does not stay waiting', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(0));
    leader.send({ kind: 'previous' });
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    await leader.flush();
    expect(leader.received.at(-1)?.jump).toBeNull();
  });

  it('leaves the auto-stop on when Live then plays from the laptop', async () => {
    rig = await startRig(SET, { playing: false, position: 32 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(32));
    leader.send({ kind: 'jump', song: 1, section: 2 });
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    rig.live.setPlaying(true);
    await leader.snapshot((snapshot) => snapshot.playing);
    await playBeats(18);
    await leader.flush();
    expect(rig.received(STOP)).toHaveLength(1);
  });
});

describe('finding 5: Loop pressed while a jump waits', () => {
  it('never braces the section the playhead is about to leave', async () => {
    rig = await startRig(SET, { playing: true, position: 20 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(20));
    // Previous waits for the bar line at 24, then Loop before it.
    leader.send({ kind: 'previous' });
    leader.send({ kind: 'loop' });
    // A second jump is the barrier: it leaves the server's one OSC socket after any loop message.
    leader.send({ kind: 'jump', song: 1, section: 2 });
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(2));
    expect(rig.received(LOOP_START).map((message) => message.args[0])).not.toContain(16);
  });
});
