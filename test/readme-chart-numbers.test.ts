import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPOS, CHORD_NAMES } from '../web/src/device-settings.ts';
import { REPO_ROOT } from './set-builder-harness.ts';

// The README's word on the chart view's Nashville numbers and capo, kept in step with what the selects
// offer, so a choice added to one and not the other fails here.

// The README paragraph that opens with these words.
async function paragraph(opening: string): Promise<string> {
  const text = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
  return text.split('\n').find((line) => line.startsWith(opening)) ?? '';
}

describe("the README's Nashville numbers and capo", () => {
  it('describes the Chord names select in Chords over lyrics, with both choices, Letters the default', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toMatch(/In "Chords over lyrics", a "Chord names" select after the "Display" select/);
    for (const { label } of CHORD_NAMES) expect(roles, label).toContain(`"${label}"`);
    expect(roles).toMatch(/"Letters", the default/);
  });

  it('says numbers count from the stems key, keep the suffix and mark a root outside the scale', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toMatch(/Numbers count from the stems key's tonic/);
    expect(roles).toMatch(/a minor key from its minor tonic against its own scale/);
    expect(roles).toMatch(/keep the chord's suffix, such as 6m, 4maj7 or 1\/3/);
    expect(roles).toMatch(/mark a root outside the scale with a flat or a sharp/);
  });

  it('describes the Capo select on each song, its range from no capo to 7, and the Capo n label', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(CAPOS.at(0)).toBe(0);
    expect(roles).toMatch(new RegExp(`a "Capo" select under its title, from "No capo", the default, to ${CAPOS.at(-1)}`));
    expect(roles).toMatch(/a capo of n shows each chord n semitones lower, as the shape key spells it, with a "Capo n" label on that song/);
    expect(roles).toContain('Numbers ignore the capo.');
  });

  it('says the device keeps the chord names and each song\'s capo by its title across a reload', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toMatch(/The device keeps the chord names, and each song's capo by its title, in its own storage[^.]*after a reload/);
  });

  it('names numbers and a capo kept across a reload in the Playwright coverage', async () => {
    const coverage = await paragraph('The Playwright suite covers');

    expect(coverage).toContain('Nashville numbers and a song\'s capo kept across a reload, with the "Capo n" label on that song only');
  });

  it('keeps em-dashes out of both paragraphs', async () => {
    expect(await paragraph('The URL sets the role')).not.toContain('\u2014');
    expect(await paragraph('The Playwright suite covers')).not.toContain('\u2014');
  });
});
