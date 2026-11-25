import { afterEach, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Pre-PR review 2, finding 1's candidate replacement. Run from test/. At 240 BPM the 2-bar Count Off
// lasts 2 s, so Live's replies are held for less than 3 probes and Live stays connected while the
// start-wait timer ends the count-in. Green at 29644d3; red with the timer's callback emptied, and
// red with its tempo fixed at 120.

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Bridge', time: 40 },
  { name: '1 - Pad', time: 48 },
  { name: '1 - End', time: 56 },
  { name: '2 - Intro', time: 64 },
  { name: '2 - Verse', time: 72 },
  { name: '2 - End', time: 80 },
];
const BRIDGE = 3;
const COUNT_OFF_CUE = 0;
const FAST_BEAT_MS = 250;
const JUMP = '/live/song/cue_point/jump';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

it('plays on as an ordinary start when Live reports the start only after its Count Off would have played', async () => {
  rig = await startRig(SET, { playing: false, position: 40, tempo: 240 });
  const viewer = await rig.connectViewer();
  const leader = await rig.connectLeader();
  await leader.snapshot(at(40));
  rig.live.holdReplies();

  leader.send({ kind: 'count-in', song: 1, section: BRIDGE });
  await viewer.snapshot((snapshot) => snapshot.countIn);
  await rig.advanceConnected(8 * FAST_BEAT_MS + 500);
  await leader.flush();
  expect(viewer.received.at(-1)).toMatchObject({ live: 'connected', countIn: false, jump: null });

  rig.live.releaseReplies();
  await viewer.snapshot((snapshot) => snapshot.playing);
  await leader.flush();
  expect(viewer.received.at(-1)).toMatchObject({ playing: true, countIn: false, jump: null });
  expect(rig.received(JUMP).map((message) => message.args)).toEqual([[COUNT_OFF_CUE]]);
});
