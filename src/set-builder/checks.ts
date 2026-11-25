import { valueOf, type Element } from './als.ts';
import type { StemMap, Transition } from './build-set.ts';
import type { Pad } from './pads.ts';
import { hasStartingValues, mainEvents, type Song, type SongTrack } from './song.ts';
import { padTrack, stemTargets, type SharedName, type Target } from './template.ts';
import { findEnding, findIntro, onBarLine, padAudio, ringingBeat, silenceAfter } from './timeline.ts';

// The checks of the template and each song against the stem map. Each problem is one line the operator can act on.

// Each map name the template lacks, in map order, then each template group or single track the map lacks, in
// template track order, then each name more than one template group, or single track, carries, and each name a group
// and a single track share, in template track order (sharedTargetNames), then each stem the map lists under more than
// one target, in map order (repeatedStemProblems).
export function templateProblems(targets: Map<string, Target>, stemMap: StemMap, sharedNames: SharedName[]): string[] {
  return [
    ...Object.keys(stemMap)
      .filter((name) => !targets.has(name))
      .map((name) => `The template has no group or single track named "${name}", which the stem map lists.`),
    ...[...targets]
      .filter(([name]) => !Object.hasOwn(stemMap, name))
      .map(([name, { kind }]) => `The stem map has no entry for the template's ${kind} "${name}".`),
    ...sharedNames.map(({ kind, name }) =>
      kind === 'group and single track'
        ? `The template has a group and a single track named "${name}".`
        : `The template has more than one ${kind} named "${name}".`,
    ),
    ...repeatedStemProblems(stemMap),
  ];
}

// Each stem the map lists under more than one target, once, in the order the map first lists it, walking its targets
// in order and each target's stems in order, naming every target that lists it, in map order. Each stem goes to one
// target, so the build stops on a stem under two, whether or not a song in the build has that stem. A stem listed twice
// under one target still goes to that one target, so it is no problem.
function repeatedStemProblems(stemMap: StemMap): string[] {
  const targetsOf = new Map<string, Set<string>>();
  for (const [target, stems] of Object.entries(stemMap)) {
    for (const stem of stems) targetsOf.set(stem, (targetsOf.get(stem) ?? new Set()).add(target));
  }
  return [...targetsOf]
    .filter(([, targets]) => targets.size > 1)
    .map(([stem, targets]) => {
      const names = [...targets];
      return `The stem map lists the stem "${stem}" under ${names.slice(0, -1).join(', ')} and ${names.at(-1)}.`;
    });
}

// A template with no PAD track, when the build asks for a pad. A build with no pad needs none.
export function padTrackProblems(liveSet: Element, transitions: Partial<Record<number, Transition>>): string[] {
  const asksForPad = Object.values(transitions).some((transition) => transition?.type === 'pad');
  if (!asksForPad || padTrack(liveSet)) return [];
  return ['The template has no single track named "PAD", which a pad plays on. Add an audio track named PAD outside every group.'];
}

// Each of the song's stems the map does not list, in the song's track order; then each target the song has more
// stems for than the target has tracks, in map order. A target the template lacks is left out: its template
// problem already names it. Each count leaves out a stem the map lists under more than one target, whose repeated-stem
// problem names it.
export function stemProblems(song: Song, targets: Map<string, Target>, stemMap: StemMap): string[] {
  const targetOf = stemTargets(stemMap);
  const unmapped = song.tracks
    .filter((stem) => !targetOf.has(stem.name))
    .map((stem) => `${song.folder}: the stem map has no group for the stem "${stem.name}".`);
  const tooMany = Object.keys(stemMap).flatMap((name) => {
    const available = targets.get(name)?.tracks.length;
    const count = song.tracks.filter((stem) => targetOf.get(stem.name) === name).length;
    return available !== undefined && count > available ? [`${song.folder}: ${name} needs ${count} tracks for this song, and the template has ${available}.`] : [];
  });
  return [...unmapped, ...tooMany];
}

// Each overlap's problems, in service order of the overlaps: an overlap from a song with no locator named Ending; else
// from a song whose Ending is not on a bar line of its own meter (onBarLine), left unchecked for a song with no
// starting tempo or meter, whose bars cannot be walked; then each group, in map order, that has too few tracks for the
// song the overlap starts (slotProblems), counting every earlier song whose ring still holds a track there, from the
// Ending as stored. A problem two overlaps give is named once. `service` holds the song at each position, or undefined
// where the position's name matched no song or its song could not be read: its own problem already names it, and no
// overlap's track count reaches back through it.
export function overlapProblems(
  service: (Song | undefined)[],
  transitions: Partial<Record<number, Transition>>,
  targets: Map<string, Target>,
  stemMap: StemMap,
): string[] {
  const problems = service.flatMap((song, index) => {
    if (!song || transitions[index + 1]?.type !== 'overlap') return [];
    const ending = findEnding(song);
    if (ending === undefined) return [`${song.folder}: the song has no locator named Ending, where an overlap starts the next song's Count Off.`];
    const offBar =
      hasStartingValues(song) && !onBarLine(song, ending)
        ? [`${song.folder}: the song's Ending, on beat ${ending}, is not on a bar line, where an overlap starts the next song's Count Off.`]
        : [];
    const next = service[index + 1];
    return [...offBar, ...(next ? slotProblems(next, ringingSongs(service, transitions, index + 1), targets, stemMap) : [])];
  });
  return [...new Set(problems)];
}

// Each song an overlap or a pad goes into with no section after its Count Off, in service order, named once.
export function introProblems(service: (Song | undefined)[], transitions: Partial<Record<number, Transition>>): string[] {
  const problems = service.flatMap((song, index) => {
    const into = transitions[index]?.type;
    if (!song || (into !== 'overlap' && into !== 'pad') || findIntro(song) !== undefined) return [];
    return [`${song.folder}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`];
  });
  return [...new Set(problems)];
}

// A pad file's last seconds, which its pad clip stays clear of: the file's own fade-out (measured in E.wav of the
// library's pad pack, about 18 s), with a margin.
export const FILE_FADE_OUT_SECONDS = 20;

// Each pad's problem, in service order: a pad after a song with no locator named Ending, where its clip starts, named once
// for the song; else a pad file too short for its clip (padAudio) and FILE_FADE_OUT_SECONDS after it. The file is left
// unchecked when the clip cannot be measured: for a pad whose file could not be found or read, whose own problem names
// it; when the song or the holder has no starting tempo or meter; when the song after the pad stands in the service with
// its own problem; or when it has no Intro (introProblems).
export function padProblems(service: (Song | undefined)[], transitions: Partial<Record<number, Transition>>, pads: Record<number, Pad>): string[] {
  const problems = service.flatMap((song, index) => {
    const position = index + 1;
    if (!song || transitions[position]?.type !== 'pad') return [];
    if (findEnding(song) === undefined) return [`${song.folder}: the song has no locator named Ending, where a pad starts.`];
    const file = pads[position]?.file;
    const last = position === service.length;
    const next = service[position];
    if (!file || !hasStartingValues(song) || (!last && (!next || !hasStartingValues(next) || findIntro(next) === undefined))) return [];
    const { from, seconds } = padAudio(song, next);
    const lasts = file.frames / file.sampleRate;
    const needs = from + seconds + FILE_FADE_OUT_SECONDS;
    if (lasts >= needs) return [];
    const shown = (value: number) => Number(value.toFixed(3));
    return [
      `The pad after song ${position} plays ${file.name}, which lasts ${shown(lasts)} s. Its clip plays the file from ${shown(from)} s to ${shown(from + seconds)} s, and the file's last ${FILE_FADE_OUT_SECONDS} s are its own fade-out, so the pad needs a file of at least ${shown(needs)} s.`,
    ];
  });
  return [...new Set(problems)];
}

// A song before the one an overlap starts, and whether a stem of it still holds a track where that song starts.
type RingingSong = { song: Song; holds: (stem: SongTrack) => boolean };

// The songs whose ring can hold a track where the song at `index`, which an overlap starts, starts: the song right
// before it, then back through the songs before that while an overlap goes into the song after each, in service order.
// A position with no song, a song with no locator named Ending, whose own problem names it, or a gap or a pad into the
// song after it ends the run. An overlap puts the next song's beat 0 on the song's Ending, so the song at `index` starts,
// in each earlier song's own beats, on the sum of the Endings from that song on.
function ringingSongs(service: (Song | undefined)[], transitions: Partial<Record<number, Transition>>, index: number): RingingSong[] {
  const songs: RingingSong[] = [];
  let start = 0;
  for (let position = index - 1; position >= 0; position--) {
    const song = service[position];
    const next = service[position + 1];
    const ending = song && findEnding(song);
    if (!song || !next || ending === undefined || transitions[position + 1]?.type !== 'overlap') break;
    start += ending;
    songs.unshift({ song, holds: holdsAt(song, ending, next, start, position === index - 1) });
  }
  return songs;
}

// Whether a stem of `song`, which overlaps into `next` from its Ending, holds its track on beat `start` of its own: a
// clip of the stem, placed as cutOrRing places it, still sounds there. A clip that ends by the Ending keeps its end; a
// ringing one ends on the beat it rings to or on the next song's silence point, whichever comes first, and one that would
// start ringing at or after the silence point is dropped. A stem's clips share one track. When the next song has no
// Intro, whose own problem names it, or no starting tempo or meter, which placement throws on, the ring's end is unknown:
// for the song right before the one the overlap starts, `rightBefore`, every clip that ends after the Ending holds its
// track, and for an earlier song none does.
function holdsAt(song: Song, ending: number, next: Song, start: number, rightBefore: boolean): (stem: SongTrack) => boolean {
  const intro = hasStartingValues(next) ? findIntro(next) : undefined;
  if (intro === undefined) return (stem) => rightBefore && stem.clips.some((clip) => Number(valueOf(clip, 'CurrentEnd')) > ending);
  const nextTempo = Number(valueOf(mainEvents(next, 'Tempo').start));
  const silence = ending + silenceAfter(next, intro);
  const ringing = (beat: number) => ringingBeat(song, ending, nextTempo, beat);
  const sounds = (clip: Element) => {
    const end = Number(valueOf(clip, 'CurrentEnd'));
    if (end <= ending) return end > start;
    return ringing(Number(valueOf(clip, 'CurrentStart'))) < silence && Math.min(ringing(end), silence) > start;
  };
  return (stem) => stem.clips.some(sounds);
}

// Each group, in map order, with fewer tracks than the song an overlap starts, `started`, needs there: one for each stem
// of an earlier song (`earlier`, ringingSongs) that still holds a track where the song starts, and one for each of the
// song's own stems. The problem names the songs from the earliest one that holds a track in the group, or the song right
// before when none before it does, through `started`, with each one's share. Single tracks are left out: the overlap cuts
// the click and the guide on the Ending, so they never ring. A target the template lacks is left out: its template
// problem already names it. Each count leaves out a stem the map lists under more than one target, whose repeated-stem
// problem names it.
function slotProblems(started: Song, earlier: RingingSong[], targets: Map<string, Target>, stemMap: StemMap): string[] {
  const targetOf = stemTargets(stemMap);
  return Object.keys(stemMap).flatMap((name) => {
    const target = targets.get(name);
    if (target?.kind !== 'group') return [];
    const shares = earlier.map(({ song, holds }) => song.tracks.filter((stem) => targetOf.get(stem.name) === name && holds(stem)).length);
    const first = shares.findIndex((share) => share > 0);
    const from = first === -1 ? earlier.length - 1 : first;
    const rings = shares.slice(from);
    const coming = started.tracks.filter((stem) => targetOf.get(stem.name) === name).length;
    const needed = rings.reduce((sum, share) => sum + share, coming);
    const available = target.tracks.length;
    if (needed <= available) return [];
    const songs = [...earlier.slice(from).map(({ song }) => song.folder), started.folder].join(' into ');
    const counts = [...rings.map((share, at) => `${share} for the ${ordinal(at + 1)} song's ring`), `${coming} for the ${ordinal(rings.length + 1)} song`];
    const overlaps = rings.length > 1 ? 'the overlaps need' : 'the overlap needs';
    return [`${songs}: ${overlaps} ${needed} ${name} tracks, ${counts.slice(0, -1).join(', ')} and ${counts.at(-1)}, and the template has ${available}.`];
  });
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ORDINAL_SUFFIXES: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'st', two: 'nd', few: 'rd' };

// The ordinal of `n`, from 1, as a word, or past the tenth as digits and a suffix.
function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}${ORDINAL_SUFFIXES[new Intl.PluralRules('en-US', { type: 'ordinal' }).select(n)] ?? 'th'}`;
}
