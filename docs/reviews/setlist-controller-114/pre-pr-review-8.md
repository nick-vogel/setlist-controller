# Pre-PR review: setlist-controller#114 run 4, the review 7 remediation of setlist-controller#193

**Branch:** `setlist-controller-114-atem-lobby-feed` vs `origin/main` (merge-base `0ffec22` "Merge pull request #194 from nick-vogel/setlist-controller-114-atem-lobby-feed")
**Reviewed at:** HEAD `cbb8522` (setlist-controller#114 pre-PR review 7 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 9 files total, +884 / -72 against the merge-base.
**Delta under review:** since `db46575` (setlist-controller#193 A restart of the ATEM's socket process that fails outright leaves it offline, with no reason and no retry), the HEAD that pre-PR review 7 covered: 6 files, +342 / -25. Code: `src/server/atem-switcher.ts`, `test/atem-switcher.test.ts`, `test/atem-switcher-restart.test.ts` (commits `eee4586` finding 1 and `4c6af0f` finding 2); the rest is review 7's doc and its two repros.
**Reviewed against:** setlist-controller#193 (its acceptance criteria), the epic setlist-controller#114, pre-PR review 7's findings 1 and 2 and their intent, and its Approach decisions. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | clean |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration suites | `pnpm test` | red on run 1: 2 timeouts (5000 ms) in `test/set-builder-plan.test.ts:207` and `:868`, a file this branch does not touch, run beside a mutation run and a finder agent; green on the retry 60 s later: 54 files, 1150 passed, 4 skipped. A flake under load |
| Build | `pnpm build` | green |
| End-to-end | `pnpm test:e2e` | red on run 1: `[chromium-android] e2e/producer.spec.ts:84` timed out at 30 s (no web code in the delta); green on the retry: 44 passed. A flake under load |
| The delta's tests at `db46575` | HEAD's `test/atem-switcher.test.ts` and `test/atem-switcher-restart.test.ts` run in a scratch worktree at `db46575` | the 3 new or changed tests red, the other 29 green |
| Mutation check | 4 mutants of `src/server/atem-switcher.ts` at HEAD in a scratch worktree, over `test/atem-switcher.test.ts test/atem-switcher-restart.test.ts test/atem.test.ts test/atem-switcher-signals.test.ts` | all killed (see Test quality) |
| Other calls into a lost `Atem` | read `src/server/atem-switcher.ts:129-165`, `src/server/atem.ts:128-136, 228-248`, `src/server/connections.ts:276, 290` | none reachable: `changeProgramInput` comes only from the adapter's `cut`, which connections calls only while the row is online; `state()` and everything on it is gated by `connected`, which `giveUp` clears |
| Lost close leaves nothing running | finder's probe: the child-process test's script with its `process.exit(0)` replaced by a watchdog | the child exits by itself about 500 ms after `close()` resolves |
| `close()` during a restart that then fails | executed repro `repro/review-8-close-mid-restart.test.ts` in a scratch worktree at HEAD, 3 runs | `closed: 'rejected'` on all 3, then `gaveUp: 'init refused'`: finding 1 |
| Real ATEM | not run | no ATEM on this Mac; acceptance on the church's unit is #145 |

**Overall:** Both of review 7's fixes hold against their intent. A server stop while the Atem is lost resolves at once, every failed restart logs one line, and the client never calls into a lost `Atem` on any reachable path. Each fix has a unit test and a child-process test that go red when it is reverted. One LOW residual is left, and it predates the branch: a stop in the second or so while threadedclass is still trying the restart rejects as before. It is the fourth change to the same lost-`Atem` path, so it belongs in a follow-up ticket. Ready to open the PR.

## Approach decisions
- Signal handling with the ATEM library (review 1 finding 1): unchanged.
- Fake switcher failure modes (review 2): extend `test/fake-switcher.ts` with options and methods, never `vi.fn` mocks of the switcher client. Unchanged.
- Own-cut matching (#176), a connect that rejects (#175), coming online with no connect asked (review 3 finding 1), a failed reconnect after a respawn (#184), a connect that resolves (review 5 finding 1), cancelling the pending connect again (review 6 finding 1), the program line (#183): unchanged.
- Hearing a failed restart (#193, `fc708ae`, narrowed in `f31efc6`): `ThreadedClassManager.onEvent` on the private `atem.client.socket._socketProcess`; only an `error` between the proxy's `thread_closed` and `restarted` is a failed restart. Unchanged.
- The lost `Atem`'s clean-up (review 7 findings 1 and 2, `eee4586`, `4c6af0f`): the client never calls into a lost `Atem` again, `destroy` included, and `close()` on a lost `Atem` resolves at once. Unchanged and confirmed.
- A `close()` while the socket process is down (new, finding 1): not fixed in place. It is the fourth change to the lost-`Atem` path, so it goes to a split ticket. That ticket should let `close()` wait for the down window to end, and bound the wait (see the brief).

## Confirmed Issues
### 1. A server stop while threadedclass is still trying to restart the ATEM's socket process rejects, even when that restart then fails — LOW
- **Location:** `src/server/atem-switcher.ts:144`
- **Attribution:** pre-existing, untouched in kind. At `0ffec22`, `close: () => atem.destroy()` (`git show 0ffec22:src/server/atem-switcher.ts`, line 97) destroys the same down socket process and rejects the same way, by reading (the repro needs the give-up the base does not have). Review 7's fix (`eee4586`) covers the lost state, after the restart's error. It does not cover the window before that error, and it never claimed to. Not a regression of the remediation.
- **Real-world trigger:** the socket process crashes or freezes, and Nick stops the server (`launchctl bootout` sends SIGTERM, or Ctrl-C) while threadedclass's one restart is under way. For a restart that fails, that is up to its restart timeout (`Timeout when trying to restart after 1000`). User path: two unlikely events within about one second. LOW, capped: what is lost is the rest of the server's shutdown (the lateness log's queue, the hub, the Live bridge, the HTTP close), not playback. Upgrade only if a fault is seen to make the socket process crash in a loop, which would widen the window.

**Evidence**
```ts
close: () => (current.lost ? Promise.resolve() : current.atem.destroy()),
```
`lost` is set only in the hook's listener (`:122-127`), which threadedclass calls when the restart fails (`manager.js:710`), not when the process goes down.

**Failure mode** — the process dies, threadedclass emits `thread_closed` and starts the restart. A `close()` 100 ms later sees `current.lost` false and calls the library's `destroy()`. Its `disconnect()` rejects at once with `Error: Child instance instance_..._atem-connection is not initialized`. Then the restart fails and the client gives up (`init refused`), so nothing was alive to close anyway. The rejection runs up as in review 7 finding 1: the adapter's `stop` (`src/server/atem.ts:228-232`), `connections.stop`'s `Promise.all` (`src/server/connections.ts:257`), `server.close()` (`src/server/server.ts:251`), and `main.ts:99` exits in its `.finally` before the log, hub, Live bridge and HTTP close run. Proved by `repro/review-8-close-mid-restart.test.ts`: `closed: 'rejected'` on 3 of 3 runs, then `{ gaveUp: 'init refused' }`. The finder saw the same with the close right after the kill: `Method "disconnect()" aborted due to: Child process ...`. A close in the window of a restart that succeeds rejects too, and that restarted socket process then keeps the process running. That half is also pre-existing.

**Recommended fix** — a split ticket, not an in-place change on this branch (see Escalation). The mechanism it should take:
```diff
-export type SocketProcessErrors = (atem: AtemLike, listener: (error: unknown) => void) => boolean;
+export type SocketProcessErrors = (atem: AtemLike, listener: (error: unknown) => void, down: (isDown: boolean) => void) => boolean;
```
`librarySocketProcessErrors` calls `down(true)` on `thread_closed` and `down(false)` on `restarted`. The client keeps `each.down` and a list of waiters. While the current `Atem` is down, `close()` returns a promise that settles on the first of three things. On `restarted`, it destroys the `Atem` and returns that promise. On the failed restart's error, it resolves. If a bound (a constant above threadedclass's restart timeout, such as 2000 ms) passes first, it falls back to `current.atem.destroy()`, today's behaviour. Catching the destroy's rejection and checking `lost` afterwards is not enough: in the probe the rejection, at about 105 ms, came before the error marked the `Atem` lost.

**Remediation brief**
- **Design intent:** the switcher client holds one current `Atem`. A lost one is never called again, and the next connect builds a fresh one. `close()` must resolve whenever nothing is left alive to close, so the adapter's `stop`, `connections.stop` and the server's `close` run to the end. Between `thread_closed` and its outcome, the client does not know yet whether anything is alive, so close waits for the outcome, and never longer than a bound.
- **Full surface:** `src/server/atem-switcher.ts:56` (the `SocketProcessErrors` type), `:119-128` (the hook passes the `down` callback), `:144` (`close`), `:182-194` (`librarySocketProcessErrors`); every fake of `SocketProcessErrors` in `test/atem-switcher.test.ts` (the `processes` rig near `:80`) gains `down`; a new child-process test in `test/atem-switcher-restart.test.ts` from `repro/review-8-close-mid-restart.test.ts`.
- **Must preserve:** close on a current, not-lost `Atem` destroys it and returns its promise (`test/atem-switcher.test.ts:282` "destroys the library connection on close", `:537` "destroys the fresh Atem on close"); close on a lost `Atem` resolves at once and never calls `destroy` (`:550`, and `test/atem-switcher-restart.test.ts:98`); a healed crash still ends with one socket process closed (`test/atem-switcher-restart.test.ts:175`); a close during a connect destroys the `Atem` that connect uses (`test/atem-switcher-signals.test.ts`). If neither `restarted` nor the error comes (review 7 NFI B, a freeze whose kill times out), the bound's fallback must still destroy, so shutdown never hangs.
- **Do not touch:** `Promise.all` in `connections.stop` and the `.finally` exit in `main.ts` (Dismissed in review 7); the `down` window's error classification (Dismissed in review 7).
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-114/repro/review-8-close-mid-restart.test.ts test/ && pnpm exec vitest run test/review-8-close-mid-restart.test.ts` is red now (`closed: 'rejected'`) and must be green after; then delete the copy. `pnpm exec vitest run test/atem-switcher.test.ts test/atem-switcher-restart.test.ts test/atem.test.ts test/atem-switcher-signals.test.ts` green.
- **Escalation:** this would be the fourth change to the lost-`Atem` path in `src/server/atem-switcher.ts` (`fc708ae`, `f31efc6`, `eee4586` and `4c6af0f`). Recommend a split ticket with its own child-process test matrix (close during a restart that fails, during one that succeeds, and during a kill that hangs) rather than another in-place rewrite under #114.

### 2. Comment hygiene — LOW (aggregated)
- `src/server/atem-switcher.ts:116-117` — "It never calls into the lost Atem again, since threadedclass kills..." → "It never calls into the lost Atem again: close resolves at once, and the adapter cuts only while the ATEM is online. threadedclass kills..." (`changeProgramInput` at `:165` has no guard of its own; the claim rests on `src/server/connections.ts:276, 290` calling cuts only while online).
- Carried from review 7 finding 3, deferred by Nick on 2026-10-22 and still open: `src/server/atem.ts:98-99` (ragged short line, rewrap at about 100 columns); `test/fake-switcher.ts:17` (one line of about 170 columns, rewrap); `test/atem-switcher.test.ts:80` ("and fails emits a socket process error to it" → "and its fails emits a socket process error to the listeners it recorded for that stub").

## Needs Further Investigation
### A to D. Carried from review 7, unchanged by this delta
An error during a restart that would succeed; a freeze whose kill times out; a failed restart inside the first connect, before the hook; and review 6's questions for the real unit (#145). The delta does not touch them. Finding 1's split ticket is the natural home for B, since its bound has to handle that case.

## Reviewed and Dismissed
- `changeProgramInput` calls into a lost `Atem` — unreachable: only the adapter's `cut` calls it (`src/server/atem.ts:132`), through `cue` and `runButton`, which `src/server/connections.ts:276, 290` call only while the row is online, and the lost `Atem` cannot come online (`live()` gate, `giveUp`'s `follow(false)`). Comment drift only, in finding 2.
- The `close()` guard breaks a close during a connect after a loss — `connect` calls `build()` synchronously before its first `await` (`:134-135`), so `current` is the fresh, not-lost `Atem` and close destroys it.
- The `rejectDestroy` option of the unit-test stub is now dead — the new test at `test/atem-switcher.test.ts:550` uses it, to prove close never reaches the lost stub's destroy.
- The prior doc names the wrong rejection message — "is not initialized" is right for a destroy at the moment of the restart's error (review 7 finding 2); "has been closed" is right for a destroy after threadedclass's kill (review 7 finding 1). Both docs are consistent with the code.

## Minor / nits
- `test/atem-switcher-restart.test.ts:95`: the `LOST` script ends with `process.exit(0)`, so a future lost path that leaves a socket process or handle running would stay green. The sibling test at `:46` lets its child exit on its own and relies on `onTestFinished`'s SIGKILL and the 20 s cap. Today the child exits by itself (the finder's probe), so this is only test strength. Dropping the `process.exit(0)` matches the precedent.
- `test/atem-switcher-restart.test.ts:87`: a fixed 500 ms wait before reading the error lines. Under heavy load a regressed second line could arrive after it and the test would pass. It can never flake red. In the mutation run with the destroy put back, the second line came inside the window.

## Test quality
Tests added or modified in the delta: 3 (`test/atem-switcher.test.ts:446` changed, `:550` new, `test/atem-switcher-restart.test.ts:98` new); 1 deleted (`logs a lost Atem whose destroy rejects, and goes on`, declared intended by review 7 finding 2's brief, with `:550` as its replacement guard). Red at `db46575`: all 3. At `0ffec22` they are red on the client's signature, as in review 7. Tautology shapes: none. `:446` and `:550` assert on the stub's state, and the stub sets `destroyed` before it rejects (`:65-68`), so `destroyed: false` means destroy was never called. The child-process test reads the real error log and the real close outcome. Mutants at HEAD, all killed: (m1) `close` unguarded, by `:550` and the child-process test; (m2) the hook's destroy put back with its log line, by `:446`, `:550` and the child-process test; (m3) the destroy put back silently, by `:446` and `:550`; (m4) `close` always resolves, by `:282`, `:537` and two child-process tests.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `cbb8522` (test green on the retry, after a load flake in an untouched file); e2e green locally on the retry. The new repro passes `pnpm exec eslint`, and `vitest.config.ts` includes only `test/**/*.test.ts`, so the `repro/` files never run in CI.
- **Commit hygiene:** the delta is review 7's two fix commits, its closure table, and its doc and repros; this doc and `repro/review-8-close-mid-restart.test.ts` are the only additions.
- **Likely reviewer asks:** as in review 7, why the client reaches into the library's private `client.socket._socketProcess`; why a close during a restart still rejects (finding 1, the follow-up ticket).

## Verdict
Ready to open the PR with follow-ups. There are zero CRITICAL, HIGH or MEDIUM findings. Finding 1 is LOW and pre-existing, and it goes to a split ticket rather than a fourth rewrite of the lost-`Atem` path. Finding 2 is comment hygiene. The confirmed list shrank from two behaviour defects to one rare, pre-existing timing, which is what a converging branch looks like.

## Prior-review closure
Against pre-PR review 7 (HEAD `db46575`):
- **Fully fixed: 2.** Finding 1 (close while lost rejects): `eee4586`. Close on a lost `Atem` resolves at once, proved red to green at unit and child-process level. Its stated fix covered the lost state only, and the window before the loss is new finding 1 here, pre-existing, not a half-fix. Finding 2 (a second log line per failed restart): `4c6af0f`. There is one line, and no call into the lost `Atem` on any reachable path.
- **Partially fixed: 0.**
- **Untouched: 1, deferred by decision.** Finding 3 (comment hygiene, LOW), deferred by Nick on 2026-10-22 per the review 7 closure table, and carried in finding 2 here.
- **Resolved only by a comment or doc edit: 0.** The comment rewording at `:19` and `:114-118` came with the code change it describes.
