// What the setup screen asks the server for: how a device joins, as a URL and a QR code per page,
// the foot pedal's status, and the connection targets' status. The server answers the laptop alone.

import type { Command } from './command.ts';
import type { Connection } from './snapshot.ts';

export type JoinLink = {
  // The URL in the QR code.
  url: string;
  // Every form of the URL, for the text under the code.
  urls: string[];
  // The code's modules, rows from the top, true for dark. The quiet zone around it is included.
  qr: boolean[][];
};

export type SetupInfo = {
  leader: JoinLink;
  producer: JoinLink;
  view: JoinLink;
};

// What a pedal switch can do. Stop is not one of them, so no pedal path can stop Live.
export type PedalAction = Extract<Command['kind'], 'loop' | 'next' | 'previous'>;

// Where the server reads MIDI from. None when the server was started with no MIDI input, as in
// development; unavailable when the laptop's MIDI could not be opened.
export type MidiInputState = { kind: 'ready' } | { kind: 'none' } | { kind: 'unavailable'; message: string };

// One switch's mapping in force. The message is its exact bytes as hex, such as "B0 50 7F", or a
// list of them, in the file's form, for a pedal that alternates between messages on each press.
// Every message in a list runs the action.
export type PedalMapping = { switch: number; message: string | string[]; action: PedalAction };

// One line of the MIDI monitor. The id counts up from 1 for every message, so a repeated press
// still reads as a new line.
export type MidiMonitorEntry = {
  id: number;
  // The bytes as hex, such as "B0 50 7F", as the config file takes them.
  message: string;
  // Such as "Control change 80, value 127, channel 1".
  description: string;
  // The action the message ran, or null for an unmapped message.
  action: PedalAction | null;
};

export type PedalStatus = {
  // The config file the server read at start, or null when it was given none.
  configPath: string | null;
  // Missing: no file, so no mapping. Invalid: the file was rejected whole, so no mapping.
  config: 'loaded' | 'missing' | 'invalid';
  // Each problem with the config, as a sentence for the setup screen.
  problems: string[];
  // Empty unless the config loaded.
  mappings: PedalMapping[];
  input: MidiInputState;
  // The last MIDI messages in, oldest first.
  monitor: MidiMonitorEntry[];
};

// What the server made of the connections config file, and every target's row.
export type ConnectionsStatus = {
  // The config file the server read at start, or null when it was given none.
  configPath: string | null;
  // Missing: no file, so no targets. Invalid: the file itself was rejected, so no targets.
  config: 'loaded' | 'missing' | 'invalid';
  // The file's own problems. A target's problems sit on its row.
  problems: string[];
  // One row per target, as the producer's panel has them, the disabled ones included.
  connections: Connection[];
};
