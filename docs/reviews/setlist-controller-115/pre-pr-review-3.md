# Pre-PR review: setlist-controller#115 Cues fire early by a lead time from the tempo (the measurement, #146), round 3

**Branch:** `setlist-controller-115-cue-lead-time` vs `origin/main` (merge-base `cd75677` "Merge pull request #185 from nick-vogel/setlist-controller-114-atem-lobby-feed")
**Reviewed at:** HEAD `a52986e` (setlist-controller#115 Merge origin/main (PR #185) into the integration branch), clean tree: 0 files with uncommitted changes, 0 untracked; 23 files total, +1232 / -24 against the merge-base (7 of them review docs and repros)
**Delta under review:** since `19aeccb` (setlist-controller#115 pre-PR review 2), the HEAD after `pre-pr-review-2.md` was committed (that doc reviewed `4131597`; `19aeccb` adds only the doc). The one new commit is the merge `a52986e` of `origin/main` at `cd75677` (epic #114: #174, #175, #176), 23 files, +993 / -83, almost all of it main's own already-reviewed code. Five files conflicted and were resolved by hand: `README.md`, `src/server/connections.ts`, `src/server/target.ts`, `test/fake-target.ts`, `web/src/ConnectionsPanel.tsx`. This round reviews the resolution and the runtime interaction of #146 (the lateness record, `Entry.handed`, the `actedOn` hook) with #174 to #176 (the ATEM check, the `problem` hook and connect retry, the by-hand pause after the adapter's own cut).
**Reviewed against:** `pre-pr-review-2.md` (finding 1, Approach decisions, Minor), `pre-pr-review-1.md` (Reviewed and Dismissed, Minor), the #146 issue body ("Each target epic decides whether it reports an acknowledgement"), the epic run's close-out answers 2, 7 and 10 (follow-up #186: the ATEM reports its program change as the acted-on time). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green (exit 0) |
| Typecheck | `pnpm typecheck` | green (exit 0) |
| Unit and server suites | `pnpm test` | 52 files, 1098 passed, 4 skipped (the Linux-only setup-screen cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| This branch's side survives the merge | `git diff f5fb867 19aeccb` against `git diff cd75677 a52986e`, per file, changed lines compared | identical in every file except the five conflicted ones, where the only differences are the conflict hunks themselves |
| Main's side survives the merge | `git diff f5fb867 cd75677` against `git diff 19aeccb a52986e`, per file, changed lines compared | identical in every file except the same five |
| The five hand resolutions | `git show --remerge-diff a52986e`, read hunk by hunk | each is the union of both sides: `Entry` keeps `lateness`, `handed` and `problems`; the initial entry carries all three; `start` wires both `actedOn` and `problem`; `TargetReport` declares both hooks; the fake target keeps `act` and `setProblem` and a header naming both; the panel header keeps the lateness sentence and main's rewrap |
| README resolution | script: main's README paragraph with this branch's "Once a measured cue ..." sentence inserted before "A target the connections config file disabled" | byte-identical to the merged paragraph, so main's ATEM-source wording and this branch's lateness sentence are both present and nothing else changed |
| Each resolved hunk is pinned by a test | scratch worktree at `a52986e`, four mutants, the named suites run | dropping the `actedOn` wiring: 2 red in `test/cue-lateness.test.ts`; dropping the `problem` wiring: 40 red (ATEM and connections suites); dropping `<Lateness>` from the row: 1 red in `test/pages.test.ts`; dropping the row's problem list: 1 red in `test/pages.test.ts`. All four killed |
| Runtime interaction of #146 with #174 to #176 | finder read `connections.ts`, `target.ts`, `atem.ts`, the `server.ts` stop path, `fake-target.ts`, `ConnectionsPanel.tsx`; ran `test/connections.test.ts`, `test/cue-lateness.test.ts`, `test/atem.test.ts`, `test/pause-rules.test.ts`, `test/producer.test.ts` (130 passed); scratch script against the real `startConnections` for the stop window | no defect from the two features meeting. A `problem` report touches only `problems` and never `handed`; an offline (including one in a retry cycle) settles `handed` first, keeps `problems`, clears `check` and `state`; a by-hand pause changes only `arm` and `pause`; no double log write. The stop-window and publish-order items it raised are round 1's known nits, unchanged by the merge (Minor) |
| Not run | a real ATEM, a real acknowledging target, real Live | no adapter on main or this branch sets `acknowledges`; the ATEM's acted-on time is follow-up #186 |

**Overall:** The merge resolution is correct. Every hand-resolved hunk is the union of both sides, both sides' net changes survive byte for byte outside the conflicts, the full checks are green, and each resolved hunk has a test that goes red without it. The lateness record and the `actedOn` hook do not interact with the ATEM's problem line, its connect retry, or its by-hand pause. The only confirmed finding is round 2's LOW comment hygiene, still open because no remediation ran after round 2. The branch can open its PR as is.

## Approach decisions
- The due-time window (finding 1, round 1): symmetric half bar in `dueAt`. Carried forward unchanged.
- The dev log (finding 2, round 1): `dev:server` writes `dist/dev-cue-lateness.log`; production and the launch agent unchanged. Carried forward unchanged.
- The due-time window's test (round 1 rework): pinned by a direct controller test. Carried forward unchanged.
- The ATEM's acknowledgement: the ATEM does not set `acknowledges` in this epic; reporting its program change as the acted-on time is follow-up #186 (close-out answers 2 and 7), per #146's "Each target epic decides whether it reports an acknowledgement".
- The merge of main (`a52986e`): a target's row carries both `problems` (main) and `lateness` (this branch) as independent fields of `Entry`; neither hook reads or writes the other's state. Keep them independent.

## Confirmed Issues
### 1. Comment hygiene — LOW (aggregated)
Attribution: carried forward unchanged from `pre-pr-review-2.md` finding 1, untouched since (no remediation ran after round 2, and the merge did not touch these lines). The README phrase is from `338f74a` (setlist-controller#146 Measure how late each cue reaches each target) as reworded in `cc34410` (setlist-controller#115 pre-PR review 1 finding 4 rework), and survives the merge verbatim; the install doc phrases are from `cc34410`; the inline comment is unchanged from `338f74a` and is a **known regression, deferred** per round 1's Known regressions, deferred ("the inline comment in `dueAt` (`src/server/playback-controller.ts:607-608`) still explains only the past side").

- `src/server/playback-controller.ts:607-608` — "A listener report comes well within half a bar of the playhead crossing a beat, at any tempo a song is played at. Live snaps a drag to a bar line, so a report a whole bar past is a drag." → "A listener report comes well within half a bar of the playhead crossing a beat, at any tempo a song is played at. Live snaps a drag to a bar line, so a report a whole bar past is a drag. A beat half a bar or more ahead of the report was raised from a start the playhead left; a lead time fires well inside half a bar."
- `docs/install.md:86` — "The server also measures how late each cue reaches each connection target" → "The server also measures how late each cue reaches each connection target, when the cue's due time is known"
- `docs/install.md:86` — "a cue whose beat time is not known, such as one Live reached by a drag into the middle of a section, and Fire again, has none" → "a cue whose due time is not known, such as one Live reached by a drag a bar or more into a section, and Fire again, has none"
- `README.md:49` — "as \"Late 250 ms, median 240 ms\" for the last cue and the median of the last 50" → "as \"Late 250 ms, median 240 ms\" for the last measured cue and the median of the last 50 measured"

## Needs Further Investigation
### A. A cue at a song change may be converted at the old tempo — confirm with an OSC trace
Carried forward from rounds 1 and 2 unchanged: capture an OSC trace of a song change in a set with two tempos and check whether `/live/song/get/tempo` arrives before `/live/song/get/current_song_time`.

## Reviewed and Dismissed
- The panel's row destructure `problems` shadows the panel's own `problems` prop (`web/src/ConnectionsPanel.tsx:38`) — it already did on main for the not-configured branch; inside the map it is the row's own list and is used as such for both kinds of row, and the file-level list is read only outside the map. Do not rename as part of a fix.
- `src/server/target.ts:20-22` names "an ATEM program change" as an example of acting on a cue though the merged ATEM does not acknowledge — the comment gives examples of what a protocol can report, and the next line states the rule ("Counts only from a target that acknowledges"); follow-up #186 adopts it for the ATEM. Not misleading enough to act on.
- An offline in the ATEM's retry cycle losing or doubling a lateness line — `report('offline')` settles `handed` before anything else, `actedOn` nulls `handed` before it writes, and both run synchronously; a rejected connect never reports online, so nothing is handed in between.
- A `problem(null)` after stop — `atem.ts:151` guards it with `stopped`, and `stop` cancels the pending retry before `switcher.close()`.
- The by-hand pause (#176) and `handed` — the pause changes only `arm` and `pause`; `handed` settles at the next cue, an offline, or stop, as #146 specifies. No adapter acknowledges, so a late acknowledgement during a pause is unreachable today.

## Minor / nits
- The stop window (round 1 Minor, unchanged): a cue raised between `connections.stop()` and `live.close()` (`src/server/server.ts:247-254`) is handed to targets whose stop has begun; an acknowledging target's line set after the stop-time settle is never written, and a non-acknowledging line can land after `log.close()` resolved. The finder reproduced it with a scratch script against the real `startConnections` (`slides:Chorus` never written). The merge does not widen it: `stop: () => switcher.close()` was already the ATEM's stop on the base, and the new retry cancel is synchronous. Handing a cue to a stopping target is pre-existing on main. Latent for the lost line, since no adapter acknowledges.
- The per-target publish before the cue (round 1's known LOW F4.6, unchanged): `hand()` calls `onChange()`, a synchronous `hub.publish`, before `target.cue`, so the k-th target's cue goes out after k publishes, and its recorded lateness excludes its own publish. Unmeasured size, likely well under a millisecond per publish against a 100 ms report interval. The merge adds no target that changes it.
- `connections.stop()` uses `Promise.all` over `target.stop()` (`src/server/connections.ts:257`), so a rejecting stop skips the log, hub, bridge and HTTP closes in `server.close()`. Pre-existing on main (`f5fb867` had the same line); whether the ATEM's `close()` can reject is unverified.
- The ATEM row and the lateness log carry a line for every section cue handed to the ATEM, though it acts only on a Count Off. The hand-over time is the same for every target in one `deliver`, so these lines repeat the other targets' numbers rather than mislead. Worth a line on #186 or #187 (the per-target log summary) when either is worked; no change now.

## Test quality
Tests added in the delta: 0 by this branch. The merge brings main's #174 to #176 tests (`test/atem.test.ts`, `test/atem-switcher.test.ts`, `test/connections.test.ts`, `test/pages.test.ts`), audited in setlist-controller#114's reviews, and changes `test/fake-target.ts` only to keep both hooks. Tautology audit not re-run on main's tests for that reason. The four resolution mutants above are all killed, so the resolved code is pinned. No test combines a problem and a lateness on one row; the two fields are independent in `rows()`, so no gap hides a bug there.

## Prior-review closure
| Round 2 finding | Status | Note |
| --- | --- | --- |
| 1. Comment hygiene (LOW) | untouched | no remediation ran after round 2; re-emitted as this round's finding 1, all four entries still apply at `a52986e` |

Fully fixed 0, partially fixed 0, untouched 1. No round 2 finding was MEDIUM or higher, so nothing at that level stays open.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `a52986e`; Playwright green locally.
- **Commit hygiene:** this doc is the only addition; the tree was clean before and after the review.
- **Likely reviewer asks:** that the merge kept main's ATEM problem line and retry (the remerge-diff and the four killed mutants answer it); why the ATEM shows no "Acted on" line (follow-up #186).

## Verdict
Ready to open the PR as is. The hand-resolved merge of main keeps both sides' behaviour, and the lateness measurement does not interact with the ATEM's problems, retry or by-hand pause. Nothing is MEDIUM or higher. The one confirmed finding is round 2's LOW comment hygiene, carried forward untouched, which can ride along or be dropped. The finder's other items are round 1's known nits, unchanged by the merge, so the confirmed count stays at 1 and this is the barrel's bottom, not a new problem.
