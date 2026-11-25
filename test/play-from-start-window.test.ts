import { expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { startPlaybackController } from '../src/server/playback-controller.ts';

// Live's reports follow the commands in order, so a start's report can land after a stop is sent and
// before the stop's own report. The fake Live releases held replies all at once, so no press can come
// between them at seam 1; this drives the controller directly.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 32 },
  { name: '2 - Intro', time: 40 },
  { name: '2 - Verse', time: 48 },
  { name: '2 - End', time: 64 },
];

it("plays from the locator when a start's report lands between a Stop and the press", () => {
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
      fadeIn: () => {},
      countOff: () => {},
    },
    manualClock(),
  );
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'cue-points', cuePoints: SET });
  controller.fromLive({ kind: 'position', beats: 8 });

  controller.command({ kind: 'play-from-start', song: 1 });
  controller.command({ kind: 'stop' });
  controller.fromLive({ kind: 'playing', playing: true });
  controller.command({ kind: 'play-from-start', song: 2 });

  expect(sent).toEqual(['jump 0', 'start', 'stop', 'jump 3', 'start']);
});

it('waits for the bar line on a second press once Live reports the start the first press sent', () => {
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
      fadeIn: () => {},
      countOff: () => {},
    },
    manualClock(),
  );
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'cue-points', cuePoints: SET });
  controller.fromLive({ kind: 'playing', playing: true });
  controller.fromLive({ kind: 'position', beats: 8 });

  controller.command({ kind: 'stop' });
  controller.fromLive({ kind: 'playing', playing: false });
  controller.command({ kind: 'stop' });
  controller.command({ kind: 'play-from-start', song: 1 });
  controller.fromLive({ kind: 'playing', playing: true });
  controller.command({ kind: 'play-from-start', song: 2 });

  expect(sent).toEqual(['stop', 'stop', 'jump 0', 'start', 'jump 3', 'continue']);
});
