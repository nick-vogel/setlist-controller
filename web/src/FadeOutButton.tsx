import type { Command } from '../../src/shared/command.ts';
import type { FadePhase } from '../../src/shared/snapshot.ts';

// The leader's Fade out and Fade in, one button. Fade out fades the music to silence over 6 seconds
// while Live plays on, and the click and the guide keep their level. The button then reads Fade in,
// which fades the music back over 6 seconds; the music also comes back by itself over the next Count
// Off. The server fades only while Live is connected and plays, so the button is disabled otherwise,
// and while either fade runs, when a tap would change nothing.

export function FadeOutButton({
  available,
  playing,
  fade,
  send,
}: {
  available: boolean;
  playing: boolean;
  fade: FadePhase | null;
  send(command: Command): void;
}) {
  const backIn = fade === 'silent' || fade === 'in';
  const enabled = available && playing && (fade === null || fade === 'silent');
  return (
    <button
      type="button"
      className={enabled ? 'fade-out' : 'fade-out unavailable'}
      disabled={!enabled}
      onClick={() => send({ kind: backIn ? 'fade-in' : 'fade-out' })}
    >
      {backIn ? 'Fade in' : 'Fade out'}
    </button>
  );
}
