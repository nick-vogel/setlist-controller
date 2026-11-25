import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Two songs in 4/4, listed out of time order as Live may report them, with two bars between them.
// A jump names a cue point by its place in this list, so the Chorus is cue 0 though it is song 1's
// third section, and song 1's End is cue 3.
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
const BRIDGE = 3;
const CUES = { songOneIntro: 1, verse: 4, chorus: 0, bridge: 5, songOneEnd: 3, songTwoIntro: 2 };
// The jump to song 1's End, as the snapshot shows it while it waits.
const SONG_ONE_END = { song: 1, section: 'end' };

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const JUMP = '/live/song/cue_point/jump';
const LOOP = '/live/song/set/loop';
const STOP = '/live/song/stop_playing';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const waitingFor = (section: number | 'end') => (snapshot: Snapshot) => snapshot.jump?.section === section;
const looping = (section: number) => (snapshot: Snapshot) => snapshot.loop?.section?.section === section;

const jumpTo = (cue: number) => ({ address: JUMP, args: [cue], types: 'i' });
const loopTo = (on: 0 | 1) => ({ address: LOOP, args: [on], types: 'i' });

function jumpsReceived() {
  return rig?.received(JUMP) ?? [];
}

// The snapshot can reach a client before the OSC reaches the fake Live, so a test that moves the
// clock first waits for Live to hold every jump sent so far.
async function liveHasJumps(count: number) {
  await vi.waitFor(() => expect(jumpsReceived()).toHaveLength(count));
}

// The loop and jump messages the fake Live has received, in order.
function loopsAndJumps() {
  return (rig?.live.received ?? []).filter((message) => message.address === LOOP || message.address === JUMP);
}

describe('next', () => {
  it('jumps to the next section on the downbeat, and shows the waiting jump', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send({ kind: 'next' });

    await vi.waitFor(() => expect(jumpsReceived()).toEqual([jumpTo(CUES.chorus)]));
    expect((await viewer.snapshot(waitingFor(CHORUS))).jump).toEqual({ song: 1, section: CHORUS });

    // Across the bar line at 24 by one beat, into the Chorus at 32.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(33));
    expect(after.now?.section).toBe(CHORUS);
    expect(after.jump).toBeNull();
  });

  it("jumps to the song's End on its last section, never to the next song, and shows the jump to End waiting until it lands", async () => {
    rig = await startRig(SET, { playing: true, position: 53 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(53));

    leader.send({ kind: 'next' });

    await liveHasJumps(1);
    expect(jumpsReceived()).toEqual([jumpTo(CUES.songOneEnd)]);
    expect((await leader.snapshot(waitingFor('end'))).jump).toEqual(SONG_ONE_END);
    expect((await viewer.snapshot(waitingFor('end'))).jump).toEqual(SONG_ONE_END);

    // Across the bar line at 56 by one beat, to End at 64.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(65));
    expect(after.now).toBeNull();
    expect(after.jump).toBeNull();
    expect((await leader.snapshot(at(65))).jump).toBeNull();
  });

  it('replaces a waiting jump with the jump to End', async () => {
    rig = await startRig(SET, { playing: true, position: 53 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(53));
    leader.send({ kind: 'jump', song: 1, section: VERSE });
    await viewer.snapshot(waitingFor(VERSE));

    leader.send({ kind: 'next' });

    await liveHasJumps(2);
    await vi.waitFor(() => expect(viewer.received.at(-1)?.jump).toEqual(SONG_ONE_END));
  });

  it('shows the jump to End from the last bar until playback lands on End', async () => {
    rig = await startRig(SET, { playing: true, position: 61 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    // On Continue, so no stop at End ends the run before the mark clears.
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    await viewer.snapshot((snapshot) => at(61)(snapshot) && snapshot.endToggles[1] === 'continue');

    leader.send({ kind: 'next' });
    await liveHasJumps(1);
    expect((await viewer.snapshot(waitingFor('end'))).jump).toEqual(SONG_ONE_END);

    // Beat by beat to End at 64, which is the bar line.
    rig.live.advance(BEAT_MS);
    expect((await viewer.snapshot(at(62))).jump).toEqual(SONG_ONE_END);
    rig.live.advance(BEAT_MS);
    expect((await viewer.snapshot(at(63))).jump).toEqual(SONG_ONE_END);
    rig.live.advance(BEAT_MS);
    const after = await viewer.snapshot(at(64));
    expect(after.jump).toBeNull();
    expect(after.playing).toBe(true);
  });

  it("shows the jump to End while stopped, until the report of Live's jump puts the playhead on End", async () => {
    rig = await startRig(SET, { playing: false, position: 53 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(53));

    leader.send({ kind: 'next' });

    expect((await leader.snapshot(waitingFor('end'))).jump).toEqual(SONG_ONE_END);
    expect((await viewer.snapshot(waitingFor('end'))).jump).toEqual(SONG_ONE_END);
    await vi.waitFor(() => expect(jumpsReceived()).toEqual([jumpTo(CUES.songOneEnd)]));
    const after = await viewer.snapshot(at(64));
    expect(after.jump).toBeNull();
    expect(after.playing).toBe(false);
    expect((await leader.snapshot(at(64))).jump).toBeNull();
    // A stop would reach Live before this jump, so once Live has the jump, a stop would be there too.
    leader.send({ kind: 'jump', song: 1, section: VERSE });
    await liveHasJumps(2);
    expect(rig.received(STOP)).toEqual([]);
  });

  it('stops Live at End on "Stop at end" when pressed more than a bar before End', async () => {
    rig = await startRig(SET, { playing: true, position: 53 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(53));

    leader.send({ kind: 'next' });
    await liveHasJumps(1);

    // Across the bar line at 56 by one beat, to End at 64, and on before the stop reaches Live.
    rig.live.advance(4 * BEAT_MS);
    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    await viewer.snapshot((snapshot) => at(65)(snapshot) && !snapshot.playing);
    leader.send({ kind: 'jump', song: 1, section: VERSE });
    await liveHasJumps(2);
    expect(rig.received(STOP)).toHaveLength(1);
  });

  it('stops Live once at End on "Stop at end" when pressed in the last bar before End', async () => {
    rig = await startRig(SET, { playing: true, position: 61 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(61));

    leader.send({ kind: 'next' });
    await liveHasJumps(1);

    // Beat by beat to End at 64 and on to 64.5, every report out before the stop reaches Live.
    rig.live.advance(BEAT_MS);
    rig.live.advance(BEAT_MS);
    rig.live.advance(BEAT_MS);
    rig.live.advance(BEAT_MS / 2);
    await viewer.snapshot((snapshot) => at(64.5)(snapshot) && !snapshot.playing);
    leader.send({ kind: 'jump', song: 1, section: VERSE });
    await liveHasJumps(2);
    expect(rig.received(STOP)).toHaveLength(1);
  });

  it('plays on at End when pressed more than a bar before End on a song set to Continue', async () => {
    rig = await startRig(SET, { playing: true, position: 53 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    await viewer.snapshot((snapshot) => at(53)(snapshot) && snapshot.endToggles[1] === 'continue');

    leader.send({ kind: 'next' });
    await liveHasJumps(1);

    rig.live.advance(4 * BEAT_MS);
    expect((await viewer.snapshot(at(65))).playing).toBe(true);
    leader.send({ kind: 'set-safe-mode', enabled: false });
    leader.send({ kind: 'jump', song: 1, section: VERSE });
    await liveHasJumps(2);
    expect(rig.received(STOP)).toEqual([]);
  });

  it('does nothing on the last section of a song with no End', async () => {
    rig = await startRig(
      [
        { name: '1 - Intro', time: 0 },
        { name: '1 - Verse', time: 16 },
        { name: '2 - Intro', time: 32 },
        { name: '2 - End', time: 48 },
      ],
      { playing: true, position: 21 },
    );
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send({ kind: 'next' });
    // The jump comes after next, so once Live has it, a jump from next would be there too.
    leader.send({ kind: 'jump', song: 1, section: 0 });
    await liveHasJumps(1);

    expect(jumpsReceived()).toEqual([jumpTo(0)]);
  });

  it('turns the loop off before it jumps, and the playhead lands in the next section', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    leader.send({ kind: 'loop' });
    await viewer.snapshot(looping(VERSE));
    await leader.snapshot(looping(VERSE));

    leader.send({ kind: 'next' });

    await vi.waitFor(() => expect(loopsAndJumps()).toEqual([loopTo(1), loopTo(0), jumpTo(CUES.chorus)]));
    await viewer.snapshot(waitingFor(CHORUS));

    // Across the bar line at 24 by one beat, into the Chorus at 32, with no wrap at the Verse's end.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(33));
    expect(after.now?.section).toBe(CHORUS);
    expect(after.jump).toBeNull();
    expect(after.loop).toBeNull();
  });

  it('turns off a loop Live has not reported yet before it jumps', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    // Live reports the loop only on AbletonOSC's tick, so Next comes before Live's loop report.
    rig.live.holdReplies();

    leader.send({ kind: 'loop' });
    leader.send({ kind: 'next' });

    await vi.waitFor(() => expect(loopsAndJumps()).toEqual([loopTo(1), loopTo(0), jumpTo(CUES.chorus)]));
    rig.live.releaseReplies();

    // Across the bar line at 24 by one beat, into the Chorus at 32, with no wrap at the Verse's end.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(33));
    expect(after.now?.section).toBe(CHORUS);
    expect(after.jump).toBeNull();
    expect(after.loop).toBeNull();
  });
});

describe('previous', () => {
  it('jumps to the previous section', async () => {
    rig = await startRig(SET, { playing: true, position: 37 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(37));

    leader.send({ kind: 'previous' });

    await vi.waitFor(() => expect(jumpsReceived()).toEqual([jumpTo(CUES.verse)]));
    expect((await viewer.snapshot(waitingFor(VERSE))).jump).toEqual({ song: 1, section: VERSE });
  });

  it("restarts the first section on the downbeat, and never goes back into the song before", async () => {
    rig = await startRig(SET, { playing: true, position: 77 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(77));

    leader.send({ kind: 'previous' });

    await vi.waitFor(() => expect(jumpsReceived()).toEqual([jumpTo(CUES.songTwoIntro)]));
    expect((await viewer.snapshot(waitingFor(INTRO))).jump).toEqual({ song: 2, section: INTRO });

    // Across the bar line at 80 by one beat, back to song 2's Intro at 72.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(73));
    expect(after.now).toMatchObject({ song: 2, section: INTRO });
    expect(after.jump).toBeNull();
  });

  it("restarts the first section at once while stopped", async () => {
    rig = await startRig(SET, { playing: false, position: 5 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(5));

    leader.send({ kind: 'previous' });

    await vi.waitFor(() => expect(jumpsReceived()).toEqual([jumpTo(CUES.songOneIntro)]));
    const after = await viewer.snapshot(at(0));
    expect(after.now).toMatchObject({ song: 1, section: INTRO });
    expect(after.jump).toBeNull();
  });

  it('keeps the loop when it restarts the looped first section', async () => {
    rig = await startRig(SET, { playing: true, position: 5, loop: { on: true, start: 0, length: 16 } });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(5)(snapshot) && looping(INTRO)(snapshot));

    leader.send({ kind: 'previous' });

    await liveHasJumps(1);
    expect(loopsAndJumps()).toEqual([jumpTo(CUES.songOneIntro)]);
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(1));
    expect(after.loop?.section).toEqual({ song: 1, section: INTRO });
  });

  it('keeps a loop Live has not reported yet when it restarts the looped first section', async () => {
    rig = await startRig(SET, { playing: true, position: 5 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(5));
    // Live reports the loop only on AbletonOSC's tick, so Previous comes before Live's loop report.
    rig.live.holdReplies();

    leader.send({ kind: 'loop' });
    leader.send({ kind: 'previous' });

    await vi.waitFor(() => expect(loopsAndJumps()).toEqual([loopTo(1), jumpTo(CUES.songOneIntro)]));
    rig.live.releaseReplies();
    await viewer.snapshot(looping(INTRO));
    // Across the bar line at 8 by one beat, back to the Intro's start.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(1));
    expect(after.loop?.section).toEqual({ song: 1, section: INTRO });
    expect(loopsAndJumps()).toEqual([loopTo(1), jumpTo(CUES.songOneIntro)]);
  });

  it('turns off a loop Live has not reported yet before it jumps back', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    // Live reports the loop only on AbletonOSC's tick, so Previous comes before Live's loop report.
    rig.live.holdReplies();

    leader.send({ kind: 'loop' });
    leader.send({ kind: 'previous' });

    await vi.waitFor(() => expect(loopsAndJumps()).toEqual([loopTo(1), loopTo(0), jumpTo(CUES.songOneIntro)]));
    rig.live.releaseReplies();

    // Across the bar line at 24 by one beat, back to the Intro at 0.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(1));
    expect(after.now?.section).toBe(INTRO);
    expect(after.jump).toBeNull();
    expect(after.loop).toBeNull();
  });
});

describe('a jump during a loop', () => {
  it('turns the loop off before a jump to another section', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    leader.send({ kind: 'loop' });
    await viewer.snapshot(looping(VERSE));
    await leader.snapshot(looping(VERSE));

    leader.send({ kind: 'jump', song: 1, section: BRIDGE });

    await vi.waitFor(() => expect(loopsAndJumps()).toEqual([loopTo(1), loopTo(0), jumpTo(CUES.bridge)]));
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(49));
    expect(after.now?.section).toBe(BRIDGE);
    expect(after.loop).toBeNull();
  });

  it('keeps a loop Live has not reported yet on a tap that restarts the looped section', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    // Live reports the loop only on AbletonOSC's tick, so the tap comes before Live's loop report.
    rig.live.holdReplies();

    leader.send({ kind: 'loop' });
    leader.send({ kind: 'jump', song: 1, section: VERSE });

    await vi.waitFor(() => expect(loopsAndJumps()).toEqual([loopTo(1), jumpTo(CUES.verse)]));
    rig.live.releaseReplies();
    await viewer.snapshot(looping(VERSE));
    // Across the bar line at 24 by one beat, back to the Verse's start.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(17));
    expect(after.loop?.section).toEqual({ song: 1, section: VERSE });
    expect(loopsAndJumps()).toEqual([loopTo(1), jumpTo(CUES.verse)]);
  });

  it('turns off a loop Live has not reported yet before a tap on another section', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    // Live reports the loop only on AbletonOSC's tick, so the tap comes before Live's loop report.
    rig.live.holdReplies();

    leader.send({ kind: 'loop' });
    leader.send({ kind: 'jump', song: 1, section: BRIDGE });

    await vi.waitFor(() => expect(loopsAndJumps()).toEqual([loopTo(1), loopTo(0), jumpTo(CUES.bridge)]));
    rig.live.releaseReplies();

    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(49));
    expect(after.now?.section).toBe(BRIDGE);
    expect(after.loop).toBeNull();
  });
});

describe('play from start during a loop', () => {
  it('turns the loop off before it jumps to another song while stopped', async () => {
    rig = await startRig(SET, { playing: false, position: 21, loop: { on: true, start: 16, length: 16 } });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(21)(snapshot) && looping(VERSE)(snapshot));

    leader.send({ kind: 'play-from-start', song: 2 });

    await vi.waitFor(() => expect(loopsAndJumps()).toEqual([loopTo(0), jumpTo(CUES.songTwoIntro)]));
    await vi.waitFor(() => expect(leader.received.at(-1)?.loop).toBeNull());
  });
});

describe('the view-only role', () => {
  it('rejects loop, next and previous from a view-only connection, and Live receives nothing from them', async () => {
    rig = await startRig(SET, { playing: true, position: 37 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot(at(37));

    viewer.send({ kind: 'loop' });
    viewer.send({ kind: 'next' });
    viewer.send({ kind: 'previous' });
    await viewer.flush();
    // The leader's jump comes after the viewer's commands, so once Live has it, theirs would be there too.
    leader.send({ kind: 'jump', song: 1, section: INTRO });
    await liveHasJumps(1);
    await viewer.snapshot(waitingFor(INTRO));

    expect(rig.live.received.filter((message) => message.address.startsWith('/live/song/set/'))).toEqual([]);
    expect(jumpsReceived()).toEqual([jumpTo(CUES.songOneIntro)]);
    expect(viewer.received.some((snapshot) => snapshot.loop !== null)).toBe(false);
    expect(viewer.received.some((snapshot) => snapshot.jump !== null && snapshot.jump.section !== INTRO)).toBe(false);
  });
});
