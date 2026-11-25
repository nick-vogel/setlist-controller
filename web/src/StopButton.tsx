import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Command } from '../../src/shared/command.ts';
import { createHold, STOP_HOLD_MS, type Hold } from './hold.ts';

// The leader's Stop. It sends a stop only after a full second's press, with a bar that fills over
// the hold. Letting go early, or sliding off the button, sends nothing and empties the bar.

export function StopButton({ available, send }: { available: boolean; send(command: Command): void }) {
  const [holding, setHolding] = useState(false);
  const hold = useRef<Hold | null>(null);

  useEffect(() => {
    const created = createHold(STOP_HOLD_MS, () => {
      setHolding(false);
      send({ kind: 'stop' });
    });
    hold.current = created;
    return () => {
      created.release();
      hold.current = null;
    };
  }, [send]);

  const press = () => {
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
      className={['stop', holding && 'holding', !available && 'unavailable'].filter(Boolean).join(' ')}
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
      <span className="stop-label">Stop</span>
      <span className="stop-hint">Hold to stop</span>
    </button>
  );
}
