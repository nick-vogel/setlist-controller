# Pre-PR review: setlist-controller#114 run 3, #183 (the program line names any source) and #184 (a failed reconnect after a respawn)

**Branch:** `setlist-controller-114-atem-lobby-feed` vs `origin/main` (merge-base `cd75677` "Merge pull request #185 from nick-vogel/setlist-controller-114-atem-lobby-feed")
**Reviewed at:** HEAD `cb3971d` (setlist-controller#184 A failed reconnect after the ATEM's socket process respawns leaves it offline, with the reason only in the log), clean tree: 0 files with uncommitted changes, 0 untracked; 5 files total, +339 / -32 against the merge-base.
**Delta under review:** none; a fresh review (`--fresh`) of the whole working surface, which is run 3's two tickets: `74710b7` (#183) merged as `bbc51a8`, and `af480b4` (#184) merged as `cb3971d`.
**Reviewed against:** setlist-controller#114 (the epic spec), #183 and #184 (their acceptance criteria), the worker assumptions in `.epic-loop/tickets/183/assumptions.md` and `.epic-loop/tickets/184/assumptions.md`, and the Approach decisions and Needs Further Investigation D of `pre-pr-review-4.md`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, lockfile up to date |
| Lint | `pnpm lint` | green, this doc's repro files included |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 51 files, 1090 passed, 4 skipped (the Linux-only setup-screen cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| New tests against `$BASE` | scratch worktree at `cd75677`, the branch's three test files copied in, `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts` (test-audit agent) | 18 new or changed cases: 12 red, 6 green. The green ones are characterisation of kept behaviour (Pro and Camera by their own names, the number fallbacks) or guards whose mutants they kill at HEAD; see Test quality |
| Mutants at HEAD | scratch worktree at `cb3971d`, each mutant applied alone, `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts` | killed: the client's offline-before-give-up report removed; the `Error: ` strip removed; `retry \|\|` removed from `retryLater`; `.trim()` removed; the online report no longer cancelling the retry; `stop` no longer cancelling it; the two `stopped` guards removed together. Survived: the `stopped` guard in the give-up listener removed (finding 4), `\|\| stopped` in `retryLater` removed (redundant, finding 4), the names cached at the first report (finding 2), `startsWith` loosened to `includes` (nit) |
| Finding 1 (a give-up during an in-flight connect) | `repro/review-5-giveup-during-connect.test.ts` copied into `test/` of a scratch worktree at HEAD, `pnpm exec vitest run test/review-5-giveup-during-connect.test.ts` | red: `connects` is 3 where 2 is expected, after the resolved connect cleared the reason |
| Recommended fix 1 | applied in the same scratch worktree, `pnpm exec vitest run test/review-5-giveup-during-connect.test.ts test/atem.test.ts test/atem-switcher.test.ts test/connections.test.ts`, `pnpm exec tsc` | 103 passed, tsc clean. The whole suite was not re-run with the fix |
| Library behaviour (atem-connection 3.10.3) | read `dist/lib/atemSocket.js:114-122`, `dist/atem.js:50-68, 120-185` | the `restarted` handler's failed `connect()` emits only `error` with the pinned text; `Atem` re-emits the socket's `error` unchanged (`atem.js:57`); `InitCompleteCommand` always sets CONNECTED and emits `connected`, and a `VersionCommand` resets the state, so a give-up after a frozen child (no `disconnect`) never blocks the next `connected` |
| Cues and buttons while offline | read `src/server/connections.ts:218-237` | the server hands cues and button runs to online targets only, so no cut reaches the switcher client between a give-up and the next connect |
| Other `SwitcherClient` implementers | `git grep -n "SwitcherClient"` | only `src/server/atem-switcher.ts` and `test/fake-switcher.ts`; the new `onGaveUp` member breaks nothing else |
| Not run | the real ATEM Mini, a real threadedclass respawn, Linux CI | no unit here; #145 owns the acceptance run on the real unit |

**Overall:** Both tickets do what their acceptance criteria ask: any source that is not Pro or Camera shows by the ATEM's name, with the number as the fallback, and a failed reconnect after a respawn shows the reason on the row and connects again every 5 s until a connect resolves, an online report arrives, or the server stops. One LOW race: a give-up that lands while the adapter's own connect is in flight schedules a connect again that a later resolve does not cancel. The other three findings are test gaps, plus comment hygiene carried from review 4. Nothing blocks the PR.

## Approach decisions
- Signal handling with the ATEM library (carried from review 1 finding 1): the switcher client removes the SIGINT and SIGTERM listeners the library adds during `connect`, in a `finally`. Unchanged.
- Fake switcher failure modes (carried from review 2): extend `test/fake-switcher.ts` with options and methods, as `failConnects`, `holdEchoes`, `refuseCuts`, `connectOnItsOwn` and now `respawnFailingReconnect` do, rather than mocking the switcher client with `vi.fn`. Finding 1's test follows it with a held connect on the fake.
- Own-cut matching (#176, applied in `9921bec`): unchanged.
- A connect that rejects (#175, applied in `7670d8b`): the adapter shows the reason through `TargetReport.problem` and connects again after `RETRY_MS` with `clock.every` used as a one-shot, cancelled by `stop`. #184 moved the scheduling into `retryLater`, which starts no second timer while one is pending. Unchanged otherwise.
- Coming online with no connect asked (review 3 finding 1, applied in `35e574d`): an online report cancels the pending retry and clears the reason before the status goes out; an offline report leaves the reason alone. Unchanged.
- A failed reconnect after a respawn (#184, applied in `af480b4`): the switcher client recognises the library's `error` by the exported prefix `RESPAWN_RECONNECT_FAILED`, pinned by a test that reads the installed library's `atemSocket.js`; it reports offline first when it still reads connected, then calls `onGaveUp` with the caught error's message; the adapter shows it as a connect reason and calls `retryLater`. Finding 3 widens the pin to the library's re-emit; it changes no production code. Applied in `09b7b7d`.
- A connect that resolves (new, finding 1): it supersedes any give-up or rejection before it, so it cancels a pending connect again as well as clearing the reason, mirroring what an online report does since `35e574d`. Applied in `46bf9d3`, with the race driven through a held connect on the fake (`holdConnects`), per the fake-switcher decision above.
- The program line (#183, applied in `74710b7`): Pro and Camera by their configured names, any other input by the trimmed name in `switcher.inputs()` read at each report, the number otherwise. Unchanged; finding 2 pins the read-at-each-report half.

## Confirmed Issues
### 1. A give-up that lands while the adapter's own connect is in flight leaves a connect again pending after that connect resolves — LOW
- **Location:** `src/server/atem.ts:166-167` (`connectOnce`'s success path), with `src/server/atem.ts:151-152` (`retryLater`) and `:203-207` (the give-up listener)
- **Attribution:** introduced by `af480b4` (#184). Before it nothing outside `connectOnce`'s own catch scheduled a connect again, so a pending retry could not outlive a resolve (`git show cd75677:src/server/atem.ts | grep -n -A12 'const connectOnce'`: the timer was created only in the catch).
- **Real-world trigger:** the library's socket child crashes or freezes again while the adapter's retry is calling into it, the library's own reconnect after that respawn rejects, and the adapter's call still resolves afterwards. Whether threadedclass ever resolves a call made into a child that then restarted is unverified, so no user path is established: LOW, capped. Consequence: the row reads Offline with no reason for up to 5 s, then one extra `connect`, which the library turns into `restartConnection()` and which drops a connection that has handshaken but not yet sent `InitComplete`. Upgrade to MEDIUM if #145's acceptance run shows a call into a respawning child resolving, check via `debug` logging around a killed `atemSocketChild` process.

**Evidence** — the timer callback clears `retry` before it connects, so a give-up during that connect finds no pending retry and schedules one, and a resolve only clears the reason:

```ts
    const stop = clock.every(RETRY_MS, () => {
      stop();
      retry = null;
      void connectOnce(report);
    });
```

```ts
      await switcher.connect(host);
      if (!stopped) report.problem(null);
```

**Failure mode** — first connect rejects, the retry fires at 5 s and its connect is held, the client gives up, the held connect resolves: the reason is cleared (`problem: null`, `connects: 2`), and 5 s later the adapter connects a third time. Executed: `repro/review-5-giveup-during-connect.test.ts` is red at HEAD with `connects: 3` where 2 is expected. The companion order (the in-flight connect rejects) is correct: one retry, the later reason shown.

**Recommended fix**

```diff
     try {
       await switcher.connect(host);
-      if (!stopped) report.problem(null);
+      if (stopped) return;
+      retry?.();
+      retry = null;
+      report.problem(null);
     } catch (error) {
```

**Remediation brief**
- **Design intent:** `SwitcherClient.connect` resolving means the client is connecting and retries on its own from then on (`src/server/atem.ts:39-43`), so a resolve supersedes every reason and every pending connect again that came before it. At most one connect again is ever pending (`retry`), and `stop` cancels it. The give-up listener and a rejected connect both funnel through `retryLater`; an online report and, after this fix, a resolved connect both cancel and clear.
- **Full surface:** `src/server/atem.ts:166-167` only. The online branch of the connection listener (`src/server/atem.ts:192-197`) is the precedent and stays as it is. The test goes in `test/atem.test.ts`, in `describe('a failed reconnect after the socket process respawns')`, and needs a new fake member in `test/fake-switcher.ts` (type at `:50-57`, implementation beside `connect` at `:110-118`): `holdConnects(): () => void`, after which the next `connect` counts in `connects` and records `host` at once, then waits until the returned function is called before it carries on as usual (rejecting while `failConnects` says so, else connecting).
- **Must preserve:** a stopped adapter neither reports nor reschedules after a resolve (the old `if (!stopped)`), pinned by "connects no more once the server stops during the pause" in both the `a connect that rejects` and the respawn describes; a give-up during a pending retry starts no second one ("connects once per pause when it gives up while a connect again is pending", `test/atem.test.ts:759`); the reason clears on a resolve ("comes online and drops its reason once the connect again resolves", both describes); the rejection path's `retryLater` call. On the initial `start` and inside the timer callback `retry` is already null, so the added cancel is a no-op there.
- **Do not touch:** the `stopped` check inside `retryLater` (finding 4 decides it); the online report's cancel in the connection listener (Dismissed: two pending retries).
- **Proof:** copy `docs/reviews/setlist-controller-114/repro/review-5-giveup-during-connect.test.ts` into `test/` of a scratch worktree, `pnpm exec vitest run test/review-5-giveup-during-connect.test.ts`: red now (`connects: 3`), green after the fix. The committed proof is the new fake-based test in `test/atem.test.ts`, red before the fix on the same `connects` count; run `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts`.

### 2. Nothing pins that a rename at the ATEM shows on the next program report — LOW
- **Location:** `src/server/atem.ts:189` (`switcher.inputs()` read at each report)
- **Attribution:** introduced by `74710b7` (#183). Its assumption "When the names are read: from `switcher.inputs()` at each program report, not cached at connect" is implemented and untested.
- **Real-world trigger:** none while the code stays as it is; the gap is that caching the names keeps the suite green. A rename does happen in practice (an operator labels an input in ATEM Software Control during setup), and under the mutant the row would show the old name until a restart. A display, so LOW.

**Evidence** — `repro/review-5-mutation-names-cached.diff` caches the list at the first report:

```ts
      let names: ReturnType<typeof switcher.inputs> | null = null;
      const program = (input: number | null) => report.state(programLine(input, inputs, (names ??= switcher.inputs())));
```

**Failure mode** — mutant applied at `cb3971d`: `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts` gives 84 passed. The fake's `setInputs` (`test/fake-switcher.ts:169`) exists, but only a device-check test uses it (`test/atem.test.ts:885`).

**Recommended fix** — one test in `describe("the ATEM's row")` of `test/atem.test.ts`, beside "shows an external input that is neither Pro nor Camera by the name the ATEM gives it" (`:475`): a fake with `program: 3` and input 3 named `Lyrics`, settle on `Program: Lyrics`, then `switcher.setInputs([1, 2, { input: 3, external: true, name: 'Lyrics 2' }, 4, ...ATEM_MINI_SOURCES])`, cut at the switcher to 4 then back to 3, and expect `Program: Lyrics 2`.

**Remediation brief**
- **Design intent:** the program line reads the ATEM's names from the switcher's live state at every report, so it never holds a copy that can go stale; a rename with no program change refreshes nothing, which is accepted (#183 assumption).
- **Full surface:** `test/atem.test.ts` only. No production change.
- **Must preserve:** Pro and Camera by their configured names whatever the ATEM calls them (`test/atem.test.ts:500`); the number fallback for an empty, blank or unlisted input (`:512`, `:525`).
- **Do not touch:** `programLine` and its `.trim()`.
- **Proof:** the new test must be red with `git apply docs/reviews/setlist-controller-114/repro/review-5-mutation-names-cached.diff` in a scratch worktree, then `pnpm exec vitest run test/atem.test.ts`, and green without it.

### 3. The pin on the library's give-up text covers the socket, not the Atem that forwards it — LOW
- **Location:** `test/atem-switcher.test.ts:330-340`
- **Attribution:** introduced by `af480b4` (#184). #184's last acceptance criterion asks that a re-pin in #145 that changes how the failed reconnect is told apart "fails a test or `pnpm typecheck`".
- **Real-world trigger:** a library update in #145 that wraps or prefixes the socket's error where `Atem` re-emits it (`node_modules/atem-connection/dist/atem.js:57`, `this.socket.on('error', (e) => this.emitter.emit('error', e));`). The `startsWith` check would then stop matching, the respawn failure would go back to a log line only, and every test would stay green: the behaviour tests drive a stub `Atem`, and the event's type stays `[string]`. LOW: it needs a library change, and #145 runs the real unit.

**Evidence** — the test reads only `lib/atemSocket.js`:

```ts
    const socket = readFileSync(join(dirname(index), 'lib', 'atemSocket.js'), 'utf8');
```

**Failure mode** — not executed (it needs an edited `node_modules`); the absence was confirmed by `grep -n "atem.js" test/atem-switcher.test.ts`, which finds no read of the forwarding file.

**Recommended fix** — in the same test, read `dist/atem.js` beside the socket and assert it re-emits unchanged:

```diff
     const socket = readFileSync(join(dirname(index), 'lib', 'atemSocket.js'), 'utf8');
+    const atem = readFileSync(join(dirname(index), 'atem.js'), 'utf8');
+    expect(atem).toContain("this.socket.on('error', (e) => this.emitter.emit('error', e));");
```

**Remediation brief**
- **Design intent:** the library carries the failed reconnect only as text on a `[string]` event, so the client's prefix is pinned to the installed library's code along the whole path from the `restarted` handler to `Atem`'s `error` event.
- **Full surface:** `test/atem-switcher.test.ts:330-340`. `createRequire(...).resolve('atem-connection')` resolves to `dist/index.js`, so `atem.js` sits beside it in `dirname(index)`.
- **Must preserve:** the three existing `toContain` checks on the `restarted` handler.
- **Do not touch:** `RESPAWN_RECONNECT_FAILED` and the client's `startsWith`.
- **Proof:** `pnpm exec vitest run test/atem-switcher.test.ts` green; in a scratch worktree with `node_modules` copied rather than linked, edit `node_modules/atem-connection/dist/atem.js:57` to emit `` `socket: ${e}` `` and the test goes red.

### 4. The stop guard in the give-up listener is untested, and doubled by the one in retryLater — LOW
- **Location:** `src/server/atem.ts:204` (`if (stopped) return;` in the give-up listener), `src/server/atem.ts:152` (`|| stopped` in `retryLater`), the test `test/atem.test.ts:791`
- **Attribution:** introduced by `af480b4` (#184). The same class as review 3 finding 2 (the `stopped` guards on a pending connect have no test), which was deferred by scope.
- **Real-world trigger:** a give-up after the server stops needs the library's `restarted` handler to run after `destroy()`, which `ThreadedClassManager.destroy` makes unlikely. Under the mutant the only effect is a `problem` set on a stopped target. LOW, a test gap.

**Evidence** — "connects no more when it gives up after the server stops" asserts only the connect count, which `retryLater`'s own guard keeps at 1:

```ts
    switcher.respawnFailingReconnect(GAVE_UP);
    clock.advance(RETRY_MS * 2);

    expect(switcher.connects).toBe(1);
```

**Failure mode** — `repro/review-5-mutation-gaveup-no-stop-guard.diff` applied at `cb3971d`: 84 passed. Removing `|| stopped` from `retryLater` alone also passes, since both callers already return when stopped; only the two removed together turn `:791` red.

**Recommended fix** — keep both guards, and make `:791` also assert that the producer saw no reason after the close. The rig is closed, so read the report through the fake instead: assert that the `ATEM` target's last reported problem before close is unchanged, or move the case to a direct `atemKind(...).create(...).target` harness, as `repro/review-5-giveup-during-connect.test.ts` builds one, and assert `problem` stays `null` after `stop()` and a give-up.

**Remediation brief**
- **Design intent:** a stopped adapter reports nothing and schedules nothing (`src/server/atem.ts:160-163`, `connectOnce`'s comment). The give-up listener's guard owns "reports nothing"; `retryLater`'s owns "schedules nothing" for any caller.
- **Full surface:** `test/atem.test.ts:791-802`. No production change.
- **Must preserve:** the existing `connects` assertion.
- **Do not touch:** either guard; removing one to make the other load-bearing is a design change this review does not recommend.
- **Proof:** with `git apply docs/reviews/setlist-controller-114/repro/review-5-mutation-gaveup-no-stop-guard.diff` in a scratch worktree, `pnpm exec vitest run test/atem.test.ts` must go red.

### 5. Comment hygiene — LOW (aggregated)
- `src/server/atem-switcher.ts:12-13` (carried from review 4 finding 2; this branch edited the same paragraph) — "A connect that rejects started no socket, so nothing in the library retries it; the adapter connects again (atem.ts)." → "A connect that rejects either started no socket, which nothing in the library retries, or failed in a running socket process, which the library may reconnect once that process restarts; the adapter connects again until the ATEM is online (atem.ts)."
- `test/fake-switcher.ts:13-14` (carried from review 4 finding 2) — "so it stays offline until the test connects it on its own, as the library's restarted socket process can." → "so it stays offline until the test calls connectOnItsOwn, as the library's restarted socket process can connect by itself."
- `test/fake-switcher.ts:17-18` (carried from review 3 finding 3) — "as the library does when the ATEM does not take a command: a refused cut rejects" → "as the library does when it cannot send a command, such as with no socket process open: a refused cut rejects".
- Review 4 finding 2's entries for `web/src/styles.css:583-584` and `README.md:47` are outside this branch's files and stand as written there.

## Needs Further Investigation
### A. Whether the ATEM answers a cut to the input already on program
Carried from reviews 1 to 4, unchanged. What would settle it: #145's acceptance run on the church's ATEM Mini.

### B. Whether any ATEM reports a camera or video input with port type ExternalDirect
Carried from reviews 3 and 4, unchanged. What would settle it: the port types the real unit reports, in #145.

### C. Whether an exception thrown from a connections callback inside a library event escapes into threadedclass
Carried from reviews 1 to 4. The give-up listener adds a path: it runs inside the `.catch` of the library's `restarted` handler, so a throw there would become an unhandled rejection rather than an emitter error. What would settle it: whether `report.problem` can throw (it publishes a snapshot), and whether `main.ts` handles `unhandledRejection`.

### D. Whether threadedclass resolves a call made into a child that then restarts
It decides finding 1's severity. What would settle it: a harness that kills `atemSocketChild` during a `connect` call, or #145's acceptance run with `debug` logging.

## Reviewed and Dismissed
- Two pending connects again at once: `retryLater` returns while `retry` is set, and removing that check turns "connects once per pause when it gives up while a connect again is pending" red.
- A give-up during an in-flight connect that then rejects: the rejection's `retryLater` is skipped because the give-up's timer is pending, so one retry runs, 5 s after the give-up, with the later reason shown.
- The client's offline report before the give-up: `follow(false)` sets `connected` false before any listener runs, so `programInput`, `inputs` and `info` read empty to an offline listener; a later library `disconnected` repeats an idempotent offline report.
- The library left at CONNECTED after a frozen child's give-up, blocking the next `connected`: `InitCompleteCommand` always emits `connected` (`atem.js:179-181`), and a `VersionCommand` resets the state and status.
- A cut that hangs after a frozen child's give-up: the server hands cues and button runs to online targets only (`connections.ts:218-237`), and any connection event empties the adapter's own-cut list.
- The connection listener reporting offline after `stop` when a give-up follows the close: pre-existing for every `disconnected` during `destroy` (review 4's Dismissed list), and the restarted handler does not run after `ThreadedClassManager.destroy`.
- The program line not refreshing on a rename with no program change: accepted by #183's "on the next report".
- An input other than Pro and Camera that the ATEM names "Pro" or "Camera" reading like the configured one: a recorded #183 assumption, reversible, and the pre-service check flags a misconfigured input.
- The pin test reading library source as a prose test: it reads executable code in the installed version, and goes red on a reworded message or a moved emit.

## Minor / nits
- `src/server/atem-switcher.ts:82` strips only a literal `Error: `, so a `TypeError` caught by the restarted handler reads `TypeError: x` on the row where a rejected first connect would read `x.`. the rejections seen so far are plain `Error`s (unverified for every threadedclass path), so the difference is unlikely to show; `/^\w*Error: /` would close it.
- `test/atem-switcher.test.ts:308`: no "other error" row is a near miss, so loosening `startsWith(RESPAWN_RECONNECT_FAILED)` to `includes(...)` survives. A row such as `'MutateState failed: Failed to reconnect after respawning socket process: x'` would pin it.
- `test/atem-switcher.test.ts:334`: when the next `ThreadedClassManager.onEvent(` is missing, `indexOf` returns -1 and the slice runs to the file's end, so the `toContain` checks could match text outside the handler.
- `sentence('')` renders `The ATEM could not connect: .` on both paths: pre-existing, untouched.

## Test quality
Tests added or changed: 18 cases (16 declarations, one `it.each` of 3) in `test/atem.test.ts` and `test/atem-switcher.test.ts`, plus the fake's `respawnFailingReconnect` and `onGaveUp`. Red against `$BASE`: 12, on behaviour or on the missing `onGaveUp`. Green against `$BASE`: 6, all kept: Pro and Camera by their own names (`test/atem.test.ts:500`) and the two number fallbacks (`:512`, `:525`) characterise behaviour #183 keeps, and `:512` kills the `.trim()` mutant; in the respawn describe, "comes online on its own during the pause" (`:743`) and "server stops during the pause" (`:775`) are vacuous at base, which never shows a reason or retries, but kill the retry-cancel mutants at HEAD; "gives up after the server stops" (`:791`) is finding 4. The three "only logs any other library error" rows are red at base only through setup; the behaviour they pin already held. Tautology shapes: 0. The pin test builds its expectation from `RESPAWN_RECONNECT_FAILED` on purpose, to tie the constant to the library, and the behaviour tests use their own literal. No snapshots, no mocked unit under test, no call-shaped-only assertions.

## Before opening the PR
- **CI readiness:** lint, typecheck, unit suites and build green locally; Playwright green (not in CI).
- **Commit hygiene:** two ticket commits and their merges; this doc and its three repro files are the only additions.
- **Likely reviewer asks:** why the give-up is told apart by message text (the library types the event as a bare string; the pin test and finding 3 answer it); what a re-pin in #145 must re-check (the pin test).

## Verdict
Ready to open the PR with follow-ups. Both tickets meet their acceptance criteria, all checks are green, and the four confirmed findings are LOW: one race with no established user path (finding 1, a three-line fix with a held-connect fake) and three test gaps, plus carried comment hygiene. Nothing gates the PR.

## Remediation — 2026-10-22
Scope (Nick, 2026-10-22): findings 1 and 3 only, two LOWs opted in; findings 2, 4 and 5 deferred.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `46bf9d3` setlist-controller#114 pre-PR review 5 finding 1: a connect that resolves after a give-up during it leaves a connect again pending | red→green: permanent test `test/atem.test.ts` "a failed reconnect after the socket process respawns > drops its reason and connects no more once a connect again resolves after it gives up while that connect is in flight", built on the new fake member `holdConnects()` in `test/fake-switcher.ts`: red before the fix (`expected 3 to be 2`), green after. `repro/review-5-giveup-during-connect.test.ts` copied into `test/` and run: green after the fix, the copy deleted. Preserve suites: `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts test/connections.test.ts` (103 passed) | 2 new (the contract of the fake's `holdConnects()`, as on every other `FakeSwitcher` member); 4 reworded, the `connectOnce` comment, whose "clears any reason" the fix made incomplete | proved by execution (LOW, not a shared core) |
| 2 (LOW) | deferred | | | deferred by scope |
| 3 (LOW) | `09b7b7d` setlist-controller#114 pre-PR review 5 finding 3: the pin on the library's give-up text covers the socket, not the Atem that forwards it | red→green by library mutation: in a detached scratch worktree at `46bf9d3` with its own `pnpm install --frozen-lockfile --offline`, `node_modules/atem-connection/dist/atem.js:57` replaced (file unlinked and rewritten, so the store copy stayed intact) to emit `` `socket: ${e}` ``: the pin at `46bf9d3` passed (20 passed, the gap), the extended pin failed (1 failed, 19 passed); green against the installed library: `pnpm exec vitest run test/atem-switcher.test.ts` (20 passed); the scratch worktree removed | 0 new; 2 reworded, the pin test's comment, to name the re-emit it now covers | proved by execution (LOW, test only) |
| 4 (LOW) | deferred | | | deferred by scope |
| 5 (LOW, comment hygiene) | deferred | | | deferred by scope |

Full checks at `09b7b7d`: `pnpm install --frozen-lockfile` (up to date), `pnpm lint`, `pnpm typecheck`, `pnpm test` (51 files, 1091 passed, 4 skipped), `pnpm build`, `pnpm test:e2e` (44 passed), all green.

### Known regressions, deferred
- None.

### Rework briefs
- None: no verify pass ran and no rework was needed.
