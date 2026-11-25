import { afterEach, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { fakeTarget } from './fake-target.ts';
import { startRig, type Rig } from './harness.ts';

// Repro for docs/reviews/setlist-controller-113/pre-pr-review-1.md, findings 5 and 6. Copy into
// test/ to run. Red now: a stop that rejects makes the server's close reject before the hub, the
// bridge and HTTP close, and a start that never settles keeps startServer from resolving.

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close().catch(() => {});
  rig = undefined;
});

const SONG: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 16 },
];

it("a target whose stop rejects does not stop the server's close", async () => {
  const target = fakeTarget({ name: 'bad', label: 'Bad' });
  target.stop = async () => {
    throw new Error('ADAPTER STOP BOOM');
  };
  const started = await startRig(SONG, {}, { targets: [target] });
  await expect(started.close()).resolves.toBeUndefined();
});

it('a target whose start never settles does not hold the server back', async () => {
  const target = fakeTarget({ name: 'slow', label: 'Slow' });
  target.start = () => new Promise<void>(() => {});
  const timeout = new Promise<'timed out'>((resolve) => setTimeout(() => resolve('timed out'), 3000));
  const result = await Promise.race([startRig(SONG, {}, { targets: [target] }), timeout]);
  expect(result).not.toBe('timed out');
  if (result !== 'timed out') rig = result;
});
