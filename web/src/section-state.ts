import { countInLandsOn } from '../../src/shared/count-in.ts';
import { sameSection, sectionAt, type Section, type SectionAddress, type SetList, type Snapshot } from '../../src/shared/snapshot.ts';

// Shared section state classes across setlist, tap targets, timeline, and chart view. `section` is
// optional and passed only by TimelineView here; the other views adopt skipped styling in #585.
export function sectionState(
  address: SectionAddress,
  now: Snapshot['now'],
  jump: Snapshot['jump'],
  loop: Snapshot['loop'],
  section?: Pick<Section, 'skip'>,
) {
  const current = sameSection(now, address);
  const waiting = sameSection(jump, address);
  const looping = sameSection(loop?.section, address);
  const skipped = section?.skip === true;
  return {
    waiting,
    classes: [current && 'current', waiting && 'waiting', looping && 'looping', skipped && 'skipped'].filter(Boolean).join(' '),
  };
}

export function sectionControlState(
  set: SetList,
  now: Snapshot['now'],
  jump: Snapshot['jump'],
  countIn: Snapshot['countIn'],
  loop: Snapshot['loop'],
) {
  const looping = loop !== null;
  const song = now && set.songs.find((candidate) => candidate.number === now.song);
  const target = jump ?? now;
  const section = target && sectionAt(set, target);
  const held =
    countIn && jump !== null && jump.section !== 'end'
      ? { song: set.songs.find((candidate) => candidate.number === jump.song), section: jump.section }
      : null;
  const canPrevious = held ? held.song !== undefined && countInLandsOn(held.song, held.section - 1) : now !== null;
  const canNext = held
    ? held.song !== undefined && countInLandsOn(held.song, held.section + 1)
    : now !== null && (now.next !== 'end' || (song?.endCue ?? null) !== null);
  const canLoop = looping || (section?.end ?? null) !== null;
  return { looping, canPrevious, canNext, canLoop };
}
