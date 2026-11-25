# Pre-PR review: setlist-controller#604 Public CI workflow and Linux Eos test helper

**Branch:** `setlist-controller-604-public-ci` vs `origin/main` (merge-base `9cea196`, "Merge pull request #623 from nick-vogel/setlist-controller-604-mit-license")
**Reviewed at:** HEAD `1d54da3` (setlist-controller#604 CI on the public repository: lint, type check, test and build) + 0 files with uncommitted changes, 0 untracked files, 3 files total, +53 / −5
**Reviewed against:** epic `nick-vogel/setlist-controller#604` (open; no sub-issues), PR `nick-vogel/setlist-controller#624`, `docs/merge-rules.md`, and the global rules in `~/.claude/rules/`. The repo has no `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, ADRs, or `.claude/rules/`. Run with `--fresh` (reviews 1 and 2 in this folder belong to the already-merged PR #618).
**Date:** 2026-11-24
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present (`eslint`, `playwright`, `tsc`, `tsserver`, `vite`, `vitest`); lockfile unchanged since `9cea196` |
| Workflow static check | `actionlint` | pass (0 warnings or errors) |
| Pinned action SHAs & contracts | `gh api` on `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` tags, `action.yml`, READMEs, and `pnpm/action-setup` `src/install-pnpm/run.ts` | all 3 SHAs match their exact latest release commits (`v7.0.1`, `v6.1.1`, `v7.1.0`); all run on `node24`; `pnpm/action-setup` reads `packageManager: "pnpm@10.13.1"` and self-updates before `setup-node` runs `pnpm store path` for `cache: pnpm` |
| Private-repo skip behaviour | `gh run list --branch setlist-controller-604-public-ci` and `gh pr checks 624` | both `push` (`45529846817`) and `pull_request` (`45529886768`) completed as `skipped` on HEAD `1d54da3` with 0 runner execution |
| Lint, typecheck, build (macOS) | `pnpm lint && pnpm typecheck && pnpm build` | pass (`vite build` 81 ms) |
| Eos suite (macOS) | `pnpm exec vitest run test/eos.test.ts --maxWorkers=1` | pass: 248 passed (29.03 s) |
| Full unit/integration suite (macOS) | `pnpm test -- --maxWorkers=4`, then standalone reruns of timed-out files with `--maxWorkers=1` | parallel run: 97 passed, 2 failed under load (`test/eos.test.ts:1926` `comesOnline` 2 s timeout, untouched test; `test/propresenter.test.ts:6000` 2 s read timeout, untouched file); both passed 100% alone (`test/eos.test.ts` 248/248, `test/propresenter.test.ts` 385/385); combined: 99 files, 3,264 passed, 4 skipped |
| Linux container verification | `docker run --rm --cpus=4 --memory=7g node:24` (`v24.22.3`, `pnpm@10.13.1` via `npm`, user `node`, git clone on container disk) | `pnpm install --frozen-lockfile` (2.1 s), `pnpm lint`, `pnpm typecheck`, `pnpm build` (63 ms), `test/setup-screen.test.ts` + `test/conflict-markers.test.ts` (2 files, 18 passed, including the 4 Linux-only refusal tests), and `test/eos.test.ts` 3 of 3 runs (248/248 each: 44.53 s, 44.35 s, 44.96 s) all passed |
| Base repro for `test/eos.test.ts` (Linux) | same `node:24` container with `git show 9cea196:test/eos.test.ts > test/eos.test.ts`, 3 runs of the failing test | failed 3 of 3 runs (`Waited 2000ms for a snapshot matching the given predicate`) |
| Playwright E2E suite | not run | `README.md:169` and `playwright.config.ts:5` state E2E runs locally only, never in CI, and this branch touches no app or web code |
| Live public-repository GitHub Actions run | not run | the public repository does not exist yet; the workflow is gated off while private and was verified via `actionlint`, action source inspection, and a `node:24` Linux container |

**Overall:** The workflow, pinned action commits, `README.md` sentence, and Linux Eos test helper fix all hold up under verification, including 3-for-3 Linux container reproduction at `$BASE` and 3-for-3 full passes at HEAD. No CRITICAL, HIGH, or MEDIUM defects were found. One LOW documentation gap remains: `docs/merge-rules.md` still says the repository has no CI and `gh pr checks` reports no checks, which is already stale on PR #624 and will mislead a merge-owner session once `main` is copied to the public repository.

## Confirmed Issues

### 1. `docs/merge-rules.md` still says the repository has no CI and `gh pr checks` reports no checks — LOW
- **Location:** `docs/merge-rules.md:7-9`
- **Attribution:** introduced (`whole-surface-of-a-change`). `27f60b3` ("Merge rules: no review, merge commit, a local together check because the repo has no CI") added `docs/merge-rules.md` on `main` while `.github/workflows/ci.yml` was absent. This branch restores `.github/workflows/ci.yml` (`1d54da3`) and updates `README.md:167` to describe the public-vs-private CI split, leaving `docs/merge-rules.md:8-9` out of sync.
- **Real-world trigger:** A merge-owner session runs on the future public repository (seeded from `main`, which carries `docs/merge-rules.md`) or inspects `gh pr checks` on this private archive after PR #624 lands, and reads `docs/merge-rules.md` before Gate 2. Rated LOW because on the private archive CI still skips and Gate 4 runs the together check locally either way, and on the public repository Gate 4's local check backstops Gate 2.

**Evidence** — `docs/merge-rules.md:7-9`
```markdown
- **Together check:** `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`.
  The repo has no CI, so `gh pr checks` reports no checks. Gate 2 passes with nothing to read, and
  gate 4 always runs the together check locally on the merged tree, even when the branch is up to date.
```

**Failure mode** — Even on this private repository today, `gh pr checks 624` no longer reports "no checks"; it reports two skipped `CI/Lint, type check, test and build` checks (`0 cancelled, 0 failing, 0 successful, 2 skipped, and 0 pending checks`). Once `main` is copied to the public repository, CI runs on every push to a non-`main` branch and on fork pull requests, so a merge-owner session trusting `docs/merge-rules.md:8-9` would be told there is no CI and to pass Gate 2 with nothing to read.

**Recommended fix**
```diff
 - **Together check:** `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`.
-  The repo has no CI, so `gh pr checks` reports no checks. Gate 2 passes with nothing to read, and
-  gate 4 always runs the together check locally on the merged tree, even when the branch is up to date.
+  On the private archive, `.github/workflows/ci.yml` skips its job, so `gh pr checks` reports skipped
+  checks and no runner executes; gate 2 passes with nothing running, and gate 4 always runs the
+  together check locally on the merged tree, even when the branch is up to date. On the public
+  repository, CI runs lint, type check, test and build on every push to a branch other than `main`
+  and on pull requests from forks; gate 2 reads `gh pr checks` there (same-repo PRs show the `push`
+  check beside a skipped `pull_request` check), and gate 4 still runs locally when the branch is not
+  up to date with `main` because `push` checks the branch head rather than the merge commit.
```

**Remediation brief**
- **Design intent:** `docs/merge-rules.md` is the operational runbook read by the merge-owner session before Gate 1 so it knows how to evaluate `gh pr checks` at Gate 2 and when to run the local together check at Gate 4. Its description of CI must match `.github/workflows/ci.yml` and `README.md:167` for both the private archive (where the job skips) and the future public copy seeded from `main` (where the job runs on non-`main` branch pushes and fork pull requests, and skips `pull_request` on same-repo PRs).
- **Full surface:** `docs/merge-rules.md:7-9`. Every other CI mention across the repository was grepped and verified accurate (`README.md:167`, `README.md:169`, `docs/install.md:181`, `playwright.config.ts:5`, `src/contract/main.ts:10`, `test/offline.test.ts:71`, `test/setup-screen.test.ts:142`).
- **Must preserve:** Keep the exact together-check command (`pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`), the private-archive Gate 2 and Gate 4 rules (always run Gate 4 locally on the merged tree on the archive), and the rest of `docs/merge-rules.md` (`Review rules`, `Merge method`, `Repo gates`, `Post-merge run`).
- **Do not touch:** `.github/workflows/ci.yml` (the public/private `if:` gate and same-repo `pull_request` skip are deliberate and verified — see Reviewed and Dismissed) and `README.md:167` (already accurate).
- **Proof:** `git grep -n "no CI" docs/merge-rules.md` currently matches line 8 and must return exit 1 (no matches) after the edit; `gh pr checks 624` confirms the archive reports two skipped `CI/Lint, type check, test and build` checks rather than no checks.

## Needs Further Investigation

None.

## Reviewed and Dismissed

- **Pinned GitHub Action SHAs and step ordering (`.github/workflows/ci.yml:28-35`)** — verified via `gh api` against each upstream repository: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` is `v7.0.1`, `pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115` is `v6.1.1`, and `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` is `v7.1.0`. Read `pnpm/action-setup`'s `src/install-pnpm/run.ts` at that exact commit: omitting `version:` reads `"packageManager": "pnpm@10.13.1"` from `package.json`, automatically falls back to standalone bootstrap if system Node is `< 22.13`, and self-updates to `10.13.1` before `actions/setup-node` runs `pnpm store path` for `cache: pnpm`.
- **Epic #604 public-CI security checklist (`.github/workflows/ci.yml:3-30`)** — uses `pull_request` (never `pull_request_target`), top-level `permissions: contents: read`, zero secrets, `persist-credentials: false` on checkout, `timeout-minutes: 15`, full 40-char SHA pins, and `runs-on: ubuntu-latest` (no self-hosted runner).
- **Private-repo gating expression and deleted-fork safety (`.github/workflows/ci.yml:23`)** — `github.event.repository.private` is a required boolean in GitHub's `push` and `pull_request` webhook payloads (confirmed live on PR #624: both runs skipped). On a deleted fork where `head.repo` is `null`, `null.full_name` evaluates to `''`, `'' != github.repository` is `true`, and `!=` is case-insensitive in GitHub Actions expressions.
- **Tag pushes under `on.push.branches-ignore: [main]` (`.github/workflows/ci.yml:5-6`)** — per GitHub Actions documentation, specifying `branches-ignore` without `tags`/`tags-ignore` means tag pushes do not trigger the workflow.
- **Concurrency interaction between `push` and skipped `pull_request` runs (`.github/workflows/ci.yml:10-12`)** — `pull_request` uses `ci-refs/pull/<n>/merge` and `push` uses `ci-<run_id>`, so a skipped `pull_request` run on a same-repo PR can never cancel the active `push` run.
- **`git grep` test under shallow checkout and `persist-credentials: false` (`test/conflict-markers.test.ts`)** — `git grep` inspects tracked files at `HEAD` only, needs neither git history nor credentials, and passed in the Linux `node:24` container.
- **Linux `pnpm install --frozen-lockfile` with `@julusian/midi` (`pnpm-workspace.yaml`)** — verified in `node:24` Linux container (`2.1 s`, 213 packages, zero build or runtime failures; `ignoredBuiltDependencies` works cleanly).
- **`drop()` extra `clock.advance(PING_MS)` when a connect-ping is still in flight (`test/eos.test.ts:2217-2232`)** — even if one earlier ping arrives after `sent` is sampled, `pings(fake).length` stops growing once `connection.destroy()` fires on tick 4, so at most one extra `clock.advance(PING_MS)` (1000 ms) can run before `vi.waitFor` blocks on `gone`; `RETRY_MS` is 5000 ms, no caller asserts `clock.now()`, and `test/eos.test.ts:2284-2290`'s `clock.stall(RETRY_MS)` loop still fires exactly two retries.
- **`drop()` error handling when `vi.waitFor` throws (`test/eos.test.ts:2221-2224`)** — `dropped.then(() => (gone = true), () => {})` prevents an unhandled rejection on `dropped` if `vi.waitFor` throws first, while `await dropped` on line 2231 still rethrows if `dropped` itself rejects.
- **Fixed 3+1 ping loop in `test/eos.test.ts:1323-1329`** — intentionally kept fixed because that test directly asserts the `LOST_AFTER_PINGS = 3` rule (`online` after pings 1, 2, and 3; `offline` after tick 4) after `await read()` has completed. Passed 3 of 3 times on Linux and alone on macOS.
- **Load-induced failures during parallel `pnpm test -- --maxWorkers=4`** — `test/eos.test.ts:1926` (untouched test, does not call `drop()`) and `test/propresenter.test.ts:6000` (untouched file) both timed out at 2 s under concurrent load and both passed 100% when rerun alone (`test/eos.test.ts` 248/248 on macOS and 3× 248/248 on Linux; `test/propresenter.test.ts` 385/385).
- **Comments in `.github/workflows/ci.yml` and `test/eos.test.ts:2212-2216`** — all comments are load-bearing, cite concrete reasons/issues/dates (`setlist-controller#604`, `3e3657a`, `2026-11-24`), and match the code beside them.
- **Church references in the diff** — none appear in `.github/workflows/ci.yml`, `test/eos.test.ts`, `README.md`, or either commit message.

## Minor / nits

- Because `.github/workflows/ci.yml:23` skips `pull_request` on same-repo PRs, CI checks a same-repo PR's branch head (`push`) rather than GitHub's trial merge commit (`refs/pull/<n>/merge`), and rapid pushes to a same-repo branch run concurrently rather than cancelling the older check (deliberate trade-off from `317815d` and documented in `.github/workflows/ci.yml:8-9,21-22` and `README.md:167`).
- Because `on.push.branches-ignore: [main]` never runs CI on `main`, GitHub Actions never populates a default-branch pnpm store cache, so the first push of a new branch or a fork PR will start from a cold pnpm cache (adds a few seconds, no correctness impact).
- On the first push to the new public repository, pushing the initial commit straight to `main` will not trigger CI because of `branches-ignore: [main]`; the real runner timing noted in the PR description will appear on the first push to a non-`main` branch.

## Test quality

Tests added: 0 · modified helper (`drop()` in `test/eos.test.ts:2217-2232`) · green against `$BASE` (assert nothing new): 0 · tautology shapes found: 0.

`23e5fb2` adds no new `it()` cases; it modifies the shared `drop()` helper used by 26 existing silent/closed drop tests in `test/eos.test.ts`. Verified against `$BASE` (`9cea196`) in a `node:24` Linux container: the targeted test (`never pauses once they have connected again on a cue the fired cue follows on to while they were offline, judged once: silent`) failed 3 of 3 runs at `$BASE` and passed 3 of 3 full `test/eos.test.ts` runs (248/248) at HEAD (`1d54da3`). The wider 8-ping loop does not weaken the `LOST_AFTER_PINGS = 3` invariant, which is independently asserted by `test/eos.test.ts:1314-1338`, and `await dropped` at `test/eos.test.ts:2231` still fails any test if Eos stops going offline on silence.

## Before opening the PR

- **CI readiness:** `actionlint`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and all 99 test files (3,264 passed, 4 skipped on macOS) are green; Linux `node:24` container verified `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `test/setup-screen.test.ts` (including the 4 Linux-only cases), `test/conflict-markers.test.ts`, and `test/eos.test.ts` (3× 248/248). Both GitHub Actions runs on PR #624 (`45529846817`, `45529886768`) skipped cleanly while private.
- **Commit hygiene:** Working tree had 0 uncommitted changes at review time; both commits (`23e5fb2`, `1d54da3`) are clean and scoped to epic #604. Do not commit this review doc from the reviewer session; the epic session commits it after Nick confirms.
- **Likely reviewer asks:** Whether to update `docs/merge-rules.md:7-9` in this PR (Finding 1, LOW) or as part of the public-repo cutover.

## Verdict

**Ready with follow-ups** (zero CRITICAL, HIGH, or MEDIUM findings). PR #624 meets every requirement in epic `nick-vogel/setlist-controller#604`'s "When CI comes back" section and fixes the Linux Eos test flake cleanly. The single confirmed finding (`docs/merge-rules.md:7-9`, LOW) can be fixed in-branch before merge or folded into the public-repo cutover.

## Remediation — 2026-11-24
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `2f4b193` pre-PR review 3 finding 1: the merge rules say the repo has no CI | red→green: `git grep -n "no CI" docs/merge-rules.md` matched line 8 before and exits 1 after; `gh pr checks 624` shows the two skipped checks the new text describes | 0 | fixed; worked as a LOW because Nick asked for every review finding cleared |

### Known regressions, deferred
None.

### Rework briefs
None.

## Approach decisions
- The fix keeps gate 4 as it was, a local together check on every merge, on both repositories. The recommended diff relaxed gate 4 on the public repository when the branch is up to date; that changes a merge rule, which is Nick's call, so it was left out.
