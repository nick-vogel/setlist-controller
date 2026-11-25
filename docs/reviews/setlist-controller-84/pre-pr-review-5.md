# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback, follow-up batch #261 to #265, round 2

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `f264357` "Merge pull request #267 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback")
**Reviewed at:** HEAD `0f0e159` (setlist-controller#84 pre-PR review 4 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 23 files total, +1059 / -143 against the merge-base (this counts review 4's doc and its 3 `repro/` files). This review adds the doc and 2 files under `repro/`.
**Delta under review:** since `4e70ffe` (setlist-controller#264 The ProPresenter row shows the live slide text as soon as the status stream opens), the HEAD that pre-PR review 4 (`docs/reviews/setlist-controller-84/pre-pr-review-4.md`, committed at `3ba873e`) reviewed. The delta is `72e4b61` (setlist-controller#84 pre-PR review 4 finding 2: four recorded rules of the batch had no test that could go red) and `0f0e159` (the closure table): 2 test files, +80 / -1, no production code.
**Reviewed against:** review 4's finding 2 and its brief (what each of the four tests must pin), review 4's Approach decisions and closure table, the repo entry's checks and guardrails. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape.
**Date:** 2026-10-25
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | lockfile up to date |
| Lint | `pnpm lint` (`eslint .`) | clean |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test`, at load 11 to 17 on 14 cores | 69 files, 1688 passed, 4 skipped (the `it.runIf(process.platform === 'linux')` cases in `test/setup-screen.test.ts`), first run |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | 56 passed |
| Review 4's mutants | `sh docs/reviews/setlist-controller-84/repro/review-4-mutations.sh <scratch>/wt`, a scratch worktree at `0f0e159` | `read-decides`, `read-as-command`, `refused-line-ungated`, `own-ending-no-end`: killed. `page-empty-set-disables`, `server-empty-set-ignores`: survived (review 4 finding 3, deferred) |
| Each mutant killed by its own new test | each of the four mutants, run against only its test with `-t` | each red: 2a, 2b, 2c, 2d. Cross-check: the 2b mutant leaves the 2a test green and the 2a mutant leaves the 2b test green, so each test pins its own rule |
| The four new tests, repeated | the four with `-t`, three runs | green each run |
| The 2c test's `/next/` 404 | the finder: `|| path.includes('/next/')` dropped from `setStatusFor` | the test goes red at HEAD at its first assertion: a Next answered 204 leaves no press line. Required set-up, not a coincidence |
| Adapter file under CPU load | the finder: the whole file six times beside 6 `yes` processes | 7 of 7 each time |
| Finding 1 | executed: `repro/review-5-finding-1-late-answer.diff` (the trigger answered at 900 ms) is red at HEAD; with `repro/review-5-finding-1-candidate.diff` applied it is green, the file is 7 of 7 three times, and the `refused-line-ungated` mutant still turns the test red | confirmed |
| Tautology audit, base oracle | not run as a base checkout: the delta adds tests for rules that already held at `4e70ffe`, so every one is green there by design. The mutation rows above are the oracle that applies | see Test quality |
| Real ProPresenter | not run: the acceptance run is #134, by hand at home | not run |

**Overall:** Review 4's one gate is closed. The four tests do what its brief asked: each goes red under its own mutant and under no other, and every full check is green at `0f0e159`. This round finds only LOWs, all in the new tests: the refused-trigger test waits a fixed time for an answer, so a loaded machine can turn it red, and one line of its set-up needs a comment. The branch is ready to open a PR.

## Approach decisions
Carried forward from reviews 1 to 4, unchanged:
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it.
- Requests and going offline: a request belongs to the connection it was sent on, an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline.
- Adapter-level behaviour that the fake ProPresenter cannot stage (requests answered late or at different speeds) goes in `test/propresenter-adapter.test.ts`, whose rig takes a delay per request path (`setDelayFor`). Behaviour the fake can stage stays in `test/propresenter.test.ts`.
- A Clear slide's blank is a fact about the screen, not about the last command (review 4 finding 1, deferred; mechanism unchanged).
- Tests for the live slide read's pause-by-hand rules go in `test/propresenter.test.ts`, armed, through the fake's `dropStreams` and reconnect; the refused-trigger gate goes in `test/propresenter-adapter.test.ts` with `setDelayFor`.
- An armed reconnect is staged through `armedRig`, which returns `next`, and the shared local set-up `reconnectArmedShowing`.
- The adapter rig answers a path with a given status through `setStatusFor`, checked before every route, and keeps every state the adapter reports in `states`.

Added by this review:
- A new adapter test that waits for an answer the rig delays waits on the answer's own effect with `vi.waitFor`, after `test/jump.test.ts:37` and `test/end-toggle-default.test.ts:44`, not on a fixed `sleep`. The two existing `sleep(800)` tests (`test/propresenter-adapter.test.ts:173`, `:190`) wait on an absence (no pause), which has no effect to wait for, so they keep their sleep (finding 1).

## Confirmed Issues
### 1. The refused-trigger test waits a fixed 800 ms for an answer delayed 700 ms, so a loaded machine turns it red — LOW
- **Location:** `test/propresenter-adapter.test.ts:198`, `:204`, `:208`
- **Attribution:** introduced by the review 4 remediation, `72e4b61` (`git log -S"refused-after-press" 4e70ffe..HEAD` gives `72e4b61`; the test is absent at `4e70ffe` and at `f264357`).
- **Real-world trigger:** `pnpm test` at a high load average, two lanes at once, the regime of the flaky issue setlist-controller#205, where this run recorded loads of 44 to 68 and 5000 ms timeouts. The rig's 700 ms timer and the test's 800 ms timer share one event loop; a loop stalled past 100 ms fires both in one timers phase, before the answer is read, and the test goes red. No user path: a false red in the suite, never a false green, so LOW.
**Evidence**
```ts
  rig.setDelayFor((path) => (path.includes('/group/') ? 700 : undefined));
  rig.setStatusFor((path) => (path.includes('/group/') || path.includes('/next/') ? 404 : undefined));
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await rig.target.runButton!('next');
  expect(rig.states.at(-1)).toEqual(['Pressed Next slide: nothing to move.']);

  await sleep(800);
```
**Failure mode** — The answer arriving after the sleep stands in for a loaded loop. Executed: `repro/review-5-finding-1-late-answer.diff` delays the trigger to 900 ms, and the test fails with `AssertionError: expected [] to have a length of 1 but got +0` at the `console.error` assertion. It cannot pass falsely: the refusal's log line and the row line it gates are written in the same synchronous `.then` (`src/server/propresenter.ts:563-574`), so a late answer always fails the log assertion. The log assertion also matches a substring only, while its precedent at `test/propresenter.test.ts:829` pins the whole message, status and path included.
**Recommended fix** — `repro/review-5-finding-1-candidate.diff`:
```diff
-  await sleep(800);
+  const refusals = () => vi.mocked(console.error).mock.calls.filter(([message]) => message === 'Setlist server: ProPresenter refused the trigger for Song A, Chorus: it answered 404 to /v1/presentation/A/group/Chorus/trigger.');
+  await vi.waitFor(() => expect(refusals()).toHaveLength(1), { timeout: 3000 });
 
   expect(rig.triggers()).toEqual(['/v1/presentation/A/group/Chorus/trigger']);
   expect(rig.states.at(-1)).toEqual(['Pressed Next slide: nothing to move.']);
-  expect(vi.mocked(console.error).mock.calls.filter(([message]) => String(message).includes('refused the trigger for Song A, Chorus'))).toHaveLength(1);
```
**Remediation brief**
- **Design intent:** the test pins review 4's rule 2c: a refused trigger's line shows on the row only while that trigger is the latest command (`if (run !== presses) return;`, `src/server/propresenter.ts:571`), and every refusal is still logged once. The wait must end on the refusal itself, which is logged in the same synchronous step that would write the stale line, so once the log line exists the row's last state is final.
- **Full surface:** `test/propresenter-adapter.test.ts:204-208` only. `sleep` stays defined, since the file's other tests use it.
- **Must preserve:** the test's set-up lines `:197-202`, including the `/next/` 404 (without it the press leaves no line and the test cannot reach the rule, proved by the finder); the first `states.at(-1)` assertion at `:202`; that the test goes red under `refused-line-ungated` (`repro/review-4-mutations.sh`); the other six tests in the file, 7 of 7.
- **Do not touch:** the `sleep(800)` waits at `test/propresenter-adapter.test.ts:173` and `:190`, which wait on an absence (see Approach decisions); `setStatusFor` in the rig (Reviewed and Dismissed).
- **Proof:** in a scratch worktree at HEAD (`git worktree add --detach <scratch>/wt HEAD && ln -s "$PWD/node_modules" <scratch>/wt/node_modules`, then `cd <scratch>/wt`): `git apply docs/reviews/setlist-controller-84/repro/review-5-finding-1-late-answer.diff && pnpm exec vitest run test/propresenter-adapter.test.ts -t "keeps a later press"` is red now and green after the fix. Then, back at the fixed tree, `pnpm exec vitest run test/propresenter-adapter.test.ts` is 7 of 7, and `sh docs/reviews/setlist-controller-84/repro/review-4-mutations.sh <scratch>/wt` still prints `refused-line-ungated: killed (red)`. Remove the scratch worktree after.

### 2. Comment hygiene — LOW (aggregated)
- `test/propresenter-adapter.test.ts:199` — no comment on the `/next/` 404 in `setStatusFor`, which reads as an incidental match and is what makes the press leave a line at all → add above it: `// Next answered 404 leaves the press's "nothing to move" line; a Next that moves leaves none.`

## Needs Further Investigation
### A. The fake's opening presentation/current carries a presentation while a slide shows, which no recording backs
Carried from review 4 unchanged: confirm or kill in #134 at home by recording the stream's opening frames and one `GET /v1/status/slide` with words showing and with the screen clear. The two new read tests stand on the same fake opening.

### B. A Next slide pressed while a cue's trigger is out, whose frame the press did not predict, no longer moves the expected slides
Carried from reviews 2 to 4 unchanged.

## Reviewed and Dismissed
- The 2c test's `/next/` 404 as a coincidence that makes the test pass — required set-up: with Next answered 204 the test is red at HEAD at its first assertion, before the rule, and red the same way under the mutant (finder, executed).
- `setStatusFor` checked before every route changing the existing adapter tests — its default returns `undefined`; it sits after the stream branch and after `triggers.push`, so streams and the trigger record are untouched; the other six tests are green.
- `reconnectArmedShowing`'s `console.error` spy leaking into later tests — `vi.restoreAllMocks()` runs in each file's `afterEach` (`test/propresenter.test.ts:28`, `test/propresenter-adapter.test.ts:48`), and `pro` and `rig` are closed there.
- `expect(slideReads()).toHaveLength(2)` in 2a — the read at the first open and the read at the reconnect, both on `pro.requests`; the same count as the existing reconnect test at `test/propresenter.test.ts:444`.
- 2a and 2b passing for each other's reason — the cross-check above: each test stays green under the other's mutant.
- The `sleep(800)` against a 700 ms delay in the two older adapter tests — they assert that no pause happened, which has no event to wait on; they predate this delta.

## Minor / nits
- `test/propresenter.test.ts:543`: under its mutant the 2b test goes red by the `row` helper's 2 s wait ("Waited 2000ms for a snapshot..."), not by an assertion diff. A real red; `await pro!.idle()` then `expect(await latest()).toMatchObject({ arm: 'paused', pause: 'by-hand' })` would fail at once with a diff. The `row((row) => row.arm === 'paused')` shape is the file's own precedent (`:1203`, `:1227`).
- `test/propresenter.test.ts:530`, `:539`: `row(...)` resolves on any snapshot, past or to come. No snapshot before the reconnect can carry `VERSE_3_TEXT` or `CHORUS_TEXT` (the fake sends no frame on a trigger, the first read found nothing, and going offline clears the row), so it cannot resolve stale today; `next(...)` would make "after the reconnect" explicit.
- `test/propresenter.test.ts:517-523`: the drop and reconnect sequence repeats `:431-440` nearly line for line.
- `test/propresenter.test.ts:514`: `clock.advance(PAST_WINDOW_MS)` adds nothing the later `clock.advance(POLL_MS)` (2000 ms, past the 1000 ms window) does not already do. Harmless, and states the intent.

## Test quality
Tests added in the delta: 4 (2 in "the live slide read" and 1 in "the cue" in `test/propresenter.test.ts`, 1 in `test/propresenter-adapter.test.ts`). Green against `4e70ffe`: all 4, by design, since each pins a rule that held there; each goes red under its own mutant and under no other of the four, so none is vacuous. Tautology shapes found: 0 (no mocked unit, no snapshot, no expectation computed with a production helper, no assertion-free test). The one weakness is finding 1: a fixed sleep and a substring log match in the 2c test.

## Prior-review closure
Review 4 (`pre-pr-review-4.md`, at `4e70ffe`):
- **Fully fixed: 1.** Finding 2 (MEDIUM): all four mutants killed at `0f0e159`, each by its own new test.
- **Partially fixed: 0.**
- **Untouched: 3, all LOW and deferred by the remediation's default scope** ("LOW tail, deferred" in review 4's closure table): finding 1 (Clear then another press leaves the old words; production code unchanged since `4e70ffe`), finding 3 (`page-empty-set-disables` and `server-empty-set-ignores` still survive at `0f0e159`), finding 4 (comment hygiene, none of its four entries edited).
- Resolved only by editing a comment or doc: 0.
- No MEDIUM-or-higher prior finding is open.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` green at `0f0e159`; `pnpm test:e2e` green locally.
- **Commit hygiene:** commit this doc and its two `repro/` files. The tree is otherwise clean.
- **Likely reviewer asks:** the acceptance run on the real ProPresenter (#134), which settles Needs Further Investigation A; #266 (pause by hand edge cases, skipped this run); the LOW tails of reviews 1, 2 and 4 still deferred.

## Verdict
Ready to open a PR, with follow-ups. Review 4's one gate (finding 2) is closed and proved by execution. This round's two findings are LOW, test-only, and can ride along or ship later: finding 1 is the one worth doing before the PR if CI runs under load. No CRITICAL, HIGH or MEDIUM. The Confirmed count shrank from four to two, both in the remediation's own tests, which is the expected end of the batch's review rounds; no subsystem needs a split ticket.
