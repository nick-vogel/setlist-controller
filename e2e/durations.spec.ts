import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { ManifestSong } from '../src/shared/set-manifest.ts';
import { loaded, removeManifestFiles, writeManifestFile } from '../test/harness.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

// Song and set durations on the leader's iPad and on a phone: each song's length under its title, the whole set's over
// the setlist, gaps included, and the time left in the song and the set as Live plays, from the build's set manifest,
// or from Live's tempo for a set the build did not time.

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  await removeManifestFiles();
});

// Three titled songs, each a Count Off of 8 beats, a Verse and a Chorus of 16 and an End, 8 beats apart. Song n
// starts at beat 48 * (n - 1).
const SET: CuePoint[] = [1, 2, 3].flatMap((number) => {
  const start = 48 * (number - 1);
  return [
    { name: `${number} - Count Off (Long Song Title Number ${number})`, time: start },
    { name: `${number} - Verse`, time: start + 8 },
    { name: `${number} - Chorus`, time: start + 24 },
    { name: `${number} - End`, time: start + 40 },
  ];
});

// The build's seconds. Song 2 slows into its Chorus, so its seconds are not its beats at any one tempo.
const span = (beats: number, seconds: number) => ({ beats, seconds });
const BUILT: ManifestSong[] = [
  { title: 'Long Song Title Number 1', stemsKey: 'G', durations: { sections: [span(8, 4), span(16, 8), span(16, 8)], gap: span(8, 4) } },
  { title: 'Long Song Title Number 2', stemsKey: 'D', durations: { sections: [span(8, 4), span(16, 8), span(16, 70)], gap: span(8, 4) } },
  { title: 'Long Song Title Number 3', stemsKey: 'A', durations: { sections: [span(8, 4), span(16, 8), span(16, 8)], gap: null } },
];

const timeLeft = (page: Page) => page.getByRole('region', { name: 'Now playing' }).locator('.now-time-left');
const songDurations = (page: Page) => page.locator('.song-duration');

// The line shows all of its text on one line: nothing cut short, nothing wrapped.
async function expectWhole(line: Locator) {
  const shown = await line.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return { cut: element.scrollWidth > element.clientWidth, lines: range.getClientRects().length };
  });
  expect(shown).toEqual({ cut: false, lines: 1 });
}

test("the setlist shows each song's duration and the set's, and Now playing the time left, from the build's manifest", async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 8 }, SET, { setManifest: await writeManifestFile(BUILT) });
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && Object.keys(snapshot.songTimings).length === 3);
  await page.goto(e2e.leaderUrl);

  await expect(songDurations(page)).toHaveText(['0:20', '1:22', '0:20']);
  // 20 + 4 + 82 + 4 + 20 seconds.
  await expect(page.locator('.set-duration')).toHaveText('Set 2:10');
  // At the start of song 1's Verse: 16 seconds of the song are left, and 126 of the set.
  await expect(timeLeft(page)).toHaveText('0:16 left in song · 2:06 left in set');
  await expectWhole(timeLeft(page));

  // Into song 2's Chorus, a quarter of the way: 52.5 seconds of it are left.
  e2e.rig.live.setPosition(48 + 28);
  await expect(timeLeft(page)).toHaveText('0:53 left in song · 1:17 left in set');

  // A loop on the Chorus plays for as long as the leader keeps it.
  e2e.rig.live.setLoop({ on: true, start: 48 + 24, length: 16 });
  await expect(timeLeft(page)).toHaveText('~0:53 left in song · ~1:17 left in set');
  await expectWhole(timeLeft(page));
});

test("a set the build did not time shows a song's duration once Live plays in it, by Live's tempo, and the set's as a minimum", async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 8, tempo: 120 }, SET);
  const watcher = await e2e.rig.connectViewer();
  await watcher.snapshot((snapshot) => loaded(snapshot) && snapshot.songTimings[1] !== undefined);
  await page.goto(e2e.leaderUrl);

  // 40 beats at 120 BPM. No other song has been played in, and no gap is known.
  await expect(songDurations(page)).toHaveText(['0:20']);
  await expect(page.locator('.set-duration')).toHaveText('Set at least 0:20');
  await expect(timeLeft(page)).toHaveText('0:16 left in song · at least 0:16 left in set');

  // Song 2 at 96 BPM: 40 beats are 25 seconds. Live reports the next song's tempo as it plays into it, and song 1 keeps
  // the timing Live first played it at.
  e2e.rig.live.setTempo(96);
  e2e.rig.live.setPosition(48 + 8);
  await expect(songDurations(page)).toHaveText(['0:20', '0:25']);
  await expect(page.locator('.set-duration')).toHaveText('Set at least 0:45');
});
