# Pre-PR review: setlist-controller#604 Clean main for the public copy

**Branch:** `setlist-controller-604-public-cleanup` vs `origin/main` (merge-base `74f2edc25c7cf25dfce6a824f24189f8ab5f558d`, "Merge pull request #602 from nick-vogel/setlist-controller-285-desktop-launcher"). `origin/main` at review time is `27f60b37ca75ee625e2c6cc830deaf0d0715c00c`, ahead of that merge-base.
**Reviewed at:** HEAD `b480f99e87f93f578cb7d62f16b316f35b7fd156` ("setlist-controller#604 Stand-ins for the sermon titles in the ProPresenter and Planning Center fixtures"), clean product tree: 0 uncommitted product files. 75 files, +1608 / −1547 against the merge-base.
**Reviewed against:** setlist-controller#604 (publish a new public repository from a clean copy of `main`; this pull request is only the cleanup) and pull request #618. No `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, ADRs, or docs under `docs/specs/` or `docs/plans/`. Run with `--fresh`: the whole working surface against the merge-base. Global rules in `~/.claude/rules/` are the conformance checklist.
**Date:** 2026-11-24
**Reviewer:** Grok 4.7 through T3 Code + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Working surface | `git merge-base HEAD origin/main`, `git diff --shortstat`, `git status --porcelain`, `git log --oneline` | 9 commits, 75 files, +1608 / −1547. Product tree clean. `git cat-file -t` confirms HEAD and the merge-base are commits. |
| Dependencies | `pnpm exec vitest` resolved and ran | installed. `pnpm install` was not re-run. |
| Typecheck | `pnpm typecheck` | clean |
| Lint | not run | recorded as not run |
| Full unit suite | not run | recorded as not run. Pull request #618 reports one load-related failure in `test/propresenter.test.ts` that passed when that file was rerun alone. This review did not rerun it. |
| End to end | not run | `pnpm test:e2e` builds and drives the app. Not started. Planning Center, ProPresenter, Eos, and the ATEM were not contacted. |
| User-Agent and service-type list | `env -u NO_COLOR -u FORCE_COLOR pnpm exec vitest run test/set-builder-plan.test.ts -t "User-Agent\|lists the service types"` | the two named tests passed. A first run without unsetting `NO_COLOR` and `FORCE_COLOR` failed the service-type test because Node prints a warning on stderr when both are set. |
| New home-folder test and advertise | `env -u NO_COLOR -u FORCE_COLOR pnpm exec vitest run test/fixture-sets-public.test.ts test/advertise.test.ts` | 15 passed (7 + 8) |
| Home-folder test against the base blobs | `git show "$BASE":<als>` piped through `gzip.decompress`, counting `/Users/`. A vitest run at the merge-base was not executed: this reviewer may not add a worktree. | At `74f2edc` the four library songs have 15, 15, 8, and 18 `/Users/` hits and the template has 2. The Live 8 song has 0. The new path assertion is red on those five files. The length assertion (exactly 6) matches the base tree. |
| Generator bytes | scratch copy of `scripts/make-song-fixtures.mjs` writing nothing, comparing `gzipSync` output to the committed blobs | all six `.als` files match the committed bytes |
| Stand-in thumbnail hues | decoded the four changed PNGs and ran `pictureHue` | 41, 6, 25, 192, the values the pull request names |
| Church name and domain search | the two `git grep -i` commands the pull request reports for the church name and the full domain, plus `git grep -n chart-songs` and `git grep -n 192.168.8` | no hits. Those searches miss the truncated address in finding 1. |
| Email local-part | `git grep -n 'nick@'` | one tracked hit, `docs/reviews/setlist-controller-58/pre-pr-review-9.md:20` |
| Stage addresses in the network note | `git grep` of private ranges in `.out-of-scope/connection-targets-network.md` | no hits |
| Historical send line | `git show 9131dd7:src/set-builder/plan-reader.ts` | at that review's HEAD the constant is on line 66 and the send is on line 141 |

**Overall:** The scrub of songs, thumbnails, sermon titles, service-type names, the User-Agent constant, and the install doc holds, and the new home-folder test fails on the base blobs. The tree is still not safe to copy. One historical review keeps a truncated church email that a search for the domain name does not see, and the same table now says the User-Agent constant is an email. Fix finding 1 before merge. Comment hygiene can ride along and does not block on its own. License, CI, and the fresh public commit stay outside this pull request.

## Approach decisions
- An ellipsis-truncated address is still the address. Remove it by rewriting the cell. Do not put the address back. Precedent: `80a1192` ("setlist-controller#604 No church or venue details in the README and the install doc") rewrote the full address on line 18 of the same table and left the truncated quote on line 20.
- A historical review keeps the line numbers of the commit it reviewed. `pre-pr-review-9.md` line 19 says the send is `plan-reader.ts:141`, which is the send at `9131dd7` ("setlist-controller#203 The build-set skill drops the flags I named on the plan path when I switch to naming the songs"). This branch's send is line 143. Do not retarget the old cell.

## Confirmed Issues
### 1. A historical review still carries the church email, and now says the User-Agent is an email — MEDIUM
- **Location:** `docs/reviews/setlist-controller-58/pre-pr-review-9.md:20` and `:18`
- **Attribution:** Line 20 is pre-existing, exposed. `git diff -U0 74f2edc25c7cf25dfce6a824f24189f8ab5f558d -- docs/reviews/setlist-controller-58/pre-pr-review-9.md` changes only line 18. Line 20 is identical at the merge-base and at HEAD, and `git grep -n 'nick@'` hits that line and no other tracked file at this HEAD. This pull request's tree is the tree the public copy will contain, and `80a1192` edited this file to remove the address from line 18 while leaving line 20. Line 18's false "exactly the maintainer's email" is introduced by that same commit: the base cell quoted the address the constant had at `9131dd7`, and the commit replaced that quote with a placeholder.
- **Real-world trigger:** The public repository is a fresh commit of this tree. The truncated address ships with that commit. A later edit that trusts the table can also put an email back into the name sent to Planning Center. The pull request's own check, a case-insensitive search for the church name and for the full domain, misses the cell, because the test runner cut the domain short of both strings.
**Evidence** — current cells:

```
| #202: the constant | ... | `USER_AGENT` is exactly `setlist-controller (<the maintainer's email>)`; the comment above it ... still holds |
| #202: the test can go red | ... | red at base: `expected 'setlist-controller (https://github.co…' to be 'setlist-controller (nick@…'` at `:271`. Green at HEAD in the full suite |
```

The second quote is the test runner's truncation. The domain letters that follow `nick@` in the file are the church domain. The current constant is the GitHub URL:

```
export const USER_AGENT = 'setlist-controller (https://github.com/nick-vogel/setlist-controller)';
```

`src/set-builder/plan-reader.ts:66`, sent at `:143` and from `scripts/record-pco-fixtures.mjs:46`.
**Failure mode** — copying this tree publishes the truncated church email inside the old review. The row above, which `80a1192` rewrote, tells a reader the constant is an email. At `9131dd7` the constant was an email. In this tree it is the GitHub URL (`9c052b1`, "setlist-controller#604 The Planning Center User-Agent names the public repository, not the church email").
**Recommended fix** — replace the two lines in full. No other column changes. The address is not restored, and neither line says the constant is exactly an email. Line 18's old text is exact. Line 20's old text is the line `git grep -n 'nick@'` prints. It is not repeated here, because copying it into this brief would put the address back into the tree. Put these two lines in their place:

```
| #202: the constant | read `src/set-builder/plan-reader.ts:63-66` | `USER_AGENT` at this review's HEAD is an email contact for this app, and the address is left out of this copy; the comment above it (`<app name> (<link or email>)`, the recorder imports it) still holds |
| #202: the test can go red | tautology audit: the branch's `test/set-builder-plan.test.ts` copied into a scratch worktree at `1d7b38f`, then `pnpm exec vitest run test/set-builder-plan.test.ts -t "User-Agent"` | red at base: the code sent the GitHub URL and the test expected an email contact, at `:271`. Green at HEAD in the full suite |
```
**Remediation brief**
- **Design intent:** `pre-pr-review-9.md` records the #202 review at `9131dd7`, when `USER_AGENT` was an email contact and the test that expected that email was red against the older GitHub URL. This branch's job is that a fresh commit of the tree contains no church domain and no church email. The current constant, `plan-reader.ts:66`, is the public repository URL, one value shared with the fixture recorder. The old review may still say that the reviewed constant was an email contact. It may not print the address, and it may not say the constant is exactly an email, because a later reader treats these tables as the spec.
- **Full surface:** `docs/reviews/setlist-controller-58/pre-pr-review-9.md:18` and `:20` only. At this HEAD, `git grep -n 'nick@'` hits line 20 and no other tracked file, and `git grep -n "maintainer's email"` hits line 18 and no other tracked file. This review names `nick@` as the search token, so after this doc is committed an unscoped search also hits here. The proof stays scoped to `pre-pr-review-9.md`.
- **Must preserve:** Line 18 still says the reviewed constant was an email contact, that the comment above it describes `<app name> (<link or email>)`, and that the recorder imports it. Line 20 still says the tautology run was the branch's `test/set-builder-plan.test.ts` copied to a scratch worktree at `1d7b38f`, the vitest command with `-t "User-Agent"`, that the run was red at that base because the code sent the GitHub URL and the test expected an email contact, the `:271` cite, and that the same test was green at that review's HEAD. The exact address quote is dropped on purpose. Do not fill it back in from `git show 74f2edc25c7cf25dfce6a824f24189f8ab5f558d:docs/reviews/setlist-controller-58/pre-pr-review-9.md` (that blob still has the full address on line 18). No suite pins this prose. The behaviour the row records is pinned by `test/set-builder-plan.test.ts` ("names the app and a contact in the User-Agent"), which must stay green and must keep expecting the GitHub URL.
- **Do not touch:** Line 19's `plan-reader.ts:141`. That was the send at `9131dd7`. This branch sends on line 143. Retargeting the old cell would make that review false. Do not change `USER_AGENT`, the plan test, or any fixture. Dismissed neighbours are listed under Reviewed and Dismissed.
- **Proof:** From the repo root, both commands print a hit now and print nothing after the edit:

```
git grep -n 'nick@' -- docs/reviews/setlist-controller-58/pre-pr-review-9.md
git grep -n "maintainer's email" -- docs/reviews/setlist-controller-58/pre-pr-review-9.md
```

Then `git grep -n 'github.co' -- docs/reviews/setlist-controller-58/pre-pr-review-9.md` still hits line 20, and `pnpm exec vitest run test/set-builder-plan.test.ts -t "User-Agent"` stays green. Unset `NO_COLOR` when `FORCE_COLOR` is set, or Node writes a warning onto stderr and the service-type test, if included, compares that warning.

### 2. Comment hygiene — LOW (aggregated)
- `test/fixture-sets-public.test.ts:7` — "The repository is public (setlist-controller#604), so no Live set it holds may carry a path into someone's home folder" → "The public copy of this tree (setlist-controller#604) may hold no Live set with a path into someone's home folder". This repository stays the private archive. The sentence under the comment, about a clip path or a preset path naming a person, still holds.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- Generator determinism — a scratch rerun of `scripts/make-song-fixtures.mjs` matched all six committed `.als` blobs byte for byte, including the Live 8 song. The generator's own `/Users/` check covers the four library songs. The new test covers the Live 8 song and the template.
- Re-pinned audio ends and the bar-line tolerance — Goodness of God and Trust in God still end a few samples past a bar, inside `ON_BAR_LINE_TOLERANCE`. The stop-rules tests that shorten the Oohs clip still test that vocal clip against the Ending locator.
- Stand-in hues — `pictureHue` on the four replaced thumbnails returned 41, 6, 25, and 192. The lights tests read ranges. Stock motion-background file names left as slide labels are the recipe the fixture README records.
- `192.0.2.20` as a documentation address — `laptopAddress()` still selects it when it is the only candidate, and `test/advertise.test.ts` passed (8 tests). `192.168.10.240` stays the ATEM Mini factory default. `.out-of-scope/connection-targets-network.md` has no private-range address.
- `/Users/nick` in the README `--replace` example, the build-set skill, and the Eos fixtures — the author's own paths. The epic's congregant rule is a different person. The new test covers set-builder `.als` files.
- `com.nlvogel.setlist-controller` — the copyright holder named on the epic (`NLVogel, LLC`).
- Service type id `997539`, plan and item ids, the generic word "church", event media labels, and the unconfirmed template origin — left on purpose in pull request #618, or still open on the epic outside this pull request.
- `LICENSE`, the public CI workflow, and rewriting this repository's history — the epic's later steps. This pull request does not claim them. The public copy is one fresh commit, so this archive's history staying put is the design.
- `chart-songs` — `git grep -n chart-songs` is empty.
- A trailing space on the stand-in service type whose id is `1000011` — `text()` trims before the name is compared or printed. The service-type test passed.

## Minor / nits
- The service-type fixture name for id `1000011` has a trailing space. Matching ignores it. Worth cleaning when those fixtures are next regenerated, so a raw JSON read and the trimmed name agree.

## Test quality
Tests added: 1 file, `test/fixture-sets-public.test.ts`, 7 cases. It gunzips the real `.als` bytes and asserts on those bytes. It does not build the expected value with a production helper.

Green against the merge-base, in the sense that asserts nothing new: the length assertion (exactly 6). The base tree already has those six files. Keep it. It bounds the set, and the path assertions are the new rule.

Red against the base blobs: the path assertion, on 5 of the 6 files (four library songs and the template). The Live 8 file at the merge-base already has no `/Users/` hit, so that one case would pass there. A vitest process at the merge-base was not run, because a worktree checkout is out of bounds for this reviewer. The blob counts above are the evidence.

Tautology shapes: none in the new file. The path assertion fails when a home-folder path is present. It does not read a comment or a class name.

Modified tests were read in the diff and the two plan tests named above were run at HEAD. They were not copied onto a merge-base checkout.

## Before opening the PR
- **CI readiness:** `pnpm typecheck` is clean. `test/fixture-sets-public.test.ts` (7) and `test/advertise.test.ts` (8) passed, as did the User-Agent test and the unknown-service-type test. Lint, the full unit suite, and `pnpm test:e2e` were not run in this review.
- **Commit hygiene:** the product commits are the cleanup. This review doc is untracked until the epic session commits it, after Nick says to. No product file should move with it.
- **Likely reviewer asks:** the domain search the pull request reports is blind to a test-runner truncation. Finding 1 is that gap. The license file, public CI, and the fresh public commit are the epic's next steps, not missing pieces of this diff.

## Verdict
Not ready to merge for the public copy. Finding 1 is the gate: the tree still contains the church email, truncated, and the same table calls the User-Agent an email. Comment hygiene does not block. License, CI, and history rewrite are out of this pull request's scope.

## Remediation — 2026-11-24
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `2339f93` pre-PR review 1 finding 1 and review 2 finding 1: an old review keeps the truncated church email | red→green: `git grep -n 'nick@' -- docs/reviews/setlist-controller-58/pre-pr-review-9.md` and `git grep -n "maintainer's email" -- docs/reviews/setlist-controller-58/pre-pr-review-9.md` print nothing; `github.co` still hits line 19 (the new line 20 names "the GitHub URL" in words) | 0 | fixed (proved by execution) |
| 2 (LOW) | `4ef7953` pre-PR review 2 finding 2: the home-folder test says this repository is public | comment hygiene, checked by reading; `test/fixture-sets-public.test.ts` 7/7 | 0 (one comment reworded) | fixed; Nick asked for both reviews cleared |

Full checks after the round: `pnpm typecheck` and `pnpm lint` clean; `env -u NO_COLOR -u FORCE_COLOR pnpm test -- --maxWorkers=5` 3,264 passed, 4 skipped.

### Known regressions, deferred
None.

### Rework briefs
None.

## Approach decisions
- The rewrite of lines 18 and 20 is this doc's text word for word. Review 1 finding 1 closes in the same commit.
- The trailing space on service type `1000011` (Minor / nits) is in the recording at `74f2edc`, so the stand-in keeps it.
