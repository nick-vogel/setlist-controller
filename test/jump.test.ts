import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { connect, loaded, startRig, type Client, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// One song in 4/4, listed out of time order as Live may report it. A jump names a cue point by its
// place in this list, so the Bridge is cue 4 though it is the song's fourth section (index 3).
const SET: CuePoint[] = [
  { name: '1 - Chorus', time: 32 },
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 64 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Bridge', time: 48 },
];
const VERSE = 1;
const CHORUS = 2;
const BRIDGE = 3;

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const jumpTo = (section: number) => ({ kind: 'jump', song: 1, section });
const waitingFor = (section: number | 'end') => (snapshot: Snapshot) => snapshot.jump?.section === section;

function jumpsReceived() {
  return rig?.received('/live/song/cue_point/jump') ?? [];
}

// The snapshot can reach a client before the OSC reaches the fake Live, so a test that moves the
// clock first waits for Live to hold every jump sent so far.
async function liveHasJumps(count: number) {
  await vi.waitFor(() => expect(jumpsReceived()).toHaveLength(count));
}

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

describe('tap to jump', () => {
  it("sends Live the target's cue point index and shows every client the waiting jump", async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send(jumpTo(BRIDGE));

    await vi.waitFor(() => expect(jumpsReceived()).toEqual([{ address: '/live/song/cue_point/jump', args: [4], types: 'i' }]));
    expect((await leader.snapshot(waitingFor(BRIDGE))).jump).toEqual({ song: 1, section: BRIDGE });
    expect((await viewer.snapshot(waitingFor(BRIDGE))).jump).toEqual({ song: 1, section: BRIDGE });
  });

  it('lands on the next bar line while playing, and then clears the waiting jump', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send(jumpTo(BRIDGE));
    await leader.snapshot(waitingFor(BRIDGE));
    await liveHasJumps(1);

    // Two beats on, at 23, the bar line at 24 is still ahead, so the jump still waits.
    rig.live.advance(2 * BEAT_MS);
    const before = await leader.snapshot(at(23));
    expect(before.now?.section).toBe(VERSE);
    expect(before.jump).toEqual({ song: 1, section: BRIDGE });

    // Two more beats cross the bar line at 24 by one beat, which carries into the Bridge at 48.
    rig.live.advance(2 * BEAT_MS);
    const after = await leader.snapshot(at(49));
    expect(after.now?.section).toBe(BRIDGE);
    expect(after.jump).toBeNull();
  });

  it('lands at once while stopped', async () => {
    rig = await startRig(SET, { playing: false, position: 21 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send(jumpTo(BRIDGE));

    const after = await leader.snapshot(at(48));
    expect(after.now?.section).toBe(BRIDGE);
    expect(after.jump).toBeNull();
  });

  it('shows no waiting jump while stopped when the target starts where the playhead already is', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(0));

    leader.send({ kind: 'previous' });
    await liveHasJumps(1);
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });

    const after = await leader.snapshot((snapshot) => snapshot.endToggles[1] === 'continue');
    expect(leader.received.some((snapshot) => snapshot.jump !== null)).toBe(false);
    expect(after.jump).toBeNull();
  });

  it('leaves the auto-stop on after a stopped jump onto the playhead, when Live then plays from the laptop', async () => {
    rig = await startRig(SET, { playing: false, position: 48 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(48));

    leader.send(jumpTo(BRIDGE));
    await liveHasJumps(1);
    rig.live.setPlaying(true);
    await leader.snapshot((snapshot) => snapshot.playing);

    // Two beats at a time, less than a bar, as playback reports it, through End at 64.
    for (let beats = 50; beats <= 64; beats += 2) {
      rig.live.advance(2 * BEAT_MS);
      await leader.snapshot(at(beats));
    }
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  it('replaces a waiting jump with a second one, and lands on the second target', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send(jumpTo(BRIDGE));
    await viewer.snapshot(waitingFor(BRIDGE));
    leader.send(jumpTo(CHORUS));

    expect((await viewer.snapshot(waitingFor(CHORUS))).jump).toEqual({ song: 1, section: CHORUS });
    await liveHasJumps(2);

    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(33));
    expect(after.now?.section).toBe(CHORUS);
    expect(after.jump).toBeNull();
  });

  // A jump to the section that starts on the bar line (the Chorus at 32 here) would prove nothing,
  // since playback alone lands there too. A later section tells the jump from playback.
  it('lands on the target, not one section further, when tapped in the last beat of a section', async () => {
    rig = await startRig(SET, { playing: true, position: 31 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(31));

    leader.send(jumpTo(BRIDGE));
    await leader.snapshot(waitingFor(BRIDGE));
    await liveHasJumps(1);
    rig.live.advance(2 * BEAT_MS);

    const after = await leader.snapshot(at(49));
    expect(after.now?.section).toBe(BRIDGE);
    expect(after.jump).toBeNull();
  });

  it('keeps waiting when playback reaches the target before the bar line, until Live jumps', async () => {
    // The Chorus starts a beat before the bar line at 32, on a pickup.
    rig = await startRig(
      [
        { name: '1 - Intro', time: 0 },
        { name: '1 - Verse', time: 16 },
        { name: '1 - Chorus', time: 31 },
        { name: '1 - End', time: 64 },
      ],
      { playing: true, position: 30 },
    );
    const leader = await rig.connectLeader();
    await leader.snapshot(at(30));

    leader.send(jumpTo(CHORUS));
    await leader.snapshot(waitingFor(CHORUS));
    await liveHasJumps(1);

    // Playback alone reaches the Chorus at 31, and on to 31.75. Live has not jumped yet.
    rig.live.advance(BEAT_MS);
    expect((await leader.snapshot(at(31))).jump).toEqual({ song: 1, section: CHORUS });
    rig.live.advance(0.75 * BEAT_MS);
    expect((await leader.snapshot(at(31.75))).jump).toEqual({ song: 1, section: CHORUS });

    // Across the bar line at 32 by a quarter beat, back to the Chorus at 31.
    rig.live.advance(0.5 * BEAT_MS);
    const after = await leader.snapshot(at(31.25));
    expect(after.now?.section).toBe(CHORUS);
    expect(after.jump).toBeNull();
  });

  it('clears a jump to the section already playing once it lands back on its start', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveHasJumps(1);

    // Still in the Verse and moving forward, so the jump has not happened yet.
    rig.live.advance(2 * BEAT_MS);
    expect((await leader.snapshot(at(23))).jump).toEqual({ song: 1, section: VERSE });

    // Across the bar line at 24 by one beat, back to the Verse at 16.
    rig.live.advance(2 * BEAT_MS);
    const after = await leader.snapshot(at(17));
    expect(after.now?.section).toBe(VERSE);
    expect(after.jump).toBeNull();
  });

  it("lands when the fake Live's loop goes back to beat 0 before the bar line", async () => {
    // The loop ends at 30, off the bar grid, so the playhead never reaches the bar line at 32.
    rig = await startRig(SET, { playing: true, position: 29, loopAt: 30 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(29));

    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveHasJumps(1);

    // Across the loop's end at 30 by one beat, into the Verse at 16.
    rig.live.advance(2 * BEAT_MS);
    const after = await leader.snapshot(at(17));
    expect(after.now?.section).toBe(VERSE);
    expect(after.jump).toBeNull();
  });
});

// A tap in the last moment before a bar line can reach Live after it, so Live waits for the next bar
// line. Holding the fake Live's replies keeps the server on the report from before the bar line while
// the fake Live plays across it, which is how the tap arrives late. Positions are float32-exact,
// since at() compares the reported position exactly.
describe('a late tap', () => {
  it('keeps the mark on a restart that reaches Live after the bar line, until the playhead moves back into the Verse', async () => {
    rig = await startRig(SET, { playing: true, position: 19.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(19.875));

    // The tap leaves an eighth of a beat before the bar line at 20 and reaches Live after it.
    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveHasJumps(1);
    rig.live.releaseReplies();

    // Playing on in the Verse past 20, so Live has not made the jump.
    expect((await leader.snapshot(at(20.125))).jump).toEqual({ song: 1, section: VERSE });
    rig.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(23.875))).jump).toEqual({ song: 1, section: VERSE });

    // Across the bar line at 24 by a quarter beat, back to the Verse at 16.
    rig.live.advance(0.25 * BEAT_MS);
    const after = await leader.snapshot(at(16.125));
    expect(after.now?.section).toBe(VERSE);
    expect(after.jump).toBeNull();
  });

  // The Verse ends on 32, the bar line after 28, so the late window must not treat it as a target
  // already over by then.
  it("keeps the mark on a restart tapped in the section's second-to-last bar that reaches Live after the bar line, until the playhead moves back into the Verse", async () => {
    rig = await startRig(SET, { playing: true, position: 27.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(27.875));

    // The tap leaves an eighth of a beat before the bar line at 28 and reaches Live after it.
    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveHasJumps(1);
    rig.live.releaseReplies();

    // Playing on in the Verse past 28, so Live has not made the jump.
    expect((await leader.snapshot(at(28.125))).jump).toEqual({ song: 1, section: VERSE });
    rig.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(31.875))).jump).toEqual({ song: 1, section: VERSE });

    // Across the bar line at 32 by a quarter beat, back to the Verse at 16.
    rig.live.advance(0.25 * BEAT_MS);
    const after = await leader.snapshot(at(16.125));
    expect(after.now?.section).toBe(VERSE);
    expect(after.jump).toBeNull();
  });

  it('keeps the mark on a jump to the next section that reaches Live after the bar line, until Live jumps back to its start', async () => {
    rig = await startRig(SET, { playing: true, position: 15.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(15.875));

    // The tap leaves an eighth of a beat before the Verse at 16 and reaches Live after it.
    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveHasJumps(1);
    rig.live.releaseReplies();

    // Playback alone carried the playhead into the Verse, and Live waits for the bar line at 20.
    const played = await leader.snapshot(at(16.125));
    expect(played.now?.section).toBe(VERSE);
    expect(played.jump).toEqual({ song: 1, section: VERSE });
    rig.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(19.875))).jump).toEqual({ song: 1, section: VERSE });

    // Across the bar line at 20 by three eighths of a beat, back to the Verse at 16.
    rig.live.advance(0.5 * BEAT_MS);
    const after = await leader.snapshot(at(16.375));
    expect(after.now?.section).toBe(VERSE);
    expect(after.jump).toBeNull();
  });

  // Live made the jump on 16 in time, from the Intro to the Verse at 16, which looks just like
  // playing on. The page cannot tell, so it keeps the mark until the bar line Live would jump on had
  // the tap been late.
  it('keeps the mark up for one more bar after a late tap to the section that starts on the bar line, when Live made the jump in time', async () => {
    rig = await startRig(SET, { playing: true, position: 15.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(15.875));

    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveHasJumps(1);

    rig.live.advance(0.25 * BEAT_MS);
    const jumped = await leader.snapshot(at(16.125));
    expect(jumped.now?.section).toBe(VERSE);
    expect(jumped.jump).toEqual({ song: 1, section: VERSE });
    rig.live.advance(3.75 * BEAT_MS);
    const lastBeat = await leader.snapshot(at(19.875));
    expect(lastBeat.now?.section).toBe(VERSE);
    expect(lastBeat.jump).toEqual({ song: 1, section: VERSE });

    // Past the bar line at 20, still in the Verse.
    rig.live.advance(0.5 * BEAT_MS);
    const after = await leader.snapshot(at(20.375));
    expect(after.now?.section).toBe(VERSE);
    expect(after.jump).toBeNull();
  });

  // A target that does not start on the bar line tells the jump from playback, so a late tap waits no
  // longer for it than Live does.
  it('keeps the mark on a later section until Live jumps on the next bar line, when the tap reached Live late', async () => {
    rig = await startRig(SET, { playing: true, position: 15.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(15.875));

    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(jumpTo(BRIDGE));
    await leader.snapshot(waitingFor(BRIDGE));
    await liveHasJumps(1);
    rig.live.releaseReplies();

    expect((await leader.snapshot(at(16.125))).jump).toEqual({ song: 1, section: BRIDGE });
    rig.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(19.875))).jump).toEqual({ song: 1, section: BRIDGE });

    // Across the bar line at 20 by a quarter beat, which carries into the Bridge at 48.
    rig.live.advance(0.25 * BEAT_MS);
    const after = await leader.snapshot(at(48.125));
    expect(after.now?.section).toBe(BRIDGE);
    expect(after.jump).toBeNull();
  });

  it('clears the mark on a later section at once, when a tap close to the bar line reached Live in time', async () => {
    rig = await startRig(SET, { playing: true, position: 15.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(15.875));

    leader.send(jumpTo(BRIDGE));
    await leader.snapshot(waitingFor(BRIDGE));
    await liveHasJumps(1);

    // Across the bar line at 16 by an eighth of a beat, which carries into the Bridge at 48.
    rig.live.advance(0.25 * BEAT_MS);
    const after = await leader.snapshot(at(48.125));
    expect(after.now?.section).toBe(BRIDGE);
    expect(after.jump).toBeNull();
  });

  // A one-bar Tag right before End is over by the bar line after, so the playhead never plays on in
  // it past that bar line. Its mark clears when the playhead enters it, as for a tap well before the
  // bar line.
  const TAG = 3;
  const TAG_SET: CuePoint[] = [
    { name: '1 - Intro', time: 0 },
    { name: '1 - Verse', time: 16 },
    { name: '1 - Chorus', time: 32 },
    { name: '1 - Tag', time: 48 },
    { name: '1 - End', time: 52 },
  ];

  it('clears the mark on a one-bar section at once and stops at End, when a tap close to the bar line reached Live in time', async () => {
    rig = await startRig(TAG_SET, { playing: true, position: 47.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(47.875)(snapshot) && snapshot.endToggles[1] === 'stop');

    leader.send(jumpTo(TAG));
    await leader.snapshot(waitingFor(TAG));
    await liveHasJumps(1);

    rig.live.advance(0.25 * BEAT_MS);
    const jumped = await leader.snapshot(at(48.125));
    expect(jumped.now?.section).toBe(TAG);
    expect(jumped.jump).toBeNull();
    rig.live.advance(3.75 * BEAT_MS);
    await leader.snapshot(at(51.875));

    // Across End at 52 by an eighth of a beat.
    rig.live.advance(0.25 * BEAT_MS);
    expect((await leader.snapshot(at(52.125))).jump).toBeNull();
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  // The page cannot wait for the later bar line here without a Turn shorter than a bar never
  // clearing, so when Live gets the tap late the mark clears a bar before Live jumps.
  it('clears the mark on a one-bar section a bar early, then plays it again and stops at End, when the tap reached Live late', async () => {
    rig = await startRig(TAG_SET, { playing: true, position: 47.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(47.875)(snapshot) && snapshot.endToggles[1] === 'stop');

    // The tap leaves an eighth of a beat before the Tag at 48 and reaches Live after it.
    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(jumpTo(TAG));
    await leader.snapshot(waitingFor(TAG));
    await liveHasJumps(1);
    rig.live.releaseReplies();

    // Playback alone carried the playhead into the Tag, and Live waits for the bar line at 52.
    const played = await leader.snapshot(at(48.125));
    expect(played.now?.section).toBe(TAG);
    expect(played.jump).toBeNull();
    rig.live.advance(3.75 * BEAT_MS);
    await leader.snapshot(at(51.875));

    // Across the bar line at 52 by three eighths of a beat, back to the Tag at 48, with no stop yet.
    rig.live.advance(0.5 * BEAT_MS);
    const after = await leader.snapshot(at(48.375));
    expect(after.now?.section).toBe(TAG);
    expect(after.jump).toBeNull();
    expect(rig.received('/live/song/stop_playing')).toHaveLength(0);

    // The Tag plays again, and the song stops at End.
    rig.live.advance(3.5 * BEAT_MS);
    await leader.snapshot(at(51.875));
    rig.live.advance(0.25 * BEAT_MS);
    await leader.snapshot(at(52.125));
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  // A two-beat Turn whose last beats carry the Tag's pickup is over before the bar line at 48 is.
  it('clears the mark on a section shorter than a bar at once and stops at End, when a tap close to the bar line reached Live in time', async () => {
    const TURN = 2;
    rig = await startRig(
      [
        { name: '1 - Intro', time: 0 },
        { name: '1 - Chorus', time: 32 },
        { name: '1 - Turn', time: 48 },
        { name: '1 - Tag', time: 50 },
        { name: '1 - End', time: 56 },
      ],
      { playing: true, position: 47.875 },
    );
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(47.875)(snapshot) && snapshot.endToggles[1] === 'stop');

    leader.send(jumpTo(TURN));
    await leader.snapshot(waitingFor(TURN));
    await liveHasJumps(1);

    rig.live.advance(0.25 * BEAT_MS);
    const jumped = await leader.snapshot(at(48.125));
    expect(jumped.now?.section).toBe(TURN);
    expect(jumped.jump).toBeNull();

    // Through the Tag, and across End at 56 by an eighth of a beat.
    rig.live.advance(7.75 * BEAT_MS);
    await leader.snapshot(at(55.875));
    rig.live.advance(0.25 * BEAT_MS);
    expect((await leader.snapshot(at(56.125))).jump).toBeNull();
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  // A one-bar Tag whose locator sits a hair before the bar line, or on a pickup, starts before the
  // bar line Live jumps on. Live's jump back to its start is shorter than the late window, so it
  // seldom shows as a backward move, and the mark must clear once the playhead is past that bar line.
  for (const how of ['tap', 'next'] as const) {
    it(`clears the mark on a one-bar section placed just before the bar line and stops at End, after a ${how} close to the bar line that Live made in time`, async () => {
      rig = await startRig(
        [
          { name: '1 - Intro', time: 0 },
          { name: '1 - Verse', time: 16 },
          { name: '1 - Chorus', time: 32 },
          { name: '1 - Tag', time: 47.96875 },
          { name: '1 - End', time: 52 },
        ],
        { playing: true, position: 47.875 },
      );
      const leader = await rig.connectLeader();
      await leader.snapshot((snapshot) => at(47.875)(snapshot) && snapshot.endToggles[1] === 'stop');

      leader.send(how === 'tap' ? jumpTo(TAG) : { kind: 'next' });
      await leader.snapshot(waitingFor(TAG));
      await liveHasJumps(1);

      // Live jumps on 48 back to the Tag at 47.96875, and plays on an eighth of a beat.
      rig.live.advance(0.25 * BEAT_MS);
      const jumped = await leader.snapshot(at(48.09375));
      expect(jumped.now?.section).toBe(TAG);
      expect(jumped.jump).toBeNull();
      rig.live.advance(3.75 * BEAT_MS);
      await leader.snapshot(at(51.84375));

      // Across End at 52.
      rig.live.advance(0.25 * BEAT_MS);
      expect((await leader.snapshot(at(52.09375))).jump).toBeNull();
      await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
    });
  }

  const PICKUP_TAG_SET: CuePoint[] = [
    { name: '1 - Intro', time: 0 },
    { name: '1 - Verse', time: 16 },
    { name: '1 - Chorus', time: 32 },
    { name: '1 - Tag', time: 47.75 },
    { name: '1 - End', time: 52 },
  ];

  it('clears the mark on a one-bar section on a pickup and stops at End, after a tap close to the bar line that Live made in time', async () => {
    rig = await startRig(PICKUP_TAG_SET, { playing: true, position: 47.625 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(47.625)(snapshot) && snapshot.endToggles[1] === 'stop');

    leader.send(jumpTo(TAG));
    await leader.snapshot(waitingFor(TAG));
    await liveHasJumps(1);

    // Live jumps on 48 back to the Tag's pickup at 47.75, and plays on an eighth of a beat.
    rig.live.advance(0.5 * BEAT_MS);
    await leader.snapshot(at(47.875));
    rig.live.advance(0.25 * BEAT_MS);
    const past = await leader.snapshot(at(48.125));
    expect(past.now?.section).toBe(TAG);
    expect(past.jump).toBeNull();
    rig.live.advance(3.75 * BEAT_MS);
    await leader.snapshot(at(51.875));

    // Across End at 52 by an eighth of a beat.
    rig.live.advance(0.25 * BEAT_MS);
    expect((await leader.snapshot(at(52.125))).jump).toBeNull();
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  it('clears the mark on a restart of a one-bar section on a pickup and stops at End, after a tap close to the bar line that Live made in time', async () => {
    rig = await startRig(PICKUP_TAG_SET, { playing: true, position: 47.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(
      (snapshot) => at(47.875)(snapshot) && snapshot.endToggles[1] === 'stop' && snapshot.now?.section === TAG,
    );

    leader.send(jumpTo(TAG));
    await leader.snapshot(waitingFor(TAG));
    await liveHasJumps(1);

    // Live jumps on 48 back to 47.75 and plays on to 47.875, the position it last reported, so it
    // reports nothing until it plays on to 48.125.
    rig.live.advance(0.25 * BEAT_MS);
    rig.live.advance(0.25 * BEAT_MS);
    const past = await leader.snapshot(at(48.125));
    expect(past.now?.section).toBe(TAG);
    expect(past.jump).toBeNull();
    rig.live.advance(3.75 * BEAT_MS);
    await leader.snapshot(at(51.875));

    // Across End at 52 by an eighth of a beat.
    rig.live.advance(0.25 * BEAT_MS);
    expect((await leader.snapshot(at(52.125))).jump).toBeNull();
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });
});

// A second tap replaces a first tap's waiting jump, and reaches Live after the bar line while the first
// reached it in time. Live makes the first jump on the bar line and the second a bar later, so the
// mark stays on the second target through the first target's first bar.
describe('a late second tap', () => {
  it("keeps the mark on the second target while Live plays the first target's first bar", async () => {
    rig = await startRig(SET, { playing: true, position: 19.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(19.875));

    // The first tap reaches Live before the bar line at 20.
    leader.send(jumpTo(CHORUS));
    await leader.snapshot(waitingFor(CHORUS));
    await liveHasJumps(1);

    // The second tap leaves an eighth of a beat before the bar line and reaches Live after it: Live
    // jumps to the Chorus at 20, and to the Bridge on the bar line after, at 36.
    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send(jumpTo(BRIDGE));
    await leader.snapshot(waitingFor(BRIDGE));
    await liveHasJumps(2);
    rig.live.releaseReplies();

    const chorus = await leader.snapshot(at(32.125));
    expect(chorus.now?.section).toBe(CHORUS);
    expect(chorus.jump).toEqual({ song: 1, section: BRIDGE });
    rig.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(35.875))).jump).toEqual({ song: 1, section: BRIDGE });

    // Across the bar line at 36 by a quarter beat, onto the Bridge.
    rig.live.advance(0.25 * BEAT_MS);
    const after = await leader.snapshot(at(48.125));
    expect(after.now?.section).toBe(BRIDGE);
    expect(after.jump).toBeNull();
  });

  // Song 1 ends on 32 with a gap before song 2, so it starts on "Stop at end". A cue point names a
  // jump by its place in this list.
  const TWO_SONGS: CuePoint[] = [
    { name: '1 - Intro', time: 0 },
    { name: '1 - Verse', time: 16 },
    { name: '1 - End', time: 32 },
    { name: '2 - Intro', time: 40 },
    { name: '2 - Verse', time: 48 },
    { name: '2 - End', time: 64 },
  ];
  const SONG_1_END_CUE = 2;
  const SONG_2_VERSE_CUE = 4;

  // The second tap is Next from song 1's last section, a jump to its End, which is set to stop.
  it('stops at End when the late second tap is a jump to the End of a song set to stop there', async () => {
    rig = await startRig(TWO_SONGS, { playing: true, position: 27.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(27.875)(snapshot) && snapshot.endToggles[1] === 'stop');

    // The first tap, to song 2's Verse, reaches Live before the bar line at 28.
    leader.send({ kind: 'jump', song: 2, section: VERSE });
    await leader.snapshot((snapshot) => snapshot.jump?.song === 2 && snapshot.jump.section === VERSE);
    await liveHasJumps(1);

    // Next leaves an eighth of a beat before the bar line and reaches Live after it: Live jumps to
    // song 2's Verse at 28, and to song 1's End on the bar line after, at 52.
    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send({ kind: 'next' });
    await leader.snapshot((snapshot) => snapshot.jump?.song === 1 && snapshot.jump.section === 'end');
    await liveHasJumps(2);
    rig.live.releaseReplies();
    expect(jumpsReceived().map((message) => message.args[0])).toEqual([SONG_2_VERSE_CUE, SONG_1_END_CUE]);

    expect((await leader.snapshot(at(48.125))).jump).toEqual({ song: 1, section: 'end' });
    rig.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(51.875))).jump).toEqual({ song: 1, section: 'end' });

    // Across the bar line at 52 by a quarter beat, onto song 1's End at 32.
    rig.live.advance(0.25 * BEAT_MS);
    await leader.snapshot(at(32.125));
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  const SONG_2_INTRO_CUE = 3;
  const INTRO = 0;
  const waitingIn = (song: number, section: number | 'end') => (snapshot: Snapshot) =>
    snapshot.jump?.song === song && snapshot.jump.section === section;

  // Next from song 1's last section, pressed at 22, reaches Live in time, so Live jumps to song 1's End
  // at 32 on the bar line at 24. The tap to song 2's Verse leaves an eighth of a beat before that bar
  // line and reaches Live after it, so Live plays on from End for a bar and jumps to song 2's Verse on
  // the bar line at 36. A report in End's first bar is no proof the second jump was lost, as it is not
  // for an old target that is a section.
  it('keeps the mark on the second target while Live plays on from End for a bar, after Next to End', async () => {
    rig = await startRig(TWO_SONGS, { playing: true, position: 22 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(22)(snapshot) && snapshot.endToggles[1] === 'stop');

    leader.send({ kind: 'next' });
    await leader.snapshot(waitingIn(1, 'end'));
    await liveHasJumps(1);
    rig.live.advance(1.875 * BEAT_MS);
    await leader.snapshot(at(23.875));

    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send({ kind: 'jump', song: 2, section: VERSE });
    await leader.snapshot(waitingIn(2, VERSE));
    await liveHasJumps(2);
    rig.live.releaseReplies();
    expect(jumpsReceived().map((message) => message.args[0])).toEqual([SONG_1_END_CUE, SONG_2_VERSE_CUE]);

    // On song 1's End, where Live jumped on 24: Live is on its way to song 2's Verse.
    expect((await leader.snapshot(at(32.125))).jump).toEqual({ song: 2, section: VERSE });
    rig.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(35.875))).jump).toEqual({ song: 2, section: VERSE });

    // Across the bar line at 36 by a quarter beat, onto song 2's Verse. The leader's last choice is
    // song 2's Verse, so no stop goes out at song 1's End.
    rig.live.advance(0.25 * BEAT_MS);
    const after = await leader.snapshot(at(48.125));
    expect(after.now).toMatchObject({ song: 2, section: VERSE });
    expect(after.jump).toBeNull();
    expect(rig.received('/live/song/stop_playing')).toHaveLength(0);
  });

  // The first tap, to song 2's Verse, reaches Live before the bar line at 28, and Live jumps there on
  // 28. Next from song 1's last section (a jump to its End) and a third press both leave an eighth of a
  // beat before the bar line and reach Live after it, so Live plays song 2's Verse for a bar and makes
  // the third press's jump on the bar line after, at 52.
  async function threeTaps(third: { kind: 'jump'; song: number; section: number } | { kind: 'next' }) {
    rig = await startRig(TWO_SONGS, { playing: true, position: 27.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(27.875)(snapshot) && snapshot.endToggles[1] === 'stop');

    leader.send({ kind: 'jump', song: 2, section: VERSE });
    await leader.snapshot(waitingIn(2, VERSE));
    await liveHasJumps(1);

    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send({ kind: 'next' });
    await leader.snapshot(waitingIn(1, 'end'));
    await liveHasJumps(2);
    leader.send(third);
    await liveHasJumps(3);
    rig.live.releaseReplies();
    return leader;
  }

  it("keeps the third target's mark while Live plays the first target's first bar, after a late Next to End between", async () => {
    const leader = await threeTaps({ kind: 'jump', song: 2, section: INTRO });
    expect(jumpsReceived().map((message) => message.args[0])).toEqual([SONG_2_VERSE_CUE, SONG_1_END_CUE, SONG_2_INTRO_CUE]);

    const verse = await leader.snapshot(at(48.125));
    expect(verse.now).toMatchObject({ song: 2, section: VERSE });
    expect(verse.jump).toEqual({ song: 2, section: INTRO });
    rig!.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(51.875))).jump).toEqual({ song: 2, section: INTRO });

    // Across the bar line at 52 by a quarter beat, back to song 2's Intro.
    rig!.live.advance(0.25 * BEAT_MS);
    const after = await leader.snapshot(at(40.125));
    expect(after.now).toMatchObject({ song: 2, section: INTRO });
    expect(after.jump).toBeNull();
  });

  // The third press is Next again, to song 1's End, which is set to stop.
  it('stops at End when the third press is Next again to the End of a song set to stop there', async () => {
    const leader = await threeTaps({ kind: 'next' });
    expect(jumpsReceived().map((message) => message.args[0])).toEqual([SONG_2_VERSE_CUE, SONG_1_END_CUE, SONG_1_END_CUE]);

    expect((await leader.snapshot(at(48.125))).jump).toEqual({ song: 1, section: 'end' });
    rig!.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(51.875))).jump).toEqual({ song: 1, section: 'end' });

    // Across the bar line at 52 by a quarter beat, onto song 1's End at 32.
    rig!.live.advance(0.25 * BEAT_MS);
    await leader.snapshot(at(32.125));
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  // TWO_SONGS with a Bridge in song 2. A cue point names a jump by its place in this list.
  const TWO_SONGS_WITH_BRIDGE: CuePoint[] = [
    { name: '1 - Intro', time: 0 },
    { name: '1 - Verse', time: 16 },
    { name: '1 - End', time: 32 },
    { name: '2 - Intro', time: 40 },
    { name: '2 - Verse', time: 48 },
    { name: '2 - Bridge', time: 56 },
    { name: '2 - End', time: 64 },
  ];
  const SONG_2_BRIDGE = 2;

  // Tap A (song 2's Verse) reaches Live before the bar line at 28, and Live jumps there on 28. Late
  // tap B (song 2's Bridge), late Next to song 1's End, and late tap C (song 2's Intro) all reach Live
  // after it, so Live plays A for a bar and jumps to C on the bar line after, at 52.
  it("keeps C's mark while Live plays A's first bar, after tap A, late tap B, late Next to End and late tap C", async () => {
    rig = await startRig(TWO_SONGS_WITH_BRIDGE, { playing: true, position: 27.875 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(27.875));

    leader.send({ kind: 'jump', song: 2, section: VERSE });
    await leader.snapshot(waitingIn(2, VERSE));
    await liveHasJumps(1);

    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    leader.send({ kind: 'jump', song: 2, section: SONG_2_BRIDGE });
    await leader.snapshot(waitingIn(2, SONG_2_BRIDGE));
    await liveHasJumps(2);
    leader.send({ kind: 'next' });
    await leader.snapshot(waitingIn(1, 'end'));
    await liveHasJumps(3);
    leader.send({ kind: 'jump', song: 2, section: INTRO });
    await leader.snapshot(waitingIn(2, INTRO));
    await liveHasJumps(4);
    rig.live.releaseReplies();

    const verse = await leader.snapshot(at(48.125));
    expect(verse.now).toMatchObject({ song: 2, section: VERSE });
    expect(verse.jump).toEqual({ song: 2, section: INTRO });
    rig.live.advance(3.75 * BEAT_MS);
    expect((await leader.snapshot(at(51.875))).jump).toEqual({ song: 2, section: INTRO });

    // Across the bar line at 52 by a quarter beat, back to song 2's Intro.
    rig.live.advance(0.25 * BEAT_MS);
    const after = await leader.snapshot(at(40.125));
    expect(after.now).toMatchObject({ song: 2, section: INTRO });
    expect(after.jump).toBeNull();
  });
});

// AbletonOSC runs over UDP and sends no reply to a jump, so a lost datagram is a jump Live never
// makes. The fake Live loses the next jump, and the controller must stop waiting for it once the
// playhead shows it had its chance.
describe('a lost jump', () => {
  const JUMP = '/live/song/cue_point/jump';

  async function liveLostJumps(count: number) {
    await vi.waitFor(() => expect(rig?.live.lost.filter(({ address }) => address === JUMP)).toHaveLength(count));
  }

  it('clears the waiting mark once the playhead is a bar past the bar line, when Live never makes the jump', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    rig.live.loseNext(JUMP);
    leader.send(jumpTo(BRIDGE));
    await leader.snapshot(waitingFor(BRIDGE));
    await liveLostJumps(1);

    // Past the bar line at 24, inside the extra bar a jump that reached Live late would wait for.
    rig.live.advance(3.5 * BEAT_MS);
    expect((await leader.snapshot(at(24.5))).jump).toEqual({ song: 1, section: BRIDGE });
    // On the bar line after, where Live would make a jump that reached it late.
    rig.live.advance(3.5 * BEAT_MS);
    expect((await leader.snapshot(at(28))).jump).toEqual({ song: 1, section: BRIDGE });

    // Past it, still in the Verse: Live had its chance and did not jump.
    rig.live.advance(0.5 * BEAT_MS);
    const after = await leader.snapshot(at(28.5));
    expect(after.now?.section).toBe(VERSE);
    expect(after.jump).toBeNull();
  });

  // The song is the set's last, so it starts on "Stop at end".
  it('stops at End on a "Stop at end" song after a jump tapped more than a bar before End is lost', async () => {
    rig = await startRig(SET, { playing: true, position: 53 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(53)(snapshot) && snapshot.endToggles[1] === 'stop');

    rig.live.loseNext(JUMP);
    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveLostJumps(1);

    // The bar line is 56, so the mark clears past 60, still in the Bridge.
    rig.live.advance(3.5 * BEAT_MS);
    expect((await leader.snapshot(at(56.5))).jump).toEqual({ song: 1, section: VERSE });
    rig.live.advance(3.5 * BEAT_MS);
    expect((await leader.snapshot(at(60))).jump).toEqual({ song: 1, section: VERSE });
    rig.live.advance(0.5 * BEAT_MS);
    const cleared = await leader.snapshot(at(60.5));
    expect(cleared.now?.section).toBe(BRIDGE);
    expect(cleared.jump).toBeNull();

    // Two beats at a time, less than a bar, as playback reports it, across End at 64.
    rig.live.advance(2 * BEAT_MS);
    await leader.snapshot(at(62.5));
    expect(rig.received('/live/song/stop_playing')).toHaveLength(0);
    rig.live.advance(2 * BEAT_MS);
    await leader.snapshot(at(64.5));
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  // Live jumps on the bar line, so a playhead past it and outside the target is proof the jump was
  // lost. Waiting a bar more would miss the stop, which looks no further than a bar past End.
  it("stops at End when a jump tapped in the song's last bar is lost", async () => {
    rig = await startRig(SET, { playing: true, position: 61 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(61)(snapshot) && snapshot.endToggles[1] === 'stop');

    rig.live.loseNext(JUMP);
    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveLostJumps(1);

    // The bar line is End, at 64.
    rig.live.advance(2 * BEAT_MS);
    expect((await leader.snapshot(at(63))).jump).toEqual({ song: 1, section: VERSE });

    // Across End by half a beat, outside the Verse.
    rig.live.advance(1.5 * BEAT_MS);
    const after = await leader.snapshot(at(64.5));
    expect(after.jump).toBeNull();
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  // A report on End, where End is the bar line, may come while Live is jumping, so it is no proof.
  // The proof comes a report later, when the playhead has left End, and the stop must still come.
  it("stops at End when a jump tapped in the song's last bar is lost and a report lands on End", async () => {
    rig = await startRig(SET, { playing: true, position: 61 });
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(61)(snapshot) && snapshot.endToggles[1] === 'stop');

    rig.live.loseNext(JUMP);
    leader.send(jumpTo(VERSE));
    await leader.snapshot(waitingFor(VERSE));
    await liveLostJumps(1);

    rig.live.advance(1 * BEAT_MS);
    await leader.snapshot(at(62));
    // On End, the bar line itself.
    rig.live.advance(2 * BEAT_MS);
    expect((await leader.snapshot(at(64))).jump).toEqual({ song: 1, section: VERSE });
    expect(rig.received('/live/song/stop_playing')).toHaveLength(0);

    // Two beats past End, outside the Verse.
    rig.live.advance(2 * BEAT_MS);
    expect((await leader.snapshot(at(66))).jump).toBeNull();
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  // Next on the last section waits for End as any jump waits for its section, so a lost one clears
  // the same way, and Loop, which is refused while the jump to End waits, braces the section again.
  it('clears the mark on a lost jump to End a bar past the bar line, and Loop braces the section playing again', async () => {
    rig = await startRig(SET, { playing: true, position: 53 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(53));

    rig.live.loseNext(JUMP);
    leader.send({ kind: 'next' });
    await leader.snapshot(waitingFor('end'));
    await liveLostJumps(1);

    // The bar line is 56, so the mark clears past 60, still in the Bridge.
    rig.live.advance(3.5 * BEAT_MS);
    expect((await leader.snapshot(at(56.5))).jump).toEqual({ song: 1, section: 'end' });
    rig.live.advance(3.5 * BEAT_MS);
    expect((await leader.snapshot(at(60))).jump).toEqual({ song: 1, section: 'end' });
    rig.live.advance(0.5 * BEAT_MS);
    const cleared = await leader.snapshot(at(60.5));
    expect(cleared.now?.section).toBe(BRIDGE);
    expect(cleared.jump).toBeNull();

    leader.send({ kind: 'loop' });
    await vi.waitFor(() =>
      expect(rig?.live.received.filter(({ address }) => address.startsWith('/live/song/set/loop'))).toEqual([
        { address: '/live/song/set/loop_start', args: [48], types: 'f' },
        { address: '/live/song/set/loop_length', args: [16], types: 'f' },
        { address: '/live/song/set/loop', args: [1], types: 'i' },
      ]),
    );
  });

  // While stopped Live jumps at once, so a jump with no report of the playhead in the target within a
  // second is lost. A set-end-toggle round trip reads the snapshot at a moment of the server's clock.
  async function markAfterToggle(leader: Client, toggle: 'stop' | 'continue') {
    const seen = leader.received.length;
    leader.send({ kind: 'set-end-toggle', song: 1, toggle });
    await vi.waitFor(() => expect(leader.received.slice(seen).some((snapshot) => snapshot.endToggles[1] === toggle)).toBe(true));
    return leader.received.slice(seen).find((snapshot) => snapshot.endToggles[1] === toggle)?.jump;
  }

  it('clears the waiting mark a second after a jump tapped while stopped is lost', async () => {
    rig = await startRig(SET, { playing: false, position: 21 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    rig.live.loseNext(JUMP);
    leader.send(jumpTo(BRIDGE));
    await leader.snapshot(waitingFor(BRIDGE));
    await liveLostJumps(1);

    await rig.advanceConnected(999);
    expect(await markAfterToggle(leader, 'continue')).toEqual({ song: 1, section: BRIDGE });

    await rig.advanceConnected(1);
    const after = await leader.snapshot((snapshot) => snapshot.endToggles[1] === 'continue' && snapshot.jump === null);
    expect(after.now?.section).toBe(VERSE);
  });

  it('keeps the mark on a second jump tapped while stopped for its own second, when the first was lost too', async () => {
    rig = await startRig(SET, { playing: false, position: 21 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    rig.live.loseNext(JUMP);
    leader.send(jumpTo(BRIDGE));
    await leader.snapshot(waitingFor(BRIDGE));
    await liveLostJumps(1);

    await rig.advanceConnected(600);
    rig.live.loseNext(JUMP);
    leader.send(jumpTo(CHORUS));
    await leader.snapshot(waitingFor(CHORUS));
    await liveLostJumps(2);

    // A second after the first tap, the second still waits.
    await rig.advanceConnected(400);
    expect(await markAfterToggle(leader, 'continue')).toEqual({ song: 1, section: CHORUS });
    await rig.advanceConnected(599);
    expect(await markAfterToggle(leader, 'stop')).toEqual({ song: 1, section: CHORUS });

    // A second after the second tap.
    const seen = leader.received.length;
    await rig.advanceConnected(1);
    await vi.waitFor(() => expect(leader.received.slice(seen).some((snapshot) => snapshot.jump === null)).toBe(true));
  });

  // Next to song 1's End, pressed at 9, and a late tap to song 2's Verse, which leaves an eighth of a
  // beat before the bar line at 12, are both lost, so Live plays on across song 1's End at 16. The
  // report at 16.125 is in the first bar of End, the old target the late tap replaced, but a stop at
  // End must come within a bar of it.
  it('stops at End on a "Stop at end" song when Next to End and a late tap that replaced it are both lost', async () => {
    const SPLIT_SET: CuePoint[] = [
      { name: '1 - Intro', time: 0 },
      { name: '1 - End', time: 16 },
      { name: '2 - Intro', time: 24 },
      { name: '2 - Verse', time: 32 },
    ];
    const SONG_2_VERSE = 1;
    rig = await startRig(SPLIT_SET, { playing: true, position: 9 });
    const leader = await rig.connectLeader();
    await leader.snapshot(at(9));
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'stop' });
    await leader.snapshot((snapshot) => snapshot.endToggles[1] === 'stop');

    rig.live.loseNext(JUMP);
    leader.send({ kind: 'next' });
    await leader.snapshot((snapshot) => snapshot.jump?.song === 1 && snapshot.jump.section === 'end');
    await liveLostJumps(1);
    rig.live.advance(2.875 * BEAT_MS);
    await leader.snapshot(at(11.875));

    rig.live.holdReplies();
    rig.live.advance(0.25 * BEAT_MS);
    rig.live.loseNext(JUMP);
    leader.send({ kind: 'jump', song: 2, section: SONG_2_VERSE });
    await leader.snapshot((snapshot) => snapshot.jump?.song === 2 && snapshot.jump.section === SONG_2_VERSE);
    await liveLostJumps(2);
    rig.live.releaseReplies();
    await leader.snapshot(at(12.125));

    rig.live.advance(2 * BEAT_MS);
    await leader.snapshot(at(14.125));
    rig.live.advance(2 * BEAT_MS);
    await leader.snapshot(at(16.125));
    await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
  });

  describe("after a late tap that replaced a target on a song's End", () => {
    // Song 2's Count Off sits on song 1's End, as an overlap builds it, so song 1 starts on "Continue
    // into next song", and each test that stops at End sets it to stop. A cue point names a jump by its
    // place in this list.
    const OVERLAP_SET: CuePoint[] = [
      { name: '1 - Intro', time: 0 },
      { name: '1 - End', time: 16 },
      { name: '2 - Count Off', time: 16 },
      { name: '2 - Intro', time: 24 },
      { name: '2 - Verse', time: 32 },
      { name: '2 - Bridge', time: 40 },
      { name: '2 - End', time: 56 },
    ];
    const SONG_2_COUNT_OFF = 0;
    const SONG_2_VERSE = 2;
    const waitingIn = (song: number, section: number) => (snapshot: Snapshot) =>
      snapshot.jump?.song === song && snapshot.jump.section === section;

    async function startStoppingAtEnd() {
      rig = await startRig(OVERLAP_SET, { playing: true, position: 15.875 });
      const leader = await rig.connectLeader();
      await leader.snapshot(at(15.875));
      leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'stop' });
      await leader.snapshot((snapshot) => snapshot.endToggles[1] === 'stop');
      return leader;
    }

    // Tap A, to song 2's Count Off, and late tap B, to song 2's Verse, are both lost, so Live plays on
    // across song 1's End. The report at 16.125 is in A's first bar, where Live might still be on its
    // way to B, but a stop at End must come within a bar of it, whatever Live is on its way to.
    it("stops at End on a \"Stop at end\" song when tap A on the next song's Count Off and late tap B are both lost", async () => {
      const leader = await startStoppingAtEnd();

      rig!.live.loseNext(JUMP);
      leader.send({ kind: 'jump', song: 2, section: SONG_2_COUNT_OFF });
      await leader.snapshot(waitingIn(2, SONG_2_COUNT_OFF));
      await liveLostJumps(1);

      rig!.live.holdReplies();
      rig!.live.advance(0.25 * BEAT_MS);
      rig!.live.loseNext(JUMP);
      leader.send({ kind: 'jump', song: 2, section: SONG_2_VERSE });
      await leader.snapshot(waitingIn(2, SONG_2_VERSE));
      await liveLostJumps(2);
      rig!.live.releaseReplies();

      await leader.snapshot(at(16.125));
      await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
    });

    // The same late tap B alone, lost, with no target before it, as a control.
    it('stops at End on a "Stop at end" song when a late tap B alone is lost, with no old target, as a control', async () => {
      const leader = await startStoppingAtEnd();

      rig!.live.holdReplies();
      rig!.live.advance(0.25 * BEAT_MS);
      rig!.live.loseNext(JUMP);
      leader.send({ kind: 'jump', song: 2, section: SONG_2_VERSE });
      await leader.snapshot(waitingIn(2, SONG_2_VERSE));
      await liveLostJumps(1);
      rig!.live.releaseReplies();

      await leader.snapshot(at(16.125));
      await vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1));
    });

    // Tap A, to song 2's Count Off, reaches Live in time, so Live jumps there on 16, which looks the
    // same as playing on. Late tap B, to song 2's Verse, reaches Live after 16, so Live makes it on 20.
    // The report at 16.125 is in A's first bar, where Live is still on its way to B.
    it("keeps late tap B's mark in the first bar of tap A on the next song's Count Off, on a song that continues at End", async () => {
      rig = await startRig(OVERLAP_SET, { playing: true, position: 12 });
      const leader = await rig.connectLeader();
      expect((await leader.snapshot(at(12))).endToggles[1]).not.toBe('stop');

      leader.send({ kind: 'jump', song: 2, section: SONG_2_COUNT_OFF });
      await leader.snapshot(waitingIn(2, SONG_2_COUNT_OFF));
      await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));

      rig.live.advance(3.875 * BEAT_MS);
      await leader.snapshot(at(15.875));

      rig.live.holdReplies();
      rig.live.advance(0.25 * BEAT_MS);
      leader.send({ kind: 'jump', song: 2, section: SONG_2_VERSE });
      await leader.snapshot(waitingIn(2, SONG_2_VERSE));
      await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(2));
      rig.live.releaseReplies();

      expect((await leader.snapshot(at(16.125))).jump).toEqual({ song: 2, section: SONG_2_VERSE });
      expect(rig.received('/live/song/stop_playing')).toHaveLength(0);
    });
  });
});

describe('the view-only role', () => {
  it('rejects a jump from a view-only connection, and Live receives nothing from it', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot(at(21));

    viewer.send(jumpTo(BRIDGE));
    await viewer.flush();
    // The leader's jump comes after the viewer's, so once Live has it, the viewer's would be there too.
    leader.send(jumpTo(CHORUS));
    await liveHasJumps(1);
    await viewer.snapshot(waitingFor(CHORUS));

    expect(jumpsReceived()).toEqual([{ address: '/live/song/cue_point/jump', args: [0], types: 'i' }]);
    expect(viewer.received.some(waitingFor(BRIDGE))).toBe(false);
  });

  it('keeps a view-only connection open after it sends a command', async () => {
    rig = await startRig(SET, { playing: false, position: 21 });
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(21));

    viewer.send(jumpTo(BRIDGE));
    await viewer.flush();
    rig.live.setPosition(30);

    expect((await viewer.snapshot(at(30))).now?.section).toBe(VERSE);
  });

  it('refuses a WebSocket on any path but the leader and view-only ones', async () => {
    rig = await startRig(SET);

    await expect(connect(`ws://127.0.0.1:${rig.server.httpPort}/ws/other`)).rejects.toThrow(/400/);
    await expect(connect(`ws://127.0.0.1:${rig.server.httpPort}/leader`)).rejects.toThrow(/400/);
  });
});
