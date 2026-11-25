import { sectionAt, songTitle, type SetList, type Snapshot } from '../../src/shared/snapshot.ts';

// Where the set is: the current song and section, the next section, the bar, and a progress bar
// through the current section, the jump the leader asked for while it waits for the downbeat, a
// song's End and a count-in's target included, and the loop while one is on. During a count-in the
// Next line names the section after the target, in the target's song, since the band comes in on the
// target and not on the section after the Count Off playing.
// Every page shows it, and while Live is not connected it says so in place of all of that. With Live
// connected and no set yet, it shows nothing.

export function NowPlaying({
  live,
  set,
  now,
  jump,
  countIn,
  loop,
}: {
  live: Snapshot['live'];
  set: SetList | null;
  now: Snapshot['now'];
  jump: Snapshot['jump'];
  countIn: Snapshot['countIn'];
  loop: Snapshot['loop'];
}) {
  if (live === 'not-connected') return <LiveNotConnected />;
  if (!set) return null;

  const song = now && set.songs.find((candidate) => candidate.number === now.song);
  const section = now && song?.sections[now.section];
  // End is not a section, so a jump to it is named apart.
  const target = jump && (jump.section === 'end' ? 'End' : sectionAt(set, jump)?.name);
  // The line keeps its place while no jump waits, so the leader's tap targets under it never move. A
  // count-in's target waits as a jump does, and the line says the Count Off playing leads into it.
  const jumpLine = <p className="now-jump">{target ? `${countIn ? 'Count in to' : 'Jumping to'} ${target}.` : '\u00a0'}</p>;
  // The same for the loop. A brace set by hand at the laptop may match no section.
  const looped = loop?.section && sectionAt(set, loop.section);
  const loopLine = <p className="now-loop">{looped ? `Looping ${looped.name}.` : loop ? 'Loop on.' : '\u00a0'}</p>;

  if (!now || !song || !section) {
    return (
      <section className="now-playing" aria-label="Now playing">
        <p className="between">Between songs.</p>
        {jumpLine}
        {loopLine}
      </section>
    );
  }

  const next =
    countIn && jump && jump.section !== 'end'
      ? nextAfter(set, jump.song, jump.section)
      : now.next !== 'end'
        ? (song.sections[now.next]?.name ?? 'End')
        : song.end === null
          ? null
          : 'End';

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

// The name of the section after that one in its song, End after the song's last section when the
// song has an End, or null when it has none.
function nextAfter(set: SetList, songNumber: number, section: number): string | null {
  const song = set.songs.find((candidate) => candidate.number === songNumber);
  if (!song) return null;
  return song.sections[section + 1]?.name ?? (song.end === null ? null : 'End');
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
