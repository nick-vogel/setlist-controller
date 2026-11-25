import { sectionAt, songTitle, type JumpTarget, type NowPlaying, type SetList, type Snapshot } from '../../src/shared/snapshot.ts';

// What the stage status line shows: whether Live plays, is stopped, or waits on a jump or a count-in,
// with the song, the section and the next section. Without a song to show, it says why: the server
// or Live is out of reach, there is no set yet, or the playhead is between songs. It holds the stage
// run state only, so the line stays one line tall on a phone, and the producer and view-only pages
// can show it as a module.

export type StageTransport =
  | { kind: 'playing'; label: 'Playing' }
  | { kind: 'stopped'; label: 'Stopped' }
  | { kind: 'jumping'; target: string; label: string }
  | { kind: 'count-in'; target: string; label: string };

export type StageStatus =
  | { kind: 'disconnected'; reason: 'server' | 'live'; label: string }
  | { kind: 'empty'; label: string }
  | { kind: 'between'; label: 'Between songs'; transport: StageTransport }
  | {
      kind: 'active';
      song: string;
      section: string;
      next: string | null;
      transport: StageTransport;
    };

export type StageStatusInput = {
  connected: boolean;
  live: Snapshot['live'];
  set: SetList | null;
  playing: boolean;
  now: NowPlaying | null;
  jump: JumpTarget | null;
  countIn: boolean;
};

export function stageStatus({ connected, live, set, playing, now, jump, countIn }: StageStatusInput): StageStatus {
  if (!connected) return { kind: 'disconnected', reason: 'server', label: 'Server disconnected' };
  if (live === 'not-connected') return { kind: 'disconnected', reason: 'live', label: 'Live not connected' };
  if (!set) return { kind: 'empty', label: 'Waiting for Live' };
  if (set.songs.length === 0) return { kind: 'empty', label: 'No songs in set' };

  const transport = stageTransport(set, playing, jump, countIn);
  const song = now && set.songs.find((candidate) => candidate.number === now.song);
  const section = now && song?.sections[now.section];
  if (!now || !song || !section) {
    return { kind: 'between', label: 'Between songs', transport };
  }

  // During a count-in the Count Off plays while the band comes in on the target, so Next names the
  // section after the target rather than the section after the Count Off, matching NowPlaying.
  const next =
    countIn && jump && jump.section !== 'end'
      ? nextAfter(set, jump.song, jump.section)
      : now.next !== 'end'
        ? (song.sections[now.next]?.name ?? 'End')
        : song.end === null
          ? null
          : 'End';

  return {
    kind: 'active',
    song: songTitle(song),
    section: section.name,
    next,
    transport,
  };
}

function stageTransport(set: SetList, playing: boolean, jump: JumpTarget | null, countIn: boolean): StageTransport {
  const target = jump ? (jump.section === 'end' ? 'End' : sectionAt(set, jump)?.name) : undefined;
  if (target) {
    return countIn
      ? { kind: 'count-in', target, label: `Count in to ${target}` }
      : { kind: 'jumping', target, label: `Jumping to ${target}` };
  }
  return playing ? { kind: 'playing', label: 'Playing' } : { kind: 'stopped', label: 'Stopped' };
}

function nextAfter(set: SetList, songNumber: number, section: number): string | null {
  const song = set.songs.find((candidate) => candidate.number === songNumber);
  if (!song) return null;
  return song.sections[section + 1]?.name ?? (song.end === null ? null : 'End');
}
