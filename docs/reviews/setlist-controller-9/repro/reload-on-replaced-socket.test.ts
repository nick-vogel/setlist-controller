// Repro for pre-pr-review-1 finding 4: a reload frame that arrives on the open socket a wake is
// replacing is dropped, though the hub sends it there, since the fresh socket has not said hello yet.
// Run from the repo root:
//   pnpm vitest run --root docs/reviews/setlist-controller-9/repro
// Red at 33c71fe (reloads stays 0); green once the page reads a reload on either socket.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RELOAD } from '../../../../src/shared/devices.ts';
import { connectToServer } from '../../../../web/src/server-connection.ts';

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
    this.readyState = FakeSocket.CLOSED;
  }
  accept() {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }
  deliver(data = '{}') {
    this.dispatchEvent(Object.assign(new Event('message'), { data }));
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

it('reloads on a reload frame that reaches the socket a wake is replacing, before the fresh socket opens', () => {
  const visibility = new Visibility();
  let reloads = 0;
  const connection = connectToServer({ url: 'ws://server/', onSnapshot: () => {}, onReload: () => (reloads += 1), visibility });
  const first = FakeSocket.all[0]!;
  first.accept();
  first.deliver();

  visibility.wake();
  expect(FakeSocket.all).toHaveLength(2);
  expect(first.readyState).toBe(FakeSocket.OPEN);
  first.deliver(RELOAD);

  expect(reloads).toBe(1);
  connection.close();
});
