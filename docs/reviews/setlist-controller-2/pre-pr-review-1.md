# Pre-PR review: setlist-controller#2 Safe Mode, no jumps to another song while Live plays

**Branch:** `setlist-controller-2-safe-mode` vs merge-base `adee302` ("setlist-controller, the first public commit"), passed explicitly because `origin/main` has moved since the branch was cut
**Reviewed at:** HEAD `cfca492` (Implement Safe Mode cross-song jump and Timeline Pause guards (#2)) + 0 files with uncommitted changes, 0 untracked files at start, 31 files total, +880 / −23
**Reviewed against:** issue `nick-vogel/setlist-controller#2` (open), its epic `#1` "Safe jumps while Live plays", and the sibling `#3` "Jump now and cancel for a waiting jump" (which builds on this branch). Global rules in `~/.claude/rules/`. The repo has no `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, ADRs, `.claude/rules/`, or prior review of #2.
**Date:** 2026-11-25
**Reviewer:** 3 code-review agents (`pr-review-finder`) + 1 disprove agent + verify pass; independent second opinion (a separate review thread) folded in, see "Second opinion"

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | pass |
| Full unit and rig suite | `pnpm vitest run --maxWorkers=2`, twice | run 1, under load from other agents' suites on the machine: 4 failures in 3 files, 99 files passed. One visible failure was a set-builder key test, outside this surface. Run 2: **102 of 102 files, 3,296 passed, 4 skipped**. The run 1 failures were load flakes, not regressions. |
| Playwright | `pnpm build && pnpm exec playwright test e2e/safe-mode.spec.ts e2e/timeline.spec.ts --workers=1`, in a scratch worktree at HEAD | all green in `webkit-ipad` and `chromium-android` |
| Full `pnpm test:e2e` | not run | other agents share the machine; only the two specs this branch touches were run |
| Base oracle for new tests | scratch worktree at `adee302`, new test files copied in, run there | `test/safe-mode.test.ts`: all red at base except `:284` (Previous/Next song disabled either way), a legitimate non-regression test. `e2e/safe-mode.spec.ts`: 3 of 3 red in both projects. `e2e/timeline.spec.ts` `:175` and `:286`: red at base (they click the new toggle) |
| Edited existing tests (18 files) | read each edit; mutation runs in a scratch worktree | no edit weakened its test (see Reviewed and Dismissed). Removing the inserted `set-safe-mode false` lines turns 11 tests red, so each one is needed |
| Mutation runs on the guard | scratch worktree at HEAD, one mutation at a time | **survive:** delete the server-level `controller.refuses` line (server.ts:268), allow jumps in a gap, `activeSong` ignores the count-in, `parseCommand` coerces `Boolean(enabled)`, drop the Timeline block `onClick` guard, a 500 ms hold. **Killed:** Safe Mode defaults off, guard ignores `playing`, Play from start unguarded, a 250 ms hold, Pause stops on press (e2e only) |
| Server and controller guards agree | read `cues.command`, `connections.cancel`, `controller.snapshot` | they call the same `refuses()` against the same state, and nothing between the two calls mutates the controller, so they cannot disagree |
| Stale Pause hold (Finding 3) | Playwright repro, both projects | confirmed, visual only; `docs/reviews/setlist-controller-2/repro/pause-stale-hold.spec.ts` |
| Repro of Live stopping mid-hold on a disabled Pause | Playwright mouse input, both projects | did not reproduce: both engines dispatch `pointerup` or `pointerleave` (and Chromium dispatches `blur`) to the disabled button, so `release()` runs. Real iPad touch not tested |
| Lint compatibility of recommended diffs | `eslint-plugin-react-hooks` recommended rules | `react-hooks/set-state-in-effect`, `set-state-in-render` and `refs` are all `error`. Finding 3's fix uses the guarded adjust-during-render shape that `web/src/App.tsx:389` already uses and lints clean |

**Overall:** The guard does what the issue asks. While Safe Mode is on and Live plays, cross-song jumps and Play from start are refused, same-song jumps still work, and the server and Setlist and Timeline views agree in every state traced: a count-in, a gap, unknown position, and a pending Stop. Safe Mode starts on, viewers cannot toggle it, and Previous/Next song stay stopped-only. What is weak is the proof. The server-level half of the guard and the gap-between-songs refusal can be deleted with every suite still green, so two MEDIUM test gaps should close before the PR opens, since the acceptance criteria ask for rig tests covering each case. The rest is LOW: one visual glitch on the Pause button and some duplication.

## Approach decisions
- **Q1, decided by Nick 2026-11-25:** while Live plays with no current song (before the first song, in a gap, or with an unknown position), Safe Mode refuses every jump and Play from start, even into the song about to start. This is intended and gets pinned by test (Finding 2).
- **Q2, decided by Nick 2026-11-25:** turning Safe Mode off stays a single tap on `SafeModeToggle` (`web/src/SafeModeToggle.tsx:22`), with no hold. Not a finding.
- **Hold-to-act buttons:** one shared hold wiring for Setlist Stop and Timeline Pause, built on `web/src/hold.ts` `createHold`. Precedent: `web/src/StopButton.tsx`.
- **State reset on a prop change in a component:** the guarded adjust-during-render shape (`if (seen !== current) { setSeen(current); ... }`), never `setState` in an effect body, which `react-hooks/set-state-in-effect` rejects. Precedent: `web/src/App.tsx:389`.
- **Logic shared by server and pages:** a pure helper in `src/shared/` imported by both. Precedent: `countInLandsOn` in `src/shared/count-in.ts`, used by `web/src/JumpTargets.tsx` and `web/src/TimelineView.tsx`.
- **Proving a refused command sent nothing:** assert on a published snapshot after a later accepted command has acted as a barrier, never on the fake Live's inbox straight after `flush()`. Precedent: the "a later command as the barrier" helpers in `test/transport.test.ts:253` and `test/count-in-change.test.ts:79`.

## Confirmed Issues

### 1. Nothing tests that a refused command skips the cue engine and the schedule cancel, and the comment above it says the opposite (MEDIUM)
- **Location:** `src/server/server.ts:261-268`
- **Attribution:** introduced. The guard line comes from `cfca492` (`git log --oneline -S'controller.refuses(command)' adee302..HEAD` → `cfca492`). The comment is unchanged from base (`git show adee302:src/server/server.ts | grep -n "accepted or not"` → lines 261 and 263) and this branch made it false.
- **Real-world trigger:** Safe Mode on, Live playing song 1, ProPresenter armed with a lead. A stray tap on another song's section or Play from start arrives just ahead of a section change. If the guard line is lost in a refactor, that refused tap cancels the slide change already scheduled, and the slide lands late. No suite would notice. Rated MEDIUM because it is a missing test for a stated rule, not a live defect.

**Evidence**
```ts
  // The cues hear of it first, accepted or not, since only the command tells Play from start's jump
  // from a jump to the song's first section. Stop and every jump request drop every slide change the
  // targets have scheduled ahead of its beat, accepted or not, before the controller sees them. ...
  const command = (command: Command) => {
    if (controller.refuses(command)) return;
    cues.command(command);
    if (CANCELS_SCHEDULE.has(command.kind)) connections.cancel();
```

**Failure mode:** Mutation: delete `server.ts:268`. Then `test/safe-mode.test.ts`, `test/cue-causes.test.ts`, `test/count-in-cues.test.ts`, `test/eos.test.ts` and `test/atem.test.ts` all pass (374 tests), because `controller.command` calls `refuses()` again and Live still gets nothing. Only the cue and schedule side effects differ, and no test watches them. The comment tells a maintainer that every jump request cancels schedules "accepted or not", which is no longer true for a refusal.

**Recommended fix:** Add one rig test to `test/safe-mode.test.ts`, and correct the comment in the same commit.
```diff
-  // The cues hear of it first, accepted or not, since only the command tells Play from start's jump
-  // from a jump to the song's first section. Stop and every jump request drop every slide change the
-  // targets have scheduled ahead of its beat, accepted or not, before the controller sees them. A
+  // A command Safe Mode refuses goes no further, so the cues never hear of it and the targets keep
+  // every slide change they have scheduled. Every other command reaches the cues first, accepted or
+  // not, since only the command tells Play from start's jump from a jump to the song's first section.
+  // Stop and every other jump request drop every slide change the targets have scheduled ahead of its
+  // beat, accepted or not, before the controller sees them. A
```
The test is modelled on `test/cue-causes.test.ts:37` `armedRig` and its `lead` helper, as used at `:94` and `:107`. Arm a lead target while Live plays song 1 with Safe Mode on. Inside the lead window of an upcoming section boundary, send `{ kind: 'jump', song: 2, section: 0 }` and `{ kind: 'play-from-start', song: 2 }`. Advance across the boundary, then assert that the target received that boundary's cue (its schedule survived) and no cue for song 2.

**Remediation brief**
- **Design intent:** `server.ts` `command()` is the single entry for hub, pedal, poll and setup commands. The cue engine and the connection schedule hear a command before the controller does. Safe Mode's `refuses()` deliberately runs first, so a refused tap disturbs nothing downstream. The controller's own `refuses()` call at `playback-controller.ts:807` is a second, defensive guard for callers that reach the controller directly.
- **Full surface:** `src/server/server.ts:261-268` (comment and guard); new test in `test/safe-mode.test.ts`. `src/server/connections.ts:158-160` (the `cancel()` doc, "the leader's Stop or a jump request, on its way to the playback controller") stays accurate and needs no change.
- **Must preserve:** the order `refuses` → `cues.command` → `connections.cancel` → `controller.command` → `connections.observed`; the controller-side `refuses` at `playback-controller.ts:807`; every test in `test/cue-causes.test.ts` and `test/count-in-cues.test.ts`.
- **Do not touch:** the double `refuses()` call (Reviewed and Dismissed: the two cannot disagree).
- **Proof:** the new test must go red with `server.ts:268` deleted and green with it restored: `pnpm vitest run test/safe-mode.test.ts --maxWorkers=2`.

### 2. The refusal assertions read Live's inbox straight after `flush()`, so the gap-between-songs refusal is unpinned (MEDIUM)
- **Location:** `test/safe-mode.test.ts:134-137` (gap), and the same shape at `:105-107`, `:148-150`, `:171-173`; `e2e/safe-mode.spec.ts:104-106`
- **Attribution:** introduced in `cfca492` (new file).
- **Real-world trigger:** none at runtime. This is a coverage claim the tests do not hold. The gap rule ("while playing in a gap between songs, every jump is refused") is stated in the test name at `:129` and deliberately chosen, but a change that allows jumps there passes every suite.

**Evidence**
```ts
    leader.send({ kind: 'jump', song: 2, section: 0 });
    leader.send({ kind: 'play-from-start', song: 2 });
    await leader.flush();
    expect(rig.received(JUMP)).toEqual([]);

    // Stop Live and start a count-in to Song 1 Verse.
```

**Failure mode:** `flush()` (`test/harness.ts:322`) proves only that the server read the WebSocket frame. The OSC jump reaches the fake Live later over UDP. At base, where nothing is refused, this exact assertion still passed, and by the next `waitFor` the fake Live held 3 JUMPs. In the gap test, the Stop at `:141` then clears any jump that was accepted. Mutation `if (command.kind === 'jump') return activeSong() !== null && command.song !== activeSong();` (plus the same for Play from start) survives both `test/safe-mode.test.ts` and `e2e/safe-mode.spec.ts`. The `:103-110` case is saved only by `viewer.received.at(-1)?.jump` at `:110`, which is also read without a barrier.

**Recommended fix:** After each refused command, send an accepted command as a barrier and assert on the snapshot it publishes. While playing with a known position, an accepted jump sets `jump` in the very next published snapshot (`jumpTo` sets `waitingJump`), so `jump === null` after the barrier proves the refusal. In the gap test:
```diff
     leader.send({ kind: 'jump', song: 2, section: 0 });
     leader.send({ kind: 'play-from-start', song: 2 });
-    await leader.flush();
-    expect(rig.received(JUMP)).toEqual([]);
+    const toggle = leader.received.at(-1)?.endToggles[2] === 'stop' ? 'continue' : 'stop';
+    leader.send({ kind: 'set-end-toggle', song: 2, toggle });
+    const after = await leader.snapshot((s) => s.endToggles[2] === toggle);
+    expect(after.jump).toBeNull();
+    expect(rig.received(JUMP)).toEqual([]);
```
Apply the same barrier at `:105-107`, `:148-150` and `:171-173`. At `:148-150` (the count-in) assert `after.jump` still equals `{ song: 1, section: 2 }`. In `e2e/safe-mode.spec.ts:104-106`, replace `waitForTimeout(150)` with a later same-song tap whose JUMP is awaited, then assert the JUMP list holds only that cue.

**Remediation brief**
- **Design intent:** a refused command must leave the snapshot unchanged and send nothing to Live. With no current song while playing, every jump and Play from start is refused (decided, Q1). The snapshot is published synchronously by the controller's `onChange`, so a later accepted command's snapshot orders after the refused one on the same socket. The fake Live's inbox is filled asynchronously, so it can only confirm, never prove, an absence.
- **Full surface:** `test/safe-mode.test.ts:105-110`, `:134-137`, `:148-151`, `:171-173`; `e2e/safe-mode.spec.ts:104-106`.
- **Must preserve:** each test's existing positive checks (same-song jump lands at `:112-120`, the count-in retarget at `:153-154`, the Safe-Mode-off cross-song landing at `:178-187`). Song 2's end toggle has no bearing on the later steps of these tests; recheck that when editing.
- **Do not touch:** the gap behaviour itself (`activeSong()` null refuses every jump). It is the intended behaviour, decided by Nick on 2026-11-25 (Q1 in Approach decisions): while Live plays with no current song, before the first song, in a gap, or with an unknown position, Safe Mode refuses every jump, even into the song about to start. The strengthened gap test pins that refusal as a rule. It is not a placeholder awaiting a decision.
- **Proof:** apply the gap mutation above in a scratch copy; `pnpm vitest run test/safe-mode.test.ts --maxWorkers=2` must go red at the gap test, and green with the mutation reverted.

### 3. Timeline Pause shows a full hold bar with nobody pressing, after Safe Mode was turned off and on during a press (LOW)
- **Location:** `web/src/TimelinePauseButton.tsx:21-38`
- **Attribution:** introduced in `cfca492` (new file).
- **Real-world trigger:** the leader starts holding Pause on Timeline view, and the producer turns Safe Mode off before the second is up. The leader lets go, and later Safe Mode goes back on. Pause now shows its red bar full with no hold running, and the first real press after that shows no fill progress. Stops still need a full hold and nothing is sent wrongly, so the damage is visual. Rated LOW: it needs a toggle from another page mid-press.

**Evidence**
```tsx
  useEffect(() => {
    if (!safeMode || !available) {
      hold.current?.release();
      hold.current = null;
      return;
    }
  ...
  const activeHold = safeMode && available && holding;
```

**Failure mode:** The effect releases the timer but leaves `holding` true. The single-tap branch rendered while Safe Mode is off has no pointer handlers, so the release lands on nothing. When Safe Mode returns, `activeHold` is true. Executed in both `webkit-ipad` and `chromium-android`: the class is `timeline-pause hold-required holding`, the `.stop-fill` transform is `matrix(1, 0, 0, 1, 0, 0)` (full), and no STOP is sent. Later presses behave correctly: a 300 ms press sends nothing, and a 1.2 s hold sends exactly one STOP. The `available`-goes-false variant does not reproduce, because both engines deliver pointerup or blur to the disabled button.

**Recommended fix**
```diff
   const [holding, setHolding] = useState(false);
   const hold = useRef<Hold | null>(null);
+  const guarded = safeMode && available;
+  const [wasGuarded, setWasGuarded] = useState(guarded);
+  if (wasGuarded !== guarded) {
+    setWasGuarded(guarded);
+    setHolding(false);
+  }
```

**Remediation brief**
- **Design intent:** while Safe Mode is on, Pause sends `stop` only after `STOP_HOLD_MS` of continuous press, and the `holding` class drives a CSS fill that must mean "a hold is running now". Whenever the hold is torn down by a guard change (Safe Mode off, or Pause unavailable), the fill must empty with it.
- **Full surface:** `web/src/TimelinePauseButton.tsx:18-38`. If Finding 4 lands first, the reset moves into the shared hold hook instead.
- **Must preserve:** the effect releasing the timer when the guard drops (`:22-26`); `onComplete` resetting `holding` and sending `stop` (`:27-30`); the Chromium blur release; a sub-second press sending nothing and a full hold sending exactly one stop, and single-tap when Safe Mode is off (`e2e/safe-mode.spec.ts:124`); the CSS checks at `test/safe-mode.test.ts:328-351`. Do not use `setHolding` in the effect body: `react-hooks/set-state-in-effect` fails `pnpm lint`.
- **Failure of the fix:** if the guard flips off and on within one React batch, `wasGuarded` never differs and `holding` is not reset. The effect deps do not change in that case either, so the timer keeps running and the fill stays truthful.
- **Do not touch:** the mid-press branch switch that sends `stop` on release after Safe Mode turns off (Reviewed and Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-2/repro/pause-stale-hold.spec.ts e2e/ && pnpm build && pnpm exec playwright test e2e/pause-stale-hold.spec.ts --workers=1; rm e2e/pause-stale-hold.spec.ts`. The repro passes while the bug is present (it asserts `toMatch(/holding/)` at `:89` and a full fill transform). After the fix it must fail there. Invert those assertions (no `holding` class, fill `scaleX(0)`) and land it as a regression test in `e2e/safe-mode.spec.ts`.

### 4. Timeline Pause copies Setlist Stop's hold wiring, and the two copies have already drifted (LOW)
- **Location:** `web/src/TimelinePauseButton.tsx:18-91` against `web/src/StopButton.tsx:8-58`
- **Attribution:** introduced in `cfca492` (`nearest-in-repo-precedent`, `leave-the-code-better`).
- **Real-world trigger:** maintenance only. A fix to one hold button (Finding 3, iPad callout handling, key handling) silently misses the other.

**Evidence:** The `holding` state, the `hold` ref, the `createHold` effect, `press`/`release`, `isHoldKey`, the four pointer handlers, the key handlers, `onBlur` and `onContextMenu` are line-for-line copies. They have drifted already: StopButton's effect depends only on `send`, while TimelinePauseButton's also releases on `!safeMode || !available`.

**Recommended fix:** Extract a `useHold(enabled: boolean, onComplete: () => void)` hook beside `createHold` in `web/src/hold.ts`. It owns `holding`, the effect, the Finding 3 reset, and returns `{ holding, handlers }` to spread on the button. StopButton calls it with `enabled = true`, which keeps its current behaviour of not releasing on `available`. TimelinePauseButton calls it with `enabled = safeMode && available`.

**Remediation brief**
- **Design intent:** a hold button sends its command only after `STOP_HOLD_MS` of continuous press by mouse, touch or Space/Enter. Releasing, sliding off, cancelling or blurring empties it. The iPad callout is suppressed.
- **Full surface:** `web/src/hold.ts`, `web/src/StopButton.tsx`, `web/src/TimelinePauseButton.tsx`.
- **Must preserve:** StopButton's exact behaviour, including not releasing when `available` flips (pinned by `test/hold-to-stop.test.ts` and `test/pages.test.ts` Stop checks); everything listed under Finding 3's Must preserve. Remediate after Finding 3, so its regression test guards the move.
- **Do not touch:** StopButton's `available`-independent effect. Changing it is a behaviour change nobody asked for.
- **Proof:** `pnpm vitest run test/hold-to-stop.test.ts test/safe-mode.test.ts test/pages.test.ts --maxWorkers=2` and `pnpm build && pnpm exec playwright test e2e/safe-mode.spec.ts --workers=1` stay green; `pnpm lint` passes.

### 5. The guard's "active song" rule is written three times, and SongHeading defaults a fourth that ignores the count-in (LOW)
- **Location:** `src/server/playback-controller.ts:305`, `web/src/App.tsx:260`, `web/src/TimelineView.tsx:38`, `web/src/SongHeading.tsx:26-27,37-38`
- **Attribution:** introduced in `cfca492` (`leave-the-code-better`, `nearest-in-repo-precedent`).
- **Real-world trigger:** maintenance. A change to the rule (say, the start-from-stopped window in NFI A) applied to the server but not the pages lets the UI offer a tap the server refuses, or grey out one it would accept. SongHeading's optional props mean a future caller that forgets them gets `now?.song` with no count-in handling and `safeMode = true`, with no type error.

**Evidence**
```ts
const activeSong = () => (countIn && waitingJump ? waitingJump.song : now(position)?.song ?? null); // server
const activeSong = countIn && jump ? jump.song : now?.song ?? null;                                    // App, TimelineView
  safeMode = true,
  activeSong = now?.song ?? null,                                                                     // SongHeading defaults
```
The only `SongHeading` caller (`web/src/App.tsx:348`) passes both props, so the defaults are dead code.

**Recommended fix:** Add `export const activeSong = (countIn: boolean, jump: JumpTarget | null, now: NowPlaying | null): number | null => (countIn && jump ? jump.song : now?.song ?? null);` to a `src/shared/` module (for example beside `PlaybackState` in `src/shared/snapshot.ts`, or a new `src/shared/safe-mode.ts`). Call it from the server as `activeSong(countIn !== null, waitingJump, now(position))`, and from App and TimelineView with the snapshot's fields. Make `safeMode` and `activeSong` required props on SongHeading, with no defaults.

**Remediation brief**
- **Design intent:** the pages grey out exactly what the server refuses, so both must compute "the song Live is in, or the held count-in's song" from the same function over the same published fields (`snapshot.jump` is the server's `waitingJump`, `snapshot.countIn` is `countIn !== null`).
- **Full surface:** the four locations above; `web/src/App.tsx:356` (the prop it passes).
- **Must preserve:** the server's `refuses()` semantics at `playback-controller.ts:311-316` unchanged; `test/safe-mode.test.ts:296` and `:311`; `pnpm typecheck`.
- **Proof:** `pnpm typecheck && pnpm vitest run test/safe-mode.test.ts test/pages.test.ts test/timeline.test.ts --maxWorkers=2`.

### 6. Five smaller weaknesses in the new and edited tests (LOW, aggregated)
- **Location and attribution:** all introduced in `cfca492`.
- **a. The malformed-payload check is vacuous**, `test/safe-mode.test.ts:54-56`. `enabled: 'no'` is sent while Safe Mode is already `true`, so a `parseCommand` that coerced `Boolean('no')` would leave it true too (mutation survives). It also reads `viewer.received` after flushing only the leader. Fix: send `enabled: 'yes'` while Safe Mode is `false` (it must stay false), then send `enabled: 0` while `true`. After each, use a barrier as in Finding 2 and read the leader's snapshot.
- **b. The Timeline client guard is asserted only as markup**, `test/safe-mode.test.ts:311-326` and `e2e/safe-mode.spec.ts:104-106`. Removing the `if (!safeGuarded)` in `TimelineView.tsx:397` passes both, because the server refuses the jump anyway (mutation survives). Fix: in the e2e test, record outgoing WebSocket frames (`page.on('websocket', ws => ws.on('framesent', ...))`) and assert the force-click sends no `jump` frame.
- **c. The one-second hold is bounded only to (300 ms, 1200 ms]**, `e2e/safe-mode.spec.ts:139-151`. A 500 ms hold passes. Fix: add a ~900 ms press-and-release asserting no STOP, beside the 300 ms one.
- **d. A tautology**, `test/safe-mode.test.ts:353-355` (`const _: PageCommand = {...}; expect(_.kind).toBe('set-safe-mode')`) and its comment, "Suppress unused import lint". Delete both, and the `PageCommand` import if nothing else uses it. In the same test, `:335` `toContain('Pause')` also matches the hold markup, so it shows nothing: drop it.
- **e. `test/eos.test.ts:229`'s shared `jump()` helper turns Safe Mode off for every caller**, including the same-song lighting tests (for example "fire nothing for a jump inside the song onto its song-start section"), so those never run in the realistic default. Fix: send the toggle only from the cross-song callers, or only when `song` differs from the playhead's song.
- **Must preserve:** every assertion these tests make today that is not named above; the 11 needed `set-safe-mode false` insertions elsewhere.
- **Proof:** `pnpm vitest run test/safe-mode.test.ts test/eos.test.ts --maxWorkers=2` and `pnpm build && pnpm exec playwright test e2e/safe-mode.spec.ts --workers=1`. For (a) and (b), the named mutation must now go red.

### 7. Comment hygiene (LOW, aggregated)
- `web/src/App.tsx:259`: "The song currently playing, or the held count-in's song, matching the server's Safe Mode guard." → "The song currently playing, or the held count-in's song, as the server's Safe Mode guard takes it. The server also lets Play from start through while a Stop waits for Live's report, which no snapshot shows, so the page greys it out until that report." (Moot if Finding 5 lands, in which case the comment goes with the inline formula.)

## Needs Further Investigation

### A. Right after a start from stopped, the guard may point at the song Live just left
`startFromTop` (Play from start, or a count-in to the top of a song) does not move `position`. If Live reports `playing: true` before the position report for the jump, then for that window `activeSong()` is still the old song. Taps in the song that just started are refused, and a tap back into the old song is accepted while playing. A controller-level probe confirmed this ordering gives that result (`refuses jump(2,1) = true`, `refuses jump(1,1) = false`). The pages mirror it. **Confirm or kill:** capture AbletonOSC's report order on a real Live for `jump` then `start_playing` from stopped. If `current_song_time` always reports first (the preamble of `test/play-from-start-window.test.ts` says reports follow commands in order), the window cannot happen. If not, `activeSong` should prefer the started song until a position report lands, through the shared helper from Finding 5.

### B. The count-in branch of `activeSong()` may be untestable as written
Mutation `activeSong = () => now(position)?.song ?? null` survives `test/safe-mode.test.ts`, `test/count-in.test.ts` and `test/count-in-change.test.ts`. The count-in's Count Off is a section of its target song, so once its position report lands, `now(position)` already names the target. The branch differs only in the report-ordering window from A. **Confirm or kill:** see whether the fake Live (`src/fake-live/fake-live.ts`: `holdReplies`, `releaseReplies`, `loseNext`) can deliver the playing report before the position report. If it can, add that test. If not, the test name at `test/safe-mode.test.ts:129` ("during a held count-in") claims more than its fixture can distinguish, and should say so.

### C. Stale hold state on a real iPad when Live stops mid-press
Playwright's mouse input delivers pointerup and blur to the disabled button. Real iOS touch on a `disabled` button was not tested. **Confirm:** on the iPad, start holding Timeline Pause, stop Live from another page, lift, start Live, and look at the Pause fill. If it fills, Finding 3's fix covers it as well.

## Reviewed and Dismissed
- **Server and controller `refuses()` disagreeing:** both read the same controller state, and `cues.command` and `connections.cancel` do not mutate it, so the two calls agree by construction.
- **Guard order against `live !== 'connected'`:** the server checks `refuses` before the connection check. A disconnect sets `playing = false` (`playback-controller.ts:685`), so `refuses` returns false and the controller's connection check decides, as before.
- **Count-in before Live reports playing:** `playing` is false, so a cross-song tap is accepted as an ordinary jump and ends the count-in. That matches "any jump works while stopped". After the playing report, the held count-in's song is the active song.
- **Gap between songs, before the first song, and unknown position refuse every jump:** intended behaviour, decided by Nick on 2026-11-25 (Q1). The branch chose it on purpose and names it in the test at `test/safe-mode.test.ts:129`. With no song playing, every song is "another song", and the pages grey out the same taps, so nothing is refused silently. The acceptance criteria speak only of "cross-song" and "same-song" jumps and say nothing about states with no current song. An End reached on "stop" stops Live, and one on "continue" flows into the next song's first locator, so the window mostly arises before the first song or after a song set to continue across a gap. Do not change it.
- **A jump during a pending Stop is refused, while Play from start is exempt:** by design (`playback-controller.ts:307-310`). Play from start then starts Live from stopped. The window is at most `LOOP_REPORT_MS` (1 s), and the pages grey out both because the snapshot still says playing.
- **Pages stricter than the server for Play from start during a pending Stop:** the window lasts until Live's stop report, and the server is the authority. Only the App comment overstates it (Finding 7).
- **Turning Safe Mode on leaves a cross-song jump already waiting:** the guard judges commands, not jumps already made with Safe Mode off. The jump lands within a bar, as the leader asked. Executed in a scratch rig probe at `cfca492`: playing at beat 10 in song 1, Safe Mode off, jump to song 2 Intro, Safe Mode on. The snapshot still shows `jump={"song":2,"section":0}` and Live holds cue 4. Then Next makes Live receive cue 2, the snapshot shows `jump={"song":1,"section":2}`, and the playhead lands in song 1 Verse. So Next and Previous count from the playhead's song (`playback-controller.ts:908`), not from the waiting jump, and they *withdraw* the cross-song jump. **Do not clear `waitingJump` in `case 'set-safe-mode'`:** `jumpTo` already sent the jump to Live (`playback-controller.ts:481`), and Live has no OSC command to withdraw a queued cue jump (epic #1). Clearing it would hide a jump that still lands on the bar line. Withdrawing a waiting jump is #3's Cancel. See the #3 note below.
- **Timeline Pause sending `stop` on release after Safe Mode turns off mid-press:** React reuses the same `<button>`, so the release is a tap under Safe Mode off, which is the off-mode semantics. Not a bypass.
- **Setlist view's section taps are not Safe-Mode-gated:** `web/src/JumpTargets.tsx` shows only the current song's sections, so it offers no cross-song tap. Play from start per song is gated (`SongHeading.tsx:42`).
- **Previous song / Next song are stopped-only in the UI alone:** pre-existing and untouched (`SongStepButton.tsx:34`, unchanged since `adee302`). They send an ordinary `{ kind: 'jump', section: 0 }` (`SongStepButton.tsx:41`), so the server cannot tell them from a cross-song tap. AC3 reads "refused/disabled", and disabled meets it. A server refusal would also have to refuse every cross-song jump to a section 0 while Safe Mode is off, which AC2 requires to work. Server-side enforcement would need its own command kind, which is out of scope for #2 and could be a follow-up ticket if Nick wants it. `test/pages.test.ts:1151` covers the enabled-when-stopped half, so the disabled-only check at `test/safe-mode.test.ts:284` is a legitimate non-regression test.
- **Viewer and malformed toggles:** `hub.ts:55` drops every command from non-controlling roles, and `parseCommand` requires a boolean `enabled`. Only the test for it is weak (Finding 6a).
- **Retargeted existing tests:** `test/loop.test.ts:117`: the playhead is at 53 in song 1's Bridge, with Next waiting on song 1's End, and the new target song 1 Intro is not the playing section, so there is no restart path. A mutation of the loop logic turned this test and its neighbour red. `test/transport.test.ts:489`: the jump to song 1 Intro at beat 21 is still a waiting jump that Stop clears. `test/transport.test.ts:509`: still a pure barrier. None lost meaning.
- **Inserted `set-safe-mode false` lines:** removing them turns 11 tests red, so they are needed. None lets an extra snapshot satisfy a later wait early, and the `barrier()` helpers insert it after the behaviour under test. The cross-song tests in `test/jump.test.ts` and `test/count-in-change.test.ts:508,530` now run with Safe Mode off, which is expected; the on-state is `test/safe-mode.test.ts`'s job (Finding 2).
- **Em-dashes in shipped copy:** none in the added UI strings or CSS.

## Minor / nits
- **Q1 and Q2 are decided** (see Approach decisions). The refusal with no current song stays, and so does the single-tap Safe Mode toggle.
- `SafeModeToggle` carries its state in both its accessible name ("Safe Mode: On") and `aria-pressed`, so assistive tech announces it twice.
- Guarded Timeline blocks stay focusable with `aria-disabled` and dim to 0.72 opacity, with no text saying why a tap does nothing.
- `refuses()` returns `false` for any command kind it does not name. An exhaustive `switch` with a `never` default would force #3 to decide for its new kinds.

## Test quality
Tests added: 11 rig and markup tests in `test/safe-mode.test.ts`, 3 Playwright tests in `e2e/safe-mode.spec.ts`, and Safe Mode steps in 2 existing `e2e/timeline.spec.ts` tests. Against `$BASE` `adee302`, every new test is red except `test/safe-mode.test.ts:284`, a legitimate non-regression test. Tautology shapes found: absence asserted right after `flush()` (Finding 2), markup instead of effect for the Timeline guard (6b), one pure tautology (6d), one vacuous negative check (6a). Mutation survivors are listed in the verification table; each maps to Finding 1, 2, 6a, 6b, 6c, or NFI B. The 18 edited existing tests kept their meaning.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck` and `pnpm vitest run` all green (102 of 102 files on a quiet rerun). The two touched Playwright specs are green in both projects.
- **Commit hygiene:** the branch is one commit. This review folder (`docs/reviews/setlist-controller-2/`, the doc plus `repro/pause-stale-hold.spec.ts`) is untracked. Commit it as `setlist-controller#2 pre-PR review 1`, or keep it out of the PR.
- **Likely reviewer asks:** "Where is the test that a refused tap leaves ProPresenter's schedule alone?" (Finding 1). "Does the gap test prove anything?" (Finding 2).
- **Notes for #3 (Jump now and Cancel), nothing blocking:**
  - The server.ts guard placement suits #3. `refuses` sits inside the controller and can read `waitingJump`, so a `jump-now` that carries no song can still be judged.
  - `refuses()` lets any unnamed kind through, so #3 must decide explicitly whether Jump now on a cross-song waiting jump (made while Safe Mode was off, then Safe Mode turned on) is refused, because it would otherwise land unquantized.
  - Cancel on a held count-in is unaffected.
  - #3's Jump now will need the same active-song rule as the pages, which Finding 5's shared helper provides.

## Second opinion
An independent review of #2, run in a separate thread, folded in 2026-11-25. Each item was treated as a new candidate and run through the disprove step.

| # | Their claim | Their rating | Verdict here |
| --- | --- | --- | --- |
| 1 | Nothing pins `server.ts:268`; a refused jump reaching `cues.command` or `connections.cancel()` would drop the targets' scheduled lead slides | MEDIUM, test gap | **Confirmed, agree.** This is Finding 1 (mutation: deleting the line leaves 374 tests green). Brief unchanged. |
| 2 | Turning Safe Mode on does not clear a cross-song `waitingJump` queued while it was off; Next and Previous then step inside that song, because `refuses` only checks `jump` and `play-from-start`; clear it in `case 'set-safe-mode'` | LOW | **Dismissed** (Reviewed and Dismissed, "Turning Safe Mode on leaves a cross-song jump already waiting"). The first half is true: the jump stays and lands within a bar. The second half is false by execution: Next counts from the playhead's song and replaced the waiting song 2 jump with song 1 Verse. The suggested fix is harmful, because Live already holds the jump and cannot withdraw it, so clearing `waitingJump` would hide a jump that still lands. |
| 3 | `activeSong` is null before the first song, in gaps and on an End; while playing there every jump is refused, even into the song about to start | LOW | **Not a defect; decided by Nick (Q1): keep the refusal.** The acceptance criteria are silent on states with no current song. The behaviour is deliberate, tested by name, and mirrored by the pages. "On an End" mostly does not arise while playing: "stop" stops Live, and "continue" flows into the next song's first locator. |
| 4 | Previous song and Next song are stopped-only on the page only; with Safe Mode off the server cannot tell them from any cross-song jump (AC3 says "refused") | LOW | **Dismissed** (pre-existing, untouched). AC3 reads "refused/disabled", and disabled meets it. A server refusal would break AC2's "with Safe Mode off, cross-song jumps work while playing" unless the buttons got their own command kind. That is a possible follow-up, not a #2 defect. |
| 5 | Safe Mode off is a single tap (`SafeModeToggle.tsx:22`); consider a hold | LOW, UX | **Not a defect; decided by Nick (Q2): keep the single tap.** The spec says only "toggle". |
| n/a | Role boundaries correct: viewer messages are dropped before parse, and the payload check requires a boolean | n/a | **Agree** (Reviewed and Dismissed, "Viewer and malformed toggles"). The *test* of the malformed payload is vacuous (Finding 6a), which they did not raise. |

- **DISAGREE, item 2:** LOW finding → Dismissed. The claim that Next and Previous step inside the waiting jump's song was disproved by a rig probe (Live received cue 2, and the playhead landed in song 1 Verse). The recommended fix would desync the controller from Live, which already holds the jump.
- **DISAGREE, item 3:** LOW finding → decided as intended (Q1). The spec is silent, the branch's choice is deliberate and consistent across server and pages, and refusing errs on the safe side.
- **DISAGREE, item 4:** LOW finding → Dismissed. It is pre-existing and untouched, AC3 is met by "disabled", and the server-side version conflicts with AC2.
- **DISAGREE, item 5:** LOW finding → decided as intended (Q2). It is not a defect against the spec as written.
- **No change** to the severities or briefs of Findings 1 to 7. Finding 2's brief pins the gap refusal as intended behaviour, per Nick's Q1 decision.

## Remediation scope
Nick, 2026-11-25: remediate **all** Confirmed findings, 1 through 7, in one `/pr-review-remediate` pass. **Finding 4 comes after Finding 3**, so Finding 3's Pause regression test guards the move into the shared hold hook. Needs Further Investigation A to C, every Reviewed and Dismissed item, and the Minor / nits are out of scope.

## Verdict
**Ready to open the PR once Findings 1 and 2 are fixed.** The second opinion adds no gating finding. Nick decided Q1 and Q2 on 2026-11-25: keep both behaviours as built, so neither needs a code change. Findings 1 and 2 are test-only changes, and the acceptance criteria ask for rig tests that cover each case, which the server-level guard and the gap refusal do not yet have. Findings 3 to 7 are LOW. They can ride in the same remediation pass or follow as a ticket; Finding 4 should come after Finding 3. NFI A to C need a real Live or iPad to settle and do not gate the PR. No prior review findings were claimed by this branch.

## Remediation, 2026-11-25
Base of the round: HEAD `cfca492`. Final HEAD: `289a970`. Scope per the Remediation scope note: all seven Confirmed findings, Finding 4 after Finding 3. Q1 and Q2 behaviours untouched.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `98311c9` nothing tested that a refused command leaves the targets' schedules alone | red→green: new rig test in `test/safe-mode.test.ts` ("keeps the slide change a target with a lead has scheduled..."), red with `server.ts`'s `if (controller.refuses(command)) return;` deleted, green restored; `pnpm vitest run test/safe-mode.test.ts --maxWorkers=2` | 0 new; the 5-line comment above `command()` rewritten per the brief | proved by execution |
| 2 (MEDIUM) | `0c23d8e` the refusal checks read Live's inbox straight after flush | red→green: the brief's gap mutation in `refuses()` turns the gap test red (`expected { song: 2, section: 0 } to be null`), green reverted | 3 (the barrier's ordering constraint, 1 sentence over 3 lines); 2 rewritten in `e2e/safe-mode.spec.ts` | proved by execution |
| 3 (LOW) | `28fbfed` Timeline Pause showed a full hold bar with nobody pressing | red→green: the inverted repro landed in `e2e/safe-mode.spec.ts` ("Timeline Pause empties its hold bar...") was red in both projects before the fix, green after; the preserved `repro/pause-stale-hold.spec.ts` now fails at `:89` in both, as predicted | 1 (why separate browser contexts) | proved by execution |
| 4 (LOW) | `2866d54` Timeline Pause copied Setlist Stop's hold wiring | refactor, nothing to turn red: `test/hold-to-stop.test.ts`, `test/safe-mode.test.ts`, `test/pages.test.ts` green; e2e `safe-mode`, `stop`, `timeline` 24/24 in both projects; `pnpm lint` clean | 2 (onComplete identity constraint); 1 moved (iPad callout) | fixed (disprove agent) |
| 5 (LOW) | `289a970` the guard's active song rule was written three times | refactor: `pnpm typecheck` and `pnpm vitest run test/safe-mode.test.ts test/pages.test.ts test/timeline.test.ts --maxWorkers=2` green (246) | 3 (the shared helper's header, moved from the controller and extended) | fixed (disprove agent) |
| 6 (LOW, aggregated) | `17791be` five weak spots in the Safe Mode tests | (a) a `Boolean(enabled)` parser now goes red; (b) dropping `TimelineView`'s `if (!safeGuarded)` now goes red in both projects; (c) `STOP_HOLD_MS = 500` now goes red at the 900 ms press in both projects; (d) deleted; (e) `test/eos.test.ts` green with Safe Mode on for same-song jumps | 2 new (why `'yes'` and `0`); 2 rewritten | proved by execution |
| 7 (LOW, comment hygiene) | closed by `289a970` | the comment went with App's inline formula, as the finding's moot clause allows | 0 | n/a |

Surface the briefs missed, found in step 1: Finding 5's required SongHeading props reach `test/pages.test.ts:825`, `:858` (shared `props`, also used at `:910`) and `:1113`, which relied on the defaults. Each now passes the values the defaults gave. Finding 2's barrier had to wait only among snapshots received after it sent: `Client.snapshot()` searches every snapshot received, so a second flip back to `stop` resolved on an old snapshot.

Round checks at `289a970`: `pnpm lint` clean; `pnpm typecheck` clean; `pnpm vitest run --maxWorkers=2` 102 of 102 files, 3,297 passed, 4 skipped; after `pnpm build`, `pnpm exec playwright test e2e/safe-mode.spec.ts e2e/timeline.spec.ts e2e/stop.spec.ts e2e/count-in.spec.ts e2e/producer.spec.ts e2e/view-only.spec.ts e2e/now-playing.spec.ts --workers=1` 54 passed in `webkit-ipad` and `chromium-android`. `check:private`: the branch predates `scripts/check-private-terms.mjs`, so `main`'s copy was run from outside the tree, with the private list present: `--range adee302..HEAD` and the tree both exit 0.

### Known regressions, deferred
None. The disprove pass reported no introduced defects.

### Rework briefs
None. No fix was half-fixed or introduced a defect.

### Notes from the verify pass, for the next round
- **LOW, fragility, inferred not executed:** `web/src/hold.ts` `useHold` is correct only while every caller passes a stable `onComplete`. An inline arrow would rebuild the hold on each render and drop a press under way. Both callers use `useCallback`, and the hook's comment states the constraint. A ref-backed callback, or `useEffectEvent`, with deps `[enabled]` would remove it; check that against `react-hooks/refs` before choosing.
- **LOW, test gap:** `src/shared/safe-mode.ts` `activeSong` has no direct unit test of its count-in half. This is the same gap as Needs Further Investigation B.
- **Unverified, pre-existing and untouched:** the transport row's Play from start (`web/src/App.tsx:331`, unchanged since `adee302`) does not consult Safe Mode. It always targets the playhead's song, so it is same-song except in the report-ordering window of Needs Further Investigation A and B.

## Approach decisions, added in remediation 1
- **A target with a lead in a rig test:** spread `fakeTarget(...)` and add `lead` and `plan` in the test, then drive the server's manual clock with `rig.advanceConnected`. Precedent: the ProPresenter `leadRig` in `test/propresenter.test.ts`.
- **The refusal barrier:** an accepted flip of song 2's end toggle, waited for only among snapshots received after it was sent (`received.indexOf(s) >= from`). Precedent: the index guards in `test/safe-mode.test.ts`'s first test, and the barrier helpers in `test/transport.test.ts` and `test/count-in-change.test.ts`.
- **Asserting a page sent nothing:** record `framesent` on the page's WebSocket and count the command kinds after the action.
- **Hold buttons:** `useHold(enabled, onComplete)` in `web/src/hold.ts`, with the caller's `onComplete` wrapped in `useCallback` on `send`, so the effect reruns on the same changes as before.
- **The active song rule:** `activeSong(countIn, jump, now)` in `src/shared/safe-mode.ts`, beside the `count-in.ts` precedent.
