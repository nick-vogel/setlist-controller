# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback, follow-up batch #276, #302, #377, #266

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `6e8d969` "Merge pull request #394 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `919cb65` (setlist-controller#266 Pause by hand: eight edge cases where a press by hand does not pause, or the app's own change does), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 12 files total, +2172 / -273 against the merge-base, 19 commits. Production code is `src/server/propresenter.ts` (+615 net of churn), `src/server/connections.ts`, `src/server/target.ts`; the rest is tests, the fake ProPresenter, `README.md` and `docs/install.md`. This review adds the doc and 1 file under `repro/`.
**Delta under review:** none: `--fresh`, the whole branch against the merge-base. Reviews 1 to 5 in this folder reviewed the earlier PR of this epic, which landed before this merge-base.
**Reviewed against:** epic setlist-controller#84 (its spec and user stories), the four sub-issues this branch carries (#276, #302, #377, #266) and the deferred #269, the run's per-ticket assumptions and lane reports, review 5's Approach decisions, the repo entry's checks and guardrails. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape.
**Date:** 2026-11-09
**Reviewer:** 3 agents (2 code-review, 1 tautology audit) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | in the integration worktree | ok, lockfile unchanged |
| `pnpm lint` | full | green |
| `pnpm typecheck` | full | green |
| `pnpm test` | full, load average about 8 on 14 cores | green: 74 files, 2313 passed, 4 skipped, no flake |
| `pnpm build` | full | green |
| `pnpm test:e2e` | full (builds, then WebKit and Chromium Android on OS-assigned ports) | green: 72 passed |
| Tautology audit | the branch's 5 changed test files and the two fakes copied onto `6e8d969` in a scratch worktree, run there; per-test diff of names against a pristine base run | 91 tests added or modified; 62 red at base (52 assertion reds, 10 snapshot-wait timeouts, 0 import reds); 29 green at base, each one either a test of fake behaviour the branch added (11, all red against the base fake), a finding's proof that is red at its fix commit's parent (6), or a scope guard that pins preserved behaviour (12). None vacuous |
| Finding 1 repro | `repro/review-6-finding-1-lead-comeback.diff` applied to HEAD in a scratch worktree; a sanity twin (no offline) confirmed the send point fires at beat 30 when online | red at HEAD: the comeback re-sends Verse 1's first slide; green with the recommended fix, and `test/propresenter.test.ts`, `test/connections.test.ts`, `test/propresenter-adapter.test.ts` all green with it (403 tests) |
| Backoff test mutation (candidate: the reopen test cannot go red) | `silence = Math.min(silence * 2, ...)` replaced by a constant 10 s, and by `* 4`, in a scratch worktree | both mutants turn "opens a quiet stream again after 10 s, then 20 s, 40 s, 60 s and 60 s" red; candidate dismissed |
| Em-dashes in shipped copy | `git diff 6e8d969 \| grep '^+' \| grep '—'` | none |
| Guardrails | no launchd, no install script, no production OSC ports, no Live, no `build-set` | held |
| Not run | the acceptance run on the home ProPresenter (#134) | out of scope for a review; every behaviour here is judged against the fake and the recorded fixtures |

**Overall:** The four tickets do what their issues and recorded assumptions say, the full checks are green, and the new tests are not tautological: every one either fails at the base or pins a behaviour the branch had to keep. One LOW defect is proved: with the lyric lead on, a ProPresenter that comes back in the last two beats before a slide change whose send point passed while it was offline gets the slide already on screen sent again. The rest is a test gap on two fallback paths, comment hygiene, and three items that need a decision or a home run. Nothing here gates the PR.

## Approach decisions
Carried forward from reviews 1 to 5, unchanged:
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it.
- Requests and going offline: a request belongs to the connection it was sent on, an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline.
- Adapter-level behaviour that the fake ProPresenter cannot stage (requests answered late or at different speeds) goes in `test/propresenter-adapter.test.ts`, whose rig takes a delay per request path (`setDelayFor`). Behaviour the fake can stage stays in `test/propresenter.test.ts`.
- A Clear slide's blank is a fact about the screen, not about the last command (review 4 finding 1, deferred; mechanism unchanged).
- Tests for the live slide read's pause-by-hand rules go in `test/propresenter.test.ts`, armed, through the fake's `dropStreams` and reconnect; the refused-trigger gate goes in `test/propresenter-adapter.test.ts` with `setDelayFor`.
- An armed reconnect is staged through `armedRig`, which returns `next`, and the shared local set-up `reconnectArmedShowing`.
- The adapter rig answers a path with a given status through `setStatusFor`, checked before every route, and keeps every state the adapter reports in `states`.
- A new adapter test that waits for an answer the rig delays waits on the answer's own effect with `vi.waitFor`, not on a fixed `sleep`; a test that waits on an absence keeps its sleep.

Added by this review:
- A slide change missed while offline is recorded only from what Live reports: a cue handed (`cued`), the playhead crossing a planned beat in `moved`'s offline branch, or the adapter's `report.missed` for a trigger that got no answer. The lead's send timer (`fire`) records nothing, since its send point is ahead of the beat and nothing has changed on the screen's timeline yet (finding 1).
- A comeback test that needs the lead uses `armedRig` with `leadBeats: 'default'` on `NOVEMBER_8` and `SLIDES_CUE_POINTS`, and goes offline with `dropStreams` then `stop`, so no poll brings ProPresenter back before the test's clock passes the send point (finding 1's repro).

## Confirmed Issues
### 1. With the lyric lead, a ProPresenter back online between a change's send point and its beat gets the slide already on screen sent again — LOW
- **Location:** `src/server/connections.ts:789-791`
- **Attribution:** introduced by `ab69af6` (setlist-controller#302 A ProPresenter whose status stream stops its heartbeat flaps offline every 10 s while its API still answers): `git log -S'miss(entry, change.cue)' 6e8d969..HEAD` names only that commit. At the base, `fire` returned at once for an offline target (`git show 6e8d969:src/server/connections.ts`, line 746: `if (entry.arm !== 'armed' || entry.connection !== 'online' || !sameLoop(loop(), change.loop) || predict(change.beat) === null) return;`).
- **Real-world trigger:** the lead is on by default (2 beats). ProPresenter drops (a stream drop, a request timeout) and comes back at a later `/version` poll; when that return lands in the 2 beats between a change's send point and its beat, while the playhead is still in the section, the screen gets a re-take of the slide it already shows and the lateness log a Fire again line. The change itself still goes on its beat. No wrong words reach the room, so LOW.

**Evidence**
```ts
const fire = (entry: Entry, change: Change & { at: number; loop: Loop | null }) => {
  if (!sameLoop(loop(), change.loop) || predict(change.beat) === null) return;
  miss(entry, change.cue);
  if (entry.arm !== 'armed' || entry.connection !== 'online') return;
```
Going offline (`report`, `connections.ts:404-417`) forgets the early mark but leaves `entry.pending`, so the lead's one-shot timer still fires at the send point while ProPresenter is offline, and `miss` records the section. `comeback` (`:436-441`) then sends `current()`, the slide for the playhead, which is the slide before the change.

**Failure mode** — Ancient Gates (`NOVEMBER_8`, `SLIDES_CUE_POINTS`), lead 2: the playhead at 28.5 in Verse 1, whose change on beat 32 is sent on 30. ProPresenter goes offline, the server's clock passes 30, ProPresenter comes back with the playhead still at 28.5. Expected triggers: `[.../1/trigger]` (slide 1, sent once at 14). Received: `[.../1/trigger, .../1/trigger]`. Playing on to 32.5 then sends `.../2/trigger` as it should. Executed: `repro/review-6-finding-1-lead-comeback.diff`.

**Recommended fix** — put `fire`'s base guard back:
```diff
   const fire = (entry: Entry, change: Change & { at: number; loop: Loop | null }) => {
-    if (!sameLoop(loop(), change.loop) || predict(change.beat) === null) return;
-    miss(entry, change.cue);
-    if (entry.arm !== 'armed' || entry.connection !== 'online') return;
+    if (entry.arm !== 'armed' || entry.connection !== 'online' || !sameLoop(loop(), change.loop) || predict(change.beat) === null) return;
     hand(entry, change.cue, change.at, 'not-played-across');
```
Audit: the diff removes one behaviour, the miss recorded at a send point while offline, and dropping it is the intent. Every other line keeps its behaviour: an online, armed target with the same loop and a known prediction is handed the change exactly as before, and the order of the four checks does not matter since none has a side effect. A change whose beat the playhead crosses while ProPresenter is offline is still recorded, by `moved`'s offline branch (`:1088-1091`, `changesOn`), and a section start by `cued`'s `miss` (`:985`). The failure of the fix: when Live sends no report across the beat while ProPresenter is offline (Live disconnected too), nothing is recorded and the comeback sends nothing. That is the spec ("missed changes are not queued"), and Live's next report or cue sends the slide. Run with the fix: the repro and all of `test/propresenter.test.ts`, `test/connections.test.ts` and `test/propresenter-adapter.test.ts` pass.

**Remediation brief**
- **Design intent:** `connections.ts` hands each armed, online target its cues and, for a target that plans slides with a lead, sends each change early from a one-shot timer (`schedule` then `fire`). For an armed target that is offline, it records only the latest cue or slide change that came due (`entry.missed`), and on its comeback (`comeback`) sends the playhead's slide once, as Fire again, only when the playhead is still in that song and section. "Came due" means Live reached it: a section start or a planned beat the playhead crossed. A send point is the server's guess ahead of the beat, not something that came due.
- **Full surface:** `src/server/connections.ts:789-791` (`fire`), the only change. Add the repro test to `test/propresenter.test.ts`, inside `describe('the lyric lead', ...)` (`:3984`) using its `leadRig`, or as the repro's own `describe` at the end of the file; either is fine. The paths that keep recording: `connections.ts:423` (`miss`), `:985` (`cued`), `:1088-1091` (`moved` offline), `:892` (`report.missed`).
- **Must preserve:** `fire`'s online path (hand, the early mark, the next schedule); the comeback tests in `describe('a slide change that came due while offline')` (`test/propresenter.test.ts:213-370`), including "sends the slide for the playhead once ... inside the section whose change it missed" (`:235`) and the guard "... in a later section than the change it missed" (`:358`); every test in `describe('the lyric lead')`; `test/connections.test.ts` "going online again replays nothing" for a target that plans nothing.
- **Do not touch:** `moved`'s offline branch and `changesOn`, including how it treats the next section's pickup slide (Minor / nits); `comeback`'s same-song-and-section condition (2be786f's proof); `report`'s offline branch, which leaves `entry.pending` scheduled as the base did.
- **Proof:** `git apply docs/reviews/setlist-controller-84/repro/review-6-finding-1-lead-comeback.diff && pnpm exec vitest run test/propresenter.test.ts -t 'review 6'`. Red now (an extra `/v1/presentation/5A606BC5-9279-4509-983E-88092AE567F0/1/trigger`), green after. Then move the test into the file's own structure, renamed without "review 6", and run `pnpm exec vitest run test/propresenter.test.ts test/connections.test.ts`.

### 2. Two fallback paths of the branch have no test — LOW
- **Location:** `src/server/propresenter.ts:666-668`; `src/server/connections.ts:917` with `src/server/target.ts:68-73`
- **Attribution:** introduced: the retry wait by `50092b2` (#276), the Arm hook by `079ffa0` (#266).
- **Real-world trigger:** none needed; this is the "a test for every fallback path" rule. Each path is short and reads right, so LOW.

**Evidence**
```ts
      try {
        await wait(readRetryMs, undefined, { signal: AbortSignal.any([stopping.signal, given]) });
      } catch {
        return null;
      }
```
`pro.answerReads` is used four times in `test/propresenter.test.ts` (`:3324`, `:3334`, `:3349`, `:3363`): a 500 once, 500 three times, 503 three times, a 404. None goes offline or stops the target while a retry waits. The Arm test in `test/connections.test.ts:159` covers Arm while armed, paused by hand and disarmed, all online; `target.ts:68` says `armed()` is called "online or not", and no test presses Arm while the target is offline, or while a Fade out has paused it.

**Failure mode** — none today. Removing the `catch` return, or calling `armed()` only while online, leaves every test green.

**Recommended fix** — two tests. (a) In `test/propresenter.test.ts`, beside the retry tests at `:3320-3370`: `answerReads(THERE_IS_FREEDOM, 500, 500, 500)`, pick the playlist, drop ProPresenter (`pro.stop()`, then advance `POLL_MS`) while the first retry waits, then bring it back and check that the read after the comeback matches the song (`check` has no "could not be read" line) and that no read of the presentation went out after the drop and before the comeback. (b) In `test/connections.test.ts`, beside `:159`: with the fake target offline, press Arm and expect `target.arms()` to go up by one; and with it paused by a Fade out, press Arm and expect the same.

**Remediation brief**
- **Design intent:** a presentation read that answers 5xx is retried up to twice, `readRetryMs` apart, and no wait outlives the connection or the target: going offline or `stop` aborts the wait and the read resolves null, so the read after the comeback starts fresh. `armed()` tells a target, on every Arm the producer presses whatever the state before and online or not, to forget what the operator did at it; the Count Off re-arm after a Fade out does not call it.
- **Full surface:** `test/propresenter.test.ts` near `:3320-3370` and `test/connections.test.ts` near `:159-178`; no production change.
- **Must preserve:** the existing retry tests at `:3322-3370`, including the 404 that is asked once (`:3361`); `test/connections.test.ts` "tells a target the Fade out paused nothing when the next Count Off arms it again" (`arms() === 1`).
- **Do not touch:** `readPresentation`'s retry condition (5xx only), which `:3361` pins.
- **Proof:** each new test turns red against a mutant: (a) replace `return null;` in the `catch` with `answer = null; break;` and drop the abort signal from `wait`; (b) wrap `connections.ts:917` in `if (entry.connection === 'online')`.

### 3. Comment hygiene — LOW (aggregated)
- `src/server/connections.ts:254-255` — "the song and section of the latest cue or slide change that came due while it was armed and offline" → add "or of a cue handed while online whose trigger got no answer before it went offline (target.ts, missed)", as the header at `:39-44` already says.
- `src/server/propresenter.ts:1001-1002` — "One with no answer adds nothing: going offline logs and clears the row already, but the server records the cue as missed" → "One with no answer logs nothing of its own, since going offline logs and clears the row, and is reported missed, ...".
- `src/server/propresenter.ts:451` — "Kept across going offline, since ProPresenter's screen is as it was after a reconnect" → "Kept across going offline, on the guess that ProPresenter's screen is as it was; a slide the operator pressed while it was offline is not seen".

## Needs Further Investigation
### A. A refused trigger of the next song leaves the presentation last triggered on that song, so a Previous slide (or a Next slide from a place with no next) predicts nothing, and its late cold frame pauses ProPresenter — confirm with an adapter test
`propresenter.ts:932` sets `triggeredIn` when the cue is handed, and the refusal handler (`:1007-1009`) puts back only `expected`. `slidesBrought` (`:1701-1712`) for Previous always searches `movesIn()`, which is then the refused song, for neighbours of a slide of the song before, so the press brings nothing, and a frame past `HAND_WINDOW_MS` (1000 ms) after its 2xx is a change by hand. Pre-existing, untouched: the base sets `triggeredIn` the same way (`git show 6e8d969:src/server/propresenter.ts`, line 706), and `f2b8ea7` (#377 pass 2 finding 1) keeps it on purpose so that a slide pressed by hand in the refused song is found, which the comment at `:924-926` records. Note that #266's recorded assumption for L98 says the presentation last triggered is put back too; the code and its comment do not, and the code's choice is the later decision. To confirm: in `test/propresenter-adapter.test.ts`, show a slide of song A, refuse song B's trigger with `setStatusFor`, press Previous with `setDelayFor` holding its frame 1100 ms past the 2xx, and check the row stays armed. Needs two uncommon things at once (a refused trigger and a cold frame), the same family as the deferred #269.

### B. While a quiet stream's heartbeat comes and goes, each quiet start and end runs a full check, and a check whose playlist read gets a non-200 drops every song's slides until the next check — confirm the playlist read's behaviour on a degraded ProPresenter at home
`propresenter.ts:869-876` and `:753-760` call `report.fileChanged()` on each quiet start and end, which runs the check (`connections.ts:895`). With the heartbeat every 10 to 23 s that the 2026-11-03 run measured, that is two checks per cycle, and the backoff never grows, since each heartbeat resets it. `readPicked` (`:612-616`) sets `read = null` on a playlist read that answers anything but 200, and the 5xx retry of #276 covers presentation reads only. So a single 500 on the playlist read in one of those checks makes every cue trigger nothing until the next check, with "could not be read" in the check. Attribution: the playlist rule is pre-existing; #302 adds the checks that run mid-service. The #302 lane recorded the flapping as a decision for Nick (lane F3.9). To confirm: on the #134 home run, record whether a ProPresenter with a sparse heartbeat ever answers `GET /v1/playlist/{id}` with a 5xx. To lift to MEDIUM: any such answer.

### C. Two refusals in a row can put back as expected a slide that never showed — confirm with an adapter test
`propresenter.ts:930` captures `before` when a cue is handed, which can be the expected set of an earlier cue still in line; when that earlier cue is dropped or refused and the later one is refused too, `:1008` puts back the earlier cue's slide, so a press by hand onto it does not pause. Introduced with #266's refusal rule (`079ffa0`); the #266 lane left it open as a LOW (root `refusal-restores-unconfirmed-expected`). To confirm: two cues handed in one move, both answered 500 through `setStatusFor`, then a frame showing the first cue's slide, and check the row pauses.

## Reviewed and Dismissed
- A missed End's clear is never sent when ProPresenter comes back in the gap before the next song — `cueAt` (`src/server/cues.ts:273-280`) is null between songs, so `comeback` has no cue to send, which is the spec's "Live still in the same section"; the gap test reads `triggers()`, which leaves out clears, but a null cue cannot send a clear.
- The quiet-stream reopen test cannot go red, since `idle()` does not wait for a request not yet sent — killed both a constant-10 s and a 4x backoff mutant.
- The "sends nothing" comeback tests read `triggers()` before a late comeback could land — their positive siblings use the same timing and see the comeback trigger.
- A press handed before a cue reads `triggeredIn` as the later cue set it, so after a clear it sends the active path and says "nothing to move" — the later cue's trigger replaces the screen right after; the alternative would show the song before's next lyric for a moment.
- After a clear, Next or Previous with the last slide shown in another presentation has no test — it does: `test/propresenter.test.ts:2114` ("says nothing to move for $button after a clear when ProPresenter refused the next song's trigger, and never shows the song before").
- A missed cue survives a Disarm and Arm while offline — `comeback` reads the arm state at the comeback, the producer has armed it again, and the slide sent is the playhead's, as Fire again would send.
- Non-ProPresenter targets get a comeback — `miss` requires `entry.target.plan`, and `moved` skips a target with no plan.
- The Arm hook runs on the Count Off re-arm — it does not: `deliver` only calls `set`, and `test/connections.test.ts` checks `arms() === 1`.

## Minor / nits
- `moved`'s offline branch (`connections.ts:1088-1091`) looks only at the section's own plan, so a move across the next section's pickup slide while offline records nothing; the downbeat's cue records it a moment later.
- The fake answers a forced 2xx group trigger on an unknown presentation or group by throwing (`test/fake-propresenter.ts`, the group trigger in `answer`); unreachable, since `answerTriggers` is only used with 403, 404 and 500.
- The fake's `send` and `showSlide` move the live slide but not its index, so a test that shows a recorded press by hand and then presses Next gets the fake's answer from the old index; documented in the fake.
- `lastShown` and `triggeredIn` hold the `Presentation` object of the read in force when the cue was handed, so after a Refresh that re-reads an edited presentation, a button's expected text can come from the old groups until the next cue.
- After a clear, a slide pressed by hand with no words or in another presentation leaves `blanked` set, so the next Next slide moves in the last song (#377 lane F3.3).
- A quiet reopen whose stream request times out still puts ProPresenter offline though `/version` just answered (#302 lane F3.10), and while the stream is quiet a slide pressed by hand is never seen (#302 lane F3.7), which `README.md` does not say.
- A read that kept failing is tied to its song by the playlist item's name alone (#276 lane F1.1).

## Test quality
Tests added or modified: 91 (connections 2, fake-propresenter 11, propresenter-adapter 5, propresenter 72, native-loaders 1) · green against `6e8d969`: 29, all accounted for (11 test fake behaviour the branch added and are red against the base fake; 6 are finding proofs, red at their fix commit's parent: `propresenter-adapter.test.ts:285`, `:299` from `dbef078`, `propresenter.test.ts:287`, `:298` from `e182d79`, `:358` from `2be786f`, which alone kills the mutant that drops the comeback's same-section condition, `:2114` from `f792525`; 12 are scope guards that pin preserved behaviour, such as `:3361`, the 404 asked once, and `:2585`, the kept half of a split test) · tautology shapes found: 0. Optional: `propresenter.test.ts:278` ("sends nothing when ProPresenter comes back with no change missed") could also assert that no Fire again line was logged. The comeback suite has no test with the lead on, which is how finding 1 went unseen; its repro fills that.

## Before opening the PR
- **CI readiness:** the repo has no CI; lint, typecheck, test, build and e2e are green here at `919cb65`.
- **Commit hygiene:** 19 commits, each opening with its ticket; nothing to drop. This doc and its repro are one commit.
- **Likely reviewer asks:** the home acceptance run (#134) is still open and #269 is deferred behind it, so the PR should say the pause-by-hand edge cases are proved against the fake only; NFI B is a question for that run.

## Verdict
**Ready to open the PR with follow-ups.** No CRITICAL, HIGH or MEDIUM finding. Finding 1 is a one-line fix with a ready red test and is worth folding in before the PR; finding 2 is two tests; finding 3 is comments. NFI A to C are follow-up material, and B needs the home run.
