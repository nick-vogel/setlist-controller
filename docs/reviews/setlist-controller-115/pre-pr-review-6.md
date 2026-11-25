# Pre-PR review: setlist-controller#115 The merge of #114's failed-restart give-up (PR #199) into the cue lead-time epic, round 6

**Branch:** `setlist-controller-115-cue-lead-time` vs `origin/main` (merge-base `99c593a` "Merge pull request #199 from nick-vogel/setlist-controller-114-atem-lobby-feed")
**Reviewed at:** HEAD `9f27f78` (setlist-controller#115 Merge origin/main (PR #199) into the integration branch), clean tree: 0 files with uncommitted changes, 0 untracked; 21 files total against the merge-base, +1200 / -56
**Delta under review:** since `4359c37` (setlist-controller#115 pre-PR review 5), the HEAD `pre-pr-review-5.md` reviewed. The only new commit is the merge `9f27f78` of origin/main `99c593a` (PR #199: setlist-controller#193's give-up for a socket process that could not restart, and setlist-controller#114 review 7's fixes), with one comment hunk of `src/server/atem.ts` resolved by hand. Two-dot from `4359c37` the delta is 11 files, +1037 / -72, all of it main's side: `src/server/atem-switcher.ts`, `src/server/atem.ts` (comments only), `test/atem-switcher.test.ts`, `test/atem-switcher-restart.test.ts` (new), `test/atem.test.ts`, `test/fake-switcher.ts`, and #114's review docs 7 and 8 with their repros.
**Reviewed against:** `pre-pr-review-5.md` (its findings 1 and 2, its Approach decisions, its Reviewed and Dismissed list); setlist-controller#114's `pre-pr-review-8.md` finding 1 (a stop during a socket-process restart rejects); the orchestrator's scope for this round: whether the merge keeps both sides, and whether #186's acknowledgement and the lateness log behave correctly with #193's failed restart, give-up and shutdown paths. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green (exit 0) |
| Typecheck | `pnpm typecheck` | green (exit 0) |
| Unit and server suites | `pnpm test` | 56 files, 1178 passed, 4 skipped, first run |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| Merge keeps both sides | per file, the sorted +/- lines of main's own delta `d63b445..99c593a` against main's side as landed `4359c37..9f27f78`, and of the branch's delta `d63b445..4359c37` against its side as landed `99c593a..9f27f78` | identical for all 11 main-side files and all 21 branch-side files; `git show --cc 9f27f78` shows the one hand-resolved hunk keeps the branch's `acknowledges: true` and its comment, and main's reworded give-up comment |
| Tests from both sides survive | `it(` count in `test/atem.test.ts` at `d63b445`, `4359c37`, `99c593a`, HEAD; set difference of test names | 54, 65, 56, 67: the branch's 11 plus main's 2 on the 54; no test name lost. `test/atem-switcher.test.ts` 26 and `test/atem-switcher-restart.test.ts` 3, as on main |
| No merge markers | `git grep` for conflict markers at HEAD outside `docs/reviews` | none |
| #193's lost Atem against #186 | finder trace of `src/server/atem-switcher.ts` (`giveUp`, `build`, `live()`, `hook`, `close`) against `src/server/atem.ts` `onConnection`/`onGaveUp`/`onProgram` and `src/server/connections.ts` `settle`/`actedOn` | correct on every path: offline is reported before give-up whether or not the library reported the drop, so the waiting Count Off is settled once with `actedMs: null`; every listener of a lost Atem is gated by `live()`, so it can never call `actedOn`; `sent` is cleared on each connect and disconnect before the fresh Atem's first program report |
| Shutdown with a waiting Count Off | `repro/review-6-shutdown-waiting-line.diff` applied in a scratch worktree at HEAD, `./node_modules/.bin/vitest run test/atem.test.ts -t PROBE --silent=false`; run by the finder, then again by the verify pass | PROBE-A (switcher close rejects): the log file is empty when `server.close()` rejects; the line lands 200 ms later only because the test process lives on. PROBE-B (clean stop): the line is in the file when `server.close()` resolves. PROBE-C (a Count Off handed while the switcher close is pending): the cut goes out, and no line is ever written. Finder's base probe at `99c593a`: the Count Off line is in the file before the close, since the ATEM wrote it at hand time |
| threadedclass restart events | read `threadedclass@1.4.1` `dist/js/threadedClass.js` `_setupChildProcess`, `_childHasCrashed`, `restartChild`, `killChild`; `atem-connection` `lib/atemSocket.js:114-122`, `atem.js:58-63` | a crash emits `thread_closed`, which the library turns into `disconnected`, so the ATEM reports offline at the start of a restart. A freeze (ping timeout) kills the child through `killChild`, which leaves `child.alive` true until the process's `close`, so by reading it emits `thread_closed` too; that contradicts main's comment at `src/server/atem-switcher.ts:103`. Not executed (Needs Further Investigation D) |
| Not run | a real ATEM, real Live, a real frozen socket process | review 5's Needs Further Investigation B and the new D stay unverified on hardware |

**Overall:** The merge kept both sides line for line, and #193's new give-up path composes with #186: the switcher client reports offline before it gives up on a lost Atem, so the waiting Count Off is settled once, and a lost Atem's late reports are ignored. The full checks are green on the first run. One new LOW finding: shutdown can drop the line of a Count Off still waiting on the ATEM, in two narrow windows, because #186 is the first production target that holds its line until it acts; neither window has a known user path. With review 5's two deferred LOW findings carried, the branch can open its PR as is.

## Approach decisions
- The due-time window (round 1): symmetric half bar in `dueAt`. Carried forward unchanged.
- The dev log (round 1): `dev:server` writes `dist/dev-cue-lateness.log`; production and the launch agent unchanged. Carried forward unchanged.
- A row's `problems` and `lateness` (round 3): independent fields of `Entry`. Carried forward unchanged.
- The cue filter (#186): an optional `Target.actsOn`, consulted first in `hand()`; a cue it refuses is handed with no line and settles nothing. Fire again and an unmeasured cue go through the same check. Tests for it go through the ATEM rig in `test/atem.test.ts`. Carried forward unchanged.
- The ATEM's acknowledgement (#186): the own-cut record carries the cue that caused each cut, and the matched program report calls `actedOn` with it, after the row shows the input. Button cuts carry none. Carried forward unchanged.
- Unmeasured lines (#187): written at once by `hand()`, after `settle`, with the reason its caller passes. Fire again settling a waiting line is part of this (Reviewed and Dismissed). Carried forward unchanged.
- The command's errors (#187, review 4): follow `build-set` (`src/set-builder/main.ts:246-248`): one line on stderr from the error's message, exit 1; usage errors exit 2. Carried forward unchanged.
- An unreadable log (review 4 remediation, finding 2): `textOf` prints the one line and calls `process.exit(1)` itself. Carried forward unchanged.
- The ATEM's give-up (#114 run 3 and #193, from main): the switcher client reports offline before it calls the gave-up listeners, on both give-up paths (a failed reconnect after a respawn, and a socket process that could not restart), so the server settles a waiting acknowledgement through its offline report, and the adapter's `onGaveUp` only sets the problem and schedules the retry. This review extends the rule to #193's path.
- Waiting lines at shutdown (this review, finding 1): `connections.stop` settles every entry before it awaits the targets' stops and again after, whether they resolve or reject, and the server closes the lateness log whether `connections.stop` resolves or rejects. `Promise.all` in `connections.stop` and the `.finally` exit in `main.ts` stay as they are, per #114 review 7's Do not touch; making the ATEM's close resolve during a restart stays with #114 review 8 finding 1's split ticket.

## Prior-review closure
Review 5 confirmed two findings, both LOW, and was not remediated: both were review 4's findings 3 and 4, which Nick's close-out deferred (`.epic-loop/closeout.md` item 2; review 4's closure table, "deferred, not in the opted-in scope").
- Fully fixed: 0.
- Partially fixed: 0.
- Untouched: 2, both deferred by decision, carried below as findings 2 and 3. The merge touched none of their files, so their line numbers are unchanged.
- Comment-only "fixes": 0.
- MEDIUM or higher left open: 0.

## Confirmed Issues
### 1. Shutdown can drop the lateness line of a Count Off still waiting on the ATEM — LOW
- **Location:** `src/server/connections.ts:265-268` (`stop`), `src/server/server.ts:250-252` (`close`); the exit at `src/server/main.ts:97`
- **Attribution:** pre-existing, exposed by #186. The mechanism is on the base: `git show 99c593a:src/server/connections.ts` has the same `stop` (lines 255-258, settle then `Promise.all`), and `server.close` already ran `await connections.stop(); await log?.close();`. On the base no production target acknowledges (`git grep -n acknowledges 99c593a -- src` finds only the type and `connections.ts`), so every line, the ATEM's included, was written at hand time. #186's `acknowledges: true` on the ATEM (`src/server/atem.ts:191`, this branch) makes the ATEM's Count Off line the first that waits until the target acts, goes offline, or the server stops. Not introduced by the merge: the merge only brings #193's code, under which the rejecting close of #114 review 8 finding 1 is one way into the first window below.
- **Real-world trigger:** two windows, neither with a known user path.
  - (a) The ATEM's stop rejects while a Count Off line still waits: the switcher client is still online and the cut's report has not come when `launchctl bootout` or Ctrl-C arrives, and `switcher.close()` rejects promptly. #114 review 8 finding 1's rejection happens during a socket-process restart, and by the threadedclass reading in the table the ATEM has reported offline by then, which settles the line earlier, so that path loses nothing unless the stop lands within the few milliseconds the append takes.
  - (b) The server is stopped while Live plays into a Count Off, during the ATEM's own close: the line is set after `stop` settled, and nothing settles it again.
  - LOW, capped: no user path, and what is lost is one line of a rehearsal's log, not playback. Upgrade to MEDIUM if a frozen socket process turns out to emit no `disconnected` (Needs Further Investigation D), since window (a) then covers the freeze's whole restart.

**Evidence**
```ts
    async stop() {
      for (const entry of entries) settle(entry);
      await Promise.all(entries.map((entry) => entry.target.stop()));
    },
```
```ts
      await connections.stop();
      await log?.close();
```
`settle` only queues the write (`src/server/lateness-log.ts:79-86`); `log.close()` is what waits for the queue. `main.ts:97` is `server.close().finally(() => process.exit(0))`.

**Failure mode** — (a) A Count Off is handed and its report held. At shutdown `stop` settles it, which queues the line, then the ATEM's stop rejects; `Promise.all` rejects, `server.close()` rejects before `log.close()`, and `main.ts` exits with the append still queued. PROBE-A: `"atRejection":[]`, `"later":[["Count Off",null]]`. (b) A Count Off delivered while the ATEM's close is pending sets `entry.handed` on the still-online entry; its cut goes out, its report never comes, and no settle runs again. PROBE-C: `"programs":[2]`, `"atResolve":[]`, `"later":[]`. A clean stop with the line waiting writes it before `server.close()` resolves (PROBE-B). Proved by `repro/review-6-shutdown-waiting-line.diff`, by the finder and again by the verify pass.

**Recommended fix**
```diff
     async stop() {
       for (const entry of entries) settle(entry);
-      await Promise.all(entries.map((entry) => entry.target.stop()));
+      try {
+        await Promise.all(entries.map((entry) => entry.target.stop()));
+      } finally {
+        for (const entry of entries) settle(entry);
+      }
     },
```
```diff
-      await connections.stop();
-      await log?.close();
+      try {
+        await connections.stop();
+      } finally {
+        await log?.close();
+      }
       await hub.close();
```
Two tests in `test/atem.test.ts`'s describe "how late the ATEM gets and acts on a cue", from PROBE-A and PROBE-C with their assertions turned round: the Count Off line `[["Count Off", null]]` is in the file once `server.close()` has settled, read at once, (a) when the fake switcher's `close` rejects (and `server.close()` still rejects), and (b) when a Count Off is played while the fake switcher's `close` is pending.

**Remediation brief**
- **Design intent:** a target that acknowledges holds a measured cue's line in `entry.handed` until it acts on the cue (`actedOn` writes it with `actedMs`), or the line is settled with `actedMs: null` at the next measured or unmeasured hand, at the target's offline report, or at `connections.stop`. Every handed line is written exactly once, and the server's close drains the log's queue before `main.ts` exits. The ATEM, from #186, is the only production target that acknowledges.
- **Full surface:** `src/server/connections.ts:265-268` (`stop`); `src/server/server.ts:250-252` (`close`, and its comment at `:250`, which stays true); the two new tests in `test/atem.test.ts` after `:1236`, using the rig's `atemRig`, `newLogDir`, `fakeSwitcher().holdEchoes()`, `play(28.25, 40.25)` and `rig!.server.close()` as the repro does. No other caller of `connections.stop` (`git grep -n "connections.stop\|\.stop()" src/server`).
- **Must preserve:** `stop` settles every entry before it awaits any target's stop, so a line waiting at a clean stop is written before the targets close (`test/cue-lateness.test.ts:513` "carries the acted-on lateness for a target that reports it, and null for a cue it never acted on", whose End line comes at the close; PROBE-B). A rejection from a target's stop still propagates out of `connections.stop` and `server.close()`, so `main.ts`'s `.finally` exit still runs at once after the log drains. `Promise.all` stays (not `allSettled`). A line `actedOn` writes during the pending stop is not written twice: `actedOn` nulls `handed`, and the second settle is then a no-op. `log.close()` never rejects, since each append catches its own error (`src/server/lateness-log.ts:82-85`), so the `finally` cannot replace the original rejection.
- **The fix's own failure:** if the log's queue hangs (a stalled disk), the `finally` waits on it; `main.ts`'s unref'd 3 s timer still exits, as today.
- **Do not touch:** `Promise.all` in `connections.stop` and the `.finally` exit in `main.ts` (#114 review 7's Do not touch); the switcher client's `close` during a restart (#114 review 8 finding 1, its own split ticket); Fire again settling a waiting line (Reviewed and Dismissed).
- **Proof:** from the repo root, in a scratch worktree outside the repo: `git worktree add --detach "$SCRATCH/probe" HEAD && ln -s "$PWD/node_modules" "$SCRATCH/probe/node_modules" && git -C "$SCRATCH/probe" apply "$PWD/docs/reviews/setlist-controller-115/repro/review-6-shutdown-waiting-line.diff" && (cd "$SCRATCH/probe" && ./node_modules/.bin/vitest run test/atem.test.ts -t PROBE --silent=false)`. Before the fix it prints `"atRejection":[]` for PROBE-A and `"atResolve":[]` for PROBE-C; after it (apply the fix in the scratch worktree too), both show `[["Count Off",null]]`. Remove the worktree after. Then the two new tests are red with `src/server/connections.ts` and `src/server/server.ts` reverted in a scratch worktree, and `pnpm exec vitest run test/atem.test.ts test/cue-lateness.test.ts test/connections.test.ts` is green in the worktree.

### 2. Four of the command's fallbacks have no test — LOW
- **Location:** `test/lateness-command.test.ts`, `test/lateness-summary.test.ts`; the code at `src/lateness/main.ts:25`, `:39-41`, `src/lateness/summary.ts:155`
- **Attribution:** introduced in `da24774` (setlist-controller#187 A summary of the lateness log for each target and cause). Carried from `pre-pr-review-5.md` finding 1 (review 4 finding 3), deferred by Nick's close-out decision; the merge touched none of these files.
- **Real-world trigger:** none today; each path works by probe. A later edit could break one silently: a relative `--log` typed in a subfolder reading the wrong place, a log with only `.1` reported as missing, an empty log printing nothing, or the malformed count moving to the top. LOW, capped: no user path until such an edit.

**Evidence** — `grep -n "INIT_CWD\|cwd" test/lateness-command.test.ts` finds only the spawn's `cwd: REPO_ROOT` (line 27), and every test passes an absolute `--log`. The `.1` test (lines 89-102) writes both files. No test feeds an empty or all-malformed text to `readLines`/`formatSummary`. The malformed test (lines 76-87) checks the count appears once, not that it is last, though #187's brief says it prints "at the end".

**Failure mode** — These edits pass every test: always using `process.cwd()` instead of `INIT_CWD`; treating a missing `<log>` as a missing log even when `<log>.1` exists; dropping the "No cues in the log." line; printing the malformed count first.

**Recommended fix** — Four tests:
- In `test/lateness-command.test.ts`, a relative `--log`: spawn `pnpm --silent lateness --log <name relative to dist/>` with `cwd` set to the worktree's `dist/` folder (pnpm sets `INIT_CWD` there), and assert the summary's numbers, not "No lateness log". Precedent: `test/set-builder-command.test.ts:480`.
- In `test/lateness-command.test.ts`, only `<path>.1` written: exit 0 and its numbers printed.
- In `test/lateness-summary.test.ts`, `formatSummary(summarize(readLines(['']).lines, { timeZone: 'America/Chicago' }), 0)` ends with `No cues in the log.`
- In the malformed test, `expect(stdout.trimEnd().split('\n').at(-1)).toBe('Skipped 1 malformed line.')`.

No production change.

**Remediation brief**
- **Design intent:** `src/lateness/main.ts` reads `<log>.1` then `<log>`, each skipped when absent (ENOENT), and stops with one stderr line and exit 1 on any other read error; a relative `--log` resolves against `INIT_CWD` only when pnpm runs the `lateness` script, else `process.cwd()`, as `build-set` does. `formatSummary` prints the method line, the days, "No cues in the log." when there are none, and the malformed count last when above 0.
- **Full surface:** `test/lateness-command.test.ts`, `test/lateness-summary.test.ts`. Fixtures under the test's own `dist/lateness-*` folder, never the OS temp folder or `~/Library`.
- **Must preserve:** every existing test in both files, including "says in one line on stderr that it could not read a folder given as the log, and exits 1" (line 65); `test/lateness-fixture.ts`'s builders.
- **Do not touch:** the production code; ENOTDIR exiting 1 (review 5, Reviewed and Dismissed).
- **Proof:** each new test goes red under its edit, made in a scratch worktree outside the repo (`git worktree add --detach "$SCRATCH/mut" HEAD && ln -s "$PWD/node_modules" "$SCRATCH/mut/node_modules"`, remove it after): `const from = process.cwd();` at `src/lateness/main.ts:25`; `if ((await textOf(path)) === null)` printing the missing sentence; deleting `src/lateness/summary.ts:155`; moving the malformed push at `src/lateness/summary.ts:156` before the day loop. Then `pnpm exec vitest run test/lateness-command.test.ts test/lateness-summary.test.ts` green in the worktree.

### 3. Comment hygiene — LOW (aggregated)
Carried from `pre-pr-review-5.md` finding 2 (review 4 finding 4), deferred by Nick's close-out decision; all three entries unchanged at HEAD.
- `src/server/lateness-log.ts:7` — a line of 138 characters in a file wrapped at 100 (introduced in `da24774`) → rewrap the paragraph at lines 6-8 at 100 columns, words unchanged.
- `src/server/playback-controller.ts:607-608` — "A listener report comes well within half a bar of the playhead crossing a beat, at any tempo a song is played at. Live snaps a drag to a bar line, so a report a whole bar past is a drag." → append "A beat half a bar or more ahead of the report was raised from a start the playhead left; a lead time fires well inside half a bar." (pre-existing, untouched: carried since round 1)
- `README.md:49` — "as \"Late 250 ms, median 240 ms\" for the last cue and the median of the last 50" → "as \"Late 250 ms, median 240 ms\" for the last measured cue and the median of the last 50 measured" (pre-existing, untouched: carried since round 3)

## Needs Further Investigation
### A. A cue at a song change may be converted at the old tempo — confirm with an OSC trace
Carried forward from rounds 1 to 5 unchanged: capture an OSC trace of a song change in a set with two tempos and check whether `/live/song/get/tempo` arrives before `/live/song/get/current_song_time`.

### B. Whether the ATEM reports a cut to the input already on program — confirm on the church's ATEM Mini
Carried from `pre-pr-review-5.md` B unchanged. From a service's second Count Off on, the Count Off cuts to Camera while Camera is on program, and the ATEM's acted-on time needs a program report for that cut. The adapter's contract promises one (`src/server/atem.ts:50`), but whether the hardware sends `PrgI` for a change that changes nothing is unverified. If it does not, each such line waits until the next measured cue or the server's stop, which also makes finding 1's windows more often hold a waiting line. What settles it: #145's acceptance run, or a rehearsal's log with a numeric `actedMs` on an ATEM line for a second-song Count Off.

### C. A rotation during `pnpm lateness` can count a file's lines twice — confirm with a timed rotation
Carried from `pre-pr-review-5.md` C unchanged; `src/lateness/main.ts:39` still reads both files under `Promise.all`.

### D. Whether a frozen socket process reports the drop before its restart — confirm by execution against threadedclass
Main's comment at `src/server/atem-switcher.ts:103` says "a socket process restarted for freezing emits no disconnected before the reconnect fails". Reading threadedclass 1.4.1, a ping timeout calls `_childHasCrashed`, then `restartChild(..., true)`, then `killChild(child, 'restart child', false)`, which leaves `child.alive` true until the process's `close`; the `close` listener from `_setupChildProcess` then emits `thread_closed`, which atem-connection turns into `disconnected` (`lib/atemSocket.js:120-121`, `atem.js:58-62`). If the reading holds, the ATEM goes offline at the start of every restart and a waiting Count Off is settled then. If the comment holds, the ATEM stays online through a freeze's restart and finding 1's window (a) covers it, which lifts finding 1 to MEDIUM. What settles it: a child-process test in the style of `test/atem-switcher-restart.test.ts` that freezes the socket worker (a busy loop past `freezeLimit`) and records whether `disconnected` comes before `restarted`. This is #114's comment and #114's test matrix; it belongs to #114 review 8 finding 1's split ticket.

## Reviewed and Dismissed
- The hand-resolved hunk in `src/server/atem.ts` — `git show --cc 9f27f78` shows one hunk, and the per-file interdiff against both parents is identical: the branch's `acknowledges: true` with its comment, and main's reworded give-up comment, both landed. Do not re-resolve it.
- A give-up on #193's lost-Atem path while a Count Off waits has no server-level test of its own (finder F4) — the chain is pinned link by link, as review 5 found for the respawn give-up: the client reports offline, then gives up, on a lost Atem (`test/atem-switcher.test.ts:406`, and `:433` with no second offline), ignores the lost Atem's events after (`:446`), and an offline report settles the waiting line with `actedMs: null` (`test/atem.test.ts:1148`, `test/cue-lateness.test.ts:539`). The rule is in Approach decisions.
- Fire again writes a waiting Count Off's line with `actedMs: null`, even when its report would come a moment later (finder F5) — the recorded behaviour: `hand()`'s comment at `src/server/connections.ts:200` says an unmeasured cue settles the waiting one, and `test/cue-lateness.test.ts:590` pins it. No double write, since `actedOn` then finds `handed` null.
- A late `write()` after `log.close()` is not guarded (finder F3) — no #186 path writes after `connections.stop`: `settle` and `actedOn` no-op on a null `handed`, and the adapter's `onGaveUp` returns once stopped (`src/server/atem.ts:218`). The only late writer is `deliver` during `hub.close()`/`live.close()`, which writes at hand time as the base did; pre-existing, untouched.
- A socket process that fails its restart before the first connect has settled is not heard, since `hook()` runs after the connect (finder F6) — main's #193 code, untouched by this branch. A crash still emits `thread_closed`, so the ATEM reports offline and any waiting line is settled; what is missed is the give-up's retry, which is #193's surface.
- A program report of the lost Atem, or of the old Atem after a fresh one is built, crediting a later Count Off — every listener is gated by `live()` (`current === each && !each.lost`), the adapter clears `sent` on each connect and disconnect, and the library emits `connected` before any `stateChanged`. Pinned by `test/atem-switcher.test.ts:446`.
- `changeProgramInput` and `state` going through the lost Atem between its loss and the next connect — the ATEM is offline then, and the server cuts nothing and hands no cue to an offline target.
- An operator's cut to Camera before a Count Off's own report taken as that report — review 4's Minor list; unchanged by the merge.

## Minor / nits
- The ATEM's `actedMs` includes one synchronous snapshot publish: `onProgram` calls `program(input)` before `report.actedOn` reads the clock (`src/server/atem.ts:232-233`). Under a millisecond; carried from review 5.
- Review 4's Minor items are unchanged by this delta.

## Test quality
The branch adds no tests in this delta: every test change since `4359c37` is main's (#193 and #114 review 7), reviewed in setlist-controller#114's reviews 7 and 8. This review checked that they survive the merge (67, 26 and 3 test names in the three ATEM suites, none lost) and pass. Tautology audit: not run, since no branch test was added or changed. Finding 1 recommends two new tests, each red today (PROBE-A and PROBE-C are those tests with the assertions turned round).

## Before opening the PR
- **CI readiness:** lint, typecheck, test, build green at `9f27f78`, first run; Playwright 44 passed locally.
- **Commit hygiene:** this doc and `repro/review-6-shutdown-waiting-line.diff` are the only additions. The repro is a patch, not a `.ts` file, so lint does not read it.
- **Likely reviewer asks:** that the merge of PR #199 into `src/server/atem.ts` was resolved by hand (the interdiff row answers it); whether shutdown can lose a lateness line (finding 1).

## Verdict
Ready to open the PR as is, with follow-ups. The merge kept both sides' behaviour, and #186's acknowledgement and the lateness log compose with #193's failed restart and give-up: offline comes first on both give-up paths, the waiting Count Off is settled once, and a lost Atem cannot credit a later cut. Nothing is MEDIUM or higher. The one new finding (1, LOW) is a shutdown edge that #186 exposes in the base's settle-then-stop order, with no known user path; it is a small change in two files and can be fixed on this branch or as a follow-up, and Needs Further Investigation D decides whether it is worth more. Findings 2 and 3 are review 4's deferred LOW findings, carried unchanged. No prior finding was "resolved" by a comment edit.
