# Pre-PR review: setlist-controller#101 Rehearsal: count-off into a section

**Branch:** `setlist-controller-101-count-off-into-section` vs `origin/main` (merge-base `6f5280d` "Merge pull request #211 from nick-vogel/setlist-controller-58-planning-center-plan")
**Reviewed at:** HEAD `abb58ae` (setlist-controller#215 Count-in cues, the fade-in and the re-arm), clean tree: 0 files with uncommitted changes, 0 untracked; 22 files total, +2102 / -75 against the merge-base
**Reviewed against:** the epic body of setlist-controller#101 (the spec); the bodies of sub-issues #213, #214, #215 and #216 (#217 is Nick's acceptance run on real Live, not code); the run's recorded decisions and out-of-scope proposals per ticket (`.epic-loop/tickets/<n>/assumptions.md`, `proposals.md`), read so that a recorded decision is not re-reported as a defect; the per-ticket reviews in `.epic-loop/tickets/213/review-1.md` and `.epic-loop/tickets/215/review-1.md`, for what an earlier round already settled. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 1, `--fresh`.
**Date:** 2026-10-23
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date, lockfile unchanged against the merge-base |
| Lint | `pnpm lint` | pass, before the two repros below were added; each repro then passes `pnpm exec eslint <file>` on its own |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 62 files, 1253 passed, 4 skipped |
| Build and Playwright | `pnpm test:e2e` (runs `pnpm build` first) | build ok; 50 passed, `e2e/count-in.spec.ts` included, WebKit iPad and Chromium Android |
| Tautology audit, oracle `6f5280d` | the branch's 7 new or changed unit test files copied into a scratch worktree at BASE, run per file with the JSON reporter | 75 tests added or changed: 62 red, 13 green at base (see Test quality) |
| Mutation M1: `if (before.countIn && state.countIn) return;` deleted from `src/server/cues.ts:135` | scratch worktree at HEAD, the four count-in test files and `test/cue-causes.test.ts` | 9 tests red: the "no cue while the count-in is held" rule is pinned |
| Mutation M2: the Pad refusal deleted from `src/shared/count-in.ts:31` | scratch worktree at HEAD, `test/count-in.test.ts` | "is refused on a Pad" red: that refusal test, green at base, still guards its rule |
| Mutation M3: `if (playing) return;` deleted from the `count-in` case | scratch worktree at HEAD, `test/count-in.test.ts` | "is refused while Live plays" red: the same holds |
| Finding 1 repro | `repro/review-1-other-song-tap-after-fade.test.ts` copied into `test/` of a scratch worktree at HEAD | the count-in row red (`arm: 'paused'` where `armed` is expected); the Play from start control row green |
| Finding 2 repro | `repro/review-1-lost-start.test.ts` copied the same way | red: `countIn: true` on a stopped Live 5 s after a press whose start was lost |
| Both recommended fixes | `repro/review-1-candidate-fixes.diff` applied in the scratch worktree, both repros in `test/` | `tsc` clean, `eslint src test` clean, `vitest run` 64 files, 1256 passed, 4 skipped: both repros green, nothing else red. The worktree is since removed |
| Cue causes downstream | finder B: `git grep` of `play-from-start` and `.cause` across `src/` and `web/` | the only consumers are `CueCause`, `CAUSES` in `src/lateness/summary.ts:10` (which also validates log lines), the log line type and the connections pass-through; all carry `count-in` |
| The cue module and the controller agree on "a count-in to the top is Play from start" | finder B, read of `src/server/cues.ts:203-209` against the controller's guards (`playback-controller.ts:601`, `:636`) and `hub.ts:54` | no input found on which the two disagree |
| ATEM | read of `src/server/atem.ts:123` | acts only on a cue named Count Off, so a count-in's landing never cuts the lobby feed |
| Em-dashes in shipped strings and docs | `git diff 6f5280d \| grep '^+' \| grep '—'` | none |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #217 is Nick's run on real Live |

**Overall:** The count-in holds up well. Every acceptance criterion of #213 to #216 has a seam-1 or e2e test that goes red at base, the full checks are green, and the cue rules, the loop rule and the auto-stop are tight under mutation. Two MEDIUM findings should land before the PR. A count-in after a Fade out that the leader cancels with a tap on another song leaves the faded targets paused. A count-in whose start never reaches Live stays held on a stopped Live, where Stop cannot clear it. Both fixes are small and were proved in a scratch worktree with the whole suite green.

## Approach decisions
- **The music-back word after a count-in (finding 1):** `connections.countOff` records whether the word came from a count-in (`musicBack: false | 'section' | 'count-in'`). After a count-in's word, the first section cue re-arms the faded targets whatever its cause, because the music came back at the press and a count-in raises no Count Off cue to carry the re-arm. A word from anywhere else keeps today's rule (`bringsMusicBack`). The controller passes the flag through its existing `countOff(ms)` output, as an optional second argument. The precedent is the word itself (`connections.ts:121-125`, settled by the next section cue). This keeps #215's rule that a `count-in` cue re-arms, and widens it to the other first cues a count-in can be followed by.
- **A count-in whose start is lost (finding 2):** a start-wait timer, armed at the press, that runs for as long as the Count Off would take at Live's tempo. It is cancelled by Live's report that it plays, and by `clearJump`. When it fires with Live still stopped, the count-in clears and the change is published. The precedents are `startLostTimer` (`playback-controller.ts:360-368`: `clock.every`, cancels itself, publishes through `onChange`) and `stopWait` / `forgetStop` for a lost stop. The stopped lost timer's exemption for a count-in (#213) stays as it is: the new timer runs longer than any report latency the "never clears a count-in" test models.
- **The music-back word on the report that enters the count-in's Count Off (finding 1 rework, remediation 1):** `enteredCountOff` passes `countIn !== null` to `comesBack`, so the press's own report from another song into the Count Off keeps the word `'count-in'`. The precedent is the press's own `comesBack(..., true)`. A lost jump or Count Off clears the count-in earlier in the same report, so before the target jump is sent, a held count-in there means the report is in its own Count Off.

## Confirmed Issues

### 1. A count-in after a Fade out, cancelled by a tap on another song, leaves the faded targets paused — MEDIUM
- **Location:** `src/server/connections.ts:297` (`deliver`) and `:177-178` (`bringsMusicBack`), with the count-in's cue suppression at `src/server/cues.ts:135`
- **Attribution:** introduced by `ae25b14` (setlist-controller#215 Count-in cues, the fade-in and the re-arm). `git log -S"cue.cause === 'count-in'"` and `git log -S"if (before.countIn && state.countIn) return;"` over `6f5280d..HEAD` both name `ae25b14` first. At base, Play from start's Count Off cue re-arms at the start itself (the repro's control row is green). The count-in moved the re-arm to its landing, and a cancel skips the landing.
- **Real-world trigger:** the leader runs Fade out at the end of a song, stops, taps a section of the song and presses Count in, then taps a section of another song during the count (a recorded decision: that is an ordinary jump). The jump lands on a section that is not that song's Count Off or its first section with no Count Off. Rehearsals often run fades, so this is attainable but uncommon. MEDIUM, capped: the producer page shows each target "Paused by Fade out", so the producer can press Arm. Upgrade it if Nick runs rehearsals with no producer watching the Connections panel.

**Evidence**
```ts
// src/server/connections.ts:294-300
if (cue.section !== 'end') {
  if (musicBack && bringsMusicBack(cue)) {
    for (const entry of entries) if (entry.pause === 'fade-out') set(entry, { arm: 'armed', pause: null });
  }
  musicBack = false;
}
```
`bringsMusicBack` is true only for a Count Off cue, a `count-in` cue, or the first section of a song with no Count Off. The other song's jump lands with the cause `jump`.

**Failure mode:** Fade out, then Stop (every volume is set back). Count in to song 1's Bridge: the press says the music is back (`musicBack = true`) and no cue fires during the count. A tap on song 2's Verse lands with the cause `jump`. `bringsMusicBack` is false, so the word is dropped, and the paused target stays paused for the rest of the song, with no Verse cue. Meanwhile the music plays at full level. Proved by `repro/review-1-other-song-tap-after-fade.test.ts`: the count-in row reads `"arm": "paused"`. The Play from start row, the same steps with Play from start in place of Count in, stays armed.

**Recommended fix**
```diff
--- a/src/server/playback-controller.ts
-  countOff(ms: number): void;
+  countOff(ms: number, countIn?: boolean): void;
...
-  const comesBack = (address: SectionAddress, at: number) => {
+  const comesBack = (address: SectionAddress, at: number, countIn = false) => {
...
-    if (section.name === COUNT_OFF && section.end !== null) countOff(((section.end - at) * 60_000) / tempo);
+    if (section.name === COUNT_OFF && section.end !== null) countOff(((section.end - at) * 60_000) / tempo, countIn);
...
-          comesBack({ song: song.number, section: rule.countOff }, countOff.time);
+          comesBack({ song: song.number, section: rule.countOff }, countOff.time, true);
--- a/src/server/server.ts
-    countOff: (ms) => {
+    countOff: (ms, countIn) => {
       fade.fadeInOver(ms);
-      connections.countOff();
+      connections.countOff(countIn);
--- a/src/server/connections.ts
-  countOff(): void;
+  countOff(countIn?: boolean): void;
...
-  let musicBack = false;
+  let musicBack: false | 'section' | 'count-in' = false;
...
-        if (musicBack && bringsMusicBack(cue)) {
+        if (musicBack === 'count-in' || (musicBack && bringsMusicBack(cue))) {
...
-    countOff() {
-      musicBack = true;
+    countOff(countIn = false) {
+      musicBack = countIn ? 'count-in' : 'section';
```
The exact applied form is `repro/review-1-candidate-fixes.diff`, which also carries finding 2's hunks.

**Remediation brief**
- **Design intent:** a Fade out pauses every armed target that pauses on a fade. The controller's `countOff` output is its word that the music is back, and the next section cue settles that word: a cue where the music comes back re-arms the paused targets, any other drops the word, and a Fade out drops it too. A count-in brings the music back at the press but raises no cue until it ends. So the cue that ends it, whichever it is, is the one where the targets come back.
- **Full surface:** `src/server/playback-controller.ts:56` (`ControllerOutput.countOff`), `:141-146` (`comesBack`), `:659` (the `count-in` case's `comesBack`); `src/server/server.ts:132-135`; `src/server/connections.ts:57` (the `countOff` type), `:125` (`musicBack`), `:297` (`deliver`), `:312-313` (`countOff`). The comments that state the rule must say the new one: `connections.ts:19-22`, `:41-44`, `:48-55`, `:121-124`, `:175-176`, and `playback-controller.ts:53-55`. The fakes of `ControllerOutput` in `test/cue-lateness.test.ts:392`, `:429` and `test/play-from-start-window.test.ts:32`, `:62` need no change, since the argument is optional.
- **Must preserve:** `bringsMusicBack`'s `cue.cause === 'count-in'` clause stays. `enteredCountOff` can call `comesBack` a second time without the flag (a press made with the playhead in another song, which no page sends), and that turns the word back into `'section'`; the landing cue must still re-arm then. A Fade out during the count still drops the word (`fadeOut` sets `musicBack = false`), so the landing does not re-arm. An End cue still leaves the word for the next cue (the `cue.section !== 'end'` guard). Play from start and a song's Count Off keep today's rule. Pinned by `test/count-in-cues.test.ts` "a count-in after a Fade out" (both tests), `test/pause-rules.test.ts`, `test/connections.test.ts` and `test/fade-out.test.ts`.
- **Declared changes in behaviour:** (a) after Stop during a count, the word from the count-in is still held, so the next section cue of any cause re-arms the faded targets. The Stop has set every volume back by then, so the music is back. (b) a count-in whose jump to the Count Off is lost now re-arms on the `played-into` cue of the section Live starts on. That closes the #215 proposal "A count-in after a Fade out whose jump to the Count Off is lost leaves the faded targets paused" for a count-in. Play from start keeps its base behaviour in the same case.
- **Do not touch:** the cue suppression while a count-in is held (`cues.ts:135`), which mutation M1 shows is pinned; the ATEM's Count Off-only rule (`atem.ts:123`). See Reviewed and Dismissed.
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-1-other-song-tap-after-fade.test.ts test/ && pnpm exec vitest run test/review-1-other-song-tap-after-fade.test.ts`. The count-in row is red now, and both rows must pass after. Move the case into `test/count-in-cues.test.ts` under "a count-in after a Fade out" and delete the copy, rather than committing it from `test/`.

### 2. A count-in whose start never reaches Live stays held on a stopped Live, where Stop cannot clear it — MEDIUM
- **Location:** `src/server/playback-controller.ts:633-662` (the `count-in` case), with the playing handler at `:544-561`
- **Attribution:** introduced by `f1efd48` (setlist-controller#213 Count in from stopped to a section). `git log -S"countIn = { countOff, sent: false"` names it. The ticket's prep already filed this as a proposal ("A count-in whose start never reaches Live stays held on a stopped Live", `.epic-loop/tickets/213/proposals.md`). #213 review-1 F1.1 said its fix (`countOffLost`) covered the same root, but that fix needs a report of the playhead, and a stopped Live sends none.
- **Real-world trigger:** the `start_playing` datagram is lost over UDP. Or, per finder A and unverified, a start and a quick Stop are handled in one AbletonOSC tick, so Live never reports playing. Loopback loss is rare, but the codebase designs for it (the lost timers, `stopWait`, #213 review-1 F1.1, rated MEDIUM capped on the same grounds). MEDIUM, capped: upgrade it if #217 or a service log ever shows a lost `start_playing`.

**Evidence**
```ts
// src/server/playback-controller.ts:653-661
jump(countOff.cue);
clearJump();
startPlaying();
forgetStop();
comesBack({ song: song.number, section: rule.countOff }, countOff.time);
waitingJump = { song: song.number, section: command.section };
countIn = { countOff, sent: false, replaced: null };
```
Nothing clears this while Live stays stopped. No timer runs (by design, the stopped lost timer must not clear a count-in). `countOffLost` needs a report outside the Count Off. The playing handler clears it only on a playing-to-stopped edge (`:559`), and Stop's report never comes for an already stopped Live.

**Failure mode:** the press is accepted, and Live jumps to the Count Off but does not start. Every page, the band's phones included, keeps reading "Count in to Bridge." for as long as Live sits there. A hold on Stop changes nothing. A tap on another section of the song only retargets: the page marks it, and Live's playhead does not move (finder A: the jump count stays 1). Pressing Count in again sends the section the playhead is in, the Count Off, so it acts as Play from start and not as the count-in the leader chose. Proved by `repro/review-1-lost-start.test.ts`: 5 s after the press, `countIn` is still `true` on a stopped Live.

**Recommended fix**
```diff
   let countIn: { countOff: Section; sent: boolean; replaced: Section | null } | null = null;
+  let startWait: (() => void) | null = null;
+  const cancelStartWait = () => {
+    startWait?.();
+    startWait = null;
+  };
...
   const clearJump = () => {
+    cancelStartWait();
     cancelLostTimer();
...
         case 'playing': {
           if (event.playing && !playing && position !== null) anchor = { position, at: clock.now() };
+          if (event.playing) cancelStartWait();
...
           countIn = { countOff, sent: false, replaced: null };
+          startWait = clock.every((((countOff.end ?? countOff.time) - countOff.time) * 60_000) / tempo, () => {
+            cancelStartWait();
+            if (!countIn || playing) return;
+            clearJump();
+            onChange(snapshot());
+          });
           break;
```

**Remediation brief**
- **Design intent:** while Live is stopped, nothing comes back for a message Live never acted on, so the controller keeps a timer for each such wait (`startLostTimer` for a jump, `stopWait` for a stop). A count-in is exempt from the stopped lost timer because Live plays through it. That exemption assumes Live started. The new timer covers the case where it did not: once the whole Count Off would have played, a Live that still reports stopped is not counting.
- **Full surface:** `src/server/playback-controller.ts:133` (beside `countIn`), `:375-383` (`clearJump`), `:544-546` (the `playing` case), `:661` (the `count-in` case). Only `clearJump` and Live's playing report cancel the timer, and a second press runs `clearJump` before it arms its own. The comment on `countIn` (`:126-133`) and on `countOffLost` (`:257-261`, "No timer is needed for it") should say what the new timer covers. The new test goes in `test/count-in.test.ts` under "the lost-jump timer", beside "never clears a count-in, before Live reports the start or while it plays".
- **Must preserve:** `test/count-in.test.ts` "the lost-jump timer › never clears a count-in, before Live reports the start or while it plays". It holds Live's reports for `LOST_WHILE_STOPPED_MS + 500` (1.5 s), well inside the 4 s Count Off of its set. The timer must run for the Count Off's length, not for `LOST_WHILE_STOPPED_MS` or `LOOP_REPORT_MS` as the #213 proposal suggested, or that test goes red. Also preserve: the count-in to the top of the song (`startFromTop`), which arms no timer; `countOffLost`'s clearing of a lost jump to the Count Off once Live plays (`test/count-in.test.ts` "a count-in whose jump to the Count Off is lost").
- **The fix's own failure:** if Live's playing report comes later than the whole Count Off (an event loop stalled for seconds), the count-in clears, and then Live plays the Count Off into the Intro with no jump to the target. The band comes in on the Intro, and the start's cues fire as an ordinary start, a Count Off cue included. That is the same outcome as a press with no count-in, and a stall that long already breaks every other timing in the server, so nothing more backstops it. `countOff.end` is never null here (a `count-in` rule implies a later section, so the Count Off has an end), and the `?? countOff.time` only satisfies the type.
- **Do not touch:** the stopped lost timer's exemption (`startLostTimer` is never armed for a count-in). See Reviewed and Dismissed.
- **Proof:** `cp docs/reviews/setlist-controller-101/repro/review-1-lost-start.test.ts test/ && pnpm exec vitest run test/review-1-lost-start.test.ts test/count-in.test.ts`. The repro is red now. After the fix, it and all 22 tests of `test/count-in.test.ts` must pass. Move the case into `test/count-in.test.ts` and delete the copy.

### 3. Comment hygiene — LOW (aggregated)
- `src/server/connections.ts:21-22`: "... or on the section a count-in lands on, whose / cue arms it again. Arm moves a" followed by a short line → rewrap the paragraph so no line ends mid-sentence after a few words.
- `src/server/connections.ts:43-44`: "... so each one that is / online gets it. Due is" → rewrap the paragraph.
- `src/server/connections.ts:53-54`: "... Off cue before it, arms the faded targets again, and any other section cue drops the word. A Fade out" runs past the file's width → rewrap.
- `src/server/playback-controller.ts:53-55`: "starts the song from it, which runs for ms more before the song's first downbeat. A faded song comes back in over it. A" runs past the file's width → rewrap.
- `src/server/playback-controller.ts:657-658`: "The report that moves the playhead into it stays inside the song, and says nothing again." → "With the playhead in the song, as every page sends it, the report that moves it into the Count Off stays inside the song, and says nothing again."

## Needs Further Investigation

### A. A Count Off off Live's bar grid lands early, or is predicted from the wrong bar line
`sendCountIn` (`playback-controller.ts:418-423`) sends in the last `barLength()` beats before the Count Off's end, but `jumpTo` predicts the bar line from a grid counted from beat 0. Finder A, in the fake Live, built a Count Off of 1.5 bars (`Count Off 0, Intro 6` in 4/4). The jump went out at beat 2 and landed on beat 4, cutting the count by 2 beats. The fake Live uses the same beat-0 grid, so this proves nothing about real Live. Two things would confirm it. First, whether any Count Off in the library is not whole bars: the spec says all are (2 bars of 4/4 or 6/8). Second, whether the set builder starts every song on Live's real bar grid, since a 6/8 song whose length is not a multiple of the next song's bar offsets every later bar line from beat 0. The bar-line prediction is the same for every jump at base, so this is pre-existing and only reached anew by a count-in. A related unverified risk: when the tapped section's meter differs from the Count Off's, the first report in the send window may come before Live reports the Count Off's signature. The library has no such song ("Goodness of God's 2/4 bars all sit inside sections"). #217 can check both on real Live.

### B. A change during the count while a lost stop is waiting
After the jump to the target was sent, Stop is pressed and its datagram is lost. Next, Previous or a tap within `LOOP_REPORT_MS` then changes `waitingJump` while `sendTarget` refuses to send (`stopWait !== null`). Per finder A's reading, the pages then show the new target while Live lands on the old one, and `lost()` clears the mark a bar later. That would also give a late landing cue for the old target. To confirm it, use `rig.live.loseNext('/live/song/stop_playing')` after the send, then a `next` within 1 s, and assert what the pages and the fake target receive. If it is confirmed, the fix is to ignore a change while `countIn.sent && stopWait !== null`, which matches the recorded rule "nothing sent while a stop waits".

### C. Count in sends the section the page last saw
`web/src/SongHeading.tsx:51` and `:70` read `now`. A press made after a tap while stopped, but before Live's position report for the tap reaches the page, counts in to the old section, and the enable rule is judged on it too. The window is one report round trip. To confirm it, use a Playwright run with the fake Live's replies held between the tap and the press. Preferring a stopped waiting `jump` over `now` would close it, at the cost of counting in to a tap Live never made.

## Reviewed and Dismissed
- The 8 refusal tests in `test/count-in.test.ts:167-215` pass at base. A refusal looks like no feature at all, so that is expected. Mutations M2 and M3 show the Pad and while-playing rows go red when their guard is removed.
- "The cue suppression during a count-in is untested at the cue level" (finder B). Mutation M1 deletes it and turns 9 cue tests red.
- A second `comesBack` when the press comes with the playhead in another song (finder A). No page sends that (`SongHeading.tsx:51` enables the button only in the playhead's song), `startFromTop` has the same pattern at base, and `connections.countOff` only sets a flag. Finding 1's Must preserve covers the one interaction.
- A count-in whose jump to the Count Off is lost leaves the faded targets paused (finder B F5). This matches Play from start at base and is already a #215 proposal. Finding 1's fix closes it for a count-in, as declared there.
- A tap in another song in the moment before Live reports the start (finder A F7). The same race exists at base after Play from start while stopped, and its window is one report.
- A second Count in press before Live reports playing. It re-runs the press (`clearJump`, the jump, the start), as a second Play from start does.
- The cue module and the controller judging "count-in to the top is Play from start" apart. Both refuse when not connected or playing, both use `countInFor` on the same set, and the hub drops viewer messages first. No disagreement found.
- The ATEM cutting on a count-in. `atem.ts:123` acts only on a cue named Count Off, and no Count Off cue fires for a count-in (mutation M1 pins it).
- The pedal retargeting during the count. This is a recorded decision, and the pedal sends the same `next` and `previous` commands through the same controller path the page tests drive.

## Minor / nits
- No test asserts the cues for a late landing (the count held through the Intro's first bar), or the cause of the landing when a tap on another song cancels the count-in. Finder B's runs showed both behave correctly.
- No count-in test covers a changed set read while stopped clearing a held count-in (the `cue-points` branch), or a fixture with a section before the Count Off (#213 review-1 F1.4, still open).
- `test/count-in-change.test.ts:144-147` checks a stopped fake Live does not advance, which mostly tests the fake. In `:248-257`, `shown.every(...)` holds trivially when the ignored press brings no snapshot. Both tests are red at base for their other assertions.
- Two #213 and #214 proposals remain open and are for Nick: the Next line reads "Next Intro" during a count-in to the Bridge, and Previous and Next stay enabled at a count-in's bounds.

## Test quality
Tests added or changed: 75. Green against `6f5280d`: 13, of which 8 are the refusal rows (expected for a refusal, and M2 and M3 show they guard their rules), 1 is the Play from start reference row of `test/count-in-cues.test.ts:285` (its two sibling rows are red), 1 is the absence check "is not on the view-only page" in `test/pages.test.ts` (its positive sibling "sits beside Play from start" is red), and 3 are page tests changed only to pass the new props. Tautology shapes found: 0. No test builds its expectation with `countInFor` or another production helper, mocks the unit under test, uses a snapshot, lacks assertions, or reads a comment. None of the green tests came from a review-pass commit. Nothing to strengthen or delete beyond the Minor notes.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` all pass at `abb58ae`. The repros under `repro/` import `../src/...` and `./harness.ts` as if they sat in `test/`, as earlier repros in `docs/reviews/` do, and each passes `eslint` on its own.
- **Commit hygiene:** this doc and its `repro/` folder are the only new files. The `.epic-loop/` folder is the run's state, not the PR's.
- **Likely reviewer asks:** what Live does with a playhead outside the brace while Loop is on (the spec leaves this to #217); whether finding 1's declared changes in behaviour are wanted; the one-bar-late landing for a late target change on real Live.

## Verdict
Ready with follow-ups after the gate. Fix findings 1 and 2 before the PR opens, each with its repro moved into the count-in test files as the red-to-green proof, then re-run the full checks. Finding 3 is one batch commit. Needs Further Investigation A belongs to #217's run on real Live, and B and C can be follow-up tickets if they are confirmed. No prior review findings were claimed as resolved on this branch beyond the per-ticket rounds, which this review found closed (#213 F1.1 and #215 F1.1 hold under their tests), apart from the lost-start case that #213 F1.1 claimed to cover and finding 2 reopens.

## Remediation — 2026-10-23
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `3ade4f3` setlist-controller#101 pre-PR review 1 finding 1: a count-in after a Fade out, cancelled by a tap on another song, leaves the faded targets paused | red→green: `pnpm exec vitest run test/count-in-cues.test.ts` ("arms the target the Fade out paused again when a tap on another song replaces a count-in" red at `279eec8` with `"arm": "paused"`, green after; its Play from start reference row green both sides) | 0 new comments; 22 lines rewritten in the five rule comments the brief named (`connections.ts` pause rules, `deliver`, `countOff`, `musicBack`; `ControllerOutput.countOff`), rewrapped where the edit split a paragraph | half-fixed: a count-in to a song other than the one Live stopped in lost its word to `enteredCountOff`. Reworked once, see below |
| 1 rework | `c0e5e59` setlist-controller#101 pre-PR review 1 finding 1 rework: a count-in to a song Live stopped outside loses its word to the report that enters its Count Off | red→green: `pnpm exec vitest run test/count-in-cues.test.ts` ("... replaces a count-in to a song Live stopped outside" red at `21a0ce6`, green after; the re-verifier reverted the line and saw it go red again) | 1 (the fixture description of `TWO_COUNT_OFFS_SET`, as its sibling fixtures have) | fixed (scoped re-verify) |
| 2 (MEDIUM) | `21a0ce6` setlist-controller#101 pre-PR review 1 finding 2: a count-in whose start never reaches Live stays held on a stopped Live, where Stop cannot clear it | red→green: `pnpm exec vitest run test/count-in.test.ts` ("the lost-jump timer › ends a count-in whose start never reached Live once its Count Off would have played" red with `"countIn": true`, green after; "never clears a count-in, before Live reports the start or while it plays" green throughout). The timer's own failure is pinned by "plays on as an ordinary start when Live reports the start only after its Count Off would have played" | 4 (the declaration comment on `startWait`, as `stopWait` has; the `countOffLost` comment rewritten as the brief named) | fixed |
| 3 (LOW) | — deferred | — | — | not worked: the LOW tail is deferred by default. Entries 1 to 4 (`connections.ts:21-22`, `:43-44`, `:53-54`, `playback-controller.ts:53-55`) were rewrapped incidentally, because finding 1 rewrote those comments. Entry 5 (`playback-controller.ts:657-658`) is still open |

Full checks at `c0e5e59`: `pnpm install --frozen-lockfile` up to date; `pnpm lint` pass; `pnpm typecheck` pass; `pnpm test` 62 files, 1259 passed, 4 skipped; `pnpm test:e2e` (builds first) 50 passed. No flakes. The repros under `repro/` were moved into `test/count-in-cues.test.ts` and `test/count-in.test.ts`; no copy was left in `test/`, and `repro/` is kept.

Verify: one `pr-review-finder` disprove agent on findings 1 and 2 (finding 1 crosses the controller-to-connections contract), then one scoped re-verify on the rework. Introduced defects: 0, so the tripwire did not trip.

### Known regressions, deferred
- The rework's stated mechanism holds only until the count-in's jump to the target is sent. Introduced by `c0e5e59`. The re-verifier's verdict: "the reasoning claim is false; the code change is fine ... a held count-in at line 164 does not always mean the report is in that count-in's own Count Off". The path is a hand move of Live's playhead during the count's last bar into another song's Count Off. That report says the word as `'count-in'` rather than `'section'`, and the re-verifier rated the likely impact as none, because a Count Off cue or the landing cue re-arms under either word. It was not fixed because it falls outside the one-line exception, and it is not a defect in the reworked behaviour. The optional tightening is `countIn !== null && sameSection(after, <the count-in's Count Off address>)`.
- Notes on finding 2 from the verify pass, all LOW, not defects in the stated goal: (a) `jumpTo` (`playback-controller.ts:327`) and the landing branch (`:544`) null `countIn` without cancelling `startWait`, so the timer later fires as a no-op on its `!countIn` check. The next press cancels it first, so it never fires on a later count-in. (b) `(countOff.end ?? countOff.time) - countOff.time` would give a 0 ms timer if a Count Off's end were ever null. `countInFor` needs a section after the Count Off, so this is unreachable as far as either agent found. (c) When the timer ends a count-in that Live never started, connections still holds `'count-in'`, so the next section cue of any cause re-arms the faded targets. That matches declared change (a) of finding 1 (Stop has already set the volumes back), but neither commit declared it for this path.

### Rework briefs
- Finding 1 rework. Must achieve: a word from a count-in stays `'count-in'` through the stopped Live's report that moves the playhead into the count-in's Count Off from another song. Must preserve: every word said with no count-in held stays `'section'` (Play from start stopped and playing, playback into a Count Off from another song, the count-in to the top through `startFromTop`), plus the landing cue's `cause === 'count-in'` clause and Fade out dropping the word. Proof: a cross-song row in `test/count-in-cues.test.ts`, red then green, with its Play from start reference row; then `test/count-in*.test.ts`, `test/pause-rules.test.ts`, `test/connections.test.ts`, `test/fade-out.test.ts` and `test/cue-causes.test.ts` green.
