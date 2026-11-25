import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SCRIPT = join(REPO_ROOT, 'scripts/check-private-terms.mjs');
const TERMS = ['# made-up terms for review-4 repro', '', 'Example Fellowship', 'word:EXF', 'retired-host-01'].join('\n');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'review-4-repro-'));
  const repo = join(root, 'repo');
  const termsFile = join(root, 'terms.txt');
  await mkdir(repo);
  await writeFile(termsFile, TERMS);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'Maintainer');
  git(repo, 'config', 'user.email', 'maintainer@users.noreply.github.com');
  await writeFile(join(repo, 'README.md'), 'A setlist controller.\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-q', '-m', 'First commit');
  return { root, repo, termsFile, first: git(repo, 'rev-parse', 'HEAD') };
}

function runCheck(cwd, termsFile, args, input) {
  return spawnSync('node', [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    input,
    env: { ...process.env, PRIVATE_TERMS_FILE: termsFile },
  });
}

describe('setlist-controller#604 pre-PR review 4 repros', () => {
  it('finding 1: rejects pnpm -- separator, unknown flags, and catches --range=<range> instead of silently exiting 0', async () => {
    const { root, repo, termsFile, first } = await makeRepo();
    try {
      await writeFile(join(repo, 'notes.md'), 'Example Fellowship\n');
      git(repo, 'add', 'notes.md');
      git(repo, 'commit', '-q', '-m', 'Add term');
      await writeFile(join(repo, 'notes.md'), 'clean\n');
      git(repo, 'add', 'notes.md');
      git(repo, 'commit', '-q', '-m', 'Remove term');

      const dashDashStdin = runCheck(repo, termsFile, ['--', '--stdin'], 'Example Fellowship\n');
      assert.notEqual(dashDashStdin.status, 0, '-- --stdin must not silently exit 0');

      const dashDashRange = runCheck(repo, termsFile, ['--', '--range', `${first}..HEAD`]);
      assert.notEqual(dashDashRange.status, 0, '-- --range must not silently exit 0');

      const typoFlag = runCheck(repo, termsFile, ['--rang', `${first}..HEAD`]);
      assert.notEqual(typoFlag.status, 0, 'unknown flag --rang must not silently exit 0');

      const equalsRange = runCheck(repo, termsFile, [`--range=${first}..HEAD`]);
      assert.equal(equalsRange.status, 1, '--range=<range> must scan the range and fail');
      assert.match(equalsRange.stderr, /notes\.md/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finding 2: test/check-private-terms.test.ts passes when dist/ does not exist yet', async () => {
    const root = await mkdtemp(join(tmpdir(), 'review-4-nodist-'));
    try {
      await mkdir(join(root, 'test'));
      await writeFile(join(root, 'test/set-builder-harness.ts'), `export const REPO_ROOT = ${JSON.stringify(root)};\n`);
      const original = await readFile(join(REPO_ROOT, 'test/check-private-terms.test.ts'), 'utf8');
      const adapted = original.replace(
        "const SCRIPT = join(REPO_ROOT, 'scripts/check-private-terms.mjs');",
        `const SCRIPT = ${JSON.stringify(SCRIPT)};`,
      );
      await writeFile(join(root, 'test/check-private-terms.test.ts'), adapted);

      const res = spawnSync(
        'pnpm',
        ['exec', 'vitest', 'run', '--root', root, '--config', join(REPO_ROOT, 'vitest.config.ts'), 'test/check-private-terms.test.ts'],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      );
      assert.equal(res.status, 0, `expected 8/8 tests to pass without pre-existing dist/:\n${res.stdout}\n${res.stderr}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finding 3: every test in test/check-private-terms.test.ts fails when scripts/check-private-terms.mjs does not exist (BASE)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'review-4-base-'));
    try {
      await mkdir(join(root, 'test'));
      const original = await readFile(join(REPO_ROOT, 'test/check-private-terms.test.ts'), 'utf8');
      const adapted = original
        .replace(
          "import { REPO_ROOT } from './set-builder-harness.ts';",
          `import { REPO_ROOT } from ${JSON.stringify(join(REPO_ROOT, 'test/set-builder-harness.ts'))};`,
        )
        .replace(
          "const SCRIPT = join(REPO_ROOT, 'scripts/check-private-terms.mjs');",
          `const SCRIPT = ${JSON.stringify(join(root, 'no-such-check-private-terms.mjs'))};`,
        );
      await writeFile(join(root, 'test/check-private-terms.test.ts'), adapted);

      const reportPath = join(root, 'vitest-report.json');
      spawnSync(
        'pnpm',
        [
          'exec',
          'vitest',
          'run',
          '--reporter=json',
          `--outputFile=${reportPath}`,
          '--root',
          root,
          '--config',
          join(REPO_ROOT, 'vitest.config.ts'),
          'test/check-private-terms.test.ts',
        ],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      );
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      const passed = report.testResults.flatMap((f) => f.assertionResults).filter((t) => t.status === 'passed');
      assert.deepEqual(
        passed.map((t) => t.title),
        [],
        'no test may pass green when scripts/check-private-terms.mjs is absent',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finding 4: --range scans added lines starting with "++ " and never leaks them as filenames', async () => {
    const { root, repo, termsFile, first } = await makeRepo();
    try {
      await writeFile(join(repo, 'notes.md'), '++ Example Fellowship\n');
      git(repo, 'add', 'notes.md');
      git(repo, 'commit', '-q', '-m', 'Add plus-plus line');
      const alone = runCheck(repo, termsFile, ['--range', `${first}..HEAD`]);
      assert.equal(alone.status, 1, 'added line starting with "++ " must be scanned');
      assert.match(alone.stderr, /notes\.md holds the term on line 3/);

      const second = git(repo, 'rev-parse', 'HEAD');
      await writeFile(join(repo, 'other.md'), '++ Example Fellowship\nEXF\n');
      git(repo, 'add', 'other.md');
      git(repo, 'commit', '-q', '-m', 'Add plus-plus line and another term');
      const both = runCheck(repo, termsFile, ['--range', `${second}..HEAD`]);
      assert.equal(both.status, 1);
      assert.doesNotMatch(both.stderr, /Example Fellowship/, 'stderr must never echo the private term as a filename');
      assert.match(both.stderr, /other\.md holds the term on line 3/);
      assert.match(both.stderr, /other\.md holds the term on line 4/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finding 5: tree mode and --range fail when a private term appears in a committed or renamed filename', async () => {
    const { root, repo, termsFile, first } = await makeRepo();
    try {
      await writeFile(join(repo, 'Example Fellowship.md'), 'clean body\n');
      git(repo, 'add', 'Example Fellowship.md');
      git(repo, 'commit', '-q', '-m', 'Add file with private filename');

      const treeRes = runCheck(repo, termsFile, []);
      assert.equal(treeRes.status, 1, 'tree mode must catch private term in tracked filename');
      assert.match(treeRes.stderr, /line 3/);

      const rangeAdd = runCheck(repo, termsFile, ['--range', `${first}..HEAD`]);
      assert.equal(rangeAdd.status, 1, '--range must catch private term in added filename');
      assert.match(rangeAdd.stderr, /line 3/);

      const beforeRename = git(repo, 'rev-parse', 'HEAD');
      git(repo, 'mv', 'README.md', 'retired-host-01.md');
      git(repo, 'commit', '-q', '-m', 'Rename to private filename');
      const rangeRename = runCheck(repo, termsFile, ['--range', `${beforeRename}..HEAD`]);
      assert.equal(rangeRename.status, 1, '--range must catch private term in renamed filename');
      assert.match(rangeRename.stderr, /line 5/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finding 6: tree mode handles non-ASCII tracked filenames without crashing on C-quoted paths', async () => {
    const { root, repo, termsFile } = await makeRepo();
    try {
      await writeFile(join(repo, 'café.md'), 'clean text\n');
      git(repo, 'add', 'café.md');
      git(repo, 'commit', '-q', '-m', 'Add non-ASCII filename');

      const res = runCheck(repo, termsFile, []);
      assert.equal(res.status, 0, `expected clean non-ASCII tracked file to pass:\n${res.stderr}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finding 7: local pre-push hook guards SSH URLs without .git, trailing slashes, and missing terms file', async () => {
    const commonDir = resolve(REPO_ROOT, git(REPO_ROOT, 'rev-parse', '--git-common-dir'));
    const hook = join(commonDir, 'hooks/pre-push');
    if (!existsSync(hook)) return;

    const { root, repo, first } = await makeRepo();
    try {
      const zero = '0000000000000000000000000000000000000000';
      const stdin = `refs/heads/main ${first} refs/heads/main ${zero}\n`;

      const sshNoGit = spawnSync('sh', [hook, 'origin', 'git@github.com:nick-vogel/setlist-controller'], {
        cwd: repo,
        encoding: 'utf8',
        input: stdin,
      });
      assert.notEqual(sshNoGit.status, 0, 'SSH URL without .git must not bypass pre-push guard');

      const trailingSlash = spawnSync('sh', [hook, 'origin', 'https://github.com/nick-vogel/setlist-controller/'], {
        cwd: repo,
        encoding: 'utf8',
        input: stdin,
      });
      assert.notEqual(trailingSlash.status, 0, 'HTTPS URL with trailing slash must not bypass pre-push guard');

      const head = git(REPO_ROOT, 'rev-parse', 'HEAD');
      const missingTerms = spawnSync('sh', [hook, 'origin', 'https://github.com/nick-vogel/setlist-controller.git'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        input: `refs/heads/test ${head} refs/heads/test ${zero}\n`,
        env: { ...process.env, PRIVATE_TERMS_FILE: join(root, 'no-such-terms.txt') },
      });
      assert.notEqual(missingTerms.status, 0, 'local pre-push hook must refuse push when private terms file is missing');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
