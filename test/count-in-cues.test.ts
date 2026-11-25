import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint, FakeLiveOptions, Track } from '../src/fake-live/fake-live.ts';

import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig, type RigOptions } from './harness.ts';

// What a count-in tells the connection targets: no cue for the Count Off it counts through, one cue
// with the cause count-in where it lands, Play from start's cues for a count-in to the top of the
// song, and the music back, so the landing cue arms again a target a Fade out paused.

let rig: Rig | undefined;
// The folder a test's lateness log goes in, inside the worktree's dist, never the OS temp folder.
let logDir: string | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  if (logDir) await rm(logDir, { recursive: true, force: true });
  logDir = undefined;
});

const REPO_ROOT = resolve(import.meta.dirname, '..');

// At 120 BPM in 4/4 a beat is 500 ms and a bar is 4 beats.
const BEAT_MS = 500;

// Song 1 in 4/4 opens on a Count Off of 2 bars, and ends on a Pad before its End. Song 2 has no Count
// Off. As count-in.test.ts has it.
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
const COUNT_OFF = 0;
const INTRO = 1;
const BRIDGE = 3;

// Both songs open on a Count Off of 2 bars.
const TWO_COUNT_OFFS_SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Bridge', time: 40 },
  { name: '1 - Pad', time: 48 },
  { name: '1 - End', time: 56 },
  { name: '2 - Count Off', time: 64 },
  { name: '2 - Intro', time: 72 },
  { name: '2 - Verse', time: 80 },
  { name: '2 - Bridge', time: 88 },
  { name: '2 - End', time: 96 },
];

// Song 2's Count Off sits on song 1's End, as an overlap builds it.
const OVERLAP_SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 16 },
  { name: '2 - Count Off', time: 16 },
  { name: '2 - Intro', time: 24 },
  { name: '2 - Verse', time: 32 },
  { name: '2 - Bridge', time: 40 },
  { name: '2 - End', time: 56 },
];

// A group with two tracks in it, then two single tracks, as fade-out.test.ts has them. Every volume
// is exact in float32, as OSC carries it.
const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Kick', grouped: true, volume: 0.5 },
  { name: 'Snare', grouped: true, volume: 1 },
  { name: 'Keys', grouped: false, volume: 0.5 },
  { name: 'Bass', grouped: false, volume: 0.25 },
];
const SAVED_VOLUMES = TRACKS.map((track) => track.volume);
// The three top-level tracks the fade steps.
const TOP_LEVEL = 3;

const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';
const GET_VOLUME = '/live/track/get/volume';
const SET_VOLUME = '/live/track/set/volume';

const countIn = (song: number, section: number) => ({ kind: 'count-in', song, section });

// Live reports the playhead as float32, so a position is compared within a hair.
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

// A new, empty folder for a test's lateness log, removed after the test.
async function newLogDir(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  logDir = await mkdtemp(join(REPO_ROOT, 'dist/lateness-'));
  return logDir;
}

// The log's lines, each parsed, or none while there is no file.
async function linesOf(path: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(path, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// A rig whose fake Live starts where `setup` puts it, with the given fake targets online and armed by
// the producer, and a leader connected, once both pages see the set. Every helper waits for the
// producer to see the change it makes, and a cue reaches a target before the pages hear of the change
// that raised it.
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

// Plays a count-in to song 1's Bridge from the Count Off's downbeat to a beat into the Bridge: the
// jump to the Bridge goes to Live on the Count Off's last bar line, beat 4, and Live makes it where
// the Count Off ends, beat 8. `jumps` is how many jumps Live holds before the one to the Bridge.
async function countThroughToBridge({ play, liveHas }: Armed, jumps: number) {
  await play(4, 4);
  await liveHas(JUMP, jumps + 1);
  const counting = await play(3, 7);
  await play(2, 41);
  return counting;
}

describe('a count-in to a later section', () => {
  it('delivers no Count Off cue, and one cue for the target with the cause count-in at the landing', async () => {
    const armed = await armedRig(SET, { playing: false, position: 40 });
    const { target, lead, liveHas, play } = armed;

    await lead(countIn(1, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, 0));
    await liveHas(JUMP, 1);
    expect(target.cues).toEqual([]);
    await countThroughToBridge(armed, 1);
    expect(target.cues).toEqual([{ song: 1, title: null, section: BRIDGE, name: 'Bridge', cause: 'count-in' }]);
    await play(4, 45);

    expect(target.cues).toEqual([{ song: 1, title: null, section: BRIDGE, name: 'Bridge', cause: 'count-in' }]);
  });

  // Which of the jump and the start Live reports first is unconfirmed. Losing the jump to the Count
  // Off has Live start on the Bridge, where it sat; the move after stands in for the jump reported
  // late, as cue-causes.test.ts does for Play from start.
  it('delivers no cue for the section Live sat on when Live reports the start before the jump to the Count Off', async () => {
    const armed = await armedRig(SET, { playing: false, position: 40 });
    const { target, lead, moveTo } = armed;
    rig!.live.loseNext(JUMP);

    await lead(countIn(1, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, 40));
    expect(target.cues).toEqual([]);
    await moveTo(0);
    expect(target.cues).toEqual([]);
    await countThroughToBridge(armed, 0);

    expect(target.cues).toEqual([{ song: 1, title: null, section: BRIDGE, name: 'Bridge', cause: 'count-in' }]);
  });

  it.each([
    { what: 'Live reports the jump first', from: 40, losesJump: false },
    { what: "Live reports the start first, from song 1's Intro", from: 8, losesJump: true },
  ])("delivers no End and no Count Off when the Count Off sits on the previous song's End, when $what", async ({ from, losesJump }) => {
    const { target, lead, liveHas, play, moveTo } = await armedRig(OVERLAP_SET, { playing: false, position: from });
    if (losesJump) rig!.live.loseNext(JUMP);

    await lead(countIn(2, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, losesJump ? from : 16));
    if (losesJump) await moveTo(16);
    expect(target.cues).toEqual([]);
    // The Count Off runs from 16 to 24, so the jump to the Bridge goes at 20 and lands at 24.
    await play(4, 20);
    await liveHas(JUMP, losesJump ? 1 : 2);
    await play(3, 23);
    expect(target.cues).toEqual([]);
    await play(2, 41);

    expect(target.cues).toEqual([{ song: 2, title: null, section: BRIDGE, name: 'Bridge', cause: 'count-in' }]);
  });

  // A stop at the laptop drops Play from start's waiting jump, and no command tells the cues of it.
  it('delivers no Count Off as Play from start after a Play from start Live dropped, when Live reports the start before the jump', async () => {
    const { target, lead, liveHas, play, moveTo, setPlaying } = await armedRig(OVERLAP_SET, { playing: true, position: 4 });
    await lead({ kind: 'set-safe-mode', enabled: false }, (snapshot) => !snapshot.safeMode);
    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.jump?.song === 2);
    await liveHas(JUMP, 1);
    await setPlaying(false);
    rig!.live.loseNext(JUMP);

    await lead(countIn(2, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, 4));
    await moveTo(16);
    expect(target.cues).toEqual([]);
    await play(4, 20);
    await liveHas(JUMP, 2);
    await play(3, 23);
    await play(2, 41);

    expect(target.cues).toEqual([{ song: 2, title: null, section: BRIDGE, name: 'Bridge', cause: 'count-in' }]);
  });

  // Losing the jump to the Bridge has Live play on from the Count Off into the Intro. The report a bar
  // past the bar line Live would have made the jump on proves it lost and ends the count-in there.
  it('delivers the section Live plays on in, with the cause count-in, when the jump to the target is lost', async () => {
    const { target, lead, liveHas, play } = await armedRig(SET, { playing: false, position: 40 });

    await lead(countIn(1, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, 0));
    await liveHas(JUMP, 1);
    rig!.live.loseNext(JUMP);
    await play(4, 4);
    await vi.waitFor(() => expect(rig!.live.lost).toHaveLength(1));
    await play(8, 12);
    expect(target.cues).toEqual([]);
    await play(1, 13);
    expect(target.cues).toEqual([{ song: 1, title: null, section: INTRO, name: 'Intro', cause: 'count-in' }]);
    await play(12, 25);

    expect(target.cues).toEqual([
      { song: 1, title: null, section: INTRO, name: 'Intro', cause: 'count-in' },
      { song: 1, title: null, section: 2, name: 'Verse', cause: 'played-into' },
    ]);
  });

  it('delivers the section Live plays on as played into when the jump to the Count Off is lost', async () => {
    const { target, lead, play } = await armedRig(SET, { playing: false, position: 24 });
    rig!.live.loseNext(JUMP);

    await lead(countIn(1, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, 24));
    await play(1, 25);

    expect(target.cues).toEqual([{ song: 1, title: null, section: 2, name: 'Verse', cause: 'played-into' }]);
  });

  // A Stop pressed while Live's report of the start is still on its way leaves the count-in held until
  // the stop's report, so the start's report is no ordinary start on the Count Off, which would cut
  // the lobby feed to Camera.
  it('delivers no cue when Stop is pressed before Live reports the start', async () => {
    const { target, lead, liveHas } = await armedRig(SET, { playing: false, position: 40 });
    const viewer = await rig!.connectViewer();
    rig!.live.holdReplies();

    await lead(countIn(1, BRIDGE), (snapshot) => snapshot.countIn);
    await liveHas(JUMP, 1);
    const pressed = lead({ kind: 'stop' }, () => true);
    await liveHas(STOP, 1);
    rig!.live.releaseReplies();
    // Live's reports of the start, then of the stop. Every snapshot before them reads Live stopped.
    const started = await viewer.snapshot((snapshot) => snapshot.playing);
    const after = viewer.received.indexOf(started);
    const stopped = await viewer.snapshot((snapshot) => viewer.received.indexOf(snapshot) > after && !snapshot.playing);
    await pressed;

    expect(stopped).toMatchObject({ countIn: false, jump: null });
    expect(target.cues).toEqual([]);
  });
});

describe('a count-in to the top of the song', () => {
  it.each([
    { what: 'Play from start', press: { kind: 'play-from-start', song: 1 } },
    { what: 'a count-in to the Count Off', press: countIn(1, COUNT_OFF) },
    { what: 'a count-in to the Intro', press: countIn(1, INTRO) },
  ])('delivers the Count Off as Play from start, then the Intro, for $what from stopped mid-song', async ({ press }) => {
    const { target, lead, play } = await armedRig(SET, { playing: false, position: 24 });

    await lead(press, (snapshot) => snapshot.playing && near(snapshot.position, 0));
    expect(target.cues).toEqual([{ song: 1, title: null, section: 0, name: 'Count Off', cause: 'play-from-start' }]);
    await play(9, 9);

    expect(target.cues).toEqual([
      { song: 1, title: null, section: 0, name: 'Count Off', cause: 'play-from-start' },
      { song: 1, title: null, section: 1, name: 'Intro', cause: 'played-into' },
    ]);
  });
});

describe('the lateness log', () => {
  it('records the landing cue with the cause count-in, and no line for the Count Off', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const armed = await armedRig(SET, { playing: false, position: 40 }, undefined, { latenessLog: { path } });

    await armed.lead(countIn(1, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, 0));
    await armed.liveHas(JUMP, 1);
    await countThroughToBridge(armed, 1);

    // The landing is reported a beat into the Bridge, 500 ms after its downbeat at 120 BPM.
    await vi.waitFor(async () =>
      expect((await linesOf(path)).map(({ target, section, cause, lateMs }) => ({ target, section, cause, lateMs }))).toEqual([
        { target: 'propresenter', section: 'Bridge', cause: 'count-in', lateMs: 500 },
      ]),
    );
  });
});

describe('a count-in after a Fade out', () => {
  const fading = () => fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
  const cutting = () => fakeTarget({ name: 'cutting', label: 'Cutting', pausesOnFade: false });
  const setsReceived = (count: number) => vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength(count));

  // Fades Live out to silence, which pauses the target that pauses on a fade, then stops it, which sets
  // every volume back at once.
  async function fadeOutAndStop({ sees, lead, play }: Armed) {
    // The steps start once Live has answered every read and reported the playhead after, then run for
    // 6 seconds.
    const paused = sees('fading', 'paused', 'fade-out');
    await lead({ kind: 'fade-out' }, () => true);
    await paused;
    await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(TOP_LEVEL));
    await play(1, 27);
    await rig!.advanceConnected(6000);
    await setsReceived(60 * TOP_LEVEL);

    await lead({ kind: 'stop' }, (snapshot) => !snapshot.playing);
    await setsReceived(61 * TOP_LEVEL);
    expect(rig!.live.volumes()).toEqual(SAVED_VOLUMES);
  }

  it('brings the music back, and its landing cue arms again the target the Fade out paused', async () => {
    const targets = [fading(), cutting()];
    const armed = await armedRig(SET, { playing: true, position: 26, tracks: TRACKS }, targets);
    const { sees, rowOf, lead } = armed;
    await fadeOutAndStop(armed);

    await lead(countIn(1, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, 0));
    await armed.liveHas(JUMP, 1);
    const relanded = sees('fading', 'armed');
    const counting = await countThroughToBridge(armed, 1);
    // Through the count, the target stays paused, and Live plays at the saved volumes.
    expect(rowOf(counting, 'fading')).toMatchObject({ arm: 'paused', pause: 'fade-out' });
    expect((await relanded).connections).toMatchObject([
      { name: 'fading', arm: 'armed', pause: null },
      { name: 'cutting', arm: 'armed', pause: null },
    ]);

    const landing = [{ song: 1, title: null, section: BRIDGE, name: 'Bridge', cause: 'count-in' }];
    expect(targets[0]!.cues).toEqual(landing);
    expect(targets[1]!.cues).toEqual(landing);
    await rig!.advanceConnected(6000);
    expect(rig!.live.volumes()).toEqual(SAVED_VOLUMES);
    expect(rig!.received(SET_VOLUME)).toHaveLength(61 * TOP_LEVEL);
  });

  it('arms the target the Fade out paused again on the section Live plays on in when the jump to the target is lost', async () => {
    const targets = [fading(), cutting()];
    const armed = await armedRig(SET, { playing: true, position: 26, tracks: TRACKS }, targets);
    const { sees, rowOf, lead, play } = armed;
    await fadeOutAndStop(armed);

    await lead(countIn(1, BRIDGE), (snapshot) => snapshot.playing && near(snapshot.position, 0));
    await armed.liveHas(JUMP, 1);
    rig!.live.loseNext(JUMP);
    const rearmed = sees('fading', 'armed');
    await play(4, 4);
    await vi.waitFor(() => expect(rig!.live.lost).toHaveLength(1));
    const counting = await play(8, 12);
    expect(rowOf(counting, 'fading')).toMatchObject({ arm: 'paused', pause: 'fade-out' });
    await play(1, 13);
    expect((await rearmed).connections).toMatchObject([
      { name: 'fading', arm: 'armed', pause: null },
      { name: 'cutting', arm: 'armed', pause: null },
    ]);

    const playedOn = [{ song: 1, title: null, section: INTRO, name: 'Intro', cause: 'count-in' }];
    expect(targets[0]!.cues).toEqual(playedOn);
    expect(targets[1]!.cues).toEqual(playedOn);
  });

  for (const start of ['count-in', 'play-from-start'] as const) {
    it(`arms the target the Fade out paused again when a tap on another song replaces a ${start}`, async () => {
      const target = fading();
      const armed = await armedRig(SET, { playing: true, position: 26, tracks: TRACKS }, [target]);
      const { lead, liveHas, play, rowOf } = armed;
      await fadeOutAndStop(armed);

      const press = start === 'count-in' ? countIn(1, BRIDGE) : { kind: 'play-from-start', song: 1 };
      await lead({ kind: 'set-safe-mode', enabled: false }, (snapshot) => !snapshot.safeMode);
      await lead(press, (snapshot) => snapshot.playing && near(snapshot.position, 0));
      await liveHas(JUMP, 1);
      await play(2, 2);
      await lead({ kind: 'jump', song: 2, section: 1 }, (snapshot) => snapshot.jump?.song === 2);
      await liveHas(JUMP, 2);
      const landed = await play(3, 73);

      expect(rowOf(landed, 'fading')).toMatchObject({ arm: 'armed', pause: null });
      expect(target.cues.at(-1)).toMatchObject({ song: 2, section: 1, name: 'Verse' });
    });

    it(`arms the target the Fade out paused again when a tap on another song replaces a ${start} to a song Live stopped outside`, async () => {
      const target = fading();
      const armed = await armedRig(TWO_COUNT_OFFS_SET, { playing: true, position: 26, tracks: TRACKS }, [target]);
      const { lead, liveHas, play, rowOf } = armed;
      await fadeOutAndStop(armed);

      const press = start === 'count-in' ? countIn(2, BRIDGE) : { kind: 'play-from-start', song: 2 };
      await lead({ kind: 'set-safe-mode', enabled: false }, (snapshot) => !snapshot.safeMode);
      await lead(press, (snapshot) => snapshot.playing && near(snapshot.position, 64));
      await liveHas(JUMP, 1);
      await play(2, 66);
      await lead({ kind: 'jump', song: 1, section: INTRO }, (snapshot) => snapshot.jump?.song === 1);
      await liveHas(JUMP, 2);
      const landed = await play(3, 9);

      expect(rowOf(landed, 'fading')).toMatchObject({ arm: 'armed', pause: null });
      expect(target.cues.at(-1)).toMatchObject({ song: 1, section: INTRO, name: 'Intro' });
    });
  }
});
