# Pre-PR review: setlist-controller#9 connected devices and remote reload

**Branch:** `setlist-controller-9-devices-remote-reload` vs `origin/main` (merge-base `4f54d37`, "Merge pull request #24 from nick-vogel/setlist-controller-5-song-set-durations")
**Reviewed at:** HEAD `33c71fe` ("setlist-controller#9 code review: one source for the role labels, and four small cleanups") + 0 files with uncommitted changes, 0 untracked files, 32 files total, +1450 / -92
**Reviewed against:** nick-vogel/setlist-controller#9 (body and acceptance criteria), epic #8, #11 (blocked by #9), `docs/HANDOFF-setlist-controller-9.md`, `docs/merge-rules.md`, `.claude/rules/public-repository.md`, the global rules in `~/.claude/rules/`, and the Approach decisions of `docs/reviews/setlist-controller-16/pre-pr-review-1.md` and `pre-pr-review-2.md`. The repo has no `AGENTS.md` or `CLAUDE.md`, and no `CONTEXT.md`, ADRs, specs or plans.
**Date:** 2026-11-25
**Reviewer:** 2 code-review agents + 1 base-checkout test audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | pass |
| Type check | `pnpm typecheck` | pass |
| Unit suite | `pnpm vitest run --maxWorkers=2` | 114 files, 3504 passed, 5 skipped, exit 0 |
| Devices e2e | `pnpm build && pnpm exec playwright test e2e/devices.spec.ts` | 6 passed (webkit-ipad and chromium-android) |
| Full e2e | not run here | other agents share this machine; the handoff reports 190 passed at `33c71fe` |
| Private terms | `pnpm check:private --range origin/main..HEAD` | exit 0, with the private list present at `~/.config/setlist-controller/private-terms.txt` |
| Commit authors | `git log --format='%an <%ae> \| %cn <%ce>' 4f54d37..HEAD` | GitHub noreply address only |
| Em-dashes in added lines | `git diff 4f54d37`, added lines searched for U+2014 | none |
| Test audit (green at base) | branch tests copied into a scratch worktree at `4f54d37`, run there, worktree removed | 36 of 37 added tests red at base; 1 is Linux-only and skipped on macOS; every changed test green at base is a fixture-only change |
| Finding 1 repro | `node docs/reviews/setlist-controller-9/repro/pacing-leak.mts` at HEAD and against `git archive 4f54d37 src` | HEAD `[0,1,2]` exit 1, base `[0,1]` exit 0 |
| Finding 1 recommended fix | the fix below applied in a scratch worktree at HEAD, then the repro, `tsc`, and 5 hub and device suites | repro exit 0; `tsc` clean; 54 of 54 passed |
| Finding 2 repro | `pnpm vitest run --root docs/reviews/setlist-controller-9/repro` | red at HEAD: `expected +0 to be 1` |
| #16 frame queue questions | code trace of `src/server/hub.ts:102-133`, `:191-195` | no frame is sent while in flight, none is dropped while the socket is open, `lastSent` dedupe intact; see Dismissed |
| Role spoofing through a hello | code trace of `src/server/hub.ts:163-166` | the socket's role is recorded, never the hello's |

**Overall:** The registry, the producer-only gates, the setup endpoint, the hello on every socket and the panel all do what #9 asks, and the suites and the devices e2e are green. One defect undoes part of #16: the hub's send callback now delivers a held position on every completed send, so the ~20 Hz cap no longer holds for a busy socket (finding 1). Fix finding 1 before the PR opens. Findings 2 and 3 are LOW and can ride the same remediation, and finding 3 waits on Nick's call on decision 4.

## Approach decisions
Carried forward from setlist-controller#16:
- **Drain detection:** `ClientState.inFlight` (cleared by the `ws` send callback) is the hub's only busy signal; no `bufferedAmount` polling.
- **Duplicate suppression:** `deliver()` deduplicates per socket via `payload === state.lastSent`; `broadcast()` calls `deliver(socket, state)` for every client; `publish()`'s early return calls `deliver` for every client only when `stopFlush` was active.
- **Pacing tests' synchronization:** wait on `ingested(rig, beats)` or a direct `startHub` with `manualClock`, never a fixed real-time sleep.

Added in this review:
- **Busy socket after a send completes (finding 1):** a completed send pumps again only when a frame waits or a broadcast marked the socket `dirty` while it was busy, as at base (`798020c`). `dirty` is a pending flag, not a busy signal, so the inFlight decision above stands. Frames are pumped by `sendToDevice` directly and never set `dirty`.
- **A reload frame on the socket a wake replaces (finding 2):** the page reads a reload on either of its sockets, before the `socket !== opened` guard.
- **Client ID per role, and the name follows other tabs (finding 3, Nick 2026-11-26):** Nick approved both halves of finding 3's fix: (a) the client ID is keyed per page role (`` `${CLIENT_ID_KEY}.${role}` ``), so a browser holding the producer page and a leader page shows two rows; (b) `App` re-reads the stored device name on the window's `storage` event, so a name typed in one tab reaches the other tab's hello. This replaces implementer decision 4 (one client ID per browser). His earlier "Keep" in the implementer's thread came before this finding reached him.

Added in remediation 1:
- **The name follows other tabs (finding 3 (b)):** `watchDeviceName(page, storage, onName)` in `web/src/device-settings.ts` listens for the `storage` event and returns the function that stops it, in the shape of `watchBattery` (`web/src/battery.ts`); `App` wires it to `window` in an effect. It reads the name again only for the device name's key, or a null key (a `clear()`), so another tab storing some other setting never puts the stored name over this tab's.
- **The name stays one per browser:** only the client ID is keyed per role, so the producer page and a view-only page in one browser are two rows with one name, told apart by their roles (`e2e/devices.spec.ts`, "one browser is one device for each page role").

## Remediation scope
Nick 2026-11-26: remediate all four Confirmed findings, finding 3 with both (a) and (b). Implementer decisions 1 to 3 stand as written below.

## Implementer decisions (decided by Nick)
The implementer made four calls the issue did not specify. This review's view of each:
1. **"Battery not reported" in place of the issue's em-dash.** Sound: the no-em-dash rule covers shipped UI strings, and the words read better on a screen reader. No change.
2. **The setup screen sends no hello, so it is not listed.** Sound and documented at `web/src/App.tsx:147-149`. The laptop appears through its producer page.
3. **A cap of 50 offline devices, the one offline longest dropped.** Sound: it bounds a page that changes client ID on every socket. The eviction keeps the newest offline device (`src/server/devices.ts:45-47`). See Minor for the one-socket rotation case.
4. **Tabs in one browser share one client ID.** This is finding 3: pages of different roles in one browser overwrite one row, and a second tab puts its stale name back. Nick decided per role, plus the `storage` event re-read (see Approach decisions).

## Confirmed Issues
### 1. A completed send now delivers a held position past the ~20 Hz cap, so #16's pacing does not hold for a busy socket : MEDIUM
- **Location:** `src/server/hub.ts:105-123`
- **Attribution:** Introduced by `cb4638b` ("setlist-controller#9 the hub's device registry: hello, offline rows, Clear offline and Reload"). `git log --oneline -S'state.frames.shift()' 4f54d37..HEAD` names only that commit. At base the callback read `if (state.dirty) deliver(socket, state);` and `dirty` was set only by a `deliver` call that found the socket busy, which only `broadcast()`, a new connection and the revert path make.
- **Real-world trigger:** a band phone on congested stage Wi-Fi, whose kernel send buffer is full, so each send's callback fires late, after one or more held position publishes. Every completion then sends `latest`, so the socket is fed at its drain rate (Live reports position at about 80 Hz) instead of about 20 Hz, which keeps a link that base would let drain saturated. On loopback the same leak needs two position-only publishes in one event-loop turn. Severity MEDIUM, capped: upgrade to HIGH if a throttled-link run shows a socket that drains 20 to 80 snapshots a second stays a kernel buffer behind at HEAD and catches up at base. Check via the slow-socket proxy in `test/hub-coalescing.test.ts:106-172` with a rate limit in place of `pause()`.

**Evidence**
```ts
const deliver = (socket: WebSocket, state: ClientState) => {
  if (closed || socket.readyState !== WebSocket.OPEN || state.inFlight) return;
  let payload = state.frames.shift();
  if (payload === undefined) {
    payload = forRole(latest, state.role);
    if (payload === state.lastSent) return;
    state.lastSent = payload;
  }
  send(socket, state, payload);
};
// send(): socket.send(payload, (error) => { state.inFlight = false; ...; deliver(socket, state); });
```
**Failure mode** - The repro starts a hub with a `manualClock`, connects one viewer, advances 50 ms, then publishes position 1 (broadcast, send in flight) and position 2 (position-only, inside the window, held for the trailing flush) in the same turn, and never advances the clock again. HEAD: `viewer received positions [0,1,2]`, exit 1. Base: `[0,1]`, exit 0. The heartbeat's and a reload frame's callbacks leak a held position the same way, less often. The comments at `src/server/hub.ts:22-23` ("pure intra-section position ticks are paced") and `:102-104` no longer describe the code.

**Recommended fix**
```diff
 type ClientState = {
   role: Role;
   inFlight: boolean;
   frames: string[];
+  dirty: boolean;
   lastSent: string | null;
 };
@@
   const deliver = (socket: WebSocket, state: ClientState) => {
-    if (closed || socket.readyState !== WebSocket.OPEN || state.inFlight) return;
+    if (closed || socket.readyState !== WebSocket.OPEN) return;
+    if (state.inFlight) {
+      state.dirty = true;
+      return;
+    }
+    pump(socket, state);
+  };
+
+  const pump = (socket: WebSocket, state: ClientState) => {
+    if (closed || socket.readyState !== WebSocket.OPEN || state.inFlight) return;
     let payload = state.frames.shift();
     if (payload === undefined) {
+      state.dirty = false;
       payload = forRole(latest, state.role);
       if (payload === state.lastSent) return;
       state.lastSent = payload;
     }
     send(socket, state, payload);
   };
@@
     socket.send(payload, (error) => {
       state.inFlight = false;
       if (closed || error || socket.readyState !== WebSocket.OPEN) return;
-      deliver(socket, state);
+      if (state.frames.length > 0 || state.dirty) pump(socket, state);
     });
@@ sendToDevice
       if (!state.frames.includes(frame)) state.frames.push(frame);
-      deliver(socket, state);
+      pump(socket, state);
@@ connection
       frames: [],
+      dirty: false,
       lastSent: null,
```
Audit of this diff against the current code: `deliver` keeps its closed and open guards; the in-flight early return becomes "mark dirty and return", which is base behaviour. `pump` keeps the frame-first order, the `lastSent` dedupe and the in-flight guard. The callback no longer pumps unconditionally: it pumps when a frame waits (so a queued reload still goes out once the link drains) or when a broadcast arrived while busy (base behaviour). `sendToDevice` calls `pump`, so a reload never sets `dirty` and its completion sends no held position. The heartbeat still skips a busy socket (`:193`) and goes through `send`, so its completion pumps only on a frame or `dirty`, as base's `if (state.dirty) deliver` did. Failure of the fix itself: a socket marked dirty whose next send errors drops the dirty flag with the socket, which is base behaviour; a reconnect gets the newest snapshot on connect (`:186`). Verified in a scratch worktree: the repro exits 0, `tsc` is clean, and `test/hub-coalescing.test.ts`, `test/devices-hub.test.ts`, `test/devices.test.ts`, `test/server-connection.test.ts` and `test/producer.test.ts` pass (54 tests).

**Remediation brief**
- **Design intent:** Each socket has at most one send in flight (`inFlight`, set in `send`, cleared in the `ws` callback). Position-only publishes inside the 50 ms window update `latest` and do not call `broadcast()`; the trailing flush does. A socket that a broadcast reaches while busy is marked `dirty` and gets the single newest snapshot when its send completes. Frames for one socket (a reload, and #11's messages later) wait in `frames` and go ahead of the next snapshot, never coalesced and never dropped while the socket is open.
- **Full surface:** `src/server/hub.ts:61-67` (`ClientState`, add `dirty`), `:102-104` (the comment above `deliver`: correct it to say the callback sends again only for a waiting frame or a broadcast that found the socket busy), `:105-114` (`deliver`, split into `deliver` and `pump`), `:116-123` (`send` callback), `:127-133` (`sendToDevice` calls `pump`), `:150-155` (initial state, `dirty: false`). Add a red-first test in `test/hub-coalescing.test.ts`, in the direct-`startHub` shape of `heldWindow()` at `:455-489`: two position-only publishes in one turn inside a frozen window reach a viewer as one broadcast until the flush.
- **Must preserve:** frames go out before the next snapshot and are never dropped while the socket is open (`test/hub-coalescing.test.ts:146` "delivers a reload to a paused slow socket once its link drains"); a reload reaches every socket of its target and no other (`test/devices-hub.test.ts`, the Reload describe); the `lastSent` dedupe and the revert sync (`test/hub-coalescing.test.ts:491`, `:501`); the slow-socket coalescing and healthy-sibling tests (`:107`, `:174`, `:217`); the 20 Hz cap and 80 Hz collapse tests (`:252`, `:285`); the new-client and immediate-flush tests (`:312`, `:339`); heartbeat skips a busy socket (`:191-195`).
- **Do not touch:** `devices` in `nonPositionKey` (`:261-266`), so a device change flushes at once (Dismissed, "a hello flushes held positions to viewers"); the `includes` dedupe in `sendToDevice` (Dismissed, "a reload queued twice").
- **Proof:** `node docs/reviews/setlist-controller-9/repro/pacing-leak.mts` exits 1 now (`[0,1,2]`) and must exit 0 (`[0,1]`) after. The new test in `test/hub-coalescing.test.ts` must be seen red at `33c71fe` before the fix.

### 2. A Reload that reaches the socket a wake is replacing is dropped, so the producer's tap does nothing : LOW
- **Location:** `web/src/server-connection.ts:95-101`
- **Attribution:** Introduced by `d70bd51` ("setlist-controller#9 the Devices panel: each page's name, battery and hello, and Reload from the producer page"); `git log --oneline -S'isReload(event.data)' 4f54d37..HEAD` names only it.
- **Real-world trigger:** a stage tablet wakes, opens a fresh socket, and keeps the old one open until the fresh one opens. The fresh socket sends its hello only on open, so until the hub reads it, the registry holds only the old socket for that client ID. A Reload in that window goes to the old socket, and the page discards it. The window is a connect plus a round trip, longest on bad Wi-Fi, which is when a producer reaches for Reload. Consequence: one tap is lost and the producer taps again. LOW, no wrong result.

**Evidence**
```ts
opened.addEventListener('message', (event) => {
  listen();
  if (socket !== opened) return;
  if (isHeartbeat(event.data)) return;
  if (isReload(event.data)) {
    onReload();
    return;
  }
```
**Failure mode** - `docs/reviews/setlist-controller-9/repro/reload-on-replaced-socket.test.ts` opens a socket, wakes the page (a second socket is made, the first still reads open), then delivers the reload frame on the first socket: `AssertionError: expected +0 to be 1`.

**Recommended fix**
```diff
   opened.addEventListener('message', (event) => {
     listen();
+    if (isReload(event.data)) {
+      onReload();
+      return;
+    }
     if (socket !== opened) return;
     if (isHeartbeat(event.data)) return;
-    if (isReload(event.data)) {
-      onReload();
-      return;
-    }
     onSnapshot(JSON.parse(String(event.data)) as Snapshot);
```
Audit: `listen()` still runs first on every message from either socket, as now. A snapshot and a heartbeat from a socket that is not current stay ignored. A reload sent to both sockets calls `onReload` twice at most, and the first `location.reload()` ends the page. Failure of the fix itself: none new; a reload frame never arrives on a closed socket.

**Remediation brief**
- **Design intent:** A page may hold two sockets during a wake: the old open one, which still carries commands, and the fresh one. Only the current socket's snapshots and heartbeats count. A reload is an order to the page, not state, so it counts from either socket. The hub sends it to every socket of the client ID that said hello.
- **Full surface:** `web/src/server-connection.ts:93-101` (the message listener); `web/src/server-connection.ts:7-12` header comment already says the producer's Reload reloads the page, no change. Add the repro's test to `test/server-connection.test.ts`, which already has `FakeSocket` and `Visibility`.
- **Must preserve:** `test/server-connection.test.ts:226` "reloads the page on a reload frame, and never reads it as a snapshot"; the wake tests at `:62`, `:79`, `:137`; the silence watchdog `listen()` on every message.
- **Do not touch:** the `socket !== opened` guard for snapshots and heartbeats.
- **Proof:** `pnpm vitest run --root docs/reviews/setlist-controller-9/repro` is red now and green after; the moved test in `test/server-connection.test.ts` red at `33c71fe`.

### 3. Pages in one browser share one row, so each page's hello overwrites the row's name and role, and a second tab puts its stale name back : LOW
- **Location:** `web/src/device-settings.ts:251` (one `CLIENT_ID_KEY` per browser), `web/src/App.tsx:77` (the name read once per page), `src/server/devices.ts:56-59` (each hello replaces the device)
- **Attribution:** Introduced by `d70bd51` and `cb4638b`. This is implementer decision 4.
- **Real-world trigger:** two cases. (a) One browser holds the producer page and a leader or view-only page: the one row shows whichever page spoke last, flips on each battery change or reconnect from either, and has no Reload because it matches the producer's own client ID. (b) A phone has two tabs of the view-only page, as after scanning the QR code twice: the user types "Stage left" in tab A, tab B still holds the old name in its state, and when tab B wakes its hello renames the row back. No user path in a normal service where each device runs one page, so LOW (display only).

**Evidence**
```ts
const CLIENT_ID_KEY = 'setlist-controller.client-id';
const [deviceName, setDeviceName] = useState(() => readDeviceName(deviceStorage()) ?? '');
const device: Device = { client, name, role, battery, online: true, lastSeen: null };
```
**Failure mode** - Proved by the branch's own test `test/devices.test.ts:104` "takes the role from the socket the device last said hello on", which pins the overwrite, and by `grep -rn "addEventListener('storage'" web/src` returning nothing, so no page re-reads a name another tab stored.

**Recommended fix** - Nick chose both (a) and (b) on 2026-11-26. (a) If a row means one page role: key the ID per role, `` `${CLIENT_ID_KEY}.${role}` `` in `readClientId`, called with the page's role from `App.tsx:76`. A browser with the producer page and a leader page then shows two rows, and the producer's own-row rule hides only its own. (b) In either case: re-read the stored name on the window's `storage` event in `App`, so a name typed in one tab reaches the other tab's hello.

**Remediation brief**
- **Design intent:** The client ID names one row on the Devices panel and the target of a Reload (and of #11's messages). The name is the browser's, kept in its storage, with a default from the page's role or part. The hub records the role of the socket, never one a hello claims.
- **Full surface:** `web/src/device-settings.ts:251-275` (`CLIENT_ID_KEY`, `readClientId`), `web/src/App.tsx:76-82` (client ID and name state), `test/device-settings.test.ts` ("the client ID a device keeps"), `e2e/devices.spec.ts:11-13` (the comment that one context is one device), `src/shared/devices.ts:3-7` header.
- **Must preserve:** one row across reloads and reconnects (`e2e/devices.spec.ts:34`); the default name follows the part until a name is typed (`test/device-settings.test.ts`, "the name a device goes by"); a device that cannot store still gets an ID for the visit.
- **Do not touch:** the hub's role-from-socket rule (`src/server/hub.ts:163-166`).
- **Proof:** for (a), a `test/device-settings.test.ts` case: two roles on one storage read two different IDs; for (b), a `test/devices-panel.test.ts` or `test/pages.test.ts` case: a `storage` event with a new name changes the hello's name.

### 4. Comment hygiene : LOW (aggregated)
- `web/src/App.tsx:264` : `// Then the Devices panel.` (appended to the Connections panel's comment, adds nothing) -> delete the line.
- `web/src/DevicesPanel.tsx:61` : `The hour and minute the device's last socket closed, by the page's own clock and locale.` -> `The hour and minute the device's last socket closed, by the server's clock, in the page's time zone and locale.`

## Needs Further Investigation
### A. Offline rows may fall under 4.5:1 text contrast : confirm with the computed colours
`web/src/styles.css:1146` dims an offline row with `opacity: 0.7`. Measure the computed contrast of `.device.offline .device-status` against the page background in a browser. Below 4.5:1, dim the border or change the text colour instead of opacity.

## Reviewed and Dismissed
- A viewer socket claims the producer role in its hello : the hub records the socket's role (`src/server/hub.ts:163-166`), and `DeviceHello` has no role field.
- A reload frame sent while a send is in flight, dropped while the socket is open, or ahead of a snapshot out of order : `deliver` returns while in flight and the callback sends the frame next; frames die only with their socket.
- A reload queued twice on one socket : `sendToDevice` drops an exact duplicate (`src/server/hub.ts:131`). Correct for a reload; #11 needs replace-by-kind (see Notes for #11).
- A hello flushes held positions to viewers early : `devices` is in `nonPositionKey`, so a device change is significant and calls `broadcast()`, which sends viewers the held position. A connections-only change does the same at base, so this mirrors the precedent, and it is at most one extra frame per hello.
- The online registry grows without bound : one socket maps to one client ID (`clientOf`), and a new ID detaches the old, so online rows are bounded by open sockets.
- The offline cap evicts the device that just went offline : eviction sorts by `lastSeen` and keeps the newest (`src/server/devices.ts:45-47`).
- A close after `hub.close()` publishes : `publish` returns when `closed`.
- Tests green at base : every changed test green at `4f54d37` is a fixture-only change (`devices: []` in `test/pages.test.ts`, `test/stage-status.test.ts`, `test/timeline.test.ts`, `test/power.test.ts`, `test/safe-mode.test.ts`) or the `Clear offline` filter in `test/pages.test.ts` "shows every leader control", which keeps an existing test true with the new button.
- `newClientId` output refused by the hub : 32 hex characters pass `isClientId`, and `test/device-settings.test.ts` round-trips it through `parseHello`.

## Minor / nits
- `web/src/battery.ts:21` : a `getBattery` that throws synchronously escapes `watchBattery`. No shipping browser throws (the spec returns a promise; Chrome hides the method outside a secure context), so no user path.
- `web/src/DevicesPanel.tsx:34-42` : every Reload button's accessible name is "Reload". It matches `ConnectionsPanel.tsx`'s row precedent; `aria-label={`Reload ${device.name}`}` would tell rows apart.
- `src/shared/command.ts:111` : `parseDeviceCommand` takes any string as `client`, where `parseHello` uses `isClientId`. Harmless as a map lookup.
- `src/server/devices.ts:46`, `:53-62` : one view-only socket that rotates client IDs fills the 50 offline rows and pushes real offline devices out. The viewer path is open to the stage network by design.
- `src/shared/devices.ts:52` : the name is cut by UTF-16 units, so an emoji at the 40th character splits, and a name of only zero-width spaces passes the blank check.
- `web/src/DevicesPanel.tsx:62-65` : "last seen" shows the time only, so a device offline since yesterday reads as today on a server left running.
- `web/src/DeviceNameField.tsx:17` : each keystroke sends a hello and a producer snapshot. Documented, and coalesced by the hub.
- `web/src/App.tsx` : the leader's Timeline view has no name field; the name field is on the Setlist view only, as its comment says.
- `src/server/hub.ts:202-203` : `devices.list()` runs twice per publish.

## Notes for #11 (nothing blocks it)
- `devices.sockets(client)` maps a client ID to its sockets, and `ClientState.role` holds each socket's role, so "All band/viewers" iterates `clients` by role, never `Device.role` (the last hello's role, see finding 3).
- The frame queue drops only exact duplicates. "One active message per device" needs replace-by-kind in `frames`, or a stale message goes out before its replacement; the handoff already notes this.
- Land finding 1 first: #11's message frames ride the same callback, and with the unconditional pump each message's completion would also leak a held position.
- Duplicate names ("View only" twice) make a picker of named devices ambiguous; select by client ID and show a distinguishing detail.

## Test quality
Tests added: 37 · green against `$BASE`: 0 of the 36 that ran on macOS (1, `test/setup-screen.test.ts` "refuses the devices to any machine but the laptop", is Linux-only and was skipped) · tautology shapes found: 0. The jsdom files `test/devices-panel.test.ts` and `test/battery.test.ts` state what they cannot observe.
- `test/hub-coalescing.test.ts:146` proves a reload is not dropped on a paused socket, which is its name. It cannot tell a frame that waits for the send in flight from one sent straight past it, since `ws` buffers either way. Finding 1's new test covers the pacing side.
- Gap: no test drives the hello glue in `App.tsx` (`useServer`'s hello effect and `useBattery`). A part change or a battery `levelchange` that stops reaching the hello would fail no test.
- Gap: no table test of `parseDeviceCommand` with malformed input, beside the hello table in `test/devices.test.ts`.

## Before opening the PR
- **CI readiness:** lint, type check and the unit suite green at `33c71fe`; the devices e2e green on both projects. Rerun the full `pnpm test:e2e` after remediation.
- **Commit hygiene:** commit this doc and `repro/` as `setlist-controller#9 pre-PR review 1`. Run `pnpm check:private --range origin/main..HEAD` again after the remediation commits, and the PR title and body through `pnpm check:private --stdin`.
- **Likely reviewer asks:** the four implementer decisions above; why the setup screen lists devices by polling instead of a socket; a test for the 20 Hz cap with frames in play.

## Verdict
Not ready as-is. The gate is finding 1, which undoes part of #16's 20 Hz cap that #9 was blocked on. Findings 2 and 4 are small and can ride the same remediation. Finding 3 waits on Nick's call on decision 4 and can ship as a follow-up if he keeps one ID per browser.

## Remediation, 2026-11-25
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `32e91d5` a completed send no longer delivers a held position | red to green: `node docs/reviews/setlist-controller-9/repro/pacing-leak.mts` (`[0,1,2]` exit 1, then `[0,1]` exit 0); new test "holds a position published while the send before it is in flight until the trailing flush" in `test/hub-coalescing.test.ts` red (`[0,1,2]`) before the fix; the brief's five preserve suites 55 of 55 | 0 new; the comment above `deliver` corrected as the brief asked | fixed (disprove agent: repro, the new test against the pre-fix tree, and a reload-plus-held-position script both ways) |
| 2 (LOW) | `959f483` a reload on the socket a wake replaces reloads the page | red to green: `pnpm vitest run --root docs/reviews/setlist-controller-9/repro`, and the moved test in `test/server-connection.test.ts` (`expected +0 to be 1`, then 11 of 11) | 0 (one existing line moved) | fixed, proved by execution |
| 3 (LOW) | `bf7faf9` a client ID for each page role, and the name follows other tabs | red to green: `test/device-settings.test.ts` per-role and storage-event cases; new e2e "one browser is one device for each page role, and a name typed in one tab reaches its other tabs" red without the `App` and `device-settings` changes (`Received: ""`), green on both projects | 2 (`watchDeviceName`'s contract, as `watchBattery`'s); existing comments in `device-settings.ts`, `App.tsx`, `src/shared/devices.ts`, `e2e/devices.spec.ts` corrected | introduced: the name was read again on every storage event, whatever its key; closed by the rework below |
| 3 rework (LOW) | `c5e66b8` read the name again only for its own key | red to green: `test/device-settings.test.ts` "is not read again when another tab stores some other setting" | 0 new; the contract comment reworded | fixed (scoped re-verify) |
| 4 (LOW, comment hygiene) | `ea8093a` two comments say what the code does | read against the code: `lastSeen` is set by the registry's `now()` on the server (`src/server/devices.ts:44`) and only formatted by the page | 0 | fixed, read against the code |

### Known regressions, deferred
- None. The scoped re-verify's notes are LOW and none is a defect in the rework: a `clear()` in another tab resets a name a device kept for the visit only, by design of the rework; the listener reads the key but not `storageArea`, and no page uses `sessionStorage`; the negative test covers the part key only.

### Rework briefs
- Finding 3 rework: achieve a name read again only when the storage event's key is the device name's or null; preserve a name stored by another tab reaching this tab, a blank name read back as null so the page goes by its default, and the stop function; proof: a storage event for the part key calls no `onName`, red before and green after, plus the existing case with the name key and a null key.

