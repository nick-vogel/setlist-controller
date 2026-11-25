# Pre-PR review: setlist-controller#113 Connections: the producer role and cues that follow playback

**Branch:** `setlist-controller-113-connections-foundation` vs `origin/main` (merge-base `2aa6d25` "setlist-controller#107 fade out keeps Live playing, and the music comes back by Fade in or on the next Count Off")
**Reviewed at:** HEAD `1b37211` (setlist-controller#113 pre-PR review 1 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 54 files total, +4778 / -185 against the merge-base
**Delta under review:** since `2311b92` (setlist-controller#118 Fire again and each target's manual buttons on the producer page), the HEAD `pre-pr-review-1.md` reviewed: 18 files, +908 / -17, of which 6 are that doc and its `repro/` files. The code delta is the round 1 remediation: `9a1918e` (finding 1), `fd78f1f`, `62c86cf`, `637a9cf` (finding 2 and its two reworks), `0165bb4` (finding 3), `469eec7` (finding 4).
**Reviewed against:** the epic body of setlist-controller#113 and its sub-issues #116 to #122 as distilled in `pre-pr-review-1.md`, that doc's findings, Approach decisions, closure table, "Known regressions, deferred" and rework briefs. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules (load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape) are the conformance checklist. Round 2, delta-scoped.
**Date:** 2026-10-21
**Reviewer:** 2 code-review agents + 1 test-oracle agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok |
| Lint | `pnpm lint` | green (also after adding this round's `repro/` files) |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 41 files, 817 passed, 4 skipped (the four Linux-only laptop-refusal cases in `test/setup-screen.test.ts`) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 42 passed |
| Delta tests against `2311b92` | scratch worktree at `2311b92`, HEAD's `test/connections.test.ts`, `cue-causes.test.ts`, `fake-target.ts`, `manual-controls.test.ts`, `pages.test.ts`, `pause-rules.test.ts` copied in, run there | 10 of the 11 added tests red at `2311b92`; the green one is finding 4's test, which pins behaviour the base already had and goes red under the hub mutant (`repro/review-1-mutation-hub-dedupe-by-producer.diff`). All 139 pre-existing tests in those files green |
| Brace-end guard mutants | finder agent, scratch worktree at HEAD, 7 cue-related test files and then the whole suite for survivors | killed: guard removed (4 red), the `before.position !== position` clause, the `now` carry-over, `state.loop` only, any moved jump landing. Survived the whole suite (817 passed): `lands = false`, dropping the `target.section === 'end'` arm, dropping `before.playing`, clearing `startWaiting` before the early return |
| Brace-end differential | finder agent: 12 crafted `PlaybackState` sequences fed to `startCues` at `2311b92`, HEAD and three mutants | HEAD meets finding 2's intent in every sequence: each wrap fires the looped section once, two brace-end reports in a row included; a loop-off publication on the brace end then playing on raises the next section's `played-into`; a restart of the looped section waiting on the brace end keeps the guard; a stop and start on the brace end raises the start's section once (the base raised it twice) |
| Finding 1 (guard conditions untested) | `repro/review-2-brace-end-guard-conditions.test.ts` in a scratch worktree at HEAD, then with each mutation diff applied | green at HEAD; red with `review-2-mutation-cues-lands-false.diff` (`['1 Chorus played-into']` for `['1 Chorus jump']`) and with `review-2-mutation-cues-no-before-playing.diff` (`[]` for `['1 Chorus played-into']`); both mutants leave the whole unit suite green (817 passed), re-run by the orchestrator |
| Connection-layer mutants | finder agent, scratch worktree at HEAD | killed: the offline guard on `state`, `state` out of the change detector, no clear on offline, `safely` dropped from each of its three sites, `.catch(failed)` dropped, the hub dedupe mutant, the panel's state list removed. Survived: a null report ignored, the copy-in dropped, the copy-out dropped |
| Finding 2 (state test) | `repro/review-2-mutation-state-null-ignored.diff`, whole unit suite; then `repro/review-2-state-test-strengthened.diff` applied in a scratch worktree, with and without the mutant | the mutant leaves 817 passed; the strengthened test is green at HEAD and red with the mutant (`Waited 2000ms for a snapshot matching the given predicate; got 7 that did not.`) |
| Consumers of the widened `Connection` type outside the delta | finder agent: `web/src/App.tsx`, `web/src/ConnectionsSetup.tsx`, `src/shared/setup.ts`, `src/server/server.ts`, `e2e/` | no gaps: no other `Connection` literal lacks `state`; the setup screen ignores it; the laptop-only setup JSON carries it |
| Real Live | not run: the guardrails forbid driving Live | whether Live ever reports a position on a brace end, or reports a loop going off after the bar line a jump lands on, is still unconfirmed |
| Real target adapters | not run: none exists (`TARGET_KINDS = {}` in `src/server/main.ts`) | findings 1, 3, 4 of round 1 are proved with the fake adapter only |

**Overall:** Round 1's four MEDIUM findings are closed: an adapter that throws no longer takes the server down, a loop wrap on the brace end no longer sends a wrong cue or re-arms a faded target, the target's read-only row state is built, and the hub's per-role dedupe has a test that can fail. This round confirms no defect at MEDIUM or above. What it finds is that the remediation's own tests leave three of its decisions unpinned (two conditions in the brace-end guard, and the null clear of a target's state), plus comment drift, and round 1's five LOW findings, which the remediation deferred, are still open. The branch is ready to open the PR, with those as follow-ups.

## Approach decisions
- Adapter calls: every call the foundation makes into a target (`start`, `stop`, `cue`, `runButton`, `check`) is guarded per target, logged with `Setlist server: the connection target <name> ...`, and never stops the server or another target. Precedent: `safely` (`src/server/connections.ts:128-136`), `start()` (`:162-178`) and `runCheck` (`:105-118`).
- Brace end: a report on a loop's brace end while playing is the loop going round, never a move into the next section. The guard (`onBraceEnd`, `src/server/cues.ts:251-257`) steps aside only for a jump that lands on this report, meaning the playhead moved and the waiting jump's target is the section the report is in, or a jump to End. Precedent: the controller's `reachedEnd` and the cue module's `bracesEnd` guard on End.
- Brace-end guard logic is frozen for this epic. It has been written three times in response to reviews (`fd78f1f`, `62c86cf`, `637a9cf`); a further change to its conditions goes to a split ticket with its own test matrix, not a fourth in-place rewrite. Tests that pin it are welcome.
- Brace-end guard tests: a state the fake Live cannot produce (a loop still reported on at the report a jump lands on, since `holdReplies` in `src/fake-live/fake-live.ts:74-78` holds every report alike and releases them in order) is tested by feeding `startCues` crafted `PlaybackState`s directly. Precedent: none in `test/`, which drives `startCues` only through the rig; `repro/review-2-brace-end-guard-conditions.test.ts` is the shape.
- Target start: the server does not wait on any target. Precedent: the epic's "Playback never waits on a target" and the `TargetReport.status` channel. (Round 1 finding 6, still open as finding 4 here.)
- The target's read-only state: an opaque `string[]` through `TargetReport.state(lines | null)`, copied on the way in and out, ignored while offline, cleared on going offline, part of the `set()` change detector, rendered read-only under the check on the producer row only. Precedent: the pre-service check's offline rules and the declared buttons (story 46).
- Carried forward from the lanes and not overturned: the arm and pause rules and the `musicBack` word (#122 review pass 1), Fire again on `state.now` whatever `playing` (#118), the check triggers and the late-answer counter (#119), the config file's soft failure (#120), the cue causes and the `startWaiting` rule (#117).

## Prior-review closure
Round 1 (`pre-pr-review-1.md`, reviewed at `2311b92`) confirmed nine findings.
- **Fully fixed: 4.** Finding 1 (MEDIUM, adapter throws): every adapter call goes through `safely`; delivery order, armed-and-online delivery, and the unknown-button filter preserved; each `safely` site killed by mutation. Finding 2 (MEDIUM, brace-end wrap): three commits; the intent holds in every sequence the differential ran; two of the guard's conditions are unpinned, which is finding 1 below, a test gap and not a half-fix. Finding 3 (MEDIUM, read-only state): built per the brief; the null clear is unpinned, which is finding 2 below. Finding 4 (MEDIUM, hub dedupe test): the test goes red under the mutant.
- **Partially fixed: 0.**
- **Untouched: 5,** all LOW, deferred by the remediation ("LOW tail, not worked this round"): round 1 findings 5, 6, 7, 8 and 9, re-emitted here as findings 3 to 7 with their briefs. Their code is unchanged since `2311b92` except the line numbers in `src/server/connections.ts`.
- **Resolved only by editing a comment or doc: 0.**
- Round 1's "Known regressions, deferred" (a wrap reported after Live's loop-off report raises no cue; a brace-end report already showing the loop off then playback on raises End and the Count Off) still stand and are not re-reported.

## Confirmed Issues

### 1. Two of the brace-end guard's conditions have no test that can fail — LOW
- **Location:** `src/server/cues.ts:255` (`lands`) and `:256` (`before.playing`), in `onBraceEnd` at `:251-257`
- **Attribution:** introduced by the round 1 remediation, against `2311b92` and against `$BASE`: `fd78f1f` added `onBraceEnd` with `before.playing`; `62c86cf` and `637a9cf` gave it the `lands` step-aside (`git log --oneline -S'const lands' 2311b92..HEAD`).
- **Real-world trigger:** the code is correct today; the gap is that a later change can break either condition with the whole suite green. Their behaviour: `lands` matters when the leader taps a jump to the section after a looped one so late in the bar that Live reports the bar line before it reports the loop going off; without it, that section's cue arrives one report late with the cause `played-into` instead of `jump`. `before.playing` matters when Live starts from stopped with the playhead exactly on a loop's brace end and the loop on; without it, the start's section cue is lost. No user path today (no target kind is registered), and the consequence of each mutant is a late or relabelled cue or a lost one: LOW.

**Evidence**
```ts
function onBraceEnd(before: PlaybackState, state: PlaybackState): boolean {
  const loop = before.loop ?? state.loop;
  const { position } = state;
  const target = before.jump;
  const lands = target !== null && before.position !== position && (target.section === 'end' || sameSection(state.now, target));
  return before.playing && state.playing && !lands && position !== null && !!loop && loop.length > 0 && near(position, loop.start + loop.length);
}
```

**Failure mode** — `git apply docs/reviews/setlist-controller-113/repro/review-2-mutation-cues-lands-false.diff` (`const lands = false;`) and, separately, `review-2-mutation-cues-no-before-playing.diff` (drops `before.playing &&`) each leave `pnpm test` at 817 passed. The rig cannot reach the `lands` case: the fake Live reports the loop off before the bar line, so `before.loop ?? state.loop` is already null on the landing report and the guard never engages. Round 1's brief named "a jump landing on the section right after a looped one still raises `jump`" as a Must preserve; nothing defends it.

**Recommended fix** — add the repro as a test file of the suite, `test/cue-brace-end.test.ts`, with its content as it is in `docs/reviews/setlist-controller-113/repro/review-2-brace-end-guard-conditions.test.ts`. No production change.

**Remediation brief**
- **Design intent:** a cue marks a section start the music reaches. A report on a loop's brace end while Live plays is the loop going round and raises nothing, and the next report is judged against the section playing before it (`last` keeps `before.now`). Two exceptions: a jump that lands on this report (the playhead moved and the waiting jump's target is the section the report is in, or End), and a start from stopped, which is not a wrap.
- **Full surface:** a new `test/cue-brace-end.test.ts`; nothing else. `src/server/cues.ts` is frozen (Approach decisions: a fourth rewrite of the guard goes to a split ticket).
- **Must preserve:** every existing test in `test/cue-causes.test.ts`, `test/pause-rules.test.ts`, `test/transport.test.ts`.
- **Do not touch:** `onBraceEnd`'s `target.section === 'end'` arm (Dismissed: "the End arm lets any waiting End jump through"); `src/server/cues.ts` as a whole.
- **Proof:** `pnpm exec vitest run test/cue-brace-end.test.ts` green; then `git apply docs/reviews/setlist-controller-113/repro/review-2-mutation-cues-lands-false.diff && pnpm exec vitest run test/cue-brace-end.test.ts` red on the first case, `git apply -R` the same diff; then the same with `review-2-mutation-cues-no-before-playing.diff`, red on the second case, reverted. A test-gap finding: the red is the mutant's, so there is no red before the fix.
- **Escalation:** third rewrite of this subsystem. This finding is test-only on purpose; a remediator who finds the guard itself wrong stops and files a split ticket rather than changing `cues.ts`.

### 2. The read-only state test does not pin the null clear or the copy-in — LOW
- **Location:** `test/connections.test.ts:259` (`lines.push('changed after the report');`) and `:267-271`; the code it should pin is `src/server/connections.ts:166-168`
- **Attribution:** introduced by `0165bb4` (round 1 finding 3).
- **Real-world trigger:** the code is correct today. A later change that ignores a `null` report (an adapter saying it has nothing to show) would leave a stale line, such as the last cue, on the producer's row with the whole suite green. No user path in this epic (no target ships): LOW.

**Evidence**
```ts
    target.setState(null);
    await producer.snapshot((snapshot) => snapshot.connections[0]?.state.length === 0);

    target.setState(['Cue 14']);
    await producer.snapshot((snapshot) => snapshot.connections[0]?.state.length === 1);
```
The harness's `snapshot(matches)` (`test/harness.ts:249-251`) returns the first snapshot ever received that matches, so the first wait resolves on the very first snapshot (state `[]`) and the second on the earlier `['Cue 13']` one.

**Failure mode** — `git apply docs/reviews/setlist-controller-113/repro/review-2-mutation-state-null-ignored.diff` (a null report ignored) leaves `pnpm test` at 817 passed. Separately, the finder agent's mutant dropping the copy-in (`lines ? [...lines] : []` to `lines ?? []`) also survives: `lines.push(...)` runs after the wait resolved and the next `setState` overwrites the entry before anything publishes, so the push is never observed. What the copy-in actually protects is an adapter that changes its own array and reports the same reference again: without the copy, `set()`'s `JSON.stringify(next.state) === JSON.stringify(entry.state)` compares the array with itself and publishes nothing.

**Recommended fix** — apply `docs/reviews/setlist-controller-113/repro/review-2-state-test-strengthened.diff` (each of the two waits counts only snapshots received after its `setState`, and the second checks the line itself), and replace the `lines.push('changed after the report');` line at `:259` with a same-reference report:
```diff
-    lines.push('changed after the report');
+    const mutated = producer.received.length;
+    lines[0] = 'Cue 12b';
+    target.setState(lines);
+    await producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= mutated && snapshot.connections[0]?.state[0] === 'Cue 12b');
```

**Remediation brief**
- **Design intent:** a target's read-only state is opaque lines the server copies in, keeps only while online, clears on going offline and on a `null` report, and publishes only when it changed. Each of those rules has a test that goes red without it.
- **Full surface:** `test/connections.test.ts:259` and `:267-271`; no production change. The `producer.received.indexOf(snapshot) >= back` pattern at `:279-281` of the same test is the in-repo precedent for a wait that ignores earlier snapshots.
- **Must preserve:** the rest of that test (offline guard, offline clear, leader and viewer never see the lines), which the mutants for those rules already turn red.
- **Do not touch:** `src/server/connections.ts`; `test/harness.ts`'s `snapshot` semantics, which every suite relies on.
- **Proof:** with both changes, `pnpm exec vitest run test/connections.test.ts -t "read-only state"` green; with `git apply docs/reviews/setlist-controller-113/repro/review-2-mutation-state-null-ignored.diff` red (verified for the strengthened diff: `Waited 2000ms ...; got 7 that did not.`), reverted with `git apply -R`; and with the copy-in changed by hand to `state: lines ?? []` red on the same-reference case, then restored.

### 3. A target whose stop rejects aborts the server's close — LOW
- **Location:** `src/server/connections.ts:179-181`, called at `src/server/server.ts:236` before `hub.close()`, `live.close()` and `http.close()` (`:237-239`)
- **Attribution:** introduced (#121); round 1 finding 5, untouched.
- **Real-world trigger:** no adapter exists. With one, a `stop` that rejects (a socket already gone) at `launchctl bootout` or Ctrl-C leaves the hub, the OSC sockets and HTTP unclosed, and `server.close()` rejects in `main.ts`'s signal handler. LOW: shutdown only.

**Evidence** — `await Promise.all(entries.map((entry) => entry.target.stop()));`

**Failure mode** — round 1 executed `repro/review-1-adapter-stop-start.test.ts`, "a target whose stop rejects": `rig.close()` rejects with `ADAPTER STOP BOOM`. The code is unchanged since.

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
- **Design intent:** the same per-target guard `start()` has at `:162-178`, so one target's failure never stops another target's stop or the server's close.
- **Full surface:** `src/server/connections.ts:179-181`.
- **Must preserve:** every ready target's `stop` is still called, including one whose `start` failed.
- **Do not touch:** the close order in `src/server/server.ts:232-240`.
- **Proof:** `cp docs/reviews/setlist-controller-113/repro/review-1-adapter-stop-start.test.ts test/ && pnpm exec vitest run test/review-1-adapter-stop-start.test.ts -t "stop rejects"` red now, green after; keep the case in `test/connections.test.ts` and delete the copied file.

### 4. The server waits on every target's start, so one that never settles holds back the setup URLs, setlist.local and the signal handlers — LOW
- **Location:** `src/server/server.ts:225` (`await connections.start();`), `src/server/connections.ts:162-178`
- **Attribution:** introduced (#121); round 1 finding 6, untouched.
- **Real-world trigger:** none today. A target epic's adapter whose `start` awaits its first connection to a device that is off would keep `startServer` from resolving: `main.ts` never prints the URLs, never advertises `setlist.local`, never installs its SIGTERM handler. LOW, capped: upgrade to MEDIUM if any target epic's adapter awaits a network connect inside `start`.

**Evidence** — `await connections.start();`

**Failure mode** — round 1 executed `repro/review-1-adapter-stop-start.test.ts`, "a target whose start never settles": `startRig` still pending after 3 s. Unchanged since.

**Recommended fix**
```diff
   const stopPoll = clock.every(SET_POLL_MS, () => command({ kind: 'refresh' }));
-  await connections.start();
+  void connections.start();
```

**Remediation brief**
- **Design intent:** "Playback never waits on a target." A target is offline until it reports through `TargetReport.status`. `connections.start()` never rejects (each start is caught), so the floating promise is safe.
- **Full surface:** `src/server/server.ts:225`. The comment above it stays true.
- **Must preserve:** a target's synchronous `start` still runs before `startServer` returns (an async function runs to its first `await` at once); the suites rely on the fake target being online when `startRig` resolves. Close while a start is pending calls that target's `stop`, which finding 3's guard covers.
- **Do not touch:** the per-target catch in `connections.start()`.
- **Proof:** `cp docs/reviews/setlist-controller-113/repro/review-1-adapter-stop-start.test.ts test/ && pnpm exec vitest run test/review-1-adapter-stop-start.test.ts -t "never settles"` red now, green after; then `pnpm test` green.

### 5. The page test that the leader and view-only pages show no Connections panel cannot fail on the page's role guard — LOW
- **Location:** `test/pages.test.ts:733-737`; the guard `web/src/App.tsx:40`
- **Attribution:** introduced (#116); round 1 finding 7, untouched.
- **Real-world trigger:** none; the hub never sends `connections` to a leader or viewer. The page's guard is defence in depth no test exercises.

**Evidence**
```ts
    for (const role of ['leader', 'viewer'] as const) {
      expect(text(page(role, SNAPSHOT)), role).not.toContain('Connections');
    }
```
`SNAPSHOT` has no `connections` key, so `'connections' in snapshot` is already false.

**Failure mode** — round 1 executed `repro/review-1-mutation-page-no-role-guard.diff` (drop `role === 'producer' &&`): the whole suite stays green.

**Recommended fix** — render the leader and viewer pages with a producer snapshot holding one online row (the `ONLINE` row defined at `:739`), and assert the text has neither "Connections" nor the row's label.

**Remediation brief**
- **Design intent:** a page shows the panel only for the producer role read from its path, whatever the snapshot carries.
- **Full surface:** `test/pages.test.ts:733-737`; no production change.
- **Must preserve:** the producer cases below it.
- **Do not touch:** `web/src/App.tsx:40`.
- **Proof:** with the strengthened test, `git apply docs/reviews/setlist-controller-113/repro/review-1-mutation-page-no-role-guard.diff && pnpm exec vitest run test/pages.test.ts` red; `git apply -R` the same diff, green.

### 6. The connection layer's fallback paths have no tests — LOW
- **Location:** `src/server/connections.ts:105-118` (`runCheck`: a check that throws or rejects, a late answer dropped by the counter, an answer after going offline), `:162-178` (a start that throws or rejects); `src/shared/command.ts` (a malformed connection command on a producer socket)
- **Attribution:** introduced (#119, #121); round 1 finding 8, untouched.
- **Real-world trigger:** none; the paths are correct by reading, and round 1's probe confirmed the malformed-command handling. The bound rule "a test for every fallback path" is not met. The fake's `check` (`test/fake-target.ts:66`) is synchronous, so the late-answer counter cannot be exercised with it.

**Recommended fix** — give `test/fake-target.ts` a way to answer the check later (a deferred the test resolves) and to throw from `check` and `start`; then tests in `test/pre-service-check.test.ts` (a throwing check shows "not checked"; Refresh then a set change answered out of order keeps the newer; an answer after offline changes nothing) and `test/connections.test.ts` (a start that throws leaves that target offline and the other online; `{kind:'arm'}` and `{kind:'arm',target:5}` on the producer socket leave it open and change nothing).

**Remediation brief**
- **Design intent:** each fallback the lanes chose (a failing check is logged and shows not checked; only the latest check's answer counts; a failing start stays offline) is pinned by a test that goes red without it.
- **Full surface:** `test/fake-target.ts`, `test/pre-service-check.test.ts`, `test/connections.test.ts`. No production change.
- **Must preserve:** the fake's defaults (online at start, synchronous empty check, `setState` reporting nothing while not started).
- **Do not touch:** `runCheck`'s counter.
- **Proof:** each new test goes red when its fallback is removed: drop the `current()` check in `runCheck` (`:110`); drop the `try` around `target.start`; drop the `catch` in `runCheck` (`:114`).

### 7. The install guide names only the leader and view-only QR codes and only the leader secret — LOW
- **Location:** `docs/install.md:38`, `docs/install.md:40-51`
- **Attribution:** introduced, as an omission (#116 updated `README.md` and not the install guide); round 1 finding 9, untouched.
- **Real-world trigger:** an install following the guide never bookmarks the producer page from its QR code, and nobody learns that deleting `producer-secret` rotates the producer URL and leaves the leader's alone.

**Recommended fix** — line 38: "shows the QR codes for the leader page, the producer page and the view-only page"; after the leader secret section, a short paragraph: the producer URL ends in its own secret, kept in `~/Library/Application Support/setlist-controller/producer-secret`, bookmarked from the setup screen's producer QR code, and changed by deleting that file and running the same `launchctl kickstart`, which leaves the leader URL as it is.

**Remediation brief**
- **Design intent:** the install guide is the operator's reference and tracks what the setup screen shows.
- **Full surface:** `docs/install.md:38`, `:40-51`.
- **Must preserve:** the section numbering and the "step 6" references.
- **Do not touch:** `README.md`'s roles section, which is already right.
- **Proof:** `grep -n "producer" docs/install.md` names the QR code and the `producer-secret` file.

### 8. Comment hygiene — LOW (aggregated)
- `src/server/cues.ts:55-58` — "Nothing fires while Live is stopped, nor for a start mid-section, nor for a move back inside a section that is neither a jump landing nor a loop wrap, as a drag at the laptop is, nor for the section the playhead was already in ..." → add the brace-end rule the remediation introduced: "... nor for a report on the brace's end of a loop that is on while Live plays, which is the loop going round, unless a jump lands on it, nor for the section the playhead was already in ..."
- `web/src/ConnectionsPanel.tsx:10-11` — "Under the check, whatever read-only state the target reports, such as its live cue. Every button is disabled while the page is not connected. An offline row shows red, as Live not connected does. A target the" → "Under the check, the row shows whatever read-only state the target reports, such as its live cue." and rewrap the paragraph to the width of the lines around it.

## Needs Further Investigation

### A. `musicBack` left set when the brace-end report's Count Off is swallowed and no cue follows
On the overlap layout, the controller's `countOff()` still runs on the brace-end report at song 2's Count Off (`enteredCountOff`, `src/server/playback-controller.ts:127-136`), setting `musicBack`; the cue module now raises nothing there. Normally the wrap's `loop` cue clears it without a re-arm. It persists only when no cue follows, as in round 1's deferred "a wrap reported after Live's loop-off report raises no cue"; a later Count Off reached inside the song playing would then re-arm targets a Fade out paused. Narrower than the base, which re-armed on the brace-end report itself. Reasoned, not executed. To confirm: a `test/pause-rules.test.ts` case on the overlap layout, loop on song 1's last section, Fade out, a report at `Math.fround(39.99995)`, the loop turned off at the laptop, playback on into song 2 and a jump back onto song 2's Count Off from inside song 2, asserting the faded target stays paused. Overlaps round 1 NFI C (`musicBack` across a stop or a reconnect); one fix covers both if it confirms: clear `musicBack` in `fadeOut()`, or have `enteredCountOff` skip a report on the brace end of a loop that is on and playing, as `reachedEnd` already does for End.

### B. `startWaiting` survives a brace-end report only by statement order, and nothing pins it
Round 1's brief named "`startWaiting` untouched on a brace-end report" as a Must preserve; moving `if (wrapping) return;` after `startWaiting = null;` (`src/server/cues.ts:160-163`) leaves the whole suite green. Its observable effect is unverified: it needs a start that waits (Play from start while stopped, or a start before a section) whose next playing report sits on a loop's brace end. To confirm: a `startCues` crafted-state case in the shape of `repro/review-2-brace-end-guard-conditions.test.ts` with that sequence, comparing HEAD with the moved statement.

### C. Round 1's open questions, unchanged
Round 1 NFI A (the controller's fade-in on a brace-end report of an overlapped last section, pre-existing), B (a stale Play from start song holding or mislabelling a later start) and C (`musicBack` across a stop or a reconnect) are untouched by the delta and stand as written in `pre-pr-review-1.md`.

## Reviewed and Dismissed
- The End arm of `lands` lets any waiting End jump through, whatever the song or position (`src/server/cues.ts:255`): unreachable. The only jump to End is Next from the playing song's last section (`src/server/playback-controller.ts:526-529`; a `jump` command needs an integer section, `src/shared/command.ts:37`), and there a loop on that section braces End itself, where `endReached`'s `bracesEnd` decides and HEAD equals `2311b92`. The finder's two harmful sequences need a jump to End from a non-last section or to another song's End. Its mutant survives the suite, which is fine for an arm with no reachable distinguishing state. Do not touch (and see Approach decisions: the guard is frozen).
- The `now` carry-over (`last = { ...state, now: before.now }`) leaking a stale section into a stop, a start, `endReached` or `startWaiting`: the differential's stop-and-start, two-reports, loop-off and drag sequences show none, and dropping the carry-over turns a pause-rules test red.
- A drag at the laptop onto a brace end: the cue moves one report later and reads `played-into` instead of `loop`, arguably more correct.
- Adapter-supplied state lines not validated (a string spreads to characters, an object child breaks the render): `TargetReport.state` is typed `string[] | null` and adapters are in-repo TypeScript; `runCheck`'s `[...names]` is the same unvalidated precedent.
- The laptop-only setup JSON now carries each row's `state`: `ConnectionsStatus.connections` is documented as the producer's rows, the route refuses non-laptop clients, and the setup screen ignores the field.
- Index keys on the state lines: static display lines, the same pattern `.check-unmatched` uses.
- Finding 4's test passes at `2311b92`: it pins behaviour the base already had, which is what round 1 asked for, and the hub mutant turns it red.
- `safely`'s `instanceof Promise` missing a non-native thenable: recorded in round 1's verify notes; Node only crashes on native rejections.
- Count Off inside the song playing re-arming faded targets; a song with no Count Off; Play from start while stopped double-firing the fade-in; Fire again before a set is known; no colour for a paused row; duplicate target names; `producer-secret` as a directory; name matching without normalization; the config path logged when missing; producer path parsing: dismissed in round 1, unchanged.

## Minor / nits
- `.connection-state` (`web/src/styles.css:757-764`) has no `overflow-wrap`, so one long unbreakable line overflows the row on a phone-width producer page; `.join-url { overflow-wrap: anywhere; }` (`:419`) is the precedent. `.check-unmatched` has the same gap on the base.
- The copy-out `state: [...entry.state]` in `rows()` has no test (its mutant survives); benign, since every snapshot is serialized before it leaves, and it matches `problems: [...entry.problems]`.
- A rejected promise from Fire again or a button run is tested only through delivery; all three go through the one `safely`.
- Round 1's nits stand: `test/producer.test.ts` "replaces a file that does not hold a secret" does not assert mode 0600; `e2e/producer.spec.ts` never presses Fire again; `ConnectionsPanel` and `ConnectionsSetup` show file problems differently.

## Test quality
Tests added in the delta: 11 (4 in `test/connections.test.ts` plus the hub dedupe case, 1 in `test/manual-controls.test.ts`, 1 in `test/cue-causes.test.ts`, 3 in `test/pause-rules.test.ts`, 1 in `test/pages.test.ts`), plus `setState` on the fake. Green against `2311b92`: 1, finding 4's test, kept on purpose (it was round 1 finding 4's remediation and is killed by the hub mutant). Tautology shapes found: 2, both proved by mutation: the brace-end guard's `lands` and `before.playing` conditions (finding 1) and the state test's waits on old snapshots and its unobserved `lines.push` (finding 2). No mocked unit under test, no snapshot files; the `console.error` spies assert the logged error object alongside an effect on the next target, not the call alone. Fallback paths without tests: finding 6, carried from round 1.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green locally; Playwright green (42). CI runs the four Linux-only refusal cases this Mac skips.
- **Commit hygiene:** clean tree. This doc and its five `repro/review-2-*` files are the only additions.
- **Likely reviewer asks:** whether Live really reports a position on a brace end, and a loop going off after the bar line (findings 1 and 2 of round 1 rest on it); what happens when a real adapter's stop or start fails or hangs (findings 3 and 4).

## Verdict
**Ready to open the PR, with follow-ups.** Round 1's gate (findings 1 to 4, all MEDIUM) is closed, and this round confirms nothing at MEDIUM or above: the Confirmed list shrank from four MEDIUM to zero, and what is left is test gaps in the remediation's own tests (findings 1 and 2), comment drift (finding 8), and round 1's LOW tail (findings 3 to 7), which the remediation deferred. None is a merge gate. Findings 1, 2 and 8 are test-and-comment changes small enough to ride one more remediation pass before the PR, or go as one follow-up ticket; findings 3 to 7 are follow-up ticket material, with 3 and 4 best landed before the first target epic registers an adapter. The brace-end guard has now been written three times: finding 1 is test-only by design, and any defect found in the guard's logic from here goes to a split ticket, not a fourth rewrite. Needs Further Investigation A and B are open questions for the cue and pause rules, not gates.
