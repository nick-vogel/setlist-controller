import type { Device, DeviceHello } from '../shared/devices.ts';
import type { Role } from '../shared/routes.ts';

// The devices that introduced themselves to the hub, by client ID, in the order each first did. A
// device stays listed once its last socket closes, offline with the time it closed, until it comes
// back, the producer clears the offline ones, or the server restarts: the registry lives in memory
// alone. One device may hold several sockets at once, as when a wake opens a fresh socket before the
// old one closes, and it is online while any is open. S is whatever names a socket, so the hub keys
// it by its WebSocket and a test by a string.

// The most offline devices the registry keeps. Past it, the one offline longest goes: a page that
// says hello with a new client ID on every socket could otherwise grow the list without end.
export const MAX_OFFLINE_DEVICES = 50;

export type DeviceRegistry<S> = {
  // Records the hello a socket of this role sent. True when the list changed.
  hello(socket: S, role: Role, hello: DeviceHello): boolean;
  // Records that the socket closed. True when the list changed.
  leave(socket: S): boolean;
  // Forgets every offline device. True when the list changed.
  clearOffline(): boolean;
  // The open sockets of the device with this client ID, none for a client the registry does not hold.
  sockets(client: string): S[];
  list(): Device[];
};

type Entry<S> = { device: Device; sockets: Set<S> };

export function createDeviceRegistry<S>(now: () => number = Date.now): DeviceRegistry<S> {
  const entries = new Map<string, Entry<S>>();
  const clientOf = new Map<S, string>();

  const offline = () => [...entries.values()].filter((entry) => !entry.device.online);

  // Detaches the socket from its device, which goes offline with its last socket.
  const detach = (socket: S): boolean => {
    const client = clientOf.get(socket);
    if (client === undefined) return false;
    clientOf.delete(socket);
    const entry = entries.get(client);
    if (!entry) return false;
    entry.sockets.delete(socket);
    if (entry.sockets.size > 0) return false;
    entry.device = { ...entry.device, online: false, lastSeen: now() };
    const gone = offline();
    for (const oldest of gone.sort((a, b) => a.device.lastSeen! - b.device.lastSeen!).slice(0, Math.max(0, gone.length - MAX_OFFLINE_DEVICES))) {
      entries.delete(oldest.device.client);
    }
    return true;
  };

  return {
    hello(socket, role, { client, name, battery }) {
      const previous = clientOf.get(socket);
      const moved = previous !== undefined && previous !== client && detach(socket);
      const device: Device = { client, name, role, battery, online: true, lastSeen: null };
      const entry = entries.get(client);
      const changed = moved || !entry || JSON.stringify(entry.device) !== JSON.stringify(device);
      if (entry) entry.device = device;
      else entries.set(client, { device, sockets: new Set<S>() });
      entries.get(client)!.sockets.add(socket);
      clientOf.set(socket, client);
      return changed;
    },
    leave: detach,
    clearOffline() {
      const gone = offline();
      for (const entry of gone) entries.delete(entry.device.client);
      return gone.length > 0;
    },
    sockets: (client) => [...(entries.get(client)?.sockets ?? [])],
    list: () => [...entries.values()].map((entry) => entry.device),
  };
}
