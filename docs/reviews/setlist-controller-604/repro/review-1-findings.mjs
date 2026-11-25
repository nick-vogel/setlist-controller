import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { child, childElements, parseAls } from '../../../../src/set-builder/als.ts';
import { readFixtures, startPlanningCenter } from '../../../../test/planning-center-fake.ts';
import { createWorkspace, GRACE, removeWorkspaces } from '../../../../test/set-builder-harness.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

async function runPlanList(serviceType, workspace, base, token) {
  return new Promise((resolveRun, reject) => {
    const proc = spawn(
      'node',
      [
        'src/set-builder/main.ts',
        '--plan',
        '--list',
        '--service-type',
        serviceType,
        '--date',
        '2027-01-03',
        '--library',
        workspace.library,
        '--pads',
        workspace.pads,
        '--template',
        workspace.template,
        '--output-root',
        workspace.outputRoot,
      ],
      { cwd: REPO_ROOT, env: { ...process.env, PCO_API_BASE: base, PCO_ENV: token, HOME: workspace.dir } },
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('error', reject);
    proc.on('close', (code) => resolveRun({ code, stdout, stderr }));
  });
}

describe('setlist-controller#604 pre-PR review 1 repros', () => {
  it('finding 1: docs/reviews/setlist-controller-58/pre-pr-review-9.md holds no truncated church email', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/reviews/setlist-controller-58/pre-pr-review-9.md'), 'utf8');
    assert.deepEqual(text.match(/nick@\S*/g) ?? [], []);
  });

  it('finding 2: plan-listing-no-such-service-type in traces.md actually triggers the no-such-service-type error', async () => {
    const traces = readFileSync(join(REPO_ROOT, '.claude/skills/build-set/traces.md'), 'utf8');
    const start = traces.indexOf('## plan-listing-no-such-service-type');
    assert.notEqual(start, -1, 'trace heading must exist');
    const nextHeading = traces.indexOf('\n## ', start + 1);
    const block = traces.slice(start, nextHeading === -1 ? undefined : nextHeading);
    const cmdMatch = block.match(/--service-type\s+"([^"]+)"/);
    assert.ok(cmdMatch, 'trace must name a --service-type');
    const serviceType = cmdMatch[1];

    const fake = await startPlanningCenter({ clientId: 'id', secret: 'sec', fixtures: await readFixtures() });
    const workspace = await createWorkspace();
    const token = join(workspace.dir, 'pco.env');
    writeFileSync(token, 'PCO_CLIENT_ID=id\nPCO_SECRET=sec\n');
    chmodSync(token, 0o600);
    try {
      const result = await runPlanList(serviceType, workspace, fake.base, token);
      assert.equal(result.code, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, new RegExp(`^Planning Center has no service type "${serviceType}"\\. Its service types:`));
    } finally {
      await fake.close();
      await removeWorkspaces();
    }
  });

  it('finding 3: This Is Amazing Grace fixture carries locator key mappings and next/previous locator keys', () => {
    const alsPath = join(REPO_ROOT, 'test/fixtures/set-builder/library', GRACE, 'MultiTrack.als');
    const doc = parseAls(gunzipSync(readFileSync(alsPath)).toString('utf8'));
    const liveSet = child(doc.root, 'LiveSet');
    const locatorsWrap = child(liveSet, 'Locators');
    const wrapperNames = childElements(locatorsWrap).map((el) => el.name);
    const locators = childElements(child(locatorsWrap, 'Locators'), 'Locator');
    const nonEmptyKeys = locators
      .map((loc) => {
        const mapping = childElements(loc, 'Mapping')[0];
        return mapping ? (childElements(mapping, 'PersistentKeyString')[0]?.attributes?.Value ?? '') : '';
      })
      .filter(Boolean);

    assert.deepEqual(wrapperNames, ['Locators', 'NextLocatorMapping', 'PreviousLocatorMapping']);
    assert.ok(nonEmptyKeys.length > 0, `expected non-empty PersistentKeyString on locators, got ${nonEmptyKeys.length}`);
  });

  it('finding 4: test/propresenter.test.ts names the 2D24702C presentation SAMPLE_MESSAGE_B, not after its sermon', () => {
    const text = readFileSync(join(REPO_ROOT, 'test/propresenter.test.ts'), 'utf8');
    assert.match(text, /const SAMPLE_MESSAGE_B = '2D24702C-9B33-4140-9D97-72E2701C955C'/);
  });
});
