# Pre-PR review: setlist-controller#58 Planning Center plan, the seventh run's #202 and #203

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `1d7b38f`, origin/main at review time)
**Reviewed at:** HEAD `9131dd7` (setlist-controller#203 The build-set skill drops the flags I named on the plan path when I switch to naming the songs), clean tree: 0 files with uncommitted changes, 0 untracked; 3 files total, +18 / -6 against the merge-base
**Reviewed against:** setlist-controller#202's body and acceptance criteria; setlist-controller#203's body, acceptance criteria and its "Decision: when the named flags stop crossing (2026-10-22)" section; the epic setlist-controller#58 body; `pre-pr-review-8.md` Approach decisions. Run with `--fresh`: the whole working surface against the merge-base, not a delta. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration tests | `pnpm test` | green: 57 files, 1181 passed, 4 skipped |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` | green: 44 passed |
| #202: the constant | read `src/set-builder/plan-reader.ts:63-66` | `USER_AGENT` at this review's HEAD is an email contact for this app, and the address is left out of this copy; the comment above it (`<app name> (<link or email>)`, the recorder imports it) still holds |
| #202: one source for the value | `git grep -n "USER_AGENT\|github.com/nick-vogel/setlist-controller"` outside `docs/reviews` | `scripts/record-pco-fixtures.mjs:18` imports the constant and `:46` sends it; `plan-reader.ts:141` sends it; the old URL is gone from code and tests |
| #202: the test can go red | tautology audit: the branch's `test/set-builder-plan.test.ts` copied into a scratch worktree at `1d7b38f`, then `pnpm exec vitest run test/set-builder-plan.test.ts -t "User-Agent"` | red at base: the code sent the GitHub URL and the test expected an email contact, at `:271`. Green at HEAD in the full suite |
| #202: no real API | read `test/planning-center-fake.ts` | the fake listens on `127.0.0.1`, port 0, and records the `user-agent` header the test reads |
| #203: The yes to replacing unchanged | `diff` of `## The yes to replacing` through `## The mapping`, base against HEAD | identical, as #203's first acceptance criterion requires |
| #203: `--list` takes no `--template` | `src/set-builder/main.ts` `LIST_OPTIONS` and its usage check | `--template` on `--list` is exit 2, so `SKILL.md:14`'s "without `--template`, which `--list` does not take" is right |
| #203: flag order | read Steps step 4 (`:28`) against step 1 (`:14`) and plan step 2 (`:56`) | one order, `--date`, `--replace`, `--library`, `--pads`, `--template`, `--output-root`, on both paths |
| #203: acceptance hand traces | finder agent plus my own read, on Saturday 2026-10-31 | the date trace gives `pnpm build-set --list --date 2026-11-08`, `pnpm build-set grace goodness rain --date 2026-11-08`, `Date: Sunday 2026-11-08, the date named`; the rebuild trace gives `pnpm build-set --list --date 2026-11-08 --replace` and only "Run it?"; the pad trace gives `--pad 3` and `3. Fall Like Rain (E), then a pad in E for ministry time`, and a question when Fall Like Rain is no longer last. All hold |
| #203: the end point | read `:16` against `:95` and the issue's Decision section | the block points to When the build ends and keeps its exit-1 carve-out without restating it, as Nick decided. Not raised |
| #203: worked examples | finder agent over the ten worked examples | none contradicts the crossing |
| Nothing reads the skill's text | `git grep -nl "build-set/SKILL" -- src test scripts` | no output; the full checks show only that nothing else moved |
| Lane review history | `.epic-loop/tickets/203/review-1.md` to `review-7.md`, `proposals.md` | findings 1 and 2 were raised as LOW in all seven lane passes; finding 1 is already proposal 1 of the #203 prep |

**Overall:** #202 is right and its test goes red against the old value. #203 meets every acceptance hand trace, leaves The yes to replacing word for word as it was, and holds the crossing's end point to Nick's recorded decision. Three LOW gaps remain in the new crossing block's prose, all at the edges of a rare route: a `--replace` named up front is re-asked after the switch (fails safe, already a filed proposal), a transition named as a plan step 2 fix is left out of the crossing list, and the switch question can name a plan transition Nick already overrode. None blocks the PR.

## Approach decisions
- **Carried forward from `pre-pr-review-8.md`:** the yes to replacing is one named section (#197), and fixes edit that section without restating it in a step; the consent carries across a date or output-root change (#190); a build ends when a build command runs, whatever its exit code; the User-Agent is one exported constant, now with an email contact (#202).
- **The replace rule is not edited in place again** (`pre-pr-review-8.md`). Any change to when a command has `--replace` goes to its own ticket with a hand-trace matrix. Finding 1 follows this: it is a follow-up ticket, not an in-place fix here.
- **The crossing's end point is Nick's decision** in the #203 body (2026-10-22): the named flags live exactly as long as the yes to replacing, ended where When the build ends (`SKILL.md:95`) ends it, with its carve-out. Findings 2 and 3 do not touch it.

## Confirmed Issues
### 1. A `--replace` Nick named up front on the plan path drops when he switches to naming the songs, so the replace question comes back — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:23`, against `:85`
- **Attribution:** pre-existing, exposed. At `1d7b38f`, plan step 3 already said the Steps listing has `--replace` "on the same terms" while Steps step 1 read "any ... `--replace` he names" as what he names now; the #203 prep filed that gap as proposal 1 (`.epic-loop/tickets/203/proposals.md`). `c322fc1` (setlist-controller#203 Carry the flags named on the plan path to the Steps) added `:23`, which states the drop outright: `git log --oneline -S"This carries no" 1d7b38f..HEAD` names only `c322fc1`.
- **Real-world trigger:** "Rebuild the set from the plan for November 8", then "yes, but swap song 2 for Goodness of God", then "build it from songs I name". LOW: it fails safe, since the cost is one repeated question and no wrong set.

**Evidence**
```
:23  - This carries no `--replace`: The yes to replacing says when a command has it.
:85  ... Whether he then changes the plan in Planning Center or names the songs by the Steps, the next listing and command have `--replace` on the same terms.
```
**Failure mode** — "Rebuild it" up front puts `--replace` on the plan listing, whose last line reads `already exists, and --replace replaces it.`, so no replace question is asked and The yes to replacing's consent bullet (`:94`) never fires. After the switch, `:23` lets the crossing carry every named flag but `--replace`, and defers to The yes to replacing, whose only other source is "when Nick names it" (`:98`). Read as the Steps request, the Steps listing is `pnpm build-set --list --date 2026-11-08`, its last line is `... The build stops on it unless --replace replaces it.`, and Nick is asked "Replace the set built before?" after he already said "rebuild it". Plan step 3 (`:85`) says the opposite, so the outcome depends on which passage the agent follows.
**Recommended fix** — none on this branch. File proposal 1 of the #203 prep as its own ticket, per the Approach decision on the replace rule. The ticket's direction: a `--replace` Nick named on the plan path crosses like the other named flags and for the same lifetime, stated in the From the plan path block (`:16-23`), with The yes to replacing (`:88-98`) unchanged.
**Remediation brief**
- **Design intent:** a flag Nick named for this build should not need saying twice. The From the plan path block carries named flags across the switch for as long as the yes to replacing would carry `--replace`. `--replace` itself has three sources (named, a yes to the replace question, a yes to step 6's command), and only the second is carried by The yes to replacing's consent.
- **Full surface:** `.claude/skills/build-set/SKILL.md:23` (the exclusion), `:14` ("`--replace` he names"), `:85` ("on the same terms"), `:98` ("No yes, no `--replace`", read only).
- **Must preserve:** The yes to replacing (`:88-98`) word for word; #197's traces for "build it from songs I name" after a yes to the replace question (`--replace` on the Steps listing, and only "Run it?"); the end point at `:16`.
- **Do not touch:** the end point sentence at `:16` (see Reviewed and Dismissed).
- **Proof:** a hand trace in the ticket's commit body: on Saturday 2026-10-31, "Rebuild the set from the plan for November 8", "yes, but swap song 2 for Goodness of God", "build it from songs I name", "Grace, Goodness of God, Fall Like Rain" gives `pnpm build-set --list --date 2026-11-08 --replace` and only "Run it?".
- **Escalation:** a change to when a command has `--replace`; its own ticket with a hand-trace matrix, by `pre-pr-review-8.md`.

### 2. A transition Nick names as the fix for a plan step 2 conflict is left out of the crossing list — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:20`, against `:63`
- **Attribution:** introduced by `c322fc1` (`git log --oneline -S"up front or at plan step 3" 1d7b38f..HEAD` names only it).
- **Real-world trigger:** a plan with both a `Prayer` item and an `overlap` note on one song change, Nick names the transition he wants (`--overlap 2`) as plan step 2's fix, then swaps a song and builds from songs he names. LOW: a rare plan state followed by a rare switch, and the Steps date line and song lines show "then a gap" where he expects the overlap.

**Evidence**
```
:20  - A transition he named on the plan path, up front or at plan step 3, crosses when its song change is still there ...
:63  - A song change the plan gives both a `Prayer` item and an `overlap` note, or an `overlap` note on the last song: Nick fixes the plan, or names the transition he wants, which becomes its flag ...
```
**Failure mode** — `:16` says "what he named on the plan path for this build crosses", but `:20` narrows transitions to two sources. A transition named as plan step 2's fix is neither, so a literal reading drops it, and the Steps command shows that song change as a gap.
**Recommended fix**
```diff
-   - A transition he named on the plan path, up front or at plan step 3, crosses when its song change is still there in the songs he names now: ...
+   - A transition he named on the plan path, up front, as a fix at plan step 2, or at plan step 3, crosses when its song change is still there in the songs he names now: ...
```
**Remediation brief**
- **Design intent:** every transition flag Nick himself named on the plan path for this build is one source, whatever step he named it at, and crosses on one test: its song change still there in the new order, at its new position, keeping its key.
- **Full surface:** `.claude/skills/build-set/SKILL.md:20` only. `:63` (the plan step 2 fix) and `:27` (Steps step 3's "each transition that crosses from The plan path by step 1") read as they are.
- **Must preserve:** the rest of `:20` word for word (the song-change test, the new position, the kept key, the question when the song change is gone); `:21` (a plan-given transition does not cross); `:19` (a `--gap` crosses as nothing, so a `--gap` named as plan step 2's fix still crosses as nothing).
- **Do not touch:** the end point at `:16`; The yes to replacing (`:88-98`).
- **Proof:** hand trace in the commit body: a plan whose song change 2 has both a `Prayer` item and an `overlap` note; Nick answers plan step 2's problem with "overlap after song 2"; then "swap song 3 for Goodness of God", "build it from songs I name", naming songs 1 and 2 in the same order first: the Steps command has `--overlap 2` and song 2 reads `then an overlap`.

### 3. The switch question can name a plan transition Nick already overrode as one that does not cross — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:134`
- **Attribution:** introduced by `c322fc1` (`git log --oneline -S"When the plan gave a transition" 1d7b38f..HEAD` names only it).
- **Real-world trigger:** the plan gives a `Prayer` pad after song 2, Nick says "overlap after song 2 instead" (`--overlap 2`) or re-keys it (`--pad 2=E`), then swaps a song. LOW: a confusing question, never a wrong set; the overlap he named crosses by `:20` all the same.

**Evidence**
```
:134 ... When the plan gave a transition, a pad from a `Prayer` item or an overlap from an `overlap` note, the question names it and says it does not cross to the Steps, so he can name it there;
```
**Failure mode** — the question tells Nick the plan's pad after song 2 does not cross and invites him to name it, though that pad is no longer in effect and his own `--overlap 2` (or `--pad 2=E`) does cross. He can answer by naming the plan's pad again, and then `:22` makes it win over the overlap he chose.
**Recommended fix**
```diff
- ... When the plan gave a transition, a pad from a `Prayer` item or an overlap from an `overlap` note, the question names it ...
+ ... When the plan gave a transition Nick did not change on the plan path, a pad from a `Prayer` item or an overlap from an `overlap` note, the question names it ...
```
**Remediation brief**
- **Design intent:** the question lists exactly the transitions in effect on the plan path that will not cross, so Nick can name them again. A plan transition Nick overrode, re-keyed or took back with `--gap` is no longer the plan's: what replaced it is his, and crosses (or, for `--gap`, crosses as nothing) by `:19-20`.
- **Full surface:** `.claude/skills/build-set/SKILL.md:134` only. `:21` ("A transition the plan gave ... is none Nick named, so it does not cross") stays, since a transition Nick changed is then one he named.
- **Must preserve:** the rest of `:134` word for word; #203's acceptance trace "a pad the plan's `Prayer` gave doesn't cross, and the question at `:123` says so" for a pad Nick did not change.
- **Do not touch:** `:21`, `:22`, the end point at `:16`.
- **Proof:** hand traces in the commit body: (a) the plan's `Prayer` gives a pad after song 2, Nick changes nothing, then swaps a song: the question names the pad and says it does not cross; (b) the same with `--overlap 2` named at plan step 3: the question names no plan transition, and with songs 1 and 2 unchanged the Steps command has `--overlap 2`.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- A transition named, then taken back on the plan path, crosses again (`:16`, "what he named ... crosses") — `:16` crosses what he named "for this build ... as if he had named it again"; a taken-back transition is no longer named for the build, and plan step 3 runs the listing again with the change, so the last listing is what he named. Not a defect.
- A gap Nick names in the Steps request does not beat a crossed transition, since a gap "adds nothing" (`:22`, `:27`) — `:8` defines a song change's transition as "a gap ..., an overlap, or a pad", so a named gap is "a transition on the same song change" and wins by `:22`, which drops the crossed flag. Not a defect.
- The crossing's end point (`:16`) — held to Nick's Decision in the #203 body, and consistent with When the build ends (`:95`) and its exit-1 carve-out. Do not touch.
- `SKILL.md:14`'s "The listing's flags go in step 4's order" binds every Steps listing, not only a crossing — step 4's order is the one order on both paths, and no listing breaks it. Not a defect.

## Minor / nits
- `SKILL.md:16` lists two routes and then "or by any other route", which makes the list illustrative; harmless, raised as LOW F7.6 in the lane.

## Test quality
Tests added or changed: 1 (`test/set-builder-plan.test.ts:262-272`, "names the app and a contact in the User-Agent of every request", its literal changed). Green against `$BASE`: 0, since it is red at `1d7b38f` on the old value. Tautology shapes found: 0; it asserts the header the fake recorded from each real request, not the constant itself. The skill change carries no test, as nothing pins the skill's text (proposal 2 of the #203 prep).

## Before opening the PR
- **CI readiness:** lint, typecheck, tests and build green at `9131dd7`; e2e green locally.
- **Commit hygiene:** this doc is the only new file. No scratch left in the tree.
- **Likely reviewer asks:** whether the email contact should be a role address rather than a personal one; why the skill's crossing has no automated test (proposal 2).

## Verdict
Ready to open the PR as-is, with follow-ups. Zero CRITICAL, HIGH or MEDIUM findings. Findings 2 and 3 are one-line prose fixes that can ride along or go to a follow-up ticket; finding 1 is a follow-up ticket by the replace-rule Approach decision (proposal 1 of the #203 prep), not an in-place fix.
