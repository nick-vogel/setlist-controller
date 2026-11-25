# Pre-PR review: setlist-controller#58 Planning Center plan, re-review of the review 10 finding 1 fix

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `6f5280d`, "Merge pull request #211 from nick-vogel/setlist-controller-58-planning-center-plan", origin/main at review time)
**Reviewed at:** HEAD `d2c3f60` (setlist-controller#58 pre-PR review 10 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 7 files total against the merge-base, +3419 / -10
**Delta under review:** since `0a227af` (setlist-controller#210 An edit to the build-set skill can break how it builds my set with every check green), the HEAD `pre-pr-review-10.md` reviewed. 6 files, +384 / -2: `d10cd3f` (setlist-controller#58 pre-PR review 10, the doc and its two `repro/review-10-*` files), `88c2b15` (setlist-controller#58 pre-PR review 10 finding 1: "replace it" with a new date at the replace question keeps --replace for a folder Nick was never asked about: one sentence in `.claude/skills/build-set/SKILL.md:95`, trace `209-row-4-replace-it-with-a-new-date` in `traces.md`, `TRACE_COUNT` 51 to 52 in `test/build-set-skill.test.ts`), `d2c3f60` (the closure table).
**Reviewed against:** `pre-pr-review-10.md` finding 1 (its intent and brief), its Approach decisions and its closure table; the commit body of `88c2b15` (the author's hand trace); the repo entry's guardrails. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs; the conformance checklist is the five review rules every repo carries plus the Approach decisions.
**Date:** 2026-10-23
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` | green (exit 0), the review 10 repro files included |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration tests | `pnpm test` | green: 59 files, 1247 passed, 4 skipped (47 s) |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` | green: 44 passed |
| The skill's pins and traces | `pnpm exec vitest run test/build-set-skill.test.ts` (finder) | 64 passed |
| Review 10 finding 1, its named trigger | hand trace of `209-row-4-replace-it-with-a-new-date` against the edited `SKILL.md`, here and by the finder | "replace it, but make it November 1" at a replace question about 2026-11-08 is the yes for 2026-11-08 only; the listing runs again as `pnpm build-set --plan --list --date 2026-11-01` with no `--replace`, its last line is the "stops on it unless --replace" line, and the question is "Replace the set built before?". Closed |
| Traces whose outcome could move | finder grepped every `- ` turn in `traces.md` for "replace" and "rebuild" | 3 answering turns: `190-replace-at-step-5` and `209-row-2-new-date-and-replace-it` answer a "Run it?", so the new sentence does not apply and both stand (`209-row-2-new-date-and-replace-it` still gives `--date 2026-11-01 --replace` and "Run it?"); every "Rebuild ..." turn is an opening request. No trace contradicts the new sentence |
| New sentence against the rest of The yes to replacing | finder read of `SKILL.md:93-99` and the mapping `:113` | consistent with A yes with no change, The consent, When the build ends, Already replacing and No yes, no `--replace`; see finding 1 for the phrase list and Minor for the step 6 scope wording |
| New trace's conventions | finder, against `209-row-4-new-date-on-the-plan-path` | Plan, Set folders, both last lines and the Date line match; `TRACE_COUNT` 52 equals the 52 `## ` headings |
| Step 6 half of the new sentence | `grep -n '^## 209-row-5' .claude/skills/build-set/traces.md`, and read of each row 5 trace's turns | no trace answers a step 6 command with "replace it" or "rebuild it" (finding 2) |
| Flakes | one full `pnpm test` | none |
| Tautology audit | the delta adds no test code; it adds one trace and raises a count | the `88c2b15` body records red first (the pin check failed on the new sentence with the trace and count only, 1 failed, 63 passed); not repeated |

**Overall:** review 10's MEDIUM is closed for its trigger and its intent: at the replace question, "replace it" or "rebuild it" with a new date is now the yes for the folder asked about, and the new date gets its own listing and its own replace question. Every check is green. Two LOWs remain on the fix itself: its phrase list leaves out the mapping row's long form, and its step 6 half went in with no trace. Nothing blocks the PR.

## Approach decisions
- **Carried forward from `pre-pr-review-10.md`:** the yes to replacing is one named section (#197); a build ends when a build command runs, whatever its exit code; the crossing's end point is Nick's #203 Decision. Overturned by Nick for #209: each yes, named `--replace` and step 6 `--replace` is for one set folder (One set folder, `SKILL.md:95`). The replace rule changes only with traces (#210): any change to when a command has `--replace` adds or re-traces the traces that pin the changed sentences, in the same commit, and names them in the commit body. A yes word at a question is the yes, never a named `--replace` for a new folder (`88c2b15`). Pins are option 1 plus a narrow option 2.
- **The yes-word carve-out covers every word the skill reads as naming `--replace`** (this review, finding 1): those are "replace it" and "rebuild it" (`SKILL.md:14`, `:17`) and the mapping row's "rebuild the set I already built" (`:113`). The carve-out sentence names the class, not a closed pair of phrases, so a word added to the mapping later is covered without a second edit.

## Confirmed Issues
### 1. The carve-out lists "replace it" and "rebuild it" but not the mapping row's "rebuild the set I already built" — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:95` (the sentence `In an answer to the replace question or to the command Steps step 6 shows, "replace it" or "rebuild it" is the yes to that question or command, ...`), against `:113`
- **Attribution:** introduced by the remediation `88c2b15`, which added the sentence; `git show 0a227af:.claude/skills/build-set/SKILL.md | grep -c 'names no `--replace` for a new date'` prints 0. A narrowing of review 10 finding 1's fix, not a regression: the pre-fix text gave the same outcome for every phrase.
- **Real-world trigger:** at "Replace the set built before?" about 2026-11-08, Nick answers in the mapping row's words with a new date, "rebuild the set I already built, but make it November 1". LOW, not MEDIUM: the long form names "the set I already built", which said with a date reads as that date's set, so the named reading is often what Nick means; and the sentence's own two phrases cover the short answers Nick gives at a question. The class is consent (MEDIUM cap): upgrade to MEDIUM if Nick answers the replace question in the long form, check by asking him.

**Evidence**
```
:95  ... A `--replace` Nick names in the same answer as the new date or output root ("make it November 1, and replace it") is named for the new folder, so it stays. In an answer to the replace question or to the command Steps step 6 shows, "replace it" or "rebuild it" is the yes to that question or command, for the folder it was about, and names no `--replace` for a new date or output root in the same answer.
:113 | "replace it", "rebuild the set I already built" | `--replace` |
```
**Failure mode** — The carve-out quotes two phrases. "rebuild the set I already built" is the mapping row's own word for `--replace` and is not among them, so at the replace question that answer falls back to the two readings review 10 finding 1 described: by `:113` and `:95`'s pinned sentence it names `--replace` for November 1, which stays, giving `pnpm build-set --plan --list --date 2026-11-01 --replace`, the last line `... 2026-11-01 Sunday already exists, and --replace replaces it.` and only "Run it?". The same holds for words in no list at all ("go ahead and replace, but make it November 1"), where the outcome rests on the agent generalising from two quoted examples. Proved from the text by hand trace (the finder's and this review's); no trace covers any phrase but "replace it".

**Recommended fix** — Make the carve-out name the class, and give it the scope the other three step 6 sentences have ("with it", `:95` sentence 1, `:98`, `:99`):
```diff
-In an answer to the replace question or to the command Steps step 6 shows, "replace it" or "rebuild it" is the yes to that question or command, for the folder it was about, and names no `--replace` for a new date or output root in the same answer.
+In an answer to the replace question or to the command Steps step 6 shows with it, any words for replacing, "replace it", "rebuild it" and "rebuild the set I already built" among them, are the yes to that question or command, for the folder it was about, and name no `--replace` for a new date or output root in the same answer.
```
Update that sentence's pin in `209-row-4-replace-it-with-a-new-date` (`traces.md`, the first line of its Pins block) to the new text, and add one trace, `209-row-4-rebuild-the-set-with-a-new-date`, a copy of `209-row-4-replace-it-with-a-new-date` whose second turn is `- rebuild the set I already built, but make it November 1`, with the same two listings, command, Date line and question, and the same three pins plus the mapping row `| "replace it", "rebuild the set I already built" | \`--replace\` |`. Raise `TRACE_COUNT` in `test/build-set-skill.test.ts` by one.

**Remediation brief**
- **Design intent:** every `--replace` is for one set folder. At a question about a folder (the replace question, or step 6's command with `--replace`), any word for replacing is the yes for that folder; a new date or output root in the same answer gets its own listing without `--replace` and, when that folder exists, its own replace question. At a "Run it?" answer, a `--replace` named with a new date still goes with the new folder (`:95`'s pinned sentence).
- **Full surface:** `SKILL.md:95` (the carve-out sentence only); `traces.md` `209-row-4-replace-it-with-a-new-date` Pins (first line); a new trace after it; `test/build-set-skill.test.ts` `const TRACE_COUNT = 52;`. `grep -c 'names no `--replace` for a new date' .claude/skills/build-set/traces.md` prints 1 today, so no other trace pins the sentence.
- **Must preserve:** `:95`'s pinned sentence "A `--replace` Nick names in the same answer as the new date or output root ..." word for word, and `209-row-2-new-date-and-replace-it` (a "Run it?" answer keeps `--replace` for November 1). `190-replace-at-step-5` ("replace it" at a "Run it?" names `--replace`). `209-row-4-replace-it-with-a-new-date`'s recorded outcome. Adding "with it" keeps the pre-fix reading at a step 6 command that has no `--replace` (a pad, pads-folder or template fix): there "replace it" names `--replace` by the mapping, as at a "Run it?"; that is intended. Every pin stays found exactly once: the new sentence must not repeat an existing pin, so run the test after the edit.
- **Do not touch:** the mapping row `:113` and `:14`/`:17`'s "Replace it" or "rebuild it" up front (they define the naming words; the carve-out refers to them); `:93`'s list of yes words.
- **Proof:** red first: add the new trace and the count only, and `pnpm exec vitest run test/build-set-skill.test.ts` fails on the new trace's first pin; then edit the sentence and the old trace's pin, and it passes (65 tests). Record the hand trace of the new trace in the commit body.

### 2. The step 6 half of the carve-out went in with no trace, and the new trace pins neither sentence whose overlap it settles — LOW
- **Location:** `.claude/skills/build-set/traces.md` (no `209-row-5-*` trace answers step 6's command with "replace it" or "rebuild it"); the Pins block of `209-row-4-replace-it-with-a-new-date`
- **Attribution:** introduced by `88c2b15`.
- **Real-world trigger:** none for a user; an edit to the step 6 half of the carve-out, to `:93`, or to the mapping row `:113` leaves every check green. Test quality: LOW.

**Evidence** — the carve-out applies "to the command Steps step 6 shows", which changes the outcome of `209-row-5-new-date`'s shape when the third turn is "replace it, but for November 8": before `88c2b15` the pinned named-`--replace` sentence kept `--replace` for November 8 with only "Run it?"; now the listing for November 8 runs without it and asks "Replace the set built before?". No trace records either. The new trace's pins are the carve-out, The consent's first sentence and One set folder's rerun sentence; `:93` "A yes with no change ("yes", "yep", "replace it")" and the mapping row are pinned by other traces but not this one, so neither edit flags it for a re-trace. Separately, the `88c2b15` body says `example-9-yes` is "replace it" alone at the replace question; its second turn is `- yes` (`traces.md:28`), and no trace answers the replace question with "replace it" alone.

**Recommended fix** — Add `209-row-5-replace-it-with-a-new-date`, a copy of `209-row-5-new-date` (`traces.md:2393`) whose third turn is `- replace it, but for November 8`, with the same listings, command, Date line, question and Note, and pins: the carve-out sentence, `for Steps step 6, the folder its problem names`, and One set folder's rerun sentence. Add to `209-row-4-replace-it-with-a-new-date`'s Pins the `:93` sentence `**A yes with no change** ("yes", "yep", "replace it") adds \`--replace\` to the command: show it with \`--replace\` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.` and the mapping row. Raise `TRACE_COUNT` by one.

**Remediation brief**
- **Design intent:** as finding 1. The #210 Approach decision: a change to when a command has `--replace` lands with the traces that pin it.
- **Full surface:** `traces.md` (new trace after `209-row-5-new-date`; the Pins of `209-row-4-replace-it-with-a-new-date`); `test/build-set-skill.test.ts` `TRACE_COUNT`. When finding 1 lands first, use its carve-out text in the new pin.
- **Must preserve:** every existing trace's recorded outcome; pins found exactly once in `SKILL.md`.
- **Do not touch:** `209-row-5-steps-switch` and `209-row-5-new-date-later` (review 10 finding 2, deferred to Nick).
- **Proof:** `pnpm exec vitest run test/build-set-skill.test.ts` green with the new count; hand trace of the new trace in the commit body.

## Needs Further Investigation
- None.

## Reviewed and Dismissed
- The carve-out drops a `--replace` Nick named at a step 6 command with no `--replace` (finder F1) — the sentence takes away only a `--replace` "for a new date or output root in the same answer", so "replace it" with no new date still names `--replace` by the mapping; and a step 6 command without `--replace` meets an existing folder only by stopping on it, which step 6 then fixes with the `--replace` command. No outcome moves. The scope wording is a nit, folded into finding 1's diff.
- The carve-out and the pinned sentence before it disagree on "make it November 1, and replace it" (finder F3) — the carve-out is the more specific sentence and follows at once; at a "Run it?" only the pinned sentence applies. Readability only; Minor.

## Minor / nits
- `SKILL.md:95`: the carve-out says "the command Steps step 6 shows" where `:95` sentence 1, `:98` and `:99` say "shows with it". Fixed by finding 1's diff.
- `SKILL.md:95`: the pinned sentence's example "make it November 1, and replace it" sits beside a carve-out that reads the same words the other way at the replace question. A clause such as "so the sentence before holds for an answer to "Run it?"" would say it outright.
- `88c2b15` body: "example-9-yes ("replace it" alone at the replace question)" names a trace whose answer is "yes"; finding 2 records the missing trace.

## Test quality
Tests added: 0 test cases in code; 1 trace (`209-row-4-replace-it-with-a-new-date`), run by the existing parametrised trace test, and `TRACE_COUNT` 51 to 52. Green against `$BASE`: not applicable to the trace's pin check, which is red at base by design (review 10). Tautology shapes: 0. The trace's red-first is recorded in `88c2b15`. Weakness: finding 2.

## Prior-review closure
Against `pre-pr-review-10.md`:
- **Fully fixed: 1.** Finding 1 (MEDIUM): its trigger and its own example phrasings ("replace it, but make it November 1", "rebuild it for November 1") now give the folder asked about the yes and the new date its own replace question; its intent ("a yes word at a question is the yes, never a named `--replace` for a new folder") holds for every yes word in `:93`. Finding 1 here is a LOW widening of the same carve-out to the mapping's long form, which is not a yes word.
- **Partially fixed: 0.**
- **Untouched: 5,** all LOW and deferred by the remediation ("LOW tail, left for Nick"): 2 (two row 5 traces pin a step 6 `--replace` with no yes), 3 (the section lead and worked example 10 give one yes per build), 4 (the 503 trace's CLI check), 5 (the trace parser drops values), 6 (comment hygiene). Their briefs in `pre-pr-review-10.md` still apply as written; finding 2 of that doc's Full surface now also has `209-row-4-replace-it-with-a-new-date` beside it, which it does not touch.
- **Resolved only by a comment or doc edit: 0.**

## Before opening the PR
- **CI readiness:** lint, typecheck, tests and build green at `d2c3f60`; e2e green locally.
- **Commit hygiene:** this doc is the only new file. No scratch left in the tree.
- **Likely reviewer asks:** why the carve-out quotes phrases (finding 1); why `traces.md` carries 52 traces of one section's wording (lane F6.4 in the #210 lane).

## Verdict
Ready to open the PR, with follow-ups. No finding gates it: review 10's MEDIUM is fixed, and this round's two findings are LOW (the carve-out's phrase list, and its step 6 half's missing trace). The confirmed list shrank from one MEDIUM and five LOWs to two LOWs on the fix itself, which is the expected shape for a delta re-review; the five deferred LOWs from review 10 stand for Nick.
