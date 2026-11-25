# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line (re-review of review 5's remediation)

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `98f15c4`, Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing)
**Reviewed at:** HEAD `fe0c5ad` (setlist-controller#275 pre-PR review 5 remediation closure table). Clean tree: no uncommitted or untracked files. Against the merge-base: 33 files, +3794 / −314, 49 commits. Of those, the code, data and docs outside `docs/reviews/` are 22 files, +2888 / −314. This review adds this doc and 2 files under `repro/`.
**Delta under review:** since `6c3b6a1` (setlist-controller#307 A section with more slides than whole beats drops its last slides while the check says "changed on beats"), the HEAD that `pre-pr-review-5.md` reviewed. The delta is 7 files, +406 / −1: review 5's doc and 4 `repro/` files, and 2 code files, +24 / −1, from `a1bcc5b` (setlist-controller#275 pre-PR review 5 finding 1: A drag back inside a section that clears, after the next section's first slide went early, leaves that slide up and sends it again): one line and a comment in `src/server/connections.ts`, one test in `test/propresenter.test.ts`.
**Reviewed against:** epic `nick-vogel/setlist-controller#275`; `pre-pr-review-5.md` in full (finding 1's brief, its Approach decisions, its remediation closure table); prior docs 1 to 4 through review 5's carried Approach decisions. No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply.
**Date:** 2026-11-04
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `fe0c5ad` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 70 files, 1864 passed, 4 skipped, first run |
| Build | `pnpm build` | clean |
| E2E | `pnpm test:e2e` (OS-assigned ports) | 56 passed |
| Review 5 finding 1 fixed, against its intent | the new test with `src/server/connections.ts` from `6c3b6a1`, in a scratch worktree at `fe0c5ad`: `pnpm exec vitest run test/propresenter.test.ts -t "dragged back inside the Vamp"` | red without the fix (`expected [ Array(1) ] to deeply equal [ …(2) ]`, no clear at the drag), green with it. The test asserts the whole list since the early slide at the drag and after the Chorus's downbeat, so a second send of slide 12 on 100 would show |
| Mutation of each guard of the new line | each condition removed in turn in a scratch worktree, `pnpm exec vitest run test/propresenter.test.ts test/connections.test.ts test/cue-lateness.test.ts` | `plan.length === 0` removed: 1 red ("sends Verse 3's first slide once, 2 beats before the wrap of a brace set by hand inside it"). `early` removed: 297 of 297 green. `!due` removed: 297 of 297 green (finding 1) |
| Nothing sent early, drag back inside the Vamp (finder probe, executed) | throwaway test in the finder's scratch worktree | `[]` after the drag, `[…/12]` on 100.5: the guard holds, but no test pins it |
| Clear slide button, then the drag (finder probe, executed) | throwaway test: Chorus slide 12 early on 98, the row's Clear slide button, drag to 96.5 | `[…/12, CLEAR, CLEAR, …/12]`: a second, invisible clear (Minor / nits) |
| Other target kinds reaching `movedBack` (finder) | `moved` skips a target with no `plan` (`src/server/connections.ts:894`); grep of `plan(` in `src/server/*.ts` | ProPresenter is the only target with a plan. Dismissed |
| Prior findings still open | `git diff --stat 6c3b6a1 HEAD -- src test config web README.md docs/install.md` names only the two delta files; each prior LOW's site grepped at HEAD | review 5 findings 2 to 6 untouched, carried below with HEAD line numbers |
| Tautology audit (Phase 4.5) | the one new test, red without the fix (row above) | 1 new test, red at `6c3b6a1`'s code, 0 tautology shapes |
| Shipped copy | the delta's added lines grepped for an em-dash | none |
| Not run | the real ProPresenter and Live; AbletonOSC's report order; the home presentations behind `config/slide-timing.json` | the guardrails forbid driving Live; #284 is Nick's home run |

**Overall:** Review 5's one MEDIUM is fixed and proved: the drag back inside the Vamp now clears the screen at once, and the Chorus's first slide goes once more on its lead. Every full check is green. Nothing new is MEDIUM or above. The only new finding is LOW: two of the new line's three guards can be removed with every test green, and the crossing case the finding named has no test. Review 5's LOW tail (findings 2 to 6) is untouched and carried. The branch is ready to open the PR, with the LOWs as follow-ups or ride-alongs.

## Approach decisions
- Carried from review 4: the End inside the crossing's lead is judged by `droppedEnd`, by the crossing itself and by whether the change remembered as sent early is the crossing or a later change of the next song. Unchanged.
- Carried from review 4: a song's meter on a signature report (review 3 finding 2) is deferred by Nick to #304, and #284's home run records AbletonOSC's report order. Not re-reported here.
- Carried from review 3: a library body with no `items` list reads as "could not be read", never as an empty library (recommended, still not worked; finding 5).
- Carried from review 5, applied in `a1bcc5b`: a drag back inside a section that clears hands the section's cue, the clear, only when the landing is before the change sent early's send point (`!due`), the plan holds no slide, and a change was sent early. Precedent: the start inside a section that hands the clear for an empty plan (`src/server/connections.ts:906`). This review keeps the mechanism and adds tests for its guards (finding 1).
- Carried from review 5, recommended, not worked: the second pass of `resolveTiming` judges entries in section order, each `start` against the section before as its entry stands once judged. This overturns the #301 ticket assumption "judged against the first pass's exceptions" (finding 2).

## Confirmed Issues

### 1. The new drag-back clear's guards and its crossing case have no test, so two of its three conditions can go with every test green — LOW
- **Location:** `src/server/connections.ts:708`; `test/propresenter.test.ts:4622` (the one test added)
- **Attribution:** introduced by `a1bcc5b` (setlist-controller#275 pre-PR review 5 finding 1: …), the remediation of review 5 finding 1. Review 5's brief named the nothing-sent-early case as Must preserve and the crossing case as an optional second test; neither was added.
- **Real-world trigger:** none on stage today. A later change that drops `early` sends a second clear on every drag back inside an instrumental with nothing early, and one that drops `!due` re-sends the early slide on a drag back that lands after its send point. Both stay green. LOW, a coverage gap under the shared rules "tests that can go red" and "a test for every fallback path".

**Evidence**
```ts
    if (landed.slide !== undefined && (showing?.song !== landed.song || showing.slide !== landed.slide)) hand(entry, landed, null, 'not-played-across');
    else if (!due && plan.length === 0 && early) hand(entry, landed, null, 'not-played-across');
```

**Failure mode** — executed: with `docs/reviews/setlist-controller-275/repro/review-6-finding-1-mutant-no-early.diff` applied, and separately with `repro/review-6-finding-1-mutant-no-due.diff`, `test/propresenter.test.ts`, `test/connections.test.ts` and `test/cue-lateness.test.ts` stay 297 of 297 green. Only removing `plan.length === 0` goes red. By reasoning, from the code: without `early`, `vampRig`'s drag back to 96.5 before 98 (nothing early yet) hands a second clear; without `!due`, a drag back to 98.5 after slide 12 went early on 98 finds `showing` equal to `landed` and hands `…/12` again. The crossing case (a song's last section that clears, the next song's first slide sent early, a drag back inside that last section) runs through the same line and is untested.

**Recommended fix** — three tests in `describe('the pickup start')` beside `:4622`, each asserting the whole `(await sent()).slice(before)` list:
- Nothing sent early: `timingRig(84, { cuePoints: VAMP_CUE_POINTS, slideTiming: await timingFile({}), leadBeats: 'default' })`, `play(12.25, 96.25)`, take `before` after the Vamp's clear, drag to 96.5 before 98 (`rig!.live.setPosition(96.5)` awaited with `next((snapshot) => near(snapshot.position, 96.5))`). Expect `[]` after the drag, then `[trigger(WORTHY_OF_IT_ALL, 12)]` after `play(4, 100.5)`. Red under the no-early mutant.
- Landing inside the lead after the early send: as `:4622` to slide 12 on 98, then drag back to 98.1 (still at or after 98, the send point). Expect `[trigger(WORTHY_OF_IT_ALL, 12)]` after the drag and after `play(…, 100.5)`. Red under the no-due mutant.
- The crossing: a set whose song's last section clears before its End, with the next song's first slide sent early on the lead, then a drag back inside that last section before the send point. Expect `[<next song's first slide>, CLEAR]` after the drag, then the next song's first slide once more on its lead. Build it from the closest existing crossing rig in `the lyric lead` (`grep -n "crossing" test/propresenter.test.ts`).

**Remediation brief**
- **Design intent:** a target with a lead holds one waiting change and one remembered change sent early (`entry.early`), which is what the screen shows until a cue replaces it. On a move back inside the playing section, `movedBack` re-derives the slide for the landing: the change sent early when the landing is at or past its send point (`due`, still remembered), else the plan's slide at the landing. In a section that clears, the plan is empty and the slide is the clear, handed only when a change went early, since otherwise the screen already shows the clear. The schedule then runs on from the landing.
- **Full surface:** `test/propresenter.test.ts`, three new `it` blocks after `:4622`. No source change.
- **Must preserve:** the test at `:4622` ("blanks the screen when the playhead is dragged back inside the Vamp…"), "sends nothing on a drag back that lands inside the lead before a slide that went early, nor when the playhead plays across its beat" (`grep -n "sends nothing on a drag back that lands inside the lead" test/propresenter.test.ts`), and the brace-wrap test that pins `plan.length === 0` ("sends Verse 3's first slide once, 2 beats before the wrap of a brace set by hand inside it"). Suites: `test/propresenter.test.ts`, `test/connections.test.ts`, `test/cue-lateness.test.ts`.
- **Do not touch:** `src/server/connections.ts:708` and the `due` branch (the fix is right; Reviewed and Dismissed). Stale `early` after a row button is pre-existing and separate (Needs Further Investigation A).
- **Proof:** in a scratch worktree at HEAD, with the new tests, `git apply docs/reviews/setlist-controller-275/repro/review-6-finding-1-mutant-no-early.diff`, then `pnpm exec vitest run test/propresenter.test.ts -t "the pickup start"`: the nothing-early test red. Same with `repro/review-6-finding-1-mutant-no-due.diff`: the inside-the-lead test red. Without a mutant, all green.

### 2. The slide timing check judges a `start` against entries it drops in the same pass, so a start that plays out of order can pass and a valid one can be dropped as "passes null" — LOW
- **Location:** `src/server/propresenter.ts:1038-1044` (the second pass of `resolveTiming`)
- **Attribution:** introduced by `e56a8f7` (setlist-controller#301 A slide timing entry puts a section's first slide up early for a pickup line). Review 5 finding 2, untouched by the delta (`git diff 6c3b6a1 HEAD -- src/server/propresenter.ts` is empty).
- **Real-world trigger:** a slide timing file with `start` entries on two adjacent sections of one song, where the earlier one is dropped in the second pass. LOW, capped: no song in the library has adjacent pickups today. Upgrade to MEDIUM if `config/slide-timing.json` gives `start` to two adjacent sections of one song.

**Evidence, failure mode, recommended fix and remediation brief:** unchanged from `docs/reviews/setlist-controller-275/pre-pr-review-5.md`, finding 2, which this doc adopts as written: its diff, Design intent, Full surface (`src/server/propresenter.ts:1038-1044`), Must preserve (`test/propresenter.test.ts:4251`, `:4282`, and `:4801`, review 5's `:4780` moved by the delta's 21 added lines), Do not touch, and Proof (`git apply docs/reviews/setlist-controller-275/repro/review-5-finding-2-test.diff`, then `pnpm exec vitest run test/propresenter.test.ts -t "the section before"`; the candidate is `repro/review-5-finding-2-candidate.diff`). Before applying either diff, run `git apply --check` on it; the delta did not touch the lines either diff covers.

### 3. #308's queue: dropping a queued cue on going offline has no test, and the two order tests can go red under load with no bug — LOW
- **Location:** `src/server/propresenter.ts:679` (`given.aborted ? null : command(path)`); `test/propresenter.test.ts:3716` (`cuesReceived`), used by `:3726` and `:3750`
- **Attribution:** introduced by `2f2c8b4` (setlist-controller#308 A clear and the next slide go to ProPresenter unqueued, so the screen can stay blank). Review 5 finding 3, untouched.
- **Real-world trigger:** none on stage. A later change that loses the offline drop stays green, and the order tests poll for 400 ms against the rig's real-time 1000 ms request timeout, so load can turn them red.

**Brief:** review 5 finding 3, adopted as written: cut the poll to `tries < 6` (150 ms) and its comment to "polled for up to 150 ms"; add the offline-drop test beside `:3726` (hang, `play(4.5, 44.5)`, wait 1200 ms, `pro!.answer()`, expect no `trigger(HOLY_FOREVER, 0)` within 200 ms). Must preserve: the two order tests still red with `cuesSent.then(() => (given.aborted ? null : command(path)))` replaced by `command(path)`; the new test red with `given.aborted ? null :` removed. Proof: `pnpm exec vitest run test/propresenter.test.ts -t "one at a time"` plus the new test's name.

### 4. Several new tests assert less than their titles claim — LOW
- **Location:** `test/propresenter.test.ts:2846`, `:3864`, `:3912`, `:4557`, `:4740` (its second round, `:4758-4764`), `:4801`. Review 5 named the last three as `:4719`, `:4737-4743` and `:4780`; the delta's test moved them by 21 lines.
- **Attribution:** the commits that added each test: `d77e3a0` (#295), `0205263` (#306), `ea899f7` (review 3 finding 1), `e56a8f7` (#301). Review 5 finding 4, untouched.
- **Real-world trigger:** none on stage. Each test stays green through the regression its title rules out.

**Brief:** review 5 finding 4, adopted as written, at the line numbers above: the full four-path list after `play(8.5, 24.5)` in `:2846`; `clockTo` pairs pinning each send's time in `:3864` and `:3912`; the whole list in `:4557`; the `4 * BEAT_MS - 1` / `4 * BEAT_MS` pair in `:4758-4764`; `toEqual` on the whole notes list in `:4801`. Tighten, never delete; `:3912` is review 3 finding 1's proof. Proof: `pnpm exec vitest run test/propresenter.test.ts` green.

### 5. Fallback paths and boundaries the branch added with no test — LOW
- **Location:** `src/server/propresenter.ts:485`, `:1302-1304`, `:1055-1060`; the #301 pickup cancels (`test/propresenter.test.ts:4812-4866`, review 5's `:4791-4845`); #307 at n slides in n beats
- **Attribution:** `f21db09` (#297, review 3 finding 3, untouched), `e56a8f7` (#301), `48d8df9` (#307). Review 5 finding 5, untouched.
- **Real-world trigger:** none known on stage. The no-`items` path turns a library read failure into a false typo problem for every title outside the set.

**Brief:** review 5 finding 5, adopted as written: two libraries in the fake (one named `Songs & Hymns`), `refuseLibrary(name, status)` and a no-`items` answer, with check tests for both and review 3 finding 3's one-line fix at `src/server/propresenter.ts:485`; `vampRig(-0.5)`; a loop-off pickup cancel beside `:4855`; a "passes the end of Ancient Gates" check test; a 4-slides-in-4-beats note test. Proof: `pnpm exec vitest run test/fake-propresenter.test.ts test/propresenter.test.ts` green, the no-`items` test red without the fix.

### 6. Comment hygiene — LOW (aggregated)
- `src/server/connections.ts:691-693` → "hands the section's clear when a change went early, since the screen shows that change, and nothing otherwise" → "hands the section's cue when a change went early, as a start inside a section does, which is its clear for a section that clears and nothing for a song not on Master, since the screen shows that change; and nothing otherwise" (new, from the delta: ProPresenter's `plan()` is also empty for a cue that sends nothing, `src/server/propresenter.ts:755-758`)
- `README.md:49` → "that song's End, when it falls inside that lead, sends nothing" → "that song's End, when it falls inside that lead and that slide went up early, sends nothing; when a Fade out, a loop change or a moved prediction stopped that slide, the End goes as usual" (carried from review 3)
- `README.md:49` → "A song the playhead has not been in since the set was read or the server started" → "A song the playhead has not been in since the set last changed or the server started" (carried from review 3)
- `docs/install.md:282` → "since the set was read or the server started" → "since the set last changed or the server started" (carried from review 3)
- `README.md:49` → "A section whose group holds more slides than the section has whole beats loses its last slides" → "A section whose even split puts a slide at or past the section's end, as a group with more slides than the section has whole beats does, loses its last slides" (carried from review 5)
- `docs/install.md:286` → "names each section whose group holds more slides than the section has whole beats as a problem" → "names each section whose even split puts a slide at or past the section's end, as more slides than whole beats does, as a problem" (carried from review 5)
- `src/server/propresenter.ts:844-846` → "A section whose group holds more slides than the section has whole beats gets no such note" → "A section whose even split drops slides (dropsSlides) gets no such note" (carried from review 5)
- `src/server/connections.ts:605-607` → "…which went early to the target: only a crossing actually sent drops the End." → "…which went early to the target, the crossing or a later change of the next song that only the chain from the crossing reaches: only a crossing actually sent drops the End." (carried from review 4)
- `test/propresenter.test.ts:4255` → "so a start of -5 lands on beat 12 and one of -3 on beat 20." → "so a start of -5 lands on beat 12." (carried from review 5)
- `test/fake-propresenter.ts:46` → "a library it does not hold is a 404;" → "a library it does not hold is a 404." (carried from review 3)

## Needs Further Investigation
### A. A row button does not forget the change sent early, so the playhead reaching that change can send nothing after the operator cleared it
`case 'run-button'` (`src/server/connections.ts:799-800`) runs the button through `safely` and never resets `entry.early`; only `hand`, `back`, `reached`, `observed` and `movedBack` do. So when the Chorus's first slide went early on 98 and the operator presses the row's Clear slide button, `wentEarly` (`:467`) can make the Chorus's downbeat on 100 send nothing, and the slide never comes back up. Pre-existing, untouched: `98f15c4`'s `connections.ts` has the same `run-button` case (`:596`) and `wentEarly` (`:382`). Reasoned by the finder, not executed. What confirms it: a seam test in `the pickup start` with `vampRig`, slide 12 sent early, the row's Clear slide button, then `play(…, 100.5)`, expecting `…/12` once more. A row button with no pause is a deliberate operator action, so whether the next change should follow it is a product question for Nick. The fix candidate is `entry.early = null` beside the `safely` call. Related to review 5 NFI A (the early mark outlives going offline, a press by hand and a disarm), which stays open.

### B. Carried from review 5: the early mark outlives going offline, a press by hand and a disarm, and could drop a real End or clear
Unchanged; see `pre-pr-review-5.md`, Needs Further Investigation A.

### C. Carried from review 5: a `start` on the next song's first section, planned during a crossing, uses the song before's meter
Unchanged; see `pre-pr-review-5.md`, Needs Further Investigation B. Related to #304.

### D. Carried for #284's home run
AbletonOSC's signature report order (#304), the real `GET /v1/libraries` answers, and whether `config/slide-timing.json`'s Worthy Of It All entries fit the home presentation.

## Reviewed and Dismissed
- The new line reaches a target other than ProPresenter. Dismissed: `moved` skips every target with no `plan` (`src/server/connections.ts:894`), and ProPresenter is the only target that implements one.
- `early` is a wrap in a section that clears, so the clear lands over a wrap. Dismissed: `wrapOf` returns null for an empty plan (`src/server/connections.ts:515`). A wrap from a brace set by hand on an earlier section is a slide the screen shows, so clearing it is right.
- A section before the song's first group reaches the new line. Dismissed: its plan holds slide 1, so `plan.length === 0` is false.
- A plan emptied by a slide timing entry. Dismissed: `sectionPlan` always puts the first slide at beat 0 or a negative start (`src/server/propresenter.ts:1210-1214`), so an empty plan means only a section that clears or a cue that sends nothing.
- The crossing sent early, a drag back inside the song's last section, then its End. Dismissed by tracing: the drag forgets `early` and hands the clear; the crossing is rescheduled from the landing, and if the End falls inside its lead it goes again before the End, so `droppedEnd` still finds `early` set; otherwise the End goes as usual.
- The `else if` and the first `if` both run, or neither runs when one should. Dismissed: a defined `landed.slide` needs `due` or a non-empty plan, so the branches exclude each other.
- The `due` branch and its re-remembered `early`, and the #295 clamp in `onward` and `passingClear`. Not in question (carried from review 5).

## Minor / nits
- A row's Clear slide button, then a drag back inside the Vamp, sends a second clear (finder probe: `[…/12, CLEAR, CLEAR, …/12]`). Invisible on screen, and the slide branch above it already treats a remembered `early` as what the screen shows. NFI A's fix would remove it.
- For a song not on Master, the new hand writes an unmeasured `not-played-across` log line for a cue that sends nothing. `src/server/connections.ts:906` does the same; finding 6's first entry fixes the comment.
- Carried from review 5 unchanged: the end toggle switched after the End forgets the crossing (`src/server/connections.ts:937-944`), `seenPlaysOn` never reset on a new set, `playsOn` builds a snapshot per song, the #307 problem's "needs a slide timing entry" wording, "<name>'s last change" for a clearing bound, the redundant `bar !== null` in `resolveEntry`, and #308's queue held by a hung trigger.

## Test quality
Tests added in the delta: 1 · red against `6c3b6a1`'s code: 1 · green: 0 · tautology shapes found: 0. The test asserts the whole received list at the drag and after the Chorus's downbeat. It pins one of the new line's three guards (`plan.length === 0` is pinned by an older brace test); finding 1 adds the two missing. For the branch's other 103 added and 11 modified tests, review 5's audit stands (85 red at `98f15c4`, 29 green, each a deliberate guard, a type sync or a test of the fake); the delta did not change them.

## Prior-review closure
Review 5 (`pre-pr-review-5.md`, reviewed at `6c3b6a1`): 6 confirmed findings.
- Fully fixed: 1. Finding 1 (MEDIUM), by `a1bcc5b`, proved red to green by execution here, with the mechanism its brief recommended.
- Partially fixed: 0. Finding 1's optional crossing test and its Must preserve (nothing handed with nothing early) have no test; that is this doc's finding 1, LOW, and does not reopen the MEDIUM.
- Untouched: 5, all LOW and deferred to Nick by the remediation's scope (findings 2 to 6, carried here as 2 to 6).
- Resolved only by a comment or doc edit: 0.
- MEDIUM or higher left partially fixed or untouched: 0. Escalated or known regressions deferred: none.

## Before opening the PR
- **CI readiness:** the repo has no CI (removed in PR #300). Lint, typecheck, the unit suite (1864 passed), build and e2e (56 passed) are green at `fe0c5ad`.
- **Commit hygiene:** clean tree. This review adds this doc, `repro/review-6-finding-1-mutant-no-early.diff` and `repro/review-6-finding-1-mutant-no-due.diff`.
- **Likely reviewer asks:** the home run (#284) for NFI D; whether #304 blocks the merge; why the #308 queue tests rely on real-time waits (finding 3); whether a row button should reset the early mark (NFI A).

## Verdict
**Ready to open the PR, with follow-ups.** Nothing is CRITICAL, HIGH or MEDIUM. Review 5's one MEDIUM is fixed and proved, and the full checks are green. The six LOWs can ride along or become follow-up tickets: finding 1 (three tests for the new line's guards) and finding 2 (a small proved fix) are the cheapest to take now. The confirmed list shrank from one MEDIUM plus five LOWs to six LOWs, five of them carried untouched, which is the expected convergence, not a stall.
