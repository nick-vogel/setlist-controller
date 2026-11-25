import { expect, test } from '@playwright/test';
import { fakeTarget } from '../test/fake-target.ts';
import { SET, startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

test('the producer page shows the Connections panel, and the leader page does not', async ({ page }) => {
  e2e = await startE2eRig();

  await page.goto(e2e.producerUrl);
  const panel = page.getByRole('region', { name: 'Connections' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('No connections are configured.')).toBeVisible();
  // The producer page is the leader page plus the panel: the leader's Stop is on it too.
  await expect(page.getByRole('button', { name: 'Stop Hold to stop' })).toBeVisible();

  await page.goto(e2e.leaderUrl);
  await expect(page.getByRole('button', { name: 'Stop Hold to stop' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Connections' })).toHaveCount(0);
  await expect(page.getByText('No connections are configured.')).toHaveCount(0);
});

test('the producer arms and disarms a target on its row, and an offline target turns red', async ({ page }) => {
  const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
  e2e = await startE2eRig({}, SET, { targets: [target] });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ProPresenter' });
  await expect(row).toContainText('ProPresenter');
  await expect(row).toContainText('Online');
  await expect(row).toContainText('Disarmed');

  await row.getByRole('button', { name: 'Arm', exact: true }).click();
  await expect(row).toContainText('Armed');
  await expect(row.getByRole('button', { name: 'Arm', exact: true })).toBeDisabled();

  await row.getByRole('button', { name: 'Disarm', exact: true }).click();
  await expect(row).toContainText('Disarmed');
  await expect(row.getByRole('button', { name: 'Disarm', exact: true })).toBeDisabled();

  await expect(row).not.toHaveCSS('border-top-color', 'rgb(229, 72, 77)');
  target.goOffline();
  await expect(row).toContainText('Offline');
  await expect(row).toHaveCSS('border-top-color', 'rgb(229, 72, 77)');
});

test("a target's row shows the songs and sections it cannot match", async ({ page }) => {
  const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
  target.setUnmatched(['Chorus', 'Bridge']);
  e2e = await startE2eRig({}, SET, { targets: [target] });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ProPresenter' });
  await expect(row).toContainText('Cannot match:');
  await expect(row.locator('.check-unmatched li')).toHaveText(['Chorus', 'Bridge']);
});

test('a change by hand pauses an armed target, and the producer arms it again on its row', async ({ page }) => {
  const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
  e2e = await startE2eRig({}, SET, { targets: [target] });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ProPresenter' });
  const arm = row.getByRole('button', { name: 'Arm', exact: true });
  await expect(row).toContainText('Online');
  await arm.click();
  await expect(row.locator('.connection-arm')).toHaveText('Armed');

  target.changeByHand();
  await expect(row.locator('.connection-arm')).toHaveText('Paused by hand');
  await expect(arm).toBeEnabled();
  await expect(row.getByRole('button', { name: 'Disarm', exact: true })).toBeEnabled();

  await arm.click();
  await expect(row.locator('.connection-arm')).toHaveText('Armed');
  await expect(arm).toBeDisabled();
});

test("a target's own buttons show on its row, and pressing one reaches the target", async ({ page }) => {
  const target = fakeTarget({
    name: 'propresenter',
    label: 'ProPresenter',
    buttons: [
      { id: 'clear', label: 'Clear slides' },
      { id: 'logo', label: 'Show logo' },
    ],
  });
  e2e = await startE2eRig({}, SET, { targets: [target] });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ProPresenter' });
  await expect(row).toContainText('Online');
  await expect(row.getByRole('button', { name: 'Fire again', exact: true })).toBeEnabled();
  await expect(row.getByRole('button', { name: 'Clear slides', exact: true })).toBeEnabled();
  await expect(row.getByRole('button', { name: 'Show logo', exact: true })).toBeEnabled();

  await row.getByRole('button', { name: 'Show logo', exact: true }).click();

  await expect.poll(() => target.runs).toEqual(['logo']);
  // Disarmed before the press, and disarmed after it.
  await expect(row.locator('.connection-arm')).toHaveText('Disarmed');
});
