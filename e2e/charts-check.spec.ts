import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { SET_MANIFEST_FILE } from '../src/shared/set-manifest.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

// The Charts connection target's pre-service check, as the producer's Connections panel and the
// setup screen show it, and as no band page does. Every chart text in the fixture is made up.

let e2e: E2eRig | undefined;
// The folder a test's set manifest goes in, inside the worktree's dist, never the home folder.
let folder: string | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
});

const REPO_ROOT = resolve(import.meta.dirname, '..');
const FIXTURE = resolve(import.meta.dirname, '../test/fixtures/set-manifest/charts-check.json');

// Song 3 is a title the manifest does not hold, and song 5 has no title.
const SET: CuePoint[] = [
  { name: '1 - Count Off (Made Up Song)', time: 0 },
  { name: '1 - Intro', time: 4 },
  { name: '1 - Verse', time: 12 },
  { name: '1 - Refrain', time: 28 },
  { name: '1 - Chorus', time: 36 },
  { name: '1 - Chorus', time: 52 },
  { name: '1 - Pad', time: 68 },
  { name: '1 - Pad Out', time: 72 },
  { name: '1 - End', time: 76 },
  { name: '2 - Intro (Second Made Up Song)', time: 100 },
  { name: '2 - Verse', time: 108 },
  { name: '2 - End', time: 124 },
  { name: '3 - Verse (Song Not In Manifest)', time: 140 },
  { name: '3 - End', time: 156 },
  { name: '4 - Verse (No Chart Song)', time: 170 },
  { name: '4 - End', time: 186 },
  { name: '5 - Verse', time: 200 },
  { name: '5 - End', time: 216 },
  { name: '6 - Verse (Third Made Up Song)', time: 230 },
  { name: '6 - End', time: 246 },
];

const NAMES = ['Made Up Song: Refrain'];
const PROBLEMS = ['Song Not In Manifest: not in the set manifest', 'No Chart Song: no chart', 'Song 5: no title on its first locator, so no chart matches it'];
const NOTES = [
  'Made Up Song: dropped line "Made up words before any heading"',
  'Made Up Song: dropped line "TRANSPOSE KEY +2"',
  'Made Up Song: heading BRIDGE, no locator reaches it',
  'Second Made Up Song: no chart key, the stems key D is used',
  'Second Made Up Song: no chords in brackets',
  'Third Made Up Song: no chart key and no stems key, the chords show as typed',
];

async function startChartsRig(): Promise<E2eRig> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  folder = await mkdtemp(join(REPO_ROOT, 'dist/charts-check-e2e-'));
  const path = join(folder, SET_MANIFEST_FILE);
  await copyFile(FIXTURE, path);
  return startE2eRig({}, SET, { setManifest: path });
}

const chartsRow = (page: Page) => page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'Charts' });

async function expectCheck(row: Locator) {
  await expect(row).toContainText('Cannot match:');
  await expect(row.locator('.check-unmatched li')).toHaveText(NAMES);
  await expect(row).toContainText('Problems:');
  await expect(row.locator('.check-problems li')).toHaveText(PROBLEMS);
  await expect(row).toContainText('Notes:');
  await expect(row.locator('.check-notes li')).toHaveText(NOTES);
}

test("the producer page's Connections panel shows the Charts row's check", async ({ page }) => {
  e2e = await startChartsRig();
  await page.goto(e2e.producerUrl);

  await expectCheck(chartsRow(page));
});

test("the setup screen shows the Charts row's check", async ({ page }) => {
  e2e = await startChartsRig();
  await page.goto(e2e.setupUrl);

  await expectCheck(chartsRow(page));
});

test("a band page shows no Charts row and none of its check, with or without a part picked", async ({ page }) => {
  e2e = await startChartsRig();
  await page.goto(e2e.viewerUrl);
  // The set has loaded, so a row would have had its snapshot to draw from.
  await expect(page.getByText('Made Up Song').first()).toBeVisible();

  const shownNone = async () => {
    await expect(page.getByRole('region', { name: 'Connections' })).toHaveCount(0);
    await expect(page.getByRole('listitem', { name: 'Charts' })).toHaveCount(0);
    const text = await page.locator('body').innerText();
    for (const line of ['Cannot match:', 'Problems:', 'Notes:', ...NAMES, ...PROBLEMS, ...NOTES]) expect(text).not.toContain(line);
  };
  await shownNone();

  await page.getByLabel('Part').selectOption('Keys');
  await expect(page.locator('.chart-block-name').first()).toHaveText('Count Off');
  await shownNone();
});
