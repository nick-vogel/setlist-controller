import { afterEach, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Pre-PR review 2, finding 2. Run from test/. Red at 29644d3: Stop on a stopped Live whose count-in
// start was lost leaves the count-in held until the start-wait timer ends it.

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
const START = '/live/song/start_playing';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

it('ends a count-in whose start never reached Live when the leader presses Stop', async () => {
  rig = await startRig(SET, { playing: false, position: 40 });
  const viewer = await rig.connectViewer();
  const leader = await rig.connectLeader();
  await leader.snapshot(at(40));
  rig.live.loseNext(START);

  leader.send({ kind: 'count-in', song: 1, section: BRIDGE });
  await viewer.snapshot((snapshot) => snapshot.countIn && snapshot.position === 0);
  leader.send({ kind: 'stop' });
  await rig.advanceConnected(1500);
  await leader.flush();

  expect(viewer.received.at(-1)).toMatchObject({ playing: false, countIn: false, jump: null });
});
