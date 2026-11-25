# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `98f15c4` "Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing")
**Reviewed at:** HEAD `0fc295a` (setlist-controller#287 Lights: the producer's Go pauses the lights by hand after a cue is added or deleted at the console, until Refresh), clean tree: 0 files with uncommitted changes, 0 untracked; 72 files total, +15483 / -68 against the merge-base (8 of them earlier review docs and 9 repro scripts).
**Delta under review:** none. `--fresh`: the whole branch, stage 2 round 1 of the seventh `/epic-loop` run, after #288 (`63ef489`) and #287 (`0fc295a`) landed. Pre-PR review 8 reviewed `74bd746`.
**Reviewed against:** the epic body of setlist-controller#108; the bodies of #286, #287 and #288; pre-PR review 8's findings and Approach decisions; the recordings and `test/fixtures/eos/README.md`. The repo has no `CLAUDE.md` and no coding standards file, so the five shared review rules stand in for them.
**Date:** 2026-11-06
**Reviewer:** 3 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 74 files, 1971 passed, 4 skipped (the same 4 as reviews 4 to 8) |
| Build and Playwright | `pnpm test:e2e` (builds first) | built; 66 passed |
| Eos suites under load | finder: 3 concurrent runs of `test/eos.test.ts`, `test/fake-eos.test.ts`, `test/osc-tcp.test.ts` | 171 of 171 each run |
| Finding 1 | `sh docs/reviews/setlist-controller-108/repro/review-9-repro.sh` | f1a, f1b red on `neverPaused`; control green |
| Finding 2 | the same script | f2 red on `neverPaused` (`test/eos.test.ts:1860`) |
| Attribution | the same script with `eos.ts` from `63ef489` (before #287) | all four red, the control included: the press orders were already broken before #287, which left them open |
| Recommended fixes | both diffs below applied in a scratch worktree; `vitest run test/eos.test.ts test/fake-eos.test.ts`, `tsc --noEmit`, `eslint src/server/eos.ts`, and the repro with the fixed `eos.ts` | finding 1's fix: 166 passed, repro f1a, f1b and control green, f2 still red; with finding 2's fix on top: 166 passed, all four repro tests green; typecheck and lint clean |
| Eos's active cue after a cue edit | read `cue-edit-at-console.json`, `cue-edit-at-console-subscribed.json`, `cue-edit-at-keypad-subscribed.json` | each Record makes the recorded cue Eos's active cue with no fire event; each delete of the active cue moves it to the cue before; a move of it follows the number |
| Tests #288 and #287 add, red before them | audit agent: HEAD's tests, fake and fixtures run on `9dd561d`'s code | 21 of 23 red; the 2 green are a control row (`test/eos.test.ts:2164`) and a negative test (`:629`) |
| Mutation of the re-judge | audit agent: re-judge reverted; re-judge always pauses after the read; notify pattern widened; `a335961` reverted | each turns its tests red (7, 7, 1, 2); the "always pauses after the read" mutant proves the negative assertions wait long enough |
| Fake mutants | audit agent: 8 mutants of `test/fake-eos.ts` | each new fake test red under at least one |
| Recording scripts | finder: `pnpm exec vitest run test/eos-recording-scripts.test.ts`; read the four scripts | 181 passed with the other glue suites; hand-run defects in Minor |
| Real Eos for a cue recorded mid-list | not run: no ETCnomad here | Needs Further Investigation A |

**Overall:** the full checks are green, #288 is sound, and #287's notify re-read, subscribe, and its tightening of findings 2 and 3 from review 8 hold. Two MEDIUMs stand against #287's acceptance criterion "a cue recorded, renumbered or deleted at the console while connected doesn't make the producer's next Go or Back pause". The re-judge's Go can be taken by a later answer before the fresh read ends (finding 1), and a cue recorded at the console moves Eos onto it with no fire event, which the fake does not model, so the producer's next Go still pauses (finding 2). Both have a small fix, each audited by execution. Fix both before the PR opens.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254, review 3 finding 1, #268, #271, #273): the cue Eos is on at connect is judged once against `before`, `beforeOwn` and the `firedAfter` chain of each. Wrap, Go From Last and Back From First expect every outcome, since #286 proved Wrap unreadable over OSC.
- Own-command accounting (#137, #138, #273, #287): a fire event uses up the first pending own command that accounts for it, with every command before it. A Go or Back accounts for a cue it fires from the live cue by the cue list as last read, the cue the live cue's follow fires included (#287, review 6's f2a order now pauses by decision, `.epic-loop/tickets/287/assumptions.md`), and for any cue when the live cue cannot be placed. A fire by number of the cue takes the event from an earlier Go or Back that reaches it only past an end of the list (#287).
- Cue edits (#287): `/eos/subscribe 1` on every connect; any `/eos/out/notify/cue/<list>/...` re-reads the whole list, never one cue patched. An unexplained fire event while a Go or Back is pending is judged again after a fresh read. This review changes how: the re-judge takes the first pending Go or Back at the event, as `answers` takes a command (finding 1), and also accepts a cue it fires from any cue Eos named as active since the last fire event (finding 2). In-place fixes, not a split ticket: both stay inside the re-judge and the fake's `editShow`.
- Cue 0 (#288): kept as the internal live cue so a Go from it lands on the first cue; only `showLines` hides it.
- Shadowed cues (#252, #258): the check never calls a cue that fires "never fires". The exemption is every cue that a follow or hang of any cue reaches, with the false negative #258 accepted.
- File check shape (#256 and the #84 merge): a name-matching target answers `FileCheck { unmatched, problems }`; problems render first, under "Problems:", and names under "Cannot match:".
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter. Row behaviour that needs effects to run is tested in Playwright (`e2e/lights.spec.ts`).

## Confirmed Issues
### 1. A Go that the re-judge is holding for an edited cue can be used up by a later answer, so the producer's Go still pauses the lights — MEDIUM
- **Location:** `src/server/eos.ts:375-387` (the re-judge in the fire branch of `receive`), with `answers` at `:223-231` and `useUp` at `:233-236`
- **Attribution:** pre-existing, left open. The press order was already broken before #287 (review 7 finding 1, introduced by #273, `08d1272`): the repro is red with `eos.ts` from `63ef489`. #287's re-judge (`124f1f7`, `a335961`) was built to close it, and does not in this order: the sweep in `answers` that marks "every command before it" used was harmless before the re-judge existed, and now takes the Go the re-judge is waiting for.
- **Real-world trigger:** a cue is recorded or renumbered at the console. In the second before Eos's notify comes, the producer presses Go. Then, before the fresh read of the list ends, another of the lights' own commands gets its answer: a Back to stop the fade, Fire again, or a section start's cue. The read takes about 100 ms for nine cues and longer for the 34-cue "Church baseline", and longer still when the notify's own read is in flight, since the re-judge then waits for a second read. The lights pause by hand on the producer's own Go. MEDIUM: visible and recoverable, fires no wrong look, but breaks #287's acceptance criterion and a clean rehearsal under the trust gate.
**Evidence**
```ts
      const pending = [...own];
      ...
      void readCues(true).then((full) => {
        if (!full) return reporter?.changedByHand();
        const at = pending.findIndex(({ command, used }) => typeof command !== 'object' && !used && (!placed(from) || !placed(number) || firesFrom(command, from).includes(number)));
        if (at < 0) return reporter?.changedByHand();
```
The Go stays in `own` during the read. A later event's `answers` either picks the Go itself (the live cue is now the edited cue, which the stale list cannot place, so `!placed(from)` lets the Go account for any cue) or sweeps it with "every command before it", and `useUp` marks it `used`.
**Failure mode** — list as read 1, 2, 3, 3.5, 4 ... 8, live cue 3. Cue 3.7 is added at the console, notify held. Go fires 3.7: unexplained, re-judge starts, reads held. Back fires 3: the live cue 3.7 cannot be placed, so the Go accounts for 3 and is used up. The read ends with 3.7 in it, the re-judge finds no unused Go, and `changedByHand()` runs. With Fire again in place of the Back the same: the Go takes the fire's event, and the fire is left pending. Proved: `review 9 f1a` and `review 9 f1b` fail on `neverPaused` ("expected false to be true"); `review 9 control`, the same Go with nothing after it, passes.
**Recommended fix** — take the first pending Go or Back at the event, and every command before it, as `answers` takes a command, so no later event can claim it, then judge only that one after the fresh read:
```diff
-      const pending = [...own];
-      if (!pending.some(({ command }) => typeof command !== 'object')) {
+      const at = own.findIndex(({ command }) => typeof command !== 'object');
+      if (at < 0) {
         reporter?.changedByHand();
         return;
       }
-      // A Go or a Back is pending, and the list may have changed since it was read: judge again
-      // once a fresh read ends.
+      const taken = own[at]!.command as 'go' | 'back';
+      useUp(own.slice(0, at + 1));
       void readCues(true).then((full) => {
-        if (!full) return reporter?.changedByHand();
-        const at = pending.findIndex(({ command, used }) => typeof command !== 'object' && !used && (!placed(from) || !placed(number) || firesFrom(command, from).includes(number)));
-        if (at < 0) return reporter?.changedByHand();
-        useUp(pending.slice(0, at + 1));
+        if (full && (!placed(from) || !placed(number) || firesFrom(taken, from).includes(number))) return;
+        reporter?.changedByHand();
       });
       return;
```
The `used` flag is then read nowhere: drop it from `own`'s type (`:200`) and make `useUp` a plain `own = own.slice(at + 1)` at its two callers, or keep `useUp` as it is; both are equivalent.
**Remediation brief**
- **Design intent:** Eos answers the lights' commands over one connection in order, so a fire event that answers none of them while a Go or Back is pending is most likely that Go or Back's answer from a list edited at the console since the last read. The re-judge exists to confirm that against a fresh read before calling it a change by hand. The command it is judging must be out of reach of every later event from the moment it is held, as `answers` takes a command at once.
- **Full surface:** `src/server/eos.ts:375-387` (the change); `:193-200` (the `own` comment and its `used?` field: the sentence "Each is marked used once an event answers it or a command after it, so a fire event judged again after a fresh read takes only a command no later event used up, even one the window has since forgotten" becomes "A fire event judged again after a fresh read takes its Go or Back at once, so no later event can"); `:325-330` (the `receive` comment: "the Go or Back still pending answers it" becomes "the first Go or Back pending at the event, taken at once, answers it"); `:233-236` (`useUp`, optional simplification). Tests: add `review 9 f1a`, `f1b` and `control` from the repro to `test/eos.test.ts` under descriptive names, in describe "the fire event that answers the lights' own Go and Back".
- **Must preserve:** every test in `test/eos.test.ts` (154) and `test/fake-eos.test.ts`, in particular the seven re-judge tests (`:2165` added-cue case, the three `:2197` cases, `:2210`, the two `:2229` cases) and `:2245`/`:2258` (the follow use-up). A fire event judged again still pauses when the read is cut short (close, stop or the 10 s limit), and when the fresh list does not predict the cue. With no Go or Back pending, a console fire pauses at once. Dropped on purpose: the old scan could accept with a later pending Go or Back when the first did not account for the cue; since Eos answers in order, the event answers the first, and the case left (a Go on the last cue that fires nothing, then a Back answered by an edited cue, all within one read) is not worth a scan.
- **Failure of the fix itself:** when the held event was really a console fire and the Go's own answer comes during the read, that answer finds no Go pending and pauses at once, and the re-judge pauses again after the read. The pause is correct, and a second `changedByHand()` on a paused target changes nothing.
- **Do not touch:** the follow use-up and the `rather` rule in `answers` (`:366-372`); Reviewed and Dismissed bullets 1 and 2.
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-9-repro.sh`: f1a and f1b red now, green after; the control green throughout. f2 stays red until finding 2 is fixed. Pass a fixed `eos.ts` as the script's argument to check a fix before committing it.

### 2. A cue recorded at the console becomes Eos's active cue with no fire event, so the producer's next Go fires a cue the lights do not predict and pauses them — MEDIUM
- **Location:** `src/server/eos.ts:402-404` (the active cue is ignored once there is a live cue) and the re-judge at `:382-387`; the fake at `test/fake-eos.ts:414-416` (`editShow`, documented at `:70-74`); the test show at `test/eos.test.ts:2176` (`ADDED_3_7`)
- **Attribution:** pre-existing, left open: review 7 finding 1 (introduced by #273, `08d1272`), red before #287 (repro with `eos.ts` from `63ef489`). #287 (`124f1f7`) claims the "recorded" case fixed, and its tests pass only because the fake's `editShow` keeps the current cue on a record, where Eos moves onto the recorded cue, and `ADDED_3_7` puts 3.7 before 3.5, so the fake's Go from 3 fires 3.7, which an Eos with its cues in number order never does.
- **Real-world trigger:** the lighting designer records a cue at the console during a rehearsal or while building cues on Augment3d with the server connected (epic user story 23), the most common edit there is. Eos makes the recorded cue active. The producer's next Go fires the cue after the recorded one, the lights pause by hand, and the row also keeps naming the old live cue until that Go. MEDIUM: visible and recoverable, but this is #287's headline criterion, and Refresh does not help, since the list is already fresh.
**Evidence**
```ts
    const active = ACTIVE.exec(message.address);
    if (active) {
      if (live !== null) return;
```
`cue-edit-at-console-subscribed.json`: `Record Cue 1 / 11#` from 1/8 gives `/eos/out/previous/cue/1/8`, then `/eos/out/active/cue/1/11 [1.0]` at 2073 ms, and no fire event; `cue-edit-at-keypad-subscribed.json`: `/eos/out/active/cue/1/900 [1.0]` at 281010 ms after Record Cue 1/900 from 1/34; `cue-edit-at-console.json` the same for 1/9. A delete of the active cue moves it to the cue before (1/12 deleted gives active 1/8), a move follows the number (11 to 12 gives active 1/12).
**Failure mode** — live cue 3, list 1, 2, 3, 3.5, 4 ... 8. Cue 3.7 is recorded (list order 3, 3.5, 3.7, 4) and notified, and the lights read the fresh list. Eos's active cue is 3.7. The producer's Go fires 4. `firesFrom('go', '3')` is `['3.5']` on the fresh list too, both 3 and 4 are placed, so the re-judge calls `changedByHand()`. Proved: `review 9 f2` (the test sends Eos's active cue 3.7 and its fire event of 4, since the fake cannot) fails on `neverPaused` at HEAD and under finding 1's fix.
**Recommended fix** — keep every cue Eos names as active since the last fire event, and let the re-judge accept a cue its Go or Back fires from any of them by the fresh list. On top of finding 1's diff:
```diff
   let beforeOwn = new Set<string>();
+  let named = new Set<string>();
@@ fire branch
       const followed = firesNext(from) === number;
+      const activeBefore = [...named].filter((cue) => cue !== number);
+      named = new Set();
@@ re-judge
-        if (full && (!placed(from) || !placed(number) || firesFrom(taken, from).includes(number))) return;
+        if (full && (!placed(from) || !placed(number) || firesFrom(taken, from).includes(number) || activeBefore.some((cue) => placed(cue) && firesFrom(taken, cue).includes(number)))) return;
@@ active branch
     if (active) {
+      named.add(active[1]!);
       if (live !== null) return;
@@ close handler
       live = null;
+      named = new Set();
       own = [];
```
Then make the fake honest: `editShow` puts the cue list in number order as Eos does, and moves its current cue as the recordings show, sending `/eos/out/previous/cue/1/<n>` and `/eos/out/active/cue/1/<n> [1.0]` at once: onto a cue the edit records, onto the cue before a deleted current cue (in place of none), and onto the new number of a moved current cue. Rewrite `ADDED_3_7` in number order (after 3.5), so the "recorded" EDITS cases expect the Go to fire 4, and replace the fake-eos test "has no current cue once an edit deletes it" (`test/fake-eos.test.ts:238`) with the recorded outcome.
**Remediation brief**
- **Design intent:** the lights place a Go or Back from the live cue, which only a fire event moves once there is one, because Eos also sends a cue's active cue before its fire event and during fades (`fire-follow-chain.json`), and taking that as the live cue would judge a follow against itself. An edit at the console moves Eos's active cue with no fire event, so the re-judge, which runs only for an unexplained fire event while a Go or Back is pending, also places the press from each cue Eos named active since the last fire event. The set is cleared on each fire event and on a close, so it never reaches across one. The live cue and its rules stay as they are.
- **Full surface:** `src/server/eos.ts:190` (declare `named` beside `beforeOwn`, with a comment saying what it holds and when it clears), `:355` (capture and clear in the fire branch), `:384` (the re-judge condition, after finding 1's change), `:403` (add before the `live !== null` return), `:612` (clear on close); the `receive` comment at `:325-330` (add "or from a cue Eos named as active since the last fire event, as a cue recorded at the console becomes"). `test/fake-eos.ts:70-74` (the `editShow` doc) and `:414-425` (its body); `test/fake-eos.test.ts:220-249` (the `editShow` tests, `:238` replaced); `test/eos.test.ts:2176` (`ADDED_3_7`), `:2179-2183` (EDITS' `fires` for the recorded case), and the `MOVED_3` comment and `emit` workaround at `:2222-2238`, which a fake that keeps a moved current cue makes unnecessary. Add `review 9 f2` from the repro under a descriptive name, plus its control: the same Record, then a cue fired at the console with a Go pending, which pauses.
- **Must preserve:** the active cue as the live cue only while there is none (`:404`), so a reconnect is judged as now; every reconnect test in describe "the lights' own Go and Back whose fire event a drop eats" and the `before`/`beforeOwn` judgement; "never pauses on a follow whose active cue Eos sends before its fire event" (`test/eos.test.ts:1631`); a console fire with a Go pending that no cue in `activeBefore` predicts still pauses after the read; `e2e/eos.spec.ts` and `e2e/lights.spec.ts`, which filter what the fake receives and are untouched by its sending more on an edit.
- **Do not touch:** `landsOn`, `firedAfter` and the close-time walk; the cross-list link handling (Reviewed and Dismissed bullet 3).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-9-repro.sh`: f2 red now and under finding 1's fix alone, green with both; then the rewritten "recorded" EDITS cases (`test/eos.test.ts:2185`, `:2197`) red against HEAD's `eos.ts` once the fake is fixed, and green after.
- **Escalation:** this is the eighth change to the own-command accounting. If the fix needs more than the set above and the fake's `editShow`, such as taking the active cue as the live cue, stop and split a ticket under #108 instead.

### 3. The Playwright Go and Back test's arm assertion cannot go red (carried from pre-PR reviews 6, 7 and 8) — LOW
- **Location:** `e2e/eos.spec.ts:44-45`
- **Attribution:** introduced by `0499d70` (setlist-controller#137 Lights manual buttons: Go and Back); unchanged since review 6; review 8 finding 4, deferred to Nick.
- **Real-world trigger:** none; the adapter tests cover the rule with the lights armed. This line claims to check it on the real page and cannot fail, since `src/server/connections.ts` pauses only an armed target.
**Evidence**
```ts
  // Disarmed before the presses, and disarmed after them.
  await expect(row.locator('.connection-arm')).toHaveText('Disarmed');
```
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
Arming fires no cue here, since the test plays nothing (`e2e/producer.spec.ts:38` arms the same way).
**Remediation brief**
- **Design intent:** Go and Back run whatever the arm state, and never pause the lights (target.ts, #137).
- **Full surface:** `e2e/eos.spec.ts:35-46`.
- **Must preserve:** the two `expect.poll` address checks.
- **Do not touch:** `e2e/lights.spec.ts`.
- **Proof:** `pnpm test:e2e -- e2e/eos.spec.ts` green; then, in a scratch worktree, `reporter?.changedByHand();` added at the top of `runButton` in `src/server/eos.ts` turns it red.

### 4. Comment hygiene — LOW (aggregated)
Carried from pre-PR review 8 finding 5 at their current lines, plus this round's.
- `src/server/eos.ts:669-670` — "the fire or stop event that answers one is the lights' own" → "the fire, stop or resume event that answers one is the lights' own".
- `src/server/eos.ts:322-324` — "so a Go that fires nothing never hides a cue fired at the console" → "so a Go that fires nothing hides no cue fired at the console but one that Wrap, Go From Last or Back From First could fire".
- `src/server/eos.ts:218-222` — "The one of the lights' own commands sent within the window that an event answers" → "The first of the lights' own commands still in own, which receive has pruned to the window, that accounts for the event".
- `src/server/eos.ts:21`, `:186`, `:329`, `:343`, `:539` — lines of 167, 111, 158, about 110 and 123 characters in 100-column blocks, left by #273's and #287's edits → rewrap.
- `test/eos.test.ts:129-130` — lines of 121 and 135 characters in the `lightsRig` comment → rewrap.
- `web/src/ConnectionsPanel.tsx:19-20` and `:98-99` — lines of 143 and 150 characters → rewrap at 100.
- `test/fake-eos.ts:31-33` — "each subscribed connection then gets the notify pair Eos sends about 1 s after an edit" → "each subscribed connection then gets, at once, the notify pair Eos sends about 1 s after an edit, which the test can hold back to model the delay".
- `test/start-up.test.ts:35` — "The fake kind's section good, and the lights' with no host and cue list 0." → "A section for \"fake\", a kind this server does not know, and the lights' with no host and cue list 0." (`src/server/start-up.ts` registers no fake kind; `test/eos.test.ts:79` is the test that proves only the lights are disabled).
- `test/eos.test.ts:1631` — "never pauses on a follow whose active cue Eos sends before its fire event, as recorded" → drop "as recorded": `fire-follow-chain.json` shows the active cue first only for the app's fire of 99/1.
- `test/fixtures/eos/README.md:98` — "The active cue can come before its fire event: ..." → "On the app's fire of 99/1 the active cue came before its fire event (64 ms, then 77 ms); on each cue Eos fired by itself the fire event came first (99/2 at 1014 ms, its active cue at 1022 ms)."
- `test/fixtures/eos/README.md:69` — "Every fire, from the app or by hand, gives ... then the previous, active and pending cue." → "Every fire from the app gives ... then the previous, active and pending cue (the active cue can come first; see Follows and links); the recorded fire by hand (`fire-by-hand.json`) ends at its fire event and softkeys."
- `test/fixtures/eos/README.md:37` — "the build's `Record Cue 1 / 7 Part 2` gave no error" → "a `Record Cue 1 / 7 Part 2` sent by hand gave no error" (`scripts/eos/build-eos-test-show.py` holds no such command).
- `test/fake-eos.ts:89` (the `follow` doc) — "gets its fire event alone" → "gets only its fire event; Eos also sends the previous, active and pending cue and the command line after it (fire-follow-chain.json), which the fake leaves out".
- `test/fake-eos.ts:59` — "the count's and each index's last packet" → "a line naming the count or the index answered, such as 'count 1' or 'index 3'".
- `web/src/styles.css:830` — "The list is capped at about eight lines" → "The list is capped at 15rem, about eleven lines".
- `test/osc-tcp.test.ts:9-10` — "Two packets recorded from Eos ...: the count reply and the label of cue 3.5." → "The count reply, recorded from Eos (test/fixtures/eos/read-cue-list.json), and a fire of cue 3.5 as the lights send it."

## Needs Further Investigation
### A. A cue recorded in the middle of the list also becomes Eos's active cue — confirm by recording a cue between two others at #140's Augment3d session
All three recordings record past the last cue (1/9 and 1/11 after 1/8, 1/900 after 1/34). Finding 2's fix does not depend on the answer, since it accepts any cue named active, but the fake's `editShow` should follow what Eos does there. Record with the one-off driver shape of `.epic-loop/tickets/287/record-keypad.py`: from 1/3, `Record Cue 1 / 3.7#`, and read the active cue.

### B. `e2e/lights.spec.ts:93-101` may race the list's own scroll effect — confirm by running the spec 50 times under load
Carried from reviews 6 to 8. Confirm with `pnpm exec playwright test e2e/lights.spec.ts --repeat-each 50` while `pnpm test` runs; kill with 50 clean runs.

## Reviewed and Dismissed
- With Wrap on, a Go on the last cue and a fire by number of cue 1 within about 40 ms give two fire events of 1, and the second pauses (finder) — the same events as `test/eos.test.ts:2281`, #287's acceptance test that a cue 1 fired at the console just after such a Go and Fire again still pauses. No rule tells them apart, Wrap cannot be read over OSC, and #287 chose the console fire.
- A followed fire event uses up a Go sent while the follow ran, so the Go's own fire after it pauses (review 6's f2a order) — decided in `.epic-loop/tickets/287/assumptions.md`: the race lasts one network trip, and f2 sends the same events. Do not restore `if (followed) return false`.
- A cue linked to a cue in another list (`"99/1"`, `link-to-another-list.json`), a fire by number racing the live cue's follow onto the same cue (two fire events, `fire-racing-follow.json`), and the check not run again after a notify — out of #287's scope, each a proposal in `.epic-loop/tickets/287/proposals.md`.
- The re-judge's pause comes one read later (finder) — by decision (assumptions.md): about 100 ms on the recorded list, and only while a Go or Back is pending.
- A re-judge cut short by a close pauses the lights while offline (finder) — documented intent: a close cuts the read short, and the reconnect judgement has nothing to keep for a Go from a live cue the stale list cannot place.
- The re-judge's negative assertions are checked before the async pause can land (finder) — killed by mutation: a re-judge that always pauses after the read turns all seven red, since `shows()` waits for the read and `finish` reports the list before it resolves the re-judge.
- `docs/install.md:98`, a fire event after the 1 s window is taken as by hand (finder) — the window is the design (`OWN_COMMAND_WINDOW_MS`, approach decisions), and the doc's claim about `null` lateness holds.
- `osc-tcp.ts` has no cap on a garbage length prefix — bounded by the 3 s connect timeout before online and the unanswered pings after, as in review 8.
- `config/stem-map.json` (`a058b27`), `ConnectionsPanel.tsx`'s re-scroll on a list length change (documented intent, covered by `e2e/lights.spec.ts:105-130`), the Target contract across `atem.ts`, `propresenter.ts` and `fake-target.ts`, and everything pre-PR review 8 dismissed, unchanged.

## Minor / nits
- `src/server/eos.ts:383` — a re-judge cut short by `stop()` calls `changedByHand()` during shutdown; `if (stopped) return;` at the top of the callback would keep a report out of a stopped server.
- `scripts/eos/record-eos-fixtures.py:115,120,145-156` and `scripts/eos/build-eos-test-show.py:23-30` — only `--before-wrap` and `--wrap` check the command line reads LIVE; the default and `--edge-cases` modes and the build script do not, so a run left in Patch or Blind sends cue commands there. The save-and-reopen procedure in the README bounds the harm.
- `scripts/eos/record-eos-fixtures.py:193-212` — the `--before-wrap` clean-up runs only on a clean run; a rejected command leaves cue 1/10 or list 99 behind.
- `scripts/eos/build-eos-test-show.py:22-31` — a failed build prints its errors and exits 0.
- `scripts/eos/eososc.py:7-13,21-28` — `msg` drops an argument of an unsupported type; `parse` does not advance past an unknown tag.
- `scripts/eos/record-eos-fixtures.py:68-71` — fixtures are written in place, not atomically.
- `scripts/eos/build-eos-test-show.py` and `scripts/eos/record-follow.py` have no tests (hand-run Phase 0 tools).
- `test/eos.test.ts:577` — the subscribe is checked by value, not by type `i`; a float 1.0 would pass.
- `test/fake-eos.ts:418` — a decimal cue in a notify goes out as a float, which no recording shows; harmless while the adapter ignores the argument.
- `test/fake-eos.ts:311` — a repeated `/eos/subscribe 1` resets the fake's sequence, which is not recorded and not reachable today.
- `test/pages.test.ts:1407` — `not.toContain('check-problems')` cannot fail unless `:1405`'s `not.toContain('check-problem')` does (#256, `74a0008`).
- Every Minor item of pre-PR review 8 stands as written there.

## Test quality
Tests added by the branch: all of `test/eos.test.ts`, `test/fake-eos.test.ts`, `test/osc-tcp.test.ts` and `test/eos-recording-scripts.test.ts`, and new cases in `test/connections.test.ts`, `test/pages.test.ts` and `test/start-up.test.ts`. Against `$BASE` every Eos test is red (the module does not exist there), and every new non-Eos test is red except `test/pages.test.ts:708` and `:1410`, which are red at `74a0008^` and green at `$BASE` only because main already renders problems on a check: redundant, not tautological. Against `9dd561d`, 21 of the 23 tests #288 and #287 add or change are red. Strengthen:
- `test/eos.test.ts:609` ("reads the cue list again once a read in flight when the notify comes ends") — its row assertion passes with no notify handling at all, since `releaseReads` answers the held read from the already edited show; only the read count discriminates. Answer the held count from the old show and edit while the index reads are in flight, so only the second read gives the edited row.
- `test/eos.test.ts:629` ("never reads the cue list again for a cue list notify, nor for a cue notify of another cue list") — a negative after a fixed 200 ms sleep. End it with a matching cue notify and wait for exactly one more read, so TCP order proves the two foreign notifies were handled and ignored.
- `test/eos.test.ts:2164` — the control row of its `it.each`, green before #287 by design; fine as a control.
- `test/eos.test.ts:2165-2176` and the other re-judge tests call `neverPaused` once the row shows the fire event, before the fresh read ends; the always-pause mutant is caught 3 of 3, so the margin holds on loopback. Waiting for the read's last index in `fake.answered` first would make it independent of speed.
- The "recorded" EDITS cases (`:2185`, `:2197`) pass only through the fake's `editShow` and `ADDED_3_7`'s order; finding 2 rewrites them.

## Prior-review closure
Pre-PR review 8 (`ae800c2`, reviewed at `74bd746`) had 1 MEDIUM and 4 LOW. Finding 1 (MEDIUM) went to #287 by decision and is partially fixed: a cue deleted or renumbered at the console, and a cue added in the press orders #287 tests, no longer pause the producer's Go; a cue recorded at the console (finding 2 here) and a later answer during the re-judge's read (finding 1 here) still do. Findings 2 and 3 (LOW) are fully fixed by #287 (`test/eos.test.ts:2258` and `:2281`, `:2411`, red at `9dd561d`). Finding 4 (LOW) is untouched, deferred to Nick, and re-emitted as finding 3. Finding 5 (LOW) is untouched and carried into finding 4. None was "resolved" by editing a comment or doc.

## Before opening the PR
- **CI readiness:** the repo has no CI; lint, typecheck, `pnpm test` (1971), the build and Playwright (66) are green at `0fc295a`.
- **Commit hygiene:** this doc and `repro/review-9-repro.sh` are the only additions; nothing to drop.
- **Likely reviewer asks:** why a cue edited at the console needs the notify and a re-judge; #273's and #287's trade-offs (review 6's f2a order now pauses, the Wrap case above); the stem map change that rides on this branch; #140's install doc and acceptance run.

## Verdict
**Not ready.** 0 CRITICAL, 0 HIGH, 2 MEDIUM, 2 LOW. The gate is findings 1 and 2, both against #287's headline criterion, both with a small fix audited by execution here (166 Eos tests green, all four repro tests green, typecheck and lint clean), through `/pr-review-remediate`. Fix finding 1 first: finding 2's diff builds on it. Findings 3 and 4 can land with them or as follow-ups. The PR still waits on #140, which is Nick's.

## Remediation — 2026-11-06
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `a550e38` pre-PR review 9 finding 1: a Go the re-judge holds for an edited cue can be used up by a later answer | red→green: `sh docs/reviews/setlist-controller-108/repro/review-9-repro.sh <fixed eos.ts>` (f1a, f1b red at `51cf23f`, green after; control green throughout); committed as "never pauses on the producer's Go after a cue renumbered at the console, before Eos's notify of it, with $then answered before the fresh read ends" (Back, Fire again, nothing) and "pauses for a cue fired at the console while a Go is in flight, when the Go is answered before the fresh read ends" (the fix's own failure path), each red at `51cf23f` but the control | 0 new; the `own` and `receive` comments reworded as the brief directs | fixed (Go and Back; Back half probed by the verifier) |
| 2 (MEDIUM) | `b8de089` pre-PR review 9 finding 2: a cue recorded at the console becomes Eos's active cue with no fire event; `cc163c2` tests that the named active cues clear on a fire event and on a close | red→green: the repro's f2 green with the fixed `eos.ts`; the rewritten "recorded" EDITS cases (`test/eos.test.ts:2185`, `:2197`) red at `a550e38`, green after; control "pauses for a cue fired at the console after a cue recorded at the console, with a Go pending that fires the cue after the recorded one"; mutants in a scratch worktree: accept any named cue (the control and "pauses for a cue fired at the console just after a Go from the last cue" red), no `named.add` (both recorded cases red), no clear on a fire event and no clear on a close (each red under its `cc163c2` test) | 1 (the `named` declaration comment the brief's surface asks for); `receive` comment and the fake's `editShow` doc reworded | fixed (record, renumber, delete; Go and Back; before and after the notify) |
| 3 (LOW) | — deferred | — | — | LOW tail, deferred to Nick (eng-pipeline#34) |
| 4 (LOW, comment hygiene) | — deferred | — | — | LOW tail, deferred to Nick |

Full checks at `cc163c2`: `pnpm lint`, `pnpm typecheck` clean; `pnpm test` 74 files, 1980 passed, 4 skipped; `pnpm build`; `pnpm test:e2e` 66 passed. Phase 2: one `pr-review-finder` disprove agent over both fixes (both touch the own-command accounting core): both "fixed", no defect introduced. Phase 2.5 not needed: no rework.

Surface the brief missed, enumerated before fixing finding 2: `test/fake-eos.test.ts`'s three notify tests (the byte-for-byte notify pair, the never-subscribed connection, the held notifies) now receive the previous and active cue the edits send, so each filters to notifies or expects them; the `editShow` doc's "`notify: false` sends nothing" became "sends no notify". `test/eos.test.ts:596-607` and `:619` were checked and need no change (the live cue 8 row is unchanged by design).

### Known regressions, deferred
- None introduced.

### Verify notes, LOW, not fixed
- A console fire that looks exactly like the pending Go's answer from a recorded cue is accepted (`src/server/eos.ts:384`): live 3, record 3.7, Go held, `fireByHand('4')` stays armed. Indistinguishable on the wire from finding 2's case, so the brief's trade; `named` clears only on a fire event or a close, so a record widens the accepted set until the next fire. Proposal filed.
- The fake's previous cue on a record is the cue numerically before the recorded one; the recordings fit "the old active cue" equally, and the two differ mid-list (Needs Further Investigation A). The adapter ignores `/previous`.
- The fake sends nothing for a re-record of an existing number or a move of a cue other than the current one; Eos's behaviour for a re-record is unrecorded.
- The committed EDITS and MOVED_3 tests press only Go after an edit; the Back side was proved by the verifier's throwaway probes only. Proposal filed.

### Rework briefs
- None.

### Approach decisions (this round)
- Re-judge take: the first pending Go or Back at the unexplained fire event is taken at once with every command before it, as `answers` takes a command; `used` and `useUp` removed, `answers` slices `own` (brief option 1).
- Active cues after an edit: a set of every cue Eos named active since the last fire event, cleared on each fire event and on a close; the re-judge also places the taken press from each by the fresh list. The live cue rules are unchanged.
- The fake's `editShow` infers the edit from the number sets: the current cue gone with one cue added and one removed is a move (active only); the current cue gone otherwise is a delete (onto the cue before, previous and active); one cue added and none removed is a record (onto it, previous and active); anything else keeps the current cue. Its list is sorted by number, stable, so parts keep their place.
- Finding 1's committed tests use a renumber of 3.5 to 3.7 rather than the repro's add, since finding 2 makes the fake's record move its current cue as Eos does; a renumber of a cue other than the current one moves nothing, so the mechanism is the same on both fakes.
