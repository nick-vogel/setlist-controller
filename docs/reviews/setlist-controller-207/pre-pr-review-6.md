# Pre-PR review: setlist-controller#207 Test gaps: every guard a review left unpinned fails pnpm test when removed, round 6 (stage 2 run 3, round 2)

**Branch:** `setlist-controller-207-unpinned-guards` vs `origin/main` (merge-base `098331d` "Merge pull request #224 from nick-vogel/setlist-controller-207-unpinned-guards")
**Reviewed at:** HEAD `8734234` (setlist-controller#207 pre-PR review 5 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 5 files total against the merge-base, +285 / -6
**Delta under review:** since `55f66df` (setlist-controller#221 The build-set skill gives no fix for the overlap, Count Off, track-count, song and pad problem lines the build prints), the HEAD that `pre-pr-review-5.md` reviewed. The delta is 3 files, +174 / -2: `.claude/skills/build-set/SKILL.md` lines 51 and 72 (`61b84de`, `92df570`), two new describe blocks in `test/build-set-skill-quotes.test.ts` (same commits), and `pre-pr-review-5.md` itself (`c6f0a3d`, `8734234`).
**Reviewed against:** `pre-pr-review-5.md` findings 1 and 2, their briefs, its remediation closure table and its Approach decisions (including the remediation's); `.epic-loop/closeout.md` Decision 2 (Nick opted in to fixing both LOWs in this work). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist, plus no em-dashes in shipped copy (none in SKILL.md).
**Date:** 2026-10-23
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | exit 0, already up to date |
| `pnpm lint` | run at HEAD | exit 0 |
| `pnpm typecheck` | run at HEAD | exit 0 |
| `pnpm test` | run at HEAD | exit 0, 62 files, 1330 passed, 4 skipped |
| `pnpm build` | run at HEAD | exit 0 |
| `pnpm test:e2e` | run at HEAD (builds first, ports the OS assigns) | exit 0, 44 passed |
| Base oracle for the 2 new tests | HEAD's `test/build-set-skill-quotes.test.ts` copied onto a scratch worktree at `55f66df` | both new tests red (`2 failed / 108 passed`); neither old line matches any of the 5 new regexes |
| Strength of the 2 new tests | each fix's remedy cut from the SKILL.md line in a scratch worktree at HEAD (`repro/pre-pr-review-6-mutation-*.diff`), quotes test run | both mutants survive, `110 passed` (findings 2 and 3) |
| Finding 1's claims against the code | finder ran the real `stemProblems` and `templateProblems` (`node --experimental-strip-types`) over rename and move scenarios: two `Click` stems, MT CLICK a single track, KEYS a 2-track group | the line fires for two stems under MT CLICK; renaming one and listing the new name under KEYS clears it; listing it under MT CLICK again keeps the line; leaving it unlisted prints `the stem map has no group for the stem "Click 2".`; moving `Click` under KEYS clears it with no rename (finding 1) |
| Stem map scope | read `stemTargets` (`template.ts:76-82`), `stemProblems` (`checks.ts:59-70`) | keyed by stem name, so a move applies to every song; the line's "for every song" clause holds |
| Single track holds one stem | `templateTargets` (`template.ts:27-28`) | `tracks: [track]`; the new wording holds |
| "the song's project folder" | `fileInSong` (`song.ts:144-148`) needs `RelativePathType` 3 and a path that stays in the folder, resolved from `library/<folder>` (`song.ts:66-68`) | the song's folder is the Live Project folder, so "copies into the song's project folder" holds |
| Live 12 manual | fetched https://www.ableton.com/en/live-manual/12/managing-files-and-sets/ (rung 3, vendor docs domain) | the dialog chooses "which files to copy into the Project based on their location"; external files are those "from Packs, other Projects, the User Library, and files located elsewhere on your computer"; it advises Packs and the User Library need not be collected. SKILL.md:72 matches |
| Conformance | diff read; quotes test; `grep` for em-dash and `Collect All` | only SKILL.md:51 and :72 changed, both quotes word for word, :72 keeps its 7-space `- \`` shape (stem reason test finds 8), each bullet one line, no em-dash, no other line claims Collect All and Save copies everything |
| Scratch cleanup | `git worktree list`; `git status --porcelain` | both scratch worktrees removed; tree holds only this doc and its 2 repro diffs |

**Overall:** Both prior LOW findings are fixed in substance: SKILL.md:51 now gives a single track a remedy, and SKILL.md:72 names the dialog's choice of locations as the Live 12 manual describes it. All five full checks pass. Three LOW gaps remain: the rename clause the remediation added beyond the brief is under-specified, and neither new prose check pins the remedy it was written for. None blocks the PR.

## Approach decisions
- Carried from round 5: SKILL.md quotes are matched against `src/set-builder/*.ts` literals by `test/build-set-skill-quotes.test.ts`; a hole in a printed line is quoted as a placeholder; no sentence before SKILL.md:39 is reworded (setlist-controller#210 pins SKILL.md:32); a Live menu command is named only when grounded in the Live 12 manual.
- Carried from the round 5 remediation: a step 6 fix that has to cover a case its line can print is pinned by a prose check on that bullet, which finds the bullet by its quote and matches the words that name the case. This review sharpens it: the prose check matches the words of the remedy, not only the words that name the case, so cutting the remedy turns it red (findings 2 and 3).
- SKILL.md names a stem map target as "group or single track" (SKILL.md:43, :49); finding 1's fix uses the same words.

## Confirmed Issues
### 1. The rename clause for two same-named stems leaves out where the new name goes, and reads as the only way out — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:51`, the last sentence.
- **Attribution:** introduced by the remediation, `61b84de` (setlist-controller#207 pre-PR review 5 finding 1: ...). The sentence is absent at `55f66df` and at `098331d`; the round 5 closure records it as going "one clause past the recommended diff".
- **Real-world trigger:** a song's set has two stems with one name under a single track, say two `Click` stems under MT CLICK. The build prints `<folder>: MT CLICK needs 2 tracks for this song, and the template has 1.` Claude, following the last sentence, has Nick rename one to `Click 2` and list it in `config/stem-map.json`; listed under MT CLICK again, the next build prints the same line. Separately, when a group with room exists, moving `Click` there clears the line with no rename, which the sentence's "so for those Nick renames one" hides. LOW, capped (docs drift): the build stops, nothing wrong is built, and the sentence before it says "under another name".

**Evidence** — SKILL.md:51 ends: "For either, Nick can move some of those stems under another name in `config/stem-map.json`, which moves them for every song with a stem of that name. Two of the song's stems with one name move together, so for those Nick renames one in the song's set in the library and lists the new name in `config/stem-map.json`."

**Failure mode** — executed by the finder against the real `stemProblems` (`checks.ts:59-70`) with MT CLICK (single track) and KEYS (2-track group): rename one `Click` to `Click 2` and list it under MT CLICK, the line stays; list it under KEYS, no problems; leave it unlisted, `S: the stem map has no group for the stem "Click 2".`; move `Click` under KEYS without a rename, no problems.

**Recommended fix** —
```diff
-... Two of the song's stems with one name move together, so for those Nick renames one in the song's set in the library and lists the new name in `config/stem-map.json`.
+... Two of the song's stems with one name move together, so to part them Nick renames one in the song's set in the library and lists the new name under another group or single track in `config/stem-map.json`.
```
Audit: the diff keeps the quote, both earlier remedies and the "for every song" clause untouched; it narrows "for those" to "to part them" (the rename is needed only to split the pair, since moving both to a group with room already works under "For either") and adds where the new name goes. Nothing is removed. If Nick lists it under a target the song already fills, the next build prints that target's count line, which is the existing backstop.

**Remediation brief**
- **Design intent:** step 6 of the build-set skill is the operator contract Claude follows to turn each printed line into its fix. A stem map name is a template target, a group or a single track (`templateTargets`, `template.ts:18-31`); the stem map maps stem names to targets for every song (`stemTargets`, `template.ts:76-82`), and `stemProblems` counts each song's stems per target. Two stems with one name always land on one target.
- **Full surface:** `.claude/skills/build-set/SKILL.md:51` only, plus finding 3's test, which should pin the new words.
- **Must preserve:** the quote at the start of SKILL.md:51 word for word; "For a group, Nick adds tracks" and "single track" (pinned by `test/build-set-skill-quotes.test.ts:360-361`); the line stays one line, no em-dash; no sentence before SKILL.md:39 reworded.
- **Do not touch:** SKILL.md:52, the overlap count line, which is right to say "group" (Reviewed and Dismissed); SKILL.md:46 and :47 (Minor / nits).
- **Proof:** prose, so the red is finding 3's test: add `expect(line).toMatch(/lists the new name under another group or single track/)` to the test at `test/build-set-skill-quotes.test.ts:357`, see it red, apply the diff, then `pnpm exec vitest run test/build-set-skill-quotes.test.ts` passes.

### 2. The single-track fix's prose check passes with the single-track remedy cut out — LOW
- **Location:** `test/build-set-skill-quotes.test.ts:360-361`.
- **Attribution:** introduced by `61b84de`. The test is round 5 finding 1's red-to-green proof (red at `55f66df`, verified here), so it is kept and strengthened, never deleted.
- **Real-world trigger:** a later edit to SKILL.md:51 drops the "For either, Nick can move ..." sentence, leaving a single track with no remedy again, and `pnpm test` stays green. LOW, capped: a claim of coverage for a LOW docs fix; no user meets it until such an edit lands.

**Evidence** —
```ts
expect(line).toMatch(/single track/);
expect(line).toMatch(/For a group, Nick adds tracks/);
```
The first regex matches the sentence that names the case ("The name is a group, or a single track such as GUIDE ..."), not a remedy.

**Failure mode** — `repro/pre-pr-review-6-mutation-single-track-remedy.diff` cuts SKILL.md:51 at " For either", deleting the only remedy that applies to a single track and the rename clause. Applied in a scratch worktree at HEAD, `pnpm exec vitest run test/build-set-skill-quotes.test.ts` passes 110 of 110.

**Recommended fix** —
```diff
     expect(line).toMatch(/single track/);
     expect(line).toMatch(/For a group, Nick adds tracks/);
+    expect(line).toMatch(/For either, Nick can move some of those stems under another name/);
+    expect(line).toMatch(/lists the new name under another group or single track/);
```
Audit: adds assertions only; the second needs finding 1's wording, so land finding 1's SKILL.md change in the same commit or after this red. Remove nothing.

**Remediation brief**
- **Design intent:** a step 6 prose check pins the remedy of a fix, so cutting the remedy turns `pnpm test` red (Approach decisions). It finds the bullet by its quote, as the stem reason test does (`test/build-set-skill-quotes.test.ts:342-353`).
- **Full surface:** `test/build-set-skill-quotes.test.ts:356-363`.
- **Must preserve:** the two existing assertions and the `find` by quote; the test's comment (it states the why).
- **Do not touch:** the matcher in `test/build-set-skill-quotes.test.ts` and the stem reason test.
- **Proof:** from a scratch worktree at the fixed HEAD, `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-6-mutation-single-track-remedy.diff` then `pnpm exec vitest run test/build-set-skill-quotes.test.ts` must fail; today it passes 110 of 110. The diff targets the current SKILL.md:51, so regenerate it if finding 1's change lands first (cut the line at " For either").

### 3. The outside-file fix's prose check passes with "Nick picks every location" cut out — LOW
- **Location:** `test/build-set-skill-quotes.test.ts:369-371`.
- **Attribution:** introduced by `92df570`. Round 5 finding 2's red-to-green proof (red at `55f66df`), so kept and strengthened.
- **Real-world trigger:** a later edit drops the instruction from SKILL.md:72 and keeps the parenthetical list of locations; `pnpm test` stays green while Claude no longer tells Nick to pick the User Library and Packs. LOW, capped as finding 2.

**Evidence** —
```ts
expect(line).toMatch(/dialog/);
expect(line).toMatch(/User Library/);
expect(line).toMatch(/Packs/);
```
The parenthetical "(Packs, the User Library, other Projects, and elsewhere on the computer)" supplies all three words on its own.

**Failure mode** — `repro/pre-pr-review-6-mutation-pick-every-location.diff` deletes ", so Nick picks every location the stem's files come from, the User Library and Packs included". In a scratch worktree at HEAD the quotes test passes 110 of 110.

**Recommended fix** —
```diff
     expect(line).toMatch(/Packs/);
+    expect(line).toMatch(/Nick picks every location the stem's files come from/);
```
Audit: adds one assertion; removes nothing.

**Remediation brief**
- **Design intent:** as finding 2. The remedy is the instruction to pick every location, since the dialog copies only the locations picked in it (Live 12 manual, Managing Files and Sets).
- **Full surface:** `test/build-set-skill-quotes.test.ts:365-373`.
- **Must preserve:** the three existing assertions, the `find` by quote, the comment; SKILL.md:72 unchanged.
- **Do not touch:** SKILL.md:72's wording, which holds against the manual (What was verified).
- **Proof:** from a scratch worktree at the fixed HEAD, `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-6-mutation-pick-every-location.diff` then `pnpm exec vitest run test/build-set-skill-quotes.test.ts` must fail; today it passes 110 of 110.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- "which moves them for every song with a stem of that name" (SKILL.md:51) — holds: `stemTargets` keys by stem name, and `stemProblems` counts over `Object.keys(stemMap)` for each song.
- "a single track such as GUIDE or MT CLICK, which holds one stem" — holds: `templateTargets` gives a single track `tracks: [track]` (`template.ts:27-28`).
- A song cannot have two stems with one name — it can: `readSong` keeps every audio track by name (`song.ts:39-44`) and no check stops duplicates before `stemProblems`; executed by the finder.
- SKILL.md:52, the overlap count line, still says "group" — right: `slotProblems` returns nothing unless the target is a group (`checks.ts:191-193`).
- "copies into the song's project folder" (SKILL.md:72) — holds: `fileInSong` resolves type 3 paths from the song's folder, which is the Live Project folder.
- A file beside the song's folder that Live stores as type 3 with a climbing path might not be collected (finder, unverified) — the manual counts "any files that are outside the Project folder as external", which the dialog collects by location; `fileInSong` and Live agree that it is outside.
- The dialog's location list in the parenthetical — matches the manual's list of external locations; no default selection is claimed, and the manual names none.
- The two new tests could pass vacuously if the bullet is missing — no: `find` returns `undefined` and `toMatch` throws, which is red.
- The two new tests' comments — load-bearing: each states why the line needs the case (the code path, the manual).

## Minor / nits
- SKILL.md:46 ("the stem map puts under no group. Nick adds the stem to its group") and :47 ("Nick keeps it under one group") say "group" where the target can be a single track. Pre-existing, outside the delta; SKILL.md:43 already says "group or single track it plays in".
- Round 5's Minor / nits stand unchanged (placeholders unpinned, `mockClear`, `readExamples` span, two sanity assertions, trimmed fence lines, `toHaveLength(8)`, "back to step 4" on the plan path, SKILL.md:52 chain, SKILL.md:40 key wording, example 8's exit code and the lateness default). Nick chose not to file them (`.epic-loop/closeout.md` Decision 2).

## Test quality
Tests added in the delta: 2 (`the build-set skill's per-song track-count fix`, `the build-set skill's outside-file fix`). Green against `55f66df`: 0, both red, each round 5 finding's red-to-green proof. Tautology shapes: both are prose checks, by design, since SKILL.md is the deliverable; each pins the words that name the case but not the remedy, so a cut remedy survives (findings 2 and 3). Strengthen both; delete none.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `8734234`; e2e green locally (44 passed).
- **Commit hygiene:** this doc and `repro/pre-pr-review-6-mutation-single-track-remedy.diff` and `repro/pre-pr-review-6-mutation-pick-every-location.diff`, in one commit. Nothing to drop.
- **Likely reviewer asks:** why SKILL.md:72 lists dialog locations (the Live 12 manual, cited in `92df570`); whether the new tests pin the fixes (findings 2 and 3).

## Prior-review closure
`pre-pr-review-5.md` had 2 confirmed findings, both LOW. Fully fixed: 2 in the shipped text (SKILL.md:51 gives a single track a remedy; SKILL.md:72 names the dialog's choice of locations, grounded in the manual). Their proofs are partial: each prose check went red before its fix but does not pin the remedy (findings 2 and 3), and the extra rename clause the remediation added is under-specified (finding 1). Partially fixed: 0. Untouched: 0. Resolved only by a comment or doc edit: 2, which is expected, since both findings were prose in SKILL.md. Prior MEDIUM-or-higher findings left open: 0. Escalated or deferred: none (round 5's closure lists no known regressions).

## Verdict
Ready to open a PR with follow-ups. The epic's End state still holds: all five full checks pass and both round 5 fixes say the right thing. Nothing gates the PR. The Confirmed list shrank to 3 LOWs, all about one sentence and two prose assertions; this is the tail of a converging review, not a new defect class. Remediate them on this branch by opting in (one SKILL.md clause and three test assertions), or leave them.
