# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line (fresh review of the whole branch since PR #300)

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `98f15c4`, Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing)
**Reviewed at:** HEAD `6c3b6a1` (setlist-controller#307 A section with more slides than whole beats drops its last slides while the check says "changed on beats", the merge of `48d8df9`). Clean tree: no uncommitted or untracked files. Against the merge-base: 28 files, +3389 / −314, 50 commits. Of those, 6 files are review 3 and 4's docs and `repro/` files; the code, data and docs are 22 files, +2865 / −314. This review adds this doc and 4 files under `repro/`.
**Delta under review:** none. `--fresh`: the whole working surface against the merge-base, though reviews 3 and 4 covered `e73c4a7` and `0d6203a`.
**Reviewed against:** epic `nick-vogel/setlist-controller#275` and the follow-ups this branch carries since PR #300: #289, #290, #291, #292, #293, #294, #295, #296, #297, #298, #299 (closed) and #301, #305, #306, #307, #308 (landed by this run, open). #284 (home run) and #304 (the signature report order, review 3 finding 2) are skipped in this run. Prior docs read by heading: `pre-pr-review-1.md` to `pre-pr-review-4.md`, their Approach decisions and closure tables. The ticket assumption for #301 in the run's ticket folder (the second pass of `resolveTiming`) is cited under finding 2. No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply.
**Date:** 2026-11-04
**Reviewer:** 3 code-review agents + 1 test-oracle agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `6c3b6a1` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 70 files, 1863 passed, 4 skipped, first run |
| Build | `pnpm build` | clean |
| E2E | `pnpm test:e2e` (OS-assigned ports) | 56 passed |
| Finding 1 red | `repro/review-5-finding-1-test.diff` applied in a scratch worktree at `6c3b6a1`, `pnpm exec vitest run test/propresenter.test.ts -t "dragged back inside the Vamp"` | red at the drag: `expected [ Array(1) ] to deeply equal [ …(2) ]`, received only `AA8F…/12/trigger`, no clear. The finder's probe, stepping a quarter beat at a time, gave `96: CLEAR, 98: …/12, 98: …/12` for drags to 96.5 and 97.5 |
| Finding 1 candidate fix | `repro/review-5-finding-1-candidate.diff` with the test, `pnpm exec vitest run test/propresenter.test.ts test/connections.test.ts test/cue-lateness.test.ts` | 3 files, 297 of 297 passed |
| Finding 2 red | `repro/review-5-finding-2-test.diff` (two tests) in a scratch worktree at `6c3b6a1`, `pnpm exec vitest run test/propresenter.test.ts -t "the section before"` | both red: one misses "Verse 3 1, start -5 passes Verse 1's last change", the other receives "Ancient Gates: slide timing Verse 3 1, start -1 passes null" |
| Finding 2 candidate fix | `repro/review-5-finding-2-candidate.diff` with the tests, `pnpm exec vitest run test/propresenter.test.ts test/pre-service-check.test.ts test/connections.test.ts`, then `npx tsc` | both tests green, every other test green; tsc clean |
| #308's queue guards (finder, executed) | mutants in a scratch worktree: the queue removed; `given.aborted ? null :` removed; the `run === presses` guard removed | queue removed: the two "one at a time" tests (`test/propresenter.test.ts:3726`, `:3750`) red. Offline drop removed: all 244 tests of the file pass (finding 3). Guard removed: the #298 test (`:1949`) red |
| #308 order tests' timing | finder timed hang to answer of `cuesReceived` on an idle machine | 429 to 433 ms against the rig's real-time 1000 ms request timeout (finding 3) |
| #307 boundary (finder) | `evenSplit` at n slides in n beats and n+1, and the meter claim of `dropsSlides` | n in n shows every slide, n+1 drops one; the answer does not depend on the meter |
| #301 crossing with a pickup (finder, executed) | Worthy Of It All Verse 1 `start: -0.25` after Ancient Gates and Holy Forever, the End on 41, 43.5, 14 and 15.5 | the End dropped every time, slide 0 sent once, no flicker |
| Tautology audit (Phase 4.5) | HEAD's 8 changed test and support files copied onto `98f15c4`'s `src` in a scratch worktree, each file run alone | 103 new and 11 modified tests: 85 red at base, 29 green. Every green one is a deliberate guard, a type sync (`notes: []`) or a test of the fake itself (Test quality) |
| Prior findings still open | grep of the code and docs each prior LOW names | review 3 finding 3 (library fallbacks) and review 4 finding 2 (two sends of one index) untouched; review 3's README and install doc hygiene entries still apply |
| Shipped copy | the diff's added lines in `src`, `web`, `config`, `docs/install.md`, `README.md` grepped for an em-dash | none |
| Not run | the real ProPresenter and Live; AbletonOSC's report order; the home presentations behind `config/slide-timing.json` | the guardrails forbid driving Live; #284 is Nick's home run |

**Overall:** The sixteen follow-ups land on their End states, and every full check is green. One MEDIUM is confirmed and proved: a drag back inside a section that clears, after the next section's first slide went up early, leaves that slide on the screen over the instrumental and sends it a second time (#292's rule misses the clear). A one-line fix turns its test green with 297 of 297 tests in the preserve suites. Below that are LOWs: the slide timing check's second pass judges a `start` against entries it drops in the same pass, two #308 test weaknesses, tests that assert less than their titles, untested fallbacks, and comment drift. Fix finding 1 before the PR opens.

## Approach decisions
- Carried from review 4: the End inside the crossing's lead is judged by `droppedEnd`, by the crossing itself and by whether the change remembered as sent early is the crossing or a later change of the next song. Unchanged.
- Carried from review 4: a song's meter on a signature report (review 3 finding 2) is deferred by Nick to #304, and #284's home run records AbletonOSC's report order. Not re-reported here.
- Carried from review 3: a library body with no `items` list reads as "could not be read", never as an empty library (recommended, still not worked; folded into finding 5).
- A drag back inside a section that clears (finding 1, recommended): `movedBack` hands the section's own cue, which clears, when the landing is before the change sent early. It does this only when a change was sent early and the plan holds no slide. With nothing sent early the screen already shows the clear, and nothing is handed, as today. Precedent: the start inside a section hands the clear for an empty plan (`src/server/connections.ts:904`).
- A slide timing `start` against the section before (finding 2, recommended): the second pass of `resolveTiming` judges entries in section order. Each `start` is judged against the section before as its entry stands once judged, and the problem line names the bound from that one evaluation. This overturns the #301 ticket assumption "judged against the first pass's exceptions, and an entry it drops does not re-judge the next section's entry". One ordered pass is enough, since a section's bound depends only on the section before it, so the assumption's "iterate until stable" is not needed.

## Confirmed Issues

### 1. A drag back inside a section that clears, after the next section's first slide went up early, leaves that slide over the instrumental and sends it again — MEDIUM
- **Location:** `src/server/connections.ts:704-706` (`movedBack`, the `landed` hand)
- **Attribution:** introduced by `0a8e7ee` (setlist-controller#292 A drag back inside the section playing sends the slide for where it lands). `git log -S'const movedBack' 98f15c4..HEAD` names only that commit, and `98f15c4`'s `connections.ts` has no `movedBack`. #292's plan chose "None (a section whose plan holds no slide, as one that clears) hands nothing", which is right only while the screen shows the clear.
- **Real-world trigger:** at rehearsal, or at the laptop in a service, the playhead is in the last `leadBeats` of an instrumental that clears (a Vamp, a Turnaround, an Interlude, a song's last section that clears before a crossing). The next section's first slide has gone up early, and the operator drags the playhead back inside the instrumental to before that slide's send point. User path: a drag at the laptop, which #292 exists for. MEDIUM, capped as a wrong display: the words shown are the next line's, early, not wrong words over a sung line.

**Evidence**
```ts
    entry.early = null;
    const landed = due ? due.cue : { ...cue, slide: at(to)?.slide };
    if (landed.slide !== undefined && (showing?.song !== landed.song || showing.slide !== landed.slide)) hand(entry, landed, null, 'not-played-across');
    if (due && landing !== null) entry.early = { ...due, from: landing };
```
In a section that clears, `plan` is empty, so `at(to)` is undefined and `landed.slide` is undefined. Nothing is handed, but `entry.early` is forgotten, and `schedule(entry, following(entry, cue, to))` then sends the same slide again at its send point.

**Failure mode** — Worthy Of It All with `VAMP_CUE_POINTS` (Vamp 96 to 100 clears, Chorus on 100), the default lead of 2 and no slide timing entries. The Vamp clears on 96, and the Chorus's first slide (index 12) goes on 98. Then a drag back to 96.5. At HEAD, ProPresenter receives `[…/12]` after the drag (no clear), so the Chorus's first line stays up over the Vamp for 1.5 beats, and `…/12` goes again on 98. Correct is `[…/12, CLEAR]` at the drag, then `…/12` once more on 98. With a longer instrumental, the stale slide stays up for as long as the drag went back.

**Recommended fix**
```diff
     if (landed.slide !== undefined && (showing?.song !== landed.song || showing.slide !== landed.slide)) hand(entry, landed, null, 'not-played-across');
+    else if (!due && plan.length === 0 && early) hand(entry, landed, null, 'not-played-across');
     if (due && landing !== null) entry.early = { ...due, from: landing };
```
Diff audit: no existing line is removed or reordered. The new hand runs only when the landing is before the change sent early (`!due`), the section's plan holds no slide, and a change was sent early. In every other state the code does exactly what it does today. With nothing sent early, the clear went on the section's downbeat and the screen shows it, so nothing is handed (Must preserve). `landed` is the section's cue with no slide, and `triggerFor` turns it into the clear for a section with no group after the song's first group. For a section before the first group the plan holds slide 1, so the plan is not empty and this line never runs. For a song not on Master, `cue()` sends nothing. The fix's own failure: a hand for a paused, disarmed or offline target. `moved()` skips those targets before `movedBack` (the finder traced it), and `hand` runs through the arm rules and `safely()`, so a refused or failed clear is logged like any cue and playback never waits.

**Remediation brief**
- **Design intent:** a target with a lead holds one waiting change and one remembered change sent early (`entry.early`), which is what the screen shows until a cue replaces it. A move back inside the playing section re-derives the slide for the landing: the change sent early when the landing is at or past its send point (it stays remembered), else the plan's slide at the landing. A section that clears has an empty plan, and its slide is the clear. The schedule then runs on from the landing (`following`), so the slide sent early goes again on its lead.
- **Full surface:** `src/server/connections.ts:706` (the one added line). The comment above `movedBack` (`:687-693`), "and none, as in a section that clears, hands nothing", becomes "and none, as in a section that clears, hands the section's clear when a change went early, since the screen shows that change, and nothing otherwise". The test from `repro/review-5-finding-1-test.diff`, in `describe('the pickup start')` after `vampRig`, in `test/propresenter.test.ts`. Optional second test, by reasoning not executed: the crossing sent early, then a drag back inside a song's last section that clears (the same line covers it).
- **Must preserve:** "sends nothing on a drag back that lands inside the lead before a slide that went early, nor when the playhead plays across its beat" (`test/propresenter.test.ts:3526`), "sends nothing on a drag back while a jump waits, and the landing sends the jump's slide" (`:2545`), "sends Verse 1's first slide when the playhead is dragged back from its second slide into its first half" (`:2528`), and every test of `the slides inside a section`, `the lyric lead` and `the pickup start`. Suites: `test/propresenter.test.ts`, `test/connections.test.ts`, `test/cue-lateness.test.ts`, 297 of 297 green with the candidate.
- **Do not touch:** the `due` branch and its re-remembered `early` (Reviewed and Dismissed: a wrap with a pickup does not linger); the #295 clamp in `onward` and `passingClear`.
- **Proof:** `git apply docs/reviews/setlist-controller-275/repro/review-5-finding-1-test.diff`, then `pnpm exec vitest run test/propresenter.test.ts -t "dragged back inside the Vamp"`. Red now at the second `expect` after the drag (no `CLEAR`); green with the fix. The candidate diff is `repro/review-5-finding-1-candidate.diff`.

### 2. The slide timing check judges a `start` against entries it drops in the same pass, so a start that plays out of order can pass and a valid one can be dropped as "passes null" — LOW
- **Location:** `src/server/propresenter.ts:1038-1044` (the second pass of `resolveTiming`)
- **Attribution:** introduced by `e56a8f7` (setlist-controller#301 A slide timing entry puts a section's first slide up early for a pickup line). `git log -S'The second pass: a start that lands' 98f15c4..HEAD` names only that commit. The ticket recorded the first-pass judgment as an assumption ("a chain of pickups across adjacent sections is not in any song in the library"). Its own review raised the "passes null" wording as F1.2, LOW, and left it.
- **Real-world trigger:** a slide timing file with `start` entries on two adjacent sections of one song, where the earlier one is dropped in the second pass. The producer then sees a problem line for the earlier entry. Story 34 expects a service to run with a broken entry in place (its section falls back to the even split), and that is when the later entry misbehaves. LOW, capped: no song in the library has adjacent pickups today. Upgrade to MEDIUM if a slide timing file gives `start` to two adjacent sections of one song; check with `node -e` over `config/slide-timing.json` for two `start` entries whose sections are neighbours in that song's locators.

**Evidence**
```ts
  const passing = bar === null ? [] : [...exceptions].filter(([index, { start }]) => start !== undefined && passes(presentation, song, index, start, bar, exceptions, before) !== null);
  for (const [index, exception] of passing) {
    problems.push({ n: exception.n, line: `${songTitle(song)}: ${exception.label}, start ${exception.start} passes ${passes(presentation, song, index, exception.start!, bar!, exceptions, before)}` });
    exceptions.delete(index);
  }
```
`passing` is worked out once against every first-pass entry. The loop deletes entries, then calls `passes()` again for the line.

**Failure mode** — two cases, both executed with `TIMING_CHECKED` on November 8 (Ancient Gates Verse 1 from 0 to 32, Verse 3 from 32):
- `[{section:'Verse 1', start:-1, changes:[2]}, {section:'Verse 3', start:-5}]`. Verse 1's entry passes the start of the set and is dropped, so Verse 1 plays the even split with its second slide on 16. Verse 3's start lands on 12, but it was judged against the dropped change on 8 and kept. The check shows only Verse 1's problem. On stage, `triggerFor` uses the same exceptions: Verse 3's first slide goes up before Verse 1's second, which then covers it.
- `[{section:'Verse 1', start:-1, changes:[7]}, {section:'Verse 3', start:-1}]`. Verse 3's start (28) is judged against the dropped change on 28 and dropped, though against the even split's 16 it is valid. Its line is recomputed after the delete and reads "Ancient Gates: slide timing Verse 3 1, start -1 passes null".

**Recommended fix**
```diff
-  const passing = bar === null ? [] : [...exceptions].filter(([index, { start }]) => start !== undefined && passes(presentation, song, index, start, bar, exceptions, before) !== null);
-  for (const [index, exception] of passing) {
-    problems.push({ n: exception.n, line: `${songTitle(song)}: ${exception.label}, start ${exception.start} passes ${passes(presentation, song, index, exception.start!, bar!, exceptions, before)}` });
-    exceptions.delete(index);
-  }
+  for (const index of [...exceptions.keys()].sort((a, b) => a - b)) {
+    const exception = exceptions.get(index)!;
+    if (bar === null || exception.start === undefined) continue;
+    const bound = passes(presentation, song, index, exception.start, bar, exceptions, before);
+    if (bound === null) continue;
+    problems.push({ n: exception.n, line: `${songTitle(song)}: ${exception.label}, start ${exception.start} passes ${bound}` });
+    exceptions.delete(index);
+  }
```
Diff audit: the removed lines did four things. (1) They skipped the pass with no bar: kept by the `bar === null` continue. (2) They judged only entries with a start: kept. (3) They pushed one problem per dropped entry and deleted the entry: kept. (4) They judged against first-pass entries: dropped on purpose, which is this finding. The pushes now come in section order, not Map insertion order, but `problems` is still sorted by `n` on return, so the check's file-order lines are unchanged. The fix adds no fallback.

**Remediation brief**
- **Design intent:** the first pass resolves each entry on its own rules and keeps the standing ones. The second pass drops an entry whose `start` lands at or before the section before's last change, as that section will play. That is the plan of the entry standing for that section, or its even split or name match when none stands. A section's bound depends only on the section before it, so judging in section order makes every judgment final. The cue path (`triggerFor`) and the check (`checkLines`) read the same `resolveTiming`, so the fix moves both.
- **Full surface:** `src/server/propresenter.ts:1040-1044` (the diff). The comment at `:1038-1039`, "judged on the first pass's entries, drops its entry whole", becomes "judged in section order, against the section before as its entry stands once judged, drops its entry whole". The two tests from `repro/review-5-finding-2-test.diff`, at the top of `describe('the pickup start')` in `test/propresenter.test.ts`. The #301 ticket assumption is overturned (Approach decisions).
- **Must preserve:** "names a start of 0, of 1, a start that is not a number, and one that passes Verse 1's last change as problems, in file order" (`test/propresenter.test.ts:4251`), "takes an entry with only a start, which lands after the section before its last change" (`:4282`), "notes a start that passes its section's own last change…" (`:4780`), and all of `the slide timing file` and `the pre-service check`. Suites: `test/propresenter.test.ts`, `test/pre-service-check.test.ts`, `test/connections.test.ts`, all green with the candidate. `pnpm typecheck` stays clean, and the `!` assertions on `exception.start` and `bar` go.
- **Do not touch:** `passes()` and its bound rule (`start` without the lead, at or on the change counts as passing). That is a recorded #301 assumption and is not in question. Also `boundBefore` (Reviewed and Dismissed).
- **Proof:** `git apply docs/reviews/setlist-controller-275/repro/review-5-finding-2-test.diff`, then `pnpm exec vitest run test/propresenter.test.ts -t "the section before"`. Both tests are red now and green with the fix. The candidate diff is `repro/review-5-finding-2-candidate.diff`.

### 3. #308's queue: dropping a queued cue on going offline has no test, and the two order tests can go red under load with no bug — LOW
- **Location:** `src/server/propresenter.ts:678-679` (`given.aborted ? null : command(path)`); `test/propresenter.test.ts:3714-3724` (`cuesReceived`), used by `:3726` and `:3750`
- **Attribution:** introduced by `2f2c8b4` (setlist-controller#308 A clear and the next slide go to ProPresenter unqueued, so the screen can stay blank).
- **Real-world trigger:** none on stage. A later change that loses the offline drop stays green. Then a cue queued behind a request that timed out (15 s in production) goes out after ProPresenter comes back, putting up a stale slide. Separately, the order tests can flake when two lanes run the suite at once.

**Evidence**
```ts
  // slide, polled for up to 400 ms, under the rig's 1000 ms request timeout, or until both came.
    for (let tries = 0; tries < 16 && received.length < 2; tries += 1) {
```
With a correct queue only one cue arrives, so the poll always runs its full 16 × 25 ms, then `pro!.answer()`. The rig's `requestTimeoutMs: 1000` (`test/propresenter.test.ts:81`) is real time (`AbortSignal.timeout`, `src/server/propresenter.ts:398`). When the hang lasts past 1000 ms, the clear times out, ProPresenter goes offline, and the test sees something other than `[CLEAR]`. The finder measured 429 to 433 ms on an idle machine, a margin of about 2.3×. With `given.aborted ? null :` removed, all 244 tests in the file pass (finder, executed).

**Failure mode** — coverage gaps under the shared rules "a test for every fallback path" and "tests that can go red". The flake turns a correct build red under load.

**Recommended fix**
- Cut the poll to `tries < 6` (150 ms). An unqueued second request arrives within milliseconds on localhost, so 150 ms still catches it with room to spare. Update the comment above `cuesReceived` to "polled for up to 150 ms".
- Add a test beside `:3726`, in `the lyric lead`. Use the same set-up through `pro!.hang()` and `await play(4.5, 44.5)`. Wait with `await new Promise((resolve) => setTimeout(resolve, 1200))`, past the rig's 1000 ms timeout, so the clear times out and ProPresenter goes offline. Then `pro!.answer()`, and expect `pro!.requests.slice(from).map(({ path }) => path)` not to contain `trigger(HOLY_FOREVER, 0)` within a further 200 ms.

**Remediation brief**
- **Design intent:** cue requests are chained on `cuesSent`. Each one starts once the one before is answered, refused, timed out or cut off, and a cue still waiting when the connection is aborted (going offline) is never sent. The row's buttons are not queued.
- **Full surface:** `test/propresenter.test.ts:3714-3724` and one new `it` after `:3748`. No source change.
- **Must preserve:** the two order tests' red without the queue. In a scratch worktree, replace `cuesSent.then(() => (given.aborted ? null : command(path)))` with `command(path)`: both must still fail with the 150 ms poll. The new test must fail with `given.aborted ? null :` removed.
- **Do not touch:** `cuesSent`, `command` and the #298 `run === presses` guard (all mutation-pinned, verify table).
- **Proof:** `pnpm exec vitest run test/propresenter.test.ts -t "one at a time"`, plus the new test's name, green. Each goes red under its mutant.

### 4. Several new tests assert less than their titles claim — LOW
- **Location:** `test/propresenter.test.ts:2846`, `:3864`, `:3912`, `:4557`, `:4719` (its second round, `:4737-4743`), `:4780`
- **Attribution:** introduced by the commits that added each test: `d77e3a0` (#295, `:2846`), `0205263` (#306, `:3864`), `ea899f7` (review 3 finding 1, `:3912`, review 4 finding 2 untouched), `e56a8f7` (#301, `:4557`, `:4719`, `:4780`).
- **Real-world trigger:** none on stage. Each test would stay green through the regression its title rules out.

**Evidence and failure mode**
- `:2846` (the 1-beat Turnaround): the only full-list assertion comes after `play(1, 25.5)`, which also crosses Verse 2's downbeat. So "Verse 2's first slide at once after the clear" is unpinned: a slide that waited for its downbeat gives the same four paths. The `.at(-1)` line adds nothing beside the `toEqual`.
- `:3864` and `:3912`: Holy Forever's Count Off and its Intro both show index 0, so `[HF/0, HF/0]` cannot tell "the Intro early" from "the Count Off again". In `:3864` the server clock never moves between the reports at 41 and 43.5, so the moved-prediction cancel alone would resend, masking the jump's cancel (by reasoning). This repeats review 4 finding 2.
- `:4557`: `before` is counted after the report at 12, where Holy Forever's Ending group would be due, so `slice(before)` hides a `trigger(HOLY_FOREVER, 24)` on that report. Today the full list is `[WOIA/0]` and `before` is 0 (finder, executed).
- `:4737-4743`: the second loop round checks only after a report that crosses the wrap, so a pickup that never went early on the clock passes.
- `:4780`: `toContain` on the notes passes with an extra wrong note.

**Recommended fix**
- `:2846`: assert the full four-path list right after `play(8.5, 24.5)`, and drop the `.at(-1)` line.
- `:3864`, `:3912`: pin each send's time with `clockTo(reported, x - 1)` / `clockTo(reported, x)` pairs, as `:4719`'s first round does. In `:3864`, advance the server clock with the reports (`clockTo` before `play`).
- `:4557`: `expect(await sent()).toEqual([trigger(WORTHY_OF_IT_ALL, 0)])` on the whole list.
- `:4737-4743`: add `await clockTo(reported, 4 * BEAT_MS - 1)` with `slice(before)` equal to `[]`, then `clockTo(reported, 4 * BEAT_MS)` with `[trigger(HOLY_FOREVER, 9)]`, before the `play`.
- `:4780`: `toEqual` on the whole notes list, taken from the test's run at HEAD and read line by line.

**Remediation brief**
- **Design intent:** the epic's seam rule: a test asserts the whole list ProPresenter received, at the clock times that matter, so a send at the wrong time or a duplicate shows.
- **Full surface:** the six tests above. No source change.
- **Must preserve:** each test's current red at the commit before the one that added it (`git log -S'<title>' 98f15c4..HEAD`). Tighten, never delete. `:3912` is review 3 finding 1's proof, so keep it.
- **Do not touch:** source.
- **Proof:** `pnpm exec vitest run test/propresenter.test.ts` green. For `:2846`, the tightened assertion goes red with `src/server/connections.ts` from `0a47411`'s parent (before #295's fix) in a scratch worktree.

### 5. Fallback paths and boundaries the branch added with no test — LOW
- **Location:** `src/server/propresenter.ts:485` (`libraries.some((answer) => answer?.status !== 200)`), `:1302-1304` (`itemNamesIn` returns `[]` for a body with no `items`), `:1055-1060` (`boundBefore`'s "the end of <song>" bound); the #301 pickup cancels; #307 at n slides in n beats
- **Attribution:** `f21db09` (#297, the library paths, review 3 finding 3, untouched), `e56a8f7` (#301), `48d8df9` (#307).
- **Real-world trigger:** none known on stage. A later change that breaks one of these paths stays green. The no-`items` path turns a read failure into a false typo problem for every title outside the set (review 3 finding 3).

**Evidence:** `git grep -n "passes the end of" test/` finds nothing, and "passes the start of the set" appears only in this review's repro. The fake lists one library named `Default` (`test/fake-propresenter.ts:194-197`), and `refuseLibraries` (`:458`) refuses only the list. So a refused single library, a body with no `items`, a second library and a name that needs `encodeURIComponent` cannot be reached. The pickup cancels are tested for Stop, a jump, a Fade out and a loop on (`test/propresenter.test.ts:4791-4845`), not for a loop off or a moved prediction. No vamp test has a start due exactly on the clear's downbeat (`vampRig(-0.5)`, due on 96). No check test has n slides in exactly n beats (a note, not a problem).

**Recommended fix**
- In the fake, hold two libraries, one named `Songs & Hymns`, split the presentations between them, and add `refuseLibrary(name, status)` and a no-`items` answer. Then add two check tests: one library refused gives "slide timing <titles>: not checked, ProPresenter's libraries could not be read", and so does a body with no `items`. The latter needs review 3 finding 3's one-line fix: `if (libraries.some((answer) => answer?.status !== 200 || !Array.isArray((answer.body as { items?: unknown } | null)?.items))) return null;`
- Add `vampRig(-0.5)`: the clear never sent, the Chorus's first slide on 96.
- Add a loop-off pickup cancel beside `:4834`.
- Add a check test for a cross-song bound ("passes the end of Ancient Gates"), and one for 4 slides in a 4-beat section (a "changed on beats" note, no problem).

**Remediation brief**
- **Design intent:** every fallback the branch wrote has a test that fails without it.
- **Full surface:** `test/fake-propresenter.ts:194-197`, `:341-356`, `:458`; `test/fake-propresenter.test.ts` for the new fake controls; new tests in `test/propresenter.test.ts` (`the slide timing file`, `the pickup start`); `src/server/propresenter.ts:485` only for the no-`items` fix.
- **Must preserve:** `test/fake-propresenter.test.ts:119-141`, and the "not checked" test through the list (`grep -n "could not be read" test/propresenter.test.ts`).
- **Do not touch:** `titleProblems`' rule (a title in the set needs no library read).
- **Proof:** `pnpm exec vitest run test/fake-propresenter.test.ts test/propresenter.test.ts` green. The no-`items` test is red without the one-line fix.

### 6. Comment hygiene — LOW (aggregated)
- `README.md:49` → "that song's End, when it falls inside that lead, sends nothing" → "that song's End, when it falls inside that lead and that slide went up early, sends nothing; when a Fade out, a loop change or a moved prediction stopped that slide, the End goes as usual" (carried from review 3)
- `README.md:49` → "A song the playhead has not been in since the set was read or the server started" → "A song the playhead has not been in since the set last changed or the server started" (carried from review 3)
- `docs/install.md:282` → "since the set was read or the server started" → "since the set last changed or the server started" (carried from review 3)
- `README.md:49` → "A section whose group holds more slides than the section has whole beats loses its last slides" → "A section whose even split puts a slide at or past the section's end, as a group with more slides than the section has whole beats does, loses its last slides"
- `docs/install.md:286` → "names each section whose group holds more slides than the section has whole beats as a problem" → "names each section whose even split puts a slide at or past the section's end, as more slides than whole beats does, as a problem"
- `src/server/propresenter.ts:844-846` → "A section whose group holds more slides than the section has whole beats gets no such note" → "A section whose even split drops slides (dropsSlides) gets no such note" (a 4.5-beat section with 5 slides drops none)
- `src/server/connections.ts:605-607` → "…which went early to the target: only a crossing actually sent drops the End." → "…which went early to the target, the crossing or a later change of the next song that only the chain from the crossing reaches: only a crossing actually sent drops the End." (carried from review 4)
- `test/propresenter.test.ts:4255` → "so a start of -5 lands on beat 12 and one of -3 on beat 20." → "so a start of -5 lands on beat 12." (no entry has -3)
- `test/fake-propresenter.ts:46` → "a library it does not hold is a 404;" → "a library it does not hold is a 404." (carried from review 3)

## Needs Further Investigation
### A. The early mark outlives going offline, a pause by hand and a disarm, and could drop a real End or clear
`entry.early` is never reset on the offline report, in `changedByHand`, or on arm and disarm (finder grep of every assignment). The paused or offline `continue` at the top of `deliver` and `moved` also skips ageing it out. `droppedEnd` and `droppedClear` (`src/server/connections.ts:608-641`) still read it. So if the crossing went early, then ProPresenter went offline and back, or the operator pressed a slide by hand and the producer re-armed, all before the End, the End's clear could be dropped over a screen the server did not set. Before this branch the stale mark only suppressed a re-send inside a song. The branch widens it to clears and Ends. What confirms it: a seam test in `the lyric lead` with the crossing sent early, then `pro.showSlide` by hand, a re-arm, then the End. The window is under `leadBeats`, so its attainability is low.

### B. A `start` on the next song's first section, planned during a crossing, uses the song before's meter
`plan(cue, bar)` gets `bar()`, the signature Live reports now (`src/server/connections.ts:406`, `src/server/server.ts:209`), so a crossing into a song of another meter turns its `start` into beats with the song before's bar. The check uses that song's remembered meter. What confirms it: a 6/8 song into a 4/4 song whose first section has a `start`, in a seam test with a per-song signature, as #293's tests set it. Related to #304. The candidate fix is `meters().get(cue.song) ?? bar()` at `:406`, but it needs its own proof.

### C. Carried for #284's home run
Whether AbletonOSC reports the time signature before the playhead on a boundary (#304, review 3 finding 2, deferred by Nick). The real `GET /v1/libraries` answers. Whether `config/slide-timing.json`'s Worthy Of It All entries fit the home presentation (review 4 C).

## Reviewed and Dismissed
- #308's queue reorders, blocks playback, or misaligns the press-by-hand window. Dismissed: `cue()` is synchronous and `command` never rejects, so the chain holds. `commandsOut` rises when the request starts, and `windowEnd` is set from its answer. `expected` and `cueOut` set at hand-off keep the second cue's slide expected (finder B).
- The #301 pickup cancel tests (`test/propresenter.test.ts:4791-4845`) are vacuous because they pass at base. Dismissed: base has no pickup, so they are green there by construction. Their clock windows run past the pickup's send time (`4 * BEAT_MS + 100` from 104 covers 108), so with a cancel removed at HEAD the pickup would arrive. They pin the cancels.
- A `start` on a song's first section is always a problem when the song before's End sits on its first locator (`boundBefore`). Dismissed: this is the issue's rule, a start may not pass the section before's last change, and the End is that change. Built sets open each song with a Count Off, which has no group and takes no start.
- `dropsSlides` depends on the meter. Dismissed: with no more slides than bars the split never reaches the end, and with more it runs on beats in any meter (finder B).
- #296, #305 and #306 miss their End states. Dismissed by tracing: the loop press reads the asked-for loop (`controller.loop()`), a song with no End `continues()`, and a jumped End is dropped and reschedules through `following` (finder A).
- A wrap with a pickup leaves its early mark behind. Dismissed: `back()` runs before `reached()` in `deliver`, so the wrap's landing forgets it.
- Signature report before the position report (review 3 finding 2). Not re-reported: deferred by Nick and tracked as #304, skipped in this run.

## Minor / nits
- Switching a song's end toggle to stop after the playhead passed its End but before the next downbeat forgets the crossing, and the downbeat re-sends the same index (`src/server/connections.ts:937-944`). There is no visible change.
- `seenPlaysOn` is keyed by song number and never reset on a new set (`:934-936`). A re-read set with other default toggles reads as a toggle change.
- `playsOn` builds a whole controller snapshot per song on every published state (`src/server/server.ts:216`).
- The #307 problem says "needs a slide timing entry" for a section that already has a group-only or start-only entry (`src/server/propresenter.ts:913-914`). "needs slide timing changes" would be exact.
- A bound that is a clearing or slide-1 section reads "<name>'s last change" (`passes()`), where the docs call it the downbeat.
- `resolveEntry`: `if (outside !== undefined && bar !== null)`, the `bar !== null` is redundant.
- #308 by design: a cold or hung trigger holds the queue (up to `REQUEST_TIMEOUT_MS`), and a Next press during a backlog is overtaken by queued cues sent after it.

## Test quality
Tests added: 103 · modified: 11 · red against `98f15c4`: 85 · green against `98f15c4`: 29 · tautology shapes found: 0. The 29 green ones:
- Deliberate guards of behaviour the issue keeps: `:784` (#291), `:2545`, `:3158`, `:3526` (#292), `:3285` (#296), `:3686`, `:3698`, `:3771`, `:3784` (#294), `:3883`, `:3895` (#306), `:3965` (#305), `:4317`, `:4330`, `:4758`, `:4496`, `:4511`, `:4585` (#301).
- Pickup cancels green by construction: `:4791`, `:4808`, `:4820`, `:4834` (Reviewed and Dismissed).
- `notes: []` type syncs: `test/pages.test.ts:680`, `:693`, `:1334`, `:1346`.
- Tests of the fake's own library endpoints: `test/fake-propresenter.test.ts:119`, `:135`, `:141`.

None was added by a review-finding commit. Every test those commits added is red at base. `test/pre-service-check.test.ts` is red at base as a whole, through its `notes: []` constants; with those stripped, its 9 new tests stay red. What to strengthen is in findings 3, 4 and 5. Delete nothing.

## Before opening the PR
- **CI readiness:** the repo has no CI (removed in PR #300). Lint, typecheck, the unit suite (1863 passed), build and e2e (56 passed) are green at `6c3b6a1`.
- **Commit hygiene:** clean tree. This review adds this doc and `repro/review-5-finding-1-test.diff`, `repro/review-5-finding-1-candidate.diff`, `repro/review-5-finding-2-test.diff` and `repro/review-5-finding-2-candidate.diff`.
- **Likely reviewer asks:** the home run (#284) for C; whether #304 blocks the merge; why the #308 queue tests rely on real-time waits.

## Verdict
**Not ready as-is.** The gate is finding 1 (MEDIUM, introduced by #292): fix it with its one line and its test before the PR opens. Findings 2 to 6 are LOW. Finding 2 is a small, proved fix worth taking now, since story 34 expects a service to run with a broken entry in place. The rest can ride along or become follow-up tickets. Nothing is CRITICAL or HIGH. No prior finding was "resolved" only by a comment edit. Review 3 finding 3 and review 4 finding 2 stay open, folded into findings 5 and 4.

## Remediation — 2026-11-04
Scope: CRITICAL, HIGH and MEDIUM, the default. That is finding 1 only. Findings 2 to 6 are LOW and deliberately deferred to Nick (eng-pipeline#34).

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `a1bcc5b` setlist-controller#275 pre-PR review 5 finding 1: A drag back inside a section that clears, after the next section's first slide went early, leaves that slide up and sends it again | red→green: `pnpm exec vitest run test/propresenter.test.ts -t "dragged back inside the Vamp"` (red at HEAD `b19ace7`: received only `…/12/trigger`, no `CLEAR`); preserve suites `test/propresenter.test.ts test/connections.test.ts test/cue-lateness.test.ts` 297 of 297; `pnpm typecheck` and `pnpm lint` clean; `pnpm test` 70 files, 1864 passed, 4 skipped | 0 new (the two gate lines are the existing comment above `movedBack`, rewritten as the brief's Full surface directs; the repro test's two narration comments were dropped) | fixed, proved by execution |
| 2 (LOW) | — deferred | — | — | LOW tail, not worked |
| 3 (LOW) | — deferred | — | — | LOW tail, not worked |
| 4 (LOW) | — deferred | — | — | LOW tail, not worked |
| 5 (LOW) | — deferred | — | — | LOW tail, not worked |
| 6 (LOW, comment hygiene) | — deferred | — | — | LOW tail, not worked |

Finding 1 was applied as briefed: the one added line in `movedBack` (`src/server/connections.ts:708`) and the brief's comment correction above it. The surface was re-verified: `movedBack` is the only move-back path, and the start-mid-section empty-plan hand (`:904`) is the precedent, not a second site. The optional second test (the crossing sent early, then a drag back inside a song's last section that clears) was not added; the same line covers it, by reasoning. One edge was probed by execution in a scratch worktree, since `due` is always null at a lead of 0: `vampRig(-1, 0)`, played to 99.25, dragged back to 99.1. Nothing went early at a lead of 0, so no clear was handed, and the Chorus's first slide went once on 100. No verify agent was dispatched: a MEDIUM fix proved red to green in the real runner with its preserve suites green is verified by execution (Phase 2 triage).

### Known regressions, deferred
- None.

### Rework briefs
- None.

### Approach decisions (this round)
- A drag back inside a section that clears (finding 1): applied as recommended above. `movedBack` hands the section's cue, the clear, only when the landing is before the change sent early's send point (`!due`), the plan holds no slide, and a change was sent early. Precedent: the start inside a section that hands the clear for an empty plan (`src/server/connections.ts:904`).
