# Pre-PR review: setlist-controller#11 messages from the producer page to the band's devices

**Branch:** `setlist-controller-11-producer-band-messages` vs `origin/main` (merge-base `c9da372`, "Merge pull request #27 from nick-vogel/setlist-controller-25-durations-follow-ups")
**Reviewed at:** HEAD `86e327a` ("setlist-controller#11 pre-PR review 1: the battery warning in the top layer, recorded"), clean tree (no uncommitted or untracked files at review start), 30 files changed, +1892 / -95 (full `--fresh` second-opinion review across all 12 commits `e67f3fb..86e327a`)
**Reviewed against:** nick-vogel/setlist-controller#11, parent epic #8, and follow-up #28 (read with `gh`), `.claude/rules/public-repository.md`, the global rules in `~/.claude/rules/`, `README.md`, and the Approach decisions and closure record in `docs/reviews/setlist-controller-11/pre-pr-review-1.md`. The repo has no `AGENTS.md` or `CLAUDE.md`, no `CONTEXT.md` and no ADRs.
**Date:** 2026-11-25
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and rig suites | `pnpm vitest run --maxWorkers=2` | 117 files, 3557 passed, 5 skipped |
| Playwright suites (affected & layout-adjacent) | `pnpm exec playwright test e2e/messages.spec.ts e2e/power.spec.ts e2e/stage-status.spec.ts e2e/lights.spec.ts` and `e2e/reconnect.spec.ts e2e/chart-strip.spec.ts e2e/timeline.spec.ts e2e/safe-mode.spec.ts e2e/setup.spec.ts` | 96 passed across `webkit-ipad` and `chromium-android` (50 + 46, 0 failed) |
| Remaining Playwright specs | not run | full `pnpm test:e2e` covers 19 unrelated specs (audio/chart/MIDI/ATEM/ProPresenter); all 9 specs touching messages, power, stage status, top layout, setup, timeline, safe mode, reconnect and lights ran and passed above |
| Private terms | `pnpm check:private --range origin/main..HEAD` | exit 0 |
| Commit authors | `git log --format='%h %an <%ae> \| %cn <%ce>' c9da372..HEAD` | GitHub noreply address only across all 12 commits |
| Em-dashes | `git diff c9da372 -- ':!docs/reviews/' \| grep -n "^+.*$(printf '\342\200\224')"` (U+2014) | none in added production, test or README lines |
| Prior review 1 repros | `node docs/reviews/setlist-controller-11/repro/banner-placement.mts` and `dismiss-across-roles.mts` (against built `dist/web`) | both exit 0 (8/8 placement checks `ok`; `1 banner(s)` after reload) |
| Finding 1 repro | `node docs/reviews/setlist-controller-11/repro/battery-warning-blocks-controls.mts` (Chromium Pixel 7 and WebKit iPad gen 7) | exit 1, 8/8 checks fail (Safe Mode, Setlist/Timeline switcher, producer Safe Mode, and Timeline primary readout covered by `.power-warning` at scroll 0) |
| Viewport matrix check | scratch Playwright script across Pixel 7, iPad portrait, iPad landscape and 1280x800 laptop | confirmed centre-blocked on all 4 viewports while on battery at 80% |
| Finding 2 proof | `node -e` against `inPageTop` with `message-banner` and `power-warning` placed outside `<div class="page-top">` | returned `["stage-status","message-banner","power-warning"]` (false pass) |
| Timeline stacking context | inspected `web/src/styles.css:1670-1998` | `.timeline-viewport` sets `isolation: isolate`, trapping internal `z-index: 4..7` under `.page-top` (`z-index: 3`) |
| Tautology audit (base checkout execution) | not run in a base worktree | non-Claude second-opinion run forbids `git worktree add`; verified by static inspection that every new test file and added test block imports symbols or harness fields absent at `c9da372` (`src/shared/messages.ts`, `Client.messages`, `readDismissedMessages`, `watchDismissedMessages`, `MESSAGE_PRESETS`), and audited every test body for weak assertions (Finding 2) |

**Overall:** The server message board, hub queue and pacing invariants, producer-only gate, per-role dismissal and cross-tab sync, and the dismissible message banner itself are all solid, and all five findings from `pre-pr-review-1.md` are closed. The one substantive defect was introduced by the follow-up commit `c100019` that moved the playback Mac's battery warning into the fixed `.page-top` layer: unlike the message banner (dismissible) and the Reconnecting banner (only shown while controls are disabled), the battery warning has no Dismiss button and stays visible while connected and playing, permanently covering Safe Mode, the leader's Setlist/Timeline switcher, and the Timeline's primary now-playing line at scroll 0 on every viewport. Decide and fix Finding 1, and fold Findings 2 and 3 into the same round, before merging.

## Prior-review closure (`pre-pr-review-1.md`)
All 5 Confirmed findings from `pre-pr-review-1.md` are closed:
- **Finding 1 (MEDIUM, banner pushes controls down):** fixed in `80b42b0` ("findings 1 and 2: the banner moved every page's controls and covered the connection signal"). Verified by `banner-placement.mts` (`Count in` stays at `y = 546` in Chromium and `y = 381` in WebKit). Follow-up commit `c100019` subsequently introduced Finding 1 below when moving `.power-warning` into `.page-top`.
- **Finding 2 (MEDIUM, banner covers Reconnecting and stage status line):** fixed in `80b42b0` and `3757eed` ("findings 1 and 2 rework: the e2e test's name says what it checks"). Verified by `banner-placement.mts` (all 6 coverage checks `ok`).
- **Finding 3 (LOW, dismissed IDs per browser and no cross-tab sync):** fixed in `b05aae6` ("finding 3: a Dismiss hid the message on another device in the same browser, and missed the page's other tab"). Verified by `dismiss-across-roles.mts` (exit 0) and `e2e/messages.spec.ts:203-227`. The deferred low-attainability storage-event edge case recorded in `pre-pr-review-1.md:260` remains deferred.
- **Finding 4 (LOW, newest-message rule missing tests for M1/M11):** fixed in `016e27b` ("finding 4: the board's newest-message rule had no test that could fail"). Verified in `test/messages.test.ts:85-97` and `test/messages-hub.test.ts:141-162`.
- **Finding 5 (LOW, comment hygiene, 5 entries):** fixed in `b4e1a56` ("finding 5: comment hygiene"). All 5 entries verified updated in place.

## Approach decisions
Carried forward from `pre-pr-review-1.md`:
- **Drain detection, duplicate suppression, and busy-socket pumping:** `ClientState.inFlight` is the hub's only busy signal; `deliver()` compares the role payload against `lastSent`; frames never set `dirty`.
- **Message frame on a replaced wake socket:** message frames are read on the current socket only; reload frames are read on either.
- **Client ID and dismissed IDs per role:** keyed by role (`setlist-controller.client-id.<role>` and `setlist-controller.dismissed-messages.<role>`), with `storage` listeners mirroring `watchDeviceName`.
- **One fixed top layer (`.page-top`):** `position: fixed; inset: 0 0 auto; z-index: 3; display: flex; flex-direction: column;` holding connection signal first, message banner second, battery warning third. `main.leader-page` reserves `padding-top: 2.25rem` for the stage status line alone.

Added in this review (pending Nick's pick on Finding 1):
- **Reaching top-of-page controls while the battery warning shows (Finding 1):** Option A keeps `.power-warning` in `.page-top` with zero layout shift and adds a Dismiss button scoped to the current warning tier (`low` vs `urgent`), so escalating from amber (`<= 80%`) to red (`<= 30%`) or returning to mains power and unplugging again re-shows it. Option B keeps `.power-warning` non-dismissible and reserves its height in `<main>` (or returns it to flow), overturning `c100019`'s zero-shift rule for `.power-warning`.

## Confirmed Issues

### 1. The battery warning in `.page-top` has no Dismiss button and permanently covers Safe Mode, the Setlist/Timeline switcher, and the Timeline readout while on battery at 80% or less: MEDIUM
- **Location:** `web/src/styles.css:21-28`, `:42-48`; `web/src/App.tsx:319-326`, `:336-340`, `:396-409`, `:418-423`; `web/src/PowerWarning.tsx:7-15`; `web/src/Setup.tsx:24-29`.
- **Attribution:** introduced by `c100019` ("setlist-controller#11 the battery warning joins the top layer under the producer's message"). `git show c9da372:web/src/styles.css | sed -n '21,28p'` shows `.power-warning` was an in-flow block with `margin: 0 0 1rem` at base, and `git log --oneline -S'powerShown && <PowerWarning' c9da372..HEAD` returns `c100019`.
- **Real-world trigger:** During a rehearsal or service, the playback Mac's power cord comes loose and its battery reaches 80% or less. While the server stays connected and Live is playing, the leader (on iPad or phone) or producer (on phone or iPad) tries to turn Safe Mode off to jump to another song mid-set, or the leader tries to switch between Setlist and Timeline or read the Timeline's primary now-playing line (song, section, bar). Unlike the producer's message banner (which has Dismiss) and the Reconnecting banner (which shows only while disconnected, when controls are already disabled), `.power-warning` has no Dismiss button and the covered controls sit at `scrollY = 0` where scrolling down only pushes them further behind `.page-top`. They remain blocked until the Mac is plugged back into mains power.

**Evidence**
```tsx
// web/src/PowerWarning.tsx:7-15
export function PowerWarning({ power }: { power: PowerState }) {
  const warning = powerWarning(power);
  if (warning === null) return null;
  return (
    <p className={`power-warning ${warning}`} role="alert">
      {powerWarningText(power)}
    </p>
  );
}
```
```tsx
// web/src/App.tsx:319-326
  const pageTop = (stageStatusLine || reconnecting || message || powerShown) && (
    <div className="page-top">
      {reconnecting}
      {stageStatusLine}
      {messageBanner}
      {powerShown && <PowerWarning power={snapshot.power} />}
    </div>
  );
```

**Failure mode** - `node docs/reviews/setlist-controller-11/repro/battery-warning-blocks-controls.mts` (after `pnpm build`) exits 1 with all 8 checks failing:
```
FAIL chromium leader Safe Mode: y=54..106, pageTopBottom=106, exposed=0px, centreHit=power-warning low
FAIL chromium leader Setlist/Timeline switcher: y=52..108, pageTopBottom=106, exposed=2px, centreHit=power-warning low
FAIL chromium producer Safe Mode: y=16..68, pageTopBottom=70, exposed=0px, centreHit=power-warning low
FAIL chromium leader Timeline primary readout: y=64..92, pageTopBottom=106, exposed=0px, centreHit=power-warning low
FAIL webkit leader Safe Mode: y=54..106, pageTopBottom=83, exposed=23px, centreHit=power-warning low
FAIL webkit leader Setlist/Timeline switcher: y=52..108, pageTopBottom=83, exposed=25px, centreHit=power-warning low
FAIL webkit producer Safe Mode: y=16..68, pageTopBottom=47, exposed=21px, centreHit=power-warning low
FAIL webkit leader Timeline primary readout: y=64..92, pageTopBottom=83, exposed=9px, centreHit=power-warning low
```
In addition, `locator('.safe-mode-toggle').click({ timeout: 1500 })` times out in both Chromium (Pixel 7) and WebKit (iPad gen 7) on both the leader and producer pages because `.power-warning` intercepts the click. On a 1280x800 laptop viewport and iPad landscape, the same controls are also centre-blocked (`exposed=21..25px`), and on `/setup` `<h1>Setup</h1>` is covered (`exposed=0px` on Pixel 7, `2px` on iPad/laptop).

**Recommended fix** - Nick picks one:
- **Option A (recommended, preserves Nick's `.page-top` order and zero layout shift):** Give `PowerWarning` a Dismiss button mirroring `MessageBanner`, scoped in page memory to the current warning tier (`'low' | 'urgent'`). When the user taps Dismiss on amber (`low`), the warning hides so Safe Mode, the Setlist/Timeline switcher, the Timeline readout, and Setup's top content are immediately reachable; if the Mac drops to red (`urgent`, `<= 30%` or unknown charge), or returns to mains power / `> 80%` and later drops to battery again, the warning shows again. The Playback Mac pre-service check row on Connections and Setup continues to report the battery problem regardless.
  - `PowerWarning` accepts optional `onDismiss?: () => void` (or always renders a `<div className="power-warning ${warning}" role="alert">` with `<p className="power-warning-text">` and a `.power-warning-dismiss` button when `onDismiss` is given, styled `#fff` on `#111` with `min-height: 3rem`, matching `.message-banner-dismiss`).
  - `App` (and `Setup`) track `dismissedPower: PowerWarningLevel | null` in state, reset it to `null` whenever `powerWarning(snapshot.power)` changes (e.g. `low -> urgent` or `low -> null`), and compute `powerShown = role !== 'viewer' && warning !== null && warning !== dismissedPower` (and equivalently in `Setup`).
  - Note: this intentionally allows dismissing one warning tier on that tab while keeping escalation (`low -> urgent`), automatic clearing on mains power, and the Playback Mac Connections check intact.
- **Option B (keep `.power-warning` non-dismissible as #10 wrote it):** Keep `.power-warning` without a Dismiss button and either add top spacing above in-flow content while `powerShown` is true or move `.power-warning` back into page flow below `.page-top`. Note that this overturns `c100019`'s Approach decision ("nothing under the layer moves when it comes or goes") and requires updating `e2e/messages.spec.ts:229-272` where `Count in` and `.live-status` assert zero movement when battery crosses 80% or 30%.

**Remediation brief**
- **Design intent:** Every top-of-page overlay in `.page-top` must leave all live stage controls reachable. The Reconnecting banner only appears while controls are disabled, and the message banner has Dismiss. The battery warning appears while the page is connected and playing, so if it overlays `y = 0` without shifting `<main>`, the leader and producer must be able to dismiss the current tier to reach Safe Mode, the Setlist/Timeline switcher, and the Timeline readout, while still being alerted on escalation from `low` to `urgent` or on a fresh battery episode.
- **Full surface:** `web/src/PowerWarning.tsx:7-15`; `web/src/App.tsx:161-178`, `:307-326`; `web/src/Setup.tsx:18-30`; `web/src/styles.css:18-36` (`.power-warning` flex layout and dismiss button contrast); `test/power.test.ts:211-229` (update banner regex if markup moves from `<p>` to `<div>` and add tier-dismiss / escalation / reset tests); `test/messages-page.test.ts:47-48`, `:133-141` (update selector match if `.power-warning` becomes a `<div>`); `e2e/messages.spec.ts:229-272` (add check that after dismissing the battery warning, Safe Mode and Timeline switcher are clickable, and dropping to 30% brings the urgent warning back); `e2e/power.spec.ts:15-48`; `README.md:45`.
- **Must preserve:** `.page-top` ordering (`connection signal`, `message-banner`, `power-warning`); amber (`#f0b429`) at `<= 80%` and red (`#ff6369`) at `<= 30%` or unknown charge with `#111` text (AA contrast >= 4.5:1); hidden on AC, `> 80%`, unknown power, and view-only pages; `e2e/power.spec.ts` (all 5 tests); `e2e/messages.spec.ts` (all 11 tests, including `Count in` not shifting when Option A is chosen); `test/power.test.ts`; `test/messages-page.test.ts`.
- **Do not touch:** the hub, the message board, `ProducerMessages`, `MessageBanner`, and `.stage-status.sticky` height/reservation (`main.leader-page { padding-top: 2.25rem }`) (all Reviewed and Dismissed).
- **Proof:** `pnpm build && node docs/reviews/setlist-controller-11/repro/battery-warning-blocks-controls.mts` exits 1 now. Under Option A, update the repro or run a new e2e check that tapping Dismiss on `.power-warning` makes all 8 checks pass and dropping to 30% restores the urgent banner; under Option B, the repro as written exits 0 without dismissing. Then run `pnpm vitest run --maxWorkers=2 test/power.test.ts test/messages-page.test.ts test/stage-status.test.ts` and `pnpm test:e2e`.

### 2. `inPageTop` in `test/messages-page.test.ts` scans the entire rendered page instead of `<div class="page-top">`, so moving banners out of the top layer still passes: LOW
- **Location:** `test/messages-page.test.ts:47-48`, `:55-70`, `:128-135`.
- **Attribution:** introduced (`80b42b0` added `inPageTop`; `c100019` added `power-warning` to its pattern). `git log --oneline -S'const inPageTop' c9da372..HEAD` returns `80b42b0`.
- **Real-world trigger:** A later edit moves `<PowerWarning />` or `<MessageBanner />` back outside `<div class="page-top">` in `web/src/App.tsx` on the leader page or on a disconnected page. Because `<div class="page-top">` still renders for `<StageStatusLine />` or `<Reconnecting />`, `markup.includes('<div class="page-top">')` stays true and `matchAll` still matches every banner anywhere in the document in the same order, so lines 66, 131, 133, and 134 stay green (`tests-can-go-red`). In addition, the test name at line 55 claims ordering ("ahead of the battery warning and the pickers and after the stage status line") while lines 65-67 only check `firstInMain` is `<div class="page-top">` and `inPageTop` contains `'message-banner'` (`tests-state-a-rule`).

**Evidence**
```ts
// test/messages-page.test.ts:47-48
const inPageTop = (markup: string) =>
  markup.includes('<div class="page-top">') ? [...markup.matchAll(/<(?:p|section|div) class="(server-lost|stage-status|message-banner|power-warning)[ "]/g)].map(([, name]) => name) : [];
```

**Failure mode** - executed in Node against markup where `message-banner` and `power-warning` sit outside `<div class="page-top">`:
```
inPageTop('<main><div class="page-top"><section class="stage-status sticky"></section></div><div class="message-banner"></div><p class="power-warning urgent"></p></main>')
// => ["stage-status","message-banner","power-warning"]
```
With a balanced `.page-top` slice, the same input returns `["stage-status"]`, turning lines 66, 131, 133, and 134 red if any banner escapes `.page-top`.

**Recommended fix**
```diff
-const inPageTop = (markup: string) =>
-  markup.includes('<div class="page-top">') ? [...markup.matchAll(/<(?:p|section|div) class="(server-lost|stage-status|message-banner|power-warning)[ "]/g)].map(([, name]) => name) : [];
+const pageTopMarkup = (markup: string) => {
+  const start = markup.indexOf('<div class="page-top">');
+  if (start === -1) return '';
+  let depth = 0;
+  for (const tag of markup.slice(start).matchAll(/<\/?div\b[^>]*>/g)) {
+    depth += tag[0].startsWith('</') ? -1 : 1;
+    if (depth === 0) return markup.slice(start, start + tag.index + tag[0].length);
+  }
+  return '';
+};
+const inPageTop = (markup: string) =>
+  [...pageTopMarkup(markup).matchAll(/<(?:p|section|div) class="(server-lost|stage-status|message-banner|power-warning)[ "]/g)].map(([, name]) => name);
```
Rename line 55 from `'opens every page it reaches in the top layer, ahead of the battery warning and the pickers and after the stage status line, and is gone with no message'` to `'opens every page it reaches in the top layer, and is gone with no message'` (since line 128 tests the layer's internal order).

**Remediation brief**
- **Design intent:** `inPageTop` must inspect only the elements inside `<div class="page-top">...</div>`, respecting nested `<div>` elements such as `<div class="message-banner">`, so that moving any banner out of `.page-top` makes the unit suite fail immediately.
- **Full surface:** `test/messages-page.test.ts:47-48`, `:55`. No production code changes.
- **Must preserve:** all 7 tests in `test/messages-page.test.ts`.
- **Do not touch:** `web/src/App.tsx` (tested here, not broken for message banner placement).
- **Proof:** Temporarily move `{messageBanner}` after `{pageTop}` on one branch of `web/src/App.tsx` in a scratch check and verify `pnpm vitest run --maxWorkers=2 test/messages-page.test.ts` fails on the affected variant; restore and verify all 7 tests pass.

### 3. Comment hygiene: LOW (aggregated)
- `web/src/ProducerMessages.tsx:10` - `Every control is disabled while the page is not connected, as the panel's are.` -> `Every button is disabled while the page is not connected, as the panel's are.` (the text box, radios, and checkboxes stay enabled while disconnected; mirrors `web/src/DevicesPanel.tsx:9` and `web/src/ConnectionsPanel.tsx:20`).
- `web/src/App.tsx:302-303` - `under the Devices panel on the producer page` -> `under the Message the band panel on the producer page` (`web/src/App.tsx:299` added `<ProducerMessages />` between `<DevicesPanel />` and `nameField`).

## Needs Further Investigation
None. Every candidate surfaced in this run was verified by code trace or execution.

## Reviewed and Dismissed
- **Nick-approved #11 behaviours:** View-only target reaching view-only sockets only and labelled "View-only devices", All devices including producer pages (until follow-up #28), late joiners receiving All/View-only messages, hub-made UUIDs with no client-supplied ID, Clear clearing every device, 120-char trim/cut, in-memory storage, reading message frames from the current socket only, one-tap quick presets with the four approved texts, and `.page-top` ordering (connection signal, message banner, battery warning). All match implementation and tests.
- **Timeline `z-index: 4..7` vs `.page-top` (`z-index: 3`):** `.timeline-viewport` sets `isolation: isolate` (`web/src/styles.css:1672`), creating its own stacking context at auto z-index so `.page-top` stays above the playhead, follow button, loop brace, and end markers. Verified by CSS inspection and `e2e/stage-status.spec.ts` / `e2e/timeline.spec.ts`.
- **#16 and #9 hub pacing and replace-by-kind queue:** `ClientState.inFlight` remains the only busy signal; `queue()` filters out only waiting message frames, leaves `RELOAD` ahead, and never sets `dirty` (`src/server/hub.ts:132-159`). Verified by `test/hub-coalescing.test.ts`.
- **Producer-only command gate:** `message` and `clear-messages` are parsed only after `if (!controls(role)) return;` and `if (role !== 'producer') return;` (`src/server/hub.ts:211-233`), and verified by `test/messages-hub.test.ts:86-100`.
- **`clear-messages` returning `false` on empty board:** `src/server/hub.ts:231` skips broadcasting when `messages.clear()` is `false`. No connected client can hold a stale message when the board is empty because every hello (including after server restart) receives `messageFrame(null)`.
- **Deferred review-1 low-attainability regressions (`pre-pr-review-1.md:259-261`):** `storage` event overwriting an in-memory-only dismissal (requires `setItem` to throw in one tab while another tab of the same role writes or clears storage) and top safe-area inset at scroll 0 (pages open in browser tabs with no web app manifest, where top inset is 0 in portrait). Neither was broadened by subsequent commits.
- **`test/messages-hub.test.ts` `settled()` ping flush:** every test in the file starts the stage idle (`playing: false`), so sockets have no in-flight snapshot stream when `settled()` flushes.
- **`e2e/lights.spec.ts` update:** measuring against the Devices region instead of `section.song` preserves the test's rule after adding the Message the band panel.

## Minor / nits
- `web/src/styles.css:70-75` - `.message-banner-text` has no `min-width: 0` or `overflow-wrap: anywhere`; an unbroken 120-character string with no spaces overflows past the right edge of a 412px phone viewport (`textRight: 3305`), though `.message-banner` wraps Dismiss onto the next row so Dismiss stays clickable (`btnLeft: 16, btnRight: 122`) and `documentElement.scrollWidth` stays `412`.
- `src/shared/messages.ts:64` - `message === undefined` is unreachable after `typeof message !== 'object'`.
- `web/src/server-connection.ts:107-112` and `test/harness.ts:234-239` - a malformed message frame (`readMessageFrame` returning `undefined`) falls through to `JSON.parse` as a snapshot; only our hub builds frames via `messageFrame`, so there is no trigger.
- `src/shared/messages.ts:27` - `.slice(0, MAX_MESSAGE_TEXT)` can split an emoji surrogate pair at 120 code units, mirroring `src/shared/devices.ts:52`.
- `web/src/ProducerMessages.tsx:44` - double-tapping a quick preset sends two messages with two IDs.
- `web/src/ProducerMessages.tsx:24-26` - a ticked device removed by Clear offline comes back ticked if it reconnects in the same producer session.
- `web/src/ProducerMessages.tsx:118-121` - default names repeat the role (`Leader, Leader`, `View only, View only (a1b2)`), and `"No other device has connected yet."` also shows after Clear offline.
- `test/harness.ts:85` - `messages` is mutable beside `readonly` neighbours.

## Test quality
Tests added across the branch: 45 unit/rig tests (`test/messages.test.ts` 12, `test/messages-hub.test.ts` 10, `test/messages-page.test.ts` 7, `test/device-settings.test.ts` 7, `test/hub-coalescing.test.ts` 2, `test/server-connection.test.ts` 2, plus 5 modified assertions across `test/pages.test.ts`, `test/stage-status.test.ts`, `test/devices-panel.test.ts`) and 11 Playwright e2e tests (`e2e/messages.spec.ts`). Base-checkout execution: not run (non-Claude run forbids `git worktree add`); by static inspection every new test file and added test block imports symbols or harness fields absent at `c9da372`. Weak-assertion / tautology shapes found: 1 confirmed (Finding 2: `inPageTop` in `test/messages-page.test.ts:47-48` scans the whole document instead of `.page-top`, and line 55's title claims ordering it does not assert), plus 1 mild accepted shape carried from review 1 (`test/messages-page.test.ts:85` compares presets against `MESSAGE_PRESETS`, where the real rule tested is that presets precede the text box).

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm vitest run --maxWorkers=2` (3557 passed, 5 skipped), `pnpm check:private --range origin/main..HEAD`, and 96 Playwright tests across the 9 affected specs all pass at `86e327a`. Rerun `pnpm test:e2e` after fixing Finding 1.
- **Commit hygiene:** all 12 commits use a GitHub noreply author/committer address and pass `pnpm check:private`. Commit this review doc and `docs/reviews/setlist-controller-11/repro/battery-warning-blocks-controls.mts` with the subject `setlist-controller#11 pre-PR review 2`.
- **Likely reviewer asks:** how Nick wants Finding 1 resolved (Option A dismissible battery warning tier vs Option B non-dismissible with flow/padding), and tracking follow-up #28 for showing the active message on the producer page.

## Verdict
**Not ready to merge as-is.** Zero CRITICALs and zero HIGHs. Gate: fix Finding 1 (MEDIUM, battery warning in `.page-top` permanently blocking Safe Mode, the Setlist/Timeline switcher, and the Timeline primary readout while on battery at 80% or less, after Nick picks Option A or Option B), and fold Findings 2 and 3 (both LOW) into the same remediation round. Everything in the server board, hub queue/pacing, producer-only gate, dismissal/sync, and message banner itself is verified and ready.
