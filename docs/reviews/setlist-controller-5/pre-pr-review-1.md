# Pre-PR review: setlist-controller#5 Song and set durations, with time left while Live plays

**Branch:** `setlist-controller-5-song-set-durations` vs `origin/main` (merge-base `1dae6a4`, "Merge pull request #18 from nick-vogel/setlist-controller-6-stage-status-line")
**Reviewed at:** HEAD `f2942ed` (setlist-controller#5 review fixes: the time left counts from a waiting jump, rounds up, and the tempo fallback waits for Live) + 0 files with uncommitted changes, 0 untracked files, 29 files total, +1123 / −47
**Reviewed against:** issue `setlist-controller#5` and its settled-decisions comment, PR `#24`, `.claude/rules/public-repository.md`, and the global rules in `~/.claude/rules/`. The repository has no `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, or ADRs. Run with `--fresh`.
**Date:** 2026-11-25
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present (`eslint`, `playwright`, `tsc`, `tsserver`, `vite`, `vitest`); lockfile unchanged since `1dae6a4` |
| Lint, typecheck, build | `pnpm lint && pnpm typecheck && pnpm build` | pass (`vite build` 98 ms) |
| Private terms check on tree & range | `pnpm check:private` and `pnpm check:private --range origin/main..HEAD` | both pass (0 hits) |
| Touched unit & integration suites | `pnpm exec vitest run test/durations.test.ts test/set-builder-durations.test.ts test/song-timings.test.ts test/set-manifest.test.ts test/set-builder.test.ts test/set-builder-charts.test.ts test/pages.test.ts test/power.test.ts test/song-meters.test.ts test/stage-status.test.ts test/timeline.test.ts` | pass: 11 files, 460 passed (15.57 s) |
| Playwright E2E durations spec | `pnpm exec playwright test e2e/durations.spec.ts` | pass: 4 passed (2 tests × WebKit iPad + Chromium Pixel 7, 2.7 s) |
| Full `pnpm test` / full `pnpm test:e2e` | not run | ran all 11 touched Vitest files (460 tests) and `e2e/durations.spec.ts` (4 tests); PR #24 records full suite green on `f2942ed` |
| Differential scope-leak harness (`$BASE` `1dae6a4` vs HEAD `f2942ed`) | imported `git show 1dae6a4:src/set-builder/tempo.ts` (`secondsBetween`) and `git show 1dae6a4:src/shared/set-manifest.ts` (`parseSetManifest`) into a temp directory and compared against HEAD across 7 tempo maps (steady, zero-length, step, full/partial ramp, multi-step+ramp, triple same-time event) and 6 non-duration manifest inputs | pass: 0 mismatches (`Object.is` bit-identical for all 7 tempo cases; byte-identical JSON for all 6 manifest cases) |
| Tautology audit against `$BASE` (`1dae6a4`) | executed the 7 new `test/set-manifest.test.ts` cases against `git show 1dae6a4:src/shared/set-manifest.ts` (0 of 7 green); inspected all other new tests (`test/durations.test.ts`, `test/set-builder-durations.test.ts`, `test/song-timings.test.ts`, `test/set-builder-charts.test.ts`, `e2e/durations.spec.ts`) for imports/fields absent at `$BASE` and all 4+2 tautology shapes | pass: 0 new tests green at `$BASE`, 0 tautology shapes found (full-checkout base Vitest run not run because scratch `git worktree add` is disallowed in this runner) |
| Preserved repro harness (`docs/reviews/setlist-controller-5/repro/review-1-findings.mjs`) | `node --test docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (unit, full server + UDP fake-Live rig, and Chromium Pixel 7 Playwright checks) | 6 of 6 repros fail red with exact `AssertionError`s on HEAD `f2942ed` (Findings 1–6) |
| Recommended CSS fix check | injected `font-size: clamp(0.875rem, 3.6vw, 1.125rem)` via Playwright on Pixel 7 (412 px), iPhone 14 (390 px), and iPad gen 7 (810 px) for `"~10:12 left in song · at least ~1:10:24 left in set"` | pass: `cut: false, lines: 1` on all three (`14.83 px`, `14.04 px`, and unchanged `18 px` on iPad) |

**Overall:** The set-builder duration math (`set-durations.ts`, `tempo.ts`), manifest parsing (`src/shared/set-manifest.ts`), independent numerical verification in `test/set-builder-durations.test.ts`, and differential compatibility with `$BASE` are solid, with zero CRITICAL or HIGH defects. Four MEDIUM defects should be fixed before merging PR `#24`: an untimed last song (or 1-song untimed set) renders `"at least 0:00 left in set"` when nothing is known; `tempoReported` is not cleared on Live disconnect or `/live/startup` (and the first tempo report while playing does not publish), locking a reconnected song to the previous session's tempo; `createSongTimer` keeps cached tempo timings across set changes and omits `song.title` from `layoutOf`; and `.now-time-left` clips with an ellipsis on phones (Pixel 7 and iPhone 14) for realistic sets combining `"at least"` and `"~"`. Two LOW edge cases (`Pad`/`Pad Out` tempo caching and the pre-landing count-in duration spike) and one LOW comment-hygiene item are worth taking in the same pass.

## Approach decisions
- **Last-song set time left (`web/src/durations.ts`):** handle the last-song boundary in a `setLeft(set, timings, index, left)` helper rather than returning a synthetic `{ seconds: 0, atLeast: false }` from `afterSong`, so `left === null` on the last song yields `set: null` instead of `{ seconds: 0, atLeast: true }`, while `left === 0` (waiting jump to last song's End) still yields `{ seconds: 0, atLeast: false }`.
- **Live tempo freshness across reconnects (`src/server/playback-controller.ts`):** reset `tempoReported = false` on Live disconnect (`!event.connected`) and on `/live/startup`, and publish via `onChange(snapshot())` only on the first tempo report after `tempoReported` was `false` while `playing` (leaving subsequent mid-song tempo changes and stopped tempo reports silent).
- **Per-set cache invalidation and Pad exclusion in `createSongTimer` (`src/server/song-timings.ts`):** mirror `src/server/playback-controller.ts:237-240, 690-693`: clear `played` whenever `set` is `null` or its signature (every song's number, title, section boundaries, and end) changes, and ignore `Pad`/`Pad Out` sections via `isPad` from `../shared/count-in.ts`.
- **Mobile fit on `.now-time-left` (`web/src/styles.css`):** use `font-size: clamp(0.875rem, 3.6vw, 1.125rem)` so iPad and desktop stay at `1.125rem` (`18px`) while phone viewports (Pixel 7, iPhone 14) keep the full single-line string unclipped without wrapping.
- **Count-in lead time (`web/src/durations.ts`):** derive the count-in's lead section from the target song's `Count Off` locator (`COUNT_OFF` from `../../src/shared/count-in.ts`), using `restOfSection` once `now` is in that Count Off and its full section duration before Live reports entering it.

## Confirmed Issues

### 1. Untimed last song (and any 1-song untimed set) renders `"at least 0:00 left in set"` when nothing of the remaining set is known — MEDIUM
- **Location:** `web/src/durations.ts:52, 61, 117-120`
- **Attribution:** introduced (`baa94fa`, "setlist-controller#5 the pages show each song's duration, the set total, and the time left"; retained in `f2942ed`).
- **Real-world trigger:** Opening a 1-song Live set without manifest durations while stopped, sitting stopped in the last song of any untimed set, or tapping a waiting jump into an untimed last song (including a built set whose last song had locators moved by hand). Every connected page (leader, producer, viewer, setup) displays `"at least 0:00 left in set"` (or `"at least ~0:00 left in set"` while looping) even when `songTimings` is empty (`{}`), contradicting `web/src/durations.ts:17` ("each null when nothing of it is known").

**Evidence** — `web/src/durations.ts:51-62, 117-120, 140-143`
```ts
    const left = landed === null || lead === null ? null : lead + landed;
    return { song: left, set: combine(left, afterSong(set, timings, index)), approximate };
  }
  ...
    const left = rest === null || later === null ? null : rest + later;
    return { song: left, set: combine(left, afterSong(set, timings, index)), approximate };
  }
...
function afterSong(set: SetList, timings: Timings, index: number): Total | null {
  if (index === set.songs.length - 1) return { seconds: 0, atLeast: false };
  return combine(timings[set.songs[index]!.number]?.gap ?? null, sumFrom(set, timings, index + 1));
}
```

**Failure mode** — On the last song (`index === set.songs.length - 1`), `afterSong` returns `{ seconds: 0, atLeast: false }`. When the current song has no timing (`left === null`), `combine(null, { seconds: 0, atLeast: false })` sees `then !== null` and returns `{ seconds: 0, atLeast: true }`, which `NowPlaying.tsx:93` renders as `"at least 0:00 left in set"`. Verified by `docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (`finding 1`) and in Chromium against a live 1-song untimed rig (`.now-time-left` text was `"at least 0:00 left in set"`).

**Recommended fix**
```diff
-    return { song: left, set: combine(left, afterSong(set, timings, index)), approximate };
+    return { song: left, set: setLeft(set, timings, index, left), approximate };
   }
   if (now) {
     const index = set.songs.findIndex((song) => song.number === now.song);
     const song = set.songs[index];
     if (!song) return nothing;
     const rest = restOfSection(set, timings, now.song, now.section, position);
     const later = playedAfter(song, timings[song.number], now.section);
     const left = rest === null || later === null ? null : rest + later;
-    return { song: left, set: combine(left, afterSong(set, timings, index)), approximate };
+    return { song: left, set: setLeft(set, timings, index, left), approximate };
   }
```
And replace `afterSong` at lines 117–120:
```diff
-function afterSong(set: SetList, timings: Timings, index: number): Total | null {
-  if (index === set.songs.length - 1) return { seconds: 0, atLeast: false };
-  return combine(timings[set.songs[index]!.number]?.gap ?? null, sumFrom(set, timings, index + 1));
+function setLeft(set: SetList, timings: Timings, index: number, left: number | null): Total | null {
+  if (index === set.songs.length - 1) return left === null ? null : { seconds: left, atLeast: false };
+  return combine(left, combine(timings[set.songs[index]!.number]?.gap ?? null, sumFrom(set, timings, index + 1)));
 }
```

**Remediation brief**
- **Design intent:** `timeLeft` returns `set: null` whenever nothing of what remains in the set is known, so `NowPlaying` leaves the time-left line blank (`\u00a0`) rather than showing `"at least 0:00 left in set"`. On the last song, nothing follows the song, so the remaining set time is exact (`atLeast: false`) when `left !== null` (including `left === 0` for a waiting jump to the last song's `End`) and `null` when `left === null`.
- **Full surface:** `web/src/durations.ts:52, 61, 117-120` and `test/durations.test.ts` (add regression tests for a 1-song untimed set, an untimed last song of a multi-song set, and a waiting jump to an untimed last song, plus verify a waiting jump to the last song's `End` still returns `{ song: 0, set: { seconds: 0, atLeast: false } }`). Grepped all callers of `afterSong`: lines 52 and 61 are the only two.
- **Must preserve:** All 34 existing tests in `test/durations.test.ts` (in particular: waiting jump to `End` returning `song: 0`, partial timings on non-last songs returning `atLeast: true`, and `NowPlaying` rendering blank `\u00a0` when `timeLeft` is all-null).
- **Do not touch:** `combine` on non-last songs and between songs (`web/src/durations.ts:72, 140-143`).
- **Proof:** `node --test --test-name-pattern="finding 1" docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (currently fails with `{ seconds: 0, atLeast: true }`; must pass after the fix), plus `pnpm exec vitest run test/durations.test.ts`.

---

### 2. `tempoReported` is not reset on Live disconnect or `/live/startup`, locking a reconnected song to the previous session's tempo; initial `tempo` reports while playing also skip publishing — MEDIUM
- **Location:** `src/server/playback-controller.ts:663-678, 743-750, 757-758`
- **Attribution:** introduced (`f2942ed`, "setlist-controller#5 review fixes: the time left counts from a waiting jump, rounds up, and the tempo fallback waits for Live").
- **Real-world trigger:** Live plays Song 1 of an untimed set at 140 BPM, then disconnects (network/control-surface stall or Live restart) or reloads AbletonOSC (`/live/startup`) and reconnects while playing an unvisited Song 2 at 70 BPM. Because `live-bridge.ts:123-125` registers `LISTENED_PROPERTIES` (`src/shared/abletonosc.ts:12-21`) in the order `current_song_time`, `is_playing`, `tempo`, Live reports `position` and `playing: true` before `tempo`. Because `tempoReported` stayed `true` from before the disconnect, `reportedTempo()` returns the stale `140` BPM on `is_playing`, and `createSongTimer` permanently caches Song 2 at half its real duration before `tempo: 70` arrives milliseconds later. In addition, when `tempo` is the first tempo report to arrive while Live is already playing (after initial connect, disconnect, or `startup`), `case 'tempo'` returns without calling `onChange(snapshot())`, so pages do not receive the timing until some unrelated Live event arrives.

**Evidence** — `src/server/playback-controller.ts:663-678, 743-758`
```ts
        case 'connection':
          live = event.connected ? 'connected' : 'not-connected';
          if (!event.connected) {
            playing = false;
            position = null;
            anchor = null;
            liveLoop.on = false;
            ...
          }
          break;
...
        case 'tempo':
          // Song time is in beats, so the tempo moves the playhead but never changes the bar count,
          // and the snapshot stays the same. It is kept only to tell a late tap.
          if (event.bpm > 0) {
            tempo = event.bpm;
            tempoReported = true;
          }
          return;
...
        case 'startup':
          return unchanged();
```

**Failure mode** — End-to-end over the real server and UDP bridge (`docs/reviews/setlist-controller-5/repro/review-1-findings.mjs`, `finding 2`): after playing Song 1 at 140 BPM, losing Live, and reconnecting to Live playing Song 2 at 70 BPM, `snapshot.songTimings[2]` is permanently cached as `{ sections: [3.428571..., 6.857142...], gap: null, source: 'tempo' }` (140 BPM) instead of `[6.857142..., 13.714285...]` (70 BPM). In the controller unit check (Part B), sending `tempo: 96` after `position` and `playing: true` produces 0 `onChange` calls.

**Recommended fix**
```diff
         case 'connection':
           live = event.connected ? 'connected' : 'not-connected';
           if (!event.connected) {
             playing = false;
             position = null;
             anchor = null;
+            tempoReported = false;
             liveLoop.on = false;
```
```diff
-        case 'tempo':
-          // Song time is in beats, so the tempo moves the playhead but never changes the bar count,
-          // and the snapshot stays the same. It is kept only to tell a late tap.
-          if (event.bpm > 0) {
-            tempo = event.bpm;
-            tempoReported = true;
-          }
-          return;
+        case 'tempo': {
+          const first = !tempoReported;
+          if (event.bpm > 0) {
+            tempo = event.bpm;
+            tempoReported = true;
+          }
+          if (first && tempoReported && playing) break;
+          return;
+        }
```
```diff
         case 'startup':
+          tempoReported = false;
           return unchanged();
```

**Remediation brief**
- **Design intent:** `reportedTempo()` exists solely so `song-timings.ts` never times a song from the controller's unverified tempo (either the 120 BPM initial stand-in or a stale tempo from a prior Live session). On disconnect (`!event.connected`) or AbletonOSC reload (`startup`), every listener is dropped and re-registered in `LISTENED_PROPERTIES` order (`current_song_time`, `is_playing`, `tempo`), so `tempoReported` must reset to `false` until Live reports the new session's tempo. When the first valid tempo report arrives while Live is already playing, `case 'tempo'` breaks out to `onChange(snapshot())` so `server.ts` publishes `songTimings` immediately without waiting on a later non-tempo event; subsequent tempo updates (including mid-song tempo automation) and stopped tempo updates still return without publishing. Also remove the stale comment at `playback-controller.ts:744-745` (`comments-must-be-load-bearing`) that falsely claims tempo is kept only to tell a late tap and never changes the snapshot.
- **Full surface:** `src/server/playback-controller.ts:667-677, 743-758` and `test/song-timings.test.ts` (add regression tests for reconnect while playing an unvisited song at a different tempo and for an initial `tempo` report arriving after `position` + `playing`). Checked all callers of `reportedTempo` across `src/` and `web/`: `src/server/server.ts:321` is the sole caller.
- **Must preserve:** `controller.tempo()` continues returning `tempo` (120 BPM before first report) for `dueAt`, `predict`, `lateWindow`, `comesBack`, and `waitForStart`; mid-song tempo automation updates (`tempoReported === true`) and stopped tempo updates (`!playing`) do not trigger extra snapshot publishes; `startup` still calls `unchanged()` to flush any settled meter. Run `test/song-timings.test.ts`, `test/playback-controller.test.ts`, and `test/pre-service-check.test.ts`.
- **Do not touch:** `LISTENED_PROPERTIES` order in `src/shared/abletonosc.ts:12-21` (loop brace ordering is load-bearing).
- **Proof:** `node --test --test-name-pattern="finding 2" docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (currently fails with 140 BPM timings on a 70 BPM song and 0 `onChange` calls on initial tempo; must pass after the fix), plus `pnpm exec vitest run test/song-timings.test.ts`.

---

### 3. `createSongTimer` leaks cached tempo timings across different Live sets and omits `song.title` from `layoutOf` — MEDIUM
- **Location:** `src/server/song-timings.ts:21-47, 79-81`
- **Attribution:** introduced (`4d3ad1b`, "setlist-controller#5 the snapshot times each song: by the build, or by Live's tempo once played"; retained in `f2942ed`).
- **Real-world trigger:** Keeping the server running across rehearsal and service while switching from untimed Set A (`"Song Alpha"` at 96 BPM) to untimed Set B (`"Song Beta"` at 140 BPM) whose Song 1 shares the same section beat boundaries (common for standard count-off/verse structures or simple rehearsal sets), or switching between untitled sets of different song counts. Unlike `src/server/playback-controller.ts:690-693` (which resets `meters = new Map()` whenever a read finds the set changed), `played` is never cleared when the set changes and `layoutOf(song)` ignores `song.title`. Song 1 of Set B immediately shows Song Alpha's 96 BPM duration before Live even plays it, and keeps the wrong 96 BPM duration even while Live plays Song Beta at 140 BPM.

**Evidence** — `src/server/song-timings.ts:23-44, 79-81`
```ts
  const played = new Map<number, { layout: string; timing: SongTiming }>();

  return (set, manifestSongs, { now, playing, tempo }) => {
    if (!set) return {};
    ...
      const layout = layoutOf(song);
      const kept = played.get(song.number);
      if (kept && kept.layout === layout) {
        timings[song.number] = kept.timing;
        return;
      }
...
function layoutOf(song: Song): string {
  return JSON.stringify([song.sections.map((section) => [section.time, section.end]), song.end]);
}
```

**Failure mode** — End-to-end on `startRig` (`docs/reviews/setlist-controller-5/repro/review-1-findings.mjs`, `finding 3`): after playing `"Song Alpha"` at 96 BPM (`sections: [5, 10]`), stopping Live, replacing Live's cue points with `"Song Beta"` (same beat offsets, 140 BPM), and refreshing the set, `snapshot.songTimings[1]` immediately reports `{ sections: [5, 10], gap: null, source: 'tempo' }` while stopped and keeps `[5, 10]` while playing at 140 BPM instead of clearing to `{}` and timing `"Song Beta"` at `[3.429, 6.857]`.

**Recommended fix**
```diff
 export function createSongTimer(): TimeSongs {
-  // The timings by Live's tempo, by song number, each with the song's locators it was taken for.
-  const played = new Map<number, { layout: string; timing: SongTiming }>();
+  const played = new Map<number, SongTiming>();
+  let lastSet: string | null = null;
 
   return (set, manifestSongs, { now, playing, tempo }) => {
-    if (!set) return {};
+    if (!set) {
+      played.clear();
+      lastSet = null;
+      return {};
+    }
+    const key = setKey(set);
+    if (key !== lastSet) {
+      played.clear();
+      lastSet = key;
+    }
     const timings: Snapshot['songTimings'] = {};
     set.songs.forEach((song, index) => {
       const built = builtTiming(set.songs, index, manifestFor(manifestSongs, song, index)?.durations);
       if (built) {
         timings[song.number] = built;
         return;
       }
-      const layout = layoutOf(song);
       const kept = played.get(song.number);
-      if (kept && kept.layout === layout) {
-        timings[song.number] = kept.timing;
+      if (kept) {
+        timings[song.number] = kept;
         return;
       }
       if (now?.song !== song.number || !playing || tempo === null) return;
       const timing = tempoTiming(song, tempo);
-      played.set(song.number, { layout, timing });
+      played.set(song.number, timing);
       timings[song.number] = timing;
     });
     return timings;
   };
 }
```
And replace `layoutOf` at lines 79–81:
```diff
-function layoutOf(song: Song): string {
-  return JSON.stringify([song.sections.map((section) => [section.time, section.end]), song.end]);
+function setKey(set: SetList): string {
+  return JSON.stringify(set.songs.map((song) => [song.number, song.title, song.sections.map((section) => [section.time, section.end]), song.end]));
 }
```

**Remediation brief**
- **Design intent:** AbletonOSC exposes no set identifier, so `playback-controller.ts:687-693` treats any change to the parsed set as a new set and clears its per-song `meters` map. `createSongTimer` should follow that same precedent: compute a structural signature `setKey(set)` across every song's number, title, section boundaries, and end, and clear `played` whenever `set` becomes `null` or `setKey(set)` changes. Identical sets (including fresh `parseSet(...)` copies with unchanged titles and locators) preserve `played`, while switching to a new set or moving locators clears stale tempo timings cleanly.
- **Full surface:** `src/server/song-timings.ts:21-47, 79-81` and `test/song-timings.test.ts` (add a regression test switching from `"Song Alpha"` at 96 BPM to `"Song Beta"` with identical beat boundaries at 140 BPM). Checked all callers of `createSongTimer`: `src/server/server.ts:313` and `test/song-timings.test.ts`.
- **Must preserve:** All 8 existing tests in `test/song-timings.test.ts` (keeping the first tempo while playing in the same set, re-timing when a song's locators move, manifest timings overriding tempo timings, and title fallback).
- **Do not touch:** `builtTiming` and `manifestFor` (`src/server/song-timings.ts:53-71`).
- **Proof:** `node --test --test-name-pattern="finding 3" docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (currently fails with `{ 1: { sections: [5, 10], ... } }` on `"Song Beta"` while stopped; must pass after the fix), plus `pnpm exec vitest run test/song-timings.test.ts`.

---

### 4. `.now-time-left` clips the remaining set time with an ellipsis on phone viewports (Pixel 7 at 412 px and iPhone 14 at 390 px) for realistic worship-set strings combining `"at least"` and `"~"` — MEDIUM
- **Location:** `web/src/styles.css:227-235` (and `e2e/durations.spec.ts:75-92` omits `expectWhole` on the `"at least"` line)
- **Attribution:** introduced (`baa94fa`, "setlist-controller#5 the pages show each song's duration, the set total, and the time left"; `e2e/durations.spec.ts` added in `3c9e785`).
- **Real-world trigger:** Viewing the leader, producer, viewer, or setup page on a Pixel 7 (`412px`, the repository's `chromium-android` Playwright device) or iPhone 14 (`390px`) during a normal 30–65 minute untimed set while a section is looped (`"~3:12 left in song · at least ~38:44 left in set"` or `"~3:12 left in song · at least ~1:03:24 left in set"`), or even without a loop on iPhone 14 (`"3:12 left in song · at least 38:44 left in set"`). Because `.now-time-left` uses a fixed `font-size: 1.125rem` (`18px`) with `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, the inner `348px` width on Pixel 7 (`326px` on iPhone 14) truncates `" left in set"` to `"..."`. `e2e/durations.spec.ts` only ran `expectWhole` on short 1-digit-minute manifest strings without `"at least"`.

**Evidence** — `web/src/styles.css:227-235`
```css
.now-time-left {
  margin-top: 0.5rem;
  font-size: 1.125rem;
  font-variant-numeric: tabular-nums;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**Failure mode** — Measured in Chromium via Playwright (`docs/reviews/setlist-controller-5/repro/review-1-findings.mjs`, `finding 4`): on `devices['Pixel 7']` (`clientWidth: 348px`), `"~3:12 left in song · at least ~38:44 left in set"` measures `scrollWidth: 356px` (`cut: true`), and `"~3:12 left in song · at least ~1:03:24 left in set"` measures `372px` (`cut: true`). On `devices['iPhone 14']` (`clientWidth: 326px`), even `"3:12 left in song · at least 38:44 left in set"` (no loop) measures `334px` (`cut: true`).

**Recommended fix**
```diff
 .now-time-left {
   margin-top: 0.5rem;
-  font-size: 1.125rem;
+  font-size: clamp(0.875rem, 3.6vw, 1.125rem);
   font-variant-numeric: tabular-nums;
   color: #ccc;
   white-space: nowrap;
```

**Remediation brief**
- **Design intent:** `.now-time-left` stays on one line so tap targets below Now Playing never shift vertically as numbers change, while showing both the song and set remaining times in full on phones as well as tablets. Using `font-size: clamp(0.875rem, 3.6vw, 1.125rem)` keeps iPad (`810px`) and desktop at the exact `1.125rem` (`18px`) size while scaling down cleanly on Pixel 7 (`14.83px`) and iPhone 14 (`14.04px`), fitting worst-case strings like `"~10:12 left in song · at least ~1:10:24 left in set"` without clipping (`cut: false, lines: 1` verified in Playwright across Pixel 7, iPhone 14, and iPad gen 7).
- **Full surface:** `web/src/styles.css:229` and `e2e/durations.spec.ts:84` (also call `expectWhole(timeLeft(page))` on a realistic `"at least"` + loop string so Playwright catches phone clipping).
- **Must preserve:** Single-line height stability (`white-space: nowrap`, `lines: 1`), `tabular-nums`, `#ccc` contrast, `18px` rendered font size on iPad, and all 4 tests in `e2e/durations.spec.ts`.
- **Do not touch:** `.now-time-left`'s `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` safety net or other `.now-playing` line styles.
- **Proof:** `pnpm build && node --test --test-name-pattern="finding 4" docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (currently fails on Pixel 7 with `scrollWidth: 356 > clientWidth: 348`; must pass after rebuilding), plus `pnpm exec playwright test e2e/durations.spec.ts`.

---

### 5. `createSongTimer` times a song from its `Pad` or `Pad Out` section, locking the whole song to the next song's tempo — LOW
- **Location:** `src/server/song-timings.ts:40`
- **Attribution:** introduced (`4d3ad1b`, "setlist-controller#5 the snapshot times each song: by the build, or by Live's tempo once played"; violates `nearest-in-repo-precedent` against `src/server/playback-controller.ts:235-240`).
- **Real-world trigger:** In a set with a `Pad` or `Pad Out` section that lacks manifest durations (for example, a built set whose Song 1 had a locator moved by hand after `build-set`, or a hand-built Live set with a `Pad` section), starting playback directly inside `Pad` before playing an earlier section of that song (such as testing a pad transition during rehearsal). Per `write-set.ts:249` and `song-timings.ts:8-9`, the `Pad` section plays at the *next* song's tempo, so `createSongTimer` caches the entire song at the next song's BPM and keeps that wrong timing even when the song is later played from the top. Rated **LOW** by attainability (requires an untimed song with a `Pad`/`Pad Out` section played there before any earlier section; upgrade to MEDIUM if rehearsal workflows routinely hand-edit locators on padded sets and start playback on `Pad`).

**Evidence** — `src/server/song-timings.ts:40-43`
```ts
      if (now?.song !== song.number || !playing || tempo === null) return;
      const timing = tempoTiming(song, tempo);
      played.set(song.number, { layout, timing });
      timings[song.number] = timing;
```

**Failure mode** — Starting playback in `1 - Pad` or `1 - Pad Out` at 63 BPM (the next song's tempo) caches all sections of Song 1 at 63 BPM (`{ 1: { sections: [7.619, 15.238, 57.143, 15.238], gap: null, source: 'tempo' } }`) instead of returning `{}` until Live plays in a non-pad section of Song 1. Verified by `docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (`finding 5`).

**Recommended fix**
```diff
+import { isPad } from '../shared/count-in.ts';
 import { namesMatch } from '../shared/match-name.ts';
```
```diff
-      if (now?.song !== song.number || !playing || tempo === null) return;
+      if (now?.song !== song.number || !playing || tempo === null || isPad(song.sections[now.section]?.name ?? '')) return;
```

**Remediation brief**
- **Design intent:** `Pad` and `Pad Out` sections hold the next song's tempo and meter (`write-set.ts:249`), so `playback-controller.ts:237-240` (`meterSong`) excludes `isPad(section?.name ?? '')` when recording Live's meter for a song. `createSongTimer` should apply the same rule via `isPad` so starting playback on a `Pad` or `Pad Out` section never locks a song to the next song's tempo.
- **Full surface:** `src/server/song-timings.ts:1, 40` and `test/song-timings.test.ts` (add a regression test starting playback in `Pad` and `Pad Out` before playing an earlier section).
- **Must preserve:** All existing tests in `test/song-timings.test.ts` and `test/set-builder-durations.test.ts` (manifest-built songs with pads still get their exact manifest durations from `builtTiming` before line 40 is reached).
- **Do not touch:** `builtTiming` (`src/server/song-timings.ts:63-71`) and `isPad` (`src/shared/count-in.ts:16`).
- **Proof:** `node --test --test-name-pattern="finding 5" docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (currently fails by caching 63 BPM timings in `Pad`; must pass after the fix), plus `pnpm exec vitest run test/song-timings.test.ts`.

---

### 6. During a count-in before Live reports entering Count Off, `timeLeft` adds the remaining time of whatever section the playhead was stopped in instead of the target song's Count Off — LOW
- **Location:** `web/src/durations.ts:44-53`
- **Attribution:** introduced (`f2942ed`, "setlist-controller#5 review fixes: the time left counts from a waiting jump, rounds up, and the tempo fallback waits for Live").
- **Real-world trigger:** Live is stopped in Song 1's Bridge (for example, 60 s left) or between songs (`now === null`), and the leader presses **Count in** on Song 2's Chorus. `playback-controller.ts:843-853` immediately publishes a snapshot with `countIn: true`, `jump: { song: 2, section: 2 }`, and the old `now` / `position` until Live's first `current_song_time` reply arrives from Song 2's Count Off. `web/src/durations.ts:50` computes `lead = restOfSection(set, timings, now.song, now.section, position)`, momentarily adding Song 1's 60 s Bridge (`1:08 left in song` instead of `0:12 left in song`), blanking the line to `null` if Song 1 is untimed, or dropping the Count Off duration if Live was stopped between songs. Rated **LOW** because the spike clears as soon as Live reports entering the Count Off (~50–100 ms, or up to one Count Off duration if the UDP start packet is lost).

**Evidence** — `web/src/durations.ts:44-53`
```ts
  if (jump) {
    const index = set.songs.findIndex((song) => song.number === jump.song);
    const song = set.songs[index];
    if (!song) return nothing;
    const timing = timings[song.number];
    const landed = jump.section === 'end' ? 0 : playedFrom(song, timing, jump.section, 1);
    const lead = countIn && now ? restOfSection(set, timings, now.song, now.section, position) : 0;
    const left = landed === null || lead === null ? null : lead + landed;
    return { song: left, set: combine(left, afterSong(set, timings, index)), approximate };
  }
```

**Failure mode** — With Song 1's Bridge (60 s) at `now: { song: 1, section: 1 }` and a held count-in to Song 2's Chorus (`4 s` Count Off + `8 s` Chorus), `timeLeft` returns `{ song: 68, set: { seconds: 68, atLeast: false }, approximate: false }` instead of `{ song: 12, set: { seconds: 12, atLeast: false }, approximate: false }`. Verified by `docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (`finding 6`).

**Recommended fix**
```diff
+import { COUNT_OFF } from '../../src/shared/count-in.ts';
 import { gapAfter, type SetList, type Snapshot, type Song, type SongTiming } from '../../src/shared/snapshot.ts';
```
```diff
     const landed = jump.section === 'end' ? 0 : playedFrom(song, timing, jump.section, 1);
-    const lead = countIn && now ? restOfSection(set, timings, now.song, now.section, position) : 0;
+    const lead = countIn ? countInLead(set, timings, song, now, position) : 0;
     const left = landed === null || lead === null ? null : lead + landed;
```
And add helper:
```diff
+function countInLead(set: SetList, timings: Timings, song: Song, now: Playhead['now'], position: number): number | null {
+  const countOff = song.sections.findIndex((section) => section.name === COUNT_OFF);
+  if (countOff === -1) return 0;
+  if (now?.song === song.number && now.section === countOff) return restOfSection(set, timings, song.number, countOff, position);
+  return timings[song.number]?.sections[countOff] ?? null;
+}
```

**Remediation brief**
- **Design intent:** A count-in always plays the target song's own `Count Off` section before landing on `jump.section` (`src/shared/count-in.ts:31`). Before Live reports entering that `Count Off`, the remaining lead time is the full duration of the target song's `Count Off` (not whatever unrelated section the stopped playhead was on); once `now` is inside that `Count Off`, the lead time counts down via `restOfSection`.
- **Full surface:** `web/src/durations.ts:1, 50` and `test/durations.test.ts` (add a test for a held count-in while `now` is still in another song's section and while `now` is `null` between songs).
- **Must preserve:** Existing count-in countdown test in `test/durations.test.ts:111-115` (when `now` is already inside the target song's Count Off), and all non-count-in waiting jump tests (`test/durations.test.ts:102-109`).
- **Do not touch:** `countInFor` in `src/shared/count-in.ts` and `nextSectionName` in `web/src/section-names.ts`.
- **Proof:** `node --test --test-name-pattern="finding 6" docs/reviews/setlist-controller-5/repro/review-1-findings.mjs` (currently fails returning `68` instead of `12`; must pass after the fix), plus `pnpm exec vitest run test/durations.test.ts`.

---

### 7. Comment hygiene — LOW (aggregated)
- `src/shared/set-manifest.ts:3-5` — `// The set manifest: one JSON file holding, for each song of the set in set order, its title, the key` / `// of its stems, its starting meter, and its chart's key and text. A song with no chart has no chart key` / `// and no chart text.` → mention each song's optional `durations` alongside its starting meter and chart (matching lines 20–21).

## Needs Further Investigation

None.

## Reviewed and Dismissed

- **Within-section beats-share approximation (`web/src/durations.ts:38-39, 109-114`)** — explicitly acknowledged in PR `#24` (Known gaps) and documented in `web/src/durations.ts:38-39`; per-section manifest spans cannot subdivide a mid-section tempo change without storing dense curves. Do not change.
- **`+SKIP` parser flag not set on `main` yet (`src/server/set-parser.ts`)** — explicitly deferred to the locator-flags lane in PR `#24` (Known gaps); `web/src/durations.ts` skip exclusion is implemented and covered by unit tests (`test/durations.test.ts:44-54, 72-75, 106`). Do not change.
- **`StageStatusLine` unchanged (`web/src/StageStatusLine.tsx`)** — explicitly deferred to issue `#7` in the settled-decisions comment on issue `#5`. Do not change.
- **Rounding durations to nearest second while rounding time left up (`web/src/durations.ts:29-31, 75-83`)** — intentional rule pinned by `test/durations.test.ts:122-153` so the set total equals the sum of displayed song durations and gaps, and remaining time reaches `0:00` only when nothing is left. Do not change.
- **Waiting jump counting from landing beat rather than adding partial bar to next bar line (`web/src/durations.ts:34-35, 44-53`)** — intentional design pinned by `test/durations.test.ts:102-109`. Do not change.
- **Shared computation core refactors (`src/set-builder/tempo.ts`, `src/shared/set-manifest.ts`, `src/server/playback-controller.ts:969-977`)** — proved zero scope leak against `$BASE` (`1dae6a4`) via differential harness (0 mismatches across 7 tempo maps and 6 non-duration manifests), and `defaultEndToggles` using `gapAfter` is algebraically identical to the previous inline check. Do not change.
- **`builtTiming` validating gaps by beat length alone (`src/server/song-timings.ts:68-69`)** — matches the issue/PR contract ("A song takes the build's seconds while their beats still match Live's locators"); swapping an entire following song while preserving exact gap beats without re-running `build-set` is outside the build-manifest contract. Do not change.

## Minor / nits

- `web/src/durations.ts:63, 151-153`: `songStart` returns `Infinity` for a song with zero sections (`sections: []`, possible only in a malformed Live set containing a standalone `"1 - End"` locator with no section locators). With such a malformed song at index 0, `findIndex((song) => songStart(song) > position)` matches index 0 even when `position` is past the end of the set. Returning `null` from `songStart` and filtering `start !== null && start > position` would guard that malformed-set case.
- `web/src/durations.ts:130, 134`: `sumFrom` calls `songSeconds(song, timing)` twice per song in the loop; harmless on small setlists, easy to bind to a local `const length = songSeconds(song, timing)`.
- `src/set-builder/set-durations.ts:29-31`: `spanOf` assumes `to >= from` (always holds for sets written by `build-set`, since `write-set.ts` / `timeline.ts` never place `nextStart < song.end` or a section after `End`).

## Test quality

Tests added: 56 unit/integration cases + 4 Playwright E2E runs (`test/durations.test.ts`: 34, `test/set-builder-durations.test.ts`: 7, `test/song-timings.test.ts`: 8, `test/set-manifest.test.ts`: 7 new cases; `e2e/durations.spec.ts`: 2 specs × 2 devices; plus `durations` assertions added to `test/set-builder-charts.test.ts`) · green against `$BASE` (assert nothing new): 0 · tautology shapes found: 0.

- **Verified red against `$BASE` (`1dae6a4`):** `test/durations.test.ts` and `test/song-timings.test.ts` import new modules absent at `$BASE`; `test/set-builder-durations.test.ts` and `test/set-builder-charts.test.ts` assert on `result.durations` / `song.durations` absent at `$BASE`; `e2e/durations.spec.ts` asserts on `.song-duration`, `.set-duration`, and `.now-time-left` absent at `$BASE`; and all 7 new cases in `test/set-manifest.test.ts` were executed directly against `git show 1dae6a4:src/shared/set-manifest.ts` with 0 of 7 passing green.
- **Independence:** `test/set-builder-durations.test.ts` measures built `.als` files with an independent 64-step-per-beat numerical integrator (`measured`) rather than sharing `secondsThrough`, avoiding self-fulfilling expectations.
- **Coverage gaps surfaced by this review:** add regression tests for Findings 1–6 (untimed last song / 1-song untimed set, Live reconnect while playing an unvisited song at a different tempo + initial `tempo` publish, set switch with same beat boundaries, Pixel 7 `expectWhole` on `"at least"` + `"~"`, starting playback in `Pad`/`Pad Out`, and count-in before Live reports entering Count Off).

## Before opening the PR

- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check:private` (working tree and `--range origin/main..HEAD`), all 11 touched Vitest files (460 tests), and `e2e/durations.spec.ts` (4 tests) are green on `f2942ed`.
- **Commit hygiene:** Working tree had 0 uncommitted changes at review time; commits `d9e1cbb` through `f2942ed` are scoped to `setlist-controller#5` and pass `pnpm check:private`. Leave this review doc and its repro under `docs/reviews/setlist-controller-5/` uncommitted for the parent session to commit.
- **Likely reviewer asks:** Remediate Findings 1–4 before merging PR `#24`, and include Findings 5–7 in the same remediation pass while the context is fresh.

## Verdict

**Not ready to merge as-is.** Gate before merging PR `#24`: fix **Findings 1–4 (MEDIUM)** (all verified with red-before-green repros in `docs/reviews/setlist-controller-5/repro/review-1-findings.mjs`). **Findings 5–7 (LOW)** are small, clean fixes worth taking in the same remediation pass.
