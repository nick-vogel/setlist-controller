import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './set-builder-harness.ts';

// The README's word on the chart view's transposition, so the chart module and the README do not drift
// apart on which key the chords show in.

// The README paragraph that opens with these words.
async function paragraph(opening: string): Promise<string> {
  const text = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
  return text.split('\n').find((line) => line.startsWith(opening)) ?? '';
}

describe("the README's chart key", () => {
  it("says the chords show in the stems' key, each root and slash bass moved from the chart key, with the stems key's sharps or flats", async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toContain("Chords show in the stems' key");
    expect(roles).toMatch(/root and slash bass move from the chart key to the stems key, both from the set manifest/);
    expect(roles).toMatch(/sharps or flats as the stems key takes them/);
    expect(roles).toMatch(/the rest of the chord, such as m, 7, maj7, sus4 or add9, shows as typed/);
    expect(roles).toMatch(/relative major/);
    expect(roles).not.toMatch(/no transposition yet/);
  });

  it('says a chart with no chart key, a song with no stems key, or a key the chart view cannot read shows its chords as typed', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toMatch(/A chart with no chart key, a song with no stems key, or a key the chart view cannot read as a note name shows its chords as typed/);
  });
});
