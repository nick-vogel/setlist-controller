# Pre-PR review: setlist-controller#225 Chord and lyric view

**Branch:** `setlist-controller-225-chord-and-lyric-view` vs `origin/main` (merge-base `4c608d5`, Merge pull request #432 from nick-vogel/setlist-controller-134-propresenter-recordings)
**Reviewed at:** HEAD `32af179` (setlist-controller#225 pre-PR review 1 remediation closure table) + 0 files with uncommitted changes, 0 untracked files. Whole branch: 86 files, +8151 / −123.
**Delta under review:** since `6edac05` (setlist-controller#403 Chart view: Nashville numbers and a capo per song), the commit `pre-pr-review-1.md` reviewed: 17 files, +643 / −43, of which 13 are code, tests and docs (the remediation commits `e80972f`, `b85797f`, `09dda4c`) and 4 are review 1's own doc, repro and closure table.
**Reviewed against:** the epic body of setlist-controller#225 and the Approach decisions and closure table of `pre-pr-review-1.md` (findings 1 and 2 in full). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the spec, the prior briefs and the five universal rules are the checklist.
**Date:** 2026-11-11
**Reviewer:** 1 code-review agent + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | run in the worktree | already up to date |
| `pnpm lint` | run at 32af179 | green |
| `pnpm typecheck` | run at 32af179, and again with this review's repro in place | green |
| `pnpm test` | run at 32af179 | green, 93 files, 2771 passed, 4 skipped, no flakes |
| `pnpm build` | run at 32af179 | green |
| `pnpm test:e2e` | run at 32af179, both projects | green, 138 of 138, no flakes |
| Delta code, docs and tests | finder agent over the 13 files, 7 vitest files run (431 passed), a differential harness of `beatsPerBar(timeSignature(code))` against `barLength(code)` over all 495 codes Live can store | 0 divergences; findings 1, 2, 3 and the nits |
| Pad meter in the chart view | executed repro `repro/pre-pr-review-2.test.ts` in scratch worktrees at 32af179, at 6edac05, and at 32af179 with the recommended fix | 3 red at 32af179; at 6edac05 the 4/4-into-6/8 case red, the other two green; 3 green with the fix, with `test/chart-blocks.test.ts`, `test/pages.test.ts`, `test/readme-chart-view.test.ts`, `test/set-manifest.test.ts` (290 passed), typecheck and eslint |
| Tautology audit | the delta's six vitest files copied into a scratch checkout at 6edac05, then nine mutants at HEAD | every meter case red at 6edac05; the device-settings key case green there as expected (finding 2's proof) and red under its mutant; one mutant survives (finding 3) |
| e2e changes of prior finding 2 | read, not run alone (the full e2e run covers them green) | both can go red for the behaviour they name |

**Overall:** the remediation landed. Prior finding 2 is fully closed, and prior finding 1 is closed for every block of a song's own body, with its lookup pinned by mutants. Two residuals of finding 1 remain: a song's Pad block is counted in the song's own meter while the set builder plays it in the next song's, and one README sentence still says every block counts in 4/4. Both are LOW. No CRITICAL, HIGH or MEDIUM finding this round.

## Approach decisions
- Bar counts of blocks other than the current one: the set manifest carries each song's starting meter, and a block divides its beats by that meter's beats per bar (`beatsPerBar`, the formula of `barLength`). A manifest song with no meter counts 4/4. Carried from review 1, confirmed by Nick (close-out decision 17).
- Meter lookup in the chart view: the first manifest song whose title matches by the name rule, with or without chart text. Carried from review 1.
- **Added this round:** a song's Pad block (`isPad`, `src/shared/count-in.ts:16`) counts in the next song's beats per bar when a later song follows it, since the set builder starts the next song's meter on the Pad locator; a Pad or Pad Out after the set's last song counts in the song's own. This refines, not overturns, the starting-meter rule. Precedent: the server's `meterSong` (`src/server/playback-controller.ts:232-235`) gives a Pad or Pad Out to no song for the same reason, and `test/pre-service-check.test.ts:393-421` pins that Live reports the next song's meter in a Pad.
- Which manifest song a set song takes: the occurrence rule of `src/shared/occurrence.ts`. Carried from review 1 (its finding 3, LOW, still deferred).
- Whether a chart has chords: one shared predicate in `src/shared/chart.ts`. Carried from review 1 (finding 6, deferred).
- A rejected step in a promise chain: `.catch` and log, as `src/server/lateness-log.ts:86`. Carried from review 1 (finding 4, deferred).

## Prior-review closure
Prior doc: `pre-pr-review-1.md`, reviewed at `6edac05`.

| Prior finding | Status | Evidence |
| --- | --- | --- |
| 1 (MEDIUM) every block but the current one counts in 4/4 | **partially fixed** | The song body's blocks now count in the song's starting meter (`e80972f`, `09dda4c`), and the lookup is pinned against `songs[0]`, `findLast`, position, and first-with-any-meter mutants. Open: a Pad block before a song of another meter still differs from Live's count, which is this doc's finding 1, and `README.md:53` still says every block counts in 4/4, which is finding 2. |
| 2 (MEDIUM) three tests cannot go red | fixed | The tip test now visits the viewer page after the leader page and expects the tip; the view-only test counts one combobox and finds the Part select; `test/device-settings.test.ts:129` pins `setlist-controller.display.<Part>` against the real entries, red under a `displayKey` mutant. |
| 3 to 9 (LOW) | untouched, deferred by decision | The closure table's row reads "deferred, not worked this round, by the default scope". The delta does not touch their code: `chartForSong` (finding 3) and `docs/install.md:557, 561` (finding 7) are unchanged. |

Prior MEDIUM-or-higher findings left open: 1 (finding 1, partially fixed). None of them was deferred by decision.

## Confirmed Issues
### 1. A song's Pad block is counted in the song's own meter, while Live plays it in the next song's — LOW
- **Location:** `web/src/chart-blocks.ts:37`, fed by `web/src/ChartView.tsx:143`
- **Attribution:** two halves. For a song in 6/8 (or any meter but 4/4) that pads into a 4/4 song: **introduced** by `e80972f` (setlist-controller#225 pre-PR review 1 finding 1: every block but the current one counted its bars in 4/4...); the repro's first two cases pass at 6edac05, where every block counted 4/4 and the Pad was right by accident. For a 4/4 song that pads into a song of another meter: **pre-existing, untouched** since `7f6b875` (setlist-controller#396), the repro's third case red at 6edac05 and at HEAD.
- **Real-world trigger:** a `pad` transition between two songs of different meters, such as Great Are You Lord (6/8 in the fixture library) padding into a 4/4 song. The band member reading ahead sees "Pad 24 bars"; when the playhead reaches the Pad, the block shows Live's own "18 bars", and goes back to 24 when it leaves. LOW, capped: the band never comes in on a Pad (`src/shared/count-in.ts:7-8`), the pinned strip's countdown counts from Live's `now.bars` and is right, and the Pad block has no chart lines. Upgrade to MEDIUM if the band plays to the Pad's bar count from the section map, for example a swell timed to the next Count Off; ask Nick.

**Evidence**
```ts
// web/src/ChartView.tsx:143
const beats = beatsPerBar(charts?.songs.find((candidate) => title !== null && namesMatch(candidate.title, title))?.meter);
// web/src/chart-blocks.ts:37
bars: end === null ? null : Math.ceil((end - section.time) / beats - EPSILON),
```
The set builder: "before a pad, those at or after its Pad locator [go], so the Pad section holds the next song's starting values" (`src/set-builder/write-set.ts:248-249`), and the Pad is sized "rounded down to whole bars of the next song's starting meter" (`src/set-builder/timeline.ts:16-17`). The server's now-playing count divides by Live's live signature (`src/server/playback-controller.ts:991, 1003`).

**Failure mode** — Executed, `repro/pre-pr-review-2.test.ts` at 32af179: a 6/8 song's 72-beat Pad into a 4/4 song renders `expected '24 bars' to be '18 bars'`; with the playhead in the Pad and Live reporting 18, `expected '18 bars' to be '24 bars'` (the count changes when the highlight arrives, the symptom prior finding 1 named); a 4/4 song's 60-beat Pad into a 6/8 song, `expected '15 bars' to be '20 bars'`.

**Recommended fix**
```diff
--- a/web/src/chart-blocks.ts
+++ b/web/src/chart-blocks.ts
 import type { ChartLine, ChartSection } from '../../src/shared/chart.ts';
+import { isPad } from '../../src/shared/count-in.ts';
 import { matchSection } from '../../src/shared/occurrence.ts';
@@
-export function chartBlocks(set: SetList, songNumber: number, chart: readonly ChartSection[] = [], beats = 4): ChartBlock[] {
+export function chartBlocks(set: SetList, songNumber: number, chart: readonly ChartSection[] = [], beats = 4, nextBeats = beats): ChartBlock[] {
@@
     const end = section.end ?? (Number.isFinite(nextSong) ? nextSong : null);
+    const bar = isPad(section.name) && Number.isFinite(nextSong) ? nextBeats : beats;
     return {
@@
-      bars: end === null ? null : Math.ceil((end - section.time) / beats - EPSILON),
+      bars: end === null ? null : Math.ceil((end - section.time) / bar - EPSILON),
--- a/web/src/ChartView.tsx
+++ b/web/src/ChartView.tsx
-  const beats = beatsPerBar(charts?.songs.find((candidate) => title !== null && namesMatch(candidate.title, title))?.meter);
+  const meterOf = (of: string | null | undefined) => beatsPerBar(charts?.songs.find((candidate) => of !== null && of !== undefined && namesMatch(candidate.title, of))?.meter);
+  const beats = meterOf(title);
+  const nextBeats = meterOf(set.songs[set.songs.indexOf(song) + 1]?.title);
@@
-        {chartBlocks(set, song.number, chart, beats).map((block) => {
+        {chartBlocks(set, song.number, chart, beats, nextBeats).map((block) => {
```
This exact diff was applied in a scratch worktree: the repro went green, and `test/chart-blocks.test.ts`, `test/pages.test.ts`, `test/readme-chart-view.test.ts`, `test/set-manifest.test.ts` stayed green (290 passed), with typecheck and eslint clean. Then update the `bars` comment at `web/src/chart-blocks.ts:12-14` to say a Pad before another song counts in that song's meter, and the docs sentences at `README.md:110` and `docs/install.md:328` ("which the chart view counts the bars of every block but the current one in") to add "and a Pad before another song in that song's", with their pins at `test/readme-chart-view.test.ts:130, 160` moved to the new wording.

**Remediation brief**
- **Design intent:** the chart view's blocks come from the snapshot's locator times, in quarter-note beats. The current block shows Live's own count (`now.bars`), computed by the server from Live's live signature, so it is always right; every other block must divide by the beats per bar Live will be in when it plays there. The set builder plays each song in its own meter up to its handoff, and for a pad transition the handoff is the Pad locator, so a song's Pad (Pad locator to End) is in the next song's starting meter. A pad after the set's last song steps back to the song's own meter, and so does its Pad Out. "Next song" in `chartBlocks` is the song whose first locator comes next in time (`nextSong`), and in `SongChart` it is the next entry of `set.songs`; in a built set these are the same song.
- **Full surface:** `web/src/chart-blocks.ts:1-3` (import), `:12-14` (the `bars` comment), `:25` (signature), `:34-37` (the bar choice); `web/src/ChartView.tsx:143` and `:157`; `README.md:110`, `docs/install.md:328`, pinned by `test/readme-chart-view.test.ts:130, 160`. New tests: move the repro's three cases into `test/pages.test.ts` (the chart view's lyrics and chords describe) and add a `test/chart-blocks.test.ts` case passing `nextBeats` for a Pad, plus one where the Pad belongs to the set's last song and keeps `beats`. `README.md:53` belongs to finding 2; land its wording consistent with this fix.
- **Must preserve:** every non-Pad block counts in the song's own meter, pinned by `test/chart-blocks.test.ts` (the 6/8 case at :95) and `test/pages.test.ts` (the two meter cases at :2321 and :2337); the current block's `now.bars`; End's null and the last-section-of-the-set null; 4/4 for a song with no manifest meter, so the e2e fixtures in `test/fixtures/set-manifest/` and `e2e/chart.spec.ts`, `e2e/chart-strip.spec.ts` keep their counts; a Pad or Pad Out of the set's last song in the song's own meter (`Number.isFinite(nextSong)` is false there). When the next song has no title or no manifest meter, its Pad counts 4/4, the same default the song body has.
- **Do not touch:** the server's `meterSong` and `barLength` (`src/server/playback-controller.ts:229-235`), which already treat the Pad correctly; `web/src/chart-strip.ts`, which counts from `now.bars`; `beatsPerBar` (verified equal to `barLength` over all 495 codes).
- **Proof:** `cp docs/reviews/setlist-controller-225/repro/pre-pr-review-2.test.ts test/ && pnpm exec vitest run test/pre-pr-review-2.test.ts; rm test/pre-pr-review-2.test.ts`. Three red now (`expected '24 bars' to be '18 bars'`, `expected '18 bars' to be '24 bars'`, `expected '15 bars' to be '20 bars'`), three green after.

### 2. The README still says every block counts in 4/4 — LOW
- **Location:** `README.md:53`
- **Attribution:** pre-existing on the branch since `7f6b875` (setlist-controller#396, `git log -S'counted in 4/4' 4c608d5..HEAD -- README.md`), left stale by `e80972f` and `09dda4c`, which changed the behaviour and `README.md:110` but not this sentence. It is missed surface of prior finding 1, whose brief listed `README.md:110` only.
- **Real-world trigger:** Nick or a band member reads the roles paragraph and concludes a 6/8 song's section map is in 4/4, while `README.md:110` and `docs/install.md:328` say it counts in the song's starting meter. No behavioural mistake follows beyond distrusting the numbers.

**Evidence** — `README.md:53`: "Each block shows the section's name and its bar count, counted in 4/4 from the locators, while the current block shows Live's own count, as the now-playing panel does." `test/readme-chart-view.test.ts:34` pins only `/bar count/` here.

**Recommended fix** — Replace "counted in 4/4 from the locators" with "counted from the locators in the song's starting meter from the set manifest, 4/4 for a song with none, and a Pad before another song in that song's meter". Drop the Pad clause if finding 1 is not fixed in the same round. Pin the new phrase in `test/readme-chart-view.test.ts` beside the `/bar count/` check at :34, as :130 pins the manifest sentence.

**Remediation brief**
- **Design intent:** the readme tests hold the README to what the code does; the chart view's counting rule is stated in three places (`README.md:53`, `README.md:110`, `docs/install.md:328`) and must say the same thing.
- **Full surface:** `README.md:53`; `test/readme-chart-view.test.ts:34` (add the new pin). Finding 1's surface owns `README.md:110` and `docs/install.md:328`.
- **Must preserve:** the rest of `README.md:53`, pinned by `test/readme-chart-view.test.ts` (the `/bar count/` and "No chart for this song" pins at :34 and :106).
- **Do not touch:** the README's 4/4 mentions of the fake Live's demo set (`README.md:17`) and `docs/install.md:174, 280`, which are about other things.
- **Proof:** `pnpm exec vitest run test/readme-chart-view.test.ts` with the new pin added: red against the current sentence, green after the rewrite. `git grep -n "counted in 4/4"` prints nothing after.

### 3. The meter's tests leave three paths unguarded — LOW
- **Location:** `test/set-manifest.test.ts:75-88` (the `beatsPerBar` table), `test/fixtures/set-manifest/set-manifest.json` (served manifest), `web/src/ChartView.tsx:143` (the `title !== null` fallback)
- **Attribution:** introduced by `e80972f`.
- **Real-world trigger:** none for users today; the code is right (the finder's differential harness found 0 divergences from `barLength` over all 495 codes). The cost is a claim of coverage: a regression in any of the three passes the suite.

**Evidence** — The table's valid rows are `6/8`, `3/4`, `4/4`, `12/8`: denominators 4 and 8 only, whole numbers only. The tautology audit's mutant `denominator === 8 ? numerator / 2 : numerator` passed every test of `test/chart-blocks.test.ts`, `test/pages.test.ts`, `test/set-manifest.test.ts` and `test/device-settings.test.ts`, so a 2/2 song counting 2 beats a bar instead of 4 ships green; so would `Math.round` or integer division, since 7/8 (3.5) is not pinned. Neither served fixture in `test/fixtures/set-manifest/` holds a `meter`, so no test sees the server pass it through `/api/charts`. No test renders a song with a null title against a manifest with meters.

**Failure mode** — Each of the three changes ships green: a beats formula special-cased to x/4 and x/8; a server that rebuilds each song's fields and drops `meter` (every song would count 4/4); a lookup that matches a null title to some manifest song.

**Recommended fix**
- `test/set-manifest.test.ts:75`: add the rows `{ meter: '2/2', beats: 4 }`, `{ meter: '3/2', beats: 6 }`, `{ meter: '7/8', beats: 3.5 }`, `{ meter: '1/16', beats: 0.25 }`.
- Give one song of `test/fixtures/set-manifest/set-manifest.json` a `"meter": "6/8"`, and update the expectation of the server test that reads it from `/api/charts` in `test/set-manifest.test.ts` to include it.
- `test/pages.test.ts`, in the meter lookup case at :2337: a set song with `title: null` and a manifest song titled anything with `meter: '6/8'` counts 4/4.

**Remediation brief**
- **Design intent:** `beatsPerBar` must equal Live's `numerator * 4 / denominator` for every meter Live can store (denominators 1, 2, 4, 8, 16), and the manifest's `meter` must survive writer, parser, server and page unchanged.
- **Full surface:** `test/set-manifest.test.ts:75-88` and its served-manifest tests; `test/fixtures/set-manifest/set-manifest.json`; `test/pages.test.ts:2337`. No production code. Check with `grep -rn "set-manifest.json" test e2e` that every reader of the fixture, e2e included, still expects what it gets: a fixture song with a meter changes the e2e bar counts of that song unless its sections are unaffected, so pick a song the e2e specs do not count, or add the meter to a copy.
- **Must preserve:** every current row and case; the e2e counts in `e2e/chart.spec.ts` and `e2e/chart-strip.spec.ts`.
- **Do not touch:** `beatsPerBar` itself.
- **Proof:** in a scratch `git worktree add --detach <scratchpad>/m HEAD`, change `src/shared/set-manifest.ts`'s return to `return numerator > 0 && denominator > 0 ? (denominator === 8 ? numerator / 2 : numerator) : 4;` and run `pnpm exec vitest run test/set-manifest.test.ts`: green before the new rows, red after. For the server path, drop `meter` in the `parseSetManifest` map in the scratch worktree and see the served-manifest case go red.

## Needs Further Investigation
None this round. Review 1's A to D stand as they were.

## Reviewed and Dismissed
- The Count Off block is counted in the wrong meter — no: a Count Off is the first section of its own song, and the next song's meter starts at the handoff, which is where its Count Off starts (`src/set-builder/timeline.ts:7-17`).
- A pad after the set's last song is miscounted — no: its Pad and Pad Out hold the song's own starting meter (`timeline.ts:19-21`, `write-set.ts:253-255`), which is what the chart view uses.
- `beatsPerBar` disagrees with Live's `barLength` for some meter — no: 0 divergences over all 495 codes (numerators 1 to 99, denominators 1 to 16), via `timeSignature`.
- A manifest change of the meter alone is not served — no: the server compares the file's whole text (`src/server/set-manifest.ts:42`), so any change raises the revision.
- The whole-set view takes another song's meter — no: both views draw each song through `SongChart`, which looks up its own `title`.
- The new `meter` field in `ManifestSong` (`src/shared/set-manifest.ts:16`) has no comment — not a defect under the load-bearing-comments rule.
- `e2e/view-only.spec.ts:68` finds "Part" by label, not as the combobox — no gap: `web/src` renders only buttons and selects, so zero buttons and one combobox already prove the one control.
- The seven "gives one problem" rows of `test/set-manifest.test.ts` went red at 6edac05 only because the message changed — true, but the row "a meter that is not text" goes red for the behaviour, and the others were never meant as meter coverage.

## Minor / nits
- `web/src/ChartView.tsx:143`: before the first `/api/charts` answer (`charts === null`) a 6/8 song's blocks show 4/4 counts, then change when the charts arrive. The "No chart" line waits for the first fetch for the same reason; the counts could too.
- `test/pages.test.ts:2337`: the lookup case's look-alike title `'build my  life'` catches `findLast` but not an exact-match lookup; only the case at :2321 catches that. Giving the first matching entry other casing would make the lookup case catch both.
- `test/chart-blocks.test.ts:95`: the 6/8 case passes `3` directly, so it tests the division, not the meter mapping; the pages cases cover the mapping.
- `"6/8\n"` and `" 6/8"` count 4/4, and `"4/3"` gives 5.33, a meter Live cannot store. The builder always writes `n/d`, so no user path (review 1's known LOW note).

## Test quality
Tests added or modified in the delta: 34 (13 new vitest, 19 modified vitest, 2 modified e2e). Red at 6edac05 for the behaviour: every new or modified meter case, including both pages cases, the chart-blocks 6/8 case, the two readme pins, eight set-builder cases and the parser rows. Green at 6edac05: 1, `test/device-settings.test.ts:124` ("reads back each display stored for each part, under the part's own key"), which is prior finding 2's proof (`b85797f`) with no production change, red under a `displayKey` mutant, so it stays. Mutants: lookup by `songs[0]`, `findLast`, position, first-with-any-meter, exact match, `const beats = 4`, `/ 4` in `chartBlocks`, and `beatsPerBar` returning `numerator` all go red; `denominator === 8 ? numerator / 2 : numerator` survives (finding 3). Tautology shapes: none (no production helper computing an expectation, no mock of the unit, no call-shaped assertion, no snapshot).

## Before opening the PR
- **CI readiness:** the repo has no CI; all five full checks are green at 32af179 with no flakes.
- **Commit hygiene:** commit this doc with `repro/pre-pr-review-2.test.ts`. The repro is not in vitest's `test/**` include, so it runs only when copied into `test/`; it passes `pnpm lint` and `pnpm typecheck` where it sits.
- **Likely reviewer asks:** a 6/8 song padding into a 4/4 song (finding 1); the README's two descriptions of the count (finding 2).

## Verdict
**Ready to open the PR with follow-ups.** No CRITICAL, HIGH or MEDIUM finding remains. Prior finding 2 is closed. Prior finding 1 is closed for the song body and left open in two LOW residuals, findings 1 and 2, which can ride in a short remediation round (both are small, and finding 1's fix is already verified) or go to follow-up tickets. Finding 3 is test hardening. The confirmed list shrank from nine to three, and the round's content is residue of the one fixed mechanism, not new defects. This is the first rewrite of the bar-count mechanism, so no split ticket is called for.
