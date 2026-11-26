# Pre-PR review: setlist-controller#28 the active band message on the producer page

**Branch:** `setlist-controller-28-producer-active-message` vs `origin/main` (merge-base `232dfca`, the #11 merge, PR #29)
**Reviewed at:** HEAD `2475ddb` ("setlist-controller#28 second-opinion review: a chosen producer page loses its banner to a message to all devices, names itself, and pacing survives a message"), clean tree (no uncommitted or untracked files at review start), 23 files changed, +576 / -98, 5 commits `1ad7e76..2475ddb`
**Reviewed against:** nick-vogel/setlist-controller#28 and parent epic #8 with its sub-issues #9, #10, #11, #33 (read with `gh`), `.claude/rules/public-repository.md`, the global rules in `~/.claude/rules/`, `README.md`, `docs/HANDOFF-setlist-controller-28.md`, and the Approach decisions in `docs/reviews/setlist-controller-11/pre-pr-review-1.md` and `pre-pr-review-2.md`
**Date:** 2026-11-26
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Unit and rig suites | `pnpm vitest run --maxWorkers=2` | 117 files, 3580 passed, 5 skipped |
| Private terms | `pnpm check:private --range origin/main..HEAD` | exit 0 |
| Playwright, full suite at HEAD | `pnpm test:e2e`, run twice, the second time with nothing else running | both runs: 220 passed, 2 failed, both in `webkit-ipad`: `e2e/messages.spec.ts:60` (test 56) and `e2e/timeline.spec.ts:286` (test 109), each a 30 s timeout in `page.goto` waiting for "load". See Needs Further Investigation A |
| Playwright, the two failures alone | `pnpm exec playwright test e2e/messages.spec.ts:60 e2e/timeline.spec.ts:286 --project webkit-ipad --repeat-each 3` | 6 passed |
| Playwright, full suite at base | `pnpm test:e2e` in a scratch worktree at `232dfca` | 217 passed, 1 failed: the same `webkit-ipad` test 56, `e2e/messages.spec.ts:60`, the same `page.goto` timeout. Pre-existing on this machine |
| WebKit hang is cumulative | `pnpm exec playwright test e2e/messages.spec.ts --project webkit-ipad` (14 passed), then every spec up to and including `messages.spec.ts` in `webkit-ipad` (67 passed, test 56 failed) | the hang needs the tests before it in one WebKit worker |
| WebKit hang, one hypothesis | scratch worktree at HEAD, a `test.afterEach` closing every `browser.contexts()` appended to every spec, same subset | test 56 still fails: leaked browser contexts are not the cause |
| Em-dashes and en-dashes | `git diff 232dfca` added lines searched for U+2014 and U+2013 | none in any added line |
| Commit authors | `git log --format='%h %ae \| %ce' 232dfca..HEAD` | GitHub noreply address only, all 5 commits |
| Public repository | read every added fixture and README line | stand-in names only (Keys, Bass phone, Booth, Leader, Drums, Producer) |
| `.page-top` top layer | `git diff 232dfca -- web/src/App.tsx` | nothing added to the top layer |
| WCAG AA contrast | web agent computed the new `#aaa` lines on their surfaces; both new contrast tests read the real stylesheet | 6.18:1 on `#2a2a2a`, 7.41:1 on `#1b1b1b`, 8.13:1 on `#111`: pass |
| Distinct accessible names | read the diff | the branch adds no button |
| #16 coalescing, mutation B | scratch worktree at HEAD, `messagesChanged` stops delivering to producer sockets | 8 tests go red (3 in `test/hub-coalescing.test.ts`, 5 in `test/messages-hub.test.ts`), so the new hub tests can go red |
| #16 coalescing, mutation D | scratch worktree, `messagesChanged` leaves `broadcasted` untouched | 2 tests go red ("sends the next position at once after a message and a publish that changes nothing", "is brought back to the broadcast position when the position reverts after a message reached the producer page") |
| #16 coalescing, mutation C | scratch worktree, the revert path in `publish` skips producer sockets | all 19 tests in `test/hub-coalescing.test.ts` pass, though the producer page is left at the held position. Finding 2 |
| Finding 1 repro | `node docs/reviews/setlist-controller-28/repro/quick-messages-move.mts` after `pnpm build` | exit 1: Repeat chorus moves 85 px then 163 px (Chromium, Pixel 7) and 57 px then 106 px (WebKit, iPad gen 7), back to 0 on Clear |
| Tautology audit | HEAD's 11 changed `.test.ts` files copied into a scratch worktree at `232dfca` and run there | 361 tests: 23 failed, 338 passed; of the 25 added or changed tests, 23 red at base, 2 green (both kept, see Test quality) |

**Overall:** The server side holds. The board's `active()` list, the `before`/`now` frame diff in the hub and `messagesChanged` all keep #16's coalescing rules, and the mutation runs show the new hub tests can go red. Every approved decision is built as recorded. One introduced defect needs a decision from Nick before remediation: each send and each Clear moves the quick messages, Send and Clear messages up or down the page, because the list above them and the Devices panel rows above that grow and shrink (finding 1). Two LOW test gaps and a comment-hygiene batch follow. The full `pnpm test:e2e` is red on this machine at the base too (Needs Further Investigation A), so the acceptance line "`pnpm test:e2e` passes" is not met by either tree.

## Approach decisions
Carried forward from `setlist-controller-11` (both reviews), all still held by this branch:
- **Drain detection, duplicate suppression, and busy-socket pumping:** `ClientState.inFlight` is the hub's only busy signal; `deliver()` compares the role payload against `lastSent`; frames never set `dirty`.
- **Message frame on a replaced wake socket:** message frames are read on the current socket only; reload frames are read on either.
- **Client ID and dismissed IDs per role:** keyed by role (`setlist-controller.client-id.<role>` and `setlist-controller.dismissed-messages.<role>`).
- **One fixed top layer (`.page-top`):** connection signal first, message banner second, battery warning third; nothing under it moves, and nothing without a Dismiss goes in it.
- **Battery warning dismissal:** page memory in `App`, reset when the warning level changes.

Approved by Nick on 2026-11-26 for this branch, not findings:
1. A message to All devices no longer reaches producer pages. "Chosen devices" still offers other producer pages, and a chosen producer page still gets the message (`shownOn` in `src/server/messages.ts`).
2. Per-device dismissal status is out of scope, filed as #33. The README says the producer page cannot tell which devices dismissed a message.
3. A chosen message to a view-only device stays on the producer list after a newer View-only devices message covers it on that device (pinned by `test/messages.test.ts` "keeps a chosen message listed with its whole target after a newer message to the view-only devices covers it").
4. The listed target narrows to the devices that still hold the message; a chosen message replaced on every device leaves the list.
5. A message to All devices replaces an older message to a chosen producer page, and the hub sends that page a frame so its banner goes (the `before`/`now` map in `src/server/hub.ts:246-252`).
6. The strings "No active message." and "n devices no longer listed" are approved UI copy.
7. No change for the panel props that travel together to `DevicesPanel` and `ProducerMessages`, and no proxied e2e test for a producer page's dropped connection.

Added in this review:
- **A send or Clear and the position pacing:** `messagesChanged` sends producer sockets `latest`, which carries the newest published position, at once. Playback sockets keep their held position until the trailing flush, and `broadcasted.producer` is rebuilt at the broadcast position so a later publish compares correctly. This is the recorded mechanism (hub header, `src/server/hub.ts:38-41`, "at once and outside the position pacing"), and it stays; see Reviewed and Dismissed.
- **Where the active list sits (finding 1):** open, Nick to pick Option A or Option C below. Until he picks, no remediation touches finding 1.

## Confirmed Issues

### 1. Each send and each Clear moves the quick messages, Send and Clear messages up or down the producer page: MEDIUM (capped)
- **Location:** `web/src/ProducerMessages.tsx:47-59` (the active list above `.message-presets`), `web/src/DevicesPanel.tsx:24-27,41` (the `Message:` line on each device row), `web/src/App.tsx:309-310` (the Devices panel above the Message the band panel)
- **Attribution:** introduced. `git show 232dfca:web/src/ProducerMessages.tsx` has no list above the presets, and `git show 232dfca:web/src/DevicesPanel.tsx` has no `device-message` line. Added in `b757417` ("the producer page lists the active messages and the Devices panel names the one each device shows").
- **Real-world trigger:** mid-song, the producer taps Repeat chorus for the view-only devices, then reaches for Watch leader or Clear messages at the place it was a moment ago. Every button in the panel is now 57 px (iPad) to 85 px (Android phone) lower, and lower again after a second send to another target. The user path is the producer page on a tablet or phone, the "one-tap" quick messages from #11 decision 9. Capped at MEDIUM: the defect class is a control that moves under the finger, the same class as #11 pre-PR review 1 finding 1 (MEDIUM, capped). Upgrade to HIGH only if a mis-tap at the old place lands on a control that sends to the band or clears; the repro does not test that, and it can check it with `document.elementFromPoint` at the old position.

**Evidence**
```tsx
<h2 id="messages">Message the band</h2>
{activeMessages.length === 0 ? (
  <p className="status">No active message.</p>
) : (
  <ul className="message-active-list" aria-label="Active messages">
    {activeMessages.map((message) => (
      <li key={message.id} className="message-active">
```
and in each device row, ahead of the Message the band panel: `{messageLine(device.client)}`.

**Failure mode**: executed, `node docs/reviews/setlist-controller-28/repro/quick-messages-move.mts`, exit 1:
```
FAIL chromium Repeat chorus top after a quick message to the view-only devices: 1855px (85px, of which the Devices panel above moves the Message the band heading 58px)
FAIL chromium Repeat chorus top after a quick message to one chosen phone: 1933px (163px, ... 58px)
ok   chromium Repeat chorus top after Clear messages: 1770px (0px, ... 0px)
FAIL webkit Repeat chorus top after a quick message to the view-only devices: 1323px (57px, ... 58px)
FAIL webkit Repeat chorus top after a quick message to one chosen phone: 1372px (106px, ... 58px)
```
Two sources add up: the active list's rows (27 px then 78 px more on the phone) and the `Message:` line on each Devices panel row that shows the message (29 px per row on both engines here, two phones).

**Recommended fix**: needs a decision from Nick. Options:
- **Option A (recommended): nothing above the panel's controls grows.** Put `<ProducerMessages />` before `<DevicesPanel />` in `web/src/App.tsx:309-310`, and move the active list block (`ProducerMessages.tsx:47-59`) after `<div className="message-actions">`, so the list and the Devices rows grow below every control in the panel. Cost: the panel order changes on the producer page, and the README's "under the Devices panel" changes with it. The Devices panel's own Reload buttons still move when a row above them gains a `Message:` line; Reload is not a mid-song control.
- **Option B: the list only.** Move the active list below `.message-actions` and keep the panel order. This removes 27 to 78 px of the shift on the phone, and the 58 px from the Devices rows stays. Partial, so not recommended.
- **Option C: accept the shift.** Record that the `.page-top` zero-shift rule covers the top layer only, and that the producer panel moves on a send. No code change.

Recommended diff for Option A, `web/src/App.tsx`:
```diff
       <ConnectionsPanel connections={snapshot.connections} problems={snapshot.connectionProblems} connected={connected} setKnown={snapshot.set !== null} send={send} />
-      <DevicesPanel devices={snapshot.devices} producer={{ ownClient: clientId, connected, send, activeMessages: snapshot.activeMessages }} />
       <ProducerMessages devices={snapshot.devices} activeMessages={snapshot.activeMessages} ownClient={clientId} connected={connected} send={send} />
+      <DevicesPanel devices={snapshot.devices} producer={{ ownClient: clientId, connected, send, activeMessages: snapshot.activeMessages }} />
```
and in `web/src/ProducerMessages.tsx`, cut the `{activeMessages.length === 0 ? ( ... )}` block from under the `<h2>` and paste it unchanged after the closing `</div>` of `message-actions`, before `</section>`.

**Remediation brief**
- **Design intent:** a control the producer taps mid-song stays where it was when a message comes or goes. #11 settled this for the top layer (`.page-top`, "nothing under it moves"); this finding asks the same of the producer's own panel. The data flow does not change: `snapshot.activeMessages` feeds both panels, and only their order in the page and the list's place in the panel move.
- **Full surface:** `web/src/App.tsx:309-310` (panel order); `web/src/App.tsx:313-314` (the name field comment says "under the Message the band panel on the producer page", which becomes "under the Devices panel"); `web/src/ProducerMessages.tsx:7-12` (header comment: "under the Devices panel. First the active messages" becomes "above the Devices panel ... Last, the active messages"); `web/src/ProducerMessages.tsx:47-59` (the list block); `web/src/styles.css:1276-1278` (the panel comment); `README.md:49` ("The producer page's Message the band panel, under the Devices panel" and the order of its sentences); `README.md:185` if it names the panel order. Find every other place that names the order with `grep -rn "under the Devices panel\|Message the band panel" web/src README.md test e2e`.
- **Must preserve:** every test in `e2e/messages.spec.ts`, `e2e/devices.spec.ts` and `e2e/producer.spec.ts` (they find the panels by role and name, so the order change should not break them; run them); `test/messages-page.test.ts` "lists each active message with its text, its target and when it was sent, for every target kind"; `test/devices-panel.test.ts` (the `Message:` line); the page's `deviceChoices` order, which is the Devices panel's order whatever the panel order is.
- **Do not touch:** the hub and the board (Reviewed and Dismissed: the position pacing on a send). The `Message:` line's content and its offline rows (Reviewed and Dismissed: `shownBy` includes offline devices).
- **Proof:** `pnpm build && node docs/reviews/setlist-controller-28/repro/quick-messages-move.mts` exits 1 now and must exit 0 after. The real-suite form is a new e2e test in `e2e/messages.spec.ts`, mirroring the "moving no control on the leader page as it comes and goes" tests: measure the Repeat chorus and Clear messages buttons' page positions before a quick message, after it, and after Clear, and expect them equal.

### 2. The revert test does not check the producer page, the one socket this branch gives a held position: LOW
- **Location:** `test/hub-coalescing.test.ts:679-689`
- **Attribution:** introduced, in `2475ddb` (`git log --oneline -S"after a message reached the producer page" 232dfca..HEAD`).
- **Real-world trigger:** none for users. The gap is in coverage: a later change to the revert path in `publish` (`src/server/hub.ts:281-287`) that stops delivering to producer sockets would leave the producer page at a position the stage never reached, until the next change, and every test stays green. Capped at LOW: test coverage, no user path today.

**Evidence**
```ts
it('is brought back to the broadcast position when the position reverts after a message reached the producer page', async () => {
  const { hub, existing, existingCount, producer, midWindow } = await heldWindow();
  producer.send({ kind: 'message', text: 'Repeat chorus', to: 'viewers' });
  await producer.snapshot((snapshot) => snapshot.activeMessages.length === 1);

  hub.publish(snap(10), noProblems);

  await midWindow.snapshot((snapshot) => snapshot.position === 10);
```
The message gives the producer page the held position 12 (`messagesChanged` sends `latest`), and the test then checks only `midWindow` and `existing`.

**Failure mode**: executed in a scratch worktree at HEAD. With `docs/reviews/setlist-controller-28/repro/revert-skips-producer.mutation.patch` applied (the revert path delivers to non-producer sockets only), all 19 tests in `test/hub-coalescing.test.ts` pass. With `docs/reviews/setlist-controller-28/repro/revert-test-checks-producer.patch` also applied, the test fails: `AssertionError: expected 12 to be 10`. With the test patch alone, on the real hub, all 19 pass.

**Recommended fix**: apply `docs/reviews/setlist-controller-28/repro/revert-test-checks-producer.patch`:
```diff
     await producer.snapshot((snapshot) => snapshot.activeMessages.length === 1);
 
+    expect(producer.received.at(-1)?.position).toBe(12);
     hub.publish(snap(10), noProblems);
 
     await midWindow.snapshot((snapshot) => snapshot.position === 10);
+    await producer.flush();
+    expect(producer.received.at(-1)?.position).toBe(10);
     await existing.flush();
```
`producer.snapshot(predicate)` would not do: it resolves on any snapshot received so far, and the producer already holds an earlier position 10 from `heldWindow()`.

**Remediation brief**
- **Design intent:** a send or Clear gives producer sockets `latest` at once, which may carry a position held for the trailing flush. A publish that brings the position back to the broadcast one cancels the flush and delivers to every socket (`src/server/hub.ts:281-287`), so the producer page comes back too. The test named for that case has to observe the producer.
- **Full surface:** `test/hub-coalescing.test.ts:679-689` only.
- **Must preserve:** the test's existing checks on `midWindow` and `existing` (`existing.received.length` stays `existingCount`).
- **Do not touch:** `src/server/hub.ts`. The code is correct; this is a test-only change.
- **Proof:** red: `git apply docs/reviews/setlist-controller-28/repro/revert-skips-producer.mutation.patch docs/reviews/setlist-controller-28/repro/revert-test-checks-producer.patch && pnpm vitest run test/hub-coalescing.test.ts -t "after a message reached the producer page"` fails with `expected 12 to be 10`; then `git apply -R docs/reviews/setlist-controller-28/repro/revert-skips-producer.mutation.patch` and the same command passes. Revert the mutation patch before committing.

### 3. The empty-list test asserts only fixed copy, and its other assertion cannot fail: LOW
- **Location:** `test/messages-page.test.ts:164-167`
- **Attribution:** introduced, in `b757417` (`git log --oneline -S"says there is no active message when there is none" 232dfca..HEAD`).
- **Real-world trigger:** none for users. A change that shows "No active message." beside a non-empty list, or shows an empty list with no line, passes the unit suite. The e2e test covers the empty state after Clear (`e2e/messages.spec.ts` "the producer page shows each active message ... and a newer one or Clear changes it at once"). Capped at LOW.

**Evidence**
```ts
it('says there is no active message when there is none', () => {
  expect(listed(active([]))).toEqual([]);
  expect(active([])).toContain('No active message.');
});
```
`listed` matches `<li class="message-active">`, which an empty array never renders, so the first line passes whatever the component does. The second is a copy assertion with no branch observed (global rule `tests-state-a-rule`).

**Recommended fix**
```diff
-  it('says there is no active message when there is none', () => {
-    expect(listed(active([]))).toEqual([]);
-    expect(active([])).toContain('No active message.');
+  it('shows the no-message line in place of the list, and only while no message is active', () => {
+    expect(active([])).toContain('No active message.');
+    expect(active([])).not.toContain('message-active-list');
+    const one = active([{ id: 'm1', text: 'Watch leader', to: ['keys'], sent: at(9, 41), shownBy: ['keys'] }]);
+    expect(one).not.toContain('No active message.');
+    expect(one).toContain('message-active-list');
   });
```
**Remediation brief**
- **Design intent:** the panel shows exactly one of the two: the status line when `activeMessages` is empty, the list otherwise. The text only shows which branch ran.
- **Full surface:** `test/messages-page.test.ts:164-167` only.
- **Must preserve:** the other tests in the same `describe`, and the `listed` helper.
- **Do not touch:** `web/src/ProducerMessages.tsx`.
- **Proof:** with `activeMessages.length === 0 ?` changed to `activeMessages.length < 0 ?` in `web/src/ProducerMessages.tsx:47`, `pnpm vitest run test/messages-page.test.ts -t "no-message line"` fails; restore it and it passes.

### 4. Comment hygiene: LOW (aggregated)
- `src/shared/messages.ts:20-21`: "the client IDs of the devices in the hub's registry that show it now" → "the client IDs of the devices in the hub's registry that show it, an offline one when it comes back" (the registry keeps offline devices and `shownOn` ignores `online`; README documents "offline devices included").
- `web/src/DevicesPanel.tsx:7-8`: "names it, so the producer sees who it reached" → "names it, so the producer sees who holds it; an offline device shows it when it comes back, whether or not it was online at the send".
- `web/src/styles.css:1276-1278`: "the quick messages in a row that wraps, the text box across the panel, who the message goes to, and Send and Clear" → "the active messages, the quick messages in a row that wraps, the text box across the panel, who the message goes to, and Send and Clear" (with Option A of finding 1, put the active messages last instead).
- `README.md:49`: "until a newer message to All devices replaces it there too" → "until a newer message to All devices takes it off there" (a message to All devices shows on no producer page, decision 1).
- `README.md:49`: "and the Devices panel names the message each device shows" → "and the producer page's Devices panel names the message each device shows" (the setup screen's Devices panel shows none).

## Needs Further Investigation

### A. The full Playwright suite hangs in WebKit in `page.goto`, at the base as well as at HEAD
`pnpm test:e2e` fails test 56 (`e2e/messages.spec.ts:60`) in `webkit-ipad` at both `232dfca` and `2475ddb`, and at HEAD also test 109 (`e2e/timeline.spec.ts:286`), each a 30 s timeout waiting for "load". Both pass alone (`--repeat-each 3`), and the hang needs the tests before it in one WebKit worker (67 of 68 pass in the subset up to `messages.spec.ts`). Closing every browser context after each test does not stop it. #11's remediation recorded 218 passing on 2026-11-26, so this is new to this machine's state, not to this branch's code: attribution pre-existing; this branch's four new e2e tests shift a second hang onto test 109. What would settle it: run `pnpm test:e2e` at `232dfca` on another machine or after a reboot (green there means machine state); `pnpm exec playwright --version` against the version #11 ran; a WebKit trace of test 56 (`--trace on`) to see which request never finishes. Recommend a follow-up issue rather than a gate on this PR, since the base is red the same way.

## Reviewed and Dismissed
- **A send gives producer pages a position held for the trailing flush** (`src/server/hub.ts:184-189`): the message changes the producer socket's own payload, so the send is due, and it carries the newest position rather than an extra one. Playback sockets stay held (`test/hub-coalescing.test.ts` "sends the next position at once after a message and a publish that changes nothing" and the held-viewer tests), the trailing flush sends the producer nothing more, and the revert path brings it back (proved by finding 2's test on the real hub). The hub header says "outside the position pacing". Do not route the message snapshot through `publish` or build it from `broadcastedState`.
- **`shownBy` lists offline devices, including one that left before the send** (`src/server/messages.ts:71`): the board holds the message for that device and it shows on return. The issue asks for each device "that holds the active message", and the README says "offline devices included". Only the comments drift (finding 4).
- **`shownBy` reads the registry's role while frames use the socket's role**: one client ID per page role (`readClientId`, `web/src/device-settings.ts:263`), so a client ID with two roles needs a hand-made hello. Not reachable from the app.
- **`targetLine` and Send to could label one device two ways**: both come from `deviceLabels` over the same `devices`, and `deviceChoices` filters it, so the labels match.
- **The `before`/`now` map** (`src/server/hub.ts:246-252`): sockets with no client are skipped, two sockets of one client are compared apart, each uses its own role, and the sender gets no frame (null to null).
- **`active()` can list a message no device shows**: only decision 3's case, approved.
- **`test/messages.test.ts` "keeps a chosen message listed with its whole target after a newer message to the view-only devices covers it" is green at its parent `6db1dc2`**: it pins decision 3, existing behaviour by design. `a31282f`'s change to `src/server/messages.ts` is a comment rewrap only (`git show a31282f -- src/server/messages.ts`). Keep it.
- **`test/messages-hub.test.ts` "to a chosen producer page reaches it" is green at base**: it guards decision 1's limit, that only All devices skips producer pages. Keep it.
- **`test/hub-coalescing.test.ts` "shows the producer page a message at once, inside a window that holds a position" was never seen red for its reason**: mutation B (no delivery to producers in `messagesChanged`) turns it red with a timeout. Keep it.
- **Contrast of the new grey lines**: 6.18:1 and up, pass.
- **VoiceOver may drop the list role of `.message-active-list` (`list-style: none`)**: unverified, and `.device-list` has the same shape since #9. Not this branch's.

## Minor / nits
- `e2e/messages.spec.ts:289-290`: a doubled blank line before the battery warning test.
- `web/src/ProducerMessages.tsx:54`: `deviceLabels(devices)` is computed once per listed message inside the `map`; compute it once above the list.
- `web/src/ProducerMessages.tsx:152-160`: duplicate names are now found across every device, the producer page's own included, so a lone other producer page with the same name and role shows a "(abcd)" suffix in Send to although this page's own row is not listed there.
- `.message-active-text` and `.device-message` have no `overflow-wrap`; a 120-character message with no space runs past its row on a phone. `.join-url` (`web/src/styles.css:886-890`) uses `overflow-wrap: anywhere` for that.
- `test/devices-panel.test.ts:116`: "lists the devices as the producer sees them" is from #9 (`d70bd51`); the producer now also sees `Message:` lines, which the setup screen leaves out.
- `src/server/hub.ts:275`: every publish, position ticks included, recomputes `messages.active(devices.list())`. Small at this size.
- `e2e/messages.spec.ts:268`: `toHaveCount(0)` on a producer page's banner passes at once; the rig test in `test/messages-hub.test.ts` covers the same rule with `settled()`.
- No hub test checks `shownBy` after a device disconnects or after Clear offline; both reach the producer through the devices change.

## Test quality
Tests added: 20 (devices-panel 1, hub-coalescing 3, messages-hub 6, messages-page 5, messages 5), tests changed in body: 5, plus 4 new e2e tests (2 per project). Red at base: 23 of 25. Green at base: 2, both kept (listed in Reviewed and Dismissed). Tautology shapes: none of identity, mocked unit, call-shaped, unread snapshot or no assertion. One copy test (finding 3) and one test that misses the socket it is named for (finding 2). Mutations B and D show the new hub tests can go red.

## Before opening the PR
- **CI readiness:** lint, typecheck, the unit suite and the private-terms check pass. `pnpm test:e2e` is red on this machine, at the base as well (Needs Further Investigation A); it runs locally only, never in CI.
- **Commit hygiene:** 5 commits, noreply author and committer. This review adds `docs/reviews/setlist-controller-28/` only.
- **Likely reviewer asks:** the panel moving on a send (finding 1); why the producer page gets a held position with a message (Approach decisions); whether the e2e failures are this branch's (Needs Further Investigation A).

## Verdict
Ready with follow-ups once finding 1 is settled. Gate: Nick picks Option A or Option C for finding 1, and with Option A the remediation lands with its zero-shift e2e test. Findings 2, 3 and 4 are small and go in the same remediation round. Needs Further Investigation A becomes a follow-up issue, since the base fails the same way.
