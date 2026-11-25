import { spawn } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readFixtures, requestKey, startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import { createWorkspace, REPO_ROOT, removeWorkspaces, snapshotFolder, type Workspace } from './set-builder-harness.ts';

// Repro for docs/reviews/setlist-controller-58/pre-pr-review-1.md, finding 1. Copy into test/ to run.

const CLIENT_ID = 'fake-client-id-3f9a';
const SECRET = 'fake-secret-b71c';
const NOVEMBER_1 = '2026-11-01';
const NOVEMBER_1_ITEMS = '/service_types/997539/plans/90897397/items?include=song,key,arrangement&per_page=100';

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

// The recorded November 1 plan with every song item taken out: a plan made before the songs are added.
async function planWithNoSongs(): Promise<PlanningCenter> {
  const fixtures = (await readFixtures()).map((fixture) => {
    if (requestKey(fixture.path) !== requestKey(NOVEMBER_1_ITEMS)) return fixture;
    const body = structuredClone(fixture.body) as { data: { attributes: Record<string, unknown> }[] };
    body.data = body.data.filter((item) => item.attributes.item_type !== 'song');
    return { ...fixture, body };
  });
  const fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET, fixtures });
  fakes.push(fake);
  return fake;
}

const paths = (workspace: Workspace) => ['--library', workspace.library, '--template', workspace.template, '--output-root', workspace.outputRoot];

describe('a plan with no songs', () => {
  it('--plan --list says the plan has no songs and exits 1', async () => {
    const workspace = await createWorkspace();
    const result = await run(['--plan', '--list', '--date', NOVEMBER_1, '--library', workspace.library], await planWithNoSongs(), await tokenFile(workspace));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/plan .*no songs|no songs .*plan/i);
  });

  it('--plan says the plan has no songs, naming the plan, and builds nothing', async () => {
    const workspace = await createWorkspace();
    const result = await run(['--plan', '--date', NOVEMBER_1, ...paths(workspace)], await planWithNoSongs(), await tokenFile(workspace));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/plan .*no songs|no songs .*plan/i);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });
});
