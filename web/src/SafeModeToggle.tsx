import type { Command } from '../../src/shared/command.ts';

// Server-wide Safe Mode status and toggle, shown on every leader and producer page. Always starts
// on when the server starts; turning it off unlocks cross-song jumps while playing and single-tap
// Pause in Timeline view for rehearsal.

export function SafeModeToggle({
  safeMode,
  available,
  send,
}: {
  safeMode: boolean;
  available: boolean;
  send(command: Command): void;
}) {
  return (
    <button
      type="button"
      className={['safe-mode-toggle', safeMode ? 'on' : 'off', !available && 'unavailable'].filter(Boolean).join(' ')}
      aria-pressed={safeMode}
      disabled={!available}
      onClick={() => send({ kind: 'set-safe-mode', enabled: !safeMode })}
    >
      <span className="safe-mode-dot" aria-hidden="true" />
      <span>{safeMode ? 'Safe Mode: On' : 'Safe Mode: Off'}</span>
    </button>
  );
}
