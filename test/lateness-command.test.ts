import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { measured, text, TWO_SUNDAYS } from './lateness-fixture.ts';

// `pnpm lateness` as the operator runs it, through the package.json script, with pnpm's own output
// silenced, in Chicago's time zone. Every log it reads is a fixture in the worktree's dist, never the
// server's log in ~/Library.

const REPO_ROOT = resolve(import.meta.dirname, '..');
let logDir: string | undefined;

afterEach(async () => {
  if (logDir) await rm(logDir, { recursive: true, force: true });
  logDir = undefined;
});

// A path for a fixture log in a new, empty folder, removed after the test.
async function logPath(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  logDir = await mkdtemp(join(REPO_ROOT, 'dist/lateness-'));
  return join(logDir, 'cue-lateness.log');
}

function run(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'lateness', ...args], { cwd: REPO_ROOT, env: { ...process.env, TZ: 'America/Chicago' } });
  return new Promise((done, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => done({ code, stdout, stderr }));
  });
}

// The printed summary read back by its labels: the day headings, and for a day, target and cause,
// the row's numbers.
const days = (stdout: string) => [...stdout.matchAll(/^(\d{4}-\d\d-\d\d \w+)$/gm)].map((match) => match[1]);
function numbers(stdout: string, day: string, target: string, cause: string) {
  const block = stdout.slice(stdout.indexOf(`${day}\n`)).split(/\n\n/)[0]!;
  const group = block.slice(block.indexOf(`  ${target} (`)).split(/\n {2}(?! )/)[0]!;
  const row = group.split('\n').find((line) => line.trimStart().startsWith(`${cause}:`));
  if (!row) return null;
  const spread = (label: string) => {
    const match = new RegExp(`${label}: median (\\d+) ms, 90th percentile (\\d+) ms, max (\\d+) ms`).exec(row);
    return match ? match.slice(1).map(Number) : null;
  };
  const acted = /acted on (\d+):/.exec(row);
  return { count: Number(/count (\d+)/.exec(row)![1]), late: spread('late'), acted: acted ? [Number(acted[1]), ...spread(`acted on ${acted[1]}`)!] : null };
}

describe('pnpm lateness', () => {
  it('says in one sentence that there is no log at the path, and exits 0', async () => {
    const path = await logPath();

    const { code, stdout, stderr } = await run(['--log', path]);

    expect(code).toBe(0);
    expect(stdout).toBe(`No lateness log at ${path}.\n`);
    expect(stderr).toBe('');
  });

  it('says in one line on stderr that it could not read a folder given as the log, and exits 1', async () => {
    const folder = dirname(await logPath());

    const { code, stdout, stderr } = await run(['--log', folder]);

    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr.trimEnd().split('\n')).toHaveLength(1);
    expect(stderr.startsWith(`Could not read the lateness log at ${folder}: `)).toBe(true);
  });

  it('summarizes the good lines of a log with one malformed line, and prints the count of it once', async () => {
    const path = await logPath();
    const at = '2026-10-25T12:00:00.000Z';
    await writeFile(path, text(measured(at, 'lights', 'loop', 10), '{"time": "2026-10-25T12:0', measured(at, 'lights', 'loop', 30)));

    const { code, stdout } = await run(['--log', path]);

    expect(code).toBe(0);
    expect(numbers(stdout, '2026-10-25 Sunday', 'lights', 'loop')).toMatchObject({ count: 2, late: [10, 30, 30] });
    expect([...stdout.matchAll(/malformed/g)]).toHaveLength(1);
    expect(stdout).toMatch(/\b1 malformed line\b/);
  });

  it('reads the .1 file before the log, and counts each line once', async () => {
    const path = await logPath();
    const at = '2026-10-25T12:00:00.000Z';
    await writeFile(`${path}.1`, text(measured(at, 'lights', 'loop', 10), measured(at, 'lights', 'loop', 20)));
    await writeFile(path, text(measured(at, 'propresenter', 'loop', 30)));

    const { code, stdout } = await run(['--log', path]);

    expect(code).toBe(0);
    expect(stdout.indexOf('  lights (')).toBeGreaterThan(-1);
    expect(stdout.indexOf('  lights (')).toBeLessThan(stdout.indexOf('  propresenter ('));
    expect(numbers(stdout, '2026-10-25 Sunday', 'lights', 'all causes')!.count).toBe(2);
    expect(numbers(stdout, '2026-10-25 Sunday', 'propresenter', 'all causes')!.count).toBe(1);
  });

  it('cuts the days in local time: 23:30 and 00:30 the next day are two blocks', async () => {
    const path = await logPath();
    // In Chicago in October, 04:30 UTC is 23:30 the day before, and 05:30 UTC is 00:30.
    await writeFile(path, text(measured('2026-10-26T04:30:00.000Z', 'lights', 'loop', 10), measured('2026-10-26T05:30:00.000Z', 'lights', 'loop', 20)));

    const { stdout } = await run(['--log', path]);

    expect(days(stdout)).toEqual(['2026-10-25 Sunday', '2026-10-26 Monday']);
    expect(numbers(stdout, '2026-10-25 Sunday', 'lights', 'loop')).toMatchObject({ count: 1, late: [10, 10, 10] });
    expect(numbers(stdout, '2026-10-26 Monday', 'lights', 'loop')).toMatchObject({ count: 1, late: [20, 20, 20] });
  });

  it("prints a count-in row for a target whose log has a count-in's landing cue, and counts no line malformed", async () => {
    const path = await logPath();
    const at = '2026-10-25T12:00:00.000Z';
    await writeFile(path, text(measured(at, 'propresenter', 'count-in', 30, 120), measured(at, 'propresenter', 'played-into', 10)));

    const { code, stdout } = await run(['--log', path]);

    expect(code).toBe(0);
    expect(numbers(stdout, '2026-10-25 Sunday', 'propresenter', 'count-in')).toEqual({ count: 1, late: [30, 30, 30], acted: [1, 120, 120, 120] });
    expect(numbers(stdout, '2026-10-25 Sunday', 'propresenter', 'all causes')!.count).toBe(2);
    expect(stdout).not.toMatch(/malformed/);
  });

  it('prints the two days of the fixture in order, with the numbers it implies', async () => {
    const path = await logPath();
    await writeFile(path, TWO_SUNDAYS);

    const { code, stdout } = await run(['--log', path]);

    expect(code).toBe(0);
    expect(days(stdout)).toEqual(['2026-10-18 Sunday', '2026-10-25 Sunday']);
    expect(numbers(stdout, '2026-10-18 Sunday', 'propresenter', 'played-into')).toEqual({ count: 4, late: [20, 40, 40], acted: [3, 200, 300, 300] });
    expect(numbers(stdout, '2026-10-18 Sunday', 'propresenter', 'loop')).toEqual({ count: 1, late: [50, 50, 50], acted: null });
    expect(numbers(stdout, '2026-10-18 Sunday', 'lights', 'all causes')).toEqual({ count: 5, late: [7, 100, 100], acted: null });
    expect(numbers(stdout, '2026-10-25 Sunday', 'lights', 'loop')).toEqual({ count: 10, late: [50, 90, 100], acted: null });
  });

  it('refuses a flag it does not take, with the usage, and exits 2', async () => {
    const { code, stdout, stderr } = await run(['--logs', 'dist/none.log']);

    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/Usage: pnpm lateness/);
  });
});
