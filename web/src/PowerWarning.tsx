import { powerWarning, powerWarningText, type PowerState } from '../../src/shared/power.ts';

// The banner the leader, producer and setup pages show while the playback Mac runs low on battery:
// amber at or below 80%, red at or below 30% or with no charge read, with the charge, and nothing on
// mains power or above 80% (power.ts). The band's pages never show it. It goes as soon as a
// snapshot says the Mac is back on mains power.
export function PowerWarning({ power }: { power: PowerState }) {
  const warning = powerWarning(power);
  if (warning === null) return null;
  return (
    <p className={`power-warning ${warning}`} role="alert">
      {powerWarningText(power)}
    </p>
  );
}
