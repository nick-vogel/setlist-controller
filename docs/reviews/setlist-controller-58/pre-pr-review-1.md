# Pre-PR review: setlist-controller#58 Planning Center: build the Sunday set from the week's Services plan

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `7b7f066` "Merge pull request #152 from nick-vogel/setlist-controller-32-set-builder")
**Reviewed at:** HEAD `4d10be3` (setlist-controller#128 The build-set skill's plan path, and the usage text for the new flags), clean tree: 0 files with uncommitted changes, 0 untracked; 66 files total, +7428 / -38 against the merge-base (44 of the files are recorded Planning Center fixtures)
**Reviewed against:** the epic body of setlist-controller#58 and the settled Prayer rule (Nick, 2026-10-21, carried in #126's body: a `Prayer` counts only as the next item after a song, headers ignored); the bodies of sub-issues #123 to #128 and the closed Phase 0 ticket #148; the run's recorded decisions and out-of-scope proposals per ticket (`.epic-loop/tickets/<n>/assumptions.md`, `proposals.md`), read so that a recorded decision is not re-reported as a defect; `docs/HANDOFF-setlist-controller-58.md`; Planning Center's authentication docs (api.planningcenteronline.com/docs/overview/authentication) for the token URL. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 1, `--fresh`.
**Date:** 2026-10-21
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date; the branch changes neither `package.json` nor `pnpm-lock.yaml` |
| Lint | `pnpm lint` | pass, and `pnpm exec eslint docs/reviews/setlist-controller-58/` passes on this review's repros |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 38 files, 798 passed, 3 skipped |
| Build and Playwright | `pnpm test:e2e` (runs `pnpm build` first) | build ok; 30 passed |
| Tautology audit, oracle `7b7f066` | the branch's 7 test files and `test/fixtures/planning-center/` copied into a scratch worktree at BASE (since removed) | 82 tests added or changed: 82 red, 0 green. Both review-pass proofs (`7065bcc` #123 review pass 1 finding 1, `da3d1f2` #126 review pass 1 finding 1) are red at BASE |
| Pure rules by execution | finder B ran `sameKey`, `planTransitions`, `itemMeanings`, `planListing`, `planWarnings`, `nameKey` over a matrix | C#m/Dbm, Abm/G#m, Db/C# match; Em/E does not; a spaced lower-case `prayer` counts, a Prayer behind another item does not; a whole-text ` Overlap ` counts, `overlap please` does not; 70 against `70.00bpm` gives no warning, 72.5 against `72bpm` warns |
| Argument parsing by execution | finder A, `node src/set-builder/main.ts` against the fake | `--list --service-type`, `--list --gap 1`, `--plan --list --replace`, `--plan=yes`, `--gap 1` with no songs each exit 2; a song name beside `--plan` is refused before any request; the typed path's messages and transitions are the same as at BASE |
| Item-notes paging (the #126 proposal) | read `plan-reader.ts:191` | paged: the notes request goes through the same `list` loop as plans and items. Untested (finding 3) |
| Token handling | read the reader, the recorder and the scrubber; `git check-ignore dist/pco-raw` | no message carries the token or a body; the recorder writes only to the git-ignored `dist/pco-raw/` and saves a non-OK body as null; fixtures hold no names or emails |
| Token URL in `docs/install.md` | WebFetch of Planning Center's authentication docs (vendor docs, rung 3: no Planning Center skill or docs MCP exists) | the docs say "Visit your developer account" at `https://api.planningcenteronline.com/personal_access_tokens`, the URL the install doc gives |
| Finding 1 repro | `repro/review-1-empty-plan.test.ts` copied into `test/` and run | red at HEAD, both cases: `--plan --list` exits 0; `--plan` prints `The build needs at least one song.` |
| Finding 2 repro | `repro/review-1-listing-two-folders.test.ts` copied into `test/` and run | red at HEAD: the last folder line reads `  A-y-D-70bpm  pad in Em, from the plan` |
| Mutations for finding 3 | each `repro/review-1-mutation-*.diff` applied in a scratch worktree at HEAD (since removed), then `pnpm exec vitest run test/set-builder-plan.test.ts test/set-builder-plan-folders.test.ts test/set-builder-plan-list.test.ts` | notes request read as one page: 66 of 66 green; future plans read as one page: 66 green; the `starting_key` fallback deleted: 66 green; Db read as D (twins dropped): 65 green, only the two-folders test red, so the Db-finds-C# test stays green |
| Real Planning Center, Live, launchd | not run | the repo guardrails forbid them, and no test may reach the real API |

**Overall:** The branch does what the epic asks. Every acceptance criterion of #123 to #128 has a test that is red at the base, the full checks are green, and the matching, transition and warning rules hold under execution, including the settled Prayer rule. No finding reaches MEDIUM. Five LOW findings remain: an empty plan lists clean and then fails the build with a message that does not name the plan, the listing glues a transition onto a folder name, several fallback paths have no test that can go red, an empty `PCO_ENV` gives chmod advice for a folder, and the fixture scrubber deletes the fixtures README when re-run. The branch can open its PR as it is; findings 1 to 3 are cheap and worth landing first.

## Approach decisions
- **A plan with no songs (finding 1):** one reader problem in `readPlan` (`src/set-builder/plan-reader.ts`), after the order-of-service loop, worded with the type's name and the date as the sibling no-plan problems at `plan-reader.ts:182` and `:185` are. `--plan` and `--plan --list` both reach it through `readWeekPlan` (`main.ts:264`), so neither caller changes. `buildSet`'s own `The build needs at least one song.` (`build-set.ts:91`) stays as a guard for programmatic callers.
- **A multi-line folder problem in the listing (finding 2):** in `planListing`'s `songLine` (`src/set-builder/plan-list.ts:31-43`), the problem's first line keeps its field and the lines after it follow the song line, so the transition ends the song's own line. The problem's text, which the build prints on stderr, does not change.
- **Fallback tests (finding 3):** each new test runs the command through the package script against the fake, with a body derived from a recorded fixture, as `twoItemPages` (`test/set-builder-plan.test.ts:402`) and `planningCenterWith` (`:124`) do. No unit test of the reader.

## Confirmed Issues
### 1. A plan with no songs lists clean, then fails the build with a message that does not name the plan — LOW
- **Location:** `src/set-builder/plan-reader.ts:209-232`; reached by `src/set-builder/main.ts:154-171` (`planList`) and `main.ts:253-261` (`planSet`)
- **Attribution:** introduced. BASE has no plan reader (`git show 7b7f066:src/set-builder/plan-reader.ts` fails); `readPlan` came in with #123 (`908b613`).
- **Real-world trigger:** Nick lists the plan early in the week, when the Sunday plan exists from its template (headers, Welcome, Message, Prayer) but the worship leader has not added songs yet. LOW: nothing is built wrong and the build stops, but the listing reads as a clean check (exit 0, so the skill's plan path offers the build command), and the build's stop names neither the plan nor the fix.

**Evidence**
```ts
  const songs: PlanSong[] = [];
  const order: PlanItem[] = [];
  for (const item of items.data.toSorted((a, b) => Number(a.attributes.sequence) - Number(b.attributes.sequence))) {
    ...
  }
  return { ok: true, plan: { songs, items: order } };
```
Nothing between the loop and the return, nor in `planFolders`, `pickFolders`, `itemMeanings` or `listingHasProblems`, looks at `songs.length`.

**Failure mode** — The November 1 items fixture with every `item_type: 'song'` item removed: `pnpm build-set --plan --list --date 2026-11-01` prints only `2026-11-01 Sunday` and exits 0; `pnpm build-set --plan --date 2026-11-01` prints `The build needs at least one song.` (`build-set.ts:91`, through `build()`'s catch) and exits 1. With a transition flag, either prints the usage line `... a whole number from 1 to 0 ...` instead. Proved by `repro/review-1-empty-plan.test.ts`, red at HEAD in both cases.

**Recommended fix**
```diff
     order.push({ kind: 'song', position: songs.length });
   }
+  if (songs.length === 0) return fail(`The "${typeName}" plan on ${date} has no songs in Planning Center. Add them to the plan, then build again.`);
   return { ok: true, plan: { songs, items: order } };
```

**Remediation brief**
- **Design intent:** the plan reader owns every problem that comes from the plan's content in Planning Center, and returns either a usable plan or one-line problems; the set builder never sees Planning Center's shapes. A plan that cannot give a set (no plan, several plans, no songs) stops in the reader, before the library is read, for the build and the listing alike.
- **Full surface:** `src/set-builder/plan-reader.ts:232` (the new return before it); `.claude/skills/build-set/SKILL.md:45-52`, the "Exit 1 with no song lines" list, gains the new line with its fix (Nick adds the songs to the plan in Planning Center, or names another date); the repro's two cases become tests in `test/set-builder-plan.test.ts` (build) and `test/set-builder-plan-list.test.ts` (listing), asserting the exact text.
- **Must preserve:** every plan with at least one song reads as today (`test/set-builder-plan.test.ts`, `test/set-builder-plan-list.test.ts`, `test/set-builder-plan-folders.test.ts`); the order of the reader's problems (service type, then plan on the date, then `--plan-id`, then the items' requests); `build-set.ts:91` unchanged.
- **Do not touch:** the flag-position checks after the plan is read (`main.ts:255`, `:166`): their order is the recorded #126 decision (Dismissed, "flag syntax errors only after the round trip").
- **Proof:** `cp docs/reviews/setlist-controller-58/repro/review-1-empty-plan.test.ts test/ && pnpm exec vitest run test/review-1-empty-plan.test.ts; rm test/review-1-empty-plan.test.ts` is red now and green after; the repro's regex accepts the recommended wording.

### 2. In `--plan --list`, a song with two folders in its key gets its transition glued onto the last folder's name — LOW
- **Location:** `src/set-builder/plan-list.ts:31-43`
- **Attribution:** introduced in #127 (`56f3526`); `planListing` does not exist at BASE.
- **Real-world trigger:** the library holds two downloads of one song in one key (a Live and a studio version, or C# and Db spellings), and the plan gives that song a transition or it is not the last song. LOW: a confusing display; the listing still exits 1 and nothing is built.

**Evidence**
```ts
    const fields = [`${position}. ${song?.title ?? ''}`, song?.key ?? 'no key', pick === undefined ? '' : pick.ok ? pick.folder : pick.problem];
    ...
      fields.push(`${transitionName(transition, padKey(position, transition, picks))}, ${sourceName(source)}`);
    }
    return fields.join('  ');
```
The two-folders problem ends with `listed(matches)` (`plan-folders.ts:41`), newline-indented folder names, so the joined transition lands on the last of them.

**Failure mode** — `repro/review-1-listing-two-folders.test.ts`, red at HEAD: the listing prints `  A-y-D-70bpm  pad in Em, from the plan`, which reads as part of a folder name in a problem whose fix is "keep one".

**Recommended fix**
```diff
-    const fields = [`${position}. ${song?.title ?? ''}`, song?.key ?? 'no key', pick === undefined ? '' : pick.ok ? pick.folder : pick.problem];
+    const [folderField = '', ...problemLines] = (pick === undefined ? '' : pick.ok ? pick.folder : pick.problem).split('\n');
+    const fields = [`${position}. ${song?.title ?? ''}`, song?.key ?? 'no key', folderField];
     const problem = problems.get(position);
@@
-    return fields.join('  ');
+    return [fields.join('  '), ...problemLines].join('\n');
```

**Remediation brief**
- **Design intent:** a listing song line is `<n>. <title>  <plan key>  <folder or its problem>  <transition, source>`, one line per song, which the skill's plan path reads field by field (`SKILL.md` plan path step 2). A problem's continuation lines belong to the problem and come after the song line.
- **Full surface:** `src/set-builder/plan-list.ts:34` and `:42` only. The problem text is built in `plan-folders.ts:41` and must not change, since the build prints it on stderr (`test/set-builder-plan-folders.test.ts:184`, `:196` pin it).
- **Must preserve:** every single-line song line byte for byte (`test/set-builder-plan-list.test.ts`, all cases); the last song's line still has no transition field when it has no transition, flag or problem (`plan-list.ts:39`); a transition problem still replaces the transition field (`plan-list.ts:38`).
- **Do not touch:** `itemMeanings` listing a Prayer as a pad when the same song change has the both-problem: a recorded #127 decision (Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-58/repro/review-1-listing-two-folders.test.ts test/ && pnpm exec vitest run test/review-1-listing-two-folders.test.ts; rm test/review-1-listing-two-folders.test.ts` is red now and green after. Add a command-level case to `test/set-builder-plan-list.test.ts` with two folders in one key.

### 3. Several fallback paths of the plan reader and the key match have no test that can go red — LOW
- **Location:** `src/set-builder/plan-reader.ts:191` (notes paging), `:162` (future plans paging), `:220` (key fallback), `:16`, `:21`, `:32` (token file problems), `:181`, `:184` (no plan on the date); `test/set-builder-plan-folders.test.ts:100` (Db finds C#)
- **Attribution:** introduced, in #123 to #126 (`908b613`, `a4a88ac`, `77ee77f`, `cd4ca3a`).
- **Real-world trigger:** none for the code today, which is correct under every probe. The risk is a later change: a regression on any of these paths ships green. A dropped notes page would silently build a gap where the plan asks for an overlap, which is why the conformance rule "a test for every fallback path" applies. LOW.

**Evidence** — each mutation applied at HEAD, then the three plan test files run (66 tests):
- `repro/review-1-mutation-notes-unpaged.diff` (the notes request reads one page): 66 green.
- `repro/review-1-mutation-future-first-page.diff` (future plans read one page): 66 green.
- `repro/review-1-mutation-key-fallback-gone.diff` (the included Key's `starting_key` and its minor `m` never used): 66 green.
- `repro/review-1-mutation-db-as-d.diff` (a plan's Db matches a D folder instead of C#): 65 green; the "finds a folder in C# for a song planned in Db" test stays green, since `expectBuilt` (`test/set-builder-plan-folders.test.ts:93-97`) checks only the title on the summary's first line and the workspace also holds the D folder at the same BPM.
- `grep -n "has no plan on\|Cannot read the Planning Center token\|has no PCO_\|starting_key" test/*.ts` finds nothing: the missing token file, the token file with no `PCO_CLIENT_ID` or `PCO_SECRET`, and the "no plan on the date" problems (with and without `--plan-id`) have no test.

**Failure mode** — any of the mutations above lands with a green suite.

**Recommended fix** — add, in the files named, these command tests against the fake:
- `test/set-builder-plan.test.ts`: the Phase 0 notes (`PHASE_0_NOTES`, `:56`) split into two pages the way `twoItemPages` (`:402`) splits items, with the `Overlap` note's item on page 2, asserting the overlap in the summary; a future-plans list split into two pages with the date's plan on page 2; a song item with `key_name: null` and a Key whose `starting_key` is `E` and `starting_minor` true, asserting it matches an `Em` folder; a missing token file and a token file with no `PCO_SECRET`, each asserting the exact problem line and exit 1; a date with no plan, with and without `--plan-id`, asserting the exact problem.
- `test/set-builder-plan-folders.test.ts:100`: assert which folder was picked, for example by `--plan --list`'s folder field or the built set's sample paths naming `C#`.

**Remediation brief**
- **Design intent:** the reader follows `links.next` for every list (service types, future and past plans, items, item notes) until a page has none or the plan list has passed the date; a song's key is `key_name`, else the included Key's `starting_key` with `m` when `starting_minor`; enharmonic twins are one key and minor matches only minor (`pads.ts` `sameKey`).
- **Full surface:** tests only, in `test/set-builder-plan.test.ts` and `test/set-builder-plan-folders.test.ts`. No source change.
- **Must preserve:** every existing test; the exact request list `NOVEMBER_1_REQUESTS` the plan tests assert, so new fixtures must be served only by the new tests' fakes.
- **Do not touch:** the `!onDate.has(plan.id)` guard (Dismissed, it cannot produce a duplicate).
- **Proof:** with each new test in place, `git apply docs/reviews/setlist-controller-58/repro/review-1-mutation-<name>.diff` in a scratch worktree at the remediated HEAD turns at least one test red, for each of `notes-unpaged`, `future-first-page`, `key-fallback-gone` and `db-as-d`; then `git apply -R`.

### 4. An empty `PCO_ENV`, or one naming a folder, gives chmod advice for a folder — LOW
- **Location:** `src/set-builder/main.ts:265`, `src/set-builder/plan-reader.ts:15-18`
- **Attribution:** introduced in #123 (`908b613`).
- **Real-world trigger:** `PCO_ENV=` left empty in a shell profile, or set to the folder instead of the file. LOW, capped: no plausible user path names it today, since the install doc shows a file path.

**Evidence**
```ts
  const tokenFile = resolve(from, process.env.PCO_ENV ?? TOKEN_FILE.replace(/^~/, homedir()));
```
```ts
  const info = await stat(file).catch(() => undefined);
  if (info === undefined) return { ok: false, problem: `Cannot read the Planning Center token file ${file}.` };
  if ((info.mode & 0o044) !== 0) {
```

**Failure mode** — finder A, executed: with `PCO_ENV=''`, `??` keeps the empty string, `resolve` gives the working folder, a folder's mode is `755`, and the command prints `The Planning Center token file <cwd> can be read by other users. Run chmod 600 <cwd>, then build again.` Following it takes the execute bit off the folder.

**Recommended fix**
```diff
-  const tokenFile = resolve(from, process.env.PCO_ENV ?? TOKEN_FILE.replace(/^~/, homedir()));
+  const tokenFile = resolve(from, process.env.PCO_ENV || TOKEN_FILE.replace(/^~/, homedir()));
```
```diff
-  if (info === undefined) return { ok: false, problem: `Cannot read the Planning Center token file ${file}.` };
+  if (info === undefined || !info.isFile()) return { ok: false, problem: `Cannot read the Planning Center token file ${file}.` };
```

**Remediation brief**
- **Design intent:** the token file is checked for its mode before it is read, and every token-file problem is one line naming the file, never a value. An empty `PCO_ENV` means "not set".
- **Full surface:** `main.ts:265`, `plan-reader.ts:16`; one test in `test/set-builder-plan.test.ts` with `PCO_ENV` naming a folder.
- **Must preserve:** the mode check before the read (`test/set-builder-plan.test.ts:184`); a relative `PCO_ENV` resolving from `INIT_CWD` (recorded #123 decision).
- **Do not touch:** the `0o044` mask (recorded #123 decision).
- **Proof:** `PCO_ENV="$PWD/test" PCO_API_BASE=http://127.0.0.1:9 node src/set-builder/main.ts --plan --list` prints the chmod line now, and `Cannot read the Planning Center token file .../test.` after.

### 5. Re-running the fixture scrubber deletes the fixtures README, and an empty recording wipes every fixture — LOW
- **Location:** `scripts/scrub-pco-fixtures.mjs:59`
- **Attribution:** introduced in Phase 0 (`a63874d`, setlist-controller#148).
- **Real-world trigger:** a later re-recording, which `test/fixtures/planning-center/README.md:6` tells the reader to run. LOW: git shows the deletion and restores it.

**Evidence**
```js
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const name of files) {
```
`OUT` is `test/fixtures/planning-center` (`:14`) and `files` holds only `dist/pco-raw/*.json` (`:36`), so the hand-written README goes, and an empty `dist/pco-raw/` (a recording that got a 401) leaves the folder empty.

**Recommended fix**
```diff
+if (files.length === 0) throw new Error(`No recorded responses in ${RAW}. Record them first.`);
-rmSync(OUT, { recursive: true, force: true });
-mkdirSync(OUT, { recursive: true });
+mkdirSync(OUT, { recursive: true });
+for (const name of readdirSync(OUT).filter((each) => each.endsWith('.json'))) rmSync(join(OUT, name));
```

**Remediation brief**
- **Design intent:** the scrubber turns `dist/pco-raw/` into the committed fixture set, replacing the old JSON fixtures entirely so no stale response survives; the README is hand-written and is not a fixture.
- **Full surface:** `scripts/scrub-pco-fixtures.mjs:59-60` (check `readdirSync` and `join` are imported at the top of the file).
- **Must preserve:** stale JSON fixtures removed on a re-run; the scrub rules (`scrubRecord`); the output format, which the fake reads.
- **Do not touch:** the committed fixtures themselves.
- **Proof:** in a scratch copy of the repo, `mkdir -p dist/pco-raw && node scripts/scrub-pco-fixtures.mjs` deletes `test/fixtures/planning-center/README.md` now, and throws with nothing deleted after. Never run the recorder: it calls the real API.

### 6. Comment hygiene — LOW (aggregated)
- `src/set-builder/main.ts:249` — a comment line runs to about 160 columns, past the 120-column wrap the file keeps ("name as a typed command would, the plan's songs, for the summary's warnings, and the transitions its items and notes give, each transition flag replacing the") → rewrap lines 248 to 252 at 120 columns, wording unchanged.

## Needs Further Investigation
### A. A BPM of 0 from Planning Center would warn "planned at 0 BPM" — what would settle it
`plan-warnings.ts:29` warns for any number, and the reader keeps any number (`plan-reader.ts:226`). Finder B executed `bpm: 0` against a `90bpm` folder and got the warning. The recorded fixtures hold only 70, 72, 98 and 134, so it is unknown whether Planning Center writes `null` or `0` for an arrangement with no BPM. Confirm by recording one arrangement with no BPM set. If it is `0`, the reader should keep only `bpm > 0`, since "a missing BPM gives no warning" is in the spec.

## Reviewed and Dismissed
- The `!onDate.has(plan.id)` guard (`plan-reader.ts:168`) could be removed with no test going red and give a false "two plans" — `onDate` is a `Map` keyed by plan id, so a second `set` overwrites; the guard only keeps the first record, and no duplicate is possible.
- The item-notes request is not paged (#126 proposal) — it is: `plan-reader.ts:191` goes through `list`, which follows `links.next`. Only its test is missing (finding 3).
- The token could leak from the recorder or the scrubber — the recorder writes only to the git-ignored `dist/pco-raw/` (`.gitignore:2`), saves a non-OK body as null, never prints the token, and keeps a `links.next` under the PCO base; the scrubbed fixtures hold no names or emails.
- The install doc's token URL is wrong — Planning Center's authentication docs give the same URL, `https://api.planningcenteronline.com/personal_access_tokens`.
- The typed path changed — finder A compared check order, messages and the transitions map with BASE: the same, plus `--gap`; `typedTransitions` drops `--gap` entries.
- The Prayer rule misses headers — headers never reach `planTransitions`: the reader drops them (`plan-reader.ts:213`).
- A double-quoted or `export`-prefixed token file is read wrong — true (it reads as a refused token), but the install doc and the usage text show the unquoted form, and the parse is the spike's, which works with the real file on the playback Mac. Moved to Minor.
- Transition-flag syntax errors on a plan build come after the Planning Center round trip — the recorded #126 ordering decision.
- A Prayer still lists as "a pad after song n" when its song change has the both-problem — the recorded #127 decision.
- The skill's "Exit 1 with no song lines" list lacks the unreadable-answer and other-host problems — the list opens with a catch-all ("Show it, what fixes it, and no build command", `SKILL.md:45`).
- `README.md:87` "One song change takes one transition: a gap, `--overlap` or `--pad`." is stale — still true: a gap is one of the three transitions, and `--gap` is in the flag list above it.

## Minor / nits
- `plan-reader.ts:184` names the service type as typed (`"997539" has no plan on ...` for `--service-type 997539`), where its siblings at `:182` and `:185` use the type's name.
- `plan-reader.ts:28` strips single quotes only, and reads an `export ` prefix into the name; a double-quoted value reads as a refused token.
- `scripts/scrub-pco-fixtures.mjs:50` keeps the full text of notes on song items, and every item and plan title. The current fixtures are clean and the repo is private; a later recording could still commit a volunteer's name in a song note.
- The 36 per-item `*_items_<id>_item_notes.json` fixtures are never requested by the reader, which uses `include=item_notes`; the README could say they are kept as evidence of the API shape.
- `scripts/record-pco-fixtures.mjs:35-44` does not trim env values, so a CRLF token file records 401s.
- `docs/install.md:214` creates the token file with `touch` under the default umask (0644) before the secret goes in; `(umask 077 && touch ~/.config/setlist-controller/pco.env)` closes the window. The doc's `chmod 600` last stays (recorded #128 decision).
- A plan title with a hyphen can never match a folder title (cut at the first hyphen, `song.ts:82-83`); the skill's fix for "has no song folder" (`SKILL.md:40`) could say to rename the song in the plan.

## Test quality
Tests added or changed: 82 · green against `7b7f066`: 0 · tautology shapes found: 0. Every plan test spawns the real command through the package script against the fake; expectations are hard-coded strings and request lists. Weak assertions, each able to fail but narrower than its name:
- `test/set-builder-plan-folders.test.ts:100` ("finds a folder in C# for a song planned in Db") cannot tell C# from D (finding 3, `review-1-mutation-db-as-d.diff`).
- `test/set-builder-plan.test.ts:699-715` (the Prayer cases) each check one summary line; asserting every song line, as the override cases at `:774` do, would pin the other song changes too.
- `test/set-builder-plan-list.test.ts:323-334` (unreadable library) checks only that stderr is one line; assert the exact `Cannot read the song library <path>.` text, as `test/set-builder-plan-folders.test.ts:219` does.
- `test/readme.test.ts:43` pins the flag names of USAGE and the README against each other, not their wording: fit for flag drift only.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` green at `4d10be3`; `pnpm test:e2e` green locally.
- **Commit hygiene:** the merge history carries each lane's implementation commit twice (for example `afcefc2` and `4d10be3`, both "setlist-controller#128 The build-set skill's plan path..."), as earlier epics' branches did; nothing to drop. Commit this doc and its `repro/` folder.
- **Likely reviewer asks:** a test with an overlap note on the second page of notes (finding 3); what a plan with no songs does (finding 1); whether `filter=past` and its ordering were confirmed against the docs (recorded in `.epic-loop/tickets/125/comment-125.md` for the ticket comment).

## Verdict
**Ready to open a PR, with follow-ups.** No finding is MEDIUM or higher, and nothing gates the PR. Findings 1 to 3 are small and in scope, and are worth remediating before the PR opens: an empty plan should stop with a problem that names the plan, the listing should keep a transition on its song's line, and the reader's fallback paths need tests that can go red. Findings 4 and 5 and the Minor list can ship as follow-up tickets.
