# Pre-PR review: setlist-controller#58 Planning Center plan, fifth run, stage 2 round 2 (review 5 remediation)

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `08583a0`, Merge pull request #191)
**Reviewed at:** HEAD `f11b2f0` (setlist-controller#58 pre-PR review 5 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 3 files total, +148 / -6 against the merge-base
**Delta under review:** since `d4ce7a6` (setlist-controller#188 The build-set skill gives no fix for "Planning Center answered <status> to <path>." ...), the HEAD `pre-pr-review-5.md` reviewed. The delta is `5095ec0` (setlist-controller#58 pre-PR review 5 finding 1: ...), two sentences of `.claude/skills/build-set/SKILL.md` (`:50` and `:80`, +2 / -2), plus the review 5 doc and its closure table (`c14ad77`, `f11b2f0`).
**Reviewed against:** the epic body of setlist-controller#58 and #190's intent (a yes to the replace question is consent to `--replace` for this build, and the question never comes back); `pre-pr-review-5.md` in full, its finding 1 brief and design intent, its closure table and its Approach decisions. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green |
| Unit and integration tests | `pnpm test` | green: 52 files, 1093 passed, 4 skipped |
| Typecheck, build, e2e | not run | the delta is Markdown that no build input, type or test reads; all five full checks were green at `5095ec0` per review 5's closure table |
| Merge with the moved base | `git merge-tree --write-tree HEAD origin/main` | origin/main is `57a7eaf` (Merge pull request #192); the merge is clean |
| No conflict markers | `git grep -nE '^(<<<<<<<\|>>>>>>>\|\|\|\|\|\|\|\|=======)( \|$)' -- . ':!docs/reviews'` | no output |
| Review 5 finding 1, Steps route | hand trace of `SKILL.md:50`, `:14`, `:18`, `:19`: plan rebuild, folder exists, "yes, but swap song 2 for Goodness of God", then "build it from songs I name" | `pnpm build-set --list --replace` runs (`--list` takes `--replace`, `src/set-builder/main.ts:122`), its last line reads `... already exists, and --replace replaces it.`, and only "Run it?" is asked. Fixed |
| Review 5 finding 1, plan-edit route | hand trace of `:50`, `:47`, `:51`: same yes, then "I'll change it in Planning Center" | the relisting carries `--replace` (`PLAN_LIST_OPTIONS` takes it, `main.ts:126`); on exit 0, only "Run it?". Fixed |
| Review 5's surface beyond the brief, `:80` | hand trace: "yes, but pad after song 2", then a song swap at "Run it?" | the command has `--replace`, so `:80` carries it; only "Run it?". Fixed |
| A carried `--replace` with no set folder | `replaceFolder` in `src/set-builder/build-set.ts:213-226`; test `builds when the build replaces and no folder exists yet` (`test/set-builder.test.ts:1297`) | harmless: the build replaces only `if (existsSync(folder))`, and otherwise builds as usual |
| The same default date on both routes | `defaultSetDate` at `main.ts:157`, `:185`, `:220` | the plan listing and the Steps listing with no `--date` look for the same set folder |
| The relisting after an exit-1 plan listing | hand trace of `:50`, `:52`, `:47`; `planList` in `main.ts:173-200` (the set-folder line prints with a listing that has problems, exit 1) | consent is not stated past the first listing: finding 1 |
| Must preserve of review 5 finding 1 | re-read at `f11b2f0` | a song change is still a question under Ask instead of guess; a plain yes still runs at once (`:50`, `:14` exemption); a "no" with no change builds nothing; the transition sentence on `:50` and step 3's rerun with `--replace` are untouched |
| Test audit | — | branch adds no tests |

**Overall:** Review 5's finding 1 holds on every route its brief and its closure table named, lint and the suite are green, and the branch still merges cleanly with origin/main. One LOW gap remains in the same rule: the new sentences carry the yes to "the listing" that follows the answer, and a plan listing that exits 1 on the new song is followed by a second listing that nothing carries `--replace` onto. Review 5's comment hygiene stays open, deferred by Nick's choice. Nothing blocks the PR.

## Approach decisions
- **Carried forward from `pre-pr-review-5.md`:** the plan-path fixes (#160, #162, #171), the existing set folder line (#169, #179), the `--plan --list` flag set, the scrubber's sweep, the replace consent (#190), the status line's fix (#188), and the carry across a song change on the plan path, stated at `SKILL.md:50` and `:80` with Ask instead of guess (`:117`) unchanged.
- **The replace consent lasts for the build, not for one listing (finding 1):** the yes at plan step 2 is consent for every listing and command of this build that follows the answer, as review 5 finding 1's design intent already said ("every listing and command after it carries `--replace`"). The fix widens the two new sentences' "the listing and the command" to "every listing and command"; it adds no new rule elsewhere, and `:117` stays unchanged.
- **No further in-place rewrite of the replace question after finding 1 (escalation):** the rule has now been patched in place four times (#179, #190, review 5 finding 1, and this finding). Any further gap in it becomes a split ticket that states the consent once and adds a plan-path worked example, not a fifth patch.

## Confirmed Issues
### 1. After a plan listing that exits 1 on the new song, the next listing loses the yes to replacing, so the replace question comes back — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:50` (the song-change sentence), and the same phrase at `:80`
- **Attribution:** introduced, by the remediation `5095ec0` (setlist-controller#58 pre-PR review 5 finding 1: ...), which wrote the carry as "the listing and the command that follow his answer" where review 5's design intent said "every listing and command after it". `git log -S'that follow his answer' 08583a0..HEAD -- .claude/skills/build-set/SKILL.md` names only `5095ec0`; `git show 08583a0:.claude/skills/build-set/SKILL.md` has no carry at all.
- **Real-world trigger:** Nick rebuilds Sunday's set from the plan, answers the replace question "yes, but swap song 2 for Goodness of God", then "I'll change it in Planning Center". The new song is planned in a key the library lacks, so the relisting exits 1 with `"Goodness of God" is planned in G, and <library> has it only in A.` He fixes the key in Planning Center and asks for the listing again. User path: one extra "Replace the set built before?" after he already said yes. No work is lost and nothing wrong is built, so LOW.

**Evidence** — `SKILL.md:50`, the new sentence:

```
A change to the songs themselves stays a question under Ask instead of guess, and the yes to replacing stands: `--replace` goes on the listing and the command that follow his answer, whether he changes the plan in Planning Center or names the songs by the Steps.
```

`SKILL.md:52`, the exit-1 branch: "Show the lines with a problem, and after each, what fixes it. Show no build command". `SKILL.md:47`, plan step 1, puts `--replace` on a listing only when Nick names it: "Add any ... `--replace` ... Nick named", and "Nick naming `--replace`, "replace it" or "rebuild it" up front puts `--replace` on the listing".

**Failure mode** — the first relisting after his answer carries `--replace`, by `:50`, and exits 1. Its set-folder line still prints (`main.ts:173-200`: "it prints with a listing that has problems too"), but plan step 2's exit-1 branch asks nothing. When Nick fixes the plan and asks again, plan step 1 composes a fresh listing from the flags Nick named, and `--replace` was never named, only consented to. The listing ends `<folder> already exists. The build stops on it unless --replace replaces it.`, and `:50` asks the replace question a second time. `:80` has the same phrase, "it goes on the listing and the command that follow his answer", for a swap made at "Run it?".

**Recommended fix** — in `SKILL.md:50`, replace

```
`--replace` goes on the listing and the command that follow his answer,
```

with

```
`--replace` goes on every listing and command of this build that follow his answer,
```

and in `SKILL.md:80`, replace

```
it goes on the listing and the command that follow his answer,
```

with

```
it goes on every listing and command of this build that follow his answer,
```

**Remediation brief**
- **Design intent:** a listing's last line answers for one date and output root, and decides whether the skill asks to replace (`already exists. The build stops ...`) or only whether to run (`already exists, and --replace replaces it.`). A yes to the replace question is consent to `--replace` for this build, so every listing and command after it carries `--replace`, including a listing that exits 1 and the listing after its fix, and the next question is only "Run it?". "This build" ends when a build runs or Nick calls it off.
- **Full surface:** `.claude/skills/build-set/SKILL.md:50` (the song-change sentence only) and `:80` (its second sentence only). `rg -n 'that follow his answer' .claude/skills/build-set/SKILL.md` finds exactly these two.
- **Must preserve:** a song change on the plan path is still a question under Ask instead of guess, never a flag; a plain yes still runs at once with no listing (`:50`, and the exemption at `:14`); a "no" with no change still builds nothing; `:50`'s transition sentence and step 3's first sentence ("with `--replace` when the command has it") stay as they are; `:80` still adds `--replace` only when the command has it, so a command with no `--replace` gains none; both routes, plan edit and the Steps, stay named.
- **Do not touch:** Ask instead of guess at `:117` (Reviewed and Dismissed, the carry is stated where the yes is given); the carry across a date or output-root change (`:18`, `:22`, a recorded decision); review 5's comment hygiene entries, which are finding 2's and stay deferred.
- **Proof:** hand trace, from the repo root, of `.claude/skills/build-set/SKILL.md`, the trigger above: after the fix, the listing after the key fix carries `--replace` by `:50`'s "every listing ... of this build", its last line reads `... already exists, and --replace replaces it.`, and `:51` asks only "Run it?". Then `pnpm lint` and `pnpm test` stay green.
- **Escalation:** this is the fourth in-place fix to the replace question (#179, #190, review 5 finding 1, this one). Make only this two-phrase widening. If any further gap turns up in the rule, stop and recommend a split ticket that states the consent once and adds a plan-path worked example beside worked example 9.

### 2. Comment hygiene — LOW (aggregated, carried from review 5 finding 2, deferred by Nick's scope choice)
- `.claude/skills/build-set/SKILL.md:18` — "step 1 runs the listing again with it, its last line reads `already exists, and --replace replaces it.`, and the next bullet asks only whether to run it." → "step 1 runs the listing again with it; when the set folder for its date exists, its last line reads `already exists, and --replace replaces it.` and the next bullet asks only whether to run it, and otherwise step 4 asks as usual."
- `.claude/skills/build-set/SKILL.md:50` — "and `--replace` stays on the listing and the command alike" → "and `--replace` goes on the rerun listing and stays on the command"
- `.claude/skills/build-set/SKILL.md:70` — "cannot see that service type or plan in Services" → "cannot see Services, or that service type or plan in it"
- `.claude/skills/build-set/SKILL.md:72` — "shared with any other app the same account's token drives" → "shared with every other app that acts as the same Planning Center user"
- `.claude/skills/build-set/SKILL.md:75` — "a page of a list named its next page on another host than `<base>`" → "a page of a list named a next page outside `<base>`, on another host or another path"

## Needs Further Investigation
None.

## Reviewed and Dismissed
- Ask instead of guess (`:117`) does not mention the carry — a recorded decision: review 5's Approach decisions state the carry where the yes is given, at `:50` and `:80`, and leave `:117` unchanged.
- `:80`'s "when the command has it" could carry a `--replace` from Steps step 6's fix (`:25`) that Nick has not yet said yes to — reachable only when a set folder appears between the listing and the build, and the command shown still has `--replace` and still waits for "Run it?".
- The carry across a Sunday-to-Monday midnight moves the default date a week — theoretical; a carried `--replace` on a folder that does not exist builds as usual (`build-set.ts:213-226`), and the date line shows the new date before "Run it?".
- `--replace` on a build whose set folder does not exist — harmless, proved by `test/set-builder.test.ts:1297`.

## Minor / nits
- Moving from the plan path to the Steps names only `--replace` as crossing over; a `--date`, `--output-root`, `--library`, `--pads` or transition Nick named on the plan path crosses only by Steps step 1's "he names". Pre-existing, from the route `:117` already had at the merge-base; the date line and the set-folder line show the result before "Run it?".
- An answer to the song question of "never mind, keep the plan as it is" falls under neither route `:50` names. Either reading is harmless: no replace question returns and nothing runs without a yes.
- An answer with a transition change and a song change at once ("yes, but swap song 2 and pad after song 1") meets step 3, which shows a command, and Ask instead of guess, which shows none until answered. Pre-existing.
- On the plan path a change at "Run it?" reaches plan step 3 only by implication: plan step 4 (`:81`) defers to Steps step 5, which says "go back to step 4". Pre-existing.
- No worked example covers the plan path's replace question; worked example 9 covers the Steps only.

## Test quality
Branch adds no tests. Nothing pins the skill's text, as #188, #189 and #190 each note.

## Prior-review closure
Review 5 had two findings, both LOW. Finding 1 is fixed on every route its brief and closure table traced (the Steps route, the plan-edit route, and the `:80` case); the half of its design intent that says "every listing" is not met across an exit-1 listing, which is finding 1 here. Finding 2 (comment hygiene) is untouched, deferred by Nick's scope choice in the closure table, and is carried as finding 2 here. No prior finding was MEDIUM or higher.

## Before opening the PR
- **CI readiness:** lint and `pnpm test` green at `f11b2f0`; typecheck and build are untouched by a Markdown-only delta.
- **Commit hygiene:** commit this doc. Merge `origin/main` (`57a7eaf`) before the PR; it merges clean.
- **Likely reviewer asks:** none beyond finding 1.

## Verdict
**Ready to open the PR with follow-ups.** No finding gates it. Finding 1 (LOW) is a two-phrase widening that finishes review 5's intent; it can land now or as a follow-up. The confirmed count fell from two to two LOWs, one of them the carried, deferred hygiene batch, and the round's new candidates were mostly pre-existing nits: the rule is converging. The replace question has now been patched in place four times, so any gap past finding 1 belongs in a split ticket, not a fifth patch.
