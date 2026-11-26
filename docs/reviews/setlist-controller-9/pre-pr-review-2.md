# Pre-PR review: setlist-controller#9 connected devices and remote reload (second opinion)

**Branch:** `setlist-controller-9-devices-remote-reload` vs `origin/main` (merge-base `4f54d37`, "Merge pull request #24 from nick-vogel/setlist-controller-5-song-set-durations")
**Reviewed at:** HEAD `b5cceb6` ("setlist-controller#9 pre-PR review 1 remediation: the closure table and two approach decisions") + 0 files with uncommitted changes, 0 untracked files, 35 files total, +1965 / -86
**Reviewed against:** nick-vogel/setlist-controller#9 (body and acceptance criteria), epic #8, `docs/HANDOFF-setlist-controller-9.md`, `docs/merge-rules.md`, `.claude/rules/public-repository.md`, the global rules in `~/.claude/rules/`, and the Approach decisions and remediated findings of `docs/reviews/setlist-controller-9/pre-pr-review-1.md`. The repo has no `AGENTS.md` or `CLAUDE.md`, and no `CONTEXT.md`, ADRs, specs, or plans.
**Date:** 2026-11-25
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | pass |
| Type check | `pnpm typecheck` | pass |
| Private terms | `pnpm check:private --range origin/main..HEAD` | exit 0 |
| Commit authors | `git log --format='%h %an <%ae> \| %cn <%ce>' 4f54d37..HEAD` | GitHub noreply address only across all 13 commits |
| Em-dashes in added lines | `git diff 4f54d37 -- ':!docs/reviews'` searched for U+2014 | none |
| Unit suite | `pnpm exec vitest run --maxWorkers=2` | 114 files passed, 3509 passed, 5 skipped, exit 0 |
| Build + Devices e2e | `pnpm build && pnpm exec playwright test e2e/devices.spec.ts --workers=2` | 8 passed (webkit-ipad and chromium-android) |
| Full e2e | not run here | other suites share this machine; only `e2e/devices.spec.ts` ran |
| Prior review 1 repros | `node docs/reviews/setlist-controller-9/repro/pacing-leak.mts` and `pnpm exec vitest run --root docs/reviews/setlist-controller-9/repro` | both pass at HEAD (`[0,1]` exit 0; 1 of 1 passed) |
| Test audit (green at base) | not run in a base checkout | non-Claude review does not run `git worktree add`; all 54 added tests were read for tautology shapes instead |
| Finding 1 repro | `node docs/reviews/setlist-controller-9/repro/dirty-leak-on-unchanged-role.mts` at HEAD, and against `git archive 4f54d37 src` in a `mktemp -d` folder | HEAD: `producer-only: [0,1,2]`, `revert: [0,1,3]` (exit 1); base: `[0,1]` for both |
| Finding 1 recommended fix | applied in a `mktemp -d` copy of `src/` and checked against producer-only, revert, trailing flush, and reload-plus-held-position cases | all pass: `[0,1]` held, `[0,1,2]`/`[0,1,3]` on flush, `[0,1]` with `reloads=1` |
| Finding 2 repro | `node docs/reviews/setlist-controller-9/repro/offline-row-contrast.mts` in Chromium against built `dist/web` | exit 1: `.device.offline .device-status` measures `3.79:1` at `18px` weight 400 (`< 4.5:1`); `.device-name` measures `6.94:1` |

**Overall:** The connected devices registry, per-role client IDs, cross-tab device name sync, battery reporting, offline history, setup screen polling, and producer-only Reload and Clear offline all meet #9's acceptance criteria, and lint, typecheck, private-terms check, all 3509 unit tests, and all 8 devices e2e tests are green. Every finding from pre-PR review 1 was closed, except that finding 1's `deliver`/`pump` split dropped the pre-`inFlight` `lastSent` check, leaving a narrow LOW pacing leak when a producer-only update or revert coincides with an in-flight viewer send (finding 1 below). Measuring the computed colours that review 1 left under Needs Further Investigation also confirms that offline rows' secondary text falls to 3.79:1 contrast (finding 2 below, LOW). Neither finding blocks opening the PR; both are small fixes that can either ride a quick pass before merge or ship as follow-ups.

## Prior-review closure
- **Pre-PR review 1 finding 1 (MEDIUM, pacing leak on completed send):** Fixed for the general case (`32e91d5`, `pacing-leak.mts` exits 0, new test in `test/hub-coalescing.test.ts` passes), but moving `payload === state.lastSent` into `pump()` introduced a narrower LOW leak on unchanged-role broadcasts and reverts while busy (Finding 1 below).
- **Pre-PR review 1 finding 2 (LOW, reload dropped on wake-replaced socket):** Fully fixed (`959f483`, repro and new test in `test/server-connection.test.ts` pass).
- **Pre-PR review 1 finding 3 + rework (LOW, shared client ID and stale tab name):** Fully fixed (`bf7faf9` + `c5e66b8`, unit tests in `test/device-settings.test.ts` and new e2e case in `e2e/devices.spec.ts` pass).
- **Pre-PR review 1 finding 4 (LOW, comment hygiene):** Fully fixed (`ea8093a`, verified against `web/src/App.tsx` and `web/src/DevicesPanel.tsx`).
- **Pre-PR review 1 Needs Further Investigation A (offline row contrast):** Confirmed by Chromium measurement as Finding 2 below.

## Approach decisions
Carried forward from setlist-controller#16 and pre-PR review 1:
- **Drain detection:** `ClientState.inFlight` (cleared by the `ws` send callback) is the hub's only busy signal; no `bufferedAmount` polling.
- **Duplicate suppression:** `deliver()` deduplicates per socket via `forRole(latest, state.role) === state.lastSent` before marking `dirty`; `broadcast()` calls `deliver(socket, state)` for every client; `publish()`'s early return calls `deliver` for every client only when `stopFlush` was active.
- **Pacing tests' synchronization:** wait on `ingested(rig, beats)` or a direct `startHub` with `manualClock`, never a fixed real-time sleep.
- **Busy socket after a send completes:** a completed send pumps again only when a frame waits or a broadcast that changed that socket's own role payload marked `dirty` while busy. Frames are pumped by `sendToDevice` directly and never set `dirty`.
- **A reload frame on the socket a wake replaces:** the page reads a reload on either of its sockets, before the `socket !== opened` guard.
- **Client ID per role, shared browser name:** client ID is keyed per role (`setlist-controller.client-id.<role>`); device name stays one key per browser (`setlist-controller.device-name`) and follows other tabs through `watchDeviceName` on the `storage` event for its own key or `null` (`clear()`).

Added in this review:
- **Offline device row styling (finding 2):** distinguish offline rows with a darker surface (`#1b1b1b`, matching `.device-name-input` and `.connection-button`), dashed `#333` border, and `#bbb` device name instead of `opacity: 0.7`, keeping all text at or above 7.4:1 contrast.

## Confirmed Issues

### 1. `deliver()` marks a busy socket dirty even when its own role payload did not change, leaking the next held position past the ~20 Hz cap : LOW
- **Location:** `src/server/hub.ts:107-114`
- **Attribution:** Introduced by `32e91d5` ("setlist-controller#9 pre-PR review 1 finding 1: a completed send no longer delivers a held position"). `git show 4f54d37:src/server/hub.ts` checked `const payload = forRole(latest, state.role); if (payload === state.lastSent) { state.dirty = false; return; }` before `if (state.inFlight) { state.dirty = true; return; }`. Commit `32e91d5` split `deliver` and `pump`, leaving the `lastSent` check inside `pump` while putting `if (state.inFlight)` in `deliver`.
- **Real-world trigger:** During a song on congested stage Wi-Fi, a band phone (viewer) has a snapshot send in flight (`inFlight = true`, `lastSent = snap(1)`). Before that send finishes, either a producer-only update fires `broadcast()` (another device connects, changes battery/name, or leaves; or a connection target reports a cue or lateness update) or a held position reverts to the last broadcast (`src/server/hub.ts:221-225`). `deliver()` sets `state.dirty = true` on the busy viewer even though `latest.playback === state.lastSent`. If a position-only update arrives inside the 50 ms window before the in-flight send completes, the callback sees `state.dirty === true` and sends that held position immediately instead of holding it for the trailing flush. Consequence: at most one extra early frame per coinciding producer-only event or revert (not sustained 80 Hz saturation) and the position itself is valid, so LOW.

**Evidence**
```ts
const deliver = (socket: WebSocket, state: ClientState) => {
  if (closed || socket.readyState !== WebSocket.OPEN) return;
  if (state.inFlight) {
    state.dirty = true;
    return;
  }
  pump(socket, state);
};
```

**Failure mode** - `node docs/reviews/setlist-controller-9/repro/dirty-leak-on-unchanged-role.mts` publishes `snap(1)` (broadcast, in flight on viewer), then either publishes a producer-only connection change followed by held `snap(2)` or publishes held `snap(2)`, reverts to `snap(1)`, and publishes held `snap(3)`, all without advancing `clock`. At HEAD: `producer-only: [0,1,2]`, `revert: [0,1,3]`, exit 1. Against base (`4f54d37`): `[0,1]` for both.

**Recommended fix**
```diff
   const deliver = (socket: WebSocket, state: ClientState) => {
     if (closed || socket.readyState !== WebSocket.OPEN) return;
+    if (forRole(latest, state.role) === state.lastSent) {
+      state.dirty = false;
+      return;
+    }
     if (state.inFlight) {
       state.dirty = true;
       return;
     }
     pump(socket, state);
   };
```

Audit of this diff against the current code: `deliver()` is only called for snapshots (on connection at `:199`, in `broadcast()` at `:156`, and on revert in `publish()` at `:224`). Per-socket frames (`RELOAD`) are queued and pumped exclusively through `sendToDevice` -> `pump` (`:139-146`), and the send callback checks `state.frames.length > 0 || state.dirty` (`:133`), so returning early in `deliver()` when the socket's snapshot equals `lastSent` can never strand a waiting frame. Clearing `state.dirty = false` on equality restores base (`4f54d37`) behaviour, preventing a stale dirty flag from surviving a revert. Failure of the fix itself: none new; a send error while busy drops `dirty` with the closed socket as before. Verified in a `mktemp -d` copy of `src/`: producer-only, revert, trailing flush, and reload-plus-held-position cases all pass.

**Remediation brief**
- **Design intent:** Each socket has at most one send in flight (`inFlight`). `deliver()` handles snapshot broadcasts and marks a busy socket `dirty` only when `forRole(latest, state.role)` actually differs from `state.lastSent`; when they match, `dirty` is cleared so a producer-only update or a revert never primes a busy viewer to send a later held position early. Per-socket frames wait in `state.frames` and are pumped directly by `sendToDevice()` and the send callback, independent of `dirty`.
- **Full surface:** `src/server/hub.ts:107-114` (`deliver`); add a red-first regression test in `test/hub-coalescing.test.ts` beside the existing held-position test (`:491-515`) covering a producer-only publish (or revert) while a viewer's send is in flight followed by a held position-only publish.
- **Must preserve:** `docs/reviews/setlist-controller-9/repro/pacing-leak.mts` exits 0; `test/hub-coalescing.test.ts` (all slow-socket, reload-on-paused-socket, 20 Hz cap, revert-sync, and held-position tests); `test/devices-hub.test.ts`; `test/devices.test.ts`; `test/producer.test.ts`.
- **Do not touch:** `pump()`'s own `if (payload === state.lastSent) return;` (`src/server/hub.ts:122`), `sendToDevice()` calling `pump()` directly (`:144`), and `devices` in `nonPositionKey` (`:279`; Dismissed).
- **Proof:** `node docs/reviews/setlist-controller-9/repro/dirty-leak-on-unchanged-role.mts` exits 1 at HEAD (`[0,1,2]` and `[0,1,3]`) and must exit 0 (`[0,1]` for both) after the fix, alongside `pnpm exec vitest run --maxWorkers=2 test/hub-coalescing.test.ts test/devices-hub.test.ts test/devices.test.ts test/producer.test.ts`.

### 2. Offline device rows' secondary text falls to 3.79:1 contrast, below WCAG AA 4.5:1 : LOW
- **Location:** `web/src/styles.css:1144-1147`
- **Attribution:** Introduced by `d70bd51` ("setlist-controller#9 the Devices panel: each page's name, battery and hello, and Reload from the producer page").
- **Real-world trigger:** Whenever any named device sleeps or closes its browser, its offline row on the producer page and on `/setup` renders `.device-role`, `.device-status` ("Offline, last seen ..."), and `.device-battery` in `#aaa` at `18px` weight 400 (normal text under WCAG 2.1, which requires 4.5:1 contrast; large text begins at 24px regular or 18.67px bold). Applying `opacity: 0.7` to the whole `.device.offline` card composites both `#aaa` text and `#2a2a2a` card fill against the `#111` root background, reducing contrast to 3.79:1. Consequence: reduced legibility of offline rows on stage screens, so LOW.

**Evidence**
```css
.device.offline {
  border-style: dashed;
  opacity: 0.7;
}
```

**Failure mode** - `node docs/reviews/setlist-controller-9/repro/offline-row-contrast.mts` opens the built producer page in Chromium, disconnects a named viewer device, and computes WCAG 2.1 contrast from the rendered styles: `status/role/battery contrast: 3.79:1 (18px weight 400)`, `name contrast: 6.94:1 (18px weight 700)`, exit 1.

**Recommended fix**
```diff
 .device.offline {
   border-style: dashed;
-  opacity: 0.7;
+  border-color: #333;
+  background: #1b1b1b;
+}
+
+.device.offline .device-name {
+  color: #bbb;
 }
```

Audit of this diff against the current code: removing `opacity: 0.7` keeps `.device-role`, `.device-status`, and `.device-battery` at `#aaa` on `#1b1b1b` (computed WCAG contrast `7.41:1`), and `.device-name` at `#bbb` on `#1b1b1b` (`8.97:1`). Offline rows remain clearly distinguishable from online rows (`#2a2a2a` fill, solid `#444` border, `#eee` name) and from red offline connection targets (`.connection.offline`), using the `#1b1b1b` surface already established by `.device-name-input` and `.connection-button` in the same block. Failure of the fix itself: none; all markup classes stay unchanged.

**Remediation brief**
- **Design intent:** Offline device rows are visually quieter than online rows without looking like a fault (grey, not red) while keeping every text element readable on dark stage screens at or above WCAG AA 4.5:1 contrast.
- **Full surface:** `web/src/styles.css:1143-1147` (`.device.offline`). No TSX changes required; `DevicesPanel` already applies `device offline` on both the producer page and `/setup`.
- **Must preserve:** offline rows carry the `offline` class (`test/devices-panel.test.ts:70`, `e2e/devices.spec.ts`); online `.device` rows keep `#2a2a2a` fill and solid `#444` border; `.connection.offline` keeps its red border/background (`web/src/styles.css:1242-1252`).
- **Do not touch:** `.connection-button.unavailable` `opacity: 0.4` (disabled controls are exempt from WCAG 1.4.3 contrast and match repo precedent across `web/src/styles.css`).
- **Proof:** `pnpm build && node docs/reviews/setlist-controller-9/repro/offline-row-contrast.mts` exits 1 at HEAD (`3.79:1`) and must exit 0 (`>= 4.5:1` for both status/role/battery and name) after the fix.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- **Per-role client ID with browser-shared device name (`web/src/device-settings.ts:252-302`, `web/src/App.tsx:78-84`)** : Explicitly decided by Nick; client ID is per role, device name is one per browser and follows other tabs through `storage` events.
- **`watchDeviceName` not checking `event.storageArea` (`web/src/device-settings.ts:296-299`)** : `grep -rn sessionStorage web/src src/` returns zero hits; no page uses `sessionStorage`.
- **Leader Timeline view omits `DeviceNameField` (`web/src/App.tsx:358-373`)** : Intentional and documented at `web/src/App.tsx:273-274`; Timeline is a full-viewport rehearsal canvas with a one-tap switcher back to Setlist.
- **`Setup` page initializing `readClientId` and `watchDeviceName` (`web/src/App.tsx:78-84`)** : Benign; `/setup` passes `hello = null` (`App.tsx:153`), sends no hello (per Nick's decision), and disables `useBattery(!setup)`.
- **No standalone unit test for `parseDeviceCommand` (`src/shared/command.ts:102-114`)** : Mirrors in-repo precedent (`parseCommand` and `parseConnectionCommand` likewise have no standalone unit tests and are covered via hub integration tests, here `test/devices-hub.test.ts:118-194`).
- **`devices` in `nonPositionKey` (`src/server/hub.ts:276-280`)** : Mirrors `connections` at base and Review 1's Do-not-touch list; flushing a held position on a device registry change is rare and preserves the steady-state 20 Hz cap.
- **Role spoofing through a `hello` (`src/server/hub.ts:176-180`)** : `devices.hello(socket, role, hello)` always records the socket's authenticated `role` from `roleOf(request)`, never a client-supplied role.
- **One socket rotating client IDs bypassing the 50-offline cap (`src/server/devices.ts:44-48, 54-55`)** : `hello()` calls `detach(socket)` when a socket switches client IDs, running the `MAX_OFFLINE_DEVICES = 50` eviction on every switch.
- **`createDeviceRegistry` defaulting to `Date.now` instead of `hubClock` (`src/server/hub.ts:83`)** : Required; `lastSeen` is formatted as a wall-clock time via `new Date(lastSeen).toLocaleTimeString(...)`, whereas `hubClock` is monotonic (`performance.now()` or test `manualClock()` starting at 0).

## Minor / nits
- `README.md:49`: the setup-screen paragraph directly below the new Devices paragraph still lists the laptop-only routes without mentioning the devices list (the new paragraph at line 47 already documents it).
- `web/src/App.tsx:79,88`: if two view-only tabs in one browser have no custom device name and pick different band parts without reloading, `PART_KEY` is not watched on `storage`, so the untouched tab keeps its older default name until reload.
- `test/battery.test.ts:62-70`: covers `stop()` before `getBattery()` resolves, not `stop()` before `getBattery()` rejects (the guard at `web/src/battery.ts:30` is identical in form).

## Test quality
Tests added: 54 (50 unit across `test/battery.test.ts`, `test/devices.test.ts`, `test/devices-hub.test.ts`, `test/devices-panel.test.ts`, `test/device-settings.test.ts`, `test/server-connection.test.ts`, `test/hub-coalescing.test.ts`, and `test/setup-screen.test.ts`; 4 e2e in `e2e/devices.spec.ts`). Green against `$BASE`: not executed here (non-Claude review does not run `git worktree add`; pre-PR review 1 verified the earlier 37 tests against `4f54d37`, and all 17 tests added since then exercise behaviour introduced in `32e91d5`, `959f483`, `bf7faf9`, and `c5e66b8`). Tautology shapes found: 0. Every added test drives the real module or server, asserts concrete output or DOM/socket state, names the rule it checks, and declares its environment limits where fakes or static renders are used.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm check:private --range origin/main..HEAD`, `pnpm exec vitest run --maxWorkers=2` (114 files, 3509 passed, 5 skipped), `pnpm build`, and `pnpm exec playwright test e2e/devices.spec.ts --workers=2` (8 passed) are all green at `b5cceb6`.
- **Commit hygiene:** Working tree had 0 uncommitted changes at review time; commit the review doc and its two repro scripts under `docs/reviews/setlist-controller-9/` (or remediate the two LOW findings first). Also run `pnpm check:private --stdin` on the PR title and body per `docs/merge-rules.md`.
- **Likely reviewer asks:** None beyond the two LOW findings above.

## Verdict
**Ready with follow-ups.** Zero CRITICAL, zero HIGH, zero MEDIUM, and two LOW findings (`src/server/hub.ts:107-114` unchanged-role `dirty` leak and `web/src/styles.css:1144-1147` offline row contrast). Neither blocks opening the PR; both are small enough to fix in a short remediation pass before merge or track as follow-ups.
