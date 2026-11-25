import type { CuePoint } from '../shared/cue-point.ts';
import type { Section, SetList, SetWarning, Song } from '../shared/snapshot.ts';

// `<song number> <separator> <section name>`, the separator a hyphen, an en dash or an em dash.
const LOCATOR = /^\s*(\d+)\s*[-\u2013\u2014]\s*(.*?)\s*$/;
// A trailing `(<title>)` on a song's first locator.
const TITLED = /^(.*?)\s*\(\s*(.*?)\s*\)$/;
const END = 'End';

type Locator = { name: string; time: number; cue: number };

// Bad input yields warnings, never an exception.
export function parseSet(cuePoints: CuePoint[]): SetList {
  const warnings: SetWarning[] = [];
  const locatorsBySong = new Map<number, Locator[]>();

  const indexed = cuePoints.map(({ name, time }, cue) => ({ name, time, cue }));
  for (const { name, time, cue } of indexed.sort((a, b) => a.time - b.time)) {
    const match = LOCATOR.exec(name);
    if (!match?.[1] || !match[2]) {
      warnings.push({
        kind: 'unparseable-locator',
        locator: name,
        message: `The locator "${name}" does not read as "<song number> - <section name>".`,
      });
      continue;
    }
    const number = Number(match[1]);
    const locators = locatorsBySong.get(number) ?? [];
    locators.push({ name: match[2], time, cue });
    locatorsBySong.set(number, locators);
  }

  const songs = [...locatorsBySong.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, locators]) => toSong(number, locators));

  for (const song of songs) {
    if (song.end === null) {
      warnings.push({ kind: 'missing-end', song: song.number, message: `Song ${song.number} has no End locator.` });
    }
    const ends = (locatorsBySong.get(song.number) ?? []).filter((locator) => locator.name === END);
    if (ends.length > 1) {
      warnings.push({ kind: 'repeated-end', song: song.number, message: `Song ${song.number} has more than one End locator. The first one counts.` });
    }
    for (const section of song.sections) {
      if (song.end !== null && section.time >= song.end) {
        warnings.push({
          kind: 'section-after-end',
          song: song.number,
          section: section.name,
          message: `The locator "${song.number} - ${section.name}" is at or after song ${song.number}'s End.`,
        });
      }
    }
  }

  const spans = songs.map((song) => {
    const times = (locatorsBySong.get(song.number) ?? []).map((locator) => locator.time);
    return { song: song.number, start: Math.min(...times), last: Math.max(...times) };
  });
  spans.forEach((a, index) => {
    for (const b of spans.slice(index + 1)) {
      if (a.start < b.last && b.start < a.last) {
        warnings.push({ kind: 'overlapping-songs', song: a.song, other: b.song, message: `Songs ${a.song} and ${b.song} overlap: a locator of one sits inside the other.` });
      }
    }
  });

  // A gap is a number missing between the lowest and highest songs. A set may start past song 1.
  const numbers = new Set(songs.map((song) => song.number));
  const first = songs[0]?.number ?? 0;
  const last = songs.at(-1)?.number ?? 0;
  for (let number = first + 1; number < last; number++) {
    if (!numbers.has(number)) {
      warnings.push({ kind: 'song-number-gap', song: number, message: `There is no song ${number}.` });
    }
  }

  return { songs, warnings };
}

function toSong(number: number, locators: Locator[]): Song {
  let title: string | null = null;
  const first = locators[0];
  const titled = first && TITLED.exec(first.name);
  if (first && titled?.[1] && titled[2]) {
    title = titled[2];
    first.name = titled[1];
  }

  const endLocator = locators.find((locator) => locator.name === END);
  const end = endLocator?.time ?? null;
  const sections: Section[] = [];
  locators.forEach((locator, index) => {
    if (locator.name === END) return;
    // A section runs to the next locator in its song. The last one runs to End.
    sections.push({
      name: locator.name,
      time: locator.time,
      end: locators[index + 1]?.time ?? end,
      cue: locator.cue,
    });
  });

  return { number, title, sections, end, endCue: endLocator?.cue ?? null };
}
