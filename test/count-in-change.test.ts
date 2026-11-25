import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { ProducerSnapshot, Snapshot } from '../src/shared/snapshot.ts';
import { fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Song 1 in 4/4 opens on a Count Off of 2 bars, and ends on a Pad before its End. Song 2 has no Count
// Off. Listed in time order, so a cue's index is its place in the list.
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
const VERSE = 2;
const BRIDGE = 3;
const PAD = 4;
const COUNT_OFF_CUE = 0;
const INTRO_CUE = 1;
const VERSE_CUE = 2;
const BRIDGE_CUE = 3;
// Song 2's Verse, the cue a barrier jumps to.
const SONG_2_VERSE_CUE = 7;

// One song in 6/8, whose Count Off is 2 bars of 3 beats, and whose Bridge is followed by End.
const SIX_EIGHT_SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 6 },
  { name: '1 - Verse', time: 18 },
  { name: '1 - Bridge', time: 30 },
  { name: '1 - End', time: 42 },
];

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const countIn = (section: number) => ({ kind: 'count-in', song: 1, section });
const tap = (song: number, section: number) => ({ kind: 'jump', song, section });
const target = (section: number) => (snapshot: Snapshot) => snapshot.countIn && snapshot.jump?.song === 1 && snapshot.jump.section === section;

// The cues the fake Live has been told to jump to, in order.
const jumps = () => (rig?.received(JUMP) ?? []).map((message) => message.args[0]);

// The snapshot can reach a client before the OSC reaches the fake Live, so a test that moves the
// clock first waits for Live to hold every jump sent so far.
async function liveHasJumps(count: number) {
  await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(count));
}

// Moves Live on by that many beats, and waits for every client to see the playhead there. Returns
// the first client's snapshot of it.
async function play(beats: number, to: number, ...clients: Client[]) {
  rig?.live.advance(beats * BEAT_MS);
  const shown = [];
  for (const client of clients) shown.push(await client.snapshot(at(to)));
  return shown[0]!;
}

// A jump to song 2's Verse reaches Live after anything the server sent it before, so once Live holds
// that jump, it holds all Live will get of the presses before it.
async function barrier(leader: Client) {
  const before = jumps().length;
  leader.send(tap(2, 1));
  await vi.waitFor(() => expect(jumps().slice(before)).toContain(SONG_2_VERSE_CUE));
  return jumps().slice(0, -1);
}

// Counting in from stopped on beat 40, to the section given, with the playhead two beats into the
// Count Off's first bar, before the jump to the target goes to Live. In 6/8 the bar count of the
// section at 40, 4 bars of the Bridge, shows the server has Live's signature.
async function counting(section = BRIDGE, meter: '4/4' | '6/8' = '4/4') {
  const sixEight = meter === '6/8';
  rig = await startRig(sixEight ? SIX_EIGHT_SET : SET, { playing: false, position: 40, ...(sixEight ? { signature: { numerator: 6, denominator: 8 } } : {}) });
  const viewer = await rig.connectViewer();
  const producer = await rig.connectProducer();
  const leader = await rig.connectLeader();
  await leader.snapshot((snapshot) => at(40)(snapshot) && (!sixEight || snapshot.now?.bars === 4));
  leader.send(countIn(section));
  for (const client of [leader, producer, viewer]) await client.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && snapshot.countIn);
  await liveHasJumps(1);
  await play(2, 2, viewer, producer, leader);
  return { rig, viewer, producer, leader };
}

// Counting in to the Bridge, on from the Count Off's first bar to that beat of its last, once Live
// holds the jump to the Bridge.
async function sentAndAt(beat: number) {
  const clients = await counting();
  const { viewer, producer, leader } = clients;
  await play(2, 4, viewer, producer, leader);
  await liveHasJumps(2);
  await play(beat - 4, beat, viewer, producer, leader);
  return clients;
}

describe('Stop during the count', () => {
  it("stops Live on the Count Off in its first bar, and clears the count-in on every client", async () => {
    const { rig, viewer, producer, leader } = await counting();

    leader.send({ kind: 'stop' });

    await vi.waitFor(() => expect(rig.received(STOP)).toHaveLength(1));
    for (const client of [leader, producer, viewer]) {
      const stopped = await client.snapshot((snapshot) => at(2)(snapshot) && !snapshot.playing);
      expect(stopped.now?.section).toBe(COUNT_OFF);
      expect(stopped.jump).toBeNull();
      expect(stopped.countIn).toBe(false);
    }
    expect(await barrier(leader)).toEqual([COUNT_OFF_CUE]);
  });

  it('stops Live on the Count Off after the jump to the target was sent, which Live drops', async () => {
    const { rig, viewer, producer, leader } = await counting();
    await play(2, 4, viewer, producer, leader);
    await liveHasJumps(2);
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE]);

    leader.send({ kind: 'stop' });

    await vi.waitFor(() => expect(rig.received(STOP)).toHaveLength(1));
    for (const client of [leader, producer, viewer]) {
      const stopped = await client.snapshot((snapshot) => at(4)(snapshot) && !snapshot.playing);
      expect(stopped.now?.section).toBe(COUNT_OFF);
      expect(stopped.jump).toBeNull();
      expect(stopped.countIn).toBe(false);
    }
    // A stopped Live plays nothing on, so the dropped jump never moves the playhead.
    rig.live.advance(8 * BEAT_MS);
    await leader.flush();
    expect(leader.received.at(-1)?.position).toBe(4);
  });

  it("sends Live no jump to the target when Stop goes out before a report in the Count Off's last bar arrives", async () => {
    const { rig, viewer, producer, leader } = await counting();

    // Live plays into the last bar, but its report waits, as AbletonOSC's tick makes it, so the
    // server is told of the last bar only after it has sent the stop.
    rig.live.holdReplies();
    rig.live.advance(2.5 * BEAT_MS);
    leader.send({ kind: 'stop' });
    await vi.waitFor(() => expect(rig.received(STOP)).toHaveLength(1));
    rig.live.releaseReplies();

    for (const client of [leader, producer, viewer]) {
      const stopped = await client.snapshot((snapshot) => at(4.5)(snapshot) && !snapshot.playing);
      expect(stopped.now?.section).toBe(COUNT_OFF);
      expect(stopped.jump).toBeNull();
      expect(stopped.countIn).toBe(false);
    }
    expect(await barrier(leader)).toEqual([COUNT_OFF_CUE]);
  });
});

describe('a tap in the same song during the count', () => {
  it("moves the target, and Live lands on the new one where the Count Off ends", async () => {
    const { viewer, producer, leader } = await counting();

    leader.send(tap(1, VERSE));

    for (const client of [leader, producer, viewer]) await client.snapshot(target(VERSE));
    await play(2, 4, viewer, producer, leader);
    await liveHasJumps(2);
    expect(jumps()).toEqual([COUNT_OFF_CUE, VERSE_CUE]);
    const counted = await play(2, 6, viewer, producer, leader);
    expect(counted.now?.section).toBe(COUNT_OFF);
    expect(target(VERSE)(counted)).toBe(true);

    // Across the bar line at 8 by two beats, onto the Verse.
    rig?.live.advance(4 * BEAT_MS);
    for (const client of [leader, producer, viewer]) {
      const landed = await client.snapshot(at(26));
      expect(landed.now?.section).toBe(VERSE);
      expect(landed.jump).toBeNull();
      expect(landed.countIn).toBe(false);
    }
  });

  it('on the Intro plays into the Intro with no jump', async () => {
    const { viewer, producer, leader } = await counting();

    leader.send(tap(1, INTRO));

    for (const client of [leader, producer, viewer]) await client.snapshot(target(INTRO));
    await play(2, 4, viewer, producer, leader);
    const counted = await play(2, 6, viewer, producer, leader);
    expect(target(INTRO)(counted)).toBe(true);

    // Across the bar line at 8 by two beats, played on into the Intro.
    rig?.live.advance(4 * BEAT_MS);
    for (const client of [leader, producer, viewer]) {
      const landed = await client.snapshot(at(10));
      expect(landed.now?.section).toBe(INTRO);
      expect(landed.jump).toBeNull();
      expect(landed.countIn).toBe(false);
    }
    expect(await barrier(leader)).toEqual([COUNT_OFF_CUE]);
  });

  it.each([
    { what: 'a Pad', section: PAD },
    { what: 'the Count Off', section: COUNT_OFF },
  ])('on $what is ignored, and the count lands on the Bridge', async ({ section }) => {
    const { viewer, leader } = await counting();
    const from = viewer.received.length;

    leader.send(tap(1, section));
    await leader.flush();

    await play(2, 4, viewer, leader);
    await liveHasJumps(2);
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE]);
    const landed = await play(6, 42, viewer, leader);
    expect(landed.now?.section).toBe(BRIDGE);
    expect(landed.jump).toBeNull();
    expect(landed.countIn).toBe(false);
    // Until the landing, every client still read the count-in to the Bridge.
    const shown = viewer.received.slice(from);
    expect(shown.slice(0, shown.indexOf(landed)).every(target(BRIDGE))).toBe(true);
  });
});

describe('Next and Previous during the count', () => {
  // Sends the press, and waits for every client to show the count-in's target there.
  async function press(kind: 'next' | 'previous', section: number, ...clients: Client[]) {
    clients.at(-1)?.send({ kind });
    for (const client of clients) await client.snapshot(target(section));
  }

  // Sends a press that changes nothing, and checks every client still shows the count-in to that
  // section once the server has handled it.
  async function ignored(kind: 'next' | 'previous', section: number, leader: Client, ...clients: Client[]) {
    const all = [...clients, leader];
    const from = all.map((client) => client.received.length);
    leader.send({ kind });
    await leader.flush();
    for (const [index, client] of all.entries()) {
      const shown = client.received.slice(from[index]);
      expect(shown.every(target(section))).toBe(true);
      expect(target(section)(client.received.at(-1)!)).toBe(true);
    }
  }

  it('move the target from the target, not from the Count Off, and Next stops before the Pad', async () => {
    const { viewer, producer, leader } = await counting(VERSE);

    await press('next', BRIDGE, viewer, producer, leader);
    await ignored('next', BRIDGE, leader, viewer, producer);

    await play(2, 4, viewer, producer, leader);
    await liveHasJumps(2);
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE]);
    expect(target(BRIDGE)(leader.received.at(-1)!)).toBe(true);
    const landed = await play(6, 42, viewer, producer, leader);
    expect(landed.now?.section).toBe(BRIDGE);
    expect(landed.jump).toBeNull();
    expect(landed.countIn).toBe(false);
  });

  it('move the target back, and Previous stops on the Intro, which the count plays into with no jump', async () => {
    const { viewer, producer, leader } = await counting(VERSE);

    await press('previous', INTRO, viewer, producer, leader);
    await ignored('previous', INTRO, leader, viewer, producer);

    await play(2, 4, viewer, producer, leader);
    const counted = await play(2, 6, viewer, producer, leader);
    expect(target(INTRO)(counted)).toBe(true);
    const landed = await play(4, 10, viewer, producer, leader);
    expect(landed.now?.section).toBe(INTRO);
    expect(landed.jump).toBeNull();
    expect(landed.countIn).toBe(false);
    expect(await barrier(leader)).toEqual([COUNT_OFF_CUE]);
  });

  it('Next stops on the last section before End, in 6/8', async () => {
    const { viewer, producer, leader } = await counting(BRIDGE, '6/8');

    await ignored('next', BRIDGE, leader, viewer, producer);

    // The Count Off's last bar starts on beat 3 in 6/8.
    await play(1, 3, viewer, producer, leader);
    await liveHasJumps(2);
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE]);
    const landed = await play(4, 31, viewer, producer, leader);
    expect(landed.now?.section).toBe(BRIDGE);
    expect(landed.jump).toBeNull();
    expect(landed.countIn).toBe(false);
  });
});

// A change in the last moment before the Count Off's last bar line can reach Live after it, so Live
// has made the jump to the old target and makes the new one on the bar line after. Holding the fake
// Live's replies keeps the server on the report from before the bar line while the fake Live plays
// across it, which is how the change arrives late. Positions are float32-exact, since at() compares
// the reported position exactly.
describe('a change after the jump to the target was sent', () => {
  it('replaces it, and Live lands on the new target where the Count Off ends', async () => {
    const { viewer, producer, leader } = await sentAndAt(5);

    leader.send(tap(1, VERSE));

    for (const client of [leader, producer, viewer]) await client.snapshot(target(VERSE));
    await liveHasJumps(3);
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE, VERSE_CUE]);
    rig?.live.advance(5 * BEAT_MS);
    for (const client of [leader, producer, viewer]) {
      const landed = await client.snapshot(at(26));
      expect(landed.now?.section).toBe(VERSE);
      expect(landed.jump).toBeNull();
      expect(landed.countIn).toBe(false);
    }
  });

  it('to the Intro replaces it with the jump to the Intro, and the count plays into the Intro', async () => {
    const { viewer, producer, leader } = await sentAndAt(5);

    leader.send(tap(1, INTRO));

    for (const client of [leader, producer, viewer]) await client.snapshot(target(INTRO));
    await liveHasJumps(3);
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE, INTRO_CUE]);
    const landed = await play(5, 10, viewer, producer, leader);
    expect(landed.now?.section).toBe(INTRO);
    expect(landed.jump).toBeNull();
    expect(landed.countIn).toBe(false);
  });

  it('that reaches Live after the bar line lands one bar line later, and keeps the mark until then', async () => {
    const { rig, viewer, producer, leader } = await sentAndAt(7.875);

    // The tap leaves an eighth of a beat before the bar line at 8 and reaches Live after it, once Live
    // has made the jump to the Bridge.
    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(tap(1, VERSE));
    for (const client of [leader, producer, viewer]) await client.snapshot(target(VERSE));
    await liveHasJumps(3);
    rig.live.releaseReplies();

    // One bar of the Bridge, with every client still counting in to the Verse.
    for (const client of [leader, producer, viewer]) {
      const bridge = await client.snapshot(at(40.125));
      expect(bridge.now?.section).toBe(BRIDGE);
      expect(target(VERSE)(bridge)).toBe(true);
    }
    const last = await play(3.75, 43.875, viewer, producer, leader);
    expect(last.now?.section).toBe(BRIDGE);
    expect(target(VERSE)(last)).toBe(true);

    // Across the bar line at 44 by a quarter beat, onto the Verse.
    rig.live.advance(0.25 * BEAT_MS);
    for (const client of [leader, producer, viewer]) {
      const landed = await client.snapshot(at(24.125));
      expect(landed.now?.section).toBe(VERSE);
      expect(landed.jump).toBeNull();
      expect(landed.countIn).toBe(false);
    }
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE, VERSE_CUE]);
  });

  it('that Live makes in time lands where the Count Off ends', async () => {
    const { rig, viewer, producer, leader } = await sentAndAt(7.875);

    leader.send(tap(1, VERSE));
    for (const client of [leader, producer, viewer]) await client.snapshot(target(VERSE));
    await liveHasJumps(3);

    rig.live.advance(0.25 * BEAT_MS);
    for (const client of [leader, producer, viewer]) {
      const landed = await client.snapshot(at(24.125));
      expect(landed.now?.section).toBe(VERSE);
      expect(landed.jump).toBeNull();
      expect(landed.countIn).toBe(false);
    }
  });

  // Two changes inside the late window: the first reaches Live in time and the second after the bar
  // line, so Live jumps to the first change's target on the bar line and to the second's a bar later.
  it("that comes second of two late changes keeps the mark while Live plays the first change's target for a bar", async () => {
    const { rig, leader } = await sentAndAt(7.875);

    // The first change leaves an eighth of a beat before the bar line at 8 and reaches Live in time.
    leader.send(tap(1, VERSE));
    await leader.snapshot(target(VERSE));
    await liveHasJumps(3);

    // The second reaches Live after the bar line: Live jumps to the Verse at 8, and to the Intro on
    // the bar line after, at 28.
    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(tap(1, INTRO));
    await leader.snapshot(target(INTRO));
    await liveHasJumps(4);
    rig.live.releaseReplies();
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE, VERSE_CUE, INTRO_CUE]);

    // One bar of the Verse, with the count-in to the Intro still waiting.
    const verse = await leader.snapshot(at(24.125));
    expect(verse.now?.section).toBe(VERSE);
    expect(target(INTRO)(verse)).toBe(true);
    const last = await play(3.75, 27.875, leader);
    expect(target(INTRO)(last)).toBe(true);

    // Across the bar line at 28 by a quarter beat, onto the Intro.
    rig.live.advance(0.25 * BEAT_MS);
    const landed = await leader.snapshot(at(8.125));
    expect(landed.now?.section).toBe(INTRO);
    expect(landed.jump).toBeNull();
    expect(landed.countIn).toBe(false);
  });

  // Two changes inside the late window that both reach Live after the bar line: Live jumps to the
  // first target, the Bridge, on the bar line, and to the last change's target a bar later.
  it("that comes second of two late changes neither Live made in time keeps the mark while Live plays the first target for a bar", async () => {
    const { rig, leader } = await sentAndAt(7.875);

    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(tap(1, VERSE));
    await leader.snapshot(target(VERSE));
    leader.send(tap(1, INTRO));
    await leader.snapshot(target(INTRO));
    await liveHasJumps(4);
    rig.live.releaseReplies();
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE, VERSE_CUE, INTRO_CUE]);

    // One bar of the Bridge, with the count-in to the Intro still waiting.
    const bridge = await leader.snapshot(at(40.125));
    expect(bridge.now?.section).toBe(BRIDGE);
    expect(target(INTRO)(bridge)).toBe(true);
    const last = await play(3.75, 43.875, leader);
    expect(target(INTRO)(last)).toBe(true);

    // Across the bar line at 44 by a quarter beat, onto the Intro.
    rig.live.advance(0.25 * BEAT_MS);
    const landed = await leader.snapshot(at(8.125));
    expect(landed.now?.section).toBe(INTRO);
    expect(landed.jump).toBeNull();
    expect(landed.countIn).toBe(false);
  });

  // A Stop whose datagram is lost leaves the stop waiting for its report for a second. A change in that
  // second is the leader's, and goes to Live: had the stop reached Live, it would only move the
  // stopped playhead to the new target.
  it('goes to Live while a Stop that was lost waits, and Live, the pages and the cue all land on the new target', async () => {
    const cueTarget = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(SET, { playing: false, position: 40 }, { targets: [cueTarget] });
    const producer = await rig.connectProducer();
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await producer.snapshot((snapshot: ProducerSnapshot) => at(40)(snapshot) && snapshot.connections.every((row) => row.connection === 'online'));
    producer.send({ kind: 'arm', target: 'propresenter' });
    await producer.snapshot((snapshot: ProducerSnapshot) => snapshot.connections.every((row) => row.arm === 'armed'));
    await leader.snapshot(at(40));

    leader.send(countIn(BRIDGE));
    for (const client of [leader, viewer]) await client.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && snapshot.countIn);
    await liveHasJumps(1);
    await play(5, 5, leader, viewer);
    await liveHasJumps(2);
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE]);

    // The server clock does not move, so the lost stop keeps waiting.
    rig.live.loseNext(STOP);
    leader.send({ kind: 'stop' });
    await vi.waitFor(() => expect(rig?.live.lost.map((message) => message.address)).toContain(STOP));

    leader.send(tap(1, VERSE));
    for (const client of [leader, viewer]) await client.snapshot(target(VERSE));
    await liveHasJumps(3);
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE, VERSE_CUE]);

    // Across the Count Off's end at beat 8, two beats on into the Verse.
    rig.live.advance(5 * BEAT_MS);
    for (const client of [leader, viewer]) {
      const landed = await client.snapshot(at(26));
      expect(landed.now?.section).toBe(VERSE);
      expect(landed).toMatchObject({ countIn: false, jump: null });
    }
    expect(cueTarget.cues.map((cue) => ({ section: cue.section, cause: cue.cause }))).toEqual([{ section: VERSE, cause: 'count-in' }]);
  });
});

describe('a tap in another song during the count', () => {
  const song2Verse = (snapshot: Snapshot) => snapshot.jump?.song === 2 && snapshot.jump.section === 1;

  it('before the jump to the target was sent cancels the count-in, and Live jumps there on the next bar line', async () => {
    const { viewer, producer, leader } = await counting();

    leader.send(tap(2, 1));

    for (const client of [leader, producer, viewer]) {
      const tapped = await client.snapshot(song2Verse);
      expect(tapped.countIn).toBe(false);
    }
    await liveHasJumps(2);
    // Across the bar line at 4 by a beat, onto song 2's Verse at 72.
    rig?.live.advance(3 * BEAT_MS);
    for (const client of [leader, producer, viewer]) {
      const landed = await client.snapshot(at(73));
      expect(landed.now).toMatchObject({ song: 2, section: 1 });
      expect(landed.jump).toBeNull();
      expect(landed.countIn).toBe(false);
    }
    expect(jumps()).toEqual([COUNT_OFF_CUE, SONG_2_VERSE_CUE]);
  });

  it('after the jump to the target was sent cancels the count-in, and replaces the jump Live holds', async () => {
    const { viewer, producer, leader } = await sentAndAt(5);

    leader.send(tap(2, 1));

    for (const client of [leader, producer, viewer]) {
      const tapped = await client.snapshot(song2Verse);
      expect(tapped.countIn).toBe(false);
    }
    await liveHasJumps(3);
    // Across the bar line at 8 by a beat, onto song 2's Verse at 72.
    rig?.live.advance(4 * BEAT_MS);
    for (const client of [leader, producer, viewer]) {
      const landed = await client.snapshot(at(73));
      expect(landed.now).toMatchObject({ song: 2, section: 1 });
      expect(landed.jump).toBeNull();
      expect(landed.countIn).toBe(false);
    }
    expect(jumps()).toEqual([COUNT_OFF_CUE, BRIDGE_CUE, SONG_2_VERSE_CUE]);
  });
});
