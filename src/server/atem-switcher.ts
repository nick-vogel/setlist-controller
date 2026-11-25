import { createRequire } from 'node:module';
import { Atem, Commands, Enums, type AtemEvents } from 'atem-connection';
import type { SwitcherClient } from './atem.ts';

// The production switcher client, on the atem-connection library. This is the only module that
// imports the library, and only native-loaders.ts loads it, by dynamic import, when main.ts asks, so
// the server module and every rig test stay clear of its native package.
//
// The library reconnects on its own: its socket retries while it is not connected, so the client only
// follows the library's events: connected and disconnected for the connection, error for the log,
// and receivedCommands and stateChanged for each change of the program input. The library emits
// stateChanged only while connected, for a cut the client asked for and for one made at the ATEM
// alike. A connect that rejects started no socket, so nothing in the library retries it; the adapter
// connects again (atem.ts). Two faults leave nothing in the library trying again, so the client
// reports offline and gives up, and the adapter connects again. One is an error event: the library's
// socket process respawned and the library's own reconnect after it rejected. The other the library
// never hears: its socket process could not restart, so threadedclass, which runs it, emitted an error
// on the process and killed it. The client hears that error on the socket process itself, and since a
// killed process can never connect again, it drops that Atem and builds a fresh one for the next
// connect. An error on the socket process while it runs, such as a crash threadedclass then heals with
// a restart, is only logged, since the library reconnects after the restart by itself.
//
// The library applies a whole packet from the ATEM to its state and then emits one stateChanged with
// the final state, so a packet that carries an operator's cut and the client's own would read as the
// last cut alone. A report carries each program change of a packet, in order: the client keeps the
// program input commands of each packet from receivedCommands, which the library emits first, and
// reports each on the stateChanged that follows from the same packet.

// The part of the library's Atem the client uses, with each member and each event's arguments taken
// from the library's own types, so a member or an event the library renames or removes is a type
// error here. The test pins the arguments of the five events the client follows, so an event the
// library retypes is a type error there.
export type AtemEvent = 'connected' | 'disconnected' | 'error' | 'stateChanged' | 'receivedCommands';
export type AtemLike = {
  on<T extends AtemEvent>(event: T, listener: (...args: AtemEvents[T]) => void): unknown;
  connect: Atem['connect'];
  destroy: Atem['destroy'];
  readonly state: Atem['state'];
  changeProgramInput: Atem['changeProgramInput'];
};

// The path the library's stateChanged event gives for a change of the program input on the first
// mix effect, the only one the client uses.
const PROGRAM_PATH = 'video.mixEffects.0.programInput';

const SIGNALS = ['SIGINT', 'SIGTERM'] as const;

// How the library's error event starts when its socket process respawned and its own reconnect after
// it rejected, from the restarted handler in atem-connection's dist/lib/atemSocket.js. The rest is the
// error it caught, as a string. The test pins it to the installed library's code.
export const RESPAWN_RECONNECT_FAILED = 'Failed to reconnect after respawning socket process: ';

// Hooks the listener on the socket process behind atem for a restart of that process that failed
// outright, once the process exists, and tells whether it did. The client calls it after each connect
// settles, until it hooks.
export type SocketProcessErrors = (atem: AtemLike, listener: (error: unknown) => void) => boolean;

export function atemSwitcher(make: () => AtemLike = () => new Atem(), onSocketProcessError: SocketProcessErrors = librarySocketProcessErrors): SwitcherClient {
  let connected = false;
  const listeners: ((connected: boolean) => void)[] = [];
  const programListeners: ((input: number) => void)[] = [];
  const gaveUpListeners: ((reason: string) => void)[] = [];
  const follow = (next: boolean) => {
    connected = next;
    for (const listener of listeners) listener(next);
  };
  const giveUp = (reason: string) => {
    if (connected) follow(false);
    for (const listener of gaveUpListeners) listener(reason);
  };
  // The Atem the client uses now, whether its socket process is hooked, and whether it is lost: its
  // socket process could not restart, so it can never connect again, and the next connect builds a
  // fresh one. Each listener acts only for the Atem it was wired on, while that Atem is current.
  let current: { atem: AtemLike; hooked: boolean; lost: boolean };
  const build = () => {
    const each = { atem: make(), hooked: false, lost: false };
    current = each;
    const live = () => current === each && !each.lost;
    const { atem } = each;
    atem.on('connected', () => {
      if (live()) follow(true);
    });
    atem.on('disconnected', () => {
      if (live()) follow(false);
    });
    // The program inputs the latest packet put on the first mix effect, in order.
    let packet: number[] = [];
    atem.on('receivedCommands', (commands) => {
      packet = commands.flatMap((command) => (command instanceof Commands.ProgramInputUpdateCommand && command.mixEffect === 0 ? [command.properties.source] : []));
    });
    // Each program input the packet carried, or the input on program when none was kept, as for a
    // state change that came some other way.
    atem.on('stateChanged', (state, paths) => {
      const kept = packet;
      packet = [];
      if (!live() || !paths.includes(PROGRAM_PATH)) return;
      const input = state.video.mixEffects[0]?.programInput;
      if (input === undefined) return;
      for (const one of kept.length > 0 ? kept : [input]) for (const listener of programListeners) listener(one);
    });
    // An error event with no listener would throw out of the library's emitter and stop the server.
    // Every error is logged. A failed reconnect after a respawn reports offline first, unless the
    // library already reported the drop: a socket process restarted for freezing emits no disconnected
    // before the reconnect fails. Its reason is the caught error's message, without the "Error: " of an
    // Error as a string.
    atem.on('error', (message) => {
      console.error('Setlist server: the ATEM library reported an error', message);
      if (!live() || !message.startsWith(RESPAWN_RECONNECT_FAILED)) return;
      giveUp(message.slice(RESPAWN_RECONNECT_FAILED.length).replace(/^Error: /, ''));
    });
    return each;
  };
  build();
  // Hooks the current Atem's socket process, once it exists. A failed restart means threadedclass kills
  // the process: the Atem is lost, so the client logs the error, reports offline unless the library
  // already reported the drop, and gives up with the error's message. It never calls into the lost Atem
  // again, since threadedclass kills its socket process with clean-up right after the error, and a
  // destroy rejects before it reaches any clean-up.
  const hook = () => {
    const each = current;
    if (each.hooked || each.lost) return;
    each.hooked = onSocketProcessError(each.atem, (error) => {
      if (current !== each || each.lost) return;
      console.error("Setlist server: the ATEM's socket process could not restart", error);
      each.lost = true;
      giveUp(error instanceof Error ? error.message : String(error));
    });
  };
  const state = () => (connected ? current.atem.state : undefined);

  return {
    // The library's exit-hook exits on SIGINT and SIGTERM before main.ts can close the server, so its listeners go.
    async connect(host) {
      if (current.lost) build();
      const { atem } = current;
      const before = new Map(SIGNALS.map((signal) => [signal, process.listeners(signal)]));
      try {
        await atem.connect(host);
      } finally {
        for (const signal of SIGNALS) for (const listener of process.listeners(signal)) if (!before.get(signal)?.includes(listener)) process.off(signal, listener);
        if (current.atem === atem) hook();
      }
    },
    close: () => (current.lost ? Promise.resolve() : current.atem.destroy()),
    onConnection: (listener) => void listeners.push(listener),
    onProgram: (listener) => void programListeners.push(listener),
    onGaveUp: (listener) => void gaveUpListeners.push(listener),
    programInput: () => state()?.video.mixEffects[0]?.programInput ?? null,
    // Each input the library's state holds, in the state's order. Only an external port is a camera or
    // video input; every other port type is one of the ATEM's own sources.
    inputs() {
      const inputs = state()?.inputs ?? {};
      return Object.keys(inputs).flatMap((key) => {
        const input = Number(key);
        const channel = inputs[input];
        if (channel === undefined) return [];
        return [{ input, external: channel.internalPortType === Enums.InternalPortType.External, name: channel.longName }];
      });
    },
    info() {
      const info = state()?.info;
      if (!info) return null;
      return { model: info.productIdentifier ?? Enums.Model[info.model] ?? String(info.model), version: version(info.apiVersion) };
    },
    changeProgramInput: (input) => current.atem.changeProgramInput(input, 0),
  };
}

// The part of threadedclass's ThreadedClassManager the client uses, loaded from atem-connection's own
// path, so it is the copy the library runs its socket process on, with no dependency of the server's
// own. The test pins the library's code this reaches into.
type ThreadedClassManager = { onEvent(proxy: object, event: 'error' | 'thread_closed' | 'restarted', listener: (error?: unknown) => void): unknown };
const here = createRequire(import.meta.url);
const threadedClass = () => (createRequire(here.resolve('atem-connection'))('threadedclass') as { ThreadedClassManager: ThreadedClassManager }).ThreadedClassManager;

// The library's own socket process, at the private path its Atem keeps it on once a connect has
// created it: the Atem's client wrapper, its socket, and the threadedclass proxy the socket runs.
// The library never listens to the proxy's error event. threadedclass emits it when the process could
// not restart, before it kills it, and also while the process runs, as when its worker crashes, which
// threadedclass then restarts. So an error is a failed restart only while the process is down: from
// its thread_closed, which threadedclass emits before each restart, until its restarted.
function librarySocketProcessErrors(atem: AtemLike, listener: (error: unknown) => void): boolean {
  const proxy = (atem as unknown as { client?: { socket?: { _socketProcess?: object } } }).client?.socket?._socketProcess;
  if (!proxy) return false;
  const manager = threadedClass();
  let down = false;
  manager.onEvent(proxy, 'thread_closed', () => (down = true));
  manager.onEvent(proxy, 'restarted', () => (down = false));
  manager.onEvent(proxy, 'error', (error) => {
    if (down) listener(error);
    else console.error("Setlist server: the ATEM's socket process reported an error", error);
  });
  return true;
}

// The protocol version as the library names it, such as V8_1_1 as "8.1.1", or as its major and
// minor numbers when the library does not know it.
function version(api: Enums.ProtocolVersion): string {
  const named = Enums.ProtocolVersion[api];
  if (named) return named.slice(1).replaceAll('_', '.');
  return `${api >>> 16}.${api & 0xffff}`;
}
