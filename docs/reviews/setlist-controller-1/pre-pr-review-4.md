# Pre-PR review: setlist-controller#1 stage 2 integration (#16 #17 #18 #19 #20 #21 #22 #23 #26 #27 #28 #30 #31 #91)

**Branch:** `setlist-controller-1-ipad-rehearsal` vs `origin/main` (merge-base `1460f52` "setlist-controller#59 Song transitions: overlap into the next count-off, a prayer pad, and fades (#94)")
**Reviewed at:** HEAD `0a2cda6` (setlist-controller#18 Loop then a quick tap leaves the loop on in another section), clean tree, 0 uncommitted, 0 untracked; 54 files, +3030 / -327 against the merge-base, 42 commits.
**Delta under review:** none. `--fresh` full review of the working surface against the merge-base. Reviews 1 to 3 in this folder reviewed stage 1, which is already on `origin/main`.
**Reviewed against:** the epic body of setlist-controller#1 (Implementation and Testing Decisions), the bodies of sub-issues #16 to #23, #26 to #28, #30, #31 and #91, `.epic-loop/tickets/*/assumptions.md` (66 assumptions Nick accepted on 2026-10-19, `.epic-loop/closeout.md` decision 4), the close-out decisions, and `pre-pr-review-3.md`'s Approach decisions. No `CODING_STANDARDS.md`, `docs/coding-standards.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs exist, so conformance is judged against the spec and the five universal review rules.
**Date:** 2026-10-19
**Reviewer:** 3 code-review agents + 1 test-audit agent + verify pass.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | Already up to date |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam 1 suite | `pnpm test` | 31 files, 628 passed, 3 skipped. The skips are the three `it.runIf(process.platform === 'linux')` 403 tests in `test/setup-screen.test.ts` (`/api/setup`, `/api/setup/pedal`, Refresh), which run in CI on ubuntu-latest |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | 30 passed, WebKit and `chromium-android` |
| Launch agent plutil test | `pnpm exec vitest run test/launch-agent.test.ts` | 9 passed; `plutil` present, the plutil case ran |
| Cross-ticket interactions in `playback-controller.ts` (#16 lost jump, #18 asked-for loop, #22 End jump, #26 loop at End, #27 late tap, #31 start_playing, #20 startup) | finder agent driving the real controller on `manualClock` in six scenarios + full read by the orchestrator | finding 3 executed; two candidates dismissed as accepted assumptions; one Minor |
| Heartbeat, leader secret, roles, pages (#17, #21, #22 pages, #30) | finder agent; L54 mutant applied in a scratch copy; leader-secret edge cases executed in a scratch folder | L54 test goes red on the give-up mutant; finding 2 executed |
| Pedal and e2e (#28, #91, #23) | finder agent, consumers of `PedalMapping.message` grepped | one test gap (finding 1) |
| Tautology audit | branch test files in a scratch worktree at `1460f52` with a shimmed harness; each green case re-run against its fixing commit's parent; one mutation at HEAD | 87 new cases: 65 red at base, 20 green for a traced reason, 1 suspect, 1 Linux-only; about 31 changed cases, all pins (see Test quality) |
| Real Live, real iPad, real pedal | not run | guardrail: never open or control Live; #13, #14, #15 and the iPad checks in #17 and #20 are Nick's |

**Overall:** The fourteen stage 2 tickets integrate cleanly. Every full check is green, the shared controller's new state (`waitingJump` widened to End, `lateBarLine`, the lost timer, `askedLoop` and its timer, `heldEnd`) is cleared on every path that should clear it, and no ticket's change undoes another's. Three LOW findings: a test gap in the setup screen's pedal polling, a start that hangs on a dangling-symlink secret file, and a Play from start tapped within a report interval of a Stop that still resumes where the song stopped (the window #31 left). The branch is ready to open a PR.

## Approach decisions
- Every round 1 to 3 decision listed in `pre-pr-review-3.md` holds at this HEAD, with two that the stage 2 tickets overturned by design: **Next to End** is no longer `endJump` but a waiting jump `{ song, section: 'end' }` through `jumpTo` (#22, reversing A56); **Play song from start while stopped** now sends the jump then `start_playing` (#31, from the #13 hardware trials), and the epic body still names `continue_playing` (close-out decision 2, proposal 4, edits it at close-out).
- **Play from start after a sent stop (finding 3):** a pending stop the controller sent, expiring after `LOOP_REPORT_MS`, takes the stopped branch. Mirrors `askedLoop` and its timer (#18).
- **The pending stop's lifetime (finding 3 remediation, 2026-10-19):** it ends on Live's `playing: false` report, on the `LOOP_REPORT_MS` expiry, on a lost connection, or when Play from start sends `start_playing`. A `playing: true` report does not end it, since that report may belong to a start sent before the stop. Accepted cost: a Stop while Live is already stopped, then a laptop start and a Play from start within `LOOP_REPORT_MS`, sends `start_playing` to a playing Live, the same bound accepted for a lost stop.
- **Leader secret read (finding 2):** retry the `link` EEXIST race once, then take the existing garbage-file path (log, `rename` over the entry). Mirrors the garbage-file branch already in `readLeaderSecret`.
- **Pedal polling fallback tests (finding 1):** a Playwright spec that intercepts `SETUP_PEDAL_API` with `page.route`, mirroring how `e2e/setup.spec.ts` drives the setup screen on the rig.

## Confirmed Issues
### 1. The setup screen's pedal polling has no test for its 403, failure or retry paths — LOW
- **Location:** `web/src/Setup.tsx:73-93` (`PedalStatusPanel`)
- **Attribution:** introduced, `3d5c513` (setlist-controller#28 Keep pedal status off the band's pages). The base had no pedal route; its `JoinCodes` panel has the same untested shape, so there is no in-repo test precedent for the client side.
- **Real-world trigger:** none today; the code is correct. The cost is a future edit that drops the `refused` guard or the `.catch` re-arm passing every test. Capped at LOW: a test gap with no defect behind it, and the setup screen is laptop-only.
**Evidence**
```ts
if (response.status === 403) return { kind: 'refused' };
if (!response.ok) return { kind: 'failed' };
return { kind: 'ready', status: (await response.json()) as PedalStatus };
})
.catch((): PedalState => ({ kind: 'failed' }))
.then((next) => {
  if (!current) return;
  setState(next);
  if (next.kind !== 'refused') timer = setTimeout(read, PEDAL_POLL_MS);
```
`grep -rn "Could not load the foot pedal" test e2e` finds nothing; `test/pages.test.ts` renders only the panel's loading state; `test/setup-screen.test.ts:135` covers the server's 403, not the page's reaction.
**Failure mode** — mutating `next.kind !== 'refused'` to `true`, or the `.catch` to rethrow, leaves `pnpm test` and `pnpm test:e2e` green (reasoned from the grep above; no test reads the panel's refused or failed state).
**Recommended fix** — add `e2e/pedal-polling.spec.ts` on the existing rig:
- `page.route('**' + SETUP_PEDAL_API, (route) => route.fulfill({ status: 403, body: SETUP_REFUSED }))`, open the setup page, expect the pedal section to show `SETUP_REFUSED`, then count route calls over about 1 s and expect exactly 1.
- A route that answers `route.fulfill({ status: 500 })` for the first two calls (or `route.abort()`), then `route.continue()`: expect the "Could not load the foot pedal. Trying again." line, then the real status ("No pedal config." on the rig's default), with no reload.
**Remediation brief**
- **Design intent:** the pedal status is laptop-only (#28): the setup screen polls `GET /api/setup/pedal` every `PEDAL_POLL_MS` (250 ms), one request at a time. A 403 never changes for that machine, so the panel shows `SETUP_REFUSED` and stops. A network failure or a non-ok answer shows a status line and keeps polling, so a server restarted by launchd recovers the screen without a reload.
- **Full surface:** new spec under `e2e/`; no production change. `web/src/Setup.tsx:73-93` is the code under test.
- **Must preserve:** `e2e/pedal-monitor.spec.ts` (monitor lists each message), `test/pages.test.ts` "the setup screen's pedal section" cases, `test/setup-screen.test.ts:135` (server 403). Both Playwright projects run the new spec.
- **Do not touch:** the panel's polling code itself (checked: unmount clears the timer and drops an in-flight answer through `current`; StrictMode's double mount is covered by the same flag). The fetch without a timeout is a nit, below.
- **Proof:** with the new spec in place, temporarily change `if (next.kind !== 'refused')` to `if (true)` in `web/src/Setup.tsx` and run `pnpm test:e2e -- e2e/pedal-polling.spec.ts`: red. Revert: green.

### 2. A leader-secret file that is a dangling symlink makes the server hang at start, retrying forever — LOW
- **Location:** `src/server/leader-secret.ts:17-36` (`readLeaderSecret`)
- **Attribution:** introduced, `c903c26` (setlist-controller#21 Make the leader URL unguessable); the file is new on this branch.
- **Real-world trigger:** `~/Library/Application Support/setlist-controller/leader-secret` is a symlink whose target is gone, as a dotfiles or backup tool that symlinks Application Support files could leave. Nothing in the install makes one. LOW, capped: upgrade to MEDIUM if any sync or backup tool on the playback Mac symlinks files in Application Support (check: `ls -la ~/Library/Application\ Support/setlist-controller/`). When it happens, the server never comes up and launchd does not restart it, since the process neither exits nor crashes.
**Evidence**
```ts
const existing = await readSecret(path);            // readFile follows the link: ENOENT, so null
if (existing !== null && SECRET.test(existing)) return existing;
...
  return await placeSecret(path, (written) => link(written, path));   // the entry exists: EEXIST
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  return readLeaderSecret(folder);                   // and round again, without end
```
**Failure mode** — dangling symlink at the secret path: `readFile` gives ENOENT (null), `link` gives EEXIST, and the function recurses forever, writing and deleting a temp file each round. Executed: `docs/reviews/setlist-controller-1/repro/review-4-leader-secret.test.ts` copied into `test/` fails with no secret after 2 s; a standalone run also left a `leader-secret.<pid>.<hex>` temp file behind when killed.
**Recommended fix** — retry the EEXIST race once, then treat an entry that still reads as missing like a garbage file:
```ts
async function readLeaderSecret(folder: string, raced = false): Promise<string> {
  const path = join(folder, LEADER_SECRET_FILE);
  const existing = await readSecret(path);
  if (existing !== null && SECRET.test(existing)) return existing;
  if (existing !== null || raced) {
    console.error(`Setlist server: ${path} holds no leader secret, so a new one replaces it. Scan the new leader QR code.`);
    return placeSecret(path, (written) => rename(written, path));
  }
  await mkdir(folder, { recursive: true });
  try {
    return await placeSecret(path, (written) => link(written, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return readLeaderSecret(folder, true);
  }
}
```
**Remediation brief**
- **Design intent:** the secret is made once per install and must survive restarts (#21). A first start writes it to a temp file and `link`s it into place, so two racing starts never overwrite each other and the file is whole the moment it appears; the loser of the race reads the winner's file. A file that holds no valid secret is replaced with a log line rather than refusing to start, because launchd would otherwise restart a failing server in a loop. `rename` replaces the directory entry itself, a symlink included.
- **Full surface:** `src/server/leader-secret.ts:17-36` only. `readLeaderSecret`'s one caller, `src/server/main.ts`, passes one argument and is unchanged; keep `raced` off the exported signature's documented use (a default parameter is enough).
- **Must preserve:** `test/leader-secret.test.ts` in full, in particular the racing-starts case (two starts on an empty folder return the same secret, which the second start gets through the one EEXIST retry) and the garbage-file case (replaced, logged). The log sentence stays word for word.
- **Do not touch:** the garbage-file race (two starts that both find a garbage file each `rename` their own secret; see Dismissed) and the non-file cases (a directory or an unreadable file at the path throw EISDIR or EACCES and stop the start loudly; see Minor).
- **Proof:** `cp docs/reviews/setlist-controller-1/repro/review-4-leader-secret.test.ts test/ && pnpm exec vitest run test/review-4-leader-secret.test.ts` is red now and green after the fix; delete the copy afterwards, or keep it as a case in `test/leader-secret.test.ts` with the import path as is.

### 3. Play from start tapped just after a Stop, before Live reports the stop, resumes where the song stopped — LOW
- **Location:** `src/server/playback-controller.ts:429-437` (`play-from-start`), with `:440-443` (`stop`) and `:355` (the auto-stop)
- **Attribution:** pre-existing, untouched in this window. At `1460f52` play from start sent the jump then `continue_playing` in both branches; `585ea58` and its siblings (setlist-controller#31) moved the stopped branch to `start_playing`, but the branch chosen still reads `playing`, which changes only on Live's `is_playing` report. This finding is the window #31 left.
- **Real-world trigger:** the leader holds Stop (or the auto-stop fires at a song's End) and taps the next song's Play from start before Live's stop report comes back, about one AbletonOSC tick plus a listener interval (roughly 100 to 300 ms). The song then plays from where the last one stopped, not from its first locator, the Sunday fault #31 fixed. LOW, capped on attainability: upgrade to MEDIUM if the #13 or #14 run shows Live's `is_playing` report arriving more than about 300 ms after `stop_playing` (check: server log timestamps of the stop send and the playing report).
**Evidence**
```ts
if (playing) {
  jumpTo({ song: command.song, section: 0 }, first);
  continuePlaying();
} else {
  leaveLoopFor({ song: command.song, section: 0 });
  jump(first.cue);
  clearJump();
  startPlaying();
}
```
**Failure mode** — playing at 20, `stop`, then `play-from-start` song 2, then Live's `playing: false`: the controller sends `['stop', 'jump 3', 'continue']`. Live is stopped when the jump and `continue_playing` arrive, so it resumes at its stop point (#13 trials); the stop report then clears the waiting jump, so no page shows anything wrong. Executed: `cp docs/reviews/setlist-controller-1/repro/review-4-controller.test.ts test/ && pnpm exec vitest run test/review-4-controller.test.ts` fails with `continue` where `start` is expected.
**Recommended fix** — remember a stop the controller sent until Live reports its playing state, with the expiry the asked-for loop has, and take the stopped branch while one is pending:
```ts
let stopWait: (() => void) | null = null;

const askStop = () => {
  forgetStop();
  stopWait = clock.every(LOOP_REPORT_MS, forgetStop);
  stopPlaying();
};

const forgetStop = () => {
  stopWait?.();
  stopWait = null;
};
```
Then: `case 'stop': askStop(); return;`; in `position`, `if (reached || landedEnd) askStop();`; in `case 'playing'`, call `forgetStop()` before the existing clear; on a lost connection, call `forgetStop()` beside `forgetAskedLoop()`; in `play-from-start`, branch on `if (playing && stopWait === null)`.
**Remediation brief**
- **Design intent:** Live keeps two positions while stopped (#31): `continue_playing` resumes at the stop point and ignores a jump; `start_playing` plays from the start marker, which a jump while stopped moves. The controller's `playing` is only Live's word, which lags a stop the controller itself sent by up to a report interval. AbletonOSC handles messages in order, so after a sent stop Live is stopped when the next messages arrive. The pending stop expires after `LOOP_REPORT_MS` because the stop datagram may be lost, as `askedLoop` does for a lost loop.
- **Full surface:** `src/server/playback-controller.ts:440-443` (stop), `:355` (auto-stop send), `:363-369` (`playing` report), `:326-332` (lost connection), `:429-437` (play from start). The fade's own stop at its end goes straight to the bridge (`src/server/server.ts`, `startFadeOut`'s `stopPlaying`) and stays out of this fix: a tap in the report window after a fade ends keeps today's behaviour, which the commit declares.
- **Must preserve:** play from start while playing still sends the jump then `continue_playing` and keeps the jump waiting (#31's playing-branch cases in `test/transport.test.ts`); while stopped, jump then `start_playing` (`test/transport.test.ts:74` and #31's full-server case); the auto-stop fires once (`test/transport.test.ts`, `test/section-navigation.test.ts:111`, `:129`); `stop` publishes nothing until Live reports (the `stop` case's `return`). The failure of the fix: a lost stop datagram leaves Live playing with a stop pending, and a Play from start in that second sends `start_playing` while Live plays, which restarts Live from its start marker at once. The expiry bounds that to `LOOP_REPORT_MS`, the bound already accepted for a lost loop.
- **Do not touch:** the lost-jump timer and `clearJump` on the `playing` report (the stopped-jump-lost-while-started case is a Minor note, not this fix).
- **Proof:** the repro above is red now and green after the fix. The committed test belongs at seam 1, mirroring the `rig.live.holdReplies()` cases at `test/section-navigation.test.ts:264-270`: playing in song 1, hold replies, leader Stop then Play from start on song 2, release replies; the fake Live receives `stop_playing`, the jump to song 2's first cue, then `start_playing` and never `continue_playing`, and the pages show song 2's first section playing.

## Needs Further Investigation
Round 3's Needs Further Investigation A (a half-open socket on a visible page) is closed by #17's heartbeat. Round 1 and 2's open items stand unchanged.

## Reviewed and Dismissed
- A late tap one bar before End whose later bar line is End: a report exactly on End while Live makes the jump counts as lost, and the song stops at End instead of jumping (`src/server/playback-controller.ts:203-208`; executed by the finder at controller level) — Nick's accepted #16 assumption "Last-bar outcome" covers it ("this holds for a late tap too, where Live might still have made the jump a bar later"; stopping at End is the spec's safe default), as does the comment at `:197-199`.
- The #26 skip reads only Live's reported loop, so a loop turned off within one report of End can miss the stop (`:315`) — #26's accepted assumption 3 and #18's assumption 5; the window case is stage 2 proposal 1.
- A leader page on a wrong or stale secret draws controls and shows "Reconnecting" forever — real, and already close-out decision 2's proposal 3 (stale leader bookmark, a sub-issue of #1). An upper-case secret typed by hand is the same case.
- Two starts racing on a garbage `leader-secret` file each rename their own secret over it (`src/server/leader-secret.ts:22-25`) — launchd runs one server; needs a garbage file and two concurrent starts.
- `lateBarLine` computed for an End target (`:250-253`) — never read: `landed` returns on any End report first and `lost` counts from `barLine`.
- `heldEnd` set while an End jump waits (`:359`) — `landed` clears it on End; consistent.
- `case 'startup': return` keeps `askedLoop` (`:381-382`) — the re-registered listeners report the loop at once, and `LOOP_REPORT_MS` clears it otherwise.
- Play from start while stopped bypasses `jumpTo` (`:433-437`) — it calls `leaveLoopFor` first, so #18 holds there.
- The heartbeat reaching a refused socket — `shouldHandle` refuses the upgrade, so it never enters `sockets.clients`.
- The silence timer not re-armed on a hidden page (`web/src/server-connection.ts:69-76`) — becoming visible fires `visibilitychange`, and the wake replaces the socket.
- `e2e/live-connection.spec.ts` timing on the manual clock — the probe ticks fire synchronously in `advance`; the spec waits with auto-retrying expects.
- `test/pedal.test.ts` 128-CC sweep negative assertion — it waits on a probe round trip on the same socket, which is a barrier.
- A message on an invalid switch key is left out of the cross-switch duplicate check (`src/server/pedal.ts:70-73`) — "4" is not a switch, and the file is rejected either way.

- An empty `leaderSecret` passed to `startServer` would make `/ws/leader/` a leader socket — the only caller, `src/server/main.ts`, passes a value `readLeaderSecret` has checked against `/^[0-9a-f]{32}$/`.

## Minor / nits
- `src/server/playback-controller.ts:231-232`, `:204`, `:314`: a jump tapped while stopped whose datagram is lost, then Live started at the laptop, then playback reaching a "Stop at end" End within the 1 s lost timer: `lost` ignores a jump with `barLine === null` and `reachedEnd` refuses while it waits, so no stop is sent (executed by the finder). Needs a lost datagram and two coincidences inside a second. Recomputing `barLine` on a `playing: true` report while a stopped jump waits would close it.
- `src/server/playback-controller.ts:330`: `forgetAskedLoop()` on a lost connection can never be observed, since Live is lost only after 3 s of silence and the asked-for loop expires after 1 s. Harmless.
- `src/contract/run.ts:439-470`: `continueAfterStopStep`'s comment says "Live plays in the Chorus again afterwards, as the next step needs", true only when Live resumes at the stop point. If a real Live ever resumes at the jump (the change this observation exists to catch), `jumpWhilePlayingStep`'s `waitForMidBar(current, 'Chorus')` times out and its observations come from the Verse. The changed observation still shows; only the next step's read is muddied. Ending the step with stop, jump to the Chorus, `start_playing` would decouple them.
- No test has a Stop, a new section jump, a changed set, or the stopped 1 s timer clear a waiting End jump (#22). The paths are shared with section jumps, and the finder executed the timer case, which clears.
- `src/server/leader-secret.ts`: a directory or an unreadable file at the secret path throws EISDIR or EACCES from `readSecret`, so the server refuses to start where the spec prefers a replaced secret. Loud, and only from a hand-made mess.
- `src/server/leader-secret.ts`: `writeFile(written, …)` sits outside the `try/finally`, so a failed write (disk full) leaves its temp file.
- `src/server/server.ts`: the hub, and since #17 its 2 s heartbeat interval, start before `await startLiveBridge(...)`, which has no clean-up on rejection. `main.ts` exits on that rejection, so only an embedding caller or a test would leak the interval.
- No test goes red if `hub.close()` stops calling `stopHeartbeat()`, and none checks two silence replacements in a row on one page.
- `docs/install.md:51` says an old leader bookmark's page "stays on 'Connecting to the server.'" A leader tab left open across the change keeps its last snapshot and shows the leader controls with the reconnecting notice instead; it still never gains control.
- `README.md:17,23`: the leader URL the server prints is on the server's port, which serves "No web build" until `pnpm build`; in the hot-reload flow the reader swaps in Vite's port (`README.md:29`).
- `src/server/pedal.ts` `parseMessage`: `["zz", "zz"]` lists the same "not one to three hex bytes" line twice, where a valid repeat folds into one "twice" line. Cosmetic; the file is still rejected.
- `web/src/Setup.tsx:77`: the pedal fetch has no timeout, so a request that never answers freezes the panel on its last status with no "Trying again" line. Localhost only. `AbortSignal.timeout(2000)` would route it to `failed`.
- `test/fixtures/pedal/list-problems.json` has no non-string entry and no lower-versus-upper-case repeat (`["b0 50 7f", "B0 50 7F"]`); both paths are untested.
- `src/server/pedal.ts:88`: `new Set(parsed.valid)` adds nothing; `valid` holds no repeats.

## Test quality
New cases: 87 across the vitest files (plus about 31 changed bodies, all regression pins), and 4 new Playwright specs. Run at `1460f52` with a shimmed harness (secret path helpers returning the old paths, heartbeat constants, `rig.pedal()` reading the old snapshot): 65 red; 20 green for a traced reason; 1 suspect; 1 Linux-only and skipped. The 20 green: review-pass fixes for regressions the branch's own #27 feature introduced (`test/jump.test.ts:393`, `:417`, `:453`, `:489`, `:530`, `:555`, each red at its fix commit's parent), pins of unchanged behaviour the tickets require to stay green (`test/jump.test.ts:342`, `:365`; `test/section-navigation.test.ts:341`, `:404`; `test/reconnect.test.ts:196`; `test/server-connection.test.ts:150`, `:169`; `test/pages.test.ts:178`), `test/transport.test.ts:74` (green at base because the old fake Live played `continue_playing` from the playhead; it kills the `startPlaying` to `continuePlaying` mutation at HEAD), and #19's four fake Live cases (a test-only ticket; each negative waits on a UDP probe barrier). The Playwright specs were not run at base; #23's criteria record their mutation checks.

To strengthen (no defect behind any of them):
- `test/launch-agent.test.ts:43` and `:48` compare the printed JSON and the plutil round trip with `launchAgent(...)` itself, so a wrong key or value type inside `launchAgent` moves both sides. That comparison is #30's own deliverable (the printer must match the definition), and the definition's keys are pinned by the neighbouring cases; comparing against a literal object would also pin "every value type".
- `test/launch-agent.test.ts:40`, `:49-50` assert `INSTALL_SCRIPT` text with `toContain`, which survives a commented-out line.
- `test/leader-secret.test.ts:68` ("replaces a file that does not hold a secret, and says so") checks only `console.error` `toHaveBeenCalledOnce()`; assert the message names the file.
- `test/jump.test.ts:442`, `:641`, `:687` assert no `stop_playing` straight after a client snapshot, with no Live barrier; the following `advance()` wait mostly saves them. `await barrier(leader)` first, as `test/transport.test.ts` does.
- `test/reconnect.test.ts:196` ("while only heartbeats come") never checks that a heartbeat arrived, so it passes at base, which sends none; assert at least two heartbeats in the window.

## Before opening the PR
- **CI readiness:** lint, typecheck, test, build green locally; the three Linux-only 403 tests run in CI.
- **Commit hygiene:** commit this doc, `repro/review-4-controller.test.ts` and `repro/review-4-leader-secret.test.ts`. Nothing else is outstanding.
- **Likely reviewer asks:** the iPad check in #17 and the real-Live check in #20 are Nick's; the epic body's `continue_playing` line is edited at close-out.

## Verdict
**Ready to open a PR, with follow-ups.** Zero CRITICAL, HIGH or MEDIUM findings. Findings 1 (LOW, a test gap), 2 (LOW, a hang on a dangling-symlink secret file) and 3 (LOW, Play from start inside a stop's report window) can be fixed before the PR or ship as follow-ups. Finding 3 is the one worth fixing first, since it reopens the Sunday fault #31 closed; its severity rises if the #13 or #14 log shows a slow stop report.

## Remediation — 2026-10-19
Scope (Nick, close-out decision 8 in `.epic-loop/closeout.md`): finding 3 only. Findings 1 and 2 stay unfixed as the deferred LOW tail; finding 2 is filed as its own bug at close-out.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | — deferred | — | — | not in scope (close-out decision 8) |
| 2 (LOW) | — deferred | — | — | not in scope (close-out decision 8; filed as a bug) |
| 3 (LOW) | `331d611` Play from start just after a Stop resumes where the song stopped | red→green: `repro/review-4-controller.test.ts` copied into `test/`; seam 1 `pnpm exec vitest run test/transport.test.ts` (the Stop case and the auto-stop case red at `9c688a6`, green after); mutants (no expiry, no forget on report, branch ignoring the pending stop) each turn a case red | 2 (production, the declaration's constraint) + 3 (test) | half-fixed: a start's late `playing: true` report cleared the pending stop |
| 3 rework | `5bd8397` a start's late report no longer clears a pending stop | red→green: `pnpm exec vitest run test/play-from-start-window.test.ts` (scenario C) | 3 (test: why controller level) | fixed; introduced: a double Stop, Play from start, then a corrected Play from start sent `start_playing` to a playing Live |
| 3 rework follow-up | `75fe2a3` a start sent ends the pending stop | red→green: the second case in `test/play-from-start-window.test.ts` | 0 | applied under the one-line exception; not re-verified (no second re-verify) |

Checks at `75fe2a3`: `pnpm lint`, `pnpm typecheck`, `pnpm test` (32 files, 634 passed, 3 Linux-only skipped), `pnpm build`, `pnpm test:e2e` (30 passed). The review 1 and 2 controller repros give the same results at `9c688a6` and at HEAD (`review-2-controller` needs a `manualClock()` argument since the clock parameter landed; its one red case is the #22 Next to End redesign, red at base too).

### Known regressions, deferred
- Open residual of finding 3, not introduced by this round (it fails at `9c688a6` and at every commit since): an earlier stop's `false` report ends a later pending stop. Sequence: playing; Stop A; Play from start song 1 (jump, `start_playing`); Stop B; Live's `false` for A; Live's `true` for the start; Play from start song 2 sends the jump then `continue_playing` to a Live stopped by B. Verdict, quoted: "There is no one-token or one-line fix. The controller would have to tell which `false` report belongs to the pending stop, for example by keeping the wait while a start it sent is still unreported." Needs three presses inside one report latency. Left open: larger than one line and outside the scoped re-verify. The next stage 2 round re-examines it.
- Declared cost of `5bd8397`, not a defect: a Stop while Live is already stopped, then a laptop start and a Play from start within `LOOP_REPORT_MS`, sends `start_playing` to a playing Live, which restarts it at its start marker. Bounded as the lost stop is. Also carried from the brief: the fade's own stop (`server.ts`, `startFadeOut`) does not arm the pending stop.

### Rework briefs
- `5bd8397`: achieve: only Live's `playing: false` report, the expiry or a lost connection ends a pending stop, so a start's late `true` report no longer clears it. Preserve: every case of `331d611` and its preserve list, including a laptop start after Live reports the stop taking the playing branch; the laptop-start-after-a-Stop-while-stopped case becomes a declared, `LOOP_REPORT_MS`-bounded cost. Proof: a controller-level case for the verifier's scenario C (seam 1 cannot place a press between two held replies), red at `331d611`, green after.
- `75fe2a3` (one-line exception from the scoped re-verify): achieve: Play from start's stopped branch ends the pending stop once it sends `start_playing`, so a later press after Live's `true` report takes the playing branch. Preserve: the `5bd8397` case (the Stop after the press arms a new wait). Proof: the second case in `test/play-from-start-window.test.ts`, red without the line, green with it.
