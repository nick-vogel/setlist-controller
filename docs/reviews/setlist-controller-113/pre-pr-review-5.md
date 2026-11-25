# Pre-PR review: setlist-controller#113 stage 2, the #165 fix for a brace-end report from the gap between two songs

**Branch:** `setlist-controller-113-connections-foundation` vs `origin/main` (merge-base `00793f4` "Merge pull request #166 from nick-vogel/setlist-controller-113-connections-foundation")
**Reviewed at:** HEAD `cb21a7a` (merge commit "setlist-controller#165 A loop braced by hand over the gap between two songs keeps a Fade out from coming back at the next Count Off", carrying `b5108da` of the same subject), clean tree: 0 files with uncommitted changes, 0 untracked; 2 files total, +121 / -4 against the merge-base
**Delta under review:** none; a `--fresh` review of the whole branch against `origin/main`. The four earlier docs in this folder reviewed the branch before PR #166 merged it, so `00793f4` already contains everything they covered.
**Reviewed against:** setlist-controller#165 (body and acceptance criteria), setlist-controller#113 (epic body, through #165's Notes), the Approach decisions of `pre-pr-review-4.md`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules (load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape) are the conformance checklist.
**Date:** 2026-10-21
**Reviewer:** 1 code-review agent (with a differential harness) + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, lockfile up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 48 files, 949 passed, 4 skipped (the four Linux-only laptop-refusal cases in `test/setup-screen.test.ts`) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 42 passed |
| The fix against #165's intent | finder's differential harness: the HEAD and `00793f4` controllers driven with the same Live events on the GAP set, every `countOff` recorded, HEAD's snapshots fed through the frozen `startCues` | 19 sequences. HEAD differs from the base in 6 (the issue's case; two brace-end reports in a row; a jump landing after a gap brace-end report; Play from start landing after one; a set re-read dropped while playing; a first report on the brace end with the position unknown). In all 6 the playhead goes from no section into song 2's Count Off, `cues.ts` raises that Count Off's cue, and HEAD now brings the music back. No sequence found where HEAD brings the music back, or clears `startedSong`, where the base rightly did not |
| Whole surface of `wrapFrom` | `grep -n wrapFrom src/server/playback-controller.ts` | one reader (`:427`), one wrapping write (`:429`), three clears (`:391` lost Live, `:411` changed set, `:438` stop), all unchanged in meaning |
| New test can go red | tautology agent: scratch worktree at `00793f4` with the new test copied in; then mutant `if (false) enteredCountOff(...)` at `:430` | base: case 1 red `expected 'silent' to be 'in'`, the control green as designed. Mutant: both red. With HEAD's controller: both green, 4 of 4 runs |
| The fix reverted alone | scratch worktree at `cb21a7a` with `repro/review-5-mutation-gap-from-dropped.diff` | case 1 red `expected 'silent' to be 'in'`; full suite 1 failed, 948 passed |
| Tap and Play from start after a gap brace-end report | `repro/review-5-gap-jump-landing.test.ts` copied into `test/` of scratch worktrees at `cb21a7a`, `00793f4`, and `cb21a7a` plus the mutant | HEAD 2 of 2 green (3 more runs green); base 2 of 2 red; mutant 2 of 2 red. Finding 1 |
| Stability of the new test | finder, 15 runs | 15 of 15 green |
| Tautology shapes | tautology agent read of `test/fade-brace-end-gap.test.ts` | none: literal expectations, nothing mocked, state assertions, fresh-snapshot waits |
| Real Live | not run: the guardrails forbid driving Live | whether Live reports a position on a brace end, and where it leaves the playhead on a stop there, is still unconfirmed (carried from `pre-pr-review-4.md`) |

**Overall:** The #165 fix does what the issue asked. A report on the brace end of a loop braced over the gap now carries "no section" to the next report, so a move on into song 2's Count Off brings a Fade out back, as `cues.ts` already raised that Count Off's cue. The fix also repairs a tap on song 2's Count Off and Play from start of song 2 sent right after such a report, both silent on the base, but no test pins those two paths (finding 1, LOW). Nothing confirmed at MEDIUM or above. The branch is ready to open the PR.

## Approach decisions
- Brace end in the controller (#156, #165): `wrapFrom` is `{ from: NowPlaying | null } | null` (`src/server/playback-controller.ts:142`). `null` means no brace-end report is the latest; `{ from: null }` means one is and the playhead was in no section before it. This matches the cue module, which keeps `now: before.now` through a wrap (`src/server/cues.ts:155`), and mirrors the wrapper shape of `startWaiting` in `src/server/cues.ts`. The cue module stays frozen per `pre-pr-review-2.md`.
- Carried forward from `pre-pr-review-4.md` and not overturned: the music-back word and its clear on a Fade out, `onBraceEnd` mirroring the cue module's guard, and everything that doc carried from round 2.

## Confirmed Issues
### 1. A tap on song 2's Count Off, or Play from start of song 2, right after a brace-end report from the gap, is repaired by the fix but no test pins it — LOW
- **Location:** `test/fade-brace-end-gap.test.ts` (the paths through `src/server/playback-controller.ts:427-430` after a jump lands)
- **Attribution:** introduced (a test gap in this branch's change). The behaviour itself was broken on the base and is fixed here: `repro/review-5-gap-jump-landing.test.ts` is red on both cases at `00793f4` and green at `cb21a7a`. `git log --oneline -S'review-5' 00793f4..HEAD` finds nothing, and the only test file that reports on a gap brace end is `test/fade-brace-end-gap.test.ts` (`grep -ln 35.99995 test/*.ts`), whose two cases never send a jump or Play from start.
- **Real-world trigger:** a loop braced by hand over the gap after song 1, the music faded out, and the leader tapping song 2's Count Off or pressing Play from start on song 2 just as Live wraps. The jump waits for the bar line and releases the loop (`jumpTo`, `:279-281`; Play from start while playing, `:504-506`), then playback goes on into the Count Off. LOW because the code is correct today; the gap is that a later change to the jump or Play from start path could break it unnoticed, since the reverted fix is caught only through the issue's case.
**Evidence**
```ts
          const before = wrapFrom ? wrapFrom.from : now(position);
          position = event.beats;
          wrapFrom = wrapping ? { from: before } : null;
          if (!wrapping) enteredCountOff(before, now(position), event.beats);
```
The overlap layout pins both shapes: `test/fade-brace-end.test.ts:145` (loop off, then playback) and `:158` (a jump tapped just after the report). The gap file pins only the first.
**Failure mode** — none at HEAD. On the base the same sequences leave the music silent: `before` there is `now(35.99995)`, song 2's Count Off, so landing in that Count Off is the same section and `enteredCountOff` returns. Executed: `repro/review-5-gap-jump-landing.test.ts`, both cases `expected 'silent' to be 'in'` at `00793f4` and with `repro/review-5-mutation-gap-from-dropped.diff` on HEAD; both green at HEAD.
**Recommended fix** — add the repro's two cases to `test/fade-brace-end-gap.test.ts`, inside its existing describe, reusing that file's `GAP`, `TRACKS`, `moveTo` and `next`:
```ts
  it.each<[string, Command]>([
    ["a tap on song 2's Count Off", { kind: 'jump', song: 2, section: 0 }],
    ['Play from start on song 2', { kind: 'play-from-start', song: 2 }],
  ])('brings the music back when %s is sent right after that report and playback goes on into the Count Off', async (_, command) => {
    const leader = await silentOnBraceEnd();
    leader.send(command);
    await next(leader, (snapshot) => snapshot.jump?.song === 2 && snapshot.loop === null);

    const into = await moveTo(leader, 37);

    expect(into.now).toMatchObject({ song: 2, section: 0 });
    expect(into.fade).toBe('in');
  });
```
with `import type { Command } from '../src/shared/command.ts';` and a `silentOnBraceEnd()` helper taken from the repro (start at 33 with the loop 32 to 36, Fade out to silence, a report at `Math.fround(35.99995)` asserting `fade` is `silent`, return the leader). The helper can also replace the duplicated setup in the file's two existing cases, which closes the setup-duplication nit below; keep each existing case's assertions exactly as they are if you do.
**Remediation brief**
- **Design intent:** a report on the brace end of a loop going round never changes the section the next report is judged from. `wrapFrom.from` carries the section from before that report, `null` included for the gap, so the next report, whatever moved the playhead there (Live playing on, a tap landing, Play from start landing), is judged as a move from no song. A move from no song into a Count Off brings the music back (#107).
- **Full surface:** `test/fade-brace-end-gap.test.ts` only. No production change.
- **Must preserve:** both existing cases of `test/fade-brace-end-gap.test.ts` and their assertions (case 1's `start.now` null, `silent.now` null, `onBrace.now` song 2 section 0, the rising steps and final volumes; the control's `into.now` and `into.fade`). `test/fade-brace-end.test.ts`, `test/fade-out.test.ts`, `test/pause-rules.test.ts` stay green.
- **Do not touch:** `src/server/playback-controller.ts:438` (the clear on a stop) and `:411` (the clear on a changed set); see Needs Further Investigation A and Reviewed and Dismissed. `src/server/cues.ts` is frozen.
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-113/repro/review-5-gap-jump-landing.test.ts test/ && pnpm exec vitest run test/review-5-gap-jump-landing.test.ts; rm test/review-5-gap-jump-landing.test.ts` is green at HEAD. Red before green for the new cases: `git apply docs/reviews/setlist-controller-113/repro/review-5-mutation-gap-from-dropped.diff`, run `pnpm exec vitest run test/fade-brace-end-gap.test.ts` and see the two new cases red with `expected 'silent' to be 'in'`, then `git apply -R` the same diff and see them green. Then `pnpm lint` and `pnpm test`.

### 2. Comment hygiene — LOW (aggregated)
- `test/fade-brace-end-gap.test.ts:6` — "Proof for setlist-controller#156 review-1 F1.1 (wrapfrom-null-ambiguity)." → "setlist-controller#165, found by the review of setlist-controller#156." The cited review lives under `.epic-loop/`, which `.git/info/exclude` keeps out of the repo, so a reader cannot follow the reference; the sibling file opens the same way with the issue first (`test/fade-brace-end.test.ts:6`).

## Needs Further Investigation
### A. A stop right after a brace-end report from the gap, then a start into song 2's Count Off
The gap form of `pre-pr-review-4.md` Needs Further Investigation A, pre-existing and untouched by #165. A stop clears `wrapFrom` (`src/server/playback-controller.ts:434-439`), so the report after the restart is judged from `now(braceEnd)`, song 2's Count Off. The finder's harness: Fade out, a report at `Math.fround(35.99995)`, stop, loop off, start, a report at 37 gives no `countOff` on HEAD or the base, while `cues.ts` raises the Count Off's `played-into` cue; the same sequence stopped at 35.9 brings the music back. It needs Live to stay stopped within 1e-4 of the brace end with no further position report before the restart. To confirm: on real Live, stop exactly as a braced loop wraps and watch whether AbletonOSC reports the wrapped position. If it does not, the fix is to keep `wrapFrom` through a stop when its `from` is `null`, as a follow-up ticket that also settles review 4's A; the clear on a stop must otherwise keep its meaning.

### B. Carried from `pre-pr-review-4.md`
Needs Further Investigation A (the overlap form of A above), B (the pedal's Fade out while the fade rises) and C stand as written there; this branch does not touch them.

## Reviewed and Dismissed
- The first set read arriving right after a brace-end report while playing (`:408-412` clears `wrapFrom`, then the next report is judged from `now(braceEnd)`; `cues.ts` raises the Count Off). Pre-existing; only the first read after the server starts can land while playing (`if (set && playing) return`), and the server reads the set as soon as Live connects, so a Fade out, a loop braced by hand over the gap and a report on its brace end would all have to fall before that first read answers. No plausible user path. The clear must keep its meaning; do not special-case it.
- The first report after a connect landing in a Count Off: the controller brings the music back and `cues.ts` raises nothing. Deliberate and documented at `src/server/cues.ts:55-58` ("nor for the section the playhead was already in when ... Live comes back"). Untouched.
- A first report on the brace end with the position unknown (harness case D, HEAD now brings the music back). Unreachable: a lost Live sets `playing = false` and `liveLoop.on = false` (`:388-390`), and on reconnect Live reports the position before `is_playing` and the loop (#165 body), so `onBraceEnd` is false on that report.
- Two brace-end reports in a row from the gap: `{ from: null }` carries through; the next move into the Count Off brings the music back, as in the single-report case.
- A loop whose start lies in song 1 (8 to 36, 0 to 36, 24 to 36): HEAD and the base call `countOff` identically, and `startedSong` is cleared identically.
- The loop braced over the gap still going round: the wrap to 32 is no section, so nothing fires on HEAD or the base.

## Minor / nits
- `test/fade-brace-end-gap.test.ts:58-66` and `:98-106` repeat the Fade-out-to-silence setup; the sibling file has `loopedAndSilent()` and `comesBackFrom()` (`test/fade-brace-end.test.ts:117`, `:128`). The ticket body dictated the file verbatim. Finding 1's helper can absorb it.
- `src/server/playback-controller.ts:142`, the field name `from` reads as `wrapFrom.from`; `cues.ts:155` calls the same value `now`. Naming only.
- `test/fade-brace-end-gap.test.ts:91` asserts `steps.every(...)` with `.toBe(true)`, so a failure does not say which step fell (the same shape as `test/fade-brace-end.test.ts:136`).
- The control case asserts `now` and `fade` but not the volume ramp. Enough for a control.

## Test quality
Tests added: 2, in `test/fade-brace-end-gap.test.ts`. Green against `00793f4`: 1, the control, by design; the mutant `if (false) enteredCountOff(...)` turns it red, so it guards the plain move into the Count Off. Red at the base: case 1 (`expected 'silent' to be 'in'`), and red again with only the fix reverted (`repro/review-5-mutation-gap-from-dropped.diff`). Tautology shapes: none. Coverage gap: finding 1.

## Before opening the PR
- **CI readiness:** lint, typecheck, test (949 passed) and build green locally; Playwright green (42). CI runs the four Linux-only refusal cases this Mac skips.
- **Commit hygiene:** clean tree. This doc, `repro/review-5-gap-jump-landing.test.ts` and `repro/review-5-mutation-gap-from-dropped.diff` are the only additions.
- **Likely reviewer asks:** whether Live reports a position on a brace end (the #156 and #165 fixes rest on it); what a stop on the brace end does (Needs Further Investigation A).

## Verdict
**Ready to open the PR, with follow-ups.** Nothing at MEDIUM or above, so nothing gates the PR. The #165 fix meets its three acceptance criteria and its test can go red. Finding 1 (two test cases for paths the fix already repairs) and finding 2 (one comment line) can ride a remediation pass or a follow-up ticket. Needs Further Investigation A needs real Live before anyone changes the clear on a stop.
