# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `98f15c4` "Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing")
**Reviewed at:** HEAD `37b3bba` (setlist-controller#108 pre-PR review 9 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 74 files total, +15969 / -68 against the merge-base (9 of them earlier review docs and 10 repro scripts).
**Delta under review:** since `0fc295a` (setlist-controller#287 Lights: the producer's Go pauses the lights by hand after a cue is added or deleted at the console, until Refresh), the commit pre-PR review 9 reviewed: 6 files, +526 / -40, of which the code is `src/server/eos.ts` (+23 / -20), `test/fake-eos.ts`, `test/eos.test.ts` and `test/fake-eos.test.ts`, from `a550e38`, `b8de089` and `cc163c2`. Stage 2 round 2 of the seventh `/epic-loop` run.
**Reviewed against:** the epic body of setlist-controller#108 and #287's acceptance criteria as distilled in pre-PR review 9; pre-PR review 9's findings 1 and 2, their briefs, its remediation closure table, its verify notes and its Approach decisions; the recordings in `test/fixtures/eos/`. The repo has no `CLAUDE.md` and no coding standards file, so the five shared review rules stand in for them.
**Date:** 2026-11-06
**Reviewer:** 1 code-review agent + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 74 files, 1980 passed, 4 skipped (the same 4 as reviews 4 to 9) |
| Build and Playwright | `pnpm test:e2e` (builds first) | built; 66 passed |
| Finding 1 | `sh docs/reviews/setlist-controller-108/repro/review-10-repro.sh` | f1 red ("expected { name: 'eos', ... } to deeply equal ObjectContaining{arm: 'paused', pause: 'by-hand'}"); control and order green |
| Finding 1's recommended fix | the fix applied in a scratch worktree; `vitest run test/eos.test.ts test/fake-eos.test.ts`, `tsc --noEmit`, `eslint src/server/eos.ts`; the repro with the fixed `eos.ts` | 175 passed; typecheck and lint clean; all three repro tests green |
| The naive fix (latest active cue only) | the repro with `named.slice(-1).filter(...)` in place of the fix | order red: the Go's own active cue before its fire event pushes out the recorded cue |
| Delta tests red before the fixes | audit agent: HEAD's tests and fake with `eos.ts` from `0fc295a`, then from `a550e38` | at `0fc295a`: the recorded EDITS rows (`test/eos.test.ts:2185`, `:2197`), the Back and Fire again `$then` rows (`:2239`), `:2276` and `:2318` red; at `a550e38`: the recorded EDITS rows and `:2276` red. Green under both, as regression guards: MOVED_3 (`:2228`), `$then` nothing, `:2262`, `:2295` |
| Mutants of the delta | audit agent and finder: drop `named.add`; no clear on a fire event; no clear on a close; drop the `activeBefore` term; always accept when the read is full; always pause after the read; do not take the Go at once; drop the `cue !== number` filter; keep the latest active cue only | every mutant red under at least one test except the last two: the filter (finding 1's fix makes it load-bearing, and the repro's order test pins it) and the latest-only set (finding 1) |
| Early negative assertions | audit agent: re-judge made to always pause after the read | every `neverPaused` in the delta went red; none is checked before the re-judge lands |
| Fake's `editShow` against the recordings | finder: `cue-edit-at-console.json`, `cue-edit-at-console-subscribed.json`, `cue-edit-at-keypad-subscribed.json` | record, move and delete packets match; numbered active cues come only once per fire and on an edit, and the percent during a fade is the unnumbered `/eos/out/active/cue`, which `ACTIVE` does not match |
| Fake tests red against the old fake | audit agent: `test/fake-eos.ts` from `0fc295a` | `test/fake-eos.test.ts:188`, `:239`, `:254`, `:267`, `:283` red; `:203` green (its assertion was narrowed to notifies, see Test quality) |
| Real Eos for a cue recorded mid-list, and for an edit of a cue other than the current one | not run: no ETCnomad here | Needs Further Investigation A |

**Overall:** the full checks are green, and both of pre-PR review 9's MEDIUMs are fixed against their intent: the re-judge takes its Go or Back at once, and a cue recorded at the console no longer pauses the producer's next Go or Back. Every mutant of the delta but one turns a test red. The one gap is LOW: the set of cues Eos named active keeps a cue Eos has since moved off, so after two records a console fire that is a Go from the first recorded cue is accepted (finding 1, with a three-line fix audited by execution). The rest is test and comment tidying. Nothing here gates the PR, which still waits on #140.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254, review 3 finding 1, #268, #271, #273): the cue Eos is on at connect is judged once against `before`, `beforeOwn` and the `firedAfter` chain of each. Wrap, Go From Last and Back From First expect every outcome, since #286 proved Wrap unreadable over OSC.
- Own-command accounting (#137, #138, #273, #287): a fire event uses up the first pending own command that accounts for it, with every command before it. A Go or Back accounts for a cue it fires from the live cue by the cue list as last read, the cue the live cue's follow fires included, and for any cue when the live cue cannot be placed. A fire by number of the cue takes the event from an earlier Go or Back that reaches it only past an end of the list.
- Cue edits (#287, review 9): `/eos/subscribe 1` on every connect; any `/eos/out/notify/cue/<list>/...` re-reads the whole list. An unexplained fire event while a Go or Back is pending takes the first pending Go or Back at once, with every command before it, and judges it again after a fresh read: from the live cue, or from the cue Eos named active since the last fire event. This review narrows "every cue Eos named" to "the last cue Eos named that is not the event's own cue" (finding 1), in place, inside the same three lines; not a split ticket.
- Active cues after an edit (review 9): the set is cleared on each fire event and on a close; the live cue rules are unchanged (the active cue is the live cue only while there is none).
- The fake's `editShow` (review 9): its list is sorted by number, stable; the current cue moves onto a recorded cue, onto the cue before a deleted current cue, and onto the new number of a moved current cue, sending previous and active to every open connection with no fire event.
- Cue 0 (#288): kept as the internal live cue so a Go from it lands on the first cue; only `showLines` hides it.
- Shadowed cues (#252, #258): the check never calls a cue that fires "never fires". The exemption is every cue that a follow or hang of any cue reaches, with the false negative #258 accepted.
- File check shape (#256 and the #84 merge): a name-matching target answers `FileCheck { unmatched, problems }`; problems render first, under "Problems:", and names under "Cannot match:".
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter. Row behaviour that needs effects to run is tested in Playwright (`e2e/lights.spec.ts`).

## Confirmed Issues
### 1. After two cues are recorded at the console, a console fire that is a Go from the first of them is taken as the producer's Go, though Eos has moved on — LOW
- **Location:** `src/server/eos.ts:193` (`named`), `:355` (`activeBefore`), `:384` (the re-judge condition), `:403` (`named.add`)
- **Attribution:** introduced by the remediation, `b8de089` (setlist-controller#108 pre-PR review 9 finding 2: a cue recorded at the console becomes Eos's active cue with no fire event): `git log -S'named.add' 0fc295a..HEAD` names only that commit, and the module is absent at `$BASE`. Pre-PR review 9's brief specified "any of them"; the remediation followed it. Not the same as review 9's verify note "a console fire that looks exactly like the pending Go's answer from a recorded cue is accepted", which is the cue Eos is on now and indistinguishable on the wire; here Eos has already said it is on another cue.
- **Real-world trigger:** the lighting designer records two cues at the console with no fire event between them (on cue 3, Record 3.7, then Record 5.5, so Eos is on 5.5 and its next Go fires 6). The producer presses Go, and within the Go's one network trip the operator fires cue 4 at the console. The re-judge accepts 4 as a Go from 3.7. The missed pause stands only when the Go's own answer never comes (a Go from the last cue with no Wrap, a Go answered by a resume event, a drop that eats it); otherwise the Go's answer finds nothing pending and pauses. LOW, capped: no plausible user path needs both the race and an unanswered Go. Upgrade to MEDIUM if #140's acceptance run shows the lighting designer firing cues by hand while the producer's Go is in flight.
**Evidence**
```ts
  let named = new Set<string>();
  ...
      const activeBefore = [...named].filter((cue) => cue !== number);
  ...
        if (full && (... || activeBefore.some((cue) => placed(cue) && firesFrom(taken, cue).includes(number)))) return;
  ...
      named.add(active[1]!);
```
**Failure mode** — live cue 3; record 3.7 (active 3.7), record 5.5 (active 5.5); `named` is {3, 3.7, 5.5}. Go held; cue 4 fired at the console. The fresh list places 3.7 and `firesFrom('go', '3.7')` is `['4']`, so the re-judge returns with no pause. Proved: `review 10 f1` fails at HEAD with the row still armed 2 s after the fire; `review 10 control`, the same with only 5.5 recorded, pauses.
**Recommended fix** — keep the named cues in order and judge from the last one that is not the event's own cue:
```diff
-  let named = new Set<string>();
+  let named: string[] = [];
@@ fire branch
-      const activeBefore = [...named].filter((cue) => cue !== number);
-      named = new Set();
+      const activeBefore = named.filter((cue) => cue !== number).slice(-1);
+      named = [];
@@ active branch
-      named.add(active[1]!);
+      named.push(active[1]!);
@@ close handler
-      named = new Set();
+      named = [];
```
The re-judge condition at `:384` stays as it is. The declaration comment at `:191-192` becomes "The cues Eos named as its active cue since the last fire event, in order, as a cue recorded at the console becomes with no fire event. Cleared on each fire event and on a close."
**Remediation brief**
- **Design intent:** an edit at the console moves Eos's active cue with no fire event, so the re-judge also places the taken Go or Back from the cue Eos is on. That is the last active cue Eos named before the event, except the event's own cue, since Eos can send the answering cue's active cue before its fire event (`fire-follow-chain.json`, the app's fire of 99/1). Keeping only the latest active cue is wrong for that reason; keeping all of them accepts cues Eos has left. The array is cleared on each fire event and on a close, as now.
- **Full surface:** `src/server/eos.ts:191-193` (declaration and comment), `:355-356` (capture and clear in the fire branch), `:403` (push), `:613` (clear on close). The `receive` comment at `:325` ("or from a cue Eos named as active since the last fire event") becomes "or from the last cue Eos named as active since the last fire event". Tests: add `review 10 f1`, `review 10 control` and `review 10 order` from the repro to `test/eos.test.ts` under descriptive names, in describe "the fire event that answers the lights' own Go and Back", beside "pauses for a cue fired at the console after a cue recorded at the console, with a Go pending that fires the cue after the recorded one" (`:2262`).
- **Must preserve:** all 158 tests in `test/eos.test.ts` and 17 in `test/fake-eos.test.ts`, in particular the recorded EDITS rows (`:2185`, `:2197`), `:2262`, `:2276` (named clears on a fire event) and `:2295` (named clears on a close); `review 10 order` green (a Go answered with its active cue before its fire event never pauses), which also pins the `cue !== number` filter; the live cue rules in the active branch (`:404-414`).
- **Failure of the fix itself:** a delete or move after a record (record 3.7, then delete it) names the cue before last, and Eos is on that cue, so the last named is still right. When Eos sends an active cue of a cue it fades through, which no recording shows for a numbered active cue, the last named could be that cue; the backstop is the live cue check, which still runs first.
- **Do not touch:** the take at `:377-382` (review 9 finding 1, fixed); the fake's `editShow`; Reviewed and Dismissed bullets 1 to 3.
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-10-repro.sh`: f1 red now, green after; control and order green throughout. Pass a fixed `eos.ts` as the script's argument to check a fix before committing it.
- **Escalation:** this is the ninth change to the own-command accounting. The fix stays inside the three `named` lines; anything wider, such as taking the active cue as the live cue, goes to a split ticket under #108.

### 2. The last assertion of the in-flight Go test cannot fail, so the re-judge's verdict in that test is never observed — LOW
- **Location:** `test/eos.test.ts:2331-2333`, in "pauses for a cue fired at the console while a Go is in flight, when the Go is answered before the fresh read ends" (`:2318`)
- **Attribution:** introduced by `a550e38` (setlist-controller#108 pre-PR review 9 finding 1: a Go the re-judge holds for an edited cue can be used up by a later answer).
- **Real-world trigger:** none; it is a test that claims more coverage than it has. The pause is sticky until a re-arm, and the earlier `waitFor` at `:2330` already saw the pause the Go's own answer causes, so `:2333` holds whatever the re-judge decides. The test's discriminating half (`:2330`) is sound: it is red at `0fc295a` and under the "do not take the Go" mutant.
**Evidence**
```ts
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
    rig.fake.releaseReads();
    await rig.producer.flush();
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
```
**Recommended fix** — re-arm after the first pause, then release the reads and wait for the re-judge to pause again:
```diff
     await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
+    await rig.arm();
     rig.fake.releaseReads();
-    await rig.producer.flush();
-    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
+    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
```
**Remediation brief**
- **Design intent:** when the held event was a console fire and the Go's own answer comes during the read, the answer pauses at once and the re-judge pauses again after the read; the test proves both.
- **Full surface:** `test/eos.test.ts:2318-2334` only. `rig.arm()` is the helper `:2307` uses.
- **Must preserve:** the `waitFor` at `:2330`.
- **Do not touch:** `src/server/eos.ts`.
- **Proof:** `pnpm exec vitest run test/eos.test.ts -t 'when the Go is answered before the fresh read ends'` green; then, in a scratch worktree, the re-judge's `reporter?.changedByHand();` at `src/server/eos.ts:385` replaced with `return;` turns the new last `waitFor` red.

### 3. The Playwright Go and Back test's arm assertion cannot go red (carried from pre-PR reviews 6 to 9) — LOW
- **Location:** `e2e/eos.spec.ts:44-45`
- **Attribution:** introduced by `0499d70` (setlist-controller#137 Lights manual buttons: Go and Back); untouched in the delta; pre-PR review 9 finding 3, deferred to Nick.
- **Real-world trigger:** none; the adapter tests cover the rule with the lights armed.
The brief stands as written in pre-PR review 9 finding 3: arm the row before the presses (`row.getByRole('button', { name: 'Arm', exact: true }).click()`, as `e2e/producer.spec.ts:38`), and assert `Armed` after them. Proof: `pnpm test:e2e -- e2e/eos.spec.ts` green; in a scratch worktree, `reporter?.changedByHand();` at the top of `runButton` in `src/server/eos.ts` turns it red.

### 4. Comment hygiene — LOW (aggregated)
Pre-PR review 9 finding 4's entries stand at their current lines (deferred to Nick), plus this round's:
- `src/server/eos.ts:327-328` — the paragraph the delta reflowed stops at "is not in the fresh list either; else," (43 columns) before a 158-column line → rewrap the block from `:315` to `:331` at 100.
- `src/server/eos.ts:200-201` — "A fire event judged again after a fresh read takes its Go or Back at once, so no later event can." → "A fire event judged again after a fresh read takes its Go or Back at once, with every command before it, so no later event can."
- `src/server/eos.ts:294-295` — "sent on connect, and again after every fire, sometimes before the fire event (fire-follow-chain.json)" → "sent on connect, again after every fire, sometimes before the fire event (fire-follow-chain.json), and on a cue recorded, moved or deleted at the console (cue-edit-at-console.json)".
- `src/server/eos.ts:309-311` — "Everything but a fire event, a stop or resume event, a cue notify, the active cue Eos is on at connect and the replies to a read in flight is ignored" → "... a cue notify, the active cue (the live cue at connect, and kept for the re-judge after) and the replies ...".
- `src/server/eos.ts:334-337` — "The active cue is the live cue only while there is none ... any later one is ignored" → "... any later one is not the live cue, and is kept only for the re-judge".

## Needs Further Investigation
### A. What Eos does with its active cue for a cue recorded mid-list, a cue re-recorded at its own number, and an edit of a cue other than the current one — confirm by recording each at #140's Augment3d session
Carried from pre-PR review 9 A and widened. All three recordings edit at or past the active cue. The fake's `editShow` infers the rest: a record mid-list moves the current cue onto it (`test/fake-eos.test.ts:254` cites a recording for "so a Go fires the cue after it", which shows only a record past the last cue); a delete or move of a cue other than the current one keeps it; a re-record of an existing number sends nothing. The EDITS deleted and renumbered rows, the MOVED_3_5 `$then` tests and "never notifies" depend on the second. Record with the one-off driver shape of `.epic-loop/tickets/287/record-keypad.py`: from 1/3, `Record Cue 1 / 3.7#` then a Go; from 1/3, `Delete Cue 1 / 5#`; from 1/3, `Record Cue 1 / 3#`; read the active cue after each.

### B. `e2e/lights.spec.ts:93-101` may race the list's own scroll effect — confirm by running the spec 50 times under load
Carried from reviews 6 to 9. Confirm with `pnpm exec playwright test e2e/lights.spec.ts --repeat-each 50` while `pnpm test` runs; kill with 50 clean runs.

## Reviewed and Dismissed
- `named` polluted by the active cue Eos sends during a fade (finder) — the percent during a fade is the unnumbered `/eos/out/active/cue` (`back-during-fade.json`, `fire-follow-chain.json`), which `ACTIVE` does not match; a numbered active cue comes once per fire, on connect and on an edit.
- Taking the Go at once breaks a Back answered by a stop event, two Gos pending, Go From Last or Wrap (finder, angle b) — each traced: a stop event with the Back taken finds nothing and the re-judge decides; a second Go's answer from an unplaced cue still accounts; `firesFrom` covers the first cue. The fire-racing-follow double fire event behaves as before.
- Pre-PR review 9's Reviewed and Dismissed bullets 1 to 8 (the Wrap race, the follow use-up of review 6's f2a order, the cross-list link, the re-judge's one-read delay, the pause on a close during the read, the 1 s window, the TCP length cap, the unchanged surfaces) — untouched by the delta, and stand.

## Minor / nits
- `src/server/eos.ts:381-382` — when the held event is a console fire and a fire by number is pending before the Go (a section start, then a Go, both in flight), the take drops the fire by number too, so its own fire event later finds nothing and `actedOn` is never reported for that Cue. The lights pause either way. Reasoned, not executed; introduced by `a550e38`, following review 9's brief ("with every command before it"). `own.splice(at, 1)` would keep it, at the cost of the command-order argument when the held event is the Go's real answer.
- `src/server/eos.ts:383-386` — the re-judge cut short by `stop()` still calls `changedByHand()` on a stopped target (pre-PR review 9 Minor, unchanged by the delta); `if (stopped) return;` at the top of the callback is the fix, as the close handler does.
- `src/server/eos.ts:401-414` — after a drop with a kept cue, reconnecting to an Eos with no active cue (`connect-no-active-cue.json`), a cue recorded at the console sends the first numbered active cue, which is judged as the cue Eos is on at connect and pauses. Pre-existing; only reachable after a fresh show load on the console during a drop.
- `test/eos.test.ts:2276` — under the old code and two mutants it fails at its middle `neverPaused`, not at its final pause; only the final assertion guards "named clears on a fire event". Splitting the precondition into its own test would make that guard explicit.
- The "do not take the Go at once" mutant is caught only by `test/eos.test.ts:2330`; the `$then` Back and Fire again rows stay green under it, since `taken` is captured before the read.
- Every Minor item of pre-PR reviews 8 and 9 stands as written there.

## Test quality
Tests added or changed in the delta: in `test/eos.test.ts`, the recorded EDITS rows (`:2185`, `:2197`), MOVED_3 (`:2228`), the three `$then` rows (`:2239`), `:2262`, `:2276`, `:2295`, `:2318`; in `test/fake-eos.test.ts`, `:188`, `:203`, `:239`, `:254`, `:267`, `:283`. Against `$BASE` all are red (the module does not exist there). Against `0fc295a`'s `eos.ts`, 7 are red and 4 green; the 4 green (MOVED_3, `$then` nothing, `:2262`, `:2295`) are regression guards, and `:2262` and `:2295` kill the "always accept" and "no clear on a close" mutants. No test computes its expectation with production code, mocks the adapter, asserts only calls, snapshots, or checks a negative before the re-judge lands. Tautology shapes found: 1 (finding 2). `test/fake-eos.test.ts:203` now filters the stopped connection's packets to notifies and pings, so it no longer asserts nothing else was sent; needed now that the fake sends active cues on an edit, and green under the old fake as expected.

## Prior-review closure
Pre-PR review 9 (`51cf23f`, reviewed at `0fc295a`) had 2 MEDIUM and 2 LOW. Finding 1 (MEDIUM) is fully fixed (`a550e38`): the re-judge takes its Go or Back at once, and the Back and Fire again orders are red at `0fc295a` and green now. Finding 2 (MEDIUM) is fully fixed against its intent (`b8de089`, `cc163c2`): a cue recorded at the console no longer pauses the producer's next Go, the fake moves its current cue as Eos does, and each part of `named` is pinned by a test; finding 1 here is a LOW narrowing of the mechanism that brief specified, not a half-fix. Finding 3 (LOW) is untouched, deferred to Nick, and re-emitted as finding 3. Finding 4 (LOW) is untouched, deferred to Nick, and carried into finding 4. None was "resolved" by editing a comment or doc. MEDIUM or higher left partially fixed or untouched: 0.

## Before opening the PR
- **CI readiness:** the repo has no CI; lint, typecheck, `pnpm test` (1980), the build and Playwright (66) are green at `37b3bba`.
- **Commit hygiene:** this doc and `repro/review-10-repro.sh` are the only additions; nothing to drop.
- **Likely reviewer asks:** why a cue edited at the console needs the notify, the re-judge and the named active cues; #273's and #287's trade-offs (review 6's f2a order now pauses, the Wrap case, the recorded-cue look-alike); the stem map change that rides on this branch; #140's install doc and acceptance run.

## Verdict
**Ready with follow-ups.** 0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW. Both of pre-PR review 9's MEDIUMs are closed. The confirmed list shrank from 2 MEDIUM to 0, and what remains is one narrow LOW in the mechanism (finding 1, a three-line fix audited by execution), a test assertion that cannot fail (finding 2), and the carried LOW tail; this is the list converging, not the review scraping for size. None gates the PR. Findings 1 and 2 can land through `/pr-review-remediate` before the PR or as follow-ups; findings 3 and 4 stay with Nick. The PR still waits on #140, which is Nick's.
