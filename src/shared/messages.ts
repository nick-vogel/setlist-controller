import { isClientId } from './devices.ts';

// A message from the producer page to the band's devices, shown as a banner at the top of each page
// it reaches until the device dismisses it, the producer sends a newer one, or the producer clears
// it. The hub keeps the active message for each device (src/server/messages.ts) and sends it on its
// own frame, ahead of the next snapshot. A device keeps the IDs it dismissed in its own storage
// (web/src/device-settings.ts), so a message it dismissed stays hidden across reloads and reconnects.

// The hub makes each ID, new for every send, so an ID a device dismissed never names a later message,
// even after a server restart.
export type BandMessage = { id: string; text: string };

// Who a message reaches: every page, every view-only page, or the devices with these client IDs. A
// device takes its role from its socket (src/server/hub.ts), never from its last hello.
export type MessageTarget = 'all' | 'viewers' | string[];

// The longest message text the hub keeps. A longer one is cut, never refused, as a device name is.
export const MAX_MESSAGE_TEXT = 120;

// The quick messages on the producer page, one tap each to fill the text box.
export const MESSAGE_PRESETS = ['Repeat chorus', 'Repeat bridge', 'Hold after this song', 'Watch leader'] as const;

// The message text as the hub keeps it, or null for text that is not a string or holds only spaces,
// since the banner would show blank.
export function messageText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, MAX_MESSAGE_TEXT).trim();
  return text === '' ? null : text;
}

// The target as the hub reads it, or null for anything else. A list names each client ID once, and
// an empty list reaches nobody, so it is no target.
export function messageTarget(value: unknown): MessageTarget | null {
  if (value === 'all' || value === 'viewers') return value;
  if (!Array.isArray(value) || value.length === 0 || !value.every(isClientId)) return null;
  return [...new Set(value)];
}

// The frame that carries a device its active message, or null when it has none. A snapshot has no
// top-level kind, so the two never collide.
export function messageFrame(message: BandMessage | null): string {
  return JSON.stringify({ kind: 'message', message });
}

const FRAME_START = '{"kind":"message",';

// True for a message frame. It reads the frame's start alone, so no snapshot is parsed twice.
export function isMessageFrame(data: unknown): boolean {
  return String(data).startsWith(FRAME_START);
}

// The message a message frame carries, null for one that clears it, and undefined for anything that
// is not a well-formed message frame.
export function readMessageFrame(data: unknown): BandMessage | null | undefined {
  if (!isMessageFrame(data)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(String(data));
  } catch {
    return undefined;
  }
  const { message } = value as { message?: unknown };
  if (message === null) return null;
  if (typeof message !== 'object' || message === undefined) return undefined;
  const { id, text } = message as Record<string, unknown>;
  if (typeof id !== 'string' || typeof text !== 'string') return undefined;
  return { id, text };
}
