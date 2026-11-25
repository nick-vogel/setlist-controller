import { valueOf, type Element } from './als.ts';
import type { Transition } from './build-set.ts';
import { barAfter, barLength, barLineAtOrAfter, roundUpToBar, type Meter } from './meter.ts';
import { mainEvents, type Song } from './song.ts';
import { secondsBetween } from './tempo.ts';

// Places the songs end to end. Song 1 starts at beat 0. Each song hands off to the next at a set beat, its handoff,
// where the next song's starting tempo and meter come in, by the transition after it:
// - a gap: the song's end point is the later of its audio end and its End; the handoff is the first bar line at or
//   after that end point, walked through the song's own meter changes, counting an audio end at most the tolerance
//   past a bar line as on it (onOrNextBarLine), and the next song starts 4 bars of its own starting meter later.
// - an overlap: the song's End moves onto its Ending locator, which is the handoff, and the next song's Count Off
//   starts there, over the song's last bars.
// - a pad: the handoff is the Pad locator, the first bar line at or after the song's audio end, walked through the
//   song's own meter, counting an audio end at most the tolerance past a bar line as on it (onOrNextBarLine), and the
//   Pad section after it lasts PAD_SECONDS in beats at the next song's starting tempo, rounded down to whole bars of the
//   next song's starting meter. The song's End moves to the section's end, where the next song's Count Off starts. The
//   pad clip starts earlier, on the song's Ending, under its last bars.
// The last song hands off to no song, so its transition is a pad or none. A pad after it is placed as one between
// songs, but its handoff steps back to the song's own starting tempo and meter, which its Pad section holds and is
// sized by, and a fade of PAD_OUT_BARS of that meter follows the section: the song's End moves to the end of the fade.
// The built set's meter is each song's own up to its handoff, then the next song's, so its bars are counted song by
// song.

export type PlacedSong = {
  song: Song;
  // The song's position in the service, from 1: the number its locators carry.
  number: number;
  // The song's start beat in the built set.
  offset: number;
  // The bar of the built set the song starts on, from 1.
  bar: number;
  // The song's own meter, from its beat 0, which its bars were walked through.
  meter: Meter;
  // The song's End, in the song's own beats: its end marker, the End the build adds, or, before an overlap, its Ending,
  // or, before a pad, the end of its Pad section, or, for a pad after the last song, the end of the fade after it.
  end: number;
  // The song has no end marker, so the build adds `N - End` at `end`.
  endAdded: boolean;
  // The transition after the song; the last song has none, unless a pad follows it.
  transition?: Transition;
  // The set beat where the song hands off to the next one, and the bar of the set it starts: the gap start after the
  // song, or, before an overlap, its Ending, or, before a pad, its Pad locator. After the last song, with no pad, the
  // same bar line as before a gap.
  handoff: number;
  handoffBar: number;
  // Before a pad, the Pad section (padSection).
  pad?: PadSection;
};

// A Pad section, in the song's own beats: `clipStart`, where the pad clip starts, the song's Ending, or its Pad locator
// when the Ending comes after it; `at`, its Pad locator; its `length`, in beats and in `bars` of the meter it holds, the
// next song's starting meter, or, after the last song, the song's own; and `fadeOut`, the beats of the fade after it,
// after the last song, or 0 before a song.
export type PadSection = { clipStart: number; at: number; length: number; bars: number; fadeOut: number };

// The Pad section lasts this many seconds at the tempo it holds, rounded down to whole bars: time enough to loop it.
export const PAD_SECONDS = 60;

// A pad file swells in over this many seconds from its start (measured in E.wav of the library's pad pack: -46 dB at 0 s,
// -23 dB from about 8 to 10 s on). The pad clip plays the file from late enough that the swell ends on the Pad locator,
// where a loop on the Pad section wraps back to, so a wrap never drops the pad's level.
export const SWELL_SECONDS = 10;

// After the last song, the pad fades out over this many bars of the song's starting meter after its Pad section, so a
// loop on the Pad section holds no fade.
const PAD_OUT_BARS = 4;

const GAP_BARS = 4;

// `transitions` holds the transition after each song position, from 1; a position it leaves out is a gap.
export function placeSongs(songs: Song[], transitions: Partial<Record<number, Transition>> = {}): PlacedSong[] {
  const placed: PlacedSong[] = [];
  for (const [index, song] of songs.entries()) {
    const meter = meterOf(song);
    const previous = placed.at(-1);
    const offset = previous ? previous.handoff + leadIn(previous, meter).beats : 0;
    const bar = previous ? previous.handoffBar + leadIn(previous, meter).bars : 1;
    const number = index + 1;
    const transition = number < songs.length ? (transitions[number] ?? { type: 'gap' }) : padAfterLast(transitions[number]);
    const marker = song.locators.find(isEndMarker);
    if (transition?.type === 'overlap') {
      const end = endingOf(song);
      const { passed } = barLineAtOrAfter(end, meter);
      placed.push({ song, number, offset, bar, meter, end, endAdded: !marker, transition, handoff: offset + end, handoffBar: bar + passed });
      continue;
    }
    if (transition?.type === 'pad') {
      const { passed } = onOrNextBarLine(song.audioEnd, meter);
      const pad = padSection(song, songs[index + 1]);
      placed.push({ song, number, offset, bar, meter, end: pad.at + pad.length + pad.fadeOut, endAdded: !marker, transition, handoff: offset + pad.at, handoffBar: bar + passed, pad });
      continue;
    }
    const end = marker ? Number(valueOf(marker, 'Time')) : addedEnd(song, meter);
    // The bar line of the later of the audio end and the End, the End walked exactly (ON_BAR_LINE_TOLERANCE).
    const { bar: length, passed } = end > song.audioEnd ? barLineAtOrAfter(end, meter) : onOrNextBarLine(song.audioEnd, meter);
    placed.push({ song, number, offset, bar, meter, end, endAdded: !marker, transition, handoff: offset + length, handoffBar: bar + passed });
  }
  return placed;
}

// The beats and bars from the handoff of the song before to the next song's start, `meter` being the next song's: none
// after an overlap, the Pad section after a pad, and 4 bars of the next song's starting meter after a gap.
function leadIn(previous: PlacedSong, meter: Meter): { beats: number; bars: number } {
  if (previous.transition?.type === 'overlap') return { beats: 0, bars: 0 };
  if (previous.pad) return { beats: previous.pad.length, bars: previous.pad.bars };
  return { beats: GAP_BARS * barLength(meter.start), bars: GAP_BARS };
}

// A song's audio can end a few samples past the bar line its music stops on. MultiTracks' own Goodness of God ended
// 4.9e-5 beat, about 2 samples, past its bar line, and its Trust In God 1.0172e-4 beat, about 4 samples at 74 BPM, past
// its bar line, more than a 1e-4 tolerance takes. Rounding that up to the next bar line puts a whole bar, about 3.8 s at
// 63 BPM, of silence before a pad after the song. The fixture songs end the same way (scripts/make-song-fixtures.mjs).
// So an audio end at most this tolerance past a bar line counts as on it, wherever the placement rounds one up to a bar
// line. 2e-4 beat is about 6 to 17 samples at 48 kHz from 98 BPM down to Build My Life's 34 BPM fermata, far too short
// to hear. It only decides where the placement rounds an audio end up,
// and nothing outside this file reads it. An End, an overlap's Ending, and the last locator an added End goes after,
// are walked exactly: Live places locators on the grid.
const ON_BAR_LINE_TOLERANCE = 2e-4;

// The bar line `point` is on, counting a point at most ON_BAR_LINE_TOLERANCE past a bar line as on it, or else the
// first one after it, and how many bars start before it, from one walk of barLineAtOrAfter.
function onOrNextBarLine(point: number, meter: Meter): { bar: number; passed: number } {
  return barLineAtOrAfter(point - ON_BAR_LINE_TOLERANCE, meter);
}

// The Pad section after `song`, before `next`, or after the last song when `next` is undefined. Its Pad locator is the
// first bar line at or after the song's audio end (onOrNextBarLine), and it holds the starting tempo and meter of the
// holder, the next song, or after the last song, the song itself: PAD_SECONDS in beats at that tempo, rounded down to
// whole bars of that meter. After the last song, PAD_OUT_BARS of that meter follow it. buildSet has already stopped on a
// pad after a song with no Ending (padProblems).
function padSection(song: Song, next: Song | undefined): PadSection {
  const at = onOrNextBarLine(song.audioEnd, meterOf(song)).bar;
  const ending = findEnding(song);
  if (ending === undefined) throw new Error(`${song.folder} has no locator named Ending, where a pad starts.`);
  const holder = next ?? song;
  const barBeats = barLength(meterOf(holder).start);
  const bars = Math.floor((PAD_SECONDS * startingTempo(holder)) / 60 / barBeats);
  return { clipStart: Math.min(ending, at), at, length: bars * barBeats, bars, fadeOut: next ? 0 : PAD_OUT_BARS * barBeats };
}

// The pad clip after `song`, before `next`, or after the last song when `next` is undefined, as it plays its pad file:
// `from`, the second of the file it starts on, and `seconds`, how long it plays. The clip is unwarped, so each span of
// it lasts the seconds the set takes over it: from its start to the Pad locator through the song's own tempo map, the
// Pad section at the holder's starting tempo, then, before a song, from that song's beat 0 to its silence point through
// its own tempo map, or, after the last song, the fade at the song's starting tempo. It plays the file from late enough
// that the file's swell, SWELL_SECONDS, ends on the Pad locator, but never from before the file's start. buildSet has
// already stopped on a pad into a song with no Intro (introProblems).
export function padAudio(song: Song, next: Song | undefined): { from: number; seconds: number } {
  const pad = padSection(song, next);
  const lead = secondsBetween(song, pad.clipStart, pad.at);
  const section = (pad.length * 60) / startingTempo(next ?? song);
  const after = next ? secondsBetween(next, 0, silenceAfter(next, introOf(next))) : (pad.fadeOut * 60) / startingTempo(song);
  return { from: Math.max(0, SWELL_SECONDS - lead), seconds: lead + section + after };
}

// The tempo the song starts on, in BPM.
function startingTempo(song: Song): number {
  return Number(valueOf(mainEvents(song, 'Tempo').start));
}

// The song's Intro (findIntro), after an overlap or a pad. buildSet has already stopped on an overlap or a pad into a song
// with none (introProblems).
export function introOf(song: Song): number {
  const intro = findIntro(song);
  if (intro === undefined) throw new Error(`${song.folder} has no section after a locator named Count Off, where an overlap or a pad into the song fades out what plays before it.`);
  return intro;
}

// The last song's transition: its pad, when one follows it. buildSet has already thrown on any other transition after
// the last song (checkTransitions).
export function padAfterLast(transition: Transition | undefined): Transition | undefined {
  return transition?.type === 'pad' ? transition : undefined;
}

// The Time of the song's first locator named Ending, in its own beats, where an overlap hands off to the next song and a
// pad clip starts; undefined when the song has none.
export function findEnding(song: Song): number | undefined {
  const ending = song.locators.find((locator) => valueOf(locator, 'Name') === 'Ending');
  return ending ? Number(valueOf(ending, 'Time')) : undefined;
}

// Whether `beat` of `song` is on a bar line its meter reaches, walked from beat 0 through its meter changes as the
// placement walks them, not a multiple of its starting bar length. An overlap's Ending must be one: the next song's
// Count Off starts on it, and the next song's start bar counts the song's bars up to it. The song must have a starting
// meter (hasStartingValues).
export function onBarLine(song: Song, beat: number): boolean {
  return roundUpToBar(beat, meterOf(song)) === beat;
}

// The Time of the song's Intro, in its own beats, where an overlap's ringing clips and a pad clip start to fade
// out: its first locator after its locator named Count Off, whatever its name. A song may name more than one locator
// Intro, so the name is not the rule. Undefined when the song has no such locator.
export function findIntro(song: Song): number | undefined {
  const countOff = song.locators.find((locator) => valueOf(locator, 'Name') === 'Count Off');
  const time = (locator: Element) => Number(valueOf(locator, 'Time'));
  const intro = countOff && song.locators.find((locator) => time(locator) > time(countOff));
  return intro ? time(intro) : undefined;
}

// The silence point of `song`, the song after an overlap or a pad, in its own beats: 2 bars of its starting meter after
// its Intro, where what plays before the song, a ringing clip or a pad clip, has faded out.
export function silenceAfter(song: Song, intro: number): number {
  return intro + 2 * barLength(meterOf(song).start);
}

// Where `beat` of `song` sounds in an overlap from its Ending, in its own beats: up to the Ending, where it is; after it,
// the seconds the song takes from the Ending to it, in beats at `nextTempo`, which the set holds from the Ending on.
export function ringingBeat(song: Song, ending: number, nextTempo: number, beat: number): number {
  return beat <= ending ? beat : ending + (secondsBetween(song, ending, beat) * nextTempo) / 60;
}

// The song's Ending, before an overlap. buildSet has already stopped on an overlap from a song with none, or with one off
// a bar line (overlapProblems).
function endingOf(song: Song): number {
  const ending = findEnding(song);
  if (ending === undefined) throw new Error(`${song.folder} has no locator named Ending, which an overlap starts the next song on.`);
  return ending;
}

// MultiTracks marks a song's End with a blank-named locator; one named End is the End the controller reads.
export function isEndMarker(locator: Element): boolean {
  const name = valueOf(locator, 'Name').trim();
  return name === '' || name === 'End';
}

// A song with no end marker gets an End at its audio end rounded up to a bar line, counting an audio end at most the
// tolerance past a bar line as on it (onOrNextBarLine), or on the first bar line after its last locator when that one
// sits later, so no section is at or after End. buildSet has already stopped on a song with no locators (readSong).
function addedEnd(song: Song, meter: Meter): number {
  const last = song.locators.at(-1);
  if (!last) throw new Error(`${song.folder} has no locators.`);
  return Math.max(onOrNextBarLine(song.audioEnd, meter).bar, barAfter(Number(valueOf(last, 'Time')), meter));
}

function meterOf(song: Song): Meter {
  const { start, later } = mainEvents(song, 'TimeSignature');
  return { start: Number(valueOf(start)), changes: later.map((event) => ({ time: Number(event.attributes.Time), code: Number(event.attributes.Value) })) };
}
