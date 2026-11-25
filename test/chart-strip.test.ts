import { describe, expect, it } from 'vitest';
import type { JumpTarget, Loop, NowPlaying, SetList } from '../src/shared/snapshot.ts';
import { chartStrip, type ChartStrip } from '../web/src/chart-strip.ts';

// What the chart view's pinned strip says: the next section and the bars until it starts, "Loop"
// while the loop is on, the next song's title and first section in a song's last section, and no
// countdown where no bar count closes the section.

// Song 1 opens on a Count Off and has an End. Song 2 has no End, and song 3, untitled, follows it.
// Song 4, the set's last, has no End.
const SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Made Up Song',
      sections: [
        { name: 'Count Off', time: 0, end: 8, cue: 0 },
        { name: 'Verse', time: 8, end: 40, cue: 1 },
        { name: 'Chorus', time: 40, end: 72, cue: 2 },
      ],
      end: 72,
      endCue: 3,
    },
    {
      number: 2,
      title: 'Second Song',
      sections: [
        { name: 'Intro', time: 80, end: 96, cue: 4 },
        { name: 'Outro', time: 96, end: null, cue: 5 },
      ],
      end: null,
      endCue: null,
    },
    {
      number: 3,
      title: null,
      sections: [
        { name: 'Opening', time: 112, end: 128, cue: 6 },
        { name: 'Tag', time: 128, end: 136, cue: 7 },
      ],
      end: 136,
      endCue: 8,
    },
    {
      number: 4,
      title: 'Last Song',
      sections: [
        { name: 'Verse', time: 144, end: 160, cue: 9 },
        { name: 'Outro', time: 160, end: null, cue: 10 },
      ],
      end: null,
      endCue: null,
    },
  ],
  warnings: [],
};
// The same set with song 4 gone, so song 3, which has an End, is the set's last.
const ENDING_SET: SetList = { ...SET, songs: SET.songs.slice(0, 3) };

const at = (song: number, section: number, next: number | 'end', bar: number, bars: number | null): NowPlaying => ({
  song,
  section,
  next,
  bar,
  bars,
  fraction: bars === null ? null : (bar - 1) / bars,
});

const strip = (now: NowPlaying | null, { set = SET, jump = null, countIn = false, loop = null }: { set?: SetList; jump?: JumpTarget | null; countIn?: boolean; loop?: Loop | null } = {}) =>
  chartStrip(set, now, jump, countIn, loop);

describe('the chart strip', () => {
  it.each<{ what: string; now: NowPlaying; strip: ChartStrip }>([
    { what: 'bar 1 of 8 counts the 8 bars to the next section', now: at(1, 1, 2, 1, 8), strip: { kind: 'next', song: null, section: 'Chorus', bars: 8 } },
    { what: 'bar 3 of 8 counts 6', now: at(1, 1, 2, 3, 8), strip: { kind: 'next', song: null, section: 'Chorus', bars: 6 } },
    { what: 'bar 8 of 8 counts 1', now: at(1, 1, 2, 8, 8), strip: { kind: 'next', song: null, section: 'Chorus', bars: 1 } },
    { what: 'a bar past the count, as a late report has it, counts 1', now: at(1, 1, 2, 9, 8), strip: { kind: 'next', song: null, section: 'Chorus', bars: 1 } },
    { what: 'the Count Off names the section after it', now: at(1, 0, 1, 1, 2), strip: { kind: 'next', song: null, section: 'Verse', bars: 2 } },
  ])('names the following section in the same song: $what', ({ now, strip: expected }) => {
    expect(strip(now)).toEqual(expected);
  });

  it.each<{ what: string; now: NowPlaying; strip: ChartStrip }>([
    { what: "a song's End: the next song's title and its first section", now: at(1, 2, 'end', 5, 8), strip: { kind: 'next', song: 'Second Song', section: 'Intro', bars: 4 } },
    { what: 'a song with no End, which the next song closes: the untitled next song by its number', now: at(2, 1, 'end', 1, 4), strip: { kind: 'next', song: 'Song 3', section: 'Opening', bars: 4 } },
    { what: 'a song with an End before the last song', now: at(3, 1, 'end', 2, 2), strip: { kind: 'next', song: 'Last Song', section: 'Verse', bars: 1 } },
  ])("in a song's last section names the next song: $what", ({ now, strip: expected }) => {
    expect(strip(now)).toEqual(expected);
  });

  it("in the last section of the set's last song, with no End, says it is the last section, with no countdown", () => {
    expect(strip(at(4, 1, 'end', 3, null))).toEqual({ kind: 'last' });
  });

  it("in the last section of the set's last song, with an End, counts down to the End", () => {
    expect(strip(at(3, 1, 'end', 1, 2), { set: ENDING_SET })).toEqual({ kind: 'next', song: null, section: 'End', bars: 2 });
  });

  it('says Loop while the loop is on, on a section or on a brace set by hand that matches none', () => {
    expect(strip(at(1, 2, 'end', 3, 8), { loop: { start: 40, length: 32, section: { song: 1, section: 2 } } })).toEqual({ kind: 'loop' });
    expect(strip(at(1, 1, 2, 3, 8), { loop: { start: 10, length: 4, section: null } })).toEqual({ kind: 'loop' });
    expect(strip(at(4, 1, 'end', 3, null), { loop: { start: 160, length: 16, section: null } })).toEqual({ kind: 'loop' });
  });

  it("names a count-in's target, not the section after the Count Off, with the Count Off's bars left", () => {
    expect(strip(at(1, 0, 1, 2, 2), { jump: { song: 1, section: 2 }, countIn: true })).toEqual({ kind: 'next', song: null, section: 'Chorus', bars: 1 });
  });

  it("names the playhead's next section for a jump that is no count-in", () => {
    expect(strip(at(1, 1, 2, 3, 8), { jump: { song: 1, section: 0 } })).toEqual({ kind: 'next', song: null, section: 'Chorus', bars: 6 });
  });

  it('is empty before the first song, between songs, while Live is not connected, and for a section the set does not hold', () => {
    expect(strip(null)).toBeNull();
    expect(strip(null, { loop: { start: 74, length: 4, section: null } })).toBeNull();
    expect(strip(at(9, 0, 'end', 1, 4))).toBeNull();
    expect(strip(at(1, 7, 'end', 1, 4))).toBeNull();
  });
});
