# Pre-PR review: setlist-controller#58 Planning Center plan, third run (#169 to #172)

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `e7e43e5` "Merge pull request #173 from nick-vogel/setlist-controller-58-planning-center-plan")
**Reviewed at:** HEAD `5e7bf42` (setlist-controller#170 An inline comment after a token value is read into the value), clean tree: 0 files with uncommitted changes, 0 untracked; 10 files total, +329 / -75 against the merge-base
**Reviewed against:** the epic body of setlist-controller#58; the bodies of the four sub-issues this branch carries, #169 (the plan listing reports an existing set folder), #170 (an inline comment in the token file), #171 (a gzip body that will not inflate) and #172 (the build-set skill's exit 1 cases and the stem map fixes); the Approach decisions of `pre-pr-review-2.md`, whose finding 3 is #171's scope and whose comment-hygiene entry for `plan-reader.ts:132-134` #171 also asks for. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Run with `--fresh`, so the whole surface since the merge-base is reviewed and no delta scoping applies.
**Date:** 2026-10-21
**Reviewer:** 1 code-review agent + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | up to date; the branch changes neither `package.json` nor `pnpm-lock.yaml` |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and command suites | `pnpm test` | pass: 48 files, 997 passed, 4 skipped |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | pass: 42 passed |
| Tautology audit | the branch's 4 modified test files run against a scratch worktree at `e7e43e5`, then again with `listPaths` cut to `--library` so a refused `--output-root` is not the only cause of red | 45 tests added or changed: all red as written; with the flag cause removed, 25 argument-only changes pass (expected), 12 new tests stay red for the missing behaviour, 5 pass at base (see Test quality and finding 2) |
| #169: the listing looks at the build's folder | `main.ts` read: `outputRoot()` (`main.ts:341`) and `setFolder` (`build-set.ts:91`) serve both `build` and `planList`, with the same `from` and the same date default | held; the default root lives in one place |
| #169: the line on every listing exit path | agent trace plus the new tests: song-line problem, transition problem, build-check problem on stderr, clean listing with and without `--replace`, default root and `--output-root` | the line prints last on stdout in each, never sets exit 1; a token, plan or library problem returns before the folder is computed |
| #170: `tokenValues` against bash | agent probe of new vs old `tokenValues` vs `bash source` over 30 lines | every case the ticket names matches bash; two exotic lines with a quote or a backslash inside an unquoted value differ (Minor) |
| #170: the `#` line filter can go red | mutation `repro/review-3-mutation-comment-line-filter.diff` applied in a scratch worktree, then the token tests run | 6 of 6 still pass (finding 2) |
| #171: the new test goes red | mutation `&& !inflateFailed(error)` removed, scratch worktree | red: expected "cannot be read", got "Cannot reach Planning Center" |
| #171: a compressed body dropped mid-transfer keeps the connection line | probe under Node 26.3.0, 3 runs: gzip with a length, gzip chunked, gzip with FIN, br, each cut mid-body | `cause.code` `UND_ERR_SOCKET` every time, so the connection line holds; a gzip body cut short on a close-delimited connection gives `SyntaxError`, "cannot be read", as the new comment says |
| #172: the skill's exit 1 cases | `.claude/skills/build-set/SKILL.md` read against Run A and Run B of the ticket and a song-line problem | each output matches exactly one case; step 6 names a fix for every stem map line in `checks.ts:18`, `:21`, `:44`, `:63` and `main.ts:354-381`; "What it touches" names `config/stem-map.json` |
| Docs | README `:71`, USAGE, SKILL plan path, against the code | match |
| Not run | the fixture recorder; anything against the real Planning Center API | by the repo's guardrails |

**Overall:** The four tickets do what their acceptance criteria ask, and all five full checks are green. The listing and the build now share one output root and one set folder, the token parse reads comments as a shell does, the inflate failure reads as an answer that cannot be read, and the skill's exit 1 cases no longer overlap. The review confirmed three LOW findings: a flag check #169 left with nothing to catch, a comment-line filter no test can fail, and two comments to rewrap. None gates the PR.

## Approach decisions
- **A plan with no songs (review 1 finding 1, #160 item 1):** one reader problem in `readPlan` after the order-of-service loop, worded with the type's name; `build-set.ts`'s own guard stays. Landed.
- **A multi-line folder problem in the listing (review 1 finding 2, #160 item 2):** the problem's first line keeps the folder field, its other lines follow the song line. Landed.
- **Fallback tests (review 1 finding 3):** each new test runs the command through the package script against the fake, with a body derived from a recorded fixture. A reader-level classification test may call `readPlan` against a scratch server, as `brokenPlanningCenter` (`test/set-builder-plan.test.ts:100`) does. A pure parse with no observable command outcome is tested by importing it, as `test/set-name.test.ts:2` imports `setName` (finding 2).
- **Body-read failures (review 2 finding 3, #171):** classify by the error: a timeout is late, a `SyntaxError` or an inflate error (`cause.code` starting `Z_`) is an answer that cannot be read, anything else is the connection. Landed as decided.
- **The existing set folder in the listing (#169):** the listing computes the folder with the build's own `outputRoot()` and `setFolder`, and reports it as a stdout line that is never a problem; `setProblems` never takes the output root. Landed.
- **The `--plan --list` flag set (finding 1):** the listing takes every flag a `--plan` build takes, so it keeps no allow-list of its own; `--list` keeps `LIST_OPTIONS`.

## Confirmed Issues
### 1. The `--plan --list` flag check can no longer catch a flag, and USAGE lists every flag as the exception — LOW
- **Location:** `src/set-builder/main.ts:122`, `:171-172`
- **Attribution:** introduced by `9b7f049` (setlist-controller#169 Tell the plan listing when the set folder for the date already exists): `git log -S"'replace', 'output-root'" e7e43e5..HEAD` names only it. At `e7e43e5` the list lacked `replace` and `output-root`, and the check caught them.
- **Real-world trigger:** none; no input reaches the check. A maintainer who adds a build-only flag to `OPTIONS` would find the listing rejecting it only because the list happens not to name it, with no test showing the guard works. The cost today is dead code, a vacuous USAGE sentence, and two stale comments. LOW, no user path.

**Evidence**
```ts
const OPTIONS = { overlap, pad, gap, pads, date, replace, library, template, 'output-root', list, plan, 'service-type', 'plan-id' } // 13 keys, main.ts:103-116
const PLAN_LIST_OPTIONS: string[] = ['list', 'plan', 'library', 'pads', 'template', 'date', 'service-type', 'plan-id', 'overlap', 'pad', 'gap', 'replace', 'output-root'];
  const flag = (Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).find((option) => !PLAN_LIST_OPTIONS.includes(option) && values[option] !== undefined);
  if (flag !== undefined) usage(`--plan --list takes only --library, ... --gap, --replace and --output-root, not --${flag}.`);
```

**Failure mode** — `PLAN_LIST_OPTIONS` names all 13 keys of `OPTIONS`, so `find` always returns `undefined`; `parseArgs` is strict, so an unknown flag stops earlier. The two `it.each` rows that reached the usage line (`--replace`, `--output-root`) were removed by `9b7f049`, and nothing replaced them. USAGE (`main.ts:92-94`) says "--plan --list takes no song name, and no flag but" then names every flag. The comment at `main.ts:101-102` says the other flags are "a build's alone", and `:165` names "a flag --plan --list does not take" as a usage problem; neither case exists.

**Recommended fix** — drop the allow-list and its check, and say what is true:
```diff
-// The command's flags. --list takes only those of LIST_OPTIONS beside it, and --plan --list only those of
-// PLAN_LIST_OPTIONS; every other one is a build's alone.
+// The command's flags. --list takes only those of LIST_OPTIONS beside it; --plan --list takes every one a --plan build
+// takes.
```
```diff
-// The flags --plan --list takes: --list's, the plan's own, the transition flags, whose plan it lists, --template,
-// which it checks the songs against as the build does, and --output-root and --replace, so it looks for the set folder
-// the build would write and says whether --replace replaces it.
-const PLAN_LIST_OPTIONS: string[] = ['list', 'plan', 'library', 'pads', 'template', 'date', 'service-type', 'plan-id', 'overlap', 'pad', 'gap', 'replace', 'output-root'];
```
```diff
-  const flag = (Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).find((option) => !PLAN_LIST_OPTIONS.includes(option) && values[option] !== undefined);
-  if (flag !== undefined) usage(`--plan --list takes only --library, --pads, --template, --date, --service-type, --plan-id, --overlap, --pad, --gap, --replace and --output-root, not --${flag}.`);
```
In the `planList` comment (`main.ts:164-166`), "A song name, a flag --plan --list does not take (the first in parseArgs option order), an empty --plan-id, then a date that is not one" becomes "A song name, an empty --plan-id, then a date that is not one". In USAGE (`main.ts:92-94`), "--plan --list takes no song name, and no flag but --library, --pads, --template, --date, --service-type, --plan-id, --overlap, --pad, --gap, --replace and --output-root." becomes "--plan --list takes no song name, and every flag --plan takes.", and `test/set-builder-command.test.ts:968` asserts that sentence.

**Remediation brief**
- **Design intent:** `--list` reads folder names and takes only `--library` and `--pads`. `--plan --list` resolves exactly what a `--plan` build would, so it takes every flag that build takes; since #169 that is every flag in `OPTIONS`. Usage problems in `planList` run in order: a song name, an empty `--plan-id`, a date that is not one, all before any request.
- **Full surface:** `src/set-builder/main.ts:92-94` (USAGE sentence), `:101-102` (comment above `OPTIONS`), `:119-122` (`PLAN_LIST_OPTIONS` and its comment), `:164-166` (`planList` comment), `:171-172` (the check); `test/set-builder-command.test.ts:968` (the USAGE assertion). `grep -n PLAN_LIST_OPTIONS src test` must find nothing after.
- **Must preserve:** the song-name usage problem (`--plan takes the songs from the plan, not "<name>".`), `checkPlanId()`, and the date usage problem, in that order, in `planList`; `LIST_OPTIONS` and the `--list` check at `main.ts:148-149` with its test `test/set-builder-command.test.ts:853`; the USAGE line for `--plan --list` at `main.ts:25`; `test/readme.test.ts`, which pins the flag names in USAGE against the README. Suites: `test/set-builder-command.test.ts`, `test/set-builder-plan-list.test.ts` (its usage `it.each`).
- **Do not touch:** the listing's acceptance of `--output-root` and `--replace` (the point of #169), and `parseArgs`'s strict mode, which rejects unknown flags.
- **Proof:** `grep -c "PLAN_LIST_OPTIONS" src/set-builder/main.ts` prints 3 now and 0 after; then `pnpm exec vitest run test/set-builder-command.test.ts test/set-builder-plan-list.test.ts test/readme.test.ts` passes.

### 2. The token file's comment-line filter has no test that can go red — LOW
- **Location:** `src/set-builder/plan-reader.ts:32`; the tests at `test/set-builder-plan.test.ts:1004` and `:1017`
- **Attribution:** introduced by `ee25e04` (setlist-controller#170 An inline comment after a token value is read into the value), which added the filter and both tests.
- **Real-world trigger:** none for users: the filter changes nothing a command shows. At `e7e43e5` a line `# PCO_SECRET=old` parses to the name `# PCO_SECRET`, which `readToken` never asks for, so the commented-out secret was already ignored. The gap is a claim of coverage: the two tests read as guarding the filter and pass without it. LOW, no user path.

**Evidence**
```ts
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('#') && line.includes('='))
```

**Failure mode** — executed: with `repro/review-3-mutation-comment-line-filter.diff` applied (the `!line.startsWith('#') &&` taken out), `pnpm exec vitest run test/set-builder-plan.test.ts -t "commented-out|sends the secret when"` passes 6 of 6. The test audit also ran both tests at `e7e43e5`: they pass there.

**Recommended fix** — keep both command tests (they pin #170's acceptance criteria) and add one test of the parse itself, inside the token `describe` at `test/set-builder-plan.test.ts:919`, with `tokenValues` imported from `../src/set-builder/plan-reader.ts` as `test/set-name.test.ts:2` imports `setName`:
```ts
  it('reads a line that starts with #, after its leading white space, as no name at all', () => {
    expect([...tokenValues('# PCO_SECRET=old\n  #PCO_CLIENT_ID=x\nPCO_SECRET=new\n').entries()]).toEqual([['PCO_SECRET', 'new']]);
  });
```

**Remediation brief**
- **Design intent:** `tokenValues` is the one parse of the token file, for `readToken` and the fixture recorder (`scripts/record-pco-fixtures.mjs:17`, `:35`). A line that starts with `#` after its leading white space is a comment and names nothing; the map holds only real names. `readToken` asks only for `PCO_CLIENT_ID` and `PCO_SECRET`, which is why the command cannot see the filter.
- **Full surface:** `test/set-builder-plan.test.ts` (one import and one new test in the describe at `:919`). No source change.
- **Must preserve:** `test/set-builder-plan.test.ts:1004` and `:1017` as they are; every test in the token describe (`:919` onward), quotes, `export` lines and the `it.each` at `:985` included.
- **Do not touch:** the filter itself, `src/set-builder/plan-reader.ts:32`; it is right, only untested.
- **Proof:** the new test passes at HEAD; then `git apply docs/reviews/setlist-controller-58/repro/review-3-mutation-comment-line-filter.diff && pnpm exec vitest run test/set-builder-plan.test.ts -t "as no name at all"` must fail, and `git apply -R docs/reviews/setlist-controller-58/repro/review-3-mutation-comment-line-filter.diff` restores the source.

### 3. Comment hygiene — LOW (aggregated)
- `src/set-builder/build-set.ts:135-140` — the inserted "which --plan --list reports as its own line" left line 137 at 163 characters in a block that wraps near 120 → rewrap the paragraph; no word changes.
- `src/set-builder/plan-list.ts:27-30` — the new sentences end line 30 short at "never looks at it. A song line" → rewrap the paragraph through its end; no word changes.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- A gzip or br body dropped mid-transfer now reading "cannot be read" — probe under Node 26.3.0, three runs: `cause.code` is `UND_ERR_SOCKET` for a length, chunked, FIN or br body cut mid-transfer, so `inflateFailed` is false and the connection line holds.
- A br or zstd body that will not inflate still reads "Cannot reach" (its cause code does not start `Z_`) — Node's fetch sends `accept-encoding: gzip, deflate` (agent probe), so a server that honours it never sends br or zstd; the ticket names `Z_` only.
- `inflateFailed`'s guards for an error with no `cause` or a non-string `code` have no test — no real fetch failure produces either (every body failure probed carried a string code); the ticket's own brief names the guards as the fix's failure case, and the dropped-socket test (`test/set-builder-plan.test.ts:632`) pins the fall-through.
- An `--output-root` that names a file gives no "already exists" line — the build's own check (`build-set.ts:102`) is false in the same case, so the listing and the build agree.
- The listing reads `existsSync` under the real `~/Music/Ableton/Sets` when no `--output-root` is given — read-only, and the build reads the same path; every test sets `--output-root` or `HOME`.
- The skill's exit 0 case with the "build stops on it" line runs the command with `--replace` after Nick's yes to replacing, though the command first shown lacked it — the question asked is whether to replace, so the yes is consent to `--replace`, as #169 asks ("A yes adds `--replace` to the command it shows"), and the skill shows the new command before running it.
- `planListing` places the line after the warnings and before the build-check stderr — as #169 asks; stdout and stderr are separate streams.

## Minor / nits
- Two exotic token lines differ from bash, both outside the ticket's rules: `A=ab"c # d"` reads `ab"c` (bash `abc # d`, base `ab"c # d"`), and `A=abc\ #x` reads `abc\` (bash `abc #x`). Neither is a likely way to write a secret.
- The `#170` `it.each` (`test/set-builder-plan.test.ts:985`) has no row for single quotes with a comment, an empty value with a comment (`PCO_SECRET= # c`, which should give `has no PCO_SECRET`), or `export` with a comment. The probe shows all three right.
- `planList`'s comment says a token, plan or library problem prints "with no line about the set folder"; no test has a set folder present in those cases. The code returns before it computes the folder.

## Test quality
Tests added or changed: 45 · red at `e7e43e5` as written: 45 · red only because base refused `--output-root` on the listing: 25, all argument-only changes from `listPaths`, which is expected · green at base once that cause is removed: 5:
- `test/set-builder-plan.test.ts:988` "a # with no space or tab before it stays in an unquoted value" and `:990` "a # inside double quotes stays in the value" (`ee25e04`) — controls the ticket asks for; they would catch a naive `#` strip or a strip before quotes are handled. Keep.
- `test/set-builder-plan.test.ts:1004` and `:1017` (`ee25e04`) — pass at base by the name mismatch, and pass with the filter taken out (finding 2). Keep; finding 2 adds the test that bites.
- `test/set-builder-plan-list.test.ts:461` "does not report a set folder for the date that exists only under the default output root when --output-root names another" (`9b7f049`) — a negative control the ticket asks for; red if the listing ignores `--output-root`. Keep.

Tautology shapes found: 0 (no expectation computed with a production helper in an assertion, no mock of the unit, no call-shaped assertion, no snapshot, no assertion-free test). Weak spots, none a finding:
- `test/set-builder-plan-list.test.ts:519-531`: the `it.each` asserts `toContain(problem)` with partial strings and `endsWith(...)`, so a stray line mid-listing would slip through; a whole-stdout `toBe`, as `:543` does, would pin it.
- `test/set-builder-plan.test.ts:650` `not.toContain(mark)` and `:1028` `expectNoTokenValue` follow exact `toBe` assertions on the same streams and cannot go red alone; they guard against a future leak.
- `test/set-builder-harness.ts:76` `setPath` uses production `setName`, but only for an existence check; the list-then-build test's real assertion uses the literal folder.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `5e7bf42`; Playwright green too. The one new repro file is a `.diff`, which eslint does not read.
- **Commit hygiene:** commit this doc and `repro/review-3-mutation-comment-line-filter.diff`; nothing else is in the tree.
- **Likely reviewer asks:** why `--plan --list` still carries a flag allow-list that names every flag (finding 1).

## Verdict
**Ready to open the PR.** Zero CRITICAL, HIGH or MEDIUM findings. Findings 1 to 3 are LOW and can be remediated in one short pass or left as follow-ups; none gates the PR. The branch closes review 2's finding 3 (#171, with its test going red under the mutation) and review 2's comment-hygiene entry for `plan-reader.ts:132-134`.
