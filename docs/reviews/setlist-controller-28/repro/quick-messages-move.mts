// Pre-PR review 1, finding 1: the producer page's quick messages move down the page on a send and
// back up on Clear, since the list of active messages above them grows and shrinks, and each Devices
// panel row above the Message the band panel gains a "Message:" line.
// Run from the repo root after `pnpm build`:
//   node docs/reviews/setlist-controller-28/repro/quick-messages-move.mts
// Exit 1 when the Repeat chorus button's page position changes after a quick message or a Clear.
import { chromium, webkit, devices, type Page } from '@playwright/test';
import { startE2eRig } from '../../../../e2e/rig.ts';

let failed = false;
const presetTop = (page: Page) =>
  page.evaluate(() => {
    const button = [...document.querySelectorAll('.message-presets button')].find((b) => b.textContent === 'Repeat chorus');
    return button ? Math.round(button.getBoundingClientRect().top + window.scrollY) : null;
  });
const headingTop = (page: Page) =>
  page.evaluate(() => {
    const heading = document.getElementById('messages');
    return heading ? Math.round(heading.getBoundingClientRect().top + window.scrollY) : null;
  });

for (const [engine, device] of [
  [chromium, devices['Pixel 7']],
  [webkit, devices['iPad (gen 7)']],
] as const) {
  const browser = await engine.launch();
  const rig = await startE2eRig();
  try {
    const open = async (url: string, name?: string) => {
      const page = await (await browser.newContext(device)).newPage();
      await page.goto(url);
      await page.getByText('Intro').first().waitFor();
      if (name) await page.getByLabel('Device name').fill(name);
      return page;
    };
    const producer = await open(rig.producerUrl);
    await open(rig.viewerUrl, 'Keys phone');
    await open(rig.viewerUrl, 'Bass phone');
    await producer.getByRole('listitem', { name: 'Bass phone' }).waitFor();
    const panel = producer.getByRole('region', { name: 'Message the band' });
    const steps: [string, number | null, number | null][] = [['before any send', await presetTop(producer), await headingTop(producer)]];

    await panel.getByLabel('View-only devices').check();
    await panel.getByRole('button', { name: 'Repeat chorus' }).click();
    await panel.getByRole('list', { name: 'Active messages' }).waitFor();
    await producer.getByRole('listitem', { name: 'Bass phone' }).getByText('Message: Repeat chorus').waitFor();
    steps.push(['after a quick message to the view-only devices', await presetTop(producer), await headingTop(producer)]);

    await panel.getByLabel('Chosen devices').check();
    await panel.getByRole('checkbox', { name: 'Keys phone, View only' }).check();
    await panel.getByRole('button', { name: 'Watch leader' }).click();
    await panel.getByRole('listitem').filter({ hasText: 'To Keys phone' }).waitFor();
    steps.push(['after a quick message to one chosen phone', await presetTop(producer), await headingTop(producer)]);

    await panel.getByRole('button', { name: 'Clear messages' }).click();
    await panel.getByText('No active message.').waitFor();
    steps.push(['after Clear messages', await presetTop(producer), await headingTop(producer)]);

    const [, first, firstHeading] = steps[0];
    for (const [label, top, heading] of steps) {
      const moved = top !== first;
      if (moved) failed = true;
      const panelShift = heading !== null && firstHeading !== null ? heading - firstHeading : '?';
      console.log(`${moved ? 'FAIL' : 'ok  '} ${engine.name()} Repeat chorus top ${label}: ${top}px (${top !== null && first !== null ? top - first : '?'}px, of which the Devices panel above moves the Message the band heading ${panelShift}px)`);
    }
  } finally {
    await rig.close();
    await browser.close();
  }
}
process.exit(failed ? 1 : 0);
