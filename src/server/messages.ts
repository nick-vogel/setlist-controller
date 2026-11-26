import { randomUUID } from 'node:crypto';
import type { BandMessage, MessageTarget } from '../shared/messages.ts';
import type { Role } from '../shared/routes.ts';

// The producer's active messages, from which the hub reads the one message each device shows. A
// device shows the newest message that reaches it, so a second send replaces the first wherever both
// reach. A message to every page or to every view-only page stands for the page that first connects
// after the send too. The board lives in memory alone, as the device registry does, so a server
// restart clears it.

export type MessageBoard = {
  // Records a message to the target, with a new ID, and gives it.
  send(text: string, to: MessageTarget): BandMessage;
  // Forgets every active message. True when there was one.
  clear(): boolean;
  // The message the device with this client ID shows on a socket of this role, or null for none.
  activeFor(client: string, role: Role): BandMessage | null;
};

type Posted = { message: BandMessage; order: number };

export function createMessageBoard(newId: () => string = randomUUID): MessageBoard {
  let order = 0;
  let all: Posted | null = null;
  let viewers: Posted | null = null;
  const chosen = new Map<string, Posted>();

  return {
    send(text, to) {
      const posted = { message: { id: newId(), text }, order: (order += 1) };
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
      const reaching = [all, role === 'viewer' ? viewers : null, chosen.get(client) ?? null];
      let newest: Posted | null = null;
      for (const posted of reaching) if (posted && (!newest || posted.order > newest.order)) newest = posted;
      return newest?.message ?? null;
    },
  };
}
