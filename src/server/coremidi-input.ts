import { Input, verifyLibraryLoaded } from '@julusian/midi/lazy';
import type { MidiInput } from './midi-input.ts';

// The production MIDI input: every CoreMIDI source on the laptop, through RtMidi. Only
// native-loaders.ts loads this module, by dynamic import, when main.ts asks, so no test and no other
// module ever loads the native package.
//
// The server often starts before the pedal is plugged in, so the sources are
// scanned again on a timer and a new one is opened as it appears. Sysex, MIDI clock and active
// sensing stay ignored, as RtMidi does by default, so a device that sends clock cannot flood the
// snapshot with monitor lines.

const RESCAN_MS = 3000;

// Throws when the native binding did not load. native-loaders.ts reports that on the setup screen.
export function startCoreMidiInput(): MidiInput {
  verifyLibraryLoaded();
  const listeners: ((bytes: number[]) => void)[] = [];
  // Open inputs by source, keyed by name and the name's place among sources of the same name, so two
  // pedals of one model are both opened.
  const open = new Map<string, Input>();

  const scan = () => {
    let names: string[];
    try {
      names = Input.getPortNames();
    } catch (error) {
      console.error('Setlist server: could not list the MIDI sources', error);
      return;
    }
    const seen = new Map<string, number>();
    const present = new Set<string>();
    names.forEach((name, index) => {
      const occurrence = seen.get(name) ?? 0;
      seen.set(name, occurrence + 1);
      const key = `${name}#${occurrence}`;
      present.add(key);
      if (open.has(key)) return;
      const input = new Input();
      try {
        input.ignoreTypes(true, true, true);
        input.on('message', (_deltaTime, message) => {
          for (const listener of listeners) listener([...message]);
        });
        input.openPort(index);
        open.set(key, input);
        console.log(`Setlist server: reading MIDI from ${name}`);
      } catch (error) {
        console.error(`Setlist server: could not open the MIDI source ${name}`, error);
        input.destroy();
      }
    });
    // A source that went away, such as an unplugged pedal, is closed, so it opens again on its return.
    for (const [key, input] of open) {
      if (present.has(key)) continue;
      input.destroy();
      open.delete(key);
    }
  };

  scan();
  const timer = setInterval(scan, RESCAN_MS);
  // The rescan alone never keeps the server running.
  timer.unref();

  return {
    state: { kind: 'ready' },
    onMessage: (listener) => void listeners.push(listener),
    async close() {
      clearInterval(timer);
      for (const input of open.values()) input.destroy();
      open.clear();
    },
  };
}
