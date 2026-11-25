import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Connection, ProducerSnapshot, Snapshot } from '../src/shared/snapshot.ts';
import { fakeKind, fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

let rig: Rig | undefined;

// The fake kind's section good, and the "other" kind's rejected.
const BAD_SECTION = resolve(import.meta.dirname, 'fixtures/connections/bad-section.json');

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// One song in 4/4 at 120 BPM, so a beat is 500 ms.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];

// Sends the producer's command, and resolves with the first snapshot after it that matches. A
// snapshot the producer received before the command never counts.
async function sendThen(producer: Client<ProducerSnapshot>, command: unknown, matches: (snapshot: ProducerSnapshot) => boolean) {
  const start = producer.received.length;
  producer.send(command);
  return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
}

// A row is compared on the fields these tests are about. Its pre-service check has its own tests
// (pre-service-check.test.ts).
const row = (connection: Connection['connection'], arm: Connection['arm']) => (snapshot: ProducerSnapshot) =>
  loaded(snapshot) && snapshot.connections[0]?.connection === connection && snapshot.connections[0]?.arm === arm;

describe('the connections part of the producer snapshot', () => {
  it('holds one row per target, online once it reports and disarmed at start', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();

    const snapshot = await producer.snapshot(row('online', 'disarmed'));

    expect(snapshot.connections).toMatchObject([{ name: 'propresenter', label: 'ProPresenter', connection: 'online', arm: 'disarmed' }]);
  });

  it('says offline once the target goes offline', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    await producer.snapshot(row('online', 'disarmed'));

    target.goOffline();

    expect((await producer.snapshot(row('offline', 'disarmed'))).connections).toHaveLength(1);
  });

  it('gives the leader and viewer no connections part, on connect and after a change', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    const viewer = await rig.connectViewer();
    await Promise.all([producer.snapshot(row('online', 'disarmed')), leader.snapshot(loaded), viewer.snapshot(loaded)]);

    target.goOffline();
    await producer.snapshot(row('offline', 'disarmed'));
    producer.send({ kind: 'arm', target: 'propresenter' });
    await producer.snapshot(row('offline', 'armed'));
    await leader.flush();
    await viewer.flush();

    const all: Snapshot[] = [...leader.received, ...viewer.received];
    expect(all.length).toBeGreaterThan(0);
    for (const snapshot of all) expect(snapshot).not.toHaveProperty('connections');
  });

  it('sends the leader and viewer nothing on a change to the connections alone', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    const viewer = await rig.connectViewer();
    await Promise.all([producer.snapshot(row('online', 'disarmed')), leader.snapshot(loaded), viewer.snapshot(loaded)]);
    await leader.flush();
    await viewer.flush();
    const counts = [leader.received.length, viewer.received.length];

    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));
    target.goOffline();
    await producer.snapshot(row('offline', 'armed'));
    await leader.flush();
    await viewer.flush();

    expect([leader.received.length, viewer.received.length]).toEqual(counts);
  });
});

const VERSE = { song: 1, title: null, section: 1, name: 'Verse', cause: 'played-into' };
const CHORUS = { song: 1, title: null, section: 2, name: 'Chorus', cause: 'played-into' };

// A rig whose fake Live is playing from the Intro, with one fake target and the producer connected,
// once the producer sees the set and the target online.
async function playingRig() {
  const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
  rig = await startRig(SET, { playing: true, position: 0 }, { targets: [target] });
  const producer = await rig.connectProducer();
  await producer.snapshot((snapshot) => row('online', 'disarmed')(snapshot) && snapshot.position === 0);
  // Moves the playhead while Live plays, and resolves once the producer has seen it there.
  const playTo = async (beats: number) => {
    rig?.live.setPosition(beats);
    await producer.snapshot((snapshot) => snapshot.position === beats);
  };
  return { target, producer, playTo };
}

describe('arm and disarm', () => {
  it('Arm and Disarm change the producer row', async () => {
    const { producer } = await playingRig();

    const armed = await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));
    expect(armed.connections).toMatchObject([{ name: 'propresenter', label: 'ProPresenter', connection: 'online', arm: 'armed' }]);

    const disarmed = await sendThen(producer, { kind: 'disarm', target: 'propresenter' }, row('online', 'disarmed'));
    expect(disarmed.connections).toMatchObject([{ name: 'propresenter', label: 'ProPresenter', connection: 'online', arm: 'disarmed' }]);
  });

  it("ignores a leader's Arm, and the target gets no cue as the song plays", async () => {
    const { target, producer, playTo } = await playingRig();
    const leader = await rig!.connectLeader();
    await leader.snapshot(loaded);

    leader.send({ kind: 'arm', target: 'propresenter' });
    await leader.flush();
    await playTo(16);
    await playTo(32);

    expect(producer.received.every((snapshot) => snapshot.connections[0]?.arm === 'disarmed')).toBe(true);
    expect(target.cues).toEqual([]);
  });

  it('ignores an Arm for a target that does not exist', async () => {
    const { target, producer, playTo } = await playingRig();
    const before = producer.received.length;

    producer.send({ kind: 'arm', target: 'lights' });
    await producer.flush();
    await playTo(16);

    expect(producer.received.slice(before).every((snapshot) => snapshot.connections[0]?.arm === 'disarmed')).toBe(true);
    expect(target.cues).toEqual([]);
  });

  // The target hands the screen back to the server on the producer's Arm, such as ProPresenter
  // forgetting the slide the operator pressed (setlist-controller#266).
  it("tells the target of each Arm, armed already, paused by hand or disarmed, and of no Disarm", async () => {
    const { target, producer } = await playingRig();

    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));
    expect(target.arms()).toBe(1);
    producer.send({ kind: 'arm', target: 'propresenter' });
    await producer.flush();
    expect(target.arms()).toBe(2);
    const paused = producer.snapshot((snapshot) => snapshot.connections[0]?.arm === 'paused');
    target.changeByHand();
    await paused;
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));
    expect(target.arms()).toBe(3);
    await sendThen(producer, { kind: 'disarm', target: 'propresenter' }, row('online', 'disarmed'));
    expect(target.arms()).toBe(3);
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));

    expect(target.arms()).toBe(4);
  });

  it('tells a target the Fade out paused nothing when the next Count Off arms it again', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter', pausesOnFade: true });
    const twoSongs: CuePoint[] = [
      { name: '1 - Count Off', time: 0 },
      { name: '1 - Verse', time: 8 },
      { name: '1 - Chorus', time: 24 },
      { name: '1 - End', time: 40 },
      { name: '2 - Count Off', time: 40 },
      { name: '2 - Verse', time: 48 },
      { name: '2 - End', time: 64 },
    ];
    rig = await startRig(twoSongs, { playing: true, position: 12 }, { targets: [target] });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    await producer.snapshot((snapshot) => row('online', 'disarmed')(snapshot) && snapshot.position === 12);
    await leader.snapshot(loaded);
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));
    const faded = producer.snapshot((snapshot) => snapshot.connections[0]?.pause === 'fade-out');
    leader.send({ kind: 'fade-out' });
    await faded;

    // Through song 1's End into song 2's Count Off at 40, which arms the target again.
    const armed = producer.snapshot((snapshot) => row('online', 'armed')(snapshot) && (snapshot.position ?? 0) > 40);
    rig.live.advance(14 * 500);
    await producer.snapshot((snapshot) => (snapshot.position ?? 0) >= 26);
    rig.live.advance(15 * 500);
    await armed;

    expect(target.cues.map(({ song, name }) => `${song} ${name}`)).toContain('2 Count Off');
    expect(target.arms()).toBe(1);
  });
});

describe('cues', () => {
  it('reach no disarmed target as the playhead plays through a song', async () => {
    const { target, playTo } = await playingRig();

    await playTo(8);
    await playTo(16);
    await playTo(24);
    await playTo(32);
    await playTo(48);

    expect(target.cues).toEqual([]);
  });

  it('reach an armed target, one for each section played into, in order, with the song, the section and the cause', async () => {
    const { target, producer, playTo } = await playingRig();
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));

    await playTo(8);
    await playTo(16);
    await playTo(24);
    await playTo(32);

    expect(target.cues).toEqual([VERSE, CHORUS]);
  });

  it("carry the song's own title when the set gives one", async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(
      [
        { name: '1 - Intro (Goodness of God)', time: 0 },
        { name: '1 - Verse', time: 16 },
        { name: '1 - End', time: 32 },
      ],
      { playing: true, position: 0 },
      { targets: [target] },
    );
    const producer = await rig.connectProducer();
    await producer.snapshot((snapshot) => row('online', 'disarmed')(snapshot) && snapshot.position === 0);
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));

    rig.live.setPosition(16);
    await producer.snapshot((snapshot) => snapshot.position === 16);

    expect(target.cues).toEqual([{ ...VERSE, title: 'Goodness of God' }]);
  });

  it('stop after Disarm', async () => {
    const { target, producer, playTo } = await playingRig();
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));
    await playTo(16);

    await sendThen(producer, { kind: 'disarm', target: 'propresenter' }, row('online', 'disarmed'));
    await playTo(32);

    expect(target.cues).toEqual([VERSE]);
  });

  it('reach no offline target, and going online again replays nothing', async () => {
    const { target, producer, playTo } = await playingRig();
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));

    target.goOffline();
    await producer.snapshot(row('offline', 'armed'));
    await playTo(16);
    target.goOnline();
    await producer.snapshot((snapshot) => row('online', 'armed')(snapshot) && snapshot.position === 16);

    expect(target.cues).toEqual([]);

    await playTo(32);

    expect(target.cues).toEqual([CHORUS]);
  });

  it('fire nothing while Live is stopped', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    await producer.snapshot((snapshot) => row('online', 'disarmed')(snapshot) && snapshot.position === 0);
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));

    rig.live.setPosition(16);
    await producer.snapshot((snapshot) => snapshot.position === 16);
    rig.live.setPosition(32);
    await producer.snapshot((snapshot) => snapshot.position === 32);

    expect(target.cues).toEqual([]);
  });
});

describe("a target's read-only state", () => {
  it('shows on the producer row alone, as the target last reported it, and goes when the target goes offline', async () => {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    const viewer = await rig.connectViewer();
    const first = await producer.snapshot(row('online', 'disarmed'));
    await Promise.all([leader.snapshot(loaded), viewer.snapshot(loaded)]);
    expect(first.connections[0]?.state).toEqual([]);

    const lines = ['Cue 12', 'Look 3'];
    const shown = producer.snapshot((snapshot) => snapshot.connections[0]?.state.length === 2);
    target.setState(lines);
    expect((await shown).connections[0]?.state).toEqual(['Cue 12', 'Look 3']);
    lines.push('changed after the report');

    const replaced = producer.snapshot((snapshot) => snapshot.connections[0]?.state.length === 1);
    target.setState(['Cue 13']);
    expect((await replaced).connections[0]?.state).toEqual(['Cue 13']);

    const none = await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));
    expect(none.connections[0]?.state).toEqual(['Cue 13']);
    target.setState(null);
    await producer.snapshot((snapshot) => snapshot.connections[0]?.state.length === 0);

    target.setState(['Cue 14']);
    await producer.snapshot((snapshot) => snapshot.connections[0]?.state.length === 1);
    target.goOffline();
    const offline = await producer.snapshot(row('offline', 'armed'));
    expect(offline.connections[0]?.state).toEqual([]);
    const before = producer.received.length;
    target.setState(['Cue 15']);
    await producer.flush();
    expect(producer.received.slice(before).every((snapshot) => snapshot.connections[0]?.state.length === 0)).toBe(true);
    const back = producer.received.length;
    target.goOnline();
    const online = await producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= back && row('online', 'armed')(snapshot));
    expect(online.connections[0]?.state).toEqual([]);

    await leader.flush();
    await viewer.flush();
    for (const snapshot of [...leader.received, ...viewer.received]) expect(JSON.stringify(snapshot)).not.toContain('Cue 1');
  });

  it('carries a list under the lines, replaced by each report, cleared by a report without one, and gone while the target is offline', async () => {
    const target = fakeTarget({ name: 'eos', label: 'Lights' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    const viewer = await rig.connectViewer();
    const first = await producer.snapshot(row('online', 'disarmed'));
    await viewer.snapshot(loaded);
    expect(first.connections[0]?.list).toEqual([]);

    const list = ['Cue 1 Walk in', 'Cue 2 Verse'];
    const shown = producer.snapshot((snapshot) => snapshot.connections[0]?.list.length === 2);
    target.setState(['Live cue 1 Walk in'], list);
    expect((await shown).connections[0]).toMatchObject({ state: ['Live cue 1 Walk in'], list: ['Cue 1 Walk in', 'Cue 2 Verse'] });
    list.push('changed after the report');

    const replaced = producer.snapshot((snapshot) => snapshot.connections[0]?.list[0] === 'Cue 2 Verse');
    target.setState(['Live cue 2 Verse'], ['Cue 2 Verse']);
    expect((await replaced).connections[0]).toMatchObject({ state: ['Live cue 2 Verse'], list: ['Cue 2 Verse'] });

    const lines = producer.snapshot((snapshot) => snapshot.connections[0]?.state[0] === 'Live cue 3');
    target.setState(['Live cue 3']);
    expect((await lines).connections[0]).toMatchObject({ state: ['Live cue 3'], list: [] });

    const listAlone = producer.snapshot((snapshot) => snapshot.connections[0]?.list[0] === 'Cue 4');
    target.setState([], ['Cue 4']);
    expect((await listAlone).connections[0]).toMatchObject({ state: [], list: ['Cue 4'] });
    const start = producer.received.length;
    const cleared = producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && snapshot.connections[0]?.list.length === 0);
    target.setState(null, null);
    expect((await cleared).connections[0]).toMatchObject({ state: [], list: [] });

    target.setState([], ['Cue 5']);
    await producer.snapshot((snapshot) => snapshot.connections[0]?.list[0] === 'Cue 5');
    target.goOffline();
    const offline = await producer.snapshot(row('offline', 'disarmed'));
    expect(offline.connections[0]?.list).toEqual([]);
    const before = producer.received.length;
    target.setState([], ['Cue 6']);
    await producer.flush();
    expect(producer.received.slice(before).every((snapshot) => snapshot.connections[0]?.list.length === 0)).toBe(true);
    const back = producer.received.length;
    target.goOnline();
    const online = await producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= back && row('online', 'disarmed')(snapshot));
    expect(online.connections[0]?.list).toEqual([]);

    await viewer.flush();
    for (const snapshot of viewer.received) expect(JSON.stringify(snapshot)).not.toContain('Cue 2');
  });

  it('carries the list line the target marks as current, cleared by a report without one, null outside the list, and gone while the target is offline', async () => {
    const target = fakeTarget({ name: 'eos', label: 'Lights' });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    // The first snapshot from now on that matches, so one received before the report never counts.
    const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
      const start = producer.received.length;
      return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
    };
    const first = await producer.snapshot(row('online', 'disarmed'));
    expect(first.connections[0]?.listCurrent).toBeNull();

    const marked = next((snapshot) => snapshot.connections[0]?.listCurrent === 1);
    target.setState(['Live cue 2'], ['Cue 1', 'Cue 2', 'Cue 3'], 1);
    expect((await marked).connections[0]).toMatchObject({ list: ['Cue 1', 'Cue 2', 'Cue 3'], listCurrent: 1 });

    const moved = next((snapshot) => snapshot.connections[0]?.listCurrent === 2);
    target.setState(['Live cue 3'], ['Cue 1', 'Cue 2', 'Cue 3'], 2);
    await moved;

    const none = next((snapshot) => snapshot.connections[0]?.state[0] === 'Live cue 9');
    target.setState(['Live cue 9'], ['Cue 1', 'Cue 2', 'Cue 3']);
    expect((await none).connections[0]?.listCurrent).toBeNull();

    for (const [label, outside] of [
      ['past the end', 3],
      ['negative', -1],
      ['not whole', 0.5],
    ] as const) {
      const reset = next((snapshot) => snapshot.connections[0]?.listCurrent === 0);
      target.setState([], ['Cue 1', 'Cue 2', 'Cue 3'], 0);
      await reset;
      const ignored = next((snapshot) => snapshot.connections[0]?.state[0] === label);
      target.setState([label], ['Cue 1', 'Cue 2', 'Cue 3'], outside);
      expect((await ignored).connections[0]?.listCurrent).toBeNull();
    }

    const one = next((snapshot) => snapshot.connections[0]?.list.length === 1 && snapshot.connections[0]?.listCurrent === 0);
    target.setState([], ['Cue 1'], 0);
    await one;
    const offline = next(row('offline', 'disarmed'));
    target.goOffline();
    expect((await offline).connections[0]?.listCurrent).toBeNull();
    const before = producer.received.length;
    target.setState([], ['Cue 1'], 0);
    await producer.flush();
    expect(producer.received.slice(before).every((snapshot) => snapshot.connections[0]?.listCurrent === null)).toBe(true);
  });
});

describe("a target's reported problem", () => {
  const problems = (snapshot: ProducerSnapshot) => snapshot.connections[0]?.problems;

  it('shows on the producer row alone, offline and online, stays across an offline, and goes when the target reports none', async () => {
    const target = fakeTarget({ name: 'atem', label: 'ATEM' });
    target.goOffline();
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target] });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    const viewer = await rig.connectViewer();
    const first = await producer.snapshot(row('offline', 'disarmed'));
    await Promise.all([leader.snapshot(loaded), viewer.snapshot(loaded)]);
    expect(problems(first)).toEqual([]);

    const PROBLEM = 'The ATEM could not connect: Could not start the socket process.';
    const shown = producer.snapshot((snapshot) => problems(snapshot)?.length === 1);
    target.setProblem(PROBLEM);
    expect(await shown).toMatchObject({ connections: [{ configured: true, connection: 'offline', problems: [PROBLEM] }] });

    const armed = await sendThen(producer, { kind: 'arm', target: 'atem' }, row('offline', 'armed'));
    expect(problems(armed)).toEqual([PROBLEM]);
    const start = producer.received.length;
    target.goOnline();
    const up = await producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && row('online', 'armed')(snapshot));
    expect(problems(up)).toEqual([PROBLEM]);
    const down = producer.received.length;
    target.goOffline();
    const off = await producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= down && row('offline', 'armed')(snapshot));
    expect(problems(off)).toEqual([PROBLEM]);

    const cleared = producer.snapshot((snapshot) => problems(snapshot)?.length === 0);
    target.setProblem(null);
    expect(problems(await cleared)).toEqual([]);

    await leader.flush();
    await viewer.flush();
    for (const snapshot of [...leader.received, ...viewer.received]) {
      expect(snapshot).not.toHaveProperty('connections');
      expect(JSON.stringify(snapshot)).not.toContain('could not connect');
    }
  });
});

describe('a target whose cue fails', () => {
  async function failingRig(fail: () => void | Promise<void>) {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = fakeTarget({ name: 'bad', label: 'Bad' });
    bad.cue = fail;
    const good = fakeTarget({ name: 'good', label: 'Good' });
    rig = await startRig(SET, { playing: true, position: 8 }, { targets: [bad, good] });
    const producer = await rig.connectProducer();
    await producer.snapshot((snapshot) => loaded(snapshot) && snapshot.connections.every((row) => row.connection === 'online'));
    for (const target of ['bad', 'good']) {
      await sendThen(producer, { kind: 'arm', target }, (snapshot) => snapshot.connections.find((row) => row.name === target)?.arm === 'armed');
    }
    return { good, producer, logged };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves the next target cued and the producer told of the move, and logs the failure', async () => {
    const boom = new Error('cue failed');
    const { good, producer, logged } = await failingRig(() => {
      throw boom;
    });

    rig!.live.setPosition(16);
    await producer.snapshot((snapshot) => snapshot.position === 16);

    expect(good.cues).toEqual([VERSE]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('connection target bad'), boom);
  });

  it('leaves the next target cued when the cue rejects, and logs the rejection', async () => {
    const boom = new Error('cue rejected');
    const { good, producer, logged } = await failingRig(async () => {
      throw boom;
    });

    rig!.live.setPosition(16);
    await producer.snapshot((snapshot) => snapshot.position === 16);
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.stringContaining('connection target bad'), boom));

    expect(good.cues).toEqual([VERSE]);
  });

  it('keeps the failing target armed, so it gets the next cue', async () => {
    let calls = 0;
    const { producer } = await failingRig(() => {
      calls += 1;
      throw new Error('cue failed');
    });

    rig!.live.setPosition(16);
    await producer.snapshot((snapshot) => snapshot.position === 16);
    rig!.live.setPosition(32);
    const seen = await producer.snapshot((snapshot) => snapshot.position === 32);

    expect(calls).toBe(2);
    expect(seen.connections.find((row) => row.name === 'bad')?.arm).toBe('armed');
  });
});

describe("a target's pick", () => {
  const PLAYLISTS = [
    { id: 'p1', label: 'October 25' },
    { id: 'p2', label: 'October 11' },
  ];
  const pickOf = (snapshot: ProducerSnapshot) => snapshot.connections[0]?.pick;

  // A rig whose fake Live is stopped on the set, with one fake target that offers PLAYLISTS to pick
  // from, and the producer connected, once the producer sees the set and the target online.
  async function pickRig({ liveRunning = true }: { liveRunning?: boolean } = {}) {
    const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter', pick: { label: 'Playlist', options: PLAYLISTS } });
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [target], liveRunning });
    const producer = await rig.connectProducer();
    await producer.snapshot((snapshot) => (liveRunning ? loaded(snapshot) : true) && snapshot.connections[0]?.connection === 'online');
    return { target, producer };
  }

  it('shows the pick the target reports on its row, and none for a target that offers none', async () => {
    const { producer } = await pickRig();
    expect(pickOf(await producer.snapshot(loaded))).toEqual({ label: 'Playlist', options: PLAYLISTS, picked: null });

    const plain = fakeTarget({ name: 'lights', label: 'Lights' });
    await rig?.close();
    rig = await startRig(SET, { playing: false, position: 0 }, { targets: [plain] });
    const other = await rig.connectProducer();
    expect(pickOf(await other.snapshot((snapshot) => loaded(snapshot) && snapshot.connections[0]?.connection === 'online'))).toBeNull();
  });

  it("hands the producer's pick to the target with the set, and the row shows what the target reports", async () => {
    const { target, producer } = await pickRig();

    const picked = await sendThen(producer, { kind: 'pick', target: 'propresenter', choice: 'p2' }, (snapshot) => pickOf(snapshot)?.picked !== null);

    expect(target.picks.map(({ choice }) => choice)).toEqual(['p2']);
    expect(target.picks[0]?.set.songs.map((song) => song.sections.map((section) => section.name))).toEqual([['Intro', 'Verse', 'Chorus']]);
    expect(pickOf(picked)).toEqual({ label: 'Playlist', options: PLAYLISTS, picked: { id: 'p2', label: 'October 11' } });
  });

  it("ignores a leader's pick", async () => {
    const { target } = await pickRig();
    const leader = await rig!.connectLeader();
    await leader.snapshot(loaded);

    leader.send({ kind: 'pick', target: 'propresenter', choice: 'p1' });
    await leader.flush();

    expect(target.picks).toEqual([]);
  });

  it('ignores a pick of an id the target does not offer, and a pick for a target that does not exist', async () => {
    const { target, producer } = await pickRig();

    producer.send({ kind: 'pick', target: 'propresenter', choice: 'p9' });
    producer.send({ kind: 'pick', target: 'lights', choice: 'p1' });
    await producer.flush();

    expect(target.picks).toEqual([]);
  });

  it('ignores a pick for an offline target, and keeps the reported pick on its row while it is offline', async () => {
    const { target, producer } = await pickRig();
    await sendThen(producer, { kind: 'pick', target: 'propresenter', choice: 'p1' }, (snapshot) => pickOf(snapshot)?.picked !== null);

    target.goOffline();
    const offline = await producer.snapshot((snapshot) => snapshot.connections[0]?.connection === 'offline');
    producer.send({ kind: 'pick', target: 'propresenter', choice: 'p2' });
    await producer.flush();

    expect(target.picks.map(({ choice }) => choice)).toEqual(['p1']);
    expect(pickOf(offline)?.picked).toEqual({ id: 'p1', label: 'October 25' });
  });

  it('ignores a pick while no set is known, and logs why', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { target, producer } = await pickRig({ liveRunning: false });

    producer.send({ kind: 'pick', target: 'propresenter', choice: 'p1' });
    await producer.flush();

    expect(target.picks).toEqual([]);
    expect(logged).toHaveBeenCalledWith('Setlist server: the connection target propresenter ignored the pick: no set has been read from Live.');
  });

  it('shows no pick on a row the connections config disabled', async () => {
    const target = fakeTarget({ name: 'fake', label: 'Fake', pick: { label: 'Playlist', options: PLAYLISTS } });
    rig = await startRig(SET, { playing: false, position: 0 }, { connectionsConfig: BAD_SECTION, targetKinds: { fake: fakeKind(target), other: fakeKind(target, { label: 'Other' }) } });
    const producer = await rig.connectProducer();

    const snapshot = await producer.snapshot((snapshot) => loaded(snapshot) && snapshot.connections[0]?.connection === 'online');

    expect(snapshot.connections.map((row) => [row.name, row.configured, row.pick === null])).toEqual([
      ['fake', true, false],
      ['other', false, true],
    ]);
  });

  it('keeps the server running when the pick fails, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { target, producer } = await pickRig();
    const boom = new Error('pick failed');
    target.pick = async () => {
      throw boom;
    };

    producer.send({ kind: 'pick', target: 'propresenter', choice: 'p1' });
    await producer.flush();
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.stringContaining('connection target propresenter'), boom));
    await sendThen(producer, { kind: 'arm', target: 'propresenter' }, row('online', 'armed'));
    vi.restoreAllMocks();
  });
});
