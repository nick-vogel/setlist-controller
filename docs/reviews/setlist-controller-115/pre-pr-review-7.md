# Pre-PR review: setlist-controller#115 One median method for the producer row and `pnpm lateness` (#201), round 7

**Branch:** `setlist-controller-115-cue-lead-time` vs `origin/main` (merge-base `395bd7c` "Merge pull request #204 from nick-vogel/setlist-controller-58-planning-center-plan")
**Reviewed at:** HEAD `052d978` (setlist-controller#201 The producer row and pnpm lateness use one median method, the merge of lane commit `5e02f8a` of the same subject into the integration branch), clean tree: 0 files with uncommitted changes, 0 untracked; 6 files total against the merge-base, +40 / -20
**Delta under review:** none; this is a `--fresh` full review of the branch against its merge-base. Reviews 1 to 6 in this folder reviewed the epic's earlier work (#146, #186, #187), which landed on main through PR #200 and sits below the merge-base, outside this surface.
**Reviewed against:** setlist-controller#201 (its two Done-when criteria), the epic setlist-controller#115 (User story 4, the producer row's running median, and Implementation Decisions, Measuring), the ticket's approach and its three recorded assumptions (one exported nearest-rank function in `src/server/lateness.ts`; the record keeps unrounded latenesses and relies on rounding keeping order; the acted median moves to nearest rank too), and the Approach decisions of `pre-pr-review-6.md`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist, plus no em-dashes in shipped copy.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green (exit 0) |
| Typecheck | `pnpm typecheck` | green (exit 0) |
| Unit and server suites | `pnpm test` | 57 files, 1181 passed, 4 skipped, first run |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| Tautology audit, base oracle | `test/cue-lateness.test.ts` from HEAD copied into a detached scratch worktree at `395bd7c`, `pnpm exec vitest run test/cue-lateness.test.ts` | the 4 changed or added tests are red at base (`median: 187.5` for 125, `375` for 250, `187.5`/`277.5` for 125/185, and `188` against the summary's `125`); the other 24 green, as they assert nothing this branch changed |
| Mutation: the old mean-of-the-middle-two median restored | agent, in a `git archive HEAD` scratch copy | the same 4 tests go red |
| Row equals summary, fractional and tied values | agent's property harness importing HEAD's `latenessRecord` and `summarize`: n = 1..50 latenesses, fractional with about 30% exact x.5 ties, acted = late + 3.5; `Math.round(row.median)` and `Math.round(row.actedMedian)` against the summary's "all causes" row built from `Math.round`ed lines | 0 mismatches in 20000 trials |
| Rounding on both sides | read `web/src/ConnectionsPanel.tsx:95` and `src/server/connections.ts:188,213` | both `Math.round`; rounding keeps order, so the value at a rank, rounded, is the rounded value at that rank |
| Cue sets the row and the summary count | read `src/server/connections.ts:183-216`, `src/server/lateness.ts:8,23`, `src/lateness/summary.ts:122-128` | same causes, same exclusions (Fire again, unmeasured, a cue `actsOn` refuses); the row's window is the last 50 since the server started, the summary's row is one local day with no cap (finding 1) |
| Other median or percentile code | `git grep -n -i 'median\|percentile\|atRank\|nearestRank'` over `src`, `web`, `test`, `e2e` | `nearestRank` has two callers (`src/server/lateness.ts:36`, `src/lateness/summary.ts:92`); no other median code; `test/atem.test.ts` pins one-value medians only; `test/pages.test.ts` feeds fixed snapshots |
| Em-dashes in added lines | `git diff 395bd7c \| grep '^+' \| grep -c '—'` | 0 |

**Overall:** The branch does what #201 asks. The row's median and the summary's now come from one exported `nearestRank`, so for the same cues the page's rounded median is the median `pnpm lateness` prints, and four tests pin it, each red at the base and red under the old mean. Nothing is MEDIUM or higher. The README's new clause overstates the agreement (finding 1), and one comment does the same (finding 2); both are one-line copy fixes that can land before the PR or after.

## Approach decisions
- The due-time window (round 1): symmetric half bar in `dueAt`. Carried forward unchanged.
- The dev log (round 1): `dev:server` writes `dist/dev-cue-lateness.log`; production and the launch agent unchanged. Carried forward unchanged.
- A row's `problems` and `lateness` (round 3): independent fields of `Entry`. Carried forward unchanged.
- The cue filter (#186): an optional `Target.actsOn`, consulted first in `hand()`. Carried forward unchanged.
- The ATEM's acknowledgement (#186): the own-cut record carries the cue that caused each cut. Carried forward unchanged.
- Unmeasured lines (#187): written at once by `hand()`, after `settle`. Carried forward unchanged.
- The command's errors (#187, review 4): follow `build-set`. Carried forward unchanged.
- Waiting lines at shutdown (review 6): `connections.stop` settles before and after the targets' stops. Carried forward unchanged.
- The median method (#201, this review records it): nearest rank, one exported `nearestRank(sorted, percentile)` in `src/server/lateness.ts`, imported by `src/lateness/summary.ts`; the record keeps unrounded latenesses and the page and the log both round with `Math.round`, which keeps order, so the rounded values agree over the same cues. The acted median shares it. Copy fixes below keep this mechanism and change only words.

## Confirmed Issues
### 1. The README says the row shows "the same median `pnpm lateness` prints", which holds only over the same cues — LOW
- **Location:** `README.md:49`
- **Attribution:** introduced, by `5e02f8a` (setlist-controller#201 The producer row and pnpm lateness use one median method): `git log --oneline -S'the same median `pnpm lateness` prints' 395bd7c..HEAD` names it; the clause is absent at `395bd7c`.
- **Real-world trigger:** after a rehearsal with more than 50 measured cues for one target, or after a server restart mid-day, Nick compares the producer row's median with the summary's "all causes" median for that day, as the README tells him they are the same, and sees two different numbers. User path: reading the README, then the page and `pnpm lateness` output side by side while deciding #147. Docs drift, so LOW; no wrong number is produced.

**Evidence** — README.md:49, the added clause:
```
its row shows how late the cues reach it, as "Late 250 ms, median 240 ms" for the last cue and the median of the last 50, by nearest rank, the same median `pnpm lateness` prints, and, ...
```
The row's window is the last 50 cues handed since the server started (`src/server/lateness.ts:8`, `const WINDOW = 50;` and `:23`, `if (list.length > WINDOW) list.shift();`, an in-memory record). The summary's "all causes" row is every measured line of one local day, uncapped (`src/lateness/summary.ts:123`, `const measured = own.filter(...)`, and `:128`, `row('all', measured)`).

**Failure mode** — 60 measured cues in one rehearsal: the row's median is over cues 11 to 60, the summary's over all 60. The method is the same, the cue set is not, so the two numbers differ in general and the README's sentence reads as if they never would. `docs/install.md:99` says it correctly ("so for the same cues it shows the median the summary prints").

**Recommended fix**
```diff
-... for the last cue and the median of the last 50, by nearest rank, the same median `pnpm lateness` prints, and, for a target ...
+... for the last cue and the median of the last 50, by nearest rank as `pnpm lateness` takes its medians, so over the same cues the two show the same median, and, for a target ...
```

**Remediation brief**
- **Design intent:** the row's median is a running figure over the last 50 measured cues the server handed the target since it started; the summary's median is over a whole local day of logged lines. #201 made the method one (nearest rank, `nearestRank` in `src/server/lateness.ts:42`), not the cue set. Copy states the shared method and the "same cues" condition, never an unconditional equality.
- **Full surface:** `README.md:49` only. `docs/install.md:99` already carries the condition and stays.
- **Must preserve:** the rest of README line 49 word for word, including "the median of the last 50" and the "Acted on 370 ms, median 360 ms" example; no em-dash in the new words; one paragraph stays one line.
- **Do not touch:** `docs/install.md:99` (Reviewed and Dismissed); `src/server/lateness.ts` and `src/lateness/summary.ts` code.
- **Proof:** `grep -c 'the same median `pnpm lateness` prints' README.md` prints 0 after the fix and 1 now; `grep -c 'over the same cues' README.md` prints 1 after; `pnpm lint` stays green.

### 2. Comment hygiene — LOW (aggregated)
- `src/server/lateness.ts:40-41` — "The row's median and every percentile `pnpm lateness` prints take it, so the two never disagree." → "The row's median and every percentile `pnpm lateness` prints take it, so over the same cues the page's rounded median is the one printed, since `Math.round` keeps order." (The row holds the unrounded value, such as 125.4 against the log's 125, and its window is not the summary's day; the replacement also records the rounding decision the ticket rests on, which no comment states today.)

## Needs Further Investigation
### A. A NaN lateness would break the record's sort — confirm by tracing every source of `due`
`latenessRecord` given `[NaN, 5, 1]` returns a median of 1, since `(a, b) => a - b` returns NaN for a NaN pair. It needs `clock.now() - due` to be NaN (`src/server/connections.ts:211`), and both look finite, but the agent did not trace every caller that passes `due`. Pre-existing and untouched: the base's `median` sorted with the same comparator. To confirm or kill it, trace each `hand(..., due, ...)` call site to the tempo and position it computes `due` from, and check for a zero or missing tempo.

## Reviewed and Dismissed
- `docs/install.md:99` "The producer row's median is taken the same way, so for the same cues it shows the median the summary prints." — accurate: it names the shared method and conditions the equality on the same cues. (The lane's own pass F1.3 raised it as reading broad; the condition is stated, so it stays.)
- `src/shared/snapshot.ts:167-171`, the `ConnectionLateness` comment — accurate: "the median of the last 50, by nearest rank, as `pnpm lateness` takes it".
- `src/lateness/summary.ts` importing a value from `src/server/lateness.ts` — that module imports only a type, so the CLI pulls in no server side effects; it is the ticket's recorded choice.
- Acted cue sets — the record's `acted` and the log lines with a non-null `actedMs` are the same cues (`src/server/connections.ts:186-188`).
- A cue the row counts before its log line exists, for an acknowledging target (`connections.ts:211-214`) — a transient window until the target acts or the line settles; once written, the line is the same cue. Not a disagreement anyone reads.
- `test/pages.test.ts:822` `actedMedian: 360.5` — still a valid snapshot: the record keeps unrounded latenesses, so a fractional median still occurs.
- `Math.ceil((p / 100) * n)` float error — the agent checked it against `Math.ceil(p * n / 100)` for p in 50, 90, 95, 99 and n = 1..2000: identical.
- Test-comment arithmetic in `test/cue-lateness.test.ts:249,274,471` — rank 1 of 2 is 125 and 185, rank 25 of 50 is 250: correct.

## Minor / nits
- `src/server/lateness.ts:42` `nearestRank` returns `undefined` typed as `number` (the `!`) for an empty array, a percentile above 100, or NaN, and a wrong rank for unsorted input. Both callers guard (`lateness.ts:36` checks the length and sorts; `summary.ts:91` sorts and `:97,126,128` never call it on an empty list), so no user path reaches it. Now that the helper is exported, a `median(values)` / `percentile(values, p)` that sorts inside and handles empty would retire the precondition. The lane's pass logged it as F1.1.
- The shared helper lives in the per-target record module, and the summary imports it from there (the lane's F1.2). The ticket chose this on purpose; a move to a small `src/shared/` module is a taste call.

## Test quality
Tests added or changed: 4 (3 rewritten expectations, 1 new) · green against `$BASE`: 0, all 4 red there · red under the old mean-of-the-middle-two median: all 4 · tautology shapes found: 0. The new test, `gives the row the median `pnpm lateness` prints for the same cues, on an even count` (`test/cue-lateness.test.ts:624-639`), drives the real server against the fake Live and reads the real log back through `readLines` and `summarize`, so neither side computes its own expectation. Its latenesses are whole milliseconds (250 and 125), so the page's `Math.round` never meets a fractional or x.5 median, and it repeats the page's rounding instead of rendering it; the agent's property harness found 0 mismatches over 20000 fractional and tied trials, so the behaviour holds and only the pin is narrow. A unit test on `latenessRecord()` with fractional latenesses such as 124.6 and 249.5, against `summarize` over `Math.round`ed lines, would pin it. Optional.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and build all green at `052d978`; Playwright green locally.
- **Commit hygiene:** the branch is the lane commit and its merge, plus this doc. Nothing to drop.
- **Likely reviewer asks:** why the acted median changed too (it shares the function, and the summary prints acted spreads by nearest rank); whether #147's decision should read the row or the summary (the summary, which covers the whole rehearsal).

## Verdict
Ready to open the PR as is, with follow-ups. #201's two criteria hold: for an even count the row's median equals the summary's for the same cues, and four tests pin it, each red at the base. Nothing is MEDIUM or higher. Finding 1 (LOW, the README overstates the agreement) and finding 2 (LOW, one comment does the same) are one-line copy fixes, worth taking before the PR but not a gate. Needs Further Investigation A is pre-existing and untouched.
