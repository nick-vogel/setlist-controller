import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { manualPowerSource, parsePmset, pmsetPowerSource, POWER_POLL_MS, type ManualPowerSource } from '../src/server/power.ts';
import { powerWarning, UNKNOWN_POWER, type PowerState, type PowerWarningLevel } from '../src/shared/power.ts';
import type { Connection, PreServiceCheck, ProducerSnapshot, SetList, Snapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';
import { Setup } from '../web/src/Setup.tsx';
import { contrast, readStylesheet, type Element } from './css.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// `pmset -g batt` as macOS prints it: a laptop on battery, one charged on mains power, one charging,
// a Mac with no battery, and a Mac on a UPS.
const ON_BATTERY = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=35192931)\t96%; discharging; 1:34 remaining present: true\n";
const CHARGED = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=35192931)\t100%; charged; 0:00 remaining present: true\n";
const CHARGING = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=35192931)\t42%; charging; 1:10 remaining present: true\n";
const NO_BATTERY = "Now drawing from 'AC Power'\n";
const ON_UPS = "Now drawing from 'UPS Power'\n -UPS-0 (id=123)\t75%; discharging; (no estimate) present: true\n";

describe('the pmset reader', () => {
  it('reads the source and the charge', () => {
    expect(parsePmset(ON_BATTERY)).toEqual({ source: 'battery', percent: 96 });
    expect(parsePmset(CHARGED)).toEqual({ source: 'ac', percent: 100 });
    expect(parsePmset(CHARGING)).toEqual({ source: 'ac', percent: 42 });
  });

  it('reads no charge on a Mac with no battery, and a UPS as battery, since the mains is gone', () => {
    expect(parsePmset(NO_BATTERY)).toEqual({ source: 'ac', percent: null });
    expect(parsePmset(ON_UPS)).toEqual({ source: 'battery', percent: 75 });
  });

  it('reads text it does not know as not known', () => {
    expect(parsePmset('')).toEqual(UNKNOWN_POWER);
    expect(parsePmset("Now drawing from 'Something Else'\n")).toEqual(UNKNOWN_POWER);
  });

  it('reads at once, then on every poll, and reports only a read that differs', async () => {
    const clock = manualClock();
    let text = CHARGED;
    let runs = 0;
    const source = pmsetPowerSource({
      clock,
      run: async () => {
        runs += 1;
        return text;
      },
    });
    const changes: PowerState[] = [];
    source.onChange((power) => changes.push(power));
    await settle();
    expect(source.current()).toEqual({ source: 'ac', percent: 100 });

    clock.advance(POWER_POLL_MS);
    await settle();
    expect(runs).toBe(2);
    expect(changes).toEqual([{ source: 'ac', percent: 100 }]);

    text = ON_BATTERY;
    clock.advance(POWER_POLL_MS);
    await settle();
    expect(changes.at(-1)).toEqual({ source: 'battery', percent: 96 });
    await source.close();
  });

  it('reads a pmset that cannot run as not known, and reads nothing once closed', async () => {
    const clock = manualClock();
    let fail = false;
    let runs = 0;
    const source = pmsetPowerSource({
      clock,
      run: async () => {
        runs += 1;
        if (fail) throw new Error('spawn pmset ENOENT');
        return ON_BATTERY;
      },
    });
    await settle();
    expect(source.current()).toEqual({ source: 'battery', percent: 96 });

    fail = true;
    clock.advance(POWER_POLL_MS);
    await settle();
    expect(source.current()).toEqual(UNKNOWN_POWER);

    await source.close();
    clock.advance(POWER_POLL_MS * 3);
    expect(runs).toBe(2);
  });
});

describe('the battery warning', () => {
  it('shows nothing on mains power, when not known, or above 80% on battery', () => {
    expect(powerWarning({ source: 'ac', percent: 100 })).toBeNull();
    expect(powerWarning({ source: 'ac', percent: 20 })).toBeNull();
    expect(powerWarning(UNKNOWN_POWER)).toBeNull();
    expect(powerWarning({ source: 'battery', percent: 95 })).toBeNull();
    expect(powerWarning({ source: 'battery', percent: 81 })).toBeNull();
  });

  it('is amber at or below 80% on battery, and red at or below 30% or with no charge read', () => {
    expect(powerWarning({ source: 'battery', percent: 80 })).toBe('low');
    expect(powerWarning({ source: 'battery', percent: 31 })).toBe('low');
    expect(powerWarning({ source: 'battery', percent: 30 })).toBe('urgent');
    expect(powerWarning({ source: 'battery', percent: 5 })).toBe('urgent');
    expect(powerWarning({ source: 'battery', percent: null })).toBe('urgent');
  });
});

// One song in 4/4.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - End', time: 32 },
];

const powered = (power: PowerState) => Object.defineProperty((snapshot: Snapshot) => JSON.stringify(snapshot.power) === JSON.stringify(power), 'name', { value: `power ${JSON.stringify(power)}` });
const row = (snapshot: ProducerSnapshot): Connection | undefined => snapshot.connections.find((connection) => connection.name === 'power');
const checked = (check: PreServiceCheck) =>
  Object.defineProperty((snapshot: ProducerSnapshot) => loaded(snapshot) && JSON.stringify(row(snapshot)?.check) === JSON.stringify(check), 'name', { value: `check ${JSON.stringify(check)}` });

const ON_MAINS: PreServiceCheck = { kind: 'device', problems: [], notes: ['On mains power.'] };
const onBattery = (percent: number): PreServiceCheck => ({ kind: 'device', problems: [`On battery at ${percent}%. Plug in the playback Mac's power before the set starts.`], notes: [] });

async function poweredRig(power: ManualPowerSource) {
  rig = await startRig(SET, { playing: false, position: 0 }, { power });
  return rig;
}

describe('the playback Mac power on the server', () => {
  it('reaches every page in the snapshot, and each change is published', async () => {
    const power = manualPowerSource({ source: 'ac', percent: 100 });
    const rig = await poweredRig(power);
    const [viewer, leader, producer] = [await rig.connectViewer(), await rig.connectLeader(), await rig.connectProducer()];
    for (const client of [viewer, leader, producer]) await client.snapshot(powered({ source: 'ac', percent: 100 }));

    power.set({ source: 'battery', percent: 50 });
    for (const client of [viewer, leader, producer]) await client.snapshot(powered({ source: 'battery', percent: 50 }));
  });

  it('is not known with no power source, and the producer has no Playback Mac row', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const producer = await rig.connectProducer();
    const snapshot = await producer.snapshot(loaded);
    expect(snapshot.power).toEqual(UNKNOWN_POWER);
    expect(row(snapshot)).toBeUndefined();
  });

  it('passes the pre-service check on mains power, and fails it on battery at 95% and at 50%', async () => {
    const power = manualPowerSource({ source: 'ac', percent: 100 });
    const rig = await poweredRig(power);
    const producer = await rig.connectProducer();
    await producer.snapshot(checked(ON_MAINS));

    power.set({ source: 'battery', percent: 95 });
    await producer.snapshot(checked(onBattery(95)));
    power.set({ source: 'battery', percent: 50 });
    await producer.snapshot(checked(onBattery(50)));

    power.set({ source: 'ac', percent: 50 });
    const back = await producer.snapshot((snapshot) => snapshot.power.source === 'ac' && checked(ON_MAINS)(snapshot));
    expect(row(back)?.label).toBe('Playback Mac');
  });

  it('fails the check on battery with no charge read, and passes with a note when the source is not known', async () => {
    const power = manualPowerSource({ source: 'battery', percent: null });
    const rig = await poweredRig(power);
    const producer = await rig.connectProducer();
    await producer.snapshot(checked({ kind: 'device', problems: ["On battery. Plug in the playback Mac's power before the set starts."], notes: [] }));

    power.set(UNKNOWN_POWER);
    await producer.snapshot(checked({ kind: 'device', problems: [], notes: ['The power source cannot be read, so no battery warning shows.'] }));
  });

  it("shows the Playback Mac's check on the setup screen's connections too", async () => {
    const power = manualPowerSource({ source: 'battery', percent: 95 });
    const rig = await poweredRig(power);
    const status = await rig.connectionsStatus((read) => JSON.stringify(read.connections.find((connection) => connection.name === 'power')?.check) === JSON.stringify(onBattery(95)));
    expect(status.connections.map((connection) => connection.label)).toEqual(['Playback Mac']);
  });
});

const SHOWN_SET: SetList = { songs: [{ number: 1, title: 'Song A', sections: [{ name: 'Intro', time: 0, end: 16, cue: 0 }], end: 16, endCue: 1 }], warnings: [] };
const snapshotOn = (power: PowerState): ProducerSnapshot => ({
  live: 'connected',
  set: SHOWN_SET,
  playing: false,
  position: 0,
  now: null,
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop' },
  loop: null,
  safeMode: true,
  fade: null,
  chartRevision: 1,
  songMeters: { 1: 4 },
  songTimings: {},
  power,
  connections: [],
  connectionProblems: [],
  devices: [],
});
const banner = (markup: string) => /<div class="power-warning ([a-z]+)" role="alert"><p class="power-warning-text">([^<]*)<\/p><button[^>]*>([^<]*)<\/button><\/div>/.exec(markup)?.slice(1);
const page = (role: 'viewer' | 'leader' | 'producer', power: PowerState, dismissedPower: PowerWarningLevel | null = null) =>
  banner(renderToStaticMarkup(createElement(Page, { role, snapshot: snapshotOn(power), connected: true, send: () => {}, dismissedPower })));
const setup = (power: PowerState, dismissedPower: PowerWarningLevel | null = null) => banner(renderToStaticMarkup(createElement(Setup, { snapshot: snapshotOn(power), connected: true, dismissedPower })));

describe('the battery banner', () => {
  it('shows on the leader, producer and setup pages with the charge, amber at 80% and red at 30%', () => {
    for (const shown of [(power: PowerState) => page('leader', power), (power: PowerState) => page('producer', power), setup]) {
      expect(shown({ source: 'battery', percent: 80 })).toEqual(['low', 'The playback Mac is on battery at 80%. Plug in its power.', 'Dismiss']);
      expect(shown({ source: 'battery', percent: 30 })).toEqual(['urgent', 'The playback Mac is on battery at 30%. Plug in its power now.', 'Dismiss']);
      expect(shown({ source: 'battery', percent: null })).toEqual(['urgent', 'The playback Mac is on battery. Plug in its power now.', 'Dismiss']);
      expect(shown({ source: 'battery', percent: 95 })).toBeUndefined();
      expect(shown({ source: 'ac', percent: 20 })).toBeUndefined();
    }
  });

  it("never shows on the band's view-only page", () => {
    expect(page('viewer', { source: 'battery', percent: 10 })).toBeUndefined();
  });

  it('stays hidden at the warning the page dismissed, and shows at the other one', () => {
    for (const shown of [(power: PowerState, dismissed: PowerWarningLevel) => page('leader', power, dismissed), (power: PowerState, dismissed: PowerWarningLevel) => page('producer', power, dismissed), setup]) {
      expect(shown({ source: 'battery', percent: 80 }, 'low')).toBeUndefined();
      expect(shown({ source: 'battery', percent: 30 }, 'low')).toEqual(['urgent', 'The playback Mac is on battery at 30%. Plug in its power now.', 'Dismiss']);
      expect(shown({ source: 'battery', percent: 30 }, 'urgent')).toBeUndefined();
      expect(shown({ source: 'battery', percent: 80 }, 'urgent')).toEqual(['low', 'The playback Mac is on battery at 80%. Plug in its power.', 'Dismiss']);
    }
  });
});

describe("the battery banner's stylesheet", () => {
  const stylesheet = readStylesheet(resolve(import.meta.dirname, '../web/src/styles.css'));

  // WCAG 2.1 AA asks 4.5:1 of normal text.
  it('keeps its text and its Dismiss button at 4.5:1 or more on their own surfaces, amber and red', () => {
    for (const warning of ['low', 'urgent']) {
      const path: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'div', classes: ['page-top'] }, { tag: 'div', classes: ['power-warning', warning] }];
      const surface = stylesheet.value(path, 'background')!;
      const text = [...path, { tag: 'p', classes: ['power-warning-text'] }];
      expect(contrast(stylesheet.value(text, 'color') ?? stylesheet.value(path, 'color')!, surface), warning).toBeGreaterThanOrEqual(4.5);
      const button = [...path, { tag: 'button', classes: ['power-warning-dismiss'] }];
      expect(contrast(stylesheet.value(button, 'color')!, stylesheet.value(button, 'background')!), warning).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// Lets the reads the source started answer.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
