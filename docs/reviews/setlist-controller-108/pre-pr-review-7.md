# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `f0eab4b` "Merge pull request #270 from nick-vogel/setlist-controller-84-propresenter-slides-follow-playback")
**Reviewed at:** HEAD `f478b66` (setlist-controller#273 Lights: the producer's Go or Back during a drop still pauses the lights in some press orders, and a follow can use up a Go), clean tree: 0 files with uncommitted changes, 0 untracked; 60 files total, +10806 / -68 against the merge-base. Of those, 14 are pre-PR reviews 1 to 6 and their repros, and 19 are Eos recordings and their README under `test/fixtures/eos/`.
**Delta under review:** none; a fresh review of the whole working surface (`--fresh`, stage 2 round 1 of the sixth `/epic-loop` run). New since pre-PR review 6 (`16465d9`): the stem map change (`a058b27`), #274 (`224d634`), #259 (`5813ba0`) and #273 (`08d1272`, `9295f85`, merged as `f478b66`).
**Reviewed against:** the epic body of setlist-controller#108 and the bodies of #259, #271, #273 and #274; #273's and #274's recorded assumptions; the Approach decisions, Needs Further Investigation and Reviewed and Dismissed sections of pre-PR review 6. The repo has no `CLAUDE.md` and no coding standards file, so the five shared review rules stand in for them.
**Date:** 2026-11-02
**Reviewer:** 3 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test` | 73 files, 1850 passed, 4 skipped (the same 4 as reviews 4 to 6) |
| Build | `pnpm build` | built |
| Playwright | `pnpm exec playwright test`, after the build | 66 passed |
| Adapter core | finder A over `src/server/eos.ts` and `test/eos.test.ts`, with throwaway tests through `lightsRig` in a scratch worktree, each beside a control | 6 candidates, 4 executed red |
| Server glue, row, docs, e2e, stem map | finder B over the other server, web, e2e and doc files, read only | 12 candidates, none above LOW |
| Fake Eos, recordings, recording scripts | finder C over `test/fake-eos.ts`, `test/fake-eos.test.ts`, `test/fixtures/eos/`, `scripts/eos/`, `test/eos-recording-scripts.test.ts`; both test files run in a scratch worktree (20 passed); Python probes | 17 candidates, none above LOW |
| Findings 1 to 3 | `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh`, five tests inserted in a scratch worktree at HEAD | f1a, f1b, f2, f3 red; the control green |
| Attribution of findings 1 to 3 | the same script with `eos.ts` from `5813ba0`: `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh 5813ba0` | f1a, f1b, f2 green there, so #273 introduced them; f3 red there too, so it predates #273 |
| Recorded orders the fake and README claim | `fire-follow-chain.json` read directly | every cue Eos fired by itself sent its fire event before its active cue; only the app's fire of 99/1 sent the active cue first (comment hygiene) |
| Go and Back addresses | `go.json`, `back.json` | `/eos/cues/1/fire` and `/eos/cues/1/stop` are what Eos was sent and answered |
| Base and per-ticket oracle | test-audit agent: HEAD's tests at `f0eab4b`, `5813ba0`, `a058b27` and `224d634` in scratch worktrees | see Test quality: 3 weak tests, none to delete |
| Mutation of #273's code | test-audit agent: 14 mutants of `src/server/eos.ts:201-524`, one at a time, against `test/eos.test.ts` and `test/fake-eos.test.ts` | 13 killed, 1 survives (m13, `placed` on cue 0) |
| Real Eos for a cue edited at the console while the lights are connected | not run: no ETCnomad here | recorded in finding 1's brief |

**Overall:** every check is green, and #273 does what its acceptance criteria ask in the cases its tests drive. But #273 narrowed which fire events a Go or Back can answer, to the cues it can fire by the cue list as last read. Since the list is read only on connect, Refresh and a change of the set, a cue added or deleted at the console since then makes the producer's own Go pause the lights by hand (finding 1, MEDIUM, introduced by #273). The same narrowing leaves a Go that fired the followed cue pending, which then hides a cue fired at the console within the next second (finding 2, LOW). Finding 1 is the seventh rework of the own-command accounting, so it goes to a split ticket with a recording, not an in-place fix.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254, review 3 finding 1, #268, #271, #273): the cue Eos is on at connect is judged once against `before`, `beforeOwn` and the `firedAfter` chain of each. `beforeOwn` holds each unanswered fire's cue, and every cue Eos may be on after each unanswered Go or Back (`landsOn`), walked as a set over the unanswered commands in order from the live cue. Wrap, Go From Last and Back From First expect every outcome.
- Own-command accounting (#137, #138, #273): a fire event uses up the first pending own command that accounts for it, with every command before it. A Go or Back accounts only for a cue it fires from the live cue by the cue list as last read (`firesFrom`), never for a fire event the live cue's follow explains, and for any cue when the live cue cannot be placed. Own commands are pruned to the window on every packet from Eos. This review finds that the narrowing depends on a list that can be stale (finding 1); the remedy goes to a split ticket, since it changes what a Go accounts for again.
- Shadowed cues (#252, #258): the check never calls a cue that fires "never fires". The exemption is every cue that a follow or hang of any cue reaches, with the false negative #258 accepted.
- File check shape (#256 and the #84 merge): a name-matching target answers `FileCheck { unmatched, problems }`; problems render first, under "Problems:", and names under "Cannot match:".
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter. Row behaviour that needs effects to run is tested in Playwright (`e2e/lights.spec.ts`).

## Confirmed Issues
### 1. A cue added or deleted at the console since the last read makes the producer's own Go pause the lights by hand — MEDIUM
- **Location:** `src/server/eos.ts:310-316` (the matcher in `receive`), with `firesFrom` at `:403-410`
- **Attribution:** introduced by #273 (`08d1272` "setlist-controller#273 Lights: the producer's Go or Back during a drop still pauses the lights in some press orders, and a follow can use up a Go"). Before it, a Go or Back accounted for a fire event of any cue (`git show 5813ba0:src/server/eos.ts`, "Go and Back for any, since Eos picks the cue"), and f1a and f1b pass with that file. The stale list itself predates #273 (the follow rule of #138 reads the same list), but #273 extends its reach to the two buttons.
- **Real-world trigger:** Nick, or the lighting designer, records, renumbers or deletes a cue in the cue list at the console while the setlist server is connected, during a rehearsal or while building cues at home on Augment3d (epic user story 23), and does not press Refresh. The producer then presses Go on the lights row. The row reads "Paused by hand" though nobody fired anything at the console, and the lights stop following until the producer arms them again. Severity sits at MEDIUM because the pause is visible and recoverable and fires no wrong look; it also breaks a clean rehearsal under the epic's trust gate (user story 26).
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
`firesFrom('go', '3')` reads `cues`, which only `finish` (`:427-432`) replaces, after a read started on connect, Refresh or a change of the set. No packet Eos sends on a cue edit is handled, and none is recorded (`grep -l notify test/fixtures/eos/*.json` finds nothing).
**Failure mode** — the list as read is 1, 2, 3, 3.5, 4, 5, 6, 7, 8, and the live cue is 3. Cue 3.7 is added at the console. The producer presses Go; Eos fires 3.7. `placed('3')` is true, `firesFrom('go', '3')` is `['3.5']`, so the Go accounts for nothing and `changedByHand()` runs. The same follows when 3.5 is deleted and the Go fires 4. Proved: `review 7 f1a` and `review 7 f1b` in `repro/review-7-repro.sh` fail at `neverPaused` ("expected false to be true") at HEAD; `review 7 control` (Eos fires 3.5) passes; with `eos.ts` from `5813ba0` all three pass.
**Recommended fix** — not an in-place fix: a split ticket for Nick, since it changes what a Go accounts for for the third time in a row and trades against #273's acceptance criterion 3 ("a Go that fires nothing never hides a cue fired at the console"). The ticket should:
1. Record, on Augment3d with the lights connected, what Eos sends when a cue of the followed list is recorded, deleted or relabelled at the console (whether `/eos/out/notify/cue/<list>/...` comes, and with what arguments), into `test/fixtures/eos/` with `scripts/eos/record-eos-fixtures.py`. It fits #140's session.
2. If Eos notifies, have `receive` start `readCues()` on that notify, so the list is never stale for long; a read already in flight is joined.
3. Whether or not it does, a fire event of a cue not in the list as last read starts `readCues()`, and a pending Go or Back accounts for it as for an unplaced live cue:
```diff
-        return !placed(from) || firesFrom(command, from).includes(number);
+        return !placed(from) || !placed(number) || firesFrom(command, from).includes(number);
```
plus `if (!placed(number)) void readCues();` after `showLines()` in the same branch. That covers an added cue (f1a). A deleted cue (f1b) is covered only by step 2.
**Remediation brief**
- **Design intent:** a fire event is the lights' own when it answers one of their own commands, or when the live cue's follow or hang explains it; anything else is a change by hand and pauses an armed target. A Go or Back carries no cue number, so what it can answer is predicted from the cue list as last read, which the adapter re-reads only on connect, Refresh and a change of the set (`check`). The prediction is only as good as that list.
- **Full surface:** `src/server/eos.ts:310-316` (the matcher), `:395` (`placed`), `:403-410` (`firesFrom`), `:418-426` (`landsOn`, same list for the reconnect walk), `:231-251` (`readCues`), `:268-294` (the `receive` comment), `:574-586` (the `buttons` comment); `test/fake-eos.ts` (a way to edit the fake's show and keep its current cue, so a test need not emit the event by hand); `test/eos.test.ts` describe "the fire event that answers the lights' own Go and Back" (`:2070`); `test/fixtures/eos/README.md` for the new recording.
- **Must preserve:** `test/eos.test.ts:2086` "pauses for a cue fired at the console just after a Go from the last cue", `:2071` "never pauses when the live cue's follow event comes after a Go was sent", `:2096` (Wrap), `:2108` (the fire of cue 0 after a Back on the first cue), `:1164` and `:1186` (stop and resume use up a Back and a Go), and every case of describe "the lights' own Go and Back whose fire event a drop eats" (`:1829`). A read in flight must still keep the old list until it ends (`:227-230`).
- **Do not touch:** the fallback for an unplaced live cue (#273 assumption, kept); the end-of-list outcomes (Reviewed and Dismissed).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh`: `review 7 f1a` red now, green after step 3; `review 7 f1b` green only once step 2 lands; `review 7 control` green before and after.
- **Escalation:** the seventh rework of the own-command accounting and reconnect judgement (#254, review 3, #268, #271, #273, now this), and the fix depends on an unrecorded Eos behaviour, so recommend a split ticket rather than another in-place fix.

### 2. A Go that fires the cue the live cue follows on to stays pending, and hides a cue fired at the console in the next second — LOW
- **Location:** `src/server/eos.ts:302` and `:312`
- **Attribution:** introduced by #273 (`08d1272`, with `9295f85` "setlist-controller#273 review pass 1 finding 1: a Go whose fire event is the live cue's follow cue is never used up, so a later drop keeps it", which bounded it to the window). `review 7 f2` passes with `eos.ts` from `5813ba0`. #273's assumption names that such a Go stays pending, not that it hides a console fire.
- **Real-world trigger:** the live cue has a follow time, the producer presses Go during the follow's wait (Eos fires the follow's cue for the Go), and the operator fires the cue after it at the console within 1 s. Rare: both presses have to land within the window. On a silent drop in that second, the hidden cue is also kept for the reconnect (`landsOn('go', '3.5')` holds 4). Capped at LOW: upgrade if #140's rehearsals show producers pressing Go on follow cues.
**Evidence**
```ts
      const followed = firesNext(from) === number;
...
        if (followed) return false;
        return !placed(from) || firesFrom(command, from).includes(number);
```
**Failure mode** — cue 3 follows on to 3.5. Go fires 3.5; the event is `followed`, so the Go is not used up. A console fire of 4 then meets `firesFrom('go', '3.5') = ['4']`, the Go answers it, and the lights stay armed. Proved: `review 7 f2` times out with the row on "Live cue 4", `arm: 'armed'`, `pause: null`.
**Recommended fix** — goes in finding 1's split ticket, since it changes the same matcher. When a `followed` fire event comes and the oldest pending command is a Go or Back whose `firesFrom` from the live cue before the event includes that cue, use it up as well, so the Go cannot answer a later event. The cost is review 6's f2a order (the follow fires first, then the Go fires the cue after it), which `test/eos.test.ts:2071` pins; the ticket must keep that test green, for example by using the Go up only when no fire event of `firesFrom('go', number)` follows within the window, or Nick accepts the narrower case.
**Remediation brief**
- **Design intent:** a Go or Back is used up by the one fire, stop or resume event that answers it. A follow event and a Go's event of the same cue cannot be told apart from the event alone.
- **Full surface:** `src/server/eos.ts:296-317`, `:199-202` (`forgetUnanswered`), `:518-526` (the close-time walk keeps a pending Go's cues); `test/eos.test.ts:2070` describe.
- **Must preserve:** `test/eos.test.ts:2071` (f2a), `:1930` and the window pruning from `9295f85`.
- **Do not touch:** the 1000 ms window itself (`OWN_COMMAND_WINDOW_MS`).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh`, `review 7 f2` red now, green after, with `test/eos.test.ts:2071` still green.

### 3. A Go on the last cue that fires nothing takes the fire event of a later fire by number — LOW
- **Location:** `src/server/eos.ts:207-213` (`answers` takes the first command that accounts) with `:407` (`firesFrom('go', last)` is `[first]`, Wrap)
- **Attribution:** introduced by this branch before #273 (the first-accounting rule of #137 and #138, `189b9ad` and `fd81a10`); `review 7 f3` is red with `eos.ts` from `5813ba0` as well. #273 kept it by adding Wrap's outcome.
- **Real-world trigger:** the live cue is the last cue, the producer presses Go (with the default Go From Last it fires nothing), then within 1 s the lights fire the first cue by number (Fire again, Play from start or a jump into song 1's Intro), then the operator fires that same cue at the console within the next second. The first cue's lateness goes out null, and the console fire is hidden. Capped at LOW: it needs three actions inside two seconds.
**Evidence**
```ts
    const at = own.findIndex(({ command }) => accounts(command));
    if (at < 0) return null;
    const { command } = own[at]!;
    own = own.slice(at + 1);
```
**Failure mode** — `own` is [Go, fire 1]. Fire event 1 meets the Go first (1 is Wrap's outcome), uses it up and leaves `fire 1` pending, so `actedOn` never runs; a console fire of 1 then answers `fire 1`. Proved: `review 7 f3` times out still armed.
**Recommended fix** — in the matcher, prefer a pending fire by number of that cue over an earlier Go or Back that accounts for it only by an end-of-list outcome. Goes in finding 1's ticket, which rewrites the same matcher.
**Remediation brief**
- **Design intent:** Eos answers in command order, so when a fire by number's event comes, every earlier Go or Back has had whatever answer it gets.
- **Full surface:** `src/server/eos.ts:207-213`, `:310-314`, `:403-410`.
- **Must preserve:** `test/eos.test.ts:2096` (Wrap's first cue answers a Go on the last cue) and `:2086`.
- **Do not touch:** the end-of-list outcomes (Reviewed and Dismissed).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh`, `review 7 f3` red now, green after.

### 4. The Playwright Go and Back test's arm assertion cannot go red (carried from pre-PR review 6 finding 3) — LOW
- **Location:** `e2e/eos.spec.ts:44-45`
- **Attribution:** introduced by `0499d70` (setlist-controller#137 Lights manual buttons: Go and Back); unchanged since review 6.
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
- `src/server/eos.ts:583-585` — "the fire or stop event that answers one is the lights' own" → "the fire, stop or resume event that answers one is the lights' own".
- `src/server/eos.ts:276-278` — "and a Go that fires nothing never hides a cue fired at the console" → "and a Go that fires nothing hides no cue fired at the console but one that Wrap, Go From Last or Back From First could fire".
- `src/server/eos.ts:203-206` — "The one of the lights' own commands sent within the window that an event answers" → "The first of the lights' own commands still in own, which receive has pruned to the window, that accounts for the event".
- `src/server/eos.ts:23`, `:174`, `:290` — #273's edits left lines of 108 to 111 characters in 100-column blocks → rewrap.
- `test/start-up.test.ts:35` — "The fake kind's section good, and the lights' with no host and cue list 0." → "A section for \"fake\", a kind this server does not know, and the lights' with no host and cue list 0." (`src/server/start-up.ts:46-50` registers no fake kind).
- `test/eos.test.ts:1561` — "never pauses on a follow whose active cue Eos sends before its fire event, as recorded" → drop "as recorded": `fire-follow-chain.json` shows the active cue first only for the app's fire of 99/1; every cue Eos fired by itself sent its fire event first (99/2 at 1014 ms, its active cue at 1022 ms).
- `test/fixtures/eos/README.md:94` — "The active cue can come before its fire event: ... or a follow would be judged against itself." → "On the app's fire of 99/1 the active cue came before its fire event (64 ms, then 77 ms); on each cue Eos fired by itself the fire event came first (99/2 at 1014 ms, its active cue at 1022 ms)."
- `test/fixtures/eos/README.md:64` — "Every fire, from the app or by hand, gives ... then the previous, active and pending cue." → "Every fire from the app gives ... then the previous, active and pending cue (the active cue can come first; see Follows and links); the recorded fire by hand (`fire-by-hand.json`) ends at its fire event and softkeys." (carried from review 6).
- `test/fixtures/eos/README.md:33` — "the build's `Record Cue 1 / 7 Part 2` gave no error" → "a `Record Cue 1 / 7 Part 2` sent by hand gave no error" (`scripts/eos/build-eos-test-show.py` holds no such command).
- `test/fake-eos.ts:70-71` (the `follow` doc) — "gets its fire event alone" → "gets only its fire event; Eos also sends the previous, active and pending cue and the command line after it (fire-follow-chain.json), which the fake leaves out".
- `web/src/styles.css:830` — "The list is capped at about eight lines" → "The list is capped at 15rem, about eleven lines" (carried from reviews 2, 5 and 6).
- `web/src/ConnectionsPanel.tsx:19-20` and `:98-99` — lines of 143 and 150 characters → rewrap at 100 (carried from reviews 5 and 6).
- `test/fake-eos.ts:49-50`, `test/fixtures/eos/README.md:10`, `test/osc-tcp.test.ts:9-10` — the three entries of pre-PR review 6 finding 5, still open as written there.

## Needs Further Investigation
### A. A link to a cue in another list is kept as a raw string and read as a cue number of this list — confirm by recording a cue linked to another list on Augment3d
Carried from pre-PR review 6, unchanged: `src/server/eos.ts:113` and `firesNext` (`:364-369`).

### B. `e2e/lights.spec.ts:93-101` may race the list's own scroll effect — confirm by running the spec 50 times under load
Carried from pre-PR review 6. Finder B adds two layout risks in the same spec, both unexecuted: `:128-129` compares box tops with no tolerance on fractional line heights, and `:83` may lose the first song from view on the Pixel 7 viewport under a long "Cannot match:" list. Confirm with `pnpm exec playwright test e2e/lights.spec.ts --repeat-each 50` while `pnpm test` runs; kill with 50 clean runs.

### C. A fire by number that races the live cue's follow onto the same cue may pause the lights — confirm on Augment3d whether Eos sends two fire events
Carried from pre-PR review 1 B. If Eos sends the follow's event and the fire's event for 3.5, the first uses up the fire and the second pauses (`:311`). Confirm by firing a cue by number during the wait of the follow that fires it.

## Reviewed and Dismissed
- A Go or fire sent between a reconnect's first packet and its active cue ends the judgement (finder A F5) — the recorded approach (review 3's remediation, `sendOwn` clears `before`), pinned by review 4 finding 1.
- An event loop stall longer than 1 s prunes a command before its answer is read, and pauses the lights (finder A F4) — the window predates #273 (`answers` pruned the same way at `5813ba0`), and a 1 s stall of the server is not a plausible state on the stage Mac. Minor at most.
- Go and Back's addresses are not grounded (finder B 12) — `go.json` and `back.json` record `/eos/cues/1/fire` and `/eos/cues/1/stop` answered by Eos.
- `releaseFires()` while the fake is silenced drops the held packets (finder C 5) — every test speaks before it releases (`test/eos.test.ts:1608-1613`).
- The end-of-list outcomes, a Back from cue 0 and a Go from cue 0 — #273's recorded assumptions, accepted.
- `stop()` leaves `before` and `beforeOwn` set; unanswered fires kept at the close however old; no maximum packet length in `osc-tcp.ts`; the redundant check at `src/server/connections.ts:285`; README and `docs/install.md` silent on the lights (#140); the 4 skipped tests; every producer message carrying the cue list — as pre-PR review 6 dismissed them.
- `config/stem-map.json` (`a058b27`) — "Keys 4" and "Vox FX" are each listed once, match by exact name, and no test reads the old contents (finder B).

## Minor / nits
- `e2e/lights.spec.ts:70`'s `toHaveCount(9)` counts lines only; the mark moving to cue 6 after a fire by hand is unchecked (carried from review 6).
- `test/osc-tcp.test.ts` has no case for a zero-length packet, which the reader hands out and `decode` drops (finder B 5).
- `web/src/ConnectionsPanel.tsx:110` — the scrolling cue list has no accessible name and no `tabIndex` (finder B 9).
- The fake answers a Go or Back with the fire event alone, and its connect burst keeps `connect.json`'s previous cue for every current cue; no test reads either (finder C 2, 3).
- The fake's Back with no current cue fires nothing and its Go fires the first cue, neither recorded (finder C 4); `test/fake-eos.test.ts` has no byte test of a Go on the last cue or of a Back on the first cue of a show a test gives (finder C 6, 7).
- `test/eos-recording-scripts.test.ts:29-43` — with python3 missing, the tests fail with "expected undefined to be ''" rather than naming python3 (finder C 9).
- Recording scripts, hand-run only: `eososc.Eos.recv` loops on a negative length prefix (`scripts/eos/eososc.py:44-47`), `msg` drops `bytes` and `None` and sends a bool as `i`, `parse` raises on a packet with no NUL, `Recorder.pump` returns with packets still buffered so later ones are stamped up to 100 ms late, `build-eos-test-show.py` exits 0 with errors, fixture writes are not atomic, and `park()` detects only an echoed "Error" (finder C 8, 10 to 15).
- `scripts/eos/__pycache__/` is not git-ignored, and the usage lines in `README.md:6-7` and the scripts' headers omit `-B` (finder C 16).
- `test/fake-eos.ts:325` — `let pending` shadows the `pending()` helper at `:231` (finder C 17).

## Test quality
- **Tests added:** `test/eos.test.ts`, `test/osc-tcp.test.ts`, `test/fake-eos.test.ts` and `test/eos-recording-scripts.test.ts`, all new and red at `f0eab4b` by import; tests added to `test/connections.test.ts`, `test/pages.test.ts` and `test/start-up.test.ts`.
- **Base oracle:** HEAD's `test/connections.test.ts`, `test/pages.test.ts` and `test/start-up.test.ts` at `f0eab4b`: 7 of the 9 added tests red; `test/pages.test.ts:708` and `:1410` green, as in review 6, and kept as #256's proof.
- **#273 oracle** (HEAD's `test/eos.test.ts`, `test/fake-eos.ts`, `test/fake-eos.test.ts` at `5813ba0`): 13 red, every one a case #273 asked for. Green there and new: `:1930` (red against `08d1272`'s `eos.ts`, so it is `9295f85`'s proof; keep); `:2029` (pause-direction cases, guarding against keeping too much; keep); `:2096` and `:2108` (they kill mutants m6 and m8; keep); `fake-eos.test.ts:125`, `:139`, `:163` (red against `5813ba0`'s fake; keep). `:1993` ("after a Back on the first cue, which fades the cue list out") cannot fail by prediction: Eos names no active cue on that reconnect, so nothing is judged. Strengthen it to reconnect with the fake on cue 1 after a Go, or delete it. The fake's #273 changes alone turn no older test red (100 of 100 green).
- **#259 and #274 oracle** (`test/eos-recording-scripts.test.ts` and `test/fake-eos.test.ts` at `a058b27` and `224d634`): the 3 `eososc` tests and the 2 #274 fire-by-hand tests are red on real assertions. Green at both bases: `test/eos-recording-scripts.test.ts:266` "sends /eos/ping as the 16 bytes the lights send", which computes its expectation with the production `encode` and never asserts 16; `/eos/ping` pads the same under the old rule. Assert the hex literal `2f656f732f70696e670000002c000000` and the length 16. `test/fake-eos.test.ts:66` (the ping reply) and `:92` (no numbered active cue) are green against `a058b27`'s fake, since the old fake already did both; they now pin the fake to the recordings, so keep them.
- **Mutation of #273's code:** 14 mutants of `src/server/eos.ts`, each alone, against `test/eos.test.ts` and `test/fake-eos.test.ts`: 13 killed. m13 survives: `placed` with `number === '0' ? false` (`:395`). No test presses Go with the live cue on cue 0, after a Back on the first cue faded the list out. Two tests the audit ran green at HEAD and red under m13 pin it: from `armedOnFirstCue()`, press Back, see "Live cue 0", then (a) press Go with no drop and fire cue 6 at the console, expecting "Paused by hand"; (b) `it.each(DROPS)`, `pressUnheard(rig, ['go'], how)`, `drop`, `reconnect`, see "Live cue 1: Goodness of God / Intro", and `neverPaused`. Add both to describe "the fire event that answers the lights' own Go and Back" (`test/eos.test.ts:2070`).
- **From the finders:** `test/start-up.test.ts:111-127` goes red without the `eos` registration (finder B); every assertion in `test/eos-recording-scripts.test.ts` goes red against the old `pad` and the old fire-by-hand write (finder C). Findings 2 and 3 are themselves gaps: no test fires at the console after a Go whose event was the followed cue, or after a Go on the last cue and a fire by number.
- **Tautology shapes found:** 1, `test/eos-recording-scripts.test.ts:266` (expectation from the production `encode`). `:301` and `:314` assert the script's exit message, which is operator-facing output, not a log line; borderline, kept. No mocks, no snapshots, no assertion-free tests, no call-shaped assertions.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and the build are green at `f478b66`; Playwright is green locally.
- **Commit hygiene:** this doc and `repro/review-7-repro.sh` are the only additions. The repro writes only in a temp worktree.
- **Likely reviewer asks:** why a stale cue list pauses the lights on a Go (finding 1); the PR description should name the stem map change, which rides on this branch.

## Verdict
**Ready to open a PR, with follow-ups.** The review found 0 CRITICAL, 0 HIGH, 1 MEDIUM and 4 LOW.
- Finding 1 (MEDIUM, introduced by #273) is the gate for a clean round, but its fix depends on how Eos reports a cue edit, which is not recorded, and it would be the seventh rework of the own-command accounting. Recommend a split ticket under #108, with findings 2 and 3 in it, and the recording at #140's Augment3d session. Until it lands, pressing Refresh after any change to the cue list at the console avoids it.
- Findings 4 and 5 can land through `/pr-review-remediate` or as follow-ups.
- The PR still waits on #140, which is Nick's.

## Remediation — 2026-11-02
Scope: CRITICAL, HIGH and MEDIUM, the `/pr-review-remediate` default. Finding 1 is the only one in scope, and its brief carries an Escalation (the seventh rework of the own-command accounting, with a fix that depends on an unrecorded Eos behaviour), so it is skipped as a split-ticket recommendation, not fixed. Its surface was re-checked first: `git diff f478b66 51858a2` touches only this doc and `repro/review-7-repro.sh`, so `src/server/eos.ts:296-317` and `:395-410` are as the brief describes. Findings 2 to 5 (LOW) are deferred to Nick, unfixed. No code changed this round, so no suite, typecheck or verify pass ran.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | — skipped | not run: no fix applied; `sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh` stays the split ticket's red proof (f1a, f1b) | — | escalated: split ticket recommended (proposal in the run's stage 2 proposals), carrying findings 2 and 3 with it |
| 2 (LOW) | — deferred | — | — | LOW tail, left for Nick (eng-pipeline#34); the review routes it to finding 1's split ticket |
| 3 (LOW) | — deferred | — | — | LOW tail, left for Nick (eng-pipeline#34); the review routes it to finding 1's split ticket |
| 4 (LOW) | — deferred | — | — | LOW tail, left for Nick (eng-pipeline#34) |
| 5 (LOW, comment hygiene) | — deferred | — | — | LOW tail, left for Nick (eng-pipeline#34) |

### Known regressions, deferred
- None: no fix was applied.

### Rework briefs
- None: no verify pass ran, so no rework.

### Approach decisions (remediation)
- None added. Own-command accounting stays as recorded above; any change to it goes through finding 1's split ticket.
