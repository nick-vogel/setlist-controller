import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Two songs in 4/4, with the set starting at bar 5 and a two-bar gap between the songs.
const SET: CuePoint[] = [
  { name: '1 - Intro (Goodness of God)', time: 16 },
  { name: '1 - Verse', time: 32 },
  { name: '1 - End', time: 64 },
  { name: '2 - Intro', time: 72 },
  { name: '2 - End', time: 88 },
];

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

// The snapshot a viewer receives once the playhead has moved to the given beat.
async function nowAt(viewer: Client, beats: number) {
  rig?.live.setPosition(beats);
  return (await viewer.snapshot(at(beats))).now;
}

describe('now playing', () => {
  it('shows the first bar at the start of a section', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();

    expect(await nowAt(viewer, 16)).toEqual({ song: 1, section: 0, next: 1, bar: 1, bars: 4, fraction: 0 });
  });

  it('counts the bar and the fraction mid-section', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();

    // Ten beats into the eight-bar verse.
    expect(await nowAt(viewer, 42)).toEqual({ song: 1, section: 1, next: 'end', bar: 3, bars: 8, fraction: 0.3125 });
  });

  it('stays in the last bar on the last beat of a section', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();

    expect(await nowAt(viewer, 31)).toEqual({ song: 1, section: 0, next: 1, bar: 4, bars: 4, fraction: 0.9375 });
    expect(await nowAt(viewer, 32)).toEqual({ song: 1, section: 1, next: 'end', bar: 1, bars: 8, fraction: 0 });
  });

  it('shows no song before the first song or in the gap between songs', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();

    expect(await nowAt(viewer, 8)).toBeNull();
    expect(await nowAt(viewer, 64)).toBeNull();
    expect(await nowAt(viewer, 70)).toBeNull();
    expect(await nowAt(viewer, 72)).toEqual({ song: 2, section: 0, next: 'end', bar: 1, bars: 4, fraction: 0 });
  });

  it("shows the song's end as next on its last section, never the next song", async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();

    expect((await nowAt(viewer, 60))?.next).toBe('end');
  });

  it('counts bars of three beats in 3/4', async () => {
    rig = await startRig(
      [
        { name: '1 - Intro', time: 0 },
        { name: '1 - Verse', time: 12 },
        { name: '1 - End', time: 36 },
      ],
      { signature: { numerator: 3, denominator: 4 } },
    );
    const viewer = await rig.connectViewer();

    // Seven beats into the verse: bar 2 of 6 in 4/4, bar 3 of 8 in 3/4.
    expect(await nowAt(viewer, 19)).toEqual({ song: 1, section: 1, next: 'end', bar: 3, bars: 8, fraction: 7 / 24 });
  });

  it('follows a change of time signature', async () => {
    rig = await startRig([
      { name: '1 - Intro', time: 0 },
      { name: '1 - End', time: 24 },
    ]);
    const viewer = await rig.connectViewer();
    expect(await nowAt(viewer, 9)).toEqual(expect.objectContaining({ bar: 3, bars: 6 }));

    rig.live.setSignature(3, 4);

    const { now } = await viewer.snapshot((snapshot) => snapshot.now?.bars === 8);
    expect(now).toEqual(expect.objectContaining({ bar: 4, bars: 8 }));
  });

  it('counts the bars the playhead reaches across a tempo change', async () => {
    rig = await startRig(
      [
        { name: '1 - Intro', time: 0 },
        { name: '1 - End', time: 64 },
      ],
      { playing: true, tempo: 120 },
    );
    const viewer = await rig.connectViewer();
    await viewer.snapshot(at(0));

    // Four seconds at 120 is eight beats, then four seconds at 60 is four more.
    rig.live.advance(4000);
    await viewer.snapshot(at(8));
    rig.live.setTempo(60);
    rig.live.advance(4000);

    expect((await viewer.snapshot(at(12))).now).toEqual(expect.objectContaining({ bar: 4, bars: 16 }));
  });

  it("counts the bars of the last section of a song with no End to the next song's first locator", async () => {
    rig = await startRig([
      { name: '1 - Intro', time: 0 },
      { name: '1 - Verse', time: 8 },
      { name: '2 - Intro', time: 40 },
      { name: '2 - End', time: 48 },
    ]);
    const viewer = await rig.connectViewer();

    // Ten beats into the verse, which runs 32 beats to song 2's Intro: bar 3 of 8.
    expect(await nowAt(viewer, 18)).toEqual({ song: 1, section: 1, next: 'end', bar: 3, bars: 8, fraction: 0.3125 });
    expect((await nowAt(viewer, 40))?.song).toBe(2);
  });

  it("counts bars with no total in the last section of the set's last song with no End", async () => {
    rig = await startRig([
      { name: '1 - Intro', time: 0 },
      { name: '1 - End', time: 8 },
      { name: '2 - Intro', time: 16 },
      { name: '2 - Verse', time: 24 },
    ]);
    const viewer = await rig.connectViewer();

    // No song follows, so the verse runs on with no known length.
    expect(await nowAt(viewer, 30)).toEqual({ song: 2, section: 1, next: 'end', bar: 2, bars: null, fraction: null });
  });

  it('reports whether Live is playing', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();
    await viewer.snapshot(loaded);

    let started = false;
    const stoppedAfterStarting = (snapshot: Snapshot) => {
      started ||= snapshot.playing;
      return started && !snapshot.playing;
    };

    rig.live.setPlaying(true);
    expect((await viewer.snapshot((snapshot) => snapshot.playing)).playing).toBe(true);
    rig.live.setPlaying(false);
    expect((await viewer.snapshot(stoppedAfterStarting)).playing).toBe(false);
  });
});
