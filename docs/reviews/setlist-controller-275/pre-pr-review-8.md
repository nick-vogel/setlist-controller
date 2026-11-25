# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line (delta review after review 7's remediation)

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `98f15c4`, Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing)
**Reviewed at:** HEAD `952c95b` (setlist-controller#275 pre-PR review 7 remediation closure table). Clean tree: no uncommitted or untracked files at the start. Against the merge-base: 44 files, +6911 / −432, 81 commits. Outside `docs/reviews/`, the code, data, fixtures and docs are 26 files, +5528 / −432. This review adds this doc and 3 files under `repro/`.
**Delta under review:** since `eaeaab2` (setlist-controller#326 The slide timing title check reads ProPresenter's library list in the OpenAPI shape, so it finds no library on the real ProPresenter), the HEAD `pre-pr-review-7.md` reviewed. The delta is `17b80de` (review 7 itself), `f65ae3a` (setlist-controller#275 pre-PR review 7 finding 1: a signature report while Live plays gives the song Live leaves the next song's meter when the carried-on playhead falls just short of the change) and `952c95b` (the closure table). Outside `docs/reviews/`: 2 files, +29 / −6 (`src/server/playback-controller.ts`, `test/pre-service-check.test.ts`).
**Reviewed against:** epic `nick-vogel/setlist-controller#275` as distilled in `pre-pr-review-7.md`; review 7 finding 1's brief and its Approach decisions in full; review 7's closure table; the recorded AbletonOSC order log `~/Library/Logs/setlist-controller/2026-11-06-osc-order.log` (#284 step 6). No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply.
**Date:** 2026-11-06
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `952c95b` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 70 files, 1900 passed, 4 skipped, first run, no flake |
| Build | `pnpm build` | clean |
| E2E | `pnpm test:e2e` (OS-assigned ports) | 56 passed |
| Review 7 finding 1's new test against the code before the fix (Phase 4.5) | HEAD's `test/pre-service-check.test.ts` in a scratch worktree at `eaeaab2`, `pnpm exec vitest run test/pre-service-check.test.ts -t "falls just short of the change"` | red: `expected { '1': 4, '2': 4 } to deeply equal { '1': 3, '2': 4 }`. Finder: red with the one re-target line removed and nothing else, so it pins the fix |
| The new test's timing line | finder, by arithmetic on the manual clock | holds: 31.75 + 120 ms × 120 / 60000 = 31.99, in song 1 |
| Mutants of the re-target's guard (finding 1) | scratch worktree at `952c95b`: A, the guard `settlingCarried` replaced by `settlingSong !== null`; B, `settlingCarried = true` in place of `= playing`; C, `settlingCarried = false` removed from `dropMeter`. `pnpm exec vitest run test/pre-service-check.test.ts test/propresenter.test.ts test/connections.test.ts test/cue-lateness.test.ts` | all three: 351 passed. No test pins the guard or its reset |
| Finding 1's proof | `repro/review-8-finding-1-test.diff` (two stopped clicks inside `METER_SETTLE_MS`) at HEAD, at `eaeaab2`'s controller, and under mutants A and B | green at HEAD and at `eaeaab2`; red under A and B: `expected { '1': 3 } to deeply equal { '1': 3, '2': 4 }` |
| Differential harness, base `eaeaab2` vs HEAD (finder) | `startPlaybackController` driven directly with `manualClock` over 16 report orders, `meters()` recorded after every report | the fix differs from `eaeaab2` only where intended (short prediction, short of a Pad, a waiting-jump landing, a numerator-led half order, a tempo first); every other order the same. Detail under Reviewed and Dismissed |
| A loop wrap on the brace end at the next song's start (finding 2) | `repro/review-8-finding-2-test.diff` at HEAD, and with `98f15c4`'s controller | red at HEAD: `expected { '1': 3, '2': 3 } to deeply equal { '1': 3 }`; at `98f15c4` red as `controller.meters is not a function`, since the meters are this branch's (#293) |
| Finding 2's recommended fix | `repro/review-8-finding-2-candidate.diff` with the new test, scratch worktree, `pnpm test` | the new test green; 70 files, 1901 passed, 4 skipped |
| The played report order in the home log | `sed -n 1695,1712p` of the order log | tempo 289.5070, numerator 289.5071, denominator 289.5073, position 289.5076: both halves lead the position, 0.5 ms in all |
| Carried repros still apply | `git apply --check` on `repro/review-5-finding-2-test.diff`, `review-5-finding-2-candidate.diff`, `review-6-finding-1-mutant-no-early.diff`, `review-6-finding-1-mutant-no-due.diff` | all apply; the delta touches neither `src/server/propresenter.ts` nor `src/server/connections.ts`, so review 7 findings 2 to 5 stand unchanged |
| Shipped copy | `git diff eaeaab2 -- . ':!docs/reviews' \| grep -c '^+.*—'` | 0 |
| Not run | the real Live, a loop wrap on Live | the guardrails forbid driving Live, and the home log holds no played loop, so whether Live reports the brace end itself on a wrap (finding 2's cap) is not measured |

**Overall:** Review 7's one MEDIUM is fixed against its intent: while Live plays, the position report after a signature now chooses the song, the new test is red without the fix, and every full check is green. Nothing new is MEDIUM or higher. The fix's own guard (a stopped Live is never re-targeted) and its reset carry no test, so three mutants of them pass every meter suite (finding 1, LOW, with a proved test). A loop that wraps on the next song's first locator stamps that song with the looping song's meter, from #293's meter mechanism (finding 2, LOW capped, proved, with a proved fix). Review 7's four LOW findings and its comment hygiene, deferred as the LOW tail, are carried unchanged. The branch can open its PR; the LOWs can ride along or become follow-ups.

## Approach decisions
- Carried from review 4: the End inside the crossing's lead is judged by `droppedEnd`, by the crossing itself and by whether the change remembered as sent early is the crossing or a later change of the next song. Unchanged.
- Carried from review 3, recommended, still not worked: a library body with no `items` list reads as "could not be read", never as an empty library, extended in review 7 to a `GET /v1/libraries` list whose entries carry no name (finding 4).
- Carried from review 5, applied in `a1bcc5b`: a drag back inside a section that clears hands the section's clear only when the landing is before the change sent early's send point (`!due`), the plan holds no slide, and a change was sent early. Unchanged.
- Carried from review 5, recommended, still not worked: the second pass of `resolveTiming` judges entries in section order, each `start` against the section before as its entry stands once judged (finding 3).
- Carried from review 7, applied in `f65ae3a`: a signature reported while Live plays holds the song at the predicted playhead, and the next position report re-targets the held meter to the song it lands in before the commit at the top of `fromLive`; `settlingCarried` records that, set to `playing` on each signature half and cleared by `dropMeter`. The prediction stands when the settle timer, a stop or another report that is not the tempo or a signature commits first. Precedent: the position case's own `settleMeter(meterSong(position))`. This review keeps it and adds tests (finding 1). The finder's alternative, dropping the held meter on the re-target so the position case's own `settleMeter` holds it to the next report, is not adopted: the home log puts both signature halves before the position, so committing on that report never takes half a signature, and it was not run.
- New (finding 2, recommended): a position report on Live's brace end that is Live's loop going round (`onBraceEnd`) chooses no song for a meter, in the position case and in the re-target, since Live wraps there and never plays into the section that starts on it. Precedent: `onBraceEnd`'s own use in the position case, which already keeps a wrap's report from entering a Count Off (`enteredCountOff` behind `!wrapping`).

## Confirmed Issues

### 1. The re-target's stopped-Live guard and its reset have no test, so three mutants of them pass every meter suite — LOW
- **Location:** `src/server/playback-controller.ts:651` (the guard `settlingCarried`), `:756` and `:763` (`settlingCarried = playing;`), `:267` (`settlingCarried = false;` in `dropMeter`)
- **Attribution:** introduced by `f65ae3a` (setlist-controller#275 pre-PR review 7 finding 1: …). `git show eaeaab2:src/server/playback-controller.ts | grep -c settlingCarried` is 0. Review 7's brief said the stopped-click test (`test/pre-service-check.test.ts:327`) pins the guard ("`settlingCarried` stays false, so a click within 50 ms of another click is not re-targeted"); that test makes one click, so it does not.
- **Real-world trigger:** none on stage today, since the code is right; it is a regression that would stay green. A guard dropped in a later rewrite would show as a stopped Live where two clicks or two leader taps land within 50 ms: the second song takes the first's signature, and the first's song is never stamped. The check would then judge it as "meter not read yet" or on the wrong bar. LOW.

**Evidence**
```ts
      if (event.kind === 'position' && settlingCarried) settlingSong = meterSong(event.beats);
      const settled = !comesWithMove && !goneAway && commitMeter();
  ...
          settleMeter(meterSong(signaturePlayhead()));
          settlingCarried = playing;
```
**Failure mode** — executed in a scratch worktree at `952c95b`: mutant A (the guard replaced by `settlingSong !== null`), mutant B (`settlingCarried = true`) and mutant C (no reset in `dropMeter`) each leave `test/pre-service-check.test.ts`, `test/propresenter.test.ts`, `test/connections.test.ts` and `test/cue-lateness.test.ts` at 351 passed. `repro/review-8-finding-1-test.diff` stops Live in 6/8 in the first song, clicks to 40 (second song, Live reports 4/4), then to 12 (first song, Live reports 6/8) before `METER_SETTLE_MS`: green at HEAD and at `eaeaab2`, red under A and B with `{ '1': 3 }` for `{ '1': 3, '2': 4 }`. The finder's harness also showed the re-target into a Pad (a prediction short of a Pad, the next report inside it) differs from `eaeaab2` (`{1:4,2:4}` before, `{1:3,2:4}` now) with no test, since the only Pad test (`:405`) runs stopped; and no test commits a played signature by the settle timer.

**Recommended fix** — tests only, no code change:
1. `git apply docs/reviews/setlist-controller-275/repro/review-8-finding-1-test.diff` (pins mutants A and B).
2. A test for the reset (mutant C): Live plays across a signature change, stops before any position report (the stop commits the predicted song), then makes the two quick stopped clicks of test 1. Confirm it red under mutant C before keeping it; if the meters cannot tell C apart in that order, assert on `target.meters.slice(checks)` as `:327` does, which also sees a wrong intermediate run.
3. A played twin of the Pad test at `:405`: `PAD_SONGS`, Live playing in 6/8 with its last report on 23.75, 120 ms on (prediction 23.99, short of the Pad on 24), Live reports 4/4, then 24.25, then stops; expect `{ 1: 3, 2: 4 }` (red at `eaeaab2` per the finder).
4. A timer fallback test: as the review 7 test at `:273` but 200 ms on (prediction past the change), Live reports 4/4, the clock advances `METER_SETTLE_MS` before any position, then 32.25 and a stop; expect `{ 1: 3, 2: 4 }`.

**Remediation brief**
- **Design intent:** while Live plays, a signature leads the position past a meter change (home log: both halves 0.3 to 0.5 ms before the position), so the position report after a played signature is Live's own word on where the playhead was and chooses the song; the predicted playhead stands only when the settle timer, a stop or another committing report comes first. Stopped, the position leads, so a signature belongs to the last position and no later position may re-target it; that is what `settlingCarried = playing` and its reset in `dropMeter` keep.
- **Full surface:** `test/pre-service-check.test.ts`, `describe("a song's meter")`: the new tests beside `:327` (stopped clicks), `:405` (Pad) and `:273` (review 7's test). No source change.
- **Must preserve:** every test in `describe("a song's meter")`, in particular `:273` (review 7 finding 1's proof), the three #304 tests and `:327`; `test/propresenter.test.ts` meter tests (`grep -n "METER_SETTLE_MS" test/propresenter.test.ts`).
- **Do not touch:** the re-target line and the commit order at `:651-652`; `METER_SETTLE_MS`; the finder's "drop on re-target" alternative (Approach decisions).
- **Proof:** each new test green at HEAD and red under its mutant, in a scratch worktree: `pnpm exec vitest run test/pre-service-check.test.ts -t "<title>"`, with mutant A `perl -pi -e "s/if \(event.kind === 'position' && settlingCarried\) settlingSong/if (event.kind === 'position' \&\& settlingSong !== null) settlingSong/" src/server/playback-controller.ts`, mutant B `perl -pi -e "s/settlingCarried = playing;/settlingCarried = true;/" src/server/playback-controller.ts`, mutant C `perl -0pi -e 's/settlingSong = null;\n    settlingCarried = false;/settlingSong = null;/' src/server/playback-controller.ts`. The Pad twin is red with the line at `:651` removed.

### 2. A loop that goes round on the next song's first locator gives that song the looping song's meter — LOW
- **Location:** `src/server/playback-controller.ts:716` (`settleMeter(meterSong(position));` in the position case), `:651` (the re-target, which reads the same `meterSong(event.beats)`)
- **Attribution:** introduced by this branch: the per-song meter is `d947b67` (setlist-controller#293 The pre-service check and the slide timing file use each song's own meter), its settle shape `7a1222d` (setlist-controller#304 …). At `98f15c4` the controller has no `meters()` (the proof test fails there as `controller.meters is not a function`). Outside review 7's delta and not touched by `f65ae3a`; first found here, by the finder's harness at both `eaeaab2` and HEAD.
- **Real-world trigger:** the leader loops a song's last section where the song flows into the next by an overlap, so the brace end sits on the next song's Count Off (the case `onBraceEnd`'s comment names), Live reports a position on the brace end as it wraps, and the songs differ in meter. The next song is then stamped with the looping song's meter, and every wrap stamps it again. If Live then stops in the loop, the check reruns with that song on the wrong bar: false "changed on beats" notes and slide timing entries reported as problems, until the playhead enters that song. Playing on into the song re-stamps it on entry, so no slide on stage is known to move (a crossing's pickup planned meanwhile uses the same meter `planOf`'s fallback would, review 7 NFI C). LOW, capped: upgrade to MEDIUM if Live reports the brace end itself on a wrap rather than only by chance within `EPSILON` (1e-4 beats), check by recording a loop wrap in the AbletonOSC order log, which today holds none.

**Evidence**
```ts
        case 'position': {
          // Judged on the jump still waiting, before this report lands it.
          const wrapping = onBraceEnd(event.beats);
          ...
          if (!wrapping) enteredCountOff(before, now(position), event.beats);
          sendCountIn();
          settleMeter(meterSong(position));
```
**Failure mode** — executed: `repro/review-8-finding-2-test.diff` adds to `describe("a song's meter")` in `test/pre-service-check.test.ts` a test with `TWO_SONGS` (song 2's Intro on song 1's End, 32) in 6/8, Live looping song 1's Verse (16 to 32), playing with reports on 31.75, 32 (the brace end) and 16.25, then stopped. Meters: `{ 1: 3, 2: 3 }`, not `{ 1: 3 }`.

**Recommended fix** — `repro/review-8-finding-2-candidate.diff`:
```diff
-      if (event.kind === 'position' && settlingCarried) settlingSong = meterSong(event.beats);
+      if (event.kind === 'position' && settlingCarried && !onBraceEnd(event.beats)) settlingSong = meterSong(event.beats);
@@ case 'position'
-          settleMeter(meterSong(position));
+          settleMeter(wrapping ? null : meterSong(position));
```
With the new test: green; `pnpm test` 70 files, 1901 passed, 4 skipped. The `meterSong` comment and the `meters()` comment on `PlaybackController` (`:44-53`) should say a wrap's report on the brace end gives no song its meter; that wording belongs in the comments the remediator edits, not in this diff.

**Remediation brief**
- **Design intent:** a song's meter is Live's signature while the playhead is inside that song, outside its Pad and Pad Out. A report on the brace end while Live's loop goes round sits in the section that starts there, but Live wraps and never plays into it (`onBraceEnd`), so that report is inside no song for a meter, as it already enters no Count Off.
- **Full surface:** `src/server/playback-controller.ts:651` (the re-target: `onBraceEnd` reads state from before the report, as the position case's first line does, so calling it at the top of `fromLive` judges the same report the same way), `:716`, the comments at `:44-53` and above `meterSong` (`:229-231`); `test/pre-service-check.test.ts`, the test from `repro/review-8-finding-2-test.diff`.
- **Must preserve:** a held meter on a wrap stays held as the candidate leaves it at the re-target (no re-target, so the held song commits as before) and is dropped by the position case's `settleMeter(null)` (the wrap's report commits it first at `:652`); a waiting jump landing on the brace end is a landing, not a wrap (`onBraceEnd`'s `lands`), so it still stamps the target; every test in `describe("a song's meter")`; the loop and wrap tests in `test/cue-lateness.test.ts` and `test/fade-brace-end-gap.test.ts`; `pnpm test`.
- **Do not touch:** `onBraceEnd` itself and `near`'s `EPSILON`; `wrapFrom` and `enteredCountOff`.
- **When the fix itself fails:** a wrap reported a hair past the brace end, outside `EPSILON`, is not `onBraceEnd`, so it lands at the loop start and stamps the looping song, which is right.
- **Proof:** from the repo root, in a scratch worktree at HEAD: `git apply docs/reviews/setlist-controller-275/repro/review-8-finding-2-test.diff && pnpm exec vitest run test/pre-service-check.test.ts -t "brace end out of"`: red, `{ '1': 3, '2': 3 }`. Then `git apply docs/reviews/setlist-controller-275/repro/review-8-finding-2-candidate.diff` and the same command: green; `pnpm test`: 1901 passed.

### 3. The slide timing check judges a `start` against entries it drops in the same pass, so a valid start can be dropped as "passes null" — LOW
Review 7 finding 2, deferred as the LOW tail and untouched by the delta. Location, attribution (`e56a8f7`, setlist-controller#301), trigger, cap and brief unchanged from `pre-pr-review-7.md` finding 2 and `pre-pr-review-5.md` finding 2; `repro/review-5-finding-2-test.diff` and `repro/review-5-finding-2-candidate.diff` still apply.

### 4. A library answer with no `items`, or a library list whose entries carry no name, reads as an empty library, so every title outside the set becomes a false typo — LOW
Review 7 finding 3, deferred as the LOW tail and untouched by the delta. Brief unchanged from `pre-pr-review-7.md` finding 3.

### 5. The queue tests wait on real time, so a press or cue sent early under load can pass, and a slow machine can turn them red with no bug — LOW
Review 7 finding 4, deferred as the LOW tail and untouched by the delta. Brief unchanged from `pre-pr-review-7.md` finding 4.

### 6. Carried test gaps from review 6 — LOW
Review 7 finding 5, deferred as the LOW tail and untouched by the delta. Brief unchanged from `pre-pr-review-7.md` finding 5; the mutants `repro/review-6-finding-1-mutant-no-early.diff` and `repro/review-6-finding-1-mutant-no-due.diff` still apply.

### 7. Comment hygiene — LOW (aggregated)
Review 7 finding 6's first seven entries, untouched, carried as written there (its eighth landed in `f65ae3a`). New:
- `src/server/playback-controller.ts:48-50` → "goes to the song of the playhead's next report, or, with none, to the song the playhead has reached by then" → "goes to the song of the playhead's next report, or to none when that report is in a Pad; when the settle timer, a stop or another report of Live's commits it first, to the song the playhead has reached by then"
- `src/server/playback-controller.ts:129-131` → "whether a signature reported while Live played chose it, so the playhead's next report chooses it again" → "whether a signature reported while Live played chose it, held song null included, so the playhead's next report chooses the song in its place"
- `src/server/playback-controller.ts:273-275` → "so the position report Live sends next chooses the song in its place, and it stands only when none comes before the meter settles" → "so the position report Live sends next chooses the song in its place (fromLive), and it stands only when the meter settles before one comes"

## Needs Further Investigation
Review 7's A to E stand unchanged: the delta touches neither `src/server/propresenter.ts` nor `src/server/connections.ts`, and none of them reads the re-target. See `pre-pr-review-7.md`, Needs Further Investigation A to E, for each one's confirming test and fix candidate.

## Reviewed and Dismissed
- The settle timer commits the predicted song when Live's next position report comes more than `METER_SETTLE_MS` (50 ms) after the signature, so the original miss survives there (finder S3b). The accepted residue in review 7 finding 1's brief ("When the fix itself fails"); the home log puts the position 0.5 ms after the signature.
- A held null (a waiting jump, or a prediction in a Pad) with the flag set commits on the landing or next position report itself, one report earlier than at `eaeaab2` (finder S4, S14). Same final meters; a half signature could only be committed if a signature half trailed the position, and the home log has both halves lead it (lines 1703 to 1705). At `eaeaab2` a numerator-led half order left the song Live leaves with half a meter for good (finder S5); HEAD only passes through it.
- The flag surviving into a later report: every `settleMeter` and `commitMeter` goes through `dropMeter`, which clears it; it survives only the tempo and signature reports between a signature and its position (finder; a tempo first, S9, is right at HEAD).
- A stop, a lost Live, an unchanged set read and a click while playing between the signature and the position: the same as `eaeaab2` (finder S6, S7, S11, S13).
- Stopped clicks, one or several: the same as `eaeaab2` (finder S10, S16; this review's finding 1 test).
- The new test (`:273`) is a real proof: red at `eaeaab2` and red with only the re-target line removed.

## Minor / nits
- Any report that is not the tempo, a signature half or a lost Live commits the held prediction and clears the flag: a fade's `track-data` or `track-volume` answer, a `loop` report, `startup`, `cue-points` (finder S7, S8). Landing in the 0.5 ms between a played signature and its position needs a fade's reads or a loop press at that instant; the comment fix in finding 7 names it rather than a code change.
- The re-target writes `settlingSong` outside `settleMeter`, the only such write; it starts no timer because the commit follows on the next line. A one-line comment there would say why it sits before the commit.
- Carried from review 7 unchanged: every entry of its Minor / nits.

## Test quality
The delta adds 1 test and modifies none. Red at `eaeaab2` (`{ '1': 4, '2': 4 }`), and red with only the re-target line removed (finder), so it judges the fix against the real report order; its timing line holds. It covers the re-target's main path only: the guard, the reset, the Pad case and the timer fallback have none (finding 1). No tautology shapes: no mocked unit, no own expectation, no call-shaped assertion, no snapshot. Review 7's full-branch audit (160 instances, 123 red at base, the 37 green each a deliberate guard) stands for the rest. Nothing to delete.

## Before opening the PR
- **CI readiness:** the repo has no CI (removed in PR #300). Lint, typecheck, `pnpm test` (1900 passed), build and e2e (56 passed) are green at `952c95b`.
- **Commit hygiene:** clean tree before the review. This review adds this doc, `repro/review-8-finding-1-test.diff`, `repro/review-8-finding-2-test.diff` and `repro/review-8-finding-2-candidate.diff`.
- **Likely reviewer asks:** close #304 with review 7 finding 1's fix (`f65ae3a`); whether a loop on a song's last section across an overlap is something the leader does (finding 2's cap); whether the queue tests' real-time waits (finding 5) are behind #205's flakes.

## Prior-review closure
Review 7: 6 findings. Fully fixed: 1 (finding 1, MEDIUM, `f65ae3a`, verified against its intent: the position report after a played signature chooses the song, and the prediction stands only on the fallbacks its brief accepted), plus finding 6's last comment entry. Partially fixed: 0 (finding 6, comment hygiene, landed one of eight entries; its other seven are carried as finding 7). Untouched: findings 2 to 5 (LOW), deferred by decision in review 7's closure table ("LOW tail, default scope"), carried as findings 3 to 6. No prior MEDIUM or higher is open. Nothing was "resolved" by a comment or doc edit alone.

## Verdict
**Ready to open the PR, with follow-ups.** Nothing is CRITICAL, HIGH or MEDIUM. Review 7's gate (finding 1) is closed against its intent, with a test that is red without it, and every full check is green. The Confirmed list shrank to LOWs: two new (finding 1, tests for the fix's guard and fallbacks, with a proved test; finding 2, a loop wrap's meter, capped, with a proved fix that is cheap to take now) and five carried from review 7's deferred LOW tail. None gates the PR.
