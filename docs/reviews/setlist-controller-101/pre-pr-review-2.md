# Pre-PR review: setlist-controller#101 Rehearsal: count-off into a section

**Branch:** `setlist-controller-101-count-off-into-section` vs `origin/main` (merge-base `66a0439` "Merge pull request #228 from nick-vogel/setlist-controller-207-unpinned-guards")
**Reviewed at:** HEAD `69a091d` (Merge remote-tracking branch 'origin/main' into setlist-controller-101-count-off-into-section), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 27 files total, +2780 / -98 against the merge-base (pre-PR review 1 and its `repro/` included)
**Delta under review:** since `abb58ae` (setlist-controller#215 Count-in cues, the fade-in and the re-arm), the HEAD `pre-pr-review-1.md` reviewed. The branch's own delta is `abb58ae..29644d3`: the remediation commits `3ade4f3`, `21a0ce6`, `c0e5e59` and the closure table `29644d3`, touching `src/server/connections.ts`, `src/server/playback-controller.ts`, `src/server/server.ts`, `test/count-in.test.ts` and `test/count-in-cues.test.ts` (+147 / -34 in code and tests). `69a091d` is a clean merge of `origin/main` (no conflict hunks in `git show --cc`); its main-side changes were checked only for interaction with the count-in.
**Reviewed against:** the epic body of setlist-controller#101 (the spec); `pre-pr-review-1.md` in this folder, its findings, Approach decisions, closure table, Known regressions deferred and Rework briefs. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 2, delta-scoped.
**Date:** 2026-10-23
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | pass at `69a091d`; the four review-2 files under `repro/` each pass `pnpm exec eslint docs/reviews/setlist-controller-101/repro/` |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 66 files, 1406 passed, 4 skipped |
| Build and Playwright | `pnpm test:e2e` (builds first) | 50 passed, WebKit iPad and Chromium Android |
| Tautology audit of the delta's 6 new tests, oracle `279eec8` (the source before remediation) | HEAD's `test/count-in.test.ts` and `test/count-in-cues.test.ts` copied into a scratch worktree at `279eec8` | 3 red (the finding 1 rows and "ends a count-in whose start never reached Live"); 3 green: the 2 Play from start control rows (expected) and "plays on as an ordinary start when Live reports the start only after its Count Off would have played" (finding 1 here) |
| Mutations of the remediation, 83 tests in `test/count-in*.test.ts` and `test/connections.test.ts` | finder agent, scratch worktree at HEAD | M1 `musicBack === 'count-in' \|\|` removed: 2 red. M2 the rework's `countIn !== null` removed: 1 red. M9 the press's `comesBack(..., true)` made false: 1 red. M3 the startWait callback emptied: 1 red, only "ends a count-in whose start never reached Live". M4 `if (event.playing) cancelStartWait();` removed, M5 `\|\| playing` removed, M6 both, M7 `/ tempo` made `/ 120`, M8 `!countIn` removed: all green (Minor, and finding 1) |
| M3 re-run by the orchestrator | scratch worktree at HEAD, `if (!countIn \|\| playing) return;` made unconditional, `test/count-in.test.ts` | 23 passed, 1 failed: the "plays on as an ordinary start" test stays green with the timer dead |
| Finding 1 proof | `repro/review-2-late-start-is-live-lost.test.ts` in `test/` of a scratch worktree at HEAD | red: `"live": "not-connected"` at the assertion where the test expects the timer to have ended the count-in |
| Finding 1 candidate | `repro/review-2-candidate-late-start.test.ts` (240 BPM) in a scratch worktree at HEAD | green at HEAD; red under M3; red under M7 |
| Finding 2 proof | `repro/review-2-stop-during-start-wait.test.ts` in a scratch worktree at HEAD | red: `countIn: true` 1.5 s after Stop on a stopped Live whose start was lost |
| Finding 2 candidate | `repro/review-2-candidate-stop.diff` applied in that worktree, both review-2 repros in `test/` | `tsc` clean; `vitest run` 68 files, 1408 passed, 4 skipped. Worktree removed |
| Main-side merge | finder agent: `git diff 6f5280d 66a0439 -- src/server/server.ts src/server/fade-out.ts test/harness.ts` | `server.ts` at HEAD still wires `countOff: (ms, countIn) => { fade.fadeInOver(ms); connections.countOff(countIn); }`; `fade-out.ts` only adds `if (closed) return;` to `fromLive`, `fadeInOver` unchanged; the harness only exports `readSetup`. No interaction |
| Em-dashes | `git diff abb58ae 69a091d -- src test` | none |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #217 is Nick's run on real Live |

**Overall:** The remediation holds against its intent. A count-in after a Fade out now re-arms the faded targets whichever section cue ends it, and both halves of that fix are pinned by tests that go red under mutation. A count-in whose start never reaches Live no longer stays held forever: it ends once its Count Off would have played. Two LOW findings remain, both proved and both a few lines. The test meant to pin what happens when Live's start report comes after that timer passes only because the held replies take Live for lost. And Stop still does nothing during that wait, so the Stop half of review 1's finding 2 is open, now bounded to the Count Off's length. The full checks are green.

## Approach decisions
- **The music-back word after a count-in (review 1 finding 1):** `connections.countOff` records whether the word came from a count-in (`musicBack: false | 'section' | 'count-in'`). After a count-in's word, the first section cue re-arms the faded targets whatever its cause. A word from anywhere else keeps `bringsMusicBack`. The controller passes the flag through `countOff(ms, countIn)`. Precedent: the word itself (`connections.ts:121-125`). Carried forward, unchanged.
- **A count-in whose start is lost (review 1 finding 2):** a start-wait timer, armed at the press, that runs for as long as the Count Off would take at Live's tempo. Live's playing report and `clearJump` cancel it. When it fires with Live still stopped, the count-in clears and the change is published. Precedents: `startLostTimer`, and `stopWait` / `forgetStop`. Carried forward, unchanged.
- **The music-back word on the report that enters the count-in's Count Off (review 1 finding 1 rework):** `enteredCountOff` passes `countIn !== null` to `comesBack`. Carried forward, with its known deferred imprecision (see Prior-review closure).
- **Stop during the start wait (finding 2, new):** Stop with a count-in held on a stopped Live clears the count-in at once and publishes the change, then sends the stop as any Stop does. Stop while Live plays keeps waiting for Live's report. Precedent: the startWait callback's own `clearJump(); onChange(snapshot());`, reached sooner. `askStop()` stays in the new branch so that a start still in flight is stopped by Live.
- **Pinning the start-wait timer by test (finding 1, new):** run the test at 240 BPM, so the 2-bar Count Off lasts 2 s and Live's replies are held for fewer than 3 probes (`LOST_AFTER_PROBES`, `src/server/live-bridge.ts:90`). Holding the replies for longer than the probe silence takes Live for lost, which ends a count-in by its own path. The harness states the limit (`test/harness.ts:31-36`).

## Prior-review closure
Prior review: `pre-pr-review-1.md`, at `abb58ae`. Of its 3 findings: 1 fully fixed, 1 partially fixed, 1 partially fixed (LOW).

| Prior finding | Commits | Status now |
| --- | --- | --- |
| 1. A count-in after a Fade out, cancelled by a tap on another song, leaves the faded targets paused (MEDIUM) | `3ade4f3`, rework `c0e5e59` | fixed. Mutations M1, M2 and M9 each turn a count-in row red. The rework's imprecision after the target jump is sent stays as review 1 listed it under Known regressions, deferred, and was not re-reported |
| 2. A count-in whose start never reaches Live stays held on a stopped Live, where Stop cannot clear it (MEDIUM) | `21a0ce6` | partially fixed. Fixed half: the count-in no longer stays held; the start-wait timer ends it once its Count Off would have played (M3 turns "ends a count-in whose start never reached Live" red). Open half: Stop still cannot clear it during that wait, re-rated LOW now that the wait is bounded (finding 2 here). The fix's own failure-path test does not test that path (finding 1 here) |
| 3. Comment hygiene (LOW, aggregated) | none (deferred by default) | partially fixed. Entries 1 to 4 were rewrapped by finding 1's rewrite. Entry 5 is open and carried into finding 3 here |

Nothing was "resolved" only by editing a comment or a doc. Review 1's deferred LOWs on finding 2, (a) `jumpTo` and the landing branch null `countIn` without cancelling `startWait`, (b) `?? countOff.time`, (c) the `'count-in'` word kept after the timer ends a never-started count-in, are unchanged and were not re-reported.

## Confirmed Issues

### 1. The test for a start report that comes after the start-wait timer passes because Live is taken for lost, not because the timer fired — LOW
- **Location:** `test/count-in.test.ts:307-325` ("the lost-jump timer › plays on as an ordinary start when Live reports the start only after its Count Off would have played")
- **Attribution:** introduced by `21a0ce6` (setlist-controller#101 pre-PR review 1 finding 2), which added the test as the pin for review 1 finding 2's "fix's own failure". Not on `$BASE`.
- **Real-world trigger:** none for a user: this is a coverage gap, not a behaviour bug. The candidate replacement test is green at HEAD, so the behaviour the test was meant to pin works today. LOW, capped: a test-quality finding with no user path. The tautology audit's usual MEDIUM does not apply because the path it leaves unpinned is reached only by an event loop stalled for seconds.

**Evidence**
```ts
// test/count-in.test.ts:312-317
rig.live.holdReplies();

leader.send(countIn(BRIDGE));
await viewer.snapshot(countingIn);
await rig.advanceConnected(8 * BEAT_MS + 1000);
await leader.flush();
expect(viewer.received.at(-1)).toMatchObject({ countIn: false, jump: null });
```
`holdReplies` holds every reply, the probe answers included (`src/fake-live/fake-live.ts:74-77`). At 120 BPM the 2-bar Count Off is 4 s, and the test advances 5 s, so 5 probes go unanswered. The bridge takes Live for lost after 3 (`LOST_AFTER_PROBES`, `src/server/live-bridge.ts:90`), and the harness warns of exactly this (`test/harness.ts:35-36`: "hold for less than 3 probes, or the bridge takes Live for lost"). Losing Live runs `clearJump`, which ends the count-in by its own path.

**Failure mode:** the test cannot go red on the path its title names, the timer ending the count-in with Live connected and then a late playing report. Proved three ways. It is green at `279eec8`, before the timer existed. It stays green at HEAD with the timer's callback emptied (mutation M3, run twice). And `repro/review-2-late-start-is-live-lost.test.ts`, the same steps with `live: 'connected'` added to the first assertion, is red at HEAD with `"live": "not-connected"`. After the release, the snapshots show a reconnect, not a late start: `[false,null,...]`, then `[false,0,false,null]`, then `[true,0,false,null]` (the finder's dump). A regression where a late playing report revives the count-in, or sends the jump to the target, would pass. So would one that drops the tempo from the timer: every test runs at 120 BPM, and mutation M7 (`/ 120`) is green.

**Recommended fix**
Replace the body of the test at `test/count-in.test.ts:307-325` with the proved candidate, `repro/review-2-candidate-late-start.test.ts`:
```diff
   it('plays on as an ordinary start when Live reports the start only after its Count Off would have played', async () => {
-    rig = await startRig(SET, { playing: false, position: 40 });
+    rig = await startRig(SET, { playing: false, position: 40, tempo: 240 });
     const viewer = await rig.connectViewer();
     const leader = await rig.connectLeader();
     await leader.snapshot(at(40));
     rig.live.holdReplies();
 
     leader.send(countIn(BRIDGE));
     await viewer.snapshot(countingIn);
-    await rig.advanceConnected(8 * BEAT_MS + 1000);
+    await rig.advanceConnected(4 * BEAT_MS + 500);
     await leader.flush();
-    expect(viewer.received.at(-1)).toMatchObject({ countIn: false, jump: null });
+    expect(viewer.received.at(-1)).toMatchObject({ live: 'connected', countIn: false, jump: null });
```
The rest of the test (the release, the `playing: true, countIn: false, jump: null` assertion, and `rig.received(JUMP)` being only `[[COUNT_OFF_CUE]]`) stays as it is. `4 * BEAT_MS + 500` is 2.5 s, which is 8 beats at 240 BPM plus 500 ms, the same quantity the candidate writes as `8 * FAST_BEAT_MS + 500`.

**Remediation brief**
- **Design intent:** the start-wait timer ends a count-in whose start Live never reported, once its whole Count Off would have played at Live's tempo. Its own failure is a playing report that arrives after that: the count-in is gone by then, so Live plays the Count Off into the Intro as an ordinary start, with no jump to the target. The test must reach that state with Live still connected. Losing Live is a separate path that also ends a count-in.
- **Full surface:** `test/count-in.test.ts:307-325` only. No source change.
- **Must preserve:** the test's title, its place under "the lost-jump timer", and its last three assertions. Also "ends a count-in whose start never reached Live once its Count Off would have played" (`:292`) and "never clears a count-in, before Live reports the start or while it plays" (`:268`), which stay at 120 BPM.
- **Do not touch:** the start-wait timer itself (`src/server/playback-controller.ts:673-678`); mutation M3 shows `:292` pins it.
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-2-late-start-is-live-lost.test.ts test/ && pnpm exec vitest run test/review-2-late-start-is-live-lost.test.ts` is red now (`"live": "not-connected"`), which shows the current test's state. Then apply the fix and check that the new test goes red with the timer dead: in a scratch worktree, replace `if (!countIn || playing) return;` at `src/server/playback-controller.ts:675` with `return;`, run `pnpm exec vitest run test/count-in.test.ts`, and both `:292` and the rewritten test must be red. Change `/ tempo` at `:673` to `/ 120` and the rewritten test must be red again. With the source untouched, `test/count-in.test.ts` is all green. Delete the repro copy from `test/` and keep `repro/`.

### 2. Stop does nothing while a count-in whose start was lost waits on a stopped Live — LOW
- **Location:** `src/server/playback-controller.ts:681-684` (the `stop` case)
- **Attribution:** introduced by `f1efd48` (setlist-controller#213 Count in from stopped to a section) against `$BASE`. Against `abb58ae` it is the open half of review 1 finding 2 ("where Stop cannot clear it"; its failure mode said "A hold on Stop changes nothing"). `21a0ce6` fixed that finding's recorded approach, the timer, and left the `stop` case alone, as review 1's recommended fix did. Not introduced by the remediation.
- **Real-world trigger:** the `start_playing` datagram is lost on loopback, so Live jumps to the Count Off and does not start. The pages read "Count in to Bridge." with no click, and the leader holds Stop. Nothing changes until the Count Off would have played: 4 s for 2 bars of 4/4 at 120 BPM, 16 s for 4 bars at 60 BPM. Then it clears by itself. LOW: a rare trigger, a display that is wrong for a few seconds, and it heals. Upgrade it to MEDIUM if #217 or a service log ever shows a lost `start_playing`.

**Evidence**
```ts
// src/server/playback-controller.ts:681-684
case 'stop':
  // Live reports the stop back, and only then does the snapshot change.
  askStop();
  return;
```
A stopped Live sends no stop report for a `stop_playing`, so the count-in is cleared only by the playing handler's playing-to-stopped edge, which never comes, or by the start-wait timer.

**Failure mode:** `repro/review-2-stop-during-start-wait.test.ts`: lose the next `start_playing`, press Count in to the Bridge, press Stop, advance 1.5 s. The last snapshot is `playing: false, countIn: true, jump: { song: 1, section: 3 }`, red at HEAD. The spec says "Stop cancels the count-in".

**Recommended fix**
```diff
         case 'stop':
+          if (!playing && countIn) {
+            clearJump();
+            askStop();
+            break;
+          }
           // Live reports the stop back, and only then does the snapshot change.
           askStop();
           return;
```
The exact applied form is `repro/review-2-candidate-stop.diff`. `break` reaches the switch's publish, as the `count-in` case's `break` does. The repro goes green with it.

**Remediation brief**
- **Design intent:** while Live is stopped, nothing comes back for a message Live never acted on, so a count-in held on a stopped Live is one whose start never reached Live (the playing report cancels the start wait, and a count-in on a playing Live ends on Live's stop report). Stop is the leader's way to end a count-in. On a playing Live it waits for Live's report, which ends it. On a stopped Live no report will come, so Stop ends it at once.
- **Full surface:** `src/server/playback-controller.ts:681-684` (the `stop` case). The comment at `:682` ("Live reports the stop back, and only then does the snapshot change") must say the new exception: a held count-in on a stopped Live ends at once. The comment on `startWait` (`:135-136`) and on `countOffLost` (`:266-267`) name what ends a never-started count-in, and should name Stop beside the timer. The new test goes in `test/count-in.test.ts` under "the lost-jump timer", beside "ends a count-in whose start never reached Live once its Count Off would have played".
- **Must preserve:** Stop while Live plays still changes nothing until Live reports the stop (the `return` path), pinned by the Stop tests in `test/count-in-change.test.ts` (`:117`, `:135`, `:157`) and `test/transport.test.ts`. Stop while stopped with no count-in still only sends the stop. `askStop()` is still sent in the new branch, so `stopWait` is armed and a start still in flight is followed by Live's stop. Review 1's Needs Further Investigation B (a change during the count while a lost stop waits) is about a playing Live and is not touched by this branch of the case. `test/count-in.test.ts`, `test/count-in-change.test.ts`, `test/count-in-cues.test.ts`, `test/count-in-loop.test.ts`, `test/transport.test.ts` and `test/jump.test.ts` were green with the candidate applied (120 tests), and so was the full suite.
- **The fix's own failure:** if the start was only late and not lost, Live receives `start_playing` then `stop_playing`, plays a moment of the Count Off and stops, and its playing reports arrive with `countIn` already null, so they are an ordinary start and stop. Not executed. The page's Stop needs a full hold (`e2e/stop.spec.ts:14`), so Stop reaches the server well after Live's playing report normally does, and the start-wait timer still backstops a count-in if this branch is never reached.
- **Do not touch:** the start-wait timer (`:673-678`) and the stopped lost timer's exemption for a count-in. See Reviewed and Dismissed.
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-2-stop-during-start-wait.test.ts test/ && pnpm exec vitest run test/review-2-stop-during-start-wait.test.ts test/count-in.test.ts test/count-in-change.test.ts`. The repro is red now (`"countIn": true`), and all three files must pass after. Move the case into `test/count-in.test.ts` and delete the copy from `test/`.

### 3. Comment hygiene — LOW (aggregated)
- `src/server/playback-controller.ts:668-669` — "The music comes back over the whole Count Off, as on Play from start while stopped. The report that moves the playhead into it stays inside the song, and says nothing again." → "The music comes back over the whole Count Off, as on Play from start while stopped. With the playhead in the song, the report that moves it into the Count Off says nothing again; from another song, it says the word again as a count-in's." (review 1 finding 3 entry 5, still open, and now also stale against the `c0e5e59` rework)
- `src/server/playback-controller.ts:675` — the guard `if (!countIn || playing) return;` has no comment and needs none; if finding 2's remediator touches the startWait comment at `:135-136`, it should not describe `playing` as a case the callback meets, since the playing report cancels the timer first (see Minor).

## Needs Further Investigation
Review 1's A (a Count Off off Live's bar grid), B (a change during the count while a lost stop waits) and C (Count in sends the section the page last saw) are untouched by the delta and stand as review 1 wrote them. A belongs to #217's run on real Live; B and C are follow-up ticket material if confirmed.

## Reviewed and Dismissed
- The `'count-in'` word kept after Stop during the count (finder F6). Declared change (a) of review 1 finding 1: Stop sets every volume back, so the music is back and the next section cue of any cause re-arms the faded targets.
- The same word kept after the start-wait timer ends a count-in. Review 1 Known regressions deferred, note (c): "When the timer ends a count-in that Live never started, connections still holds `'count-in'`". Not re-reported.
- A second Count in or Play from start press during the start wait. Both run `clearJump`, which cancels the timer before the new press arms its own.
- A Fade out during the start wait. Refused while Live is stopped; a Fade out during the count still drops the word (`connections.ts:307`).
- A retarget during the start wait, and Live starting then stopping again. The retarget does not touch the timer, and the start report cancels it.
- Live lost or a changed set during the wait. `clearJump` cancels the timer.
- Fire again settling the word. It goes through `hand`, not `deliver`.
- The main-side merge. `server.ts`, `fade-out.ts` and `test/harness.ts` changes do not touch the count-in's wiring (see the table).
- The stopped lost timer never arming for a count-in (finding 2's Do not touch). It is #213's recorded rule, pinned by "never clears a count-in, before Live reports the start or while it plays".

## Minor / nits
- `src/server/playback-controller.ts:675`: `|| playing` in the timer's guard is unreachable. `playing` becomes true only at `:558`, right after `:556` cancels the timer (its only other assignment, `:505`, sets it false). No test lets the Count Off's length pass while a held count-in plays: removing `:556`, `|| playing`, or both stays green (M4 to M6). Removing both would end a late-retargeted count-in at its landing bar with no test red. A test that advances the clock past the Count Off's length while the count-in is held and playing would pin `:556`.
- `src/server/playback-controller.ts:675`: the `!countIn` guard is the fallback for review 1's deferred note (a), where `jumpTo` nulls `countIn` without cancelling the timer, and no test covers it (M8 green). A tap on another song while stopped after a lost start, with that jump still waiting when the timer fires, would reach it.
- The `'count-in'` word also outlives a count-in that ends because Live is lost (finder F6, unexecuted). Like the Stop case, the music began to fade in at the press, so the re-arm on the next section cue is likely right, but neither remediation commit declared it for this path.

## Test quality
Tests added or changed in the delta: 6. Green against `279eec8` (the source before remediation): 3. Two are the Play from start control rows of the new `test/count-in-cues.test.ts` cases, green by design beside their red count-in rows. One is "plays on as an ordinary start when Live reports the start only after its Count Off would have played", which is finding 1: it came from a review-pass commit (`21a0ce6`) as the fix's own failure pin, so the recommendation is to strengthen it, not to delete it. Tautology shapes found: 0 of the four shapes; the one green test is green because its setup reaches a different path. No test computes its expectation with a production helper, mocks the unit under test, uses a snapshot, or lacks assertions.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` pass at `69a091d`. The review-2 files under `repro/` import `../src/...` and `./harness.ts` as if they sat in `test/`, as review 1's do, and pass `eslint` (CI lints them).
- **Commit hygiene:** this doc and its four review-2 files under `repro/` are the only new files. `.epic-loop/` is the run's state, not the PR's.
- **Likely reviewer asks:** whether Stop on a stopped Live should end a count-in at once (finding 2); the declared music-back changes of review 1 finding 1; the one-bar-late landing for a late target change on real Live.

## Verdict
Ready to open a PR, with follow-ups. No finding blocks: the two confirmed findings are LOW and the third is comment hygiene. Both are a few lines with a proved candidate, so landing them on this branch before the PR is cheap and recommended, findings 1 and 2 each with its repro moved into `test/count-in.test.ts` as the red-to-green proof. Of review 1's findings, 1 is fully fixed; finding 2 is partially fixed, with its Stop half open as finding 2 here; finding 3 is partially fixed through incidental rewraps. None was resolved only by a comment or doc edit. The confirmed list kept its size but moved from two MEDIUM behaviour bugs to a test-quality gap and a bounded residual, which is the remediation working rather than the branch failing to improve. Review 1's Needs Further Investigation A to C stand for #217 and follow-up tickets.
