# Pre-PR review: setlist-controller#113 Connections: the producer role and cues that follow playback

**Branch:** `setlist-controller-113-connections-foundation` vs `origin/main` (merge-base `2aa6d25` "setlist-controller#107 fade out keeps Live playing, and the music comes back by Fade in or on the next Count Off")
**Reviewed at:** HEAD `2311b92` (setlist-controller#118 Fire again and each target's manual buttons on the producer page), clean tree: 0 files with uncommitted changes, 0 untracked; 48 files total, +3887 / -185 against the merge-base
**Reviewed against:** the epic body of setlist-controller#113 (Solution, user stories 1 to 47, Implementation and Testing Decisions), the bodies and acceptance criteria of its seven sub-issues #116 to #122, and the per-ticket assumptions and proposals the run recorded. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules (load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape) are the conformance checklist. Round 1, `--fresh`.
**Date:** 2026-10-21
**Reviewer:** 3 code-review agents + verify pass

This is the first review of the integrated epic. Each of the seven tickets was reviewed alone in its lane; this review looks at the merged whole, and mostly at the seams between the lanes.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 41 files, 806 passed, 4 skipped (the four `it.runIf(process.platform === 'linux')` laptop-refusal cases in `test/setup-screen.test.ts`, which run in CI only; two of them are the new producer-QR and connections-route refusals) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 42 passed, no retries |
| New tests against `$BASE` | scratch worktree at `2aa6d25`, the branch's new and modified test files copied in, run there | every test the branch adds is red at base (82 failed). The 8 green are tests that already existed (`test/server.test.ts`, `test/setup-screen.test.ts`) |
| Finding 1 (adapter throws) | `repro/review-1-adapter-throws.test.ts` run in a scratch copy of the tree | red: vitest reports `ADAPTER CUE BOOM` as an uncaught exception three times; the good target got no Verse cue, and the producer never saw position 16 |
| Finding 2 (loop brace end) | `repro/review-1-loop-brace-end.test.ts` run in a scratch copy | red on both cases: mid-song `['Chorus played-into', 'Verse loop']` for `['Verse loop']`; overlap: a fade-paused target re-armed, then got song 2's Count Off `played-into` and song 1's Chorus `loop` |
| Findings 5 and 6 (adapter stop and start) | `repro/review-1-adapter-stop-start.test.ts` run in a scratch copy | red: close rejects with `ADAPTER STOP BOOM`; `startRig` still pending after 3 s |
| Recommended fixes 1, 2, 5, 6 | applied together in the scratch copy, then `tsc` and the whole unit suite plus the three repros | tsc clean; 44 files, 812 passed, 4 skipped: every existing test stays green and all six repro cases go green |
| Finding 4 (hub dedupe) | `repro/review-1-mutation-hub-dedupe-by-producer.diff` applied in a scratch copy, whole unit suite | survives: 806 passed |
| Finding 7 (page role guard) | `repro/review-1-mutation-page-no-role-guard.diff` applied with the hub mutant, whole unit suite | survives: 806 passed |
| Hub mutants the suite does kill | finder agent, scratch copy: dedupe removed entirely; a leader allowed to send connection commands | both killed |
| Producer socket against malformed input | finder agent probe on the real rig: `not json`, `null`, `[]`, `42`, `{"kind":"arm"}`, `{"kind":"arm","target":5}`, a run-button with no button, unknown targets including `__proto__` and `constructor`, a leader's and a viewer's Arm | no crash, socket stays open, each ignored; a valid producer Arm afterwards works and reaches the producer alone |
| Pages | `pnpm exec vitest run test/pages.test.ts` | 85/85 |
| Real Live | not run: the guardrails forbid driving Live, and no target exists to run against | whether Live ever reports a position on a loop's brace end is unconfirmed (finding 2's cap) |
| Real target adapters | not run: none exists (`TARGET_KINDS = {}` in `src/server/main.ts`) | findings 1, 5 and 6 are proved with a fake adapter only |

**Overall:** The producer role, the per-role snapshot, the config file, the pre-service check and the pause rules hold, and the merged lanes agree with each other: every arm and pause transition, the delivery rule, the producer-only commands, the laptop-only routes and the trigger order (cue before publish, `countOff` before the same report's cue) checked out. Two defects matter before the PR: an adapter that throws takes the whole server down, which breaks the epic's own promise that a target never stops the music, and a loop wrap that Live reports on the brace's end sends the targets a wrong cue and can bring back a target a Fade out paused. One spec item, the target's read-only row state, was never built by any ticket and needs a decision. The rest is test gaps and small hardening.

## Approach decisions
- Adapter calls: every call the foundation makes into a target (`start`, `stop`, `cue`, `runButton`, `check`) is guarded per target, logged with `Setlist server: the connection target <name> ...`, and never stops the server or another target. Precedent: `start()` and `runCheck` in `src/server/connections.ts:100-113` and `:147-157`.
- Brace end: a report on a loop's brace end while playing is the loop going round, never a move into the next section. Precedent: the controller's `reachedEnd` (`src/server/playback-controller.ts:358-361`) and the cue module's own `bracesEnd` guard on End (`src/server/cues.ts:231`, `:245-247`).
- Target start: the server does not wait on any target. `startServer` starts the targets and returns; each target reports its status when it can. Precedent: the epic's "Playback never waits on a target", and the `TargetReport.status` channel #121 chose so the foundation never waits on or polls a target.
- Carried forward from the lanes and not overturned here: the arm and pause rules and the `musicBack` word (#122 review pass 1), Fire again on `state.now` whatever `playing` (#118), the check triggers and the late-answer counter (#119), the config file's soft failure (#120), the cue causes and the `startWaiting` rule (#117).
- Remediation 1, adapter guard shape: one `safely(entry, what, call)` in `src/server/connections.ts` wraps `cue` and `runButton`, catching a synchronous throw and a rejected native promise (an `async` method satisfies a `void` return), logging `Setlist server: the connection target <name> could not <what>`. Precedent: `start()` and `runCheck`.
- Remediation 1, brace-end guard and jumps: the guard in `onBraceEnd` (`src/server/cues.ts`) steps aside only for a jump that lands on this report, meaning the playhead moved and the waiting jump's target is the section the report is in, or a jump to End. Any other waiting jump keeps the guard (a jump anywhere but the looped section turns the loop off first, `leaveLoopFor`). Precedent: the cue module's own `landedOnSection` in `moved`.
- Remediation 1, the target's read-only state: built, not deferred, as an opaque `string[]` through `TargetReport.state(lines | null)`, copied on the way in and out, ignored while the target is offline, cleared when it goes offline, part of the `set()` change detector, rendered read-only under the check on the producer row only (not on the setup screen). Precedent: the pre-service check's offline rules and the declared buttons (story 46).

## Confirmed Issues

### 1. A target adapter that throws from a cue, Fire again or a button run crashes the server — MEDIUM
- **Location:** `src/server/connections.ts:191` (`deliver`), `:173` (Fire again), `:177` (button run)
- **Attribution:** introduced. `src/server/connections.ts` is new on this branch (#121 added `deliver`, #118 added Fire again and the button run). The lane proposal "Guard the connection layer against an adapter that throws on cue or on a button run" (#118) named it and nothing on the branch acted on it.
- **Real-world trigger:** none today, since production registers no target kind. It becomes reachable the moment a target epic (#84 ProPresenter, #108 Eos, #114 ATEM) registers a kind whose `cue` or `runButton` throws: a socket written after it closed, a malformed reply parsed in the call, any adapter bug. The user path then is the leader playing into a section with that target armed, or the producer pressing Fire again or a manual button. MEDIUM, capped: upgrade to HIGH once `TARGET_KINDS` in `src/server/main.ts` registers any kind, check via `grep -n "TARGET_KINDS" src/server/main.ts`.

**Evidence**
```ts
      for (const { target, connection, arm } of entries) {
        if (arm === 'armed' && connection === 'online') target.cue(cue);
      }
...
          if (cue) entry.target.cue(cue);
...
          if (entry.connection === 'online' && entry.target.buttons.some(({ id }) => id === command.button)) entry.target.runButton(command.button);
```

**Failure mode** — `deliver` runs inside the controller's `onChange` (`src/server/server.ts:97-104`), which runs inside the bridge's OSC message handler. A throw there escapes every frame up to `live-bridge.ts`'s `socket.on('message')`, an uncaught exception, and `src/` installs no `uncaughtException` handler, so Node exits mid-set. Before it exits, the targets after the throwing one in row order get no cue, and the pages never get the change (`publish()` is skipped). Fire again and the button run throw out of the hub's WebSocket message handler the same way. Executed: `repro/review-1-adapter-throws.test.ts`, two targets armed, the first one's `cue` throws, the playhead moved into the Verse: vitest reports the uncaught `ADAPTER CUE BOOM`, the good target's cues are `[]`, and the producer never sees position 16; the Fire again case leaves the server not answering.

**Recommended fix**
```diff
--- a/src/server/connections.ts
+++ b/src/server/connections.ts
@@ -122,6 +122,16 @@
   // A change by hand pauses an armed target, and one a Fade out paused, so the next Count Off does
   // not take over behind the operator. A disarmed target has nothing to stop.
+  const safely = (entry: Entry, what: string, call: () => unknown) => {
+    const failed = (error: unknown) => console.error(`Setlist server: the connection target ${entry.target.name} could not ${what}`, error);
+    try {
+      const result = call();
+      if (result instanceof Promise) result.catch(failed);
+    } catch (error) {
+      failed(error);
+    }
+  };
   const changedByHand = (entry: Entry) => {
@@ -170,11 +180,11 @@
         case 'fire-again': {
           const cue = entry.connection === 'online' ? current() : null;
-          if (cue) entry.target.cue(cue);
+          if (cue) safely(entry, 'take a cue', () => entry.target.cue(cue));
           break;
         }
         case 'run-button':
-          if (entry.connection === 'online' && entry.target.buttons.some(({ id }) => id === command.button)) entry.target.runButton(command.button);
+          if (entry.connection === 'online' && entry.target.buttons.some(({ id }) => id === command.button)) safely(entry, 'run a button', () => entry.target.runButton(command.button));
           break;
@@ -187,8 +197,8 @@
         musicBack = false;
       }
-      for (const { target, connection, arm } of entries) {
-        if (arm === 'armed' && connection === 'online') target.cue(cue);
+      for (const entry of entries) {
+        if (entry.arm === 'armed' && entry.connection === 'online') safely(entry, 'take a cue', () => entry.target.cue(cue));
       }
```
Move the existing two-line comment above `changedByHand` so it stays directly above `changedByHand`, not above `safely`.

**Remediation brief**
- **Design intent:** the connection layer sits between the playback controller and the targets, and playback must never wait on or fail because of a target (epic Solution, story 10). Every call into an adapter is a foreign call: the foundation catches it per target, logs it, and carries on with the next target and with the publish. The arm state is untouched by a failure; a target that throws stays armed and gets the next cue.
- **Full surface:** `src/server/connections.ts:173`, `:177`, `:190-192`. The other adapter calls are already guarded (`start` at `:147-157`, `check` in `runCheck` at `:100-113`) or belong to finding 5 (`stop` at `:158-160`). `target.buttons` is read as a property at `:142` and `:177` and needs no guard. `Target.cue` and `Target.runButton` in `src/server/target.ts:33` and `:39` return `void`, but TypeScript accepts an `async` method there, which is why `safely` also catches a returned promise.
- **Must preserve:** the delivery order (the re-arm at a music-back Count Off happens before any target is cued, `:184-189`); delivery only when armed and online; Fire again and the button run acting whatever the arm state and never changing it; an unknown button id ignored before the call. Pinned by `test/connections.test.ts`, `test/manual-controls.test.ts`, `test/pause-rules.test.ts`, `test/cue-causes.test.ts`.
- **Do not touch:** the `musicBack` rule in `deliver` (Dismissed: "Count Off inside the song playing").
- **Proof:** `cp docs/reviews/setlist-controller-113/repro/review-1-adapter-throws.test.ts test/ && pnpm exec vitest run test/review-1-adapter-throws.test.ts` is red now (uncaught `ADAPTER CUE BOOM`) and green after the fix. Keep its two cases as a test file of the suite, or fold them into `test/manual-controls.test.ts` and `test/connections.test.ts`; add a third case with an `async` `cue` that rejects, which must log and leave the next target cued. The failure of the fix itself: when `console.error` is the only trace, the producer sees nothing. That is accepted for this epic, since a target's errors showing on its row is not in the spec.

### 2. A loop wrap that Live reports on the brace's end sends the next section's cue, and can re-arm a target a Fade out paused — MEDIUM
- **Location:** `src/server/cues.ts:136-141` (`moved`), reached from `observe` at `:153-172`
- **Attribution:** introduced for the cues: `src/server/cues.ts` is new (#121, #117), and #122 wired the Count Off re-arm to it. The controller's `countOff` on the same report (`enteredCountOff`, `src/server/playback-controller.ts:127-136`) is pre-existing, untouched (`git show 2aa6d25:src/server/playback-controller.ts` lines 121-130 carry the same rule), and is what sets `musicBack` in the overlap case.
- **Real-world trigger:** the leader loops a section, a chorus most often, with a target armed, and Live reports the playhead on the brace's end or within 1e-4 beat before it on the wrap. Both the controller (`reachedEnd`, `src/server/playback-controller.ts:351-361`) and the cue module (`bracesEnd`) already treat that report as real for a loop ending on End, and `test/transport.test.ts:383-399` and `test/cue-causes.test.ts:187-196` pin it, but no contract run against Live has shown it. The overlap case is the common "loop the last chorus and fade out" ending. MEDIUM, capped: upgrade to HIGH if a contract run against Live shows a `current_song_time` report at or within 1e-4 beat before a loop's brace end.

**Evidence**
```ts
    if (!sameSection(before.now, now)) {
      if (target && sameSection(now, target)) {
        if (state.jump !== null) enteredEarly = target;
        raise(song, now.section, jumpCause(target));
      } else raise(song, now.section, loop && to < from ? 'loop' : 'played-into');
      return;
    }
```

**Failure mode** — `nowPlaying` reads a position within EPSILON of a locator as on it, so a report on the brace end of a loop on the Verse (16 to 32) reads as the Chorus, and `moved` raises `Chorus played-into`; the wrap back to 16 then raises `Verse loop`. The target shows the chorus slide for a moment on every wrap. On the overlap layout with the loop on song 1's last section (24 to 40, song 2's Count Off at 40) after a Fade out, the report at 40 also runs the controller's `countOff()`, which sets `musicBack`, and the cue module raises song 2's `Count Off played-into`, so `deliver` re-arms every target the Fade out paused while the band is still looping and fading. Executed: `repro/review-1-loop-brace-end.test.ts`: mid-song received `['Chorus played-into', 'Verse loop']` for `['Verse loop']`; overlap received song 2 `Count Off played-into` and song 1 `Chorus loop` for nothing, with the row back to armed.

**Recommended fix**
```diff
--- a/src/server/cues.ts
+++ b/src/server/cues.ts
@@ -152,10 +152,12 @@
   return {
     observe(state) {
       const before = last;
-      last = state;
+      const wrapping = before !== null && onBraceEnd(before, state);
+      last = before && wrapping ? { ...state, now: before.now } : state;
       const { position } = state;
       const at = rest !== null && position !== null && position >= rest && position - rest < PLAYED_ON ? rest : position;
       rest = state.playing ? null : at;
+      if (wrapping) return;
       const { set } = state;
       const waiting = startWaiting;
       startWaiting = null;
@@ -245,3 +247,9 @@
 function bracesEnd(loop: Loop | null, end: number): boolean {
   return !!loop && loop.length > 0 && near(loop.start + loop.length, end);
 }
+
+function onBraceEnd(before: PlaybackState, state: PlaybackState): boolean {
+  const loop = before.loop ?? state.loop;
+  const { position } = state;
+  return before.playing && state.playing && before.jump === null && state.jump === null && position !== null && !!loop && loop.length > 0 && near(position, loop.start + loop.length);
+}
```

**Remediation brief**
- **Design intent:** a cue marks a section start the music actually reaches. Live wraps its loop at the brace's end, so while a loop is on, the playhead never plays past it: a report there is the loop going round and raises nothing. The report after it says what happened, judged against the section playing before the brace-end report, which is why `last` keeps `before.now`: a wrap back reads as a move back inside the looped section (a `loop` cue), and playback on past the brace, if the loop went off at that instant, still reads as playing into the next section. The guard covers the brace's end only, whatever its start, as the controller's `reachedEnd` does, and never while a jump waits or lands, since a jump to the section after the loop lands on that same beat.
- **Full surface:** `src/server/cues.ts:153-162` (`observe`) and a new `onBraceEnd` beside `bracesEnd` at `:245-247`. `bracesEnd` in `endReached` (`:231`) stays as it is: with the new guard it is still needed for the End reached by a report a little past the brace that is not within EPSILON of it. No change in `src/server/connections.ts`: with no Count Off cue raised on that report, the next section cue (the `loop` cue) clears `musicBack` without re-arming. The controller's own `countOff()` on that report is pre-existing and stays; see Needs Further Investigation A.
- **Must preserve:** a jump landing on the section right after a looped one still raises `jump`; a loop on the last section wrapping on a report a hair before End fires `loop` and no End (`test/cue-causes.test.ts:187-196`); every wrap fires the looped section once (`:175-185`); `startWaiting` and `rest` bookkeeping (Play from start while stopped, `test/cue-causes.test.ts` Play from start cases). The fix as written leaves `rest` and `startWaiting` untouched on a brace-end report, since `rest` is set before the return and `startWaiting` is read after it.
- **Do not touch:** `startWaiting` and `PLAYED_ON` (Dismissed: "stale startedSong", which is Needs Further Investigation B); the `musicBack` rule.
- **Proof:** `cp docs/reviews/setlist-controller-113/repro/review-1-loop-brace-end.test.ts test/ && pnpm exec vitest run test/review-1-loop-brace-end.test.ts` is red now on both cases and green after the fix; then `pnpm test` stays green (verified in a scratch copy: 812 passed with fixes 1, 2, 5 and 6 together). Fold both cases into `test/cue-causes.test.ts` (mid-song) and `test/pause-rules.test.ts` (overlap with Fade out). The failure of the fix itself: a loop turned off at the laptop in the very report Live puts on the brace end. The next report then plays on into the next section and raises `played-into` from the kept `before.now`, so the cue arrives one report late rather than never.

### 3. The target's read-only row state from the spec is not built, and no ticket held it — MEDIUM
- **Location:** `src/server/target.ts:8`, `src/shared/snapshot.ts:138` (`Connection`), `web/src/ConnectionsPanel.tsx:42-61`
- **Attribution:** introduced, as an omission: the epic body lists it in the adapter interface ("optionally report read-only state for its row") and in the connections part ("any read-only state the target chooses to show (for example the live cue) ... the producer page renders it in the target's row"); #121 deferred it to "later tickets", and none of #116 to #122 names it. `grep -rn -i "read-only" src web/src` finds only the comment `// A later part of the interface: a read-only state.`
- **Real-world trigger:** no user path in this epic, which ships no target. The Eos epic (#108) needs it for the read-only cue list and the ProPresenter epic (#84) for the playlist picker's room on the row ("Further Notes" in #113), so each would have to widen the foundation first, which is exactly what the epic set out to avoid. Not a defect; a spec gap, capped at MEDIUM.

**Evidence** — `src/server/target.ts:8`: `// A later part of the interface: a read-only state.` `Connection` has `name, label, configured, problems, connection, arm, pause, check, buttons` and nothing else.

**Failure mode** — none at run time. The epic's acceptance ("the read-only state is opaque to the foundation: the target supplies it and the producer page renders it in the target's row") is not met, and the first target epic that shows state must change `target.ts`, `connections.ts`, `snapshot.ts` and `ConnectionsPanel.tsx`.

**Recommended fix** — a decision first, then one of two:
- Build it: `TargetReport` gains `state(lines: string[] | null): void`; `Entry` keeps `state`, reset to null when the target goes offline; `Connection` gains `state: string[]`; `rows()` copies it; the row renders the lines read-only after the check; the fake target gains `setState(lines)`; one server test (producer row shows it, leader and viewer never) and one render test.
- Or record the deferral: move the item to the first target epic that needs it (#108), state that in #113's closing comment, and delete the misleading comment at `src/server/target.ts:8`.

**Remediation brief**
- **Design intent:** the foundation never looks inside a target; whatever a target wants the producer to see beyond the common fields passes through opaque. The shape `string[]` keeps it opaque and renderable without per-target page code (the same principle as the declared buttons, story 46).
- **Full surface (build option):** `src/server/target.ts:13-19` (`TargetReport`), `src/server/connections.ts:52-61` (`Entry`), `:82-84` (initial entry), `:114-122` (`report`, offline reset), `:129-145` (`rows`), `:151` (the report object handed to `start`), `src/shared/snapshot.ts:138` (`Connection`), `web/src/ConnectionsPanel.tsx:42-61`, `web/src/ConnectionsSetup.tsx` (decide whether the setup screen shows it; the spec names the producer row only), `test/fake-target.ts`, every `Connection` literal in `test/pages.test.ts` and `src/server/connections.ts:144` (the disabled row gets `state: []`).
- **Must preserve:** the `set()` change detector in `connections.ts:89-96` must include the new field, or a state change never publishes; leader and viewer never get it (the hub only sends `connections` to producers).
- **Do not touch:** the hub's per-role split.
- **Proof:** build option: a new server test in `test/connections.test.ts` where `fake.setState(['Cue 12'])` shows on the producer row and not on the leader or viewer, red before, green after; plus a render test in `test/pages.test.ts`.

### 4. The per-role duplicate skip in the hub has no test that can fail — MEDIUM
- **Location:** `src/server/hub.ts:78-83`; the tests that claim it: `test/producer.test.ts:173` ("keeps each role its own part after a change, and skips a duplicate per role") and `test/connections.test.ts:57`
- **Attribution:** introduced (#116 added the per-role publish and its test).
- **Real-world trigger:** none today, since the code is correct; a later change to `publish` that resends playback snapshots to leaders and viewers on every connection change goes unnoticed. A test-quality finding.

**Evidence**
```ts
      const changed = { playback: next.playback !== sent.playback, producer: next.producer !== sent.producer };
      sent = next;
      for (const socket of sockets.clients) {
        const role = roles.get(socket);
        if (role === 'producer' ? changed.producer : changed.playback) socket.send(forRole(role));
      }
```

**Failure mode** — the mutant `if (changed.producer) socket.send(forRole(role));` sends every leader and viewer a duplicate playback snapshot on each Arm, Disarm, status or check change, and the whole unit suite stays green (806 passed). The producer test runs with no targets, so a producer change never happens without a playback change; `test/connections.test.ts:57` asserts only that the `connections` key is absent. Executed: `git apply docs/reviews/setlist-controller-113/repro/review-1-mutation-hub-dedupe-by-producer.diff && pnpm test; git apply -R docs/reviews/setlist-controller-113/repro/review-1-mutation-hub-dedupe-by-producer.diff`.

**Recommended fix** — a test in `test/connections.test.ts`: a fake target online, producer, leader and viewer loaded; record `leader.received.length` and `viewer.received.length`; the producer sends `{ kind: 'arm', target }` and waits for the row to show armed; then `target.goOffline()` and wait for the producer to see offline; assert the leader's and viewer's counts did not move.

**Remediation brief**
- **Design intent:** the hub serializes two strings per publish, one for viewers and leaders and one for producers, and sends each role only when its own string changed (epic "A duplicate is still skipped, per role"; the code comment "a change to the connections alone reaches no viewer").
- **Full surface:** a new case in `test/connections.test.ts`; no production change.
- **Must preserve:** `test/producer.test.ts:173` as it is.
- **Do not touch:** `src/server/hub.ts`.
- **Proof:** with the new test in place, the mutation diff above turns it red; without the mutation it is green.

### 5. A target whose stop rejects aborts the server's close — LOW
- **Location:** `src/server/connections.ts:158-160`, called at `src/server/server.ts:236` before `hub.close()`, `live.close()` and `http.close()`
- **Attribution:** introduced (#121).
- **Real-world trigger:** no adapter exists. With one, a `stop` that rejects (a socket already gone) at `launchctl bootout` or Ctrl-C leaves the hub, the OSC sockets and HTTP unclosed, and `server.close()` rejects in `main.ts`'s signal handler. LOW: shutdown only, and the process ends anyway.

**Evidence** — `await Promise.all(entries.map((entry) => entry.target.stop()));`

**Failure mode** — executed: `repro/review-1-adapter-stop-start.test.ts`, "a target whose stop rejects": `rig.close()` rejects with `ADAPTER STOP BOOM`.

**Recommended fix**
```diff
     async stop() {
-      await Promise.all(entries.map((entry) => entry.target.stop()));
+      await Promise.all(
+        entries.map(async (entry) => {
+          try {
+            await entry.target.stop();
+          } catch (error) {
+            console.error(`Setlist server: the connection target ${entry.target.name} did not stop`, error);
+          }
+        }),
+      );
     },
```

**Remediation brief**
- **Design intent:** the same per-target guard `start()` has at `:147-157`, so one target's failure never stops another target's stop or the server's close.
- **Full surface:** `src/server/connections.ts:158-160`.
- **Must preserve:** every ready target's `stop` is still called, including one whose `start` failed (harmless, and the adapter may hold a half-open socket).
- **Do not touch:** the close order in `src/server/server.ts:232-240`.
- **Proof:** `cp docs/reviews/setlist-controller-113/repro/review-1-adapter-stop-start.test.ts test/ && pnpm exec vitest run test/review-1-adapter-stop-start.test.ts -t "stop rejects"` is red now and green after.

### 6. The server waits on every target's start, so one that never settles holds back the setup URLs, setlist.local and the signal handlers — LOW
- **Location:** `src/server/server.ts:225` (`await connections.start();`), `src/server/connections.ts:147-157`
- **Attribution:** introduced (#121).
- **Real-world trigger:** none today. A target epic's adapter whose `start` awaits its first connection to a device that is off (ProPresenter not yet open on Sunday morning) would keep `startServer` from resolving: HTTP, the hub and the controller already run, so the music and the pages that know the URL work, but `main.ts` never prints the URLs, never starts advertising `setlist.local` (the phones' address), and never installs its SIGTERM handler. LOW, capped: upgrade to MEDIUM if any target epic's adapter awaits a network connect inside `start`.

**Evidence** — `await connections.start();` with `start()` doing `await Promise.all(entries.map(async (entry) => { try { await entry.target.start(...) } ... }))`.

**Failure mode** — executed: `repro/review-1-adapter-stop-start.test.ts`, "a target whose start never settles": `startRig` is still pending after 3 s.

**Recommended fix**
```diff
   const stopPoll = clock.every(SET_POLL_MS, () => command({ kind: 'refresh' }));
-  await connections.start();
+  void connections.start();
```

**Remediation brief**
- **Design intent:** "Playback never waits on a target." A target is offline until it reports through `TargetReport.status`, so the server has no reason to wait for `start` to finish. `connections.start()` never rejects (each start is caught), so the floating promise is safe.
- **Full surface:** `src/server/server.ts:225`. The comment above it ("so a failed listen leaves no timer behind and no target started") stays true.
- **Must preserve:** a target's synchronous `start` still runs before `startServer` returns, since an async function runs up to its first `await` at once; the existing suites rely on the fake target being online when `startRig` resolves (verified: all 806 stay green). Close while a start is still pending calls that target's `stop`, which finding 5's guard covers.
- **Do not touch:** the per-target catch in `connections.start()`.
- **Proof:** `cp docs/reviews/setlist-controller-113/repro/review-1-adapter-stop-start.test.ts test/ && pnpm exec vitest run test/review-1-adapter-stop-start.test.ts -t "never settles"` is red now and green after.

### 7. The page test that the leader and view-only pages show no Connections panel cannot fail on the page's role guard — LOW
- **Location:** `test/pages.test.ts:732-736`; the guard `web/src/App.tsx:40`
- **Attribution:** introduced (#116).
- **Real-world trigger:** none today; the hub never sends `connections` to a leader or viewer, and `test/connections.test.ts:57` and `e2e/producer.spec.ts` pin that at the socket and page level. The page's own guard is defence in depth that no test exercises. LOW.

**Evidence**
```ts
    for (const role of ['leader', 'viewer'] as const) {
      expect(text(page(role, SNAPSHOT)), role).not.toContain('Connections');
    }
```
`SNAPSHOT` (`test/pages.test.ts:274`) has no `connections` key, so `'connections' in snapshot` is already false.

**Failure mode** — executed: `repro/review-1-mutation-page-no-role-guard.diff` (drop `role === 'producer' &&`) leaves the whole unit suite green.

**Recommended fix** — render the leader and viewer pages with a producer snapshot holding one online row, and assert the text has neither "Connections" nor the row's label.

**Remediation brief**
- **Design intent:** a page shows the panel only for the producer role read from its path, whatever the snapshot carries.
- **Full surface:** `test/pages.test.ts:732-736`; no production change.
- **Must preserve:** the producer cases below it.
- **Do not touch:** `web/src/App.tsx:40`.
- **Proof:** with the strengthened test, `git apply docs/reviews/setlist-controller-113/repro/review-1-mutation-page-no-role-guard.diff && pnpm exec vitest run test/pages.test.ts` is red; reverted, green.

### 8. The connection layer's fallback paths have no tests — LOW
- **Location:** `src/server/connections.ts:100-113` (`runCheck`: a check that throws or rejects, a late answer dropped by the counter, an answer after going offline), `:147-157` (a start that throws or rejects); `src/shared/command.ts` (a malformed connection command on a producer socket)
- **Attribution:** introduced (#119, #121).
- **Real-world trigger:** none; the code paths are correct by reading, and a finder agent's probe confirmed the malformed-command handling on the real rig. The bound rule "a test for every fallback path" is not met. `grep -rn "throw" test/connections.test.ts test/pre-service-check.test.ts test/manual-controls.test.ts test/pause-rules.test.ts test/cue-causes.test.ts` finds nothing, and the fake's `check` is synchronous, so the late-answer counter cannot be exercised with it.

**Recommended fix** — give `test/fake-target.ts` a way to answer the check later (a deferred the test resolves) and to throw from `check` and `start`; then tests in `test/pre-service-check.test.ts` (a throwing check shows "not checked"; Refresh then a set change, answered out of order, keeps the newer; an answer arriving after offline changes nothing) and `test/connections.test.ts` (a start that throws leaves that target offline and the other online; `{kind:'arm'}` and `{kind:'arm',target:5}` on the producer socket leave it open and change nothing).

**Remediation brief**
- **Design intent:** each fallback the lanes chose (recorded in their assumptions: a failing check is logged and shows not checked; only the latest check's answer counts; a failing start stays offline) is pinned by a test that goes red if the fallback is removed.
- **Full surface:** `test/fake-target.ts`, `test/pre-service-check.test.ts`, `test/connections.test.ts`. No production change.
- **Must preserve:** the fake's defaults (online at start, synchronous empty check), on which every existing test relies.
- **Do not touch:** `runCheck`'s counter.
- **Proof:** each new test goes red when its fallback is removed: drop the `current()` check in `runCheck`; drop the `try` around `target.start`; drop the `catch` in `runCheck`.

### 9. The install guide names only the leader and view-only QR codes and only the leader secret — LOW
- **Location:** `docs/install.md:38`, `docs/install.md:40-51`
- **Attribution:** introduced, as an omission (#116 updated `README.md` and not the install guide). The #116 lane filed it as a proposal ("Document the producer secret and the producer QR code in docs/install.md").
- **Real-world trigger:** an install following the guide never bookmarks the producer page from its QR code, and nobody learns that deleting `producer-secret` rotates the producer URL and leaves the leader's alone.

**Recommended fix** — line 38: "shows the QR codes for the leader page, the producer page and the view-only page"; after the leader secret section, a short paragraph: the producer URL ends in its own secret, kept in `~/Library/Application Support/setlist-controller/producer-secret`, bookmarked from the setup screen's producer QR code, and changed by deleting that file and running the same `launchctl kickstart`, which leaves the leader URL as it is.

**Remediation brief**
- **Design intent:** the install guide is the operator's reference and tracks what the setup screen shows.
- **Full surface:** `docs/install.md:38`, `:40-51`.
- **Must preserve:** the section numbering and the "step 6" references.
- **Do not touch:** `README.md`'s roles section, which is already right.
- **Proof:** `grep -n "producer" docs/install.md` names the QR code and the `producer-secret` file.

## Needs Further Investigation

### A. The fade comes back on a loop wrap reported on the brace end of an overlapped last section (pre-existing)
`enteredCountOff` (`src/server/playback-controller.ts:127-136`, unchanged in substance from `2aa6d25`) reads the brace-end report of a loop on song 1's last section as entering song 2's Count Off, and calls `countOff(ms)`, which runs `fade.fadeInOver(ms)` while the leader's Fade out is under way. Finding 2's fix stops the targets from re-arming but not this. To confirm: a `test/fade-out.test.ts` case on the overlap layout with a loop on song 1's last section, Fade out, a report at `Math.fround(39.99995)`, and an assertion that no volume rises. Not in this epic's scope; a follow-up ticket if it confirms, with the same Live contract question as finding 2.

### B. A stale Play from start song can hold or mislabel a later start
`cues.command` remembers `startedSong` for every `play-from-start` command, accepted or not, and only a landing or a jump, Next, Previous or Stop command clears it (`src/server/cues.ts:174-186`). A Play from start the controller ignored (Live not connected) or Live stopped at the laptop leaves it set, so a later start at the laptop on a section start waits one report (`startWaiting`), and is lost if Live stops before that report. To confirm: a test in `test/cue-causes.test.ts` that sends `play-from-start` while the fake Live is disconnected, reconnects, then starts Live on a section start and expects that section's cue on the start report.

### C. `musicBack` can stay set across a stop or a reconnect
`connections.countOff()` sets `musicBack`, and only the next non-End section cue clears it. The controller calls `countOff` with no cue after it on the first report after a reconnect inside a Count Off (cues skip that report) and after a jump into another song's Count Off while stopped. A Fade out before the next section cue would then let a Count Off cue inside the song playing re-arm the faded targets. Reasoned only; to confirm: a `test/pause-rules.test.ts` case that disconnects the fake Live inside a Count Off, reconnects, fades out, then loops back onto that Count Off. Fix if it confirms: clear `musicBack` in `fadeOut()`.

## Reviewed and Dismissed
- Count Off inside the song playing re-arming faded targets — the `musicBack` word (#122 review pass 1) restricts the re-arm to the Count Off that follows the controller's `countOff`, which fires only from another song or Play from start; pinned by `test/pause-rules.test.ts`.
- A song with no Count Off never re-arms faded targets — the spec's literal rule ("At the next Count Off cue"), recorded by #122 and filed as its lane proposal "A song with no Count Off arms the faded targets again on its first section".
- Play from start while stopped calling `comesBack` (`src/server/playback-controller.ts:488-490`) and double-firing the fade-in — Live is stopped, so the fade is already cancelled (`fade-out.ts` `fromLive` on a stop), and `fadeInOver` returns at once unless silent or stepping.
- Fire again enabled on the panel before a set is known — the #118 assumption chose it deliberately; the server drops it silently and nothing breaks.
- No colour for a paused row, and offline not red on the setup screen — #122 chose "no new colour"; the spec asks for red on the producer row (story 8), which the panel has.
- Duplicate target names across `targets` and the config, and a factory naming its target differently from its key — unreachable: production passes no direct targets and registers no kind; JSON keys are unique.
- `producer-secret` as a directory or unreadable stops the start — the same behaviour the leader secret has on `2aa6d25`, through the shared reader; pre-existing pattern, untouched.
- Name matching without Unicode normalization — the spec says "nothing fuzzier"; adding NFC is a spec decision for a target epic.
- "Connections config from <path>" logged when the file is missing — the pedal's line does the same, and the setup screen says "No connections config."
- Producer path parsing, timing-safe comparison, refusal of a leader secret on the producer path and the reverse — tested in `test/producer.test.ts` and probed.

## Minor / nits
- `test/producer.test.ts` "replaces a file that does not hold a secret" does not assert mode 0600 on the replacement or that `leader-secret` is untouched; `test/leader-secret.test.ts` covers the shared reader.
- `e2e/producer.spec.ts` checks Fire again is enabled but never presses it; no e2e opens the view-only page to assert no Connections region.
- `ConnectionsPanel` shows file problems and rows together while `ConnectionsSetup` shows problems in place of rows; the server never produces both, so the difference is latent.

## Test quality
Tests added: 8 new server and unit test files plus new cases in `test/pages.test.ts`, `test/server.test.ts` and `test/setup-screen.test.ts` (82 cases run at base, plus 2 new Linux-only refusal cases this Mac skips), and `e2e/producer.spec.ts` plus new cases in `e2e/setup.spec.ts`. Green against `$BASE`: 0 of the added ones (all 82 are red at `2aa6d25`; the 8 green are pre-existing tests in the modified files). Tautology shapes found: 2, both proved by mutation: the per-role dedupe (finding 4) and the page role guard (finding 7). No mocked unit under test, no snapshot files, no call-shaped-only assertions. Fallback paths without tests: finding 8.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green locally; Playwright green (42). CI runs the four Linux-only refusal cases this Mac skips.
- **Commit hygiene:** clean tree. This doc and its `repro/` files are the only additions.
- **Likely reviewer asks:** what happens when a real adapter throws or hangs (findings 1, 5, 6); where the read-only state went (finding 3); whether Live really reports a position on a brace end (finding 2's cap).

## Verdict
**Not ready to open the PR as-is.** Gate: fix findings 1 and 2, add finding 4's test, and decide finding 3 (build it, or move it to #108 on record and drop the comment at `src/server/target.ts:8`). Findings 5 to 9 are small and can ride in the same remediation; if not, each is follow-up ticket material. Needs Further Investigation A is pre-existing and goes to a follow-up ticket; B and C are open questions for the cue and pause rules, not merge gates.

## Remediation — 2026-10-21
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `9a1918e` setlist-controller#113 pre-PR review 1 finding 1: a target adapter that throws from a cue, Fire again or a button run crashes the server | red→green: `pnpm exec vitest run test/connections.test.ts test/manual-controls.test.ts` (new cases "a target whose cue fails", three of them including an `async` cue that rejects, and "Fire again and a button run on a target that fails"; red was uncaught `cue failed` errors and a hung server); preserve-suites `test/pause-rules.test.ts`, `test/cue-causes.test.ts` green | 0 | fixed (disprove agent) |
| 2 (MEDIUM) | `fd78f1f` setlist-controller#113 pre-PR review 1 finding 2: a loop wrap reported on the brace end sends the next section's cue and can re-arm a target a Fade out paused | red→green: `pnpm exec vitest run test/cue-causes.test.ts test/pause-rules.test.ts` (the repro's two cases folded in: "mid-song fires only the looped section as it wraps on a report on the brace end, or a hair before it", and the overlap case under "a loop on song 1's last section, wrapping on a report on the brace end at song 2's Count Off"); `test/transport.test.ts` green | 0 | half-fixed: the guard was off while any jump waited, so a restart of the looped section tapped in its last bar still raised the next Count Off and re-armed faded targets |
| 2 rework | `62c86cf` setlist-controller#113 pre-PR review 1 finding 2 rework: the brace-end guard also holds while a jump back to the looped section waits | red→green: `pnpm exec vitest run test/pause-rules.test.ts -t "jump back to the looped"` (red: the faded target came back armed) | 0 | fixed (scoped re-verify), with one residual in the reworked line |
| 2 rework follow-up | `637a9cf` setlist-controller#113 pre-PR review 1 finding 2 rework follow-up: a jump tapped just after the brace end no longer counts as landing on a report that did not move | red→green: `pnpm exec vitest run test/pause-rules.test.ts -t "tapped just after the brace end"` (red: song 1's End and song 2's Count Off never fired) | 0 | the re-verify's own one-line fix, applied as the allowed exception; not re-verified by an agent |
| 3 (MEDIUM) | `0165bb4` setlist-controller#113 pre-PR review 1 finding 3: the target's read-only row state from the spec is not built | red→green: `pnpm exec vitest run test/connections.test.ts test/pages.test.ts` ("a target's read-only state", and the row render test); the offline guard proved by mutation (dropping it turns the server test red) | 7, kept: 2 on `TargetReport.state` and 2 on `Connection.state` state the interface contract (null means nothing, ignored and cleared offline) that the types cannot; 1 on the fake's `setState`, matching every other member of `FakeTarget`; 2 in the `ConnectionsPanel` header, which lists what a row shows and would otherwise go stale (one of them rewrites an existing line) | fixed (disprove agent) |
| 4 (MEDIUM) | `469eec7` setlist-controller#113 pre-PR review 1 finding 4: the per-role duplicate skip in the hub has no test that can fail | `pnpm exec vitest run test/connections.test.ts -t "connections alone"` green, and red with `repro/review-1-mutation-hub-dedupe-by-producer.diff` applied; 5 runs green | 0 | proved by execution |
| 5 (LOW) | — deferred | — | — | LOW tail, not worked this round (eng-pipeline#34) |
| 6 (LOW) | — deferred | — | — | LOW tail, not worked this round |
| 7 (LOW) | — deferred | — | — | LOW tail, not worked this round |
| 8 (LOW) | — deferred | — | — | LOW tail, not worked this round |
| 9 (LOW) | — deferred | — | — | LOW tail, not worked this round |

Finding 3 was built rather than deferred: the deferral option needs GitHub writes on #113 and #108, which an unattended run may not make, and the epic's acceptance asks for the state. Recorded as an assumption in `.epic-loop/stage2/assumptions.md`.

Checks at `637a9cf`: `pnpm lint` green, `pnpm typecheck` green, `pnpm test` 41 files, 817 passed, 4 skipped, `pnpm build` green, `pnpm test:e2e` 42 passed.

### Known regressions, deferred
- A wrap reported after Live's loop-off report raises no cue — reached through `637a9cf` (and `fd78f1f`'s guard design), verdict "The wrap case now raises no cue. That matches an existing gap with no jump involved: Live reports the loop off between the brace-end report and the wrap, so `before.loop ?? state.loop` is null on the wrap report." Before `637a9cf` that sequence raised the looped section with the cause `played-into`. Not fixed because it is outside the scoped re-verify and needs Live to wrap after it reported the loop off, which the guard's own premise says it does not.
- Behaviour change, not a defect: a brace-end report that already shows the loop off, followed by playback on, now raises song 1's End and then song 2's Count Off, where the base raised the Count Off alone (`fd78f1f`, first verify pass).

### Rework briefs
- Finding 2 rework. Achieve: the brace-end guard holds while a jump waits for a section other than the one the report is in, notably a restart of the looped section tapped in its last bar, which waits for the bar line on the brace end. Preserve: `fd78f1f`'s behaviour with no jump; a jump landing on the section right after the loop raises `jump`; a loop on the last section fires `loop` and no End; `rest` and `startWaiting` untouched on a brace-end report. Proof: `pnpm exec vitest run test/pause-rules.test.ts -t "jump back to the looped"` red before, green after, and `test/cue-causes.test.ts`, `test/transport.test.ts`, `test/fade-out.test.ts` green.
- Finding 2 rework follow-up (the scoped re-verify's one-line fix). Achieve: a jump counts as landing only on a report that moved the playhead, so a loop-off publication at the brace end after a jump to the next Count Off keeps the guard. Preserve: the rework. Proof: `pnpm exec vitest run test/pause-rules.test.ts -t "tapped just after the brace end"` red before, green after, plus the suites above.

### Notes from the verify passes, not acted on
- `safely` checks `instanceof Promise`, so a rejecting non-native thenable would escape; Node only crashes on native rejections, so this is theoretical (`Promise.resolve(result).catch(failed)` would cover it).
- A state report that arrives before the adapter reports itself online is dropped, so an adapter must report its state again once online (by design, recorded in the assumptions).
- The state lines travel in the setup-status JSON, same-machine only, and are not rendered there.
- The `'end'` clause in `onBraceEnd` holds only because a jump to End comes from Next on the playing song's last section.
- Pre-existing, outside this round: Next from a looped last section turns the loop off and jumps to End; if Live's loop-off report lags the End report, `endReached`'s `bracesEnd` still sees the loop and suppresses End's cue. Filed as a stage 2 proposal.

