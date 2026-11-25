#!/usr/bin/env bash
# Proves pre-PR review 2, finding 2 (src/server/hub.ts:107-116 and :169-172).
# A client that connects (or drains) during a held 50 ms position window receives latest (position
# 12). If the position reverts to broadcasted (position 10) before the trailing flush fires,
# publish() hits the early return at :169 (or broadcast() skips viewers at :114 when a producer-only
# change lands at the same time), leaving that client stuck at position 12 indefinitely.
# Copies the working tree to a temp folder and links node_modules, so nothing in the repo changes.
set -euo pipefail
repo=$(pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude test-results ./ "$work/"
ln -s "$repo/node_modules" "$work/node_modules"
cat << 'EOF' > "$work/test/mid-window-revert.repro.test.ts"
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import { POSITION_BROADCAST_MS, startHub } from '../src/server/hub.ts';
import { UNKNOWN_POWER } from '../src/shared/power.ts';
import { producerSocketPath, SOCKET_PATHS } from '../src/shared/routes.ts';
import type { ConnectionsPart, ProducerSnapshot, Snapshot } from '../src/shared/snapshot.ts';
import { connect } from './harness.ts';

function snap(position: number | null): Snapshot {
  return {
    live: 'connected',
    set: {
      songs: [{ number: 1, title: 'Song 1', sections: [{ name: 'Intro', time: 0, end: 64, cue: 0 }], end: 64, endCue: 1 }],
      warnings: [],
    },
    playing: false,
    position,
    now: position === null ? null : { song: 1, section: 0, next: 'end', bar: Math.floor(position / 4) + 1, bars: 16, fraction: position / 64 },
    jump: null,
    countIn: false,
    endToggles: { 1: 'stop' },
    loop: null,
    fade: null,
    chartRevision: 1,
    songMeters: { 1: 4 },
    power: UNKNOWN_POWER,
  };
}

const emptyConn: ConnectionsPart = { connections: [], connectionProblems: [] };
const problemConn: ConnectionsPart = { connections: [], connectionProblems: ['offline'] };

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe('hub mid-window revert', () => {
  it('syncs a client that connected mid-window when position reverts to broadcasted', async () => {
    const clock = manualClock();
    const http = createServer();
    const hub = startHub(http, { snapshot: snap(0), connections: emptyConn }, { leader: 'l', producer: 'p' }, () => {}, () => {}, clock);
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const port = (http.address() as { port: number }).port;
    const c1 = await connect(`ws://127.0.0.1:${port}${SOCKET_PATHS.viewer}`);
    let c2: Awaited<ReturnType<typeof connect>> | undefined;
    cleanup = async () => {
      c1.close();
      c2?.close();
      await hub.close();
      await new Promise<void>((r) => http.close(() => r()));
    };

    await c1.snapshot((s) => s.position === 0);
    clock.advance(POSITION_BROADCAST_MS);
    hub.publish(snap(10), emptyConn);
    await c1.snapshot((s) => s.position === 10);
    const c1Count = c1.received.length;

    clock.advance(10);
    hub.publish(snap(12), emptyConn);
    c2 = await connect(`ws://127.0.0.1:${port}${SOCKET_PATHS.viewer}`);
    await c2.snapshot((s) => s.position === 12);

    clock.advance(10);
    hub.publish(snap(10), emptyConn);

    clock.advance(POSITION_BROADCAST_MS * 2);
    await c1.flush();
    await c2.flush();
    expect(c1.received.length).toBe(c1Count);
    expect(c2.received.at(-1)?.position).toBe(10);
  });

  it('syncs a viewer that connected mid-window when playback reverts alongside a producer-only change', async () => {
    const clock = manualClock();
    const http = createServer();
    const hub = startHub(http, { snapshot: snap(0), connections: emptyConn }, { leader: 'l', producer: 'p' }, () => {}, () => {}, clock);
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const port = (http.address() as { port: number }).port;
    const c1 = await connect(`ws://127.0.0.1:${port}${SOCKET_PATHS.viewer}`);
    const prod = await connect<ProducerSnapshot>(`ws://127.0.0.1:${port}${producerSocketPath('p')}`);
    let c2: Awaited<ReturnType<typeof connect>> | undefined;
    cleanup = async () => {
      c1.close();
      prod.close();
      c2?.close();
      await hub.close();
      await new Promise<void>((r) => http.close(() => r()));
    };

    await c1.snapshot((s) => s.position === 0);
    await prod.snapshot((s) => s.position === 0);
    clock.advance(POSITION_BROADCAST_MS);
    hub.publish(snap(10), emptyConn);
    await c1.snapshot((s) => s.position === 10);
    const c1Count = c1.received.length;

    clock.advance(10);
    hub.publish(snap(12), emptyConn);
    c2 = await connect(`ws://127.0.0.1:${port}${SOCKET_PATHS.viewer}`);
    await c2.snapshot((s) => s.position === 12);

    clock.advance(10);
    hub.publish(snap(10), problemConn);

    await prod.snapshot((s) => s.connectionProblems.length === 1);
    await c1.flush();
    await c2.flush();
    expect(c1.received.length).toBe(c1Count);
    expect(c2.received.at(-1)?.position).toBe(10);
  });
});
EOF
cd "$work"
pnpm -s vitest run test/mid-window-revert.repro.test.ts --maxWorkers=2
