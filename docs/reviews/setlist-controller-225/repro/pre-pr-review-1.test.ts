import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSetManifest, type SetManifestFile } from '../src/server/set-manifest.ts';
import { chartWarnings } from '../src/set-builder/plan-warnings.ts';
import { songSkeleton } from '../src/set-builder/skeleton.ts';
import { parseChart } from '../src/shared/chart.ts';
import { chartForSong, type ManifestSong } from '../src/shared/set-manifest.ts';
import type { SetList } from '../src/shared/snapshot.ts';
import { chartBlocks } from '../web/src/chart-blocks.ts';

// setlist-controller#225 pre-PR review 1: the executed proofs of findings 1 and 3 to 6. Each case is
// red at 6edac05 and asserts the behaviour the finding's brief asks for. Run it from test/: copy it
// there, run it, and remove the copy.

describe('finding 1: a block counts bars in its own song meter', () => {
  it('counts an 8-bar Verse of a 6/8 song (24 beats, 3 beats a bar) as 8 bars', () => {
    const set: SetList = {
      songs: [
        {
          number: 1,
          title: 'Great Are You Lord',
          sections: [
            { name: 'Count Off', time: 0, end: 6, cue: 0 },
            { name: 'Verse 1', time: 6, end: 30, cue: 1 },
            { name: 'Chorus', time: 30, end: 54, cue: 2 },
          ],
          end: 54,
          endCue: 3,
        },
      ],
      warnings: [],
    } as unknown as SetList;
    const verse = chartBlocks(set, 1, [], 3).find((block) => block.name === 'Verse 1');
    expect(verse?.bars).toBe(8);
  });
});

describe('finding 3: the nth set song of a title takes the nth manifest entry of that title', () => {
  const songs: ManifestSong[] = [
    { title: 'Made Up Song', stemsKey: 'G' },
    { title: 'made up song', stemsKey: 'A', chartKey: 'G', chartText: 'VERSE\n[G]Made up words' },
  ];
  const titles = ['Made Up Song', 'Other Made Up Song', 'Made Up Song'];
  it('gives the second Made Up Song of the set the second entry, its chart and its stems key', () => {
    const found = chartForSong(songs, titles, 2);
    expect(found?.chartText).toBe('VERSE\n[G]Made up words');
    expect(found?.stemsKey).toBe('A');
  });
  it('gives the first Made Up Song of the set no chart, as its own entry has none', () => {
    expect(chartForSong(songs, titles, 0)).toBeUndefined();
  });
});

describe('finding 4: one throw in onChange stops no later read', () => {
  let file: SetManifestFile | undefined;
  afterEach(() => file?.close());

  it('reads a later change after onChange threw once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = join(await mkdtemp(join(tmpdir(), 'review-1-')), 'set-manifest.json');
    await writeFile(path, JSON.stringify({ songs: [] }));
    let calls = 0;
    file = await startSetManifest({
      path,
      onChange: () => {
        calls += 1;
        if (calls === 1) throw new Error('made up publish failure');
      },
    });
    await writeFile(path, JSON.stringify({ songs: [{ title: 'A', stemsKey: null }] }));
    await file.reload().catch(() => {});
    await writeFile(path, JSON.stringify({ songs: [{ title: 'B', stemsKey: null }] }));
    await file.reload().catch(() => {});
    expect(file.charts().songs.map(({ title }) => title)).toEqual(['B']);
    expect(calls).toBe(2);
  });
});

describe('finding 5: the skeleton leaves End out without a note', () => {
  it('treats an End locator as the build does, an end marker', () => {
    expect(songSkeleton(['Count Off', 'Verse 1', 'Chorus', 'End'])).toEqual({ headings: ['VERSE 1', 'CHORUS'], leftOut: [] });
  });
});

describe('finding 6: --plan --list and the Charts check agree on a chart with no chords', () => {
  const hasChords = (text: string) =>
    parseChart(text).sections.some((section) => section.lines.some((line) => line.kind === 'lyrics' && line.chunks.some((chunk) => chunk.chord !== null && chunk.chord.trim() !== '')));
  it.each(['VERSE\n[ ]Made up words', '[G]Made up words before any heading\nVERSE\nmade up words', 'VERSE\nTRANSPOSE KEY [+2]\nmade up words'])('%j', (text) => {
    const warned = chartWarnings([{ title: 'Made Up Song', notes: [], chartText: text } as never]).length > 0;
    expect(warned).toBe(!hasChords(text));
  });
});
