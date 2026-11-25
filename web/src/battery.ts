// The device's battery, which the page reports in its hello (src/shared/devices.ts): the percent
// charged, or null where the browser does not report it. Safari has no getBattery, and Chrome 103 and
// later offer it only in a secure context (MDN, Navigator.getBattery), so a band phone on the stage
// network over plain HTTP reports none.

export type BatteryManagerLike = EventTarget & {
  // The charge, from 0 to 1.
  level: number;
};

export type BatteryNavigator = { getBattery?(): Promise<BatteryManagerLike> };

// Calls onPercent with the battery once it answers, and again on each change of its level. Returns
// the function that stops it.
export function watchBattery(navigator: BatteryNavigator, onPercent: (percent: number | null) => void): () => void {
  let stopped = false;
  let battery: BatteryManagerLike | null = null;
  const report = () => {
    if (!stopped && battery) onPercent(Math.round(battery.level * 100));
  };
  const answer = navigator.getBattery ? navigator.getBattery() : Promise.reject(new Error('No getBattery'));
  answer.then(
    (answered) => {
      if (stopped) return;
      battery = answered;
      battery.addEventListener('levelchange', report);
      report();
    },
    () => {
      if (!stopped) onPercent(null);
    },
  );
  return () => {
    stopped = true;
    battery?.removeEventListener('levelchange', report);
  };
}
