// Pre-PR review 2, finding 1: the playback Mac's battery warning in .page-top has no Dismiss button
// and covers Safe Mode, the leader's Setlist/Timeline switcher, and the Timeline readout while the
// Mac runs on battery at 80% or less.
// Run from the repo root after `pnpm build`:
//   node docs/reviews/setlist-controller-11/repro/battery-warning-blocks-controls.mts
// Exit 1 when .power-warning covers the centre of Safe Mode, the Setlist/Timeline switcher, or the
// Timeline's primary now-playing line at scroll 0.
import { chromium, webkit, devices, type Page } from '@playwright/test';
import { manualPowerSource } from '../../../../src/server/power.ts';
import { SET, startE2eRig } from '../../../../e2e/rig.ts';

let failed = false;
const report = (label: string, bad: boolean, detail: string) => {
  console.log(`${bad ? 'FAIL' : 'ok  '} ${label}: ${detail}`);
  if (bad) failed = true;
};

const checkControl = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return { blocked: true, detail: 'missing' };
    const box = target.getBoundingClientRect();
    const topBar = document.querySelector('.page-top')?.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const covered = Boolean(hit?.closest('.power-warning'));
    const exposed = Math.max(0, Math.round(box.bottom - (topBar?.bottom ?? 0)));
    return {
      blocked: covered,
      detail: `y=${Math.round(box.top)}..${Math.round(box.bottom)}, pageTopBottom=${topBar ? Math.round(topBar.bottom) : 0}, exposed=${exposed}px, centreHit=${hit?.closest('.power-warning')?.className ?? 'unblocked'}`,
    };
  }, selector);

for (const [engine, device] of [
  [chromium, devices['Pixel 7']],
  [webkit, devices['iPad (gen 7)']],
] as const) {
  const browser = await engine.launch();
  const power = manualPowerSource({ source: 'battery', percent: 80 });
  const rig = await startE2eRig({ playing: true, position: 4 }, SET, { power });
  try {
    const leader = await (await browser.newContext(device)).newPage();
    await leader.goto(rig.leaderUrl);
    await leader.locator('.power-warning').waitFor();
    for (const [name, sel] of [
      ['leader Safe Mode', '.safe-mode-toggle'],
      ['leader Setlist/Timeline switcher', '.leader-mode-switcher'],
    ] as const) {
      const result = await checkControl(leader, sel);
      report(`${engine.name()} ${name}`, result.blocked, result.detail);
    }

    const producer = await (await browser.newContext(device)).newPage();
    await producer.goto(rig.producerUrl);
    await producer.locator('.power-warning').waitFor();
    const prodSafe = await checkControl(producer, '.safe-mode-toggle');
    report(`${engine.name()} producer Safe Mode`, prodSafe.blocked, prodSafe.detail);

    const timeline = await (await browser.newContext(device)).newPage();
    await timeline.goto(rig.leaderUrl);
    await timeline.evaluate(() => localStorage.setItem('setlist-controller.leader-view', 'timeline'));
    await timeline.reload();
    await timeline.locator('.timeline-readout-primary').waitFor();
    const readout = await checkControl(timeline, '.timeline-readout-primary');
    report(`${engine.name()} leader Timeline primary readout`, readout.blocked, readout.detail);
  } finally {
    await rig.close();
    await browser.close();
  }
}

process.exit(failed ? 1 : 0);
