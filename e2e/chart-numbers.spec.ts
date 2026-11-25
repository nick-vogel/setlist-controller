import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { SET_MANIFEST_FILE, type SetManifest } from '../src/shared/set-manifest.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

// The chart view's Nashville numbers and a capo per song, both kept by the device across a reload:
// numbers count from the stems key and ignore the capo, and a capo shows the letters in its shapes
// with a "Capo n" label on that song only.

let e2e: E2eRig | undefined;
// The folder the test's set manifest goes in, inside the worktree's dist, never the home folder.
let folder: string | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
});

// Made Up Song and Short Song, each with its title on its first locator so its chart matches it.
const SET: CuePoint[] = [
  { name: '1 - Count Off (Made Up Song)', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Chorus', time: 56 },
  { name: '1 - End', time: 80 },
  { name: '2 - Count Off (Short Song)', time: 84 },
  { name: '2 - Intro', time: 92 },
  { name: '2 - End', time: 108 },
];
// Made Up Song's Verse, the same block in both views, since it is the first song.
const VERSE = 2;

// The fixture's Made Up Song, its chart typed in G, as is its stems key.
const FIXTURE = resolve(import.meta.dirname, '../test/fixtures/set-manifest/set-manifest.json');

// A rig whose server reads the fixture with a chart in D given to Short Song, from a folder of the
// test's own, so the second song has chords of its own and could show a label.
async function rigWithTwoCharts(): Promise<E2eRig> {
  const manifest = JSON.parse(await readFile(FIXTURE, 'utf8')) as SetManifest;
  const [made, short] = manifest.songs;
  expect([made?.title, made?.chartKey, made?.stemsKey, short?.title]).toEqual(['Made Up Song', 'G', 'G', 'Short Song']);
  manifest.songs[1] = { title: 'Short Song', stemsKey: 'D', chartKey: 'D', chartText: 'INTRO\n[D]Short song [G]words' };
  await mkdir(resolve(import.meta.dirname, '../dist'), { recursive: true });
  folder = await mkdtemp(resolve(import.meta.dirname, '../dist/chart-numbers-e2e-'));
  const path = join(folder, SET_MANIFEST_FILE);
  await writeFile(path, JSON.stringify(manifest));
  e2e = await startE2eRig({ position: 10 }, SET, { setManifest: path });
  return e2e;
}

// A label's text runs on into its select's options, so each select is found by a part of it.
const song = (page: Page, title: string) => page.locator(`section.chart[aria-label="${title}"]`);
const verse = (page: Page) => page.locator('.chart-block').nth(VERSE).locator('.chart-line');
const shortSong = (page: Page) => song(page, 'Short Song').locator('.chart-line');
const NUMBERS = ['1Morning comes on 4made up wings', '6mEvery line a 5/7borrowed thing'];
const CAPO_3 = ['EMorning comes on Amade up wings', 'C#mEvery line a B/D#borrowed thing'];

test('the device switches to Nashville numbers, sets a capo on one song, and keeps both across a reload', async ({ page }) => {
  const rig = await rigWithTwoCharts();
  await page.goto(rig.viewerUrl);
  await page.getByLabel('Part').selectOption('Keys');
  await expect(page.locator('.chart-song')).toHaveText('Made Up Song');
  await expect(verse(page)).toHaveText(['GMorning comes on Cmade up wings', 'EmEvery line a D/F#borrowed thing']);
  await expect(page.getByLabel('Chord names')).toHaveValue('letters');

  await page.getByLabel('Chord names').selectOption({ label: 'Nashville numbers' });
  await expect(verse(page)).toHaveText(NUMBERS);

  await page.getByLabel('View').selectOption({ label: 'Whole set' });
  await expect(page.locator('.chart-song')).toHaveText(['Made Up Song', 'Short Song']);
  await expect(shortSong(page)).toHaveText(['1Short song 4words']);
  await expect(page.locator('.chart-capo-label')).toHaveCount(0);

  await song(page, 'Made Up Song').getByLabel('Capo').selectOption('3');
  await expect(song(page, 'Made Up Song').locator('.chart-capo-label')).toHaveText('Capo 3');
  await expect(song(page, 'Short Song').locator('.chart-capo-label')).toHaveCount(0);
  await expect(page.locator('.chart-capo-label')).toHaveCount(1);
  // Numbers ignore the capo.
  await expect(verse(page)).toHaveText(NUMBERS);

  await page.reload();
  await expect(page.locator('.chart-song')).toHaveText(['Made Up Song', 'Short Song']);
  await expect(page.getByLabel('Chord names')).toHaveValue('numbers');
  await expect(song(page, 'Made Up Song').getByLabel('Capo')).toHaveValue('3');
  await expect(song(page, 'Short Song').getByLabel('Capo')).toHaveValue('0');
  await expect(page.locator('.chart-capo-label')).toHaveCount(1);
  await expect(song(page, 'Made Up Song').locator('.chart-capo-label')).toHaveText('Capo 3');
  await expect(verse(page)).toHaveText(NUMBERS);
  await expect(shortSong(page)).toHaveText(['1Short song 4words']);

  // In letters, the capo shows Made Up Song in its E shapes, and Short Song as before.
  await page.getByLabel('Chord names').selectOption({ label: 'Letters' });
  await expect(verse(page)).toHaveText(CAPO_3);
  await expect(shortSong(page)).toHaveText(['DShort song Gwords']);
});

// Four charted songs, each after the first with a verse and a chorus played twice, so the whole set
// runs well past one screen.
const LONG_SONGS = ['Second Song', 'Third Song', 'Fourth Song'];
const LONG_SET: CuePoint[] = [
  ...SET.slice(0, 5),
  ...LONG_SONGS.flatMap((title, index): CuePoint[] => {
    const number = index + 2;
    const start = 84 + index * 100;
    return [
      { name: `${number} - Count Off (${title})`, time: start },
      { name: `${number} - Verse`, time: start + 8 },
      { name: `${number} - Chorus`, time: start + 24 },
      { name: `${number} - Verse`, time: start + 40 },
      { name: `${number} - Chorus`, time: start + 56 },
      { name: `${number} - End`, time: start + 72 },
    ];
  }),
];

// A guitarist sets each song's capo ahead in the whole-set view, scrolled down past the current block,
// so a capo on a later song keeps the page where it is.
test('a capo set on a later song in the whole-set view keeps the page scrolled to that song', async ({ page }) => {
  const manifest = JSON.parse(await readFile(FIXTURE, 'utf8')) as SetManifest;
  const chartText = 'VERSE\n[G]Line one of the [C]verse\n[Em]Line two of the [D]verse\n[G]Line three of the [C]verse\n\nCHORUS\n[C]Line one of the [G]chorus\n[D]Line two of the [Em]chorus\n[C]Line three of the [D]chorus';
  expect(manifest.songs[0]?.title).toBe('Made Up Song');
  manifest.songs.splice(1, Infinity, ...LONG_SONGS.map((title) => ({ title, stemsKey: 'G', chartKey: 'G', chartText })));
  await mkdir(resolve(import.meta.dirname, '../dist'), { recursive: true });
  folder = await mkdtemp(resolve(import.meta.dirname, '../dist/chart-numbers-e2e-'));
  const path = join(folder, SET_MANIFEST_FILE);
  await writeFile(path, JSON.stringify(manifest));
  // Live stopped in Made Up Song's Intro, the current block at the top of the set.
  e2e = await startE2eRig({ position: 10 }, LONG_SET, { setManifest: path });

  await page.goto(e2e.viewerUrl);
  await page.getByLabel('Part').selectOption('Keys');
  await page.getByLabel('View').selectOption({ label: 'Whole set' });
  await expect(page.locator('.chart-song')).toHaveText(['Made Up Song', ...LONG_SONGS]);
  await expect(song(page, 'Fourth Song').locator('.chart-line')).toHaveCount(12);

  const capo = song(page, 'Fourth Song').getByLabel('Capo');
  await capo.scrollIntoViewIfNeeded();
  await expect(capo).toBeInViewport();
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);

  await capo.selectOption('3');
  await expect(song(page, 'Fourth Song').locator('.chart-capo-label')).toHaveText('Capo 3');
  // Two frames, so any scroll the change sets off has run.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  await expect(capo).toBeInViewport();
});
