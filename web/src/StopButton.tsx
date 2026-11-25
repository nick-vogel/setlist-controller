import { useCallback } from 'react';
import type { Command } from '../../src/shared/command.ts';
import { useHold } from './hold.ts';

// The leader's Stop. It sends a stop only after a full second's press, with a bar that fills over
// the hold. Letting go early, or sliding off the button, sends nothing and empties the bar.

export function StopButton({ available, send }: { available: boolean; send(command: Command): void }) {
  const { holding, handlers } = useHold(
    true,
    useCallback(() => send({ kind: 'stop' }), [send]),
  );

  return (
    <button
      type="button"
      className={['stop', holding && 'holding', !available && 'unavailable'].filter(Boolean).join(' ')}
      disabled={!available}
      {...handlers}
    >
      <span className="stop-fill" aria-hidden="true" />
      <span className="stop-label">Stop</span>
      <span className="stop-hint">Hold to stop</span>
    </button>
  );
}
