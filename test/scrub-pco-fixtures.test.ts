import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT, snapshotFolder } from './set-builder-harness.ts';

const SCRIPT = join(REPO_ROOT, 'scripts/scrub-pco-fixtures.mjs');
const FIXTURES = join(REPO_ROOT, 'test/fixtures/planning-center');

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// A scratch folder under the git-ignored dist/, so no test writes to the committed fixtures or the real recording.
async function scratchFolder(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  const dir = await mkdtemp(join(REPO_ROOT, 'dist/scrub-pco-'));
  scratch.push(dir);
  return dir;
}

// The scrubber as the operator runs it. Every test but the defaults one points it at scratch folders, since a run
// with no arguments rewrites test/fixtures/planning-center/ from dist/pco-raw/.
function scrub(args: string[], script = SCRIPT, cwd = REPO_ROOT): { code: number | null; stdout: string; stderr: string } {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { code: status, stdout, stderr };
}

async function fixtureNames(): Promise<string[]> {
  return (await readdir(FIXTURES)).filter((name) => name.endsWith('.json')).sort();
}

// A raw folder holding copies of the named committed fixtures, which have the `{ path, status, body }` shape of a
// recording.
async function rawFolder(names: string[]): Promise<string> {
  const raw = join(await scratchFolder(), 'pco-raw');
  await mkdir(raw);
  for (const name of names) await cp(join(FIXTURES, name), join(raw, name));
  return raw;
}

// An output folder as a re-recording finds it: a hand-written README and a fixture the new recording does not hold.
async function seededOutput(): Promise<string> {
  const out = join(await scratchFolder(), 'planning-center');
  await mkdir(out);
  await writeFile(join(out, 'README.md'), '# Planning Center fixtures\n\nWritten by hand.\n');
  await writeFile(join(out, 'stale.json'), '{"path":"/stale","status":200,"body":null}\n');
  return out;
}

describe('the fixture scrubber', () => {
  it('replaces the JSON fixtures in the output folder and keeps every other file', async () => {
    const names = (await fixtureNames()).slice(0, 3);
    const raw = await rawFolder(names);
    const out = await seededOutput();
    const readme = await readFile(join(out, 'README.md'));

    const result = scrub(['--raw', raw, '--out', out]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`3 fixtures written to ${out}\n`);
    expect(await readFile(join(out, 'README.md'))).toEqual(readme);
    expect(existsSync(join(out, 'stale.json'))).toBe(false);
    expect((await readdir(out)).sort()).toEqual(['README.md', ...names].sort());
  });

  // Re-scrubbing the committed fixtures in place after a scrub-rule edit names one folder twice, directly or through a
  // symlink. The run reads every response before it removes a fixture, so nothing it needs is gone when it writes.
  it('scrubs a folder in place when --raw and --out name the same folder', async () => {
    const names = (await fixtureNames()).slice(0, 3);
    const raw = await rawFolder(names);
    await writeFile(join(raw, 'README.md'), '# Planning Center fixtures\n');
    const link = join(raw, '..', 'linked');
    await symlink(raw, link);

    for (const out of [raw, link]) {
      const result = scrub(['--raw', raw, '--out', out]);

      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(`3 fixtures written to ${out}\n`);
      expect((await readdir(raw)).sort()).toEqual(['README.md', ...names].sort());
      for (const name of names) expect(await readFile(join(raw, name), 'utf8'), name).toBe(await readFile(join(FIXTURES, name), 'utf8'));
    }
  });

  it('stops before it touches the output folder when the recording holds no response', async () => {
    const empty = await rawFolder([]);
    await writeFile(join(empty, 'notes.txt'), 'not a response\n');
    const missing = join(await scratchFolder(), 'pco-raw');

    for (const raw of [empty, missing]) {
      const out = await seededOutput();
      const before = await snapshotFolder(out);

      const result = scrub(['--raw', raw, '--out', out]);

      expect(result.code).toBe(1);
      expect(result.stderr).toBe(`No recorded responses in ${raw}. Record them first.\n`);
      expect(result.stdout).not.toContain('fixtures written');
      expect(await snapshotFolder(out)).toEqual(before);
    }
  });

  it('resolves a relative --raw and --out against the current directory', async () => {
    const name = (await fixtureNames())[0]!;
    const raw = await rawFolder([name]);
    const out = join(raw, '..', 'out');

    const result = scrub(['--raw', 'pco-raw', '--out', 'out'], SCRIPT, join(raw, '..'));

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`1 fixtures written to ${out}\n`);
    expect(await readdir(out)).toEqual([name]);
  });

  // The committed fixtures are already scrubbed, so scrubbing them again gives back the same bytes. That pins the
  // scrub rules, the kept meta, the key order and the trailing newline the Planning Center fake reads.
  it('writes the committed fixtures back byte for byte', async () => {
    const names = await fixtureNames();
    const raw = await rawFolder(names);
    const out = join(await scratchFolder(), 'planning-center');

    const result = scrub(['--raw', raw, '--out', out]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`${names.length} fixtures written to ${out}\n`);
    expect((await readdir(out)).sort()).toEqual(names);
    for (const name of names) expect(await readFile(join(out, name), 'utf8'), name).toBe(await readFile(join(FIXTURES, name), 'utf8'));
  });

  // A copy of the script, run from a scratch repo layout, since the real one would rewrite the committed fixtures
  // from whatever dist/pco-raw/ holds.
  it('reads dist/pco-raw/ and writes test/fixtures/planning-center/ when run with no arguments', async () => {
    const root = await scratchFolder();
    const name = (await fixtureNames())[0]!;
    await mkdir(join(root, 'scripts'));
    await cp(SCRIPT, join(root, 'scripts/scrub-pco-fixtures.mjs'));
    await mkdir(join(root, 'dist/pco-raw'), { recursive: true });
    await cp(join(FIXTURES, name), join(root, 'dist/pco-raw', name));
    const out = join(root, 'test/fixtures/planning-center');

    const result = scrub([], join(root, 'scripts/scrub-pco-fixtures.mjs'), root);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`1 fixtures written to ${out}\n`);
    expect(await readFile(join(out, name), 'utf8')).toBe(await readFile(join(FIXTURES, name), 'utf8'));
  });
});
