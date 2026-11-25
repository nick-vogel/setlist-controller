import { describe, expect, it } from 'vitest';
import { parseChart, type ChartLine } from '../src/shared/chart.ts';
import type { NowPlaying, SetList } from '../src/shared/snapshot.ts';
import { chartBlocks, shownSong } from '../web/src/chart-blocks.ts';

// The chart view's blocks: one per locator of the shown song, in played order, each with its bar
// count in the song's meter, 4/4 by default, and which song the chart view shows.

// Song 1 opens on a Count Off, repeats its Chorus and ends on a Pad before its End. Song 2 has no End
// and another song after it, 18 beats after its last section starts. Song 3, the set's last, has no
// End either, and its Verse runs a hair over 4 bars, as Live can report a locator.
const SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Build My Life',
      sections: [
        { name: 'Count Off', time: 0, end: 8, cue: 0 },
        { name: 'Intro', time: 8, end: 24, cue: 1 },
        { name: 'Chorus', time: 24, end: 40, cue: 2 },
        { name: 'Verse', time: 40, end: 56, cue: 3 },
        { name: 'Chorus', time: 56, end: 72, cue: 4 },
        { name: 'Tag', time: 72, end: 74, cue: 5 },
        { name: 'Pad', time: 74, end: 80, cue: 6 },
      ],
      end: 80,
      endCue: 7,
    },
    {
      number: 2,
      title: null,
      sections: [
        { name: 'Intro', time: 96, end: 112, cue: 8 },
        { name: 'Chorus', time: 112, end: null, cue: 9 },
      ],
      end: null,
      endCue: null,
    },
    {
      number: 3,
      title: 'Goodness of God',
      sections: [
        { name: 'Verse', time: 130, end: 146.00005, cue: 10 },
        { name: 'Outro', time: 146.00005, end: null, cue: 11 },
      ],
      end: null,
      endCue: null,
    },
  ],
  warnings: [],
};

const on = (song: number, section: number): NowPlaying => ({ song, section, next: section + 1, bar: 1, bars: 4, fraction: 0 });

describe('the chart blocks', () => {
  it.each([
    {
      what: 'a song with a Count Off, a repeated Chorus, a Pad and an End',
      song: 1,
      blocks: [
        { song: 1, section: 0, name: 'Count Off', bars: 2, lines: [] },
        { song: 1, section: 1, name: 'Intro', bars: 4, lines: [] },
        { song: 1, section: 2, name: 'Chorus', bars: 4, lines: [] },
        { song: 1, section: 3, name: 'Verse', bars: 4, lines: [] },
        { song: 1, section: 4, name: 'Chorus', bars: 4, lines: [] },
        { song: 1, section: 5, name: 'Tag', bars: 1, lines: [] },
        { song: 1, section: 6, name: 'Pad', bars: 2, lines: [] },
        { song: 1, section: 'end', name: 'End', bars: null, lines: [] },
      ],
    },
    {
      what: 'a song with no End mid-set, its last section measured to the next song, rounded up to a whole bar',
      song: 2,
      blocks: [
        { song: 2, section: 0, name: 'Intro', bars: 4, lines: [] },
        { song: 2, section: 1, name: 'Chorus', bars: 5, lines: [] },
      ],
    },
    {
      what: "the set's last song with no End, its last section with no count",
      song: 3,
      blocks: [
        { song: 3, section: 0, name: 'Verse', bars: 4, lines: [] },
        { song: 3, section: 1, name: 'Outro', bars: null, lines: [] },
      ],
    },
  ])('gives one block per locator in played order for $what', ({ song, blocks }) => {
    expect(chartBlocks(SET, song)).toEqual(blocks);
  });

  it('gives no blocks for a song not in the set', () => {
    expect(chartBlocks(SET, 9)).toEqual([]);
  });

  it("counts each block's bars in the beats a bar of the song's meter holds, as an 8-bar Verse of a 6/8 song at 3 beats a bar", () => {
    const sixEight: SetList = {
      songs: [
        {
          number: 1,
          title: 'Great Are You Lord',
          sections: [
            { name: 'Count Off', time: 0, end: 6, cue: 0 },
            { name: 'Verse 1', time: 6, end: 30, cue: 1 },
            { name: 'Chorus', time: 30, end: 54, cue: 2 },
          ],
          end: 54,
          endCue: 3,
        },
      ],
      warnings: [],
    };
    expect(chartBlocks(sixEight, 1, [], 3).map(({ name, bars }) => [name, bars])).toEqual([
      ['Count Off', 2],
      ['Verse 1', 8],
      ['Chorus', 8],
      ['End', null],
    ]);
    expect(chartBlocks(sixEight, 1).map(({ bars }) => bars)).toEqual([2, 6, 6, null]);
  });
});

describe("the chart blocks' text", () => {
  // Count Off, then Verse, Chorus, Verse, Chorus, Chorus, an Outro the chart has no heading for, and a
  // Tag whose heading has no text.
  const SONG: SetList = {
    songs: [
      {
        number: 1,
        title: 'Made Up Song',
        sections: ['Count Off', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Chorus', 'Outro', 'Tag'].map((name, index) => ({ name, time: index * 16, end: (index + 1) * 16, cue: index })),
        end: 128,
        endCue: 8,
      },
    ],
    warnings: [],
  };
  // One VERSE and two CHORUS headings, every line made up.
  const CHART = parseChart('VERSE\n[G]verse words\nCHORUS\n[C]first chorus\nchorus\n[D]second chorus\nTAG\n').sections;
  const words = (chord: string, text: string): ChartLine[] => [{ kind: 'lyrics', chunks: [{ chord, text }] }];

  it('gives each block the lines of the heading it matches, the nth of a name taking the nth, a section past the last taking the last', () => {
    expect(chartBlocks(SONG, 1, CHART).map(({ name, lines }) => [name, lines])).toEqual([
      ['Count Off', []],
      ['Verse', words('G', 'verse words')],
      ['Chorus', words('C', 'first chorus')],
      ['Verse', words('G', 'verse words')],
      ['Chorus', words('D', 'second chorus')],
      ['Chorus', words('D', 'second chorus')],
      ['Outro', []],
      ['Tag', []],
      ['End', []],
    ]);
  });

  it('gives every block no lines with no chart', () => {
    expect(chartBlocks(SONG, 1).flatMap(({ lines }) => lines)).toEqual([]);
    expect(chartBlocks(SONG, 1, []).flatMap(({ lines }) => lines)).toEqual([]);
  });

  it('never gives Count Off, Pad or Pad Out lines, since no heading names them', () => {
    const pads: SetList = { songs: [{ ...SONG.songs[0]!, sections: ['Count Off', 'Pad', 'Pad Out'].map((name, index) => ({ name, time: index * 16, end: (index + 1) * 16, cue: index })) }], warnings: [] };
    const chart = parseChart('COUNT OFF\nwords\nPAD\nwords\nPAD OUT\nwords').sections;
    expect(chart).toEqual([]);
    expect(chartBlocks(pads, 1, chart).flatMap(({ lines }) => lines)).toEqual([]);
  });
});

describe('the song the chart view shows', () => {
  it('is the song the playhead is in', () => {
    expect(shownSong(SET, on(2, 1), null)).toBe(2);
    expect(shownSong(SET, on(3, 0), 1)).toBe(3);
  });

  it('stays on the song shown last while the playhead is in none, as between songs', () => {
    expect(shownSong(SET, null, 2)).toBe(2);
  });

  it("is the set's first song before any song was shown", () => {
    expect(shownSong(SET, null, null)).toBe(1);
  });

  it("is the set's first song when the song shown last is no longer in the set", () => {
    expect(shownSong(SET, null, 9)).toBe(1);
  });

  it('is none for a set with no songs', () => {
    expect(shownSong({ songs: [], warnings: [] }, null, null)).toBeNull();
  });
});
