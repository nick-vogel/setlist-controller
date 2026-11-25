# Pre-PR review: setlist-controller#13 Save set-recipe.json and add build-set edit (--swap, --add, --drop) preserving Live edits

**Branch:** `setlist-controller-13-build-set-edit` vs `origin/main` at the branch point (merge-base `adee302`, "setlist-controller, the first public commit"). origin/main has moved since; diffing against it shows false deletions, so this review uses the merge-base.
**Reviewed at:** HEAD `bc7e96c` (Save set-recipe.json and add build-set edit preserving Live edits (#13)) + 0 files with uncommitted changes, 0 untracked files (before this doc and its `repro/`), 13 files total, +1801 / -71
**Reviewed against:** `nick-vogel/setlist-controller#13` (open) and its epic `#12`; the follow-on `#14` (`build-set edit --key`, blocked by this) read for anything this branch would block; `docs/merge-rules.md`; the global rules in `~/.claude/rules/`; the repo rule `.claude/rules/public-repository.md` as it stands on origin/main (it is not on this branch, which predates it). The repo has no `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, ADRs or plan docs. No prior review of this issue.
**Date:** 2026-11-25
**Reviewer:** 2 code-review agents + 1 disprove agent + verify pass (first opinion), with an independent second opinion (Opus 5.5, separate thread) folded in on the same day; see "Second opinion"

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present |
| Typecheck | `pnpm -s typecheck` | pass |
| Lint | `pnpm -s lint` | pass |
| Branch's test files | `pnpm -s vitest run <file>` for `test/set-builder-edit.test.ts`, `test/set-builder.test.ts`, `test/set-builder-weekly-show.test.ts`, `test/readme.test.ts` | 25/25, 79/79, 31/31, 2/2 pass |
| Full suite | `pnpm -s vitest run --maxWorkers=2` (machine load average 200 to 285 from other agents' suites) | 101/102 files, 3295 passed, 4 skipped, 2 failed: both 5000 ms timeouts in `test/set-builder-plan.test.ts`, which the branch does not touch |
| Those 2 timeouts | rerun alone; then `--testTimeout=30000 --reporter=verbose` twice at HEAD and twice at `adee302` in a scratch worktree | alone at 5 s: 2 different tests time out on each run; at 30 s: HEAD 68/68 twice (the tests take 1.4 to 2.3 s), base 68/68 (up to 4.7 s under the same load). Load, not a regression |
| Private terms (public repo rule) | `scripts/check-private-terms.mjs` from origin/main, run in this worktree with `--range adee302..bc7e96c`, then in tree mode, with the private list present | both exit 0 |
| Fixture names | `git grep -F` at `adee302` for each new fixture song name, show, ProPresenter fixture and plan id the new tests use | every one already in the public tree at base |
| Tautology oracle | scratch `git worktree add` at `adee302`, HEAD's 4 test files copied in, run there | every modified assertion red at base (readme 1 fail, weekly-show synopsis count fail, set-builder's two `readdir` lists fail); `set-builder-edit.test.ts` fails to import (`edit-set.ts` and `recipe.ts` do not exist at base) |
| Finding 1, copied folder | `node docs/reviews/setlist-controller-13/repro/edit-repros.ts` (F1 block) | holds: exit 0, original folder replaced, copy unchanged |
| Finding 2, Backup folder | same script, F3 block | holds: `Backup/` gone after `--add` |
| Finding 3, Eos labels after a failed lights step | `pnpm vitest run --config docs/reviews/setlist-controller-13/repro/vitest.repro.config.ts --maxWorkers=1` | holds: CLAIM and BASE-EQUIVALENT red (`Received: "Trust In God"`), CONTROL green |
| Finding 4, uncaught throw | same script, F2 block | holds: exit 1, 22-line Node stack trace |
| Finding 5, self-swap | same script, F4 block | holds: `+SKIP` gone from song 2 |
| Refactors keep the full build unchanged | finder trace of every removed or reordered line in `lights.ts`, `song-cues.ts`, `set-manifest.ts`, `main.ts` (stem map move), `build-set.ts`; suites above | kept; the one change is the extra `set-recipe.json` file |
| Second opinion item 1 (recorded audio, pre-edit `.als`) | `edit-repros.ts` F3 block extended with `Samples/Recorded/take 1.wav` and a search of the folder for any kept `.als` | holds: `Backup/`, `Samples/` and the pre-edit `.als` all gone, exit 0 |
| Second opinion item 4 (explicit pad key) | `edit-repros.ts` F5 block | holds: exit 0, empty stderr, transitions `{"1":{"type":"pad","key":"A"}}` into a song in D, summary line `... pad in A` |
| Second opinion item 5 (flag grammar) | `node -e` calling `readLocatorFlags` (`live-edits.ts`) and the server's `parseSet` (`src/server/set-parser.ts`) | `Count Off +SKIP (Trust In God)` reads no flag; `Count Off (Trust In God) +SKIP` makes the server's song title `null`; `Verse 1 +SKIP` is served as a section named `Verse 1 +SKIP` |
| `test/propresenter.test.ts` flake (second opinion) | run alone twice, `--maxWorkers=2`, load average under 30 | 385/385 both runs; file untouched by the branch |
| Live's project folder | Ableton Live manual, "Managing Files and Sets" 5.5.1 and 5.7, ableton.com, fetched 2026-11-25 (vendor docs) | recorded audio goes to the project's `Samples/Recorded`, collected files to its `Samples` folder; the page does not describe `Backup/`, which this doc takes from the repo's own `replaceFolder` comment |
| Verbatim locator carry (Nick's decision on open question A) | read `write-set.ts:316-366` (`locatorsFor`, `plainLocator`, `moved`, `numbered`), `timeline.ts:7-50`, `:127-128`, `:222-225`, `als.ts:138-147`; `git grep` for the flag grammar outside `live-edits.ts` | feasible: each song's locators are its library locators moved by its start beat, the transition after it changes only its End region, and nothing outside `live-edits.ts` uses the grammar (finding 9) |
| Playwright E2E | not run | the branch touches no web code |
| Real Ableton Live, real Eos | not run | no Live or console here; the Live side is the `.als` XML the tests read back, the Eos side is `test/fake-eos.ts` |

**Overall:** The recipe, the three edit actions, flag and volume preservation, the chart carry-over and the manifest-watch bump all work as the issue asks, and the suites and the private-terms check are green. Two HIGHs stop the PR: an edit given a copied or renamed set folder silently rewrites the date-named folder beside it (finding 1), and every edit deletes everything of the old set it did not write, the pre-edit `.als`, Live's `Backup/` and any recorded takes, so an edit cannot be undone (finding 2, raised from MEDIUM on the second opinion). The uncaught stack trace (finding 4) belongs in the same round. The stale Eos labels after a failed lights step (finding 3) predate the branch, which widens them. Nick's decision on the flag grammar (2026-11-25) turns the open question into finding 9: an edit carries untouched songs' locators verbatim and parses no flags.

## Approach decisions
- **Which folder an edit writes:** an edit refuses a folder that is not `setFolder(dirname(folder), recipe.date)`. It does not build into an arbitrary folder, because `buildSet` and `lightsStep` both locate the set by date (finding 1).
- **What survives an edit's folder swap:** `replaceFolder` keeps its "nothing of the old set is left" contract for a full `--replace` build. An edit opts in (`carryOver`): every top-level entry of the old folder the new project does not hold is cloned across, and the replaced `.als` is cloned into `Backup/` under a timestamped name, both the way `copyProjectInfo` in `src/set-builder/audio.ts:104` clones. Moving the old folder aside instead was considered and rejected (Second opinion, item 1) (finding 2).
- **Locators of untouched songs (Nick, 2026-11-25):** #13 parses no flags. An edit carries every untouched song's locators exactly as the existing `.als` has them, renamed and added ones included. Only the leading song number changes, and the time shifts by the song's start-beat delta recorded in the recipe. The one song before the edited position takes its End region from the new build. The only name rules #13 applies are the song number (`<n> - `, as `src/server/set-parser.ts` reads it) and the builder's own `End` section name (finding 9).
- **A self-swap:** kept as the one edit that re-reads a song from the library, and announced with a summary warning (finding 5).
- **An explicit pad key across an edit:** the operator's `--pad n=<key>` override is kept, never dropped, and the edit's summary warns when the song after it changed, through the `warnings` argument `summary()` already takes (finding 8).
- **Eos labels across runs:** the recipe records the titles the last successful lights run labelled (`lights.labelled`). Both `edit` and `--lights` pass that as `previousTitles`, and it changes only after a lights run succeeds (finding 3).
- **CLI error surface:** `edit()` catches a throw exactly as `build()` does in `src/set-builder/main.ts:631-634` (finding 4).
- **Atomic JSON writes:** one helper, the one `writeSetManifest` already is (finding 7).
- **A kept set's name taken within the same second (remediation 1):** `keepReplacedSet` never overwrites (`COPY`); on `ERR_FS_CP_EEXIST` it waits for the next second and takes the name again, as `makeWeeklyShow` (`src/set-builder/weekly-show.ts`) does for its timestamped show file. Any other copy error throws with no retry. This overturns finding 2's declared "the second of two edits in one second fails", which failed the suites its own Must preserve names (finding 2).
- **Cleanup after a failed replacing write (remediation 1):** `replaceFolder`'s cleanup on the failure path is best effort, so the error that stopped the write is the one thrown; a hidden sibling that cannot be removed is left behind. The success path's final cleanup is unchanged (finding 2 rework).
- **The boundary song's End region (remediation 1):** on the song before the edited position, `End` and `Pad Out` (the builder's End-region sections, `write-set.ts` `locatorsFor`) take no part in the local-time matching on either side, and the old ones are never carried. Every other old locator is matched or carried as finding 9's brief says (finding 9 and its rework).
- **Edit summary warnings (remediation 1):** `planEdit` returns `warnings`, printed by `summary()` as `build()` prints `planWarnings`. A self-swap gets its own warning and no pad-key warning, since the song after the pad has not changed; a drop that leaves a keyed pad after the new last song says it "now ends the set" (findings 5 and 8).
- **Lights the recipe cannot record (remediation 1):** one message, `LIGHTS_UNRECORDED` in `src/set-builder/edit-set.ts`, used by `--lights` (stderr, exit 1) and by the edit (through `lightsProblem`). `updateRecipe` returns false only for a folder with no recipe and throws otherwise (findings 3 and 6).

## Remediation scope
Remediate all Confirmed findings, 1 to 10 (coordinator, 2026-11-25). Finding 5's warning uses the `warnings` list finding 8 adds, so 8 lands first or in the same commit series. Finding 9 changes `set-recipe.json` (`songs[].start`), which finding 3's `lights.labelled` and #14 build on.

## Confirmed Issues

### 1. An edit given a copied or renamed set folder rewrites a different folder, the date-named one beside it — HIGH
- **Location:** `src/set-builder/edit-set.ts:77-83`, `:105`, `:110-117`; the write site is `src/set-builder/build-set.ts:107`
- **Attribution:** introduced. `edit-set.ts` is a new file in `bc7e96c`.
- **Real-world trigger:** the operator duplicates the set folder in Finder before trying a change (`2026-11-29 Sunday copy`) and runs `pnpm build-set edit "<...> Sunday copy" --drop 2` to try it on the copy. Or a set folder was renamed (`2026-11-29 Sunday - Christmas`) and is edited by path. The edit exits 0 both times. In the copy case, the original set, with its rehearsal edits and its Live backups, is replaced by a set derived from the copy.

**Evidence**
```ts
const folder = resolve(options.folder);
const reading = await readRecipe(folder);
...
const name = setName(recipe.date);
const existingAlsPath = join(folder, `${name}.als`);
...
const outputRoot = dirname(folder);
const built = await buildSet({ ..., date: recipe.date, outputRoot, replace: true, ... });
```
`buildSet` writes to `setFolder(options.outputRoot, options.date)` (`build-set.ts:107`), so the edit reads from `folder` and writes to `<parent>/<setName(date)>`. Nothing checks that the two are the same folder. `lightsStep` (`edit-set.ts:145-155`) also finds the set by date, so it relabels from the other folder too.

**Failure mode** — Executed (`repro/edit-repros.ts`, F1). Built `[Grace, Goodness, Trust]`, copied the folder to `"<folder> copy"`, put `MARKER` in the original, then ran `edit "<copy>" --drop 1`. Result: exit 0. The original lost `MARKER` and now holds `["Goodness of God","Trust In God"]`. The copy still holds all three songs. The operator sees a clean summary and the copy they opened in Live is unchanged.

**Recommended fix**
```ts
import { buildSet, setFolder, setName, type SongSummary, type StemMap, type Transition } from './build-set.ts';
...
  const recipe = reading.recipe;
  const expectedFolder = setFolder(dirname(folder), recipe.date);
  if (folder !== expectedFolder) {
    return { ok: false, problems: [`${folder} is not the set folder for ${recipe.date}, which is ${expectedFolder}. Run build-set edit on that folder.`] };
  }

  const name = setName(recipe.date);
```

**Remediation brief**
- **Design intent:** a built set is identified by its date. `setFolder(outputRoot, date)` names the folder, the `.als` inside it is `setName(date).als`, and `buildSet`, `replaceFolder` and `lightsStep` all find the set that way. An edit may write only the folder it read. A folder whose name does not match its recipe's date is refused, and nothing is written.
- **Full surface:** `src/set-builder/edit-set.ts:76-86` (the check goes straight after the recipe is read, before the `.als` read and before `planEdit`, so a refused edit reads no library). `edit-set.ts:4` gains the `setFolder` import. `main.ts:369-378` (`parseEditArgs` folder resolution) needs no change: both its forms produce a folder the check accepts, the `--date`/`--output-root` form by construction and the `.als` path form via `dirname`.
- **Must preserve:** all three folder forms the edit suite drives in `test/set-builder-edit.test.ts`: a folder path (`edit <folder>`), an `.als` path (`edit <setPath>`, in "adds a song at the end or at --at <pos>"), and `--date ... --output-root ...` ("swaps a song by position or name"). Also the corrupt and missing recipe messages ("fails cleanly when set-recipe.json is missing or corrupt"), which must still come first because they come from `readRecipe`. Declared dropped: editing a folder typed in a letter case other than its own (`... sunday` for `... Sunday`) is now refused with a line naming the right folder. Before, it worked through APFS's case-insensitivity.
- **Do not touch:** `resolveRecipeSong` and the date-or-path argument rules in `parseEditArgs` (Dismissed: "edit uses `dirname(folder)` rather than `recipe.outputRoot`").
- **Proof:** now, `node docs/reviews/setlist-controller-13/repro/edit-repros.ts` prints `HOLDS  F1 ...` (that block expects exit 0 and the original replaced, so after the fix it prints `FAILS  F1`). Add a test to `test/set-builder-edit.test.ts` named `an edit of a copied set folder is refused and changes neither folder`. It builds a set, copies the folder to `"<folder> copy"`, runs `edit "<copy>" --drop 1`, and expects exit 1, stderr naming the date-named folder, and `snapshotFolder` of both folders unchanged. Run it red before the fix and green after with `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

### 2. Every edit deletes everything of the old set it did not write: the pre-edit `.als`, Live's `Backup/`, and recorded or collected audio — HIGH
- **Location:** `src/set-builder/edit-set.ts:117` (`replace: true`), through `src/set-builder/build-set.ts:230-246` (`replaceFolder`)
- **Attribution:** pre-existing, exposed. `git show adee302:src/set-builder/build-set.ts` has `replaceFolder` at line 213, and its comment already says it leaves nothing of the old set ("its audio, a file added by hand, Live's Backup folder"). At base that ran only on a deliberate `--replace` rebuild, which starts a set from scratch. This branch routes every edit through it, while the README promises the edit preserves rehearsal work. Ranked by its new reach: every edit.
- **Real-world trigger:** the operator rehearses, saves in Live, closes the set and runs any `build-set edit`, or a mistaken `--drop`. Re-materializing keeps only flags, track volumes and clip gains, so every other change saved in the `.als` (device settings, automation, a clip fix, a locator added in Live) is gone from the new set. Gone with it are the only copies that could restore it: the pre-edit `.als` itself, Live's backups in `Backup/`, and any take recorded into the set, which Live writes to the project's `Samples/Recorded` (Ableton Live manual, "Managing Files and Sets" 5.5.1), or collected into its `Samples` folder (5.7). A wrong `--drop` cannot be undone: `--add --at` brings the song back with none of its flags. It happens on every edit, with exit 0 and no warning, so this is destroyed user work at HIGH. (Raised from MEDIUM on the second opinion's item 1; the earlier cap treated the loss as the issue's re-materialization design, but the pre-edit `.als` and recorded takes are not part of that design, and keeping them costs a clone.)

**Evidence**
```ts
if (existsSync(folder)) await rename(folder, join(work, 'old'));
await rename(next, folder);
await rm(work, { recursive: true, force: true });
```

**Failure mode** — Executed (`repro/edit-repros.ts`, F3). Built `[Grace, Goodness]`, created `Backup/2026-10-18 Sunday [2026-11-28 101500].als` and `Samples/Recorded/take 1.wav`, then ran `edit <folder> --add trust`. Result: exit 0. The folder holds only `2026-10-18 Sunday.als`, `Ableton Project Info`, `Songs` and `set-recipe.json`, and no copy of the 38,754-byte pre-edit `.als` exists anywhere in it.

**Recommended fix** — in `src/set-builder/weekly-show.ts`, export the existing `saveTime` (`:89`). In `src/set-builder/audio.ts`, beside `copyProjectInfo`:
```ts
export async function carryOver(fromFolder: string, projectFolder: string): Promise<void> {
  for (const name of await readdir(fromFolder)) {
    if (!existsSync(join(projectFolder, name))) await cp(join(fromFolder, name), join(projectFolder, name), { ...COPY, recursive: true });
  }
}

export async function keepReplacedSet(alsPath: string, projectFolder: string, name: string, at: Date): Promise<void> {
  await mkdir(join(projectFolder, 'Backup'), { recursive: true });
  await cp(alsPath, join(projectFolder, 'Backup', `${name} (before edit ${saveTime(at)}).als`), COPY);
}
```
In `src/set-builder/build-set.ts`, add `carryOver?: boolean` to `BuildOptions`. In `writeProject`, after `writeRecipe`:
```ts
    if (options.carryOver === true && existsSync(folder)) {
      await carryOver(folder, into);
      await keepReplacedSet(setPath, into, name, new Date());
    }
```
In `src/set-builder/edit-set.ts`, pass `carryOver: true` in the `buildSet` call.

**Remediation brief**
- **Design intent:** `replaceFolder` writes the whole new project into a hidden sibling and swaps it in only once it is complete. A failure part-way removes the sibling and leaves the old set. A full `--replace` build keeps nothing of the old folder, which is tested and intended. An edit is a change to the same set, so nothing of the old folder that the builder does not itself write is lost: any top-level entry the new project does not hold (`Backup/`, `Samples/`, a file added by hand) is cloned across, and the `.als` being replaced is cloned into `Backup/`, before the swap. Clones are APFS copy-on-write (`COPY` in `audio.ts:74`), so a large `Samples/` costs neither time nor disk.
- **Full surface:** `src/set-builder/weekly-show.ts:88-93` (export `saveTime`); `src/set-builder/audio.ts:1-3` (imports `readdir`, `saveTime`), new `carryOver` and `keepReplacedSet` beside `copyProjectInfo` (~`:100-105`); `src/set-builder/build-set.ts:5` (import), `:59-66` (the `BuildOptions` field), `:134-141` (`writeProject`; `setPath` and `name` are already in scope at `:106-108`); `src/set-builder/edit-set.ts:110-129` (the `buildSet` call).
- **Must preserve:** `test/set-builder.test.ts` "replaces the folder with the new set when the build replaces, so nothing of the old set is left in it" (a full `--replace` keeps nothing: `carryOver` is false there). In `test/set-builder-edit.test.ts`, "drops a song by position or name, removes its audio ..." (`Songs/` exists in the new project, so the old `Songs/` and a dropped song's audio are not carried), and the ten failure cases' `snapshotFolder` equality (a refused edit writes nothing, so nothing is carried). Also the replace path's cleanup: `carryOver` and `keepReplacedSet` run inside `writeProject`, so a failure removes the hidden sibling and the old set stays whole. That error then prints as one line once finding 4 lands. Do not move them outside `writeProject`. Declared: `COPY` refuses to overwrite, so two edits of one set within the same second fail the second edit cleanly with one line; that is accepted.
- **Do not touch:** the `replaceFolder` comment and contract for full builds.
- **Proof:** now, `node docs/reviews/setlist-controller-13/repro/edit-repros.ts` prints `HOLDS  F3 ...`; after the fix it prints `FAILS  F3`. Add two tests to `test/set-builder-edit.test.ts`. The first, `an edit keeps everything of the old set it does not write, and the replaced set in Backup`, builds, writes `Backup/<name>.als` and `Samples/Recorded/take 1.wav` with known bytes, runs `edit <folder> --add trust`, and expects the same bytes at the same paths plus one `Backup/<set name> (before edit *).als` whose bytes equal the pre-edit `.als`. The second covers the failure path, per `test-every-fallback-path`: it makes `Samples/` unreadable (`chmod 000`) and expects exit 1, the set folder's `snapshotFolder` unchanged, and no `.<name> replacing` sibling left in the output root. Red then green with `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

### 3. When the lights step fails during an edit, the later `--lights` retry leaves a stale cue label and gives the new song a copied cue — MEDIUM
- **Location:** `src/set-builder/edit-set.ts:154`; `src/set-builder/main.ts:387-421` (`lights()`, which passes no `previousTitles`); `src/set-builder/recipe.ts:28-32` (`RecipeLights`); matching in `src/set-builder/song-cues.ts:55-61`
- **Attribution:** pre-existing, exposed. At `adee302`, `findSongCues` matches only the `Song N` label and then the title (`git show adee302:src/set-builder/song-cues.ts`, lines 51-56), so a rebuild that changes a song, followed by `--lights`, already ends this way. The repro's BASE-EQUIVALENT case reproduces that at HEAD. The branch adds `previousTitles` to fix it, but only for an edit whose own lights step succeeds. Because `buildSet` writes the new recipe before the lights step runs, a failed lights step leaves the old titles recorded nowhere.
- **Real-world trigger:** the playback Mac runs the edit while the Eos console is off or not in Live (midweek, or before the lighting operator arrives). The edit prints the lights problem and exits 1. Later, with Eos up, the operator runs the obvious recovery, `pnpm build-set --lights`. That exits 0. Capped at MEDIUM: the printed lines do show the copied cue, so the result is not fully silent.

**Evidence**
```ts
      playlist: recipe.lights.playlist,
      previousTitles: recipe.songs.map((song) => song.title),
```
(`edit-set.ts:153-154`, the recipe being replaced). The `lightsStep` call in `lights()` at `main.ts:398-407` has no `previousTitles`.

**Failure mode** — Executed (`repro/lights-retry-after-failed-edit.test.ts`, CLAIM). Built `[This Is Amazing Grace, Yes and Amen, Trust In God]`, ran `--lights` (cues 1/11/22 labelled with those titles), then `eos.refuse()`, then `edit --swap 3 "i speak"`. That edit exits 1 with `The lights step is not done: Eos at 127.0.0.1:<port> did not answer.`, and `set-recipe.json` already reads `[..., I Speak Jesus]`. Then `eos.accept()` and `--lights` exits 0 and prints `3. I Speak Jesus  cue 1/12 ...` and `Cue 1/12 (song 3, I Speak Jesus) is a copy of cue 1/11 (song 2, Yes and Amen).` Eos ends with cue 22 still labelled `Trust In God` and a new cue 12. The CONTROL case (the same swap with Eos up) labels cue 22 `I Speak Jesus`.

**Recommended fix**
- `recipe.ts`: `RecipeLights` gains `labelled?: string[]`, the song titles, in set order, that the last successful lights run labelled. `parseRecipe` accepts it when it is an array of non-empty strings and rejects it otherwise, in the style of the existing `lights` checks at `:251-264`.
- `main.ts` `lights()`: before `lightsStep`, read the recipe with `readRecipe(setFolder(outRoot, date))`. Pass `previousTitles: reading.ok ? reading.recipe.lights?.labelled : undefined`. On success, the `updateRecipe` call writes `labelled: <the built set's titles in order>` beside `showFolder`, `connectionsConfig` and `playlist`. The titles come from the recipe's `songs` read after the run, which `lightsStep` labelled from the same built set.
- `edit-set.ts`: pass `previousTitles: recipe.lights.labelled ?? recipe.songs.map((song) => song.title)`. When the lights step succeeds (`run.problem === undefined`), `updateRecipe(built.setPath folder, r => ({ ...r, lights: { ...r.lights!, labelled: built.songs.map((s) => s.title) } }))`. When it fails, leave the `labelled` that `buildSet` carried over through `recipe.lights` unchanged.

**Remediation brief**
- **Design intent:** Eos song cues are positional slots. The template labels them `Song N`, and a lights run relabels slot N with song N's title. To find slot N again after the set changes, the lights step needs the title slot N carries now, which is what the last successful lights run wrote, not what the recipe's song list says. So the recipe records `lights.labelled`, and it changes only when Eos actually took the labels. `buildSet` carries `recipe.lights` across a rebuild unchanged.
- **Full surface:** `src/set-builder/recipe.ts:28-32` (type), `:250-265` (parse); `src/set-builder/main.ts:387-421` (`lights()`: read before, write after); `src/set-builder/edit-set.ts:142-158` (pass, then update on success). `src/set-builder/song-cues.ts` and `src/set-builder/lights.ts` need no change: they already take `previousTitles`.
- **Must preserve:** `test/set-builder-edit.test.ts` "records --lights settings in set-recipe.json and regenerates Eos cues automatically on --swap, --add, and --drop". That test asserts `recipe.lights` with `toEqual({ showFolder, connectionsConfig })`, so it must be updated to include `labelled` deliberately, never loosened. Also the trailing-cue reset after `--drop` (`Song 3` in that test), the `--lights` suite in `test/set-builder-lights.test.ts` for sets with no recipe (`previousTitles` undefined is base behaviour), and the positional matching (Dismissed: "previousTitles aligned by index after --add --at").
- **Do not touch:** `findSongCues`'s order of lookups (template label, previous title, own title).
- **Proof:** `pnpm vitest run --config docs/reviews/setlist-controller-13/repro/vitest.repro.config.ts --maxWorkers=1`. Now CLAIM and BASE-EQUIVALENT are red and CONTROL is green. After the fix CLAIM must be green. BASE-EQUIVALENT stays red, because a full rebuild writes a fresh recipe with no `lights` section; that is pre-existing and out of scope, so record it in the commit. Move the CLAIM case into `test/set-builder-edit.test.ts` as `a --lights retry after an edit whose lights step failed relabels the swapped song's cue`. That case is also the failing-fallback test `test-every-fallback-path` asks for.

### 4. An error inside the edit's rebuild reaches the operator as a Node stack trace — MEDIUM
- **Location:** `src/set-builder/main.ts:282-307` (`edit()`); the throw sites are inside `buildSet`, for example `readAls(template)` in `readInputs`, `checkTransitions`, and any write failure in `replaceFolder`
- **Attribution:** introduced. `edit()` is new in `bc7e96c`. Its sibling `build()` catches at `main.ts:631-634`, and the README says an error during the build prints one line and exits 1.
- **Real-world trigger:** a path the recipe recorded has changed since the build, for example the template inside the library was moved or the library was renamed. Or the disk fills during the clone. Nothing is damaged (`replaceFolder` cleans up on a throw), so this is a display defect, MEDIUM at most. The trace also prints absolute paths from the operator's home folder.

**Evidence**
```ts
async function edit(args: string[]): Promise<void> {
  const { folder, action } = await parseEditArgs(args);
  const result = await editSet({
```
against `build()`:
```ts
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
```

**Failure mode** — Executed (`repro/edit-repros.ts`, F2). After a build, the recipe's `template` was pointed at a moved path and `edit <folder> --drop 3` was run. Result: exit 1, and stderr is a 22-line trace starting `node:internal/fs/promises:1287 ...`.

**Recommended fix**
```ts
async function edit(args: string[]): Promise<void> {
  const { folder, action } = await parseEditArgs(args);
  let result: Awaited<ReturnType<typeof editSet>>;
  try {
    result = await editSet({
      folder,
      action,
      limits: eosLimits(),
      proPresenterTimeoutMs: proPresenterTimeout(),
      proPresenterAgainMs: proPresenterAgain(),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  if (!result.ok) {
```

**Remediation brief**
- **Design intent:** every `build-set` mode reports a problem as one line on stderr and exits 1. A usage error prints the usage text and exits 2. `editSet` returns validation problems as values and lets unexpected errors throw, as `buildSet` does. The CLI layer is where a throw becomes a line, as it is in `build()`.
- **Full surface:** `src/set-builder/main.ts:282-307` only. `parseEditArgs` stays outside the `try`, so its `process.exit(2)` usage path is unchanged.
- **Must preserve:** exit 2 with usage text for argument errors (the `bad --at syntax`, `--at without --add`, `missing --swap replacement` and `multiple edit actions` cases in "fails cleanly with no partial overwrite ..."). Also exit 1 with the problem lines for `result.ok === false`, and the `manifestProblem`/`lightsProblem` lines with exit 1.
- **Do not touch:** `parseRecipe`'s transition checks (Dismissed: "positions not checked against the song count"). With this wrap, a hand-edited recipe's `checkTransitions` throw prints one line, and that is enough.
- **Proof:** now, `node docs/reviews/setlist-controller-13/repro/edit-repros.ts` prints `HOLDS  F2 ...`. Add a test to `test/set-builder-edit.test.ts` named `an edit whose recorded template has moved fails with one line and leaves the set as it was`. It points the recipe's `template` at a missing path, runs `edit <folder> --drop 3`, and expects exit 1, stderr matching the template path, `stderr.trim().split('\n')` of length 1, and the folder's `snapshotFolder` unchanged apart from the hand-edited recipe. Red then green.

### 5. Swapping a song for its own folder silently discards that song's Live locator edits and clip gains — LOW
- **Location:** `src/set-builder/edit-set.ts:184-193` (the swap branch of `planEdit`)
- **Attribution:** introduced (new file).
- **Real-world trigger:** the operator runs `--swap trust trust`, to pick up a library folder that was re-exported or a section added to the library song, or by mistake. It exits 0, and the song's locator edits from Live and its clip gains are gone with no word. Under finding 9 a swap is the one edit that re-reads a song's locators from the library, so a self-swap is a legitimate way to refresh one song. What is wrong is the silence, not the behaviour. LOW.

**Evidence**
```ts
const nextSongs = songs.map((song, index) => (index + 1 === target.position ? { folder: replacement.folder, title: songTitle(replacement.folder) } : song));
const untouched = new Map<number, number>();
for (let position = 1; position <= songs.length; position++) {
  if (position !== target.position) untouched.set(position, position);
}
```

**Failure mode** — Executed (`repro/edit-repros.ts`, F4). Put `+SKIP` on `2 - Verse 1`, ran `edit <folder> --swap 2 trust` (the same folder), and got exit 0 with song 2's locators exactly as the library has them and nothing in the output saying so.

**Recommended fix** — keep the self-swap and announce it. In the swap branch, after `replacement` is resolved:
```ts
    const warnings = replacement.folder === songs[target.position - 1]!.folder
      ? [`Song ${target.position} is rebuilt from ${replacement.folder} in the library, so its locators and clip gains start as the library has them.`]
      : [];
```
and return `warnings` with the plan, through the `warnings` list finding 8 adds (merged with any pad-key warning for the same edit).

**Remediation brief**
- **Design intent:** an edit names exactly one song as touched, and that song starts as the library has it. Every other song keeps the operator's locators (finding 9), track volumes and clip gains. A swap of a song for its own folder is the edit's way to re-read one song from the library. It stays allowed, and the summary says what it discarded.
- **Full surface:** `src/set-builder/edit-set.ts:184-193`; the `warnings` plumbing from finding 8 (`PlannedEdit`, `EditResult`, `edit()` in `main.ts:298`).
- **Must preserve:** "Replacement song 2 must NOT inherit old song 2's +SKIP flag" in the Live-edits test (a swap to a different folder starts clean, with no warning). The self-swap still rebuilds the song (it is not refused).
- **Do not touch:** the add and drop `untouched` maps.
- **Proof:** add `swapping a song for its own folder rebuilds it from the library and says so` to `test/set-builder-edit.test.ts`. It renames a locator of song 2 in the built `.als`, runs `edit <folder> --swap 2 trust` on a set whose song 2 is Trust In God, and expects exit 0, the summary to contain `Song 2 is rebuilt from Trust In God-CAN YOU IMAGINE--A-74.00bpm in the library`, and song 2's locator names equal to the library's (the renamed one absent). Red then green with `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

### 6. `--lights` swallows a failure to record its settings in the recipe, and the path has no test — LOW
- **Location:** `src/set-builder/main.ts:410-419`; `src/set-builder/recipe.ts:154-163` (`updateRecipe`)
- **Attribution:** introduced (`git log -S'updateRecipe' adee302..HEAD` is `bc7e96c` only).
- **Real-world trigger:** `--lights` on a set whose `set-recipe.json` is unreadable or hand-broken, or a failed write. Lights succeeds and exits 0, the recipe gains no `lights` section, and every later edit quietly skips Eos. Rare, so LOW. It also breaks `test-every-fallback-path` (`git grep updateRecipe -- test` finds nothing).

**Evidence**
```ts
    await updateRecipe(setFolder(outRoot, date), (recipe) => ({ ... })).catch(() => {});
```
```ts
  if (!existsSync(path)) return false;
  const reading = await readRecipe(folder);
  if (!reading.ok) return false;
```

**Failure mode** — By reading: the catch discards the write error, and `updateRecipe` reports an invalid recipe the same way it reports a missing one (`false`), which the caller ignores.

**Recommended fix**
- `recipe.ts` `updateRecipe`: keep `return false` for a missing recipe (a set built before this change, which `edit` already refuses with "Rebuild the set first"). Throw `new Error(reading.problem)` for an invalid one, and let a write error throw. Its comment becomes `Returns false when the folder holds no recipe. A recipe that does not parse, or a write that fails, throws.`
- `main.ts` `lights()`: replace `.catch(() => {})` with `.catch((error) => { console.error(`The lights are done, but the set's recipe cannot record them, so build-set edit will not relabel the cues: ${oneLine(error)}`); process.exitCode = 1; })`.

**Remediation brief**
- **Design intent:** the recipe's `lights` section is the only way an edit knows to regenerate Eos cues. Failing to record it is a problem the operator must see, reported as one line on stderr with exit 1, the way the build reports an unwritten set manifest (`main.ts` comment at the `writeSetManifest` call in `build()`). A set with no recipe at all is not a problem for `--lights`.
- **Full surface:** `src/set-builder/recipe.ts:154-163`; `src/set-builder/main.ts:410-419`. Finding 3's fix calls `updateRecipe` from `edit-set.ts` too, and that call follows the same rule, reported through `lightsProblem`.
- **Must preserve:** `--lights` on a set with no recipe exits 0 with no extra line (all of `test/set-builder-lights.test.ts`, whose sets predate recipes only when built by hand). The success path that records `lights` ("records --lights settings in set-recipe.json ...").
- **Do not touch:** nothing adjacent.
- **Proof:** add `--lights on a set whose recipe does not parse says the cues will not follow an edit, and exits 1` to `test/set-builder-edit.test.ts`. It builds, writes `{ invalid` to the recipe, runs `--lights` against the fake Eos as the existing lights test does, and expects exit 1 with stderr matching `cannot record them`. Add a no-recipe case expecting exit 0 and empty stderr. Red then green.

### 7. `writeRecipe` is a line-for-line copy of `writeSetManifest` — LOW
- **Location:** `src/set-builder/recipe.ts:125-137` against `src/set-builder/set-manifest.ts:33-44`
- **Attribution:** introduced.
- **Real-world trigger:** none for users. It breaks `nearest-in-repo-precedent`: the repo now holds two atomic JSON writers, and a later fix to one (for example an `fsync` before the rename) misses the other.

**Evidence** — both bodies are `mkdir(dirname)`, `.${basename}.${process.pid}.partial`, `writeFile(JSON.stringify(value, null, 2) + '\n')`, `rename`, `rm` on failure, rethrow.

**Recommended fix** — move the body into `export async function writeJsonAtomic(path: string, value: unknown): Promise<void>` in `src/set-builder/set-manifest.ts`. `writeSetManifest` and `writeRecipe` both become one-line calls to it, and `recipe.ts` imports it.

**Remediation brief**
- **Design intent:** a JSON file another process reads (the server watches `set-manifest.json`, and `edit` reads `set-recipe.json`) is written to a hidden sibling and renamed into place, so a reader never sees half a file.
- **Full surface:** `src/set-builder/set-manifest.ts:33-44`; `src/set-builder/recipe.ts:1-3` (imports), `:125-137`.
- **Must preserve:** the partial name pattern `.<file>.<pid>.partial` and the cleanup on failure. Tests pin both: the manifest-watch rig tests in `test/set-builder-edit.test.ts` ("bumps chartRevision ...") and the set-manifest tests in `test/set-builder-charts.test.ts`.
- **Do not touch:** the five per-module `oneLine` copies (Minor / nits). The repo's precedent is one per module.
- **Proof:** a refactor with no behaviour change. `pnpm vitest run test/set-builder-edit.test.ts test/set-builder-charts.test.ts --maxWorkers=2` stays green.

### 8. An explicit pad key stays when an edit changes the song the pad leads into, and nothing says so — LOW
- **Location:** `src/set-builder/edit-set.ts:193` (swap keeps every transition), `:206-211` (add), `:226-235` (drop keeps the transition before the dropped song)
- **Attribution:** introduced (new file).
- **Real-world trigger:** the operator built with `--pad 1=A`, which the usage text calls an override ("`--pad n=<key>` gives the pad its own key instead", `main.ts:84`), and then swaps or drops the song after that pad. The pad keeps A into a song in D, an audible clash if nobody notices. Plan builds never set an explicit key (`plan-transitions.ts:7`: a plan's pad takes "the key a --pad without one takes"), so only a hand-given override reaches this, and the summary's line shows `pad in A`. LOW.

**Evidence**
```ts
    return { ok: true, songs: nextSongs, transitions: { ...transitions }, untouched };
```

**Failure mode** — Executed (`repro/edit-repros.ts`, F5). Built `[goodness (A), trust (A), grace]` with `--pad 1=A`, then ran `edit <folder> --swap 2 "great are"` (D). Result: exit 0, empty stderr, recipe transitions `{"1":{"type":"pad","key":"A"}}`, and summary line `1. Goodness of God  bar 1  63 BPM  4/4  pad in A`.

**Recommended fix** — keep the override, which is the operator's explicit choice, and say so. `planEdit` returns `warnings: string[]` alongside `songs`. When the transition before the song the edit newly placed is `{ type: 'pad', key }` (swap: at `target.position - 1`; add: at `at - 1`; drop: at `target.position - 1`, which now leads into the song after the dropped one), it pushes `` `The pad after song ${n} keeps its own key, ${key}, and now leads into ${title}.` ``. `EditResult`'s ok branch gains `warnings`, and `edit()` in `main.ts` passes them to `summary()` in place of `[]`, as `build()` passes `planWarnings`.

**Remediation brief**
- **Design intent:** a keyless pad follows the key of the song after it, and an explicit key is the operator's override that the builder never second-guesses. An edit that changes which song a pad leads into keeps the override and tells the operator, through the summary's existing warnings, so they can rebuild with a keyless `--pad` if the override no longer applies.
- **Full surface:** `src/set-builder/edit-set.ts:38-48` (`EditResult`), `:171-242` (`PlannedEdit` and the three branches of `planEdit`), `:160-168` (return); `src/set-builder/main.ts:282-307` (`edit()`, the `summary(..., [], ...)` call at `:298`).
- **Must preserve:** "swaps a song by position or name, updates audio, pad key, manifest, and recipe" (a keyless pad still follows to D with no warning), and the exact summary lines asserted in "adds a song at the end or at --at <pos>, shifting transitions cleanly" (no explicit key there, so no warning).
- **Do not touch:** the transition re-indexing in the add and drop branches. Finding 9 does not change this finding: the pad locator of the song before the edited position keeps the operator's name (it sits at the same local time), and the pad's key is a transition setting, not a locator.
- **Proof:** now, `node docs/reviews/setlist-controller-13/repro/edit-repros.ts` prints `HOLDS  F5 ...` with no warning in the summary. Add `an edit that changes the song after an explicit-key pad says the pad keeps its key` to `test/set-builder-edit.test.ts`, with the F5 set-up, expecting the summary to contain `The pad after song 1 keeps its own key, A, and now leads into Great Are You Lord.` and the recipe still holding key A. Red then green.

### 9. The edit reads an undefined flag grammar out of locator names, and silently drops every other change the operator made to an untouched song's locators — MEDIUM
- **Location:** `src/set-builder/live-edits.ts:11-66` (the grammar: `PlannedLoop`, `JumpTarget`, `SectionFlags`, `JUMP_FLAG`, `OCCURRENCE`, `PLUS_FLAG`, `readLocatorFlags`, `withLocatorFlags`, `hasAnyFlag`), `:85-101` (extraction), `:129-145` (reapply); `src/set-builder/edit-set.ts:110-129`; `src/set-builder/build-set.ts:118-120`
- **Attribution:** introduced. `live-edits.ts` is a new file in `bc7e96c`, and `git grep` finds no use of the grammar outside it.
- **Decision (Nick, 2026-11-25):** the flags come from the AbleSet parity list in the vault, nothing in this repo consumes them, and their format is defined later, by the guide-and-cues work. #13 must not parse flags. For every untouched song, an edit carries each locator name exactly as the existing `.als` has it, including locators the operator renamed or added in Live. This supersedes the issue's "retain `+SKIP` / `+LOOP` / `>>>` flags" criterion, which verbatim carry meets as a special case. (It was this review's open question A and the second opinion's item 5.)
- **Real-world trigger:** the operator renames a section in Live (`2 - Chorus` to `2 - Chorus (soft)`), adds a locator (`2 - Tag`), writes a flag before the title on a Count Off, or writes `+LOOP:1` or a lowercase `+skip`, and then edits any other song. Exit 0. The rename and the added locator are gone, the mid-name flag is gone, `+LOOP:1` is stripped, and `+skip` comes back as `+SKIP`. MEDIUM: this is operator work on songs the edit says it leaves alone, lost silently on every edit, and recoverable only by retyping.

**Evidence**
```ts
    const flags: SectionFlags = { ...(skip && { skip }), ...(loop && { loop }), ...(jump && { jump }) };
    if (!hasAnyFlag(flags)) continue;
```
(`live-edits.ts:96-97`: a locator whose text holds no recognized flag is not recorded at all.) And the reapply writes only onto the new build's names:
```ts
    const baseName = parsed[2];
    ...
    setValue(locator, ['Name'], `${newSongNumber} - ${withLocatorFlags(baseName, flags)}`);
```

**Failure mode** — Executed on 2026-11-25 with `node -e` against `readLocatorFlags` and the server's `parseSet`: `Count Off +SKIP (Trust In God)` reads as no flag, and `Verse 1 +SKIP` is served to band pages as a section named `Verse 1 +SKIP`, since nothing consumes the grammar. By reading: a renamed or added locator without a flag shape is skipped at `:97`, so the new build's library name stands in its place, or nothing stands for an added one.

**Feasibility of verbatim carry** (read on 2026-11-25):
- `locatorsFor` (`write-set.ts:316-342`) writes each song's locators as its library locators moved by the song's start beat (`PlacedSong.offset`), so within a song they sit at stable local times. Clips are re-placed from the library at the same local times.
- The transition after a song changes only its end region. An overlap drops the locators at or after the Ending and moves the End there (`:328`, `:335`). A pad adds `N - Pad` at its Pad locator, which is the first bar line at or after the song's own audio end (`timeline.ts:127-128`), so it does not depend on the next song. After the last song it also adds `N - Pad Out`. It moves the End to the end of the Pad section, whose length depends on the next song's starting tempo and meter (`timeline.ts:14-18`).
- So a song whose own transition and following song are both unchanged can take its old locators moved by the start-beat delta, renumbered by their leading digits only. Only the song just before the edited position needs the new End region.
- The server's first-locator title parse (`set-parser.ts:7`) reads the text after the number, which verbatim carry leaves as it was. Executed: `1 - Count Off (Trust In God)` parses with title `Trust In God`, and renumbering changes only the digits.

**Recommended fix**
- `src/set-builder/recipe.ts`: `RecipeSong` gains `start: number`, the song's start beat in the built set. `buildRecipe` writes it from `placed`: in `build-set.ts` the recipe call passes `placed.map(({ song, offset }) => ({ folder: song.folder, title: song.title, start: offset }))`. `parseRecipe` requires it to be a finite number of 0 or more, else it returns the existing `has an invalid song entry in "songs"` problem. The branch is unmerged, so no recipe without it exists to migrate.
- `src/set-builder/live-edits.ts`: delete the grammar (every name listed under Location, and `locatorFlags` in `LiveEdits`). `LiveEdits` gains `locators: Map<number, Element[]>`: a `structuredClone` of every old locator, grouped by the song number `LOCATOR` reads from its name. A locator with no song number is not carried, since the server already warns on it as unparseable.
- `applyLiveEdits(document, edits, { untouched, boundary, oldStarts, placed })`. For each placed song whose number `n` is in `untouched`, let `k = untouched.get(n)` and `delta = placed.offset - oldStarts.get(k)`:
  - When the old set holds no locator for `k`, keep the new build's locators for `n`.
  - When `n` is not in `boundary`, remove the new build's locators for `n` and insert each old locator of `k`, with `Time` set to the old time plus `delta`, `Name` set to `oldName.replace(/^(\s*)\d+/, `$1${n}`)`, and every other child as the old element has it.
  - When `n` is in `boundary`, keep the new build's locators for `n`. For each one, if an unused old locator of `k` sits at the same local time (within the `1e-4` epsilon `songAtBeat` already uses), put that old element in its place, renumbered and re-timed. Then add every remaining old locator of `k` whose local time is before the new End's local time and whose section (the text after the number and separator) is not `End`.
  - Sort the whole list by time and renumber Ids from 0: export `numbered` from `write-set.ts:363` and use it with `byTime` and `replaceListItems`, as `writeSet` does at `:35-36`.
- `src/set-builder/edit-set.ts`: `planEdit` also returns `boundary: Set<number>`. For a swap of `t`, that is `{t - 1}` when `t > 1`. For an add at `a`, `{a - 1}` when `a > 1`. For a drop of `p`, `{p - 1}` when `p > 1`. `editSet` passes `boundary` and `oldStarts` (from `recipe.songs[k - 1].start`), and `buildSet` passes its `placed` to `applyLiveEdits`.

**Remediation brief**
- **Design intent:** once a set is built, its locators belong to the operator. An edit owns only the touched song and the End region of the song before it. Every other song's locators are the operator's, carried byte-for-byte apart from the leading song number and the start-beat shift. No code in #13 reads meaning out of a locator name beyond its song number (the `<n> - ` rule `set-parser.ts` uses) and the builder's own `End` section name (`timeline.ts:222-225`). The flag format belongs to the later guide-and-cues work.
- **Full surface:** `src/set-builder/live-edits.ts` (the whole file: grammar removed, extraction and application rewritten; the clip-volume code at `:151-234` stays, because it reads song numbers only); `src/set-builder/build-set.ts:62-66` (the `liveEdits` option type), `:115-131` (the `applyLiveEdits` call gets `placed`, and recipe songs get `start`); `src/set-builder/recipe.ts:16-21`, `:91`, `:100-107`, `:205-222`; `src/set-builder/edit-set.ts:110-129`, `:171-242`; `src/set-builder/write-set.ts:362-366` (export `numbered`); `README.md:157` ("to preserve `+SKIP`, `+LOOP`, and `>>>` locator flags and track mixer volumes on untouched songs" becomes "to carry every untouched song's locators as Live has them, renamed and added ones included, and its track mixer volumes"); and in `test/set-builder-edit.test.ts`, the recipe `toEqual` at `:165-178`, whose songs gain `start`.
- **Must preserve:** track volumes, the main volume and clip gains (the same test); the touched song starting with the library's locators ("Replacement song 2 must NOT inherit old song 2's +SKIP flag"); every carried name parsing on the server (assert `parseSet(locatorList(root)).warnings` is empty after each edit, as the swap test does); and a refused edit writing nothing (the ten failure cases). Declared dropped: letter-case normalization (`+skip` stays `+skip`); `+LOOP:1` stripping; and the regeneration of an untouched song's locators from the library, so a section added to a library song's `.als` after the build reaches the set only through a swap of that song (finding 5) or a rebuild. Declared kept: a locator the operator moved in Live keeps its moved local time. Declared: on the boundary song, a locator the operator deleted in Live comes back under the builder's name, and one the operator moved there may appear twice.
- **Failure of the fix itself:** a recipe without `start` is refused by `parseRecipe` before anything is read or written. An old song with no locators keeps the new build's (above), so the server still finds an End. An old set whose operator deleted a song's End carries that deletion, and the server's `missing-end` warning names it.
- **Do not touch:** the clip-volume keys (Dismissed: "Clip gains re-keyed after an add or drop") and the track-volume maps.
- **Proof:** rename the test "preserves +SKIP, +LOOP, >>> locator flags, track mixer volumes, and clip gains on untouched songs across --swap, --add, and --drop" to "carries every untouched song's locators as Live has them, and its volumes and clip gains, across --swap, --add, and --drop". Extend its `mutateAlsXml` step with four changes to locators taken from the built set's `locatorList`: one section renamed with no flag shape (`<name> (soft)`), song 3's Count Off renamed with a flag before its title (`Count Off +skip (<title>)`), one `+LOOP:1`, and one added locator (a copy of a song 1 locator, renamed `1 - Tag`, at a beat inside song 1). After each edit, assert that every carried name is present exactly (renumbered), and that `parseSet` gives song 3 its title. Add a boundary test, `the song before a dropped last song keeps its renamed sections and gets back the sections its overlap had cut`. Build `grace`, `great are`, `goodness` with `--overlap 2`, rename a song 2 section before its Ending, and run `--drop 3`. Expect song 2 to keep the renamed section, to get its locators after the Ending and its own End back under the builder's names, and empty `parseSet` warnings. Both are red at HEAD (the renamed and added names are dropped) and green after: `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

### 10. Comment hygiene — LOW (aggregated)
- `src/set-builder/build-set.ts:133-134` — "and the set is written last, once every file it refers to is in place." → "and the set is written once every file it refers to is in place, then the recipe beside it."
- `src/set-builder/song-cues.ts:10-13` — the lookup order names only the `Song N` label, then the title → insert the middle step: "with none, the first cue no earlier song took whose label is the title the song at the same position had when the cues were last labelled (`previousTitles`)". Then add a sentence: "With `previousTitles` longer than the set, each cue still labelled with a title past the new end goes back to its `Song N` label (`reset`)."
- `src/set-builder/lights.ts:198-201` — "the cue with the song cue label for the song, or the one a run before this one labelled with its title" → "the cue with the song cue label for the song, or the one labelled with the previous title at its position, or the one a run before this one labelled with its title".
- `src/set-builder/edit-set.ts:14` — "modifies a single song in an already-built set" → "changes one song of an already-built set (swaps, adds or drops it)".
- `src/set-builder/edit-set.ts:219` — `// Drop.` → delete.
- `src/set-builder/main.ts:279-281` — restates the `edit-set.ts` header → delete.
- `src/set-builder/recipe.ts:13` — "Default path to config/stem-map.json in this repository." → delete.
- `src/set-builder/recipe.ts:72-73` — "(e.g. a programmatic buildSet call in tests)" → "(a buildSet call that names no stem map file)".
- `src/set-builder/recipe.ts:139` — "Reads and validates `<folder>/set-recipe.json`." → delete.
- `src/set-builder/recipe.ts:312` — `stemMapShape` lost the comment it had in `main.ts` at base, which stated its error order → restore: "The parsed stem map, once its top level is a plain object and each group's value is a list of stem names. A top level that is anything else throws one line that names the file and says what the top level is instead; then a group whose value is not a list of strings throws one line that names the file and every such group, in map order."
- `test/set-builder-edit.test.ts:391` — "Clip SampleVolume on Song 1's Piano clip and Song 2's Piano clip" → "Clip SampleVolume on Song 1's Piano clip".
- (`src/set-builder/recipe.ts:154-155`, the `updateRecipe` return comment, is rewritten by finding 6, and every comment in `src/set-builder/live-edits.ts`, the `edit-set.ts:15` and `README.md:157` mentions of flags included, is rewritten by finding 9, not here.)

## Needs Further Investigation
None open. Open question A (the flag grammar) was decided by Nick on 2026-11-25 and is now finding 9.

## Reviewed and Dismissed
- **Eos `previousTitles` matched by index after `--add --at 1`** (finder) — song cues are positional slots labelled `Song N`, so matching slot N by the title it had is what moves each slot to its new song. The lights edit test asserts the drop and add cases.
- **`stemMapPath` recorded as this checkout's absolute path** (finder) — `docs/install.md:5` requires "a clone of this repository in a folder that will not move". A missing path fails as one clean line (`readStemMapFile` throws inside the `try` at `edit-set.ts:99-103`). Re-reading the map on each edit is what #14's change to `stem-map.json` needs.
- **The `lights.ts`, `song-cues.ts`, `set-manifest.ts` and stem-map refactors** — every removed or reordered line was traced: `previousTitles` is optional and absent on the full build path, `reset` is empty then, the `unlabelled` strings are the same text, `buildManifest`'s parameter only widened, and the stem-map messages keep their `config/stem-map.json` prefixes. The set-builder, weekly-show, charts and lights suites are green.
- **The manifest and lights are written after the folder swap, not with it** — this mirrors `build()`, and both report a failure as one line with exit 1. Validation failures write nothing: the edit suite snapshots the folder and the manifest for ten cases.
- **`planWarnings`/`chartWarnings` not run on edit** — they judge Planning Center data, and the edit is offline by design (the issue's "without ... reaching Planning Center").
- **`parseRecipe` accepts transition positions past the song count** — reachable only by a hand-edited recipe, and finding 4 turns its throw into one line.
- **Relative paths in a hand-edited recipe** — the recipe is always written with absolute paths (`buildRecipe` resolves each one).
- **`edit` uses `dirname(folder)` rather than `recipe.outputRoot`** — following the folder actually given is right. The defect is the missing same-folder check (finding 1), not this choice.
- **Clip gains re-keyed after an add or drop** — the keys are `Songs/<title>/<stem>.wav` paths plus an occurrence count per song number. Titles do not move with positions, so the keys survive shifts. The gap is test coverage (Test quality).
- **An edit rewrites the recorded manifest even when another set is open in Live** — this mirrors the build's last-write-wins, and the documented flow is close, edit, reopen.
- **`test/readme.test.ts`'s new flags** — it compares flag lists with the usage output, so it is not a copy test.
- **`test/propresenter.test.ts` "names a file that is not valid JSON as one problem, and the cues use the even split" (second opinion: failed 1 of 2 runs alone)** — a pre-existing flake under load: the branch does not touch the file (`git log adee302..HEAD -- test/propresenter.test.ts` is empty), it passes 385/385 twice alone here at a low load, and `docs/reviews/setlist-controller-604/pre-pr-review-3.md` recorded the same test (`:6000`) timing out on its 2 s read under load.
- **`test/set-builder-plan.test.ts` timeouts in the full run** — machine load (average above 200). At HEAD it passes 68/68 twice with a 30 s timeout, at 1.4 to 2.3 s per test, and base took 4.7 s under the same load.

## Minor / nits
- `--swap=<song>` is refused as an unknown option, while `--add=`, `--drop=`, `--at=`, `--date=` and `--output-root=` are accepted (`main.ts:325-366`).
- `process.argv[2] === 'edit'` (`main.ts:253`) takes over a build whose first song query is literally `edit`.
- A folder that does not exist reports `No set-recipe.json found in <folder>. Rebuild the set first ...` rather than saying the folder is not there (`recipe.ts:142-144`).
- Recorded but never read: the top-level `outputRoot` and `showFolder` (edit uses `dirname(folder)` and `lights.showFolder`). `plan` records the flags, `serviceType` defaulting to `Service`, not the plan id that was resolved.
- `oneLine` now exists in five modules (`edit-set.ts`, `recipe.ts`, `main.ts`, `lights.ts`, `src/server/slide-timing.ts`). This follows the repo's per-module precedent, so it is noted only.
- Edit tests: the negative check at `test/set-builder-edit.test.ts:693-696` sleeps a fixed 350 ms; ten cases share one `it` at `:569-588`; "fails cleanly when set-recipe.json is missing or corrupt" does not snapshot the folder.

## Test quality
Tests added: 13 in `test/set-builder-edit.test.ts`, plus assertion changes in `test/set-builder.test.ts` (2), `test/set-builder-weekly-show.test.ts` (1) and `test/readme.test.ts` (1).
- **Green against `adee302`:** 0. The new file fails to import there, and each modified assertion fails there (scratch-worktree run).
- **Tautology shapes found:** 0. Expectations are written out or read back from the built `.als` through the harness's own `parse-xml`, the recipe JSON, the manifest, the fake Eos and the rig. No unit under test is mocked.
- **Strengthen:** the Live-edits test (renamed by finding 9) asserts clip gain only after the swap. Add the Piano clip's `0.77` after the drop and after `--add --at 1` (Goodness moves to song 2), or narrow the name. The by-name fallback for track volumes (`trackVolumesByName`) is never reached, because the template's track Ids are stable. Either cover it with a template whose Ids change, or delete the fallback as unreachable.
- **New tests the findings require:** findings 1 to 6, 8 and 9 each name theirs. Findings 2, 3 and 6 add the failing-path tests `test-every-fallback-path` requires.

## #14 readiness (`build-set edit --key`)
Nothing here blocks #14, but #14 should plan for these:
- `RecipeSong` has no per-song key or transpose slot. `parseRecipe` rebuilds each song from a fixed field list, so a field #14 adds under `version: 1` is stripped silently by any checkout without #14 that edits the set. Bump to `version: 2`; the reader already rejects other versions.
- `BuildOptions.songs` is `string[]`, with charts as an index-matched side array. A per-song transpose needs `songs` widened to objects, not a third parallel array.
- The key-changed song is the touched one, so under the `untouched` map it starts from the library, as a swap does (finding 5). A native-folder swap must do that. A pitch-shift fallback keeps the same folder, and pitch moves no locator, so #14 can treat that song as untouched for locators under finding 9's verbatim carry (`boundary` stays as finding 9 sets it). Decide in #14.
- Finding 9 adds `songs[].start` to the recipe. A native-folder key swap changes the song's length, so #14 must recompute `start` through `buildSet`'s `placed`, never copy it forward.
- Explicit pad keys are stored (`{ type: 'pad', key }`). A `--key` change leaves an override in place, as finding 8 does for swaps; #14 should reuse finding 8's warning rather than invent a second rule. Keyless pads follow on their own.
- `stemMapShape` rejects any group value that is not a list of strings. #14's non-pitched marking in `stem-map.json` must extend it, and it also validates the recipe's inline `stemMap`.

## Second opinion
An independent review of the same branch by Opus 5.5 in a separate thread, folded in on 2026-11-25. Each item went through the disprove step here before it was placed.

| Item | Their claim | Their rating | Verdict here | Where it lives now |
| --- | --- | --- | --- | --- |
| 1 | `replaceFolder` deletes the whole old project: `Backup/`, recorded or collected audio, the previous `.als`; a wrong `--drop` has no undo | HIGH | Confirmed by execution (F3 extended) | finding 2, raised to HIGH |
| 2 | lights run after the `.als` and manifest are replaced, and the recipe already holds the new songs, so the next `previousTitles` miss Eos's labels | MEDIUM | Confirmed by execution (lights repro); same defect as finding 3 | finding 3, MEDIUM |
| 3 | a folder name that is not `setName(date)` makes edit write a different folder | MEDIUM | Confirmed by execution (F1) | finding 1, HIGH |
| 4 | an explicit pad key survives when the song after the pad changes | MEDIUM | Confirmed by execution (F5) | finding 8, LOW |
| 5 | the flag grammar is invented: only trailing flags match; a flag before `(Title)` is dropped, one after it breaks the server's title parse; renamed or added locators lose flags silently | LOW | executed in part; held open, then Confirmed after Nick's decision (2026-11-25) that #13 parses no flags | finding 9, MEDIUM |
| flake | `test/propresenter.test.ts` "names a file that is not valid JSON ..." failed 1 of 2 runs alone | n/a | agree: pre-existing flake under load | Reviewed and Dismissed |

- **Item 1:** AGREE on HIGH. This review had `Backup/` alone at MEDIUM, capped as the issue's re-materialization design. The pre-edit `.als` and recorded takes settle it: they are not part of that design, every edit deletes them with exit 0, and the README promises the edit preserves rehearsal work. The attribution here is pre-existing, exposed. AGREE with keeping the old `.als` and carrying across what the builder did not write. DISAGREE with their alternative of moving the old folder aside instead: that leaves one full stale set folder per edit beside the sets in the output root, rather than the backup inside the project where Live keeps its own.
- **Item 2:** AGREE on MEDIUM and on the defect. Attribution here: pre-existing, exposed (a base rebuild followed by `--lights` ends the same way, executed). DISAGREE on the fix, a read-only Eos pre-flight before the folder swap. It would refuse every edit while the console is off, turning an edit that works offline (the issue: no Planning Center needed) into one that needs the lighting desk. And it still races: Eos can pass the pre-flight and then fail during the write (the Live check, the ProPresenter read). The doc keeps `lights.labelled`, which makes the failure recoverable instead of trying to prevent it.
- **Item 3:** DISAGREE on severity: held at HIGH. The edit exits 0 with no warning and replaces the original set, with its rehearsal edits and, through finding 2, its backups, after a natural operator action: duplicating a set folder in Finder before trying a change, then editing the copy. That is destroyed user work with a plausible path, which the rubric puts at HIGH.
- **Item 4:** DISAGREE on severity: LOW, not MEDIUM. `--pad n=<key>` is documented as the operator's own override (`main.ts:84`), plan builds never produce one (`plan-transitions.ts:7`), and the edit's summary prints `pad in A` on that song's line. DISAGREE on "drop the key", which would silently discard an explicit choice. AGREE with "or warn", which is finding 8's fix.
- **Item 5:** Now Confirmed as finding 9, after Nick's decision of 2026-11-25. Before that decision this review held it open, because nothing in the repo specified the grammar. DISAGREE on severity: MEDIUM, not LOW. Under the decided requirement the defect is not only the dropped flags; every rename and added locator on an untouched song is lost silently on every edit. The server's title loss on `Count Off (Title) +SKIP` is not an edit defect: verbatim carry keeps whatever the operator typed, and the format belongs to the guide-and-cues work.
- **Flake:** AGREE: pre-existing, in a file the branch does not touch, 385/385 twice alone here.

## Before opening the PR
- **CI readiness:** typecheck, lint and the branch's suites pass. The full suite's only failures are load timeouts in untouched files (Dismissed). Re-run the together check from `docs/merge-rules.md` once findings land.
- **Commit hygiene:** the tree was clean at review. This doc and `docs/reviews/setlist-controller-13/repro/` (`edit-repros.ts`, `lights-retry-after-failed-edit.test.ts`, `vitest.repro.config.ts`) are new and untracked. `repro/` sits outside the suite's `test/**/*.test.ts` include. Run `pnpm check:private` (origin/main's script) over the range again after remediation, and over the PR body before opening.
- **Likely reviewer asks:** what an edit drops besides the untouched songs' locators and volumes (state it in the README beside the preservation sentence, as finding 9 rewrites it), and whether `Backup/`, recorded takes and the pre-edit `.als` survive (finding 2).

## Verdict
**Not ready.** Gate: findings 1 and 2 (both HIGH: an edit can replace the wrong set folder, and every edit deletes the pre-edit set, its backups and recorded takes) must be fixed before the PR opens. Findings 4 and 9 belong in the same round; finding 9 is the decided requirement for what an edit keeps. Remediation scope is every Confirmed finding (1 to 10); finding 3 is pre-existing but in scope, and its `lights.labelled` should be settled before #14 adds its own lights path.

## Remediation, 2026-11-25
Round from HEAD `bc7e96c`, final HEAD `ec9cb7f`. Proof commands run from the repo root; `E` below is `pnpm vitest run test/set-builder-edit.test.ts --maxWorkers=2`.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (HIGH) | `619051f` an edit of a copied or renamed set folder rewrote the date-named folder beside it | red then green: `E`, "an edit of a copied set folder is refused and changes neither folder"; `repro/edit-repros.ts` now prints `FAILS F1` | 0 | fixed (agent) |
| 2 (HIGH) | `30bbaca` every edit deleted everything of the old set it did not write; rework `b377159` | red then green: `E`, "an edit keeps everything of the old set it does not write, and the replaced set in Backup", "an edit that cannot carry the old set across fails ...", "keeps a second replaced set from the same second ...", "keeping the replaced set throws what the disk throws ...", rework: "an edit that cannot keep the replaced set in a read-only Backup ..."; `repro/edit-repros.ts` prints `FAILS F3` | 1 (the `carryOver` field in `BuildOptions`) | fixed, introduced 1 (cleanup error masked the cause on a read-only Backup), reworked; re-verify: fixed, nothing introduced |
| 4 (MEDIUM) | `79dec23` an error inside the edit's rebuild reached the operator as a Node stack trace | red (21 lines) then green: `E`, "an edit whose recorded template has moved fails with one line ..."; repro prints `FAILS F2` | 0 | proved by execution |
| 9 (MEDIUM) | `7f2e4e6` the edit read an undefined flag grammar and dropped other locator changes; rework `ec9cb7f` | red then green: `E`, "carries every untouched song's locators as Live has them ...", "the song before a dropped last song keeps its renamed sections ...", rework: "a song added after a pad that ended the set leaves no Pad Out ..." | 13 comments (20 lines): rewrites of the existing `live-edits.ts`, `edit-set.ts` and `BuildOptions` comments, field units and directions, and the no-flag-parsing decision | fixed, introduced 1 (stale `Pad Out` after an add at the end), reworked; re-verify: fixed, nothing introduced |
| 8 (LOW) | `90495fc` an explicit pad key stayed when the song after the pad changed, silently | red then green: `E`, "an edit that changes the song after an explicit-key pad says the pad keeps its key" | 0 | proved by execution |
| 5 (LOW) | `a64530b` a self-swap silently discarded the song's locator edits and clip gains | red then green: `E`, "swapping a song for its own folder rebuilds it from the library and says so" | 0 | proved by execution |
| 3 (MEDIUM) | `0fd5211` a `--lights` retry after an edit whose lights step failed left a stale label and copied a cue | red then green: `E`, "a --lights retry after an edit whose lights step failed relabels the swapped song's cue"; `pnpm vitest run --config docs/reviews/setlist-controller-13/repro/vitest.repro.config.ts --maxWorkers=1`: CLAIM and CONTROL green, BASE-EQUIVALENT red (pre-existing, out of scope, as the brief says) | 1 (the `labelled` field) | proved by execution |
| 6 (LOW) | `c52603b` `--lights` swallowed a failure to record its settings | red then green: `E`, "--lights on a set whose recipe does not parse ...", "--lights on a set with no recipe ..." (green before and after), "an edit whose lights step succeeds but whose recipe cannot record it says so, and exits 1" | 1 (the `updateRecipe` comment, rewritten) | proved by execution |
| 7 (LOW) | `cff614a` `writeRecipe` was a copy of `writeSetManifest` | refactor: `E`, `test/set-builder-charts.test.ts`, `test/set-manifest.test.ts` green (one set-manifest watch test timed out under load average 90, passed 40/40 alone, and does not call either writer) | 1 (the existing writer comment, moved and generalized) | proved by execution |
| 10 (LOW) | `6d3cb0c` comment hygiene | read against the code; the `writeProject` entry also names the carry-over finding 2 added | n/a | n/a |

Suites after the round: `pnpm -s vitest run --maxWorkers=2` 102/102 files, 3312 passed, 4 skipped; `pnpm -s typecheck` and `pnpm -s lint` pass; origin/main's `scripts/check-private-terms.mjs`, copied out and run in this worktree with the private list present, exits 0 with `--range adee302..HEAD` and in tree mode.

### Known regressions, deferred
- On the boundary song after a drop of the last song, a locator added by hand at exactly the new `Pad Out` beat now sits beside the new `Pad Out` (two locators at one time), where before the rework the old one took its place and the `Pad Out` name was lost. Introduced by `ec9cb7f`, verdict "Behaviour change in the diff (LOW) ... I'd leave it". Not fixed: it is LOW, outside the stated defect, and the previous behaviour was worse.

### Open, not introduced this round (from the verify passes)
- `replaceFolder`'s success-path cleanup (`build-set.ts`, the final `rm(work, ...)`) still throws when the old folder holds a read-only directory with files in it: a plain `--replace` over a set with a 0555 `Backup/`, or an edit that carried a read-only folder, exits 1 with an unlink error after the new set is in place. Pre-existing for `--replace`; reached by edits through the carry-over. Verdict "MEDIUM, not introduced ... it would change success-path behaviour". One line, `.catch(() => undefined)`, outside the reworked diff, so left for the next round.
- The `replaceFolder` doc comment still says nothing of the old set is left among the new one, which is no longer true for an edit. Left as is per finding 2's "Do not touch: the `replaceFolder` comment"; the `carryOver` field comment states the exception.
- Finding 9 risks the verifier reasoned and did not execute: the start-beat delta trusts `songs[].start`, so a song moved in Live by Insert Time carries its locators off its audio; a locator with no song number is not carried (as before); carried times are `old + delta`, so fractional beats could round a hair across a song boundary.
- Finding 2 notes: a set whose new project holds no `Songs/` at all would carry the old one whole (not confirmed buildable); off APFS the clones fall back to full copies; only top-level entries are carried.

### Rework briefs
- Finding 2 rework: a failed replacing write whose cleanup also fails must throw the original error, and leave the old set folder exactly as it was; a full `--replace` and the success path stay unchanged. Proof: "an edit that cannot keep the replaced set in a read-only Backup fails with that error and leaves the set as it was", red (`unlink` error) then green.
- Finding 9 rework: on the boundary song, `Pad Out`, like `End`, is the new build's, so it takes no part in the matching and the old one is never carried; non-boundary carry and every other boundary rule stay as they are. Proof: "a song added after a pad that ended the set leaves no Pad Out from the old set inside the new Pad section", red then green.
