# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `f0eab4b` "Merge pull request #270 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback")
**Reviewed at:** HEAD `74bd746` (setlist-controller#108 pre-PR review 7 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 62 files total, +11114 / -68 against the merge-base.
**Delta under review:** since `f478b66` (setlist-controller#273 Lights: the producer's Go or Back during a drop still pauses the lights in some press orders, and a follow can use up a Go), the commit pre-PR review 7 reviewed. The delta is 2 files, +308 / -0, both review artifacts: `docs/reviews/setlist-controller-108/pre-pr-review-7.md` (`51858a2`, with its closure table at `74bd746`) and `docs/reviews/setlist-controller-108/repro/review-7-repro.sh` (`51858a2`). `git diff --stat f478b66 HEAD -- src test e2e web scripts config` is empty: no code, test, fixture or config changed. Stage 2 round 2 of the sixth `/epic-loop` run, not `--fresh`.
**Reviewed against:** pre-PR review 7's findings, Approach decisions and closure table; the epic body of setlist-controller#108 as distilled there. The repo has no `CLAUDE.md` and no coding standards file, so the five shared review rules stand in for them.
**Date:** 2026-11-02
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | clean. `eslint.config.js` lints `**/*.{js,ts,tsx}`, so neither the `.sh` repro nor the `.md` docs are linted |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` (load 20 on 14 cores) | 73 files, 1850 passed, 4 skipped (the same 4 as reviews 4 to 7) |
| Build | `pnpm build` | built |
| Playwright | `pnpm exec playwright test`, after the build | 66 passed |
| Review 7 findings 1 to 3 still red at HEAD | `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh` | f1a, f1b, f2, f3 red (each on its assertion, not on the test timeout); the control green |
| Their attribution still holds | `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh 5813ba0` | f1a, f1b, f2 and the control green; f3 red, so it predates #273, as review 7 said |
| Review 7 locations at HEAD | finder over the delta: every `file:line` cited for findings 1 to 5 read at `74bd746` | all match, except two README citations off by one since review 7 was written (folded into finding 5) |
| The repro script itself | finder: insertion point, helpers in scope with matching signatures, the `-t 'review 7'` filter, the optional SHA argument, cleanup | sound; one brief error (finding 1's Proof) and five script nits (Minor) |
| Closure-table claims | `git diff --stat f478b66 51858a2`; finding severities | each claim holds |
| Test-quality audit | not run: the delta adds no tests | n/a |
| Real Eos for a cue edited at the console | not run: no ETCnomad here | carried in finding 1's brief |

**Overall:** nothing changed in code since review 7, every check is green, and review 7's five findings stand exactly as written at HEAD, re-proved by its repro. Review 7's remediation fixed none of them by design: finding 1 (MEDIUM) went to a split-ticket proposal and the four LOWs were deferred to Nick. This round adds no new defect. It corrects finding 1's Proof line, since the preserved f1b test cannot go green under the fix the brief recommends, and two citations in the comment hygiene list.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254, review 3 finding 1, #268, #271, #273): the cue Eos is on at connect is judged once against `before`, `beforeOwn` and the `firedAfter` chain of each. `beforeOwn` holds each unanswered fire's cue, and every cue Eos may be on after each unanswered Go or Back (`landsOn`), walked as a set over the unanswered commands in order from the live cue. Wrap, Go From Last and Back From First expect every outcome.
- Own-command accounting (#137, #138, #273): a fire event uses up the first pending own command that accounts for it, with every command before it. A Go or Back accounts only for a cue it fires from the live cue by the cue list as last read (`firesFrom`), never for a fire event the live cue's follow explains, and for any cue when the live cue cannot be placed. Own commands are pruned to the window on every packet from Eos. Any change to this goes through finding 1's split ticket (review 7 remediation, `74bd746`), never an in-place fix on this branch.
- Shadowed cues (#252, #258): the check never calls a cue that fires "never fires". The exemption is every cue that a follow or hang of any cue reaches, with the false negative #258 accepted.
- File check shape (#256 and the #84 merge): a name-matching target answers `FileCheck { unmatched, problems }`; problems render first, under "Problems:", and names under "Cannot match:".
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter. Row behaviour that needs effects to run is tested in Playwright (`e2e/lights.spec.ts`).

## Confirmed Issues
### 1. A cue added or deleted at the console since the last read makes the producer's own Go pause the lights by hand — MEDIUM
- **Location:** `src/server/eos.ts:310-316` (the matcher in `receive`), with `firesFrom` at `:403-410`
- **Attribution:** carried unchanged from pre-PR review 7 finding 1; known regression, deferred: its closure-table row reads "escalated: split ticket recommended (proposal in the run's stage 2 proposals), carrying findings 2 and 3 with it" (`74bd746`). Introduced by #273 (`08d1272` "setlist-controller#273 Lights: the producer's Go or Back during a drop still pauses the lights in some press orders, and a follow can use up a Go"); re-proved this round: f1a and f1b red at HEAD and green with `eos.ts` from `5813ba0`.
- **Real-world trigger:** Nick or the lighting designer records, renumbers or deletes a cue in the followed cue list at the console while the setlist server is connected (rehearsal, or building cues at home on Augment3d, epic user story 23), and does not press Refresh. The producer's next Go on the lights row reads "Paused by hand", and the lights stop following until armed again. MEDIUM: visible and recoverable, fires no wrong look, but breaks a clean rehearsal under the epic's trust gate (user story 26).
**Evidence**
```ts
      const command = answers((command) => {
        if (typeof command === 'object') return command.cue === number;
        if (followed) return false;
        return !placed(from) || firesFrom(command, from).includes(number);
      });
      if (typeof command === 'object' && command !== null) reporter?.actedOn(command.handed);
      if (!command && !followed) reporter?.changedByHand();
```
`firesFrom` reads `cues`, which only `finish` (`:427-432`) replaces, after a read started on connect, Refresh or a change of the set. No packet Eos sends on a cue edit is handled or recorded.
**Failure mode** — list as read 1, 2, 3, 3.5, 4, 5, 6, 7, 8, live cue 3. Cue 3.7 is added at the console; the producer's Go fires 3.7; `firesFrom('go', '3')` is `['3.5']`, so the Go accounts for nothing and `changedByHand()` runs. Likewise when 3.5 is deleted and the Go fires 4. Proved this round: `review 7 f1a` and `review 7 f1b` fail on `neverPaused` ("expected false to be true") at `74bd746`; `review 7 control` passes.
**Recommended fix** — unchanged from review 7: a split ticket under #108, not an in-place fix. The ticket (1) records on Augment3d, with `scripts/eos/record-eos-fixtures.py`, what Eos sends when a cue of the followed list is recorded, deleted or relabelled at the console (whether `/eos/out/notify/cue/<list>/...` comes, and its arguments), at #140's session; (2) if Eos notifies, has `receive` start `readCues()` on that notify, joining a read in flight; (3) whether or not it does, has a fire event of a cue not in the list as last read start `readCues()` and let a pending Go or Back account for it as for an unplaced live cue:
```diff
-        return !placed(from) || firesFrom(command, from).includes(number);
+        return !placed(from) || !placed(number) || firesFrom(command, from).includes(number);
```
plus `if (!placed(number)) void readCues();` after `showLines()` in the same branch. Step 3 covers an added cue (f1a); a deleted cue (f1b) is covered only by step 2.
**Remediation brief**
- **Design intent:** a fire event is the lights' own when it answers one of their own commands, or when the live cue's follow or hang explains it; anything else is a change by hand and pauses an armed target. A Go or Back carries no cue number, so what it can answer is predicted from the cue list as last read, re-read only on connect, Refresh and a change of the set (`check`). The prediction is only as good as that list.
- **Full surface:** `src/server/eos.ts:310-316` (the matcher), `:395` (`placed`), `:403-410` (`firesFrom`), `:418-426` (`landsOn`, same list for the reconnect walk), `:231-251` (`readCues`), `:268-294` (the `receive` comment), `:574-586` (the `buttons` comment); `test/fake-eos.ts` (a way to edit the fake's show and keep its current cue: today `setShow` resets `current` to null, `test/fake-eos.ts:371`, and the fake sends no notify); `test/eos.test.ts` describe "the fire event that answers the lights' own Go and Back" (`:2070`); `test/fixtures/eos/README.md` for the new recording.
- **Must preserve:** `test/eos.test.ts:2086` "pauses for a cue fired at the console just after a Go from the last cue", `:2071` "never pauses when the live cue's follow event comes after a Go was sent", `:2096` (Wrap), `:2108` (the fire of cue 0 after a Back on the first cue), `:1164` and `:1186` (stop and resume use up a Back and a Go), and every case of describe "the lights' own Go and Back whose fire event a drop eats" (`:1829`). A read in flight must still keep the old list until it ends (`:227-230`).
- **Do not touch:** the fallback for an unplaced live cue (#273 assumption, kept); the end-of-list outcomes (Reviewed and Dismissed).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh`. `review 7 f1a` is red now and must be green after step 3; `review 7 control` green before and after. **Correction to review 7:** `review 7 f1b` as preserved cannot go green under step 2. It emits only `/eos/out/event/cue/1/4/fire` (`repro/review-7-repro.sh:37`), never a notify, and it leaves the fake's show unedited, so any re-read still answers with the list that holds 3.5. The split ticket rewrites f1b once step 1's recording exists: edit the fake's show to delete 3.5 while keeping its current cue, have the fake send the recorded notify, then press Go and expect no pause. Unverified: step 3's `void readCues()` in f1a re-reads the fake's unedited list during `rig.shows`; the ticket checks f1a stays green with that read in flight.
- **Escalation:** the seventh rework of the own-command accounting and reconnect judgement (#254, review 3, #268, #271, #273, now this), and the fix depends on an unrecorded Eos behaviour, so a split ticket rather than another in-place fix. Review 7's remediation already escalated it (`74bd746`); `/pr-review-remediate` refuses it on this branch.

### 2. A Go that fires the cue the live cue follows on to stays pending, and hides a cue fired at the console in the next second — LOW
- **Location:** `src/server/eos.ts:302` and `:312`
- **Attribution:** carried unchanged from pre-PR review 7 finding 2 (closure: "deferred ... the review routes it to finding 1's split ticket"). Introduced by #273 (`08d1272`, bounded to the window by `9295f85` "setlist-controller#273 review pass 1 finding 1: a Go whose fire event is the live cue's follow cue is never used up, so a later drop keeps it"); `review 7 f2` red at HEAD, green with `eos.ts` from `5813ba0`, re-proved this round.
- **Real-world trigger:** the live cue has a follow time, the producer presses Go during the follow's wait (Eos fires the follow's cue for the Go), and the operator fires the cue after it at the console within 1 s. Capped at LOW: upgrade if #140's rehearsals show producers pressing Go on follow cues.
**Evidence**
```ts
      const followed = firesNext(from) === number;
...
        if (followed) return false;
        return !placed(from) || firesFrom(command, from).includes(number);
```
**Failure mode** — cue 3 follows on to 3.5. Go fires 3.5; the event is `followed`, so the Go is not used up. A console fire of 4 then meets `firesFrom('go', '3.5') = ['4']`, the Go answers it, and the lights stay armed. Proved: `review 7 f2` fails its `vi.waitFor` with the row on "Live cue 4", `arm: 'armed'`, `pause: null`.
**Recommended fix** — in finding 1's split ticket, since it changes the same matcher. When a `followed` fire event comes and the oldest pending command is a Go or Back whose `firesFrom` from the live cue before the event includes that cue, use it up as well. The cost is review 6's f2a order (the follow fires first, then the Go fires the cue after it), which `test/eos.test.ts:2071` pins; the ticket keeps that test green, for example by using the Go up only when no fire event of `firesFrom('go', number)` follows within the window, or Nick accepts the narrower case.
**Remediation brief**
- **Design intent:** a Go or Back is used up by the one fire, stop or resume event that answers it. A follow event and a Go's event of the same cue cannot be told apart from the event alone.
- **Full surface:** `src/server/eos.ts:296-317`, `:199-202` (`forgetUnanswered`), `:518-526` (the close-time walk keeps a pending Go's cues); `test/eos.test.ts:2070` describe.
- **Must preserve:** `test/eos.test.ts:2071` (f2a), `:1930`, and the window pruning from `9295f85`.
- **Do not touch:** the 1000 ms window itself (`OWN_COMMAND_WINDOW_MS`).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh`, `review 7 f2` red now, green after, with `test/eos.test.ts:2071` still green.

### 3. A Go on the last cue that fires nothing takes the fire event of a later fire by number — LOW
- **Location:** `src/server/eos.ts:207-213` (`answers` takes the first command that accounts) with `:407` (`firesFrom('go', last)` is `[first]`, Wrap)
- **Attribution:** carried unchanged from pre-PR review 7 finding 3 (closure: deferred, routed to finding 1's split ticket). Introduced by this branch before #273 (the first-accounting rule of #137 and #138, `189b9ad` and `fd81a10`); `review 7 f3` red at HEAD and with `eos.ts` from `5813ba0`, re-proved this round.
- **Real-world trigger:** live cue is the last cue, the producer presses Go (Go From Last fires nothing), within 1 s the lights fire the first cue by number (Fire again, Play from start or a jump into song 1's Intro), then the operator fires that cue at the console within the next second. Capped at LOW: three actions inside two seconds.
**Evidence**
```ts
    const at = own.findIndex(({ command }) => accounts(command));
    if (at < 0) return null;
    const { command } = own[at]!;
    own = own.slice(at + 1);
```
**Failure mode** — `own` is [Go, fire 1]. Fire event 1 meets the Go first (1 is Wrap's outcome), uses it up and leaves `fire 1` pending, so `actedOn` never runs; a console fire of 1 then answers `fire 1`. Proved: `review 7 f3` fails its `vi.waitFor`, still armed.
**Recommended fix** — in the matcher, prefer a pending fire by number of that cue over an earlier Go or Back that accounts for it only by an end-of-list outcome. Goes in finding 1's split ticket.
**Remediation brief**
- **Design intent:** Eos answers in command order, so when a fire by number's event comes, every earlier Go or Back has had whatever answer it gets.
- **Full surface:** `src/server/eos.ts:207-213`, `:310-314`, `:403-410`.
- **Must preserve:** `test/eos.test.ts:2096` (Wrap's first cue answers a Go on the last cue) and `:2086`.
- **Do not touch:** the end-of-list outcomes (Reviewed and Dismissed).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh`, `review 7 f3` red now, green after.

### 4. The Playwright Go and Back test's arm assertion cannot go red (carried from pre-PR reviews 6 and 7) — LOW
- **Location:** `e2e/eos.spec.ts:44-45`
- **Attribution:** introduced by `0499d70` (setlist-controller#137 Lights manual buttons: Go and Back); unchanged since review 6; review 7 finding 4, deferred to Nick.
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

### 5. Comment hygiene — LOW (aggregated)
Carried from pre-PR review 7 finding 5, every entry still as written at `74bd746`, with two citations corrected (review 7 cited `README.md:94` and `:33`, which are blank lines; the text sits at `:93` and `:32`, at `f478b66` as at HEAD) and one length figure corrected.
- `src/server/eos.ts:583-585` — "the fire or stop event that answers one is the lights' own" → "the fire, stop or resume event that answers one is the lights' own".
- `src/server/eos.ts:276-278` — "and a Go that fires nothing never hides a cue fired at the console" → "and a Go that fires nothing hides no cue fired at the console but one that Wrap, Go From Last or Back From First could fire".
- `src/server/eos.ts:203-206` — "The one of the lights' own commands sent within the window that an event answers" → "The first of the lights' own commands still in own, which receive has pruned to the window, that accounts for the event".
- `src/server/eos.ts:23`, `:174`, `:290` — #273's edits left lines of 108, 111 and 106 characters in 100-column blocks → rewrap.
- `test/start-up.test.ts:35` — "The fake kind's section good, and the lights' with no host and cue list 0." → "A section for \"fake\", a kind this server does not know, and the lights' with no host and cue list 0." (`src/server/start-up.ts:46-50` registers no fake kind).
- `test/eos.test.ts:1561` — "never pauses on a follow whose active cue Eos sends before its fire event, as recorded" → drop "as recorded": `fire-follow-chain.json` shows the active cue first only for the app's fire of 99/1.
- `test/fixtures/eos/README.md:93` — "The active cue can come before its fire event: ... or a follow would be judged against itself." → "On the app's fire of 99/1 the active cue came before its fire event (64 ms, then 77 ms); on each cue Eos fired by itself the fire event came first (99/2 at 1014 ms, its active cue at 1022 ms)."
- `test/fixtures/eos/README.md:64` — "Every fire, from the app or by hand, gives ... then the previous, active and pending cue." → "Every fire from the app gives ... then the previous, active and pending cue (the active cue can come first; see Follows and links); the recorded fire by hand (`fire-by-hand.json`) ends at its fire event and softkeys."
- `test/fixtures/eos/README.md:32` — "the build's `Record Cue 1 / 7 Part 2` gave no error" → "a `Record Cue 1 / 7 Part 2` sent by hand gave no error" (`scripts/eos/build-eos-test-show.py` holds no such command).
- `test/fake-eos.ts:70-71` (the `follow` doc) — "gets its fire event alone" → "gets only its fire event; Eos also sends the previous, active and pending cue and the command line after it (fire-follow-chain.json), which the fake leaves out".
- `web/src/styles.css:830` — "The list is capped at about eight lines" → "The list is capped at 15rem, about eleven lines".
- `web/src/ConnectionsPanel.tsx:19-20` and `:98-99` — lines of 143 and 150 characters → rewrap at 100.
- `test/fake-eos.ts:49-50`, `test/fixtures/eos/README.md:10`, `test/osc-tcp.test.ts:9-10` — the three entries of pre-PR review 6 finding 5, still open as written there.

## Needs Further Investigation
### A. A link to a cue in another list is kept as a raw string and read as a cue number of this list — confirm by recording a cue linked to another list on Augment3d
Carried from pre-PR reviews 6 and 7, unchanged: `src/server/eos.ts:113` and `firesNext` (`:364-369`).

### B. `e2e/lights.spec.ts:93-101` may race the list's own scroll effect — confirm by running the spec 50 times under load
Carried from reviews 6 and 7, with the two layout risks review 7 added (`:128-129` box tops with no tolerance, `:83` on the Pixel 7 viewport). Confirm with `pnpm exec playwright test e2e/lights.spec.ts --repeat-each 50` while `pnpm test` runs; kill with 50 clean runs.

### C. A fire by number that races the live cue's follow onto the same cue may pause the lights — confirm on Augment3d whether Eos sends two fire events
Carried from pre-PR review 1 B. If Eos sends the follow's event and the fire's event for 3.5, the first uses up the fire and the second pauses (`:311`).

## Reviewed and Dismissed
- A red f2 or f3 fails on the 5000 ms test timeout rather than its `vi.waitFor` (finder F9) — executed this round: both fail with `AssertionError` from the `vi.waitFor` at about 3030 to 3075 ms.
- The repro writes outside the worktree, against the guardrail (finder F6) — it writes only to `$TMPDIR`, the git common dir's `worktrees/` entry it removes on exit, and vitest's cache through the `node_modules` symlink (`node_modules/.vite`, untracked and ignored). No tracked file of the live worktree is touched; run it with `TMPDIR` set to a scratchpad to keep the worktree outside the repo's parent.
- Review 7's closure-table claims — each verified: `git diff --stat f478b66 51858a2` touches only the doc and the repro, and finding 1 was the only MEDIUM in scope.
- Everything pre-PR review 7 dismissed, unchanged: a Go or fire between a reconnect's first packet and its active cue ends the judgement; a 1 s event-loop stall; Go and Back's addresses; `releaseFires()` while silenced; the end-of-list outcomes; `stop()` leaving `before` and `beforeOwn`; unanswered fires kept at close; no maximum packet length in `osc-tcp.ts`; `src/server/connections.ts:285`; README and `docs/install.md` silent on the lights (#140); the 4 skipped tests; every producer message carrying the cue list; `config/stem-map.json` (`a058b27`).

## Minor / nits
- `docs/reviews/setlist-controller-108/repro/review-7-repro.sh:22` — the cleanup trap is on `EXIT` only, so under dash (`/bin/sh` on Debian and Ubuntu) a TERM or HUP leaves the scratch worktree; on this Mac `sh` is bash and runs it. The same shape as every earlier repro in this folder (finder F2).
- `:22` — a failed `worktree remove` is silenced and the directory then deleted, leaving a prunable worktree entry; `git worktree prune` in the trap would clear it (finder F3).
- `:23` — a failed `worktree add` exits 128 with no message, since its stderr goes to `/dev/null` (finder F4).
- `:20` — the repo root comes from the caller's cwd, not the script's location; run elsewhere it stops at "insertion point not found" (finder F5).
- Every Minor item of pre-PR review 7 stands as written there (`e2e/lights.spec.ts:70`, `test/osc-tcp.test.ts` zero-length packet, `web/src/ConnectionsPanel.tsx:110`, the fake's Go and Back answers and connect burst, `test/eos-recording-scripts.test.ts:29-43`, the recording scripts' hand-run defects, `scripts/eos/__pycache__/`, `test/fake-eos.ts:325`).

## Test quality
Branch delta adds no tests: since `f478b66` only the review doc and its repro changed, so the tautology audit did not run. Pre-PR review 7's Test quality section stands for the branch: one tautology shape (`test/eos-recording-scripts.test.ts:266`), one weak test (`test/eos.test.ts:1993`), and one surviving mutant (m13, `placed` on cue 0), each with its strengthening recorded there.

## Prior-review closure
Pre-PR review 7 (`51858a2`, reviewed at `f478b66`, closure table `74bd746`) had 1 MEDIUM and 4 LOW findings. Fully fixed: 0. Partially fixed: 0. Untouched: 5, all by decision. Finding 1 (MEDIUM) was escalated to a split ticket ("escalated: split ticket recommended"), and is re-emitted here as finding 1, with its Proof corrected. Findings 2 and 3 (LOW) were deferred to Nick and routed to that ticket; findings 4 and 5 (LOW) were deferred to Nick. Each is re-emitted here as the same number. None was "resolved" by editing a comment or doc. No MEDIUM-or-higher prior finding is open other than by that escalation.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and the build are green at `74bd746`; Playwright is green locally (66).
- **Commit hygiene:** this doc is the only addition; nothing to drop. `repro/review-7-repro.sh` stays as finding 1's split ticket's red proof.
- **Likely reviewer asks:** why a stale cue list pauses the lights on a Go (finding 1, with Refresh as the workaround); the stem map change that rides on this branch; #140's install doc and acceptance run.

## Verdict
**Ready to open a PR, with follow-ups.** 0 CRITICAL, 0 HIGH, 1 MEDIUM and 4 LOW, every one carried unchanged from pre-PR review 7; nothing new. The code is identical to what review 7 reviewed, so the Confirmed count holding at 5 is the same list re-proved, not new findings.
- Finding 1 (MEDIUM, introduced by #273) is the only gate for a clean round, and it is already escalated to a split ticket under #108 by decision, carrying findings 2 and 3, with its recording at #140's Augment3d session. Another stage 2 round on this branch cannot close it: the next useful step is filing that ticket. Until it lands, press Refresh after any change to the cue list at the console.
- Findings 4 and 5 can land through `/pr-review-remediate` or as follow-ups.
- The PR still waits on #140, which is Nick's.
