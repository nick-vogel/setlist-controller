# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `6aec698` "Merge pull request #246 from nick-vogel/setlist-controller-101-count-off-into-section"; `origin/main` has not moved since)
**Reviewed at:** HEAD `5fc7f89` (setlist-controller#84 pre-PR review 1 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 50 files total, +16067 / -33 against the merge-base. This review adds the doc and 1 file under `repro/`.
**Delta under review:** since `4c8a13e` (setlist-controller#132 ProPresenter pause by hand: a slide pressed in ProPresenter pauses automation), the HEAD that `pre-pr-review-1.md` reviewed. 9 files, +931 / -24, of which the review 1 doc and its `repro/` are 5 files, and the code is 4 files, +315 / -24: `src/server/propresenter.ts`, `test/fake-propresenter.ts`, `test/propresenter.test.ts`, and the new `test/propresenter-adapter.test.ts`. Commits `5979e5c`, `c0b59d0`, `0cf2946`, `b24d8cc`, `5fc7f89`.
**Reviewed against:** `pre-pr-review-1.md` (its findings 1 to 3, the remediation closure table, the Known regressions list and both Approach decisions sections); the epic setlist-controller#84 and its sub-issues as summarised in review 1. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 2, delta-scoped.
**Date:** 2026-10-24
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | lockfile up to date |
| Lint | `pnpm lint` at HEAD; `pnpm exec eslint docs/reviews/setlist-controller-84/repro/` with this review's repro in place | clean, clean |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | first run: 1 failed, 1659 passed, 4 skipped, while mutation runs loaded the machine in a scratch worktree (the failing test's name was not captured); re-run alone: 69 files, 1660 passed, 4 skipped. Treated as a flake |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | 56 passed |
| Delta tests at the last-reviewed commit | the 3 changed test files copied onto a scratch worktree at `4c8a13e`, `pnpm exec vitest run test/propresenter-adapter.test.ts test/propresenter.test.ts` | 2 red, as they should be: the adapter's two-triggers test (review 1 finding 1) and its stale-request test (finding 2). The rest green, as expected (see Test quality) |
| Mutation of the remediation | 12 mutants of `src/server/propresenter.ts`, each alone, in a scratch worktree at HEAD, against `test/propresenter-adapter.test.ts` and `test/propresenter.test.ts` (72 tests) | 9 killed; 3 survived with all 72 green: `if (cueOut === out) cueOut = null` as `cueOut = null`, `cueOut !== null && brought < 0` as `cueOut !== null`, and `if (!given.aborted) goOffline(error)` as `goOffline(error)` (findings 1 and 2) |
| The three survivors, executed | `repro/review-2-remediation-branches.test.ts` copied into `test/` of a scratch worktree, run at HEAD and with each surviving mutant | 3 green at HEAD; each mutant turns exactly its own test red and the other two stay green |
| Review 1's finding 3 tests | mutants: no `encodeURIComponent` on the group name, frames split on chunks, one frame end per chunk, a non-JSON frame going offline, `commandsOut -= 1` dropped, `windowEnd = Infinity` | each red on its test: Chorus #2; split frame; two frames in one write; non-JSON frame; 9 red including the rewritten no-frame test |
| Review 1's repro at HEAD | `repro/review-1-pause-by-hand.test.ts` copied into `test/` of the scratch worktree | findings 1 and 2 and their controls green; both finding 4 tests still red (`expected 1 to be +0`), as the deferred LOW finding 4 predicts |
| Adapter test timing under load | `test/propresenter-adapter.test.ts` 5 times beside a full `vitest run`; the finder ran it 20 more times beside CPU hogs | 25 of 25 green |
| Real ProPresenter | not run: the acceptance run is #134, by hand at home | not run |

**Overall:** The three review 1 fixes hold. The code does what each brief asked, every full check is green, and the review 1 repro now passes for findings 1 and 2. What is left is in the tests: two of the branches the finding 1 fix added can be deleted with the suite green, and one of them carries the most likely order on a Sunday, a warm End trigger with a cold next song (finding 1). The finding 2 guard is in the same state, though it only protects the offline reason on the row (finding 2). Add the tests for finding 1 before the PR. The rest can ship as follow-ups.

## Approach decisions
Carried forward from review 1 and its remediation, unchanged:
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it. While the mark is set, a frame outside the expected slides that no button brought leaves them.
- Requests and going offline: a request belongs to the connection it was sent on, an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline. A multi-request read (`readPicked`) that the abort cuts off keeps the last read. Precedent: the stream's own `abort` and `streams` counter in `openStream`.
- Adapter-level behaviour that the fake ProPresenter cannot stage (triggers or reads answered late, two triggers out at once) goes in `test/propresenter-adapter.test.ts`, which drives the adapter against its own small HTTP ProPresenter. Behaviour the fake can stage stays in `test/propresenter.test.ts`.

Added by this review:
- The adapter rig grows per-path answers: a delay per request path, a status per request path, and a record of the problem lines. That is additive, and the review 2 repro is the precedent. Findings 1 and 2 add tests only, so no production mechanism changes.

## Confirmed Issues

### 1. Two branches of the two-triggers fix have no test that can go red, and one is the likely Sunday order — MEDIUM
- **Location:** `src/server/propresenter.ts:518` (`if (cueOut === out) cueOut = null;` in `cue`) and `:455` (`if (cueOut !== null && brought < 0) return;` in `decide`); tests in `test/propresenter-adapter.test.ts:135-156`
- **Attribution:** introduced by `5979e5c` (setlist-controller#84 pre-PR review 1 finding 1), which added both branches and the adapter test. Neither existed at `4c8a13e` or at `6aec698`.
- **Real-world trigger:** none for users today, since the code is right now (the repro passes at HEAD). A later change that breaks either branch ships green. The first branch carries the most likely order of review 1 finding 1: a song's End trigger goes to the presentation ProPresenter already has up, so it answers fast, while the next song's trigger is cold and can take seconds. The End frame then comes after End's answer and before the second answer. MEDIUM, as review 1 rated finding 3 and per the tautology audit: a claim of coverage, by a test named for exactly this case, that the branch does not have.

**Evidence**
```ts
    if (cueOut !== null && brought < 0) return;
    expected = groupShowing(triggeredIn, current) ?? expected;
...
      void command(triggered.path).then(() => {
        if (cueOut === out) cueOut = null;
      });
```
The adapter's two-triggers test delays both triggers by the same 300 ms and sends the End frame before either answers, so it never reaches the order where End is answered first. No test presses a button while a trigger is out.

**Failure mode:** with `cueOut = null` in place of the identity check, End's fast answer clears the mark that belongs to the next song's cue. End's frame, arriving after that, takes over the expected slides, and the next song's late frame pauses ProPresenter: the bug review 1 finding 1 fixed comes back, with all 72 tests green. With `cueOut !== null` in place of `cueOut !== null && brought < 0`, a Next slide pressed while a trigger is out no longer moves the expected slides to the slide it brought, so a later frame of that group outside every window pauses ProPresenter. Proved: `repro/review-2-remediation-branches.test.ts`, "finding 1a" and "finding 1b", green at HEAD; 1a red on the first mutant (1 pause), 1b red on the second (1 extra pause); each stays green on the other mutant.

**Recommended fix:** in `test/propresenter-adapter.test.ts`, give the rig a delay per request path (`setDelayFor((path) => number | undefined)`, consulted before the existing `triggerDelay` and `presentationDelay`), then add the two tests of the repro as they stand:
- End's trigger answered in 50 ms and the next song's in 700 ms, End's frame at 200 ms, the clock moved 1500 ms on after both answers, then the next song's frame: no pause.
- A Verse 1 frame, the clock moved 5000 ms on, the pause count taken, a Chorus cue with its trigger answered in 700 ms and Next slide answered in 50 ms, the frame Next brings (`a2`) at 150 ms, both answered, the clock moved 5000 ms on, then a Verse 1 frame: the pause count unchanged.

**Remediation brief**
- **Design intent:** each cue sets the expected slides to the group it triggers. While the latest cue's trigger is unanswered (`cueOut` set), a frame outside its group that no button brought belongs to an earlier command and leaves the expected slides as they are. The mark belongs to one cue: only that cue's answer clears it, so an earlier trigger's answer never clears a later cue's mark. A frame a button brought is the button's own and still moves the expected slides, mark or not.
- **Full surface:** `test/propresenter-adapter.test.ts` (rig `startRig` at :51-133, its `send` delay at :70-74, and two new `it` blocks after :156). No production change.
- **Must preserve:** the four adapter tests as written, and `test/propresenter.test.ts` (68 tests). The rig's existing `delayTriggers` and `delayPresentations` keep working, since the per-path delay applies only when it gives a number.
- **Do not touch:** `src/server/propresenter.ts`; it is right here. The declared residual of review 1 finding 1 (a later trigger answered before the earlier trigger's frame) stays declared, so do not add a test that asserts it.
- **Proof:** `cp docs/reviews/setlist-controller-84/repro/review-2-remediation-branches.test.ts test/ && pnpm exec vitest run test/review-2-remediation-branches.test.ts -t "finding 1"`, green at HEAD. Then, in a scratch worktree, replace `if (cueOut === out) cueOut = null;` with `cueOut = null;` and see the new first test go red; restore, replace `if (cueOut !== null && brought < 0) return;` with `if (cueOut !== null) return;` and see the new second test go red. Delete the copy from `test/` afterwards.

### 2. The guard that keeps an aborted request from going offline a second time has no test, and its comment gives it the wrong job — LOW
- **Location:** `src/server/propresenter.ts:304` (`if (!given.aborted) goOffline(error);` in `request`), its comment at `:288-290`, and `test/propresenter-adapter.test.ts:158-176`
- **Attribution:** introduced by `c0b59d0` (setlist-controller#84 pre-PR review 1 finding 2).
- **Real-world trigger:** none today; the guard is right. If it is removed, a cue's trigger out when the stream drops goes offline a second time once its abort lands, and the row's problem changes from "ProPresenter could not be reached at <host>: the status stream dropped." to "...: This operation was aborted.", so the producer reads the wrong reason. LOW: a confusing display, and only after a regression the suite cannot see (conformance rule 4, a test for every fallback path).

**Evidence**
```ts
  // after a connection failure or a timeout, which put ProPresenter offline, or once going offline
  // aborts it, which puts no later connection offline.
...
    } catch (error) {
      if (!given.aborted) goOffline(error);
      return null;
```
The abort's rejection reaches this catch while ProPresenter is still offline, long before any reconnect, so the guard never decides whether a later connection goes offline: `connection.abort()` in `goOffline` does that, and its mutant is killed. What the guard prevents is a second `goOffline` while already offline, which re-reports offline and overwrites the problem with the abort's message.

**Failure mode:** with the guard removed, a trigger delayed 5 s, then a stream drop: statuses `online, offline, offline`, and the last problem "ProPresenter could not be reached at 127.0.0.1:<port>: This operation was aborted." Proved: `repro/review-2-remediation-branches.test.ts`, "finding 2", green at HEAD and red on that mutant.

**Recommended fix:** give the adapter rig a `problems` record (`problem: (problem) => problems.push(problem)` in the report passed to `target.start`), and add the repro's "finding 2" test: after the drop, the last problem contains "the status stream dropped." and `offline` is reported once. Change the comment at `:288-290` to say what the guard does:
```diff
-  // after a connection failure or a timeout, which put ProPresenter offline, or once going offline
-  // aborts it, which puts no later connection offline.
+  // after a connection failure or a timeout, which put ProPresenter offline, or once going offline
+  // aborts it, which goes offline no second time, so the row keeps the first reason.
```
**Remediation brief**
- **Design intent:** going offline aborts every request of the connection it was sent on (`connection.abort()` in `goOffline`), which is what keeps a stale request from putting a later connection offline. An aborted request resolves null and does nothing else: the offline it belongs to has already been reported, with its own reason.
- **Full surface:** `test/propresenter-adapter.test.ts` (the rig's report at :95-102 and one new `it` block); `src/server/propresenter.ts:288-290` (comment only).
- **Must preserve:** the stale-request test at :158-176, including its last step, where a trigger that times out on the new connection still goes offline. `goOffline`'s early return after stop.
- **Do not touch:** the guard itself, and `connection.abort()` in `goOffline`.
- **Proof:** `cp docs/reviews/setlist-controller-84/repro/review-2-remediation-branches.test.ts test/ && pnpm exec vitest run test/review-2-remediation-branches.test.ts -t "finding 2"`, green at HEAD; in a scratch worktree, replace `if (!given.aborted) goOffline(error);` with `goOffline(error);` and see the new test go red.

### 3. The adapter test writes fixed-name state files into the worktree's dist folder and never removes them — LOW
- **Location:** `test/propresenter-adapter.test.ts:85-88`
- **Attribution:** introduced by `5979e5c`, which added the file.
- **Real-world trigger:** every run leaves `dist/propresenter-adapter/{two-triggers,one-trigger,stale-request,aborted-read}.json` behind (the worktree holds them now). `dist/` is gitignored, so nothing lands in a commit. LOW: tidiness and the in-repo precedent rule; two runs in one worktree at once would share the file names, which the lanes, one worktree each, do not do.

**Evidence**
```ts
  const folder = join(import.meta.dirname, '..', 'dist', 'propresenter-adapter');
  mkdirSync(folder, { recursive: true });
  const statePath = join(folder, `${label}.json`);
  rmSync(statePath, { force: true });
```
**Recommended fix:** follow `test/propresenter.test.ts:23-42`: make a folder per rig with `mkdtemp(join(REPO_ROOT, 'dist/propresenter-'))` (or `mkdtempSync` with the same prefix), put the picks file in it, and remove it with `rm(folder, { recursive: true, force: true })` in the rig's `close()`. Drop the `label` parameter once nothing uses it.
**Remediation brief**
- **Design intent:** every test in this repo writes only inside the worktree, in a folder of its own, and removes it after (the guardrail "never write outside the worktree" plus the `newFolder` precedent).
- **Full surface:** `test/propresenter-adapter.test.ts:1` (imports), `:51` (`startRig` signature), `:85-88`, `:127-131` (`close`), and the four `startRig('<label>')` calls.
- **Must preserve:** the picks file is new and empty for each test, so the rig's `pick` and `check` read a fresh store.
- **Proof:** `pnpm exec vitest run test/propresenter-adapter.test.ts`, then `ls dist/ | grep propresenter` shows no folder left by it.

### 4. Comment hygiene — LOW (aggregated)
- `src/server/propresenter.ts:59-61` — "While the last cue's trigger is still out, a frame that leaves them is an earlier command's and leaves them as they are" → "While the last cue's trigger is still out, a frame that leaves them, unless a button press brought it, is an earlier command's and leaves them as they are" (the `decide` comment at `:437-438` already names the button exception).
- `src/server/propresenter.ts:222-223` — "The expected slides of the cue whose trigger is still out are kept too, until it is answered." → "The expected slides of the cue whose trigger is still out mark it, until its answer, which clears the mark only while no later cue has replaced it." (`cueOut` is read only as a flag and an identity, never as a set of slides).
- `src/server/propresenter.ts:331-333` — "A read that fails leaves that presentation out; a playlist that cannot be read leaves none. One that going offline cuts off keeps the last read." → "A presentation answered with an error is left out, and a playlist answered with an error leaves none. A read that times out or fails to connect goes offline, and a read that going offline cuts off keeps the last read." (a failed presentation read puts ProPresenter offline itself, so `given.aborted` keeps the last read; only a non-200 answer leaves a presentation out).

## Needs Further Investigation

### A. A Next slide pressed while a cue's trigger is out, whose frame the press did not predict, no longer moves the expected slides
`cue` leaves `showing` on the slide before the trigger (review 1 finding 4, deferred), so a Next press made while the trigger is out predicts from the old slide. If the cued group has one slide and Next crosses into the next group, the frame matches no press (`brought < 0`), and while `cueOut` is set it leaves the expected slides on the cued group; before `5979e5c` it moved them. A Go To Next frame in the next group outside every window would then pause. Reasoned from the code, not run. Confirm with a variant of the repro's "finding 1b": cue Tag (one slide, `t1`), press Next while the trigger is out, send `e1`, then after the windows send `e2`. Review 1 finding 4's recommended fix (a cue sets `showing` to the triggered group) makes the prediction right and closes this too, so it belongs with that LOW when Nick triages it.

## Reviewed and Dismissed
- Requests sent while offline outliving a reconnect — `connections.ts` hands an offline target no cue, check, button or pick (`:30`, `:160`, `:301`, `:307`, `:315`), and the poll asks one `/version` at a time, so nothing is out on the offline connection when the reconnect comes.
- `goOffline` running again on each failed poll while offline — it aborts a connection with only the finished poll on it; the reason is logged once (`logged`).
- `stop()` with a trigger out — `stopping` aborts the request, `command` settles, and the `.then` clears `cueOut`; `goOffline` returns early after stop.
- A trigger answered 403, 404 or 500 — `command` resolves and the `.then` clears `cueOut` as for a 2xx.
- A cue with no trigger (`triggerFor` gives none) — returns before touching `expected` or `cueOut`.
- `check()` racing an offline — `runCheck` drops an answer once the target is offline (`connections.ts:163`), and a fresh check runs on the reconnect.
- A dropped or silent stream now aborts triggers, buttons and reads still out, where before they ran to their answer — a dropped stream is offline by the spec, and the reconnect's stream sends no `status/slide` on open, so no false pause follows. An aborted press loses its "nothing to move" line, which the row clears on offline anyway.
- The fake's `renameGroup` and `sendRaw` — correct, and the tests that use them go red on their mutants.

## Minor / nits
- `test/propresenter-adapter.test.ts:135-146`: the two-triggers test relies on the End frame landing before both 300 ms answers. Under load a late frame would hit the declared residual (a false red), and a late answer would put the next song's frame inside its window (a vacuous green). Not seen in 25 runs under load.
- `test/propresenter-adapter.test.ts:148-156`: "never pauses on the next song's first trigger alone" passes with the fix removed; it is the finding's control and pins nothing of the fix by itself.
- `test/propresenter-adapter.test.ts:158`: the stale-request test leaves the rig's 5 s server-side answer timer pending after `close()`; nothing fails, and the file takes about 6 s.
- `src/server/propresenter.ts:455`, pre-existing: End and the next song in one move with the next song's trigger answered 404, then a later End frame, pauses ProPresenter at HEAD and with the fix removed alike. It is review 1's Minor "a trigger answered 403, 404 or 500 still leaves its group as the expected slides" seen from another side.

## Test quality
Tests added in the delta: 8 (4 in `test/propresenter-adapter.test.ts`; 3 stream-parsing tests and the Chorus #2 test in `test/propresenter.test.ts`), plus 1 rewritten (the no-frame test). Against `4c8a13e`: 2 red (the two-triggers and stale-request adapter tests, review 1 findings 1 and 2's proofs); green, all as expected: the 3 stream tests, Chorus #2 and the rewritten test (finding 3 guards code that was already right, so mutation is their oracle, and each goes red on its mutant), the read-cut-off test (its oracle is `c0b59d0`, the regression it proves; it goes red on removing `|| given.aborted`), and the control. Tautology shapes: none. Mutation: 12 mutants, 9 killed; the 3 survivors are findings 1 and 2, and `repro/review-2-remediation-branches.test.ts` kills each.

## Prior-review closure
| Review 1 finding | Status | Evidence |
| --- | --- | --- |
| 1 (MEDIUM) two triggers in one move | fixed in the code; its test covers one of the two orders | review 1 repro "finding 1" green at HEAD; the adapter test is red at `4c8a13e` and on the mutant that drops the early return. The identity check and the button exemption are untested: this review's finding 1 |
| 2 (MEDIUM) stale request after a reconnect | fixed | review 1 repro "finding 2" green; the adapter test is red at `4c8a13e` and on the mutant without `connection.abort()`; the rework's read test red without `|| given.aborted`. The `!given.aborted` guard is untested: this review's finding 2 (LOW) |
| 3 (MEDIUM) three adapter behaviours with no test that can go red | fixed | every named mutant is red on its new test (table above) |
| 4 (LOW) Next slide after a reconnect or a no-frame trigger | untouched, deferred by decision (review 1 remediation scope: "The LOW findings 4 to 8 are deferred on purpose") | both review 1 repro "finding 4" tests still red at HEAD |
| 5 (LOW) a press before any cue | untouched, deferred by decision | not re-run; no delta in `slidesBrought` or `runButton` |
| 6 (LOW) picks store and page fallbacks untested | untouched, deferred by decision | no delta in those files |
| 7 (LOW) Playlist select enabled with no set | untouched, deferred by decision | no delta in those files |
| 8 (LOW) comment hygiene | untouched, deferred by decision | the three entries still read as review 1 quotes |

Fully fixed: 3 of 3 MEDIUM. Partially fixed: none in the code; findings 1 and 2's tests leave a branch each unguarded, reported here as new findings. Resolved by a comment or doc edit alone: none. Review 1's Known regressions list is empty.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` green at `5fc7f89` (one unnamed flake on a loaded first run, green alone); `pnpm test:e2e` green locally.
- **Commit hygiene:** commit this doc and `repro/review-2-remediation-branches.test.ts`. The repro is not under `test/`, so `pnpm test` does not run it; it passes `pnpm lint`.
- **Likely reviewer asks:** the acceptance run on the real ProPresenter (#134), which settles the 1000 ms window and the cold-frame timings review 1 findings 4 and 5 depend on.

## Verdict
Ready with follow-ups after the gate. Gate before the PR: finding 1 (MEDIUM), tests only, no production change. Findings 2 to 4 (LOW) can ship as follow-ups, though 2 and 3 sit in the same test file as finding 1 and are cheap to take in the same pass. Review 1's three MEDIUM findings are all fixed in the code, none was resolved by a comment alone, and the five deferred LOWs stay open by decision. The confirmed list shrank from 8 to 4 and moved from behaviour to test coverage and comments, which is the expected shape for a second round: the remediation held, and no subsystem needs a split ticket, since nothing here asks for another rewrite of the pause by hand.

## Remediation — 2026-10-24
Scope: CRITICAL, HIGH and MEDIUM, which in this round is finding 1 alone. The LOW findings 2 to 4 are deferred on purpose and left unfixed for Nick to triage (eng-pipeline#34). Needs Further Investigation A was not worked; it belongs with review 1's deferred LOW finding 4.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `b5a54d7` setlist-controller#84 pre-PR review 2 finding 1: the identity check and the button exemption of the two-triggers fix had no test that could go red, so End answered before the next song's trigger could bring the false pause back with the suite green | mutation, in a scratch worktree at `b5a54d7`, each mutant alone against `pnpm exec vitest run test/propresenter-adapter.test.ts test/propresenter.test.ts` (74 tests). `if (cueOut === out) cueOut = null;` as `cueOut = null;`: 1 red, the new "never pauses when a song's End trigger is answered fast and the next song's slow, and the End frame comes between the two answers" (`expected 1 to be +0`). `if (cueOut !== null && brought < 0) return;` as `if (cueOut !== null) return;`: 1 red, the new "moves the expected slides to the slide a Next slide press brings while a trigger is out" (`expected 2 to be 1`). Each test stays green on the other mutant; 74 green at `b5a54d7` | 0 | proved by execution (tests only, no production change) |

The two tests are the repro's "finding 1a" and "finding 1b" with one difference: the adapter test's fixture keeps End as one slide (`e1`), so the End frame is sent as `e1` with no next slide, where the repro's fixture gave End a second slide. The fixture is unchanged so the four existing tests run as written. The rig's per-path delay (`setDelayFor`) is consulted before `delayTriggers` and `delayPresentations`, which apply whenever it gives no number.

Full checks at `b5a54d7`: `pnpm lint` clean, `pnpm typecheck` pass, `pnpm test` 69 files with 1662 passed and 4 skipped. `pnpm build` and `pnpm test:e2e` were not re-run, since the round changed one test file and no production code.

### Known regressions, deferred
- None. The round changed no production code.

### Rework briefs
- None. No verify agent ran, so no rework.

## Approach decisions (remediation round 2)
- Tests for the two-triggers fix's branches: the adapter rig in `test/propresenter-adapter.test.ts` grows a delay per request path, additive to its existing trigger and presentation delays, and the branches are pinned there because the fake ProPresenter cannot answer two triggers at different speeds. Precedent: this review's `repro/review-2-remediation-branches.test.ts` rig and review 1's adapter-test decision.
