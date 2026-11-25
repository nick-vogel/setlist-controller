import { songTitle, type Snapshot } from '../../src/shared/snapshot.ts';
import { jumpTargetName, nextSectionName } from './section-names.ts';

// What the stage status line shows: whether Live plays, is stopped, or waits on a jump or a count-in,
// with the song, the section and the next section. Without a song to show, it says why: the server
// or Live is out of reach, there is no set yet, or the playhead is between songs. It holds the stage
// run state only, so the line stays one line tall on a phone.

export type StageTransport =
  | { kind: 'playing'; label: 'Playing' }
  | { kind: 'stopped'; label: 'Stopped' }
  | { kind: 'jumping'; label: string }
  | { kind: 'count-in'; label: string };

export type StageStatus =
  | { kind: 'server-lost'; label: 'Reconnecting to the server.' }
  | { kind: 'live-lost'; label: 'Live not connected' }
  | { kind: 'empty'; label: string }
  | { kind: 'between'; label: 'Between songs'; transport: StageTransport }
  | { kind: 'active'; song: string; section: string; next: string | null; transport: StageTransport };

// The part of a snapshot the line reads.
export type StageSnapshot = Pick<Snapshot, 'live' | 'set' | 'playing' | 'now' | 'jump' | 'countIn'>;

// The server out of reach comes first, since the snapshot is then the last one the page had; then
// Live out of reach, then no set, then the playhead.
export function stageStatus({ live, set, playing, now, jump, countIn }: StageSnapshot, connected: boolean): StageStatus {
  if (!connected) return { kind: 'server-lost', label: 'Reconnecting to the server.' };
  if (live === 'not-connected') return { kind: 'live-lost', label: 'Live not connected' };
  if (!set) return { kind: 'empty', label: 'Waiting for Live' };
  if (set.songs.length === 0) return { kind: 'empty', label: 'No songs in set' };

  const target = jumpTargetName(set, jump);
  const transport: StageTransport = target
    ? countIn
      ? { kind: 'count-in', label: `Count in to ${target}` }
      : { kind: 'jumping', label: `Jumping to ${target}` }
    : playing
      ? { kind: 'playing', label: 'Playing' }
      : { kind: 'stopped', label: 'Stopped' };

  const song = now && set.songs.find((candidate) => candidate.number === now.song);
  const section = now && song?.sections[now.section];
  if (!now || !song || !section) return { kind: 'between', label: 'Between songs', transport };

  return { kind: 'active', song: songTitle(song), section: section.name, next: nextSectionName(set, song, now, jump, countIn), transport };
}
