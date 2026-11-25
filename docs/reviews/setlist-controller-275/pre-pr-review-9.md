# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line (fresh review after run 5)

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `2a96911`, Merge pull request #347 from nick-vogel/setlist-controller-331-follow-ups-from-108)
**Reviewed at:** HEAD `0f4bdf5` (setlist-controller#352 An End played into inside the crossing's lead, after the crossing was dropped, blanks the screen for an instant). Clean tree: no uncommitted or untracked files at the start. Against the merge-base: 51 files, +7488 / −465, 94 commits. Outside `docs/reviews/`, the code, data, fixtures and docs are 29 files, +5870 / −465. This review adds this doc and 2 files under `repro/`.
**Delta under review:** none. `--fresh`: the whole working surface since `2a96911` is reviewed. Since `pre-pr-review-8.md` (HEAD `952c95b`, committed as `4fffe2a`), run 5 landed #349 (`ba3e29a`), #350 (`8c11705`, `d73f9c6`, `4c39967`), #351 (`7ff2d8a`) and #352 (`8167f88`), and `ecc6f4d` merged `origin/main` (#108 lights, #331) into the branch, which moved the merge-base from `98f15c4` to `2a96911`.
**Reviewed against:** epic `nick-vogel/setlist-controller#275` (its spec body); the bodies of #349 to #352 and of collector #353 with its items #354 to #369; `docs/HANDOFF-setlist-controller-275.md`; the Approach decisions, Needs Further Investigation, Reviewed and Dismissed and Minor / nits of `pre-pr-review-7.md` and `pre-pr-review-8.md`. No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply.
**Date:** 2026-11-07
**Reviewer:** 3 code-review agents + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `0f4bdf5` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and seam suites | `pnpm test` | 74 files, 2198 passed, 4 skipped |
| Build | `pnpm build` | built |
| End to end | `pnpm test:e2e` (builds, then WebKit and Chromium on OS-assigned ports) | 66 passed |
| Finder A: adapter, slide timing, check, pages' check view | diff read, `tsc`, 5 suites in a scratch worktree, a scratch repro of the `boundBefore` bound (check and runtime) | finding 1 (executed), finding 3 part (a) (grep), NFI B |
| Finder B: schedule, cues, Eos merge, server | diff read of #349, #350, #352 and the `ecc6f4d` main side, 2 scratch repros | finding 2 (pinned by an existing test), finding 3 part (b), NFI A, comment entries |
| Finder C: controller meters, snapshot, pages, docs | diff read, 2 mutations of `f65ae3a`'s re-choose, controller repros | nits and dismissals only; finding 4 doc entry |
| Finding 1 proof | `repro/review-9-finding-1-test.diff` in a scratch worktree at `0f4bdf5` | red at HEAD (the Holy Forever problem missing), green with `repro/review-9-finding-1-candidate.diff`; full `pnpm test` with both: 2199 passed, 4 skipped |
| Finding 2 proof | `test/propresenter.test.ts:5348` and `:5159` at HEAD, green in `pnpm test` | both assert the clear and then the slide on one report |
| Tautology audit | HEAD's changed tests, helpers and fixtures copied into a scratch checkout at `2a96911`, run per file with the JSON reporter; tests added since `eaeaab2` run at their own parent commits | 193 instances (159 new, 34 modified): 153 red at base, 40 green, none vacuous; one tail assertion that cannot go red (finding 3 part (c)) |
| Merge with main (`ecc6f4d`) | finders A and B: `target.ts` keeps main's `state` and `fileChanged`; Eos returns `notes: []` on both paths; Eos has no plan and no lead, so it takes `deliver`'s lead-0 branch and `moved` skips it | holds |
| Consumers of `NowPlaying.bars` and `fraction` (#351) | `git grep` over `src` and `web/src` | only `web/src/NowPlaying.tsx:64` and `:67`, both null-safe |
| Not run | the real ProPresenter and the real Live; no server on 11000 or 11001 (guardrail) | not run, by the repo's guardrails |

**Overall:** every full check is green, and the run 5 tickets (#349 to #352) do what their end states say. Nothing is CRITICAL, HIGH or MEDIUM. The one new defect worth fixing now is small and proved: #350's bound for a pickup after a song with no End plans that song with slide timing entries its own check drops (finding 1, a one-line fix with a test). The rest are a flash case #352 left on the clear side by decision or omission (finding 2, a decision for Nick), test gaps, and comment and doc drift.

## Approach decisions
- Carried from review 4: the End inside the crossing's lead is judged by `droppedEnd`, by the crossing itself and by whether the change remembered as sent early is the crossing or a later change of the next song. Unchanged; #352 adds a branch after it for an End played into when the crossing did not go early (`intoEnd`), which hands the crossing's slide in the End's place, measured against the crossing's beat less the lead.
- Carried from review 3, recommended, filed as #367: a library body with no `items` list, or a library list whose entries carry no name, reads as "could not be read", never as an empty library.
- Carried from review 5, applied in `a1bcc5b`: a drag back inside a section that clears hands the section's clear only when the landing is before the change sent early's send point, the plan holds no slide, and a change was sent early. Unchanged.
- Carried from review 5, recommended, filed as #366: the second pass of `resolveTiming` judges entries in section order, each `start` against the section before as its entry stands once judged.
- Carried from review 7, applied in `f65ae3a`: a signature reported while Live plays holds the song at the predicted playhead, and the next position report re-targets it before the commit at the top of `fromLive`. Unchanged; finder C's mutations show `pre-service-check.test.ts:273` is its one guard (review 8 finding 1's tests are not yet written).
- Carried from review 8, recommended, filed as #365: a position report on Live's brace end while the loop goes round chooses no song for a meter.
- New (finding 1, recommended): the bound for a song's first section after a song with no End plans that song with the slide timing entries its own `resolveTiming` leaves standing, by recursing through `boundBefore` as the second pass's own bound. Precedent: the two existing call sites, `src/server/propresenter.ts:956` (the check) and `:1375` (`triggerFor`), which call `resolveTiming(timing, presentation, song, bar, (bar) => boundBefore(set, song, read, timing, meters, bar))` for the song itself.
- Open (finding 2, Nick's decision): whether a section that clears, played into, after the next section's slide 1 on a pickup was dropped, follows #352's rule for the End (the slide in place of the clear) or keeps #301's and #317's pinned order (the clear, then the slide at once).

## Confirmed Issues

### 1. The bound for a pickup after a song with no End plans that song with entries its own check drops, so a start before its real last change passes — LOW
- **Location:** `src/server/propresenter.ts:1171` (`boundBefore`, `const { exceptions } = firstPass(timing, presentation, bounded, own);`); its comment at `:1153-1158`
- **Attribution:** introduced by `8c11705` (setlist-controller#350 A pickup start after a song with no End is checked against its last section's start, not its last change): `git log --oneline -S'firstPass(timing, presentation, bounded, own)' 2a96911..HEAD` and `git log -S'function firstPass'` both name only `8c11705`. At `2a96911` neither `boundBefore` nor `firstPass` exists.
- **Real-world trigger:** the song before has no End, its last section carries a slide timing entry whose own `start` is wrong (it reaches the section before's last change), and the next song's first section carries a `start` that lands between the last change that bad entry's `changes` or `group` would give and the last change the song really plays. The check shows the first song's problem, so the producer is told something is wrong, but not that the next song's start is wrong too; until the first entry is fixed, the next song's slide 1 goes up over the first song's last line. Every 8 November song has an End, so nothing reaches it this week. LOW; once the first entry is fixed, the check judges the second one right.

**Evidence**
```ts
  if (last < 0 || !presentation?.authorized || !followsArrangement(presentation)) return lastStart;
  const own = meters.get(before.number) ?? bar;
  const { exceptions } = firstPass(timing, presentation, bounded, own);
  return { beat: lastChange(presentation, bounded, last, own, exceptions), name: `the last change of ${songTitle(before)}` };
```
**Failure mode** — executed: `repro/review-9-finding-1-test.diff` adds to `describe('after a song with no End')` in `test/propresenter.test.ts` a check with `AFTER_NO_END` and `{ 'Ancient Gates': [{ section: 'Verse 3', changes: [1, 2], start: -8 }], 'Holy Forever': [{ section: 'Verse 1', start: -5 }] }`. Ancient Gates' entry passes the first pass, and its second pass drops it (start −8 lands on 80, Chorus 1's start), so Verse 3 plays the even split, its last change on 132. `boundBefore` still plans Verse 3 with `changes: [1, 2]`, its last change on 120, so Holy Forever's start on 124 passes. At HEAD the check gives only `"Ancient Gates: slide timing Verse 3 1, start -8 passes Chorus 1's last change"`; the Holy Forever line is missing. The runtime goes through the same `boundBefore` (`triggerFor`, `:1375`): finder A's scratch run of `timingRig(112, …)` with that file had Ancient Gates 9 and Holy Forever 1 sent together on beat 130, 12 beats early, over Verse 3's last slide.

**Recommended fix** — `repro/review-9-finding-1-candidate.diff`:
```diff
-  const { exceptions } = firstPass(timing, presentation, bounded, own);
+  const { exceptions } = resolveTiming(timing, presentation, bounded, own, (bar) => boundBefore(set, bounded, read, timing, meters, bar));
```
With the test: green; `pnpm test` 74 files, 2199 passed, 4 skipped; `tsc` clean. The `boundBefore` comment (`:1153-1158`) then says "with the entries of the slide timing file that stand for it, as its own check leaves them", not "the first pass's"; that wording belongs in the comment the remediator edits, not in this diff.

**Remediation brief**
- **Design intent:** a song's first-section `start` must land after the slide before it, which for a song with no End is the last change of its last section as that song's cue plans it (`boundedSong` runs that section to this song's first locator). "As its cue plans it" means the entries `resolveTiming` leaves standing after both passes, since that is what `triggerFor` hands the cue; the first pass alone keeps entries the second pass drops.
- **Full surface:** `src/server/propresenter.ts:1171` and the comment at `:1153-1158`; `test/propresenter.test.ts`, the test from `repro/review-9-finding-1-test.diff` beside `:5641`. The two callers of `boundBefore` (`:956` the check and `:1375` `triggerFor`) need no change, since both reach the fix through `resolveTiming`. The recursion ends at the set's first song, a song with an End, or a song that sends nothing (`:1169`), so it is bounded by the set's length; the inner call passes `own` as its fallback bar, as the outer callers pass the song's own bar.
- **Must preserve:** the 7 tests in `describe('after a song with no End')` (`test/propresenter.test.ts:5544` on), in particular `:5589` and `:5597` (`4c39967`, the only guards that the song before's own entries feed the bound, per the tautology audit's mutant) and `:5641` (a song with an End is bounded by its End); `test/pre-service-check.test.ts`; `pnpm test`.
- **Do not touch:** `firstPass` and `resolveTiming`'s order of passes (#366's own fix changes the second pass's order, separately); `lastChange`; `boundedSong`'s set-order choice of the next song (#360).
- **When the fix itself fails:** a chain of songs with no End, each with a dropped `start`, recurses once per song; a set has at most a handful of songs, and each level is the same work the check already does for that song.
- **Proof:** from the repo root, in a scratch worktree at HEAD: `git apply docs/reviews/setlist-controller-275/repro/review-9-finding-1-test.diff && pnpm exec vitest run test/propresenter.test.ts -t "not by an entry of its own that the check drops"`: red, the Holy Forever line missing. Then `git apply docs/reviews/setlist-controller-275/repro/review-9-finding-1-candidate.diff` and the same command: green; `pnpm test`: 2199 passed.

### 2. #352 sends the crossing's slide in place of a dropped crossing's End, but a section that clears still flashes blank before a dropped pickup slide — LOW
- **Location:** `src/server/connections.ts:940-952` (the `landing || intoEnd` branch #352 widened), `:917` (`droppedClear`), and the ordinary path below it, which hands the clear and then `schedule` fires the pickup at once
- **Attribution:** introduced by this branch, and left by `8167f88` (setlist-controller#352 …): the clear-then-slide order is pinned by `test/propresenter.test.ts:5348` ("sends the Vamp's clear on its downbeat when a Fade out dropped the Chorus's first slide before it went, and the slide at once after it", added by `e56a8f7`, setlist-controller#301) and `:5159` ("sends the clear of Holy Forever's last section on its downbeat, and Worthy Of It All's first slide at once after it, when that slide is not on a pickup", added by `61f7fde`, setlist-controller#317). #352's body framed the End case as a decision ("Decide whether an End played into inside the crossing's lead follows #315's landing rule"); the clear case was not part of it.
- **Real-world trigger:** the leader fades out a few beats before a Vamp or Turnaround whose next section's first slide is on a pickup that comes due before the clear's downbeat, the producer arms ProPresenter again before that downbeat, and the band plays on into the clearing section. On its downbeat the screen goes blank and the next line goes up on the same report, the same flash #352 removed for an End. `:5159`'s case, a song's last section that clears shorter than the lead, does the same in ordinary playback, by #317's decision. LOW: a display flash of one report's length, with no wrong words.

**Evidence**
```ts
        const landing = cue.cause === 'jump' || cue.cause === 'play-from-start' || cue.cause === 'count-in';
        const intoEnd = cue.section === 'end' && cue.cause === 'played-into';
        const change = (landing || intoEnd) && start !== null && here !== null ? ahead(entry, cue, here - start) : null;
```
**Failure mode** — `test/propresenter.test.ts:5348` at HEAD (green in `pnpm test`): `vampRig(-0.625)`, play to 90, Fade out, arm again, the clock to the pickup's send time (nothing sent, since the arm schedules nothing), then a report on 96.25: ProPresenter receives `[CLEAR, trigger(WORTHY_OF_IT_ALL, 11)]`. `droppedClear` is false because no change went early, so the Vamp's cue takes the ordinary path, hands `CLEAR`, and `schedule` finds the pickup's send time passed and its downbeat ahead, and fires it at once (finder B's code read, matching the test).

**Recommended fix** — Nick decides first, as #352 was decided. If the clear follows the End: widen the branch to a section played into whose plan is empty (it clears) when `ahead(entry, cue, here - start)` returns a change whose `passes` equals the section's start, hand that change's slide measured against its beat less the lead, mark it sent early, and change `:5348` to expect only `trigger(WORTHY_OF_IT_ALL, 11)`. Whether `:5159`'s no-pickup case follows too is a separate part of the same decision, since #317 chose it. If the order stays, record it as a deliberate trade in the `deliver` comment beside #352's End wording.

**Remediation brief**
- **Design intent:** a slide that comes due at or before the downbeat of a section that clears replaces the slide before it directly (`passes`, #301), so that section's clear never shows; `droppedClear` drops the clear when the slide went early. #352 applied the same idea to an End when the crossing did not go early: the End hands the crossing's slide at once instead of its clear.
- **Full surface:** `src/server/connections.ts:940-952` (the branch), `:917` (`droppedClear`), the comments at `:74-77`, `:170-172` and `:932-939`; `test/propresenter.test.ts:5348` (and `:5159` if #317's case is included).
- **Must preserve:** `droppedClear` for a pickup that went early; `test/propresenter.test.ts:5364` (the row's Clear slide button, then the slide once more on its downbeat); the #352 End tests at `:3853` to `:4047`; a section that clears with no pickup after it still clears on its downbeat.
- **Do not touch:** `droppedEnd` and its order before `droppedClear` (Approach decisions, review 4); the lead-0 branch of `deliver`.
- **Proof:** with the decision taken: `pnpm exec vitest run test/propresenter.test.ts -t "when a Fade out dropped the Chorus's first slide before it went"` expecting the new order, red before the change.

### 3. Test gaps in the run 5 code — LOW
- **(a) `boundBefore`'s fallback for a song before that sends nothing has no test.** `src/server/propresenter.ts:1169` returns `lastStart` ("the end of <song>") for a song with no End whose presentation is not in the read playlist, not authorized, or not on Master. `grep -n "passes the end of" test/*.ts` finds only `test/propresenter.test.ts:5645`, which is `AFTER_END` (a song with an End, the `before.end !== null` branch at `:1164`). Add a check test beside it: `AFTER_NO_END` with Ancient Gates off the playlist read (or on another arrangement) and a Holy Forever `start` that lands between Verse 3's start (112) and its last change (132), expecting `"… passes the end of Ancient Gates"` only when the start lands at or before 112. Confirm it red with the `last < 0 ||` guard's `return lastStart` replaced by the `lastChange` return.
- **(b) #349 names four reschedule causes and tests one.** The comments at `src/server/connections.ts:98-101` and `:678-680` say a Loop press, the loop off, an End toggle change and a re-prediction between a pickup and its downbeat send slide 1 at once; `ba3e29a` adds a test for the loop off (`test/propresenter.test.ts:5527`), and `:5511` covers the Loop press. The mechanism is one line (`on = predict(untilBeat(change))`, `:687`), so the gap is coverage, not behaviour. Add a re-prediction test: with `VERSE_3_PICKUP`, a report between 110 and 112 that moves the pending change's prediction by more than a beat expects Verse 3's first slide at once and not again on 112.
- **(c) A tail assertion that cannot go red.** `test/propresenter.test.ts:4064-4065` (in `:4047`, "… and nothing after it answers") checks `sent()` straight after `pro!.answer()`, with no wait. A request queued behind the held one goes out only after the answer reaches the server, so the check runs before it could arrive; the pre-#352 version of the same test needed `vi.waitFor` to see the request after the answer. The test's first assertion (`received`) is a real proof, red at `9dc2589`. Keep the test and wait a bounded settle (the 400 ms `cuesReceived` polls) before the last assertion.

### 4. Comment hygiene — LOW (aggregated)
- `src/server/connections.ts:76` and `:935-936` — "as after a Fade out or a pause at its send time" → "as after a Fade out or a pause at its send time, once the producer arms ProPresenter again" (ProPresenter pauses on a Fade out, `pausesOnFade`, so an End played into while paused sends nothing; every #352 test arms again)
- `test/propresenter.test.ts:4034-4035` — "The cue requests ProPresenter has received since `from`, the clear and Holy Forever's Count Off slide, polled … or until both came" → "… since `from`, the clear and Holy Forever's Count Off slide or either, polled for up to 400 ms …, or until both came" (after #352, `:4047` expects the slide alone, so the helper always waits the full 400 ms)
- `src/server/propresenter.ts:1153-1158` — fixed with finding 1, not separately
- `docs/install.md` (the slide timing paragraph on "meter not read yet") — "walk the playhead through each song of the set, a click in each song is enough" → "walk the playhead through each song of the set; a click in each song, outside its Pad and Pad Out, is enough" (`meterSong` reads no song in a Pad, so a click there leaves "meter not read yet")
- Review 8 finding 7's entries (and the seven it carried from review 7) at `src/server/playback-controller.ts:48-50`, `:129-131` and `:273-275`: untouched by run 5, carried as written there.

## Needs Further Investigation
### A. An End played into while a brace set by hand will wrap from just past it sends the next song's first slide (#352)
`ahead`'s early return for an End (`src/server/connections.ts:562`, `if (from.section === 'end') return crossing(entry, song);`) skips the loop check, so with a song on Continue, its End inside the crossing's lead, a gap of a beat or two before the next song, and a brace set at the laptop ending in that gap, the End played into takes #352's `intoEnd` branch and hands the next song's first slide though Live is about to wrap back. Before #352 the End sent its own clear or Ending group there. Finder B's code read; not executed, and the brace set by hand past an End is narrow. What confirms it: a seam test with that gap and a brace from the last section to the gap's middle, asserting no Worthy Of It All trigger before the wrap. Fix candidate: apply the section path's brace check to an End in `ahead`, or skip `intoEnd` while `loop()` has a brace ending past `song.end`.

### B. `boundBefore`'s fallback meter is the next song's, not Live's signature
`const own = meters.get(before.number) ?? bar;` (`src/server/propresenter.ts:1170`) takes `bar`, the meter of the song being bounded, when the song before's meter is unread; that song's own cue plans with `meters().get(before) ?? bar()`, Live's last signature. They differ only when the next song's meter is read and the song before's is not while Live's last signature is a third meter. Finder A's code read; not executed. What confirms it: a check test with the two songs in different meters where only the second was clicked. Related to review 7's NFI C (a crossing planned on an unread meter).

Reviews 7 and 8's NFI A to E: E is #350, landed in `8c11705`; A to D stand unchanged, outside this run's delta (`src/server/propresenter.ts`'s queue and `connections.ts`'s early mark are untouched by run 5 except #350's `meters()` pass-through and #352's branch).

## Reviewed and Dismissed
- #349 resends slide 1 at once over the row's Clear slide button when a reschedule comes between the pickup and the downbeat (finder B F3). It moved an existing resend, pinned at `test/propresenter.test.ts:5364` ("… once more on its downbeat when the row's Clear slide button cleared it"), earlier; "the next scheduled change takes over" is the spec's button rule.
- A signature half order of numerator, position, denominator commits half a meter for a report (finder C F2). Review 8 dismissed it: the home log has both halves lead the position.
- #349: a pickup sent at once is marked early with its downbeat, so its downbeat sends nothing; `following` skips it; `moved()` across the pickup hands it once; a change with `passes` is past the clear already; lateness is against the beat less the lead. Holds (finder B).
- #352: `droppedEnd` still runs first; a song set to Stop has no crossing, so its End still clears; a crossing still pending from a lagging prediction goes once; the slide's due time matches `:3853`'s 750 ms. Holds (finder B).
- #351: only the pages read `bars` and `fraction`, and both handle null; the run-on length matches `boundedSong`'s for a song followed in set order and by time. Holds (finder C), apart from #360.
- The merge of main (`ecc6f4d`): `target.ts`, `eos.ts`, `connections.ts`, `server.ts`, the check notes and the CSS compose; Eos never schedules, and the music coming back re-arms it as on main. Holds (finders A and B).
- The 40 tests green at `2a96911`: none vacuous (Test quality).

## Minor / nits
- A report that commits on arrival (a fade's `track-data` or `track-volume`, a `loop` report, `startup`, a `cue-points` answer) between a played signature and its position commits the predicted song, so the position never re-chooses it (finder C F1, executed: `{1: 4, 2: 4}`). The same as review 8's first nit; the window is about a millisecond.
- `nowPlaying` counts bars in Live's current signature, not the song's own meter (`src/server/playback-controller.ts:992`), so for the milliseconds between a signature report and the position after it the pages show the wrong bar total (finder C F3). Pre-existing for every section; #351 adds the run-on one.
- A changed set read while stopped takes Live's signature for the playhead's song at once (`takeMeter`, `:686-688`), not through the settle; a click's signature reports that follow correct it (finder C F5).
- `isPad` matches "Pad" and "Pad Out" exactly, case included (`src/shared/count-in.ts:16`); the set builder writes them so, and `countInFor` has always matched them this way (finder C F6).
- Carried from reviews 7 and 8 unchanged: every entry of their Minor / nits.

## Test quality
Against `2a96911`, with HEAD's changed tests, helpers and fixtures copied in: 159 new and 34 modified test instances, 153 red at base, 40 green. `test/eos.test.ts`'s 16 modified tests are red at base only through `notes: []` (stripped, all 225 pass); `test/pre-service-check.test.ts` is red as a whole through `notes` in `MATCHED`, and with that neutralised its 13 unchanged tests go green and all 14 new ones stay red. The 40 green: 11 shape or fixture syncs (`notes: []` in `test/pages.test.ts`, Worthy Of It All indices from #326's fixture), 3 tests of the fake, 2 guards on base behaviour, and 24 proofs of fixes to code that exists only inside the branch (base sends nothing early, so their "nothing early" assertions hold there trivially). The run 5 tests, each run at its own parent: #349's `:5527` red at `8283cd1`; #350's `:5582`, `:5605`, `:5648` red, `:5621` and `:5641` green as boundary companions, `:5589` and `:5597` red at `ecc6f4d` and the only guards of the song-before's-entries rule (a `NO_EXCEPTIONS` mutant turns exactly them red); #351's `now-playing.test.ts:120` red, `:134` a guard; #352's nine tests at `:3853` to `:4047` red at `9dc2589`. No tautology shape (own expectation, mocked unit, call-shaped only, unread snapshot, assertion-free, prose). One tail assertion cannot go red (finding 3 (c)). Nothing to delete. One unchanged test, "names a file that is not valid JSON as one problem" (`test/propresenter.test.ts:4687`), failed once at HEAD while two scratch suites ran in parallel and passed alone; the full suite at HEAD was green.

## Before opening the PR
- **CI readiness:** the repo has no CI (removed in PR #300). Lint, typecheck, `pnpm test` (2198 passed), build and e2e (66 passed) are green at `0f4bdf5`.
- **Commit hygiene:** clean tree before the review. This review adds this doc, `repro/review-9-finding-1-test.diff` and `repro/review-9-finding-1-candidate.diff`.
- **Likely reviewer asks:** close #349 to #352 with run 5's close-out; finding 2's decision, beside #352's; #348 stays open and skipped, its lane kept.

## Verdict
**Ready to open the PR, with follow-ups.** Nothing is CRITICAL, HIGH or MEDIUM, and every full check is green. Finding 1 is a proved one-line fix with its test, cheap to take before the PR; finding 2 is a decision for Nick; findings 3 and 4 are test and comment work that can ship as follow-ups. No finding gates the PR.
