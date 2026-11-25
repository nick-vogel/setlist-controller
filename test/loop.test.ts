import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { LOOP_REPORT_MS } from '../src/server/playback-controller.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Two songs in 4/4, listed out of time order as Live may report them, with two bars between them.
const SET: CuePoint[] = [
  { name: '1 - Chorus', time: 32 },
  { name: '1 - Intro', time: 0 },
  { name: '2 - Intro', time: 72 },
  { name: '1 - End', time: 64 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Bridge', time: 48 },
  { name: '2 - End', time: 88 },
];
const INTRO = 0;
const VERSE = 1;
const CHORUS = 2;

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const LOOP_START = '/live/song/set/loop_start';
const LOOP_LENGTH = '/live/song/set/loop_length';
const LOOP = '/live/song/set/loop';
const JUMP = '/live/song/cue_point/jump';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const looping = (section: number) => (snapshot: Snapshot) => snapshot.loop?.section?.section === section;

// The loop messages the fake Live has received, in order.
function loopMessages() {
  return (rig?.live.received ?? []).filter((message) => message.address.startsWith('/live/song/set/loop'));
}

describe('loop on', () => {
  it("braces the current section in Live, shows it on every page, and the playhead wraps inside it", async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send({ kind: 'loop' });

    // The start and length are beats, as float32, and Live's loop takes an int, so 1 goes out as int32.
    await vi.waitFor(() =>
      expect(loopMessages()).toEqual([
        { address: LOOP_START, args: [16], types: 'f' },
        { address: LOOP_LENGTH, args: [16], types: 'f' },
        { address: LOOP, args: [1], types: 'i' },
      ]),
    );
    const verse = { start: 16, length: 16, section: { song: 1, section: VERSE } };
    expect((await viewer.snapshot(looping(VERSE))).loop).toEqual(verse);
    expect((await leader.snapshot(looping(VERSE))).loop).toEqual(verse);

    // From 21 across the loop's end at 32 by one beat, back to 17.
    rig.live.advance(12 * BEAT_MS);
    const after = await viewer.snapshot(at(17));
    expect(after.now?.section).toBe(VERSE);
    expect(after.loop).toEqual(verse);
  });

  it('is ignored between songs, where there is no section to brace', async () => {
    rig = await startRig(SET, { playing: true, position: 68 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(68));

    leader.send({ kind: 'loop' });
    // The jump comes after the loop, so once Live has it, any loop message would be there too.
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));

    expect(loopMessages()).toEqual([]);
  });

  it("braces the waiting jump's target, not the section the playhead is about to leave", async () => {
    rig = await startRig(SET, { playing: true, position: 20 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(20));

    leader.send({ kind: 'previous' });
    leader.send({ kind: 'loop' });

    await vi.waitFor(() => expect(loopMessages().length).toBeGreaterThanOrEqual(3));
    expect(loopMessages().slice(0, 3)).toEqual([
      { address: LOOP_START, args: [0], types: 'f' },
      { address: LOOP_LENGTH, args: [16], types: 'f' },
      { address: LOOP, args: [1], types: 'i' },
    ]);
    await viewer.snapshot(looping(INTRO));

    // Across the bar line at 24 by one beat, into the braced Intro.
    rig.live.advance(5 * BEAT_MS);
    const after = await viewer.snapshot(at(1));
    expect(after.now?.section).toBe(INTRO);
    expect(after.loop?.section).toEqual({ song: 1, section: INTRO });
  });

  it("braces nothing after Next on a song's last section, where the jump to End waits", async () => {
    rig = await startRig(SET, { playing: true, position: 53 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(53));

    leader.send({ kind: 'next' });
    leader.send({ kind: 'loop' });
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(2));

    expect(rig.received(JUMP)[0]?.args).toEqual([3]);
    expect(loopMessages()).toEqual([]);
  });
});

describe('loop off', () => {
  it('releases the loop in Live, shows it on every page, and the playhead plays on into the next section', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    leader.send({ kind: 'loop' });
    await viewer.snapshot(looping(VERSE));
    await leader.snapshot(looping(VERSE));

    leader.send({ kind: 'loop' });

    await vi.waitFor(() => expect(loopMessages().at(-1)).toEqual({ address: LOOP, args: [0], types: 'i' }));
    await vi.waitFor(() => expect(viewer.received.at(-1)?.loop).toBeNull());

    // From 21 across the old loop end at 32 by one beat, into the Chorus.
    rig.live.advance(12 * BEAT_MS);
    const after = await viewer.snapshot(at(33));
    expect(after.now?.section).toBe(CHORUS);
    expect(after.loop).toBeNull();
  });

  it('releases a loop pressed on and off again before Live reports it, and the playhead plays on', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    // Live reports the loop only on AbletonOSC's tick, so the second press comes before Live's report.
    rig.live.holdReplies();

    leader.send({ kind: 'loop' });
    leader.send({ kind: 'loop' });

    await vi.waitFor(() =>
      expect(loopMessages()).toEqual([
        { address: LOOP_START, args: [16], types: 'f' },
        { address: LOOP_LENGTH, args: [16], types: 'f' },
        { address: LOOP, args: [1], types: 'i' },
        { address: LOOP, args: [0], types: 'i' },
      ]),
    );
    rig.live.releaseReplies();
    // Live reports the loop on, then off, and the pages follow its word.
    await viewer.snapshot(looping(VERSE));
    await vi.waitFor(() => expect(viewer.received.at(-1)?.loop).toBeNull());

    // From 21 across the Verse's end at 32 by one beat, into the Chorus.
    rig.live.advance(12 * BEAT_MS);
    const after = await viewer.snapshot(at(33));
    expect(after.now?.section).toBe(CHORUS);
    expect(after.loop).toBeNull();
  });

  // AbletonOSC takes the loop over UDP, so a lost datagram is a loop Live never turns on, and no
  // report of it ever comes.
  it('braces the section again on the next press once a loop Live never turned on has had time to report', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    rig.live.loseNext(LOOP);

    leader.send({ kind: 'loop' });
    await vi.waitFor(() => expect(rig?.live.lost).toEqual([{ address: LOOP, args: [1], types: 'i' }]));
    await rig.advanceConnected(LOOP_REPORT_MS);

    leader.send({ kind: 'loop' });
    await vi.waitFor(() => expect(rig?.received(LOOP)).toHaveLength(1));
    expect(rig.received(LOOP)).toEqual([{ address: LOOP, args: [1], types: 'i' }]);
    expect((await leader.snapshot(looping(VERSE))).loop?.section).toEqual({ song: 1, section: VERSE });
  });
});

describe("Live's own loop state", () => {
  it('shows a loop already on in Live when a page connects, by the section it braces', async () => {
    rig = await startRig(SET, { playing: false, position: 40, loop: { on: true, start: 32, length: 16 } });
    const viewer = await rig.connectViewer();

    expect((await viewer.snapshot(looping(CHORUS))).loop).toEqual({ start: 32, length: 16, section: { song: 1, section: CHORUS } });
  });

  it('shows a loop braced by hand on no section as a loop with no section', async () => {
    rig = await startRig(SET, { playing: false, position: 40, loop: { on: true, start: 20, length: 8 } });
    const viewer = await rig.connectViewer();

    const braced = await viewer.snapshot((snapshot) => snapshot.loop !== null);
    expect(braced.loop).toEqual({ start: 20, length: 8, section: null });
  });

  it('shows a loop turned off at the laptop as off on every page', async () => {
    rig = await startRig(SET, { playing: false, position: 40, loop: { on: true, start: 32, length: 16 } });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(looping(CHORUS));

    rig.live.setLoop({ on: false });

    await vi.waitFor(() => expect(viewer.received.at(-1)?.loop).toBeNull());
  });

  it('knows no loop while Live is not connected', async () => {
    rig = await startRig(SET, { playing: false, position: 40, loop: { on: true, start: 32, length: 16 } });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(looping(CHORUS));

    await rig.stopLive();
    rig.clock.advance(4000);

    const lost = await viewer.snapshot((snapshot) => snapshot.live === 'not-connected');
    expect(lost.loop).toBeNull();
  });
});
