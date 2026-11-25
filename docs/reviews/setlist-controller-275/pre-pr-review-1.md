# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `f0eab4b`, Merge pull request #270 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback)
**Reviewed at:** HEAD `16efdd4` (setlist-controller#282 The lyric lead before a loop wrap, and its cancel on a loop change, a Fade out and a moved prediction), clean tree: 0 files with uncommitted changes and 0 untracked at the start. 27 files total, +8417 / −280, of which 9 are recorded fixtures under `test/fixtures/propresenter/` and one is `test/fixtures/connections/propresenter-bad-lead-beats.json`. This review adds the doc and 2 files under `repro/`.
**Reviewed against:** epic `nick-vogel/setlist-controller#275` (its body is the spec), sub-issues #277 to #283 (acceptance criteria), `.epic-loop/end-report.md` (the LOW findings and proposals already accepted per ticket). No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply. No prior review doc for this epic (`--fresh`).
**Date:** 2026-11-02
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | clean |
| Lint | `pnpm lint` at HEAD | clean |
| Typecheck | `pnpm typecheck` at HEAD | clean |
| Unit and integration suites | `pnpm test`, three runs 60 s apart | run 1: 1763 passed, 1 unhandled `setTypeOfService EINVAL` from undici after "sends nothing while ProPresenter is offline" (test/propresenter.test.ts); run 2: 1 failed, "names a file that is not valid JSON as one problem, and the cues use the even split" (test/propresenter.test.ts:3167), an extra "could not be read from ProPresenter" problem from the 1 s request timeout under load, the flake `.epic-loop/flaky-4.md` already records; run 3: 70 files, 1763 passed, 4 skipped. Two flakes, no real red. A test-audit agent ran suites in parallel worktrees during runs 1 and 2. |
| Build | `pnpm build` | clean |
| E2E | `pnpm test:e2e` (WebKit and Chromium, OS-assigned ports) | 56 passed |
| Shipped copy | `git diff f0eab4b -- src README.md docs/install.md config \| grep '^+.*—'` | no em-dash added |
| Finding 1, loop on after the next section's slide went early | `repro/review-1-finding-1-test.diff` applied in a scratch worktree at `16efdd4`, `pnpm exec vitest run test/propresenter.test.ts -t "review 1 finding 1"` | red at the assertion after the loop goes on: the wrap's slide index 5 is missing |
| Finding 1, candidate fix | `repro/review-1-finding-1-candidate.diff` plus the test diff in the same scratch worktree, `pnpm exec tsc --noEmit -p .`, `pnpm exec vitest run test/propresenter.test.ts` | typecheck clean; 159 of 159 green, the repro included |
| Finding 1, independent harness | finder's `startConnections` harness with a stub target, lead 2, loop on at beat 30.5 after the next section's first slide went at 30 | the wrap's slide arrives on the downbeat, 2 beats late; with a next-section slide 1 beat in, that slide fires too |
| Cancel tests can go red | mutation in a scratch worktree: the server's `connections.cancel()` call removed, `vitest run -t "lyric lead"` | only the Stop test (:2526) went red; the jump test (:2545) stayed green, since a waiting jump makes the fire-time prediction null (finding 4) |
| Tautology audit (Phase 4.5) | test files and fixtures copied onto `f0eab4b`, then onto `f58a6ae` (before #281) and `9611170` (before #282) | 85 tests added or renamed. 9 green at base, none a finding's proof; see Test quality |
| Not run | the real ProPresenter and Live | #284 is Nick's home run; guardrails forbid driving Live |

**Overall:** The slide plan, nth-group matching, slide 1 versus clear, the Master problem, the timing file's rules and the lead schedule hold under both finders and the full checks. One MEDIUM is confirmed and proved by an executed test through the real seam. When the loop goes on in the last lead's worth of beats of a section, the wrap's slide loses its lead and the next section's line stays on the screen. Fix finding 1 before the PR. The four LOWs can ship as follow-ups or ride along.

## Approach decisions
- Loop change with a slide already sent early (finding 1): `observed()`'s loop branch forgets an early mark the loop makes unreachable, then looks ahead from the playhead as it does now. This is the same place, and the same mechanism, that already forgets a wrap sent early on a loop change. The schedule is not taught a second path.

## Confirmed Issues

### 1. A loop turned on within the lead before a section's end, after the next section's first slide went early, sends the wrap's slide on the downbeat with no lead and keeps the next section's slides scheduled — MEDIUM
- **Location:** `src/server/connections.ts:686-694` (`observed()`, loop branch), reaching `following` at `:457` through `scheduleFromPlayhead` at `:503`
- **Attribution:** introduced, `bc70366` (setlist-controller#282 The lyric lead before a loop wrap, and its cancel on a loop change, a Fade out and a moved prediction). `git log -S'if (entry.early?.wrap) entry.early = null;' f0eab4b..HEAD` names only that commit; the base has no schedule.
- **Real-world trigger:** the worship leader decides to repeat a chorus and presses Loop in its last 2 beats (1.3 s at 95 BPM), after the server has already put the next section's first line up. Deciding to go again at the very end of a chorus is a common moment for that call. User path: the leader page's Loop button, or the loop switched on at the laptop, with ProPresenter armed and the default `leadBeats` of 2.

**Evidence**
```ts
// connections.ts:688-694
seenLoop = brace;
for (const entry of entries) {
  if (entry.early?.wrap) entry.early = null;
  scheduleFromPlayhead(entry);
}
// connections.ts:461, in following()
if (early && earlyStart !== null && start !== null && early.beat > start + offset + EPSILON) return early.wrap ? null : ahead(entry, early.cue, early.beat - earlyStart);
```

**Failure mode:** Ancient Gates, Chorus 1 from 80 to 112, Verse 3's first slide (index 7) on 112. The playhead plays to 104 and index 7 goes early at 110. At 111 the leader turns the loop on over Chorus 1. `observed()` forgets only a wrap's early mark, so `following` still sees index 7's mark ahead of the playhead. It looks ahead from Verse 3, past the brace's end, where `ahead` ignores the loop and returns Verse 3's next slide. The wrap's slide (index 5) is never scheduled. It goes out only on the wrap's downbeat through `deliver`, so for the last 2 beats and the downbeat the screen shows Verse 3's first line while the band repeats the Chorus. When the next section has a slide within the lead of its start (a timing-file `changes` entry, or a section with more slides than bars), that slide fires as well, before the wrap. Proved: `repro/review-1-finding-1-test.diff`, red at the assertion after the loop goes on (`expected [5, 6, 7] to equal [5, 6, 7, 5]`).

**Recommended fix** (`repro/review-1-finding-1-candidate.diff`):
```diff
       const brace = loop();
       if (!sameLoop(brace, seenLoop)) {
         seenLoop = brace;
+        const braceEnd = brace && brace.start + brace.length;
+        const at = position();
+        const wrapsFirst = braceEnd !== null && at !== null && at < braceEnd - EPSILON;
         for (const entry of entries) {
-          if (entry.early?.wrap) entry.early = null;
+          if (entry.early?.wrap || (wrapsFirst && entry.early && entry.early.beat >= braceEnd - EPSILON)) entry.early = null;
           scheduleFromPlayhead(entry);
         }
         return;
```
With the mark forgotten, `following` looks ahead from the playhead, `ahead` returns `wrapOf`, and `schedule` sends the wrap at once because its send time has passed and the brace's end has not. The wrap's early mark then stops its own loop cue from sending it again (`connections.ts:644`).

**Remediation brief**
- **Design intent:** The hub keeps at most one waiting change per target (`pending`), and one mark (`early`) for the last change sent ahead of its beat. The mark keeps that beat, or a loop cue for a wrap, from sending it twice. On a loop change, every waiting change is dropped and the schedule starts again from the playhead on the new path (`scheduleFromPlayhead`). A mark for a beat the new path will not play before the wrap describes a screen the band has left, so it must not steer the look-ahead.
- **Full surface:** `src/server/connections.ts:686-694` only. `following` (:457), `ahead` (:431), `wrapOf` (:417) and `deliver`'s `wrapped` rule (:644) stay as they are and are relied on.
- **Must preserve:**
  - A mark inside the brace stays, so a change sent early inside the looped section is not sent again on its beat.
  - A wrap's mark is still forgotten on every loop change (test :2834, "sends Verse 3's first slide at once when the loop is turned off after the wrap's slide went early").
  - A brace entirely behind the playhead keeps the mark. That is the `wrapsFirst` guard. Without it, a hand-set brace behind the playhead would forget index 7's mark, and index 7 would be sent a second time at once.
  - Loop off before the wrap still sends Verse 3's first slide the lead early (tests :2822 and :2826).
  - Wraps over two passes (:2739), the hand-set brace (:2794) and the drag back after a wrap (:2961).
  - All 159 tests of `test/propresenter.test.ts` pass with the candidate.
- **Do not touch:** the server's `CANCELS_SCHEDULE` set and the absence of `'loop'` from it (Dismissed: Live's loop report is what moves the path, and this fix covers a slide that went in the report's window). `fire`'s `sameLoop` check (:494).
- **Proof:** `git apply docs/reviews/setlist-controller-275/repro/review-1-finding-1-test.diff && pnpm exec vitest run test/propresenter.test.ts -t "review 1 finding 1"` is red now and must be green after. Keep the test, renamed to say what it shows, without the "review 1 finding 1" prefix. Consider a second test with a brace set by hand at the laptop behind the playhead after index 7 went early, asserting index 7 is not sent again; it pins the `wrapsFirst` guard.

### 2. The pre-service check says a one-slide group in a section shorter than a bar is "changed on beats" — LOW
- **Location:** `src/server/propresenter.ts:840-844`
- **Attribution:** introduced, `4cd3e22` (setlist-controller#280 Slides move inside a section on an even split of its bars), the only commit that `git log -S'changed on beats' f0eab4b..HEAD -- src` names.
- **Real-world trigger:** a 2-beat section, such as a pickup bar or a short Tag, whose group holds one slide. Capped at LOW: it is check noise, and the plan itself is right (one slide, no change).

**Evidence**
```ts
const bars = Math.floor(length / bar + EPSILON);
...
if (group.slides.length <= bars || onBeats.has(key)) return;
onBeats.add(key);
check.unmatched.push(`${title}: ${section.name} has ${counted(group.slides.length, 'slide')} in ${counted(bars, 'bar')}, changed on beats`);
```
**Failure mode:** length 2 in 4/4 gives `bars = 0`, so `1 <= 0` is false and the check reads "Tag has 1 slide in 0 bars, changed on beats", for a section that changes nothing.
**Recommended fix:**
```diff
-      if (group.slides.length <= bars || onBeats.has(key)) return;
+      if (group.slides.length <= Math.max(bars, 1) || onBeats.has(key)) return;
```
**Remediation brief**
- **Design intent:** the note flags each section where `evenSplit` (:1035) switches from bars to beats, and that happens only when there is more than one slide to place and more slides than whole bars.
- **Full surface:** `src/server/propresenter.ts:842`. `evenSplit` needs no change: one slide yields one plan entry.
- **Must preserve:** the note for a section with more slides than bars: `test/propresenter.test.ts:2241` ("sends the three slides of a 2-bar Verse 3 on beats 0, 3 and 5, and the check notes it") and the check lines asserted at :2041.
- **Do not touch:** `evenSplit`'s `break` at or past the section's end (Minor: slides dropped when there are more slides than whole beats).
- **Proof:** a new check test with a 2-beat section matched to a one-slide group, asserting no "changed on beats" line. It is red now.

### 3. Two fallback paths of the slide timing file have no test — LOW
- **Location:** `src/server/propresenter.ts:968` (`changes on a section with no end`) and `src/server/slide-timing.ts:54` (`cannot be read`, a read error other than a missing file)
- **Attribution:** introduced, `420ea07` (setlist-controller#283 The slide timing file: per-song exceptions for the slide changes and the group).
- **Real-world trigger:** an entry with `changes` on a song's last section when the song has no End, or a path that is a folder or unreadable. Capped at LOW: both paths are correct by reading; this is the "a test for every fallback path" rule.

**Evidence:** `grep -rn "with no end\|cannot be read" test/propresenter*.ts` finds nothing. Both lines are covered only by reading.
**Recommended fix:** two check tests on the existing timing-file seam (`describe('the slide timing file')`, `test/propresenter.test.ts:3007`). The first writes an entry with `changes` for a section with no end and expects that problem line, with the section falling back to its single slide. The second gives a `slideTimingPath` that is a folder (EISDIR) and expects one problem starting `slide timing file <path>: cannot be read:`.
**Remediation brief**
- **Design intent:** each rule that rejects an entry or the file is a problem line, and the section falls back to the even split and the name match. A file problem means no exceptions at all.
- **Full surface:** tests only, in `test/propresenter.test.ts` beside :3144 and :3162.
- **Must preserve:** a missing file stays no exceptions and no problem (test :3153).
- **Do not touch:** the rule order in `resolveEntry` (:947), since the copy names the first rule broken.
- **Proof:** each new test goes red under a mutation that removes its rule: delete `propresenter.ts:968`, or make `slide-timing.ts:54` `return NO_SLIDE_TIMING`.

### 4. Four lead and timing-file tests would stay green if their setup silently stopped doing what they assume — LOW
- **Location:** `test/propresenter.test.ts:2545`, `:3129`, `:3144`; `test/propresenter-adapter.test.ts:184`
- **Attribution:** introduced, `a6808b0` (#281), `420ea07` (#283), `4cd3e22` (#280).
- **Real-world trigger:** none for users. This is a coverage claim the tests do not fully make. It is LOW, not the audit's usual MEDIUM, because sibling tests on the same setup prove each positive half, and the Stop test (:2526) does go red when the server's cancel is removed.

**Evidence and failure mode:**
- **:2545, the jump cancel test.** It stays green with `connections.cancel()` removed from `server.ts` (mutation run). A waiting jump makes `predict` null, so `fire` drops the change anyway. The test proves the jump drops the change, but not the server's cancel on a jump request. Strengthen it by reporting the landing late enough that the prediction is back before the old send time, or accept that `fire`'s check is the guard and rename the test to say so.
- **:3129 and :3144.** They assert only fallback behaviour, and both were green before the timing file existed. Add an assertion that the check names the entry as a problem, which proves the file was read and the entry rejected.
- **`propresenter-adapter.test.ts:184`.** The 700 ms delay is keyed to `isTrigger`. If the trigger path changed shape, the delay and the "while a trigger is out" scenario would vanish silently, and the test passed at base for exactly that reason. Assert `rig.triggers()` holds the index trigger before Next is pressed.
**Remediation brief**
- **Design intent:** a cancel or fallback test should fail when the behaviour it names is removed, not only when the feature as a whole regresses.
- **Full surface:** the four tests named above.
- **Must preserve:** every current assertion. Strengthen the tests; delete none. :2526, :2561 and :2870 stay as they are: the audit found the same shape there, but sibling tests on identical setups (:2494, :2660, :2676) prove the change would otherwise be sent.
- **Proof:** for :2545, the server.ts mutation above (`if (CANCELS_SCHEDULE.has(command.kind)) connections.cancel();` replaced by `void CANCELS_SCHEDULE;`) must turn the test red, or the test is renamed to the fire-time guard it proves.

### 5. Comment hygiene — LOW (aggregated)
- `src/server/slide-timing.ts:28-29` — "and no earlier entry names the same section occurrence" → "and no earlier valid entry names the same section occurrence" (`standing` holds only valid entries, `propresenter.ts:976`)
- `docs/install.md:281` — "and no earlier entry names the same section." → "and no earlier valid entry names the same section."
- `docs/install.md:281` — "Only the songs in the set are checked, so an entry for a song this week does not play says nothing." → "Only the songs in the set that ProPresenter can trigger are checked, so an entry for a song this week does not play, or for one with no authorized presentation on Master, says nothing."
- `README.md:49` — "…Fire again send the slide for where the playhead is, and the leader's Stop and a jump drop a slide change not yet sent." → "…Fire again send the slide for where the playhead is." (the cancel sentence earlier in the paragraph already says it)

## Needs Further Investigation

### A. The check and the cues use one bar length for the whole set, Live's last reported signature — confirm whether any song in a real set has its own meter
`checkLines`, `resolveEntry` and `plan` take the `bar` that `connections.ts` reads from `controller.barLength()`. A 6/8 song in a set checked while Live reports 4/4 would get spurious "changed on beats" notes, and a `changes` entry could be judged outside its section by the check but valid on the cue, or the reverse. The spec says "the bar length from the time signature it already tracks", so the code conforms to it. The end report already holds this as proposal 6 (#280 prep). It would be confirmed by a set whose songs differ in meter, together with a check of whether AbletonOSC reports Live's signature per locator or once per set.

### B. A section cue in the moment between the leader's Stop and Live's report of the stop may schedule a new change
`cues.ts` gates `onMove` on its `stopped` flag but not `raise`, and `predict` still answers while the stop is only asked for. A crossing into a new section in that window would call `deliver`, which schedules again (`connections.ts:653`). A change due within the lead would then fire. The finder could not build it. It would be confirmed by a test that crosses a section start between `leader.send({ kind: 'stop' })` and the fake Live's stop report, with the next change within 2 beats.

## Reviewed and Dismissed
- `'loop'` missing from `CANCELS_SCHEDULE` (`server.ts:83`) — the path changes only when Live's report arrives, which `observed()` handles; a slide that fires in that window is the case finding 1's fix covers.
- A waiting change across a producer re-pick keeps the old plan's index — a pick while Live plays a song is not a producer path, and Refresh reads the set only while Live is stopped, when `predict` is null.
- A tempo change re-predicts only on the next position report — Live reports position continuously while playing, and the one-beat tolerance is the spec's.
- Disarm then re-arm before a change fires sends it — the spec checks arm at fire time, which is exactly this.
- An expected `(no words)` slide makes another no-words slide count as the server's own — the base expected the whole group, no-words slides included, so this is not new. It falls under #266's pause-by-hand edge cases.
- The Master test by arrangement name only — the API exposes no arrangement contents, and the spec chose the name.
- The even split's rounding, the one-bar floor, nth-group and last-group matching, slide 1 versus clear, the End cue's group, the fake's 204/403/404 — each checked by a finder and held.
- Timer leaks: `schedule` always unschedules first, the one-shot stops itself and checks it is still the pending one, and `stop()` cancels all.

## Minor / nits
- `propresenter.ts:1043-1047`: a section with more slides than whole beats drops its last slides, while the check note says "changed on beats". Only a group with more than 4 slides in a single 4/4 bar reaches it.
- `propresenter.ts:969-970`: an entry pointing `group` at a group with no slides reads "0 changes for 0 slides, needs -1".
- `propresenter.ts:829-830`: the count-difference note still counts a section that a valid entry redirects to another group.
- `test/fake-propresenter.ts:291-299`: a forced 204 on an out-of-range index throws inside the fake's request handler.
- `test/fake-propresenter.ts:133-139`: the fake maps non-string slide text to `''`, where the adapter reads `null`.
- `propresenter.ts:651-653`: "Trigger refused" names the section but not the slide index.

## Test quality
Tests added or renamed: 85 (78 in `test/propresenter.test.ts`, 1 renamed in `test/propresenter-adapter.test.ts`, 6 in the new `test/fake-propresenter.test.ts`).

Green against `f0eab4b`: 9, none of them a finding's proof.
- `:1138` re-pins existing behaviour after #279's rewrite.
- `:2526` is the Stop cancel test; it goes red under the cancel mutation.
- `propresenter-adapter.test.ts:184`: see finding 4.
- The 6 fake tests test the fake itself, which was copied in. Against the base fake they all fail in one setup error, so that result is inconclusive. By reading, they are not tautological.

At base, most lead tests are red only because of #277's change to the trigger URL. Against the commits before #281 and #282, these stay green: :2526, :2545, :2561, :2870, :2915 and :3129/:3144.

Tautology shapes found: none. No expectation is computed with production helpers, no unit under test is mocked, no assertion is call-shaped only, there are no snapshots, and every test asserts something. The absence-only shape is finding 4. :2915 is green without the re-prediction on purpose: it guards against a report within a beat moving the send. Keep it.

## Before opening the PR
- **CI readiness:** lint, typecheck, build and e2e are green. `pnpm test` is green on the third run. The two reds were load flakes, one already on record (`.epic-loop/flaky-4.md`) and one an unhandled undici `setTypeOfService EINVAL`.
- **Commit hygiene:** commit this doc and `repro/`. The branch carries the epic's per-ticket review fix commits, which is the established shape.
- **Likely reviewer asks:** the home run (#284) against the real ProPresenter, the install doc's no-Go-To-Next-timers line (present), and the merge with #108's changes to `connections.ts` and `target.ts`.

## Verdict
Ready with follow-ups once finding 1 is fixed. Gate: finding 1, MEDIUM, introduced by #282. Findings 2 to 5 are LOW and can ride along or become follow-ups. A and B need a check, not a fix. No prior review findings to close (round 1, `--fresh`).

## Remediation — 2026-11-02
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `b17563f` setlist-controller#275 pre-PR review 1 finding 1: a loop turned on after the next section's first slide went early sent the wrap's slide on the downbeat with no lead | red→green: `pnpm exec vitest run test/propresenter.test.ts -t "when the loop goes on after Verse 3's first slide went early"` (the repro test, renamed without the "review 1 finding 1" prefix). The `wrapsFirst` guard is pinned by the new test "never sends Verse 3's first slide again when a brace behind the playhead is set by hand after that slide went early", red with the guard removed (mutation in a scratch worktree). `test/propresenter.test.ts` 160 of 160 | 2 (test comments giving the clock arithmetic, as the neighbouring lead tests do) | fixed (one `pr-review-finder` agent: connections.ts is the hub every lead target shares) |
| 1 rework | `a6ce516` setlist-controller#275 pre-PR review 1 finding 1 rework: a loop of no length forgot the early mark, and the mark kept inside the brace had no test | two new tests, each red under its mutation in a scratch worktree: "never sends Chorus 1's second slide again when the loop goes on over Chorus 1 after that slide went early" (beat condition dropped) and "never sends Verse 3's first slide again when Live reports a loop of no length ahead of the playhead after that slide went early" (length guard dropped) | 7 (the module header and `observed()`'s doc comment corrected to the new rule; no new comment) | fixed (scoped re-verify, one agent) |
| 2 (LOW) | deferred | — | — | LOW tail, not worked this round |
| 3 (LOW) | deferred | — | — | LOW tail, not worked this round |
| 4 (LOW) | deferred | — | — | LOW tail, not worked this round |
| 5 (LOW, comment hygiene) | deferred | — | — | LOW tail, not worked this round |

Full checks at `a6ce516`: `pnpm typecheck`, `pnpm lint`, `pnpm test` (70 files, 1767 passed, 4 skipped), `pnpm build`, `pnpm test:e2e` (56 passed), all green on the first run.

### Known regressions, deferred
- None introduced. The verify pass also raised three items it could not reproduce, all left open for the next round:
  - Pre-existing, not touched by the fix: when one playback state carries both a loop change and a playhead move, the cue engine's `moved()` runs before `observed()`, sees the new brace with the old early mark still set, and, with nothing waiting, can send a later section's slide past the brace before `observed()` sends the wrap. Verdict "LOW, unverified ... I could not get the fake Live to put a loop change and a position change in one update". Proposal in `.epic-loop/stage2/proposals.md`.
  - When the brace's end and the next section's first slide show the same slide index, the fix sends that index again at once as the wrap. Verdict "Possible duplicate, cosmetic, inference only ... still an improvement".
  - The two header comments do not say a loop of no length counts as no loop. Verdict "LOW, optional"; `ahead()`'s comment already says it.

### Rework briefs
- Finding 1 rework. Achieve: a loop of no length forgets only a wrap's mark, as `ahead()` already reads such a loop as no loop; "a mark inside the brace stays" and the no-length case each get a test that goes red without its rule; the header and `observed()` comments name the mark forgotten at or past the brace's end. Preserve: every positive-length behaviour of `b17563f` (mark at or past the end forgotten while the playhead is before it, mark inside kept, brace behind the playhead keeps the mark, wrap's mark always forgotten). Proof: the two new tests green, each red under its mutation in a scratch worktree; `test/propresenter.test.ts` and the full checks green.

## Approach decisions
- Loop change with a slide already sent early (finding 1, as remediated): `observed()`'s loop branch forgets a wrap's mark, and, while the playhead is before the new brace's end, any mark at or past that end; a loop of no length has no end there, matching `ahead()`'s `brace.length <= 0` reading. The schedule is not taught a second path.
