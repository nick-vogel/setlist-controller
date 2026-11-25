# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `6aec698` "Merge pull request #246 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `fd81a10` (setlist-controller#138 Lights pause by hand: a cue fired at the console pauses automation), clean tree: 0 files with uncommitted changes, 0 untracked; 27 files total, +5757 / -2 against the merge-base. Of those, 15 are Eos recordings and their README under `test/fixtures/eos/`; the code under review is `src/server/eos.ts` (352 lines), `src/server/osc-tcp.ts`, the one-line registration in `src/server/start-up.ts`, the fake Eos, the tests, two Playwright specs and four hand-run Python recording scripts.
**Reviewed against:** the epic body of setlist-controller#108 (the spec) and Nick's two comments on it, which override the body: the 2026-10-21 Phase 0 change, and the 2026-10-24 address confirmation, whose decision is OSC 1.0 packet-length framing on TCP 3032 instead of SLIP. The bodies of sub-issues #150, #135, #136, #137, #138 and #139 (#140, the install doc, the DMX cable move and the acceptance run on Augment3d, is a human ticket and not on this branch). The run's recorded decisions and proposals (`.epic-loop/tickets/<n>/assumptions.md`, the end report's proposal list), read so that a recorded decision is not re-reported as a defect, and Nick's follow and link rule for #138 (2026-10-24). The per-ticket reviews' open LOW findings, listed in the end report, are not repeated here. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent (the ATEM adapter) for every fix shape. Round 1, `--fresh`.
**Date:** 2026-10-24
**Reviewer:** 2 code-review agents + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | up to date, lockfile unchanged |
| Lint | `pnpm lint` (eslint over `**/*.{js,ts,tsx}`, `e2e/` and `test/` included) | pass. Nothing lints the Python under `scripts/eos/` |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | pass: 69 files, 1627 passed, 4 skipped |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | pass: 54 passed, WebKit and Chromium |
| Tests red at base | scratch worktree at `6aec698`, the branch's `test/eos.test.ts`, `test/fake-eos.ts`, `test/osc-tcp.test.ts`, `test/start-up.test.ts` and fixtures copied in, `vitest run` on the three test files | all three files red: two fail to import the absent adapter and framing, and the new start-up test fails on the unknown `eos` kind. The 5 passes are start-up's existing tests |
| Mutation of the adapter | finder B: 20 mutants of `src/server/eos.ts` in a scratch worktree, `vitest run test/eos.test.ts` each | 14 killed (the follow rule, Go and Back matching, the last " / " split, the stop using up a Back, the window, link and hang reading, the read join, the live cue cleared on close). 6 survived; three are finding 1, the rest are under Test quality |
| Adapter against a fake Eos server | finder A: a scratch harness driving the real `eosKind` against a TCP server on a random 127.0.0.1 port | shutdown, reconnect, malformed packets and the recorded follow chain judged correctly; one race reproduced against a synthetic double reply, see Needs Further Investigation B |
| Fake faithfulness | finder B read the fake against the recordings | connect replay, count and index replies, past-end reply, missing list count, Go and Back answer order and the follow show's arguments 19 to 21 all match the recordings |
| Ports | `git grep 3032 -- test e2e`, the fake's `listen(0)` | no test connects to 3032; the fake binds an OS-assigned port on 127.0.0.1 |
| Python scripts | read only; they talk to a real Eos on 3032 and were not run | finding 2 and finding 3 come from the source and the committed fixtures' hex |
| Tautology shapes | finder B read every new test | no snapshots, no mocked unit under test, no assertion-free test. The one log-line assertion (`test/eos.test.ts:492`) is a sync point followed by behavioural asserts |

**Overall:** The lights adapter holds up. Every acceptance criterion of #135 to #139 has a test that goes red at base, the full checks are green, and the follow and link rule survives targeted mutation. No finding is above LOW: three rules in the own-command matching have no test that pins them, the hand-run recording helper pads some strings wrongly, the recording script can overwrite the fire-by-hand recording with an empty one, and a handful of comments are wrong. The branch is ready to open as a PR once Nick has done #140's acceptance run, and none of the findings gates it.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, read from list reply arguments 19 to 21. This review adds no change to it.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter, as the epic's testing decisions require. The nearest precedent for each finding-1 test is named in its brief.

## Confirmed Issues
### 1. Three rules of the lights' own-command matching can change with no test going red — LOW
- **Location:** `src/server/eos.ts:142`, `src/server/eos.ts:206`, `src/server/eos.ts:200`; tests in `test/eos.test.ts` (`describe("the lights' own fires")` at :736, `describe('the live cue on the lights row')` at :356)
- **Attribution:** introduced. `git log -S'own = own.slice(at + 1)'` and `-S'STOPPED = '` name `98a4925` (setlist-controller#138 Lights pause by hand); `-S"typeof label === 'string' ? label : ''"` names `38d66c4` (setlist-controller#136 Lights fire events).
- **Real-world trigger:** none known for a defect today: the code is right. The finding is that a later change can break each rule silently. Capped at LOW.
**Evidence**
```ts
const at = own.findIndex(({ command }) => accounts(command));
if (at < 0) return false;
own = own.slice(at + 1);                       // :142, "used up, with every command before it"
...
live = { number, label: typeof label === 'string' ? label : '' };   // :200
...
if (message.address === STOPPED) {             // :206, only cue list <cueList>'s stop of cue 0
```
**Failure mode** — Each of these mutants passes all 49 tests of `test/eos.test.ts` (proved by `repro/eos-mutants.sh`, every mutant exit 0):
- `own-splice`: `own = own.slice(at + 1)` becomes `own.splice(at, 1)`, so an earlier command that never got its answer stays for the rest of the window. A cue the lights fired that Eos never answered (a cue deleted at the console) would then absorb the operator's fire of that cue by hand if it is re-recorded within the second, so the lights keep following behind the operator.
- `any-stop`: `message.address === STOPPED` becomes `message.address.endsWith('/stop')`, so a stop in another cue list uses up the lights' pending Back, and the Back's own fire event then pauses the lights.
- `label-string`: the label fallback becomes `String(label)`, so a fire event with no label argument shows `Live cue 6: undefined` on the row.
**Recommended fix** — Add three tests to `test/eos.test.ts`; no production change.
1. In `describe("the lights' own fires")`, after the test at :805 and built from it: `lightsRig({ position: 28 })`, `read()`, `arm()`, `fake.setShow(RECORDED_SHOW.filter((cue) => cue.number !== '3'))`, `play(5, 33)`, wait for `fires(fake)` to equal `[fire('3')]` (unanswered). Then `fake.setShow(RECORDED_SHOW)` (which resets the fake's current cue to none), `press({ kind: 'run-button', target: 'eos', button: 'go' })`, wait for the live cue line of cue 1 (the fake's Go from no current cue fires the first cue, so Go's answer is not cue 3), and without advancing the clock `fake.fireByHand('3')`; expect `arm: 'paused', pause: 'by-hand'`.
2. In the same block, built from the Back-during-fade test at :783: `lightsRig({ show: RECORDED_SHOW })`, `read()`, `arm()`, press Back, `fake.emit('/eos/out/event/cue/2/0/stop', [''])`, then `fake.emit('/eos/out/event/cue/1/6/fire', ['Great Are You Lord / Verse 1'])`; await `shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST])` and expect `arm: 'armed', pause: null`.
3. In `describe('the live cue on the lights row')`, beside the test at :372 (lights disarmed): `fake.emit('/eos/out/event/cue/1/6/fire')` with no arguments, and await the row line `Live cue 6`.
**Remediation brief**
- **Design intent:** Eos answers the lights' commands over one TCP connection in command order, about 45 ms after each. `own` is the queue of the lights' fire, Go and Back commands still waiting for their answer, each kept at most `OWN_COMMAND_WINDOW_MS` (1000 ms). A fire event that a queued command accounts for uses up that command and every one before it; a stop of cue 0 in the configured list answers a Back during a fade. Anything else is a change by hand unless the follow and link rule claims it.
- **Full surface:** `test/eos.test.ts` only: the block at :736 (tests 1 and 2) and the block at :356 (test 3). The helpers they use (`lightsRig`, `read`, `arm`, `play`, `press`, `shows`, `fires`, `fire`, `next`, `lights`, `latest`, `RECORDED_SHOW`, `RECORDED_LIST`) and the fake's `setShow`, `fireByHand`, `emit` already exist.
- **Must preserve:** every existing test in `test/eos.test.ts`; `src/server/eos.ts` unchanged. The new tests stay at seam level: they assert only what the producer row shows and what the fake receives.
- **Do not touch:** clearing `own` on close (`src/server/eos.ts:277`): it cannot be observed, since a reconnect takes `RETRY_MS` (5000 ms), longer than the window, but it is harmless; see Reviewed and Dismissed.
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/eos-mutants.sh own-splice`, then `any-stop`, then `label-string`, from the repo root. Each exits 0 today; after the fix each must exit non-zero, with the matching new test red. `pnpm exec vitest run test/eos.test.ts` must stay green on the unmutated code.

### 2. The recording helper pads an OSC string whose length is a multiple of four with four extra bytes — LOW
- **Location:** `scripts/eos/eososc.py:4`
- **Attribution:** introduced by `da3dda1` (setlist-controller#150 Record ETCnomad's Eos over OSC, a cue fired by hand included), `git log -S'def pad(b)'`.
- **Real-world trigger:** the next recording session (#140's acceptance, or a re-record) sends a malformed packet for every address, type tag string or label whose length is 3 mod 4. Eos 3.3.10 tolerated it, so nothing has failed; a stricter Eos would ignore the packet. Capped at LOW: the scripts are hand-run, and no test replays the `app->eos` bytes.
**Evidence**
```python
def pad(b): return b + b"\0" * (4 - len(b) % 4)
def ostr(s): return pad(s.encode() + b"\0") if isinstance(s, str) else pad(s + b"\0")
```
**Failure mode** — `ostr` has already added the terminator, so a string of 4n bytes with it gets 4 more NULs instead of none. The committed recording shows it: `test/fixtures/eos/fire-decimal.json`'s `app->eos` packet for `/eos/cue/1/3.5/fire` (19 characters) is `2f656f732f6375652f312f332e352f6669726500000000002c000000`, five NULs after `fire` and 28 bytes, where `src/shared/osc.ts`'s `encode` sends 24. The `app->eos` hex in the fixtures is therefore not what the adapter sends.
**Recommended fix**
```diff
-def pad(b): return b + b"\0" * (4 - len(b) % 4)
+def pad(b): return b + b"\0" * (-len(b) % 4)
```
**Remediation brief**
- **Design intent:** OSC 1.0 strings end in at least one NUL and are padded to a multiple of four bytes; `ostr` appends the NUL, `pad` only rounds up.
- **Full surface:** `scripts/eos/eososc.py:4`. Its callers, `scripts/eos/build-eos-test-show.py`, `scripts/eos/record-eos-fixtures.py` and `scripts/eos/record-follow.py`, need no change. Do not re-record or edit the committed fixtures: only their `app->eos` hex is affected, and nothing reads it.
- **Must preserve:** `msg()`'s output for strings of length 0, 1 or 2 mod 4 with the terminator (unchanged by the fix). The adapter, the fake and every test are untouched.
- **Do not touch:** the fixtures' `app->eos` packets; see the full surface.
- **Proof:** `python3 -I -B -c "import sys; sys.path.insert(0, 'scripts/eos'); import eososc; m = eososc.msg('/eos/cue/1/3.5/fire'); print(len(m), m.hex())"` from the repo root prints `28 2f656f732f6375652f312f332e352f6669726500000000002c000000` today and must print `24 2f656f732f6375652f312f332e352f66697265002c000000` after, the bytes `src/shared/osc.ts`'s `encode('/eos/cue/1/3.5/fire', [])` gives. Keep `-B`: without it the import writes `scripts/eos/__pycache__/` into the tree (`-I` ignores `PYTHONDONTWRITEBYTECODE`).

### 3. The recording script overwrites the fire-by-hand recording with one that has no fire when none comes — LOW
- **Location:** `scripts/eos/record-eos-fixtures.py:75-80`; the knock-on in `test/fake-eos.ts:114`
- **Attribution:** introduced by `da3dda1`, `git log -S'fire_t = log'`.
- **Real-world trigger:** Nick re-runs the recording (for #140 or a new Eos version) and does not fire a cue at the console within the 15-minute wait. Capped at LOW: hand-run tool, and the damage shows as a failing test run rather than shipping.
**Evidence**
```python
got = pump(900, until=lambda a, args: a.startswith("/eos/out/event/cue/") and a.endswith("/fire"))
fire_t = log[-1]["t_ms"] if got else 0
log = [x for x in log if x["t_ms"] >= fire_t - 3000]  # keep 3 s before the fire, drop the wait
pump(7)
with open(os.path.join(OUT, "fire-by-hand.json"), "w") as f:
```
**Failure mode** — With no fire, `fire_t` is 0, the whole 15-minute wait is kept, and `fire-by-hand.json` is overwritten. The script prints `NO FIRE SEEN` but has already written the file. In the fake, `BY_HAND.findIndex(...)` is then -1, so `BY_HAND_6` is `slice(0, 0)`, an empty list, and `fireByHand('6')` silently sends nothing: the pause-by-hand tests time out with no message naming the cause.
**Recommended fix**
```diff
 got = pump(900, until=lambda a, args: a.startswith("/eos/out/event/cue/") and a.endswith("/fire"))
-fire_t = log[-1]["t_ms"] if got else 0
+if not got: raise SystemExit("no cue fired by hand within 15 minutes; fire-by-hand.json left unchanged")
+fire_t = log[-1]["t_ms"]
```
and in `test/fake-eos.ts:114`, take the index first and throw when it is -1 (`throw new Error('fire-by-hand.json holds no fire event of cue 6')`), so a bad recording fails at import with its cause.
**Remediation brief**
- **Design intent:** each fixture is one recorded scenario that the fake replays byte for byte; a recording that lacks its key event must never replace a good one.
- **Full surface:** `scripts/eos/record-eos-fixtures.py:75-76`; `test/fake-eos.ts:113-114`.
- **Must preserve:** with a fire seen, the script keeps 3 s before the fire and 7 s after, as now. `BY_HAND_6` stays the recorded packets up to and including `/eos/out/event/cue/1/6/fire`; the tests at `test/eos.test.ts:681` and :372 that use `fireByHand('6')` stay green.
- **Do not touch:** the committed `test/fixtures/eos/fire-by-hand.json`.
- **Proof:** `pnpm exec vitest run test/eos.test.ts` stays green. The script half cannot run without Eos; check it by reading. For the fake half, a scratch copy of `fire-by-hand.json` with its `/eos/out/event/cue/1/6/fire` packet removed must make `vitest run test/eos.test.ts` fail at import with the new message (do this in a scratch worktree, never on the committed fixture).

### 4. Comment hygiene — LOW (aggregated)
- `test/osc-tcp.test.ts:9-10` — "Two packets recorded from Eos (test/fixtures/eos/read-cue-list.json): the count reply and the label of cue 3.5." → "The count reply, recorded from Eos (test/fixtures/eos/read-cue-list.json), and a fire of cue 3.5 as the lights send it."
- `e2e/eos.spec.ts:45` — "Disarmed before the presses, and disarmed after them." asserts only after. Either add `await expect(row.locator('.connection-arm')).toHaveText('Disarmed');` before `go.click()`, or change the comment to "Disarmed after the presses."
- `test/start-up.test.ts:33` — "The fake kind's section good, and the lights' with no host and cue list 0." → "The lights' section with no host and cue list 0. Start-up registers no fake kind, so the fake's section is an unknown kind here."
- `test/fixtures/eos/README.md:62` — "The list was built over OSC in Live with `/eos/newcmd`" → "The list was built over OSC in Eos's Live mode with `/eos/newcmd`" (in this repo "Live" reads as Ableton Live).
- `test/fake-eos.ts:43-45` — `answered` is documented as "A test waits on it for a read to be answered", but no test or spec reads it (`git grep '\.answered' -- test e2e` finds none outside the fake). Remove the field and its two pushes (:200, :212), or drop the claim from the comment.
- `test/fake-eos.ts:173-174` — "With no current cue, the cue after it is the first." → add "(not recorded: go.json and back.json both start on a current cue)", since the Back-during-fade test at `test/eos.test.ts:783` relies on the fake's Back firing nothing then.

## Needs Further Investigation
### A. A list reply that Eos splits across packets would lose a cue's follow, link and hang — confirm by recording a cue with a long label and long notes
`src/server/eos.ts:182` matches only the first packet of a cue's list reply (`list/0/<count>`), and :225 reads the link, follow and hang from its arguments 19 to 21. ETC's list convention (`<arg index>/<arg count>`) lets a long reply split across packets. If Eos ever splits before argument 19, `thenOf` gets `undefined` three times, the cue counts as having no follow, and each cue its follow fires pauses the armed lights. Every recorded reply arrived whole (`list/0/31`), including over TCP, and the label (argument 2) is always in the first packet. What would confirm it: in #140's session, label a cue at Eos's maximum label length and give it long notes and a scene, then read the list and see whether the reply splits. What would kill it: the reply stays one packet. If it splits, the fix is to gather a cue's packets by argument offset and count an index answered only once its argument count is reached.

### B. A follow onto the very cue the lights fire at the same moment pauses the lights — confirm on Augment3d
`src/server/eos.ts:199-203`. When the live cue W has a follow onto X and the section start fires X in the same ~50 ms, the follow's fire event X uses up the lights' own `{ cue: X }`, and if Eos then answers the lights' fire with a second fire event X, that one answers nothing and `firesNext(X)` is not X, so it is reported as by hand. Finder A reproduced the adapter's side with a fake that sends two fire events for one fire. Unproved: whether a real Eos that has just run W's follow into X still fires X again for the lights' command, or whether the designer would ever put a follow across a section boundary at all (the epic puts follows inside a section). What would confirm it: in #140's acceptance run, a cue whose follow lands on the next section's cue at the section's downbeat. If confirmed, the fix is to check `followed` before using up an own command, so a follow event never takes the lights' command.

## Reviewed and Dismissed
- The lights neither declare `acknowledges` nor report `actedOn`, though `src/server/target.ts:20` names an Eos fire event as its example, and every section cue gets a lateness line even when no cue is labelled for it — recorded as the run's proposal 1 ("Eos acknowledges each cue through its fire event, and acts only on a section that has a cue"); out of this branch's scope.
- A connect that fails gives no problem line on the row and no log line, unlike the ATEM (`src/server/atem.ts:178-183`) — the run's proposal 2 and #135's F2.10.
- A host with surrounding spaces passes `sectionProblems` and fails to connect — the ATEM validates the same way; with proposal 2's problem line it would show why.
- `cueList` has no upper bound, so `1e21` reaches the regexes as `1e+21` — no plausible config; any real cue list number is digits only, which is regex-safe.
- A cue deleted between the count and the index walk stalls the read for 10 s — #135's F2.3 and F2.4.
- After a reconnect whose read is cut short, the row shows no list until the next fire event — #136's F1.1.
- Back during a fade leaves the stopped cue as the live cue on the row — it is still Eos's active cue; Eos sends no other.
- An untitled song is reported section by section — the server gives such a song no title on purpose (`src/server/cues.ts:17-19`), and `test/eos.test.ts:530` pins the wording.
- A throw from the reporter inside a socket event would be uncaught — the ATEM's callbacks have the same shape, and the reporter's calls do not throw.
- Clearing `own` on close (`src/server/eos.ts:277`) is an equivalent mutant: a reconnect takes 5000 ms, past the 1000 ms window. Harmless; keep it.
- The middle `offline` assertions of "shows offline while the fake refuses" (`test/eos.test.ts:551-565`) read synchronously after `clock.advance` — the test still goes red if the adapter never reconnects, since `comesOnline()` would time out; same shape as #137's F2.1.
- "Do nothing while Eos is offline" (`test/eos.test.ts:660`) does not cover a press during a pending connect — `sendOwn` and the server both gate on online; a regression to the connecting socket is speculative.

## Minor / nits
- `scripts/eos/eososc.py:2` imports `sys` and never uses it. Nothing lints the Python; a header line saying the scripts are hand-run Phase 0 tools would set that expectation.
- Running any `scripts/eos/` script leaves an untracked `scripts/eos/__pycache__/`; `.gitignore` has no `__pycache__/`.
- `e2e/lights.spec.ts:23-33` hand-rolls the connections config writer that `e2e/eos.spec.ts` imports from `test/fake-eos.ts`, and runs `eosKind()` on the real clock, so a missed first connect costs 5 s of real time.
- No Eos test re-reads the cue list on a set change; the server calls `check()` on a set change for every target, and the Eos check always reads, as the Refresh tests prove.
- The default port 3032 has no test; none may connect to it, and the bad-section test proves leaving it out raises no problem.

## Test quality
Tests added: 49 in `test/eos.test.ts`, 5 in `test/osc-tcp.test.ts`, 1 in `test/start-up.test.ts`, and the Playwright specs `e2e/eos.spec.ts` and `e2e/lights.spec.ts` · green against `$BASE`: 0 (every unit and seam test is red at base) · tautology shapes found: 0. Mutation: 14 of 20 adapter mutants killed. Survivors: the three in finding 1; the equivalent `own = []` on close (dismissed); the non-string label in a read reply and the count validation (`src/server/eos.ts:223` and :213), fallbacks for replies Eos was never recorded sending, left untested; and the string-link and float-link branches of `thenOf` (`src/server/eos.ts:86-88`), which the fake cannot produce since `test/fake-eos.ts:142` writes the link as an int and neither form is recorded. Nick's call whether those two branches stay, untested, as recorded in #138's assumptions ("a float link is read to three places"), or get a test through a hand-built list reply.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build all green at `fd81a10`; Playwright green locally.
- **Commit hygiene:** the 19 commits are one per ticket and per review pass, each opening with its issue reference. Nothing to drop.
- **Likely reviewer asks:** #140's install doc and the acceptance run on Augment3d (the run's trust gate); the README's lights row and Playwright list (#136's F1.2 and F1.3, #137's F2.6); the follow window of 1000 ms, which #140 confirms.

## Verdict
**Ready to open a PR with follow-ups.** Nothing here gates the PR: all four findings are LOW. Findings 1 to 4 are cheap and can land on this branch through `/pr-review-remediate`; Needs Further Investigation A and B belong to #140's session on Augment3d. The PR itself waits only on #140, which is Nick's.
