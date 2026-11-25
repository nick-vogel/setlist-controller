# Pre-PR review: setlist-controller#58 Planning Center plan, review 7's remediation of the yes to replacing

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `d63b445`, Merge pull request #198 from nick-vogel/setlist-controller-58-planning-center-plan)
**Reviewed at:** HEAD `b8a75ec` (setlist-controller#58 pre-PR review 7 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 7 files total, +223 / -26 against the merge-base
**Delta under review:** since `5825f75` (setlist-controller#196 Fail the commit stage on a leftover merge conflict marker in any tracked file), the HEAD `pre-pr-review-7.md` reviewed. The delta is 2 files, +107 / -2: `a5d5ff3` (setlist-controller#58 pre-PR review 7 finding 1: Two sentences of The yes to replacing disagree with Steps step 6), which rewrites `.claude/skills/build-set/SKILL.md:84` and `:87`, and `b8a75ec`, the closure table appended to `pre-pr-review-7.md`. `origin/main` has moved to `99c593a` (PR #199, setlist-controller#114), which is not an ancestor of HEAD; the merge-base is unchanged.
**Reviewed against:** setlist-controller#197's body and acceptance criteria; `.epic-loop/tickets/197/assumptions.md` (item 3, when the build ends); `pre-pr-review-7.md` finding 1 (its two corrected sentences and their stated intent), its Approach decisions and its Remediation section with the hand traces at `a5d5ff3`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration tests | `pnpm test` | green: 54 files, 1138 passed, 4 skipped |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` | green: 44 passed |
| Review 7 finding 1, `:84` | read against Steps step 6 (`:19-37`) | no longer claims step 6 states a keep rule; cites step 6 only for a change to the command going back to step 4 (`:21`, `:25`, `:35`). Applied word for word |
| Review 7 finding 1, `:87` | read against `:21` | names step 6's `--replace` fix as a third source; agrees with `:21` and worked example 9's "the command gains `--replace`" |
| The two sentences against the rest of the rule | finder agent over `SKILL.md:1-90`, plus my own read | `:87` agrees with Steps 1, 4, 5, 6 and plan steps 1-4; `:86` still names two sources where `:87` now names three (finding 1) |
| What the narrowed `:84` changes | finder agent; `src/set-builder/build-set.ts:95-103` | a build with any problem writes nothing ("A build with a problem writes nothing."), so after a build's exit 1 the old set folder is still there. On the Steps path, a rebuild whose build exits 1 on a missing WAV now ends the build; after Nick adds the file, the next request lists again and asks "Replace the set built before?" once more. That matches #197's "This build ends when a build runs" and assumption item 3. See Reviewed and Dismissed |
| Nothing reads the skill's text | `git grep -nl "build-set/SKILL" -- src test scripts` | no output; the full checks show only that nothing else moved |
| Test audit | `tautology-audit.md` | not run: the delta adds no test |

**Overall:** Review 7's one finding is fixed as written, and every full check is green, end to end included. The two new sentences agree with Steps step 6. One sentence beside them, `:86`, still lists two sources of `--replace` where `:87` now lists three. That is wording only, gathered in one LOW hygiene finding, and it does not block the PR.

## Approach decisions
- **Carried forward from `pre-pr-review-7.md`:** the yes to replacing is one named section (#197), and fixes edit that section without restating it in a step; the consent carries across a date or output-root change (#190); a build ends when a build command runs, whatever its exit code (`.epic-loop/tickets/197/assumptions.md` item 3); the User-Agent is one exported constant; the conflict-marker test keeps the issue's pattern.
- **Review 7 finding 1, as remediated:** `:84` keeps `--replace` only for a fix that shows the command again, and `:87` names step 6's fix as the third source of `--replace`. This round keeps both sentences as they are.
- **The replace rule has been edited in place six times** (#179, #190, review 5 finding 1, #197, review 7 finding 1, and finding 1 here). Finding 1 touches only `:86`'s list of sources. Any change to when the build ends, or to which fixes keep `--replace`, goes to its own ticket with a hand-trace matrix, not to another in-place edit of `:84`.

## Confirmed Issues
### 1. Comment hygiene — LOW (aggregated)
- `.claude/skills/build-set/SKILL.md:86` — "comes from a command that has `--replace`, named by Nick or carried by this rule." → "comes from a command that has `--replace`: named by Nick, carried by this rule, or on the command Steps step 6 shows for a set folder that appeared after the listing." (`:87` now names three sources of `--replace` and `:86` names two. A command from step 6's fix reruns the listing by step 1's rule, `:14`, since `--replace` changed after step 1, so its `and --replace replaces it.` line can come from the third source. `:86`'s instruction, to show the line and ask only "Run it?", holds whatever the source, so nothing behaves differently.) Attribution: introduced by `a5d5ff3`, which added the third source at `:87`. The remediator left `:86` alone because it was outside review 7's finding.

## Needs Further Investigation
### A. The User-Agent's contact is a link to a private repo (carried from `pre-pr-review-7.md`, untouched)
Still open. `src/set-builder/plan-reader.ts:66` sends `setlist-controller (https://github.com/nick-vogel/setlist-controller)`, and the repo is private. Nick decides whether Planning Center should be able to reach him through the header. Outside this delta.

## Reviewed and Dismissed
- `:84`'s narrowing re-asks the replace question after a fix that is not a command (Steps path: rebuild with consent, the build exits 1 on `<folder>: <file> is missing from the song folder.`, Nick adds the file and asks again). This is by decision. #197 says "This build ends when a build runs", and `.epic-loop/tickets/197/assumptions.md` item 3 keeps `--replace` only for "a fix after a build's exit 1 that shows the same command". Review 7's remediation traced the same case ("A fix that is not a command (Nick adds a WAV) shows no command, and a later request is a new build with no consent"). The old set folder survives the failed build (`build-set.ts:95-103`), so the extra question is the only cost, and nothing is replaced without a yes. Do not touch: widening `:84` back to every fix would overturn assumption item 3.
- `:84` cites step 6 for "shows the command again". Step 6 sends a change to the command back to step 4 (`:21` "from step 4", `:25` "back to step 4", `:35`), and step 4 shows the command, so the citation is true for the fixes it names.
- `:87`'s clause "the only sources" is read as gaining `--replace` on Nick's yes, where step 6's command shows it before the yes. Step 6's command is only shown before the yes and is run after it, the same way `:82` shows the command with `--replace` and then runs it.

## Minor / nits
- `:84`, "keeps the `--replace` that command has": "that command" means the command shown again, the same command as the failed build's. "the `--replace` the build's command had" would read more plainly.
- `:84`, "A build Nick asks for after that": "after that" means after the build ends, but it follows a sentence about a fix. "after the build ends" would remove the misreading. The old text had the same structure.
- "build it again" after a fix in the library sits close to "rebuild the set I already built" (`:101`, which maps to `--replace`). The agent could read it either way: as a new build that re-asks, or as a rebuild that puts `--replace` on at once. Either way nothing is replaced that Nick did not say yes to in this conversation.
- `:87`'s step 6 source names only a yes. If Nick answers step 6's `--replace` command with a change ("yes, but pad after song 2"), step 5 composes the new command from the shown one, which has `--replace`. If the new command drops it, the build exits 1 on the folder again and step 6 offers the same fix again, a harmless loop. `:83`'s "with a change or without one" has no counterpart for step 6.
- On the plan path, a missing WAV usually shows up in the plan listing's own checks, so the listing after the fix carries `--replace` (`:83`, worked example 10's follow-on at `:303`). On the Steps path, the same problem shows up only at the build, so the question is asked again. That asymmetry comes from the listings, not from this delta.

## Test quality
The delta adds no tests, so the tautology audit did not run. The skill's text is pinned by no test (`git grep` above), so the hand reading in the table is its only check.

## Prior-review closure
Review 7 had one finding, LOW (comment hygiene, two entries). Both are fully fixed: `:84` and `:87` carry the corrected text word for word, and each now agrees with Steps step 6. Neither was partially fixed or left untouched. No prior finding was MEDIUM or higher, and none was escalated or deferred. Needs Further Investigation A was out of scope for the remediation and is carried above.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and build green at `b8a75ec`; e2e green.
- **Commit hygiene:** commit this doc. The branch is the three close-out tickets, review 7, its one remediation commit and its closure table.
- **Likely reviewer asks:** whether the User-Agent should carry a reachable contact (A).

## Verdict
**Ready to open the PR as-is.** No finding gates it. The single confirmed finding is a LOW wording fix to `:86`, and it can land now or later. The confirmed list shrank from two entries to one, and what is left is wording around the rule, not behaviour. That is the review reaching the end of what it can find, not the rule failing to settle. The replace rule has now been edited in place six times, so a further change to when the build ends should be its own ticket with a hand-trace matrix, not another edit of `:84`.
