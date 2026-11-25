# Pre-PR review: setlist-controller#114 stage 2, re-review of review 3's finding 1 remediation

**Branch:** `setlist-controller-114-atem-lobby-feed` vs `origin/main` (merge-base `1a8089c` "Merge pull request #178 from nick-vogel/setlist-controller-114-atem-lobby-feed")
**Reviewed at:** HEAD `82eabf5` (setlist-controller#114 pre-PR review 3 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 21 files total, +846 / -87 against the merge-base.
**Delta under review:** since `ae19306` (setlist-controller#176 An operator's cut at the ATEM can go unseen after the adapter's own cut), the HEAD `pre-pr-review-3.md` read. 7 files, +294 / -8, of which code: `35e574d` (setlist-controller#114 pre-PR review 3 finding 1: an online report after a rejected connect left the reason on the row, and the retry then dropped the live connection) touching `src/server/atem.ts`, `test/atem.test.ts` and `test/fake-switcher.ts`; the rest is review 3's doc, its repro files and its closure table (`37ac62f`, `82eabf5`).
**Reviewed against:** `pre-pr-review-3.md` (finding 1's brief, its Must preserve and its declared out-of-scope case; its Approach decisions; its remediation closure table, which defers findings 2 and 3 by scope), setlist-controller#175's acceptance criteria as summarised there. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass (an oracle run at `ae19306` and a mutant re-run by the orchestrator)

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, lockfile up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 51 files, 1056 passed, 4 skipped (the Linux-only setup-screen cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| New test against the prior reviewed commit | scratch worktree at `ae19306`, the branch's `test/atem.test.ts` and `test/fake-switcher.ts` copied in, `pnpm exec vitest run test/atem.test.ts` | 1 failed, 52 passed: the new test is red at `ae19306` on behaviour ("expected ... to match object { connection: 'online', problems: [] }") |
| Mutants of the fix, `src/server/atem.ts:180-184` | scratch worktree at `82eabf5`, `pnpm exec vitest run test/atem.test.ts` (finder agent) | killed: the retry cancel removed, the reason clear removed, the reason clear moved after `report.status`. Survived: the reason cleared on every report, offline included (finding 1) |
| Surviving mutant, wider | `repro/review-4-mutation-offline-clears-reason.diff` applied in a scratch worktree at `82eabf5`, `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts test/connections.test.ts` | 85 passed: nothing pins an offline report keeping the reason |
| Other sources of the ATEM's reported problem | `grep -n problem src/server/atem.ts src/server/target.ts` | only `connectOnce` (`atem.ts:151, 155`) and the new listener clear (`:183`); the config problems are separate fields (`connections.ts:157, 183`), so the clear clobbers nothing else |
| Repeated clears | read `src/server/connections.ts:105-114` | `set` drops a change whose `problems` match, so a clear on a normal reconnect publishes nothing |
| Library behaviour (atem-connection 3.10.3) | read `dist/atem.js:58-63`, `dist/lib/atemSocket.js:89-125` | every socket `disconnect` emits `disconnected` with no status check; the socket emits `disconnect` from the child's callback and on `thread_closed`; the `restarted` handler calls `connect()` and on a rejection emits only `error`. `src/server/atem-switcher.ts:43-48` forwards each event with no de-duplication |
| Reworded comments | read against the library source above, and `git grep -n "started no socket"` | the two `atem.ts` comments are accurate; one copy of the old claim remains in `src/server/atem-switcher.ts:12-13` (finding 2) |
| Not run | the real ATEM Mini, Linux CI | no unit here; #145 owns the acceptance run on the real unit |

**Overall:** Review 3's finding 1 is fixed: an online report now cancels the pending retry and clears the reason before the status goes out, the new test is red at the prior reviewed commit, and it is red under each half of the fix and under the clear moved after the status. One new LOW test gap: the brief's "an offline report never clears the reason" is correct in the code and pinned by nothing, because the fake switcher cannot report offline while already offline. One stale comment repeats the claim the fix corrected. Nothing blocks the PR.

## Approach decisions
- Signal handling with the ATEM library (carried from review 1 finding 1): the switcher client removes the SIGINT and SIGTERM listeners the library adds during `connect`, in a `finally`. Unchanged.
- Fake switcher failure modes (carried from review 2): extend `test/fake-switcher.ts` with options, as `failConnects`, `holdEchoes`, `refuseCuts` and `connectOnItsOwn` do, rather than mocking the switcher client with `vi.fn`. Finding 1 follows it: a fake method that reports offline whatever its state, as the library does.
- Own-cut matching (#176, applied in `9921bec`): a report that matches an own cut drops it and every older one (`sent.slice(own + 1)`), a refused cut leaves the list, and any connection event empties it. Unchanged.
- A connect that rejects (#175, applied in `7670d8b`): the adapter shows the reason through `TargetReport.problem` and connects again after `RETRY_MS` with `clock.every` used as a one-shot, cancelled by `stop`. Unchanged.
- Coming online with no connect asked (review 3 finding 1, applied in `35e574d`): the connection listener, on an online report, cancels the pending retry and clears the reason before the status goes out; an offline report leaves the reason alone. The in-flight retry that rejects after an online report stays out of scope, with no `online` flag added. Finding 1 pins the offline half; it changes no production code.

## Prior-review closure
Review 3 had three confirmed findings, all LOW.
- **Finding 1 (LOW): fully fixed** by `35e574d`. Verified against its intent, not its diff: the row drops the reason the moment the ATEM is online, whoever connected it, and the adapter does not reconnect a live ATEM (new test red at `ae19306`; mutants of each half killed). Of its Must preserve list, `sent = []` first, the retry chain, `stop` cancelling the retry, the unreachable case and the `stopped` guards all hold and are pinned; "an offline report never clears the reason" holds in the code but is unpinned (finding 1 below). Its declared out-of-scope case (an in-flight retry that rejects after an online report) is unchanged and still out of scope.
- **Finding 2 (LOW): untouched**, deferred by scope in review 3's closure table ("deferred by scope"). The `stopped` guards and the first-mix-effect filter still have no test; the mutants `repro/review-3-mutation-no-stop-guards.diff` and `repro/review-3-mutation-any-mix-effect.diff` still apply. Its brief in `pre-pr-review-3.md` stands as written.
- **Finding 3 (LOW, comment hygiene): untouched**, deferred by scope. Its three entries are carried into finding 2 below so the doc stands alone.
- No prior finding was "resolved" by a comment or doc edit alone. Prior MEDIUM-or-higher findings left open: 0.

## Confirmed Issues
### 1. Nothing pins that an offline report keeps the ATEM's reason on the row — LOW
- **Location:** `src/server/atem.ts:180-184` (the listener's clear, correct and unpinned), `test/fake-switcher.ts:85-90` (the fake's `report`, which cannot report offline while offline)
- **Attribution:** introduced by `35e574d` (review 3 finding 1's remediation). Before it the listener never touched the reason (`git show ae19306:src/server/atem.ts | grep -n -A8 'onConnection'`), so the guard that an offline report leaves it alone is new behaviour with no test.
- **Real-world trigger:** none while the code stays as it is; the gap is that moving `report.problem(null)` out of the `if (connected)` keeps the suite green. The case it guards is reachable in production: after a connect rejects, the library's socket child can close inside the 5 s pause, and `thread_closed` emits `disconnect` (`atemSocket.js:120-121`), which `atem.js:58-63` turns into `disconnected` with no status check, and `atem-switcher.ts:43-48` forwards with no de-duplication. Under the mutant the row then reads Offline with no reason while a retry is pending, which is the state #175 set out to end. LOW: a test gap, not a defect.

**Evidence** — the clear sits inside the online branch, and the fake's `report` returns before any listener runs when the state does not change:

```ts
        if (connected) {
          retry?.();
          retry = null;
          report.problem(null);
        }
```

```ts
  const report = () => {
    const next = connecting && wantOnline;
    if (next === connected) return;
```

**Failure mode** — `repro/review-4-mutation-offline-clears-reason.diff` (the clear moved after the `if`, so it runs on every report) applied at `82eabf5`: `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts test/connections.test.ts` gives 85 passed. "shows its reason on the row from the first snapshot" (`test/atem.test.ts:547`) does not catch it, since a fake whose connect rejected never reports at all.

**Recommended fix** — give the fake a method that reports offline whatever its state, and add one test:

```diff
   connectOnItsOwn(): void;
+  disconnectsAgain(): void;
   goOnline(): void;
```

```diff
     connectOnItsOwn() {
       connecting = true;
       report();
     },
+    disconnectsAgain() {
+      connected = false;
+      for (const listener of listeners) listener(false);
+    },
```

and in `describe('a connect that rejects')`, beside the test at `test/atem.test.ts:595`: `failConnects(1, SOCKET)`, start the rig with `{ armed: false, online: false, clock: manualClock() }`, call `switcher.disconnectsAgain()`, then assert `atem(await settled())` matches `{ connection: 'offline', problems: [REASON] }`, and after `clock.advance(RETRY_MS)` that `switcher.connects` is 2 (the retry still runs after the offline report). The new fake member gets a one-line contract comment like every other `FakeSwitcher` member, saying it reports offline as the library does when its socket process closes, even while offline already.

**Remediation brief**
- **Design intent:** the reason on the row says why the ATEM could not be reached, and only reaching it ends it: a resolved connect (`atem.ts:151`) or an online report (`:183`). An offline report says nothing about why, so it leaves the reason and the pending retry as they are. The library can report offline any number of times in a row, so the adapter must not treat an offline report as news.
- **Full surface:** `test/fake-switcher.ts:44-51` (the `FakeSwitcher` type) and `:111-118` (the members), `test/atem.test.ts:537-626` (the `describe('a connect that rejects')` block). No production code changes.
- **Must preserve:** the fake's `report` de-duplication, which every other rig test relies on (only the new member bypasses it); every existing test in `test/atem.test.ts`, in particular "drops its reason and connects no more once the ATEM comes online on its own during the pause" and "connects no more once the server stops during the pause".
- **Do not touch:** `src/server/atem.ts:176-190`; the code is correct. The `stopped` guards in `connectOnce` (review 3 finding 2, deferred).
- **Fix's own failure:** none in production; the test must be able to go red, which the proof checks.
- **Proof:** the new test passes at HEAD, then `git apply docs/reviews/setlist-controller-114/repro/review-4-mutation-offline-clears-reason.diff`, `pnpm exec vitest run test/atem.test.ts` must show the new test red, then `git apply -R docs/reviews/setlist-controller-114/repro/review-4-mutation-offline-clears-reason.diff`. If review 3 finding 2 is worked in the same pass, its held-connect option lands in the same `test/fake-switcher.ts` block; keep the two members separate.

### 2. Comment hygiene — LOW (aggregated)
- `src/server/atem-switcher.ts:12-13` (new this round, introduced by `7670d8b`, left behind by `35e574d`, which corrected the same claim in `atem.ts`) — "A connect that rejects started no socket, so nothing in the library retries it; the adapter connects again (atem.ts)." → "A connect that rejects either started no socket, which nothing in the library retries, or failed in a running socket process, which the library may reconnect once that process restarts; the adapter connects again until the ATEM is online (atem.ts)."
- `test/fake-switcher.ts:13-15` (new this round, `35e574d`) — "it stays offline until the test connects it on its own, as the library's restarted socket process can. The test can make it refuse the cuts it is told, as the library\n// does when" → "it stays offline until the test calls connectOnItsOwn, as the library's restarted socket process can connect by itself. The test can make it refuse the cuts it is told, as the library does when", rewrapped so the short line goes.
- `web/src/styles.css:583-584` (carried from review 3 finding 3) — "each target's label, whether it is online, and its pre-service check or its problems." → "each target's label, whether it is online, its pre-service check and any problem it reports reaching it, or, for a target the file disabled, its problems."
- `test/fake-switcher.ts:15-16` (carried from review 3 finding 3) — "as the library does when the ATEM does not take a command: a refused cut rejects" → "as the library does when it cannot send a command, such as with no socket process open: a refused cut rejects". The library has no refusal from the ATEM: `sendUnprioritizedCommands` settles every ack with `Promise.allSettled`, and `changeProgramInput` rejects only when `sendCommands` throws "Socket process is not open".
- `README.md:47` (carried from review 3 finding 3), after the sentence "A target that matches no names checks its own device instead, ...": add "A target that cannot reach its device says why on its row and on the setup screen, online or offline, such as an ATEM whose connect failed, which the server tries again every 5 seconds until it connects."

## Needs Further Investigation
### A. Whether the ATEM answers a cut to the input already on program
Carried from reviews 1 to 3, unchanged. What would settle it: #145's acceptance run on the church's ATEM Mini, with `debug` logging of received commands during a Count Off while Camera is on program.

### B. Whether any ATEM reports a camera or video input with port type ExternalDirect
Carried from review 3, unchanged (`src/server/atem-switcher.ts:91`). What would settle it: the port types the real unit reports, in #145's acceptance run.

### C. Whether an exception thrown from a connections callback inside a library event escapes into threadedclass
Carried from reviews 1 to 3. The new listener clear adds one more callback on the same path.

### D. A failed reconnect after the socket process restarts leaves the ATEM offline with no reason and no retry
Raised by the finder, not executed. When the library's `restarted` handler calls `connect()` and that rejects, the library emits only `error` (`atemSocket.js:114-118`): the adapter logs it, shows Offline with no reason, and never connects again, since its retry follows only its own rejected connects. Pre-existing, untouched: the same holds on the base for any connect that resolved, and `35e574d` adds only the case where the restart follows an adapter retry it cancelled. What would settle it: a fake or a library-level harness that rejects the restarted handler's connect, and whether the library's child then retries by itself; worth a follow-up ticket if it does not, since it is #175's symptom by another path.

## Reviewed and Dismissed
- The online clear clobbering another problem — the ATEM's only reported problem is the connect reason; config problems are separate fields (`connections.ts:157, 183`).
- Snapshot churn from clearing on every reconnect — `set` drops an unchanged `problems` (`connections.ts:105-114`).
- An online report after `stop()` reconnecting — `retry` is null after `stop`, so no connect follows; `destroy()` leads to `disconnect`, never `connected`. The listener's report after stop is pre-existing for `status` (review 3 nit on `startConnections`).
- The clear before the status giving an "offline, no reason" intermediate snapshot — it is the intended order (review 3's brief), and the mutant that swaps them is killed by the new test.
- `connectOnItsOwn` not counting in `connects` or recording `host` — intended, since it stands for a connect the adapter did not ask for; the new test's `connects: 1` depends on it.
- The reworded `atem.ts:41-43` and `:87-93` comments — accurate against `atemSocket.js` (a rejected `_createSocketProcess` leaves no process and nothing retries; a rejected child call with `autoRestart` reconnects through `restarted`).

## Minor / nits
- The new test (`test/atem.test.ts:595`) rejects with `SOCKET`, "Could not start the socket process", the one cause after which the library never comes online by itself; the case it models is a failed call into a running process. A second constant such as "The socket process stopped answering" would read truer. Behaviour under test is unaffected.

## Test quality
Tests added in the delta: 1 ("a connect that rejects > drops its reason and connects no more once the ATEM comes online on its own during the pause"). Red at `ae19306` on behaviour: 1. Green at `ae19306`: 0. Mutants killed: the retry cancel removed, the reason clear removed, the clear moved after the status. Tautology shapes found: 0: nothing under test is mocked (the fake switcher stands for the library, per the Approach decision), the expectations are literals, and the assertions read the producer's snapshot and the fake's connect count. The one gap is the surviving offline mutant in finding 1.

## Before opening the PR
- **CI readiness:** lint, typecheck, unit suites and build green locally; Playwright green (not in CI).
- **Commit hygiene:** review 3's remediation is one finding commit plus the closure table; this doc and `repro/review-4-mutation-offline-clears-reason.diff` are the only additions.
- **Likely reviewer asks:** why an online report clears the reason but an offline one does not (finding 1's test answers it); what happens when the library's own reconnect after a restart fails (D).

## Verdict
Ready to open the PR with follow-ups. Review 3's finding 1 is fully fixed and proved; findings 2 and 3 remain open by Nick's scope decision, not by omission. This round's confirmed count is two LOWs, a test gap on the fix just landed and comment hygiene, against review 3's three: the list is shrinking toward tests and comments, which is the branch converging, not a reason to hold it. Nothing gates the PR; finding 1 is one fake member and one test, worth taking alongside review 3 finding 2 since both extend the same fake.
