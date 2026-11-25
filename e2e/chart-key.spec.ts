import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { SET_MANIFEST_FILE, type SetManifest } from '../src/shared/set-manifest.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

// The chart view's chords in the stems' key: a chart typed in G, for stems in another key, shows each
// chord moved to that key, with its sharps or flats.

let e2e: E2eRig | undefined;
// The folder a test's set manifest goes in, inside the worktree's dist, never the home folder.
let folder: string | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
});

// Made Up Song, with its title on its first locator so its chart matches it, then a short song 2.
const SET: CuePoint[] = [
  { name: '1 - Count Off (Made Up Song)', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - Chorus', time: 56 },
  { name: '1 - End', time: 80 },
  { name: '2 - Intro', time: 84 },
  { name: '2 - End', time: 100 },
];
const VERSE = 2;

// The fixture's Made Up Song, its chart typed in G, as is the stems key the fixture gives it.
const FIXTURE = resolve(import.meta.dirname, '../test/fixtures/set-manifest/set-manifest.json');

// A rig whose server reads the fixture, with Made Up Song's stems in `stemsKey`, from a folder of the
// test's own.
async function rigWithStemsIn(stemsKey: string): Promise<E2eRig> {
  const manifest = JSON.parse(await readFile(FIXTURE, 'utf8')) as SetManifest;
  const song = manifest.songs[0]!;
  expect(song.chartKey).toBe('G');
  song.stemsKey = stemsKey;
  await mkdir(resolve(import.meta.dirname, '../dist'), { recursive: true });
  folder = await mkdtemp(resolve(import.meta.dirname, '../dist/chart-key-e2e-'));
  const path = join(folder, SET_MANIFEST_FILE);
  await writeFile(path, JSON.stringify(manifest));
  e2e = await startE2eRig({ position: 10 }, SET, { setManifest: path });
  return e2e;
}

async function verseWithKeys(page: Page, rig: E2eRig) {
  await page.goto(rig.viewerUrl);
  await page.getByLabel('Part').selectOption('Keys');
  await expect(page.locator('.chart-song')).toHaveText('Made Up Song');
  return page.locator('.chart-block').nth(VERSE).locator('.chart-line');
}

test("a chart typed in G shows its chords in the stems' key, A, with its sharps", async ({ page }) => {
  const verse = await verseWithKeys(page, await rigWithStemsIn('A'));
  await expect(verse).toHaveText(['AMorning comes on Dmade up wings', 'F#mEvery line a E/G#borrowed thing']);
});

test("a chart typed in G shows its chords in the stems' key, Bb, with its flats", async ({ page }) => {
  const verse = await verseWithKeys(page, await rigWithStemsIn('Bb'));
  await expect(verse).toHaveText(['BbMorning comes on Ebmade up wings', 'GmEvery line a F/Aborrowed thing']);
});
