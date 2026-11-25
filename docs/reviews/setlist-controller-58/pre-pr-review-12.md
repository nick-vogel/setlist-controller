# Pre-PR review: setlist-controller#58 Planning Center plan, the ninth run (#229 to #232)

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `1339119`, "Merge pull request #233 from nick-vogel/setlist-controller-58-planning-center-plan", origin/main at review time)
**Reviewed at:** HEAD `78cbc84` (setlist-controller#231 Most of the build-set skill's rule sentences are pinned by no trace, so an edit to one of them passes every check), clean tree: 0 files with uncommitted changes, 0 untracked; 11 files total, +2652 / -304
**Delta under review:** none; a fresh full review (`--fresh`) of everything since the merge-base: #229 (`fefa583`, merge `18bcf20`), #230 (`bf615f1`, `eb829a3`, merge `09c4fc6`), #232 (`e0a644c`, merge `c64c10a`), #231 (`b379658`, `aebde5e`, `85865bf`, `916d157`, merge `78cbc84`).
**Reviewed against:** the bodies of #229, #230, #231 and #232; `pre-pr-review-11.md`'s Approach decisions and findings 1 and 2, and `pre-pr-review-10.md` finding 2, which #229 claims to close; the head of `.claude/skills/build-set/traces.md` (the trace and sentence-check rules); the repo entry's guardrails. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the conformance checklist is the five review rules every repo carries plus the Approach decisions.
**Date:** 2026-10-23
**Reviewer:** 2 code-review agents + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration tests | `pnpm test` | green: 63 files, 1452 passed, 4 skipped; no flake |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` | green: 44 passed |
| #230 guard, value shapes | finder probe of `parseArgs` (node 26.3.0) with the CLI's option config | `--replace` with no value, `--replace --date x` and `--replace -x` exit 2; a trailing slash resolves equal; `--replace=` parses to `[""]` (Minor) |
| #230 guard, placement | mutants in scratch worktrees at HEAD: guard skipped, moved after `readWeekPlan`, moved after `planSet`, moved between the token read and the request, moved after the library read | skipped: 9 tests red; after `readWeekPlan`: 3 red; after `planSet`: 1 red; between the token read and the request: **green** (finding 2); after the library read in `--list`: green, but behaviourally equivalent (Dismissed) |
| #230 surface | `grep` for every reader of `values.replace`, every bare `--replace` in `SKILL.md` code spans and in trace commands | `replaces()` is the only reader; every composed `--replace` is `--replace "<folder>"`. `build-set.ts:102`'s problem line still names a bare `--replace` (finding 1) |
| #231 coverage check on the real files | finder probe of `sentenceCoverage` at HEAD | 281 sentences: 162 pinned, 119 exempt by 115 entries; 80 traces, equal to `TRACE_COUNT` |
| #231 shown red | finder: a new sentence added to The yes to replacing; the sole pin `That line is no song line, and it never sets exit 1.` deleted from `example-9-yes` | both red; the second names `SKILL.md:14` and the sentence |
| #231 checker mutants | 16 mutants of `test/build-set-traces.ts`, run on `test/build-set-skill.test.ts` (finder), 3 re-run here | 7 killed; 9 survive, among them a pin covering by text instead of place and an exempt entry matching part of a sentence (finding 3) |
| #229 carve-out and traces | read of `SKILL.md:124`, and of `209-row-4-rebuild-the-set-with-a-new-date`, `209-row-5-replace-it-with-a-new-date` and the two row 5 traces' third turns | the carve-out names the class ("any words for replacing"), scoped "with it"; both new traces lead to the replace question for the new folder; both row 5 third turns are a yes with a change. Review 11 findings 1 and 2 and review 10 finding 2 are closed |
| #232 one reading | `grep` for "starts with nothing crossed", "starts with no consent", "new build" in `SKILL.md`; read of `:16` and `:125` | no sentence reads the switch to the Steps as a new build; From the plan path points at When the build ends, which defines a fix that answers the failure |
| Recommended tests | added in a scratch worktree at HEAD, run green, then against each repro mutant | each new test passes at HEAD and goes red on its mutant (finding 2 and 3 Proof lines) |
| Tautology audit | branch's test files copied into a base worktree; base helper and base data tried separately | 72 tests added or changed: every #230 test red at base but one rename; the #231 unit tests red with the base helper; 26 new trace runs green at base, as listings over behaviour base already had; see Test quality |
| Em-dashes | `grep` on added lines | none outside this doc's headings |

**Overall:** every acceptance criterion of #229 to #232 holds, every check is green, and the CLI now refuses a `--replace` that names any folder but the command's own. Three LOW defects remain, plus comment hygiene: the build's own "already exists" problem still tells a person to add a bare `--replace`, the plan listing's guard placement before the token read is pinned by no test, and the sentence check's own unit tests do not pin two of the rules #231 names. Nothing blocks the PR.

## Approach decisions
- **Carried forward from `pre-pr-review-11.md`:** the yes to replacing is one named section (#197); a build ends when a build command runs, whatever its exit code; the crossing's end point is Nick's #203 Decision; each yes, named `--replace` and step 6 `--replace` is for one set folder (One set folder, #209); the replace rule changes only with traces (#210); a yes word at a question is the yes, never a named `--replace` for a new folder (`88c2b15`), and the carve-out names the class of words (#229, `fefa583`).
- **The CLI holds the one-folder rule** (#230, `bf615f1`): `--replace <set folder>`, compared as `resolve(from, value)` against `setFolder(outputRoot(), date)`, a second `--replace` a usage error, and the check before the token read, any request or any write. Its usage problem names no folder to copy onto `--replace`, only the value given, and points at the listing without it (`eb829a3`).
- **The listings' last lines and the build's "already exists" problem kept their wording in #230** (its assumption 7), with a proposal to change them as their own ticket; finding 1 follows that proposal rather than overturning it.
- **A fix after a build's exit 1 that answers that failure keeps the flags and `--replace`** (#232, the #203 reading), defined once in When the build ends.
- **Every sentence of the four sections is pinned or listed** (#231): the split rule at the head of `traces.md` is the one statement, and the checker in `test/build-set-traces.ts` follows it. A checker rule that the rule text states gets a unit case of its own (finding 3).

## Confirmed Issues
### 1. The build's "already exists" problem tells a person to add `--replace`, which now takes a folder — LOW
- **Location:** `src/set-builder/build-set.ts:102`
- **Attribution:** introduced, by the flag's change of shape in `bf615f1` (setlist-controller#230 pnpm build-set --replace replaces the set for whatever date the command names, ...). The line itself is unchanged since the base (`git show 1339119:src/set-builder/build-set.ts | grep -n "Build with --replace"` gives `:102`); before `bf615f1`, a bare `--replace` was the right fix. The #230 lane recorded it as a proposal in `.epic-loop/tickets/230/proposals.md`, not filed.
- **Real-world trigger:** Nick runs `pnpm build-set grace lord rain` by hand on a Sunday whose set folder exists, reads `<folder> already exists. Build with --replace to replace it.`, adds `--replace`, and gets `Option '--replace <value>' argument missing` with exit 2. Nothing is written or replaced. The skill is not affected: Steps step 6 (`SKILL.md:32`) tells it to add `--replace "<folder>"` with the folder the problem names, after a yes. Capped at LOW: a confusing message that fails safe, with no user path to a wrong set.

**Evidence**
```ts
const existing = existsSync(folder) && !options.replace ? [`${folder} already exists. Build with --replace to replace it.`] : [];
```

**Failure mode** - the problem's fix is a command the CLI now rejects. A person following it word for word meets a parse error, not a replace, and has to read the usage text to learn the value.

**Recommended fix** - file the #230 proposal as its own ticket rather than fix it in this PR: the line is quoted in `test/set-builder.test.ts:1243`, `:1268`, `:1316`, `:1408`, `test/set-builder-command.test.ts:462` and eight trace `Note:` lines in `.claude/skills/build-set/traces.md` (`:2712`, `:2763`, `:2820`, `:2873`, `:2920`, `:2982`, `:3035`, `:3083`), and Steps step 6's sentence that copies the folder from it. The change is the problem line naming the shape, for example `` `${folder} already exists. Build with --replace "${folder}" to replace it.` ``, or pointing at the listing as the usage problem does.

**Remediation brief**
- **Design intent:** `buildSet` stops on an existing set folder unless `options.replace` is true, and `main.ts`'s `replaces()` sets that only when `--replace` names that same folder. The problem line is the build's only explanation of the stop; Steps step 6 reads the folder out of it and shows the command with `--replace "<folder>"` for a yes.
- **Full surface:** `src/set-builder/build-set.ts:102`; the quotes at `test/set-builder.test.ts:1243`, `:1268`, `:1316`, `:1408` and `test/set-builder-command.test.ts:462`; the trace Notes listed above; `SKILL.md:32`'s "A set folder that already exists is fixed by the same command with `--replace "<folder>"`, the folder the problem names, copied as printed" and every trace that pins it; `test/build-set-skill-quotes.test.ts` if the new wording is backticked in plan step 2.
- **Must preserve:** the problem names the folder (Steps step 6 copies it); the build writes nothing on it (`test/set-builder-command.test.ts`, "stops on a set folder that already exists"); the listings' last lines are a separate decision (#230 assumption 7) and do not change with it.
- **Do not touch:** the usage problem in `replaces()` (Dismissed and Minor below), which deliberately names no folder to copy.
- **Proof:** `pnpm exec vitest run test/set-builder-command.test.ts -t "already exists"` and `pnpm exec vitest run test/set-builder.test.ts`, with the quotes updated first so they go red, then the line.

### 2. Nothing pins the plan listing's `--replace` check before the token read — LOW
- **Location:** `src/set-builder/main.ts:190` (`const replace = replaces(date);` in `planList`), tests at `test/set-builder-plan-list.test.ts:524-544`
- **Attribution:** introduced in `bf615f1`: the comment at `test/set-builder-plan-list.test.ts:522-523` and `main.ts`'s `replaces()` comment (`:363`) claim "before the token is read", and every mismatch test runs with a valid token file, so only "before any request" is pinned.
- **Real-world trigger:** a later edit moves the check into `readWeekPlan` between `readToken` and `readPlan`. On a Mac with no token file, a listing with a mismatched `--replace` then prints the token problem and exits 1 instead of the usage problem and exit 2, so the skill reads it as a token fault and points Nick at the install doc. No set is touched either way, so LOW, capped: no user path today, since the code is right.

**Evidence** - the mutant `docs/reviews/setlist-controller-58/repro/review-12-mutation-guard-after-token.diff` moves the call after `if (!token.ok) return fail([token.problem]);` and before `readPlan`; `pnpm exec vitest run test/set-builder-command.test.ts test/set-builder-plan-list.test.ts test/set-builder-plan.test.ts` stays green, 204 passed.

**Failure mode** - the ticket's ordering ("before the token is read or any Planning Center request") can regress with every check green.

**Recommended fix** - one test in `test/set-builder-plan-list.test.ts`, before the `// setlist-controller#230: a listing whose --replace names another set folder` comment:
```ts
  it('stops on a --replace naming another set folder before it reads the token file, exit 2', async () => {
    const workspace = await phase0Workspace();
    const fake = await planningCenter();

    const result = await run(['--plan', '--list', '--date', PHASE_0, ...listPaths(workspace), '--replace', join(workspace.outputRoot, '2027-01-10 Sunday')], fake, join(workspace.dir, 'no-token.env'));

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith('--replace names '), result.stderr).toBe(true);
    expect(fake.requests).toEqual([]);
  });
```
The `--plan` build needs no new test: moving its check after `planSet` already turns `test/set-builder-plan.test.ts:556` red (its stderr `startsWith`).

**Remediation brief**
- **Design intent:** `replaces(date)` is a usage check, so it runs with the other usage checks, after the `--date` check and before `readWeekPlan` reads the token and asks Planning Center for the plan. A usage problem always wins over a token, plan or library problem.
- **Full surface:** `test/set-builder-plan-list.test.ts` only; `src/set-builder/main.ts` does not change.
- **Must preserve:** the three existing `it.each` cases at `:524-544` with their valid token file and `fake.requests` check; the helper `run` and `phase0Workspace` unchanged.
- **Do not touch:** the `--list` guard's place before `listSongs` (Dismissed: moving it after the library read changes nothing a test or a person can see).
- **Proof:** the new test passes at HEAD; in a scratch worktree, `git apply docs/reviews/setlist-controller-58/repro/review-12-mutation-guard-after-token.diff` then `pnpm exec vitest run test/set-builder-plan-list.test.ts -t "before it reads the token file"` fails (proved here: 1 failed).

### 3. The sentence check's unit tests do not pin per-place coverage or whole-sentence exempt matching — LOW
- **Location:** `test/build-set-traces.ts:322` (`pinnedBy`), `:323` (`listed.has(sentence.text)`), `:329` (`copies`); tests at `test/build-set-skill.test.ts:252-277`
- **Attribution:** introduced in `b379658` (setlist-controller#231 Every sentence in the build-set skill's four rule sections is pinned by a trace or listed with a reason).
- **Real-world trigger:** a later edit to the checker matches by text instead of by place, or by substring, and the check stops guarding what #231 asks: a second copy of a sentence goes unpinned because its twin is pinned (`SKILL.md` holds four sentences more than once today, such as `Done when you have every line.`), or an exempt entry such as `Done.` exempts every sentence that contains it. The checker is right today (the real-file probe finds no sentence covered only by text), so LOW, capped: no user path; it is the guard on the skill's guard.

**Evidence** - three mutants, each green on `pnpm exec vitest run test/build-set-skill.test.ts` (108 passed):
- `docs/reviews/setlist-controller-58/repro/review-12-mutation-per-place.diff`: `pinnedBy` becomes `spans.find(({ start, end }) => skill.slice(start, end).includes(sentence.text))?.id`.
- `docs/reviews/setlist-controller-58/repro/review-12-mutation-exempt-substring.diff`: `!listed.has(sentence.text)` becomes `![...listed].some((entry) => sentence.text.includes(entry))`.
- the same with `copies` found by `text.includes(sentence)` (not kept; one line, the same test kills it).

**Failure mode** - #231's AC "wholly inside one pin's occurrence" and its exempt-list staleness rule can be weakened with every check green.

**Recommended fix** - in `test/build-set-skill.test.ts`'s `describe('the sentence check')`, before the `it.each` of exempt entries, add:
```ts
  it('counts a pin as covering only its own place, not a copy of its sentence elsewhere', () => {
    const joined = TRACE.replace('Show it to him.\nRun it only on his yes.', 'Show it to him. Run it only on his yes.');

    expect(coverage(joined, EXEMPT, COVERED.replace('\nDone.\n', '\nDone. Run it only on his yes.\n'))).toEqual(['SKILL.md:9: Run it only on his yes.']);
  });

  it('matches an exempt entry to a whole sentence, not to part of one', () => {
    expect(coverage(TRACE, EXEMPT.replace('Sentence: Then the build', 'Sentence: the build'), COVERED)).toEqual([
      'SKILL.md:5: Then the build',
      'The exempt list: the build: it is no sentence of the four sections of SKILL.md',
    ]);
  });
```
and to that `it.each`, after the `'is no sentence of the four sections'` row:
```ts
    ['is a sentence outside the four sections', `${EXEMPT}\nSentence: Outside every section, so no sentence.\nReason: a test reason\n`, 'The exempt list: Outside every section, so no sentence.: it is no sentence of the four sections of SKILL.md'],
```

**Remediation brief**
- **Design intent:** a pin covers the sentences inside its one place in `SKILL.md` (start and end offsets), never text elsewhere; a pin found twice covers nothing. An exempt entry stands for every place its exact sentence text stands, and is stale when no sentence of the four sections has exactly that text. The rule text is the head of `traces.md`, `:13-20`.
- **Full surface:** `test/build-set-skill.test.ts` only; `test/build-set-traces.ts` does not change.
- **Must preserve:** every existing case in the `describe('the sentence check')` block, including the `halves` and `part` cases at `:260-266`; the `TRACE`, `EXEMPT` and `COVERED` fixtures unchanged (the new cases derive from them with `replace`).
- **Do not touch:** `sentenceCoverage`'s rule that a pin found twice covers nothing (Minor: it has no unit case, but `missingPins` catches a repeated pin first).
- **Proof:** the new tests pass at HEAD (proved here); in a scratch worktree, `git apply docs/reviews/setlist-controller-58/repro/review-12-mutation-per-place.diff` turns "counts a pin as covering only its own place" red, and `git apply docs/reviews/setlist-controller-58/repro/review-12-mutation-exempt-substring.diff` turns "matches an exempt entry to a whole sentence" red, each with `pnpm exec vitest run test/build-set-skill.test.ts` (proved here: 1 failed each). The outside-the-sections row was not run against a mutant; it kills a checker that tests `skill.includes(entry)` by construction, since `COVERED` holds that sentence.

### 4. Comment hygiene — LOW (aggregated)
- `src/set-builder/main.ts:365-366` - "the problem names no set folder to copy onto --replace: a copied one would replace that folder before anyone was asked about it" → "the problem names no set folder but the value given, which is never the one to copy onto --replace: a copied folder would replace it before anyone was asked about it"
- `src/set-builder/main.ts:153` - "then a --replace that names another set folder (replaces), is a usage problem." → "then a --replace that names another set folder, or a second --replace (replaces), is a usage problem."
- `src/set-builder/main.ts:180` - "then a --replace that names another set folder (replaces), is a usage problem before any request." → "then a --replace that names another set folder, or a second --replace (replaces), is a usage problem before any request." (rewrap the comment to the file's width while there)
- `.claude/skills/build-set/traces.md:15` - "one list marker (`1. ` or `- `)" → "one list marker (`<n>. ` or `- `)", as `lineSentences`' `\d+\. ` reads it
- `.claude/skills/build-set/traces.md:16` - "when the word after the space starts with a lowercase letter" and "the word after it does not start with a lowercase letter" → "when the character right after the space is a lowercase letter" and "the character right after it is no lowercase letter", as `/^[a-z]/.test(line.slice(after + 1))` at `test/build-set-traces.ts:264` reads it
- `test/build-set-traces.ts:252` - "when what follows the space is no lowercase word" → "when the character after the space is no lowercase letter"

## Needs Further Investigation
None.

## Reviewed and Dismissed
- `SKILL.md:124`, the named-`--replace` sentence ("make it November 1, and replace it" is named for the new folder) against the carve-out that follows it - the carve-out is the specific case (an answer to the replace question or the step 6 command), and the traces read it so: `209-row-2-new-date-and-replace-it` answers "Run it?", the `209-row-4-*` and `209-row-5-replace-it-with-a-new-date` traces answer the replace question. Settled in review 10 and 11's Approach decisions; do not reorder or reword either sentence for it.
- The exempt reason of "Nothing in the library, the plan or the command fixes that, so Nick can build the set from songs he names, by the Steps." - what crosses on a switch to the Steps is decided by When the build ends and From the plan path "whatever fix they name" (`SKILL.md:125`), not by the fix line's text, so no listing or command depends on it.
- `plan-listing-runs-the-build-checks`' question quoting `Fall Like Rain-Call On Heaven-E-70.00bpm: MultiTracks/AG 2.wav is missing from the song folder.` - the same text is asserted at `test/set-builder-plan-list.test.ts:401`, from `src/set-builder/song.ts:69`.
- The `--list` guard moved after `listSongs` (finder mutant M3) - the call still runs before any output and before the `listing.ok` branch, so a missing library still gives the usage problem and exit 2 (proved here: a test with a missing library stays green on the mutant). The library read is read-only. Not a gap.
- `projectFolder()` in the harness uses the production `setName` - only the positive `--replace` cases compute their folder with it; every negative case, the relative-path case and the plan-list cases use literal folder names, so a wrong `setFolder` still goes red.
- The `--plan` build's guard placement - moving it after `planSet` turns `test/set-builder-plan.test.ts:556` red (audit mutant c).

## Minor / nits
- The usage problem echoes the `--replace` value (`main.ts:374`), usually a set folder path. It can never equal the command's own folder (a match passes), so copying it back fails again; deliberate and pinned at `test/set-builder-command.test.ts:501` and `:582`. See the comment hygiene entry.
- `--replace=` or `--replace .` is accepted when the folder the command runs from is the set folder (`resolve(from, "")`). Under pnpm `from` is `INIT_CWD`, the repo root, so out of reach.
- `test/build-set-skill-examples.test.ts`' `scratchReplace` keeps only the basename of a worked example's `--replace` and takes `--date` from it, so a worked example whose `--replace` names the wrong root or the wrong Sunday for its scenario still passes. No worked example has its own `--date` or `--output-root` today.
- `test/build-set-skill.test.ts:397-410` (`listingArgs`): a `--flag=/path` word skips the stand-in check. No trace uses the `=` form; `--output-root` is appended after, so nothing is written outside the workspace.
- The split rule leaves unstated: a code fence or `###` heading inside the four sections, and an unmatched backtick. None occurs in the four sections today.
- Unit cases are missing for parts of the split rule: the `'` and `*` closers, a `.` followed by a lowercase word, a `?` closed by `)` and followed by a lowercase word, the pin-found-twice branch of `sentenceCoverage`, and the backslash throw in `words()`.
- `SKILL.md:23` lists the `--replace` that crosses as "named by Nick or carried by a yes to the replace question", not a yes to the step 6 command; `209-row-5-steps-switch` reaches its outcome through One set folder instead. Unchanged by this branch.
- `209-row-4-replace-it-with-a-new-date-exit-2` and `steps-replace-exit-2` record a listing One set folder forbids, on purpose (each Note says so), to run the CLI's exit 2. The runner compares only the exit code and last line, so the first is green at base too, on a different usage error. The head of `traces.md` does not say a trace may record a deliberate fault.
- `test/build-set-skill.test.ts:200` asserts inside a loop with no count, so it would pass on an empty split; the case before it pins the whole list.
- `test/set-builder-plan-list.test.ts:538` checks only that stderr starts with `--replace `, so it cannot tell the "names" problem from the "given 2 times" one.

## Test quality
Tests added or changed: 72 (plus 12 renamed for a moved `SKILL.md:<line>`). Green against `$BASE`: the one renamed "with no --replace" `it.each` case (a rename, `bf615f1`) and 26 new trace runs, which run listings over CLI behaviour base already had; that is their design, since each pins skill sentences and the pin check is red at base. Every #230 test is red at base. The #231 unit tests are red against the base helper (it has no `skillSentences`). Mutants: the #230 guard skipped turns 9 tests red, moved after `readWeekPlan` 3, moved after `planSet` 1; between the token read and the request, none (finding 2). The #231 checker: 7 of 16 mutants killed; the ones on #231's named rules are finding 3, the rest are Minor. No mocks, spies or snapshots; every #230 test spawns the real CLI against the fake Planning Center.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `78cbc84`; e2e green locally.
- **Commit hygiene:** commit this doc with its three `repro/review-12-mutation-*.diff` files.
- **Likely reviewer asks:** why `--replace` now takes a path (the #230 body); the size of the exempt list (115 entries, each with a reason, by #231's AC).

## Verdict
**Ready to open the PR as-is.** 0 CRITICAL, 0 HIGH, 0 MEDIUM; 3 LOW and comment hygiene. Finding 1 is the #230 lane's own proposal and fits a follow-up ticket; findings 2 and 3 are test-only and fit the PR or a follow-up. #229 closes `pre-pr-review-11.md` findings 1 and 2 and `pre-pr-review-10.md` finding 2 in the text and in traces, none by a comment or doc edit alone.
