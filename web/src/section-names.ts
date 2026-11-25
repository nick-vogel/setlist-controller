import { sectionAt, type SetList, type Snapshot, type Song } from '../../src/shared/snapshot.ts';

// The names the now-playing panel and the stage status line both show for where the set is going:
// the jump that waits, and the next section. One place, so the two never name different sections.

// The section a waiting jump goes to, End for a song's End, which is not a section, or undefined
// with no jump or a jump to no section of the set.
export function jumpTargetName(set: SetList, jump: Snapshot['jump']): string | undefined {
  if (!jump) return undefined;
  return jump.section === 'end' ? 'End' : sectionAt(set, jump)?.name;
}

// The section after the playhead's, End after a song's last section when the song has an End, or
// null when it has none. During a count-in it names the section after the target, in the target's
// song, since the band comes in on the target and not on the section after the Count Off playing.
export function nextSectionName(
  set: SetList,
  song: Song,
  now: NonNullable<Snapshot['now']>,
  jump: Snapshot['jump'],
  countIn: boolean,
): string | null {
  if (countIn && jump && jump.section !== 'end') return nextAfter(set, jump.song, jump.section);
  if (now.next !== 'end') return song.sections[now.next]?.name ?? 'End';
  return song.end === null ? null : 'End';
}

function nextAfter(set: SetList, songNumber: number, section: number): string | null {
  const song = set.songs.find((candidate) => candidate.number === songNumber);
  if (!song) return null;
  return song.sections[section + 1]?.name ?? (song.end === null ? null : 'End');
}
