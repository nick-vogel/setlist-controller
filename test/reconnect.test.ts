import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { HEARTBEAT_MS, SILENCE_MS } from '../src/shared/heartbeat.ts';
import { leaderSocketPath, SOCKET_PATHS } from '../src/shared/routes.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { connectToServer, retryDelay, type ServerConnection } from '../web/src/server-connection.ts';
import { loaded, startRig, type Rig } from './harness.ts';
import { startProxy, type Proxy } from './proxy.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// One song in 4/4. The Chorus is cue 2 in this list and section 2 of the song.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];
const CHORUS = 2;

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const jumpTo = (section: number) => ({ kind: 'jump', song: 1, section });

function jumpsReceived() {
  return rig?.received('/live/song/cue_point/jump') ?? [];
}

describe('a client that reconnects to the hub', () => {
  it('gets the current snapshot on connect, with a change made while it was away', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const away = await rig.connectViewer();
    expect((await away.snapshot(at(0))).now?.section).toBe(0);
    away.close();

    // While the viewer is away, the leader jumps to the Chorus, which lands at once while stopped,
    // and turns song 1's end toggle to continue.
    const leader = await rig.connectLeader();
    leader.send(jumpTo(CHORUS));
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    await leader.snapshot((snapshot) => at(32)(snapshot) && snapshot.endToggles[1] === 'continue');

    const back = await rig.connectViewer();
    await back.snapshot();
    // The first snapshot already holds both changes: no later snapshot was needed to catch up.
    const first = back.received[0]!;
    expect(first.position).toBe(32);
    expect(first.now?.section).toBe(CHORUS);
    expect(first.endToggles[1]).toBe('continue');
  });

  it('hears a heartbeat every few seconds while Live is stopped and nothing changes', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const idle = await rig.connectViewer();
    await idle.snapshot(loaded);
    const snapshots = idle.received.length;

    await vi.waitFor(() => expect(idle.heartbeats).toBe(1), { timeout: HEARTBEAT_MS + 500, interval: 20 });
    await vi.waitFor(() => expect(idle.heartbeats).toBe(2), { timeout: HEARTBEAT_MS + 500, interval: 20 });
    // A heartbeat is never taken for a snapshot.
    expect(idle.received).toHaveLength(snapshots);
  }, 10_000);

  it('takes a leader that reconnects on the leader path back as the leader', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const first = await rig.connectLeader();
    await first.snapshot(loaded);
    first.close();

    const again = await rig.connectLeader();
    await again.snapshot(loaded);
    again.send(jumpTo(CHORUS));

    await vi.waitFor(() => expect(jumpsReceived()).toEqual([{ address: '/live/song/cue_point/jump', args: [2], types: 'i' }]));
  });
});

describe("the page's connection to the server", () => {
  let proxy: Proxy | undefined;
  let connection: ServerConnection | undefined;

  afterEach(async () => {
    connection?.close();
    connection = undefined;
    await proxy?.close();
    proxy = undefined;
  });

  // A page's document, with a visibility the test sets.
  class Visibility extends EventTarget {
    visibilityState: DocumentVisibilityState = 'visible';
    become(state: DocumentVisibilityState) {
      this.visibilityState = state;
      this.dispatchEvent(new Event('visibilitychange'));
    }
  }

  // Connects as a page does, through the proxy, and keeps every snapshot and status it reports.
  async function connectPage(path: string, visibility = new Visibility()) {
    if (!rig || !proxy) throw new Error('Start the rig and the proxy first');
    const snapshots: Snapshot[] = [];
    const statuses: boolean[] = [];
    connection = connectToServer({
      url: `ws://127.0.0.1:${proxy.port}${path}`,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onStatus: (open) => statuses.push(open),
      visibility,
    });
    await vi.waitFor(() => expect(snapshots.some(loaded)).toBe(true));
    return { snapshots, statuses, visibility };
  }

  const latest = (snapshots: Snapshot[]) => snapshots[snapshots.length - 1];

  it('comes back on its own after the connection drops, with the change made while it was away', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { snapshots } = await connectPage(SOCKET_PATHS.viewer);

    proxy.drop();
    const leader = await rig.connectLeader();
    leader.send(jumpTo(CHORUS));
    await leader.snapshot(at(32));
    proxy.restore();

    await vi.waitFor(() => expect(latest(snapshots)?.now?.section).toBe(CHORUS), { timeout: 2500, interval: 20 });
  });

  it('gives up on a try that hangs while connecting, so tries keep coming under 2 seconds apart', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { snapshots } = await connectPage(SOCKET_PATHS.viewer);

    // The connection drops, and every try after it connects but never hears its handshake back.
    const stalledAt = performance.now();
    proxy.stall();
    const leader = await rig.connectLeader();
    leader.send(jumpTo(CHORUS));
    await leader.snapshot(at(32));
    await new Promise((resolve) => setTimeout(resolve, 4500));

    const tries = proxy.acceptedAt.filter((time) => time > stalledAt);
    expect(tries.length).toBeGreaterThanOrEqual(3);
    const starts = [stalledAt, ...tries, performance.now()];
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeLessThan(2000);

    proxy.restore();
    await vi.waitFor(() => expect(latest(snapshots)?.now?.section).toBe(CHORUS), { timeout: 2500, interval: 20 });
  }, 10_000);

  it('waits under 2 seconds before every try, however many have failed', async () => {
    // Past the tries the clock below can reach.
    for (let attempt = 0; attempt <= 20; attempt++) {
      expect(retryDelay(attempt)).toBeGreaterThan(0);
      expect(retryDelay(attempt)).toBeLessThan(2000);
    }

    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    await connectPage(SOCKET_PATHS.viewer);

    // The server stays out of reach long enough for the waits to reach the longest one, and for a
    // client that gave up after its first few tries to leave a gap of over 2 seconds at the end.
    const droppedAt = performance.now();
    proxy.drop();
    await new Promise((resolve) => setTimeout(resolve, 7000));

    const tries = proxy.acceptedAt.filter((time) => time > droppedAt);
    expect(tries.length).toBeGreaterThanOrEqual(6);
    const starts = [droppedAt, ...tries, performance.now()];
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeLessThan(2000);
  }, 12_000);

  it('reports a frozen socket on a visible page down and replaces it, with Live stopped and nothing changing', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { snapshots, statuses } = await connectPage(SOCKET_PATHS.viewer);
    const opens = proxy.connections;

    // The Wi-Fi drops and comes back while the screen stays on: the socket goes half-open, and no
    // close ever comes for it.
    proxy.freeze();
    const leader = await rig.connectLeader();
    leader.send(jumpTo(CHORUS));
    await leader.snapshot(at(32));

    await vi.waitFor(() => expect(statuses).toEqual([true, false, true]), { timeout: SILENCE_MS + 1500, interval: 20 });
    expect(proxy.connections).toBe(opens + 1);
    expect(latest(snapshots)?.now?.section).toBe(CHORUS);
  }, 15_000);

  it('keeps an idle page on one connection, reported up, while only heartbeats come', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { statuses } = await connectPage(SOCKET_PATHS.viewer);

    await new Promise((resolve) => setTimeout(resolve, SILENCE_MS + HEARTBEAT_MS));

    expect(statuses).toEqual([true]);
    expect(proxy.connections).toBe(1);
  }, 15_000);

  it('comes back at once when the device wakes, though its socket still reads open', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { snapshots, visibility } = await connectPage(SOCKET_PATHS.viewer);

    // The device sleeps and its connection goes half-open: nothing passes, and no close comes.
    visibility.become('hidden');
    proxy.freeze();
    const leader = await rig.connectLeader();
    leader.send(jumpTo(CHORUS));
    await leader.snapshot(at(32));
    // Longer than the longest wait between tries, so a retry alone would have shown the change.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(latest(snapshots)?.now?.section).toBe(0);

    visibility.become('visible');

    // Well under the first wait between tries, so only the wake brought it back.
    await vi.waitFor(() => expect(latest(snapshots)?.now?.section).toBe(CHORUS), { timeout: 200, interval: 10 });
  });

  it('still sends a command made the moment the device wakes, while the fresh socket opens', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { visibility } = await connectPage(leaderSocketPath(rig.leaderSecret));

    visibility.become('hidden');
    visibility.become('visible');
    connection?.send({ kind: 'jump', song: 1, section: CHORUS });

    await vi.waitFor(() => expect(jumpsReceived()).toEqual([{ address: '/live/song/cue_point/jump', args: [2], types: 'i' }]));
  });

  it('reports the connection down when it drops, up when a retry gets through, and never down across a wake', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { statuses, visibility } = await connectPage(SOCKET_PATHS.viewer);
    expect(statuses).toEqual([true]);

    proxy.drop();
    await vi.waitFor(() => expect(statuses).toEqual([true, false]));
    proxy.restore();
    await vi.waitFor(() => expect(statuses).toEqual([true, false, true]), { timeout: 2500, interval: 20 });

    const opens = proxy.connections;
    visibility.become('hidden');
    visibility.become('visible');
    await vi.waitFor(() => expect(proxy?.connections).toBe(opens + 1));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(statuses.slice(3).every((open) => open)).toBe(true);
  });

  it('reports the connection down when a wake finds the old socket dead and every fresh try hangs', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { statuses, visibility } = await connectPage(SOCKET_PATHS.viewer);
    expect(statuses).toEqual([true]);

    proxy.freeze();
    proxy.hang();
    visibility.become('hidden');
    visibility.become('visible');
    await vi.waitFor(() => expect(statuses).toEqual([true, false]), { timeout: 2500, interval: 20 });

    proxy.restore();
    await vi.waitFor(() => expect(statuses.at(-1)).toBe(true), { timeout: 5000, interval: 20 });
    expect(statuses.slice(1, -1).every((open) => !open)).toBe(true);
  }, 10_000);

  it('reports the connection down when the socket a wake replaced closes while the fresh try hangs', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { statuses, visibility } = await connectPage(SOCKET_PATHS.viewer);
    const opens = proxy.connections;

    proxy.hang();
    visibility.become('hidden');
    visibility.become('visible');
    await vi.waitFor(() => expect(proxy?.connections).toBe(opens + 1));
    proxy.cut();
    await vi.waitFor(() => expect(statuses).toEqual([true, false]), { timeout: 1000, interval: 10 });

    proxy.restore();
    await vi.waitFor(() => expect(statuses.at(-1)).toBe(true), { timeout: 5000, interval: 20 });
  }, 10_000);

  it('reports the connection up only once the snapshot has come', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const snapshots: Snapshot[] = [];
    const snapshotsAtStatus: number[] = [];
    connection = connectToServer({
      url: `ws://127.0.0.1:${proxy.port}${SOCKET_PATHS.viewer}`,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onStatus: () => snapshotsAtStatus.push(snapshots.length),
      visibility: new Visibility(),
    });
    await vi.waitFor(() => expect(snapshotsAtStatus).toHaveLength(1));

    proxy.drop();
    proxy.restore();
    await vi.waitFor(() => expect(snapshotsAtStatus).toHaveLength(3), { timeout: 2500, interval: 20 });

    expect(snapshotsAtStatus[0]).toBe(1);
    expect(snapshotsAtStatus[2]).toBe(snapshotsAtStatus[1]! + 1);
  });

  it('does not reconnect once closed', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { visibility } = await connectPage(SOCKET_PATHS.viewer);
    expect(proxy.connections).toBe(1);

    connection?.close();
    proxy.drop();
    proxy.restore();
    visibility.become('hidden');
    visibility.become('visible');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(proxy.connections).toBe(1);
  });

  it('comes back on the leader path as the leader', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    proxy = await startProxy(rig.server.httpPort);
    const { snapshots } = await connectPage(leaderSocketPath(rig.leaderSecret));
    const before = snapshots.length;

    proxy.drop();
    proxy.restore();
    // The hub sends a snapshot on every connect, so a new one means the page is connected again.
    await vi.waitFor(() => expect(snapshots.length).toBeGreaterThan(before), { timeout: 2500, interval: 20 });
    connection?.send({ kind: 'jump', song: 1, section: CHORUS });

    await vi.waitFor(() => expect(jumpsReceived()).toEqual([{ address: '/live/song/cue_point/jump', args: [2], types: 'i' }]));
  });
});
