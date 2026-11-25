import { expect, test, type Locator, type Page } from '@playwright/test';
import jsqr from 'jsqr';
import { SETUP_API } from '../src/shared/routes.ts';
import type { SetupInfo } from '../src/shared/setup.ts';
import { fakeTarget } from '../test/fake-target.ts';
import { BAD_SET, BAD_SET_WARNINGS, startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// jsqr is CommonJS that sets exports.default, so under Node's interop the function sits one level down.
const jsQR = jsqr.default;

test('the setup screen lists each warning about the set by its message', async ({ page }) => {
  e2e = await startE2eRig({}, BAD_SET);
  await page.goto(e2e.setupUrl);

  const warnings = page.locator('section[aria-labelledby="warnings"] ul.warnings li');
  await expect(warnings).toHaveText(BAD_SET_WARNINGS);
});

test("the setup screen lists each connection target's label and what it cannot match", async ({ page }) => {
  const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
  target.setUnmatched(['Verse']);
  e2e = await startE2eRig({}, undefined, { targets: [target] });
  await page.goto(e2e.setupUrl);

  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'ProPresenter' });
  await expect(row).toContainText('ProPresenter');
  await expect(row).toContainText('Cannot match:');
  await expect(row.locator('.check-unmatched li')).toHaveText(['Verse']);
});

test('the setup screen draws a QR code for the leader page, one for the producer page and one for the view-only page', async ({ page }) => {
  e2e = await startE2eRig();
  await page.goto(e2e.setupUrl);
  const codes = page.locator('svg.qr');
  await expect(codes).toHaveCount(3);

  // The URLs the server puts in the codes: the laptop's address on the stage network, which the
  // rig's 127.0.0.1 is not. Asked of the server from the laptop, as the page itself does.
  const response = await page.request.get(new URL(SETUP_API, e2e.setupUrl).href);
  expect(response.ok()).toBe(true);
  const { leader, producer, view } = (await response.json()) as SetupInfo;
  expect(new Set([leader.url, producer.url, view.url]).size).toBe(3);

  expect(await decodeDrawn(page, codes.nth(0))).toBe(leader.url);
  expect(await decodeDrawn(page, codes.nth(1))).toBe(producer.url);
  expect(await decodeDrawn(page, codes.nth(2))).toBe(view.url);
});

// Reads the code as drawn on the page, as a phone camera would: a screenshot of it, turned into
// pixels by the page's own canvas, since jsqr takes pixels and not a PNG.
async function decodeDrawn(page: Page, code: Locator): Promise<string | undefined> {
  await expect(code).toBeVisible();
  const png = (await code.screenshot()).toString('base64');
  const { width, height, pixels } = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The page has no 2D canvas.');
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, pixels: Array.from(data) };
  }, png);
  return jsQR(Uint8ClampedArray.from(pixels), width, height)?.data;
}
