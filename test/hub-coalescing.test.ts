import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { POSITION_BROADCAST_MS } from '../src/server/hub.ts';
import { SILENT_BEFORE_LOST_MS } from '../src/server/live-bridge.ts';
import { producerSocketPath, SOCKET_PATHS } from '../src/shared/routes.ts';
import type { ProducerSnapshot, Snapshot } from '../src/shared/snapshot.ts';
import { fakeTarget } from './fake-target.ts';
import { connect, loaded, startRig, type Rig } from './harness.ts';
import { startProxy, type Proxy } from './proxy.ts';

let rig: Rig | undefined;
let proxy: Proxy | undefined;
let logDir: string | undefined;

afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
  await rig?.close();
  rig = undefined;
  if (logDir) await rm(logDir, { recursive: true, force: true });
  logDir = undefined;
});

const REPO_ROOT = resolve(import.meta.dirname, '..');

async function newLogDir(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  logDir = await mkdtemp(join(REPO_ROOT, 'dist/hub-coalescing-'));
  return logDir;
}

// A realistic multi-song set (~5 KB encoded snapshot), with a long first section (beats 0..1024)
// so tests can stream hundreds of intra-section position updates without crossing section boundaries.
function largeSet(): CuePoint[] {
  const cues: CuePoint[] = [
    { name: '1 - Intro (A Long Opening Section Title For Realistic Payload Size)', time: 0 },
    { name: '1 - Verse 1', time: 1024 },
    { name: '1 - Chorus 1', time: 1056 },
    { name: '1 - End', time: 1088 },
  ];
  let beat = 1104;
  for (let song = 2; song <= 9; song += 1) {
    cues.push({ name: `${song} - Intro (Sunday Worship Song Number ${song} With Full Band Arrangement)`, time: beat });
    beat += 16;
    for (const name of ['Verse 1', 'Pre-Chorus', 'Chorus 1', 'Verse 2', 'Chorus 2', 'Bridge 1', 'Bridge 2', 'Chorus 3', 'Tag', 'Outro']) {
      cues.push({ name: `${song} - ${name}`, time: beat });
      beat += 16;
    }
    cues.push({ name: `${song} - End`, time: beat });
    beat += 16;
  }
  return cues;
}

// A smaller set for pacing, significant-change flush, and cue-timing tests.
// At 120 BPM in 4/4 a beat is 500 ms.
const BEAT_MS = 500;
const SET: CuePoint[] = [
  { name: '1 - Intro (Way Maker)', time: 0 },
  { name: '1 - Verse', time: 64 },
  { name: '1 - Chorus', time: 96 },
  { name: '1 - End', time: 128 },
];

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;
const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && near(snapshot.position, beats);

describe('per-socket slow-link coalescing', () => {
  it('coalesces snapshots for a paused slow socket instead of draining a stale backlog, and never delays a healthy sibling', async () => {
    const hubClock = manualClock();
    rig = await startRig(largeSet(), { playing: true, position: 0 }, { hubClock });
    proxy = await startProxy(rig.server.httpPort);

    const slow = await connect(`ws://127.0.0.1:${proxy.port}${SOCKET_PATHS.viewer}`);
    const healthy = await rig.connectViewer();
    try {
      await slow.snapshot(at(0));
      await healthy.snapshot(at(0));

      const beforePause = slow.received.length;
      const healthyBefore = healthy.received.length;
      proxy.pause();

      // Stream 400 distinct ~5 KB broadcasts (~2 MB total), well past the OS loopback TCP buffer,
      // advancing hubClock and awaiting healthy on each step so every single update is actually
      // broadcast by the hub (proving per-socket backpressure coalescing, not the 20 Hz rate cap).
      const totalUpdates = 400;
      for (let i = 1; i <= totalUpdates; i += 1) {
        hubClock.advance(POSITION_BROADCAST_MS);
        rig.live.setPosition(i);
        await healthy.snapshot(at(i));
      }

      // The healthy sibling received every single broadcast immediately while slow was paused.
      const healthyDelivered = healthy.received.length - healthyBefore;
      expect(healthyDelivered).toBe(totalUpdates);
      expect(healthy.received.at(-1)?.position).toBeCloseTo(totalUpdates, 3);
      expect(slow.received.length).toBe(beforePause);

      // Resume the slow TCP link: it drains what was already in the kernel pipe and jumps straight
      // to the newest snapshot without draining hundreds of stale queued frames.
      proxy.resume();
      await slow.snapshot(at(totalUpdates));
      await slow.flush();

      const deliveredWhilePaused = slow.received.length - beforePause;
      expect(slow.received.at(-1)?.position).toBeCloseTo(totalUpdates, 3);
      // Today's uncoalesced hub queues all 400 frames onto the socket and drains every single one.
      // With per-socket latest-only coalescing, the slow client receives only what fit in the TCP
      // pipe before backpressure engaged plus the single newest snapshot on drain.
      expect(deliveredWhilePaused).toBeLessThan(healthyDelivered / 2);
    } finally {
      slow.close();
    }
  }, 15_000);

  it('converges a paused slow producer socket to the newest producer snapshot including connections', async () => {
    const hubClock = manualClock();
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(largeSet(), { playing: true, position: 0 }, { hubClock, targets: [target] });
    proxy = await startProxy(rig.server.httpPort);

    const slowProducer = await connect<ProducerSnapshot>(`ws://127.0.0.1:${proxy.port}${producerSocketPath(rig.producerSecret)}`);
    const healthyProducer = await rig.connectProducer();
    const healthyViewer = await rig.connectViewer();
    try {
      await slowProducer.snapshot((snapshot) => at(0)(snapshot) && snapshot.connections[0]?.connection === 'online');
      await healthyProducer.snapshot((snapshot) => at(0)(snapshot) && snapshot.connections[0]?.connection === 'online');
      await healthyViewer.snapshot(at(0));

      const beforePause = slowProducer.received.length;
      const healthyBefore = healthyProducer.received.length;
      proxy.pause();

      const totalUpdates = 400;
      for (let i = 1; i <= totalUpdates; i += 1) {
        hubClock.advance(POSITION_BROADCAST_MS);
        rig.live.setPosition(i);
        await healthyProducer.snapshot(at(i));
      }
      expect(healthyProducer.received.length - healthyBefore).toBe(totalUpdates);

      // Trigger a producer-only state change while the slow producer socket is backed up.
      await healthyViewer.snapshot(at(totalUpdates));
      const viewerCountBeforeArm = healthyViewer.received.length;
      healthyProducer.send({ kind: 'arm', target: 'propresenter' });
      await healthyProducer.snapshot((snapshot) => snapshot.connections[0]?.arm === 'armed');
      await healthyViewer.flush();
      expect(healthyViewer.received.length).toBe(viewerCountBeforeArm);

      proxy.resume();
      await slowProducer.snapshot((snapshot) => at(totalUpdates)(snapshot) && snapshot.connections[0]?.arm === 'armed');
      await slowProducer.flush();

      const latest = slowProducer.received.at(-1)!;
      expect(latest.position).toBeCloseTo(totalUpdates, 3);
      expect(latest.connections[0]?.arm).toBe('armed');
      expect(slowProducer.received.length - beforePause).toBeLessThan(totalUpdates / 2);
    } finally {
      slowProducer.close();
    }
  }, 15_000);

  it('delivers significant state changes immediately to healthy siblings while a slow socket is paused', async () => {
    const hubClock = manualClock();
    rig = await startRig(largeSet(), { playing: true, position: 0 }, { hubClock });
    proxy = await startProxy(rig.server.httpPort);

    const slow = await connect(`ws://127.0.0.1:${proxy.port}${SOCKET_PATHS.viewer}`);
    const healthy = await rig.connectLeader();
    try {
      await slow.snapshot(at(0));
      await healthy.snapshot(at(0));

      const beforePause = slow.received.length;
      proxy.pause();
      for (let i = 1; i <= 250; i += 1) {
        hubClock.advance(POSITION_BROADCAST_MS);
        rig.live.setPosition(i);
        await healthy.snapshot(at(i));
      }

      // While slow is paused and backed up, Stop reaches the healthy leader immediately.
      rig.live.setPlaying(false);
      const stopped = await healthy.snapshot((snapshot) => at(250)(snapshot) && !snapshot.playing);
      expect(stopped.playing).toBe(false);
      expect(slow.received.length).toBe(beforePause);
      expect(slow.received.at(-1)?.playing).toBe(true);

      proxy.resume();
      await slow.snapshot((snapshot) => !snapshot.playing && at(250)(snapshot));
    } finally {
      slow.close();
    }
  }, 15_000);
});

describe('20 Hz position-only broadcast cap and immediate state flush', () => {
  it('caps rapid intra-section position-only updates to ~20 Hz on the hub clock with a trailing flush', async () => {
    const hubClock = manualClock();
    rig = await startRig(SET, { playing: true, position: 0 }, { hubClock });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(0));

    // Open the first 50 ms window past startup.
    hubClock.advance(POSITION_BROADCAST_MS);
    const beforeBurst = viewer.received.length;

    // First position-only tick at the window boundary goes out immediately.
    rig.live.setPosition(1);
    await viewer.snapshot(at(1));
    expect(viewer.received.length).toBe(beforeBurst + 1);

    // Rapid ticks inside the 50 ms window (10 ms apart: +10, +20, +30, +40) stay held.
    for (let step = 1; step <= 4; step += 1) {
      hubClock.advance(10);
      rig.live.setPosition(1 + step);
      // Give Live's UDP datagram time to reach the server before the next step.
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await viewer.flush();
    expect(viewer.received.length).toBe(beforeBurst + 1);
    expect(viewer.received.at(-1)?.position).toBeCloseTo(1, 3);

    // Advancing the remaining 10 ms to reach 50 ms triggers the trailing flush with the final position.
    hubClock.advance(10);
    await viewer.snapshot(at(5));
    await viewer.flush();
    expect(viewer.received.length).toBe(beforeBurst + 2);
    expect(viewer.received.at(-1)?.position).toBeCloseTo(5, 3);
  });

  it('collapses 1 second of ~80 Hz position ticks to ~20 broadcasts and lands on the final position', async () => {
    const hubClock = manualClock();
    rig = await startRig(SET, { playing: true, position: 0 }, { hubClock });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(0));

    hubClock.advance(POSITION_BROADCAST_MS);
    const startCount = viewer.received.length;

    // 80 ticks spaced 12.5 ms apart across 1000 ms, all inside Song 1 Intro (beats 0..64).
    const ticks = 80;
    for (let i = 1; i <= ticks; i += 1) {
      rig.live.setPosition(i * 0.5);
      // Let the UDP packet be processed before moving hubClock.
      await new Promise((resolve) => setTimeout(resolve, 2));
      if (i < ticks) hubClock.advance(12.5);
    }
    // Advance past the final trailing window so the resting position flushes.
    hubClock.advance(POSITION_BROADCAST_MS);
    await viewer.snapshot(at(ticks * 0.5));
    await viewer.flush();

    const sent = viewer.received.length - startCount;
    expect(sent).toBeGreaterThanOrEqual(18);
    expect(sent).toBeLessThanOrEqual(22);
    expect(viewer.received.at(-1)?.position).toBeCloseTo(ticks * 0.5, 3);
  });

  it('gives a newly connected client the newest position even during a throttled window without duplicating on flush', async () => {
    const hubClock = manualClock();
    rig = await startRig(SET, { playing: true, position: 0 }, { hubClock });
    const existing = await rig.connectViewer();
    await existing.snapshot(at(0));

    hubClock.advance(POSITION_BROADCAST_MS);
    rig.live.setPosition(1);
    await existing.snapshot(at(1));

    // Advance position inside the throttled window: held from existing viewer.
    hubClock.advance(20);
    rig.live.setPosition(4);
    await vi.waitFor(async () => {
      // Wait until the server has ingested position 4 by checking a fresh client connect once ready.
      const probe = await rig!.connectViewer();
      try {
        const first = await probe.snapshot(loaded);
        expect(first.position).toBeCloseTo(4, 3);
      } finally {
        probe.close();
      }
    });

    const fresh = await rig.connectViewer();
    const first = await fresh.snapshot(loaded);
    expect(first.position).toBeCloseTo(4, 3);
    expect(existing.received.at(-1)?.position).toBeCloseTo(1, 3);

    // Trailing flush delivers position 4 to existing viewer without duplicating it to fresh.
    hubClock.advance(30);
    await existing.snapshot(at(4));
    await fresh.flush();
    expect(fresh.received).toHaveLength(1);
  });

  it('flushes immediately without waiting for the position interval on every significant state change', async () => {
    const hubClock = manualClock();
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(
      SET,
      { playing: true, position: 0, tracks: [{ name: 'Music', grouped: false, volume: 0.85 }] },
      { hubClock, targets: [target] },
    );
    const leader = await rig.connectLeader();
    const producer = await rig.connectProducer();
    await leader.snapshot(at(0));
    await producer.snapshot((snapshot) => at(0)(snapshot) && snapshot.connections[0]?.connection === 'online');

    // Helper: push a position-only update that starts a held trailing timer on hubClock.
    const holdPosition = async (openBeat: number, heldBeat: number) => {
      hubClock.advance(POSITION_BROADCAST_MS);
      rig!.live.setPosition(openBeat);
      await leader.snapshot(at(openBeat));
      hubClock.advance(10);
      rig!.live.setPosition(heldBeat);
      await new Promise((resolve) => setTimeout(resolve, 15));
      await leader.flush();
      expect(leader.received.at(-1)?.position).toBeCloseTo(openBeat, 3);
    };

    // 1. Waiting jump flushes immediately while position is held.
    await holdPosition(2, 3);
    leader.send({ kind: 'jump', song: 1, section: 2 });
    const withJump = await leader.snapshot((snapshot) => snapshot.jump?.section === 2);
    expect(withJump.position).toBeCloseTo(3, 3);

    // 2. Section boundary crossing (Intro -> Verse at beat 64) flushes immediately while held.
    await holdPosition(4, 5);
    rig.live.setPosition(64);
    const inVerse = await leader.snapshot((snapshot) => snapshot.now?.section === 1);
    expect(inVerse.position).toBeCloseTo(64, 3);

    // 3. Loop toggle flushes immediately while held.
    await holdPosition(66, 67);
    rig.live.setLoop({ on: true, start: 64, length: 32 });
    const withLoop = await leader.snapshot((snapshot) => snapshot.loop !== null);
    expect(withLoop.position).toBeCloseTo(67, 3);

    // 4. End toggle change flushes immediately while held.
    await holdPosition(68, 69);
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    const withToggle = await leader.snapshot((snapshot) => snapshot.endToggles[1] === 'continue');
    expect(withToggle.position).toBeCloseTo(69, 3);

    // 5. Fade out flushes immediately while held.
    await holdPosition(70, 71);
    leader.send({ kind: 'fade-out' });
    const withFade = await leader.snapshot((snapshot) => snapshot.fade === 'out');
    expect(withFade.position).toBeCloseTo(71, 3);

    // 6. Producer connection change (Arm) flushes immediately while held.
    await holdPosition(72, 73);
    producer.send({ kind: 'arm', target: 'propresenter' });
    const armed = await producer.snapshot((snapshot) => snapshot.connections[0]?.arm === 'armed');
    expect(armed.position).toBeCloseTo(73, 3);

    // 7. Playing -> Stopped flushes immediately while held, and the canceled timer emits no duplicate.
    await holdPosition(74, 75);
    const beforeStop = leader.received.length;
    rig.live.setPlaying(false);
    const stopped = await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= beforeStop && !snapshot.playing);
    expect(stopped.position).toBeCloseTo(75, 3);
    const countAfterStop = leader.received.length;
    hubClock.advance(POSITION_BROADCAST_MS);
    await leader.flush();
    expect(leader.received.length).toBe(countAfterStop);

    // 8. Live disconnect flushes immediately while held.
    const beforePlay = leader.received.length;
    rig.live.setPlaying(true);
    await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= beforePlay && snapshot.playing);
    await holdPosition(76, 77);
    const beforeDisconnect = leader.received.length;
    await rig.stopLive();
    rig.clock.advance(SILENT_BEFORE_LOST_MS);
    const disconnected = await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= beforeDisconnect && snapshot.live === 'not-connected');
    expect(disconnected.live).toBe('not-connected');
  });
});

describe('cue timing and lateness independence', () => {
  it('delivers intra-section slide cues and section cues with exact lateness even while browser position broadcasts are throttled or paused', async () => {
    const hubClock = manualClock();
    const dir = await newLogDir();
    const logPath = join(dir, 'lateness.log');

    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    // Plan slides at beats 0 and 4 inside Intro so an intra-section move across beat 4 fires a slide cue.
    target.plan = (cue) =>
      cue.section === 0
        ? [
            { beat: 0, slide: 1 },
            { beat: 4, slide: 2 },
          ]
        : [{ beat: 0, slide: 1 }];

    rig = await startRig(SET, { playing: true, position: 0 }, { hubClock, targets: [target], latenessLog: { path: logPath } });
    proxy = await startProxy(rig.server.httpPort);

    const slowViewer = await connect(`ws://127.0.0.1:${proxy.port}${SOCKET_PATHS.viewer}`);
    const producer = await rig.connectProducer();
    try {
      await slowViewer.snapshot(at(0));
      await producer.snapshot((snapshot) => at(0)(snapshot) && snapshot.connections[0]?.connection === 'online');

      producer.send({ kind: 'arm', target: 'propresenter' });
      await producer.snapshot((snapshot) => snapshot.connections[0]?.arm === 'armed');

      // Pause the slow viewer AND leave hubClock inside the 50 ms position throttle window.
      proxy.pause();
      hubClock.advance(POSITION_BROADCAST_MS);
      rig.live.setPosition(1);
      await producer.snapshot(at(1));

      // Now hubClock is at 50 (window is closed for the next 50 ms — do NOT advance hubClock!).
      // Move Live forward inside Intro across slide 2 at beat 4 to beat 4.5 (half a beat = 250 ms late).
      rig.live.advance(3.5 * BEAT_MS);

      // The target receives the intra-section slide cue immediately with zero hub throttle delay!
      await vi.waitFor(() => expect(target.cues).toHaveLength(1));
      expect(target.cues[0]).toMatchObject({ song: 1, section: 0, slide: 2 });

      // Now play across Verse's downbeat at beat 64 (to 64.25 = 125 ms late), still with hubClock frozen.
      rig.live.advance(59.75 * BEAT_MS);
      await vi.waitFor(() => expect(target.cues).toHaveLength(2));
      expect(target.cues[1]).toMatchObject({ song: 1, section: 1, name: 'Verse', slide: 1 });

      // Producer immediately sees the updated lateness (significant change!), with exact 125 ms lateness.
      const latestProducer = await producer.snapshot((snapshot) => snapshot.connections[0]?.lateness.last === 125);
      expect(latestProducer.connections[0]?.lateness.last).toBe(125);

      // Verify the lateness log recorded both cues with exact unthrottled measurements.
      const text = await readFile(logPath, 'utf8');
      const lines = text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { section: string; slide?: number; lateMs: number });
      expect(lines).toEqual([
        expect.objectContaining({ section: 'Intro', slide: 2, lateMs: 250 }),
        expect.objectContaining({ section: 'Verse', slide: 1, lateMs: 125 }),
      ]);
    } finally {
      slowViewer.close();
    }
  });
});
