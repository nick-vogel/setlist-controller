import { namesMatch } from './match-name.ts';

// The set manifest: one JSON file holding, for each song of the set in set order, its title, the key
// of its stems, its starting meter, and its chart's key and text. A song with no chart has no chart key
// and no chart text.
// The set builder writes it, the server reads it and serves it to the band pages, and the chart view
// reads a song's chart from it, so it holds no node import.

// The manifest's file name, in the app's support folder beside the leader secret by default.
export const SET_MANIFEST_FILE = 'set-manifest.json';

export type ManifestSong = {
  title: string;
  // The key the stems are in, or null when the set builder knows none.
  stemsKey: string | null;
  meter?: string;
  // The key the chart is typed in, and the chart text, as Planning Center holds them.
  chartKey?: string;
  chartText?: string;
  // How long the song plays, as the build placed it in the set: absent from a manifest the build did not write.
  durations?: SongDurations;
};

// A stretch of the built set: its length in beats, which the server checks against Live's locators, and in seconds
// through the set's tempo map.
export type Span = { beats: number; seconds: number };

// Each section of a song, from one locator to the next and the last to the song's End, in locator order, and the gap
// from the song's End to the next song's first locator, or null after the last song.
export type SongDurations = { sections: Span[]; gap: Span | null };

export type SetManifest = { songs: ManifestSong[] };

// What the charts endpoint answers: the manifest's songs, none when there is no manifest or it cannot
// be read, and the revision of the read they came from.
export type SetCharts = { revision: number; songs: ManifestSong[] };

const NOT_READABLE = 'The set manifest needs a "songs" list, each song with a "title", a "stemsKey" (a key or null), a "meter" when it has one and, for a song with a chart, a "chartKey" and a "chartText".';

// The manifest the text holds, or the one problem that makes the whole file unreadable.
export function parseSetManifest(text: string): { manifest: SetManifest } | { problem: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { problem: `The set manifest is not valid JSON: ${(error as Error).message}` };
  }
  const songs = isObject(value) ? value.songs : undefined;
  if (!Array.isArray(songs) || !songs.every(isManifestSong)) return { problem: NOT_READABLE };
  return {
    manifest: {
      songs: songs.map(({ title, stemsKey, meter, chartKey, chartText, durations }) => ({
        title,
        stemsKey,
        ...(meter === undefined ? {} : { meter }),
        ...(chartKey === undefined ? {} : { chartKey }),
        ...(chartText === undefined ? {} : { chartText }),
        // Durations the server cannot read are dropped alone: the song's chart and meter still serve, and its times fall
        // back to Live's tempo.
        ...(isDurations(durations) ? { durations: { sections: durations.sections.map(span), gap: durations.gap === null ? null : span(durations.gap) } } : {}),
      })),
    },
  };
}

// The manifest song holding the chart for the set's song of this title: the first whose title matches
// by the name rule and that has chart text. None for a song with no title.
export function chartForSong(songs: readonly ManifestSong[], title: string | null): ManifestSong | undefined {
  if (title === null) return undefined;
  const song = songs.find((candidate) => namesMatch(candidate.title, title));
  return song?.chartText === undefined ? undefined : song;
}

// The beats in a bar of the set's song of this title from the manifest, or null when the manifest
// holds no song of its title or gives it no readable meter.
export function meterForSong(songs: readonly ManifestSong[], title: string | null): number | null {
  if (title === null) return null;
  const song = songs.find((candidate) => namesMatch(candidate.title, title));
  return parseBeatsPerBar(song?.meter);
}

// The beats in a bar of a meter string such as "6/8" (3) or "4/4" (4), or null when unreadable.
export function parseBeatsPerBar(meter: string | undefined): number | null {
  const parts = /^(\d+)\/(\d+)$/.exec(meter ?? '');
  const numerator = Number(parts?.[1]);
  const denominator = Number(parts?.[2]);
  return numerator > 0 && denominator > 0 ? (numerator * 4) / denominator : null;
}

export function beatsPerBar(meter: string | undefined): number {
  return parseBeatsPerBar(meter) ?? 4;
}

function isManifestSong(value: unknown): value is ManifestSong {
  if (!isObject(value)) return false;
  const { title, stemsKey, meter, chartKey, chartText } = value;
  return (
    typeof title === 'string' &&
    (stemsKey === null || typeof stemsKey === 'string') &&
    (meter === undefined || typeof meter === 'string') &&
    (chartKey === undefined || typeof chartKey === 'string') &&
    (chartText === undefined || typeof chartText === 'string')
  );
}

function isDurations(value: unknown): value is SongDurations {
  return isObject(value) && Array.isArray(value.sections) && value.sections.every(isSpan) && (value.gap === null || isSpan(value.gap));
}

function isSpan(value: unknown): value is Span {
  return isObject(value) && isLength(value.beats) && isLength(value.seconds);
}

function isLength(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function span({ beats, seconds }: Span): Span {
  return { beats, seconds };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
