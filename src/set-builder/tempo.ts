import type { Element } from './als.ts';
import type { Song } from './song.ts';

// Time through a song's own tempo map. Live holds the tempo between two events at different times as a straight ramp
// in BPM, beat by beat, from the first to the second, the model the stitched set's tempoReached uses. Several events at
// one time are an instant step: the first holds the tempo arriving there, and the last holds it going forward. After
// the last event the tempo holds.

// A tempo event: the beat it is at, and the tempo in BPM it holds there.
export type TempoPoint = { time: number; bpm: number };

// The seconds the song takes from beat `from` to beat `to` of its own, `from` at or before `to`.
export function secondsBetween(song: Song, from: number, to: number): number {
  return secondsThrough(tempoPoints(song.tempo), from, to);
}

// The tempo events of a main-track Tempo envelope, a song's or a built set's, as points in time order.
export function tempoPoints(events: readonly Element[]): TempoPoint[] {
  return events.map((event) => ({ time: Number(event.attributes.Time), bpm: Number(event.attributes.Value) }));
}

// The seconds from beat `from` to beat `to`, `from` at or before `to`, through the tempo map these points make.
export function secondsThrough(points: readonly TempoPoint[], from: number, to: number): number {
  let seconds = 0;
  points.forEach((point, index) => {
    const next = points[index + 1];
    // Of the events at one time, only the last starts a ramp.
    if (next && next.time === point.time) return;
    const start = Math.max(from, point.time);
    const end = Math.min(to, next?.time ?? Infinity);
    if (end <= start) return;
    const bpmAt = (beat: number) => (next ? point.bpm + ((beat - point.time) / (next.time - point.time)) * (next.bpm - point.bpm) : point.bpm);
    seconds += rampSeconds(end - start, bpmAt(start), bpmAt(end));
  });
  return seconds;
}

// The seconds `beats` take on a straight ramp from `startBpm` to `endBpm`.
function rampSeconds(beats: number, startBpm: number, endBpm: number): number {
  if (startBpm === endBpm) return (beats * 60) / startBpm;
  return (beats * 60 * Math.log(endBpm / startBpm)) / (endBpm - startBpm);
}
