import { expect, it } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import { startFadeOut } from '../src/server/fade-out.ts';

// Repro for docs/reviews/setlist-controller-59/pre-pr-review-5.md, finding 1. Copy into test/ to run.

// Live goes away 1 s into the fade's steps and never answers again. The kept restore expires KEPT_RESTORE_MS (10 min)
// after the loss, so a server that closes later than that should send none of the old set's volumes.
it('sends no saved volume when the server closes more than KEPT_RESTORE_MS after Live went away mid-fade', () => {
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
  fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, name: 'Track 0', grouped: false }, { track: 1, name: 'Track 1', grouped: false }] });
  fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
  fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
  clock.advance(1000);
  fade.fromLive({ kind: 'connection', connected: false });
  clock.advance(10 * 60 * 1000 + 1);
  sent.length = 0;

  fade.close();

  expect(sent).toEqual([]);
});
