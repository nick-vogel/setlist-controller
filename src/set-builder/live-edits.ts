import { byTime, child, childElements, setValue, valueOf, type AlsDocument, type Element } from './als.ts';
import { PAD_TRACK } from './template.ts';

// Preserves rehearsal edits saved in an existing Live set (.als) when `build-set edit`
// re-materializes the set:
// 1. Per-song locator flags (+SKIP, +LOOP, +LOOP:<n>, >>> <target>[@<n>]) on untouched songs,
//    re-indexed when song numbers shift after --add or --drop.
// 2. Track mixer volumes (DeviceChain -> Mixer -> Volume -> Manual) across every track and MainTrack.
// 3. Per-song clip gain (AudioClip -> SampleVolume) on untouched songs.

export type PlannedLoop = { passes: number | null };
export type JumpTarget = { name: string; occurrence: number | null };
export type SectionFlags = { loop?: PlannedLoop; skip?: true; jump?: JumpTarget };

export type LiveEdits = {
  // Track mixer Manual volumes keyed by `${track.name}:${Id}`.
  trackVolumesById: Map<string, string>;
  // Fallback track mixer Manual volumes keyed by `${track.name}:${EffectiveName}:${TrackGroupId}`.
  trackVolumesByName: Map<string, string>;
  // MainTrack mixer Manual volume.
  mainVolume?: string;
  // Per-old-song-number locator flags, keyed by `${baseSectionName}\0${occurrence}`.
  locatorFlags: Map<number, Map<string, SectionFlags>>;
  // Per-old-song-number clip SampleVolume values, keyed by `${relativePath}\0${occurrence}`.
  clipVolumes: Map<number, Map<string, string>>;
};

// `<song number> <separator> <section name>`, matching set-parser.ts.
const LOCATOR = /^\s*(\d+)\s*[-\u2013\u2014]\s*(.*?)\s*$/;
// A trailing ` >>> <target>` with optional `@<n>`, white space around the arrow loose.
const JUMP_FLAG = /^(.*?)\s*>>>\s*(\S.*?)\s*$/;
const OCCURRENCE = /^(.*?)@([1-9]\d*)$/;
// A trailing ` +SKIP`, ` +LOOP`, or ` +LOOP:<n>`, letter case ignored.
const PLUS_FLAG = /^(.*?)\s+\+(skip|loop(?::(\d+))?)$/i;

export function readLocatorFlags(locatorSection: string): { name: string } & SectionFlags {
  let name = locatorSection;
  let jump: JumpTarget | undefined;
  let loop: PlannedLoop | undefined;
  let skip = false;
  const jumpMatch = JUMP_FLAG.exec(name);
  if (jumpMatch?.[1] && jumpMatch[2]) {
    name = jumpMatch[1];
    const occurrence = OCCURRENCE.exec(jumpMatch[2]);
    jump = occurrence?.[1] ? { name: occurrence[1].trim(), occurrence: Number(occurrence[2]) } : { name: jumpMatch[2], occurrence: null };
  }
  for (let plus = PLUS_FLAG.exec(name); plus?.[1] && plus[2]; plus = PLUS_FLAG.exec(name)) {
    name = plus[1];
    if (plus[2].toLowerCase() === 'skip') skip = true;
    else if (plus[3] === undefined) loop = { passes: null };
    else if (Number(plus[3]) >= 2) loop = { passes: Number(plus[3]) };
  }
  return { name, ...(skip && { skip: true as const }), ...(loop && { loop }), ...(jump && { jump }) };
}

export function withLocatorFlags(section: string, flags: SectionFlags): string {
  let name = section;
  if (flags.skip) name += ' +SKIP';
  if (flags.loop) name += flags.loop.passes === null ? ' +LOOP' : ` +LOOP:${flags.loop.passes}`;
  if (flags.jump) name += ` >>> ${flags.jump.name}${flags.jump.occurrence === null ? '' : `@${flags.jump.occurrence}`}`;
  return name;
}

function hasAnyFlag(flags: SectionFlags): boolean {
  return flags.skip === true || flags.loop !== undefined || flags.jump !== undefined;
}

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

  const locatorFlags = new Map<number, Map<string, SectionFlags>>();
  const locators = sortedLocators(liveSet);
  const seenSections = new Map<string, number>();
  for (const locator of locators) {
    const parsed = LOCATOR.exec(valueOf(locator, 'Name'));
    if (!parsed?.[1] || !parsed[2]) continue;
    const songNumber = Number(parsed[1]);
    const { name: baseName, skip, loop, jump } = readLocatorFlags(parsed[2]);
    const countKey = `${songNumber}\0${baseName}`;
    const occurrence = seenSections.get(countKey) ?? 0;
    seenSections.set(countKey, occurrence + 1);
    const flags: SectionFlags = { ...(skip && { skip }), ...(loop && { loop }), ...(jump && { jump }) };
    if (!hasAnyFlag(flags)) continue;
    const songFlags = locatorFlags.get(songNumber) ?? new Map<string, SectionFlags>();
    songFlags.set(`${baseName}\0${occurrence}`, flags);
    locatorFlags.set(songNumber, songFlags);
  }

  const clipVolumes = extractClipVolumes(liveSet, locators);

  return { trackVolumesById, trackVolumesByName, ...(mainVolume === undefined ? {} : { mainVolume }), locatorFlags, clipVolumes };
}

// Reapplies extracted Live edits onto a newly materialized `.als`. `untouched` maps each
// untouched song's NEW 1-based song number to its OLD 1-based song number.
export function applyLiveEdits(document: AlsDocument, edits: LiveEdits, untouched: Map<number, number>): void {
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

  // 2. Per-song locator flags on untouched songs.
  const locators = sortedLocators(liveSet);
  const seenSections = new Map<string, number>();
  for (const locator of locators) {
    const parsed = LOCATOR.exec(valueOf(locator, 'Name'));
    if (!parsed?.[1] || !parsed[2]) continue;
    const newSongNumber = Number(parsed[1]);
    const baseName = parsed[2];
    const countKey = `${newSongNumber}\0${baseName}`;
    const occurrence = seenSections.get(countKey) ?? 0;
    seenSections.set(countKey, occurrence + 1);
    const oldSongNumber = untouched.get(newSongNumber);
    if (oldSongNumber === undefined) continue;
    const flags = edits.locatorFlags.get(oldSongNumber)?.get(`${baseName}\0${occurrence}`);
    if (flags === undefined) continue;
    setValue(locator, ['Name'], `${newSongNumber} - ${withLocatorFlags(baseName, flags)}`);
  }

  // 3. Per-song clip SampleVolume on untouched songs.
  applyClipVolumes(liveSet, locators, edits.clipVolumes, untouched);
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
  const EPS = 1e-4;
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
