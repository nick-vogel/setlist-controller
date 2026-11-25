import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// Cue points one bar of 4/4 apart, in the order given.
const cuePoints = (...names: string[]): CuePoint[] => names.map((name, index) => ({ name, time: index * 4 }));

async function setFrom(...names: string[]) {
  rig = await startRig(cuePoints(...names));
  const viewer = await rig.connectViewer();
  const { set } = await viewer.snapshot(loaded);
  if (!set) throw new Error('The set did not load');
  return set;
}

describe('the setlist', () => {
  it('reads the songs and sections from the locators in Live', async () => {
    const set = await setFrom(
      '1 - Intro (Goodness of God)',
      '1 \u2013 Verse',
      '1\u2014Chorus',
      '1 - Chorus',
      '1 - End',
      '2 - Intro',
      '2 - End',
    );

    expect(set.songs.map((song) => ({ title: song.title, sections: song.sections.map((section) => section.name) }))).toEqual([
      { title: 'Goodness of God', sections: ['Intro', 'Verse', 'Chorus', 'Chorus'] },
      { title: null, sections: ['Intro'] },
    ]);
    expect(set.warnings).toEqual([]);
  });

  it('asks Live for the cue points once at startup', async () => {
    await setFrom('1 - Intro', '1 - End');

    expect(rig?.received('/live/song/get/cue_points')).toHaveLength(1);
  });

  it('registers the playhead, transport, tempo, time signature and loop listeners at startup', async () => {
    await setFrom('1 - Intro', '1 - End');

    await vi.waitFor(() =>
      expect(
        (rig?.live.received ?? []).filter((message) => message.address.startsWith('/live/song/start_listen')).map((message) => message.address),
      ).toEqual([
        '/live/song/start_listen/current_song_time',
        '/live/song/start_listen/is_playing',
        '/live/song/start_listen/tempo',
        '/live/song/start_listen/signature_numerator',
        '/live/song/start_listen/signature_denominator',
        '/live/song/start_listen/loop_start',
        '/live/song/start_listen/loop_length',
        '/live/song/start_listen/loop',
      ]),
    );
  });

  it('runs a section to the next locator in its song, and the last one to End', async () => {
    const set = await setFrom('1 - Intro', '1 - Verse', '1 - End');

    expect(set.songs[0]?.sections).toEqual([
      { name: 'Intro', time: 0, end: 4, cue: 0 },
      { name: 'Verse', time: 4, end: 8, cue: 1 },
    ]);
    expect(set.songs[0]?.end).toBe(8);
    expect(set.songs[0]?.endCue).toBe(2);
  });

  it('warns about a locator that does not parse, and keeps the rest of the set', async () => {
    const set = await setFrom('1 - Intro', 'Bridge', '1 - End');

    expect(set.songs[0]?.sections.map((section) => section.name)).toEqual(['Intro']);
    expect(set.warnings).toEqual([expect.objectContaining({ kind: 'unparseable-locator', locator: 'Bridge' })]);
  });

  it('warns about a song with no End', async () => {
    const set = await setFrom('1 - Intro', '1 - Verse', '2 - Intro', '2 - End');

    expect(set.songs.map((song) => song.number)).toEqual([1, 2]);
    expect(set.songs[0]?.end).toBeNull();
    expect(set.songs[0]?.endCue).toBeNull();
    expect(set.songs[0]?.sections.at(-1)?.end).toBeNull();
    expect(set.warnings).toEqual([expect.objectContaining({ kind: 'missing-end', song: 1 })]);
  });

  it('warns about a gap in the song numbers', async () => {
    const set = await setFrom('1 - Intro', '1 - End', '3 - Intro', '3 - End');

    expect(set.songs.map((song) => song.number)).toEqual([1, 3]);
    expect(set.warnings).toEqual([expect.objectContaining({ kind: 'song-number-gap', song: 2 })]);
  });

  it('does not count the songs before the lowest song number as a gap', async () => {
    const set = await setFrom('2 - Intro', '2 - End', '3 - Intro', '3 - End');

    expect(set.warnings).toEqual([]);
  });

  it('counts a gap from the lowest song number', async () => {
    const set = await setFrom('2 - Intro', '2 - End', '4 - Intro', '4 - End');

    expect(set.warnings).toEqual([expect.objectContaining({ kind: 'song-number-gap', song: 3 })]);
  });

  it('warns about a song with more than one End, and keeps the first', async () => {
    const set = await setFrom('1 - Intro', '1 - End', '1 - End');

    expect(set.songs[0]?.end).toBe(4);
    expect(set.warnings).toEqual([expect.objectContaining({ kind: 'repeated-end', song: 1 })]);
  });

  it("warns about a section that starts at or after its song's End", async () => {
    const set = await setFrom('1 - Intro', '1 - End', '1 - Tag');

    expect(set.warnings).toEqual([expect.objectContaining({ kind: 'section-after-end', song: 1, section: 'Tag' })]);
  });

  it('warns about two songs whose locators overlap', async () => {
    const set = await setFrom('1 - Intro', '2 - Intro', '1 - End', '2 - End');

    expect(set.warnings).toEqual([expect.objectContaining({ kind: 'overlapping-songs', song: 1, other: 2 })]);
  });

  it("does not warn about a song that starts on the last one's End", async () => {
    rig = await startRig([
      { name: '1 - Intro', time: 0 },
      { name: '1 - End', time: 16 },
      { name: '2 - Intro', time: 16 },
      { name: '2 - End', time: 32 },
    ]);
    const viewer = await rig.connectViewer();
    const { set } = await viewer.snapshot(loaded);

    expect(set?.warnings).toEqual([]);
  });

  it('warns about every bad input at once, and keeps serving viewers', async () => {
    const set = await setFrom('1 - Intro', 'Bridge', '1 - Verse', '3 - Intro', '3 - End');

    expect(set.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unparseable-locator', locator: 'Bridge' }),
        expect.objectContaining({ kind: 'missing-end', song: 1 }),
        expect.objectContaining({ kind: 'song-number-gap', song: 2 }),
      ]),
    );
    expect(set.warnings).toHaveLength(3);

    const second = await rig?.connectViewer();
    expect((await second?.snapshot(loaded))?.set).toEqual(set);
  });

  it('puts the songs in number order and the sections in time order', async () => {
    rig = await startRig([
      { name: '2 - End', time: 40 },
      { name: '2 - Intro', time: 32 },
      { name: '1 - Verse', time: 8 },
      { name: '1 - Intro', time: 0 },
      { name: '1 - End', time: 16 },
    ]);
    const viewer = await rig.connectViewer();
    const { set } = await viewer.snapshot(loaded);

    expect(set?.songs.map((song) => [song.number, song.sections.map((section) => section.name)])).toEqual([
      [1, ['Intro', 'Verse']],
      [2, ['Intro']],
    ]);
  });
});
