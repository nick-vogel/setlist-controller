import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { parseCommand, parseConnectionCommand, parseDeviceCommand, type Command, type ConnectionCommand } from '../shared/command.ts';
import { parseHello, RELOAD, type Device } from '../shared/devices.ts';
import { HEARTBEAT, HEARTBEAT_MS } from '../shared/heartbeat.ts';
import { controls, leaderSocketPath, producerSocketPath, SOCKET_PATHS, type Role } from '../shared/routes.ts';
import type { ConnectionsPart, ProducerSnapshot, Snapshot } from '../shared/snapshot.ts';
import { realClock, type Clock } from './clock.ts';
import { createDeviceRegistry } from './devices.ts';

// Sends the full snapshot on connect and on every change, pacing position-only changes (below). The
// snapshot is small, so no diffs. Viewers and leaders get the playback snapshot; producers get it plus
// the connections part and the devices. Each role's snapshot goes out only when it changed, so a change
// to the connections or the devices alone reaches no viewer.
//
// Two protections keep stage browsers on slow or congested Wi-Fi current:
// 1. Per-socket latest-only coalescing: while a socket still has a send in flight, no further
//    snapshots are queued onto it; it gets the single newest encoded snapshot for its role, if it
//    has not had it, as soon as that send completes. One slow socket never delays healthy
//    sibling sockets.
// 2. ~20 Hz cap on position-only broadcasts: pure intra-section position ticks are paced to
//    POSITION_BROADCAST_MS on the server's clock with a trailing flush timer so the final resting
//    position is never dropped. Any significant state change (connection, playing/stopped, set,
//    section boundary, waiting jump, count-in, end toggles, loop, fade, chart revision, song meters,
//    power, producer connections, or devices) cancels the timer and flushes immediately.
//
// A frame for one socket alone, such as a reload, cannot be coalesced: each waits its turn on that
// socket, ahead of the next snapshot, so it is never dropped and never queues a snapshot behind it.
//
// Every socket may introduce itself with a hello (devices.ts), the view-only one included, and the
// hub keeps the devices that did in its registry. The socket's role goes in the registry, never one
// the hello claims.
//
// Between snapshots it sends every idle client a heartbeat (see heartbeat.ts), so a page can tell a
// dead socket from a quiet one. The heartbeat runs on real time, not the server's clock: a page's
// silence limit runs on real time too, and a test's clock moves only when the test moves it.
//
// The socket path decides the role (see routes.ts). The leader role needs the leader socket for the
// install's leader secret, exactly, and the producer role the producer socket for the producer
// secret: no secret, a wrong one, the other role's secret, or the secret in a query string is
// refused, as is any other path. A refused page cannot send a command, and no view-only socket sits
// under a page that draws the leader's controls. Only a producer socket's messages are read as a
// connection or device command too, so a leader's Arm, Disarm, Fire again, button run, Reload or Clear
// offline is dropped.

// Minimum interval between position-only broadcasts on the server's clock (~20 Hz).
export const POSITION_BROADCAST_MS = 50;

export type Hub = {
  publish(snapshot: Snapshot, connections: ConnectionsPart): void;
  // Every device in the registry, as the producer's snapshot carries it.
  devices(): Device[];
  close(): Promise<void>;
};

export type HubSecrets = { leader: string; producer: string };

type Encoded = { playback: string; producer: string };

type ClientState = {
  role: Role;
  inFlight: boolean;
  // Frames for this socket alone, sent in order ahead of the next snapshot.
  frames: string[];
  dirty: boolean;
  lastSent: string | null;
};

export function startHub(
  server: HttpServer,
  initial: { snapshot: Snapshot; connections: ConnectionsPart },
  secrets: HubSecrets,
  onCommand: (command: Command) => void,
  onConnectionCommand: (command: ConnectionCommand) => void,
  clock: Clock = realClock,
): Hub {
  const sockets = new WebSocketServer({ server });
  const roleOf = roleFor(secrets);
  // ws answers a request this refuses with a 400 and no upgrade.
  sockets.shouldHandle = (request) => roleOf(request) !== null;

  const devices = createDeviceRegistry<WebSocket>();
  // The newest published state, which a change to the devices encodes again.
  let published = initial;
  // The newest published snapshots, and the last ones broadcast across connected sockets.
  let latest = encode(initial.snapshot, initial.connections, devices.list());
  let latestKey = nonPositionKey(initial.snapshot, initial.connections, devices.list());
  let broadcasted = latest;
  let broadcastedKey = latestKey;
  let lastPlaybackBroadcastAt = -Infinity;
  let stopFlush: (() => void) | null = null;
  let closed = false;

  const clients = new Map<WebSocket, ClientState>();
  const forRole = (encoded: Encoded, role: Role) => (role === 'producer' ? encoded.producer : encoded.playback);

  const cancelFlush = () => {
    stopFlush?.();
    stopFlush = null;
  };

  // Sends the socket its next frame, else the newest snapshot for its role when it has not had it,
  // once nothing is in flight on it. A send's callback sends again only for a waiting frame or a
  // broadcast that changed the socket's own snapshot while it was busy, so a socket that was busy gets
  // the one newest snapshot when it is free, and a position held for the trailing flush stays held.
  const deliver = (socket: WebSocket, state: ClientState) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    if (forRole(latest, state.role) === state.lastSent) {
      state.dirty = false;
      return;
    }
    if (state.inFlight) {
      state.dirty = true;
      return;
    }
    pump(socket, state);
  };

  const pump = (socket: WebSocket, state: ClientState) => {
    if (closed || socket.readyState !== WebSocket.OPEN || state.inFlight) return;
    let payload = state.frames.shift();
    if (payload === undefined) {
      state.dirty = false;
      payload = forRole(latest, state.role);
      if (payload === state.lastSent) return;
      state.lastSent = payload;
    }
    send(socket, state, payload);
  };

  const send = (socket: WebSocket, state: ClientState, payload: string) => {
    state.inFlight = true;
    socket.send(payload, (error) => {
      state.inFlight = false;
      if (closed || error || socket.readyState !== WebSocket.OPEN) return;
      if (state.frames.length > 0 || state.dirty) pump(socket, state);
    });
  };

  // Sends a frame to every open socket of the device with this client ID. A frame already waiting on
  // a socket is not queued twice.
  const sendToDevice = (client: string, frame: string) => {
    for (const socket of devices.sockets(client)) {
      const state = clients.get(socket);
      if (!state) continue;
      if (!state.frames.includes(frame)) state.frames.push(frame);
      pump(socket, state);
    }
  };

  const devicesChanged = () => hub.publish(published.snapshot, published.connections);

  const broadcast = () => {
    const changedPlayback = latest.playback !== broadcasted.playback;
    const changedProducer = latest.producer !== broadcasted.producer;
    broadcasted = latest;
    broadcastedKey = latestKey;
    if (!changedPlayback && !changedProducer) return;
    for (const [socket, state] of clients) deliver(socket, state);
  };

  sockets.on('connection', (socket, request) => {
    const role = roleOf(request);
    if (!role) return;
    const state: ClientState = {
      role,
      inFlight: false,
      frames: [],
      dirty: false,
      lastSent: null,
    };
    clients.set(socket, state);
    socket.on('close', () => {
      clients.delete(socket);
      if (devices.leave(socket)) devicesChanged();
    });
    socket.on('error', (error) => console.error('Setlist server: WebSocket client error', error));
    socket.on('message', (data) => {
      const hello = parseHello(data);
      if (hello) {
        if (devices.hello(socket, role, hello)) devicesChanged();
        return;
      }
      // A view-only connection never controls anything. Its other messages are dropped unread, and
      // the connection stays open so the page keeps its view.
      if (!controls(role)) return;
      const command = parseCommand(data);
      if (command) {
        onCommand(command);
        return;
      }
      if (role !== 'producer') return;
      const connectionCommand = parseConnectionCommand(data);
      if (connectionCommand) {
        onConnectionCommand(connectionCommand);
        return;
      }
      const deviceCommand = parseDeviceCommand(data);
      if (deviceCommand?.kind === 'reload') sendToDevice(deviceCommand.client, RELOAD);
      else if (deviceCommand?.kind === 'clear-offline' && devices.clearOffline()) devicesChanged();
    });
    deliver(socket, state);
  });
  // ws forwards the HTTP server's errors here, and an error with no listener throws. The HTTP
  // server's owner handles them, such as a port that is taken.
  sockets.on('error', () => {});
  const stopHeartbeat = realClock.every(HEARTBEAT_MS, () => {
    for (const [socket, state] of clients) {
      if (socket.readyState !== WebSocket.OPEN || state.inFlight) continue;
      send(socket, state, HEARTBEAT);
    }
  });

  const hub: Hub = {
    publish(snapshot, connections) {
      if (closed) return;
      published = { snapshot, connections };
      const next = encode(snapshot, connections, devices.list());
      const nextKey = nonPositionKey(snapshot, connections, devices.list());
      latest = next;
      latestKey = nextKey;

      // A listener may report a value that has not changed since the last broadcast.
      if (next.playback === broadcasted.playback && next.producer === broadcasted.producer) {
        if (stopFlush) {
          cancelFlush();
          for (const [socket, state] of clients) deliver(socket, state);
        }
        return;
      }

      const positionOnly = nextKey === broadcastedKey;
      if (!positionOnly) {
        cancelFlush();
        const playbackChanged = next.playback !== broadcasted.playback;
        broadcast();
        if (playbackChanged) lastPlaybackBroadcastAt = clock.now();
        return;
      }

      const elapsed = clock.now() - lastPlaybackBroadcastAt;
      if (elapsed >= POSITION_BROADCAST_MS) {
        cancelFlush();
        broadcast();
        lastPlaybackBroadcastAt = clock.now();
        return;
      }

      if (!stopFlush) {
        const remaining = Math.max(1, POSITION_BROADCAST_MS - Math.max(0, elapsed));
        stopFlush = clock.every(remaining, () => {
          cancelFlush();
          broadcast();
          lastPlaybackBroadcastAt = clock.now();
        });
      }
    },
    devices: () => devices.list(),
    close() {
      closed = true;
      cancelFlush();
      stopHeartbeat();
      for (const socket of clients.keys()) socket.terminate();
      clients.clear();
      return new Promise((resolve, reject) => sockets.close((error) => (error ? reject(error) : resolve())));
    },
  };
  return hub;
}

function encode(snapshot: Snapshot, connections: ConnectionsPart, devices: Device[]): Encoded {
  const producer: ProducerSnapshot = { ...snapshot, ...connections, devices };
  return { playback: JSON.stringify(snapshot), producer: JSON.stringify(producer) };
}

// Everything in a snapshot, connections part and devices except intra-section playback progress
// (position, and now's bar and fraction). Two states with the same key differ only in where the
// playhead sits inside the same song and section (or both outside any section with a known position).
function nonPositionKey(snapshot: Snapshot, connections: ConnectionsPart, devices: Device[]): string {
  const { position, now, ...rest } = snapshot;
  const section = now ? { song: now.song, section: now.section, next: now.next, bars: now.bars } : null;
  return JSON.stringify({ ...rest, known: position !== null, section, connections, devices });
}

function roleFor(secrets: HubSecrets): (request: IncomingMessage) => Role | null {
  const leaderPath = Buffer.from(leaderSocketPath(secrets.leader));
  const producerPath = Buffer.from(producerSocketPath(secrets.producer));
  const matches = (path: Buffer, expected: Buffer) => path.length === expected.length && timingSafeEqual(path, expected);
  return (request) => {
    const url = request.url ?? '';
    const query = url.indexOf('?');
    const pathname = query === -1 ? url : url.slice(0, query);
    if (pathname === SOCKET_PATHS.viewer) return 'viewer';
    // Compared in constant time, so the stage network cannot learn the secret a character at a time.
    const path = Buffer.from(pathname);
    if (matches(path, leaderPath)) return 'leader';
    if (matches(path, producerPath)) return 'producer';
    return null;
  };
}
