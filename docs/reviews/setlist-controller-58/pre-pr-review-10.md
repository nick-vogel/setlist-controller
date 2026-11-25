# Pre-PR review: setlist-controller#58 Planning Center plan, the eighth run's #209 and #210

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `6f5280d`, "Merge pull request #211 from nick-vogel/setlist-controller-58-planning-center-plan", origin/main at review time)
**Reviewed at:** HEAD `0a227af` (setlist-controller#210 An edit to the build-set skill can break how it builds my set with every check green), clean tree: 0 files with uncommitted changes, 0 untracked; 4 files total, +3037 / -10 against the merge-base (`.claude/skills/build-set/SKILL.md` +11 / -10, `.claude/skills/build-set/traces.md` +2556 new, `test/build-set-skill.test.ts` +299 new, `test/build-set-traces.ts` +171 new)
**Reviewed against:** setlist-controller#209's body and acceptance criteria (the replace rule's two gaps and the hand-trace matrix); setlist-controller#210's body and acceptance criteria (pin the skill's hand traces); the epic setlist-controller#58 body; `pre-pr-review-9.md` Approach decisions; the #209 matrix in the body of `353aae9`; the #210 commit body of `2163089`; the lane records `.epic-loop/tickets/209/` and `.epic-loop/tickets/210/` (assumptions, and lane review findings by heading). Run with `--fresh`: the whole working surface against the merge-base, not a delta. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs; the conformance checklist is the five review rules every repo carries plus the repo entry's guardrails.
**Date:** 2026-10-23
**Reviewer:** 2 code-review agents + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration tests | `pnpm test` | green: 59 files, 1246 passed, 4 skipped (47 s) |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` | green: 44 passed |
| Flakes | three full `pnpm test` runs (one here, two in a finder's scratch worktree) | no flake reproduced; see Needs Further Investigation A |
| #209 gap 1 | hand trace of `209-row-1-steps-switch` against the current text | `pnpm build-set --list --date 2026-11-08 --replace`, `.../2026-11-08 Sunday already exists, and --replace replaces it.`, only "Run it?". Closed |
| #209 gap 2 | hand trace of `209-row-4-new-date-in-the-same-answer` | `pnpm build-set --list --date 2026-11-01`, `.../2026-11-01 Sunday already exists. The build stops on it unless --replace replaces it.`, "Replace the set built before?". Closed |
| #209 other cells | finder hand-traced `209-row-1-new-date-in-the-same-answer`, `209-row-2-new-date-later`, `209-row-2-new-date-and-replace-it`, `209-row-4-new-date-with-no-set-folder`, `209-row-5-new-date`, `209-row-1-fix-after-exit-1-with-a-new-date`, `209-row-1-new-request`, `209-row-5-new-request` | all follow from the text, except the two row 5 cells in finding 2 |
| #209 assumption (a): what a set folder is | read `src/set-builder/main.ts:349-357` and `build-set.ts:91` | the folder is the resolved `--output-root` (default `~/Music/Ableton/Sets`) joined with the date's set name; `--plan-id` and `--service-type` do not change it, so "date and output root" is the whole key |
| #209 AC 4: When the build ends word for word | diff of `:96` base against HEAD | unchanged |
| Unchanged text that still states the old rule | finder read of worked examples 9 and 10, the mapping, Ask instead of guess, Steps 4 to 6, plan steps | only `:90` and `:294` (finding 3); the rest is consistent |
| #210 pin check goes red | tautology audit: the branch's test, parser and `traces.md` copied into a scratch worktree at `6f5280d`, `pnpm exec vitest run test/build-set-skill.test.ts` | 1 failed (72 pins missing against the base `SKILL.md`), 62 passed |
| #210 AC 2 red demos | finder, in that scratch worktree | deleting the crossing `--replace` sentence (`:23`): 5 pins missing; deleting "It crosses until the build ends": 4 pins missing |
| #210 pin coverage of the #209 edit | scratch script: every sentence of `SKILL.md:14,16,17,23,54,85,90,92-99`, marked by how much of it lies inside a pin | every sentence that carries the per-folder rule (`:23`, `:94` sentence 2, `:95` sentences 3 to 8, `:96`) is wholly pinned. Unpinned: `:92` "The question is about the set folder that line names.", `:94` "So the next listing's last line reads ...", `:95` "Every `--replace` is for one set folder, whatever gave it: ...", `:99` "It keeps `--replace` only for the set folder it was given for, by One set folder.", `:17` "\"Replace it\" or \"rebuild it\" up front names `--replace`, as plan step 1 says.", `:90`. Each restates a pinned rule, the coverage-guard proposal's class; not raised |
| #210 CLI half can go red | `repro/review-10-mutation-no-token-file.diff` applied in a scratch worktree at `0a227af`, `pnpm exec vitest run test/build-set-skill.test.ts` | 31 failed, 32 passed: a real regression guard on the CLI, not a tautology. But `203-503-at-the-plan-listing` stays green (finding 4) |
| #210 nothing writes outside the worktree, no network | read `test/build-set-skill.test.ts:247-297`, `test/planning-center-fake.ts` | every listing asserts `--list` and an `--output-root` under `dist/` (`:285-286`); `PCO_API_BASE` is always set to the fake on `127.0.0.1` port 0; HOME and the token file are in the workspace |
| #210 concurrency | read the harness | `createWorkspace` uses `mkdtemp`; `removeWorkspaces` runs only in `afterAll`; vitest's default `maxConcurrency` (5) applies. Slowest trace 1.6 s against a 120 s timeout |
| Parser robustness | probe scripts against `test/build-set-traces.ts`; `repro/review-10-trace-parser-drops-values.test.ts` | finding 5 |
| Lane history | `.epic-loop/tickets/209/review-1.md` (10 LOW, F1.1 MEDIUM dismissed), `.epic-loop/tickets/210/review-1.md` to `review-6.md` (31 LOW at convergence), both `proposals.md` | finding 1 re-opens the lane's F1.1 on a new argument; finding 3 is the lane's F1.2, still open |

**Overall:** both #209 gaps are closed, every #209 matrix cell traced here follows from the text except two row 5 cells, and #210's pin check and CLI half both go red when they should. One MEDIUM remains in the replace rule: "replace it" is both a yes word at the replace question and a named `--replace`, and with a new date in the same answer the second reading wins, so a folder Nick was never asked about is replaced on a plain "Run it?", the gap 2 shape. The rest is LOW: two traces that pin a step 6 `--replace` Nick never said yes to, two unchanged sentences that still scope the yes to the build, and two test-harness weaknesses. Fix finding 1 before the PR opens; the LOWs can ride along or go to follow-ups.

## Approach decisions
- **Carried forward from `pre-pr-review-9.md`:** the yes to replacing is one named section (#197), and fixes edit that section without restating it in a step; a build ends when a build command runs, whatever its exit code; the crossing's end point is Nick's #203 Decision, ended where When the build ends ends it, with its carve-out.
- **Overturned by Nick for #209 (2026-10-23 close-out):** the consent no longer carries across a date or output-root change. A yes, a named `--replace` and a step 6 `--replace` are each for one set folder (One set folder, `SKILL.md:95`).
- **The replace rule changes only with traces (#210).** Any change to when a command has `--replace` adds or re-traces the traces in `.claude/skills/build-set/traces.md` that pin the changed sentences, in the same commit, and names the traces that moved in the commit body, by the head of `traces.md`. This replaces review 8's "own ticket with a hand-trace matrix": the matrix now lives in the pinned file. Finding 1's fix follows it: add a sentence after the pinned one, never edit the pinned sentence, and add one trace.
- **A yes word at a question is the yes, never a named `--replace` for a new folder** (review 10 finding 1, `88c2b15`): in an answer to the replace question or to Steps step 6's command, "replace it" or "rebuild it" is the yes for the folder that question was about, and a new date or output root in the same answer gets its own listing and its own replace question. A `--replace` named in an answer to "Run it?" still goes with the new folder (`209-row-2-new-date-and-replace-it`).
- **Pins are option 1 plus a narrow option 2** (#210 assumption): plain substring pins found exactly once, and each trace's listings run for exit code and last line. Command, Date line and Question are not asserted, and the coverage guard is a filed proposal, not this branch's work.

## Confirmed Issues
### 1. "Replace it" with a new date, said at the replace question, keeps `--replace` for a folder Nick was never asked about — MEDIUM
- **Location:** `.claude/skills/build-set/SKILL.md:95` (the sentence `A \`--replace\` Nick names in the same answer as the new date or output root ("make it November 1, and replace it") is named for the new folder, so it stays.`), against `:93` and `:113`
- **Attribution:** introduced. The `:95` sentence is new in `353aae9` (#209 assumption 3); `git show 6f5280d:.claude/skills/build-set/SKILL.md | grep -c "is named for the new folder"` prints 0. The lane review raised the route as F1.1 and dismissed it because `:95` makes the outcome unambiguous; it does, and the unambiguous outcome is the defect.
- **Real-world trigger:** Saturday 2026-10-31, the 2026-11-01 and 2026-11-08 set folders both exist. Nick says "Build the set from the plan for November 8", is asked "Replace the set built before?" about November 8, and answers "replace it, but make it November 1" (or the text's own example, "make it November 1, and replace it", or "rebuild it for November 1"). MEDIUM, capped by class (consent, and destroyed user work): upgrade to HIGH if Nick confirms that his "replace it" at that question means the set the question named, check by asking him which folder he means in that answer.

**Evidence**
```
:93  - **A yes with no change** ("yes", "yep", "replace it") adds `--replace` to the command: ...
:94  - **The consent.** A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
:95  ... A `--replace` Nick names in the same answer as the new date or output root ("make it November 1, and replace it") is named for the new folder, so it stays.
:113 | "replace it", "rebuild the set I already built" | `--replace` |
```
**Failure mode** — The same words are two things at once. By `:93` and `:94`, "replace it" at the replace question is the yes, consent for the November 8 folder its line named. By `:95` and the mapping `:113`, "replace it" in an answer that also names a date is a named `--replace`, which belongs to the new folder and stays. No sentence says which reading wins at the replace question, and `:95`'s sentence is the more specific one, so the agent takes it: the next listing is `pnpm build-set --plan --list --date 2026-11-01 --replace`, its last line is `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.` (the CLI prints exactly this, as `209-row-2-new-date-and-replace-it`'s CLI half proves on every `pnpm test`), the question is only "Run it?", and a yes replaces November 1's set, Live's Backup folder included (`src/set-builder/build-set.ts` `replaceFolder`). Nick was only asked about November 8. This is the gap 2 shape #209 exists to remove: a set for a date he never agreed to replace, replaced on a plain "Run it?", with the folder name in the last line as the only guard. Swapping one yes word for another flips the outcome: "yes, but make it November 1" gives a listing with no `--replace` and "Replace the set built before?" (`209-row-4-new-date-on-the-plan-path`), and "replace it, but make it November 1" gives "Run it?". The same holds at Steps step 6's command ("replace it, but for November 8"). No trace covers "replace it" with a date at a replace question: `209-row-2-new-date-and-replace-it` answers a "Run it?" whose `--replace` Nick named up front, where the reading is not in doubt.

**Recommended fix** — Leave the pinned `:95` sentence word for word and add one sentence right after it, so the named reading holds at a "Run it?" and the yes reading holds at a replace question:
```diff
-... is named for the new folder, so it stays. A change back to a folder that had a yes earlier in this build asks again.
+... is named for the new folder, so it stays. In an answer to the replace question or to the command Steps step 6 shows, "replace it" or "rebuild it" is the yes to that question or command, for the folder it was about, and names no `--replace` for a new date or output root in the same answer. A change back to a folder that had a yes earlier in this build asks again.
```
Then add one trace to `.claude/skills/build-set/traces.md` and raise `TRACE_COUNT` in `test/build-set-skill.test.ts` from 51 to 52:
~~~
## 209-row-4-replace-it-with-a-new-date

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: pre-PR review 10 finding 1
Nick says:
- Build the set from the plan for November 8.
- replace it, but make it November 1

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-01
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace replaces it.`

Command: `pnpm build-set --plan --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
<the new sentence, word for word>
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
```
~~~
**Remediation brief**
- **Design intent:** every `--replace` is for one set folder (the date plus the output root), and the only consent to replace a folder that already exists is Nick's yes to "Replace the set built before?" about that folder, or `--replace` he names for it where no question about another folder is open. The CLI's `--replace` names no folder, so the skill's text is the only guard; a "Run it?" over an "already exists, and --replace replaces it." line is not consent.
- **Full surface:** `.claude/skills/build-set/SKILL.md:95` (add the sentence); `.claude/skills/build-set/traces.md` (new trace, after `209-row-4-new-date-on-the-plan-path` at `:2025`); `test/build-set-skill.test.ts` `TRACE_COUNT` (`const TRACE_COUNT = 51;`). `:93` and `:113` stay as they are: the new sentence settles the overlap where both apply.
- **Must preserve:** `209-row-2-new-date-and-replace-it` (`traces.md:1649`): at a "Run it?" whose `--replace` was named up front, "make it November 1, and replace it" keeps `--replace` for November 1 with only "Run it?" (#209 assumption 3 at a "Run it?"). `example-9-yes`: "replace it" alone at the replace question is a yes with no change and runs at once. Every pin stays found exactly once: the new sentence must not contain an existing pin a second time, so run `pnpm exec vitest run test/build-set-skill.test.ts` after the edit.
- **Do not touch:** `:95`'s pinned sentence itself (edit it and its trace has to be re-traced); the default-date sentence ("A date that gives the folder the listing already looked in ...") and "A change back to a folder ... asks again", both dismissed below.
- **Proof:** hand trace of the new trace against the edited text, recorded in the commit body; then `pnpm exec vitest run test/build-set-skill.test.ts`, which must pass with 64 tests (the new trace's pins found once, its two listings giving the recorded last lines). Red first: with only the trace added and no sentence, the pin test fails on `<the new sentence>`.

### 2. Two row 5 traces pin a step 6 `--replace` that Nick never said yes to — LOW
- **Location:** `.claude/skills/build-set/traces.md:2296` (`209-row-5-steps-switch`) and `:2397` (`209-row-5-new-date-later`), against `SKILL.md:99` and `:96`
- **Attribution:** introduced in the traces (`2163089`, from the `353aae9` matrix's row 5 "The Steps switch" cell). The textual overlap they rest on, `:96` "keeps the `--replace` that command has" against `:99` "gains `--replace` only when Nick ... says yes to the command Steps step 6 shows with it", is pre-existing and untouched (`git show 6f5280d:.claude/skills/build-set/SKILL.md` has both sentences word for word).
- **Real-world trigger:** a set folder another build writes between the listing and the yes, then Nick answers step 6's `--replace` command with a change and no yes. Rare, and the folder is the one for the date Nick asked to build, so no plausible user path to a wrong folder: LOW.

**Evidence**
```
traces.md 209-row-5-steps-switch, Nick says:
- Build Sunday's set from the plan.
- yes                                   (the build exits 1 on 2026-11-01; step 6 shows pnpm build-set --plan --replace)
- swap song 2 for Goodness of God       (a change, no yes)
- build it from songs I name
Listing: pnpm build-set --list --replace ... Question: Run it?
SKILL.md:99 A command gains `--replace` only when Nick names it, says yes to the replace question, or says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing.
```
**Failure mode** — Matrix row 5 is "a yes to Steps step 6's command", but in both traces Nick's answer to that command is a song change with no yes. The traces record `--replace` on the next listing and only "Run it?", which only `:96`'s "keeps" reading gives; `:99` read literally, and `:97`'s rule that a change with no yes gives no consent, give a listing without `--replace` and "Replace the set built before?". So two pinned traces lock in the reading `:99` forbids, and row 5's Steps-switch and later-date columns are not tested as the matrix defines them. `209-row-5-stay-on-the-plan-path` ("yes, but a pad after song 3") does have a yes, and also assumes a yes with a change to the step 6 command counts, which `:94` says only for the replace question.

**Recommended fix** — Make the turns match the row: in both traces change `- swap song 2 for Goodness of God` to `- yes, but swap song 2 for Goodness of God`; the recorded listings, command and question then follow. And state the yes-with-a-change rule for step 6 once, in `:99`:
```diff
-... or says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing. It keeps ...
+... or says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing, with a change or without one. It keeps ...
```
**Remediation brief**
- **Design intent:** a `--replace` on step 6's command is a proposal until Nick says yes to it; once he does, with a change or without one, it is for the folder the problem named, by One set folder.
- **Full surface:** `traces.md:2296` and `:2397` (the third Nick says line of each); `SKILL.md:99`. The `:99` first sentence is pinned in `209-row-5` (`traces.md:2205`): update that pin to the new text in the same commit, and re-trace `209-row-5`, `209-row-5-stay-on-the-plan-path`, `209-row-5-steps-switch`, `209-row-5-new-date`, `209-row-5-new-date-later`, `209-row-5-new-date-with-no-set-folder`, `209-row-5-new-request`, and any other trace `grep -n "A command gains \`--replace\` only when" .claude/skills/build-set/traces.md` lists.
- **Must preserve:** `:96` word for word (#209 AC 4); every row 5 trace's recorded command and question.
- **Do not touch:** `:96`'s carve-out.
- **Proof:** `pnpm exec vitest run test/build-set-skill.test.ts` green after the pin update; red if the pin is not updated. The commit body names the re-traced traces.

### 3. The section lead and worked example 10 still give one yes per build — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:90` ("Nick says yes to replacing a set once per build.") and `:294` ("The yes is consent to `--replace` for this build, by The yes to replacing.")
- **Attribution:** pre-existing text, made false by this branch: `353aae9` makes the yes per folder, and `:95`'s "A change back to a folder that had a yes earlier in this build asks again" means one build can hold several yeses. Lane review F1.2, not fixed.
- **Real-world trigger:** an agent weighing the section's first sentence over One set folder after a yes for November 8 and a change to November 1. One set folder is specific and pinned, so the likely outcome is right: LOW.

**Evidence** — quoted in Location; neither sentence is inside any pin (pin-coverage script, 0%).
**Failure mode** — The lead and the example say the opposite of the per-folder rule in the direction of gap 2: a yes once per build reads as carrying to the next folder.
**Recommended fix**
```diff
-Nick says yes to replacing a set once per build.
+Nick says yes to replacing each set folder once per build.
-The yes is consent to `--replace` for this build, by The yes to replacing.
+The yes is consent to `--replace` for the 2026-11-01 Sunday folder, by The yes to replacing.
```
**Remediation brief**
- **Design intent:** as finding 1.
- **Full surface:** `SKILL.md:90`, `:294`. Confirm with `grep -n "for this build\|once per build" .claude/skills/build-set/SKILL.md` that no other sentence scopes the yes to the build; `:94`'s "Every listing and every command of this build after it carries `--replace` while it looks in that set folder" is already per folder and stays.
- **Must preserve:** worked example 10's commands and questions; no pin contains either sentence today, so no trace moves.
- **Do not touch:** `:96` When the build ends.
- **Proof:** `pnpm exec vitest run test/build-set-skill.test.ts` green; `grep -c "once per build" .claude/skills/build-set/SKILL.md` prints 0.

### 4. The 503 trace's CLI check passes when Planning Center is never reached — LOW
- **Location:** `test/build-set-skill.test.ts:290-293`, with `traces.md:832` (`203-503-at-the-plan-listing`)
- **Attribution:** introduced (`2163089`).
- **Real-world trigger:** none for a user; it is a test that cannot tell a 503 from any other exit-1 failure with empty stdout (a token-file refusal, an import crash, an auth mismatch with the fake). Test quality: LOW.

**Evidence**
```ts
const result = await run(args, workspace, fake.base, token).finally(fake.close);
const lines = result.stdout.split('\n').filter((line) => line !== '');
results.push({ command: listing.command, exit: result.code, lastLine: lines.at(-1)?.replace(workspace.outputRoot, outputRoot) });
```
**Failure mode** — The trace records `Exit: 1` and `Last line: none`; its Note says the listing prints `Planning Center answered 503 to /service_types.` on stderr, but stderr is collected and never asserted, and neither is `fake.requests`. Proved: with `repro/review-10-mutation-no-token-file.diff` applied (the CLI pointed at a token file that does not exist) in a scratch worktree at `0a227af`, `pnpm exec vitest run test/build-set-skill.test.ts -t '203-503'` passes, while 31 other traces go red.

**Recommended fix** — Add an optional `Error line:` field to a listing (stderr's last line, in backticks), parsed like `Last line:`, and assert it in the CLI half whenever the trace gives it; give `203-503-at-the-plan-listing`'s first listing `Error line: \`Planning Center answered 503 to /service_types.\``.
**Remediation brief**
- **Design intent:** a trace's CLI half proves the CLI prints what the skill quotes. An exit-1 listing with nothing on stdout is only proved by the line it prints on stderr.
- **Full surface:** `test/build-set-traces.ts` (`Listing` type, the listing `switch` cases at `:96-108`, the head comment's shape list); `test/build-set-skill.test.ts:288-296` (collect and compare stderr's last line, with the same output-root mapping as `lastLine`); `traces.md` head shape list (`:13-19`) and `203-503-at-the-plan-listing`; the parser unit test `reads a trace whole` (its expected object gains the field).
- **Must preserve:** every other trace's listings unchanged; the field is optional, so no other trace needs it.
- **Do not touch:** the Command, Date line and Question non-assertion (an Approach decision).
- **Proof:** red first: add the `Error line` to the trace and the assertion, apply `docs/reviews/setlist-controller-58/repro/review-10-mutation-no-token-file.diff` in a scratch worktree, and `pnpm exec vitest run test/build-set-skill.test.ts -t '203-503'` must fail; without the mutation it passes.

### 5. The trace parser drops text written on a `Nick says:` or `Pins:` line, and lets a listing field be given twice — LOW
- **Location:** `test/build-set-traces.ts:87-89` (`Nick says`), `:90-95` (`Listing`), `:109-114` (`Song lines`, `Pins`), `:96-108` (`Plan`, `Set folders`, `Exit`, `Last line`)
- **Attribution:** introduced (`2163089`).
- **Real-world trigger:** a trace author writing `Pins: <sentence>` or `Nick says: <turn>` on one line, or pasting an `Exit:` twice. The pin is then never checked, and the test stays green. Test quality: LOW.

**Evidence**
```ts
case 'Nick says':
  while (lines[0]?.startsWith('- ')) nickSays.push((lines.shift() ?? '').slice(2));
  break;
...
case 'Exit':
  if (!/^\d+$/.test(value)) fail(`Exit is no exit code: "${value}"`);
  listing(label).exit = Number(value);
```
**Failure mode** — These cases never read the line's own value, and the listing fields have no "given twice" check (the top-level fields do, `:123`). `Nick says: Grace, Lord, Rain.` then `- yes` parses as one turn, `yes`; `Pins: Run it only on his yes.` above a fence parses with that pin gone; a second `Exit: 1` overwrites `Exit: 0`. Proved by `docs/reviews/setlist-controller-58/repro/review-10-trace-parser-drops-values.test.ts`: copied into `test/`, its three "stops on" tests fail at `0a227af` and its control passes.

**Recommended fix**
```diff
       case 'Nick says':
+        if (value !== '') fail(`${label} takes no value on its line`);
         while (lines[0]?.startsWith('- ')) nickSays.push((lines.shift() ?? '').slice(2));
```
and the same guard in `Listing`, `Song lines` and `Pins`; and in `Plan`, `Set folders`, `Exit` and `Last line`, fail with `Listing ${listings.length}'s ${label} is given twice` when the open listing already has that field.
**Remediation brief**
- **Design intent:** the parser's contract (head comment of `build-set-traces.ts`) is that any line that does not fit the shape is an error, so a trace cannot lose a field without the test saying so.
- **Full surface:** `test/build-set-traces.ts:87-114`; new rows in the `stops on` tests of `test/build-set-skill.test.ts` (`it.each` at about `:96`), one per guard.
- **Must preserve:** all 51 traces parse unchanged (none writes a value on those lines or repeats a listing field: `pnpm exec vitest run test/build-set-skill.test.ts` stays green); `Last line: none` still parses as no last line.
- **Do not touch:** the exactly-once rule in `missingPins`.
- **Proof:** `cp docs/reviews/setlist-controller-58/repro/review-10-trace-parser-drops-values.test.ts test/ && pnpm exec vitest run test/review-10-trace-parser-drops-values.test.ts` fails 3 of 4 now and passes after the fix; then move its cases into `test/build-set-skill.test.ts` and delete the copy.

### 6. Comment hygiene — LOW (aggregated)
- `.claude/skills/build-set/traces.md:13-19` — "The shape of a trace" lists `Said on:`, `Library:`, `Listing:` with its fields, `Command:`, `Date line:`, `Question:`, `Song lines:` and `Note:` → add `Source:` (where the trace came from), `Nick says:` (then one `- ` line per turn), `Pins:` (a fenced block, one sentence or clause per line) and `CLI: not run, <why>` (in place of running the listings), which the parser requires or accepts.

## Needs Further Investigation
### A. The concurrent CLI half may be the source of the #210 lane's two unnamed one-test flakes — confirm by the test name of the next failing run
`.epic-loop/flaky-1.md` and `flaky-2.md` record one-test failures (1 failed, 1245 passed) at `77cd1ae` and `ce6af56`, names not captured, green on re-runs; `flaky-2.md` names this suite as a candidate. Three full runs in this review were green, and the slowest trace takes 1.6 s against a 120 s timeout. A failing run's output naming a `the traces' listings, run` case confirms it; one naming another file kills it. Already posted to #205.

## Reviewed and Dismissed
- The CLI-half tests pass against the base `SKILL.md`, so they look tautological — they check the CLI, which this branch does not change (`git diff --stat 6f5280d -- src` is empty), and 31 of them go red when the CLI cannot read its token file. A regression guard, by design (#210 option 2).
- A trace listing writes outside the worktree or reaches the network — every listing asserts `--list` and an output root under `dist/`; `PCO_API_BASE` is always the fake on `127.0.0.1`; HOME is the workspace.
- Concurrent traces race on the harness — `mkdtemp` names, `afterAll` cleanup, one fake per listing, closed in `finally`.
- "A date that gives the folder the listing already looked in ... points at no other folder" (`:95`) lets `--replace` survive a date change — it covers only the default date said by name, the same folder by the CLI's own key (`main.ts:349-357`). Correct, keep.
- "A change back to a folder that had a yes earlier in this build asks again" (`:95`) disagrees with `:94`'s "while it looks in that set folder" — both outcomes stay on a folder that had consent; the trace (`209-row-4-back-to-november-8`) follows `:95`, which fails safe (#209 assumption 2). Keep.
- `lastLine.replace(workspace.outputRoot, outputRoot)` maps wrongly for a stand-in output root — checked for both the default root and `/Volumes/Stage/Sets`; `203-folders-and-template` passes with the stand-in.
- `TRACE_COUNT = 51` kept by hand is a tautology — it goes red when a heading is mistyped and a section is merged into the one above.

## Minor / nits
- `test/build-set-traces.ts:149`: `each.command?.includes('--plan')` also matches `--plan-id`; a Steps listing with `--plan-id` would fail loudly with the Plan-iff-`--plan` error. Split on spaces.
- `test/build-set-traces.ts:166`: `skill.split(pin).length - 1` misses overlapping copies (`'yes, yes'` in `'yes, yes, yes'` counts once), and a blank pin line counts as thousands of copies with a confusing message. No current pin is affected.
- `test/build-set-skill.test.ts:221-231`: stand-ins and the `--date`, `--library` and `--output-root` checks see only `--flag value`, not `--flag=value`; no trace uses that form, and the output-root assertion still holds.
- `test/build-set-skill.test.ts:236-245`: `run` has no timeout of its own, so a hung CLI outlives the vitest timeout and its fake stays open. Not seen.
- Many of the parser's error paths have no test ("has no fenced block after it", "is no exit code", "Said on is no weekday and date", "comes before any Listing", the CLI half's "no stand-in" and "no fixture gives the plan" throws).
- A `--replace` given with no `--date` takes the CLI's default date when the command runs, so a yes given after Sunday midnight to a listing run on Sunday would replace the next Sunday's folder. Pre-existing, needs a session across midnight on a Sunday.
- Steps step 1 reruns the listing when "the date ... changes"; `209-row-2-no-date-then-november-1` does not rerun for the default date said by name. Same output either way.
- A `--replace` named with a date that becomes a date question ("rebuild it for November 7") has no stated folder until the answer; both readings fail safe.

## Test quality
Tests added: 63 in `test/build-set-skill.test.ts` (9 parser unit tests, 2 whole-file checks, 1 pin check, 51 trace runs). Green against `$BASE` with the branch's `traces.md`: 62. The pin check is red at base (72 pins missing), as it must be. The 51 trace runs and the whole-file checks are green at base by design, since they guard the unchanged CLI and the file's own shape; the token-file mutation turns 31 of them red. Tautology shapes found: 0 (expectations come from `traces.md`, nothing under test is mocked, no call-shaped assertions, no snapshots). Weaknesses: finding 4 (one trace's exit-1 run proves nothing about why it exits 1) and finding 5 (the parser drops some malformed input silently).

## Before opening the PR
- **CI readiness:** lint, typecheck, tests and build green at `0a227af`; e2e green locally.
- **Commit hygiene:** this doc and the two `repro/review-10-*` files are the only new files. No scratch left in the tree.
- **Likely reviewer asks:** why "replace it" plus a date keeps `--replace` (finding 1); why the traces pin sentences rather than check meaning (the model-run and coverage-guard proposals); the 2556-line `traces.md` and the 64-pin churn a wording edit can cause (lane F6.4).

## Verdict
Ready with one fix. Gate: finding 1 (MEDIUM, consent) is fixed before the PR opens, by one added sentence and one trace, through `/pr-review-remediate`. Findings 2 to 6 are LOW and can ride along in the same pass or go to follow-ups. #209's two gaps are closed, and every #209 matrix cell traced here holds except the two row 5 cells of finding 2; #210's checks go red when they should.

## Remediation — 2026-10-23
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `88c2b15` setlist-controller#58 pre-PR review 10 finding 1: "replace it" with a new date at the replace question keeps --replace for a folder Nick was never asked about | red→green: `pnpm exec vitest run test/build-set-skill.test.ts` (trace and `TRACE_COUNT` 52 only: 1 failed on the new sentence's pin, 63 passed; with the sentence: 64 passed). Hand trace of `209-row-4-replace-it-with-a-new-date` in the commit body; no existing trace's outcome moved | 0 | proved by execution (MEDIUM, executed red→green, preserve suite green; no verify agent) |
| 2 (LOW) | — deferred | — | — | LOW tail, left for Nick (eng-pipeline#34) |
| 3 (LOW) | — deferred | — | — | LOW tail, left for Nick |
| 4 (LOW) | — deferred | — | — | LOW tail, left for Nick |
| 5 (LOW) | — deferred | — | — | LOW tail, left for Nick |
| 6 (LOW, comment hygiene) | — deferred | — | — | LOW tail, left for Nick |

After the round at `88c2b15`: `pnpm lint`, `pnpm typecheck` and `pnpm build` green; `pnpm test` green, 59 files, 1247 passed, 4 skipped. `pnpm test:e2e` not run: the round changes no file under `src/`.

### Known regressions, deferred
- None.

### Rework briefs
- None: no verify pass ran, so no rework.
