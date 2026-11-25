import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARTS_API } from '../src/shared/routes.ts';
import { parseSetManifest, SET_MANIFEST_FILE } from '../src/shared/set-manifest.ts';
import { chartWarnings } from '../src/set-builder/plan-warnings.ts';
import { DISPLAYS, PARTS, defaultDisplay } from '../web/src/device-settings.ts';
import { REPO_ROOT } from './set-builder-harness.ts';

// The README's word on the part picker and the chart view, kept in step with the parts the picker
// offers, so a part added to one and not the other fails here.

// The README paragraph that opens with these words.
async function paragraph(opening: string): Promise<string> {
  const text = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
  return text.split('\n').find((line) => line.startsWith(opening)) ?? '';
}

describe("the README's chart view", () => {
  it('describes the part picker on the view-only page, with No part and every part it offers', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toContain('"Part" select');
    expect(roles).toContain('"No part"');
    for (const part of PARTS) expect(roles, part).toContain(part);
  });

  it('describes the chart view: the part kept on the device, one block per locator in played order, the current one at the top, on the viewer connection', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toContain('chart view');
    expect(roles).toMatch(/after a reload/);
    expect(roles).toMatch(/one block per locator, in played order/);
    expect(roles).toMatch(/bar count/);
    expect(roles).toMatch(/scrolled to the top/);
    expect(roles).toMatch(/connects as a viewer/);
  });

  it('names the chart view in the Playwright coverage, with its lyrics and chords and a changed manifest', async () => {
    const coverage = await paragraph('The Playwright suite covers');
    expect(coverage).toContain('the chart view');
    expect(coverage).toContain('chords over its lyrics');
    expect(coverage).toContain('a changed set manifest');
  });

  it('describes the set manifest: its option, its default path beside the leader secret, and the charts route', async () => {
    const manifest = await paragraph("The chart view takes each song's chart from the set manifest");

    expect(manifest).toContain('`pnpm dev:server --set-manifest <path>`');
    expect(manifest).toContain(`\`~/Library/Application Support/setlist-controller/${SET_MANIFEST_FILE}\` beside the leader secret`);
    expect(manifest).toContain(`\`${CHARTS_API}\``);
    expect(manifest).toMatch(/at start, on Refresh and whenever the file changes/);
    expect(manifest).toMatch(/With no file, every song shows no chart text/);
  });

  it("describes each block's chords over its lyrics, matched by title, the nth heading for the nth section", async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toContain('chords over its lyrics');
    // Vocals and Drums draw no chords, so every sentence that promises chords over lyrics names the
    // display that draws them.
    for (const sentence of roles.split(/(?<=\.) /).filter((text) => text.includes('chords over its lyrics'))) {
      expect(sentence).toContain('"Chords over lyrics"');
    }
    expect(roles).toMatch(/matched to the song by the title on its Count Off locator/);
    expect(roles).toMatch(/The nth section of a name takes the nth heading of that name/);
  });

  it("describes each part's default display, the Display select with every display, and the display kept for each part", async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toContain('"Display" select');
    for (const { label } of DISPLAYS) expect(roles, label).toContain(`"${label}"`);
    // Each part with the display it opens on, so a changed default fails here.
    for (const part of PARTS) {
      const label = DISPLAYS.find(({ value }) => value === defaultDisplay(part))!.label;
      expect(roles, part).toMatch(new RegExp(`Each part opens on its default display: [^.]*\\b${part}\\b[^."]*"${label}"`));
    }
    expect(roles).toMatch(/keeps the display for each part/);
    expect(roles).toMatch(/no lyrics and no chords/);
    // What Lyrics only draws: the words with no chords, the notes kept, a line of chords alone dropped.
    expect(roles).toMatch(/In "Lyrics only"[^.]*words with no chords[^.]*notes[^.]*drops a line of chords alone/);
  });

  it("describes the pinned strip: the next section and the bar countdown, Loop with no countdown, the next song's title, and no countdown in a last song with no End", async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toMatch(/pinned strip/);
    expect(roles).toMatch(/stays at the top of the screen/);
    expect(roles).toMatch(/the next section and the bars until it starts/);
    expect(roles).toMatch(/"Loop" with no countdown while the loop is on/);
    expect(roles).toMatch(/the next song's title and first section/);
    expect(roles).toMatch(/no countdown in the last section of the set's last song with no End/);
    expect(roles).toMatch(/scrolls to just under the strip/);
  });

  it("names the chart view's pinned strip and its countdown in the Playwright coverage", async () => {
    const coverage = await paragraph('The Playwright suite covers');

    expect(coverage).toContain("the chart view's pinned strip and its bar countdown");
  });

  it('describes "No chart for this song" over the blocks of a song with no chart', async () => {
    const roles = await paragraph('The URL sets the role');

    expect(roles).toMatch(/a song with no chart in the set manifest shows "No chart for this song" over its blocks' names and bar counts/);
  });

  it('names the default displays, the stored display and "No chart for this song" in the Playwright coverage', async () => {
    const coverage = await paragraph('The Playwright suite covers');

    expect(coverage).toContain("each part's default display");
    expect(coverage).toContain('a changed display kept for the part across a reload');
    expect(coverage).toContain('"No chart for this song"');
  });

  it('says in the manifest paragraph that pnpm build-set writes the manifest on every build', async () => {
    const manifest = await paragraph("The chart view takes each song's chart from the set manifest");

    expect(manifest).toContain('`pnpm build-set` writes it on every build');
  });

  it("describes in the set builder's section the manifest every build writes, its flag and default, and no chart for a build by song names", async () => {
    const flag = await paragraph('- `--set-manifest <path>`');
    const written = await paragraph('Every build also writes the set manifest');

    expect(flag).toContain(`It defaults to \`~/Library/Application Support/setlist-controller/${SET_MANIFEST_FILE}\`, the file the server reads by default.`);
    expect(written).toMatch(/replacing the last one/);
    expect(written).toMatch(/with `--plan`, the chart key and chart text of its arrangement in Planning Center/);
    expect(written).toContain('its starting meter, which the chart view counts the bars of every block but the current one in');
    expect(written).toContain('A build by song names writes no chart key and no chart text');
    expect(written).toContain('A build with a problem writes no manifest.');
  });

  it('describes the two chart warnings of --plan --list, which never stop the build or set exit 1', async () => {
    const listing = await paragraph('Check the plan before building it with `pnpm build-set --plan --list`');
    const written = await paragraph('Every build also writes the set manifest');

    // The fixed parts of the two warnings chartWarnings prints, in the README in the code's own words.
    const [noChart] = chartWarnings([{ title: 'Made Up Song', notes: [] }]);
    const [noChords] = chartWarnings([{ title: 'Made Up Song', notes: [], chartText: 'VERSE\nMade up words' }]);
    for (const [warning, words] of [
      [noChart, 'has no chart text in Planning Center'],
      [noChords, 'no chords in square brackets'],
    ]) {
      expect(warning).toContain(words);
      expect(listing).toContain(words);
    }
    expect(written).toContain('Neither chart warning of `--plan --list` stops the build or sets exit 1.');
  });

  it('describes the set manifest in the install doc, where it lives and what it holds', async () => {
    const install = await readFile(join(REPO_ROOT, 'docs/install.md'), 'utf8');
    const section = install.slice(install.indexOf('### The set manifest'), install.indexOf('## 9.'));

    expect(section).toContain(`\`~/Library/Application Support/setlist-controller/${SET_MANIFEST_FILE}\``);
    expect(section).toContain('`--set-manifest <path>`');
    expect(section).toMatch(/with no restart/);
    for (const field of ['"title"', '"stemsKey"', '"meter"', '"chartKey"', '"chartText"']) expect(section, field).toContain(field);
    expect(section).toContain('its starting meter, which the chart view counts the bars of every block but the current one in (4/4 for a song with none)');
    expect(section).toMatch(/A build by song names, with no `--plan`, writes every song with no chart/);
    expect(section).toMatch(/`pnpm build-set --plan --list` warns for each plan song with no chart text, and for chart text with no chords in square brackets/);
    // The example is a manifest the server reads.
    const example = /```json\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
    expect(parseSetManifest(example)).toEqual({ manifest: { songs: [expect.objectContaining({ title: 'Made Up Song' }), { title: 'Another Song', stemsKey: null, meter: '6/8' }] } });
  });
});
