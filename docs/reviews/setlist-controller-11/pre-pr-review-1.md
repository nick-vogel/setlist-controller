# Pre-PR review: setlist-controller#11 messages from the producer page to the band's devices

**Branch:** `setlist-controller-11-producer-band-messages` vs `origin/main` (merge-base `c9da372`, "Merge pull request #27 from nick-vogel/setlist-controller-25-durations-follow-ups")
**Reviewed at:** HEAD `16808b5` ("setlist-controller#11 review: a quick message sends with one tap, and the lights row's test measures against the row after it"), clean tree (no uncommitted or untracked files), 23 files, +1182 / -45, three commits: `e67f3fb` (the hub keeps one active message per device), `a476afd` (the producer's panel and the band's banner), `16808b5`.
**Reviewed against:** nick-vogel/setlist-controller#11 and its epic #8 (read with `gh`), `.claude/rules/public-repository.md`, the global rules in `~/.claude/rules/`, `README.md`, and the Approach decisions and "Notes for #11" of `docs/reviews/setlist-controller-9/` and `docs/reviews/setlist-controller-16/`. The repo has no `AGENTS.md` or `CLAUDE.md`, no `CONTEXT.md` and no ADRs.
**Date:** 2026-11-25
**Reviewer:** 2 code-review agents + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and rig suites | `pnpm vitest run --maxWorkers=2` | 117 files, 3550 passed, 5 skipped |
| Private terms | `pnpm check:private --range origin/main..HEAD` | exit 0 |
| Commit authors | `git log --format='%an <%ae> \| %cn <%ce>' c9da372..HEAD` | GitHub noreply address only |
| Em-dashes | `git diff c9da372 \| grep "^+.*$(printf '\342\200\224')"` (U+2014) | none in added lines (UI strings, README, tests) |
| WCAG AA contrast, new UI | computed from `web/src/styles.css` | banner text `#111` on `#fff` 18.9:1; Dismiss `#fff` on `#111` 18.9:1; labels `#aaa` on `#111` about 7.6:1; choices `#eee` on `#111` about 15.4:1. Presets reuse `.connection-button`, unchanged. All pass. |
| #16 and #9 pacing invariants | read `src/server/hub.ts:132-159`; finder mutant M3 (a message send sets `dirty`) | `inFlight` is still the only busy signal; frames never set `dirty`; M3 is killed by `test/hub-coalescing.test.ts` "holds a position published while the send before it is in flight, past a message frame that reaches the socket" |
| No fixed sleeps in pacing tests | `grep -n "setTimeout(resolve" test/hub-coalescing.test.ts` | empty |
| Board and hub mutation testing | finder ran 7 mutants on a copy of HEAD outside the worktree, against `test/messages.test.ts`, `test/messages-hub.test.ts`, `test/hub-coalescing.test.ts` | 5 killed, 2 survived (finding 4) |
| Finding 1 and 2 repro | `pnpm build`, then `node docs/reviews/setlist-controller-11/repro/banner-placement.mts`, in Chromium (Pixel 7) and WebKit (iPad gen 7) | exit 1, all 8 checks fail (below) |
| Finding 3 repro | `node docs/reviews/setlist-controller-11/repro/dismiss-across-roles.mts` | exit 1: the leader page shows 0 banners after a reload, after a Dismiss on the producer page only |
| Playwright suite | not run | `pnpm test:e2e` runs the whole browser suite; the two repros above drive the built app through the same rig (`e2e/rig.ts`) instead |
| Tautology audit (base oracle) | by construction, not run in a base worktree | every new test imports a module or a harness field that `c9da372` does not have (`src/shared/messages.ts`, `harness.messages`, `readDismissedMessages`), so each one is red at base. The mutation run above is the stronger check. |

**Overall:** The server half is sound: the board, the hello answer, the replace-by-kind frame queue and the producer-only gate all hold, and #16's pacing survives. The banner is where the branch falls short. It pushes every page's controls down 88px when it arrives (proved in both engines), and it is drawn over the Reconnecting banner and the leader's stage status line, so a device that lost the server hides the one sign that says so. Fix findings 1 and 2 (after Nick picks a layout), and 3 and 4, before the PR opens.

## Approach decisions
Carried forward from `setlist-controller-16` and `setlist-controller-9`, all still held by this branch:
- **Drain detection:** `ClientState.inFlight` (cleared by the `ws` send callback) is the hub's only busy signal; no `bufferedAmount`.
- **Duplicate suppression:** `deliver()` compares the socket's role payload with `lastSent` before marking `dirty`.
- **Busy socket after a send completes:** a completed send pumps again only when a frame waits or `dirty` was set by a change to that socket's own payload. Frames are pumped by the frame path and never set `dirty`.
- **A frame on the socket a wake replaces:** a reload is read on either socket. This branch adds that a message frame is read on the current socket only, which is sound because the fresh socket's hello is answered with the board's current message.
- **Client ID per role:** `setlist-controller.client-id.<role>`; the device name is one key per browser and follows other tabs through `watchDeviceName` (`web/src/device-settings.ts:295`).

Added in this review:
- **Where the banner sits (findings 1 and 2):** Nick picked Option A on 2026-11-26: the banner is an overlay in one fixed top layer under the page's connection signal, mirroring `.server-lost` ("Fixed over the top of the page, so nothing under it moves while it shows or when it goes", `web/src/styles.css:726-727`).
- **Dismissed IDs (finding 3):** one list per device, which is per page role, keyed `` `setlist-controller.dismissed-messages.${role}` `` in the shape of `readClientId` (`web/src/device-settings.ts:262-263`), and it follows other tabs of the same role through a `storage` listener in the shape of `watchDeviceName`.

## Remediation scope
- Nick 2026-11-26: remediate all five Confirmed findings. Findings 1 and 2 take Option A.
- Nick approved all nine implementer decisions below as written, and the four preset texts ("Repeat chorus", "Repeat bridge", "Hold after this song", "Watch leader") as UI copy.
- Showing the active message on the producer page is a follow-up issue under #8, not part of this round.

## Implementer decisions (approved by Nick 2026-11-26)
1. **"All band/viewers" reaches view-only sockets only, labelled "View-only devices".** Agree. The leader is the one a "Watch leader" message is about, so leaving the leader out of this target reads right, and the label says exactly what it reaches. All devices covers the case that includes the leader.
2. **All devices includes producer pages, the sender's own too.** Agree for now. Today the banner on the producer's own page is the only sign of what is active, since the panel does not show it. Once the panel shows the active message (follow-up below), leave producer pages out of All devices. As it stands it makes the producer dismiss its own message, which feeds finding 3 in a shared browser.
3. **A message to All devices or View-only devices also reaches a device that first connects after the send.** Agree: it is the same mechanism as reconnect survival. Note that a message to chosen devices also reaches a chosen device that is offline when it comes back, which the README does not say (finding 5). A message stays until Clear, so the producer clears between songs if a late phone should not see an old call.
4. **The hub makes the ID with `randomUUID`, and the send carries none.** Agree, and record it as a deliberate departure from the issue's wording. A hub-made ID is the only way the dismissed-ID rule holds across a server restart and across two producer pages. The cost: a double tap on a quick message makes two messages (Minor).
5. **Clear takes every active message off every device.** Agree. It matches the epic's "a Clear button to remove active messages across targeted devices", and per-device Clear has no ask behind it.
6. **Text is trimmed and cut at 120 characters.** Agree. The text box's `maxLength` matches, so the producer never sees a cut. The cut can split an emoji at the limit (Minor).
7. **Messages live in memory and a restart clears them.** Agree. It matches the device registry, and the hub answers each hello after a restart with a clearing frame, so no device keeps a stale banner.
8. **A message frame is read from the current socket only, while a reload is read from either.** Agree. Verified by the finder and `test/server-connection.test.ts` "reads no message from the socket a wake is replacing": the fresh socket's hello brings the current message, so nothing is lost.
9. **A quick message sends at once, does not fill the text box, and uses the epic's preset wording.** Agree. It is what "one-tap" in the issue asks. With the target defaulting to All devices, a stray tap reaches every page, and finding 1 makes that tap move every page's controls. Fixing finding 1 makes this decision safe.

Unfinished items the implementer named:
- **The producer page does not show the active message.** Not a defect against #11's criteria. File it as a follow-up: it is what lets decision 2 drop producer pages from All devices.
- **A dismissal in one tab does not reach another open tab until it reloads.** This is half of finding 3, since the README counts two tabs of one page as one device and the device name already follows other tabs.

## Confirmed Issues

### 1. The banner pushes every page's controls down when it arrives, and pulls them back on Dismiss: MEDIUM (capped)
- **Location:** `web/src/styles.css:41-55` (`.message-banner`, `position: sticky` in the page flow), rendered first in `main` at `web/src/App.tsx:315`, `:355`, `:386`, `:403`.
- **Attribution:** introduced. `git show c9da372:web/src/styles.css | grep -n message-banner` is empty; `git log --oneline -S'.message-banner {' c9da372..HEAD` gives `a476afd`.
- **Real-world trigger:** mid-song, the leader reaches for Count in, Next song or a section jump at the moment a producer's message arrives. The control moves 88px down under the finger, and the tap lands on whatever moved into its place. A Dismiss pulls everything back up 88px. MEDIUM, capped: it needs a tap within the banner's arrival window. Upgrade to HIGH if a control that the shift puts under a typical tap fires a jump or a cue without arming; check by tapping through the leader page with the repro's banner showing.

**Evidence**
```css
.message-banner {
  position: sticky;
  top: 0;
  z-index: 3;
  ...
  margin: 0 0 1rem;
```
The repo already chose the other shape for the Reconnecting banner, `web/src/styles.css:726-731`: "Fixed over the top of the page, so nothing under it moves while it shows or when it goes".

**Failure mode** - `node docs/reviews/setlist-controller-11/repro/banner-placement.mts`, after `pnpm build`:
```
FAIL chromium leader Count in moves when a message arrives: y 558 -> 646
FAIL webkit leader Count in moves when a message arrives: y 393 -> 481
```

**Recommended fix** - Nick picks one:
- **Option A (recommended):** the banner becomes an overlay that takes no space in the page flow. Each page renders one fixed top layer, a column holding the page's connection signal first and the banner second. Nothing under it moves, and the connection signal is never covered (this also fixes finding 2).
  - View-only and producer pages: the layer holds `<Reconnecting />` (when disconnected) and `<MessageBanner />`.
  - Leader page: the layer holds the stage status line and `<MessageBanner />`. The stage status line is always one line (`white-space: nowrap; overflow: hidden`, `web/src/styles.css:123-124`), so the leader `main` reserves its height with a constant `padding-top`, and the page does not move when the line enters the layer.
  - CSS: `.page-top { position: fixed; inset: 0 0 auto; z-index: 3; display: flex; flex-direction: column; }`. `.server-lost` and `.stage-status.sticky` lose their own `position`, `inset`, `top` and `z-index` inside it, and `.message-banner` loses `position: sticky`, `top`, `z-index` and its bottom margin.
  - The cost: while a banner shows, it covers the top of the page content, as the Reconnecting banner does today.
- **Option B (minimal):** keep the banner in the flow and accept the shift. Fix finding 2 alone by putting the connection signals above the banner (`.server-lost` and `.stage-status.sticky` get `z-index: 4`). Then record "the banner moves the page" as Nick's decision in Approach decisions.

**Remediation brief**
- **Design intent:** a banner is an interruption the producer chooses. It must never move a control under a finger, and it must never hide a device's own connection state. The repo's precedent for a top-of-page alert is `.server-lost`: fixed, and nothing under it moves. The chart strip (`.chart-strip`, sticky, z-index 1) stays under any fixed layer, as it is under `.server-lost` today.
- **Full surface:** `web/src/styles.css:38-55` (the banner rule and its comment), `:127-136` (`.stage-status.sticky`), `:726-738` (`.server-lost`), `:440-443` (`.chart-strip`, unchanged, check that it is still under the layer); `web/src/App.tsx:299`, `:308-310`, and each of the four `main` returns at `:314-321`, `:354-363`, `:385-388`, `:402-409`; `web/src/StageStatusLine.tsx:7-9` (the `sticky` prop); `test/messages-page.test.ts:123-129` (reverse it: assert the connection signals are above the banner, and that the banner takes no space in the flow); `test/messages-page.test.ts:51-66` (it asserts the banner is the first child of `main`, so update it to the layer); `test/pages.test.ts:1481-1482` (`.server-lost` is `fixed`); `e2e/messages.spec.ts` "the banner holds to the top of a scrolled page"; `e2e/stage-status.spec.ts`, `e2e/reconnect.spec.ts`, `e2e/chart-strip.spec.ts`.
- **Must preserve:** the Reconnecting text and its `role="status"`; the stage status line's `role="status"` for server-lost; the banner's `role="alert"`, its text, and its Dismiss button; the battery warning in its place after the banner (`test/messages-page.test.ts` "opens every page it reaches, ahead of the battery warning"); the safe-area padding on `.server-lost` (`env(safe-area-inset-top)`); the chart strip's sticky behaviour (`test/pages.test.ts:2249`); the banner at `y = 0` on a scrolled page with no Reconnecting banner showing.
- **Do not touch:** the hub and the board (Reviewed and Dismissed); the banner's colours, which pass AA.
- **Proof:** `pnpm build && node docs/reviews/setlist-controller-11/repro/banner-placement.mts` exits 1 now. After Option A it exits 0. After Option B the four "covers" checks pass and the two "moves" checks still fail, which is the recorded decision. Then `pnpm vitest run --maxWorkers=2 test/messages-page.test.ts test/pages.test.ts test/stage-status.test.ts` and `pnpm test:e2e`.

### 2. The banner is drawn over the Reconnecting banner and over the leader's stage status line: MEDIUM
- **Location:** `web/src/styles.css:41-44` (`z-index: 3` against `.server-lost` `z-index: 2` at `:731` and `.stage-status.sticky` `z-index: 1` at `:130`), locked in by `test/messages-page.test.ts:123-129`, and described as intended in `web/src/styles.css:38-40`.
- **Attribution:** introduced, `a476afd`, as for finding 1.
- **Real-world trigger:** a band phone holds "Repeat chorus" and its Wi-Fi drops. The Reconnecting banner shows under the message banner, so the phone looks connected and keeps a message the producer may have cleared since. On the leader page, once the leader scrolls the setlist, the banner sits over the stage status line, which is the leader page's only connection-lost signal (`web/src/StageStatusLine.tsx:3-5`) and its transport state, until Dismiss. MEDIUM: missing context on a live stage, not a wrong action.

**Evidence**
```css
/* ... It holds to the top of the page while it scrolls, over the chart
   strip, the stage status line and the Reconnecting banner, until the device dismisses it. */
.message-banner {
  position: sticky;
  top: 0;
  z-index: 3;
```

**Failure mode** - the same repro reads the element drawn at the centre of each connection signal:
```
FAIL chromium leader stage status line, scrolled: topmost at its centre: message-banner
FAIL chromium phone Reconnecting banner, at scroll 0: topmost at its centre: message-banner
FAIL chromium phone Reconnecting banner, scrolled: topmost at its centre: message-banner
FAIL webkit   (the same three)
```
`e2e/messages.spec.ts` "a phone whose connection drops and returns" asserts `toBeVisible()` on "Reconnecting to the server.", which Playwright reports as visible even when another element covers it, so the suite cannot see this.

**Recommended fix** - Option A or Option B from finding 1. Both put the connection signal above the banner. Rewrite the comment at `web/src/styles.css:38-40` to match, and reverse `test/messages-page.test.ts:123-129` to assert the signals win.

**Remediation brief**
- **Design intent:** a device's own connection state outranks any message. On every page, the connection signal (`.server-lost`, or the stage status line on the leader page) is never covered.
- **Full surface:** the same as finding 1. Fix them together, in one commit if Option A.
- **Must preserve:** as finding 1.
- **Do not touch:** as finding 1.
- **Proof:** the three "covers" lines of `node docs/reviews/setlist-controller-11/repro/banner-placement.mts` print `ok` in both engines.

### 3. Dismissed IDs are kept per browser, not per device, so a Dismiss on one page hides the message on another device in the same browser, and does not reach another tab of the same device: LOW (capped)
- **Location:** `web/src/device-settings.ts:321-346` (`DISMISSED_MESSAGES_KEY`, one key for the browser), `web/src/App.tsx:160-167` (read once, never re-read).
- **Attribution:** introduced. `git log --oneline -S'DISMISSED_MESSAGES_KEY' c9da372..HEAD` gives `a476afd`.
- **Real-world trigger:** (a) the producer page and a leader page open in one browser, which the README says are two devices. The producer sends to All devices and dismisses it on the producer page. The leader page shows no banner after its next reload or wake, though nobody dismissed it there. (b) Two tabs of one page in one browser, which the README says are one device. A Dismiss in one tab leaves the banner up in the other until it reloads. LOW, capped: it needs two pages in one browser. Upgrade to MEDIUM if the producer and leader pages share a browser during a service: the leader then misses a call without any sign (a wrong result silently delivered).

**Evidence**
```ts
// hidden when the hub sends it again on the next hello. One list for the browser: the hub makes a new
// ID for every message, so an ID dismissed on one page names no message on another.
const DISMISSED_MESSAGES_KEY = 'setlist-controller.dismissed-messages';
```
The comment's claim is false: a message to All devices carries one ID to every device (`src/server/messages.ts:30`, `activeFor` returns the same object to every role).

**Failure mode** - `node docs/reviews/setlist-controller-11/repro/dismiss-across-roles.mts`:
```
both pages show the banner
leader page after a reload, never dismissed there: 0 banner(s)
```
exit 1. Half (b) is shown by reading: `App.tsx:162` reads the list once in a `useState` initializer, and nothing listens for the `storage` event on the dismissed key (`grep -n "'storage'" web/src/*.ts*` finds only `watchDeviceName`).

**Recommended fix**
```diff
-export function readDismissedMessages(storage: DeviceStorage | undefined): string[] {
+export function readDismissedMessages(storage: DeviceStorage | undefined, role: Role): string[] {
   try {
-    const value: unknown = JSON.parse(storage?.getItem(DISMISSED_MESSAGES_KEY) ?? '[]');
+    const value: unknown = JSON.parse(storage?.getItem(`${DISMISSED_MESSAGES_KEY}.${role}`) ?? '[]');
```
Apply the same to `storeDismissedMessage(storage, role, id)`, which reads and writes the role's key. Add `watchDismissedMessages(page, storage, role, onDismissed)` in the shape of `watchDeviceName` (`web/src/device-settings.ts:295-302`): it re-reads on a `storage` event for the role's key or a `null` key, and returns the function that stops it. In `App`, pass `role` to both calls at `:162` and `:165`, and wire the watcher in an effect beside `:89`. Rewrite the comment at `:321-323` to say the list is per device, which is per page role, and why: a message to All devices has one ID on every device.

**Remediation brief**
- **Design intent:** "Dismissing a message hides it on that device" (#11). A device is a client ID, and the client ID is per page role (README, `readClientId`). So the dismissed list belongs to the role's key, and every tab of that role reads the same list as it changes, as the device name does.
- **Full surface:** `web/src/device-settings.ts:321-346`; `web/src/App.tsx:89`, `:160-167`; `test/device-settings.test.ts` "the messages a device dismissed" (three tests, now taking a role); a new test that a dismissal under `producer` does not hide the message under `leader`; a new test for the watcher in the shape of the `watchDeviceName` tests in the same file.
- **Must preserve:** the 20-ID cap and its newest-last order (`MAX_DISMISSED_MESSAGES`); a re-dismiss moving the ID to the end without a duplicate; every storage failure path (no storage, a throwing storage, junk values) returning `[]` and never throwing; the in-memory `dismissed` state hiding a message when storing fails; `e2e/messages.spec.ts` "Dismiss hides the message on that device across a reload". An ID stored under the old browser-wide key is dropped on purpose (the list is a cache of at most 20 IDs, and the hub re-sends only the active one).
- **Do not touch:** the hub's ID scheme (decision 4); the cap value.
- **Proof:** `pnpm build && node docs/reviews/setlist-controller-11/repro/dismiss-across-roles.mts` exits 1 now and 0 after. `pnpm vitest run --maxWorkers=2 test/device-settings.test.ts`.

### 4. The board's "newest message wins" rule has no test that fails when it breaks: LOW
- **Location:** `src/server/messages.ts:36-41`, `:50-55`; tests `test/messages.test.ts:57-85`, `test/messages-hub.test.ts:104-114`, `:143-156`.
- **Attribution:** introduced (all three files are new in `e67f3fb`).
- **Real-world trigger:** a later refactor of the board. Nothing fails today. LOW: a coverage gap, `tests-can-go-red`.

**Evidence**
```ts
const reaching = [all, role === 'viewer' ? viewers : null, chosen.get(client) ?? null];
let newest: Posted | null = null;
for (const posted of reaching) if (posted && (!newest || posted.order > newest.order)) newest = posted;
```
Every test that mixes targets sends the chosen message last, or sends `all`, which empties the chosen map. No test sends to chosen devices and then to View-only devices.

**Failure mode** - two mutants survive all 34 tests in the three files (the finder ran them on a copy of HEAD):
- M1: `activeFor` returns `(chosen.get(client) ?? (role === 'viewer' ? viewers : null) ?? all)?.message ?? null`, a fixed priority. Under it, "Watch leader" to `['keys']`, then "Repeat chorus" to View-only devices, leaves keys showing "Watch leader".
- M11: the `viewers` branch also calls `chosen.clear()`. Under it, "Watch leader" to the leader's `['ipad']`, then "Repeat chorus" to View-only devices, takes the leader's message away on its next hello.

**Recommended fix** - add two board tests to `test/messages.test.ts`, one rule each:
- "a message to the view-only devices replaces an older message to a chosen view-only device": send to `['keys']`, then to `'viewers'`; assert `activeFor('keys', 'viewer')` is the second message.
- "a message to the view-only devices leaves a chosen leader's message in place": send to `['ipad']`, then to `'viewers'`; assert `activeFor('ipad', 'leader')` is the first message.

Add one hub test to `test/messages-hub.test.ts` for the second case across a reconnect: the leader socket closes and says hello again after the `viewers` send, and its last message frame still reads "Watch leader". Also add a hub test that a message to chosen devices reaches a chosen device that first connects after the send (the board's `chosen.set` for an unknown ID), which no test covers today.
- **Design intent:** a device shows the newest message that reaches it. Each target has its own slot, ordered by a counter, and only an `all` send empties the others, because it reaches everyone.
- **Full surface:** `test/messages.test.ts`, `test/messages-hub.test.ts`. No production change.
- **Must preserve:** every existing test in both files.
- **Do not touch:** `src/server/messages.ts`, which is correct.
- **Proof:** apply M1 and then M11 to `src/server/messages.ts` by hand in a scratch copy; each new test is red under its mutant and green on HEAD. `pnpm vitest run --maxWorkers=2 test/messages.test.ts test/messages-hub.test.ts`.

### 5. Comment hygiene: LOW (aggregated)
- `test/messages-page.test.ts:14` - "that a preset fills the text box" → "that a quick message sends at once" (`16808b5` changed the behaviour; no e2e tests filling).
- `src/server/messages.ts:6-8` - "A message to every page or to every view-only page stands for the page that first connects after the send too." → "A message also stands for a device that is not connected yet: one to every page or every view-only page reaches a page that first connects after the send, and one to chosen devices reaches a chosen device when it comes back."
- `README.md:49` - "A message to All devices or View-only devices also reaches a device that first connects after it." → add "and one to chosen devices reaches a chosen device that was offline when it comes back."
- `test/messages.test.ts:79` - test name "gives a message to all or to view-only pages to a device that first connects after the send" tests View-only devices only → "gives a message to view-only pages to a device that first connects after the send" (the All devices case is `test/messages-hub.test.ts:131`).
- `web/src/ProducerMessages.tsx:6-10` - one run-on sentence, and line 8 runs past 150 characters while its neighbours wrap at 100 → "The producer's messages to the band, under the Devices panel. A quick message sends at once to the devices picked under Send to, so the producer types nothing mid-song. Then the text box, who the message goes to, Send, and Clear, which takes every active message off every device. Chosen devices ..." wrapped at 100.

## Needs Further Investigation
### A. A "nothing arrived" assertion in the hub tests could pass while a wrong frame still waits on a busy socket
`test/messages-hub.test.ts:69-71`, `:81-82`, `:94-98`, `:112-113` flush with a ping and then assert no message. A frame queued behind an in-flight send waits in `state.frames`, and the automatic pong can overtake it. With the stage idle (`playing: false`) the socket is never busy, and mutant M7 (a send reaches every socket) was killed reliably, so this is unlikely. To confirm: run those tests with `playing: true` and a held position; to kill: show the frame queue is empty at the assertion.

## Reviewed and Dismissed
- **#16 and #9 pacing.** `queue()` always pushes before it pumps, so its pump sends a frame and never an early snapshot; the send callback pumps again only for a waiting frame or `dirty` (`src/server/hub.ts:132-159`). Proven by mutant M3. Do not route message frames through `deliver()`.
- **Replace-by-kind.** The newest message frame queued for a socket is always the board's current answer for that socket: a send queues only where `activeFor` is the new message, and a hello and Clear queue `activeFor`. Replacing whatever message frame waits is sound, and a RELOAD keeps its place ahead.
- **View-only target by socket role.** It reads `ClientState.role`, never `Device.role`, as #9's notes asked.
- **Producer-only gate.** Message and Clear are parsed after `if (role !== 'producer') return;` (`src/server/hub.ts:217`); `test/messages-hub.test.ts:86` covers both from a leader and a viewer.
- **`isMessageFrame` by prefix.** It cannot match RELOAD, HEARTBEAT or a snapshot, whose top level has no `kind`.
- **Repeated hellos.** A battery or name change re-sends the hello, and each one gets one frame; replace-by-kind keeps at most one message frame waiting.
- **Wake.** A message on the socket a wake replaces is dropped, and the fresh hello's answer carries it (decision 8).
- **Dismissed cap eviction.** Evicting the oldest of 20 IDs cannot bring a message back on one device, since that device dismissed 20 newer ones. (Across two devices in one browser it could, which finding 3 removes.)
- **localStorage failures.** Throwing storage, junk and non-string entries are caught and tested.
- **`e2e/lights.spec.ts`.** The new panel moved `section.song` out of the viewport, and the old comment was already wrong since #9 added the Devices panel. Measuring against the Devices region keeps the test's point.
- **Contrast and focus.** The new colours pass AA (table above). The repo has no `:focus-visible` rule anywhere, which predates this branch; the Dismiss button's default ring sits on a white banner.

## Minor / nits
- `src/shared/messages.ts:64` - `message === undefined` can never be true after `typeof message !== 'object'`.
- `web/src/server-connection.ts:106-111` and `test/harness.ts` - a malformed message frame (`readMessageFrame` gives `undefined`) falls through to `onSnapshot` as a snapshot. The hub only builds frames with `messageFrame`, so there is no trigger. Checking `isMessageFrame` first and dropping a bad one would be cleaner.
- `src/shared/messages.ts:27` - the 120-character cut can split an emoji into a lone surrogate (`'a'.repeat(119) + '😀'` gives `isWellFormed() === false`). It mirrors the device name's cut at `src/shared/devices.ts:52`. Fix both together if at all.
- `web/src/ProducerMessages.tsx:44` - a double tap on a quick message sends two messages with two IDs, so a band member who dismissed between the taps sees it again.
- `web/src/ProducerMessages.tsx:24-26` - a ticked device that Clear offline removed comes back ticked when it says hello again.
- `web/src/ProducerMessages.tsx:118-121` - a device on its default name reads "Leader, Leader" or "View only, View only (a1b2)"; and "No other device has connected yet." is wrong after Clear offline.
- `test/harness.ts:85` - `messages` is a mutable array beside `readonly` neighbours.

## Test quality
Tests added: 37 (30 in four new files, 7 in modified files). Red against `c9da372`: all, by construction (each imports a module or a harness field the base lacks); none was run in a base worktree. Mutation run: 5 of 7 mutants killed; the 2 survivors are finding 4. Tautology shapes found: 1 mild. `test/messages-page.test.ts` "offers every quick message as a button ahead of the text box" takes its expected list from `MESSAGE_PRESETS`, the constant the panel renders, so a dropped preset passes. Its real rule is "the presets come before the text box", which it does check. Keep it. Other notes:
- `test/messages-page.test.ts:123-129` asserts finding 2's defect, so finding 2 reverses it.
- `test/device-settings.test.ts:98` - `not.toContain('m2')` cannot fail after the line before it asserts `toEqual(['m1'])`; delete the line.
- The re-dismiss path (`filter((held) => held !== id)` in `storeDismissedMessage`) has no test.
- Chosen devices with none ticked should disable every send button; no test checks it, because the static render only sees `target === 'all'`.
- `test/messages.test.ts:16`, `:46` and `test/messages-hub.test.ts:86` each bundle several rules under one name.

## Before opening the PR
- **CI readiness:** lint, typecheck and the unit suite are green at `16808b5`. Rerun `pnpm test:e2e` after findings 1 and 2, since they move the page's top layout.
- **Commit hygiene:** the three commits are clean. Commit this doc with the subject `setlist-controller#11 pre-PR review 1`, and the two repros under `repro/` with it.
- **Likely reviewer asks:** why the hub makes the ID when the issue says the send carries one (decision 4); whether All devices should reach producer pages (decision 2); a follow-up issue for showing the active message on the producer page.

## Verdict
Not ready to open a PR as-is. Gate: findings 1 and 2 (after Nick picks Option A or B), 3 and 4, with 5 in the same round. None is a HIGH. The hub and board, which carry the issue's hardest rules, are correct and keep #16's pacing.

## Remediation, 2026-11-25
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) and 2 (MEDIUM), one commit as the brief asks for Option A | `80b42b0` findings 1 and 2: the banner moved every page's controls and covered the connection signal | red then green: three new tests in `e2e/messages.spec.ts` failed in both projects before the fix and pass after; `pnpm build && node docs/reviews/setlist-controller-11/repro/banner-placement.mts` exits 0 (all 8 checks `ok`); `pnpm vitest run --maxWorkers=2 test/messages-page.test.ts test/pages.test.ts test/stage-status.test.ts` 247 passed | 11 lines flagged by the gate, each a rewrite of an existing comment or a load-bearing constraint (the layer's purpose, the leader page's reserved top, why the e2e page gets room to scroll) | half-fixed, then fixed after rework: the verifier found both defects closed on every page variant, and flagged that an e2e test's name claimed more than it checked (rework below) |
| 1 and 2, rework | `3757eed` findings 1 and 2 rework: the e2e test's name says what it checks | the scoped re-verify read the renamed title against the test body; its one-line follow-up is folded into the same commit | 0 | fixed (after the one-line follow-up the scoped re-verify named) |
| 3 (LOW) | `b05aae6` finding 3: a Dismiss hid the message on another device in the same browser, and missed the page's other tab | red then green: 7 tests in `test/device-settings.test.ts` and the new e2e test "a Dismiss on the producer page leaves the message on a leader page in the same browser, and a Dismiss on the leader page hides it in its other tab" failed before and pass after; `node docs/reviews/setlist-controller-11/repro/dismiss-across-roles.mts` exits 0 (1 banner after the reload) | 9 lines flagged by the gate, each a rewrite of an existing comment or the new watcher's contract | fixed |
| 4 (LOW) | `016e27b` finding 4: the board's newest-message rule had no test that could fail | mutant M1 applied by hand to `src/server/messages.ts` turns "replaces an older message to a chosen view-only device with a message to the view-only devices" red; mutant M11 turns "leaves a chosen leader's message in place under a message to the view-only devices" and the hub's reconnect test red; both green on HEAD (`pnpm vitest run --maxWorkers=2 test/messages.test.ts test/messages-hub.test.ts`, 22 passed); the file was restored with `git checkout` | 0 | proved by execution |
| 5 (LOW, comment hygiene) | `b4e1a56` finding 5: comment hygiene | each of the five entries read against the code it describes | prose only | not verified by agent, by design |

Round checks at `3757eed`: `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm test --maxWorkers=2` 117 files, 3557 passed, 5 skipped; `pnpm test:e2e` 210 passed in both projects; both repros exit 0 after `pnpm build`; `pnpm check:private --range origin/main..HEAD` exit 0. `origin/main` is still `c9da372`, so no merge.

### Known regressions, deferred
- A storage event can drop a dismissal that lived only in memory. Introduced by `b05aae6`, verdict "the watcher replaces the in-memory list with what storage holds. Say a tab's `setItem` threw (quota full), so the dismissal lived only in memory. Then a storage event arrives ... The ID is dropped and the dismissed message shows again in that tab." Not fixed: it needs this tab's store to fail while another tab of the same role stores, or a `localStorage.clear()` with a page open, and the app never clears storage. The fix (merge in App instead of replace) is larger than one line once it gets the test the fallback rule asks for. The watcher replaces as `watchDeviceName` does, the shape the brief named.
- On a device with a top safe-area inset, the stage status line and a lone banner now sit at `y = 0` under the inset at scroll 0, where before they started under the body's safe-area padding until the page scrolled. Introduced by `80b42b0`, verdict "Safe-area regression at scroll 0 (LOW, not checked on a device)". Not fixed: the pages open in a browser tab with no web app manifest, where the top inset is 0 in portrait, and only `.server-lost` carried the inset before. A layer-wide inset is a layout change for a later round.

### Notes from the verify pass, not defects
- While a banner shows, it covers the top of the page content, the battery warning and the leader's Safe Mode bar included, until Dismiss or until the page scrolls. This is the cost Option A declared ("while a banner shows, it covers the top of the page content, as the Reconnecting banner does today"). If the battery warning should never be covered, the next step is to move it into `.page-top` after the banner.
- The old browser-wide key `setlist-controller.dismissed-messages` stays in storage, unread. The brief declared it dropped.

### Rework briefs
- Findings 1 and 2: achieve an e2e test title that states only what the body checks (Count in keeps its y as a message comes and goes; the stage status line ends above the leader page's in-flow content). Preserve the test body and every other test. Proof: a scoped re-verify reading the title against the body.

### Approach decisions added in remediation
- **The page's top layer (findings 1 and 2):** `.page-top`, fixed, `inset: 0 0 auto`, `z-index: 3`, a flex column, first in `main`, and rendered only when it holds something (the stage status line, the Reconnecting banner or a message), so a connected page with no message keeps its markup. Mirrors `.server-lost`, which gave up its own `position`, `inset` and `z-index` to it.
- **The leader page's reserved top:** `main.leader-page { padding-top: 2.25rem }`, the line at its tallest with the transport's pill, guarded by the e2e check that the line ends above every in-flow child of `main`. The body's own top padding sits under the line as well, so the gap below the line is at least `1rem`.
- **The pinned stage status line keeps its `sticky` class** as the leader page's marker, with no `position` of its own and margin `0`, since the layer is already the screen's full width.
- **The dismissed list's watcher replaces the in-memory list** with the role's stored list, in the shape of `watchDeviceName`, and is wired in the effect beside the dismissed state in `App`.
