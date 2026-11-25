import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Command } from '../shared/command.ts';
import { CHARTS_API, SETUP_API, SETUP_CONNECTIONS_API, SETUP_PEDAL_API, SETUP_REFRESH_API, SETUP_REFUSED } from '../shared/routes.ts';
import { UNKNOWN_POWER } from '../shared/power.ts';
import { meterForSong, type SetCharts } from '../shared/set-manifest.ts';
import type { ConnectionsStatus, PedalStatus } from '../shared/setup.ts';
import type { ConnectionsPart, Snapshot } from '../shared/snapshot.ts';
import { chartsTarget } from './charts.ts';
import { realClock, type Clock } from './clock.ts';
import { loadConnectionsConfig, type TargetKinds } from './connections-config.ts';
import { startConnections } from './connections.ts';
import { cueAt, cueBeat, startCues, type Cue } from './cues.ts';
import { startFadeOut } from './fade-out.ts';
import { startHub, type HubSecrets } from './hub.ts';
import { openLatenessLog } from './lateness-log.ts';
import { startLiveBridge } from './live-bridge.ts';
import { noMidiInput, type MidiInput } from './midi-input.ts';
import { loadPedalConfig, startPedal } from './pedal.ts';
import { LOOP_REPORT_MS, startPlaybackController } from './playback-controller.ts';
import { powerTarget, type PowerSource } from './power.ts';
import { startSetManifest } from './set-manifest.ts';
import { setupInfo } from './setup.ts';
import type { Target } from './target.ts';

export type ServerOptions = {
  httpHost?: string;
  // Port 0 for any of the ports lets the OS pick one.
  httpPort?: number;
  // AbletonOSC listens on 11000 and replies on 11001.
  oscSendPort?: number;
  oscReceivePort?: number;
  // The built web app.
  webRoot?: string;
  // Times the bridge's probe of Live and the poll of the set. Tests pass a clock they move by hand.
  clock?: Clock;
  // Where the foot pedal's messages come from. With none, the pedal does nothing. Production passes
  // the CoreMIDI adapter, which start-up.ts opens through the loader main.ts hands it from
  // native-loaders.ts, so the server itself never loads it.
  midiInput?: MidiInput;
  // The pedal config file, read once at start. With none, or no file there, no switch is mapped.
  pedalConfigPath?: string;
  // The connection targets, such as ProPresenter, which follow the set while the producer has them
  // armed, given directly. Tests pass a fake target here; production passes none and builds its
  // targets from the connections config file. These come first on the panels, then the file's, then
  // the Charts target, which the server builds itself (setManifestPath).
  targets?: Target[];
  // The connections config file, read once at start. With none, or no file there, no target starts
  // from it.
  connectionsConfigPath?: string;
  // The kinds of target the connections config file may name, each with the factory that builds one.
  // None by default, so every section in the file names an unknown kind.
  targetKinds?: TargetKinds;
  // The set manifest, read at start, on Refresh and when the file changes, and served on CHARTS_API.
  // With none, or no file there, no song has a chart. Given, the server adds the Charts target
  // (charts.ts) last to the connection targets, whose check holds the set against the manifest and
  // runs again whenever a read finds it changed; with none there is no Charts row. Production always
  // gives it (start-up.ts).
  setManifestPath?: string;
  // The install's leader secret, which the leader page and its socket carry (see leader-secret.ts).
  // There is no default: a default would be a guessable leader URL.
  leaderSecret: string;
  // The install's producer secret, which the producer page and its socket carry, with no default for
  // the same reason.
  producerSecret: string;
  // The lateness log, one JSON line per cue per target, and the size it rotates at (5 MB by
  // default). With none, no line is written; production always passes it, from start-up.ts.
  latenessLog?: { path: string; maxBytes?: number };
  // Where the playback Mac's power comes from, which the snapshot carries. Given, the server adds the
  // Playback Mac target (power.ts) after the Charts target, whose check fails while the Mac is on
  // battery. With none, the power is not known and there is no Playback Mac row. Production passes
  // the pmset reader, which start-up.ts takes from main.ts, so no test shells out; the server closes
  // it, as it closes the MIDI input.
  powerSource?: PowerSource;
};

export type Server = {
  httpPort: number;
  // The port Live replies to, and sends /live/startup to. Tests pass port 0 and read the real one here.
  oscReceivePort: number;
  close(): Promise<void>;
};

export const DEFAULTS = {
  httpHost: '0.0.0.0',
  httpPort: 8080,
  oscSendPort: 11000,
  oscReceivePort: 11001,
  webRoot: resolve(import.meta.dirname, '../../dist/web'),
  clock: realClock,
} satisfies Required<Omit<ServerOptions, 'midiInput' | 'pedalConfigPath' | 'targets' | 'connectionsConfigPath' | 'targetKinds' | 'setManifestPath' | 'leaderSecret' | 'producerSecret' | 'latenessLog' | 'powerSource'>>;

// AbletonOSC has no cue point listener, so the set is read again on this beat. The controller sends
// the read only while Live is stopped, as it does for the leader's Refresh.
const SET_POLL_MS = 5000;

// The leader's Stop, and every request to jump: each moves the playhead off the path a slide change
// scheduled ahead of its beat was predicted on. Loop is not one: the connections read the loop the
// controller asked for, so a press it takes reschedules on the new path at once (command below), and
// a press it ignores, with no section playing or the End waiting, changes no loop and drops nothing.
const CANCELS_SCHEDULE = new Set<Command['kind']>(['stop', 'jump', 'next', 'previous', 'play-from-start', 'count-in']);

export async function startServer(options: ServerOptions): Promise<Server> {
  const { httpHost, httpPort, oscSendPort, oscReceivePort, webRoot, clock } = { ...DEFAULTS, ...options };
  const { midiInput, pedalConfigPath, targets = [], connectionsConfigPath, targetKinds = {}, setManifestPath, leaderSecret, producerSecret, latenessLog, powerSource } = options;
  const log = latenessLog ? openLatenessLog(latenessLog) : null;
  const secrets: HubSecrets = { leader: leaderSecret, producer: producerSecret };
  // Read once at start, so the setup screen's first read of the pedal already says what is wrong with it.
  const pedalConfig = await loadPedalConfig(pedalConfigPath ?? null);
  // Read once at start too. A section the file gets wrong disables its target alone.
  const connectionsConfig = await loadConnectionsConfig(connectionsConfigPath ?? null, targetKinds);
  // Read at start, so the first snapshot already carries its revision. A read that finds the file
  // changed publishes, so every page sees the new revision and fetches the charts again. Nothing runs
  // between here and the hub's start, so no change can publish before there is a hub. A change runs
  // the Charts check again too, which reaches the target by late reference as publish does.
  const manifest = await startSetManifest({
    path: setManifestPath ?? null,
    onChange: () => {
      publish();
      charts?.changed();
    },
  });
  const charts = setManifestPath === undefined ? null : chartsTarget({ path: setManifestPath, manifest });
  const power = powerSource ? powerTarget(powerSource) : null;
  // Each change of the power reaches every page, and runs the Playback Mac check again, by late
  // reference as the manifest's change does. The source reports no change before the hub starts,
  // since nothing runs between here and there.
  powerSource?.onChange(() => {
    publish();
    power?.changed();
  });

  const http = createServer(
    (request, response) =>
      void serveWeb(webRoot, secrets, { refresh: () => refresh(), pedalStatus: () => pedal.status(), connectionsStatus: () => connectionsStatus(), charts: () => manifest.charts() }, request, response),
  );
  // The controller and the bridge each call the other, so the controller reaches the bridge, the
  // fade and the hub by late reference. Commands reach the controller through the hub, the setup
  // Refresh route and the pedal, each by way of command below. HTTP listens after the bridge is up,
  // and the pedal acts on no set until the bridge has read one.
  let checkedSet: Snapshot['set'] = null;
  let checkedMeters: ReadonlyMap<number, number>;
  // Stops the timer that holds a song's meter while Live's report of whether it plays is on its way,
  // while one runs. Play from start and a count-in from a stopped Live send the jump, then the start,
  // so Live reports the playhead in the new song before it reports playing. A Live that answers again
  // after it was lost may still be playing, and says so only once its listeners answer.
  let reportWait: (() => void) | null = null;
  // Live's connection at the last change, null until Live first answers.
  let liveWas: Snapshot['live'] | null = null;
  // Runs every target's check when a song's meter arrived or changed since the last run, unless Live
  // plays, is not connected, or has a report of whether it plays on its way.
  const checkMeters = (state: Pick<Snapshot, 'live' | 'playing'>) => {
    if (state.live !== 'connected' || state.playing || reportWait !== null || controller.meters() === checkedMeters) return;
    checkedMeters = controller.meters();
    connections.checkAll();
  };
  // Live reports whether it plays within a listener interval, so past LOOP_REPORT_MS a meter that
  // waited runs the check if Live is stopped, and waits for the stop if it plays.
  const waitForReport = () => {
    reportWait?.();
    reportWait = clock.every(LOOP_REPORT_MS, () => {
      reportWait?.();
      reportWait = null;
      checkMeters(controller.snapshot());
    });
  };
  const controller = startPlaybackController({
    // A cue goes to the armed targets before the pages hear of the change, and then the targets
    // with a lead see the state, for a loop change or a moved prediction.
    // A set read from Live that differs from the last runs every target's check against it, and so
    // does a song's meter arriving or changing, once for both on one event. The controller replaces
    // its set only when a read finds it changed, the first read included, and its meters only when
    // one arrives or changes. A meter waits while Live plays, is not connected, or has a report of
    // whether it plays on its way, since a check re-reads what the next cues send, and runs the check
    // once Live stops. A Live lost mid-song plays on, so its stop is not heard until it answers again.
    onChange: (state) => {
      cues.observe(state);
      connections.observed();
      if (state.live === 'connected' && liveWas === 'not-connected') waitForReport();
      if (liveWas !== null || state.live === 'connected') liveWas = state.live;
      if (state.set !== checkedSet) {
        checkedSet = state.set;
        checkedMeters = controller.meters();
        connections.checkAll();
      } else checkMeters(state);
      publish();
    },
    // A jump leaves a fade as it is. The music comes back when the playhead reaches a Count Off.
    jump: (cue) => live.jump(cue),
    continuePlaying: () => live.continuePlaying(),
    // A start Live has not reported by the end of the wait was lost.
    startPlaying: () => {
      waitForReport();
      live.startPlaying();
    },
    // The leader's Stop, or a song's End set to stop, ends a fade at once: Live stops first, then
    // every volume goes back, without waiting for Live to report the stop.
    stopPlaying: () => {
      live.stopPlaying();
      fade.cancel();
    },
    loopOn: (start, length) => live.loopOn(start, length),
    loopOff: () => live.loopOff(),
    requestCuePoints: () => live.requestCuePoints(),
    // Every Fade out the controller accepts pauses the targets that follow the track timing, whatever
    // the fade then does with it, since the band is leaving the track timing either way.
    fadeOut: () => {
      fade.fadeOut();
      connections.fadeOut();
    },
    fadeIn: () => fade.fadeIn(),
    // The music comes back over the Count Off, and the targets a Fade out paused on its cue.
    countOff: (ms, countIn) => {
      fade.fadeInOver(ms);
      connections.countOff(countIn);
    },
  }, clock);
  // The controller starts with no song's meter, which runs no check.
  checkedMeters = controller.meters();
  // The fade reaches the bridge by late reference too. The controller decides when a fade may start.
  const fade = startFadeOut({
    clock,
    requestTrackData: () => live.requestTrackData(),
    requestTrackVolume: (track) => live.requestTrackVolume(track),
    setTrackVolume: (track, volume) => live.setTrackVolume(track, volume),
    onPhase: () => publish(),
  });
  // The pedal sits on the laptop, so its actions reach the controller directly, not through the
  // hub's role check. An action is only ever loop, next or previous, never stop. Its status reaches
  // the setup screen on the laptop-only SETUP_PEDAL_API, so a message in publishes nothing.
  const pedal = startPedal({
    input: midiInput ?? noMidiInput,
    config: pedalConfig,
    onAction: (action) => command({ kind: action }),
  });
  // Each target's status and arm state, which only the producer's snapshot carries. The targets
  // start once HTTP listens: the ones given directly, then the ones the connections config file
  // names, its disabled ones included as rows, then the Charts target when there is a manifest path,
  // then the Playback Mac target when there is a power source.
  const connections = startConnections({
    targets: [...targets.map((target) => ({ kind: 'ready' as const, target })), ...connectionsConfig.targets, ...(charts ? [{ kind: 'ready' as const, target: charts }] : []), ...(power ? [{ kind: 'ready' as const, target: power }] : [])],
    clock,
    log,
    set: () => controller.snapshot().set,
    current: () => cueAt(controller.snapshot(), 'fire-again'),
    bar: () => controller.barLength(),
    meters: () => controller.meters(),
    position: () => controller.snapshot().position,
    dueAt: (beat) => controller.dueAt(beat),
    predict: (beat) => controller.predict(beat),
    tempo: () => controller.tempo(),
    loop: () => controller.loop(),
    playsOn: (song) => controller.snapshot().endToggles[song] === 'continue',
    onChange: () => publish(),
  });
  const connectionsPart = (): ConnectionsPart => ({ connections: connections.rows(), connectionProblems: [...connectionsConfig.problems] });
  const connectionsStatus = (): ConnectionsStatus => ({
    configPath: connectionsConfig.configPath,
    config: connectionsConfig.config,
    problems: [...connectionsConfig.problems],
    connections: connections.rows(),
  });
  // The clock time the cue's beat was due, from the controller's last report of the playhead and its
  // tempo, so each target handed the cue records how late it was.
  const dueOf = (cue: Cue) => {
    const { set, loop, position } = controller.snapshot();
    const beat = set && cueBeat(set, cue, loop, position);
    return beat === null ? null : controller.dueAt(beat);
  };
  // Each move of the playhead inside a section reaches the targets that move their slides inside it.
  const cues = startCues(
    (cue) => connections.deliver(cue, dueOf(cue)),
    (cue, from, to) => connections.moved(cue, from, to),
  );
  // Every command for the controller, from the hub, the setup Refresh route, the poll and the pedal.
  // The cues hear of it first, accepted or not, since only the command tells Play from start's jump
  // from a jump to the song's first section. Stop and every jump request drop every slide change the
  // targets have scheduled ahead of its beat, accepted or not, before the controller sees them. A
  // Loop press the controller took changes the loop it asked for, which the targets with a lead see
  // at once, before Live reports the loop, so no slide past the section's end goes for a vamp that
  // stays in it.
  const command = (command: Command) => {
    cues.command(command);
    if (CANCELS_SCHEDULE.has(command.kind)) connections.cancel();
    controller.command(command);
    if (command.kind === 'loop') connections.observed();
  };
  // The leader's, the producer's and the setup screen's Refresh: the controller reads the set again
  // while Live is stopped, and every online target checks the set the server holds now, which is how
  // the operator asks again after fixing a name in a target's own file. A read that finds the set
  // changed runs the check again. The poll reads the set alone, so it runs a check only on a change.
  // Refresh reads the set manifest again too, whether Live plays or not, for a change its watch missed.
  const refresh = () => {
    command({ kind: 'refresh' });
    connections.checkAll();
    void manifest.reload();
  };
  const songMeters = (set: Snapshot['set']): Record<number, number> => {
    if (!set) return {};
    const manifestSongs = manifest.charts().songs;
    const liveMeters = controller.meters();
    const fallback = controller.barLength();
    return Object.fromEntries(
      set.songs.map((song) => [
        song.number,
        meterForSong(manifestSongs, song.title) ?? liveMeters.get(song.number) ?? fallback,
      ]),
    );
  };
  const snapshot = (): Snapshot => {
    const state = controller.snapshot();
    return { ...state, fade: fade.phase(), chartRevision: manifest.revision(), songMeters: songMeters(state.set), power: powerSource?.current() ?? UNKNOWN_POWER };
  };
  const publish = () => hub.publish(snapshot(), connectionsPart());
  const hub = startHub(
    http,
    { snapshot: snapshot(), connections: connectionsPart() },
    secrets,
    (given) => (given.kind === 'refresh' ? refresh() : command(given)),
    (command) => connections.command(command),
  );
  const live = await startLiveBridge({
    sendPort: oscSendPort,
    receivePort: oscReceivePort,
    clock,
    onLiveEvent: (event) => {
      controller.fromLive(event);
      fade.fromLive(event);
      // Each time Live connects, the first time included, the set is read again: a Live that was
      // down when the server started never answered a read at startup. A Live that restarted, or
      // whose AbletonOSC reloaded, without a silence long enough to count as gone may have another
      // set, so it is read again on /live/startup too.
      if ((event.kind === 'connection' && event.connected) || event.kind === 'startup') live.requestCuePoints();
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(httpPort, httpHost, () => {
        // Listening, so the promise has settled. Report later errors instead of dropping them.
        http.off('error', reject);
        http.on('error', (error) => console.error('Setlist server: HTTP server error', error));
        resolve();
      });
    });
  } catch (error) {
    // The HTTP port is taken, say. Free the OSC port too, so the next try can have it.
    manifest.close();
    await hub.close();
    await live.close();
    await midiInput?.close();
    await powerSource?.close();
    throw error;
  }

  // Started once the HTTP server listens, so a failed listen leaves no timer behind and no target
  // started.
  const stopPoll = clock.every(SET_POLL_MS, () => command({ kind: 'refresh' }));
  await connections.start();

  const address = http.address();
  return {
    httpPort: typeof address === 'object' && address ? address.port : httpPort,
    oscReceivePort: live.receivePort,
    async close() {
      // Before the bridge closes, since a send on a closed socket throws.
      stopPoll();
      reportWait?.();
      manifest.close();
      fade.close();
      await midiInput?.close();
      await powerSource?.close();
      // Stopping the targets writes the lines still waiting on an acknowledgement, so the log closes after.
      await connections.stop();
      await log?.close();
      await hub.close();
      await live.close();
      // close() waits on a connection still mid-request until Node's own headersTimeout, so every
      // connection is dropped too, right after close() so no new one gets in between. The hub has
      // already ended every socket, so nothing still needs one.
      const closed = new Promise<void>((resolve, reject) => http.close((error) => (error ? reject(error) : resolve())));
      http.closeAllConnections();
      await closed;
    },
  };
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

// Never rejects. It runs as `void serveWeb(...)`, so a rejection would take the server down, and
// any device on the network can send a request.
type SetupActions = {
  refresh(): void;
  pedalStatus(): PedalStatus;
  connectionsStatus(): ConnectionsStatus;
  charts(): SetCharts;
};

async function serveWeb(webRoot: string, secrets: HubSecrets, setup: SetupActions, request: IncomingMessage, response: ServerResponse) {
  try {
    const path = decodePath(request.url ?? '/');
    if (path === SETUP_API) serveSetup(secrets, request, response);
    else if (path === SETUP_REFRESH_API) serveSetupRefresh(request, response, setup.refresh);
    else if (path === SETUP_PEDAL_API) serveLaptopJson(request, response, setup.pedalStatus);
    else if (path === SETUP_CONNECTIONS_API) serveLaptopJson(request, response, setup.connectionsStatus);
    else if (path === CHARTS_API) serveJson(request, response, setup.charts);
    else await serveFile(webRoot, request, response);
  } catch (error) {
    console.error(`Setlist server: could not answer ${request.method} ${request.url}`, error);
    if (response.headersSent) response.destroy();
    else response.writeHead(500).end();
  }
}

// The join links and QR codes, for the laptop alone: the leader's and producer's QR codes, and the
// secrets in them, should not be one tap away on a band phone. A request from the laptop itself, by
// localhost or by its own LAN address, comes from the address it arrives on.
function serveSetup(secrets: HubSecrets, request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  const { localPort } = request.socket;
  if (!fromLaptop(request) || !localPort) {
    refuse(response);
    return;
  }
  // The port the request came in on is the port every device joins on.
  const body = JSON.stringify(setupInfo(localPort, secrets));
  response.writeHead(200, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : body);
}

function serveSetupRefresh(request: IncomingMessage, response: ServerResponse, refresh: () => void) {
  request.resume();
  if (request.method !== 'POST') {
    response.writeHead(405).end();
    return;
  }
  if (!fromLaptop(request)) {
    refuse(response);
    return;
  }
  refresh();
  response.writeHead(204).end();
}

// The foot pedal's status and the connections' status, each for the laptop alone, as the join codes
// are: the pedal's config path and mappings are no band page's business, and the monitor changes on
// every MIDI message; the connections config, a target's row and its pre-service check are the
// producer's and the operator's, never a band page's.
function serveLaptopJson(request: IncomingMessage, response: ServerResponse, read: () => unknown) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  if (!fromLaptop(request)) {
    refuse(response);
    return;
  }
  const body = JSON.stringify(read());
  response.writeHead(200, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : body);
}

// The set's charts, for every device: the band's phones draw them. Never cached, since a changed
// manifest serves new charts at the same path.
function serveJson(request: IncomingMessage, response: ServerResponse, read: () => unknown) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  const body = JSON.stringify(read());
  response.writeHead(200, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : body);
}

function fromLaptop(request: IncomingMessage): boolean {
  const { remoteAddress, localAddress } = request.socket;
  return !!remoteAddress && remoteAddress === localAddress;
}

function refuse(response: ServerResponse) {
  response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end(`${SETUP_REFUSED}\n`);
}

// Serves the static web build. Any path that is not a file gets the app, which routes on the client.
async function serveFile(webRoot: string, request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }

  const path = decodePath(request.url ?? '/');
  if (path === null) {
    response.writeHead(400).end();
    return;
  }

  const requested = normalize(join(webRoot, path));
  const inRoot = requested.startsWith(webRoot + sep);
  const file = inRoot && (await isFile(requested)) ? requested : join(webRoot, 'index.html');

  if (!(await isFile(file))) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No web build. Run pnpm build.\n');
    return;
  }

  response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).on('error', () => response.destroy()).pipe(response);
}

// Null for a path with malformed percent-encoding, such as `/%E0%A4%A`.
function decodePath(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
