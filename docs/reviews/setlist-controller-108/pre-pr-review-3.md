# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `6aec698` "Merge pull request #246 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `95f33fc` (setlist-controller#257 Lights: go online only on a framed packet, and name the OSC TCP mode when Eos never answers), clean tree: 0 files with uncommitted changes, 0 untracked; 46 files total, +7555 / -66 against the merge-base. Of those, 6 are pre-PR reviews 1 and 2 and their repros, and 15 are Eos recordings and their README under `test/fixtures/eos/`. Since pre-PR review 2 (`be1fe81` "setlist-controller#108 pre-PR review 2"), the third `/epic-loop` run landed #254 to #258: 16 files, +588 / -126, in `src/server/eos.ts`, `src/server/connections.ts`, `src/server/target.ts`, `src/shared/snapshot.ts`, `web/src/ConnectionsPanel.tsx`, `web/src/PreServiceCheck.tsx`, `web/src/styles.css`, `README.md`, the fake target and the tests.
**Reviewed against:** the epic body of setlist-controller#108 and Nick's two comments on it (the 2026-10-21 Phase 0 change, and the 2026-10-24 address confirmation: OSC 1.0 packet-length framing on TCP 3032, not SLIP). The bodies of #254, #255, #256, #257 and #258 and their recorded assumptions (`.epic-loop/tickets/<n>/assumptions.md`), read so that a recorded decision is not re-reported as a defect. Pre-PR reviews 1 and 2: Approach decisions, Needs Further Investigation, Reviewed and Dismissed, and the findings #257 and #258 claim to fix. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent (`src/server/atem.ts`, `src/server/live-bridge.ts`) for every fix shape. A full review of the branch, `--fresh`.
**Date:** 2026-10-24
**Reviewer:** 2 code-review agents, 1 test-quality agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | up to date, lockfile unchanged |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | pass: 69 files, 1660 passed, 4 skipped |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | pass: 60 passed, both projects (`webkit-ipad`, `chromium-android` as Pixel 7) |
| Stage-3 tests red before stage 3 | test-quality agent: scratch worktree at `be1fe81`, HEAD's test files, fake Eos, fake target and fixtures copied in | 34 red, 196 green. Every stage-3 test that is green there is explained under Test quality; none is a tautology |
| Mutation, stage-3 code | test-quality agent: 35 mutants of `src/server/eos.ts`, `src/server/connections.ts`, `web/src/ConnectionsPanel.tsx`, `web/src/PreServiceCheck.tsx`; finder B: 6 more | 26 of 35 killed. Survivors: 4 test gaps (finding 3), 5 equivalent mutants (Minor) |
| Scroll-on-every-render mutant in Playwright | scratch worktree, `}, [current, list.length]);` → `});` in `web/src/ConnectionsPanel.tsx`, `vite build`, `playwright test e2e/lights.spec.ts e2e/eos.spec.ts` | 10 of 10 pass: no spec pins "a producer who scrolls the box by hand is left there". Finding 3 |
| Own fire after a reconnect with no active cue in the burst | `sh docs/reviews/setlist-controller-108/repro/review-3-repro.sh` | red: the lights pause by hand on their own Fire again. Finding 1 |
| Check cost on long follow runs | finder A: real server through `lightsRig` and the fake Eos, 1000 cues; and a standalone copy of `firesNext` and `firedAfter` | 34 ms with no follows, 772 ms with a follow on every cue (real server); 41 ms for 300 such cues, 1631 ms for 1000 (copy). Finding 2 |
| Recommended fixes for findings 1 and 2 | both applied in a scratch worktree, the repro test appended; `vitest run test/eos.test.ts test/connections.test.ts test/osc-tcp.test.ts`; `tsc` | 100 of 100 pass, tsc clean |
| Pre-PR review 2's repros | `sh docs/reviews/setlist-controller-108/repro/review-2-repro.sh` | both tests pass: review 2 findings 1 and 2 are fixed |
| Pre-PR review 2's mutants | `review-2-mutants.sh` for each of its six; `shown-reset` and `list-copy` no longer apply as written, so re-applied by hand to the moved code | `live-on-close` killed (4 of #254's tests); the other five survive. See Prior-review closure |
| Pre-PR review 1's mutants | `sh docs/reviews/setlist-controller-108/repro/eos-mutants.sh own-splice\|any-stop\|label-string` | all three still survive |
| #256's whole surface | finder B: every producer and consumer of `Target.check`, `PreServiceCheck` and `kind: 'unmatched'` | complete: `checkOf`, `eos.ts`'s two answers, the ATEM's `DeviceCheck`, the fake target, and `CheckResult`'s two callers (`ConnectionsPanel.tsx:68`, `ConnectionsSetup.tsx:37`). No other page renders a check |
| #255's whole surface | finder B: the `state` report through `connections.ts` to the snapshot and the row | complete: validated (whole number, in range), cleared offline, absent from viewer snapshots |
| Python scripts under `scripts/eos/` | not run: they talk to a real Eos on 3032 | unchanged since review 1 |

**Overall:** The five stage-3 tickets do what they say. #257 and #258 fix review 2's findings 1 and 2, and the full checks are green. One introduced defect matters: after a reconnect to an Eos that names no active cue of the cue list, such as one just restarted, the lights' own next cue pauses them "by hand". The fix is one line, and its red test is written. The pre-service check's new follow walk is cubic on long follow runs; a few stage-3 rules have no test; and a handful of comments are wrong or overlong. Fix finding 1 before the PR opens; the rest can follow. The PR still waits on #140.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254): the cue Eos is on at connect is judged once against the live cue kept from before the drop and its whole `firedAfter` chain. This review adds that the lights sending a cue of their own on the new connection ends that judgement, as the first fire event does in #254's recorded assumption 2 (finding 1).
- Shadowed cues (#252, #258): the check never calls a cue that fires "never fires". The exemption is every cue that a follow or hang of any cue reaches, with the false negative #258 accepted. This review changes how the set is built, not what it holds (finding 2).
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter, as the epic's testing decisions require. Row behaviour that needs effects to run is tested in Playwright (`e2e/lights.spec.ts`), since the repo has no DOM test environment and `renderToStaticMarkup` runs no effects.

## Confirmed Issues
### 1. After a reconnect to an Eos that names no active cue of the cue list, the lights' own next cue pauses them by hand — MEDIUM
- **Location:** `src/server/eos.ts:269-279` (the active-cue branch), with `before` kept at `src/server/eos.ts:402` and `sendOwn` at `src/server/eos.ts:165-169`.
- **Attribution:** introduced by `f679f9a` (setlist-controller#254 Lights: a cue fired at the console during a drop pauses the lights on reconnect): `git log -S'firedAfter(kept)' 6aec698..HEAD` names only it. Before #254 an active cue with no live cue only set the live cue.
- **Real-world trigger:** Eos restarts mid-service (ETCnomad crashes, or the FOH device reboots), which is user story 4's case, "a restarted Eos is usable again without me doing anything". The lights drop with a live cue kept, say cue 12. When Eos is back, its connect burst names no active cue of the cue list, as the fake models it (`setShow` leaves no current cue) and as an Eos with a freshly loaded show plausibly does. The next section start fires the section's cue. Eos sends that cue's active cue ahead of its fire event (`test/fixtures/eos/fire-follow-chain.json`: active at 64 ms, fire at 77 ms), the active cue meets no live cue, is judged against kept cue 12, and the lights show "Paused by hand" and stop following until the producer arms them again. The same happens with the console's active cue in another cue list, which the `ACTIVE` pattern filters out. MEDIUM, capped: what Eos sends on connect with no cue of the list active is not recorded (`test/fixtures/eos/README.md`); see Needs Further Investigation B. Downgrade to LOW if a restarted Eos always names an active cue of the list on connect; check in #140's session by restarting ETCnomad with the lights connected.
**Evidence**
```ts
const active = ACTIVE.exec(message.address);
if (active) {
  if (live !== null) return;
  const number = active[1]!;
  const kept = before;
  live = { number, label: null };
  before = null;
  showLines();
  if (kept !== null && number !== kept && !firedAfter(kept).has(number)) reporter?.changedByHand();
```
**Failure mode** — `before` is set at the close and cleared only by the next active cue or fire event. When the burst carries no active cue of the list, the first active cue the lights see is the one Eos sends for the lights' own fire, ahead of its fire event, and the active branch never consults the own-command queue. It contradicts #254's recorded assumption 2: "A connect burst with no active cue of the list: nothing is judged at connect, and the kept cue is cleared by the first fire event". Proved: `sh docs/reviews/setlist-controller-108/repro/review-3-repro.sh`. The lights are armed on cue 3.1 (by Go), drop, and reconnect to a fake with no current cue. The producer presses Fire again, and the fake sends `/eos/out/active/cue/1/3` before the fire event. The producer's snapshots go `armed` then `paused/by-hand`, and the test fails at `expected false to be true`. Finder A reproduced the same with Go.
**Recommended fix**
```diff
   const sendOwn = (address: string, command: Own) => {
     if (!online) return;
     send(address);
     own.push({ command, at: clock.now() });
+    before = null;
   };
```
The comment above `before` at `src/server/eos.ts:152-154` becomes "The number of the live cue when a connection last closed, kept until a live cue is taken again or the lights send a cue of their own, so the cue Eos is on when the lights connect again is judged against it once. Null before the first live cue, and once judged."
**Remediation brief**
- **Design intent:** the kept cue exists for one judgement only: the cue Eos is on when the lights connect again, which a fire at the console during the drop would have moved without a fire event the lights could see. Once anything else names the cue Eos is on (a fire event, or the lights' own command, whose answer Eos sends as an active cue and then a fire event), that judgement is over and the follow and link rule of #138 takes over. Cues the lights send are never a change by hand.
- **Full surface:** `src/server/eos.ts:165-169` (`sendOwn`, the one line), `src/server/eos.ts:152-154` (the comment on `before`), and a new test in `test/eos.test.ts` beside "pause once they have connected again on a cue fired by hand while they were offline, through connects again that Eos refuses" (`test/eos.test.ts:1471`), copied from the test the repro script appends (its `dropToNoActiveCue` helper inlined). `sendOwn` is the only place the lights send a command that fires a cue: `cue()` at `:452-455` and `runButton` at `:466-469` both go through it.
- **Must preserve:** the reconnect tests of #254 in `test/eos.test.ts`: `:1415` (a cue fired by hand during the drop pauses on reconnect, judged once), `:1449` (`it.each`, a follow chain run on during the drop never pauses), `:1471` (the kept cue survives refused connects); `:1371` and `:1394`; the first-connect test that pauses nothing (review pass `f2157fe`, "takes the label of the cue Eos is on at connect"). All of `test/eos.test.ts`, `test/connections.test.ts` and `test/osc-tcp.test.ts` passed with this diff applied in a scratch worktree, the repro test included.
- **Failure of the fix:** a section cue sent in the few milliseconds between the lights coming online and Eos's connect burst would end the judgement before the burst's active cue arrives, so a cue fired at the console during the drop would go unnoticed until the next fire event is judged by the follow rule. That window is the burst's own latency, about 40 ms on loopback; the cost is one missed pause, never a wrong one.
- **Do not touch:** the `before = null` lines in the fire-event and active branches (`:257`, `:275`), equivalent mutants today (Minor) that keep the judgement local; the follow fire with no live cue after a reconnect ignoring `before` (dismissed below, #254's assumption 2).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-3-repro.sh` fails today and must pass after; the new test in `test/eos.test.ts` is red before the fix and green after: `pnpm exec vitest run test/eos.test.ts`.

### 2. The pre-service check walks every follow chain from every cue, which is cubic on a long run of follows — LOW
- **Location:** `src/server/eos.ts:486`, with `firesNext` and `firedAfter` at `src/server/eos.ts:302-314`.
- **Attribution:** introduced by `a8c1221` (setlist-controller#258 Lights pre-service check: no "never fires" line for a cue that another section's follow fires): `git log -S'flatMap((cue) => [...firedAfter' 6aec698..HEAD` names only it. Before it the walk ran from one cue per section.
- **Real-world trigger:** a cue list with long runs of follow cues, such as a song whose build is twenty cues on follows. The check runs synchronously after each read: on coming online, which can be mid-song after a reconnect, on Refresh, and on a set change. A run of k follow cues costs about k² × n / 2 steps, since each step of each walk is a `findIndex` over the list. Measured: 1000 cues all on follows, 772 ms on the server's event loop through the real server; 300 such cues, 41 ms; 1000 cues in chases of four, 14 ms. LOW: a library of short follow runs costs milliseconds, and a list of hundreds of chained follows is unlikely.
**Evidence**
```ts
const followed = new Set(cues.flatMap((cue) => [...firedAfter(cue.number)]));
```
**Failure mode** — every element of every chain after its first is itself `firesNext` of a listed cue, since `firesNext` of a number not in the list is undefined. So the union of `firedAfter` over every cue equals the union of `firesNext` over every cue, and the transitive walk adds nothing but cost. Finder A asserted the two sets equal on all four shapes measured, and the test-quality agent's mutant `E17` (`[...firedAfter(cue.number)].slice(0, 1)`) survives every test for the same reason.
**Recommended fix**
```diff
-      const followed = new Set(cues.flatMap((cue) => [...firedAfter(cue.number)]));
+      const followed = new Set(cues.flatMap((cue) => firesNext(cue.number) ?? []));
```
The check's comment at `src/server/eos.ts:475-476`, "save a cue Eos fires by itself after any cue of the list on a follow or hang, which does fire", stays true as written.
**Remediation brief**
- **Design intent:** a shadowed cue is exempt from "never fires" when any cue of the list fires it by itself, by a follow or hang, through its link or as the next cue (#258). That set is the one-step successors of every cue; the transitive closure is the same set. `firedAfter` stays for the reconnect judgement (`:277`), where the walk from one kept cue is needed.
- **Full surface:** `src/server/eos.ts:486` only. No test changes: the result is unchanged.
- **Must preserve:** the shadowed-cue tests in `test/eos.test.ts` (the two-shadowed-cue test, "names no cue with the same label that Eos fires by itself after the cue that fires", and #258's test of a cue fired after another section's cue beside one nothing fires); all passed with this diff applied in a scratch worktree.
- **Failure of the fix:** none new: `firesNext` is bounded by one `findIndex`, so the check costs O(n²) at worst, about 1 ms for 1000 cues.
- **Do not touch:** `firedAfter` and its use in the active branch (`:277`).
- **Proof:** `pnpm exec vitest run test/eos.test.ts` green before and after. Cost, if wanted: time `check()` through `lightsRig` with a 1000-cue `setShow` whose every cue has `follow: 1000`; about 770 ms before, a few ms after.

### 3. Five stage-3 rules change with no test going red — LOW
- **Location:** `web/src/ConnectionsPanel.tsx:99` and `:103`; `src/server/eos.ts:371-372`; `src/server/connections.ts:139`.
- **Attribution:** introduced, each by its ticket: the scroll effect's dependencies, the marking and the first-fill scroll by `413a94e` (#255); `listCurrent` in `set`'s comparison by `413a94e` (#255); the ping count reset per packet by `98e63d3` (#257).
- **Real-world trigger:** none today; the code is right. A later change that breaks one of these ships green. LOW.
**Evidence** — each mutant applies cleanly and leaves its suites green:
- `scroll-every-render` (`}, [current, list.length]);` → `});`): green in `test/pages.test.ts` and `test/setup-screen.test.ts`, and in Playwright (`e2e/lights.spec.ts`, `e2e/eos.spec.ts`, 10 of 10, run for this review). Under it the box scrolls back to the live cue on every producer snapshot, several a second while Live plays, so a producer who scrolls ahead to read the coming cues is snapped back. #255's assumption: "a producer who scrolls by hand to look ahead is not pulled back until the live cue moves". The new spec at `e2e/lights.spec.ts:109` never scrolls the box by hand.
- `first-fill` (`[current, list.length]` → `[current]`): green. No test connects the lights while Eos is already on a cue far down a long list, so the scroll "when the list first fills" (#255's assumption) is tested only by an index change.
- `mark-one-line` (`index === current ? (` → `index === current && list.length > 1 ? (`): green. No test marks a one-line list.
- `ping-per-chunk` (`unanswered = 0;` moved out of the packet loop, per chunk): green in `test/eos.test.ts`. A peer that, once online, sends only pieces of a packet that never ends stays online. #257's assumption: "A chunk holding only part of a packet no longer resets the ping count".
- `marked-only` (drop `next.listCurrent === entry.listCurrent &&`): green in `test/connections.test.ts` and `test/eos.test.ts`. A report that moves only the marked line would never reach the page. Eos cannot send one today, since its live line changes with the index, but `TargetReport.state` allows it.
**Failure mode** — the five rules are claimed by #255's and #257's assumptions and comments, and a regression in any of them passes `pnpm test` and `pnpm test:e2e`.
**Recommended fix** — one test per rule:
1. `scroll-every-render`, in `e2e/lights.spec.ts` after the step that fires cue 280 in the test at `:109`: set the box's `scrollTop` to 0 by `list.evaluate`, press the row's Arm button and wait for `.connection-arm` to read "Armed" (a snapshot that leaves the marked line where it is), then expect the box's `scrollTop` still 0; then `fake.fireByHand('281')` and expect "Cue 281" in view.
2. `first-fill`, a new test in `e2e/lights.spec.ts`: a `LIBRARY` show whose fake is on cue 280 before the page loads (fire it by hand on the fake before `lightsRow` connects the lights, or with the fake refusing until it has), then expect "Cue 280: Song 28 / Look 10" in view and marked once the list fills.
3. `mark-one-line`, in the `test/pages.test.ts:1189` test: also render `rowOf({ ...ONLINE, list: ['Cue 1'], listCurrent: 0 })` and expect `aria-current="true"` in it.
4. `ping-per-chunk`, in `test/eos.test.ts` beside the partial-packet test (`:848`), through `rawPeerRig` (`:790`):
```ts
it('shows offline when, once online, Eos sends only the start of a packet that never ends', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let replies = 0;
  const { clock, latest } = await rawPeerRig((socket) => {
    socket.write(frame(encode('/eos/out/user', [{ int: 1 }])));
    socket.on('data', () => {
      socket.write(Buffer.from([0x7f]));
      replies += 1;
    });
  });
  await vi.waitFor(() => expect(latest()?.connection).toBe('online'));
  for (let ping = 1; ping <= 3; ping += 1) {
    const before = replies;
    clock.advance(PING_MS);
    await vi.waitFor(() => expect(replies).toBeGreaterThan(before));
  }
  clock.advance(PING_MS);
  await vi.waitFor(() => expect(latest()?.connection).toBe('offline'));
});
```
The test-quality agent ran this shape green at HEAD three times and red under the mutant. `frame` and `encode` are imported in `test/eos.test.ts` already if the SLIP test uses them; otherwise import `frame` from `../src/server/osc-tcp.ts` and `encode` from `../src/shared/osc.ts`.
5. `marked-only`, in `test/connections.test.ts` after the test at `:348`: with the fake target, report `setState(['Live cue 2'], ['Cue 1', 'Cue 2', 'Cue 3'], 1)`, wait for `listCurrent === 1`, then report the same lines and list with `2`, and expect a snapshot with `listCurrent: 2` and the same `state` and `list`.
**Remediation brief**
- **Design intent:** each rule is one the tickets recorded on purpose (the assumptions quoted above). Server rules are pinned at the seam through `lightsRig`, `rawPeerRig` or the fake target; the row's scroll is pinned in Playwright, since effects never run under `renderToStaticMarkup`.
- **Full surface:** `e2e/lights.spec.ts` (tests 1 and 2), `test/pages.test.ts:1189` (test 3), `test/eos.test.ts` near `:848` (test 4), `test/connections.test.ts` near `:348` (test 5). No production file changes.
- **Must preserve:** every existing test; the page staying put in `e2e/lights.spec.ts:109` (`window.scrollY` unchanged), which a test that scrolls the box must not disturb.
- **Do not touch:** the production code of all five rules, which is correct; the equivalent mutants listed under Minor.
- **Proof:** each test is green at HEAD and red with its mutant applied in a scratch worktree (`git worktree add --detach <scratch> HEAD`, `ln -s "$PWD/node_modules" <scratch>/node_modules`, apply the edit quoted above, run the test's file; for the two Playwright tests run `pnpm build` then `pnpm exec playwright test e2e/lights.spec.ts` in the scratch worktree).

### 4. Comment hygiene — LOW (aggregated)
- `src/server/eos.ts:342-343` — "The connection is online at Eos's first OSC packet on it", on a line of about 108 characters → "The connection is online at Eos's first framed packet on it, whether or not it decodes", rewrapped at 100 (#257's assumption 2: any complete framed packet counts).
- `src/server/eos.ts:56` — "Eos has to send its first OSC packet" → "Eos has to send its first framed packet".
- `web/src/ConnectionsPanel.tsx:16-17` — the inserted sentence "The list line the target marks, ... to put it at the top of the box." runs the lines to 143 and 115 characters → rewrap the paragraph at 100.
- `web/src/ConnectionsPanel.tsx:89` — "length, as when a read of the cue list finishes, the box scrolls itself to put that line at its top, so the producer sees what comes next. Only the" runs 150 characters → rewrap the paragraph at 100.

## Needs Further Investigation
### A. A cue list of about 950 indices or more may never finish reading within the 10 s limit — confirm by timing a read of a large cue list on Augment3d
`src/server/eos.ts:74-77` and `:205`: `READ_TIMEOUT_MS` is a fixed deadline from the read's start, not an idle limit, and the read sends every index request at once (`:287`). In `test/fixtures/eos/read-cue-list.json` all requests go out at 0 ms and the list replies land at 12, 22, 33, 42 ms and on, about 10 ms per index, so Eos answers them one at a time. At that pace 950 indices (parts count) take 10 s. One cue list holds the whole library, which at 60 songs of 8 to 12 sections, with follow cues inside sections, can approach that. If it does, the first read never finishes: the check stays "Not checked", `actsOn` is false for every cue, and the lights fire nothing all service; a later read silently keeps the old list. The same pace means a section cue sent during a read waits behind every index request still queued, possibly past `OWN_COMMAND_WINDOW_MS`, so its own fire event would read as a change by hand. Unproved: the pace is measured on nine cues over loopback. What would confirm it: in #140's session, build a show of about 1000 cues with `scripts/eos/build-eos-test-show.py`, read it with `scripts/eos/record-eos-fixtures.py`, and time the read; fire a cue mid-read and time its fire event. What would kill it: Eos answers a large read well under 10 s. If confirmed, the fix is an idle limit reset on each answered index, and a small window of index requests in flight (about 8) so a command never waits behind more than a few. Severity if confirmed: HIGH for a library past the limit.
### B. What a restarted Eos sends on connect is not recorded — confirm by restarting ETCnomad with the lights connected
This decides finding 1's severity, and one more case: if Eos names "no active cue" as `/eos/out/active/cue/<list>/0`, the `ACTIVE` pattern (`src/server/eos.ts:230`) takes "0" as the live cue, the row shows "Live cue 0", and a kept cue is judged against it (a pause by hand). What would confirm it: in #140's session, quit and reopen ETCnomad with the show while the server is connected, and record the connect burst. What would kill it: the burst names the cue the show opens on, or nothing, in which case finding 1 stands and this does not.
### C. A drop during the first read leaves the reconnect judged against an empty list — confirm with a test that drops the fake mid-read
`src/server/eos.ts:277` and `:402-405`: if the first connection drops after the burst's active cue X but before the first read finishes, `cues` stays empty, so on reconnect `firedAfter(X)` is empty and a cue that X's follow ran on to during the drop pauses the lights. Read from the code, not executed. What would confirm it: `fake.holdReads()` before the lights connect, then `fake.refuse()`, `fake.follow(<a cue X follows on to>)`, `fake.accept()`, and expect the lights armed. Severity if confirmed: LOW, a narrow window at start.

## Reviewed and Dismissed
- A follow's fire event after a reconnect, before any active cue, ignores the kept cue and pauses (`src/server/eos.ts:255`) — #254's recorded assumption 2: "the kept cue is cleared by the first fire event, which is judged against no live cue (pauses unless it answers an own command), as before #250".
- A shadowed cue reached only from another shadowed cue is not named (test-quality agent's probe: cue 12, reached only from shadowed cue 11, unnamed) — #258's recorded assumption, the false negative review 2 accepted.
- The row scrolls to the live cue when a re-read changes the list's length, not only when the live cue moves (`web/src/ConnectionsPanel.tsx:99`) — the component's comment says so on purpose ("when the list fills or changes length"), and a re-read happens only on connect, Refresh or a set change, all while Live is stopped or at connect.
- `docs/install.md:252` says no kind of target ships, and no doc names the `eos` section's fields or the console's OSC settings — #140 (open, Nick's) is the lights install doc; the stale sentence is pre-existing from #114's review (`docs/reviews/setlist-controller-114/pre-pr-review-1.md:153`).
- A Refresh during a read joins it and can return pre-edit labels (`src/server/eos.ts:201`) — the documented "joined, not repeated" rule (review 1).
- A fire event that arrives more than 1 s after the lights' own fire pauses them — the window `OWN_COMMAND_WINDOW_MS` is review 1's recorded behaviour; Needs Further Investigation A covers the one way it could be reached.
- The new spec's set-up scroll at `e2e/lights.spec.ts:117-118` depends on the page's layout — it passes on both projects; a layout change makes it fail red, never pass falsely.
- The ATEM and the fake target never report `problems` in a `FileCheck` — correct: the ATEM answers a `DeviceCheck`, and the problems path is covered through `test/eos.test.ts` (mutants C04 and C07 killed).

## Minor / nits
- `before = null` in the fire-event and active branches (`src/server/eos.ts:257`, `:275`) is dead today: `before` is read only while `live` is null, and every close that had a live cue overwrites it (equivalent mutants E01, E02). Keep them; finding 1's fix gives `before` a third reset.
- `listed &&` at `src/server/eos.ts:329` is redundant, since `cues` is empty until a read finishes (E09); `const kept = before;` could be `before ?? number` with no change (E14).
- `e2e/lights.spec.ts:126-127` accepts the live line anywhere inside the box, not at its top as #255's assumption puts it; `toBeInViewport` rejects the bottom and middle only because of the set-up scroll. `expect(Math.abs(lineBox!.y - listBox!.y)).toBeLessThan(2)` would pin it.
- Every producer snapshot carries the whole cue list, about 10 KB for 300 cues, on every Live position report, and the row re-renders every line (`src/server/connections.ts:250-251`, `web/src/ConnectionsPanel.tsx:101-110`). Off the cue path; `React.memo` on `StateList` would cut the render.
- No `setNoDelay(true)` on the Eos socket (`src/server/eos.ts:348`), carried from review 2.
- `test/connections.test.ts:384` asserts `.every(...)` over snapshots that are normally none (the shape review 2 noted at `:328`); the refused-reconnect test (`test/eos.test.ts:1471`) waits a fixed 100 ms twice and never checks that two refused connects happened; the partial-packet test (`test/eos.test.ts:848`) relies on a fixed 200 ms wait. The family of review 2's Needs Further Investigation B.

## Test quality
Stage-3 tests added or changed: in `test/eos.test.ts` (the reconnect tests of #254, the SLIP and partial-packet tests of #257, the shadowed-cue test of #258, the marked-index assertions of #255), `test/connections.test.ts` (#255), `test/pages.test.ts` (#255, #256), `test/pre-service-check.test.ts` and `test/setup-screen.test.ts` (#256's shape), and one Playwright test in `e2e/lights.spec.ts` (#255). Red at `be1fe81` with HEAD's tests copied in: 34, green 196, compile failures 0. The stage-3 tests green there: "takes the label of the cue Eos is on at connect" (changed; its pause assertion is review pass `f2157fe`'s proof and the only test that kills judging the first connect), both cases of "never pause once they have connected again on a cue the lights' cue follows on to" (base never paused on an active cue; at HEAD mutants E04 and E22 kill them), and three `test/pages.test.ts` tests changed only in shape or with a new `not.toContain('check-problems')` that mutant W09 kills. `test/pre-service-check.test.ts` and the changed `test/setup-screen.test.ts` test are red at base for a structural reason (base `checkOf` reads HEAD's fake target answer as a device check), so they were judged by mutation. Tautology shapes: 0. Mutation: 26 of 35 killed; 4 real gaps (finding 3, with `first-fill` and `marked-only` added from the verify pass), 5 equivalent (Minor). No DOM test environment exists, so the row's scroll can go red only in Playwright.

## Prior-review closure
Pre-PR review 2 (`be1fe81`) had four findings, all LOW. Finding 1 (online on any bytes): fully fixed by #257 (`98e63d3`); `repro/review-2-repro.sh` test 1 passes, and `test/eos.test.ts` gained the SLIP test. Finding 2 (shadowed cue fired from another section): fully fixed by #258 (`a8c1221`); test 2 passes, and `test/eos.test.ts` gained its test. Finding 3 (six rules no test pins): partially fixed, incidentally: `live-on-close` is now killed by #254's reconnect tests; `acts-before-read`, `shown-reset`, `reset-online`, `close-timers` and `list-copy` still survive (the last two re-applied by hand, since #255 and #257 moved the lines the script matches). Finding 4 (comment hygiene): untouched, e.g. `web/src/styles.css:794` still reads "about eight lines" and `test/fake-eos.ts:206-207` still sits above `connectBurst`. Pre-PR review 1 (`eee35ea`): all four LOW findings untouched; its three mutants still survive, `scripts/eos/` is unchanged, and `e2e/eos.spec.ts:45` reads as before. Neither review's open findings is repeated here; their briefs still apply, except that `review-2-mutants.sh shown-reset` and `list-copy` need their patterns updated to the moved lines (`src/server/eos.ts:377`, `src/server/connections.ts:266`).

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build all green at `95f33fc`; Playwright green locally on both projects. The new `repro/review-3-repro.sh` is a shell script, which nothing lints.
- **Commit hygiene:** one commit per ticket and per review pass, each opening with its issue reference; the merge pairs of #254 to #258 come from the lanes. Nothing to drop.
- **Likely reviewer asks:** #140's install doc (the `eos` section, OSC RX and TX, the OSC TCP mode at OSC 1.0) and the acceptance run on Augment3d, which should also restart ETCnomad with the lights connected (Needs Further Investigation B and finding 1) and time a read of a large cue list (Needs Further Investigation A); the open LOW findings of reviews 1 and 2.

## Verdict
**Ready to open a PR once finding 1 is fixed.** Finding 1 is the gate: introduced by this branch, it pauses the lights wrongly on the restarted-Eos path that user story 4 promises works untouched, and its fix is one line with its red test written (`repro/review-3-repro.sh`). Findings 2 to 4 are LOW and can land as follow-ups or on this branch through `/pr-review-remediate`. Needs Further Investigation A and B belong to #140's session on Augment3d; A, if confirmed, would gate a large library. The PR itself still waits on #140, which is Nick's.

## Remediation — 2026-10-24
Scope: CRITICAL, HIGH and MEDIUM, the `/pr-review-remediate` default. Finding 1 is the only one in scope; findings 2, 3 and 4 (LOW) are deferred to Nick, unfixed.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `30583db` setlist-controller#108 pre-PR review 3 finding 1: the lights' own cue after a reconnect to an Eos that names no active cue no longer pauses them by hand | red→green: `pnpm exec vitest run test/eos.test.ts -t 'never pause on their own Fire again'` (new test at `test/eos.test.ts:1500`, the repro's test inlined); `sh docs/reviews/setlist-controller-108/repro/review-3-repro.sh` red before, green at `30583db`. Preserve suites `test/eos.test.ts`, `test/connections.test.ts`, `test/osc-tcp.test.ts`: 100 of 100 pass. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e` (60 passed) green | 1 (the fixture-order line in the new test); the 3-line comment on `before` at `src/server/eos.ts:152-154` rewritten as the brief directs, not added | proved by execution (MEDIUM, no shared core, proof executed) |
| 2 (LOW) | — deferred | — | — | LOW tail, left for Nick (eng-pipeline#34) |
| 3 (LOW) | — deferred | — | — | LOW tail, left for Nick (eng-pipeline#34) |
| 4 (LOW, comment hygiene) | — deferred | — | — | LOW tail, left for Nick (eng-pipeline#34) |

Full `pnpm test` at `30583db` ran three times (the third after a 60-second wait) with the machine at a load average near 58, and each run had a different set of 5000 ms timeouts in the set-builder family alone (7, then 1, then 3: `test/set-builder-command.test.ts`, `test/set-builder-plan-folders.test.ts`, `test/set-builder-plan-list.test.ts`, `test/set-builder-plan.test.ts`), the family already logged on setlist-controller#205. Those four files run alone pass, 230 of 230; this round touched none of their code.

### Known regressions, deferred
- None.

### Rework briefs
- None: no verify pass ran, so no rework.

### Approach decisions (remediation)
- Reconnect judgement (#254, finding 1): the kept cue `before` is cleared in `sendOwn`, the one path that sends a cue-firing command (`cue()` and `runButton` both call it), so the lights' own cue ends the judgement as a fire event does. The fire-event and active-branch resets (`src/server/eos.ts:258`, `:276`) stay as they are.
