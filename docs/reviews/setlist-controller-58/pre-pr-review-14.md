# Pre-PR review: setlist-controller#58 the "already exists" lines name the folder --replace takes (#240)

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `1ebd265`, "Merge pull request #241 from nick-vogel/setlist-controller-58-planning-center-plan", origin/main at review time)
**Reviewed at:** HEAD `d0993e9` (setlist-controller#240 Typing --replace the way the "already exists" lines say gets a usage error, since --replace now takes the set folder), a `--no-ff` merge of lane commit `7fab450` (same subject) with an empty diff between them. Clean tree: 0 files with uncommitted changes, 0 untracked. 10 files total against the merge-base, +233 / -157.
**Delta under review:** none. This is a `--fresh` review of the whole working surface against the merge-base. Since PR #241 landed on main, that surface is the #240 change alone.
**Reviewed against:** setlist-controller#240 (its "What done looks like" list, which came from pre-PR review 12 findings 1 and 2 and pre-PR review 13 finding 2), the epic setlist-controller#58, the head of `.claude/skills/build-set/traces.md` (the trace, pin, sentence-check and exempt-list rules), `pre-pr-review-13.md`'s Approach decisions, and the repo entry's guardrails. The repo has no `CLAUDE.md`, no coding standards file and no `CONTEXT.md`, so the five shared review rules stand in for them: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, and the nearest in-repo precedent for every fix shape.
**Date:** 2026-10-24
**Reviewer:** 1 code-review agent + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration tests | `pnpm test` | red on the first run (load average 32): 5 tests timed out at 5000 ms, none of them an assertion failure. Green on the re-run 60 seconds later: 67 files, 1556 passed, 4 skipped. A flake, see "Before opening the PR" |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` | green: 50 passed |
| The two lines name the folder | read `build-set.ts:102` and `plan-list.ts:67` | both print `--replace "<folder>"` with the real folder. The `already exists, and --replace replaces it.` line is unchanged |
| The printed folder copies back | read `replaces()` (`main.ts:367-377`), `outputRoot()` (`main.ts:356-358`) and `setFolder` (`build-set.ts:91-93`) | the printed folder is `setFolder(outputRoot(), date)`, which is already absolute and resolved, and `replaces()` compares `resolve(from, value)` with that same string. A relative `--output-root`, a trailing slash or a `~` all round-trip. Neither side resolves symlinks |
| No bare `--replace` left | `grep` for "unless --replace replaces", "Build with --replace to" across `src`, `test`, `.claude`, `e2e`, `web`, `scripts`, `README.md`, `docs/install.md` | none outside `docs/reviews/`. `README.md:69,73,80` paraphrase the line and quote neither form |
| Usage text, skill, traces move together | finder read of the diff; the audit's mutations 3 and 4 | every quote moved: USAGE `main.ts:86-88` and `:94-95`, SKILL.md Steps steps 1 and 6, plan step 1, When it is asked, A `--replace` Nick names, One set folder, worked examples 9 and 10, and traces.md's Last line and Note lines |
| The R12.2 guard can go red | audit applied `repro/review-12-mutation-guard-after-token.diff` in a scratch worktree at `d0993e9` | `set-builder-plan-list.test.ts:522` goes red at `:530` with "Cannot read the Planning Center token file ..." first on stderr. It is the only test in the file that catches the mutant (1 failed, 38 passed) |
| The new sentence's pin can go red | audit deleted the sentence from SKILL.md in the scratch worktree | `the pin check > finds every pinned sentence in SKILL.md word for word, once` goes red and names `r13-2-relist-before-reply-keeps-replace` |
| The new trace | finder read against SKILL.md and `shortName()` (`song-list.ts:53-72`) | Nick's turns are the songs, then "yes". The second listing keeps `--replace` and ends `already exists, and --replace replaces it.`. The question is "Run it?" and the trace pins the new sentence. `are` is the right short name once Lord I Need You is in the library. `TRACE_COUNT` is 84 |
| Recommended fix for finding 1 | in a scratch worktree at `d0993e9`, moved the new sentence to after "It is the command shown again after a fix, ...", then `pnpm exec vitest run test/build-set-skill.test.ts` | 112 passed: the pin check and the sentence check stay green |
| Tautology audit | the branch's changed tests run at `1ebd265` in a scratch worktree, with and without the branch's `traces.md`, plus 4 mutations at HEAD | no tautologies, see Test quality |
| Scratch worktrees | `git worktree list` | none left |
| Em-dashes | `grep` on added lines | none |

**Overall:** #240 does what it says. Both "already exists" lines now print the `--replace "<folder>"` the user has to type, with the real folder. The printed folder round-trips through `replaces()`. Every quote of the two lines moved with them. The R12.2 guard and the new skill sentence each go red on their mutants. Every full check is green, with one load flake on the first `pnpm test`. One LOW finding: the new sentence in When the build ends sits between "A fix answers that failure ..." and the sentence whose "It" referred to that fix, so the "It" now reads as "the listing". Moving the sentence one place later fixes this and keeps every pin.

## Approach decisions
- **Carried forward from `pre-pr-review-13.md`:** the yes to replacing is one named section (#197). A build ends when a build command runs, whatever its exit code. Each yes, named `--replace` and step 6 `--replace` is for one set folder (One set folder, #209). The replace rule changes only with traces (#210). The CLI holds the one-folder rule (#230). A fix after a build's exit 1 that answers that failure keeps the flags and `--replace` (#232), defined once in When the build ends. Every sentence of the four sections is pinned or listed (#231). Main's new rule sentences are pinned or exempted. A hand trace proves by execution only its listings' exit codes and last lines, plus its pins.
- **A printed fix names its value, quoted with plain double quotes and no escaping** (#240, `7fab450`). This mirrors `songLine` (`src/set-builder/song-list.ts:31`, `` `"${shortName}"` ``). See Minor / nits on output roots that hold shell metacharacters.
- **A re-listing that a Steps step 6 fix runs is part of that fix, whether or not Nick has replied** (#240). It is stated once, in When the build ends, and the step 6 fix lines (`SKILL.md:76-77`) stay as they are. Finding 1 moves the sentence and keeps its wording.

## Confirmed Issues
### 1. The new When the build ends sentence takes over the antecedent of the "It" in the sentence after it — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:130`
- **Attribution:** introduced, by `7fab450` (setlist-controller#240 ...). `git show 1ebd265:.claude/skills/build-set/SKILL.md` line 130 has "... whatever fix they name. It is the command shown again after a fix, ...". #240's acceptance criterion prescribed the placement ("one sentence after '...whatever fix they name.'"), so the plan and the code agree, and the placement is what is wrong.
- **Real-world trigger:** Claude reads When the build ends to decide whether a step taken after a build's exit 1 is a fix, which keeps `--replace`, or a new build, which starts with no consent. No trace or conversation was found where the misreading changes a command or question. LOW, capped: upgrade to MEDIUM if a trace or a real session shows Claude treating a re-listing as "the command shown again" and showing a command where it should list, or the reverse. Check by tracing the 11 traces that pin `It is the command shown again after a fix` (`grep -n "It is the command shown again after a fix" .claude/skills/build-set/traces.md`) against a reading where "It" is "the listing".

**Evidence**
> A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name. The listing a fix under Steps step 6 runs again (back to step 1) is part of that fix, whether Nick's reply comes before it or not. It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, ...

**Failure mode:** "It is the command shown again after a fix ..." defines what a fix is. At the base, its "It" followed "A fix answers that failure ...", whose subject is the fix. Now the nearest subject is "The listing ...", so the sentence reads as "the listing is the command shown again after a fix". That contradicts the sentence just before it, which says the listing is *part of* the fix. A reader who resolves "It" to the listing loses the definition of a fix that the rest of the section and the 11 traces pinning that sentence depend on.

**Recommended fix:** move the new sentence to after the "It is the command ..." sentence, wording unchanged:

```diff
-... whatever fix they name. The listing a fix under Steps step 6 runs again (back to step 1) is part of that fix, whether Nick's reply comes before it or not. It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name". A request he makes ...
+... whatever fix they name. It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name". The listing a fix under Steps step 6 runs again (back to step 1) is part of that fix, whether Nick's reply comes before it or not. A request he makes ...
```

**Remediation brief**
- **Design intent:** When the build ends is the one place that decides whether a step after a build's exit 1 keeps that build's `--replace` (a fix) or starts with no consent (a new build). Its sentences run in order: the build ends; a fix is no such build; when a fix answers the failure; what a fix is ("It is the command shown again ..."); and, after #240, that a step 6 re-listing is part of the fix; then what is no fix. Every sentence is pinned word for word by traces, and the pin check matches a sentence wherever it stands in the paragraph.
- **Full surface:** `.claude/skills/build-set/SKILL.md:130` only. The pins in `.claude/skills/build-set/traces.md` are unchanged because no sentence's words change: the new sentence is pinned at `traces.md:4290`, and "It is the command shown again after a fix, ..." at `:1552`, `:1632`, `:2205`, `:2770`, `:2828`, `:3138`, `:3198`, `:3256`, `:4105`, `:4166` and `:4230`.
- **Must preserve:** both sentences word for word: `r13-2-relist-before-reply-keeps-replace` pins the new one, and 11 traces pin "It is the command ...". The sentence check (`the pin check > covers every sentence of the four sections with a pin or an exempt entry` in `test/build-set-skill.test.ts`) and the pin check (`finds every pinned sentence in SKILL.md word for word, once`). The step 6 fix lines at `SKILL.md:76-77` stay as they are. By the head of `traces.md`, the commit body says the traces were re-read and that no outcome moved: a move of a pinned sentence is a change to the paragraph that holds it.
- **Do not touch:** do not reword "It is the command ..." to "A fix is the command ...". That changes a sentence pinned by 11 traces for no gain over the move.
- **Proof:** a text fix with no executable red. After the move, `sed -n '130p' .claude/skills/build-set/SKILL.md` shows "It is the command shown again after a fix" directly after "whatever fix they name.", and `pnpm exec vitest run test/build-set-skill.test.ts` stays green (112 passed when this was done in a scratch worktree at `d0993e9`).

## Needs Further Investigation
None.

## Reviewed and Dismissed
- The four `not.toContain('--replace "')` checks narrowed to `stderr.split('\n\nUsage:')[0]` (`test/set-builder-command.test.ts:491`, `:524`, `:590`; `test/set-builder-plan-list.test.ts:553`). The narrowing is needed because USAGE now holds `--replace "<folder>"` as a placeholder. Each test also asserts the `\n\nUsage:` separator, so the narrowed check still goes red if the problem itself names a folder.
- `.replace` → `.replaceAll` in the traces' listings runner (`test/build-set-skill.test.ts:485`). Needed because the new line holds the folder twice. It is a harness change, not a weakened assertion: 49 traces go red against base code.
- Two commits with one subject (`7fab450`, `d0993e9`). `d0993e9` is the `--no-ff` lane merge, with an empty diff against `7fab450`, the same shape as #230 to #232's merges.
- The new R12.2 test is green at `1ebd265`. That is expected for a regression guard, since the order it pins already held at the base. It goes red on review 12's mutant.
- `traces.md`'s eight `Note:` lines that quote the build's problem are checked by nothing (the audit's mutation 3 left both skill test files green). This is by design: per Approach decisions, a trace's Note is traced by hand. The wording is pinned by `test/set-builder.test.ts` and `test/set-builder-command.test.ts`.
- `projectFolder()` (`test/set-builder-harness.ts:75`) builds the folder with production `setName`. That predates the branch, and it builds only the folder name, not the line under test.

## Minor / nits
- `src/set-builder/build-set.ts:102` and `src/set-builder/plan-list.ts:67`: `--replace "${folder}"` is not shell-safe for an `--output-root` that holds `"`, `$`, a backtick or `\`. Pasted into a shell, such a path expands or the quote ends early. Then `replaces()` exits 2 and nothing is replaced, so it fails closed. The default root and the `YYYY-MM-DD Weekday` folder names hold none of these. It follows the `songLine` precedent, and any change goes to both.
- `src/set-builder/main.ts:86-87` and `:94-95`: the USAGE text now nests double quotes ("... unless --replace "<folder>" replaces it."). Cosmetic. A change also moves the `toContain` strings in `test/set-builder-command.test.ts` at about `:1108` and `:1192`.
- `src/set-builder/main.ts:74-75` (the USAGE `--replace` paragraph) and the `replaces()` comment at `:360-362` name the listings' last line as where the folder comes from. The build's problem prints it now too. What they say is true but incomplete.
- `src/set-builder/plan-list.ts:31`: the reflowed comment leaves a short line ("... A song line").

## Test quality
Tests changed or added: 26 test sites across 5 files, 1 of them new (`test/set-builder-plan-list.test.ts:522`).

Red at `1ebd265`: every test that pins the new wording, for example `test/set-builder-command.test.ts:452`, `:1002`, `:1045`, `:1061`, `:1097`, `:1185`, `test/set-builder-plan-list.test.ts:456`, `:470`, `:577` (both cases), `:592`, and `test/set-builder.test.ts:1229`, `:1261`, `:1306`, `:1391`. `TRACE_COUNT` is red too. With the branch's `traces.md`, 49 trace listings are red.

Green at `1ebd265`, and none of them vacuous:
- The two `build-set-skill-quotes.test.ts` fixture updates (`:231-235`, `:303`) test the pure matcher and quote reader. The production quote check (`:329`) goes red on 8 SKILL.md lines when `existingSetLine` reverts.
- The four narrowed `not.toContain` checks.
- The `replaceAll` harness change.
- The new R12.2 guard, which is red on its mutant.

Tautology shapes found: 0. No expectation is built with `existingSetLine` or the build's message. No unit under test is mocked, and no snapshot is used. The command and plan-list tests spawn the real `pnpm build-set`.

Mutations at HEAD:
- Reverting `build-set.ts:102` turns 5 tests red.
- Reverting `existingSetLine` turns 65 red.
- Deleting the new sentence turns the pin check red.
- Moving the `--replace` check after the token read turns the R12.2 guard red.

## Before opening the PR
- **CI readiness:** lint, typecheck, test, build and e2e are green at `d0993e9`. The first `pnpm test` run timed out on 5 tests at load average 32, then passed on the re-run: `test/set-builder-plan-list.test.ts:404`, `:606`, `:727`, `test/set-builder-plan.test.ts:790` and `test/set-builder-command.test.ts:452`, each "Test timed out in 5000ms". These are the known load flakes of setlist-controller#205.
- **Commit hygiene:** nothing uncommitted. Finding 1 is one commit touching `SKILL.md` alone.
- **Likely reviewer asks:** why the `not.toContain` checks were narrowed (answered in the test comments and in `7fab450`'s body); whether the printed folder round-trips (it does, see the table).

## Prior-review closure
This `--fresh` review re-reads everything, but #240 set out to close three prior findings. All three are closed:
- `pre-pr-review-12.md` finding 1, the "already exists" lines naming `--replace` without its folder: fixed in code, quotes, skill and traces.
- Review 12 finding 2, nothing pinning the `--replace` check before the token read: fixed by `test/set-builder-plan-list.test.ts:522`, red on the mutant.
- `pre-pr-review-13.md` finding 2, the re-listing before Nick's reply: fixed by the new When the build ends sentence and its trace. That sentence's placement is this review's finding 1.

Review 13 findings 1 (trace libraries and commands that nothing executes, LOW) and 3 (comment hygiene in two exempt reasons, LOW) are untouched by this branch and were outside #240. Review 12 findings 3 and 4 are untouched by Nick's decision not to file them. None of the untouched findings is MEDIUM or higher.

## Verdict
**Ready to open the PR, with one LOW follow-up.** No finding gates the PR. Finding 1 is a one-sentence move in `SKILL.md`, with no change to any pin. It can go in before the PR opens through `/pr-review-remediate`, or ship as a follow-up. The four nits imply no action.
