import type { Command } from '../../src/shared/command.ts';
import type { Song } from '../../src/shared/snapshot.ts';

// The leader's Play from start, in a song's heading beside Count in and in the transport row beside
// the top Count in. Both play a song from its first locator, by one rule: stopped, the server starts
// it; playing, it jumps there on the bar line and plays on. The heading's button is for its own song;
// the transport row's is for the song the playhead is in, and that is no song on an End or between
// songs.

export function PlayFromStartButton({ song, playable, send }: { song: Song | undefined; playable: boolean; send(command: Command): void }) {
  const plays = playable && song !== undefined;

  return (
    <button
      type="button"
      className={plays ? 'play-from-start' : 'play-from-start unavailable'}
      disabled={!plays}
      onClick={() => {
        if (song) send({ kind: 'play-from-start', song: song.number });
      }}
    >
      Play from start
    </button>
  );
}
