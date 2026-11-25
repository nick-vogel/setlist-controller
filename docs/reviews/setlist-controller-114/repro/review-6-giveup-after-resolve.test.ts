import { expect, it, vi } from 'vitest';
import { atemKind, type SwitcherClient } from '../src/server/atem.ts';
import { manualClock } from '../src/server/clock.ts';
import type { Target } from '../src/server/target.ts';

// Repro for docs/reviews/setlist-controller-114/pre-pr-review-6.md, finding 1. Copy into test/ to run.
// A connect again is in flight when the switcher client gives up; the connect then resolves and cancels
// the connect again the give-up scheduled. A later give-up must schedule a connect again of its own.
// Green at HEAD; red with repro/review-6-mutation-resolve-keeps-retry.diff applied: connects stays 2.

it('connects again after a later give-up, once a resolved connect cancelled the one before it', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const clock = manualClock();
  const gaveUp: ((reason: string) => void)[] = [];
  let connects = 0;
  let release = () => {};
  const client: SwitcherClient = {
    connect: () => {
      connects += 1;
      if (connects === 1) return Promise.reject(new Error('Could not start the socket process'));
      if (connects === 2) {
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve();
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
  for (const listener of gaveUp) listener('The socket process did not answer');
  const later = { problem, connects };
  clock.advance(5000);
  await Promise.resolve();

  expect({ later, connects }).toEqual({
    later: { problem: 'The ATEM could not connect: The socket process did not answer.', connects: 2 },
    connects: 3,
  });
  await target.stop();
});
