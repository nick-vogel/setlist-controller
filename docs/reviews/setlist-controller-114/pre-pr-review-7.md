# Pre-PR review: setlist-controller#114 run 4, setlist-controller#193 (a restart of the ATEM's socket process that fails outright)

**Branch:** `setlist-controller-114-atem-lobby-feed` vs `origin/main` (merge-base `0ffec22` "Merge pull request #194 from nick-vogel/setlist-controller-114-atem-lobby-feed")
**Reviewed at:** HEAD `db46575` (setlist-controller#193 A restart of the ATEM's socket process that fails outright leaves it offline, with no reason and no retry), clean tree: 0 files with uncommitted changes, 0 untracked; 6 files total, +567 / -72 against the merge-base.
**Delta under review:** none. Run with `--fresh`: everything since the merge-base, which is the #193 work only (`fc708ae` the fix, `f31efc6` its review pass 1 finding 1, `db46575` the closing commit). Reviews 1 to 6 covered branch states that #194 has since merged to `main`.
**Reviewed against:** setlist-controller#193 (its acceptance criteria), the epic setlist-controller#114, the Approach decisions of pre-PR review 6. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | clean |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration suites | `pnpm test` | green: 54 files, 1149 passed, 4 skipped |
| Build | `pnpm build` | green |
| End-to-end | `pnpm test:e2e` (WebKit, OS-assigned ports) | green: 44 passed |
| Down window in threadedclass | read `node_modules/.pnpm/threadedclass@1.4.1/node_modules/threadedclass/dist/parent-process/manager.js:668-722, 750-765, 865-886` | crash: worker `error` before `thread_closed`; freeze: `thread_closed` from the kill's `close` before the restart; give-up: `error` (:710) then `killChild(..., true)` (:713), which clears the proxy's listeners. Holds, with the open cases in NFI B and C |
| `close()` while the Atem is lost | executed repro `repro/review-7-close-while-lost.test.ts`, at HEAD and (adapted, no give-up to wait for) at `0ffec22` | rejects at both: finding 1, pre-existing |
| Log lines per failed restart | executed repro `repro/review-7-one-log-line.test.ts` at HEAD | two lines, the second from the lost Atem's destroy rejecting "Child instance ... is not initialized": finding 2 |
| Recommended fixes 1 and 2 together | applied in a scratch worktree at HEAD, then `pnpm typecheck` and `pnpm exec vitest run test/atem-switcher.test.ts test/atem-switcher-restart.test.ts test/atem.test.ts test/atem-switcher-signals.test.ts` plus both repros | typecheck green; both repros green; both child-process restart tests green (the lost socket process is gone with no destroy from the client); red only on the two unit tests that pin the dropped destroy, as finding 2's brief says |
| Tautology audit | branch tests copied onto `0ffec22`, run there | 26 new or modified tests: 23 red, 3 green (see Test quality) |
| Mutation check | 7 mutants of `src/server/atem-switcher.ts` in a scratch worktree | all 7 killed (see Test quality) |
| Real ATEM | not run | no ATEM on this Mac; acceptance on the church's unit is #145 |

**Overall:** #193's mechanism holds. A failed restart gives up with its reason, the adapter connects again on a fresh `Atem` after 5000 ms, a crash threadedclass heals is only logged, and every acceptance criterion is met and pinned against the installed library. Two LOW defects sit on the lost-`Atem` path: a server stop in the 5000 ms before the next connect rejects and cuts the server's shutdown short (pre-existing, and narrowed by this branch), and every real failed restart logs a second error line from a destroy that can never succeed. Both are one-line fixes in code this branch rewrote. Ready to open the PR, best with findings 1 and 2 folded in first.

## Approach decisions
- Signal handling with the ATEM library (review 1 finding 1): unchanged.
- Fake switcher failure modes (review 2): extend `test/fake-switcher.ts` with options and methods, never `vi.fn` mocks of the switcher client. #193 added `restartFailsOutright`, sharing `respawnFailingReconnect`'s body.
- Own-cut matching (#176), a connect that rejects (#175), coming online with no connect asked (review 3 finding 1), a failed reconnect after a respawn (#184), a connect that resolves (review 5 finding 1), cancelling the pending connect again (review 6 finding 1), the program line (#183): unchanged.
- Hearing a failed restart (#193, `fc708ae`, narrowed in `f31efc6`): `ThreadedClassManager.onEvent` on the private `atem.client.socket._socketProcess`, with `ThreadedClassManager` loaded by `createRequire` from atem-connection's resolved path; only an `error` between the proxy's `thread_closed` and `restarted` is a failed restart, and any other is logged. A lost `Atem`'s later events are ignored, and the next connect builds a fresh one through the `make` factory. Unchanged.
- The lost `Atem`'s clean-up (new, finding 2, overturns #193's "the lost one destroyed at once without waiting"): the client never calls into a lost `Atem` again, `destroy` included. threadedclass's give-up branch kills that socket process with clean-up itself (`manager.js:713`), and the client's destroy always rejected before reaching any clean-up of its own. `close()` on a lost `Atem` resolves at once (finding 1). Precedent: the `live()` gate, which already ignores everything a lost `Atem` emits.

## Confirmed Issues
### 1. A server stop in the five seconds after a failed restart rejects, so the server's shutdown skips closing the lateness log and the rest — LOW
- **Location:** `src/server/atem-switcher.ts:144`
- **Attribution:** pre-existing, untouched in kind. At `0ffec22`, `close: () => atem.destroy()` on the same killed socket process rejects as well (the adapted repro is red there), and for as long as the server runs, since nothing rebuilt the `Atem`. This branch narrows the window to `RETRY_MS` (5000 ms), until the adapter's next connect builds a fresh `Atem`, and it now tracks `current.lost`, which makes the one-line guard possible.
- **Real-world trigger:** the socket process crashes or freezes, its restart fails (a fault on the playback Mac), and Nick stops the server (`launchctl bootout` sends SIGTERM, or Ctrl-C) within the next 5000 ms. Rare: two unlikely events in one window. LOW, capped: no plausible frequent user path, and what is lost is lateness diagnostics, not playback.

**Evidence**
```ts
close: () => current.atem.destroy(),
```
`src/server/atem.ts:228-232` returns it from the adapter's `stop`; `src/server/connections.ts:257` is `await Promise.all(entries.map((entry) => entry.target.stop()))`; `src/server/server.ts:251` is `await connections.stop();`, followed by `await log?.close(); await hub.close(); await live.close();` and the HTTP close.

**Failure mode** — `current` is still the lost `Atem`; its `destroy()` calls the socket's `disconnect()` first (`node_modules/atem-connection/dist/lib/atemSocket.js:43-61`), which rejects at once: `Error: Child process of instance ... has been closed`. `Promise.all` rejects without waiting for the other targets' stops, `server.close()` rejects at `connections.stop()`, and the lateness log's queue (`src/server/lateness-log.ts:72`), the hub, the Live bridge and the HTTP server are never closed before `main.ts:99`'s `.finally(() => process.exit(0))` exits. Lateness lines that the other targets' stops write, and any append still queued, can be lost. Proved by `repro/review-7-close-while-lost.test.ts`: `closed: 'rejected'`.

**Recommended fix**
```diff
-    close: () => current.atem.destroy(),
+    close: () => (current.lost ? Promise.resolve() : current.atem.destroy()),
```
Plus a unit test in `test/atem-switcher.test.ts`, in `describe("the switcher client when the library's socket process cannot restart")` (`:217`): connect, `processes.fails(stub(0).atem, new Error(...))`, then `await client.close()` resolves, with a stub whose `destroy` rejects, and `close` never calls the lost stub's `destroy` a second time.

**Remediation brief**
- **Design intent:** the switcher client holds one current `Atem`. A lost one (its socket process could not restart, and threadedclass killed it) is never used again: its events are ignored by `live()`, and the next `connect` builds a fresh one with `make()`. `close()` must resolve whenever the client has nothing alive to close, so the adapter's `stop`, `connections.stop` and the server's `close` run to the end.
- **Full surface:** `src/server/atem-switcher.ts:144` (`close`); a new test beside `test/atem-switcher.test.ts:553` ("destroys the fresh Atem on close"). Nothing in `src/server/atem.ts`, `connections.ts` or `server.ts` changes: their rejection handling is not in this finding's scope.
- **Must preserve:** `close()` destroys a current, not-lost `Atem` and returns its promise: `test/atem-switcher.test.ts` "destroys on close" and "destroys the fresh Atem on close" (`:553`), and `test/atem-switcher-restart.test.ts` (`{ closed: true }` after the fresh connect, and `threads: 0` after close in the healed test). A `close()` during a connect still destroys the `Atem` that connect uses (`test/atem-switcher-signals.test.ts`).
- **Do not touch:** `Promise.all` in `connections.stop` and the `.finally` exit in `main.ts` (a different target's rejection is outside #193; see Dismissed).
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-114/repro/review-7-close-while-lost.test.ts test/ && pnpm exec vitest run test/review-7-close-while-lost.test.ts` is red now (`closed: 'rejected'`) and must be green after; then delete the copy. The new unit test must be red with the old `close` line.

### 2. Every real failed restart logs a second error line, from a destroy of the lost Atem that can never succeed — LOW
- **Location:** `src/server/atem-switcher.ts:126`
- **Attribution:** introduced, `fc708ae` (`git log -S"could not close the lost connection" 0ffec22..HEAD` names it).
- **Real-world trigger:** every restart of the socket process that fails outright. User path: Nick reading the server log after the ATEM went offline. LOW: log noise, against #193's own decision of one line per fault; no behaviour is wrong.

**Evidence**
```ts
console.error("Setlist server: the ATEM's socket process could not restart", error);
each.lost = true;
giveUp(error instanceof Error ? error.message : String(error));
each.atem.destroy().catch((reason: unknown) => console.error('Setlist server: the ATEM library could not close the lost connection', reason));
```

**Failure mode** — threadedclass emits the give-up's `error` (`manager.js:710`) before it kills the child (`:713`), and the restarted instance never initialized, so the library's `destroy()` rejects in its first step, `disconnect()`, with `Child instance ... is not initialized`. It never reaches `ThreadedClassManager.destroy` or `_exitUnsubscribe` (`atemSocket.js:43-55`). So the destroy cleans nothing up, and each fault logs two error lines with stacks. Proved by `repro/review-7-one-log-line.test.ts`: the logged lines are `the ATEM's socket process could not restart` and `the ATEM library could not close the lost connection`. The comment at `:114-117` ("since a killed process rejects every call at once") describes it wrongly: the process is not killed yet when the error arrives.

**Recommended fix** — drop the destroy of the lost `Atem`, and fix the two comments that describe it:
```diff
       console.error("Setlist server: the ATEM's socket process could not restart", error);
       each.lost = true;
       giveUp(error instanceof Error ? error.message : String(error));
-      each.atem.destroy().catch((reason: unknown) => console.error('Setlist server: the ATEM library could not close the lost connection', reason));
     });
```
- `src/server/atem-switcher.ts:114-117`: "...gives up with the error's message, and destroys the lost Atem without waiting, since a killed process rejects every call at once." → "...and gives up with the error's message. It never calls into the lost Atem again, since threadedclass kills its socket process with clean-up right after the error, and a destroy rejects before it reaches any clean-up."
- `src/server/atem-switcher.ts:19-20`: "it destroys that Atem and builds a fresh one for the next connect" → "it drops that Atem and builds a fresh one for the next connect".
- `test/atem-switcher.test.ts:446`: rename to "...on the next connect, never calls into the lost one again, and ignores the lost one after", and change `expect(stub(0).stub.destroyed).toBe(true)` to `.toBe(false)`.
- `test/atem-switcher.test.ts:518` ("logs a lost Atem whose destroy rejects, and goes on"): delete, declared intended: the behaviour it pins is dropped. Finding 1's new test (close on a lost `Atem` with a rejecting `destroy` resolves) takes its place as the guard that a lost `Atem` is never destroyed.

**Remediation brief**
- **Design intent:** as finding 1. The client hears a failed restart from threadedclass, which then kills the socket process itself with clean-up (`killChild(child, 'timeout when restarting', true)`, `manager.js:713`, clearing the proxy's listeners at `:878-886`). The client marks the `Atem` lost and leaves it; one log line per fault, as #193 decided for the adapter.
- **Full surface:** `src/server/atem-switcher.ts:126` (remove), `:114-117` and `:19-20` (comments), `test/atem-switcher.test.ts:446` (assertion and name), `:518` (delete). Do this together with finding 1, since its `close` guard is what keeps a lost `Atem` from ever being destroyed.
- **Must preserve:** the lost `Atem`'s later events are ignored (`test/atem-switcher.test.ts:446`'s event assertions); the next connect builds a fresh `Atem` (`:446`, mutant c); `test/atem-switcher-restart.test.ts` stays green, and its `threads: 1` after the fresh connect is the proof that the lost socket process is gone with no destroy from the client (verified with this fix applied). If threadedclass's own kill fails, it logs `Could not kill child` itself (`manager.js:714`); the client's destroy could not have helped, since it rejects before any clean-up.
- **Do not touch:** the `down` window in `librarySocketProcessErrors` and the `live()` gate (reviewed, sound).
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-114/repro/review-7-one-log-line.test.ts test/ && pnpm exec vitest run test/review-7-one-log-line.test.ts` is red now (two lines) and must be green after; then delete the copy. `pnpm exec vitest run test/atem-switcher.test.ts test/atem-switcher-restart.test.ts test/atem.test.ts` green.

### 3. Comment hygiene — LOW (aggregated)
- `src/server/atem.ts:98-99` — "again. The library retries an unreachable ATEM" / "every second; a socket process that fails ..." (a ragged short line) → rewrap the paragraph at about 100 columns.
- `test/fake-switcher.ts:17` — one line of about 170 columns ("...listeners the reason, and stays offline until the adapter connects again. The test can make it refuse the cuts it is told, as the library does when the ATEM") → rewrap at about 100 columns.
- `test/atem-switcher.test.ts:80` — "and fails emits a socket process error to it" → "and its fails emits a socket process error to the listeners it recorded for that stub".

## Needs Further Investigation
### A. An error on the socket process during a restart that would succeed
Any `error` between `thread_closed` and `restarted` counts as final, but a restarted worker can emit one of its own (`manager.js:764`, `:791`, `:797`) and still restart. The client would then drop a socket process that comes back, and atem-connection's own `restarted` handler (`atemSocket.js:114`) could reconnect it beside the fresh `Atem`: a leaked worker with a second ATEM session. Confirm by forcing a worker `error` during the restart's init whose retry then succeeds, in a child process as `test/atem-switcher-restart.test.ts` does, and counting live children after the next connect. Kill it if `rejectChildMethods` and the failed restart always end that child.

### B. A freeze whose kill times out
On a ping timeout, `restartChild` kills the child before restarting; if `worker.terminate()` takes longer than `DEFAULT_KILL_TIMEOUT` (1000 ms), `killChild` rejects (`manager.js:865-871`) before `close`, so no `thread_closed` comes, and the give-up's `error` arrives with `down` false: only logged, the #193 symptom again on that path. Confirm by stubbing the child's kill to hang past 1000 ms in a child-process test; kill it if `terminate` of a frozen worker thread is always fast.

### C. A failed restart inside the first connect, before the hook
The hook goes on only after a connect settles; the socket process exists from partway through it. A crash whose restart fails in that window is unheard, and every later connect on the same `Atem` rejects with "has been closed" (the row shows it and retries, but never rebuilds). The window is a UDP bind, so very short. Confirm by killing the worker from inside the first `connect` before it settles; a fix would treat a connect rejection from a proxy no longer in the manager as lost.

### D. Carried from review 6, unchanged by this branch
Whether the ATEM answers a cut to the input already on program; whether any ATEM reports a camera or video input with port type ExternalDirect; whether an exception from a connections callback inside a library event escapes into threadedclass. All need the real unit (#145) or are untouched here.

## Reviewed and Dismissed
- The `down` window is wrong for a crash or a freeze — `manager.js:757-765`: a crash's worker `error` comes before `thread_closed`; a freeze's kill emits `thread_closed` from `close` before the new fork; the healed child-process test proves the crash case against the real library.
- Lost `Atem`s leak listeners in `ThreadedClassManager` — `killChild(..., true)` clears the proxy's listeners when the process closes (`manager.js:878-886`); the finder's repro saw `_children` drop to 0.
- `createRequire` reaches a second copy of threadedclass — the restart test's `threads: 1` after the fresh connect counts children in the same manager the hook used.
- `live()` misses an event of a lost `Atem` (a `connected`, a `stateChanged`, a respawn `error`, a second socket process error) — each is gated, and `test/atem-switcher.test.ts` drives them (mutant e is killed).
- Overlapping connects, or a `close()` during a connect, hook the wrong `Atem` — `if (current.atem === atem) hook()` skips a superseded one; a late hook at shutdown only attaches a dead listener.
- The adapter tests do not check offline and the reason land together — `test/atem.test.ts:833` asserts the snapshot carrying the reason reads offline, with no clock advance.
- The child-process tests can hang the run — `onTestFinished` SIGKILLs the child, each has a 20 s cap, and a never-resolving `gaveUp` empties the child's loop (exit 13).
- `connections.stop`'s `Promise.all` lets one target's rejection cut the others short — true for every target, outside #193; finding 1 removes the ATEM's known rejection. Do not change it under this branch.

## Minor / nits
- `test/fake-switcher.ts:153-154`: `restartFailsOutright` is the same function as `respawnFailingReconnect`, so `test/atem.test.ts:833` and `:851` cannot go red apart from the #184 tests at `:687` and `:706`. Planned: they pin the adapter's end of the contract by name.
- `test/atem-switcher.test.ts:550`: the source pin's regex includes the library comment `// Clean up the child:`, so a reworded comment in a re-pin turns it red with no behaviour change; `:546`'s negative pin matches one spelling of an error listener only. The child-process restart test is the real backstop.
- The text pin covers the give-up's error-then-kill, not that `thread_closed` and `restarted` are emitted; the healed child-process test covers both by behaviour.
- Each lost `Atem`'s exit-hook entry stays registered, since the library's `destroy` never reaches `_exitUnsubscribe` (with or without finding 2's fix). One small object per failed restart.

## Test quality
Tests added or modified: 26. Red at `0ffec22`: 23 (21 fail on the new `atemSwitcher(make, onSocketProcessError)` signature, `atem.on is not a function`; the failed-restart child-process test is red for a behavioural reason, the client never hears the restart). Green at `0ffec22`: 3, none to delete: the two adapter tests in `test/atem.test.ts` (`fc708ae`, planned as green guards), and the library source pin (green by design, AC3). The healed child-process test is red at base only by signature and green when adapted, but red at `fc708ae`, before review pass 1 finding 1's fix: it is that finding's proof, keep it. Tautology shapes: none (no snapshots, no assertion-free tests, every call-shaped assertion sits beside a behavioural one). Mutants, all killed: (a) any socket process error gives up, by the healed test; (b) none does, by the failed-restart test; (c) no rebuild after loss, by 4 tests; (d) no destroy of the lost `Atem`, by 2 unit tests (finding 2 changes both on purpose); (e) `live()` always true, by 1 test; (f) no hook after connect, by 9 tests; (g) `close` destroys the first `Atem`, by 2 tests. Mutants a, b and e are each caught by one test only, and the `down` gate is exercised only by the two child-process tests.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `db46575`; e2e green locally. Both new repro files pass `pnpm exec eslint`.
- **Commit hygiene:** the branch carries #193 only; this doc and its two repro files are the only additions.
- **Likely reviewer asks:** why the client reaches into the library's private `client.socket._socketProcess` (answered by the AC3 pin and the restart test); whether #145's re-pin needs to revisit it.

## Verdict
Ready to open the PR with follow-ups. Nothing blocks it: zero CRITICAL, HIGH or MEDIUM findings. Findings 1 and 2 are LOW, one line each in code this branch rewrote, and best folded in before the PR (together, since finding 1's guard is what keeps finding 2's dropped destroy safe at shutdown). Finding 3 is comment hygiene. NFI A to C are follow-up ticket candidates on rare threadedclass timings.

## Remediation — 2026-10-22
Remediation scope: Nick, 2026-10-22 (close-out decision 2): fix findings 1 and 2 only, together, in this branch. Finding 3 deferred.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `eee4586` setlist-controller#114 pre-PR review 7 finding 1: a server stop within 5000 ms after a failed restart rejects, so the shutdown skips closing the lateness log and the rest | red→green: `pnpm exec vitest run test/atem-switcher.test.ts test/atem-switcher-restart.test.ts` (new "closes at once while the Atem is lost, before the next connect builds a fresh one", and the child-process lost-close test); repro `review-7-close-while-lost.test.ts` red→green | 0 | proved by execution |
| 2 (LOW) | `4c6af0f` setlist-controller#114 pre-PR review 7 finding 2: every real failed restart logs a second error line, from a destroy of the lost Atem that can never succeed | red→green: the same two files (`:446` test now expects no destroy; the child-process lost-close test expects one server error line); repro `review-7-one-log-line.test.ts` red→green | 0 new; 6 lines reworded per the brief (`:19`, `:114-118`) | proved by execution |
| 3 (LOW) | — deferred | — | — | deferred by Nick |

Preserve suites after both fixes: `test/atem-switcher.test.ts`, `test/atem-switcher-restart.test.ts`, `test/atem.test.ts`, `test/atem-switcher-signals.test.ts` green (100 tests). Full checks at `4c6af0f`: `pnpm lint`, `pnpm typecheck`, `pnpm test` (54 files, 1150 passed, 4 skipped), `pnpm build`, `pnpm test:e2e` (44 passed), all green.

### Known regressions, deferred
- None.

### Rework briefs
- None: no verify pass ran (both fixes LOW and proved by execution), so no rework.

### Approach decisions (remediation)
- Both repros made permanent as one child-process test in `test/atem-switcher-restart.test.ts` ("logs a failed restart of the socket process once, and closes at once while it is lost, before the next connect"), beside the unit tests the briefs name. Precedent: the failed-restart and healed child-process tests in the same file. The `repro/` copies stay for the next round.
- The hook's comment (`src/server/atem-switcher.ts:114`) now says threadedclass kills the process after the error rather than that it was already killed, per finding 2's failure mode.
