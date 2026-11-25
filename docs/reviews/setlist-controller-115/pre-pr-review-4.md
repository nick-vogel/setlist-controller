# Pre-PR review: setlist-controller#115 The ATEM acts on its Count Off, and a summary of the lateness log (#186, #187), round 4

**Branch:** `setlist-controller-115-cue-lead-time` vs `origin/main` (merge-base `57a7eaf` "Merge pull request #192 from nick-vogel/setlist-controller-115-cue-lead-time")
**Reviewed at:** HEAD `2a007a0` (setlist-controller#187 A summary of the lateness log for each target and cause), clean tree: 0 files with uncommitted changes, 0 untracked; 16 files total, +797 / -56
**Delta under review:** none. A fresh review (`--fresh`) of everything since the merge-base: the four commits `58d455b` and its merge `da30861` (setlist-controller#186 The ATEM reports its program change as the acted-on time for a cue), and `da24774` and its merge `2a007a0` (setlist-controller#187 A summary of the lateness log for each target and cause). Rounds 1 to 3 reviewed #146, which main now holds through PR #192.
**Reviewed against:** epic #115's body ("Measuring", "Testing Decisions"); the Agent Brief comments on #186 and #187 (their acceptance criteria); the #186 and #187 issue bodies ("Also check" F4.12 and F4.11); `pre-pr-review-3.md` (Approach decisions, Comment hygiene, Needs Further Investigation A, Minor); `docs/reviews/setlist-controller-114/pre-pr-review-2.md` Needs Further Investigation A. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 2 code-review agents + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green (exit 0) |
| Typecheck | `pnpm typecheck` | green (exit 0) |
| Unit and server suites | `pnpm test` | first run 1 red: `test/set-builder-command.test.ts:448` "stops on a set folder that already exists, and replaces it with --replace", timed out in 5000 ms, a file this branch does not touch, while another suite ran beside it. Re-run after 60 s: 55 files, 1142 passed, 4 skipped. A flake |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| #186 AC 1 to 6 against the code | finder read `atem.ts`, `connections.ts`, `target.ts` and the new ATEM tests; ran `test/atem.test.ts`, `test/cue-lateness.test.ts` (88 passed) | each AC holds and has a test. A Count Off's cut carries the very `Cue` object `hand()` stores, so identity pairing works; button cuts carry `cue: null`; `byHand` is unchanged in effect (`!own` on a match object or null) |
| #187 AC 1 to 6 against the code | finder read `src/lateness/*`, the line types and the command and summary tests; ran them (13 passed); probes with crafted logs under the scratchpad | each AC holds. Nearest rank equals the exact `ceil(9n/10)` for every n to 100000; n = 1 and empty acted lists are safe; days cut at local midnight across both 2026 DST changes; a torn last line counts as malformed; CRLF parses |
| The cue filter's three paths | scratch worktree at `2a007a0`, three mutants of `hand()` (`repro/review-4-mutation-*.diff`), `test/atem.test.ts`, `test/cue-lateness.test.ts`, `test/connections.test.ts` | all three survive, 106 of 106 green each; the first and third together survive the whole suite, 1142 green (finding 1) |
| `pnpm lateness --log dist` (a folder) | run from the repo root | exit 1 with a raw `EISDIR` stack trace (finding 2) |
| The command's fallback paths have tests | `grep` of `test/lateness-command.test.ts` and `test/lateness-summary.test.ts` for `INIT_CWD`, a `.1`-only log, an empty file, the malformed line's position | none of the four (finding 3) |
| Summary time on a full log | `summarize` over 62,000 lines, 9 MB (both files full) | 1.9 s unloaded, 7.3 s while the suite ran (Minor) |
| Tautology audit | scratch worktree at `57a7eaf`, the branch's five test files copied in, run there | 33 added or modified cases: 31 red at base; 2 green, both cases of a strengthened `it.each` (below) |
| Not run | a real ATEM, real Live | whether the ATEM reports a cut to the input already on program stays open (Needs Further Investigation B) |

**Overall:** Both tickets do what their acceptance criteria ask, and the full checks are green. Nothing is MEDIUM or higher. The confirmed findings are test gaps and one unfriendly error: three ways the cue filter could regress without a test noticing, a raw stack trace when `pnpm lateness` is pointed at something it cannot read, and four untested fallbacks in the command. The one open question with real reach is whether the church's ATEM reports a cut to Camera when Camera is already on program; if it does not, the ATEM's acted-on numbers come from the first Count Off of each service only. The branch can open its PR as is, with the findings as follow-ups or a remediation round.

## Approach decisions
- The due-time window (round 1): symmetric half bar in `dueAt`. Carried forward unchanged.
- The dev log (round 1): `dev:server` writes `dist/dev-cue-lateness.log`; production and the launch agent unchanged. Carried forward unchanged.
- A row's `problems` and `lateness` (round 3): independent fields of `Entry`. Carried forward unchanged.
- The cue filter (#186): an optional `Target.actsOn`, consulted first in `hand()`; a cue it refuses is handed with no line and settles nothing. Fire again and an unmeasured cue go through the same check. Tests for it go through the ATEM rig in `test/atem.test.ts`, since the fake target keeps no filter (#186 AC 6).
- The ATEM's acknowledgement (#186): the own-cut record carries the cue that caused each cut, and the matched program report calls `actedOn` with it. Button cuts carry none.
- Unmeasured lines (#187): written at once by `hand()`, after `settle`, with the reason its caller passes.
- The command's errors (#187, this review): follow `build-set` (`src/set-builder/main.ts:246-248`): one line on stderr from the error's message, exit 1; usage errors exit 2.
- An unreadable log (review 4 remediation, finding 2): `textOf` prints the one line and calls `process.exit(1)` itself, rather than `build-set`'s `process.exitCode = 1`, so the other read in flight under `Promise.all` is abandoned and nothing is summarized from half the log.

## Confirmed Issues
### 1. Three ways the cue filter can regress with every test green — LOW
- **Location:** `src/server/connections.ts:203-206`
- **Attribution:** introduced. `git log -S'actsOn?.(cue)' 57a7eaf..HEAD` names `58d455b` (setlist-controller#186 The ATEM reports its program change as the acted-on time for a cue); the Fire again and drag paths that now run through it are `da24774` (setlist-controller#187 A summary of the lateness log for each target and cause).
- **Real-world trigger:** none today; the code is right. A later change to `hand()` (the lead time in #147 will rework it) could make the ATEM write a line for a Verse on Fire again or on a drag, or settle a Count Off's line before its acknowledgement arrives, and nothing would go red. LOW, capped: no user path until such a change lands.

**Evidence**
```ts
const hand = (entry: Entry, cue: Cue, due: number | null, unmeasured: UnmeasuredReason) => {
  if (!(entry.target.actsOn?.(cue) ?? true)) {
    safely(entry, 'take a cue', () => entry.target.cue(cue));
    return;
  }
  settle(entry);
```
**Failure mode** — Each mutant below passes `test/atem.test.ts`, `test/cue-lateness.test.ts` and `test/connections.test.ts` (106 of 106), and the first plus the third together pass the whole suite (1142):
- `repro/review-4-mutation-filtered-cue-settles.diff`: a filtered cue settles the pending line, so an ATEM Count Off whose echo is still on its way when the next section's cue is handed logs `actedMs: null`.
- `repro/review-4-mutation-fire-again-ignores-acts-on.diff`: Fire again skips the filter, so Fire again on the ATEM in a Verse writes an ATEM `fire-again` line for a cue the ATEM ignores.
- `repro/review-4-mutation-unmeasured-ignores-acts-on.diff`: any cue with no due time skips the filter, so a drag into the middle of a Verse writes an ATEM `not-played-across` line.

No test covers these because `test/fake-target.ts` has no filter, the ATEM is the only target with one, and no ATEM test hands a filtered cue while a Count Off waits on its echo, presses Fire again outside a Count Off with a log, or drags with a log.

**Recommended fix** — Three tests in `test/atem.test.ts`, in the describe "how late the ATEM gets and acts on a cue" (line 807), built like the tests beside them (`newLogDir`, `atemRig(switcher, { latenessLog: { path } })`, `linesOf`, `withoutTime`, `countOffLine`):
- (a) A filtered cue leaves the Count Off waiting: `switcher.holdEchoes()`, play into song 2's Count Off a quarter beat late as the test at line 836 does, play on into song 2's Verse at 48 (the ATEM filters it), then `rig!.advanceConnected(300)` and `switcher.releaseEchoes()`. Expect the row's `acted` to be a number and the log to be exactly `[countOffLine(125, <the acted ms>)]`. Red under the first mutant.
- (b) Fire again outside a Count Off writes nothing for the ATEM: with a log, play into song 2's Verse (as `Fire again on the ATEM`, line 190, does), press `{ kind: 'fire-again', target: 'atem' }`, close the rig, and expect no ATEM line for the Verse. Red under the second mutant.
- (c) A drag writes nothing for the ATEM: with a log, drag the playhead into the middle of a section other than a Count Off, as `test/cue-lateness.test.ts:326` "leaves a cue the playhead was dragged to mid-section unmeasured" drags, close the rig, and expect no ATEM line. Red under the third mutant.

No production change.

**Remediation brief**
- **Design intent:** a target that declares `actsOn` is measured only on the cues it acts on. For those, `hand()` settles the earlier pending line, then writes a measured or an unmeasured line. A cue it does not act on still reaches `target.cue()` but writes nothing and settles nothing, so an acknowledgement for the Count Off can still land after a later Verse. The filter comes before both the measured and the unmeasured branch.
- **Full surface:** `test/atem.test.ts` only (new tests after line 959). `src/server/connections.ts:203-206` is the code they pin; it does not change.
- **Must preserve:** every existing test in `test/atem.test.ts` and `test/cue-lateness.test.ts`; `test/fake-target.ts` unchanged (#186 AC 6 says the fake target keeps measuring every cue).
- **Do not touch:** the `not-played-across` label for every null due time (Reviewed and Dismissed); `actsOn` outside `safely` (Minor).
- **Proof:** for each mutant, red after the new tests, green without the mutant. From the repo root: `git worktree add --detach "$SCRATCH/mut" HEAD && ln -s "$PWD/node_modules" "$SCRATCH/mut/node_modules" && git -C "$SCRATCH/mut" apply "$PWD/docs/reviews/setlist-controller-115/repro/review-4-mutation-filtered-cue-settles.diff" && (cd "$SCRATCH/mut" && pnpm exec vitest run test/atem.test.ts)`, then `git worktree remove --force "$SCRATCH/mut"`, and the same for `review-4-mutation-fire-again-ignores-acts-on.diff` and `review-4-mutation-unmeasured-ignores-acts-on.diff`. `$SCRATCH` is a folder outside the repo. Each must report at least one failed test. Then `pnpm exec vitest run test/atem.test.ts` in the worktree is green.

### 2. `pnpm lateness` pointed at a folder or an unreadable file prints a raw stack trace — LOW
- **Location:** `src/lateness/main.ts:29-35`
- **Attribution:** introduced in `da24774` (setlist-controller#187 A summary of the lateness log for each target and cause); `git log -S"code === 'ENOENT') return null;"` names it.
- **Real-world trigger:** Nick types the log's folder rather than the file, `pnpm lateness --log ~/Library/Logs/setlist-controller`, or a file whose permissions block reading. He gets a Node stack trace, exit 1, rather than a sentence. LOW: a confusing message, no wrong number.

**Evidence**
```ts
async function textOf(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
```
**Failure mode** — `pnpm --silent lateness --log dist` from the repo root prints `Error: EISDIR: illegal operation on a directory, read` with a stack through `textOf` and `Promise.all`, and exits 1. The finder saw the same for EACCES (`chmod 000`) and ENOTDIR (`--log file.log/x`). No test covers the path, against the rule "a test for every fallback path".

**Recommended fix** — Report the failure the way `build-set` does at `src/set-builder/main.ts:246-248`:
```diff
   } catch (error) {
     if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
-    throw error;
+    console.error(`Could not read the lateness log at ${file}: ${error instanceof Error ? error.message : String(error)}`);
+    process.exit(1);
   }
```
and a test in `test/lateness-command.test.ts`: `--log` naming a folder made under the test's `dist/lateness-*` folder gives exit 1, stdout empty, and stderr one line that names the path.

**Remediation brief**
- **Design intent:** the command is a thin reader. A missing log (neither `<log>` nor `<log>.1`) is one sentence on stdout, exit 0; a usage error is exit 2; any other failure to read stops it with exit 1. Only the message changes here.
- **Full surface:** `src/lateness/main.ts:29-35`; `test/lateness-command.test.ts` (new test, beside "a missing log"); `docs/install.md` section 4 needs no change (it does not describe this case).
- **Must preserve:** ENOENT returns null, so a log with only `.1`, or only the log, is still read, and neither prints `No lateness log at <path>.` with exit 0 (`test/lateness-command.test.ts` "a missing log"). An exit on the first unreadable file is intended; the other read in flight is abandoned with it.
- **Do not touch:** the usage text's length (Reviewed and Dismissed).
- **Proof:** `pnpm --silent lateness --log dist; echo $?` prints one line starting `Could not read the lateness log at` on stderr and `1`. The new test is red before the change (stderr holds a stack, more than one line) and green after.

### 3. Four of the command's fallbacks have no test — LOW
- **Location:** `test/lateness-command.test.ts`, `test/lateness-summary.test.ts`; the code at `src/lateness/main.ts:25`, `:38-40`, `src/lateness/summary.ts:155`
- **Attribution:** introduced in `da24774` (setlist-controller#187 A summary of the lateness log for each target and cause).
- **Real-world trigger:** none today; each path works by probe. A later edit could break one silently: a relative `--log` typed in a subfolder reading the wrong place, a log with only `.1` reported as missing, an empty log printing nothing, or the malformed count moving to the top. LOW, capped: no user path until such an edit.

**Evidence** — `grep -n "INIT_CWD\|cwd" test/lateness-command.test.ts` finds only the spawn's `cwd: REPO_ROOT` (line 27), and every test passes an absolute `--log`. The `.1` test (line 81-82) writes both files. No test feeds an empty or all-malformed text to `readLines`/`formatSummary`. The malformed test (lines 68-69) checks the count appears once, not that it is last, though #187's brief says it prints "at the end".

**Failure mode** — These edits pass every test (finder's reading; the absences above are grep-verified): always using `process.cwd()` instead of `INIT_CWD`; treating a missing `<log>` as a missing log even when `<log>.1` exists; dropping the "No cues in the log." line; printing the malformed count first.

**Recommended fix** — Four tests:
- In `test/lateness-command.test.ts`, a relative `--log`: spawn `pnpm --silent lateness --log <name relative to dist/>` with `cwd` set to the worktree's `dist/` folder (pnpm sets `INIT_CWD` there), and assert the summary's numbers, not "No lateness log". Precedent: `test/set-builder-command.test.ts:480`.
- In `test/lateness-command.test.ts`, only `<path>.1` written: exit 0 and its numbers printed.
- In `test/lateness-summary.test.ts`, `formatSummary(summarize(readLines(['']).lines, { timeZone: 'America/Chicago' }), 0)` ends with `No cues in the log.`
- In the malformed test, `expect(stdout.trimEnd().split('\n').at(-1)).toBe('Skipped 1 malformed line.')`.

No production change.

**Remediation brief**
- **Design intent:** `src/lateness/main.ts` reads `<log>.1` then `<log>`, each skipped when absent; a relative `--log` resolves against `INIT_CWD` only when pnpm runs the `lateness` script, else `process.cwd()`, as `build-set` does. `formatSummary` prints the method line, the days, "No cues in the log." when there are none, and the malformed count last when above 0.
- **Full surface:** `test/lateness-command.test.ts`, `test/lateness-summary.test.ts`. Fixtures under the test's own `dist/lateness-*` folder, never the OS temp folder or `~/Library`.
- **Must preserve:** every existing test in both files; `test/lateness-fixture.ts`'s builders.
- **Do not touch:** the production code.
- **Proof:** each new test goes red under its edit, made in a scratch worktree: `const from = process.cwd();` at `src/lateness/main.ts:25`; `if ((await textOf(path)) === null)` printing the missing sentence; deleting `src/lateness/summary.ts:155`; moving the malformed push before the day loop. Then `pnpm exec vitest run test/lateness-command.test.ts test/lateness-summary.test.ts` green in the worktree.

### 4. Comment hygiene — LOW (aggregated)
- `src/server/lateness-log.ts:6-7` — a line of about 135 characters in a file wrapped at 100 (introduced in `da24774`) → rewrap the paragraph at 100 columns, words unchanged.
- `src/server/playback-controller.ts:607-608` — "A listener report comes well within half a bar of the playhead crossing a beat, at any tempo a song is played at. Live snaps a drag to a bar line, so a report a whole bar past is a drag." → append "A beat half a bar or more ahead of the report was raised from a start the playhead left; a lead time fires well inside half a bar." (pre-existing, untouched: carried from round 3, a known regression deferred since round 1)
- `README.md:49` — "as \"Late 250 ms, median 240 ms\" for the last cue and the median of the last 50" → "as \"Late 250 ms, median 240 ms\" for the last measured cue and the median of the last 50 measured" (pre-existing, untouched: carried from round 3)

Round 3's two `docs/install.md:86` entries are gone: this branch rewrote that paragraph.

## Needs Further Investigation
### A. A cue at a song change may be converted at the old tempo — confirm with an OSC trace
Carried forward from rounds 1 to 3 unchanged: capture an OSC trace of a song change in a set with two tempos and check whether `/live/song/get/tempo` arrives before `/live/song/get/current_song_time`.

### B. Whether the ATEM reports a cut to the input already on program — confirm on the church's ATEM Mini
Carried from `docs/reviews/setlist-controller-114/pre-pr-review-2.md` A, with more reach now. Nothing cuts to Pro on its own (`src/server/atem.ts` header), so from a service's second Count Off on, the Count Off cuts to Camera while Camera is on program. The ATEM's acted-on time needs a program report for that cut. `SwitcherClient.onProgram` promises one ("A cut to the input already on program is reported too", `src/server/atem.ts:50`), the fake switcher sends one, and atem-connection 3.10.3 forwards any `PrgI` it receives (its `ProgramInputUpdateCommand.applyToState` returns the path unconditionally), but whether the hardware sends `PrgI` for a change that changes nothing is unverified. If it does not, those Count Offs log `actedMs: null`, the ATEM's acted-on median rests on each service's first Count Off, and `docs/install.md` section 4's "so its lines carry `actedMs`" overstates. What settles it: #145's acceptance run, or a rehearsal's log, where an ATEM line for a second-song Count Off with a numeric `actedMs` confirms the report comes. If it does not come, say so in `docs/install.md` section 4 before #147 reads the numbers.

### C. A rotation during `pnpm lateness` can count a file's lines twice — confirm with a timed rotation
`src/lateness/main.ts:38` reads `<log>.1` and `<log>` with `Promise.all`, so the log can be opened first. If the server rotates between the two opens (`rename(path, path.1)`, `src/server/lateness-log.ts`), `.1` is then the file already read, and its lines count twice, against #187's "counted once". The window is microseconds and only while the server writes, so it is unproved. What would confirm it: a harness that renames the log between the two `readFile` calls. A sequential read (`[await textOf(`${path}.1`), await textOf(path)]`) closes the double count; the remaining race can only drop lines.

## Reviewed and Dismissed
- `not-played-across` for every null due time (`src/server/connections.ts:300`), including a cue whose section `cueBeat` cannot find, or no position report yet — the server saw no playhead cross the beat in each case, which is what the reason says; #187's two-reason vocabulary is a recorded decision (the server cannot tell the null cases apart without new plumbing in `dueOf`). Do not split the reason in a fix.
- The usage printed on a bad flag is more than one line (`src/lateness/main.ts:11-15`) — it prints the way `build-set`'s `usage()` does (`src/set-builder/main.ts:99-102`), the precedent the ticket names.
- `ownCut` returning the matched entry rather than a boolean (`src/server/atem.ts:139-146`) — `byHand = !own && input !== known` is unchanged in effect; the window, oldest-first match and slice are untouched, and `test/atem.test.ts:251`, `:268`, `:276`, `:290` still pin them.
- An acknowledgement after stop or offline writing a second line — `stop()` and the offline report settle and null `handed` first, so a later `actedOn` finds nothing; the remaining stop window is round 1's known Minor.
- The two tautology-audit greens at base (`test/cue-lateness.test.ts:210`, `to` = 16 and 17) — the edit in `da24774` only strengthened their assertion (section name, no `unmeasured` key on a measured line); base already measured those drags. The case the edit exists for, `to` = 20, is red at base. Keep them.

## Minor / nits
- `summarize` builds an `Intl.DateTimeFormat` for every line (`src/lateness/summary.ts:104`): 1.9 s over a full 9 MB pair of files, 62,000 lines. Two rehearsals, what #147 needs, take well under 0.1 s. Building the formatter once per `summarize` call would make it instant.
- `actsOn` runs outside `safely` (`src/server/connections.ts:203`), so a filter that throws would stop the `deliver` loop for the targets after it. The ATEM's (`cue.name === COUNT_OFF`) cannot throw; worth wrapping when a target with a richer filter arrives.
- `docs/install.md` section 4 says a cut by hand "never counts as acting on" a cue. A cut to Camera at the ATEM inside 2 seconds of a Count Off's cut, before that cut's report, is taken as the Count Off's own report, as the ATEM's own-cut rule already took it before this branch (not a change by hand). Too narrow to reword now.
- `isLine` accepts a measured line with cause `fire-again`, and any string `Date.parse` takes as `time` (`src/lateness/summary.ts:17-33`). The server writes neither; only a hand-edited log reaches it.
- `test/lateness-fixture.ts:4-8` builds lines from untyped objects, so a renamed field in `MeasuredLine` would leave the summary tests green while real lines counted as malformed. Typing them with `satisfies MeasuredLine` / `UnmeasuredLine` would tie them to the writer.
- Three new ATEM tests ("never acts on a cut the producer's Pro or Camera button makes", "never acts on a cut made at the ATEM", "never acts on a Count Off whose cut the switcher client refuses") go red at base mainly because base writes extra End and Chorus lines, not for the property each names. The button-against-Count-Off pairing is still pinned by the 2-second test at line 885, and the cut by hand by line 907.
- Round 3's Minor items (the stop window, the publish before the cue, `Promise.all` in `connections.stop()`) are unchanged by this branch.

## Test quality
Tests added or modified: 33 cases in 4 files (`test/atem.test.ts` 8 new, `test/cue-lateness.test.ts` 3 new and 2 modified, `test/lateness-command.test.ts` 6 new, `test/lateness-summary.test.ts` 7 new; `test/lateness-fixture.ts` is a helper). Green against `$BASE`: 2, both cases of the strengthened `it.each` at `test/cue-lateness.test.ts:210`, kept (Reviewed and Dismissed). Tautology shapes found: 0; expectations are literals or test-local builders, the summary tests call the real functions, the command tests spawn the real command, and the ATEM tests fake only the switcher client. The gaps are coverage, not tautology: findings 1 and 3.

## Before opening the PR
- **CI readiness:** lint, typecheck, test (after one flake re-run) and build green at `2a007a0`; Playwright green locally.
- **Commit hygiene:** this doc and three mutation diffs under `repro/` are the only additions; the tree was clean before the review.
- **Likely reviewer asks:** whether the ATEM's acted-on time holds from the second Count Off on (Needs Further Investigation B); why the producer row's median and the summary's median differ on an even count (filed as a proposal by #187: the row takes the mean of the two middle values).

## Verdict
Ready to open the PR as is, with follow-ups. Nothing is MEDIUM or higher, and both tickets meet their acceptance criteria with green checks. Findings 1 to 3 are test gaps and one error message, fine as a remediation round or a follow-up ticket; finding 4 is comment hygiene. Needs Further Investigation B should be settled before #147 reads the ATEM's acted-on numbers, since it decides how many Count Offs those numbers cover.

## Remediation — 2026-10-22
Scope: Nick's close-out decision (`.epic-loop/closeout.md`, item 2) opted in Confirmed Issues 1 and 2, both LOW. Findings 3 and 4 are deliberately deferred and left unfixed.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `c489fbd` setlist-controller#115 pre-PR review 4 finding 1: Three ways the cue filter could regress with every test green | red under each mutant in a detached scratch worktree at `d627db6` with the new `test/atem.test.ts` copied in: `review-4-mutation-filtered-cue-settles.diff` 1 failed, `review-4-mutation-fire-again-ignores-acts-on.diff` 1 failed, `review-4-mutation-unmeasured-ignores-acts-on.diff` 2 failed; green without them: `pnpm exec vitest run test/atem.test.ts` | 0 | proved by execution |
| 2 (LOW) | `4381750` setlist-controller#115 pre-PR review 4 finding 2: pnpm lateness pointed at a folder or an unreadable file prints a raw stack trace | red→green: `pnpm exec vitest run test/lateness-command.test.ts` (red: 15 stderr lines); `pnpm --silent lateness --log dist; echo $?` prints `Could not read the lateness log at <path>: EISDIR: ...` and `1`; EACCES probed with a `chmod 000` file, same shape | 0 | proved by execution |
| 3 (LOW) | — deferred | — | — | not in the opted-in scope |
| 4 (LOW, comment hygiene) | — deferred | — | — | not in the opted-in scope |

Full checks after both commits: `pnpm lint`, `pnpm typecheck`, `pnpm test` (55 files, 1146 passed, 4 skipped), `pnpm build` green. `pnpm test:e2e` not run (no UI or server change).

### Known regressions, deferred
- None.

### Rework briefs
- None (no verify agents qualified: both fixes LOW, proved by execution, no shared computation core touched).
