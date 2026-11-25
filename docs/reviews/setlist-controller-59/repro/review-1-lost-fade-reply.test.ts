import { expect, it } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import { startFadeOut } from '../src/server/fade-out.ts';

// Repro for docs/reviews/setlist-controller-59/pre-pr-review-1.md, finding 4. Copy into test/ to run.

// Live answers the track list and one of two volume reads; the second reply never comes. A press a minute later should
// read the tracks again, not be ignored.
it('reads the tracks again on a press long after a volume reply was lost', () => {
  const clock = manualClock();
  const sent: string[] = [];
  const fade = startFadeOut({
    clock,
    requestTrackData: () => sent.push('track_data'),
    requestTrackVolume: (track) => sent.push(`get ${track}`),
    setTrackVolume: (track, volume) => sent.push(`set ${track} ${volume}`),
    stopPlaying: () => sent.push('stop'),
  });
  fade.fadeOut();
  fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, grouped: false }, { track: 1, grouped: false }] });
  fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });

  clock.advance(60_000);
  fade.fadeOut();

  expect(sent.filter((message) => message === 'track_data')).toHaveLength(2);
});
