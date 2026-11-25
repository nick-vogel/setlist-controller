import { createSocket, type RemoteInfo } from 'node:dgram';
import { STARTUP } from '../shared/abletonosc.ts';
import type { CuePoint } from '../shared/cue-point.ts';
import { decode, encode, type OscMessage, type OscOutArgument } from '../shared/osc.ts';

// A stand-in for Ableton Live with AbletonOSC, for tests and for development before Live is installed.

export type { CuePoint };

export type FakeLiveOptions = {
  cuePoints: CuePoint[];
  host?: string;
  // AbletonOSC listens on 11000. Port 0 lets the OS pick one.
  port?: number;
  // AbletonOSC replies to the sender's IP on port 11001. Without a reply port, the fake Live
  // replies to the port the message came from, so a test needs no fixed port.
  replyPort?: number;
  // The playhead, in beats. Defaults to 0.
  position?: number;
  playing?: boolean;
  // Beats per minute. Defaults to 120.
  tempo?: number;
  // Defaults to 4/4.
  signature?: { numerator: number; denominator: number };
  // 'manual' moves the playhead only on advance(), so tests never wait on real time. 'realtime'
  // moves it with the wall clock, for the standalone fake Live.
  clock?: 'manual' | 'realtime';
  // When set, the playhead goes back to beat 0 once it reaches this beat.
  loopAt?: number;
  // Live's arrangement loop: on or off, and its brace, in beats. Live always has a brace, so it
  // defaults to off from beat 0, 16 beats long.
  loop?: Loop;
  // The tracks in the set, in Live's order, which is the index every track address takes. Defaults
  // to none.
  tracks?: Track[];
  // Announces itself once bound, as AbletonOSC does on load: /live/startup to 127.0.0.1 on the reply
  // port, which it then needs. Defaults to false, so a server learns of the fake Live from its probe.
  startup?: boolean;
};

export type Loop = { on: boolean; start: number; length: number };

// A track as AbletonOSC reports it: its name, whether it sits inside a group, and its mixer volume,
// 0 to 1. A group track itself is not grouped, unless it sits inside another group.
export type Track = { name: string; grouped: boolean; volume: number };

export type FakeLive = {
  port: number;
  // Every OSC message the fake Live has received, in order. A lost one is not among them.
  received: OscMessage[];
  // Every OSC message lost on its way to the fake Live, in order, so a test can tell it was sent.
  lost: OscMessage[];
  // Loses the next message sent to that address, as a lost UDP datagram is: the fake Live never
  // receives it, so it neither acts on it nor records it in received.
  loseNext(address: string): void;
  // Moves the playhead at once. While stopped it moves the start marker too, as a click on Live's
  // timeline does, and leaves the stop point.
  setPosition(beats: number): void;
  // Starts or stops the transport, as the operator does at the laptop. A start plays on from the
  // playhead as last reported, from neither the start marker nor the stop point, so a test can start
  // playback by hand wherever it put the playhead. A stop while playing records the stop point.
  setPlaying(playing: boolean): void;
  setTempo(bpm: number): void;
  setSignature(numerator: number, denominator: number): void;
  // Changes the arrangement loop, as the operator does at the laptop.
  setLoop(loop: Partial<Loop>): void;
  // Replaces the locators, as the operator does at the laptop. Sends nothing: AbletonOSC has no cue
  // point listener, so the server learns of it only when it reads them again.
  setCuePoints(cuePoints: CuePoint[]): void;
  // Moves the playhead by the beats that many milliseconds hold at the current tempo, while playing.
  advance(ms: number): void;
  // Each track's mixer volume now, in track order.
  volumes(): number[];
  // Holds back everything the fake Live sends, replies and listener reports alike, as AbletonOSC's
  // tick and its listener report delay them in Live. The fake Live still receives, records and acts
  // on every message while it holds.
  holdReplies(): void;
  // Sends everything held, in the order it would have gone, and stops holding.
  releaseReplies(): void;
  // Drops every registered listener and sends /live/startup, as AbletonOSC's /live/api/reload does.
  // It goes to the reply port, or with none to whoever sent the most recent message. Throws when the
  // fake Live has neither.
  sendStartup(): void;
  close(): Promise<void>;
};

// The song properties the fake Live reports through start_listen, encoded as AbletonOSC sends them:
// python-osc sends a bool as T or F, an int as int32 and a float as float32.
type Transport = {
  position: number;
  playing: boolean;
  tempo: number;
  numerator: number;
  denominator: number;
  loop: boolean;
  loopStart: number;
  loopLength: number;
};
const PROPERTIES: Record<string, (transport: Transport) => OscOutArgument> = {
  current_song_time: (transport) => transport.position,
  is_playing: (transport) => transport.playing,
  tempo: (transport) => transport.tempo,
  signature_numerator: (transport) => ({ int: transport.numerator }),
  signature_denominator: (transport) => ({ int: transport.denominator }),
  loop: (transport) => transport.loop,
  loop_start: (transport) => transport.loopStart,
  loop_length: (transport) => transport.loopLength,
};

// The track properties the fake Live answers in track_data, as AbletonOSC sends them: python-osc
// sends a string as a string and a bool as T or F.
const TRACK_PROPERTIES: Record<string, (track: Track) => OscOutArgument> = {
  'track.name': (track) => track.name,
  'track.is_grouped': (track) => track.grouped,
};

const REALTIME_TICK_MS = 50;

export function startFakeLive({
  cuePoints: initialCuePoints,
  host = '127.0.0.1',
  port = 0,
  replyPort,
  position = 0,
  playing = false,
  tempo = 120,
  signature = { numerator: 4, denominator: 4 },
  clock = 'manual',
  loopAt,
  loop = { on: false, start: 0, length: 16 },
  tracks: initialTracks = [],
  startup = false,
}: FakeLiveOptions): Promise<FakeLive> {
  if (startup && replyPort === undefined) {
    return Promise.reject(new Error('The fake Live announces startup on its reply port, so it needs one'));
  }
  const socket = createSocket('udp4');
  const received: OscMessage[] = [];
  const lost: OscMessage[] = [];
  // The addresses whose next message is lost.
  const losing = new Set<string>();
  let cuePoints = [...initialCuePoints];
  const tracks = initialTracks.map((track) => ({ ...track }));
  const transport: Transport = {
    position,
    playing,
    tempo,
    ...signature,
    loop: loop.on,
    loopStart: loop.start,
    loopLength: loop.length,
  };
  // Live keeps two positions besides the playhead (setlist-controller#13, Live Lite 12.4.6). The start
  // marker is where start_playing plays from: a jump or a set current_song_time while stopped moves it,
  // and a start while stopped leaves it where that start began. The stop point is where playback last
  // stopped, which continue_playing resumes from whatever moved while stopped. Whether a jump while
  // playing moves the start marker is unconfirmed; here it does not.
  let startMarker = position;
  let stopPoint = position;
  const listening = new Set<string>();
  // AbletonOSC sends listener updates to whoever sent it the most recent message.
  let lastSender: RemoteInfo | undefined;

  // While held, what the fake Live sends waits here, in order.
  let held: { packet: Buffer; port: number; host: string }[] | undefined;
  const send = (host: string, port: number, address: string, args: OscOutArgument[]) => {
    const outgoing = { packet: encode(address, args), port, host };
    if (held) held.push(outgoing);
    else socket.send(outgoing.packet, outgoing.port, outgoing.host);
  };
  const reply = (to: RemoteInfo, address: string, args: OscOutArgument[]) => send(to.address, replyPort ?? to.port, address, args);

  // AbletonOSC sends it to 127.0.0.1 on load, and to the last client's address on a reload, on its
  // reply port either way. A reload clears every listener first.
  const sendStartup = () => {
    const host = lastSender?.address ?? '127.0.0.1';
    const port = replyPort ?? lastSender?.port;
    if (port === undefined) throw new Error('The fake Live has no reply port and has heard from no one, so /live/startup has nowhere to go');
    listening.clear();
    send(host, port, STARTUP, []);
  };

  const report = (property: string) => {
    const value = PROPERTIES[property];
    if (value && lastSender) reply(lastSender, `/live/song/get/${property}`, [value(transport)]);
  };

  // Changes the transport and sends every listened property whose value changed.
  const change = (update: Partial<Transport>) => {
    const before = { ...transport };
    Object.assign(transport, update);
    for (const property of listening) {
      const value = PROPERTIES[property];
      if (value && JSON.stringify(value(before)) !== JSON.stringify(value(transport))) report(property);
    }
  };

  // A jump asked for while playing waits for the next bar line, as Live's 1-bar launch quantization
  // makes it. The bar line is the first one after the playhead at the time of the jump, on a grid of
  // bars from beat 0. A second jump replaces the waiting one.
  let pending: { target: number; barLine: number } | undefined;

  // AbletonOSC jumps to song.cue_points[index] for an int index. Any other argument, a float
  // included, does nothing, and a jump sends no reply.
  const jump = (index: number) => {
    const cuePoint = cuePoints[index];
    if (!cuePoint) return;
    if (!transport.playing) {
      moveWhileStopped(cuePoint.time);
      return;
    }
    // Song time counts quarter notes, so a bar of n/d holds n * 4 / d beats.
    const bar = (transport.numerator * 4) / transport.denominator;
    pending = { target: cuePoint.time, barLine: (Math.floor(transport.position / bar) + 1) * bar };
  };

  // While stopped, the playhead and the start marker move together, and the stop point stays.
  const moveWhileStopped = (beats: number) => {
    startMarker = beats;
    change({ position: beats });
  };

  const setPlaying = (playing: boolean) => {
    // What Live does with a waiting jump on stop is unconfirmed. Dropping it is the stand-in.
    if (!playing) pending = undefined;
    // Only a stop from playing records where it stopped: a stop while stopped would copy a jump target
    // into the stop point, which the trials rule out.
    if (!playing && transport.playing) stopPoint = transport.position;
    change({ playing });
  };

  // Plays from that beat: the playhead moves there first, then the transport starts, so a listener
  // hears the new position before is_playing. A waiting jump is dropped.
  const playFrom = (beats: number) => {
    pending = undefined;
    change({ position: beats });
    if (!transport.playing) setPlaying(true);
  };

  const advance = (ms: number) => {
    if (!transport.playing) return;
    const from = transport.position;
    let next = from + (ms * transport.tempo) / 60000;
    // The arrangement loop wraps a playhead that reaches its end from inside it. One already at or
    // past the end plays on, as in Live.
    const loopEnd = transport.loopStart + transport.loopLength;
    const wraps = transport.loop && transport.loopLength > 0 && from < loopEnd && next >= loopEnd;
    // Either loop ends before the waiting bar line makes the jump at its end. The loopAt loop goes
    // back to beat 0, a bar line.
    let barLine = pending?.barLine;
    if (barLine !== undefined && loopAt !== undefined && next >= loopAt) barLine = Math.min(barLine, loopAt);
    if (barLine !== undefined && wraps) barLine = Math.min(barLine, loopEnd);
    if (pending && barLine !== undefined && next >= barLine) {
      // The playhead lands on the target and carries on by however far it went past the bar line.
      next = pending.target + (next - barLine);
      pending = undefined;
    } else if (wraps) {
      // Back to the loop's start, on by however far it went past the end.
      next = transport.loopStart + ((next - loopEnd) % transport.loopLength);
    }
    change({ position: loopAt !== undefined && next >= loopAt ? 0 : next });
  };

  socket.on('message', (packet, from) => {
    const message = decode(packet);
    if (!message) return;
    if (losing.delete(message.address)) {
      lost.push(message);
      return;
    }
    received.push(message);
    lastSender = from;

    if (message.address === '/live/application/get/version') {
      // Live 12.1, as python-osc sends two Python ints.
      reply(from, message.address, [{ int: 12 }, { int: 1 }]);
    } else if (message.address === '/live/song/get/cue_points') {
      reply(from, message.address, cuePoints.flatMap(({ name, time }) => [name, time]));
    } else if (message.address.startsWith('/live/song/start_listen/')) {
      const property = message.address.slice('/live/song/start_listen/'.length);
      if (Object.hasOwn(PROPERTIES, property)) {
        listening.add(property);
        report(property);
      }
    } else if (message.address === '/live/song/set/loop') {
      // AbletonOSC sets the property to the argument as it comes. Live's loop is a bool, which takes
      // a Python int or bool, so an int32 or a T or F sets it, and a float does nothing.
      const [on] = message.args;
      if (message.types[0] === 'i' || message.types[0] === 'T' || message.types[0] === 'F') change({ loop: !!on });
    } else if (message.address === '/live/song/set/loop_start') {
      const [beats] = message.args;
      if (typeof beats === 'number') change({ loopStart: beats });
    } else if (message.address === '/live/song/set/loop_length') {
      const [beats] = message.args;
      if (typeof beats === 'number') change({ loopLength: beats });
    } else if (message.address === '/live/song/cue_point/jump') {
      const [index] = message.args;
      if (message.types[0] === 'i' && typeof index === 'number') jump(index);
    } else if (message.address === '/live/song/continue_playing') {
      // Resumes from the stop point, whatever moved while stopped, and does nothing while playing.
      // Sends no reply.
      if (!transport.playing) playFrom(stopPoint);
    } else if (message.address === '/live/song/start_playing') {
      // Plays from the start marker, and while playing restarts there at once. Sends no reply.
      playFrom(startMarker);
    } else if (message.address === '/live/song/set/current_song_time') {
      // Moves the playhead at once. While stopped it moves the start marker as a jump does, and while
      // playing it does not wait for the bar line (unconfirmed in Live; the controller never sends it).
      const [beats] = message.args;
      if (typeof beats !== 'number') return;
      if (transport.playing) change({ position: beats });
      else moveWhileStopped(beats);
    } else if (message.address === '/live/song/stop_playing') {
      // Records the stop point, which continue_playing resumes from. Where Live leaves the playhead
      // after a stop is unconfirmed; leaving it where it stopped is the stand-in. Sends no reply.
      setPlaying(false);
    } else if (message.address === '/live/song/get/track_data') {
      // AbletonOSC answers on the same address with one flat list: each track from min up to but not
      // including max, and for each track its value of each property asked for, in order. A max of
      // -1 means every track.
      const [min, max, ...properties] = message.args;
      if (typeof min !== 'number' || typeof max !== 'number') return;
      if (!properties.every((property) => typeof property === 'string' && Object.hasOwn(TRACK_PROPERTIES, property))) return;
      const listed = tracks.slice(Math.trunc(min), max === -1 ? undefined : Math.trunc(max));
      reply(
        from,
        message.address,
        listed.flatMap((track) => properties.map((property) => TRACK_PROPERTIES[property as string]!(track))),
      );
    } else if (message.address === '/live/track/get/volume') {
      // Answers on the same address with the track's index, as python-osc sends a Python int, then
      // its volume. A track that is not in the set gets no answer.
      const [index] = message.args;
      const track = typeof index === 'number' ? tracks[Math.trunc(index)] : undefined;
      if (track) reply(from, message.address, [{ int: Math.trunc(index as number) }, track.volume]);
    } else if (message.address === '/live/track/set/volume') {
      // Sets the track's volume, and sends no reply.
      const [index, volume] = message.args;
      const track = typeof index === 'number' ? tracks[Math.trunc(index)] : undefined;
      if (track && typeof volume === 'number') track.volume = volume;
    }
  });

  let timer: NodeJS.Timeout | undefined;
  const startClock = () => {
    let last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      advance(now - last);
      last = now;
    }, REALTIME_TICK_MS);
  };

  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, host, () => {
      // Bound, so the promise has settled. Report later errors instead of dropping them.
      socket.off('error', reject);
      socket.on('error', (error) => console.error('Fake Live: UDP socket error', error));
      if (clock === 'realtime') startClock();
      if (startup) sendStartup();
      resolve({
        port: socket.address().port,
        received,
        lost,
        loseNext: (address) => {
          losing.add(address);
        },
        setPosition: (beats) => (transport.playing ? change({ position: beats }) : moveWhileStopped(beats)),
        setPlaying,
        setTempo: (bpm) => change({ tempo: bpm }),
        setSignature: (numerator, denominator) => change({ numerator, denominator }),
        setLoop: (update) =>
          change({
            ...(update.on !== undefined && { loop: update.on }),
            ...(update.start !== undefined && { loopStart: update.start }),
            ...(update.length !== undefined && { loopLength: update.length }),
          }),
        setCuePoints: (update) => {
          cuePoints = [...update];
        },
        advance,
        volumes: () => tracks.map((track) => track.volume),
        holdReplies: () => {
          held ??= [];
        },
        releaseReplies: () => {
          const queue = held ?? [];
          held = undefined;
          for (const { packet, port, host } of queue) socket.send(packet, port, host);
        },
        sendStartup,
        close: () =>
          new Promise((resolve) => {
            clearInterval(timer);
            socket.close(() => resolve());
          }),
      });
    });
  });
}
