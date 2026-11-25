// The hub sends every client a heartbeat between snapshots, so a page can tell a socket that is open
// but dead (a Wi-Fi that dropped and came back while the screen stayed on) from one with nothing new
// to say. A page that hears nothing at all for SILENCE_MS takes its socket for dead and opens a fresh
// one.

// How often the hub sends the heartbeat, in milliseconds.
export const HEARTBEAT_MS = 2000;

// How long a page waits with nothing heard before it takes its socket for dead: about two heartbeats,
// with room for one that comes late on the stage Wi-Fi.
export const SILENCE_MS = 4500;

// The heartbeat as it goes on the wire. A snapshot has no top-level kind, so the two never collide.
export const HEARTBEAT = '{"kind":"heartbeat"}';

// True for a heartbeat frame, read before any parse, so a heartbeat is never taken for a snapshot.
export function isHeartbeat(data: unknown): boolean {
  return String(data) === HEARTBEAT;
}
