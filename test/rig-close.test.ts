import { createSocket } from 'node:dgram';
import { connect as connectTcp } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { fakeTarget } from './fake-target.ts';
import { startRig, type Rig } from './harness.ts';

const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 16 },
];

// Every rig a test starts, so one whose close the test expects to fail is still closed after it.
let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close().catch(() => {});
  rig = undefined;
});

// Resolves with how long the promise took to settle, in ms, and with its error if it rejected.
async function timed(promise: Promise<void>): Promise<{ ms: number; error?: Error }> {
  const start = performance.now();
  try {
    await promise;
    return { ms: performance.now() - start };
  } catch (error) {
    return { ms: performance.now() - start, error: error as Error };
  }
}

describe("the rig's close", () => {
  it('finishes at once while a connection is partway through sending a request', async () => {
    rig = await startRig(SET);
    await rig.connectViewer();
    // The headers never end, so the server holds the connection as active rather than idle.
    const socket = connectTcp(rig.server.httpPort, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n');
    socket.on('error', () => {});
    // Gives the server time to accept the connection and read the start of the request.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const closed = await timed(rig.close());
    rig = undefined;
    socket.destroy();

    expect(closed.error).toBeUndefined();
    expect(closed.ms).toBeLessThan(1000);
  });

  it('fails, naming the server, when the server cannot finish closing, and still frees the fake Live', async () => {
    // A target whose stop does not settle until the test lets it holds the server's close open.
    let release = () => {};
    const stopped = new Promise<void>((resolve) => (release = resolve));
    const target = { ...fakeTarget({ name: 'stuck', label: 'Stuck' }), stop: () => stopped };
    const started = await startRig(SET, {}, { targets: [target] });
    rig = started;
    await started.connectViewer();

    const closed = await timed(started.close());
    rig = undefined;
    // Lets the server's close finish, so the test leaves no HTTP server behind.
    release();

    expect(closed.error?.message).toBe("The rig's close waited 3000ms for the server to close; it is still open.");
    expect(closed.ms).toBeLessThan(4000);
    // The fake Live's port is free: a new socket can bind it.
    const udp = createSocket('udp4');
    await new Promise<void>((resolve, reject) => {
      udp.once('error', reject);
      udp.bind(started.live.port, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((resolve) => udp.close(() => resolve()));
  });
});
