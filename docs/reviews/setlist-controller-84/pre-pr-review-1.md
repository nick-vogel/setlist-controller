# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `6aec698` "Merge pull request #246 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `4c8a13e` (setlist-controller#132 ProPresenter pause by hand: a slide pressed in ProPresenter pauses automation), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 44 files total, +15160 / -33 against the merge-base, of which 24 are recorded fixtures under `test/fixtures/propresenter/` and the remaining 20 files are +3167 / -33. This review adds the doc and 4 files under `repro/`.
**Reviewed against:** the epic body of setlist-controller#84 (the spec); the bodies of sub-issues #129, #130, #131, #132, #133 and #149 (#134 is Nick's install doc and acceptance run, not code); the run's recorded decisions per ticket (`.epic-loop/tickets/<n>/assumptions.md`), read so a recorded decision is not re-reported as a defect; `test/fixtures/propresenter/README.md`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 1, `--fresh`.
**Date:** 2026-10-24
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | lockfile up to date |
| Lint | `pnpm lint` at HEAD; `pnpm exec eslint docs/reviews/setlist-controller-84/repro/` with this review's repro in place | clean, clean |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 68 files, 1652 passed, 4 skipped |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | 56 passed |
| Pause by hand, two triggers in one move (finding 1) | `repro/review-1-pause-by-hand.test.ts` copied into `test/` of a scratch worktree at `4c8a13e`, `pnpm exec vitest run test/review-1-pause-by-hand.test.ts` | red, `expected 1 to be +0`; its control (one trigger, same cold frame) green |
| Stale request after a reconnect (finding 2) | same file, same worktree | red at line 162, `expected 'offline' to be 'online'` after the pre-drop trigger times out |
| Next slide from an unknown place (finding 4) | same file, same worktree | both cases red, `expected 1 to be +0`; the control (no reconnect) green |
| Candidate fixes 1, 2 and 4 | each `repro/review-1-finding-<n>-candidate.diff` applied alone at `4c8a13e` with the repro in `test/`, `pnpm exec vitest run test/review-1-pause-by-hand.test.ts test/propresenter.test.ts`; `pnpm exec tsc --noEmit -p .` for 1 | each turns only its own finding green, and all 64 tests of `test/propresenter.test.ts` stay green; typecheck clean |
| Stream parsing | finder harness against the real adapter: two frames in one write, one frame split over three writes, a non-JSON frame, non-ASCII text | all parsed or skipped correctly |
| `stop()` with a command out | finder harness | no unhandled rejection, nothing reported after stop |
| Picks store | finder script against the real module: two quick saves, 25 sets, re-save, corrupt file, one bad entry, unwritable folder | all correct: last save wins, no stray temp files, 20 kept with the newest last, corrupt or bad means no picks, a failed write logged and never thrown |
| Fixture scrub | grep of `test/fixtures/propresenter/*.json` for email addresses, IPv4 addresses, `/Users/` paths, `.local` and Mac hostnames | none; slide `label` fields keep media file names (Minor) |
| Test audit, oracle at base | the branch's 8 new or modified test files copied onto a scratch worktree at `6aec698` | 15 red (all new connections, pre-service-check, start-up and 4 of 5 pages tests; `test/propresenter.test.ts` fails to import); 2 green, both expected (see Test quality) |
| Test audit, mutation | 4 mutants of `src/server/propresenter.ts` in a scratch worktree at HEAD | never report by hand: 8 red; always report: 13 red, one test survived (finding 3); no URL-encoding of the group name: 0 red (finding 3); no authorization check: 1 red |
| Real ProPresenter | not run: the acceptance run is #134, by hand at home | not run |

**Overall:** The branch does what the epic asks, and every full check is green. The pause by hand has two real gaps that a cold ProPresenter can reach: two triggers in one move can pause ProPresenter on its own slide (finding 1), and a request still out when ProPresenter drops can knock the reconnected ProPresenter offline again (finding 2). A few new tests cannot go red where they claim to guard something (finding 3). Fix findings 1 to 3 before the PR. The LOW findings can ship as follow-ups.

## Approach decisions
- Pause by hand, a trigger's expected slides: a frame inside a window that is not among the expected slides moves them to the group now showing, the first group that holds its text (#132 review pass 1, F1.1). Finding 1 keeps that rule and adds one exception: while the latest cue's trigger is still unanswered, such a frame belongs to an earlier command and leaves the expected slides as they are.
- Pause by hand, button expectations: each Next or Previous press expects the slide it moves to, from the last frame or from an earlier press still waiting (#132 passes 2 to 4, `buttonBrings`, `BUTTON_FRAME_MS`). Finding 4 keeps that and only fills in a starting place where none is known.
- Requests and going offline: only a connection failure or a timeout puts ProPresenter offline (#129). Finding 2 adds that a request belongs to the connection it was sent on, and one sent before an offline never puts a later connection offline. The precedent is the stream's own `streams` counter and `abort` in `openStream`, which already ignores a stream given up.

## Confirmed Issues

### 1. Two triggers in one move pause ProPresenter on its own slide when the second trigger's frame is late — MEDIUM
- **Location:** `src/server/propresenter.ts:438-441` (`decide`), with `cue` at `:487-501`
- **Attribution:** introduced by `37d6696` (setlist-controller#132 ProPresenter pause by hand: a slide pressed in ProPresenter pauses automation), and the overwrite rule is from its review pass 1 fix `f75f00e`. `git log -S'let commandsOut' 6aec698..HEAD` gives `37d6696` alone.
- **Real-world trigger:** a song plays into its End where the next song starts, as an overlap or back-to-back songs do. `connections.ts:326` says the End cue and the next song's first cue come in the same move. The operator has given the presentation an End group with words, as user story 15 invites, and the next song's presentation is cold, which is likely on the first trigger of a presentation. The same happens for any two cues close enough that the first trigger's frame arrives while the second trigger is still out. Rated MEDIUM, capped: the pause is visible as "Paused by hand" and the producer can arm again, but the slides stop following for the whole song. Upgrade to HIGH if Nick's presentations at church carry End groups with words. Check via the pre-service check of the real set: a song with no "no group End" line, followed by a song that starts on its End.

**Evidence**
```ts
    const own = commandsOut > 0 || now <= windowEnd || brought >= 0;
    if (expected?.has(current)) return;
    if (!own) report?.changedByHand();
    expected = groupShowing(triggeredIn, current) ?? expected;
```
**Failure mode:** cue A's End (slide `e1`) and cue B's Verse 1 (`b1`, `b2`) are sent together. `cue()` sets the expected slides to B's Verse 1. The End trigger's frame `e1` arrives while B's trigger is still out, so it is the adapter's own, but it is not among the expected slides, so the expected slides become `{e1}` (B's presentation does not hold `e1`, so `groupShowing` gives the text alone). B's own frame `b1` then arrives 1.5 s after B's answer (the recorded cold Bridge 1 came 1.7 s after), past the 1000 ms window, and not among the expected slides: a change by hand, and ProPresenter pauses. Proved: `repro/review-1-pause-by-hand.test.ts`, test "finding 1", red with `expected 1 to be +0`. Its control, B's trigger alone with the same late frame, stays armed.
**Recommended fix:** `repro/review-1-finding-1-candidate.diff`:
```diff
   let triggeredIn: Presentation | null = null;
+  let cueOut: Set<string> | null = null;
@@ decide
     const own = commandsOut > 0 || now <= windowEnd || brought >= 0;
     if (expected?.has(current)) return;
     if (!own) report?.changedByHand();
+    if (cueOut !== null && brought < 0) return;
     expected = groupShowing(triggeredIn, current) ?? expected;
@@ cue
       buttonBrings = [];
+      const out = expected;
+      cueOut = out;
@@
-      void command(triggered.path);
+      void command(triggered.path).then(() => {
+        if (cueOut === out) cueOut = null;
+      });
```
**Remediation brief**
- **Design intent:** each cue sets the expected slides to the group it triggers. A frame inside a window that leaves them moves them to the group it shows, so that a Next slide into another group, or a press by hand the producer then accepts, lets Go To Next timers in that group run without a pause. While the latest cue's trigger is unanswered, every frame is inside a window (`commandsOut > 0`), and one outside its group can only be an earlier command's or a press made during the command, so it must not take over the expected slides the cue just set.
- **Full surface:** `src/server/propresenter.ts:219` (new state beside `triggeredIn`), `:441` (the new early return, after the `changedByHand` line and before the overwrite), `:493` (`cue` sets `cueOut`), `:500` (`command(...).then` clears it only when it is still this cue's). Update the header comment at `:57-59` and the `decide` comment at `:422-427` in the same commit to name the exception.
- **Must preserve:** `own` and the `changedByHand` call are unchanged, so nothing new is reported while a command is out. A button frame (`brought >= 0`) still moves the expected slides, so `test/propresenter.test.ts` "pauses ProPresenter on a press by hand of ... after the producer's Next slide brings a verse slide" (line 876) stays green: an earlier draft that kept the cue's slides for 3 s after its answer turned that test red. All 64 tests in `test/propresenter.test.ts` pin the rest.
- **Do not touch:** the window length (`HAND_WINDOW_MS`, a recorded decision) and the first-group rule in `groupShowing` (#132 pass 1). See Reviewed and Dismissed, "a press by hand after a clear".
- **Residual, declared:** if the earlier trigger's frame arrives after the later trigger is answered but inside its window, it still moves the expected slides. That ordering needs the later trigger to answer before the earlier trigger's frame, which a cold later trigger does not do.
- **Proof:** copy `docs/reviews/setlist-controller-84/repro/review-1-pause-by-hand.test.ts` into `test/`, run `pnpm exec vitest run test/review-1-pause-by-hand.test.ts -t "finding 1"`: red now, green after. Then move the "finding 1" test and its control into `test/propresenter.test.ts` on the fake ProPresenter (`answerTriggers` and `send`), or keep it as its own test file, and delete the copy.
- **Escalation:** this is the expected-slides rule #132 changed in review passes 1 to 4. If the fix brings a new finding in the next round, recommend a split ticket rather than another in-place change.

### 2. A request still out when ProPresenter drops puts the reconnected ProPresenter offline again when it times out — MEDIUM
- **Location:** `src/server/propresenter.ts:281-296` (`request`), `:262-277` (`goOffline`)
- **Attribution:** introduced. `request` calling `goOffline` on every failure is from `b53df50` (setlist-controller#129 ProPresenter tracer bullet) and the reconnect with a stream from `b75f548` (setlist-controller#130 ProPresenter status stream).
- **Real-world trigger:** the Wi-Fi at FOH drops for 10 to 25 s during a song. A section trigger sent during the drop gets no answer. The silent stream puts ProPresenter offline at 10 s, the network comes back, the next poll reconnects and opens a new stream, then the old trigger reaches its 15 s timeout and puts ProPresenter offline again, closing the healthy new stream. MEDIUM: a cue during the second offline is dropped, so the words stay on the old section until the next section start, and until the old request times out, `commandsOut > 0` counts every frame as the adapter's own, so a press by hand in that time never pauses.

**Evidence**
```ts
  const request = async (path: string): Promise<Answer | null> => {
    try {
      const response = await fetch(`http://${where}${path}`, { signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(requestTimeoutMs)]) });
      ...
    } catch (error) {
      goOffline(error);
      return null;
    }
  };
```
**Failure mode:** with a 1 s request timeout and triggers answered after 5 s: a cue, the stream drops (offline), the poll reconnects (online, one stream open), then the cue's request times out. Status goes offline, online, offline, with no stream open. Proved: `repro/review-1-pause-by-hand.test.ts`, test "finding 2", red at line 162 with `expected 'offline' to be 'online'`; its first two assertions, before the timeout, pass.
**Recommended fix:** `repro/review-1-finding-2-candidate.diff`:
```diff
   const stopping = new AbortController();
+  let connection = new AbortController();
@@ goOffline
     closeStream();
+    connection.abort();
+    connection = new AbortController();
@@ request
   const request = async (path: string): Promise<Answer | null> => {
+    const given = connection.signal;
     try {
-      const response = await fetch(`http://${where}${path}`, { signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(requestTimeoutMs)]) });
+      const response = await fetch(`http://${where}${path}`, { signal: AbortSignal.any([stopping.signal, given, AbortSignal.timeout(requestTimeoutMs)]) });
@@
     } catch (error) {
-      goOffline(error);
+      if (!given.aborted) goOffline(error);
       return null;
```
**Remediation brief**
- **Design intent:** online means `/version` answers, and the status stream is held while online. Only a connection failure or a timeout of the current connection puts ProPresenter offline. A request belongs to the connection it was sent on: going offline aborts every request of that connection, and an aborted request resolves null without a second offline. The recorded decision "commands still out when ProPresenter goes offline count as answered then" (#132) becomes literally true, since the abort settles `command`'s `finally` at once.
- **Full surface:** `src/server/propresenter.ts:192` (new controller beside `stopping`), `:264` (`goOffline` aborts and replaces it after `closeStream()`), `:281-296` (`request` captures the signal when it starts and checks it in the catch). Update the comment over `command` at `:298-299` in the same commit: a command out at an offline is aborted then, not left to time out.
- **Must preserve:** `goOffline`'s early return before `start` and after `stop`, so the abort never runs after stop. `readPicked` keeps the last read on a null answer (`if (answer) read = null`), and `list` keeps the last playlists, so an aborted read changes nothing. The stream keeps its own `abort` and `streams` counter in `openStream`. Suites: `test/propresenter.test.ts` (64 tests, including "puts ProPresenter offline when a request gets no answer within the timeout" and the reconnect tests).
- **The fix's own failure:** if `goOffline` returns early (stop in progress), the connection is not aborted, and `stopping` aborts everything instead. A request that fails for its own reason on the new connection still puts ProPresenter offline, as it must.
- **Do not touch:** the 15 s timeout (`REQUEST_TIMEOUT_MS`, from the 7.8 s cold command).
- **Proof:** `repro/review-1-pause-by-hand.test.ts` copied into `test/`, `pnpm exec vitest run test/review-1-pause-by-hand.test.ts -t "finding 2"`: red now, green after. Then add the case to `test/propresenter.test.ts` with the fake's `hang()` and `dropStreams()`.

### 3. Three adapter behaviours have no test that can go red — MEDIUM
- **Location:** `test/propresenter.test.ts:1170`; `src/server/propresenter.ts:657` (group name encoding); `src/server/propresenter.ts:382-397` and `:400-407` (stream reassembly and the non-JSON skip)
- **Attribution:** introduced. The test at :1170 and the encoding came in `37d6696` and `b53df50`; the reassembly and skip in `b75f548`.
- **Real-world trigger:** none for users today, since the code is correct now (the finder harness proved the parsing). A later change that breaks any of the three ships green. MEDIUM, per the tautology audit: each is a claim of coverage the branch does not have, and conformance rules 2 and 4 (tests that can go red, a test for every fallback path).

**Evidence**
- "stays armed when a trigger brings no frame, as the recorded Pre Chorus trigger did, however long the clock moves on" sends only heartbeats, never a `status/slide` frame. `decide` runs only on `status/slide`, so nothing could ever pause there. The mutant that reports a change by hand on every frame left it green.
- Removing `encodeURIComponent(group.name)` at `:657` left all 64 tests green: `fetch` already encodes a space, and no recorded group name holds anything else.
- The fake writes exactly one whole frame per `response.write` (`test/fake-propresenter.ts:144`), so no test sends a split frame, two frames in one chunk, or a non-JSON frame. `grep -n -i 'not json\|split\|two frames' test/*.ts` finds nothing.

**Failure mode:** a regression in the window bookkeeping (a command whose window never closes), a group name with `#`, `?`, `/` or `%` sent unencoded (a 404, so the section shows nothing), or a chunk boundary inside a frame would all pass the suite.
**Recommended fix:** in `test/propresenter.test.ts` and `test/fake-propresenter.ts`:
- Rewrite the test at :1170 so it can go red: after the clock moves on past the window with no frame, send a slide of another group (`PRESSED_VERSE_1_SLIDE_2` or a Verse 3 frame from the recordings) and expect `pause: 'by-hand'`. Keep its name honest: "a trigger that brings no frame leaves no window open".
- Give the fake a way to serve one presentation with a group named with `#` (such as `Chorus #2`), and assert the trigger path `.../group/Chorus%20%232/trigger`.
- Give the fake a raw write (`sendRaw(text: string)`), and add three tests: a frame split over two writes shows its text once whole; two frames in one write both apply, in order; a non-JSON frame followed by a good one leaves ProPresenter online and shows the good one.

**Remediation brief**
- **Design intent:** the tests drive the real server against the fake ProPresenter and check only what ProPresenter receives and what the producer row shows (epic, Testing Decisions). Each new test must fail on the mutant named here: a window that never closes, no `encodeURIComponent` on the group name, a parser that splits on chunks rather than on `\r\n\r\n`, a `JSON.parse` failure that drops the stream.
- **Full surface:** `test/propresenter.test.ts:1170-1182`; `test/fake-propresenter.ts` (a presentation override or an extra fixture, and `sendRaw` beside `send` at :144); no production change.
- **Must preserve:** every recorded fixture as committed; the fake's existing API, used by `e2e/propresenter.spec.ts` and `test/propresenter.test.ts`.
- **Do not touch:** `src/server/propresenter.ts`; it is correct here.
- **Proof:** for each new test, apply its mutant in a scratch worktree and see it go red: delete `encodeURIComponent(` around `group.name` at `:657`; replace the `for (let end = buffer.indexOf(FRAME_END) ...)` loop with `frame(decoder.decode(value))`; make the inner `catch { return; }` in `frame` throw; for the :1170 rewrite, make `command`'s `finally` skip `commandsOut -= 1`.

### 4. Next slide after a reconnect, or after a trigger that brought no frame, expects the wrong slide, so its late frame into another group pauses ProPresenter — LOW
- **Location:** `src/server/propresenter.ts:513` (`runButton`'s starting place), with `cue` at `:487-501` and `goOffline` at `:273`
- **Attribution:** introduced by `37d6696` and the #132 review-pass fixes (`8455f6b`, `2174ae0`, `cef1ed7`, `d557ce0`); the `?? showing` fallback is from `cef1ed7`.
- **Real-world trigger:** (a) ProPresenter reconnects, the stream sends no `status/slide` on open, and the producer presses Next slide across a group boundary before any frame; or (b) a trigger brings no frame, as the recorded Pre Chorus did, and the producer presses Next slide across a group boundary. In both, a cold frame past the 1000 ms window pauses ProPresenter. LOW, capped: it needs a group boundary and a frame later than 1 s; upgrade to MEDIUM if the acceptance run (#134) shows cold Next frames later than 1 s after a reconnect.

**Evidence**
```ts
      const from = buttonBrings.findLast(({ until, chained }) => chained && until !== -Infinity) ?? showing;
```
`goOffline` sets `showing = null`, and `cue()` leaves `showing` on the slide before the trigger.
**Failure mode:** (a) Verse 1 frames, the stream drops and reconnects, Next slide, then `c1` 1.1 s after the answer: 1 pause, where the same sequence with no drop gives 0. (b) Verse 1 frame, a cue for Tag (one slide) with no frame, Next slide, `e1` 1.1 s after the answer: 1 pause. Proved: `repro/review-1-pause-by-hand.test.ts`, both "finding 4" tests red with `expected 1 to be +0`; the control green.
**Recommended fix:** `repro/review-1-finding-4-candidate.diff`:
```diff
@@ cue
       buttonBrings = [];
+      showing = { slides: new Set(triggered.group.slides) };
@@ runButton
-      const from = buttonBrings.findLast(({ until, chained }) => chained && until !== -Infinity) ?? showing;
+      const from = buttonBrings.findLast(({ until, chained }) => chained && until !== -Infinity) ?? showing ?? (expected && { slides: expected });
```
**Remediation brief**
- **Design intent:** a Next or Previous press expects the slide it moves to, from where ProPresenter is known to be. After a trigger, ProPresenter is somewhere in the triggered group, and after a reconnect with no frame it is still somewhere among the expected slides. A place with `next` left undefined makes `slidesBrought` predict through the presentation's groups, as a chained press already does.
- **Full surface:** `src/server/propresenter.ts:493` (`cue`), `:513` (`runButton`). Update the header comment at `:60-63` to say where a press moves from when no frame has come.
- **Must preserve:** a press after a frame moves from that frame's `next` (the frame resets `showing`); a press after an earlier press still waiting moves from that press (`buttonBrings`). `test/propresenter.test.ts` lines 876 to 1165 pin both. Expectations still end `BUTTON_FRAME_MS` after the answer.
- **Do not touch:** `BUTTON_FRAME_MS` and the `chained` rule (#132 passes 3 and 4).
- **Proof:** `repro/review-1-pause-by-hand.test.ts` in `test/`, `pnpm exec vitest run test/review-1-pause-by-hand.test.ts -t "finding 4"`: red now, green after; all 64 tests in `test/propresenter.test.ts` green.
- **Escalation:** this is the fifth change to the button expectations (#132 passes 2, 3 and 4, then this). If the fix brings a new finding in the next round, recommend a split ticket.

### 5. Previous slide or Next slide pressed before any cue pauses ProPresenter on its own late frame — LOW
- **Location:** `src/server/propresenter.ts:637-646` (`slidesBrought`) and `:513`
- **Attribution:** introduced by `8455f6b` (setlist-controller#132 review pass 2 finding 1).
- **Real-world trigger:** the producer arms ProPresenter before the service and presses Previous slide (or Next slide before any frame) to fix what the operator put up. With no cue yet, `triggeredIn` is null and nothing is expected, so a frame later than 1 s after the answer is a change by hand, and the first song's cues are then dropped until the producer arms again. LOW, capped: it needs a press before any cue and a cold frame; upgrade to MEDIUM if the acceptance run shows a cold first Previous frame later than 1 s.

**Evidence**
```ts
  if ((id !== 'next' && id !== 'previous') || !from || !presentation) return [];
```
**Failure mode:** a slide shown by hand before any cue, then Previous slide, then a frame 1.1 s after the answer: one more pause. Proved by the finder's harness (scenario S8, 1 extra pause); not preserved as a repro.
**Recommended fix:** when a 2xx Next or Previous press has no prediction (`slidesBrought` gives none), count the first `status/slide` frame within `BUTTON_FRAME_MS` of its answer as its own. In `runButton`, mark such a press `{ ..., any: true }`, and in `decide` match it with `brings.any || brings.slides.has(current)`. Audit before committing: this masks a press by hand made in those 3 s, which only happens before any cue.
**Remediation brief**
- **Design intent:** as finding 4. With no trigger and no frame there is no place to predict from, so the press's own frame is taken on trust for `BUTTON_FRAME_MS`, the bound that already limits every button expectation.
- **Full surface:** `src/server/propresenter.ts:228` (the `buttonBrings` element type), `:433` (the `findIndex` in `decide`), `:514` (`runButton` sets the mark).
- **Must preserve:** the expectation ends on a frame or at `BUTTON_FRAME_MS`, and a non-2xx answer expects nothing (`until = -Infinity`).
- **Do not touch:** as finding 4.
- **Proof:** add to `test/propresenter.test.ts`: armed, no cue, a frame by hand, Previous slide, a frame 1.1 s after the answer: stays armed; then a frame 5 s later from another group: paused by hand.

### 6. The picks store's fallback paths, the page's gone-pick branch and the failed-pick rule have no test — LOW
- **Location:** `src/server/propresenter-picks.ts:58-84`; `web/src/ConnectionsPanel.tsx:105`; `src/server/connections.ts:313-318`; the "ignores" tests in `test/connections.test.ts`
- **Attribution:** introduced by `b53df50`.
- **Real-world trigger:** none today; the finder's script proved each path correct. Conformance rule 4. LOW: no user path, and the code is right now.

**Evidence:** `git grep KEPT_SETS` finds only the source file; no test writes a bad picks file. `test/pages.test.ts` has no row whose `picked` is missing from `options`. "keeps the server running when the pick fails" never counts checks. Five "ignores" tests assert `target.picks` stays empty, which a server that drops every pick also passes.
**Recommended fix:** in `test/propresenter.test.ts`, a `describe('the picks file')` using its `newFolder()`: a file `{not json` gives no pick after `load()`; one bad entry gives none; 21 saved sets keep the last 20 after a reload; re-saving set 1 among 20 evicts set 2; a path whose parent is a file makes `save` resolve and `console.error` log. In `test/pages.test.ts`, a row with `picked: { id: 'gone', label: 'Gone' }` not in options shows the options plus "Gone", selected, and "Playlist: Gone". In "keeps the server running when the pick fails", record `target.checks.length` before and expect it unchanged after. In each "ignores" test, send one valid pick after the ignored one and expect `target.picks` to equal that one alone.
**Remediation brief**
- **Design intent:** a missing or unreadable picks file is no picks, logged; a failed write is logged and never thrown; the file keeps the 20 most recently saved sets, oldest first (recorded decisions, #129). The page shows a stored pick ProPresenter no longer lists as picked. A pick that rejects runs no check.
- **Full surface:** `test/propresenter.test.ts`, `test/pages.test.ts`, `test/connections.test.ts`; no production change.
- **Must preserve:** `test/start-up.test.ts`'s literal assertion of the file's JSON.
- **Do not touch:** `src/server/propresenter-picks.ts`.
- **Proof:** each new test goes red on its mutant: `slice(-KEPT_SETS)` as `slice(0, KEPT_SETS)`; `load` rethrowing; dropping the `shown` append in `PickField`; moving `runCheck` into a `finally`; `case 'pick'` doing nothing.

### 7. The Playlist select is enabled while no set is known, and the server drops the pick without a word — LOW
- **Location:** `web/src/ConnectionsPanel.tsx:65`, `src/server/connections.ts:315`
- **Attribution:** introduced by `b53df50`.
- **Real-world trigger:** before the service, ProPresenter is online but Live is not running or its set is not read yet. The producer picks a playlist; the server ignores it (no set), and the controlled select snaps back to "Pick a playlist" with nothing said. LOW: a confusing display, recoverable once Live is up.

**Evidence**
```tsx
{pick && <PickField pick={pick} enabled={connected && connection === 'online'} onPick={(choice) => send({ kind: 'pick', target: name, choice })} />}
```
**Recommended fix:** pass `snapshot.set !== null` from `web/src/App.tsx:41` into `ConnectionsPanel` as a prop, and AND it into `PickField`'s `enabled`.
**Remediation brief**
- **Design intent:** a pick is keyed by the set, so it is taken only while online and a set is known (recorded decision, #129). The page should offer the select only when the server will take it.
- **Full surface:** `web/src/App.tsx:41`, `web/src/ConnectionsPanel.tsx:20-30` (new prop) and `:65`. Check first that `snapshot.set` is the set `connections.ts`'s `currentSet` returns (the `set: currentSet` wiring at `connections.ts:114`).
- **Must preserve:** the select disabled while offline (`test/pages.test.ts` "disabled while offline"), and the README sentence "The select is disabled while ProPresenter is offline", extended to "or while no set is read from Live".
- **Proof:** a `test/pages.test.ts` case with an online row and `set: null` expects the select disabled.

### 8. Comment hygiene — LOW (aggregated)
- `README.md:49` — "in `propresenter-picks.json` beside the connections config" → "in `propresenter-picks.json` in the server's settings folder, `~/Library/Application Support/setlist-controller/`" (the picks path is always under the settings folder, `start-up.ts:46`, while `--connections-config` can move the config).
- `test/fixtures/propresenter/README.md:28` — "The pre-service check has no line for this today." → "The pre-service check had no line for this when recorded; #133 added `<song>: not authorized in ProPresenter`."
- `src/server/propresenter.ts:67` — one comment line runs to about 140 characters where the rest of the header wraps at 100 → rewrap it.

## Needs Further Investigation

### A. Previous slide and a chained Next slide predict by group order, not by the presentation's arrangement
`slidesBrought` walks `presentation.groups` in group order (`propresenter.ts:640`). The recorded presentations carry `arrangements` and `current_arrangement` (Goodness of God: Master 11 groups, Full 13, Closing (PCO) 9), and the playlist item "House of the Lord - [ Full ]" names one. If ProPresenter's next and previous follow the arrangement, the predicted slide is wrong at group boundaries. Confirm or kill in the acceptance run (#134): trigger a group whose arrangement order differs from its group order, press Previous slide across the boundary, and compare the frame with the group-order prediction.

### B. The Playlist select may overflow the row on a phone
`.connection-pick` has `margin-left: auto` and no `min-width: 0` (`web/src/styles.css:715-735`). A long playlist name such as "Series Three - Message 15 - August 9, 2026" may push the select past the row on the Android phone viewport. Confirm with a Playwright screenshot of the producer row at the phone viewport with that playlist picked.

## Reviewed and Dismissed
- A press by hand on a slide of the triggered group after a clear never pauses — #132 allows "treat any change inside the triggered group as the adapter's own", and AC 3 says a change inside the triggered group never pauses. A repro and a candidate (reset the expected slides on a 2xx Clear) were built and dropped from `repro/`; reopen only if Nick wants a clear to end the group's grace.
- A press by hand on a blank slide matches a "(no words)" slide in the triggered group — consistent with "a clear never pauses" (#132): blanking the screen is not fighting the operator.
- Stream framing on `\r\n\r\n` — matches the recording (`test/fixtures/propresenter/README.md:33`, `test/fake-propresenter.ts:144`); split, merged and non-JSON frames parse correctly in the finder's harness.
- Unhandled rejections from the `void` call sites — `request` catches everything; `runButton`, `pick` and `check` run inside `connections.ts`'s `safely`.
- `stop()` with requests out — `stopping` aborts every request and the stream; `goOffline` and `goOnline` return early after stop.
- Late reads overwriting newer state — `lists`, `reads` and `streams` counters drop every answer but the latest.
- The producer-only gate for a pick — connection commands parse only for the producer role (`src/server/hub.ts:61`); "ignores a leader's pick" can go red.
- Two quick picks — serialised: save then check, then save then check, and the `checks` counter drops a stale answer.
- The picks file's atomic write — temp file per write (pid and counter), then rename; a crash leaves the old file or none.
- Songs with no title share a set key — an untitled song matches no presentation (`propresenter.ts:598`), so a shared pick triggers nothing either way.
- "A Fade out pauses ProPresenter so that timed slides stop" — the pause drops later cues as #113 defines; ProPresenter's own Go To Next timers run out at the group's last slide, which carries no timer (user story 13).
- Fixture privacy — no email addresses, IPs, hostnames or home paths, and the repository is private.

## Minor / nits
- `src/server/propresenter.ts:393-396`: the catch around the read loop also swallows an error from `frame()` or a report callback and reports it as "the status stream dropped." with no log of the real error.
- `src/server/propresenter.ts:474-486`: a `stop()` during `start()`'s `await store.load()` leaves the poll timer installed after stop; each tick is a no-op.
- `src/server/propresenter.ts:487-501`: a trigger answered 403, 404 or 500 still leaves its group as the expected slides, unlike a button, whose non-2xx answer expects nothing.
- `src/server/propresenter-picks.ts:52-54`: a failed write is logged only; the row keeps showing the pick, which a restart loses. A failed `writeFile` leaves its temp file behind.
- `src/server/connections.ts:312-315`: a target that reports a pick without implementing `pick` gets a select whose every choice is dropped; the `target.ts` contract does not forbid it.
- `scripts/scrub-propresenter-fixtures.mjs:50-61`: stand-ins are cached by text across presentations, so two fixtures show another presentation's stand-in text; `:64-78` keeps slide `label` media file names (`Speaker.jpg`, `child-dedication-dec-6-rings.jpeg`); a re-run deletes every `.json` in the output folder, including `v1_playlist_6E51EFFD-before-songs-resolved.json` unless the raw folder has it.
- `src/server/propresenter-picks.ts:89-101`: `parse` keeps unknown fields of an entry, which `get` spreads into its answer.

## Test quality
Tests added or changed: 84 (64 in `test/propresenter.test.ts`, 17 in the modified files, 3 in `e2e/propresenter.spec.ts`, read, not run against base). Green against `6aec698`: 2, both expected: `test/pages.test.ts` "shows no select on a row that offers no pick" (a negative render guard that cannot fail first) and `test/native-loaders.test.ts`'s ATEM test, changed only to add `pick() {}` to its report for the new type; both came with `b53df50`, neither as a review fix. Six "ignores" tests are red at base only because the fake target's `start()` calls `report.pick`; what they assert is negative (finding 6). Tautology shapes: 1 (the test at `test/propresenter.test.ts:1170`, finding 3). Mutation: never-report killed by 8 tests, always-report by 13, the authorization check by 1, the group-name encoding by none (finding 3). The "never pauses" tests at lines 933 and 961 place every frame inside the window, so they pin the window only; the late-frame tests at 983 to 1170 cover the expected slides. The e2e spec asserts on what the page shows and what the fake received, and none of it covers the pause by hand, which `test/pages.test.ts:1183` draws.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` green at `4c8a13e`; `pnpm test:e2e` green locally.
- **Commit hygiene:** commit this doc and its `repro/` folder. The repro file is not under `test/`, so `pnpm test` does not run it; it passes `pnpm lint`.
- **Likely reviewer asks:** the acceptance run on the real ProPresenter (#134), which settles the 1000 ms window, NFI A, and the cold-frame timings findings 4 and 5 depend on.

## Verdict
Ready with follow-ups after the gate. Gate before the PR: findings 1, 2 and 3 (MEDIUM). Findings 4 to 8 (LOW) can ship as follow-up tickets, though 4 and 5 sit in the subsystem findings 1 touches and are cheap to take in the same pass. This is round 1, so no prior findings are claimed resolved.

## Remediation — 2026-10-24
Scope: CRITICAL, HIGH and MEDIUM (findings 1 to 3). The LOW findings 4 to 8 are deferred on purpose and left unfixed for Nick to triage (eng-pipeline#34).

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `5979e5c` setlist-controller#84 pre-PR review 1 finding 1: a song's End trigger and the next song's first trigger in one move let the End's frame take over the expected slides, so the second trigger's late frame paused ProPresenter | red→green: `pnpm exec vitest run test/propresenter-adapter.test.ts` (the repro's finding 1 test and its control, moved into a new test file and not into `test/propresenter.test.ts`, because the fake ProPresenter cannot answer triggers late) | 18 comment lines in the diff, all an update and rewrap of the three comments the brief named (header, state, `decide`). 0 new comment blocks | fixed (verify agent; it also checked the pair within one song: 0 pauses, against 1 before) |
| 2 (MEDIUM) | `c0b59d0` setlist-controller#84 pre-PR review 1 finding 2: a request still out when ProPresenter dropped put the reconnected ProPresenter offline again when it timed out | red→green: `pnpm exec vitest run test/propresenter-adapter.test.ts`. The test also checks the fix's own failure path: a trigger that times out on the new connection still puts ProPresenter offline (goes red on the mutant `if (false) goOffline(error)`) | 6, all updates of the existing comments over `stopping`, `request` and `command`. 0 new comment blocks | fixed for the stated goal; introduced one LOW defect (cut-off presentation reads left a partial read), reworked in `b24d8cc` |
| 2 rework | `b24d8cc` setlist-controller#84 pre-PR review 1 finding 2 rework: going offline cut off the presentation reads of a check still out, so the picked playlist's read lost those presentations and a cue after the reconnect triggered nothing | red→green: `pnpm exec vitest run test/propresenter-adapter.test.ts`, test "keeps the last read of the picked playlist when going offline cuts off a read of its presentations" | 2, an update of the `readPicked` comment | fixed (scoped re-verify) |
| 3 (MEDIUM) | `0cf2946` setlist-controller#84 pre-PR review 1 finding 3: three adapter behaviours had no test that could go red | mutation, run in a scratch worktree with each mutant applied alone to `src/server/propresenter.ts`. No `encodeURIComponent` on the group name: 1 red (the new Chorus #2 test). Frames split on chunks: 2 red (split frame, two frames in one write). The parse failure rethrown: 1 red (non-JSON frame). `commandsOut -= 1` dropped: 9 red, including the rewritten no-frame test | 8: the fake's header rewrapped, a doc line on each of the fake's two new type members, and one on the test's `slideFrame` helper, all following the files' convention of documenting every member | proved by execution (tests only, no production change) |

Full checks at `b24d8cc`: `pnpm lint` clean, `pnpm typecheck` pass, `pnpm test` 69 files with 1660 passed and 4 skipped, `pnpm build` pass, `pnpm test:e2e` 56 passed.

Notes the verify agents raised that need no change:
- Finding 1, inside the intent: while a cue's trigger is still out, a press by hand into another group of the same song leaves the expected slides on the cued group. So a Go To Next frame there after the window pauses ProPresenter, where before it did not. This applies only while a trigger is out, at most `REQUEST_TIMEOUT_MS` for a cold one.
- Finding 1, a wider form of the declared residual (not run): `cueOut` tracks only the latest cue. If the later trigger is answered before the earlier one, the earlier frame still moves the expected slides.
- Finding 2 rework: a presentation read that times out on its own now keeps the last read, not a read that leaves that presentation out. A timeout in this adapter is going offline, so this is inside the intent. A presentation read answered with a non-200 is still left out.
- Finding 2 rework, unreachable (only a gap of microtasks): a stream drop between the playlist answer and the presentation reads would throw away one complete read. The next check reads again. The optional one-line guard on the first `run !== reads` check was not applied.

### Known regressions, deferred
- None. The one defect this round introduced (finding 2's partial read) was reworked in `b24d8cc`, and the scoped re-verify found it fixed.

### Rework briefs
- Finding 2 rework. Must achieve: a read of the picked playlist whose requests going offline cut off keeps the last read, instead of a read with the cut-off presentations left out. Must preserve: `c0b59d0`'s abort at an offline; `read = null` with no pick, on a changed picked id, and on a non-null non-200 playlist answer; the `reads` run counter; a presentation whose own read is answered with a non-200 is still left out. Proof: the new adapter test (presentation reads delayed 300 ms, stream dropped mid-read, reconnect, then a cue for Song B expects its trigger), red at `0cf2946` and green after.

## Approach decisions (remediation round 1)
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it. While the mark is set, a frame outside the expected slides that no button brought leaves them. This applies the round's recorded rule in the doc's Approach decisions and adds no new mechanism.
- Requests and going offline: a request belongs to the connection it was sent on, which is an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline. A multi-request read (`readPicked`) that the abort cuts off keeps the last read. Precedent: the stream's own `abort` and `streams` counter in `openStream`.
- Adapter-level behaviour that the fake ProPresenter cannot stage (triggers or presentation reads answered late, two triggers out at once): `test/propresenter-adapter.test.ts` drives the adapter straight against its own small HTTP ProPresenter, which comes from the review's repro. Behaviour the fake can stage stays in `test/propresenter.test.ts`, and the fake grows additive helpers (`renameGroup`, `sendRaw`) for it.
