// Repros for docs/reviews/setlist-controller-1/pre-pr-review-2.md, finding 3 (A, B and L90). Copy into test/ to run.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectToServer } from '../web/src/server-connection.ts';

class FakeSocket extends EventTarget {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  url: string;
  constructor(url: string) { super(); this.url = url; FakeSocket.all.push(this); }
  send(data: string) { this.sent.push(data); }
  // The browser's close(): async close event.
  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    setTimeout(() => this.serverClose(), 0);
  }
  accept() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  message(data: unknown) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(data) })); }
  serverClose() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
}

class Vis extends EventTarget { visibilityState: 'visible' | 'hidden' = 'visible'; wake() { this.visibilityState = 'hidden'; this.dispatchEvent(new Event('visibilitychange')); this.visibilityState = 'visible'; this.dispatchEvent(new Event('visibilitychange')); } }

let statuses: boolean[];
const start = () => {
  statuses = [];
  const vis = new Vis();
  const conn = connectToServer({ url: 'ws://x/', onSnapshot: () => {}, onStatus: (o) => statuses.push(o), visibility: vis as never });
  return { vis, conn };
};

beforeEach(() => { vi.useFakeTimers(); FakeSocket.all = []; vi.stubGlobal('WebSocket', FakeSocket); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('N5', () => {
  it('A: wake, fresh try hangs, old socket silently dead: page must go to not-connected', () => {
    const { vis, conn } = start();
    FakeSocket.all[0]!.accept(); FakeSocket.all[0]!.message({});
    vis.wake();
    vi.advanceTimersByTime(5000); // several connect timeouts, none opens
    console.log('A statuses', JSON.stringify(statuses), 'sockets', FakeSocket.all.length, 'old readyState', FakeSocket.all[0]!.readyState);
    conn.send({ kind: 'stop' } as never);
    console.log('A command went to dead old socket:', FakeSocket.all[0]!.sent.length === 1);
    expect(statuses.at(-1)).toBe(false);
    conn.close();
  });

  it('B: wake, fresh try hangs, old socket closes: page must go to not-connected', () => {
    const { vis, conn } = start();
    FakeSocket.all[0]!.accept(); FakeSocket.all[0]!.message({});
    vis.wake();
    vi.advanceTimersByTime(300);
    FakeSocket.all[0]!.serverClose();
    vi.advanceTimersByTime(100);
    console.log('B statuses after old closed (fresh still CONNECTING)', JSON.stringify(statuses));
    expect(statuses.at(-1)).toBe(false);
    conn.close();
  });

  it('control: healthy wake never reports down', () => {
    const { vis, conn } = start();
    FakeSocket.all[0]!.accept(); FakeSocket.all[0]!.message({});
    vis.wake();
    vi.advanceTimersByTime(50);
    FakeSocket.all[1]!.accept(); FakeSocket.all[1]!.message({});
    vi.advanceTimersByTime(50);
    console.log('control statuses', JSON.stringify(statuses));
    expect(statuses.every(Boolean)).toBe(true);
    expect(statuses.at(-1)).toBe(true);
    conn.close();
  });

  it('control: drop then retry reports [true,false,true]', () => {
    const { conn } = start();
    FakeSocket.all[0]!.accept(); FakeSocket.all[0]!.message({});
    FakeSocket.all[0]!.serverClose();
    vi.advanceTimersByTime(250);
    FakeSocket.all[1]!.accept(); FakeSocket.all[1]!.message({});
    console.log('drop statuses', JSON.stringify(statuses));
    expect(statuses).toEqual([true, false, true]);
    conn.close();
  });

  it('L90: no "connected" before the first snapshot', () => {
    const { conn } = start();
    FakeSocket.all[0]!.accept();
    console.log('L90 statuses after open, before any snapshot', JSON.stringify(statuses));
    expect(statuses).toEqual([]);
    FakeSocket.all[0]!.message({});
    expect(statuses).toEqual([true]);
    conn.close();
  });
});
