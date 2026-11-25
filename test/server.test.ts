import { createSocket } from 'node:dgram';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { connect as tcp, createServer as createTcpServer, type Server as TcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFakeLive } from '../src/fake-live/fake-live.ts';
import { startServer } from '../src/server/server.ts';
import { SOCKET_PATHS } from '../src/shared/routes.ts';
import { connect } from './harness.ts';

// Things a test opened, closed after it whether it passed or not.
const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const LEADER_SECRET = '0123456789abcdef0123456789abcdef';
const PRODUCER_SECRET = 'fedcba9876543210fedcba9876543210';

// A web build with only the app page in it.
async function webRoot() {
  const root = await mkdtemp(join(tmpdir(), 'setlist-web-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Setlist</title>');
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function startOnFreePorts() {
  const live = await startFakeLive({ cuePoints: [] });
  cleanups.push(() => live.close());
  const server = await startServer({
    httpHost: '127.0.0.1',
    httpPort: 0,
    oscSendPort: live.port,
    oscReceivePort: 0,
    webRoot: await webRoot(),
    leaderSecret: LEADER_SECRET,
    producerSecret: PRODUCER_SECRET,
  });
  cleanups.push(() => server.close());
  return server;
}

// A raw GET, so the path goes on the wire exactly as written. No keep-alive, so closing the
// server does not wait on an idle connection.
function get(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, method: 'GET', agent: false }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

// A UDP port the OS just handed out and that nothing holds now.
function freeUdpPort(): Promise<number> {
  const socket = createSocket('udp4');
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

function bindUdp(port: number): Promise<void> {
  const socket = createSocket('udp4');
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, '127.0.0.1', () => socket.close(() => resolve()));
  });
}

async function occupiedTcpPort(): Promise<number> {
  const blocker: TcpServer = createTcpServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', resolve);
  });
  cleanups.push(() => new Promise((resolve) => blocker.close(resolve)));
  const address = blocker.address();
  if (typeof address !== 'object' || !address) throw new Error('The blocker has no port');
  return address.port;
}

describe('the server', () => {
  it('answers a malformed path with 400 and keeps serving', async () => {
    const server = await startOnFreePorts();

    expect(await get(server.httpPort, '/%E0%A4%A')).toBe(400);
    expect(await get(server.httpPort, '/')).toBe(200);
  });

  it('keeps serving after a client sends a malformed WebSocket frame', async () => {
    const server = await startOnFreePorts();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanups.push(async () => logged.mockRestore());

    await new Promise<void>((resolve, reject) => {
      const socket = tcp(server.httpPort, '127.0.0.1', () =>
        socket.write(
          `GET ${SOCKET_PATHS.viewer} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
        ),
      );
      socket.once('error', reject);
      socket.once('data', () => socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69])));
      socket.once('close', () => resolve());
    });

    expect(logged).toHaveBeenCalledWith('Setlist server: WebSocket client error', expect.any(RangeError));
    const viewer = await connect(`ws://127.0.0.1:${server.httpPort}${SOCKET_PATHS.viewer}`);
    cleanups.push(async () => viewer.close());
    await expect(viewer.snapshot()).resolves.toBeDefined();
  });

  it('frees the OSC port when the HTTP port is taken', async () => {
    const live = await startFakeLive({ cuePoints: [] });
    cleanups.push(() => live.close());
    const httpPort = await occupiedTcpPort();
    const oscReceivePort = await freeUdpPort();

    await expect(
      startServer({ httpHost: '127.0.0.1', httpPort, oscSendPort: live.port, oscReceivePort, webRoot: await webRoot(), leaderSecret: LEADER_SECRET, producerSecret: PRODUCER_SECRET }),
    ).rejects.toThrow(/EADDRINUSE/);
    await expect(bindUdp(oscReceivePort)).resolves.toBeUndefined();
  });
});
