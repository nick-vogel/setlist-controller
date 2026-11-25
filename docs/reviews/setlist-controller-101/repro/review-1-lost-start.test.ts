import { afterEach, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Repro for docs/reviews/setlist-controller-101/pre-pr-review-1.md, finding 2. Copy into test/ to run.

// The leader presses Count in to song 1's Bridge from stopped, and the start_playing datagram is
// lost, so Live stays stopped on the Count Off. Once the whole Count Off has had time to play (2 bars
// of 4/4 at 120 BPM, 4 s), nothing is counting, so no page should still read "Count in to Bridge".

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
const COUNT_OFF_MS = 4000;

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

it('ends a count-in whose start never reached Live once its Count Off would have played', async () => {
  rig = await startRig(SET, { playing: false, position: 40 });
  const viewer = await rig.connectViewer();
  const leader = await rig.connectLeader();
  await leader.snapshot(at(40));
  rig.live.loseNext('/live/song/start_playing');

  leader.send({ kind: 'count-in', song: 1, section: BRIDGE });
  await viewer.snapshot((snapshot) => snapshot.countIn && snapshot.position === 0);
  await rig.advanceConnected(COUNT_OFF_MS + 1000);
  await leader.flush();

  expect(viewer.received.at(-1)).toMatchObject({ playing: false, countIn: false, jump: null });
});
