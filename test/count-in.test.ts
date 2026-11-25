import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { PROBE_INTERVAL_MS } from '../src/server/live-bridge.ts';
import { LOST_WHILE_STOPPED_MS } from '../src/server/playback-controller.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
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
const BRIDGE = 3;
const PAD = 4;
const COUNT_OFF_CUE = 0;
const BRIDGE_CUE = 3;
// Song 2's Verse, the cue a barrier jumps to.
const SONG_2_VERSE_CUE = 7;

// One song in 6/8, whose Count Off is 2 bars of 3 beats.
const SIX_EIGHT_SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 6 },
  { name: '1 - Verse', time: 18 },
  { name: '1 - Bridge', time: 30 },
  { name: '1 - End', time: 42 },
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

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const JUMP = '/live/song/cue_point/jump';
const CONTINUE = '/live/song/continue_playing';
const START = '/live/song/start_playing';
const STOP = '/live/song/stop_playing';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const countIn = (section: number) => ({ kind: 'count-in', song: 1, section });
const countingIn = (snapshot: Snapshot) => snapshot.countIn;

// The transport messages the fake Live has received, in order.
function transport() {
  const addresses = new Set([JUMP, CONTINUE, START, STOP]);
  return (rig?.live.received ?? []).filter((message) => addresses.has(message.address));
}

// The snapshot can reach a client before the OSC reaches the fake Live, so a test that moves the
// clock first waits for Live to hold every jump sent so far.
async function liveHasJumps(count: number) {
  await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(count));
}

describe('count in from stopped', () => {
  it('jumps Live to the Count Off and starts it, and shows every client the target as a count-in', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));

    leader.send(countIn(BRIDGE));

    await vi.waitFor(() =>
      expect(transport()).toEqual([
        { address: JUMP, args: [COUNT_OFF_CUE], types: 'i' },
        { address: START, args: [], types: '' },
      ]),
    );
    for (const client of [leader, producer, viewer]) {
      const shown = await client.snapshot(countingIn);
      expect(shown.jump).toEqual({ song: 1, section: BRIDGE });
      expect(shown.countIn).toBe(true);
    }
  });
});

describe('the jump to the target', () => {
  it.each([
    { meter: '4/4', set: SET, signature: { numerator: 4, denominator: 4 }, bar: 4, bridge: 40, bridgeBars: 2 },
    { meter: '6/8', set: SIX_EIGHT_SET, signature: { numerator: 6, denominator: 8 }, bar: 3, bridge: 30, bridgeBars: 4 },
  ])("is sent in the Count Off's last bar and lands where the Count Off ends, in $meter", async ({ set, signature, bar, bridge, bridgeBars }) => {
    rig = await startRig(set, { playing: false, position: bridge, signature });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    // The Bridge's bar count shows the server has Live's signature.
    await leader.snapshot((snapshot) => at(bridge)(snapshot) && snapshot.now?.bars === bridgeBars);

    leader.send(countIn(BRIDGE));
    await leader.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing);
    await liveHasJumps(1);

    // Half a beat before the Count Off's last bar, no jump to the target goes to Live. In 6/8 that is
    // inside the last 4 beats, so a bar counted in 4/4 would send it.
    rig.live.advance((bar - 0.5) * BEAT_MS);
    await leader.snapshot(at(bar - 0.5));
    // The probe goes to Live after anything the server sent on that report.
    await rig.advanceConnected(PROBE_INTERVAL_MS);
    expect(rig.received(JUMP)).toHaveLength(1);

    // On the Count Off's last bar line it does, and the playhead plays on through the Count Off.
    rig.live.advance(0.5 * BEAT_MS);
    await leader.snapshot(at(bar));
    await liveHasJumps(2);
    expect(rig.received(JUMP).at(-1)?.args).toEqual([BRIDGE_CUE]);
    rig.live.advance((bar - 1) * BEAT_MS);
    const counting = await viewer.snapshot(at(2 * bar - 1));
    expect(counting.now?.section).toBe(COUNT_OFF);
    expect(counting.jump).toEqual({ song: 1, section: BRIDGE });
    expect(counting.countIn).toBe(true);

    // Across the bar line where the Count Off ends by a beat, into the Bridge, and on from there.
    rig.live.advance(2 * BEAT_MS);
    for (const client of [leader, viewer]) {
      const landed = await client.snapshot(at(bridge + 1));
      expect(landed.now?.section).toBe(BRIDGE);
      expect(landed.jump).toBeNull();
      expect(landed.countIn).toBe(false);
    }
    rig.live.advance(BEAT_MS);
    expect((await viewer.snapshot(at(bridge + 2))).now?.section).toBe(BRIDGE);
    expect(rig.received(JUMP)).toHaveLength(2);
  });

  // The #101 spec: a jump sent too late lands on the following bar line, as a late tap does.
  it("is sent on the first report past the Count Off when none came in its last bar, and lands on the next bar line", async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));

    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && snapshot.countIn);
    await liveHasJumps(1);

    // Half a beat before the Count Off's last bar, then no report across the whole of that bar: the
    // next one is half a beat into the Intro.
    rig.live.advance(3.5 * BEAT_MS);
    await viewer.snapshot(at(3.5));
    rig.live.advance(5 * BEAT_MS);
    const late = await viewer.snapshot(at(8.5));
    await rig.advanceConnected(PROBE_INTERVAL_MS);

    expect(late).toMatchObject({ countIn: true, jump: { song: 1, section: BRIDGE } });
    expect(rig.received(JUMP).map((message) => message.args)).toEqual([[COUNT_OFF_CUE], [BRIDGE_CUE]]);

    // Live makes it on the bar line at beat 12, and plays on in the Bridge.
    rig.live.advance(4 * BEAT_MS);
    const landed = await viewer.snapshot(at(40.5));
    expect(landed.now?.section).toBe(BRIDGE);
    expect(landed).toMatchObject({ countIn: false, jump: null });
  });

  // The late send above holds for one bar past the Count Off, and no more. A report an eighth of a
  // beat short of that bar's end still holds the count-in, and sends its jump.
  it('holds a count-in, and sends its jump, on a first report just short of the bar after the Count Off', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));

    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && snapshot.countIn);
    await liveHasJumps(1);
    rig.live.advance(3.5 * BEAT_MS);
    await viewer.snapshot(at(3.5));
    rig.live.advance(8.375 * BEAT_MS);
    const short = await viewer.snapshot(at(11.875));
    await liveHasJumps(2);

    expect(short).toMatchObject({ countIn: true, jump: { song: 1, section: BRIDGE } });
    expect(rig.received(JUMP).map((message) => message.args)).toEqual([[COUNT_OFF_CUE], [BRIDGE_CUE]]);
  });

  // A first report an eighth of a beat past the bar after the Count Off, in the Intro, is the playhead
  // moved away, so the count-in ends with no jump.
  it('ends a count-in, with no jump to the target, on the first report past the bar after the Count Off', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));

    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && snapshot.countIn);
    await liveHasJumps(1);
    rig.live.advance(3.5 * BEAT_MS);
    await viewer.snapshot(at(3.5));
    rig.live.advance(8.625 * BEAT_MS);
    const past = await viewer.snapshot(at(12.125));
    await rig.advanceConnected(PROBE_INTERVAL_MS);

    expect(past).toMatchObject({ countIn: false, jump: null });
    expect(rig.received(JUMP).map((message) => message.args)).toEqual([[COUNT_OFF_CUE]]);
  });

  // The jump to the Count Off is lost, and no report has come yet to tell. A tap to a new target in
  // that gap sends no jump at once from the stale stopped position, which would cut the count.
  it('sends no jump to a new target tapped before the first report after a lost jump to the Count Off', async () => {
    rig = await startRig(SET, { playing: false, position: 48 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(48));

    rig.live.loseNext(JUMP);
    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => snapshot.playing && snapshot.countIn);
    await vi.waitFor(() => expect(rig?.live.lost.filter(({ address }) => address === JUMP)).toHaveLength(1));
    leader.send({ kind: 'jump', song: 1, section: 2 });
    await rig.advanceConnected(PROBE_INTERVAL_MS);

    expect(rig.received(JUMP).map((message) => message.args)).not.toContainEqual([2]);
  });

  it('is never sent once the playhead is moved into another song during the count', async () => {
    rig = await startRig(SET, { playing: false, position: 48 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(48));

    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && snapshot.countIn);
    await liveHasJumps(1);
    rig.live.advance(2 * BEAT_MS);
    await viewer.snapshot(at(2));
    rig.live.setPosition(72);
    const moved = await viewer.snapshot(at(72));
    await rig.advanceConnected(PROBE_INTERVAL_MS);

    expect(moved).toMatchObject({ countIn: false, jump: null });
    expect(rig.received(JUMP).map((message) => message.args)).toEqual([[COUNT_OFF_CUE]]);
  });

  it('is never sent once the playhead is moved to before the Count Off during the count', async () => {
    const before: CuePoint[] = [
      { name: '1 - Intro', time: 0 },
      { name: '1 - End', time: 16 },
      { name: '2 - Count Off', time: 24 },
      { name: '2 - Intro', time: 32 },
      { name: '2 - Verse', time: 40 },
      { name: '2 - End', time: 56 },
    ];
    rig = await startRig(before, { playing: false, position: 48 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(48));

    leader.send({ kind: 'count-in', song: 2, section: 2 });
    await viewer.snapshot((snapshot) => at(24)(snapshot) && snapshot.playing && snapshot.countIn);
    await liveHasJumps(1);
    rig.live.advance(2 * BEAT_MS);
    await viewer.snapshot(at(26));
    rig.live.setPosition(2);
    const moved = await viewer.snapshot(at(2));
    rig.live.advance(4 * BEAT_MS);
    const later = await viewer.snapshot(at(6));
    await rig.advanceConnected(PROBE_INTERVAL_MS);

    expect(moved).toMatchObject({ countIn: false, jump: null });
    expect(later).toMatchObject({ countIn: false, jump: null });
    expect(rig.received(JUMP)).toHaveLength(1);
  });
});

describe('a refused count-in', () => {
  // A jump to song 2's Verse reaches Live after anything the server sent it before, so once Live holds
  // that jump, it holds all Live will get of the press before it. The barrier itself is the only
  // transport message Live may hold, and no client may ever have seen a count-in.
  async function sentNothingBefore(leader: Client, ...clients: Client[]) {
    leader.send({ kind: 'set-safe-mode', enabled: false });
    leader.send({ kind: 'jump', song: 2, section: 1 });
    await vi.waitFor(() => expect(rig?.received(JUMP).length).toBeGreaterThan(0));
    expect(transport()).toEqual([{ address: JUMP, args: [SONG_2_VERSE_CUE], types: 'i' }]);
    for (const client of [leader, ...clients]) {
      await client.snapshot((snapshot) => snapshot.jump?.song === 2 || snapshot.now?.song === 2);
      expect(client.received.some((snapshot) => snapshot.countIn || snapshot.jump?.song === 1)).toBe(false);
    }
  }

  it('is refused while Live plays', async () => {
    rig = await startRig(SET, { playing: true, position: 40 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));

    leader.send(countIn(BRIDGE));

    await sentNothingBefore(leader);
  });

  it.each([
    { what: 'End', command: { kind: 'count-in', song: 1, section: 'end' } },
    { what: 'an index past the last section', command: { kind: 'count-in', song: 1, section: 5 } },
    { what: 'a Pad', command: { kind: 'count-in', song: 1, section: PAD } },
    { what: 'a song with no Count Off', command: { kind: 'count-in', song: 2, section: 1 } },
    { what: 'a song not in the set', command: { kind: 'count-in', song: 9, section: 2 } },
  ])('is refused on $what', async ({ command }) => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));

    leader.send(command);

    await sentNothingBefore(leader, viewer);
  });

  it('is refused from a viewer socket', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));

    viewer.send(countIn(BRIDGE));
    await viewer.flush();

    await sentNothingBefore(leader, viewer);
  });

  it('is refused while Live is not connected, so none is held when it comes back', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    await rig.stopLive();
    rig.clock.advance(4000);
    await leader.snapshot((snapshot) => snapshot.live === 'not-connected');
    const lost = leader.received.length;

    leader.send(countIn(BRIDGE));
    await leader.flush();
    await rig.startLive();
    rig.clock.advance(1000);
    await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= lost && at(40)(snapshot));

    await sentNothingBefore(leader);
  });
});

describe('a count-in to the top of the song', () => {
  // What Live receives of a press from stopped on the Bridge, the transport and the loop, and every
  // snapshot after it, on a rig of its own.
  async function pressed(command: unknown) {
    rig = await startRig(SET, { playing: false, position: 40, loop: { on: true, start: 40, length: 8 } });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(40)(snapshot) && snapshot.loop !== null);
    const before = viewer.received.length;

    leader.send(command);
    await viewer.snapshot((snapshot) => snapshot.playing && snapshot.position === 0);
    // The barrier of a refused count-in: Live holds every message the press sent before it.
    leader.send({ kind: 'set-safe-mode', enabled: false });
    leader.send({ kind: 'jump', song: 2, section: 1 });
    await vi.waitFor(() => expect(rig?.received(JUMP).at(-1)?.args).toEqual([SONG_2_VERSE_CUE]));
    const messages = (rig.live.received ?? [])
      .filter((message) => message.address === JUMP || message.address === START || message.address === CONTINUE || message.address.startsWith('/live/song/set/loop'))
      .map(({ address, args }) => ({ address, args }));
    const snapshots = viewer.received.slice(before);
    await rig.close();
    rig = undefined;
    return { messages, snapshots };
  }

  it.each([
    { what: 'the Count Off', section: COUNT_OFF },
    { what: 'the Intro', section: INTRO },
  ])('on $what sends Live what Play from start sends, and holds no count-in', async ({ section }) => {
    const playFromStart = await pressed({ kind: 'play-from-start', song: 1 });
    const counted = await pressed(countIn(section));

    expect(counted.messages).toEqual(playFromStart.messages);
    // Play from start's own: the loop off, the jump to the first locator, the start, and the barrier.
    expect(counted.messages.filter((message) => message.address === JUMP || message.address === START)).toEqual([
      { address: JUMP, args: [COUNT_OFF_CUE] },
      { address: START, args: [] },
      { address: JUMP, args: [SONG_2_VERSE_CUE] },
    ]);
    expect(counted.snapshots.some((snapshot) => snapshot.countIn || snapshot.jump?.song === 1)).toBe(false);
  });
});

describe('the lost-jump timer', () => {
  it('never clears a count-in, before Live reports the start or while it plays', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    // Live acts on the press, but its reports wait, as AbletonOSC's tick makes them.
    rig.live.holdReplies();

    leader.send(countIn(BRIDGE));
    await viewer.snapshot(countingIn);
    const held = viewer.received.length - 1;
    await rig.advanceConnected(LOST_WHILE_STOPPED_MS + 500);
    await leader.flush();
    expect(viewer.received.slice(held).every((snapshot) => snapshot.countIn && snapshot.jump?.section === BRIDGE)).toBe(true);

    rig.live.releaseReplies();
    await viewer.snapshot((snapshot) => snapshot.playing && snapshot.position === 0);
    await rig.advanceConnected(2 * LOST_WHILE_STOPPED_MS);
    await leader.flush();
    const after = viewer.received.slice(held);
    expect(after.every((snapshot) => snapshot.countIn && snapshot.jump?.section === BRIDGE)).toBe(true);
    expect(after.at(-1)).toMatchObject({ playing: true, countIn: true, jump: { song: 1, section: BRIDGE } });
  });

  it('ends a count-in whose start never reached Live once its Count Off would have played', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    rig.live.loseNext(START);

    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => snapshot.countIn && snapshot.position === 0);
    await rig.advanceConnected(8 * BEAT_MS + 1000);
    await leader.flush();

    expect(viewer.received.at(-1)).toMatchObject({ playing: false, countIn: false, jump: null });
  });

  // A stopped Live reports nothing for a Stop, so the count-in ends once the stop's report would
  // have come, not when its Count Off would have played.
  it('ends a count-in whose start never reached Live a second after the leader presses Stop', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    rig.live.loseNext(START);

    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => snapshot.countIn && snapshot.position === 0);
    leader.send({ kind: 'stop' });
    // The server's clock moves only once the press has reached it.
    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    await rig.advanceConnected(1500);
    await leader.flush();

    expect(viewer.received.at(-1)).toMatchObject({ playing: false, countIn: false, jump: null });
  });

  it('plays on as an ordinary start when Live reports the start only after its Count Off would have played', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    rig.live.holdReplies();

    leader.send(countIn(BRIDGE));
    await viewer.snapshot(countingIn);
    await rig.advanceConnected(8 * BEAT_MS + 1000);
    await leader.flush();
    expect(viewer.received.at(-1)).toMatchObject({ countIn: false, jump: null });

    rig.live.releaseReplies();
    await viewer.snapshot((snapshot) => snapshot.playing);
    await leader.flush();
    expect(viewer.received.at(-1)).toMatchObject({ playing: true, countIn: false, jump: null });
    expect(rig.received(JUMP).map((message) => message.args)).toEqual([[COUNT_OFF_CUE]]);
  });
});

describe('the auto-stop', () => {
  it.each([
    { what: 'a song of its own', set: SET, song: 1, countOff: 0 },
    { what: "a Count Off on the previous song's End, set to stop", set: OVERLAP_SET, song: 2, countOff: 16 },
  ])('does not fire during the count, and fires at End after the landing, for $what', async ({ set, song, countOff }) => {
    rig = await startRig(set, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    // Song 1 stops at its End, on the overlap too, where it would start on Continue.
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'stop' });
    await leader.snapshot((snapshot) => snapshot.endToggles[1] === 'stop' && snapshot.endToggles[song] === 'stop');

    leader.send({ kind: 'count-in', song, section: 3 });
    await viewer.snapshot((snapshot) => at(countOff)(snapshot) && snapshot.playing);

    // Two beats at a time, less than a bar, as playback reports it: through the Count Off, which a stop
    // would halt, onto the Bridge at 40 by the jump on the Count Off's end, and on to End at 56.
    const through = [countOff + 2, countOff + 4, countOff + 6, 40, 42, 44, 46, 48, 50, 52, 54];
    for (const beats of through) {
      rig.live.advance(2 * BEAT_MS);
      await viewer.snapshot((snapshot) => at(beats)(snapshot) && snapshot.playing);
    }
    expect(rig.received(STOP)).toEqual([]);
    rig.live.advance(2 * BEAT_MS);
    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    await viewer.snapshot((snapshot) => at(56)(snapshot) && !snapshot.playing);
  });
});

describe('a count-in that ends before it lands', () => {
  async function counting() {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && snapshot.countIn);
    rig.live.advance(2 * BEAT_MS);
    await viewer.snapshot(at(2));
    return { rig, viewer, leader };
  }

  it('ends when Live is lost', async () => {
    const { rig, viewer } = await counting();

    await rig.stopLive();
    rig.clock.advance(4000);

    const lost = await viewer.snapshot((snapshot) => snapshot.live === 'not-connected');
    expect(lost.jump).toBeNull();
    expect(lost.countIn).toBe(false);
  });

  it('ends when Live is stopped at the laptop, before its jump is sent', async () => {
    const { rig, viewer } = await counting();

    const before = viewer.received.length;
    rig.live.setPlaying(false);

    const stopped = await viewer.snapshot((snapshot) => viewer.received.indexOf(snapshot) >= before && !snapshot.playing);
    expect(stopped.jump).toBeNull();
    expect(stopped.countIn).toBe(false);
  });

  it('ends when Live is stopped at the laptop after its jump is sent', async () => {
    const { rig, viewer } = await counting();
    rig.live.advance(2 * BEAT_MS);
    await viewer.snapshot(at(4));
    await liveHasJumps(2);

    const before = viewer.received.length;
    rig.live.setPlaying(false);

    const stopped = await viewer.snapshot((snapshot) => viewer.received.indexOf(snapshot) >= before && !snapshot.playing);
    expect(stopped.jump).toBeNull();
    expect(stopped.countIn).toBe(false);
  });

});

// AbletonOSC takes the jump to the Count Off over UDP, so it can be lost while start_playing still
// reaches Live, which then plays on from where it was stopped. A report outside the Count Off while
// Live plays, before any report in the Count Off, is proof of that, and ends the count-in, so the mark
// comes down and the stop at End still fires.
describe('a count-in whose jump to the Count Off is lost', () => {
  it.each([
    { what: 'stopped before the target, on the Verse', from: 24 },
    { what: 'stopped on the target, the Bridge', from: 40 },
    { what: 'stopped after the target, on the Pad', from: 48 },
  ])('ends on the first report outside the Count Off, and Live stops at End, $what', async ({ from }) => {
    rig = await startRig(SET, { playing: false, position: from });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(from));
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'stop' });
    await leader.snapshot((snapshot) => snapshot.endToggles[1] === 'stop');

    rig.live.loseNext(JUMP);
    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => snapshot.playing && snapshot.countIn);
    await vi.waitFor(() => expect(rig?.live.lost.filter(({ address }) => address === JUMP)).toHaveLength(1));

    rig.live.advance(2 * BEAT_MS);
    const ended = await viewer.snapshot(at(from + 2));
    expect(ended.jump).toBeNull();
    expect(ended.countIn).toBe(false);

    // Two beats at a time, less than a bar, as playback reports it, on to song 1's End at 56. Plain
    // playback into the Bridge is no landing, so nothing waits and no page reads a count-in.
    for (let beats = from + 4; beats < 56; beats += 2) {
      rig.live.advance(2 * BEAT_MS);
      const shown = await viewer.snapshot(at(beats));
      expect(shown.jump).toBeNull();
      expect(shown.countIn).toBe(false);
    }
    expect(rig.received(STOP)).toEqual([]);
    rig.live.advance(2 * BEAT_MS);
    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    await viewer.snapshot((snapshot) => at(56)(snapshot) && !snapshot.playing);
  });
});

// A tap while stopped moves Live at once, and the report of the move can still be on its way when
// Count in is pressed. That report reaches the server while it still has Live stopped, so it is no
// proof the jump to the Count Off was lost: Live is counting.
describe('a count-in pressed while the report of a tap is still on its way', () => {
  it.each([
    { what: "song 1's Verse", tap: { song: 1, section: 2 }, cue: 2 },
    { what: "song 2's Intro", tap: { song: 2, section: 0 }, cue: 6 },
  ])('holds, and Live lands on the target where the Count Off ends, after a tap on $what', async ({ tap, cue }) => {
    rig = await startRig(SET, { playing: false, position: 48 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(48));
    // Live acts on everything at once, but its reports wait, as AbletonOSC's tick makes them.
    rig.live.holdReplies();

    leader.send({ kind: 'jump', ...tap });
    await vi.waitFor(() => expect(rig?.received(JUMP).map((message) => message.args)).toEqual([[cue]]));
    leader.send(countIn(BRIDGE));
    await viewer.snapshot(countingIn);
    await vi.waitFor(() => expect(rig?.received(JUMP).map((message) => message.args)).toEqual([[cue], [COUNT_OFF_CUE]]));

    // The tap's report arrives first, then the Count Off's and the start's.
    rig.live.releaseReplies();
    const counting = await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing);
    expect(counting).toMatchObject({ countIn: true, jump: { song: 1, section: BRIDGE } });

    rig.live.advance(4 * BEAT_MS);
    await viewer.snapshot(at(4));
    await rig.advanceConnected(PROBE_INTERVAL_MS);
    expect(rig.received(JUMP).at(-1)?.args).toEqual([BRIDGE_CUE]);
    rig.live.advance(5 * BEAT_MS);
    const landed = await viewer.snapshot(at(41));
    expect(landed.now?.section).toBe(BRIDGE);
    expect(landed).toMatchObject({ countIn: false, jump: null });
  });

  // Live stopped on the Bridge. Tap the Verse, tap the Bridge again, and press Count in to the Bridge,
  // all within one report round trip. The replies arrive 24, 40, 0, and the stale one of the tap back
  // to the Bridge moves the playhead forward into the count-in's own target.
  it('holds a count-in whose target is the section a stale tap report moves the playhead forward into', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    rig.live.holdReplies();

    leader.send({ kind: 'jump', song: 1, section: 2 });
    await vi.waitFor(() => expect(rig?.received(JUMP).map((message) => message.args)).toEqual([[2]]));
    leader.send({ kind: 'jump', song: 1, section: BRIDGE });
    await vi.waitFor(() => expect(rig?.received(JUMP).map((message) => message.args)).toEqual([[2], [BRIDGE_CUE]]));
    leader.send(countIn(BRIDGE));
    await vi.waitFor(() =>
      expect(rig?.received(JUMP).map((message) => message.args)).toEqual([[2], [BRIDGE_CUE], [COUNT_OFF_CUE]]),
    );

    rig.live.releaseReplies();
    const counting = await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing);
    expect(counting).toMatchObject({ countIn: true, jump: { song: 1, section: BRIDGE } });
  });

  // The backward form. Live stopped on the Bridge. Tap the Pad, tap the Bridge again, and press Count
  // in to the Bridge. The replies arrive 48, 40, 0.
  it('holds a count-in whose target a stale tap report moves the playhead back into from later', async () => {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    rig.live.holdReplies();

    leader.send({ kind: 'jump', song: 1, section: PAD });
    await vi.waitFor(() => expect(rig?.received(JUMP).map((message) => message.args)).toEqual([[4]]));
    leader.send({ kind: 'jump', song: 1, section: BRIDGE });
    await vi.waitFor(() => expect(rig?.received(JUMP).map((message) => message.args)).toEqual([[4], [BRIDGE_CUE]]));
    leader.send(countIn(BRIDGE));
    await vi.waitFor(() =>
      expect(rig?.received(JUMP).map((message) => message.args)).toEqual([[4], [BRIDGE_CUE], [COUNT_OFF_CUE]]),
    );

    rig.live.releaseReplies();
    const counting = await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing);
    expect(counting).toMatchObject({ countIn: true, jump: { song: 1, section: BRIDGE } });
  });
});
