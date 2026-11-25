# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line (re-review of review 3's remediation)

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `98f15c4`, Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing)
**Reviewed at:** HEAD `0d6203a` (setlist-controller#275 pre-PR review 3 finding 2 deferred to the home run's report order). Clean tree: no uncommitted or untracked files. Against the merge-base: 27 files, +2129 / −262, 34 commits.
**Delta under review:** since `e73c4a7` (setlist-controller#293 The pre-service check and the slide timing file use each song's own meter), the HEAD `pre-pr-review-3.md` reviewed. 4 commits, 8 files, +439 / −3. The code and data in it: `ea899f7` (review 3 finding 1's fix, `src/server/connections.ts` +4 / −2, `test/propresenter.test.ts` +14) and `a4bca27` (setlist-controller#284 Slide timing exceptions from the home run of the 8 November set, `config/slide-timing.json` +18 / −1). The rest is review 3's doc, its closure table and its `repro/` files.
**Reviewed against:** epic `nick-vogel/setlist-controller#275` and follow-up #294 (the lyric lead across a song boundary), as distilled in `pre-pr-review-3.md`; that doc's finding 1 brief, Approach decisions, remediation closure table and Nick's deferral of finding 2 (2026-11-03, recorded in that doc and in the run's close-out). No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply.
**Date:** 2026-11-03
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `0d6203a` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 70 files, 1821 passed, 4 skipped, first run |
| Build | `pnpm build` | clean |
| E2E | `pnpm test:e2e` (OS-assigned ports) | 56 passed |
| Finding 1's fix is what turns its test green | a scratch worktree at `0d6203a` with `src/server/connections.ts` put back to `e73c4a7`'s, `pnpm exec vitest run test/propresenter.test.ts -t "with a lead of a bar"`, then `-t "the lyric lead"` | the new test red (`expected [ …(5) ] to deeply equal [ …(2) ]`), alone: 1 failed, 55 passed in the describe |
| Finding 1 on past the End (finder, executed) | the new test's setup played on through Holy Forever's Verse 1 (reports at 52.1 and 56.6), at HEAD and with `e73c4a7`'s `connections.ts` | HEAD sent `[HF/0, HF/0, HF/1, HF/2, HF/3]`, no clear and no re-send; `e73c4a7` sent `[HF/0, HF/0, CLEAR, HF/0, HF/0, HF/1, HF/2, HF/3]` |
| Finding 1's Stop paths (finder, executed) | Stop set after the Intro went early, then End; Stop then Continue, both after the Intro went, then End | Stop: `[HF/0, HF/0, CLEAR, …]`, the End clears; Stop then Continue: `[HF/0, HF/0]`, the End dropped, right since both slides went |
| Mutants of the fix (finder, executed) | `endInsideLead(entry, song, across)` back to `early`; the condition cut to `early.cue.song !== across.cue.song` | both pass all 59 tests of `the lyric lead`. Both are equivalent in reachable states (see Reviewed and Dismissed) |
| Review 3 finding 2 still present | `repro/review-3-finding-2-test.diff` applied in a scratch worktree at `0d6203a`, `pnpm exec vitest run test/propresenter.test.ts -t "before the playhead's move into it"` | red: the extra note "Ancient Gates: Verse 3 has 3 slides in 2 bars, changed on beats". `src/server/playback-controller.ts` and `src/server/server.ts` are unchanged since `e73c4a7` |
| `config/slide-timing.json` reads | `readSlideTiming` on the committed file | `problem: null`; Holy Forever 5 entries, Worthy Of It All 7 |
| `config/slide-timing.json` against the captured presentation | `resolveEntry`'s rules (`src/server/propresenter.ts:997-1030`) read against `test/fixtures/propresenter/v1_presentation_AA8F2F17-09BE-44ED-A618-C645D5EC8AAB.json` (captured 2026-11-02); the finder ran the check through `pickedRig` with the committed file | 3 Worthy Of It All entries break the slide-count rule against that capture (Needs Further Investigation C) |
| Tautology audit (Phase 4.5) | the delta adds one test; checked by the mutant above and read for the six shapes | red without the fix; no tautology shape; one weakness (finding 2) |
| Shipped copy | the delta's `src` and `config` lines grepped for an em-dash | none |
| Not run | the real ProPresenter and Live; the home presentation of Worthy Of It All; AbletonOSC's report order | the guardrails forbid driving Live; #284 is Nick's home run |

**Overall:** Review 3's finding 1 is fixed, on the mechanism its brief recorded. The End inside the crossing's lead is dropped whether the last change sent early is the crossing or a later change of the next song, the slides after it go on time, a Stop still clears, and the new test goes red without the fix. Nothing new at MEDIUM or above is confirmed. What remains is review 3's finding 2, which Nick deferred to the home run, a LOW gap in the fix's tests, two comments the fix outdated, and one question about the home run's slide timing data for Worthy Of It All (C) that only the home ProPresenter can answer.

## Approach decisions
- The End inside the crossing's lead (review 3 finding 1, implemented in `ea899f7`): `droppedEnd` judges whether the crossing went, by the crossing itself (`crossing(entry, song)`) and by whether the change remembered as sent early is the crossing or a later change of the next song. The `crosses` tag stays as it is, and `observed()`'s end-toggle branch keeps reading it. Precedent: `endInsideLead`, measured against a `Change` from `crossing()` in `onward()` (`src/server/connections.ts:507`). Unchanged by this review.
- A song's meter on a signature report (review 3 finding 2): deferred by Nick on 2026-11-03 until #284's home run records AbletonOSC's report order. Review 3's recommended mechanism (a one-shot wait for the next position report) is blocked, not overturned: it turns `test/pre-service-check.test.ts:349-370` red. The next brief for it picks between changing those two hold tests and having Live's stop report end a waiting signature.
- A library body the check cannot read (review 3 finding 3, recommended, not worked): reads as "could not be read", never as an empty library. Unchanged.

## Confirmed Issues

### 1. A time signature report that reaches the server before the playhead's move stamps the song the playhead left with the new song's meter (review 3 finding 2, known regression, deferred) — MEDIUM
- **Location:** `src/server/playback-controller.ts:218-223` (`rememberMeter`), called from the signature cases at `:681-692`
- **Attribution:** introduced by `d947b67` (setlist-controller#293), as review 3 found. Unchanged since `e73c4a7`; known regression, deferred. Review 3's "Finding 2, deferred by Nick" reads: "2026-11-03: Nick deferred finding 2. Whether it can happen depends on the order AbletonOSC sends the signature and the playhead at a boundary (Needs Further Investigation B), which the home run of the 8 November set (setlist-controller#284) records."
- **Real-world trigger:** a click or a play across the boundary from a 6/8 song into a 4/4 song on a mixed-meter set, when Live reports the signature before the playhead. The order is not recorded (Needs Further Investigation B). MEDIUM, capped: drop to LOW if AbletonOSC always reports the position first.

**Evidence** — `rememberMeter` stamps `now(position)`'s song, and on a signature report `position` can still be in the song the playhead just left. Proof re-run at `0d6203a` (verify table).

**Remediation scope:** not to be worked in this round. Nick deferred it until #284 records the report order. The full brief, the blocked attempt (`repro/review-3-finding-2-remediation-attempt.diff`) and the two candidate mechanisms are in `pre-pr-review-3.md`, finding 2 and "Finding 2, blocked".

### 2. The fix's new test sends the same slide twice and cannot tell which two went, and the fix's Stop fallback has no test — LOW
- **Location:** `test/propresenter.test.ts:3711-3724` (the new test); the path at `src/server/connections.ts:545` (`!across`) for an untagged `early`
- **Attribution:** introduced by `ea899f7` (setlist-controller#275 pre-PR review 3 finding 1). `git log -S'with a lead of a bar' 98f15c4..HEAD` names only that commit.
- **Real-world trigger:** none on stage. A later change that re-sent the crossing instead of sending the Intro, or that lost the Stop guard for an untagged `early`, would stay green.

**Evidence**
```ts
    expect((await sent()).slice(before)).toEqual([trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0)]);
```
Holy Forever's Count Off and Intro both show slide 0, so `[HF/0, HF/0]` reads the same for "the crossing, then the Intro early" and "the crossing, then the crossing again". The test also stops at 45.1, before any slide that would differ. Separately, the fix newly accepts an `early` with no `crosses` tag. `observed()` forgets only a tagged `early` on a Stop (`src/server/connections.ts:837`), so after a Stop set once the Intro went early, only `crossing()` returning null (`!across` at `:545`) lets the End clear. The finder executed that path and it is correct today, but no test holds it.

**Failure mode** — none today; both are coverage gaps under the shared rules "tests that can go red" and "a test for every fallback path".

**Recommended fix**
- Extend the new test past the End into Holy Forever's Verse 1, playing on with reports at about 52.1 and 56.6 as the finder did, and assert the whole list: at `0d6203a` it is `[HF/0, HF/0, HF/1, HF/2, HF/3]` (the finder's run). Take the exact `play`/`clockTo` steps from the test's own beat arithmetic; the assertion must hold the slides after the End, not only the first two.
- Add beside it: lead 4, `OVERLAP_CUE_POINTS`, `play(3, 39)`, `clockTo(reported, 5 * BEAT_MS + 100)`, then `lead({ kind: 'set-end-toggle', song: 1, toggle: 'stop' }, …)`, then `play(5.1, 44.1)`, and expect `(await sent()).slice(before, before + 3)` to equal `[trigger(HOLY_FOREVER, 0), trigger(HOLY_FOREVER, 0), CLEAR]`.

**Remediation brief**
- **Design intent:** each target with a lead holds one pending change and one remembered change sent early (`entry.early`). The chain from the crossing is the only way a next-song change goes before the song before's End, so an `early` of the next song means the crossing went. A Stop makes `crossing()` null, which sends the End.
- **Full surface:** `test/propresenter.test.ts:3711-3724` and a new `it` beside it in the `the lyric lead` describe. No source change.
- **Must preserve:** the new test's red without the fix: put `src/server/connections.ts` back to `e73c4a7`'s in a scratch worktree and the extended test must still fail. The Stop test is a guard and is green at `e73c4a7` too; say so in its commit.
- **Do not touch:** `droppedEnd`'s `crosses` half and its `across` measure (Reviewed and Dismissed: equivalent mutants), and `observed()`'s end-toggle branch (review 3's recorded approach).
- **Proof:** `pnpm exec vitest run test/propresenter.test.ts -t "the lyric lead"` green at the fix, and the extended test red against `e73c4a7`'s `connections.ts`.

### 3. Comment hygiene — LOW (aggregated)
- `src/server/connections.ts:538-539` — "…inside the lead of the crossing from that song, which went early to the target: only a crossing actually sent drops the End." → "…inside the lead of the crossing from that song, while the song still plays on, which went early to the target: only a crossing actually sent drops the End. The change sent early is the crossing, or a later change of the next song, which only the chain from the crossing reaches before the End."
- `src/server/connections.ts:763-766` — "the screen shows the next song's first slide, and the End sends nothing over it. Nothing else changes: the crossing scheduled the next change when it went, and the next song's cue on the crossing's beat finds it sent early." → "the screen shows the next song's first slide, or a later one the chain from it sent, and the End sends nothing over it. Nothing else changes: the change sent last scheduled the next, and the next song's cue on the crossing's beat finds it, or a later change, sent early."

## Needs Further Investigation
### A. The real ProPresenter's library answers are not recorded
Carried from review 3. Record `GET /v1/libraries` and `GET /v1/library/{name}` at home during #284 and replace the fake's spec-shaped answers.

### B. Whether AbletonOSC reports the time signature before the playhead on a boundary
Carried from review 3; it decides finding 1's severity and its fix. Log the OSC arrivals at the home Live while clicking from a 6/8 song into a 4/4 song, stopped and playing.

### C. Three of the home run's Worthy Of It All slide timing entries do not fit the captured presentation, so the check would ignore them
`a4bca27` (setlist-controller#284) adds `config/slide-timing.json`. An entry with `changes` must give one fewer change than the slides of the group it shows (`src/server/propresenter.ts:1019-1020`); with no `group`, that is the nth group of the section's name for its nth occurrence (`groupFor`, `:932-934`). Against the Worthy Of It All capture of 2026-11-02 (groups and slide counts: 1 Verse 1 4, 2 Chorus 5, 3 Verse 1 3, 4 Chorus 3, 5 Chorus 4, 6 Bridge 4, 7 Bridge 4, 8 Chorus 3, 9 Chorus 4):
- `config/slide-timing.json:10`, Verse 1 occurrence 1, `[4, 6.5]`: group 1 has 4 slides (its first blank), needs 3.
- `:12`, Chorus occurrence 1, `[3.5, 5.5, 7.5]`: group 2 has 5 slides (its fifth blank), needs 4.
- `:16`, Chorus occurrence 5, group 9, `[3.5, 5.5]`: group 9 has 4 slides (its fourth blank), needs 3.

The finder ran the check with the committed file against the fake serving that capture, and it returned "Verse 1 1, 2 changes for 4 slides, needs 3", "Chorus 1, 3 changes for 5 slides, needs 4" and "Chorus 5, 2 changes for 4 slides, needs 3". The other four Worthy entries and all five Holy Forever ones fit. A broken entry is a problem in the producer row and is ignored whole, so it is visible, not silent. But the last Chorus would then fall back to an even split of group 9's 4 slides over its 6 bars, and the blank fourth slide would go up about 4.5 bars in, against the commit's stated intent that "You deserve the glory" stays up until the Ending clears. The commit says the bars "were checked on the home ProPresenter", so the presentation may have changed since the capture (a blank slide removed from groups 1 and 2, for example). What settles it: read Worthy Of It All's row in the pre-service check at home with this file. No "slide timing" problem means the capture is stale; refresh the fixture. Those three problems mean the entries need a change each (for group 9, a third change inside its 6 bars).

## Reviewed and Dismissed
- An untagged next-song `early` while the crossing did not go, so the End is wrongly dropped. Dismissed: `fire` returns before scheduling the next when it drops a change (`src/server/connections.ts:592`), and every reschedule goes through `following`, `ahead`, `onward`, `crossing()`, whose change is tagged. A jump hands a cue, and `hand()` nulls `early` (`:405`). A loop change forgets an `early` at or past the brace end (`:848`).
- The Count Off and Intro cues after the dropped End re-send or clear. Dismissed by execution: through Verse 1, HEAD sent `[HF/0, HF/0, HF/1, HF/2, HF/3]`.
- `endInsideLead` measured against `across` is unpinned (the mutant to `early` passes). Dismissed as an equivalent mutant: a next-song change that went before the End has its send point at or before the End and its beat after the crossing's, so the End is inside its lead exactly when it is inside the crossing's.
- The `early.crosses !== cue.song` half of the condition is redundant. Dismissed: when `early` is the crossing, its cue's song is `across.cue.song`, so the half only matters if the set's order changed between the send and the End. Harmless, and the recorded approach keeps the tag.
- `config/slide-timing.json` breaks a test or start-up assumption of `{}`. Dismissed: only `src/server/start-up.ts:47` reads it; every test passes its own path or none.

## Minor / nits
- With a lead longer than the whole next song, `early` could be a change of the song after it, and the End would send its clear: the pre-#294 behaviour, the safe side. Theoretical.
- `droppedEnd` runs before `back(entry, here)` in the cue's deliver loop (`src/server/connections.ts:767`, `:775`), and a disarmed target skips the loop without forgetting `early`. A jump back into the song made while disarmed, a re-arm, and the song's End as the very next event with no report between could drop the End over a stale `early`. Not executed; a playing Live reports the playhead many times a second, and `moved()` forgets it first. The fix widens it from a tagged `early` to any next-song one.
- `test/propresenter.test.ts:3711`: no blank line before the new `it(`, unlike its neighbours.

## Test quality
- Tests added in the delta: 1 (`test/propresenter.test.ts:3711`, review 3 finding 1's proof).
- Red against `e73c4a7`'s `connections.ts`: 1. Green: 0. Tautology shapes found: 0. It cannot tell its two sends apart (finding 2).
- The branch's other 70 tests were audited in review 3 and are unchanged in the delta.

## Prior-review closure
Prior doc: `pre-pr-review-3.md`, reviewed at `e73c4a7`.
- Fully fixed: 1 of 5. Finding 1 (MEDIUM) by `ea899f7`: the proof is red without the fix, every crossing test of `the lyric lead` stays green, and the finder found no path the wider check gets wrong.
- Partially fixed: 0.
- Untouched: 4. Finding 2 (MEDIUM), known regression, deferred by Nick (this doc's finding 1). Findings 3, 4 and 5 (LOW), deferred by review 3's remediation scope.
- Resolved only by a comment or doc edit: 0.

## Before opening the PR
- **CI readiness:** the repo has no CI (removed in PR #300). Lint, typecheck, the unit suite, build and e2e are green at `0d6203a`.
- **Commit hygiene:** clean tree. This review adds only this doc.
- **Likely reviewer asks:** the real report order behind finding 1 (B), the real library answers (A), and whether the Worthy Of It All entries pass the check at home (C). All three are for #284's home run.

## Verdict
**Ready to open the PR, with follow-ups.** Nothing at MEDIUM or above is open apart from finding 1, which Nick deferred to #284's home run. Review 3's finding 1 is fixed on its recorded mechanism and proved. Findings 2 and 3 are LOW and can ride along or become a follow-up. Before Sunday, settle C at home: it is data, not code, and only the home ProPresenter can answer it. The confirmed list shrank from 5 to 3, and the two new ones are a test gap and two comments: the review has reached the bottom of the barrel on this branch, not found new behaviour bugs.
