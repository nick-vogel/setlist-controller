import type { Command } from '../shared/command.ts';
import { countInFor } from '../shared/count-in.ts';
import { sameSection, type JumpTarget, type Loop, type PlaybackState, type SetList, type Song } from '../shared/snapshot.ts';

// A cue tells the armed connection targets where the set has got to: the playhead is in this
// section now, or on a song's End, and why.

// Why a cue fired. The playhead played into the section while Live was playing, Live's loop wrapped
// back to it, a jump landed on it, Play from start landed on the song's first section, a count-in
// landed on the section it counted in to, or on the section Live plays on in when the jump to that
// section was lost, or the producer pressed Fire again for one target.
export type CueCause = 'played-into' | 'loop' | 'jump' | 'play-from-start' | 'count-in' | 'fire-again';

export type Cue = {
  song: number;
  // The song's own title, or null when the set gives it none. Never the page's "Song 3": a target
  // matches the title against its own names, and a made-up one must never match.
  title: string | null;
  // The section's index in the song, or 'end' for the song's End, which is not a section, as in a
  // JumpTarget.
  section: number | 'end';
  // The section's name, or "End".
  name: string;
  cause: CueCause;
  // The slide a target that plans its slides shows for this cue, as the target numbers it, such as
  // ProPresenter's presentation index. The server sets it for each such target (connections.ts),
  // never the cue engine.
  slide?: number;
};

// A move of the playhead inside the section of the cue, built as the section's played-into cue, from
// one offset to another, forward or back, in beats from the section's start. A start mid-section
// moves from where it starts to the same place.
export type OnMove = (cue: Cue, from: number, to: number) => void;

export type Cues = {
  // Each playback state the controller publishes, in order.
  observe(state: PlaybackState): void;
  // Each command on its way to the controller, accepted or not, before the controller sees it. Only
  // Play from start, a count-in, and the commands that replace its jump matter here: the playback
  // state shows the same waiting jump for Play from start as for a jump to the song's first section,
  // and a count-in to the top of the song is Play from start.
  command(command: Command): void;
};

// Live's song time is float32, so a position on a locator may arrive a hair off it. Positions this
// close count as on it, as in the playback controller.
const EPSILON = 1e-4;
const near = (a: number, b: number) => Math.abs(a - b) < EPSILON;

// Whether Live reports the playhead moving on or the start first is unconfirmed, and a listener
// report comes well within a beat of the change, so a move forward of less than a beat while stopped
// may be Live already playing.
const PLAYED_ON = 1;

// Watches the playback controller's state and raises a cue each time the playhead reaches a section
// or a song's End while Live plays, with its cause:
// - playing into a section, from the section before, the gap between songs or the song before, and
//   playing into a song's End, whose cue comes before the next song's when that song starts there;
// - a loop wrap: the playhead going back inside the looped section, or into another section while
//   the loop is on, as a brace set by hand across sections makes it;
// - a jump landing, on the bar line Live makes it on and never on the tap, a jump to the section
//   playing included, which fires it again;
// - Play from start, when its jump lands, or when Live starts on the song's first section;
// - a count-in landing on the section it counted in to, and nothing before it: not the Count Off it
//   counts through, nor a section or End the playhead passes on the way. When the jump to that
//   section is lost, the count-in ends on the section Live plays on in, which is its landing;
// - a start, Live going from stopped to playing from where the playhead sat, on the start of a
//   section or before it, whichever Live reports first of the start and the playhead moving on.
// Nothing fires while Live is stopped, nor for a start mid-section, nor for a move back inside a
// section that is neither a jump landing nor a loop wrap, as a drag at the laptop is, nor for the
// section the playhead was already in when the set or the playhead first became known, as at startup
// or when Live comes back.
//
// It also reports each move of the playhead inside a section through onMove, so the slides inside it
// can follow: each report that moves the playhead forward inside the section it was already in while
// Live plays, each that moves it back there that is neither a jump landing nor a loop wrap, as a drag
// at the laptop or the wrap of a brace set by hand inside the section, and a start mid-section, as a
// move from where it starts to the same place. Not while a count-in is held, not on a report on the brace's end, and not while a jump waits, whose landing
// brings its own cue. Nothing from the leader's Stop until Live next goes from stopped to playing, so
// a report Live sends between the Stop and its report of the stop moves nothing.
export function startCues(onCue: (cue: Cue) => void, onMove: OnMove = () => {}): Cues {
  let last: PlaybackState | null = null;
  // The song of the last Play from start, until its landing uses it, or a jump, Next, Previous, Stop
  // or another Play from start replaces it.
  let startedSong: number | null = null;
  // A waiting jump whose target playback entered before Live made the jump, as a section on a pickup
  // or a late tap does. That entry was the jump's one cue, so Live's move back to the target's start
  // when it then makes the jump raises nothing.
  let enteredEarly: JumpTarget | null = null;
  // A start while Play from start's song is remembered, other than on that song's first locator, or
  // while a count-in is held. Play from start while stopped sends Live its jump and its start
  // together, and so does a count-in, and whether Live reports the playhead's jump or the start first
  // is unconfirmed, so the report after the start judges it: one that jumps to the song's first
  // section is Play from start's jump, one that still holds the count-in is the count-in's, and
  // anything else leaves the start where it was.
  let startWaiting: { state: PlaybackState; at: number | null } | null = null;
  // Where the playhead sat while Live was stopped, a start's position: a move forward of less than
  // PLAYED_ON from it leaves it there. Null while Live plays.
  let rest: number | null = null;
  // Set by the leader's Stop, until Live next goes from stopped to playing.
  let stopped = false;

  const raise = (song: Song, section: number | 'end', cause: CueCause) => {
    const cue = cueFor(song, section, cause);
    if (cue) onCue(cue);
  };

  // The cause for the waiting jump's target when the playhead reaches it: Play from start's when the
  // jump is Play from start's, which then uses it up, and a jump's otherwise.
  const jumpCause = (target: JumpTarget): CueCause => {
    if (target.section !== 0 || target.song !== startedSong) return 'jump';
    startedSong = null;
    return 'play-from-start';
  };

  // Live has gone from stopped to playing, from `at`. Only a start on a section's start, or from before
  // it, raises its cue.
  const started = (state: PlaybackState, set: SetList, at: number | null) => {
    const start = startAt(state, set, at);
    const fromStart = start !== null && start.section === 0 && start.song.number === startedSong;
    if (state.countIn || (startedSong !== null && !fromStart)) {
      startWaiting = { state, at };
      return;
    }
    if (!start) {
      startedInside(state, set, at);
      return;
    }
    if (fromStart) startedSong = null;
    raise(start.song, start.section, fromStart ? 'play-from-start' : 'played-into');
  };

  // A start mid-section: a move from where it starts to the same place, in the section the playhead
  // is in. The next move goes from where it started, not from the playhead Live reported, so a change
  // between the two still goes.
  const startedInside = (state: PlaybackState, set: SetList, at: number | null) => {
    const { now } = state;
    const song = now && findSong(set, now.song);
    const section = now && song?.sections[now.section];
    const cue = song && now && cueFor(song, now.section, 'played-into');
    if (!section || !cue || at === null) return;
    last = { ...state, position: at };
    onMove(cue, at - section.time, at - section.time);
  };

  // The report after a start that waits: Play from start's jump when it carries the playhead into the
  // remembered song's first section from another section, or back inside it, and otherwise playback
  // from where the start was. Whether it handled the report.
  const startJumped = (before: PlaybackState, state: PlaybackState, set: SetList) => {
    const { now } = state;
    const song = startedSong === null ? undefined : findSong(set, startedSong);
    if (!song || now?.song !== song.number || now.section !== 0) return false;
    const back = before.position !== null && state.position !== null && state.position < before.position;
    if (sameSection(before.now, now) && !back) return false;
    startedSong = null;
    raise(song, 0, 'play-from-start');
    return true;
  };

  // A report of the playhead while Live plays, in the state before and the state now. While a
  // count-in is held through the report, nothing fires: the move to its Count Off, the Count Off, an
  // End it sits on, and the section after it that a late landing plays into for a bar. A count-in the
  // report ends without landing lost its jump to the target, and the section Live plays on in gets
  // its landing cue, unless a start that waited for this report judges it (startJudged).
  const moved = (before: PlaybackState, state: PlaybackState, set: SetList, startJudged: boolean) => {
    const from = before.position;
    const to = state.position;
    if (from === null || to === null || from === to) return;
    if (before.countIn && state.countIn) return;
    const target = before.jump;
    if (enteredEarly && !sameSection(enteredEarly, target)) enteredEarly = null;
    // The controller clears a jump on the report that shows it landed, and a count-in with it.
    const landedOnSection = target !== null && target.section !== 'end' && state.jump === null && sameSection(state.now, target);
    const cause = (jumped: JumpTarget): CueCause => (landedOnSection && before.countIn ? 'count-in' : jumpCause(jumped));

    const ended = landedOnSection ? null : endReached(set, before, state);
    if (ended) raise(ended, 'end', target?.song === ended.number && target.section === 'end' ? 'jump' : 'played-into');

    const { now } = state;
    const song = now && findSong(set, now.song);
    if (!now || !song) return;
    if (before.countIn && !landedOnSection && !startJudged) {
      raise(song, now.section, 'count-in');
      return;
    }
    const loop = before.loop ?? state.loop;
    if (!sameSection(before.now, now)) {
      if (target && sameSection(now, target)) {
        if (state.jump !== null) enteredEarly = target;
        raise(song, now.section, cause(target));
      } else raise(song, now.section, loop && to < from ? 'loop' : 'played-into');
      return;
    }
    // A move inside the section playing moves the slides inside it, unless a jump waits, whose
    // landing brings its own cue, or the leader's Stop came first.
    const move = () => {
      const section = song.sections[now.section];
      const cue = cueFor(song, now.section, 'played-into');
      if (!stopped && !state.countIn && target === null && state.jump === null && section && cue) onMove(cue, from - section.time, to - section.time);
    };
    // Forward inside the section playing is playback.
    if (to > from) {
      move();
      return;
    }
    // Back inside the section playing: a jump landing, a loop wrap, or a drag at the laptop, which
    // moves the slides back.
    if (target && sameSection(now, target)) {
      if (sameSection(enteredEarly, target)) enteredEarly = null;
      else raise(song, now.section, cause(target));
    } else if (loop && sameSection(loop.section, now)) raise(song, now.section, 'loop');
    else move();
  };

  return {
    observe(state) {
      const before = last;
      const wrapping = before !== null && onBraceEnd(before, state);
      last = before && wrapping ? { ...state, now: before.now } : state;
      const { position } = state;
      const at = rest !== null && position !== null && position >= rest && position - rest < PLAYED_ON ? rest : position;
      rest = state.playing ? null : at;
      if (before && !before.playing && state.playing) stopped = false;
      if (wrapping) return;
      const { set } = state;
      const waiting = startWaiting;
      startWaiting = null;
      if (!before || !set || before.set === null || before.position === null) return;
      if (!before.playing && state.playing) started(state, set, at);
      else if (before.playing && state.playing) {
        if (waiting && before.position === state.position) startWaiting = waiting;
        else if (waiting && startJumped(before, state, set)) return;
        else {
          // A start the count-in still holds was the count-in's. Once the report shows the count-in
          // ended, its jump to the Count Off was lost, and Live plays on from where the start was.
          const start = waiting && !state.countIn && startAt(waiting.state, set, waiting.at);
          if (start) raise(start.song, start.section, 'played-into');
          moved(before, state, set, waiting !== null);
        }
      }
    },
    command(command) {
      switch (command.kind) {
        case 'play-from-start':
          startedSong = command.song;
          break;
        // As the controller judges it: only while Live is connected and stopped, and a count-in to the
        // top of the song is Play from start. A count-in to a later section replaces Play from start's
        // jump, and a refused one changes nothing.
        case 'count-in': {
          if (!last || last.live !== 'connected' || last.playing || !last.set) break;
          const song = findSong(last.set, command.song);
          const rule = song && countInFor(song, command.section);
          if (rule?.kind === 'play-from-start') startedSong = command.song;
          else if (rule?.kind === 'count-in') startedSong = null;
          break;
        }
        case 'stop':
          stopped = true;
          startedSong = null;
          break;
        case 'jump':
        case 'next':
        case 'previous':
          startedSong = null;
          break;
      }
    },
  };
}

// The cue for the section the playhead is in now, with the cause given, built as a cue the playhead
// raises is: the producer's Fire again. Null when the playhead is in no section, before the first
// song, between songs, or while the set or the position is not known, Live not connected included.
export function cueAt(state: PlaybackState, cause: CueCause): Cue | null {
  const { set, now } = state;
  const song = set && now && findSong(set, now.song);
  return song && now ? cueFor(song, now.section, cause) : null;
}

// The beat the cue belongs to: its section's start, or its song's End. A loop wrap belongs to the beat
// the playhead wrapped to, the brace's start, when a brace set by hand starts inside the section and
// the playhead, at `at`, landed on or after it; a drag back into the section short of the brace start
// never reached it. Null when the set has no such section, or the song no End.
export function cueBeat(set: SetList, cue: Cue, loop: Loop | null, at: number | null): number | null {
  const song = findSong(set, cue.song);
  if (!song) return null;
  if (cue.section === 'end') return song.end;
  const section = song.sections[cue.section];
  if (!section) return null;
  const inside = loop !== null && loop.start > section.time && (section.end === null || loop.start < section.end);
  const reached = loop !== null && at !== null && at >= loop.start - EPSILON;
  return cue.cause === 'loop' && inside && reached ? loop.start : section.time;
}

// The cue for a section of the song, or its End. Null for a section the song does not have.
export function cueFor(song: Song, section: number | 'end', cause: CueCause): Cue | null {
  const name = section === 'end' ? 'End' : song.sections[section]?.name;
  return name === undefined ? null : { song: song.number, title: song.title, section, name, cause };
}

function findSong(set: SetList, number: number): Song | undefined {
  return set.songs.find((song) => song.number === number);
}

// The section a start from `at` raises a cue for, with its song: the one the playhead is in, when the
// start is on its start, or before it and Live played into it before it reported the start. Null for a
// start mid-section.
function startAt(state: PlaybackState, set: SetList, at: number | null): { song: Song; section: number } | null {
  const { now } = state;
  const song = now && findSong(set, now.song);
  const section = now && song?.sections[now.section];
  if (!now || !song || !section || at === null || section.time < at - EPSILON) return null;
  return { song, section: now.section };
}

// The song whose End this report carried the playhead to, or null: a forward move from inside the
// song to its End or past it, landing in the gap after it or on the first section of a song starting
// there, never further. Live wraps its loop at the brace's end, so while a loop whose brace ends on
// that End is on, a report on End is the loop going round, as the controller's stop at End reads it.
function endReached(set: SetList, before: PlaybackState, state: PlaybackState): Song | null {
  const from = before.position;
  const to = state.position;
  if (!before.now || from === null || to === null || to <= from) return null;
  const song = findSong(set, before.now.song);
  const end = song?.end;
  if (!song || end === null || end === undefined || to < end - EPSILON) return null;
  if (bracesEnd(before.loop ?? state.loop, end)) return null;
  const { now } = state;
  if (now) {
    const first = findSong(set, now.song)?.sections[0];
    return now.section === 0 && first !== undefined && near(first.time, end) ? song : null;
  }
  // In a gap, it must be the one after this song: no other song starts between its End and the playhead.
  const further = set.songs.some((other) => {
    const start = other.sections[0]?.time;
    return other !== song && start !== undefined && start >= end - EPSILON && start <= to + EPSILON;
  });
  return further ? null : song;
}

function bracesEnd(loop: Loop | null, end: number): boolean {
  return !!loop && loop.length > 0 && near(loop.start + loop.length, end);
}

function onBraceEnd(before: PlaybackState, state: PlaybackState): boolean {
  const loop = before.loop ?? state.loop;
  const { position } = state;
  const target = before.jump;
  const lands = target !== null && before.position !== position && (target.section === 'end' || sameSection(state.now, target));
  return before.playing && state.playing && !lands && position !== null && !!loop && loop.length > 0 && near(position, loop.start + loop.length);
}
