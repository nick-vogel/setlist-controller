# Pre-PR review: setlist-controller#114 stage 2, the ATEM follow-ups #174, #175 and #176

**Branch:** `setlist-controller-114-atem-lobby-feed` vs `origin/main` (merge-base `1a8089c` "Merge pull request #178 from nick-vogel/setlist-controller-114-atem-lobby-feed")
**Reviewed at:** HEAD `ae19306` (setlist-controller#176 An operator's cut at the ATEM can go unseen after the adapter's own cut), clean tree: 0 files with uncommitted changes, 0 untracked; 17 files total, +560 / -87 against the merge-base. Commits: `ef6d7ae` and merge `4d760e9` (#174), `7670d8b` and merge `fbf5f79` (#175), `9921bec` and merge `ae19306` (#176).
**Reviewed against:** setlist-controller#174, #175 and #176 (each issue body's acceptance criteria), `pre-pr-review-2.md` (its Approach decisions and its deferred findings 2 and 3, which #175 and #176 take up). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Stage 2 round 1, run `--fresh`: the whole surface since the PR #178 merge, not a delta.
**Date:** 2026-10-22
**Reviewer:** 2 code-review agents + 1 base-oracle agent + verify pass (one executed repro, a fix trial and a mutant re-run by the orchestrator)

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, lockfile up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 51 files, 1055 passed, 4 skipped (the Linux-only setup-screen cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| New and modified tests against `$BASE` | scratch worktree at `1a8089c`, the branch's `test/atem.test.ts`, `test/atem-switcher.test.ts`, `test/connections.test.ts`, `test/pages.test.ts`, `test/fake-switcher.ts`, `test/fake-target.ts` and the two new fixtures copied in, then a second run with the fake's `inputs()` reduced to bare numbers to separate the helper's shape change from real catches | 21 tests added or modified: 14 red at base on behaviour, 7 green (see Test quality) |
| Mutants of the fixes, `src/server/atem.ts` and `src/server/atem-switcher.ts` | 11 mutants by the base-oracle agent and 14 by the ATEM finder, each in a scratch worktree at HEAD, `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts` | killed: own cut matched on any input (2 red, so review 1's `repro/review-1-mutation-own-cut-any-input.diff`, ported to the new `slice`, is now caught), `slice` back to `splice`, the refused-cut filter dropped, `sent = []` on a connection dropped, the client reporting the final input alone, `retry?.()` in `stop` dropped, the reason never cleared, the retry tick not stopping itself, every input external, the port-type check before the existence check. Survived: the two `stopped` guards in `connectOnce`, the `mixEffect === 0` filter, `sentence()` always adding a period, MEOutput counted as external, the `packet = []` reset (unreachable, see Dismissed). See finding 2 and Minor / nits |
| Surviving guards, combined | `repro/review-3-mutation-no-stop-guards.diff` and `repro/review-3-mutation-any-mix-effect.diff` applied together in a scratch worktree at HEAD, same two test files | 66 passed: neither guard is pinned |
| Library behaviour (atem-connection 3.10.3) | read `dist/atem.js:40-75, 121-185`, `dist/lib/atemSocket.js:25-125`, `dist/lib/atemSocketChild.js:75-125`, `dist/enums/index.d.ts:119-133` | `receivedCommands` is emitted and then `_mutateState` runs in the same call (`atem.js:50-52`); `stateChanged` is emitted only at `atem.js:184`, while connected and with a changed path; a second `connect` after one that rejects rebuilds the socket process when there is none (`atemSocket.js:33-41`); a `connect` on an established connection drops it first (`atemSocketChild.js:105-111`); the library's `restarted` handler reconnects on its own after threadedclass respawns the child (`atemSocket.js:114-118`); `InternalPortType` has `ExternalDirect = 7` besides `External = 0` |
| Finding 1 (retry outlives an online) | `repro/review-3-retry-after-online.test.ts` copied into `test/` of a scratch worktree at HEAD, then `pnpm exec vitest run test/review-3-retry-after-online.test.ts` | red: online with `problem: "The ATEM could not connect: Could not start the socket process."`, and `connects: 2` where 1 is expected |
| Recommended fix 1 | applied in the same scratch worktree, then `pnpm exec vitest run test/review-3-retry-after-online.test.ts test/atem.test.ts test/atem-switcher.test.ts test/connections.test.ts`, `pnpm exec tsc`, `pnpm exec eslint src/server/atem.ts test/review-3-retry-after-online.test.ts` | 85 passed, tsc clean, lint clean. The whole suite was not re-run with the fix |
| Implementers of `TargetReport` and `Target` | `git grep -n "TargetReport\|): Target"` across `src/` and `test/` | one report literal (`src/server/connections.ts:189-197`), now with `problem`; targets are the ATEM and `test/fake-target.ts` only |
| Setup screen carries a configured row's problem | read `src/server/server.ts:158-163` | `connections: connections.rows()`, the same rows that carry `problems: [...entry.problems]` (`connections.ts:175`) |
| Not run | the real ATEM Mini, Linux CI | no unit here; #145 owns the acceptance run on the real unit |

**Overall:** All three tickets meet their acceptance criteria, every check is green, and the required tests go red at the base and under the mutants that break their fixes. One new LOW in #175's retry: when the ATEM comes online by itself before the pending retry, the row shows "could not connect" while online and the adapter then reconnects a live ATEM. One LOW test gap: the shutdown guards and the first-mix-effect filter have no test. Nothing blocks the PR.

## Approach decisions
- Signal handling with the ATEM library (carried from review 1 finding 1): the switcher client removes the SIGINT and SIGTERM listeners the library adds during `connect`, in a `finally`. Unchanged here; every retry's `connect` passes through the same wrapper.
- Fake switcher failure modes (carried from review 2): extend `test/fake-switcher.ts` with options, as `failConnects`, `holdEchoes` and `refuseCuts` now do, rather than mocking the switcher client with `vi.fn`. Finding 1's and finding 2's tests follow it: a way for the fake to go online by itself after a connect that rejected, and a way to hold a connect pending.
- Own-cut matching (#176, applied in `9921bec`): a report that matches an own cut drops it and every older one (`sent.slice(own + 1)`), a refused cut leaves the list, and any connection event empties it. Kept: the out-of-order trade-off this makes is required by #176 (see Dismissed).
- A connect that rejects (#175, applied in `7670d8b`): the adapter shows the reason through `TargetReport.problem` and connects again after `RETRY_MS` with `clock.every` used as a one-shot, cancelled by `stop`. Finding 1 adds: an online report also cancels the pending retry and clears the reason.
- Coming online with no connect asked (review 3 finding 1, applied in `35e574d`): the connection listener, on an online report, cancels the pending retry and clears the reason before the status goes out; an offline report leaves the reason alone. The fake switcher's `connectOnItsOwn()` stands in for the library's restarted handler, following the review 2 decision to extend `test/fake-switcher.ts` with options rather than mock the client. The in-flight retry that rejects after an online report (the brief's "Fix's own failure") stays out of scope, with no `online` flag added.

## Prior-review closure
This is a fresh round over a new surface, so nothing here is counted against review 2. For the record: review 2's finding 2 (the cut and connect failure paths untested, the fake unable to fail) is closed by #175 and #176, which add `failConnects` and `refuseCuts` and tests that the mutants confirm. Review 2's finding 3 (the own-cut list, per-input matching untested) is closed by #176: the any-input mutant is now killed by two tests. Review 2's findings 4 and 5 sit in files outside this surface, on main since PR #178, and were not re-checked.

## Confirmed Issues
### 1. When the ATEM comes online by itself after a connect that rejected, the row says it could not connect, and the retry then drops the live connection — LOW
- **Location:** `src/server/atem.ts:173-179` (the connection listener, which does not touch the retry or the reason), with the retry at `src/server/atem.ts:148-158`
- **Attribution:** introduced by `7670d8b` (setlist-controller#175). `git log --oneline -S'RETRY_MS' 1a8089c..HEAD` gives only `7670d8b`; the base had no retry and no reason on the row.
- **Real-world trigger:** a connect that rejects while the library's socket process exists, which happens when the call into the socket child fails (the child froze past threadedclass's 600 ms freeze limit, or crashed mid-call). threadedclass then respawns the child and the library's own `restarted` handler connects again (`atemSocket.js:114-118`), so the ATEM comes online inside the adapter's 5 s pause. For 5 s the producer row and the setup screen read Online beside "The ATEM could not connect: ...", then the adapter's retry calls `connect` on the live client, which drops the established connection and reconnects (`atemSocketChild.js:105-111`): the row blinks offline, the check reruns, and a Count Off in that gap is not cut. LOW, capped: no plausible user path is proven, since a connect that fails to start the socket process at all (the case #175 targets) has no child to respawn. Upgrade to MEDIUM if the playback Mac's log ever shows `the ATEM could not connect` followed by the ATEM coming online with no server restart; check by searching the server's log for that line.

**Evidence** — the connection listener reports the status and the program line, and nothing else:

```ts
switcher.onConnection((connected) => {
  sent = [];
  report.status(connected ? 'online' : 'offline');
  if (connected) {
    known = switcher.programInput();
    program(known);
  }
});
```

and the comment at `src/server/atem.ts:85-86` rests the design on "A connect rejects only when the library cannot start its socket process, and then the library never retries on its own", which the library does not bear out: `atemSocket.js:42` awaits the child's `connect` with a socket process in place, and that call can reject too. `src/server/atem.ts:41` says the same: "It rejects when the client could not start, and then nothing retries but the adapter."

**Failure mode** — a client whose first connect rejects and which then reports connected, and the clock moved 5 s: the row is online with the reason still on it, and `connect` is called a second time. Executed: `repro/review-3-retry-after-online.test.ts` is red at HEAD with `online: { status: 'online', problem: 'The ATEM could not connect: Could not start the socket process.' }` and `connects: 2`, where `problem: null` and `connects: 1` are expected.

**Recommended fix** — in the connection listener, an online report cancels the pending retry and clears the reason, before the status goes out:

```diff
       switcher.onConnection((connected) => {
         sent = [];
+        if (connected) {
+          retry?.();
+          retry = null;
+          report.problem(null);
+        }
         report.status(connected ? 'online' : 'offline');
         if (connected) {
           known = switcher.programInput();
```

and reword the two comments so they no longer claim a connect rejects only when no socket process starts (`src/server/atem.ts:41` and `:85-89`): a connect also rejects when the call into a running socket process fails, and then the library may come back by itself, which the online report now accounts for.

**Remediation brief**
- **Design intent:** the switcher client retries an unreachable ATEM itself once a connect has resolved; the adapter retries only after a connect that rejected, every `RETRY_MS`, and shows the rejection's reason through `TargetReport.problem` until the ATEM is reached. Being online is proof the ATEM was reached, whoever made the connection, so an online report ends both the reason and the adapter's retry. The connections layer keeps a reported problem across offline and online until the target reports null (`src/server/connections.ts:196`), so clearing it is the adapter's job.
- **Full surface:** `src/server/atem.ts:173-179` (the listener), `src/server/atem.ts:41` and `:85-89` (the two comments), `test/fake-switcher.ts` (an option so the fake can come online by itself after a rejected connect: today "a connect that rejects leaves it not connecting, so it stays offline", `test/fake-switcher.ts:11-13`), and a new test in `test/atem.test.ts`'s `describe('a connect that rejects')` block (`:537`).
- **Must preserve:** `sent = []` stays first in the listener for both online and offline (pinned by "is a cut made at the ATEM after a reconnect to the input of a cut of its own whose report did not come"); an offline report never clears the reason ("shows its reason on the row from the first snapshot", and `test/connections.test.ts`'s "a target's reported problem" test, which keeps the problem across an offline); the retry chain for connects that keep rejecting ("connects again after each one that rejects, logging and showing each, until one resolves"); `stop` cancelling the retry ("connects no more once the server stops during the pause"); the unreachable case ("an unreachable ATEM > shows Offline with no reason, is not connected again, and comes online when it appears").
- **Do not touch:** the `stopped` guards in `connectOnce` (`src/server/atem.ts:147, 149`), which are correct and only untested (finding 2); the one-shot use of `clock.every` (Dismissed).
- **Fix's own failure:** a retry's connect already in flight when the online report comes can still reject afterwards, and would then show the reason on an online row and schedule another retry. Declared out of scope: it needs a second child failure inside one pending call. A remediator who wants it closed adds an `online` flag that the catch checks before it reports.
- **Proof:** copy `docs/reviews/setlist-controller-114/repro/review-3-retry-after-online.test.ts` into `test/` and run `pnpm exec vitest run test/review-3-retry-after-online.test.ts`: red now, green after the fix. Then delete the copy and add the fake-switcher-based test, which must go red with the listener change reverted.

### 2. The shutdown guards on a pending connect and the first-mix-effect filter have no test — LOW
- **Location:** `src/server/atem.ts:147` and `:149` (the `stopped` guards in `connectOnce`), `src/server/atem-switcher.ts:53` (`command.mixEffect === 0`)
- **Attribution:** introduced by `7670d8b` (#175, the guards) and `9921bec` (#176, the filter); both lines are new in the diff.
- **Real-world trigger:** none for the guards while they stay in place; the gap is that deleting either keeps the suite green. The guards cover the server stopping while a connect is pending, when `close()` makes that connect reject with "Disconnecting" (`atemSocket.js:36-38`): without them the shutdown logs a failure, shows a reason, and schedules a connect after the server closed, which #175's acceptance criteria rule out. The filter matters only on an ATEM with two or more mix effects, where a packet carrying a program change on M/E 2 beside one on M/E 1 would read as an extra M/E 1 report; the church's unit is an ATEM Mini with one. LOW.

**Evidence** — the fake's `connect` settles at once, so no test can stop mid-connect, and test (c) in `test/atem-switcher.test.ts` sends only M/E 1 commands:

```ts
      await switcher.connect(host);
      if (!stopped) report.problem(null);
    } catch (error) {
      if (stopped) return;
```

**Failure mode** — `repro/review-3-mutation-no-stop-guards.diff` (both guards removed) and `repro/review-3-mutation-any-mix-effect.diff` (the filter removed), applied together at HEAD: `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts` gives 66 passed.

**Recommended fix** — two tests. In `test/atem.test.ts`'s `describe('a connect that rejects')`, give the fake a way to hold its next connect pending and to reject it later (an option beside `failConnects`), start the rig, call the server's stop while the connect is held, then reject it: assert no reason on the row, no second connect after `clock.advance(RETRY_MS * 2)`, and no "could not connect" log line; and a held connect that resolves after stop leaves the row's problems untouched. In `test/atem-switcher.test.ts`, extend test (c)'s packet with a `ProgramInputUpdateCommand` for mix effect 1 (zero-based) on a topology with two mix effects, and assert the reports stay `[4, 2]`.

**Remediation brief**
- **Design intent:** `stopped` makes a connect that settles after `stop` inert: it neither reports nor schedules. The switcher client reports program changes of the first mix effect only, since the lobby feed is M/E 1's program; `PROGRAM_PATH` (`atem-switcher.ts:36`) is that mix effect's path, and the packet filter must match it.
- **Full surface:** `test/fake-switcher.ts` (the held-connect option, following `holdEchoes`/`releaseEchoes` at `:51-56`), `test/atem.test.ts:537-622` (the block), `test/atem-switcher.test.ts` (test (c), "reports each change of the program input in a packet that carries several, in order, over the library itself"). No production code changes.
- **Must preserve:** every existing test in both files; the fake's default `connect` that settles at once, which every other rig test relies on.
- **Do not touch:** `src/server/atem.ts:144-158` and `src/server/atem-switcher.ts:50-64`; the code is correct.
- **Proof:** each new test passes at HEAD and goes red with its mutant applied: `git apply docs/reviews/setlist-controller-114/repro/review-3-mutation-no-stop-guards.diff` then `pnpm exec vitest run test/atem.test.ts`, and `git apply docs/reviews/setlist-controller-114/repro/review-3-mutation-any-mix-effect.diff` then `pnpm exec vitest run test/atem-switcher.test.ts`, each reverted with `git apply -R` afterwards.

### 3. Comment hygiene — LOW (aggregated)
- `web/src/styles.css:583-584` — "each target's label, whether it is online, and its pre-service check or its problems." → "each target's label, whether it is online, its pre-service check and any problem it reports reaching it, or, for a target the file disabled, its problems."
- `test/fake-switcher.ts:13-15` — "The test can make it refuse the cuts it is told, as the library does when the ATEM does not take a command: a refused cut rejects" → "The test can make it refuse the cuts it is told, as the library does when it cannot send a command, such as with no socket process open: a refused cut rejects". The library has no refusal from the ATEM: `sendUnprioritizedCommands` settles every ack with `Promise.allSettled`, and `changeProgramInput` rejects only when `sendCommands` throws "Socket process is not open".
- `README.md:47`, after the sentence "A target that matches no names checks its own device instead, ...": the README describes each row's contents but not #175's line. Add: "A target that cannot reach its device says why on its row and on the setup screen, online or offline, such as an ATEM whose connect failed, which the server tries again every 5 seconds until it connects."

## Needs Further Investigation
### A. Whether the ATEM answers a cut to the input already on program
Carried from reviews 1 and 2. If the hardware sends nothing for a cut that changes nothing, the cut's entry sits in `sent` for 2 seconds. The ATEM finder showed what that reaches (pre-existing, unchanged by `slice`): Camera on program, Fire again cuts to Camera with no answer, the operator cuts to Pro (paused, correct), then to Camera within 2 s, and that second cut is taken as the adapter's own. It matters only if the producer re-arms inside those 2 s. What would settle it: #145's acceptance run on the church's ATEM Mini, with `debug` logging of received commands during a Count Off while Camera is on program.

### B. Whether any ATEM reports a camera or video input with port type ExternalDirect
`src/server/atem-switcher.ts:91` counts only `InternalPortType.External` as external. The library's enum also has `ExternalDirect = 7`; if a model reports a physical input that way, the check would call it "not a camera or video input". The ATEM Mini reports its HDMI inputs as `External`, so this does not reach the church's unit. What would settle it: the port types the real unit reports, in #145's acceptance run, and the library's source for which models send 7.

### C. Whether an exception thrown from a connections callback inside a library event escapes into threadedclass
Carried from reviews 1 and 2, unchanged. The new `report.problem` adds one more callback on the same path.

## Reviewed and Dismissed
- `slice(own + 1)` turns own cuts reported out of send order into a false pause (finder probe: Camera then Pro 10 ms apart, reported Pro then Camera, gives one pause; `splice` gave none) — #176's acceptance criteria require that a matching report clears every older own cut, and the library's child retransmits in order from the first unacknowledged packet. Kept as the chosen trade-off.
- A stale `packet` reaching a later report — `stateChanged` is emitted only from `_mutateState`, synchronously after the same packet's `receivedCommands` (`atem.js:50-52, 184`), so every report reads its own packet; the init dump sets `packet` with no `stateChanged`, and the next packet overwrites it. The `packet = []` reset is defensive and unreachable; do not remove it either.
- Overlapping retries, or a timer that fires before `stop` is assigned — each tick stops itself before it calls `connectOnce`, `connectOnce` never rejects, and neither `setInterval` nor `manualClock.every` ticks synchronously.
- A second `connect` after one that rejected — the library rebuilds its socket process when there is none (`atemSocket.js:33-41`).
- `sent = []` on every connection event — the child clears `_inFlight` on a reconnect, so no cut sent before a drop is replayed after it, and cuts are routed only while online.
- Duplicate problem rendering on the producer row — the not-configured and configured arms of `ConnectionsPanel` are disjoint, and the configured arm renders the list only when `problems.length > 0`.
- Styling a configured row with a problem as not configured — the red class and "Not configured" key off `configured` alone (`ConnectionsSetup.tsx:34-35`).
- The leader and view-only pages showing a reported problem — they never receive `connections`; `test/connections.test.ts`'s "a target's reported problem" test asserts the reason is absent from both.
- Snapshot churn from the ATEM's repeated reason every 5 s — `set` compares `problems` by JSON (`connections.ts:113`), so an unchanged reason publishes nothing.

## Minor / nits
- The two surfaces put the reported problem in opposite places: before the check on the producer row (`ConnectionsPanel.tsx:61-62`), after it on the setup screen (`ConnectionsSetup.tsx:37-38`). Both orders are pinned by tests (`test/pages.test.ts:511, 924`), and no ticket names an order.
- A `start()` that throws still leaves its reason only in the log (`connections.ts:198-200`); not reachable for the ATEM, whose `connectOnce` catches its own rejection.
- `startConnections` does not drop reports after `stop` (`connections.ts:203-205`); pre-existing for `status` and `state`, and the ATEM guards itself.
- `problem('')` clears the row (`connections.ts:196`), where `target.ts:20-23` documents only a sentence or null.
- An empty `longName` would read "Camera is input 1000, which is , not a camera or video input." (`atem.ts:232`); `sentence()` gives "The ATEM could not connect: ." for an empty message and "[object Object]." for a thrown object. Its branch for a message that already ends in punctuation has no test.
- The port-type mapping is pinned for External (true) and Color Bars and a media player (false) only; MEOutput mapped to external survives.
- No server-side test reads a configured row's reported problem through the setup screen's status; it is the same `rows()` the producer snapshot uses.
- The test name "is a cut made at the ATEM to the input of a cut of its own the ATEM refused" (`test/atem.test.ts:348`) carries the same framing as hygiene entry 2; rename it to "...a cut of its own the switcher client refused" if that entry is worked.

## Test quality
Tests added or modified: 21 (4 in `test/atem-switcher.test.ts`, 14 in `test/atem.test.ts`, 1 in `test/connections.test.ts`, 2 in `test/pages.test.ts`). Red at `$BASE` on behaviour: 14, among them all three of #176's required cases, the per-input pin, every #175 retry and reason test, the two #174 check lines, and both page tests. Green at `$BASE`: 7, none vacuous:
- "follows the library's connected, disconnected, error, stateChanged and receivedCommands events..." (`9921bec`) and "reads each input's port type and long name with the types the client expects" (`ef6d7ae`): type-only `expectTypeOf` tests that pin the library's types, which bite under `pnpm typecheck` (vitest's typecheck mode is off). They are #174's "a re-pin that renames the field fails typecheck" criterion. Keep.
- "is never the ATEM's own cut when its report comes late, within 2 seconds" and "is a report that comes more than 2 seconds after the ATEM's own cut" (`7670d8b`): only their clock moved to `manualClock()`. Keep.
- "is a cut made at the ATEM to another input while the report of the ATEM's own cut has not come yet" (`9921bec`): the per-input pin; the base already matched per input, and this test kills the any-input mutant. Keep.
- "connects no more once the server stops during the pause" (`7670d8b`): kills the `retry?.()` mutant. Keep.
- "an unreachable ATEM > shows Offline with no reason, is not connected again, and comes online when it appears" (`7670d8b`): #175's regression guard for the case that must not change. Keep.
Tautology shapes found: 0 that hide a defect. No expectation is computed with production's helpers, nothing under test is mocked, there are no snapshots, and the log-line and negative assertions each sit beside positive state assertions. The gaps are the surviving mutants in finding 2.

## Before opening the PR
- **CI readiness:** lint, typecheck, unit suites and build green locally; Playwright green (not in CI).
- **Commit hygiene:** the branch is three feature commits and three merges, one per ticket; this doc and its `repro/` files are the only additions.
- **Likely reviewer asks:** why the retry is 5 s against the library's 1 s (answered in the `RETRY_MS` comment); what happens on a 2-M/E ATEM (finding 2); whether the real unit's ports are all `External` (B, for #145).

## Verdict
Ready to open the PR with follow-ups. No finding blocks it: finding 1 is a LOW with a five-line fix and a preserved repro, worth taking before the PR since it is in this branch's own new code; finding 2 is two tests; finding 3 is comments and one README sentence.

## Remediation — 2026-10-22
Scope (Nick, 2026-10-22): finding 1 only, a LOW opted in; findings 2 and 3 deferred.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `35e574d` setlist-controller#114 pre-PR review 3 finding 1: an online report after a rejected connect left the reason on the row, and the retry then dropped the live connection | red→green: `repro/review-3-retry-after-online.test.ts` copied into `test/` and run with `pnpm exec vitest run test/review-3-retry-after-online.test.ts` (red at `37ac62f` with the reason on the online row and `connects: 2`, green after; the copy deleted). Permanent test `test/atem.test.ts` "a connect that rejects > drops its reason and connects no more once the ATEM comes online on its own during the pause": red before the fix, red with the retry cancel alone removed (`expected 2 to be 1`), red with the reason clear alone removed, green with the fix. Preserve suites: `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts test/connections.test.ts` green; full checks `pnpm lint`, `pnpm typecheck`, `pnpm test` (51 files, 1056 passed, 4 skipped), `pnpm build`, `pnpm test:e2e` (44 passed) green | 2 new (the contract of the fake's `connectOnItsOwn()`, as on every other `FakeSwitcher` member); 12 reworded, the two comments the brief names plus the `start()` comment, whose "until one resolves" the fix made incomplete | proved by execution (LOW, not a shared core) |
| 2 (LOW) | deferred | | | deferred by scope |
| 3 (LOW, comment hygiene) | deferred | | | deferred by scope |

### Known regressions, deferred
- None.

### Rework briefs
- None: no verify pass ran and no rework was needed.
