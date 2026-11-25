import { afterEach, expect, it, vi } from 'vitest';
import type { CuePoint, FakeLiveOptions, Track } from '../src/fake-live/fake-live.ts';

import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig, type RigOptions } from './harness.ts';

// Repro for docs/reviews/setlist-controller-101/pre-pr-review-1.md, finding 1. Copy into test/ to run.

// After a Fade out and a Stop, the leader counts in to song 1's Bridge, then taps song 2's Verse
// during the count. The music is back at the press, so the target the Fade out paused should be armed
// again and get the Verse's cue, as it is after Play from start into the same tap.

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const BEAT_MS = 500;

const SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Bridge', time: 40 },
  { name: '1 - Pad', time: 48 },
  { name: '1 - End', time: 56 },
  { name: '2 - Intro', time: 64 },
  { name: '2 - Verse', time: 72 },
  { name: '2 - End', time: 80 },
];
const BRIDGE = 3;

const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Kick', grouped: true, volume: 0.5 },
  { name: 'Snare', grouped: true, volume: 1 },
  { name: 'Keys', grouped: false, volume: 0.5 },
  { name: 'Bass', grouped: false, volume: 0.25 },
];
const TOP_LEVEL = 3;

const JUMP = '/live/song/cue_point/jump';
const GET_VOLUME = '/live/track/get/volume';
const SET_VOLUME = '/live/track/set/volume';

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

async function armedRig(
  cuePoints: CuePoint[],
  setup: Pick<FakeLiveOptions, 'playing' | 'position' | 'tracks'>,
  targets: FakeTarget[] = [fakeTarget({ name: 'propresenter', label: 'ProPresenter' })],
  options: Omit<RigOptions, 'targets'> = {},
) {
  const started = await startRig(cuePoints, setup, { ...options, targets });
  rig = started;
  const producer = await started.connectProducer();
  const leader = await started.connectLeader();
  const online = (snapshot: ProducerSnapshot) => loaded(snapshot) && snapshot.connections.every((row) => row.connection === 'online');
  await producer.snapshot((snapshot) => online(snapshot) && near(snapshot.position, setup.position ?? 0));
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
  for (const target of targets) {
    const armed = sees(target.name, 'armed');
    producer.send({ kind: 'arm', target: target.name });
    await armed;
  }

  return {
    target: targets[0]!,
    sees,
    rowOf,
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
    // Plays on for that many beats, and resolves with the snapshot of the playhead where Live then
    // puts it.
    async play(beats: number, landsOn: number) {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      started.live.advance(beats * BEAT_MS);
      return seen;
    },
    // Moves the playhead at once, as a drag at the laptop does.
    async moveTo(beats: number) {
      const seen = next((snapshot) => near(snapshot.position, beats));
      started.live.setPosition(beats);
      await seen;
    },
    // Starts or stops Live at the laptop.
    async setPlaying(playing: boolean) {
      const seen = next((snapshot) => snapshot.playing === playing);
      started.live.setPlaying(playing);
      await seen;
    },
  };
}

type Armed = Awaited<ReturnType<typeof armedRig>>;

const setsReceived = (count: number) => vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength(count));

async function fadeOutAndStop({ sees, lead, play }: Armed) {
  const paused = sees('fading', 'paused', 'fade-out');
  await lead({ kind: 'fade-out' }, () => true);
  await paused;
  await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(TOP_LEVEL));
  await play(1, 27);
  await rig!.advanceConnected(6000);
  await setsReceived(60 * TOP_LEVEL);
  await lead({ kind: 'stop' }, (snapshot) => !snapshot.playing);
  await setsReceived(61 * TOP_LEVEL);
}

for (const start of ['count-in', 'play-from-start'] as const) {
  it(`arms the faded target again when a tap on another song replaces a ${start} after a Fade out`, async () => {
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const armed = await armedRig(SET, { playing: true, position: 26, tracks: TRACKS }, [fading]);
    const { lead, liveHas, play, rowOf } = armed;
    await fadeOutAndStop(armed);

    const press = start === 'count-in' ? { kind: 'count-in', song: 1, section: BRIDGE } : { kind: 'play-from-start', song: 1 };
    await lead(press, (snapshot) => snapshot.playing && near(snapshot.position, 0));
    await liveHas(JUMP, 1);
    await play(2, 2);
    await lead({ kind: 'jump', song: 2, section: 1 }, (snapshot) => snapshot.jump?.song === 2);
    await liveHas(JUMP, 2);
    const landed = await play(3, 73);

    expect(rowOf(landed, 'fading')).toMatchObject({ arm: 'armed', pause: null });
    expect(fading.cues.at(-1)).toMatchObject({ song: 2, section: 1, name: 'Verse' });
  });
}
