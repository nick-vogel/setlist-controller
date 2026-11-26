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
  for (const page of [keys, bass]) await expect(banner(page)).toContainText('Hold after this song');

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

// The producer panel's active messages, newest first.
const activeMessages = (producer: Page) => panel(producer).getByRole('list', { name: 'Active messages' }).getByRole('listitem');
const deviceRow = (producer: Page, name: string) => producer.getByRole('region', { name: 'Devices' }).getByRole('listitem', { name });

test('the producer page shows each active message with its target and send time, and a newer one or Clear changes it at once', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  await device(browser, e2e.viewerUrl, 'Keys phone');
  await device(browser, e2e.viewerUrl, 'Bass phone');
  await expect(deviceRow(producer, 'Bass phone')).toBeVisible();
  await expect(panel(producer)).toContainText('No active message.');

  await sendMessage(producer, 'View-only devices', 'Repeat chorus');
  await sendMessage(producer, ['Keys phone, View only'], 'Watch leader');

  await expect(activeMessages(producer)).toHaveText([/^Watch leader\s*To Keys phone, View only\s*Sent \d/, /^Repeat chorus\s*To view-only devices\s*Sent \d/]);
  await expect(deviceRow(producer, 'Keys phone')).toContainText('Message: Watch leader');
  await expect(deviceRow(producer, 'Bass phone')).toContainText('Message: Repeat chorus');

  await sendMessage(producer, ['Keys phone, View only'], 'Repeat bridge');
  await expect(activeMessages(producer)).toHaveText([/^Repeat bridge\s*To Keys phone, View only/, /^Repeat chorus\s*To view-only devices/]);

  await sendMessage(producer, 'All devices', 'Hold after this song');
  await expect(activeMessages(producer)).toHaveText([/^Hold after this song\s*To all devices\s*Sent \d/]);
  await expect(deviceRow(producer, 'Bass phone')).toContainText('Message: Hold after this song');

  await panel(producer).getByRole('button', { name: 'Clear messages' }).click();
  await expect(activeMessages(producer)).toHaveCount(0);
  await expect(panel(producer)).toContainText('No active message.');
  await expect(deviceRow(producer, 'Keys phone')).not.toContainText('Message:');
});

test('a producer page that reloads shows the active message again', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  await device(browser, e2e.viewerUrl, 'Keys phone');
  await expect(deviceRow(producer, 'Keys phone')).toBeVisible();
  await sendMessage(producer, ['Keys phone, View only'], 'Watch leader');
  await expect(activeMessages(producer)).toHaveText([/^Watch leader\s*To Keys phone, View only/]);

  await producer.reload();

  await expect(activeMessages(producer)).toHaveText([/^Watch leader\s*To Keys phone, View only\s*Sent \d/]);
  await expect(deviceRow(producer, 'Keys phone')).toContainText('Message: Watch leader');
});

test("a Dismiss on a phone shows as dismissed on that phone's row alone at once, stays across its reload, and goes with a newer message or Clear", async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  const keys = await device(browser, e2e.viewerUrl, 'Keys phone');
  await device(browser, e2e.viewerUrl, 'Bass phone');
  await expect(deviceRow(producer, 'Bass phone')).toBeVisible();
  await sendMessage(producer, 'All devices', 'Hold after this song');
  await expect(banner(keys)).toContainText('Hold after this song');

  await banner(keys).getByRole('button', { name: 'Dismiss' }).click();

  await expect(deviceRow(producer, 'Keys phone')).toContainText('Message: Hold after this song, dismissed');
  await expect(deviceRow(producer, 'Bass phone')).toContainText('Message: Hold after this song');
  await expect(deviceRow(producer, 'Bass phone')).not.toContainText('dismissed');
  await expect(activeMessages(producer)).toHaveText([/^Hold after this song\s*To all devices\s*Sent \d+\D\d+(\s*[AP]M)?$/]);

  await keys.reload();
  await expect(keys.getByText('Intro').first()).toBeVisible();
  await expect(deviceRow(producer, 'Keys phone')).toContainText('Message: Hold after this song, dismissed');

  await sendMessage(producer, 'All devices', 'Repeat chorus');
  await expect(deviceRow(producer, 'Keys phone')).toContainText('Message: Repeat chorus');
  await expect(deviceRow(producer, 'Keys phone')).not.toContainText('dismissed');

  await banner(keys).getByRole('button', { name: 'Dismiss' }).click();
  await expect(deviceRow(producer, 'Keys phone')).toContainText('Message: Repeat chorus, dismissed');
  await panel(producer).getByRole('button', { name: 'Clear messages' }).click();
  await expect(deviceRow(producer, 'Keys phone')).not.toContainText('Message:');
});

test('a Dismiss tapped while the phone is reconnecting reaches the producer page once the phone is back', async ({ page }) => {
  const proxied = await startProxiedE2eRig({ playing: false, position: 0 });
  e2e = proxied;
  const producer = await proxied.rig.connectProducer();
  await page.goto(proxied.viewerUrl);
  await expect(page.getByText('Intro').first()).toBeVisible();
  await expect.poll(async () => (await proxied.rig.devices()).length).toBe(1);
  producer.send({ kind: 'message', text: 'Repeat chorus', to: 'viewers' });
  await expect(banner(page)).toContainText('Repeat chorus');

  proxied.proxy.drop();
  await expect(page.getByText('Reconnecting to the server.')).toBeVisible();
  await banner(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner(page)).toHaveCount(0);
  proxied.proxy.restore();

  await expect.poll(() => producer.received.at(-1)?.activeMessages[0]?.dismissedBy.length, { timeout: 5000 }).toBe(1);
  producer.close();
});

test('a quick message or Clear leaves the quick messages and Clear messages where they were on the producer page', async ({ browser }) => {
  e2e = await startE2eRig();
  const producer = await device(browser, e2e.producerUrl);
  await device(browser, e2e.viewerUrl, 'Keys phone');
  await device(browser, e2e.viewerUrl, 'Bass phone');
  await expect(deviceRow(producer, 'Bass phone')).toBeVisible();
  const messages = panel(producer);
  const controls = [messages.getByRole('button', { name: 'Repeat chorus' }), messages.getByRole('button', { name: 'Clear messages' })];
  const tops = () => Promise.all(controls.map((control) => control.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)));

  await messages.getByLabel('View-only devices').check();
  const before = await tops();
  await messages.getByRole('button', { name: 'Repeat chorus' }).click();
  await expect(activeMessages(producer)).toHaveCount(1);
  await expect(deviceRow(producer, 'Bass phone')).toContainText('Message: Repeat chorus');
  expect(await tops()).toEqual(before);

  await messages.getByLabel('Chosen devices').check();
  await messages.getByRole('checkbox', { name: 'Keys phone, View only' }).check();
  const chosen = await tops();
  await messages.getByRole('button', { name: 'Watch leader' }).click();
  await expect(activeMessages(producer)).toHaveCount(2);
  await expect(deviceRow(producer, 'Keys phone')).toContainText('Message: Watch leader');
  expect(await tops()).toEqual(chosen);

  await messages.getByRole('button', { name: 'Clear messages' }).click();
  await expect(messages).toContainText('No active message.');
  await expect(deviceRow(producer, 'Keys phone')).not.toContainText('Message:');
  expect(await tops()).toEqual(chosen);
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
  // A second producer page, the longest page, which only a chosen message reaches.
  const booth = await device(browser, e2e.producerUrl, 'Booth');
  await expect(producer.getByRole('listitem', { name: 'Booth' })).toBeVisible();
  await sendMessage(producer, ['Booth, Producer'], 'Watch leader');
  await expect(banner(booth)).toBeVisible();

  await booth.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await expect.poll(() => booth.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await expect.poll(async () => (await banner(booth).boundingBox())?.y).toBe(0);
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

test('a message to all devices shows no banner on a producer page, and in one browser a Dismiss on a chosen producer page leaves a leader page alone while a Dismiss on a leader page hides it in its other tab', async ({ browser }) => {
  e2e = await startE2eRig();
  const sender = await device(browser, e2e.producerUrl);
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
  await sendMessage(sender, 'All devices', 'Hold after this song');
  for (const page of [leader, otherTab]) await expect(banner(page)).toContainText('Hold after this song');
  await expect(activeMessages(producer)).toHaveText([/^Hold after this song/]);
  for (const page of [sender, producer]) await expect(banner(page)).toHaveCount(0);

  // The browser is one device for each page role, its producer page and its leader pages, the sender's
  // only choices.
  await panel(sender).getByLabel('Chosen devices').check();
  await expect(panel(sender).getByRole('checkbox')).toHaveCount(2);
  for (const choice of await panel(sender).getByRole('checkbox').all()) await choice.check();
  await panel(sender).getByLabel('Message', { exact: true }).fill('Watch leader');
  await panel(sender).getByRole('button', { name: 'Send', exact: true }).click();
  for (const page of [producer, leader, otherTab]) await expect(banner(page)).toContainText('Watch leader');

  await banner(producer).getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner(producer)).toHaveCount(0);
  await leader.reload();
  await expect(leader.getByText('Intro').first()).toBeVisible();
  await expect(banner(leader)).toContainText('Watch leader');

  await banner(leader).getByRole('button', { name: 'Dismiss' }).click();

  await expect(banner(otherTab)).toHaveCount(0);
});


test("in one browser, a Dismiss on the producer page marks only the producer row, and a Dismiss in a second leader tab marks the leader row", async ({ browser }) => {
  e2e = await startE2eRig();
  const sender = await device(browser, e2e.producerUrl);
  const browserStorage = await browser.newContext();
  const open = async (url: string) => {
    const page = await browserStorage.newPage();
    await page.goto(url);
    await expect(page.getByText('Intro').first()).toBeVisible();
    return page;
  };
  // The device name is the browser's, so both rows go by it, and each role is its own row.
  const producer = await open(e2e.producerUrl);
  await producer.getByLabel('Device name').fill('Booth');
  await open(e2e.leaderUrl);
  const otherTab = await open(e2e.leaderUrl);
  const row = (role: RegExp) => deviceRow(sender, 'Booth').filter({ hasText: role });
  await expect(deviceRow(sender, 'Booth')).toHaveCount(2);
  await sendMessage(sender, ['Booth, Producer', 'Booth, Leader'], 'Watch leader');
  for (const page of [producer, otherTab]) await expect(banner(page)).toContainText('Watch leader');

  await banner(producer).getByRole('button', { name: 'Dismiss' }).click();

  await expect(row(/Producer/)).toContainText('Message: Watch leader, dismissed');
  await expect(row(/Leader/)).toContainText('Message: Watch leader');
  await expect(row(/Leader/)).not.toContainText('dismissed');

  await banner(otherTab).getByRole('button', { name: 'Dismiss' }).click();

  await expect(row(/Leader/)).toContainText('Message: Watch leader, dismissed');
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

test('Dismiss on the battery warning frees Safe Mode and the Setlist and Timeline switcher, and the warning shows again at red and on a new drop onto battery', async ({ browser, page }) => {
  const power = manualPowerSource({ source: 'battery', percent: 80 });
  e2e = await startE2eRig({}, SET, { power });
  await page.goto(e2e.leaderUrl);
  await expect(page.getByText('Intro').first()).toBeVisible();
  const warning = page.locator('.power-warning');
  await expect(warning).toHaveClass(/\blow\b/);

  await warning.getByRole('button', { name: 'Dismiss battery warning', exact: true }).click();
  await expect(warning).toHaveCount(0);
  const safeMode = page.getByRole('button', { name: /Safe Mode/ });
  await safeMode.click();
  await expect(safeMode).toHaveText('Safe Mode: Off');
  await page.getByRole('group', { name: 'Leader view' }).getByRole('button', { name: 'Timeline' }).click();
  await expect(page.locator('.timeline-readout-primary')).toBeVisible();
  expect(await topmostAtCentre(page, '.timeline-readout-primary')).not.toBe('power-warning');

  power.set({ source: 'battery', percent: 30 });
  await expect(warning).toHaveClass(/\burgent\b/);

  // The producer page's Playback Mac row shows when the page has drawn the mains power snapshot, which
  // the warning alone cannot, as it shows nothing on mains power.
  const producer = await device(browser, e2e.producerUrl);
  const producerWarning = producer.locator('.power-warning');
  await producerWarning.getByRole('button', { name: 'Dismiss battery warning', exact: true }).click();
  await expect(producerWarning).toHaveCount(0);
  await producer.getByRole('button', { name: /Safe Mode/ }).click();
  await expect(producer.getByRole('button', { name: /Safe Mode/ })).toHaveText('Safe Mode: On');
  power.set({ source: 'ac', percent: 30 });
  await expect(producer.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'Playback Mac' }).locator('.check-note')).toHaveText(['On mains power.']);
  power.set({ source: 'battery', percent: 30 });
  await expect(producerWarning).toHaveClass(/\burgent\b/);
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
