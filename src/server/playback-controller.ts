import type { Command } from '../shared/command.ts';
import { COUNT_OFF, countInFor, isPad } from '../shared/count-in.ts';
import {
  sameSection,
  gapAfter,
  sectionAt,
  type EndToggle,
  type JumpTarget,
  type Loop,
  type NowPlaying,
  type SectionAddress,
  type PlaybackState,
  type Section,
  type SetList,
  type Song,
} from '../shared/snapshot.ts';
import type { Clock } from './clock.ts';
import type { LiveEvent } from './live-bridge.ts';
import { parseSet } from './set-parser.ts';

// The core of the server: Live's events and the leader's commands in, one playback state out, and the
// commands Live must carry out.

export type PlaybackController = {
  fromLive(event: LiveEvent): void;
  command(command: Command): void;
  snapshot(): PlaybackState;
  // The clock time the beat is due, or was: the playhead's last reported position at the clock time
  // the controller took it, carried on to the beat at Live's tempo. Null while the position is not
  // known, and when that report is half a bar or more from the beat: past it, the playhead was dragged
  // there and never played across the beat; short of it, the playhead has not reached the beat. The
  // tempo is the controller's own and no page's business, so it stays out of the snapshot.
  dueAt(beat: number): number | null;
  // The clock time the playhead will reach the beat, or reached it: the playhead's last reported
  // position at the clock time the controller took it, carried on to the beat at Live's tempo, however
  // far the beat is from it. Null unless Live plays with the position known, no jump waiting and no
  // count-in held, when the playhead is not carried on by playback alone. Kept out of the snapshot,
  // as dueAt is.
  predict(beat: number): number | null;
  // Live's tempo in BPM, 120 until Live reports it. Kept out of the snapshot.
  tempo(): number;
  // Live's tempo in BPM once Live has reported one, and null before, for a reader that must not take the 120 BPM
  // stand-in for Live's own. Kept out of the snapshot, as the tempo is.
  reportedTempo(): number | null;
  // The beats in a bar, from the time signature Live last reported: 4 for 4/4 until it reports one.
  // Kept out of the snapshot, as the tempo is.
  barLength(): number;
  // The beats in a bar of each song of the set, by song number: the time signature Live last reported
  // while the playhead sat inside that song, outside its Pad and Pad Out, which carry the next song's
  // meter, given once Live has reported both its parts since the server started, and once Live's
  // reports for a move have settled, so never the song before's or half of one. While Live plays, a
  // signature reported ahead of the playhead's move goes to the song of the playhead's next report,
  // or, with none, to the song the playhead has reached by then (setlist-controller#304). A song the
  // playhead has not been in since the set was read has none. A new set from Live forgets every
  // song's, then takes Live's for the song the playhead sits in.
  // Replaced, never changed in place, whenever a song's arrives or changes, so a new map tells a
  // change. Kept out of the snapshot, as the tempo is.
  meters(): ReadonlyMap<number, number>;
  // The loop as the controller's decisions see it: the one the leader's Loop press asked for while
  // Live has not reported it, and Live's own otherwise, or null while it is off. Kept out of the
  // snapshot, whose loop keeps to Live's word, as the pages do.
  loop(): Loop | null;
};

export type ControllerOutput = {
  onChange(snapshot: PlaybackState): void;
  // Asks Live to jump to the cue point at that index in the list it reported.
  jump(cue: number): void;
  // Asks Live to resume from where it last stopped. While playing it changes nothing.
  continuePlaying(): void;
  // Asks Live to play from its start marker, which a jump while stopped moves.
  startPlaying(): void;
  stopPlaying(): void;
  // Asks Live to loop from start for length beats.
  loopOn(start: number, length: number): void;
  loopOff(): void;
  // Asks Live for its cue points, which come back as a cue-points event.
  requestCuePoints(): void;
  // Fades the music out to silence. Live plays on.
  fadeOut(): void;
  // Fades the music back in from silence.
  fadeIn(): void;
  // The playhead has entered a song's Count Off, or Play from start or a count-in while stopped
  // starts the song from it, which runs for ms more before the song's first downbeat. A faded song
  // comes back in over it. A song with no Count Off sends 0 on its first locator, and comes back at
  // once. countIn says the word came from a count-in.
  countOff(ms: number, countIn?: boolean): void;
};

// The name of the locator a song counts off from, which count-in.ts keeps beside the count-in's rule.
export { COUNT_OFF };

// Live's song time is float32, so a position on a bar line may arrive a hair before it. Positions
// this close to a boundary count as on it.
const EPSILON = 1e-4;
const near = (a: number, b: number) => Math.abs(a - b) < EPSILON;

// A tap this close to the bar line may reach Live after it: the last report of the playhead is up to
// one listener interval old, AbletonOSC reads what it is sent on its own tick, and the leader is on
// Wi-Fi. Live then makes the jump on the bar line after.
const LATE_TAP_MS = 250;

// While stopped Live jumps at once and reports the playhead within a listener interval, so a jump
// still waiting this long after the tap was lost on its way to Live.
export const LOST_WHILE_STOPPED_MS = 1000;

// Live reports a change to its loop within a listener interval, so a loop the controller asked for
// that Live has not reported this long after was lost on its way to Live.
export const LOOP_REPORT_MS = 1000;

// Live reports a move of the playhead, its tempo and the two parts of its signature as separate
// reports, all within a millisecond (setlist-controller#284), so a song's meter waits this long after
// the last of them for the rest, unless another report of Live's comes first.
export const METER_SETTLE_MS = 50;

// The clock times a jump tapped while stopped, which no report of the playhead may ever clear, and a
// loop asked for, which no report of the loop may ever answer.
export function startPlaybackController(
  { onChange, jump, continuePlaying, startPlaying, stopPlaying, loopOn: sendLoopOn, loopOff: sendLoopOff, requestCuePoints, fadeOut, fadeIn, countOff }: ControllerOutput,
  clock: Clock,
): PlaybackController {
  let live: PlaybackState['live'] = 'not-connected';
  let set: SetList | null = null;
  let playing = false;
  let position: number | null = null;
  // Live reports the signature as two properties. 4/4 until it does.
  const signature = { numerator: 4, denominator: 4 };
  // Which parts of the signature Live has reported since the server started. The 4/4 above is no
  // report, so no song's meter is taken from it.
  const reported = { numerator: false, denominator: false };
  // Each song's beats in a bar, by song number (meters on PlaybackController).
  let meters: ReadonlyMap<number, number> = new Map();
  // The song whose meter waits for Live's reports to settle (settleMeter), null for none, whether a
  // signature reported while Live played chose it, so the playhead's next report chooses it again
  // (signaturePlayhead), and the function that stops its timer, while one runs.
  let settlingSong: number | null = null;
  let settlingCarried = false;
  let stopSettle: (() => void) | null = null;
  // Live's tempo, which turns a time into beats. 120 BPM until Live reports it.
  let tempo = 120;
  let tempoReported = false;
  // The playhead's position and the clock time it held it: each report of the playhead, and Live going
  // from stopped to playing, since a start's cue comes on that report and a position reported while
  // stopped, maybe minutes before, would make it minutes late. Null while the position is not known.
  // tempo is Live's tempo then, which the meter of a signature report goes by (signaturePlayhead).
  let anchor: { position: number; at: number; tempo: number } | null = null;
  // The jump the leader asked for that Live has not made yet, and the bar line Live makes it on.
  // Null for the bar line when Live jumps at once, while stopped.
  let waitingJump: PlaybackState['jump'] = null;
  let barLine: number | null = null;
  // The last bar line Live may make the jump on: the bar line after barLine for a late tap, which may
  // reach Live after barLine, and barLine itself for any other tap, or for a target over by then.
  let lateBarLine: number | null = null;
  // The old targets a late jump replaced, which Live may have jumped to on barLine already, by their
  // start beats, an old End by its End beat: Live then makes the late jump a bar later, so a report in
  // an old target's first bar is no proof it was lost. Every late change on the same bar line adds one,
  // since any of them may be the one Live made. Null while no late jump replaced a waiting one.
  let replaced: { barLine: number; starts: number[] } | null = null;
  // Stops the timer that clears a jump tapped while stopped once it has waited too long, while one runs.
  let stopLostTimer: (() => void) | null = null;
  // The song whose End playback reached while a jump to a section waited and the report was no proof
  // the jump was lost, as a report on End when End is the bar line is not. A later report that proves
  // it lost, within a bar of that End, still stops there. A jump to End lands on that report instead.
  let heldEnd: Song | null = null;
  // Each song's end toggle, by song number. Every song starts on its default, and starts there again
  // whenever a read finds the set changed.
  let endToggles: Record<number, EndToggle> = {};
  // Live's arrangement loop as its listeners last reported it. These reports are the only source of
  // the loop state the pages show, so a loop set at the laptop, or left on from last time, shows too.
  const liveLoop = { on: false, start: 0, length: 0 };
  // The loop the controller last asked Live for, until Live reports its loop back. Live reports a
  // change only on AbletonOSC's tick, so a command in between that read liveLoop would decide on the
  // loop as it was before the leader's press. Null while nothing is asked.
  let askedLoop: { on: boolean; start: number; length: number } | null = null;
  // Stops the timer that forgets the asked-for loop once Live has had time to report it, while one runs.
  let stopLoopTimer: (() => void) | null = null;
  // Stops the timer that forgets a stop the controller sent, while Live has not reported it. Live takes
  // messages in order, so it is stopped for any sent after; a lost stop gets no report, hence the timer.
  let stopWait: (() => void) | null = null;
  // The count-in the leader pressed while Live was stopped, while it is held: the Count Off Live plays
  // through, and whether the jump to the target, which waitingJump holds, has been sent. The jump goes
  // to Live in the Count Off's last bar, so Live's 1-bar launch quantization lands it where the Count
  // Off ends. Until then barLine is null, and no lost timer runs: Live plays through the count. Null
  // while no count-in is held. A change sent late keeps its old target in replaced, as a late tap does.
  // reached is whether a report has put the playhead inside the Count Off, which proves the jump to it
  // was made.
  let countIn: { countOff: Section; sent: boolean; reached: boolean } | null = null;
  // Stops the timer that ends a held count-in Live never reported starting, once its whole Count Off
  // would have played, or once a Stop's report would have come, while one runs.
  let startWait: (() => void) | null = null;
  const cancelStartWait = () => {
    startWait?.();
    startWait = null;
  };

  const now = (at: number | null) => nowPlaying(set, at, signature);
  // The song Play from start last jumped to, until the playhead enters it or another jump replaces it.
  let startedSong: number | null = null;
  // The playhead at `at`, in that section, brings the music back: a song's Count Off says how long it
  // has left at Live's tempo, and the first locator of a song with no Count Off says 0. Any other
  // section says nothing.
  const comesBack = (address: SectionAddress, at: number, countIn = false) => {
    const song = set?.songs.find((candidate) => candidate.number === address.song);
    const section = song?.sections[address.section];
    if (!song || !section) return;
    if (section.name === COUNT_OFF && section.end !== null) countOff(((section.end - at) * 60_000) / tempo, countIn);
    else if (address.section === 0 && !song.sections.some((candidate) => candidate.name === COUNT_OFF)) countOff(0);
  };
  // A report that moves the playhead into a song's Count Off, from another song or by Play from
  // start, brings the music back. A jump inside the song that plays leaves it as it is, and so does a
  // report on the brace end of a loop that is going round (onBraceEnd), which never leaves the looped
  // section: the report after it is judged against the section from before it, kept in wrapFrom.
  const enteredCountOff = (before: NowPlaying | null, after: NowPlaying | null, at: number) => {
    if (!after || sameSection(before, after)) return;
    if (before?.song === after.song && startedSong !== after.song) return;
    startedSong = null;
    comesBack(after, at, countIn !== null);
  };
  // The section the playhead was in before a report on the brace end, until the next report, which is
  // judged against it. Null while no such report is the last one; `from` is null when one is and the
  // playhead was in no section before it, as in the gap between two songs (cues.ts keeps `now: null`).
  let wrapFrom: { from: NowPlaying | null } | null = null;
  // Whether a report at `at` is Live's loop going round: playing, with Live's reported loop on and the
  // playhead on its brace end, as reachedEnd reads Live's loop too. A report there may sit in the
  // section that starts on the brace end, as the next song's Count Off does in an overlap, but Live
  // wraps there and never plays into it. A waiting jump landing there is a landing, not a wrap, as in
  // the cue module (cues.ts onBraceEnd).
  const onBraceEnd = (at: number) => {
    if (!playing || !liveLoop.on || liveLoop.length <= 0 || !near(at, liveLoop.start + liveLoop.length)) return false;
    const lands = waitingJump !== null && position !== at && (waitingJump.section === 'end' || sameSection(now(at), waitingJump));
    return !lands;
  };
  // Song time counts quarter notes, so a bar of n/d holds n * 4 / d beats.
  const barLength = () => (signature.numerator * 4) / signature.denominator;
  // The song whose meter Live's signature is with the playhead there: the song it sits in, or none
  // in a song's Pad or Pad Out, where the set builder starts the next song's meter.
  const meterSong = (playhead: number | null) => {
    const at = now(playhead);
    return !at || isPad(sectionAt(set, at)?.name ?? '') ? null : at.song;
  };
  // Takes Live's signature as the song's meter, once Live has reported both its parts. Whether a
  // meter arrived or changed.
  const takeMeter = (song: number | null) => {
    if (song === null || !reported.numerator || !reported.denominator || meters.get(song) === barLength()) return false;
    meters = new Map(meters).set(song, barLength());
    return true;
  };
  // Holds the song's meter, in place of any song's waiting, until Live's reports for the move settle:
  // the next report of Live's that is not the tempo or a part of the signature commits it, and so does
  // METER_SETTLE_MS on the clock with none, so a song never takes the song before's meter, or half of
  // its own (setlist-controller#304). Live reports the signature only when it changes, so it goes to
  // the song at the playhead on each report of the playhead too, and a song entered from one of the
  // same meter is still read.
  const settleMeter = (song: number | null) => {
    dropMeter();
    settlingSong = song;
    if (song === null) return;
    stopSettle = clock.every(METER_SETTLE_MS, () => {
      if (commitMeter()) onChange(snapshot());
    });
  };
  // Takes the waiting song's meter. Whether a meter arrived or changed.
  const commitMeter = () => {
    const song = settlingSong;
    dropMeter();
    return takeMeter(song);
  };
  const dropMeter = () => {
    stopSettle?.();
    stopSettle = null;
    settlingSong = null;
    settlingCarried = false;
  };
  // Where the playhead is for the meter a signature report gives. While Live plays, it reports the
  // next song's signature before the first position past the change, with the last position it
  // reported still inside the song it leaves (setlist-controller#284), so the playhead is that report
  // carried on at the tempo Live had then: Live reports the next song's tempo first, which would carry
  // it short of a change into a slower song. That carried playhead can fall a hair short of the
  // change, so the position report Live sends next chooses the song in its place, and it stands only
  // when none comes before the meter settles. Stopped, or with no report, it is the last report. While
  // a jump waits on a bar line it is nowhere: Live moves the playhead to the target there, not on past
  // it, and the landing's report gives the target its signature, as every report of the playhead does.
  const signaturePlayhead = () => {
    if (waitingJump !== null && barLine !== null) return null;
    return playing && anchor ? anchor.position + ((clock.now() - anchor.at) * anchor.tempo) / 60_000 : position;
  };
  // How far before a bar line, in beats at Live's tempo, a tap may reach Live after it.
  const lateWindow = () => (LATE_TAP_MS * tempo) / 60000;
  const snapshot = (): PlaybackState => ({
    live,
    set,
    playing,
    position,
    now: now(position),
    jump: waitingJump,
    countIn: countIn !== null,
    endToggles,
    loop: loop(liveLoop),
  });

  // The loop while it is on, and the section its brace matches.
  const loop = ({ on, start, length }: { on: boolean; start: number; length: number }): Loop | null => {
    if (!on) return null;
    let section: SectionAddress | null = null;
    for (const song of set?.songs ?? []) {
      const index = song.sections.findIndex(
        (candidate) => candidate.end !== null && near(candidate.time, start) && near(candidate.end, start + length),
      );
      if (index !== -1) section = { song: song.number, section: index };
    }
    return { start, length, section };
  };

  // The loop as the controller's decisions see it: the one asked for while Live has not reported it,
  // and Live's own otherwise. The pages keep to Live's word, so they change only on its report.
  const intended = () => loop(askedLoop ?? liveLoop);

  const loopOn = (start: number, length: number) => {
    ask({ on: true, start, length });
    sendLoopOn(start, length);
  };

  const loopOff = () => {
    ask({ on: false, start: liveLoop.start, length: liveLoop.length });
    sendLoopOff();
  };

  // Records the loop asked for until Live reports its loop. AbletonOSC takes the loop over UDP, so no
  // report may ever come for a lost one; past LOOP_REPORT_MS the controller goes back to Live's word,
  // or the toggle and every jump would keep deciding on a loop Live never got. The asked-for loop is
  // on no page, so forgetting it publishes nothing.
  const ask = (asked: { on: boolean; start: number; length: number }) => {
    forgetAskedLoop();
    askedLoop = asked;
    stopLoopTimer = clock.every(LOOP_REPORT_MS, forgetAskedLoop);
  };

  const forgetAskedLoop = () => {
    stopLoopTimer?.();
    stopLoopTimer = null;
    askedLoop = null;
  };

  const askStop = () => {
    forgetStop();
    stopWait = clock.every(LOOP_REPORT_MS, forgetStop);
    stopPlaying();
  };

  const forgetStop = () => {
    stopWait?.();
    stopWait = null;
  };

  // Whether the playhead is on a song's End: on it, or less than a bar past it, as a late report of the
  // playhead may be.
  const onEnd = (song: Song | null | undefined, at: number) =>
    !!song && song.end !== null && at >= song.end - EPSILON && at < song.end + barLength();

  // Whether the playhead is where the waiting jump goes: in its section, or on its song's End.
  const inTarget = (at: number | null) => {
    if (!waitingJump || at === null) return false;
    if (waitingJump.section !== 'end') return sameSection(now(at), waitingJump);
    const { song } = waitingJump;
    return onEnd(set?.songs.find((candidate) => candidate.number === song), at);
  };

  // A stopped Live jumps to the Count Off at once, so until the count-in sends its own jump, every
  // report is in the Count Off. A report anywhere else is proof the jump to it was lost, as a UDP
  // datagram may be, and that Live is playing on from where it stopped, so the count-in ends there.
  // Only a report while Live plays is proof: playing on from where it stopped comes after the start's
  // report, and a report while stopped is a move Live made before the press, a tap's report still on
  // its way. Once a report has put the playhead in the Count Off, the jump to it was made, and a report
  // in the bar after it is Live playing out of it with no report in its last bar: the count-in holds,
  // and sendCountIn sends its jump late. A report anywhere else but the target is the playhead moved
  // away, and the count-in ends.
  // The stopped lost timer must never clear a count-in that is counting, and a stopped Live sends no
  // report, so startWait ends a count-in whose start Live never reported.
  const countOffLost = (after: number) => {
    if (!countIn || countIn.sent) return false;
    const { time, end } = countIn.countOff;
    if (after >= time - EPSILON && (end === null || after < end - EPSILON)) {
      countIn.reached = true;
      return false;
    }
    if (!playing) return false;
    if (!countIn.reached) return true;
    return !inTarget(after) && (after < time - EPSILON || (end !== null && after >= end + barLength() - EPSILON));
  };

  // Live sends nothing back for a jump, so the playhead tells when it has happened: it is in the
  // target section now, and it either moved backwards, or reached the last bar line Live may jump on
  // from outside the target or from before that bar line. A jump to the section already playing never
  // leaves it, and lands on its start, which is the backwards move. Playback moving forward short of
  // that bar line is only playback, even when it enters the target on its own, as a section on a
  // pickup does, or as the section starting on the bar line does after a late tap. A late tap to that
  // section which Live made in time looks like playing on, so its mark stays up one more bar. A jump to
  // End lands on any report on that End, by playback or by Live's jump, since End is a single point
  // and getting there is all the leader asked for. A count-in whose jump to the target is not yet sent
  // lands only by playback, with Live playing, once it has reached its Count Off, on a report that
  // enters the target from outside it. A report while Live is stopped is a move Live made before the
  // press, a tap's report still on its way, even one that moves the playhead backwards into the target.
  const landed = (before: number | null, after: number) => {
    if (!waitingJump || !inTarget(after)) return false;
    if (waitingJump.section === 'end') return true;
    if (countIn && !countIn.sent) return playing && countIn.reached && !inTarget(before);
    if (before !== null && after < before) return true;
    if (barLine === null) return !inTarget(before);
    const last = lateBarLine ?? barLine;
    if (after < last - EPSILON) return false;
    return !inTarget(before) || (before !== null && before < last - EPSILON);
  };

  // Live sends nothing back for a jump, and AbletonOSC takes it over UDP, so a lost datagram is a
  // jump Live never makes. While playing, Live makes a jump on barLine, or on the bar line after for a
  // late tap. A report outside the target past that later bar line is proof the jump did not happen.
  // It counts from barLine, not lateBarLine, since for a late tap lateBarLine already is the bar
  // after. A report on a bar line itself may come while Live is jumping, so it is no proof.
  // Playback onto a song's End past barLine is proof too, a bar sooner, since a stop at End must come
  // within a bar of it: a jump tapped in the song's last bar then stops there, and so does a late tap
  // to End's bar line, which Live might still have made a bar later. A report on End when End is
  // barLine, or on an End off the bar grid before barLine, is no proof yet, since the jump may still
  // come; heldEnd keeps that End for the reports after it. A jump to End is never lost on its own End,
  // where it lands.
  // A late jump, a count-in's late change included, is no proof lost in the first bar of a target it
  // replaced, where Live may still be on its way to the new one (replaced). On a song set to stop at
  // End, the End proof comes first, since that stop must come within a bar of End whatever Live may be
  // on its way to, even when an old target starts on that End, as the next song's Count Off does in an
  // overlap.
  const lost = (after: number, end: Song | null) => {
    if (!waitingJump || barLine === null) return false;
    if (inTarget(after)) return false;
    if (after >= barLine + EPSILON && end !== null && endToggles[end.number] === 'stop') return true;
    if (replaced?.starts.some((start) => after >= start - EPSILON && after < start + barLength() - EPSILON)) return false;
    if (after >= barLine + barLength() + EPSILON) return true;
    return after >= barLine + EPSILON && end !== null;
  };

  // A loop never carries to a different section, so a jump anywhere but the looped section turns
  // Live's loop off first. A jump to the looped section itself, a restart, keeps it. A loop asked for
  // and not yet reported counts, or Live would get the jump with its brace still on.
  const leaveLoopFor = (address: JumpTarget | null) => {
    const current = intended();
    if (current && (!address || !sameSection(current.section, address))) loopOff();
  };

  // The beat a jump target starts on: its section's start, or for a song's End, the End itself.
  // Undefined when the set has no such section, or the song no End.
  const startOf = (address: JumpTarget) => {
    if (address.section !== 'end') return sectionAt(set, address)?.time;
    return set?.songs.find((song) => song.number === address.song)?.end ?? undefined;
  };

  // Asks Live to jump, and records the jump as waiting until the playhead shows it has landed.
  // A jump the leader asks for ends a count-in; the count-in's own jump to its target keeps it.
  // A late jump keeps the target of the waiting jump it replaces, old, in replaced, beside the starts
  // already gathered on the same bar line. A count-in's change passes old in, since it moves
  // waitingJump first.
  const jumpTo = (address: JumpTarget, target: { cue: number; time: number }, old: JumpTarget | null = waitingJump) => {
    const oldBarLine = barLine;
    startedSong = null;
    countIn = null;
    leaveLoopFor(address);
    jump(target.cue);
    if (!playing && position !== null && Math.abs(position - target.time) < EPSILON) {
      clearJump();
      return;
    }
    // A new jump replaces the waiting one, as it does in Live, and its timer with it.
    cancelLostTimer();
    heldEnd = null;
    waitingJump = address;
    // While playing, Live jumps on the next bar line, on a grid of bars from beat 0.
    barLine = playing && position !== null ? (Math.floor((position + EPSILON) / barLength()) + 1) * barLength() : null;
    if (barLine === null) startLostTimer(address);
    // A tap within LATE_TAP_MS of the bar line may reach Live after it, so Live may make the jump on
    // either bar line.
    const late = barLine !== null && position !== null && barLine - position <= lateWindow();
    const oldStart = old && oldBarLine !== null ? startOf(old) : undefined;
    const gathered = late && replaced?.barLine === barLine ? replaced.starts : [];
    const starts = oldStart === undefined ? [] : [...gathered, oldStart];
    replaced = late && barLine !== null && starts.length > 0 ? { barLine, starts } : null;
    if (!late || barLine === null) {
      lateBarLine = barLine;
      return;
    }
    // A jump made in time must still have the playhead in the target at the bar line after, or the
    // mark never clears. A target over by then, as a one-bar Tag before End is, or a Turn shorter
    // than a bar, counts from barLine as a tap well before it does. That holds for a target that
    // starts a hair before barLine or on a pickup too, since Live's jump back to its start is shorter
    // than the late window and seldom shows as a backward move. When Live gets such a tap late, the
    // mark clears a bar before Live jumps, which leaves only the page early; a later bar line would
    // leave the mark up for good and hold the stop at End. A target that starts earlier than the late
    // window before barLine, as the section playing does on a restart, shows Live's jump as a backward
    // move, so it keeps the later bar line even when it ends by then.
    const next = barLine + barLength();
    const forwardShort =
      target.time >= barLine - lateWindow() - EPSILON && target.time < next - EPSILON && !sameSection(now(next), address);
    lateBarLine = forwardShort ? barLine : next;
  };

  // While stopped, no report of the playhead comes for a jump Live never made, so a timer clears it.
  // It fires outside fromLive and command, so it publishes the change itself. It clears only the jump
  // it was started for, so it never clears a newer one.
  const startLostTimer = (address: JumpTarget) => {
    stopLostTimer = clock.every(LOST_WHILE_STOPPED_MS, () => {
      cancelLostTimer();
      if (waitingJump !== address) return;
      clearJump();
      onChange(snapshot());
    });
  };

  const cancelLostTimer = () => {
    stopLostTimer?.();
    stopLostTimer = null;
  };

  // No jump waits any more, so no count-in is held either.
  const clearJump = () => {
    cancelStartWait();
    cancelLostTimer();
    countIn = null;
    heldEnd = null;
    waitingJump = null;
    barLine = null;
    lateBarLine = null;
    replaced = null;
  };

  // Ends the held count-in once that many ms pass with Live still stopped, in place of any such timer
  // running. It fires outside fromLive and command, so it publishes the change itself.
  const waitForStart = (ms: number) => {
    cancelStartWait();
    startWait = clock.every(ms, () => {
      cancelStartWait();
      if (!countIn || playing) return;
      clearJump();
      onChange(snapshot());
    });
  };

  // Whether a jump to End made while playing has just landed on the End of a song set to stop there.
  // reachedEnd sees the jump still waiting on that report, so this is where the stop at End comes
  // from. The jump lands on the same report, so a later one cannot stop Live again.
  const landedOnEnd = (after: number) => {
    if (!playing || waitingJump?.section !== 'end' || !inTarget(after)) return false;
    return endToggles[waitingJump.song] === 'stop';
  };

  // The song whose End playback has just carried the playhead to, or null. Only forward playback
  // counts: less than a bar on from the last report, from inside the song to its End or less than a
  // bar past it, as a late report of the playhead may be. A move by hand is a longer move, even onto a
  // next song that starts on End. The End a waiting jump held still counts on the reports after it,
  // once the playhead has left that song.
  const endReached = (before: number | null, after: number): Song | null => {
    if (before === null || !set) return null;
    if (after < before || after - before >= barLength()) return null;
    if (onEnd(heldEnd, after)) return heldEnd;
    const song = set.songs.find((candidate) => {
      const start = candidate.sections[0]?.time;
      return start !== undefined && candidate.end !== null && start <= before + EPSILON && before + EPSILON < candidate.end;
    });
    return song && onEnd(song, after) ? song : null;
  };

  // Whether playback has just carried the playhead to the End of a song set to stop there. A stopped
  // Live needs no stop, and a waiting jump is the leader's choice of what comes next, which a stop
  // would drop. A waiting jump to End stops there through landedOnEnd instead. Live wraps its loop at
  // the brace's end, so while a loop whose brace ends on that End is on, playback never passes End: a
  // report within EPSILON before the wrap, or on the loop end itself, is the loop going round, and a
  // stop would lose it. Only the brace's end counts, whatever its start, since a loop braced by hand
  // across the last two sections wraps at End too.
  // In the count-in's Count Off's last bar, with Live playing, the jump to the target goes to Live
  // through jumpTo, so the bar-line prediction, the late-tap window and the lost-jump proof apply as
  // they do to a tap. With no report in that bar, it goes on the first report in the bar after it, and
  // Live makes it on the bar line after, as it does a late tap. Once it is sent, the count-in waits for
  // the landing like any other jump.
  const sendCountIn = () => {
    if (!countIn || countIn.sent || !playing || position === null) return;
    const { end } = countIn.countOff;
    if (end === null || position < end - barLength() - EPSILON || position >= end + barLength() - EPSILON) return;
    sendTarget();
  };

  // Sends Live the jump to the count-in's target, or a new target's in place of the one sent. The
  // count-in's own first jump never goes while a stop waits: Live takes messages in order, so a jump
  // after the stop would move a stopped Live's playhead off the Count Off at once. A change to a jump
  // already sent is the leader's, and goes: should the stop reach Live, Live drops the jump it holds,
  // and the change moves the stopped playhead to the new target, as a tap right after the stop's report
  // would. Nor does a first jump to the section right after the Count Off go, where playback lands with
  // no jump; one already sent to an old target is replaced.
  // A change sent late, within LATE_TAP_MS of the bar line, keeps the old target it replaces, which
  // Live may have jumped to by then (replaced).
  const sendTarget = (old: JumpTarget | null = null) => {
    if (!countIn || !waitingJump || (stopWait !== null && !countIn.sent)) return;
    const target = sectionAt(set, waitingJump);
    if (!target) return;
    const held = countIn;
    if (!held.sent && held.countOff.end !== null && near(target.time, held.countOff.end)) return;
    jumpTo(waitingJump, target, old);
    countIn = { ...held, sent: true };
  };

  // Whether a held count-in can land on that section of its song: the section right after the Count
  // Off, which playback reaches with no jump, or any section the count-in command itself would count
  // in to. Not the Count Off or anything before it, nor a Pad.
  const landsOn = (address: SectionAddress) => {
    const song = set?.songs.find((candidate) => candidate.number === address.song);
    if (!song) return false;
    const rule = countInFor(song, address.section);
    return rule.kind === 'count-in' || (rule.kind === 'play-from-start' && song.sections[address.section - 1]?.name === COUNT_OFF);
  };

  // Moves a held count-in's target. A brace anywhere but the new target goes off, as for any jump to
  // another section. Before the jump to the old target was sent, the new one goes in the Count Off's
  // last bar as the old one would have, at once when the playhead is in it already; after, it replaces
  // the one Live holds.
  const retarget = (address: SectionAddress) => {
    if (!countIn || !waitingJump || sameSection(waitingJump, address)) return;
    const old = waitingJump;
    leaveLoopFor(address);
    waitingJump = { song: address.song, section: address.section };
    if (countIn.sent) sendTarget(old);
    else sendCountIn();
  };

  // Play from start while Live is stopped: Live jumps at once, and the jump moves its start marker,
  // which start_playing plays from; continue_playing would resume where Live last stopped and ignore
  // the jump (setlist-controller#13). No jump is kept waiting: when the playhead already sits on the
  // song's first locator, no position event would come to clear it. The new jump replaces any that
  // waited.
  const startFromTop = (song: number, first: Section) => {
    leaveLoopFor({ song, section: 0 });
    jump(first.cue);
    clearJump();
    startPlaying();
    forgetStop();
    // Live starts the song from its top, so the music comes back, the song playing included, and the
    // playhead already on its first locator, which no report then moves it into.
    comesBack({ song, section: 0 }, first.time);
  };

  const reachedEnd = (end: Song | null) => {
    if (!playing || waitingJump || end === null || end.end === null) return false;
    if (liveLoop.on && liveLoop.length > 0 && near(liveLoop.start + liveLoop.length, end.end)) return false;
    return endToggles[end.number] === 'stop';
  };

  return {
    fromLive(event) {
      // Every report of Live's but the tempo and the signature, which come with a move, settles the
      // waiting meter first, except a lost Live, which drops it.
      const comesWithMove = event.kind === 'tempo' || event.kind === 'signature-numerator' || event.kind === 'signature-denominator';
      const goneAway = event.kind === 'connection' && !event.connected;
      if (event.kind === 'position' && settlingCarried) settlingSong = meterSong(event.beats);
      const settled = !comesWithMove && !goneAway && commitMeter();
      // A report that changes nothing on any page still publishes a meter it settled.
      const unchanged = () => {
        if (settled) onChange(snapshot());
      };
      switch (event.kind) {
        case 'connection':
          live = event.connected ? 'connected' : 'not-connected';
          // Only Live can say where the playhead is, so a lost Live leaves none of it known. The
          // listeners Live registers on reconnect report the current values at once.
          if (!event.connected) {
            playing = false;
            position = null;
            anchor = null;
            tempoReported = false;
            liveLoop.on = false;
            wrapFrom = null;
            dropMeter();
            forgetAskedLoop();
            forgetStop();
            clearJump();
          }
          break;
        case 'cue-points': {
          // A read that finds the same set changes nothing, a reconnect included, so the leader's
          // choices stay. A changed set, or the first one, starts every song on its default. The
          // parser builds a set in a fixed key order, so equal sets give equal JSON. Once a set is
          // loaded, a read answered while Live plays is dropped, so the set cannot change mid-song,
          // a read sent on reconnecting included; the poll reads it again once Live stops.
          if (set && playing) return unchanged();
          const read = parseSet(event.cuePoints);
          if (set && JSON.stringify(read) === JSON.stringify(set)) return unchanged();
          set = read;
          endToggles = defaultEndToggles(set);
          // The meters were read against the old set's songs. The song the playhead sits in takes
          // Live's at once.
          meters = new Map();
          takeMeter(meterSong(position));
          // A waiting jump names a section of the old set, which may be another section now, and so
          // may the section kept from before a report on the brace end.
          clearJump();
          wrapFrom = null;
          break;
        }
        case 'position': {
          // Judged on the jump still waiting, before this report lands it.
          const wrapping = onBraceEnd(event.beats);
          // A jump the report shows lost clears first, so the stop at End sees no jump waiting.
          const end = endReached(position, event.beats);
          if (lost(event.beats, end) || countOffLost(event.beats)) clearJump();
          const reached = reachedEnd(end);
          const landedEnd = landedOnEnd(event.beats);
          if (reached || landedEnd) askStop();
          if (landed(position, event.beats)) {
            waitingJump = null;
            heldEnd = null;
            countIn = null;
            replaced = null;
          } else if (waitingJump && playing && end) heldEnd = end;
          const before = wrapFrom ? wrapFrom.from : now(position);
          position = event.beats;
          anchor = { position, at: clock.now(), tempo };
          wrapFrom = wrapping ? { from: before } : null;
          if (!wrapping) enteredCountOff(before, now(position), event.beats);
          sendCountIn();
          settleMeter(meterSong(position));
          break;
        }
        case 'playing': {
          if (event.playing && !playing && position !== null) anchor = { position, at: clock.now(), tempo };
          if (event.playing) cancelStartWait();
          const stops = playing && !event.playing;
          playing = event.playing;
          // A stop ends a wrap, so the report after it is judged from where the playhead is.
          if (!playing) {
            forgetStop();
            wrapFrom = null;
          }
          // Live drops a jump that waits for the bar line when it stops, so the jump no longer waits.
          if (!playing && barLine !== null) {
            clearJump();
          }
          // Live stopping during the count ends the count-in, before its jump is sent too, when
          // barLine is still null.
          if (stops && countIn) clearJump();
          break;
        }
        case 'tempo': {
          const first = !tempoReported;
          if (event.bpm > 0) {
            tempo = event.bpm;
            tempoReported = true;
          }
          if (first && tempoReported && playing) break;
          return;
        }
        // The fade's reads, which change nothing on any page.
        case 'track-data':
        case 'track-volume':
          return unchanged();
        // The listener reports that follow carry Live's new state, so the announcement itself changes
        // nothing on any page.
        case 'startup':
          tempoReported = false;
          return unchanged();
        case 'signature-numerator':
          if (!(event.numerator > 0)) return;
          signature.numerator = event.numerator;
          reported.numerator = true;
          settleMeter(meterSong(signaturePlayhead()));
          settlingCarried = playing;
          break;
        case 'signature-denominator':
          if (!(event.denominator > 0)) return;
          signature.denominator = event.denominator;
          reported.denominator = true;
          settleMeter(meterSong(signaturePlayhead()));
          settlingCarried = playing;
          break;
        case 'loop':
          // Live reports the brace before the loop, in the order the controller sends them, so this
          // report carries Live's whole loop and ends any wait for it.
          liveLoop.on = event.on;
          forgetAskedLoop();
          break;
        case 'loop-start':
          liveLoop.start = event.beats;
          break;
        case 'loop-length':
          liveLoop.length = event.beats;
          break;
      }
      onChange(snapshot());
    },
    command(command) {
      // A command for Live while Live is not connected would go nowhere, and a jump would leave a
      // waiting jump behind, so it is ignored. The end toggles are the server's own, and need no Live.
      if (live !== 'connected' && command.kind !== 'set-end-toggle') return;
      switch (command.kind) {
        case 'jump': {
          // A target that is not in the set, or no set yet, is ignored.
          const section = sectionAt(set, command);
          if (!section) return;
          // During a count-in, a tap in its song moves the target, to a section a count-in can land
          // on, and any other tap there is ignored. A tap in another song is an ordinary jump.
          if (countIn && waitingJump?.song === command.song) {
            if (!landsOn(command)) return;
            retarget(command);
            break;
          }
          jumpTo({ song: command.song, section: command.section }, section);
          break;
        }
        case 'play-from-start': {
          // A song that is not in the set, or has no sections, is ignored.
          const first = sectionAt(set, { song: command.song, section: 0 });
          if (!first) return;
          // Playing, the jump waits for the bar line, as a tap does, and continue_playing changes
          // nothing: start_playing would restart Live from its start marker at once. Stopped, Live
          // jumps at once, and the jump moves its start marker, which start_playing plays from;
          // continue_playing would resume where Live last stopped and ignore the jump
          // (setlist-controller#13).
          if (playing && stopWait === null) {
            jumpTo({ song: command.song, section: 0 }, first);
            startedSong = command.song;
            continuePlaying();
          } else startFromTop(command.song, first);
          break;
        }
        case 'count-in': {
          // Only from stopped, and a stop sent but not yet reported counts as playing still: the
          // stop's report would end the count-in at once. A song that is not in the set is ignored,
          // and so is a section countInFor refuses.
          if (playing) return;
          const song = set?.songs.find((candidate) => candidate.number === command.song);
          const first = song?.sections[0];
          if (!song || !first) return;
          const rule = countInFor(song, command.section);
          if (rule.kind === 'refused') return;
          // The top of the song has one behaviour, Play from start's.
          if (rule.kind === 'play-from-start') {
            startFromTop(song.number, first);
            break;
          }
          const countOff = song.sections[rule.countOff]!;
          // Live plays the Count Off from stopped as Play from start plays a song's first locator. A
          // brace on the target stays on, so the section loops once the count lands; a brace anywhere
          // else, the Count Off's included, goes off before the jump, as for any jump to another section.
          leaveLoopFor({ song: song.number, section: command.section });
          jump(countOff.cue);
          clearJump();
          startPlaying();
          forgetStop();
          // The music comes back over the whole Count Off, as on Play from start while stopped. The
          // report that moves the playhead into it stays inside the song, and says nothing again.
          comesBack({ song: song.number, section: rule.countOff }, countOff.time, true);
          waitingJump = { song: song.number, section: command.section };
          countIn = { countOff, sent: false, reached: false };
          waitForStart((((countOff.end ?? countOff.time) - countOff.time) * 60_000) / tempo);
          break;
        }
        case 'stop':
          // A count-in held on a Live the server has stopped is one whose start Live has not reported,
          // maybe lost. A stopped Live reports nothing for a Stop, so the count-in ends once the stop's
          // report would have come; a start report before then is the start on its way, and the stop's
          // report after it ends the count-in.
          if (!playing && countIn) waitForStart(LOOP_REPORT_MS);
          // Live reports the stop back, and only then does the snapshot change.
          askStop();
          return;
        case 'loop': {
          // Live reports the loop back, and only then does the snapshot change. A second press before
          // that report turns off the loop the first one asked for.
          if (intended()) {
            loopOff();
            return;
          }
          // Live is on its way out of the section, to End, which is not a section to brace.
          if (waitingJump?.section === 'end') return;
          // With no section playing, or a section with no known end, there is nothing to brace.
          const current = waitingJump ?? now(position);
          const section = current && sectionAt(set, current);
          if (!section || section.end === null) return;
          loopOn(section.time, section.end - section.time);
          return;
        }
        // Both count from the section playing, not from a waiting jump, so a second press before the
        // downbeat asks for the same section again. Neither leaves the song, and with no section
        // playing both are ignored. During a count-in both count from its target instead, and move it
        // one section, to one a count-in can land on, or are ignored: Next never reaches a Pad or End,
        // and Previous never the Count Off.
        case 'next': {
          if (countIn && waitingJump && waitingJump.section !== 'end') {
            const following = { song: waitingJump.song, section: waitingJump.section + 1 };
            if (!landsOn(following)) return;
            retarget(following);
            break;
          }
          const current = now(position);
          const song = current && set?.songs.find((candidate) => candidate.number === current.song);
          if (!current || !song) return;
          const following = song.sections[current.section + 1];
          if (following) {
            jumpTo({ song: song.number, section: current.section + 1 }, following);
            break;
          }
          // From the last section to the song's End, where the end toggle decides. The jump to End
          // waits as a jump to a section does, and replaces any that waited, as in Live.
          if (song.endCue === null || song.end === null) return;
          jumpTo({ song: song.number, section: 'end' }, { cue: song.endCue, time: song.end });
          break;
        }
        case 'previous': {
          if (countIn && waitingJump && waitingJump.section !== 'end') {
            const before = { song: waitingJump.song, section: waitingJump.section - 1 };
            if (!landsOn(before)) return;
            retarget(before);
            break;
          }
          const current = now(position);
          if (!current) return;
          // On the first section, back to its own start.
          const address = { song: current.song, section: Math.max(0, current.section - 1) };
          const section = sectionAt(set, address);
          if (!section) return;
          jumpTo(address, section);
          break;
        }
        case 'refresh':
          // The set is never read while Live plays, so it cannot change under the band mid-song.
          // The reply, not the request, changes the snapshot.
          if (playing) return;
          requestCuePoints();
          return;
        case 'fade-out':
          // There is no music to fade while Live is stopped.
          if (!playing) return;
          fadeOut();
          return;
        case 'fade-in':
          // Live stopping sets every volume back, so while it is stopped there is no silence to end.
          if (!playing) return;
          fadeIn();
          return;
        case 'set-end-toggle':
          // A song that is not in the set is ignored. Live hears nothing of it.
          if (!(command.song in endToggles)) return;
          endToggles = { ...endToggles, [command.song]: command.toggle };
          break;
      }
      onChange(snapshot());
    },
    snapshot,
    dueAt(beat) {
      // A listener report comes well within half a bar of the playhead crossing a beat, at any tempo a
      // song is played at. Live snaps a drag to a bar line, so a report a whole bar past is a drag.
      if (!anchor || Math.abs(anchor.position - beat) >= barLength() / 2 - EPSILON) return null;
      return anchor.at + ((beat - anchor.position) * 60_000) / tempo;
    },
    predict(beat) {
      if (!playing || position === null || !anchor || waitingJump !== null || countIn !== null) return null;
      return anchor.at + ((beat - anchor.position) * 60_000) / tempo;
    },
    tempo: () => tempo,
    reportedTempo: () => (tempoReported ? tempo : null),
    barLength,
    meters: () => meters,
    loop: intended,
  };
}

// Each song's end toggle as a read of the set starts it. A song whose End sits on the next song's
// first locator flows into it, as an overlap or a pad is built, so it starts on "Continue into next
// song". Every other song starts on "Stop at end": one followed by a gap, the last song, and a song
// with no End.
function defaultEndToggles(set: SetList): Record<number, EndToggle> {
  return Object.fromEntries(
    set.songs.map((song, index): [number, EndToggle] => {
      const gap = gapAfter(set.songs, index);
      const flows = gap !== null && Math.abs(gap.end - gap.start) < EPSILON;
      return [song.number, flows ? 'continue' : 'stop'];
    }),
  );
}

function nowPlaying(
  set: SetList | null,
  position: number | null,
  signature: { numerator: number; denominator: number },
): NowPlaying | null {
  if (!set || position === null) return null;
  const at = position + EPSILON;
  const starts = set.songs.flatMap((song) => (song.sections[0] ? [song.sections[0].time] : []));

  for (const song of set.songs) {
    const start = song.sections[0]?.time;
    if (start === undefined || at < start) continue;
    // A song with no End runs to the next song's first locator, or on without limit for the last song.
    // Its last section runs, and is counted, to that locator.
    const end = song.end ?? Math.min(Infinity, ...starts.filter((time) => time > start));
    if (at >= end) continue;

    const index = song.sections.findLastIndex((section) => section.time <= at);
    const section = song.sections[index];
    if (!section) continue;

    // Song time counts quarter notes, so a bar of n/d holds n * 4 / d beats.
    const barLength = (signature.numerator * 4) / signature.denominator;
    const into = Math.max(0, position - section.time);
    // A section with no end in the set is the last of a song with no End, measured to the song's run-on
    // end. It has no length only when no song follows it.
    const sectionEnd = section.end ?? (Number.isFinite(end) ? end : null);
    const length = sectionEnd === null ? null : sectionEnd - section.time;
    return {
      song: song.number,
      section: index,
      next: index + 1 < song.sections.length ? index + 1 : 'end',
      bar: Math.floor((into + EPSILON) / barLength) + 1,
      bars: length === null ? null : Math.ceil(length / barLength - EPSILON),
      fraction: length === null ? null : Math.min(1, into / length),
    };
  }
  return null;
}
