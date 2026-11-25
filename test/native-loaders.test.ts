import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { loadAtemKind, openMidiInput } from '../src/server/native-loaders.ts';
import { manualMidiInput } from '../src/server/midi-input.ts';
import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeSwitcher } from './fake-switcher.ts';
import { fakeKind, fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// The loaders main.ts calls for the two native packages, each given a load in place of its dynamic
// import, so no test loads the ATEM library or the CoreMIDI binding.

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  vi.restoreAllMocks();
});

const GOOD_ATEM = { host: '192.168.10.240', pro: 1, camera: 2 };
const ATEM_LOG = 'Setlist server: could not load the ATEM library, so the ATEM does nothing';
const MIDI_LOG = 'Setlist server: could not open MIDI, so the foot pedal does nothing';
// The fake kind's section on port 4031, and the ATEM's good section: Pro on input 1, Camera on input 2.
const ATEM_AND_FAKE = resolve(import.meta.dirname, 'fixtures/connections/atem-and-fake.json');
const ONE_SONG: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - End', time: 40 },
];
const rowOf = (snapshot: ProducerSnapshot, name: string): Connection | undefined => snapshot.connections.find((row) => row.name === name);

describe('an ATEM library that fails to load', () => {
  it('gives an ATEM kind whose every section is disabled with the reason, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('no prebuild for this Mac');

    const kind = await loadAtemKind(() => Promise.reject(error));

    expect(kind.label).toBe('ATEM');
    expect(kind.create(GOOD_ATEM)).toEqual({ problems: ['The ATEM library could not be loaded: no prebuild for this Mac'] });
    expect(logged).toHaveBeenCalledWith(ATEM_LOG, error);
  });

  it('disables only the ATEM through the server, with the reason on its row and the setup screen, and the other target still starts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = fakeTarget({ name: 'fake', label: 'Fake' });
    const atem = await loadAtemKind(() => Promise.reject(new Error('no prebuild for this Mac')));
    rig = await startRig(ONE_SONG, { playing: false, position: 12 }, {
      connectionsConfig: ATEM_AND_FAKE,
      targetKinds: { fake: fakeKind(target), atem },
    });
    const producer = await rig.connectProducer();

    const snapshot = await producer.snapshot((snapshot) => loaded(snapshot) && rowOf(snapshot, 'fake')?.connection === 'online');

    const disabled = { name: 'atem', label: 'ATEM', configured: false, problems: ['The ATEM library could not be loaded: no prebuild for this Mac'], connection: 'offline' };
    expect(snapshot.connections).toMatchObject([{ name: 'fake', configured: true, connection: 'online' }, disabled]);
    expect(await rig.connectionsStatus()).toMatchObject({ config: 'loaded', problems: [], connections: [{ name: 'fake', configured: true }, disabled] });
  });

  it('shows a load failure that is not an Error as it was thrown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const kind = await loadAtemKind(() => Promise.reject('dlopen failed'));

    expect(kind.create(GOOD_ATEM)).toEqual({ problems: ['The ATEM library could not be loaded: dlopen failed'] });
  });
});

describe('an ATEM library that loads', () => {
  it('builds the ATEM target, with its Pro and Camera buttons, on the library\'s client, and logs nothing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const switcher = fakeSwitcher();
    const atemSwitcher = vi.fn(() => switcher);

    const kind = await loadAtemKind(async () => ({ atemSwitcher }));
    const made = kind.create(GOOD_ATEM);

    expect(kind.label).toBe('ATEM');
    expect('target' in made && made.target).toMatchObject({
      name: 'atem',
      label: 'ATEM',
      buttons: [
        { id: 'pro', label: 'Pro' },
        { id: 'camera', label: 'Camera' },
      ],
    });
    expect(atemSwitcher).toHaveBeenCalledTimes(1);
    if (!('target' in made)) throw new Error('the ATEM kind made no target');
    const statuses: string[] = [];
    await made.target.start({ status: (status) => void statuses.push(status), changedByHand() {}, movedOut() {}, state() {}, actedOn() {}, missed() {}, problem() {}, pick() {}, fileChanged() {} });
    expect(switcher).toMatchObject({ host: '192.168.10.240', connects: 1 });
    expect(statuses).toEqual(['online']);
    await made.target.stop();
    expect(switcher.closed).toBe(true);
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('the MIDI input', () => {
  it('is unavailable, with the reason on the setup screen, when the CoreMIDI adapter fails to load, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Cannot find module @julusian/midi');

    const input = await openMidiInput(() => Promise.reject(error));

    expect(input.state).toEqual({ kind: 'unavailable', message: 'Cannot find module @julusian/midi' });
    expect(logged).toHaveBeenCalledWith(MIDI_LOG, error);
  });

  it('is unavailable, with the reason, when the native binding did not load and starting the input throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('The native MIDI library is not loaded');
    const startCoreMidiInput = () => {
      throw error;
    };

    const input = await openMidiInput(async () => ({ startCoreMidiInput }));

    expect(input.state).toEqual({ kind: 'unavailable', message: 'The native MIDI library is not loaded' });
    expect(logged).toHaveBeenCalledWith(MIDI_LOG, error);
  });

  it('is the CoreMIDI input itself when it starts', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = manualMidiInput();

    const input = await openMidiInput(async () => ({ startCoreMidiInput: () => started }));

    expect(input).toBe(started);
    expect(logged).not.toHaveBeenCalled();
  });
});
