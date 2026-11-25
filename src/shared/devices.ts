import type { Role } from './routes.ts';

// Every page but the setup screen introduces itself to the hub on each socket it opens, and again when
// its name or battery changes: the client ID it keeps in the browser's storage, the name the device
// goes by, and its battery. The hub keeps a registry of them by client ID (src/server/devices.ts), and
// the producer page and the setup screen list it. The socket decides the role, never the hello, so a
// band phone cannot list itself as the producer.

// A client ID, as the page makes it (web/src/device-settings.ts): letters, digits and dashes.
export function isClientId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(value);
}

// Each role as a device's row names it, and as a device with no name typed goes by.
export const ROLE_LABELS: Record<Role, string> = { leader: 'Leader', producer: 'Producer', viewer: 'View only' };

// The longest device name the hub keeps. A longer one is cut, never refused, so a page always shows.
export const MAX_DEVICE_NAME = 40;

export type DeviceHello = {
  kind: 'hello';
  client: string;
  name: string;
  // Percent charged, 0 to 100, or null where the browser does not report it.
  battery: number | null;
};

// One device on the producer page's Devices panel and the setup screen's.
export type Device = {
  client: string;
  name: string;
  // The role of the socket the device last introduced itself on.
  role: Role;
  battery: number | null;
  online: boolean;
  // When its last socket closed, in milliseconds since the epoch, or null while it is online.
  lastSeen: number | null;
};

// Null for anything that is not a well-formed hello, so a bad message never throws. A name of only
// spaces is no name, since the device's row would show blank.
export function parseHello(data: unknown): DeviceHello | null {
  let value: unknown;
  try {
    value = JSON.parse(String(data));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { kind, client, name, battery } = value as Record<string, unknown>;
  if (kind !== 'hello' || !isClientId(client) || typeof name !== 'string') return null;
  const trimmed = name.trim().slice(0, MAX_DEVICE_NAME).trim();
  if (trimmed === '') return null;
  const percent = Number.isInteger(battery) && (battery as number) >= 0 && (battery as number) <= 100 ? (battery as number) : null;
  return { kind, client, name: trimmed, battery: percent };
}

// What the hub sends the one page the producer reloads. A snapshot has no top-level kind, so the two
// never collide.
export const RELOAD = '{"kind":"reload"}';

// True for a reload frame, read before any parse, so a reload is never taken for a snapshot.
export function isReload(data: unknown): boolean {
  return String(data) === RELOAD;
}
