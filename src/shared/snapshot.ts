import type { PowerState } from './power.ts';

// The state the hub sends to every client, whole, on connect and on every change. Between them the
// hub also sends a heartbeat, which is not a snapshot (see heartbeat.ts). The foot pedal's status is
// the laptop's alone, so it is never in the snapshot.

export type Section = {
  name: string;
  // Times are in beats, as Live reports them.
  time: number;
  // The next locator in the same song, or null when the song has no End.
  end: number | null;
  // The index of the section's locator in the cue point list as Live reported it, before sorting.
  // A jump names its target by this index.
  cue: number;
  // Whether the section is marked to be skipped (+SKIP). Absent on an active section.
  skip?: true;
};

export type Song = {
  number: number;
  title: string | null;
  sections: Section[];
  end: number | null;
  // The End locator's index in the cue point list as Live reported it. Null when the song has no End.
  endCue: number | null;
};

// The name a page shows for a song: its title, or its number when the set gives it none.
export function songTitle(song: Song): string {
  return song.title ?? `Song ${song.number}`;
}

export type SetWarning =
  | { kind: 'unparseable-locator'; locator: string; message: string }
  | { kind: 'missing-end'; song: number; message: string }
  | { kind: 'song-number-gap'; song: number; message: string }
  | { kind: 'repeated-end'; song: number; message: string }
  | { kind: 'section-after-end'; song: number; section: string; message: string }
  | { kind: 'overlapping-songs'; song: number; other: number; message: string };

export type SetList = {
  songs: Song[];
  warnings: SetWarning[];
};

// A section of the set: the song by number, the section by index into the song's sections,
// because a song may repeat a section name.
export type SectionAddress = { song: number; section: number };

// Where a jump goes: a section of the set, or a song's End, which Next goes to from the song's last
// section. End is not a section.
export type JumpTarget = { song: number; section: number | 'end' };

// The section at an address. Undefined when the set has no such song or section, or no set yet, and
// for a song's End, which is not a section.
export function sectionAt(set: SetList | null, address: JumpTarget): Section | undefined {
  if (address.section === 'end') return undefined;
  return set?.songs.find((song) => song.number === address.song)?.sections[address.section];
}

// Whether two addresses name the same section, or the same song's End. False when either is missing.
// A section is never a song's End.
export function sameSection(a: JumpTarget | null | undefined, b: JumpTarget | null | undefined): boolean {
  return !!a && !!b && a.song === b.song && a.section === b.section;
}

// Where the playhead is in the set.
export type NowPlaying = SectionAddress & {
  // The following section in the same song, or the song's end on its last section.
  next: number | 'end';
  // Counted from 1.
  bar: number;
  // The last section of a song with no End counts to the next song's first locator. Null only for the
  // last section of the set's last song with no End, which no later song follows.
  bars: number | null;
  // How far through the section the playhead is, from 0 to 1. Null when bars is null.
  fraction: number | null;
};

// What happens when the playhead reaches a song's End: Live stops, or plays on into the next song.
export type EndToggle = 'stop' | 'continue';
export const END_TOGGLES: readonly EndToggle[] = ['stop', 'continue'];

// Live's arrangement loop while it is on. The brace is in beats. The section is the one whose start
// and end the brace matches, or null for a brace set by hand at the laptop that matches none.
export type Loop = { start: number; length: number; section: SectionAddress | null };

// What the playback controller knows of Live and the leader's choices.
export type PlaybackState = {
  // Whether Live answers the server. Not connected until Live first answers, and again once it
  // stops answering for a few seconds. While not connected, playing, position and now say nothing
  // is known.
  live: 'connected' | 'not-connected';
  // Null until Live has answered with its cue points. Kept while Live is not connected.
  set: SetList | null;
  playing: boolean;
  // In beats. Null until Live reports it.
  position: number | null;
  // Null before the first song, in the gap between two songs, and until the set and position are known.
  now: NowPlaying | null;
  // The jump the leader asked for that Live has not made yet: Live jumps on the next bar line while
  // playing. A section, or a song's End after Next on its last section. Null when no jump waits.
  jump: JumpTarget | null;
  // Whether the waiting jump is a count-in's target: the leader pressed Count in while Live was
  // stopped, Live plays the song's Count Off, and the jump lands where the Count Off ends. False
  // whenever jump is null, and for a tap, Next, Previous or Play from start.
  countIn: boolean;
  // Each song's end toggle, by song number, for every song in the set. Empty until the set is known.
  // A song whose End sits on the next song's first locator starts on "continue", every other song on
  // "stop", and every toggle goes back to that default when a read finds the set changed.
  endToggles: Record<number, EndToggle>;
  // Null while Live's loop is off, and while Live is not connected.
  loop: Loop | null;
};

// Where the leader's fade is: stepping the music out, holding it silent while Live plays on, or
// stepping it back in. Null while no fade has changed any volume.
export type FadePhase = 'out' | 'silent' | 'in';

// What the hub sends to every page: the playback state, the fade's phase, the chart revision and
// each song's starting meter in beats per bar, by song number. The foot pedal's status is not in it;
// the setup screen asks the laptop's server for that (see setup.ts). Nor are the charts, which a
// page fetches from CHARTS_API (routes.ts) when chartRevision changes: the revision rises each time
// the server reads a changed set manifest, from 1 at its start. Each song's meter comes from the
// set manifest's per-song meter, falling back to Live's meter for that song or Live's current time
// signature (4 for 4/4 before Live reports one), so the whole-set timeline draws accurate bar grids
// before Live visits later songs. Empty until the set is known. The power is the playback Mac's, as
// the server last read it, which the leader, producer and setup pages warn on (power.ts).
export type Snapshot = PlaybackState & {
  fade: FadePhase | null;
  chartRevision: number;
  songMeters: Record<number, number>;
  power: PowerState;
};

// Whether the producer has a connection target following the set. Every target starts disarmed on
// every server start. A paused target follows nothing until the producer arms it, or, paused by a
// Fade out, until the music comes back: the next Count Off cue, or the first section's cue of a song
// with no Count Off. Arm moves a disarmed or paused target to armed; Disarm moves any target to
// disarmed.
export type ArmState = 'disarmed' | 'armed' | 'paused';

// Why a target is paused: someone changed it by hand at the target itself, the leader's Fade out
// paused it, since it follows the track timing, or the producer's press moved it onto something that is
// no song of the set, such as ProPresenter's Next slide into Facetime, so no cue lands there.
export type PauseReason = 'by-hand' | 'fade-out' | 'moved';

// One of a target's own manual buttons, which the producer presses on the target's row, such as
// ProPresenter's "Clear slides". The target declares them; the page draws them from the snapshot.
export type ConnectionButton = {
  // What the producer's press names, unique among the target's buttons.
  id: string;
  // What the button shows.
  label: string;
};

// One choice a target offers the producer to pick from, such as one of ProPresenter's playlists.
export type ConnectionChoice = {
  // What the producer's pick names, unique among the target's choices.
  id: string;
  // What the choice shows.
  label: string;
};

// A choice the target asks the producer to make for the set, such as ProPresenter's playlist: what it
// is called, what the target offers, and what is picked now, or null while nothing is. The target
// declares it; the page draws it from the snapshot, as it draws the target's buttons.
export type ConnectionPick = {
  // What the pick is called on the row, such as "Playlist".
  label: string;
  // What the producer can pick, in the target's order.
  options: ConnectionChoice[];
  picked: ConnectionChoice | null;
};

// One connection target on the producer's Connections panel, such as ProPresenter. Only the producer
// page sees it. The list holds one row per target the server was started with, in that order, the
// targets the connections config file disabled included.
export type Connection = {
  // The target's key in the config, such as "propresenter".
  name: string;
  // What the panel shows for it, such as "ProPresenter".
  label: string;
  // False for a target whose section in the connections config file was rejected, or whose kind the
  // server does not know. Such a target never starts, so it stays offline and disarmed.
  configured: boolean;
  // What is wrong with the target, as sentences for the panels: its section's problems when not
  // configured, or else the problem the target last reported reaching it, such as a connect that
  // failed, whatever its status. Empty when there is none.
  problems: string[];
  // Whether the target can be reached, as it last reported. Offline until it first reports.
  connection: 'online' | 'offline';
  arm: ArmState;
  // Why the target is paused. Null unless arm is paused.
  pause: PauseReason | null;
  // What the producer's press moved the target onto, such as "Facetime", while pause is moved. Null
  // otherwise.
  movedTo: string | null;
  // The target's last pre-service check against the set. Not checked while it is offline.
  check: PreServiceCheck;
  // The target's own manual buttons, in the order it declares them. None for a disabled target.
  buttons: ConnectionButton[];
  // The choice the target last reported asking the producer to make, such as its playlist, kept
  // while it is offline. Null for a target that offers none, and for a disabled target.
  pick: ConnectionPick | null;
  // What the target last reported to show read-only on its row, such as its live cue, always shown
  // in full. None while offline, and for a disabled target.
  state: string[];
  // A read-only list the target last reported to show under state, such as its cue list, which the
  // row caps in height and scrolls. None while offline, and for a disabled target.
  list: string[];
  // The index in list of the line the target marks, such as its live cue's, which the row marks and
  // scrolls its list to. Null while offline, for a disabled target, and when the target marks none.
  listCurrent: number | null;
  // How late the cues reach the target, in milliseconds (connections.ts).
  lateness: ConnectionLateness;
};

// How late the cues reach a target, in milliseconds: the time the server handed the target a cue
// minus the time the cue's beat was due, for the last cue and as the median of the last 50, by
// nearest rank, as `pnpm lateness` takes it, and the same for the time the target reports it acted
// on the cue, for a target that reports it. Each is null before the first cue it counts, and every
// one is null for a disabled target. Fire again is never measured, since it has no beat it is due on.
export type ConnectionLateness = {
  last: number | null;
  median: number | null;
  acted: number | null;
  actedMedian: number | null;
};

// What a target's pre-service check found: every song and section in the set matches its own file
// with nothing else wrong with that file, or not. When not, names holds the songs and sections it
// cannot match, and problems what keeps it from checking them or is otherwise wrong with its file that
// is not a failed match, such as no playlist picked, a cue that never fires or a cue list that is not
// there, each in set order as the target words it; at least one of the two is not empty, and names is
// empty when the only thing wrong is with the file. Either way it carries its notes: what a matched
// file does that the producer may want to know but need not fix, such as a section with no group of
// its name that shows slide 1, in set order as the target words them, empty when there are none. A
// check with notes and no name or problem is matched. A matched check carries its pass text, the line
// the page shows when it passes, as its target words it, such as "Every song and section matches.".
// A target that matches no names checks its own
// device instead, such as the ATEM's inputs, and reports what is wrong with it (problems) and what it
// found (notes), as the target words them. Not checked until a check against a known set answers, and
// again once the target goes offline, or when the check fails.
export type PreServiceCheck =
  | { kind: 'not-checked' }
  | { kind: 'matched'; passText: string; notes: string[] }
  | { kind: 'unmatched'; names: string[]; problems: string[]; notes: string[] }
  | { kind: 'device'; problems: string[]; notes: string[] };

// What the hub sends the producer page: the playback snapshot plus the connections part. Viewers and
// leaders get the playback snapshot alone.
export type ProducerSnapshot = Snapshot & {
  connections: Connection[];
  // The connections config file's own problems, such as a file that is not JSON. Each one means no
  // target started. Empty when the file loaded or there is none.
  connectionProblems: string[];
};

// The part of the producer's snapshot that the playback snapshot does not hold.
export type ConnectionsPart = Omit<ProducerSnapshot, keyof Snapshot>;
