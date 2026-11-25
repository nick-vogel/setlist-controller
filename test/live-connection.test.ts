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
];

const connected = (snapshot: Snapshot) => loaded(snapshot) && snapshot.live === 'connected';
const notConnected = (snapshot: Snapshot) => snapshot.live === 'not-connected';
const at = (beats: number) => (snapshot: Snapshot) => connected(snapshot) && snapshot.position === beats;

const PROBE = '/live/application/get/version';

const received = (address: string) => rig?.received(address) ?? [];

// Every start_listen the running fake Live has received, in order.
const startListens = () =>
  (rig?.live.received ?? []).filter((message) => message.address.startsWith('/live/song/start_listen')).map((message) => message.address);

const EVERY_START_LISTEN = [
  '/live/song/start_listen/current_song_time',
  '/live/song/start_listen/is_playing',
  '/live/song/start_listen/tempo',
  '/live/song/start_listen/signature_numerator',
  '/live/song/start_listen/signature_denominator',
  '/live/song/start_listen/loop_start',
  '/live/song/start_listen/loop_length',
  '/live/song/start_listen/loop',
];

describe('the Live connection', () => {
  it('reports Live connected once it answers', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();

    expect((await viewer.snapshot(connected)).live).toBe('connected');
  });

  it('turns every client to not connected within a few seconds of Live stopping', async () => {
    rig = await startRig(SET, { playing: true, position: 4 });
    const first = await rig.connectViewer();
    const second = await rig.connectViewer();
    await first.snapshot(at(4));
    await second.snapshot(at(4));

    await rig.stopLive();
    rig.clock.advance(4000);

    for (const viewer of [first, second]) {
      const lost = await viewer.snapshot(notConnected);
      expect(lost.position).toBeNull();
      expect(lost.now).toBeNull();
      expect(lost.playing).toBe(false);
      // The set stays, so the setup screen still lists its warnings.
      expect(lost.set?.songs.map((song) => song.number)).toEqual([1]);
    }
  });

  it('stays connected while Live keeps answering', async () => {
    rig = await startRig(SET, { position: 4 });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(4));

    for (let second = 1; second <= 8; second += 1) {
      rig.clock.advance(1000);
      // Each probe reaches Live before the clock moves again.
      await vi.waitFor(() => expect(received(PROBE)).toHaveLength(second + 1));
    }
    rig.live.setPosition(8);

    await viewer.snapshot(at(8));
    expect(viewer.received.filter(notConnected)).toEqual([]);
  });

  // After a stall the tick runs before the replies waiting on the socket are read, so a stalled
  // server must not take its own silence for Live's.
  it('stays connected through a stall of several seconds while Live keeps answering', async () => {
    rig = await startRig(SET, { position: 4 });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(4));

    rig.clock.stall(4000);
    await vi.waitFor(() => expect(received(PROBE)).toHaveLength(2));
    rig.live.setPosition(8);

    await viewer.snapshot(at(8));
    expect(viewer.received.filter(notConnected)).toEqual([]);
  });

  it('registers the listeners again when Live comes back, and the position updates return', async () => {
    rig = await startRig(SET, { position: 4 });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(4));
    await rig.stopLive();
    rig.clock.advance(4000);
    await viewer.snapshot(notConnected);
    const lost = viewer.received.length;

    await rig.startLive();
    rig.clock.advance(1000);

    await vi.waitFor(() =>
      expect(
        (rig?.live.received ?? []).filter((message) => message.address.startsWith('/live/song/start_listen')).map((message) => message.address),
      ).toEqual([
        '/live/song/start_listen/current_song_time',
        '/live/song/start_listen/is_playing',
        '/live/song/start_listen/tempo',
        '/live/song/start_listen/signature_numerator',
        '/live/song/start_listen/signature_denominator',
        '/live/song/start_listen/loop_start',
        '/live/song/start_listen/loop_length',
        '/live/song/start_listen/loop',
      ]),
    );
    // The registered listeners report the playhead at once.
    await viewer.snapshot((snapshot) => viewer.received.indexOf(snapshot) >= lost && at(4)(snapshot));

    // The restarted Live sends a position only to a registered listener.
    rig.live.setPosition(20);
    expect((await viewer.snapshot(at(20))).now).toMatchObject({ song: 1, section: 1 });
  });

  // A Live restart, or an AbletonOSC reload, drops every listener. One quick enough leaves fewer than
  // 3 probes unanswered, so the bridge never sees Live go; only /live/startup says it happened.
  it('registers the listeners again when a restarted Live announces itself inside the loss window', async () => {
    rig = await startRig(SET, { position: 4 });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(4));
    const before = viewer.received.length;

    await rig.stopLive();
    // Two probes go unanswered, one short of the 3 that mean Live is gone.
    rig.clock.advance(2000);
    await rig.startLive({ position: 20, startup: true });

    await vi.waitFor(() => expect(startListens()).toEqual(EVERY_START_LISTEN));
    expect((await viewer.snapshot(at(20))).now).toMatchObject({ song: 1, section: 1 });
    // A probe sent now reaches the fake Live after every earlier message, so the counts are final.
    await rig.advanceConnected(1000);
    // The server reads the set again, as on a fresh connect.
    expect(received('/live/song/get/cue_points')).toHaveLength(1);
    expect(viewer.received.slice(before).filter(notConnected)).toEqual([]);

    // The new listeners carry later changes too, not only their first report.
    rig.live.setPosition(24);
    await viewer.snapshot(at(24));
  });

  it('registers the listeners once when /live/startup is the first word from Live', async () => {
    rig = await startRig(SET, {}, { liveRunning: false });
    const viewer = await rig.connectViewer();
    expect((await viewer.snapshot()).live).toBe('not-connected');

    await rig.startLive({ startup: true });

    const { set } = await viewer.snapshot(connected);
    expect(set?.songs[0]?.sections.map((section) => section.name)).toEqual(['Intro', 'Verse']);
    // A probe sent now reaches the fake Live after every earlier message, so the counts are final.
    await rig.advanceConnected(1000);
    expect(startListens()).toEqual(EVERY_START_LISTEN);
    expect(received('/live/song/get/cue_points')).toHaveLength(1);
  });

  it('ignores a jump while Live is not connected, so none waits when it comes back', async () => {
    rig = await startRig(SET, { position: 4 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(4));
    await rig.stopLive();
    rig.clock.advance(4000);
    await leader.snapshot(notConnected);
    const lost = leader.received.length;

    leader.send({ kind: 'jump', song: 1, section: 1 });
    await leader.flush();
    await rig.startLive();
    rig.clock.advance(1000);
    await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= lost && at(4)(snapshot));

    expect(leader.received.slice(lost).filter((snapshot) => snapshot.jump !== null)).toEqual([]);
  });

  it('loads the set once Live answers, when the server started first', async () => {
    rig = await startRig(SET, {}, { liveRunning: false });
    const viewer = await rig.connectViewer();
    expect((await viewer.snapshot()).live).toBe('not-connected');

    await rig.startLive();
    rig.clock.advance(1000);

    const { set } = await viewer.snapshot(connected);
    expect(set?.songs[0]?.sections.map((section) => section.name)).toEqual(['Intro', 'Verse']);
    expect(received('/live/song/get/cue_points')).toHaveLength(1);
  });
});
