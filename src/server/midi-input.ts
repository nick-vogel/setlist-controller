import type { MidiInputState } from '../shared/setup.ts';

// Where the server reads the foot pedal from. Production reads CoreMIDI (coremidi-input.ts, loaded by
// native-loaders.ts alone, for main.ts); tests feed messages by hand through manualMidiInput().
export type MidiInput = {
  readonly state: MidiInputState;
  // Each message's bytes, such as [0xb0, 0x50, 0x7f].
  onMessage(listener: (bytes: number[]) => void): void;
  close(): Promise<void>;
};

export type ManualMidiInput = MidiInput & {
  // Delivers a message as the pedal would.
  send(bytes: number[]): void;
};

export function manualMidiInput(): ManualMidiInput {
  const listeners: ((bytes: number[]) => void)[] = [];
  return {
    state: { kind: 'ready' },
    onMessage: (listener) => void listeners.push(listener),
    send(bytes) {
      for (const listener of listeners) listener([...bytes]);
    },
    close: async () => {},
  };
}

// No MIDI input at all, as in development and in a server started with none.
export const noMidiInput: MidiInput = { state: { kind: 'none' }, onMessage: () => {}, close: async () => {} };

// An input that delivers nothing, and says why on the setup screen.
export function unavailableMidiInput(message: string): MidiInput {
  return { state: { kind: 'unavailable', message }, onMessage: () => {}, close: async () => {} };
}

// A message's bytes as the monitor prints them and the config file takes them, such as "B0 50 7F".
export function midiHex(bytes: readonly number[]): string {
  return bytes.map((byte) => (byte & 0xff).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

// A message in words, such as "Control change 80, value 127, channel 1".
export function describeMidi(bytes: readonly number[]): string {
  const [status = 0, first, second] = bytes;
  if (status >= 0xf0) return 'System message';
  const channel = `channel ${(status & 0x0f) + 1}`;
  const two = (kind: string, value: string) =>
    first === undefined || second === undefined ? `Incomplete ${kind.toLowerCase()} message` : `${kind} ${first}, ${value} ${second}, ${channel}`;
  const one = (kind: string) => (first === undefined ? `Incomplete ${kind.toLowerCase()} message` : `${kind} ${first}, ${channel}`);
  switch (status & 0xf0) {
    case 0x80:
      return two('Note off', 'velocity');
    case 0x90:
      return two('Note on', 'velocity');
    case 0xa0:
      return two('Key pressure', 'pressure');
    case 0xb0:
      return two('Control change', 'value');
    case 0xc0:
      return one('Program change');
    case 0xd0:
      return one('Channel pressure');
    case 0xe0:
      return first === undefined || second === undefined
        ? 'Incomplete pitch bend message'
        : `Pitch bend ${(second << 7) | first}, ${channel}`;
    default:
      return 'Not a MIDI message';
  }
}
