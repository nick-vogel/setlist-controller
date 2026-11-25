# Pre-PR review: setlist-controller#2 Safe Mode, no jumps to another song while Live plays

**Branch:** `setlist-controller-2-safe-mode` vs `origin/main` (merge-base `a9da50a`, merged into HEAD at `c9aa525`)
**Reviewed at:** HEAD `c9aa525` (setlist-controller#2 merge main: #10 battery warning on the playback Mac and the private-terms check) + 0 files with uncommitted changes, 0 untracked files, 37 files total, +1434 / -73
**Reviewed against:** issue `nick-vogel/setlist-controller#2` (open), parent epic `#1` ("Safe jumps while Live plays"), PR `#23`, `.claude/rules/public-repository.md`, `docs/merge-rules.md`, global rules in `~/.claude/rules/`, and prior review `docs/reviews/setlist-controller-2/pre-pr-review-1.md` (Approach decisions and Findings 1 to 7, which this branch claims to resolve). The repo has no `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, or ADRs. Run with `--fresh` as the second opinion gate review.
**Date:** 2026-11-25
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present (`eslint`, `playwright`, `tsc`, `tsserver`, `vite`, `vitest`); lockfile unchanged |
| Typecheck | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | pass |
| Private terms check | `pnpm check:private` and `pnpm check:private --range origin/main..HEAD` | both pass (exit 0) |
| Full unit and rig suite | `pnpm vitest run --maxWorkers=2`, plus standalone rerun of 1 load-timed-out untouched file | full run: 103 of 104 files passed (3,337 passed, 4 skipped), 1 failure in untouched `test/set-manifest.test.ts` (`raises the revision when the file is rewritten, and serves the new songs`, 2000 ms timeout under concurrent machine load). Standalone rerun `pnpm vitest run test/set-manifest.test.ts --maxWorkers=2`: **40 of 40 passed** (1.74 s). Touched-surface rerun (`test/safe-mode.test.ts`, `test/hold-to-stop.test.ts`, `test/pages.test.ts`, `test/timeline.test.ts`, `test/eos.test.ts`): **5 of 5 files, 502 of 502 passed** |
| Build and Playwright specs | `pnpm build && pnpm exec playwright test e2e/safe-mode.spec.ts e2e/timeline.spec.ts e2e/stop.spec.ts --workers=1` | **24 of 24 passed** across `webkit-ipad` and `chromium-android` |
| Full `pnpm test:e2e` | not run | other suites share the machine; the three specs covering Safe Mode, Timeline, and Hold-to-Stop were run |
| Base oracle for new tests (Phase 4.5) | not run | non-Claude run forbids `git worktree add`, so tests could not be executed in a base checkout; manual four-shapes tautology audit completed in full, and `pre-pr-review-1.md` previously ran the base oracle at `adee302` |
| `activeSong` count-in branch and `server.ts` cue-engine ordering probes | executed standalone Node script in a `mktemp -d` folder against `src/shared/safe-mode.ts`, `src/server/playback-controller.ts`, and `src/server/cues.ts` | confirmed `activeSong` returns `jump.song` when `countIn` is true and `now` differs or is null, confirmed `startPlaybackController.refuses()` uses it when `playing: true` arrives before `position`, and confirmed `server.ts:287` preserves `cause: 'play-from-start'` while a mutated order (`cues.command` before `refuses`) degrades it to `cause: 'jump'` |
| Em-dash check in changed code and UI copy | `git diff "$BASE" -- src/ web/ test/ e2e/` | 0 em-dashes in added or modified code and UI strings |

**Overall:** The Safe Mode implementation cleanly meets every acceptance criterion of `nick-vogel/setlist-controller#2`, and all 7 findings from `pre-pr-review-1.md` are resolved on this branch with no introduced regressions. Server enforcement, role boundaries, leader and producer UI toggles, Timeline section guards, and the shared `useHold` Pause hold behavior all hold under unit, rig, and Playwright verification. Only one non-blocking LOW test gap remains: the exported `activeSong` helper's count-in override branch has no direct unit test where `jump.song` differs from `now?.song`. The branch is ready to merge as-is, with that unit test optional.

## Approach decisions
Carried forward from `pre-pr-review-1.md` (no decision overturned):
- **Q1, decided by Nick 2026-11-25:** while Live plays with no current song (before the first song, in a gap, or with an unknown position), Safe Mode refuses every jump and Play from start, even into the song about to start. Intended and pinned by test.
- **Q2, decided by Nick 2026-11-25:** turning Safe Mode off stays a single tap on `SafeModeToggle` (`web/src/SafeModeToggle.tsx:22`), with no hold. Not a finding.
- **Hold-to-act buttons:** shared `useHold(enabled, onComplete)` hook in `web/src/hold.ts` built on `createHold`, with each caller stabilizing `onComplete` via `useCallback` on `send`.
- **State reset on a prop change in a component:** guarded adjust-during-render shape (`if (wasEnabled !== enabled) { setWasEnabled(enabled); setHolding(false); }`), avoiding `setState` in an effect body (`react-hooks/set-state-in-effect`). Precedent: `web/src/App.tsx:395`.
- **Logic shared by server and pages:** pure helper `activeSong(countIn, jump, now)` in `src/shared/safe-mode.ts`, mirroring `src/shared/count-in.ts`.
- **Proving a refused command sent nothing:** accepted end-toggle barrier on song 2 waited for among snapshots received after it was sent (`received.indexOf(s) >= from`) in rig tests, and WebSocket `framesent` recording plus a subsequent accepted jump in Playwright tests.
- **Direct test of a pure shared helper (added by remediation 2026-11-25):** a plain `describe('<helper>')` block in the feature's own test file, calling the helper with written-out inputs and asserting literal expected values. `src/shared/count-in.ts` has no direct test to mirror, so `activeSong` set the shape in `test/safe-mode.test.ts`.

## Prior-review closure
All 7 Confirmed findings from `docs/reviews/setlist-controller-2/pre-pr-review-1.md` are resolved:
- **Finding 1 (MEDIUM):** fully fixed in `98311c9` (setlist-controller#2 pre-PR review 1 finding 1: nothing tested that a refused command leaves the targets' schedules alone). The new lead-target test in `test/safe-mode.test.ts:145-174` pins the guard at `src/server/server.ts:287` against deletion and the comment at `src/server/server.ts:278-285` now matches the code. (A narrow half-reorder moving `cues.command` above `refuses` is noted under Minor / nits.)
- **Finding 2 (MEDIUM):** fully fixed in `0c23d8e` (setlist-controller#2 pre-PR review 1 finding 2: the refusal checks read Live's inbox straight after flush, so the gap refusal was unpinned). All four rig refusal assertions now use `barrier(leader)` with a `received.indexOf(s) >= from` guard, and `e2e/safe-mode.spec.ts:116-120` replaces the 150 ms sleep with a same-song jump barrier.
- **Finding 3 (LOW):** fully fixed in `28fbfed` (setlist-controller#2 pre-PR review 1 finding 3: Timeline Pause showed a full hold bar with nobody pressing). The stale hold bar is cleared when the guard drops, and the inverted repro is landed in `e2e/safe-mode.spec.ts:179-234`.
- **Finding 4 (LOW):** fully fixed in `2866d54` (setlist-controller#2 pre-PR review 1 finding 4: Timeline Pause copied Setlist Stop's hold wiring, and the copies had drifted). `useHold` in `web/src/hold.ts:35-90` unifies `StopButton` (`enabled = true`) and `TimelinePauseButton` (`enabled = safeMode && available`).
- **Finding 5 (LOW):** fully fixed in `289a970` (setlist-controller#2 pre-PR review 1 finding 5: the guard's active song rule was written three times, and SongHeading defaulted a fourth). `activeSong` in `src/shared/safe-mode.ts:6-7` is used by the server and both pages, and `SongHeading`'s `safeMode` and `activeSong` props are required with no defaults.
- **Finding 6 (LOW, aggregated a-e):** fully fixed in `17791be` (setlist-controller#2 pre-PR review 1 finding 6: five weak spots in the Safe Mode tests). All five sub-items landed cleanly: truthy/falsy non-boolean payloads with barriers, WebSocket `framesent` check for guarded Timeline taps, 900 ms hold check, tautology deletion, and conditional Safe Mode toggle in `test/eos.test.ts:229`.
- **Finding 7 (LOW, comment hygiene):** closed by `289a970`, which removed `App.tsx`'s inline formula and its stale comment.

## Confirmed Issues

### 1. The exported `activeSong` helper's count-in branch has no test where `jump.song` differs from `now?.song` (LOW)
- **Location:** `src/shared/safe-mode.ts:6-7` (and `test/safe-mode.test.ts:176-201`)
- **Attribution:** introduced in `289a970` (setlist-controller#2 pre-PR review 1 finding 5: the guard's active song rule was written three times, and SongHeading defaulted a fourth), extracting the inline expression first added in `cfca492` (`git show a9da50a:src/shared/safe-mode.ts` does not exist; `git log --oneline --reverse -S'export const activeSong' a9da50a..HEAD` returns `289a970`).
- **Real-world trigger:** No runtime defect; the implementation is correct. The count-in branch (`countIn && jump ? jump.song : ...`) only diverges from `now?.song ?? null` during a brief startup window where Live reports `is_playing: true` before `current_song_time` moves to the target song's Count Off (or if the Count Off jump UDP packet is lost while `start_playing` arrives). Rated LOW because it is a coverage gap on a one-line helper with no broken runtime path (`tests-can-go-red`).

**Evidence** (`src/shared/safe-mode.ts:3-7`):
```ts
// The song Safe Mode guards while Live plays, which the server's guard keeps and the pages read to
// grey out the taps it would refuse: the song currently playing, or the held count-in's song while
// a count-in runs. Null before the first song, in a gap between songs, or while position is unknown.
export const activeSong = (countIn: boolean, jump: JumpTarget | null, now: NowPlaying | null): number | null =>
  countIn && jump ? jump.song : (now?.song ?? null);
```

**Failure mode:** In `test/safe-mode.test.ts:190-200`, the fake Live jumps to Song 1's Count Off before reporting `playing: true`, so `now.song` is already `1` (identical to `jump.song`). No other test calls `activeSong` with `countIn = true` (`test/pages.test.ts:862` passes `activeSong(false, null, shown.now)`). Replacing `src/shared/safe-mode.ts:7` with `now?.song ?? null` leaves every test in the repo green. Executed probe confirmed `activeSong(true, { song: 2, section: 2 }, { song: 1, section: 1, next: 2, bar: 1, bars: 4, fraction: 0 })` returns `2`, `activeSong(true, { song: 2, section: 2 }, null)` returns `2`, and `activeSong(false, { song: 2, section: 0 }, { song: 1, section: 1, next: 2, bar: 1, bars: 4, fraction: 0 })` returns `1`.

**Recommended fix** (add a unit test in `test/safe-mode.test.ts`):
```diff
 import type { Command } from '../src/shared/command.ts';
+import { activeSong } from '../src/shared/safe-mode.ts';
 import type { ProducerSnapshot, SetList, Snapshot } from '../src/shared/snapshot.ts';
```
```diff
+  it('uses the held count-in song in activeSong even when now points elsewhere or nowhere, and ignores waiting jumps outside a count-in', () => {
+    const inSong1 = BASE_SNAPSHOT.now;
+    expect(activeSong(true, { song: 2, section: 1 }, inSong1)).toBe(2);
+    expect(activeSong(true, { song: 2, section: 1 }, null)).toBe(2);
+    expect(activeSong(false, { song: 2, section: 0 }, inSong1)).toBe(1);
+    expect(activeSong(false, null, null)).toBeNull();
+  });
```

**Remediation brief**
- **Design intent:** `activeSong(countIn, jump, now)` in `src/shared/safe-mode.ts` is the single source of truth shared by `playback-controller.ts`, `App.tsx`, and `TimelineView.tsx`. While a count-in is held (`countIn && jump`), the active song is `jump.song` even if `now` still points to the previous song or `null`; outside a count-in, a waiting jump (for example a cross-song jump queued before Safe Mode turned on) does not change the active song, which remains `now?.song ?? null`.
- **Full surface:** `test/safe-mode.test.ts` (import `activeSong` from `../src/shared/safe-mode.ts` and add the unit test); no production code changes (`src/shared/safe-mode.ts:6-7` is already correct).
- **Must preserve:** all 12 existing tests in `test/safe-mode.test.ts` and `src/shared/safe-mode.ts:6-7` unchanged.
- **Do not touch:** `src/shared/safe-mode.ts` itself or `test/safe-mode.test.ts:176-201`'s rig count-in test.
- **Proof:** run `pnpm vitest run test/safe-mode.test.ts --maxWorkers=2`; verify the new test fails if `src/shared/safe-mode.ts:7` is temporarily changed to `now?.song ?? null` and passes when restored.

## Needs Further Investigation
Items A and C from `pre-pr-review-1.md` remain hardware-dependent checks on real Live and a real iPad, and do not gate this PR:
### A. Report order right after a start from stopped on real Ableton Live
`startFromTop` (`src/server/playback-controller.ts:648`) does not update `position` locally. If real AbletonOSC reports `is_playing: true` before `current_song_time` moves to the newly started song, `activeSong` briefly returns the previous song. Confirm by capturing AbletonOSC report order on real Live for `jump` followed by `start_playing` from stopped. (Item B from `pre-pr-review-1.md` is now actionable via unit test and moved to Finding 1.)
### B. Stale hold state on a real iPad when Live stops mid-press
`useHold` in `web/src/hold.ts:38-42` now resets `holding` whenever `enabled` (`safeMode && available`) drops, which clears `TimelinePauseButton` even if iOS Safari omits `pointerup` on a newly disabled button. Confirm on a real iPad for both `TimelinePauseButton` and `StopButton` (where `enabled` stays `true`).

## Reviewed and Dismissed
- **Nick's Q1 decision (gap, before first song, and unknown position refuse every jump):** intended behavior decided by Nick on 2026-11-25, implemented consistently across `playback-controller.ts:310`, `SongHeading.tsx:42`, and `TimelineView.tsx:370`, and pinned by `test/safe-mode.test.ts:176-184`.
- **Nick's Q2 decision (single-tap Safe Mode toggle):** intended behavior decided by Nick on 2026-11-25 (`web/src/SafeModeToggle.tsx:22`).
- **Role isolation and payload validation:** `src/server/hub.ts:55` drops every message from non-controlling sockets unread before `parseCommand`, and `src/shared/command.ts:55` requires `typeof enabled === 'boolean'`. Both are proved by `test/safe-mode.test.ts:62-87` using barriers.
- **No-set and disconnected UI states:** `web/src/App.tsx:247-251` renders `SafeModeToggle` for leader and producer even before Live reports a set (or when the set has no songs), disables it only when `!connected`, and keeps it enabled while `live === 'not-connected'` so Safe Mode can be set before Live connects. Viewers never see it on setlist, chart, or empty-set views.
- **`useHold` `onComplete` identity constraint (`web/src/hold.ts:33-55`):** not a live defect. Both callers (`StopButton.tsx:11` and `TimelinePauseButton.tsx:20`) memoize `onComplete` with `useCallback(..., [send])`, `send` in `App.tsx:443` has empty deps `[]`, and `web/src/hold.ts:33-34` documents the constraint explicitly.
- **Transport row `PlayFromStartButton` (`web/src/App.tsx:338`) and `JumpTargets` (`web/src/JumpTargets.tsx`):** pre-existing and untouched; both always target `now.song`, which matches `activeSong` in every state except the unconfirmed count-in report-ordering window (NFI A), where the server remains the authority.
- **Unconditional `set-safe-mode: false` in `test/atem.test.ts:125`'s `jump()` helper:** inspected all four callers (`:182`, `:215`, `:235`, `:277`); every one is a cross-song jump from song 2 back to song 1, so no same-song test was weakened.
- **Mid-press release on `TimelinePauseButton` after Safe Mode turns off:** `useHold` cancels the timer and clears `holding` when `safeMode` drops; if a release fires `onClick` on the reused `<button>`, that matches Safe Mode off semantics (already dismissed in `pre-pr-review-1.md`).
- **Safe Mode across Live disconnect/reconnect and set reloads:** `playback-controller.ts:678-714` intentionally leaves `safeMode` untouched on Live disconnect or cue-point reloads and resets it to `true` only on server start, matching AC1.
- **`test/set-manifest.test.ts` failure in the full Vitest run:** pre-existing, untouched file that hit a 2000 ms `fs.watch` timeout under concurrent machine load and passed 40 of 40 in 1.74 s when rerun alone.

## Minor / nits
- `test/safe-mode.test.ts:145-174` proves `src/server/server.ts:287` prevents `connections.cancel()`, so deleting line 287 fails the test; a narrower mutation moving `cues.command(command)` above line 287 would still pass `test/safe-mode.test.ts` while corrupting a waiting same-song `play-from-start`'s cue cause (confirmed via scratch probe). Production ordering at `src/server/server.ts:287-289` is correct.
- `e2e/safe-mode.spec.ts:146` uses a `900 ms` press against `STOP_HOLD_MS = 1000 ms` (per `pre-pr-review-1.md` Finding 6c). It passed cleanly in both WebKit and Chromium, though a ~750 ms press would keep a wider margin against CI event-loop jitter while still killing a 500 ms hold mutation.
- `e2e/timeline.spec.ts:286` keeps the old test title `MD transport bar: single-tap Pause stops Live (while Setlist Stop still holds)...` even though line 334 now toggles Safe Mode off before that step.
- `test/safe-mode.test.ts:300-317` renders `Page` with a loaded set; the no-set branch (`web/src/App.tsx:247-251`) is not covered by a markup test (though wire toggling before Live connects is covered at `:99-111`).
- `src/server/playback-controller.ts:308-314` `refuses()` returns `false` for unnamed command kinds rather than an exhaustive `switch`; epic sibling `#3` will need to decide explicitly for `jump-now` and `cancel`.

## Test quality
Tests added or modified: 12 rig and markup tests in `test/safe-mode.test.ts`, 4 Playwright tests in `e2e/safe-mode.spec.ts`, Safe Mode off-steps in 2 tests in `e2e/timeline.spec.ts`, and Safe Mode updates in 20 existing Vitest files. Base-checkout oracle: not run in this non-Claude review because `git worktree add` is disallowed (`pre-pr-review-1.md` ran it at `adee302` and cleared the pre-remediation tests). Manual four-shapes tautology audit found 0 tautologies, 0 mocked units under test, 0 assertion-free or prose-only tests, and 1 uncovered branch on the newly extracted `activeSong` helper (Finding 1). All 18+ edited existing test files preserve their original assertions, and `test/eos.test.ts:229` now leaves Safe Mode on for same-song lighting jumps.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check:private` (tree and `origin/main..HEAD` range), Vitest (104 of 104 files after rerunning the 1 load-flaked untouched file), and Playwright (`e2e/safe-mode.spec.ts`, `e2e/timeline.spec.ts`, `e2e/stop.spec.ts`, 24 of 24 in WebKit and Chromium) are all green.
- **Commit hygiene:** PR #23 is already open at HEAD `c9aa525` with a clean working tree (aside from this new review doc under `docs/reviews/setlist-controller-2/pre-pr-review-2.md`). Commit this review doc with subject `setlist-controller#2 pre-PR review 2` if keeping the review trail in the PR.
- **Likely reviewer asks:** none blocking; optional unit test for `src/shared/safe-mode.ts` `activeSong` (Finding 1).

## Verdict
**Ready to merge as-is (or with Finding 1 as an optional follow-up).** There are 0 CRITICAL, 0 HIGH, and 0 MEDIUM findings, and all 7 findings from `pre-pr-review-1.md` are cleanly closed. The single confirmed LOW finding (`activeSong`'s count-in branch unit test) does not gate the PR.

## Remediation, 2026-11-25
Base of the round: HEAD `dfcdf89`. Final HEAD of the fix: `b5e5103`. Scope: the one Confirmed finding, LOW, taken on because the invocation asked for it. Review 1's Approach decisions and Dismissed list, and Nick's Q1 and Q2 decisions, untouched. No production code changed.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `b5e5103` nothing tested activeSong's count-in branch where the held jump's song differs from now | red→green: `pnpm vitest run test/safe-mode.test.ts --maxWorkers=2 -t activeSong` red with `src/shared/safe-mode.ts:7` changed to `now?.song ?? null` (`expected 1 to be 2`), green restored; whole file 13 of 13 (the 12 existing plus the new one) | 0 | proved by execution |

After the round: `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm test --maxWorkers=2` 104 of 104 files (3,339 passed, 4 skipped), `pnpm check:private --range origin/main..HEAD` exit 0. Playwright not run: the change is a unit test only, with no web code touched.

### Known regressions, deferred
- None.

### Rework briefs
- None. No verify agent ran (a LOW fix proved by execution), so there was nothing to rework.
