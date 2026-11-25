# Pre-PR review: setlist-controller#101 Rehearsal: count-off into a section (follow-up fixes #235, #236, #237)

**Branch:** `setlist-controller-101-count-off-into-section` vs `origin/main` (merge-base `6cf5454` "Merge pull request #238 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `29423a0` (setlist-controller#235 A count-in drops or sticks when one message to or from Live is lost or late), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 10 files total, +549 / -78
**Delta under review:** none; a fresh review (`--fresh`) of everything since the merge-base. The branch carries three tickets: #236 (`e122bd7`, merged `2c7561f`), #237 (`06ce6ae`, `c7c343c`, merges `910d68e`), #235 (`fbbe19a`, `29423a0`, merge `a82f23c`).
**Reviewed against:** the epic body of setlist-controller#101 (the spec) and the bodies of #235, #236 and #237, whose "Done when" sections are the requirements here. `pre-pr-review-1.md` and `pre-pr-review-2.md` in this folder were read for their Approach decisions, dismissals and Needs Further Investigation only; they reviewed the count-in feature that PR #238 landed on `main`, not this delta. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape.
**Date:** 2026-10-23
**Reviewer:** 2 code-review agents + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | pass at `29423a0`; the two review-3 files under `repro/` pass `pnpm exec eslint docs/reviews/setlist-controller-101/repro/` |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 67 files, 1492 passed, 4 skipped |
| Build and Playwright | `pnpm test:e2e` (builds first) | 50 passed, WebKit iPad and Chromium Android |
| Tautology audit, oracle `6cf5454` | HEAD's five changed test files copied into a scratch worktree at the merge-base | 14 new tests (each `it.each` row counted): 11 red, 3 green. The 3 green are guard rows by design, each red under a targeted mutation of HEAD's source (see Test quality). No tautology shapes |
| Server-layer finder | `pr-review-finder` over `src/server/playback-controller.ts` and the four server test files, 5 scratch repros | 10 candidates, 4 executed red |
| Page-layer finder | `pr-review-finder` over `src/shared/count-in.ts`, `web/src/{App,NowPlaying,SectionControls}.tsx`, `test/pages.test.ts` | no correctness defect; `countInLandsOn` matches the server's `landsOn` on a 23-cell matrix; 8 coverage, duplication and comment candidates |
| Findings 1 to 3 proof | `repro/review-3-count-in-held-reports.test.ts` (6 rows) in `test/` of scratch worktrees | HEAD `29423a0`: 5 red, 1 green (finding 3's control row). Merge-base `6cf5454`: 4 red, 2 green (finding 1's two rows) |
| Findings 1 to 3 candidate | `repro/review-3-candidate.diff` applied at HEAD in a scratch worktree, the repro in `test/` | `tsc` clean; `vitest run` 68 files, 1498 passed, 4 skipped. Worktrees removed |
| Em-dashes in shipped copy | `git diff 6cf5454 -- src web` | none |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #217 is Nick's run on real Live |

**Overall:** The three tickets mostly land. #236's three cases and #237's two are each proved by a test that is red at the merge-base, and #235's four proofs all turn green. One regression came in with #235's case 2 fix: once a count-in's Count Off has been reached, the server keeps the count-in through any report at all, so if the playhead is moved away during the count, Live gets dragged back to the target from wherever it is (finding 1). Two #235 cases are closed only in the form their proofs used (findings 2 and 3). The three findings have one combined candidate fix, about 6 lines, that keeps the full suite green. Fix finding 1 before the PR opens. Findings 2 and 3 are cheap and belong to #235's own scope. Findings 4 and 5 are LOW: a rule duplicated between the server and the page, and a sibling of #237 on the jump buttons.

## Approach decisions
- **What proves a count-in's Count Off jump lost (#235 case 1, carried forward):** only a report while Live plays. A report while stopped is a tap's report on its way. `countIn.reached` records that a report put the playhead inside the Count Off. Precedent: `lost()`'s "a report outside the target past that bar line is proof".
- **The late send when no report came in the Count Off's last bar (#235 case 2, amended here by finding 1):** the jump goes on the first report in the bar after the Count Off ends, and Live makes it on the bar line after, as for a late tap. A report outside `[Count Off start, Count Off end + one bar)` that is not in the target proves the count-in over, as it did at the merge-base. Precedent: `lost()`'s one-bar allowance past `barLine` (`after >= barLine + barLength() + EPSILON`).
- **An unsent count-in's landing (finding 2, new):** while the count-in's own jump has not been sent, the only landing is playback, with Live playing, from a reached Count Off into the target. A report while stopped never lands it. Precedent: `countOffLost`'s own `playing` rule above.
- **Seeding `reached` (finding 3, new):** a press with Live already stopped on the Count Off's start beat starts with `reached` true, since the jump to it moves nothing and Live sends no report for it. Precedent: `jumpTo`'s own "already there" check (`!playing && position !== null && Math.abs(position - target.time) < EPSILON`).
- **One copy of the count-in landing rule (finding 4, new):** the server's `landsOn` calls `countInLandsOn` from `src/shared/count-in.ts`, as the count-in command and `SongHeading.tsx` both call `countInFor`.
- **Late jumps keep every old target they replaced on the same bar line (#236, carried forward):** module-level `replaced: { barLine, starts[] }`, for every jump, not only a count-in's. Precedent: the count-in's `replaced` it replaced.
- **A change during the count while a lost Stop waits is sent (#235 case 3, carried forward):** the count-in's own first jump never goes while a stop waits; a change to a jump already sent goes. Should the stop reach Live, the change moves the stopped playhead, as a tap right after the stop does.
- **Stop with a count-in held on a stopped Live (#235 case 4, carried forward):** the start-wait timer is replaced by one of `LOOP_REPORT_MS`. Review 2 had recommended clearing at once (`repro/review-2-candidate-stop.diff`). The branch chose the 1 s wait so that a start report on its way is not taken for a stopped Live, and the guard row "delivers no cue when Stop is pressed before Live reports the start" pins that choice.

## Confirmed Issues

### 1. A count-in whose Count Off has been reached is held through any report, so if the playhead moves away, Live is dragged back to the target — MEDIUM
- **Location:** `src/server/playback-controller.ts:285` and `:464`
- **Attribution:** introduced by `fbbe19a` (#235). At the merge-base, `countOffLost` returned `!inCountOff(after)` unless the report entered the target from the Count Off, and `sendCountIn` returned on `position >= end`. Both bounds are gone at HEAD (`git log -S'countIn.reached' 6cf5454..HEAD` gives `fbbe19a` only). Both finding 1 rows of the repro are green at `6cf5454` and red at HEAD.
- **Real-world trigger:** during a count-in, someone at the laptop moves Live's playhead: they click in the arrangement, or press a locator in Live. In rehearsal Nick often sits at the laptop. No page command produces this, because every page jump runs `jumpTo`, which ends the count-in. MEDIUM, capped. Raise it to HIGH if Live itself can move the playhead out of a Count Off with no command from the server. #217 can check that by watching for a playhead move during a count-in with a brace set ahead of the playhead.

**Evidence**
```ts
// :278-286
const countOffLost = (after: number) => {
  if (!countIn || countIn.sent) return false;
  const { time, end } = countIn.countOff;
  if (after >= time - EPSILON && (end === null || after < end - EPSILON)) {
    countIn.reached = true;
    return false;
  }
  return playing && !countIn.reached;
};
// :464, in sendCountIn
if (end === null || position < end - barLength() - EPSILON) return;
```

**Failure mode**
- **Count in, then the playhead moves into another song.** Count in to song 1's Bridge from stopped (Count Off 0 to 8, Bridge at 40). Live plays to beat 2, then the playhead moves to 72 in song 2. `countOffLost(72)` is false, because `reached` is set. `sendCountIn` sees `72 >= 4` and sends the Bridge jump, so Live jumps from song 2 back to song 1's Bridge on the next bar line. The pages read "Count in to Bridge." the whole time. Repro row "sends no jump back to the target once Live plays in another song": HEAD gives `countIn: true`, jumps `[0, 3]`; the merge-base gives `countIn: false`, jumps `[0]`.
- **Count in, then the playhead moves to before the Count Off.** Count in to song 2's Verse (Count Off at 24). Live plays to 26, then the playhead moves to 2 in song 1. The count-in stays held while `now` reads song 1, until playback reaches beat 28, where the send fires. Repro row "ends a count-in once Live plays before its Count Off".
- The same missing upper bound lets a Next, a Previous or a tap during the count send the first jump at once, when the controller's position is stale and past the Count Off (Needs Further Investigation A).

**Recommended fix**
```diff
@@ countOffLost
-    return playing && !countIn.reached;
+    if (!playing) return false;
+    if (!countIn.reached) return true;
+    return !inTarget(after) && (after < time - EPSILON || (end !== null && after >= end + barLength() - EPSILON));
@@ sendCountIn
-    if (end === null || position < end - barLength() - EPSILON) return;
+    if (end === null || position < end - barLength() - EPSILON || position >= end + barLength() - EPSILON) return;
```
These are the first and third hunks of `repro/review-3-candidate.diff`.

**Remediation brief**
- **Design intent:** a held count-in that has not sent its jump is waiting for Live to play the Count Off. `countOffLost` decides on each position report whether the count-in is over. Before the Count Off is reached, any report while Live plays outside it proves the jump to the Count Off was lost (#235 case 1). After it is reached, only two kinds of report keep the count-in: one inside the Count Off, and one in the bar after it ends, which is #235 case 2's late send. A report in the target is the landing, which `landed()` decides, so it is never "lost". Anything else means Live is playing somewhere the count-in did not put it, so the count-in ends and no jump is sent. `sendCountIn` only ever sends in the Count Off's last bar or the bar after it.
- **Full surface:**
  - `src/server/playback-controller.ts:285` (`countOffLost`'s return) and `:464` (`sendCountIn`'s bound).
  - The comment at `:268-277` says "a report past it is Live playing out of it with no report in its last bar: the count-in holds". It must name the one-bar limit.
  - The comment at `:456-460` says "With no report in that bar, it goes on the first report past it". It must say "on the first report in the bar after it".
  - The test goes in `test/count-in.test.ts`, in the describe that holds "is sent on the first report past the Count Off when none came in its last bar" (`:153`). Move the two finding 1 rows from `repro/review-3-count-in-held-reports.test.ts` there, adapted to that file's `SET` and helpers.
- **Must preserve:**
  - `test/count-in.test.ts:153` "is sent on the first report past the Count Off when none came in its last bar, and lands on the next bar line". Its 8.5 report is inside the one-bar allowance.
  - The describes "a count-in whose jump to the Count Off is lost" (`:462`) and "a count-in pressed while the report of a tap is still on its way" (`:503`). Those reports arrive with `reached` false, and the `!countIn.reached` branch keeps them.
  - The `inTarget(after)` exclusion. Without it, a report that enters the target from the Count Off by playback, a retarget to the Intro included, would clear the count-in before `landed()` sees it. In `fromLive`'s `'position'` case the `lost(...) || countOffLost(...)` line runs before `landed(...)`.
  - The `!countIn.reached` branch must stay ahead of the `inTarget` exclusion. Take a lost Count Off jump on a Live stopped in the target: Live then plays the target with no count. That must clear the count-in, as it does at HEAD. If the exclusion ran first, the count-in would be held for good, because `sendCountIn`'s new bound never sends and `landed()` (finding 2) needs `reached`.
  - The `stopWait` behaviour in `sendTarget`. `test/count-in-change.test.ts` "goes to Live while a Stop that was lost waits" keeps passing under the candidate.
- **Failure of the fix:** if no report at all comes for more than a bar past the Count Off's end, the count-in ends and no target jump is sent. Live plays on from the Intro. That is the merge-base behaviour for that case and the same as a lost jump. The mark clears at once, so no page is left showing a count-in Live is not doing.
- **Do not touch:** the `replaced` lifetime and the `stopWait` rule in `sendTarget` (see Reviewed and Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-3-count-in-held-reports.test.ts test/ && pnpm exec vitest run test/review-3-count-in-held-reports.test.ts -t 'once Live plays'`. Both rows are red at HEAD and green with the hunks applied. Delete the copy from `test/` after moving the rows into `test/count-in.test.ts`.

### 2. A stale tap report that moves the playhead into a count-in's own target ends the count-in before Live starts — LOW
- **Location:** `src/server/playback-controller.ts:300-301` (`landed`), reached from `:576`
- **Attribution:** pre-existing. #235's fix closed this case only for a stale report outside the target. Both finding 2 rows are red at `6cf5454` and at HEAD. At the merge-base `countOffLost` cleared the count-in. At HEAD `countOffLost` correctly declines, but `landed()` treats the stale report as the landing: a forward move with `barLine === null`, or a backward move.
- **Real-world trigger:** Live stopped on the Bridge, and the page shows the Bridge. Within one report round trip (milliseconds on the church LAN), the leader taps another section, taps the Bridge again, and presses Count in. LOW: three presses inside a report round trip is barely attainable by hand. It is LOW and not a nit because it is #235 case 1's own mechanism, a stopped report read as proof. A producer pressing Count in at the moment the leader taps twice also reaches it.

**Evidence**
```ts
// :297-301
const landed = (before: number | null, after: number) => {
  if (!waitingJump || !inTarget(after)) return false;
  if (waitingJump.section === 'end') return true;
  if (before !== null && after < before) return true;
  if (barLine === null) return !inTarget(before);
```

**Failure mode:** Live is stopped at 40 (the Bridge) and replies are held. The leader taps the Verse (Live jumps to 24) and taps the Bridge (Live jumps back to 40; the server sees the target at its own position and keeps no waiting jump). The leader then presses Count in to the Bridge (Live jumps to 0 and starts). The replies arrive 24, 40, 0. On 40, `landed(24, 40)` returns true, and `waitingJump` and `countIn` go null. Live counts off into the Intro, and no Bridge jump is ever sent. In the backward form, tapping the Pad (48) and then the Bridge, `landed(48, 40)` hits `after < before`. Repro rows "holds a count-in whose target is the section a stale tap report moves the playhead back to" and "… moves the playhead back into from later" both give `countIn: false` at beat 0.

**Recommended fix**
```diff
@@ landed
     if (waitingJump.section === 'end') return true;
+    if (countIn && !countIn.sent) return playing && countIn.reached && !inTarget(before);
     if (before !== null && after < before) return true;
```
This is the second hunk of `repro/review-3-candidate.diff`.

**Remediation brief**
- **Design intent:**
  - An unsent count-in has no `barLine`. It holds `waitingJump` directly, and `jumpTo` never ran for it.
  - Its only real landing is playback, with Live playing, out of the Count Off it reached into the target. That covers a target retargeted to the section right after the Count Off, and a target Live's brace pulls the playhead into.
  - A report while Live is stopped is a move Live made before the press, never the landing. That is the same rule `countOffLost` uses for proof of loss.
  - The guard goes above the backward-move check, because a stale report can move backward into the target.
- **Full surface:**
  - `src/server/playback-controller.ts:300` (the new line goes between `:299` and `:300`).
  - The comment at `:288-296` gains the unsent count-in rule.
  - Tests go in `test/count-in.test.ts`, in the describe "a count-in pressed while the report of a tap is still on its way" (`:503`). Move both finding 2 rows there.
- **Must preserve:**
  - A sent count-in, and every ordinary jump, keep the `after < before` and `barLine === null` rules unchanged. `test/jump.test.ts` and `test/count-in-change.test.ts` pin them.
  - A retarget to the Intro during the count lands by playback with no jump sent. `test/count-in-change.test.ts`'s Intro rows pin it.
  - The landing cue with cause `count-in`. `test/count-in-cues.test.ts` pins it.
- **Failure of the fix:** suppose finding 3's seed is missing and `reached` stays false while Live plays. Then the count-in can never land by playback, and it holds until `countOffLost` ends it on the first report outside the Count Off (finding 1's `!countIn.reached` branch). So land finding 3 with this one, or the one-bar Count Off case regresses from "dropped" to "dropped a report later".
- **Do not touch:** `landed()`'s late-tap `lateBarLine` arithmetic below the new line.
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-3-count-in-held-reports.test.ts test/ && pnpm exec vitest run test/review-3-count-in-held-reports.test.ts -t 'stale tap report'`. Both rows are red at HEAD and green with the hunk applied.

### 3. With Live stopped on the Count Off's start, a one-bar Count Off with no report in it still drops the count-in — LOW
- **Location:** `src/server/playback-controller.ts:708`
- **Attribution:** pre-existing. #235 case 2's fix closed it only when the jump to the Count Off moves the playhead. The "Live stopped at 16" row is red at `6cf5454` and green at HEAD. The "Live stopped at 0" row is red at both.
- **Real-world trigger:** Live is stopped on a Count Off's first beat (a freshly opened set, whose song 1 Count Off sits at beat 0, or a Stop's report that leaves it there). The leader counts in, and no position report comes before the Count Off's last bar ends. LOW, capped: every Count Off in the library is 2 bars (the #101 spec), so "no report in its last bar" can only empty `reached` for a 1-bar Count Off. AbletonOSC reports the song time continuously while Live plays. Raise it to MEDIUM if the set builder ever writes a 1-bar Count Off; check with `grep -n "Count Off" src/set-builder/*.ts`.

**Evidence**
```ts
// :708
countIn = { countOff, sent: false, reached: false };
```

**Failure mode:** a 1-bar Count Off (0 to 4), Live stopped at 0, Count in to the Bridge. The jump to the Count Off moves nothing, and Live sends no report for an unchanged position. The first report is 4.5. `countOffLost(4.5)` is `playing && !reached`, which is true, so the count-in clears. Repro row "holds a count-in with no report inside a one-bar Count Off, Live stopped at 0": `countIn: false`.

**Recommended fix**
```diff
-          countIn = { countOff, sent: false, reached: false };
+          countIn = { countOff, sent: false, reached: position !== null && near(position, countOff.time) };
```
This is the fourth hunk of `repro/review-3-candidate.diff`.

**Remediation brief**
- **Design intent:** `reached` means the playhead is known to be in the Count Off, so the jump to it was made. A Live already stopped on the Count Off's start beat is there with no report to come. That holds whether the jump to the cue was lost or not, since Live would play from there either way.
- **Full surface:**
  - `src/server/playback-controller.ts:708`.
  - The `reached` sentence of the comment at `:136-138`.
  - A test in `test/count-in.test.ts` beside `:153`, with a fixture whose Count Off is one bar and a rig started at its start beat. Move the two rows from the repro; the "at 16" row is the control.
- **Must preserve:** a press from anywhere else starts with `reached` false. "a count-in whose jump to the Count Off is lost" (`test/count-in.test.ts:462`) depends on that.
- **Do not touch:** the start-wait timer armed on the next line.
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-3-count-in-held-reports.test.ts test/ && pnpm exec vitest run test/review-3-count-in-held-reports.test.ts -t 'one-bar'`. The "at 0" row is red at HEAD and green with the hunk applied; "at 16" is green at both.

### 4. The rule for which sections a count-in can land on now lives twice, and the server does not use the shared copy — LOW
- **Location:** `src/server/playback-controller.ts:490-495` and `src/shared/count-in.ts:39-42`
- **Attribution:** introduced by `06ce6ae` (#237). It added `countInLandsOn` for the page and left the server's `landsOn`, whose body is character for character the same (`git log -S'countInLandsOn' 6cf5454..HEAD`).
- **Real-world trigger:** none today. The page-layer finder ran both copies over a 23-cell matrix (sections before a Count Off, the Count Off, a mid-song Pad, out of range, a song with no Count Off) and they agree on every cell. LOW, capped: the risk is drift. A later edit to one copy breaks the "as the server judges them" promise silently, and the page would enable a Next the server ignores, which is #237 again.

**Evidence**
```ts
// playback-controller.ts:490-495
const landsOn = (address: SectionAddress) => {
  const song = set?.songs.find((candidate) => candidate.number === address.song);
  if (!song) return false;
  const rule = countInFor(song, address.section);
  return rule.kind === 'count-in' || (rule.kind === 'play-from-start' && song.sections[address.section - 1]?.name === COUNT_OFF);
};
```

**Recommended fix**
```diff
-import { COUNT_OFF, countInFor } from '../shared/count-in.ts';
+import { COUNT_OFF, countInFor, countInLandsOn } from '../shared/count-in.ts';
@@
   const landsOn = (address: SectionAddress) => {
     const song = set?.songs.find((candidate) => candidate.number === address.song);
-    if (!song) return false;
-    const rule = countInFor(song, address.section);
-    return rule.kind === 'count-in' || (rule.kind === 'play-from-start' && song.sections[address.section - 1]?.name === COUNT_OFF);
+    return song !== undefined && countInLandsOn(song, address.section);
   };
```

**Remediation brief**
- **Design intent:** the count-in rules live in `src/shared/count-in.ts`, so the server and the leader's page judge them alike. `countInFor` already works this way: the count-in command (`:688`) and `web/src/SongHeading.tsx:51` both call it. `countInLandsOn` is the landing rule for a held count-in's target, for Next, Previous and a tap.
- **Full surface:**
  - `src/server/playback-controller.ts:2` (the import) and `:490-495`. `COUNT_OFF` and `countInFor` stay imported, because `:61`, `:158-159` and `:688` still use them.
  - The comment at `:487-489` can shrink to a pointer.
  - `src/shared/count-in.ts:35-38` must then say the server uses it for taps too (see Comment hygiene).
- **Must preserve:**
  - `test/count-in-change.test.ts`'s Next, Previous and tap bound rows, which pin the server side.
  - `test/pages.test.ts` "enables Previous and Next during a count-in from its target, as the server judges them".
- **Proof:** a refactor with no behaviour change. `pnpm exec vitest run test/count-in-change.test.ts test/pages.test.ts` passes before and after. A mutation of `countInLandsOn` (for example dropping the `play-from-start` half) must then turn rows red in both files, where today it turns only `test/pages.test.ts` red.

### 5. During a count-in, the jump buttons stay enabled for sections of its song that the server ignores — LOW
- **Location:** `web/src/JumpTargets.tsx:37`, rendered from `web/src/App.tsx:73`
- **Attribution:** pre-existing, untouched (`git diff 6cf5454 -- web/src/JumpTargets.tsx` is empty). It is the sibling of #237, which fixed the same mismatch for Previous and Next only, and #237's body names only those two.
- **Real-world trigger:** during a count-in to the Bridge, the leader taps the Count Off, a Pad, or a section before the Count Off in the same song. The button looks live and the press does nothing, because the server returns on `!landsOn(command)` (`playback-controller.ts:656-657`). LOW: a confusing display with no wrong result. Follow-up ticket material.

**Evidence**
```tsx
// JumpTargets.tsx:37
disabled={!available}
```

**Recommended fix:** pass `countIn` to `JumpTargets` as `SectionControls` now gets it. While `countIn && jump !== null && jump.section !== 'end'`, disable each section of `jump.song` for which `!countInLandsOn(song, index)`, and leave other songs' sections enabled, since a tap there cancels the count-in and jumps.

**Remediation brief**
- **Design intent:**
  - During a count-in, a tap in its song moves the target, and only onto a section `countInLandsOn` accepts.
  - A tap in another song is an ordinary jump that ends the count-in.
  - The page enables only what the server acts on.
  - Precedent: `SectionControls.tsx:36-40`.
- **Full surface:** `web/src/JumpTargets.tsx` (its props and `:37`), `web/src/App.tsx:73`, and a `test/pages.test.ts` row beside "follows a count-in's target on the leader and producer pages".
- **Must preserve:** outside a count-in, every jump button reads exactly as it does today.
- **Proof:** a new `test/pages.test.ts` row that is red before the change.

### 6. Comment hygiene — LOW (aggregated)
- `web/src/SectionControls.tsx:12-13`: "which is Previous on the section right after the Count Off and Next on the last section before a Pad or End" → "in the library's songs, Previous on the section right after the Count Off and Next on the last section before a Pad or End; a Pad mid-song bounds both"
- `src/shared/count-in.ts:37-38`: "The server moves a held count-in's target with Next and Previous only onto such a section, and the page enables both from it." → "The server moves a held count-in's target with Next, Previous and a tap only onto such a section, and the page enables Next and Previous from it." (after finding 4; until then, it should not imply that the server calls this function)

## Needs Further Investigation

### A. A Next, a Previous or a tap in the moment after the press can send the first jump at once, from a stale position
After a press, `position` is still where Live stopped until the Count Off jump's report arrives. Suppose that report is lost, and a Next, a Previous or a tap arrives after Live's playing report. `retarget` then calls `sendCountIn`. The stale `position` (say 30) passes `position >= end - barLength()`, so the target jump goes out at once, while Live is in the Count Off's first bar, and the count is cut. The merge-base's `position >= end` bound blocked this. Finding 1's `sendCountIn` bound blocks it again for any stale position more than a bar past the Count Off. To confirm: lose the Count Off jump's position report but not the playing report. The fake Live has no per-reply loss, so this needs a harness hook. Then send `next` and assert that no target jump goes before beat 4.

### B. A late jump replacing a jump to End resets the chain of old targets
`jumpTo` takes `oldStart` from `sectionAt(set, old)`, which is `undefined` for `section: 'end'` (`src/shared/snapshot.ts:54`). So `replaced` becomes `null` and drops the starts gathered on that bar line. Example: tap A in time, late tap B, late Next to End, late tap C, all on one bar line. A report in A's first bar then clears C's mark a bar early, which is #236's defect again. Four presses inside 250 ms of a bar line. To confirm, add a `test/jump.test.ts` row with that sequence. To fix, keep the gathered starts when `oldStart` is undefined, and use the song's `end` beat for an End.

### C. A replaced old target that starts on a song's End can hold back a stop at End
In an overlap set, song 2's Count Off at 16 equals song 1's End. A late jump B on bar line 16 that is lost, after an old target A on song 2's Count Off, gets its report on 16 suppressed by `replaced`. If neither jump was made, "Stop at end" on song 1 may not fire. If Live made A, its playhead is on the same beat, so the two cases cannot be told apart from the report. To confirm, use `loseNext(JUMP)` on both jumps over `OVERLAP_SET` in `test/jump.test.ts`, and assert that a stop is sent.

Review 1's A (a Count Off off Live's bar grid) and C (Count in sends the section the page last saw) still stand for #217 and follow-up. Review 1's B became #235 case 3 and is closed here.

## Reviewed and Dismissed
- `sendTarget` sending a change while a stop waits, once the first jump was sent (#235 case 3). If the stop reaches Live, Live stops, the stop's report clears the count-in (`barLine !== null`), and the change then moves the stopped playhead, as a tap right after the stop's report would. Declared in the code comment and an Approach decision.
- Stop's `waitForStart(LOOP_REPORT_MS)` against a start report on its way. The start report cancels the timer (`if (event.playing) cancelStartWait();`), and the stop's report then clears the count-in (`stops && countIn`). A timer that fires after Live started is a no-op through its `playing` guard.
- The `replaced` lifetime. It is cleared by `clearJump`, on landing, by any jump that is not late, by a jump while stopped (`barLine` null), and by a count-in's first send (`old` null). No path carries it into an unrelated jump.
- `countIn.reached` mutated inside a predicate. It survives `retarget` (the spread keeps it) and stops mattering once the jump is sent.
- A second Count in press while the first waits for Live's playing report (page-layer finder F5). It re-runs the press through `startFromTop` or the count-in path, both of which `clearJump` first. Review 1 dismissed the same thing.
- The Next line naming a section of the target's song while `now` is still another song (page-layer finder F7). The ticket asks for "in the target's song", and the window lasts until the Count Off jump's report, which comes at once.
- `countIn` true with `jump` null or `'end'` on the page. `'end'` is unreachable while a count-in holds (`retarget` only sets a section, and `jumpTo` and `clearJump` null `countIn`). Both page guards fall back to today's rule anyway.

## Minor / nits
- A Stop lost in the Count Off's last bar now keeps the count-in. `stopWait` blocks the first send, and after `forgetStop` the jump goes on the next report and lands a bar late. At the merge-base the count-in ended on the first report past the Count Off. It is a reasonable behaviour (Live never stopped), but it is a fallback path with no test. The server-layer finder ran it (`T5` in its scratch) and the landing came at 40.5. With finding 1's bound, the send still falls inside the allowance, because `forgetStop` fires 1 s after the press. A test in `test/count-in-change.test.ts` beside "goes to Live while a Stop that was lost waits" would pin it.
- Stop pressed with less than `LOOP_REPORT_MS` of the Count Off left ends a never-started count-in later than the start-wait timer would have. Each further Stop restarts the 1 s. Bounded at 1 s.
- `countInLandsOn` has no unit test of its own. Finding 4 makes the server's tests pin it. Untested fallbacks: `SectionControls.tsx:36` with `held.song === undefined`, `NowPlaying.tsx:51` with `jump.section === 'end'` while `countIn`, and `NowPlaying.tsx:87`'s missing song. No page test renders the viewer page's Next line under `countIn`, though `Page` passes `countIn` to `NowPlaying` for every role.
- `test/pages.test.ts:194`'s `shape(...)` comparison checks only that the markup structure matches with and without `countIn`. The literal Next-line assertions beside it carry the test.

## Test quality
- **Tests added:** 14 (each `it.each` row counted).
- **Green against `6cf5454`:** 3. All three are guard rows by design, and each went red under a targeted mutation of HEAD's source:
  - "delivers no cue when Stop is pressed before Live reports the start" (`test/count-in-cues.test.ts`, from `fbbe19a`). Red when Stop's `waitForStart(LOOP_REPORT_MS)` becomes `clearJump()`.
  - "that comes second of two late changes neither Live made in time keeps the mark…" (`test/count-in-change.test.ts`, from `e122bd7`). Red when `starts` stops accumulating.
  - "enables Previous and Next from the section playing for a tap, as it does outside a count-in" (`test/pages.test.ts`, from `06ce6ae`). Red when the `countIn &&` guard is dropped.
- **Tautology shapes found:** 0. No test computes its expectation with a production helper, mocks the unit under test, asserts only call shape, uses a snapshot, or lacks assertions.
- **Coverage gaps:** the gaps are the branch's untested paths (findings 1 to 3 and the Minor list), not weak tests.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` pass at `29423a0`. The two review-3 files under `repro/` import `../src/...` and `./harness.ts` as if they sat in `test/`, as review 1's and 2's do. They pass `eslint`, which CI runs over the repo.
- **Commit hygiene:** this doc, `repro/review-3-count-in-held-reports.test.ts` and `repro/review-3-candidate.diff` are the only new files. `.epic-loop/` is the run's state, not the PR's.
- **Likely reviewer asks:**
  - Why Stop waits 1 s rather than clearing at once (an Approach decision).
  - Why every late jump now keeps a list of old targets.
  - Whether the count-in rule should have one home (finding 4).

## Verdict
**Not ready to open the PR as-is.** The gate is finding 1, a regression this branch introduced. Fix it before the PR: two hunks of `repro/review-3-candidate.diff`, with both of its repro rows moved into `test/count-in.test.ts` as the red-to-green proof. Findings 2 and 3 are LOW, but they are #235's own cases 1 and 2 in a form the proofs did not try. Their hunks come in the same candidate, and finding 2 depends on finding 3's seed, so land them on this branch too. Finding 4 is a short refactor, recommended here. Finding 5 and Needs Further Investigation A to C can ship as follow-up tickets. Ticket closure:
- **#236:** all three cases closed, each with a test red at the merge-base.
- **#237:** both cases closed, each with a test red at the merge-base.
- **#235:**
  - Cases 3 and 4 are closed.
  - Case 1 is closed for a stale report outside the target, and open for one inside it (finding 2).
  - Case 2 is closed when the jump to the Count Off moves the playhead, and open when it does not (finding 3). Its fix brought in finding 1.
- None of the three tickets was resolved only by a comment or doc edit.

## Remediation — 2026-10-23
Scope: CRITICAL, HIGH and MEDIUM, the default. Finding 1 is the only one in scope. Findings 2 to 6 are LOW and deferred to Nick, unfixed. The Verdict above recommends landing 2 and 3 on this branch as well, since they are #235's own cases; that is Nick's call to opt in.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `aefd03f` setlist-controller#101 pre-PR review 3 finding 1: A count-in whose Count Off was reached is held through any report, so a playhead moved away is dragged back to the target | red→green: `pnpm exec vitest run test/count-in.test.ts -t 'is never sent once the playhead'` (the two finding 1 rows, moved from `repro/review-3-count-in-held-reports.test.ts` into the describe "the jump to the target") | 0 new comments; the two comments the brief's Full surface names were corrected in place (net +1 line) | proved by execution: red before (`countIn: true`), green after; preserve suites `test/count-in.test.ts`, `test/count-in-change.test.ts`, `test/count-in-cues.test.ts`, `test/jump.test.ts` pass (102 tests) |
| 2 (LOW) | — deferred | — | — | LOW tail, not worked |
| 3 (LOW) | — deferred | — | — | LOW tail, not worked |
| 4 (LOW) | — deferred | — | — | LOW tail, not worked |
| 5 (LOW) | — deferred | — | — | LOW tail, not worked |
| 6 (LOW, comment hygiene) | — deferred | — | — | LOW tail, not worked |

After the round: `pnpm typecheck` and `pnpm lint` pass; `pnpm test` 67 files, 1494 passed, 4 skipped; `pnpm build` and `pnpm test:e2e` 50 passed. `repro/review-3-count-in-held-reports.test.ts` run in a scratch worktree at `aefd03f`: 3 green (finding 1's two rows and finding 3's "at 16" control), 3 red (finding 2's two rows and finding 3's "at 0" row, all deferred).

### Known regressions, deferred
- none

### Rework briefs
- none; no verify agent was dispatched, since the one fix is MEDIUM, its proof executed, and it touched no shared computation core.

### Approach decisions (this round)
- **Bounding a reached count-in (finding 1):** applied exactly as the Approach decision "The late send when no report came in the Count Off's last bar" records: `countOffLost` keeps a reached count-in only inside `[Count Off start, Count Off end + one bar)` or in the target, with the `!countIn.reached` branch ahead of the target exclusion, and `sendCountIn` sends only inside the same window. Landed without finding 2's `landed()` guard and finding 3's seed, which stay LOW and deferred; the finding 1 fix does not depend on either.
