import { powerWarning, powerWarningText, type PowerState, type PowerWarningLevel } from '../../src/shared/power.ts';

// The banner the leader, producer and setup pages show while the playback Mac runs low on battery:
// amber at or below 80%, red at or below 30% or with no charge read, with the charge, and nothing on
// mains power or above 80% (power.ts). The band's pages never show it. It goes as soon as a
// snapshot says the Mac is back on mains power. Dismiss hides the warning it is at, on this page,
// until the warning changes.
export function PowerWarning({ power, onDismiss }: { power: PowerState; onDismiss(warning: PowerWarningLevel): void }) {
  const warning = powerWarning(power);
  if (warning === null) return null;
  return (
    <div className={`power-warning ${warning}`} role="alert">
      <p className="power-warning-text">{powerWarningText(power)}</p>
      <button type="button" className="power-warning-dismiss" onClick={() => onDismiss(warning)}>
        Dismiss
      </button>
    </div>
  );
}
