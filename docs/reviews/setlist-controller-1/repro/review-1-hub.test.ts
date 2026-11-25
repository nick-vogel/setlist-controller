import { connect as tcp } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { loaded, startRig, type Rig } from './harness.ts';

// Repro for docs/reviews/setlist-controller-1/pre-pr-review-1.md, finding 4. Copy into test/ to run.

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

it('keeps serving after a client sends a malformed WebSocket frame', async () => {
  rig = await startRig([
    { name: '1 - Intro', time: 0 },
    { name: '1 - End', time: 16 },
  ]);
  const port = rig.server.httpPort;
  await new Promise<void>((resolve) => {
    const socket = tcp(port, '127.0.0.1', () =>
      socket.write(
        'GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
      ),
    );
    socket.once('data', () => {
      // An unmasked text frame. Every browser masks, so ws's receiver rejects it.
      socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
      setTimeout(resolve, 200);
    });
    socket.on('error', () => {});
  });
  const viewer = await rig.connectViewer();
  expect((await viewer.snapshot(loaded)).set?.songs).toHaveLength(1);
});
