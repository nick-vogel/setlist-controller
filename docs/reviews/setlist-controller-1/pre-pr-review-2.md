# Pre-PR review: setlist-controller#1 Browser setlist controller runs a 3-song rehearsal from an iPad

**Branch:** `setlist-controller-1-ipad-rehearsal` vs `origin/main` (merge-base `cabf12c` "setlist-controller#1 add a README")
**Reviewed at:** HEAD `cadb14b` (setlist-controller#1 pre-PR review 1 remediation closure table), clean tree, 0 uncommitted, 0 untracked; 91 files total, +11932 / -0 against the merge-base
**Delta under review:** since `a2ee7b8` (setlist-controller#9 Foot pedal: MIDI input, config file, MIDI monitor), the HEAD that `pre-pr-review-1.md` reviewed. The delta is the round 1 remediation, `d667eb4` to `d6797a3` plus the closure table `cadb14b`: 42 files, +1438 / -136, of which 39 files and +749 / -136 are code, tests and docs (the rest is review 1's doc and repros).
**Reviewed against:** the epic body of setlist-controller#1 (the spec), `pre-pr-review-1.md` (its 14 findings, Approach decisions, closure table, Known regressions deferred and Open half-fixes), the run's stage 2 assumptions (the Reconnecting copy and placement). No `CODING_STANDARDS.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs exist in the repo, so conformance is judged against the spec and the five universal review rules.
**Date:** 2026-10-13
**Reviewer:** 3 code-review agents + 1 test-audit agent + verify pass. Delta-scoped re-review, round 2.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | ok |
| Lint | `pnpm lint` | pass (also with this doc's two new `repro/` files present) |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 18 files, 193 passed, 2 skipped (both `it.runIf(linux)` in `test/setup-screen.test.ts`) |
| Build | `pnpm build` | pass |
| Playwright suite | `pnpm test:e2e` | not run: not a full check per the repo entry, and no finding needed it |
| Findings 1 and 2 (controller) | `repro/review-2-controller.test.ts`, the real `startPlaybackController` driven directly, run from a scratch vitest root | 3 of 3 red at HEAD |
| Finding 3 (server connection) | `repro/review-2-connection.test.ts`, the real `connectToServer` with a fake WebSocket and fake timers | 3 red (wake with a hung try, both variants, and status before the first snapshot), 2 controls green |
| Recommended fixes 1, 2, 3, 4 | applied together in a scratch worktree at HEAD, both repros copied into `test/` | `pnpm lint`, `pnpm typecheck`, `pnpm build` pass; `pnpm test` 20 files, 201 passed, 2 skipped (all 8 repro cases green) |
| Finding 5 (contract Ctrl-C) | `node src/contract/main.ts run --target fake --out <scratch>/rep` twice, the second with SIGINT at 4 s | complete 2974-byte report replaced by a 2338-byte one with `aborted="Interrupted before the run finished."` |
| Contract SIGINT paths | the same harness, SIGINT at 200 ms (setup phase) and a second SIGINT | exit 130 in 206 ms; a second Ctrl-C kills the process (Node restores the default once the `once` listener is gone) |
| Stop disabled mid-hold (prior N3) | Playwright 1.62.1 probe, Chromium and desktop WebKit, mouse and CDP touch; react-dom 19.3.0 `getListener` read | not reproduced in either engine (see Needs Further Investigation A) |
| Test tautology audit | HEAD versions of the 14 changed Vitest files run at the `a2ee7b8` oracle in a scratch worktree, plus mutations at HEAD | 31 new or changed cases: 25 red, 5 green (all accepted), 1 Linux-only; one missing barrier confirmed by mutation (finding 6) |
| Real Live, launchd, CoreMIDI, iOS Safari | not run | guardrails forbid opening Live and loading launch agents; no pedal and no iPad in the review |

**Overall:** The remediation holds for 11 of the 14 round 1 findings, including both gates: the listeners now register on AbletonOSC's per-property address, and Next to End stops Live. Three MEDIUM defects remain, all of them the open items the round 1 tripwire left behind: a second `stop_playing` when Next is pressed in the last bar before End, Loop after Next to End bracing the section being left, and a page that reads "connected" after a wake whose fresh connection never gets through. Each has a small diff, verified in scratch with the whole suite green. Fix those three before the PR opens and take the four LOWs in the same pass.

## Approach decisions
- **Listener registration (finding 1, round 1):** register each listener on `/live/song/start_listen/<property>` with no arguments, in `src/shared/abletonosc.ts`; the fake Live accepts only that form. Holds.
- **Stopped jump onto the playhead (finding 3, round 1):** a stopped jump whose target starts where the playhead already is does not wait; `jumpTo` takes the section (`{ cue, time }`). Holds.
- **Next to End (finding 2, round 1):** remember the End jump the controller sent while playing (`endJump`, a song number), and apply that song's toggle when the playhead lands within a bar after End. The hand-relocation exclusion in `reachedEnd` stays untouched.
- **Both auto-stop triggers (round 1 rework, adopted here as finding 1):** evaluate `reachedEnd` and `landedOnEnd` into separate constants before the `||`, so the End jump is always consumed and one stop goes out.
- **Loop while a jump waits (finding 5, round 1):** brace the waiting jump's target, not the section being left.
- **End jump and Loop (round 1 rework, adopted here as finding 2):** a pending End jump (`endJump !== null`) means Loop has nothing to brace, the same as no section playing. Loop off still works while it is pending.
- **Loop availability on the leader page (new, finding 4):** the page enables Loop on the same section the server would brace, `jump ?? now`, so the button and the server never disagree.
- **Client socket errors (finding 4, round 1):** one `error` listener per client socket that logs. Holds.
- **Leader controls availability (findings 6, 12 and 13, round 1):** one availability flag per control, from the server connection and Live's connection, and the existing `unavailable` class. Holds.
- **Server connection status (finding 6, round 1; overturned here by finding 3):** round 1 reported `onStatus(true)` on the current socket's `open`. Now: the page is connected from the current socket's **first snapshot**, and it reports disconnected also when a wake's fresh try times out while the replaced socket is still held, and when that replaced socket closes while the current one is not open.
- **Setup screen Refresh (finding 8, round 1):** a laptop-only HTTP POST beside `/api/setup`, guarded by `remoteAddress === localAddress`. Holds; no Origin check (see Reviewed and Dismissed).
- **Contract check interrupted report (new, finding 5):** an interrupted run writes its partial report beside `--out`, at `<out>.interrupted.json` and `<out>.interrupted.md`, and never over `<out>.json` and `<out>.md`. Reversible: the alternative is to write nothing when interrupted.

## Prior-review closure
Delta under review: `pre-pr-review-1.md`, 14 findings.

| Prior finding | Status | Note |
| --- | --- | --- |
| 1 (CRITICAL) listener address | fixed | `abletonosc.ts` sends the per-property address; the fake Live accepts only it (`Object.hasOwn`); `test/setlist.test.ts` and `test/live-connection.test.ts` pin the full addresses |
| 2 (HIGH) Next to End stops | fixed, with a known regression, deferred | the intent holds for both toggles; its duplicate stop is this round's finding 1 (known regression, deferred, from the prior doc's list) |
| 3 (MEDIUM) stopped jump onto the playhead | fixed | two `test/jump.test.ts` cases red at `a2ee7b8` |
| 4 (MEDIUM) malformed frame crash | fixed | `hub.ts:24`; `test/server.test.ts` red at `a2ee7b8` |
| 5 (MEDIUM) Loop while a jump waits | **partially fixed** | holds for a waiting jump; the Next-to-End half is open, finding 2 |
| 6 (MEDIUM) server connection status | **partially fixed** | banner and disabled controls hold; the wake path and status-before-snapshot are open, finding 3 |
| 7 (MEDIUM) launch agent node path | fixed | `command -v node` gives `/opt/homebrew/bin/node` here; the fnm case is Needs Further Investigation C |
| 8 (MEDIUM) setup Refresh | fixed | its "answers only a POST" test has a missing barrier, finding 6 |
| 9 (MEDIUM) pedal tests barrier | fixed | mutation: the a2ee7b8 test stays green, the HEAD test goes red, 3 of 3 |
| 10 (LOW) contract clean-up | fixed | the interrupted run's report now overwrites a good one, finding 5 (known regression, deferred) |
| 11 (LOW) waiting mark on a looped section | fixed | |
| 12 (LOW) no Next End on a song with no End | fixed | Loop's availability with a waiting jump is finding 4, a different state |
| 13 (LOW) Stop and Play from start while Live is down | fixed | the mid-hold concern is Needs Further Investigation A |
| 14 (LOW) parser warnings | fixed | false negatives only on sets that already warn `missing-end` (Minor) |

Fully fixed: 12 (1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14; findings 2 and 10 each with a known regression, deferred). Partially fixed: 2 (5: the Next-to-End half; 6: the wake half and status-before-snapshot). Untouched: 0. Resolved only by a comment or doc edit: 0.

## Confirmed Issues
### 1. Next pressed in the last bar before End sends `stop_playing` twice — MEDIUM
- **Location:** `src/server/playback-controller.ts:198`
- **Attribution:** introduced by `f33b29b` (setlist-controller#1 pre-PR review 1 finding 2: Stop Live at End when Next jumps there from more than a bar before End). **Known regression, deferred:** the prior doc's Known regressions list reads "Duplicate `stop_playing` when both auto-stop triggers fire on one report (MEDIUM). Introduced by `f33b29b` … Not fixed because the tripwire fired."
- **Real-world trigger:** the leader presses Next on a song's last section during its last bar, the commonest moment to press it, on a song set to "Stop at end". Playback reaches End on its own, `reachedEnd` stops Live, and the next position report before Live reports `is_playing false` stops it again.

**Evidence**
```ts
case 'position':
  if (reachedEnd(position, event.beats) || landedOnEnd(event.beats)) stopPlaying();
```
`||` skips `landedOnEnd` when `reachedEnd` is true, so `endJump` is never consumed, and `landedOnEnd` fires on the next report inside `[End, End + bar)`.

**Failure mode** — Playing at 61 in a song whose End is 64, Next, then reports 62, 63, 64, 64.5 give `['jump 3', 'stop', 'stop']`. With End off the bar grid (End 62, Next at 59, reports 61, 62, 63) it takes only one ordinary report after End. Executed: `repro/review-2-controller.test.ts`, both "one stop" cases red. A second Stop reaching a stopped Live may return the playhead to the start marker, as a second press of Stop does (Live behaviour, unverified), so the page would show song 1's Intro between songs.

**Recommended fix**
```diff
-        case 'position':
-          if (reachedEnd(position, event.beats) || landedOnEnd(event.beats)) stopPlaying();
+        case 'position': {
+          const reached = reachedEnd(position, event.beats);
+          const landedEnd = landedOnEnd(event.beats);
+          if (reached || landedEnd) stopPlaying();
           if (landed(position, event.beats)) waitingJump = null;
           position = event.beats;
           break;
+        }
```

**Remediation brief**
- **Design intent:** the controller sends `stop_playing` exactly once per arrival at a "Stop at end" song's End. Two triggers exist: `reachedEnd` (playback carried the playhead there, less than a bar per report, never a hand move and never with a waiting jump) and `landedOnEnd` (the End jump the controller sent with Next landed within a bar after End). `landedOnEnd` consumes `endJump` whenever the playhead is in the End window, so it must run on every position report.
- **Full surface:** `src/server/playback-controller.ts:197-201` (the `position` case). `landedOnEnd` (`:142-150`) and `reachedEnd` (`:157-166`) do not change. New seam 1 test in `test/section-navigation.test.ts`, beside "stops Live at End when pressed more than a bar before End".
- **Must preserve:** `reachedEnd`'s rules unchanged (forward moves under a bar only, no waiting jump, the hand-relocation exclusion from `1fbc33f`); `landedOnEnd` consuming `endJump` and honouring the toggle at landing time; "plays on at End when pressed more than a bar before End on a song set to Continue" and the other `test/section-navigation.test.ts`, `test/transport.test.ts` auto-stop cases; `waitingJump` clearing via `landed` after the stop check, in that order.
- **Do not touch:** `reachedEnd` refusing hand moves and waiting jumps (Reviewed and Dismissed in review 1).
- **Proof:** copy `docs/reviews/setlist-controller-1/repro/review-2-controller.test.ts` into `test/`, then `pnpm exec vitest run test/review-2-controller.test.ts -t "one stop"`: 2 red now, green after (delete the copy afterwards). The regression test goes at seam 1: Next pressed inside the last bar before End on a "Stop at end" song, advance the fake Live past End with at least two reports before it stops (or hold its stop), and assert `rig.received(STOP)` has length 1.

### 2. Loop pressed after Next on a song's last section braces the section being left — MEDIUM
- **Location:** `src/server/playback-controller.ts:274`
- **Attribution:** on the branch, introduced (the base holds only a README). Against `a2ee7b8`, pre-existing and left open by `90969a8` (setlist-controller#1 pre-PR review 1 finding 5: Brace the waiting jump's target when Loop is pressed before the downbeat), which covered a `waitingJump` but not the End jump, which sets only `endJump`. This is the prior doc's "Open from this round (half-fixes)" item for finding 5.
- **Real-world trigger:** the leader ends a song early with Next, then presses Loop (or the pedal's switch 1) before the downbeat, for example to hold the room. MEDIUM, capped: upgrade to HIGH if the hardware check (#13) shows Live wraps a cue jump that lands on the loop's end back to the loop start, so the song vamps instead of ending.

**Evidence**
```ts
// With no section playing, or a section with no known end, there is nothing to brace.
const current = waitingJump ?? now(position);
const section = current && sectionAt(set, current);
if (!section || section.end === null) return;
loopOn(section.time, section.end - section.time);
```

**Failure mode** — Playing at 53 in the Bridge (48 to End 64), Next, then Loop gives `['jump 3', 'loopOn 48 16']`: Live's loop is set on the Bridge while the End jump is on its way, against the spec rule that a loop never carries to a different section, and every page shows the Bridge looped. Executed: `repro/review-2-controller.test.ts`, "Next on the last section while playing, then Loop", red.

**Recommended fix**
```diff
         case 'loop': {
           if (liveLoop.on) {
             loopOff();
             return;
           }
+          if (endJump !== null) return;
           // With no section playing, or a section with no known end, there is nothing to brace.
           const current = waitingJump ?? now(position);
```

**Remediation brief**
- **Design intent:** Loop braces the section the playhead will be in when the brace takes effect: the waiting jump's target if one waits, else the section playing. Next on a song's last section sends the End jump and arms `endJump` (playing only), with no `waitingJump`, because End is not a section; while it is armed there is nothing to brace.
- **Full surface:** `src/server/playback-controller.ts:267-279` (the `loop` case). New seam 1 test in `test/loop.test.ts`, beside the finding 5 case "braces the waiting jump's target".
- **Must preserve:** Loop off while a loop is on, whatever is pending (the `liveLoop.on` branch stays first); bracing a waiting jump's target (`test/loop.test.ts`, finding 5's case); nothing braced when the target has no end. Consequence to accept: while the End jump is pending (at most a bar), the leader page's Loop button stays enabled and the press does nothing, since `endJump` is not in the snapshot.
- **Do not touch:** the stopped Next-to-End and stopped Play-from-start paths, which arm nothing (Minor: a Loop in the few milliseconds before Live reports the new position).
- **Proof:** copy `repro/review-2-controller.test.ts` into `test/`, then `pnpm exec vitest run test/review-2-controller.test.ts -t "then Loop"`: red now, green after. Seam 1 regression: playing on a song's last section, the leader sends `next` then `loop`; barrier on `rig.received(JUMP)` holding the End cue; assert no `/live/song/set/loop*` message reached the fake Live.

### 3. After a wake whose fresh connection never gets through, the page still reads "connected" — MEDIUM
- **Location:** `web/src/server-connection.ts:54-58`, `:59-65`, `:69-72`
- **Attribution:** introduced by `571c234` (setlist-controller#1 pre-PR review 1 finding 6: Show every page when the server is out of reach, and disable the leader's controls until it is back). This is the prior doc's "Open from this round (half-fixes)" item for finding 6, including its LOW half (status reported on `open`, before the first snapshot).
- **Real-world trigger:** a band phone or the leader iPad wakes on a lossy stage Wi-Fi, or with the laptop gone from the network. The wake opens a fresh socket and keeps the old one as `previous`; the fresh try hangs.

**Evidence**
```ts
const connecting = setTimeout(() => {
  if (socket !== opened || opened.readyState !== WebSocket.CONNECTING) return;
  open();
  opened.close();
}, CONNECT_TIMEOUT_MS);
...
opened.addEventListener('close', () => {
  clearTimeout(connecting);
  if (socket !== opened) return;
```

**Failure mode** — Every timed-out try is replaced and its close ignored by `socket !== opened`, and the replaced `previous` socket's close is ignored the same way, so `onStatus(false)` never fires. Executed with `repro/review-2-connection.test.ts`: (A) old socket silently dead, five tries over 5 s, statuses `[true]`, and a Stop goes to the dead socket; (B) old socket closes at 300 ms, statuses `[true]` with no live socket. The page shows no Reconnecting banner and every leader control stays enabled while commands go nowhere. Separately, `onStatus(true)` fires on `open`, before the hub's first snapshot, so after a reconnect the stale snapshot shows with controls enabled for a moment ("no connected before the first snapshot", red).

**Recommended fix**
```diff
   const open = () => {
     const opened = new WebSocket(url);
     socket = opened;
+    let reported = false;
     const connecting = setTimeout(() => {
       if (socket !== opened || opened.readyState !== WebSocket.CONNECTING) return;
+      if (previous) onStatus?.(false);
       open();
       opened.close();
     }, CONNECT_TIMEOUT_MS);
     opened.addEventListener('open', () => {
       clearTimeout(connecting);
       attempt = 0;
-      if (socket !== opened) return;
-      retire();
-      onStatus?.(true);
+      if (socket === opened) retire();
     });
     opened.addEventListener('message', (event) => {
-      if (socket === opened) onSnapshot(JSON.parse(String(event.data)) as Snapshot);
+      if (socket !== opened) return;
+      onSnapshot(JSON.parse(String(event.data)) as Snapshot);
+      if (reported) return;
+      reported = true;
+      onStatus?.(true);
     });
     opened.addEventListener('close', () => {
       clearTimeout(connecting);
       // A socket this replaced, or one closed for good, schedules nothing.
-      if (socket !== opened) return;
+      if (socket !== opened) {
+        if (opened !== previous) return;
+        previous = null;
+        if (socket?.readyState !== WebSocket.OPEN) onStatus?.(false);
+        return;
+      }
       socket = null;
```
Update the existing comment above the close branch to cover the replaced-socket case; add no other comment lines.

**Remediation brief**
- **Design intent:** a page is "connected" exactly while its current socket has delivered the hub's snapshot and has not closed. A wake opens a fresh socket at once and keeps the replaced one in `previous` so a tap at the moment of the wake still reaches the server; the page stays connected across a healthy wake. Commands are dropped, never queued, while down. Tries never give up and stay under 2 s apart.
- **Full surface:** `web/src/server-connection.ts:50-79` (`open`); `wake` (`:84-96`) and `send` (`:102-105`) do not change; `web/src/App.tsx` `useServer` consumes `onStatus` unchanged. Tests: `test/reconnect.test.ts` (real server through `test/proxy.ts`) gains the hung-wake and status-before-snapshot cases.
- **Must preserve:** a healthy wake never reports down (`test/reconnect.test.ts` "never down across a wake", statuses `[true, false, true]` then only `true`); a drop then retry reports `[true, false, true]`; `attempt` resets on open; the retry backoff and `CONNECT_TIMEOUT_MS`; `send` falls back to `previous` while the fresh socket is not open; `retire()` on the current socket's open; snapshots from a replaced socket stay ignored. Declared trade-off: when a wake's fresh try times out while `previous` is in fact alive, the page reports down for up to one more try (about 1.5 s) although `previous` could still carry commands.
- **Failure of the fix:** if every fresh try keeps timing out, the page stays reported down and the tries continue every 1.5 s; the next try that delivers a snapshot reports up. `previous` closing after the timeout already reported down sends a second `false`, which React ignores.
- **Escalation:** this is the third change to the connection status mechanism (#10, `571c234`, this). If a fourth round finds it wrong again, recommend a split ticket with its own state matrix rather than another in-place fix.
- **Proof:** copy `docs/reviews/setlist-controller-1/repro/review-2-connection.test.ts` into `test/`, then `pnpm exec vitest run test/review-2-connection.test.ts`: 3 red now (A, B, L90), 5 green after (delete the copy afterwards). Then `pnpm exec vitest run test/reconnect.test.ts test/pages.test.ts` and `pnpm test:e2e` (the reconnect spec) stay green. Verified in scratch: lint, typecheck, build and the full suite green with this diff.

### 4. With a jump waiting, the Loop button's enabled state disagrees with what the server will do — LOW
- **Location:** `web/src/SectionControls.tsx:24-26`
- **Attribution:** introduced by `d096d1e` (setlist-controller#1 pre-PR review 1 finding 12: Show no Next End, and disable Next and Loop, on the last section of a song with no End), which computes Loop's availability from the section playing, while `90969a8` (finding 5) made the server brace the waiting jump's target.
- **Real-world trigger:** only on a set with a song that has no End locator, which the setup screen already warns about: (a) playing that song's last section, the leader taps an earlier section, and Loop stays disabled although the server would brace it; (b) a jump waits on that last section, and Loop is enabled but the server ignores the press, the dead button finding 12 removed.

**Evidence**
```ts
const section = now && song?.sections[now.section];
const canNext = now !== null && (now.next !== 'end' || (song?.endCue ?? null) !== null);
const canLoop = looping || (section != null && section.end !== null);
```

**Failure mode** — Read against `playback-controller.ts:274-276` (`waitingJump ?? now(position)`, then nothing when `section.end === null`). Not executed; the mismatch is direct from both sources.

**Recommended fix**
```diff
-import type { SetList, Snapshot } from '../../src/shared/snapshot.ts';
+import { sectionAt, type SetList, type Snapshot } from '../../src/shared/snapshot.ts';
 ...
   now,
+  jump,
   loop,
 ...
   now: Snapshot['now'];
+  jump: Snapshot['jump'];
   loop: Snapshot['loop'];
 ...
-  const section = now && song?.sections[now.section];
+  const target = jump ?? now;
+  const section = target && sectionAt(set, target);
   const canNext = now !== null && (now.next !== 'end' || (song?.endCue ?? null) !== null);
-  const canLoop = looping || (section != null && section.end !== null);
+  const canLoop = looping || (section?.end ?? null) !== null;
```
and pass `jump={jump}` at `web/src/App.tsx:61` and `jump: null` at `test/pages.test.ts:128`.

**Remediation brief**
- **Design intent:** a leader control is enabled exactly when the server would act on it. Loop acts on the waiting jump's target, else the section playing, and never on a section with no end; Loop off is always available while looping.
- **Full surface:** `web/src/SectionControls.tsx:9-26`, `web/src/App.tsx:61`, `test/pages.test.ts:128` (the `sectionControls` helper), new `test/pages.test.ts` cases for (a) and (b).
- **Must preserve:** Next counts from the section playing on both sides (`canNext` unchanged); Loop enabled while looping; the finding 12 cases in `test/pages.test.ts` (no Next End, Next and Loop disabled on the last section of a song with no End and no jump waiting).
- **Proof:** two new `test/pages.test.ts` cases red now, green after: `now` on the last section of a song with no End plus `jump` on an earlier section, Loop enabled; `now` on a section with an end plus `jump` on that last section, Loop disabled. Verified in scratch together with fixes 1 to 3: full suite green.

### 5. Ctrl-C on a contract run writes its partial report over the complete one at the same path — LOW
- **Location:** `src/contract/main.ts:95-97`
- **Attribution:** introduced by `ec66368` (setlist-controller#1 pre-PR review 1 finding 10: Make the contract check's clean-up reach Live, on a failure and on Ctrl-C), which made an interrupted run reach the write. **Known regression, deferred:** the prior doc's list reads "Ctrl-C now writes a partial report over `--out` (LOW)".
- **Real-world trigger:** `docs/install.md` gives fixed `--out` paths (`~/contract-check/live`, `~/contract-check/fake`); re-running the live check and stopping it with Ctrl-C destroys the last good live report, the one compared against the fake.

**Evidence**
```ts
await mkdir(dirname(out), { recursive: true });
await writeFile(`${out}.json`, `${JSON.stringify(toComparisonFile(record), null, 2)}\n`);
await writeFile(`${out}.md`, toReport(record));
```

**Failure mode** — Executed on the fake target: a full run wrote a 2974-byte `rep.json` with `aborted: null`; a second run at the same `--out`, interrupted at 4 s, replaced it with 2338 bytes and `aborted: "Interrupted before the run finished."`.

**Recommended fix**
```diff
-  await mkdir(dirname(out), { recursive: true });
-  await writeFile(`${out}.json`, `${JSON.stringify(toComparisonFile(record), null, 2)}\n`);
-  await writeFile(`${out}.md`, toReport(record));
-  console.log(`Wrote ${out}.md`);
-  console.log(`Wrote ${out}.json`);
+  const path = signal.aborted ? `${out}.interrupted` : out;
+  await mkdir(dirname(path), { recursive: true });
+  await writeFile(`${path}.json`, `${JSON.stringify(toComparisonFile(record), null, 2)}\n`);
+  await writeFile(`${path}.md`, toReport(record));
+  console.log(`Wrote ${path}.md`);
+  console.log(`Wrote ${path}.json`);
```

**Remediation brief**
- **Design intent:** `<out>.json` and `<out>.md` only ever hold the last complete run, so `compare` always reads a full record. A run that stops early for a non-interrupt reason (`record.aborted` without `signal.aborted`, exit 1) still writes to `<out>`, since that is a genuine result about Live.
- **Full surface:** `src/contract/main.ts:95-99`; `docs/install.md` where it describes the outputs and Ctrl-C (add one sentence naming `<out>.interrupted.*`).
- **Must preserve:** exit 130 on Ctrl-C, exit 1 on another early stop, exit 0 on a full run; the warnings printed after the write; the clean-up reaching Live (`test/contract.test.ts`).
- **Proof:** a new `test/contract.test.ts` case that spawns `node src/contract/main.ts run --target fake --out <tmpdir>/rep` (the fake target binds OS-assigned ports) after writing a sentinel `<tmpdir>/rep.json`, sends SIGINT about 1 s in, and asserts exit code 130, the sentinel unchanged, and `<tmpdir>/rep.interrupted.json` present. Red now, green after.

### 6. The setup Refresh test "answers only a POST" cannot catch a GET that refreshes — LOW
- **Location:** `test/setup-screen.test.ts:161-169`
- **Attribution:** introduced by `5541a35` (setlist-controller#1 pre-PR review 1 finding 8: Add Refresh to the setup screen, through a laptop-only POST).
- **Real-world trigger:** none in production; a claim of coverage the suite does not have.

**Evidence**
```ts
expect((await get(rig!.server.httpPort, SETUP_REFRESH_API)).status).toBe(405);
expect((await get(rig!.server.httpPort, SETUP_REFRESH_API, '127.0.0.1', 'POST')).status).toBe(204);
await viewer.snapshot((snapshot) => snapshot.set?.songs[0]?.sections.length === 2);
expect(rig?.received(CUE_POINTS)).toHaveLength(reads + 1);
```

**Failure mode** — Mutation executed by the test audit: making the GET also refresh left the test green 5 of 5; the count was `reads + 1` at the assertion and `reads + 2` 300 ms later, because the GET's own read satisfies the snapshot wait before the POST's read reaches the fake Live.

**Recommended fix** — Right after the 405, put a barrier and assert no read happened: connect a leader, send `{ kind: 'jump', song: 1, section: 0 }`, `await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1))`, then `expect(rig?.received(CUE_POINTS)).toHaveLength(reads)`; only then POST. Apply the same barrier after the 403 in the Linux-only refusal test (`:132-137`).

**Remediation brief**
- **Design intent:** a test of "nothing reached Live" needs a later message that provably went out on the same OSC socket after anything the code under test could have sent. Precedent: `leaderBarrier` in `test/pedal.test.ts:69-72`.
- **Full surface:** `test/setup-screen.test.ts:132-137`, `:161-169`; a `JUMP` constant (as in `test/pedal.test.ts:46`).
- **Must preserve:** the 405, 204 and 403 status assertions; the POST still produces exactly one read.
- **Proof:** with `serveSetupRefresh` mutated to refresh before the method check, the reworked test goes red; revert the mutation and it is green.

### 7. Comment hygiene — LOW (aggregated)
- `src/server/server.ts:58-59` — "A command reaches the controller only through the hub, after the HTTP server listens, and by then the bridge is up." → "Commands reach the controller through the hub, the setup Refresh route and the pedal. HTTP listens after the bridge is up, and the pedal acts on no set until the bridge has read one."
- `docs/install.md:52` — "That path stays put through a minor Node upgrade, a `brew upgrade` included. Run the install script again after a major Node upgrade, since the MIDI module is built for one, …" → "That path stays put through a `brew upgrade`. Run the install script again after you switch Node installs (for example from Homebrew to nvm), or after you move the repository, …" (`@julusian/midi` is an N-API build, so a major upgrade alone does not break it, and an nvm path is versioned).
- `scripts/install-launch-agent.sh:3-4` — "what to do after a Node upgrade or after moving the repository" → "what to do after switching Node installs or after moving the repository".

## Needs Further Investigation
### A. Stop disabled mid-hold, on the iPad only — confirm on iOS Safari
The prior doc's deferred regression ("Stop can be disabled mid-hold"). React 19.3.0 does not filter pointer events or `onBlur` on a disabled button (`getListener` suppresses only click and mouse events). Probed with Playwright: Chromium blurs the button when it is disabled, which cancels the hold, and still delivers `pointerup`; desktop WebKit delivers `pointerup` or `pointerleave` to the disabled button. Nothing was sent after an early release in any probe. Unverified: iOS Safari with a finger. A finger kept down across a short loss still completes the hold and sends Stop if the connection is back within the second, which is arguably what the leader meant. Confirm on the iPad: hold Stop, drop the iPad's Wi-Fi for half a second, lift the finger early, and check Live keeps playing. If it stops, the lint-clean guard (the naive `useEffect` that calls `setHolding` fails `react-hooks/set-state-in-effect`) is to adjust state on the prop change during render (`const [wasAvailable, setWasAvailable] = useState(available); if (available !== wasAvailable) { setWasAvailable(available); if (!available) setHolding(false); }`) plus `useEffect(() => { if (!available) hold.current?.release(); }, [available])`; verified lint-clean and green in scratch.

### B. A hand relocation into End's window while an End jump is armed stops Live
The prior doc's deferred regression. Confirmed in the controller: playing at 53, Next, then hand moves to 10, 11, 65 give `['jump 3', 'stop']`, because `landedOnEnd` (`playback-controller.ts:142-150`) ignores where the playhead came from. It matters only if Live drops a pending quantized cue jump when the playhead is moved by hand; if Live keeps it, the jump still lands at End and the stop is right. Confirm in the hardware check (#13): with a song playing, press Next on its last section, then click the arrangement elsewhere before the bar line. If Live drops the jump, clear `endJump` on a backwards move or a move of a bar or more before End.

### C. fnm users get a per-shell node path in the launch agent
`scripts/install-launch-agent.sh:28` stores `command -v node`. Under fnm that may be a `fnm_multishells/<pid>_<ts>/bin/node` symlink that disappears, where `process.execPath` (the round 1 value) was stable. From memory of fnm, not checked. Confirm on the playback Mac with `command -v node` in a login shell; if it names `fnm_multishells`, resolve it with `realpath` in the install script.

Round 1's Needs Further Investigation A to F stand unchanged (`pre-pr-review-1.md`).

## Reviewed and Dismissed
- Setup Refresh POST with no Origin check (prior L87) — a page in the laptop's browser can trigger a locator read while Live is stopped, which the 5-second stopped poll does anyway; the controller ignores Refresh while playing; the 204 has no body.
- A second Ctrl-C during the contract clean-up — exits, since Node restores the default action once the `once` listener has run; the clean-up is a few UDP sends.
- An abort during the contract run's setup phase — no step before `run.started = true` starts playback, and `started` is set in the same synchronous block as `continue_playing`.
- `endJump` going stale — cleared by every `jumpTo`, `clearJump` (stop with a bar line, set change, Live loss), `playing: false`, and its own landing; a toggle change while armed is honoured at landing.
- Finding 3's early return in `jumpTo` — `leaveLoopFor` still runs before the jump (`['loopOff', 'jump 1']` with a loop on another section).
- Loop while the waiting target has no end — braces nothing, consistent with "a loop never carries to a different section".
- Parser overlap check on a song that starts on the previous song's End — no warning (strict `<`), pinned by "does not warn about a song that starts on the last one's End".
- "The first one counts" for a repeated End — matches `toSong`, which takes the earliest End by time.
- `Object.hasOwn` in the fake Live's `start_listen` branch, and the hub's per-socket `error` listener — correct.
- The setup Refresh closure reaching the bridge before it exists — `http.listen` runs after `await startLiveBridge`.
- Other leader controls using `connected` rather than `liveReady` — a Live loss nulls `now`, the jump and the loop, so they disable anyway; end toggles staying usable is intended and tested.

## Minor / nits
- `src/server/playback-controller.ts:255-258`, `:294-298`: stopped Next to End, or stopped Play from start, then Loop within the few milliseconds before Live reports the new position, braces the section being left (executed). Finding 2's fix does not cover it, since `endJump` is armed only while playing.
- `src/server/set-parser.ts:64`: the overlap check misses a locator at the same time as another song's first locator when one of the songs has no End (`1 - Intro@10`, `2 - Intro@10`, `2 - End@30`); those sets already warn `missing-end`.
- `src/server/set-parser.ts`: a song with only an End locator gives a song with no sections and no warning (pre-existing).
- `src/server/playback-controller.ts:115-118`: Loop pressed right after a jump to another section, before Live reports `loop 0`, sends a second `loopOff` instead of bracing (pre-existing, reasoned, not executed). Already the stage 2 proposal "Turn the loop off when a tap follows Loop before Live reports the loop on" covers the mirror case.
- `web/src/styles.css:272-286`: the fixed Reconnecting banner covers roughly the first line of the page (the song and section, or the Setup heading) while it shows; the placement is the recorded stage 2 assumption. Not checked in a browser layout.
- `web/src/NowPlaying.tsx` `Reconnecting`: a `role="status"` region inserted already populated may not be announced by some screen readers.
- `web/src/Setup.tsx:38-40` (prior L88): `refreshFromLaptop` ignores a 403 and leaves a rejected `fetch` unhandled.
- `src/server/server.ts:172-184`: the setup Refresh answers 204 while Live plays, when the controller ignores it; the leader's Refresh is silent too.
- `src/install/print-launch-agent.ts:9`: `??` lets an empty `SETLIST_NODE` through, which then fails loudly in `launchAgent`; unreachable from the script.
- After a wake, snapshots from the replaced socket are ignored until the fresh one delivers (round 1 nit, unchanged by finding 3's fix).

## Test quality
Tests in the delta: 31 new or changed Vitest cases (22 new, 9 changed) and 1 new Playwright case; prop-only adaptations not counted. Against the `a2ee7b8` oracle: 25 red, 5 green, 1 Linux-only (skipped on darwin, red-equivalent by its sibling). The 5 green are all accepted: the two `test/pedal.test.ts` finding 9 cases (the test was the fix; mutation shows HEAD red where `a2ee7b8` stayed green), the `test/refresh.test.ts` setup rework, the Continue guard in `test/section-navigation.test.ts`, and the no-false-positive boundary in `test/setlist.test.ts`. Shapes found:
- Missing barrier, confirmed by mutation: finding 6.
- `test/launch-agent.test.ts:35` asserts the install script's text; the two behavioural assertions beside it are what went red. Stronger: run the lookup in a subshell with a symlinked node on PATH and check `ProgramArguments[0]`.
- `test/reconnect.test.ts:213`: `statuses.slice(3).every(open)` after a sleep passes on an empty slice; mutations still turned it red 3 of 3. Stronger: `await vi.waitFor(() => expect(statuses).toEqual([...]))` with the exact sequence (it changes with finding 3's fix).
- `test/pages.test.ts:194`, `:198`: "waiting plus looping equals waiting" passes if both values are undefined; add `toBeDefined()` on the waiting value.
- No mocked units, unread snapshots or assertion-free tests.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build all pass at `cadb14b`.
- **Commit hygiene:** commit this doc and `repro/review-2-controller.test.ts`, `repro/review-2-connection.test.ts` (outside `test/`, so the suite does not run them; copy one in to run it, per each brief). Nothing else to drop.
- **Likely reviewer asks:** proof against real Live (#13's contract run); the Playwright suite's status outside CI; why the Reconnecting banner covers content.

## Verdict
**Not ready as-is; ready once findings 1 to 3 land.** Gate: findings 1, 2 and 3 (MEDIUM), the three open items the round 1 tripwire left: a double stop on the commonest Next press, a loop braced on the section being left, and a page that reads connected with nothing behind it. All three are small diffs verified together in scratch with the full suite green. Findings 4 to 7 are LOW and cheap; take them in the same pass. Zero CRITICAL and zero HIGH this round. Of round 1's 14 findings, 12 are fully fixed (two with a known regression, deferred, now findings 1 and 5), 2 are partially fixed (5 and 6, now findings 2 and 3), none untouched, none resolved only by a comment. The confirmed count fell from 14 to 7, and what remains is the remediation's own deferred and half-fixed items rather than new ground, the expected shape of a converging branch. The auto-stop and the connection status have each now been changed in response to review; finding 3's brief records that a further failure there should become a split ticket.

## Remediation — 2026-10-13
All 7 confirmed findings worked, the LOW tail included (the run's rule: a round with any MEDIUM-or-higher finding fixes every confirmed finding). Full checks after the last commit: `pnpm lint`, `pnpm typecheck`, `pnpm test` (19 files, 202 passed, 2 skipped, the same two Linux-only cases) and `pnpm build` pass; `pnpm exec playwright test e2e/reconnect.spec.ts` 4 of 4 after the rework.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `53fb1bd` setlist-controller#1 pre-PR review 2 finding 1: Send one stop when Next is pressed in the last bar before End | red→green: `repro/review-2-controller.test.ts -t "one stop"` copied into `test/` (2 red, then green, copy deleted); new `test/section-navigation.test.ts` "stops Live once at End on "Stop at end" when pressed in the last bar before End" red 3 of 3 (2 stops), green; `section-navigation`, `transport`, `jump`, `loop`, `pedal`, `now-playing` suites green | 1 (test: the reports must all go out before the stop reaches Live) | proved by execution |
| 2 (MEDIUM) | `032ef32` setlist-controller#1 pre-PR review 2 finding 2: Brace nothing when Loop follows Next to End | red→green: repro "then Loop" red, green; new `test/loop.test.ts` "braces nothing after Next on a song's last section, where the jump to End waits" red (3 loop messages), green; same cluster suites green | 0 | proved by execution |
| 3 (MEDIUM) | `98d7e8a` setlist-controller#1 pre-PR review 2 finding 3: Report a page down when a wake's fresh connection never gets through, and up only once the snapshot comes | red→green: `repro/review-2-connection.test.ts` copied into `test/` (3 red, 5 green after, copy deleted); new `test/reconnect.test.ts` cases (hung wake with the old socket dead, replaced socket closing while the fresh try hangs, up only after the snapshot) red, green; each new case red under its own mutation; `reconnect`, `pages`, `offline` suites 5 runs green; Playwright reconnect spec 4 of 4 | 3 (two `test/proxy.ts` method docs for the new `hang()` and `cut()`, matching that file's per-method docs; one line extending the existing close-branch comment, as the brief directed) | half-fixed, reworked: see Rework briefs |
| 3 rework | `64bf188` setlist-controller#1 pre-PR review 2 finding 3 rework: Report a page down when a wake replaces a socket that is closing | red→green: new `test/server-connection.test.ts` (fake WebSocket, fake timers) red, green; reconnect and pages suites green | 1 (test helper doc) | scoped re-verify: fixed, plus one introduced LOW (a second wake reported down while the first wake's socket still reads open) |
| 3 rework follow-up | `73a2735` setlist-controller#1 pre-PR review 2 finding 3 rework follow-up: Keep a second wake from reporting down while the first wake's socket still reads open | red→green: new `test/server-connection.test.ts` double-wake case red with the rework line alone, green with the one-line guard (`replaced && !previous`); full suite green | 0 | one-line fix the scoped re-verify specified; not re-verified (no second re-verify by rule) |
| 4 (LOW) | `7e3a2d6` setlist-controller#1 pre-PR review 2 finding 4: Enable Loop by the section a waiting jump goes to, as the server braces it | red→green: new `test/pages.test.ts` case (both (a) and (b)) red, green; `pages` suite and typecheck green | 1 net (the component's header comment rewritten to say Loop follows a waiting jump, so it stays accurate) | proved by execution |
| 5 (LOW) | `3ee3dff` setlist-controller#1 pre-PR review 2 finding 5: Write an interrupted contract run beside the complete report, never over it | red→green: new `test/contract.test.ts` case spawns the fake-target run with a sentinel `<out>.json`, SIGINT at 1 s: exit 130 held, sentinel overwritten (red), then kept with `<out>.interrupted.*` written (green); scratch dir under the worktree's ignored `dist/`, removed after; `docs/install.md` gains one sentence | 0 | proved by execution |
| 6 (LOW) | `a911341` setlist-controller#1 pre-PR review 2 finding 6: Give the setup Refresh tests a leader barrier, so a GET that refreshes goes red | mutation: `serveSetupRefresh` refreshing on GET turns "answers only a POST" red 3 of 3, reverted green; the Linux-only 403 test cannot run on darwin | 2 (`leaderBarrier` doc, mirroring `test/pedal.test.ts`) | fixed (verifier simulated the Linux test on macOS: red under the mutation, green without) |
| 7 (LOW, comment hygiene) | `7401a8d` setlist-controller#1 pre-PR review 2 finding 7: Correct three comments on command paths and Node upgrades | read against the code: the pedal and the setup Refresh route reach the controller outside the hub; `@julusian/midi` builds with `node-addon-api` and `napi_versions` | n/a | excluded from verification by rule |

### Known regressions, deferred
- None introduced and left open this round.

### Open, not introduced this round
- After a wake, the fresh socket opens, `retire()` closes the replaced one, and if the fresh socket goes half-open before the hub's snapshot arrives, the page keeps reading connected with no time limit (verifier, reproduced with a fake WebSocket; the same before finding 3's fix, which reported up on `open`). Outside the reworked diff, so not fixed; proposed in `.epic-loop/stage2/proposals.md` as "Report a page down when a socket opens but never delivers the snapshot". Finding 3's Escalation stands: the connection status has now changed four times (#10, `571c234`, `98d7e8a`, `64bf188`/`73a2735`), so a further failure there should become a split ticket with its own state matrix.

### Rework briefs
- Finding 3, verifier verdict "half-fixed: when a wake lands while the current socket is CLOSING, the page still reads connected with nothing behind it". Achieve: a wake that replaces a socket that is not OPEN reports the page down, so hung fresh tries after it leave the page down. Preserve: a wake that replaces an OPEN socket never reports down and keeps it as `previous`; every behaviour in finding 3's Must preserve; `replaced?.close()` still runs. Proof: a fake-WebSocket test (deliver a snapshot, set the socket CLOSING, wake, close it, advance 5 s) red before, green after; `test/reconnect.test.ts` green.
- Finding 3 rework follow-up, scoped re-verify verdict "introduced: an immediate down on a double wake while the earlier OPEN socket still carries commands", one-line fix specified. Achieve: the not-OPEN report only when no `previous` socket is held. Preserve: the CLOSING case still reports down (a CLOSING current socket always has `previous === null`, since the fresh socket's open retires it). Proof: a double-wake fake-WebSocket test reports `[true, true]` with the guard and goes red without it.

## Approach decisions (remediation 2026-10-13)
- **Both auto-stop triggers (finding 1):** evaluate `reachedEnd` and `landedOnEnd` into separate constants before the `||`, as recorded above. Applied.
- **End jump and Loop (finding 2):** `endJump !== null` returns after the Loop-off branch. Applied.
- **Loop availability on the leader page (finding 4):** `jump ?? now` through `sectionAt`, as recorded above. Applied.
- **Server connection status (finding 3):** up on the current socket's first snapshot; down on a wake try's timeout while `previous` is held, on `previous` closing while the current socket is not open, and on a wake that replaces a socket that is not OPEN while no `previous` is held. Seam tests through `test/proxy.ts` gain `hang()` (stall new connections, leave open ones) and `cut()` (destroy forwarding connections, leave held ones); states a proxy cannot reach (a CLOSING socket at the wake, a double wake) are pinned in `test/server-connection.test.ts` with a fake WebSocket and fake timers.
- **Contract check interrupted report (finding 5):** `<out>.interrupted.json` and `.md`, as recorded above. Applied; the spawned-process test writes under the worktree's ignored `dist/`, mirroring `test/offline.test.ts`.
- **"Nothing reached Live" tests (finding 6):** a leader jump barrier, mirroring `leaderBarrier` in `test/pedal.test.ts`.
