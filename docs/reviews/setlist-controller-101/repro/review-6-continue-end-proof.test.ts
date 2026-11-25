import { afterEach, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const SPLIT_SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 16 },
  { name: '2 - Intro', time: 24 },
  { name: '2 - Verse', time: 32 },
];
const SONG_2_VERSE = 1;
const JUMP = '/live/song/cue_point/jump';
const BEAT_MS = 500;

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

// A tap in song 1's last bar, at 12.5, to song 2's Verse, is lost, and song 1 continues at End, so
// Live plays on across End at 16, its bar line. The report at 16.125 is past that bar line on End, so
// the jump is proved lost a bar before the bar after it would prove it, with no stop.
it('clears a lost jump tapped in the last bar of a song that continues at End on the first report past End', async () => {
  rig = await startRig(SPLIT_SET, { playing: true, position: 12.5 });
  const leader = await rig.connectLeader();
  await leader.snapshot(at(12.5));
  leader.send({ kind: 'set-end-toggle', song: 1, toggle: 'continue' });
  await leader.snapshot((snapshot) => snapshot.endToggles[1] === 'continue');

  rig.live.loseNext(JUMP);
  leader.send({ kind: 'jump', song: 2, section: SONG_2_VERSE });
  await leader.snapshot((snapshot) => snapshot.jump?.song === 2 && snapshot.jump.section === SONG_2_VERSE);
  await vi.waitFor(() => expect(rig?.live.lost.filter(({ address }) => address === JUMP)).toHaveLength(1));
  rig.live.advance(3.375 * BEAT_MS);
  expect((await leader.snapshot(at(15.875))).jump).toEqual({ song: 2, section: SONG_2_VERSE });

  rig.live.advance(0.25 * BEAT_MS);
  expect((await leader.snapshot(at(16.125))).jump).toBeNull();
  expect(rig.received('/live/song/stop_playing')).toHaveLength(0);
});
