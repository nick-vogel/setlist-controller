import { expect, test, type Browser, type Page } from '@playwright/test';
import { startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// Each device opens in a context of its own, since pages in one context share the browser's storage
// and so its client ID: one context is one device. The battery is stubbed, since no browser here
// reports one: WebKit has no getBattery, and what Chromium reports on this machine is its own.
async function device(browser: Browser, url: string, battery: number | null = null): Promise<Page> {
  const context = await browser.newContext();
  if (battery !== null) {
    await context.addInitScript((level) => {
      Object.defineProperty(navigator, 'getBattery', { value: () => Promise.resolve(Object.assign(new EventTarget(), { level })) });
    }, battery);
  }
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByText('Intro').first()).toBeVisible();
  return page;
}

const devicesPanel = (page: Page) => page.getByRole('region', { name: 'Devices' });
const deviceRow = (page: Page, name: string) => devicesPanel(page).getByRole('listitem', { name });

// Marks the page's window, which a reload clears.
const mark = (page: Page) => page.evaluate(() => Object.assign(window, { notReloaded: true }));
const notReloaded = (page: Page) => page.evaluate(() => 'notReloaded' in window);

test("a phone named on its page is listed on the producer's Devices panel with its battery, and keeps its name and its one row after a reload", async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  const phone = await device(browser, e2e.viewerUrl, 0.42);

  await phone.getByLabel('Device name').fill('Stage left');

  const row = deviceRow(producer, 'Stage left');
  await expect(row.locator('.device-role')).toHaveText('View only');
  await expect(row.locator('.device-status')).toHaveText('Online');
  await expect(row.locator('.device-battery')).toHaveText('Battery 42%');

  await phone.reload();
  await expect(phone.getByLabel('Device name')).toHaveValue('Stage left');
  // A rename after the reload lands on the row the device had: a device that lost its client ID would
  // leave its old row offline beside the new one.
  await phone.getByLabel('Device name').fill('Stage right');
  await expect(deviceRow(producer, 'Stage right').locator('.device-status')).toHaveText('Online');
  await expect(devicesPanel(producer).getByRole('listitem')).toHaveCount(2);
});

test('Reload on a device reloads that browser alone, and the producer has no Reload on its own row', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  const keys = await device(browser, e2e.viewerUrl);
  const bass = await device(browser, e2e.viewerUrl);
  await keys.getByLabel('Device name').fill('Keys phone');
  await bass.getByLabel('Device name').fill('Bass phone');
  await expect(deviceRow(producer, 'Bass phone')).toBeVisible();
  for (const page of [producer, keys, bass]) await mark(page);

  await expect(deviceRow(producer, 'Producer').getByRole('button')).toHaveCount(0);
  const reloaded = keys.waitForEvent('load');
  await deviceRow(producer, 'Keys phone').getByRole('button', { name: 'Reload' }).click();

  await reloaded;
  expect(await notReloaded(keys)).toBe(false);
  await expect(keys.getByLabel('Device name')).toHaveValue('Keys phone');
  expect(await notReloaded(bass)).toBe(true);
  expect(await notReloaded(producer)).toBe(true);
});

test('a device that leaves stays listed Offline with when it was last seen, on the producer page and the setup screen, until Clear offline', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  const setup = await producer.context().newPage();
  await setup.goto(e2e.setupUrl);
  const drums = await device(browser, e2e.viewerUrl);
  await drums.getByLabel('Device name').fill('Drums tablet');
  await expect(deviceRow(producer, 'Drums tablet').locator('.device-status')).toHaveText('Online');

  await drums.context().close();

  for (const page of [producer, setup]) {
    await expect(deviceRow(page, 'Drums tablet').locator('.device-status')).toHaveText(/^Offline, last seen \d/);
  }
  // The setup screen lists the devices with neither button, which only the producer's socket may send.
  await expect(devicesPanel(setup).getByRole('button')).toHaveCount(0);

  await devicesPanel(producer).getByRole('button', { name: 'Clear offline' }).click();

  for (const page of [producer, setup]) await expect(deviceRow(page, 'Drums tablet')).toHaveCount(0);
  await expect(deviceRow(producer, 'Producer')).toBeVisible();
});
