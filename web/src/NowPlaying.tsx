import { sectionAt, songTitle, type SetList, type Snapshot } from '../../src/shared/snapshot.ts';
import { formatSeconds, timeLeft, type TimeLeft } from './durations.ts';
import { jumpTargetName, nextSectionName } from './section-names.ts';

// Where the set is: the current song and section, the next section, the bar, and a progress bar
// through the current section, the jump the leader asked for while it waits for the downbeat, a
// song's End and a count-in's target included, and the loop while one is on. During a count-in the
// Next line names the section after the target, in the target's song, since the band comes in on the
// target and not on the section after the Count Off playing. Under the section, the time left in
// the song and in the set, gaps included, when the page knows them (durations.ts).
// Every page shows it, and while Live is not connected it says so in place of all of that. With Live
// connected and no set yet, it shows nothing.

export function NowPlaying({
  live,
  set,
  now,
  jump,
  countIn,
  loop,
  timings,
  position,
  playing,
}: {
  live: Snapshot['live'];
  set: SetList | null;
  now: Snapshot['now'];
  jump: Snapshot['jump'];
  countIn: Snapshot['countIn'];
  loop: Snapshot['loop'];
  timings: Snapshot['songTimings'];
  position: Snapshot['position'];
  playing: Snapshot['playing'];
}) {
  if (live === 'not-connected') return <LiveNotConnected />;
  if (!set) return null;

  const song = now && set.songs.find((candidate) => candidate.number === now.song);
  const section = now && song?.sections[now.section];
  const target = jumpTargetName(set, jump);
  // The line keeps its place while no jump waits, so the leader's tap targets under it never move. A
  // count-in's target waits as a jump does, and the line says the Count Off playing leads into it.
  const jumpLine = <p className="now-jump">{target ? `${countIn ? 'Count in to' : 'Jumping to'} ${target}.` : '\u00a0'}</p>;
  // The same for the loop. A brace set by hand at the laptop may match no section.
  const looped = loop?.section && sectionAt(set, loop.section);
  const loopLine = <p className="now-loop">{looped ? `Looping ${looped.name}.` : loop ? 'Loop on.' : '\u00a0'}</p>;
  // The same for the time left, which is not known for a set the build did not time until Live plays in it.
  const timeLine = <p className="now-time-left">{timeLeftText(timeLeft(set, timings, { now, position, jump, countIn, loop, playing })) || '\u00a0'}</p>;

  if (!now || !song || !section) {
    return (
      <section className="now-playing" aria-label="Now playing">
        <p className="between">Between songs.</p>
        {timeLine}
        {jumpLine}
        {loopLine}
      </section>
    );
  }

  const next = nextSectionName(set, song, now, jump, countIn);

  return (
    <section className="now-playing" aria-label="Now playing">
      <p className="now-song">{songTitle(song)}</p>
      <div className="now-section">
        <span className="now-section-name">{section.name}</span>
        <span className="now-bar">{now.bars === null ? `bar ${now.bar}` : `bar ${now.bar} of ${now.bars}`}</span>
      </div>
      <div className="progress" aria-hidden="true">
        {now.fraction !== null && <div className="progress-fill" style={{ width: `${now.fraction * 100}%` }} />}
      </div>
      {timeLine}
      <p className="now-next">
        {next === null ? (
          '\u00a0'
        ) : (
          <>
            <span className="label">Next</span> {next}
          </>
        )}
      </p>
      {jumpLine}
      {loopLine}
    </section>
  );
}

// "3:12 left in song · 38:40 left in set", each part only when it is known, "at least" before a set
// time that is a minimum, and "~" before each while a loop is on.
function timeLeftText({ song, set, approximate }: TimeLeft): string {
  const about = approximate ? '~' : '';
  const parts = [
    song !== null && `${about}${formatSeconds(song, 'up')} left in song`,
    set !== null && `${set.atLeast ? 'at least ' : ''}${about}${formatSeconds(set.seconds, 'up')} left in set`,
  ];
  return parts.filter(Boolean).join(' \u00b7 ');
}

// Its own panel, in a warning colour with a border, so it never reads as a stopped song or the grey
// "Between songs." line.
export function LiveNotConnected() {
  return (
    <section className="now-playing live-lost" role="alert" aria-label="Now playing">
      <p className="live-lost-title">Live not connected</p>
      <p className="live-lost-detail">Check that Live is open on the playback laptop.</p>
    </section>
  );
}

export function Reconnecting() {
  return (
    <p className="server-lost" role="status">
      Reconnecting to the server.
    </p>
  );
}
