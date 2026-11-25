import { expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { cueBeat, startCues, type Cue } from '../src/server/cues.ts';
import { startPlaybackController, type PlaybackController } from '../src/server/playback-controller.ts';

// Repro for docs/reviews/setlist-controller-115/pre-pr-review-1.md, finding 1. Copy into test/ to run.
// Wires the real controller, cues and due time as src/server/server.ts does, and drives Live's reports
// by hand, since the fake Live cannot report a start before the jump it was sent with. Live sits
// stopped on song 3's Verse at 100. The leader presses Play from start for song 2, then for song 1,
// before Live reports anything; Live reports the start first, then the playhead on song 2's Intro.
// The cues module raises the Verse of song 3 from where the start was, 35.75 beats ahead of the
// playhead, and the due time puts its beat 17875 ms in the future. Red now: the lateness is -17875.
// Green once a cue whose beat lies ahead of the last report is left unmeasured.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 48 },
  { name: '2 - Intro', time: 64 },
  { name: '2 - Verse', time: 80 },
  { name: '2 - End', time: 92 },
  { name: '3 - Intro', time: 96 },
  { name: '3 - Verse', time: 100 },
  { name: '3 - End', time: 120 },
];

it('leaves a cue raised ahead of the playhead unmeasured, never negative', () => {
  const clock = manualClock();
  const measured: { cue: Cue; late: number | null }[] = [];
  const dueOf = (cue: Cue) => {
    const { set, loop, position } = controller.snapshot();
    const beat = set && cueBeat(set, cue, loop, position);
    return beat === null ? null : controller.dueAt(beat);
  };
  const cues = startCues((cue) => {
    const due = dueOf(cue);
    measured.push({ cue, late: due === null ? null : clock.now() - due });
  });
  const noop = () => {};
  const controller: PlaybackController = startPlaybackController(
    {
      onChange: (state) => cues.observe(state),
      jump: noop,
      continuePlaying: noop,
      startPlaying: noop,
      stopPlaying: noop,
      loopOn: noop,
      loopOff: noop,
      requestCuePoints: noop,
      fadeOut: noop,
      fadeIn: noop,
      countOff: noop,
    },
    clock,
  );
  const command = (song: number) => {
    cues.command({ kind: 'play-from-start', song });
    controller.command({ kind: 'play-from-start', song });
  };
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'cue-points', cuePoints: SET });
  controller.fromLive({ kind: 'position', beats: 100 });

  command(2);
  command(1);
  controller.fromLive({ kind: 'playing', playing: true });
  controller.fromLive({ kind: 'position', beats: 64.25 });

  const negative = measured.filter(({ late }) => late !== null && late < 0);
  expect(negative.map(({ cue, late }) => `${cue.song}/${cue.name} ${cue.cause} ${late}`)).toEqual([]);
});
