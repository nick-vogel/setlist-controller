import type { ConnectionButton, ConnectionPick, SetList } from '../shared/snapshot.ts';
import type { Cue } from './cues.ts';

// A connection target, such as ProPresenter: something outside the band's pages that follows the
// set, cue by cue, while the producer has it armed. The server takes a list of them at start, as it
// takes the foot pedal's MIDI input. Production passes none yet; tests pass a fake (test/fake-target.ts).

export type TargetStatus = 'online' | 'offline';

// How a target tells the server about itself.
export type TargetReport = {
  // Whether the target can be reached now. A target is offline until it first reports.
  status(status: TargetStatus): void;
  // The target was changed at the target itself, by an operator; the adapter decides what counts.
  // The server pauses it until the producer arms it, so it never takes over behind the operator.
  changedByHand(): void;
  // The producer's press moved the target onto that item, which is no song of the set, such as
  // ProPresenter's Next slide crossing into Facetime. The server pauses it, as a Fade out does, until
  // the producer arms it or the next song's Count Off cue, so no cue lands on that item.
  movedOut(item: string): void;
  // Lines the producer's row shows read-only, opaque to the server: the lines it always shows in
  // full, such as the live cue, and a list under them that the row caps in height and scrolls, such
  // as the cue list. Each is null or none for nothing; a report without a list clears it. Current is
  // the index in list of the line to mark and keep in view, such as the live cue's line, null or left
  // out for none, and ignored when it is not an index of list. Ignored while the target is offline,
  // and cleared when it goes offline.
  state(lines: string[] | null, list?: string[] | null, current?: number | null): void;
  // The target acted on that cue now, such as an Eos fire event, ProPresenter's success answer to the
  // cue's trigger or an ATEM program change. Counts only from a target that acknowledges, and only for the cue the server
  // last handed it, the very object; any other, such as an older cue or a Fire again, is ignored.
  actedOn(cue: Cue): void;
  // The cue handed to the target never reached it: it got no answer before the target went offline,
  // such as ProPresenter's trigger cut off by a timeout or a refused connection, which is what put it
  // offline. The server records it as it records a cue that came due while the target was offline,
  // so the target gets the slide for the playhead when it comes back (connections.ts, missed).
  // Ignored while the target is online.
  missed(cue: Cue): void;
  // What is wrong with reaching the target now, as one sentence for its row, such as a connect that
  // failed, or null when nothing is. Unlike state, it is kept whatever the status, until the target
  // reports null.
  problem(problem: string | null): void;
  // The choice the target asks the producer to make for the set, such as its playlist, with what it
  // offers and what is picked now, or null for none. Kept whatever the status, until it reports
  // again.
  pick(pick: ConnectionPick | null): void;
  // The target's own file changed at the target, such as a cue recorded at the console, or something
  // the check reports changed at the target, such as ProPresenter's status stream going quiet, so the
  // server runs its check again.
  fileChanged(): void;
};

export type Target = {
  // The target's key in the config, such as "propresenter". Unique among the targets.
  name: string;
  // What the producer's Connections panel shows for it, such as "ProPresenter".
  label: string;
  // Whether the leader's Fade out pauses the target.
  pausesOnFade: boolean;
  // Whether the target reports acting on each cue through actedOn, so the server measures that too.
  // False when left out.
  acknowledges?: boolean;
  // Whether the target acts on the cue, such as the ATEM on a Count Off alone. A cue it does not act
  // on is still handed to it through cue(), but never measured: it changes neither the row's lateness
  // nor the log, and it leaves the line of an earlier cue still waiting on its acted-on report alone.
  // Every cue counts when left out.
  actsOn?(cue: Cue): boolean;
  // Called once the server listens. The target reports its status through report from then on.
  start(report: TargetReport): void | Promise<void>;
  stop(): Promise<void>;
  // Called while the target is armed and online, and on the producer's Fire again while it is online,
  // whatever its arm state.
  cue(cue: Cue): void;
  // Called on each Arm the producer presses, whatever the arm state before it and online or not, and
  // never on Disarm or when the music coming back arms a target a Fade out or a move out paused, which hands it a
  // cue at once. The producer hands the target back to the server, so the target forgets what the
  // operator did at the target before, such as ProPresenter's slide pressed by hand
  // (setlist-controller#266). A target that keeps nothing of the kind leaves it out.
  armed?(): void;
  // The target's own manual buttons, which the producer's row offers, in this order. Read each time
  // the row is built.
  buttons: TargetButton[];
  // Runs one of its buttons by id, on the producer's press. Called only while the target is online,
  // with an id it offers, whatever its arm state. A run pauses the target only through movedOut, when it
  // moved the target onto something that is no song of the set.
  runButton(id: string): void;
  // Takes the producer's pick of one of the choices it last reported, by id, for the set the server
  // holds now. Called only while the target is online and a set is known, with an id it offers,
  // whatever its arm state. A target that offers no pick leaves it out. Once it resolves, the server
  // runs the target's check again.
  pick?(choice: string, set: SetList): void | Promise<void>;
  // The pre-service check, as a FileCheck: the songs and sections of the set the target cannot match
  // in its own file (unmatched), what keeps it from checking them or is otherwise wrong with its
  // file (problems), such as no playlist picked, and what a matched song or section does that the
  // producer may want to know but need not fix (notes), such as a section with no group of its name
  // that shows slide 1, all as the target words them. Unmatched and problems are both empty when
  // every one matches and nothing else is wrong with the file, notes or not, and the page then shows
  // its pass text, the line the target words for a check that passes. A target matches each
  // name by namesMatch (match-name.ts), never a rule of its own. A target that matches no names, such
  // as the ATEM, checks its own device instead and answers a DeviceCheck. Called only while the
  // target is online, on Refresh, when the set read from Live changes, when a song's meter arrives or
  // changes while Live is stopped with no start on its way or once Live stops after one did, when the
  // target comes online, after the producer's pick, and when it reports its own file changed. Meters
  // are the beats in a bar of each song, by song number, 4 for 4/4, from the time signature Live
  // reported while the playhead sat inside that song, for a target that judges a section by its bars
  // (playback-controller.ts). A song missing from it has no meter read yet, and left out, no song has
  // one.
  check(set: SetList, meters?: ReadonlyMap<number, number>): FileCheck | DeviceCheck | Promise<FileCheck | DeviceCheck>;
  // The slides the target shows inside the cue's section, for a target that moves through them, such
  // as ProPresenter: each slide by the beat it goes on, from the section's start, the first at 0, or
  // before it, on a negative beat, for a first slide on a pickup (a slide timing entry's start), in
  // order. One entry for a cue that shows one slide, such as a song's End, and none for a cue that
  // shows none. Bar is the beats in a bar, from the cue's song's meter, or else the time signature
  // Live last reported, and meters each song's meter, as check takes them, for a plan that depends on
  // another song's slides, such as ProPresenter's bound on a pickup start after a song with no End.
  // The server hands each cue with the slide for the playhead's position, and a change cue for each
  // slide the playhead plays across inside the section (connections.ts). A target that leaves it out
  // gets each cue as the cue engine raised it.
  plan?(cue: Cue, bar: number, meters?: ReadonlyMap<number, number>): SlidePlan;
  // For a target that plans its slides: how many beats before its beat each slide of its plan goes
  // while Live plays forward, and the slide a loop wraps back to before each wrap, such as
  // ProPresenter's leadBeats, so the words are up before the line.
  // The server sends each one early on its own clock, from a prediction of the playhead
  // (connections.ts). 0 or left out sends each slide on its beat, when a report shows the playhead
  // played across it.
  lead?: number;
};

// A target's manual button as the server holds it: the row's id and label, and whether it takes
// down what the target shows, as ProPresenter's Clear slide does, so a change sent early shows again
// on its beat (connections.ts). The row shows only the id and label.
export type TargetButton = ConnectionButton & { blanks?: boolean };

// A slide a target shows inside a section: the beat it goes on, from the section's start, negative for
// a first slide on a pickup before it, and the slide, as the target numbers it, such as ProPresenter's
// presentation index.
export type SlidePlan = { beat: number; slide: number }[];

// A name-matching target's check of the set against its own file: the songs and sections of the set
// it cannot match in the file (unmatched), what keeps it from checking them or is otherwise wrong
// with the file that is not a failed match (problems), such as no playlist picked, two cues with one
// label or a cue list that is not there, and its notes on what matched (notes), each line as the
// target words it, in set order. Its pass text (passText) is the line the page shows when the check
// matches, as the target words it, such as "Every song and section matches.".
export type FileCheck = { unmatched: string[]; problems: string[]; notes: string[]; passText: string };

// A target's check of its own device: what is wrong with it, such as an input it does not have, and
// what it found, such as its model, each line as the target words it.
export type DeviceCheck = { problems: string[]; notes: string[] };
