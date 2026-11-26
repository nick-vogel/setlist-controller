import { createConnection, type Socket } from 'node:net';
import { countOffIndex } from '../shared/count-in.ts';
import { namesMatch } from '../shared/match-name.ts';
import { decode, encode, type OscMessage, type OscOutArgument } from '../shared/osc.ts';
import { songTitle, type SetList, type Song } from '../shared/snapshot.ts';
import { realClock, type Clock } from './clock.ts';
import type { TargetKind } from './connections-config.ts';
import type { Cue } from './cues.ts';
import { frame, packetReader } from './osc-tcp.ts';
import type { Target, TargetReport } from './target.ts';

// The lights: an ETC Eos console, over OSC on TCP.

// The lights' section in the connections config file: Eos's address, its OSC TCP port (3032 when
// left out, Eos's default), and the number of the cue list the lights follow.
//
//   { "targets": { "eos": { "host": "192.168.10.50", "cueList": 1 } } }
//
// Its target pauses on a Fade out, and on a cue fired at the console: a fire event that answers
// none of its own commands, is not the cue the live cue's follow or hang fires next, and is not the
// second fire event Eos sends, within the window, of a cue they fired by number as the live cue's
// follow fired it, judged again after a fresh read of the cue list while one of its Go or Back presses is pending, since
// the list may have changed at the console since it was read; and on a reconnect, the cue Eos is on unless it is the live cue from before the drop, one of the lights'
// own fires whose fire event the drop ate, a cue Eos may be on by the cue list after one of their
// own Go or Back presses whose fire event the drop ate, or a cue that one of those Eos fires by
// itself after it. A song's cue is the first cue in the list whose whole label is the song title,
// by the shared name rule. The lights fire the song cue on the song's song-start section (its Count
// Off, its first section when it has no Count Off), judged on the set their last check held, for a
// section played into, Play from start, or a jump from another song, judged by the song of the last
// cue the server handed them at or past its song-start section, forgotten on Arm and on a drop. A
// Count Off on the End of the song before is played into, so it fires too, and so does a count-in
// onto the Count Off or the section after it, which is Play from start. Fire again fires the song
// cue of the song it names, whatever section. Nothing else fires: a loop wrap, a jump inside the
// song, a start in the middle of a song, a count-in onto a later section, whose landing is never on
// the Count Off, any other section and a song's End. They act only on a cue they fire on playback,
// and acknowledge each one through Eos's fire event for that cue, so the server measures how late
// the lights get a song cue and how late Eos fires it, one lights line per song cue fired. It
// subscribes on every connect, and reads the cue list again whenever Eos notifies it that a cue changed, then runs its check again once that read finishes in full, so a
// cue recorded, moved or deleted at the console needs no Refresh. It is online only while Eos
// answers: a connect with no answer within a few seconds, a connection that goes silent, a refused
// connect and a closed connection each show offline with the reason on the row.
export function eosKind({ clock = realClock }: { clock?: Pick<Clock, 'every' | 'now'> } = {}): TargetKind {
  return {
    label: LABEL,
    create(section) {
      const problems = sectionProblems(section);
      if (problems.length > 0) return { problems };
      return { target: eosTarget(clock, { host: section.host as string, port: (section.port as number | undefined) ?? DEFAULT_PORT, cueList: section.cueList as number }) };
    },
  };
}

const LABEL = 'Lights';
const DEFAULT_PORT = 3032;
// The line the page shows when the lights' check finds a cue for every song of the set.
const PASS_TEXT = 'Every song has a cue.';

const whole = (value: unknown, min: number, max = Infinity) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

function sectionProblems(section: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (typeof section.host !== 'string' || section.host.trim() === '') problems.push('The lights\' "host" must be the Eos console\'s address, such as "192.168.10.50".');
  if (section.port !== undefined && !whole(section.port, 1, 65535)) problems.push('The lights\' "port" must be Eos\'s OSC TCP port, a whole number from 1 to 65535. Leave it out for 3032.');
  if (!whole(section.cueList, 1)) problems.push('The lights\' "cueList" must be the number of the cue list to follow, a whole number such as 1.');
  return problems;
}

type Settings = { host: string; port: number; cueList: number };

// How long after a connect that failed, or a connection that closed, the lights connect again. A
// refused connect fails in milliseconds, so the pause bounds the retries, not the wait.
const RETRY_MS = 5000;

// How long after the lights start a connect Eos has to send its first OSC packet, before the lights
// give the connect up as failed. Eos on the stage network answers in milliseconds; the limit bounds a
// connect to a host that drops it, which macOS would otherwise hold about 75 s, one that a host
// accepts but never answers over OSC, such as an Eos with OSC TX off, and one that answers in
// another framing, such as an Eos whose OSC TCP mode is OSC 1.1, whose bytes frame no packet.
const CONNECT_TIMEOUT_MS = 3000;

// Liveness, once online: the lights send Eos an OSC ping, /eos/ping, this often, which Eos answers
// with /eos/out/ping (ETC's Eos Family online help, "Using OSC with Eos"). Any packet from Eos
// answers it. This many pings in a row with no word from Eos mean the connection has gone silent,
// as behind a pulled cable or a dropped Wi-Fi, which closes nothing: 3 to 4 seconds of silence. The
// lights count pings instead of timing the silence, as the Live bridge counts its probes
// (live-bridge.ts), so after an event loop stall the one late tick never takes the server's own
// deafness for Eos's silence.
const PING_MS = 1000;
const LOST_AFTER_PINGS = 3;
const PING = '/eos/ping';
// Subscribes a connection to Eos's notifies of a change to the show, with the int 1, sent on every
// connect, since nothing recorded shows whether a subscribe outlives a drop.
const SUBSCRIBE = '/eos/subscribe';

// How long a read of the cue list may take before it is abandoned, keeping the cues read before. Eos
// answered the recorded read of nine cues in about 100 ms; the limit only bounds a read whose last
// reply never comes.
const READ_TIMEOUT_MS = 10000;

// How long after one of the lights' own commands a fire event may come and still be its answer.
// Eos answered every recorded command in 33 to 47 ms (test/fixtures/eos/), on loopback; the window
// leaves the stage network and a busy Eos twenty times that, and bounds a command whose answer never
// comes, such as a fire of a cue deleted at the console.
const OWN_COMMAND_WINDOW_MS = 1000;

// A cue in the cue list: its number as Eos gives it, such as "3.5", and its label as Eos gives it,
// "" for none, which a song's cue matches whole against the song title. Then its link, which Go
// takes: the cue of this list it names, which Go fires next, a cue outside this list, which Go
// fires in place of any cue of it, or none, when Go fires the next cue. Then what Eos fires by itself after it: nothing, when it has neither a follow
// nor a hang, else by its link, or the next cue in the list when it has no link.
type ListedCue = { number: string; label: string; link: Link; then: { link: Link } | null };

// A cue's link: the number of the cue of this list it names, a cue outside this list, or null for
// none.
type Link = { cue: string } | Outside | null;

// A link to a cue outside this list: the list and the cue it names, as numbers, or null when the
// lights cannot read them from the link.
type Outside = { outside: { list: number; cue: number } | null };

const isOutside = (link: Link): link is Outside => link !== null && 'outside' in link;

// What Eos fires by itself after a cue, from its list reply's link, follow time and hang time
// (arguments 19 to 21, test/fixtures/eos/README.md "Follows and links"): by its link, read by
// linkOf, when it has a follow or a hang, in ms, -1 for none, else nothing.
function thenOf(link: Link, follow: unknown, hang: unknown): ListedCue['then'] {
  const timed = (time: unknown) => typeof time === 'number' && time >= 0;
  if (!timed(follow) && !timed(hang)) return null;
  return { link };
}

// A cue's link, from its list reply's argument 19, as Go, a follow and a hang take it (ETC's Eos
// Family online help, "Link / Loop"), read once for all of them. A link in the same list is the
// target cue's number, 0 for none, recorded as an int; a link to a decimal cue is not recorded, so
// a float is read to three places, as Eos numbers a cue. A link to a cue in another list is a
// string, "99/1" for cue 1 of list 99 (link-to-another-list.json), which names that cue outside
// this list, never cue 1 of it: the list before the first "/" and the cue after it, read as
// numbers. A string whose list is this one names that cue of it, read as the int is; any other
// string is outside this list, and one with no "/", no cue number after it or no list number before
// it names no cue the lights can read, so a link the lights cannot read never predicts a cue of the
// list. Anything else is none.
function linkOf(link: unknown, cueList: number): Link {
  const cueOf = (number: number): Link => ({ cue: String(Number(number.toFixed(3))) });
  if (typeof link === 'number') return link === 0 ? null : cueOf(link);
  if (typeof link !== 'string') return null;
  const at = link.indexOf('/');
  const list = at < 0 ? NaN : Number(link.slice(0, at));
  const cue = at < 0 ? NaN : Number(link.slice(at + 1));
  const readable = Number.isFinite(cue) && cue > 0;
  if (list === cueList && readable) return cueOf(cue);
  return { outside: readable && Number.isInteger(list) && list > 0 ? { list, cue } : null };
}

// A cue as one line of the lights row, such as "Cue 3: Goodness of God", or "Cue 8" for
// one with no label.
const cueLine = (lead: string, { number, label }: { number: string; label: string }) => (label === '' ? `${lead} ${number}` : `${lead} ${number}: ${label}`);

// A read of the cue list in flight: the count once Eos answers it, every index answered so far, and
// each base cue by its index. The count takes in the parts of a multipart cue, each at an index of
// its own, so the read ends once every index has answered, a part's included. It resolves true once
// it finishes in full, and false when it is cut short.
type Read = { done: Promise<boolean>; count: number | null; answered: Set<number>; found: Map<number, ListedCue>; end(full: boolean): void };

// One of the lights' own commands that fires a cue: a fire of a cue by its number, with the Cue it
// was sent for, Go or Back. Go and Back carry no cue; a close predicts every cue Eos may be on
// after each.
type Own = { cue: string; handed: Cue } | 'go' | 'back';

function eosTarget(clock: Pick<Clock, 'every' | 'now'>, { host, port, cueList }: Settings): Target {
  // The open connection, once Eos first answers on it, until it closes.
  let online: Socket | null = null;
  // The connection connecting or open, if any, and set by stop.
  let socket: Socket | null = null;
  let stopped = false;
  // The pending connect again, if any.
  let retry: (() => void) | null = null;
  // Stops the timers of the connection connecting or open: its connect timeout or its pings.
  let stopTimers: (() => void) | null = null;
  // The problem line on the row, as last logged, or null when none is. A failure is logged only when
  // its line is new, so a connect that fails the same way on every retry logs once.
  let shown: string | null = null;
  // The cue list as last read in full, in list order, whether a read has finished yet, and the read
  // in flight, if any.
  let cues: ListedCue[] = [];
  let listRead = false;
  let read: Read | null = null;
  // The read to start once the read in flight ends, asked for by a notify or a fresh judgement while
  // it was in flight, which began before the edit: resolves as that next read does.
  let again: { done: Promise<boolean>; resolve(full: boolean): void } | null = null;
  // The live cue: the cue Eos last fired in the cue list, its number and label, from its fire
  // event, or before the first one since the connection opened, the cue Eos is on when the lights
  // connect, from the active cue it sends on connect. That message carries no label, so its label
  // is null, which takes the label of that number in the cue list as last read in full. Null while
  // offline, and while Eos has named no cue. On a reconnect, when there was a live cue or a kept
  // cue before the drop, that cue is a change by hand unless it is the live cue from before the
  // drop, one of the lights' own unanswered fires or a cue Eos may be on after one of their
  // unanswered Go or Back presses, all kept below, or a cue that one of those Eos fires by itself
  // after it. With none, it is not judged. Cue 0, the list faded out by a Back on its first cue
  // (back-first-cue.json), is kept as the live cue to place the next Go and Back from, but the row
  // shows no line for it.
  let live: { number: string; label: string | null } | null = null;
  // The number of the live cue when a connection last closed, kept until a live cue is taken again or
  // the lights send a cue of their own, so the cue Eos is on when the lights connect again is judged
  // against it once. Null before the first live cue, and once judged.
  let before: string | null = null;
  // The numbers of the cues the lights' own commands fired whose fire event had not come when a
  // connection last closed, since a drop can eat a fire event of a cue Eos did fire: each cue fired
  // by number, and every cue Eos may be on after each Go or Back, predicted from the cue list as
  // last read in full. Kept and cleared with the live cue before (by a fire event, the lights' own command, or
  // the judgement), and judged on its own when there was no live cue before, so the cue Eos is on
  // when the lights connect again is their own when it is one of these or a cue that one Eos fires
  // by itself after it.
  let beforeOwn = new Set<string>();
  // The cues Eos named as its active cue since the last fire event, in order, as a cue recorded at
  // the console becomes with no fire event. Cleared on each fire event and on a close.
  let named: string[] = [];
  // The cue the lights fired by number as the live cue's follow fired it, with the time of its fire
  // event, since Eos then sends a second, identical fire event of it (fire-racing-follow.json). Used
  // up by that event within the window, and cleared by a fire event of any other cue, by one of it
  // that answers nothing, and on a close.
  let echo: { number: string; at: number } | null = null;
  // How the target reports to the server, once started.
  let reporter: TargetReport | null = null;
  // The set the lights' last check was handed, which the song-start rule is judged on, as
  // ProPresenter keeps the set it last planned. The server checks on coming online and on every
  // change of the set, before the lights are handed a cue of it, but for the first cue of a changed
  // set, which comes before its check and is judged on the set before. Null before any check.
  let held: SetList | null = null;
  // The song of the last cue the server handed the lights at or past its song-start section, acted
  // on or not, which tells a jump from another song from one inside the song. Forgotten on the
  // producer's Arm and when the connection closes; null, unknown, counts as another song.
  let lastSong: number | null = null;
  // The lights' own commands that fire a cue and whose answer has not come yet, oldest first, each
  // with the time it was sent: a fire of a cue by its number, or a Go or a Back, which fire
  // whatever cue Eos picks. A Go also records the link outside the list of the cue it was sent from
  // (the cue goFrom names), or null for none, by the cue list as read when it was sent, since that
  // is the list Eos's Go was pressed against, and a read before its answer comes can renumber the
  // live cue or drop its link; any other command records null.
  // A close forgets them, keeping in beforeOwn the cues each may fire: the number of a fire by
  // number, and every cue Eos may be on after a Go or Back by the cue list. A fire event judged
  // again after a fresh read takes its Go or Back at once, so no later event can.
  let own: { command: Own; at: number; outside: Outside | null }[] = [];

  const send = (address: string, args: OscOutArgument[] = []) => online?.write(frame(encode(address, args)));
  // Sends a command that fires a cue, and remembers it, only when it reaches an open connection,
  // with the link outside the list of the cue goFrom names, as the list reads now, when it is a Go.
  const sendOwn = (address: string, command: Own) => {
    if (!online) return;
    send(address);
    own.push({ command, at: clock.now(), outside: command === 'go' ? outsideLink(goFrom()) : null });
    before = null;
    beforeOwn = new Set();
  };
  // Forgets the lights' own commands sent longer ago than the window, once Eos sends anything, a ping
  // reply included: Eos is answering, so a command with no answer by now never gets one, such as a
  // Go whose fire event was the live cue's follow cue and so answered nothing.
  const forgetUnanswered = () => {
    const now = clock.now();
    own = own.filter(({ at }) => now - at <= OWN_COMMAND_WINDOW_MS);
  };
  // The one of the lights' own commands sent within the window that an event answers, the first
  // that accounts for it, or a later one that accounts for it too when `rather` prefers it to that
  // first, or null when the event answers none. `accounts` gets each command with the link outside
  // the list it recorded when it was sent, or null. That command is used up, with every command
  // before it, since Eos answers over one connection in command order, so an earlier command with no
  // answer by now never gets one.
  const answers = (accounts: (command: Own, outside: Outside | null) => boolean, rather: (first: Own, later: Own) => boolean = () => false): Own | null => {
    const first = own.findIndex(({ command, outside }) => accounts(command, outside));
    if (first < 0) return null;
    const later = own.findIndex(({ command, outside }, at) => at > first && accounts(command, outside) && rather(own[first]!.command, command));
    const at = later < 0 ? first : later;
    const { command } = own[at]!;
    own = own.slice(at + 1);
    return command;
  };

  // Every cue whose whole label is the song title, by namesMatch, in list order. A label that holds
  // the title and more, such as "Goodness of God / Chorus", is not the song's. A song with no title
  // has no cue.
  const allLabelledFor = (title: string | null): ListedCue[] => {
    if (title === null) return [];
    return cues.filter((candidate) => namesMatch(candidate.label, title));
  };

  // The song's cue: the first cue in list order labelled with the song title, or undefined when none
  // is. The cue fired and the check both look up by allLabelledFor, so the check names exactly the
  // songs that fire nothing and the cues that never fire because an earlier one has the same label.
  const labelledFor = (title: string | null): ListedCue | undefined => allLabelledFor(title)[0];

  // The song cue a cue the server hands the lights fires, or undefined when it fires none. Fire
  // again fires the song cue of the song it names, whatever section it names. Any other cue fires it
  // only on the song's song-start section, for a song of the held set, when the playhead played
  // into it, Play from start landed on it, or a jump from another song did. A loop wrap, a jump
  // inside the song, a count-in, any other section and a song's End fire nothing.
  const songCueFor = (cue: Cue): ListedCue | undefined => {
    if (cue.cause === 'fire-again') return labelledFor(cue.title);
    const song = held?.songs.find((candidate) => candidate.number === cue.song);
    if (!song || cue.section !== songStart(song)) return undefined;
    const fires = cue.cause === 'played-into' || cue.cause === 'play-from-start' || (cue.cause === 'jump' && lastSong !== cue.song);
    return fires ? labelledFor(cue.title) : undefined;
  };

  const pastSongStart = (cue: Cue): boolean => {
    if (cue.cause === 'fire-again' || cue.section === 'end') return true;
    const song = held?.songs.find((candidate) => candidate.number === cue.song);
    const start = song ? songStart(song) : null;
    return start === null || cue.section >= start;
  };

  // Reads the cue list: its count, then every cue by index. The new list replaces the old one only
  // once every cue has answered, so a read during a service never leaves a gap with no cues. A read
  // already in flight is joined, not repeated, but a fresh read, for a list that changed since the
  // read in flight began, starts once it ends, if the connection is still online, and resolves as
  // that one does; every fresh read asked for during one read in flight is the same next read. A
  // read the connection's close or the time limit cuts short keeps the old list. Resolves once the
  // read ends, either way: true when it finished in full.
  const readCues = (fresh = false): Promise<boolean> => {
    if (read && fresh) {
      if (!again) {
        let resolve!: (full: boolean) => void;
        again = { done: new Promise<boolean>((given) => (resolve = given)), resolve };
      }
      return again.done;
    }
    if (read) return read.done;
    if (!online) return Promise.resolve(false);
    let resolve!: (full: boolean) => void;
    const done = new Promise<boolean>((given) => (resolve = given));
    const timeout = clock.every(READ_TIMEOUT_MS, () => thisRead.end(false));
    const thisRead: Read = {
      done,
      count: null,
      answered: new Set(),
      found: new Map(),
      end(full) {
        timeout();
        if (read === thisRead) read = null;
        resolve(full);
        const next = again;
        again = null;
        if (!next) return;
        if (online && !stopped) void readCues().then(next.resolve);
        else next.resolve(false);
      },
    };
    read = thisRead;
    send(`/eos/get/cue/${cueList}/count`);
    return done;
  };
  // A cue's place in the list, its number, its part, and its label, from the reply to an index read.
  // Only the list packet carries the label; the fx, links and actions packets do not. A part's label
  // fires nothing, since a fire names the cue, not the part: only a base cue (part 0) is kept.
  const LISTED = new RegExp(`^/eos/out/get/cue/${cueList}/([^/]+)/(\\d+)/list/0/\\d+$`);
  const COUNT = `/eos/out/get/cue/${cueList}/count`;
  // A cue of the cue list fired, by the app or at the console alike, with its label as argument 0.
  const FIRED = new RegExp(`^/eos/out/event/cue/${cueList}/([^/]+)/fire$`);
  // A cue of another cue list fired, which the lights follow only as the answer to a Go from a cue
  // linked to that cue outside their list (link-to-another-list.json), by the cue list as read when
  // the Go was sent or as read now; else it is ignored.
  const FIRED_ELSEWHERE = /^\/eos\/out\/event\/cue\/([^/]+)\/([^/]+)\/fire$/;
  // The cue of the cue list Eos is on, with its percent and no label: sent on connect, and again
  // after every fire, sometimes before the fire event (fire-follow-chain.json).
  const ACTIVE = new RegExp(`^/eos/out/active/cue/${cueList}/([^/]+)$`);
  // A Back during a fade answers with a stop of cue 0 (back-during-fade.json); it changes nothing on
  // the row and pauses nothing.
  const STOPPED = `/eos/out/event/cue/${cueList}/0/stop`;
  // A Go after a Back stopped a fade answers with a resume of cue 0, and the fade runs on
  // (back-during-fade-then-go.json); it changes nothing on the row and pauses nothing.
  const RESUMED = `/eos/out/event/cue/${cueList}/0/resume`;
  // A cue of the cue list recorded, moved or deleted, at the keypad or on any command line, sent to
  // a subscribed connection about 1 s after the edit with a sequence number and the cue
  // (cue-edit-at-keypad-subscribed.json, cue-edit-at-console-subscribed.json). The cue can be a
  // string, such as "11-12" for a move, so the whole list is read again, never one cue patched, and
  // once that read finishes in full the server runs the check again; a read cut short changes
  // nothing in it. The cue list notify that follows it, and every other notify, is ignored.
  const NOTIFIED = new RegExp(`^/eos/out/notify/cue/${cueList}/`);
  // Every packet Eos sends goes through here, and first forgets every command of the lights' own
  // sent longer ago than the window. Everything but a fire event, a stop or resume event, a cue
  // notify, the active cue Eos is on at connect and the replies to a read in flight is ignored, such
  // as the rest of what Eos sends on connect, the pending cue and the active cue during a fade. A
  // cue notify starts a fresh read of the cue list and, once it finishes in full, the check again.
  // A fire event is the live cue, and a change by hand unless it answers one of the lights' own
  // commands or is the cue the live cue before it fires next by itself, whatever the arm state: the
  // server decides whether it pauses. A fire by number of the cue the live cue's follow fires as
  // it fires it gives two identical fire events of that cue (fire-racing-follow.json): the second,
  // within the window of the first and answering none of the lights' commands, is the same fire,
  // acts on no Cue and takes no pending Go or Back; a third, or one after the window, is a change
  // by hand. A Go or a Back answers only with a cue it fires from the live cue before the event,
  // past either end of the list included, and the cue that live cue's follow fires next included,
  // so the follow's event uses up a Go that could have fired it, and a cue fired at the console
  // after it pauses. A Go from a cue linked to a cue outside the list fires no cue of it, and
  // answers with the fire event of the cue the link names, in its list, list and cue compared as
  // numbers, or of a cue in any other list when the lights cannot read the link, which leaves the
  // live cue where it is, acts on no Cue and pauses nothing. Any other fire event of another list,
  // such as the walk-in list fired at the console, answers no Go and uses up no command before it.
  // The linked cue's event answers a Go pressed from a cue with that link by the cue list as read
  // when it was pressed, or by the list as read now, so a read between the Go and its answer that
  // renumbers the live cue or drops its link still leaves the answer the Go's; with no such Go
  // pending, that event is ignored. What Eos fires for that Go is not recorded
  // (test/fixtures/eos/README.md), so this is a stand-in until it is.
  // A fire by number of the cue answers in place of an earlier Go or Back that fires it only past
  // an end of the list, so a Go that fires nothing never hides a cue fired at the console, and
  // the fire is measured. With no live cue the lights can place, a Go or a Back answers with any
  // cue. A fire event that answers none of them while a Go or a Back is pending is judged again
  // once a fresh read of the cue list ends, from the live cue before the event: the first Go or
  // Back pending at the event, taken at once, answers it when the fresh list says it fires that
  // cue, or from the last cue Eos named as active since the last fire event, but the event's own,
  // as a cue recorded at the console becomes, or when the cue, or the live cue it is fired from, as
  // when that cue was moved, is not in the fresh list either; else,
  // and when the close or the time limit cuts the read short, it is a change by hand. So a cue edited at the console that Eos has not notified yet, about 1 s
  // after the edit, or never notifies, never pauses the producer's next Go or Back. A fire event
  // that answers the lights' fire of a cue by number is the lights acting on the Cue that fire was
  // sent for; the server counts it only for the Cue it last handed over and measured, so Fire again
  // and an older cue never count.
  // Go, Back, a follow and a fire by hand act on no Cue. A stop event answers a Back, and a resume
  // event a Go. The active cue is the live cue only while there is none and none of the lights'
  // own commands is pending, from the connect to the first fire event, so a follow after a
  // reconnect is judged against the cue Eos is on; any later one is ignored, since Eos can send a
  // cue's active cue before its fire event, which would judge a follow against itself. Until a
  // fire event places the live cue, the follow and the Go from a cue linked outside are judged from
  // the last cue Eos named, so one named while a command is pending still counts, and a pending Go
  // that Eos names a cue linked outside for, as the list reads then, is a Go from a cue with that
  // link, as one pressed after it is, unless it recorded a link when it was sent. It answers none of the lights' own commands.
  // On a reconnect, when there was a live cue or a kept cue before the drop, it is a change by
  // hand, judged once, unless it is the live cue from before the drop, a cue the lights' own
  // commands fired whose fire event had not come by the close, which a drop can eat though Eos
  // fired the cue (the cue of a fire by number, or a cue Eos may be on after a Go or Back by the
  // cue list), or a cue that one of those Eos fires by itself after it, one follow or hang after another,
  // since a drop lasts long enough for a chain of follows to run on, and a cue fired at the console
  // while the lights were offline sends them no fire event. A fire whose fire event never came is
  // acted on by no Cue. With neither, as on the first connect, or after a drop that ate only a Go
  // or Back with no live cue to predict it from, it is not judged.
  const receive = (message: OscMessage) => {
    forgetUnanswered();
    const fired = FIRED.exec(message.address);
    if (fired) {
      const [label] = message.args;
      const number = fired[1]!;
      const from = live?.number ?? null;
      const followed = firesNext(from ?? named.at(-1) ?? null) === number;
      const activeBefore = named.filter((cue) => cue !== number).slice(-1);
      named = [];
      live = { number, label: typeof label === 'string' ? label : '' };
      before = null;
      beforeOwn = new Set();
      showLines();
      // A fire of a cue accounts only for that cue. A Go or a Back accounts for a cue it fires from
      // the live cue, the one the live cue's follow fires included, and for any cue when the lights
      // cannot place the live cue, since Eos picks the cue. A later fire of the cue takes the event
      // from a Go or Back that accounts for it only past an end of the list, which with no Wrap
      // fires nothing (go-last-cue.json), so the fire is acted on and a cue fired at the console
      // after it still pauses.
      const command = answers(
        (command) => {
          if (typeof command === 'object') return command.cue === number;
          return !placed(from) || firesFrom(command, from).includes(number);
        },
        (first, later) => typeof first !== 'object' && typeof later === 'object' && pastEnd(first, from),
      );
      const byNumber = typeof command === 'object' && command !== null;
      if (byNumber) reporter?.actedOn(command.handed);
      // The second fire event Eos sends of a cue the lights fired by number as the live cue's follow
      // fired it (fire-racing-follow.json), within the window, answers nothing, and is the same fire.
      const repeat = !command && !followed && echo?.number === number && clock.now() - echo.at <= OWN_COMMAND_WINDOW_MS;
      if (byNumber && followed) echo = { number, at: clock.now() };
      else if (!command || echo?.number !== number) echo = null;
      if (command || followed || repeat) return;
      const at = own.findIndex(({ command }) => typeof command !== 'object');
      if (at < 0) {
        reporter?.changedByHand();
        return;
      }
      const taken = own[at]!.command as 'go' | 'back';
      own = own.slice(at + 1);
      void readCues(true).then((full) => {
        if (full && (!placed(from) || !placed(number) || firesFrom(taken, from).includes(number) || activeBefore.some((cue) => placed(cue) && firesFrom(taken, cue).includes(number)))) return;
        reporter?.changedByHand();
      });
      return;
    }
    const elsewhere = FIRED_ELSEWHERE.exec(message.address);
    if (elsewhere && elsewhere[1] !== String(cueList)) {
      const list = Number(elsewhere[1]);
      const cue = Number(elsewhere[2]);
      const names = (link: Outside | null) => link !== null && (link.outside === null || (link.outside.list === list && link.outside.cue === cue));
      answers((command, outside) => command === 'go' && (names(outside) || names(outsideLink(goFrom()))));
      return;
    }
    if (message.address === STOPPED) {
      answers((command) => command === 'back');
      return;
    }
    if (message.address === RESUMED) {
      answers((command) => command === 'go');
      return;
    }
    if (NOTIFIED.test(message.address)) {
      void readCues(true).then((full) => {
        if (full) reporter?.fileChanged();
      });
      return;
    }
    const active = ACTIVE.exec(message.address);
    if (active) {
      named.push(active[1]!);
      const link = live === null ? outsideLink(active[1]!) : null;
      if (link) for (const sent of own) if (sent.command === 'go') sent.outside ??= link;
      if (live !== null || own.length > 0) return;
      const number = active[1]!;
      const kept = before;
      const keptOwn = beforeOwn;
      live = { number, label: null };
      before = null;
      beforeOwn = new Set();
      showLines();
      const liveBefore = kept !== null && (number === kept || firedAfter(kept).has(number));
      const ownBefore = [...keptOwn].some((cue) => cue === number || firedAfter(cue).has(number));
      if ((kept !== null || keptOwn.size > 0) && !liveBefore && !ownBefore) reporter?.changedByHand();
      return;
    }
    if (!read) return;
    if (message.address === COUNT && read.count === null) {
      const count = message.args[0];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return;
      read.count = count;
      // A cue list that does not exist counts 0, as an empty one does.
      if (count === 0) finish(read);
      else for (let index = 0; index < count; index += 1) send(`/eos/get/cue/${cueList}/index`, [{ int: index }]);
      return;
    }
    const match = LISTED.exec(message.address);
    if (!match || read.count === null) return;
    const [index, , label] = message.args;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= read.count || typeof label !== 'string') return;
    read.answered.add(index);
    if (Number(match[2]) === 0) {
      const link = linkOf(message.args[19], cueList);
      read.found.set(index, { number: match[1]!, label, link, then: thenOf(link, message.args[20], message.args[21]) });
    }
    if (read.answered.size === read.count) finish(read);
  };
  // The number of the cue Eos fires by itself after that cue, on its follow or its hang, by the cue
  // list as last read in full, or undefined when it fires none of the list, a cue linked outside it
  // included, or the cue is not in the list. Whoever fired the cue, its follow or hang fires the next
  // one, so a chase that loops or a link that skips never pauses, and the operator firing any other
  // cue does.
  const firesNext = (number: string | null): string | undefined => {
    const at = cues.findIndex((cue) => cue.number === number);
    const then = cues[at]?.then;
    if (!then || isOutside(then.link)) return undefined;
    return then.link === null ? cues[at + 1]?.number : then.link.cue;
  };
  // The numbers of every cue Eos fires by itself after that cue, one follow or hang after another,
  // once each, so a chase that loops back ends.
  const firedAfter = (number: string): Set<string> => {
    const fired = new Set<string>();
    for (let next = firesNext(number); next !== undefined && !fired.has(next); next = firesNext(next)) fired.add(next);
    return fired;
  };
  // The number of the cue a Go from that cue fires, by the cue list as last read in full: the cue
  // of the list its link names, when it has one, else the next cue in list order. Undefined when the
  // cue is not in the list, is its last cue with no link, or links outside the list.
  const goesTo = (number: string): string | undefined => {
    const at = cues.findIndex((cue) => cue.number === number);
    if (at < 0) return undefined;
    const { link } = cues[at]!;
    if (isOutside(link)) return undefined;
    return link?.cue ?? cues[at + 1]?.number;
  };
  // That cue's link to a cue outside the list, by the cue list as last read in full, so a Go from it
  // fires no cue of the list, or null when it has none or is not in the list.
  const outsideLink = (number: string | null): Outside | null => {
    const link = cues.find((cue) => cue.number === number)?.link ?? null;
    return isOutside(link) ? link : null;
  };
  // Whether that cue links to a cue outside the list, by the cue list as last read in full.
  const linksOutside = (number: string | null): boolean => outsideLink(number) !== null;
  // The cue a Go from the lights is judged from for a link outside the list, by the cue list as last
  // read in full: the live cue when the lights can place it, or else the last cue Eos named as
  // active since the last fire event, as when the console renumbered the live cue or there is none.
  const goFrom = (): string | null => (live !== null && placed(live.number) ? live.number : (named.at(-1) ?? null));
  // The number of the cue a Back from that cue fires when no fade is running, by the cue list as
  // last read in full: the cue before it in list order, never across a link (ETC's Eos Family
  // online help, "Stop / Back"). Undefined when the cue is not in the list, or is its first cue.
  const backsTo = (number: string): string | undefined => {
    const at = cues.findIndex((cue) => cue.number === number);
    return at > 0 ? cues[at - 1]!.number : undefined;
  };
  // Whether the lights know where a Go or a Back from that cue lands, by the cue list as last read
  // in full: a cue of the list, or cue 0, the list faded out by a Back on its first cue, in a list
  // with cues.
  const placed = (number: string | null): number is string => number !== null && (number === '0' ? cues.length > 0 : cues.some((cue) => cue.number === number));
  // Whether a Go or a Back from that cue goes past an end of the list, by the cue list as last read
  // in full: a Go from its last cue with no link, or a Back from its first cue, which fire only by
  // the end's outcome, Wrap's or Cue Out's, if at all. A Go from a cue linked outside the list goes
  // to that cue, not past the end.
  const pastEnd = (command: 'go' | 'back', number: string | null): boolean => {
    if (!placed(number) || number === '0') return false;
    return command === 'go' ? goesTo(number) === undefined && !linksOutside(number) : number === cues[0]!.number;
  };
  // The numbers of the cues a Go or a Back from that cue fires, by the cue list as last read in
  // full. Go: the cue goesTo names, and from the last cue with no link the first, as Wrap fires it;
  // from cue 0 the first (back-first-cue.json pends cue 1); none from a cue linked outside the list,
  // which fires no cue of it. Back: the cue backsTo names, and from the
  // first cue cue 0, as Back From First's default Cue Out fires it (back-first-cue.json), and the
  // last, as Wrap fires it, and none from cue 0. OSC cannot read Wrap, Go From Last or Back From First
  // (test/fixtures/eos/README.md "Edge cases"), so each end expects every outcome. None for a cue
  // the lights cannot place.
  const firesFrom = (command: 'go' | 'back', number: string): string[] => {
    if (!placed(number)) return [];
    const first = cues[0]!.number;
    const last = cues.at(-1)!.number;
    if (command === 'go') return linksOutside(number) ? [] : [goesTo(number) ?? first];
    if (number === '0') return [];
    return number === first ? ['0', last] : [backsTo(number)!];
  };
  // The numbers of every cue Eos may be on after a Go or a Back from that cue, or from any cue that
  // cue fires by itself after it, since its follow may have run before the press reached Eos: each
  // cue it fires, and the cue it stays on, if any. A Go on the last cue stays on it, as Go From
  // Last's default Do Nothing leaves it (go-last-cue.json), and so does a Go from a cue linked
  // outside the list, which fires no cue of it, and a Back stays on its cue when it only
  // stopped a fade (back-during-fade.json). Cue 0 is kept too, harmlessly: Eos names no numbered
  // active cue on connect after the list faded out (back-first-cue.json), so none is judged against
  // it. None for a cue the lights cannot place.
  const landsOn = (command: 'go' | 'back', number: string): Set<string> => {
    const lands = new Set<string>();
    for (const from of [number, ...firedAfter(number)]) {
      if (!placed(from)) continue;
      for (const cue of firesFrom(command, from)) lands.add(cue);
      if (command === 'back' || goesTo(from) === undefined) lands.add(from);
    }
    return lands;
  };
  const finish = (done: Read) => {
    cues = [...done.found.entries()].sort(([a], [b]) => a - b).map(([, cue]) => cue);
    listRead = true;
    showLines();
    done.end(true);
  };
  // The lights row's read-only lines: the live cue, once Eos has named one, as the line the row
  // always shows, and under it each cue of the list, in list order, once a read has finished, as the
  // list the row caps in height and scrolls, so a long cue list never hides the live cue. The live
  // cue's line in that list is the one the row marks and keeps in view, none while it is not listed.
  // Cue 0, the list faded out by a Back on its first cue (back-first-cue.json), shows no live cue
  // line and marks no line, as before the first fire.
  const showLines = () => {
    const listed = listRead && cues.length > 0;
    const list = !listRead ? [] : listed ? cues.map((cue) => cueLine('Cue', cue)) : [`Cue list ${cueList} has no cues.`];
    const named = live && live.number !== '0' ? live : null;
    const at = listed && named ? cues.findIndex((cue) => cue.number === named.number) : -1;
    reporter?.state(named ? [cueLine('Live cue', { number: named.number, label: named.label ?? labelOf(named.number) })] : [], list, at === -1 ? null : at);
  };
  // The label of that number in the cue list as last read in full, "" when it is not in the list.
  const labelOf = (number: string) => cues.find((cue) => cue.number === number)?.label ?? '';

  const address = `${host}:${port}`;
  const fail = (report: TargetReport, problem: string) => {
    report.problem(problem);
    if (problem === shown) return;
    shown = problem;
    console.error(`Setlist server: ${problem}`);
  };
  // Connects once, and sends Eos a ping once the connect lands. The connection is online at Eos's
  // first OSC packet on it, and subscribes and reads the cue list; from then on it pings Eos. A connect that fails or gets
  // no answer, a connection that goes silent, and one that closes are offline, with the reason on the
  // row and in the log, and connect again after a pause, until stop. The next connection online
  // clears the reason.
  const connect = (report: TargetReport) => {
    const connection = createConnection({ host, port });
    socket = connection;
    const reader = packetReader();
    // Why the lights gave the connection up, once they have, and the error it closed with, if any.
    let failure: string | null = null;
    let error: unknown = null;
    let unanswered = 0;
    const drop = (problem: string) => {
      stopTimers?.();
      failure = problem;
      connection.destroy();
    };
    stopTimers = clock.every(CONNECT_TIMEOUT_MS, () => drop(`The lights could not reach Eos at ${address}: no answer within ${CONNECT_TIMEOUT_MS / 1000} seconds. Check the address, that OSC RX and TX are on, and that the OSC TCP mode is OSC 1.0.`));
    const ping = () => {
      if (unanswered >= LOST_AFTER_PINGS) return drop(`Eos stopped answering the lights at ${address}.`);
      send(PING);
      unanswered += 1;
    };
    connection.on('connect', () => {
      if (!stopped) connection.write(frame(encode(PING, [])));
    });
    connection.on('data', (chunk: Buffer) => {
      if (stopped || failure) return;
      for (const packet of reader.push(chunk)) {
        unanswered = 0;
        if (online !== connection) {
          stopTimers?.();
          stopTimers = clock.every(PING_MS, ping);
          online = connection;
          shown = null;
          report.problem(null);
          report.status('online');
          send(SUBSCRIBE, [{ int: 1 }]);
          void readCues();
        }
        const message = decode(packet);
        if (message) receive(message);
      }
    });
    // A failed connect, or an error on the open connection, closes it too; the close reports both.
    connection.on('error', (cause: unknown) => {
      error = cause;
    });
    connection.on('close', () => {
      const wasOnline = online === connection;
      if (socket === connection) {
        socket = null;
        stopTimers?.();
        stopTimers = null;
      }
      if (online === connection) online = null;
      lastSong = null;
      // A cue may fire while the lights are offline, so the live cue waits for the cue Eos is on
      // when the lights connect again, which is judged against the live cue kept from now and the
      // cues the lights' own commands still unanswered fire, and no command sent before the close
      // is answered after it. Eos answers in command order, so the commands are walked in order
      // from the set of cues Eos may be on, at first the live cue: a fire by number makes it its
      // cue, and a Go or Back every cue it may land on from a cue of the set, by landsOn, and every
      // cue of every step is kept. A Go or Back from no cue the lights can place keeps nothing, nor
      // does any Go or Back after it until a fire by number. Every such command still in own is
      // kept, past the window, since a connection that goes silent closes seconds after its last
      // fire; own is pruned to the window only when a packet from Eos comes. A connect that
      // fails closes with no live cue and no command, and keeps those kept before it.
      if (live !== null) before = live.number;
      let at = new Set(live === null ? [] : [live.number]);
      for (const { command } of own) {
        at = typeof command === 'object' ? new Set([command.cue]) : new Set([...at].flatMap((cue) => [...landsOn(command, cue)]));
        for (const cue of at) beforeOwn.add(cue);
      }
      live = null;
      named = [];
      echo = null;
      own = [];
      read?.end(false);
      if (stopped) return;
      fail(report, failure ?? (error !== null && !wasOnline ? `The lights could not connect to Eos at ${address}: ${sentence(error)}` : 'Eos closed the connection to the lights.'));
      report.status('offline');
      connectLater(report);
    });
  };
  const connectLater = (report: TargetReport) => {
    if (retry || stopped) return;
    retry = clock.every(RETRY_MS, () => {
      retry?.();
      retry = null;
      connect(report);
    });
  };

  return {
    name: 'eos',
    label: LABEL,
    pausesOnFade: true,
    // The lights act only on a cue they fire on playback, by the very rule a cue fires by
    // (songCueFor): one on a song-start section with a firing cause, for a song that has a cue in
    // the cue list as last read in full. So the server measures one lights line per song cue fired,
    // and none for any other section, a Pad, Pad Out or End, nor for a song with no cue.
    // Fire again fires a song cue but is not acted on, so it writes no line. With no list read in
    // full yet, none is.
    acknowledges: true,
    actsOn: (cue: Cue) => cue.cause !== 'fire-again' && songCueFor(cue) !== undefined,
    // Connecting is never awaited: a connect that hangs never holds up the server's start.
    start(report) {
      reporter = report;
      connect(report);
    },
    // Cancels any connect again, any read and the connection's timers before it closes the
    // connection, so shutdown never races a reconnect, a ping or a problem line.
    async stop() {
      stopped = true;
      retry?.();
      retry = null;
      stopTimers?.();
      stopTimers = null;
      read?.end(false);
      socket?.destroy();
      socket = null;
      online = null;
    },
    // Fires the song cue the cue fires by the song-start rule (songCueFor), and nothing for any
    // other cue or a song with no cue, then keeps the cue's song when the cue is at or past the
    // song's song-start section, so the next jump is judged against it; the server calls actsOn just
    // before, which judges against the same song. Its fire event is the lights' own, and so is each
    // cue Eos fires by itself on a follow or hang after it, so neither pauses the lights. The fire
    // event that answers it is the lights acting on the cue, which the server measures.
    cue(cue: Cue) {
      const fired = songCueFor(cue);
      if (pastSongStart(cue)) lastSong = cue.song;
      if (fired) sendOwn(`/eos/cue/${cueList}/${fired.number}/fire`, { cue: fired.number, handed: cue });
    },
    // The producer's Arm hands the lights back to the server, so the song they were last handed no
    // longer tells where a jump came from.
    armed() {
      lastSong = null;
    },
    // Go fires the cue list's next cue, as [Go] on the console does. Back stops a fade running in
    // the cue list, or goes back a cue when none is, so during a fade a first press stops it and a
    // second goes back, as on the console. Each names the configured cue list, never the main
    // playback, with no argument. The server runs them whatever the arm state and never pauses the
    // lights for one (target.ts), and the fire or stop event that answers one is the lights' own,
    // so it never pauses them either, a cue edited at the console since the last read included.
    // When a drop eats that fire event, every cue Eos may be on after it by the cue list is kept,
    // so a reconnect to one never pauses them.
    buttons: [
      { id: 'go', label: 'Go' },
      { id: 'back', label: 'Back' },
    ],
    runButton(id) {
      if (id === 'go') sendOwn(`/eos/cues/${cueList}/fire`, 'go');
      if (id === 'back') sendOwn(`/eos/cues/${cueList}/stop`, 'back');
    },
    // Refresh, a change of the set, coming online and a cue notify's read that finishes in full
    // each read the cue list again, then name as unmatched each song of the set, in set order, that
    // no cue is labelled with the title of, as "<song title>: no cue", by the very lookup a cue fires
    // by. A cue whose label holds a section name is no song's cue, and adds no line. A song that two
    // or more cues are labelled for is matched, but each cue after the first in list order never
    // fires, and is a problem, in set order, as "<song title>: cue <n> never fires, cue <m> has the
    // same label", with <m> the cue that does, save a cue Eos fires by itself after any cue of the
    // list on a follow or hang, which does fire. A line is given once, so a song in the set twice
    // has one. A cue list with no cues gives one problem and no unmatched song instead, since Eos
    // counts a list that does not exist 0, as an empty one, and a line for every song would bury
    // it. The check is against the cue list as last read in full; with none read in full yet it
    // throws, and the row reads not checked. It gives no notes,
    // and its pass text is the lights' own (PASS_TEXT).
    async check(set: SetList) {
      held = set;
      await readCues();
      if (!listRead) throw new Error(`The lights have not read cue list ${cueList} in full yet`);
      if (cues.length === 0) return { unmatched: [], problems: [`Cue list ${cueList} is not in the show file, or holds no cues.`], notes: [], passText: PASS_TEXT };
      const unmatched = new Set<string>();
      const problems = new Set<string>();
      const followed = new Set(cues.flatMap((cue) => [...firedAfter(cue.number)]));
      for (const song of set.songs) {
        const [fires, ...shadowed] = allLabelledFor(song.title);
        if (!fires) {
          unmatched.add(`${songTitle(song)}: no cue`);
          continue;
        }
        for (const cue of shadowed.filter((cue) => !followed.has(cue.number))) problems.add(`${songTitle(song)}: cue ${cue.number} never fires, cue ${fires.number} has the same label`);
      }
      return { unmatched: [...unmatched], problems: [...problems], notes: [], passText: PASS_TEXT };
    },
  };
}

// The index of the song's song-start section, the section its song cue fires on: its first Count
// Off, so the look is up as the band counts off, its first section when it has no Count Off, and
// null for a song with no section.
function songStart(song: Song): number | null {
  if (song.sections.length === 0) return null;
  const countOff = countOffIndex(song);
  return countOff === -1 ? 0 : countOff;
}

// An error's message as a sentence, ending in a period, or the thing thrown when it is no Error.
function sentence(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /[.!?]$/.test(message) ? message : `${message}.`;
}
