import type { FadePhase } from '../shared/snapshot.ts';
import type { Clock } from './clock.ts';
import { PROBE_INTERVAL_MS, SILENT_BEFORE_LOST_MS, type LiveEvent } from './live-bridge.ts';

// The leader's Fade out and Fade in. AbletonOSC has no master volume and no ramp, so the server fades
// the music itself: it reads the track list and the volume of each top-level track it fades (a group or
// a single track, never a track inside a group, which its group already fades), and steps those
// volumes down to silence on its own clock. Live plays on, with the music silent, until the leader's
// Fade in steps each track back to its saved volume over 6 seconds, or the next song's Count Off
// brings it back over the Count Off. The click and the guide keep their level throughout: Live's
// metronome is not a track, and the fade leaves the GUIDE and MT CLICK tracks (KEEP_LEVEL) alone.
//
// Whatever ends a fade, each volume goes back, unless Live has been gone longer than KEPT_RESTORE_MS.
// A Stop, or Live stopping, ends it at once. A jump leaves it as it is. When Live goes away during a
// fade, or while the music is silent, the volumes go back when it
// answers again within 10 minutes (KEPT_RESTORE_MS), since a restore sent while it is gone reaches
// nobody and leaves the set silent. A Live that answers later may have another set open, and gets
// none of the old set's volumes.

// The fade's length in ms, and the step that divides it on the server's clock. AbletonOSC handles
// what it receives once per 100 ms tick, so a step comes as often as Live can take it.
export const FADE_MS = 6000;
export const FADE_STEP_MS = 100;
const STEPS = FADE_MS / FADE_STEP_MS;

// A loss the bridge reports this soon after a restore may mean Live went silent before it handled the
// restore: the bridge takes up to SILENT_BEFORE_LOST_MS to notice, and a message Live received waits
// up to one AbletonOSC tick before Live handles it. The bridge counts that silence in probe ticks on
// a timer, and a timer only ever fires late, so the window allows one more probe interval for it. A
// restore kept that the returning Live already handled costs nothing: it sets the volumes Live has.
const RESTORE_AT_RISK_MS = SILENT_BEFORE_LOST_MS + PROBE_INTERVAL_MS + FADE_STEP_MS;

// How long saved volumes wait for Live after the bridge reports it lost. They are for the Live that
// went away during the fade, so they wait long enough to restart Live and reopen the set in the middle
// of a service, and far less than the time from one service's set to the next. A Live that connects
// later may have another set open, such as next Sunday's on a server that runs all week, and gets
// nothing. A check of the returning Live's track list cannot stand in for the limit: every built set
// is on the one Sunday template, so it has the same top-level tracks, by index and by name.
const KEPT_RESTORE_MS = 10 * 60 * 1000;

const READ_TIMEOUT_MS = 1000;

// The top-level tracks the fade leaves at their level, found by name as the set builder finds them:
// the single tracks its template names GUIDE and MT CLICK, the targets of the Guide and Click Track
// stems in config/stem-map.json. The band follows the guide, and MT CLICK carries the click when
// Live's metronome fails. A name matches only in that letter case, as the builder matches it.
const KEEP_LEVEL: ReadonlySet<string> = new Set(['GUIDE', 'MT CLICK']);

export type FadeOutOptions = {
  clock: Clock;
  // Asks Live for its track list, which comes back as a track-data event.
  requestTrackData(): void;
  // Asks Live for a track's volume, which comes back as a track-volume event.
  requestTrackVolume(track: number): void;
  setTrackVolume(track: number, volume: number): void;
  // Called each time the fade's phase changes.
  onPhase(): void;
};

export type FadeOut = {
  // Starts a fade out. A press while one runs or the music is silent does nothing, its reads included, and so does a press while
  // saved volumes wait for Live to come back. A press more than READ_TIMEOUT_MS after the one whose
  // reads have not all come back gives them up and reads the tracks again. With no such press, a late
  // reply still starts the fade.
  fadeOut(): void;
  // Fades the music back in from silence over FADE_MS. A press at any other time does nothing.
  fadeIn(): void;
  // Fades the music back in over ms, from silence or from wherever a fade out has reached, as a song
  // counts off. With nothing faded it does nothing.
  fadeInOver(ms: number): void;
  // Where the fade is, for the pages.
  phase(): FadePhase | null;
  // Every Live event: the replies to the fade's reads, Live's stop, and the bridge's word that Live
  // has gone or come back.
  fromLive(event: LiveEvent): void;
  // Ends a fade, or the silence after one: no more steps, and each track back to the volume it had at
  // once. The leader's Stop, and Live stopping, end it, so the music played next is at its normal
  // level. A fade still reading has changed nothing in Live, so nothing goes back.
  cancel(): void;
  // Stops a fade where it is and sets each saved volume back at once, except volumes kept for a Live
  // lost more than KEPT_RESTORE_MS ago, before the bridge closes: a step sent on a closed socket
  // throws, and the saved volumes go with the server. A press after it does nothing. So does a Live
  // event: the bridge still reports Live until it closes, and a Live lost and back in that time would
  // otherwise set the same volumes again, on a socket that may have closed.
  close(): void;
};

// The top-level tracks the fade steps, in Live's order, and each one's volume before the fade.
type Saved = { tracks: number[]; saved: Map<number, number> };

type State =
  | { kind: 'idle' }
  | { kind: 'reading-tracks'; since: number }
  // The volumes read so far.
  | ({ kind: 'reading-volumes'; since: number } & Saved)
  | ({ kind: 'stepping' } & Saved)
  // The fade has run to silence, and Live plays on. The saved volumes wait for the fade back in.
  | ({ kind: 'silent' } & Saved)
  // Stepping back up from silence to the saved volumes.
  | ({ kind: 'rising' } & Saved)
  // Live went silent during the fade, and the bridge reported it at since. Each saved volume goes back
  // when Live answers again within KEPT_RESTORE_MS of that.
  | ({ kind: 'lost'; since: number } & Saved);

export function startFadeOut({ clock, requestTrackData, requestTrackVolume, setTrackVolume, onPhase }: FadeOutOptions): FadeOut {
  let current: State = { kind: 'idle' };
  // Every change of state goes through here, so the pages hear of each change of phase.
  const phaseOf = (of: State): FadePhase | null =>
    of.kind === 'stepping' ? 'out' : of.kind === 'silent' ? 'silent' : of.kind === 'rising' ? 'in' : null;
  const set = (next: State) => {
    const before = phaseOf(current);
    current = next;
    if (phaseOf(next) !== before) onPhase();
  };
  let closed = false;
  let stopStepping = () => {};
  // The share of each saved volume a fade out has stepped the tracks to.
  let level = 1;
  // The volumes the fade set back last, and when.
  let lastRestore: (Saved & { at: number }) | undefined;

  const restore = ({ tracks, saved }: Saved) => {
    for (const track of tracks) setTrackVolume(track, saved.get(track)!);
    lastRestore = { tracks, saved, at: clock.now() };
  };

  // The 6 seconds start once every volume is known, since each step is a share of one. Step k of 60
  // sets each track to (1 - k / 60) of its volume, so the last step, at 6 seconds, is silence. Live
  // plays on, and each saved volume waits for the fade back in.
  const startStepping = (tracks: number[], saved: Map<number, number>) => {
    set({ kind: 'stepping', tracks, saved });
    level = 1;
    let done = 0;
    stopStepping = clock.every(FADE_STEP_MS, () => {
      done += 1;
      level = 1 - done / STEPS;
      for (const track of tracks) setTrackVolume(track, saved.get(track)! * (1 - done / STEPS));
      if (done < STEPS) return;
      stopStepping();
      set({ kind: 'silent', tracks, saved });
    });
  };

  // Rises from `from`, the share of each saved volume the tracks are at, over ms in steps of
  // FADE_STEP_MS. Step k of n sets each track to from + (1 - from) * k / n of its saved volume, so the
  // last step is the saved volume itself, which counts as a restore.
  const startRising = ({ tracks, saved }: Saved, from: number, ms: number) => {
    // Less than half a step to go: every volume goes back at once.
    if (ms < FADE_STEP_MS / 2) {
      restore({ tracks, saved });
      set({ kind: 'idle' });
      return;
    }
    set({ kind: 'rising', tracks, saved });
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let done = 0;
    stopStepping = clock.every(FADE_STEP_MS, () => {
      done += 1;
      if (done < steps) {
        for (const track of tracks) setTrackVolume(track, saved.get(track)! * (from + (1 - from) * (done / steps)));
        return;
      }
      stopStepping();
      restore({ tracks, saved });
      set({ kind: 'idle' });
    });
  };

  // The fade has changed volumes in Live, and the saved ones have not gone back yet.
  const holdsSaved = (current: State): current is Extract<State, { kind: 'stepping' | 'silent' | 'rising' }> =>
    current.kind === 'stepping' || current.kind === 'silent' || current.kind === 'rising';

  const cancel = () => {
    if (current.kind === 'lost') return;
    stopStepping();
    if (holdsSaved(current)) restore(current);
    set({ kind: 'idle' });
  };

  // Live went silent. A fade that was stepping keeps its saved volumes for KEPT_RESTORE_MS. So does
  // one whose restore came so recently that Live may never have handled it, the fade's own end
  // included: the bridge notices a loss in the fade's last seconds only after the fade has ended.
  // Otherwise nothing in Live changed, and a fade still reading ends.
  const lose = () => {
    if (current.kind === 'lost') return;
    stopStepping();
    const atRisk = lastRestore && clock.now() - lastRestore.at <= RESTORE_AT_RISK_MS ? lastRestore : undefined;
    const kept = holdsSaved(current) ? current : atRisk;
    current = kept ? { kind: 'lost', since: clock.now(), tracks: kept.tracks, saved: kept.saved } : { kind: 'idle' };
  };

  // Live answers again, and the fade ends. Within KEPT_RESTORE_MS of the loss, each saved volume goes
  // back. The server hears of it before it reads the set, and the controller takes no command while
  // Live is gone, so these are the first volumes the returning Live gets. A Live that comes back
  // playing plays on at its normal level. A Live that connects later may have another set open, so it
  // gets nothing. The limit is compared here, with no timer, as the read deadline is compared at a
  // press.
  const regain = () => {
    if (current.kind !== 'lost') return;
    const kept = current;
    set({ kind: 'idle' });
    if (clock.now() - kept.since <= KEPT_RESTORE_MS) restore(kept);
  };

  return {
    fadeOut() {
      if (closed) return;
      const stale = (current.kind === 'reading-tracks' || current.kind === 'reading-volumes') && clock.now() - current.since > READ_TIMEOUT_MS;
      if (current.kind !== 'idle' && !stale) return;
      set({ kind: 'reading-tracks', since: clock.now() });
      requestTrackData();
    },
    fadeIn() {
      if (closed || current.kind !== 'silent') return;
      startRising(current, 0, FADE_MS);
    },
    fadeInOver(ms) {
      if (closed || (current.kind !== 'silent' && current.kind !== 'stepping')) return;
      stopStepping();
      startRising(current, current.kind === 'silent' ? 0 : level, ms);
    },
    fromLive(event) {
      if (closed) return;
      if (event.kind === 'connection') {
        if (event.connected) regain();
        else lose();
        return;
      }
      // Live stopped before the fade did, at the laptop, say. The fade ends there, so its own stop
      // never lands on the next song the leader starts.
      if (event.kind === 'playing' && !event.playing) {
        cancel();
        return;
      }
      if (event.kind === 'track-data' && current.kind === 'reading-tracks') {
        const tracks = event.tracks.filter((track) => !track.grouped && !KEEP_LEVEL.has(track.name)).map((track) => track.track);
        if (tracks.length === 0) {
          startStepping(tracks, new Map());
          return;
        }
        set({ kind: 'reading-volumes', since: current.since, tracks, saved: new Map() });
        for (const track of tracks) requestTrackVolume(track);
        return;
      }
      if (event.kind === 'track-volume' && current.kind === 'reading-volumes') {
        const { tracks, saved } = current;
        // A volume the fade did not ask for, or asked for once already, changes nothing.
        if (!tracks.includes(event.track) || saved.has(event.track)) return;
        saved.set(event.track, event.volume);
        if (saved.size === tracks.length) startStepping(tracks, saved);
      }
    },
    phase: () => phaseOf(current),
    cancel,
    close: () => {
      closed = true;
      stopStepping();
      if (holdsSaved(current) || (current.kind === 'lost' && clock.now() - current.since <= KEPT_RESTORE_MS)) restore(current);
      set({ kind: 'idle' });
    },
  };
}
