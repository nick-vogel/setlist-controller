import { describe, expect, it } from 'vitest';
import { watchBattery, type BatteryManagerLike } from '../web/src/battery.ts';

// The device's battery as the page reports it in its hello. A fake stands in for the browser's
// BatteryManager here. No browser in the e2e projects drains a battery, so the e2e spec stubs
// getBattery too; what a real phone reports, and that Chrome over plain HTTP reports none, is checked
// by hand on the stage network.

function fakeBattery(level: number): BatteryManagerLike & { set(level: number): void } {
  const battery = Object.assign(new EventTarget(), {
    level,
    set(next: number) {
      battery.level = next;
      battery.dispatchEvent(new Event('levelchange'));
    },
  });
  return battery;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the battery a page reports', () => {
  it('is the level as a whole percent, and again on each change', async () => {
    const battery = fakeBattery(0.426);
    const reported: (number | null)[] = [];
    watchBattery({ getBattery: () => Promise.resolve(battery) }, (percent) => reported.push(percent));
    await settle();

    battery.set(0.41);

    expect(reported).toEqual([43, 41]);
  });

  it('is not reported where the browser has no getBattery, as Safari and Chrome over plain HTTP have none', async () => {
    const reported: (number | null)[] = [];
    watchBattery({}, (percent) => reported.push(percent));
    await settle();

    expect(reported).toEqual([null]);
  });

  it('is not reported where getBattery refuses, as a permissions policy makes it', async () => {
    const reported: (number | null)[] = [];
    watchBattery({ getBattery: () => Promise.reject(new Error('NotAllowedError')) }, (percent) => reported.push(percent));
    await settle();

    expect(reported).toEqual([null]);
  });

  it('reports nothing more once stopped, a change on the way included', async () => {
    const battery = fakeBattery(0.5);
    const reported: (number | null)[] = [];
    const stop = watchBattery({ getBattery: () => Promise.resolve(battery) }, (percent) => reported.push(percent));
    await settle();

    stop();
    battery.set(0.2);

    expect(reported).toEqual([50]);
  });

  it('reports nothing once stopped before the battery answers', async () => {
    const reported: (number | null)[] = [];
    const stop = watchBattery({ getBattery: () => Promise.resolve(fakeBattery(0.5)) }, (percent) => reported.push(percent));

    stop();
    await settle();

    expect(reported).toEqual([]);
  });
});
