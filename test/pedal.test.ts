import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { PedalStatus } from '../src/shared/setup.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig, type RigOptions } from './harness.ts';

// The CoreMIDI adapter is production's alone. Loading the native package from any module a test
// reaches fails this file.
vi.mock('@julusian/midi', () => {
  throw new Error('A test loaded the CoreMIDI package');
});
vi.mock('@julusian/midi/lazy', () => {
  throw new Error('A test loaded the CoreMIDI package');
});

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const fixture = (name: string) => resolve(import.meta.dirname, 'fixtures/pedal', name);
const DEFAULT_CONFIG = fixture('default.json');
// The MIDI Commander's switches 1 to 3, each alternating between value 127 and value 0 on each press.
const LIST_CONFIG = fixture('list.json');

// Two songs in 4/4, listed out of time order as Live may report them, with two bars between them.
// A jump names a cue point by its place in this list.
const SET: CuePoint[] = [
  { name: '1 - Chorus', time: 32 },
  { name: '1 - Intro', time: 0 },
  { name: '2 - Intro', time: 72 },
  { name: '1 - End', time: 64 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Bridge', time: 48 },
  { name: '2 - End', time: 88 },
];
const VERSE = 1;
const BRIDGE = 3;
const CUES = { songOneIntro: 1, verse: 4, chorus: 0, bridge: 5, songOneEnd: 3 };

// The messages default.json maps, one per switch.
const SWITCH_1 = [0xb0, 0x50, 0x7f];
const SWITCH_2 = [0xb0, 0x51, 0x7f];
const SWITCH_3 = [0xb0, 0x52, 0x7f];

const JUMP = '/live/song/cue_point/jump';
const LOOP_START = '/live/song/set/loop_start';
const LOOP_LENGTH = '/live/song/set/loop_length';
const LOOP = '/live/song/set/loop';
const STOP = '/live/song/stop_playing';
const CONTINUE = '/live/song/continue_playing';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const looping = (section: number) => (snapshot: Snapshot) => snapshot.loop?.section?.section === section;
const monitorHas = (count: number) => (status: PedalStatus) => (status.monitor.at(-1)?.id ?? 0) >= count;

const jumpTo = (cue: number) => ({ address: JUMP, args: [cue], types: 'i' });
const loopTo = (on: 0 | 1) => ({ address: LOOP, args: [on], types: 'i' });

// Every message the fake Live has received that moves the playhead, the loop or the transport.
function controlMessages() {
  return (rig?.live.received ?? []).filter(
    (message) => message.address === JUMP || message.address.startsWith('/live/song/set/loop') || message.address === STOP || message.address === CONTINUE,
  );
}

// A leader jump leaves the server's one OSC socket after anything the pedal sent before it, so once
// Live has it, Live has everything the pedal could have sent.
async function leaderBarrier(leader: Client) {
  leader.send({ kind: 'jump', song: 1, section: BRIDGE });
  await vi.waitFor(() => expect(rig?.received(JUMP).at(-1)).toEqual(jumpTo(CUES.bridge)));
}

async function startPlaying(position: number, options: RigOptions = { pedalConfig: DEFAULT_CONFIG }) {
  rig = await startRig(SET, { playing: true, position }, options);
  const viewer = await rig.connectViewer();
  await viewer.snapshot(at(position));
  return { rig, viewer };
}

describe('switch 1', () => {
  it('turns the loop on over the current section, and a second press releases it', async () => {
    const { rig, viewer } = await startPlaying(21);

    rig.midi.send(SWITCH_1);

    await vi.waitFor(() =>
      expect(controlMessages()).toEqual([
        { address: LOOP_START, args: [16], types: 'f' },
        { address: LOOP_LENGTH, args: [16], types: 'f' },
        loopTo(1),
      ]),
    );
    await viewer.snapshot(looping(VERSE));

    rig.midi.send(SWITCH_1);

    await vi.waitFor(() => expect(controlMessages().at(-1)).toEqual(loopTo(0)));
  });
});

describe('a switch that alternates between two messages', () => {
  it('turns the loop on with the first message, and the second releases it', async () => {
    const { rig, viewer } = await startPlaying(21, { pedalConfig: LIST_CONFIG });

    rig.midi.send([0xb0, 0x50, 0x7f]);

    await vi.waitFor(() =>
      expect(controlMessages()).toEqual([
        { address: LOOP_START, args: [16], types: 'f' },
        { address: LOOP_LENGTH, args: [16], types: 'f' },
        loopTo(1),
      ]),
    );
    await viewer.snapshot(looping(VERSE));

    rig.midi.send([0xb0, 0x50, 0x00]);

    await vi.waitFor(() => expect(controlMessages().at(-1)).toEqual(loopTo(0)));
  });

  it('jumps one section forward for each message', async () => {
    // Stopped, so each jump lands at once in the fake Live, and Next counts from the section it
    // landed in, not from the one before it.
    rig = await startRig(SET, { playing: false, position: 21 }, { pedalConfig: LIST_CONFIG });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(21));

    rig.midi.send([0xb0, 0x51, 0x7f]);
    await viewer.snapshot(at(32));
    rig.midi.send([0xb0, 0x51, 0x00]);

    await vi.waitFor(() => expect(controlMessages()).toEqual([jumpTo(CUES.chorus), jumpTo(CUES.bridge)]));
  });
});

describe('switch 2', () => {
  it('jumps to the next section', async () => {
    const { rig } = await startPlaying(21);

    rig.midi.send(SWITCH_2);

    await vi.waitFor(() => expect(controlMessages()).toEqual([jumpTo(CUES.chorus)]));
  });

  it("jumps to the song's End on its last section, as the leader page's Next does", async () => {
    const { rig } = await startPlaying(53);

    rig.midi.send(SWITCH_2);

    await vi.waitFor(() => expect(controlMessages()).toEqual([jumpTo(CUES.songOneEnd)]));
  });

  it('releases the loop before it jumps, as the leader page does', async () => {
    const { rig, viewer } = await startPlaying(21);
    rig.midi.send(SWITCH_1);
    await viewer.snapshot(looping(VERSE));

    rig.midi.send(SWITCH_2);

    await vi.waitFor(() => expect(controlMessages().slice(3)).toEqual([loopTo(0), jumpTo(CUES.chorus)]));
  });
});

describe('switch 3', () => {
  it('jumps to the previous section', async () => {
    const { rig } = await startPlaying(37);

    rig.midi.send(SWITCH_3);

    await vi.waitFor(() => expect(controlMessages()).toEqual([jumpTo(CUES.verse)]));
  });

  it("jumps back to the start of a song's first section", async () => {
    const { rig } = await startPlaying(5);

    rig.midi.send(SWITCH_3);

    await vi.waitFor(() => expect(controlMessages()).toEqual([jumpTo(CUES.songOneIntro)]));
  });
});

describe('an unmapped message', () => {
  it('changes nothing in Live and nothing on any page, and shows on the MIDI monitor', async () => {
    const { rig, viewer } = await startPlaying(21);
    const leader = await rig.connectLeader();
    const before = viewer.received.length;

    // Switch 1's release, and switch 1's press on channel 2.
    rig.midi.send([0xb0, 0x50, 0x00]);
    rig.midi.send([0xb1, 0x50, 0x7f]);

    const status = await rig.pedal(monitorHas(2));
    expect(status.monitor.map((entry) => entry.action)).toEqual([null, null]);
    await viewer.flush();
    expect(viewer.received).toHaveLength(before);
    await leaderBarrier(leader);
    expect(controlMessages()).toEqual([jumpTo(CUES.bridge)]);
  });
});

describe('Stop and the pedal', () => {
  it('rejects a config that maps a switch to Stop, and keeps every switch unmapped', async () => {
    const { rig } = await startPlaying(21, { pedalConfig: fixture('stop.json') });

    const pedal = await rig.pedal();
    expect(pedal.config).toBe('invalid');
    expect(pedal.problems).toEqual(['Switch 2 is mapped to Stop. Stop can never be on the pedal, so the pedal config is not used.']);
    expect(pedal.mappings).toEqual([]);

    const leader = await rig.connectLeader();
    for (const message of [SWITCH_1, SWITCH_2, SWITCH_3]) rig.midi.send(message);
    await rig.pedal(monitorHas(3));
    await leaderBarrier(leader);
    expect(controlMessages()).toEqual([jumpTo(CUES.bridge)]);
  });

  it('never sends stop_playing for any channel message on any channel', async () => {
    // The fake Live's playhead moves only when the test moves it, so it stays in the Verse, well
    // short of the End, and the End's own auto-stop cannot fire.
    const { rig } = await startPlaying(21);
    const values = [0, 1, 64, 127, 0x50, 0x51, 0x52];
    let sent = 0;
    for (const kind of [0x80, 0x90, 0xb0, 0xc0]) {
      for (let channel = 0; channel < 16; channel += 1) {
        for (const first of values) {
          for (const second of kind === 0xc0 ? [undefined] : values) {
            rig.midi.send(second === undefined ? [kind | channel, first] : [kind | channel, first, second]);
            sent += 1;
          }
        }
      }
    }
    await rig.pedal(monitorHas(sent));
    // Live receives in the order the server sends, so once this last press's jump arrives, anything
    // the sweep sent has arrived before it. The sweep's own presses sent the loop, Next and Previous.
    rig.midi.send(SWITCH_2);
    await vi.waitFor(() => expect(rig.received(JUMP)).toEqual([jumpTo(CUES.chorus), jumpTo(CUES.songOneIntro), jumpTo(CUES.chorus)]));

    expect(rig.received(LOOP)[0]).toEqual(loopTo(1));
    expect(rig.received(STOP)).toEqual([]);
  });
});

describe('the pedal config file', () => {
  const LOADED = {
    config: 'loaded',
    problems: [],
    mappings: [
      { switch: 1, message: 'B0 50 7F', action: 'loop' },
      { switch: 2, message: 'B0 51 7F', action: 'next' },
      { switch: 3, message: 'B0 52 7F', action: 'previous' },
    ],
    input: { kind: 'ready' },
  };

  it('maps switch 1 to the loop, switch 2 to next and switch 3 to previous by default', async () => {
    rig = await startRig(SET, {}, { pedalConfig: DEFAULT_CONFIG });

    expect(await rig.pedal()).toEqual({ ...LOADED, configPath: DEFAULT_CONFIG, monitor: [] });
  });

  it("maps every message in a switch's list, for a pedal that alternates between two messages", async () => {
    rig = await startRig(SET, {}, { pedalConfig: LIST_CONFIG });

    expect(await rig.pedal()).toEqual({
      ...LOADED,
      configPath: LIST_CONFIG,
      mappings: [
        { switch: 1, message: ['B0 50 7F', 'B0 50 00'], action: 'loop' },
        { switch: 2, message: ['B0 51 7F', 'B0 51 00'], action: 'next' },
        { switch: 3, message: ['B0 52 7F', 'B0 52 00'], action: 'previous' },
      ],
      monitor: [],
    });
  });

  // Each case: the server starts, the setup screen shows the problem, and the leader page still drives Live.
  const startsAndReports = async (pedalConfig: string | undefined) => {
    rig = await startRig(SET, { playing: false, position: 0 }, { pedalConfig });
    const leader = await rig.connectLeader();
    const pedal = await rig.pedal();

    leader.send({ kind: 'jump', song: 1, section: VERSE });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toEqual([jumpTo(CUES.verse)]));
    expect(pedal.mappings).toEqual([]);
    return pedal;
  };

  it('starts the server with no pedal mapping when there is no file at the path, and says so', async () => {
    const path = fixture('no-such-file.json');
    const pedal = await startsAndReports(path);
    expect(pedal.config).toBe('missing');
    expect(pedal.configPath).toBe(path);
    expect(pedal.problems).toEqual([`No pedal config file at ${path}. The pedal does nothing.`]);
  });

  it('starts the server with no pedal mapping when it was given no file, and says so', async () => {
    const pedal = await startsAndReports(undefined);
    expect(pedal.config).toBe('missing');
    expect(pedal.configPath).toBeNull();
    expect(pedal.problems).toEqual(['No pedal config file was given. The pedal does nothing.']);
  });

  it('starts the server with no pedal mapping when the file is not valid JSON, and says so', async () => {
    const path = fixture('invalid.json');
    const pedal = await startsAndReports(path);
    expect(pedal.config).toBe('invalid');
    expect(pedal.problems).toHaveLength(1);
    expect(pedal.problems[0]).toMatch(new RegExp(`^The pedal config file at ${path} is not valid JSON: `));
  });

  it('lists every problem in the file, and maps no switch at all', async () => {
    const pedal = await startsAndReports(fixture('problems.json'));
    expect(pedal.config).toBe('invalid');
    expect(pedal.problems).toEqual([
      'Switch 3\'s action "jump" is not one of "loop", "next" and "previous".',
      'Switch 3\'s message "B0 5" is not one to three hex bytes, such as "B0 50 7F".',
      '"4" is not a pedal switch. Only switches 1, 2 and 3 can be mapped.',
      '"5" is not a pedal switch. Only switches 1, 2 and 3 can be mapped.',
      'Switches 1 and 2 both send B0 50 7F. Each switch needs its own message.',
    ]);
  });

  it('lists every problem with a list of messages, and maps no switch at all', async () => {
    const pedal = await startsAndReports(fixture('list-problems.json'));
    expect(pedal.config).toBe('invalid');
    expect(pedal.problems).toEqual([
      'Switch 1\'s message list is empty. List one message or more, such as ["B0 50 7F", "B0 50 00"].',
      'Switch 2\'s message "B0 5" is not one to three hex bytes, such as "B0 50 7F".',
      'Switch 2 lists B0 51 7F twice. Each message goes in the list once.',
      'Switches 2 and 3 both send B0 51 7F. Each switch needs its own message.',
    ]);
  });
});

describe('the MIDI monitor', () => {
  it('shows every message fed through the MIDI input, in order, as hex and in words, with the action it ran', async () => {
    rig = await startRig(SET, {}, { pedalConfig: DEFAULT_CONFIG });
    expect((await rig.pedal()).monitor).toEqual([]);

    rig.midi.send(SWITCH_2);
    rig.midi.send([0x90, 0x3c, 0x64]);
    rig.midi.send([0x83, 0x3c, 0x00]);
    rig.midi.send([0xc0, 0x05]);
    rig.midi.send([0xe1, 0x00, 0x40]);
    rig.midi.send([0xf8]);
    rig.midi.send(SWITCH_2);

    expect((await rig.pedal(monitorHas(7))).monitor).toEqual([
      { id: 1, message: 'B0 51 7F', description: 'Control change 81, value 127, channel 1', action: 'next' },
      { id: 2, message: '90 3C 64', description: 'Note on 60, velocity 100, channel 1', action: null },
      { id: 3, message: '83 3C 00', description: 'Note off 60, velocity 0, channel 4', action: null },
      { id: 4, message: 'C0 05', description: 'Program change 5, channel 1', action: null },
      { id: 5, message: 'E1 00 40', description: 'Pitch bend 8192, channel 2', action: null },
      { id: 6, message: 'F8', description: 'System message', action: null },
      { id: 7, message: 'B0 51 7F', description: 'Control change 81, value 127, channel 1', action: 'next' },
    ]);
  });

  it("shows the switch's action on a line for each message in its list", async () => {
    rig = await startRig(SET, {}, { pedalConfig: LIST_CONFIG });

    rig.midi.send([0xb0, 0x51, 0x7f]);
    rig.midi.send([0xb0, 0x51, 0x00]);

    expect((await rig.pedal(monitorHas(2))).monitor).toEqual([
      { id: 1, message: 'B0 51 7F', description: 'Control change 81, value 127, channel 1', action: 'next' },
      { id: 2, message: 'B0 51 00', description: 'Control change 81, value 0, channel 1', action: 'next' },
    ]);
  });

  it('keeps only the last 20 messages', async () => {
    rig = await startRig(SET);

    for (let value = 0; value < 25; value += 1) rig.midi.send([0xb0, 0x40, value]);

    const { monitor } = await rig.pedal(monitorHas(25));
    expect(monitor.map((entry) => entry.id)).toEqual(Array.from({ length: 20 }, (_, index) => index + 6));
    expect(monitor.at(-1)?.message).toBe('B0 40 18');
  });
});

// The pedal's status is the laptop's alone: it reaches the setup screen on its own route, never in
// the snapshot every page gets.
describe("the band's pages", () => {
  it('receive nothing while an expression pedal sweeps through every value', async () => {
    rig = await startRig(SET, {}, { pedalConfig: DEFAULT_CONFIG });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot(loaded);
    await leader.snapshot(loaded);
    const before = [viewer.received.length, leader.received.length];

    for (let value = 0; value < 128; value += 1) rig.midi.send([0xb0, 0x0b, value]);

    await rig.pedal(monitorHas(128));
    // The server sends in order, so a snapshot the sweep published reaches each client before its pong.
    await viewer.flush();
    await leader.flush();
    expect([viewer.received.length, leader.received.length]).toEqual(before);
  });

  it('never carry the pedal config path or any pedal field', async () => {
    rig = await startRig(SET, {}, { pedalConfig: DEFAULT_CONFIG });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    rig.midi.send(SWITCH_2);
    await rig.pedal(monitorHas(1));
    await viewer.snapshot(loaded);
    await leader.snapshot(loaded);
    await viewer.flush();
    await leader.flush();

    for (const snapshot of [...viewer.received, ...leader.received]) {
      expect(snapshot).not.toHaveProperty('pedal');
      expect(JSON.stringify(snapshot)).not.toContain(DEFAULT_CONFIG);
    }
  });
});
