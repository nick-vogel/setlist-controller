import type { ConnectionCommand } from '../shared/command.ts';
import type { ArmState, Connection, ConnectionPick, Loop, PauseReason, PreServiceCheck, SetList, Song } from '../shared/snapshot.ts';
import type { Clock } from './clock.ts';
import type { ConfiguredTarget } from './connections-config.ts';
import { cueFor, type Cue } from './cues.ts';
import type { LatenessLog, MeasuredLine, UnmeasuredReason } from './lateness-log.ts';
import { latenessRecord, NOT_MEASURED, type LatenessRecord } from './lateness.ts';
import { COUNT_OFF } from './playback-controller.ts';
import type { DeviceCheck, FileCheck, SlidePlan, Target, TargetStatus } from './target.ts';

// Live's song time is float32, so a position on a slide's beat may arrive a hair off it. Positions
// this close count as on it, as in the cue engine.
const EPSILON = 1e-4;

// The server's side of the connection targets: each one's last reported status and its arm state,
// the producer's Arm and Disarm, the pause rules, the cues routed to the targets that are armed and
// online, the producer's Fire again and manual button runs, and each target's pre-service check
// against the set, and the problem each one last reported reaching it, such as a connect that failed,
// which stays on its row whatever its status until the target reports none, and the same for the
// choice it asks the producer to pick, such as ProPresenter's playlist. Every target starts
// disarmed on every server start. A target the connections config file disabled is a row only: it is
// never started, stopped, armed, cued or checked.
//
// The pause rules: a change by hand at the target pauses it until the producer arms it. The leader's
// Fade out pauses every armed target that pauses on a fade until the music comes back, on a Count
// Off, on the first section of a song with no Count Off, or on the first section cue after a
// count-in, whose cue arms it again. A producer's press that moves a target onto something that is no
// song of the set, as ProPresenter's Next slide into Facetime does, pauses it as moved, which ends as
// a Fade out's pause does (setlist-controller#561). Arm moves a disarmed or paused target to armed, and tells the
// target, so it forgets what the operator did at it (target.ts, armed); Disarm moves any target to
// disarmed. A cue for a paused target is dropped, never queued.
//
// The producer's hand: Fire again sends one online target the cue for the section the playhead is in
// now, a button run runs one of an online target's own manual buttons, and a pick hands an online
// target the producer's choice of one it offers, with the set the server holds now, then runs its
// check again, since the pick changes what the check is against. Each works whatever the target's arm
// state and leaves it as it was, but for a button run that moves the target out of the set (movedOut). None does anything on an offline target, nor is it kept for when the
// target comes back, and a pick does nothing while no set is known but log that it was ignored: the
// producer page disables the pick until a set is known, so only a page that raced the server sends one.
//
// A target that plans its slides, armed and offline when a cue or a slide change came due for it, or
// handed one whose trigger got no answer before it went offline, gets the slide for the playhead once
// when it comes online, as Fire again sends it, unmeasured, if it is armed still and the playhead is
// still in the song and section of the latest one it missed.
// Nothing is queued: a target that missed nothing, has left that section, or was paused or disarmed
// gets nothing, and so does a target that plans no slides.
//
// The slides inside a section: a target that plans its slides (target.ts, plan) gets every cue, Fire
// again included, with the slide for the playhead's position, the last of its plan at or before the
// playhead's offset into the cue's section, or its first for a song's End. While it is armed and
// online, each forward move of the playhead inside a section that plays across one or more of its
// slides hands it a change cue for the last of them, due on that slide's beat, a move back inside a
// section, as a drag at the laptop, hands it the slide for where the playhead lands, unmeasured,
// unless the screen shows it already, and a start mid-section hands it the slide for where it
// starts, unmeasured, or the section's cue as it is when the plan holds no slide, as for a section
// that clears. A change cue passes the same arm,
// pause and online rules as a cue, and never settles the word that the music comes back.
//
// The lead: a target that plans its slides with a lead (target.ts, lead) gets each slide change that
// lead early while Live plays forward, on the server's clock. Each section or End cue it is handed,
// each move that finds nothing scheduled, and each change sent early schedules the next one ahead of
// the playhead: the next slide of the section's plan, else the first slide of the next section of
// the same song, else the song's End's, else the crossing. The look ahead stops at a section the
// playhead has not reached whose plan holds none, as one that clears: nothing past it is scheduled,
// so no slide goes before the clear's downbeat, and that section's own cue, on its downbeat,
// schedules the next, which goes at once after the clear when its beat less the lead has passed. A
// plan's first slide on a negative beat is on a pickup (propresenter.ts, a slide timing entry's start):
// it goes that far before its section's start, less the lead, so it takes the slide before it down
// early, and the screen shows it from then until the playhead reaches the section's start, its
// downbeat, which sends nothing again. When the next section's slide 1 on a pickup comes due, its beat
// less the lead, at or before the downbeat of a section that clears, the look ahead takes it in place
// of stopping, as passing that clear: once it went early, the clearing section's cue, played into,
// sends nothing and schedules nothing, so the slide replaces the one before directly; one that did not
// go, as after a Fade out once the producer arms ProPresenter again, or a pause at its send time, goes
// at once in place of the clear when Live reports the clearing section, measured against its beat less
// the lead, and counts as sent early, so its downbeat sends nothing again. The crossing's first slide on a pickup passes the clear of
// the song's last section the same way, when it passes no clear of its own and the song has no End or
// its End falls inside the crossing's lead. A pickup the playhead plays across before it went, on a drag
// forward, a gap between reports or with no lead, goes on that move, as a slide crossed, and one played
// into on its section's downbeat is measured against its pickup less the lead. The crossing is the next song's first slide, the first of its first section, none when that section's
// plan holds none, due on that slide's beat, and only while the song plays on into it, its end
// toggle on Continue into next song, or a song with no End, which never stops Live and so always
// plays on from its last section whatever its toggle: a song set to stop at its End and the last
// song never cross. A song's End inside the crossing's lead, at or after the beat the
// crossing goes and before or on its beat, is skipped: the screen goes from the song's last section
// straight to the next song's first slide, and the End cue the playhead plays into then sends no
// clear and no End or Ending group: nothing after the crossing went early, and when it did not, as
// after a Fade out or a pause at its send time, the crossing's slide at once, measured against its
// beat less the lead, as a landing there shows it, counted as sent early. A jump that
// lands on that End, as Next on the song's last section does, sends no clear and no End either: after
// the crossing went early it sends nothing, and since the jump's request dropped the change the
// crossing scheduled, its End schedules the next change again; before, it shows the crossing at once.
// A clear the playhead plays into, an End with no End or Ending group or a section that clears, that
// Live reports only after a change from its song, or the crossing from it, went early for a beat past
// the clear's downbeat, as an End just before the crossing's lead reported after the crossing went,
// sends nothing and schedules nothing, so the screen keeps that change's slide and does not blank and
// show it again; a drag back behind where that change went forgets it, and the clear goes.
// Any landing, a jump's, Play from start's or a count-in's, inside the lead of the next change, at or
// after its beat less the lead and before or on its beat, its downbeat for a pickup, shows that
// change's slide at once in place of its own, as a drag back does, and it counts as sent early from
// the landing's place, so its beat sends nothing again. A change to a
// song's end toggle looks ahead again from the playhead, a crossing that has not gone is dropped once
// its song no longer plays on, and one sent early is forgotten, so the End goes as it would have; a
// change to the toggle of a song with no End changes nothing.
// The loop is the one the playback controller asked Live for while Live has not reported it, as on
// the leader's Loop press, and Live's own otherwise, so a press reschedules at once, before Live's
// report. While the loop is on and the playhead is before its brace's end, only a change before that
// end whose section starts before it too, so a pickup for the section after the brace never goes up,
// else the wrap: the slide the brace's start shows, due on the brace's end, where Live wraps back to
// it, never a later section's, and nothing when the look ahead stops at a clear before that end, or a
// pickup passes one, since the wrap's slide would go before the clear. A brace on a section from its
// start to its end, whose slide 1 is on a pickup, wraps to it that far before the brace's end, less
// the lead, when that is after the section's own last change, and on the brace's end otherwise, so no
// slide shows out of order. A wrap sent early schedules nothing; the
// wrap's own loop cue schedules the next. A change goes at its beat less the lead, as the playback
// controller predicts the playhead reaching it from its last report and Live's tempo, at
// once when that time has passed and the beat has not, the downbeat for a slide 1 on a pickup, a
// wrap's being the brace's end, so a reschedule between that pickup and the downbeat (a Loop press,
// the loop off, an End toggle change, a re-prediction) sends it at once. Nothing is scheduled while the
// prediction is unknown (Live stopped, a jump waiting, a count-in held). At most one change waits per target. Each
// playback state the controller publishes predicts it again: one more than a beat from its send time
// is looked up again from the playhead and scheduled anew, as on a drag at the laptop or a tempo
// change, and one within a beat stays, so report jitter never moves it. The arm, pause and online
// rules are checked when it goes, with Live still playing with no jump waiting and the loop as it was
// when the change was scheduled, and a change that fails them is dropped, never queued. A change sent
// early is not sent again when the playhead plays across its beat or wraps to it, nor is a slide
// before it, since the screen has moved on past it; Fire again before that beat sends it again, as
// the slide the screen shows. A clear is never scheduled: it goes on its downbeat's cue, which then
// schedules the next change. Stop and each jump request (cancel) and a Fade out drop the change
// waiting, accepted or not; a change sent early stays sent. A change to the loop, on, off or a new
// brace, asked for or reported by Live, drops it too, with a wrap sent early and, while the playhead
// is before the new brace's end, a change sent early for a beat at or past that end, and schedules
// again from the playhead on the new path. The target going offline, a change by hand, the
// producer's Disarm and a run of one of its buttons that blanks the screen, such as ProPresenter's
// Clear slide, forget a change sent early, since the screen no longer shows it, so its beat sends as
// it would have. Any other button, such as Next slide or Previous slide, keeps it: the screen still
// shows a slide of the song, the one the press moved to, and sending the change again on its beat
// would undo the press.

export type Connections = {
  // One row per target, in the order the server was given them.
  rows(): Connection[];
  // Starts every target, which then reports its status.
  start(): Promise<void>;
  stop(): Promise<void>;
  // The producer's Arm, Disarm, Fire again, button run or pick, which runs the target's check again
  // once the target has taken it. A command for a target that does not exist, or is disabled, is
  // ignored, as is a run of a button the target does not offer, and a pick of a choice it does not
  // offer.
  command(command: ConnectionCommand): void;
  // The cue engine's report of a move of the playhead inside the cue's section, from one offset to
  // another in beats from its start, forward or back, or a start mid-section, from where it starts to
  // the same place. Each target that plans its slides, and is armed and online, gets a change cue for
  // the last slide a move forward plays across, for a move back the slide where it lands, unmeasured,
  // unless the screen shows it already, or for a start the slide where it starts, or the cue itself
  // when its plan holds none, as a clear's; any other target gets nothing.
  moved(cue: Cue, from: number, to: number): void;
  // Drops every slide change scheduled ahead of its beat: the leader's Stop or a jump request, on its
  // way to the playback controller. A change already sent early stays sent, and its beat sends nothing.
  cancel(): void;
  // Each playback state the controller publishes, once the cue engine has seen it. A change to a
  // song's end toggle, a song with no End aside since it always plays on, forgets a crossing sent
  // early from that song once it no longer plays on, and
  // each target with a lead that waits on a crossing from it, or while the playhead is in it, looks
  // ahead again from the playhead. A change to the loop, on, off or a new brace, as the leader's
  // Loop press asks for it or as Live reports it (the server calls this at the press), drops every
  // waiting slide change and a wrap sent early, since that wrap will not come, and, while the
  // playhead is before the new brace's end, a change sent early for a beat at or past that end, since
  // the wrap comes first. Each target with a lead, armed and online, then schedules again from the
  // playhead. Otherwise each waiting change is predicted again: one
  // more than a beat from its send time, at Live's tempo, is looked up again from the playhead and
  // scheduled anew, one whose prediction is gone is dropped, and one within a beat stays as it is.
  observed(): void;
  // Hands the cue to each target that is armed and online. Every other target never gets it: a cue
  // is not queued, and a target that comes online again gets nothing it missed, but for a target that
  // plans its slides, armed while offline, the slide for the playhead once when it comes online still
  // in that section. The cue where the
  // music comes back after countOff, a Count Off cue, the first section's cue of a song with no Count
  // Off, or any section cue after a count-in's word, first arms every target a Fade out or a move out paused, so
  // each one that is online gets it. Due is the clock time the cue's beat was due, or null when it is
  // not known; each target handed the cue records how late it was by then, unless it does not act on
  // that cue. A cue with no due time gets a log line for each target that acts on it, unmeasured: the
  // server did not see the playhead play across its beat. A target with a lead, handed a cue played
  // into or a loop's wrap with a slide, is measured against the beat less its lead, and is not handed
  // a played-into slide that went early, nor the wrap's when a wrap went early (but a played-into
  // slide on or past that wrap's beat is handed, since Live played on and never wrapped), nor a song's End
  // played into, or landed on by a jump, inside the lead of the crossing into the next song, once that
  // went early, which writes no line and changes nothing else, but that a jump's End schedules the next
  // change ahead again, since the jump request dropped it, nor a clear played into, reported after a
  // change from its song or crossing from it went early for a beat past its downbeat, which writes no
  // line and changes nothing else. A landing, a jump's, Play from start's or a
  // count-in's, inside the lead of its next change, the crossing for an End, is handed that change's
  // slide in place of its own, measured against the landing's due time, and the change counts as sent
  // early. So is a song's End played into inside the crossing's lead when the crossing did not go
  // early, measured against the crossing's beat less the lead, with no clear and no End or Ending
  // group, and so is a section that clears, played into, whose clear the next section's slide 1 on a
  // pickup, or the crossing's, passes, when that slide did not go early, as after a Fade out once the
  // producer arms ProPresenter again, measured against the slide's beat less the lead, with no clear.
  // Each other section or End cue schedules its next change ahead, an End the crossing.
  deliver(cue: Cue, due: number | null): void;
  // The playback controller's word that the music comes back: the playhead entered a song's Count
  // Off from another song or by Play from start, or the first locator of a song with no Count Off,
  // or the leader pressed Count in, which says countIn. A Count Off reached inside the song playing
  // leaves the music as it is, and so the faded and moved targets too. The next section cue settles it: after a
  // count-in, any section cue arms the faded targets again. Otherwise a Count Off cue, the first
  // section's cue of a song with no Count Off, or a count-in's landing cue arms them again, and any
  // other section cue drops the word. A Fade out drops it too, so only a word said after the latest
  // Fade out arms the faded targets again.
  countOff(countIn?: boolean): void;
  // The leader's Fade out: every armed target that pauses on a fade is paused, by the Fade out. An
  // armed target that opts out stays armed; a disarmed or paused target is untouched. It drops any
  // word from countOff that no section cue has settled yet, and every slide change scheduled ahead of
  // its beat, whatever the target's arm state; a change already sent early stays sent. Nothing is
  // scheduled again until a cue or a move reaches an armed target.
  fadeOut(): void;
  // Runs the pre-service check of every online target against the set, on Refresh, when the set
  // read from Live changes, and when a song's meter arrives or changes while Live is stopped with no
  // start on its way, or once Live stops after one did. A target also runs its check each time it
  // comes online, after the producer's pick on its row, and when it reports its own file changed.
  checkAll(): void;
};

type Entry = {
  target: Target;
  connection: TargetStatus;
  arm: ArmState;
  // Null unless arm is paused.
  pause: PauseReason | null;
  // What the producer's press moved the target onto, while pause is moved. Null otherwise.
  movedTo: string | null;
  check: PreServiceCheck;
  // Counts the checks run, so an answer to an earlier one is dropped.
  checks: number;
  state: string[];
  list: string[];
  // The index in list of the line the target marks, or null for none.
  listCurrent: number | null;
  lateness: LatenessRecord;
  // The measured cue last handed to a target that acknowledges, until it reports acting on it: the
  // time it was due, and its log line, which waits for the acted-on lateness. Null once it has, and
  // after an unmeasured cue, such as Fire again, whose own line goes out at once.
  handed: { cue: Cue; due: number; line: Omit<MeasuredLine, 'actedMs'> } | null;
  // The slide change scheduled ahead of its beat for a target with a lead: the change cue, its beat in
  // the set, the clock time it goes, and the function that stops its timer. Null while none waits.
  // The loop, as loop() gave it, when the change was scheduled.
  pending: (Change & { at: number; loop: Loop | null; stop(): void }) | null;
  // The last slide change sent early, with the playhead as the cue engine last reported it when the
  // change went (from), until the playhead plays across its beat or moves back behind from, a move
  // back inside a section lands outside its lead, any other cue is handed to the target, the target
  // goes offline, a change is made by hand, the producer disarms it, or one of its buttons that blanks
  // the screen runs.
  // Null while there is none.
  early: (Change & { from: number }) | null;
  // The problem the target last reported, as its row's problems. Kept across an offline.
  problems: string[];
  // The pick the target last reported. Kept across an offline.
  pick: ConnectionPick | null;
  // For a target that plans its slides: the song and section of the latest cue or slide change that
  // came due while it was armed and offline, or null for none. Cleared whenever it comes online.
  missed: { song: number; section: number | 'end' } | null;
};

const NOT_CHECKED: PreServiceCheck = { kind: 'not-checked' };

// The row's check for a target's answer: its check of the set against its own file, the names it
// cannot match, its problems and its notes, matched when it has no name and no problem, whatever its
// notes, and then carrying the target's pass text; or its check of its own device.
function checkOf(answer: FileCheck | DeviceCheck): PreServiceCheck {
  if (!('unmatched' in answer)) return { kind: 'device', problems: [...answer.problems], notes: [...answer.notes] };
  const { unmatched, problems, notes, passText } = answer;
  if (unmatched.length === 0 && problems.length === 0) return { kind: 'matched', passText, notes: [...notes] };
  return { kind: 'unmatched', names: [...unmatched], problems: [...problems], notes: [...notes] };
}

type Disabled = Extract<ConfiguredTarget, { kind: 'disabled' }>;

// A slide change a target with a lead is scheduled to get: the change cue, with its slide, and its
// beat in the set. A wrap is the slide a loop's brace start shows, due on the brace's end, where Live
// wraps back to it. A crossing is the next song's first slide, scheduled from the song before, which
// plays on into it: crosses is the song before's number. A slide 1 on a pickup, its section's start
// in the slide timing file (propresenter.ts), goes on a beat before the section's own start, its
// downbeat, or for a wrap, before the brace's end; until the playhead reaches that downbeat, the screen
// shows it. One that comes due, its beat less the lead, at or before the downbeat of the section that
// clears before it passes that clear, on that beat in the set: for a crossing, the song before's last
// section.
type Change = { cue: Cue; beat: number; wrap?: true; crosses?: number; downbeat?: number; passes?: number };

// The beat from which the change is the slide for the playhead's place: its downbeat, for a pickup,
// and its beat otherwise.
const untilBeat = (change: Change) => change.downbeat ?? change.beat;

// Where the look ahead stops: a section whose plan holds no slide, as one that clears, that the
// playhead has not reached, starting on that beat in the set. Nothing is scheduled past it.
type Stop = { clear: number };
const isStop = (found: Change | Stop | null): found is Stop => found !== null && 'clear' in found;

// Whether two of Live's loops are the same: both off, or both on over the same brace.
const sameLoop = (a: Loop | null, b: Loop | null) => (a === null || b === null ? a === b : Math.abs(a.start - b.start) < EPSILON && Math.abs(a.length - b.length) < EPSILON);

// A pick as the row keeps it, never the target's own object, so a later change to it at the target
// shows only when the target reports it again.
function pickCopy(pick: ConnectionPick | null): ConnectionPick | null {
  if (!pick) return null;
  return { label: pick.label, options: pick.options.map(({ id, label }) => ({ id, label })), picked: pick.picked && { id: pick.picked.id, label: pick.picked.label } };
}

export function startConnections({
  targets,
  clock,
  log = null,
  set: currentSet,
  current,
  bar,
  meters,
  position,
  dueAt,
  predict,
  tempo,
  loop,
  playsOn,
  onChange,
}: {
  targets: ConfiguredTarget[];
  // Times each cue handed over, against the time it was due.
  clock: Clock;
  // Where each cue's line goes, measured or not, for each target that acts on it. None writes no line.
  log?: LatenessLog | null;
  // The set read from Live now, or null before Live has reported one.
  set(): SetList | null;
  // The cue for the section the playhead is in now, with the cause Fire again, or null while it is
  // in none, as between songs.
  current(): Cue | null;
  // The beats in a bar, from the time signature Live last reported.
  bar(): number;
  // The beats in a bar of each song of the set, by song number, for the check (playback-controller.ts).
  meters(): ReadonlyMap<number, number>;
  // The playhead's position in beats, or null while it is not known.
  position(): number | null;
  // The clock time the beat was due, or null when it is not known (playback-controller.ts).
  dueAt(beat: number): number | null;
  // The clock time the playhead reaches the beat, playing on from its last report, or null while Live
  // is stopped, a jump waits or a count-in is held (playback-controller.ts).
  predict(beat: number): number | null;
  // Live's tempo in BPM.
  tempo(): number;
  // The loop the playback controller asked Live for while Live has not reported it, and Live's loop
  // as Live last reported it otherwise, or null while it is off (playback-controller.ts, loop).
  loop(): Loop | null;
  // Whether the song's end toggle is Continue into next song, so Live plays on from its End into the
  // next song.
  playsOn(song: number): boolean;
  onChange(): void;
}): Connections {
  // Every target in the order given, so the rows keep it; the ready ones alone are ever started.
  const all: (Entry | Disabled)[] = targets.map((configured) =>
    configured.kind === 'ready' ? { target: configured.target, connection: 'offline', arm: 'disarmed', pause: null, movedTo: null, check: NOT_CHECKED, checks: 0, state: [], list: [], listCurrent: null, lateness: latenessRecord(), handed: null, pending: null, early: null, problems: [], pick: null, missed: null } : configured,
  );
  const entries = all.filter((entry): entry is Entry => 'target' in entry);
  // Set by countOff until the next section cue or a Fade out, whichever comes first, to count-in when
  // the word came from a count-in and to section otherwise. Live is stopped from a jump until its
  // start, so the cue of Play from start while stopped comes only then. A Fade out clears it, since a
  // word said before the Fade out (on Live's first report after a reconnect, or a tap while stopped,
  // with no cue after it) says nothing about the music after.
  let musicBack: false | 'section' | 'count-in' = false;
  // The playhead in beats as the cue engine last reported it, by a move or a cue: the place its next
  // move goes from. A start mid-section goes from where Live sat stopped, not from a song time Live
  // reported moving on before the start (cues.ts, PLAYED_ON). Null before the first.
  let reported: number | null = null;
  // The loop as observed() last saw it, asked for or reported, so a change to it drops every waiting
  // change.
  let seenLoop: Loop | null = null;
  // Whether each song of the set plays on into the next, as observed() last saw it, so a change to a
  // song's end toggle looks ahead again.
  let seenPlaysOn = new Map<number, boolean>();
  // A pause for any reason but moved, or none, names no item.
  const set = (entry: Entry, given: Partial<Pick<Entry, 'connection' | 'arm' | 'pause' | 'movedTo' | 'check' | 'state' | 'list' | 'listCurrent' | 'problems' | 'pick'>>) => {
    const change = given.pause !== undefined && given.pause !== 'moved' ? { ...given, movedTo: null } : given;
    const next = { ...entry, ...change };
    const same =
      next.connection === entry.connection &&
      next.arm === entry.arm &&
      next.pause === entry.pause &&
      next.movedTo === entry.movedTo &&
      JSON.stringify(next.check) === JSON.stringify(entry.check) &&
      JSON.stringify(next.state) === JSON.stringify(entry.state) &&
      JSON.stringify(next.list) === JSON.stringify(entry.list) &&
      next.listCurrent === entry.listCurrent &&
      JSON.stringify(next.problems) === JSON.stringify(entry.problems) &&
      JSON.stringify(next.pick) === JSON.stringify(entry.pick);
    if (same) return;
    Object.assign(entry, change);
    onChange();
  };
  // Runs the target's check against the set, while it is online and a set is known. Only the answer
  // to the latest check counts, and only while the target is still online. A check that fails is
  // logged and leaves the row not checked.
  const runCheck = async (entry: Entry) => {
    const list = currentSet();
    if (entry.connection !== 'online' || !list) return;
    entry.checks += 1;
    const run = entry.checks;
    const current = () => run === entry.checks && entry.connection === 'online';
    try {
      const answer = await entry.target.check(list, meters());
      if (current()) set(entry, { check: checkOf(answer) });
    } catch (error) {
      console.error(`Setlist server: the connection target ${entry.target.name} could not check the set`, error);
      if (current()) set(entry, { check: NOT_CHECKED });
    }
  };
  const report = (entry: Entry, connection: TargetStatus) => {
    const cameOnline = entry.connection === 'offline' && connection === 'online';
    if (connection === 'offline') {
      settle(entry);
      // The server no longer knows what the screen shows, so a change sent early is forgotten.
      entry.early = null;
      // A check still running answers too late to count.
      entry.checks += 1;
      set(entry, { connection, check: NOT_CHECKED, state: [], list: [], listCurrent: null });
    } else set(entry, { connection });
    if (cameOnline) {
      comeback(entry);
      void runCheck(entry);
    }
  };
  // A target that plans its slides, armed and offline when a cue or a slide change came due for it,
  // or when it reports a cue handed to it never reached it (target.ts, missed), records the cue's song
  // and section, the latest only: nothing is queued.
  const miss = (entry: Entry, cue: Cue) => {
    if (entry.arm === 'armed' && entry.connection !== 'online' && entry.target.plan) entry.missed = { song: cue.song, section: cue.section };
  };
  // Whether a move inside a section, from one offset to another, changes the slide the plan shows: a
  // move either way across a slide's beat, or a start at a slide, or in a section whose plan holds none.
  const changesOn = (plan: SlidePlan, from: number, to: number) => {
    if (from === to) return plan.length === 0 || plan.some(({ beat }) => beat <= to + EPSILON);
    const [low, high] = from < to ? [from, to] : [to, from];
    return plan.some(({ beat }) => beat > low + EPSILON && beat <= high + EPSILON);
  };
  // A target back online that missed a change while offline, armed still, with the playhead still in
  // the song and section of the latest it missed, gets the slide for the playhead once, as Fire again
  // sends it, unmeasured. Anything else gets nothing.
  const comeback = (entry: Entry) => {
    const { missed } = entry;
    entry.missed = null;
    if (!missed || entry.arm !== 'armed') return;
    const cue = current();
    if (cue && cue.song === missed.song && cue.section === missed.section) hand(entry, cue, null, 'fire-again');
  };
  const safely = (entry: Entry, what: string, call: () => unknown) => {
    const failed = (error: unknown) => console.error(`Setlist server: the connection target ${entry.target.name} could not ${what}`, error);
    try {
      const result = call();
      if (result instanceof Promise) result.catch(failed);
    } catch (error) {
      failed(error);
    }
  };
  // Whether the cue is where the music comes back: a Count Off, the first section of a song with no
  // Count Off, as the playback controller judges it, or the section a count-in landed on.
  const bringsMusicBack = (cue: Cue) => {
    if (cue.name === COUNT_OFF || cue.cause === 'count-in') return true;
    if (cue.section !== 0) return false;
    const song = currentSet()?.songs.find((candidate) => candidate.number === cue.song);
    return !!song && !song.sections.some((section) => section.name === COUNT_OFF);
  };
  // The target acted on the cue now: counted once, for the cue last handed to it, from a target that
  // acknowledges. Its log line goes out with both numbers.
  const actedOn = (entry: Entry, cue: Cue) => {
    const { handed } = entry;
    if (!entry.target.acknowledges || !handed || handed.cue !== cue) return;
    entry.handed = null;
    const acted = clock.now() - handed.due;
    entry.lateness.acted(acted);
    log?.write({ ...handed.line, actedMs: Math.round(acted) });
    onChange();
  };
  // The line of a cue the target never reported acting on goes out without it: at its next cue, when
  // it goes offline, or when the server stops.
  const settle = (entry: Entry) => {
    if (entry.handed) log?.write({ ...entry.handed.line, actedMs: null });
    entry.handed = null;
  };
  // The cue's section start in the set, in beats, or its song's End for an End cue, or null when the
  // set holds neither.
  const startOf = (cue: Cue): number | null => {
    const song = currentSet()?.songs.find((candidate) => candidate.number === cue.song);
    if (!song) return null;
    return cue.section === 'end' ? song.end : (song.sections[cue.section]?.time ?? null);
  };
  // The target's plan for the cue's section, none for a target that plans no slides, or whose plan
  // fails, which is logged. Its bars are in the meter of the cue's song, so a crossing plans the next
  // song in its own, and in the signature Live reports for a song whose meter is not read yet. The
  // songs' meters go with it, so a plan that depends on the song before plans that song in its own.
  const planOf = (entry: Entry, cue: Cue): SlidePlan => {
    try {
      return entry.target.plan?.(cue, meters().get(cue.song) ?? bar(), meters()) ?? [];
    } catch (error) {
      console.error(`Setlist server: the connection target ${entry.target.name} could not plan its slides`, error);
      return [];
    }
  };
  // The cue as the target gets it: for a target that plans its slides, with the slide for the
  // playhead's position, the last of the plan at or before its offset into the cue's section (never
  // below 0), and its first for a song's End. A cue that has its slide already, a change cue, and one
  // whose plan holds none, go as they are.
  const withSlide = (entry: Entry, cue: Cue): Cue => {
    if (cue.slide !== undefined) return cue;
    const plan = planOf(entry, cue);
    const start = startOf(cue);
    const at = position();
    const offset = cue.section === 'end' || start === null || at === null ? 0 : Math.max(0, at - start);
    const shown = plan.findLast(({ beat }) => beat <= offset + EPSILON) ?? plan[0];
    return shown ? { ...cue, slide: shown.slide } : cue;
  };
  // Hands the target the cue, and records how late it was, when the time it was due is known. A
  // target that acknowledges gets its log line once it acts on the cue, or settles it; any other gets
  // it now. A cue with no due time gets its line now, with no lateness and the reason the caller
  // gives, and changes neither the row nor the cue waiting to be acted on, which it settles. A cue
  // the target does not act on is handed over with no line, and settles nothing.
  const hand = (entry: Entry, raised: Cue, due: number | null, unmeasured: UnmeasuredReason) => {
    const cue = withSlide(entry, raised);
    entry.early = null;
    if (!(entry.target.actsOn?.(cue) ?? true)) {
      safely(entry, 'take a cue', () => entry.target.cue(cue));
      return;
    }
    settle(entry);
    const fields = { time: new Date().toISOString(), target: entry.target.name, song: cue.song, title: cue.title, section: cue.name, cause: cue.cause, ...(cue.slide === undefined ? {} : { slide: cue.slide }) };
    if (due === null) log?.write({ ...fields, lateMs: null, actedMs: null, unmeasured });
    else {
      const late = clock.now() - due;
      entry.lateness.handed(late);
      const line = { ...fields, lateMs: Math.round(late) };
      if (entry.target.acknowledges) entry.handed = { cue, due, line };
      else log?.write({ ...line, actedMs: null });
      onChange();
    }
    safely(entry, 'take a cue', () => entry.target.cue(cue));
  };
  // The target's lead in beats: 0 for a target that plans no slides or sets none.
  const leadOf = (entry: Entry) => (entry.target.plan ? Math.max(0, entry.target.lead ?? 0) : 0);
  // The due time of a slide the target is handed on observation, played into or on a loop's wrap: its
  // beat less the lead, in clock time at Live's tempo.
  const lessLead = (entry: Entry, due: number | null) => (due === null ? due : due - (leadOf(entry) * 60_000) / tempo());
  // The due time of the slide a section's cue played into goes with, from its downbeat's: for slide 1
  // on a pickup, the pickup's, that many beats earlier at Live's tempo.
  const pickupDue = (entry: Entry, given: Cue, start: number | null, due: number | null) => {
    if (due === null || given.cause !== 'played-into' || given.section === 'end' || start === null) return due;
    const plan = planOf(entry, given);
    const at = position();
    const offset = at === null ? 0 : Math.max(0, at - start);
    const shown = plan.findLast(({ beat }) => beat <= offset + EPSILON) ?? plan[0];
    return shown && shown.beat < -EPSILON ? due + (shown.beat * 60_000) / tempo() : due;
  };
  // Whether the slide on that beat went early, or one after it did, as the target's last change sent
  // early: the screen has moved on to it, so the playhead playing across the beat sends nothing.
  const wentEarly = (entry: Entry, beat: number) => entry.early !== null && entry.early.beat >= beat - EPSILON;
  // Forgets the change sent early once the playhead at `at` is behind where the cue engine last
  // reported it when the change went: playing on, it never reports it there, so the playhead moved
  // back, as a drag at the laptop moves it. A report taken before the change went but arriving after
  // it is not behind, nor is a start's next move from where Live sat stopped.
  const back = (entry: Entry, at: number) => {
    if (entry.early !== null && at < entry.early.from - EPSILON) entry.early = null;
  };
  // Forgets the change sent early once the playhead at `at` has reached its beat, or for a pickup, its
  // downbeat.
  const reached = (entry: Entry, at: number) => {
    if (entry.early !== null && untilBeat(entry.early) <= at + EPSILON) entry.early = null;
  };
  const unschedule = (entry: Entry) => {
    entry.pending?.stop();
    entry.pending = null;
  };
  // The section holding the brace's start, with its song: the loop's own section, or for a brace set
  // by hand, the latest to start at or before it and not end by it. The last section of a song with
  // no End has no end, so it holds every later beat too, and a later song's section must win.
  const braceSection = (brace: Loop): { song: Song; index: number } | null => {
    const songs = currentSet()?.songs ?? [];
    const { section: address } = brace;
    if (address) {
      const song = songs.find((candidate) => candidate.number === address.song);
      return song?.sections[address.section] ? { song, index: address.section } : null;
    }
    let found: { song: Song; index: number; time: number } | null = null;
    for (const song of songs) {
      for (const [index, { time, end }] of song.sections.entries()) {
        if (time <= brace.start + EPSILON && (end === null || brace.start < end - EPSILON) && (!found || time > found.time)) found = { song, index, time };
      }
    }
    return found;
  };
  // The wrap of Live's loop: the slide the brace's start shows, the last of its section's plan at or
  // before it, as a loop cue for that section, due on the brace's end. Null when no section of the
  // set holds the brace's start, or its plan holds no slide, as for a section that clears. A brace on
  // the section itself, from its start to its end, whose slide 1 is on a pickup, wraps to it that far
  // before the brace's end, when that is after the section's own last change; otherwise, and for a
  // brace set by hand anywhere else, on the brace's end.
  const wrapOf = (entry: Entry, brace: Loop): Change | null => {
    const holding = braceSection(brace);
    const section = holding?.song.sections[holding.index];
    const cue = holding && cueFor(holding.song, holding.index, 'loop');
    if (!section || !cue) return null;
    const plan = planOf(entry, cue);
    const shown = plan.findLast(({ beat }) => beat <= brace.start - section.time + EPSILON) ?? plan[0];
    if (!shown) return null;
    const end = brace.start + brace.length;
    const own = section.end !== null && Math.abs(brace.start - section.time) < EPSILON && Math.abs(end - section.end) < EPSILON;
    const first = plan[0];
    const pickup = own && first && first.beat < -EPSILON && brace.length + first.beat > plan.at(-1)!.beat + EPSILON ? first.beat : 0;
    return { cue: { ...cue, slide: shown.slide }, beat: end + pickup, wrap: true, ...(pickup < 0 ? { downbeat: end } : {}) };
  };
  // The next slide change after `offset` beats into the cue's section, for a target that plans its
  // slides: the next of the section's plan, else the first of the next section of the same song,
  // else the song's End's, else the crossing into the next song (crossing). From the song's End, the
  // crossing, and null when there is none, or when the look ahead stops at a section that clears
  // first (onward), whose own cue schedules the next. While Live's loop is on and the playhead is
  // before its brace's end, only a change before that end, whose section starts before it too, so no
  // pickup goes for a section the loop never reaches, else the loop's wrap: Live never plays past the
  // end. A clear before that end stops it too, since the wrap's slide would go before it, as does a
  // pickup that passes such a clear.
  const ahead = (entry: Entry, from: Cue, offset: number): Change | null => {
    const song = currentSet()?.songs.find((candidate) => candidate.number === from.song);
    if (!song) return null;
    if (from.section === 'end') return crossing(entry, song);
    const next = onward(entry, song, from.section, offset);
    const brace = loop();
    const start = song.sections[from.section]?.time;
    if (brace === null || brace.length <= 0 || start === undefined || start + offset >= brace.start + brace.length - EPSILON) return isStop(next) ? null : next;
    const end = brace.start + brace.length - EPSILON;
    if (isStop(next)) return next.clear < end ? null : wrapOf(entry, brace);
    if (next?.passes !== undefined && next.passes < end) return null;
    return next && untilBeat(next) < end ? next : wrapOf(entry, brace);
  };
  // The next slide change after `offset` beats into the song's section at that index, with no loop:
  // in the song's sections (inSections), else its End's slide, else the crossing, or the stop at a
  // section that clears before any of them. The End's slide is skipped for a crossing whose lead it
  // falls inside, since the screen goes from the song's last section straight to the next song's
  // first slide.
  const onward = (entry: Entry, song: Song, from: number, offset: number): Change | Stop | null => {
    const inSong = inSections(entry, song, from, offset);
    if (inSong) return inSong;
    const next = crossing(entry, song);
    const end = cueFor(song, 'end', 'played-into');
    const first = end && song.end !== null ? planOf(entry, end)[0] : undefined;
    const ending = end && first && song.end !== null ? { cue: { ...end, slide: first.slide }, beat: song.end + first.beat } : null;
    return next && (!ending || endInsideLead(entry, song, next)) ? next : ending;
  };
  // The first slide change of the song's sections from the one at that index on: the first of its
  // plan after `offset` beats into it, or with no offset its first, else the first of the next
  // section's plan. A section the playhead is not in, every one with no offset, whose plan holds
  // none, as one that clears, is a stop: nothing past it goes early, so no slide goes before its
  // downbeat, unless the next section's slide 1, on a pickup, comes due at or before that downbeat,
  // its beat less the lead: then that slide passes the clear. For the song's last section, the
  // crossing's first slide on a pickup passes it the same way (passingClear). A first slide on a
  // pickup is due before its section's start, its downbeat.
  const inSections = (entry: Entry, song: Song, from: number, offset: number | null): Change | Stop | null => {
    for (let index = from; index < song.sections.length; index += 1) {
      const cue = cueFor(song, index, 'played-into');
      const section = song.sections[index];
      if (!cue || !section) continue;
      const plan = planOf(entry, cue);
      const playing = index === from && offset !== null;
      if (!playing && plan.length === 0) return passingClear(entry, song, index) ?? { clear: section.time };
      const next = playing ? plan.find(({ beat }) => beat > offset + EPSILON) : plan[0];
      if (next) return slideIn(cue, section.time, next);
    }
    return null;
  };
  // The change for a slide of the plan of the cue's section, starting on that beat in the set.
  const slideIn = (cue: Cue, start: number, { beat, slide }: SlidePlan[number]): Change => ({ cue: { ...cue, slide }, beat: start + beat, ...(beat < -EPSILON ? { downbeat: start } : {}) });
  // The next section's slide 1, on a pickup that comes due, its beat less the lead, at or before the
  // downbeat of the section at that index, which clears, as passing it; else null. For the song's
  // last section, the crossing's first slide passes it the same way, when it is on a pickup and
  // passes no clear of its own, and the song has no End or its End falls inside the crossing's lead,
  // so an End that shows outside that lead keeps its own slide.
  const passingClear = (entry: Entry, song: Song, index: number): Change | null => {
    const clearing = song.sections[index];
    if (!clearing) return null;
    if (!song.sections[index + 1]) {
      const across = crossing(entry, song);
      if (!across || across.downbeat === undefined || across.passes !== undefined || across.beat - leadOf(entry) > clearing.time + EPSILON) return null;
      return song.end === null || endInsideLead(entry, song, across) ? { ...across, passes: clearing.time } : null;
    }
    const section = song.sections[index + 1];
    const cue = cueFor(song, index + 1, 'played-into');
    const first = cue && planOf(entry, cue)[0];
    if (!section || !cue || !first || first.beat >= -EPSILON || section.time + first.beat - leadOf(entry) > clearing.time + EPSILON) return null;
    return { ...slideIn(cue, section.time, first), passes: clearing.time };
  };
  // Whether the song plays on into the next song: always for a song with no End, which never stops
  // Live (playback-controller.ts, reachedEnd), whatever its end toggle, else while its end toggle is
  // Continue into next song (playsOn).
  const continues = (song: Song) => song.end === null || playsOn(song.number);
  // The crossing from the song: the next song's first slide, the first of the plan of the first
  // section of the next song in set order, due on that slide's beat, while the song plays on into it
  // (continues), from its End or, for a song with no End, from its last section. Null for a song set
  // to stop at its End, or the last, and when that section's plan holds none, as a stop.
  const crossing = (entry: Entry, song: Song): Change | null => {
    if (!continues(song)) return null;
    const songs = currentSet()?.songs ?? [];
    const next = songs[songs.findIndex((candidate) => candidate.number === song.number) + 1];
    const first = next && inSections(entry, next, 0, null);
    return first && !isStop(first) ? { ...first, crosses: song.number } : null;
  };
  // Whether the cue is a song's End the playhead played into, or that a jump landed on, as Next on the
  // song's last section, inside the lead of the crossing from that song, which went early to the
  // target: only a crossing actually sent drops the End. A jump's End before the crossing went is a
  // landing inside its lead, which deliver hands the crossing's slide in the End's place.
  const droppedEnd = (entry: Entry, cue: Cue) => {
    const { early } = entry;
    if (cue.section !== 'end' || (cue.cause !== 'played-into' && cue.cause !== 'jump') || !early) return false;
    const song = currentSet()?.songs.find((candidate) => candidate.number === cue.song);
    const across = song && crossing(entry, song);
    if (!song || !across || (early.crosses !== cue.song && early.cue.song !== across.cue.song)) return false;
    return endInsideLead(entry, song, across);
  };
  // Whether the cue is a section that clears, played into, that the next section's slide 1, on a
  // pickup, passed when it went early to the target, or for the song's last section, the crossing's
  // first slide: the slide replaced the one before directly.
  const droppedClear = (entry: Entry, cue: Cue) => {
    const { early } = entry;
    const start = startOf(cue);
    return cue.cause === 'played-into' && cue.section !== 'end' && early?.passes !== undefined && (early.cue.song === cue.song || early.crosses === cue.song) && start !== null && Math.abs(early.passes - start) < EPSILON;
  };
  // Whether the cue is a clear played into, an End with no End or Ending group or a section that
  // clears, as the target gets it with no slide, that Live reports only after a change from its song,
  // or the crossing from it, went early to the target for a beat past the clear's downbeat (its
  // downbeat for a pickup): the screen shows the slide for a place past the clear, so the clear would
  // blank it, and the change sent again at once. A wrap sent early never counts: the look ahead stops
  // at a clear before the brace's end, so a clear played into after the wrap went starts at or past
  // that end, the wrap's own beat.
  const passedClear = (entry: Entry, cue: Cue, given: Cue) => {
    const { early } = entry;
    const start = startOf(cue);
    return cue.cause === 'played-into' && given.slide === undefined && early !== null && (early.cue.song === cue.song || early.crosses === cue.song) && start !== null && untilBeat(early) > start + EPSILON;
  };
  // Whether the cue is a section that clears, played into, whose clear the change ahead of the
  // playhead passes (passingClear): the next section's slide 1 on a pickup, or for the song's last
  // section the crossing's first slide, due at or before the clear's downbeat less the lead, that did
  // not go early, as after a Fade out once the producer arms ProPresenter again, or a pause at its
  // send time. A wrap ahead never matches, so a brace ending inside the section keeps its clear. Nor
  // does any change while the prediction is unknown, as while a jump tapped late at the section's
  // downbeat waits, since the playhead may never reach that slide: the section keeps its clear.
  const coveredClear = (entry: Entry, cue: Cue, change: Change) => {
    if (cue.cause !== 'played-into' || cue.section === 'end' || change.wrap === true || planOf(entry, cue).length > 0 || predict(change.beat) === null) return false;
    const song = currentSet()?.songs.find((candidate) => candidate.number === cue.song);
    const passing = song ? passingClear(entry, song, cue.section) : null;
    return passing !== null && Math.abs(passing.beat - change.beat) < EPSILON && passing.cue.song === change.cue.song && passing.cue.slide === change.cue.slide;
  };
  // Whether the song's End falls inside the lead of the crossing from it: at or after the beat the
  // crossing goes, its beat less the lead, and before or on its beat.
  const endInsideLead = (entry: Entry, song: Song, change: Change) =>
    song.end !== null && song.end >= change.beat - leadOf(entry) - EPSILON && song.end <= change.beat + EPSILON;
  // The next slide change ahead of the playhead, `offset` beats into the cue's section, that has not
  // gone yet: the next after the change sent early, while that one is still ahead of the playhead, and
  // none after a wrap sent early, whose own loop cue schedules the next.
  const following = (entry: Entry, cue: Cue, offset: number): Change | null => {
    const start = startOf(cue);
    const { early } = entry;
    const earlyStart = early ? startOf(early.cue) : null;
    if (early && earlyStart !== null && start !== null && untilBeat(early) > start + offset + EPSILON) return early.wrap ? null : ahead(entry, early.cue, early.beat - earlyStart);
    return ahead(entry, cue, offset);
  };
  // Schedules the change at its beat less the target's lead, as predicted, in place of any waiting,
  // or sends it at once when that time has passed and the beat has not; for a slide 1 on a pickup,
  // the beat is its downbeat, a wrap's being the brace's end, so a reschedule between the pickup and
  // the downbeat (a Loop press, the loop off, an End toggle change, a re-prediction) sends it at once.
  // Nothing while the prediction is unknown; the playhead playing across the beat sends it then.
  const schedule = (entry: Entry, change: Change | null) => {
    unschedule(entry);
    const lead = leadOf(entry);
    if (!change || lead <= 0) return;
    const at = predict(change.beat - lead);
    const on = predict(untilBeat(change));
    const now = clock.now();
    const brace = loop();
    if (at === null || on === null || on <= now) return;
    if (at <= now) {
      fire(entry, { ...change, at, loop: brace });
      return;
    }
    // A one-shot: the timer stops itself on its first tick.
    const stop = clock.every(at - now, () => {
      stop();
      if (entry.pending?.stop !== stop) return;
      entry.pending = null;
      fire(entry, { ...change, at, loop: brace });
    });
    entry.pending = { ...change, at, loop: brace, stop };
  };
  // Sends the change scheduled early, due at the time it was scheduled for, if the target is armed and
  // online, and Live still plays on with no jump waiting and the loop as it was when the change was
  // scheduled; otherwise it is dropped. Then schedules the next, but for a wrap: a beat after the wrap
  // cannot be predicted from a report before it, so the wrap's own loop cue schedules the next.
  const fire = (entry: Entry, change: Change & { at: number; loop: Loop | null }) => {
    if (!sameLoop(loop(), change.loop) || predict(change.beat) === null) return;
    miss(entry, change.cue);
    if (entry.arm !== 'armed' || entry.connection !== 'online') return;
    hand(entry, change.cue, change.at, 'not-played-across');
    const { cue, beat, wrap, crosses, downbeat, passes } = change;
    entry.early = { cue, beat, from: reported ?? beat - leadOf(entry), ...(wrap ? { wrap } : {}), ...(crosses === undefined ? {} : { crosses }), ...(downbeat === undefined ? {} : { downbeat }), ...(passes === undefined ? {} : { passes }) };
    const start = startOf(change.cue);
    if (!change.wrap && start !== null) schedule(entry, ahead(entry, change.cue, change.beat - start));
  };

  // Looks ahead again from the playhead for a target with a lead, armed and online, and schedules the
  // next change, in place of any waiting. Nothing while the playhead is in no section.
  const scheduleFromPlayhead = (entry: Entry) => {
    unschedule(entry);
    if (entry.arm !== 'armed' || entry.connection !== 'online' || leadOf(entry) <= 0) return;
    const cue = current();
    const start = cue && startOf(cue);
    const at = position();
    if (cue && start !== null && at !== null) schedule(entry, following(entry, cue, at - start));
  };

  // A move back inside the cue's section, from one offset to another, as a drag at the laptop: hands
  // the target the slide for where the playhead lands, unmeasured, since it played across no beat,
  // unless the screen shows it already, then schedules the next change from the landing. When the
  // landing is at or after the next change's send point, its beat less the lead, and before its
  // beat, the landing's slide is that change's, and it counts as sent early, so it does not go again.
  // Otherwise the landing's slide is the last of the plan at or before it, and none, as in a section
  // that clears, hands the section's clear when a change went early, since the screen shows that
  // change, and nothing otherwise. The screen shows the change sent early while one is remembered, else
  // the plan's slide where the move started.
  const movedBack = (entry: Entry, cue: Cue, plan: SlidePlan, from: number, to: number) => {
    const start = startOf(cue);
    const { early } = entry;
    const at = (offset: number) => plan.findLast(({ beat }) => beat <= offset + EPSILON);
    const shownAt = at(from);
    const showing = early ? { song: early.cue.song, slide: early.cue.slide } : shownAt && { song: cue.song, slide: shownAt.slide };
    const landing = start === null ? null : start + to;
    const lead = leadOf(entry);
    const change = landing === null || lead <= 0 ? null : ahead(entry, cue, to);
    const due = change && landing !== null && landing >= change.beat - lead - EPSILON ? change : null;
    entry.early = null;
    const landed = due ? due.cue : { ...cue, slide: at(to)?.slide };
    if (landed.slide !== undefined && (showing?.song !== landed.song || showing.slide !== landed.slide)) hand(entry, landed, null, 'not-played-across');
    else if (!due && plan.length === 0 && early) hand(entry, landed, null, 'not-played-across');
    if (due && landing !== null) entry.early = { ...due, from: landing };
    if (start === null) {
      unschedule(entry);
      return;
    }
    schedule(entry, following(entry, cue, to));
  };

  // The leader's Stop or a jump request: no change waits. A change sent early stays remembered: the
  // controller may refuse the request, and the cue an accepted one lands on, or a move back, forgets it.
  const cancel = () => {
    for (const entry of entries) unschedule(entry);
  };

  // A change by hand pauses an armed target, and one a Fade out or a move out paused, so the music coming back
  // does not take over behind the operator. A disarmed target has nothing to stop. Whatever the arm
  // state, the screen changed, so a change sent early is forgotten.
  const changedByHand = (entry: Entry) => {
    entry.early = null;
    if (entry.arm === 'armed' || entry.pause === 'fade-out' || entry.pause === 'moved') set(entry, { arm: 'paused', pause: 'by-hand' });
  };
  // A press that moved the target onto something that is no song of the set pauses an armed target,
  // and one a Fade out paused, until the producer arms it or the music comes back, as a Fade out's
  // pause ends. A target paused by hand stays so, and a disarmed one has nothing to stop. Whatever the
  // arm state, the screen changed, so a change sent early is forgotten.
  const movedOut = (entry: Entry, item: string) => {
    entry.early = null;
    if (entry.arm === 'armed' || entry.pause === 'fade-out' || entry.pause === 'moved') set(entry, { arm: 'paused', pause: 'moved', movedTo: item });
  };

  return {
    rows: () =>
      all.map((entry) =>
        'target' in entry
          ? {
              name: entry.target.name,
              label: entry.target.label,
              configured: true,
              problems: [...entry.problems],
              connection: entry.connection,
              arm: entry.arm,
              pause: entry.pause,
              movedTo: entry.movedTo,
              check: entry.check,
              buttons: entry.target.buttons.map(({ id, label }) => ({ id, label })),
              pick: pickCopy(entry.pick),
              state: [...entry.state],
              list: [...entry.list],
              listCurrent: entry.listCurrent,
              lateness: entry.lateness.read(),
            }
          : { name: entry.name, label: entry.label, configured: false, problems: [...entry.problems], connection: 'offline', arm: 'disarmed', pause: null, movedTo: null, check: NOT_CHECKED, buttons: [], pick: null, state: [], list: [], listCurrent: null, lateness: NOT_MEASURED },
      ),
    // A target that fails to start stays offline, and never stops the server or another target.
    async start() {
      await Promise.all(
        entries.map(async (entry) => {
          try {
            await entry.target.start({
              status: (connection) => report(entry, connection),
              changedByHand: () => changedByHand(entry),
              movedOut: (item) => movedOut(entry, item),
              state: (lines, list, current) => {
                if (entry.connection !== 'online') return;
                const shown = list ? [...list] : [];
                const marked = typeof current === 'number' && Number.isInteger(current) && current >= 0 && current < shown.length ? current : null;
                set(entry, { state: lines ? [...lines] : [], list: shown, listCurrent: marked });
              },
              actedOn: (cue) => actedOn(entry, cue),
              missed: (cue) => miss(entry, cue),
              problem: (problem) => set(entry, { problems: problem ? [problem] : [] }),
              pick: (pick) => set(entry, { pick: pickCopy(pick) }),
              fileChanged: () => void runCheck(entry),
            });
          } catch (error) {
            console.error(`Setlist server: the connection target ${entry.target.name} did not start`, error);
          }
        }),
      );
    },
    async stop() {
      cancel();
      for (const entry of entries) settle(entry);
      await Promise.all(entries.map((entry) => entry.target.stop()));
    },
    command(command) {
      const entry = entries.find((entry) => entry.target.name === command.target);
      if (!entry) return;
      switch (command.kind) {
        case 'arm':
          // The producer hands the target back to the server, so the target is told, whatever its arm
          // state before (target.ts, armed). The music coming back after a Fade out arms it with no word
          // to it: that cue goes to it at once (deliver).
          set(entry, { arm: 'armed', pause: null });
          if (entry.target.armed) safely(entry, 'take the Arm', () => entry.target.armed?.());
          break;
        case 'disarm':
          // The screen is the operator's while disarmed, so a change sent early is forgotten.
          entry.early = null;
          set(entry, { arm: 'disarmed', pause: null });
          break;
        case 'fire-again': {
          const cue = entry.connection === 'online' ? current() : null;
          if (!cue) break;
          // Fire again has no beat it is due on, so it is never measured. A change sent early whose
          // beat the playhead has not reached is what the screen shows, so Fire again sends it again
          // and keeps it marked, and its beat still sends nothing.
          const { early } = entry;
          const at = position();
          if (early && at !== null && at >= early.from - EPSILON && untilBeat(early) > at + EPSILON) {
            hand(entry, { ...early.cue, cause: 'fire-again' }, null, 'fire-again');
            entry.early = early;
          } else hand(entry, cue, null, 'fire-again');
          break;
        }
        case 'run-button': {
          // A button that blanks the screen leaves no change sent early showing, so it is forgotten;
          // any other leaves the slide it moved to, which the change's beat must not undo. A press the
          // server ignores is logged, as a press that never reached the target leaves no other trace.
          const button = entry.target.buttons.find(({ id }) => id === command.button);
          if (entry.connection !== 'online' || !button) {
            console.error(`Setlist server: the connection target ${entry.target.name} ignored the button ${command.button}: ${button ? 'it is offline' : 'it offers no such button'}.`);
            break;
          }
          if (button.blanks) entry.early = null;
          safely(entry, 'run a button', () => entry.target.runButton(command.button));
          break;
        }
        case 'pick': {
          const list = currentSet();
          const { pick } = entry.target;
          const offered = entry.pick?.options.some(({ id }) => id === command.choice) ?? false;
          // The pick changes what the check is against, so the check runs again once the target has
          // taken it. A pick that fails runs no check.
          if (entry.connection !== 'online' || !pick || !offered) break;
          // A page that raced the server can still send a pick before a set is read; it is dropped,
          // and the log says why.
          if (!list) {
            console.error(`Setlist server: the connection target ${entry.target.name} ignored the pick: no set has been read from Live.`);
            break;
          }
          safely(entry, 'take a pick', async () => {
            await pick.call(entry.target, command.choice, list);
            await runCheck(entry);
          });
          break;
        }
      }
    },
    deliver(cue, due) {
      // A song's End cue comes before the next song's first cue in the same move, so it leaves the
      // word for that cue.
      if (cue.section !== 'end') {
        if (musicBack === 'count-in' || (musicBack && bringsMusicBack(cue))) {
          for (const entry of entries) if (entry.pause === 'fade-out' || entry.pause === 'moved') set(entry, { arm: 'armed', pause: null });
        }
        musicBack = false;
      }
      const start = startOf(cue);
      const at = position();
      reported = at;
      for (const entry of entries) {
        miss(entry, cue);
        if (entry.arm !== 'armed' || entry.connection !== 'online') continue;
        if (leadOf(entry) <= 0) {
          // With no lead, a slide 1 on a pickup went when the playhead played across its beat (moved):
          // its downbeat, or its wrap, sends nothing again.
          const given = withSlide(entry, cue);
          const { early } = entry;
          const picked =
            early?.downbeat !== undefined &&
            start !== null &&
            early.cue.song === given.song &&
            early.cue.slide === given.slide &&
            ((cue.cause === 'played-into' && Math.abs(early.downbeat - start) < EPSILON) || (cue.cause === 'loop' && early.wrap === true));
          if (picked) entry.early = null;
          else hand(entry, given, pickupDue(entry, given, start, due), 'not-played-across');
          continue;
        }
        // The song's End, played into or a jump's landing, inside the lead of the crossing from it,
        // which went early: the screen shows the next song's first slide, and the End sends nothing
        // over it. One whose crossing did not go early shows the crossing's slide at once, below, as a
        // landing does. The next song's cue on the crossing's beat finds it sent early. Played into, nothing
        // else changes, since the crossing scheduled the next change when it went; the jump request
        // dropped that change (cancel), so a jump's End schedules it again from the End. So too a
        // section that clears, played into, that the next section's slide 1 on a pickup passed when it
        // went early, or for a song's last section, the crossing's first slide on a pickup. One whose
        // pickup did not go early, as after a Fade out once the producer arms ProPresenter again, or a
        // pause at its send time, shows that slide at once in place of its clear, below.
        if (droppedEnd(entry, cue)) {
          if (cue.cause === 'jump') schedule(entry, following(entry, cue, 0));
          continue;
        }
        if (droppedClear(entry, cue)) continue;
        // The playhead's place, on the End for an End cue, and never before the section's start, and
        // the beat of the slide the cue goes with.
        const here = start === null ? null : cue.section === 'end' || at === null ? start : Math.max(start, at);
        // The wrap a change sent early went for, landing where its slide shows: the screen shows it
        // already. A drag back inside the loop to another slide's place is handed that slide. The
        // playhead is back behind where the change went, so back() forgets it.
        const given = withSlide(entry, cue);
        const { early } = entry;
        const wrapped = cue.cause === 'loop' && early?.wrap === true && early.cue.song === given.song && early.cue.slide === given.slide;
        if (here !== null) back(entry, here);
        // A clear played into, reported after a change past its downbeat went early: the screen shows
        // that change's slide, and the clear sends nothing over it. Nothing else changes, as for an End
        // dropped inside the crossing's lead: the change scheduled the next one when it went, and its
        // beat finds it sent early. It is checked once back() has run, so a drag back to a section
        // that clears, behind where the change went, forgets it and clears.
        if (passedClear(entry, cue, given)) continue;
        // A jump's landing, Play from start's or a count-in's, inside the lead of the next change, at or
        // after its beat less the lead and before or on its beat (its downbeat for a pickup): the
        // landing shows that change's slide at once, in place of its own, as a drag back does, so an End
        // there sends no clear before the crossing. So too a song's End the playhead played into inside
        // the crossing's lead (endInsideLead) when the crossing did not go early, as after a Fade out or
        // a pause at its send time: the End sends the crossing's slide, measured against its beat less
        // the lead, and no clear and no End or Ending group. So too a section that clears, played into,
        // whose clear the next section's slide 1 on a pickup, or the crossing's, passes (coveredClear),
        // when that slide did not go early, as after a Fade out once the producer arms ProPresenter
        // again, or a pause at its send time: the section sends that slide, measured against its beat
        // less the lead, and no clear. It counts as sent early, from the landing's place, so the
        // playhead playing across its beat sends nothing again, and the next change is scheduled from
        // it.
        const landing = cue.cause === 'jump' || cue.cause === 'play-from-start' || cue.cause === 'count-in';
        const intoEnd = cue.section === 'end' && cue.cause === 'played-into';
        const clearing = cue.section !== 'end' && cue.cause === 'played-into' && planOf(entry, cue).length === 0;
        const change = (landing || intoEnd || clearing) && start !== null && here !== null ? ahead(entry, cue, here - start) : null;
        const song = intoEnd ? currentSet()?.songs.find((candidate) => candidate.number === cue.song) : undefined;
        const inside =
          change !== null &&
          here !== null &&
          (intoEnd
            ? song !== undefined && endInsideLead(entry, song, change)
            : clearing
              ? coveredClear(entry, cue, change) && here <= untilBeat(change) + EPSILON
              : here >= change.beat - leadOf(entry) - EPSILON && here <= untilBeat(change) + EPSILON);
        if (change && inside && start !== null && here !== null) {
          const slideDue = (intoEnd || clearing) && due !== null ? lessLead(entry, due + ((change.beat - start) * 60_000) / tempo()) : due;
          hand(entry, { ...change.cue, cause: cue.cause }, slideDue, 'not-played-across');
          entry.early = { ...change, from: here };
          schedule(entry, following(entry, cue, here - start));
          continue;
        }
        const played = (cue.cause === 'played-into' || cue.cause === 'loop') && given.slide !== undefined;
        const shown = played && start !== null && here !== null ? start + (planOf(entry, cue).findLast(({ beat }) => beat <= here - start + EPSILON)?.beat ?? 0) : null;
        // A wrap sent early whose beat the playhead played into instead: Live played on past the
        // brace's end, as when the loop reached it with the playhead already past that end, so the
        // wrap never came and the screen shows its slide over the cue's. A slide 1 on a pickup shows
        // before its section's start, so the section's start is what played past the brace's end.
        const unwrapped = cue.cause !== 'loop' && entry.early?.wrap === true && shown !== null && start !== null && Math.max(shown, start) >= untilBeat(entry.early) - EPSILON;
        if (!wrapped && (shown === null || unwrapped || !wentEarly(entry, shown))) hand(entry, given, played ? lessLead(entry, pickupDue(entry, given, start, due)) : due, 'not-played-across');
        if (start === null || here === null) {
          unschedule(entry);
          continue;
        }
        reached(entry, here);
        schedule(entry, following(entry, cue, here - start));
      }
    },
    moved(cue, from, to) {
      const start = startOf(cue);
      reported = start === null ? position() : start + to;
      for (const entry of entries) {
        if (entry.arm !== 'armed' || !entry.target.plan) continue;
        const plan = planOf(entry, cue);
        if (entry.connection !== 'online') {
          if (changesOn(plan, from, to)) miss(entry, cue);
          continue;
        }
        if (to < from) {
          movedBack(entry, cue, plan, from, to);
          continue;
        }
        const started = from === to;
        const crossed = plan.filter(({ beat }) => beat <= to + EPSILON && (started || beat > from + EPSILON));
        const shown = crossed.at(-1);
        if (start !== null) back(entry, start + from);
        // A start mid-section in a section whose plan holds no slide, as one that clears, hands the
        // cue as it is, so the target does what the section's cue does.
        if (started && plan.length === 0) hand(entry, cue, null, 'not-played-across');
        else if (shown) {
          // A start mid-section played across no beat, so its slide goes unmeasured. A target with a
          // lead was due its slide the lead before the beat.
          const due = started || start === null ? null : dueAt(start + shown.beat);
          const early = start !== null && wentEarly(entry, start + shown.beat);
          if (!early) hand(entry, { ...cue, slide: shown.slide }, leadOf(entry) > 0 ? lessLead(entry, due) : due, 'not-played-across');
        }
        if (start === null) continue;
        // A slide 1 on a pickup, the next section's or a loop wrap's, whose beat the move played across
        // before it went: it goes on the move, as a slide crossed, and its downbeat sends nothing again.
        const pickup = started ? null : ahead(entry, cue, to);
        if (pickup?.downbeat !== undefined && pickup.beat > start + from + EPSILON && pickup.beat <= start + to + EPSILON && !wentEarly(entry, pickup.beat)) {
          const due = dueAt(pickup.beat);
          hand(entry, pickup.cue, leadOf(entry) > 0 ? lessLead(entry, due) : due, 'not-played-across');
          entry.early = { ...pickup, from: start + to };
        }
        reached(entry, start + to);
        // A change waiting for a beat this move played across went on the move; with none waiting,
        // the next one ahead of the playhead is scheduled.
        if (entry.pending && entry.pending.beat <= start + to + EPSILON) unschedule(entry);
        if (!entry.pending) schedule(entry, following(entry, cue, to));
      }
    },
    cancel,
    observed() {
      // The songs that play on into the next song now, or no longer do, since the last look, a song new
      // to the set aside: a change to the end toggle of a song with no End changes nothing, since that
      // song always plays on (continues).
      const playsOnNow = new Map((currentSet()?.songs ?? []).map((song) => [song.number, continues(song)]));
      const toggled = new Set([...playsOnNow].filter(([song, on]) => seenPlaysOn.has(song) && seenPlaysOn.get(song) !== on).map(([song]) => song));
      seenPlaysOn = playsOnNow;
      // A crossing sent early from a song that no longer plays on is forgotten, so that song's End goes
      // as it would have. A crossing waiting from a song whose toggle changed, and every target while
      // the playhead is in such a song, look ahead again from the playhead.
      const playing = current()?.song;
      for (const entry of entries) {
        const { early, pending } = entry;
        if (early?.crosses !== undefined && toggled.has(early.crosses) && !playsOnNow.get(early.crosses)) entry.early = null;
        const crosses = pending?.crosses;
        if ((crosses !== undefined && toggled.has(crosses)) || (playing !== undefined && toggled.has(playing))) scheduleFromPlayhead(entry);
      }
      const brace = loop();
      if (!sameLoop(brace, seenLoop)) {
        seenLoop = brace;
        const braceEnd = brace && brace.length > 0 ? brace.start + brace.length : null;
        const at = position();
        const wrapsFirst = braceEnd !== null && at !== null && at < braceEnd - EPSILON;
        for (const entry of entries) {
          if (entry.early?.wrap || (wrapsFirst && entry.early && untilBeat(entry.early) >= braceEnd - EPSILON)) entry.early = null;
          scheduleFromPlayhead(entry);
        }
        return;
      }
      // A waiting change predicted more than a beat from its send time is looked up again from the
      // playhead, and one whose prediction is gone is dropped; within a beat it stays, so report
      // jitter never moves it.
      for (const entry of entries) {
        const { pending } = entry;
        const at = pending && predict(pending.beat - leadOf(entry));
        if (pending && (at === null || Math.abs(at - pending.at) > 60_000 / tempo())) scheduleFromPlayhead(entry);
      }
    },
    fadeOut() {
      musicBack = false;
      for (const entry of entries) {
        unschedule(entry);
        if (entry.arm === 'armed' && entry.target.pausesOnFade) set(entry, { arm: 'paused', pause: 'fade-out' });
      }
    },
    countOff(countIn = false) {
      musicBack = countIn ? 'count-in' : 'section';
    },
    checkAll() {
      for (const entry of entries) void runCheck(entry);
    },
  };
}
