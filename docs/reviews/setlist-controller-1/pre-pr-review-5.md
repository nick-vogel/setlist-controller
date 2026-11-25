# Pre-PR review: setlist-controller#1 stage 2 round 2 (pre-PR review 4 finding 3 remediation)

**Branch:** `setlist-controller-1-ipad-rehearsal` vs `origin/main` (merge-base `1460f52` "setlist-controller#59 Song transitions: overlap into the next count-off, a prayer pad, and fades (#94)")
**Reviewed at:** HEAD `c41b49a` (setlist-controller#1 pre-PR review 4 remediation closure table), clean tree, 0 uncommitted, 0 untracked at review start; 58 files, +3494 / -329 against the merge-base, 47 commits.
**Delta under review:** since `0a2cda6` (setlist-controller#18 Loop then a quick tap leaves the loop on in another section), the HEAD `pre-pr-review-4.md` reviewed. 5 commits, 6 files, +465 / -3: `src/server/playback-controller.ts`, `test/play-from-start-window.test.ts` (new), `test/transport.test.ts`, and review 4's doc and repros.
**Reviewed against:** `pre-pr-review-4.md` finding 3, its remediation closure table, rework briefs, Known regressions, and Approach decisions; `.epic-loop/closeout.md` decisions 2 and 8; `.epic-loop/tickets/31/proposals.md` ("Guard play from start against a stale stopped state", close-out decision 2's proposal 5, filed as a sub-issue of #1). No `CODING_STANDARDS.md`, `docs/coding-standards.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs exist, so conformance is judged against the spec and the five universal review rules.
**Date:** 2026-10-19
**Reviewer:** 1 code-review agent + verify pass.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | Already up to date |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam 1 suite | `pnpm test` | 32 files, 634 passed, 3 skipped (the three Linux-only 403 tests in `test/setup-screen.test.ts`, which run in CI) |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | 30 passed, WebKit and `chromium-android` |
| Delta tests against the last reviewed commit | the delta's versions of `test/play-from-start-window.test.ts` and `test/transport.test.ts` copied into a scratch worktree at `0a2cda6` | 3 of the 6 new cases red; the other 3 green for a traced reason (Test quality) |
| Delta tests against `$BASE` | the same files in a scratch worktree at `1460f52` | 5 of the 6 new cases red; the laptop-start preserve pin is green by design |
| Follow-up pin | `test/play-from-start-window.test.ts` with `src/` at `5bd8397` | the second case red, so it is `75fe2a3`'s real red |
| Mutation of the pending stop | finder agent, 8 mutants on a scratch worktree at HEAD, full suite each | 7 killed; the lost-connection `forgetStop()` survives (finding 1) |
| Pending stop exits and other commands | finder agent driving the controller on `manualClock` (auto-stop re-arm, jump during a pending stop, double Play from start, lost stop) | finding 2 executed; the rest dismissed |
| Web Play from start control | read `web/src/SongHeading.tsx:45-50`, `web/src/App.tsx:73` | no debounce or in-flight lock; only `disabled={!playable}` |
| Review 5 repro | `cp docs/reviews/setlist-controller-1/repro/review-5-controller.test.ts test/ && pnpm exec vitest run test/review-5-controller.test.ts` | finding 2's two cases red at HEAD; finding 1's case green at HEAD and red with `playback-controller.ts:345` deleted |
| Real Live behaviour of `start_playing` while playing | not run: the guardrails forbid opening or controlling Ableton Live | relies on #13's trials as recorded in the `play-from-start` comment |

**Overall:** The finding 3 remediation does what review 4 asked. Play from start pressed after a Stop or the auto-stop, before Live reports the stop, now sends the jump then `start_playing`, and every exit of the pending stop that the Approach decision names is wired and, bar one, pinned by a test that goes red without it. Two LOW findings remain: the lost-connection exit has no test, and a second Play from start inside a start's report window sends `start_playing` to a playing Live, a #31 window that is the controller-side twin of the already-filed stale-stopped-state proposal. Neither gates the PR.

## Approach decisions
- Every decision listed in `pre-pr-review-4.md`'s Approach decisions holds at this HEAD, including **the pending stop's lifetime**: it ends on Live's `playing: false` report, on the `LOOP_REPORT_MS` expiry, on a lost connection, or when Play from start sends `start_playing`; a `playing: true` report does not end it.
- **Play from start after a start the controller sent (finding 2):** no in-place fix on this branch. The Play from start branch choice has been rewritten three times in response to reviews (`331d611`, `5bd8397`, `75fe2a3`), so the remaining stale-state windows go to one split ticket with its own test matrix: the filed proposal "Guard play from start against a stale stopped state" (close-out decision 2, proposal 5). Its natural mechanism is a pending start mirroring the pending stop (armed by the stopped branch, ended by Live's `playing: true` report, the expiry, a lost connection, or a sent stop), and it has to settle how a jump made while a start is pending waits (`barLine`, the lost timer).
- **Lost-connection exit test (finding 1):** a controller-level case in `test/play-from-start-window.test.ts`, since seam 1 cannot lose the connection inside the 1 s wait (the bridge declares Live lost only after `SILENT_BEFORE_LOST_MS`, 4 s).

## Prior-review closure
Review 4 had three findings, all LOW, and none MEDIUM or higher.
- **Finding 3 (LOW): fully fixed** by `331d611`, `5bd8397` and `75fe2a3`. The two seam 1 cases (`test/transport.test.ts`, the Stop and the auto-stop at End with replies held) and the controller-level case (`test/play-from-start-window.test.ts`, scenario C) are red at `0a2cda6` and green at HEAD. Its open residual stays as review 4 deferred it (Minor below), not reintroduced or widened.
- **Finding 1 (LOW): untouched**, deferred by decision (close-out decision 8: "Findings 1 and 2 stay unfixed as the deferred LOW tail").
- **Finding 2 (LOW): untouched**, deferred by decision (close-out decision 8; filed as its own bug at close-out).
- Nothing was "resolved" by a comment or doc edit alone.

## Confirmed Issues
### 1. No test covers the pending stop's lost-connection exit — LOW
- **Location:** `src/server/playback-controller.ts:345`
- **Attribution:** introduced in the delta by `331d611` (setlist-controller#1 pre-PR review 4 finding 3: Play from start just after a Stop resumes where the song stopped): `git log -S'forgetStop' 0a2cda6..HEAD` names it, and `forgetStop` does not exist at `0a2cda6`.
- **Real-world trigger:** the line guards a near-unreachable state: a stop sent in the last second before the bridge declares Live lost (`SILENT_BEFORE_LOST_MS`, 4 s of silence), Live answering again and reporting `playing: true` within the rest of that second, then Play from start. LOW, a test gap on a fallback path (universal rule: a test for every fallback path).
**Evidence**
```ts
if (!event.connected) {
  playing = false;
  position = null;
  liveLoop.on = false;
  forgetAskedLoop();
  forgetStop();
  clearJump();
}
```
**Failure mode** — deleting `forgetStop();` at `:345` leaves all 634 tests green (finder mutant M2). With the line gone: playing at 8, Stop, connection lost, reconnected, Live reports `playing: true` and position 8, Play from start song 2 sends `['stop', 'jump 3', 'start']` (a `start_playing` to a playing Live) instead of `['stop', 'jump 3', 'continue']`. Executed: the first case of `repro/review-5-controller.test.ts` is green at HEAD and red with the line deleted.
**Recommended fix** — add this case to `test/play-from-start-window.test.ts`, using that file's `SET` and controller setup:
```ts
it('waits for the bar line after a lost connection, though Live never reported the stop', () => {
  const sent: string[] = [];
  const controller = startPlaybackController(
    {
      onChange: () => {},
      jump: (cue) => sent.push(`jump ${cue}`),
      continuePlaying: () => sent.push('continue'),
      startPlaying: () => sent.push('start'),
      stopPlaying: () => sent.push('stop'),
      loopOn: () => {},
      loopOff: () => {},
      requestCuePoints: () => {},
      fadeOut: () => {},
    },
    manualClock(),
  );
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'cue-points', cuePoints: SET });
  controller.fromLive({ kind: 'playing', playing: true });
  controller.fromLive({ kind: 'position', beats: 8 });

  controller.command({ kind: 'stop' });
  controller.fromLive({ kind: 'connection', connected: false });
  controller.fromLive({ kind: 'connection', connected: true });
  controller.fromLive({ kind: 'playing', playing: true });
  controller.fromLive({ kind: 'position', beats: 8 });
  controller.command({ kind: 'play-from-start', song: 2 });

  expect(sent).toEqual(['stop', 'jump 3', 'continue']);
});
```
**Remediation brief**
- **Design intent:** the controller's `playing` is only Live's word and lags a stop the controller sent, so `stopWait` remembers that stop until Live reports it. A lost connection resets everything Live told the controller (`playing`, `position`, the loop, the asked loop, the waiting jump), and the pending stop belongs with them: after a reconnect, the listeners' fresh reports are the truth.
- **Full surface:** `test/play-from-start-window.test.ts` only. No production change.
- **Must preserve:** the two existing cases in `test/play-from-start-window.test.ts`; `src/server/playback-controller.ts:340-347` unchanged.
- **Do not touch:** `forgetAskedLoop()` at `:344`, unobservable for the same reason (review 4 Minor), and not part of this finding.
- **Proof:** the new case passes at HEAD; delete `forgetStop();` at `src/server/playback-controller.ts:345` and `pnpm exec vitest run test/play-from-start-window.test.ts` goes red; restore it. The same case is the first in `docs/reviews/setlist-controller-1/repro/review-5-controller.test.ts`.

### 2. A second Play from start inside a start's report window sends `start_playing` to a Live that is already playing — LOW
- **Location:** `src/server/playback-controller.ts:445-454` (`play-from-start`); the control is `web/src/SongHeading.tsx:45-50`
- **Attribution:** introduced on this branch (not on `origin/main`) by `585ea58` (setlist-controller#31 Play from start while stopped resumes where Live last stopped, not at the song's first locator): at `1460f52` the stopped branch sent `continue_playing`, so a second press was harmless. Untouched by this delta for the double press (the finder's probe gives the same sequence at `0a2cda6` and HEAD). For the Stop route the delta changes the first press only: at `0a2cda6` it sent `continue`, at HEAD `start`; the second press sends `start` to a playing Live at both.
- **Real-world trigger:** the leader taps Play from start while Live is stopped, then taps it again (a double tap, or a correction to the next song) before Live's `playing: true` report, roughly 100 to 300 ms. The button has no debounce or in-flight lock. LOW, capped: the double tap on the same song restarts Live a few milliseconds into the song it just started, which is barely audible; upgrade to MEDIUM if the #14 or #15 rehearsal shows that `start_playing` on a playing Live drops a jump Live has queued for the bar line (the correction to song 2 is then lost and song 1 plays on), or that the queued jump fires a bar later and repeats the song's first bar. Check: in the rehearsal, tap Play from start on song 1 then song 2 quickly while stopped, and watch which song plays.
**Evidence**
```ts
if (playing && stopWait === null) {
  jumpTo({ song: command.song, section: 0 }, first);
  continuePlaying();
} else {
  leaveLoopFor({ song: command.song, section: 0 });
  jump(first.cue);
  clearJump();
  startPlaying();
  forgetStop();
}
```
**Failure mode** — stopped at 8, Play from start song 1, Play from start song 2: the controller sends `['jump 0', 'start', 'jump 3', 'start']`, where the playing branch would send `['jump 0', 'start', 'jump 3', 'continue']`. Second route: playing at 8, Stop, Play from start song 1, Live's late `playing: false` for the stop, Play from start song 2: `['stop', 'jump 0', 'start', 'jump 3', 'start']`. Per #13's trials (the `play-from-start` comment), `start_playing` on a playing Live restarts it from its start marker at once. The stopped branch also clears the waiting jump, so no page shows song 2 waiting. Executed: the two finding 2 cases of `repro/review-5-controller.test.ts` are red at HEAD.
**Recommended fix** — no in-place fix on this branch (Escalation). Add this route to the filed "Guard play from start against a stale stopped state" issue: that proposal names the laptop-start route (Live started at the laptop, its report not yet in), and this is the same stale `playing: false` caused by the controller's own `start_playing`. The likely mechanism there is a pending start mirroring the pending stop: armed when the stopped branch sends `start_playing`, ended by Live's `playing: true` report, by the `LOOP_REPORT_MS` expiry, by a lost connection, or by a stop sent; while it is armed, Play from start takes the playing branch.
**Remediation brief**
- **Design intent:** Live keeps two positions while stopped (#31): `continue_playing` resumes at the stop point and ignores a jump; `start_playing` plays from the start marker, which a jump while stopped moves, and on a playing Live restarts it at once. The controller chooses between them on `playing`, Live's word, which lags any transport command the controller sends by a report interval. The pending stop closes the lag after a sent stop; a sent start has the same lag and nothing closes it.
- **Full surface (for the split ticket):** `src/server/playback-controller.ts:445-454` (branch choice), `:378-385` (`playing` report), `:340-347` (lost connection), `:163-172` (`askStop`, which should end a pending start), `:209-246` (`jumpTo`: `barLine` and the lost timer read `playing`, so a jump made while a start is pending would be timed as a stopped jump). `web/src/SongHeading.tsx:45-50` is the control; a client-side debounce would not cover the Stop route or a correction to another song.
- **Must preserve:** every case in `test/play-from-start-window.test.ts` and the `play song from start` block of `test/transport.test.ts` (including the lost stop and the laptop-start pins); `test/transport.test.ts`'s stopped case (jump then `start_playing`, never `continue_playing`).
- **Do not touch:** the pending stop's lifetime (Approach decisions); the declared cost of a lost stop (Reviewed and Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-1/repro/review-5-controller.test.ts test/ && pnpm exec vitest run test/review-5-controller.test.ts; rm test/review-5-controller.test.ts`: the two finding 2 cases are red now and must be green after.
- **Escalation:** the Play from start branch choice has been rewritten three times in response to reviews (`331d611`, `5bd8397`, `75fe2a3`). Recommend the split ticket (the filed stale-stopped-state proposal, with this route added) rather than a fourth in-place rewrite. `/pr-review-remediate` should not fix this finding on this branch.

### 3. Comment hygiene — LOW (aggregated)
- `src/server/playback-controller.ts:59-60` — "Live reports a change to its loop within a listener interval, so a loop the controller asked for that Live has not reported this long after was lost on its way to Live." → "Live reports a change to its loop or its playing state within a listener interval, so a loop asked for or a stop sent that Live has not reported this long after was lost on its way to Live."
- `src/server/playback-controller.ts:63-64` — "The clock times a jump tapped while stopped, …, and a loop asked for, which no report of the loop may ever answer." → add ", and a stop sent, which no report of the playing state may ever answer."
- `src/server/playback-controller.ts:102-104` — the `stopWait` comment says only that it stops a timer → add "Non-null while a stop is pending, which Play from start reads as stopped. Only Live's `playing: false` report ends it: a `playing: true` report may answer a start sent before the stop."
- `src/server/playback-controller.ts:438-444` — "Playing, the jump waits for the bar line, …" → "Playing with no stop pending, the jump waits for the bar line, … A stop the controller sent and Live has not reported counts as stopped, since Live takes messages in order; sending `start_playing` ends that pending stop."

## Needs Further Investigation
None new. Review 4's open items stand unchanged.

## Reviewed and Dismissed
- A lost stop datagram, then Play from start within `LOOP_REPORT_MS`, sends `start_playing` to a playing Live (finder probe: `stop, jump 3, start` with the clock moved 999 ms) — the accepted, declared failure of the fix: review 4 finding 3's Must preserve ("The expiry bounds that to `LOOP_REPORT_MS`, the bound already accepted for a lost loop") and its Approach decisions.
- The auto-stop re-arming the pending stop on later position reports (`:370`) — `endReached` needs the previous report inside the song, so reports at 30, 32.5, 33.5 and 34.5 give exactly one `stop` (finder probe), and after the expiry Play from start takes the playing branch.
- `clock.every` is a repeating timer (`:165`) — `forgetStop` calls the stopper before nulling, so it fires once, as `forgetAskedLoop` does.
- Jump, Next, Previous, Loop, Fade out and Refresh during a pending stop — none reads `stopWait`, so each behaves as at `0a2cda6`; a jump during a pending stop shows as waiting until the `false` report clears it, unchanged from before the delta.
- `cue-points` and `startup` do not end the pending stop — the expiry bounds it, and a reconnect's listener reports carry Live's real state.
- The fade's own stop does not arm the pending stop (`src/server/fade-out.ts:100`) — declared in `331d611`'s message and review 4's brief.
- "Seam 1" in `test/play-from-start-window.test.ts:8` — defined in `test/harness.ts:16`.

## Minor / nits
- Known regression, deferred (review 4 closure, quoted: "an earlier stop's `false` report ends a later pending stop … Needs three presses inside one report latency. Left open: larger than one line and outside the scoped re-verify. The next stage 2 round re-examines it."): re-examined and still open at HEAD, unchanged by the delta. It is the same stale-state family as finding 2 and belongs in the same split ticket.
- A stop report slower than `LOOP_REPORT_MS` (1 s) brings finding 3's resume-at-the-stop-point back, since the pending stop has expired. Inference, not executed; the reports take about 100 to 300 ms. Check the #14 server log: the gap between the stop send and the `is_playing` report.

## Test quality
Tests added in the delta: 6 cases, 2 in the new `test/play-from-start-window.test.ts` and 4 in `test/transport.test.ts`'s `play song from start` block.
- Red at `0a2cda6`: window case 1 (scenario C), transport "pressed after Stop, before Live reports the stop", transport "after the stop at song 1's End, before Live reports it".
- Green at `0a2cda6` for a traced reason: window case 2 is `75fe2a3`'s proof, red with `src/` at `5bd8397`; transport "Live is started at the laptop just after it reports the stop" and "a stop Live never made" are the fix's preserve pins and green before the pending stop existed by design. Mutants M4 (a `false` report no longer ends the wait) and M1 (no expiry) turn them red.
- At `$BASE` (`1460f52`): every new case red except the laptop-start pin, which pins behaviour the base already had.
- Mutation (finder, full suite each): M1 no expiry, M3 no `forgetStop()` in the stopped branch, M4, M5 branch on `playing` alone, M6 a `true` report ends the wait, M7 auto-stop not armed, M8 Stop not armed: each killed. M2 (no `forgetStop()` on a lost connection) survives: finding 1.
- Tautology shapes: none. The controller-level cases assert the exact sent sequence against a literal, and the seam 1 cases assert the OSC messages the fake Live received and the snapshot.

## Before opening the PR
- **CI readiness:** lint, typecheck, test, build green locally; the three Linux-only 403 tests run in CI.
- **Commit hygiene:** commit this doc and `repro/review-5-controller.test.ts`. Nothing else is outstanding.
- **Likely reviewer asks:** the real-Live behaviour of `start_playing` on a playing Live (finding 2's cap) is for the #14 or #15 run; the epic body's `continue_playing` line is edited at close-out.

## Verdict
**Ready to open a PR, with follow-ups.** Zero CRITICAL, HIGH or MEDIUM findings. Review 4's finding 3 is fully fixed and pinned; findings 1 and 2 of review 4 stay deferred by Nick's close-out decision 8. This round's three LOWs: finding 1 (a one-case test for the lost-connection exit) and finding 3 (comment hygiene) can land before the PR in one commit each; finding 2 is escalated to the filed stale-stopped-state ticket with its route added, not fixed in place, since the Play from start branch choice has had three review-driven rewrites already. The confirmed list holds at three but has shifted from a behaviour bug toward a test gap and comments, which is the expected shrink.
