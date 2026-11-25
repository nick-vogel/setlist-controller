import { expect, it, vi } from 'vitest';
import { atemKind, type SwitcherClient } from '../src/server/atem.ts';
import { manualClock } from '../src/server/clock.ts';
import type { Target } from '../src/server/target.ts';

// Repro for docs/reviews/setlist-controller-114/pre-pr-review-5.md, finding 1. Copy into test/ to run.
// A connect again is in flight when the switcher client gives up, so the give-up schedules another
// connect again. The in-flight connect then resolves and clears the reason, but the scheduled one
// still fires: the adapter connects a third time after a connect resolved. Red now: connects is 3.

it('connects no more once a connect resolves after a give-up that came while it was in flight', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const clock = manualClock();
  const gaveUp: ((reason: string) => void)[] = [];
  let connects = 0;
  let release = () => {};
  const client: SwitcherClient = {
    connect: () => {
      connects += 1;
      if (connects === 1) return Promise.reject(new Error('Could not start the socket process'));
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    close: () => Promise.resolve(),
    onConnection: () => {},
    onGaveUp: (listener) => void gaveUp.push(listener),
    onProgram: () => {},
    programInput: () => null,
    inputs: () => [],
    info: () => null,
    changeProgramInput: () => Promise.resolve(),
  };
  const built = atemKind({ client: () => client, clock }).create({ host: '192.168.10.240', pro: 1, camera: 2 });
  if (!('target' in built)) throw new Error('the section was rejected');
  const target: Target = built.target;
  let problem: string | null = null;
  await target.start({
    status: () => {},
    changedByHand: () => {},
    state: () => {},
    problem: (next) => void (problem = next),
  });

  clock.advance(5000);
  for (const listener of gaveUp) listener('The socket process did not answer');
  release();
  await Promise.resolve();
  await Promise.resolve();
  const resolved = { problem, connects };
  clock.advance(5000);
  await Promise.resolve();

  expect({ resolved, connects }).toEqual({ resolved: { problem: null, connects: 2 }, connects: 2 });
  await target.stop();
});
