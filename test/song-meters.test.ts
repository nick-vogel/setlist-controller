import { writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, removeManifestFiles, startRig, writeManifestFile, type Rig } from './harness.ts';

// Per-song starting meters in the snapshot: sourced from the set manifest's per-song meter with
// fallback to Live's reported time signature (or 4/4 before Live reports one), so mixed-meter sets
// carry accurate bar grids before Live visits later songs.

const MIXED_SET: CuePoint[] = [
  { name: '1 - Count Off (Four Four Song)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - End', time: 24 },
  { name: '2 - Intro (Six Eight Song)', time: 32 },
  { name: '2 - Chorus', time: 44 },
  { name: '2 - End', time: 56 },
  { name: '3 - Verse (Twelve Eight Song)', time: 64 },
  { name: '3 - End', time: 88 },
  { name: '4 - Verse (No Manifest Meter)', time: 96 },
  { name: '4 - End', time: 112 },
  { name: '5 - Intro', time: 120 },
  { name: '5 - End', time: 136 },
];

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  await removeManifestFiles();
});

describe('per-song starting meters in the snapshot', () => {
  it('exposes every song meter from the set manifest before Live visits later songs', async () => {
    const manifestPath = await writeManifestFile([
      { title: 'Four Four Song', stemsKey: 'G', meter: '4/4' },
      // Deliberately different case and spacing to prove name-rule matching.
      { title: '  six  EIGHT song ', stemsKey: 'D', meter: '6/8' },
      { title: 'Twelve Eight Song', stemsKey: 'A', meter: '12/8' },
      { title: 'No Manifest Meter', stemsKey: 'E' },
    ]);

    rig = await startRig(MIXED_SET, { position: 0, signature: { numerator: 3, denominator: 4 } }, { setManifest: manifestPath });
    const leader = await rig.connectLeader();
    const snap = await leader.snapshot((snapshot: Snapshot) => loaded(snapshot) && snapshot.songMeters[4] === 3);

    expect(snap.songMeters).toEqual({
      1: 4,
      2: 3,
      3: 6,
      4: 3,
      5: 3,
    });
  });

  it('falls back to Live time signature when no manifest exists, and updates if Live changes signature', async () => {
    rig = await startRig(MIXED_SET, { position: 0, signature: { numerator: 3, denominator: 4 } });
    const leader = await rig.connectLeader();
    const initial = await leader.snapshot((snapshot: Snapshot) => loaded(snapshot) && snapshot.songMeters[1] === 3);

    expect(initial.songMeters).toEqual({
      1: 3,
      2: 3,
      3: 3,
      4: 3,
      5: 3,
    });

    // Live switches to 4/4 before visiting songs 2-5; unvisited songs follow Live's current signature.
    rig.live.setSignature(4, 4);
    const updated = await leader.snapshot((snapshot: Snapshot) => snapshot.songMeters[2] === 4);
    expect(updated.songMeters[2]).toBe(4);
    expect(updated.songMeters[3]).toBe(4);
  });

  it('falls back to 4 beats per bar when no manifest exists and Live is in default 4/4', async () => {
    rig = await startRig(MIXED_SET, { position: 0 });
    const viewer = await rig.connectViewer();
    const snap = await viewer.snapshot(loaded);

    expect(snap.songMeters).toEqual({
      1: 4,
      2: 4,
      3: 4,
      4: 4,
      5: 4,
    });
  });

  it('updates songMeters when the set manifest file changes', async () => {
    const manifestPath = await writeManifestFile([
      { title: 'Four Four Song', stemsKey: 'G', meter: '4/4' },
      { title: 'Six Eight Song', stemsKey: 'D', meter: '6/8' },
    ]);

    rig = await startRig(MIXED_SET, { position: 0, signature: { numerator: 4, denominator: 4 } }, { setManifest: manifestPath });
    const leader = await rig.connectLeader();
    const first = await leader.snapshot(loaded);
    expect(first.songMeters[2]).toBe(3);

    await writeFile(
      manifestPath,
      JSON.stringify({
        songs: [
          { title: 'Four Four Song', stemsKey: 'G', meter: '4/4' },
          { title: 'Six Eight Song', stemsKey: 'D', meter: '12/8' },
        ],
      }),
    );

    const refreshed = await leader.snapshot((snapshot: Snapshot) => snapshot.chartRevision === 2);
    expect(refreshed.songMeters[2]).toBe(6);
  });

  it('publishes an empty songMeters map before the set is loaded', async () => {
    rig = await startRig(MIXED_SET, {}, { liveRunning: false });
    const leader = await rig.connectLeader();
    const snap = await leader.snapshot();

    expect(snap.set).toBeNull();
    expect(snap.songMeters).toEqual({});
  });
});
