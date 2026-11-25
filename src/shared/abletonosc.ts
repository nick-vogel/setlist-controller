import type { OscOutArgument } from './osc.ts';

// The AbletonOSC messages the controller sends, in one place, so the bridge and the contract check
// send the same thing and a fix to an address fixes both.
// https://github.com/ideoforms/AbletonOSC/tree/0ca68214bd62c9b5cb641ca34006cfd70ba94430

export type OutMessage = { address: string; args: OscOutArgument[] };

// The song properties the controller listens to, in the order it registers them. The brace
// registers before the loop, so its first reports come first, and a loop that is on never shows
// with a brace Live has not reported yet.
export const LISTENED_PROPERTIES = [
  'current_song_time',
  'is_playing',
  'tempo',
  'signature_numerator',
  'signature_denominator',
  'loop_start',
  'loop_length',
  'loop',
] as const;

export type ListenedProperty = (typeof LISTENED_PROPERTIES)[number];

// AbletonOSC answers start_listen, and every change after, on `/live/song/get/<property>`.
export const LISTEN_REPLY_PREFIX = '/live/song/get/';

// The address a listened property's reports come in on.
export const listenReply = (property: ListenedProperty) => `${LISTEN_REPLY_PREFIX}${property}`;

export const CUE_POINTS = '/live/song/get/cue_points';

// The probe that tells the controller Live is there. AbletonOSC answers it with no side effect in
// Live, where /live/test shows a message in Live's status bar on every call.
export const PROBE = '/live/application/get/version';

export const probe = (): OutMessage => ({ address: PROBE, args: [] });

// AbletonOSC sends this, with no arguments, each time it loads (abletonosc/application.py), and again
// on /live/api/reload, which first drops every listener. Live sends it; the controller never does.
export const STARTUP = '/live/startup';

export const getCuePoints = (): OutMessage => ({ address: CUE_POINTS, args: [] });

export const startListen = (property: ListenedProperty): OutMessage => ({
  address: `/live/song/start_listen/${property}`,
  args: [],
});

// AbletonOSC jumps only for an int index (or a name); a float does nothing, so the index goes out as
// int32. Live makes the jump on the next bar line while playing and at once while stopped, and sends
// no reply.
export const jump = (cue: number): OutMessage => ({ address: '/live/song/cue_point/jump', args: [{ int: cue }] });

// Live keeps two positions while stopped (setlist-controller#13, Live Lite 12.4.6). continue_playing
// resumes from where playback last stopped, and ignores a jump or a playhead move made while stopped.
// start_playing plays from the start marker, which a jump while stopped moves. None of the three
// transport messages takes arguments, and none sends a reply.
export const continuePlaying = (): OutMessage => ({ address: '/live/song/continue_playing', args: [] });

export const startPlaying = (): OutMessage => ({ address: '/live/song/start_playing', args: [] });

export const stopPlaying = (): OutMessage => ({ address: '/live/song/stop_playing', args: [] });

// AbletonOSC sets each property to its argument as python-osc decodes it. The brace takes floats in
// beats. Live's loop is a bool, which takes a Python int but not a float, so 1 and 0 go out as
// int32. The brace goes first, so the loop never turns on over the old one.
export const loopOn = (start: number, length: number): OutMessage[] => [...loopBrace(start, length), { address: '/live/song/set/loop', args: [{ int: 1 }] }];

// Moves the brace and leaves the loop on or off as it is.
export const loopBrace = (start: number, length: number): OutMessage[] => [
  { address: '/live/song/set/loop_start', args: [start] },
  { address: '/live/song/set/loop_length', args: [length] },
];

export const loopOff = (): OutMessage => ({ address: '/live/song/set/loop', args: [{ int: 0 }] });

// The track list: each track's name and whether it sits inside a group, for every track (a max of
// -1). AbletonOSC answers on this address with one flat list, name then is_grouped (T or F) for each
// track in Live's order, which is the index every track address takes. The list holds group tracks
// and the tracks inside them, never the returns or the master.
export const TRACK_DATA = '/live/song/get/track_data';

export const getTrackData = (): OutMessage => ({
  address: TRACK_DATA,
  args: [{ int: 0 }, { int: -1 }, 'track.name', 'track.is_grouped'],
});

// A track's mixer volume, 0 to 1. AbletonOSC answers on this address with the track's index (an int)
// and its volume. Its `*` index answers only the first track at the pinned commit, so the volume is
// read one track at a time.
export const TRACK_VOLUME = '/live/track/get/volume';

export const getTrackVolume = (track: number): OutMessage => ({ address: TRACK_VOLUME, args: [{ int: track }] });

// Sets a track's mixer volume, and sends no reply. AbletonOSC has no master volume and no ramp, so a
// fade is a run of these.
export const setTrackVolume = (track: number, volume: number): OutMessage => ({
  address: '/live/track/set/volume',
  args: [{ int: track }, volume],
});
