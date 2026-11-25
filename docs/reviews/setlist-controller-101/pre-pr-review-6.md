# Pre-PR review: setlist-controller#101 Rehearsal: count-off into a section (delta review of review 5's remediation)

**Branch:** `setlist-controller-101-count-off-into-section` vs `origin/main` (merge-base `78ed6b4` "Merge pull request #239 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `c7e9ef5` (setlist-controller#101 pre-PR review 5 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 11 files total against the merge-base, +776 / -27. This review adds 3 repro files under `repro/`.
**Delta under review:** since `eb24d1b` (setlist-controller#101 pre-PR review 5), the commit review 5 reviewed plus its doc: 7 files, +149 / -33, the six remediation commits `f15033e`, `fd1e600`, `1997b01`, `e474690`, `ce6d144` and `c7e9ef5`. Code changed in one file, `src/server/playback-controller.ts` (`lost()`, `jumpTo`'s `starts` line, two comments); the rest is tests and comments. The proposal review 5's verifier raised (`.epic-loop/stage2/proposals.md`, a loop brace ending on End) was checked as a candidate this round.
**Reviewed against:** the epic body of setlist-controller#101, review 5's findings, briefs, Approach decisions and closure table. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Note: `origin/main` has moved to `851d273` (Merge pull request #245 from nick-vogel/setlist-controller-58-planning-center-plan) since the merge-base; that merge is not part of this review.
**Date:** 2026-10-24
**Reviewer:** 1 code-review agent + 1 disprove agent (the loop-brace candidate) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` at HEAD; `pnpm exec eslint docs/reviews/setlist-controller-101/repro/` with this review's repro files in place | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit suite | `pnpm test` | 67 files, 1510 passed, 4 skipped |
| Build | `pnpm build` | built |
| e2e | `pnpm test:e2e` | 50 passed |
| The delta's new and changed tests at `$BASE` and at `eb24d1b` | `test/count-in.test.ts` and `test/jump.test.ts` from HEAD copied into scratch worktrees at `78ed6b4` and `eb24d1b`, run with `-t` on the five new or renamed rows | `78ed6b4`: 5 green. `eb24d1b`: only the Continue row red (`expected null to deeply equal { song: 2, section: 2 }`). Green at `$BASE` is expected for all five: each is pinned by a mutant at HEAD, next row |
| Mutants at HEAD | scratch worktree at `c7e9ef5`, one edit at a time, `pnpm exec vitest run test/count-in.test.ts` or `test/jump.test.ts test/transport.test.ts` | `countOffLost` bound `- 0.5`: the 11.875 inside row red. Bound `+ 0.5`: the 12.125 row red. `sendCountIn` upper bound `- 0.5`: the inside row red. `lost()` stop gate dropped: only the Continue row red. Gated End proof deleted: the S2 row and the overlap Count Off row red. Final line of `lost()` replaced by `return false`: nothing red over the whole suite but set-builder, 1029 passed (finding 2) |
| The same final-line mutant at `$BASE` | `78ed6b4`'s `lost()` last line gated on `endToggles[end.number] === 'stop'` | 1013 passed: the End proof on a non-stop song was unpinned at `$BASE` as well |
| `jumpTo`'s `starts` simplification (review 5 finding 4) | finder traced every way `oldStart` is undefined against every write of `replaced`, and restored the old fallback over the full suite | unreachable confirmed: every `waitingJump = null` also nulls `replaced`; the new line is `$BASE`'s shape; 1510 green with the old fallback back |
| Stale-position retarget (finding 1) | `repro/review-6-stale-position-retarget.test.ts` copied into `test/` of scratch worktrees at `c7e9ef5` (twice) and `78ed6b4` (twice) | red 4 of 4, `expected [ [ 3 ] ] to not deep equally contain [ 3 ]` |
| Finding 1's candidate fix | `repro/review-6-candidate.diff` applied at `c7e9ef5` with the repro in `test/`, `pnpm exec vitest run`, then `pnpm exec tsc --noEmit -p .` | 68 files, 1511 passed, 4 skipped; typecheck clean |
| Continue-song End proof row (finding 2) | `repro/review-6-continue-end-proof.test.ts` in `test/` at `c7e9ef5`, then with `lost()`'s last line as `return false` | green at HEAD; red under the mutant, `expected { song: 2, section: 1 } to be null` |
| Loop brace ending on End on a stop song (the stage 2 proposal) | disprove agent: the real rig with replies held from before tap A and released in order, plus direct controller rows with a stale `loop on` report, at `c7e9ef5` and `78ed6b4` | not reachable by the claimed route; the general stale-loop-report case fails the same way at `$BASE` (Needs Further Investigation C) |
| Real Live | not run: the guardrails forbid opening or controlling Ableton Live. The acceptance run is #217 | not run |

**Overall:** Review 5's five fixes all hold, each verified against its intent by mutant: Continue songs get `$BASE`'s `lost()` exactly, stop songs keep the End proof first, both sides of the count-in bound are pinned to an eighth of a beat, and the `jumpTo` fallback was dead. The delta itself has no defect. Two LOW findings, both pre-existing: a tap during a count-in can send the target jump from a stale stopped position just past the Count Off, so a count-in whose Count Off jump was lost survives (finding 1, proved, needs a sub-bar Intro and a lost datagram), and the End proof on a song that continues at End has no test (finding 2). Nothing blocks the PR.

## Approach decisions
- **What proves a count-in's Count Off jump lost (#235 case 1, carried forward):** only a report while Live plays. `countIn.reached` records that a report put the playhead inside the Count Off. Precedent: `lost()`'s "a report outside the target past that bar line is proof".
- **Bounding a reached count-in (review 3 finding 1, carried forward):** `countOffLost` keeps a reached count-in only inside `[Count Off start, Count Off end + one bar)` or in the target; `sendCountIn` sends only inside `[Count Off end - one bar, Count Off end + one bar)`. Precedent: `lost()`'s one-bar allowance past `barLine`.
- **Sending a count-in's jump needs a report inside its Count Off (new, finding 1):** `sendCountIn` sends only once `countIn.reached` is true, so no send ever goes from a position Live reported before the count-in started. Precedent: `landed()`'s unsent count-in line, `playing && countIn.reached && !inTarget(before)`, and `countOffLost`'s `if (!countIn.reached) return true`.
- **An unsent count-in's landing (review 3 finding 2, carried forward):** while the count-in's own jump has not been sent, the only landing is playback, with Live playing, from a reached Count Off into the target.
- **Late jumps keep every old target they replaced on the same bar line (#236, #242, carried forward):** module-level `replaced: { barLine, starts[] }`; an old End target is recorded by the song's `end` beat (`startOf`). A jump whose old target has no start records none (review 5 finding 4).
- **The End proof against the replaced exemption (review 5 finding 1, carried forward):** in `lost()`, the End proof goes ahead of the replaced exemption only when the song's end toggle is `stop`; on any other toggle the exemption comes first, as on `$BASE`. Precedent: `reachedEnd`'s `endToggles[end.number] === 'stop'`.
- **Where a bound test's two sides go (review 5 finding 3 remediation, carried forward):** the inside side is its own row beside the outside row, each an eighth of a beat from `end + one bar`.
- **Dead fallback paths (review 5 finding 4 remediation, carried forward):** a fallback no path reaches is removed, not tested.
- **One copy of the count-in landing rule (review 3 finding 4, still deferred):** the server's `landsOn` should call `countInLandsOn` from `src/shared/count-in.ts`. The two bodies are identical today.
- **A change during the count while a lost Stop waits is sent (#235 case 3, carried forward)** and **Stop with a count-in held on a stopped Live (#235 case 4, carried forward):** unchanged by this delta.

## Confirmed Issues
### 1. A tap during a count-in can send the target jump from a stale stopped position just past the Count Off, so a count-in whose Count Off jump was lost survives — LOW
- **Location:** `src/server/playback-controller.ts:480` (`sendCountIn`'s first guard), reached from `retarget` at `:525`
- **Attribution:** pre-existing, untouched. The guard `if (!countIn || countIn.sent || !playing || position === null) return;` is at `78ed6b4` line 465 and came in with `99071a4` (setlist-controller#214 Change or cancel a count-in during the count); its bound window `[end - bar, end + bar)` is at `78ed6b4` line 467, from `aefd03f` (setlist-controller#101 pre-PR review 3 finding 1). The delta does not touch `sendCountIn` or `retarget`. The repro is red at `78ed6b4` too.
- **Real-world trigger:** none plausible found. It needs all three: a song whose section after the Intro starts within one bar of the Count Off's end (an Intro of a pickup's length, shorter than a bar, since the page sends the playhead's own section and a count-in to the Intro is Play from start), Live stopped in that section; the count-in's jump to the Count Off lost on its UDP way to Live; and a tap on another section of the song in the gap before Live's first position report. Then the band hears no Count Off, Live plays on from the section and jumps to the tapped one at the next bar line, and every page still reads "Count in to" it. Capped at LOW for no user path. Upgrade to MEDIUM if a saved set has such a short Intro and AbletonOSC turns out to send `is_playing` before `song_time` after `start_playing` (Needs Further Investigation B of review 5, observed in #217): then no lost datagram is needed, the target jump goes with Live on the Count Off's first beat, and the count is cut to one bar. Check: list the sections of the Sunday sets for an Intro shorter than one bar.
**Evidence**
```ts
  const sendCountIn = () => {
    if (!countIn || countIn.sent || !playing || position === null) return;
    const { end } = countIn.countOff;
    if (end === null || position < end - barLength() - EPSILON || position >= end + barLength() - EPSILON) return;
    sendTarget();
  };
```
`retarget` (`:519-526`) calls `sendCountIn()` for an unsent count-in at once, on whatever `position` holds. Right after the count-in command, `position` is still the stopped playhead Live reported before the press, and `playing` is true as soon as Live reports its start.
**Failure mode** — set `1 - Count Off` 0, `1 - Intro` 8, `1 - Verse` 10, `1 - Bridge` 24, `1 - End` 40; Live stopped at 10; Count in on the Verse with the jump to the Count Off lost; a tap on the Bridge before the first report. `retarget` runs `sendCountIn` with `position` 10, inside `[4, 12)`, and sends cue 3; the count-in is marked sent, so `countOffLost` never runs again, and the first report at 11 keeps `countIn: true` with the Bridge waiting. The intended rule, stated by the existing row `test/count-in.test.ts:225` "sends no jump to a new target tapped before the first report after a lost jump to the Count Off", holds there only because that row starts at 48, outside the window. Executed: `repro/review-6-stale-position-retarget.test.ts` is red 2 of 2 at HEAD and 2 of 2 at `$BASE` with `expected [ [ 3 ] ] to not deep equally contain [ 3 ]`.
**Recommended fix** — `repro/review-6-candidate.diff`:
```diff
   const sendCountIn = () => {
-    if (!countIn || countIn.sent || !playing || position === null) return;
+    if (!countIn || countIn.sent || !countIn.reached || !playing || position === null) return;
```
**Remediation brief**
- **Design intent:** a count-in holds its target as a waiting jump with no bar line until its own jump is sent, which `sendCountIn` does in the Count Off's last bar or on the first report in the bar after it. Before any report has put the playhead inside the Count Off, `position` is a stale value from before the press, so it says nothing about where Live is in the count. `countIn.reached` is the record that a report did; `landed()` and `countOffLost` already refuse to act without it.
- **Full surface:** `src/server/playback-controller.ts:480` (the guard). Its two callers: the position report at `:605`, which runs after `countOffLost` at `:590` in the same event, and `retarget` at `:525`. Add the repro as a row in `test/count-in.test.ts` beside `:225`, in the same describe, with its `PICKUP_SET` as a local constant; the file already has `startRig`, `BEAT_MS`, `JUMP`, `PROBE_INTERVAL_MS` and an `at` helper.
- **Must preserve:** the normal send, in the Count Off's last bar: a report in `[end - bar, end)` sets `reached` in `countOffLost` (`:281-283`) before `sendCountIn` runs at `:605`, so the guard passes. The late send "on the first report past the Count Off when none came in its last bar": `reached` is already true from an earlier report in the Count Off; with `reached` false, `countOffLost` has already ended the count-in at that report (`if (!countIn.reached) return true`), so nothing changes. A retarget while the playhead is already in the Count Off's last bar still sends at once. All of `test/count-in.test.ts`, `test/count-in-change.test.ts`, `test/count-in-cues.test.ts` and `test/jump.test.ts`. A count-in to the section right after the Count Off still sends nothing (`sendTarget`'s `near(target.time, held.countOff.end)` check).
- **Do not touch:** `sendCountIn`'s bound line `:482` and `countOffLost` (`:279-289`); the bounds are pinned by the rows at `test/count-in.test.ts:183` and `:204`. `retarget`'s order (`leaveLoopFor` before the send).
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-6-stale-position-retarget.test.ts test/ && pnpm exec vitest run test/review-6-stale-position-retarget.test.ts` is red now and green after the fix; then move its row into `test/count-in.test.ts` and delete the copy in `test/`. With the fix, `pnpm test` is green (1511 passed, 4 skipped at review time with the repro in `test/`).

### 2. The End proof on a song that continues at End has no test — LOW
- **Location:** `src/server/playback-controller.ts:336`, `return after >= barLine + EPSILON && end !== null;`
- **Attribution:** pre-existing, untouched. The line is byte-identical to `78ed6b4`'s last line of `lost()`, and gating it on `stop` at `$BASE` reds nothing either (1013 passed). `f15033e` (setlist-controller#101 pre-PR review 5 finding 1) split the End proof into a stop line and this line, so the stop half is pinned (the S2 and overlap Count Off rows) and this half is not; review 5 finding 1's brief named its behaviour in Must preserve, with no row behind it.
- **Real-world trigger:** none for users; an edit that drops or narrows the line stays green, and the page would then keep a lost jump's mark a bar longer on a song that continues at End. Test gap, LOW.
**Evidence** — with the line replaced by `return false`, every test file but set-builder's passes, 1029 tests.
**Failure mode** — none at runtime today. The line clears a lost jump tapped in a Continue song's last bar on the first report past End, a bar before `barLine + barLength()` would.
**Recommended fix** — add `repro/review-6-continue-end-proof.test.ts`'s row to `test/jump.test.ts`, describe "a lost jump" (`:816`): set `1 - Intro` 0, `1 - End` 16, `2 - Intro` 24, `2 - Verse` 32; playing at 12.5; song 1 set to continue; a lost tap to song 2's Verse; the mark still up at 15.875, null at 16.125, and no stop sent.
**Remediation brief**
- **Design intent:** each check in `lost()` should have one row that goes red when it is removed or reordered (review 5 finding 2). The End proof clears a jump lost in a song's last bar on the first report past End; on a stop song it also lets `reachedEnd` stop, and on any other song it only clears the mark.
- **Full surface:** `test/jump.test.ts` describe "a lost jump" (`:816`), using its `liveLostJumps` helper (`:819`) in place of the repro's inline `lost.filter` wait if preferred, and its `JUMP`, `BEAT_MS` and `at`. Note: a set like this one starts song 1 on "Stop at end" by default, so the row must send `set-end-toggle` with `continue`.
- **Must preserve:** every existing row in `test/jump.test.ts`.
- **Do not touch:** `src/server/playback-controller.ts` (no code change in this finding).
- **Proof:** the row is green at HEAD; in a scratch worktree at HEAD with `src/server/playback-controller.ts:336` replaced by `    return false;`, `pnpm exec vitest run test/jump.test.ts` shows the row red with `expected { song: 2, section: 1 } to be null`.

## Needs Further Investigation
### A. In an overlap set, the tap targets during a count-in show the previous song, so a tap cannot move the count-in's target — what would settle it: an epic decision on what the tap targets show during a count-in
Carried from review 5 unchanged; the delta does not touch it. Pre-existing.

### B. The two stale-report rows depend on the fake Live's reply order — what would settle it: the order AbletonOSC sends `is_playing` and `song_time` after `start_playing`, observed in #217
Carried from review 5. The same order now also decides finding 1's upgrade.

### C. On a song set to stop, a lost loop report for a brace ending on End withholds the stop at End — what would settle it: whether a loop listener report can be lost while later song-time reports arrive, which on localhost UDP needs a dropped datagram
The stage 2 proposal claimed `lost()`'s stop-gated End proof clears a late tap's mark while `reachedEnd` (`:546`) still sees the brace on, because Live's reply to the loop-off sent at tap A is outstanding. Not reachable by that route: Live plays past a brace ending on End only after it took the loop-off, and it reports the loop change before any position past End. The fake Live keeps reply order (`holdReplies`/`releaseReplies`), and with replies held from before tap A and released in order, HEAD stops at End correctly (red at `$BASE`, review 5's own finding). Fed a stale `loop on` directly, the controller drops the mark and sends no stop at HEAD, but a control with one ordinary early tap and nothing replaced fails the same way at both `c7e9ef5` and `78ed6b4`, and `$BASE` never stops in the late-tap case either. So the only route is a lost loop report, and the gap is `reachedEnd` reading Live's reported loop only, pre-existing. A possible fix, not run against the suite: withhold the stop only for a report on the brace end itself (`after < end.end + EPSILON`), since a report past it proves Live is not wrapping there. Real AbletonOSC's report order is reasoned, not checked against its source.

### Carried for #217
Review 1 Needs Further Investigation A (a Count Off off Live's bar grid) and C (Count in sends the section the page last saw) still stand.

## Reviewed and Dismissed
- `lost()` after `f15033e` diverges from `$BASE` on a Continue song — no: with the stop line skipped, the remaining three lines are `78ed6b4`'s `lost()` exactly.
- A missing `endToggles` entry needs its own row (review 5 remediation's note) — not reachable: `defaultEndToggles` gives every song in the set an entry, `set-end-toggle` updates only existing keys, and `EndToggle` is `'stop' | 'continue'` (`src/shared/snapshot.ts:77`).
- `jumpTo`'s simplified `starts` drops gathered starts when `oldStart` is undefined — no path: every `waitingJump = null` (`clearJump`, the landing in the position case) also nulls `replaced`; `sendTarget` from `sendCountIn` passes no old target only while the count-in is unsent, when no `jumpTo` has run since the count-in command's `clearJump`; a null `oldBarLine` comes only with `replaced` null; a set change runs `clearJump`.
- A stop song now drops a late tap Live may already have taken, where `$BASE` kept its mark — intended: #242's rule that a stop at End comes within a bar of End, and the same outcome as the no-old-target control row, which `$BASE` also stops.
- A Live that really keeps looping (the loop-off lost) reports an End crossing — no: it wraps at the brace end, `endReached` returns null for a backwards move (`:458`), and a report exactly on 16 is not past `barLine + EPSILON`.
- The new comments in `landed()`, `JumpTargets.tsx:7`, `SectionControls.tsx:7` and `test/pages.test.ts:344` — accurate: `landed()` checks `playing && countIn.reached && !inTarget(before)`, and `controls(role)` (`src/shared/routes.ts:53`) is true for leader and producer, gating both components in `web/src/App.tsx:72-73`.
- The S2 row's comment arithmetic — right: Next at 9 gives bar line 12, the late tap leaves at 11.875, the first End-bar report is 16.125.

## Minor / nits
- `sendCountIn`'s upper bound (`:482`) is pinned only from below: widening it to two bars leaves every test green, since on a report `countOffLost` ends a reached count-in past `end + bar` first. After finding 1's fix the bound is redundant on every path; leave it, it states the window.
- `jumpTo`'s `starts.length > 0` (`:382`) is now the same test as `oldStart !== undefined`. Harmless.
- No Continue row has an old End target (S2's shape on a song that continues); it takes the same branch as the Continue Count Off row.

## Test quality
Tests added or changed in the delta: 4 (count-in 1 new, 1 changed; jump 2 new) plus 1 renamed. Green against `$BASE`: all 5, each expected: the Continue row is a regression row (green at `$BASE`, red at `eb24d1b`), the S2 row is pinned by the deleted-End-proof mutant, the two bound rows each by their own `countOffLost` mutant and the inside row by the `sendCountIn` mutant too, and the renamed row is a control by design. Tautology shapes found: 0. Expectations are literals, nothing is mocked, the server tests drive the real server against the fake Live. Gap: finding 2.

## Prior-review closure
Review 5's five confirmed findings, all LOW: 5 fully fixed, 0 partially fixed, 0 untouched.
- Finding 1 (`lost()` order on a Continue song): fixed; the Continue row is red at `eb24d1b` and green after; Continue songs get `$BASE`'s `lost()`.
- Finding 2 (one row pinned #242's reorder): fixed; deleting the gated End proof reds the S2 row and the overlap row; the control row is renamed and stays green under every order.
- Finding 3 (bound test A loose by half a bar): fixed; both sides pinned by mutants at `- 0.5` and `+ 0.5`, to within an eighth of a beat.
- Finding 4 (dead `jumpTo` fallback): fixed; unreachability confirmed by trace.
- Finding 5 (comment hygiene): fixed, all four entries read against the code.
None was "resolved" by editing only a comment or a doc, apart from finding 5, which was comment-only by nature. Review 5's closure table names nothing escalated and its Known regressions, deferred list is empty. The verifier's loop-brace note is Needs Further Investigation C here.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` (1510 passed, 4 skipped), build and e2e (50) all green at HEAD.
- **Commit hygiene:** commit this doc and the three `repro/review-6-*` files. No scratch files in the tree. `origin/main` is at `851d273` now; merge it before the PR.
- **Likely reviewer asks:** why a count-in's send waits for a report inside the Count Off (finding 1), and what #217 shows for overlap sets and Live's report order (A, B).

## Verdict
Ready to open the PR, with follow-ups. No finding is MEDIUM or higher, and both confirmed findings are pre-existing and untouched by this branch. Review 5's remediation closed all five of its findings, and the delta adds no defect. Finding 1 is a two-word guard with a proved repro, cheap to take in the PR if a remediation pass runs, else a ticket; finding 2 is a missing row. The confirmed list shrank from 5 to 2 and moved from this branch's own regressions to older edge cases, which is the delta converging, not the review finding less.
