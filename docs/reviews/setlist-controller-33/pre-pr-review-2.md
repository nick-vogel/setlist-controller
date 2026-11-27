# Pre-PR review: setlist-controller#33 which devices dismissed a band message (second opinion)

**Branch:** `setlist-controller-33-dismissed-status` vs `origin/main` (merge-base `4b48b4b`, "Merge pull request #35 from nick-vogel/setlist-controller-28-producer-active-message")
**Reviewed at:** HEAD `7e6a93f` ("setlist-controller#33 pre-PR review 1: remediation closure"), clean tree (no uncommitted or untracked files at review start), 22 files changed total (+770 / -84; 19 code, test and README files, +494 / -84), 9 commits (`659a58e` through `7e6a93f`). Fresh (`--fresh`) full-surface review against `$BASE`.
**Reviewed against:** nick-vogel/setlist-controller#33 (its six Rules, settled 2026-11-26, and its acceptance criteria), PR #37, `.claude/rules/public-repository.md`, the global rules in `~/.claude/rules/`, `docs/merge-rules.md`, `README.md`, and the Approach decisions and resolved findings in `docs/reviews/setlist-controller-33/pre-pr-review-1.md`. The repo has no `AGENTS.md` or `CLAUDE.md`, and no ADRs.
**Date:** 2026-11-26
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Unit and rig suites | `pnpm test -- --maxWorkers=2` | 117 files, 3613 passed, 5 skipped |
| Private terms | `pnpm check:private --range origin/main..HEAD` | exit 0 |
| Playwright, messages spec | `pnpm build && pnpm exec playwright test e2e/messages.spec.ts` | 36 passed (18.0s), both `webkit-ipad` and `chromium-android` |
| Playwright, full suite | not re-run | skipped; the two late `webkit-ipad` `page.goto` timeouts (`e2e/messages.spec.ts:60`, `e2e/stage-status.spec.ts:96`) are tracked as #36 and reproduce on `main`, and `e2e/messages.spec.ts` passed 36/36 alone |
| Prior finding 1 repro | `node docs/reviews/setlist-controller-33/repro/dismissed-marks-outlive-registry.mts` | exit 0: 20000 hellos, 52 registry rows, 51 marks held, evicted client still marked on return: `false` |
| Differential scope-leak harness | `git show 4b48b4b:<path>` into `mktemp -d`; imported base and HEAD `src/server/messages.ts`, `src/shared/command.ts`, `src/shared/devices.ts`, `src/shared/messages.ts` | 100% match across 7 board scenarios, 7 `parseHello` inputs, 7 command-parser inputs, and all message/device helpers (0 scope leaks) |
| CONNECTING-socket Dismiss race probe | standalone Playwright script in `mktemp -d` against built `dist/web` and `startProxiedE2eRig`, holding socket #2 as `CONNECTING` and firing `open` from a `MessageChannel` queued before `btn.click()` | disproved: React 19 flushed `keep(next)` before the queued macrotask ran `open`, so socket #2's hello carried the dismissed ID and `dismissedBy` held the phone's client ID |
| `messages-hub.test.ts:319` socket-order probe | standalone script in `mktemp -d` against `startRig` running the send-then-panel-snapshot-then-read-`keys` sequence 300 times | 0/300 stale reads (`hub.ts:260-265` writes `keys`'s message frame before calling `messagesChanged()`) |
| Tautology audit at `$BASE` | not run at `$BASE` checkout | `git worktree add` is disallowed in non-Claude runs; all 17 added unit/rig tests and 3 added e2e tests were audited statically against the six tautology shapes in `tests-can-go-red` |
| Commit authors | `git log --format='%h %ae \| %ce \| %s' 4b48b4b..HEAD` | all 9 commits use the GitHub noreply address only |
| Em-dashes and en-dashes | added lines of `git diff 4b48b4b` searched for U+2014 and U+2013 | 0 matches |
| Public repository | inspected every added diff line in code, tests and README | stand-in names only (`Keys phone`, `Bass phone`, `Booth`, `Keys`, `Bass`, `Leader`, `Drums`, `Producer`) |

**Overall:** Every one of issue #33's six Rules and acceptance criteria holds, `#16`'s per-socket coalescing is intact (a Dismiss changes no playback socket's snapshot), and all four findings from `pre-pr-review-1.md` are fully remediated. Both plausible race candidates probed during verification were disproved by execution, and the differential harness against `4b48b4b` confirmed zero scope leaks in the shared computation modules. Zero confirmed defects remain; PR #37 is ready to merge as-is.

## Prior-review closure
Against `docs/reviews/setlist-controller-33/pre-pr-review-1.md`: **4 of 4 fully fixed, 0 partially fixed, 0 untouched.**
- **Finding 1 (LOW, dismissal marks outlived registry):** fixed in `30ff22b` ("setlist-controller#33 pre-PR review 1 finding 1: the dismissal marks outlived the device registry"). `src/server/messages.ts:86-87` prunes `dismissed` to `shownBy` on every `active()` call, contract comments at `:28-31` and `:35-36` match, `test/messages.test.ts:287-297` pins the rule, and `repro/dismissed-marks-outlive-registry.mts` exits 0 (51 marks held for 52 registry rows).
- **Finding 2 (LOW, rig Clear check matched pre-send snapshot):** fixed in `cbca1db` ("setlist-controller#33 pre-PR review 1 finding 2: the rig check after a Clear matched a snapshot from before the send"). Both `test/messages-hub.test.ts:240` and `:322` now poll `panel.received.at(-1)?.activeMessages` to equal `[]`.
- **Finding 3 (LOW, proxied e2e test title/assertion and README):** fixed in `27cd26a` ("setlist-controller#33 pre-PR review 1 finding 3: the reconnect e2e test claimed a producer page's row it never reads"). `e2e/messages.spec.ts:176`, `:192-193` now check `[phone.client]` from `proxied.rig.devices()`, and `README.md:186` matches what the test proves.
- **Finding 4 (LOW, comment hygiene):** fixed in `bd4dfa6` ("setlist-controller#33 pre-PR review 1 finding 4: comments that no longer match the Dismiss code"). All eight comment sites were checked against HEAD and match the code and block width.

## Approach decisions
Carried forward from `pre-pr-review-1.md` (and its remediation 1), all held by this branch:
- **Drain detection, duplicate suppression, and busy-socket pumping (#16):** `ClientState.inFlight` is the hub's only busy signal; `deliver()` compares the role payload against `lastSent`; frames never set `dirty`.
- **A send, Clear or Dismiss and the position pacing:** `messagesChanged` re-encodes the producer side at the broadcast position and delivers to producer sockets alone, so a position held for the trailing flush to playback sockets stays held.
- **Client ID and dismissed IDs per role:** keyed `setlist-controller.client-id.<role>` and `setlist-controller.dismissed-messages.<role>`, so a device is one browser for one page role.
- **Bounding the dismissal marks:** `active()` prunes each message's `dismissed` Set to its `shownBy` on every call; the hub passes `devices.list()`, and every new mark is followed by an `active()` call in the same handler, while a returning device re-marks itself from its hello.
- **A rig check after an action whose result equals an earlier snapshot:** poll `panel.received.at(-1)?.activeMessages` instead of `panel.snapshot(...)`.
- **Proxied e2e checks of a dismissal:** compare `dismissedBy` with the phone's client ID from `proxied.rig.devices()`, not a count.

## Confirmed Issues
None.

## Needs Further Investigation
- **Carried forward from `pre-pr-review-1.md` (NFI A, explicitly out of scope for this round):** a Dismiss tapped in tab A while tab A's socket is down reaches tab B through `storage`, where tab B calls `keep(next)` and sends nothing on tab B's open socket; if tab A is then closed before it reconnects, the producer row waits until tab B reconnects. Left out of this round per Nick's scope note in `pre-pr-review-1.md:52`.

## Reviewed and Dismissed
- **Dismiss tapped while the WebSocket is `CONNECTING` could race React's passive `useEffect` (`keep`) against `open`** (`web/src/App.tsx:167-174, 571-574` and `web/src/server-connection.ts:94-100, 161-172`): disproved by execution in real Chromium against built `dist/web` and `startProxiedE2eRig`. Even when a `MessageChannel` task that triggers socket #2's `open` event was queued before `btn.click()`, React 19 flushed `keep(next)` before the macrotask ran `open`, so socket #2's hello carried the dismissed ID and `dismissedBy` contained the phone's client ID.
- **Race between `panel.snapshot(...)` and `shownId(keys)` on the second message** (`test/messages-hub.test.ts:316-320`): 300 trials against `startRig` produced 0 stale reads, because `src/server/hub.ts:260-265` queues `keys`'s message frame onto its socket before calling `messagesChanged()` to send `panel`'s snapshot. Recorded only as a minor nit below.
- **Unbounded marks or missed pruning when no producer is connected** (`src/server/hub.ts:224-229, 235` and `src/server/messages.ts:86-87`): every `messages.dismiss(...)` call that returns `true` immediately invokes either `devicesChanged()` (`hub.publish`) or `messagesChanged()`, and both call `activeMessages()` unconditionally even with zero producer sockets connected. Deleting from a `Set` during `for...of` iteration is guaranteed safe by ECMAScript.
- **Hello path breaking `#16` playback coalescing** (`src/server/hub.ts:221-232`): `devices.hello` reads only `{ client, name, battery }` (`src/server/devices.ts:53`), so `listed` is true in the exact base cases; a hello that adds a dismissal without changing any device row takes `else if (dismissed) messagesChanged()`, delivering to producer sockets alone while leaving `broadcasted.playback` and `stopFlush` intact.
- **Scope leak in shared pure modules** (`src/server/messages.ts`, `src/shared/command.ts`, `src/shared/devices.ts`, `src/shared/messages.ts`): differential harness comparing `4b48b4b` and HEAD matched 100% on all non-dismissal scenarios.
- **Dismiss frame before hello** (`src/server/hub.ts:235`): guarded by `state.client !== null` (also enforced statically by TypeScript because `ClientState.client` is `string | null`).
- **Browser storage unavailable (private mode)** (`web/src/App.tsx:162-176`, `web/src/device-settings.ts:350-357`): in-memory `dismissed` state plus `keep(next)` preserves the mark across reconnects within a visit; on reload, `readClientId` creates a new client ID, so the reloaded page is a new device rather than a stale mark.
- **Setup screen sending a Dismiss or rendering `, dismissed`** (`web/src/App.tsx:165, 185`, `web/src/DevicesPanel.tsx:22-28`): `hello` is `null`, `<Setup>` returns before `<Page>`, and `DevicesPanel` receives no `producer` prop.

## Minor / nits
- `test/messages-hub.test.ts:316-319`: waiting for `await expect.poll(() => last(keys)).toBe('Repeat bridge')` before reading `shownId(keys)` (matching line 312 above it) would avoid any theoretical dependence on cross-socket loopback delivery order, though 0/300 trials failed.
- PR #37's body under `Tests` lists "a Dismiss before a hello" and "a message not active on the device" under `test/messages-hub.test.ts`; the inactive-message test lives in `test/messages.test.ts:231`, and Dismiss-before-hello is enforced by `state.client !== null` at `src/server/hub.ts:235` with no dedicated rig test.
- `test/devices.test.ts:41`: builds its expected slice with `ids.slice(-MAX_DISMISSED_MESSAGES)` (the same expression as `parseHello`). Carried forward from review 1; `ids` has `MAX_DISMISSED_MESSAGES + 5` elements and `test/device-settings.test.ts:547` independently asserts `ids.slice(5)`.
- `e2e/messages.spec.ts:162-164`: the reload check does not clear offline rows first, so it checks that reload does not remove the hub's mark rather than proving re-marking from hello (which the reconnect test at `:176` covers).

## Test quality
Tests added: 17 unit and rig tests (`test/messages.test.ts` 9, `test/messages-hub.test.ts` 4, `test/devices-panel.test.ts` 1, `test/devices.test.ts` 1, `test/hub-coalescing.test.ts` 1, `test/server-connection.test.ts` 1) plus 3 Playwright e2e tests (6 runs across `webkit-ipad` and `chromium-android`). Changed in body: 8 (`test/messages-hub.test.ts:240` strengthened to poll the latest snapshot; `test/messages.test.ts:142-144` checks `dismissedBy: []`; 6 existing tests updated only with `dismissedBy: []` or `dismissed: []` fixture fields). Green-at-`$BASE` execution: not run (`git worktree add` is disallowed for non-Claude runs; `pre-pr-review-1.md` ran it at `a614951` and the two tests added/changed since then in `30ff22b` and `cbca1db` directly assert new pruning and Clear-polling behaviour). Static tautology audit across all 20 added tests: 0 blocking tautology shapes found (one minor expression reuse at `test/devices.test.ts:41`, noted above).

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test -- --maxWorkers=2` (117 files, 3613 passed, 5 skipped), `pnpm build`, and `pnpm check:private --range origin/main..HEAD` all pass on `7e6a93f`. `e2e/messages.spec.ts` passes 36/36 in both projects.
- **Commit hygiene:** 9 commits, all authored and committed with the GitHub noreply address; no stray files outside `docs/reviews/setlist-controller-33/`.
- **Likely reviewer asks:** none beyond the settled Rules in #33 and the pre-existing #36 WebKit timeouts already documented in PR #37's body.

## Verdict
Ready to merge as-is. Zero confirmed findings; no gate items remain.
