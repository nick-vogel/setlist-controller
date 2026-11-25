import type { ChartLine, ChartSection } from '../../src/shared/chart.ts';
import { matchSection } from '../../src/shared/occurrence.ts';
import type { JumpTarget, NowPlaying, SetList } from '../../src/shared/snapshot.ts';

// The chart view's blocks for a song: one per locator in played order, from the snapshot. A section
// Live repeats is a block each time, with its own section index, and a song's End is its last block.
// Each block takes the lines of the chart heading it matches by the shared occurrence matcher, so the
// second Chorus takes the second CHORUS heading.

export type ChartBlock = JumpTarget & {
  name: string;
  // Whole bars of the song's starting meter from the manifest, 4/4 when it has none, from the
  // section's locator to the next. Null for End, which is a point, and for the last section of the
  // set's last song with no End, which no later locator closes.
  bars: number | null;
  // The matched heading's lines. None for a block no heading matches, such as Count Off, for a
  // heading with no text, for End, and for a song with no chart.
  lines: ChartLine[];
};

// As the server rounds a section's bars (src/server/playback-controller.ts), so a locator a hair past
// a bar line counts no extra bar.
const EPSILON = 1e-4;

export function chartBlocks(set: SetList, songNumber: number, chart: readonly ChartSection[] = [], beats = 4): ChartBlock[] {
  const song = set.songs.find((candidate) => candidate.number === songNumber);
  if (!song) return [];
  const start = song.sections[0]?.time;
  // A song with no End runs to the next song's first locator, as the server measures it.
  const nextSong = Math.min(Infinity, ...set.songs.flatMap((other) => (other.sections[0] && start !== undefined && other.sections[0].time > start ? [other.sections[0].time] : [])));
  const blocks: ChartBlock[] = song.sections.map((section, index) => {
    const end = section.end ?? (Number.isFinite(nextSong) ? nextSong : null);
    return {
      song: song.number,
      section: index,
      name: section.name,
      bars: end === null ? null : Math.ceil((end - section.time) / beats - EPSILON),
      lines: matchSection(song.sections, index, chart)?.lines ?? [],
    };
  });
  if (song.end !== null) blocks.push({ song: song.number, section: 'end', name: 'End', bars: null, lines: [] });
  return blocks;
}

// The song the chart view shows: the song the playhead is in, else the song it showed last, so the
// band keeps the song they just played between songs, else the set's first song. Null for a set with
// no songs.
export function shownSong(set: SetList, now: NowPlaying | null, last: number | null): number | null {
  const find = (number: number | null | undefined) => set.songs.find((song) => song.number === number);
  return (find(now?.song) ?? find(last) ?? set.songs[0])?.number ?? null;
}
