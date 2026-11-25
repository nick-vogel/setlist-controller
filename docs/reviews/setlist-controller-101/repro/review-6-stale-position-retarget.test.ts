import { afterEach, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { PROBE_INTERVAL_MS } from '../src/server/live-bridge.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Song 1 in 4/4 opens on a Count Off of 2 bars, then an Intro of two beats, a pickup, so the Verse
// starts inside the bar after the Count Off. Listed in time order, so a cue's index is its place.
const PICKUP_SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 10 },
  { name: '1 - Bridge', time: 24 },
  { name: '1 - End', time: 40 },
];
const VERSE = 2;
const BRIDGE = 3;
const BRIDGE_CUE = 3;
const JUMP = '/live/song/cue_point/jump';
const BEAT_MS = 500;

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

// Live is stopped on the Verse at 10, a beat inside the bar after the Count Off, and the leader
// presses Count in there. The jump to the Count Off is lost, so Live plays on from 10 with no count.
// A tap on the Bridge before the first report must not send the Bridge from the stale position 10:
// the first report, outside the Count Off, is the proof the count-in was lost.
it('sends no jump to a new target tapped before the first report after a lost jump to the Count Off, from a stale position a bar after the Count Off', async () => {
  rig = await startRig(PICKUP_SET, { playing: false, position: 10 });
  const viewer = await rig.connectViewer();
  const leader = await rig.connectLeader();
  await leader.snapshot(at(10));

  rig.live.loseNext(JUMP);
  leader.send({ kind: 'count-in', song: 1, section: VERSE });
  await viewer.snapshot((snapshot) => snapshot.playing && snapshot.countIn);
  await vi.waitFor(() => expect(rig?.live.lost.filter(({ address }) => address === JUMP)).toHaveLength(1));
  leader.send({ kind: 'jump', song: 1, section: BRIDGE });
  await rig.advanceConnected(PROBE_INTERVAL_MS);
  rig.live.advance(BEAT_MS);
  const after = await viewer.snapshot(at(11));

  expect(rig.received(JUMP).map((message) => message.args)).not.toContainEqual([BRIDGE_CUE]);
  expect(rig.received(JUMP).map((message) => message.args)).toEqual([]);
  expect(after).toMatchObject({ countIn: false, jump: null });
});
