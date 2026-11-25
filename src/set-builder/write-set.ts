import { join } from 'node:path';
import { byTime, child, removeChildElements, replaceListItems, setValue, valueOf, type AlsDocument, type Element } from './als.ts';
import { projectFile } from './audio.ts';
import type { StemMap } from './build-set.ts';
import { padProjectFile, type PadFile } from './pads.ts';
import { arrangerAutomation, mainEnvelope, mainEvents, type MainParameter, type Song } from './song.ts';
import { secondsBetween } from './tempo.ts';
import { padTrack, stemTargets, type Target } from './template.ts';
import { introOf, isEndMarker, padAudio, ringingBeat, silenceAfter, type PadSection, type PlacedSong } from './timeline.ts';

// Writes the placed songs into the template, which becomes the built set.

export type SetPlace = {
  // The project folder that holds the built .als and the copied audio; clip file references are relative
  // to it.
  projectFolder: string;
};

// `targets` are the set's own, from templateTargets; buildSet has checked them, and every stem, against the map. `pads`
// holds the pad file each pad plays, by the song position it follows; buildSet has checked that the template has a PAD
// track when there is one.
export function writeSet(
  set: AlsDocument,
  targets: Map<string, Target>,
  placed: PlacedSong[],
  stemMap: StemMap,
  place: SetPlace,
  pads: Record<number, PadFile>,
): void {
  const liveSet = child(set.root, 'LiveSet');
  placeClips(targets, placed, stemMap, place);
  placePads(liveSet, placed, pads, place);
  const mainTrack = child(liveSet, 'MainTrack');
  for (const parameter of ['Tempo', 'TimeSignature'] as const) replaceEnvelope(mainTrack, parameter, stitch(placed, parameter));
  const locators = placed.flatMap(locatorsFor);
  replaceListItems(child(liveSet, 'Locators'), 'Locators', numbered(byTime(locators, (locator) => valueOf(locator, 'Time'))));
  // The set opens with the arrangement loop off and the playhead at the start.
  setValue(liveSet, ['Transport', 'LoopOn'], 'false');
  setValue(liveSet, ['Transport', 'CurrentTime'], '0');
}

// Each stem's clips go onto the next free track of the target the map names, in the song's track order. A track is
// free for a song when it holds no clip still sounding where the song starts, as a clip an overlap rings on, so a
// song after a gap fills a group from its first track again. A track's clips are written once, after every song.
function placeClips(targets: Map<string, Target>, placed: PlacedSong[], stemMap: StemMap, place: SetPlace): void {
  const targetOf = stemTargets(stemMap);
  const clipsFor = new Map<Element, Element[]>();
  // The set beat each track's clips sound until.
  const soundingUntil = new Map<Element, number>();
  for (const [position, { song, offset }] of placed.entries()) {
    const overlap = overlapAfter(placed, position);
    const silent = (track: Element) => (soundingUntil.get(track) ?? -Infinity) <= offset;
    // Each target's tracks still free for the song, in track order.
    const free = new Map<string, Element[]>();
    for (const stem of song.tracks) {
      // buildSet's checks have stopped a stem with no target or more than one target, or with no track left on its
      // target, counting, where an overlap starts the song, the tracks every earlier song's ringing clips still hold
      // there (overlapProblems), so these throws are guards.
      const target = targetOf.get(stem.name);
      if (target === undefined) throw new Error(`The stem "${stem.name}" in ${song.folder} has no target.`);
      const destination = targets.get(target);
      const [track, ...rest] = free.get(target) ?? destination?.tracks.filter(silent) ?? [];
      if (!destination || !track) throw new Error(`${target} has no free track for the stem "${stem.name}" in ${song.folder}.`);
      free.set(target, rest);
      const clips = stem.clips.flatMap((clip) => {
        const played = overlap ? cutOrRing(clip, song, destination.kind, overlap) : clip;
        return played ? [copyClip(played, song, offset, place)] : [];
      });
      clipsFor.set(track, [...(clipsFor.get(track) ?? []), ...clips]);
      const ends = clips.map((clip) => Number(valueOf(clip, 'CurrentEnd')));
      soundingUntil.set(track, Math.max(soundingUntil.get(track) ?? -Infinity, ...ends));
    }
  }
  for (const [track, clips] of clipsFor) {
    replaceListItems(arrangerAutomation(track), 'Events', numbered(byTime(clips)));
  }
}

// The pad clips on the template's PAD track, written once, after every song: one for each pad. A set with no pad leaves
// the PAD track, and a template with none, as they are.
function placePads(liveSet: Element, placed: PlacedSong[], pads: Record<number, PadFile>, place: SetPlace): void {
  const clips = placed.flatMap((song, index) => {
    if (!song.pad) return [];
    const file = pads[song.number];
    if (!file) throw new Error(`The pad after song ${song.number} has no pad file.`);
    return [padClip(song, placed[index + 1], file, place)];
  });
  if (clips.length === 0) return;
  const track = padTrack(liveSet);
  if (!track) throw new Error('The template has no PAD track for the pads.');
  replaceListItems(arrangerAutomation(track), 'Events', numbered(byTime(clips)));
}

// The clip that plays the pad file after `song`, before `next`, or after the last song when `next` is undefined. It
// starts on the song's Ending (padSection), under its last bars, and runs through the Pad section: before a song, on
// through its Count Off to its silence point (introAndSilence), fading out from its Intro, so the pad sounds under the
// count-off and fades into the song; after the last song, on through the fade after the section to the song's End,
// fading out over it. The clip is a copy of the holder's first clip, the next song's or after the last song the song's
// own, so it takes the shape Live writes for an unwarped song clip, and it plays the file from `from` for the seconds the
// set takes over it (padAudio). It refers to the file's copy in the project the way Live writes a file inside the
// project, and carries what Live records for a file it has never seen: the file's real size, CRC 0 (Live skips the
// check), its modification time, and its length in frames and sample rate. Live names a clip after its file. The copied
// clip's own gain, transposition, activation and loop switch would play the pad as they play the song clip, so the pad
// clip plays at gain 1, untransposed, enabled and unlooped, as Live plays a WAV dropped on a track. Its fade-in is left
// at Live's default, whatever the copied clip carries: the file's own swell brings it in. A warped song clip, or one with
// clip envelopes, has already stopped the build (readSong).
function padClip(song: PlacedSong, next: PlacedSong | undefined, file: PadFile, place: SetPlace): Element {
  const pad = song.pad;
  if (!pad) throw new Error(`Song ${song.number} has no pad after it.`);
  const holder = next ?? song;
  const shape = holder.song.tracks.flatMap((track) => track.clips)[0];
  if (!shape) throw new Error(`${holder.song.folder} has no clip for the pad clip beside it to copy.`);
  const clip = structuredClone(shape);
  const start = song.offset + pad.clipStart;
  const { end, fadeOut } = padClipEnd(song, pad, next);
  clip.attributes.Time = String(start);
  setValue(clip, ['CurrentStart'], String(start));
  setValue(clip, ['CurrentEnd'], String(end));
  const { from, seconds } = padAudio(song.song, next?.song);
  for (const name of ['LoopStart', 'HiddenLoopStart']) setValue(clip, ['Loop', name], String(from));
  setValue(clip, ['Loop', 'StartRelative'], '0');
  for (const name of ['LoopEnd', 'OutMarker', 'HiddenLoopEnd']) setValue(clip, ['Loop', name], String(from + seconds));
  setValue(clip, ['Loop', 'LoopOn'], 'false');
  setValue(clip, ['SampleVolume'], '1');
  setValue(clip, ['PitchCoarse'], '0');
  setValue(clip, ['PitchFine'], '0');
  setValue(clip, ['Disabled'], 'false');
  setValue(clip, ['Name'], file.key);
  const sampleRef = child(clip, 'SampleRef');
  const fileRef = child(sampleRef, 'FileRef');
  const relative = padProjectFile(file);
  setValue(fileRef, ['RelativePathType'], '3');
  setValue(fileRef, ['RelativePath'], relative);
  setValue(fileRef, ['Path'], join(place.projectFolder, relative));
  setValue(fileRef, ['OriginalFileSize'], String(file.size));
  setValue(fileRef, ['OriginalCrc'], '0');
  setValue(sampleRef, ['LastModDate'], String(file.modified));
  setValue(sampleRef, ['DefaultDuration'], String(file.frames));
  setValue(sampleRef, ['DefaultSampleRate'], String(file.sampleRate));
  setDefaultFade(clip, 'In');
  setFade(clip, 'Out', fadeOut);
  return clip;
}

// Where the pad clip after `song` ends, in set beats, and the beats it fades out over: before `next`, its silence point
// and the 2 bars from its Intro (introAndSilence); after the last song, the song's End, at the end of the fade after the
// Pad section, and that fade.
function padClipEnd(song: PlacedSong, pad: PadSection, next: PlacedSong | undefined): { end: number; fadeOut: number } {
  if (!next) return { end: song.offset + song.end, fadeOut: pad.fadeOut };
  const { intro, silence } = introAndSilence(next);
  return { end: next.offset + silence, fadeOut: silence - intro };
}

// What an overlap after a song needs to cut and ring its clips: the song's Ending, in its own beats, and the tempo, in
// BPM, the next song starts on, which the set holds from the Ending on; and, in the song's own beats, the next song's
// Intro, where its ringing clips start to fade, and its silence point, where the fade ends and the ring is cut
// (introAndSilence).
type Overlap = { ending: number; nextTempo: number; intro: number; silence: number };

function overlapAfter(placed: PlacedSong[], index: number): Overlap | undefined {
  const song = placed[index];
  const next = placed[index + 1];
  if (song?.transition?.type !== 'overlap' || !next) return undefined;
  // The next song's beat 0 is on the song's Ending, so a beat of the next song is the Ending plus that beat.
  const { intro, silence } = introAndSilence(next);
  return { ending: song.end, nextTempo: Number(valueOf(mainEvents(next.song, 'Tempo').start)), intro: song.end + intro, silence: song.end + silence };
}

// The Intro of `next`, the song after an overlap or a pad, and its silence point, in its own beats: its Intro (introOf),
// and 2 bars of its starting meter after it, where what plays before the song, a ringing clip or a pad clip, has faded
// out.
function introAndSilence(next: PlacedSong): { intro: number; silence: number } {
  const intro = introOf(next.song);
  return { intro, silence: silenceAfter(next.song, intro) };
}

// A clip of a song an overlap starts from, in the song's own beats, as it plays over the next song. A clip that ends
// by the Ending plays as it is. On a single track (the click and the guide) a clip stops on the Ending: its end there,
// and its audio cut there too, at the seconds the song takes to reach it; one that starts at or after the Ending is
// dropped. Any other clip rings on: the part of it after the Ending lasts the seconds it lasts in the song, so in the set
// it lasts that many seconds' beats at the next song's starting tempo. The ring stops on the silence point: a clip that
// would ring past it is cut there, its end and its audio, and one that would start ringing there or later is dropped.
// A ringing clip still sounding at the next song's Intro fades out from the Intro to its end, or from its own start when
// it starts ringing after the Intro, since a fade cannot cross the clip's start. One that ends by the Intro gets none.
function cutOrRing(clip: Element, song: Song, kind: Target['kind'], { ending, nextTempo, intro, silence }: Overlap): Element | undefined {
  const start = Number(valueOf(clip, 'CurrentStart'));
  const end = Number(valueOf(clip, 'CurrentEnd'));
  if (end <= ending) return clip;
  const copy = structuredClone(clip);
  if (kind === 'single track') {
    if (start >= ending) return undefined;
    setValue(copy, ['CurrentEnd'], String(ending));
    const audioEnd = String(Number(valueOf(copy, 'Loop', 'LoopStart')) + secondsBetween(song, start, ending));
    for (const name of ['LoopEnd', 'OutMarker', 'HiddenLoopEnd']) setValue(copy, ['Loop', name], audioEnd);
    return copy;
  }
  const ringing = (beat: number) => ringingBeat(song, ending, nextTempo, beat);
  const ringStart = ringing(start);
  if (ringStart >= silence) return undefined;
  const ringsTo = ringing(end);
  const ringEnd = Math.min(ringsTo, silence);
  copy.attributes.Time = String(ringing(Number(copy.attributes.Time)));
  setValue(copy, ['CurrentStart'], String(ringStart));
  setValue(copy, ['CurrentEnd'], String(ringEnd));
  if (ringsTo > silence) {
    // The cut audio plays the seconds the song takes from the clip's start to the Ending, through its own tempo map, then
    // the beats from there to the silence point at the next song's starting tempo.
    const ringSeconds = ((silence - Math.max(ringStart, ending)) * 60) / nextTempo;
    const audioEnd = String(Number(valueOf(copy, 'Loop', 'LoopStart')) + secondsBetween(song, start, Math.max(start, ending)) + ringSeconds);
    for (const name of ['LoopEnd', 'OutMarker', 'HiddenLoopEnd']) setValue(copy, ['Loop', name], audioEnd);
  }
  if (ringEnd > intro) setFade(copy, 'Out', ringEnd - Math.max(intro, ringStart));
  return copy;
}

// Gives the clip a fade on one side, `length` beats long. Proven in Live 12.4.6: an unwarped clip's fade length is in
// arrangement beats, written with the side's IsDefault flag false.
function setFade(clip: Element, side: 'In' | 'Out', length: number): void {
  setValue(clip, ['Fades', `Fade${side}Length`], String(length));
  setValue(clip, ['Fades', `IsDefaultFade${side}`], 'false');
}

// Gives the clip no fade on one side, as Live writes a side left at its default: length 0, the IsDefault flag true.
function setDefaultFade(clip: Element, side: 'In' | 'Out'): void {
  setValue(clip, ['Fades', `Fade${side}Length`], '0');
  setValue(clip, ['Fades', `IsDefaultFade${side}`], 'true');
}

// A copy of the song's clip, moved by the song's offset (its Loop values stay), pointing at its WAV's copy in
// the project the way Live writes a file inside the project: relative path type 3, the path from the project
// folder, and the absolute path. OriginalFileSize, OriginalCrc and LastModDate stay as Live wrote them, since
// the copy is the same file.
function copyClip(clip: Element, song: Song, offset: number, place: SetPlace): Element {
  const copy = structuredClone(clip);
  const time = copy.attributes.Time;
  if (time === undefined) throw new Error(`A clip in ${song.folder} has no Time.`);
  copy.attributes.Time = moved(time, offset);
  for (const name of ['CurrentStart', 'CurrentEnd']) setValue(copy, [name], moved(valueOf(copy, name), offset));
  const file = projectFile(song, clip);
  const fileRef = child(copy, 'SampleRef', 'FileRef');
  setValue(fileRef, ['RelativePath'], file);
  setValue(fileRef, ['Path'], join(place.projectFolder, file));
  return copy;
}

// One tempo or time-signature map for the whole set. Each song's events come at their own times plus its
// offset, up to its handoff: a later one would play on in the gap and the next song, and one at the handoff would
// stand beside the next song's starting value. So before an overlap, a song's events at or after its Ending go, and
// before a pad, those at or after its Pad locator, so the Pad section holds the next song's starting values. At each
// handoff the next song's starting value comes in: the tempo as an instant step, two events at one Time, from the tempo
// the previous song has reached there to the new one, and the meter as one event. A song's events at or before its beat
// 0 make its starting value; a tempo ramp that starts at its beat 0 keeps its start there (mainEvents), except after an
// overlap, whose opening already sits on that beat. The last song keeps every event, unless a pad follows it: then it keeps those before its
// Pad locator, its handoff, and steps back there to its own starting value, as if it handed off to itself, so a late
// fermata or meter change never sets the click over the Pad section.
function stitch(placed: PlacedSong[], parameter: MainParameter): Element[] {
  const songs = placed.map(({ song, offset, handoff, pad }, index) => {
    const { start, later } = mainEvents(song, parameter);
    const previous = placed[index - 1];
    // Song 1's starting value stays at its first event's Time; a later song's comes in at the handoff before it.
    const opening = previous ? copyAt(start, previous.handoff) : start;
    return {
      start,
      opening,
      // A tempo ramp's start at the song's beat 0 goes when an overlap already brings the opening in there.
      later: later.map((event) => copyAt(event, timeOf(event) + offset)).filter((event) => timeOf(event) > timeOf(opening)),
      handoff,
      last: index === placed.length - 1,
      pad,
    };
  });
  return songs.flatMap(({ start, opening, later, handoff, last, pad }) => {
    if (last && !pad) return [opening, ...later];
    const kept = [opening, ...later.filter((event) => timeOf(event) < handoff)];
    const reached = parameter === 'Tempo' ? [tempoReached(opening, later, handoff)] : [];
    // The next song brings its starting value to the handoff as its opening; a pad after the last song brings back the
    // song's own.
    return [...kept, ...reached, ...(last ? [copyAt(start, handoff)] : [])];
  });
}

// An event at `time` holding the tempo a song's events have reached there, coming from before it. Live ramps
// from one tempo event to the next, so an event after `time` sets the slope of the ramp that runs through it,
// and of an instant step at `time`, the first event holds the tempo the song arrives at.
function tempoReached(opening: Element, later: Element[], time: number): Element {
  const last = later.findLast((event) => timeOf(event) < time) ?? opening;
  const next = later.find((event) => timeOf(event) >= time);
  if (!next || timeOf(next) === time) return copyAt(next ?? last, time);
  const reached = copyAt(last, time);
  const share = (time - timeOf(last)) / (timeOf(next) - timeOf(last));
  reached.attributes.Value = String(Number(valueOf(last)) + share * (Number(valueOf(next)) - Number(valueOf(last))));
  return reached;
}

function timeOf(event: Element): number {
  return Number(event.attributes.Time);
}

// A copy of an envelope event at `time`.
function copyAt(event: Element, time: number): Element {
  const copy = structuredClone(event);
  copy.attributes.Time = String(time);
  return copy;
}

// The template's envelope keeps its own target; its events become the stitched ones, numbered 0 to n in time
// order, and the parameter's Manual value becomes song 1's starting value, the first of them. mainEvents has
// already stopped on a song with no starting value.
function replaceEnvelope(mainTrack: Element, parameter: MainParameter, events: Element[]): void {
  const stitched = numbered(byTime(events));
  replaceListItems(child(mainEnvelope(mainTrack, parameter), 'Automation'), 'Events', stitched);
  const [start] = stitched;
  if (start) setValue(mainTrack, ['DeviceChain', 'Mixer', parameter, 'Manual'], valueOf(start));
}

// The song's locators in the controller's grammar, `<song number> - <section>`, moved by its offset:
// `Count Off` carries the title, each end marker becomes `End`, and the computer-key
// mappings are dropped so two songs never share a key. A song with no end marker gets the `End` the
// timeline gave it, made from its first locator; the timeline has already stopped on a song with none. Before an
// overlap the song's End is its Ending: its end marker moves there, and every other locator at or after it, the Ending
// itself included, is dropped. Before a pad the song keeps every locator, gains `N - Pad` on its Pad locator, and its
// end marker moves to the end of the Pad section, the next song's Count Off. After the last song, a pad's section ends on
// `N - Pad Out`, so a loop on the Pad holds no fade, and the end marker moves to the end of the fade after it. Only the
// inner locator list is written; the template's own locator key mappings stay as they are.
function locatorsFor({ song, number, offset, end, endAdded, transition, pad }: PlacedSong): Element[] {
  const overlap = transition?.type === 'overlap';
  const marker = song.locators.find(isEndMarker);
  const kept = overlap ? song.locators.filter((locator) => locator === marker || Number(valueOf(locator, 'Time')) < end) : song.locators;
  const locators = kept.map((locator) => {
    const copy = structuredClone(locator);
    removeChildElements(copy, 'Mapping');
    const name = valueOf(copy, 'Name');
    const section = name === 'Count Off' ? `Count Off (${song.title})` : isEndMarker(copy) ? 'End' : name;
    setValue(copy, ['Name'], `${number} - ${section}`);
    setValue(copy, ['Time'], locator === marker && (overlap || pad) ? String(offset + end) : moved(valueOf(copy, 'Time'), offset));
    return copy;
  });
  const [first] = song.locators;
  if (pad && first) locators.push(plainLocator(first, `${number} - Pad`, offset + pad.at));
  if (pad && pad.fadeOut > 0 && first) locators.push(plainLocator(first, `${number} - Pad Out`, offset + pad.at + pad.length));
  if (endAdded && first) locators.push(plainLocator(first, `${number} - End`, offset + end));
  return locators;
}

// A plain locator named `name` at `time`, made from a copy of `layout`, one of the song's own, so it keeps Live's
// layout.
function plainLocator(layout: Element, name: string, time: number): Element {
  const locator = structuredClone(layout);
  removeChildElements(locator, 'Mapping');
  setValue(locator, ['Time'], String(time));
  setValue(locator, ['Name'], name);
  setValue(locator, ['Annotation'], '');
  setValue(locator, ['IsSongStart'], 'false');
  return locator;
}

// A song position, `value`, as a set position.
function moved(value: string, offset: number): string {
  return String(Number(value) + offset);
}

// The list's elements with their Ids set to 0 to n in list order.
function numbered(elements: Element[]): Element[] {
  elements.forEach((element, id) => (element.attributes.Id = String(id)));
  return elements;
}
