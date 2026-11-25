import { execFile } from 'node:child_process';
import { UNKNOWN_POWER, type PowerState } from '../shared/power.ts';
import type { Clock } from './clock.ts';
import type { DeviceCheck, Target, TargetReport } from './target.ts';

// Where the server reads the playback Mac's power from. Production polls macOS's `pmset -g batt`
// (pmsetPowerSource, handed in by main.ts through start-up.ts); tests set each state by hand through
// manualPowerSource(), so no test shells out.
export type PowerSource = {
  current(): PowerState;
  // Called on each read that differs from the one before, in source or in charge.
  onChange(listener: (power: PowerState) => void): void;
  close(): Promise<void>;
};

export type ManualPowerSource = PowerSource & {
  // Reports the state as a read would, to every listener when it differs from the current one.
  set(power: PowerState): void;
};

export function manualPowerSource(start: PowerState = { source: 'ac', percent: 100 }): ManualPowerSource {
  let power = start;
  const listeners: ((power: PowerState) => void)[] = [];
  return {
    current: () => power,
    onChange: (listener) => void listeners.push(listener),
    set(next) {
      if (samePower(power, next)) return;
      power = { ...next };
      for (const listener of listeners) listener(power);
    },
    close: async () => {},
  };
}

// How often production reads the power: a kicked cord shows within this long, and pmset is cheap.
export const POWER_POLL_MS = 10_000;
// A read that takes longer than this counts as one that failed.
const PMSET_TIMEOUT_MS = 5000;

// The text `pmset -g batt` prints, or a rejection when it cannot run, as on a machine with no pmset.
export type RunPmset = () => Promise<string>;

const runPmset: RunPmset = () =>
  new Promise((resolve, reject) =>
    execFile('pmset', ['-g', 'batt'], { timeout: PMSET_TIMEOUT_MS }, (error, stdout) => (error ? reject(error) : resolve(stdout))),
  );

// Reads the power at once and then every POWER_POLL_MS on the clock. Not known until the first read
// answers, and after any read that fails or prints what parsePmset cannot read. A tick while a read
// is still on its way starts no second one.
export function pmsetPowerSource({ clock, run = runPmset }: { clock: Clock; run?: RunPmset }): PowerSource {
  let power: PowerState = UNKNOWN_POWER;
  let reading = false;
  let closed = false;
  const listeners: ((power: PowerState) => void)[] = [];
  const read = () => {
    if (reading || closed) return;
    reading = true;
    run()
      .then(parsePmset, () => UNKNOWN_POWER)
      .then((next) => {
        reading = false;
        if (closed || samePower(power, next)) return;
        power = next;
        for (const listener of listeners) listener(power);
      });
  };
  const stop = clock.every(POWER_POLL_MS, read);
  read();
  return {
    current: () => power,
    onChange: (listener) => void listeners.push(listener),
    close: async () => {
      closed = true;
      stop();
    },
  };
}

// The power in `pmset -g batt`'s text. Its first line names the source, such as "Now drawing from
// 'Battery Power'", and the line under it the battery, such as " -InternalBattery-0 (id=1234)
// 96%; discharging; 1:34 remaining present: true". UPS Power counts as battery, since the mains is
// gone. A Mac with no battery prints no battery line, so its charge is null; any source line other
// than these reads as not known.
export function parsePmset(text: string): PowerState {
  const [first = '', ...rest] = text.split('\n');
  const named = /Now drawing from '([^']+)'/.exec(first)?.[1];
  const source = named === 'AC Power' ? 'ac' : named === 'Battery Power' || named === 'UPS Power' ? 'battery' : 'unknown';
  if (source === 'unknown') return UNKNOWN_POWER;
  const charge = /\t(\d{1,3})%;/.exec(rest.join('\n'))?.[1];
  return { source, percent: charge === undefined ? null : Number(charge) };
}

function samePower(a: PowerState, b: PowerState): boolean {
  return a.source === b.source && a.percent === b.percent;
}

export type PowerTarget = Target & {
  // The power changed, so the check runs again. Nothing before the target starts.
  changed(): void;
};

// The playback Mac's own row on the producer page's Connections panel and the setup screen, whose
// pre-service check fails while the Mac runs on battery, at any charge, so an unplugged cord is
// caught before the set starts, and passes again once it is back on mains power. A source that is
// not known passes with a note, since it says nothing is wrong. It follows no cue, as the Charts
// target does: it is always online, acts on none, and offers no button. The server builds it
// whenever it has a power source (server.ts) and calls changed() each time the power changes.
export function powerTarget(source: PowerSource): PowerTarget {
  let report: TargetReport | null = null;
  return {
    name: 'power',
    label: 'Playback Mac',
    pausesOnFade: false,
    actsOn: () => false,
    buttons: [],
    start(given) {
      report = given;
      given.status('online');
    },
    stop: async () => {},
    cue: () => {},
    runButton: () => {},
    check: () => powerCheck(source.current()),
    changed: () => report?.fileChanged(),
  };
}

function powerCheck({ source, percent }: PowerState): DeviceCheck {
  if (source === 'battery') {
    const charge = percent === null ? 'On battery' : `On battery at ${percent}%`;
    return { problems: [`${charge}. Plug in the playback Mac's power before the set starts.`], notes: [] };
  }
  if (source === 'ac') return { problems: [], notes: ['On mains power.'] };
  return { problems: [], notes: ['The power source cannot be read, so no battery warning shows.'] };
}
