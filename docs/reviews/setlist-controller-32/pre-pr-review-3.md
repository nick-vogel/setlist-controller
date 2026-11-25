# Pre-PR review: setlist-controller#32 Set builder follow-ups #46, #48, #49, #50, #53, #55, #56, #57

**Branch:** `setlist-controller-32-set-builder` vs `origin/main` (merge-base `2d50a13` "Merge pull request #105 from nick-vogel/setlist-controller-59-song-transitions")
**Reviewed at:** HEAD `89dd3a0` (setlist-controller#53 A tempo ramp that starts at a song's beat 0 loses its start point), clean tree: 0 files with uncommitted changes, 0 untracked; 15 files total, +585 / -75 against the merge-base (10 source files under `src/set-builder/`, `README.md`, 4 changed test files and 1 new one, `test/readme.test.ts`). 22 commits, eight tickets each landed as an implement commit plus its merge.
**Reviewed against:** the bodies of setlist-controller#46, #48, #49, #50, #53, #55, #56 and #57 (the follow-ups the second `/epic-loop` run on epic #32 carries), and the Approach decisions of `pre-pr-review-1.md` and `pre-pr-review-2.md`, which reviewed the epic's first PR (merged as PR #93) against `origin/setlist-controller-1-ipad-rehearsal`. The repo still has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Run with `--fresh`: this is round 1 of the new run and reviews the whole diff against `origin/main`, not a delta.
**Date:** 2026-10-20
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration suites | `pnpm test` | green: 34 files, 693 passed, 3 skipped |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` (Playwright, OS-assigned ports) | green: 30 passed |
| Branch tests at `$BASE` (tautology oracle) | the five changed test files, plus the branch `README.md` for `test/readme.test.ts`, run in a scratch worktree at `2d50a13`, then removed | 218 passed, 22 failed. Every requirement test of #48, #49, #50, #53, #56 and #57 is red at base; the green ones are listed under Test quality |
| #53 stitch filter (`write-set.ts:291`) | read `leadIn` (`timeline.ts:91-95`) and every `mainEvents` caller | the filter can drop only the injected beat-0 copy, and only after an overlap (lead-in 0); dismissed |
| `--list` guard after #57 | finder agent: real `listSongs`/`foldersNamed` on a scratch library, then mutation removing `&& named[0] === folder` | guard load-bearing; mutation leaves `test/set-builder-command.test.ts` and `test/readme.test.ts` green (finding 1) |
| Two folders equal to the name | finder agent: `foldersNamed(['Grace','grace','Grace x'],'GRACE')` executed | returns all three, correct; no test pins it (finding 1) |
| `isMissing` error branches | finder agent: mutations `() => true` and dropping `ENOTDIR`, five set-builder test files | 315/315 green under both (finding 2) |
| Stem under two targets in the song checks | finder agent: real `stemProblems` with `{ 'A GTRS': ['AG'], KEYS: ['Piano','AG'] }`, KEYS at 1 track | returns `S: KEYS needs 2 tracks for this song, and the template has 1.` (finding 3) |
| Malformed stem map | scratch copy of `src/` and `config/` with `{ "KEYS": ["Piano",] }`, `node src/set-builder/main.ts ... grace` | stack trace, `SyntaxError`, exit 1 (finding 4) |
| README flags and defaults vs `USAGE` | finder agent, by hand for all 9 flags | match today |
| Stem-name comparison | read `checks.ts:59-66` and `song.ts:42` | repeat check and lookups both use the exact `EffectiveName` string |
| Not run | real library songs under `~/Music/MultiTracks`, Live itself | out of the run's guardrails; #48 and #50 issue bodies record that no library song has a session clip or a missing WAV |

**Overall:** All eight tickets do what their issue asks, every full check is green, and no finding is above LOW. The four LOW findings are two test gaps on fallback paths the branch added (the `--list` guard and the missing-file check's other stat errors), a misleading extra line beside the new doubled-stem problem, and one README sentence that a malformed stem map makes false. The branch can open its PR as it stands; the findings are cheap to fix first or to carry as follow-ups.

## Approach decisions
- **Cleanup after a failed write, plain build (round 1 finding 1):** unchanged. The folder the build created is removed on any write failure and the error rethrown (`build-set.ts`, the catch beside `replaceFolder`).
- **A cleanup that itself fails (round 2 finding 1):** the `/EACCES/` pin that `pre-pr-review-2.md` records was never made. #55 dropped it (L35) under eng-pipeline#34 on 2026-10-17, so the failed-cleanup test still asserts `rejects.toThrow()` (`test/set-builder.test.ts:1400`) and proves the failed cleanup by `existsSync(copied)`. This supersedes round 2's line saying the test pins `/EACCES/`.
- **Write-failure trigger in the cleanup tests (#50):** a WAV the library holds at mode 000, restored in `finally` and skipped as root, replaces the missing WAV, which is now a problem before any write.
- **Controller cross-check, end marker, relative path flags (rounds 1 and 2):** unchanged.
- **Name matching (#57):** one comparison, `nameKey` (`library.ts`), for a whole name and a part. A whole-name match wins only when exactly one folder equals the name.
- **Doubled stem (#49):** a template-level problem from the stem map alone (`repeatedStemProblems`, `checks.ts`), listed after the shared names. `stemTargets` keeps last-listed-wins; finding 3 adds no new mechanism, only a filter in the two song checks that count by target.

## Confirmed Issues

### 1. Two branches of the new whole-name rule have no test: the `--list` guard that keeps a short name from building another song, and two folders that both equal the name — LOW
- **Location:** `src/set-builder/song-list.ts:70` (guard) with its comment at `:50-52`; `src/set-builder/library.ts:52-54`
- **Attribution:** introduced by `34d7a3a` (setlist-controller#57 Prefer an exact whole-name match over a longer folder name that contains it). At `$BASE`, `foldersNamed` was a plain substring filter, so a candidate cut from `folder`'s title always matched `folder` and the `named[0] === folder` check was redundant.
- **Real-world trigger:** none known. A real MultiTracks folder name always holds hyphens (`Title-Artist-Key-bpm`), and a `--list` candidate is cut from the title, before the first hyphen, so no candidate equals a real folder's whole name. Only a hand-named folder without hyphens (`Grace`) beside a song whose title holds that word makes the guard fire. Two folders that both equal the name need a case-sensitive disk. LOW, capped: upgrade to MEDIUM if the library holds a folder whose name has no hyphen, check via `ls ~/Music/MultiTracks | grep -v -- -`.

**Evidence**
```ts
// song-list.ts:50-52
// ... Every candidate is cut
// from the title, so one that names a single folder names `folder`; the check that it names `folder` itself stays, so
// that a listed short name can never build another song.
// song-list.ts:70
    return named.length === 1 && named[0] === folder;
// library.ts:52-54
  const whole = folders.filter((folder) => nameKey(folder) === key);
  if (whole.length === 1) return whole;
  return folders.filter((folder) => nameKey(folder).includes(key));
```

**Failure mode** — Since #57, a candidate can be another folder's whole name. With folders `Grace` and `This Is Amazing Grace-The Ascension-D-98.00bpm`, `foldersNamed(folders, 'grace')` returns `['Grace']`, one folder and not the one the candidate was cut from. Only the `named[0] === folder` check stops `--list` from printing `grace` for the long folder, a name that builds `Grace`. Executed: removing `&& named[0] === folder` leaves all 66 tests in `test/set-builder-command.test.ts` and `test/readme.test.ts` green. The comment's premise ("one that names a single folder names `folder`") is now false and presents the check as redundant, which invites its removal. Separately, issue #57 requires that "two folders that both equal the name ... still stop"; the code does (`foldersNamed(['Grace','grace','Grace x'],'GRACE')` returns all three, executed), but no test pins it, so `whole.length === 1` becoming `>= 1` would pass the suite.

**Recommended fix** — Two tests and one comment.
- In `test/set-builder-command.test.ts`, beside the `--list` Finder-duplicate test: a library holding the GRACE fixture and a folder named `Grace` (a copy of any fixture song folder renamed). Run `--list`; assert the GRACE fixture's line does not start with `grace`, and that each listed short name, fed through `matchSongs`, matches its own folder (the pattern the Finder-duplicate test uses).
- In `test/set-builder.test.ts`, beside the naming tests: `expect(foldersNamed(['Grace', 'grace', 'Grace copy'], 'GRACE')).toEqual(['Grace', 'grace', 'Grace copy'])`.
- `song-list.ts:50-52`: replace "Every candidate is cut from the title, so one that names a single folder names `folder`; the check that it names `folder` itself stays, so that a listed short name can never build another song." with "A candidate can be another folder's whole name, which names that folder alone (foldersNamed), so the check that it names `folder` itself is what keeps a listed short name from building another song."

**Remediation brief**
- **Design intent:** `foldersNamed` is the one matching rule for a build (`matchSongs`) and for `--list` (`shortName`). A listed short name must build exactly the folder it is listed for. Since #57 an exact whole name beats any substring, so `shortName` has to check the folder it gets back, not just the count.
- **Full surface:** `test/set-builder-command.test.ts` (new `--list` test), `test/set-builder.test.ts` (new `foldersNamed` assertion), `src/set-builder/song-list.ts:50-52` (comment). No production code changes.
- **Must preserve:** `song-list.ts:70` as is; the `--list` Finder-duplicate test and the naming tests in `test/set-builder.test.ts` (`builds $folder from "$name"`, `stops on a part of the name that a folder and its duplicate both hold`, `"god"` matching two).
- **Do not touch:** `foldersNamed`'s logic (correct by execution); the `_template` / `_pads` / `--pads` exclusion in `songFolders` (Dismissed).
- **Proof:** `pnpm exec vitest run test/set-builder-command.test.ts test/set-builder.test.ts` green. Red check: in a scratch copy, change `song-list.ts:70` to `return named.length === 1;` and the new `--list` test goes red; change `library.ts:53` to `if (whole.length >= 1) return whole;` and the new `foldersNamed` assertion goes red.

### 2. The missing-WAV check's handling of stat errors other than a missing file has no test — LOW
- **Location:** `src/set-builder/song.ts:73-78`
- **Attribution:** introduced by `9bfadf3` (setlist-controller#50 Check every clip's audio file before anything is written).
- **Real-world trigger:** none known. ENOTDIR needs a file where a song's `MultiTracks/` folder should be; another stat error (EACCES) needs a song folder without search permission. Neither comes from a MultiTracks download or Live. LOW, capped.

**Evidence**
```ts
async function isMissing(path: string): Promise<boolean> {
  return stat(path).then(
    () => false,
    (error: NodeJS.ErrnoException) => error.code === 'ENOENT' || error.code === 'ENOTDIR',
  );
}
```

**Failure mode** — Both fallback branches are unpinned (rule: a test for every fallback path). Executed: replacing the rejection handler with `() => true`, so every stat error reads as a missing file, leaves all 315 tests in the five set-builder test files green; so does dropping `|| error.code === 'ENOTDIR'`. The mode-000 WAV tests never reach the handler, because `stat` succeeds on an unreadable file.

**Recommended fix** — Two stop-rules tests in `test/set-builder-stop-rules.test.ts`, beside `stops on a WAV a clip refers to that the song folder does not hold`:
- ENOTDIR: in a song's folder, replace the subfolder holding its WAVs with a plain file of the same name; expect one `<folder>: <RelativePath> is missing from the song folder.` line per WAV, and nothing written.
- Another error: `chmod` that subfolder to `0o000` (restored in `finally`, `skipIf` root as the cleanup tests do); expect no `is missing` line, and the build to reject during the copy with nothing left in the output root.

**Remediation brief**
- **Design intent:** the problem pass reports a WAV as missing only when the library truly lacks it (ENOENT, or ENOTDIR for a path through a file). Any other stat error is not a missing file and is left to `copyAudio`, where the write's cleanup (`build-set.ts`, the catch around the write) removes what was written.
- **Full surface:** `test/set-builder-stop-rules.test.ts` (two tests). No production code changes.
- **Must preserve:** `song.ts:73-78` as is; `stops on a WAV a clip refers to that the song folder does not hold` and `names each missing WAV once`; the three mode-000 cleanup tests in `test/set-builder.test.ts`.
- **Do not touch:** the outside-folder check in `STEM_CONTENT` and `projectFile`'s guard throw (`audio.ts:15-18`), both correct (Dismissed).
- **When the fix fails:** the EACCES test depends on `stat` failing under a `0o000` parent, which macOS and Linux give to a non-root user; as root the `skipIf` skips it.
- **Proof:** `pnpm exec vitest run test/set-builder-stop-rules.test.ts` green; in a scratch copy, the handler `() => true` turns the EACCES test red, and dropping `ENOTDIR` turns the ENOTDIR test red.

### 3. A stem listed under two targets also adds a "needs N tracks" line counted against the target listed last, which can be false — LOW
- **Location:** `src/set-builder/checks.ts:59-66` (`stemProblems`), `:168-176` (the slot count for an overlap); the comment at `src/set-builder/template.ts:73-74`
- **Attribution:** pre-existing, exposed. `stemTargets`' last-listed-wins and both counts are unchanged from `$BASE`. `2337a5c` (setlist-controller#49 Stop when the stem map lists one stem under two groups) adds the correct problem beside them, and the comment "none reaches a build: the build stops on it first", which is true of the write but not of the checks that run in the same pass.
- **Real-world trigger:** the one #49 names: a stem name pasted into a second group of `config/stem-map.json`, for a song that has that stem, where the second group's template tracks are already full. The build stops correctly; the operator gets the right line and a false one.

**Evidence**
```ts
// checks.ts:59-66
  const targetOf = stemTargets(stemMap);
  ...
    const count = song.tracks.filter((stem) => targetOf.get(stem.name) === name).length;
    return available !== undefined && count > available ? [`${song.folder}: ${name} needs ${count} tracks for this song, and the template has ${available}.`] : [];
```

**Failure mode** — Executed by the finder: `stemProblems` with `{ 'A GTRS': ['AG'], KEYS: ['Piano', 'AG'] }` and KEYS at 1 track returns `S: KEYS needs 2 tracks for this song, and the template has 1.` In a build, that line prints beside `The stem map lists the stem "AG" under A GTRS and KEYS.` The extra line points at the template, not the map. A real shortage on A GTRS can also go unreported until the map is fixed.

**Recommended fix** — Leave a stem the map lists under more than one target out of the two counts by target. The `unmapped` line keeps using `targetOf.has`, so a doubled stem is still mapped.
```diff
 export function stemProblems(song: Song, targets: Map<string, Target>, stemMap: StemMap): string[] {
   const targetOf = stemTargets(stemMap);
+  const doubled = repeatedStems(stemMap);
   const unmapped = song.tracks
     .filter((stem) => !targetOf.has(stem.name))
     .map((stem) => `${song.folder}: the stem map has no group for the stem "${stem.name}".`);
   const tooMany = Object.keys(stemMap).flatMap((name) => {
     const available = targets.get(name)?.tracks.length;
-    const count = song.tracks.filter((stem) => targetOf.get(stem.name) === name).length;
+    const count = song.tracks.filter((stem) => !doubled.has(stem.name) && targetOf.get(stem.name) === name).length;
```
and the same `!doubled.has(stem.name) &&` in both filters at `checks.ts:172` and `:176`. `repeatedStems(stemMap): Set<string>` is the set of stems `repeatedStemProblems` reports; derive both from one walk of the map (the `targetsOf` map at `checks.ts:36-39`) so the two never disagree. Then the `template.ts:73-74` comment becomes "A stem under two targets would go to the one listed last; the build stops on it (templateProblems), and the song checks leave it out of their counts."

**Remediation brief**
- **Design intent:** a map problem is reported once, by the map check, and the song checks judge songs against a map they can trust. A stem under two targets has no single target, so counting it against either one makes up a song problem.
- **Full surface:** `src/set-builder/checks.ts:59-66`, `:168-176`, `:35-46` (factor the shared walk out of `repeatedStemProblems`), `src/set-builder/template.ts:73-74`; a test in `test/set-builder-stop-rules.test.ts` beside `stops on a stem the map lists under two targets`, with the second target's template tracks full, expecting only the map line for that stem.
- **Must preserve:** `stemTargets`' last-listed-wins (`write-set.ts:47` uses it, and no build reaches the write with a doubled stem); every `stops on a stem ... under two targets` / `three targets` / `that no song in the build has` / `names a target that lists a stem twice once` / `lists a stem under more than one target after the template problems` test; the `unmapped` line for a stem the map does not list; a stem listed twice under one target is not doubled (the `Set` in `targetsOf`).
- **Do not touch:** the repeat check's exact-string comparison (consistent with the lookups, Dismissed).
- **Proof:** the new test is red now (it gets the extra `needs N tracks` line) and green after; `pnpm exec vitest run test/set-builder-stop-rules.test.ts test/set-builder-overlap.test.ts` green.

### 4. The README says an error during the build prints one line, but a malformed stem map prints a stack trace — LOW
- **Location:** `README.md:90`; the read at `src/set-builder/main.ts:123`, before the `try` at `:125`
- **Attribution:** the README sentence is introduced by `3643f57` (setlist-controller#46 Document pnpm build-set in the README); the read outside the `try` is pre-existing (`git show 2d50a13:src/set-builder/main.ts`, line 122).
- **Real-world trigger:** the README's own instruction, "add the new stem name under its group there", followed by a JSON slip such as a trailing comma. Readable either way, so a legibility gap: LOW.

**Evidence**
```
README.md:90  ... An error during the build also prints one line and exits 1. ...
main.ts:123     const stemMap = JSON.parse(await readFile(join(import.meta.dirname, '../../config/stem-map.json'), 'utf8')) as StemMap;
```

**Failure mode** — Executed in a scratch copy with `config/stem-map.json` set to `{ "KEYS": ["Piano",] }`: `node src/set-builder/main.ts --library <empty> --output-root <empty> --date 2026-11-01 grace` prints the source line, a caret, `SyntaxError: Unexpected token ']' ... is not valid JSON` and a stack trace, then exits 1. The README promises one line.

**Recommended fix** — Change the README, not `main.ts`: the stem map's path is fixed relative to `main.ts`, so a code fix could only be tested by writing the committed `config/stem-map.json`. In `README.md:90`, replace "An error during the build also prints one line and exits 1." with "An error during the build also prints one line and exits 1, except a stem map that is not valid JSON, which prints Node's error with the line at fault and exits 1." No test: `test/readme.test.ts` checks flags only.

**Remediation brief**
- **Design intent:** the README states what the operator sees; it tracks `main.ts` as it stands.
- **Full surface:** `README.md:90`.
- **Must preserve:** `test/readme.test.ts` green (section placement, flag set); the exit-code statements (1 for problems and errors, 2 for usage).
- **Do not touch:** `main.ts:123` (moving it changes behaviour this review does not ask for).
- **Proof:** `pnpm exec vitest run test/readme.test.ts` green; the sentence matches the scratch-copy run above.

### 5. Comment hygiene — LOW (aggregated)
- `src/set-builder/audio.ts:28-29` — "A clip whose file is outside its song's folder has none: readSong stops the build on it first." → "A clip whose file is outside its song's folder has none, so the problem pass (audioProblems) passes over it; readSong reports it, and the build stops before any copy."
- `README.md:57` — "a 4-bar gap after each by default" → "a 4-bar gap between songs by default" (the last song has no gap after it; `USAGE` says "Every other song is followed by a 4-bar gap").
- `README.md:90` — "it prints each problem on its own line on stderr" → "it prints each problem, starting on its own line, on stderr" (a no-match or several-match problem lists folders on the lines after it).
- `src/set-builder/library.ts:7` — the edited header comment line is 182 characters where the block wraps near 120 → rewrap the sentence "except that a short name that is one folder's whole name ... does. The song folders are ..." at the block's width.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- #53 stitch filter `timeOf(event) > timeOf(opening)` (`write-set.ts:291`) — `offset = previous.handoff + leadIn` with `leadIn >= 0` (`timeline.ts:91-95`), and every source `later` event has Time > 0, so only the injected beat-0 copy can be dropped, only after an overlap (lead-in 0), where the opening already holds the same value at the same beat. The overlap ramp test (`test/set-builder-overlap.test.ts:116`) pins no doubling there.
- #53 and other `mainEvents` callers — `timeline.ts:129`, `:199` (meter, never ramp-started), `checks.ts:150`, `write-set.ts:120`, `:183`, `build-set.ts:204` read `.start` or the meter only; the ramp copy reaches `stitch` alone.
- #53 a starting event before beat 0 that ramps through it — the starting value already ignores a ramp through beat 0 at `$BASE`; Live writes steps, and the issue scopes a ramp that starts at beat 0.
- The failed-cleanup test lacks `/EACCES/` (`test/set-builder.test.ts:1400`) — #55 dropped that narrowing (L35) under eng-pipeline#34; #50's "keep that" referred to it. Recorded under Approach decisions.
- The outside-folder problem is one line per stem, not per file — it matches the wording #50 gives (`the stem "<stem>" refers to a file outside the song's folder`).
- A type-3 `RelativePath` that is empty, names a folder or holds `../` — Live never writes one; it would fail during the copy, which the write's cleanup handles.
- Stem names compared case-sensitively in the repeat check — the lookups (`checks.ts:61`, `:65`) use the same exact `EffectiveName`.
- `_template`, `_pads` and `--pads` exclusion under #57 — `songFolders` removes them before `foldersNamed` runs.
- A Finder copy's `--list` short name — its title (before the first hyphen) equals the original's, so both fall back to their whole folder names, which now each build their own folder (tested).
- `projectFile`'s throw (`audio.ts:15-18`) — unreachable: `readSong`'s outside-folder problem returns before `writeSet`.

## Minor / nits
- The order of a group-and-single-track problem against a two-groups problem across the template is not pinned (a mutation sorting them by kind passes). Only the line order changes, which nothing reads, as #55's eng-pipeline#34 triage settled for L26.
- Where a missing-WAV line sits among one song's other problems is not pinned (moving `missingFiles` first passes). Same reasoning.
- A filled FreezeSequencer slot on an unfrozen stem is not tested as ignored; Live does not write that.
- A group named PAD beside the PAD single track now stops the build as a shared name; before the branch it built. Consistent with two PAD single tracks already stopping.
- With a library that cannot be listed and the default template inside it, a doubled stem is not reported until the library is fixed; the same holds for every template problem on that path, by design (`readableTemplateProblems`).
- `test/readme.test.ts` can go red only on flag names: a changed default (`~/Music/MultiTracks`, `<library>/_pads`, `~/Music/Ableton/Sets`), an argument shape, or exit codes drift silently, and it compares against `USAGE`, not the `parseArgs` options. #46's criterion "the same default" is met by hand today.
- `test/set-builder-command.test.ts:407-409` asserts a sentence of the usage text; it pins user-facing wording, not behaviour.

## Test quality
Tests added or modified: about 36 cases across five files. Red at `$BASE`: every requirement test of #48, #49, #50, #53, #56 and #57, and both `test/readme.test.ts` tests against the base README. Green at `$BASE`, each with a reason that holds:
- `test/set-builder-overlap.test.ts:116` (`a3822dc`) — guards that the beat-0 ramp copy is not doubled after an overlap.
- `test/set-builder-stop-rules.test.ts:319` "builds with a stem the map lists twice under one target" and `:375` "commits a stem map that lists each stem once" (`2337a5c`) — a negative guard and a data check on `config/stem-map.json`, both asked for by #49.
- `test/set-builder.test.ts:1100` (the `${GRACE} copy` row) and `:1111` (`34d7a3a`) — #57's acceptance criteria that keep existing behaviour.
- The clip-path assertions at `test/set-builder.test.ts:1283` (`fa32a9f`) — #55 is test-only, so green at base is its point; the issue's mutation proves them.
- The three mode-000 cleanup tests (`9bfadf3`) — coverage kept on purpose after a missing WAV became a problem.
Tautology shapes: no mocks, spies, call-shaped assertions, snapshots or assertion-free tests. `test/set-builder-command.test.ts:603` checks `--list` output through the production `matchSongs`, mitigated by the hard-coded list after it. Mutation gaps: findings 1 and 2.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` green at `89dd3a0`; `pnpm test:e2e` green locally.
- **Commit hygiene:** 22 commits, each implement commit with its ticket reference and merge; nothing to drop. Commit this doc.
- **Likely reviewer asks:** the README's stem-map sentence (finding 4); why `--list` still checks the folder it gets back (finding 1).

## Verdict
Ready to open the PR as it stands. No finding gates it: the four LOW findings and the comment hygiene can be remediated first through `/pr-review-remediate` or carried as follow-ups. None of the eight tickets claimed to resolve a prior review finding by this branch's code; the one prior narrowing this branch's issues mention (`/EACCES/`) was dropped by triage, not left open.
