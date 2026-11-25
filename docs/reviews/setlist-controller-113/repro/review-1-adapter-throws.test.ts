import { afterEach, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Repro for docs/reviews/setlist-controller-113/pre-pr-review-1.md, finding 1. Copy into test/ to run.
// A target adapter that throws from cue or runButton must not take the server down: the other
// targets still get the cue, and the pages still hear of the change. Red now: vitest reports the
// adapter's error as an uncaught exception, and the good target never gets the Verse cue.

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const SONG: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

async function twoTargets() {
  const bad = fakeTarget({ name: 'bad', label: 'Bad', buttons: [{ id: 'next', label: 'Next' }] });
  bad.cue = () => {
    throw new Error('ADAPTER CUE BOOM');
  };
  bad.runButton = () => {
    throw new Error('ADAPTER BUTTON BOOM');
  };
  const good = fakeTarget({ name: 'good', label: 'Good' });
  rig = await startRig(SONG, { playing: true, position: 8 }, { targets: [bad, good] });
  const producer = await rig.connectProducer();
  const online = (s: ProducerSnapshot) => loaded(s) && s.connections.every((row) => row.connection === 'online');
  await producer.snapshot(online);
  for (const name of ['bad', 'good']) {
    const armed = producer.snapshot((s) => s.connections.find((row) => row.name === name)?.arm === 'armed');
    producer.send({ kind: 'arm', target: name });
    await armed;
  }
  return { bad, good, producer, rig };
}

it('a throwing cue leaves the other target cued and the pages told', async () => {
  const { good, producer, rig } = await twoTargets();
  const seen = producer.snapshot((s) => near(s.position, 16));
  rig.live.setPosition(16);
  await seen;
  expect(good.cues.map((cue) => cue.name)).toEqual(['Verse']);
});

it("a throwing Fire again or button run leaves the server answering", async () => {
  const { producer, rig } = await twoTargets();
  producer.send({ kind: 'fire-again', target: 'bad' });
  producer.send({ kind: 'run-button', target: 'bad', button: 'next' });
  const seen = producer.snapshot((s) => near(s.position, 20));
  rig.live.setPosition(20);
  await seen;
});
