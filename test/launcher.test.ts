import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { describe, expect, it, type TestContext } from 'vitest';
import { SERVER_JOB_LABEL, serverErrorLogPath, serverJobPath } from '../src/install/server-job.ts';
import { fakeRig, REPO_ROOT } from './fake-launchctl.ts';

const LAUNCHER = join(REPO_ROOT, 'src/launcher/main.ts');
const UID = process.getuid?.() ?? 0;
const SERVICE = `gui/${UID}/${SERVER_JOB_LABEL}`;

// A page on a port the OS assigns, standing in for the server. It answers once `answers()` is true, and until then
// either resets each connection, as a port with no server does, or holds the request open and never answers, as a
// server that hangs at start does.
async function page(onTestFinished: TestContext['onTestFinished'], answers: () => boolean, before: 'reset' | 'hang' = 'reset'): Promise<string> {
  const server = createServer((request, response) => {
    if (answers()) {
      response.end('<!doctype html>');
    } else if (before === 'reset') {
      request.socket.destroy();
    }
  });
  // A hanging page holds its requests open, so its connections are cut before it closes.
  onTestFinished(() => {
    server.closeAllConnections();
    return new Promise<void>((done) => server.close(() => done()));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// The command as the applet runs it, a child process with real arguments.
function launcher(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string; seconds: number }> {
  const began = Date.now();
  const child = spawn(process.execPath, [LAUNCHER, ...args], { env });
  return new Promise((done, fail) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout, stderr, seconds: (Date.now() - began) / 1000 }));
  });
}

describe('the launcher start', () => {
  it('opens the page without touching launchctl when the page already answers', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    const address = await page(onTestFinished, () => true);

    const result = await launcher(['start', '--address', address], r.env);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(await r.recorded()).toEqual([`open ${address}`]);
  });

  it('loads the job from the app support folder, waits for the page, opens it, and exits 0', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    // The page answers only once the fake launchctl has loaded the job.
    const address = await page(onTestFinished, () => existsSync(r.loaded));

    const result = await launcher(['start', '--address', address], r.env);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const plist = serverJobPath(r.home);
    expect(plist).toBe(join(r.home, 'Library/Application Support/setlist-controller/com.nlvogel.setlist-controller.plist'));
    expect(await r.recorded()).toEqual([`launchctl print ${SERVICE}`, `launchctl bootstrap gui/${UID} ${plist}`, `open ${address}`]);
  });

  it('waits for the page without loading the job again when the job is already loaded', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    await writeFile(r.loaded, '');
    let up = false;
    const address = await page(onTestFinished, () => up);
    setTimeout(() => (up = true), 500);

    const result = await launcher(['start', '--address', address], r.env);

    expect(result.code).toBe(0);
    expect(await r.recorded()).toEqual([`launchctl print ${SERVICE}`, `open ${address}`]);
  });

  it('exits non-zero when launchctl cannot load the job, with what launchctl said', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    const address = await page(onTestFinished, () => false);

    const result = await launcher(['start', '--address', address], { ...r.env, FAKE_BOOTSTRAP_ERROR: 'Bootstrap failed: 5: Input/output error' });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Bootstrap failed: 5: Input/output error');
    expect((await r.recorded()).some((line) => line.startsWith('open'))).toBe(false);
  });

  it('exits non-zero when open fails, with what open said', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    const address = await page(onTestFinished, () => true);

    const result = await launcher(['start', '--address', address], { ...r.env, FAKE_OPEN_ERROR: 'LSOpenURLsWithRole() failed' });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('LSOpenURLsWithRole() failed');
  });

  it('exits non-zero when launchctl is not on PATH', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    const address = await page(onTestFinished, () => false);

    const result = await launcher(['start', '--address', address], { ...r.env, PATH: r.home });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('launchctl');
  });

  // The hang case, #100's shape: the job loads and the page holds every request without an answer. The three waits run
  // at once, since each takes the full 15 seconds.
  it.concurrent('exits non-zero within 15 seconds with the last lines of the error log when the page never answers', { timeout: 25_000 }, async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    const address = await page(onTestFinished, () => false, 'hang');
    const log = serverErrorLogPath(r.home);
    await mkdir(dirname(log), { recursive: true });
    const lines = Array.from({ length: 30 }, (_, i) => `error line ${i + 1}`);
    await writeFile(log, `${lines.join('\n')}\n`);

    const result = await launcher(['start', '--address', address], r.env);

    expect(result.code).not.toBe(0);
    // The 15 seconds run from the command's start; the rest is node starting up and exiting.
    expect(result.seconds).toBeGreaterThanOrEqual(15);
    expect(result.seconds).toBeLessThan(15.6);
    expect(result.stderr).toContain(address);
    expect(result.stderr).toContain(`The last lines of ${log}:\n${lines.slice(-10).join('\n')}\n`);
    expect((await r.recorded()).some((line) => line.startsWith('open'))).toBe(false);
  });

  it.concurrent('exits non-zero after the wait and says so when the error log does not exist', { timeout: 25_000 }, async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    const address = await page(onTestFinished, () => false);

    const result = await launcher(['start', '--address', address], r.env);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(`No error log at ${serverErrorLogPath(r.home)}.`);
  });

  it.concurrent('exits non-zero after the wait and says why when the error log cannot be read', { timeout: 25_000 }, async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    const address = await page(onTestFinished, () => false);
    // A folder where the log should be, so reading it fails with something other than a missing file.
    await mkdir(serverErrorLogPath(r.home), { recursive: true });

    const result = await launcher(['start', '--address', address], r.env);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(`Could not read ${serverErrorLogPath(r.home)}: EISDIR`);
  });
});

describe('the launcher stop', () => {
  it('removes the job by its label', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    await writeFile(r.loaded, '');

    const result = await launcher(['stop'], r.env);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(await r.recorded()).toEqual([`launchctl bootout ${SERVICE}`]);
    expect(existsSync(r.loaded)).toBe(false);
  });

  it('succeeds when the job is not loaded', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');

    const result = await launcher(['stop'], r.env);

    expect(result.code).toBe(0);
    expect(await r.recorded()).toEqual([`launchctl bootout ${SERVICE}`, `launchctl print ${SERVICE}`]);
  });

  it('succeeds when bootout fails but the job finishes unloading within the wait', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    await writeFile(r.loaded, '');

    const result = await launcher(['stop'], { ...r.env, FAKE_BOOTOUT_ERROR: 'Boot-out failed: 5: Input/output error', FAKE_UNLOAD_AFTER: '1' });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(existsSync(r.loaded)).toBe(false);
  });

  it('exits non-zero when bootout fails and the job is still loaded after the wait', { timeout: 15_000 }, async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    await writeFile(r.loaded, '');

    const result = await launcher(['stop'], { ...r.env, FAKE_BOOTOUT_ERROR: 'Boot-out failed: 1: Operation not permitted' });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Boot-out failed: 1: Operation not permitted');
    expect(result.seconds).toBeGreaterThanOrEqual(5);
  });

  it('exits non-zero when launchctl is not on PATH', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');

    const result = await launcher(['stop'], { ...r.env, PATH: r.home });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('launchctl');
  });
});

describe('the launcher usage', () => {
  it('exits non-zero on a missing or unknown subcommand, or an unknown option, and runs nothing', async ({ onTestFinished }) => {
    const r = await fakeRig(onTestFinished, 'launcher');
    for (const args of [[], ['restart'], ['constructor'], ['start', '--port', '8080']]) {
      const result = await launcher(args, r.env);
      expect(result.code, args.join(' ')).toBe(2);
      expect(result.stderr, args.join(' ')).toContain('Usage:');
    }
    expect(await r.recorded()).toEqual([]);
  });
});
