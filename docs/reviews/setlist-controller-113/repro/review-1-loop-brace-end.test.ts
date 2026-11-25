import { afterEach, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Repro for docs/reviews/setlist-controller-113/pre-pr-review-1.md, finding 2. Copy into test/ to run.
// A position report on a loop's brace end, or a hair before it, is the loop going round, as the
// controller already reads it for a loop ending on End. It must raise no cue for the section after
// the brace, and must not bring back the targets a Fade out paused. Red now on both cases.

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;
const BEFORE = (end: number) => Math.fround(end - 0.00005);

async function armed(cuePoints: CuePoint[], position: number, pausesOnFade: boolean) {
  const target = fakeTarget({ name: 'slides', label: 'Slides', pausesOnFade });
  rig = await startRig(cuePoints, { playing: true, position }, { targets: [target] });
  const producer = await rig.connectProducer();
  const leader = await rig.connectLeader();
  await producer.snapshot((s) => loaded(s) && s.connections[0]?.connection === 'online' && near(s.position, position));
  await leader.snapshot(loaded);
  const next = (matches: (s: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((s) => producer.received.indexOf(s) >= start && matches(s));
  };
  const arm = next((s) => s.connections[0]?.arm === 'armed');
  producer.send({ kind: 'arm', target: 'slides' });
  await arm;
  const moveTo = async (beats: number) => {
    const seen = next((s) => near(s.position, beats));
    rig!.live.setPosition(beats);
    await seen;
  };
  return { target, next, leader, moveTo };
}

it('a wrap reported on the brace end of a mid-song loop fires only the loop', async () => {
  const SONG: CuePoint[] = [
    { name: '1 - Intro', time: 0 },
    { name: '1 - Verse', time: 16 },
    { name: '1 - Chorus', time: 32 },
    { name: '1 - End', time: 48 },
  ];
  const { target, next, leader, moveTo } = await armed(SONG, 20, false);
  const looped = next((s) => s.loop?.section?.section === 1);
  leader.send({ kind: 'loop' });
  await looped;
  await moveTo(BEFORE(32));
  await moveTo(16.5);
  expect(target.cues.map((cue) => `${cue.name} ${cue.cause}`)).toEqual(['Verse loop']);
});

it("a wrap reported on the brace end of an overlapped last section leaves a faded target paused", async () => {
  const TWO_SONGS: CuePoint[] = [
    { name: '1 - Count Off (Grace)', time: 0 },
    { name: '1 - Verse', time: 8 },
    { name: '1 - Chorus', time: 24 },
    { name: '1 - End', time: 40 },
    { name: '2 - Count Off (Trust)', time: 40 },
    { name: '2 - Verse', time: 48 },
    { name: '2 - End', time: 64 },
  ];
  const { target, next, leader, moveTo } = await armed(TWO_SONGS, 28, true);
  const looped = next((s) => s.loop?.section?.section === 2);
  leader.send({ kind: 'loop' });
  await looped;
  const faded = next((s) => s.connections[0]?.pause === 'fade-out');
  leader.send({ kind: 'fade-out' });
  await faded;
  await moveTo(BEFORE(40));
  await moveTo(25);
  await moveTo(26);
  expect(target.cues).toEqual([]);
});
