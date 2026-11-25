import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { atemKind } from '../src/server/atem.ts';
import { fakeSwitcher } from '../test/fake-switcher.ts';
import { SET, startE2eRig, type E2eRig } from './rig.ts';

// The ATEM's row on the producer page, from its config section (Pro on input 1, Camera on input 2),
// with a fake switcher client in place of the one built on the ATEM library.

const ATEM = resolve(import.meta.dirname, '../test/fixtures/connections/atem.json');

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

test("the ATEM's Pro and Camera buttons show on its row, and pressing one reaches the switcher and shows on the row", async ({ page }) => {
  const switcher = fakeSwitcher();
  e2e = await startE2eRig({}, SET, { connectionsConfig: ATEM, targetKinds: { atem: atemKind({ client: () => switcher }) } });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ATEM' });
  await expect(row).toContainText('Online');
  const pro = row.getByRole('button', { name: 'Pro', exact: true });
  const camera = row.getByRole('button', { name: 'Camera', exact: true });
  await expect(pro).toBeEnabled();
  await expect(camera).toBeEnabled();
  await expect(row).toContainText('Program: Pro');

  await camera.click();
  await expect.poll(() => switcher.programs).toEqual([2]);
  await expect(row).toContainText('Program: Camera');

  await pro.click();
  await expect.poll(() => switcher.programs).toEqual([2, 1]);
  await expect(row).toContainText('Program: Pro');
  // Disarmed before the presses, and disarmed after them.
  await expect(row.locator('.connection-arm')).toHaveText('Disarmed');
});
