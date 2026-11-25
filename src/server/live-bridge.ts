import { createSocket } from 'node:dgram';
import * as abletonosc from '../shared/abletonosc.ts';
import {
  CUE_POINTS,
  LISTEN_REPLY_PREFIX,
  LISTENED_PROPERTIES,
  STARTUP,
  TRACK_DATA,
  TRACK_VOLUME,
  type ListenedProperty,
  type OutMessage,
} from '../shared/abletonosc.ts';
import type { CuePoint } from '../shared/cue-point.ts';
import { decode, encode, type OscArgument } from '../shared/osc.ts';
import type { Clock } from './clock.ts';

// The server is the only OSC client of Live. One UDP socket sends to AbletonOSC and receives its
// replies, so the port the server sends from is the port Live replies to.

// What Live reports, decoded. Times are in beats. A connection event is the bridge's own: Live has
// started answering, or has stopped.
export type LiveEvent =
  | { kind: 'connection'; connected: boolean }
  // AbletonOSC loaded or reloaded while the bridge already counted Live connected: every listener is
  // gone, and the set may have changed. The bridge has registered the listeners again.
  | { kind: 'startup' }
  | { kind: 'cue-points'; cuePoints: CuePoint[] }
  | { kind: 'position'; beats: number }
  | { kind: 'playing'; playing: boolean }
  | { kind: 'tempo'; bpm: number }
  | { kind: 'signature-numerator'; numerator: number }
  | { kind: 'signature-denominator'; denominator: number }
  | { kind: 'loop'; on: boolean }
  | { kind: 'loop-start'; beats: number }
  | { kind: 'loop-length'; beats: number }
  // The answer to a track list read. Each track keeps its index in Live's list, which every track
  // address takes.
  | { kind: 'track-data'; tracks: TrackInfo[] }
  // The answer to a track volume read: the mixer volume, 0 to 1.
  | { kind: 'track-volume'; track: number; volume: number };

// A track in Live's list: its name, and whether it sits inside a group. A group track itself is not
// grouped, unless it sits inside another group.
export type TrackInfo = { track: number; name: string; grouped: boolean };

export type LiveBridgeOptions = {
  // AbletonOSC listens on this port.
  sendPort: number;
  // AbletonOSC replies on this port. Port 0 lets the OS pick one.
  receivePort: number;
  clock: Clock;
  onLiveEvent(event: LiveEvent): void;
};

export type LiveBridge = {
  // The port the bridge receives on, the one the OS picked for port 0.
  receivePort: number;
  requestCuePoints(): void;
  // Jumps to the cue point at that index in the list Live reports. Live makes the jump on the next
  // bar line while playing and at once while stopped, and sends no reply.
  jump(cue: number): void;
  // Resumes from where playback last stopped, and ignores a jump or a playhead move made while
  // stopped. Does nothing while playing.
  continuePlaying(): void;
  // Plays from the start marker, which a jump while stopped moves. While playing it restarts there.
  startPlaying(): void;
  stopPlaying(): void;
  // Braces the arrangement loop from start for length beats, then turns it on. Live sends no reply;
  // the loop listeners report the change.
  loopOn(start: number, length: number): void;
  loopOff(): void;
  // Asks Live for its track list, which comes back as a track-data event.
  requestTrackData(): void;
  // Asks Live for a track's volume, which comes back as a track-volume event.
  requestTrackVolume(track: number): void;
  // Sets a track's volume, 0 to 1. Live sends no reply.
  setTrackVolume(track: number, volume: number): void;
  close(): Promise<void>;
};

const HOST = '127.0.0.1';

// The bridge asks Live for its version to learn that Live is there.
export const PROBE_INTERVAL_MS = 1000;
// This many probes in a row with no word from Live, a second apart, mean Live is gone: at least 3
// seconds of silence, and it allows two lost datagrams. The bridge counts probes instead of timing
// the silence, because after an event loop stall the late tick runs before the replies waiting on
// the socket are read; it is still only one tick, so a stalled server never takes its own deafness
// for Live's silence.
const LOST_AFTER_PROBES = 3;
// The longest Live can have been silent when the bridge reports it lost: 3 to 4 seconds. Live's last
// word comes at most one interval before the first probe it leaves unanswered, and the report comes
// LOST_AFTER_PROBES intervals after that probe.
export const SILENT_BEFORE_LOST_MS = (LOST_AFTER_PROBES + 1) * PROBE_INTERVAL_MS;

// AbletonOSC answers start_listen on `/live/song/get/<property>`, with the value as the only argument.
// A value of the wrong type yields null, and the bridge drops it.
const LISTENED: Record<ListenedProperty, (value: OscArgument | undefined) => LiveEvent | null> = {
  current_song_time: (value) => (typeof value === 'number' ? { kind: 'position', beats: value } : null),
  is_playing: (value) => (typeof value === 'boolean' ? { kind: 'playing', playing: value } : null),
  tempo: (value) => (typeof value === 'number' ? { kind: 'tempo', bpm: value } : null),
  signature_numerator: (value) =>
    typeof value === 'number' ? { kind: 'signature-numerator', numerator: value } : null,
  signature_denominator: (value) =>
    typeof value === 'number' ? { kind: 'signature-denominator', denominator: value } : null,
  loop_start: (value) => (typeof value === 'number' ? { kind: 'loop-start', beats: value } : null),
  loop_length: (value) => (typeof value === 'number' ? { kind: 'loop-length', beats: value } : null),
  // Live's loop is a bool, which python-osc sends as T or F.
  loop: (value) => (typeof value === 'boolean' ? { kind: 'loop', on: value } : null),
};

export function startLiveBridge({ sendPort, receivePort, clock, onLiveEvent }: LiveBridgeOptions): Promise<LiveBridge> {
  const socket = createSocket('udp4');
  const send = ({ address, args }: OutMessage) => socket.send(encode(address, args), sendPort, HOST);

  // Any message from Live counts as hearing from it, and answers every probe sent before it.
  let connected = false;
  let unanswered = 0;

  // A Live that starts, or restarts, has no listeners, so the bridge registers them each time Live
  // connects, and again each time AbletonOSC announces it has loaded. Each one reports its value at
  // once and on every change after.
  const listen = () => {
    for (const property of LISTENED_PROPERTIES) send(abletonosc.startListen(property));
  };

  const probe = () => {
    if (connected && unanswered >= LOST_AFTER_PROBES) {
      connected = false;
      onLiveEvent({ kind: 'connection', connected: false });
    }
    send(abletonosc.probe());
    unanswered += 1;
  };

  socket.on('message', (packet) => {
    const message = decode(packet);
    if (!message) return;
    unanswered = 0;
    const wasConnected = connected;
    if (!connected) {
      connected = true;
      // The listeners register before anyone hears of the connection, so their first reports, Live
      // playing or not among them, come back ahead of the answer to any read sent on connecting.
      listen();
      onLiveEvent({ kind: 'connection', connected: true });
    }
    // A restart or a reload quicker than LOST_AFTER_PROBES probes leaves no silence to notice, and
    // drops every listener. When this is Live's first word, the connect above has registered them.
    if (message.address === STARTUP) {
      if (wasConnected) {
        listen();
        onLiveEvent({ kind: 'startup' });
      }
      return;
    }
    if (message.address === CUE_POINTS) {
      onLiveEvent({ kind: 'cue-points', cuePoints: toCuePoints(message.args) });
      return;
    }
    // Before the listened properties, whose replies share the `/live/song/get/` start.
    if (message.address === TRACK_DATA) {
      onLiveEvent({ kind: 'track-data', tracks: toTracks(message.args) });
      return;
    }
    if (message.address === TRACK_VOLUME) {
      const [track, volume] = message.args;
      if (Number.isInteger(track) && typeof volume === 'number') onLiveEvent({ kind: 'track-volume', track: track as number, volume });
      return;
    }
    const property = message.address.startsWith(LISTEN_REPLY_PREFIX) && message.address.slice(LISTEN_REPLY_PREFIX.length);
    const event = property && isListened(property) ? LISTENED[property](message.args[0]) : null;
    if (event) onLiveEvent(event);
  });

  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(receivePort, HOST, () => {
      // Bound, so the promise has settled. Report later errors instead of dropping them.
      socket.off('error', reject);
      socket.on('error', (error) => console.error('Live bridge: UDP socket error', error));
      probe();
      const stopProbing = clock.every(PROBE_INTERVAL_MS, probe);
      resolve({
        receivePort: socket.address().port,
        requestCuePoints: () => send(abletonosc.getCuePoints()),
        jump: (cue) => send(abletonosc.jump(cue)),
        continuePlaying: () => send(abletonosc.continuePlaying()),
        startPlaying: () => send(abletonosc.startPlaying()),
        stopPlaying: () => send(abletonosc.stopPlaying()),
        loopOn: (start, length) => {
          for (const message of abletonosc.loopOn(start, length)) send(message);
        },
        loopOff: () => send(abletonosc.loopOff()),
        requestTrackData: () => send(abletonosc.getTrackData()),
        requestTrackVolume: (track) => send(abletonosc.getTrackVolume(track)),
        setTrackVolume: (track, volume) => send(abletonosc.setTrackVolume(track, volume)),
        // The probe stops first: a probe sent on a closed socket throws.
        close: () =>
          new Promise((resolve) => {
            stopProbing();
            socket.close(() => resolve());
          }),
      });
    });
  });
}

function isListened(property: string): property is ListenedProperty {
  return Object.hasOwn(LISTENED, property);
}

// The reply is a flat list: name, time in beats, repeated.
function toCuePoints(args: OscArgument[]): CuePoint[] {
  const cuePoints: CuePoint[] = [];
  for (let index = 0; index + 1 < args.length; index += 2) {
    const [name, time] = [args[index], args[index + 1]];
    if (typeof name === 'string' && typeof time === 'number') cuePoints.push({ name, time });
  }
  return cuePoints;
}

// The reply is a flat list: name, is_grouped, repeated, one pair per track from index 0. A malformed
// pair is dropped, and the tracks after it keep their own indexes.
function toTracks(args: OscArgument[]): TrackInfo[] {
  const tracks: TrackInfo[] = [];
  for (let index = 0; index + 1 < args.length; index += 2) {
    const [name, grouped] = [args[index], args[index + 1]];
    if (typeof name === 'string' && typeof grouped === 'boolean') tracks.push({ track: index / 2, name, grouped });
  }
  return tracks;
}
