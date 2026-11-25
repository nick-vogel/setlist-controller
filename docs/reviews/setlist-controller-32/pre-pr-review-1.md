# Pre-PR review: setlist-controller#32 Set builder: one command builds the Sunday set from the song library

**Branch:** `setlist-controller-32-set-builder` vs `origin/setlist-controller-1-ipad-rehearsal` (merge-base `a5c78a4` "setlist-controller#1 pre-PR review 3")
**Reviewed at:** HEAD `e5cbd88` (setlist-controller#38 Command conveniences: short song names, next-Sunday date, replace, summary), clean tree: 0 files with uncommitted changes, 0 untracked; 26 files total, +3422 / -1 against the merge-base (15 source and config files, 6 test files, 5 binary `.als` fixtures)
**Reviewed against:** the epic body of setlist-controller#32 (the spec), the bodies of #34 to #39, and the decisions each ticket recorded during its `/epic-loop` run (assumptions and filed proposals). No `CODING_STANDARDS.md`, `docs/coding-standards.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs exist in the repo, so conformance is judged against the spec and the five universal review rules. No earlier pre-PR review of #32 exists; this is round 1, run with `--fresh`.
**Date:** 2026-10-16
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

The branch lands five tickets as merges: #34 `1489133`, #36 `4946fb3`, #35 `a154040`, #37 `89c614e`, #38 `e5cbd88`, each with its own review-pass fix commits (60 of the 70 commits). #39, the acceptance run in Live, is by hand and not part of the diff.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | ok, lockfile unchanged (`@rgrove/parse-xml` 5.0.0 installed) |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 24 files, 316 passed, 2 skipped (both `it.runIf(linux)` in `test/setup-screen.test.ts`, unchanged by this branch) |
| Build | `pnpm build` | pass |
| Playwright suite | `pnpm test:e2e` | 7 passed (webkit-ipad) |
| Controller reads the built set | probe: `buildSet` on the fixture library for Grace/Goodness/Trust, Goodness/Trust/Grace, Trust/Grace/Goodness and Goodness twice, locators run through the real `parseSet` (`src/server/set-parser.ts`) | 0 warnings in all four; titles right; summary start bars [1, 122, 208], [1, 87, 275], [1, 189, 310], [1, 87]. A finder repeated it with a title holding nested parentheses and an en dash: 0 warnings |
| Plain build that fails while writing | executed repro `repro/review-1-partial-write.test.ts` (one WAV removed from the library, no `--replace`) | red: the set folder is left with `Ableton Project Info` (2 files) and 12 audio and `.asd` files, no `.als` (finding 1) |
| Song whose end marker is named End | executed repro `repro/review-1-controller-reads-built-set.test.ts` | red: `parseSet` warns `repeated-end` (finding 3); the three-song case in the same file is green |
| Recommended fixes for findings 1, 2, 3 and 4 | applied in scratch worktrees at HEAD under the scratchpad, since removed | both repros green; the 7 set-builder test files 117 passed; `test/set-builder.test.ts` 61 passed with the `parseSet` check inside its `build` helper; typecheck and lint pass; finding 4's fix resolves a relative `--library` from `test/` correctly and the command test stays 6 of 6 |
| Real song library | read-only scan of the 7 songs in `~/Music/MultiTracks` through `readSong` | all Live 12; each has exactly one blank end marker, none named End, no `IsSongStart` true, a Count Off, and no tempo ramp (every in-song tempo change is a step) |
| Fixture template and stem map | probe through `templateTargets`; `config/stem-map.json` read against the spec table | DRUMS 5, BASS 5, A GTRS 6, E GTRS 11, KEYS 8, VOX 4, OTHER 4 slots, GUIDE and MT CLICK single tracks; the map matches the spec name for name |
| Take-lane XML path | read-only look at a Live 12 file (`Ableton Live 12 Trial.app/.../Templates/Vocal Recording.als`) | `TakeLane > ClipAutomation > Events` exists as `song.ts:75` reads it |
| pnpm working folder | scratch package with a script printing `process.cwd()` and `INIT_CWD`, run from a subfolder (pnpm 10.13.1) | the script runs in the package root; `INIT_CWD` holds the invoking folder. pnpm's docs (pnpm.io/cli/run, rung 4 web fetch) do not document `INIT_CWD` |
| Test tautology audit | the 5 new test files run at `a5c78a4` in a scratch worktree; shape read; 4 mutations in a second scratch worktree | all 5 red at base (import failure, or no `build-set` script); no mocks, snapshots, or self-computed expectations; 2 coverage gaps (findings 1 and 2) and 2 weak assertions (Test quality) |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #39 is Nick's manual run |

**Overall:** The set builder does what #32 asks across all five tickets: songs placed end to end with the right gaps and bar lines, one stitched tempo and meter map, locators the controller reads with zero warnings, self-contained audio, every input problem collected before writing, short names, the default date, a safe `--replace` and the summary. Two MEDIUM findings gate the PR: a plain build that fails while copying audio leaves a half-written set folder that then blocks the rebuild, and no test runs the built set through the controller's own parser as the spec requires, which is how finding 3 went unseen. Both fixes are small and were verified in scratch. There is no CRITICAL or HIGH finding.

## Approach decisions
- **Cleanup after a failed write, plain build (finding 1):** the folder the build created with its non-recursive `mkdir` is removed on any write failure and the error rethrown, mirroring the catch in `replaceFolder` (`src/set-builder/build-set.ts:116-119`). The `mkdir` stays outside the `try`, so a folder the build did not create is never removed.
- **Controller cross-check (finding 2):** set-builder tests read the built locators back and run them through the real `parseSet` from `src/server/set-parser.ts`, expecting zero warnings. The local `CONTROLLER_GRAMMAR` regex goes.
- **End marker (finding 3):** a locator whose trimmed name is empty or exactly `End` (the name `parseSet` reads as a song's End) is an end marker. One predicate, `isEndMarker`, serves the timeline and the locator renaming.
- **Relative path flags (finding 4):** resolved against the folder the command was run from, `process.env.INIT_CWD ?? process.cwd()`.
- **Relative path flags, amended by the round 1 remediation (finding 4 rework, `1ee1225`):** `INIT_CWD` is taken only when `npm_lifecycle_event` is `build-set`, which pnpm sets for this script along with `INIT_CWD`, both overriding inherited values (pnpm 10.13.1, by execution). Any other run, plain `node src/set-builder/main.ts` included, resolves against `process.cwd()`, so a leftover `INIT_CWD` from an earlier script never wins. This supersedes the bare `INIT_CWD ?? process.cwd()` above.
- **A cleanup that itself fails (finding 1):** tested by making the song's `Ableton Project Info` read-only in the library, which `cp` copies with its mode, so the `rm` in the catch fails with EACCES. The test restores both modes before the workspace is removed, and is skipped when run as root. Per the brief, the `rm` error then replaces the write error, and the existing-folder stop plus `--replace` is the backstop the test pins.

## Confirmed Issues

### 1. A build without `--replace` that fails while writing leaves a half-written set folder, which then blocks the rebuild as "already exists" — MEDIUM
- **Location:** `src/set-builder/build-set.ts:99-102`
- **Attribution:** introduced. `git log -S'await mkdir(folder);'` gives `c3bec61` (setlist-controller#35 Self-contained project). `replaceFolder`, which cleans up the same failure for a replacing build only, came in `9d51050` (setlist-controller#38 review pass 1 finding 1). Nothing under `src/set-builder/` exists at `a5c78a4`.
- **Real-world trigger:** a song folder missing one WAV (an interrupted download or a half-synced copy, the case the replace test at `test/set-builder.test.ts:1193-1199` names), a full disk, or a permission error part way through the copy. No check catches a missing WAV before writing (the filed proposal "Check every clip's audio file before writing").

**Evidence**
```ts
  await mkdir(options.outputRoot, { recursive: true });
  if (options.replace) {
    await replaceFolder(folder, writeProject);
  } else {
    await mkdir(folder);
    await writeProject(folder);
  }
```

**Failure mode** — With `AG 2.wav` removed from Goodness of God and no `--replace`, `buildSet` rejects with Node's ENOENT naming `AG 2.wav` and leaves `<output root>/2026-10-18 Sunday/` holding `Ableton Project Info/` (2 files) and `Songs/Goodness of God/` (12 files), with no `.als`. The next build without `--replace` stops with "`<folder>` already exists. Build with --replace to replace it.", although no set exists. User story 41 ("write nothing when it stops") is broken for every failure after the checks pass; a replacing build already meets it.

**Recommended fix**
```diff
   } else {
     await mkdir(folder);
-    await writeProject(folder);
+    try {
+      await writeProject(folder);
+    } catch (error) {
+      await rm(folder, { recursive: true, force: true });
+      throw error;
+    }
   }
```
`rm` is already imported in `build-set.ts`.

**Remediation brief**
- **Design intent:** `buildSet` checks every input and returns problems before it writes a byte, so a returned problem always means nothing was written. Writes then run in order (project folder, `Ableton Project Info`, audio, `.als` last), so a `.als` appears only once every file it refers to is in place. A replacing build writes into a hidden work folder and swaps it in only when whole. A plain build writes straight into a folder it has just created with a non-recursive `mkdir`, so on failure that folder holds only what this build wrote.
- **Full surface:** `src/set-builder/build-set.ts:99-102` (the plain branch). The new test goes in `test/set-builder.test.ts`, in `describe('a set folder that already exists'` (`:1125`) beside the `it.each` at `:1177-1210`, which covers only `replace: true`.
- **Must preserve:** `await mkdir(folder)` stays outside the `try`: when the folder already exists (a race past the `existing` check) the build must throw without removing anything. A successful plain build is unchanged (`test/set-builder.test.ts` `describe("copying each song's audio into the project"` at `:831`). A replacing build is unchanged (`:1137`, `:1153`, the `it.each` at `:1177`). The write order inside `writeProject` (`:91-95`) is unchanged. The thrown error still reaches the command, which prints its message and exits 1 (`src/set-builder/main.ts:68-71`).
- **When the fix itself fails:** if `rm` throws, its error replaces the write error and part of the folder may stay. The backstop is the existing-folder stop plus `--replace`, which writes into a fresh work folder. Do not wrap `rm` in a catch that swallows the original error.
- **Do not touch:** the missing-WAV pre-check (filed proposal, out of scope here); `replaceFolder`'s rename sequence (Minor / nits, first bullet).
- **Proof:** `cp docs/reviews/setlist-controller-32/repro/review-1-partial-write.test.ts test/ && pnpm exec vitest run test/review-1-partial-write.test.ts; rm test/review-1-partial-write.test.ts`. Red now (17 entries left in the set folder); green after (verified in scratch). Then add the case to the real suite: in `test/set-builder.test.ts`, seed the output root with a set for another date, remove `libraryFile(workspace, GOODNESS, 'AG 2.wav')`, expect `buildSet(await buildOptions(workspace, ['goodness']))` to reject with `'AG 2.wav'`, and expect `snapshotFolder(workspace.outputRoot)` to equal the snapshot taken before. Then `pnpm test`.

### 2. No build test runs the built set through the controller's parser, as the spec's testing decision requires — MEDIUM
- **Location:** `test/set-builder.test.ts:129-130`, used at `:340` and `:636`; the shared `build` helper at `:134-136`
- **Attribution:** introduced. `CONTROLLER_GRAMMAR` came in `0db4a2a` (setlist-controller#34 Tracer bullet) and was reused in `5d01ff1` (setlist-controller#36). No set-builder test imports `src/server/set-parser.ts`; only `test/setlist.test.ts` does.
- **Real-world trigger:** any change, or any song shape, that yields controller warnings in a built set while every name still matches `<number> - <text>`. One already exists: finding 3.

**Evidence**
```ts
// The controller's locator grammar, checked directly: `<song number> - <section>`.
const CONTROLLER_GRAMMAR = /^\d+ - \S.*$/;
```
#32, Testing Decisions: "Every successful build test runs the output's locators through the controller's existing locator parser and expects zero warnings and the expected songs and sections." Implementation Decisions: "It reuses the controller's existing locator parser as the check that the output reads cleanly."

**Failure mode** — The regex checks one name at a time. It cannot see `parseSet`'s set-level warnings: `repeated-end`, `missing-end`, `section-after-end`, `overlapping-songs`, `song-number-gap`. The fixture with its end marker named `End` builds `1 - End` twice; both match the regex, and `parseSet` warns `repeated-end` (finding 3). User story 37 (zero warnings on the iPad) has no automated guard.

**Recommended fix** (in `test/set-builder.test.ts`; verified in scratch: 61 of 61 pass)
```diff
 import { buildSet, type BuildOptions, type BuildResult } from '../src/set-builder/build-set.ts';
+import { parseSet } from '../src/server/set-parser.ts';
@@
 async function build(workspace: Workspace, ...songs: string[]) {
-  return buildSet(await buildOptions(workspace, songs));
+  const result = await buildSet(await buildOptions(workspace, songs));
+  if (result.ok) {
+    const root = await readSet(result.setPath);
+    expect(parseSet(locators(root).map(({ name, time }) => ({ name, time }))).warnings).toEqual([]);
+  }
+  return result;
 }
```
Then delete `CONTROLLER_GRAMMAR` (`:129-130`) and its two loops (`:340`, `:636`). In the three-song test at `:625`, add the expected songs from `parseSet`: numbers 1 to 3 with titles This Is Amazing Grace, Goodness of God and Trust In God.

**Remediation brief**
- **Design intent:** the builder's locators are only useful if the controller reads them: `parseSet` groups `<number> - <section>` locators into songs, takes `(<title>)` on a song's first locator, takes the first locator named `End` as the song's End, and warns on anything it cannot place. The spec makes `parseSet` the oracle for every successful build. Tests read the built `.als` back with `@rgrove/parse-xml` through the harness, never through the builder's own modules; `parseSet` is the controller's module, not the builder's, so importing it keeps that rule.
- **Full surface:** `test/set-builder.test.ts:6` (imports), `:129-130`, `:134-136`, `:340`, `:625-640`. `locators(root)` at `:94-101` already reads names and times. `readSet` is already imported from the harness (`:24`).
- **Must preserve:** every exact locator assertion (names, times, Ids, no key mappings) in the tests at `:314`, `:343`, `:356`, `:386` and `:625`; they pin more than `parseSet` does. Tests that call `buildSet` directly (`:1177`, `test/set-builder-stop-rules.test.ts`, `test/set-builder-command.test.ts`) are untouched.
- **Do not touch:** `test/set-builder-harness.ts`'s rule that it reads sets "not through src/": the check lives in the test file, not the harness.
- **Proof:** `cp docs/reviews/setlist-controller-32/repro/review-1-controller-reads-built-set.test.ts test/ && pnpm exec vitest run test/review-1-controller-reads-built-set.test.ts; rm test/review-1-controller-reads-built-set.test.ts`. The first case is the cross-check (green now); the second goes red on `repeated-end` until finding 3 lands. After this change, `pnpm exec vitest run test/set-builder.test.ts` is green (61 tests), and finding 3's new test goes red through the `build` helper until its fix.

### 3. A song whose end marker is named End gets a second End, and the controller warns — LOW
- **Location:** `src/set-builder/timeline.ts:47-49` (`isEndMarker`), consumed at `timeline.ts:38` and `src/set-builder/write-set.ts:138`; the added End at `write-set.ts:143-144`
- **Attribution:** introduced. `isEndMarker`'s blank-only test came in `0db4a2a` (setlist-controller#34) and moved to the timeline in `5d01ff1` (setlist-controller#36). Recorded as F3.1 in #34's review pass 3 (LOW, unfixed).
- **Real-world trigger:** none known. All 7 library songs have one blank end marker and none named End (read-only scan). It happens when Nick renames a song's end marker to End in Live, or a song comes from a source that names it. LOW, capped: raise to MEDIUM if any library song has a locator named `End`; check with the scan in this doc's verification table.

**Evidence**
```ts
export function isEndMarker(locator: Element): boolean {
  return valueOf(locator, 'Name').trim() === '';
}
```
`locatorsFor` passes a locator named `End` through as `N - End` (`write-set.ts:138`), then, finding no blank marker, adds a second `N - End` (`:144`).

**Failure mode** — This Is Amazing Grace with its end marker renamed `End` builds `1 - End` at 468 and again at 472. `parseSet` warns "Song 1 has more than one End locator. The first one counts." The song still ends on its own marker, so playback is right, but the iPad shows a warning, against user story 37.

**Recommended fix**
```diff
 export function isEndMarker(locator: Element): boolean {
-  return valueOf(locator, 'Name').trim() === '';
+  const name = valueOf(locator, 'Name').trim();
+  return name === '' || name === 'End';
 }
```

**Remediation brief**
- **Design intent:** MultiTracks marks a song's end with a blank-named locator. The timeline takes the first end marker in time order as the song's End and places the gap from the later of it and the audio end (`timeline.ts:38-41`); `locatorsFor` renames every end marker to `N - End`; a song with none gets an added End (`addedEnd`, `timeline.ts:54-58`). `parseSet` reads a locator named exactly `End`, after trimming, as the End. The builder's end markers must be exactly the locators that come out as `N - End`.
- **Full surface:** `src/set-builder/timeline.ts:47-49`. Both callers (`timeline.ts:38`, `write-set.ts:138`) follow through the shared predicate. The test goes in `test/set-builder.test.ts` beside `:386`, using `nameBlankLocator(workspace, GRACE, 'End')` from the harness and the `build` helper from finding 2.
- **Must preserve:** songs with a blank marker build exactly as now (every fixture and library song). The added-End rules: `:386` (End on the first bar line after a named locator past the audio end) and the #36 variants (Grace's marker moved to 456; named Outro, giving an added End at 472). Several end markers: the first is the End and all are renamed `N - End` (#36 decision). A lowercase `end` stays a section, as `parseSet` reads it.
- **Do not touch:** the `barAfter` term in `addedEnd` (#34 review pass 2 decision); `Count Off` renaming.
- **Proof:** the repro's second case (command under finding 2) red now, green after (verified in scratch). Then the new case in `test/set-builder.test.ts`, red through the `build` helper before the fix, green after; `pnpm test`.

### 4. Relative `--library`, `--template` and `--output-root` resolve against the repo root, not the folder the command was run from — LOW
- **Location:** `src/set-builder/main.ts:49`, `:55`, `:59`
- **Attribution:** introduced, `0db4a2a` (setlist-controller#34) per `git log -S'resolve(values.library'`.
- **Real-world trigger:** running `pnpm build-set` from a folder below the repo root with a relative path flag. pnpm runs the script in the package root, so `resolve()` ignores the caller's folder. With the defaults, or from the repo root, nothing changes.

**Evidence**
```ts
const library = resolve(values.library ?? join(homedir(), 'Music/MultiTracks'));
```

**Failure mode** — From `test/`, `pnpm --silent build-set zzz --library ./fixtures/set-builder/library` prints "Cannot read the song library `<repo>/fixtures/set-builder/library`." (the `test/` segment dropped). A relative `--output-root` writes the set into a folder the operator did not name.

**Recommended fix**
```diff
-const library = resolve(values.library ?? join(homedir(), 'Music/MultiTracks'));
+const from = process.env.INIT_CWD ?? process.cwd();
+const library = resolve(from, values.library ?? join(homedir(), 'Music/MultiTracks'));
@@
-    template: resolve(values.template ?? join(library, TEMPLATE_FOLDER, 'template Project/template.als')),
+    template: resolve(from, values.template ?? join(library, TEMPLATE_FOLDER, 'template Project/template.als')),
@@
-    outputRoot: resolve(values['output-root'] ?? join(homedir(), 'Music/Ableton/Sets')),
+    outputRoot: resolve(from, values['output-root'] ?? join(homedir(), 'Music/Ableton/Sets')),
```

**Remediation brief**
- **Design intent:** `main.ts` is the thin wrapper: it parses flags, works out defaults and absolute paths, calls `buildSet`, and prints the summary or the problems. Paths it hands to `buildSet` are absolute. The operator runs it through `pnpm build-set`, whose script runs `node src/set-builder/main.ts` in the package root.
- **Full surface:** `src/set-builder/main.ts:49`, `:55`, `:59`. Test: `test/set-builder-command.test.ts`, a case that spawns `pnpm --silent build-set` with `cwd` set to the workspace folder and relative `--library library`, `--template` and `--output-root Sets`, expecting exit 0 and the set at `setPath(workspace)`. `run()` (`:23-34`) hard-codes `cwd: REPO_ROOT`, so the case needs its own spawn or a `cwd` parameter.
- **Must preserve:** the defaults (absolute paths under the home folder) and `--template`'s default inside the resolved library; every existing command test, which passes absolute paths from `REPO_ROOT` (6 pass with the fix, verified in scratch).
- **Grounding:** `INIT_CWD` is not in pnpm's docs (pnpm.io/cli/run, rung 4). That pnpm 10.13.1 sets it to the invoking folder and runs the script in the package root was confirmed by execution in a scratch package. The `?? process.cwd()` fallback covers a run without pnpm.
- **Proof:** `(cd test && pnpm --silent build-set zzz --library ./fixtures/set-builder/library)`. Now: "Cannot read the song library `<repo>/fixtures/set-builder/library`." After: `"zzz" matches no song folder in <repo>/test/fixtures/set-builder/library. The song folders are:` and the three fixture folders (verified in scratch). Neither run writes anything. Then the new command test and `pnpm test`.

### 5. The command's fallback exits have no test: an unknown flag, an impossible `--date`, and a build that throws — LOW
- **Location:** `src/set-builder/main.ts:40-42` (parse error, exit 2), `:46` (not a real date, exit 2), `:68-71` (a thrown build, exit 1)
- **Attribution:** introduced, `0db4a2a` (setlist-controller#34) per `git log -S'function isDate'`.
- **Real-world trigger:** a typo on a Sunday morning (`--data`, `--date 2026-10-32`), or a template that cannot be read. The behaviour is right today; nothing pins it.

**Evidence** — `test/set-builder-command.test.ts` asserts exit 2 only for "no song named" (`:135-140`), and exit 1 only for collected problems (`:108-123`) and an existing folder (`:146-153`). `grep -rn "real date\|Unknown option\|2026-02-30" test` finds nothing. The universal rule "a test for every fallback path" is unmet for three paths, one of which (`isDate`) is a #34 recorded decision.

**Recommended fix** — three cases in `test/set-builder-command.test.ts`, using `run()` and `paths(workspace)`, each also asserting `existsSync(projectFolder(workspace))` is false:
- `run(['grace', '--bogus', ...paths(workspace)])`: exit 2, stderr contains `Usage:`.
- `run(['grace', '--date', '2026-02-30', ...paths(workspace)])`: exit 2, stderr starts with `--date must be a real date written YYYY-MM-DD, not 2026-02-30.`
- `run(['grace', '--date', DATE, '--library', workspace.library, '--template', join(workspace.dir, 'none.als'), '--output-root', workspace.outputRoot])`: exit 1, stderr contains `ENOENT` and `none.als`, stdout empty.

**Remediation brief**
- **Design intent:** exit 2 is a usage error caught before any build (`usage()` prints the problem and the usage text); exit 1 is a build that stopped (problems, or a thrown error whose message is printed without a stack). The template read throws by decision (#37: "The template's own read still throws"), so the third case pins that exit, not a collected problem.
- **Full surface:** `test/set-builder-command.test.ts` only. No source change.
- **Must preserve:** the six existing command tests; `isDate`'s rule (a real calendar date written YYYY-MM-DD).
- **Do not touch:** the template read in `buildSet` (Reviewed and Dismissed, second bullet).
- **Proof:** the three cases pass on first run, since the behaviour exists. Show that each can go red: make `isDate` return true, make `usage()` exit 1, or drop `process.exitCode = 1` from the catch, and run `pnpm exec vitest run test/set-builder-command.test.ts`. The matching case fails each time. Restore, then `pnpm test`.

## Needs Further Investigation

### A. A later song whose first tempo event is a ramp, not a step, may ramp across its gap
For song 2 and later, `stitch` moves the song's starting tempo event to the previous gap start (`src/set-builder/write-set.ts:82`). If the song's first tempo event after beat 0 has a value other than its start and no step partner, Live would ramp from the gap start to that event, where in the source it ramps from Time -63072000, nearly flat. Unwarped audio would then drift against bars in the gap and the song's opening beats. None of the 7 library songs has such an event: every in-song change is a step (read-only scan). What would confirm it: a song with a lone tempo event after beat 0 at a new value, built as song 2, opened in Live, with the click checked against the grid; plus confirmation that Live interpolates from the -63072000 event. Not reachable today.

### B. `--replace` while the old set is open in Live
The swap renames the old folder away and deletes it. If Live still holds the old set and Nick then saves in Live, Live may write the old set over the new `.als`. What would confirm it: during #39's acceptance run, build, open, rebuild with `--replace` while open, and see what Live does on save. This is operator workflow, not code.

## Reviewed and Dismissed
- A clip whose WAV is outside its song folder throws instead of returning a problem (`src/set-builder/audio.ts:19-23`): recorded decision (#37 fix pass 1 F1.1) and the filed proposal "Check every clip's audio file before writing". It writes nothing (`writeSet` runs before any `mkdir`), and `test/set-builder-stop-rules.test.ts` pins the throw. Do not touch.
- A template that cannot be read throws a raw error (`build-set.ts:67`) and hides the other problems: recorded decision (#37: "The template's own read still throws"). The unreadable-library path dropping the default template's failure (`readableTemplateProblems`, `:127-132`) is #38 fix pass 1 F1.2. Do not touch.
- Take-lane detection reads a path no fixture holds (`song.ts:73-76`): a real Live 12 file holds `TakeLane > ClipAutomation > Events`, as read.
- Several song-start flags in one set: no library song has `IsSongStart` true, and the added End sets it false.
- Clip Ids, tempo and meter event order and Ids, the old-then-new step at each gap, the cut at the gap start, the FileRef rewrite (including the replace path's final folder): all checked by execution and correct.
- `audioCopies` deduplicates on the exact place while `audioProblems` compares case- and NFC-insensitively: they agree for every case that can occur, because a problem stops the build first.
- `--date` accepts a weekday and still names the set "Sunday": the spec defines the output as `<date> Sunday/`. A question for Nick if special services matter, not a defect.
- A name that matches nothing lists every library folder: recorded decision (#38 name problem wording).
- Gap events at equal values, the gap step's old value, the cut of each song's events at its gap start, the starting value at or before beat 0, strict rounding up to a bar, two meter events at one time as one bar line: all recorded decisions (#34, #36, #38), each pinned by tests.
- A missing WAV, a named locator after the blank End, session-view clips, one stem under two map groups, NFD short names, a song with no Count Off, README docs for `pnpm build-set`: filed proposals, out of scope here.

## Minor / nits
- In `replaceFolder` (`build-set.ts:120-122`), a failure of the second `rename` leaves the old set inside the hidden work folder rather than in place, and a failure of the final `rm` rejects after the new set is already in place. Both are renames within one folder on APFS; not executed. A hardening that renames the old folder back on failure is optional.
- A replacing build killed part way (Ctrl-C) leaves a hidden `.<date> Sunday replacing XXXXXX` folder in the output root; nothing sweeps it.
- The bar walk (`meter.ts:43-60`) never ends on a NaN point or meter code. Only corrupt XML reaches it (#34 review pass 3 F3.13).
- A song folder whose name starts with `-` gets an empty title (`Songs//Bass.wav`, `Count Off ()`). The `?? folder` at `song.ts:46` is dead code, since `split` always returns one element.
- An empty or space-padded short name (`""`, `"  grace"`) is not trimmed: `""` matches every folder, `"  grace"` matches none. Empty `--library`, `--template` or `--output-root` values resolve to the working folder.
- `config/stem-map.json` is read outside the command's `try` (`main.ts:50`): a JSON typo prints a stack trace, and the shape is only cast.
- A `_Template` folder in another letter case would be offered as a song (`library.ts:22` compares exactly); the real folder is `_template`.

## Test quality
Tests added: 5 files plus a harness (`test/als-round-trip.test.ts`, `test/set-builder.test.ts`, `test/set-builder-stop-rules.test.ts`, `test/set-builder-command.test.ts`, `test/set-date.test.ts`, `test/set-builder-harness.ts`). Green at `a5c78a4` (assert nothing new): 0, since all five fail at base on a missing import or the missing `build-set` script. Tautology shapes found: 0. No unit under test is mocked, no snapshot is stored (`snapshotFolder` hashes and compares), no expectation is computed with production code (the test's own `barLines` at `test/set-builder.test.ts:444` is an independent implementation, and the start bars it cross-checks are literal).
- Coverage gaps: finding 1 (no plain-build write failure) and finding 2 (no `parseSet` cross-check).
- `test/set-builder-stop-rules.test.ts:348`, "builds a song whose stem has an empty take lane", asserts only `ok: true` and the set path. A mutation that drops the clips of any track holding a take lane stayed green. Strengthen: assert EG 1's clip lands on the first E GTRS slot and the set holds all 15 clips.
- `test/set-builder-command.test.ts:146`: the `--replace` step builds `grace` over `grace`, so a replace that exits 0 without writing would pass. `buildSet`'s own replace test (`test/set-builder.test.ts:1137`) covers the behaviour. Strengthen: build `goodness` first, replace with `grace`, and assert the first locator is `1 - Count Off (This Is Amazing Grace)`.
- Mutations that went red, so these tests hold: counting every bar line twice where two meter events share a time (only `:1245` catches it); removing the old set before writing (only the `:1177` row "fails part way through writing the new set"); keeping the work folder after a failure (same row).

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` pass at HEAD; `pnpm test:e2e` passes locally.
- **Commit hygiene:** the tree is clean. Commit this doc and its `repro/` folder. The 60 review-pass commits carry each ticket's fix history; nothing to drop.
- **Stacking:** the PR base is `setlist-controller-1-ipad-rehearsal`, since #32 sits on unmerged #1. Open after #1 merges, or open against #1's branch, as Nick chose for this run.
- **Likely reviewer asks:** the README has no `pnpm build-set` section (filed proposal); #39's run in Live (no warning, no missing files, tempo and click in time through each gap) is still owed; the filed proposals listed under Reviewed and Dismissed.

## Verdict
**Not ready as-is.** Gate: findings 1 and 2 (both MEDIUM, both small, both fixes verified in scratch). Findings 3, 4 and 5 (LOW) can go in the same remediation pass or become follow-up tickets; finding 3's fix is one line and finding 2's test catches it. Severity counts: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW. No prior pre-PR review of #32 exists, so there are no prior findings to close.

## Remediation — 2026-10-16
Every confirmed finding was worked, the LOW tail included, in three clusters: the plain build's write path (1), end markers and the controller cross-check (2, then 3), and the command (4, then 5). Full checks after the last commit: `pnpm lint`, `pnpm typecheck`, `pnpm test` (24 files, 326 passed, 2 skipped), `pnpm build` and `pnpm test:e2e` (7 passed) all pass.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `24d7eb4` setlist-controller#32 pre-PR review 1 finding 1: A build without --replace that fails while writing leaves a half-written set folder that blocks the rebuild | red→green: `repro/review-1-partial-write.test.ts` (17 entries left, then none); new `test/set-builder.test.ts` case "leaves the output root exactly as it was when a build without replace fails part way through writing", red before the fix. A second case covers the cleanup failing too (see Approach decisions) | 0 | fixed (verify agent: byte-identical replace and success paths; the original write error reaches the caller) |
| 2 (MEDIUM) | `04b13e4` setlist-controller#32 pre-PR review 1 finding 2: No build test runs the built set through the controller's parser, as the spec's testing decision requires | test-only. Shown able to go red: a mutation renaming the end marker to `Ending` fails 50 tests through the `build` helper on `missing-end`, where the regex passed. The repro's first case is green, and finding 3's new case went red through the helper | 0 | proved by execution |
| 3 (LOW) | `32e3b0c` setlist-controller#32 pre-PR review 1 finding 3: A song whose end marker is named End gets a second End, and the controller warns | red→green: the repro's second case; new case "takes an end marker named End as the song's End...", red on `repeated-end` through the `build` helper. A lowercase `end` case pins the must-preserve | 0 new; 6 existing comment lines reworded from "blank-named marker" to "end marker", since the predicate is no longer blank-only | fixed (verify agent: 11 non-target variants byte-identical to the base, blank marker, moved, none, Outro, `end`, `END`, `Ending`, `End (x)`, two blanks, a later End; whitespace handling matches `parseSet`) |
| 4 (LOW) | `f38bf00` setlist-controller#32 pre-PR review 1 finding 4: Relative --library, --template and --output-root resolve against the repo root, not the folder the command was run from | red→green: `(cd test && pnpm --silent build-set zzz --library ./fixtures/set-builder/library)`; two command cases (relative `--template`, default template) red before the fix | 0 | introduced: a plain `node` run took a leftover `INIT_CWD` over its own folder. Reworked in `1ee1225` |
| 4 rework | `1ee1225` setlist-controller#32 pre-PR review 1 finding 4 rework: A plain node run of the command takes a leftover INIT_CWD over its own folder | red→green: new command case spawning `node src/set-builder/main.ts` from the workspace with `INIT_CWD` set to the repo root and `npm_lifecycle_event` to `dev:server`; both pnpm cases still green under `pnpm exec vitest` and `pnpm test` | 0 | fixed (scoped re-verify: pnpm, `pnpm run`, `npm run` and `pnpm -C` set the event and the invoking folder; plain node with or without a stale event resolves against its own folder) |
| 5 (LOW) | `3f8a145` setlist-controller#32 pre-PR review 1 finding 5: The command's fallback exits have no test: an unknown flag, an impossible --date, and a build that throws | green on first run, since the behaviour exists. Each case shown able to go red: `isDate` returning true fails the `--date` case; `usage()` exiting 1 fails both new usage cases and the existing no-song case; dropping `process.exitCode = 1` from the catch fails the thrown-build case | 0 | proved by execution |

### Known regressions, deferred
- None. The one introduced defect (finding 4, `f38bf00`) was reworked in `1ee1225` and re-verified fixed.

### Rework briefs
- Finding 4: relative path flags must resolve against the operator's folder both through `pnpm build-set` (pnpm's `INIT_CWD`) and through plain `node src/set-builder/main.ts` (`process.cwd()`), and an `INIT_CWD` inherited from an earlier pnpm or npm script must never win. Preserve the two pnpm command cases from `f38bf00`, absolute flags and defaults, `--template`'s default inside the resolved library, and the `process.cwd()` fallback. Proof: a command case spawning node directly with a stale `INIT_CWD` and `npm_lifecycle_event`, red before and green after, then `pnpm test`.

### Verifier notes, not acted on (none is a regression from this round)
- Finding 1: when the output root did not exist, a failed plain build leaves it behind, empty (`build-set.ts:96`, the recursive `mkdir` of the output root, which predates this round and is shared with the replacing build). It does not block the rebuild.
- Finding 3: the `end` field's comment (`timeline.ts:20`) reads "its end marker"; with several end markers it is the first one, as it was before the rewording. A song whose first locator in time order is named like `End (x)` is read by `parseSet`'s title strip as `End`, while the builder treats it as a section. This predates the round, and only happens when that locator comes before Count Off.
- Finding 4: `pnpm exec node src/set-builder/main.ts` and `node --run build-set` run in the package root and set no event, so relative flags resolve there; neither is a documented way to run the command, and the old code behaved the same. The plain-node case sits under `describe('pnpm build-set')`.
- Not worked this round, since they are not confirmed findings: the Minor / nits list and the two weak assertions under Test quality.
