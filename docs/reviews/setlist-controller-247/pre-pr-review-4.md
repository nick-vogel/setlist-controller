# Pre-PR review: setlist-controller#247 Lights: the set build gives each song cue its ProPresenter background colour

**Branch:** `setlist-controller-247-lights-background-colour` vs `origin/main` (merge-base `93854cf`, "Merge pull request #497 from nick-vogel/setlist-controller-376-one-cue-per-song")
**Reviewed at:** HEAD `8816b2d` (setlist-controller#247 pre-PR review 3 remediation closure table) + 0 files with uncommitted changes, 0 untracked files, 105 files total against `93854cf`, +29724 / −109. 34 commits.
**Delta under review:** since `a06833e` (setlist-controller#508 Lights: a song owns its chain, and the lights step works past the end of the chain), the commit `pre-pr-review-3.md` reviewed: 7 files, +493 / −3. Five of them are review 3's own doc and repro files. The reviewed delta is the other 2 files, `docs/install.md` and `test/readme-lights.test.ts`, +7 / −3, all from one commit, `8bde78a` (setlist-controller#247 pre-PR review 3 finding 1: the install doc said every level stays as the template has it, where a copy for an extra song changes what the cue after the last song's chain tracks). Nothing under `src/`, `scripts/`, `config/`, `web/`, `e2e/` or `.claude/` changed, nor `README.md`, `test/set-builder-lights.test.ts`, `test/fake-eos.ts`, `package.json` or `pnpm-lock.yaml`.
**Reviewed against:** `pre-pr-review-3.md` in this folder: its seven findings, its Approach decisions and its remediation closure table of 2026-11-13; the epic setlist-controller#247, whose body is the spec (stories 20 and 26 to 31); the body of #506 (open, the ticket that makes the template from the install doc next). The repo has no `CODING_STANDARDS.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs, so the five rules every review binds apply: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for a fix.
**Date:** 2026-11-13
**Reviewer:** 1 code-review agent + verify pass (delta oracle, 6 doc mutants, 1 fixture mutant, both recommended fixes run red then green)

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `8816b2d` | pass |
| Typecheck | `pnpm typecheck` at `8816b2d` | pass |
| Unit and integration suites | `pnpm test` at `8816b2d`, load average 8 to 11 | 96 files, 3204 passed, 4 skipped, green on the first run, no flake |
| Build | `pnpm build` at `8816b2d` | pass. Review 3's remediation did not run it |
| Playwright | `pnpm test:e2e` at `8816b2d` (builds first) | 138 passed. Review 3's remediation did not run it |
| Copy rules | em-dash and en-dash count over every line the delta adds outside `docs/reviews/`; `git diff --numstat a06833e -- docs/install.md` | 0 and 0; 3 lines out and 3 in, so each paragraph of the install doc is still one line |
| Scope of the delta | `git diff --stat a06833e -- src scripts config web e2e test/set-builder-lights.test.ts test/fake-eos.ts .claude README.md package.json pnpm-lock.yaml` | empty |
| Review 3 finding 1, the fix against its intent | the three sentences read against `src/set-builder/song-cues.ts:93-112`, `test/set-builder-lights.test.ts:1576-1626` and `test/fixtures/eos/README.md:51` by the reviewer and by one finder; `git grep -n -i -E 'stays as the template|every level'` outside `docs/reviews/` | the old promise is gone from every file, the doc now says what tracks and names the block, and nothing it says is contradicted by the code or by the branch's tests. Two things it leaves short are findings 1 and 2 |
| Delta oracle (tautology audit) | on a scratch worktree at `8816b2d`, `docs/install.md` put back as `a06833e` has it, then `pnpm exec vitest run test/readme-lights.test.ts` | 4 failed, 29 passed: the four tests the delta changed, and no other. With the doc as HEAD has it, 33 passed. Not run at `93854cf`: its install doc has no weekly show file subsection (`git show 93854cf:docs/install.md \| grep -c 'The weekly show file'` gives 0), so the four cannot pass there |
| The four new pins can go red | six mutants of `docs/install.md`, each alone on the scratch worktree: `:378` with the old words; the new sentence of `:380` taken out; the new sentence of `:388` taken out; its link pointed at another help page with the words kept; the sentence moved from the template subsection to the weekly one; one word of `:380` changed | all six killed, by one or two tests each |
| ETC's Block page | fetched on 2026-11-13 (a fetch of the page on `etcconnect.com`; there is no ETC skill and no ETC documentation server, so this is the third rung) | for Eos Family v3.3.10: "A cue level block causes all tracked values in the cue to be treated as move instructions from an editing standpoint, which prohibits any data changes from tracking into the cue." "Any changes upstream in the cue list will not impact this blocked cue data." "Block is an editing function. It has no impact on how the data is played back." The sentence of `:388` says what the page says. The page says nothing of a cue made by Copy To in front of a blocked cue, nor of a Record Only into a blocked cue (Needs Further Investigation E and H) |
| Finding 1, its fix | on the scratch worktree: the pin of the brief added to `test/readme-lights.test.ts`, then the doc edit | 1 failed with the pin alone, 33 passed with the doc edit |
| Finding 2, the behaviour | `repro/pre-pr-review-4-cue-36-tracks.diff` applied alone on the scratch worktree, then `pnpm exec vitest run test/set-builder-lights.test.ts -t "numbers a fourth song's copy past the build"` | 3 failed, where 3 pass without it: with cue 36 holding no intensity of its own on channels 2 and 3, cue 36 reads 80 on both after the run where it read 90 |
| Finding 2, its fix | on the scratch worktree: the pin of the brief added, then the doc edit | 1 failed with the pin alone, 33 passed with the doc edit |
| Both fixes against every test that reads the install doc | both doc edits on the scratch worktree, then the six test files that read `docs/install.md` (`test/conflict-markers.test.ts`, `test/readme-chart-settings.test.ts`, `test/readme-lights.test.ts`, `test/readme-charts-check.test.ts`, `test/readme-chart-view.test.ts`, `test/start-up.test.ts`) | 68 passed: no earlier pin breaks |
| Findings 3 and 4 (review 3's 2 and 3) | `repro/pre-pr-review-3.test.ts` copied to `test/` on the scratch worktree at `8816b2d` | 2 failed, 1 passed, as at `a06833e`: both stand |
| Finding 7 (review 3's 6) | `repro/pre-pr-review-3-mutants-sentences.diff` applied at `8816b2d`, then `pnpm exec vitest run test/readme-lights.test.ts test/set-builder-lights.test.ts -t "README\|install doc\|usage text"` | 45 passed: the mutant still survives, so the finding stands |
| Findings 5, 6 and 8 (review 3's 4, 5 and 7) | each cited line grepped at `8816b2d` | each stands, word for word. Line numbers in `test/readme-lights.test.ts` are the ones this doc gives |
| Review 1 finding 1 | `repro/pre-pr-review-1.test.ts` copied to `test/` on the scratch worktree | 5 passed: still fixed |
| The preserved mutants of #537, #538 and #539 | `git apply --check` of `repro/pre-pr-review-3-mutants-live.diff`, `-waits.diff`, `repro/pre-pr-review-1-mutants-large.diff` and `repro/pre-pr-review-2-mutants-dark.diff` at `8816b2d` | each applies. Not run again: no file they change and no test that reads those files changed since `a06833e`, where each gave 152 passed |
| Real Eos, real ProPresenter | not run | the guardrails forbid it; the two fakes stand in, and the fake Eos models no block |

**Overall:** Review 3's one MEDIUM is fixed: the install doc no longer promises that every level stays, it says what a copy changes, and it tells the designer to block the cue after the last song's chain, with ETC's page cited and each sentence pinned. The full checks are green at `8816b2d` on the first run, the build and the Playwright suite included. This round found no CRITICAL, no HIGH and no MEDIUM. Two new LOW findings are about the fix's own sentences, and both are worth settling before #506 makes the template, since #506 follows this doc: the steps for making the template do not carry the block (finding 1), and the doc names one cue where the change tracks on through the cues after it (finding 2). The six LOW findings review 3 left for Nick stand unchanged (findings 3 to 8).

## Approach decisions
- Tests of the lights mode run the command as a child process against the fake Eos and the fake ProPresenter and assert what Nick sees and what the show holds (spec, Testing Decisions). A new case follows that seam. Carried from review 1.
- The fake Eos answers only from recordings. Anything else it answers is named as a model in `test/fixtures/eos/README.md`. Carried from review 1.
- A timing test measures arrivals at the fake, never the whole run (precedent: `ec2520a`). Carried from the ticket reviews.
- A sentence added to or changed in a rule section of the build-set skill moves with its pin in `.claude/skills/build-set/traces.md` in the same commit, or with its entry on the exempt list at the end of that file, and `TRACE_COUNT` (`test/build-set-skill.test.ts:20`, 102 today) moves with a new trace (#504). Carried.
- A sentence of the README, the usage text or the install doc that states a rule is pinned by its whole clause, word for word, in the test that reads that file (precedent: `test/readme-lights.test.ts:132`, `test/set-builder-lights.test.ts:2536-2544`). Carried from review 2.
- A changed sentence of the usage text in `src/set-builder/main.ts` wraps its paragraph again at 120 columns, from the changed sentence to the paragraph's end, and changes no other word. Carried.
- A song owns its chain (Nick, 2026-11-13, #508). The copy of an extra song is numbered after the source song's owned cue that stands last in list order. That choice stays. Carried from #508.
- The lights step never sets an intensity, so it does not put back a level that a copy changes in the cue after it. The install doc says what tracks, and tells the designer to block the cue after the last song's chain in the template (ETC's Block). Reversible by a warning line in the summary, which is a proposal and no part of any fix here. Carried from review 3. Findings 1 and 2 keep it and finish it: the block is a step of making the template, and the doc says how far the change tracks.
- A chain that cannot be coloured safely stops the run before anything is written, with one line that names the cue (precedent: `src/set-builder/song-cues.ts:74-87`). Findings 3 and 4 follow it. Carried from review 3.
- A fix to a pinned sentence of the install doc that can be made by adding a sentence or a clause leaves the pinned sentence word for word and adds its own pin (precedent: `8bde78a`, which added three sentences and broke no pin). Findings 1 and 2 follow it. Added by this review.

## Confirmed Issues
### 1. The steps for making the template leave out the block, which the paragraph above them now asks for — LOW
- **Location:** `docs/install.md:390` (the steps), against `:388` (the block); the steps' test at `test/readme-lights.test.ts:171-180`.
- **Attribution:** introduced by the remediation, `8bde78a`: `git log --oneline -S"Block the cue that follows" 93854cf..HEAD -- docs/install.md` gives that commit alone, and it put the block into `:388` and left the steps as they were. The steps came with `fe539c9` (setlist-controller#505 Lights: the install doc describes the lights step and the template show file) and were whole until then. Review 3's brief for its finding 1 named `:378`, `:380` and `:388` as the full surface and not `:390`, and the remediation followed it word for word, so the gap is the review's. Not a known regression: review 3's closure lists none.
- **Real-world trigger:** #506, which makes the template next. Someone who works down the one sentence of steps labels the three song cues, sets the looks and saves, and never blocks Closing. The body of #506 does not name the block either: it says to "return channels 1 to 3 to the level and colour they have there today" in the cue after the last song cue. An unblocked Closing then changes in a week with an extra song, as review 3's finding 1 says. LOW: the block is asked for one paragraph up in the same subsection, and the harm still needs an extra song, a chain on the last song cue and a level that differs between the two. Upgrade to MEDIUM if the template of #506 is saved without the block: check in ETCnomad that Closing shows the block flag in the cue list.

**Evidence** — `docs/install.md:390`: "To make the template, open a Sunday's show file in ETCnomad, label its three song cues (ETC's [Cue Label](...)), set each one's look, and save the show with File > Save As under the name `Church Sunday template`, in the playback Mac's Eos show folder." `:388` ends: "Block the cue that follows the last song's chain, such as Closing, in the template: ...".

**Failure mode** — The subsection says what the template must hold in one paragraph and how to make it in the next. The second is the list a person follows at the console, and it has four steps: open, label, set the looks, save. The block is in the first paragraph alone, so a template made from the steps lacks it, and no check of the lights step notices: the fake Eos models no block and the summary has no line for it.

**Recommended fix** — One clause of `docs/install.md:390` and one line of test. No file under `src/` changes.
```diff
-set each one's look, and save the show with File > Save As
+set each one's look, block the cue that follows the last song's chain (above), and save the show with File > Save As
```
and, in the test at `test/readme-lights.test.ts:171`, after `:174`:
```diff
+    expect(template).toContain("set each one's look, block the cue that follows the last song's chain (above), and save the show with File > Save As under the name `Church Sunday template`");
```

**Remediation brief**
- **Design intent:** the install doc is where the designer learns what the template must hold and how to make it, and #506 makes the template from it. The lights step never sets an intensity, so it cannot put back a level a copy changes in the cue after the last song's chain; the template's block on that cue is what keeps it (Approach decisions). Every step the template needs is in the steps.
- **Full surface:** `docs/install.md:390`; `test/readme-lights.test.ts:171-180`. `git grep -n -i -E "Save As|label its three song cues"` outside `docs/reviews/` finds the steps in `docs/install.md:390` alone: the README, the usage text and the skill do not list them.
- **Must preserve:** every pin of `test/readme-lights.test.ts:171-180` stays as it is, among them `'File > Save As'`, `'timestamp suffix'` and the two help pages. The sentence of `:388` and its pin at `test/readme-lights.test.ts:167` stay word for word. The paragraph stays one line. No em-dash. No second link to ETC's Block page is needed: "(above)" points at the sentence that cites it, as "(below)" does elsewhere in the section.
- **Do not touch:** the block sentence of `:388`, cleared in this round but for its last clause, which is an entry of finding 8.
- **Proof:** add the test line first: `pnpm exec vitest run test/readme-lights.test.ts` then gives 1 failed, 32 passed. After the doc edit it gives 33 passed, and `grep -c "block the cue that follows the last song's chain (above)" docs/install.md` gives 1 where it gives 0 now. Both were run on a scratch worktree at `8816b2d`.

### 2. The install doc says the cue after the copy tracks the copy, where every cue after it that holds no level of its own tracks it too — LOW
- **Location:** `docs/install.md:380` (the sentence), pinned at `test/readme-lights.test.ts:132`. The behaviour is `src/set-builder/song-cues.ts:93-108`; `test/set-builder-lights.test.ts:163` and `:1614` are why no test shows it.
- **Attribution:** the sentence is introduced by the remediation, `8bde78a` (`git log --oneline -S"now tracks from the copy" 93854cf..HEAD -- docs/install.md` gives that commit alone), word for word from review 3's recommended fix, so the wording is the review's. The behaviour is `2718a9a`'s (setlist-controller#508 Lights: a song owns its chain, and the lights step works past the end of the chain) and was review 3's finding 1. Not a known regression: review 3's closure lists none.
- **Real-world trigger:** the trigger of review 3's finding 1, a Sunday with four songs on a template whose third song cue runs on into a build, with one thing more: a cue after Closing (Meet and greet, Speaker, Walk-out) that holds no value of its own for a level the build and the song cue differ on. A designer who reads `:380` weighs the change for Closing alone and may let it stand; the same level then comes up changed in the cues after it, the house lights under the speaker among them. LOW: the block the doc asks for stops it for every later cue as well, since they then track from a Closing that does not change, and the church's later cues are looks of their own. No upgrade condition.

**Evidence** — `docs/install.md:380`: "The copy stands in front of the cue that followed the last song's chain, so every level that cue does not hold as its own now tracks from the copy, the last song cue's look, and no longer from the last cue of the chain." `test/set-builder-lights.test.ts:163` gives cue 36 its own intensity on channels 2 and 3, the two channels the copy changes:
```ts
  '36': { 2: { intensity: 46 }, 3: { intensity: 46 }, 16: { intensity: 50, colour: FRONT } },
```
so `:1614`, `for (const cue of ['0.5', '36', '37', '38']) expect(levels[cue], ...).toEqual(before[cue]);`, holds on that show.

**Failure mode** — With `repro/pre-pr-review-4-cue-36-tracks.diff` applied, cue 36 holds no intensity of its own on channels 2 and 3. The three cases of `test/set-builder-lights.test.ts:1572-1626` then fail at `:1614`: cue 36 reads 80 on channels 2 and 3 after the run where it read 90. A level tracks forward until a cue with a move instruction for it, which the same paragraph says in its first sentence, so the copy's levels reach every cue up to the first one that holds them.

**Recommended fix** — One sentence added to `docs/install.md:380`, straight after "and no longer from the last cue of the chain.", and one line of test. The sentence before it stays word for word. No file under `src/` changes.
```diff
+ Each cue after it tracks the same change, level by level, up to the first cue that holds that level as its own.
```
and, in the test at `test/readme-lights.test.ts:125`, before `:133`:
```diff
+    expect(weekly).toContain('and no longer from the last cue of the chain. Each cue after it tracks the same change, level by level, up to the first cue that holds that level as its own.');
```

**Remediation brief**
- **Design intent:** the lights step changes a song cue's label and the colour of the six colour lights in the cues a song owns, and never an intensity. A copy for an extra song is numbered past its source's chain, so it stands between the chain's last cue and the cue after, and every level tracks forward from it in list order until a cue holds that level as its own. The install doc says what a copy changes, so the designer can decide what to block (Approach decisions).
- **Full surface:** `docs/install.md:380`; `test/readme-lights.test.ts:125-134`. `:388` needs no change: a block on the cue after the chain holds every later cue too, since they track from it. `README.md:147` and the usage text say "sets no intensity and no channel but the colour channels", which stays true.
- **Must preserve:** the pin at `test/readme-lights.test.ts:132` and every other pin of that file, word for word. The paragraph stays one line. No em-dash. `test/set-builder-lights.test.ts` stays as it is: the fixture's cue 36 is not wrong, it is one show.
- **Do not touch:** the copy's number at `src/set-builder/song-cues.ts:93-108`, and no intensity write in `src/set-builder/lights.ts`. The summary's missing warning is a proposal of review 3 and no part of this fix.
- **Proof:** add the test line first: `pnpm exec vitest run test/readme-lights.test.ts` then gives 1 failed, 32 passed. After the doc edit it gives 33 passed. Both were run on a scratch worktree at `8816b2d`. The behaviour the sentence states: on a scratch worktree, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-4-cue-36-tracks.diff && pnpm exec vitest run test/set-builder-lights.test.ts -t "numbers a fourth song's copy past the build"` gives 3 failed, each on cue 36. That diff is evidence and no part of the fix.

### 3. In a set with fewer songs, a chain that runs on into a song cue the set does not use takes that cue over, where a full set stops — LOW
- **Prior finding:** review 3's finding 2, carried unchanged. Its closure row reads "not worked: LOW, outside this round's scope".
- **Location:** `src/set-builder/song-cues.ts:66` and `:78-90`, against `README.md:141` ("A set with fewer songs leaves the other song cues as they are, `Song n` label included"), `docs/install.md:380` ("leaves the unused song cue as it is") and `:421` ("The lights step stops on a chain that runs on into another song's cue").
- **Attribution:** introduced by `2718a9a`: `git log --oneline -S'const owner = new Map' 93854cf..HEAD -- src/set-builder/song-cues.ts`. The ticket's worker chose it ("a song cue of the template the set has no song for is no song's cue"); the three doc sentences were not changed to say so. Pre-existing at `a06833e`, untouched by the remediation.
- **Real-world trigger:** a template where a song cue has a follow and no build after it, which the install doc warns against. In a week with three songs the step stops and names the cue. In a week with two songs it goes through, records song 2's colour into the cue labelled `Song 3` and prints a chain line for it. LOW, capped: a full week names the template's mistake first, and nothing wrong reaches the service beyond the run-on the template already has. No upgrade condition.

**Evidence** — `src/set-builder/song-cues.ts:66`: `const owner = new Map<number, SongCue>(songCues.map((songCue, at) => [places[at]!, songCue]));`. Only the cues of the set's songs are owned before the chains are walked.

**Failure mode** — `[1 "Song 1", 11 "Song 2" with a follow, 22 "Song 3", 35 "Closing"]`: three songs give `the chain of cue 1/11 (song 2, Title 2) runs on into cue 1/22, the cue of song 3, Title 3. A song's chain has to end before another song's cue.`; two songs give song 2 the chain `["22"]` and the restore cue 35, with no problem.

**Recommended fix** —
```diff
   const owner = new Map<number, SongCue>(songCues.map((songCue, at) => [places[at]!, songCue]));
+  const unused = new Set(cues.map((_, at) => nameKey(songCueLabel.replaceAll(SONG_NUMBER, String(songs.length + at + 1)))));
```
and, in the walk, straight before `owner.set(next, songCue);`:
```diff
+      if (unused.has(nameKey(cues[next]!.label))) {
+        return { problem: `the chain of ${named(songCue)} runs on into cue ${cueList}/${cues[next]!.number}, labelled "${cues[next]!.label}", a song cue this set does not use. A song's chain has to end before another song's cue.` };
+      }
```
with one case through the command beside `test/set-builder-lights.test.ts:1516` (the stops of the chain describe): two songs on that list, exit 1, the one line, and nothing but reads at the fake.

**Remediation brief**
- **Design intent:** a cue is one song's, and a chain that reaches another song's cue stops the run before anything is written, because that follow fires the next song's look during the song. A song cue the set has no song for is still a song cue of the template: it keeps its label and its look for the weeks that use it.
- **Full surface:** `src/set-builder/song-cues.ts:66-90`; the new case in `test/set-builder-lights.test.ts`. The line opens with `the chain of <song cue> runs on into cue`, which `.claude/skills/build-set/SKILL.md:161` already quotes and gives a fix for, and `README.md:147` and the usage text list "a chain that runs on into another song's cue", so no doc changes.
- **Must preserve:** a cue with no label, or any label that is no song cue label, still joins a chain (`test/set-builder-lights.test.ts:1377-1470`). A set with fewer songs and no such chain still gets the unused song cue's own colour recorded back and keeps its label (`test/set-builder-lights.test.ts:912`). The second case of `repro/pre-pr-review-3.test.ts` finding 3 stays green.
- **Do not touch:** the order of the walk, every song cue owned first, which makes the problem name the right song whichever comes first.
- **Proof:** `cp docs/reviews/setlist-controller-247/repro/pre-pr-review-3.test.ts test/ && pnpm exec vitest run test/pre-pr-review-3.test.ts; rm test/pre-pr-review-3.test.ts`. The case under "finding 2" fails now and must pass after.

### 4. A song's last cue that is the cue list's last cue and runs on fires the copy numbered after it, and a second run then stops on the show the first run saved — LOW
- **Prior finding:** review 3's finding 3, carried unchanged. Its closure row reads "not worked: LOW, outside this round's scope".
- **Location:** `src/set-builder/song-cues.ts:96-99` (the copy's number after the last owned cue) and `:70-80` (the chain ends at the end of the list).
- **Attribution:** the first half is pre-existing on the branch, exposed: at `ed3a151` a copy was already numbered after a last song cue with a follow, the defect of review 1's finding 1 that `2718a9a` fixed for a chain inside the list and left for the list's end. The second half is introduced by `2718a9a`: only since the chain walk does a second run read that follow as a chain into the copy. Pre-existing at `a06833e`, untouched by the remediation.
- **Real-world trigger:** none known. The church's cue list has Closing, Meet and greet, Speaker and Walk-out after the song cues. LOW, capped: it takes a template whose last cue is a song's cue with a follow or a hang and no link, and a week with an extra song. Upgrade to MEDIUM if a template ever ends on a song's cue: the follow then fires the extra song's cue in the middle of the song before it.

**Evidence** — `src/set-builder/song-cues.ts:96-99`:
```ts
  const lastOwned = Math.max(...[...owner].flatMap(([place, held]) => (held === source ? [place] : [])));
  const following = cues[lastOwned + 1];
  const below = following === undefined ? PAST_LAST : thousandths(following.number);
  let above = thousandths(cues[lastOwned]!.number);
```

**Failure mode** — `[1 "Song 1", 11 "Song 2", 22 "Song 3" with a follow]` and four songs: the first run numbers the copy 23, makes it, takes its follow off and saves. Cue 22's follow now fires cue 23 by itself. A second run on the saved show answers `The lights step is not done: the chain of cue 1/22 (song 3, Title 3) runs on into cue 1/23, the cue of song 4, Title 4. A song's chain has to end before another song's cue.` and exits 1, where the spec says a second run gives the same result.

**Recommended fix** —
```diff
   const following = cues[lastOwned + 1];
+  const last = cues[lastOwned]!;
+  const extra = songs[lastWithCue + 1];
+  if (extra !== undefined && following === undefined && (last.follow || last.hang) && last.link === null) {
+    return { problem: `cue ${cueList}/${last.number}, the last cue of cue list ${cueList}, runs on by a follow or a hang, and would fire the copy song ${extra.position}, ${extra.title}, needs. Take the follow or the hang off it in the open show and in the template show file.` };
+  }
```
with one case through the command in the chain describe, and the line's rule in the skill.

**Remediation brief**
- **Design intent:** an extra song's copy stands where no follow and no hang fires it. Only the cue straight before the copy can fire it, and that cue either does not run on or runs on by a link, except when it is the list's last cue, where its follow fires nothing until a copy stands after it. Every such case stops before anything is written.
- **Full surface:** `src/set-builder/song-cues.ts:96-99`; a new case in `test/set-builder-lights.test.ts` beside `:1516`; `.claude/skills/build-set/SKILL.md:160-163`, one more bullet for the line and its fix, with its two sentences on the exempt list of `.claude/skills/build-set/traces.md` as the bullets beside it are (`:5396-5402`); `README.md:147`, the usage text at `src/set-builder/main.ts:155-158` and their pins at `test/set-builder-lights.test.ts:2477` and `:2532`, where the list after "Nothing is written to Eos with" gains the case; `docs/install.md:421`, one clause.
- **Must preserve:** a set that needs no copy on such a list goes through as today (the second case of `repro/pre-pr-review-3.test.ts`). A last cue that runs on by a link is no problem: the link, not the copy, is what it fires. The usage text wraps again at 120 columns from the changed sentence.
- **Do not touch:** `numberBetween` and `written`, cleared under Reviewed and Dismissed.
- **Proof:** `cp docs/reviews/setlist-controller-247/repro/pre-pr-review-3.test.ts test/ && pnpm exec vitest run test/pre-pr-review-3.test.ts; rm test/pre-pr-review-3.test.ts`. The first case under "finding 3" fails now and must pass after, and the second stays green.

### 5. The chain line says a cue "is coloured as that song is" for a song that keeps the template's colour, where the cue keeps its own — LOW
- **Prior finding:** review 3's finding 4, carried unchanged. Its closure row reads "not worked: LOW, outside this round's scope".
- **Location:** `src/set-builder/lights.ts:347-349`, against `:323`; `.claude/skills/build-set/SKILL.md:144` ("and that cue now holds its song's colour"); `docs/install.md:388` ("takes that song's colour each week").
- **Attribution:** introduced by `2718a9a`: `git log --oneline -S'and is coloured as that song is' 93854cf..HEAD -- src/set-builder/lights.ts`. The worker kept one wording on purpose, since the song's own line says `template colour`. Pre-existing at `a06833e`, untouched by the remediation.
- **Real-world trigger:** a song with no picture, or no presentation in the playlist, whose cue runs on into a build that holds a colour of its own. Its line reads `template colour`, and the build's line reads "is coloured as that song is". The build keeps the colour it had, which is not the song cue's. Nothing wrong reaches the lights. LOW.

**Evidence** — `src/set-builder/lights.ts:323`: `return [cue, ...chain].map((owned) => ({ cue: owned, colourOf: 'colour' in found ? () => found.colour : held(owned) }));` records each chain cue's own colour for a song with none. `:348` prints the one sentence for every chain cue. `README.md:139` and the usage text say it right: "For a song that keeps the template's colour, each cue of its chain keeps the colour it had."

**Failure mode** — `test/set-builder-lights.test.ts:1470` sets that show up: song 1 has no presentation, and its chain cue 5 holds red 9, green 8, blue 7 on channel 1 where the song cue holds another colour. The run leaves cue 5 as it was and prints the chain line for it. The test asserts the levels and not the line.

**Recommended fix** —
```diff
-  const chainLines = labels.flatMap(({ song, cue, chain }) =>
-    chain.map((owned) => `Cue ${cueList}/${owned} is in the chain of cue ${cueList}/${cue} (song ${song.position}, ${song.title}), and is coloured as that song is.`),
-  );
+  const chainLines = labels.flatMap(({ song, cue, chain }, at) =>
+    chain.map((owned) => `Cue ${cueList}/${owned} is in the chain of cue ${cueList}/${cue} (song ${song.position}, ${song.title}), and ${'colour' in colours[at]! ? 'is coloured as that song is' : 'keeps the colour it had'}.`),
+  );
```
with the second form beside the first wherever the first is quoted.

**Remediation brief**
- **Design intent:** the summary names exactly what the rule changed. A chain cue of a song with a colour takes that colour; a chain cue of a song with none keeps the colour it had, recorded as its own so the song before does not track into it.
- **Full surface:** `src/set-builder/lights.ts:347-349`; `test/set-builder-lights.test.ts:1470-1486` (assert the new line there); `README.md:130` and its pin at `test/set-builder-lights.test.ts:2515`; `.claude/skills/build-set/SKILL.md:144` (the quoted line, and "that cue now holds its song's colour") with its pins at `.claude/skills/build-set/traces.md:4406`, `:4952` and `:4954`; `docs/install.md:388` with its pin at `test/readme-lights.test.ts:166`.
- **Must preserve:** the line of a song that has a colour stays word for word (`test/set-builder-lights.test.ts:1729-1731` and `:1753`). A show with no chain prints no chain line. The block sentence of `docs/install.md:388` and its pin at `test/readme-lights.test.ts:167` stay as they are.
- **Do not touch:** what is recorded into a chain cue (`lights.ts:321-324`), whose mutant is killed.
- **Proof:** the new assertion at `test/set-builder-lights.test.ts:1470` fails before the change to `lights.ts` and passes after; then `pnpm exec vitest run test/set-builder-lights.test.ts test/readme-lights.test.ts test/build-set-skill.test.ts test/build-set-skill-quotes.test.ts`.

### 6. Two sentences of the build-set skill are behind the chain rule — LOW
- **Prior finding:** review 3's finding 5, carried unchanged. Its closure row reads "not worked: LOW, outside this round's scope".
- **Location:** `.claude/skills/build-set/SKILL.md:144` and `:163`.
- **Attribution:** `:144`'s quoted line came with `2718a9a`. `:163` came with `5fd669d` (setlist-controller#504 The build-set skill carries the lights step) and was made stale by `2718a9a`, which did not touch it. Pre-existing at `a06833e`, untouched by the remediation.
- **Real-world trigger:** a session that follows the skill. For `:144`, a copy of a cue with a follow and a hang prints "does not keep the follow and the hang of cue ...: the lights step took them off.", a form the skill does not quote; the session still shows the line as printed. For `:163`, with a chain on the last song cue the problem line names the chain's last cue, and the skill tells Nick to renumber "the cue after" the last song cue, which is the wrong cue. LOW.

**Evidence** — `:144`: "`Cue <list>/<cue> does not keep <the follow or the hang> of cue <list>/<cue>: the lights step took it off.`", against `src/set-builder/lights.ts:354`, which prints `took them off` for both. `:163`: "no cue number is free for the copy of the last song cue that the line names. Nick renumbers the cue after it in the open show, so a number between the two is free.", against `src/set-builder/song-cues.ts:103`, where the line reads `between cue <list>/<the last cue the song owns> and cue <list>/<the cue after it>`.

**Failure mode** — as the trigger says: one line the skill has no words for, and one fix that points at the wrong cue once a chain stands between the song cue and the cue to renumber.

**Recommended fix** — `:144`: after "the lights step took it off.`" add ", or `<the follow and the hang>` with `took them off` when Eos copied both". `:163`: "no cue number is free for the copy of the last song cue between the two cues the line names. Nick renumbers the second of the two in the open show, so a number between them is free."

**Remediation brief**
- **Design intent:** the skill quotes each line the command prints and says what Nick does about it, and names nothing the command lacks (#504).
- **Full surface:** `.claude/skills/build-set/SKILL.md:144` with its pins at `.claude/skills/build-set/traces.md:4406` and `:4952`; `:163` with its two entries on the exempt list at `.claude/skills/build-set/traces.md:5398-5402`, each word for word as the rule splits the sentence.
- **Must preserve:** `TRACE_COUNT` stays 102: no trace is added. `pnpm exec vitest run test/build-set-skill.test.ts test/build-set-skill-quotes.test.ts test/build-set-skill-examples.test.ts` stays green.
- **Do not touch:** the problem line itself, pinned at `test/set-builder-lights.test.ts:1250`.
- **Proof:** the three skill test files above, green; `grep -c 'took them off' .claude/skills/build-set/SKILL.md` gives 1 where it gives 0 now.

### 7. The new words of two sentences Nick reads have no test that pins them — LOW
- **Prior finding:** review 3's finding 6, which was review 2's finding 3, carried unchanged. Its closure row reads "not worked: LOW, outside this round's scope".
- **Location:** `README.md:143` ("the hue of the most saturated of the picture's large areas that are not near black, never its mean") against the README test at `test/set-builder-lights.test.ts:2523`; `docs/install.md:400` ("it has no large area that is not near black, or the most saturated of those areas is under 5% saturation") against `test/readme-lights.test.ts:225-234`.
- **Attribution:** introduced by `b91fd1d` (setlist-controller#247 pre-PR review 1 finding 2), which added the words with no pin. Pre-existing at `a06833e`, untouched by the remediation.
- **Real-world trigger:** none today, since both sentences are right. A later edit that drops the words passes every check.

**Evidence** — `test/readme-lights.test.ts:230` reads `expect(colour).toContain('under 5% saturation');`, and no line of `test/set-builder-lights.test.ts` holds the README's sentence.

**Failure mode** — `repro/pre-pr-review-3-mutants-sentences.diff` takes the words out of both files. Applied on a scratch worktree at `8816b2d`, `pnpm exec vitest run test/readme-lights.test.ts test/set-builder-lights.test.ts -t "README|install doc|usage text"` gives 45 passed.

**Recommended fix** —
```diff
+    expect(section).toContain("The colour is the hue of the most saturated of the picture's large areas that are not near black, never its mean, at the lights config's `saturation` and full brightness");
```
beside `test/set-builder-lights.test.ts:2523`, and
```diff
+    expect(colour).toContain('the picture has no opaque pixel, it has no large area that is not near black, or the most saturated of those areas is under 5% saturation');
```
beside `test/readme-lights.test.ts:230`.

**Remediation brief**
- **Design intent:** the usage text, the README and the install doc each say what the colour is and when there is no picture, and a test reads each file for the whole clause (Approach decisions).
- **Full surface:** the two test lines. No doc and no file under `src/` changes. Read each sentence in its file first and pin it as it stands there.
- **Must preserve:** `test/readme-lights.test.ts:230` keeps its own line.
- **Do not touch:** the sentences themselves.
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-3-mutants-sentences.diff && pnpm exec vitest run test/readme-lights.test.ts test/set-builder-lights.test.ts -t "README|install doc|usage text"`. It passes now (45 passed), which is the failure, and must fail in two tests after.

### 8. Comment hygiene — LOW (aggregated)
The first ten entries are review 3's finding 7, carried with today's line numbers; its closure row reads "not worked: LOW, outside this round's scope". The last is new, from `8bde78a`.
- `test/fixtures/propresenter/README.md:123` — "`thumbnail-first-request-then-again.json`, `made-transparent.png` and `placeholder-with-marks-14-13.png` are no answer to a path" → "`thumbnail-first-request-then-again.json`, `placeholder-with-marks-14-13.png` and each file named `made-*.png` are no answer to a path".
- `test/set-builder-lights.test.ts:1980` — "a dark warm shadow over an eighth of it" → "a dark warm shadow over 12% of it".
- `src/set-builder/colour.ts:20` — "the water of Ancient Gates, is at 41" → "the water of Ancient Gates, is at 40.6".
- `src/set-builder/png.ts:15-16` — "to follow "the picture cannot be read:" in a problem line." → "The lights mode prints only that the picture cannot be read (lights.ts)."
- `src/set-builder/eos.ts:77-78` — "Eos sends the cue's fire event, as for a Go, and every colour set by hand is gone." → "Eos sends the cue's fire event, as for a Go. Not recorded: whether a colour set by hand and not recorded is still live after it; the fake Eos drops it."
- `docs/install.md:378` — "changes two things in it, and nothing else" → "changes two things in each cue a song owns", with the pin `'and nothing else'` at `test/readme-lights.test.ts:103` moving with it. The next paragraph says what else it writes: a colour recorded back, a copy, a follow taken off.
- `e2e/lights.spec.ts:46` — "A show of a few hundred cues, as the whole library in one cue list, each labelled." → "A show of a few hundred cues, each labelled, to prove the lights' row on a long list."
- `test/fixtures/eos/README.md:258`, and the same claim at `test/fake-eos.ts:60-62` — "A Record Only into such a cue fires nothing either (`chain-record-only-follow`)" → "A Record Only into a cue with a follow fires nothing either (`chain-record-only-follow`); into a cue with a hang, or with a link, that is a model". The recording holds a follow only.
- `test/fake-eos.ts:64-65` — "the notify pair (chain-follow-cleared.json, chain-hang-cleared.json)" → "the notify pair (chain-copy-to-follow.json)". Neither cited file holds a notify.
- `docs/install.md:380` — "Eos copies a follow time and a hang time with the cue" → "Eos copies a follow time with the cue, and the lights step takes a follow time and a hang time off the copy", with the pin at `test/readme-lights.test.ts:131` moving with it. A copy of a cue with a hang is not recorded (`test/fixtures/eos/README.md:52`).
- `docs/install.md:388` — "so no change upstream in the cue list reaches it (ETC's [Block](...)), a copy in front of it in a week with an extra song included." → "so no change upstream in the cue list reaches it (ETC's [Block](...)). That includes the copy the lights step puts in front of it in a week with an extra song.", the link as it stands, with the pin at `test/readme-lights.test.ts:167` moving with it. The last clause is easy to read wrong, and it stands after the citation though ETC's page does not speak of a copy (Needs Further Investigation E).

## Carried and tracked
Six LOW findings of `pre-pr-review-2.md` are open tickets under the collector setlist-controller#509, by Nick's close-out of 2026-11-13. Each stands unchanged at `8816b2d`, its brief is in `pre-pr-review-2.md`, and none is in this round's remediation scope.

| Ticket | Review 2 finding | Checked at `8816b2d` |
| --- | --- | --- |
| #536 | 2, a dark first frame reads `no picture` and the help says to copy a file that is there | `grep -c 'first frame is near black' docs/install.md` gives 0 |
| #537 | 4, losing Live in the middle of a run has no test | `repro/pre-pr-review-3-mutants-live.diff` applies; not run again, nothing it reads changed since `a06833e` (152 passed there) |
| #538 | 5, the waits the real Eos needs have no test | `repro/pre-pr-review-3-mutants-waits.diff` applies; not run again, as above |
| #539 | 6, the large-area rule, one side of the near-black rule and four fallback paths | `repro/pre-pr-review-1-mutants-large.diff` and `repro/pre-pr-review-2-mutants-dark.diff` apply; not run again, as above |
| #540 | 7, the skill never runs the lights after a build that exits 1 for the set manifest alone | the skill is unchanged since `a06833e` |
| #541 | 8, the skill cannot carry `--connections-config`, nor `--show-folder` on a build | `grep -c connections-config .claude/skills/build-set/SKILL.md` gives 0 |

## Prior-review closure
Review 3 (`pre-pr-review-3.md`, at `a06833e`) confirmed seven findings: one MEDIUM and six LOW.
- **Fully fixed: 1.** Finding 1 (MEDIUM, the install doc said every level stays, where a copy for an extra song changes what the cue after the last song's chain tracks), by `8bde78a`. Checked against its intent, not its diff: the false promise is gone from every file; `:378` now promises only the levels a cue holds as its own, which the branch's test at `test/set-builder-lights.test.ts:1618` asserts; `:380` says what the copy changes; `:388` tells the designer to block the cue, with ETC's page cited and read again on 2026-11-13; each sentence is pinned whole, and six mutants of the three sentences are killed. It was fixed by a doc alone, which is what the finding was: no behaviour was wrong, and the Approach decision of review 3 keeps the intensity out of the lights step's hands.
- **Partially fixed: 0.** The finder that read the fix called it mostly fixed, with two gaps. Both gaps are in what the new sentences leave unsaid, and neither leaves the doc saying something false, so they are this doc's findings 1 and 2 (LOW) and not a half of the MEDIUM left open.
- **Untouched: 6, each by scope.** Findings 2 to 7 (LOW): each closure row reads "not worked: LOW, outside this round's scope", and they are this doc's findings 3 to 8.

No prior finding of MEDIUM or above is left open, and none was deferred. The fix left small things of its own, which is the pattern a re-review expects: findings 1 and 2 and the last entry of finding 8. The count of confirmed findings has held near seven for two rounds while its content has moved from behaviour to the wording of one doc. That is the review reaching the bottom of the barrel, not the branch failing to improve. The three paragraphs of the install doc at `:378` to `:390` have now been changed twice in answer to a review (`2718a9a` and `8bde78a`). Findings 1 and 2 add to them and rewrite nothing; if a later round finds more in the same paragraphs, the useful step is #506 itself, a template made at the console with the block in it, and not another round of sentences.

## Needs Further Investigation
Each needs a recording on a test copy of the show, which the guardrails keep out of this run. A, C and D are review 1's, with #545. E, F and G are review 3's and are a proposal of that round. H is new.
### A. A Record Only of the colour that already tracks into a cue, followed by a change to an earlier cue — a recording
The step records in set order, and a link can now put a chain cue before its song cue in the list. If Eos stores nothing for a Record Only whose colour equals what tracks into the cue, an earlier cue's new colour then tracks into the later one.
### C. A colour set by hand before the run — a recording
Whether a colour set by hand and not recorded survives a Go To Cue is not recorded.
### D. A colour channel with no fixture — a read by hand
What Eos answers to `/eos/get/params/<chan>` for an unpatched channel is not recorded.
### E. What the cue after an inserted copy reads, and whether a block holds it — a recording
Review 3's finding 1 and this doc's finding 2 are proved on the fake's model of a copy (`test/fixtures/eos/README.md:51`): the fake gives a copy each value of its source that differs from what tracks into its place. `docs/install.md:380` now states "the copy, the last song cue's look" as fact. If Eos copies only the source's move instructions, the copy tracks the build's levels where its source held none, and the cue after it tracks those. A recording of a Copy To placed after a cue with other levels, with the next cue read before and after, once plain and once blocked, would show what the real console does, and whether a cue made by Copy To counts as a change upstream of a blocked cue, which ETC's Block page does not say.
### F. A link that Eos writes in a form the reader does not know — a recording
`src/set-builder/eos.ts:274-282` reads a link as an int, or as a string with a `/`. A link to a cue with a decimal number is not recorded. If Eos writes it as a string with no `/`, a chain through it stops the run with a false "which is no cue of cue list". The stop writes nothing.
### G. `Follow#` and `Hang#` on a cue with a decimal number, and on a cue that holds both — a recording
The fake answers both, the step sends both to a copy on a decimal number, and no recording holds either. It can ride with #545.
### H. A Record Only into a blocked cue — a recording
The install doc now asks for a block on the cue after the last song's chain, and the lights step records the template's colour back into that cue every week with Record Only. Whether the cue keeps its block flag after that Record Only is not recorded, and ETC's Block page does not say. If the flag goes, the block holds for the first week only. The same recording as E can show it: read the cue's flags after a lights run on a blocked Closing.

## Reviewed and Dismissed
- The three sentences of `8bde78a` against the code: the copy is numbered after the source's owned cue that stands last in the list and before the cue that follows it there (`src/set-builder/song-cues.ts:93-108`), which is what `:380` says, and `:421`'s "stands after the last song's chain" agrees.
- The template's colour of the cue after the copy: it is a restore cue (`song-cues.ts:112`), its colour is read before any Copy To and recorded back, so `:380` is right to speak of levels and not of the six lights' colour.
- A promise the fix missed in another file: `git grep` finds no "stays as the template" and no "every level" in the README, the usage text or the skill. `README.md:147` and `src/set-builder/main.ts:154` say "sets no intensity and no channel but the colour channels", which is true.
- The block breaking the lights step: the step reads colour by Go To Cue and a channel read before any write, warns on intensity 0 in song cues only, and finds a copy on a second run by its title. No path reads a tracked flag or depends on a level tracking into the cue after the chain. Whether the block survives the weekly Record Only is H, not a defect found.
- A block on one cue being too little: a later cue tracks from the blocked cue, which does not change.
- The four new pins being redundant: `'never sets an intensity'` and `'the house lights included'` at `test/readme-lights.test.ts:109` and `:111` are inside the whole sentence pinned at `:110`, and the `Block.htm` entry of the help list at `:64` is inside the sentence pinned at `:167`. Each earlier pin was review 3's Must preserve, and each says what its test's title names. They stay.
- The help list at `test/readme-lights.test.ts:56-65` reading the wrong slice: it reads the whole lights section, and the mutant that moves the block sentence to the weekly subsection is killed by the pin at `:167`.
- Two or more extra songs: each copy is numbered after the one before it, all in front of the same following cue, and each is a copy of the last song cue, so "the copy, the last song cue's look" holds for the one that stands last.
- The copy's six colour lights differing from the last song cue's: the paragraph says the copy is then "labelled and coloured like any song cue", and the cue after it gets its colour back.
- The rest of the lists of reviews 1, 2 and 3 stands as written there.

## Minor / nits
- `docs/install.md:380`: with no chain on the last song cue, "no longer from the last cue of the chain" has nothing to name. Nothing changes in that case, since the copy stands straight after its source and holds its look.
- `docs/install.md:378` and `:421` define the chain two ways: "every cue its song cue runs on into" and "its song cue and every cue that cue runs on into". Both came with `2718a9a`. The new sentences read right under either.
- `docs/install.md:378`: "every level a cue holds as its own stays as the template has it" follows "it sets no other channel", so it reads as every other level; taken alone it would cover the colour the same sentence says the step changes.
- The seven nits of review 3 stand as written there.

## Test quality
Tests added: 0. Tests changed: 4, each by one assertion, all in `test/readme-lights.test.ts` (`:52`, `:99`, `:125` and `:154`). Against the install doc as `a06833e` has it, all 4 are red and the other 29 are green. Green against `93854cf`: not run, and none can be, since the base's install doc has no weekly show file or template show file subsection. Tautology shapes found: 0. Each new assertion reads a file the test does not write and compares it with a literal; six mutants of the three sentences are killed, a moved sentence and a changed link among them.

The doc tests assert wording only, by design (Approach decisions), so they hold a sentence in place and cannot say whether it is true. That is why this round's two findings come from reading the sentences against `song-cues.ts` and the fixture, and why finding 2's behaviour is shown by a fixture mutant: the one show the chained-copy test runs on gives cue 36 its own intensity on exactly the two channels the copy changes.

## Before opening the PR
- **CI readiness:** the repo has no CI. The full checks are green at `8816b2d`: lint, typecheck, 3204 tests, build, 138 Playwright tests, each on its first run.
- **Commit hygiene:** the tree was clean. 34 commits. This doc and `repro/pre-pr-review-4-cue-36-tracks.diff` are the only files to add.
- **Likely reviewer asks:** whether the block is in the steps for making the template, and in the body of #506, before the template is made (finding 1). Whether findings 3 to 8 go in one remediation round or join #509. The Mac's user name in three Eos fixtures, which is Nick's call as review 1 said.

## Verdict
Ready to open the PR, with follow-ups. No finding has to be fixed before the PR opens.

No CRITICAL, no HIGH and no MEDIUM: eight LOW, two new and six carried. Of review 3's seven findings, one (the MEDIUM) is fully fixed, none is half fixed, none was fixed by editing a comment, and six LOW are untouched by scope. The two new findings are one clause and one sentence of the install doc with a line of test each, and no change under `src/`; they are worth doing before #506 makes the template, since #506 follows that doc and its own body does not name the block. Findings 3 to 8 can ship as follow-ups or join #509. A fourth round on this branch should not be needed for the code: nothing under `src/` has changed since the fresh review of the whole branch at `a06833e`, and what is left to learn is at the console (Needs Further Investigation E and H).
