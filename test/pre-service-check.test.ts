import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { PROBE_INTERVAL_MS, SILENT_BEFORE_LOST_MS } from '../src/server/live-bridge.ts';
import { LOOP_REPORT_MS, METER_SETTLE_MS } from '../src/server/playback-controller.ts';
import { SETUP_REFRESH_API } from '../src/shared/routes.ts';
import type { PreServiceCheck, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Client, type Rig, type RigOptions } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// One song in 4/4 at 120 BPM.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];

const NOT_CHECKED: PreServiceCheck = { kind: 'not-checked' };
const MATCHED: PreServiceCheck = { kind: 'matched', passText: 'Every song and section matches.', notes: [] };
const unmatched = (...names: string[]): PreServiceCheck => ({ kind: 'unmatched', names, problems: [], notes: [] });

// The producer's snapshot once the set has loaded and the one target's row shows the check.
const shows = (check: PreServiceCheck) => (snapshot: ProducerSnapshot) =>
  loaded(snapshot) && JSON.stringify(snapshot.connections[0]?.check) === JSON.stringify(check);

// Resolves with the first snapshot the producer receives from now on that matches. A snapshot it
// received before never counts.
function next(producer: Client<ProducerSnapshot>, matches: (snapshot: ProducerSnapshot) => boolean) {
  const start = producer.received.length;
  return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
}

// The section names of each song in a set the target was asked to check.
const sectionNames = (target: FakeTarget, index: number) => target.checks.at(index)?.songs.map((song) => song.sections.map((section) => section.name));

// A rig with Live stopped, one fake target that cannot match the names given, and the producer
// connected once its row shows them.
async function checkedRig(names: string[], cuePoints: CuePoint[] = SET, options: RigOptions = {}) {
  const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
  target.setUnmatched(names);
  rig = await startRig(cuePoints, { playing: false, position: 0 }, { ...options, targets: [target] });
  const producer = await rig.connectProducer();
  return { target, producer };
}

describe('a target coming online', () => {
  it("runs its check against the set once the set loads, and the producer row shows what it cannot match", async () => {
    const { target, producer } = await checkedRig(['Chorus']);

    await producer.snapshot(shows(unmatched('Chorus')));

    expect(sectionNames(target, -1)).toEqual([['Intro', 'Verse', 'Chorus']]);
  });

  it('shows not checked while the target is offline, and runs the check again when it comes back', async () => {
    const { target, producer } = await checkedRig(['Chorus']);
    await producer.snapshot(shows(unmatched('Chorus')));

    target.goOffline();
    const offline = await next(producer, (snapshot) => snapshot.connections[0]?.connection === 'offline');
    expect(offline.connections[0]?.check).toEqual(NOT_CHECKED);

    const checks = target.checks.length;
    target.setUnmatched(['Verse', 'Chorus']);
    target.goOnline();

    await producer.snapshot(shows(unmatched('Verse', 'Chorus')));
    expect(target.checks).toHaveLength(checks + 1);
  });

  it('runs no check while the target is offline, Refresh included', async () => {
    const { target, producer } = await checkedRig(['Chorus']);
    await producer.snapshot(shows(unmatched('Chorus')));
    target.goOffline();
    await next(producer, (snapshot) => snapshot.connections[0]?.connection === 'offline');
    const checks = target.checks.length;

    producer.send({ kind: 'refresh' });
    await producer.flush();

    expect(target.checks).toHaveLength(checks);
    expect(producer.received.at(-1)?.connections[0]?.check).toEqual(NOT_CHECKED);
  });

  it('shows matched when the target matches every song and section', async () => {
    const { producer } = await checkedRig([]);

    await producer.snapshot(shows(MATCHED));
  });

  it('shows matched, with its notes, when the target matches every song and section and notes what they do', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    target.setNotes(['Intro: no group Intro, shows slide 1']);
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();

    await producer.snapshot(shows({ kind: 'matched', passText: 'Every song and section matches.', notes: ['Intro: no group Intro, shows slide 1'] }));
  });

  it('shows matched with the pass text its target words, when the target matches every song and section', async () => {
    const target = fakeTarget({ name: 'eos', label: 'Lights', passText: 'Every song has a cue.' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();

    await producer.snapshot(shows({ kind: 'matched', passText: 'Every song has a cue.', notes: [] }));
  });

  it('shows what the target cannot match and its notes apart, when it has both', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    target.setUnmatched(['Chorus']);
    target.setNotes(['Intro: no group Intro, shows slide 1']);
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();

    await producer.snapshot(shows({ kind: 'unmatched', names: ['Chorus'], problems: [], notes: ['Intro: no group Intro, shows slide 1'] }));
  });
});

// A POST to the setup screen's Refresh from the laptop itself, with no keep-alive.
function refreshFromLaptop(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path: SETUP_REFRESH_API, method: 'POST', agent: false }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

describe('Refresh', () => {
  it.each(['leader', 'producer'] as const)("runs the check again from the %s's page, and the row shows what the target now cannot match", async (role) => {
    const { target, producer } = await checkedRig([]);
    await producer.snapshot(shows(MATCHED));
    const page = role === 'leader' ? await rig!.connectLeader() : producer;

    // The operator renames a slide in the target's own file, which the set read from Live knows nothing of.
    target.setUnmatched(['Verse', 'Chorus']);
    page.send({ kind: 'refresh' });

    await producer.snapshot(shows(unmatched('Verse', 'Chorus')));
  });

  it("runs the check again from the setup screen's Refresh on the laptop", async () => {
    const { target, producer } = await checkedRig([]);
    await producer.snapshot(shows(MATCHED));

    target.setUnmatched(['Intro']);
    expect(await refreshFromLaptop(rig!.server.httpPort)).toBe(204);

    await producer.snapshot(shows(unmatched('Intro')));
  });

  it('is not the poll: a poll that reads the same set runs no check', async () => {
    const { target, producer } = await checkedRig(['Chorus']);
    await producer.snapshot(shows(unmatched('Chorus')));
    const checks = target.checks.length;
    const reads = rig!.received('/live/song/get/cue_points').length;

    await rig!.advanceConnected(11000);
    await expect.poll(() => rig!.received('/live/song/get/cue_points').length).toBeGreaterThanOrEqual(reads + 2);
    await producer.flush();

    expect(target.checks).toHaveLength(checks);
  });
});

describe('a changed set read from Live', () => {
  it('runs the check again against the new set after the next poll', async () => {
    const { target, producer } = await checkedRig(['Chorus']);
    await producer.snapshot(shows(unmatched('Chorus')));

    // The operator adds a Bridge in Live, which the target's file does not have yet.
    target.setUnmatched(['Chorus', 'Bridge']);
    rig!.live.setCuePoints([...SET, { name: '1 - Bridge', time: 40 }]);
    await rig!.advanceConnected(5000);

    await producer.snapshot(shows(unmatched('Chorus', 'Bridge')));
    expect(sectionNames(target, -1)).toEqual([['Intro', 'Verse', 'Chorus', 'Bridge']]);
  });

  it('checks a target that came online before Live answered once the first set arrives, and shows not checked until then', async () => {
    const { target, producer } = await checkedRig(['Verse'], SET, { liveRunning: false });
    const before = await producer.snapshot((snapshot) => snapshot.connections[0]?.connection === 'online');

    expect(before.set).toBeNull();
    expect(before.connections[0]?.check).toEqual(NOT_CHECKED);
    expect(target.checks).toEqual([]);

    await rig!.startLive();
    rig!.clock.advance(1000);

    await producer.snapshot(shows(unmatched('Verse')));
    expect(sectionNames(target, 0)).toEqual([['Intro', 'Verse', 'Chorus']]);
  });
});

describe("a song's meter", () => {
  // Two songs in 4/4, the second starting where the first ends.
  const TWO_SONGS: CuePoint[] = [
    { name: '1 - Intro (First Song)', time: 0 },
    { name: '1 - Verse', time: 16 },
    { name: '1 - End', time: 32 },
    { name: '2 - Intro (Second Song)', time: 32 },
    { name: '2 - Verse', time: 48 },
    { name: '2 - End', time: 64 },
  ];

  it('runs the check again when the playhead first enters a song, and not on a move inside it', async () => {
    const { target, producer } = await checkedRig([], TWO_SONGS);
    await producer.snapshot(shows(MATCHED));
    const checks = target.checks.length;

    rig!.live.setPosition(40);
    await next(producer, (snapshot) => snapshot.position === 40);
    rig!.clock.advance(METER_SETTLE_MS);
    expect(target.checks).toHaveLength(checks + 1);

    rig!.live.setPosition(52);
    await next(producer, (snapshot) => snapshot.position === 52);
    rig!.clock.advance(METER_SETTLE_MS);
    expect(target.checks).toHaveLength(checks + 1);
  });

  it('holds the check while Live plays, and runs it once when Live stops', async () => {
    const { target, producer } = await checkedRig([], TWO_SONGS);
    await producer.snapshot(shows(MATCHED));
    rig!.live.setPlaying(true);
    await next(producer, (snapshot) => snapshot.playing);
    const checks = target.checks.length;

    rig!.live.setPosition(40);
    await next(producer, (snapshot) => snapshot.position === 40);
    rig!.live.setSignature(6, 8);
    rig!.live.setPosition(52);
    await next(producer, (snapshot) => snapshot.position === 52);
    expect(target.checks).toHaveLength(checks);

    rig!.live.setPlaying(false);
    await next(producer, (snapshot) => !snapshot.playing);
    expect(target.checks).toHaveLength(checks + 1);
    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 4, 2: 3 });
  });

  // Live playing the first song in 6/8 at 120 BPM, its last report on the position given, by default
  // 31.75, a quarter of a beat before its End on 32, once the server has the report.
  async function playingIn(position = 31.75) {
    const { target, producer } = await checkedRig([], TWO_SONGS);
    await producer.snapshot(shows(MATCHED));
    rig!.live.setSignature(6, 8);
    rig!.live.setPlaying(true);
    rig!.live.setPosition(position);
    await next(producer, (snapshot) => snapshot.playing && snapshot.position === position);
    return { target, producer };
  }

  // While Live plays, it reports the next song's signature before the first position past the
  // change, with the last position it reported still inside the song it leaves (setlist-controller#284).
  it("keeps the song Live leaves in its own meter when Live reports the next song's signature before the playhead's move into it", async () => {
    const { target, producer } = await playingIn();

    // 200 ms at 120 BPM carries the playhead 0.4 beats on, to 32.15, past the change.
    rig!.clock.advance(200);
    rig!.live.setSignature(4, 4);
    rig!.live.setPosition(33);
    await next(producer, (snapshot) => snapshot.position === 33);
    rig!.live.setPlaying(false);
    await next(producer, (snapshot) => !snapshot.playing);

    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3, 2: 4 });
  });

  it("keeps the song Live leaves in its own meter when the playhead carried on to the signature report falls just short of the change", async () => {
    const { target, producer } = await playingIn();

    // 120 ms at 120 BPM carries the playhead 0.24 beats on, to 31.99, a hundredth short of 32.
    rig!.clock.advance(120);
    rig!.live.setSignature(4, 4);
    rig!.live.setPosition(32.25);
    await next(producer, (snapshot) => snapshot.position === 32.25);
    rig!.live.setPlaying(false);
    await next(producer, (snapshot) => !snapshot.playing);

    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3, 2: 4 });
  });

  // Live reports the next song's tempo before its signature, so the next song's tempo would carry the
  // playhead short of a change into a slower song.
  it('carries the playhead on at the tempo Live reported with the position, not the next song tempo it reports with the signature', async () => {
    const { target, producer } = await playingIn();

    // 200 ms carries the playhead to 32.15 at 120 BPM, and only to 31.85 at 30 BPM.
    rig!.clock.advance(200);
    rig!.live.setTempo(30);
    rig!.live.setSignature(4, 4);
    rig!.live.setPosition(33);
    await next(producer, (snapshot) => snapshot.position === 33);
    rig!.live.setPlaying(false);
    await next(producer, (snapshot) => !snapshot.playing);

    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3, 2: 4 });
  });

  // A jump waiting on a bar line moves the playhead there, not on past it, so the playhead carried
  // on is no song's while it waits.
  it("keeps the song Live leaves in its own meter when Live reports the signature of a jump's target before the jump's landing", async () => {
    const { target, producer } = await playingIn(14.75);
    const leader = await rig!.connectLeader();
    await leader.snapshot(loaded);
    // The second song's Verse, on 48, from the first song's Intro: Live jumps on the bar line on 15.
    leader.send({ kind: 'set-safe-mode', enabled: false });
    leader.send({ kind: 'jump', song: 2, section: 1 });
    await next(producer, (snapshot) => snapshot.jump !== null);

    // 200 ms at 120 BPM carries the playhead 0.4 beats on, to 15.15, past the bar line.
    rig!.clock.advance(200);
    rig!.live.setSignature(4, 4);
    rig!.live.setPosition(48.25);
    await next(producer, (snapshot) => snapshot.position === 48.25 && snapshot.jump === null);
    rig!.live.setPlaying(false);
    await next(producer, (snapshot) => !snapshot.playing);

    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3, 2: 4 });
  });

  // Stopped, Live reports a click into a song of another meter as the position, then the numerator,
  // then the denominator, within a millisecond (setlist-controller#284).
  it("runs the check once on the new song's own meter after a stopped click into it, never on the song before's or half of it", async () => {
    const { target, producer } = await checkedRig([], TWO_SONGS);
    await producer.snapshot(shows(MATCHED));
    rig!.live.setSignature(6, 8);
    rig!.live.setPosition(8);
    await next(producer, (snapshot) => snapshot.position === 8);
    rig!.clock.advance(METER_SETTLE_MS);
    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3 });
    const checks = target.checks.length;

    rig!.live.setPosition(40);
    rig!.live.setSignature(4, 4);
    // The second song's 16-beat Intro is 4 bars of 4/4, 6 of 6/8 and 8 of 4/8.
    await next(producer, (snapshot) => snapshot.position === 40 && snapshot.now?.bars === 4);
    rig!.clock.advance(METER_SETTLE_MS);

    expect(target.meters.slice(checks).map((meters) => Object.fromEntries(meters))).toEqual([{ 1: 3, 2: 4 }]);
  });

  // Plays into the second song, which Live reports in 6/8, so a meter waits for Live to stop, then
  // silences Live until the server counts it lost, as a stall of Live's control surface does while the
  // music plays on.
  async function lostMidSong() {
    const { target, producer } = await checkedRig([], TWO_SONGS);
    await producer.snapshot(shows(MATCHED));
    rig!.live.setPlaying(true);
    await next(producer, (snapshot) => snapshot.playing);
    rig!.live.setPosition(40);
    rig!.live.setSignature(6, 8);
    rig!.live.setPosition(44);
    await next(producer, (snapshot) => snapshot.position === 44);
    const checks = target.checks.length;

    await rig!.stopLive();
    rig!.clock.advance(SILENT_BEFORE_LOST_MS);
    await next(producer, (snapshot) => snapshot.live === 'not-connected');
    expect(target.checks).toHaveLength(checks);
    return { target, producer, checks };
  }

  it('holds the check while Live is lost mid-song and comes back playing, and runs it once Live stops', async () => {
    const { target, producer, checks } = await lostMidSong();

    await rig!.startLive({ playing: true, position: 52, signature: { numerator: 6, denominator: 8 } });
    rig!.clock.advance(PROBE_INTERVAL_MS);
    await next(producer, (snapshot) => snapshot.live === 'connected' && snapshot.playing);
    await rig!.advanceConnected(LOOP_REPORT_MS);
    expect(target.checks).toHaveLength(checks);

    rig!.live.setPlaying(false);
    await next(producer, (snapshot) => !snapshot.playing);
    expect(target.checks).toHaveLength(checks + 1);
    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 4, 2: 3 });
  });

  it('runs the held check once Live, lost mid-song, comes back stopped', async () => {
    const { target, producer, checks } = await lostMidSong();

    await rig!.startLive({ playing: false, position: 44, signature: { numerator: 6, denominator: 8 } });
    rig!.clock.advance(PROBE_INTERVAL_MS);
    await next(producer, (snapshot) => snapshot.live === 'connected' && snapshot.position === 44);
    await rig!.advanceConnected(LOOP_REPORT_MS);
    expect(target.checks).toHaveLength(checks + 1);
    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 4, 2: 3 });
  });

  // A song in 6/8 with a Pad after it, into a song in 4/4. The set builder starts the next song's
  // meter on the Pad locator, so Live reports 4/4 while the playhead is still in the first song's Pad.
  const PAD_SONGS: CuePoint[] = [
    { name: '1 - Intro (First Song)', time: 0 },
    { name: '1 - Verse', time: 12 },
    { name: '1 - Pad', time: 24 },
    { name: '1 - End', time: 48 },
    { name: '2 - Intro (Second Song)', time: 48 },
    { name: '2 - Verse', time: 64 },
    { name: '2 - End', time: 80 },
  ];

  it("keeps a song's own meter when the next song's meter starts on its Pad", async () => {
    const { target, producer } = await checkedRig([], PAD_SONGS);
    await producer.snapshot(shows(MATCHED));
    rig!.live.setSignature(6, 8);
    rig!.live.setPosition(6);
    await next(producer, (snapshot) => snapshot.position === 6);
    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3 });

    rig!.live.setPosition(30);
    await next(producer, (snapshot) => snapshot.position === 30);
    rig!.live.setSignature(4, 4);
    rig!.live.setPosition(52);
    await next(producer, (snapshot) => snapshot.position === 52);
    rig!.clock.advance(METER_SETTLE_MS);

    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3, 2: 4 });
  });

  // A song in 6/8, then a song in 4/4 with a Count Off, which a count-in to its Verse plays through.
  const COUNT_IN_SONGS: CuePoint[] = [
    { name: '1 - Intro (First Song)', time: 0 },
    { name: '1 - Verse', time: 12 },
    { name: '1 - End', time: 24 },
    { name: '2 - Count Off (Second Song)', time: 24 },
    { name: '2 - Intro', time: 28 },
    { name: '2 - Verse', time: 36 },
    { name: '2 - End', time: 52 },
  ];

  // Walks the playhead through both songs, each in its own meter, and leaves Live stopped in the
  // first, reporting 6/8.
  async function walkedRig() {
    const { target, producer } = await checkedRig([], COUNT_IN_SONGS);
    await producer.snapshot(shows(MATCHED));
    rig!.live.setSignature(6, 8);
    rig!.live.setPosition(6);
    await next(producer, (snapshot) => snapshot.position === 6);
    rig!.live.setPosition(40);
    rig!.live.setSignature(4, 4);
    rig!.live.setPosition(44);
    await next(producer, (snapshot) => snapshot.position === 44);
    rig!.live.setPosition(6);
    rig!.live.setSignature(6, 8);
    rig!.live.setPosition(8);
    await next(producer, (snapshot) => snapshot.position === 8);
    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3, 2: 4 });
    const leader = await rig!.connectLeader();
    await leader.snapshot(loaded);
    return { target, producer, leader };
  }

  it.each([
    { what: 'a count-in', press: { kind: 'count-in', song: 2, section: 2 } },
    { what: 'Play from start', press: { kind: 'play-from-start', song: 2 } },
  ])('holds the check while $what from a stopped Live starts a song of another meter', async ({ press }) => {
    const { target, producer, leader } = await walkedRig();
    const checks = target.checks.length;

    // Live reports the jump into the second song while still stopped, with the first song's meter.
    leader.send(press);
    await next(producer, (snapshot) => snapshot.playing);
    await rig!.advanceConnected(1000);
    expect(target.checks).toHaveLength(checks);

    rig!.live.setSignature(4, 4);
    rig!.live.setPlaying(false);
    await next(producer, (snapshot) => !snapshot.playing);
    expect(target.checks).toHaveLength(checks + 1);
    expect(Object.fromEntries(target.meters.at(-1)!)).toEqual({ 1: 3, 2: 4 });
  });

  it('runs the held check once a start Live never reported would have been reported', async () => {
    const { target, producer, leader } = await walkedRig();
    const checks = target.checks.length;

    rig!.live.loseNext('/live/song/start_playing');
    leader.send({ kind: 'play-from-start', song: 2 });
    await next(producer, (snapshot) => snapshot.position === 24);
    expect(target.checks).toHaveLength(checks);

    await rig!.advanceConnected(1000);
    expect(target.checks).toHaveLength(checks + 1);
  });
});

describe('a pick', () => {
  const PICK = { label: 'Playlist', options: [{ id: 'october-25', label: 'October 25' }] };

  // A rig with Live stopped, one fake target that offers a pick and matches every name, and the
  // producer connected once its row shows the pick and the check.
  async function pickRig() {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter', pick: PICK });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    await producer.snapshot((snapshot) => shows(MATCHED)(snapshot) && snapshot.connections[0]?.pick !== null);
    return { target, producer };
  }

  it("runs the target's check again with the set, and the row shows what it now cannot match", async () => {
    const { target, producer } = await pickRig();
    const checks = target.checks.length;

    // The playlist picked has no Chorus.
    target.setUnmatched(['Chorus']);
    producer.send({ kind: 'pick', target: 'propresenter', choice: 'october-25' });

    await producer.snapshot(shows(unmatched('Chorus')));
    expect(target.picks.map(({ choice }) => choice)).toEqual(['october-25']);
    expect(target.checks).toHaveLength(checks + 1);
    expect(sectionNames(target, -1)).toEqual([['Intro', 'Verse', 'Chorus']]);
  });

  it('runs no check for a choice the target does not offer', async () => {
    const { target, producer } = await pickRig();
    const checks = target.checks.length;

    producer.send({ kind: 'pick', target: 'propresenter', choice: 'october-11' });
    await producer.flush();

    expect(target.picks).toEqual([]);
    expect(target.checks).toHaveLength(checks);
  });
});

describe("a target's own file changed at the target", () => {
  it("runs the target's check again against the set with no Refresh, and the row shows what it now cannot match", async () => {
    const { target, producer } = await checkedRig(['Chorus']);
    await producer.snapshot(shows(unmatched('Chorus')));
    const checks = target.checks.length;

    // An operator renames a slide in the target's own file, and the target reports the change.
    target.setUnmatched(['Verse', 'Chorus']);
    target.changeFile();

    await producer.snapshot(shows(unmatched('Verse', 'Chorus')));
    expect(target.checks).toHaveLength(checks + 1);
    expect(sectionNames(target, -1)).toEqual([['Intro', 'Verse', 'Chorus']]);
  });

  it('runs no check while the target is offline, and the row stays not checked', async () => {
    const { target, producer } = await checkedRig(['Chorus']);
    await producer.snapshot(shows(unmatched('Chorus')));
    target.goOffline();
    await next(producer, (snapshot) => snapshot.connections[0]?.connection === 'offline');
    const checks = target.checks.length;

    target.setUnmatched(['Verse']);
    target.changeFile();
    await producer.flush();

    expect(target.checks).toHaveLength(checks);
    expect(producer.received.at(-1)?.connections[0]?.check).toEqual(NOT_CHECKED);
  });
});
