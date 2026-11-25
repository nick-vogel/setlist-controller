# Pre-PR review: setlist-controller#115 Cues fire early by a lead time from the tempo (the measurement, #146)

**Branch:** `setlist-controller-115-cue-lead-time` vs `origin/main` (merge-base `f5fb867` "Merge pull request #182 from nick-vogel/setlist-controller-58-planning-center-plan")
**Reviewed at:** HEAD `2faa774` (setlist-controller#146 Measure how late each cue reaches each target), clean tree: 0 files with uncommitted changes, 0 untracked; 17 files total, +783 / -19 against the merge-base
**Reviewed against:** the epic body of setlist-controller#115 (Solution, user stories 1 to 16, Implementation and Testing Decisions), the body and acceptance criteria of #146, the one sub-issue this branch carries (#147 is Nick's decision ticket, with no code; the lead time itself is not built and is out of scope here), and the 16 assumptions the run recorded for #146. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules (load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape) are the conformance checklist. The 20 LOW findings the ticket's own review passes left (F4.1 to F4.22 in the run's ticket review) are known and are not repeated here unless this review found a worse consequence. Round 1, `--fresh`.
**Date:** 2026-10-22
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass (one executed repro and two fix variants by the orchestrator)

This is the first review of the integrated epic branch. #146 was reviewed four times in its lane; this review looks at the merged whole.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green, so the now-required `Connection.lateness` and `TargetReport.actedOn` reach every producer |
| Unit and server suites | `pnpm test` | 52 files, 1079 passed, 4 skipped (the Linux-only setup-screen cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed, no retries; the e2e rig runs the server in-process with no lateness log, and nothing was written to `~/Library/Logs` |
| New tests against `$BASE` | scratch worktree at `f5fb867`, the branch's tests and helpers copied in | all 23 new tests red at base (22 in `test/cue-lateness.test.ts`, 1 in `test/pages.test.ts`) |
| Mutation audit | 20 one-line mutants in a scratch worktree at HEAD, `pnpm exec vitest run test/cue-lateness.test.ts test/pages.test.ts` each | 14 killed. Survived: the `inside` condition in `cueBeat` (`repro/review-1-mutation-brace-no-inside.diff`), the half-bar window widened to a whole bar (`repro/review-1-mutation-due-full-bar.diff`), both `Math.round` calls in the log line, the rotation's `size > 0` guard, and the `acknowledges` check in `actedOn` (equivalent: `handed` is only ever set for an acknowledging target). See finding 3 and Test quality |
| Due time per cue cause | a finder wired the real `startPlaybackController`, `startCues`, `cueBeat` and `manualClock` as `server.ts` does and fed Live events by hand | correct for played-into, End on the next song's first locator (End first, both 250 ms), Play from start while playing and while stopped, a waiting jump made on a bar line, Live's loop and a hand brace across sections, a start from stopped; wrong for a cue raised ahead of the playhead (finding 1) |
| Finding 1 | `repro/review-1-cue-ahead-of-playhead.test.ts`, copied into `test/` of a scratch worktree at HEAD and run | red: `"3/Verse played-into -17875"` |
| Recommended fix 1 | applied in the scratch worktree, then `pnpm exec tsc -p .`, `pnpm exec eslint src/server/playback-controller.ts`, and `pnpm exec vitest run` (the whole unit suite, repro included) | tsc and lint clean; 53 files, 1080 passed, 4 skipped: the repro goes green and nothing else changes. The one-sided alternative (`|| beat - anchor.position > EPSILON`) is also green; see Approach decisions for why it is not the recommendation |
| Log module | a finder ran the real `openLatenessLog` against a temporary folder outside the worktree | a missing folder is created on the first write; rotation never splits a line; a `.1` that is a directory drops every line past the limit; a folder deleted mid-run drops one line, then recovers |
| Delivery unchanged | read `connections.ts` `deliver`, `hand`, `command` against the base | a cue still reaches only armed, online targets, in the same order; Fire again still needs online |
| Pages | read `hub.ts` `encode` and `App.tsx` | the lateness reaches the producer page only; the view-only and leader pages get no connections part |
| Not run | a real target, real Live | no real acknowledgement exists yet (proposal 1 of the run); whether AbletonOSC reports the tempo before or after the position at a song change is unknown (Needs Further Investigation A) |

**Overall:** The measurement does what #146 asked: the lateness per target to the millisecond, the last and the median of 50 on the producer row, the acted-on hook and its second number, and the rotating JSON-lines log, with delivery itself unchanged. The tests behind it are real: every new test is red at base, and no tautology shape was found. Three LOW findings: a cue raised ahead of the playhead logs a large negative lateness, `pnpm dev:server` writes into the same log file the rehearsals fill, and four due-time branches have no test that goes red. There are no MEDIUM or higher findings, so the branch can open its PR as is, with findings 1 to 4 as cheap follow-ups that can also ride along.

## Approach decisions
- The due-time window (finding 1): make the existing half-bar window in `dueAt` symmetric, `Math.abs(anchor.position - beat) >= barLength() / 2 - EPSILON`, rather than refusing every beat ahead of the report. The epic's lead time, if #147 builds it, measures a cue fired before its beat, which is a negative lateness by design (user story 16), so a guard that refuses every beat ahead would silently blank that measurement. Precedent: the half-bar window itself, assumption 16 of #146. Rejected: changing `cues.ts`'s deferred start so it never raises the stale section (pre-existing cue behaviour on the base, outside this epic's scope).
- The dev log (finding 2): the `dev:server` script passes its own `--lateness-log` under the gitignored `dist/`, where the tests already put their logs (`newLogDir` in `test/cue-lateness.test.ts`), so the production default in `main.ts` stays as assumption 5 recorded it, and the launch agent, which runs `node src/server/main.ts` directly (`src/install/launch-agent.ts:33`), is untouched.
- Finding 4's two doc sentences (remediation, 2026-10-22): folded into finding 2's commit, by Nick's close-out decision 3 for the epic run, rather than a commit of their own. Finding 4's third item rode with finding 1, as listed.
- The due-time window's test (remediation rework, 2026-10-22): `dueAt` is pinned by a direct controller test at a report of 15.75 in 4/4 (beats 13.75, 14, 16, 17.5, 17.75, and a report a hair below 16), in the shape of `test/play-from-start-window.test.ts`, because the fake Live reports only exact beats and cannot place a report ahead of a beat.

## Confirmed Issues
### 1. A cue raised ahead of the playhead logs a large negative lateness — LOW
- **Location:** `src/server/playback-controller.ts:609` (`dueAt`), reached through `src/server/cues.ts:170-171` (the deferred start's raise)
- **Attribution:** the negative number is introduced by `338f74a` (setlist-controller#146 Measure how late each cue reaches each target), which added `dueAt`; `git show f5fb867:src/server/playback-controller.ts | grep -n dueAt` finds nothing. Raising the stale section itself is pre-existing, untouched: `git show f5fb867:src/server/cues.ts | grep -n -A2 'const start = waiting && startAt'` shows the same raise on the base.
- **Real-world trigger:** Live is stopped mid-set; the leader presses Play from start for one song and then, before Live reports anything (tens of milliseconds), Play from start for another; Live reports the start before the playhead's jump. The cues module then raises the section Live was stopped in, from a report where the playhead is already elsewhere. The row shows "Late -17875 ms" and the log gets the line. The median of 50 barely moves, and the number is visibly absurd, so this is LOW: upgrade to MEDIUM if any rehearsal log shows a negative lateness, check via `grep -c '"lateMs":-' ~/Library/Logs/setlist-controller/cue-lateness.log`.

**Evidence**
```ts
dueAt(beat) {
  if (!anchor || anchor.position - beat >= barLength() / 2 - EPSILON) return null;
  return anchor.at + ((beat - anchor.position) * 60_000) / tempo;
},
```
The window only refuses a report half a bar or more *past* the beat. A beat ahead of the report gives a due time in the future with no bound.

**Failure mode** — stopped at song 3's Verse (beat 100); Play from start 2, Play from start 1; Live reports playing, then position 64.25. Output: `3/Verse played-into` measured at -17875 ms (35.75 beats ahead at 500 ms a beat). Executed: `repro/review-1-cue-ahead-of-playhead.test.ts`, red.

**Recommended fix**
```diff
-      if (!anchor || anchor.position - beat >= barLength() / 2 - EPSILON) return null;
+      if (!anchor || Math.abs(anchor.position - beat) >= barLength() / 2 - EPSILON) return null;
```
Then add the repro's case to `test/cue-lateness.test.ts` as a regular test (it drives the controller directly because the fake Live cannot report a start before the jump it was sent with; `test/play-from-start-window.test.ts` is the in-repo precedent for a direct controller test), and change the interface comment at `src/server/playback-controller.ts:25-29` from "half a bar or more past the beat" to "half a bar or more from the beat, either side".

**Remediation brief**
- **Design intent:** `dueAt` turns the last report of the playhead (its position and clock time, the `anchor`) into the clock time a beat was due, at Live's current tempo. It only answers for a beat the report is close to: a report far from the beat means the playhead never played across it (a drag), so the cue goes unmeasured rather than measured wrong. The window is half a bar, and after the fix it holds on both sides of the beat. A small negative lateness inside the window stays possible on purpose, for the lead time #147 may build.
- **Full surface:** `src/server/playback-controller.ts:609` (the condition); `src/server/playback-controller.ts:25-29` (the interface comment); `src/server/playback-controller.ts:606-608` (the inline comment, which speaks of "a report a whole bar past" and stays true); `test/cue-lateness.test.ts` (the new test). `src/server/server.ts:173-177` (`dueOf`) calls `dueAt` and needs no change.
- **Must preserve:** a report within EPSILON below a locator (float32 noise) is still measured; the half-bar refusal past the beat (`test/cue-lateness.test.ts` "leaves a drag to the second bar of a section unmeasured" and "leaves a cue the playhead was dragged to mid-section unmeasured"); a start from stopped measured from the start (`counts a start from stopped from the start`, 0 and 125 ms); every other test in `test/cue-lateness.test.ts`, `test/cue-causes.test.ts` and `test/play-from-start-window.test.ts`. The whole unit suite was run green with this exact diff.
- **Do not touch:** the deferred start's raise in `src/server/cues.ts:170-171` (pre-existing cue behaviour, out of scope; see Approach decisions). The `inside` and `reached` conditions in `cueBeat` (Reviewed and Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-115/repro/review-1-cue-ahead-of-playhead.test.ts test/ && pnpm exec vitest run test/review-1-cue-ahead-of-playhead.test.ts` is red now and green after; then delete the copy and move the case into `test/cue-lateness.test.ts`.

### 2. `pnpm dev:server` writes into the same lateness log the rehearsals fill — LOW
- **Location:** `src/server/main.ts:20` and `:29`, with `package.json:11` (`"dev:server": "node src/server/main.ts"`)
- **Attribution:** introduced by `338f74a` (setlist-controller#146 Measure how late each cue reaches each target), which added `LATENESS_LOG` as the default of `--lateness-log`; the base has no lateness log.
- **Real-world trigger:** Nick develops a target adapter (the ProPresenter, Eos and ATEM epics run beside this one) on the Mac that runs the launch agent, with `pnpm dev:server` and the fake Live, and arms the real target. Every cue from that session lands in `~/Library/Logs/setlist-controller/cue-lateness.log`, the file #147 decides from, as lines with the same target names and no mark of where they came from; only the `time` and the fake Live's demo titles tell them apart. With the README's beside-Live ports, two processes append to and rotate the same file, each with its own size count. LOW: the lines can be filtered by time by hand. Upgrade to MEDIUM if the log summary (the run's proposal 3) is built to read the whole file, or if Nick confirms dev sessions run on the rehearsal Mac with an armed target.

**Evidence**
```ts
const LATENESS_LOG = join(homedir(), 'Library', 'Logs', 'setlist-controller', 'cue-lateness.log');
// ...
    'lateness-log': { type: 'string', default: LATENESS_LOG },
```
`package.json:11` and `:18` both run `node src/server/main.ts` with no override, and the README's dev section (`README.md:24-27`, `:51-55`) names `--pedal-config` and `--connections-config` but not `--lateness-log`.

**Failure mode** — dev session with an armed target → lines appended to the production log, indistinguishable by field from rehearsal lines. Not executed (running `dev:server` would write outside the worktree); proved by reading the two scripts and the default.

**Recommended fix**
```diff
-    "dev:server": "node src/server/main.ts",
+    "dev:server": "node src/server/main.ts --lateness-log dist/dev-cue-lateness.log",
```
And one sentence in the README's dev section, after step 2: the dev server writes its lateness log to `dist/dev-cue-lateness.log`, not to the installed server's log, and `--lateness-log <path>` sends it elsewhere.

**Remediation brief**
- **Design intent:** the installed server, started by the launch agent as `node src/server/main.ts` (`src/install/launch-agent.ts:33`), keeps the production default so the measurement is always on there (assumption 5 and 10 of #146). Only the developer script gets a separate file, under the gitignored `dist/`, where the tests' own logs already go.
- **Full surface:** `package.json:11`; `README.md` dev section (step 2 at `:20-27`, and the beside-Live block at `:51-55`, which inherits the script). `pnpm start` (`package.json:18`) is left as is.
- **Must preserve:** an explicit `pnpm dev:server --lateness-log <path>` still wins: Node's `parseArgs` takes the last value of a repeated string option (checked: `--x a --x b` gives `b`). `pnpm build` empties only `dist/web` (`vite.config.ts:12-13`), so the dev log survives a build. `test/readme.test.ts` pins nothing about the lateness log.
- **Do not touch:** `LATENESS_LOG` in `src/server/main.ts:20` and the launch agent.
- **Proof:** `pnpm lint && pnpm typecheck && pnpm test` green, and `node -e "console.log(require('./package.json').scripts['dev:server'])"` prints the new flag. There is no runnable red for this one without starting the server, which the guardrails forbid on the production ports.

### 3. Four due-time branches have no test that goes red — LOW
- **Location:** `test/cue-lateness.test.ts` (the `describe` blocks at `:120`, `:270`); the code they leave unguarded: `src/server/cues.ts:211` (`inside`), `src/server/playback-controller.ts:609` (the half-bar width), `src/server/cues.ts:85-90`, `:93-104` and `:108-119` (the play-from-start cause), `src/server/cues.ts:130` (End on the next song's first locator)
- **Attribution:** introduced by `338f74a` and its review-pass commits (`91a5d69`, `4b68bf1`, `cdc3a81`, `d024566`), which added these branches with the tests that leave them open.
- **Real-world trigger:** none for users today; the finder's harness shows each branch gives the right number now. A later change to any of them (the lead time ticket will touch `dueAt`) goes unnoticed.

**Evidence** — mutants that survive the whole new suite: dropping `inside` from `cueBeat` (`repro/review-1-mutation-brace-no-inside.diff`; a brace from 8 to 40 and a drag back from 36 to 17 reads 500 ms at HEAD and unmeasured under the mutant), and widening the window from half a bar to a whole bar (`repro/review-1-mutation-due-full-bar.diff`; every unmeasured case in the tests sits exactly one bar past, at `:300-303` and in the `{ to: 20, late: null }` case). No test measures a `play-from-start` cue or the End cue that shares its beat with the next song's first section.

**Recommended fix** — add to `test/cue-lateness.test.ts`, with the rig and helpers already there:
- a hand brace from 8, length 32 (starting in the Intro, before the Verse), then a drag back from 36 to 17: the Verse's `loop` cue reads 500 ms, measured against the Verse's start, not the brace's;
- in 4/4, a drag from the Intro forward to 18 (half a bar past the Verse) leaves the Verse unmeasured, and one to 17.5 reads 750 ms;
- Play from start of the song while it plays in the Chorus: the `play-from-start` cue, landing on the bar line, reads the half beat the report comes after it;
- a two-song set whose first song's End sits on the second song's first locator, played across: both cues read the same lateness, End first.

**Remediation brief**
- **Design intent:** `cueBeat` names the beat a cue belongs to (its section's start, the song's End, or for a loop wrap the brace's start when a brace set by hand starts inside the section and the playhead reached it); `dueAt` turns it into a due time within half a bar of the report. Each branch is a decision #146 took over its review passes, and each needs a test that fails when it is reversed.
- **Full surface:** `test/cue-lateness.test.ts` only. The fake Live sets a brace with `setLoop` and a signature with the `signature` option, as the existing tests at `:170-220` and `:300` do.
- **Must preserve:** every existing test in the file; no test writes outside `dist/` (use `newLogDir`).
- **Do not touch:** the source; this finding adds tests only.
- **Proof:** each new test goes red under its mutant: `git apply docs/reviews/setlist-controller-115/repro/review-1-mutation-brace-no-inside.diff && pnpm exec vitest run test/cue-lateness.test.ts` (red), `git apply -R` the same diff (green); the same with `review-1-mutation-due-full-bar.diff`. Apply finding 1's fix first if both are remediated, since the full-bar diff's context line is the one finding 1 changes; regenerate the mutant by hand if `git apply` refuses.

### 4. Comment hygiene — LOW (aggregated)
- `docs/install.md:86` — "Each cue handed to a target is one JSON line" → "Each measured cue handed to a target is one JSON line; a cue whose beat time is not known, such as one Live reached by a drag or before its first report of the playhead, and Fire again, has none"
- `README.md:47` — "Once a cue has reached a target, its row shows how late the cues reach it" → "Once a measured cue has reached a target, its row shows how late the cues reach it"
- `src/server/playback-controller.ts:25-29` — covered by finding 1's fix, listed there.

## Needs Further Investigation
### A. A cue at a song change may be converted at the old tempo — confirm with an OSC trace
The beats between the beat and the report are converted at the tempo current when the cue is measured (`src/server/playback-controller.ts:610`). If AbletonOSC reports a new song's tempo after the position report that crosses its first locator, the stretch already played at the new tempo is converted at the old one: 120 to 60 BPM at the locator, report half a beat late, reads 250 ms where the truth is 500 ms (executed in the finder's harness). The error is small for a report soon after the beat but systematic at every song change with a tempo change. Confirm or kill: capture an OSC trace of a song change in a set with two tempos and check whether `/live/song/get/tempo` arrives before `/live/song/get/current_song_time`. If it arrives after, record it as a known limit on #147 (the epic already puts a tempo change at a boundary out of scope for the lead time).

## Reviewed and Dismissed
- `hand()` runs the record, the log write and `onChange()` before `target.cue`, so a throw there would skip delivery — no throw path exists: `encode` is `JSON.stringify` of plain data, a ws send to a closing socket does not throw, and `write` only chains promises. The per-target publish before the cue is the known LOW F4.6.
- A late acknowledgement pairing with a newer cue — `cueFor` builds a new object for every cue (`src/server/cues.ts:219`), and `actedOn` matches by identity, so it cannot.
- The `acknowledges` check in `actedOn` survives its mutant — equivalent: `handed` is only ever set for an acknowledging target (`src/server/connections.ts:200`). Leave it; it states the rule at the point of use.
- The lateness leaking to the view-only or leader pages — `hub.ts` `encode` gives them no connections part.
- "Late -12 ms" for a negative value on the row — after finding 1, a negative value is only possible within half a bar ahead, which no observed cue reaches today, and the lead time will want it signed.
- The `inside` and `reached` conditions in `cueBeat` — correct for every brace case traced (a brace inside the section, across sections, starting before it, a drag short of the brace start); finding 3 adds the missing test, not a change.
- Snapshot staleness in `dueOf` — the anchor is set before `onChange` in both the position and the playing branches, and the cue is raised and measured synchronously inside that `onChange`, so no Live event comes between.
- The shutdown order in `server.ts` (`connections.stop()` before `log.close()`) — right: stopping settles the waiting lines first.

## Minor / nits
- A position report during shutdown, between `connections.stop()` and `live.close()`, can still raise a cue: a non-acknowledging target's line is written after `log.close()` resolved, and an acknowledging target's waiting line is lost (`src/server/server.ts:247-254`). One line at most, at a launchd bootout mid-playback.
- A rename that keeps failing at rotation (for example `cue-lateness.log.1` made a directory) drops every later line with one error each (`src/server/lateness-log.ts:54-56`); reproduced by a finder. A file truncated or deleted from outside while the server runs leaves the size count stale and rotates early; a deleted log folder costs one line; a partial append (disk full) can glue two lines together.
- A start from stopped a quarter beat past a downbeat, after a stopped move of less than a beat, is measured 125 ms late though Live never crossed the beat (`test/cue-lateness.test.ts:139-147` pins it). It follows the `PLAYED_ON` heuristic in `cues.ts:41`, and the test's comment says so.
- `EPSILON` (1e-4) is finer than float32's step above beat 2048, so `reached` in `cueBeat` could miss a report a step below a brace start late in a long set. Same convention across the codebase, pre-existing, not reproduced.
- Two absence assertions can pass before a queued log write lands: `test/cue-lateness.test.ts:218` (the `{ to: 20, late: null }` case) and `:444`.

## Test quality
Tests added: 23 (22 in `test/cue-lateness.test.ts`, 1 in `test/pages.test.ts`) · green against `$BASE`: 0 · tautology shapes found: 0 (no own-expectation, mocked unit, call-shape-only, unread snapshot, assertion-free or prose test; every expected value is a literal). Mutation: 14 of 20 killed. The survivors are finding 3 (`inside`, the half-bar width), the two log roundings and the rotation's `size > 0` guard (the known LOWs F4.13 and F4.14), and one equivalent mutant (dismissed above). Nothing to delete.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `2faa774`; Playwright green locally.
- **Commit hygiene:** the branch carries #146's commits and its merge from the lane; this doc and `repro/` are the only additions.
- **Likely reviewer asks:** where the log goes in development (finding 2); what a negative number on the row means (finding 1); a sample of the log line (in `docs/install.md`, section 4).

## Verdict
Ready to open the PR as is, with follow-ups. No finding is MEDIUM or higher. Findings 1 to 4 are LOW: finding 1 (a one-line guard with its test) and finding 2 (a one-line script change) are cheap enough to ride along before the PR; finding 3 (four tests) and finding 4 (two doc sentences) can ride along or become a follow-up. Needs Further Investigation A waits for a real OSC trace and belongs on #147's reading of the log.

## Remediation — 2026-10-22
Scope: Nick's close-out decision 3 for the epic run opted in findings 1, 2 and 4 (all LOW); finding 3 and every other item were left unfixed on purpose.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `99819d7` setlist-controller#115 pre-PR review 1 finding 1: A cue raised ahead of the playhead logs a large negative lateness | red→green: the repro copied to `test/` and run with `pnpm exec vitest run test/review-1-cue-ahead-of-playhead.test.ts` (red, `"3/Verse played-into -17875"`), then the case moved into `test/cue-lateness.test.ts`, red on the old condition and green on the fix; `test/cue-lateness.test.ts`, `test/cue-causes.test.ts`, `test/play-from-start-window.test.ts` green | 4 in the test (why the test drives the controller directly, and the press order it reproduces); the interface comment reworded per the brief | fixed, with two LOW test gaps and a comment nit, reworked below |
| 1 rework | `d5ea1c7` setlist-controller#115 pre-PR review 1 finding 1 rework: Pin the due-time window on both sides of the beat | a direct `dueAt` test red under the asymmetric guard (`beat > anchor.position \|\| ...`) and under the old one-sided condition, green at HEAD | 0 new; the interface comment reworded | fixed (scoped re-verify) |
| 1 rework follow-up | `d6a650c` setlist-controller#115 pre-PR review 1 finding 1 rework follow-up: Say short of the beat, not ahead of it, in the due-time comment | comment only, one token from the scoped re-verify | 0 | one-token follow-up, applied as specified |
| 2 (LOW) | `e4bd2cc` setlist-controller#115 pre-PR review 1 findings 2 and 4: pnpm dev:server writes into the lateness log the rehearsals fill | the brief's proof: `node -e "console.log(require('./package.json').scripts['dev:server'])"` prints the new flag; `parseArgs` keeps the last of a repeated `--lateness-log`; full checks green. No runnable red (starting the server is forbidden) | 0 | fixed |
| 4 (LOW, aggregated) | `e4bd2cc` (folded into finding 2, by Nick's decision) | read against `connections.ts` (a line only when the due time is known; Fire again hands none) | 0 | half-fixed: the "before its first report" example names a cue never raised, and "a drag" is too broad; reworked below |
| 4 rework | `cc34410` setlist-controller#115 pre-PR review 1 finding 4 rework: Name only cues that really go unmeasured in the lateness log section | read against `cues.ts` `moved`/`cueBeat`, `server.ts` `dueOf`, `connections.ts` `hand` | 0 | fixed (scoped re-verify) |
| 3 (LOW) | — not worked | — | — | out of scope by Nick's close-out decision; left open |

Full checks after the last commit: `pnpm typecheck`, `pnpm lint`, `pnpm test` (52 files, 1081 passed, 4 skipped), `pnpm build`, `pnpm test:e2e` (44 passed), all green.

Note: `d5ea1c7`'s commit message describes the tested beats loosely ("a quarter and three and three-quarter beats either side"); the test itself checks 13.75, 14, 16, 17.5 and 17.75 against a report at 15.75, as the Approach decisions line records.

### Known regressions, deferred
- None introduced. LOW notes from the verify passes, left as they are: a hard-coded half bar of 2 beats in `dueAt` would survive the new test, which runs in 4/4 only (finding 3's 3/4 case would cover it); the inline comment in `dueAt` (`src/server/playback-controller.ts:607-608`) still explains only the past side; a drag into a section that starts off a bar line, less than half a bar from its start, is measured, which the install doc's "such as" does not exclude; a relative `--lateness-log` given to `pnpm dev:server` resolves against the package root, not the shell's folder (pre-existing).

### Rework briefs
- Finding 1: achieve a test that pins the `dueAt` window on both sides (a report within EPSILON below a locator measured, a beat under half a bar either side measured, half a bar either side refused) and a comment giving the right reason on each side; preserve the fix line and the ahead-of-playhead test; proof: red under the asymmetric guard and the old one-sided condition, green at HEAD.
- Finding 4: achieve an install doc sentence naming only cues that really go unmeasured; preserve the rest of section 4 and the README wording; proof: read against `cues.ts` (no cue while the position is unknown), `dueAt` (a drag onto a section start is measured) and `connections.ts` (Fire again hands no due time).
