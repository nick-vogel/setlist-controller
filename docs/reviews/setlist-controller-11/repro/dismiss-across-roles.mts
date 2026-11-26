// Pre-PR review 1, finding 3: a Dismiss on the producer page hides the message on a leader page in
// the same browser, which the README counts as another device.
// Run from the repo root after `pnpm build`: node docs/reviews/setlist-controller-11/repro/dismiss-across-roles.mts
// Exit 1 when the leader page, never dismissed, shows no banner after a reload.
import { chromium } from '@playwright/test';
import { startE2eRig } from '../../../../e2e/rig.ts';

const rig = await startE2eRig();
const browser = await chromium.launch();
let failed = false;
try {
  const context = await browser.newContext();
  const producer = await context.newPage();
  await producer.goto(rig.producerUrl);
  await producer.getByText('Intro').first().waitFor();
  const leader = await context.newPage();
  await leader.goto(rig.leaderUrl);
  await leader.getByText('Intro').first().waitFor();
  await producer.locator('.device', { hasText: 'Leader' }).first().waitFor();

  const panel = producer.getByRole('region', { name: 'Message the band' });
  await panel.getByLabel('All devices').check();
  await panel.getByRole('button', { name: 'Hold after this song' }).click();
  await producer.locator('.message-banner').waitFor();
  await leader.locator('.message-banner').waitFor();
  console.log('both pages show the banner');

  await producer.locator('.message-banner').getByRole('button', { name: 'Dismiss' }).click();
  await leader.reload();
  await leader.getByText('Intro').first().waitFor();
  await leader.waitForTimeout(1000);
  const shown = await leader.locator('.message-banner').count();
  console.log(`leader page after a reload, never dismissed there: ${shown} banner(s)`);
  failed = shown === 0;
} finally {
  await browser.close();
  await rig.close();
}
process.exit(failed ? 1 : 0);
