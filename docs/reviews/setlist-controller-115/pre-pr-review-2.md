# Pre-PR review: setlist-controller#115 Cues fire early by a lead time from the tempo (the measurement, #146), round 2

**Branch:** `setlist-controller-115-cue-lead-time` vs `origin/main` (merge-base `f5fb867` "Merge pull request #182 from nick-vogel/setlist-controller-58-planning-center-plan")
**Reviewed at:** HEAD `4131597` (setlist-controller#115 pre-PR review 1 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 22 files total, +1150 / -20 against the merge-base (5 of them review docs and repros)
**Delta under review:** since `2faa774` (setlist-controller#146 Measure how late each cue reaches each target), the HEAD that `pre-pr-review-1.md` reviewed: 5 code and doc files (`src/server/playback-controller.ts`, `test/cue-lateness.test.ts`, `package.json`, `README.md`, `docs/install.md`), +103 / -7, from the remediation commits `99819d7`, `e4bd2cc`, `d5ea1c7`, `cc34410`, `d6a650c`
**Reviewed against:** `pre-pr-review-1.md` (findings 1 to 4, its Approach decisions, its closure table and Known regressions, deferred), the #146 requirements as round 1 distilled them, and the epic run's close-out decision 3 (fix S1, S2 and S4; leave S3). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, already up to date |
| Lint | `pnpm lint` | green, the review's `repro/` files included |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 52 files, 1081 passed, 4 skipped (the Linux-only setup-screen cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| New tests against the last reviewed commit | scratch worktree at `2faa774`, the HEAD `test/cue-lateness.test.ts` copied in, the two new tests run | both red: `'3/Verse played-into -17875'` where `null` is expected, and `[null, -875, 125, 875, 1000]` where the last is expected `null` |
| Mutants of the window | scratch worktree at HEAD; the finder ran five more | the whole-bar window (`>= barLength() - EPSILON`, round 1's `review-1-mutation-due-full-bar.diff` regenerated, since the old diff no longer applies) is now killed by the window test; no EPSILON, short side only, and `>= 1` are killed; a hard-coded half bar of `2` survives (4/4 only, known and deferred in round 1) |
| Round 1's brace mutant | `git apply docs/reviews/setlist-controller-115/repro/review-1-mutation-brace-no-inside.diff` in a scratch worktree at HEAD, `pnpm exec vitest run test/cue-lateness.test.ts` | survives, 24 passed: finding 3's `inside` half is still open, as decided |
| Every cue path against the symmetric window | the finder drove the real `startPlaybackController`, `startCues` and `cueBeat` with a manual clock, wired as `server.ts` wires them, no sockets | start from stopped 0 ms, start from rest 100, Play from start while stopped 0 (jump first) and 25 (start first), End on the next song's Count Off locator 50 and 50, a waiting jump 25, Play from start while playing 25, the round 1 repro `3/Verse` null then `2/Count Off` 125. No real path raises a cue with the report short of its beat by a measurable amount; only the deferred start's stale raise does, and that is the case the fix refuses |
| The dev log path | read `package.json:11`, `vite.config.ts` (`emptyOutDir` on `dist/web` only), `lateness-log.ts:45` (`mkdir` recursive), `.gitignore`; Node's `parseArgs` run with a repeated `--lateness-log` | the dev log lands in the gitignored `dist/`, survives a build, a fresh clone works, and an explicit flag wins (`'b'`); the production default (`main.ts:20`) and the launch agent (`launch-agent.ts:33`) are untouched |
| Not run | a real target, real Live | as round 1: no real acknowledgement exists yet, and whether Live lands a drag off a bar line is unverified |

**Overall:** The remediation holds. Finding 1's symmetric window refuses the stale raise and drops no real measurement, with two tests that go red on the old condition. Finding 2 sends the dev server's log into `dist/` and leaves the installed server's log alone. Finding 4 is half done: two sentences now say "measured", but three phrases around them still overclaim, and they make up this round's one LOW finding. Nothing is MEDIUM or higher, so the branch can open its PR as is.

## Approach decisions
- The due-time window (finding 1, round 1): the half-bar window in `dueAt` is symmetric, `Math.abs(anchor.position - beat) >= barLength() / 2 - EPSILON`, so a small negative lateness stays possible for the lead time #147 may build. Carried forward unchanged.
- The dev log (finding 2, round 1): the `dev:server` script passes `--lateness-log dist/dev-cue-lateness.log`; the production default and the launch agent stay as they are. Carried forward unchanged.
- Finding 4's doc wording (round 1): it rode with finding 2's commit, per close-out decision 3. This round's comment hygiene is the rest of that wording, one batch commit.
- The due-time window's test (round 1 rework): `dueAt` is pinned by a direct controller test, because the fake Live reports only exact beats. Carried forward unchanged.

## Confirmed Issues
### 1. Comment hygiene — LOW (aggregated)
Attribution: the README and install doc phrases are from `338f74a` (setlist-controller#146 Measure how late each cue reaches each target) and `cc34410` (the finding 4 rework), and the inline comment is unchanged from `338f74a`. The `dueAt` inline comment is a **known regression, deferred**: round 1's Known regressions, deferred names it ("the inline comment in `dueAt` (`src/server/playback-controller.ts:607-608`) still explains only the past side"). The drag example's overclaim is also named there ("a drag into a section that starts off a bar line, less than half a bar from its start, is measured, which the install doc's 'such as' does not exclude"). The other two entries are what finding 4's fix left: partially fixed.

- `src/server/playback-controller.ts:607-608` — "A listener report comes well within half a bar of the playhead crossing a beat, at any tempo a song is played at. Live snaps a drag to a bar line, so a report a whole bar past is a drag." → "A listener report comes well within half a bar of the playhead crossing a beat, at any tempo a song is played at. Live snaps a drag to a bar line, so a report a whole bar past is a drag. A beat half a bar or more ahead of the report was raised from a start the playhead left; a lead time fires well inside half a bar."
- `docs/install.md:86` — "The server also measures how late each cue reaches each connection target" → "The server also measures how late each cue reaches each connection target, when the cue's due time is known"
- `docs/install.md:86` — "a cue whose beat time is not known, such as one Live reached by a drag into the middle of a section, and Fire again, has none" → "a cue whose due time is not known, such as one Live reached by a drag a bar or more into a section, and Fire again, has none" (a drag under half a bar past a section start, including onto the bar line after a pickup locator, is measured: the finder's probe of a Verse at beat 15 and a drag to 16 read 500 ms, by assumption 16 of #146)
- `README.md:49` — "as \"Late 250 ms, median 240 ms\" for the last cue and the median of the last 50" → "as \"Late 250 ms, median 240 ms\" for the last measured cue and the median of the last 50 measured" (`connections.ts:196` records only when the due time is known, so the row keeps an earlier number after an unmeasured cue or Fire again)

## Needs Further Investigation
### A. A cue at a song change may be converted at the old tempo — confirm with an OSC trace
Carried forward from round 1 unchanged: capture an OSC trace of a song change in a set with two tempos and check whether `/live/song/get/tempo` arrives before `/live/song/get/current_song_time`.

## Reviewed and Dismissed
- The symmetric window drops a real measurement — no: every cue path probed (start from stopped, from rest, Play from start stopped and playing, a waiting jump, End on the next song's locator) raises its cue with the report at or just past its beat. `startAt` needs the report to contain the position, `endReached` needs `to >= end - EPSILON`, and `cueBeat` takes a brace start only when the playhead reached it.
- The signature at the report rather than at the beat across a song change — the gap at a normal crossing is one report interval (0.1 beats in the probe), far inside half a bar in any signature.
- The ahead-of-playhead test re-implements `dueOf` inline rather than going through `server.ts:173` — the fake Live cannot report a start before its jump, the test says so, and it follows round 1's Approach decision. Keep it.
- `pnpm start` and the launch agent still write to the production log — by intent (round 1, finding 2's Design intent).

## Minor / nits
- The deferred start still hands targets the stale section's cue (`3/Verse played-into`, now unmeasured) in the round 1 scenario, then the right one. Pre-existing cue behaviour on the base; round 1's Approach decisions rejected changing it in this epic. Follow-up material only.
- The short side of the window caps a future lead time at half a bar: about 321 ms in 3/8 at 140 BPM, 333 ms in 2/4 at 180 BPM. A lead time past that leaves every cue in such a song unmeasured (null, not wrong). Worth a line on #147, no change now.
- A relative `--lateness-log` resolves against the package root under pnpm, as `--pedal-config` and `--connections-config` do; `src/set-builder/main.ts:131` resolves against `INIT_CWD` instead. Pre-existing, named in round 1's deferred list.
- `review-1-mutation-due-full-bar.diff` no longer applies at HEAD, since finding 1 changed its context line. The mutant it described is now killed by the window test, so the diff has served its purpose.

## Test quality
Tests added in the delta: 2 (`test/cue-lateness.test.ts` "leaves a cue raised ahead of the playhead unmeasured, never negative" and "gives a due time for a beat within half a bar of the report, either side, and none further") · green against `2faa774`: 0 · tautology shapes found: 0 (expected values are literals; the controller and cues are real, not mocked). Mutation: the whole-bar, no-EPSILON, short-side-only and `>= 1` mutants are killed; a hard-coded half bar of `2` survives because both tests run in 4/4 (known, deferred in round 1, and covered by finding 3's 3/4 case if that is ever worked). Nothing to delete.

## Prior-review closure
| Round 1 finding | Status | Note |
| --- | --- | --- |
| 1. A cue raised ahead of the playhead logs a large negative lateness (LOW) | fixed | the window is symmetric; both new tests red on the old condition; no real path loses its measurement |
| 2. `pnpm dev:server` writes into the production lateness log (LOW) | fixed | `package.json:11` and the README dev sentence; production untouched |
| 3. Four due-time branches have no test that goes red (LOW) | partially fixed | the half-bar width is now pinned (the whole-bar mutant is killed by the window test); the `inside` condition, the play-from-start cause, End on the next song's first locator, and a non-4/4 width are still open. Left on purpose: close-out decision 3 ("S3 ... Do not file it") |
| 4. Comment hygiene (LOW) | partially fixed | "Each measured cue" and "Once a measured cue" landed; the rest is this round's finding 1 |

Fully fixed 2, partially fixed 2, untouched 0. No round 1 finding was MEDIUM or higher, so nothing at that level stays open.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `4131597`; Playwright green locally.
- **Commit hygiene:** this doc is the only addition; the tree was clean before and after the review.
- **Likely reviewer asks:** why a cue half a bar ahead goes unmeasured (finding 1's comment entry answers it); where the dev log goes (the README sentence).

## Verdict
Ready to open the PR as is. No finding is MEDIUM or higher. The one finding is LOW comment hygiene, four phrase edits in one commit, which can ride along or be dropped. The confirmed count fell from 4 to 1, and what remains is doc wording, so the branch has converged; another round would be scraping the barrel.
