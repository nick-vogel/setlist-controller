# Pre-PR review: setlist-controller#32 Set builder: one command builds the Sunday set from the song library

**Branch:** `setlist-controller-32-set-builder` vs `origin/setlist-controller-1-ipad-rehearsal` (merge-base `a5c78a4` "setlist-controller#1 pre-PR review 3")
**Reviewed at:** HEAD `3d054a1` (setlist-controller#32 pre-PR review 1 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 29 files total, +3900 / -1 against the merge-base
**Delta under review:** since `e5cbd88` (setlist-controller#38 Command conveniences: short song names, next-Sunday date, replace, summary), the HEAD that `pre-pr-review-1.md` reviewed. 8 commits, `0da2064` to `3d054a1`; 9 files, +499 / -21: 4 source files (`src/set-builder/build-set.ts`, `main.ts`, `timeline.ts`, `write-set.ts`), 2 test files (`test/set-builder.test.ts`, `test/set-builder-command.test.ts`), review doc 1 and its 2 repros
**Reviewed against:** the epic body of setlist-controller#32 (user stories 37 and 41, and the Testing Decisions cross-check), and `pre-pr-review-1.md`: its five findings with their briefs, Approach decisions, remediation closure table and verifier notes. The repo still has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Round 2, delta-scoped, no `--fresh`.
**Date:** 2026-10-16
**Reviewer:** 1 code-review agent + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | ok, lockfile up to date |
| Lint | `pnpm lint` | pass (the 2 round-1 repros and this round's repro included, since `eslint .` lints `docs/`) |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 24 files, 326 passed, 2 skipped (the two `it.runIf(linux)` cases in `test/setup-screen.test.ts`, unchanged) |
| Build | `pnpm build` | pass |
| Playwright suite | `pnpm test:e2e` | 7 passed (webkit-ipad) |
| Round-1 repros at HEAD | both copied into `test/` of a scratch worktree at `3d054a1`, run with `pnpm exec vitest run` | 2 files, 3 passed: the partial-write repro (finding 1) and both cases of the controller cross-check repro (findings 2 and 3) are green |
| Round-1 finding 4 proof | `(cd test && pnpm --silent build-set zzz --library ./fixtures/set-builder/library --output-root <scratch>)`, then the same through `node src/set-builder/main.ts` with `INIT_CWD=<repo>` and `npm_lifecycle_event=dev:server` | both print `"zzz" matches no song folder in <repo>/test/fixtures/set-builder/library` and the three fixture folders; nothing written |
| pnpm's `INIT_CWD` in other forms | finder: scratch package printing its environment, pnpm 10.13.1 | an inherited `INIT_CWD=/bogus` with `npm_lifecycle_event=build-set` is overridden by the invoking folder; `pnpm -C <pkg>` and `pnpm --dir <pkg>` set `INIT_CWD` to the invoking folder too |
| Mutations of the delta's source | finder, scratch worktree at `3d054a1`: A drop the cleanup `rm`; B `isEndMarker` blank-only; C always `INIT_CWD`; D always `process.cwd()`; E `await rm(folder, ...).catch(() => {})` at `build-set.ts:104` | A, B, C, D each go red. **E survives: all 77 tests in the two changed test files pass** (finding 1) |
| Tautology audit, oracle `e5cbd88` | the HEAD versions of the two changed test files run against `e5cbd88`'s source in a scratch worktree | 77 tests: 4 red, 73 green. Red as designed: the End-named marker test, the partial-write test, both relative-path `it.each` cases. Green: the lowercase `end` test (a must-preserve pin), the three finding-5 tests (behaviour existed), the plain-node `INIT_CWD` test (guards `f38bf00`'s regression; red with `f38bf00`'s `main.ts` swapped in), and the failed-cleanup test (finding 1). No pre-existing test went red under the new `parseSet` check |
| Failed-cleanup test under mutations | audit agent, scratch worktree at `3d054a1`, `-t "failed cleanup"` | (a) catch without rethrow: green; (b) `rm` errors ignored, write error rethrown: green; (c) no cleanup: green; (d) every error swallowed: red. The sibling test at `test/set-builder.test.ts:1241` catches (a) and (c); nothing catches (b) |
| `--replace` over a leftover that is still read-only | executed repro `repro/review-2-failed-cleanup.test.ts` | red: the plain build rejects with `EACCES ... unlink '.../Ableton Project Info/...'` (not `AG 2.wav`); the replacing build swaps the new set in, then rejects with `EACCES ... unlink '.../.2026-10-18 Sunday replacing XXXXXX/old/Ableton Project Info/Project8_1.cfg'` (finding 1) |
| Recommended fix for finding 1 | applied in a scratch worktree at `3d054a1`, since removed | `-t "failed cleanup"` green; with mutation E applied, red (green without the fix); `test/set-builder.test.ts` 65 passed |
| Real song library modes | read-only scan: `ls -ld ~/Music/MultiTracks/*/"Ableton Project Info"`; `find ~/Music/MultiTracks ! -perm -u+w \| wc -l` | all 7 Project Info folders are user-writable; 0 entries not user-writable, so finding 1's trigger does not occur today |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #39 is Nick's manual run |

**Overall:** All five round-1 findings are fixed against their intent, each proved by execution: a plain build that fails while writing leaves the output root as it was, every build through the test helper is read back by the controller's own parser with zero warnings, an end marker named End gives one End, relative path flags resolve against the operator's folder through pnpm and through plain node alike, and the command's fallback exits are pinned. This round confirms one LOW finding, in a test the remediation added: it does not pin which error reaches the operator when the cleanup itself fails, and its `--replace` half passes only because the test makes the leftover writable first. Nothing gates the PR.

## Approach decisions
- **Cleanup after a failed write, plain build (round 1 finding 1):** the folder the build created with its non-recursive `mkdir` is removed on any write failure and the error rethrown, mirroring the catch in `replaceFolder` (`src/set-builder/build-set.ts:118-124`). The `mkdir` stays outside the `try`, so a folder the build did not create is never removed.
- **A cleanup that itself fails (round 1 finding 1, amended by round 2 finding 1):** the `rm` is not wrapped, so its error replaces the write error and reaches the operator; the failed-cleanup test pins that error with `/EACCES/`. The existing-folder stop plus `--replace` recovers once the leftover can be removed. While the cause remains (a folder in the leftover that is not writable), `--replace` swaps the new set in and then rejects on `replaceFolder`'s final `rm` (`build-set.ts:127`), leaving the hidden work folder; that is round 1's first Minor / nits bullet, unchanged here because no library file is read-only. This supersedes round 1's "the existing-folder stop plus `--replace` is the backstop the test pins" without that limit.
- **Controller cross-check (round 1 finding 2):** set-builder tests read the built locators back and run them through the real `parseSet` from `src/server/set-parser.ts`, expecting zero warnings, inside the `build` helper of `test/set-builder.test.ts`. The local `CONTROLLER_GRAMMAR` regex is gone. Direct `buildSet` calls, `test/set-builder-stop-rules.test.ts` and `test/set-builder-command.test.ts` stay outside the check by decision.
- **End marker (round 1 finding 3):** a locator whose trimmed name is empty or exactly `End` is an end marker. One predicate, `isEndMarker` (`src/set-builder/timeline.ts:47-50`), serves the timeline and the locator renaming.
- **Relative path flags (round 1 finding 4, as reworked in `1ee1225`):** `INIT_CWD` is taken only when `npm_lifecycle_event` is `build-set`; any other run resolves against `process.cwd()`, so a leftover `INIT_CWD` never wins (`src/set-builder/main.ts:49`).

## Confirmed Issues

### 1. The test of a plain build whose cleanup fails pins neither the error the operator sees nor a `--replace` recovery that holds while the cause remains — LOW
- **Location:** `test/set-builder.test.ts:1252-1276`, the assertion at `:1261`; the behaviour it should pin at `src/set-builder/build-set.ts:101-106`
- **Attribution:** introduced. `git log -S"failed cleanup leaves" a5c78a4..HEAD -- test/` gives `24d7eb4` (setlist-controller#32 pre-PR review 1 finding 1). The replacing build's failure after the swap is pre-existing, untouched: `await rm(work, { recursive: true, force: true });` came in `9d51050` (setlist-controller#38 review pass 1 finding 1) and is round 1's first Minor / nits bullet. Not named in round 1's Known regressions, deferred.
- **Real-world trigger:** a write failure (a missing WAV, a full disk) on a song whose `Ableton Project Info`, or a file in it, is not user-writable, since `copyProjectInfo` (`src/set-builder/audio.ts:95-101`) copies it with its mode. None known: `find ~/Music/MultiTracks ! -perm -u+w | wc -l` gives 0 on 2026-10-16. LOW, capped: raise to MEDIUM if that count is ever above 0.

**Evidence**
```ts
      await chmod(projectInfo, 0o555);
      try {
        await expect(buildSet(await buildOptions(workspace, ['goodness']))).rejects.toThrow();
      } finally {
        await chmod(projectInfo, 0o755);
        if (existsSync(copied)) await chmod(copied, 0o755);
      }
      ...
      const replaced = await buildSet({ ...(await buildOptions(workspace, ['grace'])), replace: true });
      expect(replaced).toMatchObject({ ok: true, setPath: setPath(workspace) });
```

**Failure mode** — Two gaps in one test. First, `rejects.toThrow()` takes any error, so the recorded decision that the cleanup's error replaces the write error is unpinned: changing `build-set.ts:104` to `await rm(folder, { recursive: true, force: true }).catch(() => {});`, which rethrows the write error instead, passes all 77 tests in the two changed test files. Second, the test makes the leftover writable in its `finally` before it asserts that `--replace` recovers. With the leftover still read-only, the state the failure itself leaves, the plain build rejects with `EACCES ... unlink '.../2026-10-18 Sunday/Ableton Project Info/...'` (the operator never sees `AG 2.wav`), and the replacing build of `grace` swaps the new set in, then rejects with `EACCES ... unlink '.../.2026-10-18 Sunday replacing XXXXXX/old/Ableton Project Info/Project8_1.cfg'`, exits 1 and leaves the hidden work folder (repro). The test name ("and replaces that folder when the build replaces") and round 1's Approach decision claim a backstop that holds only once the folder can be removed.

**Recommended fix** (in `test/set-builder.test.ts`; verified in scratch: the test is green, and goes red under the mutation above)
```diff
   it.skipIf(process.getuid?.() === 0)(
-    'stops the next build on the folder a failed cleanup leaves, and replaces that folder when the build replaces',
+    'surfaces the cleanup error, stops the next build on the folder a failed cleanup leaves, and replaces that folder once it can be removed',
     async () => {
@@
       try {
-        await expect(buildSet(await buildOptions(workspace, ['goodness']))).rejects.toThrow();
+        await expect(buildSet(await buildOptions(workspace, ['goodness']))).rejects.toThrow(/EACCES/);
       } finally {
```
The diff removes no behaviour: it narrows one assertion and renames the test. The Approach decisions above already carry the amended backstop line.

**Remediation brief**
- **Design intent:** `buildSet` returns problems before writing a byte; once writing starts, a plain build writes into a folder it just created, and on failure removes that folder and rethrows. When the removal itself fails, the removal's error is what the caller (and the command's `catch`, `src/set-builder/main.ts:68-71`) sees, by round 1's recorded decision, and part of the folder stays; the next build stops on the existing folder, and `--replace` recovers once the leftover can be removed.
- **Full surface:** `test/set-builder.test.ts:1253` (the name) and `:1261` (the assertion). No source change. The doc's Approach decisions are already amended.
- **Must preserve:** the `finally` that restores both modes (`:1262-1265`), which `removeWorkspaces` needs to delete the workspace; `it.skipIf(process.getuid?.() === 0)`, since root ignores the mode; the existing-folder stop assertion (`:1268`) and the replace assertions (`:1270-1274`); the sibling test at `:1241`, which pins that the write error reaches the caller when the cleanup succeeds and that nothing is left. `src/set-builder/build-set.ts:100-106` is unchanged.
- **When the fix itself fails:** the regex depends on `unlink` in a folder without write permission failing with `EACCES`, which macOS gives (by execution) and POSIX names for Linux CI. If a platform gives `EPERM`, the test goes red there, which is a visible failure, not a silent pass.
- **Do not touch:** `replaceFolder`'s final `rm` (`build-set.ts:127`): pre-existing, round 1's first Minor / nits bullet, no real trigger. The decision that the cleanup's error replaces the write error: recorded in round 1, so this fix pins it rather than changing it. `mkdir(folder)` outside the `try` (Reviewed and Dismissed).
- **Proof:** apply the mutation `await rm(folder, { recursive: true, force: true }).catch(() => {});` at `src/set-builder/build-set.ts:104` and run `pnpm exec vitest run test/set-builder.test.ts -t "failed cleanup"`: green before the fix, red after it. Restore `build-set.ts`, then `pnpm test`. The second gap is shown by `cp docs/reviews/setlist-controller-32/repro/review-2-failed-cleanup.test.ts test/ && pnpm exec vitest run test/review-2-failed-cleanup.test.ts; rm test/review-2-failed-cleanup.test.ts`, red at `expect(replacing).toBe('resolved')`. It stays red after this fix by design: it records the pre-existing `replaceFolder` behaviour the renamed test no longer claims to cover.

## Needs Further Investigation

### A. A later song whose first tempo event is a ramp, not a step, may ramp across its gap
Unchanged since round 1 (`src/set-builder/write-set.ts:82`); no library song has such an event. What would confirm it is in `pre-pr-review-1.md`.

### B. `--replace` while the old set is open in Live
Unchanged since round 1; for #39's acceptance run.

## Reviewed and Dismissed
- Successful builds outside the `build` helper are not read by `parseSet`: 13 runs in 12 tests (`test/set-builder.test.ts:1172`, `:1185`, `:1243`, `:1270`; `test/set-builder-stop-rules.test.ts:352`; `test/set-builder-command.test.ts:55`, `:68`, `:89`, `:153` and `:161`, `:174` twice, `:187`). Round 1's finding 2 brief left the direct calls and both other files untouched by decision, and their locators come from the same `writeSet` call (`src/set-builder/build-set.ts:87`) that the 54 helper builds cross-check; the replace branch only changes where the project is written. Do not touch.
- `parseSet` is not asked for sections: sections are pinned by exact locator names (`test/set-builder.test.ts:318-341` and the `2 - ` table in the three-song test), as round 1's brief intended. The three-song test's `songs` table (`:667-671`) is literal, not computed with builder code.
- The plain-node `INIT_CWD` test is green at `e5cbd88`: by design, since it guards the regression `f38bf00` introduced; it goes red with `f38bf00`'s `main.ts`.
- The three finding-5 tests and the lowercase `end` test are green at `e5cbd88`: they pin behaviour that existed or must not change, and the finding-5 tests were shown able to go red by mutation (`3f8a145`).
- A song with both a blank end marker and an earlier locator named End: `parseSet` warns before and after the change (`repeated-end` before; `repeated-end` or `section-after-end` now), so it is no regression; the filed proposal on a named locator after the End covers it.
- `isEndMarker`'s trim against `parseSet`'s: JavaScript's `trim()` and the parser's `\s*` both take Unicode whitespace, so a padded `End` is an end marker in both.
- `mkdir(folder)` outside the `try`: only a race past the existing-folder stop reaches an existing folder there, and then nothing must be removed. Correct as is.
- The three repros under `docs/reviews/setlist-controller-32/repro/` sit outside vitest's `include` (`test/**/*.test.ts`) and tsc's `include`, so they never run in the suite; `eslint .` lints them and they pass.

## Minor / nits
- `test/set-builder.test.ts:1243`: the seeding build for 2026-10-25 is not checked. If it failed, the test would still pass against a smaller snapshot. Optional: `expect(...).toMatchObject({ ok: true })`.
- Round 1's Minor / nits list stands unchanged; none of it was worked, as its closure table says.

## Test quality
Tests added in the delta: 10 cases in 9 `it` blocks, plus a `parseSet` songs assertion in the existing three-song test and the `parseSet` check in the `build` helper. At `a5c78a4` all fail on import, as in round 1. At `e5cbd88`, the useful oracle for this delta: 4 red as designed, 6 green, each explained above; the one green test that carries a gap is the failed-cleanup test (finding 1). Tautology shapes found: 0. No mocks, no stored snapshots (`snapshotFolder` compares before and after), no expectation computed with builder code (`parseSet` imports only shared types). Round 1's two weak assertions (`test/set-builder-stop-rules.test.ts:348`, `test/set-builder-command.test.ts:146`) stand, unworked.

## Prior-review closure
| Round 1 finding | Fix | Status | How verified this round |
| --- | --- | --- | --- |
| 1 (MEDIUM) plain build leaves a half-written folder | `24d7eb4` | fully fixed | partial-write repro green; mutation A (no cleanup) red; `mkdir` outside the `try`. The fallback test's gaps are this round's finding 1, in the test, not the fix |
| 2 (MEDIUM) no `parseSet` cross-check | `04b13e4` | fully fixed | `build` helper expects zero warnings on every ok result; three-song test checks songs against a literal table; regex gone; no pre-existing test went red under it |
| 3 (LOW) a second End after an End-named marker | `32e3b0c` | fully fixed | repro's second case green; mutation B red; the End test is red at `e5cbd88` on its own literal count, not only through the helper |
| 4 (LOW) relative path flags | `f38bf00`, reworked `1ee1225` | fully fixed | proof re-run from `test/` through pnpm and plain node; mutations C and D red; `pnpm -C` and `--dir` set the invoking folder |
| 5 (LOW) untested fallback exits | `3f8a145` | fully fixed | test-only; three cases present with exact exit codes, empty stdout and nothing written |

5 fully fixed, 0 partially fixed, 0 untouched. None was resolved only by a comment or doc edit (finding 3's six reworded comment lines came with the predicate change). Round 1 deferred nothing: its Known regressions, deferred list is "None".

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` pass at HEAD; `pnpm test:e2e` passes locally.
- **Commit hygiene:** the tree is clean. Commit this doc and `repro/review-2-failed-cleanup.test.ts`. Nothing to drop.
- **Stacking:** the PR base is `setlist-controller-1-ipad-rehearsal`, since #32 sits on unmerged #1.
- **Likely reviewer asks:** the README has no `pnpm build-set` section (filed proposal); #39's run in Live is still owed.

## Verdict
**Ready to open the PR.** Severity counts: 0 CRITICAL, 0 HIGH, 0 MEDIUM, 1 LOW. Finding 1 is a one-commit test change that can go in a remediation pass before the PR or follow it; it gates nothing. All 5 round-1 findings are fully fixed, none only by a comment or doc edit. The confirmed count fell from 5 to 1, and the one left is test strength, not behaviour: the branch's behaviour is settled, and a third round on this delta would be scraping the barrel.
