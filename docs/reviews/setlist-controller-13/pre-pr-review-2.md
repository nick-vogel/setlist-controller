# Pre-PR review: setlist-controller#13 Save set-recipe.json and add build-set edit (--swap, --add, --drop) preserving Live edits

**Branch:** `setlist-controller-13-build-set-edit` vs `origin/main` (merge-base `a9da50a`, "Merge pull request #19 from nick-vogel/setlist-controller-10-host-battery-warning")
**Reviewed at:** HEAD `c8533eb` (setlist-controller#13 merge main: #10 host battery warning and the private-terms check) + 0 files with uncommitted changes, 0 untracked files (before this doc and `repro/second-opinion-repros.ts`), 20 files total, +2989 / -85
**Mode:** `--fresh` (full second-opinion gate review of the working surface after round 1 remediation)
**Reviewed against:** `nick-vogel/setlist-controller#13` (open), parent epic `#12`, PR `#22`, `docs/merge-rules.md`, the global rules in `~/.claude/rules/`, `.claude/rules/public-repository.md`, and the Approach decisions and remediated findings 1 to 10 in `docs/reviews/setlist-controller-13/pre-pr-review-1.md`. The repo has no `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, ADRs or plan docs.
**Date:** 2026-11-25
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present (`eslint`, `playwright`, `tsc`, `vite`, `vitest`) |
| Typecheck | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | pass |
| Private terms (public repo rule) | `pnpm check:private` (tree) and `pnpm check:private --range origin/main..HEAD` | both exit 0 |
| Branch's test files | `pnpm test --maxWorkers=2 test/set-builder-edit.test.ts test/set-builder.test.ts test/set-builder-weekly-show.test.ts test/readme.test.ts` | 4/4 files, 139/139 pass (27, 79, 31, 2) |
| Full suite | `pnpm test --maxWorkers=2` | 103/104 files, 3352 passed, 4 skipped, 1 failed (`test/propresenter.test.ts:4902`, `the lyric lead > sends Verse 1's change 2 beats before its beat...`, untouched by branch) |
| `test/propresenter.test.ts` failure | `git log -1 -- test/propresenter.test.ts` (`d43fda2`, predates branch) and standalone rerun `pnpm vitest run test/propresenter.test.ts --maxWorkers=1` | 385/385 pass in 99.3 s; known timing flake under load, not a regression |
| Prior review repros (F1 to F5) | `node docs/reviews/setlist-controller-13/repro/edit-repros.ts` | F1, F2, F3 print `FAILS` (fixed); F4 and F5 print `HOLDS` (intentional keep-and-warn behaviour, verified by new tests) |
| Prior lights repro | `pnpm vitest run --config docs/reviews/setlist-controller-13/repro/vitest.repro.config.ts --maxWorkers=1` | `CLAIM` and `CONTROL` pass; `BASE-EQUIVALENT` fails (pre-existing `--replace` rebuild gap, out of scope per round 1) |
| Second-opinion repros (Findings 1 to 4) | `node docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts` | F1, F2a, F2b, F3, F4 all print `HOLDS` |
| Untested paths sanity check | scratch script in `mktemp -d` driving `edit --add --at 1` clip `SampleVolume` and read-only manifest folder `manifestProblem` | shifted clip `SampleVolume` kept (`0.77`); read-only manifest prints one-line `manifestProblem` and exits 1 (both work; missing suite tests) |
| Tautology oracle against `$BASE` | not run | no `git worktree add` permitted under non-Claude reviewer rules; static audit of all 27 new tests and 3 modified test files performed instead |
| Playwright E2E | not run | the branch touches no web code |
| Real Ableton Live, real Eos | not run | no Live or console here; verified against `.als` XML, `test/fake-eos.ts`, `test/fake-propresenter.ts`, and `test/harness.ts` |

**Overall:** All 10 findings from `pre-pr-review-1.md` landed cleanly and are verified at HEAD `c8533eb`, with zero CRITICAL or HIGH defects remaining. One MEDIUM defect (pre-existing on `--replace`, widened by every edit's `carryOver`, and previously deferred in round 1) is proved by execution to leave `set-manifest.json` and Eos cues stale after the new `.als` is already swapped in when a read-only subdirectory with a file sits inside the set folder. Five LOW findings remain: `lights.labelled` records library/recipe titles instead of the titles `lightsStep` actually wrote from the `.als`, `padKeyWarnings` misses a trailing explicit-key pad on last-song swaps, `before(position)` runs boundary merging on unchanged gap and overlap songs, two test coverage gaps remain, and three minor comment-hygiene entries remain. The branch is ready with follow-ups, and fixing Finding 1 (a one-line change plus test) before merge is recommended.

## Prior-review closure
All 10 Confirmed findings from `docs/reviews/setlist-controller-13/pre-pr-review-1.md` were re-verified against their intent at HEAD `c8533eb`:
- **Fully fixed (10 of 10):**
  - Finding 1 (HIGH, `619051f`): copied or renamed set folder is refused before reading `.als` or library; repro F1 fails to reproduce, test passes.
  - Finding 2 (HIGH, `30bbaca` + rework `b377159`): `carryOver` and `keepReplacedSet` preserve untouched top-level entries (`Backup/`, `Samples/`, hand-added files) and clone the replaced `.als` into `Backup/`; failure-path `rm(work)` is best-effort so the real error surfaces; repro F3 fails to reproduce, 5 tests pass. (The separate success-path `rm(work)` gap deferred in round 1 is promoted to Finding 1 below.)
  - Finding 3 (MEDIUM, `0fd5211`): `RecipeLights.labelled` is recorded on success only and passed as `previousTitles` by both `lights()` and `editSet()`; prior `lights-retry-after-failed-edit` repro `CLAIM` and `CONTROL` pass. (A narrower LOW edge case when Live edited `Count Off (<Title>)` is Finding 2 below.)
  - Finding 4 (MEDIUM, `79dec23`): `edit()` catches throws from `editSet()` and prints one line with exit 1; repro F2 fails to reproduce, test passes.
  - Finding 5 (LOW, `a64530b`): self-swap rebuilds from library and emits a summary warning; test passes.
  - Finding 6 (LOW, `c52603b`): `updateRecipe` throws on invalid recipe or write error, returning `false` only when missing; `lights()` and `editSet()` both report `LIGHTS_UNRECORDED` and exit 1; 3 tests pass.
  - Finding 7 (LOW, `cff614a`): `writeJsonAtomic` in `src/set-builder/set-manifest.ts` shared by `writeSetManifest` and `writeRecipe`.
  - Finding 8 (LOW, `90495fc`): `padKeyWarnings` warns when swap, add, or drop changes the song after an explicit-key pad; test passes. (The symmetric trailing-pad case on last-song swap is Finding 3 below.)
  - Finding 9 (MEDIUM, `7f2e4e6` + rework `ec9cb7f`): flag grammar removed, untouched songs carry locators verbatim shifted by `placed.offset - oldStart`, boundary song keeps builder `End` and `Pad Out`; tests pass. (Narrowing `boundary` for unchanged gap/overlap songs is Finding 4 below.)
  - Finding 10 (LOW, `6d3cb0c`): all 11 round-1 comment entries resolved.
- **Partially fixed:** 0.
- **Untouched:** 0.

## Approach decisions
Carried forward from `pre-pr-review-1.md`, with refinements from this review marked explicitly:
- **Which folder an edit writes:** refuses any folder other than `setFolder(dirname(folder), recipe.date)`.
- **What survives an edit's folder swap:** `replaceFolder` keeps its full-replacement contract for `--replace`; an edit opts in via `carryOver` to clone untouched top-level entries and the replaced `.als` into `Backup/`, retrying on the next second on `ERR_FS_CP_EEXIST`.
- **Cleanup in `replaceFolder` (refined by Finding 1):** both the failure-path cleanup (round 1 rework `b377159`) and the post-swap success-path cleanup (`build-set.ts:256`) are best-effort (`.catch(() => undefined)`), so an unremovable read-only directory inside `work/old` never aborts `editSet` or `build()` after the new set folder is already live on disk.
- **Locators of untouched songs (refined by Finding 4):** #13 parses no flag grammar and carries untouched songs' locators verbatim, shifting by `placed.offset - oldStart` and updating only the leading song number. Only a song before the edited position whose transition is a pad or changed by the edit (such as a dropped last-song overlap) uses boundary End-region merging (`End` and `Pad Out` from the new build); unchanged gap-to-gap and overlap-to-overlap songs carry verbatim.
- **Eos labels across runs (refined by Finding 2):** `set-recipe.json` records `lights.labelled` only after a successful lights run. `LightsRun` returns the exact `labelled` titles `lightsStep` wrote to Eos (from `readBuiltSet`), and both `lights()` and `editSet()` persist that list rather than re-deriving titles from `recipe.songs` or `built.songs`.
- **Edit summary warnings (extended by Finding 3):** `planEdit` returns `warnings` printed by `summary()`. Self-swap gets its own warning and no pad-key warning; explicit-key pad warnings cover both a pad before the edited position (`transitions[position - 1]`) and, on a non-self swap of the last song, a trailing pad after it (`transitions[position]`).
- **CLI error surface:** `edit()` catches throws from `editSet()` and prints one line with exit 1, matching `build()`.
- **Atomic JSON writes:** single helper `writeJsonAtomic` in `src/set-builder/set-manifest.ts`.
- **Lights the recipe cannot record:** shared `LIGHTS_UNRECORDED` prefix in `src/set-builder/edit-set.ts`, used by both `lights()` and `editSet()`.

## Confirmed Issues

### 1. `replaceFolder` throws on post-swap cleanup when the old folder holds a read-only directory with files, leaving `set-manifest.json` and Eos cues stale - MEDIUM
- **Location:** `src/set-builder/build-set.ts:256` (`replaceFolder`), reached via `src/set-builder/edit-set.ts:117-157` and `src/set-builder/main.ts:600-632`
- **Attribution:** pre-existing, exposed. `git show a9da50aac7ab9c031cd9e569497b6c76e7fa93e6:src/set-builder/build-set.ts` has `await rm(work, { recursive: true, force: true });` at line 225. At `$BASE` it ran only on a deliberate `--replace` rebuild. This branch routes every `build-set edit` through `replaceFolder` with `carryOver: true`, which clones existing directories forward from edit to edit, so once any read-only subdirectory holding a file sits in the set folder, every subsequent edit commits the new `.als` and `set-recipe.json` and then throws before updating `set-manifest.json` or running `lightsStep`.
- **Real-world trigger:** A set folder holds a read-only directory containing at least one file (for example a write-protected `Samples/Recorded/` archive or a read-only subfolder copied into the project, or on a plain `--replace`, a read-only `Backup/`). The operator runs `pnpm build-set edit <folder> --add trust` (or `--swap`/`--drop`). Because `0555` is readable, `carryOver` succeeds and copies it into the new project, `replaceFolder` renames the old folder into `work/old` and renames the new project into `folder`, and then `rm(work)` fails with `EACCES` unlinking the file in `work/old`. `edit` exits 1 with an `unlink` error, leaving the new 3-song `.als` and `set-recipe.json` live on disk while `set-manifest.json` (and connected band devices' charts) and Eos cues stay on the old 2-song set. MEDIUM (split-brain targets after a committed swap, narrowed by the uncommon read-only directory precondition).

**Evidence**
```ts
async function replaceFolder(folder: string, writeProject: (into: string) => Promise<void>): Promise<void> {
  const work = await mkdtemp(join(dirname(folder), `.${basename(folder)} replacing `));
  const next = join(work, 'new');
  try {
    await mkdir(next);
    await writeProject(next);
  } catch (error) {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  if (existsSync(folder)) await rename(folder, join(work, 'old'));
  await rename(next, folder);
  await rm(work, { recursive: true, force: true });
}
```

**Failure mode** - Executed (`docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts`, F1). Built `[grace, goodness]`, wrote `Samples/Recorded/take 1.wav`, set `Samples/Recorded` to `0o555`, and ran `edit <folder> --add trust`. Result: `exit 1`, stderr `EACCES: permission denied, unlink '.../.2026-10-18 Sunday replacing .../old/Samples/Recorded/take 1.wav'`, `set-recipe.json` holds 3 songs (`This Is Amazing Grace`, `Goodness of God`, `Trust In God`), `set-manifest.json` still holds 2 songs (`This Is Amazing Grace`, `Goodness of God`), and `outputRoot` holds both the set folder and the hidden `.replacing` directory.

**Recommended fix**
```diff
--- a/src/set-builder/build-set.ts
+++ b/src/set-builder/build-set.ts
@@ -253,5 +253,5 @@
   }
   if (existsSync(folder)) await rename(folder, join(work, 'old'));
   await rename(next, folder);
-  await rm(work, { recursive: true, force: true });
+  await rm(work, { recursive: true, force: true }).catch(() => undefined);
 }
```

**Remediation brief**
- **Design intent:** `replaceFolder` stages the complete new project inside a hidden sibling directory and swaps it into `folder` atomically via `rename`. Once `rename(next, folder)` succeeds, the new set is committed on disk; cleaning up `work/old` is best-effort (mirroring the failure-path cleanup at line 251), so an unremovable read-only file in `old` never aborts `editSet` or `build()` before `set-manifest.json`, `weeklyShow`, and `lightsStep` update the downstream targets.
- **Full surface:** `src/set-builder/build-set.ts:256` only. Both `editSet` (`src/set-builder/edit-set.ts:117`) and `build` (`src/set-builder/main.ts:600`) pass through `replaceFolder`.
- **Must preserve:** In normal writable folders, `rm(work, { recursive: true, force: true })` still removes the staging directory completely, leaving only the set folder in `outputRoot` (pinned by `test/set-builder.test.ts` "replaces the folder with the new set when the build replaces, so nothing of the old set is left in it" and `test/set-builder-edit.test.ts` "an edit that cannot carry the old set across fails and leaves the set as it was"). Failure-path cleanup at `build-set.ts:251` and `test/set-builder-edit.test.ts` "an edit that cannot keep the replaced set in a read-only Backup fails with that error and leaves the set as it was" stay unchanged. Failure of the fix itself: when `rm(work)` fails silently, the hidden sibling `.<name> replacing <random>` remains in `outputRoot`; because `mkdtemp` uses a unique suffix and `setFolder` never scans `outputRoot`, later builds and edits are unaffected, while `set-manifest.json` and Eos cues stay in sync with the new `.als`.
- **Do not touch:** `build-set.ts:251` (failure-path cleanup) and `carryOver`/`keepReplacedSet` in `src/set-builder/audio.ts`.
- **Proof:** Now, `node docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts` prints `HOLDS  F1 ...`; after the fix it must print `FAILS  F1`. Add a test to `test/set-builder-edit.test.ts` named `an edit carrying a read-only folder still updates set-manifest.json and exits 0` (also covering the fallback failure per `test-every-fallback-path`): build `[grace, goodness]`, create `Samples/Recorded/take 1.wav`, `chmod 0o555` on `Samples/Recorded`, run `edit <folder> --add trust` (restoring `chmod -R u+w` in `finally`), and expect exit 0, empty stderr, `set-recipe.json` and `set-manifest.json` both listing all 3 songs, and `Samples/Recorded/take 1.wav` present. Run red before the fix and green after with `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

### 2. `lights.labelled` records recipe or library titles instead of the titles `lightsStep` actually wrote to Eos - LOW
- **Location:** `src/set-builder/main.ts:424` (`lights()`), `src/set-builder/edit-set.ts:172` (`editSet()`), and `src/set-builder/lights.ts:39, 372` (`LightsRun`, `writeSongCues`)
- **Attribution:** introduced. `lights.labelled` was added in `0fd5211` (`setlist-controller#13 pre-PR review 1 finding 3`).
- **Real-world trigger:** The operator shortens or edits a song's `Count Off (<Title>)` locator in Live (for example `3 - Count Off (Trust)` or `1 - Count Off (Amazing Grace)`), which verbatim locator carry preserves across edits. When `--lights` (or an edit's lights step) runs, `lightsStep` reads the `.als` through `readBuiltSet` and labels the Eos cue with the Live title (`Trust` or `Amazing Grace`), while `main.ts:424` and `edit-set.ts:172` write `recipe.songs` / `built.songs` (the library folder title, e.g. `Trust In God` or `This Is Amazing Grace`) into `lights.labelled`. On the next edit that swaps or drops that song, `findSongCues` receives `previousTitles` that do not match the label in Eos: for the last song it exits 0, leaves cue 22 stale and creates a copied cue 1/12; for an earlier song it exits 1 saying Eos has no cue labelled `"Song 1"`. LOW because editing the parenthesized title on `Count Off` in Live is uncommon.

**Evidence**
```ts
// src/set-builder/main.ts:418-425
    await updateRecipe(setFolder(outRoot, date), (recipe) => ({
      ...recipe,
      lights: {
        showFolder: showDir,
        connectionsConfig: connConfig,
        ...(values.playlist === undefined ? {} : { playlist: values.playlist }),
        labelled: recipe.songs.map((song) => song.title),
      },
    }))
```
```ts
// src/set-builder/edit-set.ts:171-174
    if (run.problem === undefined) {
      const labelled = built.songs.map((song) => song.title);
      lightsProblem = await updateRecipe(folder, (next) => (next.lights === undefined ? next : { ...next, lights: { ...next.lights, labelled } }))
```

**Failure mode** - Executed (`docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts`, F2a and F2b).
- F2a: Renamed `3 - Count Off (Trust In God)` to `3 - Count Off (Trust)` in the built `.als`, ran `--lights` (exit 0; Eos cue 22 became `Trust`, recipe `lights.labelled` recorded `["This Is Amazing Grace","Yes and Amen","Trust In God"]`), then ran `edit <folder> --swap 3 "i speak"`. Result: exit 0, Eos cues ended as `["1=This Is Amazing Grace","11=Yes and Amen","12=I Speak Jesus","22=Trust"]` (cue 22 stale, spurious copy cue 12 created).
- F2b: Renamed `1 - Count Off (This Is Amazing Grace)` to `1 - Count Off (Amazing Grace)`, ran `--lights` (exit 0; Eos cue 1 became `Amazing Grace`, recipe `lights.labelled[0]` recorded `This Is Amazing Grace`), then ran `edit <folder> --swap 1 "i speak"`. Result: exit 1, stderr `The lights step is not done: cue list 1 has no cue labelled "Song 1" (song 1, I Speak Jesus).`.

**Recommended fix**
```diff
--- a/src/set-builder/lights.ts
+++ b/src/set-builder/lights.ts
@@ -36,7 +36,7 @@
 
 // What a run of the mode gives the command to print: its lines for stdout, and its one problem line for stderr, with
 // exit 1, when the lights step is not done.
-export type LightsRun = { lines: string[]; problem?: string };
+export type LightsRun = { lines: string[]; problem?: string; labelled?: string[] };
 
 // What the mode is run with: the date of the set, the output root the set was built under, the show folder, the
 // connections config file, the one the server reads, whose "eos" section names Eos and whose "propresenter" section
@@ -369,7 +369,7 @@
   const unsaved = (why: string): LightsRun => ({ lines, problem: `${NOT_DONE} the song cues are labelled and coloured in the open show, but ${why}. Save the show by hand in ETCnomad.` });
   if (!live()) return unsaved(`the command line in Eos no longer reads LIVE, it reads "${eos.commandLine()}", so the show is not saved`);
   if (!(await eos.save())) return unsaved('Eos did not say it saved the show');
-  return { lines: [...lines, await eos.showPath()] };
+  return { lines: [...lines, await eos.showPath()], labelled: songs.map((song) => song.title) };
 }
```
```diff
--- a/src/set-builder/main.ts
+++ b/src/set-builder/main.ts
@@ -421,7 +421,7 @@
         showFolder: showDir,
         connectionsConfig: connConfig,
         ...(values.playlist === undefined ? {} : { playlist: values.playlist }),
-        labelled: recipe.songs.map((song) => song.title),
+        labelled: run.labelled ?? recipe.songs.map((song) => song.title),
       },
     })).catch((error: unknown) => {
```
```diff
--- a/src/set-builder/edit-set.ts
+++ b/src/set-builder/edit-set.ts
@@ -169,7 +169,7 @@
     lightsLines = run.lines;
     lightsProblem = run.problem;
     if (run.problem === undefined) {
-      const labelled = built.songs.map((song) => song.title);
+      const labelled = run.labelled ?? built.songs.map((song) => song.title);
       lightsProblem = await updateRecipe(folder, (next) => (next.lights === undefined ? next : { ...next, lights: { ...next.lights, labelled } })).then(
         () => undefined,
         (error: unknown) => `${LIGHTS_UNRECORDED} ${oneLine(error)}`,
```

**Remediation brief**
- **Design intent:** `lights.labelled` must record the exact cue labels Eos actually took on the last successful lights run. `lightsStep` reads the `.als` via `readBuiltSet` and sends `song.title` from that list to `eos.setLabel`; returning `labelled: songs.map((song) => song.title)` on the one success return of `writeSongCues` keeps `lights.labelled` single-sourced with Eos even when a song's `Count Off` title was edited in Live.
- **Full surface:** `src/set-builder/lights.ts:39` (`LightsRun` type), `src/set-builder/lights.ts:372` (success return); `src/set-builder/main.ts:424` (`lights()`); `src/set-builder/edit-set.ts:172` (`editSet()`). Grep-verified: `main.ts` and `edit-set.ts` are the only callers of `lightsStep`.
- **Must preserve:** All of `test/set-builder-lights.test.ts` (155 tests) and `test/set-builder-edit.test.ts` "records --lights settings in set-recipe.json..." and "a --lights retry after an edit whose lights step failed...". When `run.problem !== undefined` (including unsaved shows at `lights.ts:370-371`), `labelled` stays omitted and the recipe's previous `lights.labelled` is untouched.
- **Do not touch:** `src/set-builder/song-cues.ts` (`findSongCues` lookup order) and `src/set-builder/built-set.ts`.
- **Proof:** Now, `node docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts` prints `HOLDS  F2a` and `HOLDS  F2b`; after the fix both print `FAILS`. Add a test to `test/set-builder-edit.test.ts` named `lights.labelled records the title written from the Live set so a later edit relabels a renamed Count Off cue` driving the F2b (or F2a + F2b) scenario against fake Eos and expecting cue 1 / cue 22 relabelled to `I Speak Jesus` with exit 0. Run red then green with `pnpm vitest run test/set-builder-edit.test.ts test/set-builder-lights.test.ts --maxWorkers=2`.

### 3. `padKeyWarnings` misses a trailing explicit-key pad when swapping the last song - LOW
- **Location:** `src/set-builder/edit-set.ts:217-220` and `src/set-builder/edit-set.ts:278-283` (`padKeyWarnings`)
- **Attribution:** introduced. `padKeyWarnings` was added in `90495fc` (`setlist-controller#13 pre-PR review 1 finding 8`).
- **Real-world trigger:** The operator builds a set with an explicit-key pad ending the set (`--pad 2=A` after a 2-song set ending on Trust In God in A; per `build-set.ts:30-32`, a trailing pad takes the last song's own key by default), then runs `pnpm build-set edit <folder> --swap 2 "great are"` (swapping to Great Are You Lord in D). The swap keeps `pad in A` after a song in D with exit 0 and no warning, even though swapping the song after an interior `--pad 1=A` prints a warning. Breaks `whole-surface-of-a-change` (checked only `transitions[position - 1]`, omitting the symmetric trailing-pad position `transitions[position]` on a last-song swap). LOW (same tier as round 1 Finding 8: explicit override only, never produced by `--plan`, and summary line shows `pad in A`).

**Evidence**
```ts
// src/set-builder/edit-set.ts:217-221
    const warnings =
      replacement.folder === songs[target.position - 1]!.folder
        ? [`Song ${target.position} is rebuilt from ${replacement.folder} in the library, so its locators and clip gains start as the library has them.`]
        : padKeyWarnings(nextTransitions, nextSongs, target.position);
```
```ts
// src/set-builder/edit-set.ts:278-283
function padKeyWarnings(transitions: Partial<Record<number, Transition>>, songs: { title: string }[], position: number): string[] {
  const pad = transitions[position - 1];
  if (pad?.type !== 'pad' || pad.key === undefined) return [];
  const next = songs[position - 1];
  return [`The pad after song ${position - 1} keeps its own key, ${pad.key}, and now ${next === undefined ? 'ends the set' : `leads into ${next.title}`}.`];
}
```

**Failure mode** - Executed (`docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts`, F3). Built `[goodness, trust]` with `--pad 2=A`, then ran `edit <folder> --swap 2 "great are"`. Result: `exit 0`, `transitions={"2":{"type":"pad","key":"A"}}`, stdout lists `2. Great Are You Lord  bar 87  72 BPM  6/8  pad in A`, and no `keeps its own key` warning is printed.

**Recommended fix**
```diff
--- a/src/set-builder/edit-set.ts
+++ b/src/set-builder/edit-set.ts
@@ -217,7 +217,7 @@
     const warnings =
       replacement.folder === songs[target.position - 1]!.folder
         ? [`Song ${target.position} is rebuilt from ${replacement.folder} in the library, so its locators and clip gains start as the library has them.`]
-        : padKeyWarnings(nextTransitions, nextSongs, target.position);
+        : padKeyWarnings(nextTransitions, nextSongs, target.position, true);
     return { ok: true, songs: nextSongs, transitions: nextTransitions, untouched, boundary: before(target.position), warnings };
   }
 
@@ -275,11 +275,18 @@
   };
 }
 
-function padKeyWarnings(transitions: Partial<Record<number, Transition>>, songs: { title: string }[], position: number): string[] {
+function padKeyWarnings(transitions: Partial<Record<number, Transition>>, songs: { title: string }[], position: number, swap = false): string[] {
+  const warnings: string[] = [];
   const pad = transitions[position - 1];
-  if (pad?.type !== 'pad' || pad.key === undefined) return [];
-  const next = songs[position - 1];
-  return [`The pad after song ${position - 1} keeps its own key, ${pad.key}, and now ${next === undefined ? 'ends the set' : `leads into ${next.title}`}.`];
+  if (pad?.type === 'pad' && pad.key !== undefined) {
+    const next = songs[position - 1];
+    warnings.push(`The pad after song ${position - 1} keeps its own key, ${pad.key}, and now ${next === undefined ? 'ends the set' : `leads into ${next.title}`}.`);
+  }
+  if (swap && position === songs.length) {
+    const trailing = transitions[position];
+    if (trailing?.type === 'pad' && trailing.key !== undefined) {
+      warnings.push(`The pad after song ${position} keeps its own key, ${trailing.key}, and now follows ${songs[position - 1]!.title}.`);
+    }
+  }
+  return warnings;
 }
```

**Remediation brief**
- **Design intent:** An explicit-key pad keeps the operator's override and warns whenever an edit changes the song whose key that pad would otherwise follow. For an interior pad that is the song after it (`position - 1`); for a pad after the last song (`position === songs.length`), that is the last song itself on a non-self swap.
- **Full surface:** `src/set-builder/edit-set.ts:220` (`swap` call site) and `src/set-builder/edit-set.ts:278-283` (`padKeyWarnings`). `--add` and `--drop` already cover trailing pads via `transitions[position - 1]` (an add at the end turns the old trailing pad into an interior pad before the new song; a drop of the last song drops its trailing pad and checks the previous song's pad).
- **Must preserve:** All 5 steps of `test/set-builder-edit.test.ts` "an edit that changes the song after an explicit-key pad says the pad keeps its key", self-swap producing only the self-swap warning ("swapping a song for its own folder rebuilds it from the library and says so"), and keyless pads following automatically with no warning ("swaps a song by position or name...").
- **Do not touch:** transition re-indexing in the add and drop branches of `planEdit`.
- **Proof:** Now, `node docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts` prints `HOLDS  F3`; after the fix it prints `FAILS  F3`. Extend `an edit that changes the song after an explicit-key pad says the pad keeps its key` (or add a sibling test) in `test/set-builder-edit.test.ts` with `--pad 2=A` followed by `--swap 2 "great are"`, expecting `The pad after song 2 keeps its own key, A, and now follows Great Are You Lord.` and `transitions` still `{ 2: { type: 'pad', key: 'A' } }`. Run red then green with `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

### 4. `before(position)` runs boundary locator merging on unchanged gap and overlap songs, resurrecting deleted locators and duplicating moved locators - LOW
- **Location:** `src/set-builder/edit-set.ts:221, 244, 273, 285-287` (`before`), consumed by `src/set-builder/live-edits.ts:122-135` (`carriedLocators`)
- **Attribution:** introduced. `before()` and `boundary` were added in `7f2e4e6` (`setlist-controller#13 pre-PR review 1 finding 9`).
- **Real-world trigger:** On a plain gap set (the default when no `--pad` or `--overlap` is given), the operator deletes a locator (for instance `1 - Intro`) or shifts a locator's beat (for instance moving `1 - Verse 1` earlier by 4 beats) on Song 1 in Live, saves, and then runs `pnpm build-set edit <folder> --swap 2 "great are"` (or `--drop 2` or `--add ... --at 2`). Even though Song 1's transition is `gap` before and `gap` after and its End region did not change at all (`write-set.ts:325-343` and `timeline.ts:82-97` depend on the next song only for a `pad` or when a trailing `overlap` is dropped), `before(2)` puts Song 1 into `boundary`. `carriedLocators` merges against the library's locators instead of carrying Song 1 verbatim, restoring the deleted `1 - Intro` and duplicating `1 - Verse 1` at both the old moved beat and the library beat. The same happens for an unchanged `overlap` (`overlap` before and `overlap` after: `timeline.ts:83` places `End` at `endingOf(song)`, independent of the next song). LOW because renamed and added locators already survive and round 1 Finding 9 had accepted the delete/move caveat for boundary songs; narrowing `boundary` removes it for every non-pad, unchanged-transition song.

**Evidence**
```ts
// src/set-builder/edit-set.ts:221, 244, 273, 285-287
    return { ok: true, songs: nextSongs, transitions: nextTransitions, untouched, boundary: before(target.position), warnings };
...
function before(position: number): Set<number> {
  return new Set(position > 1 ? [position - 1] : []);
}
```

**Failure mode** - Executed (`docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts`, F4). Built `[goodness, trust, grace]` (all gaps), deleted `1 - Intro` and moved `1 - Verse 1` from beat 40 to beat 36 in the `.als`, then ran `edit <folder> --swap 2 "great are"`. Result: `exit 0`, `1 - Intro` was restored into Song 1, and Song 1 now contains two `1 - Verse 1` locators (at beats 36 and 40).

**Recommended fix**
```diff
--- a/src/set-builder/edit-set.ts
+++ b/src/set-builder/edit-set.ts
@@ -218,7 +218,7 @@
       replacement.folder === songs[target.position - 1]!.folder
         ? [`Song ${target.position} is rebuilt from ${replacement.folder} in the library, so its locators and clip gains start as the library has them.`]
         : padKeyWarnings(nextTransitions, nextSongs, target.position);
-    return { ok: true, songs: nextSongs, transitions: nextTransitions, untouched, boundary: before(target.position), warnings };
+    return { ok: true, songs: nextSongs, transitions: nextTransitions, untouched, boundary: boundaryBefore(target.position, transitions, nextTransitions), warnings };
   }
 
   if (action.kind === 'add') {
@@ -241,7 +241,7 @@
     for (let oldPos = 1; oldPos <= songs.length; oldPos++) {
       untouched.set(oldPos >= at ? oldPos + 1 : oldPos, oldPos);
     }
-    return { ok: true, songs: nextSongs, transitions: nextTransitions, untouched, boundary: before(at), warnings: padKeyWarnings(nextTransitions, nextSongs, at) };
+    return { ok: true, songs: nextSongs, transitions: nextTransitions, untouched, boundary: boundaryBefore(at, transitions, nextTransitions), warnings: padKeyWarnings(nextTransitions, nextSongs, at) };
   }
 
   const target = resolveRecipeSong(songs, action.song);
@@ -270,7 +270,7 @@
     songs: nextSongs,
     transitions: nextTransitions,
     untouched,
-    boundary: before(target.position),
+    boundary: boundaryBefore(target.position, transitions, nextTransitions),
     warnings: padKeyWarnings(nextTransitions, nextSongs, target.position),
   };
 }
@@ -282,8 +282,12 @@
   return [`The pad after song ${position - 1} keeps its own key, ${pad.key}, and now ${next === undefined ? 'ends the set' : `leads into ${next.title}`}.`];
 }
 
-function before(position: number): Set<number> {
-  return new Set(position > 1 ? [position - 1] : []);
+function boundaryBefore(position: number, oldTransitions: Partial<Record<number, Transition>>, nextTransitions: Partial<Record<number, Transition>>): Set<number> {
+  if (position <= 1) return new Set();
+  const prev = position - 1;
+  const beforeType = oldTransitions[prev]?.type ?? 'gap';
+  const afterType = nextTransitions[prev]?.type ?? 'gap';
+  return new Set(beforeType === 'pad' || afterType === 'pad' || beforeType !== afterType ? [prev] : []);
 }
```

**Remediation brief**
- **Design intent:** This refines round 1's Approach decision on boundary locators. `write-set.ts:locatorsFor` and `timeline.ts:placeSongs` depend on the following song for a song's locators only when that song's transition is a `pad` (whose `length` and `Pad Out` depend on the next song's tempo, meter, or presence) or when the edit changes the transition itself (dropping the last song removes a dangling `overlap`, restoring the sections after `Ending`). When the song before the edited position keeps a `gap` or keeps an `overlap`, its End region is unchanged and its locators carry verbatim just like every other untouched song. Normalizing `undefined` to `'gap'` prevents a hand-edited `{ "type": "gap" }` transition in a recipe from looking like a transition change.
- **Full surface:** `src/set-builder/edit-set.ts:221, 244, 273, 285-287`. Update the comment on `LocatorCarry.boundary` in `src/set-builder/live-edits.ts:29` to match (`The NEW song numbers whose End region the new build decides: a song before the edited position whose transition is a pad or changed by the edit.`).
- **Must preserve:** Both existing boundary tests in `test/set-builder-edit.test.ts` ("a song added after a pad that ended the set leaves no Pad Out from the old set inside the new Pad section" and "the song before a dropped last song keeps its renamed sections and gets back the sections its overlap had cut"), plus all assertions in "carries every untouched song's locators as Live has them...".
- **Do not touch:** `carriedLocators` matching logic in `src/set-builder/live-edits.ts:126-135` (the pad and dropped-overlap boundary merge still uses it).
- **Proof:** Now, `node docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts` prints `HOLDS  F4`; after the fix it prints `FAILS  F4`. Add a test to `test/set-builder-edit.test.ts` named `a song with an unchanged gap before an edit keeps deleted and moved locators verbatim` driving F4 and expecting `1 - Intro` absent and `1 - Verse 1` present once at beat 36. Run red then green with `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

### 5. Missing test coverage for `editSet`'s manifest-write fallback and for clip-gain preservation across a song position shift - LOW
- **Location:** `src/set-builder/edit-set.ts:147-153` (`manifestProblem` catch) and `test/set-builder-edit.test.ts:413-531` (`SampleVolume` assertion)
- **Attribution:** introduced (`bc7e96c`).
- **Real-world trigger:** No proven runtime defect (both paths were executed against a scratch script in this review and passed: read-only manifest folder printed one-line `manifestProblem` with exit 1, and `SampleVolume` stayed `0.77` after `--add --at 1`). However, `edit-set.ts:149` adds a `.then(..., oneLine)` fallback with zero failing-path tests (breaking `test-every-fallback-path`), and `test/set-builder-edit.test.ts:413` names clip gains "across --swap, --add, and --drop" while asserting `SampleVolume` only after `--swap` (line 482) and never after `--drop` or `--add --at 1` where `oldSongNumber !== newSongNumber` (flagged in `pre-pr-review-1.md:400` and still unaddressed).

**Evidence**
```ts
// src/set-builder/edit-set.ts:147-153
  if (recipe.setManifest !== undefined) {
    const manifest = buildManifest(built.songs, charts);
    const err = await writeSetManifest(recipe.setManifest, manifest).then(() => undefined, oneLine);
    if (err !== undefined) {
      manifestProblem = `The set is updated, but the set manifest ${recipe.setManifest} cannot be written: ${err}. The chart view still shows the last manifest's charts.`;
    }
  }
```
And `test/set-builder-edit.test.ts:479-531`: `SampleVolume` is checked at line 482 (after `--swap 2`), omitted after `--drop 2` (lines 485-505) and after `--add trust --at 1` (lines 507-531).

**Failure mode** - By grep (`git grep -n "manifestProblem\|cannot be written" test/` and `git grep -n "SampleVolume" test/set-builder-edit.test.ts`): no test exercises `editSet`'s `manifestProblem` path, and no test exercises `applyClipVolumes` when `oldSongNumber !== newSongNumber`.

**Recommended fix**
1. In `test/set-builder-edit.test.ts`, add the `SampleVolume` check for `Songs/Goodness of God/Piano.wav` (`'0.77'`) after `--drop 2` (around line 505) and after `--add trust --at 1` (around line 530, where Goodness of God shifted from song 1 to song 2).
2. In `test/set-builder-edit.test.ts` (under `validation errors and atomic failure safety`), add a test named `an edit whose set manifest cannot be written keeps the updated set, reports the manifest error, and exits 1`: build with `setManifest` inside a dedicated subdirectory, `chmod 0o555` that subdirectory, run `edit <folder> --add trust` (restoring `0o755` in `finally`), and expect exit 1, stdout containing the updated 3-song summary, stderr matching `The set is updated, but the set manifest .* cannot be written: .*EACCES`, and `set-recipe.json` updated to 3 songs while the old `set-manifest.json` stays intact.

**Remediation brief**
- **Design intent:** `editSet` mirrors `build()` when `writeSetManifest` fails after the `.als` is already swapped in: the updated set stays on disk, the summary prints on stdout, the manifest failure prints as one line on stderr with exit 1, and (when configured) `lightsStep` still runs. `applyClipVolumes` maps `newSongNumber -> oldSongNumber` via `untouched`, so shifting a song's position must preserve its clip `SampleVolume`.
- **Full surface:** `test/set-builder-edit.test.ts:485-531` and a new test in `test/set-builder-edit.test.ts` around line 916. No production code changes needed unless a regression is uncovered.
- **Must preserve:** All 27 existing tests in `test/set-builder-edit.test.ts`.
- **Do not touch:** `src/set-builder/edit-set.ts:146-153` and `src/set-builder/live-edits.ts:222-246`.
- **Proof:** Verify both tests fail if the `manifestProblem` catch or `untouched.get(newSongNumber)` mapping is broken, then pass with `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

### 6. Comment hygiene - LOW (aggregated)
- `src/set-builder/live-edits.ts:42` - `// Extracts Live edits from an existing built \`.als\` document before re-materialization.` -> delete (restates function name `extractLiveEdits`, per `comments-must-be-load-bearing`).
- `src/set-builder/live-edits.ts:75, 91` - `// 1. Track mixer volumes.` -> delete (restates the loop below it); change `:91` from `// 2. Per-song clip SampleVolume on untouched songs, found by the new build's own locators.` -> `// Per-song clip SampleVolume on untouched songs, found by the new build's own locators.` (removes dangling step number while keeping the load-bearing ordering constraint).
- `src/set-builder/build-set.ts:241-242` - `Nothing of the old set (its audio, a file added by hand, Live's Backup folder) is left among the new one` -> `For a full --replace build, nothing of the old set (its audio, a file added by hand, Live's Backup folder) is left among the new one; an edit opts in to carryOver inside writeProject to clone untouched entries and the replaced .als across.` (updates stale comment noted in `pre-pr-review-1.md:462`).

## Needs Further Investigation
None. Every candidate defect was executed or cleared against the real codebase.

## Reviewed and Dismissed
- **`test/propresenter.test.ts:4902` failure in full-suite run (`the lyric lead > sends Verse 1's change 2 beats before its beat...`)** - pre-existing timing flake under machine load: `git log -1 -- test/propresenter.test.ts` is `d43fda2` (untouched by this branch), and standalone `pnpm vitest run test/propresenter.test.ts --maxWorkers=1` passed 385/385.
- **Duplicate song in one setlist (`[Goodness, Trust, Goodness]`) during `extractClipVolumes`/`applyClipVolumes` and `resolveRecipeSong`** - cleared: clip volume keys include `songNumber` (`${songNumber}\0${relativePath}`), so the two instances stay isolated even across shifts, and `resolveRecipeSong` reports ambiguity by title and accepts 1-based positions.
- **Multiple edits within the same second (`keepReplacedSet` in `src/set-builder/audio.ts:116-130`)** - cleared: retries after `1000 - at.getMilliseconds()` only on `ERR_FS_CP_EEXIST` and rethrows all other errors immediately; both paths are unit-tested (`test/set-builder-edit.test.ts:861-897`).
- **Sequential failed lights edits (edit 1 fails Eos, edit 2 runs before Eos is back)** - cleared: `recipe.lights.labelled` stays at the last successful Eos labels across failed edits, so a later edit or `--lights` retry still passes the true Eos labels as `previousTitles`.
- **Clip start beat vs first locator beat in `songSpans` (`src/set-builder/live-edits.ts:166-190`)** - cleared for real library songs: checked every fixture song in `test/fixtures/set-builder/library` (`minLoc: 0`, `minClip: 0`, first locator `Count Off`). Only a Live edit that deletes `Count Off` itself (which already breaks `parseSet`'s title extraction) could move the first locator past beat 0.
- **Overlap ringing clips across `extractClipVolumes` (`src/set-builder/live-edits.ts:196-246`)** - cleared: MultiTracks stems start at beat 0 of their song, well before `Ending`, and clip gains are keyed by `songNumber` + `relativePath`, so clips that move between tracks (`Drums 2` to `Drums 1`) after dropping an overlapping song still receive their saved `SampleVolume`.
- **Unnumbered locators in the old `.als` dropped on edit (`src/set-builder/live-edits.ts:61-65`)** - intentional per `pre-pr-review-1.md` Finding 9 (`parseSet` already warns on unnumbered locators).
- **Hand-added locator at exact new `Pad Out` beat on boundary song after dropping last song** - already recorded as an accepted LOW deferred behaviour in `pre-pr-review-1.md:458`.
- **Private terms and fixture scrubbing (`.claude/rules/public-repository.md`)** - cleared: `pnpm check:private` (tree) and `pnpm check:private --range origin/main..HEAD` both exit 0 with the private terms list active, and all new test fixtures reuse existing public library songs and stand-in names.

## Minor / nits
- `src/set-builder/live-edits.ts:17, 53-54, 79-81`: `trackVolumesByName` fallback is still unexercised by any test because template track Ids are stable (`pre-pr-review-1.md:400`).
- `src/set-builder/edit-set.ts:98, 108`: the `readAls` and `readStemMapFile` `catch` blocks have no dedicated failing-path tests in `test/set-builder-edit.test.ts` (though both wrap pure error formatting).
- `src/set-builder/main.ts:331`: `--swap=<song>` is still refused as an unknown option while `--add=`, `--drop=`, `--at=`, `--date=`, and `--output-root=` accept `=` (carried from round 1).
- `src/set-builder/recipe.ts:285`: comment says "so skill quote checks match" (refers to `test/build-set-skill-quotes.test.ts`; accurate).
- `src/set-builder/set-manifest.ts:46`: `writeJsonAtomic`'s catch runs `await rm(partial, { force: true })` without `.catch(() => undefined)` (pre-existing from `writeSetManifest` at `$BASE`; on a `0o000` directory `rm` could mask `writeFile`'s error with an `lstat` `EACCES`).

## Test quality
Tests added: 27 in `test/set-builder-edit.test.ts`, plus 4 modified assertions across `test/set-builder.test.ts` (2), `test/set-builder-weekly-show.test.ts` (1), and `test/readme.test.ts` (1).
- **Green against `$BASE` oracle:** not run (no `git worktree add` permitted under non-Claude reviewer rules). By static inspection against `git show a9da50a:...`: `test/set-builder-edit.test.ts` imports `edit-set.ts` and `recipe.ts` (absent at `$BASE`, so red on import), and all 4 modified assertions in `test/set-builder.test.ts`, `test/set-builder-weekly-show.test.ts`, and `test/readme.test.ts` check `set-recipe.json`, the 8th synopsis line, and the 4 new flags (all absent at `$BASE`).
- **Tautology shapes found:** 0. Every test drives the real CLI or real module functions against real `.als` XML, real JSON files, fake Eos/ProPresenter/Planning Center servers, and the real server rig, with literal expectations.
- **Coverage gaps:** see Confirmed Finding 5 (`editSet` `manifestProblem` fallback untested per `test-every-fallback-path`; clip `SampleVolume` not re-asserted after `--drop` and `--add --at 1` in `test/set-builder-edit.test.ts:413-531`) and the new regression tests required by Findings 1 to 4.

## Before opening the PR
- **CI readiness:** `pnpm typecheck`, `pnpm lint`, `pnpm check:private`, `pnpm check:private --range origin/main..HEAD`, and all 4 branch test files (139/139) pass. Full suite: 103/104 files pass, and the lone `test/propresenter.test.ts` timeout passed 385/385 alone. Re-run the together check (`pnpm lint && pnpm typecheck && pnpm test`) and `pnpm check:private` after any follow-up commits.
- **Commit hygiene:** Working tree was clean at HEAD `c8533eb` before adding this doc and `docs/reviews/setlist-controller-13/repro/second-opinion-repros.ts`. Both sit outside `test/**/*.test.ts`. Do not commit private terms in PR title, body, or review doc (`pnpm check:private --stdin` on PR title/body before merge per `docs/merge-rules.md`).
- **Likely reviewer asks:** whether Finding 1 (one-line `.catch(() => undefined)` on `replaceFolder`'s post-swap `rm(work)`) should land in this PR before merge so edits never split the `.als` from `set-manifest.json` and Eos on a read-only subfolder.

## Verdict
**Ready with follow-ups.** No CRITICAL or HIGH issues remain, and all 10 findings from `pre-pr-review-1.md` are verified fixed. Gate recommendation: fix Finding 1 (MEDIUM, one-line cleanup guard in `src/set-builder/build-set.ts:256` plus test) before merge if convenient, or remediate Findings 1 to 6 together in one short `/pr-review-remediate` pass; Findings 2 to 6 (all LOW) do not block merge and may also ship as follow-ups ahead of `#14`.
