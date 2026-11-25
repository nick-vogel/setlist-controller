# Pre-PR review: setlist-controller#58 Planning Center plan, the main merge and its pins

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `6cf5454`, "Merge pull request #238 from nick-vogel/setlist-controller-101-count-off-into-section", origin/main at review time)
**Reviewed at:** HEAD `7c3fff9` (setlist-controller#58 Pin or exempt the build-set rule sentences main gained from #207 and #226), clean tree: 0 files with uncommitted changes, 0 untracked; 15 files total against the merge-base, +3083 / -305
**Delta under review:** since `e715a29` (setlist-controller#58 pre-PR review 12), the commit `pre-pr-review-12.md` reviewed (its HEAD `78cbc84` plus the doc). The delta is merge `624df99` (origin/main at `6cf5454`: #101 count-in, #207 and #226 build-set name-match fixes, #227 lateness default path; one conflict, in `.claude/skills/build-set/SKILL.md`) and `7c3fff9` (3 traces, 2 trace libraries, 4 new exempt entries and 1 rewritten). 42 files differ from `e715a29`, but everything except the conflict resolution and `7c3fff9` is main's own code, reviewed in its PRs (`docs/reviews/setlist-controller-101/`, `docs/reviews/setlist-controller-207/`), and is not in this PR's diff against `origin/main`.
**Reviewed against:** `.epic-loop/closeout.md` (Nick's accepted plan for the merge: resolve, pin or exempt the new rule sentences, run the full checks); the head of `.claude/skills/build-set/traces.md` (the trace, pin and sentence-check rules); `pre-pr-review-12.md`'s Approach decisions and findings 1 to 4; the repo entry's guardrails. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the conformance checklist is the five review rules every repo carries plus the Approach decisions.
**Date:** 2026-10-24
**Reviewer:** 1 code-review agent + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration tests | `pnpm test` | green: 67 files, 1538 passed, 4 skipped; no flake |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` | green: 50 passed |
| Conflict resolution | `git show --remerge-diff 624df99` | the resolution keeps main's #226 fix block for a short name that matches no folder or several, and the branch's exit 2 line with "and an exit 2 on `--replace` by The folder under The yes to replacing". Nothing from either side was dropped |
| Auto-merged SKILL.md hunks | `git diff e715a29 -- .claude/skills/build-set/SKILL.md`, read against The yes to replacing | #207's step 2 sentence ("matches that folder alone") and #226's "could not be read" fix line contradict no branch rule. #226's "the listing runs again (back to step 1)" sits next to #232's When the build ends with no sentence that joins them (finding 2) |
| Bare `--replace` in main's text | `grep` on main's added lines in SKILL.md, README.md, docs/install.md | none. Main's README and install edits cover count-in only |
| Exempt reasons from `7c3fff9` | read each one against SKILL.md; finder mutation of the quoted "could not be read" line | the quotes test goes red on a reworded quote (`SKILL.md:60 quotes ..., which no line in src/set-builder/ can print`). Every reason's conclusion (no listing, command or question depends on it) holds. Two reasons say more than they should (finding 3) |
| Trace Notes, by execution | finder and audit probes of the real CLI, with `--output-root` under `dist/` | with Lord I Need You in the library, `--list` prints `are` for Great Are You Lord, and `grace lord rain` exits 1 on `"lord" matches 2 song folders`. After the rename, both Goodness of God folders print by whole name, and the A-63 name exits 1 on `matches no song folder`, with A-68 among the folders listed. With Fall Like Rain moved out, `rain` exits 1 on `matches no song folder`. Every Note is true today |
| Pins shown red | the audit deleted one #226 pin from each new trace in a scratch worktree | each deletion goes red in `the pin check > covers every sentence of the four sections with a pin or an exempt entry`, naming the sentence and its `SKILL.md` line |
| Tautology audit | 12 mutations of the 3 new traces and 2 libraries in a scratch worktree at HEAD | the library setups, the `Command:` fields, the Date line and the Question are all unchecked: every mutation of them stays green (finding 1). The Last line mutations go red |
| Scratch worktrees | `git worktree list` | none left |
| Em-dashes | `grep` on added lines outside `docs/reviews/` | none |

**Overall:** the merge resolution is correct, the 5 new rule sentences are pinned by traces that read them, the 5 exempt entries are true in their conclusions, and every full check is green. There are 3 LOW findings: two trace libraries that nothing executes, a gap between #226's re-listing and #232's fix rule that fails safe, and two exempt reasons that say slightly more than is true. The branch is ready to open its PR, with the LOWs as follow-ups.

## Approach decisions
- **Carried forward from `pre-pr-review-12.md`:** the yes to replacing is one named section (#197); a build ends when a build command runs, whatever its exit code; each yes, named `--replace` and step 6 `--replace` is for one set folder (One set folder, #209); the replace rule changes only with traces (#210); the CLI holds the one-folder rule (#230, `bf615f1`, `eb829a3`); a fix after a build's exit 1 that answers that failure keeps the flags and `--replace` (#232), defined once in When the build ends; every sentence of the four sections is pinned or listed (#231).
- **Main's new rule sentences are pinned or exempted in the integration branch** (`7c3fff9`, Nick's accepted plan in `.epic-loop/closeout.md`): a sentence a command or question depends on gets a trace that reads it, and the rest go on the exempt list with a reason.
- **A hand trace proves by execution only its listings' exit codes and last lines, plus its pins** (the head of `traces.md`). Its Command, Date line, Question and Note are traced by hand. Finding 1 keeps this design. Changing it is a harness ticket, not a change in this PR.

## Confirmed Issues
### 1. Two new trace libraries, and the three new traces' commands, are executed by nothing — LOW
- **Location:** `test/build-set-skill.test.ts:315-325` (the two LIBRARIES entries); `.claude/skills/build-set/traces.md:4050`, `:4111`, `:4172` (the three 226 traces); the runner at `test/build-set-skill.test.ts:468-490`
- **Attribution:** introduced by `7c3fff9` (the entries and traces). The runner compares only exit and last line, which is pre-existing and untouched: `git show 6cf5454:test/build-set-skill.test.ts | grep -n 'lastLine: lines.at(-1)'` finds the same comparison.
- **Real-world trigger:** none for users. A later change to the short-name or folder-match code, such as `shortName` in `src/set-builder/song-list.ts` printing `lord` again beside Lord I Need You, would leave these three traces green while their Commands and Notes go stale. LOW, capped: it is a test that claims less than it looks like it does, and no user path reaches it. Upgrade to MEDIUM if Nick wants the traces to prove the #226 behaviour by execution. That decision is the follow-up ticket's.

**Evidence**
```ts
  // A song added after a listing whose short name, lord, its name holds too, so the build matches two folders on it.
  "the worked examples' seven folders, and Lord I Need You": async (workspace) => {
    await workedExamples(workspace);
    await mkdir(join(workspace.library, 'Lord I Need You-Matt Maher-E-72.00bpm'));
  },
```
```ts
      results.push({ command: listing.command, exit: result.code, lastLine: lines.at(-1)?.replace(root, outputRoot) });
```
**Failure mode:** all three traces list with `Set folders: 2026-10-18 Sunday`, so every listing's last line is the set-folder line, which is the same for any library. The audit applied `repro/review-13-mutation-decorative-libraries.diff` to a scratch worktree at HEAD. The diff removes the Lord I Need You folder, removes the rename and the B download, and changes the two-folders trace's Command from `grace are rain` to `grace lord rain`, the command that exits 1. `pnpm exec vitest run test/build-set-skill.test.ts` stayed green, 111 of 111. Changing the renamed trace's Command to the A-63 name, the put-back trace's to `grace lord fall`, and the renamed trace's Date line and Question also stayed green. Every Note is true today by direct CLI probes (the table above), so nothing is wrong now; nothing keeps it true.
**Recommended fix:** a follow-up ticket, not a change in this PR. The runner gains one check: for a trace whose `Command:` is a Steps command (no `--plan`), each short name on the Command is the first field of a stdout line printed by the trace's last listing. Then the two libraries matter: with `lord` on the two-folders Command, the check fails, because the listing printed `are`. A remediator kept to this PR may instead do nothing; the doc records the gap.
**Remediation brief**
- **Design intent:** a trace is a hand-traced conversation. The runner proves its listings by running them, and the pin check proves the sentences it reads still exist. The Command is the skill's output and is never run as a build (a build writes a set). A short name check reads the listing's own stdout, so it adds no build and no write.
- **Full surface:** `test/build-set-skill.test.ts:468-490` (the runner keeps each listing's `lines`; the check needs the last listing's lines and `trace.command`); `test/build-set-traces.ts` (`parseTraces`, where the `Command:` field is read); the 13 traces whose Command holds `--plan` and the 6 whose Command or Question is `none`, which the check skips.
- **Must preserve:** every one of the 83 traces stays green (`pnpm exec vitest run test/build-set-skill.test.ts`); `TRACE_COUNT` 83; the runner's two guards that no listing builds a set and none looks outside `dist/` (`:476-477`); the concurrent run with its 120 s timeout. A trace the new check fails is a trace error, fixed in the trace with its hand trace done again by the head of `traces.md`, never by loosening the check.
- **Do not touch:** the traces' `Set folders:` lines. They are what makes the last line the set-folder line, and they are correct for every trace.
- **Proof:** in a scratch worktree at HEAD, `pnpm install --frozen-lockfile --offline`, `git apply docs/reviews/setlist-controller-58/repro/review-13-mutation-decorative-libraries.diff`, then `pnpm exec vitest run test/build-set-skill.test.ts`. Green now; after the fix it goes red on `226-name-matches-two-folders`.

### 2. The #226 fixes say "the listing runs again" with no word on whether a re-listing before Nick replies keeps `--replace` — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:76-77` against `:130` (When the build ends)
- **Attribution:** introduced by merge `624df99`. Main's #226 (`cec2c1a`, `10126b3`) wrote the re-listing fix lines with no #232 rule beside them. This branch's #232 (`e0a644c`) wrote When the build ends with no #226 fix lines to read. Neither side has the defect alone.
- **Real-world trigger:** Nick says yes to replacing, the build exits 1 on `"lord" matches 2 song folders`, and Claude, reading "The listing runs again (back to step 1)" as its own next action, re-lists before Nick says anything. The fix line does not need Nick to act when the song is among the listed folders. LOW: the wrong reading fails safe. The re-listing runs without `--replace`, prints `already exists. The build stops on it unless --replace replaces it.`, and Claude asks "Replace the set built before?" a second time. Nothing is replaced without a yes.

**Evidence**
```
:76  When the song is among the folders the line lists, the listing runs again (back to step 1), and Nick's command takes the song's short name from it.
:77  The listing runs again (back to step 1), and the command takes the short name it prints for the folder Nick means, which names that folder alone.
:130 This build ends when a build command runs, or when Nick calls it off. ... A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
```
**Failure mode:** under :130 a fix keeps `--replace` only when Nick gives it in reply. A re-listing Claude runs before any reply is neither a reply nor "a build he asks for", so no sentence decides it. Under one reading the build has ended and the yes is spent, so Claude asks again, against "Nick says yes to replacing a set once per build" (:122). Under the other, the re-listing is part of the fix and keeps `--replace`. Step 6 ends at "Done when Nick has the output, and a fix for each problem" (:80), which favours waiting for Nick, but does not say so. All three 226 traces give Nick a reply before the re-listing ("List it again.", "I put Fall Like Rain's folder back."), so no trace decides it either. Proved by reading: `grep -n "back to step 1" .claude/skills/build-set/SKILL.md` gives only :76 and :77, and neither line names When the build ends.
**Recommended fix:** make the re-listing part of the fix, in When the build ends, so the rule stays defined once. Append to `:130`, after "...whatever fix they name.": `The listing a fix under Steps step 6 runs again (back to step 1) is part of that fix, whether Nick's reply comes before it or not.` Add a trace in which Claude re-lists straight after the exit 1 problems (Nick's turns: the songs, "yes"; the Note names the exit 1), and pin the new sentence there.
**Remediation brief**
- **Design intent:** a build's yes to replacing is spent when a build command runs, except for a fix that answers that build's exit 1 (#232). The #226 re-listing is the fix for a short name that no longer names one folder, so it belongs to the build that failed. The rule lives once, in When the build ends; the fix lines point at nothing new.
- **Full surface:** `.claude/skills/build-set/SKILL.md:130` (the new sentence); `.claude/skills/build-set/traces.md` (one new trace, `TRACE_COUNT` in `test/build-set-skill.test.ts:20` to 84); every trace that pins the `:130` sentences it extends, traced again by the head of `traces.md`: `grep -n "A fix answers that failure when Nick gives it" .claude/skills/build-set/traces.md`.
- **Must preserve:** "A request he makes once he has turned from that failure to something else, leaving it unanswered, is no fix" (:130); One set folder (:129); the three 226 traces as they are; the sentence check (`the pin check` in `test/build-set-skill.test.ts`) green with the new sentence pinned, not exempted, since the re-listing's command depends on it.
- **Do not touch:** `:76-77`. They are main's #226 text, pinned by the 226 traces, and checked by `test/build-set-skill-quotes.test.ts:376-384`.
- **Proof:** `pnpm exec vitest run test/build-set-skill.test.ts` green with the new trace and its pin; deleting the new sentence from SKILL.md goes red in the pin check, naming it.

### 3. Comment hygiene — LOW (aggregated)
- `.claude/skills/build-set/traces.md:4245` (the reason for "Each short name matches only its own folder, a whole folder name included: ...") — `...and test/build-set-skill-quotes.test.ts checks it against foldersNamed` → `...and test/build-set-skill-quotes.test.ts checks its match claim against foldersNamed`. The test (`build-set-skill-quotes.test.ts:386-396`) checks that `foldersNamed` gives the one folder, not the "prints its whole name" half.
- `.claude/skills/build-set/traces.md:4407` (the reason for "The reason after the colon says which: ...") — `fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it` → `says how to read the reason the problem line prints, and no listing, command or question depends on it`

## Needs Further Investigation
None.

## Reviewed and Dismissed
- The conflict resolution drops a rule — it keeps both sides' text whole (`git show --remerge-diff 624df99`).
- #226's "back to step 1" breaks "The listing of step 1 is the only command that runs before a yes" — the re-listing is a step 1 listing, which that sentence allows.
- A #226 re-listing composes a `--replace` for a folder no listing named — no reading does: a kept `--replace` is the one copied from the first listing's last line, by The folder.
- The "could not be read" exempt reason is false — the generic quote test goes red when the quote is reworded (finder mutation).
- The intro sentence "A short name that matches no song folder, or more than one, is fixed on the command, or in the library:" needs a pin — it introduces the two fix lines, both pinned by the 226 traces.
- Main's README and `docs/install.md` edits name a bare `--replace` — they cover count-in and the `count-in` cause only.
- `TRACE_COUNT` 83 is wrong — 3 traces were added to 80, and the count test is green.

## Minor / nits
- `226-name-matches-no-folder-renamed` gives `Question: Run it?` after a re-listing that still prints Goodness of God on two lines. It relies on Nick's earlier "The one in A." still answering the Ask item "a song whose title is on no listed line, or on more than one". That is the natural reading (the point was answered), but the trace's Note does not say it.
- `test/build-set-skill-quotes.test.ts:378`: the test name's "since a listed short name names its own folder alone" claims a reason the body does not check. Main's #226 text, outside this PR's diff; pre-existing, untouched.
- A `--replace` from Nick's own words ("rebuild it") meets "this listing runs without it" at step 1 (`SKILL.md:14`) on a #226 re-listing, so it costs one extra listing before the listing with `--replace`. The command and the question come out the same.

## Test quality
Tests added in the delta: 3 traces and 2 library setups (`7c3fff9`); the rest came from main and were audited in its PRs. Green against `$BASE`: not the right oracle here, since `$BASE` is main and lacks the branch's `--replace "<folder>"` listings; the audit used mutations at HEAD instead. Tautology shapes found: none of the four (no expectation from a production helper, no mock of the unit, no call-shaped assertion, no snapshot). Each trace's Last line mutations and pin deletions go red. The weakness is setup that no assertion reads, and fields no runner executes (finding 1).

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `7c3fff9`; e2e green locally.
- **Commit hygiene:** commit this doc and `repro/review-13-mutation-decorative-libraries.diff`. Nothing else is uncommitted.
- **Likely reviewer asks:** why the merge commit carries a conflict resolution in SKILL.md (the remerge diff shows it); whether the new traces prove #226 (finding 1: by hand only).

## Prior-review closure
`pre-pr-review-12.md` had 4 findings, all LOW, and no MEDIUM or higher. The delta touches none of their files (`git diff e715a29 -- src/set-builder test/build-set-traces.ts` is empty), so all 4 are untouched. Findings 1 and 2 are filed as #240 (`.epic-loop/closeout.md`, Nick's decision), and Nick chose not to file findings 3 and 4. Fully fixed: 0. Partially fixed: 0. Untouched: 4, none MEDIUM or higher.

## Verdict
Ready to open the PR, with follow-ups. No finding gates it: 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW. The merge round did what Nick's plan asked: the conflict is resolved with both sides whole, main's new sentences are pinned or listed, and the full checks are green. Finding 1 is a harness follow-up ticket, finding 2 is one sentence and one trace that fail safe if left, and finding 3 is two reason edits.
