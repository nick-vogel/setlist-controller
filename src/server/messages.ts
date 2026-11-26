import { randomUUID } from 'node:crypto';
import type { ActiveMessage, BandMessage, MessageTarget } from '../shared/messages.ts';
import type { Role } from '../shared/routes.ts';

// The producer's active messages, from which the hub reads the one message each device shows and the
// list the producer page shows, each with its target and send time. A
// device shows the newest message that reaches it, so a second send replaces the first wherever both
// reach. A message also stands for a device that is not connected yet: one to every page or every
// view-only page reaches a page that first connects after the send, and one to chosen devices reaches
// a chosen device when it comes back. The board lives in memory alone, as the device registry does,
// so a server restart clears it.

export type MessageBoard = {
  // Records a message to the target, with a new ID, and gives it.
  send(text: string, to: MessageTarget): BandMessage;
  // Forgets every active message. True when there was one.
  clear(): boolean;
  // The message the device with this client ID shows on a socket of this role, or null for none.
  activeFor(client: string, role: Role): BandMessage | null;
  // Every active message, newest first, each with the devices of this list that show it.
  active(devices: readonly { client: string; role: Role }[]): ActiveMessage[];
};

type Posted = { message: BandMessage; order: number; to: MessageTarget; sent: number };

// now is the wall clock, as the device registry's is, since the producer page shows the send time.
export function createMessageBoard(newId: () => string = randomUUID, now: () => number = Date.now): MessageBoard {
  let order = 0;
  let all: Posted | null = null;
  let viewers: Posted | null = null;
  const chosen = new Map<string, Posted>();

  return {
    send(text, to) {
      const posted = { message: { id: newId(), text }, order: (order += 1), to, sent: now() };
      if (to === 'all') {
        // It is newer than every message held, so it replaces them all.
        all = posted;
        viewers = null;
        chosen.clear();
      } else if (to === 'viewers') {
        viewers = posted;
      } else {
        for (const client of to) chosen.set(client, posted);
      }
      return posted.message;
    },
    clear() {
      const had = all !== null || viewers !== null || chosen.size > 0;
      all = null;
      viewers = null;
      chosen.clear();
      return had;
    },
    activeFor(client, role) {
      return shownOn(client, role)?.message ?? null;
    },
    active(devices) {
      const held = new Set<Posted>(chosen.values());
      if (viewers) held.add(viewers);
      if (all) held.add(all);
      return [...held]
        .sort((a, b) => b.order - a.order)
        .map(({ message, to, sent }) => ({
          ...message,
          to: Array.isArray(to) ? to.filter((client) => chosen.get(client)?.message === message) : to,
          sent,
          shownBy: devices.filter((device) => shownOn(device.client, device.role)?.message === message).map((device) => device.client),
        }));
    },
  };

  function shownOn(client: string, role: Role): Posted | null {
    const reaching = [all, role === 'viewer' ? viewers : null, chosen.get(client) ?? null];
    let newest: Posted | null = null;
    for (const posted of reaching) if (posted && (!newest || posted.order > newest.order)) newest = posted;
    return newest;
  }
}
