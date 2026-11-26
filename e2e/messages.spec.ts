import { expect, test, type Browser, type Page } from '@playwright/test';
import { manualPowerSource } from '../src/server/power.ts';
import { SET, startE2eRig, startProxiedE2eRig, type E2eRig, type ProxiedE2eRig } from './rig.ts';

let e2e: E2eRig | ProxiedE2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// Each device opens in a context of its own, since one context is one browser's storage, and so one
// device (e2e/devices.spec.ts).
async function device(browser: Browser, url: string, name?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  await expect(page.getByText('Intro').first()).toBeVisible();
  if (name) await page.getByLabel('Device name').fill(name);
  return page;
}

const panel = (page: Page) => page.getByRole('region', { name: 'Message the band' });
const banner = (page: Page) => page.locator('.message-banner');

async function sendMessage(producer: Page, to: 'All devices' | 'View-only devices' | string[], text: string) {
  const messages = panel(producer);
  await messages.getByLabel('Message', { exact: true }).fill(text);
  if (Array.isArray(to)) {
    await messages.getByLabel('Chosen devices').check();
    for (const choice of to) await messages.getByRole('checkbox', { name: choice }).check();
  } else {
    await messages.getByLabel(to).check();
  }
  await messages.getByRole('button', { name: 'Send', exact: true }).click();
}

test('a quick message to the view-only devices shows on each phone and on no leader page, and a typed one to a chosen phone replaces it there alone', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  const leader = await device(browser, e2e.leaderUrl);
  const keys = await device(browser, e2e.viewerUrl, 'Keys phone');
  const bass = await device(browser, e2e.viewerUrl, 'Bass phone');
  await expect(producer.getByRole('listitem', { name: 'Bass phone' })).toBeVisible();

  await panel(producer).getByLabel('View-only devices').check();
  await panel(producer).getByRole('button', { name: 'Repeat chorus' }).click();

  for (const phone of [keys, bass]) await expect(banner(phone).getByRole('paragraph')).toHaveText('Repeat chorus');
  await expect(banner(leader)).toHaveCount(0);
  await expect(banner(producer)).toHaveCount(0);

  await sendMessage(producer, ['Keys phone, View only'], 'Watch leader for the ending');

  await expect(banner(keys).getByRole('paragraph')).toHaveText('Watch leader for the ending');
  await expect(banner(keys)).toHaveCount(1);
  await expect(banner(bass).getByRole('paragraph')).toHaveText('Repeat chorus');
  await expect(banner(leader)).toHaveCount(0);
});

test('Dismiss hides the message on that device across a reload until a newer one comes, and an undismissed one shows again after a reload', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  const keys = await device(browser, e2e.viewerUrl, 'Keys phone');
  const bass = await device(browser, e2e.viewerUrl, 'Bass phone');
  await sendMessage(producer, 'All devices', 'Hold after this song');
  for (const page of [producer, keys, bass]) await expect(banner(page)).toContainText('Hold after this song');

  await banner(keys).getByRole('button', { name: 'Dismiss' }).click();

  await expect(banner(keys)).toHaveCount(0);
  await expect(banner(bass)).toContainText('Hold after this song');
  await keys.reload();
  await bass.reload();
  await expect(bass.getByText('Intro').first()).toBeVisible();
  await expect(banner(bass)).toContainText('Hold after this song');
  await expect(keys.getByText('Intro').first()).toBeVisible();
  await expect(banner(keys)).toHaveCount(0);

  await sendMessage(producer, 'All devices', 'Hold after this song');

  await expect(banner(keys)).toContainText('Hold after this song');
});

test('Clear takes the message off every device', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  const leader = await device(browser, e2e.leaderUrl, 'Leader iPad');
  const keys = await device(browser, e2e.viewerUrl, 'Keys phone');
  await expect(producer.getByRole('listitem', { name: 'Keys phone' })).toBeVisible();
  await sendMessage(producer, 'View-only devices', 'Repeat bridge');
  await sendMessage(producer, ['Leader iPad, Leader'], 'Watch leader');
  await expect(banner(keys)).toContainText('Repeat bridge');
  await expect(banner(leader)).toContainText('Watch leader');

  await panel(producer).getByRole('button', { name: 'Clear messages' }).click();

  for (const page of [keys, leader]) await expect(banner(page)).toHaveCount(0);
});

test('a phone whose connection drops and returns shows the newest message, the one sent while it was away', async ({ page }) => {
  const proxied = await startProxiedE2eRig({ playing: false, position: 0 });
  e2e = proxied;
  // The producer reaches the server around the proxy, so only the phone's connection drops.
  const producer = await proxied.rig.connectProducer();
  await page.goto(proxied.viewerUrl);
  await expect(page.getByText('Intro').first()).toBeVisible();
  await expect.poll(async () => (await proxied.rig.devices()).length).toBe(1);
  producer.send({ kind: 'message', text: 'Repeat chorus', to: 'viewers' });
  await expect(banner(page)).toContainText('Repeat chorus');

  proxied.proxy.drop();
  await expect(page.getByText('Reconnecting to the server.')).toBeVisible();
  producer.send({ kind: 'message', text: 'Hold after this song', to: 'viewers' });
  await producer.flush();
  proxied.proxy.restore();

  await expect(banner(page)).toContainText('Hold after this song', { timeout: 5000 });
  producer.close();
});

test('the banner holds to the top of a page scrolled down', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  await sendMessage(producer, 'All devices', 'Watch leader');
  await expect(banner(producer)).toBeVisible();

  await producer.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await expect.poll(() => producer.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await expect.poll(async () => (await banner(producer).boundingBox())?.y).toBe(0);
});

async function topmostAtCentre(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((target) => {
    const box = document.querySelector(target)?.getBoundingClientRect();
    if (!box) return null;
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit?.closest('.message-banner, .server-lost, .stage-status, .power-warning')?.classList[0] ?? null;
  }, selector);
}

test('a message that comes or goes leaves Count in where it was on the leader page, and the stage status line ends above the page under it', async ({ browser, page }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  await page.goto(e2e.leaderUrl);
  await expect(page.getByText('Intro').first()).toBeVisible();
  const countIn = page.getByRole('button', { name: /Count in/ }).first();
  const top = async () => (await countIn.boundingBox())?.y;
  const before = await top();
  const line = await page.getByRole('region', { name: 'Stage status' }).boundingBox();
  const firstUnder = await page.evaluate(() => Math.min(...[...document.querySelectorAll('main > :not(.page-top)')].map((element) => element.getBoundingClientRect().top)));
  expect(line!.y + line!.height).toBeLessThanOrEqual(firstUnder);

  await panel(producer).getByLabel('All devices').check();
  await panel(producer).getByRole('button', { name: 'Repeat chorus' }).click();
  await expect(banner(page)).toContainText('Repeat chorus');
  expect(await top()).toBe(before);

  await banner(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner(page)).toHaveCount(0);
  expect(await top()).toBe(before);
});

test("the banner and the leader's stage status line cover neither each other, at the top of the page or scrolled down", async ({ browser, page }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  await page.goto(e2e.leaderUrl);
  await expect(page.getByText('Intro').first()).toBeVisible();
  await sendMessage(producer, 'All devices', 'Watch leader');
  await expect(banner(page)).toBeVisible();

  expect(await topmostAtCentre(page, '.stage-status')).toBe('stage-status');
  expect(await topmostAtCentre(page, '.message-banner')).toBe('message-banner');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  expect(await topmostAtCentre(page, '.stage-status')).toBe('stage-status');
  expect(await topmostAtCentre(page, '.message-banner')).toBe('message-banner');
});

test("the banner covers no phone's Reconnecting banner, at the top of the page or scrolled down", async ({ page }) => {
  const proxied = await startProxiedE2eRig({ playing: false, position: 0 });
  e2e = proxied;
  const producer = await proxied.rig.connectProducer();
  await page.goto(proxied.viewerUrl);
  await expect(page.getByText('Intro').first()).toBeVisible();
  await expect.poll(async () => (await proxied.rig.devices()).length).toBe(1);
  producer.send({ kind: 'message', text: 'Hold after this song', to: 'all' });
  await expect(banner(page)).toContainText('Hold after this song');

  proxied.proxy.drop();
  await expect(page.getByText('Reconnecting to the server.')).toBeVisible();
  expect(await topmostAtCentre(page, '.server-lost')).toBe('server-lost');
  expect(await topmostAtCentre(page, '.message-banner')).toBe('message-banner');
  // The view-only page with no part is shorter than a phone's screen, so here it gets room to scroll.
  await page.addStyleTag({ content: 'main { padding-bottom: 150vh; }' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await topmostAtCentre(page, '.server-lost')).toBe('server-lost');
  expect(await topmostAtCentre(page, '.message-banner')).toBe('message-banner');
  producer.close();
});

test('a Dismiss on the producer page leaves the message on a leader page in the same browser, and a Dismiss on the leader page hides it in its other tab', async ({ browser }) => {
  e2e = await startE2eRig();
  const browserStorage = await browser.newContext();
  const open = async (url: string) => {
    const page = await browserStorage.newPage();
    await page.goto(url);
    await expect(page.getByText('Intro').first()).toBeVisible();
    return page;
  };
  const producer = await open(e2e.producerUrl);
  const leader = await open(e2e.leaderUrl);
  const otherTab = await open(e2e.leaderUrl);
  await sendMessage(producer, 'All devices', 'Hold after this song');
  for (const page of [producer, leader, otherTab]) await expect(banner(page)).toContainText('Hold after this song');

  await banner(producer).getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner(producer)).toHaveCount(0);
  await leader.reload();
  await expect(leader.getByText('Intro').first()).toBeVisible();
  await expect(banner(leader)).toContainText('Hold after this song');

  await banner(leader).getByRole('button', { name: 'Dismiss' }).click();

  await expect(banner(otherTab)).toHaveCount(0);
});

test("the battery warning joins the top of the leader page under the banner, and Count in stays where it was as either comes or goes", async ({ browser, page }) => {
  const power = manualPowerSource({ source: 'ac', percent: 100 });
  e2e = await startE2eRig({}, SET, { power });
  const producer = await device(browser, e2e.producerUrl);
  await page.goto(e2e.leaderUrl);
  await expect(page.getByText('Intro').first()).toBeVisible();
  const countIn = page.getByRole('button', { name: /Count in/ }).first();
  const top = async () => (await countIn.boundingBox())?.y;
  const before = await top();
  const warning = page.locator('.power-warning');

  power.set({ source: 'battery', percent: 80 });
  await expect(warning).toBeVisible();
  expect(await top()).toBe(before);

  await sendMessage(producer, 'All devices', 'Watch leader');
  await expect(banner(page)).toBeVisible();
  expect(await top()).toBe(before);
  for (const signal of ['stage-status', 'message-banner', 'power-warning']) expect(await topmostAtCentre(page, `.${signal}`)).toBe(signal);

  power.set({ source: 'ac', percent: 80 });
  await expect(warning).toHaveCount(0);
  expect(await top()).toBe(before);
});

test("the setup screen's battery warning and Reconnecting banner move nothing on the screen, and neither covers the other", async ({ page }) => {
  const power = manualPowerSource({ source: 'ac', percent: 100 });
  const proxied = await startProxiedE2eRig({}, SET, { power });
  e2e = proxied;
  await page.goto(proxied.setupUrl);
  const live = page.locator('.live-status');
  await expect(live).toHaveText('Live connected');
  const top = async () => (await live.boundingBox())?.y;
  const before = await top();

  power.set({ source: 'battery', percent: 30 });
  await expect(page.locator('.power-warning')).toBeVisible();
  expect(await top()).toBe(before);

  proxied.proxy.drop();
  await expect(page.getByText('Reconnecting to the server.')).toBeVisible();
  expect(await top()).toBe(before);
  for (const signal of ['server-lost', 'power-warning']) expect(await topmostAtCentre(page, `.${signal}`)).toBe(signal);
});
