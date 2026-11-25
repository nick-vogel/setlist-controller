import { createServer, connect as connectTcp, type Socket } from 'node:net';

// A TCP proxy in front of the server's HTTP port, so a test can take a page's connection away from
// outside, as the Wi-Fi does, with no hook in the server or the page.
export type Proxy = {
  // The port the proxy listens on, on 127.0.0.1. The OS assigns it.
  port: number;
  // How many connections the proxy has accepted, dropped ones included.
  connections: number;
  // When the proxy accepted each connection, in performance.now() milliseconds, in order.
  acceptedAt: readonly number[];
  // Destroys every open connection, and from then on every new one at once, as a dropped Wi-Fi does.
  drop(): void;
  // Destroys every open connection, and from then on holds each new one open but forwards nothing,
  // so its handshake never comes back, as a lost packet on a lossy Wi-Fi leaves it.
  stall(): void;
  // Holds each new connection open but forwards nothing, as stall() does, and leaves every open
  // connection as it is.
  hang(): void;
  // Destroys every connection that forwards, and leaves held ones held.
  cut(): void;
  // Forwards new connections again. A connection already held stays held.
  restore(): void;
  // Stops forwarding on every open connection, both ways, but keeps it open: a half-open socket, as
  // a phone that slept often holds. New connections forward as normal.
  freeze(): void;
  // Stops reading from the server on every open connection, so TCP flow control pushes backpressure
  // onto the server's socket without dropping bytes, as a congested Wi-Fi link does.
  pause(): void;
  // Resumes reading from the server on every paused connection.
  resume(): void;
  close(): Promise<void>;
};

export async function startProxy(targetPort: number): Promise<Proxy> {
  const open = new Set<{ client: Socket; upstream: Socket; frozen: boolean; paused: boolean }>();
  const held = new Set<Socket>();
  let mode: 'forward' | 'drop' | 'stall' = 'forward';
  const acceptedAt: number[] = [];

  const listener = createServer((client) => {
    acceptedAt.push(performance.now());
    if (mode === 'drop') {
      client.destroy();
      return;
    }
    if (mode === 'stall') {
      held.add(client);
      client.on('close', () => held.delete(client));
      client.on('error', () => {});
      return;
    }
    const upstream = connectTcp(targetPort, '127.0.0.1');
    const pair = { client, upstream, frozen: false, paused: false };
    open.add(pair);
    const forward = (from: Socket, to: Socket) =>
      from.on('data', (data) => {
        if (!pair.frozen) to.write(data);
      });
    forward(client, upstream);
    forward(upstream, client);
    const end = () => {
      open.delete(pair);
      client.destroy();
      upstream.destroy();
    };
    client.on('close', end);
    upstream.on('close', end);
    // A destroyed socket may report a reset. The close handler above does the cleanup.
    client.on('error', () => {});
    upstream.on('error', () => {});
  });

  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  if (typeof address !== 'object' || address === null) throw new Error('The proxy has no port');

  const destroyAll = () => {
    for (const { client, upstream } of open) {
      client.destroy();
      upstream.destroy();
    }
    open.clear();
    for (const client of held) client.destroy();
    held.clear();
  };

  return {
    port: address.port,
    get connections() {
      return acceptedAt.length;
    },
    acceptedAt,
    drop() {
      mode = 'drop';
      destroyAll();
    },
    stall() {
      mode = 'stall';
      destroyAll();
    },
    hang() {
      mode = 'stall';
    },
    cut() {
      for (const { client, upstream } of open) {
        client.destroy();
        upstream.destroy();
      }
      open.clear();
    },
    restore() {
      mode = 'forward';
    },
    freeze() {
      for (const pair of open) pair.frozen = true;
    },
    pause() {
      for (const pair of open) {
        pair.paused = true;
        pair.upstream.pause();
      }
    },
    resume() {
      for (const pair of open) {
        if (!pair.paused) continue;
        pair.paused = false;
        pair.upstream.resume();
      }
    },
    close() {
      mode = 'drop';
      destroyAll();
      return new Promise((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
