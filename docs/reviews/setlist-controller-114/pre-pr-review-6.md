# Pre-PR review: setlist-controller#114 run 3, the remediation of pre-PR review 5 (findings 1 and 3)

**Branch:** `setlist-controller-114-atem-lobby-feed` vs `origin/main` (merge-base `cd75677` "Merge pull request #185 from nick-vogel/setlist-controller-114-atem-lobby-feed")
**Reviewed at:** HEAD `a8e0c62` (setlist-controller#114 pre-PR review 5 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 9 files total, +690 / -37 against the merge-base.
**Delta under review:** since `cb3971d` (setlist-controller#184 A failed reconnect after the ATEM's socket process respawns leaves it offline, with the reason only in the log), the HEAD `pre-pr-review-5.md` reviewed: 8 files, +353 / -7, of which 4 are code and tests (`src/server/atem.ts`, `test/atem.test.ts`, `test/atem-switcher.test.ts`, `test/fake-switcher.ts`) and 4 are review 5's doc and repro files. The commits: `f4701bd` (review 5), `46bf9d3` (finding 1), `09b7b7d` (finding 3), `a8e0c62` (closure table).
**Reviewed against:** setlist-controller#114 (the epic spec), the intent of pre-PR review 5 findings 1 and 3 and its Approach decisions and closure table. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok, lockfile up to date |
| Lint | `pnpm lint` | green, this doc's repro files included |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 51 files, 1091 passed, 4 skipped (the Linux-only setup-screen cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed |
| Mutants of the fix at HEAD | scratch worktree at `a8e0c62`, each mutant of `connectOnce`'s success path (`src/server/atem.ts:166-170`) applied alone, `pnpm exec vitest run test/atem.test.ts test/atem-switcher.test.ts` | killed by the new test: the fix reverted (M1, the code at `cb3971d`), `retry = null` without `retry?.()` (M2). Survived: `retry?.()` without `retry = null` (M3, finding 1), `if (stopped) return;` removed (M4, a carried gap class, see Minor) |
| The online report's cancel | same worktree, `repro/review-6-mutation-online-keeps-retry.diff` applied | survived, 85 passed (finding 1) |
| The M4 class before the fix | scratch worktree at `cb3971d`, `if (!stopped) report.problem(null)` made unconditional | survived, 84 passed: the gap predates the remediation |
| Finding 1, resolve half | `repro/review-6-giveup-after-resolve.test.ts` copied into `test/` of a scratch worktree | green at HEAD; red with `repro/review-6-mutation-resolve-keeps-retry.diff` applied (`connects` 2 where 3 is expected) |
| Finding 1, online half | a probe test in the shape of the recommended fix (b), in a scratch worktree | green at HEAD; red with `repro/review-6-mutation-online-keeps-retry.diff` applied (`expected 1 to be 2`) |
| Finding 3's pin | read `node_modules/atem-connection/dist/atem.js:57` and `:206` | the pinned string is the `AtemWrapper` re-emit, and its emitter is the `BasicAtem` the client listens on. Its red was proved by library mutation in review 5's closure, not re-run here |
| threadedclass on a crash (review 5 NFI D) | read `threadedclass@1.4.1/dist/parent-process/manager.js:479-497, 668-670, 901-906, 232-247` | every proxy method call is tracked in `child.methods` by `doMethod`, and `_childHasCrashed` (a closed child or a ping timeout) rejects all of them before it restarts; a call before the new child initialises throws. A connect in flight at a crash rejects, it never resolves later |
| Not run | the real ATEM Mini, a real threadedclass respawn, Linux CI | no unit here; #145 owns the acceptance run on the real unit |

**Overall:** Both remediations do what review 5 asked: a connect that resolves now cancels the pending connect again and clears the reason, and the library pin now covers `Atem`'s re-emit. All checks are green. The one confirmed finding is a LOW test gap: nothing pins that a cancel also frees the slot for the next connect again, on either path that cancels (the new resolve path and the older online report), and dropping `retry = null` from either keeps the suite green while leaving the ATEM offline for good after its next give-up. Nothing blocks the PR.

## Approach decisions
- Signal handling with the ATEM library (carried from review 1 finding 1): unchanged.
- Fake switcher failure modes (carried from review 2): extend `test/fake-switcher.ts` with options and methods (`failConnects`, `holdEchoes`, `refuseCuts`, `connectOnItsOwn`, `respawnFailingReconnect`, and now `holdConnects`), never `vi.fn` mocks of the switcher client. Finding 1's tests use the existing members only.
- Own-cut matching (#176, `9921bec`): unchanged.
- A connect that rejects (#175, `7670d8b`, scheduling in `retryLater` since #184): unchanged.
- Coming online with no connect asked (review 3 finding 1, `35e574d`): unchanged.
- A failed reconnect after a respawn (#184, `af480b4`, pin widened in `09b7b7d`): unchanged.
- A connect that resolves (review 5 finding 1, `46bf9d3`): cancels a pending connect again and clears the reason, mirroring the online report. Unchanged.
- Cancelling the pending connect again (new, finding 1): every cancel pairs `retry?.()` with `retry = null`, since `retryLater` reads a set `retry` as pending; each of the two mid-run cancels (online report, resolved connect) is pinned by a test that gives up again after the cancel and expects a connect again. `stop` sets `stopped`, so its pairing is not load-bearing and needs no such test.
- The program line (#183, `74710b7`): unchanged.

## Confirmed Issues
### 1. Nothing pins that a cancelled connect again frees the slot for the next one, so dropping `retry = null` would leave the ATEM offline for good after its next give-up — LOW
- **Location:** `src/server/atem.ts:169` (resolve path) and `src/server/atem.ts:197` (online report), read by `src/server/atem.ts:152` (`if (retry || stopped) return;`); the tests in `test/atem.test.ts:743` and `:775`
- **Attribution:** the resolve half is introduced by `46bf9d3` (review 5 finding 1's fix), whose new test kills the no-cancel mutants but not the no-clear one. The online half is pre-existing code (`35e574d`, an ancestor of `cd75677`), exposed by `af480b4` (#184): at `$BASE` the catch created the timer unconditionally (`git show cd75677:src/server/atem.ts | grep -n -A14 'const connectOnce'`, lines 156-161), so a stale `retry` blocked nothing; #184's `retryLater` returns while `retry` is set, which made `retry = null` load-bearing.
- **Real-world trigger:** none while the code stays as it is; both lines are present and correct. The gap is that a refactor dropping either `retry = null` keeps every test green, and then, after the ATEM comes online on its own or a connect again resolves, the next give-up shows its reason on the row and nothing ever connects again until the server restarts. LOW, a test gap.

**Evidence** — the slot check that a stale `retry` blocks, and the two cancels:

```ts
  const retryLater = (report: TargetReport) => {
    if (retry || stopped) return;
```

```ts
      if (stopped) return;
      retry?.();
      retry = null;
      report.problem(null);
```

**Failure mode** — executed. Resolve half: `repro/review-6-giveup-after-resolve.test.ts` (first connect rejects, the connect again is in flight when the client gives up, it resolves, the client gives up again) is green at HEAD and red with `repro/review-6-mutation-resolve-keeps-retry.diff` applied (`connects` 2 where 3 is expected); `test/atem.test.ts` and `test/atem-switcher.test.ts` pass all 85 under that mutant. Online half: with `repro/review-6-mutation-online-keeps-retry.diff` applied, the same two files pass all 85, and a probe of recommended test (b) goes red (`expected 1 to be 2`).

**Recommended fix** — two tests in `describe('a failed reconnect after the socket process respawns')` of `test/atem.test.ts`, no production change.

(a) After "drops its reason and connects no more once a connect again resolves after it gives up while that connect is in flight" (`:775`), a sibling with the same steps up to `await resolved;`, then:

```ts
    const again = next((snapshot) => atem(snapshot)?.problems[0] === REASON);
    switcher.respawnFailingReconnect(GAVE_UP);
    await again;
    clock.advance(RETRY_MS);
    expect(switcher.connects).toBe(3);
```

titled "connects again after a later give-up, once a connect again that resolved cancelled the one before it".

(b) After "drops its reason and connects no more once the ATEM comes online on its own during the pause" (`:743`):

```ts
  it('connects again after a later give-up, once the ATEM came online on its own during the pause', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, sees } = await atemRig(switcher, { armed: false, clock });
    const offline = sees('offline');
    switcher.respawnFailingReconnect(GAVE_UP);
    await offline;
    const online = sees('online');
    switcher.connectOnItsOwn();
    await online;
    const again = next((snapshot) => atem(snapshot)?.problems[0] === REASON);
    switcher.respawnFailingReconnect(GAVE_UP);
    await again;
    clock.advance(RETRY_MS);
    expect(switcher.connects).toBe(2);
  });
```

**Remediation brief**
- **Design intent:** at most one connect again is ever pending, held in `retry`; `retryLater` starts one only while `retry` is null, so every cancel must both stop the timer (`retry?.()`) and free the slot (`retry = null`). The two mid-run cancels are the online report (the ATEM connected on its own) and a resolved connect (the client retries on its own from then on); after either, a later give-up or rejection must schedule a fresh connect again after `RETRY_MS`.
- **Full surface:** `test/atem.test.ts` only, two new cases beside `:743` and `:775`. `atemRig`, `manualClock`, `GAVE_UP`, `REASON` and `RETRY_MS` are already in scope in that describe (`:675-681`). The production lines they pin are `src/server/atem.ts:168-169` and `:196-197`, unchanged.
- **Must preserve:** the existing `:775` test as it is (it kills M1 and M2); "connects once per pause when it gives up while a connect again is pending" (`:759`); "drops its reason and connects no more once the ATEM comes online on its own during the pause" (`:743`).
- **Do not touch:** `retryLater`'s `|| stopped` and the give-up listener's `stopped` guard (review 5 finding 4, deferred); the `stopped` guard on the resolve path (see Minor, M4); `test/fake-switcher.ts`.
- **Proof:** from the repo root, in a scratch worktree at HEAD: `git apply docs/reviews/setlist-controller-114/repro/review-6-mutation-resolve-keeps-retry.diff`, then `pnpm exec vitest run test/atem.test.ts` must be red on test (a); in a fresh scratch worktree, `git apply docs/reviews/setlist-controller-114/repro/review-6-mutation-online-keeps-retry.diff`, then the same command must be red on test (b). Both green without the mutants. The standalone repro: copy `docs/reviews/setlist-controller-114/repro/review-6-giveup-after-resolve.test.ts` into `test/` and `pnpm exec vitest run test/review-6-giveup-after-resolve.test.ts`.

### 2. Comment hygiene — LOW (aggregated)
- `src/server/atem.ts:160-163` — "unless the ATEM has stopped: a connect that close() made reject on the way down neither reports nor connects again." → "A connect that resolves or rejects after the ATEM has stopped does nothing: it neither reports nor connects again."
- `test/fake-switcher.ts:8-9` — "It is disconnected until the adapter asks it to connect, and then reports connected at once, unless the test built it to stay offline." → "It is disconnected until the adapter asks it to connect, and then reports connected at once, unless the test built it to stay offline or holds the connect until it releases it."
- `test/fake-switcher.ts:53-54` — "Holds the next connect: it is counted in connects and records its host at once, then waits until the returned function is called, and carries on as usual after." → "Holds the next connect: it is counted in connects and records its host at once, then waits until the returned function is called, and carries on as usual after, even if the fake was closed meanwhile. A second hold before that connect replaces the first."
- Carried from review 5 finding 5 (deferred by scope there), unchanged: `src/server/atem-switcher.ts:12-13`, `test/fake-switcher.ts:13-14`, `test/fake-switcher.ts:17-18`, with the corrected text as written in `pre-pr-review-5.md`.

## Needs Further Investigation
### A. Whether the ATEM answers a cut to the input already on program
Carried from reviews 1 to 5, unchanged. What would settle it: #145's acceptance run on the church's ATEM Mini.

### B. Whether any ATEM reports a camera or video input with port type ExternalDirect
Carried from reviews 3 to 5, unchanged. What would settle it: the port types the real unit reports, in #145.

### C. Whether an exception thrown from a connections callback inside a library event escapes into threadedclass
Carried from review 5, unchanged. What would settle it: whether `report.problem` can throw, and whether `main.ts` handles `unhandledRejection`.

Review 5's D (whether threadedclass resolves a call into a child that then restarts) is settled by reading and leaves this list: it rejects them (see the threadedclass row above). Review 5 finding 1's race is therefore narrower than its trigger said: it needs the adapter's connect to go into the restarted child and succeed while the library's own reconnect into the same child fails.

## Reviewed and Dismissed
- The new cancel on a resolve dropping a connect again that was still needed (a resolve that is stale after the library gave up): a connect in flight when the child crashes or freezes is rejected by threadedclass before the restart (`rejectChildMethods`), so it cannot resolve after the give-up that restart leads to.
- An older connect rejecting after a newer one resolved, leaving a reason and a connect again (agent F7): it needs two connects in flight, which needs a give-up during a connect; a give-up needs a `restarted` event, and the crash before it has already rejected the connect in flight, whose `retryLater` takes the slot, so the give-up finds a retry pending and starts no second connect.
- A second pending connect again after the fix: `retryLater` still returns while `retry` is set; "connects once per pause when it gives up while a connect again is pending" (`:759`) is green.
- The extended pin reading the wrong emitter: `atem.js:206` passes the `BasicAtem` itself to `AtemWrapper`, the object `atem-switcher.ts` listens on.
- Carried from review 5 and still holding: two pending connects again at once; a give-up during an in-flight connect that then rejects; the client's offline report before the give-up; the library left at CONNECTED after a frozen child's give-up; a cut hanging after a give-up; the connection listener reporting offline after `stop`; the program line not refreshing on a rename alone; another input named "Pro" or "Camera"; the pin test as a prose test.

## Minor / nits
- `src/server/atem.ts:167`: the `if (stopped) return;` guard on the resolve path is untested (M4 survives), as was its predecessor `if (!stopped)` at `cb3971d` (proved). The same class as review 3 finding 2 and review 5 finding 4, both deferred; the only effect under the mutant is a `problem(null)` on a stopped target, and the resolve path schedules nothing. Review 5's brief named ":659/:796 connects no more once the server stops during the pause" as pinning it; they do not.
- `test/fake-switcher.ts:114-125`: a held connect released after `close()` marks the closed fake connecting and reports it online (agent-executed), where the library's connect after `destroy` rejects. No test does this today; a future test of the stopped resolve path would need the fake to reject there, or an adapter-level harness as `repro/review-6-giveup-after-resolve.test.ts` builds.
- `test/fake-switcher.ts:134-140`: a second `holdConnects()` before the next connect replaces the first, so the first release does nothing (agent-executed). No test calls it twice; the comment entry above records it.
- `test/atem-switcher.test.ts:341-342`: the re-emit pin is a whole-file `toContain`, so a version that adds a second, wrapping emission elsewhere in `atem.js` would still pass.
- Carried from review 5, unchanged: the literal `Error: ` strip at `src/server/atem-switcher.ts:82`; no near-miss row for `startsWith`; the pin's `indexOf` of -1 running the slice to the end; `sentence('')`.

## Test quality
Tests added or changed in the delta: 1 new case (`test/atem.test.ts:775`), 1 extended (`test/atem-switcher.test.ts:331`), and the fake member `holdConnects`. The new case is red against the pre-fix code (M1 is the code at `cb3971d`, killed) and against `$BASE` (no `holdConnects`, no `onGaveUp`), and kills M2; it does not kill M3, which is finding 1. The extended pin is green against `$BASE`'s library and `cb3971d`'s, by design: it pins the installed library, and review 5's closure proved it red by library mutation. Tautology shapes: 0 (no self-computed expectation beyond the pin's deliberate `RESPAWN_RECONNECT_FAILED`, no mocked unit, no call-shaped-only assertion, no snapshot).

## Prior-review closure
Against `pre-pr-review-5.md` (HEAD `cb3971d`): 5 findings, all LOW. Fully fixed: 2 (finding 1, `46bf9d3`, verified against its intent by mutants M1 and M2 and the threadedclass read; finding 3, `09b7b7d`, verified by reading the pinned emit and its emitter). Partially fixed: 0; finding 1's test leaves the no-clear half of its own cancel unpinned, which is this review's finding 1, a new test gap rather than an unfixed defect. Untouched: 3, all deferred by scope in review 5's remediation (findings 2, 4 and 5); none was escalated, and none is MEDIUM or higher. No fix was made by editing only a comment.

## Before opening the PR
- **CI readiness:** lint, typecheck, unit suites and build green locally; Playwright green (not in CI).
- **Commit hygiene:** this doc and its three repro files are the only additions.
- **Likely reviewer asks:** why a resolved connect cancels a give-up's connect again (the threadedclass read above answers it); why the give-up is told apart by message text (the pin test).

## Verdict
Ready to open the PR with follow-ups. Review 5's two opted-in findings are fixed and verified against their intent, every check is green, and the confirmed list shrank from four findings plus hygiene to one LOW test gap plus hygiene: the review is at the bottom of the barrel for this subsystem. The retry logic in `src/server/atem.ts` has now been reworked by #175, review 3, #184 and review 5; if a further round finds a behaviour defect in it, the recommendation is a split ticket with its own test matrix for the connect-again state, not another in-place rewrite. Nothing gates the PR.
