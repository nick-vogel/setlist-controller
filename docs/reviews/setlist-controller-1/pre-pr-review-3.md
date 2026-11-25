# Pre-PR review: setlist-controller#1 Browser setlist controller runs a 3-song rehearsal from an iPad

**Branch:** `setlist-controller-1-ipad-rehearsal` vs `origin/main` (merge-base `cabf12c` "setlist-controller#1 add a README")
**Reviewed at:** HEAD `98979b7` (setlist-controller#1 pre-PR review 2 remediation closure table), clean tree, 0 uncommitted, 0 untracked; 95 files total, +12753 / -0 against the merge-base
**Delta under review:** since `cadb14b` (setlist-controller#1 pre-PR review 1 remediation closure table), the HEAD that `pre-pr-review-2.md` reviewed. The delta is the round 2 remediation, `53fb1bd` to `73a2735` plus the closure table `98979b7`: 19 files, +848 / -27, of which 16 files and +285 / -27 are code, tests and docs (the rest is review 2's doc and repros).
**Reviewed against:** the epic body of setlist-controller#1 (the spec), `pre-pr-review-2.md` (its 7 findings, both Approach decisions sections, the closure table, Known regressions deferred, Open not introduced, and Rework briefs), `.epic-loop/stage2/proposals.md`. No `CODING_STANDARDS.md`, `docs/coding-standards.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs exist in the repo, so conformance is judged against the spec and the five universal review rules.
**Date:** 2026-10-13
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass. Delta-scoped re-review, round 3.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | ok |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 19 files, 202 passed, 2 skipped (both `it.runIf(linux)` in `test/setup-screen.test.ts`) |
| Build | `pnpm build` | pass |
| Playwright suite | `pnpm test:e2e` | not run: not a full check per the repo entry, and no candidate needed it |
| Round 2 findings 1, 2, 4, 5, 6 (controller, Loop availability, contract Ctrl-C, Refresh barrier) | mutation in a scratch worktree at HEAD: each fix reverted in turn | each named test red under its mutant (A: 2 stops; B: 3 loop messages; C: cadb14b `SectionControls.tsx`; D: cadb14b `src/contract/main.ts`; E1: refresh on GET); green unmodified |
| Round 2 finding 3 (server connection status) | fake-WebSocket probe of the real module: 20,000 random 30-step runs (accept, deliver, drop, server-started close with 0/50/2000 ms close handshakes, wake, `close()`, time steps 1 to 1600 ms) against five invariants (at most 2 live sockets; nothing after `close()`; never down once the newest socket is open and has delivered; never up with no open socket for more than 1.6 s); 5,000 healthy-wake runs asserting no `false` ever | 0 violations in both. The fuzz goes red under two mutations (dropping `clearTimeout(retry)` in `wake`; suppressing the up report) |
| Round 2 finding 3, per condition | mutation in a scratch worktree, one condition removed at a time | timeout-reports-down, previous-close-reports-down, wake-on-not-open, the `!previous` guard, and up-on-open each turn a named test red; HEAD 15 of 15 twice |
| Test tautology audit | HEAD's 8 changed test files run at the `cadb14b` oracle in a scratch worktree, plus a mutation (setup Refresh refreshing on GET) | 11 new or changed cases: 8 red, 2 green (both accepted), 1 Linux-only skipped; the oracle run had exactly those 8 failures and no other regression |
| Comment claims (round 2 finding 7) | read against the code: callers of `controller.command`, bridge before `http.listen`, `@julusian/midi` `binary.napi_versions` | true, except the command-path list misses the set poll (finding 1) |
| Real Live, launchd, CoreMIDI, iOS Safari | not run | guardrails forbid opening Live and loading launch agents; no pedal and no iPad in the review |

**Overall:** The round 2 remediation holds for all 7 findings, including the three MEDIUM gates: one stop on Next in the last bar before End, Loop braces nothing while an End jump is pending, and the connection status now survives a 20,000-run state-machine fuzz with no wrong status. This round confirms one LOW, an aggregated comment-hygiene batch (one of its entries is text that review 2's own finding 7 supplied). The branch is ready to open a PR; take the comment batch in the same pass or as a follow-up.

## Approach decisions
- **Listener registration (round 1 finding 1):** per-property `/live/song/start_listen/<property>`, no arguments. Holds.
- **Stopped jump onto the playhead (round 1 finding 3):** a stopped jump onto the playhead does not wait. Holds.
- **Next to End (round 1 finding 2):** `endJump`, applied when the playhead lands within a bar after End. Holds.
- **Both auto-stop triggers (round 2 finding 1):** `reachedEnd` and `landedOnEnd` evaluated into separate constants before the `||`. Holds (mutation A).
- **Loop while a jump waits (round 1 finding 5):** brace the waiting jump's target. Holds.
- **End jump and Loop (round 2 finding 2):** `endJump !== null` returns after the Loop-off branch. Holds (mutation B). Its declared consequence stands: the leader page's Loop button stays enabled for the at most one bar the End jump waits, since `endJump` is not in the snapshot.
- **Loop availability on the leader page (round 2 finding 4):** `jump ?? now` through `sectionAt`. Holds (mutation C).
- **Server connection status (round 2 finding 3 and its two reworks):** up on the current socket's first snapshot; down on the current socket's close, on a wake try's timeout while `previous` is held, on `previous` closing while the current socket is not open, and on a wake that replaces a socket that is not OPEN while no `previous` is held. Holds (fuzz plus per-condition mutations). No change recommended this round.
- **Contract check interrupted report (round 2 finding 5):** `<out>.interrupted.json` and `.md`. Holds (mutation D).
- **"Nothing reached Live" tests (round 2 finding 6):** a leader jump barrier, mirroring `leaderBarrier` in `test/pedal.test.ts`. Holds (mutation E1).
- **Comment hygiene (this round, finding 1):** one batch commit of text-only edits, no code change.

## Prior-review closure
Delta under review: `pre-pr-review-2.md`, 7 findings.

| Prior finding | Status | Note |
| --- | --- | --- |
| 1 (MEDIUM) one stop in the last bar before End | fixed | mutation A turns "stops Live once at End on "Stop at end" when pressed in the last bar before End" red; the hand-relocation exclusion, the Continue toggle and the one-bar window are unchanged |
| 2 (MEDIUM) Loop after Next to End | fixed | mutation B red; Loop off still first; `endJump` is armed only while playing and cleared by stop, `jumpTo`, `clearJump` and landing, so Loop is never left dead |
| 3 (MEDIUM) connection status after a wake | fixed | the fuzz, the healthy-wake fuzz and five per-condition mutations; the stage 2 proposal "Report a page down when a socket opens but never delivers the snapshot" remains the one open item, as review 2's remediation recorded |
| 4 (LOW) Loop availability with a jump waiting | fixed | mutation C red; the no-section-playing branch of the new header comment has no test (Test quality) |
| 5 (LOW) Ctrl-C contract report | fixed | mutation D red; a Ctrl-C in the clean-up window after the last step is a Minor below |
| 6 (LOW) setup Refresh barrier | fixed | mutation E1 red 3 of 3; the cadb14b test stays green under it; the Linux-only 403 case is unverified on darwin |
| 7 (LOW) comment hygiene | fixed, with one entry incomplete | the server.ts command-path list it supplied omits the set poll; carried as finding 1's first entry |

Fully fixed: 7 (finding 7 with one entry incomplete). Partially fixed: 0. Untouched: 0. Resolved only by a comment or doc edit: 0 (finding 7 was a comment finding by nature).

## Confirmed Issues
### 1. Comment hygiene — LOW (aggregated)
- `src/server/server.ts:58-61` — "Commands reach the controller through the hub, the setup Refresh route and the pedal. HTTP listens after the bridge is up, and the pedal acts on no set until the bridge has read one." → "Commands reach the controller through the hub, the setup Refresh route, the set poll and the pedal. HTTP listens, and the poll starts, after the bridge is up, and the pedal acts on no set until the bridge has read one." (introduced by `7401a8d`, from review 2's own replacement text; the poll is `clock.every(SET_POLL_MS, () => controller.command({ kind: 'refresh' }))` at `:112`)
- `src/contract/main.ts:18` — "run writes <path>.md, the readable report, and <path>.json, the comparison file." → "run writes <path>.md, the readable report, and <path>.json, the comparison file. A run stopped with Ctrl-C writes <path>.interrupted.md and <path>.interrupted.json instead, and leaves the other two as they were." (the usage text predates `3ee3dff`, which changed the paths and updated `docs/install.md` but not this)
- `web/src/server-connection.ts:30-32` — "A try whose handshake has not come back by now is given up, and a fresh try starts at once, so a try lost on the way (a dropped packet on a lossy Wi-Fi) still keeps the tries under 2 seconds apart." → append: "A wake's try given up while the socket it replaced is still held reports the page down, even though that socket may still carry commands." (stale since `98d7e8a`; this is the declared trade-off of round 2 finding 3, which no comment records)
- `web/src/server-connection.ts:90-93` — the wake comment ends "if it was dead, the tap is lost as it would be with none." → append: "A wake that replaces a socket that does not read open reports the page down, unless an earlier wake's socket is still held and may carry commands." (stale since `64bf188` and `73a2735`; the `!previous` guard at `:105` is the condition the last rework had to repair)
- `test/proxy.ts:20` — "Destroys every connection that forwards, and leaves held ones held." → "Destroys every open connection, frozen ones included, and leaves held ones held." (introduced by `98d7e8a`; `cut()` iterates the `open` set at `:100-105`, which also holds frozen pairs)

## Needs Further Investigation
### A. A half-open socket on a page that stays awake is never detected
Round 1's Needs Further Investigation B, re-raised by this round's connection reviewer and unchanged by the delta: only a wake replaces a socket, the hub sends only on a change, and no heartbeat or ping exists in `src/` or `web/src/` (checked with `git grep -n -i heartbeat src web/src`, and every `ping` match is a word such as `mapping` or `overlapping`). A leader iPad that stays visible through a Wi-Fi roam that the OS never errors keeps a socket that reads open, status up, controls enabled. Confirm on the iPad: page visible, drop the access point for a few seconds without sleeping the device, and watch for the Reconnecting banner. If it never comes, the fix is an application-level heartbeat (the hub re-sends the snapshot every N seconds and the client treats 2N of silence as a wake), which belongs in the same follow-up as the stage 2 proposal "Report a page down when a socket opens but never delivers the snapshot".

Round 2's Needs Further Investigation A to C, and round 1's A and C to F, stand unchanged.

## Reviewed and Dismissed
- The leader page's Loop button stays enabled while an End jump waits, and the press does nothing — the declared consequence in round 2 finding 2's Must preserve; at most one bar.
- `close()` called synchronously from inside `onStatus(false)` re-arms a retry after `close()` (`web/src/server-connection.ts:83-86`, `:57-58`) — executed in a probe, but the only consumer passes `setConnected`, a React state setter that never unmounts synchronously.
- A first message that fails `JSON.parse`, or an `onSnapshot` that throws, leaves `reported` false — the hub always sends `JSON.stringify(snapshot)` and `setSnapshot` does not throw.
- A socket the server is closing with a close frame keeps the status up until the close event — the hub shuts down with `terminate()`, which sends no close frame; reasoned, and the fuzz's 2000 ms close-handshake case did not flag it.
- Repeated `onStatus(false)` while tries hang with `previous` held, and in the previous-close and wake branches when already down — React ignores a same-value set.
- The contract test's scratch directory under the worktree's ignored `dist/` — the recorded approach, mirroring `test/offline.test.ts`.
- `docs/install.md:52` not naming an nvm version switch — the sentence it makes is true; the nvm case is round 2's Needs Further Investigation C territory.

## Minor / nits
- `src/contract/main.ts:95` and `:101-104`: the report path follows `signal.aborted` and the exit code follows `record.aborted`. A Ctrl-C after the last step has finished (during the clean-up flushes, `socket.close`, or the fake run's `live.close()`) writes a complete record to `<out>.interrupted.*` and exits 0 with no "stopped early" line. Reasoned, not executed: the window is milliseconds. Deriving both from one value (`record.aborted === INTERRUPTED`) closes it.
- `test/contract.test.ts:76-94`: a fixed 1 s SIGINT could land before the child registers its `process.once('SIGINT')` on a cold CI runner (a flaky red, not a false green), and a child that never exits is not killed when the 15 s test timeout abandons the body.

## Test quality
Tests in the delta: 11 new or changed Vitest cases (9 new, and the 2 `test/setup-screen.test.ts` cases that gained a barrier) and the `test/proxy.ts` helpers `hang()` and `cut()`. Against the `cadb14b` oracle: 8 red, 2 green, 1 Linux-only skipped. The 2 green are accepted: "stays connected across a second wake while the socket the first one replaced still reads open" guards a regression `64bf188` introduced after `cadb14b` (red with `64bf188`'s module), and "answers only a POST" is a test-only barrier fix (HEAD's test red 3 of 3 under refresh-on-GET; `cadb14b`'s green 3 of 3). No mocked units, unread snapshots, self-computed expectations or assertion-free tests. What to strengthen, none of it a defect:
- `test/contract.test.ts:89-90`: existence-only checks on the interrupted files, and only `<out>.json` is seeded. Also seed `<out>.md` and assert it unchanged, and parse `<out>.interrupted.json` for the interruption.
- `test/reconnect.test.ts:244`: the replaced-socket-close case is told apart from the 1500 ms timeout path only by a 1000 ms `waitFor` after the cut. A fake-timer case in `test/server-connection.test.ts` (wake, close the replaced socket while the fresh one is CONNECTING, expect `[true, false]` before any timer advance) pins it independent of timing.
- `test/reconnect.test.ts:258`, `:268`: the status values are never read, only the snapshot counts at each call. Record `{ open, snapshots }` and assert the exact sequence.
- `test/server-connection.test.ts:84`: the double-wake case asserts without advancing timers, so the retired sockets' queued close events never fire. `vi.advanceTimersByTime(5000)` before the assertion still passes at HEAD and still fails at `64bf188` (checked).
- `test/pages.test.ts:158-162`: the header comment's "or while a jump waits" case (`now` null, `jump` set) has no assertion; the server reaches that state with a waiting jump between songs.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build all pass at `98979b7`.
- **Commit hygiene:** commit this doc. No new repro files: the one confirmed finding is comment text, and the connection fuzz proved soundness rather than a defect, so it stayed in scratch. Nothing else to drop.
- **Likely reviewer asks:** proof against real Live (#13's contract run); the Playwright suite's status outside CI; why the Reconnecting banner covers content; the half-open socket (Needs Further Investigation A) and the stage 2 proposal on a socket that never delivers its snapshot.

## Verdict
**Ready to open a PR, with follow-ups.** No gate: zero CRITICAL, HIGH or MEDIUM this round. Finding 1 (LOW, five comment edits, one commit) can land before the PR or with it. Of round 2's 7 findings, all 7 are fixed (finding 7 with one entry incomplete, now finding 1's first line), none partially fixed, none untouched, none resolved only by editing a comment beyond the comment finding itself. The confirmed count fell from 14 to 7 to 1, and the last one is comment text: the converging shape, reported as such rather than backfilled. The connection status, changed four times across reviews, held under a 20,000-run fuzz and per-condition mutations; its remaining exposure is the half-open socket and the never-delivered snapshot, both already recorded as follow-ups, which together are the split ticket round 2's Escalation anticipated rather than a fifth in-place rewrite.
