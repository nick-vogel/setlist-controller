import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Three songs in 4/4, as the set builder lays them out. Song 1 flows into song 2: its End and song
// 2's Count Off share beat 32. Song 2 is followed by a bar of silence before song 3, which is last.
// A jump names a cue point by its place in this list, so song 1's End is cue 2.
const SET: CuePoint[] = [
  { name: '1 - Intro (Amazing Grace)', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 32 },
  { name: '2 - Count Off (How Great Thou Art)', time: 32 },
  { name: '2 - Intro', time: 40 },
  { name: '2 - End', time: 64 },
  { name: '3 - Intro (Be Thou My Vision)', time: 68 },
  { name: '3 - End', time: 96 },
];

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const CUE_POINTS = '/live/song/get/cue_points';
const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';

const SONG_1_END_CUE = 2;

const reads = () => rig?.received(CUE_POINTS).length ?? 0;

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

// Once Live holds a later command from the leader, it would hold any stop the server sent before it.
async function barrier(leader: Client) {
  const count = rig?.received(JUMP).length ?? 0;
  leader.send({ kind: 'jump', song: 2, section: 1 });
  await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(count + 1));
}

describe('the default end toggle', () => {
  it('starts a song that flows into the next on Continue, and a song before a gap and the last song on Stop at end', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();

    for (const client of [leader, viewer]) {
      expect((await client.snapshot(loaded)).endToggles).toEqual({ 1: 'continue', 2: 'stop', 3: 'stop' });
    }
  });

  it.each([
    { end: 32.00005, toggle: 'continue' },
    { end: 32.0002, toggle: 'stop' },
  ])("starts song 1 on $toggle when its End is on $end, the next song's Count Off on 32", async ({ end, toggle }) => {
    rig = await startRig(SET.map((cue) => (cue.name === '1 - End' ? { ...cue, time: end } : cue)));
    const viewer = await rig.connectViewer();

    expect((await viewer.snapshot(loaded)).endToggles).toEqual({ 1: toggle, 2: 'stop', 3: 'stop' });
  });

  it('starts a song with no End on Stop at end, though the next song follows it', async () => {
    rig = await startRig(SET.filter((cue) => cue.name !== '1 - End'));
    const viewer = await rig.connectViewer();

    expect((await viewer.snapshot(loaded)).endToggles).toEqual({ 1: 'stop', 2: 'stop', 3: 'stop' });
  });

  it('plays on through the End of a song that flows into the next, with no toggle sent', async () => {
    rig = await startRig(SET, { playing: true, position: 30 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot((snapshot) => at(30)(snapshot) && snapshot.playing);

    // Across song 1's End at 32 and into song 2's Count Off on the same beat.
    rig.live.advance(3 * BEAT_MS);

    const after = await viewer.snapshot(at(33));
    expect(after.playing).toBe(true);
    expect(after.now).toMatchObject({ song: 2, section: 0 });
    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
  });
});

describe('a read of the set', () => {
  it("keeps the leader's toggles when the set is the same", async () => {
    rig = await startRig(SET, { position: 4 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'stop' });
    const changed = await viewer.snapshot((snapshot) => snapshot.endToggles[1] === 'stop');
    const after = viewer.received.indexOf(changed);

    leader.send({ kind: 'refresh' });
    await vi.waitFor(() => expect(reads()).toBe(2));
    // The fake Live answers the read before it reports this position, on the same socket.
    rig.live.setPosition(8);
    await viewer.snapshot(at(8));

    expect(viewer.received.slice(after).map((snapshot) => snapshot.endToggles[1])).not.toContain('continue');
    expect(viewer.received.at(-1)?.endToggles).toEqual({ 1: 'stop', 2: 'stop', 3: 'stop' });
  });

  it('starts every song on its default again when the set has changed', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'stop' });
    await viewer.snapshot((snapshot) => snapshot.endToggles[1] === 'stop');

    // Song 1 gains a Bridge. Its End still sits on song 2's Count Off.
    rig.live.setCuePoints([...SET, { name: '1 - Bridge', time: 24 }]);
    leader.send({ kind: 'refresh' });

    const refreshed = await viewer.snapshot((snapshot) => snapshot.set?.songs[0]?.sections.length === 3);
    expect(refreshed.endToggles).toEqual({ 1: 'continue', 2: 'stop', 3: 'stop' });
  });

  it('starts a song on Continue once the next song moves onto its End', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    expect((await viewer.snapshot(loaded)).endToggles[2]).toBe('stop');

    // Song 3's Intro moves back a bar, onto song 2's End: the gap becomes a flow.
    rig.live.setCuePoints(SET.map((cue) => (cue.name.startsWith('3 - Intro') ? { ...cue, time: 64 } : cue)));
    leader.send({ kind: 'refresh' });

    const refreshed = await viewer.snapshot((snapshot) => snapshot.set?.songs[2]?.sections[0]?.time === 64);
    expect(refreshed.endToggles).toEqual({ 1: 'continue', 2: 'continue', 3: 'stop' });
  });
});

describe('next on the last section', () => {
  it('lands on the End of a song that flows into the next, and Live plays on into it, with no toggle sent', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot((snapshot) => at(21)(snapshot) && snapshot.now?.section === 1);

    // From song 1's Verse, its last section.
    leader.send({ kind: 'next' });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toEqual([{ address: JUMP, args: [SONG_1_END_CUE], types: 'i' }]));

    // Across the bar line at 24 by one beat, to End at 32, which is song 2's Count Off.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(33));
    expect(after.playing).toBe(true);
    expect(after.now).toMatchObject({ song: 2, section: 0 });
    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
  });
});
