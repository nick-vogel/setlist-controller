import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Song 2's Count Off sits on song 1's End, as an overlap builds it. Song 1 keeps its default end
// toggle, "Continue into next song", so no stop is wanted at End.
const OVERLAP_SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 16 },
  { name: '2 - Count Off', time: 16 },
  { name: '2 - Intro', time: 24 },
  { name: '2 - Verse', time: 32 },
  { name: '2 - Bridge', time: 40 },
  { name: '2 - End', time: 56 },
];
const SONG_2_COUNT_OFF = 0;
const SONG_2_VERSE = 2;
const JUMP = '/live/song/cue_point/jump';
const BEAT_MS = 500;

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const waitingIn = (song: number, section: number) => (snapshot: Snapshot) =>
  snapshot.jump?.song === song && snapshot.jump.section === section;

describe('pre-PR review 5 finding 1: a late tap over a Count Off that sits on a Continue song End', () => {
  // Tap A, to song 2's Count Off, reaches Live in time, so Live jumps there on 16, which looks the same
  // as playing on. Late tap B, to song 2's Verse, reaches Live after 16, so Live makes it on 20. The
  // report at 16.125 is in A's first bar, where Live is still on its way to B.
  it("keeps B's mark on the report in A's first bar, and sends no stop", async () => {
    rig = await startRig(OVERLAP_SET, { playing: true, position: 12 });
    const leader = await rig.connectLeader();
    expect((await leader.snapshot(at(12))).endToggles[1]).not.toBe('stop');

    leader.send({ kind: 'jump', song: 2, section: SONG_2_COUNT_OFF });
    await leader.snapshot(waitingIn(2, SONG_2_COUNT_OFF));
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));

    rig.live.advance(3.875 * BEAT_MS);
    await leader.snapshot(at(15.875));

    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send({ kind: 'jump', song: 2, section: SONG_2_VERSE });
    await leader.snapshot(waitingIn(2, SONG_2_VERSE));
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(2));
    rig.live.releaseReplies();

    expect((await leader.snapshot(at(16.125))).jump).toEqual({ song: 2, section: SONG_2_VERSE });
    expect(rig.received('/live/song/stop_playing')).toHaveLength(0);
  });
});
