# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `98f15c4` "Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing")
**Reviewed at:** HEAD `623753d` (setlist-controller#108 pre-PR review 11 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 82 files total, +17117 / -73 against the merge-base (11 of them earlier review docs, 14 repro scripts).
**Delta under review:** since `e2433af` (setlist-controller#330 Lights: the active cues kept after a cue recorded at the console include cues Eos left and never age out), the commit pre-PR review 11 reviewed. Delta: 5 files, +338 / -5: `src/server/eos.ts` (+6 / -5) and `test/eos.test.ts` (+19) from `d715230` (setlist-controller#108 pre-PR review 11 finding 1: with no live cue, the producer's Go paused the lights when Eos named the cue active before its fire event), and review 11's doc and repro scripts (`7296824`, `623753d`). Stage 2 round 2 of the eighth `/epic-loop` run.
**Reviewed against:** pre-PR review 11 (its finding 1 brief, its Approach decisions, its closure table), the epic body of setlist-controller#108, and the recordings described in `test/fixtures/eos/README.md`. The repo has no `CLAUDE.md`, no `CONTEXT.md`, no ADRs and no coding standards file, so the five shared review rules stand in for them.
**Date:** 2026-11-06
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test`, three runs 60 s apart at load averages of 74 to 80, 49 and 45 | never fully green: run 1, 3 red; run 2, 16 red; run 3, 1 red (2026 passed, 4 skipped). Every red test is in `test/propresenter.test.ts` or the set builder tests, files the delta does not touch; all but the JSON check are 5000 ms timeouts; each test red in one run passed in another. Flakes under load, the same tests as `.epic-loop/flaky-*.md` |
| Build and Playwright | `pnpm test:e2e` (builds first) | built; 66 passed |
| `test/eos.test.ts`, `test/fake-eos.test.ts` at HEAD | finder, and with the fix below | 200 passed (finder, `eos.test.ts`); 220 passed with the recommended fix |
| The two new tests against `eos.ts` from `e2433af` | scratch worktree at HEAD with `src/server/eos.ts` from `e2433af`; `vitest run test/eos.test.ts -t "never pauses on the producer's Go with no live cue"` | "its active cue before its fire event" red; "its fire event alone" green (a guard of the no-live-cue rule) |
| The guard's other effects (finder) | a direct harness of `eosKind().create(...).target` against `test/fake-eos.ts`, show 1, 2 (follow), 3, 4 (link `2/1`), 5, no live cue, the fake's answers held; eleven scenarios at `e2433af` and at HEAD; harness not kept | four new false pauses and two lost pauses at HEAD; three controls equal (finding 1, and Dismissed) |
| Finding 1 | `sh docs/reviews/setlist-controller-108/repro/review-12-repro.sh` | red at HEAD ("expected false to be true" at `neverPaused`); green with `eos.ts` from `e2433af` |
| Finding 1's recommended fix | the two-line fix in a scratch worktree; `vitest run test/eos.test.ts test/fake-eos.test.ts`; `eslint src/server/eos.ts`; both repros with the fixed `eos.ts` | 220 passed; lint clean; `review-12-repro.sh` green; `review-11-repro.sh` f1 and control green |
| A Go with no answer, then the follow past the window (finder's S8) | the same shape through `lightsRig` (`clock.advance(OWN_COMMAND_WINDOW_MS + 1)`) | green at HEAD, where the finder's harness paused. Not settled (Needs Further Investigation A) |
| The reconnect judgement under the guard | reading `sendOwn` (`src/server/eos.ts:223-230`) and the close (`:664-673`) | whenever `own` is not empty, `before` is null and `beforeOwn` empty, so the skipped branch never had a judgement to make (#254 intact) |
| Comments and docs stating the rule | `grep -n -i "active cue"` over `src/server/eos.ts`, `README.md`, `docs/install.md`, `test/fixtures/eos/README.md` | `eos.ts:365-369` updated; `test/fixtures/eos/README.md:62` and `:98` still state the old rule (finding 6) |
| What Eos sends for a Go at connect, a Go from 1/0, and review 11 A | not run: no ETCnomad here | Needs Further Investigation B |

**Overall:** review 11 finding 1 is fixed: the producer's Go with no live cue no longer pauses when Eos names the cue active first, proved red to green. The guard that fixed it has one side effect: an active cue it skips is lost to the follow judgement and the other-list Go, so a few shapes that start in the few milliseconds after a reconnect now pause falsely or miss a pause. That is LOW, with an audited two-line fix. No MEDIUM or higher this round; the PR still waits on #140.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254, review 3 finding 1, #268, #271, #273): the cue Eos is on at connect is judged once against `before`, `beforeOwn` and the `firedAfter` chain of each. Wrap, Go From Last and Back From First expect every outcome, since #286 proved Wrap unreadable over OSC.
- Own-command accounting (#137, #138, #273, #287): a fire event uses up the first pending own command that accounts for it, with every command before it. A Go or Back accounts for a cue it fires from the live cue by the cue list as last read, the cue the live cue's follow fires included, and for any cue when the live cue cannot be placed. A fire by number of the cue takes the event from an earlier Go or Back that reaches it only past an end of the list. The follow's event uses up a Go that could have fired it (#273, pinned by `test/eos.test.ts:2593` and `:2606`). This review keeps that.
- The live cue from the active cue (#250, review 11 finding 1): the numbered active cue stands in for the live cue only while there is none and `own` is empty; with a command pending, its fire event places the live cue. This review adds: while the live cue is unplaced, the follow judgement (`followed`) and the other-list Go judge from the last cue Eos named active (`named.at(-1)`), the cue the live cue would have been without the guard; the accounting of `answers` and the re-judge still use the unplaced live cue, so a Go with no live cue still answers with any cue (finding 1). Precedent: the re-judge's `activeBefore` already reads `named` for the cue Eos is on.
- Cue edits (#287, review 9, review 10, #330): `/eos/subscribe 1` on every connect; any `/eos/out/notify/cue/<list>/...` re-reads the whole list, and once that read finishes in full the check runs again (#329). An unexplained fire event while a Go or Back is pending takes the first pending Go or Back at once, with every command before it, and judges it again after a fresh read.
- Active cues after an edit (review 9, #330): kept in order, cleared on each fire event and on a close, never aged out by time (Nick, 2026-11-06, on #330).
- The racing fire by number (#327): the second identical fire event of a cue the lights fired by number as the live cue's follow fired it, within the window, is the same fire; a third, one after the window, or one of another cue pauses.
- A link to another list (#328): argument 19 as a string `"<list>/<cue>"` names a cue outside the list unless its list is this one; a Go from such a cue fires no cue of the list, and its answer is a fire event of another list, a stand-in until it is recorded.
- The fake's `editShow` (review 9), cue 0 (#288), shadowed cues (#252, #258), the file check shape (#256 and the #84 merge), and new adapter tests through `lightsRig` and the fake Eos: as in pre-PR review 11.

## Confirmed Issues
### 1. An active cue skipped while a command is pending is lost to the follow judgement, so the next follow can pause, and a racing fire by number pauses on its echo — LOW
- **Location:** `src/server/eos.ts:450` (the guard), with `:386` (`followed`) and `:429` (the other-list Go)
- **Attribution:** introduced by the remediation, `d715230` (`git log -S'own.length > 0) return;' e2433af..HEAD -- src/server/eos.ts`). At `e2433af` the active cue set `live` whatever was pending. Not a known regression: review 11's closure table lists none, and its brief's "When the fix's own path fails" named only "no live cue line until the next fire event", not the judgements made from that missing cue.
- **Real-world trigger:** the live cue is null with a command pending and a numbered active cue arriving only between Eos's first packet after a connect (which sets the row online) and the connect burst's active cue: 8 ms in `connect.json` (`/eos/out/user` at 36 ms, `/eos/out/active/cue/1/8` at 44 ms), and only when those arrive in separate TCP reads. A fire by number the server hands over in a song with dense cues is the likeliest command to land there. Then, if the cue Eos is on has a follow: the racing fire by number pauses on its second fire event; a Go answered by a resume or a Back by a stop is followed by a false pause on the follow. If it links to another list, a Go answered by that list stays pending and swallows the next console fire (a lost pause). LOW, capped: no plausible user path beyond that window. Upgrade to MEDIUM if the burst's active cue is recorded later than a few ms after Eos's first packet, or after a gap a timed cue can fall into; check by recording a reconnect at #140's session.
**Evidence**
```ts
      const from = live?.number ?? null;
      const followed = firesNext(from) === number;
...
      named.push(active[1]!);
      if (live !== null || own.length > 0) return;
```
**Failure mode** — no live cue, FOLLOWED_3 (cue 3 follows into 3.5); Go held; Eos names cue 3 active (skipped, `own` holds the Go); the resume event answers the Go and empties `own`; 3's follow fires 3.5. `from` is null, so `followed` is false, no command is pending, and `changedByHand()` runs. At `e2433af` the active cue made `live` 3, so `followed` was true. Proved: `review-12-repro.sh` red at HEAD at `neverPaused`, green with `eos.ts` from `e2433af`. The finder's direct harness also measured at HEAD vs `e2433af`: a Back answered by stop then the follow (pause, was none); a fire by number of 3 racing 2's follow, two fire events of 3 (pause, was none); a Go from cue 4 linked to `2/1`, answered by `/eos/out/event/cue/2/1/fire`, then a console fire of 5 (no pause, was one). Not kept.
**Recommended fix** — judge the follow and the other-list Go from the last cue Eos named while the live cue is unplaced:
```diff
       const from = live?.number ?? null;
-      const followed = firesNext(from) === number;
+      const followed = firesNext(from ?? named.at(-1) ?? null) === number;
```
```diff
     if (elsewhere && elsewhere[1] !== String(cueList)) {
-      const from = live?.number ?? null;
+      const from = live?.number ?? named.at(-1) ?? null;
       answers((command) => command === 'go' && linksOutside(from));
```
**Remediation brief**
- **Design intent:** a Go or Back with no live cue answers with any cue, since Eos picks it, and the guard keeps a Go's own fire event from being judged from the active cue Eos names just before it (review 11 finding 1). Every other judgement that took the cue Eos is on from the active cue before the guard, the follow (`followed`, which also sets the echo of #327) and the Go from a cue linked outside (#328), must still see it; `named` holds every cue Eos named since the last fire event, and is read before it is cleared at `:388`. With the live cue placed, nothing changes; with nothing named, nothing changes.
- **Full surface:** `src/server/eos.ts:386` and `:429`, the two diffs above. The comment at `:365-369` gains "; until then, the follow and the Go from a cue linked outside are judged from the last cue Eos named". The test goes into `test/eos.test.ts`'s describe "the fire event that answers the lights' own Go and Back" (`:2293`): `review-12-repro.sh`'s test, under a descriptive name. Optional, if a shape fits the rig: the racing fire by number with no live cue in "a fire by number that races the live cue's follow onto the same cue" (`:1706`), and the linked-cue Go in "a cue linked to a cue in another list".
- **Must preserve:** `from` itself stays `live?.number ?? null` for `answers` (`:399-405`) and for the re-judge (`:421`); reading `named` there would bring back review 11 finding 1 (`review-11-repro.sh` f1, and `test/eos.test.ts:2297` "never pauses on the producer's Go with no live cue, answered with its active cue before its fire event"). `named.push` stays before the guard (`test/eos.test.ts:2516`). The reconnect judgement in the active branch is untouched. `activeBefore` (`:387`) is computed from `named` before `named = []`; the new read sits on the line before it, also before the clear.
- **When the fix's own path fails:** `named.at(-1)` is a cue recorded at the console with no fire event (#330's shape) while the live cue is unplaced; the follow is then judged from that cue, as `e2433af` judged it from the same cue as the live cue. A Go with no answer at all leaves the live cue unplaced until the next fire event, as now.
- **Do not touch:** the guard at `:450`; the follow use-up of a Go (#273), see pre-PR review 11 Reviewed and Dismissed bullet 1.
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-12-repro.sh` red now and green after; `sh docs/reviews/setlist-controller-108/repro/review-11-repro.sh` stays green; `pnpm exec vitest run test/eos.test.ts test/fake-eos.test.ts` green (220 with the fix and before the new test; executed); `followed`'s change reverted in a scratch worktree turns the new test red.
- **Escalation:** the live-cue and own-command logic of `src/server/eos.ts:379-460` has now been rewritten in response to reviews in #273, #287, #327, #328, #330 and review 11, and this finding came from the last of those. If remediating it yields another finding in the same branch, stop and recommend a split ticket with its own test matrix, recorded against Eos at #140's session, rather than another in-place fix.

### 2. Four rules of the #327, #328 and #330 work have no test that fails without them (carried from pre-PR review 11 finding 2) — LOW
- Untouched by the delta; deferred to Nick in review 11's closure table. The brief, mutants and proof stand as written in `docs/reviews/setlist-controller-108/pre-pr-review-11.md` finding 2, with `src/server/eos.ts` lines past `:365` now one higher (`:411` → `:412`, `:410` → `:411`, `:670` → `:671`) and `test/eos.test.ts` lines past `:2293` now 19 higher (`:2722` → `:2741`, `:2737` → `:2756`). `sh docs/reviews/setlist-controller-108/repro/review-11-mutants.sh <mutant>` still runs as written.

### 3. The fake Eos accepts what Eos was not recorded taking, and answers every Go, Back and follow with a bare fire event (carried from pre-PR review 11 finding 3) — LOW
- Untouched; deferred to Nick. Brief as in review 11 finding 3; `test/fake-eos.ts` is unchanged, so its lines stand. This finding is again why finding 1 went unseen: the fake never sends a numbered active cue around a resume or a stop.

### 4. The last assertion of the in-flight Go test cannot fail (carried from pre-PR reviews 10 and 11) — LOW
- Untouched; deferred to Nick. Brief as in review 11 finding 4, at `test/eos.test.ts:2585-2587` in "pauses for a cue fired at the console while a Go is in flight, when the Go is answered before the fresh read ends" (`:2572`); the re-judge's `reporter?.changedByHand();` is now at `src/server/eos.ts:423`.

### 5. Three Playwright assertions cannot go red for what their test names claim (carried from pre-PR reviews 6 to 11) — LOW
- Untouched; deferred to Nick. As in review 11 finding 5: `e2e/eos.spec.ts:45-46`, `e2e/lights.spec.ts:81`, `e2e/lights.spec.ts:49-71`.

### 6. Comment hygiene — LOW (aggregated)
Pre-PR review 11 finding 6's entries stand where their text still reads as quoted there (deferred to Nick), with `src/server/eos.ts` lines past `:365` one higher. This round adds:
- `test/fixtures/eos/README.md:62` — "The adapter takes the numbered active cue as the live cue until the first fire event" → "The adapter takes the numbered active cue as the live cue until the first fire event, unless one of its own commands is pending, when the fire event places it".
- `test/fixtures/eos/README.md:98` — "So the adapter takes the active cue as the live cue only while it has none, never after a fire event" → "So the adapter takes the active cue as the live cue only while it has none and none of its own commands is pending, never after a fire event".

## Needs Further Investigation
### A. A Go with no answer, then the follow past the window — confirm with a harness that matches the finder's
The finder's direct harness paused at HEAD on: no live cue, Go (no answer), Eos names 2 active, clock past 1500 ms, 2's follow fires 3. The same shape through `lightsRig` (`rig.clock.advance(OWN_COMMAND_WINDOW_MS + 1)` between the active cue and the fire event of 3.5 on FOLLOWED_3) stayed green at HEAD, so `own` was likely not pruned there; why is not known. Finding 1's fix covers the shape either way, since `followed` no longer depends on `own`. Confirm by logging `own.length` at the fire event in that rig test; kill if the rig's clock is not the adapter's.

### B. What Eos sends at a reconnect with a command in flight, a Go from 1/0, and review 11 A — confirm by recording each at #140's Augment3d session
Finding 1's cap rests on the gap between Eos's first packet and the burst's active cue (8 ms in `connect.json`). Record a reconnect while the app fires by number, and check whether the burst ever arrives in more than one read. Review 11 A carries unchanged.

### C. `e2e/lights.spec.ts:93-101` may race the list's own scroll effect — carried from pre-PR reviews 6 to 11
`pnpm exec playwright test e2e/lights.spec.ts --repeat-each 50` while `pnpm test` runs; kill with 50 clean runs.

## Reviewed and Dismissed
- A Back with no answer and no live cue, then a cue fired at the console within the window, no longer pauses (finder, S9) — the rule for no live cue: a Go or Back then answers with any cue. At `e2433af` the same press followed by the fire event alone, the order `fire-by-hand.json` records for a console fire, did not pause either; HEAD is consistent with the recorded order.
- The guard drops a reconnect judgement (finder, read) — `sendOwn` clears `before` and `beforeOwn` whenever it pushes to `own` (`src/server/eos.ts:227-229`), and the close empties `own` after moving it into `beforeOwn` (`:664-673`), so with any command pending there is nothing to judge.
- A command that never gets an answer blocks the live cue for good (finder, executed, S6 and S7) — `forgetUnanswered()` runs at the top of `receive`, before the guard, so a command older than the window stops blocking; the next active cue, as the percent sent once a second during a fade, places the live cue. Equal at `e2433af` and HEAD.
- With nothing pending, the active-cue branch behaves as before (finder, S5) — equal at both.
- Pre-PR review 11's Reviewed and Dismissed bullets stand, the follow use-up of a Go (#273) first among them.

## Minor / nits
- `test/eos.test.ts:2309` — the new test's 300 ms sleep before `neverPaused` has no margin: the old pause came after the re-judge's fresh read, so a read slower than 300 ms under load would let the active-first case pass against the pre-fix code. It went red here at load 80, so it can go red today. Waiting on the fresh read (the count of `rig.fake.answered` past the list's length) would remove the margin; the same sleep has precedent twice in the file.
- `test/eos.test.ts:2295` — the "its fire event alone" case is green against `eos.ts` from `e2433af`; it guards the rule that a Go with no live cue answers with any cue, and its name claims no more. Keep it.
- Review 11 finding 1's brief said the comment at `src/server/eos.ts:365-368` was "the only comment that states the rule"; `test/fixtures/eos/README.md:62` and `:98` state it too (finding 6).
- Every Minor item of pre-PR reviews 8 to 11 stands as written there.

## Test quality
Tests added since `e2433af`: 2 (one `it.each` in `test/eos.test.ts:2294-2311`). Against `eos.ts` from `e2433af`: the active-first case red, the fire-alone case green, a guard (Minor). No mock of the unit, no expectation computed with production code, no snapshot, no comment or log read. Tautology shapes found: 0 new; finding 4 carried. The guard's fallback path, an active cue skipped while a command is pending, had no test; finding 1 adds one.

## Prior-review closure
Pre-PR review 11 (`7296824`, reviewed at `e2433af`) had 1 MEDIUM and 5 LOW. Finding 1 (MEDIUM) is fully fixed by `d715230`: f1 is red at `7296824` and green at HEAD, the repro's tests are in `test/eos.test.ts`, and the comment that states the rule was edited; the guard's side effect is this review's finding 1 (LOW, introduced by the remediation). Findings 2 to 6 (LOW) are untouched, deferred to Nick in review 11's closure table, and carried as findings 2 to 6. None was "resolved" by editing a comment or doc. MEDIUM or higher left partially fixed or untouched: 0.

## Before opening the PR
- **CI readiness:** the repo has no CI. Lint, typecheck, the build and Playwright (66) are green at `623753d`; `pnpm test` never went fully green in three runs at loads of 45 to 80, every red outside the delta and each red test green in another run (flakes).
- **Commit hygiene:** this doc and `repro/review-12-repro.sh` are the only additions; nothing to drop.
- **Likely reviewer asks:** why the live cue waits on the fire event while a command is pending, and what judges a follow meanwhile (finding 1); #273's and #330's accepted look-alikes; the other-list Go stand-in (#328); #140's install doc and acceptance run.

## Verdict
**Ready with follow-ups.** 0 CRITICAL, 0 HIGH, 0 MEDIUM, 6 LOW. Review 11's MEDIUM is closed and proved. Finding 1 is the remediation's own side effect, reachable only in the few milliseconds after a reconnect, with an audited two-line fix (220 passed, both repros green); it can land before the PR or as a follow-up, and its escalation note applies if it yields another finding. Findings 2 to 6 are the carried LOW tail, Nick's. The Confirmed list shrank to one new LOW, as a converging branch's should. The PR still waits on #140, which is Nick's.
