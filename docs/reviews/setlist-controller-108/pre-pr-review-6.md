# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `f0eab4b` "Merge pull request #270 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback")
**Reviewed at:** HEAD `2c9853c` (setlist-controller#271 Lights: a reconnect after the producer's Go or Back, with its fire event lost, pauses them by hand; the merge of the #271 lane commit `29b5654`, which has the same subject), clean tree: 0 files with uncommitted changes, 0 untracked; 50 files total, +8740 / -66 against the merge-base. Of those, 12 are pre-PR reviews 1 to 5 and their repros, and 13 are Eos recordings and their README under `test/fixtures/eos/`. The code under review is `src/server/eos.ts` (571 lines), `src/server/osc-tcp.ts`, the changes to `connections.ts`, `target.ts`, `start-up.ts`, `src/shared/snapshot.ts`, `web/src/ConnectionsPanel.tsx`, `web/src/PreServiceCheck.tsx` and `web/src/styles.css`, the fake Eos and fake target, the tests, two Playwright specs and four hand-run Python recording scripts.
**Delta under review:** none; a fresh review of the whole working surface (`--fresh`, stage 2 round 1 of the fifth `/epic-loop` run). New since pre-PR review 5 (`48f2076`): the merge of `origin/main` with #84's follow-ups (`44ff7a0`, PR #270) and #271 (`29b5654`, merged as `2c9853c`).
**Reviewed against:** the epic body of setlist-controller#108 and the bodies of #138, #249, #250, #254, #257, #268 and #271; the Approach decisions, Needs Further Investigation and Reviewed and Dismissed sections of pre-PR reviews 1 to 5. The repo has no `CLAUDE.md` and no coding standards file, so the five shared review rules stand in for them.
**Date:** 2026-11-01
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 71 files, 1798 passed, 4 skipped (the same 4 as reviews 4 and 5) |
| Build | `pnpm build` | built |
| Playwright | `pnpm exec playwright test`, after the build | 66 passed |
| Adapter core | finder A over `src/server/eos.ts`, `src/server/osc-tcp.ts`, `test/fake-eos.ts`, `test/fixtures/eos/README.md`, with throwaway tests through `lightsRig` in a scratch worktree, and 3 controls that passed | 10 candidates, 4 executed red |
| Server glue, row, docs, scripts, e2e | finder B over the other changed files, read only | 10 candidates |
| Base oracle of the new tests | the HEAD versions of `test/connections.test.ts`, `test/pages.test.ts`, `test/start-up.test.ts` run at `f0eab4b` in a scratch worktree; `test/eos.test.ts` and `test/osc-tcp.test.ts` are red by import there | 7 of 9 added tests red at base; 2 green (see Test quality) |
| Mutation of #271's walk | 6 mutants of `src/server/eos.ts:350-364` and `:459-465`, one at a time, against `test/eos.test.ts` (96 tests, green unmutated) in a scratch worktree | 5 red, 1 green (m3: `?? null` to `?? from`), which is finding 1's third case |
| Findings 1 and 2 | `sh docs/reviews/setlist-controller-108/repro/review-6-repro.sh`, five tests inserted in a scratch worktree at HEAD | all 5 red, each at its pause assertion after the row showed the expected live cue |
| Attribution | `git log -S` over `f0eab4b..HEAD` for each indicted expression | the base has no lights code, so every finding is introduced by this branch; the commit is named in each |
| Real Eos for a Go on the last cue, a Back on the first, and a Back during a fade then a Go | not run: no ETCnomad here; the fake models the first two as firing nothing and runs no fades | recorded as caps on findings 1 and 2 |

**Overall:** the branch is sound, and every check is green. #271 does what it asks for its own cases: a single Go, a single Back, a Go by a link, two Go presses, and a Go whose cue follows on all keep the lights armed, and a cue fired at the console still pauses. But the cue each Go or Back lands on is predicted as one cue, from the cue before it, so three drop orders still pause the lights by hand. Separately, a pending Go or Back still answers a fire event of any cue, which can cause a false pause with no drop at all, or hide a cue fired at the console. Both are LOW, and both belong in one split ticket rather than a sixth in-place rewrite of the reconnect judgement. Nothing gates the PR except #140, which is Nick's.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254, review 3 finding 1, #268, #271): the cue Eos is on at connect is judged once against the live cue kept from before the drop (`before`), the cues kept in `beforeOwn` at the close, and the `firedAfter` chain of each. `beforeOwn` holds each unanswered fire's cue, and the cue each unanswered Go or Back lands on, predicted by a walk over the unanswered commands in order from the live cue. Both are cleared together by the lights' own command (`sendOwn`), a fire event, and the judgement; both survive a failed connect. This review proposes that the walk carry a set of cues rather than one (finding 1). Since this widens what the judgement accepts, the proposal goes to a split ticket for Nick to decide, not to an in-place fix.
- Own-command accounting (#137, #138): a fire event uses up the first pending own command that accounts for it, with every command before it. This review proposes that a Go or Back account only for a cue it can land on, and never for a fire event that the live cue's follow explains (finding 2). It goes in the same split ticket as finding 1, since it uses finding 1's prediction.
- Shadowed cues (#252, #258): the check never calls a cue that fires "never fires". The exemption is every cue that a follow or hang of any cue reaches, with the false negative #258 accepted.
- File check shape (#256 and the #84 merge): a name-matching target answers `FileCheck { unmatched, problems }`; problems render first, under "Problems:", and names under "Cannot match:".
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter, as the epic's testing decisions require. Row behaviour that needs effects to run is tested in Playwright (`e2e/lights.spec.ts`).

## Confirmed Issues
### 1. #271 predicts one cue for each Go or Back, so three drop orders still pause the lights by hand — LOW
- **Location:** `src/server/eos.ts:459-465` (the walk at the close), with `goesTo` and `backsTo` at `:353-364`; the comment at `:452-455` claims the first and third cases are handled.
- **Attribution:** introduced by `29b5654` (setlist-controller#271 Lights: a reconnect after the producer's Go or Back, with its fire event lost, pauses them by hand): `git log -S'backsTo(from)' f0eab4b..HEAD` names only it. #271's body asks for "a Back that only stops a fade" to be predicted.
- **Real-world trigger:** the producer presses Go or Back during a silent drop. The row still reads online for 3 to 4 s while the pings go unanswered, and the lights look stuck, which is the trigger #271 names. On reconnect the row reads "Paused by hand" though nobody touched the console, and the lights fire nothing until the producer arms them again. LOW, capped: it needs a drop that eats every answer, plus one of the press orders below. Upgrade to MEDIUM if the #140 rehearsals show producers pressing Go or Back during drops. The check is the server log's "Eos stopped answering the lights" line next to a run-button command.
**Evidence**
```ts
      let from = live?.number ?? null;
      for (const { command } of own) {
        if (typeof command === 'object') from = command.cue;
        else from = (from === null ? undefined : command === 'go' ? goesTo(from) : backsTo(from)) ?? null;
        if (from !== null) beforeOwn.add(from);
      }
```
**Failure mode** — each case is armed on the recorded show and proved red by `repro/review-6-repro.sh`:
- (a) Back that only stopped a fade, then Go. Live cue 3 is fading, and the producer presses Back, then Go. Eos stops the fade and stays on 3, then Go takes it to 3.5. The walk moves `from` to 2 and then back to 3, so `beforeOwn` is {2, 3} and `before` is 3. The reconnect names 3.5, so the lights pause (test `review 6 f1a`). The comment "A Back that only stopped a fade left Eos on the live cue, kept already" holds only when the Back is the last command.
- (b) The live cue's follow runs unheard, then Go. Cue 3 has a follow to 3.5, which fires during the drop, and then Go takes Eos from 3.5 to 4. The walk predicts `goesTo('3')`, which is 3.5. The reconnect names 4, which is neither 3.5 nor in `firedAfter` of 3 or 3.5, so the lights pause (`f1b`). Two Go presses with a follow between them fail the same way.
- (c) A Go or Back that fires nothing, then another press. Live cue 8 is the last cue, the producer presses Go, which fires nothing, then Back, which goes to 7. `goesTo('8')` is undefined, so `from` becomes null and the Back keeps nothing. The reconnect names 7, so the lights pause (`f1c`, and mutant m3 of the test audit). A Back on the first cue, then Go, is the mirror case. The fake models a Go past the end as firing nothing; real Eos is not recorded.
**Recommended fix** — walk a set of the cues Eos may be on, not one cue. Add after `backsTo`:
```ts
  const landsOn = (command: 'go' | 'back', number: string): string[] => {
    if (!cues.some((cue) => cue.number === number)) return [];
    return [number, ...firedAfter(number)].flatMap((cue) => {
      const to = (command === 'go' ? goesTo(cue) : backsTo(cue)) ?? cue;
      return command === 'back' ? [to, cue] : [to];
    });
  };
```
and replace the walk:
```diff
-      let from = live?.number ?? null;
-      for (const { command } of own) {
-        if (typeof command === 'object') from = command.cue;
-        else from = (from === null ? undefined : command === 'go' ? goesTo(from) : backsTo(from)) ?? null;
-        if (from !== null) beforeOwn.add(from);
-      }
+      let at = new Set(live === null ? [] : [live.number]);
+      for (const { command } of own) {
+        at = typeof command === 'object' ? new Set([command.cue]) : new Set([...at].flatMap((cue) => landsOn(command, cue)));
+        for (const cue of at) beforeOwn.add(cue);
+      }
```
Audit of the diff, line by line:
- No live cue keeps nothing. Kept: `at` starts empty and stays empty.
- A Go or Back from a cue not in the list keeps nothing, and neither does any press after it until a fire by number. Kept: `landsOn` returns [], so `at` empties.
- A fire by number keeps its cue, and later presses are predicted from it. Kept.
- Dropped on purpose: a Go past the end, or a Back on the first cue, now keeps the cue itself. A Back keeps both the cue before and the cue itself, since it may only have stopped a fade. A press from a cue with a follow chain is predicted from every cue of the chain.

The fix fails where the set catches the operator: the accepted set widens, so a cue fired at the console during the drop that happens to fall inside it no longer pauses the lights. Recorded show, live cue 3: a Back keeps {2, 3} where it kept {2}, and 3 is already `before`, so nothing new there. A Go from a cue with a follow keeps the follow's target too. `firedAfter` ends on a looping chase, so the set is bounded by the list. Nick decides whether that trade is worth it.
**Remediation brief**
- **Design intent:** `beforeOwn` holds every cue the lights' own unanswered commands may have left Eos on when a drop ate their answers. On reconnect, the cue Eos is on counts as the lights' own if it is one of those, or a cue that one of them runs on to (`firedAfter`). Otherwise it is a change by hand. A Go or Back names no cue, so its cue is predicted from the cue list as last read in full. The judgement must still pause on a cue fired at the console during the drop that no own command could have reached.
- **Full surface:** `src/server/eos.ts:350-364` (`goesTo`, `backsTo`; add `landsOn` after them), `:459-465` (the walk), the comments at `:134-136` (`Own`), `:170-177` (`beforeOwn`) and `:448-458` (the close), which must describe the set. Tests: `test/eos.test.ts`, the describe "the lights' own Go and Back whose fire event a drop eats" (from `:1745`), through `armedOnCue3`, `pressUnheard`, `drop`, `reconnect` and `neverPaused`.
- **Must preserve:** both cases of "pause once they have connected again on a cue fired by hand at the console during the drop that ate a $button" (`test/eos.test.ts:1846`: Go then by-hand 2, Back then by-hand 6, both outside the new sets). "never pause once they have connected again after a Go with no live cue to predict it from". Every test in the describes "the lights' own fire whose fire event a drop eats" (`:1584`) and "the lights' own Go and Back whose fire event a drop eats". `test/connections.test.ts` and `test/osc-tcp.test.ts`.
- **Do not touch:** the window-free keep at the close (#268's recorded assumption 1, review 5's dismissal); the clears of `before` and `beforeOwn` in `sendOwn`, the fire branch and the active branch; the `(kept !== null || keptOwn.size > 0)` guard at `:312`, which the test audit showed is pinned.
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-6-repro.sh`. `review 6 f1a`, `f1b` and `f1c` are red now and must be green after. Then move the three tests into the suite, inside that describe, and drop them from the script. `f2a` and `f2b` stay red until finding 2.
- **Escalation:** the reconnect judgement has now been rewritten by #250, #254, review 3 finding 1, #268 and #271. Recommend one split ticket for findings 1 and 2 together, with Nick choosing the trade-off above, and one recording from #140's Augment3d session: a Go on the last cue, a Back on the first, and a Back during a fade followed by a Go.

### 2. A pending Go or Back answers a fire event of any cue, so a follow can use up a Go, and a Go that fires nothing hides a cue fired at the console — LOW
- **Location:** `src/server/eos.ts:291` (the matcher), with `answers` at `:199-207` and the pause at `:293`.
- **Attribution:** introduced by `98a4925` (setlist-controller#138 Lights pause by hand: a cue fired at the console pauses automation): `git log -S"typeof command !== 'object' || command.cue === number" f0eab4b..HEAD` names only it. Pre-PR review 2's Needs Further Investigation A found the same matcher losing a measurement; this finding is the pause half, now executed.
- **Real-world trigger:** the two halves fail in opposite directions.
  - (a) False pause, no drop needed. The live cue has a follow, the producer presses Go, and the follow fires at Eos before the Go arrives, inside the tens of ms before the follow's event reaches the server. The follow's event uses up the Go. The Go's own event then answers nothing, and the lights pause.
  - (b) Missed pause. The producer presses Go on the last cue (or Back on the first), which fires nothing, and within 1 s an operator fires a cue at the console. The stale Go takes that event as its answer, so the lights stay armed, and the next section cue fires over the operator's look.
  - LOW, capped: (a) needs a press inside a window of tens of ms, and (b) needs two people acting within one second, plus Eos sending nothing for a Go past the end, which is not recorded. Upgrade (b) to MEDIUM if #140's Augment3d session shows that a Go on the last cue sends no event. The check is to record one with `scripts/eos/record-eos-fixtures.py`.
**Evidence**
```ts
      const followed = firesNext(live?.number ?? null) === number;
      ...
      // A fire of a cue accounts only for that cue; Go and Back for any, since Eos picks the cue.
      const command = answers((command) => typeof command !== 'object' || command.cue === number);
      if (typeof command === 'object' && command !== null) reporter?.actedOn(command.handed);
      if (!command && !followed) reporter?.changedByHand();
```
**Failure mode** — both proved red by `repro/review-6-repro.sh`:
- (a) Cue 3 has a follow, `own` is [go], and the events arrive in the order 3.5, then 4. Event 3.5 is `followed` and also uses up the Go. For event 4, `own` is empty and `firesNext('3.5')` is undefined, so `changedByHand` runs (`review 6 f2a`).
- (b) Live cue 8, the last. Go is sent and the fake fires nothing. `fireByHand('6')` within the window is used up by the Go, and the lights stay armed (`review 6 f2b`, which expects the pause and times out at 2 s).
**Recommended fix** — after finding 1's `landsOn`, a Go or Back accounts only for a cue it can land on from the live cue, when that is known. It never accounts for an event that the live cue's follow already explains:
```diff
       const number = fired[1]!;
-      const followed = firesNext(live?.number ?? null) === number;
+      const from = live?.number ?? null;
+      const followed = firesNext(from) === number;
       live = { number, label: typeof label === 'string' ? label : '' };
@@
-      const command = answers((command) => typeof command !== 'object' || command.cue === number);
+      const command = answers((command) => {
+        if (typeof command === 'object') return command.cue === number;
+        if (followed) return false;
+        const lands = from === null ? [] : landsOn(command, from);
+        return lands.length === 0 || lands.includes(number);
+      });
```
Audit of the diff:
- A fire by number accounts only for its cue. Kept.
- A Go or Back with no live cue, or from a cue not in the list, still accounts for any event (`lands` is empty). This keeps the behaviour where the live cue is outside the list (`test/eos.test.ts:438`).
- A follow's event still never pauses. Kept, through `followed`.
- The comment line above the matcher has to change with the code.
- Dropped on purpose: a Go that a follow's event coincides with stays pending. If no event it lands on comes within the 1 s window, it is pruned, and a cue fired at the console inside its `landsOn` set within that window is still taken as its answer.
- Review 2 NFI A's ordering case still holds. With `own` = [go, fire N] and the Go landing on N, the first N event uses up the Go and the second uses up the fire.

The fix fails in one case: the fake answers a Go by a link to a cue missing from the show with the next cue (`test/fake-eos.ts:233-236`), while `goesTo` returns the link. That Go's event would then pause. No test covers that case. Real Eos is not recorded.
**Remediation brief**
- **Design intent:** a fire event is the lights' own when it answers one of their pending commands in order (Eos answers over one connection in command order), or when the live cue before it fires it by itself. A Go or Back's answer is the cue Eos picks, which the cue list predicts. It must not take the answer meant for a follow, and must not take a cue fired at the console that it could not have landed on.
- **Full surface:** `src/server/eos.ts:285` (`followed`), `:290-291` (the comment and the matcher), `:195-207` (`answers`, unchanged), and finding 1's `landsOn`. Tests: `test/eos.test.ts`, the Go and Back tests near `:955-990`, and the describe "the lights' own Go and Back whose fire event a drop eats".
- **Must preserve:** Go and Back's own fire events never pause, and Go's answer never reaches `actedOn` (the tests near `test/eos.test.ts:960` and `:1146`). The Back during a fade, answered by a stop of cue 0 (`:296-298`, the test near `:783`). The live cue outside the list (`:438`). Lateness `actedMs` only for a fire by number (`README.md`, the lights' `actedMs` line).
- **Do not touch:** the `STOPPED` branch; `OWN_COMMAND_WINDOW_MS`.
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-6-repro.sh`. `review 6 f2a` and `f2b` are red now and must be green after. Then move both tests into the suite.
- **Escalation:** the same split ticket as finding 1.

### 3. The Playwright Go and Back test's arm assertion cannot go red — LOW
- **Location:** `e2e/eos.spec.ts:44-45`
- **Attribution:** introduced by `0499d70` (setlist-controller#137 Lights manual buttons: Go and Back). Pre-PR review 1 finding 4 flagged the comment; it is unchanged.
- **Real-world trigger:** none today. The adapter tests cover the rule with the lights armed (`test/eos.test.ts:960`, `:1146`). This e2e line claims to check it on the real page and cannot fail.
**Evidence**
```ts
  // Disarmed before the presses, and disarmed after them.
  await expect(row.locator('.connection-arm')).toHaveText('Disarmed');
```
`src/server/connections.ts:249-251` pauses only an armed target, or one a Fade out paused, so a Go that wrongly reported a change by hand would leave a disarmed row "Disarmed".
**Recommended fix** — arm the row before the presses and assert it stays armed:
```diff
   await expect(back).toBeEnabled();
+  await row.getByRole('button', { name: 'Arm', exact: true }).click();
+  await expect(row.locator('.connection-arm')).toHaveText('Armed');
 
   await go.click();
@@
-  // Disarmed before the presses, and disarmed after them.
-  await expect(row.locator('.connection-arm')).toHaveText('Disarmed');
+  await expect(row.locator('.connection-arm')).toHaveText('Armed');
```
Audit: the address assertions are unchanged. Arming fires no cue here, since the test plays nothing (`e2e/producer.spec.ts:38` arms the same way).
**Remediation brief**
- **Design intent:** Go and Back run whatever the arm state, and never pause the lights (target.ts, #137).
- **Full surface:** `e2e/eos.spec.ts:35-46`.
- **Must preserve:** the two `expect.poll` address checks.
- **Do not touch:** `e2e/lights.spec.ts`.
- **Proof:** `pnpm test:e2e -- e2e/eos.spec.ts` green. Then a mutant `reporter?.changedByHand();` added at the top of `runButton` in `src/server/eos.ts` must turn it red (in a scratch worktree).

### 4. Pre-PR review 1's two recording-script defects are still open — LOW
- **Location:** `scripts/eos/eososc.py:4` and `scripts/eos/record-eos-fixtures.py:75-83`
- **Attribution:** introduced by `da3dda1` (setlist-controller#150 Record ETCnomad's Eos over OSC, a cue fired by hand included). Pre-PR review 1 findings 2 and 3, deferred LOW and untouched since.
- **Real-world trigger:** re-recording the fixtures for #140.
  - The padding bug: `pad` adds 4 NULs to a string whose length plus terminator is already a multiple of 4, so `/eos/cue/1/3.5/fire` goes out as 28 bytes where 24 is correct (`test/fixtures/eos/fire-decimal.json`). ETCnomad 3.3.10 tolerated it.
  - The overwrite bug: a fire-by-hand scenario that sees no fire still overwrites `test/fixtures/eos/fire-by-hand.json` with the whole 900 s log.
**Recommended fix** — as pre-PR review 1 findings 2 and 3 give it: `def pad(b): return b + b"\0" * (-len(b) % 4)`, and `if not got: raise SystemExit("no fire seen, fire-by-hand.json left as it was")` before the write.
**Remediation brief**
- **Design intent:** the scripts are hand-run against ETCnomad only, to record what Eos really sends; no test runs them.
- **Full surface:** `scripts/eos/eososc.py:4`, `scripts/eos/record-eos-fixtures.py:75-83`.
- **Must preserve:** the recorded fixtures as they are; they are not re-recorded by this fix.
- **Do not touch:** `test/fixtures/eos/*.json`.
- **Proof:** `python3 -I -B -c "import sys; sys.path.insert(0, 'scripts/eos'); import eososc; assert len(eososc.ostr('abc')) == 4 and len(eososc.ostr('abcd')) == 8"` fails now and passes after.

### 5. Comment hygiene — LOW (aggregated)
- `web/src/styles.css:830` — "The list is capped at about eight lines" → "The list is capped at 15rem, about eleven lines" (no `line-height` is set under `web/`; carried from reviews 2 and 5).
- `web/src/ConnectionsPanel.tsx:19-20` and `:97-98` — the header and `StateList` comments run to 143 and 150 characters → rewrap at 100, as the lines around them are (carried from review 5).
- `test/fake-eos.ts:207-208` — "The base cue that many places from the current cue ... the cue after it is the first." sits where `connectBurst`'s comment continues → move it above `step` (`:225`) (carried from reviews 2 and 5).
- `test/fake-eos.ts:49-50` — "the count's and each index's last packet" → "a line naming the count or the index answered, such as 'count 1' or 'index 3'" (carried from review 5).
- `test/fixtures/eos/README.md:10` — "`t_ms` counts from the start of the scenario" → add "except `fire-by-hand.json`, whose times run on from the session's clock (172734 ms on)" (carried from review 5).
- `test/fixtures/eos/README.md:52` — "Every fire, from the app or by hand, gives ... then the previous, active and pending cue." → "Every fire from the app gives ... then the previous, active and pending cue; the recorded fire by hand (`fire-by-hand.json`) ends at its fire event and softkeys." (carried from review 5).
- `test/osc-tcp.test.ts:9-10` — "Two packets recorded from Eos ...: the count reply and the label of cue 3.5." → "The count reply, recorded from Eos (test/fixtures/eos/read-cue-list.json), and a fire of cue 3.5 as the lights send it." (carried from review 1).

## Needs Further Investigation
### A. A link to a cue in another list is kept as a raw string and read as a cue number of this list — confirm by recording a cue linked to another list on Augment3d
`src/server/eos.ts:113` returns `{ link }` for a string link, and `firesNext` (`:341`) returns that string as a cue of this list. The duplicate-label check (`:550`) then exempts it, and a cue of that number fired by hand counts as a follow. The comment at `:109` says such a string "names no cue of this list", but the README records no string link. Confirm: record a cue with a follow and a link to `2/5` and read argument 19. Kill: Eos sends the link as a number of the other list's cue in a form that the code ignores. Also unrecorded: `goesTo` predicts this list's next cue for a Go from such a cue.

### B. `e2e/lights.spec.ts:93-101` may race the list's own scroll effect — confirm by running the spec 50 times under load
The test waits for the live cue's text and then scrolls the box by hand to its end. `StateList`'s effect, which scrolls the box to cue 150, could land after that and leave cue 300 out of view. It passed in this run. Confirm with `pnpm exec playwright test e2e/lights.spec.ts --repeat-each 50` while `pnpm test` runs. Kill: 50 clean runs. If it is confirmed, wait for `list.locator('[aria-current]')` to read "Cue 150: Song 15 / Look 10" before scrolling by hand.

## Reviewed and Dismissed
- A section cue fired between the reconnect's first packet and its active cue ends the judgement (finder A F10) — the recorded approach (review 3's remediation, `sendOwn` clears `before`), which review 4 finding 1 asked to pin.
- The fake answers a Go or Back at once while fires are held, out of command order (finder A F8) — no test presses Go or Back under `holdFires`. This is a hazard for a future test only, and review 2 has a Minor for the fake's Go and Back.
- Unanswered fires kept at the close however old — #268's recorded assumption 1 (review 5's dismissal).
- `stop()` leaves `before` and `beforeOwn` set — a stopped target is never restarted (`src/server/server.ts:252`; review 5).
- The 4 skipped tests of `pnpm test` — the same 4 as reviews 4 and 5.
- No recording of `/eos/out/ping` — review 2's dismissal (ETC's support article).
- `osc-tcp.ts` has no maximum packet length (finder A) — a SLIP stream frames nothing until the 3 s connect timeout, and a bad length after online is dropped by the ping count within 4 s. Both are bounded.
- `typeof current === 'number' && Number.isInteger(current)` at `src/server/connections.ts:285` (finder B F8) — redundant, harmless.
- The README and `docs/install.md` do not describe the lights' row or the `eos` section — #140, open and Nick's.
- `test/pages.test.ts:708` and `:1410` pass at the base — see Test quality; #256's proof, kept.

## Minor / nits
- A Go or Back pressed in the ~100 ms before the first cue list read finishes predicts nothing, so a drop that eats its answer then pauses (finder A F5). That window opens once per server start.
- The fake's Go by a link to a cue missing from the show falls back to the next cue, while `goesTo` returns the link (finder A F9). Real Eos is not recorded.
- `scripts/eos/eososc.py:9-12, 21-28` drops an argument of an unknown type when encoding, and decodes every later argument from the wrong offset after an unknown tag (finder B F3). Recording only, and the current fixtures parse.
- `e2e/lights.spec.ts:34-37` writes its config by hand where `e2e/eos.spec.ts` uses `connectionsConfigs()` from the fake (finder B F9). Both styles exist in the repo.
- Every producer message now carries the whole cue list, about 10 KB for a 300-cue show, and the hub sends it on every change of playback state (`src/server/server.ts:104-110`, `hub.ts:75-83`) (finder B F10). That is small on the stage network.

## Test quality
- **Tests added:** `test/eos.test.ts` 96 and `test/osc-tcp.test.ts`, both red at base by import; 9 tests added to the three modified suites.
- **Green against `$BASE`:** 2, `test/pages.test.ts:708` and `:1410`. Both came with #256 (`74a0008`, from #252's review F2.10), so they are a review finding's proof and stay. They are green at base because #84 shipped the generic Problems / Cannot match rendering on `main`. To make them the lights' own, render a real Eos check line ("cue N never fires, cue M has the same label") rather than a hand-built object. Stronger assertion only; do not delete.
- **Tautology shapes found:** 0. There are no mocks, no snapshots and no assertion-free tests. Every `.every(...)` over received snapshots is paired with a `latest()` assertion, and the console spies sit beside a row assertion.
- **Weak spots:**
  - "never pauses once they have connected again on the live cue, after a Back that only stopped its fade" (`test/eos.test.ts:1832`) stays green with Back prediction removed, because `before` already covers cue 3. Finding 1's `f1a` is the test that pins a fade-stopping Back.
  - `e2e/lights.spec.ts:70`'s `toHaveCount(9)` counts lines only.
  - `e2e/eos.spec.ts:45` is finding 3.
- **Mutation:** 5 of the 6 mutants of #271's walk go red. m3 survives, and finding 1's `f1c` pins it.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and the build are green at `2c9853c`, and the Playwright suite passes locally.
- **Commit hygiene:** commit this doc and `repro/review-6-repro.sh`. The two commits with #271's subject are the lane commit and its merge, so leave them.
- **Likely reviewer asks:** the Augment3d acceptance run and the install doc (#140); why a Go's cue is predicted rather than read back from Eos; the trade-off of findings 1 and 2.

## Verdict
**Ready to open a PR, with follow-ups.** The review found 0 CRITICAL, 0 HIGH, 0 MEDIUM and 5 LOW, so nothing in it gates the PR.
- Findings 1 and 2 should become one split ticket. Nick chooses the trade-off there, and #140's Augment3d session records a Go on the last cue, a Back on the first, and a Back during a fade then a Go. This is not a stage-2 fix, since it would be the sixth rewrite of the reconnect judgement.
- Findings 3 to 5 can land through `/pr-review-remediate` or as follow-ups.
- The PR still waits on #140, which is Nick's.
