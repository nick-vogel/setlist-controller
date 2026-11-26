import { END_TOGGLES, type EndToggle, type SectionAddress } from './snapshot.ts';

// What the leader's page sends the server. Only a control connection's commands reach the core.

export type Command =
  // Jump to a section.
  | ({ kind: 'jump' } & SectionAddress)
  // Jump to a song's first locator and play from there.
  | { kind: 'play-from-start'; song: number }
  // While Live is stopped, play the song's Count Off and land on a section of it on the bar line where
  // the Count Off ends (count-in.ts).
  | ({ kind: 'count-in' } & SectionAddress)
  // Stop Live.
  | { kind: 'stop' }
  // Set what happens at a song's End.
  | { kind: 'set-end-toggle'; song: number; toggle: EndToggle }
  // Turn server-wide Safe Mode on or off.
  | { kind: 'set-safe-mode'; enabled: boolean }
  // Loop the current section, or release the loop when one is on.
  | { kind: 'loop' }
  // Jump to the next section in the current song, or to its End from its last section.
  | { kind: 'next' }
  // Jump to the previous section in the current song, or back to the start of its first section.
  | { kind: 'previous' }
  // Read the set from Live again, at once.
  | { kind: 'refresh' }
  // Fade the music to silence over 6 seconds. Live plays on.
  | { kind: 'fade-out' }
  // Fade the music back in from silence over 6 seconds.
  | { kind: 'fade-in' };

// Null for anything that is not a well-formed command, so a bad message never throws.
export function parseCommand(data: unknown): Command | null {
  let value: unknown;
  try {
    value = JSON.parse(String(data));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { kind, song, section, toggle, enabled } = value as Record<string, unknown>;
  // A count-in names a section, never a song's End, which is not one.
  if ((kind === 'jump' || kind === 'count-in') && Number.isInteger(song) && Number.isInteger(section)) {
    return { kind, song: song as number, section: section as number };
  }
  if (kind === 'play-from-start' && Number.isInteger(song)) {
    return { kind, song: song as number };
  }
  if (kind === 'stop' || kind === 'loop' || kind === 'next' || kind === 'previous' || kind === 'refresh' || kind === 'fade-out' || kind === 'fade-in') {
    return { kind };
  }
  if (kind === 'set-end-toggle' && Number.isInteger(song) && END_TOGGLES.includes(toggle as EndToggle)) {
    return { kind, song: song as number, toggle: toggle as EndToggle };
  }
  if (kind === 'set-safe-mode' && typeof enabled === 'boolean') {
    return { kind, enabled };
  }
  return null;
}

// The producer's commands for the connection targets, by the target's name. Only a producer socket's
// messages are read as one, and they never reach the playback controller.
export type ConnectionCommand =
  | { kind: 'arm'; target: string }
  | { kind: 'disarm'; target: string }
  // Send the current section's cue to the target again, whatever its arm state.
  | { kind: 'fire-again'; target: string }
  // Run one of the target's own manual buttons, by its id, whatever its arm state.
  | { kind: 'run-button'; target: string; button: string }
  // Pick one of the choices the target offers, by its id, such as ProPresenter's playlist.
  | { kind: 'pick'; target: string; choice: string };

// The producer's commands for the devices on the Devices panel. Only a producer socket's messages are
// read as one.
export type DeviceCommand =
  // Reload the pages of the device with this client ID.
  | { kind: 'reload'; client: string }
  // Forget every device that is offline.
  | { kind: 'clear-offline' };

// What a page sends: a leader page sends a Command, a producer page any of the three.
export type PageCommand = Command | ConnectionCommand | DeviceCommand;

// Null for anything that is not a well-formed connection command, so a bad message never throws.
export function parseConnectionCommand(data: unknown): ConnectionCommand | null {
  let value: unknown;
  try {
    value = JSON.parse(String(data));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { kind, target, button, choice } = value as Record<string, unknown>;
  if (typeof target !== 'string') return null;
  if (kind === 'arm' || kind === 'disarm' || kind === 'fire-again') return { kind, target };
  if (kind === 'run-button' && typeof button === 'string') return { kind, target, button };
  if (kind === 'pick' && typeof choice === 'string') return { kind, target, choice };
  return null;
}

// Null for anything that is not a well-formed device command, so a bad message never throws.
export function parseDeviceCommand(data: unknown): DeviceCommand | null {
  let value: unknown;
  try {
    value = JSON.parse(String(data));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { kind, client } = value as Record<string, unknown>;
  if (kind === 'reload' && typeof client === 'string') return { kind, client };
  if (kind === 'clear-offline') return { kind };
  return null;
}
