# Pre-PR review: setlist-controller#58 Planning Center plan, fourth run (#162, #163, #179, #180)

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `f5fb867` "Merge pull request #182 from nick-vogel/setlist-controller-58-planning-center-plan")
**Reviewed at:** HEAD `7ebabf2` (setlist-controller#179 The build-set skill asks twice to replace a set built before, when I name the songs), clean tree: 0 files with uncommitted changes, 0 untracked; 11 files total, +516 / -58 against the merge-base
**Reviewed against:** the epic body of setlist-controller#58; the bodies of the four sub-issues this branch carries, #162 (tests for the plan reader's fallback paths), #163 (the fixture scrubber keeps the README and refuses an empty recording), #179 (`--list` reports the set folder for the date, so the typed path asks once) and #180 (the skill's fix for "sent an answer ... that cannot be read"); the run's recorded decisions and proposals per ticket (`.epic-loop/tickets/<n>/assumptions.md`, `proposals.md`), read so that a recorded decision is not re-reported as a defect; the Approach decisions of `pre-pr-review-3.md`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Run with `--fresh`, so the whole surface since the merge-base is reviewed and no delta scoping applies.
**Date:** 2026-10-22
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | up to date; the branch changes neither `package.json` nor `pnpm-lock.yaml` |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and command suites | `pnpm test` | pass: 52 files, 1076 passed, 4 skipped |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | pass: 44 passed |
| Tautology audit, base oracle | the branch's 5 new or changed test files copied into a scratch worktree at `f5fb867` and run there | 18 red, all the #163 scrubber tests but one and all the #179 `--list` tests; every #162 test green, which is expected, since #162 adds tests only for code already right |
| #162: each mutation the ticket names goes red | agent applied each in a scratch worktree at HEAD: notes paging, future paging, key fallback gone, its minor `m` gone, Db picks D, the three new problem lines, the `0o004` mask, `service-type` and `plan-id` dropped from `PLAN_LIST_OPTIONS` | red in every case; the no-`PCO_SECRET` and no-plan-on-date lines were already pinned exactly (`test/set-builder-plan.test.ts:1086`, `:602`), as the ticket's assumption records |
| #163: scrubber edges | agent probes in scratch folders: empty or missing raw, raw holding only a `.txt`, `--raw` = `--out` directly, through a symlink, and with a trailing slash, `--out` inside `--raw` and the reverse, an out folder that does not exist yet | each holds: the exact line and exit 1 with out untouched, or a scrub in place with nothing lost |
| #163: the defaults test can go red | mutation `repro/review-4-mutation-scrub-cwd-defaults.diff` (defaults resolve against the current directory) in a scratch worktree | stays green (finding 4) |
| #179: the listing line | agent runs of `node src/set-builder/main.ts --list` against a scratch library, HOME and output root, with and without `--replace`; `main.ts` read | prints the same line as `--plan --list`, from the one `existingSet(date)`, `setFolder` and `outputRoot()`; nothing when the folder is absent; a library problem prints alone |
| #179: tests never read `~/Music/Ableton/Sets` | `grep -rn "'--list'" test e2e`, every hit read | every `--list` run passes `--output-root` inside the workspace or sets `HOME` to it |
| #179 and #180: the skill | `.claude/skills/build-set/SKILL.md` traced by hand: a rebuild with the folder present, a first build, "replace it" up front, a date change after step 1; the #180 bullet against `src/set-builder/plan-reader.ts:142-153` | the rebuild asks once by step 4's bullet, but step 1's rerun rule pulls against it (finding 1); the #180 bullet matches the causes the comment names |
| Not run | the fixture recorder, a no-argument scrubber run in the worktree, anything against the real Planning Center API | by the repo's guardrails |

**Overall:** The four tickets do what their acceptance criteria ask, and all five full checks are green. Every #162 mutation now turns a test red, the scrubber keeps its README, refuses an empty recording and scrubs in place when both folders are one, and `--list` reports the set folder for the date with the build's own folder logic. The review confirmed four LOW findings: a skill rule that can bring back the second question #179 removes, a USAGE sentence whose "It" now points at the wrong thing, the dead `--plan --list` allow-list review 3 named and this run left, and a scrubber defaults test that cannot tell where its defaults resolve. None gates the PR.

## Approach decisions
- **A plan with no songs (review 1 finding 1, #160 item 1):** one reader problem in `readPlan` after the order-of-service loop, worded with the type's name; `build-set.ts`'s own guard stays. Landed.
- **A multi-line folder problem in the listing (review 1 finding 2, #160 item 2):** the problem's first line keeps the folder field, its other lines follow the song line. Landed.
- **Fallback tests (review 1 finding 3, #162):** each new test runs the command through the package script against the fake, with a body derived from a recorded fixture. A reader-level classification test may call `readPlan` against a scratch server, as `brokenPlanningCenter` (`test/set-builder-plan.test.ts:100`) does. A pure parse with no observable command outcome is tested by importing it, as `test/set-name.test.ts:2` imports `setName`. Landed for #162.
- **Body-read failures (review 2 finding 3, #171):** classify by the error: a timeout is late, a `SyntaxError` or an inflate error (`cause.code` starting `Z_`) is an answer that cannot be read, anything else is the connection. Landed.
- **The existing set folder in a listing (#169, #179):** both listings compute the folder with the build's own `outputRoot()` and `setFolder`, through the one `existingSet(date)` in `main.ts`, and print `existingSetLine` from `plan-list.ts` as a stdout line that is never a problem. Landed.
- **The `--plan --list` flag set (review 3 finding 1, finding 3 here):** the listing takes every flag a `--plan` build takes, so it keeps no allow-list of its own; `--list` keeps `LIST_OPTIONS`.
- **The scrubber's sweep (#163):** read every raw response before the out folder is touched, then remove only top-level regular `.json` files in it. Landed.

## Confirmed Issues
### 1. The skill's rule to rerun the listing when `--replace` changes can bring back the second question on a rebuild — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:14` (step 1's rerun sentence) against `:18` (step 4's first bullet)
- **Attribution:** introduced by `414b64f` (setlist-controller#179 The build-set skill asks twice to replace a set built before, when I name the songs), which added both sentences.
- **Real-world trigger:** a rebuild on the typed path. The listing prints `... already exists. The build stops on it unless --replace replaces it.`, step 4 asks "Replace the set built before?", and Nick says yes. The yes adds `--replace`, which is a `--replace` change after step 1. Step 1 says to rerun the listing on that change "before step 4 shows the command"; the rerun prints `... already exists, and --replace replaces it.`, and step 4's second bullet then says "ask whether to run it as usual". An agent that follows step 1 asks twice, the defect #179 exists to remove. Worked example 9 and step 4's own bullet say to run on the yes, so the agent has two rules and one example to choose between. The cost is one extra question. LOW.

**Evidence**
```
1. ... The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
4. ... A yes adds `--replace` to the command: show it with `--replace` and run it, as step 5 runs a command on a yes.
   - With the `already exists, and --replace replaces it.` line, ... ask whether to run it as usual, with no second question.
```

**Failure mode** — traced by hand: step 4's yes is a `--replace` change, so step 1 calls for a new listing and a new step 4, whose second bullet asks whether to run. The parenthetical in step 1 gives examples, not a closed list, so it does not exclude the yes.

**Recommended fix** — exclude the yes from step 1's rule, in its own words:
```diff
-The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
+The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command. The `--replace` a yes at step 4 adds is no such change: that command runs as step 4 says.
```

**Remediation brief**
- **Design intent:** on the typed path, Nick answers once. The listing runs before step 4 so the skill knows whether the set folder exists; when it does, step 4's question is whether to replace it, and that yes is consent to `--replace` and runs the build. The rerun rule exists so a stale line never asks the wrong question after a change Nick names.
- **Full surface:** `.claude/skills/build-set/SKILL.md:14` only. Step 4's bullets (`:18-19`) and worked example 9 (`:222-247`) already say the right thing.
- **Must preserve:** the rerun on a date, `--output-root` or `--replace` that Nick names at step 5, and on an answered date question; step 6's `--replace` fix for a folder that appears between the listing and the build; the plan path (`:47-74`), whose step 3 reruns its listing on a change and needs no edit, since its own yes at step 2 runs the build by step 4.
- **Do not touch:** the step 4 bullet's "A 'no' builds nothing", which mirrors the plan path's step 2 (see Minor).
- **Proof:** a hand trace of worked example 9 against the edited Steps reaches one question and a run with `--replace`; `pnpm exec vitest run test/readme.test.ts` still passes (nothing pins the skill's text).

### 2. USAGE's `--list` paragraph now says "It takes no song name" right after "That line", and still says it reads folder names only — LOW
- **Location:** `src/set-builder/main.ts:82`, `:85`; `README.md:67`; the pin at `test/set-builder-command.test.ts:968-970`
- **Attribution:** introduced by `414b64f`, which inserted the set-folder sentences between "--list reads folder names only and writes nothing." and "It takes no song name". At `f5fb867` "It" followed "--list reads folder names only", so it named `--list`.
- **Real-world trigger:** anyone reading the usage text a usage error prints. "That line never sets exit 1. It takes no song name, and no flag but ..." reads as the line taking flags. "reads folder names only" is no longer whole: `--list` also checks whether the set folder exists under the output root. A confusing display, no wrong result. LOW.

**Evidence**
```
song folders. --list reads folder names only and writes nothing. When the set folder for the date already exists under
...
That line never sets exit 1. It takes no song name, and no flag but --library, --pads, --date, --replace and
--output-root.
```

**Failure mode** — read, no execution needed: the pronoun's antecedent moved, and the "only" claim is false since `list()` calls `existingSet(date)` (`main.ts`, the `existsSync` in `existingSet`).

**Recommended fix** — in USAGE (`main.ts:82-86`), "--list reads folder names only and writes nothing." becomes "--list reads folder names, looks for the set folder for the date, and writes nothing.", and "That line never sets exit 1. It takes no song name" becomes "That line never sets exit 1. --list takes no song name". In `README.md:67`, "It reads folder names only and writes nothing" becomes "It reads folder names, looks for the set folder for the date, and writes nothing". Update the two assertions at `test/set-builder-command.test.ts:968` and `:970` to the new sentences, and keep the comment at `test/set-builder-command.test.ts:726` ("--list reads folder names only, so a library of empty folders is enough"), which is about the library read and stays true.

**Remediation brief**
- **Design intent:** USAGE is the flag grammar's source of truth (the skill says so at `SKILL.md:9`), and `test/readme.test.ts` keeps the README's flag set in step with it. `--list` reads the library's folder names and checks one path for existence; it never writes.
- **Full surface:** `src/set-builder/main.ts:82`, `:85`; `README.md:67`; `test/set-builder-command.test.ts:968`, `:970`.
- **Must preserve:** the USAGE synopsis line for `--list` (`main.ts:24`) and its pin (`test/set-builder-command.test.ts:962`); the two quoted line forms in the paragraph; the flag set `test/readme.test.ts:43` compares. Suites: `test/set-builder-command.test.ts`, `test/readme.test.ts`.
- **Do not touch:** the `--plan --list` paragraph that follows, which has its own subject.
- **Proof:** `pnpm exec vitest run test/set-builder-command.test.ts test/readme.test.ts` passes after the edit; `grep -n "It takes no song name" src/set-builder/main.ts` prints nothing.

### 3. The `--plan --list` allow-list still names every flag, so its check never fires, and the comment this run edited still describes it — LOW
- **Location:** `src/set-builder/main.ts:104-106` (comment above `OPTIONS`), `:123-126` (`PLAN_LIST_OPTIONS` and its comment), `:181-182` (the check), `:174-176` (the `planList` comment naming "a flag --plan --list does not take"), USAGE `:94-96` ("--plan --list takes no song name, and no flag but ...") and its pin at `test/set-builder-command.test.ts:1058`
- **Attribution:** pre-existing, untouched in substance: `pre-pr-review-3.md` finding 1, not remediated before PR #182 (`git show f5fb867:src/set-builder/main.ts | grep -n PLAN_LIST_OPTIONS` finds it at `:102`, `:122`, `:171`). This run widened its comment: `414b64f` added "Both take --date, --output-root and --replace, ..." to the comment above `OPTIONS`, repeating `:123-125`, and kept "every other one is a build's alone", which is false for `--plan --list`.
- **Real-world trigger:** none; `parseArgs` is strict and the list names all 13 keys of `OPTIONS`, so `find` always returns `undefined`. LOW, no user path. The cost is dead code, a vacuous USAGE sentence and two comments that mislead a maintainer.

**Evidence**
```ts
// The command's flags. --list takes only those of LIST_OPTIONS beside it, and --plan --list only those of
// PLAN_LIST_OPTIONS; every other one is a build's alone. Both take --date, --output-root and --replace, so they look for
// the set folder the build would write and say whether --replace replaces it.
const PLAN_LIST_OPTIONS: string[] = ['list', 'plan', 'library', 'pads', 'template', 'date', 'service-type', 'plan-id', 'overlap', 'pad', 'gap', 'replace', 'output-root'];
  const flag = (Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).find((option) => !PLAN_LIST_OPTIONS.includes(option) && values[option] !== undefined);
```

**Failure mode** — as review 3 recorded: no input reaches the usage line. #162's `it.each` at `test/set-builder-plan-list.test.ts:327` pins that `--plan --list` accepts `--service-type` and `--plan-id`; with the list gone, those rows still pass, because the listing then takes every flag.

**Recommended fix** — review 3 finding 1's fix, unchanged, plus the comment above `OPTIONS`:
```diff
-// The command's flags. --list takes only those of LIST_OPTIONS beside it, and --plan --list only those of
-// PLAN_LIST_OPTIONS; every other one is a build's alone. Both take --date, --output-root and --replace, so they look for
-// the set folder the build would write and say whether --replace replaces it.
+// The command's flags. --list takes only those of LIST_OPTIONS beside it, --date, --output-root and --replace among
+// them, so it looks for the set folder the build would write; --plan --list takes every one a --plan build takes.
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
The `planList` comment's "a flag --plan --list does not take (the first in parseArgs option order)" goes, and USAGE's "--plan --list takes no song name, and no flag but --library, ... and --output-root." becomes "--plan --list takes no song name, and every flag --plan takes.", with its assertion in `test/set-builder-command.test.ts` (`grep -n "plan --list takes no song name" test/set-builder-command.test.ts`) updated to match.

**Remediation brief**
- **Design intent:** `--list` reads folder names and the one set-folder path, and takes only `LIST_OPTIONS`. `--plan --list` resolves exactly what a `--plan` build would, so it takes every flag that build takes. Usage problems in `planList` run in order: a song name, an empty `--plan-id`, a date that is not one, all before any request.
- **Full surface:** `src/set-builder/main.ts:104-106`, `:123-126`, `:174-176` (the `planList` comment's flag clause), `:181-182`, the USAGE `--plan --list` sentence (`grep -n "plan --list takes no song name" src/set-builder/main.ts`); its assertion in `test/set-builder-command.test.ts`. `grep -n PLAN_LIST_OPTIONS src test` must find nothing after.
- **Must preserve:** `LIST_OPTIONS` and the `--list` check in `list()` with its `it.each` (`test/set-builder-command.test.ts:838`); the song-name usage problem, `checkPlanId()` and the date usage problem, in that order, in `planList`; `test/set-builder-plan-list.test.ts:327` (#162's flag rows); `test/readme.test.ts`.
- **Do not touch:** the listing's acceptance of `--output-root` and `--replace` (#169), and `parseArgs`'s strict mode.
- **Proof:** `grep -c PLAN_LIST_OPTIONS src/set-builder/main.ts` prints 3 now and 0 after; then `pnpm exec vitest run test/set-builder-command.test.ts test/set-builder-plan-list.test.ts test/readme.test.ts` passes.

### 4. The scrubber's no-argument test cannot tell defaults that resolve against the script from defaults that resolve against the current directory — LOW
- **Location:** `test/scrub-pco-fixtures.test.ts:145` (the spawn's `cwd`); the defaults at `scripts/scrub-pco-fixtures.mjs:20-21`
- **Attribution:** introduced by `7436b35` (setlist-controller#163 The fixture scrubber deletes the fixtures README, and an empty recording deletes every fixture), which added the test. It passes at `f5fb867` too, as a control for unchanged defaults should.
- **Real-world trigger:** none for users today: the defaults resolve against the script (`resolve(import.meta.dirname, ...)`), which is right. The gap is a claim of coverage: the test reads as pinning the defaults, and a regression to cwd-relative defaults would ship green, then read and write the wrong folders when the scrubber runs from anywhere but the repo root. LOW, no user path.

**Evidence**
```ts
    const result = scrub([], join(root, 'scripts/scrub-pco-fixtures.mjs'), root);
```

**Failure mode** — executed: with `repro/review-4-mutation-scrub-cwd-defaults.diff` applied in a scratch worktree, `pnpm exec vitest run test/scrub-pco-fixtures.test.ts` passed 6 of 6, because the test's `cwd` is `root`, which is also the copied script's `..`. With the recommended `cwd`, the same mutation failed 1 of 6, and the unmutated script passed 6 of 6.

**Recommended fix**
```diff
-    const result = scrub([], join(root, 'scripts/scrub-pco-fixtures.mjs'), root);
+    const result = scrub([], join(root, 'scripts/scrub-pco-fixtures.mjs'), join(root, 'scripts'));
```

**Remediation brief**
- **Design intent:** the scrubber's defaults are `dist/pco-raw/` and `test/fixtures/planning-center/` beside the script's own `..`, wherever it is run from; `--raw` and `--out` given on the command line resolve against the current directory (pinned by "resolves a relative --raw and --out against the current directory" in the same file). The test runs a copy of the script in a scratch repo layout because a real no-argument run would rewrite the committed fixtures.
- **Full surface:** `test/scrub-pco-fixtures.test.ts:145` only. No source change.
- **Must preserve:** the test's scratch layout under the git-ignored `dist/`, and its three assertions; never point the spawn at the real `scripts/scrub-pco-fixtures.mjs` with no arguments.
- **Do not touch:** the defaults themselves (`scripts/scrub-pco-fixtures.mjs:20-21`); they are right, only under-tested.
- **Proof:** after the edit, `pnpm exec vitest run test/scrub-pco-fixtures.test.ts` passes; then `git apply docs/reviews/setlist-controller-58/repro/review-4-mutation-scrub-cwd-defaults.diff && pnpm exec vitest run test/scrub-pco-fixtures.test.ts -t "no arguments"` must fail, and `git apply -R docs/reviews/setlist-controller-58/repro/review-4-mutation-scrub-cwd-defaults.diff` restores the script.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- The #180 bullet sends Nick "off the stage network", though the stage router has no internet and gives `Cannot reach` there, never this line — the ticket's own "What should happen" asks for exactly "build again while the Mac is on a steady internet connection, off the stage network"; the bullet follows it.
- The skill's mapping has no row for `--output-root`, though step 1 says to add it "by the mapping below" — already filed as a proposal under #179 (`.epic-loop/tickets/179/proposals.md`).
- The plan path has no fix for `Planning Center answered <status> to <path>.` or `sent a next page outside <base>.` — already filed as a proposal under #180 (`.epic-loop/tickets/180/proposals.md`).
- A `.json` symlink in the out folder survives a re-run (`scripts/scrub-pco-fixtures.mjs:89`, `entry.isFile()`) — the recorded decision removes only top-level regular `.json` files; the scrubber and the recorder write no symlinks.
- A directory named like a recorded response in the out folder makes the write throw `EISDIR` after the sweep — contrived: nothing makes such a directory, and git restores the fixtures.
- A bad scrubber flag (`--bogus`, a positional, `--raw` with no value) prints Node's parse error with a stack trace, exit 1 — the nearest precedent, `scripts/record-pco-fixtures.mjs:19`, lets `parseArgs` throw the same way; out is untouched in every case.
- A raw folder that is a file, or that holds a `*.json` directory, stops with a stack trace — the same at `f5fb867`, and it stops before out is touched.
- `--list --output-root ''` looks under the current directory — the build's `outputRoot()` does the same, so the listing and the build agree; unchanged from base.
- `list()` works out the default date even when the library read then fails — no output depends on it; the line prints only inside `listing.ok`.

## Minor / nits
- `--raw ''` or `--out ''` resolve to the current directory. Run from the repo root as `--raw ''`, the scrubber would scrub the root's `package.json`, `tsconfig.json` and the like into the fixtures (inferred from an agent probe in a scratch folder; not run at the root, by the guardrails). Git restores them; a usage line for an empty value would close it.
- The step 4 bullet's "A 'no' builds nothing: say that nothing was built, and stop." (`SKILL.md:18`) reads literally over "no, make it November 1". Step 5 governs an answer that names a change, and the plan path's step 2 uses the same sentence, so the precedent holds; adding "that names no change" to both would be tidier.
- Step 1 says "replace it" or "rebuild it"; the mapping row (`SKILL.md:88`) says "replace it", "rebuild the set I already built". The plan path's step 1 pairs them the same way.
- The `--list` refused-flag `it.each` (`test/set-builder-command.test.ts:838`) has no rows for `--service-type` or `--plan-id` without `--plan`. Both are refused today (agent run); the gap predates this branch.
- The default-date `--list` test (`test/set-builder-command.test.ts`, "looks for the set folder for the default date") computes today before it spawns the command, so a run that crosses midnight at the end of a Sunday would fail once. Not reproduced.
- Nothing tests that the future plans list stops once a page ends past the date: with `endsPast(...)` replaced by `() => false`, all 126 plan tests stay green. Only extra requests follow; it is outside #162's named mutations.
- Three new test comments run 121 to 123 characters (`test/set-builder-plan-folders.test.ts:51` and two in `test/set-builder-plan.test.ts`); the repo wraps near 120 and has no formatter.

## Test quality
Tests added or changed: 5 test files · red at `f5fb867`: 18 (5 of the 6 scrubber tests and all 13 new or changed `--list` tests) · green at `f5fb867`: every #162 test, by design, since #162 adds tests for code already right, plus the scrubber's no-argument test, a control for unchanged defaults. For the #162 tests the oracle is mutation, and every mutation the ticket names turns at least one red (see the table above). Tautology shapes found: 0 (no mocked unit, no call-shaped or assertion-free test, no snapshot). Weak spots:
- `test/scrub-pco-fixtures.test.ts:145` cannot catch cwd-relative defaults (finding 4).
- `test/set-builder-plan-list.test.ts:327`, "lists the November 1 plan the same with %s %s": `997539` is the default service type and `90897397` the only morning plan on November 1, so the rows pass with the flag values ignored (agent mutation: `delete values['plan-id']; delete values['service-type']` in `planList`, 126 plan tests green). They pin that the listing accepts the flags, which is what #162 asks; the values are read by `readWeekPlan`, shared with the build, whose tests at `test/set-builder-plan.test.ts:548`, `:561` and `:575` pin value-dependent outcomes. Keep; a row with `--plan-id 1` asserting the exact "is not a "Service" plan" line would bite harder.
- The #179 `--list` tests build their expected line from `projectFolder(workspace)`, which uses the production `setName`; the default-date test spells the folder from the calendar, and other command tests pin `setName` against the calendar, so the name format is still guarded.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `7ebabf2`; Playwright green too. The one new repro file is a `.diff`, which eslint does not read.
- **Commit hygiene:** commit this doc and `repro/review-4-mutation-scrub-cwd-defaults.diff`; nothing else is in the tree.
- **Likely reviewer asks:** why `--plan --list` still carries a flag allow-list that names every flag (finding 3, open since review 3).

## Verdict
**Ready to open the PR.** Zero CRITICAL, HIGH or MEDIUM findings. Findings 1 to 4 are LOW and can be remediated in one short pass or left as follow-ups; none gates the PR. The branch closes review 1's finding 3 (#162, every named mutation now red) and finding 5 (#163), and leaves review 3's finding 1 open (finding 3 here).
