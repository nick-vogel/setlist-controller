# Pre-PR review: setlist-controller#84 ProPresenter: slides follow playback, follow-up #269

**Branch:** `setlist-controller-84-propresenter-slides-follow-playback` vs `origin/main` (merge-base `4c608d5` "Merge pull request #432 from nick-vogel/setlist-controller-134-propresenter-recordings")
**Reviewed at:** HEAD `99fb0e3` (setlist-controller#269 After a reconnect, a cold Next slide pauses ProPresenter as a change by hand), clean tree: 0 files with uncommitted changes, 0 untracked at the start; 4 files total, +328 / -46 against the merge-base, 3 commits: `adb97dc` (the feature), `bf4c13c` (setlist-controller#269 review pass 1 finding 1: the live slide read tests passed on the opening frame alone, with the read's text never shown) and the merge `99fb0e3`. Production code is `src/server/propresenter.ts` (+30 / -10, of which the logic is 2 lines in `runButton` and the 6-line `slideBeside`); the rest is the fake ProPresenter and its tests and `test/propresenter.test.ts`. This review adds the doc and 2 files under `repro/`.
**Delta under review:** none: `--fresh`, the whole branch against the merge-base. Reviews 1 to 6 in this folder reviewed earlier PRs of this epic, which landed before this merge-base.
**Reviewed against:** setlist-controller#269 (its three items and five acceptance criteria, re-scoped 2026-11-10), the run's recorded assumptions and proposals for #269 (`.epic-loop/tickets/269/`), read so a recorded decision is not re-reported as a defect, the lane's own review passes 1 and 2 (13 LOWs left open), review 6's Approach decisions, the repo entry's checks and guardrails. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape.
**Date:** 2026-11-11
**Reviewer:** 2 agents (1 code-review, 1 tautology audit) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | in the integration worktree | ok, lockfile unchanged |
| `pnpm lint` | full | green |
| `pnpm typecheck` | full | green |
| `pnpm test` | full, load average about 9 to 12 on 14 cores | green: 74 files, 2326 passed, 4 skipped, no flake |
| `pnpm build` | full | green |
| `pnpm test:e2e` | full, three runs 60 s apart | red, red, green: 72 of 72 on the third run. The two reds are one test, `e2e/count-in.spec.ts:167` [webkit-ipad], `expect(boxes).toHaveLength(6)` at `:176` received 0; a flake, the same one `.epic-loop/flaky-2.md` records at `bf4c13c`. The spec is untouched by this branch (last change `6548268`, on the base) |
| The three ProPresenter suites | `pnpm exec vitest run test/fake-propresenter.test.ts test/propresenter.test.ts test/propresenter-adapter.test.ts` | green: 405 passed |
| Tautology audit | in scratch worktrees at `4c608d5`: (a) the branch's two test files and its fake copied in (old production code), (b) the two test files alone (old fake too); each run there | 21 tests added or modified. (b): 14 red, 7 green. (a): 2 red, the two cold-press tests over a slide with no words, which are the only tests that need the production change. See Test quality |
| Mutation of the production change | in a scratch worktree at HEAD, against `test/propresenter.test.ts` and `test/propresenter-adapter.test.ts` (376 tests) | `beside` deleted: killed (the two cold-press tests). The +1/-1 swapped in `slideBeside`: killed (the same two). The `showing === null` guard removed: **survived**. `beside` widened to every slide of the last slide's presentation: **survived**. `goOffline` forgetting `expected`: killed only by the AC2 test (finding 2). Script: `repro/review-7-mutations.sh` |
| Finding 1 candidate tests | `repro/review-7-finding-1-tests.diff` applied at HEAD in a scratch worktree, then `repro/review-7-mutations.sh` | both tests green at HEAD; with them, the guard-removed and every-slide mutants are killed; `eslint` and `tsc` clean on the patched file |
| Em-dashes in shipped copy | `git diff 4c608d5 \| grep '^+' \| grep '—'` | none |
| Guardrails | no launchd, no install script, no production OSC ports (the fake and the harness listen on ports the OS assigns), no Live, no `build-set` | held |
| Not run | the acceptance run on the home ProPresenter (#134's recordings are the oracle) | out of scope for a review; the fake's new stream open and read are judged against `commands-2026-11-10.json` and `stream-status-updates-2026-11-10.json` |

**Overall:** The branch does what #269 asks. The fake's stream open and live slide read match the 2026-11-10 recording, the cold Next and Previous after a reconnect over a blank screen or a slide with no words now move from the last slide shown, and the opening frame over a slide changed while offline still pauses. The production change is two lines and reads right; no behaviour defect is proved. The gate is test coverage: the new cover a cold press gets has no test of its limits, so a later change that makes it cover too much, and stops a real press by hand from pausing, would ship green (finding 1, tests only). The rest is LOW: two reconnect tests that pin their outcome but not the mechanism their names give, fake tests that assert nothing new, and comments.

## Approach decisions
Carried forward from reviews 1 to 6, unchanged:
- Pause by hand, a cue's trigger still out: the cue keeps a mark, which is its own expected-slides `Set`, cleared by its trigger's answer only while no later cue has replaced it.
- Requests and going offline: a request belongs to the connection it was sent on, an `AbortController` replaced in `goOffline`. An aborted request resolves null with no second offline.
- Adapter-level behaviour that the fake ProPresenter cannot stage (requests answered late or at different speeds) goes in `test/propresenter-adapter.test.ts`, whose rig takes a delay per request path (`setDelayFor`) and a status per path (`setStatusFor`). Behaviour the fake can stage stays in `test/propresenter.test.ts`.
- A Clear slide's blank is a fact about the screen, not about the last command (review 4 finding 1, deferred; mechanism unchanged).
- An armed reconnect is staged through `armedRig` and a local set-up (`reconnectArmedShowing`, and now `reconnectArmedOnTurnaround`). A test that waits for an answer the rig delays waits on its effect with `vi.waitFor`; a test that waits on an absence keeps its sleep.
- A slide change missed while offline is recorded only from what Live reports (review 6 finding 1).

Recorded by #269's lane (its `assumptions.md`), carried as decisions:
- A cold Next or Previous with no earlier chained press and no `status/slide` frame since the start or the reconnect (`showing === null`) also expects the slide beside `lastShown`, by index in `lastShown.presentation`, added to what the other places predict (`beside` in `runButton`, `slideBeside`). With no `lastShown` it adds nothing. After a blank the turn's own index-trigger choice still replaces it.
- The fake's stream opened over a slide with words sends the 2026-11-10 opening frames in place of Phase 0's; over a slide with no words it sends Phase 0's with that slide's presentation/current and no `status/slide`; the read answers 204 with no body unless a slide with words shows.

Added by this review:
- The limits of the cold press's cover are pinned in `test/propresenter.test.ts`, `describe('a reconnect while armed')`, by tests that a mutant of `beside` turns red: one where a frame since the open has put `showing` on another slide than `lastShown`, and one where a press by hand that is not beside the last slide lands inside a cold press's frame time (finding 1).

## Confirmed Issues
### 1. The cold press's new cover has no test of its limits, so a change that makes it cover a press by hand ships green — MEDIUM
- **Location:** `src/server/propresenter.ts:1071`; `test/propresenter.test.ts:888-895`
- **Attribution:** introduced by `adb97dc` (setlist-controller#269 After a reconnect, a cold Next slide pauses ProPresenter as a change by hand): `beside` and `slideBeside` do not exist at `4c608d5`, and `git log --oneline -S'neither slide beside' 4c608d5..HEAD` names only `adb97dc`, so the test is no earlier finding's proof.
- **Real-world trigger:** none today; the code is right. The cost lands when a later change to `runButton` drops the guard or widens the cover: a slide the operator presses by hand within 3 s of a producer press is taken as the press's own, ProPresenter stays armed, and automation sends its next slide over the operator's. That is a wrong result silently delivered, so MEDIUM, and the epic's precedent is the same rating (review 4 finding 2: recorded rules that could be broken with the suite green).

**Evidence**
```ts
      const beside = !earlier && showing === null && lastShown ? slideBeside(button.id, lastShown) : [];
```
```ts
  it('pauses an armed ProPresenter on a slide pressed by hand after a reconnect over a slide with no words, when it is neither slide beside the last slide shown', async () => {
    const { clock, row } = await reconnectArmedOnTurnaround();

    clock.advance(PAST_WINDOW_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 20);
```
The test presses no button, so `runButton`, `beside` and `slideBeside` never run in it: it is green at `4c608d5` with the old fake and the new, and every mutant leaves it green. Its name claims the negative of the cover, which nothing pins.

**Failure mode** — two mutants of the one line leave all 376 tests of `test/propresenter.test.ts` and `test/propresenter-adapter.test.ts` green (`repro/review-7-mutations.sh`, executed):
- `guard-removed` (drop `showing === null &&`): every cold press also expects the slide beside `lastShown`, after a frame too. `lastShown` and `showing` part whenever a frame moves the screen without moving the record: a frame inside a cue's window (`own`, so `movedByHand` never runs), a change by hand to a slide with no words, a cue still out. Then a press by hand of the slide beside the stale record, inside the press's 3 s, does not pause.
- `every-slide` (`beside` = every slide of `lastShown.presentation`): after a reconnect over a blank or a slide with no words, any slide of the song pressed by hand inside a cold press's frame time does not pause.

Both tests in `repro/review-7-finding-1-tests.diff` are green at HEAD; with them, both mutants are killed (red), executed.

**Recommended fix** — tests only, no production change. Add the two tests from `repro/review-7-finding-1-tests.diff` inside `describe('a reconnect while armed')`, renamed without "review 7", the second using `reconnectArmedOnTurnaround()` rather than its inline copy:
```ts
  it('pauses on a slide beside the last slide shown but not beside the slide showing, after a cold Previous slide with a frame since the open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { play, producer, clock, row, triggers } = await armedRig({ position: 24, playlist: OCTOBER_25.id });
    await pro!.streaming();
    await play(8, 32);
    expect(await triggers()).toEqual([trigger(THERE_IS_FREEDOM, 6)]);
    await pro!.sendSlide(THERE_IS_FREEDOM, 7);
    clock.advance(PAST_WINDOW_MS);
    await press(producer, 'previous');
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 5);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it("pauses on a slide pressed by hand inside a cold Next slide's frame time after a reconnect over a slide with no words, when it is neither slide beside the last slide shown", async () => {
    const { producer, clock, row } = await reconnectArmedOnTurnaround();

    await press(producer, 'next');
    clock.advance(COLD_BUTTON_FRAME_MS);
    await pro!.sendSlide(THERE_IS_FREEDOM, 20);

    expect(await row((row) => row.arm === 'paused')).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });
```
Then rename the existing test at `:888` to drop its qualifier, "pauses an armed ProPresenter on a slide pressed by hand after a reconnect over a slide with no words", and keep its body: it is #269's AC4 for the case with no words.
Audit: the diff adds two tests and renames one; it removes no assertion. In the first test the frame of index 7 lands inside the trigger's window, so it is the adapter's own and leaves `lastShown` on index 6 while `showing` moves to 7; the Previous then expects index 6 from `showing`, and only the guard keeps index 5 (beside `lastShown`) out. The test is green at `4c608d5` as well, since the base has no cover; that is intended, as it pins a guard, not a feature, and the mutant is its red. The failure of the fix: none, it changes no code.

**Remediation brief**
- **Design intent:** a Next or Previous press expects the slides it may bring (`buttonBrings`), and a frame showing one of them inside `BUTTON_FRAME_MS` after a 2xx is the press's own and never a change by hand. Its expectation comes from an earlier press still out, a cue's slide still out, or the slide showing; #269 adds the slide beside `lastShown` only while no frame has come since the start or the reconnect (`showing === null`, which only the declaration and `goOffline` set, `:542`), since that is the one state with no slide showing to move from. Every slide the cover adds is a press by hand that will not pause, so it must stay exactly the one neighbour and only in that state.
- **Full surface:** `test/propresenter.test.ts`, `describe('a reconnect while armed')` (`:797-896`): the two new tests and the rename at `:888`. No change to `src/server/propresenter.ts` (`:1067-1072` `beside`, `:1731-1735` `slideBeside`).
- **Must preserve:** the two cold-press tests over a slide with no words (`:873-886`, the `it.each` over next and previous), which kill the `beside`-deleted and swapped mutants; the AC2 test at `:837`; the AC4 tests at `:822` and `:828`; the pause by hand at `:888`, renamed only.
- **Do not touch:** `beside`'s `cueOut` behaviour (Needs Further Investigation A); `slidesBrought` and the `to` branch of the press's turn, which replaces the cover after a blank (Reviewed and Dismissed).
- **Proof:** `git worktree add --detach <scratch>/wt HEAD && ln -s "$PWD/node_modules" <scratch>/wt/node_modules && sh docs/reviews/setlist-controller-84/repro/review-7-mutations.sh <scratch>/wt && git worktree remove --force <scratch>/wt`. Now: `guard-removed: survived`, `every-slide: survived`. After: both `killed (red)`, each naming one of the two new tests. Then `pnpm exec vitest run test/propresenter.test.ts`.

### 2. Two reconnect tests pin their outcome but not the mechanism their names and comments give — LOW
- **Location:** `test/propresenter.test.ts:820-826`, `:837-846`
- **Attribution:** introduced by `adb97dc`. The AC2 half was raised by the lane's review passes 1 and 2 (F1.3, F2.2) and left open as LOW.
- **Real-world trigger:** none; a test-strength finding. The outcomes #269's AC4 and AC2 name are pinned; a remediator trusting the comment at `:820` would believe the wrong test guards `goOffline`'s `expected`, so LOW.

**Evidence**
```ts
  // The expected slide survives going offline, so a slide changed by hand while the stream was down
  // shows on the opening frame as a change by hand.
  it('pauses an armed ProPresenter on the opening frame of a reconnect over a slide that changed while it was offline', async () => {
```
**Failure mode** — (a) the `expected-dropped` mutant (`goOffline` sets `expected = null`) leaves the AC4 test at `:822` green, executed: the opening frame over Verse 3 pauses whether or not `expected` survives, since Verse 3 is not the expected slide either way. What keeping `expected` actually buys is the opposite case, the opening frame over the expected slide not pausing, and only the AC2 test at `:837` goes red on that mutant, though its name says nothing of it. The comment gives the cause backwards. (b) The AC2 test passes through either path: with the fake withholding the opening `status/slide` (`lateOpeningSlide()`), `beside` predicts index 7 from `lastShown` (index 6) and the test stays green; the live slide read also puts the Chorus text on the row, so the `await row(... CHORUS_TEXT)` does not show that the opening frame came.

**Recommended fix** — (a) add, beside `:822`: "keeps an armed ProPresenter armed on the opening frame of a reconnect over the expected slide": `const { row, latest } = await reconnectArmedShowing(CHORUS); await row((row) => sameLines(row.state, CHORUS_TEXT)); await pro!.idle();` then `expect(await latest()).toMatchObject({ connection: 'online', arm: 'armed', pause: null })`. Reword `:820-821` to: "A slide changed by hand while the stream was down is no frame of the adapter's own, so its opening frame pauses." (b) In the AC2 test, call `pro!.hangSlideReads()` before the reconnect, so the row's Chorus text can come only from the opening frame.
Audit: (a) adds a test and rewrites a comment; (b) adds one line to a test whose assertions stay. `hangSlideReads` holds the read with no answer; the precedent is the live slide read tests at `:740`, `:761`, `:775`, which hold it the same way. The failure of the fix: a held read times out after the adapter's request timeout and puts ProPresenter offline; the AC2 test's clock is the rig's fake clock, so the timeout cannot pass during it, but if the test turns flaky offline, use `lateOpeningSlide()` the other way round and hold nothing.

**Remediation brief**
- **Design intent:** `goOffline` keeps `expected` (and `lastShown`) and drops `onScreen`, `showing`, `buttonBrings` and `triggersOut`. So the reconnect's opening frame is decided like any frame: over the expected slide it returns at `expected?.has(current)`, and over any other slide it is a change by hand, since no window, trigger or press covers it.
- **Full surface:** `test/propresenter.test.ts:820-826` (comment and the new test beside it), `:837-846` (the AC2 test). No production change.
- **Must preserve:** both AC4 tests (`:822`, `:828`) and the AC2 test's assertions; `reconnectArmedShowing` (`:800-818`) unchanged, as six tests use it.
- **Do not touch:** `goOffline` (`:527-549`); the known out-of-scope cases where the opening frame over the server's own slide pauses after an Arm or after a press whose frame never came, which are #269's proposal 1, not this finding.
- **Proof:** `sh docs/reviews/setlist-controller-84/repro/review-7-mutations.sh <scratch>/wt` (set-up as in finding 1): `expected-dropped` must be killed by the new test as well as the AC2 test. For (b), apply `lateOpeningSlide()` to the AC2 test by hand in a scratch worktree: it must go red with the read held.

### 3. Five tests the branch added or renamed assert nothing it introduced — LOW
- **Location:** `test/fake-propresenter.test.ts` the three "opens a stream %s with no status/slide" cases (the `it.each` at `:352`); `test/propresenter.test.ts:828`; `test/fake-propresenter.test.ts` "gives no two slides one UUID, across presentations" (`:245`)
- **Attribution:** introduced by `adb97dc` (`git log -S` on each name).
- **Real-world trigger:** none; coverage claims, LOW since each pins a real property and none is a production branch.

**Evidence** — all green against the old fake and the old adapter (tautology audit run (b), executed). The three "opens a stream" cases assert only `toContain('timer/system_time')` and `not.toContain('status/slide')`, which the old fake met too; the new behaviour of the no-words case, a presentation/current naming the live slide's presentation (Holy Forever) through `liveCurrent` in place of There Is Freedom's, has no assertion. The test at `:828` was renamed from "the read" to "the opening frame" with its body unchanged; nothing in it tells the two apart.

**Recommended fix** — in the "opens a stream" `it.each`, assert the presentation/current frame: `presentationIn(frames.find(({ url }) => url === 'presentation/current'))` is `HOLY_FOREVER` for the Intro case and `null` for the other two (add the expected UUID as a third column). For `:828`, call `pro!.hangSlideReads()` before the reconnect so the state can come only from the opening frame, as in finding 2 (b). Keep "gives no two slides one UUID" and the 200 read test as they are: their oracles are the recording and an invariant from before the branch.
Audit: adds assertions only. The failure of the fix: none.

**Remediation brief**
- **Design intent:** the fake's `openingFrames()` (`test/fake-propresenter.ts:288-293`) picks the 2026-11-10 frames over a slide with words and Phase 0's otherwise, putting `liveCurrent` in place of the recorded null presentation/current while any slide shows.
- **Full surface:** `test/fake-propresenter.test.ts`, the `describe('the 2026-11-10 recording')` `it.each` of opening frames; `test/propresenter.test.ts:828-835`.
- **Must preserve:** every assertion now in those tests.
- **Do not touch:** `openingFrames()` and `currentOf` in the fake (Minor / nits for `currentOf`).
- **Proof:** in a scratch worktree, swap `liveCurrent!` for `THERE_IS_FREEDOM_CURRENT` in the Phase 0 branch of `openingFrames()`: the strengthened Intro case must go red.

### 4. Comment hygiene — LOW (aggregated)
- `src/server/propresenter.ts:1067-1070` — "as when the stream opened over a blank screen or a slide with no words ... With none either, as after the server's start, it expects nothing, so its cold frame past the window is a change by hand." → "as when the stream opened over a blank screen or a slide with no words, or its opening frame is late ... With none either, as after the server's start, it expects only what a cue still out gives, so with no cue out its cold frame past the window is a change by hand."
- `test/fake-propresenter.ts:273-274` — "and the presentation/current frame naming its presentation, or null with none showing." → "and the presentation/current frame naming its presentation, null after a clear; a recorded status/slide chunk sets it to There Is Freedom's even when that chunk shows none, which the opening frames never read then." (`send(t)`, `:563-565`, sets it for a recorded clear's `status/slide`; lane F2.5.)
- `test/propresenter.test.ts:688-689` — "The read's text shows only when no frame came before its answer" → "The read's text shows only when no status/slide frame or clear came before its answer" (the heartbeat and presentation/current still come first under `lateOpeningSlide()`; `readSlide` checks `slideChanges`, `src/server/propresenter.ts:746`; lane F2.11).
- `src/server/propresenter.ts:201-202` (header) — "After a reconnect over a slide with words, the stream's opening frame places it." → "At the server's start and after a reconnect over a slide with words, the stream's opening frame places it." (lane F2.7.)

## Needs Further Investigation
### A. The cold press's cover can be stale or beside the wrong place: before the opening frame after an offline change, and while a cue is out — confirm with an adapter test
`beside` uses `lastShown` whenever `showing` is null, including (a) the gap between going online and the opening frame being decided, when the operator may have changed the slide while ProPresenter was offline (`lastShown` is kept across going offline on the guess that the screen is as it was), and (b) while a cue's trigger is out (`cueOut`), when the press goes out after the trigger and moves from the cue's slide, not from `lastShown`. In both, a press by hand of exactly the slide beside the stale record inside the press's 3 s is taken as the press's own. Raised by the lane's passes 1 and 2 (F1.2, F2.1, LOW, unverified). To confirm (a): in `test/propresenter-adapter.test.ts`, hold the stream's opening frame (`setDelayFor('/v1/status/updates', ...)`), show a slide changed while offline beside `lastShown`, press Next inside the hold, and check the row stays armed where it should pause. Upgrade to MEDIUM if the service log shows a Next slide or Previous slide answered within 300 ms of "online" after a drop. A fix for (b) would add `cueOut === null` to the guard; it is a decision, since a refused trigger leaves the screen at `lastShown`.

## Reviewed and Dismissed
- `liveCurrent!` in `openingFrames()` can be null while a slide shows — no: `live` is set in five places (`test/fake-propresenter.ts:355`, `:366`, `:564`, `:567`, `:574`), and each sets `liveCurrent` with it; none leaves it null while `liveShows()` is true.
- `currentOf` gives `{ presentation: null }`, which the adapter takes as a clear — no: every presentation the fake holds has a body at `/v1/presentation/<uuid>` (checked over all fixtures).
- The fake's "slide with words" differs from the adapter's — no: the `INVISIBLE` regex is the adapter's (`src/server/propresenter.ts:1225`), and trimming the whole string or each line gives the same empty or not.
- `OPEN_OVER_SLIDE`'s `t <= 166` filter — right: the fixture's chunks are 165 heartbeat, 165 presentation/current, 166 status/slide, then 311 heartbeat.
- `slideBeside` returns null for a slide with no words — no: the presentation read builds slides with `slideText`, so `slideAt` gives "(no words)", as the comment says; past either end it gives null and the cover is empty.
- The cover survives a blank — no: after a clear the press's turn picks the index trigger (`to`) and replaces `brings.slides` (`src/server/propresenter.ts:1094-1099`). Do not touch.
- A refused press chains the next press onto a wrong place — no: a press with no 2xx gets `until = -Infinity` and is never `earlier`.
- `readSlide` mishandles the 204 — no: it returns on any status but 200 (`:746`).
- `showing` is null after a clear frame too, so the comment's "before any frame" is wrong — no: a frame with no slide sets `showing` to an empty place (`:814`); only the declaration and `goOffline` (`:542`) set it null.

## Minor / nits
- `currentOf` (`test/fake-propresenter.ts:360`) reads `bodies` directly, so the presentation/current frame ignores `authorize()`'s `is_authorized` and the before-songs-resolved recording, and a `renameGroup` after `moveTo` leaves it stale. The adapter reads only whether `presentation` is null. The recorded frame's `id.index` (0) also differs from the fake's (125) (lane F2.3).
- `lateOpeningSlide()` withholds the opening `status/slide` for good rather than sending it late (lane F2.12).
- The 2026-11-10 opening frames are filtered with the same `t <= 166` in the fake and in its test (lane F2.8).

## Test quality
Tests added or modified: 21 (13 in `test/fake-propresenter.test.ts`, 8 in `test/propresenter.test.ts`). Against the old fake and old adapter: 14 red, 7 green. Against the new fake and old adapter: 2 red, the cold Next and cold Previous over a slide with no words, the only tests that need the production change; the AC2 test is green there, as it passes through the fake's new opening frame (finding 2). Of the 7 green at base: "pauses ... when it is neither slide beside the last slide shown" presses no button and pins nothing its name claims (finding 1); the three "opens a stream %s with no status/slide" cases and the renamed `:828` assert nothing new (finding 3); "answers the live slide read with a 200 ... while a slide with words shows" and "gives no two slides one UUID" are conformance and invariant checks against the recording, kept as they are. The two tests from `bf4c13c` (review pass 1 finding 1's proof) are red at base. No mocked unit, call-shaped-only assertion, unread snapshot, assertion-free or prose test. Mutants: `beside` deleted and the ±1 swapped are killed; the guard removed and the cover widened survive (finding 1); `expected` dropped on going offline is killed by the AC2 test alone (finding 2).

## Before opening the PR
- **CI readiness:** the repo has no CI (setlist-controller#275); the full checks are green here, with the known WebKit count-in flake (`e2e/count-in.spec.ts:167`) red twice and green on the third run.
- **Commit hygiene:** commit this doc and `repro/review-7-mutations.sh`, `repro/review-7-finding-1-tests.diff`. Nothing to drop.
- **Likely reviewer asks:** the PR should say the cold press after a reconnect is proved against the fake and the 2026-11-10 recording, and that two known cases where the opening frame over the server's own slide pauses (after an Arm, after a press whose frame never came) are left for #269's proposal 1; whether `readSlide` should go now that it seeds almost nothing (proposal 2).

## Verdict
Not ready as-is, close: one gate. Finding 1 (MEDIUM, tests only) must be remediated before the PR opens, since the new cover a cold press gets can be widened into covering a press by hand with the suite green. Findings 2 to 4 (LOW) can ship as follow-ups, though 2 and 3 are a few lines in the same two test files and cheap to take in the same pass. No CRITICAL or HIGH. This is round 1 for this branch, so no prior findings are claimed resolved; the lane's 13 LOWs are folded in above where they still hold (findings 2 and 4, NFI A, nits). No subsystem needs a split ticket.

## Remediation — 2026-11-11
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `fdd86cf` setlist-controller#84 pre-PR review 7 finding 1: the cold press's cover after a reconnect had no test of its limits, so dropping its guard or widening it to the whole song shipped green | red→green: `sh docs/reviews/setlist-controller-84/repro/review-7-mutations.sh <scratch>/wt` in a detached scratch worktree. At `6722469`: `guard-removed: survived`, `every-slide: survived`. At `fdd86cf`: `guard-removed: killed` by "pauses on a slide beside the last slide shown but not beside the slide showing, after a cold Previous slide with a frame since the open", `every-slide: killed` by "pauses on a slide pressed by hand inside a cold Next slide's frame time ...", `expected-dropped: killed` (the AC2 test, unchanged). Preserve suites: `pnpm exec vitest run test/propresenter.test.ts` 362 passed, `test/propresenter-adapter.test.ts` 16 passed; `pnpm typecheck` and `pnpm lint` green | 0 | fixed, proved by execution (MEDIUM, tests only, no shared core touched, so no verify agent) |
| 2 (LOW) | — deferred | — | — | deferred: LOW tail, not in this round's default scope |
| 3 (LOW) | — deferred | — | — | deferred: LOW tail, not in this round's default scope |
| 4 (LOW, comment hygiene) | — deferred | — | — | deferred: LOW tail, not in this round's default scope |

### Known regressions, deferred
None. The round changed no production code.

### Rework briefs
None. No rework pass was needed.

Approach decisions: the decision "Added by this review" above was applied as written. Both tests sit inside `describe('a reconnect while armed')`, and the second one uses `reconnectArmedOnTurnaround()` instead of an inline copy. No new decision was made.
