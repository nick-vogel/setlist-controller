import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { parseCommand, parseConnectionCommand, parseDeviceCommand, type Command, type ConnectionCommand } from '../shared/command.ts';
import { parseHello, RELOAD, type Device } from '../shared/devices.ts';
import { HEARTBEAT, HEARTBEAT_MS } from '../shared/heartbeat.ts';
import { isMessageFrame, messageFrame, type ActiveMessage } from '../shared/messages.ts';
import { controls, leaderSocketPath, producerSocketPath, SOCKET_PATHS, type Role } from '../shared/routes.ts';
import type { ConnectionsPart, ProducerSnapshot, Snapshot } from '../shared/snapshot.ts';
import { realClock, type Clock } from './clock.ts';
import { createDeviceRegistry } from './devices.ts';
import { createMessageBoard } from './messages.ts';

// Sends the full snapshot on connect and on every change, pacing position-only changes (below). The
// snapshot is small, so no diffs. Viewers and leaders get the playback snapshot; producers get it plus
// the connections part, the devices and the active messages. Each role's snapshot goes out only when it
// changed, so a change to the connections, the devices or the messages alone reaches no viewer.
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
// A message frame is the one exception: a device shows one message at a time, so a newer message
// frame replaces one still waiting, and a stale message never shows before its replacement.
//
// The producer's messages (messages.ts) go to each socket that said hello and that a message reaches,
// by the socket's role and the client ID of its hello. Every hello is answered with the device's
// active message, or a frame that clears it, so a page shows the right one after a reload, a
// reconnect or a wake, and after a Clear it missed while it was away. A send or a Clear goes to the
// producer sockets alone as a new producer snapshot, at once and outside the position pacing: it
// changes no playback socket's snapshot, so it must not flush a position held for the trailing flush
// to one.
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
// connection or device command too, so a leader's Arm, Disarm, Fire again, button run, Reload, Clear
// offline, message or Clear of the messages is dropped.

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
  // The client ID of the socket's last hello, or null before one.
  client: string | null;
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
  const messages = createMessageBoard();
  // The newest published state, which a change to the devices or the messages encodes again, and the
  // published state the last broadcast carried.
  let published = initial;
  let broadcastedState = initial;
  const activeMessages = () => messages.active(devices.list());
  // The newest published snapshots, and the last ones broadcast across connected sockets.
  let latest = encode(initial.snapshot, initial.connections, devices.list(), activeMessages());
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

  // Queues a frame for the socket, ahead of the next snapshot. A frame already waiting is not queued
  // twice, and a message frame replaces one still waiting.
  const queue = (socket: WebSocket, state: ClientState, frame: string) => {
    if (isMessageFrame(frame)) state.frames = state.frames.filter((waiting) => !isMessageFrame(waiting));
    if (!state.frames.includes(frame)) state.frames.push(frame);
    pump(socket, state);
  };

  // Sends a frame to every open socket of the device with this client ID.
  const sendToDevice = (client: string, frame: string) => {
    for (const socket of devices.sockets(client)) {
      const state = clients.get(socket);
      if (state) queue(socket, state, frame);
    }
  };

  const sendActiveMessage = (socket: WebSocket, state: ClientState) => {
    if (state.client !== null) queue(socket, state, messageFrame(messages.activeFor(state.client, state.role)));
  };

  const devicesChanged = () => hub.publish(published.snapshot, published.connections);

  // The broadcast producer snapshot takes the new messages too, at the broadcast position, so a later
  // publish compares against what was last broadcast with the messages as they are now: a publish
  // that changes nothing still changes nothing, and a position that reverts is still brought back.
  const messagesChanged = () => {
    const active = activeMessages();
    latest = encode(published.snapshot, published.connections, devices.list(), active);
    broadcasted = { playback: broadcasted.playback, producer: encode(broadcastedState.snapshot, broadcastedState.connections, devices.list(), active).producer };
    for (const [socket, state] of clients) if (state.role === 'producer') deliver(socket, state);
  };

  const broadcast = () => {
    const changedPlayback = latest.playback !== broadcasted.playback;
    const changedProducer = latest.producer !== broadcasted.producer;
    broadcasted = latest;
    broadcastedState = published;
    broadcastedKey = latestKey;
    if (!changedPlayback && !changedProducer) return;
    for (const [socket, state] of clients) deliver(socket, state);
  };

  sockets.on('connection', (socket, request) => {
    const role = roleOf(request);
    if (!role) return;
    const state: ClientState = {
      role,
      client: null,
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
        state.client = hello.client;
        if (devices.hello(socket, role, hello)) devicesChanged();
        sendActiveMessage(socket, state);
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
      else if (deviceCommand?.kind === 'message') {
        // A message to all devices replaces every older one on the board, so a chosen producer page,
        // which it does not reach, loses its message too: each socket whose message changed is told.
        const before = new Map([...clients].map(([other, otherState]) => [other, otherState.client === null ? null : messages.activeFor(otherState.client, otherState.role)]));
        messages.send(deviceCommand.text, deviceCommand.to);
        for (const [other, otherState] of clients) {
          if (otherState.client === null) continue;
          const now = messages.activeFor(otherState.client, otherState.role);
          if (now?.id !== before.get(other)?.id) queue(other, otherState, messageFrame(now));
        }
        messagesChanged();
      } else if (deviceCommand?.kind === 'clear-messages' && messages.clear()) {
        for (const [other, otherState] of clients) sendActiveMessage(other, otherState);
        messagesChanged();
      }
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
      const next = encode(snapshot, connections, devices.list(), activeMessages());
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

function encode(snapshot: Snapshot, connections: ConnectionsPart, devices: Device[], activeMessages: ActiveMessage[]): Encoded {
  const producer: ProducerSnapshot = { ...snapshot, ...connections, devices, activeMessages };
  return { playback: JSON.stringify(snapshot), producer: JSON.stringify(producer) };
}

// Everything in a snapshot, connections part and devices except intra-section playback progress
// (position, and now's bar and fraction). The active messages are left out: a send or a Clear reaches
// the producer sockets on its own (messagesChanged), and a change to a device's message comes with a
// change to the devices. Two states with the same key differ only in where the
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
