import { setTimeout as wait } from 'node:timers/promises';
import { nameKey, namesMatch } from '../shared/match-name.ts';
import { itemFor, itemsNamed, occurrenceAt } from '../shared/occurrence.ts';
import { itemTitle, songPresentation } from '../shared/song-presentation.ts';
import { songTitle, type ConnectionChoice, type SetList, type Song } from '../shared/snapshot.ts';
import { realClock, type Clock } from './clock.ts';
import type { TargetKind } from './connections-config.ts';
import type { Cue } from './cues.ts';
import { picksStore, type StoredPlaylist } from './propresenter-picks.ts';
import { NO_SLIDE_TIMING, NOT_A_LIST, readSlideTiming, type SlideTiming } from './slide-timing.ts';
import type { FileCheck, SlidePlan, Target, TargetButton, TargetReport } from './target.ts';

// ProPresenter: the lyrics on the screens. The producer picks the set's playlist on its row, and
// armed, the nth section of a name triggers the first slide of the nth group of that name in the
// song's presentation, the server moves through the rest of that group's slides on an even split of
// the section's bars, and a section with no group shows slide 1 or clears the screen, so the words
// follow the band. The presentations carry no Go To Next timers: the server moves every slide. It
// talks to ProPresenter's network API over HTTP, which the Phase 0 recordings in
// test/fixtures/propresenter describe (setlist-controller#149).
//
// Online means GET /version answers, with any status, and from then on the status stream, POST
// /v1/status/updates, held open for status/slide and presentation/current. ProPresenter adds
// timer/system_time to it every 1 s, unasked (measured at home on 2026-11-02), which is its
// heartbeat. Only a connection failure or a timeout puts ProPresenter offline, or a stream that
// drops. A request that gets an HTTP answer, a 403, a 404 or a 500, never does, and a stream that does
// leaves ProPresenter online with no stream. /version is asked every poll while no stream is open,
// offline or not, and each answer opens the stream if none is. So once offline, the server reconnects
// on its own.
//
// A stream that goes quiet does not put ProPresenter offline: slide changes go out by HTTP, and the
// stream only feeds the row's slide text. On 2026-11-03, after it had run for 1 day and 15 hours, the
// home ProPresenter sent its heartbeat every 10 to 23 s and then not at all, while /version still
// answered, and reopening the stream never brought it back (setlist-controller#302). So after 10 s
// with no frame of any kind, counted from the last frame or the stream's open, /version is asked, one
// at a time. An answer, with no frame since it went, keeps ProPresenter online, and the stream is
// opened again, with the wait doubled each time up to 60 s, so the reopens come at 10, 20, 40, 60 and
// 60 s of silence; a heartbeat brings the wait back to 10 s, and so does going offline. Only a failed
// or timed-out /version puts ProPresenter offline. From the first answered probe until a heartbeat
// comes, the stream is quiet: the row keeps the last slide text and shows "slide text not live, status
// stream quiet" after it, the check names "ProPresenter's status stream is quiet: quit and reopen
// ProPresenter before the service." first among its problems, and the log gets one line when the quiet
// starts and one when the heartbeat comes back, none for each reopen. Going offline ends the quiet
// with no line. A cue or a slide change that came due while ProPresenter was offline and armed, or
// whose trigger got no answer before it went offline, as when that trigger is what finds it gone, is
// sent once it comes back, as the slide for the playhead, when it is still armed and Live is still in
// that section (connections.ts).
//
// The row's read-only state is the current slide's text and the next slide's, at each status/slide
// frame, and none after a clear: a status/slide with neither, a presentation/current with no
// presentation, or a Clear slide press that ProPresenter answers with a 2xx, at once, since some
// clears brought no status/slide. A stream that opens over a slide with words sends that slide at
// once, its presentation/current and then its status/slide, within 166 ms at home on 2026-11-10, and
// that frame is decided like any other. On each open, at the server's start and after a reconnect,
// the adapter also reads the live slide once, GET /v1/status/slide, whose answer has a status/slide
// frame's shape, and shows its text as a frame would, unless a status/slide frame or a clear came while
// the read was out, which is at least as new. The read answers 204 when no slide with words shows, so
// it only covers a stream whose opening frame is late. The read only shows text: it is no slide change,
// so it decides nothing about a change by hand.
// After it, the row shows the last text the stream reported, as the stream does not report every
// slide change (test/fixtures/propresenter/README.md, "The stream").
//
// The row's pick lists the playlists ProPresenter holds (GET /v1/playlists), read when it comes
// online and on each read below. The pick is kept per set (propresenter-picks.ts), so it survives a
// restart, and a set the server has not seen asks for a pick again. The picked playlist is read, with
// each presentation it links, on a pick, on Refresh, when the set read from Live changes, and when
// ProPresenter comes online, since ProPresenter links a Planning Center song to its presentation
// only some time after it pulls the playlist. A presentation read that answers 5xx, as a cold read of
// There Is Freedom answered 500 at home on 2026-11-02, is asked again up to twice, a second apart, and
// one that still fails is a problem in the check naming the song and the status, not "no
// presentation", so the producer presses Refresh rather than fixing the playlist (checkLines).
//
// A cue for section S of song T triggers GET /v1/presentation/{uuid}/{index}/trigger, a slide of a
// group by its index: the presentation of T in the playlist by the shared rule (song-presentation.ts:
// the first whose own name matches T, else the first whose playlist item's name does), and, when S
// is the nth section of its name in T, its nth group whose name matches S in the presentation's order,
// or the last of them for a section past it (the occurrence matcher, src/shared/occurrence.ts), both
// by namesMatch (match-name.ts). The index starts at 0 and counts every slide of the presentation in
// the order its read lists its groups and their slides, those of a group with no name and slides with
// no words or no text included, as ProPresenter counts them (test/fixtures/propresenter/README.md,
// 2026-11-02), so slide k of a group is its first slide's index plus k.
// The slide is the one the server hands the cue with: the adapter's plan of the
// section (plan, evenSplit) gives each of the group's slides the beat it goes on, the last section of
// a song with no End running to the next song's first locator (boundedSong), and the server sends
// the slide for the playhead's position on every cue cause, Fire again, a jump landing, a loop wrap and
// a start mid-section included, and each later slide as the playhead plays across its beat
// (connections.ts), or leadBeats before it while Live plays forward, the lyric lead, so the words are
// up before the line, and a loop wrap's slide leadBeats before the wrap. A clear has no lead. A section with a valid entry in the slide timing file
// (slide-timing.ts) takes its group and its slides' bars from it instead: the entry's group, by its
// position, in place of the name match, and the entry's changes in place of the even split, and its
// start puts slide 1 in the plan that many bars before the section's start, on a negative beat, for a
// line sung on a pickup: the server sends it there less the lead, as it plays forward into the section,
// on a loop wrap on the section itself and on a crossing into the next song, and it skips a clear the
// slide comes due at or before (connections.ts); a broken entry changes nothing, and the check names
// it. The check names a title in the file that matches no
// song in the set and no presentation in ProPresenter's libraries too, as a typo is, read from GET
// /v1/libraries and GET /v1/library/{name} only when a title matches no song in the set, in the shapes
// the home ProPresenter answered on 2026-11-06 (test/fixtures/propresenter). A cue handed with no slide triggers the group's first. Nothing is ever sent as
// "next". A section with no group of its name never leaves the last slide
// up: before the song's first section with a group, such as a Count Off or an Intro with no group, it
// triggers slide 1 of the presentation, index 0, whatever slide 1 holds; after it, such as a
// Turnaround, an Interlude or an Outro, it clears the slide layer, GET /v1/clear/layer/slide, on its
// downbeat. A song's End cue triggers the first slide of its group named End, or else of its group
// named Ending, the name Planning Center and MultiTracks give a song's closing group, and with neither
// it clears. A song with an Ending section of its own skips the Ending group at its End, since that
// section's cue triggered it already, so with no End group its End clears too; so does a song whose
// last section clears, such as an Outro with no group, rather than bring the Ending lyrics back after
// the music has ended. A song that plays on into the next, its end toggle on Continue or a song with no End, gets the next song's first slide leadBeats
// before its downbeat too, and an End inside that lead sends nothing once that slide went early: the
// server hands the adapter no End cue (connections.ts, the crossing). With no pick, no read yet, a song with no
// title, no presentation or playlist item of its name, a presentation this Mac is not authorized for
// (which answers every trigger with 403), or a song whose playlist item is on an arrangement other
// than Master, a cue sends nothing. The API does not return an arrangement's slides, so on any other
// arrangement the index would land on the wrong slide; an item with no arrangement named counts as on
// Master.
//
// ProPresenter acts on a cue when it answers the cue's trigger, or its clear, with a 2xx, a 204 in the
// recordings, which the server takes as the cue's acted-on time (target.ts, actedOn), measured from the
// cue's beat, its section's start or the beat of the slide inside it, as for any cue, less the lead
// for a slide played into or brought back by a loop wrap. Not the
// status/slide frame after it: some accepted group triggers brought no frame at all (a cold Verse 1,
// the first Bridge 1, Ending), and an index trigger of the slide already showing brought none. A trigger
// refused, with a 403, a 404 or a 500, or with no answer before a timeout or going offline, acts on
// nothing, nor does a cue that sends nothing or one dropped while it waited, so the server logs those
// with no acted-on time. There
// is no time cap: a cold trigger answered in up to 7.8 s at home, which is a slow ProPresenter's real
// lateness. A trigger refused with an HTTP answer is logged too, every time, with the song, the
// section, the status and the path, and the row says so in a state line, "Trigger refused for <song>,
// <section>: ProPresenter answered <status>.", while ProPresenter stays online with no problem.
// The cues' triggers and clears go out one at a time in the order the server hands them, each once
// the one before it is answered, refused, timed out or cut off by going offline, so a song's End clear
// and the next song's first slide, handed in one move, cannot land reversed and leave the screen
// blank; a cue still waiting when ProPresenter goes offline is never sent. A cue still waiting when a
// later one is handed is dropped, never sent, unless it is a clear and the later cue a slide, so a
// cold ProPresenter goes from the slide out straight to the latest one, never stepping through the
// stale slides between, and a clear and the slide after it stay in order. The request already out is
// never dropped. The row's buttons go out in the same line, each after every cue handed before it, so
// a Clear slide pressed while a cue's trigger is out cannot land before that trigger and leave the
// cue's slide up; a press still waiting when ProPresenter goes offline is never sent either. A press is
// never dropped, nor is a cue handed before it, since the press moves from that cue's slide.
//
// The row's own buttons are Next slide (GET /v1/presentation/active/next/trigger), Previous slide
// (GET /v1/presentation/active/previous/trigger) and Clear slide (GET /v1/clear/layer/slide). Next and
// previous answer 404 with no presentation active (before any trigger, after a clear) and on the last
// slide. After a clear ProPresenter has no presentation active, and since setlist-controller#279 the
// server clears in every Turnaround, Interlude and instrumental section, so after a clear the adapter
// last had accepted, a cue's or Clear slide's, Next slide triggers the slide after the last slide
// shown, and Previous slide that slide again, by its index trigger in the presentation last triggered
// (setlist-controller#377). The last slide shown is the adapter's own record: a cue's accepted trigger
// sets it, an accepted Next slide or Previous slide moves it, a crossing too, a change by hand moves
// it to the slide whose text the frame shows (decide), and a presentation/current naming another
// presentation moves it there (nowIn). A press's request is chosen when its turn in line comes,
// so a cue's clear handed before it counts. Before any slide of the presentation last triggered has
// shown, as when ProPresenter refused the next song's first trigger after a clear, and after a clear
// made in ProPresenter itself, the buttons send the active paths as ever. A 404 to next or previous, or to the
// index trigger past the last slide, from the last slide shown, crosses the playlist picked on the row
// (setlist-controller#561): Next slide triggers slide 1 of the next presentation item, and Previous
// slide the last slide of the one before, skipping headers and placeholders, from the place in the
// playlist the last slide shown was triggered from, or else the first that holds its presentation. A
// crossing into an item that is no song of the set reports that item moved out (target.ts), which
// pauses ProPresenter until Arm or the music comes back, the next song's Count Off cue, as a Fade out's
// pause ends (connections.ts), so no cue lands on Facetime or MC. A 404 while ProPresenter has no
// presentation active, as after a clear made in ProPresenter itself or a restart, crosses nothing.
// With no pick read, a last slide shown in no item of it, or no item past it, the 404 is nothing to
// move, which the row says in a state line, "Pressed Next slide: nothing to move.", while ProPresenter
// stays online. The last slide shown follows the presentation ProPresenter names active in a
// presentation/current frame, so after a slide shown by hand in another presentation the buttons move
// in that one (setlist-controller#418). The line opens with "Pressed", so it
// never reads as the stream's "Next slide:" line. Clear is a 204 every time. Any other answer that is
// not a 2xx shows in the same line with its status. That line and a refused trigger's are one line,
// about the last command: a press that succeeds clears it, as do a cue's trigger when it is sent and
// going offline. The line comes after the slide text, and neither hides the other. Every press logs
// one line with the button, the path sent, ProPresenter's status or no answer, and the time from send
// to answer, or that it was never sent, as ProPresenter went offline while it waited.
//
// A slide pressed by hand in ProPresenter pauses it: a status/slide frame that shows a slide the
// adapter did not cause is reported as a change by hand, and the server pauses ProPresenter until the
// producer arms it (setlist-controller#132, and the edge cases of setlist-controller#266). A cue's clear
// is a command of its own, as a trigger and Clear slide are, and expects no slide, since a blank screen
// shows none: a slide shown after it outside every window is a change by hand, and its 2xx blanks the
// row's slide text at once, as an accepted Clear slide does. A frame is the adapter's own inside a
// window after each trigger, clear and button ProPresenter answers with a 2xx, until handWindowMs after
// that answer, since a cold command took seconds and its frame came 0.1 s to 0.4 s after the answer
// (warm). An answer that is not a 2xx, or none, moved nothing and opens no window. A command still out
// is no cover on its own, as a cold trigger was out up to 7.8 s at home, long enough for a press by
// hand: while it is out, a frame is its own only when it shows a slide that command may bring. A cue's
// trigger brings its slide, from when it is handed until BUTTON_FRAME_MS after its 2xx, and not at all
// once it is refused, dropped, never sent or cut off, so a song's End and the next song's first section,
// sent in one move, keep the End's late frame the adapter's own while the second is out. A button
// press handed before a cue keeps the slides it may bring its own until BUTTON_FRAME_MS after its 2xx,
// so its cold frame, late while the cue's trigger is out, is no change by hand.
// Outside every window, a frame is its own too when it shows the expected slide: the slide a cue last
// triggered, or the slide now showing after a frame of its own that left it or a change by hand. A
// trigger ProPresenter refuses, or never answers, expects nothing: the expected slide from before it
// comes back, while no later cue has replaced it, so a press by hand onto the refused slide pauses. The
// producer's Arm hands the screen back to the server, so it expects no slide until the next cue, and a
// press by hand onto another slide with the text of the one the operator pressed pauses again. A frame
// that repeats the slide on the screen, as the stream repeats a slide with one UUID (Verse 2 slide 1 at
// t 227323, 243448 and 248770), decides nothing: the same UUID, or the same text when a frame gives
// none, as the slide a trigger accepted with no frame shows by its text alone. Since the server moves
// every slide, a frame showing another slide of the same group is a change by hand too, while a frame
// showing the same text as the expected slide, as a slide that repeats the one before it does, is the
// server's own. While the last cue's trigger is still out, a frame that leaves the expected slide is an
// earlier command's and leaves it as it is, so the second's slide stays expected for its late frame.
// Until ProPresenter takes a cue, its trigger or its clear answered 2xx, since the server started or the
// producer last pressed Arm, the screen is the operator's pre-service loop, whose slides with no words
// advance on timers by design, as the 8 November Loop and Countdown do: a frame showing a slide with no
// words is never a change by hand then, while a slide with words still is. Next slide and Previous
// slide each also expect the slide they move to, by the slide showing when pressed: Next its frame's
// next slide, Previous the slide before it in the presentation last triggered, or before any cue, in
// every presentation of the picked playlist, and after a clear, the slide its index trigger shows; a
// press made before an earlier press's frame has come moves on from the slide that press expects, as a
// producer who sees nothing from a cold Next presses it again. A cue's trigger accepted with no frame
// showing its slide since it went, as an index trigger of the slide showing and some cold triggers
// brought none, puts the slide showing on its slide, whatever other frame came while it was out, so a
// press after it moves on from there. A status/slide frame that shows
// the slide a press expects is the button's own, as late as a cold ProPresenter brings it, so a move
// into another group never pauses; but only until BUTTON_FRAME_MS after the answer, and not at all after
// an answer that moved nothing, since a button may bring no frame. The presentation read gives slides no
// UUID, so a frame's slide is placed by its text alone; a slide with no words places nothing, since
// many groups hold one. A clear never pauses, and nothing is decided from a missing frame, since the
// stream does not report every slide change. After a reconnect over a slide with words, the stream's
// opening frame places it. Before any frame, as after a stream opened over a blank screen or a slide
// with no words, a Next slide or Previous slide also moves from the last slide shown, which survives
// going offline; after the server's start, with no slide shown yet, it expects nothing
// (setlist-controller#269).

// ProPresenter's section in the connections config file: its address, its network port, 50001
// when left out, and leadBeats, how many beats before its beat each lyric slide goes up while Live
// plays forward (target.ts, lead), 2 when left out, and 0 to send each slide on its beat.
//
//   { "targets": { "propresenter": { "host": "192.168.10.50", "port": 50001, "leadBeats": 2 } } }
//
// Its target opts in to the Fade out pause, since the words follow the track timing.
export function proPresenterKind({
  statePath,
  clock = realClock,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  pollMs = POLL_MS,
  silenceMs = SILENCE_MS,
  handWindowMs = HAND_WINDOW_MS,
  readRetryMs = READ_RETRY_MS,
  slideTimingPath,
}: {
  // The file the picked playlist of each set is kept in, so it survives a restart.
  statePath: string;
  // The slide timing file (slide-timing.ts), read on each check. Left out, nothing is read and there
  // are no exceptions.
  slideTimingPath?: string;
  clock?: Pick<Clock, 'every' | 'now'>;
  // How long a request waits for an answer before ProPresenter counts as offline.
  requestTimeoutMs?: number;
  // How often /version is asked, and the status stream checked for silence.
  pollMs?: number;
  // How long the status stream may send nothing before /version is asked, and the stream opened again
  // when it answers: the first wait, doubled at each reopen up to MAX_SILENCE_MS.
  silenceMs?: number;
  // How long after a trigger, a clear or a button is answered with a 2xx any slide change counts as its
  // own.
  handWindowMs?: number;
  // How long a presentation read that answered 5xx waits before it is asked again.
  readRetryMs?: number;
}): TargetKind {
  return {
    label: LABEL,
    create(section) {
      const problems = sectionProblems(section);
      if (problems.length > 0) return { problems };
      const port = section.port === undefined ? DEFAULT_PORT : (section.port as number);
      const lead = section.leadBeats === undefined ? DEFAULT_LEAD_BEATS : (section.leadBeats as number);
      return { target: proPresenterTarget({ host: (section.host as string).trim(), port, lead, statePath, slideTimingPath, clock, requestTimeoutMs, pollMs, silenceMs, handWindowMs, readRetryMs }) };
    },
  };
}

const LABEL = 'ProPresenter';
const DEFAULT_PORT = 50001;
// The line the page shows when ProPresenter's check matches every song and section of the set.
const PASS_TEXT = 'Every song and section matches.';
// A lyric slide goes up 2 beats before its line, so the congregation reads it before they sing it.
const DEFAULT_LEAD_BEATS = 2;
// A cold command took up to 7.8 s at home (Phase 0), so anything under about 10 s would put a working
// ProPresenter offline.
const REQUEST_TIMEOUT_MS = 15_000;
const POLL_MS = 2000;
// ProPresenter sends timer/system_time on the stream every 1 s, unasked, so 10 s with no frame at all is
// a stream that has stopped, and /version is asked. A quiet stream is opened again after 10 s, then
// after twice the wait before, up to 60 s.
const SILENCE_MS = 10_000;
const MAX_SILENCE_MS = 60_000;
// A cold read of There Is Freedom answered 500 at home on 2026-11-02 and the same read a minute later
// 200, so a presentation read that answers 5xx is asked again, twice at most, a second apart. Reads of
// a playlist run in parallel, so a read that keeps failing adds about 2 s to a check.
const READ_RETRIES = 2;
const READ_RETRY_MS = 1000;
// A command's own status/slide came 0.1 s to 0.4 s after its answer in the recordings, warm, so 1 s
// is about 2.5 times that. A longer window would miss a press by hand made just after a button. A
// group trigger's frame that comes later still, as the cold Bridge 1's did at 1.7 s, is held by the
// expected slide instead.
const HAND_WINDOW_MS = 1000;
// A cold ProPresenter brought a Next slide's frame 1.0 s to 1.1 s after its answer, past the window,
// and some buttons brought none, so the slide a button moves to is its own until 3 s after its answer,
// about 2.7 times that, and no longer, or a press by hand onto it later would never pause. A cue's
// trigger keeps its slide its own as long, for a frame that comes late, as a cold trigger's does.
const BUTTON_FRAME_MS = 3000;
// The status stream: the frames it asks for, and the blank line that ends each frame.
const STREAM_PATH = '/v1/status/updates';
const STREAMED = ['status/slide', 'presentation/current'];
const FRAME_END = '\r\n\r\n';
// The row's line while the status stream is quiet, after the slide text.
const QUIET_LINE = 'slide text not live, status stream quiet';
// The check's problem while the status stream is quiet, first among its problems.
const QUIET_PROBLEM = "ProPresenter's status stream is quiet: quit and reopen ProPresenter before the service.";
// ProPresenter's heartbeat, which it adds to the stream unasked.
const HEARTBEAT = 'timer/system_time';
// The live slide, read once on each open of the stream. The stream sends the live slide on open when it
// has words, and the read answers 204 with an empty body when none with words shows (2026-11-10).
const LIVE_SLIDE_PATH = '/v1/status/slide';

function sectionProblems(section: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (typeof section.host !== 'string' || section.host.trim() === '') problems.push('ProPresenter\'s "host" must be its address, such as "192.168.10.50".');
  const { port } = section;
  if (port !== undefined && !(typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535)) {
    problems.push(`ProPresenter's "port" must be its network port, a whole number from 1 to 65535 such as ${DEFAULT_PORT}.`);
  }
  const { leadBeats } = section;
  if (leadBeats !== undefined && !(typeof leadBeats === 'number' && Number.isFinite(leadBeats) && leadBeats >= 0)) {
    problems.push(`ProPresenter's "leadBeats" must be how many beats early each lyric slide goes up, a number of 0 or more such as ${DEFAULT_LEAD_BEATS}.`);
  }
  return problems;
}

// A request that got an HTTP answer: its status, and its body read as JSON, or undefined when it has
// none or it is not JSON.
type Answer = { status: number; body: unknown };

// A presentation the picked playlist links, as read: its own name, the name of the playlist item
// that links it (which can carry the arrangement, as "House of the Lord - [ Full ]" does, and which
// a song matches by only when no presentation has its own name, song-presentation.ts), whether this
// Mac may trigger it, the arrangement its playlist item is on (null for none named), and its groups
// in its own order, repeats included, each with its name, the presentation index of its first
// slide, and its slides' texts as slideText gives them, so a status/slide frame's text compares
// equal to the slide it shows, every slide in its place, so slide k of a group is presentation
// index start + k, and null for a slide with no text, which matches no frame.
type Group = { name: string; start: number; slides: (string | null)[] };
type Presentation = { uuid: string; name: string; item: string; authorized: boolean; arrangement: string | null; groups: Group[] };
// Where ProPresenter is, as far as the adapter knows: the texts of the slides it may show, and the
// text of the next slide, null for none, when a status/slide frame named it.
type Place = { slides: Set<string>; next?: string | null };
// The slides a Next slide or Previous slide press may bring (buttonBrings): its button, the earlier
// press it moved from, or null for the slide showing or a cue's, and until when its frame may come.
type Brings = Place & { id: string; after: Brings | null; until: number; chained: boolean };

// The picked playlist as last read: its presentations in playlist order, and each presentation
// whose read kept answering 5xx after its retries, in playlist order, by its item's name with any
// arrangement suffix stripped (itemTitle), since its own name was never read, and the status of its
// last answer.
type ReadPlaylist = { id: string; presentations: Presentation[]; failed: FailedRead[] };
type FailedRead = { title: string; status: number };

const PICK_LABEL = 'Playlist';

// The clear of the slide layer, which Clear slide sends, and a cue for a section with no group of its
// name after the song's first section with one.
const CLEAR_PATH = '/v1/clear/layer/slide';

// The row's own buttons, Next slide, Previous slide and Clear slide in that order, and the request
// each sends while a presentation is active. Clear slide blanks the screen, so the server forgets a
// slide sent early when it runs, and its beat sends it again (connections.ts).
const BUTTONS: (TargetButton & { path: string })[] = [
  { id: 'next', label: 'Next slide', path: '/v1/presentation/active/next/trigger' },
  { id: 'previous', label: 'Previous slide', path: '/v1/presentation/active/previous/trigger' },
  { id: 'clear', label: 'Clear slide', path: CLEAR_PATH, blanks: true },
];

function proPresenterTarget({
  host,
  port,
  lead,
  statePath,
  slideTimingPath,
  clock,
  requestTimeoutMs,
  pollMs,
  silenceMs,
  handWindowMs,
  readRetryMs,
}: {
  host: string;
  port: number;
  lead: number;
  statePath: string;
  slideTimingPath: string | undefined;
  clock: Pick<Clock, 'every' | 'now'>;
  requestTimeoutMs: number;
  pollMs: number;
  silenceMs: number;
  handWindowMs: number;
  readRetryMs: number;
}): Target {
  const where = `${host}:${port}`;
  let report: TargetReport | null = null;
  let online = false;
  // Whether the reason for being offline has been logged since ProPresenter was last online.
  let logged = false;
  // Set by stop: every request still out is aborted, and nothing it brings back is reported. Going
  // offline aborts every request of the connection it was sent on, and starts the next one.
  const stopping = new AbortController();
  let connection = new AbortController();
  let stopPoll: (() => void) | null = null;
  let polling = false;
  const store = picksStore(statePath);
  // The playlists as last listed, the set the server last handed over, and the picked playlist as
  // last read. Reads are counted, so only the latest one's answer counts.
  let playlists: ConnectionChoice[] = [];
  let set: SetList | null = null;
  let read: ReadPlaylist | null = null;
  let lists = 0;
  let reads = 0;
  const picked = (): StoredPlaylist | null => (set ? store.get(set) : null);
  // The slide timing file as the latest check read it, counted as reads are, and the bar length and
  // the songs' meters last given by a plan, which a cue resolves the file's entries with, since the
  // server plans each cue before it hands it over.
  let timing: SlideTiming = NO_SLIDE_TIMING;
  let timingReads = 0;
  let lastBar = DEFAULT_BAR;
  let lastMeters: ReadonlyMap<number, number> = NO_METERS;
  // The line about the last command, a cue's trigger ProPresenter refused or a button press it
  // refused or that moved nothing, or null for nothing to say. Commands are counted, each trigger and
  // each press, so only the latest one's answer counts.
  let commandLine: string | null = null;
  let presses = 0;
  // The slide text lines the status stream or the live slide read last reported, or null for none.
  // Each status/slide frame and each clear is counted, so a read that one came after while it was out
  // shows nothing.
  let slide: string[] | null = null;
  let slideChanges = 0;
  // The slide of the cue whose trigger was out when an accepted Clear slide was pressed, until
  // BUTTON_FRAME_MS after the clear's answer: the clear goes out once the trigger is answered, so the
  // trigger's own frame can come after the clear, showing the slide it has since blanked. A frame
  // showing that slide then changes no slide text; any other frame, and the next cue, end it.
  let clearedBehind: { slides: Set<string>; until: number } | null = null;
  // The pause by hand. Each trigger, clear and button is a command, and any status/slide frame until
  // handWindowMs after ProPresenter answers one with a 2xx is its own: the latest window's end is kept,
  // by the clock. An answer that is not a 2xx moved nothing and opens no window. Outside every window, a
  // frame showing the expected slide is the adapter's own too, and so is one showing the slide of a
  // cue's trigger still out or answered 2xx under BUTTON_FRAME_MS ago, or a slide a button press handed
  // before the latest cue may bring, until BUTTON_FRAME_MS after its 2xx (triggersOut), or a slide a
  // button press since may bring (buttonBrings); any other frame that shows a slide is a change by hand.
  let windowEnd = -Infinity;
  let triggersOut: { slides: Set<string>; until: number; shown?: boolean }[] = [];
  // The expected slide, as a set of at most one text, or null for none: a cue's trigger sets it to the
  // slide it triggers, and the presentation it triggers is kept, for the slides a button may bring; a
  // cue's clear sets it to none, and so does the producer's Arm (armed), which hands the screen back to
  // the server. A trigger ProPresenter refuses, or never answers, puts back the expected slide from
  // before it, while no later cue has replaced it, since it moved nothing. The expected slide of the cue
  // whose trigger is still out is kept too, until it is answered.
  let expected: Set<string> | null = null;
  let triggeredIn: Presentation | null = null;
  let cueOut: Set<string> | null = null;
  // Whether ProPresenter has answered a cue's trigger or clear with a 2xx since the server started or
  // the producer last pressed Arm. Until it has, the screen is the operator's pre-service loop, whose
  // slides with no words advance on timers by design, so a frame showing a slide with no words is never
  // a change by hand.
  let cueAccepted = false;
  // The slide the screen shows, as the last status/slide frame showed it, its UUID (null when the frame
  // gave none) and its text, or null for none or not known: a cue's trigger answered 2xx with no frame
  // showing its slide since it went shows its slide, by its text alone, and a clear, an accepted button
  // press and going offline leave it not known. A frame showing this slide again is a repeat, as the
  // stream repeats a slide, and decides nothing about a change by hand. Each frame marks the triggers out
  // whose slide it shows (triggersOut), so a trigger's answer knows whether its own frame came.
  let onScreen: { uuid: string | null; text: string } | null = null;
  // The last slide shown, the presentation and the index of its slide, or null before any, and whether
  // the last command ProPresenter accepted blanked the screen: a cue's clear or Clear slide, after
  // which it has no presentation active. Each command's answer changes them inside its turn on
  // cuesSent, so the command after it in line reads them: a cue's trigger answered 2xx shows its slide,
  // a Next slide or Previous slide answered 2xx moves it, and a change by hand moves it too (decide).
  // Kept across going offline, since ProPresenter's screen is as it was after a reconnect.
  let lastShown: Shown | null = null;
  let blanked = false;
  // The presentation ProPresenter has active, as far as the adapter knows: the one a presentation/current
  // frame last named (nowIn), or a trigger the adapter sent made active, and none after a clear, a
  // presentation/current naming none, or going offline, since ProPresenter may have restarted. A press
  // whose 404 came while none is active, as after a clear made in ProPresenter itself, moved nothing
  // and crosses nothing.
  let active: Presentation | null = null;
  // The cues' requests and the buttons', chained in the order the server hands the cues and runs the
  // buttons: each waits for the one before it to be answered, refused, timed out or cut off. command
  // never rejects, so the chain never breaks.
  let cuesSent: Promise<unknown> = Promise.resolve();
  // The cues and presses on cuesSent not yet answered, refused, timed out or cut off. A cue handed
  // with none goes out at once, so it never waits.
  let lined = 0;
  // The cues on cuesSent waiting behind another command for their turn, oldest first, since the last
  // button press handed: a press stops the cues before it from being dropped. A cue handed drops every
  // waiting trigger, and every waiting clear too when it is a clear, so the list holds at most a clear
  // and then the latest cue. A dropped cue sends nothing when its turn comes, and is answered null.
  let waiting: { kind: 'trigger' | 'clear'; dropped: boolean; done: (accepted: boolean) => void }[] = [];
  // Where the last status/slide frame put ProPresenter, and the slides each Next slide or Previous
  // slide press may bring, oldest first, as texts, each until a frame shows one of its slides or one
  // of a later press's, or its end by the clock: BUTTON_FRAME_MS after its answer, and none for an
  // answer that moved nothing, since a button may bring no frame and its slide must not stay
  // expected. A press moves from the latest press whose frame is still to come, its end passed or not,
  // unless it moved nothing, or from the frame (chained false once a frame that matched no press has
  // come since it was pressed). Each keeps its button and the press it moved from, if any, so a press
  // whose slide is chosen at its turn moves every later press made from it along (runButton).
  let showing: Place | null = null;
  let buttonBrings: Brings[] = [];
  // Whether the status stream is quiet: a silence probe was answered, and no heartbeat has come since.
  // Going offline ends it too.
  let quiet = false;
  // The row's state lines, all reported from here: the slide text, then the quiet line while the
  // stream is quiet, which qualifies the text above it, then the line about the last command, so a
  // command does not hide the slide text and a slide change does not hide its line.
  const reportState = () => {
    const lines = [...(slide ?? []), ...(quiet ? [QUIET_LINE] : []), ...(commandLine === null ? [] : [commandLine])];
    report?.state(lines.length > 0 ? lines : null);
  };
  const reportPick = () => {
    const playlist = picked();
    report?.pick({ label: PICK_LABEL, options: playlists, picked: playlist && { id: playlist.id, label: playlist.name } });
  };

  // The status stream, while one is asked for or open. Streams are counted, so a stream that has been
  // given up, and everything it brings back, is ignored.
  let stream: { abort: AbortController; open: boolean } | null = null;
  let streams = 0;
  // When the open stream last sent a frame, or opened, by the clock, and its frames counted, so a
  // silence probe that a frame came during changes nothing.
  let lastFrame = 0;
  let frames = 0;
  // The silence that sends a probe of /version: silenceMs, doubled at each reopen of a quiet stream up
  // to MAX_SILENCE_MS, and silenceMs again at a heartbeat or going offline. One probe at a time.
  let silence = silenceMs;
  let probing = false;
  const closeStream = () => {
    streams += 1;
    stream?.abort.abort();
    stream = null;
  };

  const goOnline = () => {
    if (!report || online || stopping.signal.aborted) return;
    online = true;
    logged = false;
    report.problem(null);
    report.status('online');
    void list();
  };
  // A connection failure or a timeout, or a status stream that dropped: offline, with the reason on
  // the row, logged once each time it goes offline. The stream is given up, and a quiet one is no
  // longer quiet.
  const goOffline = (error: unknown) => {
    if (!report || stopping.signal.aborted) return;
    closeStream();
    connection.abort();
    connection = new AbortController();
    const reason = `ProPresenter could not be reached at ${where}: ${describe(error, requestTimeoutMs)}`;
    if (!logged) console.error(`Setlist server: ${reason}`);
    logged = true;
    online = false;
    silence = silenceMs;
    quiet = false;
    // The server clears the row's state on offline anyway; the line describes a command before it, and
    // the slide text a stream that is gone.
    commandLine = null;
    slide = null;
    showing = null;
    buttonBrings = [];
    triggersOut = [];
    onScreen = null;
    clearedBehind = null;
    active = null;
    report.problem(reason);
    report.status('offline');
  };

  // Every request goes through here. It resolves with the answer whatever its status, and with null
  // after a connection failure or a timeout, which put ProPresenter offline, or once going offline
  // aborts it, which puts no later connection offline.
  const request = async (path: string): Promise<Answer | null> => {
    const given = connection.signal;
    try {
      const response = await fetch(`http://${where}${path}`, { signal: AbortSignal.any([stopping.signal, given, AbortSignal.timeout(requestTimeoutMs)]) });
      const text = await response.text();
      let body: unknown;
      try {
        body = text === '' ? undefined : JSON.parse(text);
      } catch {
        body = undefined;
      }
      return { status: response.status, body };
    } catch (error) {
      if (!given.aborted) goOffline(error);
      return null;
    }
  };

  // A trigger, a clear or a button, which resolves as request does. A 2xx opens the window after it;
  // any other answer, or none, as when going offline aborts it, opens none, since it moved nothing. The
  // cues' triggers and clears and the buttons go through here one at a time (cuesSent).
  const command = async (path: string): Promise<Answer | null> => {
    const answer = await request(path);
    if (answer !== null && answer.status >= 200 && answer.status < 300) windowEnd = Math.max(windowEnd, clock.now() + handWindowMs);
    return answer;
  };
  // Puts a cue's send or a press's on cuesSent, to run once every command before it is answered,
  // refused, timed out or cut off, and resolves as the send does.
  const inLine = (send: () => Promise<Answer | null>): Promise<Answer | null> => {
    lined += 1;
    const sent = cuesSent.then(async () => {
      try {
        return await send();
      } finally {
        lined -= 1;
      }
    });
    cuesSent = sent;
    return sent;
  };

  // Lists the playlists, and reports them as the pick's options. A list that gets no list keeps the
  // last one.
  const list = async () => {
    lists += 1;
    const run = lists;
    const answer = await request('/v1/playlists');
    if (run !== lists || answer?.status !== 200 || !Array.isArray(answer.body)) return;
    playlists = playlistsIn(answer.body);
    reportPick();
  };
  // Reads the playlist picked for the set, and each presentation it links, in parallel. A read that
  // fails leaves that presentation out, and one that kept answering 5xx after its retries
  // (readPresentation) is kept in failed; a playlist that cannot be read leaves none. One that going
  // offline cuts off keeps the last read.
  const readPicked = async () => {
    reads += 1;
    const run = reads;
    const given = connection.signal;
    const playlist = picked();
    if (!playlist) {
      read = null;
      return;
    }
    if (read?.id !== playlist.id) read = null;
    const answer = await request(`/v1/playlist/${encodeURIComponent(playlist.id)}`);
    if (run !== reads) return;
    if (answer?.status !== 200) {
      if (answer) read = null;
      return;
    }
    const items = presentationsIn(answer.body);
    const answers = await Promise.all(items.map(({ uuid, arrangement, name }) => readPresentation(uuid, arrangement, name)));
    if (run !== reads || given.aborted) return;
    read = {
      id: playlist.id,
      presentations: answers.flatMap((answer) => (answer !== null && 'presentation' in answer ? [answer.presentation] : [])),
      failed: answers.flatMap((answer, at) => (answer !== null && 'status' in answer ? [{ title: itemTitle(items[at]!.name), status: answer.status }] : [])),
    };
  };
  // Reads the slide timing file, when there is one to read.
  const readTiming = async () => {
    timingReads += 1;
    const run = timingReads;
    const got = slideTimingPath === undefined ? NO_SLIDE_TIMING : await readSlideTiming(slideTimingPath);
    if (run === timingReads) timing = got;
  };
  // The slide timing file's problems with its titles, given the set: each title that matches no song in
  // the set, as the file first spells it, in file order, checked against the presentations in
  // ProPresenter's libraries (GET /v1/libraries, then GET /v1/library/{name} for each, in parallel),
  // read only when there is such a title. A title that matches no presentation either is a problem,
  // as a typo is. Libraries that cannot all be read are one problem naming the titles left unchecked.
  const titleProblems = async (given: SetList, file: SlideTiming): Promise<string[]> => {
    const outside = [...file.songs.values()].map(({ title }) => title).filter((title) => !given.songs.some((song) => song.title !== null && namesMatch(song.title, title)));
    if (outside.length === 0) return [];
    const names = await libraryNames();
    if (names === null) return [`slide timing ${outside.join(', ')}: not checked, ProPresenter's libraries could not be read`];
    return outside.filter((title) => !names.has(nameKey(title))).map((title) => `${title}: slide timing for no song in the set or in ProPresenter's libraries`);
  };
  // The name keys of every presentation in ProPresenter's libraries, or null when the list or any
  // library in it gets no 200. A library is asked for by its name, as the API asks.
  const libraryNames = async (): Promise<Set<string> | null> => {
    const listed = await request('/v1/libraries');
    if (listed?.status !== 200 || !Array.isArray(listed.body)) return null;
    const libraries = await Promise.all(librariesIn(listed.body).map((name) => request(`/v1/library/${encodeURIComponent(name)}`)));
    if (libraries.some((answer) => answer?.status !== 200)) return null;
    return new Set(libraries.flatMap((answer) => itemNamesIn(answer?.body)).map(nameKey));
  };
  // Reads one presentation. A read that answers 5xx is asked again, up to READ_RETRIES more times,
  // readRetryMs apart, as a cold ProPresenter's 500 passes; a 4xx is not, nor a read cut off, which
  // put ProPresenter offline, and no wait outlives the connection or the target. It resolves with the
  // presentation, or with the status of a read that kept failing with a 5xx, or null for a read cut
  // off, a 4xx, or a 200 with no presentation in it.
  const readPresentation = async (uuid: string, arrangement: string | null, item: string): Promise<{ presentation: Presentation } | { status: number } | null> => {
    const given = connection.signal;
    const path = `/v1/presentation/${encodeURIComponent(uuid)}`;
    let answer = await request(path);
    for (let retry = 0; retry < READ_RETRIES && answer !== null && answer.status >= 500 && answer.status < 600; retry += 1) {
      try {
        await wait(readRetryMs, undefined, { signal: AbortSignal.any([stopping.signal, given]) });
      } catch {
        return null;
      }
      answer = await request(path);
    }
    if (answer === null) return null;
    if (answer.status >= 500 && answer.status < 600) return { status: answer.status };
    if (answer.status !== 200) return null;
    const presentation = presentationOf(answer.body);
    return presentation && { presentation: { ...presentation, arrangement, item } };
  };

  // Opens the status stream, while online with none. Its request waits requestTimeoutMs for an answer,
  // as every request does, but once it is answered the stream is held open for as long as it lasts.
  const openStream = async () => {
    if (!online || stream || stopping.signal.aborted) return;
    streams += 1;
    const run = streams;
    const abort = new AbortController();
    const current = { abort, open: false };
    stream = current;
    const timer = setTimeout(() => abort.abort(new DOMException('The status stream got no answer.', 'TimeoutError')), requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(`http://${where}${STREAM_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(STREAMED),
        signal: AbortSignal.any([stopping.signal, abort.signal]),
      });
    } catch (error) {
      if (run === streams) goOffline(error);
      return;
    } finally {
      clearTimeout(timer);
    }
    if (run !== streams || response.status !== 200 || !response.body) {
      void response.body?.cancel().catch(() => {});
      if (run === streams) stream = null;
      return;
    }
    current.open = true;
    lastFrame = clock.now();
    void readSlide(run);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || run !== streams) break;
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf(FRAME_END); end >= 0; end = buffer.indexOf(FRAME_END)) {
          const text = buffer.slice(0, end);
          buffer = buffer.slice(end + FRAME_END.length);
          if (run === streams) frame(text);
        }
      }
    } catch {
      // A stream that fails is a drop, as one that ends is.
    }
    if (run === streams) goOffline(new Error('the status stream dropped.'));
  };
  // Reads the live slide once the stream of this run has opened, and shows its text, while that stream
  // is still the one open and no frame or clear came since it was sent. The stream's opening frame
  // shows a slide with words itself, and the read answers 204 over none with words, so the read only
  // shows a slide whose opening frame is later than its answer. A read that gets no 200 shows
  // nothing; one that gets no answer puts ProPresenter offline, as every request does. It goes as a
  // request, not a command, so it opens no window and a press by hand just after still pauses.
  const readSlide = async (run: number) => {
    const changes = slideChanges;
    const answer = await request(LIVE_SLIDE_PATH);
    if (run !== streams || changes !== slideChanges || answer?.status !== 200) return;
    slide = slideLines(answer.body);
    reportState();
  };
  // One frame of the status stream, as its text. A slide change shows its text, and a clear shows
  // none; a frame that is not JSON is skipped.
  const frame = (text: string) => {
    lastFrame = clock.now();
    frames += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    const { url, data } = (parsed ?? {}) as { url?: unknown; data?: unknown };
    if (url === HEARTBEAT) {
      silence = silenceMs;
      if (quiet) {
        quiet = false;
        console.error(`Setlist server: ProPresenter's status stream at ${where} sends its heartbeat again.`);
        reportState();
        report?.fileChanged();
      }
      return;
    }
    if (url === 'status/slide') {
      const current = slideText(((data ?? {}) as { current?: unknown }).current);
      const cleared = clearedBehind !== null && lastFrame <= clearedBehind.until && current !== null && clearedBehind.slides.has(current);
      if (!cleared) {
        clearedBehind = null;
        slideChanges += 1;
        slide = slideLines(data);
        reportState();
      }
      decide(data);
      return;
    }
    if (url === 'presentation/current') {
      const named = presentationOf(data);
      if (named) {
        // A frame names no playlist item, so its presentation has no item name; nowIn takes the
        // playlist's read of it when there is one, and no song is matched by a frame's copy.
        nowIn({ ...named, arrangement: null, item: '' });
        return;
      }
      if (((data ?? {}) as { presentation?: unknown }).presentation != null) return;
      active = null;
      slideChanges += 1;
      slide = null;
      reportState();
    }
  };
  // A presentation/current frame that names a presentation: ProPresenter has it active. The stream
  // sends it when the active presentation changes, before or after that change's status/slide frame
  // (2026-11-02 at t 15586 and 2189). When it is not the presentation of the last slide shown, as
  // after a slide triggered by hand in another presentation, the last slide shown moves there, to the
  // slide whose text the screen shows, or else its first, and the screen is no longer blank, so Next
  // slide and Previous slide move in it, and cross the picked playlist from it only when it is an
  // item there (setlist-controller#418, #561). The playlist's read of it is kept when it has one.
  const nowIn = (named: Presentation) => {
    active = read?.presentations.find(({ uuid }) => uuid === named.uuid) ?? named;
    if (lastShown?.presentation.uuid === active.uuid) return;
    const index = onScreen === null ? -1 : active.groups.flatMap(({ slides }) => slides).indexOf(onScreen.text);
    lastShown = { presentation: active, index: Math.max(index, 0) };
    blanked = false;
  };
  // Whether a status/slide frame is a change by hand, which is reported whatever the arm state, as the
  // server decides whether it pauses ProPresenter. A frame with no current slide, a clear, never is,
  // nor is a repeat of the slide on the screen (onScreen): the same UUID, or the same text when either
  // has none. A frame is the adapter's own inside the window after a 2xx, when it shows the slide of a
  // cue's trigger still out or answered 2xx under BUTTON_FRAME_MS ago, as a cold trigger's frame comes
  // late and a song's End's comes while the next song's first trigger is out, or when it shows a slide
  // with no words before ProPresenter has taken a cue since the start or the last Arm (cueAccepted). A
  // trigger still out is no cover on its own: a cold one was out up to 7.8 s at home, long enough for a
  // press by hand. After a frame of its own that moved off the expected slide, and after a change by
  // hand, the expected slide becomes the slide now showing, so a frame showing it again is no new
  // change by hand, but not while the last cue's trigger is still out, unless a button press brought
  // the frame. A frame showing a slide a button press may bring is the button's own, and uses up that
  // press and every press before it, whose frames come first; a frame that shows none leaves them, and
  // a later press moves from it.
  const decide = (data: unknown) => {
    const { current: shown, next } = (data ?? {}) as { current?: unknown; next?: unknown };
    const current = slideText(shown);
    const uuid = slideUuid(shown);
    const now = clock.now();
    buttonBrings = buttonBrings.filter(({ until }) => now <= until);
    triggersOut = triggersOut.filter(({ until }) => now <= until);
    const brought = current === null ? -1 : buttonBrings.findIndex(({ slides }) => slides.has(current));
    if (brought >= 0) buttonBrings = buttonBrings.slice(brought + 1);
    else for (const brings of buttonBrings) brings.chained = false;
    showing = { slides: new Set(current === null ? [] : [current]), next: slideText(next) };
    const repeat = current !== null && onScreen !== null && (uuid !== null && onScreen.uuid !== null ? uuid === onScreen.uuid : current === onScreen.text);
    onScreen = current === null ? null : { uuid, text: current };
    for (const held of triggersOut) if (current !== null && held.slides.has(current)) held.shown = true;
    if (current === null || repeat) return;
    const own = now <= windowEnd || brought >= 0 || triggersOut.some(({ slides }) => slides.has(current)) || (current === NO_WORDS && !cueAccepted);
    if (expected?.has(current)) return;
    if (!own) {
      report?.changedByHand();
      movedByHand(current);
    }
    if (cueOut !== null && brought < 0) return;
    expected = slideShowing(current) ?? expected;
  };

  // A change by hand moves the last slide shown to the slide of the presentation ProPresenter last named
  // active, or else of the presentation last triggered, whose text the frame shows, the nearest to the
  // one it held when the text repeats, as a chorus does, or to the first when it held a slide of
  // another presentation, as after ProPresenter refused that presentation's trigger, which leaves it
  // the presentation last triggered, and the screen is no longer blank. A slide with no words, or text
  // no slide there holds, leaves both as they were. The presentation read gives slides no UUID, so
  // text is the only key.
  const movedByHand = (text: string) => {
    const presentation = active ?? triggeredIn;
    if (text === NO_WORDS || !presentation) return;
    const from = lastShown?.presentation.uuid === presentation.uuid ? lastShown.index : 0;
    let found = -1;
    presentation.groups
      .flatMap(({ slides }) => slides)
      .forEach((slide, index) => {
        if (slide === text && (found < 0 || Math.abs(index - from) < Math.abs(found - from))) found = index;
      });
    if (found < 0) return;
    lastShown = { presentation, index: found };
    blanked = false;
  };

  // The presentations a Next slide or Previous slide may move in: the one last triggered, or before any
  // cue, every presentation of the picked playlist as read, since the operator runs from that playlist.
  const movesIn = (): Presentation[] => (triggeredIn ? [triggeredIn] : read && read.id === picked()?.id ? read.presentations : []);

  // Where a Next slide or Previous slide that found nothing to move goes: slide 1 of the next
  // presentation item of the picked playlist as read, or the last slide of the previous one, from the
  // item that holds the last slide shown: the place it was triggered from, or else, as after a change
  // by hand, the first place that holds its presentation. Headers and placeholders are no presentation
  // item, so they are skipped. Null with no pick read, a last slide shown in no item of it, or no item
  // past it.
  const crossing = (id: 'next' | 'previous'): Shown | null => {
    if (!lastShown || !read || read.id !== picked()?.id) return null;
    const items = read.presentations;
    const { presentation: from, position } = lastShown;
    const at = position !== undefined && items[position]?.uuid === from.uuid ? position : items.findIndex(({ uuid }) => uuid === from.uuid);
    const to = at < 0 ? -1 : at + (id === 'next' ? 1 : -1);
    const presentation = items[to];
    if (!presentation) return null;
    return { presentation, index: id === 'next' ? 0 : slideCount(presentation) - 1, position: to };
  };

  // Each tick of the clock. With none, offline or after a stream that got an HTTP answer, /version is
  // asked. With a status stream open that has sent nothing for the silence, /version is asked too
  // (probe).
  const tick = () => {
    if (!stream) {
      void poll();
      return;
    }
    if (stream.open && clock.now() - lastFrame >= silence) void probe();
  };

  // A quiet stream's probe: /version, as a plain request, so one with no answer puts ProPresenter
  // offline. One with an answer, with no frame since it went and the same stream still open, keeps
  // ProPresenter online, doubles the silence up to MAX_SILENCE_MS, and opens the stream again.
  const probe = async () => {
    if (probing || stopping.signal.aborted) return;
    probing = true;
    const run = streams;
    const seen = frames;
    try {
      const answer = await request('/version');
      if (!answer || run !== streams || seen !== frames || !online) return;
      closeStream();
      silence = Math.min(silence * 2, MAX_SILENCE_MS);
      if (!quiet) {
        quiet = true;
        console.error(
          `Setlist server: ProPresenter's status stream at ${where} sent nothing for ${Math.round(silenceMs / 1000)} s while its API still answers: ProPresenter stays online, its slide text is not live, and the server reopens the stream until its heartbeat comes back.`,
        );
        reportState();
        report?.fileChanged();
      }
      void openStream();
    } finally {
      probing = false;
    }
  };

  // One /version at a time: a poll while one is still out asks nothing. Each answer brings
  // ProPresenter online and opens the stream, if none is open.
  const poll = async () => {
    if (polling || stopping.signal.aborted) return;
    polling = true;
    try {
      if (await request('/version')) {
        goOnline();
        void openStream();
      }
    } finally {
      polling = false;
    }
  };

  return {
    name: 'propresenter',
    label: LABEL,
    pausesOnFade: true,
    acknowledges: true,
    lead,
    async start(given) {
      report = given;
      await store.load();
      reportPick();
      stopPoll = clock.every(pollMs, tick);
      void poll();
    },
    async stop() {
      stopping.abort();
      closeStream();
      stopPoll?.();
      stopPoll = null;
    },
    cue(cue: Cue) {
      const sending = triggerFor(read, picked(), set, cue, timing, lastBar, lastMeters);
      if (!sending) return;
      // A trigger sends the slide the server handed the cue with (connections.ts), or else the first
      // slide of its group. The slide the cue brings is that slide alone, since the server moves every
      // slide, and a clear brings none, since a blank screen shows none, so any other slide after it
      // outside a window is a change by hand. A clear leaves the presentation last triggered as it was.
      // The expected slide from before the cue is kept, for a refusal to put back. The presentation
      // last triggered is not: after a clear, the buttons send nothing into the song before once the
      // next song's trigger was refused (runButton).
      const listed = sending.kind === 'trigger' ? (read?.presentations.indexOf(sending.presentation) ?? -1) : -1;
      const shown: Shown | null = sending.kind === 'trigger' ? { presentation: sending.presentation, index: cue.slide ?? sending.index, ...(listed < 0 ? {} : { position: listed }) } : null;
      const path = shown ? triggerPath(shown.presentation, shown.index) : CLEAR_PATH;
      const text = shown && slideAt(shown.presentation, shown.index);
      const before = expected;
      expected = new Set(text ? [text] : []);
      if (sending.kind === 'trigger') triggeredIn = sending.presentation;
      // A press handed before the cue no longer moves on its own, since the cue moves the screen after
      // it, but its frame can still come while the cue's trigger is out, late after a cold answer, so
      // the slides it may bring stay its own until BUTTON_FRAME_MS after its 2xx, as a trigger's do.
      triggersOut.push(...buttonBrings.filter(({ until }) => until !== -Infinity));
      buttonBrings = [];
      clearedBehind = null;
      const out = expected;
      cueOut = out;
      // The trigger's slide is its own from now until BUTTON_FRAME_MS after a 2xx, and no longer once
      // it is refused, dropped, never sent or cut off.
      const mine = { slides: out, until: Infinity, shown: false };
      if (text) triggersOut.push(mine);
      const done = (accepted: boolean) => {
        if (accepted) mine.until = clock.now() + BUTTON_FRAME_MS;
        else triggersOut = triggersOut.filter((held) => held !== mine);
      };
      // A trigger makes a presentation active, and a clear blanks the screen, so a line about the last
      // command would be stale.
      presses += 1;
      const run = presses;
      if (commandLine !== null) {
        commandLine = null;
        reportState();
      }
      // The cue goes out once the cue before it is answered, refused, timed out or cut off, so two cues
      // handed in one move reach ProPresenter in the order handed. One still waiting when ProPresenter
      // goes offline, or dropped from the waiting list by a later cue, is never sent, and is answered
      // null. One handed with no command on the line goes out at once and is never dropped.
      const given = connection.signal;
      const entry = { kind: sending.kind, dropped: false, done };
      if (lined > 0) {
        for (const queued of waiting) {
          if (queued.kind !== 'trigger' && sending.kind !== 'clear') continue;
          queued.dropped = true;
          queued.done(false);
        }
        waiting = [...waiting.filter(({ dropped }) => !dropped), entry];
      }
      // An answer 2xx shows the trigger's slide, or blanks the screen for a clear, in its turn, so a
      // press after it in line moves from there. A trigger accepted with no status/slide frame showing
      // its slide since it went, as an index trigger of the slide showing and some cold triggers brought
      // none, puts the adapter's place on its slide, with no next slide, whatever other frame came while
      // it was out (an earlier press's late frame, a clear's blank one, a loop's timer), so a Next slide
      // or Previous slide pressed after it moves from that slide by the presentation, as from a cue's
      // slide still out.
      const sent = inLine(async () => {
        waiting = waiting.filter((queued) => queued !== entry);
        if (given.aborted || entry.dropped) {
          done(false);
          return null;
        }
        mine.shown = false;
        const answer = await command(path);
        const accepted = answer !== null && answer.status >= 200 && answer.status < 300;
        done(accepted);
        if (accepted) {
          cueAccepted = true;
          if (shown) lastShown = shown;
          active = shown ? shown.presentation : null;
          blanked = shown === null;
          if (!shown) onScreen = null;
          else if (!mine.shown) {
            showing = { slides: out };
            onScreen = text ? { uuid: null, text } : null;
          }
        }
        return answer;
      });
      // A trigger or a clear ProPresenter refuses is logged each time, as each is a cue the room did not
      // see, and shows on the row while it is the latest command. One with no answer adds nothing: going
      // offline logs and clears the row already, but the server records the cue as missed, since the
      // failed trigger is often what puts ProPresenter offline, so it gets the slide for the playhead
      // when it comes back. A cue dropped for a later one is not missed: the later one stands for it.
      void sent.then((answer) => {
        if (cueOut === out) cueOut = null;
        if (answer === null || answer.status < 200 || answer.status >= 300) {
          if (expected === out) expected = before;
        }
        if (answer === null) {
          if (!entry.dropped) report?.missed(cue);
          return;
        }
        if (answer.status >= 200 && answer.status < 300) {
          report?.actedOn(cue);
          // A clear ProPresenter accepts has blanked the screen, and the stream may report no clear, so
          // the row's slide text goes at once, as for a Clear slide press.
          if (sending.kind === 'clear' && run === presses) {
            slideChanges += 1;
            slide = null;
            reportState();
          }
          return;
        }
        console.error(`Setlist server: ProPresenter refused the trigger for ${cue.title}, ${cue.name}: it answered ${answer.status} to ${path}.`);
        if (run !== presses) return;
        commandLine = `Trigger refused for ${cue.title}, ${cue.name}: ProPresenter answered ${answer.status}.`;
        reportState();
      });
    },
    // The producer's slide buttons. The server runs them whatever the arm state, never while offline,
    // and a run pauses ProPresenter only when it crosses into an item that is no song of the set. They
    // act on whatever presentation ProPresenter has active, with or without a playlist picked, and
    // after a clear, on the last slide shown, and cross the picked playlist at either end. Each goes out
    // after every cue handed before it, and one still waiting when ProPresenter goes offline is never
    // sent. Each press logs one line: what ProPresenter answered and how long it took, no answer, or
    // never sent.
    // The producer's Arm hands the screen back to the server: the slide the operator pressed is no
    // longer the one expected, so a press by hand of another slide with its text pauses, and until
    // ProPresenter takes a cue, a slide with no words is the pre-service loop's again. The slide
    // showing is kept, for the buttons and for a repeat of it.
    armed() {
      expected = null;
      cueAccepted = false;
    },
    buttons: BUTTONS.map(({ id, label, blanks }) => (blanks ? { id, label, blanks } : { id, label })),
    async runButton(id) {
      const button = BUTTONS.find((button) => button.id === id);
      if (!button) return;
      presses += 1;
      const press = presses;
      // An earlier press that moved ProPresenter is still where it moved from, past BUTTON_FRAME_MS, until
      // a frame comes: a cold press can move with no frame for seconds. With none, a press made while a
      // cue's trigger is out moves from that cue's slide, since it goes out after the trigger, or from
      // the slide showing, as ProPresenter may refuse the trigger and leave the screen where it was.
      // The cue's slide is a place with no next slide, so its neighbours come from the presentation.
      const earlier = buttonBrings.findLast(({ until, chained }) => chained && until !== -Infinity);
      const froms = earlier ? [earlier] : cueOut !== null ? [{ slides: cueOut }, showing] : [showing];
      // Before any frame since the start or a reconnect, the adapter knows no slide showing, as when the
      // stream opened over a blank screen or a slide with no words, so a press moves from the last slide
      // shown too, which survives going offline. With none either, as after the server's start, it
      // expects nothing, so its cold frame past the window is a change by hand.
      const beside = !earlier && showing === null && lastShown ? slideBeside(button.id, lastShown) : [];
      const brings: Brings = { id: button.id, after: earlier ?? null, slides: new Set([...froms.flatMap((from) => slidesBrought(button.id, from, movesIn())), ...beside]), until: Infinity, chained: true };
      buttonBrings.push(brings);
      const behind = cueOut;
      // The press goes out once every cue and press before it is answered, refused, timed out or cut
      // off, as a cue does, so ProPresenter cannot act on it before a cue handed earlier. One still
      // waiting when ProPresenter goes offline is never sent, and is answered null. It is never
      // dropped, and no cue handed before it is either (waiting).
      const given = connection.signal;
      waiting = [];
      // The request is chosen when the press's turn comes, as a cue's clear handed before it may still
      // be in line. After a clear ProPresenter has no presentation active, so active next and previous
      // would move nothing: once a slide has shown, Next slide triggers the slide after the last slide
      // shown, and Previous slide that slide again, by index in the presentation last triggered, and
      // the press then brings that slide alone, and every later press made from it, already handed,
      // moves on from that slide rather than from this press's guess. A last slide shown in another
      // presentation, as when ProPresenter refused the next song's first trigger, is a slide of the
      // song before, so the press sends the active path and moves nothing, as before any slide has
      // shown.
      let path = button.path;
      let sentAt: number | null = null;
      const answer = await inLine(async () => {
        if (given.aborted) return null;
        const from = blanked && lastShown?.presentation.uuid === triggeredIn?.uuid ? lastShown : null;
        const to = from && button.id !== 'clear' ? { ...from, index: from.index + (button.id === 'next' ? 1 : 0) } : null;
        if (to) {
          path = triggerPath(to.presentation, to.index);
          const text = slideAt(to.presentation, to.index);
          brings.slides = new Set(text ? [text] : []);
          const moved = new Set([brings]);
          for (const later of buttonBrings) {
            if (!later.after || !moved.has(later.after)) continue;
            later.slides = new Set(slidesBrought(later.id, later.after, movesIn()));
            moved.add(later);
          }
        }
        sentAt = performance.now();
        // A press that moves from the last slide shown, not from a slide of the song before after a
        // clear, and finds nothing to move, the 404 at either end of the presentation, crosses into the
        // next or previous presentation item of the picked playlist (crossing).
        const fromLastShown = to !== null || (!blanked && active !== null && active.uuid === lastShown?.presentation.uuid);
        let answer = await command(path);
        const across = answer?.status === 404 && fromLastShown && (button.id === 'next' || button.id === 'previous') ? crossing(button.id) : null;
        if (across) {
          path = triggerPath(across.presentation, across.index);
          const text = slideAt(across.presentation, across.index);
          brings.slides = new Set(text ? [text] : []);
          answer = await command(path);
          if (answer !== null && answer.status >= 200 && answer.status < 300) {
            onScreen = null;
            blanked = false;
            lastShown = across;
            triggeredIn = across.presentation;
            active = across.presentation;
            // Leaving the set: an item that is the presentation of no song of the set, by the rule a
            // cue finds a song's presentation by, pauses ProPresenter, so no cue from Live lands on
            // it. The read is held in a const so the check below sees it as read, not null.
            const playlist = read;
            const inSet = playlist !== null && set?.songs.some(({ title }) => title !== null && presentationFor(playlist, title)?.uuid === across.presentation.uuid);
            if (!inSet) report?.movedOut(across.presentation.name);
          }
          return answer;
        }
        if (answer !== null && answer.status >= 200 && answer.status < 300) {
          onScreen = null;
          if (button.id === 'clear') {
            blanked = true;
            active = null;
          } else {
            blanked = false;
            if (to) {
              lastShown = to;
              active = to.presentation;
            }
            else if (lastShown) lastShown = { ...lastShown, index: Math.min(Math.max(lastShown.index + (button.id === 'next' ? 1 : -1), 0), slideCount(lastShown.presentation) - 1) };
          }
        }
        return answer;
      });
      const took = sentAt === null ? null : Math.round(performance.now() - sentAt);
      if (sentAt === null) console.error(`Setlist server: ${button.label} was never sent to ProPresenter: it went offline while the press waited its turn.`);
      else if (answer === null) console.error(`Setlist server: ProPresenter gave no answer to ${button.label} (${path}) after ${took} ms.`);
      else console.error(`Setlist server: ProPresenter answered ${answer.status} to ${button.label} (${path}) after ${took} ms.`);
      const moved = answer !== null && answer.status >= 200 && answer.status < 300;
      brings.until = moved ? clock.now() + BUTTON_FRAME_MS : -Infinity;
      if (!answer || press !== presses) return;
      // A Clear slide that ProPresenter accepts has blanked the screen, and the stream may report no
      // clear, so the row's slide text goes at once, and stays blank over the late frame of a trigger
      // it went out behind (clearedBehind).
      if (button.id === 'clear' && moved) {
        slideChanges += 1;
        slide = null;
        clearedBehind = behind && { slides: behind, until: clock.now() + BUTTON_FRAME_MS };
      }
      commandLine = buttonLineFor(button, answer.status);
      reportState();
    },
    // Called on Refresh, when the set read from Live changes, when ProPresenter comes online, and
    // after the producer's pick: the set's own pick, if any, and fresh reads of the playlists, the
    // picked playlist and the slide timing file, then what keeps the set from being checked and what
    // it cannot match in that playlist (checkLines), each song judged on bars by its own meter, then
    // the file's titles that match no song in the set or in ProPresenter's libraries (titleProblems),
    // with a playlist picked or not, and last what is wrong with the file itself, which then holds no
    // titles.
    async check(given, meters = NO_METERS) {
      set = given;
      reportPick();
      await Promise.all([list(), readPicked(), readTiming()]);
      const file = timing;
      const check = checkLines(given, read, picked(), meters, file);
      check.problems.push(...(await titleProblems(given, file)));
      if (file.problem !== null) check.problems.push(file.problem);
      if (quiet) check.problems.unshift(QUIET_PROBLEM);
      return check;
    },
    // The slides inside the cue's section, from the set the last check held, the playlist and the
    // slide timing file as last read: its group's slides on the bars its entry in the file gives, or
    // else on an even split of its bars (evenSplit), or one slide for a section with no end, the last
    // section of a song with no End that no later song follows, since one that a song follows ends on
    // that song's first locator (boundedSong), for a song's End and for slide 1 of a section with no
    // group, and none for a cue that clears or sends nothing. A section whose slide timing entry gives a start has its first slide that many bars
    // before its start, on a negative beat (sectionPlan). Worked out on each call with the bar length
    // given, so it follows the signature Live last reported, and a new read, with nothing kept to clear.
    // The meters given plan the song before's last section, which bounds such a start on the song's
    // first section (boundBefore).
    plan(cue, bar, meters = NO_METERS) {
      lastBar = bar;
      lastMeters = meters;
      const sending = triggerFor(read, picked(), set, cue, timing, bar, meters);
      if (sending?.kind !== 'trigger') return [];
      const song = set?.songs.find(({ number }) => number === cue.song);
      const section = cue.section === 'end' || !song ? undefined : boundedSong(set, song).sections[cue.section];
      const { group, changes, start } = sending;
      if (!group || !section) return [{ beat: 0, slide: sending.index }];
      return sectionPlan(group, changes, start, section, bar);
    },
    // The producer's pick of a playlist the row lists, kept for the set. The server runs the check
    // once it resolves, and the check reads the picked playlist, so a pick reads it once.
    async pick(choice, given) {
      const playlist = playlists.find(({ id }) => id === choice);
      if (!playlist) return;
      set = given;
      const saved = store.save(given, { id: playlist.id, name: playlist.label });
      reportPick();
      await saved;
    },
  };
}

// The row's lines for a status/slide frame: the current slide's text and the next one's, or none for
// a slide that is not there, so none at all after a clear.
function slideLines(data: unknown): string[] | null {
  const { current, next } = (data ?? {}) as { current?: unknown; next?: unknown };
  const lines = [
    ...(slideText(current) === null ? [] : [`Current slide: ${slideText(current)}`]),
    ...(slideText(next) === null ? [] : [`Next slide: ${slideText(next)}`]),
  ];
  return lines.length > 0 ? lines : null;
}

// A slide's text as one line: its lines without their invisible characters, trimmed, the empty ones
// dropped, joined by " / ". A slide with no words left, such as a media slide, is "(no words)", and
// no slide is null.
function slideText(slide: unknown): string | null {
  const text = (slide as { text?: unknown } | null | undefined)?.text;
  if (typeof text !== 'string') return null;
  const lines = text
    .replace(INVISIBLE, '')
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines.length > 0 ? lines.join(' / ') : NO_WORDS;
}

// The text of a slide with no words left.
const NO_WORDS = '(no words)';

// A slide's UUID, as a status/slide frame names it, or null for none.
function slideUuid(slide: unknown): string | null {
  const uuid = (slide as { uuid?: unknown } | null | undefined)?.uuid;
  return typeof uuid === 'string' && uuid !== '' ? uuid : null;
}

// Zero-width characters, which ProPresenter's slide text carries at the ends of lines.
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;

// The row's line for a press that got this status: nothing for a 2xx, nothing to move for a 404 to
// next or previous, and the status for any other. ProPresenter gives that 404 both with no
// presentation active and on the last slide, and the bare 404 cannot tell them apart, so the line
// names no cause. The line opens with "Pressed", so a Next slide press's line never reads as the
// stream's "Next slide:" line above it.
function buttonLineFor({ id, label }: { id: string; label: string }, status: number): string | null {
  if (status >= 200 && status < 300) return null;
  if (status === 404 && id !== 'clear') return `Pressed ${label}: nothing to move.`;
  return `Pressed ${label}: ProPresenter answered ${status}.`;
}

// The pre-service check's lines for the set against the picked playlist as read: what cannot match
// and the problems, so the operator can fix each before the service, and the notes on what matched,
// expected behaviour the operator may want to know but need not fix. No pick, and a picked playlist
// that could not be read, are each a problem alone, with no song lines. Otherwise songs go in set
// order, each titled as the pages title it, with one of: no presentation or playlist item of its name
// in the playlist (a placeholder, an item ProPresenter has not linked, and a presentation whose read
// answered a 4xx all count, since a cue triggers nothing for them), the one line it cannot match; a
// presentation read that kept answering 5xx after its retries, matched by its item's title
// (failedReadFor), a problem naming the status ("There Is Freedom: presentation could not be read,
// ProPresenter answered 500; press Refresh"), since the playlist is right and a Refresh may read it,
// and its cues trigger nothing until one does; not authorized on this Mac, a problem, since the song
// matched; on an arrangement other than Master, a problem too, after
// not authorized, since its cues trigger nothing; or its notes. Those are, for each name of its
// sections, in the song's order, a repeated name once under the name its first section carries: a
// note when the presentation has no group of that name, saying what its cue does ("no group Intro,
// shows slide 1" or "no group Turnaround, clears"), one for each of the two when the name comes both
// before and after the song's first section with a group, or else a note when its count of sections
// of the name differs from the presentation's count of groups of it ("Holy Forever: 3 sections
// Chorus 1, 1 group"), since a section past the last group of its name repeats that group and a
// group past the last section is never reached; then its End when it has one and the End's cue
// clears (endCueGroupFor), under the name its cue carries ("no group End, clears"): when the
// presentation has neither an End nor an Ending group, or has an Ending group but no End group and
// the song has an Ending section of its own or its last section clears;
// then, for each section whose group holds more than one slide and more slides than the section has
// whole bars of the song's meter, once for each name, length and slide count, a note that its slides
// change on beats ("Ancient Gates: Verse 3 has 3 slides in 2 bars, changed on beats"), since the
// server still moves every slide, and none for a section whose slide timing entry gives its changes,
// or, for a song whose meter is not read yet, one note saying so ("Holy Forever: meter not read yet")
// and no bars judged, the slide timing file's included (resolveTiming). A section whose group holds
// more slides than the section has whole beats gets no such note: the even split drops the slides at
// or past its end (dropsSlides), so, once for each name, length and slide count, it is a problem
// ("Ancient Gates: Verse 3 has 3 slides in 2 beats, needs a slide timing entry"), before the song's
// slide timing problems, whether or not the song's meter is read, and none for a section whose slide
// timing entry gives its changes; then, for each section whose
// slide timing entry gives a start that, on a wrap of a loop on the section itself, would land at or
// before the section's own last change, a note naming the entry ("Worthy Of It All: slide timing
// Chorus 3, start -0.625 passes its last change, a loop wrap sends slide 1 the normal lead early"),
// since on that wrap slide 1 takes the normal lead, and a loop is a live decision the check cannot
// rule out; none for a song whose meter is not read; then, for each group with no name that holds a slide with words and that no section reaches through a valid slide
// timing entry, a note with its position from 1, which an entry's group takes, and its slide count
// ("Holy Forever: unnamed group 12 (2 slides), no section shows it"). A section a valid slide timing
// entry gives a group shows that group, so it has no line of its own, and counts as a section with a
// group. Each entry of the song's that breaks a rule is a problem, after the song's own, in file
// order ("Ancient Gates: slide timing Verse 3 1, changes must go up"), and its section falls back to
// the even split and the name match. Only a song in the set has its entries checked; the check adds,
// after these, each title in the file that matches no song in the set or in ProPresenter's libraries
// (titleProblems). Unmatched and problems hold no line when every song and section matches, notes or
// not, and the check carries ProPresenter's pass text (PASS_TEXT) either way. A song's meter is the
// beats in its bar, from meters by its number, which holds a song only once Live has reported its time
// signature while the playhead sat inside it.
function checkLines(set: SetList, read: ReadPlaylist | null, picked: StoredPlaylist | null, meters: ReadonlyMap<number, number>, timing: SlideTiming): FileCheck {
  if (!picked) return { unmatched: [], problems: ['no playlist picked'], notes: [], passText: PASS_TEXT };
  if (read?.id !== picked.id) return { unmatched: [], problems: [`${picked.name}: could not be read from ProPresenter`], notes: [], passText: PASS_TEXT };
  const check: FileCheck = { unmatched: [], problems: [], notes: [], passText: PASS_TEXT };
  for (const listed of set.songs) {
    const song = boundedSong(set, listed);
    const title = songTitle(song);
    const presentation = song.title === null ? undefined : presentationFor(read, song.title);
    if (!presentation) {
      const failed = song.title === null ? undefined : failedReadFor(read, song.title);
      if (failed) check.problems.push(`${title}: presentation could not be read, ProPresenter answered ${failed.status}; press Refresh`);
      else check.unmatched.push(`${title}: no presentation or playlist item of its name`);
      continue;
    }
    if (!presentation.authorized) {
      check.problems.push(`${title}: not authorized in ProPresenter`);
      continue;
    }
    if (!followsArrangement(presentation)) {
      check.problems.push(`${title}: arrangement ${presentation.arrangement} in ProPresenter, not Master`);
      continue;
    }
    const bar = meters.get(song.number) ?? null;
    const { exceptions, problems } = resolveTiming(timing, presentation, song, bar, (bar) => boundBefore(set, song, read, timing, meters, bar));
    const names = song.sections.map(({ name }) => name);
    // Each note once, by its key, in the order its first section comes.
    const lines = new Map<string, string>();
    names.forEach((name, index) => {
      const first = names.find((other) => nameKey(other) === nameKey(name)) ?? name;
      const groups = itemsNamed(presentation.groups, name).length;
      if (groups === 0) {
        if (exceptions.get(index)?.group) return;
        const does = noGroupShows(presentation, song, index, exceptions);
        const key = `${nameKey(name)}\n${does}`;
        if (!lines.has(key)) lines.set(key, `${title}: no group ${first}, ${does === SLIDE_1 ? 'shows slide 1' : 'clears'}`);
        return;
      }
      const sections = names.filter((other) => namesMatch(other, name)).length;
      if (sections !== groups && !lines.has(nameKey(name))) lines.set(nameKey(name), `${title}: ${counted(sections, 'section')} ${first}, ${counted(groups, 'group')}`);
    });
    check.notes.push(...lines.values());
    const endMissing = song.end !== null && !names.some((name) => namesMatch(name, END)) && endCueGroupFor(presentation, song, exceptions) === undefined;
    if (endMissing) check.notes.push(`${title}: no group ${END}, clears`);
    if (bar === null) check.notes.push(`${title}: ${METER_NOT_READ}`);
    const onBeats = new Set<string>();
    // Each problem once, by its section's name, length and slide count, in the order its first section comes.
    const pastBeats = new Map<string, string>();
    song.sections.forEach((section, index) => {
      const group = groupAt(presentation, exceptions, song, index, section.name);
      if (!group || section.end === null || exceptions.get(index)?.changes) return;
      const length = section.end - section.time;
      const key = `${nameKey(section.name)}\n${length}\n${group.slides.length}`;
      if (dropsSlides(group, length)) {
        if (!pastBeats.has(key)) pastBeats.set(key, `${title}: ${section.name} has ${counted(group.slides.length, 'slide')} in ${counted(Math.floor(length + EPSILON), 'beat')}, needs a slide timing entry`);
        return;
      }
      if (bar === null) return;
      const bars = Math.floor(length / bar + EPSILON);
      if (group.slides.length <= Math.max(bars, 1) || onBeats.has(key)) return;
      onBeats.add(key);
      check.notes.push(`${title}: ${section.name} has ${counted(group.slides.length, 'slide')} in ${counted(bars, 'bar')}, changed on beats`);
    });
    song.sections.forEach((section, index) => {
      const exception = exceptions.get(index);
      const group = groupAt(presentation, exceptions, song, index, section.name);
      if (bar === null || exception?.start === undefined || !group || section.end === null) return;
      const plan = sectionPlan(group, exception.changes ?? null, exception.start, section, bar);
      const last = plan.at(-1)!.beat;
      if (section.end - section.time + exception.start * bar <= last + EPSILON) check.notes.push(`${title}: ${exception.label}, start ${exception.start} passes its last change, a loop wrap sends slide 1 the normal lead early`);
    });
    const reached = new Set([...exceptions.values()].map(({ group }) => group));
    presentation.groups.forEach((group, at) => {
      const words = group.slides.some((slide) => slide !== null && slide !== NO_WORDS);
      if (nameKey(group.name) !== '' || !words || reached.has(group)) return;
      check.notes.push(`${title}: unnamed group ${at + 1} (${counted(group.slides.length, 'slide')}), no section shows it`);
    });
    check.problems.push(...pastBeats.values(), ...problems);
  }
  return check;
}

// The note for a song whose meter Live has not reported, in place of its bars.
const METER_NOT_READ = 'meter not read yet';

// No song's meter, for a check given none.
const NO_METERS: ReadonlyMap<number, number> = new Map();

// A count and its noun, "1 group" or "5 groups".
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// The name a song's End cue carries (cues.ts), and the other name a group for it may have.
const END = 'End';
const ENDING = 'Ending';

// The arrangement whose slide order the index trigger follows: the presentation's own, Master.
const MASTER = 'Master';

// Whether the presentation's playlist item is on Master, or names no arrangement, so its slides go in
// the order its read lists them and an index lands on the slide meant.
function followsArrangement({ arrangement }: Presentation): boolean {
  return arrangement === null || arrangement.trim() === '' || namesMatch(arrangement, MASTER);
}

// The presentation a song of this title triggers, by the shared rule (song-presentation.ts): the
// first in playlist order whose own name matches, else the first whose playlist item's name, less its
// arrangement, does (setlist-controller#579). A match by the item's name alone gives way to a read
// that kept failing for an item of the song's title: that item may hold the song's own presentation,
// so the song keeps its could-not-be-read problem, and a Refresh may read it.
function presentationFor(read: ReadPlaylist, title: string): Presentation | undefined {
  const found = songPresentation(title, read.presentations);
  return found && !namesMatch(found.name, title) && failedReadFor(read, title) ? undefined : found;
}

// The read that kept failing for a song of this title with no presentation read: the first in
// playlist order whose item title matches.
function failedReadFor(read: ReadPlaylist, title: string): FailedRead | undefined {
  return read.failed.find((failed) => namesMatch(failed.title, title));
}

// What a section with no group of its name does: shows slide 1 of the presentation when it comes
// before the song's first section with a group, such as a Count Off or an Intro with no group, or
// else clears the slide layer. In a song none of whose sections has a group, every section shows
// slide 1.
const SLIDE_1 = 'slide 1';
const CLEARS = 'clear';
function noGroupShows(presentation: Presentation, song: Song, index: number, exceptions: Exceptions): typeof SLIDE_1 | typeof CLEARS {
  return index < firstGrouped(presentation, song, exceptions) ? SLIDE_1 : CLEARS;
}

// The index of the song's first section that triggers a group, the slide timing file's included, or
// Infinity for none.
function firstGrouped(presentation: Presentation, song: Song, exceptions: Exceptions): number {
  const index = song.sections.findIndex(({ name }, at) => groupAt(presentation, exceptions, song, at, name) !== undefined);
  return index === -1 ? Infinity : index;
}

// The group the section at that index of the song, of that name, shows: the group its entry in the
// slide timing file gives, when it has a valid one that gives a group, or else the group its name and
// occurrence match (itemFor and occurrenceAt, src/shared/occurrence.ts). Every place that asks which
// group a section shows asks here. A song the set does not hold counts its section as the first of its
// name, with no exceptions.
function groupAt(presentation: Presentation, exceptions: Exceptions, song: Song | undefined, index: number, name: string): Group | undefined {
  return exceptions.get(index)?.group ?? itemFor(presentation.groups, name, song ? occurrenceAt(song.sections, index, name) : 1);
}

// A valid entry of the slide timing file, by the index of the section it names in its song: the group
// it shows, when it gives one, the bar of each slide change after the first, when it gives them, and its
// start, the bars before the section's start its first slide goes, when it gives one; with the entry's
// label and its number in its song's list, from 1, for a line about it.
type Exception = { label: string; n: number; group?: Group; changes?: number[]; start?: number };
type Exceptions = ReadonlyMap<number, Exception>;
const NO_EXCEPTIONS: Exceptions = new Map();

// The song's entries in the slide timing file, resolved against its presentation and a bar of that many
// beats: each valid entry by the section it names, and a problem line for each entry that breaks a
// rule (slide-timing.ts), in file order, naming the song and the entry. A broken entry is ignored
// whole, so its section keeps the even split and the name match. Worked out on each ask, so the cue,
// the plan and the check never disagree. With no bar, for a song whose meter the check has not read,
// the rules that a change lies inside its section and that a start lands after the section before's
// last change are not judged, and every other rule is. That last rule is judged after the rest, on the
// entries they leave standing, before the song's first section on before, the end of the song before
// as that bar plans it (boundBefore), asked only when the rule is judged.
function resolveTiming(timing: SlideTiming, presentation: Presentation, song: Song, bar: number | null, before: (bar: number) => Bound): { exceptions: Exceptions; problems: string[] } {
  const { exceptions, problems } = firstPass(timing, presentation, song, bar);
  // The second pass: a start that lands at or before the section before's last change, judged on the
  // first pass's entries, drops its entry whole. Not judged with no bar.
  const bound = bar === null ? null : before(bar);
  const passing = bound === null ? [] : [...exceptions].filter(([index, { start }]) => start !== undefined && passes(presentation, song, index, start, bar!, exceptions, bound) !== null);
  for (const [index, exception] of passing) {
    problems.push({ n: exception.n, line: `${songTitle(song)}: ${exception.label}, start ${exception.start} passes ${passes(presentation, song, index, exception.start!, bar!, exceptions, bound!)}` });
    exceptions.delete(index);
  }
  return { exceptions, problems: problems.sort((a, b) => a.n - b.n).map(({ line }) => line) };
}

// The first pass over the song's entries: each one resolved by every rule but where its start lands,
// given the entries before it that stand, into the entries that stand and a problem for each that
// breaks a rule, by its number in the song's list.
function firstPass(timing: SlideTiming, presentation: Presentation, song: Song, bar: number | null): { exceptions: Map<number, Exception>; problems: { n: number; line: string }[] } {
  const exceptions = new Map<number, Exception>();
  const problems: { n: number; line: string }[] = [];
  const entries = song.title === null ? [] : (timing.songs.get(nameKey(song.title))?.entries ?? []);
  entries.forEach((entry, at) => {
    const resolved = resolveEntry(entry, at + 1, presentation, song, bar, exceptions);
    if (typeof resolved === 'string') problems.push({ n: at + 1, line: `${songTitle(song)}: ${resolved}` });
    else exceptions.set(resolved.index, resolved.exception);
  });
  return { exceptions, problems };
}

// Where the slide before a section's first goes, which its start must land after: the section before's
// last change, the last of its plan, or its downbeat when it shows one slide or clears; or, for a song's
// first section, the end of the song before in the set, its End, or for a song with no End the last
// change of its last section, which runs to this song's first locator (boundBefore), or the set's start
// for the first song. Named as a problem line ends.
type Bound = { beat: number; name: string };

// The song as its slides see it: a song with no End runs its last section to the next song's first
// locator, as the controller does (playback-controller.ts, nowPlaying), so that section ends there,
// for its plan, its check and its slide timing entry alike, and its slides move on the even split.
// The next song is the next in set order, as the crossing takes it (connections.ts), and only one
// whose first locator comes after that section's start. Every other section, and the song's own end,
// stay as the set gives them, so the song still has no End cue; and the last section of the set's
// last song with no End, which no later song follows, keeps no end and shows its first slide alone.
function boundedSong(set: SetList | null, song: Song): Song {
  const songs = set?.songs ?? [];
  const at = songs.findIndex(({ number }) => number === song.number);
  const last = song.sections.at(-1);
  const next = at < 0 ? undefined : songs[at + 1]?.sections[0]?.time;
  if (song.end !== null || !last || last.end !== null || next === undefined || next <= last.time) return song;
  return { ...song, sections: [...song.sections.slice(0, -1), { ...last, end: next }] };
}

// The bound for the first section of the song: the end of the song before it in the set, its End, or
// for a song with no End the last change of its last section, which runs to this song's first locator
// (boundedSong), planned as its cue plans it, in its own meter from meters, or else in bar, with the
// entries of the slide timing file's first pass that stand for it. A song before that sends nothing,
// with no presentation in the playlist as read or one ProPresenter would not trigger, keeps its last
// section's start. The set's start for the first song.
function boundBefore(set: SetList | null, song: Song, read: ReadPlaylist | null, timing: SlideTiming, meters: ReadonlyMap<number, number>, bar: number): Bound {
  const songs = set?.songs ?? [];
  const before = songs[songs.findIndex(({ number }) => number === song.number) - 1];
  if (!before) return { beat: 0, name: 'the start of the set' };
  const end = { name: `the end of ${songTitle(before)}` };
  if (before.end !== null) return { beat: before.end, ...end };
  const bounded = boundedSong(set, before);
  const last = bounded.sections.length - 1;
  const lastStart = { beat: bounded.sections[last]?.time ?? 0, ...end };
  const presentation = read && before.title !== null ? presentationFor(read, before.title) : undefined;
  if (last < 0 || !presentation?.authorized || !followsArrangement(presentation)) return lastStart;
  const own = meters.get(before.number) ?? bar;
  const { exceptions } = firstPass(timing, presentation, bounded, own);
  return { beat: lastChange(presentation, bounded, last, own, exceptions), name: `the last change of ${songTitle(before)}` };
}

// The beat of the last slide change of the section at that index: the last of its plan, or its downbeat
// when it shows one slide or clears.
function lastChange(presentation: Presentation, song: Song, index: number, bar: number, exceptions: Exceptions): number {
  const section = song.sections[index]!;
  const group = groupAt(presentation, exceptions, song, index, section.name);
  const plan = group ? sectionPlan(group, exceptions.get(index)?.changes ?? null, null, section, bar) : [{ beat: 0 }];
  return section.time + Math.max(0, plan.at(-1)!.beat);
}

// What the start of the section at that index, in bars, passes, or null when it lands after it.
function passes(presentation: Presentation, song: Song, index: number, start: number, bar: number, exceptions: Exceptions, before: Bound): string | null {
  const section = song.sections[index];
  if (!section) return null;
  const previous = song.sections[index - 1];
  const bound = previous ? { beat: lastChange(presentation, song, index - 1, bar, exceptions), name: `${previous.name}'s last change` } : before;
  return section.time + start * bar <= bound.beat + EPSILON ? bound.name : null;
}

// One entry, the nth of its song, n from 1, resolved: the section it names and its exception, or what
// is wrong with it, by the first rule it breaks, given the entries before it that stand.
function resolveEntry(entry: unknown, n: number, presentation: Presentation, song: Song, bar: number | null, standing: Exceptions): { index: number; exception: Exception } | string {
  if (entry === NOT_A_LIST) return 'slide timing must be a list of entries';
  const fields = (typeof entry === 'object' && entry !== null && !Array.isArray(entry) ? entry : {}) as Record<string, unknown>;
  const { section, occurrence = 1, changes, group, start } = fields;
  if (typeof section !== 'string' || section.trim() === '') return `slide timing entry ${n}, needs a section`;
  const label = `slide timing ${section} ${shown(occurrence)}`;
  const named = song.sections.flatMap((candidate, index) => (namesMatch(candidate.name, section) ? [{ ...candidate, index }] : []));
  if (named.length === 0) return `${label}, no section ${section}`;
  if (!isWhole(occurrence) || occurrence < 1) return `${label}, occurrence must be a whole number from 1`;
  const occurring = named[occurrence - 1];
  if (!occurring) return `${label}, the song has ${counted(named.length, 'section')} ${section}`;
  if (changes === undefined && group === undefined && start === undefined) return `${label}, needs changes, a group or a start`;
  const groups = presentation.groups.length;
  if (group !== undefined && !(isWhole(group) && group >= 1 && group <= groups)) return `${label}, no group ${shown(group)}, the presentation has ${groups}`;
  const { index, name, time, end } = occurring;
  const shows = isWhole(group) ? presentation.groups[group - 1] : itemFor(presentation.groups, name, occurrence);
  if (!shows) return `${label}, no group ${section} for its ${changes === undefined ? 'start' : 'changes'}`;
  let bars: number[] | undefined;
  if (changes !== undefined) {
    if (!Array.isArray(changes) || !changes.every((change) => typeof change === 'number' && Number.isFinite(change))) return `${label}, changes must be a list of bars`;
    bars = changes as number[];
    if (end === null) return `${label}, changes on a section with no end`;
    const needs = shows.slides.length - 1;
    if (bars.length !== needs) return `${label}, ${counted(bars.length, 'change')} for ${counted(shows.slides.length, 'slide')}, needs ${needs}`;
    if (bars.some((change, k, all) => k > 0 && change <= (all[k - 1] ?? -Infinity))) return `${label}, changes must go up`;
    const length = end - time;
    const outside = bar === null ? undefined : bars.find((change) => change <= 0 || change * bar >= length - EPSILON);
    if (outside !== undefined && bar !== null) return `${label}, change ${outside} is outside the section's ${counted(Math.round((length / bar) * 1000) / 1000, 'bar')}`;
  }
  if (start !== undefined && !(typeof start === 'number' && Number.isFinite(start) && start < 0)) return `${label}, start must be a negative number of bars`;
  if (standing.has(index)) return `${label}, a second entry for the section, the first stands`;
  return { index, exception: { label, n, ...(group === undefined ? {} : { group: shows }), ...(bars === undefined ? {} : { changes: bars }), ...(start === undefined ? {} : { start: start as number }) } };
}

// Whether a value from the file is a whole number.
function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

// A value from the file as an entry's line names it: a number as it is, anything else as JSON.
function shown(value: unknown): string {
  return typeof value === 'number' ? String(value) : JSON.stringify(value);
}

// Whether the section at that index of the song, of that name, clears the slide layer: it shows no
// group (groupAt), the slide timing file's included, and comes after the song's first section with
// one (noGroupShows). A section's cue and the End's cue after the song's last section both ask here,
// so they never disagree on what that section left on screen.
function sectionClears(presentation: Presentation, song: Song, index: number, name: string, exceptions: Exceptions): boolean {
  return groupAt(presentation, exceptions, song, index, name) === undefined && noGroupShows(presentation, song, index, exceptions) === CLEARS;
}

// The group a song's End cue triggers, or undefined when it clears: the presentation's first group
// named End; or else its first named Ending, the name Planning Center and MultiTracks give a song's
// closing group, but not for a song with an Ending section of its own, since that section's cue
// triggered the Ending group already, nor for a song whose last section clears, such as an Outro or
// a Pad Out with no group, since the screen went blank on it. In both, the Ending group again at the
// End would bring its lyrics back after the music has ended. A song the set last checked does not
// hold has no last section to judge, so it keeps the Ending group. The cue and the check both ask
// here, so the check's End line shows exactly when the End's cue clears.
function endCueGroupFor(presentation: Presentation, song: Song | undefined, exceptions: Exceptions): Group | undefined {
  const end = itemFor(presentation.groups, END);
  if (end || !song) return end ?? itemFor(presentation.groups, ENDING);
  const ownEnding = song.sections.some(({ name }) => namesMatch(name, ENDING));
  const last = song.sections.length - 1;
  const lastClears = last >= 0 && sectionClears(presentation, song, last, song.sections[last]!.name, exceptions);
  return ownEnding || lastClears ? undefined : itemFor(presentation.groups, ENDING);
}

// The expected slide after a frame showing a slide of this text: that slide alone, since the server
// moves every slide and no Go To Next timer moves inside a group. A slide with no words places
// nothing, since many groups hold one, so it gives null and leaves the expected slide as it is.
function slideShowing(text: string): Set<string> | null {
  return text === NO_WORDS ? null : new Set([text]);
}

// The text of the presentation's slide at that index, or null for a slide with no text or one in no
// group the read kept.
function slideAt(presentation: Presentation, index: number): string | null {
  const group = presentation.groups.find(({ start, slides }) => index >= start && index < start + slides.length);
  return group?.slides[index - group.start] ?? null;
}

// A slide of a presentation, by its index from 0, and, for a slide the adapter triggered, a cue's or a
// press's, the place in the picked playlist as read of the item it was triggered from, so a
// presentation listed twice is crossed from the listing it was shown in (setlist-controller#561).
type Shown = { presentation: Presentation; index: number; position?: number };

// How many slides the presentation holds, as its index counts them.
function slideCount(presentation: Presentation): number {
  return presentation.groups.reduce((count, { slides }) => count + slides.length, 0);
}

// The path that triggers the presentation's slide at that index.
function triggerPath(presentation: Presentation, index: number): string {
  return `/v1/presentation/${encodeURIComponent(presentation.uuid)}/${index}/trigger`;
}

// The beats in a bar in 4/4, for a check given no bar length.
const DEFAULT_BAR = 4;

// Positions this close to a bar line count as on it, as Live's song time is float32.
const EPSILON = 1e-4;

// The group's slides over a section of that length, in beats, with that many beats in a bar. With n
// slides over b whole bars, change k (1 to n-1) goes at round(k * b / n) bars from the section's
// start, rounding half up, and at least one bar after the change before it. With more slides than
// whole bars, the same rule runs on whole beats, at least one beat apart. A change that would go at or
// past the section's end is dropped, so a group with more slides than the section has whole beats
// never shows its last slides, and the pre-service check names that section under Problems
// (checkLines).
function evenSplit(group: Group, length: number, bar: number): SlidePlan {
  const count = group.slides.length;
  const bars = Math.floor(length / bar + EPSILON);
  const onBeats = count > bars;
  const unit = onBeats ? 1 : bar;
  const units = onBeats ? Math.floor(length + EPSILON) : bars;
  const plan: SlidePlan = [{ beat: 0, slide: group.start }];
  let at = 0;
  for (let k = 1; k < count; k += 1) {
    at = Math.max(Math.floor((k * units) / count + 0.5), at + 1);
    const beat = at * unit;
    if (beat >= length - EPSILON) break;
    plan.push({ beat, slide: group.start + k });
  }
  return plan;
}

// Whether the even split of the group over a section of that length, in beats, drops slides: puts one
// at or past the section's end, where the next section's cue replaces it before it shows. It does when
// the group's slides after the first are at least as many as the section's beats, which in a section
// of whole beats is more slides than whole beats. The meter does not change the answer: with more
// slides than bars the split runs on beats, and with no more it never reaches the end. So the 4/4
// split answers for a song whose meter is not read yet too.
function dropsSlides(group: Group, length: number): boolean {
  return evenSplit(group, length, DEFAULT_BAR).length < group.slides.length;
}

// The plan of a section that shows the group: its first slide on the section's start, and each later
// one on the bar its slide timing entry's changes give, or else on the even split of its bars
// (evenSplit), or the first alone for a section with no end, the last section of a song with no End
// that no later song follows (boundedSong). A start, in bars, moves the first slide
// that far before the section's start, so it comes first, on a negative beat.
function sectionPlan(group: Group, changes: number[] | null, start: number | null, section: { time: number; end: number | null }, bar: number): SlidePlan {
  const first = { beat: 0, slide: group.start };
  const plan: SlidePlan =
    section.end === null ? [first] : changes ? [first, ...changes.map((change, k) => ({ beat: change * bar, slide: group.start + k + 1 }))] : evenSplit(group, section.end - section.time, bar);
  return start === null ? plan : [{ beat: start * bar, slide: group.start }, ...plan.slice(1)];
}

// The slides a button may bring, by where it moves from: Next slide the next slide a frame named, or,
// moving from an earlier press no frame has answered yet or from a cue's slide, the slide after each
// place the presentations hold one it may bring; Previous slide the slide before each such place, in
// the groups' order, as ProPresenter moves back across a group (Bridge 1's first slide back to Verse
// 4's last); Clear slide none, since a clear never pauses.
function slidesBrought(id: string, from: Place | null, presentations: Presentation[]): string[] {
  if (id === 'next' && from?.next !== undefined) return from.next === null ? [] : [from.next];
  if ((id !== 'next' && id !== 'previous') || !from) return [];
  const before = id === 'next' ? -1 : 1;
  return presentations.flatMap((presentation) => {
    const slides = presentation.groups.flatMap(({ slides }) => slides);
    return slides.filter((slide, index): slide is string => {
      const neighbour = slides[index + before];
      return slide !== null && neighbour !== undefined && neighbour !== null && from.slides.has(neighbour);
    });
  });
}

// The slide a Next slide or Previous slide brings from the slide shown, by index in its presentation:
// the slide after it or before it, as "(no words)" for one with no words, and none past either end or
// for Clear slide.
function slideBeside(id: string, shown: Shown): string[] {
  if (id !== 'next' && id !== 'previous') return [];
  const text = slideAt(shown.presentation, shown.index + (id === 'next' ? 1 : -1));
  return text === null ? [] : [text];
}

// What a cue sends: an index trigger of the slide at that index in the presentation, with the group
// whose slides go inside the section (null for a song's End and for slide 1 of a section with no
// group, which show that one slide), the bars they change on when the slide timing file gives them
// (null for the even split) and the bars before the section's start its first slide goes when it gives
// a start (null for none), or the clear of the slide layer.
type Sending = { kind: 'trigger'; presentation: Presentation; index: number; group: Group | null; changes: number[] | null; start: number | null } | { kind: 'clear' };

// What the cue sends in the playlist as read, or null for nothing. A section the slide timing file
// gives a group, by a valid entry, triggers the first slide of that group by its index, and a section
// with a group of its name, that group's. A section with none triggers slide 1 of the
// presentation, index 0, when it comes before the song's first section with a group; after it, or in
// a song the set last checked does not hold, which leaves nowhere to place it, it clears
// (sectionClears). A song's End triggers its End group, or its Ending group, and clears with no group
// to show (endCueGroupFor): a song with an Ending section of its own, or one whose last section
// cleared, such as an Outro with no group, clears at its End rather than bring the Ending group back.
function triggerFor(read: ReadPlaylist | null, picked: StoredPlaylist | null, set: SetList | null, cue: Cue, timing: SlideTiming, bar: number, meters: ReadonlyMap<number, number>): Sending | null {
  const { title } = cue;
  if (!read || read.id !== picked?.id || title === null) return null;
  const presentation = presentationFor(read, title);
  if (!presentation?.authorized || !followsArrangement(presentation)) return null;
  const listed = set?.songs.find(({ number }) => number === cue.song);
  const song = listed && boundedSong(set, listed);
  const trigger = (index: number, group: Group | null, exception?: Exception): Sending => ({ kind: 'trigger', presentation, index, group, changes: exception?.changes ?? null, start: exception?.start ?? null });
  const clear: Sending = { kind: 'clear' };
  const exceptions = song ? resolveTiming(timing, presentation, song, bar, (bar) => boundBefore(set, song, read, timing, meters, bar)).exceptions : NO_EXCEPTIONS;
  if (cue.section === 'end') {
    const group = endCueGroupFor(presentation, song, exceptions);
    return group ? trigger(group.start, null) : clear;
  }
  const group = groupAt(presentation, exceptions, song, cue.section, cue.name);
  if (group) return trigger(group.start, group, exceptions.get(cue.section));
  if (!song || sectionClears(presentation, song, cue.section, cue.name, exceptions)) return clear;
  return trigger(0, null);
}

// The playlists in GET /v1/playlists, in its order, with the playlists inside any folder of them.
function playlistsIn(items: unknown[]): ConnectionChoice[] {
  return items.flatMap((item): ConnectionChoice[] => {
    const { id, field_type: type, children } = (item ?? {}) as { id?: { uuid?: unknown; name?: unknown }; field_type?: unknown; children?: unknown };
    const own = type === 'playlist' && typeof id?.uuid === 'string' && typeof id.name === 'string' ? [{ id: id.uuid, label: id.name }] : [];
    return [...own, ...(Array.isArray(children) ? playlistsIn(children) : [])];
  });
}

// The presentations a playlist links, in its order: each item of type presentation with a
// presentation_uuid, with the item's own name, empty for none, and the arrangement it is on, its
// arrangement_name, or null for none named.
// Headers and placeholders are skipped, and so is an item with an empty one, a Planning Center song
// ProPresenter has not linked to a presentation.
function presentationsIn(body: unknown): { uuid: string; name: string; arrangement: string | null }[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const { type, id, presentation_info: info } = (item ?? {}) as { type?: unknown; id?: { name?: unknown }; presentation_info?: { presentation_uuid?: unknown; arrangement_name?: unknown } };
    const uuid = info?.presentation_uuid;
    const name = typeof id?.name === 'string' ? id.name : '';
    const arrangement = typeof info?.arrangement_name === 'string' ? info.arrangement_name : null;
    return type === 'presentation' && typeof uuid === 'string' && uuid.trim() !== '' ? [{ uuid, name, arrangement }] : [];
  });
}

// The names of the libraries GET /v1/libraries lists, each as a flat { uuid, name, index }, as the
// home ProPresenter answered on 2026-11-06 (where the OpenAPI spec has { id: { uuid, name, index } });
// an entry with no name is left out.
function librariesIn(items: unknown[]): string[] {
  return items.flatMap((item) => {
    const name = (item as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? [name] : [];
  });
}

// The names of the presentations GET /v1/library/{name} lists, each item as { uuid, name, index }, as
// the home ProPresenter answered on 2026-11-06. Only the names are read, so its update_type is not.
function itemNamesIn(body: unknown): string[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const name = (item as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? [name] : [];
  });
}

// A presentation as GET /v1/presentation/{uuid} gives it, with no arrangement, or null when the body
// is not one. Every group the read lists is kept, in its order, so a group's place in the list is its
// position as ProPresenter lists it, which the slide timing file's group counts; a name that is not
// text reads as no name. Each group's start counts every slide before it, a slide with no text
// included, as ProPresenter's index does.
function presentationOf(body: unknown): Omit<Presentation, 'arrangement' | 'item'> | null {
  const presentation = (body as { presentation?: unknown } | null)?.presentation as
    | { id?: { uuid?: unknown; name?: unknown }; is_authorized?: unknown; groups?: unknown }
    | undefined;
  if (typeof presentation?.id?.uuid !== 'string' || typeof presentation.id.name !== 'string' || !Array.isArray(presentation.groups)) return null;
  let start = 0;
  const groups: Group[] = [];
  for (const group of presentation.groups as ({ name?: unknown; slides?: unknown } | null)[]) {
    const slides: unknown[] = Array.isArray(group?.slides) ? group.slides : [];
    groups.push({ name: typeof group?.name === 'string' ? group.name : '', start, slides: slides.map((slide) => slideText(slide)) });
    start += slides.length;
  }
  return { uuid: presentation.id.uuid, name: presentation.id.name, authorized: presentation.is_authorized !== false, groups };
}

// Why a request got no answer, as the end of a sentence.
function describe(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'TimeoutError') return `no answer within ${Math.round(timeoutMs / 1000)} s.`;
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const message = cause instanceof Error ? cause.message : String(cause);
  return /[.!?]$/.test(message) ? message : `${message}.`;
}
