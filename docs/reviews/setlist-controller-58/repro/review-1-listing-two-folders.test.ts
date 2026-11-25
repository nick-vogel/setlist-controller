import { expect, it } from 'vitest';
import { planListing } from '../src/set-builder/plan-list.ts';

// Repro for docs/reviews/setlist-controller-58/pre-pr-review-1.md, finding 2. Copy into test/ to run.

// Song 1 has two folders in its key and the plan puts a pad after it. The transition belongs on the song's own line,
// not after the last folder name the two-folders problem lists.
it('keeps the transition on the song line when the song has two folders in its key', () => {
  const problem = '"A" in D has 2 song folders in /lib; keep one:\n  A-x-D-70bpm\n  A-y-D-70bpm';
  const lines = planListing({
    date: '2026-11-01',
    plan: {
      songs: [
        { title: 'A', key: 'D', notes: [] },
        { title: 'B', key: 'Em', notes: [] },
      ],
      items: [
        { kind: 'song', position: 1 },
        { kind: 'item', title: 'Prayer', type: 'item' },
        { kind: 'song', position: 2 },
      ],
    },
    picks: [
      { ok: false, problem },
      { ok: true, folder: 'B-z-Em-80bpm' },
    ],
    transitions: { 1: { type: 'pad' } },
    problems: new Map(),
    sources: new Map([[1, { from: 'plan' }]]),
    warnings: [],
  });
  const folderLines = lines.join('\n').split('\n').filter((line) => line.startsWith('  A-'));
  expect(folderLines).toEqual(['  A-x-D-70bpm', '  A-y-D-70bpm']);
});
