import { parseSet } from '../server/set-parser.ts';
import type { Span, SongDurations } from '../shared/set-manifest.ts';
import { gapAfter } from '../shared/snapshot.ts';
import { child, childElements, valueOf, type AlsDocument } from './als.ts';
import { mainEnvelope } from './song.ts';
import { secondsThrough, tempoPoints, type TempoPoint } from './tempo.ts';

// How long each song of a built set plays, read back from the set as written: its locators, read as the server reads
// them from Live (parseSet), and its main track's stitched Tempo envelope, through which Live plays every beat. Live
// gives the server the arrangement in beats and only the tempo it plays now, so the seconds across a tempo change come
// from here, by way of the set manifest.

// Each song's durations, in set order: its sections, the last one to its End, and the gap from its End to the next
// song's first locator. A song with no End, which a build never writes, gives the sections it can measure and no gap.
export function setDurations(set: AlsDocument): SongDurations[] {
  const liveSet = child(set.root, 'LiveSet');
  const locators = childElements(child(liveSet, 'Locators', 'Locators'), 'Locator');
  const { songs } = parseSet(locators.map((locator) => ({ name: valueOf(locator, 'Name'), time: Number(valueOf(locator, 'Time')) })));
  const tempo = tempoPoints(childElements(child(mainEnvelope(child(liveSet, 'MainTrack'), 'Tempo'), 'Automation', 'Events'), 'FloatEvent'));
  return songs.map((song, index) => {
    const gap = gapAfter(songs, index);
    return {
      sections: song.sections.flatMap((section) => (section.end === null ? [] : [spanOf(tempo, section.time, section.end)])),
      gap: gap && spanOf(tempo, gap.start, gap.end),
    };
  });
}

function spanOf(tempo: TempoPoint[], from: number, to: number): Span {
  return { beats: to - from, seconds: secondsThrough(tempo, from, to) };
}
