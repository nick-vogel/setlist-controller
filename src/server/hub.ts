import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { parseCommand, parseConnectionCommand, type Command, type ConnectionCommand } from '../shared/command.ts';
import { HEARTBEAT, HEARTBEAT_MS } from '../shared/heartbeat.ts';
import { controls, leaderSocketPath, producerSocketPath, SOCKET_PATHS, type Role } from '../shared/routes.ts';
import type { ConnectionsPart, ProducerSnapshot, Snapshot } from '../shared/snapshot.ts';
import { realClock } from './clock.ts';

// Sends the full snapshot on connect and on every change. The snapshot is small, so no diffs. Viewers
// and leaders get the playback snapshot; producers get it plus the connections part. Each role's
// snapshot goes out only when it changed, so a change to the connections alone reaches no viewer.
// Between them it sends every client a heartbeat (see heartbeat.ts), so a page can tell a dead
// socket from a quiet one. The heartbeat runs on real time, not the server's clock: a page's silence
// limit runs on real time too, and a test's clock moves only when the test moves it.
//
// The socket path decides the role (see routes.ts). The leader role needs the leader socket for the
// install's leader secret, exactly, and the producer role the producer socket for the producer
// secret: no secret, a wrong one, the other role's secret, or the secret in a query string is
// refused, as is any other path. A refused page cannot send a command, and no view-only socket sits
// under a page that draws the leader's controls. Only a producer socket's messages are read as a
// connection command too, so a leader's Arm, Disarm, Fire again or button run is dropped.

export type Hub = {
  publish(snapshot: Snapshot, connections: ConnectionsPart): void;
  close(): Promise<void>;
};

export type HubSecrets = { leader: string; producer: string };

export function startHub(
  server: HttpServer,
  initial: { snapshot: Snapshot; connections: ConnectionsPart },
  secrets: HubSecrets,
  onCommand: (command: Command) => void,
  onConnectionCommand: (command: ConnectionCommand) => void,
): Hub {
  const sockets = new WebSocketServer({ server });
  const roleOf = roleFor(secrets);
  // ws answers a request this refuses with a 400 and no upgrade.
  sockets.shouldHandle = (request) => roleOf(request) !== null;
  // The last snapshot sent, as sent, for each role. A producer's is its own; every other role's is
  // the playback snapshot.
  let sent = encode(initial.snapshot, initial.connections);
  const roles = new WeakMap<object, Role>();
  const forRole = (role: Role | null | undefined) => (role === 'producer' ? sent.producer : sent.playback);

  sockets.on('connection', (socket, request) => {
    const role = roleOf(request);
    if (role) roles.set(socket, role);
    socket.on('error', (error) => console.error('Setlist server: WebSocket client error', error));
    socket.on('message', (data) => {
      // A view-only connection never controls anything. Its messages are dropped unread, and the
      // connection stays open so the page keeps its view.
      if (role === null || !controls(role)) return;
      const command = parseCommand(data);
      if (command) {
        onCommand(command);
        return;
      }
      if (role !== 'producer') return;
      const connectionCommand = parseConnectionCommand(data);
      if (connectionCommand) onConnectionCommand(connectionCommand);
    });
    socket.send(forRole(role));
  });
  // ws forwards the HTTP server's errors here, and an error with no listener throws. The HTTP
  // server's owner handles them, such as a port that is taken.
  sockets.on('error', () => {});
  const stopHeartbeat = realClock.every(HEARTBEAT_MS, () => {
    for (const socket of sockets.clients) socket.send(HEARTBEAT);
  });

  return {
    publish(snapshot, connections) {
      const next = encode(snapshot, connections);
      // A listener may report a value that has not changed. Only a change goes out, per role.
      const changed = { playback: next.playback !== sent.playback, producer: next.producer !== sent.producer };
      sent = next;
      for (const socket of sockets.clients) {
        const role = roles.get(socket);
        if (role === 'producer' ? changed.producer : changed.playback) socket.send(forRole(role));
      }
    },
    close() {
      stopHeartbeat();
      for (const socket of sockets.clients) socket.terminate();
      return new Promise((resolve, reject) => sockets.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

function encode(snapshot: Snapshot, connections: ConnectionsPart): { playback: string; producer: string } {
  const producer: ProducerSnapshot = { ...snapshot, ...connections };
  return { playback: JSON.stringify(snapshot), producer: JSON.stringify(producer) };
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
