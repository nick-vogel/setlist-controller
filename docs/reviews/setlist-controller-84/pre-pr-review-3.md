# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `6aec698` "Merge pull request #246 from nick-vogel/setlist-controller-101-count-off-into-section"; `origin/main` has not moved since)
**Reviewed at:** HEAD `4619360` (setlist-controller#84 pre-PR review 2 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 52 files total, +16469 / -33 against the merge-base. This review adds the doc and nothing under `repro/`.
**Delta under review:** since `5fc7f89` (setlist-controller#84 pre-PR review 1 remediation closure table), the HEAD that `pre-pr-review-2.md` reviewed. 3 files, +403 / -1, of which the review 2 doc and its `repro/review-2-remediation-branches.test.ts` are 2 files, and the code is 1 file, +34 / -1: `test/propresenter-adapter.test.ts`. Commits `711189f` (setlist-controller#84 pre-PR review 2), `b5a54d7` (setlist-controller#84 pre-PR review 2 finding 1: the identity check and the button exemption of the two-triggers fix had no test that could go red, ...), `4619360`. No production code changed in the delta.
**Reviewed against:** `pre-pr-review-2.md` (its finding 1, the remediation closure table, its Known regressions list, which is empty, and both Approach decisions sections); `pre-pr-review-1.md` closure as carried by review 2. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 3, delta-scoped.
**Date:** 2026-10-24
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | lockfile up to date |
| Lint | `pnpm lint` (`eslint .`, which covers `docs/reviews/setlist-controller-84/repro/`) | clean |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 69 files, 1662 passed, 4 skipped |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | 56 passed |
| Delta tests, mutation (the oracle, since the delta adds tests only and the code they guard was already right at `5fc7f89`) | the finder, in a scratch worktree at HEAD, each mutant alone against `pnpm exec vitest run test/propresenter-adapter.test.ts`: `if (cueOut === out) cueOut = null;` as `cueOut = null;`; `if (cueOut !== null && brought < 0) return;` as `if (cueOut !== null) return;`; the trigger's `.then` never clearing `cueOut` | first mutant: exactly the new End-answered-first test red, other 5 green; second: exactly the new Next-while-trigger-out test red, other 5 green; third: not caught by this file, caught in `test/propresenter.test.ts` ("pauses ProPresenter on a press by hand of a Chorus slide after the producer's Next slide brings a verse slide"), so no gap. Matches review 2's remediation table |
| Delta tests under load | the finder: HEAD 4 runs and each mutant 3 runs beside 28 `yes` processes on 14 cores; this review: the file 5 times concurrently | HEAD 6 of 6 green in every run; each mutant caught in every run |
| Path predicates in the new tests | read against `src/server/propresenter.ts:165` and `:676` | End's trigger is `/v1/presentation/A/group/End/trigger`, so `includes('/group/End/')` hits it; the next song's `/group/Verse%201/trigger` takes the 700 ms branch; Next is `/v1/presentation/active/next/trigger`, so `includes('/next/')` hits it |
| `setDelayFor` fallback and isolation | read | `delayFor` is a closure per `startRig`, one rig per test, so nothing leaks between tests; the default `() => undefined` sends every request of the four older tests through `??` to `triggerDelay` and `presentationDelay` as before; `??` honours an explicit 0 |
| Tautology audit | the two new tests, by mutation (above) and by reading for the six shapes | no tautology shape; each goes red on its own mutant only |
| Real ProPresenter | not run: the acceptance run is #134, by hand at home | not run |

**Overall:** The review 2 remediation holds. The two tests it added reach the orders they are named for, each goes red on exactly the mutant review 2 named, at idle and under load, and every full check is green at `4619360`. No production code changed since review 2, and this round confirms no new defect. The branch is ready to open a PR; review 2's LOW findings 2 to 4 and review 1's LOW findings 4 to 8 stay open by decision as follow-ups.

## Approach decisions
Carried forward from reviews 1 and 2 and their remediations, unchanged:
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it. While the mark is set, a frame outside the expected slides that no button brought leaves them.
- Requests and going offline: a request belongs to the connection it was sent on, an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline. A multi-request read (`readPicked`) that the abort cuts off keeps the last read. Precedent: the stream's own `abort` and `streams` counter in `openStream`.
- Adapter-level behaviour that the fake ProPresenter cannot stage (triggers or reads answered late, two triggers out at once, triggers answered at different speeds) goes in `test/propresenter-adapter.test.ts`, which drives the adapter against its own small HTTP ProPresenter, whose rig takes a delay per request path (`setDelayFor`) additive to its trigger and presentation delays. Behaviour the fake can stage stays in `test/propresenter.test.ts`.

Added by this review: none.

## Confirmed Issues
None. The delta is one test file that adds two tests and a rig hook, and every candidate the finder raised against it is either a nit or an inferred timing risk that did not reproduce (below).

## Needs Further Investigation

### A. A Next slide pressed while a cue's trigger is out, whose frame the press did not predict, no longer moves the expected slides
Carried from review 2 unchanged, since no production code changed. `cue` leaves `showing` on the slide before the trigger (review 1 finding 4, deferred), so a Next press made while the trigger is out predicts from the old slide. If the cued group has one slide and Next crosses into the next group, the frame matches no press (`brought < 0`), and while `cueOut` is set it leaves the expected slides on the cued group. A Go To Next frame in the next group outside every window would then pause. Reasoned from the code, not run. Confirm with a variant of the new adapter test at `test/propresenter-adapter.test.ts:173`: cue Tag (one slide, `t1`), press Next while the trigger is out, send `e1`, then after the windows send `e2`. Review 1 finding 4's recommended fix (a cue sets `showing` to the triggered group) closes this too, so it belongs with that LOW when Nick triages it.

### B. Under heavy load, the two new adapter tests can go red on correct code or stop catching their mutant
Inferred by the finder from the timings, not reproduced in 4 loaded runs at HEAD, 3 per mutant, or 5 concurrent runs here. The End-answered-first test (`test/propresenter-adapter.test.ts:160-171`) needs the `e1` frame, sent at about 200 ms, decided before the next song's 700 ms answer: about 500 ms late, the mark is already cleared, `expected` becomes `{e1}`, and the later `b1` frame pauses (a false red, the same class as review 2's Minor on the older two-triggers test, with a wider margin). If End's 50 ms answer is decided after the `e1` frame, the first mutant passes (a false green). In the Next-while-trigger-out test (`:173-188`), an `a2` frame decided after the Chorus answer, more than about 550 ms late, lets the second mutant pass (a false green). Confirm by running the file in a loop beside a full `pnpm test` and a CPU hog until a red, or kill it with a large clean count. If it confirms, widen the gaps: the slow delay 1500 ms with the following sleep 1600 ms; the clock is the manual clock, so only wall time grows.

## Reviewed and Dismissed
- `setDelayFor` leaking across tests — `delayFor` is declared inside `startRig`, and `afterEach` closes the rig, so each test starts with `() => undefined`.
- The per-path delay changing the four older tests — they never call `setDelayFor`, so every request falls through `??` to the old expression, and all four pass as before.
- The new tests not reaching their order because a predicate misses — both predicates match the real paths (`src/server/propresenter.ts:165`, `:676`), and each mutant run turns exactly the intended test red.
- The `.then` clearing `cueOut` at all being untested — `test/propresenter.test.ts` catches the mutant that never clears it.
- Review 2's remediation diverging from its repro (End as one slide, `e1` alone, where the repro's fixture gave End a second slide) — declared in review 2's closure, and the order and the mutant kill are the same.

## Minor / nits
- `test/propresenter-adapter.test.ts:173`: the name says "moves the expected slides to the slide a Next slide press brings", but `decide` (`src/server/propresenter.ts:456`) moves them to the whole group showing that slide (`{a1, a2}`). "to the group of the slide a Next slide press brings" is exact.
- `test/propresenter-adapter.test.ts:160-188`: neither new test asserts its setup went out, for example `expect(rig.triggers()).toContain('/v1/presentation/A/group/Chorus/trigger')`. Today the mutant runs prove the order is reached; a later fixture change that made `cue()` send nothing would leave both tests green on correct and broken code alike.
- `test/propresenter-adapter.test.ts:176`: the first `rig.clock.advance(5000)` is a no-op, since no command has run and the window is still at `-Infinity`. Harmless.
- `test/propresenter-adapter.test.ts:184`: `expect(rig.hands()).toBe(before)` is relative, and `before` is 1 because the first `a1` frame counts as a change by hand with no expected slides yet. Harmless.
- The two new tests add `dist/propresenter-adapter/end-answered-first.json` and `button-while-trigger-out.json` to the fixed-name state files review 2 finding 3 (LOW, deferred) already names. The fix that finding recommends covers them with no extra step, since it drops the `label` parameter.

## Test quality
Tests added in the delta: 2, both in `test/propresenter-adapter.test.ts` (lines 160 and 173), plus the rig's `setDelayFor`. Against `5fc7f89` both are green, as expected: the delta adds tests for code that was already right, so mutation is their oracle, and each goes red on exactly its own mutant (table above). They are review 2 finding 1's proofs (`git log -S` on either name gives `b5a54d7`), so keep them. Tautology shapes: none. The two open edges are the setup assertion and the load margins (Minor and Needs Further Investigation B).

## Prior-review closure
| Review 2 finding | Status | Evidence |
| --- | --- | --- |
| 1 (MEDIUM) two branches of the two-triggers fix with no test that can go red | fixed | `b5a54d7` adds both tests; each red on its mutant alone, green at HEAD, at idle and under load (table above) |
| 2 (LOW) the `!given.aborted` guard untested, comment gives it the wrong job | untouched, deferred by decision (review 2 remediation scope: "The LOW findings 2 to 4 are deferred on purpose") | no delta in `src/server/propresenter.ts`; the comment at `:288-290` still reads as review 2 quotes |
| 3 (LOW) fixed-name state files in `dist/` never removed | untouched, deferred by decision | the delta adds two more labels to the same mechanism (Minor) |
| 4 (LOW) comment hygiene | untouched, deferred by decision | no delta in `src/server/propresenter.ts` |
| NFI A | not worked, carried as A above | no production delta |

Review 1's MEDIUM findings 1 to 3 stay fixed (no production delta since review 2 verified them), and its LOW findings 4 to 8 stay open, deferred by decision. Fully fixed this round: 1 of 1 MEDIUM. Partially fixed: none. Resolved by a comment or doc edit alone: none. Review 2's Known regressions list is empty, and none appeared.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` green at `4619360`; `pnpm test:e2e` green locally.
- **Commit hygiene:** commit this doc. The tree is otherwise clean.
- **Likely reviewer asks:** the acceptance run on the real ProPresenter (#134), which settles the 1000 ms window and the cold-frame timings review 1 findings 4 and 5 depend on; the deferred LOWs from reviews 1 and 2, which want follow-up tickets.

## Verdict
Ready to open a PR, with follow-ups. There is no gate: no CRITICAL, HIGH or MEDIUM finding is open, and this round confirms none. Review 2's one MEDIUM is fixed by tests that go red on their mutants, and nothing was resolved by a comment alone. The follow-ups are the deferred LOWs (review 1 findings 4 to 8, review 2 findings 2 to 4) and Needs Further Investigation A and B. The confirmed list went from 8 to 4 to 0 across three rounds, and what is left is nits about one test file, which is a converged branch, not a review short of findings. No subsystem needs a split ticket.
