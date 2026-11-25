# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback, follow-up batch #261 to #265

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `f264357` "Merge pull request #267 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback", which landed reviews 1 to 3 and their remediations)
**Reviewed at:** HEAD `4e70ffe` (setlist-controller#264 The ProPresenter row shows the live slide text as soon as the status stream opens), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 18 files total, +697 / -142 against the merge-base. Commits `0ec4238`/`f4d31bb` (#263), `da71f74`/`95cea65` (#261), `8c6e64e`/`5d07767` (#262), `85c8b77`/`a8706c2` (#265), `5250ba2`, `aa6230c` (merge), `4e70ffe` (#264). This review adds the doc and 3 files under `repro/`.
**Reviewed against:** the epic body of setlist-controller#84; the bodies of #261, #262, #263, #264 and #265; the run's recorded decisions for each (`.epic-loop/tickets/<n>/assumptions.md`), read so a recorded decision is not re-reported as a defect; the Approach decisions of reviews 1 to 3. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 1 of this batch, `--fresh`: reviews 1 to 3 covered the code `f264357` already holds, so they are not a delta base here.
**Date:** 2026-10-25
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | lockfile up to date |
| Lint | `pnpm lint` (`eslint .`) | clean |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test`, at load 25 to 36 on 14 cores | 69 files, 1684 passed, 4 skipped (the `it.runIf(process.platform === 'linux')` cases in `test/setup-screen.test.ts`), first run |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | 56 passed |
| Tautology audit, base oracle | the audit agent: a scratch worktree at `f264357` with HEAD's five changed test files and both changed helpers copied in, each file run; then `test/propresenter.test.ts` again with the `problems` field and the old press wording put back, so the substantive assertions are judged alone | 22 new cases. Red at base: 20. Green at base: 655 and 665 (precedence and no-double-trigger guards of #262's fallback; both killed by the finder's mutations of `endGroupFor`'s order and of `endCueGroupFor`'s own-Ending test, so they can go red). Changed tests green at base: 682, 743, pages 680, pages 1315, which only changed setup or added negative assertions |
| Helpers against pre-existing tests | the audit agent: base tests with HEAD's `test/fake-propresenter.ts` and `test/fake-target.ts` | `test/propresenter.test.ts` 68 of 68 green; `test/connections.test.ts` 26 of 26; `test/pre-service-check.test.ts` and `test/setup-screen.test.ts` red at base by the intended check-shape change only |
| Mutation of the new rules | the two finders, about 30 single-line mutants in scratch copies; this review re-ran the six survivors with `repro/review-4-mutations.sh` in a scratch worktree at HEAD | Killed: no ack, ack on any status, each of the three `slideChanges` bumps, the read guard removed, End before Ending, own-Ending ignored, not-authorized as a match line, `checkOf` ignoring problems, the ignored-pick log removed, the pick taken with no set. Survived: the six in findings 2 and 3 |
| Finding 1 | executed: `repro/review-4-finding-1-clear-then-next.diff` adds a test, red at HEAD; with `repro/review-4-finding-1-candidate.diff` applied, it and `test/propresenter.test.ts` plus `test/propresenter-adapter.test.ts` are green, 93 of 93 | confirmed |
| Every implementer and consumer of `Target.check` | grep across `src/` and `web/src/` | implementers: `checkLines` (ProPresenter), `deviceCheck` (`src/server/atem.ts:268`), `test/fake-target.ts:99`; consumers: `checkOf` (`src/server/connections.ts`), `CheckResult` from `web/src/ConnectionsPanel.tsx:73` and `web/src/ConnectionsSetup.tsx:37`. No lights target is on this branch. All on the new shape |
| Page and server agree on "no set known" | read `web/src/App.tsx:42`, `src/server/server.ts:161`, `src/server/playback-controller.ts` | both read `snapshot.set`; the controller never resets the set to null once read |
| Real ProPresenter | not run: the acceptance run is #134, by hand at home | not run |

**Overall:** The five tickets do what their issues ask, and every full check is green at `4e70ffe`. The acknowledgement, the End/Ending fallback, the live slide read's guard and the new check shape are each pinned by tests that go red on their mutants. One small display defect is confirmed (a Clear slide followed quickly by another press leaves the old words on the row), and four of the batch's recorded rules have no test that can go red, which is the one MEDIUM. Remediate finding 2 before the PR opens; findings 1, 3 and 4 are LOW and can ride along in the same pass.

## Approach decisions
Carried forward from reviews 1 to 3, unchanged:
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it.
- Requests and going offline: a request belongs to the connection it was sent on, an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline.
- Adapter-level behaviour that the fake ProPresenter cannot stage (requests answered late or at different speeds) goes in `test/propresenter-adapter.test.ts`, whose rig takes a delay per request path (`setDelayFor`). Behaviour the fake can stage stays in `test/propresenter.test.ts`.

Added by this review:
- A Clear slide's blank is a fact about the screen, not about the last command: it applies whatever press came after it, and stands down only for a cue's trigger sent after it, whose own frame then speaks for the screen. It is counted by a trigger counter beside `presses`, the precedent being `presses` itself and the read's `slideChanges` capture in `readSlide`. It is not gated on `slideChanges`, since a Go To Next frame can land while the clear is out and the screen is still blank after it (finding 1).
- Tests for the live slide read's pause-by-hand rules go in `test/propresenter.test.ts`, armed, through the fake's `dropStreams` and reconnect, after the precedent "after a reconnect, shows the live slide's text before any frame" (`test/propresenter.test.ts:422`). The refused-trigger gate needs a trigger answered after a later press, so it goes in `test/propresenter-adapter.test.ts` with `setDelayFor` (finding 2).

Added by the review 4 remediation:
- An armed reconnect is staged in `test/propresenter.test.ts` through `armedRig`, which now returns `next` as `proRig` does, and the fake's `showSlide` and `dropStreams`, after the precedent at `:422`; the two pause-by-hand read tests share one local set-up, `reconnectArmedShowing`, inside "the live slide read" (finding 2a, 2b).
- The adapter rig in `test/propresenter-adapter.test.ts` answers a path with a given status through `setStatusFor`, checked before every route and beside `setDelayFor`, and keeps every state the adapter reports in `states`. Both are additive, as review 2's remediation extended the rig (finding 2c).

## Confirmed Issues
### 1. A Clear slide followed by another press before its answer leaves the old words on the row while the screen is blank — LOW
- **Location:** `src/server/propresenter.ts:593-599`
- **Attribution:** introduced by #261 (`git log -S"if (button.id === 'clear' && moved)" f264357..HEAD` gives `da71f74`). At the base a Clear never blanked the row at all (#261's L55), so this is a hole in the new behaviour.
- **Real-world trigger:** the producer presses Clear slide, then Next or Previous before ProPresenter answers the clear: under 60 ms warm, but up to seconds on a cold ProPresenter (the recordings show cold commands up to 7.8 s), where a producer who sees nothing change is likely to press again. LOW: a confusing display that the next slide frame corrects; no user work or cue is lost.
**Evidence**
```ts
      if (!answer || press !== presses) return;
      // A Clear slide that ProPresenter accepts has blanked the screen, and the stream may report no
      // clear, so the row's slide text goes at once.
      if (button.id === 'clear' && moved) {
        slideChanges += 1;
        slide = null;
      }
```
**Failure mode** — The press counter gates the blank. Clear then Next: Next bumps `presses`, so the clear's 204 returns at the gate, the slide text stays and `slideChanges` is not bumped. ProPresenter received `/v1/clear/layer/slide` then `/v1/presentation/active/next/trigger`, and the row ended at `[Current slide: ...Chorus..., Next slide: ...Chorus..., "Pressed Next slide: nothing to move."]`: blank screen, Chorus on the row. A live slide read that is out is also not dropped by that clear. Executed: the repro test below, red at HEAD.
**Recommended fix** — `repro/review-4-finding-1-candidate.diff`, keeping the two existing comment lines above the moved block:
```diff
   let presses = 0;
+  let triggers = 0;
@@ cue()
       presses += 1;
+      triggers += 1;
       const run = presses;
@@ runButton()
       presses += 1;
       const press = presses;
+      const triggered = triggers;
@@
-      if (!answer || press !== presses) return;
-      if (button.id === 'clear' && moved) {
+      if (button.id === 'clear' && moved && triggered === triggers) {
         slideChanges += 1;
         slide = null;
+        if (press !== presses) reportState();
       }
+      if (!answer || press !== presses) return;
```
**Remediation brief**
- **Design intent:** the row's slide text mirrors the screen: a `status/slide` frame, a `presentation/current` clear, or an accepted Clear press sets it, and the live slide read fills it only when none of those came while it was out (`slideChanges`). The command line (`commandLine`) is about the latest command only, which is what `presses` gates. A cue's trigger after the clear makes a presentation active again, and its frame, or the absence of one as today, speaks for the screen.
- **Full surface:** `src/server/propresenter.ts:236` (counter declarations), `:554-555` (the cue's `presses += 1`), `:583-599` (`runButton`). No other site reads the counters. Tests: `test/propresenter.test.ts:1028` and `:487`.
- **Must preserve:** an accepted Clear with no later command blanks the slide text and the press line at once, and bumps `slideChanges` whatever frames came while it was out (`test/propresenter.test.ts:1028` "shows a press's line after the slide text, ... and a Clear slide blanks both"); an accepted Clear drops a live slide read still out (`:487` "keeps a Clear slide press made before the read's answer over the read"); only the latest command's answer sets `commandLine`; a Clear answered with no answer or a non-2xx changes no slide text; a cue sent after the clear leaves the slide text to the stream, as at HEAD.
- **Do not touch:** the `run !== streams` check in `readSlide` (Minor, redundant but harmless); `buttonBrings` and `brings.until`, which the pause by hand relies on and which this fix does not move.
- **Proof:** from the repo root, `git apply docs/reviews/setlist-controller-84/repro/review-4-finding-1-clear-then-next.diff && pnpm exec vitest run test/propresenter.test.ts -t "blanks the slide text at an accepted Clear"`: red now, green after. Keep the applied test as the regression test. Then `pnpm exec vitest run test/propresenter.test.ts test/propresenter-adapter.test.ts`.

### 2. Four of the batch's recorded rules have no test that can go red — MEDIUM
- **Location:** `src/server/propresenter.ts:445-448` (the live slide read), `:571` (the refused-trigger line's gate), `:727` (the End cue for a song with its own Ending section)
- **Attribution:** introduced: `readSlide` by #264 (`5250ba2`), the gate by #261 (`da71f74`), `endCueGroupFor` by #262 (`8c6e64e`), each by `git log -S`.
- **Real-world trigger:** none today: each rule holds at HEAD. The risk is the next change to the adapter, which has had three review rounds of fixes in the pause by hand: a mutant of each rule leaves the whole suite green. MEDIUM because two of the four guard the pause by hand, whose failure stops the slides following on a Sunday (2a) or lets the app fight an operator (2b).
**Evidence** — each mutant below leaves `test/propresenter.test.ts` and `test/propresenter-adapter.test.ts` green, 92 of 92 (executed, `repro/review-4-mutations.sh`):
- 2a. `decide(answer.body);` added after `reportState();` in `readSlide`. The rule (#264, recorded): the read is no slide change and never runs the pause by hand. Broken, an armed ProPresenter that reconnects while a slide outside the expected group shows pauses itself "by hand" at every reconnect. Every read test uses `streamRig`, which arms nothing, so no test can see a pause.
- 2b. `await request(LIVE_SLIDE_PATH)` as `await command(LIVE_SLIDE_PATH)`. The rule: the read opens no pause-by-hand window. Broken, a slide the operator presses just after a reconnect does not pause ProPresenter, and the next cue overrides the operator.
- 2c. `if (run !== presses) return;` deleted. The rule: a refused trigger's line shows only while it is the latest command. Broken, a trigger answered 404 after a later press replaces that press's line with a stale "Trigger refused" line.
- 2d. `ownEnding ? groupFor(presentation, END)` as `ownEnding ? undefined`. The rule (#262, recorded): for a song with its own Ending section, "an End group still triggers". The only own-Ending test (`test/propresenter.test.ts:665`) has no End group, so it pins only the "nothing extra" half.
**Recommended fix** — four tests, no production change:
- 2a, in `test/propresenter.test.ts` "the live slide read": `armedRig({ position: 24, playlist: OCTOBER_25.id })`, `await pro!.streaming()`, `await play(8, 32)` (the Chorus trigger), `clock.advance(PAST_WINDOW_MS)`, `pro!.showSlide(VERSE_3)`, then drop and reconnect as at `:422` (`pro!.dropStreams()`, await offline, `clock.advance(POLL_MS)`, await online, `await pro!.streaming()`), wait for the row to show `VERSE_3_TEXT`, and expect `{ arm: 'armed', pause: null }`.
- 2b, the same set-up with `pro!.showSlide(CHORUS)` in place of `VERSE_3` before the drop: after the reconnect, wait for the row to show `CHORUS_TEXT` from the read, then `await pro!.send(PRESSED_VERSE_3)` with no clock advance, and expect `{ arm: 'paused', pause: 'by-hand' }`. With the mutant the read's own window covers the frame, ProPresenter stays armed, and the test goes red.
- 2c, in `test/propresenter-adapter.test.ts`: `rig.setDelayFor((path) => (path.includes('/group/') ? 700 : undefined))` with the trigger answered 404 (the rig's status per path), cue a section, press Next while the trigger is out (answered at once), wait past 700 ms, and expect the row's last state to hold the press's line and no line starting "Trigger refused", while `console.error` was still called once with the refusal.
- 2d, in `test/propresenter.test.ts` "the cue": the `:665` test with `pro.renameGroup(THERE_IS_FREEDOM, 'Turnaround', 'End')` first, expecting `[trigger(THERE_IS_FREEDOM, 'Ending'), trigger(THERE_IS_FREEDOM, 'End')]` after `play(16, 64)`.
**Remediation brief**
- **Design intent:** the live slide read (#264) only fills the row's text after a stream opens: it is a `request`, not a `command`, so it opens no window, and it never touches `showing`, `expected`, `buttonBrings` or `decide`. The command line holds the latest command's outcome only (`presses`). The End cue's group is End, else Ending, except for a song with its own Ending section, which gets End only.
- **Full surface:** tests only: `test/propresenter.test.ts` "the live slide read" (`:410`) and "the cue" (`:620`), `test/propresenter-adapter.test.ts`. Production sites they pin: `src/server/propresenter.ts:445-448`, `:571`, `:724-728`.
- **Must preserve:** every existing test; the read tests' `streamRig` set-up for the unarmed cases; the adapter rig's existing `setDelayFor` callers at `test/propresenter-adapter.test.ts:162` and `:178`.
- **Do not touch:** production code. If a test cannot be staged as sketched (for example the rig cannot answer a trigger 404 and delay it at once), extend the rig additively, as review 2's remediation did.
- **Proof:** in a scratch worktree at the remediated HEAD (commands in the script's header), `sh docs/reviews/setlist-controller-84/repro/review-4-mutations.sh <scratch>/wt`: today it prints `survived` for `read-decides`, `read-as-command`, `refused-line-ungated` and `own-ending-no-end`; after, each must print `killed`. The new tests are green at the remediated HEAD.

### 3. Nothing tests that a set with no songs still enables the playlist pick — LOW
- **Location:** `web/src/App.tsx:42`, `src/server/connections.ts:321`
- **Attribution:** introduced by #261 (`da71f74`).
- **Real-world trigger:** none today; the rule holds. A Live set with no locators read yet, or an empty set, is the case. LOW: the recorded rule (#261, "No set known is `snapshot.set === null`, so a set with no songs still enables the select") has no test, and breaking it costs a pick that waits for the songs.
**Evidence** — `setKnown={snapshot.set !== null}` as `setKnown={!!snapshot.set?.songs.length}` leaves `test/pages.test.ts` green, 116 of 116; `if (!list) {` as `if (!list || list.songs.length === 0) {` leaves `test/connections.test.ts` and `test/propresenter.test.ts` green, 112 of 112 (executed, `repro/review-4-mutations.sh`). The page test at `test/pages.test.ts:1289` covers `null` and `SNAPSHOT.set`, which has songs.
**Recommended fix** — in `test/pages.test.ts:1289`, add `expect(selectOf(producerPage({ ...SNAPSHOT.set!, songs: [] }))?.disabled).toBe(false)` and that its text does not contain "can be picked until"; in `test/connections.test.ts`, beside "ignores a pick while no set is known, and logs why" (`:471`), a pick against a known set with `songs: []` that lands in `target.picks` and logs nothing, if `pickRig` can stage an empty set (extend it additively if not).
**Remediation brief**
- **Design intent:** the page and the server share one rule for "no set known", `snapshot.set === null`, read from the same controller snapshot (`src/server/server.ts:161`).
- **Full surface:** `test/pages.test.ts:1289-1295`, `test/connections.test.ts:471-480`.
- **Must preserve:** both existing tests as they are.
- **Do not touch:** `web/src/App.tsx` and `src/server/connections.ts`.
- **Proof:** `repro/review-4-mutations.sh` prints `killed` for `page-empty-set-disables` and `server-empty-set-ignores` after.

### 4. Comment hygiene — LOW (aggregated)
- `src/server/target.ts:21` — "ProPresenter's success answer to the cue's trigger or an ATEM program change. Counts only from a target that acknowledges, and only for the cue the server" is one line of about 125 characters → re-wrap the comment at 100 like the rest of the file.
- `src/server/connections.ts:31` — "a pick does nothing while no set is known but log that it was ignored" → "a pick does nothing while no set is known but logs that it was ignored".
- `test/propresenter.test.ts:760` — test name "..., until the next cue is answered" → "..., until the next cue's trigger is sent", which is when `cue()` clears the line (the fake answers at once, so the test cannot tell the two apart).
- `test/fake-propresenter.ts:286` — the `early` answer is load-bearing for the four "keeps ... over the read" tests (`test/propresenter.test.ts:452-505`), which go red on a broken read guard only because the held read answers with the slide live when it came → add that to the `hangSlideReads` comment at `:58-60`, so the capture is not simplified away.

## Needs Further Investigation
### A. The fake's opening presentation/current carries a presentation while a slide shows, which no recording backs
`test/fake-propresenter.ts:221` (the stream's opening frames) replaces the recorded opening `presentation: null` with There Is Freedom while a slide shows (#264, recorded assumption). Both "shows the live slide's text" tests depend on it: a null opening `presentation/current` is a clear, bumps `slideChanges` and drops the read. If the real ProPresenter opens its stream with a null `presentation/current` while a slide shows, #264 shows nothing on that machine. Phase 0 also recorded no `GET /v1/status/slide`. Confirm or kill in #134 at home: record the stream's opening frames and one `GET /v1/status/slide` with words showing and with the screen clear.

### B. A Next slide pressed while a cue's trigger is out, whose frame the press did not predict, no longer moves the expected slides
Carried from reviews 2 and 3 unchanged: this batch did not touch `decide` or the button predictions. It belongs with review 1 finding 4 (LOW, deferred) at triage.

## Reviewed and Dismissed
- The check counting "no group End" as matched while the End cue triggers nothing, for a song with its own Ending section and an Ending group but no End group — recorded decision (#262): that song's end shows through its Ending section's trigger, and the README says so ("the Ending group already").
- The refused-trigger line surviving a cue that triggers nothing — recorded decision (#261): the line clears at the next cue's send, and an unmatched cue sends nothing.
- The README omitting that going offline clears the refused-trigger line — the server clears the row's state on offline anyway, so the page behaves as the README says.
- `docs/install.md:97` "with `actedMs` as `null` at the next cue it acts on" read as wrong for a cue that triggers nothing — "acts on" is `actsOn` in `src/server/connections.ts:222-223`; ProPresenter has no `actsOn` (recorded decision, #263), so every cue counts, and the sentence holds.
- A page from an older server reading `check.problems` and throwing — the server serves the built page, and both are replaced together on restart.
- The ignored-pick test asserting a log line — the log is the requirement (#261 AC2), and the finder's mutation that takes the pick anyway turns the test red too.
- The `!distinct.some((name) => namesMatch(name, END))` clause in `checkLines` surviving mutation — it keeps the base's de-duplication of a section literally named End, which the base's `names` list also did; no behaviour of this batch rests on it.
- The End cue's song lookup `set?.songs.find(({ number }) => number === cue.song)` — the same lookup as `src/server/cues.ts:253`, and `set` is never null when a trigger is possible, since `picked()` needs it.

## Minor / nits
- `src/server/propresenter.ts:446`: `run !== streams` in `readSlide` likely never decides anything, since every path that gives up a stream (`goOffline`, `stop`) also aborts the read's connection, which resolves it null first. Harmless belt and braces.
- `test/propresenter.test.ts:444` "shows no slide text when the read finds none showing": only the read count goes red at base; the `state: []` assertion holds trivially there. Fine as a shape test, weak as a guard against a read that shows "(no words)" for a null slide.
- `test/propresenter.test.ts:743`: the change adds only a console spy, which silences the new refusal log.

## Test quality
Tests added: 22 cases (18 in `test/propresenter.test.ts`, 4 in `test/pages.test.ts`), plus changed set-ups in `test/connections.test.ts`, `test/pre-service-check.test.ts` and `test/setup-screen.test.ts`. Green against `f264357`: 2 new cases (`:655`, `:665`), both guards of #262's fallback that the finder's mutations of the fallback turn red, so keep them. Tautology shapes found: 0 (no mocked unit, no snapshot, no expectation computed with a production helper, no assertion-free test). What the tests lack is in findings 2 and 3: six recorded rules a mutant breaks with the suite green.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` green at `4e70ffe`; `pnpm test:e2e` green locally.
- **Commit hygiene:** commit this doc and its three `repro/` files. The tree is otherwise clean.
- **Likely reviewer asks:** the acceptance run on the real ProPresenter (#134), which settles Needs Further Investigation A and the timings the pause by hand rests on; #266 (pause by hand edge cases, skipped this run); the LOW findings of reviews 1 and 2 still deferred. Review 1 finding 7 (the Playlist select enabled with no set known) is closed by #261.

## Verdict
Not ready as-is, close: one gate. Finding 2 (MEDIUM, tests only) must be remediated before the PR opens, since four rules this batch recorded, two of them in the pause by hand, can be broken with the suite green. Findings 1, 3 and 4 are LOW: fix them in the same pass, or ship them as follow-ups. No CRITICAL or HIGH. No subsystem needs a split ticket.

## Remediation — 2026-10-25
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | — deferred | — | — | LOW tail, deferred by the default scope (eng-pipeline#34) |
| 2 (MEDIUM) | `72e4b61` setlist-controller#84 pre-PR review 4 finding 2: four recorded rules of the batch had no test that could go red | red→green: `sh docs/reviews/setlist-controller-84/repro/review-4-mutations.sh <scratch>/wt` printed `survived` for the four at `4e70ffe` (this review) and `killed` for `read-decides`, `read-as-command`, `refused-line-ungated` and `own-ending-no-end` at `72e4b61`, each killed by its own new test alone (1 failed, 95 passed in `test/propresenter.test.ts` plus `test/propresenter-adapter.test.ts`); the four new tests green at `72e4b61`, 96 of 96 | 0 | proved by execution (MEDIUM, tests only, no shared core, so no verify agent) |
| 3 (LOW) | — deferred | — | — | LOW tail, deferred; `page-empty-set-disables` and `server-empty-set-ignores` still print `survived` at `72e4b61` |
| 4 (LOW, comment hygiene) | — deferred | — | — | LOW tail, deferred |

Full checks at `72e4b61`: `pnpm lint` clean, `pnpm typecheck` pass, `pnpm test` 69 files, 1688 passed, 4 skipped, `pnpm build` pass, `pnpm test:e2e` 56 passed, all on the first run.

### Known regressions, deferred
- None.

### Rework briefs
- None: no verify pass ran, so no rework.
