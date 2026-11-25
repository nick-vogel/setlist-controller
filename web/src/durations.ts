import { gapAfter, type SetList, type Snapshot, type Song, type SongTiming } from '../../src/shared/snapshot.ts';

// How long the songs and the set play, and how long is left while Live plays, from each song's timing in the snapshot.
// A section marked to be skipped (+SKIP) is not played, so no total counts it, unless the playhead is in it or a jump
// waits for it. The set counts the gaps between songs. A total that is missing a song or a gap is a minimum, and the page
// says "at least". While a loop is on, the time left is approximate, since the loop plays for as long as the leader keeps
// it.

type Timings = Snapshot['songTimings'];

// Where the playhead is, and what waits to move it.
export type Playhead = Pick<Snapshot, 'now' | 'position' | 'jump' | 'countIn' | 'loop'>;

// Seconds, and whether they are a minimum: some part of what they count is not known.
export type Total = { seconds: number; atLeast: boolean };

// What is left of the song the playhead is in and of the set, each null when nothing of it is known, and whether both are
// approximate.
export type TimeLeft = { song: number | null; set: Total | null; approximate: boolean };

// The seconds a song plays, its skipped sections left out, or null when any section it plays is not timed.
export function songSeconds(song: Song, timing: SongTiming | undefined): number | null {
  const first = song.sections.findIndex((section) => !section.skip);
  return first === -1 ? (timing ? 0 : null) : playedFrom(song, timing, first, 1);
}

// The seconds the whole set plays, songs and the gaps between them, or null when no song is timed. Each song and each gap
// is rounded to whole seconds first, so the total is the sum of the song durations the setlist shows and its gaps.
export function setSeconds(set: SetList, timings: Timings): Total | null {
  return sumFrom(set, timings, 0, Math.round);
}

// What is left at the playhead: of the song it is in, through the song's End, and of the set, through its last song's
// End. A jump that waits lands before long, on the next bar line or at the end of a count-in's Count Off, so the time left
// counts from where it lands: a count-in also counts the rest of the Count Off. Between songs, only the set has time left.
// Before the first song, all of the set is left.
//
// The rest of the section the playhead is in is its share of the section's beats. Across a tempo change inside that one
// section, the share of seconds differs a little, which the per-section timings cannot tell.
export function timeLeft(set: SetList, timings: Timings, { now, position, jump, countIn, loop }: Playhead): TimeLeft {
  const approximate = loop !== null;
  const nothing = { song: null, set: null, approximate };
  if (position === null) return nothing;
  if (jump) {
    const index = set.songs.findIndex((song) => song.number === jump.song);
    const song = set.songs[index];
    if (!song) return nothing;
    const timing = timings[song.number];
    const landed = jump.section === 'end' ? 0 : playedFrom(song, timing, jump.section, 1);
    const lead = countIn && now ? restOfSection(set, timings, now.song, now.section, position) : 0;
    const left = landed === null || lead === null ? null : lead + landed;
    return { song: left, set: setLeft(set, timings, index, left), approximate };
  }
  if (now) {
    const index = set.songs.findIndex((song) => song.number === now.song);
    const song = set.songs[index];
    if (!song) return nothing;
    const rest = restOfSection(set, timings, now.song, now.section, position);
    const later = playedAfter(song, timings[song.number], now.section);
    const left = rest === null || later === null ? null : rest + later;
    return { song: left, set: setLeft(set, timings, index, left), approximate };
  }
  const index = set.songs.findIndex((song) => songStart(song) > position);
  if (index === -1) return nothing;
  const later = sumFrom(set, timings, index);
  if (index === 0) return { song: null, set: later, approximate };
  // Between two songs: what is left of the gap.
  const previous = set.songs[index - 1]!;
  const gap = timings[previous.number]?.gap ?? null;
  const stretch = gapAfter(set.songs, index - 1);
  const gapLeft = gap === null || !stretch ? null : gap * ahead(position, stretch.start, stretch.end);
  return { song: null, set: combine(gapLeft, later), approximate };
}

// "4:05", "1:02:05": whole seconds, the minutes in two digits once there are hours. A time left rounds up, so it reads
// 0:00 only once nothing is left; a duration rounds to the nearest second.
export function formatSeconds(seconds: number, rounding: 'nearest' | 'up' = 'nearest'): string {
  const whole = Math.max(0, rounding === 'up' ? Math.ceil(seconds - 1e-9) : Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

// The seconds from the section at `from`, `share` of it still to play, through the song's End: that section whatever its
// skip mark, since the playhead is in it or a jump lands on it, and every later section the song plays. Null when any of
// them is not timed.
function playedFrom(song: Song, timing: SongTiming | undefined, from: number, share: number): number | null {
  const first = timing?.sections[from];
  if (first === null || first === undefined) return null;
  const later = playedAfter(song, timing, from);
  return later === null ? null : first * share + later;
}

// The seconds of the sections after the one at `index` that the song plays, or null when any of them is not timed.
function playedAfter(song: Song, timing: SongTiming | undefined, index: number): number | null {
  if (!timing) return null;
  let seconds = 0;
  for (const [at, section] of song.sections.entries()) {
    if (at <= index || section.skip) continue;
    const part = timing.sections[at];
    if (part === null || part === undefined) return null;
    seconds += part;
  }
  return seconds;
}

// The seconds left of a section from the playhead, by its share of beats still to play, or null when it is not timed.
function restOfSection(set: SetList, timings: Timings, songNumber: number, index: number, position: number): number | null {
  const section = set.songs.find((song) => song.number === songNumber)?.sections[index];
  const seconds = timings[songNumber]?.sections[index];
  if (!section || section.end === null || seconds === null || seconds === undefined) return null;
  return seconds * ahead(position, section.time, section.end);
}

// The seconds left of the set from the song at `index`, `left` of it still to play: then the gap after it, and every later
// song with its own gap.
function setLeft(set: SetList, timings: Timings, index: number, left: number | null): Total | null {
  if (index === set.songs.length - 1) return left === null ? null : { seconds: left, atLeast: false };
  return combine(left, combine(timings[set.songs[index]!.number]?.gap ?? null, sumFrom(set, timings, index + 1)));
}

// The seconds of the songs from `index` on, each with the gap after it but the last, each part rounded by `round`.
function sumFrom(set: SetList, timings: Timings, index: number, round: (seconds: number) => number = (seconds) => seconds): Total | null {
  let seconds = 0;
  let known = 0;
  let atLeast = false;
  set.songs.slice(index).forEach((song, offset) => {
    const last = index + offset === set.songs.length - 1;
    const timing = timings[song.number];
    for (const part of [songSeconds(song, timing), ...(last ? [] : [timing?.gap ?? null])]) {
      if (part === null) atLeast = true;
      else seconds += round(part);
    }
    if (songSeconds(song, timing) !== null) known += 1;
  });
  return known === 0 ? null : { seconds, atLeast };
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
