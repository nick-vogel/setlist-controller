import type { Command } from '../../src/shared/command.ts';
import type { NowPlaying, SetList } from '../../src/shared/snapshot.ts';

// The leader's Previous song and Next song, in the transport row after the top Play from start. While
// Live is stopped, each moves the playhead to the first section of the song before or after the one
// it is in, in set order, by an ordinary jump: Live jumps at once while stopped, nothing plays, and
// the server raises no cue while Live is stopped, so no target moves. The tap targets then show that
// song's sections, ready for a tap and Count in. Both are off while Live plays, a count-in included:
// in a service Continue into next song moves between songs, and a song jump on the next downbeat
// would cut the music mid-song.

export function SongStepButton({
  step,
  set,
  now,
  playable,
  playing,
  countIn,
  send,
}: {
  step: 'previous' | 'next';
  set: SetList;
  now: NowPlaying | null;
  playable: boolean;
  playing: boolean;
  countIn: boolean;
  send(command: Command): void;
}) {
  const index = set.songs.findIndex((song) => song.number === now?.song);
  // The song before or after the playhead's, in set order: none past either end of the set. A song
  // that is only an End locator has no section to jump to, and the server ignores a jump to one.
  const target = index === -1 ? undefined : set.songs[step === 'previous' ? index - 1 : index + 1];
  const moves = playable && !playing && !countIn && target !== undefined && target.sections.length > 0;

  return (
    <button
      type="button"
      className={moves ? 'song-step' : 'song-step unavailable'}
      disabled={!moves}
      onClick={() => {
        if (target) send({ kind: 'jump', song: target.number, section: 0 });
      }}
    >
      {step === 'previous' ? 'Previous song' : 'Next song'}
    </button>
  );
}
