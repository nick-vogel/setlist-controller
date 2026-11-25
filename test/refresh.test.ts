import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 32 },
  { name: '2 - Intro', time: 36 },
  { name: '2 - End', time: 64 },
];

const CUE_POINTS = '/live/song/get/cue_points';
const PROBE = '/live/application/get/version';
const JUMP = '/live/song/cue_point/jump';

const reads = () => rig?.received(CUE_POINTS).length ?? 0;
// The section names of every song in a snapshot's set.
const sections = (snapshot: Snapshot) => snapshot.set?.songs.map((song) => song.sections.map((section) => section.name));
const hasBridge = (snapshot: Snapshot) => sections(snapshot)?.[0]?.includes('Bridge') ?? false;

// SET with a Bridge added to song 1, as the operator adds a locator in Live.
const WITH_BRIDGE: CuePoint[] = [...SET, { name: '1 - Bridge', time: 24 }];

// Moves the server's clock on a second at a time, and lets each of the bridge's probes reach Live
// before the next, so Live keeps answering. One long advance would fire every probe unanswered and
// lose Live.
async function step(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    const probes = rig?.received(PROBE).length ?? 0;
    rig?.clock.advance(1000);
    await vi.waitFor(() => expect(rig?.received(PROBE)).toHaveLength(probes + 1));
  }
}
const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

describe('the poll while Live is stopped', () => {
  it("shows a locator added in Live on every page after the next poll, and puts every song back on Stop at end", async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    await viewer.snapshot((snapshot) => snapshot.endToggles[1] === 'continue');

    rig.live.setCuePoints(WITH_BRIDGE);
    await step(4000);
    expect(reads()).toBe(1);
    expect(viewer.received.filter(hasBridge)).toEqual([]);

    await step(1000);

    for (const client of [viewer, leader]) {
      const refreshed = await client.snapshot(hasBridge);
      expect(sections(refreshed)).toEqual([['Intro', 'Verse', 'Bridge'], ['Intro']]);
      expect(refreshed.endToggles).toEqual({ 1: 'stop', 2: 'stop' });
    }
  });
});

describe('while Live plays', () => {
  it('never reads the set, by poll or by Refresh, however long the clock runs', async () => {
    rig = await startRig(SET, { playing: true, position: 4 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => loaded(snapshot) && snapshot.playing);

    leader.send({ kind: 'refresh' });
    await leader.flush();
    await step(30000);

    expect(reads()).toBe(1);

    // The control: once Live stops, the poll reads again.
    rig.live.setPlaying(false);
    await leader.snapshot((snapshot) => loaded(snapshot) && !snapshot.playing);
    await step(5000);
    await vi.waitFor(() => expect(reads()).toBeGreaterThan(1));
  });

  it('keeps the set and every end toggle when Live comes back mid-song with the locators changed', async () => {
    rig = await startRig(SET, { playing: true, position: 20 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    await viewer.snapshot((snapshot) => snapshot.endToggles[1] === 'continue' && snapshot.playing);

    // Song 2's Intro moves a bar later while the band plays song 1.
    rig.live.setCuePoints(SET.map((cue) => (cue.name === '2 - Intro' ? { ...cue, time: 40 } : cue)));
    // Live's main thread stalls: four probes go out before any answer is read, so the server loses
    // Live, then finds it again on the answers, still playing.
    rig.clock.advance(4000);
    const lost = await viewer.snapshot((snapshot) => snapshot.live === 'not-connected');
    const since = viewer.received.indexOf(lost);
    await vi.waitFor(() => expect(reads()).toBe(2));
    await viewer.snapshot(
      (snapshot) => viewer.received.indexOf(snapshot) > since && snapshot.live === 'connected' && snapshot.playing,
    );

    // Playback carries on to song 1's End. The fake Live answers the read before it reports these.
    rig.live.setPosition(31);
    await viewer.snapshot(at(31));
    rig.live.setPosition(32.5);
    await viewer.snapshot(at(32.5));
    // A jump as the barrier: it leaves the server's OSC socket after any stop the End would send.
    leader.send({ kind: 'jump', song: 1, section: 0 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));

    const after = viewer.received.slice(since);
    expect(after.map((snapshot) => snapshot.set?.songs[1]?.sections[0]?.time)).not.toContain(40);
    expect(after.map((snapshot) => snapshot.endToggles[1])).not.toContain('stop');
    expect(rig.received('/live/song/stop_playing')).toEqual([]);
  });
});

describe('the Refresh command', () => {
  it('reads the set from Live at once', async () => {
    rig = await startRig(SET);
    const leader = await rig.connectLeader();
    await leader.snapshot(loaded);
    expect(reads()).toBe(1);

    leader.send({ kind: 'refresh' });

    await vi.waitFor(() => expect(reads()).toBe(2));
  });

  it('is rejected from a view-only connection', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(loaded);

    viewer.send({ kind: 'refresh' });
    await viewer.flush();
    // The leader's Refresh, then a jump as the barrier: both leave the server's one OSC socket after
    // anything the viewer's Refresh sent, so once the jump reaches Live, every read has too.
    leader.send({ kind: 'refresh' });
    leader.send({ kind: 'jump', song: 1, section: 1 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));

    expect(reads()).toBe(2);
  });
});

describe('a read of the set', () => {
  it('keeps every end toggle when the set is the same', async () => {
    rig = await startRig(SET, { position: 4 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    const changed = await viewer.snapshot((snapshot) => snapshot.endToggles[1] === 'continue');
    const after = viewer.received.indexOf(changed);

    leader.send({ kind: 'refresh' });
    await vi.waitFor(() => expect(reads()).toBe(2));
    // The fake Live answers the read before it reports this position, on the same socket.
    rig.live.setPosition(8);
    await viewer.snapshot(at(8));

    expect(viewer.received.slice(after).map((snapshot) => snapshot.endToggles)).not.toContainEqual({ 1: 'stop', 2: 'stop' });
    expect(viewer.received.at(-1)?.endToggles).toEqual({ 1: 'continue', 2: 'stop' });
  });

  it('puts every song back on Stop at end when the set has changed', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    leader.send({ kind: 'set-end-toggle', song: 2, toggle: 'continue' });
    await viewer.snapshot((snapshot) => snapshot.endToggles[2] === 'continue');

    // Song 2's Intro moves a bar later.
    rig.live.setCuePoints(SET.map((cue) => (cue.name === '2 - Intro' ? { ...cue, time: 40 } : cue)));
    leader.send({ kind: 'refresh' });

    const refreshed = await viewer.snapshot((snapshot) => snapshot.set?.songs[1]?.sections[0]?.time === 40);
    expect(refreshed.endToggles).toEqual({ 1: 'stop', 2: 'stop' });
  });

  it('keeps no waiting jump pointing into the old set when the set has changed', async () => {
    rig = await startRig(SET, { position: 0 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot(at(0));
    // Live has lost the Verse's locator since the last read, so the jump to it finds no cue point,
    // moves no playhead, and stays waiting.
    rig.live.setCuePoints(SET.slice(0, 1));
    leader.send({ kind: 'jump', song: 1, section: 1 });
    await viewer.snapshot((snapshot) => snapshot.jump?.section === 1);
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));

    // A locator before the Verse, so section 1 of song 1 is now the Pre.
    rig.live.setCuePoints([...SET, { name: '1 - Pre', time: 8 }]);
    leader.send({ kind: 'refresh' });

    const refreshed = await viewer.snapshot((snapshot) => sections(snapshot)?.[0]?.includes('Pre') ?? false);
    expect(refreshed.jump).toBeNull();
  });
});
