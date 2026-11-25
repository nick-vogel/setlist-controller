// Repro for docs/reviews/setlist-controller-1/pre-pr-review-4.md, finding 3. Copy into test/ to run.
// Drives the controller directly to pin the window; the remediating test belongs at seam 1.
import { expect, it } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import { startPlaybackController } from '../src/server/playback-controller.ts';

const CUES = [
  { name: '1 - Intro', time: 0 }, { name: '1 - Verse', time: 16 }, { name: '1 - End', time: 32 },
  { name: '2 - Intro', time: 40 }, { name: '2 - Verse', time: 48 }, { name: '2 - End', time: 64 },
];

it('play from start pressed after Stop, before Live reports the stop, plays from the locator with start_playing', () => {
  const sent: string[] = [];
  const controller = startPlaybackController(
    {
      onChange: () => {},
      jump: (cue) => sent.push(`jump ${cue}`),
      continuePlaying: () => sent.push('continue'),
      startPlaying: () => sent.push('start'),
      stopPlaying: () => sent.push('stop'),
      loopOn: (start, length) => sent.push(`loopOn ${start} ${length}`),
      loopOff: () => sent.push('loopOff'),
      requestCuePoints: () => {},
      fadeOut: () => sent.push('fade'),
    },
    manualClock(),
  );
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'cue-points', cuePoints: CUES });
  controller.fromLive({ kind: 'playing', playing: true });
  controller.fromLive({ kind: 'position', beats: 20 });
  controller.command({ kind: 'stop' });
  controller.command({ kind: 'play-from-start', song: 2 });
  controller.fromLive({ kind: 'playing', playing: false });
  expect(sent).toEqual(['stop', 'jump 3', 'start']);
});
