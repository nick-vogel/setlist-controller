# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `98f15c4` "Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing")
**Reviewed at:** HEAD `e2433af` (setlist-controller#330 Lights: the active cues kept after a cue recorded at the console include cues Eos left and never age out), clean tree: 0 files with uncommitted changes, 0 untracked; 79 files total, +16784 / -73 against the merge-base (10 of them earlier review docs and 12 repro scripts).
**Delta under review:** none. `--fresh`: the whole branch is reviewed again, stage 2 round 1 of the eighth `/epic-loop` run. The last review was pre-PR review 10 (`6b44f9d`, reviewed at `37b3bba`); since then #327 (`a4867c7`, `dc16ac4`), #328 (`23a52e9`, `a6c5d17`), #329 (`c1f0231`) and #330 (`f084b0e`, `e2433af`) landed.
**Reviewed against:** the epic body of setlist-controller#108 and its sub-issues, the bodies of #327, #328, #329 and #330, Nick's answer on #330 in `.epic-loop/tickets/330/plan.md` (drop acceptance criterion 2, no ageing of the named cues), pre-PR review 10's Approach decisions and findings, and the recordings in `test/fixtures/eos/`. The repo has no `CLAUDE.md`, no `CONTEXT.md`, no ADRs and no coding standards file, so the five shared review rules stand in for them.
**Date:** 2026-11-06
**Reviewer:** 3 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test`, three runs at load averages of 52, 22 and 21 | run 1: 3 red outside the diff (`test/propresenter.test.ts:3228`, `test/propresenter.test.ts:2971`, `test/set-builder-command.test.ts:452` timed out); run 2: `test/propresenter.test.ts:3228` red; run 3: 74 files, 2025 passed, 4 skipped. Flakes, none in a file the branch touches |
| Build and Playwright | `pnpm test:e2e` (builds first) | built; 66 passed |
| Finding 1 | `sh docs/reviews/setlist-controller-108/repro/review-11-repro.sh` | f1 red ("expected false to be true" at `neverPaused`); control green |
| Finding 1's recommended fix | the one-line fix in a scratch worktree; `vitest run test/eos.test.ts test/fake-eos.test.ts`, `eslint src/server/eos.ts`; the repro with the fixed `eos.ts` | 218 passed; lint clean; f1 and control green |
| A Go that reaches Eos as the live cue's follow fires (finder) | scratch test: live 3.1, Go held, then fire events 3.2 and 3.5; then a fix that accepts the Go's answer from the follow's cue once, in the shape of #327's echo | the lights pause today; the fix turns `test/eos.test.ts:2574` and `:2587` red, which pin #273's choice. Dismissed, see Reviewed and Dismissed |
| Modified test files against `$BASE` | audit agent: the branch's `connections`, `pages`, `pre-service-check`, `start-up`, `native-loaders`, `propresenter-adapter` tests and `test/fake-target.ts` copied into a worktree at `98f15c4` | 9 red, 176 green; the added tests green at base are #256's three `pages.test.ts` checks (`:708`, `:1410`, `:1407`), which main shipped through the merge, and `pre-service-check.test.ts:231`, red at base only by a `TypeError` |
| New test files against `$BASE` | audit agent: one run | all red (the modules and fixtures are not there) |
| Mutants of `src/server/eos.ts` | audit agent: 31 mutants of the #327, #328, #329 and #330 code, each under `test/eos.test.ts` and `test/fake-eos.test.ts`; then `sh docs/reviews/setlist-controller-108/repro/review-11-mutants.sh <mutant>` for the survivors | 23 red. 8 green: 4 observable through the producer row (finding 2), 3 equivalent, 1 on a check that is dead code (Minor) |
| Each ticket's tests against the `eos.ts` before it | audit agent: HEAD's tests with `eos.ts` from `6b44f9d`, `4dd00b4`, `5e53b21`, `9df6f31` | 17, 14, 11 and 1 red; the green ones are guards, save `test/eos.test.ts:2722`, which is green before #328 and under the "other list answers nothing" mutant (finding 2) |
| Pre-PR review 10 finding 1's repro | audit agent | the three tests are in `test/eos.test.ts` (`:2474` to `:2497`); f1 is red against `eos.ts` from `6b44f9d` |
| Pre-PR review 10 finding 2 | audit agent: the test read, and the re-judge made never to pause | not addressed; the test is green under the mutant (finding 4) |
| The fake against the recordings | finder: the fake's packets against every fixture, and the adapter made to send a float index and a float subscribe | ping, connect bursts, Back from the first cue, the notifies, the edit packets and the link string match. 218 passed with floats in place of ints, and every Go, Back and follow answers with a bare fire event (finding 3) |
| The recording scripts | finder: `test/eos-recording-scripts.test.ts` read and run | the #274 padding, the framing and "no fire, no overwrite" are each pinned by a test that can go red; `record-follow.py` and `build-eos-test-show.py` have no test (Minor) |
| Server, row and docs | finder: `connections.ts`, `target.ts`, `snapshot.ts`, the web row, `README.md`, `docs/install.md`, `config/stem-map.json`; six test files run in a scratch worktree | 185 passed; every snapshot and report builder carries `list`, `listCurrent` and `fileChanged`; nothing wrong in the behaviour |
| What Eos sends for a Go from a list with no active cue, a Go racing a follow, a Go from a cue linked to another list | not run: no ETCnomad here | Needs Further Investigation A |

**Overall:** the full checks are green, and #327, #328, #329 and #330 each do what their tickets ask. The fresh pass found one real false pause: with no live cue, as on a freshly loaded show, the producer's own Go pauses the lights when Eos names the cue active before its fire event, an order the recordings show for the first fire from a list with nothing active (finding 1, a one-line fix audited by execution). The rest is test strength: four rules of the latest work that no test pins, a fake that sends less than Eos does, which is why finding 1 went unseen, and two carried test assertions that cannot fail. Fix finding 1 before the PR; the rest can ride as follow-ups. The PR still waits on #140.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254, review 3 finding 1, #268, #271, #273): the cue Eos is on at connect is judged once against `before`, `beforeOwn` and the `firedAfter` chain of each. Wrap, Go From Last and Back From First expect every outcome, since #286 proved Wrap unreadable over OSC.
- Own-command accounting (#137, #138, #273, #287): a fire event uses up the first pending own command that accounts for it, with every command before it. A Go or Back accounts for a cue it fires from the live cue by the cue list as last read, the cue the live cue's follow fires included, and for any cue when the live cue cannot be placed. A fire by number of the cue takes the event from an earlier Go or Back that reaches it only past an end of the list. The follow's event uses up a Go that could have fired it, so a Go that reaches Eos just after the follow fired pauses on its own answer: on the wire it is the same as a Go answered by the follow's cue and a console fire after it (#273, pinned by `test/eos.test.ts:2574` and `:2587`). This review keeps that.
- The live cue from the active cue (#250): the numbered active cue is the live cue only while there is none. This review adds: and while no own command is pending, since Eos can name the cue a Go fires active before its fire event (finding 1). With no command pending the rule is unchanged, so the reconnect judgement, where the close has emptied `own`, is untouched.
- Cue edits (#287, review 9, review 10, #330): `/eos/subscribe 1` on every connect; any `/eos/out/notify/cue/<list>/...` re-reads the whole list, and once that read finishes in full the check runs again (#329). An unexplained fire event while a Go or Back is pending takes the first pending Go or Back at once, with every command before it, and judges it again after a fresh read: from the live cue, or from the last cue Eos named active since the last fire event that is not the event's own cue.
- Active cues after an edit (review 9, #330): kept in order, cleared on each fire event and on a close, never aged out by time (Nick, 2026-11-06, on #330: the look-alike console fire is accepted).
- The racing fire by number (#327): the second identical fire event of a cue the lights fired by number as the live cue's follow fired it, within the window, is the same fire; a third, one after the window, or one of another cue pauses.
- A link to another list (#328): argument 19 as a string `"<list>/<cue>"` names a cue outside the list unless its list is this one; a Go from such a cue fires no cue of the list, and its answer is a fire event of another list, a stand-in until it is recorded.
- The fake's `editShow` (review 9): its list is sorted by number, stable; the current cue moves onto a recorded cue, onto the cue before a deleted current cue, and onto the new number of a moved current cue, sending previous and active to every open connection with no fire event.
- Cue 0 (#288): kept as the internal live cue so a Go from it lands on the first cue; only `showLines` hides it.
- Shadowed cues (#252, #258): the check never calls a cue that fires "never fires". The exemption is every cue that a follow or hang of any cue reaches, with the false negative #258 accepted.
- File check shape (#256 and the #84 merge): a name-matching target answers `FileCheck { unmatched, problems }`; problems render first, under "Problems:", and names under "Cannot match:".
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter. Row behaviour that needs effects to run is tested in Playwright (`e2e/lights.spec.ts`).

## Confirmed Issues
### 1. With no live cue, the producer's Go pauses the lights when Eos names the cue active before its fire event — MEDIUM
- **Location:** `src/server/eos.ts:449`, with the fire branch at `:384` to `:423`
- **Attribution:** introduced. The rule that the active cue is the live cue while there is none came with `a450c2e` (setlist-controller#250 Lights: show the live cue as soon as Eos connects, so a reconnect does not pause the lights), `git log -S'if (live !== null) return;' 98f15c4..HEAD -- src/server/eos.ts`; it never asked whether one of the lights' own commands was pending. The module does not exist at `$BASE`.
- **Real-world trigger:** Eos has fired no cue in the followed list, as on a show freshly loaded or after Go To Cue 1 / 0 (`connect-no-active-cue.json`), or the lights reconnect after the list was faded out with Back on its first cue (Eos then names no numbered active cue, `back-first-cue.json`). Before the first song's cue, the producer presses Go on the lights row to bring up the first look. Eos answers with `/eos/out/active/cue/1/1` before `/eos/out/event/cue/1/1/fire`, the order it sent for the app's first fire from a list with nothing active (`fire-follow-chain.json`: active 99/1 at 64 ms, fire event at 77 ms). The row reads "paused by hand" on the producer's own press, and the lights stop following the music until the producer arms them again. MEDIUM, capped: the active-first order is recorded for a fire by number from an empty list and for the racing fire, not yet for a Go; it stays MEDIUM either way (a visible pause, not a silent wrong look), and Needs Further Investigation A records the Go at #140's session.
**Evidence**
```ts
    const active = ACTIVE.exec(message.address);
    if (active) {
      named.push(active[1]!);
      if (live !== null) return;
      const number = active[1]!;
      ...
      live = { number, label: null };
```
and in the fire branch, `from` is now that cue, so the pending Go no longer accounts for it:
```ts
      const from = live?.number ?? null;
      ...
          return !placed(from) || firesFrom(command, from).includes(number);
```
**Failure mode** — recorded show, no current cue; armed; Go held; Eos sends active 1, then the fire event of 1. `live` becomes `'1'` from the active cue, so the fire event is judged from `'1'`: `firesFrom('go', '1')` is `['2']`, the Go does not account for it, `followed` is false, and the pending Go is taken for the re-judge. After the fresh read, `placed('1')` holds, `firesFrom('go', '1')` still lacks `'1'`, and `activeBefore` is `named.filter((cue) => cue !== '1')`, empty, so `changedByHand()` runs. Proved: `review 11 f1` fails at HEAD at `neverPaused`; `review 11 control`, the same Go answered with the fire event alone, passes. A fire by number is unaffected, since it accounts by its number.
**Recommended fix** — do not take the live cue from the active cue while one of the lights' own commands is pending:
```diff
     if (active) {
       named.push(active[1]!);
-      if (live !== null) return;
+      if (live !== null || own.length > 0) return;
       const number = active[1]!;
```
**Remediation brief**
- **Design intent:** a Go or Back is judged from the live cue; with none, it answers with any cue, since Eos picks the cue (`:352` to `:353`). The numbered active cue stands in for the live cue only to place the reconnect judgement and the row's line before the first fire event (#250). Eos can name a cue active before its fire event, so while a command of the lights' own is pending, its fire event, not the active cue, must decide where the live cue is. `receive` prunes `own` to the window first (`:379`), so a command that never gets an answer stops blocking the active cue after 1 s.
- **Full surface:** `src/server/eos.ts:449`, the guard. The comment at `:365` to `:368` ("The active cue is the live cue only while there is none, from the connect to the first fire event") gains "and none of the lights' own commands is pending"; it is the only comment that states the rule. The test goes into `test/eos.test.ts`'s describe "the fire event that answers the lights' own Go and Back" (`:2293`): `review-11-repro.sh`'s two tests, under descriptive names. No other site reads `live` from the active cue.
- **Must preserve:** `named.push` stays before the guard (`test/eos.test.ts:2497`, the active cue before a Go's fire event after a cue recorded at the console). The reconnect judgement: `own` is empty at every connect, since the close clears it (`:672`) and `sendOwn` sends only while online, so the suites "the lights' own fire whose fire event a drop eats" (`:1820`) and "the lights' own Go and Back whose fire event a drop eats" (`:2034`) must stay green. The live cue shown at connect (#250), in "the live cue on the lights row" (`:451`). A fire by number with no live cue is acted on (`:1240` describe).
- **When the fix's own path fails:** an active cue skipped while a command is pending, with no fire event after it (a cue recorded at the console with no live cue while a Go is in flight, and the Go fires nothing), leaves no live cue until the next fire event: the row shows no live cue line, and the next Go or Back answers with any cue, the rule for no live cue. Nothing pauses wrongly, and the next fire event places the live cue.
- **Do not touch:** the follow use-up of a Go (#273), see Reviewed and Dismissed bullet 1.
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-11-repro.sh` shows f1 red now and green after; then the two tests in `test/eos.test.ts`, `pnpm exec vitest run test/eos.test.ts test/fake-eos.test.ts` green (218 and the new ones), and the guard reverted in a scratch worktree turns the f1 test red.

### 2. Four rules of the #327, #328 and #330 work have no test that fails without them — LOW
- **Location:** `src/server/eos.ts:411` (the echo cleared by another cue's fire event), `:410` (the echo set only on a fire by number), `:670` (`named` cleared on a close), `:140` (an unreadable string link is outside the list); and `test/eos.test.ts:2722`
- **Attribution:** introduced, by `a4867c7` and `dc16ac4` (#327), `23a52e9` (#328), `f084b0e` (#330).
- **Real-world trigger:** none today; each is a behaviour the code has and a later change could drop unseen. Each mutant changes what the producer row shows (the audit agent's probes are green at HEAD and red under each), so the gap is a missing test, not dead code.
**Evidence** — every mutant passes the whole suite of the adapter (218 passed, exit 0):
```sh
sh docs/reviews/setlist-controller-108/repro/review-11-mutants.sh echo-other-cue    # else if (!command) echo = null;
sh docs/reviews/setlist-controller-108/repro/review-11-mutants.sh echo-any-follow   # if (followed) echo = ...
sh docs/reviews/setlist-controller-108/repro/review-11-mutants.sh named-on-close    # close keeps named
sh docs/reviews/setlist-controller-108/repro/review-11-mutants.sh link-unreadable   # "99" or "1/" read as no link
```
**Failure mode** — under each mutant: (echo-other-cue) race onto 3.5 (`racedOntoBridge()`), the producer's Go lands on 4, then 3.5 fired at the console within 1 s reads as the race's second event and never pauses; (echo-any-follow) a plain follow onto 3.5, then 3.5 fired again at the console within 1 s never pauses; (named-on-close) 3.7 recorded on cue 3, the connection drops, 4 fired at the console, the lights reconnect and are armed again, Go held, 4 fired at the console: the stale 3.7 makes the re-judge take it as the Go's; (link-unreadable) a cue with `link: '99'`, a Go, then the next cue fired at the console is taken as the Go's. HEAD pauses in each. Separately, `test/eos.test.ts:2722` ("never pauses on the producer's Go from it, answered by a fire event of a cue in another list") is green before #328 and when the other list's fire event answers nothing, since nothing paused then either; `:2737` already covers that rule.
**Recommended fix** — four tests, each red under its mutant, in the describes that hold their neighbours: echo-other-cue and echo-any-follow in "a fire by number that races the live cue's follow onto the same cue" (`:1706`), using `racedOntoBridge()` and `armedOnCue3(FOLLOWED_3)` with `follow('3.5')` then `fireByHand('3.5')`; named-on-close in "the fire event that answers the lights' own Go and Back" (`:2293`), using `editShow` with `notify: 3.7`, the fake's drop, `fireByHand('4')`, the reconnect, `arm()`, `holdFires()`, a Go and `fireByHand('4')`; link-unreadable in "a cue linked to a cue in another list" (`:2711`), using `armedOnCue4` with `link: '99'`, `pressGo` and `fireByHand('5')`. Each ends `vi.waitFor(... pause: 'by-hand' ...)`. For `:2722`, add after its `neverPaused`: `rig.fake.holdReads(); rig.fake.fireByHand('5');` and a `vi.waitFor` on the pause, which proves the Go was used up; or fold it into `:2737`.
**Remediation brief**
- **Design intent:** the echo is one fire event's allowance, only after a fire by number that a follow raced; `named` is per connection; a link the lights cannot read never predicts a cue of the list.
- **Full surface:** `test/eos.test.ts` only, at the four describes named above and `:2722`.
- **Must preserve:** every existing test; no change to `src/server/eos.ts`.
- **Do not touch:** the `echo = null` on a close (`:671`): not observable, since a reconnect (5 s) always comes after the window (1 s); keep it as defence.
- **Proof:** each `review-11-mutants.sh <mutant>` exits non-zero once its test lands; `pnpm exec vitest run test/eos.test.ts` green at HEAD.

### 3. The fake Eos accepts what Eos was not recorded taking, and answers every Go, Back and follow with a bare fire event — LOW
- **Location:** `test/fake-eos.ts:379` (`const index = message.args[0] as number;`), `:339` (`if (message.args[0] === 1)`), `:292` (`return (!show && recorded.get(number)) || [fireEvent(cue)];`), `:363`, `:488`
- **Attribution:** introduced (the fake is new on the branch).
- **Real-world trigger:** none directly; the fake is a test seam. It is the reason finding 1 went unseen: every recording of a fire shows previous, active and pending around the fire event, sometimes the active cue first (`fire-follow-chain.json`, `fire-racing-follow.json`), and the fake sends them only when it replays cue 3 or 3.5 of the unedited recorded show. The adapter's `named`, `activeBefore` and live-from-active logic is reached only through hand-written `emit` calls.
**Evidence** — the adapter sending a float index (`src/server/eos.ts:469`, `[index]` for `[{ int: index }]`) and a float subscribe (`:633`, `[1]` for `[{ int: 1 }]`) keeps `test/eos.test.ts` and `test/fake-eos.test.ts` green, 218 passed (finder, executed in a scratch worktree). `grep -n '\.types' test/eos.test.ts` finds nothing.
**Recommended fix** — in the fake, answer an index read and a subscribe only when the argument's type tag is `i`, as Eos was recorded taking (`message.types !== 'i'` returns); after each fire event of a Go, a Back and a follow, send the templated previous, active and pending cue as `connectBurst` templates the active cue; and give `holdFires` or a new switch the option to send the active cue first, so a test can ask for the recorded order.
**Remediation brief**
- **Design intent:** the epic's testing decision: "the replies the fake sends are recorded once from Augment3d at home, so the fake speaks what Eos really sends". A fake that sends less than Eos lets the adapter pass tests that real Eos would fail.
- **Full surface:** `test/fake-eos.ts:292`, `:339`, `:363`, `:379`, `:488`; `test/fake-eos.test.ts` gains a test per change; `test/fixtures/eos/README.md` already describes the packets.
- **Must preserve:** every `test/eos.test.ts` test that counts packets or reads `received` (`cueListMessages`, `fires`, `counts`); the active cue sent after a fire is ignored while there is a live cue (`src/server/eos.ts:449`), so the follow tests' outcomes must not move. Land after finding 1, whose fix keeps the active-first order from pausing a Go.
- **Do not touch:** `src/server/eos.ts`.
- **Proof:** with the fake changed, the two float mutants above turn `test/eos.test.ts` red; `pnpm exec vitest run test/eos.test.ts test/fake-eos.test.ts` green at the fixed HEAD.

### 4. The last assertion of the in-flight Go test cannot fail (carried from pre-PR review 10 finding 2) — LOW
- **Location:** `test/eos.test.ts:2566-2568`, in "pauses for a cue fired at the console while a Go is in flight, when the Go is answered before the fresh read ends" (`:2553`)
- **Attribution:** introduced by `a550e38`; untouched since review 10.
- **Real-world trigger:** none; the test claims more coverage than it has. The pause is sticky until a re-arm, and the `waitFor` at `:2565` already saw the pause, so `:2568` holds whatever the re-judge decides. Green with the re-judge made never to pause (audit agent).
**Evidence**
```ts
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
    rig.fake.releaseReads();
    await rig.producer.flush();
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
```
**Recommended fix**
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
- **Full surface:** `test/eos.test.ts:2553-2569` only. `rig.arm()` is the rig's helper, as `armedOnCue3` uses it.
- **Must preserve:** the `waitFor` at `:2565`.
- **Do not touch:** `src/server/eos.ts`.
- **Proof:** `pnpm exec vitest run test/eos.test.ts -t 'when the Go is answered before the fresh read ends'` green; in a scratch worktree, the re-judge's `reporter?.changedByHand();` at `src/server/eos.ts:422` replaced with `return;` turns the new last `waitFor` red.

### 5. Three Playwright assertions cannot go red for what their test names claim (the first carried from pre-PR reviews 6 to 10) — LOW
- `e2e/eos.spec.ts:45-46` — the comment says "Disarmed before the presses, and disarmed after them", and only the state after is asserted. Add `await expect(row.locator('.connection-arm')).toHaveText('Disarmed');` before `go.click()`, or reword the comment. Carried from pre-PR review 10 finding 3, deferred to Nick.
- `e2e/lights.spec.ts:81` — `await expect(row.locator('.check')).toBeInViewport();` follows `row.scrollIntoView({ block: 'start' })`, and the check renders above the state lines and the list (`web/src/ConnectionsPanel.tsx:77-85`), so it is on screen whether or not the list is capped. Only `:83` and `:84` fail without the cap. Assert the lateness line under the list is in view instead, or drop "its pre-service check" from the title.
- `e2e/lights.spec.ts:49-71` — "then each cue fired at the console" checks the live line and the count, never the mark. Add `await expect(lines.nth(8)).toHaveAttribute('aria-current', 'true');` before `fireByHand('6')` and `await expect(lines.nth(6)).toHaveAttribute('aria-current', 'true');` after it.
- **Attribution:** introduced. **Proof:** by reading; each is an assertion that holds under the behaviour it claims to guard removed. Not executed (Playwright reruns were out of budget).

### 6. Comment hygiene — LOW (aggregated)
Pre-PR review 9 finding 4's and pre-PR review 10 finding 4's entries stand where their text still reads as quoted there (deferred to Nick); in `src/server/eos.ts` those are now at `:218-219`, `:315-316`, `:331-334`, `:365-368` and the reflowed blocks at `:21-22`, `:342-344` and `:357-359`, which run to 160 columns. This round adds:
- `src/server/eos.ts:392-393` — "A Go or a Back accounts for a cue it fires from the live cue, the one the live cue's follow fires included" → "A Go accounts for the cue it fires from the live cue, which is the cue the live cue's follow fires too; a Back for the cue it fires from the live cue".
- `src/server/eos.ts:342-345` — "A Go or a Back answers only with a cue it fires from the live cue before the event, past either end of the list included, and the cue that live cue's follow fires next included" → "... past either end of the list included, and, for a Go, the cue that live cue's follow fires next".
- `test/start-up.test.ts:35` — "The fake kind's section good, and the lights' with no host and cue list 0." → "The lights' section with no host and cue list 0; startUp knows no "fake" kind, so that section is disabled too." (the comment is right in `test/eos.test.ts`, which registers the fake kind).
- `web/src/styles.css:830` — "capped at about eight lines" → "capped at 15rem, about eleven lines" (no `line-height` is set, so a 1.125rem line is about 21 px).
- `test/fixtures/eos/README.md:49` — "The file keeps the 3 s before the fire and the 7 s after." → "The run keeps the 3 s before the fire and waits 7 s after it; in the committed file Eos sent nothing after the fire event but the softkeys, within 67 ms."
- `test/fixtures/eos/README.md:69` — "Every fire, from the app or by hand, gives ... then the previous, active and pending cue." → "Every fire from the app gives ... then the previous, active and pending cue; the fire by hand (`fire-by-hand.json`) shows the fire event and nothing after it."
- `test/fixtures/eos/README.md:37` — "the build's `Record Cue 1 / 7 Part 2` gave no error and recorded nothing" → "an earlier build's `Record Cue 1 / 7 Part 2` gave no error and recorded nothing, so `build-eos-test-show.py` no longer sends it".
- `test/fake-eos.ts:64` — "Every reply sent to a read" → "Every read the fake answered, sent or silenced" (`answered` is pushed while `silent` drops the packet, `:375`, `:387`).
- `test/fake-eos.test.ts:254` — the test cites `cue-edit-at-console-subscribed.json` for a cue recorded mid-list → "inferred; the recordings record past the last cue only".
- `src/server/target.ts:79`, `web/src/ConnectionsPanel.tsx:16-20` and its `StateList` comment — rewrap at 100 columns.

## Needs Further Investigation
### A. What Eos sends for a Go from a list with no active cue, a Go that reaches Eos as a follow fires, a Go from a cue linked to another list, and the edits of review 10 A — confirm by recording each at #140's Augment3d session
Finding 1's order (the active cue before the fire event) is recorded for a fire by number from a list with nothing active; record a Go from 1/0. The Go racing a follow is inferred as the follow's cue, then the Go's from it (dismissed bullet 1 keeps the pause either way). The other-list Go is a stand-in in both the fake and the adapter (`test/fake-eos.ts:359-362`, `src/server/eos.ts:426-429`), so `test/eos.test.ts:2722`, `:2737` and `:2784` test the adapter against the same guess. Review 10 A carries: a cue recorded mid-list, re-recorded at its own number, and an edit of a cue other than the current one. Record with the one-off driver shape of `.epic-loop/tickets/287/record-keypad.py`.

### B. `e2e/lights.spec.ts:93-101` may race the list's own scroll effect — confirm by running the spec 50 times under load
Carried from reviews 6 to 10. `pnpm exec playwright test e2e/lights.spec.ts --repeat-each 50` while `pnpm test` runs; kill with 50 clean runs. Related: `e2e/lights.spec.ts:116-117` holds only when the list starts below about `innerHeight - 240` at load, which the layout above the panel gives today on every viewport configured; a red there would read as a scroll defect.

## Reviewed and Dismissed
- A Go that reaches Eos just as the live cue's follow fires pauses on the Go's own answer (finder, executed) — the deliberate choice of #273 (`08d1272`): the follow's cue then the Go's are on the wire the same as a Go answered by the follow's cue and a console fire after it, which must pause. Pinned by `test/eos.test.ts:2574` and `:2587`; a fix in the shape of #327's echo turned both red. Do not "fix" it without Nick reversing #273.
- `linkOf` turns a negative or NaN int into a link (finder) — every recording sends 0 for no link; not reachable from Eos as recorded.
- The README's "moved" re-check claim (finder) — `cue-edit-at-console-subscribed.json` records the notify `[2, "11-12"]` for a move, which `NOTIFIED` matches.
- Every target report and snapshot builder lacking `list`, `listCurrent` or `fileChanged` (finder) — each carries them; `tsc` would fail otherwise.
- The marked line's contrast (finder) — white on `#2f6fd6` is about 4.8:1, AA.
- The `config/stem-map.json` change (finder) — "Keys 4" and "Vox FX" each appear once, in one group; only the set builder reads the file, by shape.
- Pre-PR review 10's Reviewed and Dismissed bullets stand: the fade's unnumbered active cue, the take at once against stop events and Wrap, and review 9's list (the Wrap race, the follow use-up order, the cross-list link, the re-judge's one-read delay, the pause on a close during the read, the 1 s window, the TCP length cap, the unchanged surfaces).

## Minor / nits
- `src/server/eos.ts:403` — with Wrap on, a Go on the last cue and a fire by number of the first cue within one round trip give two fire events of the first cue; `rather` gives the first to the fire by number and drops the Go with it, so the second pauses. Reasoned; Wrap is unreadable over OSC, and the window is one round trip.
- `src/server/eos.ts:384-390` — a follow's fire event that reaches the lights after a reconnect but before the connect burst's active cue (about 44 ms in `connect.json`) is judged from no cue and clears `before`. Reasoned; the window is the burst's.
- `src/server/eos.ts:405-412` — a Go and a racing fire by number onto the same cue give three events; the third pauses. Needs three coincidences.
- `src/server/eos.ts:531` — `&& !linksOutside(number)` in `pastEnd` is dead: `pastEnd` runs only once a Go accounts for the event, and a Go from a cue linked outside accounts for none (audit agent, equivalent mutant).
- `src/server/eos.ts:441-443` with `:752` — a notify's read, once full, runs the check, whose `readCues()` starts a second full read of the list; one read per notify would do. Reasoned.
- `src/server/eos.ts:420-423` — the re-judge cut short by `stop()` still calls `changedByHand()` on a stopped target (review 9 and 10 Minor, unchanged).
- `src/server/eos.ts:413-419` — the take drops a pending fire by number before the Go (review 10 Minor, unchanged).
- `test/fake-eos.ts:53`, `:240`, `:331` — a decimal int link is truncated in the list reply and fired whole on Go; throw on a non-integer link, since none is recorded.
- `test/fake-eos.ts:303-310` — the connect burst keeps connect.json's previous cue 7 and blank pending whatever the current cue; the adapter ignores both.
- `test/fake-eos.ts:404-405` — an undecodable packet from the adapter is dropped unrecorded, so a padding bug shows only as no answer.
- `test/fake-eos.test.ts:249` — the expected packets are built with the same `encode` the fake uses; template them from the recorded hex.
- `scripts/eos/record-follow.py` and `scripts/eos/build-eos-test-show.py` open their socket at import and have no test; `build-eos-test-show.py:31` exits 0 on an Eos error where `record-eos-fixtures.py` raises `SystemExit`. `scripts/eos/eososc.py:9-12` drops an argument of another type silently and sends a bool as an int.
- `web/src/ConnectionsPanel.tsx:110` — the scrollable list has no `tabIndex` or accessible name; the producer is on a touch iPad.
- `test/eos.test.ts:2392` — its `clock.advance(OWN_COMMAND_WINDOW_MS + 1)` exercises nothing, since `named` has no ageing (Nick's #330 answer); it is the guard that ageing stays out.
- The whole cue list rides in every producer snapshot; a cost note, unmeasured.
- `actsOn` answers by the cue list last read while the lights are offline; whether the server then waits on a fire event for a cue it never sent is unverified, and the same shape holds for the other targets.
- Every Minor item of pre-PR reviews 8 to 10 stands as written there.

## Test quality
Tests added: every test in `test/eos.test.ts`, `test/fake-eos.test.ts`, `test/osc-tcp.test.ts` and `test/eos-recording-scripts.test.ts`, red at `$BASE` (the modules are not there), plus the branch's additions to six existing test files. Green against `$BASE`: 4. Three are #256's `test/pages.test.ts` checks (`:708`, `:1410`, and the assertion at `:1407`), green because main shipped the Problems: heading before the merge-base; keep them. `test/pre-service-check.test.ts:231` ("runs no check while the target is offline") is red at base only by a `TypeError`; it is an over-reach guard, keep it. Against the `eos.ts` before each ticket, the green tests are guards, except `test/eos.test.ts:2722` (finding 2). `test/eos.test.ts:1718` checks the fixture only. No test mocks the adapter, computes its expectation with production code, snapshots output, or reads a comment or log. Negative assertions run after their trigger and a 200 to 300 ms wait, in order. Tautology shapes found: 1 (finding 4, carried). Mutation gaps: 4 rules (finding 2); fake fidelity: finding 3.

## Prior-review closure
Pre-PR review 10 (`6b44f9d`, reviewed at `37b3bba`) had 0 MEDIUM and 4 LOW. Finding 1 (LOW) is fully fixed by #330 (`f084b0e`, `e2433af`): the named cues are in order, the re-judge reads the last one that is not the event's own, and the three repro tests are in `test/eos.test.ts`, f1 red against `6b44f9d`. Finding 2 (LOW) is untouched and re-emitted as finding 4. Finding 3 (LOW) is untouched, deferred to Nick, and carried into finding 5. Finding 4 (LOW) is untouched, deferred to Nick, and carried into finding 6. None was "resolved" by editing a comment or doc. MEDIUM or higher left partially fixed or untouched: 0.

## Before opening the PR
- **CI readiness:** the repo has no CI; lint, typecheck, `pnpm test` (2025, on the third run under load; the reds were flakes outside the diff), the build and Playwright (66) are green at `e2433af`.
- **Commit hygiene:** this doc, `repro/review-11-repro.sh` and `repro/review-11-mutants.sh` are the only additions; nothing to drop.
- **Likely reviewer asks:** why the live cue waits on the fire event while a Go is pending (finding 1); #273's and #330's accepted look-alikes; the other-list Go stand-in (#328); the stem map change that rides on this branch; #140's install doc and acceptance run.

## Verdict
**Ready with follow-ups, once finding 1 lands.** 0 CRITICAL, 0 HIGH, 1 MEDIUM, 5 LOW. Finding 1 is a false pause on the producer's own first Go, with a one-line fix audited by execution (218 passed, the repro green); land it through `/pr-review-remediate` before the PR. Findings 2 to 4 are test strength and can land with it or as follow-ups; findings 5 and 6 are the carried tail, Nick's. The PR still waits on #140, which is Nick's.

## Remediation — 2026-11-06
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `d715230` setlist-controller#108 pre-PR review 11 finding 1: with no live cue, the producer's Go paused the lights when Eos named the cue active before its fire event | red→green: `sh docs/reviews/setlist-controller-108/repro/review-11-repro.sh` (f1 red at `7296824`, both green with the fixed `eos.ts`); the repro's two tests are in `test/eos.test.ts`'s describe "the fire event that answers the lights' own Go and Back" as "never pauses on the producer's Go with no live cue, answered with ..."; the guard reverted in a scratch worktree turns the active-first test red; `pnpm exec vitest run test/eos.test.ts test/fake-eos.test.ts` 220 passed; `pnpm typecheck`, `pnpm lint` clean; `pnpm test` 74 files, 2027 passed, 4 skipped | 0 new; the comment stating the rule (`src/server/eos.ts:365-369`) edited per the brief's Full surface | proved by execution (MEDIUM, proof executed, preserve suites green; no verify agent) |
| 2 (LOW) | — deferred | — | — | LOW tail, deferred to Nick (eng-pipeline#34) |
| 3 (LOW) | — deferred | — | — | LOW tail, deferred to Nick |
| 4 (LOW) | — deferred | — | — | LOW tail, deferred to Nick |
| 5 (LOW) | — deferred | — | — | LOW tail, deferred to Nick |
| 6 (LOW, comment hygiene) | — deferred | — | — | LOW tail, deferred to Nick |

Line-by-line audit of finding 1's diff: the guard moves the reconnect judgement behind `own.length > 0`. Eos's first packet sets the connection online before the burst's active cue (`src/server/eos.ts:626-636`; 8 ms apart in `connect.json`), so a command can be pending when that active cue comes. That drops nothing: `sendOwn` clears `before` and `beforeOwn` (`:228-229`), so with any command pending there is no kept cue left to judge, at HEAD as before the fix. The brief's Must preserve holds as written.

### Known regressions, deferred
- None.

### Rework briefs
- None; no rework pass ran.

## Approach decisions (remediation)
- The live cue from the active cue (#250, review 11 finding 1): the numbered active cue stands in for the live cue only while there is none and `own` is empty; with a command pending, its fire event places the live cue. Mirrors the review's recorded decision; `sendOwn` clearing the kept cues is what keeps the reconnect judgement untouched.
