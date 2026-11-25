import type { Command } from '../../src/shared/command.ts';
import { countInFor, hasCountOff } from '../../src/shared/count-in.ts';
import type { NowPlaying, Song } from '../../src/shared/snapshot.ts';

// The leader's Count in, in a song's heading beside Play from start and in the transport row beside
// Fade out. Both count in to the section the playhead is in, by one rule. The heading's button is
// for its own song; the transport row's is for the song the playhead is in, and that is no song on
// an End or between songs.

// Why Count in is disabled in a song with no Count Off, under the button's label.
const NO_COUNT_OFF = 'No Count Off';

export function CountInButton({
  song,
  now,
  playable,
  playing,
  send,
}: {
  song: Song | undefined;
  now: NowPlaying | null;
  playable: boolean;
  playing: boolean;
  send(command: Command): void;
}) {
  // Count in starts from stopped, with the playhead in this song, on a section the server counts in
  // to (count-in.ts), which End, between songs, is not.
  const counts =
    playable && !playing && song !== undefined && now?.song === song.number && countInFor(song, now.section).kind !== 'refused';

  return (
    <button
      type="button"
      className={counts ? 'count-in' : 'count-in unavailable'}
      disabled={!counts}
      onClick={() => {
        if (song && now) send({ kind: 'count-in', song: song.number, section: now.section });
      }}
    >
      <span className="count-in-label">Count in</span>
      {song !== undefined && !hasCountOff(song) && <span className="count-in-hint">{NO_COUNT_OFF}</span>}
    </button>
  );
}
