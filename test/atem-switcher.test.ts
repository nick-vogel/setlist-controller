import type { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Atem, AtemStateUtil, Commands, Enums, type AtemEvents, type AtemState } from 'atem-connection';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { atemSwitcher, RESPAWN_RECONNECT_FAILED, type AtemEvent, type AtemLike, type SocketProcessErrors } from '../src/server/atem-switcher.ts';

// The real switcher client, over a stand-in for the library's Atem that is typed from the library's
// own exports, so the wrapper and the library cannot drift apart without a type error under
// `pnpm typecheck`. Its state is the library's own empty state, set as the library sets it. It never
// reaches the network.

// One of the library's input channels, with the fields the client reads checked against the
// library's own type, so a field the library renames is a type error here too. The rest of the channel
// the client never reads.
type Channel = NonNullable<AtemState['inputs'][number]>;
const channel = (fields: Pick<Channel, 'inputId' | 'internalPortType' | 'longName'>) => fields as Channel;

function stubAtem() {
  const listeners: { [T in AtemEvent]: ((...args: AtemEvents[T]) => void)[] } = { connected: [], disconnected: [], error: [], stateChanged: [], receivedCommands: [] };
  const stub = {
    connects: [] as string[],
    changes: [] as [number, number | undefined][],
    destroyed: false,
    // The error the next connect rejects with, if any, and the error every destroy rejects with.
    rejectConnect: null as Error | null,
    rejectDestroy: null as Error | null,
    current: undefined as AtemState | undefined,
    emit<T extends AtemEvent>(event: T, ...args: AtemEvents[T]) {
      for (const listener of listeners[event]) listener(...args);
    },
    // Connects as the library does: a fresh state, then the connected event.
    connected(fill: (state: AtemState) => void = () => {}) {
      const state = AtemStateUtil.Create();
      fill(state);
      stub.current = state;
      stub.emit('connected');
    },
    // A cut on the first mix effect, by the client or at the ATEM, as the library reports it while
    // connected: the program input set on its state, then the stateChanged event with the path the
    // library's program input command gives.
    programChanged(input: number) {
      if (!stub.current) throw new Error('The stub is not connected');
      AtemStateUtil.getMixEffect(stub.current, 0).programInput = input;
      stub.emit('stateChanged', stub.current, ['video.mixEffects.0.programInput']);
    },
    // Drops as the library does: the disconnected event, then no state.
    disconnected() {
      stub.emit('disconnected');
      stub.current = undefined;
    },
  };
  const atem: AtemLike = {
    on<T extends AtemEvent>(event: T, listener: (...args: AtemEvents[T]) => void) {
      listeners[event].push(listener);
      return atem;
    },
    async connect(address: string) {
      stub.connects.push(address);
      const rejection = stub.rejectConnect;
      stub.rejectConnect = null;
      if (rejection) throw rejection;
    },
    async destroy() {
      stub.destroyed = true;
      if (stub.rejectDestroy) throw stub.rejectDestroy;
    },
    get state() {
      return stub.current;
    },
    async changeProgramInput(input: number, me?: number) {
      stub.changes.push([input, me]);
    },
  };
  return { stub, atem };
}

// The client's hook on a stub's socket process: it records the listener the client gives for each
// stub, as the library's socket process proxy keeps it, and fails emits a socket process error to it.
function socketProcesses() {
  const listeners = new Map<AtemLike, ((error: unknown) => void)[]>();
  const hook: SocketProcessErrors = (atem, listener) => {
    listeners.set(atem, [...(listeners.get(atem) ?? []), listener]);
    return true;
  };
  return {
    hook,
    // How many times the client hooked that stub's socket process.
    hooks: (atem: AtemLike) => listeners.get(atem)?.length ?? 0,
    fails(atem: AtemLike, error: unknown) {
      for (const listener of listeners.get(atem) ?? []) listener(error);
    },
  };
}

// A hook for a stub that has no socket process to hear.
const unhooked: SocketProcessErrors = () => false;

describe('the switcher client on the ATEM library', () => {
  it("takes the library's own Atem", () => {
    expectTypeOf<Atem>().toExtend<AtemLike>();
  });

  // tsc does not hold a generic event emitter's listeners to a non-generic signature, so the events'
  // arguments are pinned here: an event the library renames, removes or retypes is a type error.
  it("follows the library's connected, disconnected, error, stateChanged and receivedCommands events with the arguments the client expects", () => {
    expectTypeOf<AtemEvents['connected']>().toEqualTypeOf<[]>();
    expectTypeOf<AtemEvents['disconnected']>().toEqualTypeOf<[]>();
    expectTypeOf<AtemEvents['error']>().toEqualTypeOf<[string]>();
    expectTypeOf<AtemEvents['stateChanged']>().toEqualTypeOf<[AtemState, string[]]>();
    expectTypeOf<AtemEvents['receivedCommands']>().toEqualTypeOf<[Commands.IDeserializedCommand[]]>();
  });

  // The fields of an input channel the client reads, pinned the same way: a field the library
  // renames or retypes is a type error.
  it("reads each input's port type and long name with the types the client expects", () => {
    expectTypeOf<Channel['internalPortType']>().toEqualTypeOf<Enums.InternalPortType>();
    expectTypeOf<Channel['longName']>().toEqualTypeOf<string>();
  });

  it('connects to the host, and reports each connect and disconnect', async () => {
    const { stub, atem } = stubAtem();
    const client = atemSwitcher(() => atem, unhooked);
    const reports: boolean[] = [];
    client.onConnection((connected) => reports.push(connected));

    await client.connect('192.168.10.240');
    stub.connected();
    stub.disconnected();
    stub.connected();

    expect(stub.connects).toEqual(['192.168.10.240']);
    expect(reports).toEqual([true, false, true]);
  });

  it("reads the program input, the inputs, and the model and version from the library's state", () => {
    const { stub, atem } = stubAtem();
    const client = atemSwitcher(() => atem, unhooked);

    stub.connected((state) => {
      AtemStateUtil.getMixEffect(state, 0).programInput = 3;
      state.inputs[1] = channel({ inputId: 1, internalPortType: Enums.InternalPortType.External, longName: 'Camera 1' });
      state.inputs[2] = channel({ inputId: 2, internalPortType: Enums.InternalPortType.External, longName: 'Camera 2' });
      state.inputs[1000] = channel({ inputId: 1000, internalPortType: Enums.InternalPortType.ColorBars, longName: 'Color Bars' });
      state.inputs[3010] = channel({ inputId: 3010, internalPortType: Enums.InternalPortType.MediaPlayerFill, longName: 'Media Player 1' });
      state.info.model = Enums.Model.Mini;
      state.info.productIdentifier = 'ATEM Mini';
      state.info.apiVersion = Enums.ProtocolVersion.V8_1_1;
    });

    expect(client.programInput()).toBe(3);
    expect(client.inputs()).toEqual([
      { input: 1, external: true, name: 'Camera 1' },
      { input: 2, external: true, name: 'Camera 2' },
      { input: 1000, external: false, name: 'Color Bars' },
      { input: 3010, external: false, name: 'Media Player 1' },
    ]);
    expect(client.info()).toEqual({ model: 'ATEM Mini', version: '8.1.1' });
  });

  it("names the model by the library's enum without a product name, and a version the library does not know by its number", () => {
    const { stub, atem } = stubAtem();
    const client = atemSwitcher(() => atem, unhooked);

    stub.connected((state) => {
      state.info.model = Enums.Model.Mini;
      state.info.apiVersion = 131105 as Enums.ProtocolVersion;
    });

    expect(client.info()).toEqual({ model: 'Mini', version: '2.33' });
  });

  it('knows nothing while not connected', () => {
    const { stub, atem } = stubAtem();
    const client = atemSwitcher(() => atem, unhooked);
    const nothing = () => [client.programInput(), client.inputs(), client.info()];

    expect(nothing()).toEqual([null, [], null]);
    stub.connected((state) => {
      AtemStateUtil.getMixEffect(state, 0).programInput = 3;
    });
    stub.disconnected();
    expect(nothing()).toEqual([null, [], null]);
  });

  it('reports each change of the program input with the input now on program', () => {
    const { stub, atem } = stubAtem();
    const client = atemSwitcher(() => atem, unhooked);
    const programs: number[] = [];
    client.onProgram((input) => programs.push(input));

    stub.connected((state) => {
      AtemStateUtil.getMixEffect(state, 0).programInput = 1;
    });
    stub.programChanged(2);
    stub.programChanged(4);

    expect(programs).toEqual([2, 4]);
  });

  // Over the library's own Atem, never connected, so no socket process starts: each packet goes in
  // through the library's receive path, as its socket hands it a packet's commands.
  it('reports each change of the program input in a packet that carries several, in order, over the library itself', async () => {
    const atem = new Atem();
    const client = atemSwitcher(() => atem);
    const programs: number[] = [];
    client.onProgram((input) => programs.push(input));
    const socket = (atem as unknown as { client: { socket: EventEmitter } }).client.socket;
    const packet = (...commands: Commands.IDeserializedCommand[]) => socket.emit('receivedCommands', commands);
    const program = (source: number) => new Commands.ProgramInputUpdateCommand(0, { source });

    try {
      // The init dump the ATEM sends on connect, with Pro on program: the client connects, and
      // reports no program change.
      const topology = new Commands.TopologyCommand({ mixEffects: 1, sources: 10, multiviewers: 0 } as ConstructorParameters<typeof Commands.TopologyCommand>[0]);
      packet(new Commands.VersionCommand(Enums.ProtocolVersion.V8_1_1), topology, program(1), new Commands.InitCompleteCommand());
      expect(client.programInput()).toBe(1);
      expect(programs).toEqual([]);

      // An operator's cut to input 4 at the ATEM, then the client's cut to Camera, in one packet.
      packet(program(4), program(2));
      expect(programs).toEqual([4, 2]);
      expect(client.programInput()).toBe(2);
    } finally {
      await client.close();
    }
  });

  it('reports nothing for a state change that leaves the program input alone', () => {
    const { stub, atem } = stubAtem();
    const client = atemSwitcher(() => atem, unhooked);
    const programs: number[] = [];
    client.onProgram((input) => programs.push(input));
    stub.connected();

    const state = stub.current as AtemState;
    AtemStateUtil.getMixEffect(state, 0).previewInput = 3;
    stub.emit('stateChanged', state, ['video.mixEffects.0.previewInput']);

    expect(programs).toEqual([]);
  });

  it('changes the program input on the first mix effect', async () => {
    const { stub, atem } = stubAtem();
    const client = atemSwitcher(() => atem, unhooked);

    await client.changeProgramInput(2);

    expect(stub.changes).toEqual([[2, 0]]);
  });

  it('removes the signal listeners the library adds while it connects, keeps the others, and still rejects when the connect fails', async () => {
    const { atem } = stubAtem();
    const failure = new Error('no route to host');
    const library = () => {};
    const own = () => {};
    process.on('SIGTERM', own);
    try {
      const client = atemSwitcher(
        () => ({
          ...atem,
          async connect() {
            process.once('SIGINT', library);
            process.once('SIGTERM', library);
            throw failure;
          },
        }),
        unhooked,
      );
      await expect(client.connect('192.168.10.240')).rejects.toBe(failure);
      expect(process.listeners('SIGINT')).not.toContain(library);
      expect(process.listeners('SIGTERM')).not.toContain(library);
      expect(process.listeners('SIGTERM')).toContain(own);
    } finally {
      process.off('SIGTERM', own);
      process.off('SIGINT', library);
      process.off('SIGTERM', library);
    }
  });

  it('destroys the library connection on close', async () => {
    const { stub, atem } = stubAtem();
    const client = atemSwitcher(() => atem, unhooked);

    await client.close();

    expect(stub.destroyed).toBe(true);
  });

  it('logs an error the library emits, and goes on', () => {
    const { stub, atem } = stubAtem();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    atemSwitcher(() => atem, unhooked);

    stub.emit('error', 'socket closed');

    expect(logged).toHaveBeenCalledWith('Setlist server: the ATEM library reported an error', 'socket closed');
    logged.mockRestore();
  });

  // The library's error when its socket process respawned and its own reconnect after it rejected,
  // as atemSocket.js builds it from the Error it caught.
  const RESPAWN_FAILED = 'Failed to reconnect after respawning socket process: Error: The socket process did not answer';

  it('reports offline, then gives up with the reason, when the library fails to reconnect after its socket process respawns, and still logs it', () => {
    const { stub, atem } = stubAtem();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = atemSwitcher(() => atem, unhooked);
    const events: string[] = [];
    client.onConnection((connected) => events.push(connected ? 'online' : 'offline'));
    client.onGaveUp((reason) => events.push(`gave up: ${reason}`));
    stub.connected();

    stub.emit('error', RESPAWN_FAILED);

    expect(events).toEqual(['online', 'offline', 'gave up: The socket process did not answer']);
    expect(client.programInput()).toBeNull();
    expect(logged).toHaveBeenCalledWith('Setlist server: the ATEM library reported an error', RESPAWN_FAILED);
    logged.mockRestore();
  });

  it('gives up without a second offline report when the library already reported the drop', () => {
    const { stub, atem } = stubAtem();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = atemSwitcher(() => atem, unhooked);
    const events: string[] = [];
    client.onConnection((connected) => events.push(connected ? 'online' : 'offline'));
    client.onGaveUp((reason) => events.push(`gave up: ${reason}`));
    stub.connected();
    stub.disconnected();

    stub.emit('error', 'Failed to reconnect after respawning socket process: no route to host');

    expect(events).toEqual(['online', 'offline', 'gave up: no route to host']);
    logged.mockRestore();
  });

  it.each(['socket closed', 'MutateState failed: Error: bad state', 'Failed to deserialize command: TopologyCommand'])('only logs any other library error, such as %s', (message) => {
    const { stub, atem } = stubAtem();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = atemSwitcher(() => atem, unhooked);
    const events: string[] = [];
    client.onConnection((connected) => events.push(connected ? 'online' : 'offline'));
    client.onGaveUp((reason) => events.push(`gave up: ${reason}`));
    stub.connected((state) => {
      AtemStateUtil.getMixEffect(state, 0).programInput = 3;
    });

    stub.emit('error', message);

    expect(events).toEqual(['online']);
    expect(client.programInput()).toBe(3);
    expect(logged).toHaveBeenCalledWith('Setlist server: the ATEM library reported an error', message);
    logged.mockRestore();
  });

  // The library tells a failed reconnect after a respawn from its other errors only by the message's
  // text, and its error event is typed as a bare string, so the installed library's own code is pinned
  // here: a version that rewords the message, emits it from somewhere else, or changes it where the
  // Atem forwards the socket's error, fails this test.
  it("tells a failed reconnect after a respawn by the message the installed library's socket emits on its restarted event, and its Atem forwards unchanged", () => {
    const index = createRequire(import.meta.url).resolve('atem-connection');
    const socket = readFileSync(join(dirname(index), 'lib', 'atemSocket.js'), 'utf8');
    const start = socket.indexOf("ThreadedClassManager.onEvent(this._socketProcess, 'restarted'");
    expect(start).toBeGreaterThanOrEqual(0);
    const restarted = socket.slice(start, socket.indexOf('ThreadedClassManager.onEvent(', start + 1));

    expect(restarted).toContain('this.connect().catch((error) => {');
    expect(restarted).toContain('const errorMsg = `' + RESPAWN_RECONNECT_FAILED + '${error}`;');
    expect(restarted).toContain("this.emit('error', errorMsg);");
    const atem = readFileSync(join(dirname(index), 'atem.js'), 'utf8');
    expect(atem).toContain("this.socket.on('error', (e) => this.emitter.emit('error', e));");
  });
});

// A restart of the library's socket process that fails outright: threadedclass emits the error on the
// socket process and kills it, and the library hears none of it, so the client hears it on the socket
// process itself and builds a fresh Atem for the next connect.
describe("the switcher client when the library's socket process cannot restart", () => {
  // The error threadedclass gives when the restarted socket process did not answer in time.
  const RESTART_FAILED = new Error('Timeout when trying to restart after 1000');
  const LOG = "Setlist server: the ATEM's socket process could not restart";

  // A client over a fresh stub for each Atem it builds, in the order it builds them.
  function rig() {
    const stubs: ReturnType<typeof stubAtem>[] = [];
    const processes = socketProcesses();
    const client = atemSwitcher(() => {
      const made = stubAtem();
      stubs.push(made);
      return made.atem;
    }, processes.hook);
    const events: string[] = [];
    client.onConnection((connected) => events.push(connected ? 'online' : 'offline'));
    client.onGaveUp((reason) => events.push(`gave up: ${reason}`));
    client.onProgram((input) => events.push(`program: ${input}`));
    const stub = (index: number) => {
      const made = stubs[index];
      if (!made) throw new Error(`The client built no Atem ${index}`);
      return made;
    };
    return { client, events, processes, stub, built: () => stubs.length };
  }

  it('reports offline, then gives up with the error, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, events, processes, stub } = rig();
    await client.connect('192.168.10.240');
    stub(0).stub.connected();

    processes.fails(stub(0).atem, RESTART_FAILED);

    expect(events).toEqual(['online', 'offline', 'gave up: Timeout when trying to restart after 1000']);
    expect(client.programInput()).toBeNull();
    expect(logged).toHaveBeenCalledWith(LOG, RESTART_FAILED);
    logged.mockRestore();
  });

  it('gives up once for a socket process that errors again before the next connect', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, events, processes, stub } = rig();
    await client.connect('192.168.10.240');

    processes.fails(stub(0).atem, RESTART_FAILED);
    processes.fails(stub(0).atem, new Error('Could not kill child'));

    expect(events).toEqual(['gave up: Timeout when trying to restart after 1000']);
    expect(logged.mock.calls.filter(([line]) => line === LOG)).toEqual([[LOG, RESTART_FAILED]]);
    logged.mockRestore();
  });

  it('gives up without a second offline report when the library already reported the drop, with a thrown non-Error as the reason', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, events, processes, stub } = rig();
    await client.connect('192.168.10.240');
    stub(0).stub.connected();
    stub(0).stub.disconnected();

    processes.fails(stub(0).atem, 'the worker exited');

    expect(events).toEqual(['online', 'offline', 'gave up: the worker exited']);
    logged.mockRestore();
  });

  it('connects a fresh Atem to the host on the next connect, never calls into the lost one again, and ignores the lost one after', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, events, processes, stub, built } = rig();
    await client.connect('192.168.10.240');
    stub(0).stub.connected();
    processes.fails(stub(0).atem, RESTART_FAILED);
    expect(stub(0).stub.destroyed).toBe(false);
    expect(built()).toBe(1);

    await client.connect('192.168.10.240');
    expect(built()).toBe(2);
    expect(stub(1).stub.connects).toEqual(['192.168.10.240']);
    expect(stub(0).stub.connects).toEqual(['192.168.10.240']);
    expect(processes.hooks(stub(1).atem)).toBe(1);
    stub(1).stub.connected((state) => {
      AtemStateUtil.getMixEffect(state, 0).programInput = 3;
    });
    expect(client.programInput()).toBe(3);
    stub(1).stub.programChanged(4);

    // The lost Atem's own events, and a second error on its socket process, report nothing.
    stub(0).stub.connected();
    stub(0).stub.programChanged(2);
    stub(0).stub.disconnected();
    stub(0).stub.emit('error', 'Failed to reconnect after respawning socket process: Error: gone');
    processes.fails(stub(0).atem, RESTART_FAILED);

    expect(events).toEqual(['online', 'offline', 'gave up: Timeout when trying to restart after 1000', 'online', 'program: 4']);
    expect(client.programInput()).toBe(4);
    logged.mockRestore();
  });

  it('keeps the same Atem for a connect after a connect that rejected, and after a failed reconnect after a respawn, and hears its socket process once', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, events, processes, stub, built } = rig();
    stub(0).stub.rejectConnect = new Error('Could not start the socket process');
    await expect(client.connect('192.168.10.240')).rejects.toThrow('Could not start the socket process');
    await client.connect('192.168.10.240');
    stub(0).stub.connected();
    stub(0).stub.emit('error', `${RESPAWN_RECONNECT_FAILED}Error: The socket process did not answer`);
    await client.connect('192.168.10.240');

    expect(built()).toBe(1);
    expect(stub(0).stub.connects).toEqual(['192.168.10.240', '192.168.10.240', '192.168.10.240']);
    expect(processes.hooks(stub(0).atem)).toBe(1);
    expect(events).toEqual(['online', 'offline', 'gave up: The socket process did not answer']);
    logged.mockRestore();
  });

  it('hears the socket process on a later connect when the first one had none to hear', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stub: made, atem } = stubAtem();
    const processes = socketProcesses();
    let present = false;
    const client = atemSwitcher(
      () => atem,
      (each, listener) => present && processes.hook(each, listener),
    );
    const events: string[] = [];
    client.onGaveUp((reason) => events.push(`gave up: ${reason}`));
    made.rejectConnect = new Error('Could not start the socket process');
    await expect(client.connect('192.168.10.240')).rejects.toThrow();
    present = true;
    await client.connect('192.168.10.240');
    await client.connect('192.168.10.240');

    expect(processes.hooks(atem)).toBe(1);
    processes.fails(atem, RESTART_FAILED);
    expect(events).toEqual(['gave up: Timeout when trying to restart after 1000']);
    logged.mockRestore();
  });

  // The library never hears a restart that fails outright, so the client reaches past it: into its
  // Atem's private path to the socket process, and onto threadedclass's error event, loaded from the
  // library's own path. The installed code of both is pinned here: a re-pin that moves the socket
  // process, stops threadedclass emitting the error before it kills the process, or makes the
  // library handle that error itself, fails this test, so the client's hook is revisited.
  it("hears a failed restart on the socket process the installed library keeps at its Atem's client socket, where threadedclass emits the error before it kills the process, and the library does not listen", () => {
    const index = createRequire(import.meta.url).resolve('atem-connection');
    const atem = readFileSync(join(dirname(index), 'atem.js'), 'utf8');
    expect(atem).toContain('this.client = new AtemWrapper(');
    expect(atem).toContain('this.socket = new atemSocket_1.AtemSocket(');
    const socket = readFileSync(join(dirname(index), 'lib', 'atemSocket.js'), 'utf8');
    expect(socket).toContain('this._socketProcess = await (0, threadedclass_1.threadedClass)(');
    expect(socket).not.toContain("ThreadedClassManager.onEvent(this._socketProcess, 'error'");

    const threadedclass = createRequire(index).resolve('threadedclass');
    const manager = readFileSync(join(dirname(threadedclass), 'parent-process', 'manager.js'), 'utf8');
    expect(manager).toMatch(/this\._emitProxyEvent\(child, 'error', err\);\s+this\.debugLogError\('Error when running restartChild\(\)', err\);\s+\/\/ Clean up the child:\s+this\.killChild\(child, 'timeout when restarting', true\)/);
  });

  it('destroys the fresh Atem on close', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, processes, stub } = rig();
    await client.connect('192.168.10.240');
    processes.fails(stub(0).atem, RESTART_FAILED);
    await client.connect('192.168.10.240');

    await client.close();

    expect(stub(1).stub.destroyed).toBe(true);
    logged.mockRestore();
  });

  it('closes at once while the Atem is lost, before the next connect builds a fresh one', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, processes, stub, built } = rig();
    await client.connect('192.168.10.240');
    processes.fails(stub(0).atem, RESTART_FAILED);
    stub(0).stub.rejectDestroy = new Error('Child process of instance atem-connection has been closed');

    await expect(client.close()).resolves.toBeUndefined();

    expect(stub(0).stub.destroyed).toBe(false);
    expect(built()).toBe(1);
    logged.mockRestore();
  });
});
