import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint, Track } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

// setlist-controller#156, from setlist-controller#113 pre-pr-review-1.md, Needs Further
// Investigation A. The first describe is the ticket's proof as it was given.
//
// A loop on song 1's last section, where that section's end is song 2's Count Off (the overlap
// layout). A position report on the brace end is the loop going round, so it must not bring the
// music back while the leader's Fade out is under way or the music is silent.

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// The overlap layout, as in test/pause-rules.test.ts: song 2's Count Off on song 1's End.
const TWO_SONGS: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - Chorus', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Count Off (Trust)', time: 40 },
  { name: '2 - Verse', time: 48 },
  { name: '2 - End', time: 64 },
];

// As in test/fade-out.test.ts.
const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Kick', grouped: true, volume: 0.5 },
  { name: 'Snare', grouped: true, volume: 1 },
  { name: 'Keys', grouped: false, volume: 0.5 },
  { name: 'Bass', grouped: false, volume: 0.25 },
];
const TOP_LEVEL = [0, 3, 4];
const BEAT_MS = 500;
const GET_VOLUME = '/live/track/get/volume';
const SET_VOLUME = '/live/track/set/volume';

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;
const playingNear = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.playing && near(snapshot.position, beats);
const sentTo = (track: number) =>
  (rig?.received(SET_VOLUME) ?? []).filter((message) => message.args[0] === track).map((message) => message.args[1] as number);

// Playing in song 1's Chorus at 28, the loop on the Chorus (24 to 40), and the leader's Fade out
// stepping. Returns once the steps have started, with the playhead at 29.
async function loopedAndFading() {
  rig = await startRig(TWO_SONGS, { playing: true, position: 28, tracks: TRACKS });
  const leader = await rig.connectLeader();
  await leader.snapshot(playingNear(28));
  leader.send({ kind: 'loop' });
  await leader.snapshot((s) => loaded(s) && s.loop?.section?.song === 1 && s.loop.section.section === 2);
  leader.send({ kind: 'fade-out' });
  await vi.waitFor(() => expect(rig?.received(GET_VOLUME)).toHaveLength(TOP_LEVEL.length));
  rig.live.advance(BEAT_MS);
  await leader.snapshot(playingNear(29));
  return leader;
}

async function moveTo(leader: Client, beats: number) {
  rig!.live.setPosition(beats);
  return leader.snapshot(playingNear(beats));
}

describe("a loop wrap reported on the brace end of song 1's last section, on song 2's Count Off", () => {
  it('leaves the music silent after the Fade out has run to silence', async () => {
    const leader = await loopedAndFading();
    await rig!.advanceConnected(6000);
    await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length));
    expect(rig!.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);

    const onBrace = await moveTo(leader, Math.fround(39.99995));
    const wrapped = await moveTo(leader, 25);
    await rig!.advanceConnected(6000);
    const last = await moveTo(leader, 26);

    console.log('brace-end report', { position: onBrace.position, now: onBrace.now, loop: onBrace.loop, fade: onBrace.fade });
    console.log('after wrap', { fade: wrapped.fade }, 'end', { fade: last.fade, volumes: rig!.live.volumes(), sets: rig!.received(SET_VOLUME).length });
    expect(last.fade).toBe('silent');
    expect(rig!.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length);
    expect(rig!.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
  });

  it('keeps the Fade out stepping down to silence when the brace-end report comes mid-fade', async () => {
    const leader = await loopedAndFading();
    // Two seconds into the six: each top-level track at two thirds of its volume, going down.
    await rig!.advanceConnected(2000);
    await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength(20 * TOP_LEVEL.length));

    await moveTo(leader, Math.fround(39.99995));
    await moveTo(leader, 25);
    await rig!.advanceConnected(6000);
    const last = await moveTo(leader, 26);

    // No step after the brace-end report is higher than the one before it.
    for (const track of TOP_LEVEL) {
      const steps = sentTo(track);
      const rises = steps.filter((volume, step) => step > 0 && volume > steps[step - 1]!);
      expect(rises, `track ${track} steps ${JSON.stringify(steps.slice(15, 30))}`).toEqual([]);
    }
    expect(last.fade).toBe('silent');
    expect(rig!.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
  });
});

// Resolves with the first snapshot the leader receives from now on that matches.
const next = (leader: Client, matches: (snapshot: Snapshot) => boolean) => {
  const start = leader.received.length;
  return leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= start && matches(snapshot));
};

// The loop on song 1's Chorus and the Fade out run to silence, the playhead at 29.
async function loopedAndSilent() {
  const leader = await loopedAndFading();
  await rig!.advanceConnected(6000);
  await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength(60 * TOP_LEVEL.length));
  expect(rig!.live.volumes()).toEqual([0, 0.5, 1, 0, 0]);
  return leader;
}

// The music comes back over song 2's Count Off, which runs from `at` to its first downbeat at 48:
// a step up every 100 ms on each top-level track, each higher than the one before, the last at its
// volume.
async function comesBackFrom(at: number) {
  const ms = (48 - at) * BEAT_MS;
  const rising = Math.round(ms / 100);
  await rig!.advanceConnected(ms + 1000);
  await vi.waitFor(() => expect(rig?.received(SET_VOLUME)).toHaveLength((60 + rising) * TOP_LEVEL.length));
  for (const track of TOP_LEVEL) {
    const steps = sentTo(track).slice(60);
    expect(steps).toHaveLength(rising);
    expect(steps.every((volume, step) => step === 0 || volume > steps[step - 1]!)).toBe(true);
  }
  expect(rig!.live.volumes()).toEqual([0.75, 0.5, 1, 0.5, 0.25]);
}

// The report on the brace end changes only how that report is read. A move on from it into song 2's
// Count Off is a move from song 1, so the music comes back over that Count Off, as it does on any
// move into the next song's Count Off.
describe("a move on into song 2's Count Off after a report on the brace end of a loop on song 1's last section", () => {
  it('brings the music back when the loop is turned off at the laptop and playback goes on into the Count Off', async () => {
    const leader = await loopedAndSilent();
    await moveTo(leader, Math.fround(39.99995));
    rig!.live.setLoop({ on: false });
    await next(leader, (snapshot) => snapshot.loop === null);

    const into = await moveTo(leader, 40.5);

    expect(into.now).toMatchObject({ song: 2, section: 0 });
    expect(into.fade).toBe('in');
    await comesBackFrom(40.5);
  });

  it("brings the music back when a jump to the Count Off, tapped just after that report, turns the loop off and playback goes on into it", async () => {
    const leader = await loopedAndSilent();
    await moveTo(leader, Math.fround(39.99995));
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await next(leader, (snapshot) => snapshot.jump?.song === 2 && snapshot.loop === null);

    const into = await moveTo(leader, 40.5);

    expect(into.now).toMatchObject({ song: 2, section: 0 });
    expect(into.fade).toBe('in');
    await comesBackFrom(40.5);
  });

  it('brings the music back when a jump to the Count Off lands on the brace end while Live still reports the loop on', async () => {
    const leader = await loopedAndSilent();
    await moveTo(leader, 37);
    // The loop off the jump sends is lost on its way, so Live keeps reporting the loop on.
    rig!.live.loseNext('/live/song/set/loop');
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await next(leader, (snapshot) => snapshot.jump?.song === 2);
    await vi.waitFor(() => expect(rig?.received('/live/song/cue_point/jump')).toHaveLength(1));

    // The bar line is beat 40, the brace end, so Live lands on song 2's Count Off there.
    rig!.live.advance(3 * BEAT_MS);
    const landed = await leader.snapshot(playingNear(40));

    expect(landed.loop).toMatchObject({ start: 24, length: 16 });
    expect(landed.jump).toBeNull();
    expect(landed.fade).toBe('in');
    await comesBackFrom(40);
  });
});
