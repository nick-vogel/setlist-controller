# Pre-PR review: setlist-controller#115 The ATEM acts on its Count Off, and a summary of the lateness log (#186, #187), round 5

**Branch:** `setlist-controller-115-cue-lead-time` vs `origin/main` (merge-base `d63b445` "Merge pull request #198 from nick-vogel/setlist-controller-58-planning-center-plan")
**Reviewed at:** HEAD `3c61571` (setlist-controller#115 Merge origin/main into the integration branch), clean tree: 0 files with uncommitted changes, 0 untracked; 20 files total against the merge-base, +1090 / -56
**Delta under review:** since `2a007a0` (setlist-controller#187 A summary of the lateness log for each target and cause), the HEAD `pre-pr-review-4.md` reviewed. The branch side of the delta is `c489fbd` (pre-PR review 4 finding 1: three ATEM rig tests, `test/atem.test.ts` +47), `4381750` (pre-PR review 4 finding 2: `src/lateness/main.ts` and one test in `test/lateness-command.test.ts`), `712ad14` (review 4's closure table) and the merge `3c61571` of origin/main `d63b445`, with one hunk of `src/server/atem.ts` resolved by hand. Two-dot from `2a007a0`, the delta is 23 files, +1486 / -45, most of it main's own: setlist-controller#114 run 3 (#183, #184 and its review 5 and 6 remediation: `src/server/atem.ts`, `src/server/atem-switcher.ts`, `test/fake-switcher.ts`, `test/atem.test.ts`, `test/atem-switcher.test.ts`), #188 and #190 (`.claude/skills/build-set/SKILL.md`), #189 (`docs/install.md`), and those epics' review docs.
**Reviewed against:** `pre-pr-review-4.md` (its findings 1 and 2 and their briefs, its Approach decisions, its Remediation closure and deferral of findings 3 and 4, its Minor list); the scope note from the orchestrator for this round: whether the merge keeps both sides' behaviour, and whether #186's acknowledgement (own-cut records carrying their cue, `actedOn` on a matched program report) interacts correctly with #114 run 3's give-up retry, its retry and resolve races, and its per-report input names. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green (exit 0) |
| Typecheck | `pnpm typecheck` | green (exit 0) |
| Unit and server suites | `pnpm test` | 55 files, 1164 passed, 4 skipped, first run |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| Merge keeps both sides | finder interdiff, per file, of `src/server/atem.ts`, `src/server/atem-switcher.ts`, `test/fake-switcher.ts`, `test/atem.test.ts`, `test/atem-switcher.test.ts`: main's own delta `57a7eaf..d63b445` against main's side as landed `712ad14..HEAD`, and the branch's delta `57a7eaf..712ad14` against its side as landed `d63b445..HEAD` | identical, every line, both directions, all five files; the hand-resolved hunk dropped nothing |
| Tests from both sides survive | `grep -cE '^\s*it\(' test/atem.test.ts` at `57a7eaf`, `712ad14`, `d63b445`, `HEAD` | 42, 53, 54, 65: the branch's 11 plus main's 12 on the 42. The three repeated test names at HEAD all came from main, in separate describes |
| No merge markers | `git grep` for conflict markers at HEAD outside `docs/reviews` | none |
| Review 4 finding 1's tests at HEAD, after the merge | scratch worktree at `3c61571` per mutant, `repro/review-4-mutation-*.diff` applied, `pnpm exec vitest run test/atem.test.ts` | filtered-cue-settles: 1 failed ("keeps a Count Off waiting on its report..."); fire-again-ignores-acts-on: 1 failed ("writes no line for Fire again in song 2's Verse"); unmeasured-ignores-acts-on: 2 failed (that test and "writes no line for a drag to the middle of song 1's Chorus"). Finder repeated it, same result |
| Review 4 finding 2's test can go red | scratch worktree at `2a007a0`, the HEAD `test/lateness-command.test.ts` copied in, run there | the new test red, the other 6 green |
| #186 against #114 run 3 | finder probe test driving `atemKind` over `fakeSwitcher` with a manual clock and a recording `TargetReport` (scratch only): give-up while a Count Off's echo is held; `goOffline`/`goOnline` and `connectOnItsOwn` with an echo held; give-up during `holdConnects`; one report with two program changes, both orders | all correct: a give-up reports offline first, which clears the own cuts and settles the waiting line with `actedMs: null` before the retry; a resolve cancels a pending retry without touching the own cuts; a multi-change report acts on the Count Off's cut and pauses on the operator's, in either order |
| Not run | a real ATEM, real Live | whether a pre-drop program report can arrive after a reconnect (Reviewed and Dismissed), and review 4's Needs Further Investigation B, stay unverified on hardware |

**Overall:** Both remediation commits do what review 4 asked, and the merge kept both sides' behaviour line for line. #186's acknowledgement composes with #114 run 3: a give-up goes through the offline report, which settles the waiting Count Off and empties the own-cut record, and nothing in the retry, the resolve race or the per-report input names reaches `actedOn`. The full checks are green on the first run. The only confirmed findings are review 4's findings 3 and 4, carried unchanged because Nick's close-out deferred them. The branch can open its PR as is.

## Approach decisions
- The due-time window (round 1): symmetric half bar in `dueAt`. Carried forward unchanged.
- The dev log (round 1): `dev:server` writes `dist/dev-cue-lateness.log`; production and the launch agent unchanged. Carried forward unchanged.
- A row's `problems` and `lateness` (round 3): independent fields of `Entry`. Carried forward unchanged.
- The cue filter (#186): an optional `Target.actsOn`, consulted first in `hand()`; a cue it refuses is handed with no line and settles nothing. Fire again and an unmeasured cue go through the same check. Tests for it go through the ATEM rig in `test/atem.test.ts`, since the fake target keeps no filter (#186 AC 6). Carried forward unchanged.
- The ATEM's acknowledgement (#186): the own-cut record carries the cue that caused each cut, and the matched program report calls `actedOn` with it, after the row shows the input. Button cuts carry none. Carried forward unchanged.
- Unmeasured lines (#187): written at once by `hand()`, after `settle`, with the reason its caller passes. Carried forward unchanged.
- The command's errors (#187, review 4): follow `build-set` (`src/set-builder/main.ts:246-248`): one line on stderr from the error's message, exit 1; usage errors exit 2. Carried forward unchanged.
- An unreadable log (review 4 remediation, finding 2): `textOf` prints the one line and calls `process.exit(1)` itself, so the other read in flight under `Promise.all` is abandoned and nothing is summarized from half the log. Every code but ENOENT is unreadable, ENOTDIR included. Carried forward; this review adds the ENOTDIR clause (Reviewed and Dismissed).
- The ATEM's give-up (#114 run 3, from main): the switcher client reports offline before it calls the gave-up listeners, so the server settles a waiting acknowledgement through its offline report, and the adapter's `onGaveUp` only sets the problem and schedules the retry. This review adds it as the rule #186 relies on; a give-up path that skipped the offline report would leave a Count Off waiting until the next measured cue.

## Prior-review closure
Review 4 confirmed four findings, all LOW.
- Fully fixed: 2. Finding 1 (`c489fbd`): the three tests are in `test/atem.test.ts:1161-1206` and each review-4 mutant turns at least one red at HEAD, after the merge. Finding 2 (`4381750`): `pnpm lateness --log <folder>` prints one stderr line naming the path and exits 1; ENOENT still returns null; the new test is red at `2a007a0`.
- Partially fixed: 0.
- Untouched: 2, both deferred by decision. Review 4's closure table marks findings 3 and 4 "deferred, not in the opted-in scope" (Nick's close-out, `.epic-loop/closeout.md` item 2). They are carried below as findings 1 and 2, unchanged in substance, with line numbers updated.
- Comment-only "fixes": 0.

## Confirmed Issues
### 1. Four of the command's fallbacks have no test — LOW
- **Location:** `test/lateness-command.test.ts`, `test/lateness-summary.test.ts`; the code at `src/lateness/main.ts:25`, `:39-41`, `src/lateness/summary.ts:155`
- **Attribution:** introduced in `da24774` (setlist-controller#187 A summary of the lateness log for each target and cause). Carried from `pre-pr-review-4.md` finding 3, deferred by Nick's close-out decision; not a regression, since nothing since `2a007a0` touched these paths except the line shift from `4381750`.
- **Real-world trigger:** none today; each path works by probe. A later edit could break one silently: a relative `--log` typed in a subfolder reading the wrong place, a log with only `.1` reported as missing, an empty log printing nothing, or the malformed count moving to the top. LOW, capped: no user path until such an edit.

**Evidence** — `grep -n "INIT_CWD\|cwd" test/lateness-command.test.ts` finds only the spawn's `cwd: REPO_ROOT` (line 27), and every test passes an absolute `--log`. The `.1` test (lines 89-102) writes both files. No test feeds an empty or all-malformed text to `readLines`/`formatSummary`. The malformed test (lines 76-87) checks the count appears once, not that it is last, though #187's brief says it prints "at the end".

**Failure mode** — These edits pass every test: always using `process.cwd()` instead of `INIT_CWD`; treating a missing `<log>` as a missing log even when `<log>.1` exists; dropping the "No cues in the log." line; printing the malformed count first.

**Recommended fix** — Four tests:
- In `test/lateness-command.test.ts`, a relative `--log`: spawn `pnpm --silent lateness --log <name relative to dist/>` with `cwd` set to the worktree's `dist/` folder (pnpm sets `INIT_CWD` there), and assert the summary's numbers, not "No lateness log". Precedent: `test/set-builder-command.test.ts:480`.
- In `test/lateness-command.test.ts`, only `<path>.1` written: exit 0 and its numbers printed.
- In `test/lateness-summary.test.ts`, `formatSummary(summarize(readLines(['']).lines, { timeZone: 'America/Chicago' }), 0)` ends with `No cues in the log.`
- In the malformed test, `expect(stdout.trimEnd().split('\n').at(-1)).toBe('Skipped 1 malformed line.')`.

No production change.

**Remediation brief**
- **Design intent:** `src/lateness/main.ts` reads `<log>.1` then `<log>`, each skipped when absent (ENOENT), and stops with one stderr line and exit 1 on any other read error; a relative `--log` resolves against `INIT_CWD` only when pnpm runs the `lateness` script, else `process.cwd()`, as `build-set` does. `formatSummary` prints the method line, the days, "No cues in the log." when there are none, and the malformed count last when above 0.
- **Full surface:** `test/lateness-command.test.ts`, `test/lateness-summary.test.ts`. Fixtures under the test's own `dist/lateness-*` folder, never the OS temp folder or `~/Library`.
- **Must preserve:** every existing test in both files, including "says in one line on stderr that it could not read a folder given as the log, and exits 1" (line 65); `test/lateness-fixture.ts`'s builders.
- **Do not touch:** the production code; ENOTDIR exiting 1 (Reviewed and Dismissed).
- **Proof:** each new test goes red under its edit, made in a scratch worktree outside the repo (`git worktree add --detach "$SCRATCH/mut" HEAD && ln -s "$PWD/node_modules" "$SCRATCH/mut/node_modules"`, remove it after): `const from = process.cwd();` at `src/lateness/main.ts:25`; `if ((await textOf(path)) === null)` printing the missing sentence; deleting `src/lateness/summary.ts:155`; moving the malformed push at `src/lateness/summary.ts:156` before the day loop. Then `pnpm exec vitest run test/lateness-command.test.ts test/lateness-summary.test.ts` green in the worktree.

### 2. Comment hygiene — LOW (aggregated)
Carried from `pre-pr-review-4.md` finding 4, deferred by Nick's close-out decision; all three entries unchanged at HEAD.
- `src/server/lateness-log.ts:7` — a line of 138 characters in a file wrapped at 100 (introduced in `da24774`) → rewrap the paragraph at lines 6-8 at 100 columns, words unchanged.
- `src/server/playback-controller.ts:607-608` — "A listener report comes well within half a bar of the playhead crossing a beat, at any tempo a song is played at. Live snaps a drag to a bar line, so a report a whole bar past is a drag." → append "A beat half a bar or more ahead of the report was raised from a start the playhead left; a lead time fires well inside half a bar." (pre-existing, untouched: carried since round 1)
- `README.md:49` — "as \"Late 250 ms, median 240 ms\" for the last cue and the median of the last 50" → "as \"Late 250 ms, median 240 ms\" for the last measured cue and the median of the last 50 measured" (pre-existing, untouched: carried since round 3)

## Needs Further Investigation
### A. A cue at a song change may be converted at the old tempo — confirm with an OSC trace
Carried forward from rounds 1 to 4 unchanged: capture an OSC trace of a song change in a set with two tempos and check whether `/live/song/get/tempo` arrives before `/live/song/get/current_song_time`.

### B. Whether the ATEM reports a cut to the input already on program — confirm on the church's ATEM Mini
Carried from `pre-pr-review-4.md` B unchanged. From a service's second Count Off on, the Count Off cuts to Camera while Camera is on program, and the ATEM's acted-on time needs a program report for that cut. The adapter's contract promises one (`src/server/atem.ts:50`), the fake sends one, and atem-connection 3.10.3 forwards any `PrgI`, but whether the hardware sends `PrgI` for a change that changes nothing is unverified. What settles it: #145's acceptance run, or a rehearsal's log with a numeric `actedMs` on an ATEM line for a second-song Count Off. If it does not come, say so in `docs/install.md` section 4 before #147 reads the numbers.

### C. A rotation during `pnpm lateness` can count a file's lines twice — confirm with a timed rotation
Carried from `pre-pr-review-4.md` C unchanged; `src/lateness/main.ts:39` still reads both files under `Promise.all`. What would confirm it: a harness that renames the log between the two `readFile` calls. A sequential read closes the double count.

## Reviewed and Dismissed
- The hand-resolved hunk in `src/server/atem.ts` — the interdiff against both parents is identical line for line: the branch's `match`/`acknowledges` lines and main's `retryLater`, the reworded `connectOnce` and target comments all landed. Do not re-resolve it.
- A give-up while a Count Off waits on its echo has no test of its own (finder L2) — the chain is pinned link by link: the production client reports offline before it gives up (`test/atem-switcher.test.ts:275`, and `:292` for no second offline), the adapter's give-up tests drive `respawnFailingReconnect` (`test/atem.test.ts:724` onward), and an offline report settling the waiting line with `actedMs: null` is the existing ATEM rig test ending at `test/atem.test.ts:1159`. The rule is recorded in Approach decisions.
- `pnpm lateness --log <file>/cue-lateness.log` exits 1 with ENOTDIR rather than "No lateness log" (finder L1) — review 4 named ENOTDIR among the cases finding 2 was to turn into one line, and its fix kept "any other failure to read" as exit 1. A path through a file is a typing error worth stopping on.
- An operator's cut to Camera at the ATEM before a Count Off's own report is taken as that report, so `actedMs` is the operator's time (finder L3) — already in review 4's Minor list; the match by input predates #186 and a report carries no origin, so the adapter cannot tell them apart.
- A program report from before a drop credited to the next Count Off after a reconnect (finder L4) — only the fake keeps held echoes across a drop. `onConnection` empties the own-cut record on both connect and disconnect, the server settles the waiting line at the offline, and `actedOn` needs the identical `Cue` object, so a stale report can only match a later cut of the same input. The adapter's comment ("a report lost to the drop never comes after") and the main-side switcher comment (the library emits `stateChanged` only while connected) both say the hardware path does not exist. The same holds for `goOffline`/`goOnline` before the merge; #114 run 3's give-up adds a reconnect path, not a new kind.
- `process.exit(1)` right after `console.error` in `textOf` (`src/lateness/main.ts:34-35`) — stderr to a pipe can be asynchronous on macOS, but libuv writes a short line at once, and the new test passes with stderr piped. A recorded decision.
- The atem-switcher `stateChanged` handler not checking the client's `connected` flag after a give-up sets it false (main side, untouched by this branch) — even if the library emitted one, `sent` is empty and the waiting line settled, so `actedOn` cannot fire.

## Minor / nits
- The ATEM's `actedMs` includes one synchronous snapshot publish: `onProgram` calls `program(input)`, which publishes, before `report.actedOn` reads the clock (`src/server/atem.ts:229-230`). Under a millisecond; the order is the recorded "after the row shows it".
- Review 4's Minor items (the `Intl.DateTimeFormat` per line, `actsOn` outside `safely`, the operator cut to Camera inside 2 seconds, `isLine` accepting hand-edited shapes, the untyped fixture builders, three ATEM tests red at base for extra lines) are unchanged by this delta.

## Test quality
Tests added or modified in the delta, on the branch side: 4 (`test/atem.test.ts` 3, `test/lateness-command.test.ts` 1). The three ATEM tests pin correct code without a production change, so their oracle is the mutation run, not the base: each goes red under the review-4 mutant it was written for, at HEAD after the merge. The lateness test is red at `2a007a0`. Green against the oracle: 0. Tautology shapes found: 0; the ATEM tests fake only the switcher client and assert literal log lines and lateness numbers, and the command test spawns the real command. Main's own tests arrived through the merge and were reviewed in setlist-controller#114's reviews; this review checked only that they survive it, and they do (65 of 65 test names present).

## Before opening the PR
- **CI readiness:** lint, typecheck, test, build green at `3c61571`, first run; Playwright 44 passed locally.
- **Commit hygiene:** this doc is the only addition; no repro was added this round, since every check passed or reused review 4's mutants.
- **Likely reviewer asks:** whether the ATEM's acted-on time holds from the second Count Off on (Needs Further Investigation B); that the merge of main's #114 run 3 into `src/server/atem.ts` was resolved by hand (the interdiff row above answers it).

## Verdict
Ready to open the PR as is. Review 4's two opted-in findings are fully fixed and hold after the merge, the merge kept both sides' behaviour, and #186's acknowledgement composes with #114 run 3's give-up, retry and per-report names. Nothing is MEDIUM or higher. The two confirmed findings are review 4's deferred LOW findings 3 and 4, carried as follow-up material; nothing new was confirmed, which is the expected shrink after a remediation round. Needs Further Investigation B should still be settled before #147 reads the ATEM's acted-on numbers.
