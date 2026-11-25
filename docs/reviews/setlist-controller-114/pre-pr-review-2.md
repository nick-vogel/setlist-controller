# Pre-PR review: setlist-controller#114 ATEM: the lobby feed cuts to Camera at each Count Off

**Branch:** `setlist-controller-114-atem-lobby-feed` vs `origin/main` (merge-base `fe40b98` "Merge pull request #167 from nick-vogel/setlist-controller-113-connections-foundation")
**Reviewed at:** HEAD `03adc60` (setlist-controller#114 pre-PR review 1 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 25 files total, +1825 / -21 against the merge-base
**Delta under review:** since `dcb7d67` (setlist-controller#143 ATEM pause by hand: a cut in ATEM Software Control pauses automation), the HEAD that `pre-pr-review-1.md` reviewed. 8 files, +362 / -1, of which 3 are code: `src/server/atem-switcher.ts`, `test/atem-switcher-signals.test.ts` (new), `test/atem-switcher.test.ts`. The rest is review 1's doc and repro files. Commits: `8d218ca` (pre-PR review 1), `7a9e3bc` (pre-PR review 1 finding 1: once the ATEM connects, the library's exit-hook takes over SIGTERM and SIGINT, so the server's own close never runs), `03adc60` (closure table).
**Reviewed against:** `pre-pr-review-1.md` (finding 1's intent, its Approach decisions and its closure table), the epic setlist-controller#114 as distilled there. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Round 2, delta-scoped.
**Date:** 2026-10-21
**Reviewer:** 1 code-review agent + verify pass (base-oracle runs, mutants and one executed repro by the orchestrator)

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 51 files, 1005 passed, 4 skipped (the Linux-only setup-screen refusal cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| New tests against `$LAST_REVIEWED` | scratch worktree at `dcb7d67`, the branch's `test/atem-switcher-signals.test.ts` and `test/atem-switcher.test.ts` copied in | both new tests red (2 failed, 11 passed): the child test `{ code: 143, closed: false }`, the stub test `expected [ [Function library] ] to not include [Function library]` |
| Mutants of the fix, `src/server/atem-switcher.ts` | same scratch worktree with HEAD's file, `pnpm exec vitest run test/atem-switcher-signals.test.ts test/atem-switcher.test.ts` each | killed: strip every SIGINT and SIGTERM listener, not only new ones (1 red); removal only after a resolving connect, no `finally` (1 red); `SIGNALS` narrowed to SIGTERM (1 red). Adding `'exit'` to `SIGNALS` survives the tests but fails `pnpm exec tsc` (`'exit'` is not a `Signals`), so the type pins it |
| Library behaviour across connects | the finder ran the child script with HEAD's wrapper against the real library at 127.0.0.1 and counted listeners | SIGINT 0 and SIGTERM 0 after connect, 2.5 s later (past the library's reconnect interval), after `close()`, on a second connect after a destroy, and on a connect raced with `close()` (rejects "Disconnecting"); `exit` 1 throughout. exit-hook@2.2.1's `isRegistered` is module level and its unsubscribe never resets it, so no later `exitHook()` re-adds signal listeners. Neither library reconnect path calls `_createSocketProcess` |
| Call sites of `connect` | `git grep -n "connect(" src/server` and `src/server/server.ts:225` | `switcher.connect` is called once per ATEM target, from `src/server/atem.ts:137`, under the single `connections.start()`; `main.ts:89-96` adds its handlers after `startServer` resolves |
| threadedclass exit handling | read `threadedclass@1.4.1` `dist/js/threadedClass.js:1089-1151`; `git grep -n "uncaughtException\|unhandledRejection\|handleExit" -- src test e2e scripts` | AUTO mode registers its own process-ending handlers only when `exit`, `uncaughtException` and `unhandledRejection` all have listeners at the first connect; nothing in the repo registers the last two. See Minor / nits |
| Finding 1 (hang on a child that never reports ready) | `repro/review-2-hang-child.diff` applied in a scratch worktree at HEAD, then `pnpm exec vitest run test/atem-switcher-signals.test.ts` | red: the test times out at 3000 ms, then the child stays alive and vitest does not exit for over two minutes, until the child is killed by hand |
| Recommended fix 1 | applied in the same scratch worktree, with and without the hang diff | with the hang: vitest exits after 3 s with the timeout failure and the child is gone; without it: 1 passed, `eslint` and `tsc` clean |
| Not run | Linux CI, the real ATEM Mini | local Node is v26.3.0, CI is linux-x64 on Node 24; no unit here, #145 owns the acceptance run |

**Overall:** Review 1's one gate is closed. The switcher client now strips the SIGINT and SIGTERM listeners the library's exit-hook adds during `connect`, the server's own shutdown runs to the end, and both new tests go red at the reviewed commit and when the fix is weakened. One new LOW, in the new child-process test: when its child never reports ready, the test times out but the child keeps running and holds the whole vitest run open. Review 1's four LOW findings stay open, deferred by decision, and are carried forward below. Nothing here blocks the PR.

## Approach decisions
- Signal handling with the ATEM library (review 1 finding 1, applied in `7a9e3bc`): the switcher client, the only module that imports `atem-connection`, removes the SIGINT and SIGTERM listeners the library added during `connect`, by comparing `process.listeners(signal)` before and after, in a `finally`, so `main.ts` keeps sole ownership of shutdown. The library's `exit` listener stays. Rejected: removing listeners in `main.ts`, and a `pnpm patch` of the library. Not adopted this round: setting threadedclass's `handleExit` to `NO` (see Minor / nits); the repo does not depend on threadedclass directly, and its AUTO mode is not reached.
- Fake switcher failure modes (finding 2): extend `test/fake-switcher.ts` with options, as it already has `online`, `program`, `inputs` and `info`, rather than mocking the switcher client with `vi.fn`.
- Child processes in tests (finding 1, new): a test that spawns a child kills it when the test finishes, whatever the outcome, with vitest's `onTestFinished`. The nearest precedent, `test/contract.test.ts:186`, signals its child on a fixed timer, so it cannot leave it waiting; this test must signal on `ready`, so the kill moves to the test's teardown instead.

## Prior-review closure
Review 1 had five confirmed findings. Fully fixed: 1 (finding 1, MEDIUM, proved above by the base-oracle run and the mutants). Partially fixed: 0. Untouched: 4, all LOW and all deferred by decision in review 1's closure table ("— deferred ... LOW tail, not worked this round"): finding 2 (failure paths untested), finding 3 (own-cut list), finding 4 (library-load fallback untested), finding 5 (comment hygiene). They are carried forward as findings 2 to 5 here, labelled known and deferred, and re-checked: no file they name changed in the delta, so their locations hold. No prior finding was "resolved" by editing only a comment or a doc. One finding this round (finding 1) was introduced by the remediation commit itself, in its new test.

## Confirmed Issues
### 1. The signal test leaves its child running when the child never reports ready, and the whole test run then never finishes — LOW
- **Location:** `test/atem-switcher-signals.test.ts:22-32`
- **Attribution:** introduced by `7a9e3bc` (setlist-controller#114 pre-PR review 1 finding 1), which added the file; `git log --oneline -S'atemSwitcher();' fe40b98..HEAD -- test/atem-switcher-signals.test.ts` names it.
- **Real-world trigger:** any change that makes the child's `connect` hang or never reach `console.log('ready')`: a library upgrade whose worker never comes up, a CI runner where the worker thread stalls, or a later edit to `CHILD`. The test then fails on its 20-second timeout, which is right, but the child keeps its worker thread, UDP socket and reconnect interval alive, and vitest waits on it, so `pnpm test` hangs instead of reporting the failure: locally until someone kills it, on CI until the job's timeout. LOW: there is no user path, only a developer and CI one.

**Evidence**

```ts
const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD, wrapper], { stdio: ['ignore', 'pipe', 'inherit'] });
let out = '';
let signalled = false;
child.stdout.on('data', (chunk: Buffer) => {
  out += chunk.toString();
  if (signalled || !out.includes('ready')) return;
  signalled = true;
  child.kill('SIGTERM');
});
```

The only `kill` waits for `ready`; nothing kills the child when the test ends another way.

**Failure mode** — executed: `repro/review-2-hang-child.diff` makes the child hang after `connect` (and shortens the timeout to 3 s). With it, the test fails with "Test timed out in 3000ms", then the child stays alive and the vitest process does not exit for over two minutes, until the child is killed by hand.

**Recommended fix**

```diff
--- a/test/atem-switcher-signals.test.ts
+++ b/test/atem-switcher-signals.test.ts
@@ -1,5 +1,5 @@
 import { spawn } from 'node:child_process';
-import { expect, it } from 'vitest';
+import { expect, it, onTestFinished } from 'vitest';
@@ -21,6 +21,7 @@ it("lets the server's own SIGTERM handler finish its close once the ATEM has connected", async () => {
   const wrapper = new URL('../src/server/atem-switcher.ts', import.meta.url).pathname;
   const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD, wrapper], { stdio: ['ignore', 'pipe', 'inherit'] });
+  onTestFinished(() => void child.kill('SIGKILL'));
   let out = '';
```

**Remediation brief**
- **Design intent:** the child exists only to prove that, once the real library has connected, the process's own SIGTERM handler runs to the end and exits 0. The parent sends SIGTERM only after the child prints `ready`, so the handler is in place first. Whatever happens, the child must not outlive the test.
- **Full surface:** `test/atem-switcher-signals.test.ts:2` (the import) and `:23` (one line after `spawn`). No other test in the delta spawns a child. `test/contract.test.ts:186` is the precedent and does not change.
- **Must preserve:** the SIGTERM sent on `ready` and the assertion `{ code: 0, closed: true }` (the test must still go red at `dcb7d67`: copy it into a checkout of that commit and it fails with `{ code: 143, closed: false }`); the 20-second timeout; `stdio: ['ignore', 'pipe', 'inherit']`. `child.kill` on a child that already exited returns false and throws nothing, so the teardown is safe on the passing path. The fix's own failure: if SIGKILL cannot be delivered, nothing else reaps the child, and the CI job's `timeout-minutes` stays the backstop.
- **Do not touch:** `src/server/atem-switcher.ts` (the fix is right; see Reviewed and Dismissed).
- **Proof:** `git apply docs/reviews/setlist-controller-114/repro/review-2-hang-child.diff && pnpm exec vitest run test/atem-switcher-signals.test.ts` now times out and then never exits (stop it with Ctrl-C and `pkill -f "input-type=module"`); after the fix it fails on the timeout and exits within a few seconds, and `pgrep -f "input-type=module"` prints nothing. Then `git apply -R docs/reviews/setlist-controller-114/repro/review-2-hang-child.diff` and `pnpm exec vitest run test/atem-switcher-signals.test.ts` passes.

### 2. The cut and connect failure paths have no test, and the fake switcher cannot fail — LOW (known, deferred)
- **Location:** `src/server/atem.ts:97` (`switcher.changeProgramInput(input).catch(failed(what))`), `src/server/atem.ts:136-140` (the `connect` catch), `test/fake-switcher.ts:63` and `:78`
- **Attribution:** introduced by `4db4b29` (setlist-controller#141), carried by `fe60bc9` (#142). Deferred in review 1's closure table: "LOW tail, not worked this round (eng-pipeline#34)". Untouched in the delta.
- **Real-world trigger:** none today; the code is right. It guards the worst consequence in the epic: a cut with no `.catch` whose promise rejects is an unhandled rejection, which ends a Node 24 process, so playback stops mid-song. LOW.

**Evidence** — `repro/review-1-mutation-cut-no-catch.diff` and `repro/review-1-mutation-connect-rethrows.diff` each leave `test/atem.test.ts` and `test/atem-switcher.test.ts` green.

**Recommended fix** — give `fakeSwitcher` two options in its existing options object, `failConnect?: Error` (its `connect` rejects with it after recording the host) and `failCuts?: Error` (its `changeProgramInput` records the input in `programs`, then rejects with it), and add three tests to `test/atem.test.ts` in its rig style: a connect that fails leaves the ATEM row offline while the fake target still starts and the server answers; a Count Off cut that rejects leaves the row and its arm state as they were and the server serving the next snapshot; a button press that rejects does the same. Spy on `console.error` with `vi.spyOn` and assert `Setlist server: the ATEM could not connect to <host>` and `Setlist server: the ATEM could not cut to Camera` (and `cut to Pro`).

**Remediation brief**
- **Design intent:** every promise the adapter starts and does not await is caught where it starts, so one bad ATEM never stops the server or another target. `cut` is the single place every cut goes through.
- **Full surface:** `test/fake-switcher.ts:33-38` (options and defaults), `:63` (`connect`), `:78` (`changeProgramInput`), its header comment at `:3-11`; new tests in `test/atem.test.ts`. No production change.
- **Must preserve:** the fake's defaults (online, program 1, inputs 1 to 4, the ATEM Mini info), its recording of every program change in `programs` (relied on at `test/atem.test.ts:355`), and `holdEchoes` / `releaseEchoes` for the window tests at `:276` and `:290`.
- **Do not touch:** `src/server/atem.ts:97` and `:136-140`.
- **Proof:** with the new tests in place, `git apply docs/reviews/setlist-controller-114/repro/review-1-mutation-cut-no-catch.diff && pnpm exec vitest run test/atem.test.ts` goes red, then `git apply -R` it; the same for `review-1-mutation-connect-rethrows.diff`.

### 3. The own-cut list can keep cuts the ATEM will never answer one by one, and its per-input matching has no test — LOW (known, deferred)
- **Location:** `src/server/atem.ts:101-107` (`ownCut`), `src/server/atem.ts:119-125` (the connection listener, which keeps `sent`)
- **Attribution:** introduced by `e36ae4c` (setlist-controller#143). Deferred in review 1's closure table. Untouched in the delta.
- **Real-world trigger:** the library emits one `stateChanged` per received packet with only the final state. When the producer presses Pro then Camera quickly and the ATEM answers both in one packet, the Pro entry stays in `sent` for 2 seconds, and an operator cut to Pro at the ATEM inside that window is read as the adapter's own and does not pause. The same leftover follows a cut lost to a disconnect. LOW.

**Evidence** — `ownCut` removes only the matching entry (`if (own >= 0) sent.splice(own, 1);`), and `repro/review-1-mutation-own-cut-any-input.diff` (match any pending cut) survives all of `test/atem.test.ts`.

**Recommended fix** — in `ownCut`, when a report matches the entry at index `own`, drop every entry up to and including it (`sent = sent.slice(own + 1)` in place of the `splice`), since the ATEM applies commands in order; and clear `sent` in the connection listener on both connect and disconnect (`sent = []` beside `known = ...`). Add two tests beside the window tests: with `holdEchoes()`, press Camera, then `cutAtSwitcher(4)` before `releaseEchoes()`, and the ATEM pauses by hand; with `holdEchoes()`, press Pro then Camera, release, then `cutAtSwitcher(PRO)` inside the window, and the ATEM pauses by hand.

**Remediation brief**
- **Design intent:** a program report is the adapter's own when it matches a cut the adapter sent within the last 2000 ms, by input, oldest first; any other report of an input other than the one on program is a change by hand, reported after the row's new line. The window only bounds a cut whose report never comes.
- **Full surface:** `src/server/atem.ts:104-105`, `src/server/atem.ts:120-124`; new tests in `test/atem.test.ts` after `:290`.
- **Must preserve:** the late-echo pair at `test/atem.test.ts:276` (1999 ms is own) and `:290` (2001 ms is by hand); "is never the ATEM's own cuts" at `:251`; "is never a cut made at the ATEM to the input already on program" at `:268`; recording a cut before it is sent (`atem.ts:96`).
- **Do not touch:** the `input !== known` guard at `atem.ts:131` (Reviewed and Dismissed in review 1).
- **Proof:** the two new tests are red now and green after; `git apply docs/reviews/setlist-controller-114/repro/review-1-mutation-own-cut-any-input.diff && pnpm exec vitest run test/atem.test.ts` goes red after, then `git apply -R` it.

### 4. A library that fails to load disables the ATEM with no test of it — LOW (known, deferred)
- **Location:** `src/server/main.ts:46-55` (`loadAtemKind`)
- **Attribution:** introduced by `4db4b29` (setlist-controller#141). Deferred in review 1's closure table. Untouched in the delta.
- **Real-world trigger:** a playback Mac whose Node cannot load the library's native prebuild (`@julusian/freetype2`). The code handles it; nothing pins that it does. LOW.

**Evidence** — `git grep -n "could not be loaded\|loadAtemKind" -- test e2e` finds nothing; `loadAtemKind` lives in `main.ts`, which starts the server at top level, so no test can import it there.

**Recommended fix** — move `loadAtemKind` into `src/server/atem.ts` (or a small module beside it) with the loader injected, `loadAtemKind(load: () => Promise<{ atemSwitcher: () => SwitcherClient }> = () => import('./atem-switcher.ts'))`, call it from `main.ts` unchanged in effect, and add a test that passes a rejecting loader and starts the rig with `test/fixtures/connections/atem.json` plus a fake target, asserting the ATEM row is not configured with `The ATEM library could not be loaded: <message>` and the fake target still starts, in the shape of the "a bad ATEM section" test at `test/atem.test.ts:521`.

**Remediation brief**
- **Design intent:** the library loads only by dynamic import, so the server module and every rig test stay clear of its native package; a load failure disables the ATEM alone, with the reason on its row.
- **Full surface:** `src/server/main.ts:43-59`, the new home of `loadAtemKind`, a new test in `test/atem.test.ts`.
- **Must preserve:** the default loader stays a dynamic `import('./atem-switcher.ts')` inside the function, so importing `atem.ts` never loads the library; the `console.error` line and the problem's wording.
- **Do not touch:** `openMidiInput` in `main.ts`; it is the precedent and outside this epic.
- **Proof:** the new test passes; replace the fallback's `create` with one that throws and it goes red.

### 5. Comment hygiene — LOW (aggregated, known, deferred)
- `docs/install.md:237` — "No kind of target ships yet, so for now any section names a kind the server does not know. The kinds arrive with the epics that build each target." → "The ATEM is the one kind that ships, keyed `atem`. The other kinds arrive with the epics that build each target."
- `src/server/main.ts:43-44` — "so the server module and every test stay clear of its native package" → "so the server module and every rig test stay clear of its native package"
- `test/atem-switcher.test.ts:7-8` — "Its state is the library's own empty state, set as the library sets it." → "Its state is undefined until a test sets it, then the library's own state from `AtemStateUtil.Create()`; the library itself starts with an empty state, which the client's `connected` guard hides."

## Needs Further Investigation
### A. Whether the ATEM answers a cut to the input already on program
Carried from review 1, unchanged. If the hardware sends nothing for a cut that changes nothing, the cut's entry sits in `sent` for 2 seconds; the only report it can then absorb is one of the input already chosen. What would settle it: #145's acceptance run on the church's ATEM Mini, with `debug` logging of received commands during a Count Off while Camera is on program. It matters only to the reach of finding 3.

### B. Whether an exception thrown from a connections callback inside a library event escapes into threadedclass
Carried from review 1, unchanged. What would confirm it: a fake connections report that throws, driven through the real wrapper over the library's emitter.

### C. Whether the child-process test runs on Linux CI under Node 24
The child imports the `.ts` wrapper by type stripping (its only repo import is `import type`), sends UDP to 127.0.0.1:9910 from an unconnected socket (no ECONNREFUSED on Linux), and the library's native prebuild already loads in CI through `test/atem-switcher.test.ts`. Not run here: local Node is v26.3.0. What would settle it: the branch's first CI run.

## Reviewed and Dismissed
- A signal inside the fix's own window (finder F1): exit-hook adds its listeners inside `_createSocketProcess` and the `finally` removes them about a millisecond later. `connect` runs only under `startServer`, before `main.ts:89-96` adds its handlers, so a signal in that window meets a process with no handler of its own, where exiting is the expected outcome anyway.
- Signal listeners re-added on reconnect or a later connect: exit-hook registers its signal listeners once per process (`isRegistered` is never reset), and neither library reconnect path calls `_createSocketProcess`; the finder's listener counts held at 0 across the reconnect interval, a destroy and second connect, and a connect raced with `close()`. Do not move the removal into a long-lived watcher.
- The stub test's mechanism: it adds its listeners with `process.once`, `process.listeners` returns the unwrapped functions, and `process.off` with the original removes the once wrapper, which is how the real exit-hook listeners are removed. Its `finally` leaves no listener on the vitest worker.
- The `exit` listener left in place: required by review 1's Must preserve, and adding `'exit'` to `SIGNALS` fails `tsc`.
- A connect that rejects: the `finally` removes the listeners and the rejection still reaches `atem.ts:136-140`, pinned by the stub test.
- Review 1's dismissals stand unchanged (connection events and state, listener leaks on reconnect, `PROGRAM_PATH`, input numbers, stale own-cut entries matching the input already chosen, a cut dropped by a disconnect, mix effect 0, `PreServiceCheck` consumers, e2e ports, negative assertions, the pin).

## Minor / nits
- `src/server/atem-switcher.ts:30` with `threadedclass@1.4.1` `dist/js/threadedClass.js:1098-1148`: in its default AUTO mode, threadedclass registers its own handlers for `exit`, SIGINT, SIGTERM, SIGHUP, SIGUSR1, SIGUSR2, `uncaughtException` and `unhandledRejection`, each calling `process.exit()`, but only when the process already has listeners for `exit`, `uncaughtException` and `unhandledRejection` at the first connect. The fix would strip its SIGINT and SIGTERM, not the rest. Nothing in the repo registers `uncaughtException` or `unhandledRejection` today (`git grep` finds none), so it is not reached. If a later change adds those listeners, set `ThreadedClassManager.handleExit = RegisterExitHandlers.NO` before the first connect, which needs `threadedclass` as a direct dependency.
- `src/server/atem-switcher.ts:53`: the comment could add that exit-hook adds its signal listeners once per process, on the first connect, which is why stripping them in `connect` is enough.
- `test/atem-switcher.test.ts:173-197`: the resolving connect is covered only by the real-library child test; a stubbed resolving case beside the rejecting one would keep the success path covered if the child test is ever skipped.
- On the first connect threadedclass prints "ThreadedClass (<id>) Skipping exit handler registration as no exit handler is registered" to the server's log (pre-existing since `4db4b29`). exit-hook's PM2 `message` listener stays; it acts only with an IPC channel, which launchd does not give.
- Review 1's nits stand: the untrimmed `section.host` (`atem.ts:58`), `??` on `productIdentifier` (now `atem-switcher.ts:75`), the protocol shown as firmware (now `atem-switcher.ts:81-87`), the Fade out test's redundant last assertion, the section table's uneven bad-value cases, the Refresh-while-playing test, `CheckResult`'s `kind ===` chain, the unasserted `check-status` class, the unpinned row-before-pause order, and no offline-cut-then-reconnect test.

## Test quality
Tests added in the delta: 1 in `test/atem-switcher-signals.test.ts` (a child process on the real library), 1 in `test/atem-switcher.test.ts` (a stub). Green against `$LAST_REVIEWED` (`dcb7d67`): 0; both are red there. Against `$BASE` neither can import, so the reviewed commit is the oracle. Tautology shapes: none (the unit is the real wrapper in both, the expectations are literals, the assertions are on the exit code, the printed line and the process's listener lists). Mutants: three of four killed by the tests, the fourth by the type check. One hygiene defect in the child test (finding 1).

## Before opening the PR
- **CI readiness:** lint, typecheck, unit suite and build green at `03adc60`; Playwright green locally. Watch the first CI run for the child-process test on Node 24 (Needs Further Investigation C).
- **Commit hygiene:** this doc and `repro/review-2-hang-child.diff` are review artefacts, committed alone.
- **Likely reviewer asks:** the ATEM's config section and install steps in `docs/install.md` (#145's), a test of the library-load fallback (finding 4), and the real-unit acceptance run (#145).

## Verdict
Ready to open the PR, with follow-ups. No gate: review 1's gate (the signal takeover) is fixed and proved, and every open finding is LOW. Finding 1 is a one-line test teardown and can ride along; findings 2 to 5 were deferred by decision in round 1 and remain follow-up material. Of review 1's five findings, 1 was fixed and 4 were left open on purpose; none was "resolved" by a comment or doc edit. The confirmed count shrank from five to one new finding, which is what a converging branch looks like.
