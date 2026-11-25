import { byTime, child, childElements, replaceListItems, setValue, valueOf, type AlsDocument, type Element } from './als.ts';
import { PAD_TRACK } from './template.ts';
import type { PlacedSong } from './timeline.ts';
import { numbered } from './write-set.ts';

// Keeps the rehearsal work saved in an existing Live set (.als) when `build-set edit` re-materializes the set:
// 1. Every untouched song's locators, exactly as the old set has them, renamed and added ones included: only the leading
//    song number and the time change. The song before the edited position takes its End region from the new build.
// 2. Track mixer volumes (DeviceChain -> Mixer -> Volume -> Manual) across every track and MainTrack.
// 3. Per-song clip gain (AudioClip -> SampleVolume) on untouched songs.
// Nothing here reads meaning out of a locator name beyond its song number and the builder's own End section.

export type LiveEdits = {
  // Track mixer Manual volumes keyed by `${track.name}:${Id}`.
  trackVolumesById: Map<string, string>;
  // Fallback track mixer Manual volumes keyed by `${track.name}:${EffectiveName}:${TrackGroupId}`.
  trackVolumesByName: Map<string, string>;
  // MainTrack mixer Manual volume.
  mainVolume?: string;
  // Every old locator whose name starts with a song number, by that number, in time order.
  locators: Map<number, Element[]>;
  // Per-old-song-number clip SampleVolume values, keyed by `${relativePath}\0${occurrence}`.
  clipVolumes: Map<number, Map<string, string>>;
};

export type LocatorCarry = {
  // Each untouched song's NEW 1-based song number, mapped to its OLD 1-based song number.
  untouched: Map<number, number>;
  // The NEW song numbers whose End region the new build decides: the song just before the edited position.
  boundary: Set<number>;
  // Each OLD song number's start beat in the old set.
  oldStarts: Map<number, number>;
  placed: PlacedSong[];
};

// `<song number> <separator> <section name>`, matching set-parser.ts.
const LOCATOR = /^\s*(\d+)\s*[-\u2013\u2014]\s*(.*?)\s*$/;
const END = 'End';
const EPS = 1e-4;

// Extracts Live edits from an existing built `.als` document before re-materialization.
export function extractLiveEdits(document: AlsDocument): LiveEdits {
  const liveSet = child(document.root, 'LiveSet');
  const trackVolumesById = new Map<string, string>();
  const trackVolumesByName = new Map<string, string>();
  const tracks = childElements(child(liveSet, 'Tracks'));
  for (const track of tracks) {
    const volume = optionalValue(track, 'DeviceChain', 'Mixer', 'Volume', 'Manual');
    if (volume === undefined) continue;
    const id = track.attributes.Id;
    if (id !== undefined) trackVolumesById.set(`${track.name}:${id}`, volume);
    const nameKey = trackNameKey(track);
    if (nameKey !== undefined && !trackVolumesByName.has(nameKey)) trackVolumesByName.set(nameKey, volume);
  }
  const mainTrack = optionalChild(liveSet, 'MainTrack');
  const mainVolume = mainTrack ? optionalValue(mainTrack, 'DeviceChain', 'Mixer', 'Volume', 'Manual') : undefined;

  const sorted = sortedLocators(liveSet);
  const locators = new Map<number, Element[]>();
  for (const locator of sorted) {
    const number = songNumber(locator);
    if (number === undefined) continue;
    locators.set(number, [...(locators.get(number) ?? []), structuredClone(locator)]);
  }

  const clipVolumes = extractClipVolumes(liveSet, sorted);

  return { trackVolumesById, trackVolumesByName, ...(mainVolume === undefined ? {} : { mainVolume }), locators, clipVolumes };
}

export function applyLiveEdits(document: AlsDocument, edits: LiveEdits, carry: LocatorCarry): void {
  const liveSet = child(document.root, 'LiveSet');

  // 1. Track mixer volumes.
  for (const track of childElements(child(liveSet, 'Tracks'))) {
    const id = track.attributes.Id;
    const byId = id === undefined ? undefined : edits.trackVolumesById.get(`${track.name}:${id}`);
    const nameKey = trackNameKey(track);
    const byName = nameKey === undefined ? undefined : edits.trackVolumesByName.get(nameKey);
    const volume = byId ?? byName;
    if (volume === undefined) continue;
    const manual = optionalChild(track, 'DeviceChain', 'Mixer', 'Volume', 'Manual');
    if (manual) manual.attributes.Value = volume;
  }
  if (edits.mainVolume !== undefined) {
    const mainManual = optionalChild(liveSet, 'MainTrack', 'DeviceChain', 'Mixer', 'Volume', 'Manual');
    if (mainManual) mainManual.attributes.Value = edits.mainVolume;
  }

  // 2. Per-song clip SampleVolume on untouched songs, found by the new build's own locators.
  const built = sortedLocators(liveSet);
  applyClipVolumes(liveSet, built, edits.clipVolumes, carry.untouched);

  replaceListItems(child(liveSet, 'Locators'), 'Locators', numbered(byTime(carriedLocators(built, edits.locators, carry), (locator) => valueOf(locator, 'Time'))));
}

// The new set's locators: the new build's for a touched song and for an untouched song the old set holds none of; the
// old set's, moved and renumbered, for every other untouched song. On the song before the edited position, each of the
// new build's locators but its End takes the place of an old one at the same local time, when there is one, and every
// other old one before the new End comes along too; the old End never does.
function carriedLocators(built: Element[], old: Map<number, Element[]>, { untouched, boundary, oldStarts, placed }: LocatorCarry): Element[] {
  const fresh = new Map<number, Element[]>();
  const unnumbered: Element[] = [];
  for (const locator of built) {
    const number = songNumber(locator);
    if (number === undefined) unnumbered.push(locator);
    else fresh.set(number, [...(fresh.get(number) ?? []), locator]);
  }
  const result = [...unnumbered];
  for (const { number, offset } of placed) {
    const own = fresh.get(number) ?? [];
    const oldNumber = untouched.get(number);
    const kept = oldNumber === undefined ? undefined : old.get(oldNumber);
    if (oldNumber === undefined || kept === undefined || kept.length === 0) {
      result.push(...own);
      continue;
    }
    const oldStart = oldStarts.get(oldNumber);
    if (oldStart === undefined) throw new Error(`Song ${oldNumber} of the set being edited has no start beat in its recipe.`);
    const carried = (locator: Element) => carriedLocator(locator, number, offset - oldStart);
    if (!boundary.has(number)) {
      result.push(...kept.map(carried));
      continue;
    }
    const unused = kept.filter((locator) => section(locator) !== END);
    const newEnd = own.find((locator) => section(locator) === END);
    const endAt = newEnd === undefined ? Infinity : localTime(newEnd, offset);
    for (const locator of own) {
      const at = localTime(locator, offset);
      const match = section(locator) === END ? -1 : unused.findIndex((candidate) => Math.abs(localTime(candidate, oldStart) - at) < EPS);
      result.push(match === -1 ? locator : carried(unused.splice(match, 1)[0]!));
    }
    result.push(...unused.filter((locator) => localTime(locator, oldStart) < endAt - EPS).map(carried));
  }
  return result;
}

function carriedLocator(locator: Element, number: number, delta: number): Element {
  const copy = structuredClone(locator);
  setValue(copy, ['Name'], valueOf(copy, 'Name').replace(/^(\s*)\d+/, `$1${number}`));
  setValue(copy, ['Time'], String(Number(valueOf(copy, 'Time')) + delta));
  return copy;
}

function songNumber(locator: Element): number | undefined {
  const parsed = LOCATOR.exec(valueOf(locator, 'Name'));
  return parsed?.[1] === undefined ? undefined : Number(parsed[1]);
}

function section(locator: Element): string | undefined {
  return LOCATOR.exec(valueOf(locator, 'Name'))?.[2];
}

function localTime(locator: Element, start: number): number {
  return Number(valueOf(locator, 'Time')) - start;
}

type SongSpan = { songNumber: number; start: number; end: number };

function songSpans(locators: Element[]): SongSpan[] {
  const starts = new Map<number, number>();
  for (const locator of locators) {
    const parsed = LOCATOR.exec(valueOf(locator, 'Name'));
    if (!parsed?.[1]) continue;
    const songNumber = Number(parsed[1]);
    const time = Number(valueOf(locator, 'Time'));
    const existing = starts.get(songNumber);
    if (existing === undefined || time < existing) starts.set(songNumber, time);
  }
  const ordered = [...starts.entries()].sort(([, a], [, b]) => a - b);
  return ordered.map(([songNumber, start], index) => ({
    songNumber,
    start,
    end: ordered[index + 1]?.[1] ?? Infinity,
  }));
}

function songAtBeat(spans: SongSpan[], beat: number): number | undefined {
  // Small epsilon handles floating-point drift on clip starts sitting right on a song's start beat.
  for (const span of spans) {
    if (beat >= span.start - EPS && beat < span.end - EPS) return span.songNumber;
  }
  return undefined;
}

function isPadTrack(track: Element): boolean {
  return track.name === 'AudioTrack' && optionalValue(track, 'TrackGroupId') === '-1' && optionalValue(track, 'Name', 'EffectiveName') === PAD_TRACK;
}

function extractClipVolumes(liveSet: Element, locators: Element[]): Map<number, Map<string, string>> {
  const spans = songSpans(locators);
  const result = new Map<number, Map<string, string>>();
  const seen = new Map<string, number>();
  for (const track of childElements(child(liveSet, 'Tracks'), 'AudioTrack')) {
    if (isPadTrack(track)) continue;
    const events = optionalChild(track, 'DeviceChain', 'MainSequencer', 'Sample', 'ArrangerAutomation', 'Events');
    if (!events) continue;
    for (const clip of childElements(events, 'AudioClip')) {
      const start = Number(optionalValue(clip, 'CurrentStart'));
      const relativePath = optionalValue(clip, 'SampleRef', 'FileRef', 'RelativePath');
      const volume = optionalValue(clip, 'SampleVolume');
      if (!Number.isFinite(start) || relativePath === undefined || volume === undefined) continue;
      const songNumber = songAtBeat(spans, start);
      if (songNumber === undefined) continue;
      const countKey = `${songNumber}\0${relativePath}`;
      const occurrence = seen.get(countKey) ?? 0;
      seen.set(countKey, occurrence + 1);
      const songMap = result.get(songNumber) ?? new Map<string, string>();
      songMap.set(`${relativePath}\0${occurrence}`, volume);
      result.set(songNumber, songMap);
    }
  }
  return result;
}

function applyClipVolumes(liveSet: Element, locators: Element[], clipVolumes: Map<number, Map<string, string>>, untouched: Map<number, number>): void {
  const spans = songSpans(locators);
  const seen = new Map<string, number>();
  for (const track of childElements(child(liveSet, 'Tracks'), 'AudioTrack')) {
    if (isPadTrack(track)) continue;
    const events = optionalChild(track, 'DeviceChain', 'MainSequencer', 'Sample', 'ArrangerAutomation', 'Events');
    if (!events) continue;
    for (const clip of childElements(events, 'AudioClip')) {
      const start = Number(optionalValue(clip, 'CurrentStart'));
      const relativePath = optionalValue(clip, 'SampleRef', 'FileRef', 'RelativePath');
      if (!Number.isFinite(start) || relativePath === undefined) continue;
      const newSongNumber = songAtBeat(spans, start);
      if (newSongNumber === undefined) continue;
      const countKey = `${newSongNumber}\0${relativePath}`;
      const occurrence = seen.get(countKey) ?? 0;
      seen.set(countKey, occurrence + 1);
      const oldSongNumber = untouched.get(newSongNumber);
      if (oldSongNumber === undefined) continue;
      const volume = clipVolumes.get(oldSongNumber)?.get(`${relativePath}\0${occurrence}`);
      if (volume === undefined) continue;
      const volumeEl = optionalChild(clip, 'SampleVolume');
      if (volumeEl) volumeEl.attributes.Value = volume;
    }
  }
}

function sortedLocators(liveSet: Element): Element[] {
  const list = optionalChild(liveSet, 'Locators', 'Locators');
  if (!list) return [];
  return byTime(childElements(list, 'Locator'), (locator) => valueOf(locator, 'Time'));
}

function trackNameKey(track: Element): string | undefined {
  const effectiveName = optionalValue(track, 'Name', 'EffectiveName');
  if (effectiveName === undefined) return undefined;
  const groupId = optionalValue(track, 'TrackGroupId') ?? '';
  return `${track.name}:${effectiveName}:${groupId}`;
}

function optionalChild(parent: Element, ...path: string[]): Element | undefined {
  let current: Element | undefined = parent;
  for (const name of path) {
    current = childElements(current, name)[0];
    if (!current) return undefined;
  }
  return current;
}

function optionalValue(parent: Element, ...path: string[]): string | undefined {
  return optionalChild(parent, ...path)?.attributes.Value;
}
