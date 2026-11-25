import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { LOOP_REPORT_MS } from '../src/server/playback-controller.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Two songs in 4/4 with a bar's gap between them, listed out of time order as Live may report them.
// A jump names a cue point by its place in this list, so song 2's Intro is cue 2.
const SET: CuePoint[] = [
  { name: '2 - Verse', time: 48 },
  { name: '1 - Intro', time: 0 },
  { name: '2 - Intro', time: 36 },
  { name: '1 - End', time: 32 },
  { name: '1 - Verse', time: 16 },
  { name: '2 - End', time: 64 },
];
const SONG_2_INTRO_CUE = 2;

// The same two songs with no silent bar between them: song 1's End and song 2's first locator share beat 32.
const GAPLESS_SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 32 },
  { name: '2 - Intro', time: 32 },
  { name: '2 - End', time: 64 },
];

// At 120 BPM a beat is 500 ms.
const BEAT_MS = 500;

const JUMP = '/live/song/cue_point/jump';
const CONTINUE = '/live/song/continue_playing';
const START = '/live/song/start_playing';
const STOP = '/live/song/stop_playing';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;
const playing = (snapshot: Snapshot) => snapshot.playing;
const stopped = (snapshot: Snapshot) => !snapshot.playing;

// The transport messages the fake Live has received, in order.
function transport() {
  const addresses = new Set([JUMP, CONTINUE, START, STOP]);
  return (rig?.live.received ?? []).filter((message) => addresses.has(message.address));
}

describe('play song from start', () => {
  it("jumps to the song's first locator, then sends start_playing, and never continue_playing", async () => {
    rig = await startRig(SET, { playing: false, position: 20 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(20));

    leader.send({ kind: 'play-from-start', song: 2 });

    await vi.waitFor(() =>
      expect(transport()).toEqual([
        { address: JUMP, args: [SONG_2_INTRO_CUE], types: 'i' },
        { address: START, args: [], types: '' },
      ]),
    );
    const after = await viewer.snapshot((snapshot) => snapshot.playing && snapshot.now?.song === 2);
    expect(after.now?.section).toBe(0);
    expect(after.jump).toBeNull();
    expect(rig.received(CONTINUE)).toEqual([]);
  });

  // Live resumes continue_playing from where it last stopped, whatever moved while stopped
  // (setlist-controller#13), so a play from start that continued would play on in song 1.
  it("plays song 2 from its first locator after a stop inside song 1, and the pages show song 2's first section playing", async () => {
    rig = await startRig(SET, { playing: true, position: 4 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(4));
    rig.live.advance(4 * BEAT_MS);
    await leader.snapshot(at(8));
    leader.send({ kind: 'stop' });
    await viewer.snapshot((snapshot) => at(8)(snapshot) && stopped(snapshot));

    // A client keeps every snapshot it got, so each waits for the first playing one after the press.
    const pressed = new Map([viewer, leader].map((client) => [client, client.received.length]));
    leader.send({ kind: 'play-from-start', song: 2 });

    for (const [client, from] of pressed) {
      const after = await client.snapshot((snapshot) => playing(snapshot) && client.received.indexOf(snapshot) >= from);
      expect(after.now).toMatchObject({ song: 2, section: 0 });
      expect(after.position).toBe(36);
      expect(after.jump).toBeNull();
    }
    rig.live.advance(BEAT_MS);
    expect((await viewer.snapshot(at(37))).now).toMatchObject({ song: 2, section: 0 });
  });

  // Live reports the stop only on AbletonOSC's tick, so the press comes before Live's stop report.
  it('plays song 2 from its first locator when pressed after Stop, before Live reports the stop', async () => {
    rig = await startRig(SET, { playing: true, position: 8 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(8));
    rig.live.holdReplies();

    leader.send({ kind: 'stop' });
    leader.send({ kind: 'play-from-start', song: 2 });

    await vi.waitFor(() =>
      expect(transport()).toEqual([
        { address: STOP, args: [], types: '' },
        { address: JUMP, args: [SONG_2_INTRO_CUE], types: 'i' },
        { address: START, args: [], types: '' },
      ]),
    );
    rig.live.releaseReplies();

    const after = await viewer.snapshot((snapshot) => playing(snapshot) && snapshot.now?.song === 2);
    expect(after.now?.section).toBe(0);
    expect(after.position).toBe(36);
    expect(after.jump).toBeNull();
    expect(rig.received(CONTINUE)).toEqual([]);
  });

  it("plays song 2 from its first locator when pressed after the stop at song 1's End, before Live reports it", async () => {
    rig = await startRig(SET, { playing: true, position: 30 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(30));

    // Across 1 - End at 32. The report of the playhead goes out before the hold, the stop's after it.
    rig.live.advance(3 * BEAT_MS);
    rig.live.holdReplies();
    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));

    leader.send({ kind: 'play-from-start', song: 2 });

    await vi.waitFor(() =>
      expect(transport()).toEqual([
        { address: STOP, args: [], types: '' },
        { address: JUMP, args: [SONG_2_INTRO_CUE], types: 'i' },
        { address: START, args: [], types: '' },
      ]),
    );
    rig.live.releaseReplies();

    const after = await viewer.snapshot((snapshot) => playing(snapshot) && snapshot.now?.song === 2);
    expect(after.now?.section).toBe(0);
    expect(after.position).toBe(36);
    expect(rig.received(CONTINUE)).toEqual([]);
  });

  it('waits for the bar line when Live is started at the laptop just after it reports the stop', async () => {
    rig = await startRig(SET, { playing: true, position: 8 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(8));
    leader.send({ kind: 'stop' });
    await leader.snapshot((snapshot) => at(8)(snapshot) && stopped(snapshot));
    const from = leader.received.length;
    rig.live.setPlaying(true);
    await leader.snapshot((snapshot) => playing(snapshot) && leader.received.indexOf(snapshot) >= from);

    leader.send({ kind: 'play-from-start', song: 2 });

    expect((await viewer.snapshot((snapshot) => snapshot.jump !== null)).jump).toEqual({ song: 2, section: 0 });
    await vi.waitFor(() => expect(rig?.received(CONTINUE)).toHaveLength(1));
    expect(rig.received(START)).toEqual([]);
  });

  // AbletonOSC takes the stop over UDP, so a lost datagram is a stop Live never makes, and no report of
  // it ever comes. start_playing would restart a playing Live at its start marker at once.
  it('waits for the bar line again once a stop Live never made has had time to report', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    rig.live.loseNext(STOP);

    leader.send({ kind: 'stop' });
    await vi.waitFor(() => expect(rig?.live.lost).toEqual([{ address: STOP, args: [], types: '' }]));
    await rig.advanceConnected(LOOP_REPORT_MS);

    leader.send({ kind: 'play-from-start', song: 2 });

    expect((await viewer.snapshot((snapshot) => snapshot.jump !== null)).jump).toEqual({ song: 2, section: 0 });
    await vi.waitFor(() => expect(rig?.received(CONTINUE)).toHaveLength(1));
    expect(rig.received(START)).toEqual([]);
  });

  it('waits for the bar line while playing, shows the waiting jump, then lands in the song', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));

    leader.send({ kind: 'play-from-start', song: 2 });

    expect((await viewer.snapshot((snapshot) => snapshot.jump !== null)).jump).toEqual({ song: 2, section: 0 });
    await vi.waitFor(() => expect(rig?.received(CONTINUE)).toHaveLength(1));

    // Four beats cross the bar line at 24 by one beat, which carries into song 2's Intro at 36.
    rig.live.advance(4 * BEAT_MS);
    const after = await viewer.snapshot(at(37));
    expect(after.now).toMatchObject({ song: 2, section: 0 });
    expect(after.playing).toBe(true);
    expect(after.jump).toBeNull();
    expect(rig.received(START)).toEqual([]);
  });
});

describe('the end toggles', () => {
  it('default to Stop at end for every song, and a change reaches every client', async () => {
    rig = await startRig(SET, { playing: false, position: 20 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();

    expect((await viewer.snapshot(loaded)).endToggles).toEqual({ 1: 'stop', 2: 'stop' });

    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });

    const continues = (snapshot: Snapshot) => snapshot.endToggles[1] === 'continue';
    expect((await viewer.snapshot(continues)).endToggles).toEqual({ 1: 'continue', 2: 'stop' });
    expect((await leader.snapshot(continues)).endToggles).toEqual({ 1: 'continue', 2: 'stop' });
  });

  it('ignores a toggle value that is neither, a song not in the set, and a toggle from a view-only connection', async () => {
    rig = await startRig(SET, { playing: false, position: 20 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot(loaded);

    viewer.send({ kind: 'set-end-toggle', song: 2, toggle: 'continue' });
    await viewer.flush();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'loop' });
    leader.send({ kind: 'set-end-toggle', song: 3, toggle: 'continue' });
    // A later change that does go through, so every earlier one has been handled once it shows.
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });

    await viewer.snapshot((snapshot) => snapshot.endToggles[1] === 'continue');
    expect(viewer.received.at(-1)?.endToggles).toEqual({ 1: 'continue', 2: 'stop' });
    expect(viewer.received.some((snapshot) => snapshot.endToggles[2] === 'continue')).toBe(false);
    expect(viewer.received.some((snapshot) => (snapshot.endToggles[1] as string) === 'loop')).toBe(false);
  });
});

describe('auto-stop at End', () => {
  // Once Live holds a later command from the leader, it would hold any stop the server sent before it.
  async function barrier(leader: Client) {
    const count = rig?.received(JUMP).length ?? 0;
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(count + 1));
  }

  it('stops Live once when the playhead reaches the End of a song set to Stop at end', async () => {
    rig = await startRig(SET, { playing: true, position: 30 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(30));

    // Across 1 - End at 32, and on again before the stop reaches Live.
    rig.live.advance(3 * BEAT_MS);
    rig.live.advance(BEAT_MS / 2);

    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    await viewer.snapshot((snapshot) => at(33.5)(snapshot) && stopped(snapshot));
    await barrier(leader);
    expect(rig.received(STOP)).toHaveLength(1);
  });

  it('plays on into the next song when the song is set to Continue', async () => {
    rig = await startRig(SET, { playing: true, position: 30 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
    await viewer.snapshot((snapshot) => snapshot.endToggles[1] === 'continue');

    // Across 1 - End at 32, through the gap, and into song 2's Intro at 36.
    rig.live.advance(4 * BEAT_MS);
    rig.live.advance(4 * BEAT_MS);

    const after = await viewer.snapshot(at(38));
    expect(after.now).toMatchObject({ song: 2, section: 0 });
    expect(after.playing).toBe(true);
    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
  });

  it('sends nothing when the playhead is moved past End while stopped, or by more than a bar while playing', async () => {
    rig = await startRig(SET, { playing: false, position: 30 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot(at(30));

    rig.live.setPosition(33);
    await viewer.snapshot(at(33));
    rig.live.setPosition(30);
    rig.live.setPlaying(true);
    await viewer.snapshot((snapshot) => snapshot.playing && snapshot.position === 30);
    // From song 1 into song 2, as a click on the timeline at the laptop does.
    rig.live.setPosition(40);
    await viewer.snapshot(at(40));

    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
    expect(viewer.received.at(-1)?.playing).toBe(true);
  });

  it('sends nothing when the playhead is moved by hand into a next song that starts on End', async () => {
    rig = await startRig(GAPLESS_SET, { playing: true, position: 20 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    // Song 1 flows into song 2, so it starts on Continue. Stop at end keeps this about the hand move.
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'stop' });
    await viewer.snapshot((snapshot) => at(20)(snapshot) && playing(snapshot) && snapshot.endToggles[1] === 'stop');

    // Clicks on song 2 at the laptop from mid-song, onto End and a little past it.
    rig.live.setPosition(32);
    await viewer.snapshot(at(32));
    rig.live.setPosition(21);
    await viewer.snapshot(at(21));
    rig.live.setPosition(34);
    await viewer.snapshot(at(34));
    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
  });

  it('stops Live when playback carries the playhead through End into a next song that starts on it', async () => {
    rig = await startRig(GAPLESS_SET, { playing: true, position: 30 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    // Song 1 flows into song 2, so it starts on Continue until the leader sets it to Stop at end.
    leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'stop' });
    await viewer.snapshot((snapshot) => at(30)(snapshot) && playing(snapshot) && snapshot.endToggles[1] === 'stop');

    rig.live.advance(3 * BEAT_MS);

    await vi.waitFor(() => expect(rig?.received(STOP)).toHaveLength(1));
    await barrier(leader);
    expect(rig.received(STOP)).toHaveLength(1);
  });

  it('lets a jump that waits for the bar line carry the playhead out of the song, past End', async () => {
    // Song 1's End sits off the bar grid, so playback crosses it before the jump lands on the bar line at 32.
    rig = await startRig(
      [
        { name: '1 - Intro', time: 0 },
        { name: '1 - End', time: 30 },
        { name: '2 - Intro', time: 36 },
        { name: '2 - End', time: 64 },
      ],
      { playing: true, position: 29 },
    );
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(29));

    leader.send({ kind: 'play-from-start', song: 2 });
    await viewer.snapshot((snapshot) => snapshot.jump !== null);
    await vi.waitFor(() => expect(rig?.received(CONTINUE)).toHaveLength(1));

    // Across 1 - End at 30 while the jump waits, then across the bar line at 32 into song 2.
    rig.live.advance(2 * BEAT_MS);
    await viewer.snapshot(at(31));
    rig.live.advance(2 * BEAT_MS);

    const after = await viewer.snapshot(at(37));
    expect(after.now).toMatchObject({ song: 2, section: 0 });
    expect(after.playing).toBe(true);
    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
  });

  // A loop on song 1's last section, the Verse, braced 16 to 32: its brace ends on song 1's End.
  const LAST_SECTION_LOOP = { on: true, start: 16, length: 16 };
  const VERSE_LOOP = { start: 16, length: 16, section: { song: 1, section: 1 } };
  const loopOnVerse = (snapshot: Snapshot) => snapshot.loop?.start === 16 && snapshot.loop.length === 16;
  // The fake Live computes positions in double, so a sum of advances carries a little rounding.
  const near = (beats: number) => (snapshot: Snapshot) =>
    loaded(snapshot) && snapshot.position !== null && Math.abs(snapshot.position - beats) < 1e-3;
  // Within 1e-4 beat before the loop end at 32, as Live's float32 song time may report it.
  const BEFORE_WRAP = Math.fround(31.99995);

  it('keeps a loop that ends on End playing when Live reports the playhead a hair before the wrap', async () => {
    rig = await startRig(SET, { playing: true, position: 31.9, loop: LAST_SECTION_LOOP });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(Math.fround(31.9))(snapshot) && playing(snapshot) && loopOnVerse(snapshot));
    const from = viewer.received.length;

    rig.live.setPosition(BEFORE_WRAP);
    await viewer.snapshot(at(BEFORE_WRAP));
    // The wrap back to the brace's start.
    rig.live.setPosition(16);
    const wrapped = await viewer.snapshot(at(16));
    expect(wrapped.playing).toBe(true);
    expect(wrapped.loop).toEqual(VERSE_LOOP);

    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
    expect(viewer.received.slice(from).every(playing)).toBe(true);
  });

  it('keeps a loop that ends on End playing when Live reports the playhead exactly on the loop end', async () => {
    rig = await startRig(SET, { playing: true, position: 31.9, loop: LAST_SECTION_LOOP });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(Math.fround(31.9))(snapshot) && playing(snapshot) && loopOnVerse(snapshot));
    const from = viewer.received.length;

    // Straight from 31.9 to the brace's end, which is song 1's End.
    rig.live.setPosition(32);
    await viewer.snapshot(at(32));
    rig.live.setPosition(16);
    const wrapped = await viewer.snapshot(at(16));
    expect(wrapped.playing).toBe(true);
    expect(wrapped.loop).toEqual(VERSE_LOOP);

    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
    expect(viewer.received.slice(from).every(playing)).toBe(true);
  });

  it('keeps a loop that ends on End playing when playback reaches a hair before the wrap', async () => {
    rig = await startRig(SET, { playing: true, position: 31.9, loop: LAST_SECTION_LOOP });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(Math.fround(31.9))(snapshot) && playing(snapshot) && loopOnVerse(snapshot));
    const from = viewer.received.length;

    // At 120 BPM, 49.975 ms is 0.09995 beat: to 31.99995, before the wrap.
    rig.live.advance(49.975);
    expect((await viewer.snapshot(near(31.99995))).position).toBe(BEFORE_WRAP);

    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
    expect(viewer.received.slice(from).every(playing)).toBe(true);
  });

  it("wraps a loop the leader sets on a Stop at end song's last section several times, and never stops Live", async () => {
    rig = await startRig(SET, { playing: true, position: 30 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((snapshot) => at(30)(snapshot) && playing(snapshot));
    expect(viewer.received.at(-1)?.endToggles[1]).toBe('stop');

    leader.send({ kind: 'loop' });
    expect((await viewer.snapshot(loopOnVerse)).loop).toEqual(VERSE_LOOP);
    const from = viewer.received.length;

    // From 30 to 31.9.
    rig.live.advance(950);
    await viewer.snapshot(near(31.9));
    for (let pass = 1; pass <= 3; pass++) {
      const seen = viewer.received.length;
      const fresh = (matches: (snapshot: Snapshot) => boolean) => (snapshot: Snapshot) =>
        viewer.received.indexOf(snapshot) >= seen && matches(snapshot);
      // To within 1e-4 beat of the loop end at 32, then on past it, which wraps to 16.1.
      rig.live.advance(49.975);
      await viewer.snapshot(fresh(near(31.99995)));
      rig.live.advance(50.025);
      const wrapped = await viewer.snapshot(fresh(near(16.1)));
      expect(wrapped.playing).toBe(true);
      expect(wrapped.now).toMatchObject({ song: 1, section: 1 });
      expect(wrapped.loop).toEqual(VERSE_LOOP);
      // Through the Verse again, back to 31.9.
      rig.live.advance(7900);
      await viewer.snapshot(fresh(near(31.9)));
    }

    await barrier(leader);
    expect(rig.received(STOP)).toEqual([]);
    expect(viewer.received.slice(from).every(playing)).toBe(true);
  });
});

describe('stop', () => {
  it('stops Live, and clears a jump that waited for the bar line', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot(at(21));
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await viewer.snapshot((snapshot) => snapshot.jump !== null);

    leader.send({ kind: 'stop' });

    await vi.waitFor(() => expect(rig?.received(STOP)).toEqual([{ address: STOP, args: [], types: '' }]));
    // The latest snapshot, not the first stopped one: the snapshot from before Live played was stopped at 21 too.
    await vi.waitFor(() => expect(viewer.received.at(-1)?.playing).toBe(false));
    expect(viewer.received.at(-1)).toMatchObject({ position: 21, jump: null });
  });

  it('rejects a stop from a view-only connection, and Live keeps playing', async () => {
    rig = await startRig(SET, { playing: true, position: 21 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot((snapshot) => at(21)(snapshot) && playing(snapshot));

    viewer.send({ kind: 'stop' });
    await viewer.flush();
    // The leader's command comes after the viewer's, so once Live has it, the viewer's would be there too.
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));

    expect(rig.received(STOP)).toEqual([]);
    rig.live.advance(BEAT_MS);
    expect((await viewer.snapshot(at(22))).playing).toBe(true);
  });
});
