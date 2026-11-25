# Pre-PR review: setlist-controller#604 Private terms check, public-repository rule, and merge gate

**Branch:** `setlist-controller-604-private-terms` vs `origin/main` (merge-base `adee302`, "setlist-controller, the first public commit")
**Reviewed at:** HEAD `e0fa6ee` (setlist-controller-archive#604 The rule for a public repository, and the merge gate that runs the check) + 0 files with uncommitted changes, 0 untracked files, 6 files total, +228 / −3 (plus local out-of-tree hook `.git/hooks/pre-push`)
**Reviewed against:** epic `nick-vogel/setlist-controller-archive#604` (open; no sub-issues), PR `nick-vogel/setlist-controller#17`, `.claude/rules/public-repository.md`, `docs/merge-rules.md`, GitHub ruleset #28080594 on `nick-vogel/setlist-controller`, and the global rules in `~/.claude/rules/`. The repo has no `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, or ADRs. Run with `--fresh` (reviews 1–3 in this folder belong to earlier epic PRs).
**Date:** 2026-11-25
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present (`eslint`, `playwright`, `tsc`, `tsserver`, `vite`, `vitest`); lockfile unchanged since `adee302` |
| Lint, typecheck, build | `pnpm lint && pnpm typecheck && pnpm build` | pass (`vite build` 102 ms); note `eslint.config.js` covers `**/*.{js,ts,tsx}` only (pre-existing; `.mjs` scripts are not linted) |
| Private terms check on tree & range | `pnpm check:private` and `pnpm check:private --range origin/main..HEAD` | both pass with the real 46-line private terms list (0 hits); also verified 0 hits of the real list against `pnpm-lock.yaml` |
| New unit tests alone | `pnpm exec vitest run test/check-private-terms.test.ts` | pass: 8 passed (5.50 s) when `dist/` already exists |
| Full unit/integration suite | `pnpm test`, then standalone `--maxWorkers=1` reruns of timed-out untouched files | parallel run: 100 passed, 2 failed under load (`test/propresenter.test.ts:7257` and `test/set-builder-plan-list.test.ts:403`, both untouched files); standalone `test/propresenter.test.ts` passed 385/385; standalone `test/set-builder-plan-list.test.ts` passed 38/39 with line 403 passing and a different test (`line 445`) hitting the 5 s timeout under machine load; GitHub Actions CI on PR #17 (`e0fa6ee`) passed all 102 test files in 7m15s |
| Tautology audit against `$BASE` (`adee302`) | ran `test/check-private-terms.test.ts` in Vitest with `SCRIPT` pointed at a nonexistent path (matching `$BASE`, where `scripts/check-private-terms.mjs` did not exist) | **3 of 8 tests passed green** (`matches a word: term as a whole word only`, `fails a range whose commit message holds a term`, `fails a range with a commit whose author address holds a term`) — **Finding 3** |
| Clean-checkout test run (no `dist/`) | ran `test/check-private-terms.test.ts` in Vitest against a temp `REPO_ROOT` with no `dist/` directory | **8 of 8 tests failed** with `ENOENT: no such file or directory, mkdtemp '.../dist/private-terms-...'` — **Finding 2** |
| CLI arg parsing, diff parsing, filenames, merge commits, and `pre-push` hook | executed repros with made-up terms in isolated temp repos (`docs/reviews/setlist-controller-604/repro/review-4-findings.mjs`) | 7 of 7 repros red on HEAD `e0fa6ee` (Findings 1–7); merge commits with conflict resolution and evil-merge additions were verified caught by `git show --cc` |
| GitHub public repository ruleset & settings | `gh api repos/nick-vogel/setlist-controller`, `.../rulesets/28080594`, `.../rules/branches/main`, `gh pr checks 17` | every claim in `docs/merge-rules.md:6-10` matches live ruleset #28080594 (`bypass_actors: []`, `deletion`, `non_fast_forward`, merge commits only, 0 required approvals, dismiss stale reviews on push, required thread resolution, required check `Lint, type check, test and build`); PR #17 CI check green |
| Playwright E2E suite | not run | `README.md` states E2E runs locally only, never in CI, and this branch touches no app or web code |

**Overall:** The rule in `.claude/rules/public-repository.md`, the GitHub ruleset documentation in `docs/merge-rules.md`, and the core scanning modes of `scripts/check-private-terms.mjs` are clean and well-aligned with the public repository's settings. However, the script has one HIGH silent-bypass bug (passing pnpm's `--` separator, `--range=<range>`, or any misspelled flag silently falls into the working-tree scan and exits 0), plus four MEDIUM issues: `test/check-private-terms.test.ts` crashes 8/8 on a clean checkout without `dist/`, 3 of its 8 tests pass green when the script does not exist (`tests-can-go-red`), `--range` skips added lines beginning with `++ ` (and leaks them into stderr as filenames), and neither mode scans filenames. Fix Findings 1–5 before merging PR #17; Findings 6 and 7 are LOW cleanups (with Finding 7 living in the local out-of-tree `pre-push` hook).

## Approach decisions
- **CLI argument parsing in `scripts/*.mjs`:** use `parseArgs` from `node:util` (with `strict: true`, `allowPositionals: false`), mirroring `scripts/record-pco-fixtures.mjs:10`, `scripts/scrub-pco-fixtures.mjs:19`, and `scripts/scrub-propresenter-fixtures.mjs:21`, so unknown flags and stray positionals fail loudly instead of silently falling into a default mode.
- **Test scratch directories under `dist/`:** always call `await mkdir(join(REPO_ROOT, 'dist'), { recursive: true })` immediately before `mkdtemp(join(REPO_ROOT, 'dist/...'))`, mirroring `test/set-builder-harness.ts:51` and the 13 other `dist/` test helpers.
- **Failure assertions on CLI subprocesses:** every test expecting exit code `1` from `scripts/check-private-terms.mjs` must assert `result.stderr` (matching the specific location and term line number), because Node also exits `1` on missing scripts, syntax errors, and uncaught exceptions.
- **Diff header vs. hunk content in `--range`:** track `inHunk` from `diff ` and `/^@{2,} /` headers rather than matching `+++ ` unconditionally, so unified diffs and merge-commit combined diffs (`diff --cc`) never treat added lines as file headers.
- **Path handling and filename scanning:** use NUL-delimited git output (`-z`) for all path listings (`git grep -z`, `git ls-files -z`, `git diff-tree ... -z --root -c`) so non-ASCII filenames never C-quote and committed/renamed filenames are scanned alongside file contents.

## Confirmed Issues

### 1. Unrecognized flags, `--range=<range>`, or pnpm's `--` separator silently fall through to the working-tree scan and exit 0, bypassing `--range` and `--stdin` — HIGH
- **Location:** `scripts/check-private-terms.mjs:41-63`
- **Attribution:** introduced (`d0fbc23`, "setlist-controller-archive#604 pnpm check:private fails a tree, a range of commits or a text that holds a private term").
- **Real-world trigger:** Running `pnpm check:private -- --range origin/main..HEAD` or `pnpm check:private -- --stdin` (pnpm 10 forwards the literal `--` in `process.argv`; PR #17's own description uses `pnpm test -- --maxWorkers=4`), using equals syntax `pnpm check:private --range=origin/main..HEAD`, or mistyping a flag such as `--rang`. Because `args[0]` matches neither `'--stdin'` nor `'--range'`, the script executes the `else` branch (working-tree scan) and exits `0` when the working tree is clean, silently approving dirty commit history or dirty PR text.

**Evidence** — `scripts/check-private-terms.mjs:41-63`
```js
const args = process.argv.slice(2);
if (args[0] === '--stdin') {
  scan('stdin', readFileSync(0, 'utf8'));
} else if (args[0] === '--range') {
  const range = args[1];
  if (!range) throw new Error('--range needs a range, such as origin/main..HEAD');
  ...
} else {
  for (const file of git('grep', '-I', '--name-only', '-e', '', '--', '.', ':!pnpm-lock.yaml').split('\n').filter(Boolean)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => scan(`${file}:${index + 1}`, line));
  }
}
```

**Failure mode** — In a repository whose working tree is clean while commit history holds a term that was added and later removed (or while stdin holds a term): `node scripts/check-private-terms.mjs -- --stdin`, `node scripts/check-private-terms.mjs -- --range <base>..HEAD`, `node scripts/check-private-terms.mjs --range=<base>..HEAD`, and `node scripts/check-private-terms.mjs --rang <base>..HEAD` all print nothing and exit `0`. Verified by `docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (`finding 1`).

**Recommended fix**
```diff
 import { execFileSync } from 'node:child_process';
 import { existsSync, readFileSync } from 'node:fs';
 import { homedir } from 'node:os';
 import { join } from 'node:path';
+import { parseArgs } from 'node:util';
+
+let values;
+try {
+  ({ values } = parseArgs({
+    options: {
+      stdin: { type: 'boolean', default: false },
+      range: { type: 'string' },
+    },
+  }));
+} catch (error) {
+  console.error(`check:private: ${error instanceof Error ? error.message : String(error)}`);
+  process.exit(2);
+}
+if (values.stdin && values.range !== undefined) {
+  console.error('check:private: pass either --stdin or --range, not both');
+  process.exit(2);
+}
+if (values.range === '') {
+  console.error('check:private: --range needs a range, such as origin/main..HEAD');
+  process.exit(2);
+}
 
 const termsFile = process.env.PRIVATE_TERMS_FILE || join(homedir(), '.config/setlist-controller/private-terms.txt');
```
And replace lines 41–46:
```diff
-const args = process.argv.slice(2);
-if (args[0] === '--stdin') {
+if (values.stdin) {
   scan('stdin', readFileSync(0, 'utf8'));
-} else if (args[0] === '--range') {
-  const range = args[1];
-  if (!range) throw new Error('--range needs a range, such as origin/main..HEAD');
-  for (const sha of git('rev-list', range).split('\n').filter(Boolean)) {
+} else if (values.range !== undefined) {
+  for (const sha of git('rev-list', values.range).split('\n').filter(Boolean)) {
```

**Remediation brief**
- **Design intent:** `scripts/check-private-terms.mjs` is a privacy gate invoked directly (`node`), via `pnpm check:private`, and from the local `pre-push` hook. It supports three mutually exclusive modes: no arguments (working tree), `--stdin`, and `--range <range>` (including `--range=<range>`). Any malformed or unrecognized invocation must fail closed (non-zero exit) before scanning, never silently fall back to the working-tree mode, and argument validation runs before the missing-terms-file check so bad flags fail loudly even in a contributor clone.
- **Full surface:** `scripts/check-private-terms.mjs:13-22, 41-63` and `test/check-private-terms.test.ts` (add regression tests for `-- --stdin`, `-- --range`, unknown flags, `--range=<range>`, empty `--range ""`, and `--stdin --range`). Checked `package.json:15`, `docs/merge-rules.md:17-18`, `.claude/rules/public-repository.md:30-32`, and `.git/hooks/pre-push:30` — none pass `--` or invalid flags.
- **Must preserve:** No-argument tree mode, `--stdin`, and `--range <range>` exit `0` when clean and `1` on match; valid invocations with no private terms file still print the note to stderr and exit `0` (`test/check-private-terms.test.ts:97-103`). When `parseArgs` throws (unknown option, missing `--range` value, unexpected positional such as `-- --stdin`), stderr prints the error message and the process exits `2` (never `0`).
- **Do not touch:** Missing-terms-file exit-0 behaviour for valid invocations (see Reviewed and Dismissed).
- **Proof:** `node --test --test-name-pattern="finding 1" docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (currently fails: `-- --stdin` exits `0`; must pass after the fix), plus `pnpm exec vitest run test/check-private-terms.test.ts`.

---

### 2. `test/check-private-terms.test.ts:24` creates temp directories under `dist/` without creating `dist/` first, crashing all 8 tests on a clean checkout — MEDIUM
- **Location:** `test/check-private-terms.test.ts:2, 24`
- **Attribution:** introduced (`d0fbc23`, "setlist-controller-archive#604 pnpm check:private fails a tree, a range of commits or a text that holds a private term").
- **Real-world trigger:** Running `pnpm exec vitest run test/check-private-terms.test.ts` on a fresh clone (before `pnpm build` or any other test creates `dist/`), or running `pnpm test` in GitHub Actions CI (`.github/workflows/ci.yml:39` runs `pnpm test` before `pnpm build`) whenever Vitest schedules `test/check-private-terms.test.ts` ahead of the other 14 test files that create `dist/`.

**Evidence** — `test/check-private-terms.test.ts:2, 23-25`
```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
...
async function scratch(email = 'maintainer@users.noreply.github.com') {
  dir = await mkdtemp(join(REPO_ROOT, 'dist/private-terms-'));
```

**Failure mode** — When `dist/` does not exist, every test in `test/check-private-terms.test.ts` fails immediately in `scratch()` with `Error: ENOENT: no such file or directory, mkdtemp '.../dist/private-terms-XXXXXX'`. Verified 8/8 failed in Vitest by `docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (`finding 2`). Every other `dist/` temp-dir caller in the repository (14 files, including `test/set-builder-harness.ts:51` and `test/scrub-pco-fixtures.test.ts:18`) calls `await mkdir(join(REPO_ROOT, 'dist'), { recursive: true })` first (`nearest-in-repo-precedent`).

**Recommended fix**
```diff
-import { mkdtemp, rm, writeFile } from 'node:fs/promises';
+import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
```
```diff
 async function scratch(email = 'maintainer@users.noreply.github.com') {
+  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
   dir = await mkdtemp(join(REPO_ROOT, 'dist/private-terms-'));
```

**Remediation brief**
- **Design intent:** Per `test/set-builder-harness.ts:9-10`, tests create scratch workspaces under git-ignored `dist/` inside `REPO_ROOT`, never in the home folder. Because `dist/` is git-ignored and absent on a fresh clone (and in CI before `pnpm build`), every helper creating a folder under `dist/` must ensure `dist/` exists with `mkdir(..., { recursive: true })`.
- **Full surface:** `test/check-private-terms.test.ts:2, 24`. Grepped all 15 callers of `mkdtemp(join(REPO_ROOT, 'dist/` across `test/`; the other 14 already call `await mkdir(join(REPO_ROOT, 'dist'), { recursive: true })`.
- **Must preserve:** Scratch repos remain inside `dist/private-terms-*` and are removed in `afterEach` (`test/check-private-terms.test.ts:13-15`).
- **Do not touch:** The remaining 14 `test/*.test.ts` / helper files that already create `dist/`.
- **Proof:** `node --test --test-name-pattern="finding 2" docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (currently fails 8/8 with `ENOENT`; must pass after the fix).

---

### 3. Three tests in `test/check-private-terms.test.ts` assert only `status === 1` and pass green when `scripts/check-private-terms.mjs` does not exist (`$BASE`) — MEDIUM
- **Location:** `test/check-private-terms.test.ts:62-66, 78-89, 93`
- **Attribution:** introduced (`d0fbc23`; violates global rule `tests-can-go-red`).
- **Real-world trigger:** Node exits with status `1` on `ERR_MODULE_NOT_FOUND`, syntax errors, or any uncaught exception (including `git` failures). Three tests in `test/check-private-terms.test.ts` assert only `expect(...status).toBe(1)` with no check on `stderr`, so they pass even when `scripts/check-private-terms.mjs` is missing (at `$BASE` `adee302`) or crashes before scanning. Line 93 (`--stdin` dirty case) has the same exit-code-only check.

**Evidence** — `test/check-private-terms.test.ts:62-66, 78-89, 91-95`
```ts
  it('matches a word: term as a whole word only', async () => {
    await scratch();
    await commit('notes.md', 'Ready for the EXF band.\n');
    expect(check([]).status).toBe(1);
  });
...
  it('fails a range whose commit message holds a term', async () => {
    const first = await scratch();
    await commit('notes.md', 'clean\n', 'Lights for Example Fellowship');
    expect(check(['--range', `${first}..HEAD`]).status).toBe(1);
  });

  it('fails a range with a commit whose author address holds a term', async () => {
    const first = await scratch();
    git('config', 'user.email', 'me@retired-host-01.example');
    await commit('notes.md', 'clean\n');
    expect(check(['--range', `${first}..HEAD`]).status).toBe(1);
  });
```

**Failure mode** — Running `test/check-private-terms.test.ts` in Vitest with `SCRIPT` pointed at a nonexistent file (simulating `$BASE` `adee302`, where `scripts/check-private-terms.mjs` did not exist) passes 3 of 8 tests green (`matches a word: term as a whole word only`, `fails a range whose commit message holds a term`, `fails a range with a commit whose author address holds a term`). Verified by `docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (`finding 3`).

**Recommended fix**
```diff
   it('matches a word: term as a whole word only', async () => {
     await scratch();
     await commit('notes.md', 'Ready for the EXF band.\n');
-    expect(check([]).status).toBe(1);
+    const result = check([]);
+    expect(result.status).toBe(1);
+    expect(result.stderr).toContain('notes.md:1 holds the term on line 4');
   });
```
```diff
   it('fails a range whose commit message holds a term', async () => {
     const first = await scratch();
     await commit('notes.md', 'clean\n', 'Lights for Example Fellowship');
-    expect(check(['--range', `${first}..HEAD`]).status).toBe(1);
+    const result = check(['--range', `${first}..HEAD`]);
+    expect(result.status).toBe(1);
+    expect(result.stderr).toContain("'s message holds the term on line 3");
   });
 
   it('fails a range with a commit whose author address holds a term', async () => {
     const first = await scratch();
     git('config', 'user.email', 'me@retired-host-01.example');
     await commit('notes.md', 'clean\n');
-    expect(check(['--range', `${first}..HEAD`]).status).toBe(1);
+    const result = check(['--range', `${first}..HEAD`]);
+    expect(result.status).toBe(1);
+    expect(result.stderr).toContain("'s author and committer holds the term on line 5");
   });
 
   it('fails text on stdin that holds a term, for a pull request title and body', async () => {
     await scratch();
-    expect(check(['--stdin'], { input: 'Fix the cue lights\n\nFor Example Fellowship.' }).status).toBe(1);
+    const dirty = check(['--stdin'], { input: 'Fix the cue lights\n\nFor Example Fellowship.' });
+    expect(dirty.status).toBe(1);
+    expect(dirty.stderr).toContain('stdin holds the term on line 3');
     expect(check(['--stdin'], { input: 'Fix the cue lights' }).status).toBe(0);
   });
```

**Remediation brief**
- **Design intent:** Every test in `test/check-private-terms.test.ts` runs the real script as a subprocess. Because Node exits `1` for any crash or missing file, a test that asserts only `status === 1` cannot distinguish a real term match from an error and passes at `$BASE` (`tests-can-go-red`). Each failure test must assert both `status === 1` and the exact diagnostic location and term line number on `stderr`, matching lines 57–59 and 73–75.
- **Full surface:** `test/check-private-terms.test.ts:62-66, 78-95`. Lines 57–59 (`notes.md:2`) and 73–75 (`notes.md`) already assert `stderr`.
- **Must preserve:** Keep all 8 test cases and their made-up `TERMS` list (`Example Fellowship` on line 3, `word:EXF` on line 4, `retired-host-01` on line 5).
- **Do not touch:** `TERMS` line numbering in `test/check-private-terms.test.ts:10` without updating the asserted line numbers to match.
- **Proof:** `node --test --test-name-pattern="finding 3" docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (currently fails because 3 tests pass green when the script is absent; must pass with 0 green tests at `$BASE`, and `pnpm exec vitest run test/check-private-terms.test.ts` must pass 8/8 at HEAD).

---

### 4. In `--range` mode, added lines starting with `++ ` (or `+ ` in a merge commit) are misread as `+++ ` file headers, skipping the scan and leaking the line's text as the filename — MEDIUM
- **Location:** `scripts/check-private-terms.mjs:51-55`
- **Attribution:** introduced (`d0fbc23`, "setlist-controller-archive#604 pnpm check:private fails a tree, a range of commits or a text that holds a private term").
- **Real-world trigger:** Committing a file containing a line that begins with `++ ` (for example, a combined-diff excerpt or patch block in `docs/reviews/`), or resolving a merge commit by adding a line that begins with `+ ` (such as a unified-diff snippet in a review doc). Capped at MEDIUM by attainability because ordinary source lines rarely start with `++ `, though review docs in this repository routinely embed diffs.

**Evidence** — `scripts/check-private-terms.mjs:51-55`
```js
    let file = '';
    for (const line of git('show', '--format=', '--unified=0', '--no-color', '--no-ext-diff', sha).split('\n')) {
      if (line.startsWith('+++ ')) file = line.replace(/^\+\+\+ (b\/)?/, '');
      else if (line.startsWith('+')) scan(`commit ${short}, ${file}`, line.slice(1));
    }
```

**Failure mode** — In unified diff output, adding `++ Example Fellowship` produces `+++ Example Fellowship` (and in a merge commit's combined diff `diff --cc`, adding `+ Example Fellowship` also produces `+++ Example Fellowship`). Line 53 matches `line.startsWith('+++ ')`, skips `scan()`, and sets `file = 'Example Fellowship'`. If that is the only match, `--range` exits `0` (silent false negative). If a subsequent added line in the same hunk matches another term (`EXF`), stderr prints `check:private: commit <sha>, Example Fellowship holds the term on line 4 of ...`, echoing the skipped private term itself into stderr. Verified by `docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (`finding 4`).

**Recommended fix**
```diff
     let file = '';
+    let inHunk = false;
     for (const line of git('show', '--format=', '--unified=0', '--no-color', '--no-ext-diff', sha).split('\n')) {
-      if (line.startsWith('+++ ')) file = line.replace(/^\+\+\+ (b\/)?/, '');
-      else if (line.startsWith('+')) scan(`commit ${short}, ${file}`, line.slice(1));
+      if (line.startsWith('diff ')) {
+        file = '';
+        inHunk = false;
+      } else if (/^@{2,} /.test(line)) {
+        inHunk = true;
+      } else if (!inHunk && line.startsWith('+++ ')) {
+        file = line.replace(/^\+\+\+ (b\/)?/, '');
+      } else if (inHunk && line.startsWith('+')) {
+        scan(`commit ${short}, ${file}`, line.slice(1));
+      }
     }
```

**Remediation brief**
- **Design intent:** In `git show --format= --unified=0 --no-color --no-ext-diff <sha>`, every hunk content line begins with `+`, `-`, ` `, or `\`, so `diff ` (starting a file section) and `/^@{2,} /` (`@@ ` in unified diffs, `@@@ ` in 2-parent combined diffs, `@@@@ ` in octopus merges) can never appear inside a hunk body. Tracking `inHunk` separates file headers (`+++ b/<path>`) from added hunk lines (`+...`, `++...`, `+++ ...`) without breaking root commits, multi-hunk files, or merge commits.
- **Full surface:** `scripts/check-private-terms.mjs:51-55` and `test/check-private-terms.test.ts` (add a test committing a `++ ` line holding a made-up term plus a second term in the same commit).
- **Must preserve:** Root commits (`--range adee302`), multi-file commits, multi-hunk commits, and merge commits (`diff --cc` with `@@@ ` headers and `++` added lines) must all continue to scan every added line and report the true filename.
- **Do not touch:** `git show --format= --unified=0 --no-color --no-ext-diff` flags (keeping `--unified=0` avoids scanning unchanged context lines).
- **Proof:** `node --test --test-name-pattern="finding 4" docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (currently fails with exit `0` on `++ Example Fellowship`; must pass after the fix).

---

### 5. Neither working-tree mode nor `--range` mode scans filenames, so a private term in a committed, renamed, empty, or binary file's path passes unchecked — MEDIUM
- **Location:** `scripts/check-private-terms.mjs:47-63`
- **Attribution:** introduced (`d0fbc23`, "setlist-controller-archive#604 pnpm check:private fails a tree, a range of commits or a text that holds a private term").
- **Real-world trigger:** Committing a fixture file, screenshot/image, empty placeholder, or renamed doc whose filename holds a private term (an organization name, person's name, sermon title, or host name). Binary files emit no `+` content lines and are skipped by `git grep -I`, pure renames (`git mv`) emit no `+` lines, and even text files with clean bodies never have their `file` path passed to `scan()`.

**Evidence** — `scripts/check-private-terms.mjs:47-63`
```js
  for (const sha of git('rev-list', range).split('\n').filter(Boolean)) {
    const short = sha.slice(0, 7);
    scan(`commit ${short}'s message`, git('show', '-s', '--format=%B', sha));
    scan(`commit ${short}'s author and committer`, git('show', '-s', '--format=%an <%ae>%n%cn <%ce>', sha));
    let file = '';
    for (const line of git('show', '--format=', '--unified=0', '--no-color', '--no-ext-diff', sha).split('\n')) {
      if (line.startsWith('+++ ')) file = line.replace(/^\+\+\+ (b\/)?/, '');
      else if (line.startsWith('+')) scan(`commit ${short}, ${file}`, line.slice(1));
    }
  }
} else {
  for (const file of git('grep', '-I', '--name-only', '-e', '', '--', '.', ':!pnpm-lock.yaml').split('\n').filter(Boolean)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => scan(`${file}:${index + 1}`, line));
  }
}
```

**Failure mode** — Adding `Example Fellowship.md` with clean text (`clean body\n`) exits `0` in both working-tree mode and `--range` mode; renaming `README.md` to `retired-host-01.md` with `git mv` exits `0` in `--range` mode. Verified by `docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (`finding 5`).

**Recommended fix**
In `--range` mode (inside the `for (const sha of ...)` loop, right after scanning author and committer):
```diff
     scan(`commit ${short}'s message`, git('show', '-s', '--format=%B', sha));
     scan(`commit ${short}'s author and committer`, git('show', '-s', '--format=%an <%ae>%n%cn <%ce>', sha));
+    for (const path of git('diff-tree', '--no-commit-id', '--name-only', '--diff-filter=AMCR', '-r', '-z', '--root', '-c', sha).split('\0').filter(Boolean)) {
+      scan(`commit ${short}, path ${path}`, path);
+    }
```
In working-tree mode (alongside the `git grep` loop):
```diff
 } else {
+  for (const file of git('ls-files', '-z').split('\0').filter(Boolean)) {
+    scan(`path ${file}`, file);
+  }
   for (const file of git('grep', '-I', '-z', '--name-only', '-e', '', '--', '.', ':!pnpm-lock.yaml').split('\0').filter(Boolean)) {
```

**Remediation brief**
- **Design intent:** Per `.claude/rules/public-repository.md:3`, everything a commit carries is published, which includes file paths (including binary fixtures and pure renames). Working-tree mode checks all tracked paths via `git ls-files -z`; `--range` mode checks paths added, modified, copied, or renamed in each commit via `git diff-tree --no-commit-id --name-only --diff-filter=AMCR -r -z --root -c <sha>`. Using `--root` covers initial commits (such as `adee302`), `--diff-filter=AMCR` ignores pure deletions (so removing a file with a bad name is not blocked), `-c` reports only paths introduced/changed by a merge commit itself rather than re-listing unrelated parent paths, and `-z` avoids C-quoting on non-ASCII names. (Output of `check:private` is local diagnostic output and is never committed verbatim.)
- **Full surface:** `scripts/check-private-terms.mjs:47-63` and `test/check-private-terms.test.ts` (add tests for an added filename and a renamed filename in both tree mode and `--range` mode).
- **Must preserve:** Existing content scanning for tracked text files, `--range` added lines, commit messages, and author/committer; `pnpm check:private` and `pnpm check:private --range origin/main..HEAD` must still pass on this repository with the real list.
- **Do not touch:** Binary content skipping (`git grep -I`, documented at `scripts/check-private-terms.mjs:12`).
- **Proof:** `node --test --test-name-pattern="finding 5" docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (currently fails with exit `0` on `Example Fellowship.md`; must pass after the fix).

---

### 6. Working-tree mode crashes with `ENOENT` on non-ASCII tracked filenames because `git grep` C-quotes paths without `-z` — LOW
- **Location:** `scripts/check-private-terms.mjs:58`
- **Attribution:** introduced (`d0fbc23`, "setlist-controller-archive#604 pnpm check:private fails a tree, a range of commits or a text that holds a private term").
- **Real-world trigger:** Tracking any text file whose filename contains a non-ASCII character (such as an accented letter or em-dash). Rated LOW because no tracked file in the repository currently has a non-ASCII filename (`git ls-files | LC_ALL=C grep '[^ -~]'` returns none) and the failure is loud (`ENOENT`) rather than silent; upgrade to MEDIUM if any fixture or doc adds a non-ASCII path.

**Evidence** — `scripts/check-private-terms.mjs:58-61`
```js
  for (const file of git('grep', '-I', '--name-only', '-e', '', '--', '.', ':!pnpm-lock.yaml').split('\n').filter(Boolean)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => scan(`${file}:${index + 1}`, line));
  }
```

**Failure mode** — With git's default `core.quotepath=true`, `git grep --name-only` outputs `"caf\303\251.md"` for a tracked file named `café.md`. Passing that literal quoted string to `readFileSync` throws `Error: ENOENT: no such file or directory, open '"caf\303\251.md"'`. Verified by `docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (`finding 6`).

**Recommended fix**
```diff
-  for (const file of git('grep', '-I', '--name-only', '-e', '', '--', '.', ':!pnpm-lock.yaml').split('\n').filter(Boolean)) {
+  for (const file of git('grep', '-I', '-z', '--name-only', '-e', '', '--', '.', ':!pnpm-lock.yaml').split('\0').filter(Boolean)) {
```

**Remediation brief**
- **Design intent:** `git grep -z` terminates filenames with NUL bytes and disables C-style path quoting regardless of `core.quotepath`, so `readFileSync` receives the exact OS path for every tracked text file.
- **Full surface:** `scripts/check-private-terms.mjs:58` and `test/check-private-terms.test.ts` (add a test with a clean non-ASCII tracked filename such as `café.md`).
- **Must preserve:** Excludes binary files (`-I`) and `pnpm-lock.yaml` (`:!pnpm-lock.yaml`), and preserves 1-based line numbers in `file:line` reports (`test/check-private-terms.test.ts:54-60`).
- **Do not touch:** `pnpm-lock.yaml` pathspec exclusion.
- **Proof:** `node --test --test-name-pattern="finding 6" docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (currently fails with `ENOENT` on `'"caf\\303\\251.md"'`; must pass after the fix).

---

### 7. Local out-of-tree `pre-push` hook bypasses both guards on valid GitHub URL forms (`git@github.com:nick-vogel/setlist-controller` without `.git`, trailing `/`) and allows pushes when the private terms file is missing — LOW
- **Location:** `.git/hooks/pre-push:8-11, 25-32` (local hook in the repo's shared `.git/hooks/` directory, outside the git tree; reviewed per request)
- **Attribution:** introduced (local hook installed as part of `setlist-controller-archive#604`, outside the PR diff).
- **Real-world trigger:** Pushing to the public repository via `git@github.com:nick-vogel/setlist-controller` (SSH without `.git`), `https://github.com/nick-vogel/setlist-controller/` (trailing `/`), or mixed case, or pushing on the maintainer's Mac if `~/.config/setlist-controller/private-terms.txt` is accidentally moved or missing (whereas `docs/merge-rules.md:18-19` says that on this Mac the file must exist). Rated LOW because `origin` is currently configured as `https://github.com/nick-vogel/setlist-controller.git` (which matches line 9) and `~/.config/setlist-controller/private-terms.txt` currently exists; upgrade to MEDIUM if any remote URL is configured without `.git` or with a trailing `/` (check via `git remote -v`).

**Evidence** — `.git/hooks/pre-push:7-11, 25-32`
```sh
remote_url="$2"
case "$remote_url" in
  *github.com/nick-vogel/setlist-controller.git|*github.com/nick-vogel/setlist-controller|*github.com:nick-vogel/setlist-controller.git) ;;
  *) exit 0 ;;
esac
...
  if git cat-file -e "$local_sha:scripts/check-private-terms.mjs" 2>/dev/null; then
    ...
    if ! node "$tmp/check.mjs" --range "$base..$local_sha"; then status=1; fi
```

**Failure mode** — Invoking the hook with a commit that does not descend from `adee302` against `git@github.com:nick-vogel/setlist-controller` or `https://github.com/nick-vogel/setlist-controller/` hits `*) exit 0 ;;` and exits `0`, bypassing both the private-archive ancestor check and the private-terms check. Invoking the hook against `https://github.com/nick-vogel/setlist-controller.git` with a missing `PRIVATE_TERMS_FILE` prints the contributor-clone note and exits `0`, allowing the push unchecked. Verified by `docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (`finding 7`).

**Recommended fix** (applied to the local out-of-tree `.git/hooks/pre-push`, not committed to the repo)
```diff
-remote_url="$2"
-case "$remote_url" in
-  *github.com/nick-vogel/setlist-controller.git|*github.com/nick-vogel/setlist-controller|*github.com:nick-vogel/setlist-controller.git) ;;
+remote_url=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]' | sed -E 's#/+$##; s#\.git$##')
+case "$remote_url" in
+  *github.com/nick-vogel/setlist-controller|*github.com:nick-vogel/setlist-controller) ;;
   *) exit 0 ;;
 esac
```
And inside `if git cat-file -e "$local_sha:scripts/check-private-terms.mjs" 2>/dev/null; then` before running `node`:
```diff
+    terms_file="${PRIVATE_TERMS_FILE:-$HOME/.config/setlist-controller/private-terms.txt}"
+    if [ ! -f "$terms_file" ]; then
+      echo "pre-push: refused $local_ref -> $remote_ref: private terms file not found at $terms_file." >&2
+      status=1
+      continue
+    fi
```

**Remediation brief**
- **Design intent:** The local `.git/hooks/pre-push` hook lives only on the maintainer's Mac (shared across worktrees of this clone) as a fail-closed guard against pushing private-archive history or private terms to `nick-vogel/setlist-controller`. It must recognize every canonical GitHub HTTPS and SSH URL form for `nick-vogel/setlist-controller` (ignoring case, trailing slash, and optional `.git`) without catching `nick-vogel/setlist-controller-archive`, and it must refuse a push on this Mac if the private terms file is missing (matching `docs/merge-rules.md:18-19`), while leaving `scripts/check-private-terms.mjs` itself exit-0 for contributor clones.
- **Full surface:** Local out-of-tree file `<git-common-dir>/hooks/pre-push:7-11, 25-32` (not tracked in git; no PR commit changes it).
- **Must preserve:** Pushing to `archive` (`https://github.com/nick-vogel/setlist-controller-archive.git`) must still exit `0` immediately (normalized URL ends in `setlist-controller-archive`, which does not match `*setlist-controller`); ref deletions (`local_sha = $zero`) still skip; commits without `scripts/check-private-terms.mjs` still pass the ancestor check cleanly.
- **Do not touch:** `scripts/check-private-terms.mjs:19-22` missing-file exit-0 behaviour (needed for contributor clones).
- **Proof:** `node --test --test-name-pattern="finding 7" docs/reviews/setlist-controller-604/repro/review-4-findings.mjs` (currently fails on SSH without `.git`, trailing `/`, and missing terms file; must pass after updating the local hook).

## Needs Further Investigation

None.

## Reviewed and Dismissed

- **Missing private terms file returning exit `0` (`scripts/check-private-terms.mjs:19-22`)** — intentional contributor-clone design explicitly documented in `scripts/check-private-terms.mjs:4-5`, `.claude/rules/public-repository.md:34-35`, `README.md:167`, and `docs/merge-rules.md:18-19`, and pinned by `test/check-private-terms.test.ts:97-103`. Do not change to exit non-zero in the script itself (handle the maintainer-Mac requirement in the local `pre-push` hook per Finding 7 and the merge gate in `docs/merge-rules.md:18-19`).
- **Merge commits in `--range` mode (`scripts/check-private-terms.mjs:52-55`)** — verified empirically in two scratch repos: `git show --format= --unified=0 --no-color --no-ext-diff <merge-sha>` emits `diff --cc` with `++` lines for both conflict-resolution additions and evil-merge additions to files touched by one or neither parent, and `line.startsWith('+')` scans them (once Finding 4 fixes the `+++ ` misparse for lines starting with `+ `).
- **Word boundary regex `(?<![\p{L}\p{N}_])...(?![\p{L}\p{N}_])` (`scripts/check-private-terms.mjs:32`)** — Unicode-aware equivalent of `\b`, handles case-insensitivity (`iu`), and escapes regex metacharacters cleanly via line 24. Verified against the shape of the real 46-line list (3 `word:` entries, all ASCII alphanumeric with no leading whitespace or punctuation).
- **`pnpm-lock.yaml` excluded in working-tree mode (`scripts/check-private-terms.mjs:58`)** — verified against the real 46-line private terms list that `pnpm-lock.yaml` has 0 matches; skipping it in tree mode avoids reading the large lockfile on every check without hiding any current real term.
- **GitHub ruleset and CI claims in `docs/merge-rules.md:6-20`** — verified live via `gh api` on `nick-vogel/setlist-controller` ruleset #28080594 and `rules/branches/main`: ruleset name, `bypass_actors: []`, no deletion, no force push, merge commits only, 0 required approvals, dismiss stale reviews on push, required thread resolution, and required check `Lint, type check, test and build` all match exactly.
- **File and stand-in references in `.claude/rules/public-repository.md`** — verified `scripts/scrub-pco-fixtures.mjs`, `scripts/scrub-propresenter-fixtures.mjs`, `test/fixture-sets-public.test.ts`, `test/fixtures/propresenter/README.md`, and stand-ins (`Series One`, `Sample Message A`) all exist.
- **Comments in `scripts/check-private-terms.mjs:2-12` and `test/check-private-terms.test.ts:7-8`** — load-bearing (`comments-must-be-load-bearing`): explain why the terms list lives outside the repo, the three CLI modes, the binary-file boundary, and why the tests use made-up terms.
- **Load-induced failures during parallel `pnpm test` (`test/propresenter.test.ts:7257`, `test/set-builder-plan-list.test.ts:403`)** — both are untouched files; `test/propresenter.test.ts` passed 385/385 alone, `test/set-builder-plan-list.test.ts:403` passed on standalone rerun, and GitHub Actions CI passed all 102 test files on PR #17 (`e0fa6ee`).

## Minor / nits

- `.claude/rules/public-repository.md:23-24` says "A recording from a real Planning Center, ProPresenter or Eos goes through its scrub script before it is committed (`scripts/scrub-pco-fixtures.mjs`, `scripts/scrub-propresenter-fixtures.mjs`)", though Eos has no scrub script (`test/fixtures/eos/README.md` records hand edits directly).
- `scripts/check-private-terms.mjs:1` carries a `#!/usr/bin/env node` shebang while the file mode is `644` (non-executable); harmless because callers run `node scripts/check-private-terms.mjs` or `pnpm check:private`.
- `scripts/check-private-terms.mjs:58`: if a working tree has zero matching tracked text files (for example, after an unstaged deletion of the only tracked file in a scratch repo), `git grep` exits `1` and throws `execFileSync`; does not occur in this repository.
- `scripts/check-private-terms.mjs:30-31`: a malformed `word:` line with nothing after `word:` would build an empty-match regex matching every line, and `word: term` with a space after the colon would not trim the leading space (none of the 3 `word:` lines in the real file have spaces).
- Local `.git/hooks/pre-push` does not scan annotated tag messages or taggers when pushing an annotated tag (the repository currently publishes no tags).

## Test quality

Tests added: 8 (`test/check-private-terms.test.ts`) · green against `$BASE` (assert nothing new): 3 · tautology shapes found: 3 (plus 1 partial assertion).

- **Green against `$BASE` (`adee302`):** Running `test/check-private-terms.test.ts` with `scripts/check-private-terms.mjs` absent passed 3 of 8 tests (`matches a word: term as a whole word only` at line 62, `fails a range whose commit message holds a term` at line 78, `fails a range with a commit whose author address holds a term` at line 84), because each asserts only `status === 1` without checking `stderr` (**Finding 3**). Line 93 (`--stdin` dirty input) also asserts only `status === 1`, though line 94 catches a missing script on clean input.
- **Clean-checkout failure:** `scratch()` at line 24 omits `mkdir(join(REPO_ROOT, 'dist'), { recursive: true })`, causing 8 of 8 tests to fail with `ENOENT` when `dist/` does not yet exist (**Finding 2**).
- **Coverage notes:** `git config user.email` in Test 6 sets both author and committer email, so deleting `%cn <%ce>` from `scripts/check-private-terms.mjs:50` would not fail Test 6; setting `GIT_COMMITTER_EMAIL` separately in an additional assertion would pin committer scanning too. New regression tests should accompany Findings 1, 4, 5, and 6.

## Before opening the PR

- **CI readiness:** PR #17 (`e0fa6ee`) CI (`Lint, type check, test and build`) is green on GitHub Actions (7m15s); `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm check:private` (tree and `--range origin/main..HEAD`) all pass locally.
- **Commit hygiene:** Working tree had 0 uncommitted changes at review time; both commits (`d0fbc23`, `e0fa6ee`) are clean, scoped to `setlist-controller-archive#604`, and pass `pnpm check:private`. Do not commit this review doc from the reviewer session; the epic session commits it after confirmation.
- **Likely reviewer asks:** Whether to remediate Findings 1–5 in PR #17 before merge (recommended, especially Finding 1's silent `--` / unknown-flag bypass) and whether to apply Finding 7 to the local `.git/hooks/pre-push` on the maintainer's Mac at the same time.

## Verdict

**Not ready to merge as-is.** Gate before merging PR #17: fix **Finding 1 (HIGH)** and **Findings 2–5 (MEDIUM)** (all verified with red-before-green repros in `docs/reviews/setlist-controller-604/repro/review-4-findings.mjs`). **Finding 6 (LOW)** is a two-character fix worth taking alongside Finding 5, and **Finding 7 (LOW)** should be applied to the local out-of-tree `.git/hooks/pre-push`.
