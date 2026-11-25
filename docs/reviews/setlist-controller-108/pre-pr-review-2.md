# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `6aec698` "Merge pull request #246 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `db26f8e` (setlist-controller#251 Lights row: cap the height of a long cue list), clean tree: 0 files with uncommitted changes, 0 untracked; 38 files total, +6692 / -21 against the merge-base. Of those, 2 are pre-PR review 1 and its repro, and 15 are Eos recordings and their README under `test/fixtures/eos/`. Since pre-PR review 1 (`eee35ea` "setlist-controller#108 pre-PR review 1"), the second `/epic-loop` run landed #248 to #252: 14 files, +865 / -128, in `src/server/eos.ts`, `src/server/connections.ts`, `src/server/target.ts`, `src/shared/snapshot.ts`, `web/src/ConnectionsPanel.tsx`, `web/src/styles.css`, `docs/install.md`, the fake Eos, the fake target and their tests.
**Reviewed against:** the epic body of setlist-controller#108 and Nick's two comments on it (the 2026-10-21 Phase 0 change, and the 2026-10-24 address confirmation: OSC 1.0 packet-length framing on TCP 3032, not SLIP). The bodies of #248, #249, #250, #251 and #252 and their recorded assumptions (`.epic-loop/tickets/<n>/assumptions.md`), read so that a recorded decision is not re-reported as a defect. Pre-PR review 1's Approach decisions, Needs Further Investigation and Reviewed and Dismissed. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent (`src/server/atem.ts`, `src/server/live-bridge.ts`) for every fix shape. A full review of the branch, `--fresh`.
**Date:** 2026-10-24
**Reviewer:** 2 code-review agents, 1 test-quality agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | up to date, lockfile unchanged |
| Lint | `pnpm lint` | pass, the new `repro/review-2-repro.test.ts` included |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | pass: 69 files, 1646 passed, 4 skipped |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | pass: 58 passed |
| Stage-2 tests red before stage 2 | scratch worktree at `eee35ea`, HEAD's `test/eos.test.ts`, `test/fake-eos.ts`, `test/fake-target.ts`, `test/connections.test.ts`, `test/pages.test.ts` and fixtures copied in, `vitest run` on the three test files | 25 red, 168 green. Every test #248 to #252 added or changed is red but four, each explained under Test quality; none is a tautology |
| Branch tests red at base | the same at `6aec698` for `test/connections.test.ts` and `test/pages.test.ts` | the three tests the branch adds to them are red; none green |
| Mutation, stage-2 code | test-quality agent: 37 mutants of `src/server/eos.ts` and `src/server/connections.ts`; finder B: 8 more | 30 of 37 killed. Survivors are finding 3, two equivalent mutants (dismissed) |
| Pre-PR review 1's mutants | `sh docs/reviews/setlist-controller-108/repro/eos-mutants.sh own-splice\|any-stop\|label-string` | all three still survive: review 1's finding 1 is open, see Prior-review closure |
| Framing of a peer that is not OSC 1.0 | `sh docs/reviews/setlist-controller-108/repro/review-2-repro.sh`, test 1: a raw TCP server that writes one SLIP-framed packet | red: the lights show online. Finding 1 |
| Shadowed-cue check against a link from another section | the same script, test 2 | red: the check names cue 12 "never fires" though the Bridge's follow fires it. Finding 2 |
| Recommended fixes for findings 1 and 2 | applied in a scratch worktree, then the repro plus `test/eos.test.ts`, `test/connections.test.ts`, `test/osc-tcp.test.ts`; `tsc` | 91 of 91 pass, tsc clean |
| `/eos/ping` answered over TCP | ETC's own knowledge base, by a web search restricted to etcconnect.com (the OSC Dictionary pages 404 live, and the Wayback copies could not be fetched) | ETC's support article on OSC strings over TCP gives `/eos/ping` with a packet-length header, answered by `/eos/out/ping`, with OSC TX on. Dismissed below |
| #251's whole surface | finder B: every producer and consumer of `Connection` and `TargetReport.state` | complete: both branches of `rows()`, the panel, the setup screen (shows no state by design), both `Connection` literals in `test/pages.test.ts`, the ATEM's one-argument `state` |
| Tautology shapes | test-quality agent read every stage-2 test | none computes its expectation with a production helper, mocks the unit, asserts only a call, snapshots output, or rests on a log line alone. One assertion-free step (finding 3) and one fixed real-clock wait (Needs Further Investigation B) |
| Playwright specs, CSS in WebKit | read only, by finder B; the suite ran green | `e2e/lights.spec.ts` goes red without the cap; `.connection-state-list` is on the cross axis of a wrapping flex row, so `max-height` holds |
| Python scripts under `scripts/eos/` | not run: they talk to a real Eos on 3032 | unchanged since review 1 |

**Overall:** The lights adapter and the five stage-2 tickets hold up: every acceptance criterion of #248 to #252 has a test that goes red without the change, the full checks are green, and the whole surface of #251's `list` is covered. Nothing is above LOW. The lights go online on any bytes Eos sends rather than on a framed packet, so an Eos left in SLIP mode flaps online and offline with a misleading reason; the shadowed-cue check names a cue as never firing when another section's cue links to it; and six rules of the stage-2 code change with no test going red. None gates the PR, which still waits on #140.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered, counted in pings as `src/server/live-bridge.ts` counts its probes; connect timeout 3000 ms. This review adds: the lights are online at Eos's first framed packet, not its first byte (finding 1).
- Shadowed cues (#252): the check must never call a cue that fires "never fires". This review widens the follow and hang exemption from the chain after the first labelled cue to the chain after any cue in the list (finding 2), and accepts the false negative that follows.
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter, as the epic's testing decisions require.

## Confirmed Issues
### 1. The lights go online on any bytes from Eos, so an Eos not speaking packet-length framing shows online, then "stopped answering", in a loop — LOW
- **Location:** `src/server/eos.ts:349-360`
- **Attribution:** introduced by `039148b` (setlist-controller#249 Lights: show offline when Eos never answers the connect or the connection goes silent): `git log -S'online !== connection' 6aec698..HEAD` names only it. Before #249 the lights went online at the TCP connect, so the case was no better; #249's own assumption names "the first packet Eos sends", and the code takes the first chunk.
- **Real-world trigger:** Eos's OSC TCP mode set to OSC 1.1 (SLIP) in Setup > System > Show Control > OSC, for another app, or by someone following an older guide. Eos then sends its connect burst SLIP-framed, unprompted (`test/fixtures/eos/connect.json`: the burst comes before the app sends anything). The lights take the first chunk as Eos answering: the row goes online with no problem line, the check reads not checked, and every fire goes out in a framing Eos ignores. Eos never answers the packet-length ping, so 3 to 4 s later the row goes offline reading "Eos stopped answering the lights", which points at the network instead of the setting; 5 s later it connects and goes online again. LOW: a misleading row in a misconfiguration the install doc (#140) will warn against; no cue is fired wrongly.
**Evidence**
```ts
connection.on('data', (chunk: Buffer) => {
  if (stopped || failure) return;
  unanswered = 0;
  if (online !== connection) {
    ...
    report.status('online');
    void readCues();
  }
  for (const packet of reader.push(chunk)) {
```
**Failure mode** — `packetReader` (`src/server/osc-tcp.ts:28-34`) reads a SLIP stream's first four bytes, `c0 2f 65 6f`, as a length of about 3.2 GB and yields nothing, yet the code above has already reported online and reset `unanswered`. Proved: `sh docs/reviews/setlist-controller-108/repro/review-2-repro.sh`, test 1, a raw TCP server writing one SLIP-framed `/eos/out/user`: the producer sees the lights online (`expected true to be false`). Finder A drove the same with a peer that answers every chunk: the row stays online indefinitely, with no problem line.
**Recommended fix**
```diff
     connection.on('data', (chunk: Buffer) => {
       if (stopped || failure) return;
-      unanswered = 0;
-      if (online !== connection) {
-        stopTimers?.();
-        stopTimers = clock.every(PING_MS, ping);
-        online = connection;
-        shown = null;
-        report.problem(null);
-        report.status('online');
-        void readCues();
-      }
       for (const packet of reader.push(chunk)) {
+        unanswered = 0;
+        if (online !== connection) {
+          stopTimers?.();
+          stopTimers = clock.every(PING_MS, ping);
+          online = connection;
+          shown = null;
+          report.problem(null);
+          report.status('online');
+          void readCues();
+        }
         const message = decode(packet);
         if (message) receive(message);
       }
     });
```
and at `src/server/eos.ts:340` the no-answer line becomes `... no answer within ${CONNECT_TIMEOUT_MS / 1000} seconds. Check the address, that OSC RX and TX are on, and that the OSC TCP mode is OSC 1.0.`, with its expectation at `test/eos.test.ts:704` changed to match. The comment at `src/server/eos.ts:322-323`, "The connection is online at Eos's first word on it", becomes "at Eos's first OSC packet on it".
**Remediation brief**
- **Design intent:** the lights are online only while Eos speaks OSC 1.0 over the connection. One timer runs from the connect's start to Eos's first framed packet (`CONNECT_TIMEOUT_MS`), which covers a dropped SYN, a host that accepts and never answers, and now a peer in another framing; from then on pings, any packet resetting the count. The line on the row is the one problem line for that state, logged once per run of the same failure.
- **Full surface:** `src/server/eos.ts:349-365` (the data handler), `src/server/eos.ts:340` (the line), `src/server/eos.ts:322-323` (the comment), `test/eos.test.ts:704` (the line's expectation), and a new test in `test/eos.test.ts` beside "shows offline when the connect gets no answer" (`test/eos.test.ts:701`): a raw `net` server on `127.0.0.1` port 0 that writes a SLIP-framed packet on accept, configured through `configs.write`, as test 1 of `repro/review-2-repro.test.ts` does; it expects the row never online, and offline with the no-answer line once the lights' clock passes `CONNECT_TIMEOUT_MS`. `src/server/osc-tcp.ts` needs no change: the connect timeout bounds what it buffers to 3 s of bytes.
- **Must preserve:** the problem line cleared before the row reports online (`test/eos.test.ts:701`, `:721`, `:776`); `report.status('online')` before `readCues()`, so the check the server starts on coming online joins the same read; the connect burst's active cue seeding the live cue (`test/eos.test.ts:431`, `:499`); any packet resetting the ping count (`test/eos.test.ts:747`); one ping after a long stall (`test/eos.test.ts:764`); the log-once rule (`test/eos.test.ts:776`). All of `test/eos.test.ts`, `test/osc-tcp.test.ts` and `test/connections.test.ts` passed with this diff applied in a scratch worktree. Dropped on purpose: a chunk holding only part of a packet no longer resets the ping count; the packet's last chunk does.
- **Failure of the fix:** a peer that never frames a packet is dropped at the connect timeout, every 5 s retry, and logs once; `packetReader` buffers at most 3 s of its bytes before `destroy()` frees them.
- **Do not touch:** the `failure` half of `if (stopped || failure) return;` (dismissed as a defensive guard below); `CONNECT_TIMEOUT_MS` being timed, not counted (dismissed below).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-2-repro.sh` fails test 1 today and must pass it after; the new test in `test/eos.test.ts` is red before the fix and green after: `pnpm exec vitest run test/eos.test.ts`.

### 2. The pre-service check says a cue never fires when a cue of another section fires it on a follow or hang — LOW
- **Location:** `src/server/eos.ts:469-470`
- **Attribution:** introduced by `b00bc57` (setlist-controller#252 review pass 1 finding 1: the check names a cue a follow, hang or link fires by itself as one that never fires), which exempted only the chain after the first labelled cue: `git log -S'firedAfter(fires.number)' 6aec698..HEAD`.
- **Real-world trigger:** the lighting designer gives a section a second look by linking the previous section's last cue to a cue carrying the next section's label, such as a Bridge cue whose follow links to a second "Goodness of God / Chorus" cue for the final chorus. Eos fires it every time, and the check tells the producer "Goodness of God: cue 12 never fires, cue 3 has the same label", which invites deleting or relabelling a cue the show uses. LOW, capped: upgrade to MEDIUM if a show file links across sections onto a cue with a repeated label; check via the lights row's cue list after a read.
**Evidence**
```ts
const [fires, ...shadowed] = allLabelledFor(song.title, name);
...
const followed = firedAfter(fires.number);
for (const cue of shadowed.filter((cue) => !followed.has(cue.number))) lines.add(`${songTitle(song)}: cue ${cue.number} never fires, cue ${fires.number} has the same label`);
```
**Failure mode** — show: the recorded show with cue 3.5 "Goodness of God / Bridge" given `follow: 1000, link: 12`, and a cue 12 "Goodness of God / Chorus" at the end. Only cues fired after cue 3 are exempt, so cue 12 is named. Proved: `sh docs/reviews/setlist-controller-108/repro/review-2-repro.sh`, test 2, gives `{ kind: 'unmatched', names: ['Goodness of God: cue 12 never fires, cue 3 has the same label'] }` where `{ kind: 'matched' }` is right.
**Recommended fix**
```diff
     async check(set: SetList) {
       await readCues();
       if (!listRead) throw new Error(`The lights have not read cue list ${cueList} in full yet`);
       if (cues.length === 0) return [`Cue list ${cueList} is not in the show file, or holds no cues.`];
+      const fired = new Set(cues.flatMap((cue) => [...firedAfter(cue.number)]));
       const lines = new Set<string>();
       for (const song of set.songs) {
         ...
-          const followed = firedAfter(fires.number);
-          for (const cue of shadowed.filter((cue) => !followed.has(cue.number))) lines.add(...);
+          for (const cue of shadowed.filter((cue) => !fired.has(cue.number))) lines.add(...);
```
The comment at `src/server/eos.ts:449-452`, "save a cue Eos fires by itself after <m> on a follow or hang, which does fire", becomes "save a cue Eos fires by itself after any cue on a follow or hang, which does fire", rewrapped at 100 characters (see finding 4).
**Remediation brief**
- **Design intent:** a cue fires by the lights only as the first in list order labelled for its song and section (`labelledFor`); Eos fires a cue by itself after any cue that has a follow or hang, by the link or the next cue (`firesNext`, `firedAfter`), whoever fired that cue. The shadow line is advice to delete or relabel, so it must never name a cue that fires. Accepted false negative: a shadowed cue fired only after another cue that itself never fires goes unnamed.
- **Full surface:** `src/server/eos.ts:456-474` (`check`), `src/server/eos.ts:447-455` (its comment), and a new test in `test/eos.test.ts` beside "names no cue with the same label that Eos fires by itself after the cue that fires" (`test/eos.test.ts:581`), built as test 2 of `repro/review-2-repro.test.ts` through `lightsRig({ show })` and `checked()`.
- **Must preserve:** `test/eos.test.ts:565` (two shadowed cues named, by both numbers), `:581` (cue 11, which nothing fires, still named; a chase looping back ends), `:601` (set order, beside the no-cue lines; nothing for a section the set lacks), `:558` (unique labels are matched). All pass with the diff applied.
- **Failure of the fix:** `firedAfter` ends on a loop by its own `fired` set, so a chase cannot hang the check; the cost is one chain walk per cue, linear in practice for a few hundred cues.
- **Do not touch:** `labelledFor` and `allLabelledFor`, which the fire and `actsOn` share with the check (#248's assumption).
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-2-repro.sh` fails test 2 today and must pass it after; the new test in `test/eos.test.ts` is red before and green after: `pnpm exec vitest run test/eos.test.ts`.

### 3. Six rules of the stage-2 code change with no test going red — LOW
- **Location:** `src/server/eos.ts:406`, `:356`, `:380`, `:384`, `:374-375`; `src/server/connections.ts:260`, with its test step at `test/connections.test.ts:302`
- **Attribution:** introduced, each by its ticket: `actsOn` by `6168658` (#248); `shown = null` on online, the `!wasOnline` branch and the close handler's timer stop by `039148b` (#249); `live = null` on close kept by `a450c2e` (#250); the list copy by `9b8eda0` (#251).
- **Real-world trigger:** none today; the code is right. A later change that breaks one of these ships green. LOW.
**Evidence** — each mutant applies cleanly and leaves its suite green (`exit 0`, 65 of 65 in `test/eos.test.ts`, 19 of 19 in `test/connections.test.ts`):
- `acts-before-read`: `actsOn: (cue: Cue) => !listRead || labelledFor(...)`: a section played before the first read finishes would be measured and logged. #248's assumption: "Before the first read finishes, no section is acted on".
- `shown-reset`: delete `shown = null;` on coming online: the same failure after an online spell would not be logged again. #249's assumption: "logs when its problem line differs from the one last logged since the lights were last online". The only test that logs a line twice has "closed" in between.
- `live-on-close`: delete `live = null;` in the close handler: after a reconnect the row would keep the pre-drop cue and the burst's active cue would be ignored, and the follow rule would judge against a stale cue. #250's assumption 3. Every reconnect test reconnects to the cue Eos was on before.
- `reset-online`: `error !== null && !wasOnline ?` to `error !== null ?`: an ECONNRESET on an open connection would read "could not connect ... ECONNRESET" instead of "Eos closed the connection to the lights.". #249's assumption names this case; `fake.refuse()` closes cleanly, so no test raises an error on an open connection.
- `close-timers`: delete `stopTimers?.(); stopTimers = null;` from the close handler: the old connection's ping timer outlives it, writes pings over the next connection through `send`, counts them unanswered, and after three calls `drop()`, whose `stopTimers?.()` then cancels the new connection's pings, so a later silence is never noticed. Read from the code, not executed; no test runs a silence after a reconnect.
- `list-copy`: `list: list ? [...list] : []` to `list: list ?? []`: the server would keep the target's own array. `test/connections.test.ts:302` pushes onto the reported array but the next report replaces it before any snapshot is built, so the step asserts nothing. The same shape for `state` at `test/connections.test.ts:259` is on the base.
**Failure mode** — the six rules are claimed by the tickets' assumptions and comments, and a regression in any of them passes `pnpm test`.
**Recommended fix** — one test per rule, each driving the real server through `lightsRig` and the fake Eos:
1. `acts-before-read`: `fake.holdReads()` before the lights connect so the first read never finishes, play into a section that has a cue, and expect no lights line in the lateness log and no lights lateness on the row. Precedent: "never measures a section with no cue" (`test/eos.test.ts:1334`).
2. `shown-reset`:
```ts
it('logs the same silence again after an online spell', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { fake, clock, read, comesOnline, latest } = await lightsRig();
  await read();
  const stopped = `Setlist server: Eos stopped answering the lights at 127.0.0.1:${fake.port}.`;
  for (let round = 1; round <= 2; round += 1) {
    const sent = pings(fake).length;
    fake.silence();
    for (let ping = 1; ping <= 3; ping += 1) {
      clock.advance(PING_MS);
      await vi.waitFor(() => expect(pings(fake)).toHaveLength(sent + ping));
    }
    clock.advance(PING_MS);
    await vi.waitFor(() => expect(latest()?.connection).toBe('offline'));
    fake.speak();
    await comesOnline();
  }
  expect(logged.mock.calls.filter(([message]) => message === stopped)).toHaveLength(2);
});
```
3. `live-on-close`:
```ts
it('shows the cue Eos moved to while the lights were offline', async () => {
  const { fake, read, shows, next, lights, comesOnline } = await lightsRig();
  await read();
  fake.fireByHand('6');
  await shows(['Live cue 6: Great Are You Lord / Verse 1', ...RECORDED_LIST]);
  const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
  await fake.refuse();
  await dropped;
  fake.fireByHand('5');
  await fake.accept();
  await comesOnline();
  await shows(['Live cue 5: Great Are You Lord / Count Off', ...RECORDED_LIST]);
});
```
4. `reset-online`: give the fake (`test/fake-eos.ts`) a `reset()` that calls `socket.resetAndDestroy()` on each open socket, as `refuse()` destroys them, and a test that resets an online connection and expects the row's problem to be "Eos closed the connection to the lights.".
5. `close-timers`: after `fake.refuse()`, `fake.accept()` and `comesOnline()`, advance the lights' clock four `PING_MS` with the fake answering and expect the row online; then `fake.silence()`, advance four `PING_MS`, and expect offline with "Eos stopped answering the lights at ...". Precedent: "shows offline when the connection goes silent" (`test/eos.test.ts:721`).
6. `list-copy`: after `list.push(...)` at `test/connections.test.ts:302`, force a snapshot with no new report, such as an arm (`sendThen(producer, { kind: 'arm', target: 'eos' }, row('online', 'armed'))`), and expect that snapshot's list to be `['Cue 1 Walk in', 'Cue 2 Verse']`; do the same for `state` at `:259`.
**Remediation brief**
- **Design intent:** each rule is one the tickets recorded on purpose (the assumptions quoted above). The tests pin behaviour at the seam, through the row, the log and the lateness log, never inside the adapter, as the epic's testing decisions require.
- **Full surface:** `test/eos.test.ts` (tests 1 to 5), `test/fake-eos.ts` (the `reset()` method and its line in the `FakeEos` type at `test/fake-eos.ts:53-87`), `test/connections.test.ts:259` and `:302` (test 6). No production file changes.
- **Must preserve:** every existing test; the fake's `refuse()` keeping a clean close, which "shows offline while the fake refuses" (`test/eos.test.ts:776`) relies on for its "closed" line.
- **Do not touch:** the `failure` guard at `src/server/eos.ts:350` and `stopTimers?.()` in `drop()` at `:336`, equivalent mutants dismissed below; the production code of all six rules, which is correct.
- **Proof:** `sh docs/reviews/setlist-controller-108/repro/review-2-mutants.sh <name>` for each of `acts-before-read`, `shown-reset`, `live-on-close`, `reset-online`, `close-timers`, `list-copy` exits 0 today and must exit non-zero once its test lands; each new test passes at HEAD: `pnpm exec vitest run test/eos.test.ts test/connections.test.ts`.

### 4. Comment hygiene — LOW (aggregated)
- `src/server/eos.ts:452` — one line of the `check` comment, "does, save a cue Eos fires by itself after <m> on a follow or hang, which does fire. A line is given once. A cue list with no cues gives one line instead, since Eos counts a", runs about 200 characters → rewrap the paragraph at 100, with finding 2's wording.
- `test/fake-eos.ts:206-207` — "The base cue that many places from the current cue in list order, or undefined past either end. With no current cue, the cue after it is the first." sits above `connectBurst`, which it does not describe → move it above `step` (about `test/fake-eos.ts:224`).
- `test/fake-eos.ts:12-13` — "It keeps cue list" / "1's current cue" breaks mid-phrase → rewrap the paragraph.
- `web/src/ConnectionsPanel.tsx:15` — "median, and the same for when it acted on them, for a target that reports it. Every button is disabled while the" runs 115 characters → rewrap the comment at 100.
- `web/src/styles.css:793` — "The list is capped at about eight lines" → "The list is capped at about eleven lines": no `line-height` is set anywhere in `web/src/styles.css`, so at `font-size: 1.125rem` and the normal line height, 15rem holds about eleven.
- `docs/install.md:86` — "The lights act only on a section, Count Off, Pad, Pad Out or End that a cue in their cue list is labelled for" → "... that a cue is labelled for in their cue list as last read in full, so on none before the lights first read it".
- `docs/install.md:97` — "A cue fired at the console, the producer's Go or Back, and a cue Eos fires by itself on a follow or a hang never count as acting on one." → add "Only a fire of the very cue the lights fired, within that second, counts, since Eos's events cannot tell it apart from the answer to the lights' own fire."

## Needs Further Investigation
### A. A Go or Back that Eos never answers takes the next fire event as its answer, so the lights' own fire that follows is not measured — confirm by recording a Go on the last cue and a Back on the first
`src/server/eos.ts:167-175`, used at `:248`. A pending `'go'` or `'back'` accounts for any fire event and the oldest match wins. Finder A reproduced, against the fake: `fireByHand('2')` on a two-cue show, `runButton('go')` (the fake answers a Go past the end with nothing), then the section cue fires cue 1 within the second: cue 1's fire event is taken by the stale Go, `actedOn` is never called, and the section's lateness line goes out with `actedMs: null`; the real `{ cue: '1' }` stays pending for the rest of the window. Unproved: whether real Eos sends any event for a Go past the last cue or a Back before the first (no recording covers either). What would confirm it: in #140's session on Augment3d, record a Go on the last cue and a Back on the first. What would kill it: Eos answers each with an event the adapter already consumes. If confirmed, the fix is not "an exact cue match first": with a Go that fires cue N pending before the lights' fire of N, an exact match would take N's first event for the lights' fire and leave Go's answer unmatched, and the second event of N would then pause the lights by hand. The fix has to drop a Go or Back once Eos has shown it will not answer, for example by the active or pending cue Eos sends after it. Severity if confirmed: LOW, a lost measurement. A follow's fire event using up a pending own command is the same family as pre-PR review 1's B.
### B. The log-once test can pass without any retry under load — confirm by counting refused connects
`test/eos.test.ts:786-791` stalls the lights' clock past `RETRY_MS` twice, each followed by a fixed 100 ms real-time wait, then expects one "refused" log line. If a refused connect has not closed within 100 ms, no retry runs, and the test passes without exercising the log-once rule. It went red under the log-every-failure mutant in this run, so it works on an idle machine. What would confirm it: run `pnpm test` with two lanes' suites at once and the mutant applied, and see it pass. What would kill it: it stays red. The fix either way is a count of connect attempts on the fake (it counts only accepted ones today, `fake.accepted()`) and a `vi.waitFor` on that count after each stall.

## Reviewed and Dismissed
- The liveness rests on Eos answering `/eos/ping`, which no recording shows (`test/fake-eos.ts:19-21`) — ETC's support article "Reverse-engineering OSC commands to be sent as strings via TCP connection" (support.etcconnect.com) sends `/eos/ping` behind a packet-length header over TCP and gets `/eos/out/ping`, with OSC TX on, which the no-answer line names. A recording stays #249's open proposal.
- Every other error on an open connection (ETIMEDOUT, EHOSTUNREACH, EPIPE) reads "Eos closed the connection to the lights." — #249's recorded assumption, which keeps the row to four lines the install doc can name.
- The connect timeout is timed, not counted, so a stall of more than 3 s right after start could drop a connection Eos did answer — the server does nothing that long at start, and the cost is one 5 s retry with a wrong line.
- A host with surrounding spaces passes validation and fails to connect — pre-PR review 1's dismissal stands; the ATEM validates the same way, and now the row says why.
- `if (stopped || failure) return;` (`src/server/eos.ts:350`) and `stopTimers?.()` in `drop()` (`:336`) are equivalent mutants — `destroy()` stops further data events, and the close handler stops the timers. Keep both as guards; no test can tell.
- Fire again within Eos's answer time of a section start settles the section's line with `actedMs: null` — `hand` in `src/server/connections.ts` settles before Fire again's unmeasured line by design, and the window is about 40 ms.
- The setup screen shows neither the live cue nor the cue list — `web/src/ConnectionsSetup.tsx:33` never showed `state`; the epic puts both on the producer row only.
- The ATEM reports `state(lines)` with no list, which clears `list` — correct: it has none.
- The Go's fire event takes a pending `{ cue }` command, or the reverse, out of order — the oldest-first rule is review 1's recorded behaviour, and Eos answers over one connection in command order.

## Minor / nits
- No `setNoDelay(true)` on the Eos socket (`src/server/eos.ts:328`). Nagle can hold a fire behind an unacknowledged ping for up to Eos's answer time; unmeasured, and cheap to add.
- `.connection-state-list` is a scroll region with no `tabindex`; a keyboard-only user on an older browser cannot scroll it. The pages are touch-first.
- The fake answers Go with the next cue in list order (`test/fake-eos.ts:224-229`); real Eos fires the pending cue, which after a link is the link's target. The adapter treats a Go's answer as any cue, so no test depends on it.
- The fake's connect burst keeps the recorded previous cue and command line text whatever the current cue is (`test/fake-eos.ts:212-223`); the adapter ignores both.
- A `setShow` show answers a fire with the bare fire event, no active cue after it (`test/fake-eos.ts:204`), so "ignore the active cue after a fire" is tested only on the recorded show (`test/eos.test.ts:473`, `:1277`).
- `test/connections.test.ts:328` asserts `.every(...)` over snapshots that may be none.
- `test/eos.test.ts:1252` and `:1290` assert that every snapshot so far kept the lights armed without a `producer.flush()` first, so a late pause snapshot could arrive after the check; unverified.
- The lights' "settle on offline" and "a no-cue section does not settle the waiting cue" are covered only through the shared path in `test/atem.test.ts`.
- `test/pages.test.ts:1149-1164` asserts the literal CSS values `15rem` and `auto`.

## Test quality
Tests added since review 1: 16 in `test/eos.test.ts` (65 in all), 1 in `test/connections.test.ts`, 2 in `test/pages.test.ts`, and the long-list spec in `e2e/lights.spec.ts`. Red before stage 2 (at `eee35ea`): all but four. The four green there are guards, not tautologies: `test/eos.test.ts:473` and `:1277` (the active cue after a fire is ignored; `eee35ea` ignored every active cue, and the take-every-active-cue mutant kills both at HEAD), `:558` (renamed only), `:1355` (Go, Back, a follow and a fire by hand never count as acting; `eee35ea` measured nothing, and four mutants kill it at HEAD). Green at base `6aec698`: 0 of the branch's tests in `test/connections.test.ts` and `test/pages.test.ts`. Tautology shapes: 0. One assertion-free step, `test/connections.test.ts:302` (finding 3, item 6). One fixed real-clock wait (Needs Further Investigation B). Mutation: 30 of 37 stage-2 mutants killed; the six survivors that matter are finding 3, and two are equivalent (dismissed).

## Prior-review closure
Pre-PR review 1 (`eee35ea`) had four findings, all LOW, none remediated on this branch: no commit since names them. Finding 1 (three own-command rules no test pins): untouched, all three of its mutants still survive. Finding 2 (the recording helper's padding, `scripts/eos/eososc.py:4`): untouched. Finding 3 (the recording script overwrites the fire-by-hand recording): untouched, `scripts/eos/` unchanged since. Finding 4 (comment hygiene): untouched, e.g. `test/osc-tcp.test.ts:9-10` and `e2e/eos.spec.ts:45` read as before. Fully fixed 0, partially fixed 0, untouched 4. They are not repeated here; their briefs in `pre-pr-review-1.md` still apply.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build all green at `db26f8e`; Playwright green locally. The new repro files lint clean; `review-2-repro.test.ts` sits outside `test/`, so neither vitest nor tsc runs it.
- **Commit hygiene:** one commit per ticket and per review pass, each opening with its issue reference; the merge pairs of #248 to #252 come from the lanes. Nothing to drop.
- **Likely reviewer asks:** #140's install doc and the acceptance run on Augment3d, which should also record a ping, a Go past the last cue and a Back before the first (Needs Further Investigation A), and say to leave the OSC TCP mode at OSC 1.0 (finding 1); review 1's open LOW findings.

## Verdict
**Ready to open a PR with follow-ups.** Nothing here gates the PR: all four findings are LOW. Findings 1 and 2 are small fixes with their red tests already written (`repro/review-2-repro.test.ts`); finding 3 is six tests; finding 4 is one comment commit. Needs Further Investigation A and B belong to #140's session and a loaded test run. The PR itself waits only on #140, which is Nick's.
