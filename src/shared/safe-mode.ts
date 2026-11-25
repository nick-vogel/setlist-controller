import type { JumpTarget, NowPlaying } from './snapshot.ts';

// The song Safe Mode guards while Live plays, which the server's guard keeps and the pages read to
// grey out the taps it would refuse: the song currently playing, or the held count-in's song while
// a count-in runs. Null before the first song, in a gap between songs, or while position is unknown.
export const activeSong = (countIn: boolean, jump: JumpTarget | null, now: NowPlaying | null): number | null =>
  countIn && jump ? jump.song : (now?.song ?? null);
