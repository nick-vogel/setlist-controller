import { afterEach, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// Repro for docs/reviews/setlist-controller-113/pre-pr-review-3.md, finding 1. Copy into test/ to run.
// After Live reconnects with the playhead in the first section of a song with no Count Off, the
// controller says the music comes back, and no cue follows that report to settle the word. A later
// Fade out and a jump back onto that first section then arm the faded target again while the music
// is still faded. Red at HEAD 8200421 on the first case; the second, the same sequence on a song
// with a Count Off, is red at the merge-base ef4a914 too (the pre-existing half).

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const BEAT_MS = 500;
const JUMP = '/live/song/cue_point/jump';
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

const NO_COUNT_OFF: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - Chorus', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Verse (Trust)', time: 40 },
  { name: '2 - Chorus', time: 56 },
  { name: '2 - End', time: 72 },
];

const TWO_SONGS: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - Chorus', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Count Off (Trust)', time: 40 },
  { name: '2 - Verse', time: 48 },
  { name: '2 - End', time: 64 },
];

async function reconnectFadeAndRestart(cuePoints: CuePoint[]) {
  const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
  rig = await startRig(cuePoints, { playing: true, position: 12 }, { targets: [fading] });
  const producer = await rig.connectProducer();
  const leader = await rig.connectLeader();
  const row = (snapshot: ProducerSnapshot) => snapshot.connections.find((candidate) => candidate.name === 'fading');
  const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
  };
  await producer.snapshot((snapshot) => loaded(snapshot) && row(snapshot)?.connection === 'online');
  await leader.snapshot(loaded);
  const armed = next((snapshot) => row(snapshot)?.arm === 'armed');
  producer.send({ kind: 'arm', target: 'fading' });
  await armed;

  const play = (beats: number, landsOn: number) => {
    const seen = next((snapshot) => near(snapshot.position, landsOn));
    rig!.live.advance(beats * BEAT_MS);
    return seen;
  };

  // Live drops, the bridge reports it lost after 4 seconds, and Live comes back with the playhead in
  // song 2's first section, at 41, playing.
  await rig.stopLive();
  rig.clock.advance(4000);
  await rig.startLive({ position: 41, playing: true });
  rig.clock.advance(1000);
  await play(1, 42);

  const faded = next((snapshot) => row(snapshot)?.pause === 'fade-out');
  leader.send({ kind: 'fade-out' });
  await faded;

  // Previous restarts song 2's first section, at 40, on the bar line at 44.
  const waiting = next((snapshot) => snapshot.jump?.song === 2 && snapshot.jump.section === 0);
  leader.send({ kind: 'previous' });
  await waiting;
  await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));
  await play(2, 40);
  const snapshot = await play(1, 41);
  return { fading, snapshot, row };
}

it('leaves the faded target paused when a jump lands on the first section of a song with no Count Off after a reconnect', async () => {
  const { fading, snapshot, row } = await reconnectFadeAndRestart(NO_COUNT_OFF);
  expect(snapshot.fade).not.toBeNull();
  expect(row(snapshot)).toMatchObject({ arm: 'paused', pause: 'fade-out' });
  expect(fading.cues).toEqual([]);
});

it('leaves the faded target paused when a jump lands on the Count Off of the song it reconnected in', async () => {
  const { fading, snapshot, row } = await reconnectFadeAndRestart(TWO_SONGS);
  expect(snapshot.fade).not.toBeNull();
  expect(row(snapshot)).toMatchObject({ arm: 'paused', pause: 'fade-out' });
  expect(fading.cues).toEqual([]);
});
