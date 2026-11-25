import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RELOAD, type DeviceHello } from '../src/shared/devices.ts';
import { HEARTBEAT, HEARTBEAT_MS, SILENCE_MS } from '../src/shared/heartbeat.ts';
import { connectToServer } from '../web/src/server-connection.ts';

// A WebSocket the test drives by hand: it opens, delivers and closes only when told to.
class FakeSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  constructor() {
    super();
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState >= FakeSocket.CLOSING) return;
    this.readyState = FakeSocket.CLOSING;
    setTimeout(() => this.closed(), 0);
  }
  accept() {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }
  deliver(data = '{}') {
    this.dispatchEvent(Object.assign(new Event('message'), { data }));
  }
  closed() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }
}

class Visibility extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  wake() {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
    this.visibilityState = 'visible';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('reports the connection down when a wake replaces a socket that is closing and every fresh try hangs', () => {
  const statuses: boolean[] = [];
  const visibility = new Visibility();
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, onStatus: (open) => statuses.push(open), visibility });
  const first = FakeSocket.all[0]!;
  first.accept();
  first.deliver();

  first.readyState = FakeSocket.CLOSING;
  visibility.wake();
  first.closed();
  vi.advanceTimersByTime(5000);

  expect(statuses).toEqual([true, false]);
  connection.close();
});

it('stays connected across a second wake while the socket the first one replaced still reads open', () => {
  const statuses: boolean[] = [];
  const visibility = new Visibility();
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, onStatus: (open) => statuses.push(open), visibility });
  FakeSocket.all[0]!.accept();
  FakeSocket.all[0]!.deliver();

  visibility.wake();
  visibility.wake();
  FakeSocket.all[2]!.accept();
  FakeSocket.all[2]!.deliver();

  expect(statuses).toEqual([true, true]);
  connection.close();
});

it('reports a socket that has heard nothing for the silence limit down, and replaces it at once', () => {
  const statuses: boolean[] = [];
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, onStatus: (open) => statuses.push(open), visibility: new Visibility() });
  const first = FakeSocket.all[0]!;
  first.accept();
  first.deliver();

  vi.advanceTimersByTime(SILENCE_MS);

  expect(statuses).toEqual([true, false]);
  expect(FakeSocket.all).toHaveLength(2);
  const fresh = FakeSocket.all[1]!;
  fresh.accept();
  fresh.deliver();
  expect(statuses).toEqual([true, false, true]);
  connection.close();
});

it('keeps one socket, reported up once, while only heartbeats come', () => {
  const statuses: boolean[] = [];
  let snapshots = 0;
  const connection = connectToServer({
    url: 'ws://server/',
    onSnapshot: () => (snapshots += 1),
    onStatus: (open) => statuses.push(open),
    visibility: new Visibility(),
  });
  const first = FakeSocket.all[0]!;
  first.accept();
  first.deliver();

  for (let elapsed = 0; elapsed < 60_000; elapsed += HEARTBEAT_MS) {
    vi.advanceTimersByTime(HEARTBEAT_MS);
    first.deliver(HEARTBEAT);
  }

  expect(FakeSocket.all).toHaveLength(1);
  expect(statuses).toEqual([true]);
  expect(snapshots).toBe(1);
  connection.close();
});

it('reports a fresh socket that a wake opened down when it opens and never sends its snapshot', () => {
  const statuses: boolean[] = [];
  const visibility = new Visibility();
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, onStatus: (open) => statuses.push(open), visibility });
  FakeSocket.all[0]!.accept();
  FakeSocket.all[0]!.deliver();

  visibility.wake();
  const fresh = FakeSocket.all.at(-1)!;
  fresh.accept();
  vi.advanceTimersByTime(SILENCE_MS);

  expect(statuses).toEqual([true, false]);
  expect(FakeSocket.all.at(-1)).not.toBe(fresh);
  connection.close();
});

it('leaves a hidden page whose socket goes silent to the wake', () => {
  const statuses: boolean[] = [];
  const visibility = new Visibility();
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, onStatus: (open) => statuses.push(open), visibility });
  FakeSocket.all[0]!.accept();
  FakeSocket.all[0]!.deliver();

  visibility.visibilityState = 'hidden';
  visibility.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(SILENCE_MS * 3);
  expect(statuses).toEqual([true]);
  expect(FakeSocket.all).toHaveLength(1);

  visibility.visibilityState = 'visible';
  visibility.dispatchEvent(new Event('visibilitychange'));
  expect(FakeSocket.all).toHaveLength(2);
  connection.close();
});

it('keeps trying under 2 seconds apart for a whole minute while every try fails', () => {
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, visibility: new Visibility() });
  FakeSocket.all[0]!.accept();
  FakeSocket.all[0]!.deliver();

  const droppedAt = Date.now();
  FakeSocket.all[0]!.closed();
  const starts = [droppedAt];
  let seen = FakeSocket.all.length;
  for (let elapsed = 0; elapsed < 60_000; elapsed += 10) {
    vi.advanceTimersByTime(10);
    // Every try is refused as soon as it starts, as a server out of reach refuses it.
    for (const socket of FakeSocket.all.slice(seen)) {
      starts.push(Date.now());
      socket.closed();
    }
    seen = FakeSocket.all.length;
  }
  starts.push(Date.now());

  // A client that gave up after any number of tries leaves a gap of over 2 seconds at the end.
  expect(starts.length).toBeGreaterThan(30);
  for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeLessThan(2000);
  connection.close();
});

const HELLO: DeviceHello = { kind: 'hello', client: 'phone', name: 'Keys', battery: 50 };

it('introduces the device on every socket it opens, the one after a drop included', () => {
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, visibility: new Visibility() });
  connection.introduce(HELLO);
  expect(FakeSocket.all[0]!.sent).toEqual([]);

  FakeSocket.all[0]!.accept();
  FakeSocket.all[0]!.closed();
  vi.advanceTimersByTime(250);
  FakeSocket.all[1]!.accept();

  expect(FakeSocket.all.map((socket) => socket.sent.map((data) => JSON.parse(data) as unknown))).toEqual([[HELLO], [HELLO]]);
  connection.close();
});

it('sends a changed hello at once on the open socket', () => {
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, visibility: new Visibility() });
  connection.introduce(HELLO);
  FakeSocket.all[0]!.accept();

  connection.introduce({ ...HELLO, name: 'Keys 2' });

  expect(FakeSocket.all[0]!.sent.map((data) => (JSON.parse(data) as DeviceHello).name)).toEqual(['Keys', 'Keys 2']);
  connection.close();
});

it('reloads the page on a reload frame, and never reads it as a snapshot', () => {
  const snapshots: unknown[] = [];
  let reloads = 0;
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: (snapshot) => snapshots.push(snapshot), onReload: () => (reloads += 1), visibility: new Visibility() });
  FakeSocket.all[0]!.accept();

  FakeSocket.all[0]!.deliver(RELOAD);

  expect(reloads).toBe(1);
  expect(snapshots).toEqual([]);
  connection.close();
});
