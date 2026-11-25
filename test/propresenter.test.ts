import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { LOOP_REPORT_MS, METER_SETTLE_MS } from '../src/server/playback-controller.ts';
import { picksStore } from '../src/server/propresenter-picks.ts';
import { proPresenterKind } from '../src/server/propresenter.ts';
import type { Connection, PreServiceCheck, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { CheckResult } from '../web/src/PreServiceCheck.tsx';
import { startFakeProPresenter, writeProPresenterConfig, type FakeProPresenter } from './fake-propresenter.ts';
import { fakeKind, fakeTarget } from './fake-target.ts';
import { loaded, startRig, type LiveSetup, type Rig } from './harness.ts';

// The ProPresenter target, through the real server against the fake Live and the fake ProPresenter
// (fake-propresenter.ts), configured through a connections config file the test writes. A test
// checks only the requests the fake ProPresenter received and what the producer's row shows.

let rig: Rig | undefined;
let pro: FakeProPresenter | undefined;
// The folder a test's connections config and picks file go in, inside the worktree's dist, never the
// OS temp folder or ~/Library.
let folder: string | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  await pro?.close();
  pro = undefined;
  vi.restoreAllMocks();
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
});

const REPO_ROOT = resolve(import.meta.dirname, '..');
// The fake kind's section good, and ProPresenter's with no host and a port of 70000.
const BAD_SECTION = resolve(import.meta.dirname, 'fixtures/connections/propresenter-bad-section.json');
// The fake kind's section good, and ProPresenter's with a good host and a leadBeats of -1.
const BAD_LEAD_BEATS = resolve(import.meta.dirname, 'fixtures/connections/propresenter-bad-lead-beats.json');
const POLL_MS = 2000;
// The wait before a presentation read that answered 5xx is asked again: a real timer, kept short.
const READ_RETRY_MS = 20;

// A new, empty folder for the test's files, removed after the test.
async function newFolder(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  folder = await mkdtemp(join(REPO_ROOT, 'dist/propresenter-'));
  return folder;
}

// One song in 4/4 at 120 BPM: There Is Freedom, as the October 25 playlist has it, with a section
// named in other letter case than its group, and one with no group of its name.
const SET: CuePoint[] = [
  { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
  { name: '1 - pre chorus', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - Outro', time: 48 },
  { name: '1 - End', time: 64 },
];

const proRow = (snapshot: ProducerSnapshot): Connection | undefined => snapshot.connections.find((row) => row.name === 'propresenter');

// A rig with ProPresenter from a written connections config naming the fake ProPresenter, which is
// started first unless the test gives one, and the producer connected, once the producer sees the
// set. The ProPresenter polls on its own manual clock, which only the test moves. Given a lateness
// log, the server writes it there. Its section sets leadBeats to 0, so every slide goes on its beat,
// unless the test gives a lead, or 'default' to leave leadBeats out of the file. Given a slide timing
// path, ProPresenter reads its slide timing file there; with none, it has no exceptions.
async function proRig({
  cuePoints = SET,
  setup = { playing: false, position: 8 },
  statePath,
  latenessLog,
  leadBeats = 0,
  slideTiming,
}: { cuePoints?: CuePoint[]; setup?: LiveSetup; statePath?: string; latenessLog?: { path: string }; leadBeats?: number | 'default'; slideTiming?: string } = {}) {
  const dir = folder ?? (await newFolder());
  pro ??= await startFakeProPresenter();
  const clock = manualClock();
  const config = await writeProPresenterConfig(dir, pro.port, leadBeats === 'default' ? {} : { leadBeats });
  const kind = proPresenterKind({ statePath: statePath ?? join(dir, 'propresenter-picks.json'), clock, pollMs: POLL_MS, requestTimeoutMs: 1000, readRetryMs: READ_RETRY_MS, slideTimingPath: slideTiming });
  rig = await startRig(cuePoints, setup, { connectionsConfig: config, targetKinds: { propresenter: kind }, latenessLog });
  const producer = await rig.connectProducer();
  await producer.snapshot(loaded);
  // Resolves with the first snapshot the producer receives from now on that matches.
  const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
  };
  return {
    producer,
    clock,
    next,
    // ProPresenter's row in the first snapshot, received or still to come, where it matches.
    row: async (matches: (row: Connection) => boolean) => proRow(await producer.snapshot((snapshot) => !!proRow(snapshot) && matches(proRow(snapshot)!)))!,
    // ProPresenter's row as the producer last received it, once the server has handled every command
    // the producer sent.
    async latest() {
      await producer.flush();
      return proRow(producer.received.at(-1)!)!;
    },
  };
}

describe("ProPresenter's section", () => {
  it('takes a host and a port, and a bad one disables ProPresenter alone', async () => {
    const target = fakeTarget({ name: 'fake', label: 'Fake' });
    const kind = proPresenterKind({ statePath: join(await newFolder(), 'propresenter-picks.json'), clock: manualClock() });
    rig = await startRig(SET, { playing: false, position: 0 }, { connectionsConfig: BAD_SECTION, targetKinds: { fake: fakeKind(target), propresenter: kind } });
    const producer = await rig.connectProducer();

    const snapshot = await producer.snapshot((snapshot) => loaded(snapshot) && snapshot.connections[0]?.connection === 'online');

    expect(snapshot.connections).toMatchObject([
      { name: 'fake', configured: true, connection: 'online' },
      {
        name: 'propresenter',
        label: 'ProPresenter',
        configured: false,
        problems: ['ProPresenter\'s "host" must be its address, such as "192.168.10.50".', 'ProPresenter\'s "port" must be its network port, a whole number from 1 to 65535 such as 50001.'],
      },
    ]);
  });

  it('takes a leadBeats of 0 or more, and a negative one disables ProPresenter alone, with the reason on its row', async () => {
    const target = fakeTarget({ name: 'fake', label: 'Fake' });
    const kind = proPresenterKind({ statePath: join(await newFolder(), 'propresenter-picks.json'), clock: manualClock() });
    rig = await startRig(SET, { playing: false, position: 0 }, { connectionsConfig: BAD_LEAD_BEATS, targetKinds: { fake: fakeKind(target), propresenter: kind } });
    const producer = await rig.connectProducer();

    const snapshot = await producer.snapshot((snapshot) => loaded(snapshot) && snapshot.connections[0]?.connection === 'online');

    expect(snapshot.connections).toMatchObject([
      { name: 'fake', configured: true, connection: 'online' },
      {
        name: 'propresenter',
        label: 'ProPresenter',
        configured: false,
        problems: ['ProPresenter\'s "leadBeats" must be how many beats early each lyric slide goes up, a number of 0 or more such as 2.'],
      },
    ]);
  });

  it('opts in to the Fade out pause', async () => {
    const { producer, row } = await proRig({ setup: { playing: true, position: 8 } });
    await row((row) => row.connection === 'online');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');
    const leader = await rig!.connectLeader();
    await leader.snapshot(loaded);

    leader.send({ kind: 'fade-out' });

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'fade-out' });
  });
});

describe('online and offline', () => {
  it('shows offline while /version does not answer, and online again when it does', async () => {
    pro = await startFakeProPresenter();
    await pro.stop();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { clock, row } = await proRig();

    const offline = await row((row) => row.connection === 'offline' && row.problems.length > 0);
    expect(offline.problems).toEqual([expect.stringMatching(/^ProPresenter could not be reached at 127\.0\.0\.1:\d+: .+\.$/)]);

    await pro.start();
    clock.advance(POLL_MS);
    expect(await row((row) => row.connection === 'online')).toMatchObject({ connection: 'online', problems: [] });

    await pro.stop();
    clock.advance(POLL_MS);
    await row((row) => row.connection === 'offline');
  });

  it('shows offline when a request gets no answer within the timeout, and online again when ProPresenter answers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The first /version is held, and the rig's request timeout is 1 s.
    pro = await startFakeProPresenter();
    pro.hang();
    const { clock, row } = await proRig();

    const offline = await row((row) => row.connection === 'offline' && row.problems.length > 0);
    expect(offline.problems).toEqual([`ProPresenter could not be reached at 127.0.0.1:${pro!.port}: no answer within 1 s.`]);

    pro!.answer();
    clock.advance(POLL_MS);
    expect(await row((row) => row.connection === 'online' && row.problems.length === 0)).toMatchObject({ connection: 'online', problems: [] });
  });

  it('asks /version once a poll, never two at once', async () => {
    // /version is asked while no stream is open, so the stream gets a 404 each time.
    pro = await startFakeProPresenter();
    pro.answerStreams(404, 404, 404);
    const { clock, row } = await proRig();
    await row((row) => row.connection === 'online');
    await pro.idle();
    const versions = () => pro!.requests.filter(({ path }) => path === '/version').length;
    const before = versions();

    clock.advance(POLL_MS);
    await vi.waitFor(() => expect(versions()).toBe(before + 1));
    await pro.idle();
    clock.advance(POLL_MS);
    await vi.waitFor(() => expect(versions()).toBe(before + 2));
  });
});

// A slide change that came due while ProPresenter was offline: the slide for the playhead once, as Fire
// again sends it, when ProPresenter comes back armed with Live still in the section it missed.
describe('a slide change that came due while offline', () => {
  async function armedThenOffline(position: number, cuePoints?: CuePoint[]) {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = await armedRig({ position, playlist: OCTOBER_25.id, cuePoints });
    await pro!.streaming();
    return {
      ...started,
      async offline() {
        const offline = started.next((snapshot) => proRow(snapshot)?.connection === 'offline');
        pro!.dropStreams();
        await offline;
      },
      async online() {
        const online = started.next((snapshot) => proRow(snapshot)?.connection === 'online');
        started.clock.advance(POLL_MS);
        await online;
        await pro!.streaming();
      },
    };
  }

  it("sends the slide for the playhead once when ProPresenter comes back armed inside the section whose change it missed", async () => {
    const { offline, online, play, triggers } = await armedThenOffline(24);
    await offline();
    // The Chorus's slides change at 32, 36, 40 and 44, so the playhead at 37 is on its second.
    await play(8, 32);
    await play(5, 37);

    await online();

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 7)]);
  });

  it('sends nothing when Live has left the song for the gap before the next before ProPresenter comes back', async () => {
    const gap: CuePoint[] = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - pre chorus', time: 16 },
      { name: '1 - Chorus', time: 32 },
      { name: '1 - End', time: 48 },
      { name: '2 - Chorus (House of the Lord)', time: 56 },
      { name: '2 - End', time: 72 },
    ];
    const { offline, online, play, triggers } = await armedThenOffline(40, gap);
    await offline();
    await play(10, 50);

    await online();

    expect(await triggers()).toEqual([]);
  });

  it('sends nothing when a slide pressed by hand paused ProPresenter before the change came due', async () => {
    const { clock, row, offline, online, play, triggers } = await armedThenOffline(24);
    clock.advance(PAST_WINDOW_MS);
    await pro!.send(PRESSED_VERSE_3);
    await row((row) => row.arm === 'paused');
    await offline();
    await play(8, 32);

    await online();

    expect(await triggers()).toEqual([]);
  });

  it('sends nothing when ProPresenter comes back with no change missed', async () => {
    const { offline, online, triggers } = await armedThenOffline(24);
    await offline();

    await online();

    expect(await triggers()).toEqual([]);
  });

  it('sends nothing when Live played on inside the slide it showed while ProPresenter was offline', async () => {
    const { offline, online, play, triggers } = await armedThenOffline(33);
    await offline();
    // The Chorus's slide changes at 32 and 36, so 33 to 35 crosses none.
    await play(2, 35);

    await online();

    expect(await triggers()).toEqual([]);
  });

  it('sends nothing when the playhead is dragged back inside the slide it showed while ProPresenter was offline', async () => {
    const { next, offline, online, triggers } = await armedThenOffline(39);
    await offline();
    // The Chorus's second slide runs from 36 to 40.
    const moved = next((snapshot) => near(snapshot.position, 37));
    rig!.live.setPosition(37);
    await moved;

    await online();

    expect(await triggers()).toEqual([]);
  });

  it('sends the slide for the playhead once when it is dragged back across a slide change while ProPresenter was offline', async () => {
    const { next, offline, online, triggers } = await armedThenOffline(37);
    await offline();
    // From the Chorus's second slide, at 36, back to its first, at 32.
    const moved = next((snapshot) => near(snapshot.position, 33));
    rig!.live.setPosition(33);
    await moved;

    await online();

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
  });

  it('sends the slide for the playhead once when the change whose trigger got no answer within the timeout is what puts ProPresenter offline', async () => {
    const { next, online, play, triggers } = await armedThenOffline(24);
    // The Chorus's trigger, at 32, is held past the rig's 1 s request timeout, while the row still
    // shows ProPresenter online.
    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    pro!.hang();
    await play(8, 32);
    await offline;
    pro!.answer();

    await online();

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6), trigger(THERE_IS_FREEDOM, 6)]);
  });

  it('sends the slide for the playhead once when the change whose trigger is refused a connection is what puts ProPresenter offline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // No stream ever opens, so ProPresenter is online with none, and only the trigger finds it gone.
    pro = await startFakeProPresenter();
    pro.answerStreams(...Array<number>(20).fill(404));
    const { next, clock, play, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro.stop();
    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    await play(8, 32);
    await offline;
    await pro.start();

    const online = next((snapshot) => proRow(snapshot)?.connection === 'online');
    clock.advance(POLL_MS);
    await online;

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
  });

  it('sends nothing when ProPresenter comes back armed in a later section than the change it missed', async () => {
    const { producer, row, offline, online, play, triggers } = await armedThenOffline(8);
    await offline();
    // Into the pre chorus, at 16, whose change is missed.
    await play(8, 16);
    producer.send({ kind: 'disarm', target: 'propresenter' });
    await row((row) => row.arm === 'disarmed');
    // Into the Chorus, at 32, while disarmed, so its change is not missed.
    await play(17, 33);
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');

    await online();

    expect(await triggers()).toEqual([]);
  });
});

// The status stream: the slide text on the row, the stream's drop putting ProPresenter offline until
// it reconnects, and its silence asking /version and opening it again while ProPresenter answers.
// Times are the chunks' in the recording, stream-status-updates.json.
const STREAM = '/v1/status/updates';
const streamRequests = () => pro!.requests.filter(({ method, path }) => method === 'POST' && path === STREAM);
// The Chorus of There Is Freedom, a slide pressed by hand.
const CHORUS = 251835;
const CHORUS_TEXT = [
  'Current slide: There Is Freedom / Chorus / slide 1 line 1 / There Is Freedom / Chorus / slide 1 line 2',
  'Next slide: There Is Freedom / Chorus / slide 2 line 1 / There Is Freedom / Chorus / slide 2 line 2 / There Is Freedom / Chorus / slide 2 line 3',
];
// A Verse 3 slide pressed by hand.
const VERSE_3 = 448784;
const VERSE_3_TEXT = [
  'Current slide: There Is Freedom / Verse 3 / slide 1 line 1 / There Is Freedom / Verse 3 / slide 1 line 2',
  'Next slide: There Is Freedom / Verse 1 / slide 2 line 1 / There Is Freedom / Verse 1 / slide 2 line 2',
];
const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((line, index) => line === b[index]);
// The row's line while the status stream is quiet, after the slide text.
const QUIET_LINE = 'slide text not live, status stream quiet';
// A status/slide frame of a made-up slide and its next.
const slideFrame = (current: string, next: string) => ({ url: 'status/slide', data: { current: { text: current }, next: { text: next } } });

// A rig with ProPresenter online and its status stream open.
async function streamRig() {
  const started = await proRig();
  await started.row((row) => row.connection === 'online');
  await pro!.streaming();
  return started;
}

describe('the status stream', () => {
  it('opens once ProPresenter is online, asking for the slide and the current presentation alone', async () => {
    await streamRig();

    expect(streamRequests()).toEqual([{ method: 'POST', path: STREAM, body: ['status/slide', 'presentation/current'] }]);
  });

  it('shows the current and the next slide text on the row at each slide change', async () => {
    const { row, latest } = await streamRig();
    expect((await latest()).state).toEqual([]);

    await pro!.send(CHORUS);
    expect((await row((row) => row.state.length > 0)).state).toEqual(CHORUS_TEXT);

    await pro!.send(VERSE_3);
    expect((await row((row) => sameLines(row.state, VERSE_3_TEXT))).state).toEqual(VERSE_3_TEXT);
  });

  it('shows no slide text after a clear, whether the slide or the current presentation reports it', async () => {
    const { row, next } = await streamRig();
    const cleared = () => next((snapshot) => proRow(snapshot)?.state.length === 0);
    await pro!.send(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    // The recorded clear's status/slide, with no current slide and no next.
    let clear = cleared();
    await pro!.send(158330);
    await clear;

    const shown = next((snapshot) => sameLines(proRow(snapshot)?.state ?? [], CHORUS_TEXT));
    await pro!.send(CHORUS);
    await shown;
    // The same clear's presentation/current, with no presentation, alone: some clears brought no
    // status/slide.
    clear = cleared();
    await pro!.send(158238);
    expect(proRow(await clear)).toMatchObject({ connection: 'online', state: [] });
  });

  it('shows offline when the stream drops, and reconnects on the next poll and shows the slide text again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { row, next, clock } = await streamRig();
    await pro!.send(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    pro!.dropStreams();
    expect(proRow(await offline)).toMatchObject({
      connection: 'offline',
      problems: [`ProPresenter could not be reached at 127.0.0.1:${pro!.port}: the status stream dropped.`],
      state: [],
    });

    const online = next((snapshot) => proRow(snapshot)?.connection === 'online');
    clock.advance(POLL_MS);
    expect(proRow(await online)).toMatchObject({ connection: 'online', problems: [], state: [] });
    await pro!.streaming();
    expect(streamRequests()).toHaveLength(2);

    await pro!.send(VERSE_3);
    expect((await row((row) => sameLines(row.state, VERSE_3_TEXT))).state).toEqual(VERSE_3_TEXT);
  });

  it('shows offline when the stream request gets no answer within the timeout, and reconnects once ProPresenter answers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // /version answers, and the stream request is held; the rig's request timeout is 1 s.
    pro = await startFakeProPresenter();
    pro.hangStreams();
    const { row, next, clock } = await proRig();

    const offline = await row((row) => row.connection === 'offline' && row.problems.length > 0);
    expect(offline).toMatchObject({ problems: [`ProPresenter could not be reached at 127.0.0.1:${pro!.port}: no answer within 1 s.`], state: [] });
    expect(streamRequests()).toHaveLength(1);

    pro!.answer();
    const online = next((snapshot) => proRow(snapshot)?.connection === 'online');
    clock.advance(POLL_MS);
    expect(proRow(await online)).toMatchObject({ connection: 'online', problems: [] });
    await pro!.streaming();
    expect(streamRequests()).toHaveLength(2);
  });

  it('holds an answered stream open past the request timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { row, latest } = await streamRig();

    // The rig's request timeout is 1 s, on a real timer, so the wait is real time too.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(await latest()).toMatchObject({ connection: 'online', problems: [] });
    await pro!.send(CHORUS);
    expect(await row((row) => sameLines(row.state, CHORUS_TEXT))).toMatchObject({ connection: 'online', problems: [], state: CHORUS_TEXT });
  });

  it('stays online when the stream sends nothing for 10 s while /version answers, asks /version once and opens the stream again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { producer, clock, latest } = await streamRig();
    const versions = () => pro!.requests.filter(({ path }) => path === '/version').length;
    const start = producer.received.length;

    // ProPresenter's heartbeat counts as a frame, so 16 s with one every 8 s asks nothing.
    await pro!.heartbeat();
    clock.advance(8000);
    await pro!.heartbeat();
    clock.advance(8000);
    await pro!.idle();
    const before = versions();
    expect(streamRequests()).toHaveLength(1);

    clock.advance(10_000);

    await vi.waitFor(() => expect(streamRequests()).toHaveLength(2));
    await pro!.streaming();
    expect(versions()).toBe(before + 1);
    expect(await latest()).toMatchObject({ connection: 'online', problems: [] });
    expect(producer.received.slice(start).map((snapshot) => proRow(snapshot)?.connection)).not.toContain('offline');
  });

  // Each reopen counts its wait from the reopened stream's open, so the clock moves from there.
  const reopenAfter = async (clock: { advance(ms: number): void }, ms: number, streams: number) => {
    clock.advance(ms - 1);
    await pro!.idle();
    expect(streamRequests()).toHaveLength(streams - 1);
    clock.advance(1);
    await vi.waitFor(() => expect(streamRequests()).toHaveLength(streams));
    await pro!.streaming();
  };

  it('opens a quiet stream again after 10 s, then 20 s, 40 s, 60 s and 60 s of silence, and after 10 s again once a heartbeat comes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { clock, latest } = await streamRig();
    pro!.loseHeartbeat();

    await reopenAfter(clock, 10_000, 2);
    await reopenAfter(clock, 20_000, 3);
    await reopenAfter(clock, 40_000, 4);
    await reopenAfter(clock, 60_000, 5);
    await reopenAfter(clock, 60_000, 6);
    await pro!.heartbeat();
    await reopenAfter(clock, 10_000, 7);

    expect(await latest()).toMatchObject({ connection: 'online', problems: [] });
  });

  it('keeps the slide text while the stream is quiet and says it is not live, until a heartbeat comes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { clock, row } = await streamRig();
    pro!.loseHeartbeat();
    await pro!.send(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    clock.advance(10_000);
    const quiet = await row((row) => row.state.length === CHORUS_TEXT.length + 1);
    expect(quiet).toMatchObject({ connection: 'online', problems: [], state: [...CHORUS_TEXT, QUIET_LINE] });

    await pro!.streaming();
    await pro!.heartbeat();
    expect(await row((row) => sameLines(row.state, CHORUS_TEXT))).toMatchObject({ connection: 'online', state: CHORUS_TEXT });
  });

  it('logs one line when the stream goes quiet and one when its heartbeat comes back, with none for each reopen', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { clock, latest } = await streamRig();
    pro!.loseHeartbeat();
    const where = `127.0.0.1:${pro!.port}`;

    await reopenAfter(clock, 10_000, 2);
    await reopenAfter(clock, 20_000, 3);
    await reopenAfter(clock, 40_000, 4);
    await pro!.heartbeat();
    await latest();

    expect(errors.mock.calls.map(([line]) => line)).toEqual([
      `Setlist server: ProPresenter's status stream at ${where} sent nothing for 10 s while its API still answers: ProPresenter stays online, its slide text is not live, and the server reopens the stream until its heartbeat comes back.`,
      `Setlist server: ProPresenter's status stream at ${where} sends its heartbeat again.`,
    ]);
  });

  it("sends a cue's trigger while the stream is quiet", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { clock, play, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    await pro!.streaming();
    pro!.loseHeartbeat();
    await reopenAfter(clock, 10_000, 2);

    await play(8, 16);

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);
  });

  it('shows offline when /version gets no answer within the timeout once the stream has sent nothing for 10 s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { next, clock } = await streamRig();
    pro!.hang();

    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    clock.advance(10_000);

    expect(proRow(await offline)).toMatchObject({ connection: 'offline', problems: [`ProPresenter could not be reached at 127.0.0.1:${pro!.port}: no answer within 1 s.`], state: [] });
    pro!.answer();
  });

  it('asks /version no more while the stream is open', async () => {
    const { clock } = await streamRig();
    const versions = () => pro!.requests.filter(({ path }) => path === '/version').length;
    const before = versions();

    clock.advance(POLL_MS * 3);
    await pro!.idle();

    expect(versions()).toBe(before);
  });

  it('stays online with no stream when the stream gets an HTTP answer, and asks for it again on the next poll', async () => {
    pro = await startFakeProPresenter();
    pro.answerStreams(404);
    const { row, clock, latest } = await proRig();
    await row((row) => row.connection === 'online');
    await pro.idle();
    expect(streamRequests()).toHaveLength(1);
    expect(await latest()).toMatchObject({ connection: 'online', problems: [] });

    clock.advance(POLL_MS);
    await pro.streaming();

    expect(streamRequests()).toHaveLength(2);
    expect(await latest()).toMatchObject({ connection: 'online', problems: [] });
  });

  it('shows a frame split over two writes once it is whole', async () => {
    const { row, latest } = await streamRig();
    const frame = JSON.stringify(slideFrame('Split slide', 'After it'));

    await pro!.sendRaw(frame.slice(0, 30));
    expect((await latest()).state).toEqual([]);
    await pro!.sendRaw(`${frame.slice(30)}\r\n\r\n`);

    expect((await row((row) => row.state.length > 0)).state).toEqual(['Current slide: Split slide', 'Next slide: After it']);
  });

  it('shows both frames of one write, in order', async () => {
    const { producer, row } = await streamRig();
    const start = producer.received.length;
    const first = ['Current slide: First slide', 'Next slide: Second slide'];
    const second = ['Current slide: Second slide', 'Next slide: Third slide'];

    await pro!.sendRaw(`${JSON.stringify(slideFrame('First slide', 'Second slide'))}\r\n\r\n${JSON.stringify(slideFrame('Second slide', 'Third slide'))}\r\n\r\n`);

    await row((row) => sameLines(row.state, second));
    const shown = producer.received.slice(start).map((snapshot) => proRow(snapshot)?.state ?? []);
    const firstAt = shown.findIndex((state) => sameLines(state, first));
    expect(firstAt).toBeGreaterThanOrEqual(0);
    expect(shown.findIndex((state) => sameLines(state, second))).toBeGreaterThan(firstAt);
  });

  it('skips a frame that is not JSON, and stays online and shows the next one', async () => {
    const { producer, row } = await streamRig();
    const start = producer.received.length;

    await pro!.sendRaw('{not json\r\n\r\n');
    await pro!.send(CHORUS);

    expect(await row((row) => sameLines(row.state, CHORUS_TEXT))).toMatchObject({ connection: 'online', problems: [] });
    expect(producer.received.slice(start).map((snapshot) => proRow(snapshot)?.connection)).not.toContain('offline');
  });

  it('shows a slide with no words as (no words), and the next slide without its invisible characters', async () => {
    const { row } = await streamRig();

    // The empty slide before the first Bridge 1.
    await pro!.send(291205);

    expect((await row((row) => row.state.length > 0)).state).toEqual([
      'Current slide: (no words)',
      'Next slide: There Is Freedom / Bridge 1 / slide 1 line 1 / There Is Freedom / Bridge 1 / slide 1 line 2',
    ]);
  });
});

// The live slide on each open of the stream. A stream opened over a slide with words sends it at once,
// as the home ProPresenter's did on 2026-11-10, and the adapter also reads GET /v1/status/slide once on
// each open, which answers 204 when no slide with words shows, and shows its text as a frame would. The
// read's text shows only when no frame came before its answer, so the tests of what it shows open the
// stream with its opening status/slide late (lateOpeningSlide()).
const LIVE_SLIDE = '/v1/status/slide';
const slideReads = () => pro!.requests.filter(({ method, path }) => method === 'GET' && path === LIVE_SLIDE);

describe('the live slide read', () => {
  it("shows the live slide's text as soon as the stream opens, when its opening frame is late", async () => {
    pro = await startFakeProPresenter();
    pro.lateOpeningSlide();
    pro.showSlide(CHORUS);
    const { row } = await streamRig();

    expect((await row((row) => row.state.length > 0)).state).toEqual(CHORUS_TEXT);
    expect(slideReads()).toHaveLength(1);
    const paths = pro.requests.map(({ path }) => path);
    expect(paths.indexOf(LIVE_SLIDE)).toBeGreaterThan(paths.indexOf(STREAM));
  });

  it("after a reconnect, shows the live slide's text as soon as the stream opens, when its opening frame is late", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { row, next, clock } = await streamRig();
    await pro!.send(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    pro!.dropStreams();
    expect(proRow(await offline)).toMatchObject({ connection: 'offline', state: [] });

    // The operator moved on while the stream was down.
    pro!.showSlide(VERSE_3);
    pro!.lateOpeningSlide();
    const online = next((snapshot) => proRow(snapshot)?.connection === 'online');
    clock.advance(POLL_MS);
    await online;
    await pro!.streaming();

    expect(await row((row) => sameLines(row.state, VERSE_3_TEXT))).toMatchObject({ connection: 'online', state: VERSE_3_TEXT });
    expect(streamRequests()).toHaveLength(2);
    expect(slideReads()).toHaveLength(2);
  });

  it('shows no slide text when the read finds none showing', async () => {
    const { latest } = await streamRig();
    await pro!.idle();

    expect(slideReads()).toHaveLength(1);
    expect(await latest()).toMatchObject({ connection: 'online', state: [] });
  });

  it("keeps a slide frame that comes before the read's answer over the read", async () => {
    pro = await startFakeProPresenter();
    pro.hangSlideReads();
    pro.showSlide(CHORUS);
    const { row, latest } = await streamRig();
    await pro.send(VERSE_3);
    await row((row) => sameLines(row.state, VERSE_3_TEXT));

    // The held read answers with the Chorus, live when it came.
    pro.answer();
    await pro.idle();

    expect(slideReads()).toHaveLength(1);
    expect(await latest()).toMatchObject({ connection: 'online', state: VERSE_3_TEXT });
  });

  // The recorded clear's status/slide, with no current slide and no next, and its presentation/current,
  // with no presentation, which some clears brought alone.
  it.each([
    ['status/slide', 158330],
    ['presentation/current', 158238],
  ])("keeps a clear the stream reports as a %s before the read's answer over the read", async (_, clear) => {
    pro = await startFakeProPresenter();
    pro.hangSlideReads();
    pro.showSlide(CHORUS);
    const { latest } = await streamRig();

    await pro.send(clear);
    pro.answer();
    await pro.idle();

    expect(slideReads()).toHaveLength(1);
    expect(await latest()).toMatchObject({ connection: 'online', state: [] });
  });

  it("keeps a Clear slide press made before the read's answer over the read", async () => {
    pro = await startFakeProPresenter();
    pro.hangSlideReads();
    pro.showSlide(CHORUS);
    const { producer, row, next, latest } = await streamRig();
    // No presentation is active in the fake, so next has nothing to move, and its line shows when the
    // clear's answer has come: the clear drops it.
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'next' });
    await row((row) => row.state.includes(NOTHING_TO_MOVE.next));
    const cleared = next((snapshot) => proRow(snapshot)?.state.length === 0);
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'clear' });
    await cleared;

    pro.answer();
    await pro.idle();

    expect(slideReads()).toHaveLength(1);
    expect(await latest()).toMatchObject({ connection: 'online', state: [] });
  });
});

// A reconnect while ProPresenter is armed. The stream opens over a slide with words with that slide's
// status/slide, as the home ProPresenter's did on 2026-11-10, and over none or a slide with no words
// with no status/slide (setlist-controller#269).
describe('a reconnect while armed', () => {
  // Armed, There Is Freedom's Chorus slide 1, index 6, triggered and past the window, then the slide
  // shown, the stream dropped and opened again.
  async function reconnectArmedShowing(shown: number) {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    const { play, next, clock, triggers } = started;
    await pro!.streaming();
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
    clock.advance(PAST_WINDOW_MS);
    pro!.showSlide(shown);

    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    pro!.dropStreams();
    await offline;
    const online = next((snapshot) => proRow(snapshot)?.connection === 'online');
    clock.advance(POLL_MS);
    await online;
    await pro!.streaming();
    return started;
  }

  // The expected slide survives going offline, so a slide changed by hand while the stream was down
  // shows on the opening frame as a change by hand.
  it('pauses an armed ProPresenter on the opening frame of a reconnect over a slide that changed while it was offline', async () => {
    const { row } = await reconnectArmedShowing(VERSE_3);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ connection: 'online', arm: 'paused', pause: 'by-hand', state: VERSE_3_TEXT });
  });

  it('pauses an armed ProPresenter on a press by hand just after the opening frame of a reconnect, since the opening frame opens no window', async () => {
    const { row } = await reconnectArmedShowing(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    await pro!.send(PRESSED_VERSE_3);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("keeps an armed ProPresenter armed on a cold Next slide's frame past the window, after a reconnect over a slide with words", async () => {
    const { producer, clock, row, latest } = await reconnectArmedShowing(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    await press(producer, 'next');
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 7);

    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null, state: [expect.stringContaining('Chorus / slide 2'), expect.any(String)] });
  });

  // Armed, There Is Freedom's Turnaround, index 10, a slide with no words, triggered, then the stream
  // dropped and opened again over it, with no status/slide.
  const TURNAROUND_CUE_POINTS: CuePoint[] = [
    { name: '1 - Chorus (There Is Freedom)', time: 0 },
    { name: '1 - Turnaround', time: 16 },
    { name: '1 - End', time: 32 },
  ];
  async function reconnectArmedOnTurnaround() {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: TURNAROUND_CUE_POINTS });
    const { play, next, clock, triggers } = started;
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 10)]);

    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    pro!.dropStreams();
    await offline;
    const online = next((snapshot) => proRow(snapshot)?.connection === 'online');
    clock.advance(POLL_MS);
    await online;
    await pro!.streaming();
    return started;
  }

  // Before any frame the adapter knows no slide showing, so a press moves from the last slide shown.
  it.each([
    ['next', 11, 'Verse 3 / slide 1'],
    ['previous', 9, 'Chorus / slide 4'],
  ] as const)("keeps an armed ProPresenter armed on a cold %s's frame past the window, after a reconnect over a slide with no words", async (button, index, shown) => {
    const { producer, clock, latest } = await reconnectArmedOnTurnaround();

    await press(producer, button);
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, index);

    expect(pro!.showing()).toEqual({ uuid: THERE_IS_FREEDOM, index });
    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null, state: [expect.stringContaining(shown), expect.any(String)] });
  });

  it('pauses an armed ProPresenter on a slide pressed by hand after a reconnect over a slide with no words', async () => {
    const { clock, row } = await reconnectArmedOnTurnaround();

    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 20);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it('pauses on a slide beside the last slide shown but not beside the slide showing, after a cold Previous slide with a frame since the open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { play, producer, clock, row, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
    await pro!.sendSlide(THERE_IS_FREEDOM, 7);
    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'previous');
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 5);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("pauses on a slide pressed by hand inside a cold Next slide's frame time after a reconnect over a slide with no words, when it is neither slide beside the last slide shown", async () => {
    const { producer, clock, row } = await reconnectArmedOnTurnaround();

    await press(producer, 'next');
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 20);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it.each([
    ['next', 9],
    ['previous', 11],
  ] as const)("pauses on the slide beside the last slide shown on the other side, pressed by hand inside a cold %s's frame time after a reconnect over a slide with no words", async (button, index) => {
    const { producer, clock, row } = await reconnectArmedOnTurnaround();

    await press(producer, button);
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, index);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });
});

const OCTOBER_25 = { id: '49F3C197-E743-45AB-8670-C53959B82BDC', label: 'Series One - October 25, 2026' };
const OCTOBER_11 = { id: '6E51EFFD-0E26-43D9-A4AA-DF43A41C18B5', label: 'Series One - October 11, 2026' };
const THERE_IS_FREEDOM = '894B40A0-42FE-411E-B915-F1919C6DA33E';
const HOUSE_OF_THE_LORD = 'E7B9D242-CF4D-40B2-A570-BA1AB638C967';
// The playlist ProPresenter pulled for 8 November on 2026-11-02, which the fake lists after
// listNovember8(), and its first song, whose groups start at an unnamed title slide 0, Verse 1 1,
// Verse 2 3 and Chorus 1 5, and which has no End or Ending group.
const NOVEMBER_8 = { id: '306E3B2A-D71A-40B2-ACBD-DE96FC9FA5F5', label: 'November 8, 2026' };
const ANCIENT_GATES = '5A606BC5-9279-4509-983E-88092AE567F0';
const ANCIENT_GATES_CUE_POINTS: CuePoint[] = [
  { name: '1 - Intro (Ancient Gates)', time: 0 },
  { name: '1 - Verse 1', time: 16 },
  { name: '1 - Verse 2', time: 32 },
  { name: '1 - Chorus 1', time: 48 },
  { name: '1 - End', time: 64 },
];
// The third song of listNovember8(), read 2026-11-06, whose groups start at Intro 0, Verse 1 1,
// Chorus 4, Verse 1 8, Chorus 11, Chorus 14, Bridge 18, Bridge 22, Chorus 26 and Chorus 29: one slide
// of Intro, two Verse 1 groups and five Chorus groups, and no End or Ending group. Its sections, 16
// beats each, start on Verse 1, with no Intro, and repeat Chorus six times.
const WORTHY_OF_IT_ALL = 'AA8F2F17-09BE-44ED-A618-C645D5EC8AAB';
const WORTHY_OF_IT_ALL_CUE_POINTS: CuePoint[] = [
  { name: '1 - Verse 1 (Worthy Of It All)', time: 0 },
  { name: '1 - Chorus', time: 16 },
  { name: '1 - Verse 1', time: 32 },
  { name: '1 - Chorus', time: 48 },
  { name: '1 - Chorus', time: 64 },
  { name: '1 - Bridge', time: 80 },
  { name: '1 - Chorus', time: 96 },
  { name: '1 - Chorus', time: 112 },
  { name: '1 - Chorus', time: 128 },
  { name: '1 - End', time: 144 },
];
// A cue's trigger: the presentation's slide at that index, from 0, counting every slide in the order its
// read lists its groups and their slides. There Is Freedom's groups start at Intro 0, Verse 1 1,
// Verse 2 3, Pre Chorus 5, Chorus 6, Turnaround 10, Verse 3 11, Verse 4 13, the first Bridge 1 20, the
// first Bridge 2 22 and Ending 36.
const trigger = (presentation: string, index: number) => `/v1/presentation/${presentation}/${index}/trigger`;
// The clear of the slide layer, which Clear slide sends and a cue sends for a section with no group of
// its name after the song's first section with one.
const CLEAR = '/v1/clear/layer/slide';
// A group trigger, an index trigger, or the clear, as the cue paths ProPresenter received.
const CUE_PATH = /^\/v1\/presentation\/[^/]+\/(group\/[^/]+|-?\d+)\/trigger$/;
// The second song of listNovember8(), whose groups start at Intro 0, a slide with no words, Verse 1 1
// and Chorus 1 9, and close on Ending 24.
const HOLY_FOREVER = '27B59282-5C91-478D-B677-23BE463959BB';
// Ancient Gates then Holy Forever, each with a Count Off, from listNovember8(). Ancient Gates has no
// group named Count Off, Intro, Turnaround, Interlude, End or Ending, so its first section with a
// group is its Verse 1; Holy Forever's first is its Intro. The first Count Off comes after a gap,
// since a start already inside a section raises no cue, and Ancient Gates' End sits a bar before Holy
// Forever's Count Off, so the two songs' cues go out apart.
const NOVEMBER_8_CUE_POINTS: CuePoint[] = [
  { name: '1 - Count Off (Ancient Gates)', time: 4 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse 1', time: 16 },
  { name: '1 - Turnaround', time: 24 },
  { name: '1 - Interlude', time: 32 },
  { name: '1 - End', time: 40 },
  { name: '2 - Count Off (Holy Forever)', time: 44 },
  { name: '2 - Intro', time: 48 },
  { name: '2 - Verse 1', time: 56 },
  { name: '2 - End', time: 64 },
];

describe('the playlist pick', () => {
  it('lists the playlists ProPresenter holds once it is online, with none picked', async () => {
    const { row } = await proRig();

    const shown = await row((row) => (row.pick?.options.length ?? 0) > 0);

    expect(shown.pick?.label).toBe('Playlist');
    expect(shown.pick?.options).toHaveLength(14);
    expect(shown.pick?.options.slice(0, 2)).toEqual([OCTOBER_25, OCTOBER_11]);
    expect(shown.pick?.picked).toBeNull();
  });

  it('shows the picked playlist, and reads it and each presentation it links, skipping headers, placeholders and empty items', async () => {
    const { producer, row } = await proRig();
    await row((row) => (row.pick?.options.length ?? 0) > 0);

    producer.send({ kind: 'pick', target: 'propresenter', choice: OCTOBER_25.id });

    expect((await row((row) => row.pick?.picked !== null)).pick?.picked).toEqual(OCTOBER_25);
    const read = (path: string) => pro!.requests.some((request) => request.path === path);
    await vi.waitFor(() => expect(read(`/v1/presentation/${THERE_IS_FREEDOM}`)).toBe(true));
    expect(read(`/v1/playlist/${OCTOBER_25.id}`)).toBe(true);
    expect([...new Set(pro!.requests.filter(({ path }) => path.startsWith('/v1/presentation/')).map(({ path }) => path.split('/')[3]))].sort()).toEqual(
      ['15C678B7', 'DFF092C1', '894B40A0', '27B59282', '964FAA23', '58C14FDA', '4CC08029', '46AE4CBD', '1D17EA27'].sort().map((start) => expect.stringMatching(new RegExp(`^${start}-`))),
    );
  });
});

// At 120 BPM in 4/4 a beat is 500 ms and a bar is 4 beats.
const BEAT_MS = 500;
const JUMP = '/live/song/cue_point/jump';
// Live reports the playhead as float32, so a position is compared within a hair.
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

// Moves the stopped playhead, then Live's time signature, as Live reports a click into a song in
// another meter, and once the producer sees both, the section's bars counted in the new meter, moves
// the server's clock on for the song's meter to settle. next is the rig's (proRig).
async function walkStopped(
  next: (matches: (snapshot: ProducerSnapshot) => boolean) => Promise<ProducerSnapshot>,
  { position, numerator, denominator }: { position: number; numerator: number; denominator: number },
) {
  const bar = (numerator * 4) / denominator;
  const seen = next(({ position: at, now, set }) => {
    const section = now && set?.songs.find(({ number }) => number === now.song)?.sections[now.section];
    return near(at, position) && !!section && section.end !== null && now.bars === Math.ceil((section.end - section.time) / bar - 1e-4);
  });
  rig!.live.setPosition(position);
  rig!.live.setSignature(numerator, denominator);
  await seen;
  rig!.clock.advance(METER_SETTLE_MS);
}

// Four songs: There Is Freedom from the October 25 playlist, with a section in other letter case than
// its group and one with no group of its name; House of the Lord from the October 11 playlist, whose
// item there is "House of the Lord - [ Full ]"; Prayer, a placeholder in October 25; and a song in no
// playlist.
const SONGS: CuePoint[] = [
  { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
  { name: '1 - pre chorus', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - Outro', time: 48 },
  { name: '1 - End', time: 64 },
  { name: '2 - Chorus (House of the Lord)', time: 64 },
  { name: '2 - End', time: 80 },
  { name: '3 - Verse (Prayer)', time: 80 },
  { name: '3 - End', time: 96 },
  { name: '4 - Verse 1 (No Such Song)', time: 96 },
  { name: '4 - End', time: 112 },
];

// A rig playing from position in SONGS, ProPresenter online with its playlists listed and armed, and
// the playlist picked and read when one is given. Every helper waits for the producer to see the
// change it makes; a cue reaches ProPresenter before the pages hear of the change that raised it.
// Given a lateness log, the server writes it there. leadBeats and slideTiming are as for proRig, and
// setup changes Live's transport at startup, such as to stopped or to another signature.
async function armedRig({
  position,
  playlist,
  cuePoints = SONGS,
  statePath,
  latenessLog,
  leadBeats,
  slideTiming,
  setup,
}: {
  position: number;
  playlist?: string;
  cuePoints?: CuePoint[];
  statePath?: string;
  latenessLog?: { path: string };
  leadBeats?: number | 'default';
  slideTiming?: string;
  setup?: Omit<LiveSetup, 'position'>;
}) {
  const started = await proRig({ cuePoints, setup: { playing: true, position, ...setup }, statePath, latenessLog, leadBeats, slideTiming });
  const { producer, row, next, clock, latest } = started;
  await row((row) => row.connection === 'online' && (row.pick?.options.length ?? 0) > 0);
  if (playlist) {
    producer.send({ kind: 'pick', target: 'propresenter', choice: playlist });
    await row((row) => row.pick?.picked?.id === playlist);
    await pro!.idle();
  }
  producer.send({ kind: 'arm', target: 'propresenter' });
  await row((row) => row.arm === 'armed');
  const leader = await rig!.connectLeader();
  await leader.snapshot(loaded);
  return {
    producer,
    leader,
    row,
    next,
    latest,
    clock,
    // Plays on for that many beats, and waits for the playhead where Live then puts it.
    async play(beats: number, landsOn: number) {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      rig!.live.advance(beats * BEAT_MS);
      await seen;
    },
    // The leader's command, once the producer sees the snapshot it gives.
    async lead(command: unknown, gives: (snapshot: ProducerSnapshot) => boolean) {
      const seen = next(gives);
      leader.send(command);
      await seen;
    },
    // The triggers the fake ProPresenter received, once it has answered every request.
    async triggers() {
      await pro!.idle();
      return pro!.triggers();
    },
    // The triggers and the clears the fake ProPresenter received, in order, once it has answered every
    // request.
    async sent() {
      await pro!.idle();
      return pro!.requests.map(({ path }) => path).filter((path) => CUE_PATH.test(path) || path === CLEAR);
    },
  };
}

describe('the cue', () => {
  it('triggers nothing with no playlist picked', async () => {
    const { play, triggers } = await armedRig({ position: 8 });

    await play(8, 16);
    await play(16, 32);

    expect(await triggers()).toEqual([]);
  });

  it("triggers each section's group in the song's presentation by the group's exact name, and again on a jump landing and a loop wrap", async () => {
    const { play, lead, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });

    await play(8, 16);
    await play(16, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5), trigger(THERE_IS_FREEDOM, 6)]);

    // The bar line after 32 is 36, so Live lands on the pre chorus, 16, and plays on a beat.
    await lead({ kind: 'jump', song: 1, section: 1 }, (snapshot) => snapshot.jump?.section === 1);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(5, 17);
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 1);
    await play(15, 16);

    expect((await triggers()).slice(2)).toEqual([trigger(THERE_IS_FREEDOM, 5), trigger(THERE_IS_FREEDOM, 5)]);
  });

  it("triggers a song's End as its presentation's Ending group, which the songs' presentations close on, when the song's last section does not clear", async () => {
    // The End follows the Chorus, which has a group, so nothing cleared before it. Its 4 slides change
    // at 40, 48 and 56, so a start at 57 meets no change on the way to the End.
    const chorusLast: CuePoint[] = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - pre chorus', time: 16 },
      { name: '1 - Chorus', time: 32 },
      { name: '1 - End', time: 64 },
    ];
    const { play, sent } = await armedRig({ position: 57, playlist: OCTOBER_25.id, cuePoints: chorusLast });

    await play(7, 64);

    expect(await sent()).toEqual([trigger(THERE_IS_FREEDOM, 36)]);
  });

  it('clears at the End of a song with an Ending group and no Ending section, after its Outro cleared, and never brings the Ending group back', async () => {
    const { play, sent } = await armedRig({ position: 40, playlist: OCTOBER_25.id });

    await play(8, 48);
    expect(await sent()).toEqual([CLEAR]);
    await play(16, 64);

    expect(await sent()).toEqual([CLEAR, CLEAR]);
    expect(await sent()).not.toContain(trigger(THERE_IS_FREEDOM, 36));
  });

  it("triggers a song's End as a group named End over one named Ending, when the presentation has both", async () => {
    pro = await startFakeProPresenter();
    pro.renameGroup(THERE_IS_FREEDOM, 'Turnaround', 'End');
    const { play, triggers } = await armedRig({ position: 56, playlist: OCTOBER_25.id });

    await play(8, 64);

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 10)]);
  });

  it("triggers Ending once for a song with an Ending section of its own, at that section, and clears at its End when the presentation has no End group", async () => {
    // A built set keeps a song's Ending locator as a section and adds its End after it.
    const ending: CuePoint[] = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - Chorus', time: 32 },
      { name: '1 - Ending', time: 48 },
      { name: '1 - End', time: 64 },
    ];
    const { play, sent } = await armedRig({ position: 40, playlist: OCTOBER_25.id, cuePoints: ending });

    await play(8, 48);
    expect(await sent()).toEqual([trigger(THERE_IS_FREEDOM, 36)]);
    await play(16, 64);

    expect(await sent()).toEqual([trigger(THERE_IS_FREEDOM, 36), CLEAR]);
  });

  it("triggers Ending at a song's own Ending section and still its End group at its End, when the presentation has one", async () => {
    pro = await startFakeProPresenter();
    pro.renameGroup(THERE_IS_FREEDOM, 'Turnaround', 'End');
    const ending: CuePoint[] = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - Chorus', time: 32 },
      { name: '1 - Ending', time: 48 },
      { name: '1 - End', time: 64 },
    ];
    const { play, triggers } = await armedRig({ position: 40, playlist: OCTOBER_25.id, cuePoints: ending });

    await play(8, 48);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 36)]);
    await play(16, 64);

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 36), trigger(THERE_IS_FREEDOM, 10)]);
  });

  it('clears for a section with no group of its name after the first with one, and for an End with neither an End nor an Ending group, and sends nothing for a song in no presentation or a placeholder', async () => {
    // There Is Freedom's Ending group renamed, so its End has no group to trigger either.
    pro = await startFakeProPresenter();
    pro.renameGroup(THERE_IS_FREEDOM, 'Ending', 'Coda');
    const { play, sent } = await armedRig({ position: 40, playlist: OCTOBER_25.id });

    // Outro, There Is Freedom's End, House of the Lord (not in October 25), Prayer and No Such Song.
    await play(8, 48);
    await play(16, 64);
    await play(16, 80);
    await play(16, 96);
    await play(8, 104);

    expect(await sent()).toEqual([CLEAR, CLEAR]);
  });

  it("shows slide 1 for each section before a song's first section with a group, as Ancient Gates' Count Off and Intro and Holy Forever's Count Off, triggers Holy Forever's Intro as its Intro group, and clears after the first", async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { play, lead, sent } = await armedRig({ position: 0, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');

    // Ancient Gates: Count Off, Intro, Verse 1, Turnaround, Interlude and End.
    await play(4, 4);
    await play(4, 8);
    await play(8, 16);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 0), trigger(ANCIENT_GATES, 0), trigger(ANCIENT_GATES, 1)]);
    await play(8, 24);
    await play(8, 32);
    await play(8, 40);
    expect((await sent()).slice(3)).toEqual([CLEAR, CLEAR, CLEAR]);

    // Holy Forever: Count Off, Intro and Verse 1.
    await play(4, 44);
    await play(4, 48);
    await play(8, 56);
    expect((await sent()).slice(6)).toEqual([trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 1)]);
  });

  it('sends slide 1 or the clear again on Fire again in a section with no group, by the same rule', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, play, sent } = await armedRig({ position: 6, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });

    // In Ancient Gates' Count Off, before its first section with a group.
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toHaveLength(1));
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 0)]);

    // In its Turnaround, after its Verse 1.
    await play(2, 8);
    await play(8, 16);
    await play(8, 24);
    expect((await sent()).slice(1)).toEqual([trigger(ANCIENT_GATES, 0), trigger(ANCIENT_GATES, 1), CLEAR]);
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.slideCommands()).toHaveLength(2));

    expect((await sent()).slice(4)).toEqual([CLEAR]);
  });

  it("matches a song on the presentation's own name, so the item House of the Lord - [ Full ] matches the song House of the Lord, and triggers nothing on its arrangement Full", async () => {
    pro = await startFakeProPresenter();
    pro.authorize(HOUSE_OF_THE_LORD);
    const { play, latest, triggers } = await armedRig({ position: 56, playlist: OCTOBER_11.id });

    // Into House of the Lord's Chorus, which its presentation has, at 64.
    await play(8, 64);

    expect(await triggers()).toEqual([]);
    expect((await latest()).check).toEqual(
      fileCheck({
        names: ['There Is Freedom: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
        problems: ['House of the Lord: arrangement Full in ProPresenter, not Master'],
      }),
    );
  });

  // A Planning Center import can name a presentation for its recording, and ProPresenter gives no way to change that
  // own name; the producer renames its playlist item instead (setlist-controller#579).
  it("triggers the presentation whose own name differs when its playlist item's name is the song's title", async () => {
    pro = await startFakeProPresenter();
    pro.renamePresentation(THERE_IS_FREEDOM, 'There Is Freedom (Live)');
    const { play, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });

    await play(8, 16);
    await play(16, 32);

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5), trigger(THERE_IS_FREEDOM, 6)]);
  });

  it("triggers the presentation of the song's own name over an earlier item that carries the song's title", async () => {
    pro = await startFakeProPresenter();
    pro.renameItem(OCTOBER_25.id, LOOP, 'There Is Freedom');
    const { play, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });

    await play(8, 16);
    await play(16, 32);

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5), trigger(THERE_IS_FREEDOM, 6)]);
  });

  it('triggers nothing on a presentation this Mac is not authorized for', async () => {
    const { play, triggers } = await armedRig({ position: 56, playlist: OCTOBER_11.id });

    await play(8, 64);

    expect(await triggers()).toEqual([]);
  });

  it('triggers nothing for a playlist item with no presentation', async () => {
    pro = await startFakeProPresenter();
    pro.beforeSongsResolved();
    pro.authorize(HOUSE_OF_THE_LORD);
    const { play, triggers } = await armedRig({ position: 56, playlist: OCTOBER_11.id });

    await play(8, 64);

    expect(pro.requests.some(({ path }) => path === `/v1/presentation/${HOUSE_OF_THE_LORD}`)).toBe(false);
    expect(await triggers()).toEqual([]);
  });

  it('triggers the first slide of each section\'s group on the November 8 playlist, as at home, and clears at an End with no End or Ending group', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { play, sent } = await armedRig({ position: 8, playlist: NOVEMBER_8.id, cuePoints: ANCIENT_GATES_CUE_POINTS });

    await play(8, 16);
    await play(16, 32);
    await play(16, 48);
    await play(16, 64);

    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 3), trigger(ANCIENT_GATES, 5), CLEAR]);
  });

  it('triggers the second and third Chorus of Worthy Of It All as its second and third Chorus groups, and its second Verse 1 as its second Verse 1 group', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { play, triggers } = await armedRig({ position: 8, playlist: NOVEMBER_8.id, cuePoints: WORTHY_OF_IT_ALL_CUE_POINTS });

    await play(8, 16);
    await play(16, 32);
    await play(16, 48);
    await play(16, 64);

    expect(await triggers()).toEqual([trigger(WORTHY_OF_IT_ALL, 4), trigger(WORTHY_OF_IT_ALL, 8), trigger(WORTHY_OF_IT_ALL, 11), trigger(WORTHY_OF_IT_ALL, 14)]);
  });

  it('triggers a Chorus past the last Chorus group of Worthy Of It All as that last group, and clears at its End, which has no End or Ending group', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { play, sent } = await armedRig({ position: 72, playlist: NOVEMBER_8.id, cuePoints: WORTHY_OF_IT_ALL_CUE_POINTS });

    // The Bridge, the fourth, fifth and sixth Chorus, and the End.
    await play(8, 80);
    await play(16, 96);
    await play(16, 112);
    await play(16, 128);
    await play(16, 144);

    expect(await sent()).toEqual([trigger(WORTHY_OF_IT_ALL, 18), trigger(WORTHY_OF_IT_ALL, 26), trigger(WORTHY_OF_IT_ALL, 29), trigger(WORTHY_OF_IT_ALL, 29), CLEAR]);
  });

  it('triggers the second Chorus group again when a loop on the second Chorus of Worthy Of It All wraps, not the first', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { play, lead, triggers } = await armedRig({ position: 40, playlist: NOVEMBER_8.id, cuePoints: WORTHY_OF_IT_ALL_CUE_POINTS });

    await play(8, 48);
    await play(1, 49);
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
    // Past the second Chorus's end at 64, Live wraps back to its start.
    await play(15, 48);

    expect(await triggers()).toEqual([trigger(WORTHY_OF_IT_ALL, 11), trigger(WORTHY_OF_IT_ALL, 11)]);
  });

  it('triggers the group of the Chorus the playhead is in on a jump landing and on Fire again, in Worthy Of It All', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, play, lead, triggers } = await armedRig({ position: 40, playlist: NOVEMBER_8.id, cuePoints: WORTHY_OF_IT_ALL_CUE_POINTS });

    await play(8, 48);
    await play(16, 64);
    expect(await triggers()).toEqual([trigger(WORTHY_OF_IT_ALL, 11), trigger(WORTHY_OF_IT_ALL, 14)]);

    // From the third Chorus, a jump back to the second: the bar line after 64 is 68, so Live lands on
    // 48 and plays on a beat.
    await lead({ kind: 'jump', song: 1, section: 3 }, (snapshot) => snapshot.jump?.section === 3);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(5, 49);
    expect((await triggers()).slice(2)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);

    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toHaveLength(4));

    expect((await triggers()).slice(2)).toEqual([trigger(WORTHY_OF_IT_ALL, 11), trigger(WORTHY_OF_IT_ALL, 11)]);
  });

  it('triggers a group a URL would have to encode, such as Chorus #2, by its index', async () => {
    pro = await startFakeProPresenter();
    pro.renameGroup(THERE_IS_FREEDOM, 'Chorus', 'Chorus #2');
    const named: CuePoint[] = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - Chorus #2', time: 16 },
      { name: '1 - End', time: 32 },
    ];
    const { play, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: named });

    await play(8, 16);

    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
  });

  it('stays online when a trigger answers 403, then 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pro = await startFakeProPresenter();
    pro.answerTriggers(403, 404);
    const { producer, play, latest, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    const start = producer.received.length;

    await play(8, 16);
    await play(16, 32);
    expect(await triggers()).toHaveLength(2);

    // The clock does not move, so no /version poll runs: one would put a row the triggers took offline
    // back online before the check. No snapshot after arming may show it offline either.
    expect(await latest()).toMatchObject({ connection: 'online', problems: [], arm: 'armed' });
    expect(producer.received.slice(start).map((snapshot) => proRow(snapshot)?.connection)).not.toContain('offline');
  });

  it('logs a trigger ProPresenter refuses and shows it on the row, until the next cue is answered', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    pro = await startFakeProPresenter();
    pro.answerTriggers(404);
    const { play, row, latest, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    const refused = 'Trigger refused for There Is Freedom, pre chorus: ProPresenter answered 404.';

    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);

    expect(await row((row) => row.state.includes(refused))).toMatchObject({ connection: 'online', problems: [], arm: 'armed', state: [refused] });
    expect(error).toHaveBeenCalledWith(`Setlist server: ProPresenter refused the trigger for There Is Freedom, pre chorus: it answered 404 to ${trigger(THERE_IS_FREEDOM, 5)}.`);

    // The Chorus's trigger is answered 204, and the line about the refused one goes.
    await play(16, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5), trigger(THERE_IS_FREEDOM, 6)]);
    expect(await latest()).toMatchObject({ connection: 'online', problems: [], state: [] });
    expect(error).toHaveBeenCalledTimes(1);
  });
});

// The lateness of each cue ProPresenter is handed, and of its acting on it: ProPresenter acts on a
// cue when it answers the cue's group trigger with a success. The log goes in the test's folder.
describe('the lateness of a cue', () => {
  // The log's lines, each parsed, but for its wall-clock time, or none while there is no file.
  const linesOf = async (path: string) =>
    (await readFile(path, 'utf8').catch(() => ''))
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => Object.fromEntries(Object.entries(JSON.parse(line) as Record<string, unknown>).filter(([key]) => key !== 'time')));
  // ProPresenter's line in the log for a section of the first song, There Is Freedom unless another is
  // given, that Live played into, with the index of the slide it triggered, if any.
  const lineFor = (section: string, lateMs: number, actedMs: number | null, title = 'There Is Freedom', slide?: number) => ({
    target: 'propresenter',
    song: 1,
    title,
    section,
    cause: 'played-into',
    ...(slide === undefined ? {} : { slide }),
    lateMs,
    actedMs,
  });

  it("acts on a cue when ProPresenter answers its trigger with a success, as the row's acted-on time and the line's actedMs", async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    const { play, row } = await armedRig({ position: 8, playlist: OCTOBER_25.id, latenessLog: { path } });
    await pro!.streaming();

    // The trigger is held while the server's clock moves on 300 ms. Half a beat past the pre chorus at
    // 16: handed 250 ms late.
    pro!.hang();
    await play(8.5, 16.5);
    await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]));
    await rig!.advanceConnected(300);
    pro!.answer();

    expect((await row((row) => row.lateness.acted !== null)).lateness).toEqual({ last: 250, median: 250, acted: 550, actedMedian: 550 });
    await rig!.close();
    rig = undefined;
    expect(await linesOf(path)).toEqual([lineFor('pre chorus', 250, 550, 'There Is Freedom', 5)]);
  });

  it.each([403, 404])("never acts on a cue whose trigger ProPresenter answers %i, whose line goes out with null, and the row's acted-on time is the next cue's", async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pro = await startFakeProPresenter();
    pro.answerTriggers(status);
    const path = join(await newFolder(), 'cue-lateness.log');
    const { play, row, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, latenessLog: { path } });

    // Half a beat past the pre chorus at 16, refused, and the refusal read before the next cue. Then
    // three quarters past the Chorus at 32, answered 204 at once: handed 375 ms late and acted on as
    // late.
    await play(8.5, 16.5);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);
    await play(16.25, 32.75);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5), trigger(THERE_IS_FREEDOM, 6)]);

    expect((await row((row) => row.lateness.acted !== null)).lateness).toMatchObject({ last: 375, acted: 375, actedMedian: 375 });
    await rig!.close();
    rig = undefined;
    expect(await linesOf(path)).toEqual([lineFor('pre chorus', 250, null, 'There Is Freedom', 5), lineFor('Chorus', 375, 375, 'There Is Freedom', 6)]);
  });

  it('never acts on a cue whose trigger gets no answer before ProPresenter goes offline, whose line goes out with null then', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = join(await newFolder(), 'cue-lateness.log');
    const { play, row, latest } = await armedRig({ position: 8, playlist: OCTOBER_25.id, latenessLog: { path } });
    await pro!.streaming();

    pro!.hang();
    await play(8.5, 16.5);
    await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]));
    pro!.dropStreams();
    await row((row) => row.connection === 'offline');

    await vi.waitFor(async () => expect(await linesOf(path)).toEqual([lineFor('pre chorus', 250, null, 'There Is Freedom', 5)]));
    expect((await latest()).lateness).toMatchObject({ last: 250, acted: null, actedMedian: null });
  });

  it('writes the line of a cue that triggers nothing, such as one of a song with no presentation, with null at the next cue', async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    const noPresentation: CuePoint[] = [
      { name: '1 - Verse 1 (No Such Song)', time: 0 },
      { name: '1 - Chorus', time: 16 },
      { name: '1 - End', time: 32 },
    ];
    const { play, sent } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: noPresentation, latenessLog: { path } });

    // Half a beat past the Chorus at 16, then past the End.
    await play(8.5, 16.5);
    await play(16, 32.5);
    expect(await sent()).toEqual([]);

    await vi.waitFor(async () => expect(await linesOf(path)).toEqual([lineFor('Chorus', 250, null, 'No Such Song')]));
    await rig!.close();
    rig = undefined;
    expect(await linesOf(path)).toEqual([lineFor('Chorus', 250, null, 'No Such Song'), lineFor('End', 250, null, 'No Such Song')]);
  });

  it('acts on the clear of a section with no group of its name, and of an End with neither an End nor an Ending group, on its section start as on a trigger', async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    // There Is Freedom's Ending group renamed, so its End has no group of its name either.
    pro = await startFakeProPresenter();
    pro.renameGroup(THERE_IS_FREEDOM, 'Ending', 'Coda');
    const { play, sent } = await armedRig({ position: 40, playlist: OCTOBER_25.id, cuePoints: SET, latenessLog: { path } });

    // Half a beat past the Outro at 48, which There Is Freedom has no group for, then past its End;
    // the fake answers each clear at once, so each is acted on as late as it was handed.
    await play(8.5, 48.5);
    expect(await sent()).toEqual([CLEAR]);
    await play(16, 64.5);
    expect(await sent()).toEqual([CLEAR, CLEAR]);

    await vi.waitFor(async () => expect(await linesOf(path)).toEqual([lineFor('Outro', 250, 250), lineFor('End', 250, 250)]));
  });

  it("acts on the clears of Ancient Gates' Turnaround, Interlude and End on their section starts", async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { play, sent } = await armedRig({ position: 20, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS, latenessLog: { path } });

    await play(4.5, 24.5);
    expect(await sent()).toEqual([CLEAR]);
    await play(8, 32.5);
    expect(await sent()).toEqual([CLEAR, CLEAR]);
    await play(8, 40.5);
    expect(await sent()).toEqual([CLEAR, CLEAR, CLEAR]);

    await vi.waitFor(async () =>
      expect(await linesOf(path)).toEqual([lineFor('Turnaround', 250, 250, 'Ancient Gates'), lineFor('Interlude', 250, 250, 'Ancient Gates'), lineFor('End', 250, 250, 'Ancient Gates')]),
    );
  });
});

describe('the pick across a restart', () => {
  it('keeps the pick for the same set, and a different set asks for a pick again', async () => {
    const statePath = join(await newFolder(), 'propresenter-picks.json');
    await armedRig({ position: 8, playlist: OCTOBER_25.id, statePath });
    await rig!.close();
    rig = undefined;

    const again = await armedRig({ position: 8, statePath });
    expect((await again.row((row) => row.pick?.picked !== null)).pick?.picked).toEqual(OCTOBER_25);
    await pro!.idle();
    await again.play(8, 16);
    expect(await again.triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);
    await rig!.close();
    rig = undefined;

    // The same songs but the last, so a pick kept for the first set would trigger There Is Freedom.
    const other = SONGS.map((point) => (point.name === '4 - Verse 1 (No Such Song)' ? { ...point, name: '4 - Verse 1 (Another Song)' } : point));
    const fresh = await armedRig({ position: 8, statePath, cuePoints: other });
    const before = pro!.triggers().length;
    await fresh.play(8, 16);

    expect((await fresh.latest()).pick?.picked).toBeNull();
    expect((await fresh.triggers()).slice(before)).toEqual([]);
  });
});

const NEXT = '/v1/presentation/active/next/trigger';
const PREVIOUS = '/v1/presentation/active/previous/trigger';
// A press's line opens with "Pressed", so it never reads as the stream's "Next slide:" line.
const NOTHING_TO_MOVE = {
  next: 'Pressed Next slide: nothing to move.',
  previous: 'Pressed Previous slide: nothing to move.',
};

// The slide commands and the triggers ProPresenter received, in order: a press sends one or the
// other, since Next slide and Previous slide after a clear send an index trigger.
const commandsReceived = () => pro!.requests.map(({ path }) => path).filter((path) => path === NEXT || path === PREVIOUS || path === CLEAR || CUE_PATH.test(path));

// Presses each button in turn, each once ProPresenter has received the one before, so the fake
// receives them in press order.
async function press(producer: Awaited<ReturnType<typeof proRig>>['producer'], ...buttons: string[]) {
  for (const button of buttons) {
    const before = commandsReceived().length;
    producer.send({ kind: 'run-button', target: 'propresenter', button });
    await vi.waitFor(() => expect(commandsReceived().length).toBe(before + 1));
  }
  await pro!.idle();
}

describe('the manual buttons', () => {
  it('offers Next slide, Previous slide and Clear slide on the row, in that order', async () => {
    const { row } = await proRig();

    const online = await row((row) => row.connection === 'online');

    expect(online.buttons).toEqual([
      { id: 'next', label: 'Next slide' },
      { id: 'previous', label: 'Previous slide' },
      { id: 'clear', label: 'Clear slide' },
    ]);
  });

  it("sends each button's request disarmed, armed and paused by the Fade out, and changes neither the arm nor the pause", async () => {
    const { producer, row, latest } = await proRig({ setup: { playing: true, position: 8 } });
    await row((row) => row.connection === 'online');

    await press(producer, 'next', 'previous', 'clear');
    expect(pro!.slideCommands()).toEqual([NEXT, PREVIOUS, CLEAR]);
    expect(await latest()).toMatchObject({ connection: 'online', arm: 'disarmed', pause: null });

    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');
    await press(producer, 'next', 'previous', 'clear');
    expect(pro!.slideCommands().slice(3)).toEqual([NEXT, PREVIOUS, CLEAR]);
    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null });

    const leader = await rig!.connectLeader();
    await leader.snapshot(loaded);
    leader.send({ kind: 'fade-out' });
    await row((row) => row.arm === 'paused');
    await press(producer, 'next', 'previous', 'clear');
    expect(pro!.slideCommands().slice(6)).toEqual([NEXT, PREVIOUS, CLEAR]);
    expect(await latest()).toMatchObject({ connection: 'online', arm: 'paused', pause: 'fade-out' });
  });

  it('reports nothing to move when next or previous answers 404 with no presentation active, and stays online', async () => {
    const { producer, row, next, latest } = await proRig();
    await row((row) => row.connection === 'online');
    const start = producer.received.length;
    // ProPresenter's row in the first snapshot from now on whose state changes from the last one's.
    const nextState = () => {
      const was = JSON.stringify(proRow(producer.received.at(-1)!)?.state);
      return next((snapshot) => JSON.stringify(proRow(snapshot)?.state) !== was).then(proRow);
    };

    let shown = nextState();
    await press(producer, 'next');
    expect(await shown).toMatchObject({ connection: 'online', problems: [], state: [NOTHING_TO_MOVE.next] });

    shown = nextState();
    await press(producer, 'previous');
    expect(await shown).toMatchObject({ connection: 'online', problems: [], state: [NOTHING_TO_MOVE.previous] });

    // A clear is a 204 every time, so it clears the line, and next after it has nothing to move again.
    shown = nextState();
    await press(producer, 'clear');
    expect(await shown).toMatchObject({ connection: 'online', problems: [], state: [] });
    shown = nextState();
    await press(producer, 'next');
    expect(await shown).toMatchObject({ connection: 'online', problems: [], state: [NOTHING_TO_MOVE.next] });

    // The clock does not move, so no /version poll could put a row the presses took offline back online.
    expect(await latest()).toMatchObject({ connection: 'online', problems: [] });
    expect(producer.received.slice(start).map((snapshot) => proRow(snapshot)?.connection)).not.toContain('offline');
  });

  it('drops the line when a cue triggers a group, and next then moves with nothing to report', async () => {
    const { producer, play, row, latest, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    await press(producer, 'next');
    await row((row) => row.state[0] === NOTHING_TO_MOVE.next);

    // Into the pre chorus, whose group the fake answers 204, so a presentation is active.
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);
    expect(await latest()).toMatchObject({ state: [] });

    await press(producer, 'next');
    expect(pro!.slideCommands()).toEqual([NEXT, NEXT]);
    expect(pro!.showing()).toEqual({ uuid: THERE_IS_FREEDOM, index: 6 });
    expect(await latest()).toMatchObject({ connection: 'online', problems: [], arm: 'armed', state: [] });
  });

  it('sends nothing while ProPresenter is offline, and logs each press it ignored', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { producer, clock, row, next, latest } = await proRig();
    await row((row) => row.connection === 'online');
    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    await pro!.stop();
    clock.advance(POLL_MS);
    await offline;
    // Answering again, but the clock does not move, so no poll brings the row back online.
    await pro!.start();

    for (const button of ['next', 'previous', 'clear']) producer.send({ kind: 'run-button', target: 'propresenter', button });

    expect(await latest()).toMatchObject({ connection: 'offline' });
    await pro!.idle();
    expect(pro!.slideCommands()).toEqual([]);
    expect(errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('ignored the button'))).toEqual(
      ['next', 'previous', 'clear'].map((button) => `Setlist server: the connection target propresenter ignored the button ${button}: it is offline.`),
    );
  });

  it('logs a press of a button ProPresenter does not offer, and sends nothing', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { producer, row, latest } = await proRig();
    await row((row) => row.connection === 'online');

    producer.send({ kind: 'run-button', target: 'propresenter', button: 'blackout' });
    await latest();
    await pro!.idle();

    expect(pro!.slideCommands()).toEqual([]);
    expect(errors).toHaveBeenCalledWith('Setlist server: the connection target propresenter ignored the button blackout: it offers no such button.');
  });

  // A press leaves no trace in ProPresenter, so each one logs a line, as none did on 2026-11-08.
  it('logs each press with the button, the path sent, what ProPresenter answered and the time it took', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { producer, row } = await proRig();
    await row((row) => row.connection === 'online');

    await press(producer, 'next', 'clear');

    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('to ProPresenter') || line.includes('ProPresenter answered'));
    expect(lines).toEqual([
      expect.stringMatching(/^Setlist server: ProPresenter answered 404 to Next slide \(\/v1\/presentation\/active\/next\/trigger\) after \d+ ms\.$/),
      expect.stringMatching(/^Setlist server: ProPresenter answered 204 to Clear slide \(\/v1\/clear\/layer\/slide\) after \d+ ms\.$/),
    ]);
  });

  it('logs a press ProPresenter gave no answer to', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { producer, row, next } = await proRig();
    await row((row) => row.connection === 'online');
    // ProPresenter holds every request, so the press times out after the rig's 1 s.
    pro!.hang();
    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'previous' });
    await offline;
    await vi.waitFor(() => expect(errors.mock.calls.map(([line]) => String(line))).toContainEqual(expect.stringMatching(/^Setlist server: ProPresenter gave no answer to Previous slide \(\/v1\/presentation\/active\/previous\/trigger\) after \d+ ms\.$/)));
    pro!.answer();
  });

  it("shows a press's line after the slide text, neither a press nor a slide change hides the other, and a Clear slide blanks both", async () => {
    const { producer, row, latest } = await streamRig();
    await pro!.send(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    // No presentation is active in the fake, so next has nothing to move.
    await press(producer, 'next');
    await row((row) => row.state.includes(NOTHING_TO_MOVE.next));
    expect(await latest()).toMatchObject({ connection: 'online', state: [...CHORUS_TEXT, NOTHING_TO_MOVE.next] });

    await pro!.send(VERSE_3);
    await row((row) => row.state.includes(VERSE_3_TEXT[0]!));
    expect(await latest()).toMatchObject({ connection: 'online', state: [...VERSE_3_TEXT, NOTHING_TO_MOVE.next] });

    // A clear is a 204, and the fake sends no stream frame for it, as some real clears brought none.
    // The screen is blank, so the row drops the slide text and the press's line at once.
    await press(producer, 'clear');
    await row((row) => !row.state.includes(NOTHING_TO_MOVE.next));
    expect(await latest()).toMatchObject({ connection: 'online', state: [] });

    // The blank holds only until the stream reports a slide again.
    await pro!.send(CHORUS);
    expect(await row((row) => sameLines(row.state, CHORUS_TEXT))).toMatchObject({ connection: 'online', state: CHORUS_TEXT });
  });

  it("words a press's line so it never reads as the stream's next slide line", async () => {
    const { producer, row, latest } = await streamRig();
    await pro!.send(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    // No presentation is active in the fake, so next has nothing to move.
    await press(producer, 'next');
    await row((row) => row.state.length > CHORUS_TEXT.length);

    const { state } = await latest();
    expect(state.filter((line) => line.startsWith('Next slide:'))).toEqual([CHORUS_TEXT[1]]);
    expect(state).toContain(NOTHING_TO_MOVE.next);
  });

  it('shows no slide text from before a drop with the line of a press made after the reconnect', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { producer, clock, row, next } = await streamRig();
    await pro!.send(CHORUS);
    await row((row) => sameLines(row.state, CHORUS_TEXT));

    // The reconnect's stream request is held, so no opening frame clears the slide text: real
    // ProPresenter's opening presentation/current is not null while a presentation stays active.
    pro!.hangStreams();
    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    pro!.dropStreams();
    await offline;
    const online = next((snapshot) => proRow(snapshot)?.connection === 'online');
    clock.advance(POLL_MS);
    await online;
    await vi.waitFor(() => expect(streamRequests()).toHaveLength(2));

    // No presentation is active in the fake, so next has nothing to move. The row is read from the
    // snapshot the press brings, before the held stream request times out on the rig's 1 s.
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'next' });
    expect(await row((row) => row.state.includes(NOTHING_TO_MOVE.next))).toMatchObject({ connection: 'online', state: [NOTHING_TO_MOVE.next] });
    pro!.answer();
  });

  it("keeps the slide text when a cue's trigger drops the press's line", async () => {
    const { producer, play, row, latest, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    await pro!.streaming();
    // No presentation is active in the fake, so next has nothing to move. A press that moved nothing
    // opens no window, so the slide is a change by hand, and the producer arms ProPresenter again.
    await press(producer, 'next');
    await row((row) => row.state.includes(NOTHING_TO_MOVE.next));
    await pro!.send(CHORUS);
    await row((row) => row.arm === 'paused');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed' && row.state.includes(CHORUS_TEXT[0]!));
    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', state: [...CHORUS_TEXT, NOTHING_TO_MOVE.next] });

    // Into the pre chorus, whose trigger the fake answers with no stream frame, as ProPresenter does
    // not report every slide change.
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);
    expect(await latest()).toMatchObject({ connection: 'online', state: CHORUS_TEXT });
  });

  // The pre chorus's trigger and the button's command ProPresenter has received since `from`, in the
  // order received.
  const preChorusAnd = (from: number, path: string) =>
    pro!.requests
      .slice(from)
      .map((request) => request.path)
      .filter((received) => received === path || received === trigger(THERE_IS_FREEDOM, 5));
  // The same, polled for up to 150 ms, under the rig's 1000 ms request timeout, or until the button's
  // command came.
  const heldPreChorusAnd = async (from: number, path: string) => {
    for (let tries = 0; tries < 6 && !preChorusAnd(from, path).includes(path); tries += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    return preChorusAnd(from, path);
  };

  // ProPresenter acting on the press first and on the cue's slide after it would end a Clear slide on
  // the cue's slide (setlist-controller#309).
  it.each([
    { button: 'next', path: NEXT },
    { button: 'previous', path: PREVIOUS },
    { button: 'clear', path: CLEAR },
  ])("sends a $button press made while the pre chorus's trigger is out only once ProPresenter answers that trigger", async ({ button, path }) => {
    const { producer, play } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    await pro!.streaming();
    const from = pro!.requests.length;
    // ProPresenter holds every request. Half a beat past the pre chorus at 16, its trigger goes out.
    pro!.hang();
    await play(8.5, 16.5);
    await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]));

    producer.send({ kind: 'run-button', target: 'propresenter', button });
    const received = await heldPreChorusAnd(from, path);
    pro!.answer();

    expect(received).toEqual([trigger(THERE_IS_FREEDOM, 5)]);
    await vi.waitFor(() => expect(preChorusAnd(from, path)).toEqual([trigger(THERE_IS_FREEDOM, 5), path]));
  });

  it("never sends a Clear slide press still waiting behind the pre chorus's trigger when ProPresenter goes offline", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { producer, play, next } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    await pro!.streaming();
    // ProPresenter holds every request, so the trigger times out after the rig's 1 s request timeout,
    // which puts ProPresenter offline.
    pro!.hang();
    await play(8.5, 16.5);
    await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]));
    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'clear' });
    await offline;

    pro!.answer();
    await pro!.idle();

    expect(pro!.slideCommands()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('Setlist server: Clear slide was never sent to ProPresenter: it went offline while the press waited its turn.');
  });
});

// Next slide and Previous slide move the slides ProPresenter shows on every press, which the fake
// keeps (showing()): disarmed, armed between two planned changes, inside the lyric lead after a slide
// went early, and after a clear, a cue's or Clear slide's, armed or paused (setlist-controller#377).
describe('the manual buttons move the slides', () => {
  it('moves one slide on with each Next slide and one back with each Previous slide, disarmed, after Fire again put a slide up', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    // Inside Ancient Gates' Verse 1, from 16, whose first slide is 1 and second, on 20, is 2.
    const { producer, row } = await armedRig({ position: 18, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    producer.send({ kind: 'disarm', target: 'propresenter' });
    await row((row) => row.arm === 'disarmed');
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(ANCIENT_GATES, 1)]));
    await pro.idle();

    await press(producer, 'next');
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 2 });
    await press(producer, 'next', 'next');
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 4 });
    await press(producer, 'previous');
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 3 });
    await press(producer, 'previous', 'previous');

    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 1 });
    expect(pro.slideCommands()).toEqual([NEXT, NEXT, NEXT, PREVIOUS, PREVIOUS, PREVIOUS]);
  });

  it('moves one slide on with Next slide while armed and playing between two planned changes, and the screen stays there until the next one', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, play, row, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    // Into Verse 1 on 16, its first slide; its second goes on 20.
    await play(4.5, 16.5);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1)]);

    await press(producer, 'next', 'next');
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 3 });
    await play(3, 19.5);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1)]);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 3 });
    expect(await row((row) => row.arm === 'armed')).toMatchObject({ arm: 'armed', pause: null });

    // The planned change on 20 sends its slide by its index, as it would have.
    await play(1, 20.5);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 2 });
  });

  // Worthy Of It All with an 8-bar Bridge (slides 18 to 21, the last on 88), a 1-bar Vamp on 96 with
  // no group, which clears, and the Chorus's second occurrence (slides 11 to 13) on 100, its first
  // slide on a pickup on 97.5, sent 2 beats early on 95.5, which the Vamp's clear then never blanks.
  const VAMP_CUE_POINTS: CuePoint[] = [
    { name: '1 - Verse 1 (Worthy Of It All)', time: 0 },
    { name: '1 - Chorus', time: 16 },
    { name: '1 - Bridge', time: 64 },
    { name: '1 - Vamp', time: 96 },
    { name: '1 - Chorus', time: 100 },
    { name: '1 - End', time: 132 },
  ];
  it.each([
    { button: 'previous', path: PREVIOUS, index: 10 },
    { button: 'next', path: NEXT, index: 12 },
  ])("keeps the slide a $button press moved to inside the lyric lead, after the Chorus's first slide went early, and sends nothing on the Chorus's downbeat", async ({ button, path, index }) => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const timing = join(await newFolder(), 'slide-timing.json');
    await writeFile(timing, JSON.stringify({ 'Worthy Of It All': [{ section: 'Chorus', occurrence: 2, start: -0.625 }] }));
    const { producer, play, sent } = await armedRig({ position: 84, playlist: NOVEMBER_8.id, cuePoints: VAMP_CUE_POINTS, slideTiming: timing, leadBeats: 'default' });
    await play(6, 90);
    const reported = rig!.clock.now();
    const before = (await sent()).length;
    await rig!.advanceConnected(reported + 5.5 * BEAT_MS - rig!.clock.now());
    expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
    await play(6.25, 96.25);

    await press(producer, button);
    expect(pro.slideCommands()).toEqual([path]);
    expect(pro.showing()).toEqual({ uuid: WORTHY_OF_IT_ALL, index });
    await play(4.25, 100.5);

    expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
    expect(pro.showing()).toEqual({ uuid: WORTHY_OF_IT_ALL, index });
  });

  // Ancient Gates armed from 12: Verse 1's first slide on 16 and its second, slide 2, on 20, then the
  // Turnaround's clear on 24, which leaves no presentation active in ProPresenter.
  const afterTurnaround = async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const started = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await pro.streaming();
    await started.play(4, 16);
    await started.play(4.5, 20.5);
    await started.play(3.5, 24);
    expect(await started.sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), CLEAR]);
    expect(pro.showing()).toBeNull();
    return started;
  };

  it("sends Next slide after the Turnaround's clear as the index trigger of the slide after the last slide shown, and the screen shows it", async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { producer, latest } = await afterTurnaround();

    await press(producer, 'next');

    expect(errors).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^Setlist server: ProPresenter answered 204 to Next slide \\(/v1/presentation/${ANCIENT_GATES}/3/trigger\\) after \\d+ ms\\.$`)));

    expect(commandsReceived().slice(3)).toEqual([trigger(ANCIENT_GATES, 3)]);
    expect(pro!.showing()).toEqual({ uuid: ANCIENT_GATES, index: 3 });
    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null });
    expect((await latest()).state).not.toContain(NOTHING_TO_MOVE.next);
  });

  it("sends Previous slide after the Turnaround's clear as the index trigger of the last slide shown, and the screen shows it again", async () => {
    const { producer, latest } = await afterTurnaround();

    await press(producer, 'previous');

    expect(commandsReceived().slice(3)).toEqual([trigger(ANCIENT_GATES, 2)]);
    expect(pro!.showing()).toEqual({ uuid: ANCIENT_GATES, index: 2 });
    expect((await latest()).state).not.toContain(NOTHING_TO_MOVE.previous);
  });

  it("sends the index trigger for the first Next slide after a clear and active next for the second, two slides on", async () => {
    const { producer } = await afterTurnaround();

    await press(producer, 'next', 'next');

    expect(commandsReceived().slice(3)).toEqual([trigger(ANCIENT_GATES, 3), NEXT]);
    expect(pro!.showing()).toEqual({ uuid: ANCIENT_GATES, index: 4 });
  });

  it('moves on after a clear from the slide earlier presses moved to, not the slide the cue showed', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, play, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await play(4.5, 16.5);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1)]);

    await press(producer, 'next', 'next', 'previous', 'next', 'clear', 'next');

    expect(commandsReceived().slice(1)).toEqual([NEXT, NEXT, PREVIOUS, NEXT, CLEAR, trigger(ANCIENT_GATES, 4)]);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 4 });
  });

  it("sends Next slide pressed while the Turnaround's clear is still out as the index trigger, once that clear is answered", async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, play, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await play(4, 16);
    await play(4.5, 20.5);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    // ProPresenter holds the Turnaround's clear, and the press goes in line behind it.
    pro.hang();
    await play(3.5, 24);
    await vi.waitFor(() => expect(commandsReceived().slice(2)).toEqual([CLEAR]));
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'next' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    pro.answer();

    await vi.waitFor(() => expect(commandsReceived().slice(2)).toEqual([CLEAR, trigger(ANCIENT_GATES, 3)]));
    await pro.idle();
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 3 });
  });

  // Two presses handed while the Turnaround's clear is still out: the first goes as the index trigger
  // and the second by the active path, so the second brings the slide next to the first's, and its
  // frame, past the window, never pauses an armed ProPresenter, with or without the first's frame.
  it.each([
    { button: 'next', first: 3, second: 4, path: NEXT, firstFrame: false },
    { button: 'next', first: 3, second: 4, path: NEXT, firstFrame: true },
    { button: 'previous', first: 2, second: 1, path: PREVIOUS, firstFrame: false },
    { button: 'previous', first: 2, second: 1, path: PREVIOUS, firstFrame: true },
  ])("never pauses on the frame of the second of two $button presses made while the Turnaround's clear is still out, the first's frame sent: $firstFrame", async ({ button, first, second, path, firstFrame }) => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, play, row, clock, latest, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await pro.streaming();
    await play(4, 16);
    await play(4.5, 20.5);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    pro.hang();
    await play(3.5, 24);
    await vi.waitFor(() => expect(commandsReceived().slice(2)).toEqual([CLEAR]));
    producer.send({ kind: 'run-button', target: 'propresenter', button });
    producer.send({ kind: 'run-button', target: 'propresenter', button });
    await new Promise((resolve) => setTimeout(resolve, 100));
    pro.answer();
    await vi.waitFor(() => expect(commandsReceived().slice(2)).toEqual([CLEAR, trigger(ANCIENT_GATES, first), path]));
    await pro.idle();
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: second });

    clock.advance(PAST_WINDOW_MS);
    if (firstFrame) await pro.sendSlide(ANCIENT_GATES, first);
    await pro.sendSlide(ANCIENT_GATES, second);

    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null });
    expect(await row((row) => row.arm === 'armed')).toMatchObject({ arm: 'armed', pause: null });
  });

  it.each([
    { button: 'next', index: 3 },
    { button: 'previous', index: 2 },
  ])("moves the slides with $button after the Turnaround's clear while paused by the Fade out", async ({ button, index }) => {
    const { producer, leader, row } = await afterTurnaround();
    leader.send({ kind: 'fade-out' });
    await row((row) => row.arm === 'paused');

    await press(producer, button);

    expect(commandsReceived().slice(3)).toEqual([trigger(ANCIENT_GATES, index)]);
    expect(pro!.showing()).toEqual({ uuid: ANCIENT_GATES, index });
    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'fade-out' });
  });

  it.each([
    { button: 'next', index: 3 },
    { button: 'previous', index: 2 },
  ])('moves the slides with $button after a Clear slide press while paused by the Fade out', async ({ button, index }) => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, leader, play, row, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await play(4, 16);
    await play(4.5, 20.5);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    leader.send({ kind: 'fade-out' });
    await row((row) => row.arm === 'paused');

    await press(producer, 'clear', button);

    expect(commandsReceived().slice(2)).toEqual([CLEAR, trigger(ANCIENT_GATES, index)]);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index });
  });

  it.each([
    { button: 'next', index: 2 },
    { button: 'previous', index: 1 },
  ])('moves the slides with $button after a Clear slide press, disarmed, after Fire again put a slide up', async ({ button, index }) => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, row } = await armedRig({ position: 18, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    producer.send({ kind: 'disarm', target: 'propresenter' });
    await row((row) => row.arm === 'disarmed');
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(ANCIENT_GATES, 1)]));
    await pro.idle();

    await press(producer, 'clear', button);

    expect(commandsReceived().slice(1)).toEqual([CLEAR, trigger(ANCIENT_GATES, index)]);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index });
  });

  it("crosses into slide 1 of the next presentation item for Next slide after a clear when the last slide shown was the presentation's last", async () => {
    // There Is Freedom's End triggers its Ending group, slide 36, the presentation's last.
    const ending: CuePoint[] = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - Chorus', time: 16 },
      { name: '1 - End', time: 32 },
    ];
    const { producer, play, row, sent } = await armedRig({ position: 24, playlist: OCTOBER_25.id, cuePoints: ending });
    await play(8, 32);
    expect(await sent()).toEqual([trigger(THERE_IS_FREEDOM, 36)]);

    await press(producer, 'clear');
    await pressSending(producer, 'next', 2);

    // The index trigger past the last slide answers 404, so the press crosses into Holy Forever,
    // October 25's next item.
    expect(commandsReceived().slice(1)).toEqual([CLEAR, trigger(THERE_IS_FREEDOM, 37), trigger(HOLY_FOREVER, 0)]);
    expect(pro!.showing()).toEqual({ uuid: HOLY_FOREVER, index: 0 });
    expect((await row((row) => row.connection === 'online')).state).not.toContain(NOTHING_TO_MOVE.next);
  });

  // setlist-controller#418: the last slide shown follows the presentation ProPresenter names active.
  it("moves Next slide on inside another presentation an operator triggered by hand after the Turnaround's clear, never back into the song", async () => {
    const { producer } = await afterTurnaround();
    // Facetime's first slide, triggered by hand in ProPresenter.
    await pro!.sendSlide(FACETIME, 0);

    await press(producer, 'next');

    expect(commandsReceived().slice(3)).toEqual([NEXT]);
    expect(pro!.showing()).toEqual({ uuid: FACETIME, index: 1 });
  });

  it("moves Next slide on inside another presentation triggered by hand after the Turnaround's clear when its presentation/current frame comes after its slide", async () => {
    const { producer } = await afterTurnaround();
    // Facetime's second slide, triggered by hand, its presentation/current after its status/slide.
    await pro!.sendSlide(FACETIME, 1, { currentLast: true });

    await press(producer, 'next');

    expect(commandsReceived().slice(3)).toEqual([NEXT]);
    expect(pro!.showing()).toEqual({ uuid: FACETIME, index: 2 });
  });

  it.each([
    { button: 'next', path: NEXT },
    { button: 'previous', path: PREVIOUS },
  ])("says nothing to move for $button after a clear when ProPresenter refused the next song's trigger, and never shows the song before", async ({ button, path }) => {
    const { producer, play, row, sent } = await afterTurnaround();
    // Ancient Gates' Interlude on 32 and its End on 40 clear, then ProPresenter refuses Holy Forever's
    // Count Off on 44, so no slide of the presentation last triggered has shown.
    await play(8, 32);
    await play(8, 40);
    pro!.answerTriggers(500);
    await play(4.5, 44.5);
    expect((await sent()).slice(3)).toEqual([CLEAR, CLEAR, trigger(HOLY_FOREVER, 0)]);
    await row((row) => row.state.some((line) => line.startsWith('Trigger refused for Holy Forever')));

    await press(producer, button);

    expect(commandsReceived().slice(6)).toEqual([path]);
    expect(pro!.showing()).toBeNull();
    expect(await row((row) => row.state.includes(NOTHING_TO_MOVE[button as 'next' | 'previous']))).toMatchObject({ connection: 'online' });
  });

  it.each([
    { button: 'next', index: 4 },
    { button: 'previous', index: 3 },
  ])("moves the slides with $button after a Clear slide from a slide pressed by hand in the song whose first trigger ProPresenter refused", async ({ button, index }) => {
    const { producer, play, row, clock, sent } = await afterTurnaround();
    await play(8, 32);
    await play(8, 40);
    pro!.answerTriggers(500);
    await play(4.5, 44.5);
    expect((await sent()).slice(3)).toEqual([CLEAR, CLEAR, trigger(HOLY_FOREVER, 0)]);
    await row((row) => row.state.some((line) => line.startsWith('Trigger refused for Holy Forever')));
    // The operator puts Holy Forever's slide 3 up by hand in ProPresenter.
    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(HOLY_FOREVER, 3);

    await press(producer, 'clear', button);

    expect(commandsReceived().slice(6)).toEqual([CLEAR, trigger(HOLY_FOREVER, index)]);
    expect(pro!.showing()).toEqual({ uuid: HOLY_FOREVER, index });
  });

  it.each([
    { button: 'next', index: 2 },
    { button: 'previous', index: 1 },
  ])('moves the slides with $button after a Clear slide from the slide of a refused cue that the operator pressed by hand', async ({ button, index }) => {
    const { producer, play, clock, sent } = await afterTurnaround();
    await play(8, 32);
    await play(8, 40);
    // ProPresenter refuses Holy Forever's Count Off, Intro and Verse 1, whose first slide is slide 1.
    pro!.answerTriggers(500, 500, 500);
    await play(4.5, 44.5);
    await play(4, 48.5);
    await play(8, 56.5);
    expect((await sent()).slice(3)).toEqual([CLEAR, CLEAR, trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 1)]);
    await pro!.idle();
    // The operator puts Verse 1's first slide up by hand in ProPresenter, as the cue should have.
    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(HOLY_FOREVER, 1);

    await press(producer, 'clear', button);

    expect(commandsReceived().slice(8)).toEqual([CLEAR, trigger(HOLY_FOREVER, index)]);
    expect(pro!.showing()).toEqual({ uuid: HOLY_FOREVER, index });
  });

  it('moves on from a slide pressed by hand: Next slide after a Clear slide sends the index trigger of the slide after it', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, play, row, clock, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await pro.streaming();
    await play(4, 16);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1)]);
    // Verse 3 slide 1, slide 7, pressed by hand, which pauses ProPresenter.
    clock.advance(PAST_WINDOW_MS);
    await pro.sendSlide(ANCIENT_GATES, 7);
    await row((row) => row.arm === 'paused');

    await press(producer, 'clear', 'next');

    expect(commandsReceived().slice(1)).toEqual([CLEAR, trigger(ANCIENT_GATES, 8)]);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 8 });
  });

  it.each([
    { button: 'next', index: 3 },
    { button: 'previous', index: 2 },
  ])("never pauses on the frame of $button's index trigger after a clear, past the window", async ({ button, index }) => {
    const { producer, clock, latest } = await afterTurnaround();
    clock.advance(PAST_WINDOW_MS);

    await press(producer, button);
    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(ANCIENT_GATES, index);

    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null, state: [expect.stringContaining('Ancient Gates / '), expect.any(String)] });
  });
});

// The pause by hand. Each test replays a recorded command and its status/slide frame with the gap
// the recording put between the command's answer and the frame (commands.json and
// stream-status-updates.json), by moving the adapter's clock between them. The fake answers every
// command at once, so its answer comes at the clock's time when it was sent.
const PRESSED_CHORUS = 438140;
const PRESSED_VERSE_3 = 448784;
// A slide with no words (as Intro, Turnaround and Ending are), and Verse 1 slide 2, each as a frame
// the recording holds; here each stands for a press by hand.
const PRESSED_BLANK = 291205;
const PRESSED_VERSE_1_SLIDE_2 = 224869;
// Verse 1 slide 1 and Verse 2 slide 1, as frames the recording holds.
const VERSE_1_SLIDE_1 = 408155;
const VERSE_2_SLIDE_1 = 227323;
// Past the window after a command's answer, by the adapter's clock.
const PAST_WINDOW_MS = 1500;
// Cold, a next-type command's frame came past the window (commands.json): the uuid next's, from
// Verse 1 slide 2 into Verse 2 slide 1, 1010 ms after its answer, and the global next's 1122 ms after.
const COLD_NEXT_FRAME_MS = 1010;
const COLD_BUTTON_FRAME_MS = 1122;
// How long after its answer a button's slide, or a trigger's, stays its own, by the adapter's clock.
const BUTTON_FRAME_MS = 3000;
// The pre-service items of listNovember8(): the Loop, 14 slides with no words, and the Countdown, one.
const LOOP = '15C678B7-4F41-4CD7-8280-E240623ECBA8';
const COUNTDOWN = 'DFF092C1-8840-49DC-9450-6F04A10FA358';
// Cue points that trigger There Is Freedom's Verse 1 at 16.
const VERSE_1_CUE_POINTS: CuePoint[] = [
  { name: '1 - Intro (There Is Freedom)', time: 0 },
  { name: '1 - Verse 1', time: 16 },
  { name: '1 - End', time: 32 },
];

describe('the pause by hand', () => {
  it('pauses ProPresenter on the recorded press of a Chorus slide by hand, shown as paused by hand, and triggers nothing until the producer arms it', async () => {
    const { producer, play, lead, row, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);

    clock.advance(PAST_WINDOW_MS);
    await pro!.send(PRESSED_CHORUS);
    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });

    // Into the chorus, paused.
    await play(16, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);

    producer.send({ kind: 'arm', target: 'propresenter' });
    expect(await row((row) => row.arm === 'armed')).toMatchObject({ arm: 'armed', pause: null });
    // The bar line after 32 is 36, so Live lands on the pre chorus, 16, and plays on a beat.
    await lead({ kind: 'jump', song: 1, section: 1 }, (snapshot) => snapshot.jump?.section === 1);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(5, 17);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5), trigger(THERE_IS_FREEDOM, 5)]);
  });

  it('pauses ProPresenter on the recorded press of a Verse 3 slide by hand after the Chorus trigger', async () => {
    const { play, row, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);

    clock.advance(PAST_WINDOW_MS);
    await pro!.send(PRESSED_VERSE_3);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("stays armed through the server's own slide change inside the triggered Chorus long after its trigger, and pauses on its first slide pressed by hand after it", async () => {
    const { play, row, latest, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);

    // The Chorus's 4 slides over its 4 bars: slide 2 a bar in, seconds after the trigger, and its
    // frame past the window.
    clock.advance(5000);
    await play(4, 36);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6), trigger(THERE_IS_FREEDOM, 7)]);
    clock.advance(PAST_WINDOW_MS);
    await pro!.send(264050);
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Chorus / slide 2'), expect.any(String)] });

    // Chorus slide 1, another slide of the same group, as a Go To Next timer or a press would bring it.
    clock.advance(2000);
    await pro!.send(CHORUS);
    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  // After the Chorus trigger's own frame inside its window, a press by hand outside the Chorus still
  // pauses: a slide with no words, which many groups hold, and Verse 1 slide 2, whose text Verse 4
  // shares with the Chorus slides.
  for (const [pressed, frame] of [
    ['a slide with no words', PRESSED_BLANK],
    ['Verse 1 slide 2', PRESSED_VERSE_1_SLIDE_2],
  ] as const) {
    it(`pauses ProPresenter on a press by hand of ${pressed} after the Chorus trigger's own frame`, async () => {
      const { play, row, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
      await pro!.streaming();
      await play(8, 32);
      expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
      clock.advance(358);
      await pro!.send(CHORUS);
      await row((row) => row.state.includes(CHORUS_TEXT[0]!));

      clock.advance(5000);
      await pro!.send(frame);

      expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
    });
  }

  // After the producer's Next slide brings Verse 1 slide 2, a slide four verses share, the expected
  // slides are Verse 1's alone, the first group that holds it: a press by hand of a slide with no
  // words or of a Chorus slide, which Verse 4 also holds, pauses.
  for (const [pressed, frame] of [
    ['a slide with no words', PRESSED_BLANK],
    ['a Chorus slide', CHORUS],
  ] as const) {
    it(`pauses ProPresenter on a press by hand of ${pressed} after the producer's Next slide brings a verse slide`, async () => {
      const { producer, play, row, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
      await pro!.streaming();
      await play(8, 32);
      expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
      clock.advance(PAST_WINDOW_MS);
      await press(producer, 'next');
      clock.advance(364);
      await pro!.send(PRESSED_VERSE_1_SLIDE_2);
      expect(await row((row) => row.state.some((line) => line.includes('Verse 1 / slide 2')))).toMatchObject({ arm: 'armed', pause: null });

      clock.advance(5000);
      await pro!.send(frame);

      expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
    });
  }

  it("pauses on a press by hand of the triggered Verse 2's first slide after Next slide brings its second, since the slide showing is the one expected", async () => {
    const verse: CuePoint[] = [
      { name: '1 - Intro (There Is Freedom)', time: 0 },
      { name: '1 - Verse 2', time: 16 },
      { name: '1 - End', time: 32 },
    ];
    const { producer, play, row, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: verse });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 3)]);
    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'next');
    clock.advance(364);
    await pro!.send(PRESSED_VERSE_1_SLIDE_2);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null });

    // Verse 2 slide 1, inside the triggered group, seconds later.
    clock.advance(5000);
    await pro!.send(227323);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("stays armed through the Chorus's first slide long after Previous slide brought a slide with no words, which leaves that slide expected", async () => {
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'previous');
    clock.advance(337);
    await pro!.send(PRESSED_BLANK);

    // Chorus slide 1, the slide the trigger brought, again.
    clock.advance(5000);
    await pro!.send(CHORUS);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: CHORUS_TEXT });
  });

  it("never pauses on the row's own buttons, each with its recorded frame the recorded gap after its answer", async () => {
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();
    // The Chorus trigger, whose frame never comes, and long enough after it that its window is over.
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
    clock.advance(PAST_WINDOW_MS);

    // Previous slide, then +337 ms a slide with no words, in no group of the Chorus.
    await press(producer, 'previous');
    clock.advance(337);
    await pro!.send(291205);
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: ['Current slide: (no words)', expect.any(String)] });

    // Next slide, then +364 ms Chorus slide 2.
    await press(producer, 'next');
    clock.advance(364);
    await pro!.send(264050);
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Chorus / slide 2'), expect.any(String)] });

    // Clear slide, then +200 ms the clear.
    await press(producer, 'clear');
    clock.advance(200);
    await pro!.send(158330);
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [] });
    expect(pro!.slideCommands()).toEqual([PREVIOUS, NEXT, CLEAR]);
  });

  it("never pauses on a cue's trigger or Fire again's, each with its recorded frame the recorded gap after its answer", async () => {
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();

    // The Chorus trigger, then +358 ms Chorus slide 1.
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
    clock.advance(358);
    await pro!.send(CHORUS);
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: CHORUS_TEXT });

    // Fire again, long after, then the same gap.
    clock.advance(PAST_WINDOW_MS);
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toHaveLength(2));
    await pro!.idle();
    clock.advance(358);
    await pro!.send(CHORUS);
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: CHORUS_TEXT });
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6), trigger(THERE_IS_FREEDOM, 6)]);
  });

  it("never pauses on the cold Bridge 1 trigger's frame, which came 1.7 s after its answer, past the window", async () => {
    const bridge: CuePoint[] = [
      { name: '1 - Chorus (There Is Freedom)', time: 0 },
      { name: '1 - Bridge 1', time: 16 },
      { name: '1 - End', time: 32 },
    ];
    const { play, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: bridge });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 20)]);

    clock.advance(1738);
    await pro!.send(137983);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Bridge 1 / slide 1'), expect.any(String)] });
  });

  // Each button expects the slide it moves to, by the slide showing when it is pressed, so its frame
  // into another group is its own even when a cold ProPresenter brings it past the window.
  it("never pauses on Next slide's frame into the next group, late past the window as the cold uuid next's came", async () => {
    const verse: CuePoint[] = [
      { name: '1 - Intro (There Is Freedom)', time: 0 },
      { name: '1 - Verse 1', time: 16 },
      { name: '1 - End', time: 32 },
    ];
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: verse });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
    clock.advance(358);
    await pro!.send(VERSE_1_SLIDE_1);
    // Verse 1 slide 2, the group's last, which the server sends 2 bars into the 4-bar Verse 1; its next
    // slide is Verse 2's first.
    clock.advance(5000);
    await play(8, 24);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1), trigger(THERE_IS_FREEDOM, 2)]);
    clock.advance(358);
    await pro!.send(PRESSED_VERSE_1_SLIDE_2);

    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'next');
    clock.advance(COLD_NEXT_FRAME_MS);
    await pro!.send(VERSE_2_SLIDE_1);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 2 / slide 1'), expect.any(String)] });
  });

  // A producer who sees nothing from a cold Next presses it again, so each press expects the slide
  // after the one the press before it expects.
  it("never pauses on two Next slides pressed before any frame, the second's frame crossing into the next group, late past the window", async () => {
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
    clock.advance(358);
    await pro!.send(VERSE_1_SLIDE_1);

    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'next');
    clock.advance(300);
    await press(producer, 'next');
    clock.advance(COLD_NEXT_FRAME_MS);
    await pro!.send(PRESSED_VERSE_1_SLIDE_2);
    clock.advance(200);
    await pro!.send(VERSE_2_SLIDE_1);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 2 / slide 1'), expect.any(String)] });
  });

  // The recorded cold active next moved ProPresenter with no frame for 8.2 s, so a producer who sees
  // the row stay stale presses Next again after the first press's expectation has run out.
  it("never pauses on a second Next slide pressed after a first that moved ProPresenter but brought no frame, the second's frame crossing into the next group", async () => {
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
    clock.advance(358);
    await pro!.send(VERSE_1_SLIDE_1);

    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'next');
    clock.advance(4000);
    await press(producer, 'next');
    clock.advance(COLD_NEXT_FRAME_MS);
    await pro!.send(VERSE_2_SLIDE_1);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 2 / slide 1'), expect.any(String)] });
  });

  it('moves a Next slide from the last frame, not from an earlier press whose frame showed another slide', async () => {
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
    clock.advance(358);
    await pro!.send(CHORUS);

    // Next from Chorus slide 1 expects Chorus slide 2, but its frame, inside the window, shows Verse 1
    // slide 2, whose next is Verse 2 slide 1.
    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'next');
    clock.advance(364);
    await pro!.send(PRESSED_VERSE_1_SLIDE_2);
    await press(producer, 'next');
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.send(VERSE_2_SLIDE_1);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 2 / slide 1'), expect.any(String)] });
  });

  it("never pauses on Previous slide's frame into the group before, late past the window", async () => {
    const bridge: CuePoint[] = [
      { name: '1 - Chorus (There Is Freedom)', time: 0 },
      { name: '1 - Bridge 1', time: 16 },
      { name: '1 - End', time: 32 },
    ];
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: bridge });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 20)]);
    clock.advance(1738);
    await pro!.send(137983);

    // Previous from Bridge 1 slide 1 brings Verse 4's last slide, which has no words, as recorded.
    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'previous');
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.send(PRESSED_BLANK);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: ['Current slide: (no words)', expect.any(String)] });
  });

  // The cold commands took up to 7.8 s at home, long enough for a press by hand, so a command still out
  // covers only the slides it may bring, and the window starts at its answer (setlist-controller#266,
  // L96).
  it('pauses on a press by hand while a slow button is out, onto a slide it cannot bring', async () => {
    const { producer, row, clock } = await armedRig({ position: 8 });
    await pro!.streaming();
    pro!.hang();
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'next' });
    await vi.waitFor(() => expect(pro!.slideCommands()).toHaveLength(1));
    clock.advance(5000);
    await pro!.send(CHORUS);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
    pro!.answer();
  });

  it('never pauses on a slide change just after a slow button is answered with a 2xx', async () => {
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
    clock.advance(358);
    await pro!.sendSlide(THERE_IS_FREEDOM, 1);
    clock.advance(PAST_WINDOW_MS);
    pro!.hang();
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'next' });
    await vi.waitFor(() => expect(pro!.slideCommands()).toHaveLength(1));
    clock.advance(5000);

    pro!.answer();
    await pro!.idle();
    clock.advance(364);
    await pro!.send(PRESSED_VERSE_3);

    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null, state: VERSE_3_TEXT });
  });

  it('pauses on a press by hand just after a button ProPresenter answered with nothing to move, as its answer opens no window', async () => {
    const { producer, row, clock } = await armedRig({ position: 8 });
    await pro!.streaming();
    await press(producer, 'next');
    await row((row) => row.state.includes(NOTHING_TO_MOVE.next));

    clock.advance(364);
    await pro!.send(PRESSED_VERSE_3);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  // A button that brings no frame, as the recorded global previous and uuid previous did, expects its
  // slide only for a bounded time after its answer, and not at all after an answer that moved nothing.
  it('pauses on a press by hand long after a Previous slide that brought no frame, onto a slide the Previous expected', async () => {
    const { producer, play, row, clock, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
    clock.advance(358);
    await pro!.send(CHORUS);

    // Previous from Chorus slide 1 expects, among others, the Verse slide 2 text Verses 1 to 4 share.
    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'previous');
    clock.advance(5000);
    await pro!.send(PRESSED_VERSE_1_SLIDE_2);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it('pauses on a press by hand onto the slide a Next slide expected, when ProPresenter answered that Next with nothing to move', async () => {
    const { producer, play, row, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
    clock.advance(358);
    await pro!.send(VERSE_1_SLIDE_1);
    clock.advance(5000);
    await pro!.send(PRESSED_VERSE_1_SLIDE_2);

    // Next expected Verse 2 slide 1, but ProPresenter answers 404 and moves nothing, and refuses the
    // press's crossing into Holy Forever, the next item, with a 404 too.
    clock.advance(PAST_WINDOW_MS);
    pro!.lastSlide();
    pro!.answerTriggers(404);
    await pressSending(producer, 'next', 2);
    await row((row) => row.state.includes(NOTHING_TO_MOVE.next));
    clock.advance(PAST_WINDOW_MS);
    await pro!.send(VERSE_2_SLIDE_1);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("stays armed through the index trigger's own frame past the window, and pauses on a press by hand of a slide in another group", async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { play, row, latest, clock, triggers } = await armedRig({ position: 8, playlist: NOVEMBER_8.id, cuePoints: ANCIENT_GATES_CUE_POINTS });
    await pro.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);

    // Verse 1 slide 1, the slide the trigger brings, past the window.
    clock.advance(PAST_WINDOW_MS);
    await pro.sendSlide(ANCIENT_GATES, 1);
    expect(await latest()).toMatchObject({
      arm: 'armed',
      pause: null,
      state: [
        'Current slide: Ancient Gates / Verse 1 / slide 1 line 1 / Ancient Gates / Verse 1 / slide 1 line 2',
        'Next slide: Ancient Gates / Verse 1 / slide 2 line 1 / Ancient Gates / Verse 1 / slide 2 line 2',
      ],
    });

    // Chorus 1 slide 1, pressed by hand.
    clock.advance(PAST_WINDOW_MS);
    await pro.sendSlide(ANCIENT_GATES, 5);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("never pauses on the server's own clear or on the recorded clear's frames, blanks the slide text at its answer, and pauses on a slide pressed by hand after it", async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { play, row, next, latest, clock, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await pro.streaming();
    await play(4, 16);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1)]);
    clock.advance(358);
    await pro.sendSlide(ANCIENT_GATES, 1);
    await row((row) => row.state.length > 0);

    // Into the Turnaround, long after: the fake answers the clear 204 and sends no frame, and the row
    // drops the slide text at once.
    clock.advance(PAST_WINDOW_MS);
    const blank = next((snapshot) => proRow(snapshot)?.state.length === 0);
    await play(8, 24);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), CLEAR]);
    expect(proRow(await blank)).toMatchObject({ connection: 'online', arm: 'armed', pause: null, state: [] });

    // The recorded clear's status/slide, with no current slide, and its presentation/current, with no
    // presentation, each past the window.
    clock.advance(PAST_WINDOW_MS);
    await pro.send(158330);
    clock.advance(PAST_WINDOW_MS);
    await pro.send(158238);
    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null, state: [] });

    // The clear expects no slide, so Verse 1 slide 1 showing past the window is a press by hand.
    clock.advance(PAST_WINDOW_MS);
    await pro.sendSlide(ANCIENT_GATES, 1);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it('leaves no window open after a trigger that brings no frame, as the recorded Pre Chorus trigger did, so a press by hand long after pauses', async () => {
    const { play, row, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 5)]);

    clock.advance(8000);
    await pro!.heartbeat();
    clock.advance(8000);
    await pro!.heartbeat();
    expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null });

    await pro!.send(PRESSED_VERSE_1_SLIDE_2);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("keeps Verse 3's slide text when the Interlude's clear is answered after Verse 3's cue was handed", async () => {
    // There Is Freedom has no Interlude group, so its Interlude clears; Verse 3 triggers slide 11.
    const interlude: CuePoint[] = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - Chorus', time: 16 },
      { name: '1 - Interlude', time: 32 },
      { name: '1 - Verse 3', time: 40 },
      { name: '1 - End', time: 56 },
    ];
    const { play, latest, sent } = await armedRig({ position: 24, playlist: OCTOBER_25.id, cuePoints: interlude });
    await pro!.streaming();

    // The Interlude's clear is held, and Verse 3's cue is handed while it is out, so its trigger waits
    // for the clear's answer. Verse 3's slide shows first.
    const cues = () => pro!.requests.map(({ path }) => path).filter((path) => path === CLEAR || path === trigger(THERE_IS_FREEDOM, 11));
    pro!.hang();
    await play(8, 32);
    await vi.waitFor(() => expect(cues()).toEqual([CLEAR]));
    await play(8, 40);
    await pro!.sendSlide(THERE_IS_FREEDOM, 11);
    expect((await latest()).state.length).toBeGreaterThan(0);
    expect(cues()).toEqual([CLEAR]);

    // The clear's 204 comes back after Verse 3's cue was handed: it is no longer the latest command.
    pro!.answer();
    await vi.waitFor(async () => expect(await sent()).toEqual([CLEAR, trigger(THERE_IS_FREEDOM, 11)]));

    expect((await latest()).state.length).toBeGreaterThan(0);
  });

  // The edge cases of setlist-controller#266, each a press by hand that did not pause or the server's
  // own change that did.
  describe('after Arm', () => {
    // L97: Arm hands the screen back to the server, so the slide the operator pressed is no longer the
    // one it expects. Verse 4 slide 2 holds the text of Verse 1 slide 2.
    it('pauses on a press by hand after Arm onto another slide with the text of the slide the operator pressed before it', async () => {
      const { producer, play, next, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
      await pro!.streaming();
      await play(8, 16);
      expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
      clock.advance(358);
      await pro!.sendSlide(THERE_IS_FREEDOM, 1);

      // Verse 1 slide 2, pressed by hand.
      const paused = next((snapshot) => proRow(snapshot)?.arm === 'paused');
      clock.advance(PAST_WINDOW_MS);
      await pro!.sendSlide(THERE_IS_FREEDOM, 2);
      await paused;
      const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await armed;

      // Verse 4 slide 2, the same text on another slide, pressed by hand.
      const pausedAgain = next((snapshot) => proRow(snapshot)?.arm === 'paused');
      clock.advance(PAST_WINDOW_MS);
      await pro!.sendSlide(THERE_IS_FREEDOM, 14);

      expect(proRow(await pausedAgain)).toMatchObject({ arm: 'paused', pause: 'by-hand' });
    });

    // The real stream repeats a slide, with its UUID, as it repeated Verse 2 slide 1 at t 227323,
    // 243448 and 248770, so a repeat of the slide the operator pressed is no new press.
    it('stays armed after Arm through the recorded repeats of the slide the operator pressed', async () => {
      const { producer, play, next, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
      await pro!.streaming();
      await play(8, 16);
      expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
      const paused = next((snapshot) => proRow(snapshot)?.arm === 'paused');
      clock.advance(PAST_WINDOW_MS);
      await pro!.send(VERSE_2_SLIDE_1);
      await paused;
      const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await armed;

      clock.advance(PAST_WINDOW_MS);
      await pro!.send(243448);
      clock.advance(PAST_WINDOW_MS);
      await pro!.send(248770);

      expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 2 / slide 1'), expect.any(String)] });
    });

    // L101: the 8 November playlist opens with the pre-service Loop, 14 slides with no words that
    // advance on timers by design, and the Countdown, one more.
    it("stays armed through the pre-service Loop's timers before the first cue, and again after Arm, but pauses on a slide with words pressed by hand", async () => {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      const { producer, next, latest, clock } = await armedRig({ position: 0, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
      await pro.streaming();

      for (let index = 0; index < 14; index += 1) {
        clock.advance(BUTTON_FRAME_MS + PAST_WINDOW_MS);
        await pro.sendSlide(LOOP, index);
      }
      clock.advance(BUTTON_FRAME_MS + PAST_WINDOW_MS);
      await pro.sendSlide(COUNTDOWN, 0);
      expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: ['Current slide: (no words)'] });

      // Ancient Gates' Verse 1 slide 1, pressed by hand.
      const paused = next((snapshot) => proRow(snapshot)?.arm === 'paused');
      clock.advance(PAST_WINDOW_MS);
      await pro.sendSlide(ANCIENT_GATES, 1);
      expect(proRow(await paused)).toMatchObject({ arm: 'paused', pause: 'by-hand' });

      // Armed again, before any cue: the Loop's next slide on its timer.
      const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await armed;
      clock.advance(PAST_WINDOW_MS);
      await pro.sendSlide(LOOP, 0);

      expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: ['Current slide: (no words)', 'Next slide: (no words)'] });
    });

    it('pauses on a slide with no words pressed by hand after Arm once ProPresenter has taken a cue since', async () => {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      const { producer, play, next, clock, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
      await pro.streaming();
      const paused = next((snapshot) => proRow(snapshot)?.arm === 'paused');
      clock.advance(PAST_WINDOW_MS);
      await pro.sendSlide(ANCIENT_GATES, 1);
      await paused;
      const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await armed;
      await play(4, 16);
      expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1)]);

      // The Loop's first slide, pressed by hand.
      const pausedAgain = next((snapshot) => proRow(snapshot)?.arm === 'paused');
      clock.advance(PAST_WINDOW_MS);
      await pro.sendSlide(LOOP, 0);

      expect(proRow(await pausedAgain)).toMatchObject({ arm: 'paused', pause: 'by-hand' });
    });

    // The operator goes back to the pre-service loop after the set, and the producer arms ProPresenter
    // for the next service: until it takes a cue again, the loop's timers are not presses by hand.
    it("stays armed through the Loop's timers after Arm, when ProPresenter took a cue before the pause", async () => {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      const { producer, play, next, latest, clock, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
      await pro.streaming();
      await play(4, 16);
      expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1)]);
      const paused = next((snapshot) => proRow(snapshot)?.arm === 'paused');
      clock.advance(PAST_WINDOW_MS);
      await pro.sendSlide(LOOP, 0);
      await paused;
      const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await armed;

      clock.advance(BUTTON_FRAME_MS + PAST_WINDOW_MS);
      await pro.sendSlide(LOOP, 1);

      expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: ['Current slide: (no words)', 'Next slide: (no words)'] });
    });
  });

  // L98: a trigger ProPresenter refuses moved nothing, so its slide is not on the screen.
  it('pauses on a press by hand onto the slide of a trigger ProPresenter refused', async () => {
    const { play, row, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
    clock.advance(358);
    await pro!.sendSlide(THERE_IS_FREEDOM, 1);
    // Verse 1 slide 2, 2 bars in, refused.
    clock.advance(5000);
    pro!.answerTriggers(404);
    await play(8, 24);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1), trigger(THERE_IS_FREEDOM, 2)]);
    await row((row) => row.state.some((line) => line.startsWith('Trigger refused for There Is Freedom')));

    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 2);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it('pauses on a press by hand just after a trigger ProPresenter refused, as its answer opens no window', async () => {
    const { play, row, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
    clock.advance(358);
    await pro!.sendSlide(THERE_IS_FREEDOM, 1);
    clock.advance(5000);
    pro!.answerTriggers(404);
    await play(8, 24);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1), trigger(THERE_IS_FREEDOM, 2)]);
    await row((row) => row.state.some((line) => line.startsWith('Trigger refused for There Is Freedom')));

    // Verse 3 slide 1, 300 ms after the refusal.
    clock.advance(300);
    await pro!.sendSlide(THERE_IS_FREEDOM, 11);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  // L96: a cold trigger was out up to 7.8 s at home, long enough for a press by hand.
  describe('while a trigger is out', () => {
    // A rig with Verse 1 slide 1 triggered and shown, then Verse 1 slide 2's trigger out, held with no
    // answer, long after.
    async function triggerOut() {
      const started = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
      await pro!.streaming();
      await started.play(8, 16);
      expect(await started.triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
      started.clock.advance(358);
      await pro!.sendSlide(THERE_IS_FREEDOM, 1);
      started.clock.advance(PAST_WINDOW_MS);
      pro!.hang();
      await started.play(8, 24);
      await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1), trigger(THERE_IS_FREEDOM, 2)]));
      started.clock.advance(5000);
      return started;
    }

    it('pauses on a press by hand onto another slide before the trigger is answered', async () => {
      const { row } = await triggerOut();

      await pro!.sendSlide(THERE_IS_FREEDOM, 11);

      expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
      pro!.answer();
    });

    // A press by hand while the trigger is out pauses, and Arm then expects no slide, so only the
    // trigger's own slide, kept while it is out, covers its late frame, and only the repeat covers that
    // frame's repeat once the trigger's slide is no longer its own.
    it("never pauses on the trigger's own slide before it is answered, after a press by hand and Arm while it is out, nor on its repeat after", async () => {
      const { producer, next, latest, clock } = await triggerOut();

      const paused = next((snapshot) => proRow(snapshot)?.arm === 'paused');
      await pro!.sendSlide(THERE_IS_FREEDOM, 11);
      expect(proRow(await paused)).toMatchObject({ arm: 'paused', pause: 'by-hand' });
      const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await armed;

      clock.advance(PAST_WINDOW_MS);
      await pro!.sendSlide(THERE_IS_FREEDOM, 2);
      expect(await latest()).toMatchObject({ arm: 'armed', pause: null });
      pro!.answer();
      await pro!.idle();
      clock.advance(BUTTON_FRAME_MS + PAST_WINDOW_MS);
      await pro!.sendSlide(THERE_IS_FREEDOM, 2);

      expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 1 / slide 2'), expect.any(String)] });
    });

    // L120 with the stream repeating the slide before while the trigger is out, as it repeated a slide
    // with one UUID 16.1 s and 5.3 s apart: the repeat is no frame of the trigger's, so the trigger's
    // 2xx with no frame still puts the place on its slide.
    it("never pauses on Next slide's late frame after the trigger is accepted with no frame, when the slide before repeated while it was out", async () => {
      const { producer, latest, clock } = await triggerOut();

      await pro!.sendSlide(THERE_IS_FREEDOM, 1);
      expect(await latest()).toMatchObject({ arm: 'armed', pause: null });
      pro!.answer();
      await pro!.idle();
      clock.advance(PAST_WINDOW_MS);
      await press(producer, 'next');
      clock.advance(COLD_NEXT_FRAME_MS);
      await pro!.sendSlide(THERE_IS_FREEDOM, 3);

      expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 2 / slide 1'), expect.any(String)] });
    });
  });

  // L120: an index trigger of the slide already showing brought no frame, and some cold triggers none
  // (2026-11-02), so after an accepted trigger the adapter is on its slide, frame or not.
  it("never pauses on Next slide's late frame after a trigger ProPresenter accepted with no frame, moving on from the trigger's slide", async () => {
    const { producer, play, latest, clock, triggers } = await armedRig({ position: 8, playlist: OCTOBER_25.id, cuePoints: VERSE_1_CUE_POINTS });
    await pro!.streaming();
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1)]);
    clock.advance(358);
    await pro!.sendSlide(THERE_IS_FREEDOM, 1);
    // Verse 1 slide 2, accepted, with no frame.
    clock.advance(5000);
    await play(8, 24);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 1), trigger(THERE_IS_FREEDOM, 2)]);

    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'next');
    clock.advance(COLD_NEXT_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 3);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 2 / slide 1'), expect.any(String)] });
  });

  // L121: before the first cue no presentation has been triggered, so Previous slide takes the slide
  // before from the presentations of the picked playlist.
  it("never pauses on Previous slide's late frame after Arm, before any cue, from a song slide shown while disarmed", async () => {
    const { producer, row, latest, clock } = await proRig({ cuePoints: VERSE_1_CUE_POINTS });
    await row((row) => row.connection === 'online' && (row.pick?.options.length ?? 0) > 0);
    producer.send({ kind: 'pick', target: 'propresenter', choice: OCTOBER_25.id });
    await row((row) => row.pick?.picked?.id === OCTOBER_25.id);
    await pro!.idle();
    await pro!.streaming();
    // Verse 2 slide 1, put up while disarmed.
    await pro!.sendSlide(THERE_IS_FREEDOM, 3);
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');

    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'previous');
    expect(pro!.showing()).toEqual({ uuid: THERE_IS_FREEDOM, index: 2 });
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 2);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 1 / slide 2'), expect.any(String)] });
  });
});

// Four songs in 4/4 at 120 BPM, for the pre-service check: There Is Freedom, as the October 25
// playlist has it, with a Count Off and an Outro with no group of their names, a section in other
// letter case than its group, and an End that clears after its Outro cleared, though the
// presentation has an Ending group; House of the Lord, whose item in
// October 11 is "House of the Lord - [ Full ]" and whose presentation has a Chorus and an Ending group
// for its End; Prayer, a placeholder in October 25; and a song in no playlist.
const CHECKED_SET: CuePoint[] = [
  { name: '1 - Count Off (There Is Freedom)', time: 0 },
  { name: '1 - Verse 1', time: 8 },
  { name: '1 - pre chorus', time: 24 },
  { name: '1 - Chorus', time: 40 },
  { name: '1 - Outro', time: 56 },
  { name: '1 - End', time: 72 },
  { name: '2 - Chorus (House of the Lord)', time: 72 },
  { name: '2 - End', time: 88 },
  { name: '3 - Verse (Prayer)', time: 88 },
  { name: '3 - End', time: 104 },
  { name: '4 - Verse 1 (No Such Song)', time: 104 },
  { name: '4 - End', time: 120 },
];

// A check with lines it cannot match and no problem or note; one with problems (under "Problems:"),
// lines it cannot match (under "Cannot match:") and notes (under "Notes:"); and a matched check with
// its notes, each with its keys in the order the row keeps them.
const unmatched = (...names: string[]): PreServiceCheck => ({ kind: 'unmatched', names, problems: [], notes: [] });
const fileCheck = ({ names = [], problems = [], notes = [] }: { names?: string[]; problems?: string[]; notes?: string[] }): PreServiceCheck => ({ kind: 'unmatched', names, problems, notes });
const matched = (...notes: string[]): PreServiceCheck => ({ kind: 'matched', passText: 'Every song and section matches.', notes });
const NO_PLAYLIST_PICKED = fileCheck({ problems: ['no playlist picked'] });
// The check of CHECKED_SET against each recorded playlist, as recorded.
const OCTOBER_25_LINES = fileCheck({
  names: ['House of the Lord: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
  notes: ['There Is Freedom: no group Count Off, shows slide 1', 'There Is Freedom: no group Outro, clears', 'There Is Freedom: no group End, clears'],
});
const OCTOBER_11_LINES = fileCheck({
  names: ['There Is Freedom: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
  problems: ['House of the Lord: not authorized in ProPresenter'],
});
const sameCheck = (check: PreServiceCheck) => (row: Connection) => JSON.stringify(row.check) === JSON.stringify(check);

// Whether the row's check is the one before a pick: no playlist picked, first, and after it only the
// slide timing file's own problems, such as a title that matches no song in the set or the libraries.
const beforePick = (row: Connection) => row.check.kind === 'unmatched' && row.check.problems[0] === 'no playlist picked' && row.check.names.length === 0 && row.check.notes.length === 0;

// A rig on the set given, ProPresenter online with its playlists listed, and the producer's pick of
// the playlist, once ProPresenter's row shows a check run after it. slideTiming and setup are as for
// proRig.
async function pickedRig(playlist: string, cuePoints: CuePoint[] = CHECKED_SET, slideTiming?: string, setup?: LiveSetup) {
  const started = await proRig({ cuePoints, slideTiming, ...(setup && { setup }) });
  await started.row((row) => row.connection === 'online' && (row.pick?.options.length ?? 0) > 0 && beforePick(row));
  started.producer.send({ kind: 'pick', target: 'propresenter', choice: playlist });
  const shown = await started.row((row) => row.pick?.picked?.id === playlist && row.check.kind !== 'not-checked' && !beforePick(row));
  return { ...started, shown };
}

describe('the pre-service check', () => {
  it('says no playlist picked, as a problem and not a line it cannot match, until the producer picks one, on the producer row and the setup screen', async () => {
    const { row } = await proRig({ cuePoints: CHECKED_SET });

    const shown = await row((row) => row.connection === 'online' && row.check.kind !== 'not-checked');

    expect(shown.check).toEqual(NO_PLAYLIST_PICKED);
    const status = await rig!.connectionsStatus(({ connections }) => connections.some((row) => row.name === 'propresenter' && row.check.kind !== 'not-checked'));
    expect(status.connections.find((row) => row.name === 'propresenter')?.check).toEqual(NO_PLAYLIST_PICKED);
  });

  it('notes each section with no group of its name, Count Off included, and names each song with no presentation, a placeholder included, on the producer row and the setup screen', async () => {
    const { shown } = await pickedRig(OCTOBER_25.id);

    expect(shown.check).toEqual(OCTOBER_25_LINES);
    const status = await rig!.connectionsStatus(({ connections }) => connections.some((row) => row.name === 'propresenter' && sameCheck(OCTOBER_25_LINES)(row)));
    expect(status.connections.find((row) => row.name === 'propresenter')?.check).toEqual(OCTOBER_25_LINES);
  });

  it("names the quiet status stream first among the problems while it is quiet, ahead of the playlist's own, until a heartbeat comes", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { clock, row } = await pickedRig(OCTOBER_11.id);
    await row(sameCheck(OCTOBER_11_LINES));
    await pro!.streaming();
    pro!.loseHeartbeat();
    const quiet = fileCheck({
      names: ['There Is Freedom: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
      problems: ["ProPresenter's status stream is quiet: quit and reopen ProPresenter before the service.", 'House of the Lord: not authorized in ProPresenter'],
    });

    clock.advance(10_000);
    expect((await row(sameCheck(quiet))).check).toEqual(quiet);

    await pro!.streaming();
    await pro!.heartbeat();
    expect((await row(sameCheck(OCTOBER_11_LINES))).check).toEqual(OCTOBER_11_LINES);
  });

  it('notes a section the song repeats once, under the name its first occurrence carries, and the check reads as matched', async () => {
    const repeats: CuePoint[] = [
      { name: '1 - Count Off (There Is Freedom)', time: 0 },
      { name: '1 - Chorus', time: 8 },
      { name: '1 - Outro', time: 24 },
      { name: '1 - Verse 1', time: 32 },
      { name: '1 - outro', time: 48 },
      { name: '1 - End', time: 56 },
    ];

    const { shown } = await pickedRig(OCTOBER_25.id, repeats);

    expect(shown.check).toEqual(matched('There Is Freedom: no group Count Off, shows slide 1', 'There Is Freedom: no group Outro, clears', 'There Is Freedom: no group End, clears'));
  });

  it("notes a section the song repeats once for each thing it does, when it comes both before and after the song's first section with a group", async () => {
    const repeats: CuePoint[] = [
      { name: '1 - Count Off (There Is Freedom)', time: 0 },
      { name: '1 - Outro', time: 8 },
      { name: '1 - Chorus', time: 16 },
      { name: '1 - Outro', time: 32 },
      { name: '1 - End', time: 40 },
    ];

    const { shown } = await pickedRig(OCTOBER_25.id, repeats);

    expect(shown.check).toEqual(
      matched('There Is Freedom: no group Count Off, shows slide 1', 'There Is Freedom: no group Outro, shows slide 1', 'There Is Freedom: no group Outro, clears', 'There Is Freedom: no group End, clears'),
    );
  });

  it("says what each section with no group of its name does: shows slide 1 before the song's first section with a group, and clears after it, as an End with neither an End nor an Ending group does", async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();

    const { shown } = await pickedRig(NOVEMBER_8.id, NOVEMBER_8_CUE_POINTS);

    expect(shown.check).toEqual(
      matched(
        'Ancient Gates: no group Count Off, shows slide 1',
        'Ancient Gates: no group Intro, shows slide 1',
        'Ancient Gates: no group Turnaround, clears',
        'Ancient Gates: no group Interlude, clears',
        'Ancient Gates: no group End, clears',
        'Holy Forever: no group Count Off, shows slide 1',
        // Live sits in Ancient Gates, so Holy Forever's bars are not judged: a note after the song's
        // group lines, where its "changed on beats" notes would go.
        'Holy Forever: meter not read yet',
        // Its two groups with no name hold words no section reaches, a note each, last. Ancient Gates'
        // group with no name holds none.
        'Holy Forever: unnamed group 11 (1 slide), no section shows it',
        'Holy Forever: unnamed group 12 (2 slides), no section shows it',
      ),
    );
  });

  it('notes a name whose count of sections differs from its count of groups once, as a note and not a problem, as Holy Forever repeats its one Chorus 1 group', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const holyForever: CuePoint[] = [
      { name: '1 - Count Off (Holy Forever)', time: 0 },
      { name: '1 - Verse 1', time: 8 },
      { name: '1 - Pre Chorus 1', time: 24 },
      { name: '1 - Chorus 1', time: 32 },
      { name: '1 - Chorus 1', time: 48 },
      { name: '1 - Chorus 1', time: 64 },
      { name: '1 - End', time: 80 },
    ];

    const { shown } = await pickedRig(NOVEMBER_8.id, holyForever);

    expect(shown.check).toEqual(
      matched(
        'Holy Forever: no group Count Off, shows slide 1',
        'Holy Forever: 3 sections Chorus 1, 1 group',
        'Holy Forever: unnamed group 11 (1 slide), no section shows it',
        'Holy Forever: unnamed group 12 (2 slides), no section shows it',
      ),
    );
  });

  it('notes fewer sections of a name than groups, none for equal counts, and still notes a missing End last, as Worthy Of It All has five Chorus groups', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    // 8-bar Choruses, so the first Chorus group's 4 slides go on bars.
    const worthy: CuePoint[] = [
      { name: '1 - Verse 1 (Worthy Of It All)', time: 0 },
      { name: '1 - Chorus', time: 16 },
      { name: '1 - Verse 1', time: 48 },
      { name: '1 - Chorus', time: 64 },
      { name: '1 - End', time: 96 },
    ];

    const { shown } = await pickedRig(NOVEMBER_8.id, worthy);

    expect(shown.check).toEqual(matched('Worthy Of It All: 2 sections Chorus, 5 groups', 'Worthy Of It All: no group End, clears'));
  });

  it('notes an End whose presentation has neither an End nor an Ending group', async () => {
    pro = await startFakeProPresenter();
    pro.renameGroup(THERE_IS_FREEDOM, 'Ending', 'Coda');

    const { shown } = await pickedRig(OCTOBER_25.id);

    expect(shown.check).toEqual(
      fileCheck({
        names: ['House of the Lord: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
        notes: ['There Is Freedom: no group Count Off, shows slide 1', 'There Is Freedom: no group Outro, clears', 'There Is Freedom: no group End, clears'],
      }),
    );
  });

  it('says a presentation this Mac is not authorized for is not authorized, as a problem and with no group lines for its song, on the producer row and the setup screen', async () => {
    const { shown } = await pickedRig(OCTOBER_11.id);

    expect(shown.check).toEqual(OCTOBER_11_LINES);
    const status = await rig!.connectionsStatus(({ connections }) => connections.some((row) => row.name === 'propresenter' && sameCheck(OCTOBER_11_LINES)(row)));
    expect(status.connections.find((row) => row.name === 'propresenter')?.check).toEqual(OCTOBER_11_LINES);
  });

  it("matches a song on the presentation's own name, so the item House of the Lord - [ Full ] matches, and says its arrangement is not Master once it is authorized, as a problem and with no group lines for its song", async () => {
    pro = await startFakeProPresenter();
    pro.authorize(HOUSE_OF_THE_LORD);
    // A section House of the Lord's presentation has no group of, which would name a line on Master.
    const offMaster = CHECKED_SET.map((point) => (point.name === '2 - Chorus (House of the Lord)' ? { ...point, name: '2 - Coda (House of the Lord)' } : point));

    const { shown } = await pickedRig(OCTOBER_11.id, offMaster);

    expect(shown.check).toEqual(
      fileCheck({
        names: ['There Is Freedom: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
        problems: ['House of the Lord: arrangement Full in ProPresenter, not Master'],
      }),
    );
  });

  it('says a song whose playlist item has no presentation linked has no presentation', async () => {
    pro = await startFakeProPresenter();
    pro.beforeSongsResolved();
    pro.authorize(HOUSE_OF_THE_LORD);

    const { shown } = await pickedRig(OCTOBER_11.id);

    expect(shown.check).toEqual(unmatched('There Is Freedom: no presentation or playlist item of its name', 'House of the Lord: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'));
  });

  it('matches when every song has its presentation and every section its group', async () => {
    const matching: CuePoint[] = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - Pre Chorus', time: 16 },
      { name: '1 - chorus', time: 32 },
    ];

    const { shown } = await pickedRig(OCTOBER_25.id, matching);

    expect(shown.check).toEqual(matched());
  });

  it("matches a song by its playlist item's name when its presentation's own name differs, and checks its groups as any song's (setlist-controller#579)", async () => {
    pro = await startFakeProPresenter();
    pro.renamePresentation(THERE_IS_FREEDOM, 'There Is Freedom (Live)');

    const { shown } = await pickedRig(OCTOBER_25.id, [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - Pre Chorus', time: 16 },
      { name: '1 - Outro', time: 32 },
    ]);

    expect(shown.check).toEqual(matched('There Is Freedom: no group Outro, clears'));
  });

  it('says a song matches neither a presentation nor a playlist item of its name (setlist-controller#579)', async () => {
    pro = await startFakeProPresenter();
    pro.renamePresentation(THERE_IS_FREEDOM, 'There Is Freedom (Live)');
    pro.renameItem(OCTOBER_25.id, THERE_IS_FREEDOM, 'Freedom');

    const { shown } = await pickedRig(OCTOBER_25.id, [{ name: '1 - Verse 1 (There Is Freedom)', time: 0 }]);

    expect(shown.check).toEqual(unmatched('There Is Freedom: no presentation or playlist item of its name'));
  });

  it('says a picked playlist ProPresenter no longer has could not be read, with no lines for its songs', async () => {
    const statePath = join(await newFolder(), 'propresenter-picks.json');
    const first = await proRig({ cuePoints: CHECKED_SET, statePath });
    const { set } = await first.producer.snapshot(loaded);
    await rig!.close();
    rig = undefined;
    await picksStore(statePath).save(set!, { id: '00000000-0000-0000-0000-000000000000', name: 'Gone Playlist' });

    const { row } = await proRig({ cuePoints: CHECKED_SET, statePath });

    const gone = fileCheck({ problems: ['Gone Playlist: could not be read from ProPresenter'] });
    expect((await row(sameCheck(gone))).check).toEqual(gone);
    const status = await rig!.connectionsStatus(({ connections }) => connections.some((row) => row.name === 'propresenter' && sameCheck(gone)(row)));
    expect(status.connections.find((row) => row.name === 'propresenter')?.check).toEqual(gone);
  });

  it('asks again for a presentation whose read answers 500 once, so its song matches with no line of its own', async () => {
    pro = await startFakeProPresenter();
    pro.answerReads(THERE_IS_FREEDOM, 500);

    const { shown } = await pickedRig(OCTOBER_25.id);

    expect(shown.check).toEqual(OCTOBER_25_LINES);
    expect(pro.requests.filter(({ path }) => path === `/v1/presentation/${THERE_IS_FREEDOM}`).length).toBeGreaterThanOrEqual(2);
  });

  it('says a presentation whose read answers 500 on every try could not be read, naming the song and the status, as a problem and not a line it cannot match', async () => {
    pro = await startFakeProPresenter();
    pro.answerReads(THERE_IS_FREEDOM, 500, 500, 500);

    const { shown } = await pickedRig(OCTOBER_25.id);

    expect(shown.check).toEqual(
      fileCheck({
        names: ['House of the Lord: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
        problems: ['There Is Freedom: presentation could not be read, ProPresenter answered 500; press Refresh'],
      }),
    );
    expect(pro.requests.filter(({ path }) => path === `/v1/presentation/${THERE_IS_FREEDOM}`)).toHaveLength(3);
  });

  // The song's own presentation may be the one that could not be read, so another item that only carries the song's
  // title does not stand in for it: the problem stays, and a Refresh may read the song's own (setlist-controller#579).
  it("keeps the could-not-be-read problem of a song whose item failed its read, over another item that carries the song's title", async () => {
    pro = await startFakeProPresenter();
    pro.answerReads(THERE_IS_FREEDOM, 500, 500, 500);
    pro.renameItem(OCTOBER_25.id, LOOP, 'There Is Freedom');

    const { shown } = await pickedRig(OCTOBER_25.id);

    expect(shown.check).toEqual(
      fileCheck({
        names: ['House of the Lord: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
        problems: ['There Is Freedom: presentation could not be read, ProPresenter answered 500; press Refresh'],
      }),
    );
  });

  it("names a song whose read kept failing by its playlist item's name less the arrangement, so the item House of the Lord - [ Full ] names House of the Lord", async () => {
    pro = await startFakeProPresenter();
    pro.answerReads(HOUSE_OF_THE_LORD, 503, 503, 503);

    const { shown } = await pickedRig(OCTOBER_11.id);

    expect(shown.check).toEqual(
      fileCheck({
        names: ['There Is Freedom: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'],
        problems: ['House of the Lord: presentation could not be read, ProPresenter answered 503; press Refresh'],
      }),
    );
  });

  it('asks once for a presentation whose read answers 404, and says its song has no presentation', async () => {
    pro = await startFakeProPresenter();
    pro.answerReads(THERE_IS_FREEDOM, 404);

    const { shown } = await pickedRig(OCTOBER_25.id);

    expect(shown.check).toEqual(unmatched('There Is Freedom: no presentation or playlist item of its name', 'House of the Lord: no presentation or playlist item of its name', 'Prayer: no presentation or playlist item of its name', 'No Such Song: no presentation or playlist item of its name'));
    expect(pro.requests.filter(({ path }) => path === `/v1/presentation/${THERE_IS_FREEDOM}`)).toHaveLength(1);
  });

  it('runs again on each pick, against the playlist picked', async () => {
    const { producer, row, shown } = await pickedRig(OCTOBER_25.id);
    expect(shown.check).toEqual(OCTOBER_25_LINES);
    const before = pro!.requests.length;

    producer.send({ kind: 'pick', target: 'propresenter', choice: OCTOBER_11.id });

    await row(sameCheck(OCTOBER_11_LINES));
    expect(pro!.requests.slice(before).map(({ path }) => path)).toContain(`/v1/playlist/${OCTOBER_11.id}`);
  });

  it('shows the notes for expected behaviour under "Notes:", after "Cannot match:", which holds only what cannot match', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const withMissing: CuePoint[] = [...NOVEMBER_8_CUE_POINTS, { name: '3 - Verse 1 (No Such Song)', time: 72 }, { name: '3 - End', time: 88 }];

    const { shown } = await pickedRig(NOVEMBER_8.id, withMissing);
    const markup = renderToStaticMarkup(createElement(CheckResult, { check: shown.check }));
    const text = markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const listed = (className: string) => [...markup.matchAll(new RegExp(`<li class="${className}">([^<]*)</li>`, 'g'))].map(([, line]) => line);

    expect(listed('check-unmatched-name')).toEqual(['No Such Song: no presentation or playlist item of its name']);
    expect(listed('check-note')).toEqual([
      'Ancient Gates: no group Count Off, shows slide 1',
      'Ancient Gates: no group Intro, shows slide 1',
      'Ancient Gates: no group Turnaround, clears',
      'Ancient Gates: no group Interlude, clears',
      'Ancient Gates: no group End, clears',
      'Holy Forever: no group Count Off, shows slide 1',
      'Holy Forever: meter not read yet',
      UNNAMED_11,
      UNNAMED_12,
    ]);
    expect(text).toMatch(/^Cannot match: No Such Song: no presentation or playlist item of its name Notes: Ancient Gates: no group Count Off, shows slide 1 /);
  });

  // Each song is judged on bars by the time signature Live reported while the playhead sat inside it
  // (setlist-controller#293): Ancient Gates in 6/8, a bar of 3 quarter-note beats, whose 9-beat Verse 3
  // is 3 bars for its 3 slides, then Holy Forever in 4/4, whose 12-beat Verse 1 is 3 bars for its 4.
  describe("each song's own meter", () => {
    const notesOf = (check: PreServiceCheck) => ('notes' in check ? check.notes : []);
    const onBeatsLines = (check: PreServiceCheck) => notesOf(check).filter((line) => line.endsWith('changed on beats'));
    const meterLines = (check: PreServiceCheck) => notesOf(check).filter((line) => line.endsWith('meter not read yet'));
    const timingProblems = (check: PreServiceCheck) => (check.kind === 'unmatched' ? check.problems.filter((line) => line.includes('slide timing')) : []);
    const same = (lines: string[], expected: string[]) => JSON.stringify(lines) === JSON.stringify(expected);

    const MIXED_METERS: CuePoint[] = [
      { name: '1 - Count Off (Ancient Gates)', time: 0 },
      { name: '1 - Verse 1', time: 6 },
      { name: '1 - Verse 3', time: 18 },
      { name: '1 - End', time: 27 },
      { name: '2 - Count Off (Holy Forever)', time: 32 },
      { name: '2 - Verse 1', time: 40 },
      { name: '2 - End', time: 52 },
    ];
    const HOLY_FOREVER_ON_BEATS = 'Holy Forever: Verse 1 has 4 slides in 3 bars, changed on beats';
    const HOLY_FOREVER_OUTSIDE = "Holy Forever: slide timing Verse 1 1, change 3.5 is outside the section's 3 bars";
    const SLIDE_TIMING = {
      // 2.5 bars of 6/8 is beat 7.5, inside the 9-beat Verse 3.
      'Ancient Gates': [{ section: 'Verse 3', changes: [1, 2.5] }],
      // 3.5 bars of 4/4 is beat 14, past the 12-beat Verse 1.
      'Holy Forever': [{ section: 'Verse 1', changes: [1, 2, 3.5] }],
    };
    // Live stopped in one song in its own meter, then the playhead moved into the other song and Live
    // reporting that song's meter. Before the move, the song the playhead has not been in is unread,
    // and only Holy Forever, in 4/4, has a note or a slide timing problem once it is read.
    const WALKS = [
      {
        walk: 'from Ancient Gates in 6/8 into Holy Forever in 4/4',
        start: { playing: false, position: 10, signature: { numerator: 6, denominator: 8 } },
        unread: 'Holy Forever',
        to: { position: 44, numerator: 4, denominator: 4 },
        holyForeverBefore: false,
      },
      {
        walk: 'from Holy Forever in 4/4 into Ancient Gates in 6/8',
        start: { playing: false, position: 44, signature: { numerator: 4, denominator: 4 } },
        unread: 'Ancient Gates',
        to: { position: 10, numerator: 6, denominator: 8 },
        holyForeverBefore: true,
      },
    ];

    // A rig on MIXED_METERS with Live set up as given, and the November 8 playlist picked, once the
    // row shows the check run after the pick.
    async function meterRig(setup: LiveSetup, slideTiming?: string) {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      return pickedRig(NOVEMBER_8.id, MIXED_METERS, slideTiming, setup);
    }

    it.each(WALKS)('notes "changed on beats" by each song\'s own meter, and "meter not read yet" for a song the playhead has not been in, walking $walk', async ({ start, unread, to, holyForeverBefore }) => {
      const { row, next, shown } = await meterRig(start);

      expect(meterLines(shown.check)).toEqual([`${unread}: meter not read yet`]);
      expect(onBeatsLines(shown.check)).toEqual(holyForeverBefore ? [HOLY_FOREVER_ON_BEATS] : []);

      await walkStopped(next, to);

      const after = await row((row) => meterLines(row.check).length === 0 && same(onBeatsLines(row.check), [HOLY_FOREVER_ON_BEATS]));
      expect(onBeatsLines(after.check)).toEqual([HOLY_FOREVER_ON_BEATS]);
    });

    it.each(WALKS)("judges the slide timing file's changes by each song's own meter, and skips the bars of a song the playhead has not been in, walking $walk", async ({ start, to, holyForeverBefore }) => {
      const slideTiming = join(await newFolder(), 'slide-timing.json');
      await writeFile(slideTiming, JSON.stringify(SLIDE_TIMING));
      const { row, next, shown } = await meterRig(start, slideTiming);

      expect(timingProblems(shown.check)).toEqual(holyForeverBefore ? [HOLY_FOREVER_OUTSIDE] : []);

      await walkStopped(next, to);

      const after = await row((row) => meterLines(row.check).length === 0 && same(timingProblems(row.check), [HOLY_FOREVER_OUTSIDE]));
      expect(timingProblems(after.check)).toEqual([HOLY_FOREVER_OUTSIDE]);
    });

    // While Live plays, it reports the next song's signature before the first position past the
    // change, with the last position it reported still inside the song it leaves (setlist-controller#284).
    it("keeps Ancient Gates in 6/8 when Live, playing across its End, reports Holy Forever's 4/4 before the playhead's move past it", async () => {
      const { row, next } = await meterRig({ playing: true, position: 26, signature: { numerator: 6, denominator: 8 } });
      const reported = next((snapshot) => snapshot.position === 26.5);
      rig!.live.setPosition(26.5);
      await reported;

      // 300 ms at 120 BPM carries the playhead 0.6 beats on, to 27.1, past Ancient Gates' End on 27.
      rig!.clock.advance(300);
      rig!.live.setSignature(4, 4);
      rig!.live.setPosition(29);
      rig!.live.setPosition(44);
      rig!.live.setPlaying(false);

      const after = await row((row) => meterLines(row.check).length === 0 && onBeatsLines(row.check).includes(HOLY_FOREVER_ON_BEATS));
      expect(onBeatsLines(after.check)).toEqual([HOLY_FOREVER_ON_BEATS]);
    });

    it('forgets every song\'s meter on a new set from Live, but the song the playhead sits in keeps Live\'s', async () => {
      const { start, to } = WALKS[0]!;
      const { row, next } = await meterRig(start);
      await walkStopped(next, to);
      await row((row) => meterLines(row.check).length === 0 && same(onBeatsLines(row.check), [HOLY_FOREVER_ON_BEATS]));

      // The operator renames Ancient Gates' Verse 1 in Live, with the playhead still in Holy Forever.
      rig!.live.setCuePoints(MIXED_METERS.map((cuePoint) => (cuePoint.time === 6 ? { ...cuePoint, name: '1 - Verse 2' } : cuePoint)));
      await rig!.advanceConnected(5000);

      const forgotten = await row((row) => same(meterLines(row.check), ['Ancient Gates: meter not read yet']));
      expect(onBeatsLines(forgotten.check)).toEqual([HOLY_FOREVER_ON_BEATS]);
    });

    it("names a section with more slides than whole beats as a problem in a song whose meter is not read yet, since beats do not wait on its meter", async () => {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      // MIXED_METERS with Holy Forever's Verse 1, 4 slides, cut to 3 beats, 40 to 43.
      const shortVerse1 = MIXED_METERS.map((cuePoint) => (cuePoint.name === '2 - End' ? { ...cuePoint, time: 43 } : cuePoint));
      const { shown } = await pickedRig(NOVEMBER_8.id, shortVerse1, undefined, WALKS[0]!.start);
      const problems = (check: PreServiceCheck) => (check.kind === 'unmatched' ? check.problems : []);

      expect(meterLines(shown.check)).toEqual(['Holy Forever: meter not read yet']);
      expect(problems(shown.check)).toEqual(['Holy Forever: Verse 1 has 4 slides in 3 beats, needs a slide timing entry']);
      expect(onBeatsLines(shown.check).filter((line) => line.startsWith('Holy Forever'))).toEqual([]);
    });
  });

  it('gives no "changed on beats" note for a one-slide group in a section shorter than a bar', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    // Holy Forever's Tag group holds one slide, here on a 2-beat Tag.
    const shortTag: CuePoint[] = [
      { name: '1 - Verse 1 (Holy Forever)', time: 0 },
      { name: '1 - Tag', time: 16 },
      { name: '1 - Chorus 1', time: 18 },
      { name: '1 - End', time: 34 },
    ];
    const notes = (check: PreServiceCheck) => (check.kind === 'not-checked' ? [] : check.notes);

    const { shown } = await pickedRig(NOVEMBER_8.id, shortTag);

    // The check ran: it notes Holy Forever's group 11.
    expect(notes(shown.check)).toContain(UNNAMED_11);
    expect(notes(shown.check)).not.toContain('Holy Forever: meter not read yet');
    expect(notes(shown.check).filter((line) => line.endsWith('changed on beats'))).toEqual([]);
  });

  // A group with more slides than its section has whole beats loses the slides the even split puts at
  // or past the section's end, so the check names the section as a problem in place of its "changed on
  // beats" note: Ancient Gates on SLIDES_CUE_POINTS with a 2-beat Verse 3, 112 to 114, whose group holds
  // 3 slides (indexes 7, 8 and 9).
  describe('a section with more slides than whole beats', () => {
    const TWO_BEAT_VERSE_3: CuePoint[] = [...SLIDES_CUE_POINTS.slice(0, 5), { name: '1 - End', time: 114 }];
    const NEEDS_ENTRY = 'Ancient Gates: Verse 3 has 3 slides in 2 beats, needs a slide timing entry';
    const ANCIENT_GATES_NOTES = ['Ancient Gates: no group Intro, shows slide 1', 'Ancient Gates: 1 section Chorus 1, 3 groups', 'Ancient Gates: no group End, clears'];

    // A rig on the cue points given with the November 8 playlist picked, and a slide timing file of
    // the entries given, once the row shows the check run after the pick.
    async function beatsRig(cuePoints: CuePoint[], slideTiming?: unknown) {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      let path: string | undefined;
      if (slideTiming !== undefined) {
        path = join(await newFolder(), 'slide-timing.json');
        await writeFile(path, JSON.stringify(slideTiming));
      }
      return pickedRig(NOVEMBER_8.id, cuePoints, path);
    }

    it('names a 2-beat Verse 3 with 3 slides as a problem that needs a slide timing entry, and gives it no "changed on beats" note', async () => {
      const { shown } = await beatsRig(TWO_BEAT_VERSE_3);

      expect(shown.check).toEqual(fileCheck({ problems: [NEEDS_ENTRY], notes: ANCIENT_GATES_NOTES }));
    });

    it("gives no problem for that Verse 3 when its slide timing entry gives its changes, on beats 1 and 1.5", async () => {
      const { shown } = await beatsRig(TWO_BEAT_VERSE_3, { 'Ancient Gates': [{ section: 'Verse 3', changes: [0.25, 0.375] }] });

      expect(shown.check).toEqual(matched(...ANCIENT_GATES_NOTES));
    });

    it("keeps the problem for that Verse 3 when its slide timing entry's changes go down, before the entry's own problem", async () => {
      const { shown } = await beatsRig(TWO_BEAT_VERSE_3, { 'Ancient Gates': [{ section: 'Verse 3', changes: [0.375, 0.25] }] });

      expect(shown.check).toEqual(fileCheck({ problems: [NEEDS_ENTRY, 'Ancient Gates: slide timing Verse 3 1, changes must go up'], notes: ANCIENT_GATES_NOTES }));
    });
  });
});

// The server moves the slides inside a section, on an even split of its bars: Ancient Gates from the
// November 8 playlist, whose Verse 1 (indexes 1 and 2), Verse 2 (3 and 4) and Chorus 1 (5 and 6) hold
// two slides each and Verse 3 (7, 8 and 9) three, on 8-bar sections in 4/4 at 120 BPM.
const SLIDES_CUE_POINTS: CuePoint[] = [
  { name: '1 - Intro (Ancient Gates)', time: 0 },
  { name: '1 - Verse 1', time: 16 },
  { name: '1 - Verse 2', time: 48 },
  { name: '1 - Chorus 1', time: 80 },
  { name: '1 - Verse 3', time: 112 },
  { name: '1 - End', time: 144 },
];

// SLIDES_CUE_POINTS with a 2-bar Verse 3, whose 3 slides go on beats.
const SHORT_VERSE_3: CuePoint[] = [...SLIDES_CUE_POINTS.slice(0, 5), { name: '1 - End', time: 120 }];

// SLIDES_CUE_POINTS with no End, followed by Holy Forever from its Count Off on the beat given, so
// Ancient Gates' last section, Verse 3 from 112, runs to that first locator (setlist-controller#314).
const noEndThenHolyForever = (countOff: number): CuePoint[] => [
  ...SLIDES_CUE_POINTS.slice(0, 5),
  { name: '2 - Count Off (Holy Forever)', time: countOff },
  { name: '2 - Intro', time: countOff + 4 },
  { name: '2 - Verse 1', time: countOff + 12 },
  { name: '2 - End', time: countOff + 20 },
];

// The lateness log's lines, each parsed, but for its wall-clock time, or none while there is no file.
const latenessLines = async (path: string) =>
  (await readFile(path, 'utf8').catch(() => ''))
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => Object.fromEntries(Object.entries(JSON.parse(line) as Record<string, unknown>).filter(([key]) => key !== 'time')));

describe('the slides inside a section', () => {
  async function slidesRig(position: number, { cuePoints = SLIDES_CUE_POINTS, latenessLog }: { cuePoints?: CuePoint[]; latenessLog?: { path: string } } = {}) {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    return armedRig({ position, playlist: NOVEMBER_8.id, cuePoints, latenessLog });
  }

  it('sends Verse 1 slide 1 at its start and slide 2 four bars in, and nothing between', async () => {
    const { play, triggers } = await slidesRig(8);

    await play(8, 16);
    await play(8, 24);
    await play(7, 31);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await play(1, 32);
    await play(8, 40);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 3's three slides over its 8 bars at its start, at bar 3 and at bar 5", async () => {
    const { play, triggers } = await slidesRig(104);

    await play(8, 112);
    await play(11, 123);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    await play(1, 124);
    await play(7, 131);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    await play(1, 132);
    await play(8, 140);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it('sends the three slides of a 2-bar Verse 3 on beats 0, 3 and 5, and the check notes it', async () => {
    const { play, latest, triggers } = await slidesRig(104, { cuePoints: SHORT_VERSE_3 });

    expect((await latest()).check).toEqual(
      matched('Ancient Gates: no group Intro, shows slide 1', 'Ancient Gates: 1 section Chorus 1, 3 groups', 'Ancient Gates: no group End, clears', 'Ancient Gates: Verse 3 has 3 slides in 2 bars, changed on beats'),
    );
    // The triggers received by each beat of the section, from beat 0 to beat 7.
    const byBeat: number[] = [];
    await play(8, 112);
    byBeat.push((await triggers()).length);
    for (let beat = 113; beat <= 119; beat += 1) {
      await play(1, beat);
      byBeat.push((await triggers()).length);
    }

    expect(byBeat).toEqual([1, 1, 1, 2, 2, 3, 3, 3]);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it("sends the three slides of Verse 3, the last section of Ancient Gates with no End, over the 8 bars to Holy Forever's first locator", async () => {
    const { play, triggers } = await slidesRig(104, { cuePoints: noEndThenHolyForever(144) });

    await play(8, 112);
    await play(11, 123);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    await play(1, 124);
    await play(7, 131);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    await play(1, 132);
    await play(11, 143);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
    // Holy Forever's Count Off has no group and comes before its first section with one, its Intro.
    await play(1, 144);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9), trigger(HOLY_FOREVER, 0)]);
  });

  it("sends the three slides of that Verse 3 on beats 0, 3 and 5 when Holy Forever's first locator is 2 bars after it, and the check notes it", async () => {
    const { play, latest, triggers } = await slidesRig(104, { cuePoints: noEndThenHolyForever(120) });

    expect((await latest()).check).toEqual(
      matched(
        'Ancient Gates: no group Intro, shows slide 1',
        'Ancient Gates: 1 section Chorus 1, 3 groups',
        'Ancient Gates: Verse 3 has 3 slides in 2 bars, changed on beats',
        'Holy Forever: no group Count Off, shows slide 1',
        'Holy Forever: meter not read yet',
        UNNAMED_11,
        UNNAMED_12,
      ),
    );
    // The triggers received by each beat of the section, from beat 0 to beat 7.
    const byBeat: number[] = [];
    await play(8, 112);
    byBeat.push((await triggers()).length);
    for (let beat = 113; beat <= 119; beat += 1) {
      await play(1, beat);
      byBeat.push((await triggers()).length);
    }

    expect(byBeat).toEqual([1, 1, 1, 2, 2, 3, 3, 3]);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it('gives that Verse 3 no length, and so no line, when Holy Forever, the next song, starts before it in an overlapping set', async () => {
    const { latest } = await slidesRig(4, { cuePoints: noEndThenHolyForever(100) });

    const { check } = await latest();
    expect(check.kind === 'not-checked' ? null : [...(check.kind === 'unmatched' ? check.problems : []), ...check.notes].filter((line) => line.startsWith('Ancient Gates: Verse 3'))).toEqual([]);
  });

  it('sends the slide for the landing once when the playhead moves back from Chorus 1 into the middle of Verse 1', async () => {
    const { next, play, triggers } = await slidesRig(84);

    // Verse 1 bar 6, past its change at bar 5.
    const moved = next((snapshot) => near(snapshot.position, 36));
    rig!.live.setPosition(36);
    await moved;
    await play(4, 40);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's first slide when the playhead is dragged back from its second slide into its first half", async () => {
    const { next, play, triggers } = await slidesRig(8);
    await play(8, 16);
    await play(8, 24);
    await play(8, 32);
    await play(4, 36);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    // A drag at the laptop back to Verse 1 bar 3, before its change at bar 5.
    const moved = next((snapshot) => near(snapshot.position, 24));
    rig!.live.setPosition(24);
    await moved;
    await play(4, 28);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 1)]);
  });

  it("sends nothing on a drag back while a jump waits, and the landing sends the jump's slide", async () => {
    const { lead, next, play, triggers } = await slidesRig(8);
    await play(8, 16);
    await play(8, 24);
    await play(8, 32);
    await play(4, 36);
    // A jump to Chorus 1 waits for the bar line on 40.
    await lead({ kind: 'jump', song: 1, section: 3 }, (snapshot) => snapshot.jump?.section === 3);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));

    const moved = next((snapshot) => near(snapshot.position, 24));
    rig!.live.setPosition(24);
    await moved;
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    // The bar line on 40 makes the jump, onto Chorus 1's start.
    await play(16, 80);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 5)]);
  });

  it("sends Verse 3's first slide on each wrap of a brace set by hand inside it from its first slide's span into its second's", async () => {
    const { next, play, triggers } = await slidesRig(104);
    await play(8, 112);
    // A brace from 120 to 128, which matches no section: Verse 3's slides change on 124 and 132.
    const on = next((snapshot) => snapshot.loop !== null);
    rig!.live.setLoop({ on: true, start: 120, length: 8 });
    await on;
    await play(12.5, 124.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);

    await play(4, 120.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 7)]);
    await play(4, 124.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
  });

  it("drops a beat-split change a tapped jump's wait plays across, and the landing sends its own slide", async () => {
    const { lead, play, triggers } = await slidesRig(104, { cuePoints: SHORT_VERSE_3 });
    await play(8, 112);
    await play(0.5, 112.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);

    // The bar line after 112.5 is 116, so the change on beat 3, 115, comes while the jump waits.
    await lead({ kind: 'jump', song: 1, section: 1 }, (snapshot) => snapshot.jump?.section === 1);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(3, 115.5);
    await play(1, 16.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 1)]);
  });

  it('sends the slide for where Live starts when it starts in the middle of Verse 1', async () => {
    const { next, triggers } = await slidesRig(84);
    const stopped = next((snapshot) => !snapshot.playing);
    rig!.live.setPlaying(false);
    await stopped;
    const moved = next((snapshot) => near(snapshot.position, 36));
    rig!.live.setPosition(36);
    await moved;
    expect(await triggers()).toEqual([]);

    const started = next((snapshot) => snapshot.playing);
    rig!.live.setPlaying(true);
    await started;

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's change when Live starts less than a beat before it and reports the playhead moving on first", async () => {
    const { next, play, triggers } = await slidesRig(84);
    const stopped = next((snapshot) => !snapshot.playing);
    rig!.live.setPlaying(false);
    await stopped;
    // Parked in the last beat before the change at 32, then Live's song time moving on before its
    // report of the start, as a start may come.
    const parked = next((snapshot) => near(snapshot.position, 31.5));
    rig!.live.setPosition(31.5);
    await parked;
    const movedOn = next((snapshot) => near(snapshot.position, 32.2));
    rig!.live.setPosition(32.2);
    await movedOn;

    const started = next((snapshot) => snapshot.playing);
    rig!.live.setPlaying(true);
    await started;
    await play(14.8, 47);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it('clears when Live starts in the middle of a section with no group after the first with one', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { next, play, sent } = await armedRig({ position: 12, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    await play(4, 16);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1)]);
    const stopped = next((snapshot) => !snapshot.playing);
    rig!.live.setPlaying(false);
    await stopped;
    // The middle of Ancient Gates' Turnaround, after its Verse 1.
    const moved = next((snapshot) => near(snapshot.position, 28));
    rig!.live.setPosition(28);
    await moved;

    const started = next((snapshot) => snapshot.playing);
    rig!.live.setPlaying(true);
    await started;

    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), CLEAR]);
  });

  it('sends the slide for the playhead on Fire again in the middle of Verse 1, armed or disarmed', async () => {
    const { producer, row, triggers } = await slidesRig(36);

    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toHaveLength(1));
    producer.send({ kind: 'disarm', target: 'propresenter' });
    await row((row) => row.arm === 'disarmed');
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toHaveLength(2));

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends nothing after the leader's Stop just before Verse 1's change, even when a report across the change comes before Live reports the stop", async () => {
    const { leader, next, play, triggers } = await slidesRig(8);
    await play(8, 16);
    await play(15, 31);

    // Live plays across the change at 32, but its report waits, as AbletonOSC's tick makes it, so the
    // server is told of it only after it has sent the stop.
    rig!.live.holdReplies();
    rig!.live.advance(2 * BEAT_MS);
    leader.send({ kind: 'stop' });
    await vi.waitFor(() => expect(rig!.received('/live/song/stop_playing')).toHaveLength(1));
    const stopped = next((snapshot) => !snapshot.playing);
    rig!.live.releaseReplies();
    await stopped;

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
  });

  it("stays armed through the frame of Verse 1's own change past the window", async () => {
    const { clock, play, latest, triggers } = await slidesRig(8);
    await pro!.streaming();
    await play(8, 16);
    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(ANCIENT_GATES, 1);

    await play(16, 32);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(ANCIENT_GATES, 2);

    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Verse 1 / slide 2'), expect.any(String)] });
  });

  it("pauses on a press by hand of Verse 1's second slide before its change", async () => {
    const { clock, play, row, triggers } = await slidesRig(8);
    await pro!.streaming();
    await play(8, 16);
    await play(8, 24);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);

    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(ANCIENT_GATES, 2);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("logs a line for Verse 1's change with its slide index, measured against its beat, and the row's lateness counts it", async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    const { play, row, triggers } = await slidesRig(8, { latenessLog: { path } });

    // On Verse 1's start, answered before the change, then half a beat past its change at 32: handed
    // 250 ms late.
    await play(8, 16);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await play(16.5, 32.5);

    expect((await row((row) => row.lateness.last === 250 && row.lateness.acted === 250)).lateness).toMatchObject({ last: 250, acted: 250 });
    await rig!.close();
    rig = undefined;
    expect(await latenessLines(path)).toEqual([
      { target: 'propresenter', song: 1, title: 'Ancient Gates', section: 'Verse 1', cause: 'played-into', slide: 1, lateMs: 0, actedMs: 0 },
      { target: 'propresenter', song: 1, title: 'Ancient Gates', section: 'Verse 1', cause: 'played-into', slide: 2, lateMs: 250, actedMs: 250 },
    ]);
  });

  it('sends the bar-4 change on beat 16 of Verse 1 at 95 BPM, measured late against 95 BPM', async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    const { next, triggers } = await slidesRig(8, { latenessLog: { path } });
    const beatMs = 60_000 / 95;
    // Plays on for that many beats at 95 BPM, and waits for the playhead where Live then puts it.
    const playAt95 = async (beats: number, landsOn: number) => {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      rig!.live.advance(beats * beatMs);
      await seen;
    };
    rig!.live.setTempo(95);
    await playAt95(8, 16);
    await playAt95(15.5, 31.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);

    // Half a beat past 32 at 95 BPM is 316 ms.
    await playAt95(1, 32.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    await rig!.close();
    rig = undefined;
    expect((await latenessLines(path)).map(({ slide, lateMs }) => ({ slide, lateMs }))).toEqual([
      { slide: 1, lateMs: 0 },
      { slide: 2, lateMs: 316 },
    ]);
  });
});

// The lyric lead: with leadBeats left out of ProPresenter's section, 2, each slide change goes up 2
// beats before its beat while Live plays forward, timed on the server's clock from Live's last report
// of the playhead and its tempo. The fake Live's advance moves only the playhead; the server's clock
// moves only by the test's hand, so a slide sent early is one the server's clock sent.
describe('the lyric lead', () => {
  async function leadRig(position: number, { cuePoints = SLIDES_CUE_POINTS, latenessLog, leadBeats = 'default' }: { cuePoints?: CuePoint[]; latenessLog?: { path: string }; leadBeats?: number | 'default' } = {}) {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const started = await armedRig({ position, playlist: NOVEMBER_8.id, cuePoints, latenessLog, leadBeats });
    return {
      ...started,
      // Moves the server's clock on to `ms` after the clock time it read at `from`.
      async clockTo(from: number, ms: number) {
        await rig!.advanceConnected(from + ms - rig!.clock.now());
      },
    };
  }

  it("sends Ancient Gates Verse 1's second slide 2 beats before its bar at 95 BPM, and not again on the bar", async () => {
    const { next, triggers, clockTo } = await leadRig(8);
    const beatMs = 60_000 / 95;
    const playAt95 = async (beats: number, landsOn: number) => {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      rig!.live.advance(beats * beatMs);
      await seen;
    };
    rig!.live.setTempo(95);
    await playAt95(8, 16);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);

    // Verse 1's change is on beat 32, its bar 5; 2 beats before it is beat 30, 14 beats after the
    // report at 16.
    await clockTo(reported, 14 * beatMs - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await clockTo(reported, 14 * beatMs);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    await playAt95(16.5, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's first slide 2 beats before the section start when the playhead plays into it, and not again on its downbeat", async () => {
    const { play, triggers, clockTo } = await leadRig(8);
    await play(4, 12);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([]);

    // Verse 1 starts on beat 16; 2 beats before it is beat 14, 2 beats after the report at 12.
    await clockTo(reported, 2 * BEAT_MS - 1);
    expect(await triggers()).toEqual([]);
    await clockTo(reported, 2 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await play(4.5, 16.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
  });

  it("sends the Turnaround's clear on its downbeat, never early, after Verse 1's change went early", async () => {
    const { play, sent, clockTo } = await leadRig(12, { cuePoints: NOVEMBER_8_CUE_POINTS });
    await play(4, 16);
    const reported = rig!.clock.now();
    // Verse 1, from 16 to 24, changes on 20, sent on 18.
    await clockTo(reported, 2 * BEAT_MS);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    // Past 22, 2 beats before the Turnaround's downbeat at 24, and on to the Interlude's at 32.
    await clockTo(reported, 16 * BEAT_MS);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    await play(8.5, 24.5);

    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), CLEAR]);
  });

  // A clear shorter than the lead: Ancient Gates' Verse 1 from 16 to 24 (changes on 20), a 1-beat
  // Turnaround on 24 that clears, then Verse 2 on 25.
  const SHORT_TURNAROUND: CuePoint[] = [
    { name: '1 - Intro (Ancient Gates)', time: 0 },
    { name: '1 - Verse 1', time: 16 },
    { name: '1 - Turnaround', time: 24 },
    { name: '1 - Verse 2', time: 25 },
    { name: '1 - End', time: 57 },
  ];

  it("keeps Verse 2's first slide up after a 1-beat Turnaround's clear, never sending it before the clear's downbeat", async () => {
    const { play, sent, clockTo } = await leadRig(12, { cuePoints: SHORT_TURNAROUND });
    await play(4, 16);
    const reported = rig!.clock.now();
    // Verse 1's change goes on 18. Verse 2's first slide, on 25, would go 2 beats before it, on 23,
    // before the Turnaround's downbeat on 24: it waits for the clear.
    await clockTo(reported, 8 * BEAT_MS);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    // The Turnaround's clear on its report, and Verse 2's first slide at once after it.
    await play(8.5, 24.5);
    await play(1, 25.5);

    expect((await sent()).at(-1)).toBe(trigger(ANCIENT_GATES, 3));
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), CLEAR, trigger(ANCIENT_GATES, 3)]);
  });

  it("brings back Verse 1's first slide only after a 1-beat Turnaround's clear inside the brace, never before its downbeat", async () => {
    const { next, play, sent, clockTo } = await leadRig(12, { cuePoints: SHORT_TURNAROUND });
    await play(4, 16);
    const reported = rig!.clock.now();
    // A brace set by hand over Verse 1 and the Turnaround, from 16 to the wrap on 25.
    const on = next((snapshot) => snapshot.loop !== null);
    rig!.live.setLoop({ on: true, start: 16, length: 9 });
    await on;
    // Verse 1's change goes on 18. The wrap's slide, Verse 1's first, would go 2 beats before the wrap,
    // on 23, before the Turnaround's downbeat on 24: it waits for the clear.
    await clockTo(reported, 8 * BEAT_MS);
    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    await play(8.5, 24.5);

    expect(await sent()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), CLEAR, trigger(ANCIENT_GATES, 1)]);
  });

  it("never sends a change scheduled early once the leader's Stop goes, even before Live reports the stop", async () => {
    const { leader, next, play, triggers, clockTo } = await leadRig(8);
    await play(4, 12);
    const reported = rig!.clock.now();

    // Verse 1's first slide, on 16, goes on 14, 2 beats after the report at 12. Live's replies wait,
    // so the server still has Live playing when the time comes.
    rig!.live.holdReplies();
    leader.send({ kind: 'stop' });
    await vi.waitFor(() => expect(rig!.received('/live/song/stop_playing')).toHaveLength(1));
    await clockTo(reported, 2 * BEAT_MS + 100);
    expect(await triggers()).toEqual([]);
    const stopped = next((snapshot) => !snapshot.playing);
    rig!.live.releaseReplies();
    await stopped;

    expect(await triggers()).toEqual([]);
  });

  it("never sends a change scheduled early once a jump is tapped, and the landing sends the target's own slide", async () => {
    const { lead, play, triggers, clockTo } = await leadRig(8);
    await play(2.5, 10.5);
    const reported = rig!.clock.now();

    // Verse 1's first slide, on 16, would go on 14. The bar line after 10.5 is 12, where Live lands
    // the jump on Verse 2, at 48.
    await lead({ kind: 'jump', song: 1, section: 2 }, (snapshot) => snapshot.jump?.section === 2);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await clockTo(reported, 3.5 * BEAT_MS + 100);
    expect(await triggers()).toEqual([]);
    await play(2, 48.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 3)]);
  });

  // A landing inside a change's lead shows that change's slide at once (setlist-controller#315).
  it("sends only a 2-bar Verse 3's second slide when a jump lands inside its lead, then its third on time, and neither again on their beats", async () => {
    const { lead, play, sent, clockTo } = await leadRig(104, { cuePoints: SHORT_VERSE_3 });
    await play(0.5, 104.5);
    const before = (await sent()).length;

    // The bar line after 104.5 is 108, where Live lands the jump on Verse 3, at 112. Its slides go on
    // 112, 115 and 117; the landing's report, at 113.5, is past 113, where the second goes early.
    await lead({ kind: 'jump', song: 1, section: 4 }, (snapshot) => snapshot.jump?.section === 4);
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(5, 113.5);
    const reported = rig!.clock.now();
    expect((await sent()).slice(before)).toEqual([trigger(ANCIENT_GATES, 8)]);

    // The third, on 117, goes on 115, 1.5 beats after the landing's report.
    await clockTo(reported, 1.5 * BEAT_MS - 1);
    expect((await sent()).slice(before)).toEqual([trigger(ANCIENT_GATES, 8)]);
    await clockTo(reported, 1.5 * BEAT_MS);
    expect((await sent()).slice(before)).toEqual([trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
    await play(2, 115.5);
    await play(2, 117.5);

    expect((await sent()).slice(before)).toEqual([trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it('drops a change scheduled early that comes due while ProPresenter is paused by hand, and sends it on no beat after', async () => {
    const { clock, play, row, triggers, clockTo } = await leadRig(8);
    await pro!.streaming();
    await play(8, 16);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);

    // Verse 2's first slide, pressed by hand, past the adapter's window.
    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(ANCIENT_GATES, 3);
    await row((row) => row.arm === 'paused');
    // Verse 1's change on 32 comes due on 30, then the playhead plays across 32.
    await clockTo(reported, 14 * BEAT_MS + 100);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await play(16.5, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
  });

  it('sends nothing early with a leadBeats of 0, and the change on the report that plays across its beat', async () => {
    const { play, triggers, clockTo } = await leadRig(8, { leadBeats: 0 });
    await play(8, 16);
    const reported = rig!.clock.now();

    await clockTo(reported, 16 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await play(16.5, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it('logs a change sent early as on time against its beat less the lead, and a slide sent on its beat as the lead late', async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    const { play, triggers, clockTo } = await leadRig(8, { latenessLog: { path } });
    // Played into on Verse 1's downbeat: no report came the lead before it, so it goes on the beat,
    // 2 beats late.
    await play(8, 16);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await clockTo(reported, 14 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    await rig!.close();
    rig = undefined;
    expect(await latenessLines(path)).toEqual([
      { target: 'propresenter', song: 1, title: 'Ancient Gates', section: 'Verse 1', cause: 'played-into', slide: 1, lateMs: 1000, actedMs: 1000 },
      { target: 'propresenter', song: 1, title: 'Ancient Gates', section: 'Verse 1', cause: 'played-into', slide: 2, lateMs: 0, actedMs: 0 },
    ]);
  });

  it("never sends a slide again, nor goes back to one, when the lead sends a 2-bar Verse 3's next change before the playhead plays across the one before", async () => {
    const { play, triggers, clockTo } = await leadRig(104, { cuePoints: SHORT_VERSE_3 });
    await play(8, 112);
    const reported = rig!.clock.now();
    // Verse 3's slides go on 112, 115 and 117: the change on 115 goes on 113, and the one on 117 on
    // 115, before a report shows the playhead across 115.
    await clockTo(reported, 3 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
    await play(3.25, 115.25);
    await play(2, 117.25);
    await play(2, 119.25);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it("never sends a change again on its beat when Live's report from just before its send time arrives after it", async () => {
    const { play, triggers, clockTo } = await leadRig(8);
    await play(12, 20);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);

    // Verse 1's change on 32 goes on 30, 10 beats after the report at 20. Live reports 29.98 10 ms
    // before that time; its report of 29.99, taken before the change went, arrives after it.
    await clockTo(reported, 10 * BEAT_MS - 10);
    await play(9.98, 29.98);
    await clockTo(reported, 10 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    await play(0.01, 29.99);
    await play(2.06, 32.05);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's slide when the playhead is dragged back into Verse 1 after Verse 2's change went early", async () => {
    const { next, play, triggers, clockTo } = await leadRig(40);
    await play(8, 48);
    const reported = rig!.clock.now();
    // Verse 2's change on 64 goes on 62, 14 beats after the report at 48.
    await clockTo(reported, 14 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 3), trigger(ANCIENT_GATES, 4)]);

    // Verse 1 bar 6, past its change at bar 5.
    const moved = next((snapshot) => near(snapshot.position, 36));
    rig!.live.setPosition(36);
    await moved;

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 3), trigger(ANCIENT_GATES, 4), trigger(ANCIENT_GATES, 2)]);
  });

  it('never sends a change sent early again on its beat after a jump request the controller refuses', async () => {
    const { leader, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    const reported = rig!.clock.now();
    await clockTo(reported, 14 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    // Count in is refused while Live plays, and a jump to a song not in the set is refused.
    leader.send({ kind: 'count-in', song: 1, section: 0 });
    leader.send({ kind: 'jump', song: 99, section: 0 });
    await leader.flush();
    await play(16.5, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it('sends the slide that went early on Fire again before its beat, and not again on the beat', async () => {
    const { producer, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    const reported = rig!.clock.now();
    // Verse 1's change on 32 goes on 30; the playhead is then on 31, before it.
    await clockTo(reported, 14 * BEAT_MS);
    await play(15, 31);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toHaveLength(3));
    await play(1.5, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 2)]);
  });

  // Parked within the lead before a change, then Live's song time moving on before its report of the
  // start, as a start may come: the start goes from where it was parked, and the change goes at once.
  async function startAfterMovingOn(parkedAt: number, movedTo: number) {
    const rigged = await leadRig(parkedAt - 10);
    const { next } = rigged;
    const stopped = next((snapshot) => !snapshot.playing);
    rig!.live.setPlaying(false);
    await stopped;
    const parked = next((snapshot) => near(snapshot.position, parkedAt));
    rig!.live.setPosition(parkedAt);
    await parked;
    const movedOn = next((snapshot) => near(snapshot.position, movedTo));
    rig!.live.setPosition(movedTo);
    await movedOn;
    const started = next((snapshot) => snapshot.playing);
    rig!.live.setPlaying(true);
    await started;
    return rigged;
  }

  it("never sends Verse 1's change again on its beat when Live starts within the lead before it and reports the playhead moving on first", async () => {
    const { play, triggers } = await startAfterMovingOn(30.5, 30.8);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    await play(0.4, 31.2);
    await play(1.3, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("never sends Verse 1's first slide again on its downbeat when Live starts within the lead before it and reports the playhead moving on first", async () => {
    const { play, triggers } = await startAfterMovingOn(14.5, 14.8);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 0), trigger(ANCIENT_GATES, 1)]);
    await play(0.4, 15.2);
    await play(1.3, 16.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 0), trigger(ANCIENT_GATES, 1)]);
  });

  // Plays from 72 into Ancient Gates' Chorus 1, from 80 to 112, whose slides 5 and 6 go on 80 and 96,
  // and turns the loop on over it.
  async function loopChorus() {
    const rigged = await leadRig(72);
    await rigged.play(8, 80);
    await rigged.lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
    return rigged;
  }

  it("brings Chorus 1's first slide back 2 beats before each wrap of its loop, and never sends Verse 3's", async () => {
    const { play, triggers, clockTo } = await loopChorus();
    await play(24, 104);
    let reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);

    // The loop wraps on 112; 2 beats before it is 110, 6 beats after the report at 104.
    await clockTo(reported, 6 * BEAT_MS - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);
    await clockTo(reported, 6 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5)]);
    // A report between the send and the wrap, then across the wrap to half a beat into the Chorus.
    await play(7, 111);
    await play(1.5, 80.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5)]);

    // A second time round.
    await play(23.5, 104);
    reported = rig!.clock.now();
    await clockTo(reported, 6 * BEAT_MS);
    await play(8.5, 80.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5)]);
  });

  // Holy Forever after Ancient Gates, which has no End, so its Verse 1 runs on with no known end past
  // every later beat: plays from 64 into Holy Forever's Chorus 1, from 72 to 104, turns the loop on,
  // plays to 4 beats before the brace's end, and gives the slides ProPresenter got from 2 beats on,
  // when the wrap's slide goes.
  async function loopAfterSongWithNoEnd(loopOn: (rigged: Awaited<ReturnType<typeof leadRig>>) => Promise<void>, braceEnd: number) {
    const rigged = await leadRig(64, {
      cuePoints: [
        { name: '1 - Intro (Ancient Gates)', time: 0 },
        { name: '1 - Verse 1', time: 16 },
        { name: '2 - Intro (Holy Forever)', time: 48 },
        { name: '2 - Verse 1', time: 56 },
        { name: '2 - Chorus 1', time: 72 },
        { name: '2 - End', time: 104 },
      ],
    });
    const { play, triggers, clockTo } = rigged;
    await play(8, 72);
    await loopOn(rigged);
    await play(braceEnd - 4 - 72, braceEnd - 4);
    const before = await triggers();
    await clockTo(rig!.clock.now(), 2 * BEAT_MS);
    return (await triggers()).slice(before.length);
  }

  it("brings back the looped Chorus 1's first slide before the wrap, never the slide of an earlier song with no End", async () => {
    const sent = await loopAfterSongWithNoEnd(({ lead }) => lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 2), 104);

    expect(sent).toEqual([trigger(HOLY_FOREVER, 9)]);
  });

  it("brings back the slide a brace set by hand inside Chorus 1 starts on before the wrap, never the slide of an earlier song with no End", async () => {
    const sent = await loopAfterSongWithNoEnd(async ({ next }) => {
      const on = next((snapshot) => snapshot.loop !== null);
      rig!.live.setLoop({ on: true, start: 88, length: 8 });
      await on;
    }, 96);

    // Chorus 1's second slide goes on 88, 16 beats into it.
    expect(sent).toEqual([trigger(HOLY_FOREVER, 10)]);
  });

  it("sends Verse 3's first slide once, 2 beats before the wrap of a brace set by hand inside it, and not again on the wrap", async () => {
    const { next, play, triggers, clockTo } = await leadRig(104);
    await play(8, 112);
    // A brace from 120 to 128, which matches no section: Verse 3's slides change on 124 and 132.
    const on = next((snapshot) => snapshot.loop !== null);
    rig!.live.setLoop({ on: true, start: 120, length: 8 });
    await on;
    await play(12, 124);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);

    // The wrap on 128 brings back the slide on 120, Verse 3's first, on 126, 2 beats after the report.
    await clockTo(rig!.clock.now(), 2 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 7)]);
    await play(4.5, 120.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 7)]);
  });

  // Turns the loop off with the wrap's change waiting, then plays on across 112 into Verse 3.
  async function loopOffBeforeWrap(off: (rigged: Awaited<ReturnType<typeof loopChorus>>) => Promise<void>) {
    const rigged = await loopChorus();
    const { play, triggers, clockTo } = rigged;
    await play(24, 104);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);

    await off(rigged);
    // Verse 3's first slide, on 112, goes on 110, 6 beats after the report at 104.
    await clockTo(reported, 6 * BEAT_MS + 100);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
    await play(8.5, 112.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
  }

  it("never sends the wrap's slide when the leader turns the loop off before the wrap, and sends Verse 3's first slide the lead early", async () => {
    await loopOffBeforeWrap(({ lead }) => lead({ kind: 'loop' }, (snapshot) => snapshot.loop === null));
  });

  it("never sends the wrap's slide when the loop is turned off at the laptop before the wrap, and sends Verse 3's first slide the lead early", async () => {
    await loopOffBeforeWrap(async ({ next }) => {
      const off = next((snapshot) => snapshot.loop === null);
      rig!.live.setLoop({ on: false });
      await off;
    });
  });

  // The leader's Loop press inside the lead of Chorus 1's end, with Live's report of the loop arriving
  // after the send time of Verse 3's first slide, on 110, which is the wrap's send time too.
  it("never sends Verse 3's first slide when the leader presses Loop half a beat before its send time and Live reports the loop after it, and brings Chorus 1's back on time", async () => {
    const { leader, next, play, triggers, clockTo } = await leadRig(72);
    await play(8, 80);
    await play(24, 104);
    await play(5.5, 109.5);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);

    // The press at 109.5; Live's report of the loop comes 600 ms later, past 110.
    rig!.live.holdReplies();
    leader.send({ kind: 'loop' });
    await vi.waitFor(() => expect(rig!.received('/live/song/set/loop')).toHaveLength(1));
    await clockTo(reported, 0.5 * BEAT_MS + 350);
    // The press scheduled the wrap's slide at once, so it went on 110, with Live's report still held.
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5)]);
    const looped = next((snapshot) => snapshot.loop?.section?.section === 3);
    rig!.live.releaseReplies();
    await looped;
    await play(3, 80.5);

    expect(await triggers()).not.toContain(trigger(ANCIENT_GATES, 7));
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5)]);
  });

  // The leader's Loop press in Chorus 1's last fraction of a beat, after Verse 3's first slide went
  // early: the press sends the wrap's slide over it, and Live, its playhead already past 112 when the
  // loop reaches it, plays on into Verse 3 without wrapping.
  it("sends Verse 3's first slide back on its downbeat when the leader's Loop press reaches Live after its playhead passed Chorus 1's end", async () => {
    const { leader, next, play, triggers, clockTo } = await leadRig(72);
    await play(8, 80);
    await play(24, 104);
    let reported = rig!.clock.now();
    await clockTo(reported, 6 * BEAT_MS + 100);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
    await play(7.8, 111.8);
    reported = rig!.clock.now();
    await clockTo(reported, 0.1 * BEAT_MS);

    // Live plays on to 112.05 with its reports held, then takes the press there.
    rig!.live.holdReplies();
    rig!.live.advance(0.25 * BEAT_MS);
    leader.send({ kind: 'loop' });
    await vi.waitFor(() => expect(rig!.received('/live/song/set/loop')).toHaveLength(1));
    // The press braces Chorus 1 from the report at 111.8, so the wrap's slide went at once.
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 5)]);
    const looped = next((snapshot) => snapshot.loop?.section?.section === 3);
    rig!.live.releaseReplies();
    await looped;
    await play(0.45, 112.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 7)]);
  });

  // The mirror: the leader turns Chorus 1's loop off inside the lead of the wrap, with Live's report
  // of the loop off arriving after the wrap's send time, on 110.
  it("never sends the wrap's slide when the leader turns the loop off half a beat before its send time and Live reports it after, and sends Verse 3's first slide", async () => {
    const { leader, next, play, triggers, clockTo } = await loopChorus();
    await play(24, 104);
    await play(5.5, 109.5);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);

    rig!.live.holdReplies();
    leader.send({ kind: 'loop' });
    await vi.waitFor(() => expect(rig!.received('/live/song/set/loop')).toHaveLength(2));
    await clockTo(reported, 0.5 * BEAT_MS + 350);
    // The press scheduled Verse 3's first slide at once, so it went on 110, with Live's report held.
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
    const off = next((snapshot) => snapshot.loop === null);
    rig!.live.releaseReplies();
    await off;
    await play(3, 112.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
  });

  // The leader's Loop press at 104 that never reaches Live: the wrap's slide waits for the loop asked
  // for until the controller forgets it, and the next report schedules Verse 3's on Live's own loop.
  it("sends Verse 3's first slide, not the wrap's, when the leader's Loop press never reaches Live", async () => {
    const { leader, play, triggers, clockTo } = await leadRig(72);
    await play(8, 80);
    await play(24, 104);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);

    rig!.live.loseNext('/live/song/set/loop');
    leader.send({ kind: 'loop' });
    await vi.waitFor(() => expect(rig!.live.lost.map(({ address }) => address)).toEqual(['/live/song/set/loop']));
    await rig!.advanceConnected(LOOP_REPORT_MS);
    // A report at 106, past the controller's wait for the loop; Verse 3's first slide, on 112, goes on
    // 110, 4 beats after it.
    await play(2, 106);
    const reported = rig!.clock.now();
    await clockTo(reported, 4 * BEAT_MS + 100);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
    await play(6.5, 112.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
  });

  it("sends Verse 3's first slide at once when the loop is turned off after the wrap's slide went early, and not again on its downbeat", async () => {
    const { lead, play, triggers, clockTo } = await loopChorus();
    await play(24, 104);
    await clockTo(rig!.clock.now(), 6 * BEAT_MS);
    await play(7, 111);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5)]);

    // 111 is past 110, Verse 3's send time, and before its downbeat on 112.
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop === null);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 7)]);
    await play(1.5, 112.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 7)]);
  });

  it("brings Chorus 1's first slide back at once when the loop goes on after Verse 3's first slide went early, and sends no later slide", async () => {
    const { lead, play, triggers, clockTo } = await leadRig(72);
    await play(8, 80);
    await play(24, 104);
    // Verse 3's first slide, on 112, goes on 110, 6 beats after the report at 104.
    await clockTo(rig!.clock.now(), 6 * BEAT_MS);
    await play(7, 111);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);

    // 111 is past 110, the wrap's send time, and before the wrap on 112.
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 5)]);
    await play(1.5, 80.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 5)]);
  });

  it("never sends Chorus 1's second slide again when the loop goes on over Chorus 1 after that slide went early", async () => {
    const { lead, play, triggers } = await leadRig(72);
    await play(8, 80);
    await play(15.5, 95.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);

    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);
    await play(1, 96.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);
  });

  it("never sends Verse 3's first slide again when Live reports a loop of no length ahead of the playhead after that slide went early", async () => {
    const { next, play, triggers, clockTo } = await leadRig(72);
    await play(8, 80);
    await play(24, 104);
    await clockTo(rig!.clock.now(), 6 * BEAT_MS);
    await play(7, 111);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);

    const on = next((snapshot) => snapshot.loop !== null);
    rig!.live.setLoop({ on: true, start: 111.5, length: 0 });
    await on;
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
  });

  it("never sends Verse 3's first slide again when a brace behind the playhead is set by hand after that slide went early", async () => {
    const { next, play, triggers, clockTo } = await leadRig(72);
    await play(8, 80);
    await play(24, 104);
    await clockTo(rig!.clock.now(), 6 * BEAT_MS);
    await play(7, 111);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);

    const on = next((snapshot) => snapshot.loop !== null);
    rig!.live.setLoop({ on: true, start: 80, length: 8 });
    await on;
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
    await play(1.5, 112.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7)]);
  });

  // Verse 1's change on 32 waits for 30, 14 beats after a report at 16, when the leader fades out.
  async function fadeOutBeforeChange() {
    const rigged = await leadRig(8);
    const { leader, play, row, triggers } = rigged;
    await play(8, 16);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    leader.send({ kind: 'fade-out' });
    await row((row) => row.arm === 'paused' && row.pause === 'fade-out');
    return { ...rigged, reported };
  }

  it("never sends a change waiting when the leader fades out before it is due, though the producer arms ProPresenter again before then", async () => {
    const { producer, row, triggers, clockTo, reported } = await fadeOutBeforeChange();
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');
    await clockTo(reported, 14 * BEAT_MS + 100);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
  });

  it('never sends a change waiting when the leader fades out before it is due', async () => {
    const { triggers, clockTo, reported } = await fadeOutBeforeChange();
    await clockTo(reported, 14 * BEAT_MS + 100);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
  });

  // Moves the playhead to that beat while Live plays, as a drag at the laptop does.
  async function drag(next: (gives: (snapshot: ProducerSnapshot) => boolean) => Promise<unknown>, to: number) {
    const dragged = next((snapshot) => near(snapshot.position, to));
    rig!.live.setPosition(to);
    await dragged;
  }

  it("sends Verse 1's change 2 beats before its beat as predicted from a drag forward, not from the report before it", async () => {
    const { next, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    // Verse 1's change on 32 waits for 30, 14 beats after the report at 16; a drag to 24 puts 30 at
    // 6 beats after it.
    await clockTo(rig!.clock.now(), BEAT_MS);
    const dragged = rig!.clock.now();
    await drag(next, 24);

    await clockTo(dragged, 6 * BEAT_MS - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await clockTo(dragged, 6 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's change 2 beats before its beat as predicted from a drag back, and nothing at the time predicted before it", async () => {
    const { next, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    await clockTo(rig!.clock.now(), 8 * BEAT_MS);
    await play(8, 24);
    // From the report at 24, Verse 1's change on 32 waits for 30, 6 beats on; a drag back to 18 puts
    // 30 at 12 beats after it.
    const dragged = rig!.clock.now();
    await drag(next, 18);

    await clockTo(dragged, 12 * BEAT_MS - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await clockTo(dragged, 12 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("keeps Verse 1's change where it was predicted when a report moves the prediction by less than a beat", async () => {
    const { play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    const reported = rig!.clock.now();
    // Half a beat on at the same clock time: 30 would come 13.5 beats after it, not 14.
    await play(0.5, 16.5);

    await clockTo(reported, 14 * BEAT_MS - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await clockTo(reported, 14 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's change 2 beats before its beat at the tempo Live reports after the change was scheduled", async () => {
    const { next, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    const reported = rig!.clock.now();
    // At 60 BPM, a report a quarter of a beat on at the same clock time puts 30 at 13.75 seconds after
    // it, where 120 BPM put it 7 seconds after the report at 16.
    rig!.live.setTempo(60);
    const slower = next((snapshot) => near(snapshot.position, 16.25));
    rig!.live.advance(250);
    await slower;

    await clockTo(reported, 14 * BEAT_MS + 100);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await clockTo(reported, 13_750 - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1)]);
    await clockTo(reported, 13_750);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's change once when the playhead is dragged back just before its send time", async () => {
    const { next, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    const reported = rig!.clock.now();
    await clockTo(reported, 13.9 * BEAT_MS);
    await play(13.9, 29.9);
    await drag(next, 18);
    await clockTo(reported, 14 * BEAT_MS);
    await play(0.1, 18.1);
    await play(14.4, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's first slide on a drag back after its second slide's beat, and its second slide again 2 beats before its beat as predicted from the drag", async () => {
    const { next, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    // Verse 1's change on 32 goes on 30, 14 beats after the report at 16.
    await clockTo(rig!.clock.now(), 14 * BEAT_MS);
    await play(18, 34);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    // A drag back to Verse 1 bar 3 puts the change's send time, 30, 6 beats after it.
    const dragged = rig!.clock.now();
    await drag(next, 24);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 1)]);
    await clockTo(dragged, 6 * BEAT_MS - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 1)]);
    await clockTo(dragged, 6 * BEAT_MS);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Verse 1's first slide on a drag back to before the send point of its second slide, which went early", async () => {
    const { next, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    // Verse 1's change on 32 goes on 30, after the report at 16 and before the one at 31.
    await clockTo(rig!.clock.now(), 14 * BEAT_MS);
    await play(15, 31);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    await drag(next, 24);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 1)]);
  });

  it('sends nothing on a drag back that lands inside the lead before a slide that went early, nor when the playhead plays across its beat', async () => {
    const { next, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    await clockTo(rig!.clock.now(), 14 * BEAT_MS);
    await play(15.5, 31.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    // 30.5 is past 30, the second slide's send point, and before its beat on 32.
    await drag(next, 30.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    await play(2, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it('sends nothing on a drag back from past the beat of a slide that went early into the lead before it, nor when the playhead plays across its beat', async () => {
    const { next, play, triggers, clockTo } = await leadRig(8);
    await play(8, 16);
    await clockTo(rig!.clock.now(), 14 * BEAT_MS);
    // Past the second slide's beat on 32, where it stops counting as sent early.
    await play(20, 36);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    // 31 is past 30, the second slide's send point, and before its beat on 32: the screen shows it.
    await drag(next, 31);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
    await play(1.5, 32.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);
  });

  it("sends Chorus 1's second slide on a drag back to it after the wrap's slide went early, and the first slide again 2 beats before the next wrap", async () => {
    const { next, play, triggers, clockTo } = await loopChorus();
    await play(24, 104);
    await clockTo(rig!.clock.now(), 6 * BEAT_MS);
    await play(7, 111);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5)]);

    // 100 is in the second slide's span, from 96 to the wrap on 112.
    const dragged = rig!.clock.now();
    await drag(next, 100);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);
    // The wrap on 112 brings the first slide back on 110, 10 beats after the drag.
    await clockTo(dragged, 10 * BEAT_MS - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6)]);
    await clockTo(dragged, 10 * BEAT_MS);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 5)]);
  });

  it('measures each slide change inside a loop, the wrap included, against its beat less the lead, as outside one', async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    const { lead, play, triggers } = await leadRig(8, { latenessLog: { path } });
    await play(8, 16);
    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 1);
    // Half a beat past the change on 32, the wrap to half a beat past Verse 1's start, and 32 again.
    await play(16.5, 32.5);
    await play(16, 16.5);
    await play(16, 32.5);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2), trigger(ANCIENT_GATES, 1), trigger(ANCIENT_GATES, 2)]);

    await rig!.close();
    rig = undefined;
    expect((await latenessLines(path)).map(({ slide, cause, lateMs }) => ({ slide, cause, lateMs }))).toEqual([
      { slide: 1, cause: 'played-into', lateMs: 1000 },
      { slide: 2, cause: 'played-into', lateMs: 1250 },
      { slide: 1, cause: 'loop', lateMs: 1250 },
      { slide: 2, cause: 'played-into', lateMs: 1250 },
    ]);
  });

  // The lead across a song boundary: when a song plays on into the next, its end toggle on Continue,
  // the next song's first slide goes the lead before its downbeat too.
  it("sends Holy Forever's Count Off slide 2 beats before its downbeat when the playhead plays on from Ancient Gates' End, a bar before it", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: NOVEMBER_8_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    // Across Ancient Gates' End on 40, which clears, to 41, a beat later on the server's clock too: the
    // crossing is scheduled on the End's report, and a report a whole beat off it keeps it.
    await play(4, 40);
    await clockTo(rig!.clock.now(), BEAT_MS);
    await play(1, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;

    // Holy Forever's Count Off starts on 44 and shows slide 1; 2 beats before it is 42, 1 beat after
    // the report at 41.
    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await play(3.5, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    // The End outside the lead cleared on its own beat, before the crossing.
    expect((await sent()).slice(before - 1)).toEqual([CLEAR, trigger(HOLY_FOREVER, 0)]);
  });

  // November 8 with Ancient Gates' Interlude running on to its End on 44, on Holy Forever's Count Off:
  // an overlap, so the end toggle starts on Continue.
  const OVERLAP_CUE_POINTS: CuePoint[] = NOVEMBER_8_CUE_POINTS.map((point) => (point.name === '1 - End' ? { ...point, time: 44 } : point));

  it("sends Holy Forever's Count Off slide 2 beats before its downbeat, and neither Ancient Gates' End clear nor the slide again on the beat they share", async () => {
    const { play, sent, clockTo } = await leadRig(36, { cuePoints: OVERLAP_CUE_POINTS });
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;

    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await play(3.5, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  // November 8 with Ancient Gates' Interlude running on to its End on 43, a beat before Holy Forever's
  // Count Off: inside the lead of its slide 1, sent on 42. A gap, so the end toggle starts on Stop.
  const INSIDE_LEAD_CUE_POINTS: CuePoint[] = NOVEMBER_8_CUE_POINTS.map((point) => (point.name === '1 - End' ? { ...point, time: 43 } : point));

  it("sends Holy Forever's Count Off slide 2 beats before its downbeat, and no clear for Ancient Gates' End a beat before it, nor the slide again on the downbeat", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;

    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    // The End on its own report, then the Count Off on the next.
    await play(2.5, 43.5);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await play(1, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  // The rig above with Ancient Gates on Continue and ProPresenter's status stream open, once Holy
  // Forever's Count Off slide went early on 42, a beat before Ancient Gates' End on 43, and the
  // number of cues ProPresenter had received before it went.
  const crossedEarly = async () => {
    const started = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await pro!.streaming();
    await started.lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await started.play(5, 41);
    const reported = rig!.clock.now();
    const before = (await started.sent()).length;
    await started.clockTo(reported, 1 * BEAT_MS + 100);
    expect((await started.sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    return { ...started, before };
  };

  // Each forgets the slide sent early, so Ancient Gates' End, inside its lead, sends it again in place
  // of the End's clear (setlist-controller#352).
  it("sends Holy Forever's Count Off slide again for Ancient Gates' End, and no clear, when ProPresenter went offline and back after the slide went early", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { clock, next, play, sent, before } = await crossedEarly();
    const offline = next((snapshot) => proRow(snapshot)?.connection === 'offline');
    pro!.dropStreams();
    await offline;
    const online = next((snapshot) => proRow(snapshot)?.connection === 'online');
    clock.advance(POLL_MS);
    await online;
    await pro!.streaming();
    await play(2.5, 43.5);

    await vi.waitFor(async () => expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0)]));
  });

  it("sends Holy Forever's Count Off slide again for Ancient Gates' End, and no clear, when a slide pressed by hand paused ProPresenter after the slide went early and the producer armed it again", async () => {
    const { clock, producer, next, play, sent, before } = await crossedEarly();
    // Holy Forever's second slide, pressed by hand, past the adapter's window.
    clock.advance(PAST_WINDOW_MS);
    const paused = next((snapshot) => proRow(snapshot)?.arm === 'paused');
    await pro!.sendSlide(HOLY_FOREVER, 1);
    await paused;
    const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await armed;
    await play(2.5, 43.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0)]);
  });

  it("sends Holy Forever's Count Off slide again for Ancient Gates' End, and no clear, when the producer disarmed ProPresenter after the slide went early and armed it again", async () => {
    const { producer, next, play, sent, before } = await crossedEarly();
    const disarmed = next((snapshot) => proRow(snapshot)?.arm === 'disarmed');
    producer.send({ kind: 'disarm', target: 'propresenter' });
    await disarmed;
    const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await armed;
    await play(2.5, 43.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0)]);
  });

  // Holy Forever, whose presentation closes on its Ending group, index 24, playing on from its End on
  // 16 into Worthy Of It All's Verse 1 on the same beat: an overlap, so the end toggle starts on
  // Continue.
  const INTO_WORTHY_CUE_POINTS: CuePoint[] = [
    { name: '1 - Count Off (Holy Forever)', time: 4 },
    { name: '1 - Intro', time: 8 },
    { name: '1 - End', time: 16 },
    { name: '2 - Verse 1 (Worthy Of It All)', time: 16 },
    { name: '2 - Chorus', time: 32 },
    { name: '2 - End', time: 48 },
  ];

  it("sends Worthy Of It All's first slide 2 beats before its downbeat, and never Holy Forever's Ending group for its End on that downbeat", async () => {
    const { play, sent, clockTo } = await leadRig(10, { cuePoints: INTO_WORTHY_CUE_POINTS });
    await play(3, 13);
    const reported = rig!.clock.now();
    const before = (await sent()).length;

    // Worthy Of It All's Verse 1 starts on 16; 2 beats before it is 14, 1 beat after the report at 13.
    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
    await play(3.5, 16.5);

    expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
    expect(await sent()).not.toContain(trigger(HOLY_FOREVER, 24));
  });

  it("sends Holy Forever's Ending group 2 beats before its End, and nothing for Worthy Of It All early, when Holy Forever is set to stop at its End", async () => {
    const { lead, play, sent, clockTo } = await leadRig(10, { cuePoints: INTO_WORTHY_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'stop' }, (snapshot) => snapshot.endToggles[1] === 'stop');
    await play(3, 13);
    const reported = rig!.clock.now();
    const before = (await sent()).length;

    await clockTo(reported, 1 * BEAT_MS + 100);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 24)]);
  });

  // An End played into inside the crossing's lead, with the crossing not sent early, shows the
  // crossing's slide at once in place of its own, as a landing there does (setlist-controller#352).
  it("sends only Holy Forever's Count Off slide, and no clear for Ancient Gates' End, on the beat they share when a Fade out dropped the slide before it went early", async () => {
    const { leader, producer, row, play, sent } = await leadRig(36, { cuePoints: OVERLAP_CUE_POINTS });
    await play(4, 40);
    const before = (await sent()).length;
    // In the Interlude's last bar, the crossing waits for 42. The leader fades out, which drops it, and
    // the producer arms ProPresenter again before then.
    leader.send({ kind: 'fade-out' });
    await row((row) => row.arm === 'paused' && row.pause === 'fade-out');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');
    // One report carries the playhead from 40 across 42 to the shared beat.
    await play(4.5, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  // The crossing's lead dropped by a Fade out, as above, with Ancient Gates' End on 43 a beat before
  // Holy Forever's Count Off, its End and the Count Off each on its own report.
  const fadedInsideLead = async (latenessLog?: { path: string }) => {
    const started = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS, latenessLog });
    await started.lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await started.play(5, 41);
    const before = (await started.sent()).length;
    // The crossing waits for 42. The leader fades out, which drops it, and the producer arms
    // ProPresenter again before then.
    started.leader.send({ kind: 'fade-out' });
    await started.row((row) => row.arm === 'paused' && row.pause === 'fade-out');
    started.producer.send({ kind: 'arm', target: 'propresenter' });
    await started.row((row) => row.arm === 'armed');
    return { ...started, before };
  };

  it("sends only Holy Forever's Count Off slide for Ancient Gates' End a beat before it, and nothing on its downbeat, when a Fade out dropped the slide before it went early", async () => {
    const { play, sent, before } = await fadedInsideLead();
    // One report carries the playhead from 41 across 42 and the End on 43.
    await play(2.5, 43.5);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await play(1, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  it("measures Holy Forever's Count Off slide, sent for Ancient Gates' End, against its beat less the lead, and logs no line for the End", async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    const { play, sent, before } = await fadedInsideLead({ path });
    await play(2.5, 43.5);
    await play(1, 44.5);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);

    await rig!.close();
    rig = undefined;
    // The report at 43.5 is 1.5 beats past the slide's send point, 42.
    expect((await latenessLines(path)).map(({ song, section, slide, cause, lateMs }) => ({ song, section, slide, cause, lateMs }))).toEqual([
      { song: 2, section: 'Count Off', slide: 0, cause: 'played-into', lateMs: 750 },
    ]);
  });

  it("sends only Holy Forever's Count Off slide for Ancient Gates' End a beat before it, when ProPresenter was paused at the slide's send time and the producer armed it again", async () => {
    const { clock, producer, lead, next, play, sent, clockTo } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await pro!.streaming();
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    const before = (await sent()).length;
    // Holy Forever's second slide, pressed by hand, past the adapter's window, before the crossing's
    // send point on 42.
    clock.advance(PAST_WINDOW_MS);
    const paused = next((snapshot) => proRow(snapshot)?.arm === 'paused');
    await pro!.sendSlide(HOLY_FOREVER, 1);
    await paused;
    await play(5, 41);
    // The server's clock passes 42 while ProPresenter is paused, which drops the crossing.
    await clockTo(rig!.clock.now(), 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([]);
    const armed = next((snapshot) => proRow(snapshot)?.arm === 'armed');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await armed;
    await play(2.5, 43.5);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await play(1, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  it("sends only Worthy Of It All's first slide, and never Holy Forever's Ending group, for Holy Forever's End on the beat they share when a Fade out dropped the slide before it went early", async () => {
    const { leader, producer, row, play, sent } = await leadRig(10, { cuePoints: INTO_WORTHY_CUE_POINTS });
    const before = (await sent()).length;
    // Worthy Of It All's first slide waits for 14. The leader fades out, which drops it, and the
    // producer arms ProPresenter again before then.
    leader.send({ kind: 'fade-out' });
    await row((row) => row.arm === 'paused' && row.pause === 'fade-out');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');
    // One report carries the playhead from 10 across 14 to the shared beat.
    await play(6.5, 16.5);

    expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
    expect(await sent()).not.toContain(trigger(HOLY_FOREVER, 24));
  });

  // The cue requests ProPresenter has received since `from`, the clear and Holy Forever's Count Off
  // slide, polled for up to 400 ms, under the rig's 1000 ms request timeout, or until both came.
  const cuesReceived = async (from: number) => {
    const isCue = (path: string) => path === CLEAR || path === trigger(HOLY_FOREVER, 0);
    let received: string[] = [];
    for (let tries = 0; tries < 16 && received.length < 2; tries += 1) {
      received = pro!.requests.slice(from).map(({ path }) => path).filter(isCue);
      if (received.length < 2) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return received;
  };

  it("sends only Holy Forever's Count Off slide for Ancient Gates' End and its Count Off in one move while ProPresenter holds every request, and nothing after it answers", async () => {
    const { leader, producer, row, play, sent } = await leadRig(36, { cuePoints: OVERLAP_CUE_POINTS });
    await play(4, 40);
    leader.send({ kind: 'fade-out' });
    await row((row) => row.arm === 'paused' && row.pause === 'fade-out');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');
    const before = (await sent()).length;
    const from = pro!.requests.length;
    // ProPresenter holds every request. One report crosses Ancient Gates' End and Holy Forever's Count
    // Off, which hands only the slide, for the End, in one move.
    pro!.hang();
    await play(4.5, 44.5);

    const received = await cuesReceived(from);
    pro!.answer();
    expect(received).toEqual([trigger(HOLY_FOREVER, 0)]);
    // Nothing goes after ProPresenter answers the slide.
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  // November 8 with Ancient Gates' End on 41.9, just before the lead of Holy Forever's Count Off slide,
  // sent on 42.
  const END_ON_41_9_CUE_POINTS: CuePoint[] = NOVEMBER_8_CUE_POINTS.map((point) => (point.name === '1 - End' ? { ...point, time: 41.9 } : point));

  // The End on 41.9 played into, reported only after Holy Forever's Count Off slide went early on 42:
  // the screen shows the slide for a place past the End, so the End's clear would blank it
  // (setlist-controller#370).
  const endAfterEarly = async (latenessLog?: { path: string }) => {
    const started = await leadRig(36, { cuePoints: END_ON_41_9_CUE_POINTS, latenessLog });
    await started.lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await started.play(5.85, 41.85);
    const reported = rig!.clock.now();
    // Holy Forever's Count Off slide goes early on 42, 0.15 beat after the report.
    await started.clockTo(reported, 0.15 * BEAT_MS + 1);
    const early = await started.sent();
    expect(early.at(-1)).toBe(trigger(HOLY_FOREVER, 0));
    return { ...started, early };
  };

  it("sends nothing for Ancient Gates' End, and not Holy Forever's Count Off slide again, when the End comes just after the slide went early", async () => {
    const { play, sent, early } = await endAfterEarly();
    const from = pro!.requests.length;
    // ProPresenter holds every request. The next report crosses the End on 41.9, after the slide
    // for 44 went, so the End sends nothing.
    pro!.hang();
    await play(0.2, 42.05);

    const received = await cuesReceived(from);
    pro!.answer();
    expect(received).toEqual([]);
    expect((await sent()).slice(early.length)).toEqual([]);
    // The Count Off's downbeat on 44 finds the slide sent early, and sends nothing either.
    await play(2.5, 44.55);

    expect((await sent()).slice(early.length)).toEqual([]);
  });

  it("sends Ancient Gates' End clear and then Holy Forever's Count Off slide, when Live reports the End before the slide went early", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: END_ON_41_9_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    const before = (await sent()).length;
    // The report on 41.95 crosses the End on 41.9 before the slide's send point on 42.
    await play(5.95, 41.95);
    const reported = rig!.clock.now();
    expect((await sent()).slice(before)).toEqual([CLEAR]);
    await clockTo(reported, 0.05 * BEAT_MS + 1);
    await vi.waitFor(async () => expect((await sent()).slice(before)).toEqual([CLEAR, trigger(HOLY_FOREVER, 0)]));
    await play(2.5, 44.45);

    expect((await sent()).slice(before)).toEqual([CLEAR, trigger(HOLY_FOREVER, 0)]);
  });

  it("sends Ancient Gates' End clear, and not Holy Forever's Count Off slide again, when the leader sets it to stop at its End after the slide went early on 42", async () => {
    const { lead, play, sent, early } = await endAfterEarly();
    // The song no longer plays on, so the slide sent early is forgotten, and the End goes as it would.
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'stop' }, (snapshot) => snapshot.endToggles[1] === 'stop');
    await play(0.2, 42.05);

    expect((await sent()).slice(early.length)).toEqual([CLEAR]);
  });

  it("sends Ancient Gates' Turnaround clear when the playhead is dragged back into it after Holy Forever's Count Off slide went early on 42", async () => {
    const { next, sent, early } = await endAfterEarly();
    // The Turnaround, from 24 to 32, clears. The drag lands behind where the slide went, so the screen
    // no longer belongs to Holy Forever.
    const moved = next((snapshot) => near(snapshot.position, 26));
    rig!.live.setPosition(26);
    await moved;

    expect((await sent()).slice(early.length)).toEqual([CLEAR]);
  });

  it("logs no line for Ancient Gates' End, and one for Holy Forever's Count Off slide, when the End comes just after the slide went early", async () => {
    const path = join(await newFolder(), 'cue-lateness.log');
    const { play, sent, early } = await endAfterEarly({ path });
    await play(0.2, 42.05);
    await play(2.5, 44.55);
    expect((await sent()).slice(early.length)).toEqual([]);

    await rig!.close();
    rig = undefined;
    expect((await latenessLines(path)).map(({ song, section, slide, cause }) => ({ song, section, slide, cause }))).toEqual([
      { song: 2, section: 'Count Off', slide: 0, cause: 'played-into' },
    ]);
  });

  // The cue requests ProPresenter has received since `from`, every trigger and clear, polled for 400
  // ms, under the rig's 1000 ms request timeout, or until a second came.
  const heldCues = async (from: number) => {
    let received: string[] = [];
    for (let tries = 0; tries < 16 && received.length < 2; tries += 1) {
      received = pro!.requests.slice(from).map(({ path }) => path).filter((path) => CUE_PATH.test(path) || path === CLEAR);
      if (received.length < 2) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return received;
  };

  it("sends only Verse 3's last slide after Chorus 1's held slide, when Verse 3's three slides are handed while it is out", async () => {
    const { play, sent } = await leadRig(88);
    const before = (await sent()).length;
    const from = pro!.requests.length;
    // ProPresenter holds every request. Chorus 1's second slide, on 96, goes out on the report there,
    // and Verse 3's three slides, on 112, 124 and 132, sent on 110, 122 and 130, are each handed on
    // the report past their send while it is out.
    pro!.hang();
    await play(8, 96);
    await play(16, 112);
    await play(10.5, 122.5);
    await play(8, 130.5);

    const received = await heldCues(from);
    pro!.answer();
    expect(received).toEqual([trigger(ANCIENT_GATES, 6)]);
    await vi.waitFor(async () => expect((await sent()).slice(before)).toEqual([trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 9)]));
  });

  // A press goes out after the cue handed before it, and moves from that cue's slide
  // (setlist-controller#309), so neither the press nor a cue before it is dropped.
  it("sends a Next slide press and Verse 3's first slide before it after Chorus 1's held slide, dropping only the slide handed after the press that a later one replaces", async () => {
    const { producer, play, sent } = await leadRig(88);
    const before = (await sent()).length;
    const from = pro!.requests.length;
    const cuesAndNext = () =>
      pro!.requests
        .slice(from)
        .map(({ path }) => path)
        .filter((path) => CUE_PATH.test(path) || path === CLEAR || path === NEXT);
    // ProPresenter holds every request. Chorus 1's second slide, on 96, goes out on the report there,
    // and Verse 3's first slide, a Next slide press, and Verse 3's second and third slides, sent on 122
    // and 130, are each handed while it is out.
    pro!.hang();
    await play(8, 96);
    await play(16, 112);
    producer.send({ kind: 'run-button', target: 'propresenter', button: 'next' });
    // The press waits behind the held slide with nothing to see, so give the server time to take it.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await play(10.5, 122.5);
    await play(8, 130.5);

    const received = await heldCues(from);
    pro!.answer();
    expect(received).toEqual([trigger(ANCIENT_GATES, 6)]);
    await vi.waitFor(() => expect(cuesAndNext()).toEqual([trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7), NEXT, trigger(ANCIENT_GATES, 9)]));
    expect((await sent()).slice(before)).toEqual([trigger(ANCIENT_GATES, 6), trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 9)]);
  });

  it("sends the Turnaround's clear and then Verse 2's second slide after Verse 1's held slide, dropping Verse 2's first slide handed between them", async () => {
    const { play, sent } = await leadRig(12, { cuePoints: SHORT_TURNAROUND });
    await play(4, 16);
    const before = (await sent()).length;
    const from = pro!.requests.length;
    // ProPresenter holds every request. Verse 1's change on 20 goes out on the report past 18, then the
    // Turnaround's clear on 24, Verse 2's first slide on 25 and its second, on 41, sent on 39, are each
    // handed while it is out.
    pro!.hang();
    await play(2.5, 18.5);
    await play(6, 24.5);
    await play(1, 25.5);
    await play(14, 39.5);

    const received = await heldCues(from);
    pro!.answer();
    expect(received).toEqual([trigger(ANCIENT_GATES, 2)]);
    await vi.waitFor(async () => expect((await sent()).slice(before)).toEqual([trigger(ANCIENT_GATES, 2), CLEAR, trigger(ANCIENT_GATES, 4)]));
  });

  it("sends the Turnaround's clear straight after Verse 1's held first slide, dropping its second slide handed between them", async () => {
    const { play, sent } = await leadRig(12, { cuePoints: NOVEMBER_8_CUE_POINTS });
    const before = (await sent()).length;
    const from = pro!.requests.length;
    // ProPresenter holds every request. Verse 1's first slide goes out on the report at 16, then its
    // change on 20, sent on 18, and the Turnaround's clear on 24 are each handed while it is out.
    pro!.hang();
    await play(4, 16);
    await play(2.5, 18.5);
    await play(6, 24.5);

    const received = await heldCues(from);
    pro!.answer();
    expect(received).toEqual([trigger(ANCIENT_GATES, 1)]);
    await vi.waitFor(async () => expect((await sent()).slice(before)).toEqual([trigger(ANCIENT_GATES, 1), CLEAR]));
  });

  it("sends nothing for Holy Forever early when Ancient Gates is set to stop at its End inside the lead, and the End clears", async () => {
    const { play, sent, clockTo } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;

    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([]);
    await play(2.5, 43.5);

    expect((await sent()).slice(before)).toEqual([CLEAR]);
  });

  it("sends nothing for Holy Forever early when the leader sets Ancient Gates to stop at its End after the slide was scheduled, and the End clears", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'stop' }, (snapshot) => snapshot.endToggles[1] === 'stop');

    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([]);
    await play(2.5, 43.5);

    expect((await sent()).slice(before)).toEqual([CLEAR]);
  });

  it("sends Ancient Gates' End clear when the leader sets it to stop at its End after Holy Forever's slide went early", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;
    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);

    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'stop' }, (snapshot) => snapshot.endToggles[1] === 'stop');
    await play(2.5, 43.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0), CLEAR]);
  });

  it("sends Holy Forever's Count Off slide 2 beats before its downbeat when the leader sets Ancient Gates to continue after the last report", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');

    await clockTo(reported, 1 * BEAT_MS + 100);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  // Next on Ancient Gates' last section, its Interlude, jumps to its End: the End cue the jump raises
  // follows the same rule as one the playhead plays into (setlist-controller#306).
  it("sends no clear for Ancient Gates' End when Next jumps there a beat before Holy Forever's Count Off, after its slide went early, nor the slide again on the downbeat", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;
    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);

    await lead({ kind: 'next' }, (snapshot) => snapshot.jump?.section === 'end');
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    // Playback reaches the End on 43 while the jump waits, which raises it as the jump's landing. Live
    // still makes the jump on the bar line, 44, back to the End, and plays on into the Count Off.
    await play(2.5, 43.5);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await play(1.25, 43.75);
    await play(1, 44.75);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  // A landing inside a change's lead shows that change's slide at once (setlist-controller#315).
  it("sends only Holy Forever's Count Off slide, and no clear, when Next jumps to Ancient Gates' End a beat before it, before the slide went early", async () => {
    const { lead, play, sent } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await play(5, 41);
    const before = (await sent()).length;

    // Next drops Holy Forever's Count Off slide waiting for 42, and the server's clock never reaches
    // 42, so it never went early. Playback reaches the End on 43, inside its lead, while the jump
    // waits, which raises the End as the jump's landing.
    await lead({ kind: 'next' }, (snapshot) => snapshot.jump?.section === 'end');
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(2.5, 43.5);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    // Live still makes the jump on the bar line, 44, back to the End, and plays on into the Count Off.
    await play(1.25, 43.75);
    await play(1, 44.75);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  it("sends no clear for Ancient Gates' End when Next jumps there on the beat it shares with Holy Forever's Count Off, after its slide went early, nor the slide again", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: OVERLAP_CUE_POINTS });
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;
    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);

    await lead({ kind: 'next' }, (snapshot) => snapshot.jump?.section === 'end');
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(3.5, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  it("sends Holy Forever's Intro slide at once from Ancient Gates' End when Next jumps there with a lead longer than the Count Off, since the jump dropped it", async () => {
    const { lead, play, sent } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS, leadBeats: 6 });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    const before = (await sent()).length;
    // Holy Forever's Count Off slide, on 44, goes 6 beats early, on 38: at once on the report at 39. It
    // schedules its Intro's slide, on 48, for 42.
    await play(3, 39);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await play(2, 41);

    // Next drops the Intro's slide waiting for 42. The End on 43 sends no clear, and schedules it again,
    // past its send time, so it goes at once.
    await lead({ kind: 'next' }, (snapshot) => snapshot.jump?.section === 'end');
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(2.5, 43.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0)]);
  });

  it("sends Ancient Gates' End clear when Next jumps there and it is set to stop at its End inside the lead", async () => {
    const { lead, play, sent } = await leadRig(36, { cuePoints: INSIDE_LEAD_CUE_POINTS });
    await play(5, 41);
    const before = (await sent()).length;

    await lead({ kind: 'next' }, (snapshot) => snapshot.jump?.section === 'end');
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    await play(2.5, 43.5);

    expect((await sent()).slice(before)).toEqual([CLEAR]);
  });

  // The End on the beat it shares with the crossing is inside the crossing's lead, so the jump's
  // landing there shows the crossing's slide at once (setlist-controller#315).
  it("sends no clear for Ancient Gates' End, and Holy Forever's Count Off slide once, when Next jumps there after a Fade out dropped the slide before it went early", async () => {
    const { leader, producer, row, lead, play, sent } = await leadRig(36, { cuePoints: OVERLAP_CUE_POINTS });
    await play(4, 40);
    const before = (await sent()).length;
    leader.send({ kind: 'fade-out' });
    await row((row) => row.arm === 'paused' && row.pause === 'fade-out');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await row((row) => row.arm === 'armed');

    await lead({ kind: 'next' }, (snapshot) => snapshot.jump?.section === 'end');
    await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
    // One report carries the playhead from 40 across 42 to the shared beat.
    await play(4.5, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  it("sends no clear for Ancient Gates' End on the beat it shares with Holy Forever's Count Off, after the slide went early, with a lead of a bar", async () => {
    const { play, sent, clockTo } = await leadRig(36, { cuePoints: OVERLAP_CUE_POINTS, leadBeats: 4 });
    await play(3, 39);
    const reported = rig!.clock.now();
    const before = (await sent()).length;

    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await clockTo(reported, 5 * BEAT_MS + 100);
    await play(5.1, 44.1);
    await play(1, 45.1);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0)]);
  });

  // November 8 with Ancient Gates' End taken out: its Interlude, from 32, which clears, runs on to Holy
  // Forever's Count Off on 44. A song with no End never stops Live, so it always plays on into the
  // next song, though its end toggle starts on Stop and the pages show No End in its place.
  const NO_END_CUE_POINTS: CuePoint[] = NOVEMBER_8_CUE_POINTS.filter(({ name }) => name !== '1 - End');

  it("sends Holy Forever's Count Off slide 2 beats before its downbeat when Ancient Gates has no End, its end toggle left on Stop, and not again on the downbeat", async () => {
    const { play, sent, clockTo } = await leadRig(36, { cuePoints: NO_END_CUE_POINTS });
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;

    // Holy Forever's Count Off starts on 44 and shows slide 1; 2 beats before it is 42, 1 beat after
    // the report at 41.
    await clockTo(reported, 1 * BEAT_MS - 100);
    expect((await sent()).slice(before)).toEqual([]);
    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
    await play(3.5, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  it("sends Holy Forever's Count Off slide once when the leader sets Ancient Gates, with no End, to continue and then to stop after the slide went early", async () => {
    const { lead, play, sent, clockTo } = await leadRig(36, { cuePoints: NO_END_CUE_POINTS });
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
    await play(5, 41);
    const reported = rig!.clock.now();
    const before = (await sent()).length;
    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);

    // The toggle does nothing to a song with no End, which plays on into Holy Forever all the same.
    await lead({ kind: 'set-end-toggle', song: 1, toggle: 'stop' }, (snapshot) => snapshot.endToggles[1] === 'stop');
    await play(3.5, 44.5);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0)]);
  });

  it("sends nothing early past Holy Forever's Verse 1 when Holy Forever, the last song, has no End", async () => {
    const { play, sent, clockTo } = await leadRig(50, { cuePoints: NOVEMBER_8_CUE_POINTS.filter(({ name }) => name !== '2 - End') });
    await play(3, 53);
    const reported = rig!.clock.now();
    const before = (await sent()).length;
    // Verse 1, Holy Forever's last section, starts on 56 and shows its first slide; 2 beats before it
    // is 54, 1 beat after the report at 53.
    await clockTo(reported, 1 * BEAT_MS + 100);
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 1)]);

    // On through Verse 1 and four bars past where its End was, on the server's clock too.
    await play(4, 57);
    await clockTo(rig!.clock.now(), 4 * BEAT_MS);
    await play(16, 73);
    await clockTo(rig!.clock.now(), 8 * BEAT_MS);

    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 1)]);
  });
});

// The slide timing file (slide-timing.ts): per-song exceptions to the even split, the bars each slide
// changes on, and to the name match, the group a section shows, each test writing its own file in its
// folder. November 8 from listNovember8(): Ancient Gates' Verse 3 is its group 5 (indexes 7, 8 and 9),
// and Holy Forever's groups 11 (index 21, 1 slide) and 12 (indexes 22 and 23) have no name and hold
// words.
describe('the slide timing file', () => {
  // Writes the slide timing file in the test's folder, as JSON or as the text given, and gives its path.
  async function timingFile(content: unknown): Promise<string> {
    const path = join(folder ?? (await newFolder()), 'slide-timing.json');
    await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
    return path;
  }
  // An armed rig on November 8, with the slide timing file at that path, and the server's clock.
  // Given a lateness log, the server writes it there. setup is as for armedRig.
  async function timingRig(
    position: number,
    {
      cuePoints = SLIDES_CUE_POINTS,
      slideTiming,
      leadBeats,
      latenessLog,
      setup,
    }: { cuePoints?: CuePoint[]; slideTiming?: string; leadBeats?: number | 'default'; latenessLog?: { path: string }; setup?: Omit<LiveSetup, 'position'> } = {},
  ) {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const started = await armedRig({ position, playlist: NOVEMBER_8.id, cuePoints, slideTiming, leadBeats, latenessLog, setup });
    return {
      ...started,
      // Moves the server's clock on to `ms` after the clock time it read at `from`.
      async clockTo(from: number, ms: number) {
        await rig!.advanceConnected(from + ms - rig!.clock.now());
      },
    };
  }

  it("moves Ancient Gates Verse 3's slides to the bars its entry gives, a fractional one included, each with the lead, and none on the even split's", async () => {
    const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', occurrence: 1, changes: [2.5, 6] }] });
    const { play, triggers, clockTo } = await timingRig(104, { slideTiming, leadBeats: 'default' });
    await play(8, 112);
    const reported = rig!.clock.now();
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);

    // Verse 3 starts on beat 112; bar 2.5 is beat 122, and 2 beats before it is 120, 8 beats after the
    // report at 112.
    await clockTo(reported, 8 * BEAT_MS - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    await clockTo(reported, 8 * BEAT_MS);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    // Across the even split's changes, on 124 and 132: nothing.
    await play(12, 124);
    await play(8, 132);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    // Bar 6 is beat 136, sent on 134, 2 beats after the report at 132.
    const atBar5 = rig!.clock.now();
    await clockTo(atBar5, 2 * BEAT_MS - 1);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    await clockTo(atBar5, 2 * BEAT_MS);
    await play(4.5, 136.5);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it("shows Holy Forever's unnamed group 12 for its Outro, which has no group of its name, on the even split, where it would clear, and the check drops the Outro's line and the group's note", async () => {
    const slideTiming = await timingFile({ 'Holy Forever': [{ section: 'Outro', occurrence: 1, group: 12 }] });
    const { play, sent, latest } = await timingRig(40, { cuePoints: HOLY_FOREVER_OUTRO, slideTiming });
    expect((await latest()).check).toEqual(matched(UNNAMED_11));

    await play(8, 48);
    await play(15, 63);
    expect(await sent()).toEqual([trigger(HOLY_FOREVER, 22)]);
    // 2 slides over the Outro's 8 bars: the second at bar 4, beat 64.
    await play(1, 64);
    await play(16, 80);

    expect(await sent()).toEqual([trigger(HOLY_FOREVER, 22), trigger(HOLY_FOREVER, 23), trigger(HOLY_FOREVER, 24)]);
  });

  it('names each entry that breaks a rule as a problem, with the song and the entry, in set order and file order, and checks an entry of a song outside the set by its title alone', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const verse3 = { section: 'Verse 3', occurrence: 1 };
    const slideTiming = await timingFile({
      'Ancient Gates': [
        { section: 'Verse 9', occurrence: 1, changes: [2, 4] },
        { section: 'Verse 3', occurrence: 2, changes: [2, 4] },
        { section: 'Verse 3', occurrence: 0, changes: [2, 4] },
        { section: 'Verse 3', occurrence: 1.5, changes: [2, 4] },
        verse3,
        { ...verse3, group: 0 },
        { ...verse3, group: 19 },
        { ...verse3, changes: '2, 4' },
        { ...verse3, changes: [4] },
        { ...verse3, changes: [6, 3] },
        { ...verse3, changes: [0, 4] },
        { ...verse3, changes: [4, 8] },
        { section: 'Verse 1', occurrence: 1, changes: [4] },
        { section: 'Verse 1', changes: [2] },
        { occurrence: 1, changes: [4] },
      ],
      'Holy Forever': [
        { section: 'Outro', occurrence: 1, group: 14 },
        { section: 'Outro', occurrence: 1, changes: [4] },
      ],
      // Joined after Ancient Gates' list, as its title matches under the name rule.
      'ancient  gates': { section: 'Verse 3' },
      // Not in the set, so only its title is checked, and the fake's library holds it.
      'Worthy Of It All': [{ section: 'No Such Section' }],
    });

    const { shown } = await pickedRig(NOVEMBER_8.id, TIMING_CHECKED, slideTiming);

    expect(shown.check).toEqual(
      fileCheck({
        // Live sits in Ancient Gates, so Holy Forever's meter is not read, and none of its entries
        // breaks a rule that needs it.
        notes: ['Ancient Gates: no group End, clears', 'Holy Forever: no group Outro, clears', 'Holy Forever: no group End, clears', 'Holy Forever: meter not read yet', UNNAMED_11, UNNAMED_12],
        problems: [
          'Ancient Gates: slide timing Verse 9 1, no section Verse 9',
          'Ancient Gates: slide timing Verse 3 2, the song has 1 section Verse 3',
          'Ancient Gates: slide timing Verse 3 0, occurrence must be a whole number from 1',
          'Ancient Gates: slide timing Verse 3 1.5, occurrence must be a whole number from 1',
          'Ancient Gates: slide timing Verse 3 1, needs changes, a group or a start',
          'Ancient Gates: slide timing Verse 3 1, no group 0, the presentation has 18',
          'Ancient Gates: slide timing Verse 3 1, no group 19, the presentation has 18',
          'Ancient Gates: slide timing Verse 3 1, changes must be a list of bars',
          'Ancient Gates: slide timing Verse 3 1, 1 change for 3 slides, needs 2',
          'Ancient Gates: slide timing Verse 3 1, changes must go up',
          "Ancient Gates: slide timing Verse 3 1, change 0 is outside the section's 8 bars",
          "Ancient Gates: slide timing Verse 3 1, change 8 is outside the section's 8 bars",
          'Ancient Gates: slide timing Verse 1 1, a second entry for the section, the first stands',
          'Ancient Gates: slide timing entry 15, needs a section',
          'Ancient Gates: slide timing must be a list of entries',
          'Holy Forever: slide timing Outro 1, no group 14, the presentation has 13',
          'Holy Forever: slide timing Outro 1, no group Outro for its changes',
        ],
      }),
    );
  });

  it('names a title that matches no song in the set or in the libraries, a typo of a song in the set included, as the file spells it', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const slideTiming = await timingFile({ 'Holy Forevr': [{ section: 'Outro', occurrence: 1, group: 12 }] });

    const { shown } = await pickedRig(NOVEMBER_8.id, TIMING_CHECKED, slideTiming);

    expect(shown.check.kind === 'unmatched' ? shown.check.problems : []).toEqual(["Holy Forevr: slide timing for no song in the set or in ProPresenter's libraries"]);
  });

  it("names the titles it could not check as one problem when ProPresenter's libraries cannot be read", async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    pro.refuseLibraries(500);
    const slideTiming = await timingFile({
      'Holy Forevr': [{ section: 'Outro', occurrence: 1, group: 12 }],
      'Holy Forever': [{ section: 'Outro', occurrence: 1, group: 12 }],
      'There Is Freedom': [{ section: 'Bridge 1', group: 9 }],
    });

    const { shown } = await pickedRig(NOVEMBER_8.id, TIMING_CHECKED, slideTiming);

    expect(shown.check.kind === 'unmatched' ? shown.check.problems : []).toEqual(["slide timing Holy Forevr, There Is Freedom: not checked, ProPresenter's libraries could not be read"]);
  });

  // The fake answers GET /v1/libraries with the recorded v1_libraries.json, the flat list the home
  // ProPresenter sends (setlist-controller#326).
  it('checks the title of a song outside the set against the recorded flat list of libraries, by its title alone, under the name rule', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const slideTiming = await timingFile({ 'there is  freedom': [{ section: 'No Such Section' }] });

    const { shown } = await pickedRig(NOVEMBER_8.id, TIMING_CHECKED, slideTiming);

    expect(shown.check).toEqual(matched('Ancient Gates: no group End, clears', 'Holy Forever: no group Outro, clears', 'Holy Forever: no group End, clears', 'Holy Forever: meter not read yet', UNNAMED_11, UNNAMED_12));
    expect(pro.requests.map(({ path }) => path)).toContain('/v1/libraries');
  });

  it('reads no library when every title in the file is a song in the set', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const slideTiming = await timingFile({ 'holy  forever': [{ section: 'Outro', occurrence: 1, group: 12 }] });

    const { shown } = await pickedRig(NOVEMBER_8.id, TIMING_CHECKED, slideTiming);
    await pro.idle();

    expect(shown.check).toEqual(matched('Ancient Gates: no group End, clears', 'Holy Forever: meter not read yet', UNNAMED_11));
    expect(pro.requests.map(({ path }) => path).filter((path) => path.startsWith('/v1/librar'))).toEqual([]);
  });

  it("sends Verse 3's even split when its entry's changes do not go up", async () => {
    const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', occurrence: 1, changes: [6, 3] }] });
    const { play, triggers } = await timingRig(104, { slideTiming });

    await play(8, 112);
    await play(11, 123);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    await play(1, 124);
    await play(7, 131);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    await play(1, 132);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it("takes the changes of Verse 3, the last section of Ancient Gates with no End, on the 8 bars to Holy Forever's first locator, with no problem", async () => {
    const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', occurrence: 1, changes: [2, 6] }] });
    const { play, latest, triggers } = await timingRig(104, { cuePoints: noEndThenHolyForever(144), slideTiming });

    expect((await latest()).check).toEqual(
      matched('Ancient Gates: no group Intro, shows slide 1', 'Ancient Gates: 1 section Chorus 1, 3 groups', 'Holy Forever: no group Count Off, shows slide 1', 'Holy Forever: meter not read yet', UNNAMED_11, UNNAMED_12),
    );
    // Bar 2 is beat 120 and bar 6 beat 136; the even split's 124 and 132 send nothing.
    await play(8, 112);
    await play(7, 119);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    await play(1, 120);
    await play(15, 135);
    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    await play(1, 136);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it("still shows only slide 1 of the last section of the set's last song with no End, and its entry's changes are a problem", async () => {
    const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', occurrence: 1, changes: [2, 6] }] });
    const { play, latest, triggers } = await timingRig(104, { cuePoints: SLIDES_CUE_POINTS.slice(0, 5), slideTiming });

    expect((await latest()).check).toEqual(
      fileCheck({ problems: ['Ancient Gates: slide timing Verse 3 1, changes on a section with no end'], notes: ['Ancient Gates: no group Intro, shows slide 1', 'Ancient Gates: 1 section Chorus 1, 3 groups'] }),
    );
    await play(8, 112);
    await play(32, 144);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
  });

  it("still clears for the Outro when its entry's group is past the presentation's groups", async () => {
    const slideTiming = await timingFile({ 'Holy Forever': [{ section: 'Outro', occurrence: 1, group: 14 }] });
    const { play, sent } = await timingRig(40, { cuePoints: HOLY_FOREVER_OUTRO, slideTiming });

    await play(8, 48);

    expect(await sent()).toEqual([CLEAR]);
  });

  it('checks as with no file when the file at the path is missing', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();

    const { shown } = await pickedRig(NOVEMBER_8.id, HOLY_FOREVER_OUTRO, join(await newFolder(), 'no-such-slide-timing.json'));

    expect(shown.check).toEqual(matched('Holy Forever: no group Outro, clears', 'Holy Forever: no group End, clears', UNNAMED_11, UNNAMED_12));
  });

  it('names a file that is not valid JSON as one problem, and the cues use the even split', async () => {
    const slideTiming = await timingFile('{ "Ancient Gates": [{ "section": "Verse 3", "changes": [2.5, 6] }]');
    const { play, triggers, row } = await timingRig(104, { slideTiming });

    const shown = await row((row) => row.check.kind === 'unmatched' && row.check.problems.length > 0 && !row.check.problems.includes('no playlist picked'));
    expect(shown.check.kind === 'unmatched' && shown.check.problems).toEqual([expect.stringMatching(new RegExp(`^slide timing file ${escaped(slideTiming)}: is not valid JSON: .+`))]);
    await play(8, 112);
    await play(12, 124);
    await play(8, 132);

    expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8), trigger(ANCIENT_GATES, 9)]);
  });

  it('names a file whose top level is a list as one problem, after the no playlist picked problem', async () => {
    const slideTiming = await timingFile([{ section: 'Verse 3', changes: [2.5, 6] }]);
    const { row } = await proRig({ cuePoints: CHECKED_SET, slideTiming });

    const problem = `slide timing file ${slideTiming}: must be an object of songs, and its top level is a list`;
    const shown = await row((row) => row.check.kind !== 'not-checked');

    expect(shown.check).toEqual(fileCheck({ problems: ['no playlist picked', problem] }));
  });

  it('picks up an edit to the file on Refresh, with nothing to restart, and a second edit that breaks the entry on the next Refresh', async () => {
    const slideTiming = join(await newFolder(), 'slide-timing.json');
    const { play, sent, row, leader, next } = await timingRig(40, { cuePoints: HOLY_FOREVER_OUTRO, slideTiming });
    await row(sameCheck(matched('Holy Forever: no group Outro, clears', 'Holy Forever: no group End, clears', UNNAMED_11, UNNAMED_12)));

    await timingFile({ 'Holy Forever': [{ section: 'Outro', occurrence: 1, group: 12 }] });
    leader.send({ kind: 'refresh' });
    await row(sameCheck(matched(UNNAMED_11)));
    await play(8, 48);
    expect(await sent()).toEqual([trigger(HOLY_FOREVER, 22)]);

    await timingFile({ 'Holy Forever': [{ section: 'Outro', occurrence: 1, group: 99 }] });
    leader.send({ kind: 'refresh' });
    await row(
      sameCheck(
        fileCheck({ problems: ['Holy Forever: slide timing Outro 1, no group 99, the presentation has 13'], notes: ['Holy Forever: no group Outro, clears', 'Holy Forever: no group End, clears', UNNAMED_11, UNNAMED_12] }),
      ),
    );
    const back = next((snapshot) => near(snapshot.position, 40));
    rig!.live.setPosition(40);
    await back;
    await play(8, 48);

    expect((await sent()).at(-1)).toBe(CLEAR);
  });
  // A slide timing entry's start: slide 1 of its section goes up that many bars before the section's
  // start, less the lead, for a sung line that starts on a pickup.
  describe('the pickup start', () => {
    it("names a start of 0, of 1, a start that is not a number, and one that passes Verse 1's last change as problems, in file order", async () => {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      // Verse 1, from 0 to 32, shows its 2 slides on the even split, the second on bar 4, beat 16;
      // Verse 3 starts on 32, so a start of -5 lands on beat 12 and one of -3 on beat 20.
      const slideTiming = await timingFile({
        'Ancient Gates': [
          { section: 'Verse 3', start: 0 },
          { section: 'Verse 3', start: -5 },
          { section: 'Verse 3', start: 1 },
          { section: 'Verse 3', start: '-1' },
        ],
        'Holy Forever': [{ section: 'Outro', start: -1 }],
      });

      const { shown } = await pickedRig(NOVEMBER_8.id, TIMING_CHECKED, slideTiming);

      expect(shown.check).toEqual(
        fileCheck({
          notes: ['Ancient Gates: no group End, clears', 'Holy Forever: no group Outro, clears', 'Holy Forever: no group End, clears', 'Holy Forever: meter not read yet', UNNAMED_11, UNNAMED_12],
          problems: [
            'Ancient Gates: slide timing Verse 3 1, start must be a negative number of bars',
            "Ancient Gates: slide timing Verse 3 1, start -5 passes Verse 1's last change",
            'Ancient Gates: slide timing Verse 3 1, start must be a negative number of bars',
            'Ancient Gates: slide timing Verse 3 1, start must be a negative number of bars',
            'Holy Forever: slide timing Outro 1, no group Outro for its start',
          ],
        }),
      );
    });

    it('takes an entry with only a start, which lands after the section before its last change', async () => {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      // Verse 3 starts on 32, so a start of -2 lands on 24, after Verse 1's change on 16.
      const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', start: -2 }] });

      const { shown } = await pickedRig(NOVEMBER_8.id, TIMING_CHECKED, slideTiming);

      expect(shown.check).toEqual(matched('Ancient Gates: no group End, clears', 'Holy Forever: no group Outro, clears', 'Holy Forever: no group End, clears', 'Holy Forever: meter not read yet', UNNAMED_11, UNNAMED_12));
    });

    it("sends Ancient Gates Verse 3's first slide half a bar before its start less 2 beats, not again on its downbeat, and its next change with the 2-beat lead", async () => {
      const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', start: -0.5 }] });
      const { play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      const reported = rig!.clock.now();

      // Verse 3 starts on 112; half a bar before it is 110, and 2 beats before that 108, 4 beats after
      // the report at 104.
      await clockTo(reported, 4 * BEAT_MS - 1);
      expect(await triggers()).toEqual([]);
      await clockTo(reported, 4 * BEAT_MS);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      await play(4, 108);
      await play(4.5, 112.5);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      // Verse 3's second slide, on the even split's bar 3, beat 124, goes on 122.
      const downbeat = rig!.clock.now();
      await clockTo(downbeat, 9.5 * BEAT_MS - 1);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      await clockTo(downbeat, 9.5 * BEAT_MS);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    });

    it("sends Verse 3's first slide 2 beats before its downbeat when its entry's start is 0", async () => {
      const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', start: 0 }] });
      const { play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      const reported = rig!.clock.now();

      await clockTo(reported, 6 * BEAT_MS - 1);
      expect(await triggers()).toEqual([]);
      await clockTo(reported, 6 * BEAT_MS);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    });

    it("sends Verse 3's first slide 2 beats before its downbeat when its entry's start passes Chorus 1's last change", async () => {
      // Chorus 1, from 80 to 112, changes on 96; a start of -5 lands on 92.
      const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', start: -5 }] });
      const { play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      const reported = rig!.clock.now();

      await clockTo(reported, 6 * BEAT_MS - 1);
      expect(await triggers()).toEqual([]);
      await clockTo(reported, 6 * BEAT_MS);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    });

    it("logs Verse 3's first slide, played into on its downbeat with no send early, as late against its pickup less the lead", async () => {
      const path = join(await newFolder(), 'cue-lateness.log');
      const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', start: -0.5 }] });
      const { play, triggers } = await timingRig(100, { slideTiming, leadBeats: 'default', latenessLog: { path } });
      await play(4, 104);
      // One report from 104 across the pickup on 110 to a quarter beat past Verse 3's downbeat: due on
      // 108, 4.25 beats before it.
      await play(8.25, 112.25);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      await rig!.close();
      rig = undefined;

      expect((await latenessLines(path)).map(({ section, slide, lateMs }) => ({ section, slide, lateMs }))).toEqual([{ section: 'Verse 3', slide: 7, lateMs: 2125 }]);
    });

    // Holy Forever from listNovember8() in 4/4 with its choruses 8 bars each, as in the 8 November set:
    // Chorus 1 (slides 9 and 10) three times and Chorus 2 (16 and 17) twice, after Verse 1 (1 to 4) and
    // Verse 2 (11 to 14), each with a pickup start of half a bar.
    const HOLY_FOREVER_CHORUSES: CuePoint[] = [
      { name: '1 - Intro (Holy Forever)', time: 0 },
      { name: '1 - Verse 1', time: 16 },
      { name: '1 - Chorus 1', time: 48 },
      { name: '1 - Verse 2', time: 80 },
      { name: '1 - Chorus 1', time: 112 },
      { name: '1 - Chorus 2', time: 144 },
      { name: '1 - Chorus 1', time: 176 },
      { name: '1 - Chorus 2', time: 208 },
      { name: '1 - End', time: 240 },
    ];
    const HOLY_FOREVER_PICKUPS = {
      'Holy Forever': [
        { section: 'Chorus 1', occurrence: 1, start: -0.5 },
        { section: 'Chorus 1', occurrence: 2, start: -0.5 },
        { section: 'Chorus 1', occurrence: 3, start: -0.5 },
        { section: 'Chorus 2', occurrence: 1, start: -0.5 },
        { section: 'Chorus 2', occurrence: 2, start: -0.5 },
      ],
    };

    it("sends each of Holy Forever's choruses' first slide at its start plus its pickup less 2 beats at 72 BPM, and not again on the downbeat, while Verse 2 keeps the 2-beat lead", async () => {
      const slideTiming = await timingFile(HOLY_FOREVER_PICKUPS);
      const { next, sent, clockTo } = await timingRig(8, { cuePoints: HOLY_FOREVER_CHORUSES, slideTiming, leadBeats: 'default' });
      const beatMs = 60_000 / 72;
      rig!.live.setTempo(72);
      let at = 8;
      const playTo = async (to: number) => {
        const seen = next((snapshot) => near(snapshot.position, to));
        rig!.live.advance((to - at) * beatMs);
        at = to;
        await seen;
      };
      // What ProPresenter gets from a report on `report`, just before `beats` later on the server's
      // clock and on it.
      const sentFrom = async (report: number, beats: number) => {
        await playTo(report);
        const reported = rig!.clock.now();
        const before = (await sent()).length;
        await clockTo(reported, beats * beatMs - 1);
        const early = (await sent()).slice(before);
        await clockTo(reported, beats * beatMs);
        return { early, on: (await sent()).slice(before) };
      };

      // Verse 2 on 80 goes 2 beats before it, on 78.
      expect(await sentFrom(72, 6)).toEqual({ early: [], on: [trigger(HOLY_FOREVER, 11)] });
      for (const [chorus, slide] of [
        [112, 9],
        [144, 16],
        [176, 9],
        [208, 16],
      ] as const) {
        // The pickup is 2 beats before the chorus, sent 2 beats before that: 4 beats after a report 8
        // beats before the chorus.
        expect(await sentFrom(chorus - 8, 4)).toEqual({ early: [], on: [trigger(HOLY_FOREVER, slide)] });
        const before = (await sent()).length;
        await playTo(chorus - 1);
        await playTo(chorus + 0.5);
        expect((await sent()).slice(before)).toEqual([]);
      }
    });

    it("sends Holy Forever's first Chorus 1's first slide at its pickup less 2 beats when played into from Verse 1", async () => {
      const slideTiming = await timingFile(HOLY_FOREVER_PICKUPS);
      const { play, sent, clockTo } = await timingRig(32, { cuePoints: HOLY_FOREVER_CHORUSES, slideTiming, leadBeats: 'default' });
      await play(8, 40);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      // Chorus 1 on 48, its pickup on 46, sent on 44.
      await clockTo(reported, 4 * BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([]);
      await clockTo(reported, 4 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 9)]);
      await play(8.5, 48.5);

      expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 9)]);
    });

    // Ancient Gates on SLIDES_CUE_POINTS with Verse 3, on 112, starting half a bar early: its first
    // slide's pickup is on 110, sent on 108.
    const VERSE_3_PICKUP = { 'Ancient Gates': [{ section: 'Verse 3', start: -0.5 }] };

    it("sends Verse 3's first slide on a drag forward inside Chorus 1 across its pickup, and not again on its downbeat", async () => {
      // A bar early: the pickup on 108, sent on 106, and a drag from 104 to 109, before 110, where
      // Verse 3's first slide would go with no start.
      const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', start: -1 }] });
      const { next, play, triggers } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      const dragged = next((snapshot) => near(snapshot.position, 109));
      rig!.live.setPosition(109);
      await dragged;
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      await play(3.5, 112.5);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    });

    it("keeps Verse 3's first slide, sent for its pickup, as the screen's between the pickup and the downbeat: Fire again sends it, the downbeat does not, and its next change still goes", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { producer, play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      await clockTo(rig!.clock.now(), 4 * BEAT_MS);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      // A report on 111, past the pickup and 3 beats off the prediction, looks ahead again from it.
      await play(7, 111);
      const reported = rig!.clock.now();
      producer.send({ kind: 'fire-again', target: 'propresenter' });
      await vi.waitFor(async () => expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 7)]));

      // Verse 3's second slide, on 124, goes on 122, 11 beats after the report, with no report between.
      await clockTo(reported, 11 * BEAT_MS - 1);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 7)]);
      await clockTo(reported, 11 * BEAT_MS);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
      await play(1.5, 112.5);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 8)]);
    });

    it("sends Verse 3's first slide on the report that plays across its pickup with a leadBeats of 0, and not again on its downbeat", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { play, triggers } = await timingRig(100, { slideTiming, leadBeats: 0 });
      await play(4, 104);
      await play(5.5, 109.5);
      expect(await triggers()).toEqual([]);
      await play(1, 110.5);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      await play(2, 112.5);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
    });

    it("sends Verse 3's first slide at once on a jump landing and on Fire again, with no earlier start", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { lead, producer, play, triggers } = await timingRig(8, { slideTiming, leadBeats: 'default' });
      await play(2.5, 10.5);
      const before = (await triggers()).length;
      // The bar line after 10.5 is 12, where Live lands the jump on Verse 3, at 112.
      await lead({ kind: 'jump', song: 1, section: 4 }, (snapshot) => snapshot.jump?.section === 4);
      await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
      await play(2, 112.5);
      expect((await triggers()).slice(before)).toEqual([trigger(ANCIENT_GATES, 7)]);
      producer.send({ kind: 'fire-again', target: 'propresenter' });

      await vi.waitFor(async () => expect((await triggers()).slice(before)).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 7)]));
    });

    it("sends Verse 3's first slide at once on a start mid-section", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { next, triggers } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      const stopped = next((snapshot) => !snapshot.playing);
      rig!.live.setPlaying(false);
      await stopped;
      const parked = next((snapshot) => near(snapshot.position, 116));
      rig!.live.setPosition(116);
      await parked;
      const before = (await triggers()).length;
      const started = next((snapshot) => snapshot.playing);
      rig!.live.setPlaying(true);
      await started;

      await vi.waitFor(async () => expect((await triggers()).slice(before)).toEqual([trigger(ANCIENT_GATES, 7)]));
    });

    // The leader's Loop press in Chorus 1's last fraction of a beat, after Verse 3's first slide went
    // early for its pickup: the press sends the wrap's slide over it, and Live, its playhead already
    // past 112 when the loop reaches it, plays on into Verse 3 without wrapping.
    it("sends Verse 3's first slide back on its downbeat when the leader's Loop press reaches Live after its playhead passed Chorus 1's end, with a pickup start", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { leader, next, play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      let reported = rig!.clock.now();
      await clockTo(reported, 4 * BEAT_MS + 100);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      await play(7.8, 111.8);
      reported = rig!.clock.now();
      await clockTo(reported, 0.1 * BEAT_MS);

      // Live plays on to 112.05 with its reports held, then takes the press there.
      rig!.live.holdReplies();
      rig!.live.advance(0.25 * BEAT_MS);
      leader.send({ kind: 'loop' });
      await vi.waitFor(() => expect(rig!.received('/live/song/set/loop')).toHaveLength(1));
      // The press braces Chorus 1 from the report at 111.8, so the wrap's slide went at once.
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 5)]);
      const looped = next((snapshot) => snapshot.loop?.section?.section === 3);
      rig!.live.releaseReplies();
      await looped;
      await play(0.45, 112.5);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 7)]);
    });

    it("sends Worthy Of It All's first slide at its pickup less 2 beats when Holy Forever plays on into it, and nothing for Holy Forever's End inside that lead", async () => {
      // Holy Forever ends on 14, and Worthy Of It All's Verse 1 starts on 16, its pickup on 15, sent on
      // 13: the End falls inside the lead.
      const cuePoints: CuePoint[] = [
        { name: '1 - Count Off (Holy Forever)', time: 4 },
        { name: '1 - Intro', time: 8 },
        { name: '1 - End', time: 14 },
        { name: '2 - Verse 1 (Worthy Of It All)', time: 16 },
        { name: '2 - Chorus', time: 32 },
        { name: '2 - End', time: 48 },
      ];
      const slideTiming = await timingFile({ 'Worthy Of It All': [{ section: 'Verse 1', start: -0.25 }] });
      const { lead, play, sent, clockTo } = await timingRig(10, { cuePoints, slideTiming, leadBeats: 'default' });
      await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
      await play(2, 12);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      await clockTo(reported, BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([]);
      await clockTo(reported, BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
      await play(1.5, 13.5);
      await play(3, 16.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
    });

    // Holy Forever with its last section an Interlude, which has no group in Holy Forever and so
    // clears, with or without an End. Worthy Of It All's Verse 1 starts on 16.
    const interludeCuePoints = (interlude: number, end?: number): CuePoint[] => [
      { name: '1 - Count Off (Holy Forever)', time: 4 },
      { name: '1 - Intro', time: 8 },
      { name: '1 - Interlude', time: interlude },
      ...(end === undefined ? [] : [{ name: '1 - End', time: end }]),
      { name: '2 - Verse 1 (Worthy Of It All)', time: 16 },
      { name: '2 - Chorus', time: 32 },
      { name: '2 - End', time: 48 },
    ];
    // Verse 1's pickup a quarter bar before it, on 15, sent on 13 with the 2-beat lead.
    const VERSE_1_PICKUP = { 'Worthy Of It All': [{ section: 'Verse 1', start: -0.25 }] };

    it("sends Worthy Of It All's first slide at its pickup less 2 beats, and never the clear of Holy Forever's last section inside that lead, when Holy Forever has no End", async () => {
      // The Interlude clears on 14, after the pickup goes on 13. A song with no End always plays on.
      const slideTiming = await timingFile(VERSE_1_PICKUP);
      const { play, sent, clockTo } = await timingRig(10, { cuePoints: interludeCuePoints(14), slideTiming, leadBeats: 'default' });
      await play(2, 12);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      await clockTo(reported, BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([]);
      await clockTo(reported, BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
      await play(1, 13);
      await play(1.5, 14.5);
      await play(2, 16.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
    });

    it("sends Worthy Of It All's first slide at its pickup less 2 beats, and neither the clear of Holy Forever's last section nor its End inside that lead, when Holy Forever plays on into it", async () => {
      // The Interlude clears on 13.5 and the End is on 14, both after the pickup goes on 13.
      const slideTiming = await timingFile(VERSE_1_PICKUP);
      const { lead, play, sent, clockTo } = await timingRig(10, { cuePoints: interludeCuePoints(13.5, 14), slideTiming, leadBeats: 'default' });
      await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
      await play(2, 12);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      await clockTo(reported, BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([]);
      await clockTo(reported, BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
      await play(1.75, 13.75);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
      await play(0.5, 14.25);
      expect(await sent()).not.toContain(trigger(HOLY_FOREVER, 24));
      await play(2.25, 16.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
    });

    it("sends the clear of Holy Forever's last section on its downbeat, and Worthy Of It All's first slide after it, when the pickup comes due after that downbeat", async () => {
      // The Interlude clears on 12.5, before the pickup goes on 13.
      const slideTiming = await timingFile(VERSE_1_PICKUP);
      const { play, sent, clockTo } = await timingRig(10, { cuePoints: interludeCuePoints(12.5), slideTiming, leadBeats: 'default' });
      await play(2, 12);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      // On 13, with no report across the Interlude yet, the pickup does not go ahead of its clear.
      await clockTo(reported, BEAT_MS);
      expect((await sent()).slice(before)).toEqual([]);
      await play(0.75, 12.75);
      expect((await sent()).slice(before)).toEqual([CLEAR]);
      const downbeat = rig!.clock.now();
      await clockTo(downbeat, 0.25 * BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([CLEAR]);
      await clockTo(downbeat, 0.25 * BEAT_MS);

      expect((await sent()).slice(before)).toEqual([CLEAR, trigger(WORTHY_OF_IT_ALL, 1)]);
    });

    it("sends nothing early for Worthy Of It All, and the clear of Holy Forever's last section on its downbeat, when Holy Forever stops at its End", async () => {
      // Holy Forever's End on 14 is 2 beats before Worthy Of It All, so its end toggle starts on Stop.
      const slideTiming = await timingFile(VERSE_1_PICKUP);
      const { producer, play, sent, clockTo } = await timingRig(10, { cuePoints: interludeCuePoints(13.5, 14), slideTiming, leadBeats: 'default' });
      expect((await producer.snapshot(loaded)).endToggles[1]).toBe('stop');
      await play(2, 12);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      await clockTo(reported, BEAT_MS);
      expect((await sent()).slice(before)).toEqual([]);
      await play(1.75, 13.75);

      expect((await sent()).slice(before)).toEqual([CLEAR]);
    });

    it("sends only Worthy Of It All's first slide, in place of the clear of Holy Forever's last section, when a Fade out dropped the slide before it went, and nothing on its downbeat", async () => {
      // The Interlude clears on 14, after the pickup's send point on 13 (setlist-controller#371).
      const slideTiming = await timingFile(VERSE_1_PICKUP);
      const { leader, producer, row, play, sent, clockTo } = await timingRig(10, { cuePoints: interludeCuePoints(14), slideTiming, leadBeats: 'default' });
      await play(2, 12);
      const reported = rig!.clock.now();
      const before = (await sent()).length;
      // The pickup waits for 13. The leader fades out, which drops it, and the producer arms
      // ProPresenter again before then.
      leader.send({ kind: 'fade-out' });
      await row((row) => row.arm === 'paused' && row.pause === 'fade-out');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await row((row) => row.arm === 'armed');
      await clockTo(reported, 2 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([]);
      await play(2.25, 14.25);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
      await play(2.25, 16.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
    });

    it("sends the clear of Holy Forever's last section on its downbeat, and Worthy Of It All's first slide at once after it, when that slide is not on a pickup", async () => {
      // Verse 1's first slide is on 16, due on 14 with the lead, the Interlude's downbeat: a lead never
      // reaches back before a clear, but for a pickup.
      const slideTiming = await timingFile({});
      const { play, sent, clockTo } = await timingRig(10, { cuePoints: interludeCuePoints(14), slideTiming, leadBeats: 'default' });
      await play(2, 12);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      // On 14, the slide's go time, with no report across the Interlude yet, it waits for the clear.
      await clockTo(reported, 2 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([]);
      await play(2.25, 14.25);
      expect((await sent()).slice(before)).toEqual([CLEAR, trigger(WORTHY_OF_IT_ALL, 1)]);
      await play(2.25, 16.5);

      expect((await sent()).slice(before)).toEqual([CLEAR, trigger(WORTHY_OF_IT_ALL, 1)]);
    });

    // The start of a song's first section counts its bars in that song's own meter, not in the
    // signature of the song before, which Live still reports while the playhead plays toward it.
    it("sends Worthy Of It All's first slide at its pickup counted in its own 4/4 when Ancient Gates in 6/8 plays on into it", async () => {
      // Ancient Gates ends on 12, and Worthy Of It All's Verse 1 starts on 16. Three quarters of a bar
      // of 4/4 is 3 beats, so its pickup is on 13, sent on 11; in 6/8 it would be 2.25 beats, on 13.75.
      const cuePoints: CuePoint[] = [
        { name: '1 - Intro (Ancient Gates)', time: 0 },
        { name: '1 - End', time: 12 },
        { name: '2 - Verse 1 (Worthy Of It All)', time: 16 },
        { name: '2 - Chorus', time: 32 },
        { name: '2 - End', time: 48 },
      ];
      const slideTiming = await timingFile({ 'Worthy Of It All': [{ section: 'Verse 1', start: -0.75 }] });
      const { lead, next, play, sent, clockTo } = await timingRig(20, { cuePoints, slideTiming, leadBeats: 'default', setup: { playing: false } });
      await lead({ kind: 'set-end-toggle', song: 1, toggle: 'continue' }, (snapshot) => snapshot.endToggles[1] === 'continue');
      // Live stopped in Worthy Of It All in 4/4, then clicked into Ancient Gates in 6/8, reads both.
      await walkStopped(next, { position: 4, numerator: 6, denominator: 8 });
      const started = next((snapshot) => snapshot.playing);
      rig!.live.setPlaying(true);
      await started;
      await play(4, 8);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      await clockTo(reported, 3 * BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([]);
      await clockTo(reported, 3 * BEAT_MS);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 1)]);
    });

    it("never sends the Chorus's first slide for its pickup while Worthy Of It All's Verse 1 before it is looped, and brings Verse 1's first slide back before the wrap", async () => {
      // Verse 1, from 0 to 16, changes on 4 and 12; the Chorus's pickup is 2.5 beats before 16, on
      // 13.5, sent on 11.5.
      const slideTiming = await timingFile({ 'Worthy Of It All': [{ section: 'Chorus', occurrence: 1, start: -0.625 }] });
      const { lead, play, sent, clockTo } = await timingRig(4, { cuePoints: WORTHY_OF_IT_ALL_CUE_POINTS, slideTiming, leadBeats: 'default' });
      await play(4, 8);
      await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 0);
      const before = (await sent()).length;
      await play(2, 10);
      const reported = rig!.clock.now();

      // Verse 1's change on 12 goes on 10, at once; the wrap's slide on 14.
      await clockTo(reported, 4 * BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 3)]);
      await clockTo(reported, 4 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 3), trigger(WORTHY_OF_IT_ALL, 1)]);
      await play(4, 14);
      await play(2.5, 0.5);

      expect(await sent()).not.toContain(trigger(WORTHY_OF_IT_ALL, 4));
    });

    // Worthy Of It All with an 8-bar Bridge (slides 18 to 21, the last on 88), a 1-bar Vamp on 96 with
    // no group, which clears, and the Chorus's second occurrence (slides 11 to 13) on 100.
    const VAMP_CUE_POINTS: CuePoint[] = [
      { name: '1 - Verse 1 (Worthy Of It All)', time: 0 },
      { name: '1 - Chorus', time: 32 },
      { name: '1 - Bridge', time: 64 },
      { name: '1 - Vamp', time: 96 },
      { name: '1 - Chorus', time: 100 },
      { name: '1 - End', time: 132 },
    ];
    const vampRig = async (start: number, leadBeats: number | 'default' = 'default', latenessLog?: { path: string }) => {
      const slideTiming = await timingFile({ 'Worthy Of It All': [{ section: 'Chorus', occurrence: 2, start }] });
      return timingRig(84, { cuePoints: VAMP_CUE_POINTS, slideTiming, leadBeats, latenessLog });
    };

    it("blanks the screen when the playhead is dragged back inside the Vamp after the Chorus's first slide went early, and sends that slide once more on its lead", async () => {
      const slideTiming = await timingFile({});
      const { next, play, sent, clockTo } = await timingRig(84, { cuePoints: VAMP_CUE_POINTS, slideTiming, leadBeats: 'default' });
      await play(12.25, 96.25);
      const reported = rig!.clock.now();
      const before = (await sent()).length;
      expect((await sent()).at(-1)).toBe(CLEAR);

      await clockTo(reported, 1.75 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
      await play(2, 98.25);

      const dragged = next((snapshot) => near(snapshot.position, 96.5));
      rig!.live.setPosition(96.5);
      await dragged;
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11), CLEAR]);
      await play(4, 100.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11), CLEAR, trigger(WORTHY_OF_IT_ALL, 11)]);
    });

    it("sends the Chorus's first slide 4.5 beats before it at 71 BPM, before the Vamp's downbeat, and never the Vamp's clear", async () => {
      const { next, sent, clockTo } = await vampRig(-0.625);
      const beatMs = 60_000 / 71;
      rig!.live.setTempo(71);
      let at = 84;
      const playTo = async (to: number) => {
        const seen = next((snapshot) => near(snapshot.position, to));
        rig!.live.advance((to - at) * beatMs);
        at = to;
        await seen;
      };
      await playTo(90);
      const reported = rig!.clock.now();
      const before = (await sent()).length;
      expect((await sent()).at(-1)).toBe(trigger(WORTHY_OF_IT_ALL, 21));

      // The Chorus on 100, its pickup on 97.5, sent on 95.5, 5.5 beats after the report at 90.
      await clockTo(reported, 5.5 * beatMs - 1);
      expect((await sent()).slice(before)).toEqual([]);
      await clockTo(reported, 5.5 * beatMs);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
      await playTo(96.5);
      await playTo(98);
      await playTo(100.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
    });

    it("sends the Vamp's clear on its downbeat, and the Chorus's first slide after it, when the start comes due after that downbeat", async () => {
      const { play, sent, clockTo } = await vampRig(-0.25);
      await play(6, 90);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      // The pickup on 99 is sent on 97, after the Vamp's downbeat on 96.
      await clockTo(reported, 6 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([]);
      await play(6.25, 96.25);
      expect((await sent()).slice(before)).toEqual([CLEAR]);
      const downbeat = rig!.clock.now();
      await clockTo(downbeat, 0.75 * BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([CLEAR]);
      await clockTo(downbeat, 0.75 * BEAT_MS);

      expect((await sent()).slice(before)).toEqual([CLEAR, trigger(WORTHY_OF_IT_ALL, 11)]);
    });

    it("sends the Vamp's clear on its downbeat, and the Chorus's first slide on the report across its pickup, with a leadBeats of 0", async () => {
      const { play, sent } = await vampRig(-0.625, 0);
      await play(6, 90);
      const before = (await sent()).length;

      await play(6.25, 96.25);
      expect((await sent()).slice(before)).toEqual([CLEAR]);
      await play(1, 97.25);
      expect((await sent()).slice(before)).toEqual([CLEAR]);
      await play(0.5, 97.75);
      expect((await sent()).slice(before)).toEqual([CLEAR, trigger(WORTHY_OF_IT_ALL, 11)]);
      await play(2.75, 100.5);

      expect((await sent()).slice(before)).toEqual([CLEAR, trigger(WORTHY_OF_IT_ALL, 11)]);
    });

    it("never sends the wrap's slide before the Vamp's clear when a brace set by hand ends inside the Vamp, inside the lead after its downbeat, and never the Chorus's", async () => {
      const { next, play, sent, clockTo } = await vampRig(-0.625);
      await play(6, 90);
      // A brace from the Bridge's start, 64, to 97: the wrap's slide, the Bridge's first, would go on
      // 95, before the Vamp clears on 96.
      const on = next((snapshot) => snapshot.loop !== null);
      rig!.live.setLoop({ on: true, start: 64, length: 33 });
      await on;
      const reported = rig!.clock.now();
      const before = (await sent()).length;
      await clockTo(reported, 6 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([]);
      await play(6.25, 96.25);

      expect((await sent()).slice(before)).toEqual([CLEAR, trigger(WORTHY_OF_IT_ALL, 18)]);
      expect(await sent()).not.toContain(trigger(WORTHY_OF_IT_ALL, 11));
    });

    // The rig above, the Chorus's pickup on 97.5, sent on 95.5, once a Fade out dropped that slide
    // before it went and the producer armed ProPresenter again, with the clock on the Vamp's downbeat
    // and no report across it yet (setlist-controller#371).
    const fadedBeforeVamp = async (latenessLog?: { path: string }) => {
      const started = await vampRig(-0.625, 'default', latenessLog);
      await started.play(6, 90);
      const reported = rig!.clock.now();
      const before = (await started.sent()).length;
      started.leader.send({ kind: 'fade-out' });
      await started.row((row) => row.arm === 'paused' && row.pause === 'fade-out');
      started.producer.send({ kind: 'arm', target: 'propresenter' });
      await started.row((row) => row.arm === 'armed');
      await started.clockTo(reported, 6 * BEAT_MS);
      expect((await started.sent()).slice(before)).toEqual([]);
      return { ...started, before };
    };

    it("sends the Chorus's first slide at once in place of the Vamp's clear when a Fade out dropped it before it went, and not again on the Chorus's downbeat", async () => {
      const { play, sent, before } = await fadedBeforeVamp();
      await play(6.25, 96.25);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
      await play(4.25, 100.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
    });

    it("measures the Chorus's first slide, sent in place of the Vamp's clear after a Fade out dropped it, against its pickup less the lead, and logs no line for the Vamp", async () => {
      const path = join(await newFolder(), 'cue-lateness.log');
      const { play, sent, before } = await fadedBeforeVamp({ path });
      await play(6.25, 96.25);
      await play(4.25, 100.5);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);

      await rig!.close();
      rig = undefined;
      // The report at 96.25 is 0.75 beat past the slide's send point, 95.5.
      const lines = (await latenessLines(path)).filter(({ section }) => section !== 'Bridge');
      expect(lines.map(({ song, section, slide, cause, lateMs }) => ({ song, section, slide, cause, lateMs }))).toEqual([
        { song: 1, section: 'Chorus', slide: 11, cause: 'played-into', lateMs: 375 },
      ]);
    });

    it("sends the Vamp's clear, never the Chorus's first slide, at 150 BPM when a jump tapped late at the Vamp's downbeat still waits, and the jump's own slide on its landing", async () => {
      const { leader, next, sent } = await vampRig(-0.625);
      const beatMs = 60_000 / 150;
      rig!.live.setTempo(150);
      let at = 84;
      const playTo = async (to: number) => {
        const seen = next((snapshot) => near(snapshot.position, to));
        rig!.live.advance((to - at) * beatMs);
        at = to;
        await seen;
      };
      await playTo(90);
      // The Chorus's pickup on 97.5 goes on 95.5, after this report on the server's clock.
      await playTo(95.45);
      const before = (await sent()).length;

      // The tap at 95.45 is inside the late window of the bar line on 96, 0.625 beat at 150 BPM, so
      // the jump to Verse 1 waits past the Vamp's downbeat, and the tap drops the pickup before it
      // goes. Live reports the Vamp only after it has the tap.
      rig!.live.holdReplies();
      rig!.live.advance(0.75 * beatMs);
      leader.send({ kind: 'jump', song: 1, section: 0 });
      await vi.waitFor(() => expect(rig!.received('/live/song/cue_point/jump')).toHaveLength(1));
      const vamp = next((snapshot) => near(snapshot.position, 96.2) && snapshot.jump?.section === 0);
      rig!.live.releaseReplies();
      await vamp;
      expect((await sent()).slice(before)).toEqual([CLEAR]);
      const landed = next((snapshot) => snapshot.jump === null && snapshot.position !== null && snapshot.position < 4);
      rig!.live.advance(4 * beatMs);
      await landed;

      expect((await sent()).slice(before)).toEqual([CLEAR, trigger(WORTHY_OF_IT_ALL, 1)]);
    });

    it("sends the Chorus's first slide again in place of the Vamp's clear when the producer disarmed ProPresenter after the slide went early and armed it again", async () => {
      const { producer, row, play, sent, clockTo } = await vampRig(-0.625);
      await play(6, 90);
      const reported = rig!.clock.now();
      const before = (await sent()).length;
      await clockTo(reported, 5.5 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
      // Disarming forgets the slide sent early.
      producer.send({ kind: 'disarm', target: 'propresenter' });
      await row((row) => row.arm === 'disarmed');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await row((row) => row.arm === 'armed');
      await play(6.25, 96.25);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11), trigger(WORTHY_OF_IT_ALL, 11)]);
      await play(4.25, 100.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11), trigger(WORTHY_OF_IT_ALL, 11)]);
    });

    it("sends the Chorus's first slide once more on its downbeat when the row's Clear slide button cleared it after it went early", async () => {
      const { producer, play, sent, clockTo } = await vampRig(-0.625);
      await play(6, 90);
      const reported = rig!.clock.now();
      const before = (await sent()).length;
      // The Chorus on 100, its pickup on 97.5, sent on 95.5, before the Vamp's clear on 96.
      await clockTo(reported, 5.5 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
      await play(6.25, 96.25);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11)]);
      // The operator clears the screen from the row, inside the Vamp.
      await press(producer, 'clear');
      await play(4.25, 100.5);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 11), CLEAR, trigger(WORTHY_OF_IT_ALL, 11)]);
    });

    it("brings Holy Forever's Chorus 1's first slide back at its pickup less 2 beats before each wrap of its loop", async () => {
      const slideTiming = await timingFile(HOLY_FOREVER_PICKUPS);
      const { lead, play, sent, clockTo } = await timingRig(56, { cuePoints: HOLY_FOREVER_CHORUSES, slideTiming, leadBeats: 'default' });
      await play(4, 60);
      await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 2);
      await play(12, 72);
      let reported = rig!.clock.now();
      let before = (await sent()).length;

      // The brace ends on 80; the pickup 2 beats before it is 78, sent on 76.
      await clockTo(reported, 4 * BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([]);
      await clockTo(reported, 4 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 9)]);
      await play(7, 79);
      await play(1.5, 48.5);
      expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 9)]);

      // A second time round: Chorus 1's second slide on 64, then the pickup again.
      await play(23.5, 72);
      reported = rig!.clock.now();
      before = (await sent()).length;
      await clockTo(reported, 4 * BEAT_MS);
      await play(8.5, 48.5);

      expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 9)]);
    });

    // Worthy Of It All with three 8-bar Choruses, the third (slides 14 to 17) on 96 changing on bars
    // 3.5, 5.5 and 7.5, beats 110, 118 and 126, and starting 2.5 beats early.
    const THIRD_CHORUS_CUE_POINTS: CuePoint[] = [
      { name: '1 - Verse 1 (Worthy Of It All)', time: 0 },
      { name: '1 - Chorus', time: 32 },
      { name: '1 - Chorus', time: 64 },
      { name: '1 - Chorus', time: 96 },
      { name: '1 - End', time: 128 },
    ];
    const THIRD_CHORUS = { 'Worthy Of It All': [{ section: 'Chorus', occurrence: 3, changes: [3.5, 5.5, 7.5], start: -0.625 }] };

    it("brings the third Chorus's first slide back 2 beats before the wrap of its loop, never before its last slide, when its start passes that slide", async () => {
      const slideTiming = await timingFile(THIRD_CHORUS);
      const { lead, play, sent, clockTo } = await timingRig(108, { cuePoints: THIRD_CHORUS_CUE_POINTS, slideTiming, leadBeats: 'default' });
      await play(4, 112);
      await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
      await play(8, 120);
      const reported = rig!.clock.now();
      const before = (await sent()).length;

      // The last slide on 126 goes on 124 (bar 7.0); the wrap's on 126, the brace's end less 2 beats,
      // not on 123.5 (bar 6.875).
      await clockTo(reported, 4 * BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([]);
      await clockTo(reported, 4 * BEAT_MS);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 17)]);
      await clockTo(reported, 6 * BEAT_MS - 1);
      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 17)]);
      await clockTo(reported, 6 * BEAT_MS);

      expect((await sent()).slice(before)).toEqual([trigger(WORTHY_OF_IT_ALL, 17), trigger(WORTHY_OF_IT_ALL, 14)]);
    });

    it('notes a start that passes its section\'s own last change, which a loop wrap sends with the normal lead, and it is no problem', async () => {
      pro = await startFakeProPresenter();
      pro.listNovember8();
      const slideTiming = await timingFile(THIRD_CHORUS);

      const { shown } = await pickedRig(NOVEMBER_8.id, THIRD_CHORUS_CUE_POINTS, slideTiming);

      expect(shown.check.kind).toBe('matched');
      expect(shown.check.kind === 'matched' && shown.check.notes).toContain('Worthy Of It All: slide timing Chorus 3, start -0.625 passes its last change, a loop wrap sends slide 1 the normal lead early');
    });

    it("never sends Verse 3's first slide for its pickup when the leader's Stop goes before it is due", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { leader, next, play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      const reported = rig!.clock.now();
      rig!.live.holdReplies();
      leader.send({ kind: 'stop' });
      await vi.waitFor(() => expect(rig!.received('/live/song/stop_playing')).toHaveLength(1));
      await clockTo(reported, 4 * BEAT_MS + 100);
      expect(await triggers()).toEqual([]);
      const stopped = next((snapshot) => !snapshot.playing);
      rig!.live.releaseReplies();
      await stopped;

      expect(await triggers()).toEqual([]);
    });

    it("never sends Verse 3's first slide for its pickup once a jump is tapped before it is due", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { lead, play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4.5, 104.5);
      const reported = rig!.clock.now();
      await lead({ kind: 'jump', song: 1, section: 1 }, (snapshot) => snapshot.jump?.section === 1);
      await vi.waitFor(() => expect(rig!.received(JUMP)).toHaveLength(1));
      await clockTo(reported, 3.5 * BEAT_MS + 100);

      expect(await triggers()).toEqual([]);
    });

    it("never sends Verse 3's first slide for its pickup once the leader fades out before it is due", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { leader, producer, row, play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      const reported = rig!.clock.now();
      leader.send({ kind: 'fade-out' });
      await row((row) => row.arm === 'paused' && row.pause === 'fade-out');
      producer.send({ kind: 'arm', target: 'propresenter' });
      await row((row) => row.arm === 'armed');
      await clockTo(reported, 4 * BEAT_MS + 100);

      expect(await triggers()).toEqual([]);
    });

    it("never sends Verse 3's first slide for its pickup once the leader loops Chorus 1 before it is due, and brings Chorus 1's first slide back before the wrap", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { lead, play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      const reported = rig!.clock.now();
      await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
      // The wrap on 112 goes on 110.
      await clockTo(reported, 6 * BEAT_MS);
      await play(8.5, 80.5);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5)]);
    });

    // Ancient Gates on SLIDES_CUE_POINTS with Chorus 1, 80 to 112, starting half a bar early: a brace
    // on Chorus 1 wraps to its first slide for its pickup on 110, sent on 108.
    it("sends Chorus 1's first slide at once when the leader presses Loop after its own pickup beat and before its end, and not again on the wrap", async () => {
      const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Chorus 1', start: -0.5 }] });
      const { lead, play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      // Verse 3's first slide, on 112, goes on 110.
      await clockTo(rig!.clock.now(), 6 * BEAT_MS + 100);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7)]);
      await play(7.8, 111.8);
      await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
      // Past the wrap's pickup on 110 and before the brace's end on 112: the wrap's slide goes at once.
      await vi.waitFor(async () => expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 5)]));
      await play(0.7, 80.5);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 7), trigger(ANCIENT_GATES, 5)]);
    });

    it("sends Verse 3's first slide at once when the leader turns the loop off after its pickup beat and before its downbeat, and not again on the downbeat", async () => {
      const slideTiming = await timingFile(VERSE_3_PICKUP);
      const { lead, play, triggers, clockTo } = await timingRig(100, { slideTiming, leadBeats: 'default' });
      await play(4, 104);
      await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 3);
      // The wrap on 112 goes on 110, in place of Verse 3's first slide for its pickup.
      await clockTo(rig!.clock.now(), 6 * BEAT_MS + 100);
      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5)]);
      await play(7, 111);
      // Past Verse 3's pickup on 110 and before its downbeat on 112: its first slide goes at once.
      await lead({ kind: 'loop' }, (snapshot) => snapshot.loop === null);
      await vi.waitFor(async () => expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 7)]));
      await play(1.5, 112.5);

      expect(await triggers()).toEqual([trigger(ANCIENT_GATES, 5), trigger(ANCIENT_GATES, 7)]);
    });

    describe('after a song with no End', () => {
      const notesOf = (check: PreServiceCheck) => ('notes' in check ? check.notes : []);
      const timingProblems = (check: PreServiceCheck) => (check.kind === 'unmatched' ? check.problems.filter((line) => line.includes('slide timing')) : []);
      const holyForeverSent = async (sent: () => Promise<string[]>) => (await sent()).filter((path) => path.includes(HOLY_FOREVER));
      // The row's check on the November 8 playlist once ProPresenter has read it and every song's meter
      // is read. Until the read lands, the check is the playlist's "could not be read" problem alone,
      // with no note and no slide timing line.
      const unread = (check: PreServiceCheck) => check.kind === 'unmatched' && check.problems.some((line) => line.endsWith('could not be read from ProPresenter'));
      const everyMeterRead = (row: Connection) =>
        row.pick?.picked?.id === NOVEMBER_8.id &&
        row.check.kind !== 'not-checked' &&
        !beforePick(row) &&
        !unread(row.check) &&
        !notesOf(row.check).some((line) => line.endsWith('meter not read yet'));
      // Ancient Gates on SLIDES_CUE_POINTS with no End, then Holy Forever's Verse 1 on 144: Ancient
      // Gates' Verse 3 runs from 112 to 144, its 3 slides over 8 bars of 4/4, changing on 124 and 132.
      const AFTER_NO_END: CuePoint[] = [...SLIDES_CUE_POINTS.slice(0, 5), { name: '2 - Verse 1 (Holy Forever)', time: 144 }, { name: '2 - End', time: 176 }];
      // The same with Ancient Gates' End on 144, so Holy Forever's Verse 1 starts on it.
      const AFTER_END: CuePoint[] = [...SLIDES_CUE_POINTS, { name: '2 - Verse 1 (Holy Forever)', time: 144 }, { name: '2 - End', time: 176 }];
      // Ancient Gates in 4/4 with no End, its Verse 3 from 32 to 56 changing on 40 and 48, then Holy
      // Forever in 6/8 from 56. Split in 6/8, the same 24 beats would change on 41 and 47.
      const INTO_SIX_EIGHT: CuePoint[] = [
        { name: '1 - Verse 1 (Ancient Gates)', time: 0 },
        { name: '1 - Verse 3', time: 32 },
        { name: '2 - Verse 1 (Holy Forever)', time: 56 },
        { name: '2 - End', time: 80 },
      ];

      // The slide timing problems once Live, stopped on `from` in 4/4, is clicked into `to`, also in
      // 4/4, so both songs' meters are read.
      async function problemsAfterWalk(cuePoints: CuePoint[], slideTiming: string, from: number, to: number) {
        pro = await startFakeProPresenter();
        pro.listNovember8();
        const { next, row } = await pickedRig(NOVEMBER_8.id, cuePoints, slideTiming, { playing: false, position: from });
        await walkStopped(next, { position: to, numerator: 4, denominator: 4 });
        return timingProblems((await row(everyMeterRead)).check);
      }

      it("names a start that lands between the last section's start and its last change as a problem, passing the last change of Ancient Gates", async () => {
        // A start of -4 bars lands on 128, after Verse 3's start on 112 and before its change on 132.
        const slideTiming = await timingFile({ 'Holy Forever': [{ section: 'Verse 1', start: -4 }] });

        expect(await problemsAfterWalk(AFTER_NO_END, slideTiming, 120, 150)).toEqual(['Holy Forever: slide timing Verse 1 1, start -4 passes the last change of Ancient Gates']);
      });

      it("bounds the start by the last change Ancient Gates' own changes give its last section, not the even split's", async () => {
        // Verse 3's changes on bars 2 and 6 put its last change on 136, past the even split's 132. A start
        // of -2.5 bars lands on 134, between the two.
        const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', changes: [2, 6] }], 'Holy Forever': [{ section: 'Verse 1', start: -2.5 }] });

        expect(await problemsAfterWalk(AFTER_NO_END, slideTiming, 120, 150)).toEqual(['Holy Forever: slide timing Verse 1 1, start -2.5 passes the last change of Ancient Gates']);
      });

      it("bounds the start by the last change of the group Ancient Gates' own entry gives its last section, not its Verse 3's", async () => {
        // Group 18, a Bridge of 24 slides, splits Verse 3's 32 beats on beats, its last change on 143,
        // past Verse 3's own 132. A start of -0.5 bars lands on 142, between the two.
        const slideTiming = await timingFile({ 'Ancient Gates': [{ section: 'Verse 3', group: 18 }], 'Holy Forever': [{ section: 'Verse 1', start: -0.5 }] });

        expect(await problemsAfterWalk(AFTER_NO_END, slideTiming, 120, 150)).toEqual(['Holy Forever: slide timing Verse 1 1, start -0.5 passes the last change of Ancient Gates']);
      });

      it("sends Holy Forever's first slide 2 beats before its downbeat, not at that start's pickup, when the start passes Ancient Gates' last change", async () => {
        const slideTiming = await timingFile({ 'Holy Forever': [{ section: 'Verse 1', start: -4 }] });
        const { play, sent, clockTo } = await timingRig(120, { cuePoints: AFTER_NO_END, slideTiming, leadBeats: 'default' });
        // Across the pickup on 128, less the lead on 126, and Verse 3's change on 132: nothing of Holy
        // Forever.
        await play(4, 124);
        await play(14, 138);
        const reported = rig!.clock.now();
        // Verse 1 starts on 144; 2 beats before it is 142, 4 beats after the report at 138.
        await clockTo(reported, 4 * BEAT_MS - 1);
        expect(await holyForeverSent(sent)).toEqual([]);
        await clockTo(reported, 4 * BEAT_MS);

        expect(await holyForeverSent(sent)).toEqual([trigger(HOLY_FOREVER, 1)]);
      });

      it("takes a start that lands after Ancient Gates' last change, and sends Holy Forever's first slide at its pickup less 2 beats", async () => {
        // A start of -2 bars lands on 136, after the change on 132, and goes on 134.
        const slideTiming = await timingFile({ 'Holy Forever': [{ section: 'Verse 1', start: -2 }] });
        expect(await problemsAfterWalk(AFTER_NO_END, slideTiming, 120, 150)).toEqual([]);
        await rig!.close();
        rig = undefined;
        await pro!.close();
        pro = undefined;

        const { play, sent, clockTo } = await timingRig(120, { cuePoints: AFTER_NO_END, slideTiming, leadBeats: 'default' });
        await play(4, 124);
        await play(8, 132);
        const reported = rig!.clock.now();
        await clockTo(reported, 2 * BEAT_MS - 1);
        expect(await holyForeverSent(sent)).toEqual([]);
        await clockTo(reported, 2 * BEAT_MS);

        expect(await holyForeverSent(sent)).toEqual([trigger(HOLY_FOREVER, 1)]);
      });

      it('names a start that lands before the End of a song with one as a problem, passing the end of Ancient Gates', async () => {
        // A start of -1 bar lands on 140, before Ancient Gates' End on 144.
        const slideTiming = await timingFile({ 'Holy Forever': [{ section: 'Verse 1', start: -1 }] });

        expect(await problemsAfterWalk(AFTER_END, slideTiming, 120, 150)).toEqual(['Holy Forever: slide timing Verse 1 1, start -1 passes the end of Ancient Gates']);
      });

      it("judges Ancient Gates' last change in its own 4/4, not in Holy Forever's 6/8, in the check and in the slides sent", async () => {
        // A start of -2.9 bars of 6/8 lands on 47.3: before Ancient Gates' change on 48 in 4/4, but after
        // the 47 it would be in 6/8.
        const slideTiming = await timingFile({ 'Holy Forever': [{ section: 'Verse 1', start: -2.9 }] });
        const { next, row, play, sent, clockTo } = await timingRig(60, { cuePoints: INTO_SIX_EIGHT, slideTiming, leadBeats: 'default', setup: { playing: false, signature: { numerator: 6, denominator: 8 } } });
        // Live stopped in Holy Forever in 6/8, then clicked into Ancient Gates in 4/4, reads both.
        await walkStopped(next, { position: 8, numerator: 4, denominator: 4 });

        expect(timingProblems((await row(everyMeterRead)).check)).toEqual(['Holy Forever: slide timing Verse 1 1, start -2.9 passes the last change of Ancient Gates']);

        const started = next((snapshot) => snapshot.playing);
        rig!.live.setPlaying(true);
        await started;
        await play(36, 44);
        const reported = rig!.clock.now();
        // Verse 1 starts on 56; 2 beats before it is 54, 10 beats after the report at 44. The pickup on
        // 47.3 would go on 45.3.
        await clockTo(reported, 10 * BEAT_MS - 1);
        expect(await holyForeverSent(sent)).toEqual([]);
        await clockTo(reported, 10 * BEAT_MS);

        expect(await holyForeverSent(sent)).toEqual([trigger(HOLY_FOREVER, 1)]);
      });
    });
  });
});

// Holy Forever from listNovember8(), with an 8-bar Outro, which has no group of its name, after its
// Verse 1, and an End that clears after the Outro cleared, unless a slide timing entry gives the Outro
// a group, when the End shows its Ending group.
const HOLY_FOREVER_OUTRO: CuePoint[] = [
  { name: '1 - Intro (Holy Forever)', time: 0 },
  { name: '1 - Verse 1', time: 16 },
  { name: '1 - Outro', time: 48 },
  { name: '1 - End', time: 80 },
];

// Ancient Gates with an 8-bar Verse 3 and no group for its End, then HOLY_FOREVER_OUTRO's sections.
const TIMING_CHECKED: CuePoint[] = [
  { name: '1 - Verse 1 (Ancient Gates)', time: 0 },
  { name: '1 - Verse 3', time: 32 },
  { name: '1 - End', time: 64 },
  { name: '2 - Verse 1 (Holy Forever)', time: 64 },
  { name: '2 - Outro', time: 96 },
  { name: '2 - End', time: 128 },
];

// The check's notes for Holy Forever's groups with no name, which hold words.
const UNNAMED_11 = 'Holy Forever: unnamed group 11 (1 slide), no section shows it';
const UNNAMED_12 = 'Holy Forever: unnamed group 12 (2 slides), no section shows it';

// A path as a pattern that matches it alone.
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// setlist-controller#561: Next slide and Previous slide cross into the next or previous presentation
// item of the picked playlist, skipping headers and placeholders. listNovember8()'s November 8
// playlist holds, after its WORSHIP SET header, Ancient Gates, Holy Forever and Worthy Of It All, then
// a FACETIME header, Facetime (three slides), a SERVICE HOST header and MC (eleven slides).
const FACETIME = '58C14FDA-CBDF-4A9C-900D-FE7D88E0E597';
const MC = '4CC08029-E3AF-43EB-AC89-DF1065966DA0';
// The November 15 playlist, which serveNovember12() serves, with a MESSAGE header and a
// Program/Offering placeholder between MC and Test Message.
const NOVEMBER_15_PLAYLIST = '5B02A251-921A-440A-A0C6-9FA5FF8C1A1A';
const SCRIPTURE_READING = 'E46CBF0C-156E-4791-9B72-01DDC0938758';
const TEST_MESSAGE = 'EB4A51A6-8A84-4435-AA45-F50097F93BC6';
const SAMPLE_MESSAGE_B = '2D24702C-9B33-4140-9D97-72E2701C955C';
const DISMISSAL = '1D17EA27-82A0-4706-B6AC-2298AA4112A1';
// Worthy Of It All's slide count: its last slide is 32.
const WORTHY_SLIDES = 33;

// Presses the button once, and waits until ProPresenter has received that many commands more than
// before it, since a press that crosses sends the active path and then an index trigger.
async function pressSending(producer: Awaited<ReturnType<typeof proRig>>['producer'], button: string, commands: number) {
  const before = commandsReceived().length;
  producer.send({ kind: 'run-button', target: 'propresenter', button });
  await vi.waitFor(() => expect(commandsReceived().length).toBe(before + commands));
  await pro!.idle();
}

// Holy Forever then Worthy Of It All, two songs of the set that sit next to each other in November 8.
const HOLY_THEN_WORTHY: CuePoint[] = [
  { name: '1 - Verse 1 (Holy Forever)', time: 0 },
  { name: '1 - End', time: 16 },
  { name: '2 - Verse 1 (Worthy Of It All)', time: 16 },
  { name: '2 - End', time: 32 },
];
// Holy Forever's slide count: its last slide is 24.
const HOLY_SLIDES = 25;

describe('Next slide and Previous slide across the picked playlist', () => {
  // Worthy Of It All, the last song of the set, armed inside its first Chorus, its slide 5 up by Fire
  // again, then on its last slide, as presses of Next slide to its end leave it. Listed again, the
  // playlist lists it a second time after Dismissal.
  const onWorthysLastSlide = async ({ listedAgain = false }: { listedAgain?: boolean } = {}) => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    if (listedAgain) pro.listAgain(NOVEMBER_8.id, WORTHY_OF_IT_ALL);
    const started = await armedRig({ position: 20, playlist: NOVEMBER_8.id, cuePoints: WORTHY_OF_IT_ALL_CUE_POINTS });
    started.producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(WORTHY_OF_IT_ALL, 5)]));
    await pro.idle();
    pro.lastSlide();
    expect(pro.showing()).toEqual({ uuid: WORTHY_OF_IT_ALL, index: WORTHY_SLIDES - 1 });
    return started;
  };

  it("moves Next slide on a song's last slide onto slide 1 of the next presentation item, past the header between them", async () => {
    const { producer } = await onWorthysLastSlide();

    await pressSending(producer, 'next', 2);

    expect(commandsReceived().slice(1)).toEqual([NEXT, trigger(FACETIME, 0)]);
    expect(pro!.showing()).toEqual({ uuid: FACETIME, index: 0 });
  });

  it('moves Previous slide on the first slide of an item onto the last slide of the item before it, so one Next and one Previous come back to the same slide', async () => {
    const { producer } = await onWorthysLastSlide();
    await pressSending(producer, 'next', 2);

    await pressSending(producer, 'previous', 2);

    expect(commandsReceived().slice(3)).toEqual([PREVIOUS, trigger(WORTHY_OF_IT_ALL, WORTHY_SLIDES - 1)]);
    expect(pro!.showing()).toEqual({ uuid: WORTHY_OF_IT_ALL, index: WORTHY_SLIDES - 1 });
  });

  it('pauses ProPresenter armed when Next slide crosses into an item that is no song of the set, and the row names the item', async () => {
    const { producer, row } = await onWorthysLastSlide();

    await pressSending(producer, 'next', 2);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'moved', movedTo: 'Facetime' });
  });

  // Decided 2026-11-13: a move back into a song of the set does not end the pause, which holds until
  // Arm or the next song's Count Off.
  it('keeps the pause a crossing made, and its item, when Previous slide crosses back into a song of the set', async () => {
    const { producer, row, latest } = await onWorthysLastSlide();
    await pressSending(producer, 'next', 2);
    await row((row) => row.pause === 'moved');

    await pressSending(producer, 'previous', 2);

    expect(pro!.showing()).toEqual({ uuid: WORTHY_OF_IT_ALL, index: WORTHY_SLIDES - 1 });
    expect(await latest()).toMatchObject({ arm: 'paused', pause: 'moved', movedTo: 'Facetime' });
  });

  it("ends the pause a crossing made on the producer's Arm", async () => {
    const { producer, row } = await onWorthysLastSlide();
    await pressSending(producer, 'next', 2);
    await row((row) => row.pause === 'moved');

    producer.send({ kind: 'arm', target: 'propresenter' });

    expect(await row((row) => row.arm === 'armed')).toMatchObject({ arm: 'armed', pause: null, movedTo: null });
  });

  it('moves Next slide past a header and a placeholder, from MC to Test Message in the November 15 playlist', async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();
    const { producer } = await armedRig({ position: 20, playlist: NOVEMBER_15_PLAYLIST, cuePoints: WORTHY_OF_IT_ALL_CUE_POINTS });
    await pro.streaming();
    // MC's last slide, shown by hand: after it come the MESSAGE header, the Program/Offering
    // placeholder, then Test Message.
    await pro.sendSlide(MC, 10);

    await pressSending(producer, 'next', 2);

    expect(commandsReceived().slice(-2)).toEqual([NEXT, trigger(TEST_MESSAGE, 0)]);
    expect(pro.showing()).toEqual({ uuid: TEST_MESSAGE, index: 0 });
  });

  it("keeps the pause a crossing made through the crossing's own frame past the window, and pauses by hand on a slide pressed by hand after it", async () => {
    const { producer, row, clock, latest } = await onWorthysLastSlide();
    await pro!.streaming();
    await pressSending(producer, 'next', 2);
    await row((row) => row.pause === 'moved');

    // Facetime's first slide, the press's own, late past the window.
    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(FACETIME, 0);
    expect(await latest()).toMatchObject({ arm: 'paused', pause: 'moved', movedTo: 'Facetime' });
    // Facetime's third slide, pressed by hand.
    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(FACETIME, 2);

    expect(await row((row) => row.pause === 'by-hand')).toMatchObject({ arm: 'paused', pause: 'by-hand', movedTo: null });
  });

  it("ends the pause a crossing made on the next song's Count Off cue, which then sends its slide, as a Fade out's pause ends", async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    // Inside Ancient Gates' Count Off, where Fire again sends its slide 1, index 0. Previous slide on it
    // crosses back into Countdown, the item before it, which is no song of the set.
    const { producer, play, row, sent } = await armedRig({ position: 6, playlist: NOVEMBER_8.id, cuePoints: NOVEMBER_8_CUE_POINTS });
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toEqual([trigger(ANCIENT_GATES, 0)]));
    await pro.idle();
    await pressSending(producer, 'previous', 2);
    expect(pro.showing()).toEqual({ uuid: COUNTDOWN, index: 0 });
    expect(await row((row) => row.arm === 'paused')).toMatchObject({ pause: 'moved', movedTo: 'Countdown' });

    // Ancient Gates plays on with nothing sent, then Holy Forever's Count Off on 44 arms ProPresenter
    // again and sends its slide 1.
    await play(10, 16);
    await play(8, 24);
    await play(16, 40);
    expect((await sent()).filter((path) => CUE_PATH.test(path) || path === CLEAR)).toEqual([trigger(ANCIENT_GATES, 0), trigger(COUNTDOWN, 0)]);
    await play(4.5, 44.5);

    expect(await row((row) => row.arm === 'armed')).toMatchObject({ arm: 'armed', pause: null, movedTo: null });
    expect((await sent()).at(-1)).toBe(trigger(HOLY_FOREVER, 0));
  });

  it('stays armed when Next slide crosses into another song of the set', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    // Inside Holy Forever's Verse 1, whose slides start at 1.
    const { producer, latest } = await armedRig({ position: 4, playlist: NOVEMBER_8.id, cuePoints: HOLY_THEN_WORTHY });
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toHaveLength(1));
    await pro.idle();
    pro.lastSlide();
    expect(pro.showing()).toEqual({ uuid: HOLY_FOREVER, index: HOLY_SLIDES - 1 });

    await pressSending(producer, 'next', 2);

    expect(pro.showing()).toEqual({ uuid: WORTHY_OF_IT_ALL, index: 0 });
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, movedTo: null });
  });

  it("stays armed when Next slide crosses into a song of the set matched by its playlist item's name (setlist-controller#579)", async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    pro.renamePresentation(WORTHY_OF_IT_ALL, 'Worthy Of It All (Live)');
    const { producer, latest } = await armedRig({ position: 4, playlist: NOVEMBER_8.id, cuePoints: HOLY_THEN_WORTHY });
    producer.send({ kind: 'fire-again', target: 'propresenter' });
    await vi.waitFor(() => expect(pro!.triggers()).toHaveLength(1));
    await pro.idle();
    pro.lastSlide();

    await pressSending(producer, 'next', 2);

    expect(pro.showing()).toEqual({ uuid: WORTHY_OF_IT_ALL, index: 0 });
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, movedTo: null });
  });

  it('says nothing to move for Next slide on the last slide of a presentation outside the picked playlist, shown by hand from the library', async () => {
    const { producer, latest } = await onWorthysLastSlide();
    await pro!.streaming();
    // There Is Freedom, in no item of November 8, on its last slide, as an operator shows it from the
    // library.
    await pro!.sendSlide(THERE_IS_FREEDOM, 36);
    const before = commandsReceived().length;

    await pressSending(producer, 'next', 1);

    expect(commandsReceived().slice(before)).toEqual([NEXT]);
    expect(pro!.showing()).toEqual({ uuid: THERE_IS_FREEDOM, index: 36 });
    expect((await latest()).state).toContain(NOTHING_TO_MOVE.next);
  });

  it('says nothing to move for Next slide after a clear made in ProPresenter itself, which leaves no presentation active, and never crosses from the song', async () => {
    const { producer, latest } = await onWorthysLastSlide();
    await pro!.streaming();
    // The operator clears the screen in ProPresenter: its status/slide with no slide and its
    // presentation/current with no presentation, as recorded, and no presentation active.
    await fetch(`http://127.0.0.1:${pro!.port}${CLEAR}`);
    await pro!.send(158330);
    await pro!.send(158238);
    const before = commandsReceived().length;

    await pressSending(producer, 'next', 1);

    expect(commandsReceived().slice(before)).toEqual([NEXT]);
    expect(pro!.showing()).toBeNull();
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null });
    expect((await latest()).state).toContain(NOTHING_TO_MOVE.next);
  });

  it('says nothing to move for Next slide on the last slide of a song with no playlist picked', async () => {
    pro = await startFakeProPresenter();
    pro.listNovember8();
    const { producer, latest } = await armedRig({ position: 20, cuePoints: WORTHY_OF_IT_ALL_CUE_POINTS });
    await pro.streaming();
    await pro.sendSlide(WORTHY_OF_IT_ALL, WORTHY_SLIDES - 1);
    const before = commandsReceived().length;

    await pressSending(producer, 'next', 1);

    expect(commandsReceived().slice(before)).toEqual([NEXT]);
    expect((await latest()).state).toContain(NOTHING_TO_MOVE.next);
  });

  it('moves from the place in the playlist of the listing a press crossed into, for a presentation listed twice', async () => {
    const { producer } = await onWorthysLastSlide({ listedAgain: true });
    // Through Facetime, MC, Scripture Reading, Test Message, Sample Message B and Dismissal onto
    // Worthy Of It All's second listing, each crossed from its last slide.
    for (const crossed of [FACETIME, MC, SCRIPTURE_READING, TEST_MESSAGE, SAMPLE_MESSAGE_B, DISMISSAL, WORTHY_OF_IT_ALL]) {
      if (crossed !== FACETIME) pro!.lastSlide();
      await pressSending(producer, 'next', 2);
      expect(pro!.showing()).toEqual({ uuid: crossed, index: 0 });
    }
    const before = commandsReceived().length;

    // Previous slide on its first slide goes back to Dismissal, the item before the second listing,
    // not to Holy Forever, the item before the first.
    await pressSending(producer, 'previous', 2);

    expect(commandsReceived().slice(before)).toEqual([PREVIOUS, trigger(DISMISSAL, 2)]);
    expect(pro!.showing()).toEqual({ uuid: DISMISSAL, index: 2 });
  });

  it('says nothing to move for Next slide on the last slide of the last presentation item, Dismissal, as before', async () => {
    const { producer, latest } = await onWorthysLastSlide();
    // Through Facetime, MC, Scripture Reading, Test Message and Sample Message B onto Dismissal,
    // each crossed from its last slide.
    for (const crossed of [FACETIME, MC, SCRIPTURE_READING, TEST_MESSAGE, SAMPLE_MESSAGE_B, DISMISSAL]) {
      await pressSending(producer, 'next', 2);
      expect(pro!.showing()).toEqual({ uuid: crossed, index: 0 });
      pro!.lastSlide();
    }
    const before = commandsReceived().length;

    await pressSending(producer, 'next', 1);

    expect(commandsReceived().slice(before)).toEqual([NEXT]);
    expect((await latest()).state).toContain(NOTHING_TO_MOVE.next);
    expect((await latest()).state.join(' ')).not.toContain('no presentation is active');
  });
});
