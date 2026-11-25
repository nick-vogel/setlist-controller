# Pre-PR review: setlist-controller#58 Planning Center plan, fifth run (#188, #189, #190)

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `08583a0`, origin/main after PR #191)
**Reviewed at:** HEAD `d4ce7a6` (setlist-controller#188 The build-set skill gives no fix for "Planning Center answered <status> to <path>." or "Planning Center sent a next page outside <base>."), clean tree: 0 files with uncommitted changes, 0 untracked; 2 files total, +14 / -6 against the merge-base
**Reviewed against:** the epic body of setlist-controller#58 and the bodies of the three sub-issues this run carries: #188 (the skill's fix for the status line and the next-page line), #189 (the stray `||||||| 7b7f066` marker at the end of `docs/install.md`) and #190 (the replace question can come back on a rebuild); the run's recorded decisions per ticket (`.epic-loop/tickets/188/assumptions.md`, `.epic-loop/tickets/190/assumptions.md`), read so that a recorded decision is not re-reported as a defect; the Approach decisions of `pre-pr-review-4.md`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Run with `--fresh`, so the whole surface since the merge-base is reviewed and no delta scoping applies.
**Date:** 2026-10-22
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | up to date; the branch changes neither `package.json` nor `pnpm-lock.yaml` |
| Lint | `pnpm lint` | green |
| Unit and integration tests | `pnpm test` | green: 52 files, 1093 passed, 4 skipped |
| Typecheck, build, e2e | not run | the surface is two Markdown files that no build input, type or test reads; nothing pins the skill's text (#188 and #190 acceptance say so) |
| Merge with the moved base | `git merge-tree --write-tree HEAD origin/main` | origin/main moved to `57a7eaf` (PR #192, #115 and #146) while the run worked. It adds 12 lines to `docs/install.md` and still ends in the `||||||| 7b7f066` marker (its line 288). The merge is clean, and takes this branch's deletion of the marker |
| #189 marker gone | `git grep -nE '^(<<<<<<<\|>>>>>>>\|\|\|\|\|\|\|\|=======)( \|$)'`; `od -c` on the file's tail | no output; the file ends on the "Read the plan before the service" paragraph and a newline |
| #188 trace: `Planning Center answered 404 to /service_types/1000013/plans.` | hand trace of `SKILL.md:60-77` | exit 1, no song lines: the status bullet (`:69`) and its 404 sub-bullet (`:71`) give the fix, and the case shows no build command |
| #188 trace: `Planning Center sent a next page outside https://api.planningcenteronline.com/services/v2.` | hand trace | the next-page bullet (`:75`) gives the fix, no build command |
| #188: a 401 never reaches the new bullet | `src/set-builder/plan-reader.ts:140-141` | the 401 returns the refused-token line before the `!response.ok` check, as the bullet says |
| #188: the paths `<path>` can name | `shown()` at `plan-reader.ts:123`; requests at `:178`, `:196`, `:198`, `:223`, `:225` | `/service_types`, `/service_types/<id>/plans`, `/service_types/<id>/plans/<id>/items`, base and query string stripped, as the bullet describes |
| #188: "Every id in the path is one Planning Center itself listed moments before" | `plan-reader.ts:181-182`, `:195`, `:211-212`, `:222` | true: `--service-type` and `--plan-id` are only compared with listed records; the URL takes the listed record's id |
| #188: the 429 figure | Planning Center's own docs, found by a web search restricted to its domain (no Planning Center skill or docs MCP exists): https://api.planningcenteronline.com/docs/overview/rate-limiting | 100 requests per 20 seconds per authenticated user, with `Retry-After` in seconds on a 429; the bullet's "usual limit" and "about half a minute" hold |
| #188: the 403 cross-reference | `docs/install.md` "## 8. The Planning Center token file", item 1 | it says to sign in "with the account that can see the Sunday plan in Services"; correct, and `SKILL.md:64` already cites it the same way |
| #190 trace: worked example 9, plain yes | hand trace of `SKILL.md:14`, `:18`, `:22`, `:236-255` | one question; a yes runs `pnpm build-set grace lord rain --replace` with no listing in between, by step 1's new exemption |
| #190 trace: "yes, but swap song 2", typed rebuild | hand trace | new command keeps `--replace`, step 1 reruns the listing, its last line is the `and --replace replaces it.` line, step 4's second bullet asks only "Run it?". `goodness` is a listed short name (`:132`) |
| #190 trace: "yes, but pad after song 2", plan rebuild | hand trace of `:50`, `:80` | step 3 reruns the listing with `--replace`; one question |
| #190: the reruns that must still happen | hand trace of `:14`, `:24` | a date, `--output-root` or `--replace` named at step 5, and an answered date question, still rerun; step 6's `--replace` fix is no plain yes to step 4's question, so it is not exempted and still waits for a yes from step 4 |
| Plan path, a yes with a song change | hand trace of `:50` and Ask instead of guess (`:117`) | the consent to replace is not carried: finding 1 |
| Test audit | — | branch adds no tests |

**Overall:** All three tickets do what their acceptance criteria ask, lint and the suite are green, and the branch merges cleanly with the base that moved under it. One LOW gap remains in #190 (the plan path drops the yes to replacing when the same answer changes a song) and one aggregated LOW of skill wording. Neither blocks the PR.

## Approach decisions
- **Carried forward from `pre-pr-review-4.md`:** the plan-path fixes (#160, #162, #171), the existing set folder line (#169, #179), the `--plan --list` flag set and the scrubber's sweep stand as recorded there.
- **The replace consent (#190):** a yes to the replace question is consent to `--replace` for this build, and it stays on the command and on every listing that follows whatever else the same answer changes, including the date or output root (`.epic-loop/tickets/190/assumptions.md`, item 2); a plain yes runs at once with no listing. Finding 1 extends this to the plan path's song change, it does not overturn it.
- **The status line's fix (#188):** one bullet for the line, split by status, after the refused-token bullet; 404 says build again, never check an id, since no requested id comes from Nick (`.epic-loop/tickets/188/assumptions.md`).
- **The replace consent across a song change on the plan path (remediation of finding 1):** the consent is stated where a song change meets Ask instead of guess, at both places one does: plan step 2's replace bullet (`SKILL.md:50`, a yes that names a song change) and plan step 3 (`SKILL.md:80`, a song change once the command has `--replace`). Each says `--replace` goes on the listing and the command that follow his answer, by either route Ask instead of guess offers. Precedent: the transition sentence on `:50` and step 3's "with `--replace` when the command has it". Ask instead of guess (`:117`) stays unchanged.

## Confirmed Issues
### 1. On the plan path, a yes to replacing that also changes a song loses the yes, so the replace question comes back — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:50`
- **Attribution:** introduced, as an incomplete surface of #190: `e597259` (setlist-controller#190 The build-set skill's replace question can come back on a rebuild) carries the consent through a transition change but leaves the song change as it was. `git show 08583a0:.claude/skills/build-set/SKILL.md` has no carry rule at all on this bullet.
- **Real-world trigger:** Nick asks for Sunday's set from the plan on Saturday after building it once, the listing says the set folder exists, and he answers the replace question "yes, but swap song 2 for Goodness of God". User path: one extra "Replace the set built before?" after he already said yes. No work is lost and nothing wrong is built, so LOW.

**Evidence** — `SKILL.md:50`, after the transition rule:

```
A change to the songs themselves stays a question under Ask instead of guess. A "no" builds nothing: ...
```

and Ask instead of guess, `SKILL.md:117`: "ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps". Plan step 1 (`:47`) and Steps step 1 (`:14`) put `--replace` on a listing only when Nick names `--replace`, "replace it" or "rebuild it" up front.

**Failure mode** — Either answer to the song question starts a fresh listing with no `--replace`: plan step 1 after he edits the plan, or Steps step 1 for songs he names. Its last line is again `<folder> already exists. The build stops on it unless --replace replaces it.`, and plan step 2's or Steps step 4's first bullet asks whether to replace the set a second time. #190's "What should happen" says the yes "stays on the command whatever else I change in the same answer", and the typed path (`:18`) and the plan path's transition change already honour it.

**Recommended fix** — in `SKILL.md:50`, replace

```
A change to the songs themselves stays a question under Ask instead of guess.
```

with

```
A change to the songs themselves stays a question under Ask instead of guess, and the yes to replacing stands: `--replace` goes on the listing and the command that follow his answer, whether he changes the plan in Planning Center or names the songs by the Steps.
```

**Remediation brief**
- **Design intent:** a listing's last line answers for one date and output root, and decides whether the skill asks to replace (`already exists. The build stops ...`) or only whether to run (`already exists, and --replace replaces it.`). A yes to the replace question is consent to `--replace` for this build, so every listing and command after it carries `--replace`, and the next question is only "Run it?" (Approach decisions, the replace consent).
- **Full surface:** `.claude/skills/build-set/SKILL.md:50` only. The typed path (`:18`, `:22`, `:255`) and plan step 3 (`:80`) already carry the consent. Ask instead of guess (`:117`) needs no change, since the carry is stated where the yes is given.
- **Must preserve:** a song change on the plan path is still a question under Ask instead of guess, never a flag; a plain yes still runs at once with no listing; a "no" with no change still builds nothing; the transition-change sentence on `:50` and plan step 3's `--replace` on the rerun (`:80`).
- **Do not touch:** the carry across a date or output-root change (Reviewed and Dismissed, first bullet); the 404 wording (Reviewed and Dismissed).
- **Proof:** hand trace, from the repo root, of `.claude/skills/build-set/SKILL.md`: plan rebuild, "yes, but swap song 2 for Goodness of God", Nick answers the song question with "build it from songs I name": the Steps' listing runs with `--replace`, its last line is `... already exists, and --replace replaces it.`, and the only question is "Run it?". `pnpm test` stays green.

### 2. Comment hygiene — LOW (aggregated)
- `.claude/skills/build-set/SKILL.md:18` — "step 1 runs the listing again with it, its last line reads `already exists, and --replace replaces it.`, and the next bullet asks only whether to run it." → "step 1 runs the listing again with it; when the set folder for its date exists, its last line reads `already exists, and --replace replaces it.` and the next bullet asks only whether to run it, and otherwise step 4 asks as usual." (A change that moves the date can land on a date with no set folder, and then the listing has no last line.)
- `.claude/skills/build-set/SKILL.md:50` — "and `--replace` stays on the listing and the command alike" → "and `--replace` goes on the rerun listing and stays on the command" (the first listing never had it, which is why it asked).
- `.claude/skills/build-set/SKILL.md:70` — "cannot see that service type or plan in Services" → "cannot see Services, or that service type or plan in it" (a 403 on the first request, `/service_types`, names no service type or plan).
- `.claude/skills/build-set/SKILL.md:72` — "shared with any other app the same account's token drives" → "shared with every other app that acts as the same Planning Center user" (Planning Center counts per authenticated user, not per token).
- `.claude/skills/build-set/SKILL.md:75` — "a page of a list named its next page on another host than `<base>`" → "a page of a list named a next page outside `<base>`, on another host or another path" (`plan-reader.ts:173` refuses any `links.next` that does not start with `<base>/`).

## Needs Further Investigation
None.

## Reviewed and Dismissed
- A yes with a change of date or output root carries `--replace` to another set folder (`SKILL.md:18`) — a recorded decision (`.epic-loop/tickets/190/assumptions.md`, item 2, from #190's "whatever else I change"), and Nick sees the new folder's `and --replace replaces it.` line before "Run it?". The wording half is in finding 2.
- The 429 figure is unverified — verified against Planning Center's rate-limiting doc (see the table).
- The 404 sub-bullet's "most often a plan or service type deleted or moved" cannot describe a 404 on `/service_types` — the fix it gives (build again, then build from songs he names) holds whatever the cause; recorded decision in `.epic-loop/tickets/188/assumptions.md`, item 3.
- The status bullet names paths as "a service type's `/plans`, or a plan's `/items`", shorter than the printed `/service_types/<id>/plans` — the acceptance trace matches it without difficulty; no agent would misroute a line.
- `--plan-id` or `--service-type` could put an id of Nick's in a path, so a 404 could mean a wrong id — false: both are only compared with listed records (`plan-reader.ts:181-182`, `:211-212`).
- Step 1's new exemption swallows step 6's `--replace` fix — no: step 6's fix is not a plain yes to step 4's replace question, so the listing still reruns and step 4 still waits.

## Minor / nits
- `SKILL.md:18` and `:50` end "A "no" builds nothing", while step 5 (`:22`) makes a "no" with a change in it a change. Pre-existing, untouched by this branch; "A "no" with no change builds nothing" would read cleanly.
- The plan path has no rule for any change but a transition or a song after step 2, such as a new `--date`, `--pads` or `--plan-id`; plan step 3 (`:80`) handles transitions only. Pre-existing, untouched; follow-up material if it ever bites.
- The reader sends no User-Agent of its own, which Planning Center says may draw a 403. Already a proposal in `.epic-loop/tickets/188/proposals.md`; not this branch's defect.

## Test quality
Branch adds no tests. Nothing pins the skill's or the install doc's text, as #188, #189 and #190 each note; a conflict-marker check is proposed in `.epic-loop/tickets/189/proposals.md`.

## Before opening the PR
- **CI readiness:** lint and `pnpm test` green at `d4ce7a6`; typecheck and build are untouched by a Markdown-only diff.
- **Commit hygiene:** commit this doc. Merge `origin/main` (`57a7eaf`, PR #192) before the PR; it merges clean and the marker deletion survives.
- **Likely reviewer asks:** none beyond finding 1.

## Verdict
**Ready to open the PR with follow-ups.** No finding gates it. Finding 1 (LOW) is a one-sentence fix that finishes #190's surface on the plan path, and finding 2 is one batch wording commit; either can land before the PR or as a follow-up.

## Remediation: 2026-10-22
**Remediation scope:** Nick chose at close-out to fix finding 1 (LOW) in this work, by its remediation brief. Finding 2 (comment hygiene, LOW) stays unfixed and deferred. Finding 1 changes skill text that no test reads, so its proof is the brief's hand trace, then the full checks.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `5095ec0` setlist-controller#58 pre-PR review 5 finding 1: on the plan path, a yes to replacing that also changes a song loses the yes, so the replace question comes back | red then green by hand trace of `.claude/skills/build-set/SKILL.md` (below); full checks green at `5095ec0`: `pnpm lint`, `pnpm typecheck`, `pnpm test` (52 files, 1093 passed, 4 skipped), `pnpm build`, `pnpm test:e2e` (44 passed) | 0 (Markdown only; the staged-diff comment gate prints nothing) | proved by hand trace, per the scope note; no verify agent |
| 2 (LOW, aggregated) | none, deferred | none | none | deferred by Nick's scope choice; every entry stays open for a later round |

**Surface found beyond the brief.** The brief listed `SKILL.md:50` only, and said plan step 3 (`:80`) already carries the consent. `:80` carries it on a transition change only. Its own song-change sentence sent Nick to Ask instead of guess with no carry. So "yes, but pad after song 2", then "swap song 3 for Goodness of God" at "Run it?", relisted the plan with no `--replace`, and the replace question came back: the same defect one answer later. The commit gives `:80` the same clause as `:50`, conditioned on the command already having `--replace`. That condition also covers a `--replace` Nick named up front.

**Hand trace, before the fix (`c14ad77`), red:**
- Brief's proof. A plan rebuild's listing ends `... already exists. The build stops on it unless --replace replaces it.`, so plan step 2 asks to replace (`:50`). Nick answers "yes, but swap song 2 for Goodness of God". `:50` sends a song change to Ask instead of guess (`:117`), and Nick answers "build it from songs I name". Steps step 1 (`:14`) adds `--replace` only when Nick names it up front, so the listing ends `... The build stops on it unless --replace replaces it.` Steps step 4's first bullet (`:18`) then asks the replace question a second time.
- `:80` case. Nick answers "yes, but pad after song 2". Step 3 reruns the listing with `--replace`, and step 2's second bullet asks "Run it?". Nick answers "swap song 3 for Goodness of God", and `:80` sends it to Ask instead of guess. Nick answers "I'll change it in Planning Center". Plan step 1 (`:47`) relists without `--replace`, and `:50` asks the replace question again.

**Hand trace, after the fix (`5095ec0`), green:**
- Brief's proof. Same answers. `:50` now says the yes stands and that `--replace` goes on the listing and the command that follow, by the Steps too. Steps step 1 runs `pnpm build-set --list --replace`, and its last line reads `... already exists, and --replace replaces it.`. Steps step 4's second bullet (`:19`) asks only "Run it?". The command is `pnpm build-set <short names> --replace`, with `goodness` the listed short name for Goodness of God (`:132`).
- Plan-edit route. Same yes. Nick answers "I'll change it in Planning Center", plan step 1 relists with `--replace`, the last line reads `... and --replace replaces it.`, and step 2's second bullet (`:51`) asks only "Run it?".
- `:80` case. The command has `--replace`, so `:80` keeps it on the relisting, and `:51` (or `:19`, by the Steps) asks only "Run it?".
- Must preserve, re-read at `5095ec0`. A song change is still a question under Ask instead of guess at `:50` and `:80`, never a flag. A plain yes still runs at once with no listing (the `:50` sentence and the `:14` exemption are untouched). A "no" with no change still builds nothing. The transition sentence on `:50` and step 3's `--replace` on the rerun (`:80`) are untouched. With no `--replace` on the command, `:80` adds nothing.
- Do not touch, confirmed. The carry across a date or output-root change (`:18`, `:22`) and the 404 wording (`:71`) are unchanged.

### Known regressions, deferred
None.

### Rework briefs
None. No verify pass ran, so there was no rework.
