import { valueOf } from './als.ts';
import { timeSignature } from './meter.ts';
import type { PlanSong } from './plan-reader.ts';
import { NO_SKIPS } from './plan-transitions.ts';
import { hasStartingValues, mainEvents, readSong } from './song.ts';

// The warnings a plan build and a listing of the plan give where the plan and a song disagree: the plan's arrangement
// BPM against the folder's, and the plan's meter against the song's starting meter; and the warnings a listing of the
// plan gives for a song's chart. A warning never stops the build.

// The BPM a song folder's name writes, `<title>-<artist>-<key>-<bpm>bpm`: 98 for `-98.00bpm`. Undefined when the name
// writes none.
export function folderBpm(folder: string): number | undefined {
  const written = /-(\d+(?:\.\d+)?)bpm$/i.exec(folder)?.[1];
  return written === undefined ? undefined : Number(written);
}

// Each warning, in song order, a song's BPM line before its meter line: a BPM line when the plan has the song's BPM, its
// folder name writes one, and the two numbers differ; a meter line when the plan has the song's meter, the song's
// starting meter is known, and the two differ, trimmed. `folders` and `meters` hold each song's folder and starting
// meter, `6/8`, by position, or undefined where it has none; a song with no folder gives no warning. A BPM or a meter the
// plan lacks gives none.
export function planWarnings(songs: PlanSong[], folders: (string | undefined)[], meters: (string | undefined)[]): string[] {
  return songs.flatMap(({ title, bpm, meter }, index) => {
    const folder = folders[index];
    if (folder === undefined) return [];
    const song = `song ${index + 1}, "${title}"`;
    const folderAt = folderBpm(folder);
    const songMeter = meters[index];
    return [
      ...(bpm !== undefined && folderAt !== undefined && bpm !== folderAt
        ? [`Warning: ${song}, is planned at ${String(bpm)} BPM, and its folder ${folder} is at ${String(folderAt)} BPM.`]
        : []),
      ...(meter !== undefined && songMeter !== undefined && meter.trim() !== songMeter.trim()
        ? [`Warning: ${song}, is planned in ${meter.trim()}, and its song starts in ${songMeter.trim()}.`]
        : []),
    ];
  });
}

// The warnings --plan --list gives for the songs' charts, in song order, for every plan song, with a folder or none,
// since the chart comes from Planning Center: a song whose arrangement has no chart text, and one whose chart text has no
// chord in square brackets, a bracket holding something other than spaces. A song --skip leaves out (skipped, by
// position from 1) gets none, since the set has no chart for it. A warning never stops the build.
export function chartWarnings(songs: PlanSong[], skipped: ReadonlySet<number> = NO_SKIPS): string[] {
  return songs.flatMap(({ title, chartText }, index) => {
    if (skipped.has(index + 1)) return [];
    const song = `song ${index + 1}, "${title}"`;
    if (chartText === undefined) return [`Warning: ${song}, has no chart text in Planning Center, so the chart view shows "No chart for this song".`];
    if (!/\[[^\]]*\S[^\]]*\]/.test(chartText)) {
      return [`Warning: ${song}, has chart text in Planning Center with no chords in square brackets, so the chart view shows no chords for it.`];
    }
    return [];
  });
}

// The time signature the song in `folder` starts in, as the summary writes it, `6/8`; or undefined when the song cannot
// be read, or has no starting tempo and meter, which the build itself reports. Never throws.
export async function startingMeter(library: string, folder: string): Promise<string | undefined> {
  try {
    const { song } = await readSong(library, folder);
    if (song === undefined || !hasStartingValues(song)) return undefined;
    return timeSignature(Number(valueOf(mainEvents(song, 'TimeSignature').start)));
  } catch {
    return undefined;
  }
}
