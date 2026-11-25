import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { PROBE_INTERVAL_MS } from '../src/server/live-bridge.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

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
// One-bar Count Off.
const ONE_BAR: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 4 },
  { name: '1 - Verse', time: 12 },
  { name: '1 - Bridge', time: 20 },
  { name: '1 - End', time: 28 },
];
const BEAT_MS = 500;
const JUMP = '/live/song/cue_point/jump';
const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const jumps = () => (rig?.received(JUMP) ?? []).map((m) => m.args[0]);



describe('pre-PR review 3', () => {
  // Finding 2. Live stopped on the Bridge, the page shows the Bridge. Tap the Verse, tap the Bridge
  // again, and press Count in (to the Bridge, the section the page shows) within one report round trip.
  it('holds a count-in whose target is the section a stale tap report moves the playhead back to', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    rig.live.holdReplies();
    leader.send({ kind: 'jump', song: 1, section: 2 });
    await vi.waitFor(() => expect(jumps()).toEqual([2]));
    leader.send({ kind: 'jump', song: 1, section: 3 });
    await vi.waitFor(() => expect(jumps()).toEqual([2, 3]));
    leader.send({ kind: 'count-in', song: 1, section: 3 });
    await vi.waitFor(() => expect(jumps()).toEqual([2, 3, 0]));
    rig.live.releaseReplies();
    const counting = await viewer.snapshot((s) => at(0)(s) && s.playing);
    expect(counting).toMatchObject({ countIn: true, jump: { song: 1, section: 3 } });
  });

  // Finding 2, the backward form. Live stopped on the Bridge. Tap the Pad, tap the Bridge again, and
  // press Count in to the Bridge within one report round trip.
  it('holds a count-in whose target a stale tap report moves the playhead back into from later', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    rig.live.holdReplies();
    leader.send({ kind: 'jump', song: 1, section: 4 });
    await vi.waitFor(() => expect(jumps()).toEqual([4]));
    leader.send({ kind: 'jump', song: 1, section: 3 });
    await vi.waitFor(() => expect(jumps()).toEqual([4, 3]));
    leader.send({ kind: 'count-in', song: 1, section: 3 });
    await vi.waitFor(() => expect(jumps()).toEqual([4, 3, 0]));
    rig.live.releaseReplies();
    const counting = await viewer.snapshot((s) => at(0)(s) && s.playing);
    expect(counting).toMatchObject({ countIn: true, jump: { song: 1, section: 3 } });
  });

  // Finding 3. A one-bar Count Off, with Live stopped on its start, so the jump to it moves nothing.
  it.each([{ from: 0 }, { from: 16 }])('holds a count-in with no report inside a one-bar Count Off, Live stopped at $from', async ({ from }) => {
    rig = await startRig(ONE_BAR, { playing: false, position: from });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(from));
    leader.send({ kind: 'count-in', song: 1, section: 3 });
    await viewer.snapshot((s) => at(0)(s) && s.playing && s.countIn);
    rig.live.advance(4.5 * BEAT_MS);
    const late = await viewer.snapshot(at(4.5));
    await rig.advanceConnected(PROBE_INTERVAL_MS);
    expect(late).toMatchObject({ countIn: true, jump: { song: 1, section: 3 } });
  });

  // Finding 1. The playhead is moved at the laptop into song 2 once the Count Off has played a while.
  it('sends no jump back to the target once Live plays in another song', async () => {
    rig = await startRig(SET, { playing: false, position: 48 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(48));
    leader.send({ kind: 'count-in', song: 1, section: 3 });
    await viewer.snapshot((s) => at(0)(s) && s.playing && s.countIn);
    rig.live.advance(2 * BEAT_MS);
    await viewer.snapshot(at(2));
    rig.live.setPosition(72);
    const moved = await viewer.snapshot(at(72));
    await rig.advanceConnected(PROBE_INTERVAL_MS);
    expect(moved).toMatchObject({ countIn: false, jump: null });
    expect(jumps()).toEqual([0]);
  });

  // Finding 1. The playhead is moved at the laptop to before the Count Off once it has played a while.
  it('ends a count-in once Live plays before its Count Off', async () => {
    const BEFORE: CuePoint[] = [
      { name: '1 - Intro', time: 0 },
      { name: '1 - End', time: 16 },
      { name: '2 - Count Off', time: 24 },
      { name: '2 - Intro', time: 32 },
      { name: '2 - Verse', time: 40 },
      { name: '2 - End', time: 56 },
    ];
    rig = await startRig(BEFORE, { playing: false, position: 48 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(48));
    leader.send({ kind: 'count-in', song: 2, section: 2 });
    await viewer.snapshot((s) => at(24)(s) && s.playing && s.countIn);
    rig.live.advance(2 * BEAT_MS);
    await viewer.snapshot(at(26));
    rig.live.setPosition(2);
    await viewer.snapshot(at(2));
    rig.live.advance(4 * BEAT_MS);
    const later = await viewer.snapshot(at(6));
    expect(later).toMatchObject({ countIn: false, jump: null });
  });
});
