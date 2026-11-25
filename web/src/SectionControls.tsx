import type { Command } from '../../src/shared/command.ts';
import type { SetList, Snapshot } from '../../src/shared/snapshot.ts';
import { sectionControlState } from './section-state.ts';

// The leader's section controls: back a section, loop the current one, on a section. Each jump
// comes on the next downbeat, and none leaves the song. Only the leader and producer pages show
// them. Loop braces the section a waiting jump goes to, in place of the one playing, and nothing
// while the jump to a song's End waits, since End is not a section. With no section playing they
// have nothing to act on, except Loop while a loop is on, so the leader can always release it, or
// while a jump waits. During a count-in Previous and Next move its target instead, in the target's
// song, so they are enabled from the target the way the server judges them: off where the move
// would leave the sections a count-in can land on, which is Previous on the section right after the
// Count Off and Next on the last section before a Pad or End.

export function SectionControls({
  set,
  now,
  jump,
  countIn,
  loop,
  available,
  send,
}: {
  set: SetList;
  now: Snapshot['now'];
  jump: Snapshot['jump'];
  countIn: Snapshot['countIn'];
  loop: Snapshot['loop'];
  available: boolean;
  send(command: Command): void;
}) {
  const { looping, canPrevious, canNext, canLoop } = sectionControlState(set, now, jump, countIn, loop);
  const button = (kind: 'previous' | 'loop' | 'next', label: string, enabled: boolean, pressed?: boolean) => (
    <button
      type="button"
      className={['section-control', pressed && 'on', !enabled && 'unavailable'].filter(Boolean).join(' ')}
      aria-pressed={pressed}
      disabled={!enabled}
      onClick={() => send({ kind })}
    >
      {label}
    </button>
  );

  return (
    <section className="section-controls" aria-label="Section controls">
      {button('previous', 'Previous', available && canPrevious)}
      {button('loop', 'Loop', available && canLoop, looping)}
      {button('next', 'Next', available && canNext)}
    </section>
  );
}
