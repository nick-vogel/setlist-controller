import { readFile } from 'node:fs/promises';
import type { MidiMonitorEntry, PedalAction, PedalMapping, PedalStatus } from '../shared/setup.ts';
import { describeMidi, midiHex, type MidiInput } from './midi-input.ts';

// The leader's foot pedal: a config file read once at start maps each switch's MIDI message to an
// action, and every message in shows on the setup screen's MIDI monitor.
//
// The config file is JSON, keyed by switch:
//
//   { "switches": { "1": { "message": "B0 50 7F" }, "3": { "message": "B0 52 7F", "action": "next" } } }
//
// The message is the exact bytes as hex, as the monitor prints them. A pedal that alternates between
// messages on each press gets a list, and every message in it runs the switch's action:
//
//   { "switches": { "1": { "message": ["B0 50 7F", "B0 50 00"] } } }
//
// The action is optional and defaults by switch. Any problem rejects the whole file, so the pedal is
// either fully mapped or not at all, and the setup screen lists every problem.

export type PedalConfig = Pick<PedalStatus, 'configPath' | 'config' | 'problems' | 'mappings'>;

const DEFAULT_ACTIONS: Record<number, PedalAction> = { 1: 'loop', 2: 'next', 3: 'previous' };
const ACTIONS: readonly PedalAction[] = ['loop', 'next', 'previous'];
// The monitor keeps this many messages, the newest last.
const MONITOR_LENGTH = 20;

// Never throws: a missing or broken file is a status for the setup screen, not a reason to stop.
export async function loadPedalConfig(path: string | null): Promise<PedalConfig> {
  const none = (config: 'missing' | 'invalid', problem: string): PedalConfig => ({
    configPath: path,
    config,
    problems: [problem],
    mappings: [],
  });
  if (path === null) return none('missing', 'No pedal config file was given. The pedal does nothing.');

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return none('missing', `No pedal config file at ${path}. The pedal does nothing.`);
    }
    return none('invalid', `Could not read the pedal config file at ${path}: ${(error as Error).message}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return none('invalid', `The pedal config file at ${path} is not valid JSON: ${(error as Error).message}`);
  }

  const { problems, mappings } = parseConfig(value);
  if (problems.length > 0) return { configPath: path, config: 'invalid', problems, mappings: [] };
  return { configPath: path, config: 'loaded', problems: [], mappings };
}

function parseConfig(value: unknown): { problems: string[]; mappings: PedalMapping[] } {
  const switches = isObject(value) ? value.switches : undefined;
  if (!isObject(switches)) {
    return { problems: ['The pedal config file needs a "switches" object, such as { "switches": { "1": { "message": "B0 50 7F" } } }.'], mappings: [] };
  }

  const problems: string[] = [];
  const mappings: PedalMapping[] = [];
  const claims: { switch: number; message: string }[] = [];
  for (const [key, entry] of Object.entries(switches)) {
    const number = Number(key);
    if (!Object.hasOwn(DEFAULT_ACTIONS, key)) {
      problems.push(`"${key}" is not a pedal switch. Only switches 1, 2 and 3 can be mapped.`);
      continue;
    }
    if (!isObject(entry)) {
      problems.push(`Switch ${number} needs a message, such as { "message": "B0 50 7F" }.`);
      continue;
    }

    const action = entry.action ?? DEFAULT_ACTIONS[number];
    if (typeof action === 'string' && action.trim().toLowerCase() === 'stop') {
      problems.push(`Switch ${number} is mapped to Stop. Stop can never be on the pedal, so the pedal config is not used.`);
    } else if (!ACTIONS.includes(action as PedalAction)) {
      problems.push(`Switch ${number}'s action ${JSON.stringify(action)} is not one of "loop", "next" and "previous".`);
    }

    const parsed = parseMessage(number, entry.message);
    problems.push(...parsed.problems);
    for (const message of new Set(parsed.valid)) claims.push({ switch: number, message });

    if (parsed.message && ACTIONS.includes(action as PedalAction)) {
      mappings.push({ switch: number, message: parsed.message, action: action as PedalAction });
    }
  }

  // Every valid message of every switch, list or not, so a message on two switches through a list
  // is caught whether or not either switch has another problem.
  for (const [index, claim] of claims.entries()) {
    const earlier = claims.slice(0, index).find((other) => other.message === claim.message);
    if (earlier) {
      problems.push(`Switches ${earlier.switch} and ${claim.switch} both send ${claim.message}. Each switch needs its own message.`);
    }
  }

  return { problems, mappings: mappings.sort((a, b) => a.switch - b.switch) };
}

// One switch's message: a string, or a list of them. The message is null when there is any problem
// with it; valid holds each entry that parsed, for the check across switches.
function parseMessage(number: number, value: unknown): { message: string | string[] | null; problems: string[]; valid: string[] } {
  const notHex = (entry: unknown) =>
    `Switch ${number}'s message ${JSON.stringify(entry ?? null)} is not one to three hex bytes, such as "B0 50 7F".`;

  if (!Array.isArray(value)) {
    const message = typeof value === 'string' ? parseHex(value) : null;
    return message ? { message, problems: [], valid: [message] } : { message: null, problems: [notHex(value)], valid: [] };
  }

  if (value.length === 0) {
    return {
      message: null,
      problems: [`Switch ${number}'s message list is empty. List one message or more, such as ["B0 50 7F", "B0 50 00"].`],
      valid: [],
    };
  }

  const problems: string[] = [];
  const valid: string[] = [];
  for (const entry of value as unknown[]) {
    const message = typeof entry === 'string' ? parseHex(entry) : null;
    if (!message) {
      problems.push(notHex(entry));
    } else if (valid.includes(message)) {
      if (!problems.includes(twice(number, message))) problems.push(twice(number, message));
    } else {
      valid.push(message);
    }
  }
  return { message: problems.length > 0 ? null : valid, problems, valid };
}

const twice = (number: number, message: string) => `Switch ${number} lists ${message} twice. Each message goes in the list once.`;

// The message in the monitor's own form, "B0 50 7F", or null when it is not one to three hex bytes.
function parseHex(text: string): string | null {
  const bytes = text.trim().split(/\s+/);
  if (bytes.length < 1 || bytes.length > 3 || !bytes.every((byte) => /^[0-9a-f]{2}$/i.test(byte))) return null;
  return bytes.join(' ').toUpperCase();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The status is read when the setup screen asks for it. A message in pushes nothing to any page.
export type Pedal = {
  status(): PedalStatus;
};

export function startPedal({
  input,
  config,
  onAction,
}: {
  input: MidiInput;
  config: PedalConfig;
  // Called for a mapped message, after the monitor has it.
  onAction(action: PedalAction): void;
}): Pedal {
  let monitor: MidiMonitorEntry[] = [];
  let count = 0;

  input.onMessage((bytes) => {
    if (bytes.length === 0) return;
    const message = midiHex(bytes);
    // An exact match on the message, or on any message in a switch's list.
    const action = config.mappings.find((mapping) => [mapping.message].flat().includes(message))?.action ?? null;
    count += 1;
    monitor = [...monitor, { id: count, message, description: describeMidi(bytes), action }].slice(-MONITOR_LENGTH);
    if (action) onAction(action);
  });

  return {
    status: () => ({ ...config, input: input.state, monitor }),
  };
}
