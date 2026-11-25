import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { eosKind } from '../src/server/eos.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { connectionsConfigs, SONG_SHOW, startFakeEos, type FakeEos } from './fake-eos.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// setlist-controller#376 pre-PR review 1: the executed proofs of findings 1 and 2. Each case is red
// at 862bf34 and asserts the behaviour the finding's brief asks for. Run it from test/: copy it
// there, run it, and remove the copy. The rig is test/eos.test.ts's lightsRig, cut down.

let rig: Rig | undefined;
let eos: FakeEos | undefined;
const configs = connectionsConfigs();

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  await eos?.close();
  eos = undefined;
  await configs.remove();
});

const SET: CuePoint[] = [
  { name: '1 - Intro (Goodness of God)', time: 0 },
  { name: '1 - Verse 1', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - Bridge', time: 48 },
  { name: '1 - End', time: 64 },
  { name: '2 - Count Off (Great Are You Lord)', time: 64 },
  { name: '2 - Verse 1', time: 72 },
  { name: '2 - Chorus', time: 88 },
  { name: '2 - Tag', time: 104 },
  { name: '2 - End', time: 120 },
];

const BEAT_MS = 500;
const JUMP = '/live/song/cue_point/jump';
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;
const fires = (fake: FakeEos) => fake.received.filter((message) => message.address.endsWith('/fire')).map((message) => message.address);
const fire = (cue: string) => `/eos/cue/1/${cue}/fire`;
const GO_FIRE = '/eos/cues/1/fire';

async function lightsRig(position: number) {
  const fake = await startFakeEos({});
  eos = fake;
  fake.setShow(SONG_SHOW);
  const path = await configs.write({ eos: { host: '127.0.0.1', port: fake.port, cueList: 1 } });
  const started = await startRig(SET, { playing: true, position }, { connectionsConfig: path, targetKinds: { eos: eosKind({ clock: manualClock() }) } });
  rig = started;
  const producer = await started.connectProducer();
  const leader = await started.connectLeader();
  await leader.snapshot(loaded);
  await producer.snapshot(loaded);
  const lights = (snapshot: ProducerSnapshot) => snapshot.connections.find((row) => row.name === 'eos');
  const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
  };
  const press = async (command: unknown) => {
    producer.send(command);
    await producer.flush();
  };
  return {
    fake,
    lights,
    press,
    async read() {
      await producer.snapshot((snapshot) => lights(snapshot)?.connection === 'online' && lights(snapshot)?.check.kind !== 'not-checked');
    },
    async arm() {
      const seen = next((snapshot) => lights(snapshot)?.arm === 'armed');
      producer.send({ kind: 'arm', target: 'eos' });
      await seen;
    },
    async play(beats: number, landsOn: number) {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      started.live.advance(beats * BEAT_MS);
      await seen;
    },
    async lead(command: unknown, gives: (snapshot: ProducerSnapshot) => boolean) {
      const seen = next(gives);
      leader.send(command);
      await seen;
    },
    async jump(song: number, section: number) {
      const sent = started.received(JUMP).length;
      leader.send({ kind: 'jump', song, section });
      await vi.waitFor(() => expect(started.received(JUMP)).toHaveLength(sent + 1));
    },
    async firesSoFar() {
      await press({ kind: 'run-button', target: 'eos', button: 'go' });
      await vi.waitFor(() => expect(fires(fake).at(-1)).toBe(GO_FIRE));
      return fires(fake).slice(0, -1);
    },
  };
}

describe("finding 1: a jump from the song's own Count Off onto its song-start section fires nothing, so the song never gets its look", () => {
  it("fires song 2's cue for a jump from its Count Off onto its Verse 1", async () => {
    const { read, arm, play, jump, firesSoFar } = await lightsRig(60);
    await read();
    await arm();

    // Into song 2's Count Off at 64 from song 1's Bridge, then a jump to song 2's Verse 1: the bar
    // line is beat 68, so Live lands on 72 and plays on a beat.
    await play(5, 65);
    await jump(2, 1);
    await play(4, 73);

    expect(await firesSoFar()).toEqual([fire('6')]);
  });

  it("fires song 2's cue for Play from start onto its Count Off and a jump from there onto its Verse 1", async () => {
    const { read, arm, play, jump, lead, firesSoFar } = await lightsRig(34);
    await read();
    await arm();

    // Play from start of song 2: the bar line is beat 36, so Live lands on its Count Off at 64, which
    // fires nothing, and plays on three beats. Then a jump to its Verse 1 before the Count Off plays
    // out: the bar line is beat 68, so Live lands on 72 and plays on three beats.
    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.jump?.song === 2);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(5, 67);
    await jump(2, 1);
    await play(4, 75);

    expect(await firesSoFar()).toEqual([fire('6')]);
  });
});

describe('finding 2: a Fade out pause leaves the lights judging a jump by the song before the pause', () => {
  it("fires song 1's cue for a jump from song 2 onto song 1's Intro that brings the music back after a Fade out", async () => {
    const { read, arm, play, lead, lights, jump, firesSoFar } = await lightsRig(44);
    await read();
    await arm();

    // Into song 1's Bridge at 48: handed, fires nothing, and the lights keep song 1.
    await play(5, 49);
    await lead({ kind: 'fade-out' }, (snapshot) => lights(snapshot)?.arm === 'paused');
    // A jump to song 2's Chorus while paused: the bar line is beat 52, so Live lands on 88. The cue is
    // never handed to the paused lights.
    await jump(2, 2);
    await play(4, 89);
    // A jump to song 1's Intro, the song-start section of a song with no Count Off, which brings the
    // music back and arms the lights: the bar line is beat 92, so Live lands on 0.
    await jump(1, 0);
    await play(4, 1);

    expect(await firesSoFar()).toEqual([fire('3')]);
  });
});
