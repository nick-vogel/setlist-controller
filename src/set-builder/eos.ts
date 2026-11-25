import { createConnection } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { frame, packetReader } from '../server/osc-tcp.ts';
import { decode, encode, type OscMessage, type OscOutArgument } from '../shared/osc.ts';

// The lights mode's conversation with Eos, over OSC on TCP with the server's own framing (src/server/osc-tcp.ts): one
// connection for one run, closed at its end. It reads the show path and the cue list, with each cue's link, follow and
// hang, sets a cue's label, copies a cue onto a new number, takes a follow or a hang off a cue, and for a song's colour
// goes to a cue, reads and sets a channel's colour and records it into the cue. It never sets an intensity. What Eos
// answers, and how, is as recorded on Eos 3.3.10 (test/fixtures/eos/README.md, "The lights step on the church show,
// 2026-11-12" and "A song cue with a follow or a hang, 2026-11-13").

// Eos's OSC TCP port when the connections config leaves it out, as the server takes it.
export const EOS_PORT = 3032;

export type EosAddress = { host: string; port: number };

// How long the mode waits: for Eos's command line after the connect and for the answer to each read and each command
// line command, for the saved event after a save, and after a Go To Cue before it reads or sets a channel.
export type EosLimits = { answerMs: number; savedMs: number; settleMs: number };
// 3 seconds for an answer, the server's own limit for a connect, 10 for the saved event, the wait the recordings were
// made with, and 1 after a Go To Cue: every recording read a cue's levels 1 second after it went to the cue.
export const EOS_LIMITS: EosLimits = { answerMs: 3000, savedMs: 10_000, settleMs: 1000 };

// Eos did not answer within the limit: a connect that was refused or never finished, a connect with no command line
// after it, or a read or a command line command with no reply.
export class EosSilent extends Error {}

// Eos rejected a command line command: the command as sent, and the command line as Eos then read, such as one that
// ends " - Error: Syntax Error".
export class EosRejected extends Error {
  readonly command: string;
  readonly line: string;
  constructor(command: string, line: string) {
    super(`Eos rejected the command "${command}", and its command line reads "${line}"`);
    this.command = command;
    this.line = line;
  }
}

// The command line did not read LIVE when a command line command was due, so the command was not sent: the line as it
// read.
export class EosNotLive extends Error {
  readonly line: string;
  constructor(line: string) {
    super(`the command line in Eos does not read LIVE, it reads "${line}"`);
    this.line = line;
  }
}

// A colour as Eos holds it for a channel: red, green and blue, each from 0 to 100.
export type EosColour = [number, number, number];

export type Eos = {
  // The command line as Eos last sent it, /eos/out/cmd: the connect burst's at first, then each change of it.
  commandLine(): string;
  // The path of the show file that is open, /eos/get/show/path. The show's name does not say it: a show opened from a
  // copy keeps the name it was last saved under until it is saved again.
  showPath(): Promise<string>;
  // The cues of a cue list, in list order, read as the server's lights read it: the count, then each cue by its index.
  // A part of a multipart cue has an index of its own and is no cue here. Each cue comes with its link and with whether
  // it has a follow and a hang, from the same reply.
  cues(list: number): Promise<EosCue[]>;
  // Sets a cue's label, /eos/set/cue/<list>/<cue>/label. Eos gives it no direct answer, so the caller reads the cue
  // again to see the label in the show.
  setLabel(list: number, cue: string, label: string): void;
  // Copies a cue onto a number no cue of the list has, with Copy To, on the command line. Eos makes the new cue with no
  // confirmation, and the command is done when the command line ends " #". It never gets an Enter: a Copy To that asked
  // for one would be doing something else, most likely onto a cue that exists, which an Enter would overwrite, so any
  // other answer is a command Eos rejected.
  copyCue(list: number, from: string, to: string): Promise<void>;
  // Takes the follow or the hang off a cue, with Follow or Hang and no time, on the command line, as recorded
  // (chain-follow-cleared.json, chain-hang-cleared.json). The command is done when the command line ends " #", and the
  // caller reads the cue list again to see the time gone. The cue keeps its link: no recording holds a command that
  // takes one off.
  takeOff(list: number, cue: string, time: EosTime): Promise<void>;
  // Goes to a cue in no time, on the command line, then waits the settle time, so the live levels are the cue's. Eos
  // sends the cue's fire event, as for a Go, and every colour set by hand is gone.
  goToCue(list: number, cue: string): Promise<void>;
  // A channel's live levels, /eos/get/params/<chan>: its intensity, and its colour as its Red, Green and Blue
  // parameters give it, undefined for a channel with none of the three, such as a dimmer. Hue and Saturation read 0
  // whatever the colour, and are not read.
  channel(channel: number): Promise<{ intensity: number | undefined; colour: EosColour | undefined }>;
  // Sets a channel's live colour through the parameter address, /eos/chan/<chan>/param/red/green/blue, which gives
  // back exactly the floats sent. The colour addresses go through Eos's own colour space and do not. Eos gives the set
  // no answer, so the caller reads the channel again to see the colour live.
  setColour(channel: number, colour: EosColour): void;
  // Records those channels, and nothing else, into a cue with Record Only, on the command line, confirming when Eos
  // asks: with Record Confirm on the command line first ends "Please Confirm", and an Enter records.
  recordOnly(channels: number[], list: number, cue: string): Promise<void>;
  // Saves the show as the keypad does, Update pressed while Shift is held, the four key messages half a second apart
  // as recorded, and waits for Eos's saved event. Shift and Update are released on every path, before the wait. True
  // once Eos said it saved; false when no saved event came within the limit. The saved event's path is no file on
  // disk, so the caller reads the show path again for the file the save made.
  save(): Promise<boolean>;
  close(): void;
};

// A cue of a cue list: its number as Eos writes it, such as "22" or "3.5", its label, "" for none, its link, and
// whether it has a follow time and a hang time. A cue with a follow or a hang runs on: Eos fires the cue its link
// names after it, or with no link the next cue of the list, by itself. A cue with neither fires nothing by itself,
// whatever its link (test/fixtures/eos/README.md, "Follows and links, 2026-10-24").
export type EosCue = { number: string; label: string; link: EosLink; follow: boolean; hang: boolean };

// A cue's link: the number of the cue of the same list it names, as Eos writes a cue number; a link that names no cue
// of the list, one to a cue of another list or one that cannot be read, as Eos gave it; or null for none.
export type EosLink = { cue: string } | { outside: string } | null;

// The two times that make a cue run on, as the command line names them.
export type EosTime = 'Follow' | 'Hang';

const COMMAND_LINE = '/eos/out/cmd';
const SAVED = '/eos/out/event/show/saved';
// The gap between the key messages of a save, as the recording of the one save over OSC on record had them.
const KEY_GAP_MS = 500;

// Connects to Eos, and waits for its command line, which ends what it sends on a connect. Throws EosSilent when none
// comes within the limit.
export async function connectEos({ host, port }: EosAddress, limits: EosLimits): Promise<Eos> {
  const socket = createConnection({ host, port });
  const reader = packetReader();
  let open = true;
  let commandLine = '';
  // Whether Eos has sent a saved event since the last save began.
  let saved = false;
  // Each wait in flight takes every message that comes, and null once the connection is gone.
  const waiting = new Set<(message: OscMessage | null) => void>();

  // The first of the messages to come that `pick` gives a value for, as that value, or undefined when none comes within
  // `ms`, or the connection closes first.
  const awaitMessage = <T>(pick: (message: OscMessage) => T | undefined, ms: number): Promise<T | undefined> =>
    new Promise((resolve) => {
      if (!open) return resolve(undefined);
      const done = (value: T | undefined) => {
        clearTimeout(timer);
        waiting.delete(take);
        resolve(value);
      };
      const take = (message: OscMessage | null) => {
        const picked = message === null ? undefined : pick(message);
        if (message === null || picked !== undefined) done(picked);
      };
      const timer = setTimeout(() => done(undefined), ms);
      waiting.add(take);
    });

  socket.on('data', (chunk: Buffer) => {
    for (const packet of reader.push(chunk)) {
      const message = decode(packet);
      if (!message) continue;
      if (message.address === COMMAND_LINE && typeof message.args[0] === 'string') commandLine = message.args[0];
      if (message.address === SAVED) saved = true;
      for (const take of [...waiting]) take(message);
    }
  });
  const gone = () => {
    open = false;
    for (const take of [...waiting]) take(null);
  };
  socket.on('error', gone);
  socket.on('close', gone);

  const send = (address: string, args: OscOutArgument[] = []) => {
    if (open) socket.write(frame(encode(address, args)));
  };
  const close = () => {
    socket.destroy();
  };

  if ((await awaitMessage((message) => (message.address === COMMAND_LINE ? true : undefined), limits.answerMs)) === undefined) {
    close();
    throw new EosSilent();
  }
  // Sends a read, and gives the first reply `pick` gives a value for. Throws EosSilent when none comes within the limit.
  const ask = async <T>(address: string, args: OscOutArgument[], pick: (message: OscMessage) => T | undefined): Promise<T> => {
    const answer = awaitMessage(pick, limits.answerMs);
    send(address, args);
    const picked = await answer;
    if (picked === undefined) throw new EosSilent();
    return picked;
  };

  // The command line as Eos sends it after a command.
  const lineRead = ({ address, args: [line] }: OscMessage) => (address === COMMAND_LINE && typeof line === 'string' ? line : undefined);
  // A command on the OSC user's command line, sent only while the command line reads LIVE. Its answer is the first
  // command line Eos sends after it: ending " #", the command is done; anything else, such as a line with an error, is
  // a command Eos rejected. Only with `confirm`, which a Record Only alone gives, a line ending "Please Confirm" gets an
  // Enter, and the next line must end " #".
  const command = async (text: string, { confirm = false }: { confirm?: boolean } = {}): Promise<void> => {
    if (!commandLine.startsWith('LIVE')) throw new EosNotLive(commandLine);
    let line = await ask('/eos/newcmd', [text], lineRead);
    if (confirm && line.endsWith('Please Confirm')) line = await ask('/eos/cmd', ['Enter'], lineRead);
    if (!line.endsWith(' #')) throw new EosRejected(text, line);
  };

  return {
    commandLine: () => commandLine,
    showPath: () => ask('/eos/get/show/path', [], ({ address, args: [path] }) => (address === '/eos/out/get/show/path' && typeof path === 'string' ? path : undefined)),
    async cues(list) {
      const count = await ask(`/eos/get/cue/${list}/count`, [], ({ address, args: [count] }) =>
        address === `/eos/out/get/cue/${list}/count` && typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : undefined,
      );
      // The reply that lists a cue names its number and its part in its address, and carries the index read as argument
      // 0, the label as argument 2, and the link, the follow time and the hang time as arguments 19 to 21.
      const listed = new RegExp(`^/eos/out/get/cue/${list}/([^/]+)/(\\d+)/list/0/\\d+$`);
      const cues: EosCue[] = [];
      for (let index = 0; index < count; index += 1) {
        const cue = await ask(`/eos/get/cue/${list}/index`, [{ int: index }], ({ address, args }) => {
          const match = listed.exec(address);
          const [at, , label] = args;
          if (!match || at !== index || typeof label !== 'string') return undefined;
          return { number: match[1]!, part: Number(match[2]), label, link: linkOf(args[19], list), follow: timed(args[20]), hang: timed(args[21]) };
        });
        if (cue.part === 0) cues.push({ number: cue.number, label: cue.label, link: cue.link, follow: cue.follow, hang: cue.hang });
      }
      return cues;
    },
    setLabel(list, cue, label) {
      send(`/eos/set/cue/${list}/${cue}/label`, [label]);
    },
    copyCue: (list, from, to) => command(`Cue ${list} / ${from} Copy_To Cue ${list} / ${to}#`),
    takeOff: (list, cue, time) => command(`Cue ${list} / ${cue} ${time}#`),
    async goToCue(list, cue) {
      await command(`Go_To_Cue ${list} / ${cue} Time 0#`);
      await wait(limits.settleMs);
    },
    channel: (channel) =>
      ask(`/eos/get/params/${channel}`, [], ({ address, args }) => {
        if (address !== `/eos/out/get/params/${channel}`) return undefined;
        // After the fixture's maker and model, each parameter is four arguments: its name, its level, its min and max.
        const levels = new Map<string, number>();
        for (let at = 2; at + 1 < args.length; at += 4) {
          const [name, level] = [args[at], args[at + 1]];
          if (typeof name === 'string' && typeof level === 'number') levels.set(name, level);
        }
        const [red, green, blue] = [levels.get('Red'), levels.get('Green'), levels.get('Blue')];
        return { intensity: levels.get('Intens'), colour: red === undefined || green === undefined || blue === undefined ? undefined : ([red, green, blue] as EosColour) };
      }),
    setColour(channel, colour) {
      send(`/eos/chan/${channel}/param/red/green/blue`, colour);
    },
    recordOnly: (channels, list, cue) => command(`Chan ${channelText(channels)} Record_Only Cue ${list} / ${cue}#`, { confirm: true }),
    async save() {
      saved = false;
      try {
        send('/eos/key/shift', [1.0]);
        await wait(KEY_GAP_MS);
        send('/eos/key/update', [1.0]);
        await wait(KEY_GAP_MS);
      } finally {
        send('/eos/key/update', [0.0]);
        await wait(KEY_GAP_MS);
        send('/eos/key/shift', [0.0]);
      }
      // The event comes a tenth of a second after Update goes down, so it is here before the keys are released.
      return saved || (await awaitMessage((message) => (message.address === SAVED ? true : undefined), limits.savedMs)) === true;
    },
    close,
  };
}

// Whether a follow time or a hang time, argument 20 or 21 of a cue's list reply, is one: milliseconds from 0 up, where
// Eos gives -1 for none.
function timed(time: unknown): boolean {
  return typeof time === 'number' && time >= 0;
}

// A cue's link, from argument 19 of its list reply, by the rule the server's lights read it by (linkOf in
// src/server/eos.ts, which this does not import: the server's Eos target is not the set builder's to change). A link in
// the same list is the target cue's number, 0 for none, recorded as an int, and a float is read to three places, as
// Eos numbers a cue. A link to a cue in another list is a string, "99/1" for cue 1 of list 99
// (link-to-another-list.json). A string whose list is this one names that cue of it; any other string names no cue of
// this list. Anything else is none.
function linkOf(link: unknown, list: number): EosLink {
  const cueOf = (number: number): EosLink => ({ cue: String(Number(number.toFixed(3))) });
  if (typeof link === 'number') return link === 0 ? null : cueOf(link);
  if (typeof link !== 'string') return null;
  const at = link.indexOf('/');
  const cue = at < 0 ? NaN : Number(link.slice(at + 1));
  if (at >= 0 && Number(link.slice(0, at)) === list && Number.isFinite(cue) && cue > 0) return cueOf(cue);
  return { outside: link };
}

// Channels as the command line names them, in number order: each run of two or more as "<first> Thru <last>", a channel
// alone as its number, joined by " + ", so 1, 2, 3, 16, 17 and 18 read "1 Thru 3 + 16 Thru 18", as recorded.
function channelText(channels: number[]): string {
  const runs: [number, number][] = [];
  for (const channel of [...channels].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && channel === last[1] + 1) last[1] = channel;
    else runs.push([channel, channel]);
  }
  return runs.map(([first, last]) => (first === last ? String(first) : `${first} Thru ${last}`)).join(' + ');
}
