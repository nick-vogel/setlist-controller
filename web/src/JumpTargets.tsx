import type { Command } from '../../src/shared/command.ts';
import { countInLandsOn } from '../../src/shared/count-in.ts';
import type { SetList, Snapshot } from '../../src/shared/snapshot.ts';
import { sectionState } from './section-state.ts';

// The leader's tap targets: every section of the current song. A tap asks Live to jump there on the
// next downbeat. Only the leader and producer pages show them. During a count-in a tap in its song
// moves the count-in's target, so a target there is enabled the way the server judges it: off on a
// section the count-in cannot land on, which is the Count Off, anything before it, or a Pad. A tap
// in another song is an ordinary jump.

export function JumpTargets({
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
  const song = now && set.songs.find((candidate) => candidate.number === now.song);
  if (!now || !song) return null;
  const held = countIn && jump !== null && jump.song === song.number;

  return (
    <section className="jump-targets" aria-label="Jump to a section">
      {song.sections.map((section, index) => {
        const address = { song: song.number, section: index };
        const { waiting, classes } = sectionState(address, now, jump, loop);
        const enabled = available && (!held || countInLandsOn(song, index));
        return (
          <button
            key={section.time}
            type="button"
            className={['jump-target', classes, !enabled && 'unavailable'].filter(Boolean).join(' ')}
            aria-pressed={waiting}
            disabled={!enabled}
            onClick={() => send({ kind: 'jump', ...address })}
          >
            {section.name}
          </button>
        );
      })}
    </section>
  );
}
