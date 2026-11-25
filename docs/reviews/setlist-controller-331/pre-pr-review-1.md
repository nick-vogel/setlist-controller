# Pre-PR review: setlist-controller#331 Follow-ups from #108

**Branch:** `setlist-controller-331-follow-ups-from-108` vs `origin/setlist-controller-108-lights-cues-follow-playback` (merge-base `e30864c` "setlist-controller#108 pre-PR review 12")
**Reviewed at:** HEAD `41f45c5` (setlist-controller#336 Lights: a fire event of any other list uses up a pending outside-linked Go and drops earlier commands), clean tree: 0 files with uncommitted changes, 0 untracked; 4 files total, +432 / -51 against the merge-base: `src/server/eos.ts` (+79 / -43), `test/eos.test.ts` (+337), `e2e/eos.spec.ts` (+7), `e2e/lights.spec.ts` (+17).
**Delta under review:** none; first review of this branch, run with `--fresh`.
**Reviewed against:** the collector epic setlist-controller#331 and the bodies of its six children #332 to #337 (all carried on this branch), `docs/reviews/setlist-controller-108/pre-pr-review-12.md` (its Approach decisions, and its findings 1, 2, 4 and 5, which #337, #332, #333 and #334 carry), and the recordings described in `test/fixtures/eos/README.md`. The repo has no `CLAUDE.md`, no `CONTEXT.md`, no ADRs and no coding standards file, so the five shared review rules stand in for them.
**Date:** 2026-11-06
**Reviewer:** 2 agents (1 code-review finder, 1 tautology audit) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test`, then the red files again 60 s later | run 1: 4 red, all 5000 ms timeouts in the set builder tests (`test/set-builder-command.test.ts:452`, `test/set-builder-plan-folders.test.ts:294`, `test/set-builder-plan-list.test.ts:439`, `test/set-builder-plan.test.ts:532`), files this branch never touched, while the audit agent ran suites alongside; retry: 230 of 230 green. Flakes, not regressions. 2048 passed, 4 skipped otherwise |
| Build and Playwright | `pnpm test:e2e` (builds first) | built; 66 passed |
| The branch's `test/eos.test.ts` against `eos.ts` at `e30864c` | audit agent, scratch worktree at the base with the branch's test file copied in; `pnpm exec vitest run test/eos.test.ts` | 209 passed, 16 red; every red one is a new #335, #336 or #337 test. The 10 green at base are accounted for in Test quality |
| #332's four mutants | audit agent, each mutant of `docs/reviews/setlist-controller-108/repro/review-11-mutants.sh` applied at HEAD in a scratch worktree (link-unreadable rewritten for the new `linkOf`, see Minor) | each killed, by the test #332 added for it |
| #333's re-judge mutant | audit agent: the FIRED branch's re-judge made to return before `changedByHand` (`if (true \|\| full && ...)`) | the strengthened test red; the base version of the same test, run beside it, green |
| #335, #336 and #337 production mutants | audit agent and finder, eight mutants of `src/server/eos.ts` at HEAD, one at a time, `vitest run test/eos.test.ts` | five killed; three survive all 225 (finding 1). Re-run here: `sh docs/reviews/setlist-controller-331/repro/review-1-mutants.sh now-rule`, `refill` and `list-number` each exit 0, 225 passed |
| Which rule each #335 test pins | `review-1-mutants.sh no-press-time` and `no-fill` | `no-press-time`: 4 red, the "renumbered to 4.5" cases green; `no-fill`: 2 red, the test at `test/eos.test.ts:2955` green (finding 2) |
| #334's e2e assertions | audit agent, scratch worktree, `pnpm build && pnpm exec playwright test --project=webkit-ipad`, old and new specs side by side under three UI mutants | Arm (E1, any run-button press pauses): new red at `e2e/eos.spec.ts:49`, old green. Mark (E3, a second line marked): new red at `e2e/lights.spec.ts:70`, old green. Cap (E2, the list's 15rem `max-height` removed): new and old both red, at the songs-in-view line (Minor) |
| Callers of the changed `Link` type and `linksOutside` | `grep -n "isOutside\|linksOutside\|'outside'" src test e2e web` | `firesNext`, `goesTo`, `pastEnd` and `firesFrom` all moved to `isOutside`/`linksOutside`; no bare `'outside'` left |
| `sent.outside ??= link` reaching a used-up Go or one sent with a placed live cue | reading the close handler (`src/server/eos.ts:700-710`) | `live` becomes null only at a close, which also empties `own`; an answered Go is sliced out of `own`. Unreachable |
| What Eos sends for a Go from a cue linked to another list | not run: no ETCnomad here | unrecorded; the linked cue's fire event stays a stand-in (Approach decisions) |

**Overall:** all six children hold. Each rule #332, #333 and #334 named now has a test that goes red without it, proved by mutation, and #335, #336 and #337's behaviour is right on every path the finder and the audit traced. Three branches of the new other-list judgement have no test that fails without them, and three of the new tests pin less than their names claim; both are LOW, with tests the audit already ran green at HEAD and red under each mutant. Nothing blocks the PR.

## Approach decisions
- Carried from `docs/reviews/setlist-controller-108/pre-pr-review-12.md` unchanged: pause by hand by the follow and link rule (#138), the OSC 1.0 framing, liveness, the reconnect judgement, own-command accounting (#273's follow use-up included), cue edits and active cues after an edit, the racing fire by number (#327), new adapter tests through `lightsRig` and the fake Eos.
- The live cue from the active cue (#337): while there is no live cue, `followed` and the other-list Go judge from the last cue Eos named active (`named.at(-1)`); `answers` and the re-judge still use the unplaced live cue. This review keeps it, and keeps its known gap (the follow's own active cue before its fire event) on the split ticket #337 proposed.
- The other-list Go (#335, #336): a Go records on its `own` entry the outside link of the cue `goFrom()` names when it is sent; an active cue Eos names with no live cue fills that link only when the Go recorded none (`??=`). Another list's fire event answers a pending Go when the event is the linked list and cue, compared as numbers, by the recorded link or by the list as read now (`goFrom()`); a link the lights cannot read (`{ outside: null }`) is answered by any other list's fire event. A matching answer still uses up every command before it (`answers`). A Go with no cue to judge from (no live cue, nothing named) is never taken by another list. This review keeps all of it; findings 1 and 2 only add tests.

## Confirmed Issues
### 1. Three branches of the other-list judgement have no test that fails without them — LOW
- **Location:** `src/server/eos.ts:455` (the "as read now" half), `src/server/eos.ts:476` (`??=`, keep the link recorded at send), `src/server/eos.ts:150` (`Number.isInteger(list) && list > 0`)
- **Attribution:** introduced. All three lines arrive in `873ec58` (setlist-controller#336 Lights: a fire event of any other list uses up a pending outside-linked Go and drops earlier commands): `git log --oneline -S'outsideLink(goFrom())' e30864c..HEAD`, and the same for the other two strings, each print only `873ec58`. None of the three exists at `e30864c` (`git show e30864c:src/server/eos.ts | grep -c "goFrom\|outsideLink"` prints 0).
- **Real-world trigger:** the read-now half answers when the lighting designer links the live cue to another list at the console and the producer's Go reaches Eos before the lights' read of that edit lands, with the read ending before the answer. The `??=` half matters only after a reconnect race with two Gos in flight. The list check matters only for a link string Eos is not known to send ("/1", "x/1"). Without any of them the effect is a Go left pending, so a cue fired at the console inside the window pauses after a fresh read, not at once: a late pause, never a lost or a false one. LOW, capped: no wrong outcome reaches the producer.

**Evidence**
```ts
answers((command, outside) => command === 'go' && (names(outside) || names(outsideLink(goFrom()))));
...
if (link) for (const sent of own) if (sent.command === 'go') sent.outside ??= link;
...
return { outside: readable && Number.isInteger(list) && list > 0 ? { list, cue } : null };
```
**Failure mode** — `sh docs/reviews/setlist-controller-331/repro/review-1-mutants.sh now-rule` (the call reduced to `names(outside)`), `refill` (`??=` to `=`) and `list-number` (the guard reduced to `readable ?`) each exit 0 with 225 of 225 tests passing, so each rule the comments at `src/server/eos.ts:224-228`, `:357-366` and `:136-141` state can be dropped with the suite green. The audit agent wrote one test per mutant (below), each green at HEAD and red under its mutant, in a scratch worktree.

**Recommended fix** — add three tests to the `describe('a cue linked to a cue in another list')` block (`test/eos.test.ts:2832`) and widen one:
```ts
  it("pauses at once on cue 5 fired at the console after another list's fire event answered a Go pressed against a list read before the console linked cue 4 outside it", async () => {
    const rig = await armedOnCue4(RECORDED_SHOW);
    rig.fake.holdFires();
    await pressGo(rig);
    const before = counts(rig.fake);
    rig.fake.editShow(LINKED_OUT, { notify: 4 });
    await vi.waitFor(() => expect(counts(rig.fake)).toBe(before + 2));
    rig.fake.holdReads();
    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);

    rig.fake.fireByHand('5');

    await rig.shows(['Live cue 5: Great Are You Lord / Count Off', ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

  it("pauses at once on cue 5 fired at the console after another list's fire event answered a second Go with no live cue by the link it recorded when sent, though Eos then named a cue with another link", async () => {
    const show = RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link: '99/1' } : cue.number === '6' ? { ...cue, link: '98/1' } : cue));
    const rig = await lightsRig({ show, position: 28 });
    await rig.read();
    await rig.arm();
    rig.fake.holdFires();
    await pressGo(rig);
    rig.fake.emit('/eos/out/active/cue/1/4', [1.0]);
    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);
    await pressGo(rig);
    rig.fake.emit('/eos/out/active/cue/1/6', [1.0]);
    rig.fake.emit('/eos/out/event/cue/99/1/fire', ['']);
    rig.fake.holdReads();

    rig.fake.fireByHand('5');

    await rig.shows(['Live cue 5: Great Are You Lord / Count Off', ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });
```
and turn the test at `test/eos.test.ts:3098` into an `it.each` over `['99', '/1', 'x/1']`:
```diff
-  it("pauses at once on cue 5 fired at the console after a fire event of any other list answered the producer's Go from a cue whose link has no \"/\"", async () => {
-    const rig = await armedOnCue4(RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link: '99' } : cue)));
+  it.each(['99', '/1', 'x/1'])("pauses at once on cue 5 fired at the console after a fire event of any other list answered the producer's Go from a cue whose link %s names no list and cue the lights can read", async (link) => {
+    const rig = await armedOnCue4(RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link } : cue)));
```
The rest of that test's body stays as it is. Recommended-diff audit: the two new tests add lines only. The `:3098` change removes nothing: the `'99'` case keeps its body, and only the name's wording changes, from "has no '/'" to the wider claim the three cases share. No production line changes.

**Remediation brief**
- **Design intent:** a Go from a cue linked to another list fires no cue of the followed list; its answer is the linked cue's fire event in its own list (a stand-in until recorded). The lights decide "this Go came from such a cue" by two lists, either one: the list as read when the Go was sent (recorded on the `own` entry, `src/server/eos.ts:240`, or filled once by the first active cue Eos names with no live cue, `:476`), and the list as read now (`goFrom()`, `:550`). A link string the lights cannot read, including one whose list is not a whole number above 0, matches any other list's event (`:150`, `:454`).
- **Full surface:** `test/eos.test.ts:2832-3110` (the `describe` block; new tests go anywhere inside it, ideally the first beside `:2886`, the second beside `:2955`), `test/eos.test.ts:3098-3109` (widened to `it.each`). Helpers used: `armedOnCue4` (`:2809`), `pressGo` (`:2818`), `counts` (`:579`), `LINKED_OUT` (`:2805`), `RECORDED_SHOW`, `RECORDED_LIST`, `lightsRig` with `position: 28` for no live cue (as at `:2956`). No change to `src/`.
- **Must preserve:** every test in `test/eos.test.ts` (225 pass at HEAD); the `'99'` case of `:3098`, the only test killed by the mutant `link.outside === null ||` to `false ||`; `test/eos.test.ts:2936` ("never takes a fire event of another list for the producer's Go with no live cue"), the guard of the deliberate no-live-cue decision.
- **Do not touch:** the production rule itself (Approach decisions: the other-list Go). See Dismissed for `??=` filling a Go recorded as null from an unlinked named cue.
- **Proof:** `sh docs/reviews/setlist-controller-331/repro/review-1-mutants.sh now-rule`, `... refill` and `... list-number` each exit 0 today and must each exit non-zero (the new test red) after the fix; `pnpm exec vitest run test/eos.test.ts` green.

### 2. Three new #335 and #336 tests pin less than their names claim — LOW
- **Location:** `test/eos.test.ts:2893` (the "renumbered to 4.5" case of the `it.each` at `:2891`), `test/eos.test.ts:2955`
- **Attribution:** introduced, by `b8d7c24` and `0d6edca` (setlist-controller#335 review passes 2 and 1) and `873ec58`: `git log --oneline -S'renumbered to 4.5' e30864c..HEAD`.
- **Real-world trigger:** none for a user; a maintainer who drops the rule a test names keeps a green suite. LOW.

**Evidence**
```ts
  // outside it. The Go was pressed against the list as read then, so that event still answers it.
  ...
      { edit: 'renumbered to 4.5', show: LINKED_OUT.map((cue) => (cue.number === '4' ? { ...cue, number: '4.5' } : cue)), notify: '4-4.5', ... },
```
**Failure mode** — `review-1-mutants.sh no-press-time` (a Go records no link when sent): the two "left with no link" cases go red, the two "renumbered to 4.5" cases stay green. After the renumber, Eos names 4.5 active, the live cue 4 is unplaced, so `goFrom()` returns 4.5, which still links to 99/1, and the read-now half answers; the comment at `:2888` says the press-time list does. `review-1-mutants.sh no-fill` (no active-cue fill): the two "pressed before Eos named its cue active" cases go red, `:2955` stays green, since at the event `goFrom()` is the named cue 4, which links out. Its name says the Go is "from the cue linked outside that Eos named active while the Go was pending", the fill's claim.

**Recommended fix**
```diff
-      { edit: 'renumbered to 4.5', show: LINKED_OUT.map((cue) => (cue.number === '4' ? { ...cue, number: '4.5' } : cue)), notify: '4-4.5', list: RECORDED_LIST.map((line) => line.replace('Cue 4:', 'Cue 4.5:')) },
+      { edit: 'renumbered to 4.5 with no link', show: RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, number: '4.5' } : cue)), notify: '4-4.5', list: RECORDED_LIST.map((line) => line.replace('Cue 4:', 'Cue 4.5:')) },
```
```diff
-  it("pauses on a cue fired at the console after the producer's Go with no live cue from the cue linked outside that Eos named active while the Go was pending", async () => {
+  it("pauses on a cue fired at the console after another list's fire event answered the producer's Go with no live cue, with Eos naming cue 4, linked outside, active while the Go was pending", async () => {
```
Recommended-diff audit: the first diff drops the renumbered case's kept link, so that case no longer shows the read-now half answering after a renumber; the read-now half after a renumber stays pinned by the `it.each` at `:2918` ("a Go pressed once the console renumbered cue 4 to 4.5"), which `goFrom`'s `placed` mutant kills. The second diff changes a name only.

**Remediation brief**
- **Design intent:** as finding 1. Each test should go red when the one rule its name or its comment claims is removed: the press-time record for the `:2891` cases, the outcome only for `:2955` (its sibling at `:3000`, "a Go pressed before Eos named its cue active", isolates the fill).
- **Full surface:** `test/eos.test.ts:2886-2911` (the case table, the `it.each` name uses `$edit`), `test/eos.test.ts:2955`.
- **Must preserve:** the "left with no link" cases, the `:2918` and `:3000` `it.each` blocks, and every other test in the file.
- **Do not touch:** `src/server/eos.ts`.
- **Proof:** after the fix, `sh docs/reviews/setlist-controller-331/repro/review-1-mutants.sh no-press-time` must report all four `:2891` cases red (today two); `pnpm exec vitest run test/eos.test.ts` green.

### 3. Comment hygiene — LOW (aggregated)
- `src/server/eos.ts:388-392` — "Until a fire event places the live cue, the follow and the Go from a cue linked outside are judged from the last cue Eos named" → "While there is no live cue, the follow and the Go from a cue linked outside are judged from the last cue Eos named; for the Go only, so is a live cue the lights cannot place". Also break the line at `:392` before "It answers none of the lights' own commands." (it runs to about 170 characters). The code: `followed` falls back only when `live` is null (`:409`), `goFrom` also when the live cue is unplaced (`:550`), and the active-cue branch (`:481`) also places the live cue, not only a fire event.
- `src/server/eos.ts:136-141` — "one with no "/", no cue number after it or no list number before it names no cue the lights can read" → "one with no "/", no cue number above 0 after it, or no whole list number above 0 before it, names no cue the lights can read".
- `src/server/eos.ts:326-328` — "by the cue list as read when the Go was sent or as read now; else it is ignored" → "by the cue list as read when the Go was sent or as read now, or as the answer to a Go from a cue whose link the lights cannot read; else it is ignored".

## Needs Further Investigation
### A. A follow of a live cue renumbered at the console pauses the lights by hand — confirm with a `lightsRig` test
Reasoned by the finder, not executed: the live cue 3 is renumbered to 3.1 at the console, keeping its follow to 3.5; the fake's `editShow` names 3.1 active. After the read, `from` is 3, unplaced, so `firesNext('3')` is undefined (`src/server/eos.ts:409`), and with nothing pending, 3.5's fire event calls `changedByHand()`. Pre-existing, untouched: `e30864c` judges `firesNext(from)` the same way, and #337 scoped its fallback to no live cue. Confirm with `armedOnCue3`-style setup, `editShow` renumbering 3 with a follow, then the follow's fire event, and `neverPaused`. If red, it is a follow-up bug ticket; the fix is `firesNext(placed(from) ? from : named.at(-1) ?? from)`.

### B. A drop after Eos named a cue while a Go with no live cue was pending is not judged at reconnect — confirm whether it should be
Reasoned, not executed: the close seeds the cues a pending Go may fire from `live` only (`src/server/eos.ts:701`), so with `live` null and `named` = ['3'], `beforeOwn` stays empty and the reconnect's active cue is not judged; a cue fired at the console during the drop never pauses. Pre-existing, untouched, and it needs two races in a row (a Go in the milliseconds after a reconnect, then a drop before its answer). The close comment states the rule as "a Go or Back with no live cue to predict it from", so whether a named cue counts is Nick's call, not a defect yet.

## Reviewed and Dismissed
- `sent.outside ??= link` also fills a Go recorded as null because the cue it was sent from has no outside link, not only a Go with no cue (finder F3) — the event-time `goFrom()` gives the same answer at that moment, since it reads the same `named.at(-1)`, so the fill adds no new outcome; with two Gos from the same cue it helps. Leave the `null` sentinel as is.
- The e2e Go/Back test's last `Armed` can pass before a pause reaches the page (finder F6) — the test's claim is that a press never pauses (target.ts, #137); the audit's mutant E1, which pauses on any run-button press, turns it red at `e2e/eos.spec.ts:49`, while the old spec stays green.
- The lights.spec scroll step may clamp at the top and pass trivially (finder F7) — the row is scrolled to the top first, and the songs are asserted in view before the scroll, so the step scrolls up by at most about 40 px from a page that is scrolled down; and the cap mutant E2 turns the test red.
- `test/eos.test.ts:2936`, green at base — a deliberate guard of the no-live-cue decision (#335 assumptions, `7ea925a`): it goes red if a Go recorded as null were taken by any other list. Keep it.
- The #332 and #333 tests green at base — they pin rules already on the base; each is killed by its mutant (verified table).
- The number comparison in `names` — "1.50" and 1.5, "099" and 99 compare equal; a non-numeric list or cue gives NaN, which never matches; the outside list is never the followed list.
- `linksOutside` losing callers with the `Link` change — still called by `pastEnd` (`src/server/eos.ts:568`) and `firesFrom` (`:582`).

## Minor / nits
- `test/eos.test.ts:3058` (both cases) is green at base, where the walk-in event took the Go and the 99/1 event was ignored, with the same outcome. Its sibling at `:3036` is the one that tells the rules apart; `:3058` pins only that the linked event still answers after an unmatched one. Keep it.
- `e2e/lights.spec.ts:94-97`: the new `.check` assertion mostly follows from the songs-in-view assertion at `:91`; under the cap mutant both the old and new test go red at `:91`, not at the new line. Not vacuous, adds little.
- `docs/reviews/setlist-controller-108/repro/review-11-mutants.sh link-unreadable` no longer applies at HEAD (exit 3, "did not apply"), since its regex targets the base `linkOf`. The HEAD equivalent is `if (!readable) return null;` before the same-list return. It is #108's audit trail; leave it, and use this note when re-running it.
- `linkOf` (`src/server/eos.ts:145-151`) reads with `Number()`, so "0x63/1" is list 99 and " 99/1" is 99. Harmless for what Eos sends.

## Test quality
Tests added or changed in `test/eos.test.ts`: 26 cases. Against `eos.ts` at `e30864c`: 16 red (every #335, #336 and #337 test), 10 green: the #332 and #333 tests (green by design, each killed by its mutant), `:2936` (a guard, Dismissed), `:3058` (Minor), and `:3098` (killed by the link-unreadable mutant and by `link.outside === null ||` to `false ||`). Mutants of the new production code: five of eight killed; the three survivors are finding 1, and two tests that pin less than they claim are finding 2. E2e: the Arm and mark assertions go red under their mutants where the old ones stayed green; the check-in-view assertion adds little (Minor). No mock of the unit, no expectation computed with production code, no snapshot, no call-shaped, assertion-free or prose test.

## Before opening the PR
- **CI readiness:** the repo has no CI. Lint, typecheck, the build and Playwright (66) are green at `41f45c5`; `pnpm test` had 4 set builder timeouts under concurrent load, all green on the retry.
- **Commit hygiene:** this doc and `repro/review-1-mutants.sh` are the only additions; nothing to drop.
- **Likely reviewer asks:** why a Go with no live cue is left pending through another list's fire event (#335's dropped half); what Eos really sends for a Go from a cue linked to another list (still a stand-in); the two-list rule for the other-list Go.

## Verdict
**Ready with follow-ups.** 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW. Every child of #331 holds and is pinned, apart from three branches of the new other-list rule (finding 1) and three tests narrower than their names (finding 2), both test-only changes with tests already run green at HEAD and red under each mutant. They can land before the PR opens or as follow-ups; neither gates it. Needs Further Investigation A and B are pre-existing and go to the next collector if confirmed.
