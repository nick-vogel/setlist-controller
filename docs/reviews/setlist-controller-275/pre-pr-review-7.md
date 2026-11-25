# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line (fresh review after run 4)

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `98f15c4`, Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing)
**Reviewed at:** HEAD `eaeaab2` (setlist-controller#326 The slide timing title check reads ProPresenter's library list in the OpenAPI shape, so it finds no library on the real ProPresenter). Clean tree: no uncommitted or untracked files at the start. Against the merge-base: 40 files, +6582 / −432, 78 commits. Outside `docs/reviews/`, the code, data, fixtures and docs are 26 files, +5505 / −432. This review adds this doc and 3 files under `repro/`.
**Delta under review:** none. `--fresh`: the whole working surface since `98f15c4` is reviewed, not only the delta since `45d5789` (setlist-controller#275 pre-PR review 6). Run 4 landed #304, #309, #310, #312 to #317 and #326 on top of what review 6 saw (15 files, +2743 / −244 outside `docs/reviews/`).
**Reviewed against:** epic `nick-vogel/setlist-controller#275` (its spec body) and the bodies of sub-issues #289 to #299, #301, #304 to #317 and #326; `docs/HANDOFF-setlist-controller-275.md`; the Approach decisions of `pre-pr-review-1.md` to `pre-pr-review-6.md`, and review 6 in full; the recorded AbletonOSC order log `~/Library/Logs/setlist-controller/2026-11-06-osc-order.log` (#284 step 6). No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply.
**Date:** 2026-11-06
**Reviewer:** 2 code-review agents + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `eaeaab2` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 70 files, 1899 passed, 4 skipped, first run, no flake |
| Build | `pnpm build` | clean |
| E2E | `pnpm test:e2e` (OS-assigned ports) | 56 passed |
| #304 against the recorded order (finding 1) | new seam test in a scratch worktree at `eaeaab2`: the playhead carried on to the signature report lands 0.01 beats short of the change | red: `expected { '1': 4, '2': 4 } to deeply equal { '1': 3, '2': 4 }`, the song Live leaves takes the next song's meter |
| How often the real prediction falls short (finding 1) | `python3 -I docs/reviews/setlist-controller-275/repro/review-7-finding-1-prediction-error.py ~/Library/Logs/setlist-controller/2026-11-06-osc-order.log`: each playing position report predicted from the one before at Live's tempo, against a crossing that lands uniformly inside one report's step | 13617 samples; prediction error p10 −0.0050, p90 +0.0048, p99 ±0.016 beats; mean report step 0.0158 beats; about 7% of played meter crossings fall short. The one played crossing in the log (289.4984 to 289.5076) predicted 357.0062 against a change on 357: 0.006 beats of margin |
| Finding 1's recommended fix | candidate `repro/review-7-finding-1-candidate.diff` with the new test, scratch worktree, `pnpm exec eslint`, `pnpm exec tsc`, `pnpm test` | the new test green; 70 files, 1900 passed, 4 skipped; lint and typecheck clean |
| A rejected simpler fix for finding 1 | `signaturePlayhead` returning null while Live plays, same suites | 2 red: `holds the check while a count-in from a stopped Live starts a song of another meter` and its Play from start twin (`test/pre-service-check.test.ts`), whose fake Live reports the signature with no position after it. Recorded under Approach decisions |
| Review 5 finding 2 still open (finding 2) | `git apply docs/reviews/setlist-controller-275/repro/review-5-finding-2-test.diff` at `eaeaab2`, `pnpm exec vitest run test/propresenter.test.ts -t "the section before"` | 2 red, as at review 5; `repro/review-5-finding-2-candidate.diff` still applies (`git apply --check`) |
| A library body with no `items` (finding 3) | finder B, scratch worktree: the fake's `v1_library_Default.json` answered as `{update_type:"all"}`, a slide timing title outside the set | `Great Are You Lord: slide timing for no song in the set or in ProPresenter's libraries`, where "could not be read" is the recorded approach |
| #313, #315, #316, #317, `movedBack`, `droppedClear`, the meter publication paths | finder A, code read with one executed probe | hold; the lead-0 `droppedClear` probe dismissed by execution (Reviewed and Dismissed) |
| #308, #309, #310 queue rules, #289, #290, #291, #293, #299, #307, #312, #326 | finder B, code read and two executed probes | hold, apart from finding 3 and Needs Further Investigation A and D |
| Tautology audit (Phase 4.5) | tautology agent: a worktree at `98f15c4` with HEAD's 6 test files, 2 helpers and 3 fixtures; `notes` shape masking neutralised and re-run; #326's tests also run at its parent `57c625a` | see Test quality: 160 new or modified test instances, 123 red at base, 37 green, every green one a deliberate guard, a fixture or shape sync, or a test of the fake |
| Shipped copy | `git diff 98f15c4 -- . ':!docs/reviews' \| grep '^+.*—'` | no em-dash |
| Not run | the real ProPresenter and Live; the shipped `config/slide-timing.json` against the real set | the guardrails forbid driving Live; #284's live check on 2026-11-06 is the evidence for the file |

**Overall:** Every full check is green and run 4's tickets meet their end states, with one exception. #304's fix chooses the song for a signature report by a predicted playhead with no margin at the change, and the recorded home log shows the margin is about a hundredth of a beat against report jitter of the same size, so roughly 1 played meter crossing in 14 still stamps the song Live leaves with the next song's meter (finding 1, MEDIUM, proved by a red test and with a proved fix). Everything else is LOW: two carried check-side defects with proved fixes still not worked (findings 2 and 3), timing-sensitive queue tests that grew with #309 and #310 (finding 4), carried test gaps (finding 5) and comment hygiene (finding 6). Fix finding 1 before the PR; the rest can ride along or become follow-ups.

## Approach decisions
- Carried from review 4: the End inside the crossing's lead is judged by `droppedEnd`, by the crossing itself and by whether the change remembered as sent early is the crossing or a later change of the next song. Unchanged.
- Carried from review 3, recommended, still not worked: a library body with no `items` list reads as "could not be read", never as an empty library (finding 3). This review extends it to a `GET /v1/libraries` list whose entries carry no name, which `librariesIn` now drops (#326).
- Carried from review 5, applied in `a1bcc5b`: a drag back inside a section that clears hands the section's clear only when the landing is before the change sent early's send point (`!due`), the plan holds no slide, and a change was sent early. Unchanged.
- Carried from review 5, recommended, still not worked: the second pass of `resolveTiming` judges entries in section order, each `start` against the section before as its entry stands once judged (finding 2).
- A song's meter on a signature report while Live plays (finding 1, recommended): the signature report still holds the song at the predicted playhead, as #304 built it, but the next report of the playhead re-targets that held meter to the song the report lands in before it commits. The position report Live sends with the signature (0.5 ms after it in the home log) is Live's own word on where the playhead was, so it overrides the prediction; the prediction stands only when no position report comes before the settle timer or a stop. Precedent: `signaturePlayhead`'s waiting-jump branch, which already defers to "the landing's report", and the position case's own `settleMeter(meterSong(position))` (`src/server/playback-controller.ts:709`). The simpler "no prediction while playing" was tried and turns two #293 count-in hold tests red; it is not the recorded approach. This narrows #304's mechanism and does not overturn it.
- Applied in `f65ae3a` (remediation 2026-11-06), as the candidate diff wrote it: `settlingCarried` records that the held song came from a signature reported while Live played; the next position report re-targets `settlingSong` to `meterSong(event.beats)` before the commit at the top of `fromLive`, and `dropMeter` clears the flag with the song. Precedent: the position case's own `settleMeter(meterSong(position))`.

## Confirmed Issues

### 1. A signature report while Live plays still gives the song Live is leaving the next song's meter when the predicted playhead falls a hair short of the change, about 1 played crossing in 14 — MEDIUM
- **Location:** `src/server/playback-controller.ts:272-275` (`signaturePlayhead`), `:748` and `:754` (the two signature cases of `fromLive`), `:645` (the commit at the top of `fromLive`)
- **Attribution:** introduced by `7a1222d` (setlist-controller#304 A song is remembered with the next song's meter when Live reports the signature before the position), merged in `3af6d88`. `git show 98f15c4:src/server/playback-controller.ts | grep -c signaturePlayhead` is 0; at base the signature went to the last reported position, which #304 replaced.
- **Real-world trigger:** a rehearsal or the service plays on from a song in one meter into a song in another (the 8 November set crosses 6/8 and 4/4), and Live's tick that carries the new signature lands within about 0.01 beats past the change while the last position report arrived a few milliseconds late. The recorded log puts that at about 7% of played crossings. The song left behind is then judged by the wrong bar in the pre-service check, which reruns when Live stops: false "changed on beats" notes, and slide timing entries for that song reported as problems and ignored, until the playhead goes back into the song. MEDIUM, capped: the plan of the song being played uses the meter stamped as it is entered, so no slide on stage is known to move. Upgrade to HIGH if a check that ran with a wrong meter can feed the plan of a later play of that song without the playhead re-entering it first (trace `planOf` at `src/server/connections.ts` and `resolveTiming`'s caller `triggerFor` against a jump back into the song while Live plays).

**Evidence**
```ts
  const signaturePlayhead = () => {
    if (waitingJump !== null && barLine !== null) return null;
    return playing && anchor ? anchor.position + ((clock.now() - anchor.at) * anchor.tempo) / 60_000 : position;
  };
  ...
          settleMeter(meterSong(signaturePlayhead()));
```
The held song is fixed at the signature report; the next position report only commits it (`const settled = !comesWithMove && !goneAway && commitMeter();`).

**Failure mode** — executed: `repro/review-7-finding-1-test.diff` adds a test to `describe("a song's meter")` in `test/pre-service-check.test.ts`: Live plays the first song in 6/8 at 120 BPM with its last report on 31.75, 120 ms pass (the prediction is 31.99, a hundredth short of the End on 32), Live reports 4/4, then the position 32.25 in the second song, then stops. The meters come out `{ 1: 4, 2: 4 }`, not `{ 1: 3, 2: 4 }`. The recorded home crossing (log lines 1695 to 1710) had 0.006 beats of margin, and `repro/review-7-finding-1-prediction-error.py` measures the prediction error over 13617 played reports at p10/p90 of ±0.005 beats against a report step of 0.016 beats. #304's three tests all advance the clock 200 ms, 0.4 beats past the change, so none of them sits near the margin.

**Recommended fix** — `repro/review-7-finding-1-candidate.diff`:
```diff
   let settlingSong: number | null = null;
+  let settlingCarried = false;
   let stopSettle: (() => void) | null = null;
@@ const dropMeter = () => {
     stopSettle?.();
     stopSettle = null;
     settlingSong = null;
+    settlingCarried = false;
   };
@@ fromLive(event) {
       const goneAway = event.kind === 'connection' && !event.connected;
+      if (event.kind === 'position' && settlingCarried) settlingSong = meterSong(event.beats);
       const settled = !comesWithMove && !goneAway && commitMeter();
@@ case 'signature-numerator':
           settleMeter(meterSong(signaturePlayhead()));
+          settlingCarried = playing;
           break;
@@ case 'signature-denominator':
           settleMeter(meterSong(signaturePlayhead()));
+          settlingCarried = playing;
           break;
```
The variable's comment, and the `meters()` comment on `PlaybackController` (`src/server/playback-controller.ts:44-52`), should say that the playhead's next report decides the song for a signature reported while Live plays; that wording belongs in the comments the remediator edits, not in this diff.

**Remediation brief**
- **Design intent:** the controller remembers, per song, the signature Live reported while the playhead was inside that song (#293). Live reports a move, its tempo and the two halves of the signature as separate reports within a millisecond; stopped, the position leads, and playing, the signature leads (#284 step 6). `settleMeter` holds one song's meter until the next report that is not the tempo or a signature half, or `METER_SETTLE_MS`, so a song never takes the song before's meter or half of its own. While Live plays, the position report that follows a signature report is the truth about where the playhead was, so it chooses the song; the prediction is only the fallback when no such report comes.
- **Full surface:** `src/server/playback-controller.ts`: the state beside `settlingSong` (`:130`), `dropMeter` (`:260-264`), the top of `fromLive` (`:643-645`), the two signature cases (`:745-756`), and the comments at `:44-52` and above `signaturePlayhead` (`:265-271`). `test/pre-service-check.test.ts`: the new test from `repro/review-7-finding-1-test.diff`, beside the #304 test at `:259`.
- **Must preserve:** every test in `describe("a song's meter")` of `test/pre-service-check.test.ts` , in particular the three #304 tests at `:259`, `:275` and `:292`, the stopped click "runs the check once on the new song's own meter after a stopped click into it" (`:313`, the stopped order: `settlingCarried` stays false, so a click within 50 ms of another click is not re-targeted), and both `holds the check while $what from a stopped Live starts a song of another meter` cases (a signature while playing with no position report after it still commits the predicted song on the stop). The meter tests in `test/propresenter.test.ts` (`grep -n "METER_SETTLE_MS" test/propresenter.test.ts`) and the waiting-jump branch of `signaturePlayhead` (a held null re-targeted to the landing's song is that song with the target's signature, which the position case gives it anyway). Suites: `test/pre-service-check.test.ts`, `test/propresenter.test.ts`, `test/connections.test.ts`, `test/cue-lateness.test.ts`, then `pnpm test`.
- **Do not touch:** the anchor's stored `tempo` and the tempo test at `test/pre-service-check.test.ts:275` (the prediction stays the fallback, so carrying it at the anchor's tempo still matters); `METER_SETTLE_MS`; the lost-Live drop (`goneAway`) and the new-set path that commits before clearing (both Reviewed and Dismissed by finder A).
- **When the fix itself fails:** if Live stalls after the signature and sends no position report, the settle timer or the stop commits the predicted song, as today; a short prediction then still mis-stamps, at the rate above times the stall rate. That residue is accepted; the backstop is the next entry into the song, which re-stamps it.
- **Proof:** from the repo root, in a scratch worktree at HEAD: `git apply docs/reviews/setlist-controller-275/repro/review-7-finding-1-test.diff && pnpm exec vitest run test/pre-service-check.test.ts -t "falls just short of the change"`: red, `{ '1': 4, '2': 4 }`. Then `git apply docs/reviews/setlist-controller-275/repro/review-7-finding-1-candidate.diff` (or the remediator's equivalent) and the same command: green; `pnpm test`: 1900 passed.

### 2. The slide timing check judges a `start` against entries it drops in the same pass, so a valid start can be dropped as "passes null" — LOW
- **Location:** `src/server/propresenter.ts:1108-1112` (the second pass of `resolveTiming`; review 6 cited `:1038-1044`, moved by run 4)
- **Attribution:** introduced by `e56a8f7` (setlist-controller#301 A slide timing entry puts a section's first slide up early for a pickup line). Review 5 finding 2 and review 6 finding 2, untouched by run 4.
- **Real-world trigger:** two adjacent sections of one song both carry a `start`, and the earlier one is itself dropped for its own `start`. Review 6's upgrade condition (adjacent starts in `config/slide-timing.json`) is now met in shape since `4fc538c` (#311: Holy Forever Chorus 1 into Chorus 2, Worthy Of It All Chorus into Chorus), but nothing there is dropped: the live check on 2026-11-06 at `4fc538c` showed no slide timing problem for either song. LOW, capped: upgrade to MEDIUM if any check shows a "start … passes" problem for Holy Forever or Worthy Of It All, since the next chorus's valid pickup would then go late on stage too.

**Evidence, failure mode, recommended fix and remediation brief:** unchanged from `pre-pr-review-5.md`, finding 2, adopted as written, with its line numbers moved to `:1108-1112`. Re-proved here: `git apply docs/reviews/setlist-controller-275/repro/review-5-finding-2-test.diff`, then `pnpm exec vitest run test/propresenter.test.ts -t "the section before"`: 2 red at `eaeaab2`; `repro/review-5-finding-2-candidate.diff` passes `git apply --check`. Finder B's independent repro on the 8 November set gives `Ancient Gates: slide timing Verse 4 1, start -2 passes null` for a Verse 4 whose start lands after Verse 3's even split.

### 3. A library answer with no `items`, or a library list whose entries carry no name, reads as an empty library, so every title outside the set becomes a false typo — LOW
- **Location:** `src/server/propresenter.ts:1389-1391` (`itemNamesIn`), `:1380-1385` (`librariesIn`), `:517-524` (`libraryNames`)
- **Attribution:** `itemNamesIn`'s empty fallback was introduced by `f21db09` (setlist-controller#297 …), review 3 finding 3, carried as part of review 6 finding 5, untouched. `librariesIn`'s silent drop of an entry with no `name` is new in `f66d8da` (setlist-controller#326 …): it is the shape of #326's own bug, now pointed the other way.
- **Real-world trigger:** a ProPresenter update that changes either answer's shape (as the OpenAPI spec and the real ProPresenter 22 already disagree, #326), or a library that answers 200 with no `items`. The check then names each slide timing title of a song not in that week's set as "slide timing for no song in the set or in ProPresenter's libraries". No song is affected on stage: the entries of songs in the set are unaffected. LOW.

**Evidence**
```ts
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
```
**Failure mode** — executed by finder B in a scratch worktree: the fake's Default library answered `{update_type:"all"}` and a slide timing file keyed on a library song outside the set gave the typo line, not `slide timing Great Are You Lord: not checked, ProPresenter's libraries could not be read`.

**Recommended fix** — `itemNamesIn` returns `null` for a body whose `items` is not an array; `libraryNames` returns `null` when any library gives `null`, and when `listed.body` is a non-empty list from which `librariesIn` reads no name. Both then read as "could not be read", the recorded approach.

**Remediation brief**
- **Design intent:** the title check (#297) asks the libraries only for titles outside the set; anything short of a full, readable list is "could not be read", one problem naming the unchecked titles, never an empty library.
- **Full surface:** `src/server/propresenter.ts:517-524`, `:1380-1391`; `test/fake-propresenter.ts` (a way to answer a library with a given body, beside `refuseLibraries`); two check tests beside the #326 test (`grep -n "recorded flat list of libraries" test/propresenter.test.ts`).
- **Must preserve:** `test/propresenter.test.ts` "checks the title of a song outside the set against the recorded flat list of libraries" (#326's proof), "names a title that matches no song in the set or in the libraries" (#297), and the refused-library test (`grep -n "could not be read" test/propresenter.test.ts`); an empty `GET /v1/libraries` list (`[]`) stays an empty set of names, which is a real answer.
- **Do not touch:** the 404 for an unknown library in the fake, and `update_type` (not read, by design).
- **Proof:** the two new tests red before the fix, green after: `pnpm exec vitest run test/propresenter.test.ts -t "libraries"`.

### 4. The queue tests wait on real time, so a press or cue sent early under load can pass, and a slow machine can turn them red with no bug — LOW
- **Location:** `test/propresenter.test.ts:1488-1489` (`heldPreChorusAnd`, used by the `it.each` at `:1499`, from `d85f229`, #309), `:4008-4010` (`heldCues`, used at `:4017`, `:4038`, `:4066`, `:4086`, from `9713e29`, #310), `:4055` (a 50 ms wait for the server to take a press), `:3951` (`cuesReceived`, from `2f2c8b4`, #308, review 6 finding 3); `test/propresenter-adapter.test.ts:223`, `:236`, `:253` (`sleep(150)` and `sleep(100)` against 300 ms delays)
- **Attribution:** introduced by the commits named; `cuesReceived` is review 6 finding 3, whose poll was already cut to the 150 ms shape in `heldPreChorusAnd` but not in `heldCues` or `cuesReceived` (both still `tries < 16`, 400 ms).
- **Real-world trigger:** none on stage. Two lanes run the suite at once under load (#205), and these are the tests most exposed: the absence they assert is polled for a fixed real-time window under the rig's real-time 1000 ms request timeout.

**Brief:** review 5 finding 3, adopted and widened: cut `heldCues` and `cuesReceived` to `tries < 6` (150 ms) with their comments to match, as `heldPreChorusAnd` already is; replace the 50 ms wait at `:4055` with a wait on the server's own sign that the press is queued (the producer row's `commandLine`, or the fake receiving nothing new for one poll) rather than a fixed sleep; in `test/propresenter-adapter.test.ts`, raise the delays the sleeps race (`delayTriggers(300)`, the 300 ms clear) to at least 3 times their sleep. Add review 6's missing offline-drop test (hang, `play(4.5, 44.5)`, wait 1200 ms, answer, expect no `trigger(HOLY_FOREVER, 0)` within 200 ms). Must preserve: each test still red with the queue removed (`cuesSent.then(() => …command(path))` replaced by `command(path)` in `src/server/propresenter.ts` `cue()`, and `inLine` bypassed in `runButton`). Proof: `pnpm exec vitest run test/propresenter.test.ts test/propresenter-adapter.test.ts` green, and red under each mutant.

### 5. Carried test gaps from review 6, untouched by run 4 — LOW
- **Location and attribution:** review 6 finding 1 (`movedBack`'s `early` and `!due` guards and its crossing case have no test; `src/server/connections.ts`, the `else if (!due && plan.length === 0 && early)` line, `grep -n "plan.length === 0 && early" src/server/connections.ts`; introduced by `a1bcc5b`), review 6 finding 4 (tests that assert less than their titles; from `d77e3a0`, `0205263`, `ea899f7`, `e56a8f7`), review 6 finding 5 (fallback paths with no test, apart from finding 3 above, from `e56a8f7` and `48d8df9`).
- **Real-world trigger:** none on stage; each is a regression that would stay green.

**Brief:** review 6 findings 1, 4 and 5, adopted as written. Their line numbers have moved with run 4's +684 lines in `test/propresenter.test.ts`: find each by its test title (`grep -n "<title>" test/propresenter.test.ts`) or by `git log -L` on the commit named, never by review 6's numbers. The mutants for finding 1 are `repro/review-6-finding-1-mutant-no-early.diff` and `repro/review-6-finding-1-mutant-no-due.diff`; check each with `git apply --check` first, since run 4 changed `src/server/connections.ts`. Tighten, never delete: `:3912` in review 6's numbering is review 3 finding 1's proof.

### 6. Comment hygiene — LOW (aggregated)
- `src/server/connections.ts:723` (`grep -n "hands the section's clear when a change went early"`) → "hands the section's clear when a change went early, since the screen shows that change, and nothing otherwise" → "hands the section's cue when a change went early, as a start inside a section does, which is its clear for a section that clears and nothing for a song not on Master, since the screen shows that change; and nothing otherwise" (carried from review 6)
- `src/server/connections.ts:634` → "only a crossing actually sent drops the End." → "the crossing or a later change of the next song that only the chain from the crossing reaches: only a crossing actually sent drops the End." (carried from review 4)
- `README.md:49` → "that song's End, when it falls inside that lead, sends nothing" → "that song's End, when it falls inside that lead and that slide went up early, sends nothing; when a Fade out, a loop change or a moved prediction stopped that slide, the End goes as usual" (carried from review 3)
- `README.md:49` and `docs/install.md` (`grep -n "the set was read or the server started"`) → "since the set was read or the server started" → "since the set last changed or the server started" (carried from review 3)
- `README.md:49` and `docs/install.md:286` → "more slides than the section has whole beats" → "an even split that puts a slide at or past the section's end, as more slides than whole beats does" (carried from review 5)
- `src/server/propresenter.ts:911` → "A section whose group holds more slides than the section has whole beats gets no such note" → "A section whose even split drops slides (dropsSlides) gets no such note" (carried from review 5)
- `test/propresenter.test.ts:4650` → "so a start of -5 lands on beat 12 and one of -3 on beat 20." → "so a start of -5 lands on beat 12." (carried from review 5)
- `src/server/playback-controller.ts:44-52` and `:265-271` → after finding 1's fix, "a signature reported ahead of the playhead's move goes to the song the playhead has reached by then" → "a signature reported while Live plays goes to the song of the playhead's next report, or, with none, to the song the playhead has reached by then" (new; part of finding 1's surface, listed here so it is not missed)

## Needs Further Investigation
### A. A cue's clear queued behind a slow trigger does not keep the row blank over that trigger's late frame
`cue()`'s clear branch (`src/server/propresenter.ts:733-741`) sets `slide = null` on the clear's answer but never sets `clearedBehind`, which `runButton`'s Clear slide sets (`:789-791`, the #309 review pass 1 finding 2 fix). So a Turnaround's clear handed while a cold trigger is out goes out after that trigger (#308), and the trigger's frame, 0.3 to 0.5 s after its answer, puts the trigger's slide text back on the producer row while the screen is blank. The frame lands inside the 1000 ms window (`HAND_WINDOW_MS`), so it does not pause ProPresenter. Code-read by finder B, not executed: the adapter rig (`test/propresenter-adapter.test.ts`) has no section that clears. What confirms it: add a section with no group to Song A in that rig and mirror "keeps the row's slide text blank after a Clear slide pressed while a cue's trigger is out" with a cue clear. Fix candidate: capture the `cueOut` of the trigger the clear waits behind at hand time, and set `clearedBehind` from it on the clear's 2xx, as `runButton` does.

### B. A stale early mark from the next song can swallow a jump to End after a Fade out pause and a re-arm
`droppedEnd` (`src/server/connections.ts:477-484`) runs in `deliver` before `back(entry, here)`, and the early mark survives a Fade out pause and a re-arm (#316 resets it on a row button, going offline, a press by hand and a disarm, as Nick decided). Finder A's path: song A plays on into song B with A's End inside the crossing's lead; a change of song B goes early; Fade out pauses ProPresenter; the leader jumps back to A's last section (paused, so `deliver` skips the target and `back()` never runs); the producer arms; Next jumps to A's End, which `droppedEnd` drops, leaving a song B slide up. Reasoned, not executed, and the path is narrow. What confirms it: a seam test in `the lyric lead` following those steps, asserting a clear or the End group on the End. Fix candidates: run `back(entry, here)` before `droppedEnd`, or forget the mark when ProPresenter goes from paused to armed; the second widens #316's decided list, so it is Nick's call.

### C. Carried from reviews 5 and 6: a crossing's pickup, planned while the next song's meter is unread, uses the song before's meter
`planOf` (`src/server/connections.ts:308`) falls back to Live's signature (`meters().get(cue.song) ?? bar()`). With the next song's meter not read yet, a `start` of −0.25 bar is planned as −1 beat in 4/4 where the song's 6/8 makes it −0.75, so `wentEarly` misses and slide 1 is handed again on the downbeat. Reasoned by finder A; the README asks the producer to walk the playhead through each song first, which reads every meter. Same as review 6 NFI C.

### D. Cues already waiting in the adapter's line still go out after a Fade out pause or a Stop
A trigger handed while a cold trigger is out sits in `waiting` (`src/server/propresenter.ts:713-722`); only going offline drops it. A Fade out pause or a Stop arriving meanwhile cancels the server's schedule but not the adapter's line, so that trigger can reach ProPresenter seconds later, after the pause. The spec says a change for a paused target is dropped, never queued; this one was handed while armed. Code-read by finder B. What confirms it: a seam test with `pro!.hang()`, a cue handed, a second cue handed, Fade out, then `pro!.answer()`, expecting only the first trigger. Fix candidate: a target hook the server calls on pause and cancel that marks every waiting entry dropped.

### E. A pickup on a song's first section after a song with no End is checked against that song's last section's start, not its last change
`boundBefore` (`src/server/propresenter.ts`, `grep -n "the end of \${songTitle(before)}"`) still bounds a first-section `start` by the song before's last section start, but #314 now gives that section a length and an even split. Finder B proved the check side by execution (a `start: -4` on Holy Forever's Verse 1 after an Ancient Gates with no End passes the check while landing before Ancient Gates' last change on 52); the stage effect is reasoned. Already proposed from #314's review (`.epic-loop/tickets/314/proposals.md`, "A pickup start after a song with no End is checked against its last section's start, not its last change"), where the #314 review's F1.1 MEDIUM was deferred. Every song of the 8 November set has an End, so nothing reaches it this week.

## Reviewed and Dismissed
- A lead-0 target sends a clearing section's clear over a pickup that passed it, since `deliver`'s lead-0 branch skips `droppedClear`. Dismissed by finder A's execution (`vampRig(-1.5, 0)`): `passes()` drops any start that reaches the previous section's downbeat when that section clears, so the pickup never goes.
- #313: a Loop press between the pickup and the brace's end. Holds: `schedule` uses `untilBeat` for `on` only on a wrap, so the press fires at once.
- #315: the landing branch. Holds: limited to jump, Play from start and count-in, bounded by `untilBeat`; the count-in cue is raised on the target section (`src/server/cues.ts:175`), so no stray Intro slide.
- #317 and #295: the last section's clear is passed only for a crossing on a pickup; the non-pickup case waits for the clear, as the tests pin.
- Meter publication on every early return of `fromLive`, a new set committing the old pending meter before clearing the map, and a lost Live dropping it uncommitted. Hold (finder A).
- #308, #309, #310 queue rules: a cue handed with nothing on the line is never dropped, a new trigger drops waiting triggers and keeps a waiting clear, a new clear drops everything waiting, a press resets `waiting`, and an aborted connection answers null. Hold (finder B).
- #289, #290, #291, #293, #299, #307, #312, #326 against their end states. Hold (finder B).
- `droppedClear`'s `passes === start` guard, the `movedBack` mechanism, and the #295 clamp. Not in question (carried).
- The 37 tests green at `98f15c4`. Not vacuous: each is a guard on behaviour the base already had, a fixture or `notes` shape sync, a proof of a fix to code that exists only inside the branch, or a test of the fake (Test quality).

## Minor / nits
- `triggeredIn` is set at hand time (`src/server/propresenter.ts:699-700`), so a trigger later dropped from the line still names the presentation a Next or Previous press reckons from. The window covers the pause risk.
- A frame equal to a cleared slide within `BUTTON_FRAME_MS` of a Clear slide press is kept off the row, a real re-show by hand included (`:606-613`). A deliberate trade.
- `libraryNames` asks every library in parallel through `request`, whose timeout puts ProPresenter offline; a large, slow library inside a check could take ProPresenter offline. The same pattern as the playlist reads.
- The early mark survives a Fade out pause and a re-arm (finder A F3). Outside #316's decided list; it is the enabler of NFI B.
- `test/fake-propresenter.test.ts:62` dropped the `[WORTHY_OF_IT_ALL, 4, 15590]` case with #326's re-recording; deliberate. `:120` checks the fake against the fixture it loads; the server-side proof is the #326 test.
- `test/pre-service-check.test.ts:259`, `:275`, `:292` assert only the last check's meters; `:313` uses the whole `meters.slice(checks)` list, which would also catch a wrong intermediate run.
- `test/propresenter.test.ts:2665` asserts the absence of lines starting `Ancient Gates: Verse 3`; a regression reported in another wording passes. `test/propresenter-adapter.test.ts:255` and the press-line test assert `not.toContain` on exact UI strings, which pass vacuously if the wording drifts.
- Carried from review 6 unchanged: a second, invisible clear on a drag back after a row's Clear slide; an unmeasured `not-played-across` log line for a song not on Master; the end toggle switched after the End forgets the crossing; `seenPlaysOn` never reset on a new set; `playsOn` builds a snapshot per song; the #307 problem's wording; "<name>'s last change" for a clearing bound; the redundant `bar !== null` in `resolveEntry`.

## Test quality
Against `98f15c4`, with HEAD's test files, helpers and fixtures copied in: 139 new and 16 modified tests, 160 runtime instances with `it.each`. 123 red at base, 37 green, 0 tautology shapes of the four coarse kinds (own expectation, mocked unit, call-shaped only, unread snapshot), 0 assertion-free tests. `test/pre-service-check.test.ts` was red as a whole file through the #289 `notes` field in its shared `MATCHED` constant; with that neutralised, the 12 unchanged tests went green and every new instance stayed red, though 9 of them are red through an interface change (`meters` handed to `check()`), so the base oracle never judged their meter claims; finding 1's new test judges one of them against the real report order. The 37 green ones, each traced to its commit by the audit agent: guards on behaviour the base already had (#291's kept End group, #292's drag cases, #294's set-to-stop and Fade out cases, #296's lost press, #305, #306, #301's invalid-start and cancel cases), Worthy Of It All index updates for #326's fixture, `notes: []` shape syncs in `test/pages.test.ts`, proofs of fixes to code that exists only in the branch (#309 review pass 1 findings 1 and 3, #313), and tests of the fake. #326's server proof ("checks the title of a song outside the set against the recorded flat list of libraries") is red at its parent `57c625a`; "names a title that matches no song in the set or in the libraries" passes there too, so it cannot see a library shape bug (finding 3 adds the tests that can). Timing-sensitive shapes are finding 4; weaker assertions are under Minor / nits. Nothing to delete.

## Before opening the PR
- **CI readiness:** the repo has no CI (removed in PR #300). Lint, typecheck, `pnpm test` (1899 passed), build and e2e (56 passed) are green at `eaeaab2`.
- **Commit hygiene:** clean tree before the review. This review adds this doc, `repro/review-7-finding-1-test.diff`, `repro/review-7-finding-1-candidate.diff` and `repro/review-7-finding-1-prediction-error.py`.
- **Likely reviewer asks:** why #304 is still open on GitHub though `3af6d88` landed it (close it with finding 1's fix); whether NFI B's Fade-out-then-arm reset belongs with #316's list; whether the queue tests' real-time waits (finding 4) are behind #205's flakes.

## Verdict
**Not ready as-is; ready once finding 1 is fixed.** Nothing is CRITICAL or HIGH. Finding 1 (MEDIUM) is the gate: #304's end state, "never the next song's meter", fails on about 7% of played meter crossings by the recorded home log, and a small, proved fix keeps #304's mechanism and every existing test green. Findings 2 to 6 are LOW: 2 and 3 are carried check-side defects with proved fixes that are cheap to take now; 4 and 5 are test work; 6 is comments. They can ride along or become follow-ups. This is a fresh review, so it carries no closure count; of review 6's six LOWs, run 4 worked none directly (#316 closed review 6's NFI A and B, which are not reported again), and all six are carried here as findings 2 to 6.

## Remediation: 2026-11-06
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `f65ae3a` setlist-controller#275 pre-PR review 7 finding 1: a signature report while Live plays gives the song Live leaves the next song's meter when the carried-on playhead falls just short of the change | red→green: `pnpm exec vitest run test/pre-service-check.test.ts -t "falls just short of the change"` (red `{ '1': 4, '2': 4 }`, then green); preserve suites `test/pre-service-check.test.ts`, `test/propresenter.test.ts`, `test/connections.test.ts`, `test/cue-lateness.test.ts` 351 passed; `pnpm lint`, `pnpm typecheck` clean, `pnpm test` 70 files, 1900 passed, 4 skipped, `pnpm build` clean, `pnpm test:e2e` 56 passed | 1 (the test's timing line, "120 ms at 120 BPM carries the playhead 0.24 beats on, to 31.99, a hundredth short of 32", which the test's validity rests on); the repro diff's 3-line header comment moved to the commit message; 3 existing comments reworded (`meters()`, `settlingSong`, `signaturePlayhead`) as the brief and finding 6's last entry asked | proved by execution (MEDIUM, red before and green after in the real runner, preserve suites green); no verify agent |
| 2 (LOW) | deferred | | | LOW tail, default scope (eng-pipeline#34) |
| 3 (LOW) | deferred | | | LOW tail, default scope |
| 4 (LOW) | deferred | | | LOW tail, default scope |
| 5 (LOW) | deferred | | | LOW tail, default scope |
| 6 (LOW) | deferred, apart from its last entry | | | the `playback-controller.ts` entry landed with finding 1 in `f65ae3a`; the other 7 entries are LOW tail, default scope |

### Known regressions, deferred
- None. No verify agent ran, and the full checks are green at `f65ae3a`.

### Rework briefs
- None. No rework pass.
