# Pre-PR review: setlist-controller#58 Planning Center plan, the three close-out tickets (#195, #196, #197)

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `d63b445`, Merge pull request #198 from nick-vogel/setlist-controller-58-planning-center-plan)
**Reviewed at:** HEAD `5825f75` (setlist-controller#196 Fail the commit stage on a leftover merge conflict marker in any tracked file), clean tree: 0 files with uncommitted changes, 0 untracked; 6 files total, +118 / -26 against the merge-base
**Delta under review:** a fresh full review (`--fresh`) of everything since the merge-base. The epic's earlier work landed on `main` in PR #198, so the surface is the three tickets the fifth run's close-out filed: `8521a2f` / `d0dd0a5` (#195, the User-Agent), `e92645b` / `9fdf33a` (#197, the yes to replacing stated once), `523ae23` / `5825f75` (#196, the conflict-marker test), and the merge `1e41516`.
**Reviewed against:** the bodies of setlist-controller#195, #196 and #197 and their acceptance criteria; the epic body of #58; `.epic-loop/tickets/195`, `196` and `197` `assumptions.md`; `pre-pr-review-6.md` (finding 1, finding 2 and its Approach decisions, including the escalation that sent the replace rule to a split ticket, which is #197). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Planning Center's User-Agent rule was read from its own docs, https://api.planningcenteronline.com/docs/overview/authentication.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration tests | `pnpm test` | green: 54 files, 1138 passed, 4 skipped |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` | green: 44 passed |
| #195: every request sends the User-Agent | read `src/set-builder/plan-reader.ts`: every request, next pages included, goes through the one `get` (`:141`); the recorder imports `USER_AGENT` (`scripts/record-pco-fixtures.mjs:18`, `:46`) | holds |
| #195: the new test can go red | test-audit agent: the test at `$BASE` with the branch's fake, and two mutants at HEAD in a scratch worktree | red at `$BASE` (`Received: "node"`); red with the header removed; red with the constant changed; green with the header name in lower case, which is correct |
| #195: the 403 bullet | `SKILL.md:64` | names no User-Agent cause, right now that every request sends one; review 5's wording applied |
| #195: the contact in the value | Planning Center's authentication docs; `gh repo view --json visibility` | the docs recommend "your application's name plus a link to your application or your email address" and may answer 403 to a value that does not meet "these requirements"; the repo the link names is PRIVATE. Needs Further Investigation A |
| #196: the test goes red on a marker | test-audit agent in a scratch worktree at `$BASE` with the branch's test | red with the issue's own line appended to `docs/install.md`, failing with `docs/install.md:288:` and the line; red on a `<<<<<<< HEAD` line in a `.ts` file, a bare seven-equals line in a `.md` file, and a marker staged in a new file |
| #196: what it does not see | same | untracked files, a marker only in the index, an indented marker, and a bare seven-equals line ending in CR. The repo tracks no CRLF file (`git ls-files --eol`) |
| #196: speed and root | finder agent | `git grep` 0.04 s, the test file 154 ms; `REPO_ROOT` comes from `import.meta.dirname`, so vitest's cwd does not matter; CI uses `actions/checkout@v4`, a real git checkout |
| #196: no marker on `main` or HEAD | `git grep -nE` with the test's pattern at `origin/main` and at HEAD | no output at either; the `docs/install.md` marker #196 was waiting on left `main` with PR #198 |
| #197: hand traces | finder agent, against `SKILL.md` at HEAD and `src/set-builder/main.ts` | R2-1 (plan rebuild, swap song 2, change it in Planning Center, exit 1 on the key, fix, next listing carries `--replace`, only "Run it?") holds, and the same after an exit 1 on the build's own checks; #179 and #190 hold; review 5 finding 1 holds on both routes; the "still true" list holds |
| #197: worked example 10 | finder agent against `plan-folders.ts:40`, `plan-list.ts:44-49`, `main.ts:136`, `main.ts:195` | the problem line, the `gap, the default` field after it, the default library and the set-folder line after an exit 1 all match what the code prints; 2026-10-31 is a Saturday and 2026-11-01 a Sunday |
| #197: one name, one rule | `grep -nF` over `SKILL.md` | "plain yes", "next bullet", "step 1 says why" and "as step 4 says" are gone; "a yes with no change" at `:14`, `:18`, `:82`; every route points at The yes to replacing (`:14`, `:17`, `:18`, `:43`, `:45`, `:74`, example 9 and 10) |
| Test audit | test-audit agent, per `tautology-audit.md` | see Test quality |

**Overall:** All three tickets do what they say, and every full check is green, end to end included. The User-Agent reaches every request and its test fails against the old reader; the conflict-marker test catches the marker that actually reached `main`; and the replace rule is stated once, with every route the ticket named traced through it. What is left is wording: two sentences of the new rule disagree with Steps step 6, gathered in one LOW hygiene finding. Nothing blocks the PR.

## Approach decisions
- **Carried forward from `pre-pr-review-6.md`:** the plan-path fixes, the existing set folder line, the `--plan --list` flag set, the scrubber's sweep, the status line's fix, and the replace consent lasting for the build, not one listing.
- **The yes to replacing is one named section (#197):** `## The yes to replacing`, between The plan path and The mapping, referred to by name the way Ask instead of guess is; every other step points there. Fixes to the rule edit that section, and do not restate it in a step.
- **The consent carries across a date or output-root change:** a recorded decision from #190, kept by reviews 5 and 6 and by `.epic-loop/tickets/197/assumptions.md` item 4. Nick sees the new folder's `and --replace replaces it.` line before "Run it?".
- **A build ends when a build command runs, whatever its exit code:** `.epic-loop/tickets/197/assumptions.md` item 3. A fix that shows the failed command again keeps the `--replace` that command has.
- **The User-Agent is one exported constant in `plan-reader.ts`,** imported by the recorder, and the test pins the literal, not the constant (`.epic-loop/tickets/195/assumptions.md`).
- **The conflict-marker test keeps the issue's pattern and searches binary files** (`.epic-loop/tickets/196/assumptions.md`): a setext heading of exactly seven equals signs would match, and the comment says so.

## Confirmed Issues
### 1. Comment hygiene — LOW (aggregated)
- `.claude/skills/build-set/SKILL.md:84` — "A fix after a build's exit 1 keeps the `--replace` its command has, by Steps step 6." → "A fix after a build's exit 1 that shows the command again, as a change to the command does by Steps step 6, keeps the `--replace` that command has." (Step 6, `:19-37`, says nothing about keeping `--replace`; it only says some fixes are a change to the command. The rule is `.epic-loop/tickets/197/assumptions.md` item 3, and the citation should not claim step 6 states it.)
- `.claude/skills/build-set/SKILL.md:87` — "A command gains `--replace` only when Nick names it or says yes to the replace question." → "A command gains `--replace` only when Nick names it, says yes to the replace question, or says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing." (Step 6, `:21`, adds `--replace` itself and asks "Run it?"; the ticket keeps that fix as it is, so the rule that claims to be the only source of `--replace` has to name it.)

## Needs Further Investigation
### A. The User-Agent's contact is a link to a private repo — whether Planning Center counts it as meeting its requirement
`src/set-builder/plan-reader.ts:66` sends `setlist-controller (https://github.com/nick-vogel/setlist-controller)`. Planning Center's docs recommend "your application's name plus a link to your application or your email address", with the examples `My Planning Center App (https://pcapp.example.com/contact)` and `PCO Demo (me@pcodemo.example.com)`, and say a value that does not meet "these requirements" may get a 403. `gh repo view` reports the repo PRIVATE, so the link is a 404 to anyone at Planning Center. The value has the documented shape and names the app uniquely, and the docs give no rule beyond the recommendation, so nothing shows Planning Center would refuse it. It was a recorded choice (`.epic-loop/tickets/195/assumptions.md` item 1, the issue's own example, to keep an address out of the source). What would settle it: Nick deciding whether he wants Planning Center able to reach him through the header. If so, the reverse is the one constant at `plan-reader.ts:66` and the literal at `test/set-builder-plan.test.ts:271`, for example a public `https://nlvogel.com` link or his email.

## Reviewed and Dismissed
- The consent carries `--replace` to another date's or output root's set folder (`SKILL.md:83`) — a recorded decision from #190, kept by reviews 5 and 6 and by `.epic-loop/tickets/197/assumptions.md` item 4; the listing shows `<folder> already exists, and --replace replaces it.` for the new folder before "Run it?". Do not touch.
- `pnpm test` fails outside a git checkout (`test/conflict-markers.test.ts:15-22`, exit 128 from `git grep` in a `git archive` copy) — by design it fails loud rather than reading a broken search as a clean tree; CI and every worktree are git checkouts. Do not make it skip.
- The test searches `docs/reviews`, which review 6's manual check excluded — no review doc has a marker at the start of a line today, and a review doc that quotes a conflict hunk at line start would be caught on purpose, since CI runs over the docs too.
- The `brokenPlanningCenter` change (`test/set-builder-plan.test.ts:104`) is asserted by nothing — it exists to satisfy the `RecordedRequest` type (removing it fails `tsc` with TS2345); it claims no coverage.
- The new test covers `--plan`, not `--plan --list` — both go through the one `get` at `plan-reader.ts:141`; a recorded choice (`.epic-loop/tickets/195/assumptions.md` item 3).
- A Markdown setext heading under exactly seven equals signs would fail the test — the issue's acceptance criterion allows keeping the pattern, the repo has none, and the comment says so.

## Minor / nits
- A bare seven-equals line ending in CRLF slips past `( |$)` (`test/conflict-markers.test.ts:11`). The repo tracks no CRLF file, and the other three markers still match on their space. `( |\r?$)` would close it.
- A binary match prints `Binary file <path> matches`, with no line number, unlike the `file:line:text` lines the issue asks for. Nothing matches today, and the path is still named; a recorded choice (`.epic-loop/tickets/196/assumptions.md` item 2).
- The test's comment opens with the history of the `docs/install.md` marker. The clause that none of lint, typecheck, test and build reads Markdown for markers is the load-bearing part.
- The consent has no way back: "actually don't replace it" after a yes is not named. Nick would see `--replace` on the command and the `and --replace replaces it.` line before "Run it?", and an explicit retraction is a change he names.
- After a listing that exits 1, the rule does not say whether Nick coming back later with "build Sunday's set from the plan" is the same build. In practice a later request is a new conversation, and the carried line is shown before "Run it?".
- Plan step 2 (`SKILL.md:45`) sends every change to plan step 3, which handles a transition and the songs; a change of date or output root on the plan path is covered only by plan step 1's "Nick named". Pre-existing: at the merge-base such a change went to Steps step 5 and Steps step 4, which shows a command with no plan listing.

## Test quality
Tests added: 2 (`names the app and a contact in the User-Agent of every request`, `test/set-builder-plan.test.ts:262`; `leaves no tracked file with a line that starts with a merge conflict marker`, `test/conflict-markers.test.ts:14`). Green against `$BASE`: 1, the conflict-marker test, which by design checks a property of the tree rather than new code, and goes red on each injected marker listed in the table. Tautology shapes found: 0. The User-Agent test runs the real command against the local fake, pins the literal rather than importing the constant, and guards its loop with the request count. Nothing to strengthen or delete.

## Prior-review closure
Review 6 had two findings, both LOW. Finding 1 (R2-1, the replace question coming back after a plan listing that exits 1) is fixed by #197's rule (`SKILL.md:43` and `:83`), traced on the plan-edit route and after an exit 1 on the build's own checks. Finding 2 (comment hygiene, five entries carried from review 5) is fully closed: `:18` and `:50`'s sentences are gone in the rewrite, their corrected sense in `:83` ("when the set folder for its date exists"); the 403, 429 and next-page wordings are applied at `:64`, `:66` and `:69`. No prior finding was MEDIUM or higher, and none was resolved by a comment edit alone.

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and build green at `5825f75`; e2e green.
- **Commit hygiene:** commit this doc. Each ticket landed as a lane commit plus its merge into the epic branch, which is the run's usual shape.
- **Likely reviewer asks:** whether the User-Agent should carry a reachable contact (A).

## Verdict
**Ready to open the PR with follow-ups.** No finding gates it. Finding 1 is two LOW wording fixes to the new rule, which can land now or after; A is Nick's call on the contact in the User-Agent. The replace rule, patched in place four times before, is now stated once and holds on every route the ticket named.

## Remediation — 2026-10-22
**Remediation scope:** Nick chose at close-out to fix finding 1 (LOW) in this round, by the doc's corrected text. Needs Further Investigation A (the User-Agent contact) and the Minor / nits are untouched.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW, comment hygiene) | `a5d5ff3` setlist-controller#58 pre-PR review 7 finding 1: Two sentences of The yes to replacing disagree with Steps step 6 | hand trace (skill text, no test reads it), below; both entries applied word for word; `git grep -nE "gains .--replace\|keeps the .--replace"` finds no other copy outside `docs/reviews` | 0 | fixed, by reading (aggregated hygiene finding, excluded from Phase 2) |

Full checks at `a5d5ff3`, after `pnpm install --frozen-lockfile`: `pnpm lint` green, `pnpm typecheck` green, `pnpm test` green (54 files, 1138 passed, 4 skipped), `pnpm build` green, `pnpm test:e2e` green (44 passed).

### Hand traces, against `SKILL.md` at `a5d5ff3`
| Route | Trace | Result |
| --- | --- | --- |
| Steps step 6's `--replace` fix (#197 "still true") | Build command with no `--replace` runs after a listing with no set-folder line; another build writes the folder in between; the build exits 1 with `<folder> already exists. Build with --replace to replace it.` (`build-set.ts:102`). Step 6 (`:21`) shows the same command with `--replace` and waits for a yes from step 4. No consent was given, so `:83` carries nothing; `:87` now names this as the third source of `--replace` ("says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing"), so the command gaining it no longer contradicts `:87`. The first build command ran, so by `:84` that build ended; the step 6 command is shown again and has `--replace` on Nick's yes. | holds; `:87` and `:21` agree |
| `:84` scope | `:84` now keeps `--replace` only for a fix that shows the command again, the way a change to the command does by step 6 (`:21`, `:25`: `--pads` "a change to the command (back to step 4)"). Step 6 states no keep rule, and `:84` no longer claims it does; the keep comes from the command having `--replace`, as `.epic-loop/tickets/197/assumptions.md` item 3 records. A fix that is not a command (Nick adds a WAV) shows no command, and a later request is a new build with no consent (`:84` last sentence). | holds |
| R2-1, exit 1 on the song line | Plan rebuild; listing ends `already exists. The build stops on it unless --replace replaces it.`; plan step 2 asks "Replace the set built before?" (`:81`). "yes, but swap song 2 for Goodness of God": consent by `:83`; a song change is Ask instead of guess (`:74`); "I'll change it in Planning Center". Plan step 1 (`:43`) adds `--replace` "when The yes to replacing carries it, after a fix included"; listing `--plan --list --replace` exits 1 on the key (`:46`, no command shown). Nick fixes the key; the next listing carries `--replace` by `:43` and `:83` ("a listing that exits 1, and the listing after its fix"), exits 0, ends `already exists, and --replace replaces it.`; `:86` asks only "Run it?". Neither edited sentence is on this route: a listing's exit 1 is not a build's exit 1, so `:84` does not apply, and `:87`'s second source covers the carried `--replace`. | holds (example 10, `:281-299`) |
| R2-1, exit 1 on the build's own checks | Same route, the relisting exits 1 on stderr problems with clean song lines (`:53`), such as a WAV missing from Goodness of God's folder; Nick adds the file; next listing carries `--replace` by `:43` and `:83`; only "Run it?". | holds (`:303`) |
| #179 | Worked example 9: listing ends `already exists. The build stops on it unless --replace replaces it.`; step 4 asks the replace question (`:17`, `:81`); a yes with no change runs `pnpm build-set grace lord rain --replace` at once by `:82`, with no listing in between (step 1's exemption, `:14`). | holds (`:251-258`) |
| #190, typed route | "yes, but swap song 2" on a typed rebuild: a change by step 5 (`:18`), consent by `:83`; the new command `pnpm build-set grace goodness rain --replace`; the listing reruns with `--replace` (`:14`) and ends `already exists, and --replace replaces it.`; only "Run it?" (`:86`). | holds (`:261`) |
| #190, plan route | "yes, but pad after song 2" on a plan rebuild: plan step 2 sends it to step 3 (`:45`); step 3 reruns the listing with the flag and `--replace` (`:74`), ending `already exists, and --replace replaces it.`; only "Run it?". | holds |
| Review 5 finding 1, Planning Center route | As R2-1 above, on a key the library has: the listing after the plan change carries `--replace` (`:43`, `:74`, `:83`); only "Run it?". | holds |
| Review 5 finding 1, songs-he-names route | "yes, but swap song 2 for Goodness of God", then "build it from songs I name": `:74` and `:83` carry `--replace` onto the Steps listing (`:14`, "when The yes to replacing carries it") and the command; listing ends `already exists, and --replace replaces it.`; only "Run it?". | holds |
| Still true | A song change on the plan path is Ask instead of guess (`:74`); a "no" with no change builds nothing (`:18`, `:85`); a date, `--output-root` or `--replace` named at step 5 and an answered date question rerun the listing (`:14`); a command with no `--replace` gains none outside `:87`'s three sources. | holds |

### Approach decisions
- **Finding 1 (comment hygiene):** applied the doc's two corrected sentences word for word at `SKILL.md:84` and `:87`, one commit; no other sentence edited, since `:86` ("named by Nick or carried by this rule") describes the listing line and is outside the finding's surface.
