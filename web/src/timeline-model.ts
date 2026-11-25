import { COUNT_OFF, isPad } from '../../src/shared/count-in.ts';
import { songTitle, type Loop, type Section, type SetList, type Song } from '../../src/shared/snapshot.ts';

// Pure geometry for the whole-set scrolling timeline: maps Live's beat space onto a continuous
// horizontal pixel strip at a fixed, comfortable width per bar (~14-15 bars across an iPad
// landscape viewport) so bar ticks and section widths stay consistent across mixed meters.

// Fixed width per bar in CSS pixels. At 72px, a 1080px iPad landscape screen shows 15 bars
// (1024px shows ~14.2 bars), right inside the 12-16 bar target with no zoom controls.
export const BAR_WIDTH_PX = 72;

// How long the timeline stays detached after the leader stops dragging or peeking while Live plays
// before automatically returning to follow the live playhead.
export const PEEK_IDLE_MS = 3000;

// Float32 beat tolerance matching playback-controller.ts.
const EPSILON = 1e-4;

// Fallback bar count for the last section of the set's last song when that song has no End locator.
const OPEN_END_MIN_BARS = 4;

export type TimelineSectionKind = 'section' | 'pad' | 'count-off';

export type TimelineBarTick = {
  // 1-based bar number inside the section, matching NowPlaying.bar.
  bar: number;
  beat: number;
  // Horizontal offset in pixels from the section block's left edge.
  offsetX: number;
};

export type TimelineSection = {
  song: number;
  section: number;
  name: string;
  kind: TimelineSectionKind;
  time: number;
  end: number;
  left: number;
  width: number;
  bars: number;
  beatsPerBar: number;
  ticks: TimelineBarTick[];
  skipped: boolean;
};

export type TimelineSong = {
  number: number;
  title: string;
  startBeat: number;
  endBeat: number;
  left: number;
  width: number;
  beatsPerBar: number;
  hasEnd: boolean;
};

export type TimelineGap = {
  startBeat: number;
  endBeat: number;
  left: number;
  width: number;
};

export type TimelineEnd = {
  song: number;
  songTitle: string;
  beat: number;
  x: number;
};

export type TimelineLoopRect = {
  left: number;
  width: number;
};

export type TimelineLayout = {
  songs: TimelineSong[];
  sections: TimelineSection[];
  gaps: TimelineGap[];
  ends: TimelineEnd[];
  totalWidth: number;
  setStartBeat: number;
  setEndBeat: number;
  beatToX(beat: number): number;
  xToBeat(x: number): number;
  loopRect(loop: Loop | null): TimelineLoopRect | null;
};

type BeatSpan = {
  startBeat: number;
  endBeat: number;
  startX: number;
  endX: number;
  beatsPerBar: number;
};

function beatsForSong(songMeters: Record<number, number>, songNumber: number): number {
  const value = songMeters[songNumber];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 4;
}

function sectionKind(section: Section): TimelineSectionKind {
  if (section.name === COUNT_OFF) return 'count-off';
  if (isPad(section.name)) return 'pad';
  return 'section';
}

function effectiveSongEnd(
  song: Song,
  nextSongStart: number | null,
  beatsPerBar: number,
  position: number | null,
): number {
  if (song.end !== null) return song.end;
  const firstStart = song.sections[0]?.time ?? 0;
  if (nextSongStart !== null && nextSongStart > firstStart + EPSILON) return nextSongStart;
  const lastSection = song.sections.at(-1);
  const lastStart = lastSection?.time ?? firstStart;
  const minEnd = lastStart + OPEN_END_MIN_BARS * beatsPerBar;
  if (position !== null && position >= lastStart - EPSILON) {
    const barsBeyond = Math.ceil((position - lastStart) / beatsPerBar + EPSILON) + 2;
    return Math.max(minEnd, lastStart + barsBeyond * beatsPerBar);
  }
  return minEnd;
}

export function buildTimeline(
  set: SetList,
  songMeters: Record<number, number>,
  position: number | null = null,
): TimelineLayout {
  const nonEmptySongs = set.songs.filter((song) => song.sections.length > 0);
  if (nonEmptySongs.length === 0) {
    return {
      songs: [],
      sections: [],
      gaps: [],
      ends: [],
      totalWidth: 0,
      setStartBeat: 0,
      setEndBeat: 0,
      beatToX: () => 0,
      xToBeat: () => 0,
      loopRect: () => null,
    };
  }

  const songBounds = nonEmptySongs.map((song, index) => {
    const bpb = beatsForSong(songMeters, song.number);
    const next = nonEmptySongs[index + 1];
    const nextBpb = next ? beatsForSong(songMeters, next.number) : bpb;
    const padStart = next ? (song.sections.find((section) => isPad(section.name))?.time ?? null) : null;
    const startBeat = song.sections[0]!.time;
    const nextStart = next?.sections[0]?.time ?? null;
    const endBeat = Math.max(startBeat, effectiveSongEnd(song, nextStart, bpb, position));
    return { song, bpb, nextBpb, padStart, startBeat, endBeat, nextStart };
  });

  const spans: BeatSpan[] = [];
  const gaps: TimelineGap[] = [];
  const setStartBeat = songBounds[0]!.startBeat;
  let cursorBeat = setStartBeat;
  let cursorX = 0;

  const pushSpan = (end: number, beatsPerBar: number) => {
    if (end <= cursorBeat + EPSILON) return;
    const width = ((end - cursorBeat) / beatsPerBar) * BAR_WIDTH_PX;
    spans.push({ startBeat: cursorBeat, endBeat: end, startX: cursorX, endX: cursorX + width, beatsPerBar });
    cursorBeat = end;
    cursorX += width;
  };

  for (const { bpb, nextBpb, padStart, startBeat, endBeat, nextStart } of songBounds) {
    if (startBeat > cursorBeat + EPSILON) {
      const gapWidth = ((startBeat - cursorBeat) / bpb) * BAR_WIDTH_PX;
      const span: BeatSpan = {
        startBeat: cursorBeat,
        endBeat: startBeat,
        startX: cursorX,
        endX: cursorX + gapWidth,
        beatsPerBar: bpb,
      };
      spans.push(span);
      gaps.push({
        startBeat: cursorBeat,
        endBeat: startBeat,
        left: cursorX,
        width: gapWidth,
      });
      cursorBeat = startBeat;
      cursorX += gapWidth;
    }

    // If the next song starts before this song ends (overlapping songs), cap this song's exclusive
    // ruler span at the next song's start so beat->x stays strictly monotonic and invertible.
    const rulerEnd =
      nextStart !== null && nextStart > cursorBeat + EPSILON && nextStart < endBeat - EPSILON
        ? nextStart
        : endBeat;

    pushSpan(padStart !== null && padStart < rulerEnd - EPSILON ? padStart : rulerEnd, bpb);
    pushSpan(rulerEnd, nextBpb);
  }

  const totalWidth = cursorX;
  const setEndBeat = cursorBeat;
  const firstBpb = songBounds[0]!.bpb;
  const lastBpb = songBounds.at(-1)!.bpb;

  const beatToX = (beat: number): number => {
    if (spans.length === 0) return 0;
    if (beat <= setStartBeat) {
      return ((beat - setStartBeat) / firstBpb) * BAR_WIDTH_PX || 0;
    }
    for (const span of spans) {
      if (beat <= span.endBeat + EPSILON) {
        const clamped = Math.max(span.startBeat, Math.min(span.endBeat, beat));
        return span.startX + ((clamped - span.startBeat) / span.beatsPerBar) * BAR_WIDTH_PX;
      }
    }
    return totalWidth + ((beat - setEndBeat) / lastBpb) * BAR_WIDTH_PX;
  };

  const xToBeat = (x: number): number => {
    if (spans.length === 0) return 0;
    if (x <= 0) {
      return setStartBeat + (x / BAR_WIDTH_PX) * firstBpb;
    }
    for (const span of spans) {
      if (x <= span.endX + EPSILON) {
        const ratio = span.endX > span.startX ? (x - span.startX) / (span.endX - span.startX) : 0;
        return span.startBeat + Math.max(0, Math.min(1, ratio)) * (span.endBeat - span.startBeat);
      }
    }
    return setEndBeat + ((x - totalWidth) / BAR_WIDTH_PX) * lastBpb;
  };

  const songs: TimelineSong[] = [];
  const sections: TimelineSection[] = [];
  const ends: TimelineEnd[] = [];

  for (const { song, bpb, nextBpb, padStart, startBeat, endBeat } of songBounds) {
    const songLeft = beatToX(startBeat);
    const songRight = beatToX(endBeat);
    const title = songTitle(song);
    songs.push({
      number: song.number,
      title,
      startBeat,
      endBeat,
      left: songLeft,
      width: Math.max(0, songRight - songLeft),
      beatsPerBar: bpb,
      hasEnd: song.end !== null,
    });

    if (song.end !== null) {
      ends.push({
        song: song.number,
        songTitle: title,
        beat: song.end,
        x: beatToX(song.end),
      });
    }

    song.sections.forEach((section, index) => {
      const sectionBpb = padStart !== null && section.time >= padStart - EPSILON ? nextBpb : bpb;
      const sectionEnd = section.end ?? endBeat;
      const left = beatToX(section.time);
      const right = beatToX(sectionEnd);
      const width = Math.max(0, right - left);
      const beatLength = Math.max(0, sectionEnd - section.time);
      const bars = Math.max(1, Math.ceil(beatLength / sectionBpb - EPSILON));

      const ticks: TimelineBarTick[] = [];
      for (let barIndex = 0; barIndex < bars; barIndex += 1) {
        const beat = section.time + barIndex * sectionBpb;
        if (beat >= sectionEnd - EPSILON && barIndex > 0) break;
        ticks.push({
          bar: barIndex + 1,
          beat,
          offsetX: Math.max(0, beatToX(beat) - left),
        });
      }

      sections.push({
        song: song.number,
        section: index,
        name: section.name,
        kind: sectionKind(section),
        time: section.time,
        end: sectionEnd,
        left,
        width,
        bars,
        beatsPerBar: sectionBpb,
        ticks,
        skipped: section.skip === true,
      });
    });
  }

  const loopRect = (loop: Loop | null): TimelineLoopRect | null => {
    if (!loop || loop.length <= 0) return null;
    const left = beatToX(loop.start);
    const right = beatToX(loop.start + loop.length);
    return { left, width: Math.max(0, right - left) };
  };

  return {
    songs,
    sections,
    gaps,
    ends,
    totalWidth,
    setStartBeat,
    setEndBeat,
    beatToX,
    xToBeat,
    loopRect,
  };
}
