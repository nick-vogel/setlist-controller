# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `f0eab4b`, Merge pull request #270 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback)
**Reviewed at:** HEAD `7048fe3` (setlist-controller#275 pre-PR review 1 remediation closure table), clean tree: 0 files with uncommitted changes and 0 untracked at the start. 30 files total against the merge-base, +8740 / −280. This review adds this doc and 2 files under `repro/`.
**Delta under review:** since `16efdd4` (setlist-controller#282 The lyric lead before a loop wrap, and its cancel on a loop change, a Fade out and a moved prediction), the HEAD that `pre-pr-review-1.md` reviewed. The delta is 5 files, +329 / −6: `src/server/connections.ts` (+17 / −6), `test/propresenter.test.ts` (+61), and review 1's doc and `repro/`. Commits: `afae722` (review 1 doc), `b17563f` (finding 1 fix), `a6ce516` (finding 1 rework), `7048fe3` (closure table).
**Reviewed against:** epic `nick-vogel/setlist-controller#275` and sub-issues #277 to #283 as distilled in review 1; `pre-pr-review-1.md` in full (finding 1's brief and intent, its closure table, its Known regressions, deferred and Approach decisions); `.epic-loop/stage2/proposals.md`. No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply.
**Date:** 2026-11-02
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | clean |
| Lint | `pnpm lint` at `7048fe3` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 70 files, 1767 passed, 4 skipped, first run |
| Build | `pnpm build` | clean |
| E2E | `pnpm test:e2e` (OS-assigned ports) | 56 passed |
| Review 1 finding 1 closed against its intent | the remediation's four new tests copied onto `16efdd4` in a scratch worktree, `pnpm exec vitest run test/propresenter.test.ts -t "went early\|over Chorus 1 after\|of no length\|behind the playhead is set by hand"` | `:2849` (review 1's repro, renamed) red at `16efdd4`, green at HEAD; the three guard tests `:2866`, `:2879`, `:2893` green at both, by design, since they pin behaviours the old code already had |
| Guard tests can go red | mutations at HEAD in a scratch worktree: M1 the beat condition dropped (`wrapsFirst && entry.early`), M2 the `brace.length > 0` guard dropped, M3 the playhead check dropped (`wrapsFirst = braceEnd !== null`) | M1 turns `:2866` red, M2 turns `:2879` red, M3 turns `:2893` red; each alone. The finder also ran the pre-fix line (`:2849` red) and `> braceEnd + EPSILON` at the end (`:2849` red) |
| Finding 1, a brace moved by hand while the loop is on | `repro/review-2-finding-1-test.diff` applied in a scratch worktree at `7048fe3`, `pnpm exec vitest run test/propresenter.test.ts -t "review 2 finding 1"` | red: triggers 5, 6, 7, 6, 7 where 5, 6, 7 is right. Green with the pre-fix `observed()` line restored, so introduced by `b17563f` |
| Finding 1, candidate fix | `repro/review-2-finding-1-candidate.diff` plus the test diff in the same scratch worktree, `pnpm exec tsc --noEmit -p .`, `pnpm exec vitest run test/propresenter.test.ts` | typecheck clean; 163 of 163 green, the repro and review 1's four tests included |
| Review 1's three deferred verify items | finder: read `playback-controller.ts` (`onChange` once per Live event), `cues.ts` `moved()`, and probes on the fake Live | (a) not reachable, Dismissed; (b) holds by reading, not a regression, Minor; (c) holds, Comment hygiene |
| Brace set ahead of the playhead, ending on the early mark | finder probe: brace [111.5, 112) at 111 after Verse 3's slide 7 went at 110 | HEAD sends Chorus 1's slide 6 at once and nothing again at 111.5 (right); the pre-fix code left slide 7 up while Live loops in Chorus 1 |
| Shipped copy | `git diff 16efdd4 -- src README.md docs/install.md config \| grep '^+.*—'` | no em-dash added |
| Tautology audit (Phase 4.5) | the four tests, by the base runs and mutations above, and read for the six shapes | no tautology; see Test quality |
| Not run | the real ProPresenter and Live; whether real AbletonOSC reports a brace's start before its length | #284 is Nick's home run; guardrails forbid driving Live |

**Overall:** Review 1's finding 1 is fixed against its intent: the wrap's slide now goes the lead early when the loop goes on after the next section's first slide went, and each of its three guards is pinned by a test that goes red without it. The fix adds one LOW: a brace moved by hand at the laptop, while the loop is already on, can flash the wrong slide for the moment between Live's two brace reports. Zero MEDIUM or higher. The branch is ready for a PR; finding 1 and the carried LOWs can ride along or become follow-ups.

## Approach decisions
- Loop change with a slide already sent early (review 1 finding 1, as remediated): `observed()`'s loop branch forgets a wrap's mark, and, while the playhead is before the new brace's end, any mark at or past that end; a loop of no length has no end there, matching `ahead()`'s `brace.length <= 0` reading. The schedule is not taught a second path.
- Brace changes while the loop stays on (review 2 finding 1, recommended): the "mark at or past the end" rule applies only when the loop turns on, from off or from a loop of no length. A brace moved by hand while the loop is on forgets only a wrap's mark, as before review 1's fix. This narrows the rule above; it does not replace its mechanism.

## Confirmed Issues

### 1. A brace moved by hand while the loop is on, start and length both, flashes the looped section's slide and then sends the slide that went early again — LOW
- **Location:** `src/server/connections.ts:692-696` (`observed()`, loop branch)
- **Attribution:** introduced by the remediation, `b17563f` (setlist-controller#275 pre-PR review 1 finding 1: a loop turned on after the next section's first slide went early sent the wrap's slide on the downbeat with no lead). The repro is green with that commit's `observed()` line reverted to `if (entry.early?.wrap) entry.early = null;`. Not named in review 1's closure table or Known regressions, deferred.
- **Real-world trigger:** at the laptop, with Live's loop already on, someone drags a brace's left edge, which changes its start and its length, at the moment the playhead is within the lead of a slide that already went early, and the in-between brace (new start, old length) ends between the playhead and that slide's beat. Live reports `loop-start` and `loop-length` as separate events, and `playback-controller.ts:665-672` calls `onChange` for each. The leader's Loop button cannot cause it: it only turns a loop on from off (a second press turns it off), and the brace reports it asks for arrive while the loop is off, when `loop()` is null. Capped at LOW: a laptop-only path inside a window of at most `leadBeats`, and the wrong slide shows only for the time between Live's two reports. Upgrade to MEDIUM if real AbletonOSC reports a dragged edge as a stream of in-between braces over the drag, not one pair; check by logging Live's loop events while dragging a brace edge during playback.

**Evidence**
```ts
// connections.ts:692-696
const braceEnd = brace && brace.length > 0 ? brace.start + brace.length : null;
const at = position();
const wrapsFirst = braceEnd !== null && at !== null && at < braceEnd - EPSILON;
for (const entry of entries) {
  if (entry.early?.wrap || (wrapsFirst && entry.early && entry.early.beat >= braceEnd - EPSILON)) entry.early = null;
```

**Failure mode:** Ancient Gates, lead 2. The playhead reaches 111 and Verse 3's slide 7 (beat 112) went at 110. The loop is on over [64, 80), behind the playhead. At the laptop the brace becomes [96, 120). Live reports start 96 first, so the hub sees [96, 112): the playhead is before its end, and slide 7's mark (112) is at its end, so the mark is forgotten and the wrap's slide 6 (Chorus 1 at 96) goes at once. Then the length report gives [96, 120): the wrap's mark is forgotten, `following` looks ahead from the playhead, and slide 7 goes again at once. Triggers 5, 6, 7, 6, 7, where the final brace holds slide 7's beat and the right outcome sends nothing. Proved: `repro/review-2-finding-1-test.diff`, red with `expected [ …(5) ] to deeply equal [ …(3) ]`.

**Recommended fix** (`repro/review-2-finding-1-candidate.diff`):
```diff
       if (!sameLoop(brace, seenLoop)) {
+        const turnedOn = seenLoop === null || seenLoop.length <= 0;
         seenLoop = brace;
         const braceEnd = brace && brace.length > 0 ? brace.start + brace.length : null;
         const at = position();
-        const wrapsFirst = braceEnd !== null && at !== null && at < braceEnd - EPSILON;
+        const wrapsFirst = turnedOn && braceEnd !== null && at !== null && at < braceEnd - EPSILON;
```
Then correct the two comments that state the rule, `connections.ts:68-70` (module header) and `:93-95` (`observed()`), to say the mark at or past the end is forgotten when the loop goes on, and that a loop of no length counts as no loop.

**Remediation brief**
- **Design intent:** The hub keeps at most one waiting change per target (`pending`) and one mark (`early`) for the last change sent ahead of its beat; the mark stops that beat, or a wrap's loop cue, from sending it twice. On any loop change every waiting change is dropped and `scheduleFromPlayhead` looks ahead on the new path. A non-wrap mark at or past the new brace's end describes a screen the band will not reach before the wrap, so it must not steer the look-ahead. That case arises from the leader's Loop press, which always turns a loop on from off. A brace that moves while the loop stays on comes from the laptop, and Live reports its start and length one at a time, so the hub cannot tell an in-between brace from a final one.
- **Full surface:** `src/server/connections.ts:689-696` (the `turnedOn` line goes before `seenLoop = brace`, since it reads the old brace), and the comments at `:68-70` and `:93-95`. `following` (:459), `ahead` (:433), `wrapOf` (:419), `fire` (:495) and `deliver`'s `wrapped` rule stay as they are.
- **Must preserve:**
  - Review 1 finding 1's four tests, each named in full: `:2849` "brings Chorus 1's first slide back at once when the loop goes on after Verse 3's first slide went early, and sends no later slide", `:2866` "never sends Chorus 1's second slide again when the loop goes on over Chorus 1 after that slide went early", `:2879` "never sends Verse 3's first slide again when Live reports a loop of no length ahead of the playhead after that slide went early", `:2893` "never sends Verse 3's first slide again when a brace behind the playhead is set by hand after that slide went early". All four turn the loop on from off, so `turnedOn` is true for them.
  - A wrap's mark is still forgotten on every loop change, on or not (`:2834`).
  - A loop of no length going to a positive one counts as turning on (`turnedOn` reads `seenLoop.length <= 0`).
  - All of `test/propresenter.test.ts` (163 with the repro) green, as the candidate run showed.
- **Dropped, intended:** a brace shrunk or moved by hand while the loop is on, so that its new end falls between the playhead and a slide that already went early, goes back to the behaviour before review 1's fix: the wrap's slide goes on the wrap's downbeat, not the lead early. That is the same laptop-only path class as this finding, and it delivers the right slide late rather than a wrong slide. No test pins it today; the remediator may add one asserting the downbeat send.
- **Failure of the fix itself:** if Live ever reports a brace change while the loop is on as one atomic report, the narrowed rule still sends the wrap on its downbeat with no lead, never a wrong slide. The backstop is `deliver`'s loop cue, unchanged.
- **Do not touch:** `server.ts`'s `CANCELS_SCHEDULE` and the absence of `'loop'` from it (Dismissed in review 1); `fire`'s `sameLoop` check; the `playback-controller.ts` order of loop events (coalescing Live's split brace reports is a separate design, see Before opening the PR).
- **Proof:** `git apply docs/reviews/setlist-controller-275/repro/review-2-finding-1-test.diff && pnpm exec vitest run test/propresenter.test.ts -t "review 2 finding 1"` is red now and must be green after. Keep the test, renamed without the "review 2 finding 1" prefix. A mutation removing `turnedOn &&` must turn it red again.

### 2. The pre-service check says a one-slide group in a section shorter than a bar is "changed on beats" — LOW
Carried from review 1 finding 2, untouched (deferred as LOW tail).
- **Location:** `src/server/propresenter.ts:842-844`
- **Attribution:** introduced, `4cd3e22` (setlist-controller#280 Slides move inside a section on an even split of its bars).
- **Real-world trigger:** a 2-beat section, such as a pickup bar or a short Tag, whose group holds one slide. Capped at LOW: check noise; the plan itself is right.

**Evidence**
```ts
const bars = Math.floor(length / bar + EPSILON);
if (group.slides.length <= bars || onBeats.has(key)) return;
check.unmatched.push(`${title}: ${section.name} has ${counted(group.slides.length, 'slide')} in ${counted(bars, 'bar')}, changed on beats`);
```
**Failure mode:** length 2 in 4/4 gives `bars = 0`, so `1 <= 0` is false and the check reads "Tag has 1 slide in 0 bars, changed on beats" for a section that changes nothing.
**Recommended fix:**
```diff
-      if (group.slides.length <= bars || onBeats.has(key)) return;
+      if (group.slides.length <= Math.max(bars, 1) || onBeats.has(key)) return;
```
**Remediation brief**
- **Design intent:** the note flags each section where `evenSplit` (`propresenter.ts:1035`) switches from bars to beats, which happens only with more than one slide to place and more slides than whole bars.
- **Full surface:** `src/server/propresenter.ts:842`.
- **Must preserve:** the note for a section with more slides than bars, `test/propresenter.test.ts:2241` ("sends the three slides of a 2-bar Verse 3 on beats 0, 3 and 5, and the check notes it"), and the check lines asserted at `:2041`.
- **Do not touch:** `evenSplit`'s `break` at or past the section's end (Minor).
- **Proof:** a new check test with a 2-beat section matched to a one-slide group, asserting no "changed on beats" line; red now.

### 3. Two fallback paths of the slide timing file have no test — LOW
Carried from review 1 finding 3, untouched.
- **Location:** `src/server/propresenter.ts:968` (`changes on a section with no end`) and `src/server/slide-timing.ts:54` (`cannot be read`, a read error other than a missing file)
- **Attribution:** introduced, `420ea07` (setlist-controller#283 The slide timing file: per-song exceptions for the slide changes and the group).
- **Real-world trigger:** an entry with `changes` on a song's last section when the song has no End, or a path that is a folder or unreadable. Capped at LOW: both paths are correct by reading; this is the "a test for every fallback path" rule.

**Evidence:** `grep -rn "with no end\|cannot be read" test/propresenter*.ts` finds nothing.
**Recommended fix:** two check tests in `describe('the slide timing file')` (`test/propresenter.test.ts:3068`). The first writes an entry with `changes` for a section with no end and expects that problem line, with the section falling back to its single slide. The second gives a `slideTimingPath` that is a folder (EISDIR) and expects one problem starting `slide timing file <path>: cannot be read:`.
**Remediation brief**
- **Design intent:** each rule that rejects an entry or the file is a problem line, and the section falls back to the even split and the name match. A file problem means no exceptions at all.
- **Full surface:** tests only, in `test/propresenter.test.ts` beside `:3205` and `:3223`.
- **Must preserve:** a missing file stays no exceptions and no problem (`:3214`, "checks as with no file when the file at the path is missing").
- **Do not touch:** the rule order in `resolveEntry` (`propresenter.ts:947`), since the copy names the first rule broken.
- **Proof:** each new test goes red under a mutation that removes its rule: delete `propresenter.ts:968`, or make `slide-timing.ts:54` `return NO_SLIDE_TIMING`.

### 4. Four lead and timing-file tests would stay green if their setup silently stopped doing what they assume — LOW
Carried from review 1 finding 4, untouched; line numbers moved by the remediation's 61 added test lines.
- **Location:** `test/propresenter.test.ts:2545`, `:3190`, `:3205`; `test/propresenter-adapter.test.ts:184`
- **Attribution:** introduced, `a6808b0` (#281), `420ea07` (#283), `4cd3e22` (#280).
- **Real-world trigger:** none for users; a coverage claim the tests do not fully make. LOW because sibling tests on the same setups prove each positive half.

**Evidence and failure mode:**
- **:2545** ("never sends a change scheduled early once a jump is tapped, and the landing sends the target's own slide") stays green with `connections.cancel()` removed from `server.ts:202`: a waiting jump makes `predict` null, so `fire` drops the change anyway. Strengthen it by reporting the landing late enough that the prediction is back before the old send time, or rename it to the fire-time guard it proves.
- **:3190** ("sends Verse 3's even split when its entry's changes do not go up") and **:3205** ("still clears for the Outro when its entry's group is past the presentation's groups") assert only fallback behaviour and were green before the timing file existed. Add an assertion that the check names the entry as a problem.
- **`propresenter-adapter.test.ts:184`** ("moves the expected slide to the slide a Next slide press brings while a trigger is out"): the 700 ms delay is keyed to `isTrigger`; if the trigger path changed shape, the scenario would vanish silently. Assert `rig.triggers()` holds the index trigger before Next is pressed.
**Remediation brief**
- **Design intent:** a cancel or fallback test should fail when the behaviour it names is removed, not only when the feature as a whole regresses.
- **Full surface:** the four tests above.
- **Must preserve:** every current assertion; strengthen, delete none. `:2526`, `:2561` and the Fade out test stay as they are.
- **Proof:** for `:2545`, replacing `if (CANCELS_SCHEDULE.has(command.kind)) connections.cancel();` at `server.ts:202` with `void CANCELS_SCHEDULE;` must turn the test red, or the test is renamed to the fire-time guard it proves. For `:3190` and `:3205`, deleting the rule each entry breaks in `resolveEntry` must turn the new problem assertion red.

### 5. Comment hygiene — LOW (aggregated)
Review 1 finding 5's four entries, untouched, plus one from this delta. If finding 1 is remediated, its comment changes at `connections.ts:68-70` and `:93-95` cover the first entry.
- `src/server/connections.ts:68-70` and `:93-95` — "while the playhead is before the new brace's end" → "while the playhead is before the new brace's end (a loop of no length counts as no loop)"
- `src/server/slide-timing.ts:28-29` — "and no earlier entry names the same section occurrence" → "and no earlier valid entry names the same section occurrence"
- `docs/install.md:281` — "and no earlier entry names the same section." → "and no earlier valid entry names the same section."
- `docs/install.md:281` — "Only the songs in the set are checked, so an entry for a song this week does not play says nothing." → "Only the songs in the set that ProPresenter can trigger are checked, so an entry for a song this week does not play, or for one with no authorized presentation on Master, says nothing."
- `README.md:49` — "…Fire again send the slide for where the playhead is, and the leader's Stop and a jump drop a slide change not yet sent." → "…Fire again send the slide for where the playhead is." (the cancel sentence earlier in the paragraph already says it)

## Needs Further Investigation

### A. The check and the cues use one bar length for the whole set, Live's last reported signature — confirm whether any song in a real set has its own meter
Carried from review 1, unchanged. `checkLines`, `resolveEntry` and `plan` take the `bar` from `controller.barLength()`. A 6/8 song checked while Live reports 4/4 would get spurious "changed on beats" notes. The spec says "the bar length from the time signature it already tracks", so the code conforms. Held as proposal 6 (#280 prep). Confirmed by a set whose songs differ in meter, plus a check of whether AbletonOSC reports the signature per locator or once per set.

### B. A section cue in the moment between the leader's Stop and Live's report of the stop may schedule a new change
Carried from review 1, unchanged. `cues.ts` gates `onMove` on `stopped` but not `raise`, and `predict` still answers while the stop is only asked for. Confirmed by a test that crosses a section start between `leader.send({ kind: 'stop' })` and the fake Live's stop report, with the next change within 2 beats.

## Reviewed and Dismissed
- Review 1's deferred item (a), `moved()` running before `observed()` on one state that carries a loop change and a playhead move — not reachable. `playback-controller.ts` calls `onChange(snapshot())` once per Live event; the `loop`, `loop-start` and `loop-length` cases change only `liveLoop`, so a loop report never moves `position`, and `cues.ts` `moved()` returns on `from === to`. The proposal "A loop change and a playhead move in one state update can send a later section's slide past the new brace" in `.epic-loop/stage2/proposals.md` can be dropped on this evidence.
- A brace set ahead of the playhead that ends on the early mark — the fix forgets the mark and sends the looped slide at once; executed, and correct (the pre-fix code left the next section's line up while Live loops).
- A mark exactly on the brace's end is forgotten (`>= braceEnd - EPSILON`) — Live wraps and never plays that beat; the test is the exact complement of `ahead()`'s `next.beat < end - EPSILON`.
- Loop off, unknown playhead, loop of no length — `braceEnd` null or `wrapsFirst` false, so only a wrap's mark is forgotten, as before the fix.
- Everything review 1 dismissed stands; the delta touches none of it.

## Minor / nits
- Review 1's deferred item (b): when the brace's start and the next section's first slide show the same index, the wrap sends that index again at once. Not a regression: before the fix the same duplicate went on the wrap's downbeat. Optional: when the wrap's song and slide equal the forgotten mark's, set the mark to the wrap instead of sending.
- `wrapsFirst` reads the last reported position, which trails the real playhead. A loop turned on just after Live crossed the brace's end forgets the mark, but `schedule` refuses since `predict(change.beat) <= now`, so the worst case is the next section's first slide sent again on its downbeat, the same slide. Reasoned, not executed.
- No test sends a position report between an early wrap and its downbeat (`:2849` plays straight across the wrap). The path reads sound: `following` returns null for a wrap mark.
- Review 1's six Minor items stand unchanged: `propresenter.ts:1043-1047` drops slides past whole beats; `:969-970` reads "needs -1" for an empty group; `:829-830` counts a redirected section; `test/fake-propresenter.ts:291-299` throws on a forced 204 out of range; `test/fake-propresenter.ts:133-139` maps non-string text to `''`; `propresenter.ts:651-653` "Trigger refused" names no slide index.

## Test quality
Tests added in the delta: 4, all in `test/propresenter.test.ts` (`:2849`, `:2866`, `:2879`, `:2893`).

Green against `16efdd4`, the last reviewed commit: 3 (`:2866`, `:2879`, `:2893`). Each pins a behaviour the old code already had and the fix had to keep (a mark inside the brace, a loop of no length, a brace behind the playhead), so green there is expected. Each goes red under the mutation that removes its guard (M1, M2, M3, executed). `:2849` is review 1 finding 1's repro, red at `16efdd4`.

Tautology shapes found: none. Expectations are literal trigger lists, nothing is mocked, no assertion is call-shaped only, no snapshots.

## Prior-review closure
Review 1 (`pre-pr-review-1.md`) confirmed 5 findings.
- **Fully fixed: 1.** Finding 1 (MEDIUM): the repro is red at `16efdd4` and green at HEAD, all three guards in its Must preserve are pinned by tests that go red without them, and the rework's no-length rule matches `ahead()`. It begets finding 1 here (LOW), a laptop-only narrowing, not a reopening.
- **Partially fixed: 0.**
- **Untouched: 4**, all LOW and deferred by the remediation as "LOW tail, not worked this round": findings 2, 3, 4 and 5, carried here as 2, 3, 4 and 5.
- Review 1's Known regressions, deferred: item (a) Dismissed, item (b) Minor, item (c) Comment hygiene entry 1.

The Confirmed list shrank from 1 MEDIUM and 4 LOW to 1 new LOW and the 4 carried LOWs.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` (first run), build and e2e all green at `7048fe3`.
- **Commit hygiene:** commit this doc and the two `repro/review-2-*` diffs.
- **Likely reviewer asks:** the home run (#284) against the real ProPresenter; whether AbletonOSC reports a dragged brace edge as one start and one length report or a stream of them (it decides finding 1's cap). Coalescing Live's split brace reports in the playback controller would also stop the wrap's slide being re-sent once per in-between brace during a drag, which predates this branch; that is a follow-up design, not this PR.

## Verdict
Ready to open a PR, with follow-ups. No gate: zero CRITICAL, HIGH or MEDIUM. Review 1's one MEDIUM is fixed against its intent. Finding 1 here is a LOW introduced by that fix on a laptop-only path, and the recommended narrowing can ride along or become a follow-up; findings 2 to 5 are review 1's LOW tail, still open. A and B need a check, not a fix.
