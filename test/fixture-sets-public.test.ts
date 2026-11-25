import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './set-builder-harness.ts';

// The public copy of this tree (setlist-controller#604) may hold no Live set with a path into someone's home folder,
// which names a person: a clip's absolute Path, or a preset's, as the template's Simple Delay preset once did.
const FIXTURES = join(REPO_ROOT, 'test/fixtures/set-builder');

describe('the Live sets among the fixtures', async () => {
  const sets = (await readdir(FIXTURES, { recursive: true })).filter((path) => path.endsWith('.als'));

  it('holds the template, the four library songs and the Live 8 song', () => {
    expect(sets).toHaveLength(6);
  });

  it.each(sets)('names no home folder: %s', async (path) => {
    const xml = gunzipSync(await readFile(join(FIXTURES, path))).toString('utf8');

    expect(xml.match(/\/Users\/[^/"]*/g) ?? []).toEqual([]);
  });
});
