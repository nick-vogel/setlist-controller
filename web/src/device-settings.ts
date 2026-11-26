import { MAX_CAPO } from '../../src/shared/chart.ts';
import { isClientId, MAX_DISMISSED_MESSAGES, ROLE_LABELS } from '../../src/shared/devices.ts';
import { nameKey } from '../../src/shared/match-name.ts';
import type { Role } from '../../src/shared/routes.ts';

// What a band member's device remembers between visits, in the browser's own storage: no account and
// nothing on the server. The part comes first; later settings take keys of their own beside it. A
// device that cannot store, such as Safari in private mode, just does not remember.

export const PARTS = ['Keys', 'Guitar', 'Bass', 'Vocals', 'Drums'] as const;

export type Part = (typeof PARTS)[number];

// The part of the browser's localStorage the settings use, so a test can hand in its own.
export type DeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PART_KEY = 'setlist-controller.part';

// The stored part, or null for no part: nothing stored, a value that is not a part, or no storage.
export function readPart(storage: DeviceStorage | undefined): Part | null {
  try {
    const value = storage?.getItem(PART_KEY);
    return PARTS.find((part) => part === value) ?? null;
  } catch {
    return null;
  }
}

// Stores the part, or forgets it for No part.
export function storePart(storage: DeviceStorage | undefined, part: Part | null): void {
  try {
    if (part === null) storage?.removeItem(PART_KEY);
    else storage?.setItem(PART_KEY, part);
  } catch {
    // A device that cannot store keeps the part for this visit only.
  }
}

// How the chart view draws a song's lines: the chords over the lyrics, the lyrics alone, or the section
// map of each block's name and bar count with no lines.
export const DISPLAYS = [
  { value: 'chords-over-lyrics', label: 'Chords over lyrics' },
  { value: 'lyrics-only', label: 'Lyrics only' },
  { value: 'section-map', label: 'Section map' },
] as const;

export type Display = (typeof DISPLAYS)[number]['value'];

// The display a part opens on until the device picks another for it.
export function defaultDisplay(part: Part): Display {
  if (part === 'Vocals') return 'lyrics-only';
  if (part === 'Drums') return 'section-map';
  return 'chords-over-lyrics';
}

// One key per part, so a device shared between parts keeps each part's own display.
const displayKey = (part: Part) => `setlist-controller.display.${part}`;

// The display stored for the part, else the part's default: nothing stored, a value that is not a
// display, or no storage.
export function readDisplay(storage: DeviceStorage | undefined, part: Part): Display {
  try {
    const value = storage?.getItem(displayKey(part));
    return DISPLAYS.find((display) => display.value === value)?.value ?? defaultDisplay(part);
  } catch {
    return defaultDisplay(part);
  }
}

// Stores the display for the part.
export function storeDisplay(storage: DeviceStorage | undefined, part: Part, display: Display): void {
  try {
    storage?.setItem(displayKey(part), display);
  } catch {
    // A device that cannot store keeps the display for this visit only.
  }
}

// How the chart view lays out the set: the song the playhead is in, which changes song when the next
// song starts, or every song one after the next. One key for the device, whatever the part.
export const VIEWS = [
  { value: 'song', label: 'This song' },
  { value: 'set', label: 'Whole set' },
] as const;

export type View = (typeof VIEWS)[number]['value'];

const VIEW_KEY = 'setlist-controller.view';

// The stored view, else This song: nothing stored, a value that is not a view, or no storage.
export function readView(storage: DeviceStorage | undefined): View {
  try {
    const value = storage?.getItem(VIEW_KEY);
    return VIEWS.find((view) => view.value === value)?.value ?? 'song';
  } catch {
    return 'song';
  }
}

export function storeView(storage: DeviceStorage | undefined, view: View): void {
  try {
    storage?.setItem(VIEW_KEY, view);
  } catch {
    // A device that cannot store keeps the view for this visit only.
  }
}

// The chart text's size in steps, each a scale on the chart's own text sizes, so a phone can read it
// small and a stand far off. The selects and the panels keep their size. One key for the device.
export const FONT_SIZES = [
  { value: 'small', label: 'Small', scale: 0.85 },
  { value: 'medium', label: 'Medium', scale: 1 },
  { value: 'large', label: 'Large', scale: 1.25 },
  { value: 'larger', label: 'Larger', scale: 1.5 },
  { value: 'largest', label: 'Largest', scale: 2 },
] as const;

export type FontSize = (typeof FONT_SIZES)[number]['value'];

const FONT_SIZE_KEY = 'setlist-controller.font-size';

// The stored font size, else Medium: nothing stored, a value that is not a step, or no storage.
export function readFontSize(storage: DeviceStorage | undefined): FontSize {
  try {
    const value = storage?.getItem(FONT_SIZE_KEY);
    return FONT_SIZES.find((size) => size.value === value)?.value ?? 'medium';
  } catch {
    return 'medium';
  }
}

export function storeFontSize(storage: DeviceStorage | undefined, size: FontSize): void {
  try {
    storage?.setItem(FONT_SIZE_KEY, size);
  } catch {
    // A device that cannot store keeps the font size for this visit only.
  }
}

// That the device has shown the Auto-Lock tip, which it shows once.
const TIP_KEY = 'setlist-controller.auto-lock-tip';

// Whether the device has shown the tip. A device whose storage cannot be read counts it shown, so a
// phone that cannot store, such as Safari in private mode, never shows it on every open.
export function readTipShown(storage: DeviceStorage | undefined): boolean {
  try {
    return storage ? storage.getItem(TIP_KEY) !== null : true;
  } catch {
    return true;
  }
}

export function storeTipShown(storage: DeviceStorage | undefined): void {
  try {
    storage?.setItem(TIP_KEY, 'shown');
  } catch {
    // A device that cannot store shows the tip again at its next open.
  }
}

// How the chart view names a chord: by its letters, or by its Nashville number from the stems key's
// tonic. One key for the device, whatever the part.
export const CHORD_NAMES = [
  { value: 'letters', label: 'Letters' },
  { value: 'numbers', label: 'Nashville numbers' },
] as const;

export type ChordNames = (typeof CHORD_NAMES)[number]['value'];

const CHORD_NAMES_KEY = 'setlist-controller.chord-names';

// The stored chord names, else Letters: nothing stored, a value that is not a choice, or no storage.
export function readChordNames(storage: DeviceStorage | undefined): ChordNames {
  try {
    const value = storage?.getItem(CHORD_NAMES_KEY);
    return CHORD_NAMES.find((choice) => choice.value === value)?.value ?? 'letters';
  } catch {
    return 'letters';
  }
}

export function storeChordNames(storage: DeviceStorage | undefined, chordNames: ChordNames): void {
  try {
    storage?.setItem(CHORD_NAMES_KEY, chordNames);
  } catch {
    // A device that cannot store keeps the chord names for this visit only.
  }
}

// The capos the chart view offers on a song, 0 for no capo.
export const CAPOS = Array.from({ length: MAX_CAPO + 1 }, (_, capo) => capo);

// One key per song, by its title as the name rule reads it, so a title typed in other case or spacing
// keeps its capo.
const capoKey = (title: string) => `setlist-controller.capo.${nameKey(title)}`;

// The capo stored for the song, else no capo: nothing stored, a value that is not 1 to 7, or no
// storage.
export function readCapo(storage: DeviceStorage | undefined, title: string): number {
  try {
    const value = storage?.getItem(capoKey(title));
    return CAPOS.find((capo) => capo > 0 && String(capo) === value) ?? 0;
  } catch {
    return 0;
  }
}

// Stores the capo for the song, or forgets it for no capo.
export function storeCapo(storage: DeviceStorage | undefined, title: string, capo: number): void {
  try {
    if (capo === 0) storage?.removeItem(capoKey(title));
    else storage?.setItem(capoKey(title), String(capo));
  } catch {
    // A device that cannot store keeps the capo for this visit only.
  }
}

// Which view the leader page opens on: the Sunday Setlist view (default), or the whole-set
// scrolling Timeline view for rehearsal. One key for the device; the producer page ignores it.
export const LEADER_VIEWS = [
  { value: 'setlist', label: 'Setlist' },
  { value: 'timeline', label: 'Timeline' },
] as const;

export type LeaderView = (typeof LEADER_VIEWS)[number]['value'];

const LEADER_VIEW_KEY = 'setlist-controller.leader-view';

// The stored leader view, else Setlist: nothing stored, a value that is not a leader view, or no
// storage.
export function readLeaderView(storage: DeviceStorage | undefined): LeaderView {
  try {
    const value = storage?.getItem(LEADER_VIEW_KEY);
    return LEADER_VIEWS.find((choice) => choice.value === value)?.value ?? 'setlist';
  } catch {
    return 'setlist';
  }
}

export function storeLeaderView(storage: DeviceStorage | undefined, view: LeaderView): void {
  try {
    storage?.setItem(LEADER_VIEW_KEY, view);
  } catch {
    // A device that cannot store keeps the leader view for this visit only.
  }
}

// The ID the hub knows the device by (src/shared/devices.ts), made on its first visit and kept, so the
// producer's Devices panel shows one row for it across reloads and reconnects. One for each page role:
// a browser holding the producer page and a leader page is two devices, and its tabs of one role share
// one.
const CLIENT_ID_KEY = 'setlist-controller.client-id';

// 128 random bits as hex. getRandomValues, not randomUUID: a band phone joins over plain HTTP on the
// stage network, and randomUUID is only there in a secure context.
export function newClientId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The stored client ID, else a new one, stored: nothing stored, or a value the hub would refuse. A
// device that cannot store gets a new one for this visit.
export function readClientId(storage: DeviceStorage | undefined, role: Role, make: () => string = newClientId): string {
  const key = `${CLIENT_ID_KEY}.${role}`;
  try {
    const value = storage?.getItem(key);
    if (isClientId(value)) return value;
  } catch {
    // Made for this visit below.
  }
  const made = make();
  try {
    storage?.setItem(key, made);
  } catch {
    // A device that cannot store is a new device at its next visit.
  }
  return made;
}

// The name the device goes by on the Devices panel, as its user typed it. With none, it goes by its
// default, which follows the part picked until a name is typed.
const DEVICE_NAME_KEY = 'setlist-controller.device-name';

// The stored name, trimmed, or null for none: nothing stored, a blank value, or no storage.
export function readDeviceName(storage: DeviceStorage | undefined): string | null {
  try {
    const value = storage?.getItem(DEVICE_NAME_KEY)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

// Calls onName with the stored name each time another tab stores one or clears the storage, so every
// tab of the device goes by the name typed last. Returns the function that stops it.
export function watchDeviceName(page: EventTarget, storage: DeviceStorage | undefined, onName: (name: string | null) => void): () => void {
  const reread = (event: Event) => {
    const { key } = event as StorageEvent;
    if (key === DEVICE_NAME_KEY || key === null) onName(readDeviceName(storage));
  };
  page.addEventListener('storage', reread);
  return () => page.removeEventListener('storage', reread);
}

// Stores the name, or forgets it for a blank one, so the device goes by its default again.
export function storeDeviceName(storage: DeviceStorage | undefined, name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed === '') storage?.removeItem(DEVICE_NAME_KEY);
    else storage?.setItem(DEVICE_NAME_KEY, trimmed);
  } catch {
    // A device that cannot store keeps the name for this visit only.
  }
}

// The name a device goes by until its user types one: the leader's or the producer's role, else the
// band part picked, else View only.
export function defaultDeviceName(role: Role, part: Part | null): string {
  return role === 'viewer' && part !== null ? part : ROLE_LABELS[role];
}

// The IDs of the producer's messages the device dismissed, newest last, so a dismissed message stays
// hidden when the hub sends it again on the next hello. One list for each device, which is one for
// each page role, as the client ID is: a message to All devices carries one ID to every device, so a
// list for the browser would hide it on a page that never dismissed it.
const DISMISSED_MESSAGES_KEY = 'setlist-controller.dismissed-messages';

// The stored IDs, or none: nothing stored, a value that is not a list, or no storage. An entry that is
// not a string is left out.
export function readDismissedMessages(storage: DeviceStorage | undefined, role: Role): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(`${DISMISSED_MESSAGES_KEY}.${role}`) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// Calls onDismissed with the stored IDs each time another tab of the same page role stores one or
// clears the storage, so every tab of the device hides the message. Returns the function that stops
// it.
export function watchDismissedMessages(page: EventTarget, storage: DeviceStorage | undefined, role: Role, onDismissed: (ids: string[]) => void): () => void {
  const reread = (event: Event) => {
    const { key } = event as StorageEvent;
    if (key === `${DISMISSED_MESSAGES_KEY}.${role}` || key === null) onDismissed(readDismissedMessages(storage, role));
  };
  page.addEventListener('storage', reread);
  return () => page.removeEventListener('storage', reread);
}

export function storeDismissedMessage(storage: DeviceStorage | undefined, role: Role, id: string): void {
  try {
    const kept = [...readDismissedMessages(storage, role).filter((held) => held !== id), id].slice(-MAX_DISMISSED_MESSAGES);
    storage?.setItem(`${DISMISSED_MESSAGES_KEY}.${role}`, JSON.stringify(kept));
  } catch {
    // A device that cannot store shows the message again at its next open.
  }
}
