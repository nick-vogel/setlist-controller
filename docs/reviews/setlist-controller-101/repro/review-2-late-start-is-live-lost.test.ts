import { afterEach, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Pre-PR review 2, finding 1. Run from test/: the setup of test/count-in.test.ts "plays on as an
// ordinary start when Live reports the start only after its Count Off would have played", with one
// more assertion. Red at 29644d3: the count-in is cleared because the held replies take Live for
// lost, not because the start-wait timer fired with Live still connected.

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
const BEAT_MS = 500;

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

it('clears the count-in with Live still connected when Live reports the start only after its Count Off', async () => {
  rig = await startRig(SET, { playing: false, position: 40 });
  const viewer = await rig.connectViewer();
  const leader = await rig.connectLeader();
  await leader.snapshot(at(40));
  rig.live.holdReplies();

  leader.send({ kind: 'count-in', song: 1, section: BRIDGE });
  await viewer.snapshot((snapshot) => snapshot.countIn);
  await rig.advanceConnected(8 * BEAT_MS + 1000);
  await leader.flush();

  expect(viewer.received.at(-1)).toMatchObject({ live: 'connected', countIn: false, jump: null });
});
