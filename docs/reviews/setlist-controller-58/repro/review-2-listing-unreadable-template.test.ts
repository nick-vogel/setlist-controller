import { spawn } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import { copySongAs, createWorkspace, GOODNESS, REPO_ROOT, removeWorkspaces, snapshotFolder, type Workspace } from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-58/pre-pr-review-2.md, finding 1. Copy into test/ to run. It passes at the
// review's HEAD: the listing's stop for a template it cannot read works, and no test in test/ pins it.

const CLIENT_ID = 'fake-client-id-3f9a';
const SECRET = 'fake-secret-b71c';
const NOVEMBER_1 = '2026-11-01';
const fakes: PlanningCenter[] = [];

afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await removeWorkspaces();
});

async function tokenFile(workspace: Workspace): Promise<string> {
  const file = join(workspace.dir, 'pco.env');
  await writeFile(file, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET=${SECRET}\n`);
  await chmod(file, 0o600);
  return file;
}

function run(args: string[], fake: PlanningCenter, token: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, PCO_API_BASE: fake.base, PCO_ENV: token } });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

it('prints the full listing, then the one line a template it cannot read gives, exit 1; the build stops on the same line', async () => {
  const workspace = await createWorkspace();
  await copySongAs(workspace, GOODNESS, 'Fall Like Rain-Passion-E-70.00bpm');
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET });
  fakes.push(fake);
  const token = await tokenFile(workspace);
  const missing = join(workspace.dir, 'missing.als');

  const clean = await run(['--plan', '--list', '--date', NOVEMBER_1, '--library', workspace.library], fake, token);
  expect(clean.stderr).toBe('');
  expect(clean.code).toBe(0);

  const listed = await run(['--plan', '--list', '--date', NOVEMBER_1, '--library', workspace.library, '--template', missing], fake, token);
  const built = await run(['--plan', '--date', NOVEMBER_1, '--library', workspace.library, '--template', missing, '--output-root', workspace.outputRoot], fake, token);

  expect(listed.stdout).toBe(clean.stdout);
  expect(listed.code).toBe(1);
  expect(listed.stderr.split('\n').filter(Boolean)).toHaveLength(1);
  expect(listed.stderr).toContain(missing);
  expect(built.code).toBe(1);
  expect(built.stderr).toBe(listed.stderr);
  expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
});
