import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// The producer's hand on a target: Fire again, which sends the current section's cue to one target,
// and the target's own manual buttons. Both reach an online target whatever its arm state, and
// neither changes it.

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// One song in 4/4 at 120 BPM, as in connections.test.ts.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];

const BUTTONS = [
  { id: 'clear', label: 'Clear slides' },
  { id: 'logo', label: 'Show logo' },
];

const rowOf = (snapshot: ProducerSnapshot, name: string): Connection | undefined => snapshot.connections.find((row) => row.name === name);

// A rig with the given fake targets online and the producer connected, Live at `position`, playing
// or not, once the producer sees the set, every target online and the playhead there.
async function manualRig(targets: FakeTarget[], { playing = true, position = 20 }: { playing?: boolean; position?: number } = {}) {
  const started = await startRig(SET, { playing, position }, { targets });
  rig = started;
  const producer = await started.connectProducer();
  await producer.snapshot(
    (snapshot) => loaded(snapshot) && snapshot.position === position && snapshot.connections.every((row) => row.connection === 'online'),
  );
  // Resolves with the first snapshot the producer receives from now on that matches.
  const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
  };
  // Sends the producer's command and waits until the server has handled it.
  const press = async (command: unknown) => {
    producer.send(command);
    await producer.flush();
  };
  return { rig: started, producer, next, press };
}

describe("a target's manual buttons", () => {
  it("show on the producer's row, ids and labels in the target's order, and never on the leader's snapshot", async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides', buttons: BUTTONS });
    const lights = fakeTarget({ name: 'lights', label: 'Lights' });
    const { rig, producer } = await manualRig([slides, lights]);
    const leader = await rig.connectLeader();

    const snapshot = await producer.snapshot(loaded);

    expect(rowOf(snapshot, 'slides')?.buttons).toEqual(BUTTONS);
    expect(rowOf(snapshot, 'lights')?.buttons).toEqual([]);
    expect(await leader.snapshot(loaded)).not.toHaveProperty('connections');
  });
});

describe('a button run', () => {
  it("reaches the target's runs, and only that target's", async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides', buttons: BUTTONS });
    const lights = fakeTarget({ name: 'lights', label: 'Lights', buttons: BUTTONS });
    const { press } = await manualRig([slides, lights]);

    await press({ kind: 'run-button', target: 'slides', button: 'logo' });
    await press({ kind: 'run-button', target: 'slides', button: 'clear' });

    expect(slides.runs).toEqual(['logo', 'clear']);
    expect(lights.runs).toEqual([]);
  });

  it('does nothing on an offline target, and nothing is run once it comes back', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides', buttons: BUTTONS });
    const { next, press } = await manualRig([slides]);
    const offline = next((snapshot) => rowOf(snapshot, 'slides')?.connection === 'offline');
    slides.goOffline();
    await offline;

    await press({ kind: 'run-button', target: 'slides', button: 'logo' });
    const online = next((snapshot) => rowOf(snapshot, 'slides')?.connection === 'online');
    slides.goOnline();
    await online;
    await press({ kind: 'run-button', target: 'slides', button: 'clear' });

    expect(slides.runs).toEqual(['clear']);
  });

  it('ignores a button id the target does not offer, and a target that does not exist', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides', buttons: BUTTONS });
    const { press } = await manualRig([slides]);

    await press({ kind: 'run-button', target: 'slides', button: 'blackout' });
    await press({ kind: 'run-button', target: 'lights', button: 'logo' });
    await press({ kind: 'run-button', target: 'slides', button: 'clear' });

    expect(slides.runs).toEqual(['clear']);
  });

  it("ignores a leader's button run", async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides', buttons: BUTTONS });
    const { rig, press } = await manualRig([slides]);
    const leader = await rig.connectLeader();
    await leader.snapshot(loaded);

    leader.send({ kind: 'run-button', target: 'slides', button: 'logo' });
    await leader.flush();
    await press({ kind: 'run-button', target: 'slides', button: 'clear' });

    expect(slides.runs).toEqual(['clear']);
  });
});

const VERSE_AGAIN = { song: 1, title: null, section: 1, name: 'Verse', cause: 'fire-again' };

describe('Fire again', () => {
  it("delivers the current section's cue to that target only, with the cause Fire again", async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides' });
    const lights = fakeTarget({ name: 'lights', label: 'Lights' });
    const { press } = await manualRig([slides, lights]);

    await press({ kind: 'fire-again', target: 'slides' });

    expect(slides.cues).toEqual([VERSE_AGAIN]);
    expect(lights.cues).toEqual([]);
  });

  it('does nothing on an offline target, and nothing is replayed once it comes back', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides' });
    const { next, press } = await manualRig([slides]);
    const offline = next((snapshot) => rowOf(snapshot, 'slides')?.connection === 'offline');
    slides.goOffline();
    await offline;

    await press({ kind: 'fire-again', target: 'slides' });
    const online = next((snapshot) => rowOf(snapshot, 'slides')?.connection === 'online');
    slides.goOnline();
    await online;
    await press({ kind: 'arm', target: 'slides' });

    expect(slides.cues).toEqual([]);
    await press({ kind: 'fire-again', target: 'slides' });
    expect(slides.cues).toEqual([VERSE_AGAIN]);
  });

  it('does nothing while the playhead is between songs, past the End', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides' });
    const { producer, press } = await manualRig([slides], { playing: false, position: 52 });
    expect((await producer.snapshot(loaded)).now).toBeNull();

    await press({ kind: 'fire-again', target: 'slides' });

    expect(slides.cues).toEqual([]);
  });

  it('ignores a target that does not exist', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides' });
    const { press } = await manualRig([slides]);

    await press({ kind: 'fire-again', target: 'lights' });
    await press({ kind: 'fire-again', target: 'slides' });

    expect(slides.cues).toEqual([VERSE_AGAIN]);
  });

  it("ignores a leader's Fire again", async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides' });
    const { rig, press } = await manualRig([slides]);
    await press({ kind: 'arm', target: 'slides' });
    const leader = await rig.connectLeader();
    await leader.snapshot(loaded);

    leader.send({ kind: 'fire-again', target: 'slides' });
    await leader.flush();
    await press({ kind: 'fire-again', target: 'slides' });

    expect(slides.cues).toEqual([VERSE_AGAIN]);
  });
});

describe('Fire again and a button run, whatever the arm state', () => {
  const CHORUS = { song: 1, title: null, section: 2, name: 'Chorus', cause: 'played-into' };

  // Puts the target in the arm state, through the producer and the target as a set would, and
  // resolves with the row the producer then sees.
  async function rigIn(arm: Connection['arm']) {
    const slides = fakeTarget({ name: 'slides', label: 'Slides', buttons: BUTTONS });
    const started = await manualRig([slides]);
    const { next, producer } = started;
    const sees = (state: Connection['arm']) => next((snapshot) => rowOf(snapshot, 'slides')?.arm === state);
    if (arm !== 'disarmed') {
      const armed = sees('armed');
      producer.send({ kind: 'arm', target: 'slides' });
      await armed;
    }
    if (arm === 'paused') {
      const paused = sees('paused');
      slides.changeByHand();
      await paused;
    }
    const row = rowOf(producer.received.at(-1)!, 'slides')!;
    expect(row.arm).toBe(arm);
    // Plays on into the Chorus, and resolves once the producer sees the playhead there.
    const playIntoChorus = async () => {
      started.rig.live.setPosition(33);
      await producer.snapshot((snapshot) => snapshot.position === 33);
    };
    return { ...started, slides, row, playIntoChorus };
  }

  // Presses Fire again and a button, and checks each reached the target and no row changed after.
  async function pressBoth({ slides, producer, press, row }: Awaited<ReturnType<typeof rigIn>>) {
    const before = producer.received.length;
    await press({ kind: 'fire-again', target: 'slides' });
    await press({ kind: 'run-button', target: 'slides', button: 'logo' });

    expect(slides.cues).toEqual([VERSE_AGAIN]);
    expect(slides.runs).toEqual(['logo']);
    for (const snapshot of producer.received.slice(before)) {
      expect(rowOf(snapshot, 'slides')).toMatchObject({ arm: row.arm, pause: row.pause });
    }
  }

  it('work on a disarmed target, which stays disarmed and gets no cue as the song plays on', async () => {
    const rig = await rigIn('disarmed');

    await pressBoth(rig);
    await rig.playIntoChorus();

    expect(rig.slides.cues).toEqual([VERSE_AGAIN]);
  });

  it('work on an armed target, which stays armed and follows the set', async () => {
    const rig = await rigIn('armed');

    await pressBoth(rig);
    await rig.playIntoChorus();

    expect(rig.slides.cues).toEqual([VERSE_AGAIN, CHORUS]);
    expect(rowOf(rig.producer.received.at(-1)!, 'slides')).toMatchObject({ arm: 'armed', pause: null });
  });

  it('work on a target paused by hand, which stays paused and gets no cue as the song plays on', async () => {
    const rig = await rigIn('paused');
    expect(rig.row.pause).toBe('by-hand');

    await pressBoth(rig);
    await rig.playIntoChorus();

    expect(rig.slides.cues).toEqual([VERSE_AGAIN]);
    expect(rowOf(rig.producer.received.at(-1)!, 'slides')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });
});

describe('Fire again and a button run on a target that fails', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leave the server answering, the target as it was, and log each failure', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const slides = fakeTarget({ name: 'slides', label: 'Slides', buttons: BUTTONS });
    const cueFailed = new Error('cue failed');
    const runFailed = new Error('run failed');
    slides.cue = () => {
      throw cueFailed;
    };
    slides.runButton = () => {
      throw runFailed;
    };
    const { rig, producer, press } = await manualRig([slides]);

    await press({ kind: 'fire-again', target: 'slides' });
    await press({ kind: 'run-button', target: 'slides', button: 'logo' });
    rig.live.setPosition(24);
    const seen = await producer.snapshot((snapshot) => snapshot.position === 24);

    expect(rowOf(seen, 'slides')).toMatchObject({ connection: 'online', arm: 'disarmed', pause: null });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('connection target slides'), cueFailed);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('connection target slides'), runFailed);
  });
});
