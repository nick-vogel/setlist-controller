import type { Command } from '../../src/shared/command.ts';
import type { Snapshot } from '../../src/shared/snapshot.ts';

// The leader's Refresh: reads the locators from Live at once, after an edit at the laptop, instead
// of waiting for the next poll. The server reads them only while Live is connected and stopped, so
// the button is disabled otherwise.

export function RefreshButton({
  live,
  playing,
  available,
  send,
}: {
  live: Snapshot['live'];
  playing: boolean;
  available: boolean;
  send(command: Command): void;
}) {
  const enabled = available && live === 'connected' && !playing;
  return (
    <button
      type="button"
      className={enabled ? 'refresh' : 'refresh unavailable'}
      disabled={!enabled}
      onClick={() => send({ kind: 'refresh' })}
    >
      Refresh
    </button>
  );
}
