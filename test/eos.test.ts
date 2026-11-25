import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { eosKind } from '../src/server/eos.ts';
import { frame } from '../src/server/osc-tcp.ts';
import { encode } from '../src/shared/osc.ts';
import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { connectionsConfigs, RECORDED_FOLLOW_CHAIN, RECORDED_FOLLOW_SHOW, RECORDED_RACING_FIRES, RECORDED_SHOW, SONG_SHOW, startFakeEos, type FakeEos, type FakeEosCue } from './fake-eos.ts';
import { fakeKind, fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// The lights: the Eos target, through the real server against the fake Live, talking OSC over TCP to
// the fake Eos (fake-eos.ts) on a port the OS assigns. No test reaches a real Eos, nor connects to
// Eos's default port 3032, where an ETCnomad on this Mac may listen. The connections config is
// written at test time, inside the worktree's dist, with the fake's port.

let rig: Rig | undefined;
let eos: FakeEos | undefined;
let peer: RawPeer | undefined;
const configs = connectionsConfigs();
// The folder a test's lateness log goes in, inside the worktree's dist, never the OS temp folder.
let logDir: string | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  await eos?.close();
  eos = undefined;
  await peer?.close();
  peer = undefined;
  await configs.remove();
  if (logDir) await rm(logDir, { recursive: true, force: true });
  logDir = undefined;
});

const REPO_ROOT = resolve(import.meta.dirname, '..');

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

// The log's lines but for each one's wall-clock time.
const withoutTime = (lines: Record<string, unknown>[]) => lines.map((line) => Object.fromEntries(Object.entries(line).filter(([key]) => key !== 'time')));

const fixture = (name: string) => resolve(import.meta.dirname, 'fixtures/connections', name);

const rowOf = (snapshot: ProducerSnapshot, name: string): Connection | undefined => snapshot.connections.find((row) => row.name === name);

// The two songs of the recorded show (test/fixtures/eos/README.md), whose labels each name a section,
// and of the one-cue-per-song show (SONG_SHOW), whose labels each name a song.
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

describe('the lights in the connections config', () => {
  it('a bad section disables only the lights, with its problems on the row, and none for the port it leaves out', async () => {
    const fake = fakeTarget({ name: 'fake', label: 'Fake' });
    rig = await startRig(SET, {}, { connectionsConfig: fixture('eos-bad-section.json'), targetKinds: { fake: fakeKind(fake), eos: eosKind({ clock: manualClock() }) } });

    const status = await rig.connectionsStatus((status) => status.connections.some((row) => row.name === 'fake' && row.connection === 'online'));

    expect(status.connections).toEqual([
      expect.objectContaining({ name: 'fake', configured: true, connection: 'online' }),
      expect.objectContaining({
        name: 'eos',
        label: 'Lights',
        configured: false,
        problems: [
          'The lights\' "host" must be the Eos console\'s address, such as "192.168.10.50".',
          'The lights\' "cueList" must be the number of the cue list to follow, a whole number such as 1.',
        ],
      }),
    ]);
  });

  it('a port that is no TCP port, or a cue list that is no whole number, disables the lights', async () => {
    const path = await configs.write({ eos: { host: '127.0.0.1', port: 70000, cueList: 1.5 } });
    rig = await startRig(SET, {}, { connectionsConfig: path, targetKinds: { eos: eosKind({ clock: manualClock() }) } });

    const status = await rig.connectionsStatus();

    expect(status.connections).toEqual([
      expect.objectContaining({
        name: 'eos',
        configured: false,
        problems: [
          'The lights\' "port" must be Eos\'s OSC TCP port, a whole number from 1 to 65535. Leave it out for 3032.',
          'The lights\' "cueList" must be the number of the cue list to follow, a whole number such as 1.',
        ],
      }),
    ]);
  });
});

// How long the lights wait before they connect again; the test's clock moves past it.
const RETRY_MS = 5000;
// How long a read of the cue list may take before the lights give it up.
const READ_TIMEOUT_MS = 10000;
// At 120 BPM in 4/4 a beat is 500 ms and a bar is 4 beats.
const BEAT_MS = 500;
const JUMP = '/live/song/cue_point/jump';
// Live reports the playhead as float32, so a position is compared within a hair.
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

// A rig with Live playing `set` (SET by default), or stopped when not `playing`, at beat `position`, by default in song 1's Intro, with the lights on the fake Eos
// (refusing at first when `refusing`, silent from the start when `silent`, with the recorded show unless `show` gives another), on cue
// list `cueList` (1 by default), on a manual clock of their own, and a leader and a producer
// connected, once the producer sees the set. Given a lateness log, the server writes it there.
async function lightsRig({
  refusing = false,
  silent = false,
  playing = true,
  position = 12,
  show,
  set = SET,
  cueList = 1,
  latenessLog,
}: { refusing?: boolean; silent?: boolean; playing?: boolean; position?: number; show?: FakeEosCue[]; set?: CuePoint[]; cueList?: number; latenessLog?: { path: string } } = {}) {
  const fake = await startFakeEos({ refusing });
  eos = fake;
  if (silent) fake.silence();
  if (show) fake.setShow(show);
  const clock = manualClock();
  const path = await configs.write({ eos: { host: '127.0.0.1', port: fake.port, cueList } });
  const started = await startRig(set, { playing, position }, { connectionsConfig: path, targetKinds: { eos: eosKind({ clock }) }, latenessLog });
  rig = started;
  const producer = await started.connectProducer();
  const leader = await started.connectLeader();
  await leader.snapshot(loaded);
  await producer.snapshot(loaded);
  const lights = (snapshot: ProducerSnapshot) => rowOf(snapshot, 'eos');

  // Resolves with the first snapshot the producer receives from now on that matches.
  const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
  };
  const latest = () => lights(producer.received.at(-1)!);
  // Every line the row shows, in order: the lines it always shows, then the list under them.
  const shown = (row: Connection | undefined) => [...(row?.state ?? []), ...(row?.list ?? [])];
  return {
    fake,
    clock,
    producer,
    leader,
    lights,
    latest,
    next,
    // Resolves once the lights row shows exactly these lines: the lines it always shows, then the
    // capped list under them.
    async shows(lines: string[]) {
      await vi.waitFor(() => expect(shown(latest())).toEqual(lines), { timeout: 2000, interval: 20 });
    },
    // Moves the lights' clock past the pause before a connect again, one late tick at a time, as a
    // stalled event loop does, until the fake has accepted a new connection, then waits for the
    // producer to see the lights online without moving it again. A refused connect is told apart
    // from none only by the time it takes, so the clock moves on until a connect again lands; once
    // one has, a moving clock would only time out its connect or its pings.
    async comesOnline() {
      const before = fake.accepted();
      await vi.waitFor(
        () => {
          if (fake.accepted() === before) clock.stall(RETRY_MS);
          expect(latest()?.connection).toBe('online');
        },
        { timeout: 2000, interval: 20 },
      );
    },
    // Resolves once the lights are online and have read the cue list: the row's check answers only
    // after the read, matched or not.
    async read() {
      await producer.snapshot((snapshot) => lights(snapshot)?.connection === 'online' && lights(snapshot)?.check.kind !== 'not-checked');
    },
    // Resolves with the lights row's first answered check.
    async checked() {
      const snapshot = await producer.snapshot((snapshot) => lights(snapshot)?.connection === 'online' && lights(snapshot)?.check.kind !== 'not-checked');
      return lights(snapshot)!.check;
    },
    async arm() {
      const seen = next((snapshot) => lights(snapshot)?.arm === 'armed');
      producer.send({ kind: 'arm', target: 'eos' });
      await seen;
    },
    // Plays on for that many beats, and waits for the playhead where Live then puts it. A cue reaches
    // the lights before the pages hear of the change that raised it.
    async play(beats: number, landsOn: number) {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      started.live.advance(beats * BEAT_MS);
      await seen;
    },
    // Starts or stops Live at the laptop, once the producer sees it.
    async setPlaying(on: boolean) {
      const seen = next((snapshot) => snapshot.playing === on);
      started.live.setPlaying(on);
      await seen;
    },
    // The leader's command, once the producer sees the snapshot it gives.
    async lead(command: unknown, gives: (snapshot: ProducerSnapshot) => boolean) {
      const seen = next(gives);
      leader.send(command);
      await seen;
    },
    // The leader's jump, once the fake Live holds it.
    async jump(song: number, section: number) {
      if (producer.received.at(-1)?.now?.song !== song) leader.send({ kind: 'set-safe-mode', enabled: false });
      const sent = started.received(JUMP).length;
      leader.send({ kind: 'jump', song, section });
      await vi.waitFor(() => expect(started.received(JUMP)).toHaveLength(sent + 1));
    },
    // The producer's command, once the server has handled it.
    async press(command: unknown) {
      producer.send(command);
      await producer.flush();
    },
    // The lights row's lateness in the producer's latest snapshot, once the server has handled every
    // command the leader and the producer sent and the producer has received every snapshot since.
    async lateness() {
      await leader.flush();
      await producer.flush();
      return latest()!.lateness;
    },
  };
}

// Every cue fire the fake Eos received, by its address, in order.
const fires = (fake: FakeEos) => fake.received.filter((message) => message.address.endsWith('/fire')).map((message) => message.address);
const fire = (cue: string) => `/eos/cue/1/${cue}/fire`;
// The address the producer's Go reaches Eos at, which fires(fake) holds too.
const GO_FIRE = '/eos/cues/1/fire';

// Every cue fire Eos has received up to now, with none still on its way. The producer's Go goes
// last, over the one connection, so once Eos has it, every fire the lights sent before it has
// arrived; the Go itself is left out.
async function firesSoFar(fake: FakeEos, press: (command: unknown) => Promise<void>): Promise<string[]> {
  await press({ kind: 'run-button', target: 'eos', button: 'go' });
  await vi.waitFor(() => expect(fires(fake).at(-1)).toBe(GO_FIRE));
  return fires(fake).slice(0, -1);
}

// SET with a third song whose only section is its Count Off, on song 2's End.
const COUNT_OFF_ONLY_SET: CuePoint[] = [...SET, { name: '3 - Count Off (Way Maker)', time: 120 }, { name: '3 - End', time: 128 }];
// SET with a gap of two bars between song 1's End at 64 and song 2's Count Off, now at 72.
const GAP_SET: CuePoint[] = SET.map((point, at) => (at < 5 ? point : { ...point, time: point.time + 8 }));
// Three songs as the set builder lays them out, as cue-causes.test.ts has them: song 1 overlaps
// into song 2, song 2 pads into song 3, and song 3, last, has its own pad, faded out after Pad Out.
const BUILT_SET: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Count Off (Trust)', time: 40 },
  { name: '2 - Intro', time: 48 },
  { name: '2 - Ending', time: 64 },
  { name: '2 - Pad', time: 72 },
  { name: '2 - End', time: 88 },
  { name: '3 - Count Off (Goodness)', time: 88 },
  { name: '3 - Intro', time: 96 },
  { name: '3 - Ending', time: 112 },
  { name: '3 - Pad', time: 120 },
  { name: '3 - Pad Out', time: 136 },
  { name: '3 - End', time: 152 },
];
const countIn = (song: number, section: number) => ({ kind: 'count-in', song, section });

// The song cue fires on the song's song-start section: its Count Off, and its first section when it
// has no Count Off. In SET, song 1 has no Count Off, so its song-start section is its Intro at 0;
// song 2's is its Count Off at 64. In SONG_SHOW, cue 3 is song 1's and cue 6 is song 2's.
describe('the lights armed', () => {
  it('fire the song cue once as the playhead plays through a song with a Count Off, on the Count Off, and nothing else, the End included', async () => {
    const { fake, read, arm, play, press } = await lightsRig({ show: SONG_SHOW });
    await read();
    await arm();

    // Song 1's Verse 1, Chorus and Bridge, then its End and song 2's Count Off at 64.
    await play(5, 17);
    await play(16, 33);
    await play(16, 49);
    await play(16, 65);
    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
    // Song 2's Verse 1 at 72, Chorus, Tag and End at 120.
    await play(8, 73);
    await play(16, 89);
    await play(16, 105);
    await play(16, 121);

    expect(await firesSoFar(fake, press)).toEqual([fire('6'), GO_FIRE]);
    // Each fire is the address alone, with no argument.
    expect(fake.received.filter((message) => message.address.endsWith('/fire')).every((message) => message.args.length === 0)).toBe(true);
  });

  it("never fire a cue labelled with the song's title and a section, only the song's own cue", async () => {
    const show = [...SONG_SHOW, { number: '9', label: 'Goodness of God / Intro' }, { number: '10', label: 'Great Are You Lord / Count Off' }];
    const { fake, read, arm, play, press } = await lightsRig({ show, position: 60 });
    await read();
    await arm();

    await play(5, 65);

    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
  });

  it('fire the song cue on the first section of a song with no Count Off, here on Play from start', async () => {
    const { fake, read, arm, lead, play, press } = await lightsRig({ show: SONG_SHOW, position: 34 });
    await read();
    await arm();

    await lead({ kind: 'play-from-start', song: 1 }, (snapshot) => snapshot.jump?.song === 1);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    // The bar line is beat 36, so Live lands on song 1's Intro, 0, and plays on two beats.
    await play(4, 2);

    expect(await firesSoFar(fake, press)).toEqual([fire('3')]);
  });

  it('fire the song cue on the Count Off of a song whose only section is the Count Off', async () => {
    const show = [...SONG_SHOW, { number: '20', label: 'Way Maker' }];
    const { fake, read, arm, play, press } = await lightsRig({ show, set: COUNT_OFF_ONLY_SET, position: 116 });
    await read();
    await arm();

    await play(5, 121);

    expect(await firesSoFar(fake, press)).toEqual([fire('20')]);
  });

  it('fire the song cue for a Play from start that lands on the Count Off, and nothing on playing on into the section after it', async () => {
    const { fake, read, arm, lead, play, press } = await lightsRig({ show: SONG_SHOW, position: 34 });
    await read();
    await arm();

    await lead({ kind: 'set-safe-mode', enabled: false }, (snapshot) => !snapshot.safeMode);
    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.jump?.song === 2);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    // The bar line is beat 36, so Live lands on song 2's Count Off, 64, and plays on three beats.
    await play(5, 67);
    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
    await play(6, 73);
    await play(16, 89);

    expect(await firesSoFar(fake, press)).toEqual([fire('6'), GO_FIRE]);
  });

  it('fire the song cue on the Count Off for a count-in onto the section after it, which is Play from start', async () => {
    const { fake, read, arm, lead, play, press } = await lightsRig({ show: SONG_SHOW, playing: false, position: 40 });
    await read();
    await arm();

    // A count-in to song 2's Verse 1, the section after its Count Off, starts Live on the Count Off
    // at 64, and plays on two beats.
    await lead(countIn(2, 1), (snapshot) => snapshot.playing && near(snapshot.position, 64));
    await play(2, 66);
    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
    // On into Verse 1 at 72.
    await play(7, 73);

    expect(await firesSoFar(fake, press)).toEqual([fire('6'), GO_FIRE]);
  });

  // A count-in onto a later section fires no song cue: the server hands no cue for the Count Off it
  // counts through, and its landing is never on the Count Off, even after a tap moves it onto the
  // section after the Count Off.
  it('fire nothing for a count-in moved onto the section after the Count Off', async () => {
    const { fake, read, arm, lead, play, press } = await lightsRig({ show: SONG_SHOW, playing: false, position: 40 });
    await read();
    await arm();

    // A count-in to song 2's Chorus starts Live on its Count Off at 64, and a tap on its Verse 1
    // moves the held count-in onto Verse 1, the section after the Count Off, which Live plays on
    // into at 72 with no jump.
    await lead(countIn(2, 2), (snapshot) => snapshot.playing && near(snapshot.position, 64));
    await lead({ kind: 'jump', song: 2, section: 1 }, (snapshot) => snapshot.jump?.song === 2 && snapshot.jump.section === 1);
    await play(2, 66);
    expect(await firesSoFar(fake, press)).toEqual([]);
    await play(7, 73);

    expect(await firesSoFar(fake, press)).toEqual([GO_FIRE]);
  });

  it('fire nothing for a count-in onto a later section', async () => {
    const { fake, read, arm, lead, play, press } = await lightsRig({ show: SONG_SHOW, playing: false, position: 40 });
    await read();
    await arm();

    // The jump to song 2's Chorus goes to Live on the Count Off's last bar line, 68, and Live makes
    // it where the Count Off ends, 72.
    await lead(countIn(2, 2), (snapshot) => snapshot.playing && near(snapshot.position, 64));
    await play(4, 68);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(2));
    await play(3, 71);
    await play(2, 89);

    expect(await firesSoFar(fake, press)).toEqual([]);
  });

  it.each([
    { what: 'in the middle of the song-start section, the Count Off', position: 66, landsOn: 68 },
    { what: "on a later section's locator, the Chorus", position: 88, landsOn: 90 },
  ])('fire nothing for a start $what', async ({ position, landsOn }) => {
    const { fake, read, arm, setPlaying, play, press } = await lightsRig({ show: SONG_SHOW, playing: false, position });
    await read();
    await arm();

    await setPlaying(true);
    await play(2, landsOn);

    expect(await firesSoFar(fake, press)).toEqual([]);
  });

  it('fire nothing on the wraps of a loop on the song-start section', async () => {
    const { fake, read, arm, lead, play, press } = await lightsRig({ show: SONG_SHOW, position: 66 });
    await read();
    await arm();

    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.song === 2 && snapshot.loop.section.section === 0);
    // The loop's brace is song 2's Count Off, 64 to 72. Live reports only where the playhead ends
    // up, so each wrap lands behind the last.
    await play(7, 65);
    await play(7.5, 64.5);

    expect(await firesSoFar(fake, press)).toEqual([]);
  });

  it('fire nothing for a jump inside the song onto its song-start section', async () => {
    const { fake, read, arm, jump, play, press } = await lightsRig({ show: SONG_SHOW, position: 84 });
    await read();
    await arm();

    // Into song 2's Chorus at 88, handed and not fired, then a jump to its Count Off: the bar line is
    // beat 92, so Live lands on 64 and plays on a beat.
    await play(5, 89);
    await jump(2, 0);
    await play(4, 65);

    expect(await firesSoFar(fake, press)).toEqual([]);
  });

  it("fire the song cue for a jump onto the song-start section after the producer's Arm, which forgets the song the lights were last handed", async () => {
    const { fake, read, arm, jump, play, press } = await lightsRig({ show: SONG_SHOW, position: 84 });
    await read();
    await arm();

    // Into song 2's Chorus at 88, then the producer's Arm again, then a jump to its Count Off: the
    // bar line is beat 92, so Live lands on 64 and plays on a beat.
    await play(5, 89);
    await press({ kind: 'arm', target: 'eos' });
    await jump(2, 0);
    await play(4, 65);

    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
  });

  it("fire the song cue for a jump from another song onto its song-start section, either way through the set", async () => {
    const { fake, read, arm, jump, play, press } = await lightsRig({ show: SONG_SHOW, position: 44 });
    await read();
    await arm();

    // Into song 1's Bridge at 48, handed and not fired, then a jump to song 2's Count Off: the bar
    // line is beat 52, so Live lands on 64 and plays on a beat.
    await play(5, 49);
    await jump(2, 0);
    await play(4, 65);
    // Through song 2's Verse 1 into its Chorus at 88, then a jump to song 1's Intro: the bar line is
    // beat 92.
    await play(8, 73);
    await play(16, 89);
    await jump(1, 0);
    await play(4, 1);

    expect(await firesSoFar(fake, press)).toEqual([fire('6'), fire('3')]);
  });

  it("fire the song cue on playing into the Count Off, and nothing for a jump from the song's own Count Off onto the section after it", async () => {
    const { fake, read, arm, jump, play, press } = await lightsRig({ show: SONG_SHOW, position: 60 });
    await read();
    await arm();

    // Into song 2's Count Off at 64 from song 1's Bridge, then a jump to song 2's Verse 1: the bar
    // line is beat 68, so Live lands on 72 and plays on a beat.
    await play(5, 65);
    await jump(2, 1);
    await play(4, 73);

    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
  });

  it('fire the song cue once for Play from start onto the Count Off, and nothing for a jump from there onto the section after it', async () => {
    const { fake, read, arm, lead, jump, play, press } = await lightsRig({ show: SONG_SHOW, position: 34 });
    await read();
    await arm();

    // Play from start of song 2: the bar line is beat 36, so Live lands on its Count Off at 64 and
    // plays on three beats. Then a jump to its Verse 1 before the Count Off plays out: the bar line
    // is beat 68, so Live lands on 72 and plays on three beats.
    await lead({ kind: 'set-safe-mode', enabled: false }, (snapshot) => !snapshot.safeMode);
    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.jump?.song === 2);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(5, 67);
    await jump(2, 1);
    await play(4, 75);

    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
  });

  it("fire nothing for a jump back onto the song's own Count Off once the lights are inside the song, nor for a jump from there onto the section after it", async () => {
    const { fake, read, arm, jump, play, press } = await lightsRig({ show: SONG_SHOW, position: 84 });
    await read();
    await arm();

    // Into song 2's Chorus at 88, then a jump back to its Count Off: the bar line is beat 92, so Live
    // lands on 64 and plays on a beat. Then a jump to its Verse 1: the bar line is beat 68, so Live
    // lands on 72 and plays on a beat.
    await play(5, 89);
    await jump(2, 0);
    await play(4, 65);
    await jump(2, 1);
    await play(4, 73);

    expect(await firesSoFar(fake, press)).toEqual([]);
  });

  it("fire the song cue for a jump from another song's Count Off back onto the song-start section, since that Count Off is inside the other song", async () => {
    const { fake, read, arm, jump, play, press } = await lightsRig({ show: SONG_SHOW, position: 12 });
    await read();
    await arm();

    // Into song 1's Verse 1 at 16, then a jump to song 2's Count Off: the bar line is beat 20, so Live
    // lands on 64 and plays on a beat. Then a jump back to song 1's Intro: the bar line is beat 68, so
    // Live lands on 0 and plays on a beat.
    await play(5, 17);
    await jump(2, 0);
    await play(4, 65);
    await jump(1, 0);
    await play(4, 1);

    expect(await firesSoFar(fake, press)).toEqual([fire('6'), fire('3')]);
  });

  it("fire each song cue of a built set once, on its Count Off, a Count Off on the song before's End included, and nothing for an Intro, an Ending, a Pad, a Pad Out or an End", async () => {
    const show = [
      { number: '1', label: 'Grace' },
      { number: '2', label: 'Trust' },
      { number: '3', label: 'Goodness' },
    ];
    const { fake, read, arm, setPlaying, play, press } = await lightsRig({ show, set: BUILT_SET, playing: false, position: 0 });
    await read();
    await arm();

    // Live starts on song 1's Count Off at 0, plays into song 2's Count Off on song 1's End at 40,
    // and into song 3's Count Off at 88, each before the Intro after it.
    await setPlaying(true);
    await play(4, 4);
    await vi.waitFor(() => expect(fires(fake)).toEqual([fire('1')]));
    for (let at = 8; at <= 44; at += 4) await play(4, at);
    await vi.waitFor(() => expect(fires(fake)).toEqual([fire('1'), fire('2')]));
    for (let at = 48; at <= 92; at += 4) await play(4, at);
    await vi.waitFor(() => expect(fires(fake)).toEqual([fire('1'), fire('2'), fire('3')]));
    for (let at = 96; at <= 152; at += 4) await play(4, at);

    expect(await firesSoFar(fake, press)).toEqual([fire('1'), fire('2'), fire('3')]);
  });

  it.each([
    { where: 'its Count Off', position: 66 },
    { where: 'its Chorus', position: 90 },
  ])("fire song 2's cue on Fire again during $where", async ({ position }) => {
    const { fake, read, arm, press } = await lightsRig({ show: SONG_SHOW, position });
    await read();
    await arm();

    await press({ kind: 'fire-again', target: 'eos' });

    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
  });

  it('send nothing on Fire again with the playhead between songs', async () => {
    const { fake, read, arm, press } = await lightsRig({ show: SONG_SHOW, set: GAP_SET, position: 66 });
    await read();
    await arm();

    await press({ kind: 'fire-again', target: 'eos' });

    expect(await firesSoFar(fake, press)).toEqual([]);
  });

  it("are armed again by the next song's Count Off after the leader's Fade out, and fire its song cue on that Count Off alone", async () => {
    const { fake, read, arm, lead, lights, play, latest, press } = await lightsRig({ show: SONG_SHOW, position: 52 });
    await read();
    await arm();

    await lead({ kind: 'fade-out' }, (snapshot) => lights(snapshot)?.arm === 'paused');
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'fade-out' }));
    // Through song 1's End into song 2's Count Off at 64, which arms the lights again.
    await play(13, 65);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
    await play(8, 73);

    expect(await firesSoFar(fake, press)).toEqual([fire('6'), GO_FIRE]);
  });
});

describe("a cue's label", () => {
  // Each test plays into song 2's Count Off, its song-start section, from 60, unless it says otherwise.
  it('matches the song title by the shared name rule, ignoring case and extra spaces', async () => {
    const show = SONG_SHOW.map((cue) => (cue.number === '6' ? { ...cue, label: ' great  are YOU lord ' } : cue));
    const { fake, read, arm, play, press } = await lightsRig({ show, position: 60 });
    await read();
    await arm();

    await play(5, 65);

    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
  });

  it('needs the whole label: one that holds the title and more fires nothing', async () => {
    const show = SONG_SHOW.map((cue) => (cue.number === '6' ? { ...cue, label: 'Great Are You Lord / Count Off' } : cue.number === '2' ? { ...cue, label: 'Great Are You Lord Reprise' } : cue));
    const { fake, read, arm, play, press } = await lightsRig({ show, position: 60 });
    await read();
    await arm();

    await play(5, 65);

    expect(await firesSoFar(fake, press)).toEqual([]);
  });

  it('matches a title that holds " / " against the whole label', async () => {
    // The song's song-start section is its Count Off, where Live starts.
    const set: CuePoint[] = [
      { name: '1 - Count Off (Here / There)', time: 0 },
      { name: '1 - Intro', time: 8 },
      { name: '1 - Verse   1', time: 16 },
      { name: '1 - End', time: 32 },
    ];
    const show = [
      { number: '1', label: 'Here / There / Intro' },
      { number: '2', label: 'here /  there' },
    ];
    const { fake, read, arm, setPlaying, play, press } = await lightsRig({ set, show, playing: false, position: 0 });
    await read();
    await arm();

    await setPlaying(true);
    await play(2, 2);

    expect(await firesSoFar(fake, press)).toEqual([fire('2')]);
  });

  it('fires the first in list order of two cues with one label', async () => {
    const show = SONG_SHOW.map((cue) => (cue.number === '7' ? { ...cue, label: 'great are you lord' } : cue));
    const { fake, read, arm, play, press } = await lightsRig({ show, position: 60 });
    await read();
    await arm();

    await play(5, 65);

    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
  });

  it('fires nothing for a song with no title, even for a cue labelled with the name the page gives it', async () => {
    const set: CuePoint[] = [
      { name: '1 - Intro (Way Maker)', time: 0 },
      { name: '1 - End', time: 16 },
      { name: '2 - Intro', time: 16 },
      { name: '2 - Verse 1', time: 32 },
      { name: '2 - End', time: 48 },
    ];
    const show = [
      { number: '1', label: 'Song 2' },
      { number: '2', label: '' },
      { number: '3', label: 'Way Maker' },
    ];
    const { fake, read, arm, play, press } = await lightsRig({ set, show });
    await read();
    await arm();

    // Through song 1's End into song 2's Intro at 16, its song-start section.
    await play(5, 17);

    expect(await firesSoFar(fake, press)).toEqual([]);
  });
});

describe('a multipart cue', () => {
  it("finishes the read, fires the song's base cue, and never fires a part labelled with the song's title", async () => {
    // Cue 2 has a part 2, at its own index before cue 3, labelled with song 1's title, as cue 3 is.
    const show = [...SONG_SHOW.slice(0, 2), { number: '2', part: 2, label: 'Goodness of God' }, ...SONG_SHOW.slice(2)];
    const { fake, read, arm, lead, play, press } = await lightsRig({ show, position: 34 });
    await read();
    await arm();

    // Play from start of song 1: the bar line is beat 36, so Live lands on its Intro, 0, its
    // song-start section, and plays on two beats.
    await lead({ kind: 'play-from-start', song: 1 }, (snapshot) => snapshot.jump?.song === 1);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(4, 2);

    expect(await firesSoFar(fake, press)).toEqual([fire('3')]);
  });
});

// The recorded show's cue list as the lights row shows it, in list order.
const RECORDED_LIST = [
  'Cue 1: Goodness of God / Intro',
  'Cue 2: Goodness of God / Verse 1',
  'Cue 3: Goodness of God / Chorus',
  'Cue 3.5: Goodness of God / Bridge',
  'Cue 4: Goodness of God / End',
  'Cue 5: Great Are You Lord / Count Off',
  'Cue 6: Great Are You Lord / Verse 1',
  'Cue 7: Great Are You Lord / Chorus',
  'Cue 8',
];
// The one-cue-per-song show's cue list as the lights row shows it, in list order.
const SONG_LIST = SONG_SHOW.map(({ number, label }) => (label === '' ? `Cue ${number}` : `Cue ${number}: ${label}`));

describe('the cue list on the lights row', () => {
  it('lists every cue with its number and label, in list order, once the read finishes', async () => {
    const { shows } = await lightsRig();

    // After the live cue: the recorded show is on cue 8 when the lights connect.
    await shows(['Live cue 8', ...RECORDED_LIST]);
  });

  it('lists the show Eos holds, and the new list after a Refresh', async () => {
    const { fake, shows, leader } = await lightsRig({ show: [{ number: '10', label: 'Way Maker / Intro' }, { number: '10.5', label: '' }] });
    await shows(['Cue 10: Way Maker / Intro', 'Cue 10.5']);

    fake.setShow([{ number: '20', label: 'Way Maker / Outro' }]);
    leader.send({ kind: 'refresh' });

    await shows(['Cue 20: Way Maker / Outro']);
  });

  it('says so when the cue list has no cues, as one that does not exist', async () => {
    const { shows, latest } = await lightsRig({ cueList: 2 });

    await shows(['Cue list 2 has no cues.']);
    expect(latest()).toMatchObject({ state: [], list: ['Cue list 2 has no cues.'] });
  });

  it('reports the live cue as the lines the row always shows, and the cue list as the list it caps under them', async () => {
    const { fake, read, shows, latest } = await lightsRig();
    await read();
    await shows(['Live cue 8', ...RECORDED_LIST]);
    expect(latest()).toMatchObject({ state: ['Live cue 8'], list: RECORDED_LIST });

    fake.fireByHand('6');
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);
    expect(latest()).toMatchObject({ state: ['Live cue 6: Great Are You Lord / Verse 1'], list: RECORDED_LIST });
  });

  it("marks the live cue's line in the list, moves the mark with each fire, and marks none for a cue not in the list", async () => {
    const { fake, read, shows, latest, producer, lights, next } = await lightsRig();
    await read();
    // The recorded show is on cue 8, the list's last line.
    await shows(['Live cue 8', ...RECORDED_LIST]);
    expect(latest()?.listCurrent).toBe(8);
    // Before the read finished the row had no list, and so no line marked.
    for (const snapshot of producer.received) {
      const row = lights(snapshot);
      if (row?.list.length === 0) expect(row.listCurrent).toBeNull();
    }

    fake.fireByHand('6');
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);
    expect(latest()?.listCurrent).toBe(6);

    const outside = next((snapshot) => lights(snapshot)?.state[0] === 'Live cue 99: Not in the list');
    fake.emit('/eos/out/event/cue/1/99/fire', ['Not in the list']);
    expect(lights(await outside)?.listCurrent).toBeNull();
  });

  it('marks no line of a cue list with no cues', async () => {
    const { shows, latest } = await lightsRig({ cueList: 2 });

    await shows(['Cue list 2 has no cues.']);
    expect(latest()?.listCurrent).toBeNull();
  });
});

describe('the live cue on the lights row', () => {
  it('shows the cue Eos is on as soon as the lights connect, from what Eos sends on connect, before any cue fires', async () => {
    const { fake, read, shows, producer, lights } = await lightsRig();
    await read();

    // The recorded show is on cue 8, which has no label.
    await shows(['Live cue 8', ...RECORDED_LIST]);
    // No snapshot showed the row with lines and no live cue.
    const rows = producer.received.map((snapshot) => lights(snapshot)).filter((row) => (row?.state.length ?? 0) + (row?.list.length ?? 0) > 0);
    expect(rows.every((row) => row?.state[0] === 'Live cue 8')).toBe(true);
    // Nothing fired: the lights are disarmed, and nobody touched the console.
    expect(fires(fake)).toEqual([]);
  });

  it('takes the label of the cue Eos is on at connect from the cue list, once the read finishes', async () => {
    const { fake, arm, comesOnline, shows, latest } = await lightsRig({ refusing: true });
    // The producer arms the lights while Eos is still offline, so a pause on connect would show.
    await arm();
    // Go To Cue 6 at the console while Eos refuses the lights.
    fake.fireByHand('6');

    await fake.accept();
    await comesOnline();

    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);
    // The first connect has no live cue before it to judge cue 6 against: nothing pauses.
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it("shows each cue Eos fires for the lights armed, from Eos's fire event, a decimal cue too", async () => {
    // Song 2's cue is the decimal cue 6.5.
    const show = [...SONG_SHOW.slice(0, 7).map((cue) => (cue.number === '6' ? { ...cue, label: '' } : cue)), { number: '6.5', label: 'Great Are You Lord' }, ...SONG_SHOW.slice(7)];
    const list = show.map(({ number, label }) => (label === '' ? `Cue ${number}` : `Cue ${number}: ${label}`));
    const { press, read, arm, play, shows } = await lightsRig({ show, position: 28 });
    await read();
    await arm();
    await shows([...list]);

    // Into song 1's Chorus at 32 and Fire again: the fake answers the fire of cue 3.
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...list]);

    // Into song 2's Count Off at 64: cue 6.5.
    await play(32, 65);
    await shows(['Live cue 6.5: Great Are You Lord', ...list]);
  });

  it('shows a cue fired by hand at the console with the lights disarmed, and an unlabelled cue by its number alone', async () => {
    const { fake, read, shows, latest } = await lightsRig();
    await read();
    await shows(['Live cue 8', ...RECORDED_LIST]);
    expect(latest()?.arm).toBe('disarmed');

    // Go To Cue 6 at the console, as recorded.
    fake.fireByHand('6');
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);

    fake.fireByHand('8');
    await shows(['Live cue 8', ...RECORDED_LIST]);
    // A fire by hand leaves the lights disarmed: they have nothing to stop.
    expect(latest()).toEqual(expect.objectContaining({ arm: 'disarmed', pause: null }));
  });

  it('keeps the live cue on a fire in another cue list, on a stop event, and on the active cue Eos sends after a fire', async () => {
    const { fake, read, shows, producer, lights } = await lightsRig();
    await read();
    fake.fireByHand('6');
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);
    const since = producer.received.length;

    // Each is followed by a fire by hand: Eos sends in order, so the row has taken the one before by
    // the time it shows the fire.
    fake.emit('/eos/out/event/cue/2/4/fire', ['Another List / Cue 4']);
    fake.fireByHand('7');
    await shows(['Live cue 7: Great Are You Lord / Chorus', ...RECORDED_LIST]);
    // Back during a fade, as recorded: a stop of cue 0.
    fake.emit('/eos/out/event/cue/1/0/stop', ['']);
    fake.fireByHand('5');
    await shows(['Live cue 5: Great Are You Lord / Count Off', ...RECORDED_LIST]);
    // The active cue alone, of a cue that has not fired: only the cue Eos is on at connect is taken.
    fake.emit('/eos/out/active/cue/1/3', [1]);
    fake.fireByHand('6');
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);

    // The row never showed any other live cue in between.
    const liveLines = producer.received.slice(since).map((snapshot) => lights(snapshot)?.state[0]);
    expect(new Set(liveLines)).toEqual(new Set(['Live cue 7: Great Are You Lord / Chorus', 'Live cue 5: Great Are You Lord / Count Off', 'Live cue 6: Great Are You Lord / Verse 1']));
  });

  it('clears the row while the lights are offline, and shows the cue Eos is on once they are back', async () => {
    const { fake, read, shows, next, lights, comesOnline, latest } = await lightsRig();
    await read();
    fake.fireByHand('6');
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    expect(latest()).toMatchObject({ state: [], list: [] });

    await fake.accept();
    await comesOnline();
    // Cue 6, fired by hand before the drop, from what Eos sends on connect.
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);
  });
});

describe('Refresh on the lights', () => {
  it("reads the cue list again, so the next song-start section fires the song's cue under its new number", async () => {
    const { fake, read, arm, play, leader, shows, press } = await lightsRig({ show: SONG_SHOW, position: 60 });
    await read();
    await arm();
    // Song 2's label moves from cue 6 to a new cue 9 at the console.
    fake.setShow([...SONG_SHOW.map((cue) => (cue.number === '6' ? { ...cue, label: '' } : cue)), { number: '9', label: 'Great Are You Lord' }]);

    leader.send({ kind: 'refresh' });
    // The row shows the new list once the lights have read it.
    await shows([...SONG_LIST.map((line) => (line.startsWith('Cue 6:') ? 'Cue 6' : line)), 'Cue 9: Great Are You Lord']);
    // Into song 2's Count Off at 64, its song-start section.
    await play(5, 65);

    expect(await firesSoFar(fake, press)).toEqual([fire('9')]);
  });
});

// Eos tells a subscribed connection that a cue changed with a notify about 1 s after the edit, at
// the keypad and on the OSC command line alike (cue-edit-at-keypad-subscribed.json,
// cue-edit-at-console-subscribed.json), so the lights subscribe on every connect and read the cue
// list again on each notify.
const SUBSCRIBE = { address: '/eos/subscribe', args: [1] };
const subscribes = (fake: FakeEos) => fake.received.filter((message) => message.address === '/eos/subscribe').map(({ address, args }) => ({ address, args }));
const counts = (fake: FakeEos) => fake.received.filter((message) => message.address === '/eos/get/cue/1/count').length;

describe('a cue edited at the console while the lights are connected', () => {
  it('subscribes on every connect, a connect again included', async () => {
    const { fake, read, comesOnline, next, lights } = await lightsRig();
    await read();
    expect(subscribes(fake)).toEqual([SUBSCRIBE]);

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    await fake.accept();
    await comesOnline();

    await vi.waitFor(() => expect(subscribes(fake)).toEqual([SUBSCRIBE, SUBSCRIBE]));
  });

  it.each([
    { edit: 'recorded', show: [...RECORDED_SHOW.slice(0, 4), { number: '3.7', label: 'Goodness of God / Tag' }, ...RECORDED_SHOW.slice(4)], notify: 3.7, list: [...RECORDED_LIST.slice(0, 4), 'Cue 3.7: Goodness of God / Tag', ...RECORDED_LIST.slice(4)] },
    { edit: 'renumbered', show: RECORDED_SHOW.map((cue) => (cue.number === '3.5' ? { ...cue, number: '3.7' } : cue)), notify: '3.5-3.7', list: RECORDED_LIST.map((line) => line.replace('Cue 3.5:', 'Cue 3.7:')) },
    { edit: 'deleted', show: RECORDED_SHOW.filter((cue) => cue.number !== '3.5'), notify: 3.5, list: RECORDED_LIST.filter((line) => !line.startsWith('Cue 3.5:')) },
  ])('reads the cue list again on the notify for a cue $edit, and the row lists the edited list', async ({ show, notify, list }) => {
    const { fake, read, shows } = await lightsRig();
    await read();

    fake.editShow(show, { notify });

    await shows(['Live cue 8', ...list]);
  });

  it('reads the cue list again once a read in flight when the notify comes ends, and the row ends on the edited list', async () => {
    const { fake, read, leader, shows, latest } = await lightsRig();
    await read();
    await shows(['Live cue 8', ...RECORDED_LIST]);
    const before = counts(fake);

    // Refresh starts a read, and the notify comes before its first reply.
    fake.holdReads();
    leader.send({ kind: 'refresh' });
    await vi.waitFor(() => expect(counts(fake)).toBe(before + 1));
    fake.editShow(
      RECORDED_SHOW.filter((cue) => cue.number !== '3.5'),
      { notify: 3.5 },
    );
    fake.releaseReads();

    await shows(['Live cue 8', ...RECORDED_LIST.filter((line) => !line.startsWith('Cue 3.5:'))]);
    // The notify's read, once in full, runs the check again on the edited list, which reads it once more.
    await vi.waitFor(() => expect(latest()?.check).toEqual({ kind: 'unmatched', names: ['Goodness of God: no cue', 'Great Are You Lord: no cue'], problems: [], notes: [] }));
    await vi.waitFor(() => expect(counts(fake)).toBe(before + 3));
  });

  it('never reads the cue list again for a cue list notify, nor for a cue notify of another cue list', async () => {
    const { fake, read } = await lightsRig();
    await read();
    const before = counts(fake);

    fake.emit('/eos/out/notify/cuelist/list/0/2', [{ int: 1 }, { int: 1 }]);
    fake.emit('/eos/out/notify/cue/2/list/0/2', [{ int: 2 }, { int: 4 }]);
    // Nothing tells when the lights have handled both, so the test gives them a moment on loopback.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(counts(fake)).toBe(before);
  });
});

describe('the pre-service check on the lights', () => {
  // The recorded show's check: its labels each name a section, so no cue carries a song's title.
  const RECORDED_CHECK = { kind: 'unmatched' as const, names: ['Goodness of God: no cue', 'Great Are You Lord: no cue'], problems: [], notes: [] };
  const MATCHED = { kind: 'matched' as const, passText: 'Every song has a cue.', notes: [] };
  const isCheck = (check: Connection['check']) => (row: Connection | undefined) => JSON.stringify(row?.check) === JSON.stringify(check);

  it('names each song of the set with no cue in the recorded show, and no line for any of its section labels', async () => {
    const { checked } = await lightsRig();

    expect(await checked()).toEqual(RECORDED_CHECK);
  });

  it('is matched, with the lights\' pass text, when one cue each is labelled with every song title of the set', async () => {
    const { checked } = await lightsRig({ show: SONG_SHOW });

    expect(await checked()).toEqual(MATCHED);
  });

  it('is still matched with old section labels in the cue list beside the song cues', async () => {
    const show = [...SONG_SHOW, { number: '9', label: 'Goodness of God / Chorus' }, { number: '10', label: 'Great Are You Lord / Tag' }, { number: '11', label: 'great are you lord /  END' }];
    const { checked } = await lightsRig({ show });

    expect(await checked()).toEqual(MATCHED);
  });

  it('names each cue that never fires because an earlier cue has the same label, by both cue numbers', async () => {
    const show = [...SONG_SHOW, { number: '11', label: 'goodness of god  ' }, { number: '12', label: 'Goodness of God' }];
    const { checked } = await lightsRig({ show });

    expect(await checked()).toEqual({
      kind: 'unmatched',
      names: [],
      problems: ['Goodness of God: cue 11 never fires, cue 3 has the same label', 'Goodness of God: cue 12 never fires, cue 3 has the same label'],
      notes: [],
    });
  });

  it('names no cue with the same label that Eos fires by itself after the cue that fires, on a follow, a hang or a link, a chase that loops included', async () => {
    const [one, two, three, ...rest] = SONG_SHOW;
    const show: FakeEosCue[] = [
      one!,
      two!,
      // Cue 3 fires, its follow fires 3.1, whose hang links to 12, whose follow links back to 3.
      { ...three!, follow: 1000 },
      { number: '3.1', label: 'Goodness of God', hang: 1000, link: 12 },
      ...rest,
      // Nothing fires 11.
      { number: '11', label: 'Goodness of God' },
      { number: '12', label: 'Goodness of God', follow: 1000, link: 3 },
    ];
    const { checked } = await lightsRig({ show });

    expect(await checked()).toEqual({ kind: 'unmatched', names: [], problems: ['Goodness of God: cue 11 never fires, cue 3 has the same label'], notes: [] });
  });

  it('names no cue with the same label that Eos fires by itself after another cue, and still names one that nothing fires', async () => {
    const show: FakeEosCue[] = [
      // Cue 3.5's follow links to 12, which carries song 1's title after cue 3.
      ...SONG_SHOW.map((cue) => (cue.number === '3.5' ? { ...cue, follow: 1000, link: 12 } : cue)),
      // Nothing fires 11.
      { number: '11', label: 'Goodness of God' },
      { number: '12', label: 'Goodness of God' },
    ];
    const { checked } = await lightsRig({ show });

    expect(await checked()).toEqual({ kind: 'unmatched', names: [], problems: ['Goodness of God: cue 11 never fires, cue 3 has the same label'], notes: [] });
  });

  it('names the cues that never fire as problems and the songs with no cue as names, each in set order, and no cue for a song the set does not have', async () => {
    const set: CuePoint[] = [...SET, { name: '3 - Intro (Build My Life)', time: 120 }, { name: '3 - End', time: 136 }];
    const show = [
      ...SONG_SHOW,
      { number: '9', label: 'Great Are You Lord' },
      // The set has no Way Maker, so neither of these fires, and the check says nothing.
      { number: '11', label: 'Way Maker' },
      { number: '12', label: 'Way Maker' },
      { number: '13', label: 'Goodness of God' },
    ];
    const { checked } = await lightsRig({ set, show });

    expect(await checked()).toEqual({
      kind: 'unmatched',
      names: ['Build My Life: no cue'],
      problems: ['Goodness of God: cue 13 never fires, cue 3 has the same label', 'Great Are You Lord: cue 9 never fires, cue 6 has the same label'],
      notes: [],
    });
  });

  it('says in one problem line that the cue list is not in the show file, as Eos counts a missing list, and names no section', async () => {
    const { checked } = await lightsRig({ cueList: 2 });

    expect(await checked()).toEqual({ kind: 'unmatched', names: [], problems: ['Cue list 2 is not in the show file, or holds no cues.'], notes: [] });
  });

  it('is not checked while no read of the cue list has finished, rather than naming every section', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, clock, comesOnline, producer, lights, latest } = await lightsRig({ refusing: true });
    fake.holdReads();
    await fake.accept();
    await comesOnline();
    await vi.waitFor(() => expect(fake.received.some((message) => message.address === '/eos/get/cue/1/count')).toBe(true));

    // The read's last reply never comes, so the lights give it up: one late tick of each timer, so
    // the pings in between, which no I/O could answer, never drop the connection.
    clock.stall(READ_TIMEOUT_MS);

    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('Setlist server: the connection target eos could not check the set', expect.anything()));
    await producer.flush();
    expect(latest()?.check).toEqual({ kind: 'not-checked' });
    expect(producer.received.every((snapshot) => lights(snapshot)?.check.kind !== 'unmatched')).toBe(true);
    logged.mockRestore();
  });

  it('moves with the show: a Refresh after each song is given its cue at the console reads matched', async () => {
    const { fake, checked, next, lights, leader } = await lightsRig();
    expect(await checked()).toEqual(RECORDED_CHECK);
    fake.setShow(SONG_SHOW);

    const matched = next((snapshot) => isCheck(MATCHED)(lights(snapshot)));
    leader.send({ kind: 'refresh' });

    await matched;
  });

  it("runs again once a cue recorded at the console is read on its notify, with no Refresh, and no longer names that cue's song", async () => {
    const { fake, checked, next, lights } = await lightsRig();
    expect(await checked()).toEqual(RECORDED_CHECK);

    const rechecked = next((snapshot) => isCheck({ kind: 'unmatched', names: ['Goodness of God: no cue'], problems: [], notes: [] })(lights(snapshot)));
    fake.editShow([...RECORDED_SHOW, { number: '9', label: 'Great Are You Lord' }], { notify: 9 });

    await rechecked;
  });

  it("runs again once a cue deleted at the console is read on its notify, with no Refresh, and names that cue's song in set order", async () => {
    const show = SONG_SHOW.map((cue) => (cue.number === '6' ? { ...cue, label: '' } : cue));
    const { fake, checked, next, lights } = await lightsRig({ show });
    expect(await checked()).toEqual({ kind: 'unmatched', names: ['Great Are You Lord: no cue'], problems: [], notes: [] });

    const rechecked = next((snapshot) => isCheck(RECORDED_CHECK)(lights(snapshot)));
    fake.editShow(
      show.filter((cue) => cue.number !== '3'),
      { notify: 3 },
    );

    await rechecked;
  });

  it("changes nothing in the check when a notify's read of the cue list is cut short, and runs no check", async () => {
    const { fake, clock, checked, producer, lights, latest } = await lightsRig();
    expect(await checked()).toEqual(RECORDED_CHECK);
    const before = counts(fake);
    const snapshots = producer.received.length;

    // A cue recorded at the console, whose notify's read never gets its replies in time.
    fake.holdReads();
    fake.editShow([...RECORDED_SHOW, { number: '9', label: 'Great Are You Lord' }], { notify: 9 });
    await vi.waitFor(() => expect(counts(fake)).toBe(before + 1));
    // One late tick of each timer gives the read up, as in the check before any read finishes.
    clock.stall(READ_TIMEOUT_MS);
    fake.releaseReads();
    // Nothing tells when a check the lights never ask for would have run, so the test gives one a
    // moment on loopback.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await producer.flush();

    expect(latest()?.connection).toBe('online');
    expect(latest()?.check).toEqual(RECORDED_CHECK);
    expect(producer.received.slice(snapshots).every((snapshot) => isCheck(RECORDED_CHECK)(lights(snapshot)))).toBe(true);
    expect(counts(fake)).toBe(before + 1);
  });

  it('checks when the lights come online', async () => {
    const { fake, comesOnline, checked, latest } = await lightsRig({ refusing: true });
    expect(latest()?.check).toEqual({ kind: 'not-checked' });

    await fake.accept();
    await comesOnline();

    expect(await checked()).toEqual(RECORDED_CHECK);
  });

  it('shows the same lines on the setup screen as on the producer row', async () => {
    const { checked } = await lightsRig();
    const onRow = await checked();

    const status = await rig!.connectionsStatus((status) => status.connections.some((row) => row.name === 'eos' && row.check.kind === 'unmatched'));

    expect(status.connections).toEqual([expect.objectContaining({ name: 'eos', label: 'Lights', check: RECORDED_CHECK })]);
    expect(status.connections[0]!.check).toEqual(onRow);
  });

  it("names an untitled song by the page's name for it, a song in the set twice once, and no line for any song's End", async () => {
    const set: CuePoint[] = [
      { name: '1 - Intro (Goodness of God)', time: 0 },
      { name: '1 - Chorus', time: 16 },
      { name: '1 - End', time: 32 },
      { name: '2 - Intro', time: 32 },
      { name: '2 - End', time: 48 },
      { name: '3 - Intro (Goodness of God)', time: 48 },
      { name: '3 - End', time: 64 },
      { name: '4 - Intro (Way Maker)', time: 64 },
    ];
    const { checked } = await lightsRig({ set });

    expect(await checked()).toEqual({ kind: 'unmatched', names: ['Goodness of God: no cue', 'Song 2: no cue', 'Way Maker: no cue'], problems: [], notes: [] });
  });
});

// How long the lights wait for Eos's first OSC packet after they start a connect.
const CONNECT_TIMEOUT_MS = 3000;
// How often the lights ping Eos once online.
const PING_MS = 1000;
// Every OSC ping the fake Eos received.
const pings = (fake: FakeEos) => fake.received.filter((message) => message.address === '/eos/ping');

// The problem line for a connect to the lights at that port on loopback that gets no answer.
const noAnswerAt = (port: number) =>
  `The lights could not reach Eos at 127.0.0.1:${port}: no answer within 3 seconds. Check the address, that OSC RX and TX are on, and that the OSC TCP mode is OSC 1.0.`;

// A bare TCP server on loopback, on a port the OS assigns, in place of Eos: it hands each connection
// it accepts to `accepted`, and counts the bytes it reads.
type RawPeer = { port: number; sockets(): Socket[]; received(): number; close(): Promise<void> };
async function startRawPeer(accepted: (socket: Socket) => void): Promise<RawPeer> {
  const sockets: Socket[] = [];
  let received = 0;
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.on('data', (chunk: Buffer) => (received += chunk.length));
    accepted(socket);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  return {
    port: (server.address() as { port: number }).port,
    sockets: () => sockets,
    received: () => received,
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((done) => server.close(() => done()));
    },
  };
}

// A rig with the lights on a raw peer, on a manual clock of their own, and a producer connected
// once it sees the set.
async function rawPeerRig(accepted: (socket: Socket) => void) {
  peer = await startRawPeer(accepted);
  const clock = manualClock();
  const path = await configs.write({ eos: { host: '127.0.0.1', port: peer.port, cueList: 1 } });
  rig = await startRig(SET, { playing: false, position: 0 }, { connectionsConfig: path, targetKinds: { eos: eosKind({ clock }) } });
  const producer = await rig.connectProducer();
  await producer.snapshot(loaded);
  return {
    clock,
    producer,
    latest: () => rowOf(producer.received.at(-1)!, 'eos'),
    everOnline: () => producer.received.some((snapshot) => rowOf(snapshot, 'eos')?.connection === 'online'),
  };
}

describe('the lights online and offline', () => {
  it('show offline with a problem line when a connect gets no answer within a few seconds, and online with none once Eos answers', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, clock, comesOnline, producer, lights, latest } = await lightsRig({ silent: true });
    const noAnswer = noAnswerAt(fake.port);
    // The connect lands, and Eos says nothing back, not even to the lights' ping.
    await vi.waitFor(() => expect(pings(fake)).toHaveLength(1));
    expect(latest()).toEqual(expect.objectContaining({ connection: 'offline', problems: [] }));

    clock.advance(CONNECT_TIMEOUT_MS);

    await vi.waitFor(() => expect(latest()).toEqual(expect.objectContaining({ connection: 'offline', problems: [noAnswer] })));
    expect(logged).toHaveBeenCalledWith(`Setlist server: ${noAnswer}`);
    expect(producer.received.every((snapshot) => lights(snapshot)?.connection !== 'online')).toBe(true);

    fake.speak();
    await comesOnline();
    await vi.waitFor(() => expect(latest()).toEqual(expect.objectContaining({ connection: 'online', problems: [] })));
    logged.mockRestore();
  });

  it('never show online when the peer sends no packet-length framing, as an Eos whose OSC TCP mode is OSC 1.1, and name that mode when the connect gets no answer', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // One /eos/out/user, as an Eos in OSC 1.1 sends it: SLIP-framed, which no packet length frames.
    const slip = Buffer.concat([Buffer.from([0xc0]), encode('/eos/out/user', [{ int: 1 }]), Buffer.from([0xc0])]);
    const { clock, producer, latest, everOnline } = await rawPeerRig((socket) => socket.write(slip));
    const noAnswer = noAnswerAt(peer!.port);
    // The connect lands, the lights' ping reaches the peer, and the peer's packet reaches the lights.
    await vi.waitFor(() => expect(peer!.received()).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await producer.flush();
    expect(everOnline()).toBe(false);

    clock.advance(CONNECT_TIMEOUT_MS);

    await vi.waitFor(() => expect(latest()).toEqual(expect.objectContaining({ connection: 'offline', problems: [noAnswer] })));
    expect(logged.mock.calls.filter(([line]) => line === `Setlist server: ${noAnswer}`)).toHaveLength(1);
    expect(everOnline()).toBe(false);
    logged.mockRestore();
  });

  it('come online at the first whole packet, not at its first bytes', async () => {
    const packet = frame(encode('/eos/out/user', [{ int: 1 }]));
    const { producer, latest, everOnline } = await rawPeerRig((socket) => socket.write(packet.subarray(0, 2)));
    await vi.waitFor(() => expect(peer!.received()).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await producer.flush();
    expect(everOnline()).toBe(false);

    peer!.sockets()[0]!.write(packet.subarray(2));

    await vi.waitFor(() => expect(latest()).toEqual(expect.objectContaining({ connection: 'online', problems: [] })));
  });

  it('show offline with a problem line when the connection goes silent, and online with none once Eos answers again', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, clock, read, comesOnline, latest } = await lightsRig();
    await read();
    const stopped = `Eos stopped answering the lights at 127.0.0.1:${fake.port}.`;
    const sent = pings(fake).length;

    // A pulled cable: the connection stays open, and nothing comes back.
    fake.silence();
    for (let ping = 1; ping <= 3; ping += 1) {
      clock.advance(PING_MS);
      await vi.waitFor(() => expect(pings(fake)).toHaveLength(sent + ping));
      expect(latest()?.connection).toBe('online');
    }
    // A fourth interval with none of the three answered.
    clock.advance(PING_MS);

    await vi.waitFor(() => expect(latest()).toEqual(expect.objectContaining({ connection: 'offline', problems: [stopped] })));
    expect(logged).toHaveBeenCalledWith(`Setlist server: ${stopped}`);

    fake.speak();
    await comesOnline();
    await vi.waitFor(() => expect(latest()).toEqual(expect.objectContaining({ connection: 'online', problems: [] })));
    logged.mockRestore();
  });

  it('stay online while Eos answers every ping', async () => {
    const { fake, clock, read, latest, producer, lights } = await lightsRig();
    await read();
    const since = producer.received.length;
    const sent = pings(fake).length;

    // Each ping reaches the fake, which answers it, before the clock moves on.
    for (let ping = 1; ping <= 6; ping += 1) {
      clock.advance(PING_MS);
      await vi.waitFor(() => expect(pings(fake)).toHaveLength(sent + ping));
    }

    await producer.flush();
    expect(latest()).toEqual(expect.objectContaining({ connection: 'online', problems: [] }));
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.connection === 'online')).toBe(true);
  });

  it('stay online through an event loop stall many pings long: the late tick sends one ping', async () => {
    const { fake, clock, read, latest, producer } = await lightsRig();
    await read();
    const sent = pings(fake).length;

    clock.stall(10 * PING_MS);

    await vi.waitFor(() => expect(pings(fake)).toHaveLength(sent + 1));
    await producer.flush();
    expect(latest()).toEqual(expect.objectContaining({ connection: 'online', problems: [] }));
  });

  it('shows offline while the fake refuses the connection, and online again when it accepts, with the reason for each on the row and in the log', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, clock, comesOnline, latest, next, lights } = await lightsRig({ refusing: true });
    const refused = `The lights could not connect to Eos at 127.0.0.1:${fake.port}: connect ECONNREFUSED 127.0.0.1:${fake.port}.`;
    const closed = 'Eos closed the connection to the lights.';
    const logs = (line: string) => logged.mock.calls.filter(([message]) => message === `Setlist server: ${line}`);
    // The connect at start is refused.
    await vi.waitFor(() => expect(latest()).toEqual(expect.objectContaining({ configured: true, connection: 'offline', problems: [refused] })));
    // So is each connect again while the fake refuses, and none of them is logged again. A refused
    // connect leaves nothing to wait on, so the test gives each one a moment on loopback.
    for (let retry = 0; retry < 2; retry += 1) {
      clock.stall(RETRY_MS);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(latest()).toEqual(expect.objectContaining({ connection: 'offline', problems: [refused] }));
    expect(logs(refused)).toHaveLength(1);

    await fake.accept();
    await comesOnline();
    await vi.waitFor(() => expect(latest()?.problems).toEqual([]));

    // Eos quits: the connection drops.
    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    await vi.waitFor(() => expect(latest()?.problems).toEqual([closed]));
    expect(logs(closed)).toHaveLength(1);
    // Still refused after a pause, which names the refusal again.
    clock.stall(RETRY_MS);
    await vi.waitFor(() => expect(latest()).toEqual(expect.objectContaining({ connection: 'offline', problems: [refused] })));
    expect(logs(refused)).toHaveLength(2);

    await fake.accept();
    await comesOnline();
    await vi.waitFor(() => expect(latest()?.problems).toEqual([]));
    logged.mockRestore();
  });
});

// Every message the fake Eos received on a cue list's own address, such as a Go or a Back, in order,
// each with its arguments.
const cueListMessages = (fake: FakeEos) => fake.received.filter((message) => message.address.startsWith('/eos/cues/')).map(({ address, args }) => ({ address, args }));
const GO = { address: '/eos/cues/1/fire', args: [] };
const BACK = { address: '/eos/cues/1/stop', args: [] };

describe("the lights' Go and Back", () => {
  it('show on the row, Go first, and armed, each reaches Eos on the cue list and leaves the lights armed', async () => {
    const { fake, read, arm, press, latest } = await lightsRig();
    await read();
    await arm();
    expect(latest()?.buttons).toEqual([
      { id: 'go', label: 'Go' },
      { id: 'back', label: 'Back' },
    ]);

    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(fake)).toEqual([GO]));
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));

    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await vi.waitFor(() => expect(cueListMessages(fake)).toEqual([GO, BACK]));
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it('disarmed, each reaches Eos and leaves the lights disarmed', async () => {
    const { fake, read, press, latest } = await lightsRig();
    await read();
    expect(latest()).toEqual(expect.objectContaining({ arm: 'disarmed', pause: null }));

    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(fake)).toEqual([GO]));
    expect(latest()).toEqual(expect.objectContaining({ arm: 'disarmed', pause: null }));

    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await vi.waitFor(() => expect(cueListMessages(fake)).toEqual([GO, BACK]));
    expect(latest()).toEqual(expect.objectContaining({ arm: 'disarmed', pause: null }));
  });

  it("paused by the leader's Fade out, each reaches Eos and leaves the lights paused", async () => {
    const { fake, read, arm, lead, lights, press, latest } = await lightsRig();
    await read();
    await arm();
    // The lights follow the track timing, so the Fade out pauses them.
    await lead({ kind: 'fade-out' }, (snapshot) => lights(snapshot)?.arm === 'paused');
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'fade-out' }));

    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(fake)).toEqual([GO]));
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'fade-out' }));

    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await vi.waitFor(() => expect(cueListMessages(fake)).toEqual([GO, BACK]));
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'fade-out' }));
  });

  it('paused by hand, each reaches Eos and leaves the lights paused by hand', async () => {
    const { fake, read, arm, next, lights, press, shows, latest } = await lightsRig();
    await read();
    await arm();
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    fake.fireByHand('6');
    await paused;

    // Go fires cue 7, and Back cue 6 again.
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await shows(['Live cue 7: Great Are You Lord / Chorus', ...RECORDED_LIST]);
    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);
    expect(cueListMessages(fake)).toEqual([GO, BACK]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('name the cue list the lights are configured for, here list 2', async () => {
    // The fake holds no list 2, so the read finds no cue and the check still answers.
    const { fake, read, press } = await lightsRig({ cueList: 2 });
    await read();

    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await vi.waitFor(() =>
      expect(cueListMessages(fake)).toEqual([
        { address: '/eos/cues/2/fire', args: [] },
        { address: '/eos/cues/2/stop', args: [] },
      ]),
    );
  });

  it('do nothing while Eos is offline', async () => {
    const { fake, read, comesOnline, press, latest } = await lightsRig({ refusing: true });
    expect(latest()?.connection).toBe('offline');

    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await fake.accept();
    await comesOnline();
    await read();
    // A press online ends the test: the connection keeps the presses in order, so had either press
    // offline been sent, it would have arrived before this one.
    await press({ kind: 'run-button', target: 'eos', button: 'back' });

    await vi.waitFor(() => expect(cueListMessages(fake)).toEqual([BACK]));
  });
});

// How long after one of the lights' own commands a fire event still counts as its answer.
const OWN_COMMAND_WINDOW_MS = 1000;

describe('a cue fired by hand at the console', () => {
  it('pauses the lights armed, shown as paused by hand, and they fire no cue until the producer arms them', async () => {
    const { fake, read, arm, play, jump, next, lights, latest, shows } = await lightsRig({ show: SONG_SHOW });
    await read();
    await arm();

    // Go To Cue 6 at the console.
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('6');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
    await shows(['Live cue 6: Great Are You Lord', ...SONG_LIST]);

    // Into song 2's Count Off at 64, its song-start section: no cue reaches the lights.
    await play(5, 17);
    await play(48, 65);
    await arm();
    // Into its Chorus at 88, armed again, then a jump from song 2 onto song 1's Intro: the bar line
    // is beat 92. Eos takes the fires in order, so a fire for song 2's Count Off would have arrived
    // before this one.
    await play(24, 89);
    await jump(1, 0);
    await play(4, 1);

    await vi.waitFor(() => expect(fires(fake)).toEqual([fire('3')]));
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it("pauses on a fire of the very cue the lights fired, once the window after the lights' fire has passed", async () => {
    const { press, fake, clock, read, arm, play, next, lights, latest } = await lightsRig({ show: SONG_SHOW, position: 28 });
    await read();
    await arm();
    // Cue 3 is deleted at the console, so the lights' fire of it on Fire again in song 1's Chorus at
    // 32 gets no answer, then recorded again.
    fake.setShow(SONG_SHOW.filter((cue) => cue.number !== '3'));
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(fake)).toEqual([fire('3')]));
    fake.setShow(SONG_SHOW);

    // The window has passed: cue 3 fired at the console is a fire by hand, not the lights' answer.
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('3');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it("turns a pause by the leader's Fade out into a pause by hand", async () => {
    const { fake, read, arm, lead, next, lights, latest } = await lightsRig();
    await read();
    await arm();
    await lead({ kind: 'fade-out' }, (snapshot) => lights(snapshot)?.pause === 'fade-out');

    const byHand = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    fake.fireByHand('6');
    await byHand;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });
});

describe("the lights' own fires", () => {
  it('never pause: a song-start section played into, a jump from another song, Play from start and Fire again', async () => {
    const { fake, read, arm, lead, jump, play, press, shows, producer, lights } = await lightsRig({ show: SONG_SHOW, position: 60 });
    await read();
    await arm();
    const since = producer.received.length;

    // Into song 2's Count Off at 64, its song-start section: song 2's cue.
    await play(5, 65);
    await shows(['Live cue 6: Great Are You Lord', ...SONG_LIST]);
    // A jump to song 1's Verse 1 lands on the bar line at 68, at 16, and plays on a beat, then into
    // its Bridge at 48: neither fires.
    await jump(1, 1);
    await play(4, 17);
    await play(32, 49);
    // The Bridge loops, 48 to 64, and wraps. Live reports only where the playhead ends up, so the
    // wrap lands behind where it was. The wrap fires nothing.
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
    await play(15.5, 48.5);
    // A jump inside song 1 to its Intro lands on the bar line at 52, at 0, and plays on a beat and a
    // half, which fires nothing; Fire again fires song 1's cue.
    await jump(1, 0);
    await play(5, 1.5);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    // A jump to song 2's Count Off, from song 1, lands on the bar line at 4, at 64, and plays on a
    // beat and a half.
    await jump(2, 0);
    await play(4, 65.5);
    await shows(['Live cue 6: Great Are You Lord', ...SONG_LIST]);
    // Play from start of song 1: the bar line is beat 68, so Live lands on its Intro, 0, and plays
    // on a beat and a half. Eos answers in order, so the answers to every fire before it came
    // before this one's.
    await lead({ kind: 'play-from-start', song: 1 }, (snapshot) => snapshot.jump?.song === 1);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(4));
    await play(4, 1.5);
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);

    expect(fires(fake)).toEqual([fire('6'), fire('3'), fire('6'), fire('3')]);
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
  });

  it("never pause on Go or Back, though Eos picks the cue each fires", async () => {
    const { read, arm, play, press, shows, producer, lights } = await lightsRig({ show: SONG_SHOW, position: 28 });
    await read();
    await arm();
    const since = producer.received.length;
    // Into song 1's Chorus at 32 and Fire again: cue 3.
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);

    // Go fires the cue after it, 3.5, and Back the one before that again, 3.
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await shows(['Live cue 3.5', ...SONG_LIST]);
    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);

    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
  });

  it('a Back during a fade answers with a stop, which uses that Back up, so a fire by hand after it still pauses', async () => {
    // A show the test gives has no current cue, so the fake's Back fires nothing, and the test sends
    // Eos's answers itself, as recorded in back-during-fade.json.
    const { fake, read, arm, press, shows, next, lights, latest } = await lightsRig({ show: RECORDED_SHOW });
    await read();
    await arm();

    // The first Back stops the fade: a stop of cue 0. The second goes back: a fire of the cue before.
    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    fake.emit('/eos/out/event/cue/1/0/stop', ['']);
    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    fake.emit('/eos/out/event/cue/1/6/fire', ['Great Are You Lord / Verse 1']);
    await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));

    // Within the window, but each Back has had its answer.
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('7');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('a Go after a Back stopped a fade answers with a resume, which uses that Go up, so a fire by hand of the cue it would have fired still pauses', async () => {
    const { fake, read, arm, play, press, shows, next, producer, lights, latest } = await lightsRig({ show: SONG_SHOW, position: 28 });
    await read();
    await arm();
    // Into song 1's Chorus at 32 and Fire again: cue 3, fading.
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    // The fake runs no fades, so with no show its Back and Go fire nothing, and the test sends Eos's
    // answers itself, as recorded in back-during-fade-then-go.json.
    fake.setShow([]);
    const since = producer.received.length;

    // The Back stops cue 3's fade, and the Go after it resumes it: Eos stays on cue 3.
    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await vi.waitFor(() => expect(cueListMessages(fake).at(-1)).toEqual(BACK));
    fake.emit('/eos/out/event/cue/1/0/stop', ['']);
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(fake).at(-1)).toEqual(GO));
    fake.emit('/eos/out/event/cue/1/0/resume', ['']);
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    await producer.flush();
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);

    // Within the window, and the cue a Go from cue 3 fires, but the Go has had its answer.
    fake.setShow(SONG_SHOW);
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('3.5');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it("a fire by hand of another cue within the window of the lights' fire still pauses", async () => {
    const { press, fake, read, arm, play, next, lights, latest } = await lightsRig({ show: SONG_SHOW, position: 28 });
    await read();
    await arm();
    // Cue 3 is deleted at the console, so the lights' fire of it on Fire again in song 1's Chorus at
    // 32 is still waiting for its answer.
    fake.setShow(SONG_SHOW.filter((cue) => cue.number !== '3'));
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(fake)).toEqual([fire('3')]));

    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('6');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });
});

// The one-cue-per-song show with two follow cues after song 1's cue, 3: 3.1 with no label, and 3.2
// with a label that is no song's title. Cue 3 follows on to 3.1 and 3.1 to 3.2; 3.2 has no follow,
// so nothing fires after it by itself.
const FOLLOW_SHOW: FakeEosCue[] = [
  ...SONG_SHOW.slice(0, 2),
  { ...SONG_SHOW[2]!, follow: 1000 },
  { number: '3.1', label: '', follow: 1000 },
  { number: '3.2', label: 'Chorus hit' },
  ...SONG_SHOW.slice(3),
];
// The same show as a chase: 3.2 follows on with a link back to 3, so 3, 3.1 and 3.2 loop.
const LOOP_SHOW: FakeEosCue[] = FOLLOW_SHOW.map((cue) => (cue.number === '3.2' ? { ...cue, follow: 1000, link: 3 } : cue));
const FOLLOW_LIST = [...SONG_LIST.slice(0, 3), 'Cue 3.1', 'Cue 3.2: Chorus hit', ...SONG_LIST.slice(3)];

describe('a cue Eos fires by itself on a follow time', () => {
  it("never pauses on the cue the live cue's follow fires next; a cue fired after one with no follow does", async () => {
    const { press, fake, clock, read, arm, play, shows, next, producer, lights, latest } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    const since = producer.received.length;
    // Into song 1's Chorus at 32 and Fire again: the lights fire cue 3.
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);

    // Long past the window, so only the follow rule can make these the lights' own.
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    fake.follow('3.1');
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);
    fake.follow('3.2');
    await shows(['Live cue 3.2: Chorus hit', ...FOLLOW_LIST]);
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed')).toBe(true);

    // Cue 3.5, fired with no command from the lights after 3.2, which has no follow.
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.follow('3.5');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it("pauses on a cue before the lights' cue", async () => {
    const { press, fake, clock, read, arm, play, shows, next, lights, latest } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);

    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('2');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('never pauses again on the follow cues of a cue fired by hand, once the producer arms the lights', async () => {
    const { fake, clock, read, arm, shows, next, producer, lights, latest } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();

    // The operator fires song 1's Chorus at the console, whose follow cues run on after it.
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('3');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));

    // The producer arms the lights while the chain still runs.
    await arm();
    const since = producer.received.length;
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    fake.follow('3.1');
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);
    fake.follow('3.2');
    await shows(['Live cue 3.2: Chorus hit', ...FOLLOW_LIST]);
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed')).toBe(true);
  });

  it('pauses on a fire by hand again of a cue fired by hand, once the producer arms the lights', async () => {
    const { fake, clock, read, arm, shows, next, lights, latest } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();

    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('3');
    await paused;
    await arm();
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    fake.follow('3.1');
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));

    // The operator fires the Chorus at the console again, to reset the look.
    const pausedAgain = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('3');
    await pausedAgain;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('pauses on a fire by hand that skips a follow cue of a cue fired by hand while the lights were disarmed', async () => {
    const { fake, clock, read, arm, shows, next, lights, latest } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();

    // The operator runs the console with the lights disarmed, then the producer arms them.
    fake.fireByHand('3');
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'disarmed', pause: null }));
    await arm();
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);

    // The operator goes to a later cue in the section, past the one that follows 3.
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('3.2');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('never pauses again on a chase that loops back to a cue fired by hand, once the producer arms the lights; the operator firing it again does', async () => {
    const { fake, clock, read, arm, shows, next, producer, lights, latest } = await lightsRig({ show: LOOP_SHOW, position: 28 });
    await read();
    await arm();

    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('3');
    await paused;
    await arm();
    const since = producer.received.length;
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    // Two laps of the chase: 3.2's link takes it back to 3.
    for (const cue of ['3.1', '3.2', '3', '3.1', '3.2', '3', '3.1']) {
      fake.follow(cue);
      await shows([cue === '3' ? 'Live cue 3: Goodness of God' : cue === '3.1' ? 'Live cue 3.1' : 'Live cue 3.2: Chorus hit', ...FOLLOW_LIST]);
    }
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed')).toBe(true);

    // 3.1 follows on to 3.2, so a fire of 3 now is the operator's.
    const pausedAgain = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('3');
    await pausedAgain;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('never pauses again on the recorded chain of follows, a hang and links after a cue fired by hand; the operator firing a cue after its end does', async () => {
    const list = RECORDED_FOLLOW_SHOW.map(({ number, label }) => `Cue ${number}: ${label}`);
    const { fake, clock, read, arm, shows, next, producer, lights, latest } = await lightsRig({ show: RECORDED_FOLLOW_SHOW });
    await read();
    await arm();
    const [first, ...rest] = RECORDED_FOLLOW_CHAIN;

    // The operator fires the chain's first cue at the console, and Eos fires the rest by itself, as
    // recorded: a link that skips a cue, a hang, and a link back to a cue before.
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand(first!);
    await paused;
    await arm();
    const since = producer.received.length;
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    for (const cue of rest) {
      fake.follow(cue);
      await shows([`Live cue ${cue}: Follow test / ${cue}`, ...list]);
    }
    expect(rest).toEqual(['2', '4', '5', '3']);
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed')).toBe(true);

    // The chain ended on 3, which has no follow or hang.
    const pausedAgain = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('4');
    await pausedAgain;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it("never pauses on a follow of the lights' cue once they have connected again, from the cue Eos is on at connect", async () => {
    const { press, fake, clock, read, arm, play, shows, next, producer, lights, latest, comesOnline } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);
    const since = producer.received.length;

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    await fake.accept();
    await comesOnline();
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);

    // Long past the window, so only the follow rule can make it the lights' own.
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    fake.follow('3.1');
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it("pauses on a fire by hand once the lights have connected again, of a cue the lights' cue does not follow on to", async () => {
    const { press, fake, clock, read, arm, play, shows, next, lights, latest, comesOnline } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    await fake.accept();
    await comesOnline();
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);

    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    const paused = next((snapshot) => lights(snapshot)?.arm === 'paused');
    fake.fireByHand('2');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('pause once they have connected again on a cue fired by hand at the console while they were offline, judged once', async () => {
    const { fake, read, arm, play, press, shows, next, producer, lights, latest, comesOnline } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    // The operator fires cue 2 at the console while the lights are offline: they never see its fire
    // event, only the cue Eos is on once they connect again.
    fake.fireByHand('2');
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await fake.accept();
    await comesOnline();
    await paused;
    await shows(['Live cue 2', ...FOLLOW_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));

    // Eos sends the active cue again, as it does after every fire: it is judged once, at connect.
    await arm();
    const since = producer.received.length;
    fake.emit('/eos/out/active/cue/1/2', [1]);
    fake.emit('/eos/out/active/cue/1/2', [1]);
    // Go fires cue 3 after the two, on the same connection, so the row has taken them by then.
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
  });

  it.each([
    { followed: ['3.1'], line: 'Live cue 3.1' },
    { followed: ['3.1', '3.2'], line: 'Live cue 3.2: Chorus hit' },
  ])("never pause once they have connected again on a cue the lights' cue follows on to while they were offline: $followed", async ({ followed, line }) => {
    const { press, fake, read, arm, play, shows, next, producer, lights, latest, comesOnline } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);
    const since = producer.received.length;

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    // Eos fires the follow cues of the lights' cue 3 by itself while the lights are offline.
    for (const cue of followed) fake.follow(cue);
    await fake.accept();
    await comesOnline();
    await shows([line, ...FOLLOW_LIST]);
    await producer.flush();

    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it('pause once they have connected again on a cue fired by hand while they were offline, through connects again that Eos refuses', async () => {
    const { press, fake, clock, read, arm, play, shows, next, lights, latest, comesOnline } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    fake.fireByHand('2');
    // Two connects again, each refused. A refused connect leaves nothing to wait on, so the test
    // gives each one a moment on loopback.
    const before = fake.accepted();
    for (let retry = 0; retry < 2; retry += 1) {
      clock.stall(RETRY_MS);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(fake.accepted()).toBe(before);
    expect(latest()?.connection).toBe('offline');

    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await fake.accept();
    await comesOnline();
    await paused;
    await shows(['Live cue 2', ...FOLLOW_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('never pause on their own Fire again once they have connected again to an Eos that names no active cue of the cue list', async () => {
    const { fake, read, arm, play, press, shows, next, producer, lights, latest, comesOnline } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    fake.setShow(FOLLOW_SHOW);
    await fake.accept();
    await comesOnline();
    await shows([...FOLLOW_LIST]);

    const since = producer.received.length;
    fake.holdFires();
    await press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3')));
    // fire-follow-chain.json: Eos sends the fired cue's active cue ahead of its fire event.
    fake.emit('/eos/out/active/cue/1/3', [0]);
    fake.releaseFires();
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);
    await producer.flush();
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it('never pauses on a follow whose active cue Eos sends before its fire event, as recorded', async () => {
    const { press, fake, clock, read, arm, play, shows, producer, lights } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);
    const since = producer.received.length;

    // fire-follow-chain.json: Eos sent 99/1's active cue at 64 ms, then its fire event at 77 ms.
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    fake.emit('/eos/out/active/cue/1/3.1', [0]);
    fake.follow('3.1');
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed')).toBe(true);
  });
});

// fire-racing-follow.json: a fire by number of the cue the live cue's follow is due to fire gives
// two identical fire events of that cue. Each test plays into song 1's Chorus from cue 2, fired at
// the console with the lights disarmed, whose follow fires 3, and presses Fire again there, so the
// lights fire song 1's cue, 3, by number as the follow is due: the fake's answer is the recording's first fire event, and the test
// sends each later one alone, as the follow's, after the recorded gap.
describe("a fire by number that races the live cue's follow onto the same cue", () => {
  const [FIRST_RACING, ...LATER_RACING] = RECORDED_RACING_FIRES;
  const RACING_GAP_MS = LATER_RACING[0]!.t_ms - FIRST_RACING!.t_ms;
  async function racedOntoChorus() {
    const rig = await armedOnCue2(FOLLOWED_2);
    const since = rig.producer.received.length;
    await rig.play(5, 33);
    await rig.press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(rig.fake).at(-1)).toEqual(fire('3')));
    await rig.shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    return { rig, since };
  }

  it('is recorded as two fire events of one cue, inside the window', () => {
    expect(RECORDED_RACING_FIRES.map(({ cue }) => cue)).toEqual(['2', '2']);
    expect(RACING_GAP_MS).toBeLessThanOrEqual(OWN_COMMAND_WINDOW_MS);
  });

  it('never pauses on the second fire event', async () => {
    const { rig, since } = await racedOntoChorus();
    for (const { t_ms } of LATER_RACING) {
      rig.clock.advance(t_ms - FIRST_RACING!.t_ms);
      rig.fake.follow('3');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    await rig.shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  // As at a reconnect before the connect burst's active cue: with no live cue, Eos names cue 2
  // active while the fire by number of 3 is pending, so it does not place the live cue, and the
  // fire event that answers the fire is still the follow's from cue 2.
  it('never pauses on the second fire event with no live cue, from the cue Eos named active while the fire was pending', async () => {
    const rig = await lightsRig({ show: FOLLOWED_2, position: 18 });
    await rig.read();
    await rig.arm();
    const since = rig.producer.received.length;
    rig.fake.holdFires();
    await rig.play(15, 33);
    await rig.press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(rig.fake).at(-1)).toEqual(fire('3')));
    rig.fake.emit('/eos/out/active/cue/1/2', [1.0]);
    rig.fake.emit('/eos/out/event/cue/1/3/fire', ['Goodness of God']);
    await rig.shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    rig.clock.advance(RACING_GAP_MS);
    rig.fake.emit('/eos/out/event/cue/1/3/fire', ['Goodness of God']);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await rig.shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  it('pauses on a third identical fire event inside the window, since the second uses up the repeat', async () => {
    const { rig, since } = await racedOntoChorus();
    rig.clock.advance(RACING_GAP_MS);
    rig.fake.follow('3');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
    rig.clock.advance(RACING_GAP_MS);
    const paused = rig.next((snapshot) => rig.lights(snapshot)?.arm === 'paused');
    rig.fake.follow('3');
    await paused;
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('never pauses on the second fire event with a Go pending, which takes no Go, so the Go answers with its own', async () => {
    const { rig, since } = await racedOntoChorus();
    rig.fake.holdFires();
    const sent = cueListMessages(rig.fake).length;
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));
    rig.clock.advance(RACING_GAP_MS);
    rig.fake.emit('/eos/out/event/cue/1/3/fire', ['Goodness of God']);
    rig.fake.releaseFires();
    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  it.each([
    { when: 'in place of the second fire event', repeated: false },
    { when: 'after the second fire event', repeated: true },
  ])('pauses on a fire by hand of a different cue inside the window, $when', async ({ repeated }) => {
    const { rig } = await racedOntoChorus();
    rig.clock.advance(RACING_GAP_MS);
    if (repeated) rig.fake.follow('3');
    const paused = rig.next((snapshot) => rig.lights(snapshot)?.arm === 'paused');
    rig.fake.fireByHand('3.5');
    await paused;
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('pauses on a second fire event of the same cue that comes after the window', async () => {
    const { rig } = await racedOntoChorus();
    rig.clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    const paused = rig.next((snapshot) => rig.lights(snapshot)?.arm === 'paused');
    rig.fake.follow('3');
    await paused;
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  // The fire event of cue 3.5 that answers the producer's Go is a fire event of another cue, so it
  // clears the echo of 3, and 3 fired at the console inside the window is no repeat.
  it("pauses on the cue fired at the console inside the window after the producer's Go fires another cue", async () => {
    const { rig, since } = await racedOntoChorus();
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);

    rig.fake.fireByHand('3');

    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // Only the lights' fire by number that the follow races gives a second fire event, so a plain
  // follow sets no echo, and its cue fired at the console inside the window pauses.
  it('pauses on the cue fired at the console inside the window after a plain follow onto it', async () => {
    const rig = await armedOnCue2(FOLLOWED_2);
    const since = rig.producer.received.length;
    rig.fake.follow('3');
    await rig.shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);

    rig.fake.fireByHand('3');

    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });
});

// Two ways a drop eats the fire event of the lights' last fire, though Eos fired the cue: a
// connection gone silent, as behind a dropped Wi-Fi, which the lights give up only after three
// pings with no answer, long past the window of their fire; and a connection Eos closes before
// its fire event goes out, which TCP then never delivers.
type LightsRig = Awaited<ReturnType<typeof lightsRig>>;
const DROPS = [{ how: 'silent' }, { how: 'closed' }] as const;
type Drop = (typeof DROPS)[number]['how'];

// From now on the fake still fires each cue the lights fire by number, but its fire event never
// reaches them.
function eatFireEvents({ fake }: LightsRig, how: Drop) {
  if (how === 'silent') fake.silence();
  else fake.holdFires();
}

// Drops the lights' connection, and waits for the producer to see them offline. A silent drop moves
// the clock one ping at a time until the lights give up, not a fixed three pings and one more: a
// packet the fake sent before it went silent can still be in flight, and it resets the unanswered
// count as any packet from Eos does. On Linux the tail of a cue list read lands after the first
// ping often enough to fail a fixed count (setlist-controller#604).
async function drop({ fake, clock, next, lights }: LightsRig, how: Drop) {
  const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
  if (how === 'silent') {
    let gone = false;
    dropped.then(
      () => (gone = true),
      () => {},
    );
    const sent = pings(fake).length;
    for (let ping = 1; !gone && ping <= 8; ping += 1) {
      clock.advance(PING_MS);
      await vi.waitFor(() => expect(gone || pings(fake).length >= sent + ping).toBe(true));
    }
  } else await fake.refuse();
  await dropped;
}

// Lets the lights connect again, and has the fake answer each fire at once from then on.
async function reconnect({ fake, comesOnline }: LightsRig, how: Drop) {
  if (how === 'silent') fake.speak();
  else await fake.accept();
  await comesOnline();
  fake.releaseFires();
}

describe("the lights' own fire whose fire event a drop eats", () => {
  it.each(DROPS)('never pauses once they have connected again on the cue they fired: $how', async ({ how }) => {
    const rig = await lightsRig({ show: SONG_SHOW, position: 28 });
    const { press, fake, read, arm, play, shows, producer, lights, latest } = rig;
    await read();
    await arm();
    // Into song 1's Chorus at 32 and Fire again: the lights fire cue 3, and see its fire event.
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    const since = producer.received.length;

    // Into song 2's Count Off at 64: Eos fires cue 6, and its fire event never reaches the lights.
    eatFireEvents(rig, how);
    await play(32, 65);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('6')));
    await drop(rig, how);
    await reconnect(rig, how);
    await shows(['Live cue 6: Great Are You Lord', ...SONG_LIST]);
    await producer.flush();

    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it.each(DROPS)('never pauses once they have connected again on the cue they fired, through connects again that Eos refuses: $how', async ({ how }) => {
    const rig = await lightsRig({ show: SONG_SHOW, position: 28 });
    const { press, fake, clock, read, arm, play, shows, producer, lights, latest } = rig;
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    const since = producer.received.length;

    eatFireEvents(rig, how);
    await play(32, 65);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('6')));
    await drop(rig, how);
    // A drop longer than the pause before a connect again: two connects again, each refused, which
    // close with no command of the lights' own. A refused connect leaves nothing to wait on, so the
    // test gives each one a moment on loopback.
    await fake.refuse();
    const accepted = fake.accepted();
    for (let retry = 0; retry < 2; retry += 1) {
      clock.stall(RETRY_MS);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(fake.accepted()).toBe(accepted);
    await fake.accept();
    await reconnect(rig, how);
    await shows(['Live cue 6: Great Are You Lord', ...SONG_LIST]);
    await producer.flush();

    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it.each(DROPS)('never pauses once they have connected again on a cue the fired cue follows on to while they were offline, judged once: $how', async ({ how }) => {
    // Cue 2, fired at the console with the lights disarmed, has no follow, and is the live cue at the
    // drop.
    const rig = await armedOnCue2(FOLLOW_SHOW, FOLLOW_LIST);
    const { press, fake, play, shows, next, producer, lights, latest } = rig;
    const since = producer.received.length;

    // Into song 1's Chorus at 32 and Fire again: Eos fires cue 3, whose fire event never reaches the
    // lights, and its follow fires 3.1 while they are offline.
    eatFireEvents(rig, how);
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3')));
    await drop(rig, how);
    fake.follow('3.1');
    await reconnect(rig, how);
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);
    await producer.flush();

    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));

    // The fire of cue 3 is used up once judged: with no fire event and no command of the lights' own
    // since, a second drop in which the operator fires cue 3 at the console pauses them, as 3 is not
    // the live cue 3.1 nor a cue 3.1 follows on to.
    if (how === 'silent') fake.silence();
    await drop(rig, how);
    fake.fireByHand('3');
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await reconnect(rig, how);
    await paused;
    await shows(['Live cue 3: Goodness of God', ...FOLLOW_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it.each(DROPS)('pauses once they have connected again on a cue fired by hand at the console during the drop: $how', async ({ how }) => {
    const rig = await lightsRig({ show: SONG_SHOW, position: 28 });
    const { press, fake, read, arm, play, shows, next, lights, latest } = rig;
    await read();
    await arm();
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);

    eatFireEvents(rig, how);
    await play(32, 65);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('6')));
    await drop(rig, how);
    // The operator fires cue 2 at the console while the lights are offline: neither the live cue
    // before the drop, nor the lights' own fire, nor a cue either follows on to.
    fake.fireByHand('2');
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await reconnect(rig, how);
    await paused;
    await shows(['Live cue 2', ...SONG_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  // An Eos that names no active cue on connect, as on a freshly loaded show, leaves the lights with
  // no live cue until a fire event: when a drop eats the fire event of their first fire, only that
  // fire is left to judge the cue Eos is on when they connect again.
  it.each(DROPS)('never pauses once they have connected again on the cue they fired first, with no live cue before the drop: $how', async ({ how }) => {
    const rig = await lightsRig({ show: SONG_SHOW, position: 28 });
    const { press, fake, read, arm, play, shows, producer, lights, latest } = rig;
    await read();
    await arm();
    await shows([...SONG_LIST]);
    const since = producer.received.length;

    // Into song 1's Chorus at 32 and Fire again: Eos fires cue 3, and its fire event never reaches
    // the lights.
    eatFireEvents(rig, how);
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3')));
    await drop(rig, how);
    await reconnect(rig, how);
    await shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    await producer.flush();

    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it.each(DROPS)('pauses once they have connected again on a cue fired by hand at the console during the drop, with no live cue before it: $how', async ({ how }) => {
    const rig = await lightsRig({ show: SONG_SHOW, position: 28 });
    const { press, fake, read, arm, play, shows, next, lights, latest } = rig;
    await read();
    await arm();
    await shows([...SONG_LIST]);

    eatFireEvents(rig, how);
    await play(5, 33);
    await press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3')));
    await drop(rig, how);
    fake.fireByHand('2');
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await reconnect(rig, how);
    await paused;
    await shows(['Live cue 2', ...SONG_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });
});

// Eats the answers of the lights' own presses, as a drop begins, then presses each button in turn,
// each once the one before it reaches the fake, which fires the cue it lands on though its fire
// event never reaches the lights.
async function pressUnheard(rig: LightsRig, buttons: ('go' | 'back')[], how: Drop) {
  const { fake, press } = rig;
  eatFireEvents(rig, how);
  for (const button of buttons) {
    const sent = cueListMessages(fake).length;
    await press({ kind: 'run-button', target: 'eos', button });
    await vi.waitFor(() => expect(cueListMessages(fake)).toHaveLength(sent + 1));
    expect(cueListMessages(fake).at(-1)).toEqual(button === 'go' ? GO : BACK);
  }
}
// The lights stayed armed and unpaused in every snapshot the producer has received since then.
async function neverPaused({ producer, lights, latest }: LightsRig, since: number) {
  await producer.flush();
  expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
  expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
}
// A rig armed with cue 3, song 1's cue, the live cue, fired by Fire again in song 1's Chorus, on that
// show (the one-cue-per-song show by default).
async function armedOnCue3(show: FakeEosCue[] = SONG_SHOW, list = SONG_LIST) {
  const rig = await lightsRig({ show, position: 28 });
  await rig.read();
  await rig.arm();
  await rig.play(5, 33);
  await rig.press({ kind: 'fire-again', target: 'eos' });
  await rig.shows(['Live cue 3: Goodness of God', ...list]);
  return rig;
}
// A rig armed with cue 2 the live cue, fired at the console while the lights were disarmed, on that
// show, whose cue list the row shows as that list, at beat 28 in song 1's Verse 1, a bar before its Chorus.
async function armedOnCue2(show: FakeEosCue[], list = SONG_LIST) {
  const rig = await lightsRig({ show, position: 28 });
  await rig.read();
  rig.fake.fireByHand('2');
  await rig.shows(['Live cue 2', ...list]);
  await rig.arm();
  return rig;
}
// A rig armed with the recorded show's last cue, 8, the live cue, as Eos names it on connect.
async function armedOnLastCue() {
  const rig = await lightsRig({ position: 28 });
  await rig.read();
  await rig.arm();
  await rig.shows(['Live cue 8', ...RECORDED_LIST]);
  return rig;
}
// A rig armed with the recorded show's first cue, 1, the live cue, fired at the console while the
// lights were disarmed.
async function armedOnFirstCue() {
  const rig = await lightsRig({ position: 28 });
  await rig.read();
  rig.fake.fireByHand('1');
  await rig.shows(['Live cue 1: Goodness of God / Intro', ...RECORDED_LIST]);
  await rig.arm();
  return rig;
}
// The one-cue-per-song show with a follow on cue 3, which fires 3.5 by itself.
const FOLLOWED_3 = SONG_SHOW.map((cue) => (cue.number === '3' ? { ...cue, follow: 1000 } : cue));
// The one-cue-per-song show with a follow on cue 2, which fires song 1's cue, 3, by itself.
const FOLLOWED_2 = SONG_SHOW.map((cue) => (cue.number === '2' ? { ...cue, follow: 1000 } : cue));
// Each case once for each way a drop eats the answers.
const overDrops = <T extends object>(cases: T[]) => DROPS.flatMap(({ how }) => cases.map((each) => ({ ...each, how })));

// A Go or a Back names no cue, so the lights predict from the cue list as last read every cue Eos
// may be on after it, and keep them across a drop that eats its fire event. Each test drops a
// connection gone silent and one Eos closes, with the fake holding its answers.
describe("the lights' own Go and Back whose fire event a drop eats", () => {
  it.each(
    overDrops([
      { button: 'go', landsOn: 'Live cue 3.5' },
      { button: 'back', landsOn: 'Live cue 2' },
    ] as const),
  )('never pauses once they have connected again on the cue a $button lands on: $how', async ({ button, landsOn, how }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;

    await pressUnheard(rig, [button], how);
    await drop(rig, how);
    await reconnect(rig, how);
    await rig.shows([landsOn, ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)("never pauses once they have connected again on the cue a Go lands on by the live cue's link, which has no follow: $how", async ({ how }) => {
    const show = SONG_SHOW.map((cue) => (cue.number === '3' ? { ...cue, link: 1 } : cue));
    const rig = await armedOnCue3(show);
    const since = rig.producer.received.length;

    await pressUnheard(rig, ['go'], how);
    await drop(rig, how);
    await reconnect(rig, how);
    await rig.shows(['Live cue 1', ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)('never pauses once they have connected again on a cue that the cue a Go lands on follows on to while they were offline: $how', async ({ how }) => {
    // Cue 2, fired at the console with the lights disarmed, has no follow, and is the live cue at the
    // drop.
    const rig = await armedOnCue2(FOLLOW_SHOW, FOLLOW_LIST);
    const since = rig.producer.received.length;

    // Go lands on cue 3, whose follow fires 3.1 while the lights are offline.
    await pressUnheard(rig, ['go'], how);
    await drop(rig, how);
    rig.fake.follow('3.1');
    await reconnect(rig, how);
    await rig.shows(['Live cue 3.1', ...FOLLOW_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)('never pauses once they have connected again on the cue two Go presses land on, one cue after the other: $how', async ({ how }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;

    // From cue 3 the first Go lands on 3.5, and the second on 4.
    await pressUnheard(rig, ['go', 'go'], how);
    await drop(rig, how);
    await reconnect(rig, how);
    await rig.shows(['Live cue 4', ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)('never pauses once they have connected again on the live cue, after a Back that only stopped its fade: $how', async ({ how }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;

    // The fake runs no fades, so its Back goes back; putting it on cue 3 again leaves it as a Back
    // that stopped cue 3's fade leaves Eos.
    await pressUnheard(rig, ['back'], how);
    await drop(rig, how);
    rig.fake.follow('3');
    await reconnect(rig, how);
    await rig.shows(['Live cue 3: Goodness of God', ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)('never pauses once they have connected again after a Back that only stopped a fade and a Go: $how', async ({ how }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;

    // The fake runs no fades, so the test moves it onto 3.5, where the lights expect Eos after a
    // Back that stopped cue 3's fade and a Go from cue 3.
    await pressUnheard(rig, ['back', 'go'], how);
    await drop(rig, how);
    rig.fake.follow('3.5');
    await reconnect(rig, how);
    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)("never pauses once they have connected again after the live cue's follow and a Go: $how", async ({ how }) => {
    const rig = await armedOnCue3(FOLLOWED_3);
    const since = rig.producer.received.length;

    // Cue 3's follow fires 3.5 unheard, so the Go lands on 4.
    eatFireEvents(rig, how);
    rig.fake.follow('3.5');
    await pressUnheard(rig, ['go'], how);
    await drop(rig, how);
    await reconnect(rig, how);
    await rig.shows(['Live cue 4', ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)("pauses once they have connected again on a cue fired by hand at the console during a drop long after a Go that fired the live cue's follow cue: $how", async ({ how }) => {
    const rig = await armedOnCue3(FOLLOWED_3);
    const { fake, clock, next, lights, latest } = rig;

    // A Go during cue 3's follow wait fires 3.5, the cue the follow fires, so its fire event never
    // tells the lights it answers the Go.
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    // Eos answers pings long past the window, so the Go has had every answer it gets.
    const sent = pings(fake).length;
    for (let ping = 1; ping <= 3; ping += 1) {
      clock.advance(PING_MS);
      await vi.waitFor(() => expect(pings(fake)).toHaveLength(sent + ping));
    }

    eatFireEvents(rig, how);
    await drop(rig, how);
    fake.fireByHand('4');
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await reconnect(rig, how);
    await paused;
    await rig.shows(['Live cue 4', ...SONG_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it.each(DROPS)("pauses once they have connected again on a cue fired by hand at the console during a drop just after a Go that fired the live cue's follow cue: $how", async ({ how }) => {
    const rig = await armedOnCue3(FOLLOWED_3);
    const { fake, next, lights, latest } = rig;

    // The Go fires 3.5, and the lights see its fire event, which uses the Go up, though it is also
    // the cue the follow fires. The drop comes within the window.
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    eatFireEvents(rig, how);
    await drop(rig, how);
    fake.fireByHand('4');
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await reconnect(rig, how);
    await paused;
    await rig.shows(['Live cue 4', ...SONG_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it.each(DROPS)('never pauses once they have connected again after a Go from the last cue and a Back: $how', async ({ how }) => {
    const rig = await armedOnLastCue();
    const since = rig.producer.received.length;

    // The Go on the last cue fires nothing (go-last-cue.json), so the Back lands on 7.
    await pressUnheard(rig, ['go', 'back'], how);
    await drop(rig, how);
    await reconnect(rig, how);
    await rig.shows(['Live cue 7: Great Are You Lord / Chorus', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)('never pauses once they have connected again on the first cue, after a Go on the last cue of a cue list with Wrap set: $how', async ({ how }) => {
    const rig = await armedOnLastCue();
    const since = rig.producer.received.length;

    // The fake has no Wrap, so the test moves it onto the first cue, as Wrap fires it.
    await pressUnheard(rig, ['go'], how);
    await drop(rig, how);
    rig.fake.follow('1');
    await reconnect(rig, how);
    await rig.shows(['Live cue 1: Goodness of God / Intro', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)('never pauses once they have connected again on the last cue, after a Back on the first cue of a cue list with Wrap set: $how', async ({ how }) => {
    const rig = await armedOnFirstCue();
    const since = rig.producer.received.length;

    // The fake has no Wrap, so the test moves it onto the last cue, as Wrap fires it.
    await pressUnheard(rig, ['back'], how);
    await drop(rig, how);
    rig.fake.follow('8');
    await reconnect(rig, how);
    await rig.shows(['Live cue 8', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it.each(DROPS)('never pauses once they have connected again after a Back on the first cue, which fades the cue list out, as recorded: $how', async ({ how }) => {
    const rig = await armedOnFirstCue();
    const since = rig.producer.received.length;

    // back-first-cue.json: Eos fires cue 0, and names no numbered active cue when they connect again.
    await pressUnheard(rig, ['back'], how);
    await drop(rig, how);
    await reconnect(rig, how);
    await rig.shows([...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it.each(
    overDrops([
      { button: 'go', byHand: '2', landsOn: 'Live cue 2' },
      { button: 'back', byHand: '6', landsOn: 'Live cue 6: Great Are You Lord' },
    ] as const),
  )('pause once they have connected again on a cue fired by hand at the console during the drop that ate a $button: $how', async ({ button, byHand, landsOn, how }) => {
    const rig = await armedOnCue3();
    const { fake, next, lights, latest } = rig;

    await pressUnheard(rig, [button], how);
    await drop(rig, how);
    fake.fireByHand(byHand);
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await reconnect(rig, how);
    await paused;
    await rig.shows([landsOn, ...SONG_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it.each(
    overDrops([
      { button: 'go', end: 'last', byHand: '5', landsOn: 'Live cue 5: Great Are You Lord / Count Off' },
      { button: 'back', end: 'first', byHand: '4', landsOn: 'Live cue 4: Goodness of God / End' },
    ] as const),
  )('pause once they have connected again on a cue fired by hand at the console during the drop that ate a $button on the $end cue: $how', async ({ button, end, byHand, landsOn, how }) => {
    const rig = end === 'last' ? await armedOnLastCue() : await armedOnFirstCue();
    const { fake, next, lights, latest } = rig;

    await pressUnheard(rig, [button], how);
    await drop(rig, how);
    fake.fireByHand(byHand);
    const paused = next((snapshot) => lights(snapshot)?.pause === 'by-hand');
    await reconnect(rig, how);
    await paused;
    await rig.shows([landsOn, ...RECORDED_LIST]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  // An Eos that names no active cue on connect, as on a freshly loaded show, leaves the lights no
  // live cue to predict a Go from: they keep nothing, so the cue Eos is on when they connect again
  // is judged against nothing.
  it.each(DROPS)('never pause once they have connected again after a Go with no live cue to predict it from: $how', async ({ how }) => {
    const rig = await armedOnCue3();
    const { fake, next, lights, comesOnline } = rig;
    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    fake.setShow(SONG_SHOW);
    await fake.accept();
    await comesOnline();
    await rig.shows([...SONG_LIST]);
    const since = rig.producer.received.length;

    // With no current cue, the fake's Go lands on the first cue.
    await pressUnheard(rig, ['go'], how);
    await drop(rig, how);
    await reconnect(rig, how);
    await rig.shows(['Live cue 1', ...SONG_LIST]);
    await neverPaused(rig, since);
  });
});

// Eos answers a Go or a Back over one connection in command order, so with no drop the fire event
// that answers it is one it can land on from the live cue, and never one the live cue's follow
// fires.
describe("the fire event that answers the lights' own Go and Back", () => {
  it.each([
    { order: 'its active cue before its fire event', activeFirst: true },
    { order: 'its fire event alone', activeFirst: false },
  ])("never pauses on the producer's Go with no live cue, answered with $order", async ({ activeFirst }) => {
    const rig = await lightsRig({ show: RECORDED_SHOW, position: 28 });
    await rig.read();
    await rig.arm();
    const since = rig.producer.received.length;
    rig.fake.holdFires();
    const sent = cueListMessages(rig.fake).length;
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));
    if (activeFirst) rig.fake.emit('/eos/out/active/cue/1/1', [0.0]);
    rig.fake.releaseFires();
    await vi.waitFor(() => expect(rig.latest()?.state).toEqual([expect.stringMatching(/^Live cue 1\b/)]), { timeout: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await neverPaused(rig, since);
  });

  // As at a reconnect before the connect burst's active cue: Eos names cue 3 active while the
  // lights' own command is pending, so it does not place the live cue, and the event that answers
  // the command places none either. Cue 3's follow then fires 3.5, the cue Eos fires by itself
  // after cue 3.
  it.each([
    { button: 'go', answer: '/eos/out/event/cue/1/0/resume' },
    { button: 'back', answer: '/eos/out/event/cue/1/0/stop' },
  ] as const)("never pauses on the follow of the cue Eos named active while the producer's $button with no live cue was pending, after the event that answers it", async ({ button, answer }) => {
    const rig = await lightsRig({ show: FOLLOWED_3, position: 28 });
    await rig.read();
    await rig.arm();
    const since = rig.producer.received.length;
    rig.fake.holdFires();
    const sent = cueListMessages(rig.fake).length;
    await rig.press({ kind: 'run-button', target: 'eos', button });
    await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));
    rig.fake.emit('/eos/out/active/cue/1/3', [1.0]);
    rig.fake.emit(answer, ['']);
    await new Promise((resolve) => setTimeout(resolve, 100));
    rig.fake.emit('/eos/out/event/cue/1/3.5/fire', ['']);
    await vi.waitFor(() => expect(rig.latest()?.state).toEqual([expect.stringMatching(/^Live cue 3\.5\b/)]), { timeout: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await neverPaused(rig, since);
  });

  // A cue edited at the console since the last read, which the notify has not yet re-read: the Go
  // that fires it is judged again once a fresh read ends. The fake's own show is not edited, so its
  // Go fires 3.5 unheard, and the test sends the fire event Eos sends from the edited list.
  it.each([
    { name: 'a cue added at the console since the read, still not in the list read again', number: '3.7', label: 'Goodness of God / Tag', line: 'Live cue 3.7: Goodness of God / Tag' },
    { name: 'the cue the list predicts', number: '3.5', label: '', line: 'Live cue 3.5' },
  ])('never pauses on a Go that Eos answers with $name', async ({ number, label, line }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    await pressUnheard(rig, ['go'], 'silent');
    rig.fake.speak();
    rig.fake.emit(`/eos/out/event/cue/1/${number}/fire`, [label]);
    await rig.shows([line, ...SONG_LIST]);
    await neverPaused(rig, since);
  });

  const DELETED_3_5 = SONG_SHOW.filter((cue) => cue.number !== '3.5');
  const ADDED_3_7 = [...SONG_SHOW.slice(0, 4), { number: '3.7', label: 'Goodness of God / Tag' }, ...SONG_SHOW.slice(4)];
  const MOVED_3_5 = SONG_SHOW.map((cue) => (cue.number === '3.5' ? { ...cue, number: '3.7' } : cue));
  const listOf = (show: FakeEosCue[]) => show.map((cue) => (cue.label === '' ? `Cue ${cue.number}` : `Cue ${cue.number}: ${cue.label}`));
  const EDITS = [
    { edit: 'deleted', show: DELETED_3_5, notify: 3.5, fires: 'Live cue 4' },
    { edit: 'recorded', show: ADDED_3_7, notify: 3.7, fires: 'Live cue 4' },
    { edit: 'renumbered', show: MOVED_3_5, notify: '3.5-3.7', fires: 'Live cue 3.7' },
  ];

  it.each(EDITS)("never pauses on the producer's Go after a cue $edit at the console and Eos's notify of it", async ({ show, notify, fires }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.editShow(show, { notify });
    await rig.shows(['Live cue 3: Goodness of God', ...listOf(show)]);

    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });

    await rig.shows([fires, ...listOf(show)]);
    await neverPaused(rig, since);
  });

  it.each(EDITS)("never pauses on the producer's Go after a cue $edit at the console, before Eos's notify of it comes", async ({ show, notify, fires }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.holdNotifies();
    rig.fake.editShow(show, { notify });

    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await rig.shows([fires, ...listOf(show)]);
    rig.fake.releaseNotifies();

    await neverPaused(rig, since);
  });

  // The Back side of the same edits. A cue recorded at the console is the cue Eos is on, with no
  // fire event, so a Back from it fires 3.5, which the live cue 3 does not place: the re-judge
  // takes it from the cue Eos named as active. Each ends with a cue fired at the console, which
  // still pauses.
  const BACKS = [
    { edit: 'deleted', show: DELETED_3_5, notify: 3.5, lands: 'Live cue 2' },
    { edit: 'recorded', show: ADDED_3_7, notify: 3.7, lands: 'Live cue 3.5' },
    { edit: 'renumbered', show: MOVED_3_5, notify: '3.5-3.7', lands: 'Live cue 2' },
  ];

  it.each(BACKS)("never pauses on the producer's Back after a cue $edit at the console and Eos's notify of it, and pauses for a cue fired at the console after it", async ({ show, notify, lands }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.editShow(show, { notify });
    await rig.shows(['Live cue 3: Goodness of God', ...listOf(show)]);

    await rig.press({ kind: 'run-button', target: 'eos', button: 'back' });

    await rig.shows([lands, ...listOf(show)]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
    rig.fake.fireByHand('6');
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // A Back the list read before accounts for starts no read, so the row keeps that list until the
  // notify comes.
  it.each(BACKS)("never pauses on the producer's Back after a cue $edit at the console, before Eos's notify of it comes, and pauses for a cue fired at the console after it", async ({ show, notify, lands }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.holdNotifies();
    rig.fake.editShow(show, { notify });

    await rig.press({ kind: 'run-button', target: 'eos', button: 'back' });
    await vi.waitFor(() => expect(rig.latest()?.state).toEqual([lands]), { timeout: 2000, interval: 20 });
    rig.fake.releaseNotifies();
    await rig.shows([lands, ...listOf(show)]);

    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
    rig.fake.fireByHand('6');
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // A cue recorded at the console stays the cue a Go is placed from until the next fire event, however
  // long ago Eos named it, since real Eos notifies about 1 s after the edit
  // (cue-edit-at-console-subscribed.json), so the producer's Go always comes later than the window.
  it("never pauses on the producer's Go pressed longer than the window after a cue recorded at the console and Eos's notify of it", async () => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.editShow(ADDED_3_7, { notify: 3.7 });
    await rig.shows(['Live cue 3: Goodness of God', ...listOf(ADDED_3_7)]);
    rig.clock.advance(OWN_COMMAND_WINDOW_MS + 1);

    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });

    await rig.shows(['Live cue 4', ...listOf(ADDED_3_7)]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
  });

  it("never pauses on the producer's Go after a cue deleted at the console that Eos never notifies", async () => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.editShow(DELETED_3_5, { notify: false });

    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });

    await rig.shows(['Live cue 4', ...listOf(DELETED_3_5)]);
    await neverPaused(rig, since);
  });

  // The live cue 3 moved past 3.5 at the keypad (Cue 3 Move To 3.7), and the producer's press reaches
  // Eos before the notify: the list as read before says neither, and the fresh list no longer has
  // cue 3 to place the press from.
  const MOVED_3 = [...SONG_SHOW.slice(0, 2), SONG_SHOW[3]!, { ...SONG_SHOW[2]!, number: '3.7' }, ...SONG_SHOW.slice(4)];
  it.each([
    { button: 'go' as const, line: 'Live cue 4' },
    { button: 'back' as const, line: 'Live cue 3.5' },
  ])("never pauses on the producer's $button after the live cue moved past the next cue at the console, before Eos's notify of it comes", async ({ button, line }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.editShow(MOVED_3, { notify: false });

    await rig.press({ kind: 'run-button', target: 'eos', button });

    await rig.shows([line, ...listOf(MOVED_3)]);
    await neverPaused(rig, since);
  });

  it.each([
    { then: 'a Back', press: { kind: 'run-button', target: 'eos', button: 'back' } as const, lands: 'Live cue 3: Goodness of God' },
    { then: 'Fire again', press: { kind: 'fire-again', target: 'eos' } as const, lands: 'Live cue 3: Goodness of God' },
    { then: 'nothing', press: null, lands: 'Live cue 3.7' },
  ])("never pauses on the producer's Go after a cue renumbered at the console, before Eos's notify of it, with $then answered before the fresh read ends", async ({ press, lands }) => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.holdNotifies();
    rig.fake.editShow(MOVED_3_5, { notify: '3.5-3.7' });
    rig.fake.holdReads();

    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await rig.shows(['Live cue 3.7', ...SONG_LIST]);
    if (press) await rig.press(press);
    await rig.shows([lands, ...SONG_LIST]);
    rig.fake.releaseReads();
    await rig.shows([lands, ...listOf(MOVED_3_5)]);
    rig.fake.releaseNotifies();

    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
  });

  it('pauses for a cue fired at the console after a cue recorded at the console, with a Go pending that fires the cue after the recorded one', async () => {
    const rig = await armedOnCue3();
    rig.fake.editShow(ADDED_3_7, { notify: 3.7 });
    await rig.shows(['Live cue 3: Goodness of God', ...listOf(ADDED_3_7)]);
    rig.fake.holdFires();
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(GO));

    rig.fake.fireByHand('6');

    await rig.shows(['Live cue 6: Great Are You Lord', ...listOf(ADDED_3_7)]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // Each cue recorded at the console from cue 3 becomes Eos's active cue with no fire event, so
  // after 3.7 then 5.5 Eos is on 5.5, and a Go from there fires 6, not the 4 a Go from 3.7 fires.
  it.each([
    { name: 'when it is a Go from a cue recorded at the console before the cue Eos is on now', records: ['3.7', '5.5'] },
    { name: 'after one cue recorded at the console past it', records: ['5.5'] },
  ])('pauses for a cue fired at the console with a Go pending, $name', async ({ records }) => {
    const rig = await armedOnCue3();
    let show = SONG_SHOW.map((cue) => ({ ...cue }));
    for (const number of records) {
      show = [...show, { number, label: `Recorded ${number}` }].sort((a, b) => Number(a.number) - Number(b.number));
      rig.fake.editShow(show, { notify: Number(number) });
      await rig.shows(['Live cue 3: Goodness of God', ...listOf(show)]);
    }
    rig.fake.holdFires();
    const sent = cueListMessages(rig.fake).length;
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));

    rig.fake.fireByHand('4');

    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // Eos can send a cue's active cue before its fire event (fire-follow-chain.json), so the cue the
  // Go fires is named active too, and the cue recorded before it still places the Go.
  it('never pauses on a Go after a cue recorded at the console, answered with its active cue before its fire event', async () => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.editShow(ADDED_3_7, { notify: 3.7 });
    await rig.shows(['Live cue 3: Goodness of God', ...listOf(ADDED_3_7)]);
    await pressUnheard(rig, ['go'], 'silent');
    rig.fake.speak();
    rig.fake.emit('/eos/out/active/cue/1/4', [1.0]);
    rig.fake.emit('/eos/out/event/cue/1/4/fire', ['']);
    await rig.shows(['Live cue 4', ...listOf(ADDED_3_7)]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await neverPaused(rig, since);
  });

  it('pauses for the cue after a cue recorded at the console, fired at the console with a Go pending once a fire event has come since the record', async () => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.editShow(ADDED_3_7, { notify: 3.7 });
    await rig.shows(['Live cue 3: Goodness of God', ...listOf(ADDED_3_7)]);
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await rig.shows(['Live cue 4', ...listOf(ADDED_3_7)]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
    rig.fake.holdFires();
    const sent = cueListMessages(rig.fake).length;
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));

    rig.fake.fireByHand('4');

    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it('pauses for the cue after a cue recorded at the console before a drop, fired at the console with a Go pending once the lights connect again', async () => {
    const rig = await armedOnCue3();
    rig.fake.editShow(ADDED_3_7, { notify: 3.7 });
    await rig.shows(['Live cue 3: Goodness of God', ...listOf(ADDED_3_7)]);
    const dropped = rig.next((snapshot) => rig.lights(snapshot)?.connection === 'offline');
    await rig.fake.refuse();
    await dropped;
    rig.fake.fireByHand('6');
    await rig.fake.accept();
    await rig.comesOnline();
    await rig.shows(['Live cue 6: Great Are You Lord', ...listOf(ADDED_3_7)]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ pause: 'by-hand' })), { timeout: 2000 });
    await rig.arm();
    rig.fake.holdFires();
    const sent = cueListMessages(rig.fake).length;
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));

    rig.fake.fireByHand('4');

    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // The close forgets the cue recorded before the drop, so it no longer places the Go: a Go from
  // cue 4, fired at the console during the drop, fires 5, and 4 fired again at the console pauses.
  it('pauses for the live cue fired again at the console with a Go pending, once the lights connect again after a cue recorded before the drop', async () => {
    const rig = await armedOnCue3();
    rig.fake.editShow(ADDED_3_7, { notify: 3.7 });
    await rig.shows(['Live cue 3: Goodness of God', ...listOf(ADDED_3_7)]);
    const dropped = rig.next((snapshot) => rig.lights(snapshot)?.connection === 'offline');
    await rig.fake.refuse();
    await dropped;
    rig.fake.fireByHand('4');
    await rig.fake.accept();
    await rig.comesOnline();
    await rig.shows(['Live cue 4', ...listOf(ADDED_3_7)]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ pause: 'by-hand' })), { timeout: 2000 });
    await rig.arm();
    rig.fake.holdFires();
    const sent = cueListMessages(rig.fake).length;
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));

    rig.fake.fireByHand('4');

    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it('pauses for a cue fired at the console while a Go is in flight, when the Go is answered before the fresh read ends', async () => {
    const rig = await armedOnCue3();
    rig.fake.holdReads();
    rig.fake.holdFires();
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(GO));

    rig.fake.fireByHand('6');
    await rig.shows(['Live cue 6: Great Are You Lord', ...SONG_LIST]);
    rig.fake.releaseFires();

    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
    // The answer's pause is sticky; re-arm so only the re-judge can pause again.
    await rig.arm();
    rig.fake.releaseReads();
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // The live cue's follow fires 3.5 while the Go is in flight, so the Go lands on 4. The 3.5 event
  // could be the Go's own, so it uses the Go up, and 4 reads as a cue fired at the console: the same
  // events as a Go that fires 3.5 and a cue 4 fired at the console after it, which must pause.
  it("pauses when the live cue's follow event comes after a Go was sent, and the Go then fires the cue after it", async () => {
    const rig = await armedOnCue3(FOLLOWED_3);

    rig.fake.silence();
    rig.fake.follow('3.5');
    await pressUnheard(rig, ['go'], 'silent');
    rig.fake.speak();
    rig.fake.emit('/eos/out/event/cue/1/3.5/fire', ['']);
    rig.fake.emit('/eos/out/event/cue/1/4/fire', ['']);
    await rig.shows(['Live cue 4', ...SONG_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it('pauses for a cue fired at the console just after a Go fired the cue the live cue follows on to', async () => {
    const rig = await armedOnCue3(FOLLOWED_3);
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    await rig.producer.flush();
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));

    rig.fake.fireByHand('4');

    await rig.shows(['Live cue 4', ...SONG_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 3000 });
  });

  it('pauses for a cue fired at the console just after a Go from the last cue', async () => {
    const rig = await armedOnLastCue();

    // The Go fires nothing (go-last-cue.json), and cue 6 fired at the console is no cue it lands on.
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(GO));
    rig.fake.fireByHand('6');
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it('pauses for cue 1 fired at the console just after a Go on the last cue and Fire again of cue 1', async () => {
    // Song 1's cue is the first cue, so a Go on the last cue fires it as Wrap does.
    const show = SONG_SHOW.map((cue) => (cue.number === '1' ? { ...cue, label: 'Goodness of God' } : cue.number === '3' ? { ...cue, label: '' } : cue));
    const list = show.map(({ number, label }) => (label === '' ? `Cue ${number}` : `Cue ${number}: ${label}`));
    const rig = await lightsRig({ show, position: 12 });
    await rig.read();
    rig.fake.fireByHand('8');
    await rig.shows(['Live cue 8', ...list]);
    await rig.arm();
    // The Go fires nothing (go-last-cue.json), then Fire again in song 1's Intro fires cue 1: its fire
    // event is Fire again's, not the one Wrap would give the Go.
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(GO));
    await rig.press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(rig.fake)).toContain(fire('1')));
    await rig.shows(['Live cue 1: Goodness of God', ...list]);
    await rig.producer.flush();
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));

    rig.fake.fireByHand('1');

    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 3000 });
  });

  it('never pauses on the first cue fired in answer to a Go on the last cue, as Wrap fires it', async () => {
    const rig = await armedOnLastCue();
    const since = rig.producer.received.length;

    // The fake has no Wrap, so it fires nothing, and the test sends the fire event Wrap would.
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(GO));
    rig.fake.emit('/eos/out/event/cue/1/1/fire', ['Goodness of God / Intro']);
    await rig.shows(['Live cue 1: Goodness of God / Intro', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it('never pauses on the fire of cue 0 that answers a Back on the first cue, which it uses up, so a fire by hand after it still pauses', async () => {
    const rig = await armedOnFirstCue();
    const since = rig.producer.received.length;

    // back-first-cue.json: the Back fades the cue list out, with a fire event of cue 0. The row read
    // cue 1 before the Back, so only that fire event leaves it with no live cue line.
    await rig.press({ kind: 'run-button', target: 'eos', button: 'back' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(BACK));
    await rig.shows([...RECORDED_LIST]);
    await neverPaused(rig, since);

    // Within the window, but the Back has had its answer.
    const paused = rig.next((snapshot) => rig.lights(snapshot)?.arm === 'paused');
    rig.fake.fireByHand('4');
    await paused;
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it('shows no live cue once a Back on the first cue fades the list out, then names the first cue a Go fires from there, armed through both', async () => {
    const rig = await armedOnFirstCue();
    const since = rig.producer.received.length;

    // back-first-cue.json: the list faded out, as before the first fire, with no line marked.
    await rig.press({ kind: 'run-button', target: 'eos', button: 'back' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(BACK));
    await rig.shows([...RECORDED_LIST]);
    expect(rig.latest()).toMatchObject({ state: [], listCurrent: null });

    // The fake has no cue active after the Back, so its Go fires the first cue.
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(GO));
    await rig.shows(['Live cue 1: Goodness of God / Intro', ...RECORDED_LIST]);
    expect(rig.latest()?.listCurrent).toBe(0);
    await neverPaused(rig, since);
  });
});

// A link to a cue in another list is the string "99/1" in argument 19 of the list reply, where a link
// in the same list is an int (link-to-another-list.json). Such a cue fires no cue of the followed
// list on a Go, a follow or a hang. What a Go from it fires is not recorded, so the fake answers with
// the linked cue's fire event in list 99 and stays on cue 4, and that fire event after the Go is the
// lights' own (setlist-controller#328), where a fire event of any other cue or list is not
// (setlist-controller#336).
const LINKED_OUT: FakeEosCue[] = RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link: '99/1' } : cue));
const LIVE_4 = 'Live cue 4: Goodness of God / End';
// That cue of that show as a line of the lights row, after that lead.
const cueLineOf = (show: FakeEosCue[], number: string, lead: string) => {
  const label = show.find((cue) => cue.number === number)?.label ?? '';
  return label === '' ? `${lead} ${number}` : `${lead} ${number}: ${label}`;
};
// The one-cue-per-song show with the same link on cue 4, for a test that fires a song's cue.
const SONG_LINKED_OUT: FakeEosCue[] = SONG_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link: '99/1' } : cue));
// A rig armed with cue 4, song 1's End, the live cue, fired at the console while the lights were
// disarmed, on that show (LINKED_OUT by default), whose cue list the row shows as that list.
async function armedOnCue4(show: FakeEosCue[] = LINKED_OUT, list = RECORDED_LIST) {
  const rig = await lightsRig({ show, position: 28 });
  await rig.read();
  rig.fake.fireByHand('4');
  await rig.shows([cueLineOf(show, '4', 'Live cue'), ...list]);
  await rig.arm();
  return rig;
}
// Presses Go, and waits for the fake to hold it.
async function pressGo(rig: LightsRig) {
  const sent = cueListMessages(rig.fake).length;
  await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
  await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));
}
// The cue after cue 4 in the list, which a Go from it fires when it has no link, and cue 1, the cue
// of the followed list with the number after the link's "/".
const NOT_LINKED = [
  { number: '5', line: 'Live cue 5: Great Are You Lord / Count Off' },
  { number: '1', line: 'Live cue 1: Goodness of God / Intro' },
];
// Each case once for each of those cues.
const overNotLinked = <T extends object>(cases: T[]) => NOT_LINKED.flatMap((cue) => cases.map((each) => ({ ...each, ...cue })));

describe('a cue linked to a cue in another list', () => {
  it.each(NOT_LINKED)("pauses on cue $number fired at the console after the producer's Go from it", async ({ number, line }) => {
    const rig = await armedOnCue4();
    await pressGo(rig);

    rig.fake.fireByHand(number);

    await rig.shows([line, ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // A link the lights cannot read is outside the list, so a Go from it predicts no cue of the list,
  // and the cue after it fired at the console pauses. The fake's answer to the Go is held, since what
  // Eos fires for such a link is not recorded.
  it.each([
    { form: 'no "/"', link: '99' },
    { form: 'no cue number after the "/"', link: '99/' },
  ])("pauses on cue 5 fired at the console after the producer's Go from a cue whose link has $form", async ({ link }) => {
    const rig = await armedOnCue4(RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link } : cue)));
    rig.fake.holdFires();
    await pressGo(rig);

    rig.fake.fireByHand('5');

    await rig.shows(['Live cue 5: Great Are You Lord / Count Off', ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it("never pauses on the producer's Go from it, answered by a fire event of a cue in another list, and keeps cue 4 the live cue", async () => {
    const rig = await armedOnCue4();
    const since = rig.producer.received.length;

    await pressGo(rig);

    await vi.waitFor(() => expect(rig.fake.received.at(-1)?.address).toBe('/eos/cues/1/fire'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await rig.shows([LIVE_4, ...RECORDED_LIST]);
    expect(rig.latest()?.listCurrent).toBe(4);
    await neverPaused(rig, since);
  });

  // With the reads held, a cue fired at the console pauses at once only when the other list's fire
  // event used the Go up; a Go still pending would wait on a fresh read of the cue list.
  it.each(NOT_LINKED)("pauses at once on cue $number fired at the console after that Go's fire event of another list, with no fresh read", async ({ number, line }) => {
    const rig = await armedOnCue4();
    await pressGo(rig);
    rig.fake.holdReads();

    rig.fake.fireByHand(number);

    await rig.shows([line, ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // The other list's fire event comes after a notify's read of a cue list the console changed while
  // the producer's Go was in flight, so the list as read now no longer says the live cue links
  // outside it. The Go was pressed against the list as read then, so that event still answers it.
  // With the reads held, a Go left pending would wait on a fresh read, so the pause has to come at
  // once.
  it.each(
    overNotLinked([
      { edit: 'renumbered to 4.5', show: LINKED_OUT.map((cue) => (cue.number === '4' ? { ...cue, number: '4.5' } : cue)), notify: '4-4.5', list: RECORDED_LIST.map((line) => line.replace('Cue 4:', 'Cue 4.5:')) },
      { edit: 'left with no link', show: RECORDED_SHOW, notify: 4, list: RECORDED_LIST },
    ]),
  )("pauses at once on cue $number fired at the console after another list's fire event answered the Go from cue 4, with cue 4 $edit at the console in between", async ({ number, line, show, notify, list }) => {
    const rig = await armedOnCue4();
    rig.fake.holdFires();
    await pressGo(rig);
    const before = counts(rig.fake);
    rig.fake.editShow(show, { notify });
    // The notify's read, once in full, runs the check, whose read counts the list again.
    await vi.waitFor(() => expect(counts(rig.fake)).toBe(before + 2));
    rig.fake.holdReads();

    rig.fake.releaseFires();
    rig.fake.fireByHand(number);

    await rig.shows([line, ...list]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // The console renumbers cue 4, the live cue, to 4.5 and keeps its link, and Eos names 4.5 active
  // with no fire event, so the live cue is one the lights can no longer place. The producer's Go
  // comes after the notify's read, so it is a Go from 4.5, the cue Eos named, which links outside
  // the list, and the other list's fire event answers it. With the reads held, a Go left pending
  // would wait on a fresh read, so the pause has to come at once.
  it.each(NOT_LINKED)("pauses at once on cue $number fired at the console after another list's fire event answered a Go pressed once the console renumbered cue 4 to 4.5 and the list was read", async ({ number, line }) => {
    const rig = await armedOnCue4();
    const before = counts(rig.fake);
    rig.fake.editShow(LINKED_OUT.map((cue) => (cue.number === '4' ? { ...cue, number: '4.5' } : cue)), { notify: '4-4.5' });
    // The notify's read, once in full, runs the check, whose read counts the list again.
    await vi.waitFor(() => expect(counts(rig.fake)).toBe(before + 2));
    rig.fake.holdReads();
    await pressGo(rig);

    rig.fake.fireByHand(number);

    await rig.shows([line, ...RECORDED_LIST.map((listed) => listed.replace('Cue 4:', 'Cue 4.5:'))]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // With no live cue, Eos has no active cue in the list, and its Go fires the list's first cue
  // (connect-no-active-cue.json), never a cue of another list, so a fire event of another list
  // takes no Go pressed then, and the Go's own fire event still answers it.
  it("never takes a fire event of another list for the producer's Go with no live cue, so the Go's own fire event of the first cue still answers it", async () => {
    const rig = await lightsRig({ show: RECORDED_SHOW, position: 28 });
    await rig.read();
    await rig.arm();
    const since = rig.producer.received.length;
    rig.fake.holdFires();
    await pressGo(rig);

    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);
    rig.fake.releaseFires();

    await rig.shows(['Live cue 1: Goodness of God / Intro', ...RECORDED_LIST]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
  });

  // As at a reconnect before the connect burst's active cue: with no live cue, Eos names cue 4
  // active while the producer's Go is pending, so it does not place the live cue, and the Go is
  // still a Go from cue 4.
  it("pauses on a cue fired at the console after the producer's Go with no live cue from the cue linked outside that Eos named active while the Go was pending", async () => {
    const rig = await lightsRig({ show: LINKED_OUT, position: 28 });
    await rig.read();
    await rig.arm();
    rig.fake.holdFires();
    await pressGo(rig);
    rig.fake.emit('/eos/out/active/cue/1/4', [1.0]);
    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);

    rig.fake.fireByHand('5');

    await rig.shows(['Live cue 5: Great Are You Lord / Count Off', ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // As at a reconnect: with no live cue, Eos has named cue 4 active, and another list's fire event
  // has answered a first Go from it. A second Go is pressed from cue 4 as the list then reads, and the
  // console drops cue 4's link before that Go's answer comes, so the list as read now no longer says
  // cue 4 links outside it. The other list's fire event still answers the second Go.
  it.each(NOT_LINKED)("pauses at once on cue $number fired at the console after another list's fire event answered a Go with no live cue from the cue Eos named active, with that cue's link dropped at the console in between", async ({ number, line }) => {
    const rig = await lightsRig({ show: LINKED_OUT, position: 28 });
    await rig.read();
    await rig.arm();
    rig.fake.holdFires();
    await pressGo(rig);
    rig.fake.emit('/eos/out/active/cue/1/4', [1.0]);
    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);
    await pressGo(rig);
    const before = counts(rig.fake);
    rig.fake.editShow(RECORDED_SHOW, { notify: 4 });
    // The notify's read, once in full, runs the check, whose read counts the list again.
    await vi.waitFor(() => expect(counts(rig.fake)).toBe(before + 2));
    rig.fake.holdReads();

    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);
    rig.fake.fireByHand(number);

    await rig.shows([line, ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // As at a reconnect before the connect burst's active cue: the producer's Go is pressed with no
  // live cue and no cue Eos has named, Eos then names cue 4 active, and the console drops cue 4's
  // link before the Go's answer comes. The Go is a Go from cue 4 as the list read when Eos named it,
  // so the other list's fire event still answers it.
  it.each(NOT_LINKED)("pauses at once on cue $number fired at the console after another list's fire event answered a Go pressed before Eos named its cue active, with that cue's link dropped at the console in between", async ({ number, line }) => {
    const rig = await lightsRig({ show: LINKED_OUT, position: 28 });
    await rig.read();
    await rig.arm();
    rig.fake.holdFires();
    await pressGo(rig);
    rig.fake.emit('/eos/out/active/cue/1/4', [1.0]);
    const before = counts(rig.fake);
    rig.fake.editShow(RECORDED_SHOW, { notify: 4 });
    // The notify's read, once in full, runs the check, whose read counts the list again.
    await vi.waitFor(() => expect(counts(rig.fake)).toBe(before + 2));
    rig.fake.holdReads();

    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);
    rig.fake.fireByHand(number);

    await rig.shows([line, ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it("never takes a fire event of another list for a Go from a cue with no such link, so the Go's own fire event still answers it", async () => {
    const rig = await armedOnCue3(SONG_LINKED_OUT);
    const since = rig.producer.received.length;
    rig.fake.holdReads();
    rig.fake.holdFires();
    await pressGo(rig);

    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);
    rig.fake.releaseFires();

    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
  });

  // The walk-in list fires at the console while the producer's Fire again of song 1's cue, 3, and
  // Go from cue 4 are pending. Its fire event is not of list 99's cue 1, the cue cue 4 links to, so
  // it answers neither, and the fire of cue 3 still answers its own fire event
  // (setlist-controller#336).
  it("never takes a fire event of a list the link does not name for the producer's Go from it, nor drops the fire of a cue sent before that Go", async () => {
    const rig = await armedOnCue4(SONG_LINKED_OUT, SONG_LIST);
    const since = rig.producer.received.length;
    rig.fake.holdFires();
    await rig.press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(rig.fake)).toContain(fire('3')));
    await pressGo(rig);

    rig.fake.emit('/eos/out/event/cue/2/1/fire', ['Walk-in / Cue 1']);
    rig.fake.releaseFires();

    // The fake's Go is from cue 3, the cue it fired just before, so it fires cue 3.5.
    await rig.shows(['Live cue 3.5', ...SONG_LIST]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
  });

  // With fires held, the fake's own answer to the Go, list 99's cue 1, comes after the walk-in
  // list's fire event. It still answers the Go, so with the reads held, a cue fired at the console
  // after it pauses at once, where a Go left pending would wait on a fresh read.
  it.each(NOT_LINKED)("pauses at once on cue $number fired at the console after the linked cue's fire event answered the Go from it, with a fire event of a list the link does not name in between", async ({ number, line }) => {
    const rig = await armedOnCue4();
    const since = rig.producer.received.length;
    rig.fake.holdFires();
    await pressGo(rig);
    rig.fake.emit('/eos/out/event/cue/2/1/fire', ['Walk-in / Cue 1']);
    rig.fake.releaseFires();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await rig.shows([LIVE_4, ...RECORDED_LIST]);
    await neverPaused(rig, since);
    rig.fake.holdReads();

    rig.fake.fireByHand(number);

    await rig.shows([line, ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // A fire event of list 99, the list the link names, but of cue 2, not the cue it names, leaves the
  // Go pending, so a cue fired at the console after it waits on a fresh read of the cue list, and
  // pauses once that read ends.
  it("leaves the producer's Go from it pending after a fire event of another cue of the list the link names, so cue 5 fired at the console waits on a fresh read", async () => {
    const rig = await armedOnCue4();
    rig.fake.holdFires();
    await pressGo(rig);
    rig.fake.emit('/eos/out/event/cue/99/2/fire', ['']);
    rig.fake.holdReads();

    rig.fake.fireByHand('5');

    await rig.shows(['Live cue 5: Great Are You Lord / Count Off', ...RECORDED_LIST]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
    rig.fake.releaseReads();
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  // A link the lights cannot read names no cue they can match, so a fire event of any other list
  // answers a Go from it, as the stand-in rule takes it, and with the reads held a cue fired at the
  // console after it pauses at once.
  it("pauses at once on cue 5 fired at the console after a fire event of any other list answered the producer's Go from a cue whose link has no \"/\"", async () => {
    const rig = await armedOnCue4(RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link: '99' } : cue)));
    rig.fake.holdFires();
    await pressGo(rig);
    rig.fake.emit('/eos/out/event/cue/2/1/fire', ['Walk-in / Cue 1']);
    rig.fake.holdReads();

    rig.fake.fireByHand('5');

    await rig.shows(['Live cue 5: Great Are You Lord / Count Off', ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it.each(overNotLinked([{ time: 'follow' }, { time: 'hang' }] as const))('pauses on cue $number that Eos fires after it, with a $time, taken as a cue fired at the console', async ({ time, number, line }) => {
    const rig = await armedOnCue4(RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link: '99/1', [time]: 1000 } : cue)));

    rig.fake.follow(number);

    await rig.shows([line, ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it("names as never firing a cue with an earlier cue's label that only a follow's link to a cue in another list, of the same number, would reach", async () => {
    const show: FakeEosCue[] = [...SONG_SHOW.map((cue) => (cue.number === '4' ? { ...cue, follow: 1000, link: '99/11' } : cue)), { number: '11', label: 'Goodness of God' }];
    const { checked } = await lightsRig({ show });

    expect(await checked()).toEqual({ kind: 'unmatched', names: [], problems: ['Goodness of God: cue 11 never fires, cue 3 has the same label'], notes: [] });
  });

  it.each(overDrops(NOT_LINKED))('pauses once they have connected again on cue $number, fired at the console during a drop that ate the answer to a Go from it: $how', async ({ number, line, how }) => {
    const rig = await armedOnCue4();

    await pressUnheard(rig, ['go'], how);
    await drop(rig, how);
    rig.fake.fireByHand(number);
    const paused = rig.next((snapshot) => rig.lights(snapshot)?.pause === 'by-hand');
    await reconnect(rig, how);

    await paused;
    await rig.shows([line, ...RECORDED_LIST]);
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it.each(DROPS)('never pauses once they have connected again on the cue a Back lands on, after a drop that ate the answers to a Go from it and that Back: $how', async ({ how }) => {
    const rig = await armedOnCue4();
    const since = rig.producer.received.length;

    // The Go fires no cue of the followed list and stays on cue 4, so the Back lands on 3.5.
    await pressUnheard(rig, ['go', 'back'], how);
    await drop(rig, how);
    await reconnect(rig, how);

    await rig.shows(['Live cue 3.5: Goodness of God / Bridge', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  // A link in the same list as the string "1/1", not the int 1, is read as the int is.
  const LINKED_IN = SONG_SHOW.map((cue) => (cue.number === '3' ? { ...cue, link: '1/1' } : cue));

  it("never pauses on the producer's Go from a cue whose string link names a cue of the followed list, which fires that cue", async () => {
    const rig = await armedOnCue3(LINKED_IN);
    const since = rig.producer.received.length;

    await pressGo(rig);

    await rig.shows(['Live cue 1', ...SONG_LIST]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await neverPaused(rig, since);
  });

  it.each(DROPS)('never pauses once they have connected again on the cue a Go lands on by a string link that names a cue of the followed list: $how', async ({ how }) => {
    const rig = await armedOnCue3(LINKED_IN);
    const since = rig.producer.received.length;

    await pressUnheard(rig, ['go'], how);
    await drop(rig, how);
    await reconnect(rig, how);

    await rig.shows(['Live cue 1', ...SONG_LIST]);
    await neverPaused(rig, since);
  });
});

describe('how late the lights get and fire a cue', () => {
  // The lights' line in the log for a section played into, but for its wall-clock time.
  const lineFor = (song: number, title: string, section: string, lateMs: number, actedMs: number | null) => ({ target: 'eos', song, title, section, cause: 'played-into', lateMs, actedMs });
  // Song 2's Count Off at 64 is its song-start section, so its cue, 6, fires for it.
  const countOff = (lateMs: number, actedMs: number | null) => lineFor(2, 'Great Are You Lord', 'Count Off', lateMs, actedMs);

  it("measures a cue to Eos's fire event for it, as the row's acted-on time and the line's actedMs", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const { fake, read, arm, play, next, lights, lateness } = await lightsRig({ show: SONG_SHOW, position: 60, latenessLog: { path } });
    await read();
    await arm();

    fake.holdFires();
    // Half a beat past song 2's Count Off at 64, with the server's clock still: cue 6, handed 250 ms
    // late, and not yet fired.
    await play(4.5, 64.5);
    await vi.waitFor(() => expect(fires(fake)).toEqual([fire('6')]));
    expect(await lateness()).toEqual({ last: 250, median: 250, acted: null, actedMedian: null });
    // Eos fires it 300 ms after the hand-off, by the server's clock.
    await rig!.advanceConnected(300);
    const acted = next((snapshot) => lights(snapshot)?.lateness.acted !== null);
    fake.releaseFires();
    await acted;
    expect(await lateness()).toEqual({ last: 250, median: 250, acted: 550, actedMedian: 550 });

    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOff(250, 550)]);
  });

  it('measures a cue whose fire event comes at once as acted on as it is handed over', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const { read, arm, play, lateness } = await lightsRig({ show: SONG_SHOW, position: 60, latenessLog: { path } });
    await read();
    await arm();

    await play(4.5, 64.5);

    await vi.waitFor(async () => expect(await lateness()).toEqual({ last: 250, median: 250, acted: 250, actedMedian: 250 }));
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([countOff(250, 250)]));
  });

  it("never measures a song with no cue: a jump onto song 1's Intro from song 2, and Fire again in it, change neither the row's lateness nor the log", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    // No cue carries song 1's title.
    const show = SONG_SHOW.map((cue) => (cue.number === '3' ? { ...cue, label: '' } : cue));
    const { fake, read, arm, jump, play, press, lateness } = await lightsRig({ show, position: 60, latenessLog: { path } });
    await read();
    await arm();
    // Half a beat past song 2's Count Off at 64: cue 6, handed 250 ms late, and fired at once.
    await play(4.5, 64.5);
    await vi.waitFor(async () => expect(await lateness()).toEqual({ last: 250, median: 250, acted: 250, actedMedian: 250 }));

    // A jump from song 2 onto song 1's Intro, its song-start section, lands on the bar line at 68,
    // at 0, then Fire again there, and neither fires anything.
    await jump(1, 0);
    await play(4, 0.5);
    await press({ kind: 'fire-again', target: 'eos' });
    expect(await lateness()).toEqual({ last: 250, median: 250, acted: 250, actedMedian: 250 });

    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOff(250, 250)]);
    expect(fires(fake)).toEqual([fire('6')]);
  });

  it("measures the song's cue once, at its song-start section, its Count Off, and no other section of the song, its first section after the Count Off and its End included", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const { fake, read, arm, play, press, lateness } = await lightsRig({ show: SONG_SHOW, position: 60, latenessLog: { path } });
    await read();
    await arm();

    // Half a beat past song 1's End and song 2's Count Off at 64: cue 6, handed 250 ms late, and
    // fired at once. Then half a beat past its Verse 1 at 72.
    await play(4.5, 64.5);
    await vi.waitFor(async () => expect(await lateness()).toEqual({ last: 250, median: 250, acted: 250, actedMedian: 250 }));
    await play(8, 72.5);
    // A quarter beat past its Chorus at 88, its Tag at 104 and its End at 120.
    await play(15.75, 88.25);
    await play(16, 104.25);
    await play(16, 120.25);

    expect(await firesSoFar(fake, press)).toEqual([fire('6')]);
    expect(await lateness()).toEqual({ last: 250, median: 250, acted: 250, actedMedian: 250 });
    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOff(250, 250)]);
  });

  it("never measures Fire again, on the song-start section or any other, which leaves the row's lateness and the log as they were", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const { fake, read, arm, play, press, lateness } = await lightsRig({ show: SONG_SHOW, position: 60, latenessLog: { path } });
    await read();
    await arm();
    await play(4.5, 64.5);
    await vi.waitFor(async () => expect(await lateness()).toEqual({ last: 250, median: 250, acted: 250, actedMedian: 250 }));

    // Fire again in song 2's Count Off, then in its Chorus at 88: cue 6 each time.
    await press({ kind: 'fire-again', target: 'eos' });
    await play(24, 88.5);
    await press({ kind: 'fire-again', target: 'eos' });

    expect(await firesSoFar(fake, press)).toEqual([fire('6'), fire('6'), fire('6')]);
    expect(await lateness()).toEqual({ last: 250, median: 250, acted: 250, actedMedian: 250 });
    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOff(250, 250)]);
  });

  it('measures a cue fired by number just after a Go on the last cue by its own fire event, not as the first cue Wrap would fire for the Go', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    // Song 2's cue is the first cue, so playing into its Count Off fires cue 1 by number.
    const show = SONG_SHOW.map((cue) => (cue.number === '1' ? { ...cue, label: 'Great Are You Lord' } : cue.number === '6' ? { ...cue, label: '' } : cue));
    const { fake, read, arm, play, press, shows, lateness } = await lightsRig({ show, position: 60, latenessLog: { path } });
    await read();
    fake.fireByHand('8');
    await shows(['Live cue 8', ...show.map(({ number, label }) => (label === '' ? `Cue ${number}` : `Cue ${number}: ${label}`))]);
    await arm();

    // The Go on the last cue fires nothing (go-last-cue.json), then, within the window, half a beat
    // past song 2's Count Off at 64: cue 1, handed 250 ms late, and fired at once.
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(fake).at(-1)).toEqual(GO));
    await play(4.5, 64.5);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('1')));

    await vi.waitFor(async () => expect(await lateness()).toEqual({ last: 250, median: 250, acted: 250, actedMedian: 250 }));
    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOff(250, 250)]);
  });

  it('never takes a fire by hand, a follow, Go or Back for the lights firing the cue that waits on its fire event, whose line goes out with null', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    // Song 2's cue, 6, has a follow onto an unlabelled cue 6.1.
    const show: FakeEosCue[] = [...SONG_SHOW.slice(0, 6), { ...SONG_SHOW[6]!, follow: 1000 }, { number: '6.1', label: '' }, ...SONG_SHOW.slice(7)];
    const list = show.map(({ number, label }) => (label === '' ? `Cue ${number}` : `Cue ${number}: ${label}`));
    const { fake, clock, read, arm, play, press, shows, latest, lateness } = await lightsRig({ show, position: 60, latenessLog: { path } });
    await read();
    await arm();
    // Cue 6 is deleted at the console, so the lights' fire of it, half a beat past song 2's Count
    // Off at 64, gets no answer, then recorded again.
    fake.setShow(show.filter((cue) => cue.number !== '6'));
    await play(4.5, 64.5);
    await vi.waitFor(() => expect(fires(fake)).toEqual([fire('6')]));
    fake.setShow(show);

    // The window after the lights' fire has passed: cue 6 fired at the console, which pauses the
    // lights, then the cue its follow fires, then Go and Back.
    clock.advance(OWN_COMMAND_WINDOW_MS + 1);
    fake.fireByHand('6');
    await shows(['Live cue 6: Great Are You Lord', ...list]);
    fake.follow('6.1');
    await shows(['Live cue 6.1', ...list]);
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await shows(['Live cue 7', ...list]);
    await press({ kind: 'run-button', target: 'eos', button: 'back' });
    await shows(['Live cue 6.1', ...list]);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
    expect(await lateness()).toEqual({ last: 250, median: 250, acted: null, actedMedian: null });

    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOff(250, null)]);
  });
});

