// The playback Mac's power, as the server last read it (src/server/power.ts): on mains power, on
// battery, or not known, as on a Mac whose power the server cannot read, and the battery's charge
// in percent, or null when the read gives none, as on a Mac with no battery.
export type PowerState = {
  source: 'ac' | 'battery' | 'unknown';
  percent: number | null;
};

// What the server holds before its first read, and for a server started with no power source.
export const UNKNOWN_POWER: PowerState = { source: 'unknown', percent: null };

export type PowerWarningLevel = 'low' | 'urgent';

// At or below this charge on battery, the leader, producer and setup pages show the amber warning.
export const LOW_BATTERY_PERCENT = 80;
// At or below this charge on battery, the warning turns red.
export const URGENT_BATTERY_PERCENT = 30;

// Which warning the leader, producer and setup pages show for the power: none on mains power, when
// the source is not known, and on battery above LOW_BATTERY_PERCENT, so a brief unplug at a full
// charge raises no banner; low at or below it; urgent at or below URGENT_BATTERY_PERCENT, and on
// battery with no charge read, since nothing says how long the Mac has left. The pre-service check
// fails on battery at any charge (src/server/power.ts), so an unplugged cord is caught before the set
// starts even where no banner shows.
export function powerWarning(power: PowerState): PowerWarningLevel | null {
  if (power.source !== 'battery') return null;
  if (power.percent === null || power.percent <= URGENT_BATTERY_PERCENT) return 'urgent';
  return power.percent <= LOW_BATTERY_PERCENT ? 'low' : null;
}

// The banner's line for a warning, with the charge when the read gave one.
export function powerWarningText(power: PowerState): string {
  const charge = power.percent === null ? 'on battery' : `on battery at ${power.percent}%`;
  return powerWarning(power) === 'urgent' ? `The playback Mac is ${charge}. Plug in its power now.` : `The playback Mac is ${charge}. Plug in its power.`;
}
