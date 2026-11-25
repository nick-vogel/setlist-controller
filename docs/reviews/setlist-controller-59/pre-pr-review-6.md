# Pre-PR review: setlist-controller#59 the remediation of review 5's findings 1 and 2

**Branch:** `setlist-controller-59-song-transitions` vs `origin/main` (merge-base `f0a97f4`, setlist-controller#1 Follow-ups: dead sockets, the leader secret, lost and late jumps, and play from start on real Live (#102))
**Reviewed at:** HEAD `d237a7f` (setlist-controller#59 pre-PR review 5 remediation closure table), with no uncommitted changes and no untracked files. Against the merge-base the branch is 17 files, +619 / −51.
**Delta under review:** since `5b5031a` (setlist-controller#89 A reserved folder named in another letter case, such as _Pads, is listed and matched as a song), the HEAD that `pre-pr-review-5.md` reviewed. The delta is 7 files, +326 / −12: the review 5 doc and its three repro files (`0d73f8b`), the fix of finding 1 (`9ebd24f`), the fix of finding 2 (`512bcfa`) and the closure table (`d237a7f`). Its code is `src/server/fade-out.ts`, `test/fade-out.test.ts` and `test/set-name.test.ts`.
**Reviewed against:** `pre-pr-review-5.md` findings 1 and 2 (their briefs, Approach decisions and closure table), setlist-controller#85 and #86 as review 5 distilled them. The repo has no `CLAUDE.md` and no coding-standards file, so the five binding rules of the review conventions are the standard.
**Date:** 2026-10-20
**Reviewer:** 1 code-review agent and a verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint, types, unit tests, build, end to end | `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` at HEAD | all exit 0. 33 files, 671 passed and 3 skipped (the existing `plutil` and root-user gates). Playwright 30 passed |
| The delta's tests against `5b5031a` | `test/fade-out.test.ts` and `test/set-name.test.ts` from HEAD copied into a scratch worktree at `5b5031a`, then run there, with no `TZ` and with `TZ=UTC` | the new close test is red there (`1 failed`, the test at `test/fade-out.test.ts:563`). `test/set-name.test.ts` is 21/21 green, as expected: `setName` did not change, and the file is a guard against later edits, proved by the mutations below |
| Mutations of the close fix | in a scratch worktree at HEAD: the limit removed from `close`, `close` never restoring from `lost`, the limit doubled, `<=` made `<` | the first three are killed. `<` for `<=` survives, 32/32 green (finding 2). Kept as `repro/review-6-mutation-close-strict.diff` |
| Mutations of `setName` under the new test | `repro/review-5-mutation-setname-local-midnight.diff` and `repro/review-5-mutation-setname-getday.diff`, each run with no `TZ`, `TZ=UTC` and `TZ=Asia/Tokyo` | each fails 4 of 21 in every zone, so the fix holds under vitest's default pool |
| The same mutations under another vitest pool | each diff with `TZ=UTC pnpm exec vitest run --pool=threads test/set-name.test.ts`, and with `--pool=forks` | `threads`: 21/21 green for both mutations. `forks`: 4 failed for both (finding 1). The agent also saw `vmForks` kill them |
| Every path out of `lost` that sends volumes | read `src/server/fade-out.ts` at HEAD | only `regain()` (`:146`) and `close()` (`:191`) restore from `lost`, and both compare the limit. `cancel()` returns early on `lost` (`:118`), `lose()` returns early on `lost`, and a `fadeOut()` press while `lost` does nothing (`:152-153`) |
| The recommended test fixes | both briefs' diffs applied in a scratch worktree, then `pnpm exec vitest run` on each file, the `<` mutation, `--pool=threads` and `--pool=vmForks`, `tsc` and `eslint` | fade 34/34 green, and the `<` mutation now fails 2. `set-name` 24/24 green under `forks` and `vmForks`, and under `threads` the two zone checks fail. `tsc` and `eslint` print nothing |
| SHAs cited | `git cat-file -t` on `f0a97f4`, `5b5031a`, `0d73f8b`, `9ebd24f`, `512bcfa`, `d237a7f` | all are commits |
| Not run | anything against real Live, the acceptance run #71 | out of bounds for a review, and Nick's |

**Overall:** Both of review 5's fixes do what their briefs asked, and the full checks pass. Close now honours the 10-minute limit, and the weekday test now puts itself in three zones. What is left is test strength and comment text, all LOW. The time-zone test relies on vitest running each file in its own process, which is the default but nothing pins (finding 1). The close test pins the limit only from one side, so its boundary can drift from `regain()`'s (finding 2). Two comments next to the fix still say the limit lives only at connect (finding 3). None of them blocks the PR.

## Approach decisions
The Approach decisions of rounds 1 to 5 (`pre-pr-review-1.md` to `pre-pr-review-5.md`, `## Approach decisions`) stand unchanged. This round adds:
- **A time-zone test proves its zone (finding 1):** each zone block asserts `getTimezoneOffset()` for a fixed instant equals the zone's offset, so the test fails wherever setting `process.env.TZ` does not take effect. It does not pin a vitest pool in `vitest.config.ts`. The self-check covers any pool, and it keeps review 5's decision that the test does not depend on a CI step or a script flag.
- **Close's limit is tested as connect's is (finding 2):** a `closeAfterLoss(wayIn, gap)` helper beside `connectAfterLoss` in `test/fade-out.test.ts`, with the same two ways into `lost` and the same exact-limit and limit-plus-1-ms pair. Precedent: the `for (const wayIn ...)` test at `test/fade-out.test.ts:735`.

## Prior-review closure
- **Review 5, finding 1 (LOW), fully fixed** by `9ebd24f` (setlist-controller#59 pre-PR review 5 finding 1: the server's close still sets a lost fade's volumes back after the 10-minute limit). The condition is the brief's diff, and both comments the brief named carry its corrections. The repro is red at `5b5031a` and green at HEAD. The test's boundary side is open, as finding 2 of this review.
- **Review 5, finding 2 (LOW), fully fixed** by `512bcfa` (setlist-controller#59 pre-PR review 5 finding 2: #86's time-zone guard exists only in a comment, so nothing runs the weekday test in another zone). Both mutations are now red in UTC, which is CI's zone. Finding 1 of this review names the one condition under which the guard goes quiet again.
- **Review 5, findings 3 and 4 (LOW), untouched**, by Nick's close-out decision 2 (file none of the LOW tail, fix only L35 and L36).

No prior finding at MEDIUM or higher exists, so none is partly fixed or untouched at that level, and none was deferred. Neither fix was "resolved" only by editing a comment.

## Confirmed Issues

### 1. The weekday test switches zones only when vitest runs it in its own process, which nothing pins — LOW
- **Location:** `test/set-name.test.ts:4-12`, with `vitest.config.ts:3-6`, which names no pool.
- **Attribution:** introduced by `512bcfa`, which added the `describe.each` over zones. Against `5b5031a` the file ran in one zone only, so this is a limit of the new guard, not a regression.
- **Real-world trigger:** none for users, since `setName` is correct. The guard goes quiet if the repo's tests ever run in vitest's `threads` pool: someone sets `pool: 'threads'` for speed, or a vitest release changes the default. Inside a worker thread, assigning `process.env.TZ` does not change the zone `Date` uses, so all three blocks run in the host zone, and CI's host zone is UTC. Severity **LOW, capped**: this is a claim of coverage that holds only under today's default. Raise it if `vitest.config.ts` or a script ever names `threads` (`git grep -n "pool" vitest.config.ts package.json`).

**Evidence**
```ts
describe.each(['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'])("the set's name in %s", (zone) => {
  const before = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
  });
```
**Failure mode:** with either of review 5's `setName` mutations applied, `TZ=UTC pnpm exec vitest run --pool=threads test/set-name.test.ts` passes 21/21. The same command with `--pool=forks`, today's default, fails 4.

**Recommended fix:** in `test/set-name.test.ts`, give each zone its offset, and check it first:
```diff
-describe.each(['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'])("the set's name in %s", (zone) => {
+describe.each([
+  { zone: 'UTC', offset: 0 },
+  { zone: 'Pacific/Kiritimati', offset: -840 },
+  { zone: 'Pacific/Pago_Pago', offset: 660 },
+])("the set's name in $zone", ({ zone, offset }) => {
   const before = process.env.TZ;
   beforeAll(() => {
     process.env.TZ = zone;
   });
   afterAll(() => {
     if (before === undefined) delete process.env.TZ;
     else process.env.TZ = before;
   });
 
+  it(`runs in ${zone}`, () => {
+    expect(new Date('2026-10-18T00:00:00Z').getTimezoneOffset()).toBe(offset);
+  });
+
   it.each([
```

**Remediation brief**
- **Design intent:** `setName` reads the weekday from the date's own parts (`T00:00:00Z`, `getUTCDay()`), so the Mac's zone never moves a set to another day. The test puts itself in UTC+14 and UTC-11 because those catch a local-midnight parse and a local `getDay()`, and CI runs in UTC. Setting `process.env.TZ` at runtime takes effect in a child process (vitest's `forks` and `vmForks` pools) and not in a worker thread (`threads`). The added `it` makes the test say so when its zone did not take effect, instead of passing in the host zone. Neither zone has daylight saving, so the offsets are fixed.
- **Full surface:** `test/set-name.test.ts` only. No `src/` change, and no `vitest.config.ts` change (see Approach decisions).
- **Must preserve:**
  - The four weekday rows and the three not-a-date rows, with their titles and expected strings.
  - `before` read at collection time and restored in `afterAll`, so no other file in the same worker inherits a zone.
  - Both review 5 mutations fail 4 of the weekday rows under `forks` with no `TZ` and with `TZ=UTC`.
- **Do not touch:** the capture of `before` outside `beforeAll` (nits): all three blocks are collected before any hook runs, so each captures the original value.
- **Proof:** `git apply docs/reviews/setlist-controller-59/repro/review-5-mutation-setname-getday.diff && TZ=UTC pnpm exec vitest run --pool=threads test/set-name.test.ts; git apply -R docs/reviews/setlist-controller-59/repro/review-5-mutation-setname-getday.diff`. It is green now (21/21) and must be red after the fix (the two `runs in` checks fail). Then `pnpm exec vitest run test/set-name.test.ts` with no mutation is 24/24 green, and each mutation still fails under the default pool.

### 2. Close's 10-minute limit is pinned from one side, so its boundary can drift from connect's — LOW
- **Location:** `test/fade-out.test.ts:563`, the only test of the limit at close. The condition is `src/server/fade-out.ts:191`.
- **Attribution:** introduced by `9ebd24f`, which followed review 5's brief: that brief asked for one past-the-limit test. The connect side has the full pair at `test/fade-out.test.ts:735-740`, from #85.
- **Real-world trigger:** none for users. A close at exactly 10 minutes after the loss differs by 1 ms from one a millisecond later. The gap is that the brief's own rule, "the same comparison `regain()` makes", is not held by any test: the `<` mutation at close survives while the same mutation at connect is killed. The `lost` state reached through a recent restore (the loss reported within 5100 ms of the fade's own restore) has no close test at all, inside or past the limit. Severity **LOW, capped**: a test-strength gap with no user path.

**Evidence**
```ts
      if (state.kind === 'stepping' || (state.kind === 'lost' && clock.now() - state.since <= KEPT_RESTORE_MS)) restore(state);
```
**Failure mode:** `git apply docs/reviews/setlist-controller-59/repro/review-6-mutation-close-strict.diff && pnpm exec vitest run test/fade-out.test.ts` passes 32/32.

**Recommended fix:** in `test/fade-out.test.ts`, inside `describe('the fade out on its own')`, after the `for (const wayIn ...)` test that ends at `:740`:
```diff
+
+  const closeAfterLoss = (wayIn: 'after-restore' | 'stepping', gap: number) => {
+    const { clock, sent, fade } = fadeAlone();
+    fade.fadeOut();
+    fade.fromLive(TWO_TRACKS);
+    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
+    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
+    clock.advance(wayIn === 'after-restore' ? 6000 + 3000 : 1000);
+    fade.fromLive({ kind: 'connection', connected: false });
+    sent.length = 0;
+
+    clock.advance(gap);
+    fade.close();
+    clock.advance(6000);
+    return sent;
+  };
+
+  for (const wayIn of ['after-restore', 'stepping'] as const) {
+    it(`sets every saved volume back when the server closes exactly 10 minutes after the loss, and none 1 ms later (${wayIn})`, () => {
+      expect(closeAfterLoss(wayIn, 10 * 60 * 1000)).toEqual(['set 0 0.5', 'set 1 0.25']);
+      expect(closeAfterLoss(wayIn, 10 * 60 * 1000 + 1)).toEqual([]);
+    });
+  }
```

**Remediation brief**
- **Design intent:** a fade that loses Live keeps its saved volumes in `lost`, and `since` is when the bridge reported the loss. It gets there two ways: Live goes while the fade steps, or Live goes within 5100 ms of the fade's own restore. The volumes are valid for `KEPT_RESTORE_MS` after the loss, compared at the moment of use with no timer, and both paths that send them, `regain()` at `src/server/fade-out.ts:146` and `close()` at `:191`, make the same `<=` comparison. The tests hold both paths to that comparison, from both sides, by both ways in.
- **Full surface:** `test/fade-out.test.ts` only, the helper and the loop above, beside `connectAfterLoss` (`:705-718`) and its loop (`:735-740`). No `src/` change.
- **Must preserve:**
  - The tests at `:547` (close inside the limit) and `:563` (close past it) stay as they are.
  - `connectAfterLoss` and its three tests at `:720`, `:726` and `:735` are unchanged.
  - The file stays green: 34 tests after the change.
- **Do not touch:** `src/server/fade-out.ts`. The duplicated comparison at `:146` and `:191` is a nit, not part of this fix.
- **Proof:** `git apply docs/reviews/setlist-controller-59/repro/review-6-mutation-close-strict.diff && pnpm exec vitest run test/fade-out.test.ts; git apply -R docs/reviews/setlist-controller-59/repro/review-6-mutation-close-strict.diff`. It is green now (32/32) and must be red after the fix (both new tests fail). With no mutation, `pnpm exec vitest run test/fade-out.test.ts` is 34/34 green.

### 3. Comment hygiene — LOW (aggregated)
- `src/server/fade-out.ts:84-85`: "Each saved volume goes back when Live answers again within KEPT_RESTORE_MS of that." → "Each saved volume goes back when Live answers again, or the server closes, within KEPT_RESTORE_MS of that."
- `src/server/fade-out.ts:140-141`: "The limit is compared here, with no timer, as the read deadline is compared at a press." → "The limit is compared here and at close, with no timer, as the read deadline is compared at a press."

## Needs Further Investigation
None new. Review 5's A (a build with the pads in a case-variant folder) and B (review 4's investigations A to G) stand unchanged, for #71 and #76.

## Reviewed and Dismissed
- Another path that sends kept volumes without the limit. `cancel()` returns on `lost` (`src/server/fade-out.ts:118`), and it serves the leader's Stop, a jump and a `playing: false` from Live. `lose()` returns on `lost`, and a press while `lost` does nothing (`:152-153`). Only `regain()` and `close()` restore from `lost`, and both compare.
- A zone leaking from one block to the next. `describe.each` collects all three blocks before any hook runs, so each `before` is the original value, and each block's `afterAll` restores it before the next block's `beforeAll`.
- Setting `process.env.TZ` at runtime having no effect under today's config. Under the default pool both mutations fail 4 of 21, with no `TZ` and with `TZ=UTC` and `TZ=Asia/Tokyo`.
- Close inside the limit sending volumes while the bridge reports Live gone, beside the header's "a restore sent while it is gone reaches nobody". That is the existing behaviour review 5's brief preserved (`test/fade-out.test.ts:547`), and the close comment gives the reason: the saved volumes go with the server.
- The closure table's claims. Both commits exist with the subjects it quotes, the counts (32/32, 4 of 21, 671 passed) match this round's runs, and its correction to review 5's proof line (the getday mutation was already red on this Mac) matches the mutation runs here.

## Minor / nits
- The limit comparison is written twice, at `src/server/fade-out.ts:146` and `:191`. One `keptFor(lost)` helper would keep them from drifting. Finding 2's tests hold them together either way.
- `test/set-name.test.ts:5` reads `before` at collection time. It is correct (see Dismissed), and reading it in `beforeAll` would make that obvious without knowing vitest's order.
- The header's "unless Live has been gone longer than KEPT_RESTORE_MS" (`src/server/fade-out.ts:11`) counts from when the bridge reported the loss, up to `SILENT_BEFORE_LOST_MS` after Live went silent. The rest of the file says "the loss".
- The new close test at `test/fade-out.test.ts:563` repeats the setup that finding 2's helper would hold. Leave it, since it is review 5's proof.

## Test quality
2 tests added or changed in the delta. The new close test (`test/fade-out.test.ts:563`) is red at `5b5031a` and is review 5 finding 1's proof. `test/set-name.test.ts` is green at `5b5031a`, as a guard of unchanged code must be, and review 5's two mutations prove it can go red under the default pool. Tautology shapes found: 0. Nothing mocks the unit under test, asserts only a call, snapshots, or asserts nothing. The two gaps are findings 1 and 2.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass at HEAD, and so does `pnpm test:e2e`.
- **Commit hygiene:** the delta's four commits each open with the epic reference. Commit this doc and `repro/review-6-mutation-close-strict.diff`.
- **Likely reviewer asks:** why the weekday test sets `process.env.TZ` at runtime rather than in CI (finding 1 makes the answer checkable). Whether close's limit is tested both ways, as connect's is (finding 2).

## Verdict
**Ready to open a PR with follow-ups.** Zero CRITICAL, HIGH or MEDIUM. Review 5's findings 1 and 2 are both fully fixed, by code, not by a comment edit, and the full checks pass. This round's three findings are LOW: two make the new tests hold under conditions that do not exist today, and one is comment text. The Confirmed list shrank from four to three, and its content moved from a behaviour gap to test strength and comments, which is the pattern of a branch that has converged. None blocks the PR. Each is one small test-only or comment-only commit if Nick wants them, or none at all. The fade subsystem has had review fixes in rounds 1, 2 and 5, but this round finds no behaviour defect in it, so no split ticket is recommended.
