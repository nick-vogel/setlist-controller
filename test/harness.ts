import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import WebSocket from 'ws';
import { startFakeLive, type CuePoint, type FakeLive, type FakeLiveOptions } from '../src/fake-live/fake-live.ts';
import { manualClock, type ManualClock } from '../src/server/clock.ts';
import { PROBE_INTERVAL_MS } from '../src/server/live-bridge.ts';
import { manualMidiInput, type ManualMidiInput } from '../src/server/midi-input.ts';
import type { ManualPowerSource } from '../src/server/power.ts';
import { startServer, type Server } from '../src/server/server.ts';
import type { TargetKinds } from '../src/server/connections-config.ts';
import type { Target } from '../src/server/target.ts';
import { PROBE } from '../src/shared/abletonosc.ts';
import { isHeartbeat } from '../src/shared/heartbeat.ts';
import type { OscMessage } from '../src/shared/osc.ts';
import { leaderSocketPath, producerSocketPath, SETUP_CONNECTIONS_API, SETUP_PEDAL_API, SOCKET_PATHS } from '../src/shared/routes.ts';
import type { ConnectionsStatus, PedalStatus } from '../src/shared/setup.ts';
import type { ProducerSnapshot, Snapshot } from '../src/shared/snapshot.ts';

// Seam 1: the real server against the fake Live, on ports the OS assigns.
export type Rig = {
  // The fake Live running now, or the last one stopped.
  live: FakeLive;
  // The messages that fake Live has received at the OSC address, in order.
  received(address: string): OscMessage[];
  server: Server;
  // The leader secret this rig's server was started with, new for every rig.
  leaderSecret: string;
  // The producer secret this rig's server was started with, new for every rig and never the leader's.
  producerSecret: string;
  // The server's clock. Only advance() moves it, so the bridge's probe never waits on real time.
  clock: ManualClock;
  // Moves the server's clock on by ms, a second at most at a time, and after each step waits for the
  // probes it sent to reach the fake Live, which answers each at once. One long advance sends several
  // probes with no answer read in between, and the bridge takes Live for lost. For a running fake
  // Live, and a clock that has only ever advanced. It counts the probes Live receives, so it works
  // while the fake Live holds its replies; hold for less than 3 probes, or the bridge takes Live for
  // lost.
  advanceConnected(ms: number): Promise<void>;
  // The server's MIDI input. send() delivers a message as the foot pedal would.
  midi: ManualMidiInput;
  // The foot pedal's status as the setup screen reads it, from the laptop itself. Resolves with the
  // first read that matches, asking again until one does. Rejects after WAIT_TIMEOUT_MS.
  pedal(matches?: (status: PedalStatus) => boolean): Promise<PedalStatus>;
  // The connections config and each target's row as the setup screen reads them, from the laptop
  // itself. Resolves with the first read that matches, asking again until one does. Rejects after
  // WAIT_TIMEOUT_MS.
  connectionsStatus(matches?: (status: ConnectionsStatus) => boolean): Promise<ConnectionsStatus>;
  // Stops the fake Live, as Live quitting does. It answers nothing until startLive().
  stopLive(): Promise<void>;
  // Starts a new fake Live on the same port with the same set and transport, and no listeners
  // registered, as a restarted Live has. It replies on the server's OSC receive port, where it sends
  // /live/startup when the changes ask for it. Changes, such as each track's volume, replace the start
  // setup's.
  startLive(changes?: LiveSetup): Promise<void>;
  // The view-only connection, as on the band's phones.
  connectViewer(): Promise<Client>;
  // The control connection, as on the leader's iPad, on the leader socket for the rig's secret.
  connectLeader(): Promise<Client>;
  // The producer's connection, on the producer socket for the rig's producer secret.
  connectProducer(): Promise<Client<ProducerSnapshot>>;
  close(): Promise<void>;
};

// S is the snapshot shape the client's role receives: a producer's carries the connections part.
export type Client<S extends Snapshot = Snapshot> = {
  // Resolves with the first snapshot, received or still to come, that matches.
  // Rejects after WAIT_TIMEOUT_MS, so a server that stops answering fails the test plainly.
  snapshot(matches?: (snapshot: S) => boolean): Promise<S>;
  // Every snapshot this client has received, in order. Heartbeats are not snapshots and are left out.
  received: S[];
  // How many heartbeats this client has received.
  readonly heartbeats: number;
  // Sends a command as JSON, whatever its shape.
  send(command: unknown): void;
  // Resolves once the server has handled every message this client sent before it.
  flush(): Promise<void>;
  close(): void;
};

// The fake Live's transport at startup, such as its tempo and time signature.
export type LiveSetup = Omit<FakeLiveOptions, 'cuePoints' | 'host' | 'port' | 'replyPort' | 'clock'>;

export type RigOptions = {
  // False starts the server while Live is down, as when the app starts it before Live opens. Defaults to true.
  liveRunning?: boolean;
  // The pedal config file the server reads at start. With none, the pedal has no mapping.
  pedalConfig?: string;
  // The connection targets the server starts with, such as a fake target (fake-target.ts). None by
  // default.
  targets?: Target[];
  // The connections config file the server reads at start. With none, no target starts from a file.
  connectionsConfig?: string;
  // The target kinds that file may name, such as a fake kind (fake-target.ts). None by default.
  targetKinds?: TargetKinds;
  // The lateness log the server writes. None by default, so no test writes one unless it asks.
  latenessLog?: { path: string; maxBytes?: number };
  // The set manifest the server reads and watches, always inside the worktree. None by default, so no
  // song has a chart and no test reads the home folder.
  setManifest?: string;
  // The playback Mac's power source, such as manualPowerSource() (power.ts), which the test sets by
  // hand. Given, the server adds the Playback Mac row after the others. None by default, so the power
  // is not known and no test's rows change.
  power?: ManualPowerSource;
};

export async function startRig(
  cuePoints: CuePoint[],
  setup: LiveSetup = {},
  { liveRunning = true, pedalConfig, targets, connectionsConfig, targetKinds, latenessLog, setManifest, power }: RigOptions = {},
): Promise<Rig> {
  let live = await startFakeLive({ cuePoints, ...setup });
  let running = true;
  const stopLive = async () => {
    if (!running) return;
    running = false;
    await live.close();
  };
  // The port stays reserved for the fake Live that starts later.
  if (!liveRunning) await stopLive();
  const clock = manualClock();
  const midi = manualMidiInput();
  const leaderSecret = randomBytes(16).toString('hex');
  const producerSecret = randomBytes(16).toString('hex');
  const server = await startServer({
    httpHost: '127.0.0.1',
    httpPort: 0,
    oscSendPort: live.port,
    oscReceivePort: 0,
    clock,
    midiInput: midi,
    pedalConfigPath: pedalConfig,
    targets,
    connectionsConfigPath: connectionsConfig,
    targetKinds,
    setManifestPath: setManifest,
    leaderSecret,
    producerSecret,
    latenessLog,
    powerSource: power,
  });
  const clients: { close(): void }[] = [];
  const open = async <S extends Snapshot = Snapshot>(path: string) => {
    const client = await connect<S>(`ws://127.0.0.1:${server.httpPort}${path}`);
    clients.push(client);
    return client;
  };

  return {
    get live() {
      return live;
    },
    received: (address) => live.received.filter((message) => message.address === address),
    server,
    leaderSecret,
    producerSecret,
    clock,
    async advanceConnected(ms) {
      const probes = () => live.received.filter((message) => message.address === PROBE).length;
      for (let left = ms; left > 0; ) {
        const step = Math.min(PROBE_INTERVAL_MS, left);
        left -= step;
        const [before, sent] = [clock.now(), probes()];
        clock.advance(step);
        // The clock starts at 0 with the bridge, so the bridge probes on each whole interval.
        const due = Math.floor(clock.now() / PROBE_INTERVAL_MS) - Math.floor(before / PROBE_INTERVAL_MS);
        await until(() => probes() >= sent + due, `the fake Live to receive ${due} more probes`);
      }
    },
    midi,
    pedal: (matches = any) => readUntil<PedalStatus>(server.httpPort, SETUP_PEDAL_API, 'a pedal status', matches),
    connectionsStatus: (matches = any) => readUntil<ConnectionsStatus>(server.httpPort, SETUP_CONNECTIONS_API, 'a connections status', matches),
    stopLive,
    async startLive(changes = {}) {
      if (running) throw new Error('The fake Live is already running');
      live = await startFakeLive({ cuePoints, ...setup, ...changes, port: live.port, replyPort: server.oscReceivePort });
      running = true;
    },
    connectViewer: () => open(SOCKET_PATHS.viewer),
    connectLeader: () => open(leaderSocketPath(leaderSecret)),
    connectProducer: () => open<ProducerSnapshot>(producerSocketPath(producerSecret)),
    close: () =>
      closeInOrder([
        { what: 'the harness clients', close: () => clients.forEach((client) => client.close()) },
        { what: 'the server', close: () => server.close() },
        { what: 'the fake Live', close: stopLive },
      ]),
  };
}

// The whole budget for a rig's close. Under Vitest's 5000ms test timeout and far under Playwright's
// 30s, so a close that cannot finish fails with what is still open, not with the test timeout. A
// healthy close takes milliseconds.
export const CLOSE_TIMEOUT_MS = 3000;
// What each step after the deadline still gets, so every socket and server has its close called.
const CLOSE_GRACE_MS = 200;

export type CloseStep = { what: string; close: () => void | Promise<void> };

// Closes each step in order against one shared deadline. A step still open when its time runs out
// is recorded, and the steps after it still run. Rejects once at the end, naming every step still
// open, or with the first step's own error when every step settled. The harness serves Playwright
// too, so it times with setTimeout, not Vitest, and it clears every timer it sets.
export async function closeInOrder(steps: CloseStep[], timeoutMs = CLOSE_TIMEOUT_MS): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  const open: string[] = [];
  const errors: unknown[] = [];
  for (const step of steps) {
    // Inside the shared deadline, the message names the whole budget; past it, the step's grace.
    const left = deadline - performance.now();
    const [waitMs, waited] = left > CLOSE_GRACE_MS ? [left, timeoutMs] : [CLOSE_GRACE_MS, CLOSE_GRACE_MS];
    // A step that rejects after its time ran out is caught here, so it never goes unhandled.
    const closed = Promise.resolve()
      .then(step.close)
      .then(
        () => 'closed' as const,
        (error: unknown) => ({ error }),
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'open'>((resolve) => (timer = setTimeout(() => resolve('open'), waitMs)));
    const outcome = await Promise.race([closed, timedOut]);
    clearTimeout(timer);
    if (outcome === 'open') open.push(`The rig's close waited ${waited}ms for ${step.what} to close; it is still open.`);
    else if (outcome !== 'closed') errors.push(outcome.error);
  }
  if (open.length > 0) throw new Error(open.join(' '), errors.length > 0 ? { cause: errors[0] } : undefined);
  if (errors.length > 0) throw errors[0];
}

// Shorter than Vitest's own test timeout, so this error is the one a test reports.
const WAIT_TIMEOUT_MS = 2000;

// Resolves once condition holds. The harness serves Playwright too, so it polls without Vitest.
async function until(condition: () => boolean, what: string): Promise<void> {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > WAIT_TIMEOUT_MS) throw new Error(`Waited ${WAIT_TIMEOUT_MS}ms for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// Reads a laptop-only setup route until a read matches. Rejects after WAIT_TIMEOUT_MS.
async function readUntil<T>(port: number, path: string, what: string, matches: (value: T) => boolean): Promise<T> {
  const start = performance.now();
  for (;;) {
    const value = await readSetup<T>(port, path, what);
    if (matches(value)) return value;
    if (performance.now() - start > WAIT_TIMEOUT_MS) {
      throw new Error(`Waited ${WAIT_TIMEOUT_MS}ms for ${what} matching \`${matches.name || 'the given predicate'}\`.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// A GET of a setup route from 127.0.0.1, which is the laptop to the server. No keep-alive, so
// closing the server does not wait on an idle connection. Exported for a server started without a rig.
export function readSetup<T>(port: number, path: string, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.once('end', () => {
        if (response.statusCode !== 200) reject(new Error(`${what} answered ${response.statusCode}: ${body.slice(0, 200)}`));
        else resolve(JSON.parse(body) as T);
      });
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

// A set that has loaded, as opposed to the empty snapshot before Live answers.
export const loaded = (snapshot: Snapshot) => snapshot.set !== null;
const any = () => true;

export function connect<S extends Snapshot = Snapshot>(url: string): Promise<Client<S>> {
  const socket = new WebSocket(url);
  const received: S[] = [];
  const waiting: { matches: (snapshot: S) => boolean; resolve: (snapshot: S) => void }[] = [];
  let heartbeats = 0;

  socket.on('message', (data) => {
    // A heartbeat would read as a snapshot whose set is not null, so it is counted and never offered.
    if (isHeartbeat(data)) {
      heartbeats += 1;
      return;
    }
    const snapshot = JSON.parse(String(data)) as S;
    received.push(snapshot);
    for (const waiter of [...waiting]) {
      if (waiter.matches(snapshot)) {
        waiting.splice(waiting.indexOf(waiter), 1);
        waiter.resolve(snapshot);
      }
    }
  });

  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', () =>
      resolve({
        snapshot(matches = any) {
          const found = received.find(matches);
          if (found) return Promise.resolve(found);
          return new Promise((resolve, reject) => {
            const waiter = {
              matches,
              resolve(snapshot: S) {
                clearTimeout(timer);
                resolve(snapshot);
              },
            };
            const timer = setTimeout(() => {
              waiting.splice(waiting.indexOf(waiter), 1);
              const wanted = matches.name || 'the given predicate';
              reject(new Error(`Waited ${WAIT_TIMEOUT_MS}ms for a snapshot matching \`${wanted}\`; got ${received.length} that did not.`));
            }, WAIT_TIMEOUT_MS);
            waiting.push(waiter);
          });
        },
        received,
        get heartbeats() {
          return heartbeats;
        },
        send: (command) => socket.send(JSON.stringify(command)),
        // The server reads a connection's frames in order and answers a ping as it reads it, so the
        // pong comes back only after every earlier message has been handled.
        flush: () =>
          new Promise((resolve) => {
            socket.once('pong', () => resolve());
            socket.ping();
          }),
        close: () => socket.close(),
      }),
    );
  });
}
