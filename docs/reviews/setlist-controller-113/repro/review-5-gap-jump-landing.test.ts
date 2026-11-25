import { afterEach, expect, it, vi } from 'vitest';
import type { CuePoint, Track } from '../src/fake-live/fake-live.ts';
import type { Command } from '../src/shared/command.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

// Repro for docs/reviews/setlist-controller-113/pre-pr-review-5.md, finding 1. Copy into test/ to run.
// A loop braced by hand over the gap between two songs, the Fade out run to silence, and a report on
// the brace end. A tap on song 2's Count Off, or Play from start on song 2, sent right after that
// report, waits for the bar line and releases the loop; playback then goes on into the Count Off, and
// the music must come back (#107). Green at HEAD cb21a7a. Red on both cases at the merge-base 00793f4,
// and with repro/review-5-mutation-gap-from-dropped.diff applied, which drops `from: null`.

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const GAP: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - End', time: 32 },
  { name: '2 - Count Off (Trust)', time: 36 },
  { name: '2 - Verse', time: 44 },
  { name: '2 - End', time: 60 },
];
const TRACKS: Track[] = [
  { name: 'Drums', grouped: false, volume: 0.75 },
  { name: 'Kick', grouped: true, volume: 0.5 },
  { name: 'Snare', grouped: true, volume: 1 },
  { name: 'Keys', grouped: false, volume: 0.5 },
  { name: 'Bass', grouped: false, volume: 0.25 },
];
const TOP_LEVEL = [0, 3, 4];
const BEAT_MS = 500;

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;
const playingNear = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.playing && near(snapshot.position, beats);

async function moveTo(leader: Client, beats: number) {
  rig!.live.setPosition(beats);
  return leader.snapshot(playingNear(beats));
}

const next = (leader: Client, matches: (snapshot: Snapshot) => boolean) => {
  const start = leader.received.length;
  return leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= start && matches(snapshot));
};

async function silentOnBraceEnd() {
  rig = await startRig(GAP, { playing: true, position: 33, tracks: TRACKS, loop: { on: true, start: 32, length: 4 } });
  const leader = await rig.connectLeader();
  await leader.snapshot((s) => playingNear(33)(s) && s.loop !== null);
  leader.send({ kind: 'fade-out' });
  await vi.waitFor(() => expect(rig?.received('/live/track/get/volume')).toHaveLength(TOP_LEVEL.length));
  rig.live.advance(BEAT_MS);
  await leader.snapshot(playingNear(34));
  await rig.advanceConnected(6000);
  await vi.waitFor(() => expect(rig?.received('/live/track/set/volume')).toHaveLength(60 * TOP_LEVEL.length));
  const onBrace = await moveTo(leader, Math.fround(35.99995));
  expect(onBrace.fade).toBe('silent');
  return leader;
}

it.each<[string, Command]>([
  ["a tap on song 2's Count Off", { kind: 'jump', song: 2, section: 0 }],
  ['Play from start on song 2', { kind: 'play-from-start', song: 2 }],
])('%s right after a brace-end report from the gap brings the music back as playback goes on into the Count Off', async (_, command) => {
  const leader = await silentOnBraceEnd();
  leader.send(command);
  await next(leader, (snapshot) => snapshot.jump?.song === 2 && snapshot.loop === null);

  const into = await moveTo(leader, 37);

  expect(into.now).toMatchObject({ song: 2, section: 0 });
  expect(into.fade).toBe('in');
});
