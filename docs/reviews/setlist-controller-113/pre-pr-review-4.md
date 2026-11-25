# Pre-PR review: setlist-controller#113 follow-ups #154, #155 and #156, after the review 3 close-out fix

**Branch:** `setlist-controller-113-connections-foundation` vs `origin/main` (merge-base `ef4a914` "Merge pull request #157 from nick-vogel/setlist-controller-113-connections-foundation")
**Reviewed at:** HEAD `bec11a5` (setlist-controller#113 pre-PR review 3 finding 1: a Fade out clears the word that the music is coming back), clean tree: 0 files with uncommitted changes, 0 untracked; 12 files total, +778 / -27 against the merge-base (review docs and repro files included)
**Delta under review:** since `8200421` (setlist-controller#156 The Fade out comes back early on a loop wrap at the brace end of an overlapped last section), the HEAD that `pre-pr-review-3.md` reviewed. Commits: `25f65eb` (the review 3 doc and its repro files) and `bec11a5` (the fix for review 3 finding 1). Code delta: `src/server/connections.ts` (+9 / -4) and `test/pause-rules.test.ts` (+80).
**Reviewed against:** `pre-pr-review-3.md` (finding 1's brief, findings 2 to 4, Approach decisions, Needs Further Investigation), and the epic body of setlist-controller#113 through it. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules (load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape) are the conformance checklist.
**Date:** 2026-10-21
**Reviewer:** 1 code-review agent (delta, mutation and test audit) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, lockfile up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 43 files, 866 passed, 4 skipped (the four Linux-only laptop-refusal cases in `test/setup-screen.test.ts`) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 42 passed |
| The fix against its intent (review 3 finding 1) | finder traced every `countOff` caller in `src/server/playback-controller.ts` (`enteredCountOff` at `:137`, `comesBack` in Play from start at `:515`) and whether a Fade out can fall between the word and its settling cue | no sequence found where the fix leaves a faded target paused while the music comes back after the Fade out. Every `countOff` also runs `fade.fadeInOver` at that moment (`src/server/server.ts:126-130`), so the music comes back when the word is said, and a later Fade out fades it out again |
| Mutant: `musicBack = false;` removed from `fadeOut` | scratch worktree at `bec11a5`, `repro/review-4-mutation-no-clear-on-fade-out.diff`, `pnpm exec vitest run test/pause-rules.test.ts` | 3 failed, 22 passed: exactly the three new tests. "the next Count Off", "a song with no Count Off" and "the producer's Arm after a Fade out" stay green |
| New tests against `8200421` | equivalent to the mutant: `bec11a5` changes only the one line in production code plus comments | the three new tests red without the fix, green with it |
| Flakiness of the new tests | the three new tests, 8 runs at HEAD (`-t "no cue since"`) | 8 of 8 green |
| Stale-snapshot waits in the new tests | finder read of `next()`, `fadeOut`, `play()` in `test/pause-rules.test.ts` | every wait matches only a snapshot after the call, and every `play()` target differs from the position before it |
| Review 3 findings 2, 3 and 4 | `git diff 8200421 --stat -- test/fade-brace-end.test.ts`, `grep -n console.log test/fade-brace-end.test.ts`, the four comment sites | untouched: no change to `test/fade-brace-end.test.ts`, both `console.log` lines at `:81-82`, all four comments as review 3 quoted them |
| Real Live | not run: the guardrails forbid driving Live | whether Live reports a position on a brace end, and where it leaves the playhead on a stop there, is still unconfirmed |
| Real target adapters | not run: none exists | every connection finding is proved with the fake target only |

**Overall:** The close-out fix does what review 3 finding 1 asked. A Fade out now drops a word that no section cue settled, the reconnect and tap-while-stopped paths leave a faded target paused, and the three new tests fail without the line and pass with it. This round confirms nothing at MEDIUM or above, and nothing new above a comment. Review 3's LOW findings 2 and 3 were not part of the close-out and stand as written; its comment hygiene list stands, with two more entries from this delta. The branch is ready to open the PR.

## Prior-review closure
`pre-pr-review-3.md` has no remediation closure table: stage 2 of the epic loop recorded it as converged with one close-out fix (`bec11a5`, finding 1).

| Review 3 finding | Status | Evidence |
| --- | --- | --- |
| 1. Stale `musicBack` after a reconnect re-arms faded targets (LOW) | fully fixed | `bec11a5`; the mutant re-opens it and turns the three new tests red |
| 2. The #156 wrap guard's reset paths and its `playing` condition untested (LOW) | untouched | `test/fade-brace-end.test.ts` unchanged since `8200421` |
| 3. Debug output in the brace-end test (LOW) | untouched | `test/fade-brace-end.test.ts:81-82` |
| 4. Comment hygiene (LOW) | untouched | all four sites unchanged; carried into finding 3 below |

Prior findings at MEDIUM or above: none, so none is left open. Fully fixed: 1. Partially fixed: 0. Untouched: 3, all LOW. Resolved only by a comment or doc edit: 0.

## Approach decisions
- The music-back word (`musicBack`, `src/server/connections.ts:95`): set by the controller's `countOff`, settled by the next non-End cue, which re-arms the faded targets when `bringsMusicBack` says the cue is where the music comes back (a Count Off, or section 0 of a song with no Count Off). A Fade out clears it (`bec11a5`), so a re-arm needs a `countOff` after the latest Fade out. This round confirms the decision: `countOff` and the fade-in happen together (`src/server/server.ts:126-130`), so a word said before a Fade out never describes the music after it.
- Brace end in the controller (#156): unchanged from `pre-pr-review-3.md`. `onBraceEnd` (`src/server/playback-controller.ts:147-151`) mirrors the cue module's guard; `wrapFrom` carries the section from before the wrap to the next report. The cue module stays frozen per `pre-pr-review-2.md`.
- Carried forward from `pre-pr-review-2.md` and not overturned: adapter calls guarded by `safely`, the server not waiting on a target, the read-only target state, the arm and pause rules, Fire again on `state.now`, the check triggers, the config file's soft failure, the cue causes and the `startWaiting` rule.

## Confirmed Issues
### 1. The #156 wrap guard's reset paths and its `playing` condition have no test that can fail, and the no-Count-Off layout of the brace-end wrap is untested — LOW
- **Location:** `src/server/playback-controller.ts:390` (clear on disconnect), `:434-438` (clear on stop), `:148` (`!playing` in `onBraceEnd`); `test/fade-brace-end.test.ts`
- **Attribution:** introduced by `46fb596` (#156). Carried from `pre-pr-review-3.md` finding 2, untouched by the close-out.
- **Real-world trigger:** none today; a later change that drops one of these lines would pass the suite. The no-Count-Off layout is the more severe form of #156 (on the base the brace-end report snapped every volume back at once through `countOff(0)`), and HEAD fixes it with the same guard, but no test pins it.
**Evidence**
```ts
          if (!event.connected) {
            playing = false;
            position = null;
            liveLoop.on = false;
            wrapFrom = null;
...
          if (!playing) {
            forgetStop();
            wrapFrom = null;
          }
```
**Failure mode** — Removing either clear (`repro/review-3-mutation-no-clear-on-stop.diff`, `repro/review-3-mutation-no-clear-on-disconnect.diff`) or the `!playing ||` check (`repro/review-3-mutation-no-playing-check.diff`) left the whole suite green at `8200421` (863 passed). Without the disconnect clear, a reconnect report in song 1's Count Off after a brace-end report is judged against the stale song 1 section, so the same-song rule swallows the `countOff` a reconnect otherwise gets.
**Recommended fix** — tests only. In `test/fade-brace-end.test.ts`: (a) a brace-end report at `Math.fround(39.99995)`, then `rig.stopLive()`, `rig.clock.advance(4000)`, a wait for `snapshot.live === 'not-connected'`, `rig.startLive({ position: 1, playing: true })`, `rig.clock.advance(1000)`, asserting what the reconnect into song 1's Count Off gives at HEAD and that the disconnect mutant changes it; (b) a brace-end report, then Live stopping and starting, asserting the first report after the start is judged from where the playhead is; (c) a brace-end report while Live is stopped with its loop on, asserting the `playing` check's effect; (d) the first describe's two cases on a layout where song 2 has no Count Off and its first section sits on song 1's End, asserting the fade stays `silent` (red at `ef4a914`).
**Remediation brief**
- **Design intent:** `wrapFrom` holds the section from before a brace-end report for exactly one following report. Anything that ends the playing run (a stop, a lost Live, a new set) drops it, so the next report is judged from where the playhead is.
- **Full surface:** `test/fade-brace-end.test.ts` only. The production lines named above stay as they are.
- **Must preserve:** every existing test in `test/fade-brace-end.test.ts`, `test/fade-out.test.ts` and `test/pause-rules.test.ts`, the three new "a Fade out after the word that the music comes back, with no cue since" cases included.
- **Do not touch:** `src/server/playback-controller.ts` `onBraceEnd` and `wrapFrom` logic; this is a test-gap finding. A case whose mutant cannot be told apart through the rig (the stop clear may be one, if Live's stop report always comes with a position that settles it) is dropped with a note in the closure table rather than forced with a crafted state.
- **Proof:** each new case green at HEAD and red with its mutation diff applied in a scratch worktree: `git apply docs/reviews/setlist-controller-113/repro/review-3-mutation-<name>.diff` then `pnpm exec vitest run test/fade-brace-end.test.ts`; case (d) red at `ef4a914`.

### 2. The brace-end test prints debug output on every run — LOW
- **Location:** `test/fade-brace-end.test.ts:76-82`
- **Attribution:** introduced by `46fb596`, carried over from the issue's proof. Carried from `pre-pr-review-3.md` finding 3, untouched.
- **Real-world trigger:** every `pnpm test` run and every CI log carries two `console.log` lines.
**Evidence**
```ts
    const onBrace = await moveTo(leader, Math.fround(39.99995));
    const wrapped = await moveTo(leader, 25);
    await rig!.advanceConnected(6000);
    const last = await moveTo(leader, 26);

    console.log('brace-end report', { position: onBrace.position, now: onBrace.now, loop: onBrace.loop, fade: onBrace.fade });
    console.log('after wrap', { fade: wrapped.fade }, 'end', { fade: last.fade, volumes: rig!.live.volumes(), sets: rig!.received(SET_VOLUME).length });
```
**Failure mode** — `onBrace` and `wrapped` exist only for the logs; the assertions below them do the work.
**Recommended fix** — replace both `console.log` lines with `expect(onBrace.fade).toBe('silent');` and `expect(wrapped.fade).toBe('silent');`, which pin the state at each step. If either assertion fails at HEAD, delete the two log lines instead and change `:76-77` to plain `await moveTo(...)` calls.
**Remediation brief**
- **Design intent:** the first describe is the ticket's proof; it stays, without its debugging output.
- **Full surface:** `test/fade-brace-end.test.ts:76-82`; the file's header comment (`:6-7`, "The first describe is the ticket's proof as it was given") changes to say the logs were dropped.
- **Must preserve:** the three assertions at `:83-85`.
- **Do not touch:** the second describe.
- **Proof:** `pnpm exec vitest run test/fade-brace-end.test.ts` passes and prints no `stdout |` block.

### 3. Comment hygiene — LOW (aggregated)
Carried from `pre-pr-review-3.md` finding 4, untouched:
- `src/server/server.ts:126` — "The music comes back over the Count Off, and the targets a Fade out paused on its cue." → "The music comes back over the Count Off, or at once on the first locator of a song with no Count Off, and the targets a Fade out paused on that section's cue."
- `src/server/playback-controller.ts:50-51` — "The music comes back on it, and so do the connection targets a Fade out paused (connections.ts)." → "The music comes back on it, or on the first locator of a song with none, and so do the connection targets a Fade out paused (connections.ts)."
- `src/server/connections.ts:143-144` — "as the playback controller judges it" → "the cue only; whether the music did come back is the controller's word, musicBack".
- `src/server/playback-controller.ts:407-408` — "and so may the section kept from before a report on the brace end." → "and so would the section kept from before a report on the brace end, which a stop has already dropped." The clear at `:410` cannot run (a set changes only while Live is stopped, and a stop already clears `wrapFrom`); keep it as defensive.

New from `bec11a5`:
- `src/server/connections.ts:92-94` — "A Fade out clears it, since a word said before the Fade out (on Live's first report after a reconnect, or a tap while stopped, with no cue after it) says nothing about the music after." → "A Fade out clears it, since a word no cue has settled yet (a report while stopped, the first report after a reconnect, a start mid-section, Play from start while a Stop waits) says nothing about the music after." The list named two of the sources; a drag at the laptop while stopped and the Play from start windows are others.
- `test/pause-rules.test.ts:554-555` — "on Live's first report after a reconnect, or on a tap while stopped." → "on Live's first report after a reconnect, or on a move while stopped, such as a tap." Same incomplete list.

## Needs Further Investigation
### A. A brace-end report, then a stop, then a start from the brace end into the next song's Count Off
Carried from `pre-pr-review-3.md` Needs Further Investigation A, untouched. After a stop clears `wrapFrom`, a start from `39.99995` is judged from `now(39.99995)`. If that reads as song 2's Count Off on the overlap layout, the start report is the same section and no `countOff` runs, so faded targets stay paused into song 2. To confirm: a `test/pause-rules.test.ts` case on `TWO_SONGS` with the loop on song 1's Chorus, Fade out, a report at `Math.fround(39.99995)`, `rig.live.setPlaying(false)`, `rig.live.setPlaying(true)` there, then playing into `40.5`, asserting the faded target's state.

### B. Whether the pedal can send a Fade out while the fade is rising
`fade.fadeOut()` does nothing unless the fade is idle (`src/server/fade-out.ts:204-208`), but `connections.fadeOut()` pauses the targets regardless (`src/server/server.ts:121-124`). A Fade out pressed during a fade-in over a Count Off therefore pauses the targets while the music keeps rising. This was already true on the normal path before `bec11a5`, and `src/server/server.ts:119-120` documents it ("whatever the fade then does with it"). The leader page disables the button while a fade runs. To confirm or kill: check whether the pedal's command path (`src/server/` pedal handling) can send `fade-out` while `snapshot.fade` is rising; if it can, decide whether `connections.fadeOut()` should follow the fade's own acceptance.

### C. Carried from `pre-pr-review-2.md`
Needs Further Investigation B (`startWaiting` on a brace-end report, `src/server/cues.ts`) and round 1's B (a stale Play from start song) are untouched by this branch and stand as written.

## Reviewed and Dismissed
- A Fade out between Play from start and its cue (the declared window while a Stop waits, and a second one: Play from start while stopped, when Live reports the start before the playhead's jump and `cues.started` parks the cue in `startWaiting`, `src/server/cues.ts:93-99`). The Fade out clears the word, so the late cue re-arms nothing. Not a defect: `countOff` already brought the music back at the command, the Fade out fades it out again, and a faded target that stays paused matches the music. Before `bec11a5` the same order would arm the targets under a fading mix. Do not add a re-arm for these windows.
- The tap while stopped in the third new test: the stopped jump's report moves the playhead from song 1 into song 2's Count Off, another song, so `enteredCountOff` calls `countOff`; `moveTo(12)` and the start at 12 cannot (song 1's Verse is section 1 of a song with a Count Off). The mutant failure is attributable to the tap's word alone.
- `bringsMusicBack` mutants "any section 0" and "no section check": equivalent in practice, as `pre-pr-review-3.md` found. Keep the checks.
- The renamed install heading breaking a link: no in-repo link to the old anchor.

## Minor / nits
- `test/pause-rules.test.ts:131-137`, `reconnectLive` waits for no snapshot between the loss and the restart. The nearest precedent, `test/fade-out.test.ts:580-583`, waits for `snapshot.live === 'not-connected'` after the same `clock.advance(4000)`. Not a false pass: if the loss were not processed, the report at 41 would raise a cue and `expect(fading.cues).toEqual([])` would catch it, and the tests were 8 of 8 green. Following the precedent would make the helper sturdier.
- No test pins either Play from start window in Reviewed and Dismissed. Both are consistent behaviour, so this is a note, not a gap to fill before the PR.
- `test/fade-brace-end.test.ts:103` prints `steps.slice(15, 30)` as the failure message, fixed to the mid-fade case's window (carried from review 3).
- `test/fade-brace-end.test.ts:136` asserts `steps.every(...)` with `.toBe(true)`, so a failure does not say which step fell (carried from review 3).

## Test quality
Tests added in the delta: 3, in `test/pause-rules.test.ts` (describe "a Fade out after the word that the music comes back, with no cue since"), plus two rig helpers, `reconnectLive` and `startAtLaptop`. Green without the fix: 0 of 3 (`repro/review-4-mutation-no-clear-on-fade-out.diff`: 3 failed, 22 passed). Tautology shapes: none. No mocked unit under test, no snapshots, no assertion-free tests, and each test asserts the target's state and the cues it received. The waits use fresh-snapshot helpers. Robustness: the `reconnectLive` wait (Minor / nits).

## Before opening the PR
- **CI readiness:** lint, typecheck, test (866 passed) and build green locally; Playwright green (42). CI runs the four Linux-only refusal cases this Mac skips.
- **Commit hygiene:** clean tree. This doc and `repro/review-4-mutation-no-clear-on-fade-out.diff` are the only additions.
- **Likely reviewer asks:** whether Live reports a position on a brace end (the #156 fix and round 1's finding 2 rest on it); what a reconnect mid-song does to the faded targets (now pinned by the three new tests).

## Verdict
**Ready to open the PR, with follow-ups.** No finding is at MEDIUM or above, so nothing gates the PR. The close-out fix closes review 3 finding 1 against its intent, with tests that can go red. The confirmed list shrank from four to three, and the only new entries are two comment lines. Findings 1 to 3 are review 3's untouched LOW items (test additions, a test cleanup and comment edits). They can ride one more remediation pass or go as a follow-up ticket. Round 2's deferred LOW findings 1 to 6 and 8 are outside this branch's diff and stand as written in `pre-pr-review-2.md`.
