import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './set-builder-harness.ts';

// The README's and the install doc's word on the Charts connection target and its pre-service check.

// The README paragraph that opens with these words.
async function paragraph(opening: string): Promise<string> {
  const text = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
  return text.split('\n').find((line) => line.startsWith(opening)) ?? '';
}

// The install doc's subsection under this heading, up to the next heading.
async function subsection(heading: string): Promise<string> {
  const text = await readFile(join(REPO_ROOT, 'docs/install.md'), 'utf8');
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length + 2);
  const end = rest.search(/^#{2,3} /m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the README's Charts target", () => {
  it('describes the row, its three lists, the locators it never lists, and that no band page gets it', async () => {
    const charts = await paragraph('The Charts connection target');

    expect(charts).toContain('producer page');
    expect(charts).toContain('setup screen');
    for (const heading of ['Cannot match', 'Problems', 'Notes']) expect(charts, heading).toContain(heading);
    for (const locator of ['Count Off', 'Pad', 'Pad Out', 'End']) expect(charts, locator).toContain(locator);
    expect(charts).toContain('no band page');
    expect(charts).toMatch(/whenever the manifest changes/);
    expect(charts).toContain('TRANSPOSE KEY');
    expect(charts).not.toContain('—');
  });
});

describe("the install doc's Charts check", () => {
  it('says where to read it before the service and what each list asks for', async () => {
    const check = await subsection('### Before the service: the Charts check');

    expect(check).toContain('setup screen');
    expect(check).toContain('producer page');
    for (const heading of ['Cannot match', 'Problems', 'Notes']) expect(check, heading).toContain(heading);
    expect(check).not.toContain('—');
  });

  it('closes section 12, typing a chart from the skeleton', async () => {
    const text = await readFile(join(REPO_ROOT, 'docs/install.md'), 'utf8');
    const twelve = text.indexOf("## 12. Typing a song's chart from the skeleton");
    const check = text.indexOf('### Before the service: the Charts check');
    const thirteen = text.indexOf('## 13. ');

    expect(twelve).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(twelve);
    expect(check).toBeLessThan(thirteen);
  });
});
