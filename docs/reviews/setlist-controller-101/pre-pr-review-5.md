# Pre-PR review: setlist-controller#101 Rehearsal: count-off into a section (fresh review of #242, #243 and #244)

**Branch:** `setlist-controller-101-count-off-into-section` vs `origin/main` (merge-base `78ed6b4` "Merge pull request #239 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `6522397` (setlist-controller#242 A late tap that replaces a jump to End clears its mark a bar early, or skips Stop at end), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 7 files total against the merge-base, +416 / -19. This review adds 2 repro files under `repro/`.
**Delta under review:** none. `--fresh`: the whole working surface since the merge-base was reviewed, which is exactly the three tickets this run landed: #243 (`d8378bb`, merged `59856c5`), #244 (`c2bbc10`, merged `bcb4ed2`) and #242 (`b6e192c`, merged `6522397`).
**Reviewed against:** the epic body of setlist-controller#101 and the bodies of #242, #243 and #244 (their proof rows and "Done when"). Review 4's Approach decisions were read and are carried forward. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Note: `origin/main` has moved to `1ebd265` since the merge-base; that merge is not part of this review.
**Date:** 2026-10-24
**Reviewer:** 2 code-review agents + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` at HEAD, and again with this review's repro files in place | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit suite | `pnpm test` | 67 files, 1507 passed, 4 skipped |
| Build | `pnpm build` | built |
| e2e | `pnpm test:e2e` | 50 passed |
| New tests at `$BASE` (tautology oracle) | the three HEAD test files copied into a scratch worktree at `78ed6b4`, `pnpm exec vitest run test/count-in.test.ts test/jump.test.ts test/pages.test.ts` | 13 new tests: 8 red, 5 green. The 5 green: the two #243 bound tests (pinned by mutants, below), the two #244 "enables" guards (pinned by mutants, below), and `jump.test.ts:1062` "late tap B alone is lost" (pinned by nothing, finding 2) |
| #243 bound mutants | `repro/review-4-mutant-lost-bound.diff` and `repro/review-4-mutant-send-bound.diff` each applied in a scratch worktree at HEAD, `pnpm exec vitest run test/count-in.test.ts` | each reds exactly its intended test (`:183`, `:204`). A tighter mutant, `end + barLength() + 0.5` in `countOffLost`, reds nothing (finding 3) |
| Per-hunk reverts | in a scratch worktree at HEAD: drop the `landed()` line; restore `lost()`'s old order; revert `startOf` only; revert the gathered-starts restructure only; drop `countIn` from `App.tsx`; `held = countIn` in `JumpTargets` | landed line: 2 stale-report rows red. lost order: only the overlap row `:1041` red. `startOf`: only "after Next to End" red. Gathered restructure: nothing red (finding 4). App prop: the #244 disable row red. `held = countIn`: the "song other than the count-in's" row red |
| The `lost()` reorder on a Continue song (finding 1) | `repro/review-5-late-tap-over-count-off-on-end.test.ts` copied into `test/` of a scratch worktree, run at HEAD 3 times and at `78ed6b4` once | red 3 of 3 at HEAD (`expected null to deeply equal { song: 2, section: 2 }`), green at `$BASE` |
| Finding 1's candidate fix | `repro/review-5-candidate.diff` applied in a scratch worktree at HEAD with the repro in `test/`, `pnpm exec vitest run test/review-5-late-tap-over-count-off-on-end.test.ts test/jump.test.ts test/count-in.test.ts test/count-in-change.test.ts test/count-in-cues.test.ts test/transport.test.ts`, then `pnpm exec tsc --noEmit -p .` | 134 passed; typecheck clean |
| The End-target half of the `lost()` reorder (finding 2) | finder's scratch row S2 run against `$BASE`, HEAD and the "old order" revert | stops at End on `$BASE` and HEAD, no stop under the revert: only the overlap row pins the reorder today |
| Page against server for the #244 rule | traced `JumpTargets.tsx:31` against the server's jump command count-in branch (`playback-controller.ts:672-678`) and `landsOn` (`:506-511`); `pnpm exec vitest run test/pages.test.ts` | the page and the server agree for every playhead position; 107 page tests pass |
| Real Live | not run: the guardrails forbid opening or controlling Ableton Live. The acceptance run is #217 | not run |

**Overall:** The three tickets do what they say. #243's stale-report fix and both bound tests hold, #244's tap targets match the server's rule exactly, and #242's two causes are fixed with five red-before rows. One regression came in with #242's reorder of `lost()`: on a song set to Continue, a late tap that replaces a target starting on that song's End now clears its mark a bar before Live jumps, where the base kept it (finding 1, LOW, proved). The rest are test gaps and comment wording. Nothing blocks the PR.

## Approach decisions
- **What proves a count-in's Count Off jump lost (#235 case 1, carried forward):** only a report while Live plays. `countIn.reached` records that a report put the playhead inside the Count Off. Precedent: `lost()`'s "a report outside the target past that bar line is proof".
- **Bounding a reached count-in (review 3 finding 1, carried forward):** `countOffLost` keeps a reached count-in only inside `[Count Off start, Count Off end + one bar)` or in the target; `sendCountIn` sends only inside `[Count Off end - one bar, Count Off end + one bar)`. Precedent: `lost()`'s one-bar allowance past `barLine`.
- **An unsent count-in's landing (review 3 finding 2, applied in `d8378bb` for #243):** while the count-in's own jump has not been sent, the only landing is playback, with Live playing, from a reached Count Off into the target. Precedent: `countOffLost`'s own `playing` rule.
- **Late jumps keep every old target they replaced on the same bar line (#236, extended in `b6e192c` for #242):** module-level `replaced: { barLine, starts[] }`, for every jump; an old End target is recorded by the song's `end` beat (`startOf`).
- **The End proof against the replaced exemption (new, finding 1):** in `lost()`, the End proof goes ahead of the replaced exemption only when the song's end toggle is `stop`; on any other toggle the exemption comes first, as on `$BASE`. Precedent: `reachedEnd`'s `endToggles[end.number] === 'stop'` (`playback-controller.ts:545`). This narrows #242's "End check ahead of the exemption" to the stop it was for.
- **Where a bound test's two sides go when one report on the inside side also triggers the send (remediation of finding 3, new):** the inside side is its own row beside the outside row, since a report in `[Count Off end - bar, Count Off end + bar)` both keeps a reached count-in and sends its jump, so one count-in cannot carry both sides with "no jump sent". Each side sits an eighth of a beat from `end + one bar`. Precedent: the late-send row "is sent on the first report past the Count Off when none came in its last bar", which already asserts held and sent on one report.
- **Dead fallback paths (remediation of finding 4, new):** a fallback no path reaches is removed, not tested, and the code goes back to the `$BASE` shape. Precedent: `jumpTo`'s `$BASE` `starts` line.
- **One copy of the count-in landing rule (review 3 finding 4, still deferred):** the server's `landsOn` should call `countInLandsOn` from `src/shared/count-in.ts`. The two bodies are identical today.
- **A change during the count while a lost Stop waits is sent (#235 case 3, carried forward)** and **Stop with a count-in held on a stopped Live (#235 case 4, carried forward):** unchanged by this delta.

## Confirmed Issues
### 1. On a Continue song, a late tap that replaces a target starting on that song's End clears its mark a bar before Live jumps — LOW
- **Location:** `src/server/playback-controller.ts:332`
- **Attribution:** introduced by `b6e192c` (setlist-controller#242 A late tap that replaces a jump to End clears its mark a bar early, or skips Stop at end). `git show 78ed6b4:src/server/playback-controller.ts` lines 326-328 run the replaced exemption first and the End proof last; `git log -S"if (after >= barLine + EPSILON && end !== null) return true;" 78ed6b4..HEAD` names only `b6e192c`.
- **Real-world trigger:** an overlap set, where the next song's Count Off sits on this song's End, with this song on its default "Continue into next song". In the song's last bars the leader taps the next song's Count Off, then corrects to another section of the next song within 250 ms of the End bar line. Every page drops the waiting mark on the first report past End and shows no waiting jump for a bar, though Live still jumps a bar later. Capped at LOW: the page is wrong for one bar and Live does the right thing, and `$BASE` already accepts the same one-bar early clear for a late tap with no old target on a Continue song. Upgrade to MEDIUM if Nick does not accept a bar-early clear on Continue songs at all; then that base case is the same defect and wants the same gate.
**Evidence**
```ts
    if (inTarget(after)) return false;
    if (after >= barLine + EPSILON && end !== null) return true;
    if (replaced?.starts.some((start) => after >= start - EPSILON && after < start + barLength() - EPSILON)) return false;
    return after >= barLine + barLength() + EPSILON;
```
**Failure mode** — playing at 12 on the overlap set (song 1 End 16, song 2 Count Off 16, Verse 32), song 1 on Continue: tap song 2's Count Off (in time, bar line 16), then at 15.875 a late tap to song 2's Verse that reaches Live at 16.125. Live jumps to the Count Off on 16, which looks like playing on, and will jump to the Verse on 20. On the report at 16.125, `endReached` returns song 1, so the End proof fires before the exemption for the Count Off's first bar: `lost()` is true and the mark clears. Executed: `repro/review-5-late-tap-over-count-off-on-end.test.ts` is red 3 of 3 at HEAD with `expected null to deeply equal { song: 2, section: 2 }` and green at `$BASE`. No stop goes out, since the toggle is Continue.
**Recommended fix** — `repro/review-5-candidate.diff`:
```diff
-    if (after >= barLine + EPSILON && end !== null) return true;
+    if (after >= barLine + EPSILON && end !== null && endToggles[end.number] === 'stop') return true;
     if (replaced?.starts.some((start) => after >= start - EPSILON && after < start + barLength() - EPSILON)) return false;
-    return after >= barLine + barLength() + EPSILON;
+    if (after >= barLine + barLength() + EPSILON) return true;
+    return after >= barLine + EPSILON && end !== null;
```
Then reword the `lost()` comment at `:325-328` so the End proof's precedence is stated for a stop toggle only (see Comment hygiene, entry 1).
**Remediation brief**
- **Design intent:** `lost()` decides that a playhead report proves a waiting jump never reached Live, which clears the mark and, through `reachedEnd`, lets a "Stop at end" stop fire. The replaced exemption keeps a late jump alive in the first bar of any old target Live may have jumped to on `barLine`. #242 moved the End proof ahead of it because a stop at End must come within a bar of End. That reason holds only for a stop toggle; on Continue the End proof only clears the mark, so the exemption should win as on `$BASE`.
- **Full surface:** `src/server/playback-controller.ts:332-334` (the three checks), `:325-328` (the comment naming the order), `:106-109` (the `replaced` comment, unchanged). `endToggles` is already in scope (used by `reachedEnd` at `:545`). Add the repro as a row in `test/jump.test.ts`, describe "after a late tap that replaced a target on a song's End" (`:1012`), reusing its `OVERLAP_SET`, `waitingIn`, `JUMP`, `BEAT_MS` and `at`.
- **Must preserve:** on a stop toggle, the End proof still comes first: `test/jump.test.ts:1041` "stops at End on a "Stop at end" song when tap A on the next song's Count Off and late tap B are both lost" and `:1062` must stay green. The four #242 rows `:693`, `:736`, `:752`, `:801`, all of `test/jump.test.ts`, `test/transport.test.ts` (auto-stop), and `test/count-in*.test.ts`. On any toggle, a report past `barLine + barLength()` outside every replaced first bar is still proof. A late tap alone on a Continue song keeps `$BASE`'s behaviour (the final line still returns true on End past `barLine` when nothing is replaced).
- **Do not touch:** `startOf` and the `replaced` bookkeeping in `jumpTo` (Dismissed: `song.end` is the right start for an End target); the `landed()` count-in line (Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-5-late-tap-over-count-off-on-end.test.ts test/ && pnpm exec vitest run test/review-5-late-tap-over-count-off-on-end.test.ts` is red now and green after the fix; then move its row into `test/jump.test.ts` and delete the copy in `test/`. With the fix: `pnpm exec vitest run test/jump.test.ts test/count-in.test.ts test/count-in-change.test.ts test/count-in-cues.test.ts test/transport.test.ts` all green (134 with the repro, at review time).

### 2. Only one test pins #242's reorder of `lost()`, and one of #242's six proof rows is green before the fix — LOW
- **Location:** `test/jump.test.ts:1062` and describe "after a late tap that replaced a target on a song's End" (`:1012`)
- **Attribution:** introduced by `b6e192c`. #242's "Done when" asks that each proof row go red before the fix.
- **Real-world trigger:** none for users; a later edit that restores the old order for an old End target stays green. Test gap, LOW.
**Evidence** — the tautology oracle: `:1062` "stops at End on a "Stop at end" song when a late tap B alone is lost" passes at `78ed6b4`, and passes under every revert and mutant tried. With no old target, `replaced` is null in both versions, so the order of the checks cannot matter. #242's issue calls it "the control row". The only row that goes red when `lost()`'s old order is restored is `:1041` (the overlap Count Off).
**Failure mode** — the other half of cause (b), an old End target (which `startOf` now records at `[End, End + bar)`), has no row: with the old order the exemption would hold back the stop. The finder's scratch row S2 pins it: set `1 - Intro` 0, `1 - End` 16, `2 - Intro` 24, `2 - Verse` 32; song 1 set to stop; playing at 9: Next (lost) to End, then a late tap at 11.875 (lost), position reports every 2 beats. Stops at End on `$BASE` and HEAD, no stop with the old order.
**Recommended fix** — rename `:1062` to say it is a control row (for example "…when a late tap B alone is lost, with no old target, as a control") and add S2 as a row in the same file's "a lost jump" describe (`:816`), with the set above, `loseNext(JUMP)` before each press, and `vi.waitFor(() => expect(rig?.received('/live/song/stop_playing')).toHaveLength(1))`. Finding 1's row is a second red-before row for the reorder.
**Remediation brief**
- **Design intent:** each check in `lost()` should have one row that goes red when it is removed or reordered. The reorder exists for two old-target shapes that start on or within a bar of End: an overlap's Count Off and an old End target.
- **Full surface:** `test/jump.test.ts:1062` (rename), `test/jump.test.ts` "a lost jump" describe (new S2 row, helpers `liveLostJumps` at `:819` and `JUMP` at `:817`).
- **Must preserve:** every existing row in `test/jump.test.ts`.
- **Do not touch:** `src/server/playback-controller.ts` (no code change in this finding).
- **Proof:** the S2 row is green at HEAD; in a scratch worktree at HEAD with `lost()`'s old order restored (the three lines of `git show 78ed6b4:src/server/playback-controller.ts` 326-328), `pnpm exec vitest run test/jump.test.ts` shows S2 red.

### 3. Bound test A does not pin `countOffLost`'s bound to the bar — LOW
- **Location:** `test/count-in.test.ts:183-199`, "ends a count-in, with no jump to the target, on the first report past the bar after the Count Off"
- **Attribution:** introduced by `d8378bb` (setlist-controller#243).
- **Real-world trigger:** none for users; a loosening of the bound by up to half a bar stays green. Test gap, LOW.
**Evidence** — the only report past the Count Off is at 12.5, half a bar past the bound (Count Off end 8 + one bar = 12). Under the mutant `end + barLength() + 0.5` in `countOffLost` (`playback-controller.ts:288`) the whole of `test/count-in.test.ts` stays green; the review-4 four-bar mutant does turn it red.
**Failure mode** — the test name claims the first report past the bar ends the count-in, but it proves only that a report half a bar further does.
**Recommended fix** — in that test, report 11.875 first and assert the count-in is still held (`countIn: true`), then report 12.125 and assert `{ countIn: false, jump: null }`, with no jump to the target sent. Keep the existing fixture and helpers.
**Remediation brief**
- **Design intent:** `countOffLost` keeps a reached count-in only inside `[Count Off start, Count Off end + one bar)` or in the target (Approach decisions). The test should sit on both sides of `end + one bar`.
- **Full surface:** `test/count-in.test.ts:183-199` only.
- **Must preserve:** the test stays red under `repro/review-4-mutant-lost-bound.diff`; test B (`:204`) unchanged.
- **Do not touch:** `countOffLost` and `sendCountIn` themselves.
- **Proof:** green at HEAD; in a scratch worktree at HEAD with `countOffLost`'s `end + barLength() - EPSILON` changed to `end + barLength() + 0.5 - EPSILON`, `pnpm exec vitest run test/count-in.test.ts` shows it red.

### 4. `jumpTo` gained a fallback for an old target with no start that no path reaches and no test covers — LOW
- **Location:** `src/server/playback-controller.ts:377-380`, and the `jumpTo` comment at `:354-356`
- **Attribution:** introduced by `b6e192c`.
- **Real-world trigger:** none found. `startOf(old)` is undefined only for a section the set does not have (a set change runs `clearJump` first, `:579`) or an End of a song with no End (Next refuses that, `:775`). `old` or `oldBarLine` is null only while `replaced` is already null. Dead code, LOW.
**Evidence**
```ts
    const gathered = late && replaced?.barLine === barLine ? replaced.starts : [];
    const starts = oldStart === undefined ? gathered : [...gathered, oldStart];
```
**Failure mode** — none at runtime. The revert that makes `oldStart === undefined` drop the gathered starts (`oldStart === undefined ? []`) fails no test. It breaks the "a test for every fallback path" rule, and the comment documents a behaviour no caller can reach.
**Recommended fix** — keep the branch as it is (it is harmless and matches #242's scratch fix) and drop the claim from the comment, or simplify to `const starts = oldStart === undefined ? [] : [...gathered, oldStart];` with the comment's "which it keeps as they are when old has no start" removed. Prefer the simplification: it is the `$BASE` shape with `startOf`.
**Remediation brief**
- **Design intent:** `replaced` gathers every old target a late jump replaced on one bar line. Since `startOf` gives an End target its End beat, every reachable old target has a start.
- **Full surface:** `src/server/playback-controller.ts:378-379`, `:354-356`.
- **Must preserve:** the four #242 rows `test/jump.test.ts:693`, `:736`, `:752`, `:801` (they pin `startOf` and the gathering), and all of `test/jump.test.ts`.
- **Do not touch:** `startOf` (`:347-350`).
- **Proof:** `pnpm exec vitest run test/jump.test.ts test/count-in.test.ts test/count-in-change.test.ts` green after the change.

### 5. Comment hygiene — LOW (aggregated)
- `src/server/playback-controller.ts:326-328` — "The End proof comes first, since a stop at End must come within a bar of it whatever Live may be on its way to" → after finding 1's fix: "On a song set to stop at End, the End proof comes first, since that stop must come within a bar of End whatever Live may be on its way to, even when an old target starts on that End, as the next song's Count Off does in an overlap."
- `src/server/playback-controller.ts:299-300` — "lands only by playback, with Live playing, out of a Count Off it reached and into the target from outside it" → "lands only by playback, with Live playing, once it has reached its Count Off, on a report that enters the target from outside it" (the code checks `countIn.reached` and `!inTarget(before)`, not that `before` was in the Count Off).
- `web/src/JumpTargets.tsx:7` — "Only the leader page shows them." → "Only the leader and producer pages show them." (the line was edited in `c2bbc10`; `controls(role)` in `src/shared/routes.ts:53` is true for both, and the new test asserts the producer page). `web/src/SectionControls.tsx:6` carries the same sentence, outside this diff.
- `test/pages.test.ts:344` — "The leader's tap targets are enabled the same way." → "The leader's and producer's tap targets are enabled the same way."

## Needs Further Investigation
### A. In an overlap set, the tap targets during a count-in show the previous song, so a tap cannot move the count-in's target — what would settle it: an epic decision on what the tap targets show during a count-in
During a count-in to a song whose Count Off sits on the previous song's Ending, the playhead is inside the previous song's range (`nowPlaying`, `playback-controller.ts:843-879`, returns the first song whose range holds it), so `JumpTargets` shows the previous song's sections, all enabled, and every tap on them cancels the count-in and jumps, which matches the server. The epic's "a tap on another section of the same song during the count becomes the target" is then reachable only through Next and Previous (`SectionControls`, keyed on `jump.song`). Pre-existing, untouched by #244: `$BASE` already showed `now.song`. Showing the count-in's song while `countIn && jump` is set would change what the page shows, so it needs Nick's call, and #217's acceptance run on an overlap set is the place to see it.

### B. The two stale-report rows depend on the fake Live's reply order — what would settle it: the order AbletonOSC sends `is_playing` and `song_time` after `start_playing`, observed in #217
`test/count-in.test.ts:627` and `:650` pass because the stale position replies arrive before the `playing: true` report. If real AbletonOSC reports playing first, `countOffLost` (`playing && !reached`) ends the count-in at the first stale report before the new `landed()` line is consulted. Unverified against Live, older than this branch.

## Reviewed and Dismissed
- `startOf` returns `song.end` for an End target — right: the replaced window `[End, End + bar)` matches `inTarget` and `landedOnEnd` for End.
- The `landed()` count-in line breaks a count-in into the Intro, a tap on the Intro, or 6/8 — no: an unsent count-in into the section after the Count Off lands by playback with `playing && reached`; a sent one skips the line; the line uses no bar length; `before === null` with `reached` true cannot occur.
- The `lost()` reorder lets the auto-stop fire during a count — no: `barLine` is null until the count-in's jump is sent, so `lost()` returns false, and `jumpTo` resets `heldEnd`.
- A Live jump of a bar or more is taken for an End crossing by the reorder — no: `endReached` only reports forward playback of under a bar onto End, so a late tap whose old target is in a non-adjacent song keeps its exemption.
- `JumpTargets`'s `held` keyed on `now.song` disagrees with the server — no: each button sends `now.song`, and the server takes the retarget branch exactly when `waitingJump.song === command.song` (`playback-controller.ts:672-678`).
- `SectionControls` and `JumpTargets` use different `held` rules — correct: `next` and `previous` carry no song and the server keys them on `waitingJump`; a `jump` carries its song.
- `JumpTargets` does not exclude a held `'end'` target as `SectionControls` does — moot: a held count-in never targets End.
- `countInLandsOn` and the server's `landsOn` disagree — no: identical bodies today; the duplication is review 3 finding 4, deferred (Approach decisions).
- The tap on the count-in's current target is enabled — harmless: the server's `retarget` returns on `sameSection`.

## Minor / nits
- `test/pages.test.ts` new rows assert `disabled` only, not the `unavailable` class changed beside it (`JumpTargets.tsx:43`), and no fixture has a `Pad Out` or a section before the Count Off, both named in the new comment.
- `test/count-in.test.ts:204` (bound test B) asserts only that no jump to the new target was sent; a positive check that the tap moved the target would rule out a tap never processed. The send-bound mutant shows it is not vacuous today.

## Test quality
Tests added: 13 (count-in 4, jump 6, pages 3). Green against `$BASE`: 5. Of those, 4 are pinned by a targeted mutant: the #243 bound tests A and B (each red under its review-4 mutant) and the #244 "enables every tap target outside a count-in" and "…of a song other than the count-in's" guards (the latter red under `held = countIn`; the former guards against over-disabling by design). `test/jump.test.ts:1062` is green at `$BASE` and under every mutant: a control row, finding 2. Tautology shapes found: 0. Expectations are literals, nothing is mocked, the server tests drive the real server against the fake Live and assert the OSC Live received and the snapshots, and the page tests render the real `Page`. Strengthen test A (finding 3).

## Prior-review closure
This branch carries the tickets filed from reviews 3 and 4.
- Review 3 finding 2 (stale tap report ends a count-in, #243): fixed, both rows red before and green after.
- Review 3 finding 5 (jump targets during a count-in, #244): fixed, row red before and green after.
- Review 3 Needs Further Investigation B and C (#242): fixed, five rows red before; the sixth is a control (finding 2).
- Review 4 finding 1 (the two bounds unpinned, #243): fixed for both mutants; test A is loose by up to half a bar (finding 3).
- Review 3 findings 3 and 4 (seeding `reached`, one copy of the landing rule): untouched, still deferred by decision.
None was "resolved" by editing only a comment or a doc.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` (1507 passed, 4 skipped), build and e2e (50) all green at HEAD.
- **Commit hygiene:** commit this doc and the two `repro/review-5-*` files. No scratch files in the tree.
- **Likely reviewer asks:** why the End proof outranks the replaced exemption (finding 1's comment), and what #217 shows for overlap sets and Live's report order (A, B).

## Verdict
Ready to open the PR, with follow-ups. No finding is MEDIUM or higher. Finding 1 is a proved regression from #242's reorder but display-only for a bar on Continue songs, matching what `$BASE` already accepts for a lone late tap; fix it in the PR if a remediation pass runs, else file it. Findings 2 to 5 are test and comment follow-ups. A and B wait on #217.

## Remediation — 2026-10-24
Scope: findings 1 to 5, LOW included, by Nick's close-out decision 2 (`.epic-loop/closeout.md`, run 3). Full checks at `ce6d144`: lint and typecheck clean, `pnpm test` 67 files, 1510 passed, 4 skipped (the 1507 at review time plus 3 new rows), build built, `pnpm test:e2e` 50 passed.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `f15033e` setlist-controller#101 pre-PR review 5 finding 1: On a Continue song, a late tap that replaces a target starting on that song's End clears its mark a bar before Live jumps | red→green: the repro became the row "keeps late tap B's mark in the first bar of tap A on the next song's Count Off, on a song that continues at End" in `test/jump.test.ts` (describe "after a late tap that replaced a target on a song's End"); red at `eb24d1b` with `expected null to deeply equal { song: 2, section: 2 }`, green after; `pnpm exec vitest run test/jump.test.ts` 42 passed. The repro copy under `repro/` stays as it was. | src 0 (the `lost()` comment reworded, Comment hygiene entry 1); test 3 lines, the row's scenario comment, as every row in the describe has; the describe comment reworded, since not every row sets stop now | fixed: verifier's 374,544-cell truth table of `lost()` shows 0 divergences against `eb24d1b` on a stop toggle and `78ed6b4` on any other toggle, a missing entry, or `end === null`. Restoring `eb24d1b`'s line reds only the new row; deleting the End proof reds the two stop rows |
| 2 (LOW) | `fd1e600` setlist-controller#101 pre-PR review 5 finding 2: Only one test pinned #242's reorder of lost(), and one of #242's proof rows was green before the fix | green at HEAD; in a scratch worktree at HEAD with `lost()`'s old order restored, `pnpm exec vitest run test/jump.test.ts`: the new S2 row "stops at End on a "Stop at end" song when Next to End and a late tap that replaced it are both lost" red, beside the overlap Count Off row | test 4 lines, the S2 row's scenario comment; the control row's comment reworded | proved by execution |
| 3 (LOW) | `e474690` setlist-controller#101 pre-PR review 5 finding 3: Bound test A did not pin countOffLost's bound to the bar | green at HEAD; in a scratch worktree at HEAD, `pnpm exec vitest run test/count-in.test.ts`: `end + barLength() + 0.5 - EPSILON` reds test A (the brief's proof), the review-4 four-bar mutant still reds it, `end + barLength() - 0.5 - EPSILON` reds the new inside row | test 2 new lines (the inside row's comment), test A's comment reworded | proved by execution. Deviation from the brief: its single-test recipe cannot hold (see Approach decisions); the inside side is a separate row |
| 4 (LOW) | `1997b01` setlist-controller#101 pre-PR review 5 finding 4: jumpTo kept a fallback for an old target with no start that no path reaches and no test covers | no red-first: dead code, nothing reachable to pin. `pnpm exec vitest run test/jump.test.ts test/count-in.test.ts test/count-in-change.test.ts` 96 passed | 0 (the `jumpTo` comment shortened) | fixed: verifier traced every way `oldStart` is undefined (old null, old bar line null, `startOf` undefined) to `replaced` being null; an instrumented mutant logging `oldStart === undefined && gathered.length > 0` over the full suite hit 0 times |
| 5 (LOW, aggregated) | `ce6d144` setlist-controller#101 pre-PR review 5 finding 5: Comment hygiene | entries read against the code: `landed()` checks `countIn.reached` and `!inTarget(before)`; `App.tsx:72-73` render both components on `controls(role)`, true for leader and producer (`src/shared/routes.ts:53`). Entry 1 landed in `f15033e`. `web/src/SectionControls.tsx`'s same sentence was fixed with its pair | n/a (prose) | excluded from verify |

### Known regressions, deferred
- None introduced by this round.

### Raised by the verifier, outside this round's diffs
- LOW, introduced by `b6e192c` (#242), not by this round, reachability unverified: `lost()`'s End proof on a stop song gates only on the toggle, while `reachedEnd` also withholds the stop when Live's loop brace ends on that End. If `liveLoop.on` is still true from such a brace at the End report (Live's reply to the loop-off `jumpTo` sends at tap A still outstanding), the late tap's mark clears inside the exemption window and no stop follows: finding 1's failure on a stop song. Verdict quoted: "Line 333 gates only on the toggle. reachedEnd (line 546) also skips the stop when Live's loop brace ends on that End." Proposed in `.epic-loop/stage2/proposals.md` for the next round to check.
- Test gap, LOW: the missing-entry toggle path of `lost()` has no row of its own; it takes the same branch as Continue.

### Rework briefs
- None: no fix was half-fixed or introduced a defect, so no rework pass ran.

