import { describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { startPlaybackController } from '../src/server/playback-controller.ts';

// Repros for docs/reviews/setlist-controller-1/pre-pr-review-2.md, findings 1 and 2. Copy into test/ to run. They drive
// the controller directly, so they prove the mechanism; the regression tests belong at seam 1, per each brief.

// Song 1: Intro 0-16, Verse 16-48, Bridge 48-64, End 64. Song 2 starts on song 1's End.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Bridge', time: 48 },
  { name: '1 - End', time: 64 },
  { name: '2 - Intro', time: 64 },
  { name: '2 - End', time: 96 },
];

function rig(cuePoints: CuePoint[] = SET) {
  const out: string[] = [];
  const controller = startPlaybackController({
    onChange: () => {},
    jump: (cue) => out.push(`jump ${cue}`),
    continuePlaying: () => out.push('continue'),
    stopPlaying: () => out.push('stop'),
    loopOn: (start, length) => out.push(`loopOn ${start} ${length}`),
    loopOff: () => out.push('loopOff'),
    requestCuePoints: () => out.push('read'),
  });
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'cue-points', cuePoints });
  controller.fromLive({ kind: 'playing', playing: true });
  const at = (beats: number) => controller.fromLive({ kind: 'position', beats });
  return { controller, out, at };
}
const stops = (out: string[]) => out.filter((entry) => entry === 'stop').length;

describe('review 2 finding 1: one stop when playback and the End jump both reach End', () => {
  it('End on the bar grid, Next in the last bar, two reports past End before Live stops', () => {
    const { controller, out, at } = rig();
    at(61);
    controller.command({ kind: 'next' });
    at(62);
    at(63);
    at(64);
    at(64.5);
    expect(stops(out)).toBe(1);
  });

  it('End off the bar grid, Next less than a bar before End', () => {
    const { controller, out, at } = rig([
      { name: '1 - Intro', time: 0 },
      { name: '1 - Bridge', time: 48 },
      { name: '1 - End', time: 62 },
    ]);
    at(59);
    controller.command({ kind: 'next' });
    at(61);
    at(62);
    at(63);
    expect(stops(out)).toBe(1);
  });
});

describe('review 2 finding 2: Loop after Next to End braces nothing', () => {
  it('Next on the last section while playing, then Loop', () => {
    const { controller, out, at } = rig();
    at(53);
    controller.command({ kind: 'next' });
    controller.command({ kind: 'loop' });
    expect(out.filter((entry) => entry.startsWith('loopOn'))).toEqual([]);
  });
});
