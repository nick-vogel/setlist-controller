# Pre-PR review: setlist-controller#207 Test gaps: every guard a review left unpinned fails pnpm test when removed, round 5 (stage 2 run 3, round 1)

**Branch:** `setlist-controller-207-unpinned-guards` vs `origin/main` (merge-base `098331d` "Merge pull request #224 from nick-vogel/setlist-controller-207-unpinned-guards", so rounds 1 to 4 and sub-issues #80 to #83, #177 and #218 to #220 are already on `main` and out of scope here)
**Reviewed at:** HEAD `55f66df` (setlist-controller#221 The build-set skill gives no fix for the overlap, Count Off, track-count, song and pad problem lines the build prints, the merge of lane commit `867d524`), clean tree: 0 files with uncommitted changes, 0 untracked; 4 files total against the merge-base, +113 / -6
**Delta under review:** none; this is a `--fresh` full review of the branch against its merge-base, the first review of the third /epic-loop run, after sub-issues #221, #222 and #223 landed.
**Reviewed against:** the epic setlist-controller#207 (scope and End state) and the three open sub-issues landed here, #221 (`1a44ab5`, fixes `2118c88` and `867d524`), #222 (`8465b6b`) and #223 (`cc26cbf`), with their acceptance criteria; the lanes' assumptions and proposals in `.epic-loop/tickets/221/`, `222/` and `223/`; `pre-pr-review-4.md` and its Approach decisions. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist, plus no em-dashes in shipped copy (none in the diff).
**Date:** 2026-10-23
**Reviewer:** 1 code-review agent + 1 base-oracle and mutation agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` in the worktree | exit 0, already up to date |
| `pnpm lint` | run at HEAD | exit 0 |
| `pnpm typecheck` | run at HEAD | exit 0 |
| `pnpm test` | run at HEAD | exit 0, 62 files, 1328 passed, 4 skipped |
| `pnpm build` | run at HEAD | exit 0 |
| `pnpm test:e2e` | run at HEAD (builds first, ports the OS assigns) | exit 0, 44 passed |
| Base oracle | HEAD's three changed test files copied onto a scratch worktree at `098331d`, each file run alone | examples 16 of 16 green; start-up 4 of 4 green; quotes 80 of 81, the one red the new stem reason test, and 108 of 108 green once HEAD's SKILL.md is copied in too. Green at base is by design: #221 changed no code, and #222 and #223 pin output and wiring that were already right, so the mutation matrix is their oracle |
| #221 AC mutations | scratch worktree at HEAD: `checks.ts:104` "fades out" to "fades down"; `pads.ts:103` "has no" to "lacks" | both turn `test/build-set-skill-quotes.test.ts` red ("SKILL.md:57 quotes ..., which no line in src/set-builder/ can print", and the same for SKILL.md:39) |
| Every other new quote | one fixed word reworded in each literal the 22 other new quotes stand for (`checks.ts:24`, `:25`, `:52`, `:67`, `:88`, `:91`, `:205` twice; `song.ts:56`, `:90`, `:95` to `:113`, `:124`, `:125`; `pads.ts:128`, `:129`, `:191`) | each turns the quotes test red. One extra mutant stays green: `'the overlap needs'` at `checks.ts:204`, which the skill quotes as the placeholder `<the overlap needs or the overlaps need>` (lane assumption; Minor / nits) |
| #222 AC mutations | `plan-list.ts:43` key and folder fields swapped; `plan-list.ts:82` `'the default'` reworded; `plan-list.ts:78` `pad in ${key}` reworded | first two turn both new examples tests red; the third turns the `--pad 3` test red |
| #223 AC mutations | `start-up.ts:52` `pedalConfigPath` deleted; `start-up.ts:55` `latenessLog` deleted | first turns both log-line tests red (`expected null to be ...`); second turns the flags-given log test red (`expected "vi.fn()" to be called once with arguments`) |
| Lateness default and the `mockClear` | `DEFAULT_LATENESS_LOG` changed (`lateness-log.ts:14`, and the default at `start-up.ts:36`); `test/start-up.test.ts:44` `mockClear` deleted, then 3 runs with `--sequence.shuffle` | all green. The default is unpinned on purpose (lane proposal, guardrails); the clear is not load-bearing, since vitest 5.0.4 defaults `clearMocks: true` (`node_modules/vitest/dist/chunks/defaults.B1FCaFfh.js:57`) and `vitest.config.ts` does not override it |
| Quote to literal mapping | finder ran the quotes matcher against each new SKILL.md quote | each new quote lines up with exactly the literal it stands for, and no line the issue lists is missing |
| Skill prose against the code | read `contentProblems` and `STEM_CONTENT` (`song.ts:93-128`), `overlapProblems`, `introProblems`, `slotProblems` (`checks.ts:76-105`, `:188-206`), `padKey` (`pads.ts:120-130`), `templateTargets` (`template.ts:18-31`) | two fixes do not hold in every case the line covers (findings 1 and 2); the rest hold (Reviewed and Dismissed) |
| Live's menu commands | the #221 commit body grounds them in Ableton's Live 12 manual; reconfirmed `Collect All and Save` against https://www.ableton.com/en/live-manual/12/managing-files-and-sets/ (rung 3, vendor docs domain) | the File menu location holds; the dialog chooses files by location (finding 2) |
| Writes outside the worktree | read both test harnesses | start-up writes only under `dist/start-up-*`; every `--plan --list` run has its own `--output-root` in the scratch folder |
| Scratch cleanup | `git worktree list`; `git status --porcelain` | both scratch worktrees removed; tree clean |

**Overall:** All three sub-issues meet their acceptance criteria, every mutation they name turns `pnpm test` red, and all five full checks pass. Two LOW fixes in the new SKILL.md text do not cover every case their line can print: the per-song track-count fix assumes a group, and the Collect All and Save fix assumes the dialog copies every outside file. Neither blocks the PR.

## Approach decisions
- The quoted-problem-lines check matches SKILL.md quotes against `src/set-builder/*.ts` literals read with the TypeScript compiler API, in `test/build-set-skill-quotes.test.ts` (#219 lane assumption). A gap in what SKILL.md quotes is fixed by quoting the line in SKILL.md, not by loosening the matcher (carried from round 4).
- A hole in a printed line (`${overlaps}` at `checks.ts:204`, `${keyOf}` at `pads.ts:102`, `<counts>` at `:203`) is quoted as a placeholder, so its wording stays unpinned until a code change makes it written text (#221 lane assumption). Kept: #221 is a no-code ticket.
- New step 6 fixes go in as new bullets or sentences; no sentence that predates #221 is reworded, because setlist-controller#210 on epic #58's branch pins `SKILL.md:32` word for word (#221 lane assumption). Findings 1 and 2 reword only lines #221 added, so they conform.
- Fixes in SKILL.md say what Nick changes in the song's set; a Live menu command is named only when grounded in the Live 12 manual on ableton.com (#221 plan and commit `1a44ab5`). Finding 2's fix follows that grounding.
- The skill-examples test runs the command by spawning `pnpm --silent build-set` from the repo root (#82 lane assumption); #222's `--plan --list` tests follow it, with stdout only compared, since the empty scratch folders make the build's own checks exit 1 after the listing (#222 lane assumption).
- The start-up test reads what the server took through its setup routes (`readSetup`), and the lateness log, which has no route, through a `vi.mock` that wraps the real `openLatenessLog` in `vi.fn` (#223 lane assumption).

## Confirmed Issues
### 1. The per-song track-count fix tells Nick to add tracks to a group, but the line also names single tracks such as GUIDE, where adding tracks cannot clear it — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:51`; the line it answers is `src/set-builder/checks.ts:67`.
- **Attribution:** introduced by `1a44ab5` (setlist-controller#221 The build-set skill gives no fix for ...): `git log --oneline -S'needs <n> tracks for this song' 098331d..HEAD` names it, and the line is absent at `098331d`. The lane review recorded it as F2.2 and F3.5 (LOW, left open).
- **Real-world trigger:** Nick lists a second stem under `GUIDE` or `MT CLICK` in `config/stem-map.json` (a spoken-cue stem beside `Guide`, say), or a song's set has two stems with the one name. The build prints `GUIDE needs 2 tracks for this song, and the template has 1.`, and Claude, following step 6, tells Nick to add tracks to the GUIDE group. GUIDE is a single track with no group to add to, so the advice is one he cannot follow; the stem map half of the fix still works. LOW, capped (docs drift): no wrong set is built and the line names the target.

**Evidence** — `stemProblems` loops over every stem map name, single tracks included, and a single track's target holds exactly one track:
```ts
const available = targets.get(name)?.tracks.length;                         // checks.ts:65
return available !== undefined && count > available ? [`${song.folder}: ${name} needs ${count} tracks for this song, ...`] : [];
targets.set(name, { kind, tracks: [track] });                               // template.ts:28, kind 'single track'
```
SKILL.md:51 then reads: "Nick adds tracks to that group in the template, or moves some of the song's stems under another group in `config/stem-map.json`."

**Failure mode** — the suite already prints the line for a single track: `pnpm exec vitest run test/set-builder-stop-rules.test.ts -t "more stems for a single track"` passes on `GUIDE needs 2 tracks for this song, and the template has 1.` (`test/set-builder-stop-rules.test.ts:427-437`). For that line, SKILL.md:51's first remedy does not apply. The overlap variant at SKILL.md:52 is right to say "group": `slotProblems` returns nothing for a target that is no group (`checks.ts:193`).

**Recommended fix** — keep the quote, and split the remedy by target kind:
```diff
-     - `<folder>: <group> needs <n> tracks for this song, and the template has <n>.`: the song has more stems under that name in the stem map than the template has tracks there. Nick adds tracks to that group in the template, or moves some of the song's stems under another group in `config/stem-map.json`.
+     - `<folder>: <group> needs <n> tracks for this song, and the template has <n>.`: the song has more stems under that name in the stem map than the template has tracks there. The name is a group or a single track, such as GUIDE or MT CLICK, which holds one stem. For a group, Nick adds tracks to that group in the template. For either, Nick can move some of those stems under another name in `config/stem-map.json`, which moves them for every song with a stem of that name.
```
Audit: the diff removes no behaviour. The quote is unchanged, so the quotes test still pins it to `checks.ts:67`; both remedies survive, the template one now scoped to a group, which is the only case where it worked; the added "for every song" clause states what the stem map already does (`stemTargets`, keyed by stem name). The line stays one line. If the fix itself is wrong (a template where a single track and a group share the name), the build stops earlier on `The template has a group and a single track named "<name>".` (SKILL.md:49), so this line never reaches Nick in that state.

**Remediation brief**
- **Design intent:** step 6 of the build-set skill is the operator contract Claude follows to turn each printed problem line into its fix. Each bullet quotes the line as the code prints it (pinned by `test/build-set-skill-quotes.test.ts`) and then names what Nick changes. A stem map name is a template target, either a group (many tracks) or a single track (one track, `template.ts:27-28`); the per-song count check covers both kinds, the overlap count check groups only.
- **Full surface:** `.claude/skills/build-set/SKILL.md:51` only. No test or `src/` change.
- **Must preserve:** the quote at the start of SKILL.md:51 word for word; `test/build-set-skill-quotes.test.ts` (108 passed, including `SKILL.md:51 <folder>: <group> needs <n> tracks for this song, ...`); the stem reason test's count of 8 bullets under SKILL.md:64 (unaffected, but it reads by indent); no sentence before SKILL.md:39 reworded (Approach decisions). The line stays one line, no em-dash.
- **Do not touch:** SKILL.md:52, the overlap count line, which is right to say "group" (Reviewed and Dismissed); the matcher in `test/build-set-skill-quotes.test.ts`.
- **Proof:** no test can pin prose advice. Before: `pnpm exec vitest run test/set-builder-stop-rules.test.ts -t "more stems for a single track"` shows the single-track form of the line, which SKILL.md:51 answers with a group-only remedy. After: the same, plus `pnpm exec vitest run test/build-set-skill-quotes.test.ts` passes 108 of 108, and SKILL.md:51 gives a remedy that applies to `GUIDE needs 2 tracks ...`.

### 2. The outside-file fix says Collect All and Save copies every outside file in, but its dialog copies only the locations Nick picks, so a stem playing a User Library or Pack file can stay outside — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:72`; the line it answers is `src/set-builder/song.ts:113` (`refers to a file outside the song's folder`), decided by `fileInSong` (`song.ts:144-148`).
- **Attribution:** introduced by `1a44ab5`: the line is absent at `098331d`. The finder raised it from memory; it is confirmed here against the vendor manual.
- **Real-world trigger:** a stem's clip plays a loop or one-shot dragged in from the User Library or an installed Pack. Nick runs Collect All and Save with those locations left out of the dialog, which the manual itself says he need not collect, builds again, and gets the same line. One wasted build per round, with the line still naming the stem. LOW, capped (docs drift): the build stops, nothing wrong is built.

**Evidence** — SKILL.md:72: "Nick copies it in with Collect All and Save in Live's File menu, which copies the files a set uses from outside its project folder into that folder." Ableton's Live 12 manual, Managing Files and Sets (https://www.ableton.com/en/live-manual/12/managing-files-and-sets/, fetched 2026-10-23): "the Collect All and Save dialog lets you choose which files to copy into the Project based on their location", naming Packs, the User Library, other Projects and files elsewhere on the computer, and it advises that files from Packs or the User Library need not be collected. The manual names no defaults.

**Failure mode** — a stem clip whose file sits in the User Library keeps a path that is not relative to the song's project (`fileInSong` needs `RelativePathType` 3 inside the folder), so after a Collect All and Save that left the User Library unchecked, `song.ts:113` prints the same line. Proved by the manual's description of the dialog; not executed, since it needs Live.

**Recommended fix** —
```diff
-       - `refers to a file outside the song's folder...`: a clip plays a file from outside the song's folder. Nick copies it in with Collect All and Save in Live's File menu, which copies the files a set uses from outside its project folder into that folder.
+       - `refers to a file outside the song's folder...`: a clip plays a file from outside the song's folder. Nick copies it in with Collect All and Save in Live's File menu, choosing in its dialog every location the file can come from, the User Library and Packs included, so the files the set uses are copied into the song's project folder.
```
Audit: the diff keeps the quote, the menu path and the outcome; it adds the dialog choice. If Nick still misses a location, the next build prints the same line, which is the existing backstop.

**Remediation brief**
- **Design intent:** a stem must hold only audio clips whose files live in the song's own folder, because the builder copies clips as they are (`STEM_CONTENT`, `song.ts:94-114`). Step 6's fix for each stem reason says what Nick changes in the song's set; a Live command is named only when grounded in the Live 12 manual (Approach decisions).
- **Full surface:** `.claude/skills/build-set/SKILL.md:72` only.
- **Must preserve:** the quote `refers to a file outside the song's folder...` at the start of the bullet, its 7-space indent and `- \`` shape (the stem reason test at `test/build-set-skill-quotes.test.ts:342-353` finds the 8 reason bullets by `/^ {7}- \`[a-z]/` and bans "next/later/another build" in them); the menu path "Live's File menu". One line, no em-dash.
- **Do not touch:** the other seven reason bullets (SKILL.md:65-71) and the Unfreeze Track and Ungroup Tracks menu paths, grounded in `1a44ab5` (Reviewed and Dismissed).
- **Proof:** prose, so no red test. After the fix, `pnpm exec vitest run test/build-set-skill-quotes.test.ts` passes 108 of 108, and SKILL.md:72 names the dialog choice the manual page above describes. Ground any added wording in that page, and say so in the commit.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- The frozen stem fix says the same build names each other reason the stem has (SKILL.md:65) — holds: `contentProblems` emits one line per matching `STEM_CONTENT` reason (`song.ts:127`), and `test/set-builder-stop-rules.test.ts:553-554` prints `is frozen` and `has a warped clip` for one stem in one build. The quotes test comment that cites it is accurate.
- The Count Off fix (SKILL.md:57) — holds: `findIntro` needs a `Count Off` locator and a locator after it, whatever its name, and `introProblems` fires only for an overlap or a pad into the song, so "make it a gap" clears it.
- The overlap Ending fix offers only a gap (SKILL.md:55) — right: a pad needs an Ending too (`checks.ts:122`).
- The overlap track-count line says "group" (SKILL.md:52) — right: `slotProblems` skips a target that is no group (`checks.ts:193`). Leave it as is when fixing finding 1.
- The pad key fallback (SKILL.md:40) — matches `padKey` (`pads.ts:120-130`): the key of the song after the pad, or of the last song for a pad after it.
- The no-locators fix asks for `Count Off` and `Ending` on every song (SKILL.md:61) — harmless: a song with locators and no named End gets one added by the timeline, and overlaps and pads need both names.
- The Live menu paths, Ungroup Tracks and Unfreeze Track in the Edit menu, Collect All and Save in the File menu — grounded in the Live 12 manual per the `1a44ab5` commit body; the File menu location reconfirmed here.
- The module-level `vi.mock` of `lateness-log.ts` changes the other start-up tests — no: `...real` keeps every other export, and all 4 tests pass, 3 shuffled runs included.
- `vi.restoreAllMocks()` strips the `vi.fn(real.openLatenessLog)` implementation — no: the finder's probe showed the wrapper still returns the real log after a restore, and the server still opens it.
- The `--pad 3` test's `startsWith('3. ')` could match `13. ` — no, it is a prefix test; an empty prefix fails `toHaveLength(1)`.
- An unclosed fence or a second set-name fence makes the plan test vacuous — no: `readExamples` throws at collection, which fails the file.
- The start-up and examples tests are green at base — by design, not vacuous: the mutation matrix turns each red (rows above).

## Minor / nits
- `'the overlap needs'` and `'the overlaps need'` at `checks.ts:204`, `the key of <folder>, ` at `pads.ts:102`, and each share's wording in `<counts>` at `:203` are holes the skill quotes as placeholders, so rewording them stays green (mutant `the overlap wants` survives). A logged #221 assumption; pinning them needs a code change, which #221 excludes.
- `test/start-up.test.ts:44` `vi.mocked(openLatenessLog).mockClear()` is not load-bearing: vitest 5.0.4 clears mocks before each test by default, and deleting the line keeps all 4 tests green. The lane's recorded reason ("`vi.restoreAllMocks()` keeps `vi.fn` history") is not what makes it redundant. Harmless as a guard against a config change.
- `readExamples` searches for the quoted `--pad 3` song line to the end of the worked examples, not the end of example 8 (`test/build-set-skill-examples.test.ts:84-88`); a later example's `N. ...` span could be picked up if example 8's were deleted. The result would be red, not vacuous.
- `expect(examples.planListing.lines).not.toEqual([])` and `expect(examples.planListing.padLine).not.toBe('')` (`:163-164`) cannot fail on their own: `readExamples` already throws on no plan fence, and the span regex needs `\d+\. `.
- Section lines are trimmed (`:49`), so stray white space inside the SKILL.md plan fence goes unseen; white space in the command's output still fails.
- The stem reason test's `toHaveLength(8)` (`test/build-set-skill-quotes.test.ts:351`) counts SKILL.md bullets, not `STEM_CONTENT`; a ninth reason in `song.ts` would not ask for a ninth bullet. The quotes test checks skill to code only, by design.
- SKILL.md:50, :52, :55 and :57 send a command change "back to step 4", which on the plan path is plan step 3 (`--gap <n>`); SKILL.md:91 already routes plan-path build checks through step 6 in general terms, and SKILL.md:36 has the same shape from before #221.
- SKILL.md:52's "makes one of those song changes a gap or a pad" may not clear the line when the change picked is an early one in a chain of three; worded as an option (lane F3.10).
- SKILL.md:40's "and the name gives none" fits the no-key form; for the not-a-note-name form the name gives a key that is no note name.
- Example 8's "It exits 0" and the lateness log's default path are unchecked; both are lane proposals (`.epic-loop/tickets/222/proposals.md`, `223/proposals.md`).

## Test quality
Tests added: 3 (`build-set-skill-examples` 2, `build-set-skill-quotes` 1), plus 3 assertions in 2 existing `start-up` tests. Red at `$BASE`: the stem reason test, through SKILL.md alone. Green at `$BASE`, by design: the 2 examples tests and the start-up assertions, which pin output and wiring that were already right; the mutation matrix is their oracle, and every mutant the three sub-issues name is killed, plus all 22 other new quotes. Tautology shapes: none. The lateness spy wraps the real function and the unit under test is `startUp`; the stem reason test reads prose because SKILL.md is the deliverable. Weak spots: the unpinned holes and the two sanity assertions (Minor / nits). Strengthen nothing before the PR; delete none.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `55f66df`; e2e green locally (44 passed).
- **Commit hygiene:** lane commits and merges, one subject per ticket; this doc. No repro files: finding 1's proof is an existing suite test and finding 2's is the vendor manual.
- **Likely reviewer asks:** why the new examples and start-up tests pass at base (the mutation matrix); whether #221, #222 and #223 close with the PR (open on GitHub, landed here); round 4's findings 1 and 3, which #223 and #221 now fix (mutants `start-up.ts:52`, `:55` and `pads.ts:103` red).

## Verdict
Ready to open a PR with follow-ups. The epic's End state holds for this run: every mutation #221, #222 and #223 name turns `pnpm test` red, the new quotes are each pinned to their literal, and all five full checks pass. Nothing gates the PR. Findings 1 and 2 are LOW one-line SKILL.md wording fixes, each scoped to a line #221 added; remediate them on this branch by opting in, or file them as a follow-up.

## Remediation, 2026-10-23
Remediation scope: Nick opted in, at the run 3 end report on 2026-10-23, to fixing LOW findings 1 and 2 in this work instead of filing them. The Minor / nits stay unfixed.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `61b84de` setlist-controller#207 pre-PR review 5 finding 1: The per-song track-count fix tells Nick to add tracks to a group, but the line also names single tracks such as GUIDE | red→green: `pnpm exec vitest run test/build-set-skill-quotes.test.ts` (new test "gives a fix for a single track as well as a group" red before the SKILL.md change, 109 of 109 after); `-t "more stems for a single track"` in `test/set-builder-stop-rules.test.ts` still prints the single-track line | 1 (the test's why: the line comes for a single track too) | proved by execution |
| 2 (LOW) | `92df570` setlist-controller#207 pre-PR review 5 finding 2: The outside-file fix says Collect All and Save copies every outside file in, but its dialog copies only the locations Nick picks | red→green: `pnpm exec vitest run test/build-set-skill-quotes.test.ts` (new test "names the dialog's choice of locations, the User Library and Packs included" red before, 110 of 110 after); wording grounded in https://www.ableton.com/en/live-manual/12/managing-files-and-sets/ (rung 3, vendor docs domain), fetched 2026-10-23 | 1 (the test's why: the dialog copies only the locations it picks) | proved by execution |

Full checks after both commits, after `pnpm install --frozen-lockfile`: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 0 (62 files, 1330 passed, 4 skipped), `pnpm build` 0, `pnpm test:e2e` 0 (44 passed). No verify agent: both fixes are LOW, prose only, with executed red→green proofs and green preserve-suites.

### Known regressions, deferred
None.

### Rework briefs
None.

### Approach decisions (remediation)
- A step 6 fix that has to cover a case its line can print is pinned by a prose check on that bullet in `test/build-set-skill-quotes.test.ts`, in the shape of the stem reason test (`the build-set skill's stem reason fixes`): find the bullet by its quote, then match the words that name the case. Findings 1 and 2 each add one such test.
- Finding 1 goes one clause past the recommended diff: the finding's own trigger names a song with two stems of one name, which the stem map cannot part (it is keyed by stem name), so the bullet adds that Nick renames one in the song's set and lists the new name in `config/stem-map.json`.
- Finding 2 lists the dialog's locations as the Live 12 manual names them (Packs, the User Library, other Projects, elsewhere on the computer), and claims no default selection, since the manual names none.
