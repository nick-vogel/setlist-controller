import type { PageCommand } from '../../src/shared/command.ts';
import { isHeartbeat, SILENCE_MS } from '../../src/shared/heartbeat.ts';
import type { Snapshot } from '../../src/shared/snapshot.ts';

// A page's connection to the server's hub. It comes back on its own when the connection drops, with
// a short wait between tries, at once when the device wakes, and at once when a visible page's socket
// goes silent past the limit in heartbeat.ts, since the hub sends a heartbeat every few seconds and a
// socket that reads open but carries nothing is dead. The hub sends the full snapshot on every
// connect, so coming back is the same as a first connect, and the page never reloads.

export type ServerConnection = {
  // Sends while the connection is open. A command sent while it is down is dropped, not queued: a
  // jump or a stop that lands seconds late is worse than none.
  send(command: PageCommand): void;
  // Closes the connection for good. Nothing reconnects after it.
  close(): void;
};

// The page's document, or anything else that reports its visibility.
export type Visibility = Pick<Document, 'visibilityState'> & EventTarget;

export type ConnectionOptions = {
  url: string;
  onSnapshot(snapshot: Snapshot): void;
  onStatus?(open: boolean): void;
  visibility: Visibility;
};

// The wait before each try, in milliseconds, counted from 0 since the last open. Every wait is
// under 2 seconds, and the tries never give up. A socket that opens but then hears nothing, not even
// the heartbeat, is not retried on this schedule: the silence limit replaces it at once.
const RETRY_DELAYS_MS = [250, 500, 1000, 1500];

// A try whose handshake has not come back by now is given up, and a fresh try starts at once, so
// a try lost on the way (a dropped packet on a lossy Wi-Fi) still keeps the tries under 2 seconds
// apart.
const CONNECT_TIMEOUT_MS = 1500;

export function retryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!;
}

export function connectToServer({ url, onSnapshot, onStatus, visibility }: ConnectionOptions): ServerConnection {
  let socket: WebSocket | null = null;
  // The open socket a wake replaced. It carries commands until the fresh socket opens.
  let previous: WebSocket | null = null;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const retire = () => {
    previous?.close();
    previous = null;
  };

  const open = () => {
    const opened = new WebSocket(url);
    socket = opened;
    let reported = false;
    const connecting = setTimeout(() => {
      if (socket !== opened || opened.readyState !== WebSocket.CONNECTING) return;
      if (previous) onStatus?.(false);
      open();
      opened.close();
    }, CONNECT_TIMEOUT_MS);
    // Armed on open and again on every message. A socket the page is showing that hears nothing in
    // that time is dead: the page reports down and opens a fresh socket at once, and this one's close
    // schedules nothing. A hidden page leaves it to the wake.
    let silence: ReturnType<typeof setTimeout> | undefined;
    const listen = () => {
      clearTimeout(silence);
      silence = setTimeout(() => {
        if (socket !== opened || visibility.visibilityState !== 'visible') return;
        onStatus?.(false);
        open();
        opened.close();
      }, SILENCE_MS);
    };
    opened.addEventListener('open', () => {
      clearTimeout(connecting);
      attempt = 0;
      listen();
      if (socket === opened) retire();
    });
    opened.addEventListener('message', (event) => {
      listen();
      if (socket !== opened) return;
      // A heartbeat only shows the socket is alive. The page reads up once a snapshot has come.
      if (isHeartbeat(event.data)) return;
      onSnapshot(JSON.parse(String(event.data)) as Snapshot);
      if (reported) return;
      reported = true;
      onStatus?.(true);
    });
    opened.addEventListener('close', () => {
      clearTimeout(connecting);
      clearTimeout(silence);
      // A socket this replaced, or one closed for good, schedules nothing. The one a wake replaced
      // reports the page down when it closes while the fresh socket is not open.
      if (socket !== opened) {
        if (opened !== previous) return;
        previous = null;
        if (socket?.readyState !== WebSocket.OPEN) onStatus?.(false);
        return;
      }
      socket = null;
      onStatus?.(false);
      retry = setTimeout(open, retryDelay(attempt));
      attempt += 1;
    });
  };

  // A device that slept can hand back a socket that still reads open but is dead, and no close ever
  // comes for it. So a wake always opens a fresh socket, at once, in place of the current one. A
  // replaced socket that reads open still carries commands until the fresh one opens, so a tap at
  // the moment of the wake is not lost; if it was dead, the tap is lost as it would be with none.
  const wake = () => {
    if (visibility.visibilityState !== 'visible') return;
    clearTimeout(retry);
    const replaced = socket;
    attempt = 0;
    open();
    if (replaced?.readyState === WebSocket.OPEN) {
      retire();
      previous = replaced;
    } else {
      replaced?.close();
      if (replaced && !previous) onStatus?.(false);
    }
  };

  open();
  visibility.addEventListener('visibilitychange', wake);

  return {
    send(command) {
      const target = socket?.readyState === WebSocket.OPEN ? socket : previous;
      if (target?.readyState === WebSocket.OPEN) target.send(JSON.stringify(command));
    },
    close() {
      visibility.removeEventListener('visibilitychange', wake);
      clearTimeout(retry);
      retire();
      const closing = socket;
      socket = null;
      closing?.close();
    },
  };
}
