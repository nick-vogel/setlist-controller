# Pre-PR review: setlist-controller#376 Lights: one cue per song

**Branch:** `setlist-controller-376-one-cue-per-song` vs `origin/main` (merge-base `5cdb034`, "Merge pull request #480 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback")
**Reviewed at:** HEAD `862bf34` (setlist-controller#485 Lights: the song cue fires only on the song's first downbeat) + 0 files with uncommitted changes, 0 untracked files, 17 files total, +1101 / −563
**Reviewed against:** the epic setlist-controller#376 (spec) and its sub-issues #482, #483, #485, #486 (bodies and acceptance criteria), the epic-loop ticket assumptions for each (`.epic-loop/tickets/<n>/assumptions.md` in the integration worktree). The repo has no `CODING_STANDARDS.md`, no `CLAUDE.md`, no `CONTEXT.md`, no ADRs and no prior review docs for this epic.
**Date:** 2026-11-11
**Reviewer:** 3 code-review agents (lights core; pass text, page and doc; tautology audit) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | clean, lockfile unchanged since base |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and integration suites | `pnpm test` | 94 files, 2818 passed, 4 skipped |
| Build and Playwright | `pnpm test:e2e` (builds first, WebKit, OS-assigned ports) | 138 passed |
| Pass-text surface (#482) | grep of every `FileCheck` producer, `checkOf`, both renderers, websocket change detection, e2e specs | every producer supplies `passText`; one renderer (`CheckResult`) used by the producer row and the setup screen; no hardcoded old string left |
| Song-start rule and causes (#485) | 13 mutants of `src/server/eos.ts` against `test/eos.test.ts` | 11 killed; the drop reset of the last song (finding 3) and a case-insensitive Count Off match survive |
| Finding 1 | executed repro, `repro/pre-pr-review-1.test.ts` "finding 1", red at `862bf34`; the recommended fix applied in a scratch worktree turns it green with all 243 eos tests still green | confirmed |
| Finding 2 | executed repro, same file, "finding 2", red at `862bf34`; the recommended fix applied in a scratch worktree turns it green with eos, pause-rules and propresenter suites green (635 tests) | confirmed |
| Finding 3 | mutant: delete `lastSong = null;` at `src/server/eos.ts:711`, run `test/eos.test.ts` | 243 passed, the mutant survives |
| Finding 4 | `grep -n matched test/charts-check.test.ts e2e/charts-check.spec.ts` | no matched-check assertion for Charts |
| Tautology audit | branch test files copied onto a scratch worktree at `5cdb034`, run there | 115 added or changed cases: 103 red at base, 12 green (see Test quality) |
| Doc claims (#483) | sampled `docs/install.md` section 9 against `src/server/eos.ts`; em-dash grep | rules match the code; 0 em-dashes; three inaccuracies (finding 5) |
| Real Eos, real Live | not run | guardrails forbid it; the fake Eos and fake Live stand in |

**Overall:** The branch does what the epic asks. The pass text travels with the check, labels match whole, the check names songs and not sections, and the lights fire one cue per song through every path the tickets list. One real gap is MEDIUM. When the leader jumps from a song's own Count Off onto its first section, the song never gets its look, because the lights already count themselves "inside the song" from the Count Off. Fix finding 1 before the PR opens. The four LOWs can ride along with it or become follow-ups.

## Approach decisions
- Which cues the lights act on: the Eos target picks from the cue engine's cues (`songCueFor`, `src/server/eos.ts:293`), and the engine does not change (spec, R1). Every fix below stays inside the Eos target, or adds an optional hook on `Target` in the style of `armed?()` (`src/server/target.ts:69-74`).
- "A jump from another song": judged by `lastSong`, the song of the last cue handed to the lights, with unknown (null) counting as another song (ticket #485 assumption). Finding 1 narrows what sets `lastSong` to cues at or past the song's song-start section. Finding 2 adds one more place that forgets it. Neither changes the comparison in `songCueFor`.
- Fire again writes no lights lateness line (`actsOn` false for `fire-again`, `src/server/eos.ts:760`): kept, a deliberate #485 assumption pinned by `test/eos.test.ts`. Finding 5 only makes the install doc say so.

## Confirmed Issues
### 1. A jump from a song's own Count Off onto its first section fires nothing, so the song plays under the last song's look — MEDIUM
- **Location:** `src/server/eos.ts:787` (`lastSong = cue.song;` in `cue()`), judged at `src/server/eos.ts:297`
- **Attribution:** introduced by `ebc5639` (setlist-controller#485 Lights: the song cue fires only on the song's first downbeat). `lastSong` does not exist at `5cdb034`.
- **Real-world trigger:** the band plays song 1 into song 2's Count Off, or the leader presses Play from start, which lands on the Count Off. The leader then skips the count by jumping to Verse 1 before the Count Off plays out. The Count Off's cue already set the lights' last song to song 2, so the landing on Verse 1 reads as "a jump inside the song" and fires nothing. Song 2 plays start to finish under song 1's look until the producer presses Fire again. MEDIUM, capped: a wrong look is visible at once and Fire again recovers it. Upgrade to HIGH if leaders routinely skip a Count Off by jumping. To check, look in `cue-lateness.log` beside `server.log` for ProPresenter lines with `"cause":"jump"` whose `section` is the first section after a Count Off.
**Evidence**
```ts
const fires = cue.cause === 'played-into' || cue.cause === 'play-from-start' || cue.cause === 'count-in' || (cue.cause === 'jump' && lastSong !== cue.song);
...
cue(cue: Cue) {
  const fired = songCueFor(cue);
  lastSong = cue.song;
```
**Failure mode** — In SET (song 2's Count Off at 64, Verse 1 at 72) with SONG_SHOW, start at 60, arm, play into the Count Off, then jump to song 2's Verse 1: the lights send no fire. The repro expects `fire('6')` and gets `[]`. Play from start of song 2 followed by the same jump gives the same `[]`. The ticket's own reason for "a jump inside the song fires nothing" is "so that a jump does not restart the song's follow chain" (spec story 14). Here the chain never started.
**Recommended fix**
```diff
@@ src/server/eos.ts, beside songCueFor
+  const pastSongStart = (cue: Cue): boolean => {
+    if (cue.cause === 'fire-again' || cue.section === 'end') return true;
+    const song = held?.songs.find((candidate) => candidate.number === cue.song);
+    const start = song ? songStart(song) : null;
+    return start === null || cue.section >= start;
+  };
@@ cue(cue: Cue)
       const fired = songCueFor(cue);
-      lastSong = cue.song;
+      if (pastSongStart(cue)) lastSong = cue.song;
```
Line audit: the removed unconditional assignment now skips a cue on a section before the song-start section (the Count Off, or a section before a Count Off that is not first). Dropping that is the intent: such a cue no longer marks the lights as inside the song. Every other cue sets `lastSong` as before: Fire again, an End, a song the held set lacks, and a section at or past the song-start section. The fix adds no catch or fallback, so it has no failure path of its own.
**Remediation brief**
- **Design intent:** the cue engine hands the lights every cue with its cause. The Eos target fires the song's one cue only on the song-start section (`songStart`, `src/server/eos.ts:848`), for played-into, Play from start, a count-in landing, or a jump from another song. `lastSong` exists only to tell a jump from another song from one inside the song. "Inside the song" means the song's look has had its chance to fire, that is, the playhead has reached the song-start section or past it. The set it is judged on is `held`, the set of the last check.
- **Full surface:** `src/server/eos.ts:787` (the assignment); the new helper beside `songCueFor` at `src/server/eos.ts:293`. The comments that describe `lastSong` must say "the song of the last cue handed at or past its song-start section": `src/server/eos.ts:227-230`, the header at `src/server/eos.ts:26-36` ("judged by the song of the last cue the server handed them") and the `cue()` comment at `src/server/eos.ts:779-784`. In `docs/install.md:380`, add a separate sentence such as "A jump from the song's own Count Off onto that section fires it too." Keep the existing phrases intact, since `test/readme-lights.test.ts:42-62` pins them. Move the two repro cases into `describe('the lights armed')` in `test/eos.test.ts`.
- **Must preserve:** a jump inside the song from a section at or past the song-start section fires nothing (`test/eos.test.ts:426`). A jump from another song fires, either way through the set (`test/eos.test.ts:455`). The producer's Arm forgets the song (`test/eos.test.ts:440`). The Fade out re-arm on the next Count Off fires on the song-start section (`test/eos.test.ts:511`). `actsOn` and `cue()` still judge against the same `lastSong`: `hand()` in `src/server/connections.ts:512-531` calls `actsOn` first and `cue()` second, and only `cue()` writes `lastSong`.
- **Do not touch:** the unknown-counts-as-another-song rule and the Arm reset (Dismissed: "jump after Arm"); the Fire again `actsOn` exclusion (Approach decisions).
- **Proof:** `cp docs/reviews/setlist-controller-376/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 1'; rm test/pre-pr-review-1.test.ts`. It is red now and green after. Then `pnpm exec vitest run test/eos.test.ts`, which must stay green.

### 2. After a Fade out, the lights still judge a jump by the song they were in before the pause — LOW
- **Location:** `src/server/connections.ts:977` (the Fade out re-arm), `src/server/eos.ts:787` and `src/server/eos.ts:792-794`
- **Attribution:** introduced by `ebc5639`. The re-arm path at `src/server/connections.ts:977` is pre-existing and unchanged. The branch's `lastSong` is what depends on seeing every cue.
- **Real-world trigger:** a Fade out in song 1 pauses the lights, so no cue reaches them. While faded, the leader jumps to a later song's Chorus, then back to song 1's Intro (song 1 has no Count Off), which brings the music back. The landing reads as a jump inside song 1 and fires nothing. The stage still shows song 1's last look, so the only loss is that song 1's follow chain does not restart. There is no plausible path to a wrong song's look, so the severity is capped at LOW.
**Evidence**
```ts
for (const entry of entries) if (entry.pause === 'fade-out') set(entry, { arm: 'armed', pause: null });
```
`armed?()` is, by contract, never called here (`src/server/target.ts:69-73`), and paused targets are skipped in `deliver` (`src/server/connections.ts:986`).
**Failure mode** — SET with SONG_SHOW, start at 44, arm, play into song 1's Bridge, then Fade out. Jump to song 2's Chorus, then jump to song 1's Intro. The lights show armed but send no fire. The repro expects `fire('3')` and gets `[]`.
**Recommended fix**
```diff
@@ src/server/target.ts, after armed?(): void;
+  resumed?(): void;
@@ src/server/connections.ts:977
-          for (const entry of entries) if (entry.pause === 'fade-out') set(entry, { arm: 'armed', pause: null });
+          for (const entry of entries) {
+            if (entry.pause !== 'fade-out') continue;
+            set(entry, { arm: 'armed', pause: null });
+            if (entry.target.resumed) safely(entry, 'take the music coming back', () => entry.target.resumed?.());
+          }
@@ src/server/eos.ts, after armed()
+    resumed() {
+      lastSong = null;
+    },
```
Line audit: the one-line loop becomes a block with the same filter and the same `set`, so every paused-by-Fade-out target is still re-armed in the same order. The new call runs only for a target that has `resumed`, which today is the Eos target alone. If `resumed` throws, `safely` logs it and the cue is still handed, and `lastSong` stays as it is today. Declared consequence: when a Fade out ends because song 1 is restarted on its own Intro, song 1's cue now fires again. That is intended, because the music coming back is a fresh start, as the Arm is.
**Remediation brief**
- **Design intent:** a target paused by a Fade out sees no cue until the music comes back (`bringsMusicBack`, `src/server/connections.ts:452-458`), and is then re-armed with no word to it. `armed()` is the producer's Arm alone (`src/server/target.ts:69-73`), and ProPresenter's `armed()` resets its expected slide (`src/server/propresenter.ts:1054-1057`), so it must not be reused here. A separate optional hook keeps that contract.
- **Full surface:** `src/server/target.ts:74` (the new hook and its comment, which says when it is called and when not), `src/server/connections.ts:977`, `src/server/eos.ts:792-794` (beside `armed()`), and the `lastSong` comment at `src/server/eos.ts:227-230` ("forgotten on Arm, when the music comes back after a Fade out, and on a drop"). Move the repro case into `test/eos.test.ts` next to the Fade out test at `:511`.
- **Must preserve:** `armed()` is never called on the Fade out re-arm (the contract at `src/server/target.ts:69-73`, `test/propresenter.test.ts` and `test/pause-rules.test.ts`). The cue that brings the music back is still handed at once in the same `deliver`. The re-arm order of the entries is unchanged. `test/eos.test.ts:511` stays green.
- **Do not touch:** `bringsMusicBack` and the pause rules themselves.
- **Proof:** `cp docs/reviews/setlist-controller-376/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 2'; rm test/pre-pr-review-1.test.ts`. It is red now and green after. Then `pnpm exec vitest run test/eos.test.ts test/pause-rules.test.ts test/propresenter.test.ts`.

### 3. The lights forgetting their last song on a drop has no test — LOW
- **Location:** `src/server/eos.ts:711`
- **Attribution:** introduced by `ebc5639`.
- **Real-world trigger:** none as a defect. This is a test gap: deleting the reset passes all 243 eos tests, so a regression here would go unnoticed. With no user path, the severity is capped at LOW.
**Evidence** — `lastSong = null;` in the close handler. The comments at `src/server/eos.ts:26-36` and `:227-230` promise "forgotten on Arm and on a drop".
**Failure mode** — Mutant: remove that line, run `pnpm exec vitest run test/eos.test.ts`. The result is 243 passed.
**Recommended fix** — add a test to `test/eos.test.ts` beside "fire the song cue for a jump onto the song-start section after the producer's Arm" (`:440`). Use SONG_SHOW, position 84, read, arm. Play into song 2's Chorus (`play(5, 89)`), then drop the connection and bring it back with the drop helpers at `test/eos.test.ts:2111-2135` (`drop`, `reconnect`) or the pattern at `:802`, then `read()`. Jump to song 2's Verse 1 (`jump(2, 1)`, `play(4, 73)`) and expect `firesSoFar` to equal `[fire('6')]`. First confirm that the lights stay armed across the drop, and arm again if they do not. Note that arming again would itself reset `lastSong` and void the test, so the test is only meaningful if the arm state survives the drop.
**Remediation brief**
- **Design intent:** a drop can hide cues from the lights, so after it they cannot tell where a jump came from, and unknown counts as another song.
- **Full surface:** `test/eos.test.ts` only.
- **Must preserve:** all existing drop tests in `describe("the lights' own fire whose fire event a drop eats")` (`test/eos.test.ts:2138`).
- **Do not touch:** `src/server/eos.ts:711` itself.
- **Proof:** the new test passes. With `lastSong = null;` removed from `src/server/eos.ts:711`, it fails.

### 4. Charts' pass text has no test — LOW
- **Location:** `src/server/charts.ts:27`
- **Attribution:** introduced by `9d9483a` (setlist-controller#482 Lights: a pre-service check shows its target's pass text). At base, the page hardcoded the string and the page tests pinned it for every target. Now each target owns its text, and Charts' copy is pinned by nothing.
- **Real-world trigger:** none as a defect. If a later edit puts a typo or the lights' text into this constant, the Charts row's pass line changes and no test goes red. With no user path, the severity is capped at LOW.
**Evidence** — `const PASS_TEXT = 'Every song and section matches.';`. `grep -n matched test/charts-check.test.ts e2e/charts-check.spec.ts` finds only unmatched assertions.
**Failure mode** — change the constant, and `pnpm test` stays green.
**Recommended fix** — add one case to `describe('the Charts check')` in `test/charts-check.test.ts:96`, with a manifest that charts every song of the set. Assert that the row's check equals `{ kind: 'matched', passText: 'Every song and section matches.', notes: [...] }`, with the notes that manifest produces. Follow the shape of the existing cases at `:97` to `:160`.
**Remediation brief**
- **Design intent:** each target that reports a matched check words its own pass line (#482). ProPresenter's is pinned in `test/propresenter.test.ts` (the `matched()` helper) and the lights' in `test/eos.test.ts` (`MATCHED`).
- **Full surface:** `test/charts-check.test.ts` only.
- **Must preserve:** the existing Charts check cases.
- **Do not touch:** `src/server/charts.ts`.
- **Proof:** the new case passes. With `PASS_TEXT` in `src/server/charts.ts:27` changed, it fails.

### 5. The install doc's lights section has three inaccuracies — LOW
- **Location:** `docs/install.md:382`, `docs/install.md:86`, `docs/install.md:386`; `test/readme-lights.test.ts:78`
- **Attribution:** introduced by `cb157c2` and `a006e1b` (setlist-controller#483 Lights: the install doc describes one cue per song).
- **Real-world trigger:** Nick builds the church show file from this section (#484), so the doc must describe the behaviour exactly. This is a user-facing help doc, so it is reported here and not as comment hygiene.
**Evidence and fixes**
- `docs/install.md:382`: "Leave the last cue of a song's chain with no follow, or Eos runs on into the next song's cue early." The list is one library-wide list (`:376`), so the cue Eos runs on into is the next cue in list order. That is another song's cue, unrelated to the set's order. → "Leave the last cue of a song's chain with no follow, or Eos runs on into the next cue in the list, another song's cue, and that look holds until the next song cue fires." Change `test/readme-lights.test.ts:78` to `expect(cues).toContain('or Eos runs on into the next cue in the list');`.
- `docs/install.md:86`: the lateness paragraph says a song gets one lights line when its song cue fires. Fire again also fires the song cue but writes no lights line (`src/server/eos.ts:760`). → after "That line's `section` names the section the song cue fired on.", add "Fire again fires the song cue but writes no lights line."
- `docs/install.md:386`: the check paragraph omits the untitled song. → after "as `<song title>: no cue`.", add "A song with no title on its first locator matches no cue, and reads `Song <n>: no cue`." (code: `src/server/eos.ts:278-280` and `:835`, `songTitle`).
- **Proof:** `pnpm exec vitest run test/readme-lights.test.ts` passes after the edits, and `grep -c '—' docs/install.md` prints 0.

## Needs Further Investigation
### A. Can the set parser produce a song with no sections? What would settle it: a test or a read of the set parser
`songStart` returns null for it (`src/server/eos.ts:849`), so such a song fires nothing, but the pre-service check would still pass it when a cue matches its title. A set-parser test that rejects a song with no locator past its first would show this is unreachable.

## Reviewed and Dismissed
- A jump onto the song-start section right after the producer's Arm fires, because unknown counts as another song. This is a deliberate #485 assumption ("the safer miss") and is pinned by `test/eos.test.ts:440`.
- A start from stopped on the song-start section's locator fires the song cue. This is a deliberate #485 assumption: it is the song's first downbeat. The cue engine raises nothing for a start mid-section.
- A Pad or a Pad Out as a song-start section. This is unreachable from a built set, since the set builder puts them after a song's Ending (`src/shared/count-in.ts:11`, #485 assumption).
- The first cue of a changed set is judged on the previous set (`held`, `src/server/eos.ts:226`). This is documented in the code and in the #485 assumptions. It needs the set to change in the same Live report that raises a cue (`src/server/server.ts:163-170`, `cues.observe` before `checkAll`), which is not a service path.
- Fire again writes no lights lateness line. This is a deliberate #485 assumption, pinned in `test/eos.test.ts`. The doc gap is folded into finding 5.
- The exact-case `'Count Off'` match in `songStart`. It matches every other Count Off test in the repo (`countInFor`, `bringsMusicBack`, `atem.ts:125`).
- An empty `passText` would render an empty status line. It is unreachable: the field is a required `string` and every producer passes a non-empty constant.
- The same pass-text literal sits in three files (`charts.ts`, `propresenter.ts`, `test/fake-target.ts`). This is a deliberate #482 assumption: the text belongs to each target.
- `e2e/lights.spec.ts:56-74` still shows section-style labels. These are the recorded show's cue-list and live-cue display lines, which #486 keeps on purpose. No spec asserts per-section firing.

## Minor / nits
- `test/setup-screen.test.ts:166-182`: a fake labelled Lights shows ProPresenter's pass text. Giving it `passText: 'Every song has a cue.'` would also prove the setup endpoint carries a target's own text.
- Comment wrapping: `src/shared/snapshot.ts:222-224` leaves a short broken line, `test/fake-target.ts:10` runs about 190 columns, and two lines in `src/server/eos.ts`'s header (`:36`) and the `ListedCue` comment (`:104-108`) run long. The content of all of them is accurate.
- `test/pages.test.ts:705`: its `not.toContain('Every song and section matches.')` is already implied by the exact `toBe` before it.
- `test/readme-lights.test.ts`: the absence checks at `:106-108` match three exact old strings only.

## Test quality
Tests added or changed: 115 cases (98 `it`, 17 `it.each` rows); 20 per-section tests removed. Red at `5cdb034`: 103. Green at `5cdb034`: 12. No tautology shapes were found: no expectation computed with a production helper, no mocked unit, no snapshot, and no call-shape-only assertion standing alone.
- Seven of the green-at-base cases legitimately pin behaviour that did not change: the label migrations at `test/eos.test.ts:1712`, `:1730` and `:2087`, the notes fixtures at `test/pages.test.ts:722` and `:1840`, Fire again between songs at `test/eos.test.ts:501`, and the start mid-section row of `:398`.
- Five are negative-only and green at base, because SONG_SHOW has no section labels the old matcher could fire: `test/eos.test.ts:382`, the Chorus row of `:398`, `:412`, `:426` and `:584`. Each is killed by a mutant at HEAD, so none is vacuous. Adding one section-style label to the show, such as `{ number: '10', label: 'Great Are You Lord / Chorus' }`, would make each one also prove the old per-section firing is gone. This is optional.
- The coverage gaps are findings 3 and 4.

## Before opening the PR
- **CI readiness:** the repo has no CI. Here, lint, typecheck, `pnpm test`, build and `pnpm test:e2e` are all green at `862bf34`.
- **Commit hygiene:** the branch carries two commits per ticket, a lane commit and its merge-side twin, for #482, #485 and #486 (for example `0925a36` and `0547598`). Squash or leave them as is, as the repo's other epics do.
- **Likely reviewer asks:** why a jump from the Count Off is "inside the song" (finding 1); whether Fire again should log (Approach decisions); and the church show file relabel, #484, which is still open and is the epic's last criterion.

## Verdict
Not ready as-is. Fix finding 1 (MEDIUM) before the PR opens. Findings 2 to 5 (LOW) can go in the same remediation pass or ship as follow-up tickets. No prior review findings were claimed.

## Remediation — 2026-11-11
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `8286481` setlist-controller#376 pre-PR review 1 finding 1: a jump from a song's own Count Off onto its first section fires nothing | red→green: the two repro cases, moved into `describe('the lights armed')` in `test/eos.test.ts`, red at `d1dc606` and green after; `cp docs/reviews/setlist-controller-376/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 1'` green; `pnpm exec vitest run test/eos.test.ts test/readme-lights.test.ts test/pause-rules.test.ts test/propresenter.test.ts` 643 passed | 0 new in `src/` (14 lines of the three existing `lastSong` comments rewritten, as the brief's surface asks); 5 in `test/`, the bar-line arithmetic each neighbouring test carries | proved by execution (MEDIUM, no shared core) |
| 2 (LOW) | — deferred | — | — | LOW tail, deferred by default scope (eng-pipeline#34) |
| 3 (LOW) | — deferred | — | — | LOW tail, deferred by default scope |
| 4 (LOW) | — deferred | — | — | LOW tail, deferred by default scope |
| 5 (LOW) | — deferred | — | — | LOW tail, deferred by default scope |

Full checks at `8286481`: `pnpm lint` pass, `pnpm typecheck` pass, `pnpm test` 94 files, 2820 passed, 4 skipped, `pnpm test:e2e` (build plus WebKit) 138 passed.

Declared consequence of finding 1's fix, for the next round to judge: a cue on another song's Count Off no longer moves `lastSong` either, so in song 2 past its Verse 1, a jump to song 3's Count Off and back to song 2's Verse 1 now fires nothing (it fired song 2's cue before). The stage still shows song 2's look, since song 3's Count Off fires nothing, so only song 2's follow chain does not restart. This follows the brief's definition of "inside the song" (the song's look has had its chance to fire).

### Known regressions, deferred
- none

### Rework briefs
- none (no verify agent ran; no rework)

### Approach decisions, added this round
- What sets `lastSong`: only a cue at or past its song's song-start section (`pastSongStart`, beside `songCueFor` in `src/server/eos.ts`), judged on `held` with `songStart`, the same set and rule `songCueFor` uses. Fire again, an End, and a song the held set lacks still set it. The comparison in `songCueFor` is unchanged.
