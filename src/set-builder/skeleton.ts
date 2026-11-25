import { chartHeading } from '../shared/chart-heading.ts';
import { nameKey } from './name-rule.ts';

// `pnpm build-set --skeleton`: the chart skeleton, each song's locator names as the section headings Nick pastes into
// the song's chord chart in Planning Center, so the chart's headings match the locators by design. Each name the
// heading rule reads (chartHeading) goes in once, by the set builder's name rule (nameKey), in first-played order, in
// upper case, as Planning Center's chord chart asks headings to be typed. Count Off, which no chart holds, and a
// locator whose name is blank, as MultiTracks marks a song's end, are left out without a word. Every other name, such
// as Outro or Pre Chorus, is no heading the chart view can read, so it is left out too, once each in first-played
// order, for a note that names it.

// One song's skeleton: its headings, and the locator names it leaves out with a note.
export type SongSkeleton = { headings: string[]; leftOut: string[] };

// The skeleton of a song whose locator names, in time order, are `names`.
export function songSkeleton(names: string[]): SongSkeleton {
  const seen = new Set<string>();
  const headings: string[] = [];
  const leftOut: string[] = [];
  for (const name of names) {
    const key = nameKey(name);
    if (key === '' || key === 'count off' || seen.has(key)) continue;
    seen.add(key);
    if (chartHeading(name) === undefined) leftOut.push(name.trim().replace(/\s+/g, ' '));
    else headings.push(name.trim().replace(/\s+/g, ' ').toUpperCase());
  }
  return { headings, leftOut };
}

// The skeletons as printed: each song's `<n>. <title>` line, `number` being its place in the songs named or the plan, then
// its headings one per line, and one blank line between songs, so each song's paste ends where the next song's number
// starts.
export function skeletonLines(songs: { number: number; title: string; headings: string[] }[]): string[] {
  return songs.flatMap(({ number, title, headings }, index) => [...(index === 0 ? [] : ['']), `${number}. ${title}`, ...headings]);
}

// The note that names the locators a song's skeleton leaves out, or undefined when it leaves none out.
export function leftOutNote(title: string, leftOut: string[]): string | undefined {
  const last = leftOut.at(-1);
  if (last === undefined) return undefined;
  const names = leftOut.length === 1 ? last : `${leftOut.slice(0, -1).join(', ')} and ${last}`;
  return leftOut.length === 1
    ? `Note: "${title}" has the locator ${names}, which is no chart heading, so the skeleton leaves it out. The chart view shows it with its name and bar count.`
    : `Note: "${title}" has the locators ${names}, which are no chart heading, so the skeleton leaves them out. The chart view shows each with its name and bar count.`;
}
