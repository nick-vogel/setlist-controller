import { atemKind } from './atem.ts';
import type { TargetKind } from './connections-config.ts';
import { unavailableMidiInput, type MidiInput } from './midi-input.ts';

// The loaders for the two native packages, the ATEM library and the CoreMIDI binding. main.ts hands
// them to startUp (start-up.ts), and tests call them with a stand-in load. Each takes its dynamic
// import as a parameter, so a test can make the load fail, or hand over a fake, without loading the
// native package; the default is the real import. Type-only imports keep this module itself clear of
// both packages.

// The CoreMIDI adapter loads here alone, so the server module and every test stay clear of the native
// package. A laptop whose MIDI cannot be opened still runs the server: the iPad drives Live, and the
// setup screen says why the pedal does nothing.
export async function openMidiInput(
  load: () => Promise<Pick<typeof import('./coremidi-input.ts'), 'startCoreMidiInput'>> = () => import('./coremidi-input.ts'),
): Promise<MidiInput> {
  try {
    const { startCoreMidiInput } = await load();
    return startCoreMidiInput();
  } catch (error) {
    console.error('Setlist server: could not open MIDI, so the foot pedal does nothing', error);
    return unavailableMidiInput(error instanceof Error ? error.message : String(error));
  }
}

// The ATEM library loads here alone, as the CoreMIDI adapter does, so the server module and every
// test stay clear of its native package. A library that fails to load disables the ATEM alone, with
// the reason on its row, and every other target starts.
export async function loadAtemKind(
  load: () => Promise<Pick<typeof import('./atem-switcher.ts'), 'atemSwitcher'>> = () => import('./atem-switcher.ts'),
): Promise<TargetKind> {
  try {
    const { atemSwitcher } = await load();
    return atemKind({ client: () => atemSwitcher() });
  } catch (error) {
    console.error('Setlist server: could not load the ATEM library, so the ATEM does nothing', error);
    const reason = error instanceof Error ? error.message : String(error);
    return { label: 'ATEM', create: () => ({ problems: [`The ATEM library could not be loaded: ${reason}`] }) };
  }
}
