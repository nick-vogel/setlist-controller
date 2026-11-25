import type { SwitcherClient, SwitcherInfo, SwitcherInput } from '../src/server/atem.ts';

// A switcher client for tests, in place of the one built on the ATEM library (atem-switcher.ts). It
// records every program change it was told, in order, and the test makes it report a connect and a
// disconnect, and a cut made at the ATEM itself. While connected, it reports every program change,
// its own and one made at the ATEM, to its program listeners. It reports its own at once, inside
// changeProgramInput, unless the test holds them back to arrive late, as the ATEM's state update
// does. It is disconnected until the adapter asks it to connect, and then reports connected at once,
// unless the test built it to stay offline. A status change while it is not connecting is only
// remembered, and reported once the adapter connects. It records the host it was asked to connect to,
// how many times it was asked, and whether it was closed. The test can make its next connects reject,
// as the library's does when it cannot start its socket process: a connect that rejects leaves it not
// connecting, so it stays offline until the test connects it on its own, as the library's restarted
// socket process can. The test can make it give up as the library does when its socket process
// respawns and the library's own reconnect rejects, or when its socket process fails to restart
// outright: it stops connecting, reports disconnected if it was connected, then tells its gave-up
// listeners the reason, and stays offline until the adapter connects again. The test can make it refuse the cuts it is told, as the library does when the ATEM
// does not take a command: a refused cut rejects, and is neither on program nor reported. The test
// sets its program input, inputs, model and version.
//
// Its inputs are given as SwitcherInputs, or a bare number as the external input of that number named
// "Input <n>". By default it has the ATEM Mini's four external inputs and its own sources, as the
// library reports them, since a real ATEM always reports its own sources.
export type FakeInput = number | SwitcherInput;

// The ATEM Mini's own sources: Black, Color Bars, its two color generators, and its media player's
// fill and key.
export const ATEM_MINI_SOURCES: SwitcherInput[] = [
  { input: 0, external: false, name: 'Black' },
  { input: 1000, external: false, name: 'Color Bars' },
  { input: 2001, external: false, name: 'Color 1' },
  { input: 2002, external: false, name: 'Color 2' },
  { input: 3010, external: false, name: 'Media Player 1' },
  { input: 3011, external: false, name: 'Media Player 1 Key' },
];

const asInputs = (inputs: FakeInput[]): SwitcherInput[] =>
  inputs.map((input) => (typeof input === 'number' ? { input, external: true, name: `Input ${input}` } : { ...input }));

export type FakeSwitcher = SwitcherClient & {
  // Every input it was told to put on program, in order.
  programs: number[];
  // The host the adapter asked it to connect to, or null before it asked.
  host: string | null;
  // How many times the adapter asked it to connect.
  connects: number;
  closed: boolean;
  // Makes the next count connects reject with an error of that message.
  failConnects(count: number, message: string): void;
  // Connects as the library does on its own, with no connect asked of it, as after a connect that
  // rejected when the library's socket process restarts: not counted in connects.
  connectOnItsOwn(): void;
  // Holds the next connect: it is counted in connects and records its host at once, then waits until
  // the returned function is called, and carries on as usual after.
  holdConnects(): () => void;
  // Gives up as the library does when its socket process respawns and its own reconnect rejects with
  // that message: stops connecting, reports disconnected if it was connected, then calls each gave-up
  // listener with the message. Not counted in connects. A later connect from the adapter connects as
  // usual, or rejects while failConnects says so.
  respawnFailingReconnect(message: string): void;
  // Gives up as the library's socket process does when it fails to restart outright, with that
  // message as the reason: stops connecting, reports disconnected if it was connected, then calls each
  // gave-up listener with the message. Not counted in connects. A later connect from the adapter
  // connects as usual, or rejects while failConnects says so.
  restartFailsOutright(message: string): void;
  goOnline(): void;
  goOffline(): void;
  // A cut made at the ATEM itself, as in ATEM Software Control: on program, and reported while
  // connected, but not recorded in programs.
  cutAtSwitcher(input: number): void;
  // From now on a program change it is told is recorded in programs and held: not on program and not
  // reported, until releaseEchoes().
  holdEchoes(): void;
  // Puts each held program change on program and reports it, in order, and reports each one after at
  // once again.
  releaseEchoes(): void;
  // From now on a program change it is told is recorded in programs and refused: changeProgramInput
  // rejects, and the change is neither on program nor reported.
  refuseCuts(): void;
  setInputs(inputs: FakeInput[]): void;
  setInfo(info: SwitcherInfo): void;
};

export function fakeSwitcher({
  online = true,
  program = 1,
  inputs = [1, 2, 3, 4, ...ATEM_MINI_SOURCES],
  info = { model: 'ATEM Mini', version: '8.1.1' },
}: { online?: boolean; program?: number; inputs?: FakeInput[]; info?: SwitcherInfo } = {}): FakeSwitcher {
  const listeners: ((connected: boolean) => void)[] = [];
  const programListeners: ((input: number) => void)[] = [];
  const gaveUpListeners: ((reason: string) => void)[] = [];
  let connecting = false;
  let connected = false;
  let wantOnline = online;
  let current = program;
  let known = asInputs(inputs);
  let device = info;
  let held: number[] | null = null;
  let refusing = false;
  let failing = { count: 0, message: '' };
  let hold: Promise<void> | null = null;
  const report = () => {
    const next = connecting && wantOnline;
    if (next === connected) return;
    connected = next;
    for (const listener of listeners) listener(connected);
  };
  const cut = (input: number) => {
    current = input;
    if (!connected) return;
    for (const listener of programListeners) listener(input);
  };
  // Stops connecting and gives up with the reason, as the library does when nothing in it will try
  // again.
  const giveUp = (message: string) => {
    connecting = false;
    report();
    for (const listener of gaveUpListeners) listener(message);
  };
  const fake: FakeSwitcher = {
    programs: [],
    host: null,
    connects: 0,
    closed: false,
    async connect(host) {
      fake.host = host;
      fake.connects += 1;
      const waiting = hold;
      hold = null;
      if (waiting) await waiting;
      if (failing.count > 0) {
        failing.count -= 1;
        throw new Error(failing.message);
      }
      connecting = true;
      report();
    },
    failConnects(count, message) {
      failing = { count, message };
    },
    connectOnItsOwn() {
      connecting = true;
      report();
    },
    holdConnects() {
      let release = () => {};
      hold = new Promise((resolve) => {
        release = resolve;
      });
      return () => release();
    },
    respawnFailingReconnect: giveUp,
    restartFailsOutright: giveUp,
    async close() {
      fake.closed = true;
      connecting = false;
      connected = false;
    },
    onConnection: (listener) => void listeners.push(listener),
    onProgram: (listener) => void programListeners.push(listener),
    onGaveUp: (listener) => void gaveUpListeners.push(listener),
    programInput: () => (connected ? current : null),
    inputs: () => (connected ? asInputs(known) : []),
    info: () => (connected ? device : null),
    async changeProgramInput(input) {
      fake.programs.push(input);
      if (refusing) throw new Error(`The ATEM refused the cut to input ${input}`);
      if (held) held.push(input);
      else cut(input);
    },
    goOnline() {
      wantOnline = true;
      report();
    },
    goOffline() {
      wantOnline = false;
      report();
    },
    cutAtSwitcher: cut,
    holdEchoes() {
      held ??= [];
    },
    releaseEchoes() {
      const echoes = held ?? [];
      held = null;
      for (const input of echoes) cut(input);
    },
    refuseCuts() {
      refusing = true;
    },
    setInputs(next) {
      known = asInputs(next);
    },
    setInfo(next) {
      device = next;
    },
  };
  return fake;
}
