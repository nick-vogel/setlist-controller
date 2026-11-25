import { afterEach, expect, it, vi } from 'vitest';
import type { CuePoint, Track } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Repro for docs/reviews/setlist-controller-59/pre-pr-review-1.md, finding 1. Copy into test/ to run.

let rig: Rig | undefined;

// The test closes the server itself, so the rig's own close finds it closed and only the fake Live is left to close.
afterEach(async () => {
  const closing = rig;
  rig = undefined;
  await closing?.close().catch(() => closing.live.close());
});

const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 64 },
];

// A group with one track in it, then a single track. The top-level tracks are 0 and 2.
const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Kick', grouped: true, volume: 0.5 },
  { name: 'Keys', grouped: false, volume: 0.5 },
];

const playingAt = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats && snapshot.playing;

it('sets every volume back when the server closes during a fade', async () => {
  rig = await startRig(SET, { playing: true, position: 4, tracks: TRACKS });
  const leader = await rig.connectLeader();
  await leader.snapshot(playingAt(4));
  leader.send({ kind: 'fade-out' });
  await vi.waitFor(() => expect(rig?.received('/live/track/get/volume')).toHaveLength(2));
  rig.live.advance(500);
  await leader.snapshot(playingAt(5));
  await rig.advanceConnected(3000);
  await vi.waitFor(() => expect(rig?.live.volumes()[0]).toBeLessThan(0.75));

  await rig.server.close();

  await vi.waitFor(() => expect(rig?.live.volumes()).toEqual([0.75, 0.5, 0.5]), { timeout: 1000 });
});
