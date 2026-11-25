# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback, follow-up #269, round 3

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `4c608d5` "Merge pull request #432 from nick-vogel/setlist-controller-134-propresenter-recordings"; `origin/main` itself is now at `baa2bb6`, and nothing past the merge-base is in scope)
**Reviewed at:** HEAD `c698e54` (setlist-controller#84 pre-PR review 8 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked at the start. Whole branch against the merge-base: 10 files, +911 / -46, 9 commits. Production code is unchanged since review 7: `src/server/propresenter.ts` is byte-identical to `99fb0e3`. This review adds only this doc.
**Delta under review:** since `3abd9b9` (setlist-controller#84 pre-PR review 7 remediation closure table), the HEAD that `pre-pr-review-8.md` reviewed. The delta is 4 files, +269 / -0: `test/propresenter.test.ts` (+13, one `it.each` of two cases, from `9e2f74b` "setlist-controller#84 pre-PR review 8 finding 1: the cold press's cover after a reconnect had no test of its direction, so widening it to both slides beside the last slide shown shipped green"), and review 8's doc, its closure table (`c698e54`) and its two repro files (`145c4dd`).
**Reviewed against:** setlist-controller#269 (its three items and five acceptance criteria, as distilled in reviews 7 and 8), review 8's findings, Approach decisions and remediation closure table, the repo entry's checks and guardrails. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape.
**Date:** 2026-11-11
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | in the integration worktree | ok, already up to date |
| `pnpm lint` | full | green |
| `pnpm typecheck` | full | green |
| `pnpm test` | full, load average about 8.8 on 14 cores | green: 74 files, 2330 passed, 4 skipped, no flake |
| `pnpm build` | full | green |
| `pnpm test:e2e` | full | green: 72 of 72 on the first run, no flake |
| Review 8's mutants at HEAD | `repro/review-8-mutations.sh` in a detached scratch worktree at `c698e54` | `both-neighbours`: **killed**, by exactly the two new cases ("pauses on the slide beside the last slide shown on the other side, pressed by hand inside a cold next's frame time ..." and the previous case). `two-ahead`: killed by the `it.each` at `:874` |
| Review 7's mutants at HEAD | `repro/review-7-mutations.sh`, same scratch worktree | `guard-removed`: killed by test 1 (`:897`). `every-slide`: killed by the far-slide test (`:912`) and both new cases. `expected-dropped`: killed by the AC2 test (`:837`) only, as before (finding 2) |
| The new tests against the base production code | scratch worktree at `4c608d5` with HEAD's `test/propresenter.test.ts` and `test/fake-propresenter.ts` copied in, `-t "on the other side"` | 2 green, as review 8's brief declared: they pin a limit of a cover the base does not have, and `both-neighbours` is their red |
| The new test's slide text | finder agent, trace of the fixture `v1_presentation_894B40A0-...json` and `test/fake-propresenter.ts:30-32` | index 9's text (Chorus / slide 4) also shows at 18 and 35, index 11's is unique; neither is in any set the pause decision reads (`expected` is the Turnaround's "(no words)", `triggersOut` is cleared offline, the cover holds the one neighbour). The fake answers Next and Previous with 204 and writes no frame, so `showing` stays null through the hand frame: the test exercises the `showing === null` branch it claims |
| The `earlier-dropped` mutant (drop `!earlier &&` at `src/server/propresenter.ts:1071`) | same scratch worktree, `test/propresenter.test.ts` and `test/propresenter-adapter.test.ts`; then two staged chained-press tests | survived, 380 of 380 (the finder agent saw the same over the whole suite). Two candidate tests (Next then Previous after `reconnectArmedOnTurnaround()`, a hand frame of index 9 inside the frame time, with and without Next's own frame of 11 first) pause both at HEAD and under the mutant, so neither tells them apart (Minor / nits) |
| Em-dashes in shipped copy | `git diff 3abd9b9 -- src test \| grep '^+' \| grep '—'` | none |
| Guardrails | no launchd, no install script, no production OSC ports (the fake and the rigs listen on ports the OS assigns), no Live, no `build-set` | held |
| Scratch worktree incident | first mutation run in `<scratchpad>/wt` | partway through, every tracked file vanished from that scratch worktree by no step of this review (git then listed it prunable), so the second mutant's run failed on missing files. That run's results were discarded and both scripts re-run in a fresh worktree; the results above are from the re-run. The integration worktree was untouched (`git status --porcelain` empty throughout) |
| Not run | the acceptance run on the home ProPresenter | out of scope for a review |

**Overall:** The remediation did what review 8 finding 1 briefed: the two cases landed byte-identical to the brief's diff, and the mutant it named is killed by exactly them. Every named mutant of the cold press's cover is now killed, so the cover's intent (exactly the one neighbour its button brings, only while no frame has come) is pinned by tests that go red. No production code changed, no behaviour defect is proved, and the four confirmed findings are the LOW tail that remediation deferred in reviews 7 and 8. The branch is ready to open a PR, with that tail as follow-ups.

## Approach decisions
Carried forward from reviews 1 to 8, unchanged:
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it.
- Requests and going offline: a request belongs to the connection it was sent on, an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline.
- Adapter-level behaviour that the fake ProPresenter cannot stage goes in `test/propresenter-adapter.test.ts` (`setDelayFor`, `setStatusFor`). Behaviour the fake can stage stays in `test/propresenter.test.ts`.
- A Clear slide's blank is a fact about the screen, not about the last command (review 4 finding 1, deferred; mechanism unchanged).
- An armed reconnect is staged through `armedRig` and a local set-up (`reconnectArmedShowing`, `reconnectArmedOnTurnaround`). A test that waits for an answer the rig delays waits on its effect with `vi.waitFor`; a test that waits on an absence keeps its sleep.
- A slide change missed while offline is recorded only from what Live reports (review 6 finding 1).
- A cold Next or Previous with no earlier chained press and no `status/slide` frame since the start or the reconnect (`showing === null`) also expects the slide beside `lastShown`, by index in `lastShown.presentation` (`beside` in `runButton`, `slideBeside`). With no `lastShown` it adds nothing (#269's lane).
- The fake's stream open and live slide read follow the 2026-11-10 recording (#269's lane).
- The limits of the cold press's cover are pinned in `test/propresenter.test.ts`, `describe('a reconnect while armed')`, by tests a mutant of `beside` turns red (review 7 finding 1).
- The cover's direction is pinned the same way: an `it.each` over next and previous after `reconnectArmedOnTurnaround()`, each pressing by hand the slide on the other side of `lastShown` inside the press's frame time, expecting a pause (review 8 finding 1, landed in `9e2f74b`).
- A test whose pause must come from one frame asserts the row is still armed just before that frame, as the AC2 test does with `await row((row) => sameLines(row.state, CHORUS_TEXT))` (review 8 finding 2; recorded, not yet applied, carried as finding 1 below).

This review adds none.

## Prior-review closure
Review 8 (`pre-pr-review-8.md`, at `3abd9b9`) confirmed 5 findings.
- **Finding 1 (MEDIUM): fully fixed** in `9e2f74b`. The two cases are the brief's diff exactly, placed after the far-slide test as briefed, `reconnectArmedOnTurnaround` is unchanged, every test the brief's Must preserve names is byte-identical, and `both-neighbours` is killed by both new cases (executed). The brief's intent, the cover is exactly the one neighbour by direction, is now pinned.
- **Finding 2 (LOW): untouched**, deferred by remediation ("deferred: LOW tail, not in this round's default scope"). Carried as finding 1.
- **Finding 3 (LOW): untouched**, deferred the same way. Carried as finding 2.
- **Finding 4 (LOW): untouched**, deferred the same way. Carried as finding 3.
- **Finding 5 (LOW, comment hygiene): untouched**, deferred the same way. Carried as finding 4.
None was "resolved" by editing only a comment or a doc. Review 8's `### Known regressions, deferred` list is "None". No MEDIUM-or-higher finding of review 8 is left partially fixed or untouched.

## Confirmed Issues
### 1. Test 1 never checks it is still armed before its hand press, so it passes with no guard if its frame of index 7 ever counts as by hand — LOW
Carried from review 8 finding 2, unchanged: the delta adds lines after `:920` only, and test 1 (`test/propresenter.test.ts:897-910`) is byte-identical. Attribution: introduced by `fdd86cf` (review 7 finding 1's remediation). Brief, evidence, the executed proof and the recommended one-assertion fix: `pre-pr-review-8.md` finding 2, and the first hunk of `repro/review-8-candidate-tests.diff`. In short: destructure `latest` from `armedRig` at `:899`, and after `await press(producer, 'previous');` assert `expect(await latest()).toMatchObject({ arm: 'armed', pause: null, state: [expect.stringContaining('Chorus / slide 2'), expect.any(String)] });`. Proof: in a scratch worktree at HEAD with that hunk applied, `pnpm exec vitest run test/propresenter.test.ts -t "but not beside the slide showing"` is green; swap `await pro!.sendSlide(THERE_IS_FREEDOM, 7);` and `clock.advance(PAST_WINDOW_MS);` and it must go red. LOW: no user path, a test-strength gap that takes a change to the test's set-up to open.

### 2. Two reconnect tests pin their outcome but not the mechanism their names and comments give — LOW
Carried from review 7 finding 2 through review 8 finding 3, unchanged (`test/propresenter.test.ts:820-846` byte-identical). Brief, evidence and proof: `pre-pr-review-7.md` finding 2. In short: add "keeps an armed ProPresenter armed on the opening frame of a reconnect over the expected slide" beside `:822`, reword the comment at `:820-821` to "A slide changed by hand while the stream was down is no frame of the adapter's own, so its opening frame pauses.", and call `pro!.hangSlideReads()` before the reconnect in the AC2 test at `:837`. Proof: `repro/review-7-mutations.sh`, where `expected-dropped` must then be killed by the new test as well as the AC2 test (today the AC2 test alone kills it, executed this round).

### 3. Five tests the branch added or renamed assert nothing it introduced — LOW
Carried from review 7 finding 3 through review 8 finding 4, unchanged (`test/fake-propresenter.test.ts` is not in the delta; `test/propresenter.test.ts:828` is byte-identical). Brief: `pre-pr-review-7.md` finding 3. In short: in the "opens a stream %s with no status/slide" `it.each`, assert the presentation/current frame's presentation (`HOLY_FOREVER` for the Intro case, `null` for the other two); in the test at `:828`, call `pro!.hangSlideReads()` before the reconnect.

### 4. Comment hygiene — LOW (aggregated)
Carried from review 8 finding 5, unchanged (none of the five lines is in the delta):
- `src/server/propresenter.ts:1067-1070` — "With none either, as after the server's start, it expects nothing, so its cold frame past the window is a change by hand." → "... or its opening frame is late ... With none either, as after the server's start, it expects only what a cue still out gives, so with no cue out its cold frame past the window is a change by hand."
- `test/fake-propresenter.ts:273-274` — "or null with none showing." → "null after a clear; a recorded status/slide chunk sets it to There Is Freedom's even when that chunk shows none, which the opening frames never read then."
- `test/propresenter.test.ts:688-689` — "The read's text shows only when no frame came before its answer" → "The read's text shows only when no status/slide frame or clear came before its answer"
- `src/server/propresenter.ts:201-202` — "After a reconnect over a slide with words, the stream's opening frame places it." → "At the server's start and after a reconnect over a slide with words, the stream's opening frame places it."
- `docs/reviews/setlist-controller-84/repro/review-7-mutations.sh:2-5` — "After the remediation, all three must be killed, and expected-dropped by a test named for the opening frame over the expected slide." → "After review 7 finding 1's remediation, guard-removed and every-slide are killed; expected-dropped is killed by a test named for the opening frame over the expected slide only once review 7 finding 2 lands."

## Needs Further Investigation
### A. The cold press's cover can be stale or beside the wrong place: before the opening frame after an offline change, and while a cue is out — confirm with an adapter test
Carried from reviews 7 and 8, unchanged; the delta does not touch it. To confirm (a): in `test/propresenter-adapter.test.ts`, hold the stream's opening frame (`setDelayFor('/v1/status/updates', ...)`), show a slide changed while offline beside `lastShown`, press Next inside the hold, and check the row stays armed where it should pause. Upgrade to MEDIUM if the service log shows a Next slide or Previous slide answered within 300 ms of "online" after a drop. A fix for (b) would add `cueOut === null` to the guard; it is a decision, since a refused trigger leaves the screen at `lastShown`.

## Reviewed and Dismissed
- The new test passes for a reason other than direction, since Chorus / slide 4 (index 9) also shows at 18 and 35 — no: the pause decision reads `expected` ("(no words)" after the Turnaround cue), `triggersOut` (cleared by `goOffline`) and the press's cover (the one neighbour's text); index 9's text is in none of them for Next, and index 11's for Previous. The duplicates only steer which index a change by hand is placed at. Executed: `both-neighbours` turns both cases red and nothing else in the block.
- The fake's own frame on the press makes `showing` non-null, so the test never reaches the cover — no: `test/fake-propresenter.ts:30-32` answers Next and Previous with 204 and writes no frame; `showing` stays null until the hand frame.
- The row was already paused before the press, so `row(arm === 'paused')` resolves on an old snapshot — no at HEAD: the sibling `it.each` at `:874` asserts armed on the same set-up after the same press, and the mutant kill proves the pause comes from the hand frame. The absence of the test's own precondition is the shape of finding 1, and the far-slide test shares it; not a new finding.
- The em-dashes in `pre-pr-review-8.md`'s closure table — not shipped copy; the doc template requires ` — <SEVERITY>` headings and `— deferred` cells.
- The closure table overstates the remediation — no: its 380-test count, both new cases killing `both-neighbours`, and "no production code changed" all match `git diff 3abd9b9` and this round's runs.

## Minor / nits
- The `earlier-dropped` mutant (drop `!earlier &&` from `beside` at `src/server/propresenter.ts:1071`) now survives deterministically: 380 of 380 over `test/propresenter.test.ts` and `test/propresenter-adapter.test.ts` this round, where review 8 saw it killed once by an unrelated test. Review 8 called it near-equivalent by trace; the trace is not exact (after Next then Previous before Next's frame, the mutant would add Chorus / slide 4 to Previous's cover), but two staged tests of that chain, with and without Next's own frame of 11 first, pause both at HEAD and under the mutant, so the chained press's matching already keeps the extra slide from counting. Not worth a test until a staging that tells them apart is found; the guard's direction is also arguable, since after a refused Next the Previous does bring index 9.
- The new `it.each` (and the far-slide test, and test 1) go red only by `row()` timing out after about 2.4 s, with no diff naming the slide taken as the server's own. Matches local precedent. An optional `expect(pro!.showing()).toEqual({ uuid: THERE_IS_FREEDOM, index })` before the pause assertion, as the `it.each` at `:884` does, would show the hand frame landed.
- The far-slide test covers Next only. `two-ahead` mutates both directions and is killed by the `it.each` at `:874`, so a far cover for Previous alone is the only shape left unpinned; no mechanism suggests it.
- The test name at `:925` reads "inside a cold next's frame time" once `%s` fills in; it follows its sibling at `:874` ("a cold %s's frame").
- Test 1 sits in `describe('a reconnect while armed')` but never reconnects; its name says it covers the start half of the guard. Carried from review 8.
- `repro/review-7-finding-1-tests.diff` is the proof review 7 ran, not the tests that landed; it stays as the record. Carried from review 8.
- Review 7's three nits (`currentOf` reads `bodies` directly; `lateOpeningSlide()` withholds rather than delays; the `t <= 166` filter is shared by the fake and its test) stand unchanged.

## Test quality
Tests added in the delta: 2 (one `it.each` of two cases in `test/propresenter.test.ts`). Green against `$BASE` with HEAD's test file and fake: 2, as review 8's brief declared, since they pin a limit of a cover the base lacks; their red is `both-neighbours`, killed by both (executed). No mocked unit, call-shaped-only assertion, unread snapshot, self-computed expectation, assertion-free or prose test. Mutant score over the cover: `beside` deleted, ±1 swapped, `guard-removed`, `every-slide`, `two-ahead`, `both-neighbours` killed; `expected-dropped` killed by the AC2 test alone (finding 2); `earlier-dropped` survives and is near-equivalent by two staged tests (Minor / nits).

## Before opening the PR
- **CI readiness:** the repo has no CI (setlist-controller#275); the full checks are green here on the first run, with no flake this round.
- **Commit hygiene:** commit this doc. No repro files are added this round: the `earlier-dropped` probes proved no finding and were deleted with the scratch worktree. Nothing to drop.
- **Likely reviewer asks:** as in reviews 7 and 8: the PR should say the cold press after a reconnect is proved against the fake and the 2026-11-10 recording, and name the two cases left for #269's proposal 1. The LOW tail (findings 1 to 4) can be named as follow-ups.

## Verdict
Ready to open a PR, with follow-ups. No CRITICAL, HIGH or MEDIUM finding; the gate review 8 set (its finding 1) is closed and proved by execution. Findings 1 to 4 (LOW) are the tail remediation deferred in reviews 7 and 8, all test strength or comment wording, none a behaviour defect, and they can ship as follow-up work. Of review 8's 5 findings: 1 fully fixed (finding 1, MEDIUM), 0 partially fixed, 4 untouched by decision (LOW), 0 resolved by a comment or doc edit alone. The confirmed list has shrunk from one MEDIUM plus a LOW tail to the LOW tail alone, with production code unchanged since review 7; that is the branch converging, not the review running dry, and no subsystem needs a split ticket.
