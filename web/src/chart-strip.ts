import { sectionAt, songTitle, type JumpTarget, type Loop, type NowPlaying, type SetList } from '../../src/shared/snapshot.ts';

// What the chart view's pinned strip says. The next section and the bars until it starts, with the
// next song's title before it in a song's last section. "Loop" while the loop is on, since the next
// section is not coming on its count then. "Last section" in the last section of the set's last song
// with no End, which no bar count closes. Null when the playhead is in no section.
export type ChartStrip =
  | { kind: 'loop' }
  | { kind: 'last' }
  // song is the next song's title, only in a song's last section. bars is null when no bar count
  // closes the current section.
  | { kind: 'next'; song: string | null; section: string; bars: number | null };

export function chartStrip(set: SetList, now: NowPlaying | null, jump: JumpTarget | null, countIn: boolean, loop: Loop | null): ChartStrip | null {
  if (!now) return null;
  const index = set.songs.findIndex((song) => song.number === now.song);
  const song = set.songs[index];
  if (!song?.sections[now.section]) return null;
  if (loop) return { kind: 'loop' };

  // The bars left in the section, counting the one playing: bar 1 of 8 is 8, bar 8 of 8 is 1. A
  // report a hair past the last bar still counts that bar.
  const bars = now.bars === null ? null : Math.max(1, now.bars - now.bar + 1);
  const next = (section: string, title: string | null = null): ChartStrip => ({ kind: 'next', song: title, section, bars });

  // The band comes in on a count-in's target where the Count Off ends, not on the section after it.
  const target = countIn && jump ? sectionAt(set, jump) : undefined;
  if (target) return next(target.name);
  if (now.next !== 'end') {
    const following = song.sections[now.next];
    return following ? next(following.name) : null;
  }
  const after = set.songs[index + 1];
  const first = after?.sections[0];
  if (after && first) return next(first.name, songTitle(after));
  return song.end === null ? { kind: 'last' } : next('End');
}
