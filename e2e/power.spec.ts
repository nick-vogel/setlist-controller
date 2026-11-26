import { expect, test, type Page } from '@playwright/test';
import { manualPowerSource } from '../src/server/power.ts';
import { SET, startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// The banner on a page at each step of the power: nothing on mains power, amber at 80% on battery,
// nothing at 95%, red at 30%, and nothing back on mains power. The 95% step follows a banner that
// showed, so its going proves the page drew the 95% snapshot and not only that it had none yet.
async function walksThePowerSteps(page: Page, url: (rig: E2eRig) => string) {
  const power = manualPowerSource({ source: 'ac', percent: 100 });
  e2e = await startE2eRig({}, SET, { power });
  await page.goto(url(e2e));
  const banner = page.locator('.power-warning');
  await expect(page.getByText('Intro').first()).toBeVisible();
  await expect(banner).toHaveCount(0);

  power.set({ source: 'battery', percent: 80 });
  await expect(banner.getByRole('paragraph')).toHaveText('The playback Mac is on battery at 80%. Plug in its power.');
  await expect(banner).toHaveClass(/\blow\b/);

  power.set({ source: 'battery', percent: 95 });
  await expect(banner).toHaveCount(0);

  power.set({ source: 'battery', percent: 30 });
  await expect(banner.getByRole('paragraph')).toHaveText('The playback Mac is on battery at 30%. Plug in its power now.');
  await expect(banner).toHaveClass(/\burgent\b/);

  power.set({ source: 'ac', percent: 30 });
  await expect(banner).toHaveCount(0);
}

test('the leader page warns of the playback Mac on battery at 80% and at 30%, and clears on mains power', async ({ page }) => {
  await walksThePowerSteps(page, (rig) => rig.leaderUrl);
});

test('the producer page warns of the playback Mac on battery at 80% and at 30%, and clears on mains power', async ({ page }) => {
  await walksThePowerSteps(page, (rig) => rig.producerUrl);
});

test('the setup screen warns of the playback Mac on battery at 80% and at 30%, and clears on mains power', async ({ page }) => {
  await walksThePowerSteps(page, (rig) => rig.setupUrl);
});

test("the Playback Mac row's pre-service check fails on battery at 95% and passes on mains power", async ({ page }) => {
  const power = manualPowerSource({ source: 'ac', percent: 100 });
  e2e = await startE2eRig({}, SET, { power });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'Playback Mac' });
  await expect(row.locator('.check-note')).toHaveText(['On mains power.']);

  power.set({ source: 'battery', percent: 95 });
  await expect(row.locator('.check-problem')).toHaveText(["On battery at 95%. Plug in the playback Mac's power before the set starts."]);
  await expect(page.locator('.power-warning')).toHaveCount(0);

  await page.goto(e2e.setupUrl);
  const setupRow = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'Playback Mac' });
  await expect(setupRow.locator('.check-problem')).toHaveText(["On battery at 95%. Plug in the playback Mac's power before the set starts."]);

  power.set({ source: 'ac', percent: 96 });
  await expect(setupRow.locator('.check-note')).toHaveText(['On mains power.']);
  await expect(setupRow.locator('.check-problem')).toHaveCount(0);
});

test("Dismiss takes the setup screen's battery warning off the top of the screen, and the Playback Mac row still reports the battery", async ({ page }) => {
  const power = manualPowerSource({ source: 'battery', percent: 80 });
  e2e = await startE2eRig({}, SET, { power });
  await page.goto(e2e.setupUrl);
  const warning = page.locator('.power-warning');
  await expect(warning).toHaveClass(/\blow\b/);

  await warning.getByRole('button', { name: 'Dismiss battery warning', exact: true }).click();

  await expect(warning).toHaveCount(0);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'Playback Mac' });
  await expect(row.locator('.check-problem')).toHaveText(["On battery at 80%. Plug in the playback Mac's power before the set starts."]);
});

test("the band's view-only page never shows the battery warning", async ({ page }) => {
  const power = manualPowerSource({ source: 'battery', percent: 10 });
  e2e = await startE2eRig({}, SET, { power });
  await page.goto(e2e.viewerUrl);
  await expect(page.getByText('Intro').first()).toBeVisible();
  await expect(page.locator('.power-warning')).toHaveCount(0);
});
