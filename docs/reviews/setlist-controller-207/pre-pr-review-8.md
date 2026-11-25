# Pre-PR review: setlist-controller#207 Test gaps: every guard a review left unpinned fails pnpm test when removed, round 8 (run 4 remediation of review 7)

**Branch:** `setlist-controller-207-unpinned-guards` vs `origin/main` (merge-base `66a0439` "Merge pull request #228 from nick-vogel/setlist-controller-207-unpinned-guards")
**Reviewed at:** HEAD `eff63ad` (setlist-controller#207 pre-PR review 7 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 6 files total against the merge-base, +291 / -5
**Delta under review:** since `10126b3` (setlist-controller#226 The build-set skill gives no fix for a song name that matches no folder or several, or a song that can't be read), the HEAD `pre-pr-review-7.md` reviewed: 5 files, +263 / -3. Code in it: `47e337d` (review 7 finding 1, SKILL.md:76-77 and a new `the build-set skill's name-match fixes` block) and `c9c2fd9` (the SKILL.md:26 nit and a new `the build-set skill's whole-name match` block); `40c9619` and `eff63ad` add review 7 and its closure table.
**Reviewed against:** setlist-controller#207 (epic body; sub-issues #226 and #227 still open, the rest closed), `pre-pr-review-7.md` with its Remediation section and Approach decisions. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist, plus no em-dashes in shipped copy (none in the changed SKILL.md lines).
**Date:** 2026-10-23
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| `pnpm lint` | integration worktree | clean |
| `pnpm typecheck` | integration worktree | clean |
| `pnpm test` | integration worktree | 62 files, 1337 passed, 4 skipped |
| `pnpm build` | integration worktree | built |
| `pnpm test:e2e` | not run | the delta is one skill markdown file and one vitest file, in neither the Playwright build nor its specs; review 7's remediation ran it green at `c9c2fd9` (44 passed), and `eff63ad` adds a doc only |
| SKILL.md:26 holds for the listing | `pnpm build-set --list --library dist/lib --output-root dist/out` in a scratch worktree, library `Grace-Live-D-98.00bpm`, `Grace-Live-D-98.00bpm copy`, `Way Maker-Live-E-68.00bpm` | prints `"Grace-Live-D-98.00bpm"  D  Grace-Live-D-98.00bpm` and `"Grace-Live-D-98.00bpm copy"  no key  ...`: each whole name, quoted, as step 2 says; the finder ran a second library and got the same |
| Stale "matches both" or "back to step 4" left elsewhere | `git grep` over the repo outside `docs/reviews` | none; README.md:67 and the USAGE text at `src/set-builder/main.ts:28` already state the whole-name preference |
| Mutation c: cut the remedy of SKILL.md:77 | scratch worktree at `eff63ad` | red, `the build-set skill's name-match fixes` |
| Mutation d: drop `if (whole.length === 1) return whole;` from `foldersNamed` | same | red, `the build-set skill's whole-name match` |
| Mutation e: SKILL.md:26 back to "which matches both, so the build stops on it" | same | red, same test |
| Mutation a: cut the in-listing remedy of SKILL.md:76 | `repro/pre-pr-review-8-mutation-name-match-first-remedy-cut.diff` | survives, 116 of 116: finding 1 |
| Mutation b: cut the missing-folder branch of SKILL.md:76 | same worktree | survives: finding 1 (review 7 finding 2, still open) |
| Mutation f: cut the re-save remedy of SKILL.md:60 | same worktree | survives: finding 1 (review 7 finding 2, still open) |
| Finder's rewordings of :76 and :77 (a step 3 route, a "rename" cause, a "list again only if that fails" remedy) | finder, scratch worktree | all survive: finding 1 |
| Finding 1's recommended tests | added in a scratch worktree at `eff63ad` | 118 of 118 green; mutations a, b, f and a "(back to step 3)" rewording each go red; `eslint` and `tsc` clean |
| Listing and build read their own `--library` and `--pads` | read `src/set-builder/main.ts:136-137`, `:158`, SKILL.md:14 and :29 | step 1 re-lists only on a date, `--output-root` or `--replace` change: finding 2 |
| Tautology audit | the three new tests, against mutations a to f | each test goes red on the mutation its name claims (c, d, e); none is green at `10126b3` (the closure table records red before green). The gaps are coverage, not tautology: finding 1 |

**Overall:** Review 7's finding 1 and the step 2 nit are fixed, and their new tests go red when the fix is undone. Three LOW gaps carry over or are new: the in-listing remedy of the no-match line is not pinned (the closure table says it is), step 1 does not list again when the command's `--library` or `--pads` changes, so lines 76 and 77 name an incomplete cause, and review 7's findings 3 and 4 are untouched by scope. No finding blocks the PR.

## Approach decisions
- Carried from rounds 5 to 7: SKILL.md quotes are matched against `src/set-builder/*.ts` literals by `test/build-set-skill-quotes.test.ts`; a hole in a printed line is quoted as a placeholder; no sentence before SKILL.md:39 is reworded (setlist-controller#210 pins SKILL.md:32), except SKILL.md:26 by Nick's choice in review 7; a Live menu command is named only when grounded in the Live 12 manual.
- Carried from round 6: a step 6 fix that covers a case its line can print is pinned by a prose check that finds the bullet by its quote and matches the words of the remedy. Round 8 adds: when one bullet holds two remedies for two cases, the check splits the bullet at the second case's opening words and pins each half on its own, since one shared phrase satisfies a whole-line match (finding 1).
- Carried from round 7: a name-match problem is fixed from a fresh listing (back to step 1), since a listed short name names its own folder alone (`src/set-builder/song-list.ts:47-52`).
- Carried from round 7: a skill sentence that states what the build does is pinned by running the build's own function on the sentence's example (`the build-set skill's whole-name match`).
- Carried from round 7: a test of a default under ~/Library reads or writes there only through a stand-in: a mocked opener (`start-up.test.ts`), or `HOME` pointed at a folder under the worktree's `dist/` for a spawned command. Finding 3.
- New: the listing answers for the library and pads folder the command names, so it runs again when `--library` or `--pads` changes after step 1, as it already does for the date, `--output-root` and `--replace`. Finding 2. This rewords SKILL.md:14, a sentence before :39, so it needs Nick's yes like SKILL.md:26 did.

## Prior-review closure
Against `pre-pr-review-7.md` (4 confirmed, all LOW, plus 2 nits):
- Fully fixed: finding 1 (`47e337d`; mutation c red, no "back to step 4" left on :76 or :77) and the SKILL.md:26 nit (`c9c2fd9`; listing executed, mutations d and e red).
- Partially fixed: finding 2. The new name-match check pins the remedy of :77 only. The closure table's row says it pins "the 'back to step 1' remedy of :76 and :77, but not the missing-folder branch of :76"; in fact neither branch of :76 is pinned on its own, since the phrase it matches appears in both (mutations a and b survive). The :60 remedy is unpinned (mutation f survives). Re-emitted as finding 1.
- Untouched, by Nick's scope at the run 4 end report: finding 3 (re-emitted as finding 3), finding 4 (re-emitted as finding 4), and the SKILL.md:60 "says which" nit (carried in Minor / nits).
- None of them is MEDIUM or higher, and none is escalated or listed under Known regressions, deferred (that list reads "None.").

## Confirmed Issues
### 1. The name-match and song-read fixes are pinned in part only, so cutting either remedy of the no-match line, or the re-save remedy, leaves the tests green — LOW
- **Location:** `test/build-set-skill-quotes.test.ts:376-384` (the `the build-set skill's name-match fixes` block); `.claude/skills/build-set/SKILL.md:60`, `:76`
- **Attribution:** pre-existing on the branch from `cec2c1a` (review 7 finding 2, introduced there), narrowed but not closed by `47e337d`, which pins :77 only. Against `$BASE` `66a0439`: introduced, since none of these bullets exists there (`git show 66a0439:.claude/skills/build-set/SKILL.md | grep -c 'matches no song folder'` prints 0).
- **Real-world trigger:** a later edit to step 6 drops the in-listing remedy of :76, its missing-folder branch, or the re-save of :60, or routes :76 back to a step other than 1, and Claude meets that line with no fix, or with a fix from a stale listing, every check green. LOW, capped: a test gap with no current user path.

**Evidence** —
```ts
expect(line).toMatch(/the listing runs again \(back to step 1\)/i);
expect(line).not.toMatch(/back to step 4/);
```
SKILL.md:76 says "the listing runs again (back to step 1)" twice, once per case, so either half alone satisfies the first assertion; the second bans step 4 only.

**Failure mode** — in a scratch worktree at `eff63ad`, `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-8-mutation-name-match-first-remedy-cut.diff` (cuts "When the song is among the folders the line lists, the listing runs again (back to step 1), and Nick's command takes the song's short name from it.") and `pnpm exec vitest run test/build-set-skill-quotes.test.ts` passes 116 of 116. Cutting the missing-folder sentence of :76 or the re-save sentence of :60 by hand also passes 116 of 116.

**Recommended fix** — in `test/build-set-skill-quotes.test.ts`, change the ban inside `the build-set skill's name-match fixes`:
```diff
-      expect(line).not.toMatch(/back to step 4/);
+      expect(line).not.toMatch(/back to step [2-6]/);
```
and append after the `the build-set skill's whole-name match` block:
```ts

describe('the build-set skill\'s no-match fix, by case', () => {
  it('lists again for a song among the folders the line lists, and has Nick add a folder that is missing', () => {
    const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.includes('`"<name>" matches no song folder in <library>. The song folders are:...`')) ?? '';
    const [among, missing] = line.split('When it is not');
    expect(among).toMatch(/When the song is among the folders the line lists, the listing runs again \(back to step 1\), and Nick's command takes the song's short name from it/);
    expect(missing).toMatch(/its song folder is missing from the library: Nick adds it, and the listing runs again \(back to step 1\)/);
  });
});

describe('the build-set skill\'s song-read fix', () => {
  it('says to save the set from Live 12 into the song folder as MultiTrack.als', () => {
    const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.includes('`<folder>: the song could not be read: ...`'));
    expect(line).toMatch(/Nick saves the song's set from Live 12 into that folder as `MultiTrack\.als`, then builds again/);
  });
});
```
Executed in a scratch worktree at `eff63ad`: 118 of 118 green, `eslint` and `tsc` clean.

**Remediation brief**
- **Design intent:** the quotes test pins that each quoted line is one the code prints; a prose check pins that its bullet still carries the remedy for each case the line covers (round 6 Approach decision). A bullet with two cases is split at the second case's opening words ("When it is not") so each half is pinned on its own. The name-match remedies all go back to step 1, a fresh listing, never to a step that reuses the listing Claude holds (round 7 Approach decision), which the widened ban enforces.
- **Full surface:** `test/build-set-skill-quotes.test.ts:381` (the ban), and two describe blocks appended after line 395. No SKILL.md change.
- **Must preserve:** the `the build-set skill's name-match fixes` and `the build-set skill's whole-name match` blocks otherwise unchanged; every quote row in `the build-set skill's quoted problem lines`; `readQuotes` and `linesUp`; SKILL.md byte for byte (`pnpm exec vitest run test/build-set-skill-quotes.test.ts` stays green without touching it).
- **Do not touch:** the `stem reason fixes`, `per-song track-count fix` and `outside-file fix` blocks; SKILL.md:76 and :77 wording (finding 2 changes SKILL.md:14 only, not these lines).
- **Proof:** `pnpm exec vitest run test/build-set-skill-quotes.test.ts` green at the fix. Then in a scratch worktree at the fix's HEAD: `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-8-mutation-name-match-first-remedy-cut.diff` turns `the build-set skill's no-match fix, by case` red; cutting " When it is not, its song folder is missing from the library: Nick adds it, and the listing runs again (back to step 1)." from :76 turns it red; cutting " Nick saves the song's set from Live 12 into that folder as `MultiTrack.als`, then builds again." from :60 turns `the build-set skill's song-read fix` red; adding " (back to step 3)" after "takes the song's short name from it" on :76 turns `the build-set skill's name-match fixes` red. Remove the worktree after.

### 2. Step 1 does not list again when the command's library or pads folder changes, so the name-match lines can name a cause that is not the one — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:14` (the re-list rule); `.claude/skills/build-set/SKILL.md:76`, `:77` (the cause each names)
- **Attribution:** the re-list rule is pre-existing, untouched: `git show 66a0439:.claude/skills/build-set/SKILL.md | sed -n 14p` already reads "so when the date, `--output-root` or `--replace` changes after this step". The cause sentence on :76 and :77 ("so the library changed after step 1's listing, or the name is not one the listing printed") is introduced by `47e337d` and leaves this case out.
- **Real-world trigger:** at step 5 Nick answers with a change of library or pads folder ("use the library on the external drive"). Step 5 composes the new command and goes back to step 4 (SKILL.md:29) with no new listing, since `--library` and `--pads` are not in step 1's re-list rule, so step 4 shows titles and keys from the old library and the command carries short names cut against it. The build, which reads the command's own `--library` (`src/set-builder/main.ts:136-137`, `:158`), prints a no-match or several-match line whose stated cause is false: the library did not change and the name came from the listing. A short name that matches exactly one other song in the new library builds that song instead; the build's summary names the folders, so Nick can see it, but nothing stops it. LOW, capped: no reported case of Nick changing library or pads folder after a listing; upgrade to MEDIUM if he keeps more than one song library, since the one-match case is a wrong song built.

**Evidence** — SKILL.md:14: "The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command." SKILL.md:29: "An answer that names a change ... is a change: compose the new command and go back to step 4."

**Failure mode** — proved by reading the skill's flow and `main.ts`, not executed against two libraries: listing on library A, command `grace rain`, Nick says "use library B", the command gains `--library B` with the same names, and B's folders decide what each name matches.

**Recommended fix** — SKILL.md:14, one clause:
```diff
-The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
+The listing answers for one library, pads folder, date and output root, so when `--library`, `--pads`, the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command, and take each song's short name from it again.
```
Apply it inside the existing line 14, which is one paragraph on one line; only that sentence changes. Lines 76 and 77 then stay true as written, since a listing always matches the command's library.

**Remediation brief**
- **Design intent:** every short name on a build command comes from a listing of the same library and pads folder the command names; `shortName` (`song-list.ts:53`) guarantees a listed name names its own folder alone only among the folders it was listed against. Step 1's re-list rule is where the skill keeps the listing and the command in step; it already covers the date, `--output-root` and `--replace`, which decide the listing's last line, and this adds the two flags that decide its song lines.
- **Full surface:** `.claude/skills/build-set/SKILL.md:14`, that one sentence. The plan path's own listing (SKILL.md:86) already takes `--library` and `--pads` and re-lists on every change by plan step 3, so it needs nothing. Check the worked examples (from `## Worked examples`) for a narrative that changes `--library` after a listing without re-listing; none was found by `grep -n -- '--library' .claude/skills/build-set/SKILL.md`, but re-run it.
- **Must preserve:** the "A yes with no change to step 4's replace question is no such change" sentence right after it; every other sentence before SKILL.md:39 (round 5 rule), SKILL.md:32 above all (setlist-controller#210); every quote byte for byte (`pnpm exec vitest run test/build-set-skill-quotes.test.ts`, including `the build-set skill's quoted problem lines` and any test that reads step 1). No em-dashes.
- **Do not touch:** SKILL.md:76 and :77 (their cause is true once this lands); the plan path.
- **Proof:** needs Nick's yes first, since it rewords a sentence before SKILL.md:39. Then `grep -n 'when `--library`, `--pads`, the date' .claude/skills/build-set/SKILL.md` prints line 14, and `pnpm exec vitest run test/build-set-skill-quotes.test.ts test/build-set-skill-examples.test.ts` stays green. A prose check pinning the clause is optional and follows the round 6 decision if added.

### 3. The reader half of the lateness log's default is still unpinned, though #227's test name says it is checked — LOW
- **Location:** `src/lateness/main.ts:26`; `test/start-up.test.ts:149` (the test's name and its comment at :158-160)
- **Attribution:** pre-existing, untouched: `git show 66a0439:src/lateness/main.ts | grep -n DEFAULT_LATENESS_LOG` shows the same fallback; `test/lateness-command.test.ts` passes `--log` in every run (lines 58-120). Review 7 finding 3, out of run 4's scope by Nick's choice.
- **Real-world trigger:** a change to the fallback at `main.ts:26` makes `pnpm lateness` with no `--log` read somewhere the Sunday server does not write, every check green, and #147's lead-time decision reads an empty log. LOW, capped: a test gap with no current user path; outside #227's acceptance criteria, so a follow-up.

**Evidence** —
```ts
const path = parsed.values.log === undefined ? DEFAULT_LATENESS_LOG : resolve(from, parsed.values.log);
```

**Failure mode** — `docs/reviews/setlist-controller-207/repro/pre-pr-review-7-mutation-lateness-reader-default.diff` makes the fallback `resolve(from, 'cue-lateness.log')`; review 7 ran it at `10126b3` with `pnpm exec vitest run test/lateness-command.test.ts test/cue-lateness.test.ts test/start-up.test.ts`, 40 of 40 green. Neither file changed since (`git diff 10126b3 -- src/lateness test/lateness-command.test.ts test/start-up.test.ts` is empty).

**Recommended fix** — in `test/lateness-command.test.ts`, give `run` an optional `env` and add one test that runs with no `--log` and `HOME` set to a folder under the worktree's `dist/`:
```ts
function run(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'lateness', ...args], { cwd: REPO_ROOT, env: { ...process.env, TZ: 'America/Chicago', ...env } });
```
```ts
  it('reads the log beside the launch agent\'s server.log when no --log names one', async () => {
    const home = dirname(await logPath());
    const path = join(home, 'Library', 'Logs', 'setlist-controller', 'cue-lateness.log');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, TWO_SUNDAYS);
    const { code, stdout } = await run([], { HOME: home });
    expect(code).toBe(0);
    expect(days(stdout)).not.toEqual([]);
  });
```
`TWO_SUNDAYS` (`test/lateness-fixture.ts:15`) and `days` (`test/lateness-command.test.ts:40`) are already imported or defined there; so are `writeFile`, `mkdir` and `dirname`. A sharper assertion is the day headings an existing `TWO_SUNDAYS` test expects.

**Remediation brief**
- **Design intent:** the server (no `--lateness-log`, as the launch agent starts it) writes to `DEFAULT_LATENESS_LOG`, and `pnpm lateness` (no `--log`) reads it; both import the one constant from `src/server/lateness-log.ts:14`, `join(homedir(), 'Library', 'Logs', 'setlist-controller', 'cue-lateness.log')`, evaluated at module load, so a spawned command picks up `HOME`. #227 pinned the writer; this pins the reader.
- **Full surface:** `test/lateness-command.test.ts:25-36` (`run`), one new test in that file; no `src/` change.
- **Must preserve:** every existing `run([...'--log', path])` call; `TZ: 'America/Chicago'`; the `afterEach` that removes `logDir`. Guardrail: nothing written outside the worktree, so `HOME` must be the `dist/lateness-*` folder `logPath` makes, never the real home.
- **Do not touch:** `test/start-up.test.ts`'s default-path test (right for the writer); `src/lateness/main.ts`.
- **Proof:** `pnpm exec vitest run test/lateness-command.test.ts` green at the fix; with `docs/reviews/setlist-controller-207/repro/pre-pr-review-7-mutation-lateness-reader-default.diff` applied in a scratch worktree at the fix's HEAD, the new test goes red.

### 4. Comment hygiene — LOW (aggregated)
- `test/start-up.test.ts:22-23` — "so the path the server opened it at is read from a spy that still opens the real log." → "so the path the server opened it at is read from a spy that opens the real log, except in the test of the default path, which queues a stand-in so nothing is written under ~/Library." (review 7 finding 4, untouched)

## Needs Further Investigation
### A. A short name with accented letters may not match its folder when Claude copies it from the listing — confirm by listing a library with a folder named in decomposed form (NFD, as an older HFS+ volume or a Finder copy from one stores it) holding a title word such as `Señor`, then building with the short name retyped in composed form (NFC); `nameKey` (`src/set-builder/library.ts:58-60`) lowercases only and never normalizes. If the build prints `matches no song folder`, SKILL.md:76's re-list loops on the same name and the fix is to normalize in `nameKey`. Not executed; outside this delta, and no song folder in Nick's library is known to carry such a name.

## Reviewed and Dismissed
- SKILL.md:26 drops an exception for two folders whose names differ only in letter case, which `foldersNamed` returns both of (finder executed it), so :77's re-list could loop — only a case-sensitive volume holds such a pair (`library.ts:47-49`, `song-list.ts:49-50`), and macOS volumes are case-insensitive by default; review 7 dismissed the same case for :77. No user path.
- A whole-name short name holding `$`, a backtick, `"` or `\` is rewritten by the shell inside `songLine`'s double quotes — pre-existing and outside the delta (`song-list.ts:31`); no song folder name in the build's naming scheme (`<title>-<artist>-<key>-<bpm>bpm`) carries them. Not a defect of this branch.
- The plan path reaching SKILL.md:76 and :77 — a `--plan` build hands `matchSongs` whole folder names `planFolders` resolved in the same run (`main.ts:291-300`, `build-set.ts:162`), so only a filesystem race reaches them (finder).
- `the build-set skill's whole-name match` is circular — no: dropping the whole-name preference from `foldersNamed` turns it red (mutation d), and the old "matches both" text turns it red (mutation e).
- The new tests are green at `10126b3` — no: they pin wording `47e337d` and `c9c2fd9` wrote, and the closure table records each red before green.

## Minor / nits
- `the build-set skill's whole-name match` matches "matches that folder alone" by presence only, so "matches that folder alone and the other one too" stays green (finder's mutation). The `not.toMatch(/matches both/)` beside it covers the plausible regression; no action.
- SKILL.md:76 and :77 send Claude back to step 1 after a build's exit 1, and The yes to replacing (SKILL.md:126-127) does not say in so many words whether that new listing keeps the `--replace` Nick consented to. The consent bullet's "every listing and every command of this build after it carries `--replace`" reads as yes; if Claude drops it, the cost is one repeated replace question, which is safe. Pre-existing: the missing-folder branch re-listed before this delta.
- SKILL.md:60 "The reason after the colon says which: ..." reads as if "ENOENT" and "incorrect header check" are the only two; "says which, such as" reads truer (carried from review 7).

## Test quality
Tests added in the delta: 3 (two parametrized cases in `the build-set skill's name-match fixes`, one in `the build-set skill's whole-name match`). Green against `10126b3`: none, by the closure table's red-before-green. Tautology shapes found: 0. Each test goes red on the mutation its name claims (c, d, e). Gap: the no-match bullet's two remedies and the :60 remedy survive their cuts (finding 1), with a test fix executed and proved.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (1337 passed, 4 skipped) and `pnpm build` pass at `eff63ad`.
- **Commit hygiene:** the delta's commits are scoped one finding each; this doc and `repro/pre-pr-review-8-mutation-name-match-first-remedy-cut.diff` are the only additions.
- **Likely reviewer asks:** whether the listing is re-run when the library changes (finding 2); why the lateness reader's default is not tested (finding 3).

## Verdict
Ready to open a PR with follow-ups. No finding is MEDIUM or higher, and the confirmed list is the same size as round 7's only because three of its four are carried over by scope: two untouched by Nick's choice (3, 4) and one narrowed (1). The one new finding (2) is a pre-existing step 1 rule the delta's new cause sentence leaves out. Finding 1 is a test-only fix in #226's own file and is cheap before the PR; finding 2 needs Nick's yes to reword a sentence before SKILL.md:39; findings 3 and 4 can ship as follow-ups. The name-match bullets have been rewritten twice (#226, then review 7 finding 1); a third rewrite is not recommended, which is why finding 2 fixes step 1 rather than those lines.
