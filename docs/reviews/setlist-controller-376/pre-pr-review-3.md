# Pre-PR review: setlist-controller#376 Lights: one cue per song

**Branch:** `setlist-controller-376-one-cue-per-song` vs `origin/main` (merge-base `5cdb034`, "Merge pull request #480 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback")
**Reviewed at:** HEAD `970a1d9` (setlist-controller#376 pre-PR review 2 remediation closure table) + 0 files with uncommitted changes, 0 untracked files, 21 files total against `5cdb034`, +1851 / −563
**Delta under review:** since `182e189` (setlist-controller#376 pre-PR review 1 remediation closure table), the HEAD that pre-PR review 2 (`pre-pr-review-2.md`) reviewed. The delta is `a542bac` (the review 2 doc and its repro), `8eb0640` (setlist-controller#376 pre-PR review 2 finding 2: the install doc's jump rule no longer matches the lights after review 1's fix), `da8e4ca` (setlist-controller#376 pre-PR review 2 finding 7: the install doc's lights section has three older inaccuracies, and its lateness line reads as one lights line per song) and `970a1d9` (the closure table): 5 files, +368 / −7, of which the reviewed part is `docs/install.md` (+4 / −4), `test/readme-lights.test.ts` (+9 / −3) and `test/eos.test.ts` (+34). No file under `src/` or `web/` changed in the delta.
**Reviewed against:** the epic setlist-controller#376 and its sub-issues as distilled in `pre-pr-review-1.md`; `pre-pr-review-2.md` findings 2 and 7 (the two this delta claims to fix), its Approach decisions, and its Remediation section (scope note, closure table, empty "Known regressions, deferred"). The repo has no `CODING_STANDARDS.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs.
**Date:** 2026-11-12
**Reviewer:** 1 code-review agent (the delta) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `970a1d9` | pass |
| Typecheck | `pnpm typecheck` at `970a1d9` | pass |
| Unit and integration suites | `pnpm test` at `970a1d9` | 94 files, 2822 passed, 4 skipped |
| Build | `pnpm build` at `970a1d9` | pass |
| Playwright | `pnpm test:e2e` at `970a1d9` (builds first) | 138 passed; the WebKit hang at `e2e/stop.spec.ts:14` that review 2's remediation hit did not recur |
| Prior finding 2 closed | read `docs/install.md:380` against `songCueFor`, `pastSongStart`, `armed()` and the close handler in `src/server/eos.ts:294-307`, `:719`, `:795`, `:801`; the two new cases in `test/eos.test.ts:504` and `:521`; two mutants on a scratch worktree at HEAD (`pastSongStart` always true; any jump fires) | the rule matches the code; the second new case is killed by the first mutant, both by the second: fixed |
| Prior finding 7 closed | read `docs/install.md:86`, `:382`, `:386` against `actsOn` (`src/server/eos.ts:768`), `hand()` in `src/server/connections.ts`, Fire again's `current()` path, and `songTitle` (`src/shared/snapshot.ts:26`) with the no-cue line at `src/server/eos.ts:843` | the lateness line and the untitled song line match the code; the run-on sentence is fixed in part (finding 1) |
| Prior findings 1, 3, 4, 5, 6, 8 still open | the delta touches no `src/` file; on a scratch worktree at HEAD: review 2's repro `-t 'finding 1'`, review 1's repro `-t 'finding 2'`, and the drop-reset mutant (delete `lastSong = null;` at `src/server/eos.ts:719`) against `test/eos.test.ts`; `test/charts-check.test.ts` not in the delta | finding 1 repro red, finding 2 repro red, the mutant survives (247 passed): all still hold |
| Copy rules | `grep -c '—' docs/install.md`; section 9 read line by line | 0; one paragraph per line |
| Tautology audit | HEAD's `test/readme-lights.test.ts` run on a scratch worktree at `182e189`; HEAD's `test/eos.test.ts` run at `862bf34` (the commit before review 1's fix, the oracle the moved cases came from) | readme: 4 of the 4 changed cases red at `182e189`; eos: the "another song's Count Off" case red at `862bf34`, the "own Count Off ... inside the song" case green there (see Test quality) |
| Real Eos, real Live | not run | the guardrails forbid it; the fake Eos and fake Live stand in |

**Overall:** Both fixes this delta claims hold. The install doc's jump rule now says what the lights do, the lateness line says one line per firing on playback and none for Fire again, and the untitled song line is exact; every claim was checked against the code, and the doc tests that pin them go red against the old doc. One sentence the remediation rewrote still overstates: after Eos runs on into another song's cue, that song's own follows run too, so the look does not simply hold (finding 1, LOW). Every finding this round is LOW, the full checks are green including Playwright, so the branch can open a PR.

## Approach decisions
- Which cues the lights act on: the Eos target picks from the cue engine's cues (`songCueFor`, `src/server/eos.ts:294`), and the engine does not change (spec, R1). Every fix stays inside the Eos target, or adds an optional hook on `Target` in the style of `armed?()` (`src/server/target.ts:69-74`). Carried from review 1.
- "A jump from another song": judged by `lastSong`, with unknown (null) counting as another song (ticket #485 assumption). Carried from review 1.
- What sets `lastSong`: only a cue at or past its song's song-start section (`pastSongStart`, `src/server/eos.ts:302`), judged on `held` with `songStart`; Fire again, an End, and a song the held set lacks still set it. Carried from review 2.
- No further in-place rewrite of what `lastSong` means in this epic; whether it should track the song whose look last fired is a spec question for a follow-up ticket (review 2 finding 1, carried here as finding 2). Carried from review 2.
- Fire again writes no lights lateness line (`actsOn` false for `fire-again`, `src/server/eos.ts:768`): kept, a deliberate #485 assumption, and now stated in `docs/install.md:86`. Carried from review 1.
- The install doc's lights section is pinned phrase by phrase in `test/readme-lights.test.ts` (ticket #483 assumption 6); a doc fix adds a `toContain` for its new phrase and a `not.toContain` for the phrase it replaces. Precedent: `8eb0640`, `da8e4ca`. Added by this review.

## Prior-review closure
Review 2 had 8 confirmed findings, all LOW. Remediation scope (Nick): findings 2 and 7, plus the lateness line at `docs/install.md:86`. Fully fixed: 1 (finding 2, `8eb0640`). Partially fixed: 1 (finding 7, `da8e4ca`): the lateness line and the untitled song line are fixed; the run-on sentence's first half is fixed (it now says "the next cue in the list") and its new second half overstates (finding 1 below). Untouched: 6 (findings 1, 3, 4, 5, 6, 8), each "deferred by Nick's scope" in review 2's closure table, each re-verified as still present at HEAD and carried forward below as findings 2 to 7. No MEDIUM-or-higher prior finding is open, partially fixed or untouched. Neither fix was a code change, by design: both prior findings were doc findings, and each fix carries a doc test that goes red against the old doc. Review 2's "Known regressions, deferred" list is empty.

## Confirmed Issues
### 1. The install doc says another song's look holds after Eos runs on into it, but that song's own follows run on too — LOW
- **Location:** `docs/install.md:382` (last sentence); `test/readme-lights.test.ts:80-81`
- **Attribution:** introduced by `da8e4ca` (review 2 finding 7's fix), which replaced "or Eos runs on into the next song's cue early." with the current sentence. The first half ("the next cue in the list") fixed the old inaccuracy; the new clause "and that look holds until the next song cue fires" is the part that overstates. `git log -S'another song' 182e189..HEAD -- docs/install.md` names `da8e4ca` and `8eb0640`; only `da8e4ca` touches this line.
- **Real-world trigger:** this is a user-facing help doc Nick builds the church show file from (#484), so it is reported individually and not as comment hygiene. The cue list holds every song in the library in list order, each song cue followed by its chain. When the last cue of song A's chain is left with a follow, Eos runs on into the next song cue in the list and, when that cue has its own follow or hang, on through that song's chain as well; the look changes again before the server fires the set's next song cue. The doc's instruction (leave the last cue with no follow) is right, so a reader who follows it builds the right show file; only the description of what goes wrong is too narrow, which misleads someone diagnosing a run-on during a service. LOW: no wrong action follows from it.
**Evidence** — "Leave the last cue of a song's chain with no follow, or Eos runs on into the next cue in the list, another song's cue, and that look holds until the next song cue fires."
**Failure mode** — show file with cue 3 "Goodness of God" (follow 5 s to 4), cue 4 (follow 2 s, the stray one), cue 5 "Great Are You Lord" (follow to 5.5), cue 5.5. Song 1 fires cue 3: Eos runs 3, 4, 5, then 5.5, so the stage goes through two of song 2's looks during song 1, not one held look. The ETC follow rule the paragraph already cites (a follow fires the next cue when its time has passed, counted from when the cue fires) is the whole mechanism; the server takes no part in it (`src/server/eos.ts` fires only song cues, and a cue Eos fires on a follow "never pauses the lights", `docs/install.md:382`). Not executed: the fake Eos does not model follows, and the real console is out of bounds.
**Recommended fix** — in `docs/install.md:382`, replace "or Eos runs on into the next cue in the list, another song's cue, and that look holds until the next song cue fires." with "or Eos runs on into the next cue in the list, another song's cue, and on through that cue's own follows and hangs, so another song's look is up until the server fires the next song cue." In `test/readme-lights.test.ts`, in the `it` at `:74` ("leaves a build or a hit to the show file, on a follow time or a hang time"), add `expect(cues).toContain("and on through that cue's own follows and hangs");` and `expect(cues).not.toContain('and that look holds until the next song cue fires');`. Keep `expect(cues).toContain('or Eos runs on into the next cue in the list');` and `expect(cues).not.toContain("the next song's cue early");` at `:80-81`.
**Remediation brief**
- **Design intent:** the server fires only the song cue; everything else in a song's look is the show file's follows and hangs, which Eos runs by itself (`docs/install.md:382`, the ETC Follow/Hang link). A follow left on a chain's last cue makes Eos fire the next cue in list order, which is the next song in the library, and that cue's own follows and hangs then run as usual. The doc is one paragraph per line and carries no em-dash.
- **Full surface:** `docs/install.md:382`; `test/readme-lights.test.ts:74-82`.
- **Must preserve:** every phrase `test/readme-lights.test.ts:74-82` pins today: "The server fires only the song cue", "A build or a hit inside the song lives in the show file", "a follow time or a hang time", "or Eos runs on into the next cue in the list", and the absence of "the next song's cue early". All of `test/readme-lights.test.ts` stays green.
- **Do not touch:** `src/server/eos.ts`; the rest of section 9 (`docs/install.md:380`, `:384`, `:386`), fixed and verified this round.
- **Proof:** the new `toContain` is red before the doc edit and green after: `pnpm exec vitest run test/readme-lights.test.ts`; `grep -c '—' docs/install.md` prints 0.

### 2. By way of a mid-song entry, a jump through another song's Count Off back to a song's first section leaves the wrong song's look up — LOW
Carried from `pre-pr-review-2.md` finding 1, untouched (deferred by Nick's scope; its escalation to a split ticket, a spec question for Nick, stands). Still present: `cp docs/reviews/setlist-controller-376/repro/pre-pr-review-2.test.ts test/ && pnpm exec vitest run test/pre-pr-review-2.test.ts -t 'finding 1'; rm test/pre-pr-review-2.test.ts` is red at `970a1d9`. Its brief stands as written there at the same line numbers (no `src/` file changed). One addition: `docs/install.md:380` now states the playhead-based rule this finding questions, so the follow-up that changes the rule changes that sentence and its pins at `test/readme-lights.test.ts:52-53` too.
- **Escalation:** a fix would be the third definition of what the lights' last song means. Recommend the split ticket, not an in-place fix.

### 3. Four of `pastSongStart`'s branches have no test — LOW
Carried from `pre-pr-review-2.md` finding 3, untouched. `src/server/eos.ts:302-307` is unchanged, and neither new case in the delta targets these branches: the "own Count Off ... inside the song" case at `test/eos.test.ts:504` reaches the jump with `lastSong` set by song 2's Chorus, past the start, so `>=` to `>` still passes it; neither case presses Fire again. Its brief stands as written there; its recommended cases go after `test/eos.test.ts:536` (was `:502`).

### 4. After a Fade out, the lights still judge a jump by the song they were in before the pause — LOW
Carried from `pre-pr-review-2.md` finding 4 (`pre-pr-review-1.md` finding 2), untouched. Still present: `cp docs/reviews/setlist-controller-376/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 2'; rm test/pre-pr-review-1.test.ts` is red at `970a1d9`. Its brief stands as written in review 1 with review 2's line numbers, except the Fade out re-arm test, now at `test/eos.test.ts:576` (was `:542`).

### 5. The lights forgetting their last song on a drop has no test — LOW
Carried from `pre-pr-review-2.md` finding 5 (`pre-pr-review-1.md` finding 3), untouched. Still present: deleting `lastSong = null;` at `src/server/eos.ts:719` passes all 247 tests in `test/eos.test.ts` at `970a1d9`. Its brief and review 2's addition stand.

### 6. Charts' pass text has no test — LOW
Carried from `pre-pr-review-2.md` finding 6 (`pre-pr-review-1.md` finding 4), untouched; `src/server/charts.ts:27` and `test/charts-check.test.ts` are not in the delta. Its brief stands.

### 7. Comment hygiene — LOW (aggregated)
Carried from `pre-pr-review-2.md` finding 8, untouched; every entry there stands at the same lines (`src/server/eos.ts` is not in the delta). This round adds:
- `docs/install.md:386` — "reads `Song <n>: no cue`" beside "Cue list <n> is not in the show file" in the same paragraph, where `<n>` means two numbers → "reads `Song <number>: no cue`", and change the pin at `test/readme-lights.test.ts:91` to match.

## Needs Further Investigation
- none

## Reviewed and Dismissed
- The jump rule at `docs/install.md:380` omits "a section of a song the held set lacks", which `pastSongStart` also counts (`start === null`): reachable only for the first cue of a changed set before its check runs, the trade-off reviews 1 and 2 dismissed as off service paths. The doc does not need to name it.
- The example "a jump from the song's own Count Off onto that section fires it after another song" reads absolute, though a Fire again pressed on that Count Off makes the jump fire nothing: the rule sentence just before it names "the last End or Fire again", so the doc already says so.
- A section before a song's first Count Off neither fires nor moves the lights' last song (`songStart`, `src/server/eos.ts:856`), and the doc names only the Count Off: the doc defines the first downbeat as "the first section after the Count Off", and a song's first locator is its Count Off (`docs/install.md:378`), so no normal set has such a section.
- "Each time the song cue fires on playback, the lights get one line, and no other cue gets one" (`docs/install.md:86`): `hand()` evaluates `actsOn` for every handed cue and writes a line only when it is true, and `actsOn` is `cue.cause !== 'fire-again' && songCueFor(cue) !== undefined`. Accurate.
- "Fire again fires the song cue of the song playing, and nothing between songs": Fire again takes `current()`, which is null between songs, and breaks. Accurate.
- "A jump comes from another song ... or when there has been none since the producer's Arm or a drop": cues the lights are not handed (disarmed, paused, offline) never reach `cue()`, so "handed" is the right word; the Fade out re-arm does not call `armed()`, consistent with "the producer's Arm" (the behaviour itself is finding 4).
- The bar-line comments in the two new cases at `test/eos.test.ts:504` and `:521`: each landing (64, 72; 64, 0) matches the fake Live's bar-line rule, and each `play()` waits for the producer to see the position.
- Carried from review 2, unchanged: the declared consequence of review 1's fix, a jump from inside song 2 to its own Count Off and on, `held` null before the first check, the first cue of a changed set, `actsOn` and `cue()` ordering, and `cue.section >= start` typing.

## Minor / nits
- `test/readme-lights.test.ts:52-53`: the new jump-rule sentence is pinned by one phrase ("a Count Off on the way does not count") and the old sentence's absence; the definition sentence ("or the last End or Fire again, was another song's", "since the producer's Arm or a drop") and the two example clauses are not pinned. Doc tests pin phrases by design (ticket #483 assumption 6); add pins when the follow-up in finding 2 rewrites the rule.
- `test/eos.test.ts:504` overlaps the existing "fire nothing for a jump inside the song onto its song-start section" case: both die only to an "any jump fires" mutant. It adds the path through the Count Off, which is what finding 2 of review 2 asked to pin.
- Review 2's and review 1's nits stand.

## Test quality
Tests added or changed in the delta: 6 (2 new cases in `test/eos.test.ts`, 4 changed cases in `test/readme-lights.test.ts`). Red at their oracle: 5. Green at their oracle: 1, the case at `test/eos.test.ts:504`, which is green at `862bf34` and at `182e189`. It is not vacuous: it was moved in by `8eb0640` from review 2's repro to pin behaviour that review 2 found correct and the doc misdescribed (review 2 finding 2), and an "any jump fires" mutant kills it. Keep it. Tautology shapes found: 0 (no production helper computing an expectation, no mocked unit, no snapshot, no call-shape-only assertion); the readme cases read the install doc by design (ticket #483 assumption 6, confirmed by Nick).

## Before opening the PR
- **CI readiness:** the repo has no CI. `pnpm lint`, `pnpm typecheck`, `pnpm test` (2822 passed, 4 skipped), `pnpm build` and `pnpm test:e2e` (138 passed) are green at `970a1d9`.
- **Commit hygiene:** the review docs and their repro files ship with the branch, as the repo's other epics do. This round adds no repro: finding 1 is a doc claim about the real console's follow behaviour, which no harness here models.
- **Likely reviewer asks:** whether the lights should judge "a jump from another song" by the look on stage (finding 2's follow-up); #484, the church show file relabel, still the epic's last criterion; the WebKit hang review 2's remediation hit, which did not recur at `970a1d9`.

## Verdict
Ready to open a PR, with follow-ups. Review 2's in-scope findings are closed: finding 2 fully, finding 7 except for one clause its own rewrite introduced (finding 1 here, LOW). The six findings Nick deferred stay open, all LOW, none resolved by a comment or doc edit alone, and none MEDIUM or higher. This round confirms 7 LOW findings and no MEDIUM or higher: 1 new (a doc clause), 5 carried, and comment hygiene. The new work has shrunk to one doc clause and one comment entry, which is the list bottoming out rather than the branch failing to improve. Finding 1 can ride with #484 or a follow-up; finding 2 should not be fixed in place, since a fix would be the third definition of what the lights' last song means, so it goes to a follow-up ticket as a spec question for Nick.
