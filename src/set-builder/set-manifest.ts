import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { ManifestSong, SetManifest, SongDurations } from '../shared/set-manifest.ts';
import type { SongSummary } from './build-set.ts';
import { songNoteKey } from './pads.ts';
import type { PlanSong } from './plan-reader.ts';

// The set manifest a build writes for the server (src/shared/set-manifest.ts): each built song, in set order.

// The manifest of the songs built, in set order: each song's title, the one its folder name gives, which the build also
// puts on the song's Count Off locator, where the server matches a chart by it; its stems key, the note-name key its
// folder name writes, or null; its starting meter, as the build's summary reports it; and, for a --plan build, the chart
// key and chart text of the plan song at the same position, when it has chart text. A build by song names, with no plan
// songs, writes no chart key and no chart text. Each song also carries its durations at the same position, when the build
// gives them (setDurations).
export function buildManifest(songs: SongSummary[], planSongs?: PlanSong[], durations?: SongDurations[]): SetManifest {
  return {
    songs: songs.map(({ folder, title, meter }, index): ManifestSong => {
      const stems = songNoteKey(folder);
      const plan = planSongs?.[index];
      const timed = durations?.[index];
      return {
        title,
        stemsKey: stems.ok ? stems.key : null,
        meter,
        ...(plan?.chartText === undefined ? {} : { ...(plan.chartKey === undefined ? {} : { chartKey: plan.chartKey }), chartText: plan.chartText }),
        ...(timed === undefined ? {} : { durations: timed }),
      };
    }),
  };
}

// Writes `manifest` to `path`, replacing the file there, its folder made when missing. The text goes to a hidden file in
// the same folder first, then takes the path's place in one rename, so the server, which watches the file, reads the old
// manifest or the new one whole and never half of one. Throws what the file system throws, the hidden file removed.
export async function writeSetManifest(path: string, manifest: SetManifest): Promise<void> {
  const folder = dirname(path);
  await mkdir(folder, { recursive: true });
  const partial = join(folder, `.${basename(path)}.${process.pid}.partial`);
  try {
    await writeFile(partial, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
