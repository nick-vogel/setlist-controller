import type { Loop, NowPlaying, SetList, Song, SongTiming } from '../../src/shared/snapshot.ts';

// How long the songs and the set play, and how long is left while Live plays, from each song's timing in the snapshot.
// A section marked to be skipped (+SKIP) is not played, so no total counts it, unless the playhead is in it. The set
// counts the gaps between songs. A total that is missing a song or a gap is a minimum, and the page says "at least". While
// a loop is on, the time left is approximate, since the loop plays for as long as the leader keeps it.

export type Timings = Record<number, SongTiming>;

// Seconds, and whether they are a minimum: some part of what they count is not known.
export type Total = { seconds: number; atLeast: boolean };

// What is left of the song the playhead is in and of the set, each null when nothing of it is known, and whether both are
// approximate.
export type TimeLeft = { song: number | null; set: Total | null; approximate: boolean };

// The seconds a song plays, its skipped sections left out, or null when any section it plays is not timed.
export function songSeconds(song: Song, timing: SongTiming | undefined): number | null {
  if (!timing) return null;
  let seconds = 0;
  for (const [index, section] of song.sections.entries()) {
    if (section.skip) continue;
    const part = timing.sections[index];
    if (part === null || part === undefined) return null;
    seconds += part;
  }
  return seconds;
}

// The seconds the whole set plays, songs and the gaps between them, or null when no song is timed.
export function setSeconds(set: SetList, timings: Timings): Total | null {
  return sumFrom(set, timings, 0);
}

// What is left at the playhead: of the song it is in, through the song's End, and of the set, through its last song's
// End. Between songs, only the set has time left. Before the first song, all of the set is left.
export function timeLeft(set: SetList, timings: Timings, now: NowPlaying | null, position: number | null, loop: Loop | null): TimeLeft {
  const approximate = loop !== null;
  if (position === null) return { song: null, set: null, approximate };
  const index = now ? set.songs.findIndex((song) => song.number === now.song) : set.songs.findIndex((song) => songStart(song) > position);
  if (index === -1 && !now) return { song: null, set: null, approximate };
  if (now) {
    const song = set.songs[index];
    if (!song) return { song: null, set: null, approximate };
    const left = songLeft(song, timings[song.number], now, position);
    const after = afterSong(set, timings, index);
    return { song: left, set: combine(left, after), approximate };
  }
  const next = set.songs[index]!;
  const later = sumFrom(set, timings, index);
  const previous = set.songs[index - 1];
  if (!previous) return { song: null, set: later, approximate };
  // Between two songs: what is left of the gap.
  const gap = timings[previous.number]?.gap ?? null;
  const gapLeft = gap === null || previous.end === null ? null : gap * ahead(position, previous.end, songStart(next));
  return { song: null, set: combine(gapLeft, later), approximate };
}

// "4:05", "1:02:05": whole seconds, the minutes in two digits once there are hours.
export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

// The seconds left of the song from the playhead in the section `now` names: the rest of that section, by its share of
// beats still to play, and every later section the song plays.
function songLeft(song: Song, timing: SongTiming | undefined, now: NowPlaying, position: number): number | null {
  if (!timing) return null;
  const section = song.sections[now.section];
  const current = timing.sections[now.section];
  if (!section || current === null || current === undefined) return null;
  const rest = section.end === null ? (now.fraction === null ? null : 1 - now.fraction) : ahead(position, section.time, section.end);
  if (rest === null) return null;
  let seconds = current * rest;
  for (const [index, later] of song.sections.entries()) {
    if (index <= now.section || later.skip) continue;
    const part = timing.sections[index];
    if (part === null || part === undefined) return null;
    seconds += part;
  }
  return seconds;
}

// The seconds of the set after the song at `index` ends: the gap after it, and every later song with its own gap.
function afterSong(set: SetList, timings: Timings, index: number): Total | null {
  const song = set.songs[index]!;
  if (index === set.songs.length - 1) return { seconds: 0, atLeast: false };
  const gap = timings[song.number]?.gap ?? null;
  return combine(gap, sumFrom(set, timings, index + 1));
}

// The seconds of the songs from `index` on, each with the gap after it but the last.
function sumFrom(set: SetList, timings: Timings, index: number): Total | null {
  let seconds = 0;
  let known = 0;
  let atLeast = false;
  set.songs.slice(index).forEach((song, offset) => {
    const played = songSeconds(song, timings[song.number]);
    if (played === null) atLeast = true;
    else {
      seconds += played;
      known += 1;
    }
    if (index + offset === set.songs.length - 1) return;
    const gap = timings[song.number]?.gap ?? null;
    if (gap === null) atLeast = true;
    else seconds += gap;
  });
  return known === 0 && atLeast ? null : { seconds, atLeast };
}

// Seconds that may not be known, then a total after them.
function combine(first: number | null, then: Total | null): Total | null {
  if (first === null && then === null) return null;
  return { seconds: (first ?? 0) + (then?.seconds ?? 0), atLeast: first === null || then === null || then.atLeast };
}

// The share of the stretch from `start` to `end` still ahead of `position`, from 0 to 1.
function ahead(position: number, start: number, end: number): number {
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (end - position) / (end - start)));
}

function songStart(song: Song): number {
  return song.sections[0]?.time ?? Infinity;
}
