import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Cue } from '../src/server/cues.ts';
import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// At 120 BPM in 4/4 a beat is 500 ms and a bar is 4 beats.
const BEAT_MS = 500;

// Two songs as the set builder lays out an overlap: song 2's Count Off on song 1's End, so playback
// rolls from song 1 into song 2's Count Off on the default "Continue".
const TWO_SONGS: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - Chorus', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Count Off (Trust)', time: 40 },
  { name: '2 - Verse', time: 48 },
  { name: '2 - End', time: 64 },
];

// Two songs where song 2 has no Count Off: its first locator, the Verse, sits on song 1's End, so
// playback rolls from song 1 straight into song 2's Verse, where the music comes back at once.
const NO_COUNT_OFF: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - Chorus', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Verse (Trust)', time: 40 },
  { name: '2 - Chorus', time: 56 },
  { name: '2 - End', time: 72 },
];

const played = (song: 1 | 2, section: number | 'end', name: string): Cue => ({
  song,
  title: song === 1 ? 'Grace' : 'Trust',
  section,
  name,
  cause: 'played-into',
});
const CHORUS_1 = played(1, 2, 'Chorus');
const END_1 = played(1, 'end', 'End');
const COUNT_OFF_2 = played(2, 0, 'Count Off');
const VERSE_2 = played(2, 1, 'Verse');
const VERSE_1 = played(1, 1, 'Verse');
// Song 2's sections in NO_COUNT_OFF.
const FIRST_2 = played(2, 0, 'Verse');
const CHORUS_2 = played(2, 1, 'Chorus');

const JUMP = '/live/song/cue_point/jump';

// Live reports the playhead as float32, so a position is compared within a hair.
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

// A rig playing in song 1's Verse at beat 12, with the given fake targets online, a leader and a
// producer connected, and the targets named in `arm` armed by the producer. Every helper waits for
// the producer to see the change it makes, and a cue reaches a target before the pages hear of the
// change that raised it.
async function pauseRig(targets: FakeTarget[], arm: string[], set: CuePoint[] = TWO_SONGS) {
  const started = await startRig(set, { playing: true, position: 12 }, { targets });
  rig = started;
  const producer = await started.connectProducer();
  const leader = await started.connectLeader();
  const online = (snapshot: ProducerSnapshot) => loaded(snapshot) && snapshot.connections.every((row) => row.connection === 'online');
  await producer.snapshot((snapshot) => online(snapshot) && near(snapshot.position, 12));
  await leader.snapshot(loaded);

  // Resolves with the first snapshot the producer receives from now on that matches.
  const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
  };
  const rowOf = (snapshot: ProducerSnapshot, name: string): Connection | undefined => snapshot.connections.find((row) => row.name === name);
  // Resolves once the producer sees the target's row in that arm state, with that reason.
  const sees = (name: string, arm: Connection['arm'], pause: Connection['pause'] = null) =>
    next((snapshot) => rowOf(snapshot, name)?.arm === arm && rowOf(snapshot, name)?.pause === pause);

  const producerSends = async (kind: 'arm' | 'disarm', name: string, gives: Promise<ProducerSnapshot>) => {
    producer.send({ kind, target: name });
    return gives;
  };
  for (const name of arm) await producerSends('arm', name, sees(name, 'armed'));

  return {
    sees,
    // The producer's Arm or Disarm, once the producer sees the row it gives.
    arm: (name: string) => producerSends('arm', name, sees(name, 'armed')),
    disarm: (name: string) => producerSends('disarm', name, sees(name, 'disarmed')),
    // The target reports a change by hand, once the producer sees the row it gives.
    async changeByHand(target: FakeTarget, gives: Connection['arm'], pause: Connection['pause']) {
      const seen = sees(target.name, gives, pause);
      target.changeByHand();
      return seen;
    },
    // The leader's Fade out, once the producer sees the row it gives the named target.
    async fadeOut(name: string, gives: Connection['arm'], pause: Connection['pause']) {
      const seen = sees(name, gives, pause);
      leader.send({ kind: 'fade-out' });
      return seen;
    },
    // The leader's command, once the producer sees the snapshot it gives.
    async lead(command: unknown, gives: (snapshot: ProducerSnapshot) => boolean) {
      const seen = next(gives);
      leader.send(command);
      return seen;
    },
    // The snapshot can reach a page before the OSC reaches the fake Live, so a test that moves Live's
    // playhead after a command waits for Live to hold every message sent to that address so far.
    async liveHas(address: string, count: number) {
      await vi.waitFor(() => expect(started.received(address)).toHaveLength(count));
    },
    // Plays on for that many beats, and waits for the playhead where Live then puts it.
    async play(beats: number, landsOn: number) {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      started.live.advance(beats * BEAT_MS);
      return seen;
    },
    async moveTo(beats: number) {
      const seen = next((snapshot) => near(snapshot.position, beats));
      started.live.setPosition(beats);
      return seen;
    },
    // Live drops, the bridge reports it lost after 4 seconds, and Live comes back playing at `beats`.
    async reconnectLive(beats: number) {
      await started.stopLive();
      started.clock.advance(4000);
      await started.startLive({ position: beats, playing: true });
      started.clock.advance(1000);
    },
    // Live starts playing from where the playhead sits, as the space bar at the laptop does.
    async startAtLaptop() {
      const seen = next((snapshot) => snapshot.playing);
      started.live.setPlaying(true);
      return seen;
    },
  };
}

describe('a change by hand', () => {
  it('pauses an armed target, which gets no cue until the producer arms it, and nothing it missed', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides' });
    const { changeByHand, arm, play } = await pauseRig([slides], ['slides']);

    const paused = await changeByHand(slides, 'paused', 'by-hand');
    expect(paused.connections).toMatchObject([{ name: 'slides', arm: 'paused', pause: 'by-hand' }]);
    // Into song 1's Chorus at 24, and on.
    await play(14, 26);
    expect(slides.cues).toEqual([]);

    const armed = await arm('slides');
    expect(armed.connections).toMatchObject([{ name: 'slides', arm: 'armed', pause: null }]);
    // Into song 1's End and song 2's Count Off at 40.
    await play(15, 41);
    expect(slides.cues).toEqual([END_1, COUNT_OFF_2]);
  });

  it('leaves a disarmed target disarmed', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides' });
    const lights = fakeTarget({ name: 'lights', label: 'Lights' });
    const { arm, play } = await pauseRig([slides, lights], []);

    slides.changeByHand();
    // A change the producer sees after the report, so the report has had its chance to publish.
    const snapshot = await arm('lights');

    expect(snapshot.connections).toMatchObject([
      { name: 'slides', arm: 'disarmed', pause: null },
      { name: 'lights', arm: 'armed', pause: null },
    ]);
    await play(14, 26);
    expect(slides.cues).toEqual([]);
    expect(lights.cues).toEqual([CHORUS_1]);
  });

  it('is undone by Disarm, which disarms a paused target', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides' });
    const { changeByHand, disarm } = await pauseRig([slides], ['slides']);

    await changeByHand(slides, 'paused', 'by-hand');
    const disarmed = await disarm('slides');

    expect(disarmed.connections).toMatchObject([{ name: 'slides', arm: 'disarmed', pause: null }]);
  });
});

describe('a Fade out', () => {
  it('pauses an armed target that pauses on a fade, and leaves one that opts out armed and getting cues', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);

    const faded = await fadeOut('fading', 'paused', 'fade-out');

    expect(faded.connections).toMatchObject([
      { name: 'fading', arm: 'paused', pause: 'fade-out' },
      { name: 'cutting', arm: 'armed', pause: null },
    ]);
    await play(14, 26);
    expect(fading.cues).toEqual([]);
    expect(cutting.cues).toEqual([CHORUS_1]);
  });
});

describe('the next Count Off', () => {
  it('arms a target the Fade out paused again, which gets that Count Off cue and plays on', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, sees, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);
    await fadeOut('fading', 'paused', 'fade-out');
    await play(14, 26);

    // Through song 1's End into song 2's Count Off at 40.
    const armed = sees('fading', 'armed');
    await play(15, 41);
    expect((await armed).connections).toMatchObject([
      { name: 'fading', arm: 'armed', pause: null },
      { name: 'cutting', arm: 'armed', pause: null },
    ]);
    expect(fading.cues).toEqual([COUNT_OFF_2]);

    // Into song 2's Verse at 48.
    await play(8, 49);
    expect(fading.cues).toEqual([COUNT_OFF_2, VERSE_2]);
    expect(cutting.cues).toEqual([CHORUS_1, END_1, COUNT_OFF_2, VERSE_2]);
  });

  it('leaves a target paused by hand paused, and a disarmed target disarmed', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const manual = fakeTarget({ name: 'manual', label: 'Manual', pausesOnFade: true });
    const idle = fakeTarget({ name: 'idle', label: 'Idle', pausesOnFade: true });
    const { changeByHand, fadeOut, sees, play } = await pauseRig([fading, manual, idle], ['fading', 'manual']);
    await changeByHand(manual, 'paused', 'by-hand');
    await fadeOut('fading', 'paused', 'fade-out');

    const armed = sees('fading', 'armed');
    await play(29, 41);
    await play(8, 49);

    expect((await armed).connections).toMatchObject([
      { name: 'fading', arm: 'armed', pause: null },
      { name: 'manual', arm: 'paused', pause: 'by-hand' },
      { name: 'idle', arm: 'disarmed', pause: null },
    ]);
    expect(fading.cues).toEqual([COUNT_OFF_2, VERSE_2]);
    expect(manual.cues).toEqual([]);
    expect(idle.cues).toEqual([]);
  });

  it('leaves paused by hand a target the Fade out paused and then someone changed by hand', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { changeByHand, fadeOut, play } = await pauseRig([fading], ['fading']);
    await fadeOut('fading', 'paused', 'fade-out');

    const paused = await changeByHand(fading, 'paused', 'by-hand');
    expect(paused.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'by-hand' }]);
    await play(29, 41);
    await play(8, 49);

    expect(fading.cues).toEqual([]);
  });
});

describe("a loop on song 1's last section, wrapping on a report on the brace end at song 2's Count Off", () => {
  it('leaves a target the Fade out paused, and raises no Count Off cue', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, lead, moveTo, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);
    await play(16, 28);
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 2);
    await fadeOut('fading', 'paused', 'fade-out');

    await moveTo(Math.fround(39.99995));
    await moveTo(25);
    const last = await moveTo(26);

    expect(last.connections).toMatchObject([
      { name: 'fading', arm: 'paused', pause: 'fade-out' },
      { name: 'cutting', arm: 'armed', pause: null },
    ]);
    expect(fading.cues).toEqual([CHORUS_1]);
    expect(cutting.cues).toEqual([CHORUS_1, { ...CHORUS_1, cause: 'loop' }]);
  });

  it('leaves a target the Fade out paused, and raises no Count Off cue, while a jump back to the looped section waits for that bar line', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, lead, moveTo, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);
    await play(16, 28);
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 2);
    await fadeOut('fading', 'paused', 'fade-out');
    await moveTo(37);
    await lead({ kind: 'jump', song: 1, section: 2 }, (snapshot) => snapshot.jump?.song === 1 && snapshot.jump.section === 2);

    const wrap = await moveTo(Math.fround(39.99995));
    const last = await moveTo(24);

    expect(wrap.jump).toMatchObject({ song: 1, section: 2 });
    expect(wrap.loop?.section).toMatchObject({ song: 1, section: 2 });
    expect(last.jump).toBeNull();
    expect(last.connections).toMatchObject([
      { name: 'fading', arm: 'paused', pause: 'fade-out' },
      { name: 'cutting', arm: 'armed', pause: null },
    ]);
    expect(fading.cues).toEqual([CHORUS_1]);
    expect(cutting.cues).toEqual([CHORUS_1, { ...CHORUS_1, cause: 'jump' }]);
  });

  it("raises song 1's End and song 2's Count Off when a jump to that Count Off is tapped just after the brace end and Live plays on", async () => {
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { lead, moveTo, play } = await pauseRig([cutting], ['cutting']);
    await play(16, 28);
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 2);
    await moveTo(Math.fround(39.99995));
    await lead({ kind: 'jump', song: 2, section: 0 }, (snapshot) => snapshot.jump?.song === 2 && snapshot.loop === null);

    await moveTo(40.5);
    await moveTo(41);
    await moveTo(44.5);

    expect(cutting.cues).toEqual([CHORUS_1, END_1, { ...COUNT_OFF_2, cause: 'jump' }]);
  });

  // The report on the brace end is the loop going round, not song 2's Count Off, so it leaves no word
  // that the music comes back for a later Count Off inside song 1 to act on.
  it("leaves a target the Fade out paused when a jump inside song 1 then lands on song 1's Count Off", async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, lead, liveHas, moveTo, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);
    await play(16, 28);
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 2);
    await fadeOut('fading', 'paused', 'fade-out');

    await moveTo(Math.fround(39.99995));
    // The loop turned off at the laptop, so the wrap Live reported raises no cue.
    rig!.live.setLoop({ on: false });
    await moveTo(25);
    await lead({ kind: 'jump', song: 1, section: 0 }, (snapshot) => snapshot.jump?.section === 0);
    await liveHas(JUMP, 1);
    // The bar line is beat 28, so Live lands on song 1's Count Off, 0, and plays on a beat.
    await play(4, 1);
    const snapshot = await play(8, 9);

    expect(cutting.cues).toEqual([CHORUS_1, { ...played(1, 0, 'Count Off'), cause: 'jump' }, VERSE_1]);
    expect(fading.cues).toEqual([CHORUS_1]);
    expect(snapshot.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'fade-out' }, { name: 'cutting' }]);
  });
});

// The music comes back only when the playhead enters a song's Count Off from another song or by Play
// from start, so a Count Off reached inside the song playing leaves a faded target paused.
describe('a Count Off inside the song playing', () => {
  it('leaves a target the Fade out paused when a jump lands on it', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, lead, liveHas, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);
    await fadeOut('fading', 'paused', 'fade-out');
    await play(2, 14);

    await lead({ kind: 'jump', song: 1, section: 0 }, (snapshot) => snapshot.jump?.section === 0);
    await liveHas(JUMP, 1);
    // The bar line is beat 16, so Live lands on song 1's Count Off, 0, and plays on a beat.
    await play(3, 1);
    // Into song 1's Verse at 8.
    const snapshot = await play(8, 9);

    expect(cutting.cues).toEqual([{ ...played(1, 0, 'Count Off'), cause: 'jump' }, VERSE_1]);
    expect(fading.cues).toEqual([]);
    expect(snapshot.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'fade-out' }, { name: 'cutting' }]);
  });

  it('leaves a target the Fade out paused when a jump lands on it after the music came back once', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, lead, liveHas, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);
    // Into song 1's Chorus at 24, through its End into song 2's Count Off at 40, and on into its
    // Verse at 48.
    await play(14, 26);
    await play(15, 41);
    await play(8, 49);
    await fadeOut('fading', 'paused', 'fade-out');
    await play(2, 51);

    await lead({ kind: 'jump', song: 2, section: 0 }, (snapshot) => snapshot.jump?.section === 0);
    await liveHas(JUMP, 1);
    // The bar line is beat 52, so Live lands on song 2's Count Off, 40, and plays on a beat.
    await play(2, 41);
    const snapshot = await play(8, 49);

    expect(cutting.cues).toEqual([CHORUS_1, END_1, COUNT_OFF_2, VERSE_2, { ...COUNT_OFF_2, cause: 'jump' }, VERSE_2]);
    expect(fading.cues).toEqual([CHORUS_1, END_1, COUNT_OFF_2, VERSE_2]);
    expect(snapshot.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'fade-out' }, { name: 'cutting' }]);
  });

  it('arms a target the Fade out paused again on Play from start of that song', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { fadeOut, sees, lead, liveHas, play } = await pauseRig([fading], ['fading']);
    await fadeOut('fading', 'paused', 'fade-out');
    await play(2, 14);

    await lead({ kind: 'play-from-start', song: 1 }, (snapshot) => snapshot.jump?.song === 1);
    await liveHas(JUMP, 1);
    const armed = sees('fading', 'armed');
    // The bar line is beat 16, so Live lands on song 1's Count Off, 0, and plays on a beat.
    await play(3, 1);

    expect((await armed).connections).toMatchObject([{ name: 'fading', arm: 'armed', pause: null }]);
    expect(fading.cues).toEqual([{ ...played(1, 0, 'Count Off'), cause: 'play-from-start' }]);
  });

  it('arms a target the Fade out paused again on Play from start of that song after Stop', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, sees, lead, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);
    await fadeOut('fading', 'paused', 'fade-out');
    await lead({ kind: 'stop' }, (snapshot) => !snapshot.playing);

    const armed = sees('fading', 'armed');
    await lead({ kind: 'play-from-start', song: 1 }, (snapshot) => snapshot.playing && near(snapshot.position, 0));
    expect((await armed).connections).toMatchObject([{ name: 'fading', arm: 'armed', pause: null }, { name: 'cutting' }]);
    // Into song 1's Verse at 8.
    await play(9, 9);

    const countOff = { ...played(1, 0, 'Count Off'), cause: 'play-from-start' };
    expect(fading.cues).toEqual([countOff, VERSE_1]);
    expect(cutting.cues).toEqual([countOff, VERSE_1]);
  });

  it('arms a target the Fade out paused again on Play from start of that song after Stop and a tap on its Count Off', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { fadeOut, sees, lead, play } = await pauseRig([fading], ['fading']);
    await fadeOut('fading', 'paused', 'fade-out');
    await lead({ kind: 'stop' }, (snapshot) => !snapshot.playing);
    await lead({ kind: 'jump', song: 1, section: 0 }, (snapshot) => near(snapshot.position, 0));

    const armed = sees('fading', 'armed');
    await lead({ kind: 'play-from-start', song: 1 }, (snapshot) => snapshot.playing);
    expect((await armed).connections).toMatchObject([{ name: 'fading', arm: 'armed', pause: null }]);
    // Into song 1's Verse at 8.
    await play(9, 9);

    expect(fading.cues).toEqual([{ ...played(1, 0, 'Count Off'), cause: 'play-from-start' }, VERSE_1]);
  });
});

// A song with no Count Off brings the music back at once on its first locator, so its first
// section's cue does what a Count Off cue does.
describe('a song with no Count Off', () => {
  it('arms a target the Fade out paused again on its first section, which gets that cue and plays on', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, sees, play } = await pauseRig([fading, cutting], ['fading', 'cutting'], NO_COUNT_OFF);
    await fadeOut('fading', 'paused', 'fade-out');
    await play(14, 26);

    // Through song 1's End into song 2's Verse at 40.
    const armed = sees('fading', 'armed');
    await play(15, 41);
    expect((await armed).connections).toMatchObject([
      { name: 'fading', arm: 'armed', pause: null },
      { name: 'cutting', arm: 'armed', pause: null },
    ]);
    expect(fading.cues).toEqual([FIRST_2]);

    // Into song 2's Chorus at 56.
    await play(16, 57);
    expect(fading.cues).toEqual([FIRST_2, CHORUS_2]);
    expect(cutting.cues).toEqual([CHORUS_1, END_1, FIRST_2, CHORUS_2]);
  });

  it('leaves a target paused by hand paused, and a disarmed target disarmed', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const manual = fakeTarget({ name: 'manual', label: 'Manual', pausesOnFade: true });
    const idle = fakeTarget({ name: 'idle', label: 'Idle', pausesOnFade: true });
    const { changeByHand, fadeOut, sees, play } = await pauseRig([fading, manual, idle], ['fading', 'manual'], NO_COUNT_OFF);
    await changeByHand(manual, 'paused', 'by-hand');
    await fadeOut('fading', 'paused', 'fade-out');

    const armed = sees('fading', 'armed');
    await play(29, 41);
    await play(16, 57);

    expect((await armed).connections).toMatchObject([
      { name: 'fading', arm: 'armed', pause: null },
      { name: 'manual', arm: 'paused', pause: 'by-hand' },
      { name: 'idle', arm: 'disarmed', pause: null },
    ]);
    expect(fading.cues).toEqual([FIRST_2, CHORUS_2]);
    expect(manual.cues).toEqual([]);
    expect(idle.cues).toEqual([]);
  });

  it('leaves paused by hand a target the Fade out paused and then someone changed by hand', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { changeByHand, fadeOut, play } = await pauseRig([fading], ['fading'], NO_COUNT_OFF);
    await fadeOut('fading', 'paused', 'fade-out');

    const paused = await changeByHand(fading, 'paused', 'by-hand');
    expect(paused.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'by-hand' }]);
    await play(29, 41);
    const snapshot = await play(16, 57);

    expect(snapshot.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'by-hand' }]);
    expect(fading.cues).toEqual([]);
  });

  it('arms a target the Fade out paused again on Play from start of that song', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { fadeOut, sees, lead, liveHas, play } = await pauseRig([fading], ['fading'], NO_COUNT_OFF);
    await fadeOut('fading', 'paused', 'fade-out');
    await play(2, 14);

    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.jump?.song === 2);
    await liveHas(JUMP, 1);
    const armed = sees('fading', 'armed');
    // The bar line is beat 16, so Live lands on song 2's Verse, 40, and plays on a beat.
    await play(3, 41);

    expect((await armed).connections).toMatchObject([{ name: 'fading', arm: 'armed', pause: null }]);
    expect(fading.cues).toEqual([{ ...FIRST_2, cause: 'play-from-start' }]);
  });

  it('leaves a target the Fade out paused when a jump inside the song lands on its first section after the music came back once', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { fadeOut, lead, liveHas, play } = await pauseRig([fading, cutting], ['fading', 'cutting'], NO_COUNT_OFF);
    // Into song 1's Chorus at 24, through its End into song 2's Verse at 40, and on into its Chorus
    // at 56.
    await play(14, 26);
    await play(15, 41);
    await play(16, 57);
    await fadeOut('fading', 'paused', 'fade-out');
    await play(2, 59);

    await lead({ kind: 'jump', song: 2, section: 0 }, (snapshot) => snapshot.jump?.section === 0);
    await liveHas(JUMP, 1);
    // The bar line is beat 60, so Live lands on song 2's Verse, 40, and plays on a beat.
    await play(2, 41);
    const snapshot = await play(16, 57);

    expect(cutting.cues).toEqual([CHORUS_1, END_1, FIRST_2, CHORUS_2, { ...FIRST_2, cause: 'jump' }, CHORUS_2]);
    expect(fading.cues).toEqual([CHORUS_1, END_1, FIRST_2, CHORUS_2]);
    expect(snapshot.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'fade-out' }, { name: 'cutting' }]);
  });
});

// The word that the music comes back can come with no section cue after it to settle it: on Live's
// first report after a reconnect, or on a tap while stopped. A Fade out after that word makes it
// stale, so only a word said after the Fade out arms the faded targets again.
describe('a Fade out after the word that the music comes back, with no cue since', () => {
  it('leaves a target the Fade out paused when Live reconnects in the first section of a song with no Count Off and Previous restarts it', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { reconnectLive, fadeOut, lead, liveHas, play } = await pauseRig([fading], ['fading'], NO_COUNT_OFF);
    // Live comes back in song 2's Verse, its first section, at 41.
    await reconnectLive(41);
    await play(1, 42);
    await fadeOut('fading', 'paused', 'fade-out');

    await lead({ kind: 'previous' }, (snapshot) => snapshot.jump?.song === 2 && snapshot.jump.section === 0);
    await liveHas(JUMP, 1);
    // The bar line is beat 44, so Live lands on song 2's Verse, 40, and plays on a beat.
    await play(2, 40);
    const snapshot = await play(1, 41);

    expect(snapshot.fade).not.toBeNull();
    expect(snapshot.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'fade-out' }]);
    expect(fading.cues).toEqual([]);
  });

  it('leaves a target the Fade out paused when Live reconnects in a Count Off and Previous restarts it', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { reconnectLive, fadeOut, lead, liveHas, play } = await pauseRig([fading], ['fading']);
    // Live comes back in song 2's Count Off at 41.
    await reconnectLive(41);
    await play(1, 42);
    await fadeOut('fading', 'paused', 'fade-out');

    await lead({ kind: 'previous' }, (snapshot) => snapshot.jump?.song === 2 && snapshot.jump.section === 0);
    await liveHas(JUMP, 1);
    // The bar line is beat 44, so Live lands on song 2's Count Off, 40, and plays on a beat.
    await play(2, 40);
    const snapshot = await play(1, 41);

    expect(snapshot.fade).not.toBeNull();
    expect(snapshot.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'fade-out' }]);
    expect(fading.cues).toEqual([]);
  });

  it("leaves a target the Fade out paused when a tap on song 2's Count Off while stopped is followed by a start at the laptop in song 1 and a jump onto song 1's Count Off", async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const cutting = fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
    const { lead, moveTo, startAtLaptop, fadeOut, liveHas, play } = await pauseRig([fading, cutting], ['fading', 'cutting']);
    await lead({ kind: 'stop' }, (snapshot) => !snapshot.playing);
    // The tap moves the stopped playhead into song 2's Count Off, 40, which raises no cue.
    await lead({ kind: 'jump', song: 2, section: 0 }, (snapshot) => near(snapshot.position, 40));
    // The operator drags the playhead back into song 1's Verse and starts Live there, mid-section, so
    // no cue follows either.
    await moveTo(12);
    await startAtLaptop();
    await fadeOut('fading', 'paused', 'fade-out');
    await play(2, 14);

    await lead({ kind: 'jump', song: 1, section: 0 }, (snapshot) => snapshot.jump?.section === 0);
    await liveHas(JUMP, 2);
    // The bar line is beat 16, so Live lands on song 1's Count Off, 0, and plays on a beat.
    const snapshot = await play(3, 1);

    expect(cutting.cues).toEqual([{ ...played(1, 0, 'Count Off'), cause: 'jump' }]);
    expect(fading.cues).toEqual([]);
    expect(snapshot.connections).toMatchObject([{ name: 'fading', arm: 'paused', pause: 'fade-out' }, { name: 'cutting' }]);
  });
});

describe("the producer's Arm after a Fade out", () => {
  it('arms the faded target at once, which then gets the next section and the Count Off once', async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { fadeOut, arm, play } = await pauseRig([fading], ['fading']);
    await fadeOut('fading', 'paused', 'fade-out');

    const armed = await arm('fading');
    expect(armed.connections).toMatchObject([{ name: 'fading', arm: 'armed', pause: null }]);
    expect(armed.now).toMatchObject({ song: 1 });
    await play(14, 26);
    expect(fading.cues).toEqual([CHORUS_1]);

    await play(15, 41);
    expect(fading.cues).toEqual([CHORUS_1, END_1, COUNT_OFF_2]);
  });
});
