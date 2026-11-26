import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { eosKind } from '../src/server/eos.ts';
import { startFakeEos, type FakeEos, type FakeEosCue } from '../test/fake-eos.ts';
import { SET, startE2eRig, type E2eRig } from './rig.ts';

// The lights' row on the producer page, against the fake Eos (test/fake-eos.ts) on a port the OS
// assigns, never Eos's default 3032. The connections config is written at test time, inside the
// worktree's dist, with the fake's port, and removed after.

const REPO_ROOT = resolve(import.meta.dirname, '..');

let e2e: E2eRig | undefined;
let eos: FakeEos | undefined;
let configDir: string | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  await eos?.close();
  eos = undefined;
  if (configDir) await rm(configDir, { recursive: true, force: true });
  configDir = undefined;
});

// Starts the fake Eos, holding that show when one is given and the recorded show otherwise, and
// the rig with the lights following it, then opens the producer page. Resolves with the fake and the
// lights' row.
async function lightsRow(page: Page, show?: FakeEosCue[]) {
  const fake = await startFakeEos();
  eos = fake;
  if (show) fake.setShow(show);
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  configDir = await mkdtemp(join(REPO_ROOT, 'dist/eos-e2e-'));
  const connectionsConfig = join(configDir, 'connections.json');
  await writeFile(connectionsConfig, JSON.stringify({ targets: { eos: { host: '127.0.0.1', port: fake.port, cueList: 1 } } }));
  e2e = await startE2eRig({}, SET, { connectionsConfig, targetKinds: { eos: eosKind() } });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'Lights' });
  await expect(row).toContainText('Online');
  return { fake, row };
}

// A show of a few hundred cues, as the whole library in one cue list, each labelled.
const LIBRARY: FakeEosCue[] = Array.from({ length: 300 }, (_, index) => ({ number: String(index + 1), label: `Song ${Math.floor(index / 10) + 1} / Look ${(index % 10) + 1}` }));

test("the lights' row shows the cue Eos is on when the lights connect and the cue list it holds, then each cue fired at the console", async ({ page }) => {
  const { fake, row } = await lightsRow(page);
  const live = row.locator('.connection-state li');
  const lines = row.locator('.connection-state-list li');
  // The recorded show is on cue 8, which has no label.
  await expect(live).toHaveText(['Live cue 8']);
  await expect(lines).toHaveText([
    'Cue 1: Goodness of God / Intro',
    'Cue 2: Goodness of God / Verse 1',
    'Cue 3: Goodness of God / Chorus',
    'Cue 3.5: Goodness of God / Bridge',
    'Cue 4: Goodness of God / End',
    'Cue 5: Great Are You Lord / Count Off',
    'Cue 6: Great Are You Lord / Verse 1',
    'Cue 7: Great Are You Lord / Chorus',
    'Cue 8',
  ]);

  // The line of the cue Eos is on is marked, and no other.
  const marked = row.locator('.connection-state-list [aria-current]');
  await expect(lines.nth(8)).toHaveAttribute('aria-current', 'true');
  await expect(marked).toHaveCount(1);

  // Go To Cue 6 at the console.
  fake.fireByHand('6');
  await expect(live).toHaveText(['Live cue 6: Great Are You Lord / Verse 1']);
  await expect(lines).toHaveCount(9);
  // The mark moves to cue 6's line.
  await expect(lines.nth(6)).toHaveAttribute('aria-current', 'true');
  await expect(marked).toHaveCount(1);
});

test("a cue list of a few hundred cues scrolls inside the lights' row, which keeps its pre-service check and the rows after it on screen", async ({ page }) => {
  const { row } = await lightsRow(page, LIBRARY);
  const list = row.locator('.connection-state-list');
  await expect(list.locator('li')).toHaveCount(300);
  await expect(list.locator('li').last()).toHaveText('Cue 300: Song 30 / Look 10');

  await row.evaluate((element) => element.scrollIntoView({ block: 'start' }));

  // The page's next row: the Message the band panel follows the Connections panel.
  const next = page.getByRole('region', { name: 'Message the band' });
  await expect(next).toBeInViewport();
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  // With the next row just coming onto the bottom of the screen, the row's pre-service check, above the
  // list, is still on it.
  await next.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - (window.innerHeight - 40)));
  await expect(row.locator('.check')).toBeInViewport();
});

test('the live cue line stays in view above the cue list once the list is scrolled to its end', async ({ page }) => {
  const { fake, row } = await lightsRow(page, LIBRARY);
  const list = row.locator('.connection-state-list');
  await expect(list.getByText('Cue 300: Song 30 / Look 10', { exact: true })).toHaveCount(1);

  // Go To Cue 150 at the console. The live cue line is found by its text, wherever the row puts it.
  fake.fireByHand('150');
  const live = row.getByText('Live cue 150: Song 15 / Look 10', { exact: true });
  await expect(live).toHaveCount(1);
  await row.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(list.getByText('Cue 300: Song 30 / Look 10', { exact: true })).toBeInViewport();

  await expect(live).toBeInViewport();
  const liveBox = await live.boundingBox();
  const listBox = await list.boundingBox();
  expect(liveBox!.y + liveBox!.height).toBeLessThanOrEqual(listBox!.y);
});

test("a cue fired far down a long cue list brings its line into view inside the list, marked, and leaves the page where it was", async ({ page }) => {
  const { fake, row } = await lightsRow(page, LIBRARY);
  const list = row.locator('.connection-state-list');
  await expect(list.locator('li')).toHaveCount(300);
  // Scroll the page so the list box starts a few lines above the bottom of the screen and runs on
  // below it. Only then could a scroll that moves the page as well as the box, such as
  // scrollIntoView, show in window.scrollY.
  await list.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - (window.innerHeight - 80)));
  expect(await list.evaluate((element) => element.getBoundingClientRect().bottom > window.innerHeight)).toBe(true);
  const pageScroll = await page.evaluate(() => window.scrollY);

  // Go To Cue 280 at the console.
  fake.fireByHand('280');
  const line = list.getByText('Cue 280: Song 28 / Look 10', { exact: true });
  await expect(line).toBeInViewport();
  await expect(line).toHaveAttribute('aria-current', 'true');
  await expect(list.locator('[aria-current]')).toHaveCount(1);
  const lineBox = await line.boundingBox();
  const listBox = await list.boundingBox();
  expect(lineBox!.y).toBeGreaterThanOrEqual(listBox!.y);
  expect(lineBox!.y + lineBox!.height).toBeLessThanOrEqual(listBox!.y + listBox!.height);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
});
