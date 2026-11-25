# Pre-PR review: setlist-controller#113 follow-ups #154, #155 and #156

**Branch:** `setlist-controller-113-connections-foundation` vs `origin/main` (merge-base `ef4a914` "Merge pull request #157 from nick-vogel/setlist-controller-113-connections-foundation")
**Reviewed at:** HEAD `8200421` (setlist-controller#156 The Fade out comes back early on a loop wrap at the brace end of an overlapped last section), clean tree: 0 files with uncommitted changes, 0 untracked; 7 files total, +402 / -25 against the merge-base
**Delta under review:** none; a fresh review (`--fresh`) of the whole branch since the merge-base. Commits: `021c824`/`8ad3959` (#154), `71a4bba`, merge `1c7223d`, `5b572bf` (#155), `46fb596`/`8200421` (#156).
**Reviewed against:** issues setlist-controller#154, #155 and #156 (their acceptance criteria), the epic body of setlist-controller#113, and `pre-pr-review-2.md` (Approach decisions, findings 7 and 8, Needs Further Investigation A to C). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules (load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape) are the conformance checklist.
**Date:** 2026-10-21
**Reviewer:** 1 code-review agent + 1 test-oracle and mutation agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, lockfile up to date |
| Lint | `pnpm lint`, then `pnpm exec eslint` on this round's `repro/` test | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 43 files, 863 passed, 4 skipped (the four Linux-only laptop-refusal cases in `test/setup-screen.test.ts`) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 42 passed |
| Branch tests against `ef4a914` | scratch worktree at the merge-base, HEAD's `test/fade-brace-end.test.ts` and `test/pause-rules.test.ts` copied in | 8 of the 11 added tests red at the base. Green at the base: "brings the music back when a jump to the Count Off lands on the brace end while Live still reports the loop on" (`46fb596`), "leaves paused by hand a target the Fade out paused and then someone changed by hand" and "leaves a target the Fade out paused when a jump inside the song lands on its first section after the music came back once" (both `71a4bba`). All three guard against an over-broad fix, and the first kills the `lands` mutants below. Keep them |
| Mutants of the #156 controller change | scratch worktree at HEAD; `fade-brace-end`, `pause-rules`, `fade-out`, `cue-causes`, then the whole suite for survivors | killed: `onBraceEnd` always false (5 red), `lands` forced false (1 red), the `wrapFrom` carry dropped (2 red), the guard judged after the jump clears (1 red). Survived the whole suite (863 passed): no `wrapFrom` clear on stop (`repro/review-3-mutation-no-clear-on-stop.diff`), on disconnect (`repro/review-3-mutation-no-clear-on-disconnect.diff`), on a set change, and no `playing` check in `onBraceEnd` (`repro/review-3-mutation-no-playing-check.diff`). Finding 2 |
| Mutants of the #155 connections change | same | killed: `bringsMusicBack` back to Count Off only (3 red). Survived: any section 0 brings the music back, and the section-0 check removed. Both are equivalent in practice, see Reviewed and Dismissed |
| Stale `musicBack` after a reconnect | `repro/review-3-stale-music-back.test.ts` in scratch worktrees at HEAD and at `ef4a914`; then HEAD with `musicBack = false;` first in `fadeOut()` | HEAD: both cases red (the faded target ends `armed`). Base: the song-with-no-Count-Off case green, the Count Off case red. HEAD with the fix: both green, and `pause-rules`, `fade-brace-end`, `fade-out`, `connections` 91 passed; the finder ran the whole suite with the same fix, 866 passed. Finding 1 |
| Event order | finder read `src/server/server.ts:94-131` | `controller.fromLive` calls `countOff` (the fade and `connections.countOff()`) synchronously before `onChange` runs `cues.observe` and `deliver` for the same report; `currentSet()` is the controller's set, which cannot change while Live plays. `bringsMusicBack` judges the cue against the set it was raised from |
| #154 docs | `web/src/Setup.tsx:169-171`, `git grep` for links to the renamed heading, the file name in `src/server/leader-secret.ts:14` | the setup screen draws Leader, Producer, View only, as the text says; no in-repo link to the old anchor; section numbers unchanged; no em-dash in the new lines; `producer-secret` is the real file name |
| README | `test/readme.test.ts` and the finder's read of the changed sentences | match the code |
| Real Live | not run: the guardrails forbid driving Live | whether Live reports a position on a brace end, and where it leaves the playhead on a stop there, is still unconfirmed |
| Real target adapters | not run: none exists | every connection finding is proved with the fake target only |

**Overall:** The three follow-ups do what their tickets ask. The install guide covers the producer page and its secret, a song with no Count Off arms the faded targets again on its first section, and a loop wrap reported on the brace end no longer brings a Fade out back in or re-arms a faded target. That last one also closes `pre-pr-review-2.md` Needs Further Investigation A. This round confirms nothing at MEDIUM or above. It finds one LOW defect: #155 widens the old stale `musicBack` word, which a reconnect leaves set, to songs with no Count Off. It also finds untested reset paths in the #156 change, debug output left in a test, and comment drift. The branch is ready to open the PR, and the findings can ride a short remediation pass or a follow-up ticket.

## Approach decisions
- Brace end in the controller (#156): a playing report on the brace end of Live's reported loop is the loop going round, and the controller does not judge it as entering the section that starts there. `onBraceEnd` (`src/server/playback-controller.ts:147-151`) mirrors the cue module's guard (`src/server/cues.ts` `onBraceEnd`) condition for condition: the jump still waiting, `position !== at`, and a target of End or the section the report is in. `wrapFrom` carries the section from before the wrap to the next report. Precedent: `reachedEnd`, and the cue module's frozen guard. The cue module stays frozen per `pre-pr-review-2.md`.
- The music-back word (`musicBack`, `src/server/connections.ts:91`): set by the controller's `countOff`, settled by the next non-End cue, which re-arms the faded targets when `bringsMusicBack` says the cue is where the music comes back (a Count Off, or section 0 of a song with no Count Off). This review adds that a Fade out clears the word, so a re-arm needs a `countOff` after the latest Fade out (finding 1).
- Carried forward from `pre-pr-review-2.md` and not overturned: adapter calls guarded by `safely`, the server not waiting on a target, the read-only target state, the arm and pause rules, Fire again on `state.now`, the check triggers, the config file's soft failure, the cue causes and the `startWaiting` rule.

## Confirmed Issues
### 1. After Live reconnects in a song's first section, a Fade out and a restart of that section arm the faded targets again while the music stays faded — LOW
- **Location:** `src/server/connections.ts:225-229` (`fadeOut`), with `deliver` at `:212-219` and `bringsMusicBack` at `:141-146`
- **Attribution:** pre-existing, exposed. On `ef4a914` the stale word already re-arms on a Count Off cue (the repro's second case is red there). `5b572bf` and `71a4bba` (#155) add section 0 of a song with no Count Off as a cue that consumes the word (`git log -S'bringsMusicBack' ef4a914..HEAD`), so the same stale word now re-arms in that song shape too (the repro's first case is green at the base and red at HEAD). This is the old `pre-pr-review-1.md` Needs Further Investigation C (`musicBack` across a reconnect), now proved.
- **Real-world trigger:** AbletonOSC drops and comes back mid-song with the playhead in a song's first section (a Count Off, or the first section of a song with no Count Off). The leader then fades out inside that section and restarts it (Previous, or a tap on it) before the playhead plays into any other section. The faded target shows "Armed" and gets the restarted section's cue while the music is still faded. Capped at LOW: it needs a Live dropout landing in a first section and that exact order before any other section cue, and no real target exists yet (the epic ships the fake only). Upgrade to MEDIUM if real sets show Live dropouts mid-service; check the server log for "Live not connected" during services once an adapter ships.
**Evidence**
```ts
deliver(cue) {
  if (cue.section !== 'end') {
    if (musicBack && bringsMusicBack(cue)) {
      for (const entry of entries) if (entry.pause === 'fade-out') set(entry, { arm: 'armed', pause: null });
    }
    musicBack = false;
  }
...
fadeOut() {
  for (const entry of entries) {
    if (entry.arm === 'armed' && entry.target.pausesOnFade) set(entry, { arm: 'paused', pause: 'fade-out' });
```
**Failure mode** — On a reconnect the controller's first position report runs `enteredCountOff(null, after)`, and with the playhead in a first section it calls `countOff`, which sets `musicBack`. The cue module raises no cue for a report whose previous position is null, so nothing settles the word. A Fade out then pauses the target and leaves the word set; the jump landing on that first section raises its cue, `bringsMusicBack` says yes, and the target is armed again with `fade` still `out`. Executed: `repro/review-3-stale-music-back.test.ts`, both cases `expected { name: 'fading', … } to match object { arm: 'paused', pause: 'fade-out' }` at HEAD.
**Recommended fix**
```diff
     fadeOut() {
+      musicBack = false;
       for (const entry of entries) {
         if (entry.arm === 'armed' && entry.target.pausesOnFade) set(entry, { arm: 'paused', pause: 'fade-out' });
       }
     },
```
**Remediation brief**
- **Design intent:** a target a Fade out paused arms again only where the music comes back after that Fade out. The controller says the music comes back through `countOff`, which sets the word; the next non-End cue settles it, re-arming when the cue is a Count Off or the first section of a song with no Count Off, and dropping it otherwise. With the fix, a Fade out discards any word set before it, so only a `countOff` after the latest Fade out can re-arm.
- **Full surface:** `src/server/connections.ts:225` (`fadeOut`), the only change. Update the word's comment at `src/server/connections.ts:89-90` ("Set by countOff until the next section cue") to say a Fade out clears it too, and the `countOff` doc at `:39-45` if it states the word's lifetime. Add the repro's two cases to `test/pause-rules.test.ts`, using its `pauseRig`, `NO_COUNT_OFF` and `TWO_SONGS`, with Live dropped by `rig.stopLive()`, `rig.clock.advance(4000)`, `rig.startLive({ position: 41, playing: true })`, `rig.clock.advance(1000)`.
- **Must preserve:** the re-arm on the next Count Off after a Fade out (`test/pause-rules.test.ts` describe "the next Count Off"), the re-arm on the first section of a song with no Count Off, Play from start included ("a song with no Count Off"), the producer's Arm after a Fade out ("the producer's Arm after a Fade out"), and the brace-end cases. `countOff` and the cue of the same report run synchronously in that order (`src/server/server.ts:94-131`), so no Fade out can fall between them there. The one window where one can is Play from start while a sent Stop is not yet reported (`src/server/playback-controller.ts:503-516`): `comesBack` runs at the command and the cue only on Live's start report, so a Fade out tapped inside that sub-second window now leaves the faded targets paused. Declared acceptable: the producer page shows "Paused by Fade out" and Arm clears it, and a Fade out right after asking for a song's start is not a real sequence.
- **Do not touch:** the cue module's brace-end guard (`src/server/cues.ts`, frozen per `pre-pr-review-2.md`), and `bringsMusicBack`'s section-0 check (Reviewed and Dismissed). Do not move the fix into the controller (skipping `countOff` on a report with no previous position): that changes the fade's path on every reconnect and first connect, which `test/fade-out.test.ts` pins.
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-113/repro/review-3-stale-music-back.test.ts test/ && pnpm exec vitest run test/review-3-stale-music-back.test.ts; rm test/review-3-stale-music-back.test.ts`. Both cases red now and green after the fix; then the two cases land in `test/pause-rules.test.ts` and `pnpm test` stays green.

### 2. The #156 wrap guard's reset paths and its `playing` condition have no test that can fail, and the no-Count-Off layout of the brace-end wrap is untested — LOW
- **Location:** `src/server/playback-controller.ts:390` (clear on disconnect), `:434-438` (clear on stop), `:148` (`!playing` in `onBraceEnd`); `test/fade-brace-end.test.ts` and the brace-end describe in `test/pause-rules.test.ts`
- **Attribution:** introduced by `46fb596` (#156).
- **Real-world trigger:** none today; a later change that drops one of these lines would pass the suite. The no-Count-Off layout is the more severe form of #156 (on the base the brace-end report snapped every volume back at once through `countOff(0)`), and it is fixed at HEAD by the same guard, but no test pins it.
**Evidence**
```ts
          if (!event.connected) {
            ...
            wrapFrom = null;
...
          if (!playing) {
            forgetStop();
            wrapFrom = null;
          }
```
**Failure mode** — Removing either clear (`repro/review-3-mutation-no-clear-on-stop.diff`, `repro/review-3-mutation-no-clear-on-disconnect.diff`) or the `!playing ||` check (`repro/review-3-mutation-no-playing-check.diff`) leaves the whole suite green, 863 passed. Without the disconnect clear, a reconnect report in song 1's Count Off after a brace-end report is judged against the stale song 1 section, so the same-song rule swallows the `countOff` a reconnect otherwise gets.
**Recommended fix** — tests only. In `test/fade-brace-end.test.ts`: (a) a brace-end report at `Math.fround(39.99995)`, then `rig.stopLive()`, `rig.clock.advance(4000)`, `rig.startLive({ position: 1, playing: true })`, `rig.clock.advance(1000)`, asserting what the reconnect into song 1's Count Off gives at HEAD and that the disconnect mutant changes it; (b) a brace-end report, then Live stopping and starting, asserting the first report after the start is judged from where the playhead is; (c) a brace-end report while Live is stopped with its loop on, asserting the `playing` check's effect; (d) the first describe's two cases on a layout where song 2 has no Count Off and its first section sits on song 1's End, asserting the fade stays `silent` (red at `ef4a914`).
**Remediation brief**
- **Design intent:** `wrapFrom` holds the section from before a brace-end report for exactly one following report. Anything that ends the playing run (a stop, a lost Live, a new set) drops it, so the next report is judged from where the playhead is.
- **Full surface:** `test/fade-brace-end.test.ts` only. The production lines named above stay as they are.
- **Must preserve:** every existing test in `test/fade-brace-end.test.ts`, `test/fade-out.test.ts` and `test/pause-rules.test.ts`.
- **Do not touch:** `src/server/playback-controller.ts` `onBraceEnd` and `wrapFrom` logic; this is a test-gap finding. A case whose mutant cannot be told apart through the rig (the stop clear may be one, if Live's stop report always comes with a position that settles it) is dropped with a note in the closure table rather than forced with a crafted state.
- **Proof:** each new case green at HEAD and red with its mutation diff applied in a scratch worktree: `git apply docs/reviews/setlist-controller-113/repro/review-3-mutation-<name>.diff` then `pnpm exec vitest run test/fade-brace-end.test.ts`; case (d) red at `ef4a914`.

### 3. The new brace-end test prints debug output on every run — LOW
- **Location:** `test/fade-brace-end.test.ts:76-82`
- **Attribution:** introduced by `46fb596`, carried over from the issue's proof.
- **Real-world trigger:** every `pnpm test` run and every CI log carries two `console.log` lines.
**Evidence**
```ts
    const onBrace = await moveTo(leader, Math.fround(39.99995));
    const wrapped = await moveTo(leader, 25);
    ...
    console.log('brace-end report', { position: onBrace.position, now: onBrace.now, loop: onBrace.loop, fade: onBrace.fade });
    console.log('after wrap', { fade: wrapped.fade }, 'end', { fade: last.fade, volumes: rig!.live.volumes(), sets: rig!.received(SET_VOLUME).length });
```
**Failure mode** — `onBrace` and `wrapped` exist only for the logs; the assertions below them do the work.
**Recommended fix** — delete both `console.log` lines and change lines 76-77 to `await moveTo(leader, Math.fround(39.99995));` and `await moveTo(leader, 25);`, or replace the logs with `expect(onBrace.fade).toBe('silent')` and `expect(wrapped.fade).toBe('silent')`, which pin the state at each step.
**Remediation brief**
- **Design intent:** the first describe is the ticket's proof; it stays, without its debugging output.
- **Full surface:** `test/fade-brace-end.test.ts:76-82`; the file's header comment (`:6-7`, "the ticket's proof as it was given") changes to say the logs were dropped.
- **Must preserve:** the three assertions at `:83-85`.
- **Do not touch:** the second describe.
- **Proof:** `pnpm exec vitest run test/fade-brace-end.test.ts` passes and prints no `stdout |` block.

### 4. Comment hygiene — LOW (aggregated)
- `src/server/server.ts:126` — "The music comes back over the Count Off, and the targets a Fade out paused on its cue." → "The music comes back over the Count Off, or at once on the first locator of a song with no Count Off, and the targets a Fade out paused on that section's cue."
- `src/server/playback-controller.ts:50-51` — "The music comes back on it, and so do the connection targets a Fade out paused (connections.ts)." → "The music comes back on it, or on the first locator of a song with none, and so do the connection targets a Fade out paused (connections.ts)."
- `src/server/connections.ts:139-140` — "as the playback controller judges it" → "the cue only; whether the music did come back is the controller's word, musicBack". The function checks the cue's section, and the controller's judgement reaches it only through the word.
- `src/server/playback-controller.ts:407-410` — the `wrapFrom` clear on a set change cannot run (a set only changes while Live is stopped or before the first set, and a stop already clears `wrapFrom`). "and so may the section kept from before a report on the brace end" → keep the line and say it is defensive: "and so would the section kept from before a report on the brace end, which a stop has already dropped."

## Needs Further Investigation
### A. A brace-end report, then a stop, then a start from the brace end into the next song's Count Off
After a stop clears `wrapFrom`, a start from `39.99995` is judged from `now(39.99995)`. If that reads as song 2's Count Off on the overlap layout, the start report is the same section and no `countOff` runs, so faded targets stay paused into song 2 (the stop has already restored the volumes). At the base the brace-end report itself had set the word. It depends on where real Live leaves the playhead on a stop and whether `nowPlaying` puts `39.99995` in song 1 or song 2. To confirm: a `test/pause-rules.test.ts` case on `TWO_SONGS` with the loop on song 1's Chorus, Fade out, a report at `Math.fround(39.99995)`, `rig.live.setPlaying(false)`, `rig.live.setPlaying(true)` there, then playing into `40.5`, asserting the faded target's state.

### B. Carried from `pre-pr-review-2.md`
Needs Further Investigation B (`startWaiting` on a brace-end report, `src/server/cues.ts`) and round 1's B (a stale Play from start song) are untouched by this branch and stand as written. Round 2's A is closed by #156: the brace-end report no longer calls `countOff`, and `test/pause-rules.test.ts` "leaves a target the Fade out paused when a jump inside song 1 then lands on song 1's Count Off" pins it (red at `ef4a914`).

## Reviewed and Dismissed
- `bringsMusicBack` mutants "any section 0" and "no section check" survive the suite: equivalent in practice. The word is set only by `countOff`, which the controller calls on entering a Count Off or the first locator of a song with no Count Off, and the cue of that same report is that section's cue. A section-0 cue in a song with a Count Off, or a later section in a song without one, cannot follow a fresh word. Keep the checks; do not delete them as dead.
- A laptop click landing exactly on the brace end while Live's loop is on reads as a wrap, so `countOff` comes one report later with a shorter fade-in: the same reading the cue module makes, and one report is about 100 ms.
- Play from start while a sent Stop waits, after a brace-end report: `comesBack` runs at the command, and the Stop's report clears `wrapFrom` before the landing, so no second `countOff`; duplicate `countOff` calls for other shapes are pre-existing.
- `onBraceEnd` reading Live's reported loop rather than the asked-for one: matches `reachedEnd` and the cue module, which read Live's word.
- A loop on a non-last section: its brace end is inside the song, which the same-song rule already left alone, so the guard changes nothing there.
- `startedSong` left set across a skipped brace-end report: the next report, judged from `wrapFrom`, still uses it, and Play from start of song 1 during the loop still brings the music back.
- The renamed install heading breaking a link: no in-repo link to the old anchor.

## Minor / nits
- `test/fade-brace-end.test.ts:103` prints `steps.slice(15, 30)` as the failure message, fixed to the mid-fade case's window.
- `test/fade-brace-end.test.ts:136` asserts `steps.every(...)` with `.toBe(true)`, so a failure does not say which step fell.

## Test quality
Tests added: 11 (5 in `test/fade-brace-end.test.ts`, 6 in `test/pause-rules.test.ts`). Green against `ef4a914`: 3, each kept: they pin that the fix is not over-broad (a jump landing on the brace end still brings the music back; a target paused by hand stays paused; a jump inside the song does not re-arm). Tautology shapes: none. No mocked unit under test, no snapshots, no assertion-free tests; the waits use fresh-snapshot helpers (`next`) or positions not reported earlier in the test. Unpinned decisions: the `wrapFrom` reset paths and the `playing` check (finding 2). Debug output: finding 3.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green locally; Playwright green (42). CI runs the four Linux-only refusal cases this Mac skips.
- **Commit hygiene:** clean tree. This doc, `repro/review-3-stale-music-back.test.ts` and the three `repro/review-3-mutation-*.diff` files are the only additions.
- **Likely reviewer asks:** whether Live reports a position on a brace end (the #156 fix and round 1's finding 2 rest on it); what a reconnect mid-song does to the faded targets (finding 1).

## Verdict
**Ready to open the PR, with follow-ups.** No finding is at MEDIUM or above, so nothing gates the PR. #154, #155 and #156 meet their acceptance criteria, and #156 closes `pre-pr-review-2.md` Needs Further Investigation A. Findings 1 to 4 are small: a one-line fix with two tests, test additions, a test cleanup and comment edits. They can ride one remediation pass before the PR, or go as a follow-up ticket. Finding 1 is best landed before the first target epic registers an adapter. Round 2's deferred LOW findings 1 to 6 and 8 are outside this branch's diff and stand as written in `pre-pr-review-2.md`. Its finding 7 is closed by #154.
