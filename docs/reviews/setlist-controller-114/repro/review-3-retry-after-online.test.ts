import { expect, it, vi } from 'vitest';
import { atemKind, type SwitcherClient } from '../src/server/atem.ts';
import { manualClock } from '../src/server/clock.ts';
import type { Target } from '../src/server/target.ts';

// Repro for docs/reviews/setlist-controller-114/pre-pr-review-3.md, finding 1. Copy into test/ to run.
// A connect that rejects schedules a connect again in 5 seconds. When the switcher client comes online
// on its own before then, as the library's restarted handler can make it, the row is online with the
// connect's reason still on it, and the adapter connects again on a live client. Red now:
// the problem while online is the reason, and connects is 2.

it('drops the reason and the connect again once the ATEM comes online on its own', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const clock = manualClock();
  const connection: ((connected: boolean) => void)[] = [];
  let connects = 0;
  const client: SwitcherClient = {
    connect: () => {
      connects += 1;
      return connects === 1 ? Promise.reject(new Error('Could not start the socket process')) : Promise.resolve();
    },
    close: () => Promise.resolve(),
    onConnection: (listener) => void connection.push(listener),
    onProgram: () => {},
    programInput: () => 1,
    inputs: () => [],
    info: () => null,
    changeProgramInput: () => Promise.resolve(),
  };
  const built = atemKind({ client: () => client, clock }).create({ host: '192.168.10.240', pro: 1, camera: 2 });
  if (!('target' in built)) throw new Error('the section was rejected');
  const target: Target = built.target;
  let status = 'offline';
  let problem: string | null = null;
  await target.start({
    status: (next) => void (status = next),
    changedByHand: () => {},
    state: () => {},
    problem: (next) => void (problem = next),
  });

  for (const listener of connection) listener(true);
  const online = { status, problem };
  clock.advance(5000);
  await Promise.resolve();

  expect({ online, connects }).toEqual({ online: { status: 'online', problem: null }, connects: 1 });
  await target.stop();
});
