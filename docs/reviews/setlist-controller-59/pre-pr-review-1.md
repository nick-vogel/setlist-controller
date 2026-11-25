# Pre-PR review: setlist-controller#59 Song transitions: overlap into the next count-off, a prayer pad, and fades

**Branch:** `setlist-controller-59-song-transitions` vs `origin/setlist-controller-32-set-builder` (merge-base `e4aa4e6` "setlist-controller#32 pre-PR review 2")
**Reviewed at:** HEAD `95462f3` (setlist-controller#69 Pad fades: fade in, and fade out under the next count-off), clean tree: 0 files with uncommitted changes, 0 untracked; 43 files total, +4215 / -173 against the merge-base
**Reviewed against:** the epic body of setlist-controller#59 and its comment of 2026-10-16 (both Live unknowns proven, the ring-tempo rule); the bodies of sub-issues #61 to #70; the run's recorded decisions and out-of-scope proposals per ticket (`.epic-loop/tickets/<n>/assumptions.md`, `proposals.md`), read so that a recorded decision is not re-reported as a defect; the vault's UMC1820 output plan (`church/production/2026-10-15-umc1820-output-plan.md`) for how the click reaches the band. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 1, `--fresh`.
**Date:** 2026-10-17
**Reviewer:** 3 code-review agents + 1 test-audit agent + 1 differential-harness agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | ok, lockfile unchanged against the merge-base |
| Lint | `pnpm lint` | pass (the repros under `repro/` included, since `eslint .` lints `docs/`) |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 28 files, 458 passed, 2 skipped (the two `it.runIf(linux)` cases in `test/setup-screen.test.ts`, unchanged) |
| Build and Playwright | `pnpm test:e2e` (runs `pnpm build` first) | build ok; 8 passed (webkit-ipad), `e2e/fade-out.spec.ts` included |
| A gap-only build writes what the base writes (epic: "a set built the old way sounds exactly as it does today") | differential harness: HEAD's and BASE's `buildSet` imported by absolute path, identical inputs from HEAD's fixture library and template, gunzipped `.als` compared byte for byte with only the output-root prefix normalised; BuildResult and every written file (path, size, sha256) compared | **178 of 178 identical**: every order of the 4 fixture songs, 1 to 4 songs, with HEAD given no `transitions` and `transitions: {}`; variants with no end marker, added tempo and meter events, a Live 8 song, a song with no locators, a song named twice, `--replace`, an existing set folder, a name that matches no song, an explicit `{ type: 'gap' }` at every position, a `pads` folder that does not exist. Gzipped `.als` byte-identical in 6 cases built into one path. BuildResult differs only by the intended `transition: { type: 'gap' }` on songs 1 to n-1. 4 negative controls (an overlap, swapped orders) differ, so the harness can see a difference |
| Chained transitions | finder A, scratch copy of HEAD: overlap then pad, pad then overlap, overlap then a pad after the last song, three overlaps in a row | zero `parseSet` warnings, no two clips sounding at once on one track, a tempo and meter step on each handoff, old value then new |
| AbletonOSC addresses and reply shapes | finder C read the installed AbletonOSC (`song.py`, `track.py`, `osc_server.py`, `handler.py`) | `track_data` with `0, -1` returns `(name, is_grouped)` pairs per `song.tracks` index; `track/get/volume` replies `(index, value)`; the bridge and the fake Live match. The installed folder is not a git checkout, so the `0ca6821` pin itself is not confirmed |
| Click routing (story 54) | vault, UMC1820 output plan | the band's click is Live's metronome through the Main track's Cue Out; the MT Click track is muted unless the metronome fails, so the fade fading MT CLICK is inaudible in normal use (Dismissed) |
| Tautology audit, oracle `e4aa4e6` | the branch's 12 changed test files and the new fixture copied into a scratch worktree at BASE; three harness variants, since the branch's `test/harness.ts` imports `PROBE_INTERVAL_MS`, which BASE does not export | 143 tests added or changed: 126 red, 17 green (see Test quality); `test/pages.test.ts` red on import (`FadeOutButton.tsx`), and still 10 of 10 red with an inert stub |
| Mutation A: every overlap built as a gap | `repro/review-1-mutation-overlap-as-gap.diff` applied in a scratch worktree at HEAD | 15 of 23 overlap tests red; the 5 cases of "every overlap build › puts no two clips that sound at once on one track" stay green (finding 8) |
| Mutation B: the fade's `if (!playing) return;` gate removed | scratch worktree at HEAD | "is refused while Live is stopped" goes red; the test is sound |
| Mutation C: the last song with no pad drops its meter rule | `repro/review-1-mutation-last-song-meter.diff` | 10 tests red elsewhere; "keeps every tempo and meter event of a last song with no pad" stays green (finding 8) |
| Mutation: delete `write-set.ts:218` (`if (start >= ending) return undefined;`) | finder A, scratch copy of HEAD | all 182 tests in the four set-builder test files stay green (finding 8) |
| Finding 1 repro | `repro/review-1-close-mid-fade.test.ts` copied into `test/` and run | red at HEAD: after `server.close()` 3 s into a fade, the volumes stay `[0.375, 0.5, 0.25]` against saved `[0.75, 0.5, 0.5]`. With the recommended fix in a scratch worktree at HEAD (since removed): the repro and all 16 tests of `test/fade-out.test.ts` pass, `tsc` clean |
| Finding 2 proof | `node src/set-builder/main.ts grace goodness --pad <value> --library test/fixtures/set-builder/library ...` | at HEAD `--pad two`, `--pad 3`, `--pad 0` each print "A transition after song NaN/3/0 needs a song position from 1 to 2." and exit 1 (`--overlap two` exits 2 with the usage message). With the recommended fix in the scratch worktree: `two`, `3`, `0`, `=G`, `9=H` exit 2 with the usage message, `1=H` keeps its key message, `--pad 2` (the last song) is accepted; `test/set-builder-command.test.ts` and `test/set-builder-pad.test.ts` 84 passed; lint and `tsc` clean |
| Finding 3 repro | `repro/review-1-short-pad.test.ts` | red at HEAD, both cases: a 1-second pad builds (`ok: true`) |
| Finding 4 repro | `repro/review-1-lost-fade-reply.test.ts` | red at HEAD: a press 60 s after a lost volume reply sends no new `track_data` |
| WAV header edge cases | finder B, 13 hand-made WAVs through `readWavHeader` | WAVE_FORMAT_EXTENSIBLE, LIST before fmt, data before fmt, an odd LIST with its pad byte, block align 0, sample rate 0, files under 12 bytes, RF64, a data size past the end of the file: all handled. An odd chunk without its pad byte and MP3-in-WAV are not (Minor) |
| Pad lookup, real-world folder names | finder B, `buildSet` on scratch copies of the fixture library | `Db`/`C#m` with only `C#.wav` resolve and copy once; `a.wav` and `A.WAV` are not found (finding 7) |
| Real pads folder | `ls ~/Music/MultiTracks/_pads` | does not exist yet (#60 is Nick's), so no real pad file was measured |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #71 is Nick's run by ear and on the iPad |

**Overall:** The transitions hold up where they matter most. A set built with gaps only is byte-identical to what the base writes across 178 services, every chained mix of overlaps and pads reads back with zero parser warnings and no overlapping clips, and the full checks are green. Two MEDIUM findings should land before the PR: a server shutdown during a fade leaves the set quiet, and a bad `--pad` number is not the usage error the spec names. The seven LOW findings are edge cases with no known trigger and test gaps; most already sit in the run's proposals and can ship as follow-up tickets.

## Approach decisions
- **Server close during a fade (finding 1):** `close()` sets every saved volume back synchronously, as `cancel()` does (`src/server/fade-out.ts:90-95`), before the bridge closes; `server.ts:139-143` already calls `fade.close()` before `live.close()`. Persisting saved volumes across a crash or restart stays out of scope (the run proposal "Keep a fade's saved volumes across a server restart").
- **`--pad` positions (finding 2):** a usage error in `src/set-builder/main.ts`, digits only, 1 to the song count (the last song allowed), mirroring `overlapPosition` (`main.ts:136-141`). `checkTransitions` in `build-set.ts:153-164` keeps throwing as a guard for programmatic callers, as #64 settled for `--overlap`.
- **A pad too short for one bar (finding 3):** a problem in the one-pass list, computed by the same rounded-down bar arithmetic `padSection` uses, through one helper exported from `timeline.ts` and imported by `checks.ts`, as `findEnding` is. Rounding down and `WHOLE_BAR_TOLERANCE` stay.
- **A fade read that never completes (finding 4):** a deadline checked on the next press with `clock.now()`, as `lose()` checks `RESTORE_AT_RISK_MS` (`fade-out.ts:104`); no new timer.
- **A song with no section after its Count Off (finding 6):** `findIntro` exported from `timeline.ts` beside `findEnding`, used by the checks; `introOf` in `write-set.ts` stays as the guard, as `endingOf` does for `findEnding`.
- **Server close during a fade, amended by the round 1 remediation (finding 1 rework, `9b82b74`):** `close()` also marks the fade closed, and `fadeOut()` does nothing once it is, so no new fade starts in the window between `fade.close()` and `live.close()` while `server.ts` awaits the MIDI input and the hub.
- **The fade read deadline (finding 4, as built in `96c0e59`):** `READ_TIMEOUT_MS` is 1000 ms, counted from the press that started the reads (`since`, carried from `reading-tracks` into `reading-volumes`); a press at exactly the deadline is still ignored (`>`). There is no timer, so with no new press a late reply still starts the fade (`204703b` says so in the `fadeOut` comment).
- **`--pad` positions (finding 2, as built in `3fe4152`):** `padPosition` sits beside `overlapPosition` in `main.ts`; the position is checked before the key, so `--pad 9=H` reports the position.
- **A song with no section after its Count Off, amended by the round 1 remediation (finding 6, `0386df2`):** one check, `introProblems` in `checks.ts`, covers overlaps and pads alike, names a song once however many transitions go into it (as `overlapProblems` names a problem two overlaps give once), and sits in `buildSet`'s list between the overlap problems and the pads' own. This replaces the brief's "in `overlapProblems`, plus a sibling for pads", which would have named a song twice when an overlap and a pad both go into it.
- **The overlap ring rule (finding 5, `bd4770c`):** `ringingBeat` (the ring conversion) and `silenceAfter` (Intro plus 2 bars of the starting meter) live in `timeline.ts`; `cutOrRing`, `introAndSilence` and `slotProblems` all call them. A next song with no Intro, or with no starting tempo or meter, falls back to the pre-round count: every clip that ends after the Ending rings.
- **Reading a song's starting tempo or meter in the check phase (findings 3 and 5 rework, `b20e668`):** `hasStartingValues` in `song.ts`, built on the lookup `mainEvents` uses (`startingValue`), guards any check that reads them; a song without them is left to placement's throw, which still names it when nothing else stops the build. A future check that calls `mainEvents`, `meterOf`, `padBars` or `silenceAfter` on a song takes the same guard.
- **Pad file names (finding 7, `9f94144`):** matched case-insensitively, in `padFileNames` order (the key's own spelling, then its twin), and read, copied and referred to by the file's real name; the clip's `Name` is that name less its extension, so `a.wav` gives a clip named `a`, as Live names a clip after its file.

## Confirmed Issues

### 1. A server shutdown during a fade leaves every top-level track at the level the fade reached — MEDIUM
- **Location:** `src/server/fade-out.ts:156`; called from `src/server/server.ts:140`, which `src/server/main.ts:52-58` reaches on SIGTERM and SIGINT
- **Attribution:** introduced. `git log -S'close: () => stopStepping()' e4aa4e6..HEAD` gives `a314c36` (setlist-controller#63 Fade out button: fade the music over 6 seconds, stop Live, restore the volumes); #67 did not change it.
- **Real-world trigger:** the server stops while a fade runs: `launchctl bootout` (SIGTERM, per the comment at `main.ts:51`), a restart, a logout or reboot of the laptop, or Ctrl-C on a terminal run, inside the 6-second fade. None known during a service. MEDIUM, capped: upgrade to HIGH if the server is ever stopped or restarted while Live plays a service (the launchd agent's log shows each start).

**Evidence**
```ts
  const cancel = () => {
    if (state.kind === 'lost') return;
    stopStepping();
    if (state.kind === 'stepping') restore(state);
    state = { kind: 'idle' };
  };
  ...
    close: () => stopStepping(),
```

**Failure mode** — Live plays on with each top-level track at its faded level, and the saved volumes exist only in the exiting process, so nothing puts them back: the next song plays quiet until someone resets every fader by hand. Executed: `repro/review-1-close-mid-fade.test.ts` fades a 3-track set (one grouped) for 3 s, closes the server, and reads the fake Live's volumes: `[0.375, 0.5, 0.25]` against the saved `[0.75, 0.5, 0.5]`. The existing close test (`test/fade-out.test.ts:459-472`) asserts only that no step throws after close, so it stays green. This breaks the spec's story 53 ("then set every volume back ... so that the next song plays at its normal level") on the one exit path the fade does not cover.

**Recommended fix**
```diff
-    close: () => stopStepping(),
+    close: () => {
+      stopStepping();
+      if (state.kind === 'stepping' || state.kind === 'lost') restore(state);
+      state = { kind: 'idle' };
+    },
```

**Remediation brief**
- **Design intent:** the fade module holds the top-level tracks' pre-fade volumes only in memory, in the `stepping` and `lost` states. Every way a fade ends puts them back: its own last step, `cancel()` (Stop, a jump, Live's own stop), and `regain()` after a lost connection. Server close is the one exit that does not. A fade still reading (`reading-tracks`, `reading-volumes`) has changed nothing in Live, so it has nothing to restore.
- **Full surface:** `src/server/fade-out.ts:156` (`close`); the `FadeOut.close` doc comment at `fade-out.ts:46`, which must say that close also sets every saved volume back; `test/fade-out.test.ts:459-472`, which gains an assertion that the volumes are back after a close mid-fade (the repro's steps: `rig.server.close()` then `rig.live.volumes()`), beside its existing no-throw assertion. `src/server/server.ts:139-143` keeps its order: `stopPoll()`, `fade.close()`, then the rest, `live.close()` last.
- **Must preserve:** no step goes out after close (`test/fade-out.test.ts` "stops stepping when the server closes, so no step goes out on the closed socket"); close sends nothing from `idle` or the reading states; the restore sends each saved volume once, as `cancel()` does; every other test in `test/fade-out.test.ts` and `e2e/fade-out.spec.ts`.
- **The fix's own failure:** in `lost`, Live is gone, so the restore reaches nobody and the set stays at the fade's levels; an abrupt kill (SIGKILL, a crash) never runs close at all. Both stay with the run proposal "Keep a fade's saved volumes across a server restart" (`.epic-loop/tickets/67/proposals.md`), which this fix does not replace.
- **Do not touch:** the absence of a fade field in the snapshot and the restore by track index on reconnect (both Reviewed and Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-59/repro/review-1-close-mid-fade.test.ts test/ && pnpm exec vitest run test/review-1-close-mid-fade.test.ts; rm test/review-1-close-mid-fade.test.ts` is red now (`expected [ 0.375, 0.5, 0.25 ] to deeply equal [ 0.75, 0.5, 0.5 ]`) and green after; then `pnpm exec vitest run test/fade-out.test.ts`.

### 2. A `--pad` number that names no song is not a usage error: it exits 1 with "song NaN" — MEDIUM
- **Location:** `src/set-builder/main.ts:68` and `:116-127` (`padValue`); the throw it falls through to at `src/set-builder/build-set.ts:153-164`, printed by the catch at `main.ts:97-100`
- **Attribution:** introduced. `--pad` parsing came in `df291e7` (setlist-controller#66 Pad tracer bullet); `padValue` took its current shape in `be61e29` (setlist-controller#68 Pad keys and a pad after the last song). The run recorded the gap as a proposal, "Make a --pad number that is not a song position a usage error" (`.epic-loop/tickets/66/proposals.md`), but the epic's Implementation Decisions already require it: "A position out of range ... is a usage error: the command prints it and exits with the usage code, and builds nothing."
- **Real-world trigger:** a mistyped or mis-numbered `--pad`, such as a pad on song 5 of a 4-song set, a word, or `--pad =E` with no number. User story 7 names exactly this case. Nothing wrong is ever built: the build stops before reading anything.

**Evidence**
```ts
// ... A position that names no song throws from
// buildSet, as a transition after no song does.
function padValue(value: string): { position: number; key?: string } {
  const split = value.indexOf('=');
  if (split === -1) return { position: Number(value) };
```

**Failure mode** — at HEAD, in a 2-song build, `--pad two` prints `A transition after song NaN needs a song position from 1 to 2.`, `--pad 3` and `--pad 0` print the same with 3 and 0, and each exits 1, the code the project skill (`.claude/skills/build-set/SKILL.md` step 6) reads as a library, template or pads problem, so the skill would send Nick to the library for a typo. `--overlap two` in the same build exits 2 with `--overlap must name a song by its position, a whole number from 1 to 2, not "two".` `Number()` also takes `0x2`, ` 2` and `1.0` as positions, which `--overlap` rejects. No command test covers a bad `--pad` position.

**Recommended fix**
```diff
-const pads = (values.pad ?? []).map(padValue);
+const pads = (values.pad ?? []).map((value) => padValue(value, positionals.length));
```
```diff
-function padValue(value: string): { position: number; key?: string } {
+function padValue(value: string, songs: number): { position: number; key?: string } {
   const split = value.indexOf('=');
-  if (split === -1) return { position: Number(value) };
+  const position = padPosition(split === -1 ? value : value.slice(0, split), value, songs);
+  if (split === -1) return { position };
   const key = value.slice(split + 1);
   if (key === '') usage(`--pad ${value} names no key after "=". ${KEY_GRAMMAR}`);
   if (!isKey(key)) usage(`--pad ${value}: "${key}" is not a key. ${KEY_GRAMMAR}`);
-  return { position: Number(value.slice(0, split)), key };
+  return { position, key };
 }
+
+function padPosition(text: string, value: string, songs: number): number {
+  const position = /^\d+$/.test(text) ? Number(text) : 0;
+  if (position < 1 || position > songs) usage(`--pad must name a song by its position, a whole number from 1 to ${songs}, not "${value}".`);
+  return position;
+}
```

**Remediation brief**
- **Design intent:** the command stops every flag value that names no song as a usage error (exit 2, through `usage()`), before `buildSet` runs, so that exit 1 always means a problem with the library, the template, the pads or the set folder. `overlapPosition` (`main.ts:136-141`) is the precedent: a position is digits only, from 1 to the song count. A pad may follow the last song, so its upper bound is the song count itself, where `--overlap`'s is one less. `buildSet`'s `checkTransitions` keeps its throw for programmatic callers (#64's decision).
- **Full surface:** `src/set-builder/main.ts:68` (the call), `:115-127` (`padValue` and its comment, whose sentence "A position that names no song throws from buildSet" must change to say the position is a usage error), the new `padPosition` beside `overlapPosition` at `:133-141`; `test/set-builder-command.test.ts`, a new `it.each` beside the `--overlap` block at `:371`, for `--pad` values `0`, `3` (in a 2-song build), `two` and `=G`, each expecting exit 2, the usage message, and nothing written.
- **Must preserve:** `--pad <last>` builds a pad after the last song (`test/set-builder-command.test.ts:183`); the key usage errors for a valid position keep their messages (`test/set-builder-command.test.ts:199-212`); the both-flags usage error (`:234`) still runs after both lists parse; the `--overlap` checks still run first; `checkTransitions` and its throw tests (`test/set-builder-overlap.test.ts` "a transition the build cannot place", `test/set-builder-pad.test.ts` around `:988`) stay. With the fix, `--pad 9=H` reports the position, not the key: intended, since the position is checked first.
- **Do not touch:** a `--pad` repeated for one position (Minor / nits: its own run proposal); the skill's step 6 needs no edit once a bad position exits 2.
- **Proof:** `node src/set-builder/main.ts grace goodness --pad two --library test/fixtures/set-builder/library --output-root "$(mktemp -d)"; echo $?` prints the NaN message and `1` now, and the `--pad must name a song by its position ...` message and `2` after; then `pnpm exec vitest run test/set-builder-command.test.ts test/set-builder-pad.test.ts`.

### 3. A pad file shorter than one bar still builds: a zero-length Pad section the controller warns about — LOW
- **Location:** `src/set-builder/timeline.ts:101-106` (`padSection`); no length check in `src/set-builder/pads.ts` or `src/set-builder/checks.ts`; the clips it shapes at `src/set-builder/write-set.ts:111-150` (`padClip`) and `:152-170` (`tailClip`)
- **Attribution:** introduced. `padSection` came in `df291e7` (setlist-controller#66 Pad tracer bullet), its rounding refined in `9367051` (setlist-controller#66 review pass 1 finding 2). The run recorded it as a proposal, "Stop the build on a pad file shorter than one bar of the next song's meter" (`.epic-loop/tickets/66/proposals.md`).
- **Real-world trigger:** a pad file shorter than one bar of the song whose tempo the section holds, about 2.5 to 4 seconds at the library's tempos: a truncated download or a short sample dropped into `_pads` by mistake. Real pad files run minutes, and the pads folder does not exist yet (#60). LOW, capped: upgrade to MEDIUM if any file in `~/Music/MultiTracks/_pads` is shorter than one bar once #60 lands (check each file's length with `afinfo`).

**Evidence**
```ts
  const bars = Math.floor((seconds * Number(valueOf(mainEvents(holder, 'Tempo').start))) / 60 / barBeats + WHOLE_BAR_TOLERANCE);
  return { at, length: bars * barBeats, bars };
```

**Failure mode** — a 1-second `D.wav` with `--pad 1` from This Is Amazing Grace into Great Are You Lord builds, and the summary says `pad in D`. In the set, `1 - End`, `1 - Pad` and `2 - Count Off` all sit on 460, the Pad clip runs from 460 to 460 with `LoopEnd` 0, and the tail clip plays 10 seconds of the 1-second file. The controller's parser warns `section-after-end: The locator "1 - Pad" is at or after song 1's End`, against the spec's "the controller reads the set with zero warnings". A pad after the last song gives the same warning (finder A, executed in a scratch copy). `repro/review-1-short-pad.test.ts` pins the missing stop: both cases return `ok: true`.

**Recommended fix**
```diff
 // src/set-builder/timeline.ts
+export function padBars(holder: Song, seconds: number): number {
+  const barBeats = barLength(meterOf(holder).start);
+  return Math.floor((seconds * Number(valueOf(mainEvents(holder, 'Tempo').start))) / 60 / barBeats + WHOLE_BAR_TOLERANCE);
+}
+
 function padSection(song: Song, at: number, holder: Song, seconds: number | undefined): PadSection {
   if (seconds === undefined) throw new Error(`The pad after ${song.folder} has no pad file.`);
   const barBeats = barLength(meterOf(holder).start);
-  const bars = Math.floor((seconds * Number(valueOf(mainEvents(holder, 'Tempo').start))) / 60 / barBeats + WHOLE_BAR_TOLERANCE);
+  const bars = padBars(holder, seconds);
   return { at, length: bars * barBeats, bars };
 }
```
```diff
 // src/set-builder/checks.ts
+export function shortPadProblems(service: (Song | undefined)[], pads: Record<number, Pad>): string[] {
+  return Object.entries(pads).flatMap(([key, { file }]) => {
+    const position = Number(key);
+    const holder = position < service.length ? service[position] : service[position - 1];
+    const seconds = file.frames / file.sampleRate;
+    if (!holder || padBars(holder, seconds) >= 1) return [];
+    return [`The pad after song ${position} plays ${file.name}, which lasts ${Number(seconds.toFixed(3))} s, less than one bar of ${holder.folder} at the tempo and meter it starts on.`];
+  });
+}
```
```diff
 // src/set-builder/build-set.ts, in the problems list
     ...padReading.problems,
+    ...shortPadProblems(service, padReading.pads),
     ...audioProblems(songs),
```

**Remediation brief**
- **Design intent:** every input problem joins the one-pass list and nothing is written on any problem. The Pad section is the pad file's seconds in beats at the holder's starting tempo (the next song, or the last song itself after it), rounded down to whole bars of its starting meter, with `WHOLE_BAR_TOLERANCE` so an exact number of bars is not lost to floating point. The check must use the same arithmetic as the placement, or a pad the check passes could still place as 0 bars; hence one helper exported from `timeline.ts`, which `checks.ts` already imports `findEnding` from.
- **Full surface:** `src/set-builder/timeline.ts:101-106` (`padSection`, and the new exported `padBars` beside it); `src/set-builder/checks.ts` (new `shortPadProblems`, importing `padBars` and the `Pad` type from `pads.ts`); `src/set-builder/build-set.ts:112` (the list) and the order comment at `build-set.ts:73-78`, which gains the step; `test/set-builder-pad.test.ts`, a test beside "a pad the build cannot make" (`:174`) for a pad between songs and one after the last song, expecting the exact problem and nothing written.
- **Must preserve:** the whole-bar tolerance ("a pad file exactly a whole number of bars long", `test/set-builder-pad.test.ts:546`); a pad of 1 bar or more still builds, a 10-second pad included, with its tail starting on the file's start (`:456`, the #69 recorded decision); every existing pad problem keeps its place and text; a pad whose holder could not be read gets no new problem (its own problem names it).
- **The fix's own failure:** none beyond the shared rounding, which the check and the placement now share by construction.
- **Do not touch:** the tail clip that runs past the end of a file shorter than its tail (Needs Further Investigation D), and the tail's start in the middle of the file.
- **Proof:** `cp docs/reviews/setlist-controller-59/repro/review-1-short-pad.test.ts test/ && pnpm exec vitest run test/review-1-short-pad.test.ts; rm test/review-1-short-pad.test.ts` is red now (`expected true to be false`, both cases) and green after; then `pnpm exec vitest run test/set-builder-pad.test.ts test/set-builder-command.test.ts`.

### 4. A fade whose track-list or volume reply never comes ignores every later Fade out until something else ends it — LOW
- **Location:** `src/server/fade-out.ts:120-124` (`fadeOut`) and `:133-153` (the reading states)
- **Attribution:** introduced, `a314c36` (setlist-controller#63). Recorded as the run proposal "A Fade out whose track list or volume reply is lost blocks every later Fade out" (`.epic-loop/tickets/63/proposals.md`); the test comment at `test/fade-out.test.ts:435-436` names the same failure for the disconnected case only.
- **Real-world trigger:** a reply that never comes while Live stays connected. AbletonOSC sends no reply when its handler raises (it catches and logs in `osc_server.py`), for example when a track is deleted at the laptop between the `track_data` read and its volume read; a datagram lost on loopback is rarer still. None known. LOW, capped: upgrade to MEDIUM if a Fade out press is ever seen to do nothing while Live plays. Stop, a jump, Live stopping, or a lost connection each return the fade to idle.

**Evidence**
```ts
    fadeOut() {
      if (state.kind !== 'idle') return;
      state = { kind: 'reading-tracks' };
      requestTrackData();
    },
```

**Failure mode** — `repro/review-1-lost-fade-reply.test.ts` answers the track list and one of two volume reads, advances 60 s, and presses again: nothing new is sent (`expected [ 'track_data' ] to have a length of 2 but got 1`). The leader page gives no sign, since the button stays enabled during a fade by design.

**Recommended fix**
```diff
+const READ_TIMEOUT_MS = 1000;
+
 type State =
   | { kind: 'idle' }
-  | { kind: 'reading-tracks' }
+  | { kind: 'reading-tracks'; since: number }
   // The volumes read so far.
-  | ({ kind: 'reading-volumes' } & Saved)
+  | ({ kind: 'reading-volumes'; since: number } & Saved)
```
```diff
     fadeOut() {
-      if (state.kind !== 'idle') return;
-      state = { kind: 'reading-tracks' };
+      const stale = (state.kind === 'reading-tracks' || state.kind === 'reading-volumes') && clock.now() - state.since > READ_TIMEOUT_MS;
+      if (state.kind !== 'idle' && !stale) return;
+      state = { kind: 'reading-tracks', since: clock.now() };
       requestTrackData();
     },
```
```diff
-        state = { kind: 'reading-volumes', tracks, saved: new Map() };
+        state = { kind: 'reading-volumes', since: state.since, tracks, saved: new Map() };
```

**Remediation brief**
- **Design intent:** the reads change nothing in Live, so abandoning a read that has not finished within 10 AbletonOSC ticks is safe; story 56's "a second press during a fade does nothing" protects a fade that is reading or stepping, not one whose reply is gone. The deadline is checked on the next press against `clock.now()`, the way `lose()` checks `RESTORE_AT_RISK_MS` (`fade-out.ts:104`), so no timer is added.
- **Full surface:** `src/server/fade-out.ts:15-23` (the new constant beside `FADE_MS`), `:53-60` (`State`), `:120-124` (`fadeOut`), `:143` (the move to `reading-volumes`); the `fadeOut` doc comment at `:36-37` ("A press while one runs, its reads included, does nothing"), which must name the deadline; `test/fade-out.test.ts`, a test that a press within the deadline is still ignored and one after it reads the track list again.
- **Must preserve:** a second press while stepping sends nothing (`test/fade-out.test.ts`, #63's second-press test); a press while the reads are in flight, inside the deadline, sends nothing (#63's recorded decision); `cancel()` and `lose()` still end a reading fade with nothing restored; a late reply to an abandoned read is either ignored by the state checks or fills the same track's volume.
- **The fix's own failure:** when Live never answers at all while connected, each later press re-sends `track_data` and nothing else; no volume is ever set, so the set cannot go quiet.
- **Do not touch:** the absence of a fade field in the snapshot (Reviewed and Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-59/repro/review-1-lost-fade-reply.test.ts test/ && pnpm exec vitest run test/review-1-lost-fade-reply.test.ts; rm test/review-1-lost-fade-reply.test.ts` is red now and green after; then `pnpm exec vitest run test/fade-out.test.ts`.

### 5. The overlap slot check counts a stem as ringing even when the overlap drops all its ringing clips — LOW
- **Location:** `src/set-builder/checks.ts:73`, against `src/set-builder/write-set.ts:224-226`
- **Attribution:** introduced. `git log -S'const rings = (stem'` gives `0343930` (setlist-controller#64 Overlap stop rules); the drop at the silence point came in `e5a60e1` (setlist-controller#65 Overlap fade). Recorded as the run proposal "Count a stem as ringing in the overlap slot check only when one of its clips still sounds after the cut" (`.epic-loop/tickets/65/proposals.md`).
- **Real-world trigger:** none. It needs a stem with a clip that starts after the Ending far enough to start ringing at or past the next song's Intro plus 2 bars; every MultiTracks stem is one clip from beat 0, as every fixture stem is. The error is in the safe direction: the build refuses a set it could place, it never places one the check missed.

**Evidence**
```ts
  const rings = (stem: SongTrack) => stem.clips.some((clip) => Number(valueOf(clip, 'CurrentEnd')) > ending);
```
```ts
  const ringStart = ringing(start);
  if (ringStart >= silence) return undefined;
```

**Failure mode** — finder A, executed in a scratch copy: Goodness of God into Trust In God with Goodness of God's BGVS clip moved to start on 316. The check reports `the overlap needs 5 VOX tracks ... and the template has 4`, while `placeSongs` and `writeSet` on the same inputs place the set without a throw, since `cutOrRing` drops that clip and leaves its track free.

**Recommended fix** — count a stem as ringing only when one of its clips ends after the Ending and starts ringing before the next song's silence point, the rule `cutOrRing` applies: `start < ending || ringing(start) < silence`, with `ringing` the conversion at `write-set.ts:224` (`secondsBetween` from `tempo.ts` at the next song's starting tempo) and `silence` the next song's Intro plus 2 bars of its starting meter. Take the Intro from `findIntro` (finding 6) and move the ring conversion into `timeline.ts` beside it, so the check and `cutOrRing` call one function.

**Remediation brief**
- **Design intent:** the slot check and the slot placement must agree on which of song n's stems still hold a track when song n+1 starts, or the check either refuses a buildable set or passes one that the placement guard (`write-set.ts` "has no free track") then throws on. Placement decides by the clips it actually writes (`soundingUntil`, `write-set.ts:50-71`).
- **Full surface:** `src/set-builder/checks.ts:71-85` (`slotProblems`, which needs the next song's Intro, starting tempo and starting meter); `src/set-builder/write-set.ts:212-241` (`cutOrRing`, which calls the shared conversion); the shared helper in `src/set-builder/timeline.ts`; a test in `test/set-builder-stop-rules.test.ts` beside the 4-VOX boundary test, built with `editClips` as `test/set-builder-overlap.test.ts:347` does.
- **Must preserve:** Goodness of God into Trust In God with a 4-slot VOX group stops with `5 VOX tracks, 1 for the first song's ring and 4 for the second song` (#64 AC1); the boundary test where BGVS ends before the Ending and the pair builds with exactly 4 (#64's recorded decision); a clip that ends exactly on the Ending does not ring.
- **Escalation:** depends on finding 6's `findIntro`; land it after finding 6, or file both as one follow-up ticket.
- **Proof:** a stop-rules test with Goodness of God's BGVS clip moved to start on 316 and a 4-slot VOX group: it reports the VOX problem now, and builds after.

### 6. An overlap or a pad into a song with no section after its Count Off throws, instead of joining the one-pass problem list — LOW
- **Location:** `src/set-builder/write-set.ts:196-201` (`introOf`), reached from `overlapAfter` (`:176-186`) and `tailClip` (`:152`)
- **Attribution:** introduced. `e5a60e1` (setlist-controller#65) added the throw for overlaps, `16bdf79` (setlist-controller#69) extended it to pads. Both tickets recorded it as a proposal ("Report an overlap into a song with no section after its Count Off as a build problem, not a thrown error"; the same for a pad).
- **Real-world trigger:** none known: every library song has its Count Off on beat 0 and a section after it (#65's recorded fact). The build writes nothing either way (`writeSet` runs before the first write), but the operator sees one thrown error instead of every problem at once.

**Evidence**
```ts
function introOf(song: Song): number {
  const countOff = song.locators.find((locator) => valueOf(locator, 'Name') === 'Count Off');
  const time = (locator: Element) => Number(valueOf(locator, 'Time'));
  const intro = countOff && song.locators.find((locator) => time(locator) > time(countOff));
  if (!intro) throw new Error(`${song.folder} has no section after a locator named Count Off, ...`);
```

**Failure mode** — `test/set-builder-overlap.test.ts:457` and `test/set-builder-pad.test.ts:427` pin the throw. With another problem in the same build (an unknown stem in a third song), the operator sees only the throw, against the spec's "every new problem joins the existing one-pass check and is reported with the others".

**Recommended fix** — export `findIntro(song): number | undefined` from `timeline.ts` beside `findEnding`, holding `introOf`'s lookup; `introOf` in `write-set.ts` calls it and keeps its throw as the guard. In `checks.ts`, `overlapProblems` adds, for an overlap whose next song has no Intro, `<next song folder>: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`, and a sibling check adds the same for a pad between two songs; both join `buildSet`'s list in service order.

**Remediation brief**
- **Design intent:** the builder never guesses where a fade starts; a missing Intro is an input problem like a missing Ending, so it is found in the one pass with the others. `findEnding` / `endingOf` (`timeline.ts:116-127`) is the precedent pair: a pure finder the checks use, and a throwing guard placement uses.
- **Full surface:** `src/set-builder/write-set.ts:196-201`; `src/set-builder/timeline.ts:116` (new `findIntro` beside `findEnding`); `src/set-builder/checks.ts:46-64` (`overlapProblems`) and a pad sibling; `src/set-builder/build-set.ts:107-116` and the order comment at `:73-78`; the two pinning tests, `test/set-builder-overlap.test.ts:457` ("an overlap into a song with no Count Off › throws, and writes nothing, naming the song") and `test/set-builder-pad.test.ts:427` ("a pad into a song with no Count Off"), rewritten to expect the problem and nothing written. Rewriting those two tests is intended.
- **Must preserve:** the Intro is the first locator after `Count Off` whatever its name (This Is Amazing Grace has two locators named Intro, #65's recorded decision); a pad after the last song needs no Intro (no tail clip); every existing problem's order.
- **Proof:** the two rewritten tests are red against the current code and green after; then `pnpm exec vitest run test/set-builder-overlap.test.ts test/set-builder-pad.test.ts test/set-builder-stop-rules.test.ts`.

### 7. Pad files are matched by exact case, so `A.WAV` or `a.wav` reads as "It has no pad files" — LOW
- **Location:** `src/set-builder/pads.ts:87` (the match) and `:145` (`keysIn`)
- **Attribution:** introduced. `entry.name === candidate` came in `be61e29` (setlist-controller#68); the exact match itself dates from `df291e7` (#66).
- **Real-world trigger:** a pad file whose name or extension differs in case from `<key>.wav`, as some pad packs ship (`.WAV`). The spec has Nick name each file by its key (#60), so it needs a file named or downloaded that way. LOW, capped: upgrade to MEDIUM if any file in `~/Music/MultiTracks/_pads` is not named exactly `<key>.wav` once #60 lands.

**Evidence**
```ts
    const name = names.find((candidate) => entries.some((entry) => entry.name === candidate && !entry.isDirectory()));
  ...
    .filter((entry) => entry.name.endsWith('.wav') && !entry.isDirectory())
```

**Failure mode** — finder B, executed against scratch copies of the fixture library: a pads folder holding `A.WAV` stops with `... has no A.wav. It has no pad files.`, a false sentence; one holding `a.wav` stops with `... has no A.wav. The keys it has are a.` Nothing is built in either case.

**Recommended fix** — compare names case-insensitively and keep the file's real name: `entries.find((entry) => entry.name.toLowerCase() === candidate.toLowerCase() && !entry.isDirectory())?.name`, then read, copy and refer to that real name; in `keysIn`, filter with `/\.wav$/i` and strip the last four characters.

**Remediation brief**
- **Design intent:** a pad file is found by its key, either enharmonic spelling, the key's own spelling first (#68's recorded decision). APFS is case-insensitive, so two files differing only in case cannot sit side by side; matching by case adds nothing but a false miss.
- **Full surface:** `src/set-builder/pads.ts:86-99` (`readPads`, which must pass the real entry name to `readPad`), `:143-149` (`keysIn`), `:152-159` (`readPad`, whose `key` is the name less its extension, any case); `test/set-builder-pad.test.ts`, a test beside the enharmonic tests (`:685` onwards) for `A.WAV` and `a.wav`.
- **Must preserve:** `Db` plays `Db.wav` over `C#.wav` when both exist; a file two pads play is read and copied once; the copy keeps the file's own name under `Songs/_pads/`; the clip's `Name` is the key (`A`).
- **Proof:** the new test is red now (the build stops on "has no A.wav") and green after; then `pnpm exec vitest run test/set-builder-pad.test.ts`.

### 8. Four tests stay green under a mutation of the rule they name — LOW
- **Location:** `test/set-builder-overlap.test.ts:417-436`; `test/set-builder-pad.test.ts:965-979`; the untested line `src/set-builder/write-set.ts:218`; weaker guards at `test/set-builder-overlap.test.ts:268-273`, `test/set-builder-pad.test.ts:849`, `:371`, `:402`, `:612`
- **Attribution:** introduced. The no-collision cases came in `e112686` (setlist-controller#61); the last-song test in `be61e29` (setlist-controller#68); `write-set.ts:218` in `e112686`. None came from a review-finding commit.
- **Real-world trigger:** none in the product; each is a claim of coverage the test does not have. The suite as a whole still catches mutations A and C through other tests, so the gap is narrow; the `write-set.ts:218` rule has no guard at all.

**Evidence and failure mode**
- **Mutation A** (`repro/review-1-mutation-overlap-as-gap.diff`, every overlap built as a gap): the 5 cases of "every overlap build › puts no two clips that sound at once on one track" stay green, since a set with no overlap has no collision either. The test never checks that an overlap was built.
- **Mutation C** (`repro/review-1-mutation-last-song-meter.diff`, the last song with no pad steps its meter back at its end): "keeps every tempo and meter event of a last song with no pad" stays green. It adds only tempo events and asserts only `envelopeEvents(root, 'Tempo').slice(-2)`.
- **Deleting `write-set.ts:218`** (`if (start >= ending) return undefined;`, a click or guide clip that starts at or after the Ending is dropped): all 182 tests in the four set-builder test files stay green (finder A). No fixture has such a clip.
- **Unmutated, same shape:** `test/set-builder-overlap.test.ts:268-273` loops over `single` with no check that it holds the click and the guide; `test/set-builder-pad.test.ts:849` checks only that song 3's locators sit at or before 1207, so a misnamed late locator passes; the PAD no-collision checks at `test/set-builder-pad.test.ts:371`, `:402`, `:612` pass with no pad clips at all.

**Recommended fix**
- `test/set-builder-overlap.test.ts:417-436`: before the collision loop, for each position p the case overlaps, assert that `<p> - End` and `<p + 1> - Count Off (<title>)` sit at one time in `locatorList(root)`, which an overlap gives and a gap never does.
- `test/set-builder-pad.test.ts:965-979`: also add a late 2/4 bar, `addMainTrackEvents(workspace, GOODNESS, 'EnumEvent', [[316, 199]])` as `:891` does, and assert `envelopeEvents(root, 'TimeSignature').filter(([time]) => time >= 800)` equals `[[800, 199]]` (derived from `:891-899` and the test's own offset comment; not executed).
- `write-set.ts:218`: a test in `test/set-builder-overlap.test.ts` that gives Goodness of God's Click Track a second clip starting after its Ending, 298, with `editClips` (`:291`), overlaps it into This Is Amazing Grace, and expects only the first clip on MT CLICK for song 1, ending on the Ending.
- `:268-273`: first assert `single.map(({ stem, end }) => [stem, end])` equals `[['Click Track', 348], ['Guide', 348]]`; `:849`: assert the last of song 3's locators is `{ time: 1207, name: '3 - End' }`; `:371`, `:402`, `:612`: assert the PAD clip count before the collision check.

**Remediation brief**
- **Design intent:** each test must go red when the rule its name states is broken; strengthening keeps every existing assertion and adds the missing guard.
- **Full surface:** the test lines above; no source change.
- **Must preserve:** every existing assertion in those tests; none of them is a review finding's proof (checked with `git log -S`), so nothing is deleted.
- **Proof:** `git apply docs/reviews/setlist-controller-59/repro/review-1-mutation-overlap-as-gap.diff && pnpm exec vitest run test/set-builder-overlap.test.ts -t "puts no two clips"; git apply -R docs/reviews/setlist-controller-59/repro/review-1-mutation-overlap-as-gap.diff` is green now and red after the strengthening; the same with `review-1-mutation-last-song-meter.diff` and `test/set-builder-pad.test.ts -t "last song with no pad"`; deleting `write-set.ts:218` turns the new click-clip test red. Restore the source after each mutation, then `pnpm test`.

### 9. Fallback paths the branch adds have no test — LOW
- **Location:** `src/set-builder/pads.ts:152-159` (a pad file that cannot be read as a WAV) and every throw in `src/set-builder/wav.ts`; `src/set-builder/pads.ts:114` (a song folder name with no key before its BPM); `src/server/playback-controller.ts:353-354` (`defaultEndToggles`: the `EPSILON` tolerance and a song with no End); `src/server/fade-out.ts:150` (a volume the fade did not ask for, or asked for twice); `src/contract/run.ts:346-350` (the "the tracks are ..., not the test set's ..." warning)
- **Attribution:** introduced: `df291e7` (#66) for the pad problems, `8747291` (#62) for the default toggles, `a314c36` (#63) for the volume guard, `03a56c1` (#67) for the contract warning.
- **Real-world trigger:** none needed: the gap is the missing test. Each branch is live code a later change could break unnoticed; `grep -rn "as a WAV\|no key before\|not a RIFF" test/` finds nothing, every default-toggle test uses exactly equal times (a change to `===` passes), and `test/contract.test.ts:109` seeds only `TEST_SET_TRACKS`, so the warning never runs.

**Recommended fix** — one test per path, each asserting the exact outcome: a pad file that is not a RIFF WAVE stops the build with `<path>: the pad file could not be read as a WAV: ...` and writes nothing (beside "a pad file cut short", `test/set-builder-pad.test.ts:666`); a copy of Goodness of God renamed with no key token (`copySongAs`, as #68's minor-key test does) stops with the folder's no-key problem; a set whose End is 5e-5 beats from the next song's first locator starts on "continue", and a song with no End before a next song starts on "stop" (`test/end-toggle-default.test.ts`); an unrequested and a repeated `track-volume` event change nothing (`test/fade-out.test.ts`, driving `startFadeOut` directly as `repro/review-1-lost-fade-reply.test.ts` does); a contract run against a fake Live seeded with another track list records the exact warning (`test/contract.test.ts`).

**Remediation brief**
- **Design intent:** every fallback path carries a test that goes red when the path is removed or changed.
- **Full surface:** the five test files named above; no source change.
- **Must preserve:** every existing test; the problem texts as they are.
- **Proof:** each new test goes red when its path is deleted from the source (restore after), then `pnpm test`.

## Needs Further Investigation

### A. Loop on the Pad section may dip the pad at every wrap — confirm in the acceptance run
The Pad clip spans the section exactly, fades in over 2 bars and plays the file from its start, so when Live's loop wraps the section the pad restarts from silence, and the file's own end and start fades sit at the join. Story 41 asks that Loop "keeps the pad going". Confirm in #71: hold Loop on a Pad section past one wrap and listen at the join. If the dip is audible, rate MEDIUM against story 41. The run already holds the proposal "Keep the pad steady across a Loop on the Pad section" (`.epic-loop/tickets/69/proposals.md`).

### B. Effect tails may come back at full level when the fade restores the volumes — confirm in Live
The last step to 0, `stop_playing` and the restore leave in one 100 ms tick (`src/server/fade-out.ts:82-86`, and the Stop wrapper in `server.ts`). Stopping Live stops the clips but not reverb or delay tails on a group's or track's own inserts, so raising the faders at once may let the tail through after the music faded. This follows the spec's order. Confirm by fading a song whose PAD or VOX chain has a long reverb and listening after the stop. The run holds the proposal "Hold the volumes down after a Fade out's stop until effect tails die away" (`.epic-loop/tickets/63/proposals.md`).

### C. Each fade step may land in Live's undo history and override volume automation — confirm in Live
A fade sends 61 volume sets per top-level track. A parameter set from a Remote Script normally adds an undo step and marks the set modified, and a manual set on a parameter with arrangement automation overrides it until re-enabled (AbletonOSC exposes `re_enable_automation`). Built sets write no track volume automation, so only a hand-made or template automation is at stake. Confirm after one fade: Live's Edit menu undo history, the set's modified mark, and the automation LED on a track with volume automation.

### D. A tail clip longer than its pad file plays past the file's end — confirm whether Live loads it
`tailClip` (`src/set-builder/write-set.ts:160`) starts a tail that is longer than the whole file on the file's start, so its `LoopEnd` and `OutMarker` pass the file's length; `test/set-builder-pad.test.ts:456` pins this as #69's recorded decision. No Live probe has opened such a clip. It needs a pad file shorter than about 16 seconds, so it shares finding 3's trigger. Confirm by opening a built set with a 10-second pad in Live; if Live warns or refuses, the run proposal "Stop the build on a pad file too short to hold its tail clip" (`.epic-loop/tickets/69/proposals.md`) becomes the fix.

## Reviewed and Dismissed
- **The fade fades the MT CLICK track, against "the click keeps its level" (story 54)** — the band's click is Live's metronome through the Main track's Cue Out, and the MT Click track is muted unless the metronome fails (vault, UMC1820 output plan), so the comments at `fade-out.ts:7-8`, `FadeOutButton.tsx:4` and README.md hold. The fallback case is the run proposal "Keep the MT CLICK track at its level during a fade".
- **No fade state in the snapshot; the button stays enabled during a fade** — #63's recorded decision; the server ignores the second press.
- **The default toggle pairs each song with the next by song number, not by time** — #62's recorded decision; built sets number songs in play order.
- **The reconnect restore goes by track index, which assumes the same set is open** — a set reloaded from disk has its own levels; the run proposal "Check the track list before a fade's restore on reconnect" holds the rest.
- **The fake Live differs from AbletonOSC on out-of-range `track_data`, `*` volume reads and unclamped volumes** — none of these is reached by what the server sends (`0, -1`, integer indexes, values from 0 to 1).
- **Gap-only builds now report `transition: { type: 'gap' }`** — #61's acceptance criteria ask for `gap` in the summary; the written set is byte-identical (178 cases).
- **An overlap ring's fade-out ignores the copied clip's fade-in** — #65's recorded decision; every MultiTracks stem carries `FadeInLength` 0 with `IsDefaultFadeIn` true.
- **`checkTransitions` accepts keys such as `"01"` or `"1.0"`, which then build as gaps** — the type is `Partial<Record<number, Transition>>` and the command builds numeric keys, so no caller reaches it.
- **Song n-1's ring is not counted when song n+1 starts** — needs a song shorter than the ring before it; #64's recorded decision.
- **A song folder titled `_pads`, a pads folder reached through a symlinked library path** — no such folder or setup exists; the build's one-pass check would still stop a copy that collides.
- **A symlinked pad file is copied as a symlink** — the pads folder holds downloaded files (#60), not links; `copyAudio` treats song audio the same way.
- **A gap-only build changes what it writes** — disproved by execution, 178 of 178 cases identical.

## Minor / nits
- `--pad 1=G --pad 1=A` keeps the last key with no warning (`src/set-builder/main.ts:85-88`); the run proposal "Make a song position named twice by --pad a usage error" (`.epic-loop/tickets/68/proposals.md`) covers it.
- The overlap ring converts its beats at the next song's starting tempo (`write-set.ts:224`, `:235`), while the pad tail reads the next song's whole tempo map (`:158`). This follows the spec's words, and no library song has a tempo event before its Intro plus 2 bars.
- A pad after the last song can write a tempo event and a meter event equal to the ones just before them (`write-set.ts:299-303`); Live reads two equal events as one value.
- `readWavHeader` gives a wrong frame count for a compressed WAV (MP3 or ADPCM in a WAV), and loses the data chunk after an odd chunk written without its pad byte; pad packs ship PCM.
- `cutOrRing` computes audio ends from `LoopStart`, assuming `StartRelative` 0 (`write-set.ts:220`, `:236`); every fixture clip has it.
- The `USAGE` sentence "Every other song is followed by a 4-bar gap" (`main.ts:24`) is not true of the last song.
- The skill's step 1 names `_template` and `_pads` as the only non-song folders; a `--pads` folder directly in the library is excluded too (`build-set.ts:84`). It matters only when Nick names one.
- No comment drift found that a maintainer would act on; this round has no Comment hygiene finding.

## Test quality
Tests added or changed: 143 · red against `e4aa4e6`: 126 · green against `e4aa4e6`: 17 · tautology shapes found: 2 proved by mutation, plus 1 untested rule (finding 8) and 5 untested fallback paths (finding 9).

The 17 green: 10 pins of behaviour the branch must keep (the end-toggle test "keeps the leader's toggles when the set is the same"; the pad test "builds on a template with no PAD track"; 5 tests in `test/set-builder.test.ts` whose only change is the new fixture in their folder lists; 2 transport tests that now set "Stop at end" explicitly); 1 acceptance criterion the base already met through the hub's role check ("is ignored from a view-only connection", #63's AC3); 1 sound test green at base only because the base has no fade command ("is refused while Live is stopped", red at HEAD with its gate removed, mutation B); and the 5 no-collision cases plus the last-song tempo-and-meter test (finding 8). None of the 17 came from a review-finding commit. No snapshots, mocked units under test or call-only assertions in the new tests.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass at `95462f3`, and so does `pnpm test:e2e`.
- **Commit hygiene:** the tree is clean. Commit this doc and the five files under `repro/`. Nothing to drop.
- **Likely reviewer asks:** what the acceptance run (#71) proved by ear, since every Live behaviour here (fades in beats, a CRC-0 clip, the overlap sound) rests on the 2026-10-16 probes and the demo set; why the set builder's pad and overlap edge cases throw rather than report (finding 6); and how the fade behaves when the server goes away (finding 1).

## Verdict
**Ready with follow-ups, gated on findings 1 and 2.** Fix before the PR opens: finding 1 (a server shutdown during a fade leaves the set quiet; a five-line fix, verified) and finding 2 (a bad `--pad` number must be the usage error the spec names; verified). Findings 3 to 9 are LOW and can ship as follow-up tickets; 3, 4, 5 and 6 already exist as run proposals. Needs Further Investigation A to D belong to the acceptance run (#71) in Live. Zero CRITICAL or HIGH findings.

## Remediation — 2026-10-17
Every confirmed finding was worked, the LOW tail included, in six clusters: the fade (1, then 4), the command (2), the checks against placement (6, then 5, then 3), pad lookup (7), test strength (8), and fallback tests (9). Full checks after the last commit: `pnpm lint`, `pnpm typecheck`, `pnpm test` (28 files, 498 passed, 2 skipped), `pnpm build` and `pnpm test:e2e` (8 passed) all pass. A differential harness rebuilt in the session scratchpad (not kept in `repro/`) compared `buildSet` at `0d86b0f` against `bd1e74d` (all ten finding commits) over 520 inputs the fixes were not meant to affect: gap-only builds of every ordering of 1 to 4 songs on both templates, 84 overlap cases, 160 pad cases with 30-second pads, and 148 mixed overlap and pad chains. All 520 were identical (BuildResult, every written file, the gunzipped `.als`), and 10 of 10 controls differed as they should, including a 2-second pad that now stops and a lowercase `a.wav` that now builds. `b20e668`, after the harness, changes only what the checks do for a song with no starting tempo or meter.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `60f9c5b` setlist-controller#59 pre-PR review 1 finding 1: A server shutdown during a fade leaves every top-level track at the level the fade reached | red→green: `repro/review-1-close-mid-fade.test.ts` (`[0.375, 0.5, 0.25]`, then the saved volumes); the close test in `test/fade-out.test.ts` now closes the server mid-fade and expects the three restores once and no step after, red before. Two unit tests: close after Live went away restores, close while reading sends nothing, each red under its own mutation | 0 new; the `close` doc comment reworded per the brief | fixed (verify agent: probed close from every state); one widened window, reworked in `9b82b74` |
| 1 rework | `9b82b74` setlist-controller#59 pre-PR review 1 finding 1 rework: After close returns the fade to idle, a press during shutdown starts a new fade on a bridge about to close | red→green: unit test "starts no fade on a press after the server closes, whatever the fade was doing" | 0 new; one sentence added to the `close` doc comment | fixed (scoped re-verify) |
| 2 (MEDIUM) | `3fe4152` setlist-controller#59 pre-PR review 1 finding 2: A --pad number that names no song is not a usage error: it exits 1 with "song NaN" | red→green: `node src/set-builder/main.ts grace goodness --pad two ...` (NaN message and exit 1, then the usage message and exit 2); new command cases for `0`, `3`, `two`, `1.0`, `=G`, `9=H`, red before; `test/set-builder-command.test.ts` and `test/set-builder-pad.test.ts` pass | 1 (`padPosition`: a pad may follow the last song, so its bound is the song count); `padValue`'s comment reworded per the brief | fixed (verify agent: 16 values run through the command; key errors, both-flags order and the last-song pad unchanged) |
| 3 (LOW) | `a51b16d` setlist-controller#59 pre-PR review 1 finding 3: A pad file shorter than one bar still builds: a zero-length Pad section the controller warns about | red→green: `repro/review-1-short-pad.test.ts` (both cases); new pad cases for 1 s between songs, 1 s after the last song and 2.499 s (a hair under one bar of 6/8 at 72), red before | 0 new; the `buildSet` order comment gains the step, per the brief | fixed (verify agent: holder index matches `padKey` and `placeSongs`; 1.9 s and 0.5 s pads stop, 30 s pads byte-identical); one introduced throw shared with finding 5, reworked in `b20e668` |
| 4 (LOW) | `96c0e59` setlist-controller#59 pre-PR review 1 finding 4: A fade whose track-list or volume reply never comes ignores every later Fade out until something else ends it; `11ac91e` (finding 4 typecheck: the tests' shared track list typed as a `LiveEvent`) | red→green: `repro/review-1-lost-fade-reply.test.ts`; unit tests for a press on the deadline (ignored), past it (reads again, a late reply to the abandoned read changes nothing, the fade runs from the new read) and Live never answering (only the track list read goes out), each red under its own mutation (deadline 0, `>=`, `since` reset) | 0 new; the `fadeOut` doc comment names the deadline, per the brief | fixed (verify agent: stale re-reads, cancel, lose and regain during a re-read probed) |
| 4 rework | `204703b` setlist-controller#59 pre-PR review 1 finding 4 rework: The fadeOut comment reads as if a read is given up at its deadline, but only the next press gives it up | comment only, read against the code | 0 new; the `fadeOut` comment reworded | fixed (scoped re-verify: each sentence matches the code) |
| 5 (LOW) | `bd4770c` setlist-controller#59 pre-PR review 1 finding 5: The overlap slot check counts a stem as ringing even when the overlap drops all its ringing clips | red→green: stop-rules case with Goodness of God's BGVS moved to 316 now builds, Trust In God's four stems alone on VOX; a clip on 300 still stops and the no-Intro fallback still counts, each red under its own mutation | 2 doc comments on the helpers moved to `timeline.ts`; the `slotProblems` comment states the new rule | fixed (verify agent: a 137-build sweep of the BGVS start from 296 to 330 flips once, at 308.25, and never throws "has no free track"); one introduced throw shared with finding 3, reworked in `b20e668` |
| 3 and 5 rework | `b20e668` setlist-controller#59 pre-PR review 1 findings 3 and 5 rework: The slot check and the short-pad check throw on a song with no starting tempo or meter, hiding the one-pass problem list | red→green: a stop-rules case and a pad case, each for a missing starting tempo and a missing starting meter (new harness helper `moveStartingMainTrackEvent`), return the problem list instead of throwing | 1 (`hasStartingValues`); one clause in the `slotProblems` comment; 2 lines on the harness helper | fixed (scoped re-verify: `hasStartingValues` matches `mainEvents`' throw condition over a 7×7 matrix of tempo and meter shapes; no path still reads a song without them) |
| 6 (LOW) | `0386df2` setlist-controller#59 pre-PR review 1 finding 6: An overlap or a pad into a song with no section after its Count Off throws, instead of joining the one-pass problem list | red→green: the two tests that pinned the throw now expect the problem (the overlap one beside a name that matches no song, the pad one before a pad's own problem), plus a case naming a song once when an overlap and a pad both go into it, red without the dedupe | 1 (`introProblems`); `findIntro`'s doc comment moved from `introOf`; `introOf`'s comment in the `endingOf` guard form; the `buildSet` order comment gains the step | fixed (verify agent: index arithmetic, a pad after the last song needs no Intro, dedupe across an undefined entry) |
| 7 (LOW) | `9f94144` setlist-controller#59 pre-PR review 1 finding 7: Pad files are matched by exact case, so A.WAV or a.wav reads as "It has no pad files" | red→green: `A.WAV` and `a.wav` play for a pad in A and copy under their own names; a folder holding only `E.WAV` lists E; both twins present keep the key's own spelling, red under an entries-first lookup | 0 new; `readPads` and `keysIn` comments say "any letter case" | proved by execution |
| 8 (LOW) | `18a6d89` setlist-controller#59 pre-PR review 1 finding 8: Four tests stay green under a mutation of the rule they name | test-only. Green before, red after strengthening: `repro/review-1-mutation-overlap-as-gap.diff` (5 of 5 cases), `repro/review-1-mutation-last-song-meter.diff`, and deleting cutOrRing's drop of a single-track clip starting at or after the Ending (the new click-clip test) | 0 | proved by execution |
| 9 (LOW) | `bd1e74d` setlist-controller#59 pre-PR review 1 finding 9: Fallback paths the branch adds have no test | test-only. Each new test red when its path is deleted: all five throws in `readWavHeader`, the folder name with no key, the end-toggle tolerance both ways (`===` and a wider tolerance) and a song with no End, the fade's unrequested and repeated volume replies, the contract's tracks warning | 0 | proved by execution |

### Known regressions, deferred
- After `close()`, Live events can still send a second, identical restore: `close` sets `lastRestore`, so a connection-lost event inside `RESTORE_AT_RISK_MS` moves the fade to `lost`, and a connection-regained event restores again — introduced by `60f9c5b`, verdict "Events from Live after close can still send a second restore ... The extra restore sets the same volumes, so it is harmless unless the socket is already closed. Optional one-line fix, which affects nothing before close: add `if (closed) return;` as the first line of `fromLive`", not fixed because it lies outside the reworked diff of the scoped re-verify. Before the round, the same events after close could restore once from the `stepping` state close left behind.

### Rework briefs
- Finding 1: after `close()`, a Fade out press must do nothing from any state. Preserve close's single restore from `stepping` and `lost`, its silence from idle and the reading states, no step after close, and everything before close. Proof: a unit test pressing after close from idle and from mid-fade expects nothing sent, red before and green after; `test/fade-out.test.ts`.
- Finding 4: the `fadeOut` comment must say the deadline is checked on the next press and that a late reply with no new press still starts the fade. Preserve the code. Proof: read against `fadeOut` and the reply handlers.
- Findings 3 and 5: the slot check and the short-pad check must never throw on a song whose main track has no starting tempo or meter, and must treat it as before the round (every clip ending after the Ending rings; no short-pad problem). Preserve both checks' results for every song with starting values, `mainEvents`' behaviour and error text, and the check-placement agreement. Proof: a stop-rules case and a pad case for each missing parameter return the problem list, red (the throw) before and green after; the set-builder suites.

### Verifier notes, not acted on (none is a regression from this round)
- Finding 3: the short-pad problem prints `lasts 0 s` for a file under 0.0005 s; a sample rate of 0, which would print `NaN`, cannot reach the check, since `readWavHeader` throws on it (finding 9 tests that throw).
- Findings 3 and 5 rework: for a next song with starting values but no Intro, the slot check no longer evaluates `ringingBeat(...) < Infinity`. The two differ only on malformed tempo data (a non-numeric Value, or a 0 BPM point after the Ending), where the new result, counting the clip as ringing, is the one the comment states.
- Finding 4: `READ_TIMEOUT_MS` carries no comment, unlike its neighbours; the commit message holds its reason (ten AbletonOSC ticks).
- Outside these diffs: in a chain A overlap B overlap C, A's ring can outlast B's Ending, so A's ringing tracks may still be busy at C's start, and the pair check counts neither. This is the Reviewed-and-Dismissed "Song n-1's ring is not counted when song n+1 starts" (#64's recorded decision), not run.
- Not worked this round, since they are not confirmed findings: the Minor / nits list and Needs Further Investigation A to D.
