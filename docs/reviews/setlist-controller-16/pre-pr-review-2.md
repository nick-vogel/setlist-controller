# Pre-PR review: setlist-controller#16 Coalesce slow-socket snapshots and pace position broadcasts

**Branch:** `setlist-controller-16-slow-link-coalescing` vs `origin/main` (merge-base `a9da50a`, "Merge pull request #19 from nick-vogel/setlist-controller-10-host-battery-warning")
**Reviewed at:** HEAD `605719e` (setlist-controller#16 merge main: #10 battery warning and the private-terms check) + 0 files with uncommitted changes, 0 untracked files, 8 files total (5 code/test files, 3 round-1 review files), +989 / -31
**Reviewed against:** issue `nick-vogel/setlist-controller#16` (open), epic `nick-vogel/setlist-controller#15` (open), PR `nick-vogel/setlist-controller#21` (open), `docs/merge-rules.md`, `.github/workflows/ci.yml`, `.claude/rules/public-repository.md`, the global rules in `~/.claude/rules/`, and prior review `docs/reviews/setlist-controller-16/pre-pr-review-1.md` (Approach decisions and closure check). Full fresh-surface review (`--fresh`).
**Date:** 2026-11-25
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present (`eslint`, `playwright`, `tsc`, `vite`, `vitest`) |
| Typecheck | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | pass |
| Build | `pnpm build` | pass (`dist/web` built cleanly) |
| Private terms (tree + range) | `pnpm check:private` and `pnpm check:private --range origin/main..HEAD` | pass (exit 0 on both) |
| Targeted hub and reconnect suites | `pnpm vitest run test/hub-coalescing.test.ts test/reconnect.test.ts test/server-connection.test.ts --maxWorkers=2` | 3 files, 31/31 pass |
| Full Vitest suite | `pnpm vitest run --maxWorkers=2` | 104/104 files, 3334 passed, 4 skipped (395.91 s) |
| Stalled-sleeps check | `bash docs/reviews/setlist-controller-16/repro/stalled-sleeps.sh` | `stalled sleeps: 0`, **1 failed** (`test/hub-coalescing.test.ts:379`, `AssertionError: expected 19 to be 18`, Finding 1) |
| Stop/fade race deterministic repro | `bash docs/reviews/setlist-controller-16/repro/stop-fade-race.sh` | **red 3 of 3** on HEAD (`expected 19 to be 18` at `:379`); **green 3 of 3** in scratch copy with `snapshot.fade === null` added at `:374` (Finding 1) |
| Mid-window revert repro | `bash docs/reviews/setlist-controller-16/repro/mid-window-revert.sh` | **red 2 of 2** on HEAD (`expected 12 to be 10` on both revert paths); **green 11 of 11** with `hub-coalescing.test.ts` after recommended fix in scratch copy (Finding 2) |
| Power field immediate flush | scratch test against `startHub` changing `power` while position held | pass (`power` is included in `nonPositionKey` via `...rest`) |
| Tautology audit: base oracle | `mktemp -d` copy of working tree with `git show a9da50a:src/server/hub.ts` and `server.ts` (plus `export const POSITION_BROADCAST_MS = 50` shim), running `test/hub-coalescing.test.ts` | 6 red, 2 green at base (both green by design; see Test quality) |
| `ws` `send()` throw behavior | read `node_modules/ws/lib/websocket.js:468-498` | throws only when `readyState === CONNECTING`; guarded by `readyState !== WebSocket.OPEN` |
| Linux CI container (`linux-ci.sh`) | `docker info` | not run: Docker daemon is unavailable in this environment |
| E2E (`pnpm test:e2e`) | skipped | diff touches no `web/` files; PR #21 reports 160/160 passed locally |

**Overall:** The hub's core coalescing and 20 Hz pacing implementation is solid, the merge with `main` (#10 battery warning and #17 private-terms check) resolved cleanly, and the full 104-file Vitest suite passed. However, PR #21 is **not ready to merge as-is** because `test/hub-coalescing.test.ts:374-379` still contains a live CI flake that failed natively on our very first run (`AssertionError: expected 19 to be 18`). Review 1 mistakenly grouped that failure with Finding 2's sleep race; in reality, step 7 stops Live while step 5's fade-out is still active, causing two synchronous `publish()` calls (`fade: 'out'` then `fade: null`) that `hub.ts`'s `inFlight` gate splits across two TCP writes. In addition, a narrow LOW bug in `src/server/hub.ts:169` and `:114` can leave a client that connected or drained mid-window stuck on a superseded position if the playhead reverts to the last broadcast before the trailing flush fires.

## Prior-review closure
Checked against `docs/reviews/setlist-controller-16/pre-pr-review-1.md`:
- **Finding 1 (MEDIUM, Linux slow-socket tests):** fixed in `9610bb2`. Both slow-socket tests now use `streamPastKernelBuffers` (16 MiB `STREAM_BYTES`, quarter-beat steps, `< totalUpdates` and `at(-2)` gap assertions) and remain red against `$BASE` (`a9da50a`). Note: Docker was unavailable here to re-run `linux-ci.sh`, and test 3 (`:200-204`) still streams 250 frames (~1.5 MB) which does not back up on Linux (recorded in Minor / nits and Comment hygiene).
- **Finding 2 (MEDIUM, 80 Hz sleep race):** fixed in `e57f628`. All fixed `setTimeout(resolve, ...)` waits are gone (`stalled sleeps: 0`), replaced by `ingested(rig, beats)`. However, the separate `expected 19 to be 18` failure that review 1 mentioned as "same mechanism" was never caused by fixed sleeps and remains open as Finding 1 below.
- **Finding 3 (LOW, drain-recheck fallback):** fixed in `43425ae` and `78f391a`. The `bufferedAmount` / `DRAIN_RECHECK` fallback and its header reference are gone; `ClientState.inFlight` is the sole busy signal.
- **Finding 4 (MEDIUM, capped, kernel-buffer residual lag):** accepted per Nick's Option B decision, no code in this branch; `#16` acceptance criterion reworded and follow-up tracked in `#20`.
- **Finding 5 (LOW, comment hygiene):** fixed in `63d9d90`. Three small comment mismatches remain or were introduced by the merge/remediation (Finding 3 below).

## Approach decisions
Carried forward from `pre-pr-review-1.md`:
- **Slow-socket test volume:** stream by bytes (`STREAM_BYTES = 16 MiB`) via `streamPastKernelBuffers`, asserting `delivered < streamed` and `at(-2) < newest - 0.25`.
- **Pacing tests' synchronization:** wait on `ingested(rig, beats)` (fresh probe viewer), never a fixed real-time sleep (`grep -n "setTimeout(resolve" test/hub-coalescing.test.ts` stays empty).
- **Drain detection:** `ClientState.inFlight` (cleared by the `ws` send callback) is the hub's only busy signal; no `bufferedAmount` polling.
- **Kernel-buffer backlog (Option B):** accepted for `#16`; app-level acknowledgement is tracked in `#20`.

Added in this review:
- **Step 7 stop-wait predicate (`test/hub-coalescing.test.ts:374`):** wait for `!snapshot.playing && snapshot.fade === null` instead of `!snapshot.playing` alone, so the test settles on both the stop broadcast and the synchronous fade-cancel broadcast from `server.ts:335-336` regardless of whether `hub.ts` writes them in one or two TCP segments.
- **Mid-window revert sync (`src/server/hub.ts:107-116`, `:169-172`):** `deliver()` already deduplicates per socket via `payload === state.lastSent`, so `broadcast()` calls `deliver(socket, state)` for every client, and `publish()`'s early return at `:169` calls `deliver(socket, state)` for every client only when `stopFlush` was active. Steady-state duplicate reports stay O(1) with no client loop.

## Confirmed Issues

### 1. Step 7 of the significant-change test races Stop's snapshot against the synchronous fade-cancel snapshot, flaking with `expected 19 to be 18` : MEDIUM
- **Location:** `test/hub-coalescing.test.ts:370-379` (triggered by step 5 at `:359-362` and `src/server/server.ts:335-336`)
- **Attribution:** introduced. `git log --oneline -S'countAfterStop' a9da50a..HEAD` -> `fcc69f0` (new file; untouched by `e57f628`, which only replaced fixed sleeps).
- **Real-world trigger:** any CI run on `ubuntu-latest` or local test run where TCP/libuv delivers the first frame (`{ playing: false, fade: 'out' }`) to `leader` before `hub.ts`'s `inFlight` callback writes the second frame (`{ playing: false, fade: null }`), and the second frame then arrives before `leader.flush()`'s pong. Observed natively on unmodified HEAD (`605719e`) during our first run of `stalled-sleeps.sh` (`stalled sleeps: 0`, failing at `:379:36` with `expected 19 to be 18`), and also reported once by review 1's finder. Capped at MEDIUM because it is a test-only flake with no user-facing defect, and it is a CI merge gate (`docs/merge-rules.md`).

**Evidence**
```ts
    // 7. Playing -> Stopped flushes immediately while held, and the canceled timer emits no duplicate.
    await holdPosition(74, 75);
    const beforeStop = leader.received.length;
    rig.live.setPlaying(false);
    const stopped = await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= beforeStop && !snapshot.playing);
    expect(stopped.position).toBeCloseTo(75, 3);
    const countAfterStop = leader.received.length;
    hubClock.advance(POSITION_BROADCAST_MS);
    await leader.flush();
    expect(leader.received.length).toBe(countAfterStop);
```

**Failure mode:** Step 5 (`:359-362`) starts a `fade-out` (`fade === 'out'`) and leaves it active. When step 7 calls `rig.live.setPlaying(false)`, `server.ts:335-336` invokes `controller.fromLive(event)` and then `fade.fromLive(event)` synchronously in the same tick:
1. `controller.fromLive` calls `publish()` with `{ playing: false, fade: 'out', position: 75 }`. `hub.ts:100` starts `socket.send` and sets `state.inFlight = true`.
2. `fade.fromLive` cancels the active fade (`fade-out.ts:231-234`) and calls `onPhase()` -> `publish()` with `{ playing: false, fade: null, position: 75 }`. `hub.ts:93-96` sees `state.inFlight === true`, sets `state.dirty = true`, and defers the second frame until the first send callback fires.

Because `hub.ts` splits the two snapshots into separate TCP writes, `leader` can read frame 18 (`fade: 'out'`) before frame 19 (`fade: null`) is written. `leader.snapshot(... && !snapshot.playing)` resolves immediately on frame 18, capturing `countAfterStop = 18`. Frame 19 (already queued before `hubClock.advance`) arrives before `leader.flush()`'s pong, failing line 379 with `AssertionError: expected 19 to be 18`. Even on passing runs, instrumentation confirmed `stopped.fade === 'out'` and `leader.received.at(-1).fade === null` (`countAfterStop === 19` only because both frames happened to land in one read). Executed proof: `bash docs/reviews/setlist-controller-16/repro/stop-fade-race.sh` fails 3 of 3 on HEAD with `AssertionError: expected 19 to be 18`.

**Recommended fix**
```diff
-    const stopped = await leader.snapshot((snapshot) => leader.received.indexOf(snapshot) >= beforeStop && !snapshot.playing);
+    const stopped = await leader.snapshot(
+      (snapshot) => leader.received.indexOf(snapshot) >= beforeStop && !snapshot.playing && snapshot.fade === null,
+    );
```

**Remediation brief**
- **Design intent:** Step 7 verifies two rules: stopping Live while a position update is held flushes immediately without advancing `hubClock`, and cancelling the pending trailing timer emits no extra snapshot when `hubClock` later advances past `POSITION_BROADCAST_MS`. Because step 5 left a fade active, stopping Live legitimately produces both `playing: false` and `fade: null` (either as two frames split by `inFlight` or as one coalesced frame). Waiting for `!snapshot.playing && snapshot.fade === null` settles after the stop event's full synchronous effect has reached `leader`, before snapshotting `countAfterStop`.
- **Full surface:** `test/hub-coalescing.test.ts:374`. No other step in `test/hub-coalescing.test.ts` asserts an exact `received.length` immediately after a two-`publish()` Live event (all 8 steps and all other tests in the file were audited). No production code changes (`server.ts:335-336` is pre-existing and `hub.ts`'s `inFlight` behavior is intended).
- **Must preserve:** `hubClock` is still NOT advanced before `leader.snapshot(...)` resolves, proving immediate flush; `stopped.position` is still `75`; advancing `hubClock` by `POSITION_BROADCAST_MS` and flushing still adds zero frames (`test/hub-coalescing.test.ts`, `test/fade-out.test.ts`). Also holds whether the two frames arrive separately or coalesce into one, and if `fade` is already `null`.
- **Do not touch:** `src/server/server.ts:334-336` (event ordering between `controller.fromLive` and `fade.fromLive` is pre-existing and tested by `fade-out` suites) and `src/server/hub.ts` `deliver()`.
- **Proof:** `bash docs/reviews/setlist-controller-16/repro/stop-fade-race.sh` fails 3 of 3 on HEAD (`expected 19 to be 18`) and must pass 3 of 3 after the fix; `pnpm vitest run test/hub-coalescing.test.ts --maxWorkers=2` must pass 8/8.

### 2. A client that receives a held mid-window snapshot stays stuck on the superseded position if the position reverts to the last broadcast before the flush fires : LOW
- **Location:** `src/server/hub.ts:169-172` and `src/server/hub.ts:107-116`
- **Attribution:** introduced. `git show a9da50a:src/server/hub.ts` had no `broadcasted` vs `latest` split and no `stopFlush` pacing; every `publish` broadcast immediately to every connected socket. `git log --oneline -S'next.playback === broadcasted.playback' a9da50a..HEAD` -> `fcc69f0`.
- **Real-world trigger:** Live is stopped (so no continuous playback ticks follow), reports position A (broadcast), reports position B within 50 ms (held in `latest` while `broadcasted` stays A), a page connects or a slow page completes an in-flight send during that sub-50 ms window and receives B (`state.lastSent = B`), and Live then reports exact position A again and rests there. That client remains stuck displaying B until an unrelated future state change arrives, while other clients show A. Rated LOW by consequence times attainability: display-only playhead discrepancy within the same section requiring an exact float revert within 50 ms while stopped, concurrent with a connect or send completion.

**Evidence**
```ts
  const broadcast = () => {
    const changedPlayback = latest.playback !== broadcasted.playback;
    const changedProducer = latest.producer !== broadcasted.producer;
    broadcasted = latest;
    broadcastedKey = latestKey;
    if (!changedPlayback && !changedProducer) return;
    for (const [socket, state] of clients) {
      if (state.role === 'producer' ? changedProducer : changedPlayback) deliver(socket, state);
    }
  };
```
```ts
      // A listener may report a value that has not changed since the last broadcast.
      if (next.playback === broadcasted.playback && next.producer === broadcasted.producer) {
        cancelFlush();
        return;
      }
```

**Failure mode:** Whenever a trailing flush is pending (`stopFlush !== null`), `latest` differs from `broadcasted`. A new client connecting at `:143` or a slow client finishing an in-flight send at `:103` calls `deliver()`, receiving `latest` (position 12) and storing `state.lastSent = latest`. If a subsequent `publish()` reverts position back to `broadcasted` (position 10):
1. With no producer change: `:169` sees `next.playback === broadcasted.playback && next.producer === broadcasted.producer`, cancels `stopFlush`, and returns without calling `deliver()`. The mid-window client stays stuck at position 12 forever.
2. Alongside a producer-only change: `broadcast()` at `:108-115` computes `changedPlayback = false` (`10 === 10`) and skips viewers at `:114`, so a mid-window viewer stays stuck at position 12 forever.

Executed proof: `bash docs/reviews/setlist-controller-16/repro/mid-window-revert.sh` fails both cases on HEAD with `AssertionError: expected 12 to be 10`.

**Recommended fix**
```diff
   const broadcast = () => {
     const changedPlayback = latest.playback !== broadcasted.playback;
     const changedProducer = latest.producer !== broadcasted.producer;
     broadcasted = latest;
     broadcastedKey = latestKey;
     if (!changedPlayback && !changedProducer) return;
-    for (const [socket, state] of clients) {
-      if (state.role === 'producer' ? changedProducer : changedPlayback) deliver(socket, state);
-    }
+    for (const [socket, state] of clients) deliver(socket, state);
   };
```
```diff
       if (next.playback === broadcasted.playback && next.producer === broadcasted.producer) {
-        cancelFlush();
+        if (stopFlush) {
+          cancelFlush();
+          for (const [socket, state] of clients) deliver(socket, state);
+        }
         return;
       }
```

**Remediation brief**
- **Design intent:** `hub.ts` maintains two snapshots while a position-only trailing flush is pending (`stopFlush !== null`): `broadcasted` (what existing clients received) and `latest` (what a newly connected or newly drained client receives). Because `state.lastSent` tracks the exact encoded string each socket last received, `deliver(socket, state)` is already an O(1) no-op for any socket whose `lastSent` matches `latest`. Syncing through `deliver()` when a held window reverts (and unconditionally in `broadcast()`) restores convergence for diverged sockets without sending duplicate frames to sockets already at `broadcasted` and without scanning `clients` on steady-state duplicate reports where `stopFlush` is null.
- **Full surface:** `src/server/hub.ts:113-115` and `src/server/hub.ts:169-172`, plus unit tests in `test/hub-coalescing.test.ts` covering both revert cases (reverted position alone, and reverted playback alongside a producer change) and asserting existing clients receive zero extra frames.
- **Must preserve:** producer-only changes (such as Arm) with no held playback revert must still send zero frames to viewers (`test/hub-coalescing.test.ts:171`, `test/connections.test.ts`); steady-state duplicate Live reports must send zero frames and skip the client loop (`stopFlush === null`); a newly connected client during a held window still gets `latest` without a duplicate on trailing flush (`test/hub-coalescing.test.ts:282-307`).
- **Do not touch:** `deliver()`'s busy check (`inFlight`) and `lastSent` deduplication (`:86-105`), and `nonPositionKey` (`:219-223`, Dismissed).
- **Proof:** `bash docs/reviews/setlist-controller-16/repro/mid-window-revert.sh` fails 2 of 2 on HEAD (`expected 12 to be 10`) and must pass 2 of 2 after the fix; `pnpm vitest run test/hub-coalescing.test.ts test/reconnect.test.ts test/server-connection.test.ts test/connections.test.ts --maxWorkers=2` must pass.

### 3. Comment hygiene : LOW (aggregated)
- `src/server/hub.ts:22-24` : `Any significant state change (connection, playing/stopped, set, section boundary, waiting jump, count-in, end toggles, loop, fade, chart revision, song meters, or producer connections)` -> `Any significant state change (connection, playing/stopped, set, section boundary, waiting jump, count-in, end toggles, loop, fade, chart revision, song meters, power, or producer connections)` (omits `power`, which landed via merge `605719e` and is handled by `nonPositionKey`).
- `test/hub-coalescing.test.ts:127-128` : `// Resume the slow TCP link: it drains what was already in the kernel pipe and jumps straight` / `// to the newest snapshot without draining hundreds of stale queued frames.` -> `// Resume the slow TCP link: it drains what fit in the kernel pipe and jumps to the newest snapshot.` (on macOS loopback it drains 134 stale kernel-buffered frames and on Linux over a thousand, contradicting "without draining hundreds" and lines `:135-136` directly below).
- `test/hub-coalescing.test.ts:206` : `// While slow is paused and backed up, Stop reaches the healthy leader immediately.` -> `// While slow is paused, Stop reaches the healthy leader immediately.` (250 frames is ~1.5 MB, which fits inside Linux's kernel TCP buffers without backing up the hub).

## Needs Further Investigation

None.

## Reviewed and Dismissed
- **`socket.send()` throwing synchronously when `readyState === OPEN`** (`src/server/hub.ts:100`, `:152`): checked `node_modules/ws/lib/websocket.js:468-498`; `send()` throws synchronously only when `readyState === WebSocket.CONNECTING`, and both call sites guard `socket.readyState !== WebSocket.OPEN`.
- **`power` field from merge `605719e` misclassified as position-only** (`src/server/hub.ts:219-223`): `nonPositionKey` destructures `{ position, now, ...rest }`, so `power` is in `rest`; verified by execution that changing `power` while a position update is held flushes immediately.
- **Heartbeat skipping `inFlight` sockets causing false page disconnects** (`src/server/hub.ts:148-158`): `web/src/server-connection.ts:84-88` resets the silence timer on every message, heartbeat or snapshot; a socket with a send in flight already has data headed to the page.
- **`inFlight` stuck true or lost dirty wake-up** (`src/server/hub.ts:86-105`, `:148-158`): both snapshot and heartbeat callbacks clear `state.inFlight = false` unconditionally before returning on `closed || error || readyState !== OPEN`, and re-enter `deliver()` whenever `state.dirty` is true; closed sockets leave `clients` on `close`.
- **`proxy.pause()` / `resume()` hanging `close()` or dropping bytes** (`test/proxy.ts:118-130`): pausing `pair.upstream` applies standard TCP backpressure without dropping bytes; `close()` calls `destroyAll()` which destroys both sockets cleanly.
- **`streamPastKernelBuffers` crossing section boundary or underflowing `at(-2)`** (`test/hub-coalescing.test.ts:73-87`, `:138`, `:181`): 16 MiB at ~6,076 bytes/snapshot is ~2,739 updates (`684.75` beats), well inside the 1024-beat first section; `beforePause >= 1` plus at least one post-resume snapshot guarantees `received.length >= 2`.
- **Merge conflict resolution in `src/server/server.ts` and `test/harness.ts`** (`605719e`): verified `git diff a9da50a..HEAD`; both `hubClock` and `powerSource`/`power` are intact and `DEFAULTS` matches `ServerOptions`.
- **`ingested()` probe connections leaking sockets** (`test/hub-coalescing.test.ts:89-101`): each probe closes in `finally` and `rig.close()` cleans up the harness list; 80 probes in the 80 Hz test finish in ~37 ms.

## Minor / nits
- `test/hub-coalescing.test.ts:209` (`expect(stopped.playing).toBe(false)`), `:390` (`expect(disconnected.live).toBe('not-connected')`), and `:443` (`expect(latestProducer.connections[0]?.lateness.last).toBe(125)`) each restate the predicate of the `snapshot()` wait directly above them and cannot fail independently. Carried over from review 1's Test quality section; safe to delete.
- `test/hub-coalescing.test.ts:200-204` (test 3) streams 250 frames (~1.5 MB), which backs up on macOS but stays inside Linux's kernel TCP buffers. Switching it to `streamPastKernelBuffers` would also exercise `inFlight` backpressure on Linux CI (adds ~0.5 s).
- `test/harness.ts:133` passes `hubClock: undefined` explicitly into `startServer`, overwriting `DEFAULTS.hubClock` in `{ ...DEFAULTS, ...options }` (`src/server/server.ts:111`) so `startHub`'s parameter default (`realClock`) supplies the fallback instead. Carried over from review 1.
- `nonPositionKey` (`src/server/hub.ts:219-223`) shares `connections` across every role, so a producer-only change also flushes a held position early to viewers and leaders (carried over from review 1).
- `test/hub-coalescing.test.ts:104` bundles two rules (slow-socket coalescing and healthy-sibling isolation) in one test name (carried over from review 1).

## Test quality
Tests added: 8 (`test/hub-coalescing.test.ts`) · green against `$BASE` (`a9da50a`, assert nothing new): 2 · tautology shapes found: 3 restated-predicate assertions (`:209`, `:390`, `:443`).
- 6 of 8 tests fail against `$BASE` (`a9da50a` with `POSITION_BROADCAST_MS = 50` shimmed; raw base also fails to import `POSITION_BROADCAST_MS`): both slow-socket tests fail as `expected 2739 to be less than 2739` and `expected 2570 to be less than 2569`, and all 4 pacing/flush tests fail on unthrottled broadcasts.
- 2 of 8 tests pass against `$BASE` by design: `delivers significant state changes immediately to healthy siblings while a slow socket is paused` (`:187`, regression guard required by `#16`) and `delivers intra-section slide cues and section cues with exact lateness...` (`:395`, proves cue timing stayed untouched as required by `#16`).
- Delete the 3 restated-predicate `expect` lines (`:209`, `:390`, `:443`); the `snapshot(...)` waits immediately above them are the real assertions. No mocked unit under test, no self-computed expectation, no unread snapshots.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check:private` (tree and range), and `pnpm vitest run --maxWorkers=2` (104/104 files, 3334 passed, 4 skipped) all pass, **but** `test/hub-coalescing.test.ts:379` flaked natively (`expected 19 to be 18`) and will intermittently turn GitHub Actions red until Finding 1 is fixed.
- **Commit hygiene:** PR #21 is already open at `605719e`. Commit this review doc and its two new repro scripts (`docs/reviews/setlist-controller-16/pre-pr-review-2.md`, `repro/stop-fade-race.sh`, `repro/mid-window-revert.sh`) with subject `setlist-controller#16 pre-PR review 2`, then remediate via `/pr-review-remediate`.
- **Likely reviewer asks:** none beyond the accepted `#20` kernel-buffer limit already documented in PR #21's body.

## Verdict
**Not ready.** Gate before merging PR #21:
- **Finding 1 (MEDIUM):** fix the stop/fade-cancel snapshot wait at `test/hub-coalescing.test.ts:374` so `flushes immediately...` stops flaking with `expected 19 to be 18` on CI.

Findings 2 (LOW, mid-window revert sync in `src/server/hub.ts`) and 3 (LOW, comment hygiene) are small, low-risk fixes that can be remediated in the same `/pr-review-remediate` pass or tracked as follow-ups.
