import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';

// A ProPresenter for tests: a local HTTP server on a port the OS assigns, started by the test, that
// answers from the Phase 0 recordings in test/fixtures/propresenter (setlist-controller#149) and
// records every request, in order, and when it came. It answers as the real one did:
// - GET /version, /v1/playlists, /v1/playlist/{id} and /v1/presentation/{uuid} with the recorded
//   bodies, and an unknown playlist or presentation with a 404;
// - a group trigger, GET /v1/presentation/{uuid}/group/{group}/trigger, with a 403 on a presentation
//   that is not authorized, whatever the group; a 204 when the group, URL-decoded, is exactly the name
//   of one of its groups, letter case included; and a 404 for a group UUID, a name in the wrong case,
//   a name it does not have, or an unknown presentation;
// - an index trigger, GET /v1/presentation/{uuid}/{index}/trigger, as the recordings in
//   commands-2026-11-02.json did: a 404 for an unknown presentation, a 403 on a presentation that is
//   not authorized, whatever the index, a 404 for an index that is not a whole number from 0 to its
//   slide count minus 1 (58, 9999 and -1 on the 58 slides of Ancient Gates), and otherwise a 204. The
//   index counts every slide of the presentation, from 0, in the order its read lists its groups and
//   their slides. A 204 makes that slide the live slide, with the slide after it as next, but writes no
//   status/slide frame: the test writes the frame with sendSlide(), at the time it chooses. Each slide
//   it shows carries a made-up UUID, the same for the slide at one index every time, as a real
//   status/slide frame's slide carries its own (setlist-controller#266);
// - the slide commands as the recordings in commands.json did: it keeps where it is, the active
//   presentation and the index of its slide showing (showing()), none at start. An index trigger it
//   answers 204 puts it on that slide, a group trigger it answers 204 on the first slide of the first
//   group of that name, counted as the index trigger counts, and a slide the test sends with
//   sendSlide() on that slide, as a press by hand does; a clear puts it nowhere. GET
//   /v1/presentation/active/next/trigger answers 204 and moves one slide on, and /previous/trigger 204
//   and one slide back, each making that slide the live slide and writing no status/slide frame, as an
//   index trigger writes none; next answers 404 on the last slide, as at home, and previous 404 on the
//   first, which Phase 0 never recorded, so it is assumed (setlist-controller#377); both answer 404
//   while no presentation is active. GET /v1/clear/layer/slide answers 204 every time. A recorded
//   chunk sent on the stream or shown with showSlide() moves the live slide alone, not where it is;
// - GET /v1/status/slide, the live slide, as the home ProPresenter answered it on 2026-11-10
//   (commands-2026-11-10.json): while a slide with words shows, a 200 with the current and next slides
//   as a status/slide frame's data carries them, and otherwise a 204 with an empty body, with none
//   showing, after a clear, and while a slide with no words shows, as Holy Forever's Intro. A slide has
//   words when text is left once its invisible characters and whitespace go, as the adapter reads it.
//   None shows at start; a recorded status/slide chunk sent on the stream, one the test shows with
//   showSlide(), a trigger, a next or a previous it answers 204, or a slide the test sends with
//   sendSlide(), shows its slide, and a clear, sent or commanded, shows none;
// - POST /v1/status/updates, the status stream, with a 200 it holds open: application/octet-stream,
//   chunked, one JSON frame a chunk, each ending in a blank line. Opened over a slide with words, it
//   sends that slide at once, as the home ProPresenter's did on 2026-11-10
//   (stream-status-updates-2026-11-10.json, t 165 and 166): timer/system_time, then presentation/current
//   naming the live slide's presentation, as its read gives it, then status/slide with the live slide
//   and the one after it. Otherwise it sends the Phase 0 recording's opening frames
//   (stream-status-updates.json at t 0) and no status/slide; while a slide with no words shows, its
//   presentation/current names that slide's presentation in place of the recording's null, as the
//   real one's is not null while a presentation is active. Neither session recorded a stream opened
//   over a slide with no words, so its sending no status/slide is assumed (setlist-controller#269). A
//   slide from a recorded Phase 0 chunk is in There Is Freedom, and its presentation/current is the
//   recorded one. After that it sends only what the test sends: a recorded chunk by its time, a slide
//   by its index, a heartbeat, or text as it is.
//   It sends only the frames the request asked for, plus timer/system_time, which ProPresenter adds
//   unasked. After loseHeartbeat(), a stream opens with no timer/system_time, as the home ProPresenter's
//   did on 2026-11-03 after it had run for 1 day and 15 hours (setlist-controller#302), until the test
//   sends one with heartbeat(). After lateOpeningSlide(), a stream opened over a slide with words
//   sends no status/slide, as one whose opening frame comes later than the live slide read's answer
//   would.
// - GET /v1/libraries and GET /v1/library/Default as the home ProPresenter answered them on 2026-11-06
//   (v1_libraries.json and v1_library_Default.json): a flat list of one library, Default, whose items
//   are every presentation in it, each with its UUID, its name and its place in the list; a library it
//   does not hold is a 404, as any path with no recording is;
// - a read of one presentation, GET /v1/presentation/{uuid}, with the statuses the test gave for its
//   next reads, one each, in order, and no body, as the home ProPresenter's 500 on a cold read of There
//   Is Freedom on 2026-11-02 did; after them it answers as recorded. Its triggers are not affected;
// - once a test turns the session on (serveNovember12()), the reads the lights step of the set build
//   makes, as the home ProPresenter answered them on 2026-11-12 (the folder 2026-11-12, README "The
//   2026-11-12 session"), over the older reads of the same paths: the 7 playlists, "November 15,
//   2026" and "November 8, 2026", six presentations, and the thumbnail of a presentation's cue, GET
//   /v1/presentation/{uuid}/thumbnail/{index}?quality=400&thumbnail_type=png, on the recorded path
//   with its query alone: a 200 image/png with the recorded PNG, byte for byte, or the recorded 403
//   with no body and no content type for a presentation this Mac is not authorized for. A thumbnail
//   with no recording is a 404, as any path with none is. The session changes no trigger, no slide
//   and no stream. A test can rename a playlist (renamePlaylist()), an answer here that no
//   recording holds;
// - the thumbnail of one presentation's first cue, on the recorded path with its query, with the
//   answers a test gave for its next requests, one each, in order, and, when the test gave one, with
//   that answer for every request after them, else as recorded (answerThumbnails()). An answer is a
//   file of the folder 2026-11-12, served as a recorded thumbnail is, a 200 image/png with its bytes,
//   or a status, served as the recorded 403 is, with no body and no content type. The bytes are
//   recorded, or for a file named made-*.png made, but no song's path answered with them in a recording:
//   the placeholder first and the picture on the next request is a model of the one recorded run
//   (thumbnail-first-request-then-again.json, on a message's slides), not a recording of a song;
// The test stops it and starts it again on the same port, as ProPresenter quitting and opening does,
// and can make it hold every request open with no answer, as a Mac asleep or a network dropping
// packets does, or hold the stream requests alone, or the live slide reads alone. It can drop every open stream, as a network that fails does, and answer the next
// stream requests with other statuses. A silent stream is the fake sending nothing while the test moves
// the adapter's clock.

export type FakeProPresenter = {
  port: number;
  // Every request it received, in order, as its method and its path exactly as sent, still encoded,
  // and for a stream request the JSON its body held, once read.
  requests: { method: string; path: string; body?: unknown }[];
  // When each request came, in ms on the test's own performance.now(): one for each entry of
  // `requests`, in the same order, stamped as the request reaches the fake.
  arrivals: number[];
  // The paths of the group triggers and the index triggers it received, in order.
  triggers(): string[];
  // The paths of the next, previous and clear slide commands it received, in order.
  slideCommands(): string[];
  // Stops answering, as ProPresenter quitting does: every connection is dropped and the port refuses.
  stop(): Promise<void>;
  // Answers again on the same port.
  start(): Promise<void>;
  // Takes every request from now on and holds it open with no answer, until answer() is called.
  hang(): void;
  // Takes every stream request from now on and holds it open with no headers, until answer() is
  // called, as a network that stalls after /version answered does. Other requests are answered.
  hangStreams(): void;
  // Takes every GET /v1/status/slide from now on and holds it open with no answer, until answer() is
  // called, when it answers with the slide live when it came, as a network that holds up the answer
  // does. Other requests are answered.
  hangSlideReads(): void;
  // Answers again: each request still held, and every one after.
  answer(): void;
  // Serves the October 11 playlist as first read, before ProPresenter linked its songs, so each song
  // is a presentation item with an empty presentation_uuid.
  beforeSongsResolved(): void;
  // Lists the playlists as read on 2026-11-02 from now on, "November 8, 2026" first, in place of the
  // 14 read on 2026-10-24.
  listNovember8(): void;
  // Answers from the files of the 2026-11-12 session from now on, over the older reads of the same
  // paths: its playlists, its two playlists' items, its presentations and its thumbnails.
  serveNovember12(): void;
  // Gives the playlist that name from now on, in the list of playlists and in the playlist's own read,
  // as a playlist renamed in ProPresenter: "the date is part of a longer name" for a playlist whose
  // songs have pictures, which no recording holds.
  renamePlaylist(uuid: string, name: string): void;
  // Gives the presentation that own name from now on, in its read, GET /v1/presentation/{uuid}, only,
  // as a Planning Center import that names a presentation "God I'm Just Grateful (Live)" does, which
  // no recording holds (setlist-controller#578). Its playlist items keep their names.
  renamePresentation(uuid: string, name: string): void;
  // Gives the presentation's item that name from now on, in the playlist's own read only, as a
  // producer who renames a playlist item in ProPresenter does, which no recording holds
  // (setlist-controller#578). The presentation keeps its own name.
  renameItem(playlist: string, presentation: string, name: string): void;
  // Lists the presentation again at the end of the playlist's own read from now on, a copy of the
  // playlist's first item for it, as a producer who drags a song in twice does, which no recording
  // holds (setlist-controller#561).
  listAgain(playlist: string, presentation: string): void;
  // Answers the next requests for the thumbnail of the presentation's first cue, on the recorded path
  // with its query, with these answers, one each, in order, and every request after them with
  // `after`, or as before when it is left out. An answer is the name of a file of the 2026-11-12
  // folder, served as a 200 image/png, byte for byte, or a status, served with no body and no content
  // type. Its other cues' thumbnails and other presentations' answer as before.
  answerThumbnails(uuid: string, next: ThumbnailAnswer[], after?: ThumbnailAnswer): void;
  // Marks the presentation authorized, as a licence would: its body says so, and its triggers answer
  // as any other's do.
  authorize(uuid: string): void;
  // Puts the active presentation on its last slide, as presses of next to its end do: next answers 404
  // there, until a previous, a trigger or a clear moves it off.
  lastSlide(): void;
  // Where it is: the active presentation's UUID and the index of its slide showing, from 0, as the
  // index trigger counts, or null with no presentation active.
  showing(): { uuid: string; index: number } | null;
  // Answers GET /v1/libraries with that status and no body from now on, as a ProPresenter that cannot
  // list its libraries would. The library itself still answers.
  refuseLibraries(status: number): void;
  // Answers the next group and index triggers with these statuses, one each, in order, whatever they
  // name.
  answerTriggers(...statuses: number[]): void;
  // Answers the next reads of the presentation, GET /v1/presentation/{uuid}, with these statuses, one
  // each, in order, and no body, then as recorded. Its triggers and other presentations' reads answer
  // as before.
  answerReads(uuid: string, ...statuses: number[]): void;
  // Renames one group of the presentation, in its body and for its triggers, as an operator who names
  // a group with characters a URL must encode, such as "Chorus #2", does.
  renameGroup(uuid: string, from: string, to: string): void;
  // Resolves once every request it has received is answered, and a little after, so the adapter has
  // read the answers too: a test that checks nothing was triggered waits on it first. A stream counts
  // as answered once its 200 is sent, though it stays open.
  idle(): Promise<void>;
  // Resolves once a stream is open and its opening frames are sent, and a little after, so the adapter
  // is reading it: a test sends nothing on the stream before.
  streaming(): Promise<void>;
  // Sends every recorded chunk at that time in stream-status-updates.json on each open stream, such as
  // the Chorus slide at 251835, and resolves a little after, so the adapter has read it. A status/slide
  // chunk also becomes the live slide, which GET /v1/status/slide answers with, and a
  // presentation/current with no presentation leaves none showing.
  send(t: number): Promise<void>;
  // Makes the recorded status/slide chunk at that time the live slide and writes nothing on any
  // stream, as a slide changed while no stream was open, at the server's start or during a drop.
  showSlide(t: number): void;
  // Sends a status/slide frame of the presentation's slide at that index on each open stream, with the
  // slide after it as next, puts the fake on it and makes it the live slide, and resolves a little after, so the adapter has
  // read it: the frame of an index trigger, or of a slide pressed by hand. When the presentation is not
  // the one the fake was on, a presentation/current frame naming it goes first, as the 2026-11-02
  // stream sent Worthy Of It All's at t 15586 before its slide, or after it with currentLast, as it
  // sent Ancient Gates' at t 2189 after its slide at t 2186.
  sendSlide(uuid: string, index: number, options?: { currentLast?: boolean }): Promise<void>;
  // Sends a timer/system_time frame on each open stream, as ProPresenter does every 1 s, and resolves a
  // little after. A heartbeat lost comes back with it.
  heartbeat(): Promise<void>;
  // Opens every stream from now on with no timer/system_time among its opening frames, as a
  // ProPresenter that has lost its heartbeat does, until heartbeat().
  loseHeartbeat(): void;
  // Opens every stream from now on with no status/slide among its opening frames, though a slide with
  // words shows, as a stream whose opening frame comes later than the live slide read's answer would.
  // Neither session recorded one; the test sends the slide when it chooses.
  lateOpeningSlide(): void;
  // Writes the text as it is, in one write, on each open stream, and resolves a little after: part of a
  // frame, several frames, or one that is not JSON.
  sendRaw(text: string): Promise<void>;
  // Drops every open stream, as a network that fails does: its connection is destroyed.
  dropStreams(): void;
  // Answers the next stream requests with these statuses, one each, in order, and no stream.
  answerStreams(...statuses: number[]): void;
  close(): Promise<void>;
};

// An answer a test gives a thumbnail: a file of the 2026-11-12 folder, or a status.
export type ThumbnailAnswer = string | number;

const FIXTURES = resolve(import.meta.dirname, 'fixtures/propresenter');
const BEFORE_SONGS_RESOLVED = 'v1_playlist_6E51EFFD-before-songs-resolved.json';
// The playlists as read on 2026-11-02, which answer the same path as v1_playlists.json.
const NOVEMBER_8_PLAYLISTS = 'v1_playlists-2026-11-02.json';

// A slide as a status/slide frame's data carries it, with a UUID of its own, as every recorded frame's
// slide has: made up from the presentation's UUID and the slide's index, so the slide at one index
// has the same UUID each time it shows, and two slides of one text, such as There Is Freedom's Verse 1
// slide 2 and Verse 4 slide 2, have two. The presentation read gives slides no UUID, as recorded.
type Slide = { uuid: string; text: string; notes: string };
// The recorded presentation's groups, its slides across them in order, and whether it is authorized,
// by its UUID.
// Each group's start is the index of its first slide.
type Presentation = { name: string; authorized: boolean; groups: string[]; starts: number[]; slides: Slide[] };
type RecordedPresentation = { id: { uuid: string; name: string }; is_authorized: boolean; groups: { name: string; slides?: { text?: unknown; notes?: unknown }[] }[] };
const presentationIn = (presentation: RecordedPresentation): Presentation => ({
  name: presentation.id.name,
  authorized: presentation.is_authorized,
  groups: presentation.groups.map(({ name }) => name),
  starts: presentation.groups.map((_, at) => presentation.groups.slice(0, at).reduce((count, { slides }) => count + (slides ?? []).length, 0)),
  slides: presentation.groups
    .flatMap(({ slides }) => slides ?? [])
    .map(({ text, notes }, index) => ({ uuid: slideUuid(presentation.id.uuid, index), text: typeof text === 'string' ? text : '', notes: typeof notes === 'string' ? notes : '' })),
});
// The made-up UUID of the presentation's slide at that index.
const slideUuid = (presentation: string, index: number) => `${presentation}-SLIDE-${index}`;

type Recording = { path: string; status: number; body: unknown };
// An answer of the 2026-11-12 session, by its path with its query: a JSON body, or the bytes of the
// picture its body_file names, with the content type recorded, null for none.
type SessionAnswer = { status: number; type: string | null; body?: unknown; bytes?: Buffer };
const SESSION = join(FIXTURES, '2026-11-12');
function session(): Map<string, SessionAnswer> {
  const answers = new Map<string, SessionAnswer>();
  for (const file of readdirSync(SESSION)) {
    if (!file.endsWith('.json')) continue;
    const { path, status, content_type: type, body, body_file: picture } = JSON.parse(readFileSync(join(SESSION, file), 'utf8')) as Partial<Recording> & { content_type?: string | null; body_file?: string };
    // thumbnail-first-request-then-again.json holds one path's four answers and no status of its own,
    // so it answers no path: a test models its run on a song with answerThumbnails().
    if (path === undefined || status === undefined) continue;
    if (picture !== undefined) answers.set(path, { status, type: type ?? null, bytes: readFileSync(join(SESSION, picture)) });
    else answers.set(path, { status, type: type ?? null, ...(body === '' ? {} : { body }) });
  }
  return answers;
}
// The list of playlists with each playlist renamed as the test gave it, in its folders too.
function renamedIn(items: unknown, names: Map<string, string>): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item: { id?: { uuid?: string }; children?: unknown }) => {
    const name = names.get(item?.id?.uuid ?? '');
    return { ...item, ...(name === undefined ? {} : { id: { ...item.id, name } }), ...(Array.isArray(item?.children) ? { children: renamedIn(item.children, names) } : {}) };
  });
}

const STREAM = '/v1/status/updates';
const HEARTBEAT = 'timer/system_time';
// A frame of the status stream, and the recording's chunks, each with its time in ms since it opened.
type Frame = { url: string; data: unknown };
const CHUNKS = (JSON.parse(readFileSync(join(FIXTURES, 'stream-status-updates.json'), 'utf8')) as { chunks: { t: number; frame: Frame }[] }).chunks;
// The frames the home ProPresenter's stream sent on 2026-11-10 as it opened over a slide with words,
// up to its status/slide at t 166: timer/system_time, presentation/current, status/slide.
const OPEN_OVER_SLIDE = (JSON.parse(readFileSync(join(FIXTURES, 'stream-status-updates-2026-11-10.json'), 'utf8')) as { chunks: { t: number; frame: Frame }[] }).chunks
  .filter(({ t }) => t <= 166)
  .map(({ frame }) => frame);
// The characters ProPresenter puts in a slide's text that show nothing, which the adapter drops.
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;
// How long a send waits after writing, so the adapter has read the frame before the test goes on.
const SETTLE_MS = 50;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

function recordings(): { bodies: Map<string, Recording>; before: Recording; november8: Recording; presentations: Map<string, Presentation> } {
  const bodies = new Map<string, Recording>();
  const presentations = new Map<string, Presentation>();
  let before: Recording | undefined;
  let november8: Recording | undefined;
  for (const file of readdirSync(FIXTURES)) {
    if (!file.endsWith('.json') || file.startsWith('commands') || file.startsWith('stream-')) continue;
    const recording = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Recording;
    if (file === BEFORE_SONGS_RESOLVED) {
      before = recording;
      continue;
    }
    if (file === NOVEMBER_8_PLAYLISTS) {
      november8 = recording;
      continue;
    }
    bodies.set(recording.path, recording);
    const presentation = (recording.body as { presentation?: RecordedPresentation }).presentation;
    if (presentation) presentations.set(presentation.id.uuid, presentationIn(presentation));
  }
  if (!before) throw new Error(`The fake ProPresenter found no ${BEFORE_SONGS_RESOLVED}`);
  if (!november8) throw new Error(`The fake ProPresenter found no ${NOVEMBER_8_PLAYLISTS}`);
  return { bodies, before, november8, presentations };
}

const PRESENTATION_READ = /^\/v1\/presentation\/([^/]+)$/;
// The thumbnail of a presentation's first cue, as the 2026-11-12 session asked for it.
const FIRST_THUMBNAIL = /^\/v1\/presentation\/([^/]+)\/thumbnail\/0\?quality=400&thumbnail_type=png$/;
const TRIGGER = /^\/v1\/presentation\/([^/]+)\/group\/([^/]+)\/trigger$/;
const INDEX_TRIGGER = /^\/v1\/presentation\/([^/]+)\/(-?\d+)\/trigger$/;
const PLAYLISTS = '/v1/playlists';
const PLAYLIST_READ = /^\/v1\/playlist\/([^/]+)$/;
const NEXT = '/v1/presentation/active/next/trigger';
const PREVIOUS = '/v1/presentation/active/previous/trigger';
const CLEAR = '/v1/clear/layer/slide';
const SLIDE_COMMANDS = [NEXT, PREVIOUS, CLEAR];
const LIVE_SLIDE = '/v1/status/slide';
const LIBRARIES = '/v1/libraries';
const SLIDE_FRAME = 'status/slide';
const CURRENT_PRESENTATION = 'presentation/current';
// The recorded presentation/current of There Is Freedom, the presentation every recorded slide is in.
const THERE_IS_FREEDOM_CURRENT = CHUNKS.find(({ t, frame }) => t === 137755 && frame.url === CURRENT_PRESENTATION)!.frame;
// The data of the recorded status/slide chunk at that time.
const slideAt = (t: number): unknown => {
  const chunk = CHUNKS.find((chunk) => chunk.t === t && chunk.frame.url === SLIDE_FRAME);
  if (!chunk) throw new Error(`The recorded stream has no status/slide chunk at t ${t}.`);
  return chunk.frame.data;
};

export async function startFakeProPresenter(): Promise<FakeProPresenter> {
  const { bodies, before, november8, presentations } = recordings();
  const requests: { method: string; path: string }[] = [];
  const arrivals: number[] = [];
  const authorized = new Set<string>();
  const statuses: number[] = [];
  // The statuses the test gave for the next reads of each presentation, by its UUID.
  const readStatuses = new Map<string, number[]>();
  let unresolved = false;
  let listingNovember8 = false;
  // The answers of the 2026-11-12 session, once a test turns it on.
  let november12: Map<string, SessionAnswer> | null = null;
  // The answers a test gave for the thumbnail of each presentation's first cue, by its UUID: those of
  // its next requests, and the one of every request after them, when it gave one.
  const thumbnailAnswers = new Map<string, { next: ThumbnailAnswer[]; after?: ThumbnailAnswer }>();
  const thumbnailAnswer = (given: ThumbnailAnswer): SessionAnswer => (typeof given === 'number' ? { status: given, type: null } : { status: 200, type: 'image/png', bytes: readFileSync(join(SESSION, given)) });
  // The name a test gave each playlist, by its UUID, and the presentations it listed again at its end.
  const playlistNames = new Map<string, string>();
  const listedAgain = new Map<string, string[]>();
  // The own name a test gave each presentation, by its UUID, and the name it gave each presentation's
  // item, by the playlist's UUID and then the presentation's.
  const presentationNames = new Map<string, string>();
  const itemNames = new Map<string, Map<string, string>>();
  let hanging = false;
  let hangingStreams = false;
  let hangingSlideReads = false;
  let heartbeatLost = false;
  let openingSlideLate = false;
  let librariesStatus: number | null = null;
  // The live slide, a status/slide frame's data, or null for none showing, and the presentation/current
  // frame naming its presentation, or null with none showing.
  let live: unknown = null;
  let liveCurrent: Frame | null = null;
  const liveShows = () => (live as { current?: unknown } | null)?.current != null;
  // Whether the live slide has words: text left once the invisible characters and the whitespace go,
  // as the adapter reads a slide's text. Holy Forever's Intro, with none, is a slide with no words.
  const liveHasWords = () => {
    const text = (live as { current?: { text?: unknown } | null } | null)?.current?.text;
    return typeof text === 'string' && text.replace(INVISIBLE, '').trim() !== '';
  };
  // The frames a stream sends as it opens. Over a slide with words, the ones recorded on 2026-11-10:
  // the heartbeat, the live slide's presentation/current, then its status/slide. Otherwise the Phase 0
  // recording's opening frames, with no status/slide, but with the live slide's presentation/current
  // in place of the recording's null while a slide with no words shows.
  const openingFrames = (): Frame[] => {
    const frames = liveHasWords()
      ? OPEN_OVER_SLIDE.map((frame) => (frame.url === CURRENT_PRESENTATION ? liveCurrent! : frame.url === SLIDE_FRAME ? { url: SLIDE_FRAME, data: live } : frame))
      : CHUNKS.filter(({ t }) => t === 0).map(({ frame }) => (frame.url === CURRENT_PRESENTATION && liveShows() ? liveCurrent! : frame));
    return frames.filter(({ url }) => !(heartbeatLost && url === HEARTBEAT) && !(openingSlideLate && url === SLIDE_FRAME));
  };
  const held: (() => void)[] = [];
  let answered = 0;
  const streamStatuses: number[] = [];
  // Each open stream, with the frame names its request asked for.
  const streams = new Map<ServerResponse, Set<string>>();
  // Writes the frames on each open stream that asked for them, and resolves once written.
  const write = async (frames: Frame[]) => {
    const written: Promise<void>[] = [];
    for (const [response, asked] of streams) {
      for (const frame of frames) {
        if (frame.url !== HEARTBEAT && !asked.has(frame.url)) continue;
        written.push(new Promise((resolve) => response.write(`${JSON.stringify(frame)}\r\n\r\n`, () => resolve())));
      }
    }
    await Promise.all(written);
  };

  // A stream request: its body read, then held open with the opening frames sent, or answered with
  // the next status the test gave.
  const stream = (request: IncomingMessage, response: ServerResponse, entry: { body?: unknown }) => {
    let counted = false;
    const count = () => {
      if (counted) return;
      counted = true;
      answered += 1;
    };
    response.once('close', () => {
      count();
      streams.delete(response);
    });
    let text = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (text += chunk));
    request.on('end', () => {
      try {
        entry.body = JSON.parse(text);
      } catch {
        entry.body = undefined;
      }
      const respond = () => {
        if (response.destroyed) return;
        const forced = streamStatuses.shift();
        if (forced !== undefined) {
          response.writeHead(forced).end();
          return;
        }
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.flushHeaders();
        count();
        streams.set(response, new Set(Array.isArray(entry.body) ? entry.body.filter((url): url is string => typeof url === 'string') : []));
        void write(openingFrames());
      };
      if (hanging || hangingStreams) held.push(respond);
      else respond();
    });
  };
  // Where it is: the active presentation and its slide showing, or null for none active.
  let at: { uuid: string; index: number } | null = null;
  // Puts it on that slide and makes the slide live, with no frame.
  const moveTo = (uuid: string, index: number) => {
    at = { uuid, index };
    live = slideData(uuid, index);
    liveCurrent = currentOf(uuid);
  };
  // The presentation/current frame naming the presentation, as its read gives it, the recorded frame's
  // shape.
  const currentOf = (uuid: string): Frame => ({ url: CURRENT_PRESENTATION, data: { presentation: (bodies.get(`/v1/presentation/${uuid}`)?.body as { presentation?: unknown } | undefined)?.presentation ?? null } });
  const slideCount = (uuid: string) => presentations.get(uuid)?.slides.length ?? 0;

  // The answer with the names a test gave its playlists, its presentations and their items: a
  // playlist's in the list and in its own read, a presentation's in its own read, and an item's in its
  // playlist's own read.
  const answer = (path: string): { status: number; type?: string | null; body?: unknown; bytes?: Buffer } => {
    const recorded = recordedAnswer(path);
    const again = listedAgain.get(PLAYLIST_READ.exec(path)?.[1] ?? '');
    const listed = again && recorded.body !== undefined ? { ...recorded, body: withItemsAgain(recorded.body, again) } : recorded;
    const answered = listed.body === undefined ? listed : { ...listed, body: itemsRenamed(path, presentationRenamed(path, listed.body)) };
    if (answered.body === undefined || playlistNames.size === 0) return answered;
    if (path === PLAYLISTS) return { ...answered, body: renamedIn(answered.body, playlistNames) };
    const name = playlistNames.get(PLAYLIST_READ.exec(path)?.[1] ?? '');
    const playlist = answered.body as { id?: object };
    return name === undefined ? answered : { ...answered, body: { ...playlist, id: { ...playlist.id, name } } };
  };
  // A presentation's read with the own name a test gave the presentation; any other body as it is.
  const presentationRenamed = (path: string, body: unknown): unknown => {
    const name = presentationNames.get(PRESENTATION_READ.exec(path)?.[1] ?? '');
    const read = body as { presentation?: { id?: object } };
    return name === undefined || read.presentation === undefined ? body : { ...read, presentation: { ...read.presentation, id: { ...read.presentation.id, name } } };
  };
  // A playlist's own read with the names a test gave its items, each found by its presentation_uuid;
  // any other body as it is.
  const itemsRenamed = (path: string, body: unknown): unknown => {
    const items = itemNames.get(PLAYLIST_READ.exec(path)?.[1] ?? '');
    if (items === undefined) return body;
    type Item = { id?: object; presentation_info?: { presentation_uuid?: unknown } };
    const playlist = body as { items?: Item[] };
    return {
      ...playlist,
      items: (playlist.items ?? []).map((item) => {
        const name = items.get(String(item.presentation_info?.presentation_uuid ?? ''));
        return name === undefined ? item : { ...item, id: { ...item.id, name } };
      }),
    };
  };
  const recordedAnswer = (path: string): { status: number; type?: string | null; body?: unknown; bytes?: Buffer } => {
    if (path === CLEAR) {
      at = null;
      live = null;
      liveCurrent = null;
      return { status: 204 };
    }
    if (path === LIVE_SLIDE) return liveHasWords() ? { status: 200, body: live } : { status: 204 };
    if (path === NEXT) {
      if (!at || at.index + 1 >= slideCount(at.uuid)) return { status: 404 };
      moveTo(at.uuid, at.index + 1);
      return { status: 204 };
    }
    if (path === PREVIOUS) {
      if (!at || at.index === 0) return { status: 404 };
      moveTo(at.uuid, at.index - 1);
      return { status: 204 };
    }
    const trigger = TRIGGER.exec(path);
    if (trigger) {
      const triggered = triggerAnswer(trigger);
      if (triggered.status === 204) {
        const uuid = trigger[1] ?? '';
        const presentation = presentations.get(uuid)!;
        moveTo(uuid, presentation.starts[presentation.groups.indexOf(decodeURIComponent(trigger[2] ?? ''))]!);
      }
      return triggered;
    }
    const indexed = INDEX_TRIGGER.exec(path);
    if (indexed) {
      const triggered = indexAnswer(indexed);
      if (triggered.status === 204) moveTo(indexed[1] ?? '', Number(indexed[2]));
      return triggered;
    }
    if (path === LIBRARIES && librariesStatus !== null) return { status: librariesStatus };
    const read = PRESENTATION_READ.exec(path);
    const forcedRead = read ? readStatuses.get(read[1] ?? '')?.shift() : undefined;
    if (forcedRead !== undefined) return { status: forcedRead };
    const thumbnail = thumbnailAnswers.get(FIRST_THUMBNAIL.exec(path)?.[1] ?? '');
    const forcedThumbnail = thumbnail?.next.shift() ?? thumbnail?.after;
    if (forcedThumbnail !== undefined) return thumbnailAnswer(forcedThumbnail);
    const served = november12?.get(path);
    if (served) return served;
    if (listingNovember8 && path === PLAYLISTS) return { status: november8.status, body: november8.body };
    const recording = unresolved && path === before.path ? before : bodies.get(path);
    if (!recording) return { status: 404 };
    const presentation = (recording.body as { presentation?: { id: { uuid: string } } }).presentation;
    if (presentation && authorized.has(presentation.id.uuid)) return { status: recording.status, body: { presentation: { ...presentation, is_authorized: true } } };
    return { status: recording.status, body: recording.body };
  };
  // A group trigger's answer, which makes a presentation active when it is a 204.
  const triggerAnswer = (trigger: RegExpExecArray): { status: number } => {
    const forced = statuses.shift();
    if (forced !== undefined) return { status: forced };
    const uuid = trigger[1] ?? '';
    const presentation = presentations.get(uuid);
    if (!presentation) return { status: 404 };
    if (!presentation.authorized && !authorized.has(uuid)) return { status: 403 };
    let group: string;
    try {
      group = decodeURIComponent(trigger[2] ?? '');
    } catch {
      return { status: 404 };
    }
    return { status: presentation.groups.includes(group) ? 204 : 404 };
  };

  // An index trigger's answer, as recorded on 2026-11-02, which makes that slide live when it is a 204.
  const indexAnswer = (trigger: RegExpExecArray): { status: number } => {
    const forced = statuses.shift();
    if (forced !== undefined) return { status: forced };
    const uuid = trigger[1] ?? '';
    const presentation = presentations.get(uuid);
    if (!presentation) return { status: 404 };
    if (!presentation.authorized && !authorized.has(uuid)) return { status: 403 };
    const index = Number(trigger[2]);
    return { status: Number.isInteger(index) && index >= 0 && index < presentation.slides.length ? 204 : 404 };
  };
  // The data of a status/slide frame showing the presentation's slide at that index, with the slide
  // after it as next, or none after the last.
  const slideData = (uuid: string, index: number) => {
    const slides = presentations.get(uuid)?.slides ?? [];
    const current = slides[index];
    if (!current) throw new Error(`The fake ProPresenter has no slide ${index} in presentation ${uuid}.`);
    return { current, next: slides[index + 1] ?? null };
  };

  const server: Server = createServer((request, response) => {
    const path = request.url ?? '';
    const entry: { method: string; path: string; body?: unknown } = { method: request.method ?? '', path };
    requests.push(entry);
    arrivals.push(performance.now());
    if (request.method === 'POST' && path === STREAM) {
      stream(request, response, entry);
      return;
    }
    response.once('close', () => (answered += 1));
    // A held read of the live slide answers with the slide live when it came, as a ProPresenter whose
    // answer the network holds up does.
    const early = request.method === 'GET' && path === LIVE_SLIDE ? answer(path) : null;
    const respond = () => {
      if (response.destroyed) return;
      const { status, type, body, bytes } = early ?? (request.method === 'GET' ? answer(path) : { status: 404 });
      if (bytes !== undefined) {
        response.writeHead(status, type == null ? {} : { 'content-type': type }).end(bytes);
        return;
      }
      if (body === undefined) {
        response.writeHead(status).end();
        return;
      }
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    };
    if (hanging || (hangingSlideReads && path === LIVE_SLIDE)) held.push(respond);
    else respond();
  });
  const listen = (port: number) =>
    new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  let running = false;
  const stop = async () => {
    if (!running) return;
    running = false;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    await closed;
  };

  await listen(0);
  running = true;
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    requests,
    arrivals,
    triggers: () => requests.map(({ path }) => path).filter((path) => TRIGGER.test(path) || INDEX_TRIGGER.test(path)),
    slideCommands: () => requests.map(({ path }) => path).filter((path) => SLIDE_COMMANDS.includes(path)),
    stop,
    async start() {
      if (running) return;
      await listen(port);
      running = true;
    },
    hang() {
      hanging = true;
    },
    hangStreams() {
      hangingStreams = true;
    },
    hangSlideReads() {
      hangingSlideReads = true;
    },
    answer() {
      hanging = false;
      hangingStreams = false;
      hangingSlideReads = false;
      for (const respond of held.splice(0)) respond();
    },
    beforeSongsResolved() {
      unresolved = true;
    },
    listNovember8() {
      listingNovember8 = true;
    },
    serveNovember12() {
      november12 = session();
    },
    renamePlaylist: (uuid, name) => void playlistNames.set(uuid, name),
    renamePresentation: (uuid, name) => void presentationNames.set(uuid, name),
    renameItem: (playlist, presentation, name) => void itemNames.set(playlist, new Map([...(itemNames.get(playlist) ?? []), [presentation, name]])),
    listAgain: (playlist, presentation) => void listedAgain.set(playlist, [...(listedAgain.get(playlist) ?? []), presentation]),
    answerThumbnails(uuid, next, after) {
      const given = thumbnailAnswers.get(uuid);
      thumbnailAnswers.set(uuid, { next: [...(given?.next ?? []), ...next], ...(after === undefined ? (given?.after === undefined ? {} : { after: given.after }) : { after }) });
    },
    authorize: (uuid) => void authorized.add(uuid),
    lastSlide() {
      if (at) moveTo(at.uuid, slideCount(at.uuid) - 1);
    },
    showing: () => at && { ...at },
    refuseLibraries(status) {
      librariesStatus = status;
    },
    answerTriggers: (...given) => void statuses.push(...given),
    answerReads(uuid, ...given) {
      readStatuses.set(uuid, [...(readStatuses.get(uuid) ?? []), ...given]);
    },
    renameGroup(uuid, from, to) {
      const path = `/v1/presentation/${uuid}`;
      const recording = bodies.get(path);
      const presentation = presentations.get(uuid);
      if (!recording || !presentation) throw new Error(`The fake ProPresenter has no presentation ${uuid}.`);
      const body = recording.body as { presentation: { groups: { name: string }[] } };
      const groups = body.presentation.groups.map((group) => (group.name === from ? { ...group, name: to } : group));
      bodies.set(path, { ...recording, body: { ...body, presentation: { ...body.presentation, groups } } });
      presentations.set(uuid, { ...presentation, groups: presentation.groups.map((name) => (name === from ? to : name)) });
    },
    async idle() {
      const start = performance.now();
      while (answered < requests.length) {
        if (performance.now() - start > 2000) throw new Error(`The fake ProPresenter waited 2000ms to answer ${requests.length - answered} requests.`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await settle();
    },
    async streaming() {
      const start = performance.now();
      while (streams.size === 0) {
        if (performance.now() - start > 2000) throw new Error('The fake ProPresenter waited 2000ms for a stream to open.');
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await settle();
    },
    async send(t) {
      const frames = CHUNKS.filter((chunk) => chunk.t === t).map(({ frame }) => frame);
      if (frames.length === 0) throw new Error(`The recorded stream has no chunk at t ${t}.`);
      const slide = frames.find(({ url }) => url === SLIDE_FRAME);
      if (slide) {
        live = slide.data;
        liveCurrent = THERE_IS_FREEDOM_CURRENT;
      } else if (frames.some(({ url, data }) => url === CURRENT_PRESENTATION && (data as { presentation?: unknown } | null)?.presentation == null)) {
        live = null;
        liveCurrent = null;
      }
      await write(frames);
      await settle();
    },
    showSlide(t) {
      live = slideAt(t);
      liveCurrent = THERE_IS_FREEDOM_CURRENT;
    },
    async sendSlide(uuid, index, { currentLast = false } = {}) {
      const before = at?.uuid ?? null;
      moveTo(uuid, index);
      const current = uuid === before ? [] : [liveCurrent!];
      const slide = { url: SLIDE_FRAME, data: live };
      await write(currentLast ? [slide, ...current] : [...current, slide]);
      await settle();
    },
    async heartbeat() {
      heartbeatLost = false;
      await write([{ url: HEARTBEAT, data: Math.floor(Date.now() / 1000) }]);
      await settle();
    },
    loseHeartbeat() {
      heartbeatLost = true;
    },
    lateOpeningSlide() {
      openingSlideLate = true;
    },
    async sendRaw(text) {
      await Promise.all([...streams.keys()].map((response) => new Promise<void>((resolve) => response.write(text, () => resolve()))));
      await settle();
    },
    dropStreams() {
      for (const response of [...streams.keys()]) {
        streams.delete(response);
        response.socket?.destroy();
      }
    },
    answerStreams: (...given) => void streamStatuses.push(...given),
    close: stop,
  };
}

// Writes a connections config naming ProPresenter at the fake's port into the folder, which must be
// under the worktree's dist, and returns its path. Fields go into ProPresenter's section too, such as
// leadBeats.
export async function writeProPresenterConfig(folder: string, port: number, fields: Record<string, unknown> = {}): Promise<string> {
  await mkdir(folder, { recursive: true });
  const path = join(folder, 'connections.json');
  await writeFile(path, `${JSON.stringify({ targets: { propresenter: { host: '127.0.0.1', port, ...fields } } }, null, 2)}\n`);
  return path;
}

// A playlist read's body with the first item of each presentation given listed again at its end, in
// the order given.
function withItemsAgain(body: unknown, presentations: string[]): unknown {
  type Item = { presentation_info?: { presentation_uuid?: unknown } };
  const playlist = body as { items?: Item[] };
  const items = playlist.items ?? [];
  const again = presentations.flatMap((uuid) => items.filter((item) => item.presentation_info?.presentation_uuid === uuid).slice(0, 1));
  return { ...playlist, items: [...items, ...again] };
}
