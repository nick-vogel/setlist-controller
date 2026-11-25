# Pre-PR review: setlist-controller#114 ATEM: the lobby feed cuts to Camera at each Count Off

**Branch:** `setlist-controller-114-atem-lobby-feed` vs `origin/main` (merge-base `fe40b98` "Merge pull request #167 from nick-vogel/setlist-controller-113-connections-foundation")
**Reviewed at:** HEAD `dcb7d67` (setlist-controller#143 ATEM pause by hand: a cut in ATEM Software Control pauses automation), clean tree: 0 files with uncommitted changes, 0 untracked; 19 files total, +1464 / -21 against the merge-base
**Reviewed against:** the epic body of setlist-controller#114 (Solution, user stories 1 to 22, Implementation and Testing Decisions), the bodies and acceptance criteria of the four sub-issues this branch carries (#141, #142, #143, #144; #145, the real-unit ticket, is not on the branch), and the per-ticket assumptions the run recorded. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules (load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape) are the conformance checklist. Round 1, `--fresh`.
**Date:** 2026-10-21
**Reviewer:** 2 code-review agents + verify pass (mutation runs and one executed repro by the orchestrator)

This is the first review of the integrated epic. Each ticket was reviewed alone in its lane; this review looks at the merged whole, and at the real library underneath the switcher client.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | ok |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and server suites | `pnpm test` | 50 files, 1003 passed, 4 skipped (the Linux-only setup-screen refusal cases, as on main) |
| Build | `pnpm build` | green |
| Playwright | `pnpm test:e2e` | 44 passed, no retries |
| ATEM suites, repeated | a finder ran `test/atem.test.ts` 5 more times | 41/41 every time, no flake |
| New tests against `$BASE` | scratch worktree at `fe40b98`, the branch's `test/pages.test.ts` copied in | both new device-check tests red at base (2 failed, 86 passed). `test/atem.test.ts`, `test/atem-switcher.test.ts` and `e2e/atem.spec.ts` import modules the base does not have, so they are red there by construction; the mutation runs below stand in for a base oracle |
| Mutation audit, `src/server/atem.ts` | 12 one-line mutants in a scratch worktree at HEAD, `pnpm exec vitest run test/atem.test.ts` each | killed: `pausesOnFade: true` (2 red), cut on every cue (5), drop the input-already-on-program guard (1), own cuts read as by hand (4), window 2000 to 100000 ms (1), no model note (5), `known = null` on connect (4), status always online (5), `stop` that does not close (1). Survived: row line reported after the pause instead of before, own-cut match on any input (`repro/review-1-mutation-own-cut-any-input.diff`), own cuts never consumed. See finding 3 and Test quality |
| Mutation audit, `src/server/atem-switcher.ts` and the catch paths | 4 mutants, `test/atem.test.ts` plus `test/atem-switcher.test.ts` | killed: no `error` listener. Survived: no `connected ?` guard on the state, a cut with no `.catch` (`repro/review-1-mutation-cut-no-catch.diff`), a connect failure rethrown (`repro/review-1-mutation-connect-rethrows.diff`). See finding 2 |
| Finding 1 (signal takeover) | `repro/review-1-atem-signal-takeover.test.ts`, copied into `test/` of a scratch worktree at HEAD and run | red: `expected { code: 143, closed: false } to deeply equal { code: 0, closed: true }` |
| Recommended fix 1 | applied in the scratch worktree, then `pnpm exec tsc -p .`, `pnpm exec eslint src/server/atem-switcher.ts`, and `pnpm exec vitest run test/review-1-atem-signal-takeover.test.ts test/atem-switcher.test.ts test/atem.test.ts` | tsc clean, lint clean, 53 passed: the repro goes green and the 52 ATEM tests stay green. The whole unit suite was not re-run with the fix |
| Library behaviour | read `atem-connection@3.10.3` `dist/atem.js`, `dist/lib/atemSocket.js`, `dist/commands/MixEffects/ProgramInputCommand.js`, and `exit-hook@2.2.1` `index.js` | `connected` fires after the init dump; `stateChanged` only while connected, one per received packet; `disconnected` then `_state = undefined`; a PrgI always returns its path, changed or not; `_createSocketProcess` registers exit-hook (finding 1) |
| Not run | the real ATEM Mini | no unit here; #145 owns the acceptance run. Whether the hardware answers a cut to the input already on program is unverified (Needs Further Investigation A) |

**Overall:** The epic does what its four tickets asked: the Count Off cut, Fire again, the Pro and Camera buttons, the pause by hand with its 2-second own-cut window, the program line, and the device pre-service check all hold up, and the tests behind them go red when the behaviour is removed. One real defect: once the ATEM has connected, the `atem-connection` library's exit-hook takes over SIGTERM and SIGINT and exits at once, so the server's own close never runs, and a Fade out's held volumes are never set back. Fix finding 1 before the PR opens; findings 2 to 5 are LOW and can ride along or become follow-ups.

## Approach decisions
- Signal handling with the ATEM library (finding 1): the switcher client, the only module that imports `atem-connection`, removes the SIGINT and SIGTERM listeners the library added during `connect`, by comparing `process.listeners(signal)` before and after, so `main.ts` keeps sole ownership of shutdown and its handler needs no change. The library's `exit` listener stays, so the socket thread is still destroyed on any `process.exit`. Rejected: removing all signal listeners in `main.ts` after `startServer` (it relies on connect having run first and strips listeners the server did not see added), and a `pnpm patch` of the library (a patch to carry through #145's re-pin).
- Fake switcher failure modes (finding 2): extend `test/fake-switcher.ts` with options, as it already has `online`, `program`, `inputs` and `info`, rather than mocking the switcher client with `vi.fn`, so the failure tests drive the real server as the other ATEM tests do.

## Confirmed Issues
### 1. Once the ATEM connects, the library takes over SIGTERM and SIGINT, so the server's own close never runs and a Fade out's held volumes stay down — MEDIUM
- **Location:** `src/server/atem-switcher.ts:51` (`connect`), against `src/server/main.ts:89-95` (the signal handlers)
- **Attribution:** introduced by `4db4b29` (setlist-controller#141 ATEM tracer bullet), which added `atem-connection` 3.10.3 (`git log -S'"atem-connection"' fe40b98..HEAD -- package.json` names it) and the `connect` that creates the library's socket thread. The base has no such listener.
- **Real-world trigger:** any stop of the server by signal while an ATEM section is configured and valid: `launchctl bootout` of the launch agent (which sends SIGTERM, per the comment at `main.ts:88`), a reinstall through the install script, or Ctrl-C on `pnpm dev:server`. The consequence that matters is a stop while a Fade out holds the music down or silent: the server would set every track back to its saved volume in `fade.close()` (`src/server/fade-out.ts:252-256`), and with this defect it never does, so Live is left silent and the saved volumes go with the process. MEDIUM, capped: upgrade to HIGH if the server is ever stopped or restarted during a service or rehearsal with the music faded, which a person at the laptop can answer.

**Evidence** — the library, run on `connect`:

```js
// atem-connection/dist/lib/atemSocket.js, end of _createSocketProcess()
this._exitUnsubscribe = exitHook(() => { this.destroy().catch(() => null); });
// exit-hook@2.2.1/index.js, on first registration
process.once('SIGINT', exit.bind(null, true, 2));
process.once('SIGTERM', exit.bind(null, true, 15));
// ...and exit() runs the callbacks, then process.exit(128 + signal)
```

`startServer` awaits `connections.start()` (`src/server/server.ts:225`), which awaits the ATEM's `start`, which awaits `switcher.connect(host)` (`src/server/atem.ts:137`), so exit-hook's listeners are on the process before `main.ts:89` adds its own.

**Failure mode** — on SIGTERM, exit-hook's listener runs first and calls `process.exit(143)` synchronously. Even if main's handler ran first, exit-hook's would still run in the same emit and exit before `server.close()` resolved. Skipped: `stopPoll`, `fade.close()` (the volume restore), the MIDI close, `connections.stop()` for every target, `hub.close()`, `live.close()`, the HTTP close, and the exit code 0. Executed proof: `repro/review-1-atem-signal-takeover.test.ts` starts a child Node process that connects the real switcher client to 127.0.0.1 (no ATEM listens there), installs a SIGTERM handler shaped like main's (it finishes after a timer and exits 0), and sends it SIGTERM. Now: exit code 143, the handler never finishes.

**Recommended fix**

```diff
--- a/src/server/atem-switcher.ts
+++ b/src/server/atem-switcher.ts
@@ -27,6 +27,8 @@ export type AtemLike = {
 const PROGRAM_PATH = 'video.mixEffects.0.programInput';
 
+const SIGNALS = ['SIGINT', 'SIGTERM'] as const;
+
 export function atemSwitcher(atem: AtemLike = new Atem()): SwitcherClient {
@@ -48,7 +50,14 @@ export function atemSwitcher(atem: AtemLike = new Atem()): SwitcherClient {
   return {
-    connect: (host) => atem.connect(host),
+    async connect(host) {
+      const before = new Map(SIGNALS.map((signal) => [signal, process.listeners(signal)]));
+      try {
+        await atem.connect(host);
+      } finally {
+        for (const signal of SIGNALS) for (const listener of process.listeners(signal)) if (!before.get(signal)?.includes(listener)) process.off(signal, listener);
+      }
+    },
     close: () => atem.destroy(),
```

Then move the repro into `test/` as a permanent test (for example `test/atem-switcher-signals.test.ts`, keeping its body), so a library upgrade that registers signal listeners again goes red. Add one load-bearing comment line above `connect` saying why the listeners are removed (the library's exit-hook exits on the signal before the server's close can run); the diff above carries none by convention.

**Remediation brief**
- **Design intent:** `main.ts` owns shutdown. Its SIGTERM and SIGINT handler closes the advertiser, then awaits `server.close()`, which closes the poll, the fade (setting held volumes back), the MIDI input, every connection target, the hub and the bridge, with a 3-second unref'd backstop to `process.exit(0)`. No library may exit the process on a signal underneath it. The switcher client is the only module that touches `atem-connection` (`atem-switcher.ts:4-6`), so the library's side effects are contained there.
- **Full surface:** `src/server/atem-switcher.ts:51` (the `connect` member, plus the new `SIGNALS` constant beside `PROGRAM_PATH` at line 28); a new test file in `test/` from `docs/reviews/setlist-controller-114/repro/review-1-atem-signal-takeover.test.ts`. `src/server/main.ts:89-95` does not change. `test/atem-switcher.test.ts` drives `connect` on a stub that adds no listeners, so it is unaffected.
- **Must preserve:** exit-hook's `exit` listener (it destroys the socket thread on any `process.exit`, including main's own `process.exit(0)`), so only SIGINT and SIGTERM listeners are removed; `close()` still calls `atem.destroy()` (pinned by "closes the switcher client when the server stops" in `test/atem.test.ts:443`); `connect` still rejects when the library's connect rejects (the `finally` does not swallow), so `atem.ts:136-140` still logs it; the library's own reconnect (`autoRestart` and the socket's retry timer) is untouched, since exit-hook registers only once per process. The fix's own failure: it strips any SIGINT or SIGTERM listener added by anything during the await, and the server starts targets concurrently (`src/server/connections.ts:183`). Today the ATEM is the only real target kind, so nothing else adds one; a future target that installs a signal listener in its `start` would lose it, and that target's review must check this.
- **Do not touch:** `src/server/main.ts:89-95` (the handlers are right; the library is the problem); the `error` listener at `atem-switcher.ts:47` (a mutant without it went red, and it keeps a library error from throwing out of the emitter).
- **Proof:** `cp docs/reviews/setlist-controller-114/repro/review-1-atem-signal-takeover.test.ts test/ && pnpm exec vitest run test/review-1-atem-signal-takeover.test.ts` is red now (`code: 143, closed: false`) and must pass after; then `pnpm test`.

### 2. The cut and connect failure paths have no test, and the fake switcher cannot fail — LOW
- **Location:** `src/server/atem.ts:97` (`switcher.changeProgramInput(input).catch(failed(what))`), `src/server/atem.ts:136-140` (the `connect` catch), `test/fake-switcher.ts:63` and `:78` (a `connect` that never throws, a `changeProgramInput` that always resolves)
- **Attribution:** introduced by `4db4b29` (setlist-controller#141), carried by #142's buttons (`fe60bc9`).
- **Real-world trigger:** none today, since the code is right: this is a missing guard against a regression. The guarded consequence is the worst one this epic has. A cut with no `.catch` whose promise rejects is an unhandled rejection, which ends a Node 24 process, so playback stops mid-song (user story 19). The library rejects from `changeProgramInput` when its socket thread is not open. LOW, as this repo rated the connection layer's untested fallbacks (`docs/reviews/setlist-controller-113/pre-pr-review-1.md` finding 8).

**Evidence** — `repro/review-1-mutation-cut-no-catch.diff` (the cut's `.catch` replaced by `void`) and `repro/review-1-mutation-connect-rethrows.diff` (the connect catch rethrows) each leave `test/atem.test.ts` and `test/atem-switcher.test.ts` at 52 passed.

**Failure mode** — remove either catch and every test stays green; on the rig, the first cut that rejects, or a connect that rejects, crashes the server or fails the ATEM's start with nothing logged in the ATEM's words.

**Recommended fix** — give `fakeSwitcher` two options in its existing options object, `failConnect?: Error` (its `connect` rejects with it after recording the host) and `failCuts?: Error` (its `changeProgramInput` records the input in `programs`, then rejects with it), and add three tests to `test/atem.test.ts` in its existing rig style: a connect that fails leaves the ATEM row offline while the fake target still starts and the server answers; a Count Off cut that rejects leaves the row and its arm state as they were and the server serving the next snapshot; a button press that rejects does the same. Spy on `console.error` with `vi.spyOn` and assert the messages `Setlist server: the ATEM could not connect to <host>` and `Setlist server: the ATEM could not cut to Camera` (and `cut to Pro`).

**Remediation brief**
- **Design intent:** every promise the adapter starts and does not await is caught where it starts, so one bad ATEM never stops the server or another target (#113's rule). `cut` is the single place every cut goes through, Count Off, Fire again and both buttons alike.
- **Full surface:** `test/fake-switcher.ts:33-38` (the options object and its defaults), `:63` (`connect`), `:78` (`changeProgramInput`), the `FakeSwitcher` header comment at `:3-11`; new tests in `test/atem.test.ts`. No production change.
- **Must preserve:** the fake's existing defaults (online, program 1, inputs 1 to 4, the ATEM Mini info), its recording of every program change in `programs` (the "do nothing while offline" test at `test/atem.test.ts:355` relies on it), and `holdEchoes` and `releaseEchoes` for the window tests at `:276` and `:290`.
- **Do not touch:** `src/server/atem.ts:97` and `:136-140`; they are correct.
- **Proof:** with the new tests in place, `git apply docs/reviews/setlist-controller-114/repro/review-1-mutation-cut-no-catch.diff && pnpm exec vitest run test/atem.test.ts` must go red, then `git apply -R` the same diff; the same for `review-1-mutation-connect-rethrows.diff`.

### 3. The own-cut list can keep cuts the ATEM will never answer one by one, and its per-input matching has no test — LOW
- **Location:** `src/server/atem.ts:101-107` (`ownCut`), `src/server/atem.ts:119-125` (the connection listener, which keeps `sent`)
- **Attribution:** introduced by `e36ae4c` (setlist-controller#143).
- **Real-world trigger:** the library emits one `stateChanged` per received packet with only the final state (`atem.js` `_mutateState`). When the producer presses Pro then Camera quickly and the ATEM answers both in one packet, `onProgram` fires once with Camera, and the Pro entry stays in `sent` for 2 seconds. An operator cut to Pro at the ATEM inside those 2 seconds is then read as the adapter's own and does not pause. The same leftover follows a cut lost to a disconnect, and carries across a reconnect inside the window. LOW: it needs two quick presses and an operator cut inside 2 seconds, and the miss lasts until the next by-hand cut.

**Evidence**

```ts
const ownCut = (input: number) => {
  const now = clock.now();
  sent = sent.filter(({ at }) => now - at <= OWN_CUT_WINDOW_MS);
  const own = sent.findIndex((cut) => cut.input === input);
  if (own >= 0) sent.splice(own, 1);
  return own >= 0;
};
```

**Failure mode** — `sent = [Pro@t, Camera@t+50]`; one report of Camera removes the Camera entry and leaves Pro; an operator cut to Pro at t+1000 matches it and is not a change by hand. Separately, `repro/review-1-mutation-own-cut-any-input.diff` (match any pending cut, whatever its input) survives all 41 tests in `test/atem.test.ts`, so the assumption that matching is per input ("an operator's cut to the other input right after a Count Off still pauses", #143's assumptions) is not pinned.

**Recommended fix** — in `ownCut`, when a report matches the entry at index `own`, drop every entry up to and including it (`sent = sent.slice(own + 1)` in place of the `splice`), since the ATEM applies commands in order and a later cut's report means the earlier ones were applied; and clear `sent` in the connection listener on both connect and disconnect (`sent = []` beside `known = ...`). Add two tests to `test/atem.test.ts` beside the window tests: with `holdEchoes()`, press Camera, then `cutAtSwitcher(4)` before `releaseEchoes()`, and the ATEM pauses by hand; and with `holdEchoes()`, press Pro then Camera, release, then `cutAtSwitcher(PRO)` inside the window, and the ATEM pauses by hand.

**Remediation brief**
- **Design intent:** a program report is the adapter's own when it matches a cut the adapter sent within the last 2000 ms, by input, oldest first; any other report of an input other than the one on program is a change by hand, reported after the row's new line. The window only bounds a cut whose report never comes.
- **Full surface:** `src/server/atem.ts:104-105`, `src/server/atem.ts:120-124`; new tests in `test/atem.test.ts` after `:290`.
- **Must preserve:** the late-echo pair at `test/atem.test.ts:276` (1999 ms is own) and `:290` (2001 ms is by hand); "is never the ATEM's own cuts" at `:251` (four own cuts, in order, never pause); "is never a cut made at the ATEM to the input already on program" at `:268`; recording a cut before it is sent (`atem.ts:96`), since the fake reports inside `changeProgramInput`.
- **Do not touch:** the `input !== known` guard at `atem.ts:131` (Reviewed and Dismissed: stale entries that only match the input already chosen).
- **Proof:** the two new tests are red now and green after; `git apply docs/reviews/setlist-controller-114/repro/review-1-mutation-own-cut-any-input.diff && pnpm exec vitest run test/atem.test.ts` goes red after, then `git apply -R` it.

### 4. A library that fails to load disables the ATEM with no test of it — LOW
- **Location:** `src/server/main.ts:46-55` (`loadAtemKind`)
- **Attribution:** introduced by `4db4b29` (setlist-controller#141). The nearest precedent, `openMidiInput` in the same file, is equally untested (`git grep -n "openMidiInput\|unavailableMidiInput" test` finds nothing).
- **Real-world trigger:** a playback Mac whose Node cannot load the library's native prebuild (`@julusian/freetype2`, which `pnpm-workspace.yaml` tells pnpm not to build). The code handles it; nothing pins that it does. LOW.

**Evidence** — `git grep -n "could not be loaded\|loadAtemKind" -- test e2e` finds nothing. `loadAtemKind` lives in `main.ts`, which starts the server at top level, so no test can import it there.

**Recommended fix** — move `loadAtemKind` into `src/server/atem.ts` (or a small module beside it) with the loader injected, `loadAtemKind(load: () => Promise<{ atemSwitcher: () => SwitcherClient }> = () => import('./atem-switcher.ts'))`, call it from `main.ts` unchanged in effect, and add a test that passes a rejecting loader and starts the rig with `test/fixtures/connections/atem.json` plus a fake target, asserting the ATEM row is not configured with `The ATEM library could not be loaded: <message>` and the fake target still starts, in the shape of the "a bad ATEM section" test at `test/atem.test.ts:521`.

**Remediation brief**
- **Design intent:** the library loads only by dynamic import, so the server module and every rig test stay clear of its native package; a load failure disables the ATEM alone, with the reason on its row.
- **Full surface:** `src/server/main.ts:43-59`, the new home of `loadAtemKind`, a new test in `test/atem.test.ts`.
- **Must preserve:** the default loader must remain a dynamic `import('./atem-switcher.ts')` inside the function, so that importing `atem.ts` never loads the library (every rig test imports `atem.ts`); the `console.error` line and the problem's wording.
- **Do not touch:** `openMidiInput`; it is the precedent and outside this epic.
- **Proof:** the new test passes; replace the fallback's `create` with one that throws and it goes red.

### 5. Comment hygiene — LOW (aggregated)
- `docs/install.md:237` — "No kind of target ships yet, so for now any section names a kind the server does not know. The kinds arrive with the epics that build each target." → "The ATEM is the one kind that ships, keyed `atem`. The other kinds arrive with the epics that build each target." (The ATEM section's own fields and install steps are #145's, per the epic's last ticket.)
- `src/server/main.ts:43-44` — "so the server module and every test stay clear of its native package" → "so the server module and every rig test stay clear of its native package" (`test/atem-switcher.test.ts:1` imports the library on purpose; `atem-switcher.ts:5-6` already says "every rig test").
- `test/atem-switcher.test.ts:7-8` — "Its state is the library's own empty state, set as the library sets it." → "Its state is undefined until a test sets it, then the library's own state from `AtemStateUtil.Create()`; the library itself starts with an empty state, which the client's `connected` guard hides." (The stub starts at `current: undefined` at line 16.)

## Needs Further Investigation
### A. Whether the ATEM answers a cut to the input already on program
Every Count Off sends a cut to Camera, even when Camera is on program (#141's assumption). The library reports a PrgI whenever the ATEM sends one, changed or not, and the fake always reports. If the hardware sends nothing for a cut that changes nothing, the cut's entry sits in `sent` for 2 seconds. Checked: the only report it can then absorb is one of Camera, the input already chosen, so nothing goes wrong (see Dismissed). What would settle it: #145's acceptance run on the church's ATEM Mini, with `debug` logging of received commands during a Count Off while Camera is on program. It matters only to the reach of finding 3.

### B. Whether an exception thrown from a connections callback inside a library event escapes into threadedclass
The switcher client calls the connections callbacks (`report.status`, `report.state`, `report.changedByHand`) from inside the library's `connected`, `disconnected` and `stateChanged` listeners (`src/server/atem-switcher.ts:33-45`). If one threw, the throw would leave eventemitter3 inside threadedclass's async callback. No evidence any of them throws: they are the same callbacks every target calls. What would confirm it: a fake connections report that throws, driven through the real wrapper over the library's emitter.

## Reviewed and Dismissed
- The connection events and the state: `connected` fires only after the init dump (`_onInitComplete`), so `programInput()`, `inputs()` and `info()` are complete when the check runs on coming online; `stateChanged` fires only while connected, and never for the batch carrying InitComplete, so no program report precedes the `known` seed.
- Listener leaks on reconnect: `start` registers each listener once, and the library keeps one emitter across reconnects.
- `PROGRAM_PATH`: matches `ProgramInputUpdateCommand.applyToState`'s `video.mixEffects.${me}.programInput`.
- Input numbers: the config's numbers are the library's source ids, 1 to 4 for the Mini's HDMI inputs; `inputs()` also lists Black, bars and media players, which only widens what counts as present.
- Stale own-cut entries matching the input already chosen (finder notes F2 second half, and the Fire-again case): the only report such an entry can absorb is a cut to the input the adapter itself just chose, which changes nothing the producer did not want. Do not "fix" this by dropping the `input !== known` guard or by comparing before sending.
- A cut dropped by a disconnect resolves rather than rejects (the library's `allSettled`): cues and buttons are gated on online in `src/server/connections.ts`, so a cut in flight at a drop is the only case, and the row goes offline anyway.
- Mix effect 0 hard-coded: the epic is scoped to the base ATEM Mini, which has one mix effect; Aux buses and multi-ME models are out of scope.
- `PreServiceCheck` consumers: only `checkOf` in `src/server/connections.ts` and `CheckResult` in `web/src/PreServiceCheck.tsx` narrow on `kind`, and both handle `device`.
- E2E ports: `e2e/atem.spec.ts` uses `startE2eRig`, on ports the OS assigns; `4031` in the fixture is only validated by the fake kind, never bound.
- Negative assertions in `test/atem.test.ts`: each is read after `settled()` (a ws ping and pong), and the hub publishes synchronously, so a pause or a cut would arrive first.
- The pin: `atem-connection` is `3.10.3` exactly in `package.json` and the lockfile's importer; `@julusian/freetype2` in `ignoredBuiltDependencies` matches the library's native dependency.

## Minor / nits
- `src/server/atem.ts:58` passes `section.host` untrimmed though `:72` validates it trimmed: a host of `" 192.168.10.240 "` passes and is handed to the library padded. Pass `(section.host as string).trim()`.
- `src/server/atem-switcher.ts:65` uses `??` on `productIdentifier`, which the library parses with `bufToNullTerminatedString` and can be `''`; `||` would fall through to the enum name and avoid "Model: , firmware ...".
- `src/server/atem-switcher.ts:73-77`: an unknown protocol prints its major and minor as "firmware 2.33", which is a protocol number. #141 and #144's assumptions leave the firmware line's wording to #145.
- `test/atem.test.ts:214-216`: the Fade out test's last assertion (`[CAMERA]` at the next Count Off) holds even if the ATEM paused on a fade, since the Count Off re-arms fade-paused targets; the earlier `arm: 'armed'` assertion carries the test (the `pausesOnFade: true` mutant went red on it).
- `test/atem.test.ts:552-563`: the section table gives Pro three bad-value cases and Camera two.
- `test/atem.test.ts:492-502`: "runs again on the producer's Refresh" sends Refresh while the rig plays, which the producer page disables.
- `web/src/PreServiceCheck.tsx:10-41`: `CheckResult` is a chain of `kind ===` blocks, not an exhaustive switch; the pattern predates the branch.
- `test/pages.test.ts:474-486` and `:892-909` assert the problems' class but not that notes carry `check-status`.
- The row line before the pause (`atem.ts:133-134`, #143's assumption) is not pinned: swapping the two calls survives the suite.
- No test cuts at the ATEM while it is offline and then checks the row and arm state on reconnect, though the fake supports it.

## Test quality
Tests added: 41 in `test/atem.test.ts`, 11 in `test/atem-switcher.test.ts`, 2 in `test/pages.test.ts`, 1 spec (2 projects) in `e2e/atem.spec.ts`. Green against `$BASE`: 0 (the two `pages.test.ts` tests are red there; the ATEM files cannot import there). Tautology shapes: none of the four (no self-computed expectations, the unit is never mocked, assertions are on the switcher's recorded programs and the producer's snapshots, no generated snapshots). Mutation survivors, which stand in for the base oracle: the cut and connect catches (finding 2), per-input own-cut matching and consumption (finding 3), the row-before-pause order and the switcher client's `connected ?` guard (nits; the guard's callers only call while online, so the gap has no user path). The Fade out test's redundant last assertion is a nit.

## Before opening the PR
- **CI readiness:** lint, typecheck, unit suite and build are green at `dcb7d67`; Playwright green locally. Moving the repro into `test/` adds a test that spawns a Node child and starts the library's worker thread against 127.0.0.1; CI's linux-x64 has the library's prebuild, so it should run there, but watch the first CI run.
- **Commit hygiene:** this doc and `docs/reviews/setlist-controller-114/repro/` are review artefacts, committed alone.
- **Likely reviewer asks:** the ATEM's config section and install steps in `docs/install.md` (#145's), a test of the library-load fallback (finding 4), and the real-unit acceptance run (#145).

## Verdict
Ready with follow-ups once finding 1 is fixed. Gate: finding 1 (the signal takeover) must be fixed before the PR opens. Findings 2, 3 and 4 and the comment hygiene are LOW and can ship in this PR or as follow-up tickets. No prior review findings were claimed on this branch.

## Remediation — 2026-10-21
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `7a9e3bc` setlist-controller#114 pre-PR review 1 finding 1: once the ATEM connects, the library's exit-hook takes over SIGTERM and SIGINT, so the server's own close never runs | red→green: `pnpm exec vitest run test/atem-switcher-signals.test.ts` (the repro, moved to `test/`; red `{ code: 143, closed: false }`, green after); a new stub test in `test/atem-switcher.test.ts` for the connect that rejects (error surfaces, listeners added during it removed, a prior listener kept); both go red with the removal loop emptied. Then `pnpm lint`, `pnpm typecheck`, `pnpm test` (51 files, 1005 passed, 4 skipped), `pnpm build`, `pnpm test:e2e` (44 passed) | 3: one line above `connect` (why the listeners go, which the code cannot say), two lines heading the new test file (why a child process, and that it connects to 127.0.0.1 only) | proved by execution (MEDIUM, red before and green after in the repo's runner, preserve suites green); no verify agent |
| 2 (LOW) | — deferred | — | — | LOW tail, not worked this round (eng-pipeline#34) |
| 3 (LOW) | — deferred | — | — | LOW tail, not worked this round |
| 4 (LOW) | — deferred | — | — | LOW tail, not worked this round |
| 5 (LOW, comment hygiene) | — deferred | — | — | LOW tail, not worked this round |

### Known regressions, deferred
- None. No verify pass ran, and no defect was introduced by this round's commit as far as its tests show.

### Rework briefs
- None. No rework pass.

### Approach decisions, this round
- Signal handling with the ATEM library (finding 1): applied as recorded above, in the switcher client's `connect`, with the removal in a `finally` so a rejecting connect still rejects. The fix's own failure path (connect rejects) is pinned by a stub test in `test/atem-switcher.test.ts`, the real-library behaviour by the child-process test in `test/atem-switcher-signals.test.ts`. The repro stays under `repro/` for the next round.
