import { describe, expect, it } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import { startFadeOut } from '../src/server/fade-out.ts';

// Repro for docs/reviews/setlist-controller-59/pre-pr-review-2.md, finding 1. Copy into test/ to run. Green at HEAD;
// each test goes red under its own mutation in repro/, which test/fade-out.test.ts does not catch.

function fadeAlone() {
  const clock = manualClock();
  const sent: string[] = [];
  const fade = startFadeOut({
    clock,
    requestTrackData: () => sent.push('track_data'),
    requestTrackVolume: (track) => sent.push(`get ${track}`),
    setTrackVolume: (track, volume) => sent.push(`set ${track} ${volume}`),
    stopPlaying: () => sent.push('stop'),
  });
  return { clock, sent, fade };
}

const tracks = (...ids: number[]) => ({ kind: 'track-data' as const, tracks: ids.map((track) => ({ track, grouped: false })) });

describe('review 2 finding 1', () => {
  it('a volume reply that arrives after close starts no fade (red under review-2-mutation-close-keeps-state.diff)', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive(tracks(0, 1));
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    fade.close();
    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
    clock.advance(6000);
    expect(sent).toEqual(['track_data', 'get 0', 'get 1']);
  });

  it('Live stopping after a close mid-fade sends no second restore (red under review-2-mutation-close-keeps-state.diff)', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive(tracks(0));
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    clock.advance(1000);
    fade.close();
    sent.length = 0;
    fade.fromLive({ kind: 'playing', playing: false } as never);
    fade.cancel();
    expect(sent).toEqual([]);
  });

  it('the read deadline counts from the press, not the track list reply (red under review-2-mutation-since-reset-on-track-list.diff)', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    clock.advance(600);
    fade.fromLive(tracks(0, 1));
    clock.advance(500);
    fade.fadeOut();
    expect(sent).toEqual(['track_data', 'get 0', 'get 1', 'track_data']);
  });

  it('a press soon after a re-read press is ignored (red under review-2-mutation-repress-keeps-since.diff)', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    clock.advance(1500);
    fade.fadeOut();
    clock.advance(100);
    fade.fadeOut();
    expect(sent).toEqual(['track_data', 'track_data']);
  });
});
