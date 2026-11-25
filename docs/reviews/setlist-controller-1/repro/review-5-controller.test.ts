// Repro for docs/reviews/setlist-controller-1/pre-pr-review-5.md, findings 1 and 2. Copy into test/ to run:
//   cp docs/reviews/setlist-controller-1/repro/review-5-controller.test.ts test/ && pnpm exec vitest run test/review-5-controller.test.ts; rm test/review-5-controller.test.ts
// Finding 1's case is green at c41b49a and red with `forgetStop()` removed from the lost-connection branch.
// Finding 2's two cases are red at c41b49a: the second press sends start_playing to a Live the first one started.
import { expect, it } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import { startPlaybackController } from '../src/server/playback-controller.ts';

const CUES = [
  { name: '1 - Intro', time: 0 }, { name: '1 - Verse', time: 16 }, { name: '1 - End', time: 32 },
  { name: '2 - Intro', time: 40 }, { name: '2 - Verse', time: 48 }, { name: '2 - End', time: 64 },
];

const start = () => {
  const sent: string[] = [];
  const controller = startPlaybackController(
    {
      onChange: () => {},
      jump: (cue) => sent.push(`jump ${cue}`),
      continuePlaying: () => sent.push('continue'),
      startPlaying: () => sent.push('start'),
      stopPlaying: () => sent.push('stop'),
      loopOn: () => {},
      loopOff: () => {},
      requestCuePoints: () => {},
      fadeOut: () => {},
    },
    manualClock(),
  );
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'cue-points', cuePoints: CUES });
  return { controller, sent };
};

it('finding 1: a lost connection ends a pending stop, so a playing Live after reconnecting takes the playing branch', () => {
  const { controller, sent } = start();
  controller.fromLive({ kind: 'playing', playing: true });
  controller.fromLive({ kind: 'position', beats: 8 });
  controller.command({ kind: 'stop' });
  controller.fromLive({ kind: 'connection', connected: false });
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'playing', playing: true });
  controller.fromLive({ kind: 'position', beats: 8 });

  controller.command({ kind: 'play-from-start', song: 2 });

  expect(sent).toEqual(['stop', 'jump 3', 'continue']);
});

it('finding 2: a second Play from start while stopped, before Live reports the first start, does not send start_playing again', () => {
  const { controller, sent } = start();
  controller.fromLive({ kind: 'position', beats: 8 });

  controller.command({ kind: 'play-from-start', song: 1 });
  controller.command({ kind: 'play-from-start', song: 2 });

  expect(sent).toEqual(['jump 0', 'start', 'jump 3', 'continue']);
});

it("finding 2: Stop, Play from start, the stop's late report, then a second Play from start does not send start_playing again", () => {
  const { controller, sent } = start();
  controller.fromLive({ kind: 'playing', playing: true });
  controller.fromLive({ kind: 'position', beats: 8 });

  controller.command({ kind: 'stop' });
  controller.command({ kind: 'play-from-start', song: 1 });
  controller.fromLive({ kind: 'playing', playing: false });
  controller.command({ kind: 'play-from-start', song: 2 });

  expect(sent).toEqual(['stop', 'jump 0', 'start', 'jump 3', 'continue']);
});
