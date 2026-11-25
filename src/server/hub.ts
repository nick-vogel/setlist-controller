import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { parseCommand, parseConnectionCommand, type Command, type ConnectionCommand } from '../shared/command.ts';
import { HEARTBEAT, HEARTBEAT_MS } from '../shared/heartbeat.ts';
import { controls, leaderSocketPath, producerSocketPath, SOCKET_PATHS, type Role } from '../shared/routes.ts';
import type { ConnectionsPart, ProducerSnapshot, Snapshot } from '../shared/snapshot.ts';
import { realClock, type Clock } from './clock.ts';

// Sends the full snapshot on connect and on every change, pacing position-only changes (below). The
// snapshot is small, so no diffs. Viewers and leaders get the playback snapshot; producers get it plus
// the connections part. Each role's snapshot goes out only when it changed, so a change to the
// connections alone reaches no viewer.
//
// Two protections keep stage browsers on slow or congested Wi-Fi current:
// 1. Per-socket latest-only coalescing: while a socket still has a send in flight, no further
//    snapshots are queued onto it; the socket is marked dirty and gets the single newest encoded
//    snapshot for its role as soon as that send completes. One slow socket never delays healthy
//    sibling sockets.
// 2. ~20 Hz cap on position-only broadcasts: pure intra-section position ticks are paced to
//    POSITION_BROADCAST_MS on the server's clock with a trailing flush timer so the final resting
//    position is never dropped. Any significant state change (connection, playing/stopped, set,
//    section boundary, waiting jump, count-in, end toggles, loop, fade, chart revision, song meters,
//    or producer connections) cancels the timer and flushes immediately.
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
// connection command too, so a leader's Arm, Disarm, Fire again or button run is dropped.

// Minimum interval between position-only broadcasts on the server's clock (~20 Hz).
export const POSITION_BROADCAST_MS = 50;

export type Hub = {
  publish(snapshot: Snapshot, connections: ConnectionsPart): void;
  close(): Promise<void>;
};

export type HubSecrets = { leader: string; producer: string };

type Encoded = { playback: string; producer: string };

type ClientState = {
  role: Role;
  inFlight: boolean;
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

  // The newest published snapshots, and the last ones broadcast across connected sockets.
  let latest = encode(initial.snapshot, initial.connections);
  let latestKey = nonPositionKey(initial.snapshot, initial.connections);
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

  const deliver = (socket: WebSocket, state: ClientState) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    const payload = forRole(latest, state.role);
    if (payload === state.lastSent) {
      state.dirty = false;
      return;
    }
    if (state.inFlight) {
      state.dirty = true;
      return;
    }
    state.dirty = false;
    state.inFlight = true;
    state.lastSent = payload;
    socket.send(payload, (error) => {
      state.inFlight = false;
      if (closed || error || socket.readyState !== WebSocket.OPEN) return;
      if (state.dirty) deliver(socket, state);
    });
  };

  const broadcast = () => {
    const changedPlayback = latest.playback !== broadcasted.playback;
    const changedProducer = latest.producer !== broadcasted.producer;
    broadcasted = latest;
    broadcastedKey = latestKey;
    if (!changedPlayback && !changedProducer) return;
    for (const [socket, state] of clients) {
      if (state.role === 'producer' ? changedProducer : changedPlayback) deliver(socket, state);
    }
  };

  sockets.on('connection', (socket, request) => {
    const role = roleOf(request);
    if (!role) return;
    const state: ClientState = {
      role,
      inFlight: false,
      dirty: false,
      lastSent: null,
    };
    clients.set(socket, state);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', (error) => console.error('Setlist server: WebSocket client error', error));
    socket.on('message', (data) => {
      // A view-only connection never controls anything. Its messages are dropped unread, and the
      // connection stays open so the page keeps its view.
      if (!controls(role)) return;
      const command = parseCommand(data);
      if (command) {
        onCommand(command);
        return;
      }
      if (role !== 'producer') return;
      const connectionCommand = parseConnectionCommand(data);
      if (connectionCommand) onConnectionCommand(connectionCommand);
    });
    deliver(socket, state);
  });
  // ws forwards the HTTP server's errors here, and an error with no listener throws. The HTTP
  // server's owner handles them, such as a port that is taken.
  sockets.on('error', () => {});
  const stopHeartbeat = realClock.every(HEARTBEAT_MS, () => {
    for (const [socket, state] of clients) {
      if (socket.readyState !== WebSocket.OPEN || state.inFlight) continue;
      state.inFlight = true;
      socket.send(HEARTBEAT, (error) => {
        state.inFlight = false;
        if (closed || error || socket.readyState !== WebSocket.OPEN) return;
        if (state.dirty) deliver(socket, state);
      });
    }
  });

  return {
    publish(snapshot, connections) {
      if (closed) return;
      const next = encode(snapshot, connections);
      const nextKey = nonPositionKey(snapshot, connections);
      latest = next;
      latestKey = nextKey;

      // A listener may report a value that has not changed since the last broadcast.
      if (next.playback === broadcasted.playback && next.producer === broadcasted.producer) {
        cancelFlush();
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
    close() {
      closed = true;
      cancelFlush();
      stopHeartbeat();
      for (const socket of clients.keys()) socket.terminate();
      clients.clear();
      return new Promise((resolve, reject) => sockets.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

function encode(snapshot: Snapshot, connections: ConnectionsPart): Encoded {
  const producer: ProducerSnapshot = { ...snapshot, ...connections };
  return { playback: JSON.stringify(snapshot), producer: JSON.stringify(producer) };
}

// Everything in a snapshot and connections part except intra-section playback progress (position,
// and now's bar and fraction). Two states with the same key differ only in where the playhead sits
// inside the same song and section (or both outside any section with a known position).
function nonPositionKey(snapshot: Snapshot, connections: ConnectionsPart): string {
  const { position, now, ...rest } = snapshot;
  const section = now ? { song: now.song, section: now.section, next: now.next, bars: now.bars } : null;
  return JSON.stringify({ ...rest, known: position !== null, section, connections });
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
