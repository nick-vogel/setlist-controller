# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback, follow-up #269, round 2

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `4c608d5` "Merge pull request #432 from nick-vogel/setlist-controller-134-propresenter-recordings")
**Reviewed at:** HEAD `3abd9b9` (setlist-controller#84 pre-PR review 7 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked at the start. Whole branch against the merge-base: 7 files, +642 / -46, 6 commits. Production code is unchanged since review 7: `src/server/propresenter.ts` is byte-identical to `99fb0e3`. This review adds the doc and 2 files under `repro/`.
**Delta under review:** since `99fb0e3` (setlist-controller#269 After a reconnect, a cold Next slide pauses ProPresenter as a change by hand), the HEAD that `pre-pr-review-7.md` reviewed. The delta is 4 files, +315 / -1: `test/propresenter.test.ts` (+26 / -1, two tests added and one renamed, from `fdd86cf` "setlist-controller#84 pre-PR review 7 finding 1: the cold press's cover after a reconnect had no test of its limits, so dropping its guard or widening it to the whole song shipped green"), and review 7's doc, its closure table (`3abd9b9`) and its two repro files (`6722469`).
**Reviewed against:** setlist-controller#269 (its three items and five acceptance criteria), review 7's findings, Approach decisions and remediation closure table, the repo entry's checks and guardrails. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape.
**Date:** 2026-11-11
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | in the integration worktree | ok, already up to date |
| `pnpm lint` | full | green |
| `pnpm typecheck` | full | green |
| `pnpm test` | full, load average about 8 to 9 on 14 cores | green: 74 files, 2328 passed, 4 skipped, no flake |
| `pnpm build` | full | green |
| `pnpm test:e2e` | full, three runs 60 s apart | red, red, green: 72 of 72 on the third run. Both reds are `e2e/count-in.spec.ts:167` (first run [webkit-ipad], second [chromium-android]), `expect(boxes).toHaveLength(6)` at `:176` received 0: the flake `.epic-loop/flaky-2.md` and `flaky-3.md` record. The spec is untouched by this branch (last change `6548268` "setlist-controller#390 Previous song and Next song in the top section", on the base) |
| Review 7's mutants at HEAD | `repro/review-7-mutations.sh` in a detached scratch worktree at `3abd9b9` | `guard-removed`: killed by "pauses on a slide beside the last slide shown but not beside the slide showing, after a cold Previous slide with a frame since the open". `every-slide`: killed by "pauses on a slide pressed by hand inside a cold Next slide's frame time ...". `expected-dropped`: killed by the AC2 test only, as before |
| Extra mutants of the cover | same scratch worktree, script now `repro/review-8-mutations.sh` | `both-neighbours` (the cover takes the slides on both sides of `lastShown`): **survived**, all green (finding 1). `two-ahead` (the cover is two along): killed by the `it.each` at `:871`. `earlier-dropped` (drop `!earlier &&`): survived on one run, killed on another by an unrelated test, "says nothing to move for previous after a clear when ProPresenter refused the next song's trigger ..." (Minor / nits) |
| Finding 1 candidate tests | `repro/review-8-candidate-tests.diff` applied at HEAD in a scratch worktree | the new `it.each` green at HEAD; with it, `both-neighbours` is killed (both cases red); `eslint` and `tsc` clean on the patched file |
| The two new tests against the base production code | scratch worktree at `4c608d5` with HEAD's `test/propresenter.test.ts` and `test/fake-propresenter.ts` copied in, `-t "a reconnect while armed"` | 6 green, 2 red (the `it.each` of cold presses over a slide with no words, as in review 7). Both new tests are green at base, as review 7's brief intended: they pin the cover's limits, and the mutants are their red |
| Test 1's precondition | scratch worktree at HEAD with `guard-removed` applied and test 1's frame of index 7 moved after `clock.advance(PAST_WINDOW_MS)` | the test stays **green** with the guard gone (finding 2); with the precondition assertion from `repro/review-8-candidate-tests.diff`, the same variant goes red, and at HEAD unmodified it is green |
| Em-dashes in shipped copy | `git diff 99fb0e3 -- src test \| grep '^+' \| grep '—'` | none |
| Guardrails | no launchd, no install script, no production OSC ports (the fake and the harness listen on ports the OS assigns), no Live, no `build-set` | held |
| Not run | the acceptance run on the home ProPresenter | out of scope for a review |

**Overall:** The remediation did what review 7 finding 1 briefed, and both named mutants are now killed. The brief's own intent went further than its two tests: the cover must be exactly the one neighbour, and a cover that takes the slide on the other side of the last slide shown as well still passes every test (finding 1, tests only, MEDIUM for the same reason as review 7's). Test 1 also has no check that it is still armed before its hand press, so it can pass with no guard at all if its set-up drifts (finding 2, LOW). Review 7's three LOWs are untouched, as remediation deferred them. No production code changed, and no behaviour defect is proved.

## Approach decisions
Carried forward from reviews 1 to 7, unchanged:
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it.
- Requests and going offline: a request belongs to the connection it was sent on, an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline.
- Adapter-level behaviour that the fake ProPresenter cannot stage goes in `test/propresenter-adapter.test.ts` (`setDelayFor`, `setStatusFor`). Behaviour the fake can stage stays in `test/propresenter.test.ts`.
- A Clear slide's blank is a fact about the screen, not about the last command (review 4 finding 1, deferred; mechanism unchanged).
- An armed reconnect is staged through `armedRig` and a local set-up (`reconnectArmedShowing`, `reconnectArmedOnTurnaround`). A test that waits for an answer the rig delays waits on its effect with `vi.waitFor`; a test that waits on an absence keeps its sleep.
- A slide change missed while offline is recorded only from what Live reports (review 6 finding 1).
- A cold Next or Previous with no earlier chained press and no `status/slide` frame since the start or the reconnect (`showing === null`) also expects the slide beside `lastShown`, by index in `lastShown.presentation` (`beside` in `runButton`, `slideBeside`). With no `lastShown` it adds nothing (#269's lane).
- The fake's stream open and live slide read follow the 2026-11-10 recording (#269's lane).
- The limits of the cold press's cover are pinned in `test/propresenter.test.ts`, `describe('a reconnect while armed')`, by tests a mutant of `beside` turns red (review 7 finding 1).

Added by this review:
- The cover's direction is pinned the same way: an `it.each` over next and previous after `reconnectArmedOnTurnaround()`, each pressing by hand the slide on the other side of `lastShown` inside the press's frame time, expecting a pause (finding 1).
- A test whose pause must come from one frame asserts the row is still armed just before that frame, as the AC2 test does with `await row((row) => sameLines(row.state, CHORUS_TEXT))` (finding 2).

## Prior-review closure
Review 7 (`pre-pr-review-7.md`, at `99fb0e3`) confirmed 4 findings.
- **Finding 1 (MEDIUM): partially fixed.** Its two recommended tests landed as briefed in `fdd86cf`, the rename at `:888` too, and both mutants it named are killed (executed). The half left open is in the brief's own intent, "it must stay exactly the one neighbour and only in that state": the "only in that state" half and "not a far slide" are pinned, "the one neighbour by direction" is not, and the `both-neighbours` mutant survives (finding 1 below repeats it). The remediator applied the brief exactly; the gap was the brief's, not the fix's.
- **Finding 2 (LOW): untouched**, deferred by remediation ("deferred: LOW tail"). Carried as finding 3.
- **Finding 3 (LOW): untouched**, deferred the same way. Carried as finding 4.
- **Finding 4 (LOW, comment hygiene): untouched**, deferred the same way. Carried as finding 5.
None was "resolved" by editing only a comment or a doc. Review 7's `### Known regressions, deferred` list is empty.

## Confirmed Issues
### 1. The cold press's cover may take the slide on the other side of the last slide shown as well, and every test stays green — MEDIUM
- **Location:** `src/server/propresenter.ts:1731-1735` (`slideBeside`), `:1071` (`beside`); `test/propresenter.test.ts:871-920`
- **Attribution:** introduced by `adb97dc` (setlist-controller#269 After a reconnect, a cold Next slide pauses ProPresenter as a change by hand), which added `beside`, `slideBeside` and their tests; `git log --oneline -S'slideBeside' 4c608d5..HEAD` names `adb97dc` and review 7's doc `6722469`, which quotes it. Partially closed by `fdd86cf` (review 7 finding 1), whose two tests pin the guard and a far slide but not the other neighbour. Not introduced by the remediation.
- **Real-world trigger:** none today; the code is right. The cost lands when a later change to `slideBeside` or `beside` lets a cold press cover both neighbours, a plausible "cover either way" edit, since nothing says otherwise: after a reconnect over a blank or a slide with no words, the operator presses by hand the slide before the last one shown within 3 s of a producer's Next (or the slide after it within 3 s of a Previous), ProPresenter stays armed, and automation sends its next slide over the operator's. That is a wrong result silently delivered, so MEDIUM, the rating review 7 finding 1 took for the same class (precedent review 4 finding 2).

**Evidence**
```ts
function slideBeside(id: string, shown: Shown): string[] {
  if (id !== 'next' && id !== 'previous') return [];
  const text = slideAt(shown.presentation, shown.index + (id === 'next' ? 1 : -1));
  return text === null ? [] : [text];
}
```
The tests over the cover after `reconnectArmedOnTurnaround()` (`lastShown` index 10): the `it.each` at `:871` presses next and shows 11, previous and shows 9, and expects armed; `:912` presses next and shows 20, a far slide, and expects a pause. No test presses next and shows 9, or previous and shows 11.

**Failure mode** — the `both-neighbours` mutant (`slideBeside` returns the slides at `index + 1` and `index - 1` for either button) leaves all tests of `test/propresenter.test.ts` and `test/propresenter-adapter.test.ts` green, executed (`repro/review-8-mutations.sh`). With the two tests from `repro/review-8-candidate-tests.diff`, both cases go red on it, executed.

**Recommended fix** — tests only, no production change. Add, after the test at `:912` inside `describe('a reconnect while armed')`, the `it.each` from `repro/review-8-candidate-tests.diff`:
```ts
  it.each([
    ['next', 9],
    ['previous', 11],
  ] as const)("pauses on the slide beside the last slide shown on the other side, pressed by hand inside a cold %s's frame time after a reconnect over a slide with no words", async (button, index) => {
    const { producer, clock, row } = await reconnectArmedOnTurnaround();

    await press(producer, button);
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, index);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });
```
Audit: the diff adds two test cases and removes nothing. Index 9 is Chorus / slide 4 and index 11 is Verse 3 / slide 1, the slides the `it.each` at `:871` shows after the other button, so each case reuses a set-up and a slide already proved to be reached; the only difference from `:871` is the button. Both cases are green at the base production code too, since the base has no cover; that is intended, as with review 7's two tests, and the mutant is their red. The failure of the fix: none, it changes no code.

**Remediation brief**
- **Design intent:** a Next or Previous press expects the slides it may bring, and a frame showing one of them inside `BUTTON_FRAME_MS` after a 2xx is the press's own, never a change by hand. #269 adds to a cold press, only while no frame has come since the start or the reconnect (`showing === null`), the one slide its button brings from `lastShown`: the next index for Next, the previous for Previous. Every slide the cover adds is a press by hand that will not pause, so it must stay exactly that one slide, in that one state.
- **Full surface:** `test/propresenter.test.ts`, `describe('a reconnect while armed')` (`:797-921`): the new `it.each` after `:920`. No change to `src/server/propresenter.ts` (`:1071` `beside`, `:1731-1735` `slideBeside`).
- **Must preserve:** the `it.each` at `:871` (kills `two-ahead` and the swapped ±1), the far-slide test at `:912` (kills `every-slide`), test 1 at `:897` (kills `guard-removed`), the AC2 test at `:837` (kills `expected-dropped`), and `reconnectArmedOnTurnaround` (`:856-869`) unchanged, as four tests use it.
- **Do not touch:** `beside`'s `cueOut` behaviour (Needs Further Investigation A); `slidesBrought` and the `to` branch of the press's turn, which replaces the cover after a blank (Reviewed and Dismissed).
- **Proof:** `git worktree add --detach <scratch>/wt HEAD && ln -s "$PWD/node_modules" <scratch>/wt/node_modules && sh docs/reviews/setlist-controller-84/repro/review-8-mutations.sh <scratch>/wt && git worktree remove --force <scratch>/wt`. Now: `both-neighbours: survived (all green)`, `two-ahead: killed (red)`. After: `both-neighbours: killed (red)`, naming both new cases. Then `pnpm exec vitest run test/propresenter.test.ts`.

### 2. Test 1 never checks it is still armed before its hand press, so it passes with no guard if its frame of index 7 ever counts as by hand — LOW
- **Location:** `test/propresenter.test.ts:897-910`
- **Attribution:** introduced by the remediation, `fdd86cf` (`git log --oneline -S'not beside the slide showing' 4c608d5..HEAD` names `fdd86cf` and the review 7 doc commits `6722469` and `3abd9b9`, which quote it).
- **Real-world trigger:** none; a test-strength finding. Today the frame of index 7 lands inside the trigger's window (the fake's `sendSlide` settles 50 ms before the clock moves), so the test is right. LOW, since it takes a change to the test's set-up or to the window before the gap opens.

**Evidence**
```ts
    await pro!.sendSlide(THERE_IS_FREEDOM, 7);
    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'previous');
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 5);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
```
`row()` answers with the first snapshot, received or still to come, that matches (`:97`), so any earlier pause satisfies it.

**Failure mode** — executed: with the frame of index 7 moved after `clock.advance(PAST_WINDOW_MS)`, the frame is a change by hand, pauses at once and moves `lastShown` to 7, and the test stays green with `guard-removed` applied. With the precondition below added, that variant goes red; at HEAD it is green.

**Recommended fix** — in test 1, destructure `latest` from `armedRig`, and after `await press(producer, 'previous');` assert the row is still armed on the slide of index 7:
```ts
    expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Chorus / slide 2'), expect.any(String)] });
```
This is the first hunk of `repro/review-8-candidate-tests.diff`. Audit: it adds one destructured name and one assertion; nothing is removed or reordered. The precedent is the AC2 test at `:837`, which waits on the row's state before it presses, and the `latest()` assertions of the `it.each` at `:871`. The failure of the fix: `latest()` reads the newest snapshot without waiting, so if the frame of index 7 were not yet on the row the assertion would go red; it is on the row, since `sendSlide` settles before it returns, and the run above is green.

**Remediation brief**
- **Design intent:** test 1 pins the `showing === null` guard: a frame since the open moves `showing` without moving `lastShown`, so a cold Previous must expect only the slide before `showing`. It is meaningful only while the frame of index 7 is the adapter's own and the row is armed when the hand press comes.
- **Full surface:** `test/propresenter.test.ts:899` (destructure) and the line after `:903`.
- **Must preserve:** every assertion in test 1; that `guard-removed` stays killed by it.
- **Do not touch:** the test's order of `sendSlide(…, 7)` before `clock.advance(PAST_WINDOW_MS)`, which is what makes the frame its own.
- **Proof:** in a scratch worktree at HEAD with the hunk applied, `pnpm exec vitest run test/propresenter.test.ts -t "but not beside the slide showing"` is green; swap the two lines `await pro!.sendSlide(THERE_IS_FREEDOM, 7);` and `clock.advance(PAST_WINDOW_MS);` and it must go red.

### 3. Two reconnect tests pin their outcome but not the mechanism their names and comments give — LOW
Carried from review 7 finding 2, unchanged (the delta leaves `test/propresenter.test.ts:820-846` byte-identical). Brief, evidence and proof: `pre-pr-review-7.md` finding 2. In short: add "keeps an armed ProPresenter armed on the opening frame of a reconnect over the expected slide" beside `:822`, reword the comment at `:820-821` to "A slide changed by hand while the stream was down is no frame of the adapter's own, so its opening frame pauses.", and call `pro!.hangSlideReads()` before the reconnect in the AC2 test at `:837`. Proof: `repro/review-7-mutations.sh`, where `expected-dropped` must then be killed by the new test as well as the AC2 test.

### 4. Five tests the branch added or renamed assert nothing it introduced — LOW
Carried from review 7 finding 3, unchanged (`test/fake-propresenter.test.ts` is not in the delta; `test/propresenter.test.ts:828` is byte-identical). Brief: `pre-pr-review-7.md` finding 3. In short: in the "opens a stream %s with no status/slide" `it.each`, assert the presentation/current frame's presentation (`HOLY_FOREVER` for the Intro case, `null` for the other two); in the test at `:828`, call `pro!.hangSlideReads()` before the reconnect.

### 5. Comment hygiene — LOW (aggregated)
Carried from review 7 finding 4, unchanged (none of the four lines is in the delta):
- `src/server/propresenter.ts:1067-1070` — "With none either, as after the server's start, it expects nothing, so its cold frame past the window is a change by hand." → "... or its opening frame is late ... With none either, as after the server's start, it expects only what a cue still out gives, so with no cue out its cold frame past the window is a change by hand."
- `test/fake-propresenter.ts:273-274` — "or null with none showing." → "null after a clear; a recorded status/slide chunk sets it to There Is Freedom's even when that chunk shows none, which the opening frames never read then."
- `test/propresenter.test.ts:688-689` — "The read's text shows only when no frame came before its answer" → "The read's text shows only when no status/slide frame or clear came before its answer"
- `src/server/propresenter.ts:201-202` — "After a reconnect over a slide with words, the stream's opening frame places it." → "At the server's start and after a reconnect over a slide with words, the stream's opening frame places it."
- `docs/reviews/setlist-controller-84/repro/review-7-mutations.sh:2-5` — "After the remediation, all three must be killed, and expected-dropped by a test named for the opening frame over the expected slide." → "After review 7 finding 1's remediation, guard-removed and every-slide are killed; expected-dropped is killed by a test named for the opening frame over the expected slide only once review 7 finding 2 lands." (New this round.)

## Needs Further Investigation
### A. The cold press's cover can be stale or beside the wrong place: before the opening frame after an offline change, and while a cue is out — confirm with an adapter test
Carried from review 7, unchanged; the delta does not touch it. To confirm (a): in `test/propresenter-adapter.test.ts`, hold the stream's opening frame (`setDelayFor('/v1/status/updates', ...)`), show a slide changed while offline beside `lastShown`, press Next inside the hold, and check the row stays armed where it should pause. Upgrade to MEDIUM if the service log shows a Next slide or Previous slide answered within 300 ms of "online" after a drop. A fix for (b) would add `cueOut === null` to the guard; it is a decision, since a refused trigger leaves the screen at `lastShown`.

## Reviewed and Dismissed
- Test 1 cannot tell the guard from the slide showing — no: the frame of index 7 inside the trigger's window moves `showing` to 7 and leaves `lastShown` on 6, so Previous from `showing` expects 6 (Chorus / slide 1) and `slideBeside(lastShown)` would add 5 (Pre Chorus / slide 1, whose text shows at no other index); the guard alone keeps 5 out. Executed: `guard-removed` turns it red.
- Test 1's press is refused or chained, so it pauses for another reason — no: the fake answers Previous from index 7 with 204, `buttonBrings` is empty at the press (the trigger's entries went to `triggersOut`), and 1122 ms (`COLD_BUTTON_FRAME_MS`) is past the 1 s window and inside `BUTTON_FRAME_MS`.
- Test 2's slide 20 is covered by something other than the cover — no: `goOffline` cleared `triggersOut`, `expected` is the Turnaround's "(no words)", `showing` is null so the press's own slides are empty, and index 20 (Bridge 1 / slide 1) is neither neighbour of 10.
- The rename at `:888` loses coverage — no: that test presses no button, so "neither slide beside" never described it; its body is unchanged.
- The two new tests are green at base, so vacuous — no: they pin limits of a cover the base does not have, and their reds are `guard-removed` and `every-slide`, executed; review 7's brief declared this.
- `repro/review-7-mutations.sh` no longer applies — no: all three search strings still match `src/server/propresenter.ts` once (`:1071`, `:1071`, `:542-543`), and it ran as documented.

## Minor / nits
- Test 1 sits in `describe('a reconnect while armed')` but never reconnects; it covers the start half of the guard ("since the start or a reconnect"). Its name says so, so a reader is not misled about what it does.
- `repro/review-7-finding-1-tests.diff` is the proof review 7 ran, with two `describe` blocks, its own cue list and an inline reconnect, not the tests that landed in `fdd86cf`. It still applies at `99fb0e3` and stays as the record of that proof.
- The `earlier-dropped` mutant (drop `!earlier &&` from `beside`) survived on one run and was killed on another by "says nothing to move for previous after a clear when ProPresenter refused the next song's trigger, and never shows the song before" in `describe('the manual buttons move the slides')`. Near-equivalent by trace: with an earlier press still out, the extra slide beside `lastShown` is mostly the earlier press's own target. Not worth a test; the unstable kill suggests that test may itself be load-sensitive, unconfirmed.
- Review 7's three nits (`currentOf` reads `bodies` directly; `lateOpeningSlide()` withholds rather than delays; the `t <= 166` filter is shared by the fake and its test) stand unchanged.

## Test quality
Tests added or modified in the delta: 3 (two added, one renamed, all in `test/propresenter.test.ts`). Against the base production code with HEAD's tests and fake: both added tests green, as intended, since they pin limits of a cover the base lacks; their reds are the mutants, both killed (executed). The renamed test is unchanged in body. No mocked unit, call-shaped-only assertion, unread snapshot, assertion-free or prose test. One test-strength gap: test 1 lacks a precondition and can pass with no guard if its set-up drifts (finding 2, executed). Mutant score over the cover: `beside` deleted, ±1 swapped, `guard-removed`, `every-slide`, `two-ahead` killed; `both-neighbours` survives (finding 1); `expected-dropped` killed by the AC2 test alone (finding 3).

## Before opening the PR
- **CI readiness:** the repo has no CI (setlist-controller#275); the full checks are green here, with the known count-in flake (`e2e/count-in.spec.ts:167`) red twice, on [webkit-ipad] then [chromium-android], and green on the third run.
- **Commit hygiene:** commit this doc and `repro/review-8-mutations.sh`, `repro/review-8-candidate-tests.diff`. Nothing to drop.
- **Likely reviewer asks:** as in review 7: the PR should say the cold press after a reconnect is proved against the fake and the 2026-11-10 recording, and name the two cases left for #269's proposal 1.

## Verdict
Not ready as-is, close: one gate. Finding 1 (MEDIUM, tests only, two `it.each` cases) must be remediated before the PR opens, since the cover a cold press gets can still be widened to the other neighbour with the suite green; it is the unpinned half of review 7 finding 1's intent. Finding 2 (LOW) is one assertion in the same file and cheap to take in the same pass. Findings 3 to 5 (LOW) are review 7's deferred tail and can ship as follow-ups. No CRITICAL or HIGH. Of review 7's 4 findings: 0 fully fixed, 1 partially fixed (finding 1: both briefed mutants killed, the direction half open), 3 untouched by decision (LOW), 0 resolved by a comment or doc edit alone. The confirmed list is shrinking toward test strength, not drifting into comment noise, and production code has not changed since review 7; no subsystem needs a split ticket.

## Remediation — 2026-11-11
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `9e2f74b` setlist-controller#84 pre-PR review 8 finding 1: the cold press's cover after a reconnect had no test of its direction, so widening it to both slides beside the last slide shown shipped green | red→green: `sh docs/reviews/setlist-controller-84/repro/review-8-mutations.sh <scratch>/wt` in a detached scratch worktree. At `145c4dd`: `both-neighbours: survived (all green)`, `two-ahead: killed (red)`. With `9e2f74b`'s test file: `both-neighbours: killed (red)` by both new cases ("pauses on the slide beside the last slide shown on the other side, pressed by hand inside a cold next's frame time ..." and the previous case), `two-ahead: killed (red)`. Preserve suites: `pnpm exec vitest run test/propresenter.test.ts test/propresenter-adapter.test.ts` 380 passed; `pnpm typecheck` green; `eslint` clean on the touched file | 0 | fixed, proved by execution (MEDIUM, tests only, no shared core touched, so no verify agent) |
| 2 (LOW) | — deferred | — | — | deferred: LOW tail, not in this round's default scope |
| 3 (LOW) | — deferred | — | — | deferred: LOW tail, not in this round's default scope |
| 4 (LOW) | — deferred | — | — | deferred: LOW tail, not in this round's default scope |
| 5 (LOW, comment hygiene) | — deferred | — | — | deferred: LOW tail, not in this round's default scope |

### Known regressions, deferred
None. The round changed no production code.

### Rework briefs
None. No rework pass was needed.

Approach decisions: the decision "Added by this review" for finding 1 was applied as written: the `it.each` sits after the far-slide test inside `describe('a reconnect while armed')` and uses `reconnectArmedOnTurnaround()` unchanged. The decision for finding 2 (a precondition assertion before the hand press) is recorded but not applied, since finding 2 is in the deferred LOW tail. No new decision was made.
