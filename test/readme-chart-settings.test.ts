import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_SIZES, VIEWS } from '../web/src/device-settings.ts';
import { REPO_ROOT } from './set-builder-harness.ts';

// The README's and the install doc's word on the chart view's settings: the views, the font size and
// the Auto-Lock tip, kept in step with what the selects offer, so a step added to one and not the
// other fails here.

// The README paragraph that opens with these words.
async function paragraph(opening: string): Promise<string> {
  const text = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
  return text.split('\n').find((line) => line.startsWith(opening)) ?? '';
}

describe("the README's chart view settings", () => {
  it('describes the View select with both views, the default first, and the whole set under the same strip and highlight', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toContain('"View" select');
    for (const { label } of VIEWS) expect(roles, label).toContain(`"${label}"`);
    expect(roles).toMatch(/"This song", the default, which shows the song the playhead is in and changes song when the next song starts/);
    expect(roles).toMatch(/"Whole set", which shows every song one after the next, in set order, with the same strip and highlight/);
  });

  it('describes the Font size select with every step, Medium the default, scaling the chart text only', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toContain('"Font size" select');
    for (const { label } of FONT_SIZES) expect(roles, label).toContain(`"${label}"`);
    expect(roles).toMatch(/"Medium", the default/);
    expect(roles).toMatch(/scales the chart's text/);
  });

  it('says the device keeps the view and the font size across a reload', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toMatch(/The device keeps the view and the font size in its own storage[^.]*after a reload/);
  });

  it('describes the Auto-Lock tip, once per device, and why the page cannot keep the screen on', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toMatch(/set Auto-Lock to Never for the service/);
    expect(roles).toMatch(/Screen timeout to its longest on Android/);
    expect(roles).toMatch(/the device keeps that the tip was shown/);
    expect(roles).toMatch(/Screen Wake Lock needs HTTPS, and the server serves plain HTTP/);
  });

  it('says no select sends anything to the server', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toContain('no select sends anything to the server');
    expect(roles).not.toContain('neither select');
  });

  it('names the whole-set view, the font size kept across a reload and the tip in the Playwright coverage', async () => {
    const coverage = await paragraph('The Playwright suite covers');

    expect(coverage).toContain('the whole-set view with every song in set order and the highlight on the current block');
    expect(coverage).toContain('a changed font size kept across a reload');
    expect(coverage).toContain('the Auto-Lock tip on the first open and not after a reload');
  });

  it("gives the band's phones their Auto-Lock step in the install doc", async () => {
    const install = await readFile(join(REPO_ROOT, 'docs/install.md'), 'utf8');
    const start = install.indexOf("## 13. The band's phones: Auto-Lock to Never");
    expect(start).toBeGreaterThan(install.indexOf('## 12.'));
    const section = install.slice(start);

    expect(section).toMatch(/Settings, then Display & Brightness, then Auto-Lock/);
    expect(section).toMatch(/Never/);
    expect(section).toMatch(/Screen timeout/);
    expect(section).toMatch(/Screen Wake Lock/);
    expect(section).toMatch(/plain HTTP/);
  });

  it('keeps em-dashes out of the new words', async () => {
    const roles = await paragraph('The URL sets the role');
    const install = await readFile(join(REPO_ROOT, 'docs/install.md'), 'utf8');

    expect(roles).not.toContain('\u2014');
    expect(install.slice(install.indexOf('## 13.'))).not.toContain('\u2014');
  });
});
