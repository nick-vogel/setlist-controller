import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
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
const BRIDGE = 3;
const PAD = 4;
const COUNT_OFF_CUE = 0;
const BRIDGE_CUE = 3;

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const JUMP = '/live/song/cue_point/jump';
const START = '/live/song/start_playing';
const LOOP_START = '/live/song/set/loop_start';
const LOOP_LENGTH = '/live/song/set/loop_length';
const LOOP = '/live/song/set/loop';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const countIn = (section: number) => ({ kind: 'count-in', song: 1, section });
const bracedOnBridge = (snapshot: Snapshot) => snapshot.loop?.section?.song === 1 && snapshot.loop.section.section === BRIDGE;
const BRIDGE_LOOP = { start: 40, length: 8, section: { song: 1, section: BRIDGE } };
const LOOP_ON_BRIDGE = [
  { address: LOOP_START, args: [40] },
  { address: LOOP_LENGTH, args: [8] },
  { address: LOOP, args: [1] },
];

// The loop messages the fake Live has received, in order.
function loopMessages() {
  return (rig?.live.received ?? []).filter((message) => message.address.startsWith('/live/song/set/loop')).map(({ address, args }) => ({ address, args }));
}

// The jumps, the starts and the loop messages the fake Live has received, in order.
function loopAndTransport() {
  return (rig?.live.received ?? [])
    .filter((message) => message.address === JUMP || message.address === START || message.address.startsWith('/live/song/set/loop'))
    .map(({ address, args }) => ({ address, args }));
}

// The snapshot can reach a client before the OSC reaches the fake Live, so a test that moves the
// clock first waits for Live to hold every jump sent so far.
async function liveHasJumps(count: number) {
  await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(count));
}

// Moves Live on by that many beats, and waits for every client to see the playhead there. Returns
// the viewer's snapshot of it.
async function play(beats: number, to: number, viewer: Client, ...clients: Client[]) {
  rig?.live.advance(beats * BEAT_MS);
  for (const client of clients) await client.snapshot(at(to));
  return viewer.snapshot(at(to));
}

describe('a brace on the target', () => {
  it.each([
    { what: 'set in Live before the press', braced: true, sent: [] },
    { what: 'asked for by a Loop press just before Count in, before Live reports it', braced: false, sent: LOOP_ON_BRIDGE },
  ])('survives the count, and Live loops the section after the landing, $what', async ({ braced, sent }) => {
    rig = await startRig(SET, { playing: false, position: 40, ...(braced ? { loop: { on: true, start: 40, length: 8 } } : {}) });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    if (braced) await leader.snapshot((snapshot) => at(40)(snapshot) && bracedOnBridge(snapshot));
    else await leader.snapshot(at(40));

    if (!braced) {
      // Live acts on both presses, but reports neither until both are in.
      rig.live.holdReplies();
      leader.send({ kind: 'loop' });
    }
    leader.send(countIn(BRIDGE));
    if (!braced) {
      await leader.flush();
      rig.live.releaseReplies();
    }

    const counting = await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && bracedOnBridge(snapshot));
    expect(counting).toMatchObject({ loop: BRIDGE_LOOP, jump: { song: 1, section: BRIDGE }, countIn: true });
    await leader.snapshot((snapshot) => at(0)(snapshot) && bracedOnBridge(snapshot));
    const fromViewer = viewer.received.indexOf(counting);
    const fromLeader = leader.received.length - 1;
    await liveHasJumps(1);

    // Into the Count Off's last bar, where the jump to the Bridge goes to Live, then across the bar
    // line at 8 by two beats, onto the Bridge.
    await play(4, 4, viewer, leader);
    await liveHasJumps(2);
    const landed = await play(6, 42, viewer, leader);
    expect(landed).toMatchObject({ jump: null, countIn: false, loop: BRIDGE_LOOP });
    expect(landed.now?.section).toBe(BRIDGE);

    // Three beats at a time past the Bridge's end at 48, twice: back to 40, then to 41.
    for (const to of [45, 40, 43, 46, 41]) {
      const shown = await play(3, to, viewer, leader);
      expect(shown.now?.section).toBe(BRIDGE);
    }

    expect(loopAndTransport()).toEqual([
      ...sent,
      { address: JUMP, args: [COUNT_OFF_CUE] },
      { address: START, args: [] },
      { address: JUMP, args: [BRIDGE_CUE] },
    ]);
    for (const shown of [...viewer.received.slice(fromViewer), ...leader.received.slice(fromLeader)]) {
      expect(shown.loop).toEqual(BRIDGE_LOOP);
      expect(shown.now?.section === PAD).toBe(false);
    }
  });
});

describe('Loop during the count', () => {
  // Counting in to the Bridge from stopped on it, with no brace, and the playhead at that beat of
  // the Count Off: 2 is its first bar, before the jump to the Bridge goes to Live, and 4 its last bar,
  // after it has.
  async function countingTo(beat: number) {
    rig = await startRig(SET, { playing: false, position: 40 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(40));
    leader.send(countIn(BRIDGE));
    await viewer.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing);
    await liveHasJumps(1);
    await play(beat, beat, viewer, leader);
    await liveHasJumps(beat >= 4 ? 2 : 1);
    return { viewer, leader };
  }

  // On from the press at that beat to the landing on the Bridge at 42, two beats past the bar line
  // at 8.
  async function land(beat: number, viewer: Client, leader: Client) {
    if (beat < 4) await play(4 - beat, 4, viewer, leader);
    await liveHasJumps(2);
    return play(6, 42, viewer, leader);
  }

  it.each([
    { what: "in the Count Off's first bar, before the jump to it is sent", beat: 2 },
    { what: "in the Count Off's last bar, after the jump to it is sent", beat: 4 },
  ])('braces the target, not the Count Off, and Live loops the section after the landing, $what', async ({ beat }) => {
    const { viewer, leader } = await countingTo(beat);

    leader.send({ kind: 'loop' });

    await vi.waitFor(() => expect(loopMessages()).toEqual(LOOP_ON_BRIDGE));
    for (const client of [leader, viewer]) {
      expect(await client.snapshot(bracedOnBridge)).toMatchObject({ loop: BRIDGE_LOOP, jump: { song: 1, section: BRIDGE }, countIn: true });
    }

    const landed = await land(beat, viewer, leader);
    expect(landed).toMatchObject({ jump: null, countIn: false, loop: BRIDGE_LOOP });
    expect(landed.now?.section).toBe(BRIDGE);
    // Three beats at a time past the Bridge's end at 48: back to 40.
    for (const to of [45, 40]) expect((await play(3, to, viewer, leader)).now?.section).toBe(BRIDGE);
    expect(loopMessages()).toEqual(LOOP_ON_BRIDGE);
  });

  it('is released by a second press, the count still holds, and the playhead plays on past the Bridge', async () => {
    const { viewer, leader } = await countingTo(2);
    leader.send({ kind: 'loop' });
    await viewer.snapshot(bracedOnBridge);
    await leader.snapshot(bracedOnBridge);

    leader.send({ kind: 'loop' });

    await vi.waitFor(() => expect(loopMessages()).toEqual([...LOOP_ON_BRIDGE, { address: LOOP, args: [0] }]));
    for (const client of [leader, viewer]) {
      await vi.waitFor(() => expect(client.received.at(-1)?.loop).toBeNull());
      expect(client.received.at(-1)).toMatchObject({ jump: { song: 1, section: BRIDGE }, countIn: true });
    }

    const landed = await land(2, viewer, leader);
    expect(landed).toMatchObject({ jump: null, countIn: false, loop: null });
    expect(landed.now?.section).toBe(BRIDGE);
    // Four beats at a time across the Bridge's end at 48, into the Pad.
    await play(4, 46, viewer, leader);
    const after = await play(4, 50, viewer, leader);
    expect(after.now?.section).toBe(PAD);
    expect(after.loop).toBeNull();
  });
});

describe('a brace on another section', () => {
  // The Count Off's own brace is the one a controller that kept every brace would leave on through
  // the count, and the Verse's is the one a controller that kept only the Count Off's would still
  // turn off, so both stay.
  it.each([
    { what: 'the Verse', loop: { start: 24, length: 16 }, section: { song: 1, section: 2 } },
    { what: 'the Count Off itself', loop: { start: 0, length: 8 }, section: { song: 1, section: 0 } },
    { what: "song 2's Verse", loop: { start: 72, length: 8 }, section: { song: 2, section: 1 } },
  ])('is turned off at the press, before the jump to the Count Off, on $what', async ({ loop, section }) => {
    rig = await startRig(SET, { playing: false, position: 40, loop: { on: true, ...loop } });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(40)(snapshot) && snapshot.loop?.section?.song === section.song && snapshot.loop.section.section === section.section);

    leader.send(countIn(BRIDGE));

    await vi.waitFor(() =>
      expect(loopAndTransport()).toEqual([
        { address: LOOP, args: [0] },
        { address: JUMP, args: [COUNT_OFF_CUE] },
        { address: START, args: [] },
      ]),
    );
    for (const client of [leader, viewer]) {
      const counting = await client.snapshot((snapshot) => at(0)(snapshot) && snapshot.playing && snapshot.loop === null);
      expect(counting).toMatchObject({ jump: { song: 1, section: BRIDGE }, countIn: true });
    }

    await play(4, 4, viewer, leader);
    await liveHasJumps(2);
    const landed = await play(6, 42, viewer, leader);
    expect(landed).toMatchObject({ jump: null, countIn: false, loop: null });
    expect(landed.now?.section).toBe(BRIDGE);
    // Four beats at a time across the Bridge's end at 48, into the Pad.
    await play(4, 46, viewer, leader);
    const after = await play(4, 50, viewer, leader);
    expect(after.now?.section).toBe(PAD);
    expect(after.loop).toBeNull();
    expect(loopMessages()).toEqual([{ address: LOOP, args: [0] }]);
  });
});
