import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint, FakeLiveOptions } from '../src/fake-live/fake-live.ts';
import { readLines, summarize } from '../src/lateness/summary.ts';
import { manualClock } from '../src/server/clock.ts';
import { cueBeat, startCues, type Cue } from '../src/server/cues.ts';
import { startPlaybackController, type PlaybackController } from '../src/server/playback-controller.ts';
import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig, type RigOptions } from './harness.ts';

// How late each cue reaches each target: the time the server handed it over, on the rig's manual
// clock, minus the time its beat was due, from the last report of the playhead and Live's tempo. The
// fake Live moves its playhead on its own clock, so a report reaches the server with the server's
// clock where the test left it.

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

// Each line's section and lateness, and its reason only when it has one, so a measured line shows
// it has none.
const briefly = (lines: Record<string, unknown>[]) =>
  lines.map(({ section, lateMs, unmeasured }) => (unmeasured === undefined ? { section, lateMs } : { section, lateMs, unmeasured }));

// At 120 BPM in 4/4 a beat is 500 ms and a bar is 4 beats.
const BEAT_MS = 500;

const SONG: CuePoint[] = [
  { name: '1 - Intro (Way Maker)', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];

// Live reports the playhead as float32, so a position is compared within a hair.
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

const NOT_MEASURED: Connection['lateness'] = { last: null, median: null, acted: null, actedMedian: null };

// A rig whose fake Live starts where `setup` puts it, with the given fake targets armed by the
// producer, once the producer sees the set. Every helper waits for the producer to see the change it
// makes, and a cue reaches the targets before the pages hear of the change that raised it.
async function armedRig(
  setup: Pick<FakeLiveOptions, 'playing' | 'position' | 'tempo' | 'signature'>,
  targets: FakeTarget[] = [fakeTarget({ name: 'propresenter', label: 'ProPresenter' })],
  options: Omit<RigOptions, 'targets'> = {},
) {
  const started = await startRig(SONG, setup, { ...options, targets });
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
  for (const target of targets) {
    const armed = next((snapshot) => snapshot.connections.find((row) => row.name === target.name)?.arm === 'armed');
    producer.send({ kind: 'arm', target: target.name });
    await armed;
  }
  const last = () => producer.received.at(-1)!;

  return {
    // The row's lateness for the target, in the last snapshot the producer received.
    lateness: (name = targets[0]!.name) => last().connections.find((row) => row.name === name)!.lateness,
    next,
    producer,
    // The leader's command, once the producer sees the snapshot it gives.
    async lead(command: unknown, gives: (snapshot: ProducerSnapshot) => boolean) {
      const seen = next(gives);
      leader.send(command);
      return seen;
    },
    async liveHas(address: string, count: number) {
      await vi.waitFor(() => expect(started.received(address)).toHaveLength(count));
    },
    // Plays on for that many beats on the fake Live's own clock, and waits for the playhead where Live
    // then puts it. The server's clock stays where it is.
    async play(beats: number, landsOn: number) {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      started.live.advance(beats * BEAT_MS);
      await seen;
    },
    async moveTo(beats: number) {
      const seen = next((snapshot) => near(snapshot.position, beats));
      started.live.setPosition(beats);
      await seen;
    },
    async setPlaying(playing: boolean) {
      const seen = next((snapshot) => snapshot.playing === playing);
      started.live.setPlaying(playing);
      await seen;
    },
  };
}

describe('the lateness of a cue', () => {
  it('is the time the server handed it over minus the time its beat was due, exactly', async () => {
    const { lateness, play } = await armedRig({ playing: true, position: 8 });
    expect(lateness()).toEqual(NOT_MEASURED);

    // The first report in the Verse is at 16.5, half a beat after its downbeat at 16.
    await play(8.5, 16.5);

    expect(lateness().last).toBe(250);
  });

  it('counts a start from stopped from the start, not from the report of the playhead before it', async () => {
    const { lateness, setPlaying, moveTo } = await armedRig({ playing: false, position: 16 });
    // Live sits on the Verse's downbeat, reported at clock 0, and starts 3 seconds later.
    await rig!.advanceConnected(3000);
    await setPlaying(true);

    expect(lateness().last).toBe(0);

    // Stopped a quarter of a beat past the Chorus's downbeat, Live starts there 2 seconds on: the cue is
    // due a quarter of a beat before the start, whatever the wait since the report.
    await setPlaying(false);
    await moveTo(32);
    await moveTo(32.25);
    await rig!.advanceConnected(2000);
    await setPlaying(true);

    expect(lateness().last).toBe(125);
  });

  it("carries the report on to the beat at Live's tempo, not at 120 BPM", async () => {
    // At 100 BPM a beat is 600 ms.
    const { lateness, next } = await armedRig({ playing: true, position: 8, tempo: 100 });

    // 8.5 beats at 100 BPM take 5100 ms, so the first report in the Verse is at 16.5, half a beat late.
    const seen = next((snapshot) => near(snapshot.position, 16.5));
    rig!.live.advance(5100);
    await seen;

    expect(lateness().last).toBe(300);
  });

  it("measures a song's End against the End", async () => {
    const { lateness, play } = await armedRig({ playing: true, position: 40 });

    await play(8.5, 48.5);

    expect(lateness().last).toBe(250);
  });

  it('measures a loop wrap against the start of the looped section', async () => {
    const { lateness, lead, play } = await armedRig({ playing: true, position: 20 });

    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 1);
    // From 20, 13 beats reach 33, which Live wraps to 17, a beat into the Verse.
    await play(13, 17);

    expect(lateness().last).toBe(500);
  });

  it.each([17, 24])(
    'measures the wrap of a brace set by hand from %s, inside the Verse, against the brace start it wraps to',
    async (start) => {
      const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
      const { lateness, next, play } = await armedRig({ playing: true, position: 36 }, [target]);
      const braced = next((snapshot) => snapshot.loop?.start === start && snapshot.loop.length === 40 - start);
      rig!.live.setLoop({ on: true, start, length: 40 - start });
      await braced;

      // From 36, 4 beats reach the brace end at 40, which Live wraps to the brace start, and the first
      // report is half a beat after it.
      await play(4.5, start + 0.5);

      expect(target.cues.at(-1)).toMatchObject({ name: 'Verse', cause: 'loop' });
      expect(lateness().last).toBe(250);
    },
  );

  it.each([
    { to: 16, late: 0 },
    { to: 17, late: BEAT_MS },
    { to: 20, late: null },
  ])('measures a drag back to $to, before a hand brace from 24 inside the Verse, against the Verse start', async ({ to, late }) => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    const { lateness, moveTo, next } = await armedRig({ playing: true, position: 36 }, [target], { latenessLog: { path } });
    const braced = next((snapshot) => snapshot.loop?.start === 24 && snapshot.loop.length === 16);
    rig!.live.setLoop({ on: true, start: 24, length: 16 });
    await braced;

    // A drag back from the Chorus into the Verse while the brace is on raises a loop cue, but the
    // playhead never reached the brace start, so the beat is the Verse's downbeat at 16: a drag less
    // than half a bar past it reads as late, and one a whole bar past is unmeasured, with its reason.
    await moveTo(to);

    expect(target.cues.at(-1)).toMatchObject({ name: 'Verse', cause: 'loop' });
    expect(lateness().last).toBe(late);
    const logged = late === null ? [{ section: 'Verse', lateMs: null, unmeasured: 'not-played-across' }] : [{ section: 'Verse', lateMs: late }];
    await vi.waitFor(async () => expect(briefly(await linesOf(path))).toEqual(logged));
  });

  it('measures a jump against the start of the section it lands on', async () => {
    const { lateness, lead, liveHas, play } = await armedRig({ playing: true, position: 0 });

    await lead({ kind: 'jump', song: 1, section: 2 }, (snapshot) => snapshot.jump?.section === 2);
    await liveHas('/live/song/cue_point/jump', 1);
    // The bar line is beat 4, so Live lands on the Chorus, 32, and the first report is a beat and a
    // half into it.
    await play(5.5, 33.5);

    expect(lateness().last).toBe(750);
  });
});

describe('the last lateness and the median', () => {
  it('give the latest cue, and the median of the cues so far by nearest rank, the lower middle one on an even count', async () => {
    const { lateness, play } = await armedRig({ playing: true, position: 8 });

    await play(8.5, 16.5);
    await play(15.75, 32.25);
    // 125 and 250: rank ceil(0.5 * 2) = 1 is 125, never the mean of the two.
    expect(lateness()).toEqual({ last: 125, median: 125, acted: null, actedMedian: null });

    await play(16.75, 49);
    expect(lateness()).toEqual({ last: 500, median: 250, acted: null, actedMedian: null });
  });

  it('count the last 50 cues for the median', async () => {
    const { lateness, lead, play } = await armedRig({ playing: true, position: 20 });
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 1);
    let at = 20;
    // Each wrap of the Verse's loop reaches the Verse `beats` past its downbeat at 16, after a report
    // late in the Verse, as Live reports the playhead on its way round. A report further on in the
    // section than the last is only playback, and raises no cue.
    const wrap = async (beats: number) => {
      await play(30 - at, 30);
      await play(2 + beats, 16 + beats);
      at = 16 + beats;
    };

    // The first cue is on time, then 25 are 250 ms late and 24 are 500 ms late, in turn.
    await wrap(0);
    for (let cue = 2; cue <= 50; cue += 1) await wrap(cue % 2 === 0 ? 0.5 : 1);
    expect(lateness()).toEqual({ last: 250, median: 250, acted: null, actedMedian: null });

    // The 51st, 500 ms late, drops the first: 25 at 250 and 25 at 500, and rank 25 is 250.
    await wrap(1);
    expect(lateness()).toEqual({ last: 500, median: 250, acted: null, actedMedian: null });
  });
});

describe('what is not measured', () => {
  it('leaves a disarmed, paused or offline target unmeasured, and Fire again changes no lateness', async () => {
    const targets = ['armed', 'disarmed', 'paused', 'offline'].map((name) => fakeTarget({ name, label: name }));
    const [, disarmed, paused, offline] = targets as [FakeTarget, FakeTarget, FakeTarget, FakeTarget];
    const { lateness, next, producer, play } = await armedRig({ playing: true, position: 8 }, targets);
    const row = (name: string) => (snapshot: ProducerSnapshot) => snapshot.connections.find((connection) => connection.name === name)!;
    let seen = next((snapshot) => row('disarmed')(snapshot).arm === 'disarmed');
    producer.send({ kind: 'disarm', target: disarmed.name });
    await seen;
    seen = next((snapshot) => row('paused')(snapshot).arm === 'paused');
    paused.changeByHand();
    await seen;
    seen = next((snapshot) => row('offline')(snapshot).connection === 'offline');
    offline.goOffline();
    await seen;

    await play(8.5, 16.5);

    expect(lateness('armed').last).toBe(250);
    for (const name of ['disarmed', 'paused', 'offline']) expect(lateness(name), name).toEqual(NOT_MEASURED);

    // Fire again hands the armed target and the disarmed one the Verse again, a beat on.
    await play(1, 17.5);
    for (const name of ['armed', 'disarmed']) producer.send({ kind: 'fire-again', target: name });
    await producer.flush();
    expect(targets.slice(0, 2).map((target) => target.cues.at(-1)?.cause)).toEqual(['fire-again', 'fire-again']);

    expect(lateness('armed')).toEqual({ last: 250, median: 250, acted: null, actedMedian: null });
    expect(lateness('disarmed')).toEqual(NOT_MEASURED);
  });

  it.each([
    { signature: { numerator: 4, denominator: 4 }, bar: 20 },
    { signature: { numerator: 3, denominator: 4 }, bar: 19 },
  ])('leaves a drag to the second bar of a section unmeasured in $signature.numerator/$signature.denominator', async ({ signature, bar }) => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    const { lateness, moveTo, play } = await armedRig({ playing: true, position: 8, signature }, [target]);

    // A drag forward from the Intro to the Verse's second bar, a whole bar past its downbeat at 16.
    await moveTo(bar);
    expect(target.cues.at(-1)).toMatchObject({ name: 'Verse', cause: 'played-into' });
    expect(lateness()).toEqual(NOT_MEASURED);

    // Playing across the Chorus's downbeat at 32, reported half a beat after it, is still measured.
    await play(32.5 - bar, 32.5);
    expect(lateness().last).toBe(250);
  });

  it('leaves a cue the playhead was dragged to mid-section unmeasured', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    const { lateness, moveTo, play } = await armedRig({ playing: true, position: 34 }, [target], { latenessLog: { path } });
    const cue = () => target.cues.at(-1);

    // A drag back from the Chorus to 24, 8 beats into the Verse, raises the Verse, never due at 24.
    await moveTo(24);
    expect(cue()).toMatchObject({ name: 'Verse', cause: 'played-into' });
    expect(lateness()).toEqual(NOT_MEASURED);

    // A drag forward from the Verse to 40, 8 beats into the Chorus.
    await moveTo(40);
    expect(cue()).toMatchObject({ name: 'Chorus', cause: 'played-into' });
    expect(lateness()).toEqual(NOT_MEASURED);

    // A cue the playhead plays across is still measured: back to the Verse, then on into the End.
    await moveTo(44);
    await play(4.5, 48.5);
    expect(lateness().last).toBe(250);
    // The two drags each leave an unmeasured line, and the End its measured one, with no reason.
    const logged = [
      { section: 'Verse', lateMs: null, unmeasured: 'not-played-across' },
      { section: 'Chorus', lateMs: null, unmeasured: 'not-played-across' },
      { section: 'End', lateMs: 250 },
    ];
    await vi.waitFor(async () => expect(briefly(await linesOf(path))).toEqual(logged));
  });

  it('leaves a cue raised ahead of the playhead unmeasured, never negative', () => {
    // The fake Live cannot report a start before the jump it was sent with, so this drives the
    // controller and the cues directly, wired as the server wires them.
    const set: CuePoint[] = [
      { name: '1 - Intro', time: 0 },
      { name: '1 - Verse', time: 16 },
      { name: '1 - End', time: 48 },
      { name: '2 - Intro', time: 64 },
      { name: '2 - Verse', time: 80 },
      { name: '2 - End', time: 92 },
      { name: '3 - Intro', time: 96 },
      { name: '3 - Verse', time: 100 },
      { name: '3 - End', time: 120 },
    ];
    const clock = manualClock();
    const measured: { cue: Cue; late: number | null }[] = [];
    const cues = startCues((cue) => {
      const { set, loop, position } = controller.snapshot();
      const beat = set && cueBeat(set, cue, loop, position);
      const due = beat === null ? null : controller.dueAt(beat);
      measured.push({ cue, late: due === null ? null : clock.now() - due });
    });
    const noop = () => {};
    const controller: PlaybackController = startPlaybackController(
      {
        onChange: (state) => cues.observe(state),
        jump: noop,
        continuePlaying: noop,
        startPlaying: noop,
        stopPlaying: noop,
        loopOn: noop,
        loopOff: noop,
        requestCuePoints: noop,
        fadeOut: noop,
        fadeIn: noop,
        countOff: noop,
      },
      clock,
    );
    const playFromStart = (song: number) => {
      cues.command({ kind: 'play-from-start', song });
      controller.command({ kind: 'play-from-start', song });
    };
    controller.fromLive({ kind: 'connection', connected: true });
    controller.fromLive({ kind: 'cue-points', cuePoints: set });
    controller.fromLive({ kind: 'position', beats: 100 });

    // Stopped on song 3's Verse, Play from start for song 2 and then song 1, before Live reports
    // anything; Live reports the start, then the playhead on song 2's Intro, 35.75 beats before the Verse.
    playFromStart(2);
    playFromStart(1);
    controller.fromLive({ kind: 'playing', playing: true });
    controller.fromLive({ kind: 'position', beats: 64.25 });

    expect(measured.map(({ cue, late }) => `${cue.song}/${cue.name} ${cue.cause} ${late}`)).toContain('3/Verse played-into null');
    expect(measured.filter(({ late }) => late !== null && late < 0)).toEqual([]);
  });

  it('gives a due time for a beat within half a bar of the report, either side, and none further', () => {
    const noop = () => {};
    const controller = startPlaybackController(
      {
        onChange: noop,
        jump: noop,
        continuePlaying: noop,
        startPlaying: noop,
        stopPlaying: noop,
        loopOn: noop,
        loopOff: noop,
        requestCuePoints: noop,
        fadeOut: noop,
        fadeIn: noop,
        countOff: noop,
      },
      manualClock(),
    );
    controller.fromLive({ kind: 'connection', connected: true });
    controller.fromLive({ kind: 'cue-points', cuePoints: SONG });
    controller.fromLive({ kind: 'playing', playing: true });

    controller.fromLive({ kind: 'position', beats: 15.99995 });
    expect(controller.dueAt(16)).not.toBeNull();

    controller.fromLive({ kind: 'position', beats: 15.75 });
    expect([13.75, 14, 16, 17.5, 17.75].map((beat) => controller.dueAt(beat))).toEqual([null, -875, 125, 875, null]);
  });
});

describe('a target that reports acting on a cue', () => {
  it('shows how late it acted, as the last and the median, and only for the cue it was last handed', async () => {
    const slides = fakeTarget({ name: 'slides', label: 'Slides', acknowledges: true });
    const lights = fakeTarget({ name: 'lights', label: 'Lights' });
    const { lateness, next, play } = await armedRig({ playing: true, position: 8 }, [slides, lights]);
    const acted = (name: string, ms: number) => next((snapshot) => snapshot.connections.find((row) => row.name === name)?.lateness.acted === ms);

    await play(8.5, 16.5);
    const verse = slides.cues.at(-1)!;
    await rig!.advanceConnected(120);
    let seen = acted('slides', 370);
    slides.act();
    lights.act();
    await seen;

    expect(lateness('slides')).toEqual({ last: 250, median: 250, acted: 370, actedMedian: 370 });
    expect(lateness('lights')).toEqual({ last: 250, median: 250, acted: null, actedMedian: null });

    // The Chorus, handed 125 ms late: a report of acting on the Verse now changes nothing.
    await play(15.75, 32.25);
    slides.act(verse);
    await rig!.advanceConnected(60);
    seen = acted('slides', 185);
    slides.act();
    await seen;

    // Both medians by nearest rank: 125 of 125 and 250, and 185 of 185 and 370.
    expect(lateness('slides')).toEqual({ last: 125, median: 125, acted: 185, actedMedian: 185 });
  });
});

describe('the lateness log', () => {
  // A line as the log writes it, but for its wall-clock time.
  const line = (target: string, section: string, lateMs: number, actedMs: number | null = null) => ({
    target,
    song: 1,
    title: 'Way Maker',
    section,
    cause: 'played-into',
    lateMs,
    actedMs,
  });
  const withoutTime = (lines: Record<string, unknown>[]) =>
    lines.map((line) => Object.fromEntries(Object.entries(line).filter(([key]) => key !== 'time')));

  it('gets one line per cue for each target handed it, with every field and the exact lateness', async () => {
    const path = join(await newLogDir(), 'logs/cue-lateness.log');
    const targets = [fakeTarget({ name: 'propresenter', label: 'ProPresenter' }), fakeTarget({ name: 'lights', label: 'Lights' })];
    const started = Date.now();
    const { play } = await armedRig({ playing: true, position: 8 }, targets, { latenessLog: { path } });

    await play(8.5, 16.5);
    await play(15.75, 32.25);
    await play(16.25, 48.5);

    const expected = [
      line('propresenter', 'Verse', 250),
      line('lights', 'Verse', 250),
      line('propresenter', 'Chorus', 125),
      line('lights', 'Chorus', 125),
      line('propresenter', 'End', 250),
      line('lights', 'End', 250),
    ];
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual(expected));
    for (const { time } of await linesOf(path)) {
      expect(time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      expect(Date.parse(time as string)).toBeGreaterThanOrEqual(started);
      expect(Date.parse(time as string)).toBeLessThanOrEqual(Date.now());
    }
  });

  it("carries the acted-on lateness for a target that reports it, and null for a cue it never acted on", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const slides = fakeTarget({ name: 'slides', label: 'Slides', acknowledges: true });
    const lights = fakeTarget({ name: 'lights', label: 'Lights' });
    const { play } = await armedRig({ playing: true, position: 8 }, [slides, lights], { latenessLog: { path } });

    await play(8.5, 16.5);
    await rig!.advanceConnected(120);
    slides.act();
    // The slides never act on the Chorus, so its line comes, with null, when the End is handed over.
    await play(15.75, 32.25);
    await play(16.75, 49);
    // Nor on the End, so its line comes when the server closes.
    await rig!.close();
    rig = undefined;

    expect(withoutTime(await linesOf(path))).toEqual([
      line('lights', 'Verse', 250),
      line('slides', 'Verse', 250, 370),
      line('lights', 'Chorus', 125),
      line('slides', 'Chorus', 125),
      line('lights', 'End', 500),
      line('slides', 'End', 500),
    ]);
  });

  it('writes the line of a cue a target never acted on when the target goes offline', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const slides = fakeTarget({ name: 'slides', label: 'Slides', acknowledges: true });
    const { play } = await armedRig({ playing: true, position: 8 }, [slides], { latenessLog: { path } });

    await play(8.5, 16.5);
    expect(await linesOf(path)).toEqual([]);
    slides.goOffline();

    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([line('slides', 'Verse', 250)]));
  });

  it('gets one line per target, with no lateness and the reason, for a cue dragged into mid-section, and a measured line gets no reason', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const targets = [fakeTarget({ name: 'propresenter', label: 'ProPresenter' }), fakeTarget({ name: 'lights', label: 'Lights' })];
    const { moveTo, play } = await armedRig({ playing: true, position: 8 }, targets, { latenessLog: { path } });

    // A drag forward from the Intro to 24, 8 beats into the Verse, which the playhead never played across.
    await moveTo(24);
    const unmeasured = (target: string) => ({ ...line(target, 'Verse', 0), lateMs: null, unmeasured: 'not-played-across' });
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([unmeasured('propresenter'), unmeasured('lights')]));

    // Playing across the Chorus's downbeat at 32, reported half a beat after it, is measured.
    await play(8.5, 32.5);
    const expected = [unmeasured('propresenter'), unmeasured('lights'), line('propresenter', 'Chorus', 250), line('lights', 'Chorus', 250)];
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual(expected));
    for (const measured of (await linesOf(path)).slice(2)) expect(measured).not.toHaveProperty('unmeasured');
  });

  it('gets one line for each Fire again, armed or not, with no lateness and the reason, and the row keeps its lateness', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const targets = [fakeTarget({ name: 'armed', label: 'Armed' }), fakeTarget({ name: 'disarmed', label: 'Disarmed' })];
    const { lateness, next, producer, play } = await armedRig({ playing: true, position: 8 }, targets, { latenessLog: { path } });
    const seen = next((snapshot) => snapshot.connections.find((row) => row.name === 'disarmed')!.arm === 'disarmed');
    producer.send({ kind: 'disarm', target: 'disarmed' });
    await seen;
    await play(8.5, 16.5);
    await vi.waitFor(async () => expect(await linesOf(path)).toHaveLength(1));

    // Fire again twice on the armed target and once on the disarmed one, a beat on in the Verse.
    await play(1, 17.5);
    for (const name of ['armed', 'disarmed', 'armed']) producer.send({ kind: 'fire-again', target: name });
    await producer.flush();

    const fired = (target: string) => ({ ...line(target, 'Verse', 0), cause: 'fire-again', lateMs: null, unmeasured: 'fire-again' });
    const expected = [line('armed', 'Verse', 250), fired('armed'), fired('disarmed'), fired('armed')];
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual(expected));
    expect(lateness('armed')).toEqual({ last: 250, median: 250, acted: null, actedMedian: null });
    expect(lateness('disarmed')).toEqual(NOT_MEASURED);
  });

  it('settles the line of a cue an acknowledging target has not acted on before the line of a Fire again', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const slides = fakeTarget({ name: 'slides', label: 'Slides', acknowledges: true });
    const { producer, play } = await armedRig({ playing: true, position: 8 }, [slides], { latenessLog: { path } });

    await play(8.5, 16.5);
    producer.send({ kind: 'fire-again', target: 'slides' });
    await producer.flush();
    // The slides act after the Fire again, on the cue it handed them, which counts for nothing.
    slides.act();

    const expected = [line('slides', 'Verse', 250), { ...line('slides', 'Verse', 0), cause: 'fire-again', lateMs: null, unmeasured: 'fire-again' }];
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual(expected));
    expect((await linesOf(path))[0]).toHaveProperty('actedMs', null);
  });

  it('moves the file to .1 before a line would take it past its size, and starts a new file with that line', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    // Each line is about 150 bytes, so two fit and a third does not.
    const { play } = await armedRig({ playing: true, position: 8 }, undefined, { latenessLog: { path, maxBytes: 400 } });

    await play(8.5, 16.5);
    await play(15.75, 32.25);
    await vi.waitFor(async () => expect(await linesOf(path)).toHaveLength(2));
    await play(16.25, 48.5);

    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([line('propresenter', 'End', 250)]));
    expect(withoutTime(await linesOf(`${path}.1`))).toEqual([line('propresenter', 'Verse', 250), line('propresenter', 'Chorus', 125)]);
    expect((await readFile(`${path}.1`, 'utf8')).endsWith('\n')).toBe(true);
  });

  it('gives the row the median `pnpm lateness` prints for the same cues, on an even count', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const { lateness, play } = await armedRig({ playing: true, position: 8 }, undefined, { latenessLog: { path } });

    // The Verse 250 ms late, then the Chorus 125 ms late.
    await play(8.5, 16.5);
    await play(15.75, 32.25);
    await vi.waitFor(async () => expect(await linesOf(path)).toHaveLength(2));

    const days = summarize(readLines([await readFile(path, 'utf8')]).lines, { timeZone: 'UTC' });
    const all = days[0]!.targets.find(({ target }) => target === 'propresenter')!.rows.find(({ cause }) => cause === 'all')!;
    expect(all.count).toBe(2);
    expect(all.late.median).toBe(125);
    // The page shows the row's median in whole milliseconds.
    expect(Math.round(lateness().median!)).toBe(all.late.median);
  });
});
