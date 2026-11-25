# Pre-PR review: setlist-controller#205 Flaky tests (the e2e rig's bounded close, #104)

**Branch:** `setlist-controller-205-flaky-tests` vs `origin/main` (merge-base `1d7b38f` "Merge pull request #206 from nick-vogel/setlist-controller-115-cue-lead-time")
**Reviewed at:** HEAD `675b8ff` (setlist-controller#104 The e2e rig's close can hang past the test timeout and fail a passing Stop test, the merge of the lane commit `b44ad00` of the same subject), clean tree: 0 files with uncommitted changes, 0 untracked; 4 files total, +139 / -11 against the merge-base
**Reviewed against:** the epic body of setlist-controller#205 (a running log of flakes; end state: the full suite passes on every run under the load of two lanes), the body and acceptance criteria of its one sub-issue #104, and the six assumptions the run recorded for #104. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules (load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape) are the conformance checklist. The 11 LOW findings the ticket's own review pass left (F1.1 to F1.11 in the run's ticket review) are known and are not repeated as numbered findings here; the "Ticket review LOWs" section records what this review's executions showed about each. Round 1, `--fresh`.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass (base oracle, two mutants, a timing harness over the full suite, and the e2e acceptance runs by the orchestrator)

This is the first review of the integrated epic branch. #104 was reviewed once in its lane and converged with 11 LOWs.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` (load average 6.7 to 14.7 at start) | 58 files, 1183 passed, 4 skipped (the Linux-only setup-screen cases, as on main) |
| Build and Playwright (AC3) | `pnpm test:e2e` (load 11.2) | build green, 44 passed, no retries |
| AC1 | `pnpm exec playwright test e2e/stop.spec.ts --repeat-each=20` after the build (load 8.3) | 80 of 80 passed, no `afterEach` timeout |
| New tests against `$BASE` | scratch worktree at `1d7b38f`, `test/rig-close.test.ts` copied in, `vitest run test/rig-close.test.ts` | both red: the partial-request test hit Vitest's 5000ms test timeout; the stuck-target test hit the 5000ms test timeout and then the 10000ms hook timeout in `afterEach` |
| Mutant: `http.closeAllConnections()` deleted from `src/server/server.ts:259` | scratch worktree at HEAD, `vitest run test/rig-close.test.ts` | the partial-request test red: "The rig's close waited 3000ms for the server to close; it is still open." |
| Mutant: `closeInOrder` stops at the first step still open (`break` after the push at `test/harness.ts:212`) | same | the stuck-target test red: `bind EADDRINUSE` on the fake Live's port, so the port check is load-bearing |
| Mutant (finder): the partial-request test's 50ms wait removed, plus the server fix removed | finder's scratch copy | still red at about 3019ms: `server.close()` awaits the targets, the log, the hub and the bridge before `http.close()`, so the request bytes have arrived by then |
| Healthy close time under the new 3000ms budget | scratch worktree at HEAD with `closeInOrder` logging its elapsed time, full `vitest run` (load 15.8 to 21.3) | 415 rig closes logged across the suite. Every one but the deliberate stuck-target case took under 50ms; the slowest was 8.7ms (`test/cue-lateness.test.ts`). The suite passed, 1183 tests |
| Stress (finder) | 20 concurrent runs of `test/rig-close.test.ts` at load about 11, then 24 more under 28 CPU-burning loops at load about 34 | 44 of 44 passed |
| `closeInOrder` edge cases (finder) | direct import of HEAD's `test/harness.ts` with synthetic steps | a synchronous throw rejects with its own error; a step that rejects after its time ran out raises no `unhandledRejection`; an error followed by an open step gives the open message with `cause` set to the error; three hanging steps at a 1000ms budget took 1402ms, so the real bound is the budget plus 200ms for each later step; a slow-but-closing 2700ms step followed by a hang reports "waited 3000ms" for the hang |
| Node's `server.close()` and `closeAllConnections()` | nodejs.org/api/http.html, fetched (web docs, rung 3, the Node runtime is v26.3.0) | `close()` "closes all connections connected to this server which are not sending a request or waiting for a response"; `closeAllConnections()` closes active ones too, does not destroy upgraded WebSocket sockets, and is recommended to be called after `close()` to avoid a race. The branch's order matches the docs' own example |
| Not run | a real Live, a real ATEM; load average 40 to 100 | the guardrails forbid Live; the highest load reached was about 34, below the 41 to 103 the #205 body logged |

**Overall:** The branch does what #104 asked. A rig's close now ends in bounded time (3000ms plus a 200ms grace per later step), names each step still open, and still closes every step after a hung one; the server's close drops connections still mid-request, which Node's `close()` alone waits on. Both new tests are red at base and each is killed by a one-line mutant, so they guard what they name. A healthy close takes single-digit milliseconds under load 15 to 21, so the new budget does not turn a slow close elsewhere in the 25 other test files that start a rig into a red. The one confirmed finding is LOW comment hygiene. The branch can open its PR as is.

## Approach decisions
- Dropping HTTP connections at shutdown: `http.close(callback)` then `http.closeAllConnections()` at once, after the hub has terminated every WebSocket. Precedent: the example under `server.closeAllConnections()` in Node's http docs, which calls it right after `server.close()`. Recorded as assumption 1 of #104.
- The rig's close: one shared deadline (`CLOSE_TIMEOUT_MS = 3000`), every later step still closed with a 200ms grace, one rejection naming each step still open. Recorded as assumptions 2, 3 and 6 of #104.
- The proxied rig's close: `2 * CLOSE_TIMEOUT_MS` around the proxy and the rig, so the rig's own message comes through when the proxy closes promptly. Recorded as assumption 5 of #104; the slow-proxy edge is the ticket's F1.6, confirmed by execution below.

## Confirmed Issues
### 1. Comment hygiene — LOW (aggregated)
- `src/server/server.ts:255-257` — "close() waits on a connection still mid-request until Node's own headersTimeout, so every connection is dropped too, right after close() so no new one gets in between. The hub has already ended every socket, so nothing still needs one." → "close() drops only idle connections and waits on one still sending a request or waiting for a response, a half-sent request until Node's headersTimeout. So every connection is dropped too, right after close() so no new one gets in between. The hub has already ended every socket, so nothing still needs one." (Node's docs: `close()` leaves open any connection "sending a request or waiting for a response", not only one mid-headers.)
- `test/harness.ts:180-182` — "The whole budget for a rig's close. Under Vitest's 5000ms test timeout and far under Playwright's 30s, so a close that cannot finish fails with what is still open, not with the test timeout. A healthy close takes milliseconds." → "The budget for a rig's close; each step after the one that runs it out gets 200ms more. With that grace it stays under Vitest's 5000ms test timeout (a close in an afterEach gets the 10000ms hook timeout) and far under Playwright's 30s, so a close that cannot finish fails with what is still open, not with the test timeout. A healthy close takes milliseconds." (Executed: three hanging steps at a 1000ms budget took 1402ms; the base oracle run shows the 10000ms hook timeout. A maintainer who reads "the whole budget" could raise the constant toward 5000ms and push the stuck-target test past Vitest's test timeout.)

## Needs Further Investigation
### A. The stuck-target test's margin at load 40 to 100 — what would confirm or kill it
`test/rig-close.test.ts:52` waits out the full 3000ms by design, inside Vitest's default 5000ms with no explicit timeout (the ticket's F1.1). It passed 44 of 44 concurrent runs at load up to about 34, and a rig's startup and healthy close take milliseconds, so the 1800ms of slack looks ample, but the #205 body logged flakes at load 41 to 103. Confirm by running `pnpm exec vitest run test/rig-close.test.ts` in a loop while two full `pnpm test` runs go at once and `uptime` reads above 40; one 5000ms timeout confirms it. The fix, if confirmed, is the repo's own precedent for a slow test, an explicit timeout as `test/contract.test.ts:75` does (`}, 10_000);`).

## Ticket review LOWs (F1.1 to F1.11), as this review found them
- F1.1 (stuck-target test's timeout margin): not reproduced at load up to 34; carried as Needs Further Investigation A.
- F1.2 (a hung server step leaves the server's listener and sockets open): holds by reading `src/server/server.ts:245-260`; out of scope with the unbounded `connections.stop()`, which is proposal 1 of the run.
- F1.3 (the hang never reproduced): holds. This review's AC1 run passed 80 of 80 too, so AC1 cannot show which change, if either, removed the original hang; the named-step close is what makes a recurrence diagnosable.
- F1.4 (step granularity of the message): holds; approved by the plan.
- F1.5 (the message reports the whole budget, not the step's real wait): confirmed by execution, a 2700ms step that closes followed by a hang reports "waited 3000ms" for the hang. The named step is still the right one.
- F1.6 (the proxied rig's comment holds only when the proxy closes promptly): confirmed by execution, a 3000ms proxy close then a rig whose server never closes gave "The rig's close waited 6000ms for the rig to close" at 6001ms. `test/proxy.ts` `close()` destroys every pair before it closes the listener, so a slow proxy close is unlikely.
- F1.7 (only the first error surfaces): confirmed by the finder's probe; approved by assumption 6.
- F1.8, F1.9: unchanged, style only.
- F1.10 (the 50ms sleep could leave the connection idle): weakened; the test stays red without the sleep when the server fix is removed, because the server's close awaits four other closes before `http.close()`.
- F1.11 (the stuck-target test does not await the resumed server close): holds by reading `test/rig-close.test.ts:62-64`. Also, if `connectViewer()` rejects, `release()` never runs and the server stays open for the rest of the worker.

## Reviewed and Dismissed
- The 3000ms budget turns a slow but healthy close in any of the 25 other test files that start a rig into a red — measured: 415 closes across the full suite at load 15 to 21, the slowest 8.7ms.
- `closeAllConnections()` cuts an in-flight response at production SIGTERM (`src/server/main.ts:97`) — recorded decision; the process exits right after, and before this change a stalled connection held shutdown for up to Node's request timeouts.
- A new connection slips in between `close()` and `closeAllConnections()` — `close()` stops listening synchronously and the call follows at once, the order Node's docs recommend. Do not move `closeAllConnections()` before `close()`.
- `closeAllConnections()` and the WebSockets — Node's docs say it does not destroy upgraded sockets, and `hub.close()` (`src/server/hub.ts:85-89`) terminates every one first.
- A step that rejects after its time ran out goes unhandled — the `.then(..., (error) => ({ error }))` at `test/harness.ts:202-207` catches it; the finder's probe saw no `unhandledRejection`.
- A step that throws synchronously escapes `closeInOrder` — `Promise.resolve().then(step.close)` turns it into a rejection; probe confirmed.
- A timer left behind after a close — `clearTimeout(timer)` runs after every race.
- The partial-request test passes without the server fix — killed by the `closeAllConnections` mutant, with and without its 50ms wait.
- The stuck-target test's port check is decorative — killed by the stop-at-first-open mutant with `EADDRINUSE`.
- Spreading `fakeTarget()` with a stuck `stop` misses the real stop path — `connections.stop()` awaits each target's `stop()`, so the stuck promise does hold the server's close.
- `rig-close.test.ts`'s `afterEach` clears `rig` in the test body before asserting — intended, so a close the test expects to fail is not closed twice. Do not "fix" it.

## Minor / nits
- A spec's `afterEach` (`await e2e?.close(); e2e = undefined;`, and the same shape in `test/*.test.ts`) leaves the reference set when close rejects, which it now can on a timeout. The next test reassigns it on its first line, so only a test that fails before that line closes the old rig a second time. Pre-existing pattern, newly reachable.
- `closeInOrder` rejects with `undefined` when a step rejects with `undefined`. No current step can.

## Test quality
Tests added: 2 (`test/rig-close.test.ts`) · green against `$BASE`: 0 (both red, each on Vitest's test timeout) · tautology shapes found: 0. Neither test mocks the unit under test, computes its own expectation, or asserts only calls: the partial-request test drives a real raw TCP socket against the real server and asserts the close's outcome and time; the stuck-target test asserts the exact message and proves the fake Live's port is free by binding it. Each is killed by a one-line mutant of the code it names. Strengthening worth considering is NFI A (an explicit timeout) and F1.11 (await the resumed close).

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and the build green at `675b8ff`; CI runs the first four. `pnpm test:e2e` green locally (it never runs in CI).
- **Commit hygiene:** two commits, the lane commit and its merge. Nothing to drop. This doc is the only addition.
- **Likely reviewer asks:** that `closeAllConnections()` also changes production shutdown on SIGTERM (name it in the PR body); that the original hang never reproduced, so the PR adds a bounded, named failure rather than proving a root-cause fix (F1.3); the unbounded `connections.stop()` follow-up (proposal 1 of the run); and the #205 body's set-builder 5000ms load timeouts, which have no ticket yet.

## Verdict
Ready to open the PR as is. No finding gates it: the one confirmed finding is LOW comment hygiene, which can ride along or follow. Follow-ups: the run's proposal for the unbounded `connections.stop()` at SIGTERM, NFI A if a high-load run times the stuck-target test out, and a ticket for the set-builder load timeouts the #205 body logs.
