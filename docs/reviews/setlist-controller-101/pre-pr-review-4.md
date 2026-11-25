# Pre-PR review: setlist-controller#101 Rehearsal: count-off into a section (re-review after review 3's remediation)

**Branch:** `setlist-controller-101-count-off-into-section` vs `origin/main` (merge-base `6cf5454` "Merge pull request #238 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `20800ca` (setlist-controller#101 pre-PR review 3 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 13 files total against the merge-base, +1089 / -78 (review docs and repros included)
**Delta under review:** since `29423a0` (setlist-controller#235 A count-in drops or sticks when one message to or from Live is lost or late), the HEAD `pre-pr-review-3.md` reviewed. 5 files, +547 / -7, of which the code is 2 files, +66 / -7: `src/server/playback-controller.ts` and `test/count-in.test.ts`, from `aefd03f` (setlist-controller#101 pre-PR review 3 finding 1: A count-in whose Count Off was reached is held through any report, so a playhead moved away is dragged back to the target). The rest is review 3's doc, its two repro files, and its closure table (`d8876e8`, `20800ca`).
**Reviewed against:** review 3 finding 1's intent and brief, its Approach decisions and Remediation section, and its Needs Further Investigation A to C. The epic body of setlist-controller#101 and the bodies of #235, #236 and #237 were the requirements for review 3 and are unchanged; the delta touches only #235's count-in loss rules. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-23
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | pass at `20800ca`; the two review-4 files under `repro/` are `.diff` files, which `eslint .` does not read |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 67 files, 1494 passed, 4 skipped |
| Build and Playwright | `pnpm test:e2e` (builds first) | 50 passed, WebKit iPad and Chromium Android |
| New tests against `29423a0` | HEAD's `test/count-in.test.ts` copied into a scratch worktree at `29423a0`, `-t 'is never sent once the playhead'` | both red |
| New tests against `6cf5454` (tautology oracle) | the same, at the merge-base | both green, by design: the defect they pin came in on this branch after the merge-base (`fbbe19a`), and `aefd03f`, which added them, fixed review 3 finding 1. Kept |
| Review 3 repro at HEAD | `repro/review-3-count-in-held-reports.test.ts` copied into `test/` of a scratch worktree at `20800ca` | 3 passed (finding 1's two rows, finding 3's "at 16" control), 3 failed (findings 2 and 3, deferred LOW), as the closure table says |
| Mutation of the new `sendCountIn` bound | `repro/review-4-mutant-send-bound.diff` applied in a scratch worktree, `pnpm exec vitest run test/count-in.test.ts test/count-in-change.test.ts test/count-in-cues.test.ts test/jump.test.ts` | 102 passed: the bound is unpinned (finding 1). The finder ran the full suite on it too: 1494 passed |
| Mutation of the new `countOffLost` upper bound | `repro/review-4-mutant-lost-bound.diff` (one bar widened to four), the same four files | 102 passed: unpinned (finding 1) |
| Further mutations (finder) | lower bound `time - EPSILON` to `time - barLength()`; `!inTarget(after) &&` dropped; the reached `!playing` guard dropped | all pass the three count-in test files (67); the `!playing` one passes the full suite |
| Stale-position retarget (review 3 NFI A) | finder's scratch rig test: Live stopped at 48, `loseNext(JUMP)`, Count in to the Bridge, a Verse tap between the start report and the first position report | HEAD sends no target jump; `29423a0` sends the Verse jump from the stale 48. NFI A is closed by the new bound |
| Delta reading | ordering in the `'position'` handler (`:570-591`), bound agreement, `end === null`, retargets | no defect (see Reviewed and Dismissed) |
| Em-dashes in shipped copy | `git diff 29423a0 -- src web` | none |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #217 is Nick's run on real Live |

All scratch worktrees were removed after the runs.

**Overall:** Review 3's one MEDIUM is fixed. With a reached Count Off, a report while Live plays now keeps the count-in only inside the Count Off, in the bar after it, or in the target; a playhead moved anywhere else ends it with no jump. The two new tests are red at `29423a0` and green at HEAD, and every full check passes. The one new finding is LOW: the remediation's two new bounds can each be loosened or dropped with every test still green, and the `sendCountIn` bound is the only thing that now closes review 3's NFI A. Two short tests pin both. Nothing gates the PR.

## Approach decisions
- **What proves a count-in's Count Off jump lost (#235 case 1, carried forward):** only a report while Live plays. A report while stopped is a tap's report on its way. `countIn.reached` records that a report put the playhead inside the Count Off. Precedent: `lost()`'s "a report outside the target past that bar line is proof".
- **Bounding a reached count-in (review 3 finding 1, applied in `aefd03f`, carried forward):** `countOffLost` keeps a reached count-in only inside `[Count Off start, Count Off end + one bar)` or in the target, with the `!countIn.reached` branch ahead of the target exclusion, and `sendCountIn` sends only inside `[Count Off end - one bar, Count Off end + one bar)`. Precedent: `lost()`'s one-bar allowance past `barLine`.
- **Pinning that window (finding 1, new):** one boundary test per bound, in `test/count-in.test.ts`'s describe "the jump to the target", each red under its mutation diff in `repro/`. Precedent: the late-send test "is sent on the first report past the Count Off when none came in its last bar…" in the same describe, whose fixture and helpers they reuse.
- **An unsent count-in's landing (review 3 finding 2, deferred):** while the count-in's own jump has not been sent, the only landing is playback, with Live playing, from a reached Count Off into the target. Precedent: `countOffLost`'s own `playing` rule.
- **Seeding `reached` (review 3 finding 3, deferred):** a press with Live already stopped on the Count Off's start beat starts with `reached` true. Precedent: `jumpTo`'s "already there" check.
- **One copy of the count-in landing rule (review 3 finding 4, deferred):** the server's `landsOn` calls `countInLandsOn` from `src/shared/count-in.ts`.
- **Late jumps keep every old target they replaced on the same bar line (#236, carried forward):** module-level `replaced: { barLine, starts[] }`, for every jump.
- **A change during the count while a lost Stop waits is sent (#235 case 3, carried forward):** the count-in's own first jump never goes while a stop waits; a change to a jump already sent goes.
- **Stop with a count-in held on a stopped Live (#235 case 4, carried forward):** the start-wait timer is replaced by one of `LOOP_REPORT_MS`, so that a start report on its way is not taken for a stopped Live.

## Confirmed Issues

### 1. The two bounds the fix added can each be loosened or dropped, and every test still passes — LOW
- **Location:** `src/server/playback-controller.ts:288` (`countOffLost`'s reached return) and `:467` (`sendCountIn`'s upper bound)
- **Attribution:** introduced by `aefd03f`, the review 3 remediation. Both lines are its hunks (`git diff 29423a0 -- src/server/playback-controller.ts`). It is a coverage gap in the fix, not a behaviour defect: HEAD behaves as review 3's brief intended.
- **Real-world trigger:** none today; the code is right. The risk is a later edit that widens or drops a bound with no test going red, which brings back review 3 finding 1 (Live dragged back to the target) for a playhead moved a little past the Count Off, or review 3 NFI A (a tap right after a lost Count Off jump sends the target jump at once, cutting the count). LOW, capped: no user path to a wrong result at HEAD.

**Evidence**
```ts
// :285-288, countOffLost
if (!playing) return false;
if (!countIn.reached) return true;
return !inTarget(after) && (after < time - EPSILON || (end !== null && after >= end + barLength() - EPSILON));
// :464-468, sendCountIn
if (end === null || position < end - barLength() - EPSILON || position >= end + barLength() - EPSILON) return;
```

**Failure mode**
- The two new tests move the playhead far from the window (to 72, and from 26 back to 2), so neither edge is tested. Widening `countOffLost`'s upper bound from one bar to four (`repro/review-4-mutant-lost-bound.diff`) passes `test/count-in.test.ts`, `test/count-in-change.test.ts`, `test/count-in-cues.test.ts` and `test/jump.test.ts` (102 tests).
- `sendCountIn`'s upper bound is shadowed in both new tests: `countOffLost` clears the count-in on the same report before `sendCountIn` runs. Dropping it (`repro/review-4-mutant-send-bound.diff`) passes the same 102, and the finder ran the full suite on it (1494 passed). Yet it is reachable on its own: after a lost Count Off jump, a tap between Live's start report and its first position report runs `retarget`, then `sendCountIn`, with `position` still where Live stopped. The finder's scratch rig run: Live stopped at 48 on `SET`, `loseNext(JUMP)`, Count in to the Bridge, a Verse tap. At HEAD Live is sent no target jump. At `29423a0`, which had no upper bound, the Verse jump goes from the stale 48.

**Recommended fix:** two tests in `test/count-in.test.ts`, in the describe "the jump to the target", beside "is sent on the first report past the Count Off when none came in its last bar, and lands on the next bar line". No source change.
- **Test A, the `countOffLost` bound.** "ends a count-in, with no jump to the target, on the first report past the bar after the Count Off". Follow the late-send test's setup: `startRig(SET, { playing: false, position: 40 })`, `leader.send(countIn(BRIDGE))`, wait for `at(0)`, `playing` and `countIn`, then `liveHasJumps(1)`. Then `rig.live.advance(3.5 * BEAT_MS)` and await `at(3.5)`. Then `rig.live.advance(9 * BEAT_MS)`, so the next report is at 12.5. The Count Off ends at 8 and one bar is 4 beats, so 12.5 is past the window, in the Intro, not the target. Await `at(12.5)`, then `rig.advanceConnected(PROBE_INTERVAL_MS)`. Expect `{ countIn: false, jump: null }` and `rig.received(JUMP).map((message) => message.args)` to equal `[[COUNT_OFF_CUE]]`.
- **Test B, the `sendCountIn` bound.** "sends no jump to a new target tapped before the first report after a lost jump to the Count Off". Use `startRig(SET, { playing: false, position: 48 })`, `rig.live.loseNext(JUMP)`, then `leader.send(countIn(BRIDGE))`. Await the viewer's `snapshot.playing && snapshot.countIn`, and `vi.waitFor` one lost JUMP in `rig.live.lost`, as the describe "a count-in whose jump to the Count Off is lost" does. Before any `rig.live.advance`, send `leader.send({ kind: 'jump', song: 1, section: 2 })` (the Verse), then `rig.advanceConnected(PROBE_INTERVAL_MS)`. Expect `rig.received(JUMP).map((message) => message.args)` not to contain `[2]`.

**Remediation brief**
- **Design intent:**
  - A held count-in that has not sent its jump waits for Live to play the Count Off. Once a report has put the playhead in it (`reached`), the count-in is kept only while Live plays inside the Count Off, in the bar after it (the late send, when no report came in its last bar or a waiting Stop held the send), or in the target (the landing, `landed()`'s call).
  - `sendCountIn` sends only from the Count Off's last bar to one bar past its end. The upper bound matters even with `countOffLost` right. `retarget` calls `sendCountIn` with no new report, so `position` can be a stale one from before the press.
  - Each bound needs a test that goes red when it is widened or dropped.
- **Full surface:** `test/count-in.test.ts`, the describe "the jump to the target" (`:105`), after the second new test (ends `:228`). Uses the file's existing `SET`, `countIn`, `at`, `liveHasJumps`, `BEAT_MS`, `JUMP`, `COUNT_OFF_CUE` and `PROBE_INTERVAL_MS`; `vi` is already imported.
- **Must preserve:** no source line changes. All of `test/count-in.test.ts`, `test/count-in-change.test.ts`, `test/count-in-cues.test.ts` and `test/jump.test.ts` keep passing at HEAD.
- **Do not touch:** the `!inTarget(after) &&` exclusion and the reached `!playing` guard. Mutation showed neither one pinned (see Minor / nits), but review 3's brief keeps both, so this finding adds no test that hinges on them.
- **Proof:**
  - Each test is green at HEAD: `pnpm exec vitest run test/count-in.test.ts`.
  - Red under its mutant, in a scratch worktree at the commit that adds the tests: `git worktree add --detach <scratch> HEAD`, `ln -s "$PWD/node_modules" <scratch>/node_modules`, then in `<scratch>`: `git apply docs/reviews/setlist-controller-101/repro/review-4-mutant-lost-bound.diff && pnpm exec vitest run test/count-in.test.ts`. Test A must fail. Then `git checkout -- src` in the scratch worktree only, `git apply docs/reviews/setlist-controller-101/repro/review-4-mutant-send-bound.diff && pnpm exec vitest run test/count-in.test.ts`, and test B must fail. Remove the scratch worktree.
  - Should test B not go red under its mutant, the tap reached the server after Live's first position report, and `countOffLost` cleared the count-in first. The finder's scratch run got the order right, so the harness can do it. Make the tap the first thing after the `playing && countIn` snapshot, with no advance in between.

### 2. Comment hygiene — LOW (aggregated)
- `src/server/playback-controller.ts:273-274` — "a report in the bar after it is Live playing out of it with no report in its last bar" → "a report in the bar after it is Live playing out of it with no report in its last bar, or with the send held by a Stop not yet reported"
- `src/server/playback-controller.ts:461` — "With no report in that bar, it goes on the first report in the bar after it" → "With no report in that bar, or with the send held by a Stop not yet reported, it goes on the first report in the bar after it, never later"

## Needs Further Investigation
- Review 3's A is closed: the new `sendCountIn` bound blocks the stale send, as the finder's scratch run showed. Finding 1's test B pins it.
- Review 3's B (a late jump replacing a jump to End resets the chain of old targets) and C (a replaced old target on a song's End can hold back a stop at End) stand unchanged. The delta does not touch `jumpTo` or `replaced`.
- Review 1's A (a Count Off off Live's bar grid) and C (Count in sends the section the page last saw) still stand for #217 and follow-up.

## Reviewed and Dismissed
- The two bounds disagreeing. Both end the window at `end + barLength() - EPSILON`. A report at exactly `end + bar` is cleared in `countOffLost` before `sendCountIn` runs.
- Ordering in the `'position'` handler (`:570-591`). `lost()` is false before the jump is sent, since `barLine` is null, so `countOffLost` always runs. It runs before `landed()`, and `position = event.beats` is set before `sendCountIn()` reads it.
- `end === null` for a count-in's Count Off. Unreachable: `countInFor` returns `count-in` only for a section past the one after the Count Off, so a section always follows it.
- A retarget to the Intro when no report comes in the Intro's first bar. At HEAD the count-in clears on the first report past `end + bar`. At `29423a0` it was held for good, because `sendTarget` refuses a target on the Count Off's end and `landed()` never fired. That is an improvement.
- Finding 1's fix landing without review 3's findings 2 and 3. The closure table says so, and the repro rows of 2 and 3 fail the same way at `29423a0` and at HEAD. The fix does not depend on them.
- The second new test's `later` snapshot at beat 6 repeating `moved`'s assertion. It is harmless. The `toHaveLength(1)` after `advanceConnected` is the assertion that can go red.

## Minor / nits
- **The `!inTarget(after) &&` exclusion in the reached branch looks redundant.** Dropping it passes the count-in tests. After the Count Off is reached, a report in the target ends the count-in either through `landed()` or through `clearJump()`. Both leave `countIn`, `waitingJump`, `barLine` and `replaced` null, and `src/server/cues.ts:140` takes the cue's cause from the snapshots alone. That is the finder's reading, not executed past the 67 count-in tests. Review 3's brief keeps the exclusion, so leave it.
- **The reached `!playing` guard has no test.** It is reachable only when Live stops after the Count Off was reached and before the start report, as when a hand in Live moves a stopped playhead in that gap.
- **A Stop lost in the Count Off's last bar can now end the count-in, where `29423a0` sent the jump late.** It happens only when `forgetStop`, 1 s after the press, comes after the bar following the Count Off ends. That needs a bar of about 0.5 s or less, which is 4/4 near 480 BPM or 2/4 near 240. The finder showed it with the server clock held back. To close it, keep a reached count-in while `stopWait !== null`. Otherwise, say in the `countOffLost` comment that a lost Stop past the bar after ends the count-in. Review 3's Minor item on this path stands: at real tempos the send falls inside the allowance.

## Test quality
- **Tests added in the delta:** 2, "is never sent once the playhead is moved into another song during the count" and "is never sent once the playhead is moved to before the Count Off during the count" (`test/count-in.test.ts`, `aefd03f`).
- **Green against `6cf5454`:** 2. Both are regression proofs: the defect came in after the merge-base, at `fbbe19a`, and both are red at `29423a0`. `git log -S'is never sent once the playhead' 6cf5454..HEAD` gives `aefd03f`, the commit that fixed review 3 finding 1. Keep both.
- **Tautology shapes found:** 0. No expectation computed with a production helper, no mock of the unit under test, no call-shape-only assertion, no snapshot, no assertion-free test.
- **Coverage gaps:** the two bounds' edges (finding 1).

## Prior-review closure
Prior doc: `pre-pr-review-3.md`, at HEAD `29423a0`.
- **Fully fixed: 1.**
  - Finding 1 (MEDIUM), by `aefd03f`. Both of its repro rows pass at HEAD, and both new tests are red at `29423a0` and green at HEAD.
  - The two comments its Full surface named were corrected.
  - NFI A is also closed, by the same commit's `sendCountIn` bound.
- **Partially fixed: 0.**
- **Untouched: 5, all LOW and all deferred by decision.** Review 3's closure table reads "— deferred, LOW tail, not worked" for each, and its scope note leaves opting in to Nick. Review 3's briefs for them still apply.
  - **Finding 2:** its repro rows still fail at HEAD.
  - **Finding 3:** its "at 0" row still fails.
  - **Finding 4:** `landsOn` is unchanged, now at `src/server/playback-controller.ts:493-498`.
  - **Finding 5:** `web/src/JumpTargets.tsx:37` is unchanged.
  - **Finding 6:** both entries are unchanged, since `git diff 29423a0 -- web src/shared` is empty.
- **Resolved only by a comment or doc edit: 0.**
- **Known regressions, deferred:** none; review 3's list is empty, and this round found no regression.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass at `20800ca`, and `pnpm test:e2e` passes locally.
- **Commit hygiene:** this round adds this doc, `repro/review-4-mutant-send-bound.diff` and `repro/review-4-mutant-lost-bound.diff`. `.epic-loop/` is the run's state, not the PR's.
- **Likely reviewer asks:**
  - Why a reached count-in gets exactly one bar past the Count Off (the Approach decision "Bounding a reached count-in").
  - Why Stop waits 1 s rather than clearing at once.
  - Whether the count-in landing rule should have one home (review 3 finding 4).

## Verdict
**Ready to open the PR, with follow-ups.** This round has no CRITICAL, HIGH or MEDIUM finding, so nothing gates the PR.
- **Recommended before the PR:** finding 1, which is two tests and no source change, because the second test is the only pin on the bound that closed review 3's NFI A. Finding 2's two comment edits can go with it.
- **The confirmed list shrank** from six to two, and both are about tests and comments, not behaviour. The branch has converged, so read this as convergence, not as a review short of findings.
- **Review 3's findings 2 and 3** are still #235's own cases 1 and 2 in a form its proofs did not try. Landing them on this branch is still recommended, and it is Nick's call.
- **Follow-up tickets:** review 3's findings 4 and 5, and its NFI B and C.
- **Ticket closure:** #236 and #237 closed as review 3 found. #235 cases 3 and 4 are closed, as are cases 1 and 2 in the forms their proofs used. The playhead-moved regression the case 2 fix brought in is closed.
