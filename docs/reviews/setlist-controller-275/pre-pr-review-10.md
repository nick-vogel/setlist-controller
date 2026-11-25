# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line (fresh review after run 6, stage 1)

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `d583d9e`, Merge pull request #375 from nick-vogel/setlist-controller-275-propresenter-lyric-timing)
**Reviewed at:** HEAD `fb6c5fc` (setlist-controller#371 A section that clears, played into after a Fade out dropped the next section's pickup slide 1, sends its clear and the slide on one report). Clean tree: no uncommitted or untracked files at the start. Against the merge-base: 4 files, +250 / −32, 5 commits (`5e4c247` and its merge `eb383ca` for #370; `48342d0`, `edf3fb3` and `fb6c5fc` for #371). This review adds this doc and 1 file under `repro/`.
**Delta under review:** none. `--fresh`: the whole working surface since `d583d9e` is reviewed. `pre-pr-review-9.md` reviewed the branch before PR #375 merged it into main; everything it covered is on the base now. `origin/main` has moved on to `f486edf` (PR #379, `docs/install.md` only), which merges into `fb6c5fc` with no conflict (`git merge-tree`).
**Reviewed against:** `nick-vogel/setlist-controller#370` and `#371` (bodies), epic `#275`'s sub-issue list, `.epic-loop/tickets/370/` and `371/` assumptions, proposals and reports, and `pre-pr-review-9.md` finding 2 and its Approach decisions. No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply.
**Date:** 2026-11-08
**Reviewer:** 1 code-review agent + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `fb6c5fc` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and seam suites | `pnpm test` | 74 files, 2206 passed, 4 skipped |
| Build | `pnpm build` | built |
| End to end | `pnpm test:e2e` (builds, then WebKit and Chromium on OS-assigned ports) | 66 passed |
| Finder: all four files | diff read, `tsc --noEmit`, `test/propresenter.test.ts` (290 passed) and 3 throwaway tests in a scratch worktree at HEAD | NFI A (executed by the finder, not preserved), finding 1 part (b), comment entries, dismissals |
| Orchestrator read of `deliver`, `passedClear`, `coveredClear`, `passingClear`, `ahead`, `onward`, `inSections`, `fire`, `back`, `movedBack` | read the real call paths | NFI B, dismissals |
| Tautology audit | the branch's `test/propresenter.test.ts` copied into a scratch checkout at `d583d9e`; 7 mutations of `connections.ts` in a second scratch checkout at HEAD | 10 tests in scope: 6 red at base, 4 green, none vacuous; one mutation survives the whole file (finding 1 part (a)) |
| Finding 1 (a) proof | `repro/review-10-finding-1-mutant-no-until-bound.diff` applied in a scratch checkout at `fb6c5fc` | `test/propresenter.test.ts` stays 290 of 290 green |
| Merge with current main | `git merge-tree --write-tree HEAD origin/main` | clean |
| Not run | the real ProPresenter and the real Live; no server on 11000 or 11001 (guardrail) | not run, by the repo's guardrails |

**Overall:** every full check is green, and both tickets do what their end states say. #370's `passedClear` drops a clear Live reports after a change past it went early, after `back()` so a drag back still clears; #371's `clearing` arm hands the next section's pickup slide (or the crossing's) in place of a clear its lead covers, when that slide did not go early, and keeps the clear while a jump waits. Nothing is CRITICAL, HIGH or MEDIUM. What remains is two unpinned guards (finding 1), comment and doc drift (finding 2), and two pre-existing loop corners for follow-up (NFI A and B).

## Approach decisions
- Carried from review 4, unchanged: an End inside the crossing's lead is judged by `droppedEnd`, which runs first in `deliver`; #352's `intoEnd` arm hands the crossing's slide in place of an End played into when the crossing did not go early, measured against the crossing's beat less the lead.
- Carried from review 5, applied in `a1bcc5b`, unchanged: a drag back inside a section that clears hands the section's clear only when the landing is before the change sent early's send point, the plan holds no slide, and a change was sent early.
- Closed from review 9 (finding 2, Nick's decision, taken as #371's recorded assumption): a section that clears, played into, whose clear the next section's slide 1 on a pickup (or the crossing's first slide) passes, follows #352's rule for the End: when that slide did not go early, the section hands the slide at once in place of its clear, measured against the slide's beat less the lead, and counts it as sent early. The match is `passingClear` at the section's downbeat (`coveredClear`), never while `predict` is unknown (`edf3fb3`). #317's no-pickup case (a clearing section shorter than the lead, `test/propresenter.test.ts:5159`) keeps the clear, then the slide; changing it is the open proposal in `.epic-loop/tickets/371/proposals.md`.
- New with #370 (`5e4c247`): a clear played into (`given.slide === undefined`) that Live reports after a change from its song, or the crossing from it, went early for a beat past its downbeat sends nothing and schedules nothing, as a dropped End does. The check sits after `back(entry, here)`, pinned by `test/propresenter.test.ts:4129`.

## Confirmed Issues
### 1. Two guards of the new code have no test that goes red without them — LOW
- **Location:** `src/server/connections.ts:1000` (`here <= untilBeat(change) + EPSILON` in the `clearing` arm) and `src/server/connections.ts:685` (the section half of `passedClear`)
- **Attribution:** introduced. `git log -S'coveredClear(entry, cue, change) && here' d583d9e..HEAD` names `48342d0`; `passedClear` arrives in `5e4c247`.
- **Real-world trigger:** none known. Neither guard changes what a user sees today: (a) a played-into cue for a section that clears comes before the next section's downbeat, so `here` is never past the pickup's `untilBeat`; (b) the look ahead stops at a clear (`inSections:613`), and a pickup that passes it is dropped first by `droppedClear`, so no change goes early past a section that clears before that section's cue. LOW, capped: upgrade to MEDIUM if a cue path is found that delivers a clearing section's cue with the playhead past the next section's downbeat, check via a test that reports one position from inside the Vamp to past the Chorus's downbeat after a Fade out.

**Evidence** —
```ts
            : clearing
              ? coveredClear(entry, cue, change) && here <= untilBeat(change) + EPSILON
```
```ts
    return cue.cause === 'played-into' && given.slide === undefined && early !== null && (early.cue.song === cue.song || early.crosses === cue.song) && start !== null && untilBeat(early) > start + EPSILON;
```
**Failure mode** — (a) The mutant in `repro/review-10-finding-1-mutant-no-until-bound.diff`, which drops the bound, leaves `test/propresenter.test.ts` 290 of 290 green, so a later edit that loses the bound would hand a pickup slide whose downbeat has passed and mark it early with `from` past its beat. (b) Every #370 test drives an End with no group; the section half of `passedClear` (a section that clears) has only the negative drag-back test at `:4129`. The song condition has no guard either: the per-ticket review of #370 (F1.5) ran a mutant without it, 302 of 302 green.
**Recommended fix** — Add a test for (a) in the `vampRig` describe: after a Fade out and the producer arming ProPresenter again, one position report that carries the playhead from inside the Vamp to past the Chorus's downbeat, asserting the Chorus's first slide goes once and nothing goes for the Vamp. When no harness step can deliver the Vamp's cue that late, say so in the brief's Design intent and keep the bound as defensive; do not delete it. For (b), add a test only if a path to it exists (a held start raising the section late, `src/server/cues.ts` `startWaiting`, is the candidate); otherwise leave the code.
**Remediation brief**
- **Design intent:** the `clearing` arm reuses the landing branch's shape: a slide handed in place of the cue's own counts as sent early with `from: here`, and is only valid while the playhead is at or before the slide's `untilBeat`. `passedClear` exists so a clear never blanks a slide the screen already shows for a later place; it is checked after `back()` so a move behind `from` forgets the early change first.
- **Full surface:** `src/server/connections.ts:994-1001` (`inside`), `:682-686` (`passedClear`), `:975` (its call); tests near `test/propresenter.test.ts:5448` (the Vamp after a Fade out) and `:4087` to `:4155` (#370's End group).
- **Must preserve:** `test/propresenter.test.ts:4129` (a drag back into the Turnaround clears), `:5473` (the Vamp keeps its clear at 150 BPM while a late-tapped jump waits), `:5448`, `:5457`, `:5507`, `:5220`, and every test in the "the pickup start" describe.
- **Do not touch:** the missing `passes` on the clearing arm's early record (Dismissed, below); the redundant guards in `coveredClear` (per-ticket F2.1, a refactor).
- **Proof:** `git apply docs/reviews/setlist-controller-275/repro/review-10-finding-1-mutant-no-until-bound.diff && pnpm exec vitest run test/propresenter.test.ts` in a scratch worktree at HEAD: green now; once the new test lands it must go red with the mutant and green without.

### 2. Comment hygiene — LOW (aggregated)
- `src/server/connections.ts:679-681` — "A wrap sent early never counts: the look ahead stops at a clear before the brace's end, so a clear played into after the wrap went starts at or past that end, the wrap's own beat." → "A wrap sent early counts only for an End with no group under a brace set by hand that runs past the End: the look ahead stops at a section that clears before the brace's end." (per-ticket F1.2; NFI B is its consequence)
- `src/server/connections.ts:64-66` — "goes at once in place of the clear when Live reports the clearing section" → add "unless a jump still waits, when the clear goes"; and rewrap line 66 (134 columns) to the block's width near 100.
- `src/server/connections.ts:181-184` — "and so is a section that clears, played into, whose clear the next section's slide 1 on a pickup, or the crossing's, passes, when that slide did not go early" → add "and no jump waits".
- `docs/install.md:257` and `docs/install.md:280` — "the section that clears sends the slide at once in place of its clear." → "the section that clears sends the slide at once in place of its clear, unless a jump is still waiting, when the clear goes as before."
- `README.md:49` — "that Live reports only after the slide for a place past it went sends nothing too" → "that Live reports only after the slide for a place past it has gone, sends nothing too" (per-ticket F1.11).

## Needs Further Investigation
### A. A loop wrap into a section that clears, under a brace set by hand that runs past the next section's pickup, sends the clear and then the pickup slide on one report — what would confirm it
The finder ran it in a scratch test on the Vamp rig (pickup -0.625, brace 96 to 104, the pickup sent at 95.5, playback on to 102.5 and the wrap back to 96.5): ProPresenter got `/v1/clear/layer/slide` and then `.../11/trigger`, the flash #371 removes for a section played into. Both `clearing` (`src/server/connections.ts:991`) and `coveredClear` (`:695`) require `played-into`, and `wrapOf` (`:548-555`) returns null for a brace that starts on a section with no slide, so nothing goes early before the wrap. Pre-existing, untouched (the loop path is the same at `d583d9e`). LOW, capped: a Loop press puts the brace on the section itself, which never reaches past the next downbeat, so only a brace set by hand in Live meets it. Confirm with that test preserved under `repro/`; the candidate fix is to let the `clearing` arm and `coveredClear` take `cause === 'loop'` too. Follow-up material, not a gate.

### B. An End with no group, under a brace set by hand that runs past the End, inside the lead of the brace's end, on a song set to Stop at end, keeps the looped section's slide up when Live stops — what would confirm it
From reading: `ahead` from the last section returns `wrapOf` when the crossing is past the brace's end (an End with no group gives `onward` no End slide), so the wrap goes early at the brace's end less the lead. When the End falls inside that lead, its cue arrives after the wrap went with `untilBeat(early)` past the End, so `passedClear` drops the End's clear; the playback controller then stops Live at the End and the screen keeps the wrap's slide. A Loop press on the last section gives a brace ending on the End, where `untilBeat(early)` equals the End and `passedClear` does not fire, so only a brace set by hand meets it. Introduced in shape by `5e4c247` (the base sent the clear). LOW, capped. Confirm with a test: a hand brace over the last section of Ancient Gates ending one beat past its End, End toggle on Stop at end, assert the End's clear. Fix candidate: `passedClear` excludes `early.wrap === true`, the third assumption #370 dropped (`.epic-loop/tickets/370/assumptions.md`).

## Reviewed and Dismissed
- The `clearing` arm's early record carries no `passes`, unlike `fire`'s (finder F2) — `passes` is read only by `droppedClear`, and no path delivers the same section that clears twice while that record stands (the finder's stop-and-restart probe went through `moved`, which sent nothing).
- The README sentence for #370 claims more than `passedClear` does, since `passedClear` only takes a cue with no slide (finder F5) — an End with a group reported after the crossing went is already kept off the screen by `wentEarly` in the slide path (`:1016`), so the sentence is true of what the user sees.
- `coveredClear` matching a different change than `ahead` picks — checked for the next section's pickup, the crossing (with `crosses`, so the end-toggle forget still works), a next section that also clears (a stop, no match) and an End with a group outside the lead (`passingClear` null). Holds.
- `slideDue` for a pickup whose beat is before the clearing section's start — `due + (change.beat - start)` beats less the lead is the pickup's send time either way; `:5457` pins 375 ms.
- `following` after the new early record — `untilBeat` is the next downbeat, so it looks ahead from the pickup and schedules slide 2; `reached` forgets it on the downbeat, and `wentEarly` stops a resend.
- Multiple targets — each entry uses its own lead and plan, and a target with no lead takes the lead-0 branch before any of this code.
- `passedClear` firing on an End reported before the crossing went — `early` is null then, so the clear goes, pinned by `:4105`.

## Minor / nits
- Every played-into section now calls `planOf` in `clearing`, in `coveredClear` and again through `ahead`, so a target whose plan throws logs more identical `could not plan its slides` lines per cue than before (finder F6).
- Carried from the per-ticket reviews, unchanged: #370 F1.3, F1.4, F1.6 to F1.10, F1.12; #371 F2.1 to F2.3, F2.6 to F2.8 (`.epic-loop/tickets/370/report.md`, `371/report.md`).
- The `intoEnd` arm (#352) does not check `predict` while a late-tapped jump waits, the twin of `edf3fb3`'s fix; already a proposal in `.epic-loop/tickets/371/proposals.md`.

## Test quality
Tests added or modified: 10 · green against `d583d9e`: 4 · tautology shapes found: 0. Red at base: `test/propresenter.test.ts:4087`, `:4140`, `:5220`, `:5448`, `:5457`, `:5507`, each on the extra `/v1/clear/layer/slide` the base sends. Green at base, all guards, none vacuous: `:4105` (an End reported before the slide went still clears; the weakest, kills none of the 7 mutations, strengthen by asserting the cue order while `pro!.hang()` holds, as `:4087` does), `:4120` (stop at End forgets the early slide; kills the end-toggle mutation), `:4129` (drag back clears; the only test that kills moving `passedClear` above `back()`), `:5473` (review pass 1 finding 1's proof from `edf3fb3`; kills dropping the `predict` guard). No mocks, call-shaped assertions or snapshots; expectations are literals, and the two log tests assert parsed fields. Gaps: finding 1. Nothing to delete.

## Before opening the PR
- **CI readiness:** the repo has no CI (removed in PR #300). Lint, typecheck, `pnpm test` (2206 passed, 4 skipped), build and e2e (66 passed) are green at `fb6c5fc`.
- **Commit hygiene:** clean tree before the review. This review adds this doc and `repro/review-10-finding-1-mutant-no-until-bound.diff`. Merge `origin/main` (`f486edf`, docs only, clean) before the PR.
- **Likely reviewer asks:** close #370 and #371; #371's proposals (the shorter-than-lead clear, and the `intoEnd` late-tap twin) as follow-up tickets; NFI A and B as follow-ups.

## Prior-review closure
`pre-pr-review-9.md` finding 2 (a section that clears still flashes blank before a dropped pickup slide): fully fixed by `48342d0` and `edf3fb3`, with `:5348`'s pinned order changed red first to `:5448`. Its findings 1, 3 and 4 were on the base before this surface and are not in it.

## Verdict
**Ready to open the PR, with follow-ups.** Nothing is CRITICAL, HIGH or MEDIUM, and every full check is green. Findings 1 and 2 are test and comment work that can ship as follow-ups or ride along; NFI A and B are pre-existing or contrived loop corners for tickets. No finding gates the PR.
