import type { Command } from '../../src/shared/command.ts';
import { controls, type Role } from '../../src/shared/routes.ts';
import { END_TOGGLES, songTitle, type EndToggle, type NowPlaying, type Song } from '../../src/shared/snapshot.ts';
import { CountInButton } from './CountInButton.tsx';
import { PlayFromStartButton } from './PlayFromStartButton.tsx';

// A song's heading in the setlist: its title and what happens at its End, on every page. The leader
// page can also play the song from its start, count in to the section the playhead is in, and change
// its end toggle. A song with no End locator never stops on its own, so it shows that in place of a
// toggle.

const TOGGLE_LABELS: Record<EndToggle, string> = {
  stop: 'Stop at end',
  continue: 'Continue into next song',
};
const NO_END = 'No End locator';

export function SongHeading({
  song,
  toggle,
  role,
  available,
  playable,
  playing,
  now,
  send,
}: {
  song: Song;
  toggle: EndToggle;
  role: Role;
  available: boolean;
  playable: boolean;
  playing: boolean;
  now: NowPlaying | null;
  send(command: Command): void;
}) {
  const title = songTitle(song);

  if (!controls(role)) {
    return (
      <header className="song-heading">
        <h2>{title}</h2>
        <p className="end-toggle-text">{song.end === null ? NO_END : TOGGLE_LABELS[toggle]}</p>
      </header>
    );
  }

  return (
    <header className="song-heading">
      <h2>{title}</h2>
      <div className="song-controls">
        <PlayFromStartButton song={song} playable={playable} send={send} />
        <CountInButton song={song} now={now} playable={playable} playing={playing} send={send} />
        {song.end === null ? (
          <p className="end-toggle-text">{NO_END}</p>
        ) : (
          <div className="end-toggle" role="group" aria-label={`At the end of ${title}`}>
            {END_TOGGLES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={toggle === choice}
                className={['end-choice', toggle === choice && 'chosen', !available && 'unavailable'].filter(Boolean).join(' ')}
                disabled={!available}
                onClick={() => send({ kind: 'set-end-toggle', song: song.number, toggle: choice })}
              >
                {TOGGLE_LABELS[choice]}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
