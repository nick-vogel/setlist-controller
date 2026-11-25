# Pre-PR review: setlist-controller#32 Set builder follow-ups #109, #110, #111

**Branch:** `setlist-controller-32-set-builder` vs `origin/main` (merge-base `e8b58d3` "Merge pull request #112 from nick-vogel/setlist-controller-32-set-builder")
**Reviewed at:** HEAD `5371f93` (setlist-controller#109 Count no tracks for a stem the stem map lists under two groups), clean tree: 0 files with uncommitted changes, 0 untracked; 8 files total, +144 / -18 against the merge-base (5 source files under `src/set-builder/`, `README.md`, 2 changed test files). 8 commits: three tickets, each an implement commit plus a merge, with #109 and #110 carrying a second commit from their lane merge.
**Reviewed against:** the bodies of setlist-controller#109, #110 and #111 (the follow-ups `pre-pr-review-3.md` findings 3 and 4 and round 3's dismissed `../` case became), and the Approach decisions of `pre-pr-review-3.md`. The repo still has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Run with `--fresh`: round 1 of this run, reviewing the whole diff against `origin/main`, not a delta.
**Date:** 2026-10-21
**Reviewer:** 1 code-review agent + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration suites | `pnpm test` | green: 34 files, 717 passed, 3 skipped |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` (Playwright, OS-assigned ports) | green: 30 passed |
| Branch tests at `$BASE` (tautology oracle) | both changed test files copied into a scratch worktree at `e8b58d3`, run, worktree removed | 6 red, 136 green. Every new requirement test is red for its intended reason; the moved-stem test is green at base, as a regression guard should be |
| Mutation: `stemTargets` first-listed wins (`template.ts:79` as `if (!targetOf.has(stem)) targetOf.set(stem, target)`) | finder agent, both changed test files | all green (finding 1) |
| Mutation: `stemTargets` without the same-target condition | audit agent, full suite | 1 red (`builds with a stem the map lists twice under one target`): covered |
| Mutation: `stemTargets` reverted to base last-wins | audit agent, full suite | exactly the two #109 tests red, moved-stem guard green |
| Mutation: `staysInFolder` with `posix.normalize(path)` replaced by `path`; without `!posix.isAbsolute(normalized)`; without `normalized !== '..'` | finder and audit agents, full suite | all green under each of the three (finding 2) |
| Mutation: `stemMapFile` without the `config/stem-map.json ...` prefixes | audit agent, `test/set-builder-command.test.ts` | malformed case red; missing case green, because Node's ENOENT message already holds the path (finding 3) |
| Mutation: `stemMapFile` without `oneLine` | audit agent | all green: neither Node message tested holds a newline (Minor) |
| `stemTargets` order cases | finder agent, real `template.ts`: A,A,B / A,B,A / A,B,B / A,A | undefined, undefined, undefined, A: agrees with `repeatedStemProblems` |
| `staysInFolder` path cases | finder agent, `posix.normalize` | every climbing or absolute path is outside; no in-folder path is called outside |
| Every `stemTargets` and `fileInSong` caller | `grep -rn 'stemTargets\|fileInSong\|targetOf' src` | `stemProblems`, `slotProblems`, `placeClips`; STEM_CONTENT rule, `missingFiles`, `clipCopies`, `projectFile`: all consistent with an undefined return |
| Wrong-shape stem map `{ "VOX": "BGVS" }` | `stemTargets` at HEAD and at `e8b58d3`, executed | HEAD maps the stems `B`, `G`, `V`, `S` to VOX; base throws `stems.map is not a function` (finding 4) |
| Multi-line error in the build's catch | `parseAls` on malformed XML, executed | message holds a newline, an excerpt and a caret (Minor, pre-existing) |
| Not run | real library songs under `~/Music/MultiTracks`, Live itself | out of the run's guardrails; see Needs Further Investigation A |

**Overall:** All three tickets do what their issue asks, every full check is green, and no finding is above LOW. Three findings are test gaps that hand-made mutations of the new code survive: the first-listed half of #109's "counted against none", the normalize and absolute branches of #111's folder check, and the read-error prefix of #110. The fourth is a small behaviour change #109 brought in: a stem map that gives a group a string instead of a list now splits the string into one-letter stems, where the base stopped with an error. The branch can open its PR as it stands.

## Approach decisions
- **Cleanup after a failed write, failed cleanup, write-failure trigger, controller cross-check, end marker, relative path flags, name matching (rounds 1 to 3):** unchanged.
- **Doubled stem (#49, #109):** overturns round 3's "`stemTargets` keeps last-listed-wins". #109 made `stemTargets` (`template.ts:76-81`) return undefined for a stem under more than one target, so every count by target (`stemProblems`, `slotProblems`) leaves it out with no filter of its own, and `placeClips`' "has no target" throw (`write-set.ts:60`) guards it. `repeatedStemProblems` (`checks.ts:35-46`) still walks the map separately to name the targets; the two walks agree on every order case (A,A,B / A,B,A / A,B,B / A,A).
- **Stem map read errors (#110):** read inside `build()`'s `try` through `stemMapFile` (`main.ts:156-169`), which throws one line naming `config/stem-map.json`. Round 3 finding 4's README-only fix is superseded. A shape check, when added (finding 4), belongs in the same function and throws the same way.
- **Clip outside its song's folder (#50, #111):** `fileInSong` (`song.ts:144-149`) is the one place that decides; a type-3 path that normalizes to `..`, a `../` prefix or an absolute path is outside. Round 3's dismissal "a type-3 `RelativePath` that holds `../`: Live never writes one" is superseded by #111, which treats it as reachable.

## Confirmed Issues

### 1. Nothing tests that a stem under two targets is left out of the count for the target listed first — LOW
- **Location:** `test/set-builder-stop-rules.test.ts:356-372` and `:894-902`; the code is `src/set-builder/template.ts:76-81`
- **Attribution:** introduced. The tests come from `a5f2beb` (setlist-controller#109 Count no tracks for a stem the stem map lists under two groups). The production code is correct.
- **Real-world trigger:** a later change to `stemTargets` that keeps the first target a stem is listed under, as a natural "fix" of the last-wins behaviour, puts back the false "needs N tracks" line #109 removed, with every test green. Without that change no user meets anything, so: LOW.

**Evidence**
```ts
// test/set-builder-stop-rules.test.ts:359, AG and EG 1 to 3 stay first under A GTRS and E GTRS, then also under VOX
const stemMap = addedStems(await readStemMap(), 'VOX', 'AG', 'EG 1', 'EG 2', 'EG 3');
```
Both #109 tests list the doubled stem first under its own group, which has room for it, and last under VOX, which does not.

**Failure mode** — With `template.ts:79` changed to `if (!targetOf.has(stem)) targetOf.set(stem, target)` (first listed wins), both changed test files stay green. Issue #109 asks for the stem to be "counted against none of them"; the tests prove only "not against the last".

**Recommended fix** — Add a test beside `:356` that lists the stems first under VOX (VOX moved to the front of the map) and then under their own groups, so first-listed-wins overfills VOX:
```ts
  it('stops on stems under two targets with no track count for the target listed first', async () => {
    const workspace = await createWorkspace();
    const { VOX, ...rest } = await readStemMap();
    const stemMap = { VOX: [...VOX, 'AG', 'EG 1', 'EG 2', 'EG 3'], ...rest };

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The stem map lists the stem "AG" under VOX and A GTRS.',
        'The stem map lists the stem "EG 1" under VOX and E GTRS.',
        'The stem map lists the stem "EG 2" under VOX and E GTRS.',
        'The stem map lists the stem "EG 3" under VOX and E GTRS.',
      ],
    });
  });
```

**Remediation brief**
- **Design intent:** a stem the map lists under more than one target has no target. `stemTargets` returns undefined for it, so no count by target counts it, whatever the targets' order; the repeated-stem line from `repeatedStemProblems` is the only problem it gives. A stem listed twice under one target keeps that target.
- **Full surface:** `test/set-builder-stop-rules.test.ts`, one new test after `:372`. No source change.
- **Must preserve:** every existing test in `test/set-builder-stop-rules.test.ts`, in particular `builds with a stem the map lists twice under one target` (`:319`), the two `target listed last` tests (`:356`, `:894`) and `stops on an overlap with a stem moved to a group with too few tracks` (`:904`).
- **Do not touch:** `src/set-builder/template.ts:76-81` (correct; see the order cases under What was verified).
- **Proof:** the test is green at HEAD by design (it guards a fix already made), so prove it can go red: apply the first-listed-wins mutation above to `template.ts:79`, run `pnpm exec vitest run test/set-builder-stop-rules.test.ts -t "target listed first"`, see it red with one extra line, `Goodness of God-Victory-A-63.00bpm: VOX needs 5 tracks for this song, and the template has 4.` (Goodness of God's BGVS plus the four doubled stems), revert, see it green. Check that the repeated-stem lines' target order is VOX first, since the problem names targets in map order (`checks.ts:35-46`); if the run shows a different order, the map construction is wrong, not the expectation.

### 2. The folder check's normalize, absolute-path and bare `..` branches have no test — LOW
- **Location:** `src/set-builder/song.ts:151-154` (`staysInFolder`); `test/set-builder-stop-rules.test.ts:670-689`
- **Attribution:** introduced by `1341f7e` (setlist-controller#111 A clip whose RelativePath climbs out with `..` passes as a file inside its song's folder). The production code is correct.
- **Real-world trigger:** a later edit of `staysInFolder` that drops the normalize, or one of the two other conditions, lets a type-3 path such as `MultiTracks/../../Shared Stems/EG 1.wav` or `/Users/x/EG 1.wav` through as a file in the song, and the build copies a WAV from outside the song as its own. Needs both the edit and a set with such a path (see Needs Further Investigation A): LOW.

**Evidence**
```ts
function staysInFolder(path: string): boolean {
  const normalized = posix.normalize(path);
  return !posix.isAbsolute(normalized) && normalized !== '..' && !normalized.startsWith('../');
}
```
The only path tested is `../Shared Stems/EG 1.wav`, which the raw `startsWith('../')` catches alone.

**Failure mode** — Each of three mutations leaves the full suite green: `posix.normalize(path)` replaced by `path`; `!posix.isAbsolute(normalized) &&` removed; `normalized !== '..' &&` removed. The comment at `song.ts:141-143` names the normalized and absolute cases as behaviour.

**Recommended fix** — Turn the `it.each` at `:671-673` into rows that carry the path, and add three: a path that climbs out only once normalized, an absolute one, and `..` with a file name that the sibling folder does not hold. Keep the two existing rows.
```ts
  it.each([
    { sibling: 'holds the WAV', keep: true, path: '../Shared Stems/EG 1.wav' },
    { sibling: 'does not hold the WAV', keep: false, path: '../Shared Stems/EG 1.wav' },
    { sibling: 'holds the WAV, reached through MultiTracks', keep: true, path: 'MultiTracks/../../Shared Stems/EG 1.wav' },
    { sibling: 'does not hold the WAV, named by an absolute path', keep: false, path: '/Shared Stems/EG 1.wav' },
    { sibling: 'does not hold the WAV, named as the parent folder', keep: false, path: '..' },
  ])(
```
with the `text.replace` at `:676` writing `` `<RelativePath Value="${path}" />` ``. The test title keeps `$sibling`.

**Remediation brief**
- **Design intent:** `fileInSong` is the one place that decides whether a clip's WAV is in its song's folder. A type-3 path that leaves the folder once normalized, by `..`, a `../` prefix or an absolute path, is outside: the STEM_CONTENT rule (`song.ts:113`) reports it with the outside-the-folder line, `missingFiles` (`song.ts:67`) does not check it, and `clipCopies` (`audio.ts:35`) never copies it.
- **Full surface:** `test/set-builder-stop-rules.test.ts:670-689`. No source change.
- **Must preserve:** the two existing rows and their expectation; `stops on a WAV a clip refers to that the song folder does not hold` (the next test); the outside-the-folder test for a type other than 3 (`stops on a clip whose file is outside its song folder, beside the song's other problems`, `:655`); `stoppedBuild`'s output-root check, which is what makes the `keep: true` rows red at base.
- **Do not touch:** `src/set-builder/song.ts:144-154`; a path that normalizes to `.` and a backslash path (Minor, Live does not write them).
- **Proof:** the new rows are green at HEAD by design. Apply each mutation above in turn to `song.ts:152-153`, run `pnpm exec vitest run test/set-builder-stop-rules.test.ts -t "climbs out"`, and see at least one new row red under each; revert and see all five green. The `keep: true` row with `MultiTracks/../../` needs the sibling folder at `workspace.library/Shared Stems`, which the existing setup already makes, since the song folder is one level under the library and `MultiTracks/../..` climbs to the library.

### 3. The missing-stem-map case does not test the line that names the file — LOW
- **Location:** `test/set-builder-command.test.ts:531-557`; the code is `src/set-builder/main.ts:159-163`
- **Attribution:** introduced by `23823dd` (setlist-controller#110 A bad config/stem-map.json makes pnpm build-set print a stack trace).
- **Real-world trigger:** a later edit drops the `config/stem-map.json cannot be read:` prefix and the missing case stays green, because Node's own ENOENT message holds the file's absolute path, which contains `config/stem-map.json`. The operator would still see the path, so: LOW.

**Evidence**
```ts
expect(result.stderr).toContain('config/stem-map.json');
```

**Failure mode** — With both prefixes in `stemMapFile` removed, only the malformed row goes red. The missing row passes on `ENOENT: no such file or directory, open '.../app/config/stem-map.json'`.

**Recommended fix** — Give each row the line's expected start and assert it, in place of the `toContain`:
```diff
     {
       name: 'malformed, with a trailing comma',
+      problem: 'config/stem-map.json is not valid JSON: ',
       stemMap: async (config: string) => {
...
-    { name: 'missing', stemMap: async () => {} },
-  ])('prints one problem line ... when config/stem-map.json is $name', async ({ stemMap }) => {
+    { name: 'missing', problem: 'config/stem-map.json cannot be read: ', stemMap: async () => {} },
+  ])('prints one problem line ... when config/stem-map.json is $name', async ({ problem, stemMap }) => {
...
-    expect(result.stderr).toContain('config/stem-map.json');
+    expect(result.stderr.startsWith(problem)).toBe(true);
```

**Remediation brief**
- **Design intent:** a stem map the command cannot read or parse stops the build with one stderr line that starts by naming `config/stem-map.json` and what is wrong with it, then keeps the cause's message; exit 1, nothing written (README `:96`).
- **Full surface:** `test/set-builder-command.test.ts:531-557`. No source change. When finding 4 lands in the same pass, its row joins this `it.each` with its own `problem`.
- **Must preserve:** the other assertions of the test (exit 1, empty stdout, no `at` lines, one line, no project folder); the copy-of-`src/` setup, which is how the test reaches the real `import.meta.dirname` path.
- **Do not touch:** `oneLine` in `main.ts:157` (Minor).
- **Proof:** remove the `config/stem-map.json cannot be read: ` prefix in `main.ts:162`, run `pnpm exec vitest run test/set-builder-command.test.ts -t "config/stem-map.json"`, see the missing row red; revert, see both green.

### 4. A stem map that gives a group a string instead of a list now splits the string into one-letter stems — LOW
- **Location:** `src/set-builder/template.ts:78-80`; the read at `src/set-builder/main.ts:164-168`
- **Attribution:** introduced by `a5f2beb` (setlist-controller#109), which replaced `stems.map(...)` with `for (const stem of stems)`. At `$BASE` the same map threw `stems.map is not a function`, printed as one line by `build()`'s catch.
- **Real-world trigger:** the README's own instruction, adding a stem to `config/stem-map.json` by hand, done as `"VOX": "BGVS"` instead of `"VOX": ["BGVS"]`. The file is valid JSON, so #110's check passes it. A song with a BGVS stem then stops with `the stem map has no group for the stem "BGVS"`, which sends the operator to a map that, to the eye, lists it. The build still stops, so: LOW.

**Evidence**
```ts
for (const [target, stems] of Object.entries(stemMap)) {
  for (const stem of stems) targetOf.set(stem, ...);
```

**Failure mode** — Executed: `stemTargets({ VOX: 'BGVS' })` at HEAD returns `[['B','VOX'],['G','VOX'],['V','VOX'],['S','VOX']]`; at `e8b58d3` it throws `stems.map is not a function`. `repeatedStemProblems` (`checks.ts:37-38`) already walked a string this way at base.

**Recommended fix** — Check the shape where the map is read, in `stemMapFile`, so a wrong shape stops the build with the same kind of one line as a JSON error:
```diff
+function isStemMap(value: unknown): value is StemMap {
+  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((stems) => Array.isArray(stems) && stems.every((stem) => typeof stem === 'string'));
+}
+
 async function stemMapFile(): Promise<StemMap> {
 ...
+  let parsed: unknown;
   try {
-    return JSON.parse(text) as StemMap;
+    parsed = JSON.parse(text);
   } catch (error) {
     throw new Error(`config/stem-map.json is not valid JSON: ${oneLine(error)}`, { cause: error });
   }
+  if (!isStemMap(parsed)) throw new Error('config/stem-map.json must list each group\'s stem names in square brackets, such as "VOX": ["BGVS"].');
+  return parsed;
 }
```
plus a third row in the `it.each` at `test/set-builder-command.test.ts:531`, writing `{ "VOX": "BGVS" }` and expecting the line to start `config/stem-map.json must list`. Update the comment at `main.ts:154-155` to name the shape check, and add "or does not list each group's stems in square brackets" to README `:96`.

**Remediation brief**
- **Design intent:** `stemMapFile` is the one gate between the file and the build: everything after it trusts the map's shape (an object of string arrays, `StemMap`). A file that fails the gate stops the build with one stderr line that names `config/stem-map.json`, exit 1, nothing written.
- **Full surface:** `src/set-builder/main.ts:154-169`; `test/set-builder-command.test.ts:531-557` (a new row); `README.md:96`. `test/readme.test.ts` checks flags only, so the README edit needs no test change.
- **Must preserve:** the two existing #110 rows and their messages; `stemMapFile` running inside `build()`'s `try` (`main.ts:126-127`) before `buildSet`; the committed `config/stem-map.json` passing the gate (the stop-rules test `commits a stem map that lists each stem once` and every build test read it). An empty group (`"OTHER": []`) passes.
- **Failure of the fix:** none new; the gate throws, and the existing catch prints it.
- **Do not touch:** `stemTargets`' loop (`template.ts:78-80`), which is correct for a well-shaped map; reverting it to `.map` would only bring back the base's unhelpful error.
- **Proof:** the new row is red at HEAD (the build stops with `the stem map has no group` lines or writes, not with the gate's line) and green after: `pnpm exec vitest run test/set-builder-command.test.ts -t "config/stem-map.json"`.

## Needs Further Investigation
### A. Whether Live 12 writes a type-3 `RelativePath` that climbs out of the song's folder — confirm with one real set
The comment at `test/set-builder-stop-rules.test.ts:670` says "Live 12 stores a WAV in a folder beside the song's as relative path type 3 with a path that climbs out", and #111's body says the same. Round 3 dismissed the case as "Live never writes one", and the fixture template uses types 1 and 5 for files outside the project. These records disagree, and nothing in the repo settles it. It changes no fix: #111's check is right either way. It decides whether finding 2's trigger is real and whether the comment is a fact or should read "guards a hand-edited set". To settle it: in Live 12, drag a WAV from a folder beside a song's folder into that song, save, and read the clip's `FileRef` (`gunzip -c MultiTrack.als | grep -A3 RelativePathType`). Nick's call, since it needs Live.

## Reviewed and Dismissed
- `stemTargets` and `repeatedStemProblems` walk the map separately (round 3 asked for one walk) — they agree on every order case executed (A,A,B / A,B,A / A,B,B / A,A), and the #109 tests plus the same-target test pin both.
- `stemProblems`' `unmapped` line for a doubled stem (`checks.ts:62`) — uses `targetOf.has`, which is true for a doubled stem's undefined entry, so it is still mapped; the #109 test at `:356` would go red otherwise.
- `placeClips`' "has no target" throw for a doubled stem (`write-set.ts:60`) — unreachable: `templateProblems`, which holds `repeatedStemProblems`, is in every problem list before a write (`build-set.ts:117-128`); the `!found.ok` path returns before any write.
- `MultiTracks/../EG 1.wav` returned un-normalized by `fileInSong` — the copy source goes through `join(song.folder, file)`, which normalizes it, and the destination is `Songs/<title>/${basename(file)}`, so no `..` reaches the project.
- #110 read order — the stem map is still read after the usage checks and before `buildSet`, as before; a stem map problem still writes nothing.
- #110 test's copy of `src/` — `main.ts` resolves `../../config` from `import.meta.dirname`, so the copy reads the test's `app/config`; the workspace is under the gitignored `dist/` and `afterEach(removeWorkspaces)` removes it.
- The trailing-comma fixture (`test/set-builder-command.test.ts:536`) — red at base with a `SyntaxError`, so the regex does match; were it ever not to, the map would stay valid, the build would write, and the test would go red.

## Minor / nits
- `oneLine` in `stemMapFile` (`main.ts:157`) never changes a message the tests produce: Node's JSON and ENOENT messages hold no newline, so removing it leaves the tests green. Defensive, cheap, and harmless; no input in reach exercises it.
- `build()`'s catch (`main.ts:147-150`) prints a multi-line message as is. Executed: `parseAls` on malformed XML throws `Missing end tag for element LiveSet (line 2, column 19)\n  <Ableton><LiveSet></Ableton>\n  ^`, so a template that gunzips but holds bad XML prints three lines, against README `:90`'s "prints one line". Pre-existing, untouched; Live does not save such a file. Moving `oneLine` into the catch would make the rule hold for every error, as a follow-up.
- `placeClips`' guard message (`write-set.ts:60`) still reads "has no target" for a doubled stem, which now also lands there; unreachable (Dismissed), so the wording is only for a reader.
- A type-3 path that normalizes to `.` (`""`, `.`, `a/..`) counts as in the folder, and a backslash path (`..\x.wav`) stays in and is reported missing. Both were so at base; Live on a Mac writes neither.
- A wrong-shape stem map other than a string group, such as `null` or `{ "VOX": 5 }`, now prints one line (`Cannot convert undefined or null to object`, `stems is not iterable`) that does not name the file. Finding 4's gate covers these too.

## Test quality
Tests added: 7 cases in 2 files (4 in `test/set-builder-stop-rules.test.ts`, two of them one `it.each`; 2 in `test/set-builder-command.test.ts`, one `it.each`). Red at `$BASE`: 6, each for its intended reason (an extra VOX count line, two extra overlap lines, a set written from a sibling folder's WAV, a `../` missing-file line, and two stack traces). Green at `$BASE`: 1, `stops on an overlap with a stem moved to a group with too few tracks, naming the count the overlap needs` (`:904`), which is #109's acceptance criterion that a moved stem keeps its line: a regression guard, kept. Tautology shapes: none. Every expectation is a literal string, nothing is mocked, the stop-rules tests call the real `buildSet` and the command tests spawn the real `main.ts`, and `editSongTrack` throws on an edit that changes nothing. Mutation gaps: findings 1, 2 and 3, and the `oneLine` nit.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` green at `5371f93`; `pnpm test:e2e` green locally.
- **Commit hygiene:** 8 commits, each implement commit with its ticket reference, plus the lane merges; nothing to drop. Commit this doc.
- **Likely reviewer asks:** why the stem map is not checked for shape when it is checked for JSON (finding 4); whether Live really writes a climbing type-3 path (Needs Further Investigation A).

## Verdict
Ready to open the PR as it stands. No finding gates it: the four LOW findings (three test gaps and the string-group split) can be remediated first through `/pr-review-remediate` or carried as follow-ups. Of the prior review's findings this run's tickets carry, round 3 finding 3 is fixed in code by #109 (by a different mechanism than round 3 recommended, recorded under Approach decisions), round 3 finding 4 is fixed in code by #110 rather than by the README edit round 3 recommended, and round 3's dismissed `../` case is fixed by #111. None was resolved only by editing a comment or a doc.
