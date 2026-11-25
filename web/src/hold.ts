import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

// A press that must be held to count, as the leader's Stop is, so a brush of the screen never
// stops a song.

export const STOP_HOLD_MS = 1000;

export type Hold = {
  // Starts the hold. A second press while held changes nothing.
  press(): void;
  // Ends the hold. Before the time is up, nothing happens.
  release(): void;
};

// Calls onComplete once a press has been held for `ms`, unless it is released first.
export function createHold(ms: number, onComplete: () => void): Hold {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    press() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        onComplete();
      }, ms);
    },
    release() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

// onComplete must keep its identity across renders, as a useCallback gives it: a new one rebuilds
// the hold and drops a press under way.
export function useHold(enabled: boolean, onComplete: () => void) {
  const [holding, setHolding] = useState(false);
  const hold = useRef<Hold | null>(null);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    setHolding(false);
  }

  useEffect(() => {
    if (!enabled) return;
    const created = createHold(STOP_HOLD_MS, () => {
      setHolding(false);
      onComplete();
    });
    hold.current = created;
    return () => {
      created.release();
      hold.current = null;
    };
  }, [enabled, onComplete]);

  const press = () => {
    if (!enabled) return;
    hold.current?.press();
    setHolding(true);
  };
  const release = () => {
    hold.current?.release();
    setHolding(false);
  };
  const isHoldKey = (event: KeyboardEvent) => event.key === ' ' || event.key === 'Enter';

  return {
    holding: enabled && holding,
    handlers: {
      onPointerDown: (event: PointerEvent) => {
        if (event.button === 0) press();
      },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
      onKeyDown: (event: KeyboardEvent) => {
        if (!isHoldKey(event)) return;
        event.preventDefault();
        if (!event.repeat) press();
      },
      onKeyUp: (event: KeyboardEvent) => {
        if (isHoldKey(event)) release();
      },
      onBlur: release,
      // A long press on the iPad would open the callout menu.
      onContextMenu: (event: { preventDefault(): void }) => event.preventDefault(),
    },
  };
}
