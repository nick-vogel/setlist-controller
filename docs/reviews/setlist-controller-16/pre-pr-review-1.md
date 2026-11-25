# Pre-PR review: setlist-controller#16 Coalesce slow-socket snapshots and pace position broadcasts

**Branch:** `setlist-controller-16-slow-link-coalescing` vs `origin/main` (merge-base `adee302`, "setlist-controller, the first public commit"; origin/main has moved since, so the merge-base is the base)
**Reviewed at:** HEAD `fcc69f0` (Coalesce slow WebSocket snapshots and cap position broadcasts at ~20 Hz (#16)) + 0 files with uncommitted changes, 0 untracked files, 5 files total, +669 / −27
**Reviewed against:** issue `nick-vogel/setlist-controller#16` (open), its epic `#15` (open; #16 is its only sub-issue), `docs/merge-rules.md`, `.github/workflows/ci.yml`, and the global rules in `~/.claude/rules/`. The repo has no `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, ADRs, `.claude/rules/`, or plan docs for #16, and no prior review of #16.
**Date:** 2026-11-25
**Reviewer:** 1 code-review agent + verify pass (first opinion), with an independent second opinion (separate thread) folded in on 2026-11-25; see Second opinion

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present |
| Typecheck | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | pass |
| New file on macOS | `pnpm vitest run test/hub-coalescing.test.ts`, 3 runs alone | 8/8 pass, 3 of 3 |
| New file on Linux (CI's OS) | `bash docs/reviews/setlist-controller-16/repro/linux-ci.sh` (node:24, `--cpus=4`, stock `tcp_wmem 4096 16384 4194304`, `tcp_rmem 4096 131072 6291456`), 3 runs | **2 failed every run**: `expected 400 to be less than 200` (`:114`) and `expected 401 to be less than 200` (`:161`); the other 6 pass (Finding 1) |
| CI target | `gh repo view --json visibility`, `.github/workflows/ci.yml` | repo is PUBLIC, so `pnpm test` runs on `ubuntu-latest` on every push to this branch |
| 20 Hz block under natural load | `pnpm vitest run test/hub-coalescing.test.ts -t '20 Hz'`, 10 runs alone, load average 275 to 438 on 14 cores | 1 of 10 failed: the 80 Hz test, `Waited 2000ms for a snapshot ...; got 25 that did not.` (Finding 2) |
| Flake mechanism | 5 ms synchronous stall after the 80 Hz test's last `setPosition` (scratch copy), then `bash docs/reviews/setlist-controller-16/repro/stalled-sleeps.sh` | 3 of 3 red with the identical `got 25` signature; the repro script is red on the 80 Hz test only. The hub is right and the test's synchronization is wrong (Finding 2) |
| Tautology audit: base oracle | scratch `git worktree add` at `adee302`, HEAD's `test/harness.ts`, `test/proxy.ts`, `test/hub-coalescing.test.ts` copied in, file run | 6 red, 2 green at base: `delivers significant state changes immediately to healthy siblings ...` (`:167`) and the cue-timing test (`:386`). See Test quality |
| Full suite | `pnpm vitest run --maxWorkers=2`, load average 100 to 545 | 100 of 102 files pass, `hub-coalescing` included; 5 failures in `test/propresenter.test.ts` (4) and `test/set-builder-command.test.ts` (1, a 5 s timeout), files this branch does not touch |
| Those two files, attributed | both files run alone twice at `adee302` (scratch worktree) and twice at HEAD, interleaved under the same load | base: 1 failed then 0; HEAD: 0 then 2; failing tests differ run to run and track load. Pre-existing load sensitivity, not this branch |
| Page silence timer vs skipped heartbeats | read `web/src/server-connection.ts:66-92` | the page restarts its silence timer on every message, heartbeat or snapshot (dismissal below) |
| Stale frames a paused socket drains (second opinion item 2) | scratch copy of the viewer coalescing test that writes the paused socket's received positions to a file, 2 runs on macOS | both runs: 135 delivered, positions 1, 2, 3 … 133, 134, then 400. That is 134 superseded snapshots of 6,076 bytes (about 814 KB) drained from the kernel before the newest (Finding 4) |
| macOS TCP buffers | `sysctl net.inet.tcp.sendspace net.inet.tcp.autosndbufmax` | `sendspace` 131072, `autosndbufmax` 4194304 (also `recvspace` 131072, `autorcvbufmax` 4194304) |
| Kernel-buffer staleness on real Wi-Fi | not run | needs a throttled real link; it is Finding 4's upgrade check |
| Connection target report rate (second opinion item 3) | `grep -rn "\.every(\|setInterval(" src/server` | targets report on cues, presses, polls and retries, never per Live tick, and the hub drops unchanged snapshots |
| E2E (`pnpm test:e2e`) | not run | browser suite under heavy shared-machine load; the diff touches no web code |

**Overall:** The hub's design holds up under tracing: one send in flight per socket, the newest snapshot on drain, a pacing state machine whose trailing flush, cancel-on-significant-change and new-client paths all behave, and cue timing untouched. The branch is not ready because its own proof does not hold on CI's OS. On Linux the kernel absorbs all 400 test frames, so both slow-socket tests fail on every run, and CI on this public repo will be red on the first push. The 80 Hz pacing test also races a UDP report against a 2 ms sleep and flakes under load. Fix both tests before opening the PR. The second opinion turned the open product question into a confirmed gap (Finding 4). Coalescing only covers Node's own buffer: on macOS loopback a paused socket still drained 134 superseded snapshots from the kernel before the newest one, so #16's first acceptance criterion as written ("never queues stale snapshots") is not met. The branch narrows the backlog compared with base but does not remove it. Nick decided on Option B: #16 accepts the residual lag with its criterion reworded, and the app-level acknowledgement becomes a new sub-issue of #15. Finding 4 therefore takes no code in this branch (see Remediation scope).

## Approach decisions
- **Slow-socket test volume:** stream by bytes, not by frame count, past the sum of Linux's TCP buffer maxima (16 MiB), and assert "strictly fewer than streamed, with a skipped position" instead of a fraction of the count. Bigger frames are not available: fake Live sends the whole cue list in one UDP datagram (`src/fake-live/fake-live.ts:277-278`).
- **Pacing tests' synchronization:** wait on an observed fact (a fresh probe viewer sees the position, because a new connection always gets the hub's newest snapshot) instead of a fixed real-time sleep. Precedent: the probe in this same file, `test/hub-coalescing.test.ts:277-286`, which becomes the shared helper.
- **Drain detection:** send completion (`inFlight`, cleared by the `ws` send callback) is the one backpressure signal; the `bufferedAmount` gate and its drain wait are removed. This departs from #16's wording "track send completion and `bufferedAmount`" on purpose, for the reason in Finding 3. If Nick wants `bufferedAmount` kept literally, the alternative is to keep the path and add a test that drives it, which needs a pong held behind a paused proxy.
- **Kernel-buffer backlog (decided by Nick, 2026-11-25: Option B):** #16 accepts the residual kernel-buffer lag, and this branch takes no code for it. Option A, an app-level acknowledgement (one unacknowledged snapshot per socket, with an acknowledgement timeout as fallback), is filed as a new sub-issue of #15, sized by the throttled-link measurement in Finding 4. It is the only mechanism that bounds the kernel's share, because Node exposes neither `SO_SNDBUF` nor `TCP_NOTSENT_LOWAT`. When that sub-issue is built, its ack frame mirrors the heartbeat's precedent (`src/shared/heartbeat.ts`: a fixed string recognised before any parse), it replaces Finding 3's "send completion" signal with "acknowledged", and Finding 1's bound tightens. None of that happens in this branch.
- **Remediation 1, slow-socket helper (2026-11-25):** `streamPastKernelBuffers` streams quarter-beat positions until `STREAM_BYTES` (16 MiB) reach the healthy watcher, and both slow-socket tests use it. The bound is `delivered < streamed` plus `at(-2) < newest - 0.25`. At `adee302` it is red as `2759 < 2759` and `2588 < 2587`, so it still separates coalesced from uncoalesced.
- **Remediation 1, ingest synchronization (2026-11-25):** `ingested(rig, beats)` is the only way a hub-coalescing test waits for Live's report before it moves `hubClock`. A fixed real-time sleep in that file is a defect (`grep -n "setTimeout(resolve" test/hub-coalescing.test.ts` must stay empty).
- **Remediation 1, busy signal (2026-11-25):** `ClientState.inFlight` is the hub's only busy signal, and nothing in `hub.ts` reads `bufferedAmount` or the raw TCP socket. The #20 acknowledgement swaps this flag's meaning to "acknowledged" in `deliver()` and both send callbacks.

## Remediation scope
Recorded 2026-11-25, from Nick's decision on Finding 4:
- Remediate Findings 1, 2, 3 and 5 (comment hygiene) in this round.
- Finding 4 takes no code in this round.
- The issue edits that Option B needs (rewording #16's first acceptance criterion, recording the known limit on epic #15, filing the acknowledgement sub-issue) are done by the orchestrator, not by `/pr-review-remediate`.

## Confirmed Issues

### 1. Both slow-socket coalescing tests fail on Linux, so CI on this public repo goes red: MEDIUM
- **Location:** `test/hub-coalescing.test.ts:87-114` (viewer test) and `test/hub-coalescing.test.ts:136-161` (producer test)
- **Attribution:** introduced. `git log --oneline -S'toBeLessThan(healthyDelivered / 2)' adee302..HEAD` → `fcc69f0`; the file is new.
- **Real-world trigger:** pushing this branch. The repo is public, so `.github/workflows/ci.yml` runs `pnpm test` on `ubuntu-latest`, and `docs/merge-rules.md` gate 2 reads that check. A Linux developer checkout fails the same way. Capped at MEDIUM because it is a test defect, not a user-facing one, but it is a merge gate.

**Evidence**
```ts
      // Stream 400 distinct ~5 KB broadcasts (~2 MB total), well past the OS loopback TCP buffer,
      ...
      const totalUpdates = 400;
      ...
      expect(deliveredWhilePaused).toBeLessThan(healthyDelivered / 2);
```
**Failure mode:** The test only proves coalescing if the stream overflows the kernel buffers between the hub and the paused proxy reader, so that the hub sees backpressure. On Linux, `tcp_wmem` max 4,194,304 plus `tcp_rmem` max 6,291,456 is 10 MiB of possible kernel buffering. All 400 frames (about 2.4 MB) fit, so the hub never sees a send pending, correctly sends all 400, and the slow socket drains all of them. Executed: `bash docs/reviews/setlist-controller-16/repro/linux-ci.sh` fails 3 of 3 runs with `expected 400 to be less than 200` and `expected 401 to be less than 200`. On macOS the slow socket received about 135 frames in the finder's runs, a margin of 65 under the bound, so even there the test passes only because macOS buffers less.

**Recommended fix:** a shared streaming helper in the test file that streams until 16 MiB have gone to the healthy sibling, keeping every position inside the first section (beats 0 to 1024) by stepping a quarter beat. Use it in both tests, with the bounds changed as below.
```ts
const STREAM_BYTES = 16 * 1024 * 1024;

type Watcher = { snapshot(matches: (snapshot: Snapshot) => boolean): Promise<Snapshot> };

async function streamPastKernelBuffers(live: Rig['live'], hubClock: ManualClock, healthy: Watcher): Promise<number> {
  let streamed = 0;
  let updates = 0;
  while (streamed < STREAM_BYTES) {
    updates += 1;
    hubClock.advance(POSITION_BROADCAST_MS);
    live.setPosition(updates / 4);
    streamed += JSON.stringify(await healthy.snapshot(at(updates / 4))).length;
  }
  return updates;
}
```
In the viewer test, replace `:87-95` with `const totalUpdates = await streamPastKernelBuffers(rig.live, hubClock, healthy);`, change `at(totalUpdates)` and `toBeCloseTo(totalUpdates, 3)` to `totalUpdates / 4`, and replace `:111-114` with:
```ts
      expect(deliveredWhilePaused).toBeLessThan(totalUpdates);
      expect(slow.received.at(-2)?.position).toBeLessThan(totalUpdates / 4 - 0.25);
```
Make the same changes in the producer test (`:138-143`, `:155`, `:159`, `:161`), using `healthyProducer` as the watcher. Import `type ManualClock` from `../src/server/clock.ts`. Raise both tests' timeout from `15_000` to `30_000`.

**Remediation brief**
- **Design intent:** The rule under test is that a socket whose send is still pending never gets another snapshot queued. Once it drains it gets exactly the newest one, so it skips stale frames. The hub can only see "pending" once the kernel stops accepting bytes. The test therefore has to push more bytes than the kernel buffers hold on every OS it runs on, and assert what holds on all of them: fewer frames delivered than streamed, a gap before the last one, and the last one equal to the newest. An uncoalesced hub (base) delivers exactly as many as were streamed, so the new bound is still red at base. This test proves only the hub's own layer. The kernel's share of stale frames (134 on macOS loopback) passes this bound by design, and Finding 4 owns that gap. It is accepted for #16 (Option B), so keep the bound this brief gives. The acknowledgement sub-issue of #15 is where it later becomes "the paused socket receives at most 2 snapshots: the one outstanding, then the newest".
- **Full surface:** `test/hub-coalescing.test.ts:35` (the `~5 KB` comment on `largeSet`), `:72-118` (viewer test, including its `:87-89` and `:111-113` comments, which become false or stale), `:120-165` (producer test), and the imports at `:5`. No production code changes.
- **Must preserve:** the healthy sibling still receives every broadcast (`toBe(totalUpdates)` at `:99` and `:144`). The slow socket receives nothing while paused (`:101`). The producer test's arm while backed up still converges with `arm === 'armed'` (`:149-160`), and the viewer still gets no snapshot for that producer-only change (`:151-152`). Positions stay inside the first section, so no section boundary turns a tick into a significant change.
- **Do not touch:** `test/proxy.ts` `pause()`/`resume()` (correct: pausing the upstream read is what pushes TCP backpressure onto the server); the hub's `deliver()` (Dismissed: no lost wake-up).
- **Proof:** `bash docs/reviews/setlist-controller-16/repro/linux-ci.sh` is red now and must pass 3 of 3 after. Then rerun the file at `adee302` (scratch worktree with the new test files copied in, as in the table above) and both slow-socket tests must still be red there.

### 2. The 80 Hz pacing test races Live's UDP report against a 2 ms sleep and flakes under load: MEDIUM
- **Location:** `test/hub-coalescing.test.ts:246-255`; the same fixed-sleep pattern sits at `:218-223` and `:318-321`
- **Attribution:** introduced (`fcc69f0`, new file).
- **Real-world trigger:** any loaded machine. CI's 4-CPU runner already takes 339 s for this suite (the `ci.yml` comment), and the shared dev machine runs several suites at once. Observed: 1 of 10 solo runs failed here, and the second reviewer and the finder each saw it fail under load. The finder also saw `expected 19 to be 18` once from a count assertion in this block (not reproduced here; same mechanism). Capped at MEDIUM: an intermittently red build, not a user-facing defect.

**Evidence**
```ts
    for (let i = 1; i <= ticks; i += 1) {
      rig.live.setPosition(i * 0.5);
      // Let the UDP packet be processed before moving hubClock.
      await new Promise((resolve) => setTimeout(resolve, 2));
      if (i < ticks) hubClock.advance(12.5);
    }
    hubClock.advance(POSITION_BROADCAST_MS);
    await viewer.snapshot(at(ticks * 0.5));
```
**Failure mode:** The sleep stands in for "the server has read Live's report", but nothing guarantees that. When the event loop is busy past 2 ms, the timer phase runs before the poll phase reads the datagram, so the test moves `hubClock` first. If that happens on the last tick, the final `advance(50)` runs before the hub sees position 40. The hub then holds it in a trailing flush on a manual clock nobody moves again, and the wait times out after 2 s with `got 25 that did not`. Executed: a 5 ms stall after the last `setPosition` fails 3 of 3 runs, and `bash docs/reviews/setlist-controller-16/repro/stalled-sleeps.sh` (every fixed sleep in the file followed by a 5 ms busy loop) is red on this test. The hub behaves correctly here; the defect is the test's synchronization.

**Recommended fix:** wait on an observed fact. A fresh viewer always gets the hub's newest snapshot on connect, so a probe that sees the position proves the server took it in.
```ts
async function ingested(rig: Rig, beats: number): Promise<void> {
  await vi.waitFor(
    async () => {
      const probe = await rig.connectViewer();
      try {
        expect((await probe.snapshot(loaded)).position).toBeCloseTo(beats, 3);
      } finally {
        probe.close();
      }
    },
    { timeout: 2000 },
  );
}
```
- `:247-252` becomes `rig.live.setPosition(i * 0.5); await ingested(rig, i * 0.5); if (i < ticks) hubClock.advance(12.5);`.
- `:220-222` becomes `rig.live.setPosition(1 + step); await ingested(rig, 1 + step);`.
- `:319-320` becomes `rig!.live.setPosition(heldBeat); await ingested(rig!, heldBeat);`.
- `:277-286` becomes `await ingested(rig, 4);`.

**Remediation brief**
- **Design intent:** The pacing tests drive the hub's position cap with a manual `hubClock`. Each one must only move that clock after the server has taken in the report it just sent, otherwise the hub sees a different elapsed time than the test intends. A new connection runs only `deliver()` for that one socket (`src/server/hub.ts:147-177`). It never touches `broadcasted`, `lastPlaybackBroadcastAt` or the trailing flush, so probing does not change what the counted viewer receives.
- **Full surface:** `test/hub-coalescing.test.ts:218-223`, `:246-252`, `:277-286` (the existing probe, folded into the helper), `:318-321`. Grep after the fix: `grep -n "setTimeout(resolve" test/hub-coalescing.test.ts` returns nothing.
- **Must preserve:** the exact counts `beforeBurst + 1` and `beforeBurst + 2` (`:215`, `:225`, `:232`), the 18 to 22 bound and the final position (`:259-261`), `holdPosition`'s held assertion (`:322`), and `fresh.received` having length 1 (`:297`). Probes are separate sockets and must be closed before the counted viewer's assertions run.
- **Do not touch:** the hub's pacing branch in `publish()` (`src/server/hub.ts:208-231`; Dismissed: the state machine is right).
- **Proof:** `bash docs/reviews/setlist-controller-16/repro/stalled-sleeps.sh` is red now (80 Hz test, `got 25`). After the fix it must print `stalled sleeps: 0` and pass. Then `for i in $(seq 10); do pnpm vitest run test/hub-coalescing.test.ts -t '20 Hz'; done` must pass 10 of 10 on a loaded machine.

### 3. The drain-recheck fallback is untested, unreachable from a browser, and polls every 10 ms forever on a peer that never drains: LOW
- **Location:** `src/server/hub.ts:97-111` (`waitForDrain`), `:120-122` (the `bufferedAmount` gate that enters it), `:40-42` (`DRAIN_RECHECK_MS`)
- **Attribution:** introduced. `git log --oneline -S'DRAIN_RECHECK_MS' adee302..HEAD` → `fcc69f0`.
- **Real-world trigger:** none from a stage page. The hub's own snapshot and heartbeat sends always set `inFlight`, so the only state with `bufferedAmount > 0` and no send in flight is a `ws` control frame (a pong) waiting in Node's buffer. Browsers never send a WebSocket ping. A non-browser client that pings does reach it, for example the test harness's `flush()` (`test/harness.ts:324-330`). Capped at LOW: no user path. `git grep -n "DRAIN_RECHECK\|writableNeedDrain\|bufferedAmount" test` finds no test, which breaks `test-every-fallback-path`.

**Evidence**
```ts
    if (state.tcp.writableNeedDrain) {
      state.tcp.once('drain', retry);
      state.stopWaiting = () => state.tcp.off('drain', retry);
    } else {
      const timer = setTimeout(retry, DRAIN_RECHECK_MS);
      timer.unref();
      state.stopWaiting = () => clearTimeout(timer);
    }
```
**Failure mode:** A pong stuck behind a half-open peer leaves `bufferedAmount` above 0 with `writableNeedDrain` false (a pong is far below the 16 KB high-water mark). Then `retry` calls `deliver`, which calls `waitForDrain`, which re-arms a 10 ms timer, until the OS gives up on the TCP connection. With no idle timeout, that can be many minutes. It is cheap and unref'd, but it is a polling loop no test has ever exercised, guarding a state that send completion already covers.

**Recommended fix:** gate on send completion alone and delete the drain wait.
```ts
type ClientState = {
  role: Role;
  inFlight: boolean;
  dirty: boolean;
  lastSent: string | null;
};
```
```ts
  const deliver = (socket: WebSocket, state: ClientState) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    const payload = forRole(latest, state.role);
    if (payload === state.lastSent) {
      state.dirty = false;
      return;
    }
    if (state.inFlight) {
      state.dirty = true;
      return;
    }
    state.dirty = false;
    state.inFlight = true;
    state.lastSent = payload;
    socket.send(payload, (error) => {
      state.inFlight = false;
      if (closed || error || socket.readyState !== WebSocket.OPEN) return;
      if (state.dirty) deliver(socket, state);
    });
  };
```
Also make these changes:
- Delete `import type { Socket } from 'node:net'` (`:3`), `DRAIN_RECHECK_MS` and its comment (`:40-42`), `clearWait` and `waitForDrain` (`:92-111`).
- Drop `tcp` and `stopWaiting` from the `ClientState` literal (`:150-157`).
- Reduce the close handler to `socket.on('close', () => clients.delete(socket));` (`:159-162`).
- Make the heartbeat's skip condition `socket.readyState !== WebSocket.OPEN || state.inFlight` (`:184`).
- Drop `clearWait(state);` from `close()` (`:239`).
- In the header comment (`:16-17`), change "still has a send in flight or buffered bytes waiting to drain" to "still has a send in flight".

**Remediation brief**
- **Design intent:** Each socket has at most one hub frame (snapshot or heartbeat) in flight. `ws` calls the send callback once that frame has gone to the kernel, which is the drain signal. While a frame is in flight, a new snapshot only marks the socket dirty, and the callback sends the newest one. This change intentionally drops one behaviour: a snapshot no longer waits behind a buffered control frame, and is queued after it in Node's buffer instead. That is at most one snapshot behind at most 125 bytes, which still meets "never append another snapshot". Finding 4 takes no code in this branch (Option B). The later acknowledgement sub-issue of #15 swaps this busy signal from "send completed" to "acknowledged" in the same `deliver()`, so this simplification is its starting point, not something it undoes.
- **Full surface:** `src/server/hub.ts:3`, `:16-17`, `:40-42`, `:53-60`, `:92-111`, `:113-137`, `:150-162`, `:182-192`, `:234-241`. Nothing outside `hub.ts` references these.
- **Must preserve:** a dirty socket is always re-delivered from the pending send's callback, both the snapshot callback (`:129-133`) and the heartbeat callback (`:186-190`). The `lastSent` dedupe (`:116-119`) stays. `close()` still terminates every socket and clears `clients`. Suites: `test/hub-coalescing.test.ts`, `test/reconnect.test.ts`, `test/server-connection.test.ts` (heartbeats and reconnects).
- **Do not touch:** the heartbeat's `inFlight` skip and its callback re-delivery (Dismissed: no silence risk), and `deliver()`'s `lastSent` dedupe.
- **Proof:** `git grep -n "bufferedAmount\|DRAIN_RECHECK\|writableNeedDrain\|stopWaiting" src/server/hub.ts` returns nothing, and `pnpm vitest run test/hub-coalescing.test.ts test/reconnect.test.ts test/server-connection.test.ts --maxWorkers=2` passes. If Nick keeps the `bufferedAmount` gate instead (Approach decisions), the proof is a new test in which a pong held behind `proxy.pause()` leaves the socket dirty and the next snapshot still arrives after `resume()`.

### 4. A slow socket still drains a kernel buffer's worth of stale snapshots, so #16's first acceptance criterion as written is not met: MEDIUM (capped); accepted for this branch, no code (Option B)
- **Location:** `src/server/hub.ts:120` (the busy test) and `:129-133` (the send callback that clears it); the test that cannot see it is `test/hub-coalescing.test.ts:114`
- **Attribution:** pre-existing, narrowed. At `adee302` every snapshot went onto every socket (`git show adee302:src/server/hub.ts | grep -n -A6 'publish(snapshot'`), so both Node's buffer and the kernel's held stale frames without bound. This branch removes Node's share and leaves the kernel's. It makes things better, not worse, but #16 states the stronger guarantee and the branch claims it.
- **Real-world trigger:** a stage tablet on congested Wi-Fi that drains slower than the hub's paced rate (20 Hz × ~3.4 KB, about 68 KB/s). The laptop's send buffer fills, so the page shows playback that far behind Live. The macOS default `sendspace` of 131,072 bytes holds about 38 such snapshots, roughly 1.9 s of playback, and autotuning can grow it to 4,194,304 bytes (about 1,200 snapshots). MEDIUM, capped: a lagging display tops out at MEDIUM, and the lag on a real link is arithmetic, not measured. Upgrade to HIGH if a throttled-link run shows a steady lag above 1 s. To check, run the server on the show laptop with one tablet behind a `dnctl`/`pfctl` dummynet pipe at about 300 kbit/s, play a song, and compare the page's bar with Live's (or read the socket's `Send-Q` in `netstat -an`).

**Evidence**
```ts
    if (state.inFlight || socket.bufferedAmount > 0) {
      state.dirty = true;
      ...
    socket.send(payload, (error) => {
      state.inFlight = false;
```
**Failure mode:** `ws` calls the send callback once the frame's bytes have gone to the kernel, not when the page has them. The hub therefore treats a socket as free while up to a send buffer of superseded snapshots is still queued for it in the kernel. Executed on macOS loopback: a scratch copy of the viewer coalescing test logged what the paused socket received after `resume()`. On both runs it got positions 1, 2, 3 … 134 (all superseded, 6,076 bytes each, about 814 KB), then 400, the newest. The page draws each stale frame on the way. The test's bound (`< 200` of 400) cannot catch this, and neither can Finding 1's replacement bound, by design.

**Recommended fix:** **Decided by Nick, 2026-11-25: Option B.** This branch takes no code for Finding 4.
- **Option B, decided:** #16 accepts the residual kernel-buffer lag. Its first acceptance criterion is reworded to "never queues stale snapshots in the server's own send buffer", and the lag is recorded as a known limit on epic #15. The orchestrator makes those issue edits, not remediation.
- **Option A, filed as a new sub-issue of #15, sized by the throttled-link measurement above:** the page sends a fixed acknowledgement frame after each snapshot it reads. The hub sends a socket its next snapshot only once the previous one is acknowledged, and otherwise marks it dirty, so at most one snapshot is ever outstanding per socket wherever its bytes are. If no acknowledgement arrives within a timeout, the hub sends the newest snapshot anyway, which covers a page that never acknowledges. The design notes below are that sub-issue's starting point, not work for this branch.

**Remediation brief** (this round: none; Finding 4 is out of the Remediation scope)
- **This branch:** no code, no test, and no comment change for Finding 4. Findings 1, 2, 3 and 5 are remediated as written. Finding 1's bound intentionally tolerates the kernel's stale frames.
- **Design notes for the #15 sub-issue (Option A):**
  - **The busy signal:** a socket is free only when the page has said it read the last snapshot. Acknowledgement replaces send completion as the busy signal, and a dirty socket gets exactly the newest snapshot when its acknowledgement arrives.
  - **Who acknowledges:** the acknowledgement is read on every socket, view-only ones included, before the `controls(role)` check drops their messages. Heartbeats are not acknowledged.
  - **The timeout:** it stays shorter than `SILENCE_MS - HEARTBEAT_MS` (`src/shared/heartbeat.ts`).
  - **Surface:** the shared frame constant, mirroring `HEARTBEAT`/`isHeartbeat`; `src/server/hub.ts` `ClientState`, `deliver`, the message handler (`:164-167`), the heartbeat loop and `close()`; `web/src/server-connection.ts:84-92`; `test/harness.ts` `connect()`, which must acknowledge too; and the slow-socket bound in `test/hub-coalescing.test.ts`, which tightens to "at most 2 delivered while paused".
  - **Proof:** a paused client receives at most 2 snapshots after `resume()`, the last one the newest; it is red at this branch's HEAD, where 134 stale frames arrive on macOS. A fallback test checks that a client that never acknowledges still gets the newest snapshot within the timeout.
- **Do not touch (this round):** `deliver()`'s busy test beyond Finding 3's change, `nonPositionKey` (Dismissed, and the cross-role flush is a nit), and `web/src/server-connection.ts`.

### 5. Comment hygiene: LOW (aggregated)
- `src/server/hub.ts:11`: "Sends the full snapshot on connect and on every change." → "Sends the full snapshot on connect and on every change, pacing position-only changes (below)."
- `test/hub-coalescing.test.ts:35`: "(~5 KB encoded snapshot)" → drop the size, or measure it (the finder measured 6,076 bytes) and name where it came from.
- `test/hub-coalescing.test.ts:111`: "Today's uncoalesced hub queues all 400 frames" → "An uncoalesced hub queues every streamed frame" (the line is rewritten by Finding 1 in any case).
- `test/hub-coalescing.test.ts:419`: "(window is closed for the next 50 ms; do NOT advance hubClock!)" → "(the window stays closed for 50 ms, so hubClock must not move here)."
- `test/hub-coalescing.test.ts:423`: "with zero hub throttle delay!" → "with no hub throttle delay."
- `test/hub-coalescing.test.ts:432`: "(significant change!)" → "(a significant change)".

## Needs Further Investigation

None open. The former item A (the kernel-buffer backlog) is now Finding 4, confirmed by execution after the second opinion. Its real-link measurement is that finding's upgrade check.

## Reviewed and Dismissed
- **Skipped heartbeats silencing a page** (`src/server/hub.ts:184`): a heartbeat is skipped only while a frame is already headed to that page, and the page restarts its silence timer on every message (`web/src/server-connection.ts:84-85`). A page whose kernel buffer is full is silent on base too.
- **`inFlight` stuck true, or a lost wake-up**: every dirty mark has a pending snapshot or heartbeat callback, or a drain wait. Error and closed callbacks clear `inFlight`, and a closed socket leaves `clients`.
- **`nonPositionKey` misclassifying** (`src/server/hub.ts:256-260`): it leaves out only `position`, `now.bar` and `now.fraction`, and keeps song, section, `next`, `bars`, whether the position is known, and every other snapshot and connections field. A moving position with `now === null` is paced; null to a number is significant. Connection lateness changes on cues, not ticks. The key is shared by every role, which is a nit (Minor), not a misclassification.
- **The pacing state machine** (`publish()`, `:195-231`): traced for a producer-only change, a value reverting to the broadcast one while a flush is pending, `close()` with a flush pending, and `clock.every` used as a one-shot under both clocks. Holds.
- **A new client during a held window**: it gets `latest`, and the trailing flush skips it through `lastSent` (covered at `test/hub-coalescing.test.ts:264`).
- **Existing rig tests now paced on real time** (`src/server/server.ts:37-40`, `hubClock` defaulting to `realClock`): the full suite shows no attributable failure (table above), and production runs both clocks on real time.
- **`expect(slow.received.length).toBe(beforePause)`** (`test/hub-coalescing.test.ts:101`, `:190`): a precondition that the pause took effect, which keeps the later counts meaningful.
- **`if (!role) return;` before the error handler** (`src/server/hub.ts:149`): unreachable: `shouldHandle` refuses a null role first.
- **The proxy's `pause()`/`resume()`** (`test/proxy.ts:118-130`): pausing the upstream read is the right way to push TCP backpressure onto the server without dropping bytes.

## Minor / nits
- `test/harness.ts:128` passes `hubClock: undefined` explicitly, so `{ ...DEFAULTS, ...options }` (`src/server/server.ts:103`) replaces `DEFAULTS.hubClock` with `undefined`. The rig works only because `startHub`'s parameter default is `realClock`. Leaving the key out when it is undefined would make `DEFAULTS.hubClock` the default that actually applies.
- The commit message has no body. The heartbeat's new rule, skipping a socket with a frame in flight, is stated only in the code comment (`whole-surface-of-a-change` asks the commit to say so).
- The significant-change test (`:300`) covers jump, section boundary, loop, end toggle, fade, arm, stop and Live disconnect, but not set change, count-in, chart revision, a song boundary or song meters. The key treats everything outside position progress as significant, so per-field tests add little.
- `test/hub-coalescing.test.ts:72`'s name bundles two rules (coalescing, and a healthy sibling) into one test (`tests-state-a-rule`).
- `nonPositionKey` puts `connections` in one key for every role (`src/server/hub.ts:256-259`), so a producer-only change counts as significant and also flushes a held position to viewers and leaders (`:208-215`, then `broadcast()`). They get one newer frame earlier than the 50 ms cap, never a stale one. #16 lists producer connections among the changes that flush immediately, and targets change connections at cue or press rate, not per Live tick. A per-role key (playback fields alone for viewers and leaders) would hold viewers' positions. Upgrade to LOW if a target is ever found reporting `state` or `list` per tick, since that would lift the cap for every role.

## Test quality
Tests added: 8 · green against `adee302` (assert nothing new): 2 · tautology shapes found: 3 restated predicates.
- `delivers significant state changes immediately to healthy siblings while a slow socket is paused` (`:167`) passes at base, because the old hub never blocked siblings either. It is a guard against a regression the new per-socket state could introduce (a shared busy flag would turn it red), and #16's acceptance criteria ask for it. Keep it, or fold its Stop assertion into the first test. Either way it is Nick's call under `tests-can-go-red`, whose exception does not cover a guard of this kind.
- The cue-timing test (`:386`) passes at base by design: R3 is "untouched", and the acceptance criteria require the test. Keep it.
- `:189` `expect(stopped.playing).toBe(false)`, `:381` `expect(disconnected.live).toBe('not-connected')` and `:434` `expect(...lateness.last).toBe(125)` each restate the predicate of the `snapshot()` wait just before them, so they cannot fail. The wait is the real assertion. Delete the three lines.
- No mocked unit, no self-built expectation, no snapshot files.

## Before opening the PR
- **CI readiness:** typecheck and lint pass. `pnpm test` will fail on `ubuntu-latest` (Finding 1) and is intermittent under load (Finding 2). The full-suite failures in `propresenter` and `set-builder-command` are pre-existing load sensitivity.
- **Commit hygiene:** one commit. The review folder `docs/reviews/setlist-controller-16/` (this doc and `repro/`) is untracked; commit it with the review or leave it out of the PR.
- **Likely reviewer asks:** how stale a page gets on a real slow link (Finding 4); why a second clock (`hubClock`) rather than the server's `clock`.

## Second opinion
An independent review in a separate thread, which read this review's finder output only after its own pass. Each item went through the disprove step above. Neither reviewer ran the e2e suite.

| # | Their claim | Their severity | Verdict here | Severity here |
| --- | --- | --- | --- | --- |
| 1 | The 80 Hz test (`:250`) waits a real 2 ms per UDP tick and then moves the manual hub clock; a last tick that lands after the final advance (`:254`) leaves the trailing timer unfired. "Caps rapid" has the same pattern with 10 ms waits. Fix: wait until the server ingested the tick, with a probe client. | HIGH | Confirmed, Finding 2 (reproduced 1 of 10 under load, 3 of 3 with a 5 ms stall; same fix and precedent) | MEDIUM |
| 2 | Coalescing covers only Node's buffer; the send callback fires once bytes reach the kernel (`hub.ts:120`, `:129`). With macOS `sendspace` 131072 and `autosndbufmax` 4194304, ~38 stale frames (~1.9 s at 20 Hz), up to ~1,200 autotuned. `:114` cannot catch it. Fix: app-level ack, or accept the risk and tighten the assertion. | HIGH | Confirmed, Finding 4 (promoted from Needs Further Investigation: executed, 134 stale frames drained on macOS loopback; their `sysctl` values verified) | MEDIUM, capped (HIGH on a measured lag above 1 s) |
| 3 | `nonPositionKey` puts `connections` in the key for every role (`hub.ts:256-259`), so producer-only changes flush the held position to viewers too. | LOW | Real; nit (Minor / nits) | nit |

- **DISAGREE, item 1 (HIGH → MEDIUM):** it is an intermittently red build with no user path. The rubric reserves HIGH for user outcomes (wrong results, lost work, auth, data). It is still a merge gate. Also, "caps rapid" (`:218-223`) shares the pattern but survived the 5 ms stall, because its `flush()` ping round-trip lets the server read the datagram first. It stays in Finding 2's Full surface as the same race in a narrower window.
- **DISAGREE, item 2 (HIGH → MEDIUM, capped):** the mechanism is proven, but the consequence is a page whose playhead lags. That is a display problem, which tops out at MEDIUM unless the lag on a real link is measured. The branch strictly shrinks the backlog compared with base, which held stale frames in Node's buffer and the kernel without bound. The upgrade check (a throttled-link run with a steady lag above 1 s) is in Finding 4. Agreed with them on the substance: #16's first acceptance criterion is not met, the `:114` bound cannot catch it, and the two fixes are an app-level acknowledgement or an accepted risk. Nick decided on the accepted risk (Option B), and the acknowledgement is filed as a new sub-issue of #15.
- **DISAGREE, item 3 (LOW → nit):** the flush matches #16, which lists producer connections among the changes that flush immediately. What it delivers is one newer frame earlier than the cap, never a stale one, and connections change at cue or press rate, not per Live tick. The upgrade condition is in Minor / nits.

## Verdict
**Not ready.** The gate is:
- **Findings 1 and 2:** test fixes, no production code; CI goes red without the first.
- **Finding 4 (decided, Option B, no code):** the orchestrator rewords #16's first acceptance criterion, records the known limit on epic #15, and files the acknowledgement as a new sub-issue of #15 before the PR claims to close #16.

Findings 3 and 5 are in this round's Remediation scope with Findings 1 and 2, so `/pr-review-remediate` works 1, 2, 3 and 5.

## Remediation, 2026-11-25
Scope per the Remediation scope note: Findings 1, 2, 3 and 5. Finding 4 took no code (Option B, follow-up #20). Base for every check: `adee302`; HEAD after the round: `78f391a`.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `9610bb2` finding 1: both slow-socket coalescing tests fail on Linux | red→green: `bash docs/reviews/setlist-controller-16/repro/linux-ci.sh` red at `fcc69f0` (`expected 400 to be less than 200`, `expected 401 to be less than 200`), then 8/8 passed in each of 3 runs after the fix and again at `63d9d90`. The base check (scratch worktree at `adee302` with HEAD's test files) was red on both tests: `expected 2759 to be less than 2759`, `expected 2588 to be less than 2587` | 2 new (the `STREAM_BYTES` measurement and its source), plus 4 lines of rewritten existing comments (`:35`, the old `:111` block) | proved by execution |
| 2 (MEDIUM) | `e57f628` finding 2: the 80 Hz pacing test races Live's UDP report against a 2 ms sleep | red→green: `bash docs/reviews/setlist-controller-16/repro/stalled-sleeps.sh` was red at `9610bb2` (80 Hz test, `got 25 that did not`) and after the fix prints `stalled sleeps: 0` with 5/5 passing. The 20 Hz block passed 10 of 10 with `--maxWorkers=2` at a load average of 45 to 160. `grep -n "setTimeout(resolve"` is empty | 0 | proved by execution |
| 3 (LOW) | `43425ae` finding 3: the drain-recheck fallback is untested and polls forever; `78f391a` follow-up (header wording) | red→green: `git grep -n "bufferedAmount\|DRAIN_RECHECK\|writableNeedDrain\|stopWaiting" src/server/hub.ts` went from 21 hits to none. `pnpm vitest run test/hub-coalescing.test.ts test/reconnect.test.ts test/server-connection.test.ts --maxWorkers=2` passes 31/31 | 2 lines of the rewritten header comment, which the brief required, plus 3 rewrapped lines in the follow-up | fixed (pr-review-finder: a harness against the real `startHub` with held send callbacks found no lost wake-up, no second queued snapshot and no send after close). Its one LOW nit, the header's "as soon as it drains", was fixed in `78f391a` |
| 5 (LOW, comment hygiene) | `63d9d90` finding 5: comment hygiene | read against the code: `hub.ts:10`, `test/hub-coalescing.test.ts` cue-timing comments (hubClock at 50, no throttle delay, a significant change). The `:35` and `:111` entries landed in `9610bb2` | rewritten only | n/a (prose) |
| 4 (MEDIUM, capped) | none, by scope | none | none | accepted (Option B), follow-up #20 |

Round checks at `78f391a` (lint, typecheck and check:private) and at `63d9d90` (full suite): `pnpm typecheck` passes, `pnpm lint` passes, and `pnpm check:private --range adee302..HEAD` plus the tree mode pass with exit 0. The script was run from `origin/main`, because this branch predates the check's merge (#17). The full suite (`pnpm vitest run --maxWorkers=2`, load average about 215) gave 101 of 102 files passing. Its one failure was `test/propresenter.test.ts` ("triggers a song's End as a group named End over one named Ending"), a file this branch does not touch, and it passed 385/385 alone twice: the pre-existing load sensitivity recorded above. E2E was not run.

### Known regressions, deferred
None.

### Rework briefs
- Finding 3 follow-up (`78f391a`). Achieve: the hub header says a dirty socket gets the newest snapshot when its in-flight send completes, not "when it drains". Preserve: the code, with no change outside the comment. Proof: a reading of `deliver()` and both send callbacks; lint and the three preserve suites pass. No scoped re-verify, because the change is prose only.
