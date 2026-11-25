import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Role } from '../src/shared/routes.ts';
import type { NowPlaying, SetList, Snapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';
import { formatSeconds, setSeconds, songSeconds, timeLeft, type Timings } from '../web/src/durations.ts';
import { NowPlaying as NowPlayingPanel } from '../web/src/NowPlaying.tsx';

// The totals a page shows from each song's timing: a song's and the set's, gaps included and skipped sections left out,
// and what is left of each at the playhead, approximate while a loop is on.

// Song 1: Count Off 0-8, Verse 8-24, a skipped Tag 24-32, End 32. A gap to song 2 at 40: Intro 40-56, End 56.
// Song 3: Verse 64-80, End 80.
const SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'First',
      sections: [
        { name: 'Count Off', time: 0, end: 8, cue: 0 },
        { name: 'Verse', time: 8, end: 24, cue: 1 },
        { name: 'Tag', time: 24, end: 32, cue: 2, skip: true },
      ],
      end: 32,
      endCue: 3,
    },
    { number: 2, title: 'Second', sections: [{ name: 'Intro', time: 40, end: 56, cue: 4 }], end: 56, endCue: 5 },
    { number: 3, title: 'Third', sections: [{ name: 'Verse', time: 64, end: 80, cue: 6 }], end: 80, endCue: 7 },
  ],
  warnings: [],
};

const TIMINGS: Timings = {
  1: { sections: [4, 10, 5], gap: 6, source: 'build' },
  2: { sections: [20], gap: 3, source: 'build' },
  3: { sections: [30], gap: null, source: 'build' },
};

const at = (song: number, section: number, fraction = 0): NowPlaying => ({ song, section, next: 'end', bar: 1, bars: 4, fraction });

describe('song and set totals', () => {
  it('counts every section a song plays and leaves out a skipped one', () => {
    expect(songSeconds(SET.songs[0]!, TIMINGS[1])).toBe(14);
    expect(songSeconds(SET.songs[1]!, TIMINGS[2])).toBe(20);
  });

  it('gives no total for a song with no timing, or one with a section it plays not timed', () => {
    expect(songSeconds(SET.songs[0]!, undefined)).toBeNull();
    expect(songSeconds(SET.songs[0]!, { sections: [4, null, 5], gap: null, source: 'tempo' })).toBeNull();
    // A skipped section with no timing does not matter.
    expect(songSeconds(SET.songs[0]!, { sections: [4, 10, null], gap: null, source: 'tempo' })).toBe(14);
  });

  it('counts the whole set with the gaps between songs, and not a gap after the last song', () => {
    expect(setSeconds(SET, TIMINGS)).toEqual({ seconds: 14 + 6 + 20 + 3 + 30, atLeast: false });
  });

  it('says the set total is a minimum when a song or a gap is not timed, and gives none when no song is', () => {
    expect(setSeconds(SET, { 1: { ...TIMINGS[1]!, gap: null }, 3: TIMINGS[3]! })).toEqual({ seconds: 14 + 30, atLeast: true });
    expect(setSeconds(SET, {})).toBeNull();
  });
});

describe('the time left at the playhead', () => {
  it('counts the rest of the section by its beats, the later sections the song plays, and the rest of the set', () => {
    // A quarter through the Verse, 8 to 24: 12 of its 16 beats are left.
    expect(timeLeft(SET, TIMINGS, at(1, 1), 12, null)).toEqual({ song: 7.5, set: { seconds: 7.5 + 6 + 20 + 3 + 30, atLeast: false }, approximate: false });
  });

  it('counts the rest of a skipped section the playhead is in, but no skipped section after it', () => {
    expect(timeLeft(SET, TIMINGS, at(1, 0), 4, null).song).toBe(2 + 10);
    expect(timeLeft(SET, TIMINGS, at(1, 2), 28, null).song).toBe(2.5);
  });

  it('counts what is left of the gap between two songs, and gives no song time', () => {
    // Halfway through the gap from 32 to 40.
    expect(timeLeft(SET, TIMINGS, null, 36, null)).toEqual({ song: null, set: { seconds: 3 + 20 + 3 + 30, atLeast: false }, approximate: false });
  });

  it('counts all of the set before the first song, and nothing after the last', () => {
    const before = { songs: SET.songs.map((song) => ({ ...song, sections: song.sections.map((section) => ({ ...section, time: section.time + 8, end: section.end! + 8 })), end: song.end! + 8 })), warnings: [] };
    expect(timeLeft(before, TIMINGS, null, 2, null).set).toEqual(setSeconds(before, TIMINGS));
    expect(timeLeft(SET, TIMINGS, null, 90, null)).toEqual({ song: null, set: null, approximate: false });
  });

  it('says the time left is a minimum when a later song is not timed', () => {
    const timings = { 1: TIMINGS[1]!, 2: TIMINGS[2]! };
    expect(timeLeft(SET, timings, at(2, 0), 48, null)).toEqual({ song: 10, set: { seconds: 10 + 3, atLeast: true }, approximate: false });
  });

  it('gives no song time for a song with no timing, and a minimum for the set', () => {
    expect(timeLeft(SET, { 3: TIMINGS[3]! }, at(2, 0), 48, null)).toEqual({ song: null, set: { seconds: 30, atLeast: true }, approximate: false });
  });

  it('is approximate while a loop is on', () => {
    expect(timeLeft(SET, TIMINGS, at(1, 1), 12, { start: 8, length: 16, section: { song: 1, section: 1 } }).approximate).toBe(true);
  });

  it('knows nothing before Live reports the position', () => {
    expect(timeLeft(SET, TIMINGS, null, null, null)).toEqual({ song: null, set: null, approximate: false });
  });
});

describe('how a page writes seconds', () => {
  it.each([
    [0, '0:00'],
    [5.4, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [3725, '1:02:05'],
  ])('writes %s seconds as %s', (seconds, text) => {
    expect(formatSeconds(seconds)).toBe(text);
  });
});

const SNAPSHOT: Snapshot = {
  live: 'connected',
  set: SET,
  playing: true,
  position: 12,
  now: at(1, 1),
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop', 2: 'stop', 3: 'stop' },
  fade: null,
  loop: null,
  chartRevision: 1,
  songMeters: { 1: 4, 2: 4, 3: 4 },
  songTimings: TIMINGS,
  power: { source: 'ac', percent: 100 },
};

// The text a page shows, without its markup.
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const page = (role: Role, changes: Partial<Snapshot> = {}) =>
  renderToStaticMarkup(createElement(Page, { role, snapshot: { ...SNAPSHOT, ...changes }, connected: true, send: () => {} }));
const line = (markup: string, name: string) => text(new RegExp(`<p class="${name}">(.*?)</p>`).exec(markup)?.[1] ?? 'missing');
const all = (markup: string, name: string) => [...markup.matchAll(new RegExp(`<p class="${name}">(.*?)</p>`, 'g'))].map((match) => text(match[1]!));
const panel = (changes: Partial<Snapshot> = {}) => {
  const { live, set, now, jump, countIn, loop, songTimings, position } = { ...SNAPSHOT, ...changes };
  return renderToStaticMarkup(createElement(NowPlayingPanel, { live, set, now, jump, countIn, loop, timings: songTimings, position }));
};

describe('the durations a page shows', () => {
  it.each(['leader', 'viewer'] as const)("shows each song's duration under its title and the set's total over the setlist, on the %s page", (role) => {
    const markup = page(role);
    expect(all(markup, 'song-duration')).toEqual(['0:14', '0:20', '0:30']);
    expect(line(markup, 'set-duration')).toBe('Set 1:13');
  });

  it('shows no duration for a song with no timing, and the set total as a minimum', () => {
    const markup = page('leader', { songTimings: { 2: TIMINGS[2]!, 3: TIMINGS[3]! } });
    expect(all(markup, 'song-duration')).toEqual(['0:20', '0:30']);
    expect(line(markup, 'set-duration')).toBe('Set at least 0:53');
  });

  it('shows no set total when no song is timed', () => {
    expect(page('leader', { songTimings: {} })).not.toContain('set-duration');
  });

  it('shows the time left in the song and in the set under the progress bar', () => {
    expect(line(panel(), 'now-time-left')).toBe('0:08 left in song \u00b7 1:07 left in set');
  });

  it('marks the time left approximate while a loop is on, and the set time as a minimum when a song is not timed', () => {
    expect(line(panel({ loop: { start: 8, length: 16, section: { song: 1, section: 1 } } }), 'now-time-left')).toBe('~0:08 left in song \u00b7 ~1:07 left in set');
    expect(line(panel({ songTimings: { 1: TIMINGS[1]!, 2: TIMINGS[2]! } }), 'now-time-left')).toBe('0:08 left in song \u00b7 at least 0:37 left in set');
  });

  it('shows only the set time between songs, and keeps the line in place with nothing known', () => {
    expect(line(panel({ now: null, position: 36 }), 'now-time-left')).toBe('0:56 left in set');
    expect(panel({ songTimings: {} })).toContain('<p class="now-time-left">\u00a0</p>');
  });
});
