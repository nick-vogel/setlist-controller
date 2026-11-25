import { useCallback } from 'react';
import type { Command } from '../../src/shared/command.ts';
import { useHold } from './hold.ts';

// Timeline view's Pause button. While Safe Mode is on, it requires a one-second press-and-hold
// matching Setlist view's Stop so a stray tap cannot stop the band mid-song. While Safe Mode is
// off, a single tap stops Live immediately for fast rehearsal.

export function TimelinePauseButton({
  available,
  safeMode,
  send,
}: {
  available: boolean;
  safeMode: boolean;
  send(command: Command): void;
}) {
  const { holding, handlers } = useHold(
    safeMode && available,
    useCallback(() => send({ kind: 'stop' }), [send]),
  );

  if (!safeMode) {
    return (
      <button
        type="button"
        className={['timeline-pause', !available && 'unavailable'].filter(Boolean).join(' ')}
        disabled={!available}
        onClick={() => send({ kind: 'stop' })}
      >
        Pause
      </button>
    );
  }

  return (
    <button
      type="button"
      className={['timeline-pause', 'hold-required', holding && 'holding', !available && 'unavailable'].filter(Boolean).join(' ')}
      disabled={!available}
      {...handlers}
    >
      <span className="stop-fill" aria-hidden="true" />
      <span className="timeline-pause-label">Pause</span>
      <span className="timeline-pause-hint">Hold to pause</span>
    </button>
  );
}
