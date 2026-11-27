# Pre-PR review: setlist-controller#33 which devices dismissed a band message

**Branch:** `setlist-controller-33-dismissed-status` vs `origin/main` (merge-base `4b48b4b`, "Merge pull request #35 from nick-vogel/setlist-controller-28-producer-active-message")
**Reviewed at:** HEAD `a614951` ("setlist-controller#33 Show a Dismiss on the device's row on the producer page"), clean tree (no uncommitted or untracked files at review start), 19 files changed, +463 / -76, 2 commits: `659a58e` ("setlist-controller#33 The hub records which devices dismissed each message") and `a614951`
**Reviewed against:** nick-vogel/setlist-controller#33 (its six Rules, settled 2026-11-26, and its acceptance criteria) and parent epic #8 with its sub-issues #9, #10, #11, #28 (read with `gh`), #36 for the WebKit timeouts, `.claude/rules/public-repository.md`, the global rules in `~/.claude/rules/`, `README.md`, `docs/HANDOFF-setlist-controller-33.md`, and the Approach decisions in `docs/reviews/setlist-controller-28/pre-pr-review-1.md` and `docs/reviews/setlist-controller-11/pre-pr-review-1.md` and `pre-pr-review-2.md`. The repo has no `AGENTS.md` or `CLAUDE.md`, and no ADRs.
**Date:** 2026-11-26
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Unit and rig suites | `pnpm vitest run --maxWorkers=2` | 117 files, 3612 passed, 5 skipped |
| Private terms | `pnpm check:private --range origin/main..HEAD` | exit 0 |
| Playwright, full suite | `pnpm test:e2e` | 228 passed, 2 failed, both `webkit-ipad` `page.goto` timeouts of 30 s: `e2e/messages.spec.ts:60` (test 56) and `e2e/stage-status.spec.ts:96` (test 102). These are #36, and main fails the same way (two late WebKit timeouts, `docs/reviews/setlist-controller-28/pre-pr-review-1.md`, remediation checks). Not worse on this branch |
| Playwright, the two failing files alone | `pnpm exec playwright test e2e/messages.spec.ts e2e/stage-status.spec.ts` | 46 passed, both projects, the six new e2e tests included |
| Em-dashes and en-dashes | added lines of `git diff 4b48b4b` searched for U+2014 and U+2013 | none |
| Commit authors | `git log --format='%h %ae \| %ce' 4b48b4b..HEAD` | GitHub noreply address only, both commits |
| Public repository | read every added test and README line | stand-in names only (Keys phone, Bass phone, Booth, Keys, Drums) |
| `.page-top` top layer, contrast, accessible names | read the diff | no style change, no new button; ", dismissed" is appended in the existing `.device-message` span |
| #16 coalescing, the Dismiss frame | test-audit probe P2: the Dismiss path also calls `broadcast()` | `test/hub-coalescing.test.ts` "holds a position published while the send before it is in flight past a Dismiss" goes red (`expected [0, 1, 2] to deeply equal [0, 1]`) |
| #16 coalescing, the hello path | read `src/server/hub.ts:221-231` and `src/server/devices.ts:53` | `devices.hello` reads only `client, name, battery`, so `listed` and the `devicesChanged()` publish run in exactly the base cases; the new branch calls `messagesChanged()`, which delivers to producer sockets alone |
| Mutations M1 to M7 | scratch worktree at HEAD, one mutation at a time (list in Test quality) | M1 to M6 each turn at least one test red; M7 (no `keep` effect in `useServer`) turns no vitest test red, and the e2e reconnect test covers it |
| Tautology audit | HEAD's 8 changed `.test.ts` files copied into a scratch worktree at `4b48b4b` and run there | 16 added tests, all red at base; 7 changed in body, 1 red, 6 green (fixture fields only). One added assertion cannot fail (finding 2) |
| Finding 1 repro | `node docs/reviews/setlist-controller-33/repro/dismissed-marks-outlive-registry.mts` | exit 1: 20000 hellos, 52 registry rows, 20000 marks held, an evicted client still marked on its return. With the recommended fix in a scratch worktree: exit 0, 51 marks; `test/messages.test.ts`, `test/messages-hub.test.ts`, `test/hub-coalescing.test.ts`, `test/devices.test.ts` 80 passed |
| Finding 2 proof | scratch worktree with `repro/clear-ignored.mutation.patch` applied | "goes with its message when a newer message replaces it or a Clear takes it off" passes with the hub ignoring Clear; with the recommended assertion it fails (`expected [ { …(6) } ] to deeply equal []`), and all 20 tests in the file pass without the mutation |

**Overall:** The branch holds every one of #33's six Rules and its acceptance criteria. A Dismiss frame and a hello's dismissed IDs reach producer sockets alone, so no playback socket's snapshot changes, and the three gaps the implementer filled are each correct. Three LOW findings remain: the hub keeps a dismissal mark for every client ID that ever said hello, past the device registry's cap (finding 1, needs Nick's pick of a mechanism); one new rig assertion on Clear cannot fail (finding 2); the proxied e2e test and the README claim a Devices row that the test never reads (finding 3); and a comment-hygiene batch (finding 4). Nothing blocks a PR.

## Approach decisions
Carried forward from `setlist-controller-28` and `setlist-controller-11`, all still held by this branch:
- **Drain detection, duplicate suppression, and busy-socket pumping (#16):** `ClientState.inFlight` is the hub's only busy signal; `deliver()` compares the role payload against `lastSent`; a broadcast that does not change a socket's own payload causes no early send; frames never set `dirty`.
- **A send, Clear or Dismiss and the position pacing:** `messagesChanged` re-encodes the producer side at the broadcast position and delivers to producer sockets alone, so a position held for the trailing flush to playback sockets stays held.
- **Message frame on a replaced wake socket:** message frames are read on the current socket only; reload frames are read on either.
- **Client ID and dismissed IDs per role:** keyed `setlist-controller.client-id.<role>` and `setlist-controller.dismissed-messages.<role>`, with `storage` listeners in the shape of `watchDeviceName`. A device is one browser for one page role.
- **One fixed top layer (`.page-top`):** nothing under it moves; this branch adds nothing to it.
- **Proxied e2e tests watch the producer through a rig socket** (`proxied.rig.connectProducer()`, `e2e/messages.spec.ts:231`, `:313`), since the proxy drops every connection it carries.

Approved for this branch, not findings:
1. The six Rules in #33's body, approved by Nick on 2026-11-26: a `{ kind: 'dismissed', id }` frame on each Dismiss plus the stored IDs in every hello; tabs of one page role are one device; two roles in one browser are two devices; every role reports, for a message active on that device only; the status shows on the Devices row alone as "Message: <text>, dismissed"; a newer message, a Clear or a restart takes it off.
2. Three gaps the implementer filled without a change to a rule, each reviewed and correct:
   - **A hello only adds marks and never removes one** (`src/server/messages.ts:70-74`, `dismiss` only calls `add`), so a stale tab cannot undo a Dismiss. Holds Rule 2.
   - **A hello with no dismissed field, or one the hub cannot read, reads as none** (`src/shared/devices.ts:64`, pinned by `test/devices.test.ts` "carries the IDs of the messages the device dismissed"), so a page from an older build still lists. Holds Rule 1 for every new page.
   - **A device that a newer message now covers loses the dismissed status on its row** (`dismissedBy` is filtered from `shownBy`, `src/server/messages.ts:89`). The board has no path back to an older message for a device: a newer All send or a Clear resets the board, and a newer View-only or chosen send only raises the newest order. So the row always names the message the device shows, which is Rule 5, and the old status goes with the old message, which is Rule 6.
3. The WebKit `page.goto` timeouts late in a full run are #36 (`e2e/messages.spec.ts:60`, `e2e/timeline.spec.ts:175`, `e2e/stage-status.spec.ts:96`). main fails the same way, and this branch does not make it worse (two failures at HEAD, as at main).

Added in this review:
- **Bounding the dismissal marks (finding 1):** Nick picked Option A on 2026-11-26 ("Approve"): `active()` drops each mark for a client that no longer shows the message, which bounds the marks by the device registry. A device the registry evicted marks itself again with the IDs in its next hello.

## Remediation scope
Nick 2026-11-26: remediate all four Confirmed findings. Finding 1 takes Option A, with its board test. Needs Further Investigation A stays out of this round.

## Confirmed Issues

### 1. The hub keeps a dismissal mark for every client ID that ever said hello, past the device registry's cap: LOW (capped)
- **Location:** `src/server/messages.ts:70-74` (`dismiss`), `:33-35` (`Posted.dismissed`), reached from `src/server/hub.ts:225` (hello) and `:235` (Dismiss frame).
- **Attribution:** introduced. `git log --oneline -S'dismissed: Set<string>' 4b48b4b..HEAD` gives `659a58e`. At base the board keeps nothing per hello, and the registry keeps at most `MAX_OFFLINE_DEVICES` (50) offline rows (`src/server/devices.ts:13`, `:46`).
- **Real-world trigger:** the view-only socket `/ws` needs no secret, so any device on the stage network can open it. While a message to All devices or View-only devices stands, a script on one socket says hello with a new client ID each time and the shown ID in `dismissed`. Each hello adds one mark of up to 64 characters that stays until the next All message or a Clear. No page of the app does this: an honest device has one client ID per role. LOW, capped: no user path. Upgrade to MEDIUM if the stage network admits devices nobody controls; the same script already costs a producer broadcast per hello at base, so the new part is memory alone.

**Evidence**
```ts
dismiss(client, role, ids) {
  const shown = shownOn(client, role);
  if (!shown || !ids.includes(shown.message.id) || shown.dismissed.has(client)) return false;
  shown.dismissed.add(client);
  return true;
},
```
Nothing ever deletes from `dismissed`; only a new `Posted` or a Clear drops the whole Set.

**Failure mode** - `node docs/reviews/setlist-controller-33/repro/dismissed-marks-outlive-registry.mts`:
```
registry rows 52 (offline cap 50), hellos 20000
marks the board still holds 20000
client evicted after its first hello still marked dismissed on its return: true
```
exit 1. The last line also shows a second effect: a device the registry forgot comes back with an empty dismissed list and its row still reads ", dismissed".

**Recommended fix** (Option A)
```diff
         .map(({ message, to, sent, dismissed }) => {
           const shownBy = devices.filter((device) => shownOn(device.client, device.role)?.message === message).map((device) => device.client);
+          const showing = new Set(shownBy);
+          for (const client of dismissed) if (!showing.has(client)) dismissed.delete(client);
           return {
```
Rewrite the `Posted` comment at `src/server/messages.ts:33-34`, which says a device that shows a newer message "stays in it unseen": with the fix, `active()` drops the marks of every device that does not show the message, and a device's next hello marks it again from its stored IDs. Add a board test in `test/messages.test.ts`: dismiss from more client IDs than the list passed to `active()` holds, call `active()` with a short list, then show that a client outside it is not marked on a second `active()` with it included.

**Remediation brief**
- **Design intent:** a mark records that a device the producer can see dismissed the message it shows. The hub always calls `active()` with the whole registry (`src/server/hub.ts:105`), offline rows included, and every new mark is followed by an `active()` call (a hello that marks publishes or calls `messagesChanged`, and so does a Dismiss frame). So a mark outside the registry is never read, and a device that comes back re-marks itself through the dismissed IDs in its hello (Rule 1). Pruning in `active()` keeps the Set no larger than the registry plus the marks of one hello.
- **Full surface:** `src/server/messages.ts:82-92` (the fix); `src/server/messages.ts:33-34` (the comment); `src/server/messages.ts:24-26` (the `dismiss` and `active` contract comments, which must say `active()` forgets marks of devices outside its list); `test/messages.test.ts` the "a Dismiss" block near `:211` (the new test).
- **Must preserve:** gap (a), a hello never removes a mark of a device that still shows the message; gap (c), the row names the message the device shows; every test in `test/messages.test.ts`, `test/messages-hub.test.ts`, `test/hub-coalescing.test.ts` (80 passed with the fix, with `test/devices.test.ts`); the producer-page test at `test/messages.test.ts:255`, which calls `active()` with the producer page alone. Dropped on purpose: the mark of a device the registry evicted, and of a device a newer message covers.
- **Do not touch:** the hello path's `listed` and `dismissed` branch in `src/server/hub.ts:224-229` (Reviewed and Dismissed); `isClientId`'s 64-character cap.
- **Proof:** `node docs/reviews/setlist-controller-33/repro/dismissed-marks-outlive-registry.mts` exits 1 now and 0 after. `pnpm vitest run --maxWorkers=2 test/messages.test.ts test/messages-hub.test.ts test/hub-coalescing.test.ts`.

### 2. The new rig test's Clear check matches a snapshot from before the message was sent, so it passes with Clear ignored: LOW
- **Location:** `test/messages-hub.test.ts:322`, in "goes with its message when a newer message replaces it or a Clear takes it off".
- **Attribution:** introduced. `git log --oneline -S'goes with its message when a newer message replaces it' 4b48b4b..HEAD` gives `659a58e`. The same shape at `test/messages-hub.test.ts:240` (`await panel.snapshot(lists([]))`, in the base since #28) is pre-existing, untouched.
- **Real-world trigger:** none for users; a regression in Clear's handling of dismissals passes this test. Acceptance criterion 5 asks the rig tests to cover "a Clear removes the dismissed status", and this is its rig coverage.

**Evidence**
```ts
panel.send({ kind: 'clear-messages' });
await panel.snapshot(dismissals([]));
```
`snapshot()` resolves with the first snapshot already received that matches (`test/harness.ts:331`, `received.find(matches)`), and the panel's first snapshot had no active messages.

**Failure mode** - in a scratch worktree, `git apply docs/reviews/setlist-controller-33/repro/clear-ignored.mutation.patch` (the hub ignores `clear-messages`), then `pnpm vitest run test/messages-hub.test.ts -t "goes with its message"`: 1 passed.

**Recommended fix**
```diff
     panel.send({ kind: 'clear-messages' });
-    await panel.snapshot(dismissals([]));
+    await expect.poll(() => panel.received.at(-1)?.activeMessages).toEqual([]);
```

**Remediation brief**
- **Design intent:** a check after an action must read state that only the action can make. The newest snapshot before the Clear holds "Repeat bridge" dismissed by keys, so the newest snapshot after it can equal `[]` only through the Clear.
- **Full surface:** `test/messages-hub.test.ts:322`. Optional in the same commit, since it is the same shape: `test/messages-hub.test.ts:240`.
- **Must preserve:** the rest of the test, its earlier `panel.snapshot(dismissals(...))` checks, which match only after their action, since no earlier snapshot holds those messages.
- **Do not touch:** `snapshot()` in `test/harness.ts`; many tests rely on it finding a snapshot that already arrived.
- **Proof:** in a scratch worktree at HEAD with the fix and the patch applied, `pnpm vitest run test/messages-hub.test.ts -t "goes with its message"` fails (`expected [ { …(6) } ] to deeply equal []`); without the patch, `pnpm vitest run test/messages-hub.test.ts` passes, 20 of 20. Both were run in this review.

### 3. The proxied e2e test and the README claim a producer page's Devices row after a dropped connection, but the test reads a rig socket's count of dismissals: LOW
- **Location:** `e2e/messages.spec.ts:176` (title), `:179`, `:192`; `README.md:186` ("a Dismiss shown on that device's Devices row alone, at once, across its reload, after a dropped connection, and for one page role in a browser with two").
- **Attribution:** introduced. `git log --oneline -S'a Dismiss tapped while the phone is reconnecting' 4b48b4b..HEAD` gives `a614951`.
- **Real-world trigger:** none for users. A maintainer who trusts the README believes Playwright proves the row text after a reconnect, and the check passes for any one device in `dismissedBy`.

**Evidence**
```ts
const producer = await proxied.rig.connectProducer();
...
await expect.poll(() => producer.received.at(-1)?.activeMessages[0]?.dismissedBy.length, { timeout: 5000 }).toBe(1);
```
The test itself is sound for what it does: once "Reconnecting" shows, the Dismiss frame is dropped (`web/src/server-connection.ts:161-163`), so only the next hello can carry the ID. That is the one Playwright proof of the `keep` effect in `useServer` (mutation M7 turns no vitest test red).

**Recommended fix**
```diff
-test('a Dismiss tapped while the phone is reconnecting reaches the producer page once the phone is back', async ({ page }) => {
+test('a Dismiss tapped while the phone is reconnecting reaches the producer once the phone is back', async ({ page }) => {
```
```diff
-  await expect.poll(() => producer.received.at(-1)?.activeMessages[0]?.dismissedBy.length, { timeout: 5000 }).toBe(1);
+  const [phone] = await proxied.rig.devices();
+  await expect.poll(() => producer.received.at(-1)?.activeMessages[0]?.dismissedBy, { timeout: 5000 }).toEqual([phone.client]);
```
In `README.md:186`, replace "a Dismiss shown on that device's Devices row alone, at once, across its reload, after a dropped connection, and for one page role in a browser with two" with "a Dismiss shown on that device's Devices row alone, at once, across its reload, and for one page role in a browser with two, and one tapped while a phone reconnects reaching the producer once the phone is back".

**Remediation brief**
- **Design intent:** proxied tests watch the producer through a rig socket, because the proxy drops every connection it carries (Approach decisions). The row text after a reconnect follows from the snapshot, which other tests render. So the fix is to name what the test proves and to check the phone's own client ID, not to add a producer page.
- **Full surface:** `e2e/messages.spec.ts:176`, `:192`; `README.md:186`.
- **Must preserve:** the drop, the Dismiss while "Reconnecting" shows, `toHaveCount(0)` on the banner, and the restore, in that order; the 5000 ms poll; `producer.close()`.
- **Do not touch:** the proxied tests at `e2e/messages.spec.ts:231` and `:313`, which use the same rig-socket pattern.
- **Proof:** `pnpm build && pnpm exec playwright test e2e/messages.spec.ts -g "reconnecting reaches the producer"` passes in both projects; with the `keep` effect removed from `web/src/App.tsx:570-573` it fails.

### 4. Comment hygiene: LOW (aggregated)
- `src/server/hub.ts:38` - "Every socket may send a Dismiss of the message it shows" → "Every socket that said hello may send a Dismiss of the message it shows" (a Dismiss before a hello is dropped, `:235`).
- `src/server/hub.ts:346-347` - "a send or a Clear reaches the producer sockets on its own (messagesChanged)" → "a send, a Clear or a Dismiss reaches the producer sockets on its own (messagesChanged)".
- `src/shared/command.ts:86` - "Every page role sends one" → "Every page that said hello sends one; the setup screen sends none".
- `src/shared/command.ts:90` - "every page a Dismissal" → "every page but the setup screen a Dismissal".
- `src/shared/devices.ts:32` - "and so the most a hello carries" → "and so the most of a hello's IDs the hub reads, the newest last: the page's list in memory is not capped".
- `web/src/App.tsx:531-532` - "goes on every socket and again on each change" → "goes on every socket and again on each change of its client ID, name or battery".
- `web/src/App.tsx:561-563` and `web/src/server-connection.ts:22-23` - "each Dismiss goes on its own frame" → "each Dismiss goes on its own frame from the tab it was tapped in, and an ID from another tab or tapped while the socket was down reaches the hub in the next hello".
- `web/src/DevicesPanel.tsx:13` - the line "The setup screen lists the devices with neither, ... while the page is not connected." is 157 characters against about 105 around it → rewrap it to the block's width.

## Needs Further Investigation

### A. A Dismiss in one tab reaches another open tab only as its next hello
`watchDismissedMessages` gives tab B the ID that tab A stored, and B's effect calls `keep` (`web/src/App.tsx:570-573`), which sends nothing on B's open socket. Tab A's own frame or its next hello is the path to the hub. The gap: A taps Dismiss while its socket is down, then A is closed before it reconnects (about 2 s), while B stays connected. The row then lacks ", dismissed" until B's socket is replaced. A second half, reasoned from React 19.3.0's source by the web agent: a `storage` event runs at default priority, so B's `keep` can run after a socket `open` task, and that hello lacks the ID. Both halves are reasoned, not reproduced. Rule 2 holds once either tab reconnects. What would confirm it: a Playwright test with two tabs of one page in one context, A's socket dropped through the proxy, a Dismiss in A, A closed, then the rig producer's `dismissedBy`. If it confirms, the fix is for the effect to call `introduce` when the IDs grew from another tab, since a hello only adds marks.

## Reviewed and Dismissed
- **The hello path can flush a held playback position** (`src/server/hub.ts:224-229`): `devices.hello` reads `client, name, battery` alone (`src/server/devices.ts:53`), so `listed` is true in exactly the base cases, and `devicesChanged()` runs only there. A hello that marks and changes no row calls `messagesChanged()`, producer sockets alone. Mutation M3 shows the branch is pinned by "in a second tab's hello, which changes no device on the list, still shows at once".
- **A Dismiss frame before any hello** (`src/server/hub.ts:235`): `state.client !== null` drops it.
- **A view-only socket's Dismiss** is read before `if (!controls(role)) return;`: Rule 4 lets every role report, and no Command, ConnectionCommand or DeviceCommand has kind `dismissed`. Mutation M5 turns two rig tests red.
- **An ID that is not active on the device**, an older chosen message under a newer View-only message, another device's chosen message, an All message on a producer page: `shownOn` returns the newest message for that client and role, and `dismiss` compares its ID. Mutation M1 turns the board test red.
- **Size of the hello's dismissed list and the frame's ID:** the list is filtered to strings and cut to the newest 20, and neither list nor ID is stored; both are only compared. No `maxPayload` is set on the hub at base or here, so every parser already reads a frame of the `ws` default size.
- **`parseHello` cuts to the last 20 while the page's in-memory list is uncapped:** the message a device shows only changes to a newer one, so its dismissal is always among the newest IDs. The cut keeps the right one.
- **A spoofed hello with another device's client ID marks that device:** it needs the other device's client ID, which no view-only payload carries, and base already lets such a hello rename and re-role the row (`src/server/devices.ts:53-63`). Pre-existing spoof surface, not this branch's.
- **The `useEffectEvent` hello in `useServer`:** the introduce effect still sends on every change of client ID, name, battery or socket path and reads the latest hello, dismissed IDs included; lint (react-hooks 7.1.1) is clean, and React 19.3.0 is installed.
- **The setup screen:** its hello is null and `Setup` renders before `Page`, so it sends no Dismiss and its Devices panel has no `producer` prop, so ", dismissed" never shows there.
- **The order of snapshot and message frame on a producer hello that marks:** the snapshot goes first and the frame waits, the same as a hello that changes a row at base.
- **`test/hub-coalescing.test.ts` "holds a position ... past a Dismiss" checks `[0, 1]`, a negative check:** probe P2 turns it red, so it can fail for its reason.
- **The six tests green at base** (devices-panel "marks each device with the message it shows", hub-coalescing "past a message frame that reaches the socket", four in messages-page): each is from #11 or #28 and changes only by a `dismissedBy: []` or `dismissed: []` fixture field. Keep them.

## Minor / nits
- `e2e/messages.spec.ts:162-164`: the "stays across its reload" check passes on the row as it was before the reload, since the hub keeps the mark while the phone is away. It still guards against a reload's hello removing the mark.
- `test/devices.test.ts:41` builds its expectation with `ids.slice(-MAX_DISMISSED_MESSAGES)`, the expression `parseHello` uses; `toHaveLength(20)` would pin the value too.
- `test/messages.test.ts:287-296` "forgets every dismissal on Clear" follows from Clear dropping the message, which predates the branch.
- No vitest test covers `App`'s Dismiss frame or the `keep` effect, since tests render `Page` statically; Playwright covers both.
- `web/src/App.tsx:169`: the in-memory dismissed list grows by one ID per Dismiss for the life of the tab, and every hello carries all of it.
- `src/server/hub.ts:233`: each frame is parsed once more for `parseDismissal`, as the other parsers already do.

## Test quality
Tests added: 16 (messages 8, messages-hub 4, devices-panel 1, devices 1, hub-coalescing 1, server-connection 1), plus 3 e2e tests (6 runs over two projects). Changed in body: 7, of which 1 is red at base (it expects `dismissedBy`) and 6 green (fixture fields only, kept). One test is red at base only through the `hello` helper's new field. Red at base: all 16 added. Tautology shapes: one check that cannot fail (finding 2), one expectation built from the production expression (Minor). Mutations at HEAD: M1 (accept any ID) red in `test/messages.test.ts`; M2 (Dismiss frame calls `devicesChanged`) red in `test/hub-coalescing.test.ts`; M3 (no `messagesChanged` on a hello that marks) red in `test/messages-hub.test.ts`; M4 (`dismissedBy` unfiltered) red in both board and rig tests; M5 (Dismiss below the view-only gate) red in two rig tests; M6 (no cut to 20) red in `test/devices.test.ts`; M7 (no `keep` effect) red in no vitest test, covered by the e2e reconnect test.

## Before opening the PR
- **CI readiness:** lint, typecheck, the unit suite and the private-terms check pass. `pnpm test:e2e` has the two #36 WebKit timeouts that main has; it runs locally only, never in CI.
- **Commit hygiene:** 2 commits, noreply author and committer. This review adds `docs/reviews/setlist-controller-33/` only.
- **Likely reviewer asks:** why a view-only socket may send a frame the hub reads (Rule 4); whether the dismissal marks are bounded (finding 1); whether the e2e failures are this branch's (#36).

## Verdict
Ready to open a PR with follow-ups. No finding gates it. Recommended before the PR, in one remediation round: finding 1 with Option A (Nick, 2026-11-26), findings 2 and 3, and the comment batch. Needs Further Investigation A can become a follow-up issue if its test confirms it.
