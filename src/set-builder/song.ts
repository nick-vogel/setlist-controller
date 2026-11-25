import { stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { byTime, child, childElements, parseAls, readAlsXml, rootAttributes, valueOf, type Element } from './als.ts';

// A song is a MultiTracks Live 12 set, `MultiTrack.als`, in its own folder of the library. Every stem is an
// audio track holding its arrangement clips.

export type SongTrack = { name: string; clips: Element[] };

export type Song = {
  // The song's folder name in the library.
  folder: string;
  // The folder name before its first hyphen, trimmed.
  title: string;
  tracks: SongTrack[];
  // The main track's tempo (FloatEvent) and time-signature (EnumEvent) events, in time order. Live writes the
  // first at Time -63072000; mainEvents reads the value the song starts on.
  tempo: Element[];
  meter: Element[];
  // The song's locators, in time order.
  locators: Element[];
  // The latest clip end, in beats.
  audioEnd: number;
};

// A song as read, with its problems: its content the builder does not handle, then a song with no locators, then each
// WAV its clips refer to that the song folder does not hold. A song not saved by Live 12, or one that cannot be read at
// all, gives only its one problem and no song.
export type SongReading = { song?: Song; problems: string[] };

// The Live version is checked first, on a lenient read: a song saved by an older Live holds what the strict
// parser refuses, and its content cannot be trusted, so it gives the version problem and nothing else.
export async function readSong(library: string, folder: string): Promise<SongReading> {
  const xml = await readAlsXml(join(library, folder, 'MultiTrack.als'));
  const version = versionProblem(folder, rootAttributes(xml));
  if (version) return { problems: [version] };
  const liveSet = child(parseAls(xml).root, 'LiveSet');
  const allTracks = childElements(child(liveSet, 'Tracks'));
  const tracks = allTracks
    .filter((track) => track.name === 'AudioTrack')
    .map((track) => ({
      name: valueOf(track, 'Name', 'EffectiveName'),
      clips: arrangementClips(track),
    }));
  const mainTrack = child(liveSet, 'MainTrack');
  const song: Song = {
    folder,
    title: songTitle(folder),
    tracks,
    tempo: envelopeEvents(mainTrack, 'Tempo'),
    meter: envelopeEvents(mainTrack, 'TimeSignature'),
    locators: byTime(childElements(child(liveSet, 'Locators', 'Locators'), 'Locator'), (locator) => valueOf(locator, 'Time')),
    audioEnd: Math.max(0, ...tracks.flatMap((track) => track.clips.map((clip) => Number(valueOf(clip, 'CurrentEnd'))))),
  };
  // The timeline places a song's End from its locators, so a song with none is stopped here, with the other problems.
  const noLocators = song.locators.length === 0 ? [`${folder}: the song has no locators, which the builder does not handle.`] : [];
  return {
    song,
    problems: [...allTracks.flatMap((track) => contentProblems(folder, track)), ...noLocators, ...(await missingFiles(library, song))],
  };
}

// Each WAV the song's clips refer to inside its folder that the folder does not hold, once each, in track then clip
// order, as a half-synced song folder leaves one. A clip whose file is outside the folder is a content problem
// (STEM_CONTENT), and a file the folder holds but cannot be read is left to the copy. An .asd analysis file is optional.
async function missingFiles(library: string, { folder, tracks }: Song): Promise<string[]> {
  const files = new Set(tracks.flatMap((track) => track.clips.map(fileInSong)).filter((file) => file !== undefined));
  const missing = await Promise.all([...files].map(async (file) => ((await isMissing(join(library, folder, file))) ? [file] : [])));
  return missing.flat().map((file) => `${folder}: ${file} is missing from the song folder.`);
}

// Any other error from stat is not a missing file, and is left to the copy.
async function isMissing(path: string): Promise<boolean> {
  return stat(path).then(
    () => false,
    (error: NodeJS.ErrnoException) => error.code === 'ENOENT' || error.code === 'ENOTDIR',
  );
}

// A song's title, from its folder name: the name before its first hyphen, trimmed, so
// `This Is Amazing Grace-The Ascension-D-98.00bpm` is This Is Amazing Grace.
export function songTitle(folder: string): string {
  return (folder.split('-')[0] ?? folder).trim();
}

// Live 12 writes MajorVersion 5 and a MinorVersion starting `12.`. Any older set, Live 8 or Live 11, is fixed
// the same way.
function versionProblem(folder: string, { MajorVersion, MinorVersion, Creator }: Record<string, string>): string | undefined {
  if (MajorVersion === '5' && MinorVersion?.startsWith('12.')) return undefined;
  return `${folder}: saved by ${Creator ?? 'an unknown Live version'}, not Live 12. Open the song in Live 12 and save it, then build again.`;
}

// What a stem may hold that the builder cannot carry into the set, each with its reason, checked in this order.
const STEM_CONTENT: [reason: string, holds: (track: Element) => boolean][] = [
  ['is frozen', (track) => valueOf(track, 'Freeze') === 'true'],
  // The inner DeviceChain's, not the MainSequencer or FreezeSequencer beside it.
  ['has devices', (track) => holdsAny(child(track, 'DeviceChain', 'DeviceChain', 'Devices'))],
  ['has automation', (track) => holdsAny(child(track, 'AutomationEnvelopes', 'Envelopes'))],
  // An empty take lane holds no clip and is no problem.
  [
    'has clips on a take lane',
    (track) => childElements(child(track, 'TakeLanes', 'TakeLanes'), 'TakeLane').some((lane) => holdsAny(child(lane, 'ClipAutomation', 'Events'))),
  ],
  ['has a warped clip', (track) => arrangementClips(track).some((clip) => valueOf(clip, 'IsWarped') === 'true')],
  ['has a clip with clip envelopes', (track) => arrangementClips(track).some((clip) => holdsAny(child(clip, 'Envelopes', 'Envelopes')))],
  // The MainSequencer's ClipSlotList only. The FreezeSequencer has one too, but it belongs to a frozen stem, which
  // already stops the build. An empty slot holds an empty <Value />.
  [
    'has session-view clips',
    (track) =>
      childElements(child(track, 'DeviceChain', 'MainSequencer', 'ClipSlotList'), 'ClipSlot').some((slot) => holdsAny(child(slot, 'ClipSlot', 'Value'))),
  ],
  ["refers to a file outside the song's folder", (track) => arrangementClips(track).some((clip) => fileInSong(clip) === undefined)],
];

function holdsAny(list: Element): boolean {
  return childElements(list).length > 0;
}

// The song's content the builder does not handle, for one of its tracks: a group or MIDI track, or a stem holding
// any of STEM_CONTENT, one problem per reason however many clips hold it. Return tracks are not stems.
function contentProblems(folder: string, track: Element): string[] {
  const name = valueOf(track, 'Name', 'EffectiveName');
  if (track.name === 'GroupTrack') return [`${folder}: "${name}" is a group track, which the builder does not handle.`];
  if (track.name === 'MidiTrack') return [`${folder}: "${name}" is a MIDI track, which the builder does not handle.`];
  if (track.name !== 'AudioTrack') return [];
  return STEM_CONTENT.filter(([, holds]) => holds(track)).map(([reason]) => `${folder}: the stem "${name}" ${reason}, which the builder does not handle.`);
}

// A track's arrangement clip list lives in the ArrangerAutomation of its MainSequencer's Sample. The
// FreezeSequencer has a Sample of its own, so the path is spelled out here once.
export function arrangerAutomation(track: Element): Element {
  return child(track, 'DeviceChain', 'MainSequencer', 'Sample', 'ArrangerAutomation');
}

function arrangementClips(track: Element): Element[] {
  return childElements(child(arrangerAutomation(track), 'Events'), 'AudioClip');
}

// A clip's WAV, as the path from its song's folder, when the clip refers to a file inside the song's folder (relative
// path type 3), as a re-saved MultiTracks song does for every WAV. A type-3 path that climbs out of the folder once
// normalized, as `../Shared Stems/EG 1.wav` does, or an absolute one, is outside the folder too. The song's absolute
// Path is stale, so the build never reads it.
export function fileInSong(clip: Element): string | undefined {
  const fileRef = child(clip, 'SampleRef', 'FileRef');
  if (valueOf(fileRef, 'RelativePathType') !== '3') return undefined;
  const path = valueOf(fileRef, 'RelativePath');
  return staysInFolder(path) ? path : undefined;
}

function staysInFolder(path: string): boolean {
  const normalized = posix.normalize(path);
  return !posix.isAbsolute(normalized) && normalized !== '..' && !normalized.startsWith('../');
}

// The two main-track mixer parameters a song's tempo map lives in.
export type MainParameter = 'Tempo' | 'TimeSignature';

// The main track's automation envelope for its Tempo or TimeSignature parameter. Envelopes are matched by
// the parameter's AutomationTarget Id, never by position: the order differs from set to set.
export function mainEnvelope(mainTrack: Element, parameter: MainParameter): Element {
  const target = child(mainTrack, 'DeviceChain', 'Mixer', parameter, 'AutomationTarget').attributes.Id;
  const envelope = childElements(child(mainTrack, 'AutomationEnvelopes', 'Envelopes'), 'AutomationEnvelope').find(
    (candidate) => valueOf(candidate, 'EnvelopeTarget', 'PointeeId') === target,
  );
  if (!envelope) throw new Error(`The set has no ${parameter} envelope on its main track.`);
  return envelope;
}

// A song's tempo or time-signature map, read from beat 0, where the song starts. `start` is a copy of its first
// event, the one Live writes at Time -63072000, holding the value the song starts on: that of its last event at
// or before beat 0. `later` holds its events after beat 0, in time order. Live ramps from one tempo event to the next,
// so when the starting tempo comes from an event other than the -63072000 one and the first event after beat 0 holds
// another tempo, `later` opens with that event again at beat 0, where the ramp starts. The meter's events are steps,
// and a song whose only event at or before beat 0 is the -63072000 one is read as it is.
export function mainEvents(song: Song, parameter: MainParameter): { start: Element; later: Element[] } {
  const events = parameter === 'Tempo' ? song.tempo : song.meter;
  const [first] = events;
  const source = startingEvent(events);
  const value = source?.attributes.Value;
  if (!first || !source || value === undefined) throw new Error(`${song.folder} has no starting ${parameter} value.`);
  const start = structuredClone(first);
  start.attributes.Value = value;
  const later = events.filter((event) => Number(event.attributes.Time) > 0);
  const rampStart = parameter === 'Tempo' && Number(source.attributes.Time) !== LIVE_START && later[0] !== undefined && later[0].attributes.Value !== value;
  return { start, later: rampStart ? [atBeatZero(source), ...later] : later };
}

// The Time Live writes a song's first main-track event at.
const LIVE_START = -63072000;

function atBeatZero(event: Element): Element {
  const copy = structuredClone(event);
  copy.attributes.Time = '0';
  return copy;
}

// Whether mainEvents can read the song's starting tempo and its starting meter.
export function hasStartingValues(song: Song): boolean {
  return startingValue(song.tempo) !== undefined && startingValue(song.meter) !== undefined;
}

function startingValue(events: Element[]): string | undefined {
  return startingEvent(events)?.attributes.Value;
}

// The event the song's starting value comes from: its last event at or before beat 0.
function startingEvent(events: Element[]): Element | undefined {
  return events.findLast((event) => Number(event.attributes.Time) <= 0);
}

function envelopeEvents(mainTrack: Element, parameter: MainParameter): Element[] {
  return byTime(childElements(child(mainEnvelope(mainTrack, parameter), 'Automation', 'Events')));
}
