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
