# Pre-PR review: setlist-controller#376 Lights: one cue per song

**Branch:** `setlist-controller-376-one-cue-per-song` vs `origin/main` (merge-base `5cdb034`, "Merge pull request #480 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback")
**Reviewed at:** HEAD `182e189` (setlist-controller#376 pre-PR review 1 remediation closure table) + 0 files with uncommitted changes, 0 untracked files, 19 files total against `5cdb034`, +1490 / −563
**Delta under review:** since `862bf34` (setlist-controller#485 Lights: the song cue fires only on the song's first downbeat), the HEAD that pre-PR review 1 (`pre-pr-review-1.md`) reviewed. The delta is `d1dc606` (the review 1 doc), `8286481` (setlist-controller#376 pre-PR review 1 finding 1: a jump from a song's own Count Off onto its first section fires nothing) and `182e189` (the closure table): 5 files, +404 / −15, of which the code is `src/server/eos.ts` (+22 / −14), `test/eos.test.ts` (+31) and `docs/install.md` (+1 / −1).
**Reviewed against:** the epic setlist-controller#376 and its sub-issues as distilled in `pre-pr-review-1.md`, that doc's finding 1 brief and its Remediation section (closure table, declared consequence, Approach decisions added). The repo has no `CODING_STANDARDS.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs.
**Date:** 2026-11-11
**Reviewer:** 1 code-review agent (the delta) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | clean |
| Lint | `pnpm lint`, then `pnpm exec eslint docs/reviews/setlist-controller-376/repro/` with this review's repro added | pass, pass |
| Typecheck | `pnpm typecheck` (before and after the repro was added) | pass |
| Unit and integration suites | `pnpm test` at `182e189` | 94 files, 2820 passed, 4 skipped |
| Build and Playwright | `pnpm test:e2e` at `182e189` (builds first) | 138 passed |
| Prior finding 1 closed | the two new cases in `test/eos.test.ts` ("fire the song cue for a jump from the song's own Count Off onto its song-start section", "fire the song cue for Play from start onto the Count Off and a jump from there onto the song-start section") run with HEAD's test file on a scratch worktree at `862bf34`; review 1's repro `-t 'finding 1'` at HEAD | both red at `862bf34`; repro green at HEAD: fixed |
| Prior findings 2 to 5 still open | review 1's repro `-t 'finding 2'` at HEAD; the drop-reset mutant (delete `lastSong = null;` at `src/server/eos.ts:719`); `grep` of `test/charts-check.test.ts` and `docs/install.md` | finding 2 still red; the mutant survives (245 passed); no Charts matched assertion; the three doc lines unchanged: all four still hold |
| `pastSongStart` branches | 4 mutants on a scratch worktree at HEAD, each run against `test/eos.test.ts` (245 tests): `>=` to `>`; Fire again not special; a song the held set lacks returns false; an End not special; plus the revert to the unconditional assignment | the four branch mutants all survive (245 passed); the revert is killed (2 failed) (finding 3) |
| Finding 1 | executed repro, `repro/pre-pr-review-2.test.ts` "finding 1" case | red at `182e189`, green at `862bf34`: confirmed, introduced by `8286481` |
| Finding 2 | executed repro, `repro/pre-pr-review-2.test.ts` "finding 2" cases | both pass at `182e189` (the code does what the cases pin, which the doc misdescribes); the second is red at `862bf34` |
| Tautology audit | the delta's two new tests, run at `862bf34` | 2 of 2 red at base, no tautology shapes |
| Real Eos, real Live | not run | the guardrails forbid it; the fake Eos and fake Live stand in |

**Overall:** Prior finding 1, the only MEDIUM, is fixed: a jump from a song's own Count Off onto its first section now fires the song's look, and both new tests go red against the old code. The fix has a narrow cost. The lights' "last song" now means "the last song the playhead reached the first downbeat of", which is not the same as "the song whose look is up", and one odd path of three jumps now leaves the last song's look on stage (finding 1, LOW). The install doc's new sentence overstates the rule, and the doc's "a jump from another song" no longer covers a jump from another song's Count Off (finding 2, LOW). Every finding this round is LOW, so the branch can open a PR; fix the doc before #484, which builds the show file from it.

## Approach decisions
- Which cues the lights act on: the Eos target picks from the cue engine's cues (`songCueFor`, `src/server/eos.ts:294`), and the engine does not change (spec, R1). Every fix stays inside the Eos target, or adds an optional hook on `Target` in the style of `armed?()` (`src/server/target.ts:69-74`). Carried from review 1.
- "A jump from another song": judged by `lastSong`, with unknown (null) counting as another song (ticket #485 assumption). Carried from review 1.
- What sets `lastSong`: only a cue at or past its song's song-start section (`pastSongStart`, `src/server/eos.ts:302`), judged on `held` with `songStart`; Fire again, an End, and a song the held set lacks still set it. The comparison in `songCueFor` is unchanged. Added by review 1's remediation, kept.
- No further in-place rewrite of what `lastSong` means in this epic. This round added: `lastSong` has now been redefined once in response to review. Whether it should instead track the song whose look last fired is a spec question (finding 1), and it goes to a follow-up ticket with its own test matrix, not into this branch.
- Fire again writes no lights lateness line (`actsOn` false for `fire-again`, `src/server/eos.ts:768`): kept, a deliberate #485 assumption. Carried from review 1.

## Prior-review closure
Review 1 had 5 confirmed findings. Fully fixed: 1 (finding 1, MEDIUM, `8286481`). Partially fixed: 0. Untouched: 4 (findings 2 to 5, all LOW), each marked "deferred by default scope" in the closure table, and each re-verified as still present at HEAD and carried forward below as findings 4 to 7. No MEDIUM-or-higher prior finding is open. No prior finding was "resolved" by editing only a comment or a doc. Review 1's "Known regressions, deferred" list is empty. The declared consequence in review 1's Remediation section is judged here: the behaviour it names is defensible and is dismissed as a defect, but the doc misdescribes it (finding 2), and a sibling path is a regression (finding 1).

## Confirmed Issues
### 1. By way of a mid-song entry, a jump through another song's Count Off back to a song's first section leaves the wrong song's look up — LOW
- **Location:** `src/server/eos.ts:795` (`if (pastSongStart(cue)) lastSong = cue.song;`), judged at `src/server/eos.ts:298`
- **Attribution:** introduced by `8286481` (pre-PR review 1 finding 1's fix). The repro is green at `862bf34`, where every cue set `lastSong`. The root is pre-existing in the branch's #485 rule (`ebc5639`): `lastSong` tracks where the playhead has been, not which song's look is up, so a song entered mid-song (a jump onto a later section fires nothing but sets `lastSong`) already counts as "inside the song".
- **Real-world trigger:** song 2's look is up. The leader jumps back into song 1's Chorus (nothing fires, the stage keeps song 2's look, as the rules intend), then to song 2's Count Off, then to song 1's Intro. At `862bf34` the last jump fired song 1's look; now nothing fires and song 1 plays under song 2's look until the producer presses Fire again. LOW: it takes three jumps in this order, the wrong look is visible at once, and Fire again recovers it. The simpler sibling, a jump from song 1's Chorus straight to song 1's Intro with song 2's look up, also fires nothing, and did at base too, by the "jump inside the song" rule. Upgrade to MEDIUM if leaders do jump back into a song mid-song and then restart it; check via `cue-lateness.log` for consecutive ProPresenter `"cause":"jump"` lines into a later section of one song and then that song's first section.
**Evidence**
```ts
const fires = cue.cause === 'played-into' || cue.cause === 'play-from-start' || cue.cause === 'count-in' || (cue.cause === 'jump' && lastSong !== cue.song);
...
const pastSongStart = (cue: Cue): boolean => {
  if (cue.cause === 'fire-again' || cue.section === 'end') return true;
  ...
  return start === null || cue.section >= start;
};
```
**Failure mode** — SET (song 1: Intro 0, Verse 1 16, Chorus 32, Bridge 48, End 64; song 2: Count Off 64, Verse 1 72, Chorus 88, Tag 104, End 120) with SONG_SHOW, start at 60, arm. Play into song 2's Count Off and on into its Verse 1 (fires `6`, `lastSong` 2). Jump to song 1's Chorus (fires nothing, `lastSong` 1). Jump to song 2's Count Off (`lastSong` stays 1). Jump to song 1's Intro: `lastSong === 1`, so nothing fires. The repro expects `[fire('6'), fire('3')]` and gets `[fire('6')]`.
**Recommended fix** — no code change on this branch. The orchestrator records a follow-up proposal: decide whether the lights should judge "a jump from another song" by the song whose look last fired (or was last handed with a firing cause) rather than by the last song the playhead reached the first downbeat of. That candidate mechanism would also make a jump onto a song's first section from inside a song entered mid-song fire, which changes the #485 rule "a jump inside the song fires nothing" for that case, so it is a spec decision for Nick, with its own test matrix (Arm, drop, Fade out, Fire again, a song with no cue, an End).
**Remediation brief**
- **Design intent:** `songCueFor` fires the song's one cue only on the song-start section (`songStart`, `src/server/eos.ts:856`), for played-into, Play from start, a count-in landing, or a jump from another song. `lastSong` exists only to tell a jump from another song from one inside the song, so that a jump does not restart the song's follow chain (spec story 14). It is set in `cue()` only, after `songCueFor`, and `actsOn` judges against the same value (`hand()`, `src/server/connections.ts:512-531`).
- **Full surface:** for the follow-up only: `src/server/eos.ts:231` (`lastSong`), `:294-307` (`songCueFor`, `pastSongStart`), `:719` (drop reset), `:795` (the assignment), `:800-802` (`armed()`), the lateness `actsOn` at `:768`, the comments at `:28-36`, `:228-230`, `:787-792`, and `docs/install.md:380`.
- **Must preserve:** every case in `describe('the lights armed')` in `test/eos.test.ts`, the two cases added by `8286481` included.
- **Do not touch:** on this branch, `pastSongStart` and the comparison in `songCueFor` (Approach decisions, "No further in-place rewrite").
- **Proof:** `cp docs/reviews/setlist-controller-376/repro/pre-pr-review-2.test.ts test/ && pnpm exec vitest run test/pre-pr-review-2.test.ts -t 'finding 1'; rm test/pre-pr-review-2.test.ts`. Red now; the follow-up's fix turns it green if Nick picks the look-based rule.
- **Escalation:** a fix here would be the third pass over what `lastSong` means (#485, review 1's remediation, this one). Recommend the split ticket, not an in-place fix.

### 2. The install doc's jump rule no longer matches the lights after review 1's fix — LOW
- **Location:** `docs/install.md:380`; `test/readme-lights.test.ts:41-51`
- **Attribution:** introduced by `8286481`, which added the sentence "A jump from the song's own Count Off onto that section fires it too." and changed which cues set `lastSong` without changing "a jump from another song that lands on it" (from `cb157c2`, #483).
- **Real-world trigger:** this is a user-facing help doc that Nick builds the church show file from (#484), so it is reported here and not as comment hygiene. Two normal pedal paths contradict it. (a) In song 2's Chorus, "previous section" to its own Count Off, then "next section" to its Verse 1: the doc's new sentence says the song cue fires; nothing fires, since the lights were already inside song 2 (correct behaviour, the look is up). (b) In song 1's Verse 1, a jump to song 2's Count Off and back to song 1's Intro: the doc says a jump from another song fires; nothing fires, since a Count Off no longer moves the lights' last song (review 1's declared consequence, defensible since the stage still shows song 1's look).
**Evidence** — "Playing into that section, Play from start, a count-in that lands on it, and a jump from another song that lands on it fire it. A jump from the song's own Count Off onto that section fires it too."
**Failure mode** — `repro/pre-pr-review-2.test.ts`, "finding 2" cases: both expect `[]` and pass at `182e189`, contrary to the doc. The second fails at `862bf34`, where it fired `fire('3')`. Neither path is pinned in `test/eos.test.ts`.
**Recommended fix** — in `docs/install.md:380`, replace "A jump from the song's own Count Off onto that section fires it too." with: "A jump comes from another song when the last section the lights were handed at or past a song's first downbeat, or the last End or Fire again, was another song's, so a Count Off on the way does not count: a jump from the song's own Count Off onto that section fires it after another song, and nothing once the song has reached it, and a jump from another song's Count Off back onto the song's first downbeat is a jump inside the song." Keep every phrase `test/readme-lights.test.ts:41-62` pins. Add `expect(cues).toContain('a Count Off on the way does not count');` to the `it` at `test/readme-lights.test.ts:41`. Move the two "finding 2" cases of the repro into `describe('the lights armed')` in `test/eos.test.ts`, beside the two cases `8286481` added (`:473`, `:487`), in that file's `lightsRig({ show: SONG_SHOW, position })` and `firesSoFar(fake, press)` style.
**Remediation brief**
- **Design intent:** `lastSong` is the song of the last cue handed at or past its song-start section, or of the last Fire again or End, and null after Arm or a drop; a jump onto a song-start section fires only when it differs from the cue's song. The doc must say what the code does, in one paragraph line (the doc is not hard wrapped), with no em-dash.
- **Full surface:** `docs/install.md:380`; `test/readme-lights.test.ts:41-51`; `test/eos.test.ts` after `:502`.
- **Must preserve:** the phrases pinned at `test/readme-lights.test.ts:41-62`: "the song's first downbeat", "the first section after the Count Off", "the song's first section when it has no Count Off", "the Count Off when that is its only section", "Playing into that section", "Play from start", "a count-in that lands on it", "a jump from another song that lands on it", the "fire nothing" list (a loop wrap, a jump inside the song, a start in the middle of the song, a count-in onto a later section, the Count Off, a Pad, a Pad Out, the End) on the same line, and "The song's look stays until the next song's cue".
- **Do not touch:** `src/server/eos.ts` (finding 1, and Approach decisions).
- **Proof:** `pnpm exec vitest run test/readme-lights.test.ts test/eos.test.ts` passes, with the new readme assertion red before the doc edit; `grep -c '—' docs/install.md` prints 0.

### 3. Four of `pastSongStart`'s branches have no test — LOW
- **Location:** `src/server/eos.ts:302-307`
- **Attribution:** introduced by `8286481`.
- **Real-world trigger:** none as a defect; a test gap. Each of four mutants passes all 245 tests in `test/eos.test.ts`. With no user path, the severity is capped at LOW.
**Evidence** — mutants applied on a scratch worktree at `182e189`, each run with `pnpm exec vitest run test/eos.test.ts`: `cue.section >= start` to `cue.section > start` (245 passed); `cue.cause === 'fire-again' ||` removed (245 passed); `start === null ||` to `start !== null &&` (245 passed); `|| cue.section === 'end'` removed (245 passed).
**Failure mode** — the first two have real paths. With `>`, a cue on the song-start section itself no longer marks the lights as inside the song, so in song 2 played into its Verse 1 (fires `6`), a jump back onto Verse 1 fires `6` again and restarts the chain. With Fire again not special, Fire again on song 2's Count Off (fires `6`) followed by a jump onto Verse 1 fires `6` a second time.
**Recommended fix** — add two cases to `describe('the lights armed')` in `test/eos.test.ts`, after `:502`, in the style of `:473`: (a) SONG_SHOW, position 60, read, arm; `play(5, 65)` into the Count Off; `play(8, 73)` into Verse 1; `jump(2, 1)` then `play(4, 73)` (bar line 76, Live lands on 72); expect `[fire('6')]`. (b) position 60, read, arm; `play(5, 65)`; Fire again (the press the existing Fire again tests use near `test/eos.test.ts:501`); `jump(2, 1)` then `play(4, 73)`; expect `[fire('6')]` and nothing more. First confirm the cue engine raises cause `jump` for a jump onto the section the playhead is in (`jumpCause`, `src/server/cues.ts:112`); if it raises none, case (a) instead jumps from Verse 1 to Chorus and back to Verse 1 and still expects `[fire('6')]`. The unknown-song and End branches stay untested: the first is reachable only for the first cue of a changed set (Dismissed in review 1), and the End branch belongs to finding 1's follow-up.
**Remediation brief**
- **Design intent:** as finding 2.
- **Full surface:** `test/eos.test.ts` only.
- **Must preserve:** every existing case in `describe('the lights armed')`.
- **Do not touch:** `src/server/eos.ts`.
- **Proof:** the new cases pass; on a scratch worktree with `>=` changed to `>` at `src/server/eos.ts:306` case (a) fails, and with `cue.cause === 'fire-again' ||` removed at `:303` case (b) fails.

### 4. After a Fade out, the lights still judge a jump by the song they were in before the pause — LOW
Carried from `pre-pr-review-1.md` finding 2, untouched (deferred by default scope), still present: review 1's repro `-t 'finding 2'` is red at `182e189`. Its brief stands as written there, with these line numbers at HEAD: the re-arm loop at `src/server/connections.ts:977`, `armed?()` at `src/server/target.ts:74`, `armed()` at `src/server/eos.ts:800-802`, the `lastSong` comment at `src/server/eos.ts:228-230`, and the Fade out re-arm test at `test/eos.test.ts:542` (was `:511`). Its recommended `resumed()` hook resets `lastSong` to null, which is unaffected by `pastSongStart`.
- **Proof:** `cp docs/reviews/setlist-controller-376/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 2'; rm test/pre-pr-review-1.test.ts`. Red now, green after.

### 5. The lights forgetting their last song on a drop has no test — LOW
Carried from `pre-pr-review-1.md` finding 3, untouched, still present: deleting `lastSong = null;` at `src/server/eos.ts:719` (was `:711`) passes all 245 tests in `test/eos.test.ts`. Its brief stands as written there, with the Arm test now at `test/eos.test.ts:440`. One addition: since `8286481`, play song 2 on into its Chorus before the drop, as that brief says, so `lastSong` is set by a cue past the song-start section.
- **Proof:** the new test passes; with `lastSong = null;` removed from `src/server/eos.ts:719`, it fails.

### 6. Charts' pass text has no test — LOW
Carried from `pre-pr-review-1.md` finding 4, untouched, still present: `src/server/charts.ts:27` `const PASS_TEXT = 'Every song and section matches.';`, and `test/charts-check.test.ts` still asserts only unmatched checks. Its brief stands as written there (`describe('the Charts check')` at `test/charts-check.test.ts:96`).

### 7. The install doc's lights section has three older inaccuracies — LOW
Carried from `pre-pr-review-1.md` finding 5, untouched, still present at the same lines: `docs/install.md:382` ("or Eos runs on into the next song's cue early", pinned at `test/readme-lights.test.ts:78`), `docs/install.md:86` (Fire again writes no lights line), `docs/install.md:386` (the untitled song reads `Song <n>: no cue`). Its brief and replacement text stand as written there. Do it in the same commit series as finding 2, since both edit section 9, and run `pnpm exec vitest run test/readme-lights.test.ts` after each.

### 8. Comment hygiene — LOW (aggregated)
- `src/server/eos.ts:302` — (no comment on `pastSongStart`, the one helper in that block without one) → "Whether a cue moves the song the lights were last handed: Fire again, an End and a song the held set lacks always do, any other cue only at or past its song's song-start section, so a Count Off leaves it as it was."
- `src/server/eos.ts:31` — "handed them at or past its song-start section, forgotten on Arm and on a drop" → "handed them at or past its song-start section, or of the last Fire again or End, forgotten on Arm and on a drop"
- `src/server/eos.ts:228` — "The song of the last cue the server handed the lights at or past its song-start section, acted on or not" → "The song of the last cue the server handed the lights at or past its song-start section, or of the last Fire again or End, acted on or not (pastSongStart)"
- `src/server/eos.ts:788` — "then keeps the cue's song when the cue is at or past the song's song-start section" → "then keeps the cue's song by pastSongStart"
- `src/server/eos.ts:36` — the header paragraph's line "lights line per song cue fired. It" breaks before an over-long line → rewrap the paragraph so each line runs to the file's width.

## Needs Further Investigation
- none

## Reviewed and Dismissed
- Review 1's declared consequence (song 1 past its start, a jump to song 2's Count Off and back to song 1's song-start section fires nothing): the stage still shows song 1's look, since song 2's Count Off fires nothing, so only song 1's follow chain does not restart, which matches "a jump inside the song". Kept as code behaviour; the doc gap is finding 2.
- A jump from inside song 2 back to its own Count Off and on to its Verse 1 fires nothing: song 2's look is up, so this is correct. The doc gap is finding 2.
- With `held` null, before the first check, a Count Off still sets `lastSong`: the lights are handed a cue only when armed and online (`src/server/connections.ts:986`), Arm resets `lastSong`, and the first check runs on the first connect, so it needs a cue in the moment between arming and that check finishing. Not a service path.
- The first cue of a changed set is judged by `pastSongStart` on the previous set: the same documented trade-off as `songCueFor` (review 1, Dismissed), and the same Live report ordering keeps it off service paths.
- `actsOn` and `cue()` judging against different `lastSong` values: `actsOn` changes no state, `hand()` calls it just before `cue()`, and `cue()` computes `songCueFor` before it writes `lastSong`.
- `cue.section >= start` with `cue.section` typed `number | 'end'`: the `'end'` case returns first, so the comparison is always numeric.
- Carried from review 1, unchanged: the Arm and unknown-counts-as-another-song rule, a start from stopped on the song-start locator, a Pad or Pad Out as a song-start section, the exact-case `'Count Off'` match, an empty `passText`, the pass-text literal in three files, and `e2e/lights.spec.ts:56-74`'s section-style labels.

## Minor / nits
- `test/eos.test.ts:473` and `:487`: both new cases reach the jump with `lastSong` not song 2 (1 via song 1's End, or null after Arm), so they pin the same branch from two causes. Finding 2's and finding 3's cases cover the other half.
- Review 1's nits stand (the comment wrapping at `src/shared/snapshot.ts:222-224`, `test/fake-target.ts:10` and `src/server/eos.ts:104-108`; `test/pages.test.ts:705`; `test/readme-lights.test.ts:106-108`; `test/setup-screen.test.ts:166-182`).

## Test quality
Tests added in the delta: 2. Red at `862bf34` (the oracle for the delta): 2. Green at `862bf34`: 0. Tautology shapes found: 0 (no production helper computing an expectation, no mocked unit, no snapshot, no call-shape-only assertion). The delta's tests kill the revert mutant but none of `pastSongStart`'s four branch mutants (finding 3). Review 1's branch-wide audit (115 cases, 103 red at `5cdb034`) is unaffected by the delta.

## Before opening the PR
- **CI readiness:** the repo has no CI. `pnpm lint`, `pnpm typecheck`, `pnpm test` (2820 passed, 4 skipped) and `pnpm test:e2e` (138 passed, build included) are green at `182e189`.
- **Commit hygiene:** the review docs and their repro files ship with the branch, as the repo's other epics do. The lane and merge-side twin commits per ticket stand as noted in review 1.
- **Likely reviewer asks:** what "a jump from another song" means once a Count Off does not count (finding 2); whether the lights should judge by the look on stage (finding 1's follow-up); and #484, the church show file relabel, still the epic's last criterion.

## Verdict
Ready to open a PR, with follow-ups. Prior finding 1 (the only MEDIUM) is fixed, by code and a test that goes red without it; prior findings 2 to 5 (LOW) remain open by the remediator's default scope, none resolved by a comment or doc edit alone. This round confirms 8 LOW findings and no MEDIUM or higher: 3 new (a regression on an odd three-jump path, the doc's jump rule, and untested branches of the new helper), 4 carried, and comment hygiene. The confirmed list shrank in weight from one MEDIUM to none, and the new items are a narrow path, doc accuracy and test gaps. Fix finding 2 before #484 builds the show file from the doc; findings 3 to 8 can ride in the same pass or become follow-ups. Finding 1 should not be fixed in place: a fix would be the third definition of what the lights' last song means, so it goes to a follow-up ticket as a spec question for Nick.

## Remediation, 2026-11-11
Remediation scope, chosen by Nick at the close-out of the run ("A fix in this work"): findings 2 and 7 only, both LOW, plus the lateness sentence at `docs/install.md:86` in finding 7's unit (the #483 review's F1.1: it paired "a song" with "no other section" and read as one lights line per song, though each firing of the song cue gets its own line). Every other finding is deferred.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | — deferred | — | — | deferred by Nick's scope; the escalation (split ticket, a spec question for Nick) stands |
| 2 (LOW) | `8eb0640` setlist-controller#376 pre-PR review 2 finding 2: the install doc's jump rule no longer matches the lights after review 1's fix | red→green: the new `toContain('a Count Off on the way does not count')` in `test/readme-lights.test.ts` red before the doc edit, green after, beside a `not.toContain` of the replaced sentence; the repro's two "finding 2" cases moved into `describe('the lights armed')` in `test/eos.test.ts` (they pin code behaviour, so green at HEAD, the second red at `862bf34` per this review); `pnpm exec vitest run test/eos.test.ts test/readme-lights.test.ts` 256 passed; `grep -c '—' docs/install.md` 0 | 0 in `src/`; 6 in `test/`, the bar-line arithmetic each neighbouring case carries | proved by execution (LOW, doc and tests only) |
| 3 (LOW) | — deferred | — | — | deferred by Nick's scope |
| 4 (LOW) | — deferred | — | — | deferred by Nick's scope |
| 5 (LOW) | — deferred | — | — | deferred by Nick's scope |
| 6 (LOW) | — deferred | — | — | deferred by Nick's scope |
| 7 (LOW) | `da8e4ca` setlist-controller#376 pre-PR review 2 finding 7: the install doc's lights section has three older inaccuracies, and its lateness line reads as one lights line per song | red→green: three of the nine cases in `test/readme-lights.test.ts` changed first and red (the Eos run-on into the next cue in the list, the untitled song's `Song <n>: no cue`, and the lateness line: each firing on playback gets one line, no other cue gets one, Fire again writes none), green after the doc edit; `grep -c '—' docs/install.md` 0 | 0 | proved by execution (LOW, doc and tests only) |
| 8 (LOW) | — deferred | — | — | deferred by Nick's scope |

The doc's jump rule follows finding 2's recommended text, with one addition checked against `src/server/eos.ts` at HEAD: a jump also counts as from another song when the lights have been handed no such section since the producer's Arm or a drop (`armed()` and the close handler set `lastSong` to null, which `songCueFor` treats as another song). The lateness line was checked against `actsOn` (`cue.cause !== 'fire-again' && songCueFor(cue) !== undefined`) and `hand()` in `src/server/connections.ts`, which writes one line per handed cue the target acts on.

Full checks at `da8e4ca`: `pnpm lint` pass, `pnpm typecheck` pass, `pnpm test` 94 files, 2822 passed, 4 skipped, `pnpm build` pass. `pnpm test:e2e` red on three runs, 60 seconds apart: 137 passed, 1 failed, `e2e/stop.spec.ts:14` [webkit-ipad], `page.goto` of the leader page past the 30 s test timeout. The same red reproduces at `a542bac`, the tip before these commits, on a scratch worktree, and it is not the commits' doing (they change `docs/install.md`, `test/readme-lights.test.ts` and `test/eos.test.ts`, none of which the e2e suite loads). It is the 66th WebKit test that hangs, whichever test that is: the Stop spec passes alone and beside every other spec in two halves, and with the QR code test left out the next test, `e2e/stop.spec.ts:43`, hangs in its place. This review recorded 138 passed at `182e189` earlier the same day, so something in the WebKit run's environment accumulates across tests. Not diagnosed further; it needs Nick.

### Known regressions, deferred
- none

### Rework briefs
- none (no verify agent ran; no rework)
