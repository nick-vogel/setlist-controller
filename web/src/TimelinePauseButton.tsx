import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Command } from '../../src/shared/command.ts';
import { createHold, STOP_HOLD_MS, type Hold } from './hold.ts';

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
  const [holding, setHolding] = useState(false);
  const hold = useRef<Hold | null>(null);
  const guarded = safeMode && available;
  const [wasGuarded, setWasGuarded] = useState(guarded);
  if (wasGuarded !== guarded) {
    setWasGuarded(guarded);
    setHolding(false);
  }

  useEffect(() => {
    if (!safeMode || !available) {
      hold.current?.release();
      hold.current = null;
      return;
    }
    const created = createHold(STOP_HOLD_MS, () => {
      setHolding(false);
      send({ kind: 'stop' });
    });
    hold.current = created;
    return () => {
      created.release();
      hold.current = null;
    };
  }, [available, safeMode, send]);

  const activeHold = safeMode && available && holding;

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

  const press = () => {
    if (!available) return;
    hold.current?.press();
    setHolding(true);
  };
  const release = () => {
    hold.current?.release();
    setHolding(false);
  };
  const isHoldKey = (event: KeyboardEvent) => event.key === ' ' || event.key === 'Enter';

  return (
    <button
      type="button"
      className={['timeline-pause', 'hold-required', activeHold && 'holding', !available && 'unavailable'].filter(Boolean).join(' ')}
      disabled={!available}
      onPointerDown={(event: PointerEvent) => {
        if (event.button === 0) press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onKeyDown={(event) => {
        if (!isHoldKey(event)) return;
        event.preventDefault();
        if (!event.repeat) press();
      }}
      onKeyUp={(event) => {
        if (isHoldKey(event)) release();
      }}
      onBlur={release}
      // A long press on the iPad would open the callout menu.
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="stop-fill" aria-hidden="true" />
      <span className="timeline-pause-label">Pause</span>
      <span className="timeline-pause-hint">Hold to pause</span>
    </button>
  );
}
