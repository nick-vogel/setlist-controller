# Pre-PR review: setlist-controller#1 Browser setlist controller runs a 3-song rehearsal from an iPad

**Branch:** `setlist-controller-1-ipad-rehearsal` vs `origin/main` (merge-base `cabf12c` "setlist-controller#1 add a README")
**Reviewed at:** HEAD `a2ee7b8` (setlist-controller#9 Foot pedal: MIDI input, config file, MIDI monitor), clean tree, 0 uncommitted, 0 untracked; 87 files total, +10630 / -0 (2003 of those lines are `pnpm-lock.yaml`)
**Reviewed against:** the epic body of setlist-controller#1 (the spec), sub-issues #2 to #12 (all landed on this branch; #13 to #15 are hardware and human tickets, not started), the lane proposals in the run's `.epic-loop/tickets/*/proposals.md` (cross-referenced per finding). No `CODING_STANDARDS.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs exist in the repo, so conformance is judged against the spec and the five universal review rules. No prior review docs in `docs/reviews/`.
**Date:** 2026-10-13
**Reviewer:** 3 code-review agents + 1 test-audit agent + verify pass. Full review (`--fresh`), round 1.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | ok (the install added `jsqr`, so `node_modules` had been stale) |
| Lint | `pnpm lint` | pass (also passes with this doc's `repro/` files present) |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 17 files, 169 passed, 1 skipped (`test/setup-screen.test.ts:124`, Linux only by design) |
| Build | `pnpm build` | pass, 231 kB JS |
| Playwright suite | `pnpm test:e2e` | not run: not a full check per the repo entry, and no finding needed it |
| AbletonOSC contract (finding 1) | fetched `abletonosc/song.py`, `handler.py`, `osc_server.py`, `application.py` at pinned commit `0ca68214` from github.com/ideoforms/AbletonOSC (vendor source, rung 4 equivalent: no skill, MCP or context7 entry for AbletonOSC) | confirmed by two independent reads |
| Seam 1 repros (findings 2, 3, 5) | `repro/review-1-controller.test.ts` run in a scratch worktree at HEAD and again in this worktree | 4 of 4 red at HEAD |
| Hub crash (finding 4) | `repro/review-1-hub.test.ts`, plus a standalone node script | process-level `RangeError: Invalid WebSocket frame: MASK must be set`, unhandled, exits |
| Recommended fixes 1, 2, 3, 4, 5 | applied in a scratch worktree at HEAD with the test changes named in each brief | full suite 174 passed / 1 skipped, all 5 repros green, refresh-test rework red under its mutation |
| Contract clean-up drop (finding 10) | dgram send then immediate `close()` in node | `[]` delivered; with 50 ms before close, delivered |
| Launch agent node path (finding 7) | `node -p process.execPath` on this Mac | `/opt/homebrew/Cellar/node/26.3.0/bin/node` (the versioned keg, not `/opt/homebrew/bin/node`) |
| Test tautology audit | base oracle not applicable (the base holds only a README, so every test is trivially red there); replaced with 10 targeted mutations in a scratch worktree | 8 caught, 2 survived (finding 9) |
| Real Live, launchd, CoreMIDI | not run | guardrails forbid opening Live, loading launch agents, and the review has no pedal |

**Overall:** The server, fake Live, web app and install path are well built and well tested against the fake Live, and every lane's own review fixes held. But the branch cannot drive real Live: the controller registers its listeners on an OSC address the pinned AbletonOSC does not handle, so against Live no playhead, transport or loop report ever arrives (finding 1), and the fake Live accepts the same wrong address, so every test passes. Next on a song's last section also does not stop at End unless pressed in the last bar (finding 2). Fix 1 and 2 before the PR opens; 3, 4 and 5 are small, verified diffs worth taking in the same pass. Several findings repeat open lane proposals, noted per finding.

## Approach decisions
- **Listener registration (finding 1):** register each listener on `/live/song/start_listen/<property>` with no arguments, in `src/shared/abletonosc.ts` so the bridge and the contract check change together; the fake Live accepts only that per-property form, so it stays as strict as AbletonOSC.
- **Stopped jump onto the playhead (finding 3):** follow the precedent the play-from-start stopped branch already sets (`src/server/playback-controller.ts:231-241`): a stopped jump whose target starts where the playhead already is does not wait. Narrower than "never wait while stopped", so the waiting mark still shows for a stopped jump that moves the playhead.
- **Next to End (finding 2):** remember the End jump the controller itself sent while playing (`endJump`, a song number), and apply that song's toggle when the playhead lands within a bar after End. The hand-relocation exclusion in `reachedEnd` (from `1fbc33f`) stays untouched.
- **Loop while a jump waits (finding 5):** brace the waiting jump's target, not the section being left. Reversible: the alternative is to ignore Loop while a jump waits.
- **Client socket errors (finding 4):** one `error` listener per client socket that logs, mirroring the `console.error('Setlist server: ...')` pattern in `src/server/server.ts:98`.
- **Leader controls availability (findings 6 and 12):** one availability flag per page, from the server connection (finding 6) and Live's connection, and the existing `unavailable` class precedent (`web/src/RefreshButton.tsx`, `web/src/SectionControls.tsx`).
- **Setup screen Refresh (finding 8):** a laptop-only HTTP POST beside `/api/setup`, guarded by the same `remoteAddress === localAddress` check `serveSetup` uses; the setup page stays on the view-only socket.
- **Stopped jump onto the playhead (finding 3, remediation 1):** `jumpTo` takes the section (`{ cue, time }`) rather than its cue, so the four call sites pass the section itself.
- **End jump and Loop (finding 5 rework, open):** a pending End jump (`endJump !== null`) means Loop has nothing to brace, the same as no section playing. This was proposed by the remediation 1 verifier and not applied, because the tripwire fired.
- **Both auto-stop triggers (finding 2 rework, open):** evaluate `reachedEnd` and `landedOnEnd` into separate constants before the `||`, so the End jump is always consumed and one stop goes out. This was proposed and not applied (tripwire).
- **Server connection status (finding 6):** `connectToServer` reports `onStatus(open)` from the current socket's `open` and `close` only. The page holds `connected` in `useServer`, and one `available` flag per control follows the existing `unavailable` class. The copy and the fixed banner placement are recorded in `.epic-loop/stage2/assumptions.md`.
- **Contract clean-up (finding 10):** clean-up messages go through a session `flush` that awaits the dgram send callback, and logs a send error and resolves. Interruption is an `AbortSignal` threaded into the session's `sleep` (`node:timers/promises`), checked at each step boundary. `main.ts` aborts it from a one-shot SIGINT handler and exits 130.
- **Launch agent node path (finding 7):** the install script passes `SETLIST_NODE="$(command -v node)"`, and `print-launch-agent.ts` falls back to `process.execPath`.
- **Parser warnings (finding 14):** three warning kinds, `repeated-end`, `section-after-end` and `overlapping-songs`. Songs overlap when their spans, from first locator to last locator with End included, overlap strictly, so a song that starts on the previous song's End does not count.

## Confirmed Issues

### 1. The controller registers its listeners on an OSC address AbletonOSC does not handle, so against real Live no playhead, transport or loop report ever arrives — CRITICAL
- **Location:** `src/shared/abletonosc.ts:41-44`, mirrored by `src/fake-live/fake-live.ts:186-191`
- **Attribution:** introduced. `git log -S"'/live/song/start_listen'"` first hits `91257cf` (setlist-controller#3 Now playing and position on every page). Already raised as the #7 lane proposal "Register Live listeners on the address AbletonOSC uses", and admitted as a known gap in `docs/install.md:167`, but still open on the integration branch.
- **Real-world trigger:** every start against real Live with AbletonOSC `0ca6821`. No configuration avoids it.

**Evidence**
```ts
export const startListen = (property: ListenedProperty): OutMessage => ({
  address: '/live/song/start_listen',
  args: [property],
});
```
AbletonOSC at `0ca6821`, `abletonosc/song.py:89-92`, registers only per-property handlers: `self.osc_server.add_handler("/live/song/start_listen/%s" % prop, partial(self._start_listen, self.song, prop))`. `osc_server.py:87-125` looks the address up in `_callbacks`; the bare `/live/song/start_listen` is not there and has no `*`, so it logs "Unknown OSC address" and sends nothing.

**Failure mode** — Against Live, `current_song_time`, `is_playing`, `tempo`, `signature_*`, `loop_start`, `loop_length` and `loop` never report. The probe still answers, so every page shows Live connected while: `now` stays null on every page (no song, section, bar or progress); `playing` stays false, so the 5-second set poll keeps reading during playback (the "never re-read during playback" rule is defeated); auto-stop never fires; Next, Previous and Loop are ignored (no section playing); a tapped jump stays waiting forever. The fake Live accepts the same wrong address (`fake-live.ts:186`), so all 169 tests and the fake contract run pass. The epic's end state (#15, a rehearsal from the iPad) cannot work.

**Recommended fix**
```diff
--- a/src/shared/abletonosc.ts
 export const startListen = (property: ListenedProperty): OutMessage => ({
-  address: '/live/song/start_listen',
-  args: [property],
+  address: `/live/song/start_listen/${property}`,
+  args: [],
 });
--- a/src/fake-live/fake-live.ts
-    } else if (message.address === '/live/song/start_listen') {
-      const [property] = message.args;
-      if (typeof property === 'string' && property in PROPERTIES) {
+    } else if (message.address.startsWith('/live/song/start_listen/')) {
+      const property = message.address.slice('/live/song/start_listen/'.length);
+      if (Object.hasOwn(PROPERTIES, property)) {
```
Both registration assertions change from args to addresses, for example in `test/setlist.test.ts:52` and `test/live-connection.test.ts:99`:
```ts
expect((rig?.live.received ?? []).filter((message) => message.address.startsWith('/live/song/start_listen')).map((message) => message.address)).toEqual([
  '/live/song/start_listen/current_song_time',
  '/live/song/start_listen/is_playing',
  // ...one per LISTENED_PROPERTIES entry, in order
]);
```
Then rewrite `docs/install.md:167` (the "Today a run against real Live cannot confirm the three behaviours" paragraph): delete it, since the gap is closed, and keep line 165's advice on reading `unobserved`.

**Remediation brief**
- **Design intent:** `src/shared/abletonosc.ts` is the one place the controller's outgoing AbletonOSC messages are built, so the bridge (`src/server/live-bridge.ts:88`) and the contract check (`src/contract/run.ts:247`) send identical bytes. Replies still arrive on `/live/song/get/<property>` (`handler.py:69`), so `LISTEN_REPLY_PREFIX`, `listenReply` and the bridge's decoder do not change. The fake Live must be exactly as strict as AbletonOSC: the bare form must register nothing.
- **Full surface:** `src/shared/abletonosc.ts:41-44`; `src/fake-live/fake-live.ts:186-191` (and its comment at :54 stays true); `test/setlist.test.ts:52-61`; `test/live-connection.test.ts:99-108`; `docs/install.md:165-167`. `src/contract/run.ts:247` follows automatically. Verified by `git grep -n start_listen` (those are every hit).
- **Must preserve:** registration order (`LISTENED_PROPERTIES`, brace before loop, pinned by the two tests above); the fake Live reporting the current value at once on registration (`report(property)`); `test/live-connection.test.ts` "restarting the fake Live" re-registration; the e2e suite, which uses the same fake Live.
- **Do not touch:** the reply address and decoder in `src/server/live-bridge.ts:61-75` (correct per `handler.py:69`, dismissed below).
- **Proof:** red first: change only the fake Live half, run `pnpm exec vitest run test/setlist.test.ts test/now-playing.test.ts`, which fails because no listener reports arrive; then change `abletonosc.ts` and the two assertions, and run `pnpm test` (verified in scratch: 174 passed with the other fixes applied). Final proof is #13's contract run against Live Lite: the listen step should read "reported at once: yes" for all eight properties.

### 2. Next on a song's last section does not stop Live at End on "Stop at end" unless it is pressed in the last bar — HIGH
- **Location:** `src/server/playback-controller.ts:274-280` (the End jump) with `:140-149` (`reachedEnd`)
- **Attribution:** introduced. The End jump came with `0865c44` (setlist-controller#7 Loop and section navigation); the less-than-a-bar window came with `1fbc33f` (setlist-controller#5 review pass 1 finding 1). Already raised as the #7 lane proposal "Stop at End after Next jumps there from mid-section", still open.
- **Real-world trigger:** the leader ends a song early (user story 22) by pressing Next, or pedal switch 2, anywhere in the last section except its final bar, with the default "Stop at end". Live jumps to End at the next bar line and plays on through the silent gap into the next song.

**Evidence**
```ts
// From the last section to the song's End, where the end toggle decides. ...
if (song.endCue === null) return;
leaveLoopFor(null);
jump(song.endCue);
clearJump();
```
and in `reachedEnd`: `if (after < before || after - before >= barLength()) return false;`

**Failure mode** — The jump lands on End from a bar line more than a bar earlier, so `reachedEnd` reads it as a move by hand and sends no stop. Executed: `repro/review-1-controller.test.ts`, "stops Live at End on "Stop at end" when pressed more than a bar before End" (playing at 34, Next, Live lands on End at 48): `expected [] to have a length of 1 but got +0` for `stop_playing`. `test/section-navigation.test.ts:78-95` makes this exact two-bar jump but asserts only `now` is null, never the stop.

**Recommended fix**
```diff
   let barLine: number | null = null;
+  let endJump: number | null = null;
@@ jumpTo
+    endJump = null;
     // A new jump replaces the waiting one, as it does in Live.
     waitingJump = address;
@@ clearJump
   const clearJump = () => {
     waitingJump = null;
     barLine = null;
+    endJump = null;
   };
+
+  const landedOnEnd = (after: number) => {
+    if (endJump === null || !playing || !set) return false;
+    const song = set.songs.find((candidate) => candidate.number === endJump);
+    if (!song || song.end === null) return false;
+    if (after < song.end - EPSILON || after >= song.end + barLength()) return false;
+    const stop = endToggles[song.number] === 'stop';
+    endJump = null;
+    return stop;
+  };
@@ case 'position'
-          if (reachedEnd(position, event.beats)) stopPlaying();
+          if (reachedEnd(position, event.beats) || landedOnEnd(event.beats)) stopPlaying();
@@ case 'playing'
           if (!playing && barLine !== null) {
             clearJump();
           }
+          if (!playing) endJump = null;
@@ case 'next'
           jump(song.endCue);
           clearJump();
+          if (playing) endJump = song.number;
```
(The `endJump = null` line in `jumpTo` sits after finding 3's early return when both land; see the combined diff in finding 3.)

**Remediation brief**
- **Design intent:** auto-stop has two triggers. Playback carrying the playhead through End (`reachedEnd`, which deliberately refuses moves of a bar or more, so a click at the laptop never stops Live), and now a jump to End that the controller itself sent (`endJump`). The toggle is read when the playhead lands, so a toggle changed after pressing Next still decides. `endJump` dies with any new jump, any stop, a set change and a lost Live (all through `clearJump` or the `playing` case).
- **Full surface:** `src/server/playback-controller.ts:57-60` (state), `:119-127` (`jumpTo`), `:129-133` (`clearJump`), `:180-184` (`position`), `:185-191` (`playing`), `:274-280` (`next` to End). Add the repro case to `test/section-navigation.test.ts` (or `test/transport.test.ts`), plus its twin: the same with the toggle on Continue sends no stop.
- **Must preserve:** every auto-stop test in `test/transport.test.ts:136-253`, especially "sends nothing when the playhead is moved past End while stopped, or by more than a bar while playing" (:170) and "sends nothing when the playhead is moved by hand into a next song that starts on End" (:190); `test/section-navigation.test.ts:78-108` (no waiting jump shown for End, the End jump replacing a waiting one); one stop only when both triggers are true at once (the `||` keeps it single).
- **Do not touch:** `reachedEnd`'s window and its waiting-jump exclusion (dismissed below as intended).
- **Failure of the fix:** if the End jump datagram is lost, `endJump` stays set while the song plays on; when playback reaches End naturally both triggers agree and one stop goes out, so nothing new can go wrong.
- **Proof:** `cp docs/reviews/setlist-controller-1/repro/review-1-controller.test.ts test/ && pnpm exec vitest run test/review-1-controller.test.ts -t "more than a bar before End"; rm test/review-1-controller.test.ts`. Red now, green after (verified in scratch). Move the case into the real suite rather than leaving the repro file.

### 3. A jump while stopped onto the section start where the playhead already sits stays "waiting" for good, and then turns the auto-stop off — MEDIUM
- **Location:** `src/server/playback-controller.ts:119-127` (`jumpTo`), with `:102-110` (`landed`) and `:141` (`reachedEnd`)
- **Attribution:** introduced. `jumpTo` came with `28f93fc` (setlist-controller#4 Leader role and tap-to-jump); the play-from-start stopped branch (`fae5828`, #5) fixed the same problem for its own path only. Already raised as the #4 lane proposals "Clear a waiting jump to the spot the playhead already holds" (display only); this review adds the auto-stop consequence.
- **Real-world trigger:** Live stopped, the leader taps the section the playhead sits on (for example tapping a section twice: the first tap lands, the second stays waiting), or presses Previous (iPad or pedal switch 3) on the first section while parked at its start, which is where Live sits before a song. Every device shows "Jumping to Intro." until the next jump. If playback then starts from Live's own transport at the laptop, the song does not stop at End. **MEDIUM, capped:** upgrade to HIGH if playback is ever started at the laptop (space bar) during a rehearsal or service; ask Nick whether he does.

**Evidence**
```ts
const jumpTo = (address: SectionAddress, cue: number) => {
  leaveLoopFor(address);
  jump(cue);
  waitingJump = address;
  barLine = playing && position !== null ? ... : null;
};
```
Live (and the fake Live, `fake-live.ts:117-124`) reports a position only when it changes, so nothing ever lands the jump; forward playback inside the target never satisfies `landed`, and the stop does not clear it because `barLine` is null.

**Failure mode** — Executed, `repro/review-1-controller.test.ts`: "does not stay waiting" (stopped at 0, Previous): `expected { song: 1, section: 0 } to be null`; "leaves the auto-stop on when Live then plays from the laptop" (stopped at 32, tap Chorus, Live plays 18 beats through End at 48): no `stop_playing`, playback runs into song 2.

**Recommended fix** (combined with finding 2's `jumpTo` line; the three call sites pass the section instead of its cue)
```diff
-  const jumpTo = (address: SectionAddress, cue: number) => {
+  const jumpTo = (address: SectionAddress, target: { cue: number; time: number }) => {
     leaveLoopFor(address);
-    jump(cue);
+    jump(target.cue);
+    if (!playing && position !== null && Math.abs(position - target.time) < EPSILON) {
+      clearJump();
+      return;
+    }
+    endJump = null;
     // A new jump replaces the waiting one, as it does in Live.
     waitingJump = address;
@@
-          jumpTo({ song: command.song, section: command.section }, section.cue);
+          jumpTo({ song: command.song, section: command.section }, section);
-            jumpTo({ song: command.song, section: 0 }, first.cue);
+            jumpTo({ song: command.song, section: 0 }, first);
-            jumpTo({ song: song.number, section: current.section + 1 }, following.cue);
+            jumpTo({ song: song.number, section: current.section + 1 }, following);
-          jumpTo(address, section.cue);
+          jumpTo(address, section);
```
`test/refresh.test.ts:187-203` used this bug to make a jump wait while stopped. Rework its setup so the jump waits for a real reason (verified in scratch: green with the fix, red when the set-change `clearJump()` at `playback-controller.ts:177` is removed):
```diff
-    rig = await startRig(SET, { position: 16 });
+    rig = await startRig(SET, { position: 0 });
     const viewer = await rig.connectViewer();
     const leader = await rig.connectLeader();
-    await viewer.snapshot(at(16));
-    // Stopped on the Verse, a jump to the Verse moves no playhead, so Live reports nothing and the
-    // jump stays waiting.
+    await viewer.snapshot(at(0));
+    // Live has lost the Verse's locator since the last read, so the jump to it finds no cue point,
+    // moves no playhead, and stays waiting.
+    rig.live.setCuePoints(SET.slice(0, 1));
     leader.send({ kind: 'jump', song: 1, section: 1 });
     await viewer.snapshot((snapshot) => snapshot.jump?.section === 1);
+    await vi.waitFor(() => expect(rig?.received('/live/song/cue_point/jump')).toHaveLength(1));
```
(The test comment is replaced, not added: the old one describes the bug.)

**Remediation brief**
- **Design intent:** a waiting jump means "Live will move the playhead at the next bar line". While stopped Live jumps at once, and when the target starts exactly where the playhead is, no report will ever come, so nothing may wait. Every other stopped jump still waits until its position report lands it, as now.
- **Full surface:** `src/server/playback-controller.ts:119-127` and its four callers at `:224`, `:236`, `:271`, `:289`; `test/refresh.test.ts:187-203`; add both repro cases to `test/jump.test.ts`.
- **Must preserve:** `test/jump.test.ts` "lands at once while stopped" (:79), "clears a jump to the section already playing once it lands back on its start" (:158); `test/section-navigation.test.ts` "restarts the first section at once while stopped" (:185), "keeps the loop when it restarts the looped first section" (:199) (the early return still runs `leaveLoopFor`, which keeps a loop on the same section); the play-from-start stopped branch at `:237-241`, untouched.
- **Do not touch:** `landed()` (its rules were settled in #4 review findings 13 and 17).
- **Proof:** `cp docs/reviews/setlist-controller-1/repro/review-1-controller.test.ts test/ && pnpm exec vitest run test/review-1-controller.test.ts -t "spot the playhead holds"; rm test/review-1-controller.test.ts`. Both cases red now, green after; then `pnpm exec vitest run test/refresh.test.ts`.

### 4. One malformed WebSocket frame from any device on the stage network crashes the server — MEDIUM
- **Location:** `src/server/hub.ts:22-32`
- **Attribution:** introduced, `73af568` (setlist-controller#2 show the setlist from the fake Live on a phone).
- **Real-world trigger:** a client that sends a frame ws rejects: unmasked, bad RSV bits, invalid UTF-8 in a text frame. Browsers never do, so it takes a buggy tool or a hostile device on the network; the view-only path `/ws` needs no credentials. launchd restarts the server in about a second and Live keeps playing, but every client drops and every end toggle resets to "Stop at end". **MEDIUM, capped:** upgrade to HIGH if the stage router is ever shared with guest or congregation devices.

**Evidence**
```ts
sockets.on('connection', (socket, request) => {
  const role = roleOf(request);
  socket.on('message', (data) => { ... });
  socket.send(current);
});
sockets.on('error', () => {});
```
ws 8 emits receiver errors on the client `WebSocket`; with no listener, Node throws.

**Failure mode** — Executed: `repro/review-1-hub.test.ts` (raw upgrade on `/ws`, then bytes `81 02 68 69`): vitest reports `Unhandled Errors: RangeError: Invalid WebSocket frame: MASK must be set` (`WS_ERR_EXPECTED_MASK`) and the run exits non-zero; as a standalone node process the server exits with code 1.

**Recommended fix**
```diff
   sockets.on('connection', (socket, request) => {
     const role = roleOf(request);
+    socket.on('error', (error) => console.error('Setlist server: WebSocket client error', error));
     socket.on('message', (data) => {
```
ws closes the socket itself after a receiver error, so logging is all the listener does.

**Remediation brief**
- **Design intent:** the hub must survive anything a LAN client sends; a bad client loses its own socket only. The server-level `sockets.on('error')` at :35 covers HTTP-server errors, not client sockets.
- **Full surface:** `src/server/hub.ts:22-24`; add the repro as a test in `test/server.test.ts` (it already holds the precedent from `2f3b1bc`, "setlist-controller#2 keep the server up on a malformed path, and free the ports when listen fails").
- **Must preserve:** view-only messages dropped unread (`hub.ts:27`, pinned by the five view-only rejection tests the mutation audit confirmed); `hub.close()` terminating clients.
- **Proof:** `cp docs/reviews/setlist-controller-1/repro/review-1-hub.test.ts test/ && pnpm exec vitest run test/review-1-hub.test.ts; rm test/review-1-hub.test.ts`. Now: 1 unhandled error, non-zero exit. After: 1 passed, no errors (verified in scratch).

### 5. Loop pressed while a jump waits braces the section the playhead is about to leave — MEDIUM
- **Location:** `src/server/playback-controller.ts:249-260`
- **Attribution:** introduced, `0865c44` (setlist-controller#7 Loop and section navigation).
- **Real-world trigger:** the leader presses Previous (or taps a section, or Next) and then Loop before the downbeat, the natural "go back to the chorus and vamp it" sequence, and easy on the pedal (switch 3 then switch 1). Live jumps away at the bar line with the brace left on the old section: the loop is shown on a section that is not playing, and after Previous the playhead plays back into the braced section and vamps it, which breaks "a loop never carries into a different section".

**Evidence**
```ts
// With no section playing, or a section with no known end, there is nothing to brace.
const current = now(position);
const section = current && sectionAt(set, current);
if (!section || section.end === null) return;
loopOn(section.time, section.end - section.time);
```

**Failure mode** — Executed, `repro/review-1-controller.test.ts` "never braces the section the playhead is about to leave" (playing at 20 in the Verse, Previous, Loop): `set/loop_start` received `[16]`, the Verse, while the jump goes to the Intro.

**Recommended fix**
```diff
-          const current = now(position);
+          const current = waitingJump ?? now(position);
```
**Remediation brief**
- **Design intent:** Loop braces the section the band is about to play. A waiting jump is the leader's declared next section, so it wins over the section playing now. Reversible: the alternative is ignoring Loop while a jump waits, which leaves a pedal press doing nothing visible.
- **Full surface:** `src/server/playback-controller.ts:255-259`; add the repro case to `test/loop.test.ts`, plus a seam 1 assertion that the brace lands on the waiting target (`loop_start` equals the target's time).
- **Must preserve:** `test/loop.test.ts` (loop on, loop off, laptop-set loops shown), `test/pedal.test.ts` "turns the loop on ... and a second press releases it", the toggle-off branch at `:251-254` unchanged.
- **Failure of the fix:** if the jump datagram is lost, the brace sits on the target while the playhead keeps playing; it vamps only if playback reaches that section, and Loop again releases it. Acceptable, and finding B below covers lost jumps.
- **Proof:** `cp docs/reviews/setlist-controller-1/repro/review-1-controller.test.ts test/ && pnpm exec vitest run test/review-1-controller.test.ts -t "never braces"; rm test/review-1-controller.test.ts`. Red now, green after (verified in scratch).

### 6. No page shows that the server connection is down, and the leader's controls stay live on a stale snapshot, so a completed Stop hold can be silently dropped — MEDIUM
- **Location:** `web/src/App.tsx:74-95`, `web/src/server-connection.ts:98-101`, `web/src/StopButton.tsx`
- **Attribution:** introduced, `8199a06` (setlist-controller#10 Client reconnect and the Playwright suite). Dropping commands while down is a recorded #10 assumption; the missing indicator is the #10 lane proposal "Show "Reconnecting" on every page while the server is unreachable", still open.
- **Real-world trigger:** a phone or the iPad loses Wi-Fi for a few seconds mid-song. Band phones keep showing a frozen "bar 3 of 8" and progress bar as if live; the leader's Stop hold fills, completes, sends nothing, and looks exactly like success.

**Evidence**
```ts
// The page keeps its last snapshot while the connection is down, until the next one arrives.
const send = useCallback((command: Command) => connection.current?.send(command), []);
```
and `server-connection.ts:98-101`: `if (target?.readyState === WebSocket.OPEN) target.send(...)`, else dropped. `ServerConnection` exposes no open/closed state, and no web file renders one (all 13 read).

**Failure mode** — Socket down: every page renders the last snapshot with no sign it is stale, and every leader control stays enabled while its commands go nowhere.

**Recommended fix** — Add `onStatus(open: boolean)` to `connectToServer`'s options, called from the socket `open` and `close` handlers of the current socket; keep `connected` in `useServer`; on every page render a status line "Reconnecting to the server." in the now-playing area while it is false, and pass an `available` flag to the leader controls (Stop, Previous/Loop/Next, tap targets, Play from start, Refresh) that applies the existing `unavailable` class and `disabled`. The end toggles can stay enabled only if they too are disabled while down, since they also send.

**Remediation brief**
- **Design intent:** the page keeps its last snapshot while down (the no-reload rule), but it must say so, and a control that cannot reach the server must look unavailable. The connection object owns the truth about open or closed; the page only renders it.
- **Full surface:** `web/src/server-connection.ts` (`ConnectionOptions`, the `open` and `close` listeners on the current socket, wake handling at :76-95), `web/src/App.tsx:15-21` and `:74-95`, `web/src/NowPlaying.tsx` (status line), `web/src/StopButton.tsx`, `web/src/SectionControls.tsx`, `web/src/JumpTargets.tsx`, `web/src/SongHeading.tsx`, `web/src/RefreshButton.tsx`, `web/src/styles.css`; tests in `test/reconnect.test.ts` (the status callback across drop, retry and wake), `test/pages.test.ts` (the line and the disabled controls), and `e2e/reconnect.spec.ts` (the line shows under `proxy.drop()` and clears on reconnect). Copy is an assumption to record in the ticket.
- **Must preserve:** commands are dropped, never queued (#10 assumption); the retry table 250/500/1000/1500 ms and wake behaviour pinned by `test/reconnect.test.ts`; a wake must not flash "Reconnecting" while the old socket still carries commands (the fresh socket replaces it only on open).
- **Proof:** a new `test/pages.test.ts` case rendering `Page` with the flag false asserts the line and `disabled` on Stop; it fails to compile or fails now and passes after.

### 7. The launch agent pins Homebrew's versioned node path, which a routine `brew upgrade` deletes — MEDIUM
- **Location:** `src/install/print-launch-agent.ts:9`
- **Attribution:** introduced, `0ed0d32` (setlist-controller#11 Running on the laptop).
- **Real-world trigger:** Node from Homebrew on the playback Mac, then any `brew upgrade` that includes node. Homebrew cleans up the old keg, the agent's `/opt/homebrew/Cellar/node/<old>/bin/node` vanishes, and launchd retries every second while every page fails to load. `docs/install.md:52` says to re-run the script "after you upgrade Node", but a bulk `brew upgrade` does not look like one. **MEDIUM, capped:** applies only if the playback Mac's node is Homebrew's; check with `node -p process.execPath` there (on this Mac it prints `/opt/homebrew/Cellar/node/26.3.0/bin/node`).

**Evidence**
```ts
console.log(JSON.stringify(launchAgent({ repoRoot, nodePath: process.execPath, home: homedir() }), null, 2));
```
`process.execPath` is the resolved realpath; `command -v node` gives the stable `/opt/homebrew/bin/node` symlink.

**Recommended fix**
```diff
--- a/src/install/print-launch-agent.ts
-console.log(JSON.stringify(launchAgent({ repoRoot, nodePath: process.execPath, home: homedir() }), null, 2));
+console.log(JSON.stringify(launchAgent({ repoRoot, nodePath: process.env.SETLIST_NODE ?? process.execPath, home: homedir() }), null, 2));
--- a/scripts/install-launch-agent.sh
-node src/install/print-launch-agent.ts | plutil -convert xml1 -o "$PLIST" -
+SETLIST_NODE="$(command -v node)" node src/install/print-launch-agent.ts | plutil -convert xml1 -o "$PLIST" -
```
**Remediation brief**
- **Design intent:** the agent should point at the stable command path the operator's shell uses, so a minor Node upgrade keeps working; a major upgrade still needs a re-install for the native MIDI module, which `install.md:52` already says.
- **Full surface:** `src/install/print-launch-agent.ts:9`, `scripts/install-launch-agent.sh:28-29` (the comment above the line says "by its absolute path", still true), `docs/install.md:52`, `test/launch-agent.test.ts` (add a case that `launchAgent` keeps a given symlink path as is).
- **Must preserve:** the absolute-path check in `launchAgent`; never run the install script in a test (guardrail; `test/launch-agent.test.ts:45-51` reads it as text on purpose).
- **Proof:** `SETLIST_NODE=/opt/homebrew/bin/node node src/install/print-launch-agent.ts | grep -n node` prints the symlink path, and without the variable it prints `process.execPath` as now. Do not run the install script.

### 8. The setup screen has no Refresh, as the spec asks — MEDIUM
- **Location:** `web/src/Setup.tsx:12-31`, `web/src/App.tsx:19`, `src/shared/routes.ts:14`
- **Attribution:** introduced (missing). Deferred from #8 and #6 as the lane proposal "Add the Refresh control to the setup screen" (raised twice), still open. The epic spec says "Laptop setup screen ... Includes Refresh", and #8's body says "Has its own Refresh control".
- **Real-world trigger:** the operator edits a locator at the laptop and checks the warnings on the setup screen; with no Refresh there, they wait up to 5 seconds for the poll or reach for the iPad.

**Evidence** — `Setup` renders status, now playing, warnings, pedal and join codes, no Refresh; the setup page connects on the view-only socket (`pageRole('/setup')` is `'viewer'`), whose messages the hub drops (`hub.ts:27`), so a button there could not send.

**Recommended fix** — Add `SETUP_REFRESH_API = '/api/setup/refresh'` to `src/shared/routes.ts`; in `src/server/server.ts` `serveWeb`, answer it with a POST-only handler that applies the same laptop-only check as `serveSetup` (`remoteAddress === localAddress`, else 403 with `SETUP_REFUSED`), calls `controller.command({ kind: 'refresh' })`, and answers 204. `Setup` renders the existing `RefreshButton` with a `send` that POSTs there.

**Remediation brief**
- **Design intent:** the setup screen watches as a viewer and stays on the view-only socket, so no band phone gains control; the laptop proves itself the way the join codes already do. The controller still owns the rule (connected and stopped only), so the endpoint needs no rule of its own.
- **Full surface:** `src/shared/routes.ts:14-19`, `src/server/server.ts:140-168` (`startServer` must pass the controller into `serveWeb`), `web/src/Setup.tsx`, `web/src/RefreshButton.tsx` (reuse as is), `test/setup-screen.test.ts` (a POST from 127.0.0.1 reads the set again; a GET is 405; the refusal case in the existing `it.runIf(process.platform === 'linux')` block), `test/pages.test.ts` (Setup renders Refresh), `README.md:39` (setup screen paragraph).
- **Must preserve:** `/api/setup` answers only the laptop; the viewer socket never accepts commands; Refresh is ignored while playing or not connected (pinned by `test/refresh.test.ts`).
- **Proof:** the new `test/setup-screen.test.ts` case counts `get/cue_points` reads at the fake Live before and after the POST; it fails now (404 or no read) and passes after.

### 9. Two pedal tests cannot go red: they assert "nothing reached Live" before Live could have received anything — MEDIUM
- **Location:** `test/pedal.test.ts:149-152` and `:166-167`
- **Attribution:** introduced, `b96a11d` (setlist-controller#9 Foot pedal).
- **Real-world trigger:** a future change that sends Live a command for an unmapped message, or under a rejected (Stop-mapped) config, passes both tests. Test quality, not a runtime defect.

**Evidence**
```ts
await viewer.snapshot(monitorHas(3));
expect(controlMessages()).toEqual([]);
```
The WebSocket snapshot reaches the client before the UDP datagrams reach the fake Live, so `controlMessages()` is read too early to see them (the same race `test/jump.test.ts:34` documents).

**Failure mode** — Executed by the test audit in a scratch worktree, 3 of 3 runs each: mutation `onAction(action ?? 'loop')` in `src/server/pedal.ts:138` (every unmapped message braces a loop) stays green for "changes nothing in Live and nothing on any page but the MIDI monitor"; a loader that reports `invalid` but still dispatches its mappings stays green for "rejects a config that maps a switch to Stop".

**Recommended fix** — In both tests, after the MIDI sends and the `monitorHas` wait, send a leader barrier and assert the full list: `leader.send({ kind: 'jump', song: 1, section: 3 })`, `await vi.waitFor(() => expect(rig.received(JUMP).at(-1)).toEqual(jumpTo(5)))`, then `expect(controlMessages()).toEqual([jumpTo(5)])`. Use the test file's own set and cue constants for the section and cue; the audit verified this shape green at HEAD and red under the mutation.

**Remediation brief**
- **Design intent:** a "Live received nothing" assertion needs a barrier that leaves the server's single OSC socket after anything the action under test could have sent; a leader jump is the repo's established barrier (`test/transport.test.ts:123`, `test/jump.test.ts:211`).
- **Full surface:** `test/pedal.test.ts:140-153` and `:157-168`; the tests need a leader client (`startPlaying` may need to return one).
- **Must preserve:** the existing config, problems and mappings assertions at `:161-163`.
- **Proof:** apply the mutation `if (action) onAction(action);` to `onAction(action ?? 'loop');` in `src/server/pedal.ts:138` temporarily, run `pnpm exec vitest run test/pedal.test.ts`, and see both tests red; revert the mutation.

### 10. The contract check's clean-up after a failed run never reaches Live — LOW
- **Location:** `src/contract/run.ts:79-90`, `src/contract/main.ts` (no SIGINT handler)
- **Attribution:** introduced, `cc104a8` (setlist-controller#12 review pass 1 finding 12).
- **Real-world trigger:** an unexpected exception after Live started playing (no `Abort` is thrown after `started = true`), or Ctrl-C during the half-minute run against Live: Live is left playing, maybe looping, with the brace moved.

**Evidence**
```ts
if (run.started && !run.stopped) {
  run.send(abletonosc.stopPlaying());
  run.send(abletonosc.loopOff());
}
...
await new Promise<void>((resolve) => socket.close(() => resolve()));
```
**Failure mode** — Executed in node: two `dgram` sends followed at once by `close()` deliver nothing (the send waits on a next-tick lookup that `close()` beats); with 50 ms before `close()`, the datagram arrives.

**Recommended fix** — Make the clean-up sends await their callbacks before closing, for example a local `flush(message)` that wraps `socket.send(encode(message.address, message.args), target.port, target.host, () => resolve())`, awaited for each clean-up message; register a SIGINT handler in `main.ts` that runs the same clean-up once and exits 130.

**Remediation brief**
- **Design intent:** a contract run leaves Live as it found it: stopped, loop off, the test set's brace.
- **Full surface:** `src/contract/run.ts:79-90` and the session `send` at `:112-114`; `src/contract/main.ts`.
- **Must preserve:** the normal-path brace restore at `run.ts:403-405`; the fake-target run's output (two runs compare with no differences).
- **Proof:** `node src/contract/main.ts run --target fake --out <scratch dir>` still exits 0 and compares clean; a fake-target run with a step patched to throw after `started` leaves the in-process fake stopped (check its `received` for `stop_playing`). Never run against real Live in a test.

### 11. A waiting jump to the looped section is invisible in the setlist — LOW
- **Location:** `web/src/styles.css:119-122` vs `:149-152`
- **Attribution:** introduced, `0865c44` (#7).
- **Real-world trigger:** Previous on a looped first section, or a tap on the looped section, keeps the loop (`leaveLoopFor`) and sets a waiting jump on the same section. The setlist's later `.looping` outline replaces the dashed amber one; the "Jumping to ..." line still shows, so the waiting state is not lost entirely.

**Evidence** — `.sections li.waiting { outline: 2px dashed #f0b429; }` then `.sections li.looping { outline: 2px solid #46a758; }`, same specificity, later wins.

**Recommended fix** — Add `.sections li.waiting.looping { outline: 2px dashed #f0b429; box-shadow: inset 0 0 0 4px #46a758; }` after the `.looping` rule, and the matching `.jump-target.waiting.looping` (border dashed amber, inset green shadow).

**Remediation brief**
- **Design intent:** every state a section can be in at once must stay visible: current (blue), waiting (dashed amber), looping (solid green).
- **Full surface:** `web/src/styles.css:119-122`, `:149-152`, `:222-229`; `test/pages.test.ts` (it reads CSS rules through `test/css.ts`; add a case for the combined class).
- **Must preserve:** `test/pages.test.ts` "looks unlike a waiting jump".
- **Proof:** a `test/pages.test.ts` case asserting the combined rule keeps a dashed amber outline fails now and passes after.

### 12. A song with no End reads "Next End" on its last section, and Next and Loop stay enabled there but do nothing — LOW
- **Location:** `web/src/NowPlaying.tsx:44`, `web/src/SectionControls.tsx:24`
- **Attribution:** introduced, `0865c44` (#7) and `91257cf` (#3).
- **Real-world trigger:** a set with a missing End locator (the parser warns on the setup screen). The page says "Next End" while the song heading says "No End locator", and the server ignores Next (`endCue === null`) and Loop (`section.end === null`) on that section.

**Recommended fix** — In `NowPlaying`, show no Next line (or the next song's first section) when `now.next === 'end'` and the song's `end` is null; in `SectionControls`, disable Next on the last section when the song has no End, and Loop when the current section's `end` is null, through the existing `unavailable` path.

**Remediation brief**
- **Design intent:** a control the server will ignore must look unavailable, as Refresh and the section controls already do in other states.
- **Full surface:** `web/src/NowPlaying.tsx:44`, `web/src/SectionControls.tsx` (it needs the song's `endCue` or `end` and the section's `end`), `test/pages.test.ts`.
- **Must preserve:** `test/section-navigation.test.ts` "does nothing on the last section of a song with no End" (server side, unchanged).
- **Proof:** a `test/pages.test.ts` render of the last section of an End-less song asserts no "Next End" and a disabled Next; fails now.

### 13. Stop and Play from start stay enabled while Live is not connected, and the server ignores both — LOW
- **Location:** `web/src/App.tsx:42-57`, `web/src/StopButton.tsx`, `web/src/SongHeading.tsx:41`
- **Attribution:** introduced, `2463886` (#8) with `fae5828` (#5).
- **Real-world trigger:** Live drops (loading, crash): the red panel shows, but a full Stop hold fills and does nothing, as does Play from start, while Refresh and the section controls beside them are disabled.

**Recommended fix** — Fold into finding 6's availability flag: `available = connectedToServer && live === 'connected'` for Stop and Play from start; the end toggles stay enabled while Live is lost, since the server accepts them (`playback-controller.ts:218`).

**Remediation brief**
- **Design intent:** the same as finding 6: a control the server will drop looks unavailable.
- **Full surface:** `web/src/StopButton.tsx`, `web/src/SongHeading.tsx`, `web/src/App.tsx`, `test/pages.test.ts`.
- **Must preserve:** end toggles usable while Live is lost; `test/hold-to-stop.test.ts`.
- **Proof:** a `test/pages.test.ts` render with `live: 'not-connected'` asserts Stop and Play from start disabled; fails now.

### 14. The parser builds impossible sections from a malformed set without a warning — LOW
- **Location:** `src/server/set-parser.ts:66-78`
- **Attribution:** introduced, `73af568` (#2), extended in `28f93fc` (#4).
- **Real-world trigger:** a locator dragged past its song's End, a second End, or a song's locator inside another song: for example `1 - Intro@0, 1 - End@16, 1 - Tag@20` gives Tag `{ time: 20, end: 16 }`, a negative length, and two Ends silently keep the first. The setup screen shows no warning, so the operator does not learn the set is wrong until "bar N of M" reads oddly. Executed by the server-core agent with `parseSet` directly.

**Recommended fix** — Warn (never throw) when a song has more than one End, when a section starts at or after its song's End, and when two songs' ranges overlap; add the kinds to the warning type and cases to `test/setlist.test.ts`.

**Remediation brief**
- **Design intent:** the parser never throws and surfaces every problem as a setup-screen warning (spec).
- **Full surface:** `src/server/set-parser.ts:30-80`, the warning kind union in `src/shared/snapshot.ts`, `test/setlist.test.ts`.
- **Must preserve:** every current parser case in `test/setlist.test.ts` (separators, titles, repeated names, gaps, missing End).
- **Proof:** new `test/setlist.test.ts` cases for each shape fail now and pass after.

## Needs Further Investigation
### A. Sliding a finger off Stop may not cancel the hold on the iPad
`web/src/StopButton.tsx:6,43` relies on `pointerleave`. With touch input, browsers apply implicit pointer capture to the pressed element, and while captured, boundary events fire as if the pointer were still over it, so a finger that slides off Stop and stays down for 1 second may still stop Live. The e2e suite covers early release and `pointercancel`, not slide-off. Confirm on the iPad (press Stop, slide off, keep holding past a second) or in Playwright with `hasTouch` and a dispatched touch move outside the button. If confirmed, release capture in `onPointerDown` (`event.currentTarget.releasePointerCapture(event.pointerId)`) or release when `onPointerMove` leaves the bounding box; this would rate HIGH (an unintended stop).

### B. A half-open socket on a page that stays awake is never detected
`web/src/server-connection.ts` reconnects only on close, error or a visibility change, and the hub sends no heartbeat. A phone or the FOH screen that stays awake through a Wi-Fi glitch can hold a socket that reads open and receives nothing, showing stale state indefinitely. OS-dependent, so unproven; `e2e/reconnect.spec.ts:60-62` pins the current gap. Already the #10 lane proposal "Detect a half-open socket while the page stays visible". Confirm with `proxy.freeze()` and no visibility change on a real phone.

### C. A loop on a song's last section could trip the auto-stop
If Live reports `current_song_time` exactly at the loop end (equal to End) before wrapping, `reachedEnd` stops a deliberate vamp (shown with the controller driven directly). The fake Live never reports the loop end exactly, so only #13's hardware check can confirm.

### D. Older band phones may get a blank page
`vite.config.ts` sets no `build.target`; Vite 8 defaults to `baseline-widely-available` (about Safari 16). Confirm on the oldest phone in the band.

### E. Two pedals of the same model, or a quick replug
`src/server/coremidi-input.ts:32-57` keys sources by name and position, so a replug within the 3-second rescan, or two same-name devices, may leave a stale input. Needs a real pedal (#13 or #14).

### F. A Live restart inside the 3-second loss window drops every listener unnoticed
The bridge re-registers only after 3 seconds of silence; AbletonOSC sends `/live/startup` on load (`application.py:14`). Already the #8 lane proposal "Re-register the listeners when AbletonOSC sends /live/startup". Confirm by restarting Live quickly in the hardware check.

## Reviewed and Dismissed
- The listener reply address `/live/song/get/<property>` and the bridge's decoder — correct per `handler.py:69` at `0ca6821`.
- Listener updates going to the most recent sender only (`fake-live.ts:105`) — matches `osc_server.py`; the server is the only client on 127.0.0.1:11001.
- `reachedEnd` refusing moves of a bar or more and any waiting jump — intended (`1fbc33f`, a hand relocation must not stop Live); finding 2 adds a second trigger beside it and does not loosen it.
- The pedal stopping Live — impossible: `PedalAction` excludes stop, the loader rejects it in any case or spacing, and the dispatcher maps only loop, next, previous (mutation M5 caught by `test/pedal.test.ts:161-163`).
- Reads while playing — guarded twice, at the command and at the reply (mutations M2 and M2b caught).
- View-only commands — dropped (mutation M1 caught by five tests).
- Path traversal in `serveFile` — blocked by `normalize` plus the root-prefix check.
- `toCuePoints` misaligning indexes on a malformed pair — AbletonOSC always sends name, float pairs (`song.py:241-244`).
- Running `.ts` directly with node — `erasableSyntaxOnly` and `verbatimModuleSyntax` are on, every import has a `.ts` extension, no enums or parameter properties.
- CI action SHAs — genuine (`git ls-remote`): checkout v4.3.1, pnpm/action-setup v4, setup-node v4.
- Commands dropped while Live is not connected, Stop included (`playback-controller.ts:218`) — a deliberate #8 decision (a jump would leave a stale waiting mark); finding 13 makes it visible instead.
- Multi-touch on Stop — fails safe: a second finger only cancels the hold or sends an idempotent second stop.
- The contract check passing vacuously against the fake — two fake runs compare clean and every observation is as expected; against real Live, finding 1 is why it would read `unobserved`.
- `/api/setup` from the Vite dev proxy — unreachable as configured (Vite binds localhost).

## Minor / nits
- `web/src/NowPlaying.tsx:27-29`: "Jumping to Intro." does not name the song when Play from start targets another song while playing.
- `web/src/Setup.tsx:18-21`: with Live lost, "Live not connected" shows twice; with an empty set the setup screen says "Between songs." and "No warnings." while the other pages say "The set in Live has no songs."
- Between songs and on a Live drop, the now-playing block shrinks and the tap targets vanish, so controls move under the leader's finger (`web/src/NowPlaying.tsx:34-42`, `web/src/JumpTargets.tsx:22`).
- `web/src/server-connection.ts:63-65`: after a wake, the old socket's snapshots are ignored until the new one opens.
- `web/src/StopButton.tsx:24-27`: the hold timer starts a frame or two before the CSS fill does.
- Every snapshot carries the pedal status, including `configPath` (a home-directory path) and each MIDI message, to every viewer, and an expression pedal's CC sweep republishes the snapshot per message (`src/server/server.ts:78`). Splitting it needs a setup channel, which finding 8 deliberately avoids.
- `src/install/launch-agent.ts:38-42`: a start-up failure respawns every second and appends to the error log without limit.
- `scripts/uninstall-launch-agent.sh:17`: under `set -e`, a failed bootout exits before the plist is removed; running it again recovers.
- `src/contract/main.ts:97-102`: a live run with no listener reports exits 0 with no warning.
- `src/contract/compare.ts:15`: `"steps": null` throws and exits 1, which means "differences".
- `src/contract/*` has no tests; the fake-target run is deterministic and could be one slow test.
- `src/fake-live/main.ts:31-32`: `--port abc` crashes with a stack trace.
- `src/server/server.ts:80-108`: a failed bridge start leaves the hub and MIDI input open (tests only; production exits).
- `.github/workflows/ci.yml:5-6`: pushes to `main` are never checked, and Nick's workflow commits to main; the README says so, so it is a choice, not a bug.
- `.github/workflows/ci.yml`: the checkout pin's comment says `# v4`; the SHA is v4.3.1.

## Test quality
Tests added: 176 (170 Vitest in 17 files, 6 Playwright). Green against `$BASE`: not applicable, since the base holds only a README and every test is trivially red there; replaced by 10 targeted mutations, 8 caught and 2 survived (finding 9). Tautology shapes found: none of mock-the-unit, identity, snapshot or assertion-free; one missing-barrier shape, twice (finding 9). Weaker candidates from reading, not mutated:
- `test/live-connection.test.ts:133` checks no snapshot shows a jump after the restart but never that Live received no jump; add a barrier and `expect(rig.received(JUMP)).toEqual([])`.
- `test/reconnect.test.ts:183-193` does not freeze the old socket, so it passes even with the wake handling removed; `proxy.freeze()` before the wake.
- `test/section-navigation.test.ts:106-107` counts two jumps but never checks the second is the End cue.
- `test/section-navigation.test.ts:78-95` makes the exact jump finding 2 is about and never asserts the stop.
- `test/pages.test.ts:374-379` calls the button's `onClick` directly, bypassing `disabled` (mitigated by the markup test at :368).
- `test/setup-screen.test.ts:124` runs on Linux only (CI runs it), so the laptop-only refusal is untested on the dev Mac.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build all pass at `a2ee7b8`.
- **Commit hygiene:** commit this doc and `repro/` (the repro tests sit outside `test/`, so the suite does not run them; copy one in to run it, per each brief). Nothing else to drop.
- **Likely reviewer asks:** proof the controller works against real Live (it does not until finding 1 lands; then #13's contract run is that proof); why every page looks live while the server is unreachable (finding 6); the Playwright suite's status outside CI.

## Verdict
**Not ready.** Gate before the PR opens: finding 1 (CRITICAL, no Live reports at all against real AbletonOSC) and finding 2 (HIGH, ending a song early with Next does not stop it). Findings 3, 4 and 5 are small diffs already verified in scratch with the whole suite green, so take them in the same pass. Findings 6 to 14 can ship as follow-up tickets, and 1, 2, 3, 6 and 8 each repeat an open lane proposal, so file them against those rather than as new issues. No prior review findings to close (round 1).

## Remediation — 2026-10-13
All 14 confirmed findings were worked, the LOW tail included (epic-loop rule: a round with a MEDIUM or higher finding fixes every confirmed finding). There is one commit per finding, each with `--no-verify`. After the last fix, `pnpm lint`, `pnpm typecheck`, `pnpm test` (18 files, 193 passed, 2 skipped, both Linux-only) and `pnpm build` all pass, the Playwright suite passes (7 of 7), and both repro files under `repro/` are green (5 of 5). Phase 2 sent three disprove agents to findings 1, 2, 3, 5, 6, 8 and 10. Their verdicts held more than 2 introduced defects, so the **Phase 2.5 tripwire stopped the round**. No rework pass was made and no scoped re-verify was run. Everything they raised is listed below, open.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (CRITICAL) | `d667eb4` Register Live listeners on the per-property address AbletonOSC handles | red→green: fake Live half alone, then `pnpm exec vitest run test/setlist.test.ts test/now-playing.test.ts` (10 red, then all green with the address fix) | 0 | fixed |
| 2 (HIGH) | `f33b29b` Stop Live at End when Next jumps there from more than a bar before End | red→green: `test/section-navigation.test.ts` new case red against the parent controller; repro `-t "more than a bar before End"` green | 1 (test) | introduced: a duplicate `stop_playing` (see Known regressions) |
| 3 (MEDIUM) | `f68587d` Keep no jump waiting while stopped when the target starts where the playhead already is | red→green: two new `test/jump.test.ts` cases red against the parent; reworked `test/refresh.test.ts` red when the set-change `clearJump()` is removed (executed) | 1 (test; 2 test lines replaced) | fixed |
| 4 (MEDIUM) | `3967d32` Keep the server up when a client sends a malformed WebSocket frame | red→green: new `test/server.test.ts` case (unhandled `RangeError` before, pass after); hub repro green | 0 | proved by execution |
| 5 (MEDIUM) | `90969a8` Brace the waiting jump's target when Loop is pressed before the downbeat | red→green: new `test/loop.test.ts` case | 1 (test) | half-fixed: Next to End, then Loop, still braces the section being left |
| 6 (MEDIUM) | `571c234` Show every page when the server is out of reach, and disable the leader's controls until it is back | red→green: new `test/pages.test.ts` and `test/reconnect.test.ts` cases; new `e2e/reconnect.spec.ts` case green | 0 (1 test comment reworded; 1 CSS comment) | half-fixed: a wake whose fresh socket never opens still reports connected |
| 7 (MEDIUM) | `d8115bd` Point the launch agent at the node path the shell finds, not Homebrew's versioned keg | red→green: new `test/launch-agent.test.ts` case; `SETLIST_NODE=/opt/homebrew/bin/node node src/install/print-launch-agent.ts` prints the symlink | 0 | proved by execution |
| 8 (MEDIUM) | `5541a35` Add Refresh to the setup screen, through a laptop-only POST | red→green: new `test/setup-screen.test.ts` cases (the 403 case runs on Linux only) | 2 (test) | fixed (LOW notes in Known regressions) |
| 9 (MEDIUM) | `57385dd` Give the pedal's nothing-reached-Live tests a leader barrier, so they can go red | mutation `onAction(action ?? 'loop')`: both tests red 3 of 3, reverted | 2 (test) | proved by execution |
| 10 (LOW) | `ec66368` Make the contract check's clean-up reach Live, on a failure and on Ctrl-C | red→green: new `test/contract.test.ts`; red under the mutation "send, not flush"; two fake runs compare "No differences"; SIGINT on a fake run exits 130 with `stop_playing` in the report | 2 (test) | fixed (one LOW introduced, see below) |
| 11 (LOW) | `d6c4e6f` Keep the waiting mark visible on a section that is also looped | red→green: new `test/pages.test.ts` case | 0 (1 CSS comment) | proved by execution |
| 12 (LOW) | `d096d1e` Show no Next End, and disable Next and Loop, on the last section of a song with no End | red→green: two new `test/pages.test.ts` cases | 1 (test) | proved by execution |
| 13 (LOW) | `2517d03` Disable Stop and Play from start while Live is not connected | red→green: new `test/pages.test.ts` case | 0 | proved by execution |
| 14 (LOW) | `d6797a3` Warn about a repeated End, a section at or after End, and overlapping songs | red→green: three new `test/setlist.test.ts` cases, plus a gapless no-warning case | 0 | proved by execution |

### Known regressions, deferred
- **Duplicate `stop_playing` when both auto-stop triggers fire on one report (MEDIUM).** Introduced by `f33b29b`. Verdict: "`||` short-circuits, so when `reachedEnd` is true, `landedOnEnd` never runs and `endJump` is never consumed … `["jump 3","STOP","STOP"]`", executed with Next pressed at 61 and reports 63.9, 64.05 and 64.1 before `is_playing false`. The trigger is Next in the last bar before End, the commonest way to press it. A second stop in Live may return the playhead to the start. Proposed fix: evaluate both triggers into constants before the `||`, plus a test for exactly one stop with two reports past End. Not fixed because the tripwire fired.
- **A hand relocation can stop Live while an End jump is armed (LOW, partly unverified).** Introduced by `f33b29b`. Verdict: "`landedOnEnd` cannot tell the End jump landing from any other arrival in [End, End + bar)". It matters only if Live drops a waiting cue jump on a hand relocation, which only #13's hardware check can confirm. Possible guard: record the End jump's bar line, and drop `endJump` on a backwards move or a move of a bar or more before it. Not fixed because the tripwire fired.
- **Stop can be disabled mid-hold (MEDIUM, browser behaviour unverified).** Introduced by `571c234` and widened by `2517d03`. Verdict: "Nothing releases the hold when `available` turns false … a stop is sent even though the leader let go early". It depends on whether WebKit delivers `pointerup` to a button that became disabled. Proposed fix: in `StopButton`, `useEffect(() => { if (!available) release(); }, [available])`. Not fixed because the tripwire fired.
- **Ctrl-C now writes a partial report over `--out` (LOW).** Introduced by `ec66368`. Verdict: "A re-run at the same path … replaces an earlier complete report with a partial one". Option: skip the write when interrupted. Not fixed because the tripwire fired.
- **Stale comment (LOW).** Introduced by `5541a35`: `src/server/server.ts:58-59` still says "A command reaches the controller only through the hub", but the setup Refresh now reaches it over HTTP. Not fixed because the tripwire fired.
- **Setup Refresh notes (LOW).** Introduced by `5541a35`:
  - Any page open in the laptop's browser can POST to the endpoint (CSRF). The impact is a locator re-read while stopped. An `Origin` or `Sec-Fetch-Site` check would close it.
  - `refreshFromLaptop` ignores a 403 and leaves a rejected `fetch` unhandled.
  - The refusal test runs on Linux only.

  Not fixed because the tripwire fired.

### Open from this round (half-fixes)
- **Finding 5, missing half (MEDIUM).** After Next on a song's last section (an End jump pending, which is not a `waitingJump`), Loop still braces the section being left (`loopOn(48,16)` in the verifier's probe). Proposed: `if (endJump !== null) return;` before choosing the section, with a `test/loop.test.ts` case asserting no loop messages.
- **Finding 6, missing half (HIGH per the verifier).** Two cases:
  - A wake whose fresh tries hang (laptop off the Wi-Fi, lost packets) never reports false. A try closed by the connect timeout, and the replaced `previous` socket, are both ignored by the `socket !== opened` guard. The page then shows connected with nothing carrying commands. Executed with a fake WebSocket: statuses `[true]` with every socket closed.
  - `onStatus(true)` fires on open, before the first snapshot (LOW).

  Proposed: report false when the connect timer replaces a try while `previous` is set (after `retire()`), and when `previous` itself closes while the current socket is not open.

### Rework briefs
None. No rework was done, because the tripwire stopped the round. The proposed fixes above are the verifiers' hints, not briefs. The next `/review-branch` round should brief them, running the line-by-line audit on each.
