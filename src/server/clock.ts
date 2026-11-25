// The server's sense of time, so a test can move it instead of waiting on it.

export type Clock = {
  // Milliseconds, from any fixed start.
  now(): number;
  // Calls tick every ms milliseconds. Returns the function that stops it.
  every(ms: number, tick: () => void): () => void;
};

export const realClock: Clock = {
  now: () => performance.now(),
  every(ms, tick) {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  },
};

export type ManualClock = Clock & {
  // Moves the time on by ms and fires every tick that falls due on the way, in time order, so one
  // advance(4000) fires a 1-second tick four times.
  advance(ms: number): void;
  // Moves the time on by ms as an event loop blocked that long does: every tick that fell due fires
  // once, late, and the next comes a full interval after it, as setInterval does after a stall.
  stall(ms: number): void;
};

export function manualClock(): ManualClock {
  let time = 0;
  const timers = new Set<{ due: number; ms: number; tick: () => void }>();

  return {
    now: () => time,
    every(ms, tick) {
      const timer = { due: time + ms, ms, tick };
      timers.add(timer);
      return () => timers.delete(timer);
    },
    advance(ms) {
      const until = time + ms;
      for (;;) {
        let next: { due: number; ms: number; tick: () => void } | undefined;
        for (const timer of timers) if (timer.due <= until && (!next || timer.due < next.due)) next = timer;
        if (!next) break;
        time = next.due;
        next.due += next.ms;
        next.tick();
      }
      time = until;
    },
    stall(ms) {
      time += ms;
      for (const timer of [...timers]) {
        if (timer.due > time) continue;
        timer.due = time + timer.ms;
        timer.tick();
      }
    },
  };
}
