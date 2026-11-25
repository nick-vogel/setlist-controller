import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './set-builder-harness.ts';

// The README's section on `pnpm build-set`, kept in step with the usage text the command prints, so a flag added to one
// and not the other fails here.

const SECTION = '## Building the Sunday set';

// The usage text, as the command prints it on a usage error: run with no song, it stops before it reads or writes anything.
function usageText(): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/set-builder/main.ts'], { cwd: REPO_ROOT });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

// The README's level-2 headings in order, and the text of the set builder's section, from its heading to the next one.
async function readme(): Promise<{ headings: string[]; section: string }> {
  const text = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
  const headings = text.split('\n').filter((line) => line.startsWith('## '));
  const start = text.indexOf(`${SECTION}\n`);
  if (start === -1) return { headings, section: '' };
  const end = text.indexOf('\n## ', start + SECTION.length);
  return { headings, section: text.slice(start, end === -1 ? undefined : end) };
}

// Every distinct `--flag` the text names, sorted.
const flags = (text: string) => [...new Set(text.match(/--[a-z][a-z-]*/g) ?? [])].toSorted();

describe('the README', () => {
  it('has a section on building the Sunday set, between Development and Checks', async () => {
    const { headings } = await readme();

    expect(headings.slice(headings.indexOf('## Development'), headings.indexOf('## Checks') + 1)).toEqual(['## Development', SECTION, '## Checks']);
  });

  it('names every flag the usage text names, and no other', async () => {
    const usage = await usageText();
    const { section } = await readme();

    expect(usage.code).toBe(2);
    expect(flags(usage.stderr.slice(usage.stderr.indexOf('Usage:')))).toEqual([
      '--add',
      '--at',
      '--connections-config',
      '--date',
      '--drop',
      '--gap',
      '--library',
      '--lights',
      '--list',
      '--output-root',
      '--overlap',
      '--pad',
      '--pads',
      '--plan',
      '--plan-id',
      '--playlist',
      '--replace',
      '--service-type',
      '--set-manifest',
      '--show-folder',
      '--skeleton',
      '--swap',
      '--template',
    ]);
    expect(flags(section)).toEqual(flags(usage.stderr.slice(usage.stderr.indexOf('Usage:'))));
  });
});
