// Pre-PR review 1, findings 1 and 2: where the message banner sits on the page.
// Run from the repo root after `pnpm build`: node docs/reviews/setlist-controller-11/repro/banner-placement.mts
// Exit 1 when the banner moves the leader's controls on arrival, or covers the leader's stage status
// line or a phone's Reconnecting banner.
import { chromium, webkit, devices, type Page } from '@playwright/test';
import { startE2eRig, startProxiedE2eRig } from '../../../../e2e/rig.ts';

let failed = false;
const report = (label: string, bad: boolean, detail: string) => {
  console.log(`${bad ? 'FAIL' : 'ok  '} ${label}: ${detail}`);
  if (bad) failed = true;
};

// The element drawn at the centre of the first element matching the selector, as a class list.
const topmostAt = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return 'no target';
    const box = target.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit?.closest('.message-banner') ? 'message-banner' : (hit?.className || hit?.tagName || 'none');
  }, selector);

for (const [engine, device] of [[chromium, devices['Pixel 7']], [webkit, devices['iPad (gen 7)']]] as const) {
  const browser = await engine.launch();
  const rig = await startE2eRig();
  try {
    const producer = await (await browser.newContext()).newPage();
    await producer.goto(rig.producerUrl);
    await producer.getByText('Intro').first().waitFor();
    const leader = await (await browser.newContext(device)).newPage();
    await leader.goto(rig.leaderUrl);
    await leader.getByText('Intro').first().waitFor();
    await producer.locator('.device', { hasText: 'Leader' }).first().waitFor();

    const control = leader.getByRole('button', { name: /Count in/ }).first();
    const before = (await control.boundingBox())!.y;
    await producer.getByRole('region', { name: 'Message the band' }).getByLabel('All devices').check();
    await producer.getByRole('region', { name: 'Message the band' }).getByRole('button', { name: 'Repeat chorus' }).click();
    await leader.locator('.message-banner').waitFor();
    const after = (await control.boundingBox())!.y;
    report(`${engine.name()} leader Count in moves when a message arrives`, after !== before, `y ${before} -> ${after}`);

    await leader.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await leader.waitForFunction(() => window.scrollY > 100);
    const status = await topmostAt(leader, '.stage-status.sticky');
    report(`${engine.name()} leader stage status line, scrolled`, status === 'message-banner', `topmost at its centre: ${status}`);
  } finally {
    await rig.close();
  }

  const proxied = await startProxiedE2eRig({ playing: false, position: 0 });
  try {
    const producer = await proxied.rig.connectProducer();
    const phone = await (await browser.newContext(devices['Pixel 7'])).newPage();
    await phone.goto(proxied.viewerUrl);
    await phone.getByText('Intro').first().waitFor();
    for (let i = 0; i < 100 && (await proxied.rig.devices()).length < 1; i++) await phone.waitForTimeout(50);
    producer.send({ kind: 'message', text: 'Hold after this song', to: 'all' });
    await phone.locator('.message-banner').waitFor();
    proxied.proxy.drop();
    await phone.getByText('Reconnecting to the server.').waitFor();
    const atTop = await topmostAt(phone, '.server-lost');
    report(`${engine.name()} phone Reconnecting banner, at scroll 0`, atTop === 'message-banner', `topmost at its centre: ${atTop}`);
    await phone.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await phone.waitForTimeout(200);
    const scrolled = await topmostAt(phone, '.server-lost');
    report(`${engine.name()} phone Reconnecting banner, scrolled`, scrolled === 'message-banner', `topmost at its centre: ${scrolled}`);
    producer.close();
  } finally {
    await proxied.close();
    await browser.close();
  }
}
process.exit(failed ? 1 : 0);
