import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { join, resolve } from 'node:path';
import { decode, encode, type OscMessage, type OscOutArgument } from '../src/shared/osc.ts';

// A stand-in for Eos, for tests: a TCP server on 127.0.0.1, on a port the OS assigns, that speaks
// OSC 1.0 packet-length framing and answers from the recordings in test/fixtures/eos/. It never
// reaches a real Eos. On each connection it sends what Eos sends on connect, naming its current cue
// as the active cue, as Eos names the cue it is on, or, with no current cue, what Eos sends with no
// cue of the cue list active, naming the first cue as the pending cue. It records every message it
// receives, in order, answers the cue list reads for its show, and answers a fire of a cue in its
// show with the fire event, as Eos does; a fire of any other cue gets no answer. It keeps cue list
// 1's current cue, which every fire moves, and answers Go with the fire event of the cue its link
// names, or else of the cue after it, and Back with the fire event of the cue before, as the
// recordings do (go.json, back.json) and ETC's Eos Family online help ("Link / Loop", "Stop /
// Back") documents for a link: Go takes it whether or not the cue has a follow or a hang. A link to
// a cue in another list, a string such as "99/1" (link-to-another-list.json), is given as that
// string, and a Go from its cue answers with that cue's fire event in its list and fires no cue of
// list 1, a stand-in until a recording shows what Eos does. Past
// either end it does as Eos did with the cue list's defaults: a Go on the last cue fires nothing
// (go-last-cue.json), and a Back on the first cue fades the list out with a fire event of cue 0
// and leaves no cue active (back-first-cue.json); it has no Wrap. It runs no fades, so its Back
// always goes back, never stops a fade, and its Go never resumes one: a test sends those answers
// itself. It fires a cue by hand, as Nick does at the console, fires one alone as a follow time
// does, and sends any message a test gives. The test can make it refuse connections, as a closed
// Eos does, and accept them again on the same port, hold back its answers to reads, and hold back its
// answers to a fire of a cue by number, a Go, a Back and a follow, so a test can tell the lights
// handing a cue over from Eos firing it, and a closed connection eats them. It answers an OSC ping,
// /eos/ping, with /eos/out/ping and the same arguments, as ETC's Eos Family online help ("Using OSC
// with Eos") documents and Eos answered the lights' ping with no argument (ping.json). The test can
// make it go silent, as an Eos behind a pulled cable: every connection stays open, and nothing
// reaches the lights. It keeps, by connection, whether the lights subscribed (/eos/subscribe with 1,
// and 0 to stop), and the test can edit its show while connected, as a cue recorded, moved or
// deleted at the console: each subscribed connection then gets the notify pair Eos sends about 1 s
// after an edit (cue-edit-at-keypad-subscribed.json), which the test can hold back. For the lights
// step of the set build, it answers /eos/get/show/path with the path a test gives as the open show
// file's (show-path.json), sets a cue's label on /eos/set/cue/1/<cue>/label and notifies a subscribed
// connection of it (cue-label-set.json), and saves on Update with Shift held, with the show name and
// the saved event Eos sends (show-save.json); a test can give the connect burst's command line, and
// read the show's cues as they stand. Its show path is a string and it opens, reads and writes no
// file, so a recorded path that names a real show folder is never touched. For the colours of the
// lights step, it keeps levels by cue and channel, an intensity and a red, green and blue, as a model
// built from the recordings of 2026-11-12 and not a recording of any show: a value a cue does not hold
// itself tracks from the nearest earlier cue that holds one, per channel, the colour apart from the
// intensity. On the OSC user's command line, /eos/newcmd, it goes to a cue in no time
// (channel-params.json) and records the colours set by hand into a cue with Record Only, asking for
// the confirmation Eos asks for unless a test turns Record Confirm off (record-only-confirm-on.json,
// record-only-confirm-off.json), copies a cue onto a number no cue has with Copy To, with the command
// line and the notify pair Eos sent and no confirmation (cue-copy-to.json, cue-copy-to-decimal.json),
// and answers any other command as Eos answered one it rejected (command-rejected.json). The copy
// sits in number order with its source's label, and reads as its source on every channel; what it
// holds as its own, each value that differs from what tracks into its place, is a model, and so is
// the answer to a Copy To from a cue the show does not hold or onto a number a cue has, the same
// error: no recording holds either. It answers a channel's parameter read, /eos/get/params/<chan>,
// with the live levels, and takes a colour set through the parameter address,
// /eos/chan/<chan>/param/red/green/blue, with no answer (colour-set.json). For a song cue that runs
// on by a follow or a hang, as recorded on 2026-11-13: a Go To Cue in no time and a Record Only onto
// such a cue fire no other cue (chain-go-to-cue-follow.json, chain-go-to-cue-hang.json,
// chain-record-only-follow.json), a copy takes its source's follow (chain-copy-to-follow.json), and
// `Cue 1 / <cue> Follow#` and `Cue 1 / <cue> Hang#` take the follow and the hang off a cue, with the
// command line Eos sent and, on a subscribed connection, the notify pair (chain-follow-cleared.json,
// chain-hang-cleared.json). A model: the notify pair after a hang taken off, which is recorded for a
// follow only, the answer to either command on a cue that has none, the same line with nothing
// changed and no notify, and a copy's hang and link, which the fake takes from its source.
//
// Its framing is a few lines of its own, not src/server/osc-tcp.ts, so a framing bug in the adapter
// is not mirrored here.

export type FakeEosCue = {
  // As typed at Eos, such as "3.5".
  number: string;
  // "" for a cue with no label.
  label: string;
  // The part, for a part of a multipart cue; 0, a base cue, when left out.
  part?: number;
  // The cue its link names: Go fires it next, and so does its follow or hang. A cue of this list as
  // a whole number, as the list reply's argument 19 gives it (a link to a decimal cue is not
  // recorded), or a cue of any list as "<list>/<cue>", such as "99/1", the string Eos gives for a
  // link to another list (link-to-another-list.json). Left out for none, which Eos gives as 0, when
  // Go and a follow fire the next cue.
  link?: number | string;
  // Its follow time and its hang time in ms, as the list reply's arguments 20 and 21 give them. Left
  // out for none, which Eos gives as -1.
  follow?: number;
  hang?: number;
};

// A channel's levels in a cue: its intensity, and its colour as red, green and blue, each from 0 to
// 100. As a cue's own levels, a part left out is one the cue does not hold, which tracks.
export type FakeEosLevels = { intensity?: number; colour?: [number, number, number] };

export type FakeEos = {
  port: number;
  // Every message received, decoded, in order, across every connection.
  received: OscMessage[];
  // Every reply sent to a read, in order: the count's and each index's last packet. A test waits on
  // it for a read to be answered. The answer to a fire is not one.
  answered: string[];
  // How many connections it has accepted, across every listen.
  accepted(): number;
  // Answers the reads of cue list 1 from this show from now on, in list order. Each cue's reply is
  // the recorded one with the number, the label, the link, the follow and the hang swapped. The show
  // has no current cue until one fires, so a connect before then names no active cue and the show's
  // first cue as the pending cue (connect-no-active-cue.json); the recorded show starts on cue 8, the
  // active cue Eos sent on connect.
  setShow(cues: FakeEosCue[]): void;
  // The path of the show file that is open, which /eos/get/show/path answers with from now on, as
  // Eos names the file it has open (show-path.json). It is a string only: the fake opens no file.
  // Until a test gives one, that read gets no answer.
  setShowPath(path: string): void;
  // The path of the show file that is open, as it stands: the one a test gave, or after a save the
  // one the save made. Null until a test gives one.
  showPath(): string | null;
  // The cues of its show as they stand, in list order, each with its number and its label: the show
  // a test gave, or the recorded show, with every label set and every cue copied over OSC since.
  cues(): FakeEosCue[];
  // The command line every connect burst names from now on, in its /eos/out/cmd and its
  // /eos/out/user/1/cmd, such as a line that reads BLIND. Until a test gives one, each burst holds
  // the recorded line.
  setCommandLine(text: string): void;
  // Takes every label set from now on without a word, as an Eos that does not change the cue: the
  // message is recorded, the cue keeps its label, and no notify is sent.
  holdLabels(): void;
  // Answers every Copy To from now on with its command line and makes no cue, as an Eos that takes
  // the command and does not copy: the message is recorded, the show keeps its cues, and no notify is
  // sent. Not recorded.
  holdCopies(): void;
  // Answers every follow and every hang taken off a cue from now on with its command line and leaves
  // the cue as it was, as an Eos that takes the command and keeps the time: the message is recorded,
  // and no notify is sent. Not recorded.
  holdFollows(): void;
  // Keeps every colour set from now on to a thousandth: each of red, green and blue is held, and
  // read, as the float nearest the level rounded to three decimals, as an Eos that keeps a level less
  // finely than the float sent. Not recorded (test/fixtures/eos/README.md).
  roundColours(): void;
  // Takes every colour set from now on without a word, as an Eos that does not change the channel:
  // the message is recorded, and the channel keeps the colour it had.
  holdColours(): void;
  // The levels the show holds from now on, by cue number then channel: each cue's own values, in
  // place of any given before. A value a cue does not hold tracks from the nearest earlier cue in
  // list order that holds one for that channel, the colour apart from the intensity, and with none
  // before it reads as the recorded channel 1 did (channel-params.json): intensity 0, and red, green
  // and blue 100. A channel that is given an intensity and no colour in any cue is a dimmer, which
  // has no colour and answers its read as the recorded channel 24 did.
  setLevels(levels: Record<string, Record<number, FakeEosLevels>>): void;
  // The levels of every cue of the show as they stand, tracked, by cue number then channel, for each
  // channel a cue holds a value for. A dimmer has an intensity alone.
  levels(): Record<string, Record<number, FakeEosLevels>>;
  // Record Confirm, the setting of Setup, User, Record Defaults: on, as Eos has it by default, a
  // Record Only asks Please Confirm and records on Enter; off, it records at once.
  setRecordConfirm(on: boolean): void;
  // Answers every command line command from now on as Eos answered the one it rejected, with its
  // text and " - Error: Syntax Error", and does nothing (command-rejected.json). With `matching`,
  // only the commands whose text, as sent, matches it, a Copy To among them.
  rejectCommands(matching?: RegExp): void;
  // How many times it has saved its show: once for each /eos/key/update with 1.0 while /eos/key/shift
  // is down on that connection, as the keypad saves, once a test has given it a show path. A save
  // gives the show the open file's name without its time, sends every open connection
  // /eos/out/show/name with that name, then /eos/out/event/show/saved with `<folder>/<show
  // name>.esf3d`, a path with no time that is no file, as Eos sent them (show-save.json), and makes
  // its show path `<folder>/<show name> <time of the save>.esf3d`, the time in the Mac's local time
  // and at least a second after the one in the open file's name. It writes no file. Update with no
  // Shift, and a key's release, give nothing.
  saves(): number;
  // Takes every save from now on without a word, as an Eos whose saved event never comes: the show
  // is saved and its path changes, and no show name and no saved event is sent.
  holdSaves(): void;
  // Edits the show, as a cue recorded, moved or deleted at the console, with its cues put in number
  // order, as Eos keeps them. The current cue moves as Eos's active cue did in the recordings
  // (cue-edit-at-console.json, cue-edit-at-console-subscribed.json,
  // cue-edit-at-keypad-subscribed.json): onto a cue the edit records, with the cue before it as the
  // previous cue; onto the new number of the current cue moved, alone; and onto the cue before the
  // current cue deleted, with the cue before that as the previous cue, or none when no cue is
  // before it. Every open connection gets that /eos/out/previous/cue/1/<n> and
  // /eos/out/active/cue/1/<n> with 1.0 at once, and no fire event. An edit that removes the
  // current cue and records one other is a move of it; any other edit keeps the current cue. Then
  // each subscribed connection gets what Eos sent for each edit at the keypad
  // (cue-edit-at-keypad-subscribed.json):
  // /eos/out/notify/cue/1/list/0/2 with a sequence number and `notify`, the cue as Eos names it (an
  // int for a whole cue, a string such as "11-12" for a move), then /eos/out/notify/cuelist/list/0/2
  // with the next sequence number and the list, 1. The sequence counts up on each connection from its
  // subscribe, across both addresses. `notify: false` sends no notify, for an edit Eos has not
  // notified yet or never notifies.
  editShow(cues: FakeEosCue[], { notify }: { notify: number | string | false }): void;
  // Holds back every notify from now on, on each connection in order, as the second before Eos sends
  // it.
  holdNotifies(): void;
  // Sends every notify held back on each connection still open, in order, and each later one at once
  // again.
  releaseNotifies(): void;
  // Fires that cue of cue list 1 of its show by hand, as at the console: every open connection gets
  // its fire event. For the recorded show's cue 6, the recording of it fired by hand, byte for byte.
  fireByHand(number: string): void;
  // Fires that cue of cue list 1 of its show by itself, as a follow time does: every open connection
  // gets its fire event alone, with no command line before it.
  follow(number: string): void;
  // Sends this message to every open connection.
  emit(address: string, args?: OscOutArgument[]): void;
  // Leaves every cue list read unanswered from now on, as an Eos whose replies never come.
  holdReads(): void;
  // Answers every read held back on each connection still open, in order, from the show as it is
  // now, and each later read at once again.
  releaseReads(): void;
  // Holds back, on each connection in order, everything it answers a fire of a cue by number, a Go
  // or a Back with from now on, and the fire event of a follow: the cue still fires, as the current
  // cue, but its fire event comes late, and never on a connection that closes first. A fire by hand
  // is not held.
  holdFires(): void;
  // Sends every answer held back on each connection still open, in order, and answers each later fire
  // at once again.
  releaseFires(): void;
  // Sends nothing from now on, on any connection open or new: no connect burst, no reply, no fire
  // event. What it receives is still recorded, and every connection stays open, as an Eos behind a
  // pulled cable or a dropped Wi-Fi. A test calls it before the lights connect, too, for a host that
  // accepts the connect and never answers.
  silence(): void;
  // Sends again from now on. Nothing held back while silent is sent.
  speak(): void;
  // Closes the listener and drops every open connection, so a connect is refused.
  refuse(): Promise<void>;
  // Listens again on the same port.
  accept(): Promise<void>;
  close(): Promise<void>;
};

// The show the recordings were made from (test/fixtures/eos/README.md), cue list 1.
export const RECORDED_SHOW: FakeEosCue[] = [
  { number: '1', label: 'Goodness of God / Intro' },
  { number: '2', label: 'Goodness of God / Verse 1' },
  { number: '3', label: 'Goodness of God / Chorus' },
  { number: '3.5', label: 'Goodness of God / Bridge' },
  { number: '4', label: 'Goodness of God / End' },
  { number: '5', label: 'Great Are You Lord / Count Off' },
  { number: '6', label: 'Great Are You Lord / Verse 1' },
  { number: '7', label: 'Great Are You Lord / Chorus' },
  { number: '8', label: '' },
];

// The one-cue-per-song show the lights tests run on, cue list 1: the recorded show's nine cue
// numbers, in the same order, with cue 3 labelled for song 1, Goodness of God, cue 6 for song 2,
// Great Are You Lord, and the other seven unlabelled. Nothing was recorded from it: the fake answers
// it by swapping its numbers and labels into the recorded packets, as for any show a test gives.
export const SONG_SHOW: FakeEosCue[] = RECORDED_SHOW.map(({ number }) => ({
  number,
  label: number === '3' ? 'Goodness of God' : number === '6' ? 'Great Are You Lord' : '',
}));

// Cue list 1 of the template show file, as the spec of the lights step gives it
// (setlist-controller#247), with the cue numbers of the church show the recordings of 2026-11-12
// were made on: the three song cues are 1, 11 and 22. Nothing was recorded from a template: the fake
// answers this show by swapping its numbers and labels into the recorded packets, as for any show a
// test gives.
export const CHURCH_SHOW: FakeEosCue[] = [
  { number: '0.5', label: 'Walk-in' },
  { number: '1', label: 'Song 1' },
  { number: '11', label: 'Song 2' },
  { number: '22', label: 'Song 3' },
  { number: '35', label: 'Closing' },
  { number: '36', label: 'Meet and greet' },
  { number: '37', label: 'Speaker' },
  { number: '38', label: 'Walk-out' },
];

type Recorded = { t_ms: number; dir: 'app->eos' | 'eos->app'; address: string; args: unknown[]; hex: string };

const recording = (name: string): Recorded[] =>
  (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/eos', `${name}.json`), 'utf8')) as { packets: Recorded[] }).packets;
const fromEos = (name: string) => recording(name).filter((packet) => packet.dir === 'eos->app');
const bytes = (packet: Recorded) => Buffer.from(packet.hex, 'hex');

// The cue list read-follow-list.json reads (README "Follows and links"), recorded as cue list 99, as
// a show of the fake's cue list 1: each cue with its link, follow and hang as recorded.
export const RECORDED_FOLLOW_SHOW: FakeEosCue[] = fromEos('read-follow-list').flatMap(({ address, args }) => {
  const cue = /^\/eos\/out\/get\/cue\/99\/([^/]+)\/0\/list\/0\/\d+$/.exec(address);
  return cue ? [{ number: cue[1]!, label: args[2] as string, link: args[19] as number, follow: args[20] as number, hang: args[21] as number }] : [];
});
// The cues of that list as fire-follow-chain.json fired them, in order: the app's fire of the first,
// then each one Eos fired by itself on a follow or a hang, taking a link where there is one.
export const RECORDED_FOLLOW_CHAIN: string[] = fromEos('fire-follow-chain').flatMap(({ address }) => /^\/eos\/out\/event\/cue\/99\/([^/]+)\/fire$/.exec(address)?.[1] ?? []);
// The fire events fire-racing-follow.json recorded after the app's fire of 99/2 by number, sent as
// 99/1's follow was due to fire it, in order: each event's cue and its time in ms.
const RACING = recording('fire-racing-follow');
const RACING_FIRE = RACING.findIndex((packet) => packet.dir === 'app->eos' && packet.address === '/eos/cue/99/2/fire');
export const RECORDED_RACING_FIRES: { cue: string; t_ms: number }[] = RACING.slice(RACING_FIRE + 1).flatMap(({ dir, address, t_ms }) => {
  const cue = dir === 'eos->app' ? /^\/eos\/out\/event\/cue\/99\/([^/]+)\/fire$/.exec(address)?.[1] : undefined;
  return cue ? [{ cue, t_ms }] : [];
});

const CONNECT = fromEos('connect');
// The connect burst's numbered active cue, with its percent, and its text, which joins the number,
// the label, the fade time and the percent with spaces, as recorded (connect.json).
const ACTIVE_CUE = '/eos/out/active/cue/1/8';
const ACTIVE_TEXT = '/eos/out/active/cue/text';
// What Eos sends on connect with no cue of cue list 1 active, after Go To Cue 1 / 0: an active cue
// with no number and the text " 0.0 100%", no previous cue, and the first cue, 1/1, pending, as
// recorded (connect-no-active-cue.json). With no cue pending, the pending cue has no number and its
// text is blank, as connect.json recorded it on the last cue.
const CONNECT_NO_ACTIVE = fromEos('connect-no-active-cue');
const PENDING_CUE = /^\/eos\/out\/pending\/cue\/1\/[^/]+$/;
const PENDING_TEXT = '/eos/out/pending/cue/text';
// The connect burst's command line, and the OSC user's own, user 1's, which reads the same.
const COMMAND_LINES = ['/eos/out/cmd', '/eos/out/user/1/cmd'];
// A cue's text, as Eos joins its number, its label and its fade time with spaces.
const cueText = ({ number, label }: FakeEosCue) => `1/${number}${label === '' ? '' : ` ${label}`} 5.0`;
const READ = fromEos('read-cue-list');
const COUNT_REPLY = READ.find((packet) => packet.address === '/eos/out/get/cue/1/count')!;
const PAST_END = READ.find((packet) => packet.address === '/eos/out/get/cue/0/0')!;
// The four packets each index replies with, by index, as recorded.
const INDEX_REPLIES = RECORDED_SHOW.map(({ number }) => READ.filter((packet) => packet.address.startsWith(`/eos/out/get/cue/1/${number}/0/`)).map(bytes));

// What Eos sends after a fire, up to its first once-a-second report of the fade: the fire event,
// then the previous, active and pending cue and the command line. By the cue fired, as recorded.
const FIRE_REPLIES = new Map(
  [
    ['3', 'fire'],
    ['3.5', 'fire-decimal'],
  ].map(([number, name]) => [number!, fromEos(name!).filter((packet) => packet.t_ms < 1000).map(bytes)]),
);
// A cue fired by hand: the command line as Nick types Go To Cue 6, up to its fire event.
const BY_HAND = fromEos('fire-by-hand');
const BY_HAND_6 = BY_HAND.slice(0, BY_HAND.findIndex((packet) => packet.address === '/eos/out/event/cue/1/6/fire') + 1).map(bytes);
// The fire event of a cue: the recorded one with the number and the label swapped.
const FIRE_EVENT = decode(bytes(fromEos('fire').find((packet) => packet.address === '/eos/out/event/cue/1/3/fire')!))!;
const fireEvent = ({ number, label }: FakeEosCue) => encode(FIRE_EVENT.address.replace('/1/3/', `/1/${number}/`), [label]);
// What Eos sends for a Back on the first cue, as Back From First's default Cue Out fades the list
// out, up to its fire event of cue 0: the active cue with no number, its text, the first cue 1/1
// pending, then the fire event of cue 0 with "" (back-first-cue.json). The pending cue names the
// show's first base cue, as on a connect with no cue active.
const BACK_FIRST = fromEos('back-first-cue');
const BACK_FIRST_REPLIES = BACK_FIRST.slice(0, BACK_FIRST.findIndex((packet) => packet.address === '/eos/out/event/cue/1/0/fire') + 1);

const FIRE = /^\/eos\/cue\/1\/([^/]+)\/fire$/;
const GO = '/eos/cues/1/fire';
const BACK = '/eos/cues/1/stop';
// The recorded show's active cue on connect (connect.json).
const RECORDED_CURRENT = '8';
const COUNT_READ = /^\/eos\/get\/cue\/(\d+)\/count$/;
const INDEX_READ = '/eos/get/cue/1/index';
const PING = '/eos/ping';
const SHOW_PATH_READ = '/eos/get/show/path';
const KEY = /^\/eos\/key\/(shift|update)$/;
const SHOW_FILE = '.esf3d';
// The time at the end of a show file's name, before its extension, as Eos writes it.
const SAVE_TIME = / (\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})$/;
const LABEL_SET = /^\/eos\/set\/cue\/1\/([^/]+)\/label$/;
const SUBSCRIBE = '/eos/subscribe';
// The OSC user's command line: a new command, and a key typed onto the line as it stands.
const NEW_COMMAND = '/eos/newcmd';
const COMMAND = '/eos/cmd';
// The three command line commands of the lights step, as the recordings of 2026-11-12 sent them.
const GO_TO_CUE = /^Go_To_Cue 1 \/ (\S+) Time 0#$/;
const RECORD_ONLY = /^Chan (.+) Record_Only Cue 1 \/ (\S+)#$/;
const COPY_TO = /^Cue 1 \/ (\S+) Copy_To Cue 1 \/ (\d+(?:\.\d+)?)#$/;
// A follow or a hang with no time, which takes it off the cue, as the recordings of 2026-11-13 sent it.
const TIME_OFF = /^Cue 1 \/ (\S+) (Follow|Hang)#$/;
const PARAMS_READ = /^\/eos\/get\/params\/(\d+)$/;
const COLOUR_SET = /^\/eos\/chan\/(\d+)\/param\/red\/green\/blue$/;
// The replies to a parameter read of an RGB fixture, channel 1, and of a dimmer, channel 24, as
// recorded: the maker and the model, then the name, level, min and max of each parameter.
const PARAMS = fromEos('channel-params');
const RGB_PARAMS = decode(bytes(PARAMS.find((packet) => packet.address === '/eos/out/get/params/1')!))!;
const DIMMER_PARAMS = decode(bytes(PARAMS.find((packet) => packet.address === '/eos/out/get/params/24')!))!;
// The colour of a channel no cue holds a colour for, as the recorded channel 1 read.
const NO_COLOUR: [number, number, number] = [100, 100, 100];

// The channels a command line names, such as "1 Thru 3 + 16 Thru 18", or null for a text that is not
// channels joined by " + ", each a number or a run as "<first> Thru <last>".
function channelsIn(text: string): number[] | null {
  const channels: number[] = [];
  for (const part of text.split(' + ')) {
    const run = /^(\d+)(?: Thru (\d+))?$/.exec(part);
    if (!run) return null;
    for (let channel = Number(run[1]); channel <= Number(run[2] ?? run[1]); channel += 1) channels.push(channel);
  }
  return channels;
}
// The notify pair Eos sends a subscribed connection after a cue edit, as recorded at the keypad.
const NOTIFY_CUE = '/eos/out/notify/cue/1/list/0/2';
const NOTIFY_CUELIST = '/eos/out/notify/cuelist/list/0/2';

// A time as Eos writes it in a show file's name: YYYY-MM-DD HH-MM-SS, in local time.
function saveTime(time: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  const day = [time.getFullYear(), two(time.getMonth() + 1), two(time.getDate())].join('-');
  return `${day} ${[time.getHours(), time.getMinutes(), time.getSeconds()].map(two).join('-')}`;
}

// A decoded message's arguments as the codec encodes them again, each with its own type.
function argumentsOf(message: OscMessage): OscOutArgument[] {
  return message.args.map((arg, at) => (message.types[at] === 'i' ? { int: arg as number } : arg));
}

// A recorded reply to an index read, with the index as argument 0, the cue's number and part in its
// address and, on the list packet, its label as argument 2 and its link, follow and hang as
// arguments 19 to 21.
function swapped(packet: Buffer, index: number, { number, label, part = 0, link = 0, follow = -1, hang = -1 }: FakeEosCue): Buffer {
  const message = decode(packet)!;
  const address = message.address.replace(/^(\/eos\/out\/get\/cue\/1\/)[^/]+\/0\//, `$1${number}/${part}/`);
  const args = argumentsOf(message);
  args[0] = { int: index };
  if (/\/0\/list\/0\/\d+$/.test(message.address)) {
    args[2] = label;
    args[19] = typeof link === 'string' ? link : { int: link };
    args[20] = { int: follow };
    args[21] = { int: hang };
  }
  return encode(address, args);
}

export async function startFakeEos({ refusing = false }: { refusing?: boolean } = {}): Promise<FakeEos> {
  const received: OscMessage[] = [];
  const answered: string[] = [];
  let show: FakeEosCue[] | null = null;
  // Cue list 1's current cue, by its number, or null when none has fired.
  let current: string | null = RECORDED_CURRENT;
  // The cue list reads held back, with the connection each came on, in order, while reads are held.
  let heldReads: { socket: Socket; message: OscMessage }[] | null = null;
  // The answers to a fire held back, by connection, in order, while fires are held.
  let heldFires: Map<Socket, Buffer[]> | null = null;
  const sockets = new Set<Socket>();
  let accepted = 0;
  let silent = false;
  // The next notify sequence number of each subscribed connection.
  const subscribed = new Map<Socket, number>();
  // The notifies held back, by connection, in order, while notifies are held.
  let heldNotifies: Map<Socket, Buffer[]> | null = null;
  // The path of the show file that is open, once a test gives one.
  let showPath: string | null = null;
  // The command line a test gave for the connect burst, or null for the recorded one.
  let commandLine: string | null = null;
  // The connections that hold Shift down.
  const shifted = new Set<Socket>();
  let saves = 0;
  let savesHeld = false;
  let labelsHeld = false;
  let copiesHeld = false;
  let followsHeld = false;
  let coloursRounded = false;
  let coloursHeld = false;
  // Each cue's own levels, by cue number then channel.
  let own = new Map<string, Map<number, FakeEosLevels>>();
  // The colour of each channel set by hand since the last Go To Cue.
  const manual = new Map<number, [number, number, number]>();
  let recordConfirm = true;
  // The commands a test told it to reject, by their text as sent, or null for none.
  let rejected: RegExp | null = null;
  // The Record Only each connection was asked to confirm.
  const confirming = new Map<Socket, { echo: string; channels: number[]; cue: string }>();

  const send = (socket: Socket, packet: Buffer) => {
    if (silent) return;
    const length = Buffer.alloc(4);
    length.writeInt32BE(packet.length);
    socket.write(Buffer.concat([length, packet]));
  };
  // The base cues of cue list 1 of the show, in list order: the cues that are not a part of a cue.
  const baseCues = () => (show ?? RECORDED_SHOW).filter((cue) => (cue.part ?? 0) === 0);
  // A base cue of cue list 1 of the show, by its number.
  const cueOf = (number: string) => baseCues().find((cue) => cue.number === number);
  // Sends these packets on that connection, or holds them back behind the answers held before them
  // while fires are held.
  const answerWith = (socket: Socket, packets: Buffer[]) => {
    if (heldFires) heldFires.set(socket, [...(heldFires.get(socket) ?? []), ...packets]);
    else for (const packet of packets) send(socket, packet);
  };
  // The pending cue and its text, naming that cue, or no cue and a blank text with none.
  const pending = (cue: FakeEosCue | undefined, packet: Recorded): Buffer => {
    if (PENDING_CUE.test(packet.address)) return encode(cue ? `/eos/out/pending/cue/1/${cue.number}` : '/eos/out/pending/cue', []);
    return encode(PENDING_TEXT, [cue ? cueText(cue) : '']);
  };
  // What Eos sends when a cue fires: the recording of that cue for the recorded show, else the event.
  // The cue becomes the current cue.
  const fired = (number: string, recorded: Map<string, Buffer[]>): Buffer[] | null => {
    const cue = cueOf(number);
    if (!cue) return null;
    current = cue.number;
    return (!show && recorded.get(number)) || [fireEvent(cue)];
  };
  // What Eos sends on connect, as recorded, but naming the current cue as the active cue: its number
  // with the recorded percent, and its text. For the recorded show on cue 8, it is the recording byte
  // for byte. With no current cue, it is the recording with no cue active, naming the show's first
  // base cue as the pending cue; for the recorded show, that recording byte for byte.
  // A packet of a connect burst as recorded, or, for the command line and user 1's once a test gave
  // a line, that packet with the line as its text.
  const lined = (packet: Recorded): Buffer => {
    if (commandLine === null || !COMMAND_LINES.includes(packet.address)) return bytes(packet);
    return encode(packet.address, [commandLine, ...argumentsOf(decode(bytes(packet))!).slice(1)]);
  };
  const connectBurst = (): Buffer[] => {
    if (current === null) {
      const first = baseCues()[0];
      return CONNECT_NO_ACTIVE.map((packet) => (PENDING_CUE.test(packet.address) || packet.address === PENDING_TEXT ? pending(first, packet) : lined(packet)));
    }
    return CONNECT.map((packet) => {
      if (packet.address === ACTIVE_CUE) return encode(`/eos/out/active/cue/1/${current}`, argumentsOf(decode(bytes(packet))!));
      if (packet.address === ACTIVE_TEXT) {
        const cue = cueOf(current!);
        return encode(ACTIVE_TEXT, [cue ? `${cueText(cue)} 100%` : '']);
      }
      return lined(packet);
    });
  };
  // Saves the show: its name is the open file's without the time, and its path takes the time of
  // the save. Only strings change. The name and the saved event go to every open connection, unless
  // saves are held.
  const save = () => {
    if (showPath === null) return;
    const slash = showPath.lastIndexOf('/');
    const folder = showPath.slice(0, slash + 1);
    const file = showPath.slice(slash + 1, showPath.endsWith(SHOW_FILE) ? -SHOW_FILE.length : undefined);
    const opened = SAVE_TIME.exec(file);
    const name = opened ? file.slice(0, opened.index) : file;
    const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = opened?.slice(1).map(Number) ?? [];
    const after = opened ? new Date(year, month - 1, day, hour, minute, second + 1) : new Date(0);
    const now = new Date();
    saves += 1;
    showPath = `${folder}${name} ${saveTime(now > after ? now : after)}${SHOW_FILE}`;
    if (savesHeld) return;
    for (const socket of sockets) {
      send(socket, encode('/eos/out/show/name', [name]));
      send(socket, encode('/eos/out/event/show/saved', [`${folder}${name}${SHOW_FILE}`]));
    }
  };
  // The base cue that many places from the current cue in list order, or undefined past either end.
  // With no current cue, the cue after it is the first.
  const step = (by: 1 | -1) => {
    const cues = baseCues();
    const at = cues.findIndex((cue) => cue.number === current);
    if (at < 0) return by === 1 ? cues[0] : undefined;
    return cues[at + by];
  };
  // What Go fires: the cue of the show the current cue's link names, else the next one in list
  // order, or, for a link to a cue in another list, that list and cue. A string link naming list 1,
  // such as "1/3", is that cue of the show, as the int is.
  const goes = (): FakeEosCue | { list: string; number: string } | undefined => {
    const link = current === null ? undefined : cueOf(current)?.link;
    if (typeof link === 'string') {
      const at = link.indexOf('/');
      const [list, number] = at < 0 ? ['', link] : [link.slice(0, at), link.slice(at + 1)];
      if (list !== '1') return { list, number };
      return cueOf(number) ?? step(1);
    }
    return (link ? cueOf(String(link)) : undefined) ?? step(1);
  };
  // Sends each subscribed connection the notify pair of an edit of that cue, or holds it back while
  // notifies are held: the cue with the connection's next sequence number, then the list, 1, with
  // the one after.
  const notifyEdit = (cue: OscOutArgument) => {
    for (const [socket, sequence] of subscribed) {
      subscribed.set(socket, sequence + 2);
      const packets = [encode(NOTIFY_CUE, [{ int: sequence }, cue]), encode(NOTIFY_CUELIST, [{ int: sequence + 1 }, { int: 1 }])];
      if (heldNotifies) heldNotifies.set(socket, [...(heldNotifies.get(socket) ?? []), ...packets]);
      else for (const packet of packets) send(socket, packet);
    }
  };
  // A channel's levels in a cue as they track: each of the intensity and the colour from the nearest
  // cue, that one or an earlier one in list order, that holds it. With no cue, as with none active,
  // what a channel reads with nothing recorded.
  const tracked = (cue: string | null, channel: number): { intensity: number; colour: [number, number, number] } => {
    let intensity = 0;
    let colour = NO_COLOUR;
    for (const each of cue === null ? [] : baseCues()) {
      const held = own.get(each.number)?.get(channel);
      if (held?.intensity !== undefined) intensity = held.intensity;
      if (held?.colour) colour = held.colour;
      if (each.number === cue) break;
    }
    return { intensity, colour: [...colour] };
  };
  // A dimmer: a channel given an intensity and no colour.
  const isDimmer = (channel: number) => {
    const held = [...own.values()].flatMap((cue) => cue.get(channel) ?? []);
    return held.length > 0 && held.every(({ colour }) => colour === undefined);
  };
  // The reply to a channel's parameter read, with its live levels: the current cue's, and its colour
  // set by hand since, in the recorded reply of an RGB fixture or of a dimmer.
  const paramsReply = (channel: number): Buffer => {
    const { intensity, colour } = tracked(current, channel);
    const args = argumentsOf(isDimmer(channel) ? DIMMER_PARAMS : RGB_PARAMS);
    args[3] = intensity;
    if (!isDimmer(channel)) [args[7], args[11], args[15]] = manual.get(channel) ?? colour;
    return encode(`/eos/out/get/params/${channel}`, args);
  };
  // The command line as Eos sends it after a command: the OSC user's own, then the console's.
  const commandLineReads = (socket: Socket, text: string, flag: 0 | 1) => {
    for (const address of ['/eos/out/user/1/cmd', '/eos/out/cmd']) send(socket, encode(address, [text, { int: flag }]));
  };
  // Records the colours set by hand on those channels into the cue, as its own, and answers with the
  // command line ending " #". A subscribed connection gets the notify pair when a colour changed, and
  // nothing when the cue read those colours already (record-only-subscribed.json,
  // record-only-same-colour.json). No intensity and no other channel changes.
  const recordOnly = (socket: Socket, { echo, channels, cue }: { echo: string; channels: number[]; cue: string }) => {
    let changed = false;
    for (const channel of channels) {
      const colour = manual.get(channel);
      if (!colour) continue;
      if (tracked(cue, channel).colour.some((value, at) => value !== colour[at])) changed = true;
      const held = own.get(cue) ?? new Map<number, FakeEosLevels>();
      own.set(cue, held);
      held.set(channel, { ...held.get(channel), colour: [...colour] });
    }
    commandLineReads(socket, `${echo} #`, 0);
    if (changed) notifyEdit(/^\d+$/.test(cue) ? { int: Number(cue) } : cue);
  };
  // Copies a cue of the show onto a number no cue of the show has, and answers with the command line
  // alone, which names the new cue and asks for no confirmation; a subscribed connection gets the
  // notify pair (cue-copy-to.json, cue-copy-to-decimal.json). The copy takes its place in number
  // order with its source's label, link, follow and hang, and reads on every channel as its source
  // reads. It holds as its own each value that differs from what tracks into its place, and none
  // where the value is the same: a model, since the recordings show only that a copy straight after
  // its source reads as its source. The recorded show becomes a show of its own, and the current cue
  // stays where it was.
  const copyTo = (socket: Socket, text: string, from: string, to: string) => {
    const line = `LIVE: Cue  ${to} : ${text.replace(/#$/, '').replaceAll('_', ' ')} #`;
    if (copiesHeld) return commandLineReads(socket, line, 0);
    show ??= RECORDED_SHOW.map((cue) => ({ ...cue }));
    const source = cueOf(from)!;
    const channels = [...new Set([...own.values()].flatMap((cue) => [...cue.keys()]))];
    const reads = new Map(channels.map((channel) => [channel, tracked(from, channel)]));
    show = [...show, { ...source, number: to }].sort((a, b) => Number(a.number) - Number(b.number));
    const held = new Map<number, FakeEosLevels>();
    for (const [channel, { intensity, colour }] of reads) {
      const into = tracked(to, channel);
      const differs: FakeEosLevels = {};
      if (into.intensity !== intensity) differs.intensity = intensity;
      if (into.colour.some((value, at) => value !== colour[at])) differs.colour = colour;
      if (differs.intensity !== undefined || differs.colour) held.set(channel, differs);
    }
    if (held.size > 0) own.set(to, held);
    commandLineReads(socket, line, 0);
    notifyEdit(/^\d+$/.test(to) ? { int: Number(to) } : to);
  };
  // Takes the follow or the hang off a cue of the show, and answers with the command line alone,
  // which names the cue (chain-follow-cleared.json, chain-hang-cleared.json); a subscribed connection
  // gets the notify pair (chain-copy-to-follow.json, for a follow). The cue keeps its link and the
  // other of the two. A cue that has none to take off gets the same line, and nothing changes and no
  // notify is sent: a model, as is the notify pair for a hang. The recorded show becomes a show of
  // its own, with its current cue kept.
  const timeOff = (socket: Socket, number: string, word: 'Follow' | 'Hang') => {
    commandLineReads(socket, `LIVE: Cue  ${number} : Cue 1 / ${number} ${word} #`, 0);
    if (followsHeld) return;
    show ??= RECORDED_SHOW.map((cue) => ({ ...cue }));
    const cue = cueOf(number)!;
    const time = word === 'Follow' ? 'follow' : 'hang';
    if (cue[time] === undefined) return;
    delete cue[time];
    notifyEdit(/^\d+$/.test(number) ? { int: Number(number) } : number);
  };
  // A command on the OSC user's command line. A Go To Cue in no time of a cue of the show makes it the
  // current cue, drops every colour set by hand, and sends its fire event and the command line
  // (channel-params.json), and no fire event of another cue, whatever the cue's follow or hang
  // (chain-go-to-cue-follow.json, chain-go-to-cue-hang.json). A Record Only of channels into a cue of
  // the show asks Please Confirm, or records at once with Record Confirm off. A Copy To of a cue of
  // the show onto a number no cue of the show has makes the new cue. A Follow or a Hang with no time
  // on a cue of the show takes it off. Anything else stays on the line with Eos's error, and does
  // nothing: a Go To Cue of a cue the show does not hold among them, a Copy To from a cue the show
  // does not hold or onto a number a cue has, and a Follow or a Hang on a cue the show does not hold,
  // which no recording shows.
  const command = (socket: Socket, text: string) => {
    confirming.delete(socket);
    const echo = `LIVE: Cue  ${current ?? ''} : ${text.replace(/#$/, '').replaceAll('_', ' ')}`;
    const refused = rejected?.test(text) ?? false;
    const goTo = refused ? undefined : cueOf(GO_TO_CUE.exec(text)?.[1] ?? '');
    if (goTo) {
      current = goTo.number;
      manual.clear();
      send(socket, fireEvent(goTo));
      commandLineReads(socket, `LIVE: Cue  ${goTo.number} : Go To Cue 1 / ${goTo.number} Time 0:00 #`, 0);
      return;
    }
    const record = refused ? null : RECORD_ONLY.exec(text);
    const channels = record ? channelsIn(record[1]!) : null;
    if (record && channels && cueOf(record[2]!)) {
      const asked = { echo, channels, cue: record[2]! };
      if (!recordConfirm) return recordOnly(socket, asked);
      confirming.set(socket, asked);
      commandLineReads(socket, `${echo}  Please Confirm`, 1);
      return;
    }
    const copy = refused ? null : COPY_TO.exec(text);
    if (copy && cueOf(copy[1]!) && !cueOf(copy[2]!)) return copyTo(socket, text, copy[1]!, copy[2]!);
    const off = refused ? null : TIME_OFF.exec(text);
    if (off && cueOf(off[1]!)) return timeOff(socket, off[1]!, off[2] as 'Follow' | 'Hang');
    commandLineReads(socket, `${echo} - Error: Syntax Error`, 1);
  };
  const answer = (socket: Socket, message: OscMessage) => {
    if (message.address === PING) {
      send(socket, encode('/eos/out/ping', argumentsOf(message)));
      return;
    }
    if (message.address === SUBSCRIBE) {
      if (message.args[0] === 1) subscribed.set(socket, 0);
      else subscribed.delete(socket);
      return;
    }
    if (message.address === SHOW_PATH_READ) {
      if (showPath !== null) send(socket, encode('/eos/out/get/show/path', [showPath]));
      return;
    }
    const key = KEY.exec(message.address);
    if (key) {
      const down = message.args[0] === 1;
      if (key[1] === 'shift' && down) shifted.add(socket);
      else if (key[1] === 'shift') shifted.delete(socket);
      else if (down && shifted.has(socket)) save();
      return;
    }
    const labelled = LABEL_SET.exec(message.address);
    if (labelled) {
      // A label set gets no direct answer (cue-label-set.json), and a cue that does not exist no
      // notify either. The recorded show becomes a show of its own, with its current cue kept, so
      // the label can change.
      const [label] = message.args;
      if (typeof label !== 'string' || !cueOf(labelled[1]!) || labelsHeld) return;
      show ??= RECORDED_SHOW.map((cue) => ({ ...cue }));
      cueOf(labelled[1]!)!.label = label;
      notifyEdit(/^\d+$/.test(labelled[1]!) ? { int: Number(labelled[1]) } : labelled[1]!);
      return;
    }
    if (message.address === NEW_COMMAND) {
      if (typeof message.args[0] === 'string') command(socket, message.args[0]);
      return;
    }
    if (message.address === COMMAND) {
      // An Enter confirms the Record Only that asked for it, and any other key is not modelled.
      const asked = confirming.get(socket);
      confirming.delete(socket);
      if (asked && message.args[0] === 'Enter') recordOnly(socket, asked);
      return;
    }
    const params = PARAMS_READ.exec(message.address);
    if (params) {
      send(socket, paramsReply(Number(params[1])));
      return;
    }
    const coloured = COLOUR_SET.exec(message.address);
    if (coloured) {
      // A colour set gets no answer (colour-set.json). A dimmer has no colour to set.
      const [red, green, blue] = message.args;
      const channel = Number(coloured[1]);
      if (typeof red !== 'number' || typeof green !== 'number' || typeof blue !== 'number' || isDimmer(channel) || coloursHeld) return;
      const kept = (level: number) => (coloursRounded ? Math.fround(Math.round(level * 1000) / 1000) : level);
      manual.set(channel, [kept(red), kept(green), kept(blue)]);
      return;
    }
    const fire = FIRE.exec(message.address);
    if (fire) {
      // A cue that does not exist gets no reply at all.
      answerWith(socket, fired(fire[1]!, FIRE_REPLIES) ?? []);
      return;
    }
    if (message.address === BACK && current !== null && baseCues()[0]?.number === current) {
      // Back on the first cue fades the list out, and leaves no cue of it active.
      const first = baseCues()[0];
      current = null;
      answerWith(socket, BACK_FIRST_REPLIES.map((packet) => (PENDING_CUE.test(packet.address) || packet.address === PENDING_TEXT ? pending(first, packet) : bytes(packet))));
      return;
    }
    if (message.address === GO || message.address === BACK) {
      // A Go past the last cue fires nothing (go-last-cue.json).
      const cue = message.address === GO ? goes() : step(-1);
      // A Go from a cue linked to a cue in another list fires that cue there, by the stand-in rule,
      // with the recorded fire event's list and cue swapped and no label, and fires no cue of list 1,
      // so the current cue stays where it is. Not recorded (test/fixtures/eos/README.md).
      if (cue && 'list' in cue) answerWith(socket, [encode(FIRE_EVENT.address.replace('/1/3/', `/${cue.list}/${cue.number}/`), [''])]);
      else if (cue) answerWith(socket, fired(cue.number, new Map()) ?? []);
      return;
    }
    if (heldReads) {
      heldReads.push({ socket, message });
      return;
    }
    const count = COUNT_READ.exec(message.address);
    if (count) {
      const list = Number(count[1]);
      if (list === 1 && !show) send(socket, bytes(COUNT_REPLY));
      else send(socket, encode(`/eos/out/get/cue/${list}/count`, [{ int: list === 1 ? show!.length : 0 }]));
      answered.push(`count ${list}`);
      return;
    }
    if (message.address !== INDEX_READ) return;
    const index = message.args[0] as number;
    const cues = show ?? RECORDED_SHOW;
    const cue = cues[index];
    // An index past the end replies as the recording's did, with the index read.
    if (!cue) send(socket, !show && index === RECORDED_SHOW.length ? bytes(PAST_END) : encode(PAST_END.address, [{ int: index }]));
    else if (!show) for (const packet of INDEX_REPLIES[index]!) send(socket, packet);
    // A show the test gave replies with recorded index 0's packets, swapped for each cue.
    else for (const packet of INDEX_REPLIES[0]!) send(socket, swapped(packet, index, cue));
    answered.push(`index ${index}`);
  };

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    accepted += 1;
    socket.on('close', () => {
      sockets.delete(socket);
      subscribed.delete(socket);
      shifted.delete(socket);
      confirming.delete(socket);
    });
    socket.on('error', () => {});
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4 && pending.length >= 4 + pending.readInt32BE(0)) {
        const packet = pending.subarray(4, 4 + pending.readInt32BE(0));
        pending = pending.subarray(4 + packet.length);
        const message = decode(packet);
        if (!message) continue;
        received.push(message);
        answer(socket, message);
      }
    });
    for (const packet of connectBurst()) send(socket, packet);
  });

  const listen = (port: number) =>
    new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  let listening = false;
  const refuse = async () => {
    if (!listening) return;
    listening = false;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    for (const socket of sockets) socket.destroy();
    await closed;
  };

  await listen(0);
  listening = true;
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('The fake Eos has no port');
  const { port } = address;
  if (refusing) await refuse();

  return {
    port,
    received,
    answered,
    accepted: () => accepted,
    setShow(cues) {
      show = cues.map((cue) => ({ ...cue }));
      current = null;
    },
    setShowPath(path) {
      showPath = path;
    },
    showPath: () => showPath,
    holdLabels() {
      labelsHeld = true;
    },
    holdCopies() {
      copiesHeld = true;
    },
    holdFollows() {
      followsHeld = true;
    },
    roundColours() {
      coloursRounded = true;
    },
    holdColours() {
      coloursHeld = true;
    },
    setLevels(levels) {
      own = new Map(Object.entries(levels).map(([cue, channels]) => [cue, new Map(Object.entries(channels).map(([channel, held]) => [Number(channel), { ...held }]))]));
    },
    levels() {
      const channels = [...new Set([...own.values()].flatMap((cue) => [...cue.keys()]))].sort((a, b) => a - b);
      const levelsOf = (cue: string, channel: number): FakeEosLevels => (isDimmer(channel) ? { intensity: tracked(cue, channel).intensity } : tracked(cue, channel));
      return Object.fromEntries(baseCues().map(({ number }) => [number, Object.fromEntries(channels.map((channel) => [channel, levelsOf(number, channel)]))]));
    },
    setRecordConfirm(on) {
      recordConfirm = on;
    },
    rejectCommands(matching = /(?:)/) {
      rejected = new RegExp(matching.source, matching.flags.replace(/[gy]/g, ''));
    },
    editShow(cues, { notify }) {
      const numbers = new Set(baseCues().map((cue) => cue.number));
      show = cues.map((cue) => ({ ...cue })).sort((a, b) => Number(a.number) - Number(b.number));
      const added = baseCues().filter((cue) => !numbers.has(cue.number));
      const removed = [...numbers].filter((number) => !cueOf(number));
      const before = (number: string) => baseCues().filter((cue) => Number(cue.number) < Number(number)).at(-1);
      const gone = current !== null && !cueOf(current);
      const renumbered = gone && added.length === 1 && removed.length === 1;
      const to = renumbered ? added[0] : gone ? before(current!) : added.length === 1 && removed.length === 0 ? added[0] : undefined;
      if (gone) current = null;
      if (to) {
        current = to.number;
        const previous = renumbered ? undefined : before(to.number);
        const packets = [...(previous ? [encode(`/eos/out/previous/cue/1/${previous.number}`, [])] : []), encode(`/eos/out/active/cue/1/${to.number}`, [1.0])];
        for (const socket of sockets) for (const packet of packets) send(socket, packet);
      }
      if (notify === false) return;
      notifyEdit(typeof notify === 'number' && Number.isInteger(notify) ? { int: notify } : notify);
    },
    cues: () => (show ?? RECORDED_SHOW).map((cue) => ({ ...cue })),
    setCommandLine(text) {
      commandLine = text;
    },
    saves: () => saves,
    holdSaves() {
      savesHeld = true;
    },
    holdNotifies() {
      heldNotifies ??= new Map();
    },
    releaseNotifies() {
      const held = heldNotifies;
      heldNotifies = null;
      for (const [socket, packets] of held ?? []) if (sockets.has(socket)) for (const packet of packets) send(socket, packet);
    },
    fireByHand(number) {
      const packets = fired(number, new Map([['6', BY_HAND_6]]));
      if (!packets) throw new Error(`The fake Eos's show has no cue ${number}`);
      for (const socket of sockets) for (const packet of packets) send(socket, packet);
    },
    follow(number) {
      const cue = cueOf(number);
      if (!cue) throw new Error(`The fake Eos's show has no cue ${number}`);
      current = cue.number;
      for (const socket of sockets) answerWith(socket, [fireEvent(cue)]);
    },
    emit(address, args = []) {
      for (const socket of sockets) send(socket, encode(address, args));
    },
    holdReads() {
      heldReads ??= [];
    },
    releaseReads() {
      const held = heldReads;
      heldReads = null;
      for (const { socket, message } of held ?? []) if (sockets.has(socket)) answer(socket, message);
    },
    holdFires() {
      heldFires ??= new Map();
    },
    releaseFires() {
      const held = heldFires;
      heldFires = null;
      for (const [socket, packets] of held ?? []) if (sockets.has(socket)) for (const packet of packets) send(socket, packet);
    },
    silence() {
      silent = true;
    },
    speak() {
      silent = false;
    },
    refuse,
    async accept() {
      if (listening) return;
      await listen(port);
      listening = true;
    },
    close: refuse,
  };
}

// Connections config files for a test's lights on the fake Eos, whose port the OS assigns, so no
// checked-in fixture can hold it. Each file goes in one folder inside the worktree's dist, never the
// OS temp folder, made on the first write.
export type ConnectionsConfigs = {
  // Writes a connections config with these targets, and returns its path.
  write(targets: Record<string, unknown>): Promise<string>;
  // Removes the folder and every file in it. The next write makes a new one.
  remove(): Promise<void>;
};

const REPO_ROOT = resolve(import.meta.dirname, '..');

export function connectionsConfigs(): ConnectionsConfigs {
  let dir: string | undefined;
  return {
    async write(targets) {
      await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
      dir ??= await mkdtemp(join(REPO_ROOT, 'dist/eos-'));
      const path = join(dir, `connections-${Math.random().toString(36).slice(2)}.json`);
      await writeFile(path, JSON.stringify({ targets }));
      return path;
    },
    async remove() {
      if (dir) await rm(dir, { recursive: true, force: true });
      dir = undefined;
    },
  };
}
