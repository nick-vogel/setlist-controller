import { parseChart } from '../shared/chart.ts';
import { COUNT_OFF } from '../shared/count-in.ts';
import { nameKey, namesMatch } from '../shared/match-name.ts';
import { matchSection } from '../shared/occurrence.ts';
import { chartForSong } from '../shared/set-manifest.ts';
import { songTitle, type SetList, type Song } from '../shared/snapshot.ts';
import type { SetManifestFile } from './set-manifest.ts';
import type { FileCheck, Target, TargetReport } from './target.ts';

// The Charts connection target: a file target over the set manifest the server holds
// (set-manifest.ts), so the producer's Connections panel and the setup screen show its pre-service
// check, each song of the set against its chart there, before the chart view is needed. It follows
// no cue: it is always online, acts on none, and offers no button. The server builds it whenever it
// has a manifest path (server.ts), and calls changed() each time a read finds the manifest changed,
// which runs the check again.

export type ChartsTarget = Target & {
  // The manifest changed, so the check runs again. Nothing before the target starts.
  changed(): void;
};

// The locators no chart heading is for: the count before the song, the set builder's pads after it,
// and its End, which the set parser never makes a section but which the spec names.
const NO_HEADING = [COUNT_OFF, 'Pad', 'Pad Out', 'End'];

// The line the page shows when every song of the set has its chart.
const PASS_TEXT = 'Every song and section matches.';

export function chartsTarget({ path, manifest }: { path: string; manifest: SetManifestFile }): ChartsTarget {
  let report: TargetReport | null = null;
  return {
    name: 'charts',
    label: 'Charts',
    pausesOnFade: false,
    actsOn: () => false,
    buttons: [],
    start(given) {
      report = given;
      // A file the server reads itself is always there to check.
      given.status('online');
    },
    stop: async () => {},
    cue: () => {},
    runButton: () => {},
    check: (set) => check(set, path, manifest),
    changed: () => report?.fileChanged(),
  };
}

function check(set: SetList, path: string, manifest: SetManifestFile): FileCheck {
  // A manifest that is not there, or cannot be read, is the one cause of every song's missing chart.
  if (manifest.missing()) return { unmatched: [], problems: [`No set manifest at ${path}. pnpm build-set writes it.`], notes: [], passText: PASS_TEXT };
  const problem = manifest.problem();
  if (problem !== null) return { unmatched: [], problems: [problem], notes: [], passText: PASS_TEXT };

  const { songs } = manifest.charts();
  const result: FileCheck = { unmatched: [], problems: [], notes: [], passText: PASS_TEXT };
  for (const song of set.songs) {
    const title = songTitle(song);
    const found = chartForSong(songs, song.title);
    if (found?.chartText === undefined) {
      result.problems.push(`${title}: ${noChart(song, songs.some((candidate) => song.title !== null && namesMatch(candidate.title, song.title)))}`);
      continue;
    }
    const chart = parseChart(found.chartText);
    const reached = new Set<object>();
    const unmatched = new Set<string>();
    song.sections.forEach((section, index) => {
      if (NO_HEADING.some((name) => namesMatch(name, section.name))) return;
      const heading = matchSection(song.sections, index, chart.sections);
      if (heading !== undefined) reached.add(heading);
      else if (!unmatched.has(nameKey(section.name))) {
        unmatched.add(nameKey(section.name));
        result.unmatched.push(`${title}: ${section.name}`);
      }
    });
    if ((found.chartKey ?? '').trim() === '') {
      result.notes.push(found.stemsKey === null ? `${title}: no chart key and no stems key, the chords show as typed` : `${title}: no chart key, the stems key ${found.stemsKey} is used`);
    }
    const chords = chart.sections.some((section) => section.lines.some((line) => line.kind === 'lyrics' && line.chunks.some((chunk) => chunk.chord !== null)));
    if (!chords) result.notes.push(`${title}: no chords in brackets`);
    for (const line of chart.dropped) result.notes.push(`${title}: dropped line "${line}"`);
    for (const section of chart.sections) if (!reached.has(section)) result.notes.push(`${title}: heading ${section.name}, no locator reaches it`);
  }
  return result;
}

// Why a song of the set has no chart: no title to match it by, a title no manifest song has, or a
// manifest song with no chart text.
function noChart(song: Song, inManifest: boolean): string {
  if (song.title === null) return 'no title on its first locator, so no chart matches it';
  return inManifest ? 'no chart' : 'not in the set manifest';
}
