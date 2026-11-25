# Pre-PR review: setlist-controller#247 Lights: the set build gives each song cue its ProPresenter background colour

**Branch:** `setlist-controller-247-lights-background-colour` vs `origin/main` (merge-base `93854cf`, "Merge pull request #497 from nick-vogel/setlist-controller-376-one-cue-per-song")
**Reviewed at:** HEAD `a06833e` (setlist-controller#508 Lights: a song owns its chain, and the lights step works past the end of the chain) + 0 files with uncommitted changes, 0 untracked files, 100 files total against `93854cf`, +29234 / −109. 31 commits.
**Reviewed against:** a fresh review of the whole branch (`--fresh`), not a delta. The epic setlist-controller#247, whose body is the spec; the bodies and comments of its closed sub-issues #499 to #505; #508 (open, landed on this branch by `2718a9a`); `pre-pr-review-1.md` and `pre-pr-review-2.md` in this folder, their Approach decisions, and the follow-up collector setlist-controller#509 (#510 to #548). The repo has no `CODING_STANDARDS.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs, so the five rules every review binds apply: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for a fix.
**Date:** 2026-11-13
**Reviewer:** 3 code-review agents + 1 verification agent (base oracle, 5 preserved mutants, 15 new mutants) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `a06833e` | pass |
| Typecheck | `pnpm typecheck` at `a06833e` | pass |
| Unit and integration suites | `pnpm test` at `a06833e`, load average 5 to 9 | 96 files, 3204 passed, 4 skipped, no flake |
| Build | `pnpm build` at `a06833e` | pass |
| Playwright | `pnpm test:e2e` at `a06833e` (builds first) | 138 passed |
| Copy rules | em-dash and en-dash count over every line the branch adds outside `docs/reviews/` | 0 and 0 |
| Scope | `git diff --stat 93854cf -- src/server src/shared web e2e package.json pnpm-lock.yaml` | empty: the server, the page, the shared rules and the dependencies are untouched, as the spec asks |
| Base oracle (tautology audit) | HEAD's whole `test/` copied onto a scratch worktree at `93854cf`, with base `src/`, `scripts/`, `config/`, docs and skill; the 15 test files the branch added or changed run there | 360 new or changed tests: 285 red, 75 green. Of the 75, 61 are tests of the two fakes, which live under `test/` and came with the copy; with the base's own fakes put back, 60 of those are red and 1 is a guard of unchanged behaviour (`test/fake-propresenter.test.ts:504`). The other 14 are read under Test quality: none is a tautology |
| Review 1 finding 1, the fix against its intent | `repro/pre-pr-review-1.test.ts` copied to `test/` on a scratch worktree at `a06833e` | 5 passed. The two chain cases now assert the chain's end (the template's colour goes back into cue 35, and the fourth song's copy is cue 24), so finding 1 of reviews 1 and 2 is fixed by `2718a9a` |
| The chain rule's tests can go red | 15 mutants of `2718a9a` in `song-cues.ts`, `lights.ts` and `eos.ts`, each applied alone on a scratch worktree at `a06833e`, against `pnpm exec vitest run test/set-builder-lights.test.ts -t chain` (28 tests) | all 15 killed: the restore cues cut to one, the link ignored, a hang not running on, a link back not ending the chain, each of the two stops removed, the copy numbered after the song cue, a chain cue of a song with no picture given the song cue's colour, the chain or the restore cues left out of the recordings, a hang left on a copy, the read back after the take-off skipped, the chain lines dropped, a warning for a chain cue, and the hang read from the follow's argument |
| Preserved mutants of reviews 1 and 2 | each diff applied alone at `a06833e`, then `test/set-builder-lights.test.ts` (152 passed with no mutant) | all five still survive: live 152 passed, waits 152 passed, large 152 passed, dark 152 passed, sentences 45 passed of the 45 its filter selects. Three of the five diffs no longer apply as written, since `2718a9a` moved their context; the same mutations are saved as `repro/pre-pr-review-3-mutants-live.diff`, `-waits.diff` and `-sentences.diff`, which apply at `a06833e` |
| Finding 1 | `test/set-builder-lights.test.ts:1576-1626`, green in the suite above, read against `docs/install.md:378` and `test/readme-lights.test.ts:109` | confirmed on the fake Eos: the branch's own test asserts that Closing's intensity on channels 2 and 3 goes from 90 to 80 |
| Findings 2 and 3 | `repro/pre-pr-review-3.test.ts` copied to `test/` on a scratch worktree at `a06833e` | 2 failed, 1 passed: the two cases that assert what the briefs ask for are red, and the Must preserve case is green |
| Finding 3, the second run | `findSongCues` run with `node` on the list a first run leaves (`[1, 11, 22 with a follow, 23]`, four songs) | `the chain of cue 1/22 (song 3, Title 3) runs on into cue 1/23, the cue of song 4, Title 4. A song's chain has to end before another song's cue.` |
| The colour method and the decoder | a finder's throwaway scripts on the pure modules: `colourAt` against a reference conversion over hues −720 to 720 at four saturations; `decodePng` on a made picture under each of the five filters, mixed filters and three IDAT chunks; `pictureHue` on the 11 fixture pictures, twice each | largest difference 8.5e-14; every decode byte-identical; the hues are none ×6, 184, 27, 41, 188 and 6, the same on the second run |
| `findSongCues` on chain shapes | a finder's throwaway scripts: a self link, a link back, a link out of the list, a link to a missing cue, two chains that share a cue, song cues out of list order, `numberBetween` at 22/23, 22.9/23, 22.998/23, 22.999/23 and 9999 | the walk ends on every shape, the problem lines are right, and the numbers are whole thousandths |
| ETC's Block, for finding 1's fix | the page fetched on 2026-11-13 (web search restricted to `etcconnect.com`; there is no ETC skill or documentation server) | "A cue level block causes all tracked values in the cue to be treated as move instructions from an editing standpoint, which prohibits any data changes from tracking into the cue." "Any changes upstream in the cue list will not impact this blocked cue data." The page is for Eos Family v3.3.10 |
| Real Eos, real ProPresenter | not run | the guardrails forbid it; the two fakes stand in |

**Overall:** The branch does what the spec and the eight landed tickets ask, the full checks are green with no flake, and the chain rule of #508 fixes the one MEDIUM of reviews 1 and 2: every mutant of it is killed. The fix brought one thing of its own that the docs deny: a copy numbered past a chain changes what the cue after it tracks, and the install doc still says every level stays as the template has it (finding 1, MEDIUM). Fix that before the PR opens, since #506 makes the template from this doc next. Five more findings are LOW, three of them from #508, and the six LOW findings of review 2 that became tickets #536 to #541 stand unchanged.

## Approach decisions
- Tests of the lights mode run the command as a child process against the fake Eos and the fake ProPresenter and assert what Nick sees and what the show holds (spec, Testing Decisions). A new case follows that seam. Carried from review 1.
- The fake Eos answers only from recordings. Anything else it answers is named as a model in `test/fixtures/eos/README.md`. Carried from review 1.
- A timing test measures arrivals at the fake, never the whole run (precedent: `ec2520a`). Carried from the ticket reviews.
- A sentence added to or changed in a rule section of the build-set skill moves with its pin in `.claude/skills/build-set/traces.md` in the same commit, or with its entry on the exempt list at the end of that file, and `TRACE_COUNT` (`test/build-set-skill.test.ts:20`, 102 today) moves with a new trace (#504). Carried.
- A sentence of the README, the usage text or the install doc that states a rule is pinned by its whole clause, word for word, in the test that reads that file (precedent: `test/readme-lights.test.ts:129`, `test/set-builder-lights.test.ts:2536-2544`). Carried from review 2.
- A changed sentence of the usage text in `src/set-builder/main.ts` wraps its paragraph again at 120 columns, from the changed sentence to the paragraph's end, and changes no other word. Carried.
- A song owns its chain (Nick, 2026-11-13, #508). The copy of an extra song is numbered after the source song's owned cue that stands last in list order. That choice stays: numbering after the last cue fired could put the copy in front of an earlier song's cue when a link goes back in the list. Carried from #508.
- The lights step never sets an intensity, so it does not put back a level that a copy changes in the cue after it. The install doc says what tracks, and tells the designer to block the cue after the last song's chain in the template (ETC's Block). Reversible by a warning line in the summary, which is a proposal and no part of finding 1's fix. Added by this review.
- A chain that cannot be coloured safely stops the run before anything is written, with one line that names the cue (precedent: `src/set-builder/song-cues.ts:74-87`). Findings 2 and 3 follow it. Added by this review.

## Confirmed Issues
### 1. In a week with an extra song, the cue after the last song's chain takes the song cue's levels where the template gave it the chain's, and the install doc says every level stays — MEDIUM
- **Location:** `docs/install.md:378` (the sentence), with `:380` and `:388`; pinned at `test/readme-lights.test.ts:108-109`. The behaviour is `src/set-builder/song-cues.ts:93-108` (the copy's number, past the chain), pinned at `test/set-builder-lights.test.ts:1615-1622`.
- **Attribution:** introduced by `2718a9a` (setlist-controller#508 Lights: a song owns its chain, and the lights step works past the end of the chain). `git log --oneline -S'lastOwned' 93854cf..HEAD -- src/set-builder/song-cues.ts` gives that commit alone. At `ed3a151` the copy stood straight after its source (`let above = thousandths(source.cue);`), so the cue after it tracked the same levels with the copy or without. The sentence came with `fe539c9` (setlist-controller#505 Lights: the install doc describes the lights step and the template show file) and was true until `2718a9a`. The ticket's worker saw it and left it as Eos does it, with a proposal; the doc was not changed.
- **Real-world trigger:** a Sunday with four songs, on a template whose third song cue runs on into a build or a hit, as section 9 of the install doc says to light one. The copy for the fourth song is numbered past the build, so Closing now stands after the copy. Eos stores a level in a cue only where the cue has a move instruction for it, and a level with none tracks from the cue before (the install doc's own citation, Tracking vs. Cue Only). So on every channel where Closing was recorded at the build's level, Closing now comes up at the song cue's level. The house lights are the plain case: a build that brings them up, a Closing that keeps them there. The summary names the copy and says nothing of Closing. MEDIUM, capped: it needs three things at once (an extra song, a chain on the last song cue, and a level Closing tracks that differs between the build and the song cue), no template exists yet (#506 makes it), and what a copy holds as its own on the real console is a model (`test/fixtures/eos/README.md:51`). Downgrade to LOW once the template's cue after each chain is blocked: check in ETCnomad that the cue shows no tracked value.

**Evidence** — `docs/install.md:378`: "It never sets an intensity, and it sets no other channel, so every level stays as the template has it, the house lights included." `test/set-builder-lights.test.ts:1615-1622`:
```ts
    // Closing now stands after the copy, not after the build. Every level it holds as its own reads as before. Channels
    // 2 and 3, whose intensity it does not hold, tracked the build's 90 and now track the copy's 80, cue 22's: the
    // lights step sets no intensity, and a cue tracks what stands before it.
    for (const channel of [2, 3]) {
      expect(before['35']![channel]!.intensity, `cue 35 channel ${channel} before`).toBe(90);
      expect(levels['35']![channel]!.intensity, `cue 35 channel ${channel}`).toBe(80);
    }
```

**Failure mode** — The show holds cue 22 (Song 3, with a follow), cue 23 (a build, channels 2 and 3 at 90) and cue 35 (Closing, which holds no intensity for channels 2 and 3). The set has four songs. After the run the list reads 22, 23, 24, 35, and cue 35 reads 80 on channels 2 and 3 where it read 90. The suite is green at `a06833e` with that test in it, so the doc's sentence and the branch's own test disagree. The spec's stories 29 to 31 ask that every other level and the closing cue stay as the template has them.

**Recommended fix** — Three sentences of `docs/install.md` and their pins. No file under `src/` changes.
- `:378`, replace "so every level stays as the template has it, the house lights included." with "so every level a cue holds as its own stays as the template has it, the house lights included."
- `:380`, after "so an extra song runs on into nothing." add: "The copy stands in front of the cue that followed the last song's chain, so every level that cue does not hold as its own now tracks from the copy, the last song cue's look, and no longer from the last cue of the chain."
- `:388`, after "so the colour the template gives it on the six colour lights does not show." add: "Block the cue that follows the last song's chain, such as Closing, in the template: a cue level block treats every tracked value in the cue as a move instruction, so no change upstream in the cue list reaches it (ETC's [Block](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/12_Cues_and_Cue_Lists/05_Flags/Block.htm)), a copy in front of it in a week with an extra song included."
- `test/readme-lights.test.ts`: `'12_Cues_and_Cue_Lists/05_Flags/Block.htm'` joins the list at `:56-64`; the test at `:98` gains `expect(weekly).toContain('so every level a cue holds as its own stays as the template has it, the house lights included.');`; the test at `:123` gains a `toContain` of the whole new sentence of `:380`; the test at `:151` gains a `toContain` of the whole new sentence of `:388`.

**Remediation brief**
- **Design intent:** the lights step changes two things, a song cue's label and the colour of the six colour lights in the cues a song owns, and puts the colour back into each cue straight after an owned cue, because colour tracks forward in list order. It never sets an intensity (spec, stories 28 to 31), so it cannot put a level back. A copy for an extra song is numbered past its source's chain, so the chain's follow does not fire it; that puts the copy between the chain's last cue and the cue after. The install doc is where the designer learns what the template must hold, and #506 makes the template from it.
- **Full surface:** `docs/install.md:378`, `:380` and `:388`; `test/readme-lights.test.ts:56-64`, `:98-110`, `:123-131` and `:151-165`. `README.md:147` and the usage text say "sets no intensity and no channel but the colour channels", which stays true, so neither changes. The skill does not state the claim.
- **Must preserve:** every pin of `test/readme-lights.test.ts` stays word for word, among them `'never sets an intensity'`, `'the house lights included'`, the whole sentence at `:129` ("Eos copies a follow time and a hang time with the cue, and the lights step takes them off the copy, so an extra song runs on into nothing.") and the two at `:162-163`. Each paragraph of the install doc stays one line. No em-dash. `test/set-builder-lights.test.ts:1576-1626` stays as it is: it pins what the step does.
- **Do not touch:** the copy's number at `src/set-builder/song-cues.ts:93-108`, which is #508's fix and whose mutant is killed; and no intensity write in `src/set-builder/lights.ts`.
- **Proof:** add the four test lines first: `pnpm exec vitest run test/readme-lights.test.ts` then fails in four tests. After the doc edit it passes, `grep -c 'so every level stays as the template has it' docs/install.md` gives 0 where it gives 1 now, and `grep -c '05_Flags/Block.htm' docs/install.md` gives 1 where it gives 0 now.

### 2. In a set with fewer songs, a chain that runs on into a song cue the set does not use takes that cue over, where a full set stops — LOW
- **Location:** `src/set-builder/song-cues.ts:66` and `:78-90`, against `README.md:141` ("A set with fewer songs leaves the other song cues as they are, `Song n` label included"), `docs/install.md:380` ("leaves the unused song cue as it is") and `:421` ("The lights step stops on a chain that runs on into another song's cue").
- **Attribution:** introduced by `2718a9a`: `git log --oneline -S'const owner = new Map' 93854cf..HEAD -- src/set-builder/song-cues.ts`. The ticket's worker chose it ("a song cue of the template the set has no song for is no song's cue"); the three doc sentences were not changed to say so.
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

### 3. A song's last cue that is the cue list's last cue and runs on fires the copy numbered after it, and a second run then stops on the show the first run saved — LOW
- **Location:** `src/set-builder/song-cues.ts:96-99` (the copy's number after the last owned cue) and `:70-80` (the chain ends at the end of the list).
- **Attribution:** the first half is pre-existing on the branch, exposed: at `ed3a151` a copy was already numbered after a last song cue with a follow, the defect of review 1's finding 1 that `2718a9a` fixed for a chain inside the list and left for the list's end ("Not guarded", in the worker's notes). The second half is introduced by `2718a9a`: only since the chain walk does a second run read that follow as a chain into the copy.
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
- **Full surface:** `src/set-builder/song-cues.ts:96-99`; a new case in `test/set-builder-lights.test.ts` beside `:1516`; `.claude/skills/build-set/SKILL.md:160-163`, one more bullet for the line and its fix, with its two sentences on the exempt list of `.claude/skills/build-set/traces.md` as the bullets beside it are (`:5396-5402`); `README.md:147`, the usage text at `src/set-builder/main.ts:156-158` and their pins at `test/set-builder-lights.test.ts:2477` and `:2532`, where the list after "Nothing is written to Eos with" gains the case; `docs/install.md:421`, one clause.
- **Must preserve:** a set that needs no copy on such a list goes through as today (the second case of `repro/pre-pr-review-3.test.ts`). A last cue that runs on by a link is no problem: the link, not the copy, is what it fires. The usage text wraps again at 120 columns from the changed sentence.
- **Do not touch:** `numberBetween` and `written`, cleared under Reviewed and Dismissed.
- **Proof:** `cp docs/reviews/setlist-controller-247/repro/pre-pr-review-3.test.ts test/ && pnpm exec vitest run test/pre-pr-review-3.test.ts; rm test/pre-pr-review-3.test.ts`. The first case under "finding 3" fails now and must pass after, and the second stays green.

### 4. The chain line says a cue "is coloured as that song is" for a song that keeps the template's colour, where the cue keeps its own — LOW
- **Location:** `src/set-builder/lights.ts:347-349`, against `:323`; `.claude/skills/build-set/SKILL.md:144` ("and that cue now holds its song's colour"); `docs/install.md:388` ("takes that song's colour each week").
- **Attribution:** introduced by `2718a9a`: `git log --oneline -S'and is coloured as that song is' 93854cf..HEAD -- src/set-builder/lights.ts`. The worker kept one wording on purpose, since the song's own line says `template colour`.
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
- **Full surface:** `src/set-builder/lights.ts:347-349`; `test/set-builder-lights.test.ts:1470-1486` (assert the new line there); `README.md:130` and its pin at `test/set-builder-lights.test.ts:2515`; `.claude/skills/build-set/SKILL.md:144` (the quoted line, and "that cue now holds its song's colour") with its pins at `.claude/skills/build-set/traces.md:4406`, `:4952` and `:4954`; `docs/install.md:388` with its pin at `test/readme-lights.test.ts:163`.
- **Must preserve:** the line of a song that has a colour stays word for word (`test/set-builder-lights.test.ts:1729-1731` and `:1753`). A show with no chain prints no chain line.
- **Do not touch:** what is recorded into a chain cue (`lights.ts:321-324`), whose mutant is killed.
- **Proof:** the new assertion at `test/set-builder-lights.test.ts:1470` fails before the change to `lights.ts` and passes after; then `pnpm exec vitest run test/set-builder-lights.test.ts test/readme-lights.test.ts test/build-set-skill.test.ts test/build-set-skill-quotes.test.ts`.

### 5. Two sentences of the build-set skill are behind the chain rule — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:144` and `:163`.
- **Attribution:** `:144`'s quoted line came with `2718a9a`. `:163` came with `5fd669d` (setlist-controller#504 The build-set skill carries the lights step) and was made stale by `2718a9a`, which did not touch it.
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

### 6. The new words of two sentences Nick reads have no test that pins them — LOW
- **Prior finding:** review 2's finding 3, carried. It has no ticket in #509, which took the findings of behaviour.
- **Location:** `README.md:143` ("the hue of the most saturated of the picture's large areas that are not near black, never its mean") against the README test at `test/set-builder-lights.test.ts:2523`; `docs/install.md:400` ("it has no large area that is not near black, or the most saturated of those areas is under 5% saturation") against `test/readme-lights.test.ts:221-228`.
- **Attribution:** introduced by `b91fd1d` (setlist-controller#247 pre-PR review 1 finding 2), which added the words with no pin.
- **Real-world trigger:** none today, since both sentences are right. A later edit that drops the words passes every check.

**Evidence** — `test/readme-lights.test.ts:226` reads `expect(colour).toContain('under 5% saturation');`, and no line of `test/set-builder-lights.test.ts` holds the README's sentence.

**Failure mode** — `repro/pre-pr-review-3-mutants-sentences.diff` takes the words out of both files. Applied on a scratch worktree at `a06833e`, `pnpm exec vitest run test/readme-lights.test.ts test/set-builder-lights.test.ts -t "README|install doc|usage text"` gives 45 passed.

**Recommended fix** —
```diff
+    expect(section).toContain("The colour is the hue of the most saturated of the picture's large areas that are not near black, never its mean, at the lights config's `saturation` and full brightness");
```
beside `test/set-builder-lights.test.ts:2523`, and
```diff
+    expect(colour).toContain('the picture has no opaque pixel, it has no large area that is not near black, or the most saturated of those areas is under 5% saturation');
```
beside `test/readme-lights.test.ts:226`.

**Remediation brief**
- **Design intent:** the usage text, the README and the install doc each say what the colour is and when there is no picture, and a test reads each file for the whole clause (Approach decisions).
- **Full surface:** the two test lines. No doc and no file under `src/` changes. Read each sentence in its file first and pin it as it stands there.
- **Must preserve:** `test/readme-lights.test.ts:226` keeps its own line.
- **Do not touch:** the sentences themselves.
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-3-mutants-sentences.diff && pnpm exec vitest run test/readme-lights.test.ts test/set-builder-lights.test.ts -t "README|install doc|usage text"`. It passes now (45 passed), which is the failure, and must fail in two tests after.

### 7. Comment hygiene — LOW (aggregated)
The first seven entries are review 2's finding 9, carried with today's line numbers; it has no ticket. The last three are new, from `2718a9a`.
- `test/fixtures/propresenter/README.md:123` — "`thumbnail-first-request-then-again.json`, `made-transparent.png` and `placeholder-with-marks-14-13.png` are no answer to a path" → "`thumbnail-first-request-then-again.json`, `placeholder-with-marks-14-13.png` and each file named `made-*.png` are no answer to a path".
- `test/set-builder-lights.test.ts:1980` — "a dark warm shadow over an eighth of it" → "a dark warm shadow over 12% of it".
- `src/set-builder/colour.ts:20` — "the water of Ancient Gates, is at 41" → "the water of Ancient Gates, is at 40.6".
- `src/set-builder/png.ts:15-16` — "to follow "the picture cannot be read:" in a problem line." → "The lights mode prints only that the picture cannot be read (lights.ts)."
- `src/set-builder/eos.ts:77-78` — "Eos sends the cue's fire event, as for a Go, and every colour set by hand is gone." → "Eos sends the cue's fire event, as for a Go. Not recorded: whether a colour set by hand and not recorded is still live after it; the fake Eos drops it."
- `docs/install.md:378` — "changes two things in it, and nothing else" → "changes two things in each cue a song owns", with the pin `'and nothing else'` at `test/readme-lights.test.ts:102` moving with it. The next paragraph says what else it writes: a colour recorded back, a copy, a follow taken off.
- `e2e/lights.spec.ts:46` — "A show of a few hundred cues, as the whole library in one cue list, each labelled." → "A show of a few hundred cues, each labelled, to prove the lights' row on a long list."
- `test/fixtures/eos/README.md:258`, and the same claim at `test/fake-eos.ts:60-62` — "A Record Only into such a cue fires nothing either (`chain-record-only-follow`)" → "A Record Only into a cue with a follow fires nothing either (`chain-record-only-follow`); into a cue with a hang, or with a link, that is a model". The recording holds a follow only.
- `test/fake-eos.ts:64-65` — "the notify pair (chain-follow-cleared.json, chain-hang-cleared.json)" → "the notify pair (chain-copy-to-follow.json)". Neither cited file holds a notify.
- `docs/install.md:380` — "Eos copies a follow time and a hang time with the cue" → "Eos copies a follow time with the cue, and the lights step takes a follow time and a hang time off the copy", with the pin at `test/readme-lights.test.ts:129` moving with it. A copy of a cue with a hang is not recorded (`test/fixtures/eos/README.md:52`).

## Carried and tracked
Six LOW findings of `pre-pr-review-2.md` are open tickets under the collector setlist-controller#509, by Nick's close-out of 2026-11-13. Each stands unchanged at `a06833e`, its brief is in `pre-pr-review-2.md`, and none is in this round's remediation scope.

| Ticket | Review 2 finding | Checked at `a06833e` |
| --- | --- | --- |
| #536 | 2, a dark first frame reads `no picture` and the help says to copy a file that is there | `grep -c 'first frame is near black' docs/install.md` gives 0 |
| #537 | 4, losing Live in the middle of a run has no test | `repro/pre-pr-review-3-mutants-live.diff`: 152 passed |
| #538 | 5, the waits the real Eos needs have no test | `repro/pre-pr-review-3-mutants-waits.diff`: 152 passed |
| #539 | 6, the large-area rule, one side of the near-black rule and four fallback paths | `repro/pre-pr-review-1-mutants-large.diff` and `repro/pre-pr-review-2-mutants-dark.diff`: 152 passed each |
| #540 | 7, the skill never runs the lights after a build that exits 1 for the set manifest alone | the skill's step 6 is unchanged |
| #541 | 8, the skill cannot carry `--connections-config`, nor `--show-folder` on a build | `grep -c connections-config .claude/skills/build-set/SKILL.md` gives 0 |

The other tickets of #509 (#510 to #535 and #542 to #548) came from the ticket reviews. The finders had their titles, met several, and found none worse than its title says but for finding 3 above, whose second half is new.

## Prior-review closure
Review 2 (`pre-pr-review-2.md`, at `be48287`) confirmed nine findings: one MEDIUM and eight LOW.
- **Fully fixed: 1.** Finding 1 (MEDIUM, the lights step knew a song by one cue), by `2718a9a`, after Nick's rule and the recording of `ed3a151`. Checked against its intent: the template's colour goes back into the first cue after the chain, a cue no chain reaches keeps its colour, the copy is numbered past the chain with no follow and no hang, the summary and the four docs say the rule, and 15 mutants of it are killed. Nothing was fixed by a comment or a doc alone.
- **Partially fixed: 0.**
- **Untouched: 8, each by decision or by scope.** Findings 2, 4, 5, 6, 7 and 8 are tickets #536 to #541. Findings 3 and 9 have no ticket and are this doc's findings 6 and 7.

The fix left things of its own, which is the pattern: this doc's findings 1 to 5 and the last three entries of finding 7. `song-cues.ts` has now been rewritten once in answer to a review, so no split ticket is called for on that count.

## Needs Further Investigation
Each needs a recording on a test copy of the show, which the guardrails keep out of this run. A, C and D are review 1's, with #545. B of review 2 is settled by the recording of `ed3a151`: a Go To Cue in no time starts no follow and no hang.
### A. A Record Only of the colour that already tracks into a cue, followed by a change to an earlier cue — a recording
The step records in set order, and a link can now put a chain cue before its song cue in the list. If Eos stores nothing for a Record Only whose colour equals what tracks into the cue, an earlier cue's new colour then tracks into the later one.
### C. A colour set by hand before the run — a recording
Whether a colour set by hand and not recorded survives a Go To Cue is not recorded.
### D. A colour channel with no fixture — a read by hand
What Eos answers to `/eos/get/params/<chan>` for an unpatched channel is not recorded.
### E. What the cue after an inserted copy reads, and whether a block holds it — a recording
Finding 1 is proved on the fake's model of a copy. A recording of a Copy To placed after a cue with other levels, with the next cue read before and after, once plain and once blocked, would show what the real console does and whether the install doc's advice holds as ETC's page says.
### F. A link that Eos writes in a form the reader does not know — a recording
`src/set-builder/eos.ts:274-282` reads a link as an int, or as a string with a `/`. A link to a cue with a decimal number is not recorded. If Eos writes it as a string with no `/`, a chain through it stops the run with a false "which is no cue of cue list". The stop writes nothing.
### G. `Follow#` and `Hang#` on a cue with a decimal number, and on a cue that holds both — a recording
The fake answers both, the step sends both to a copy on a decimal number, and no recording holds either. It can ride with #545.

## Reviewed and Dismissed
- The order of the writes: the show's path and LIVE first, `findSongCues` and every ProPresenter read before the first Go To Cue, the template's colours read for every owned cue and every restore cue before any Copy To, then copies, take-offs, labels read back, colours read back, save — read in full by two reviewers, and `progress.written` is right on every stop.
- The chain walk running for ever on a link back, a self link or two chains that share a cue — each visited place is owned before the next step, and every shape was run.
- `numberBetween` and `written` — whole thousandths throughout, run at five edges.
- A follow or a hang taken off a cue that is no copy — the take-off names copy numbers only, and a copy's number is never a cue the show holds.
- The copy numbered after the chain's last cue in list order and not after the last cue fired — by decision (Approach decisions). A list where the two differ needs a link forward and a link back inside one song's chain, which no doc leads to, and it is a named test gap of the #508 review.
- A follow or a hang of 0 ms read as none — `timed` takes 0 and up, and the walk tests a boolean.
- The playlist's date shifted by a time zone — built from the parts of the date string, never from a `Date`.
- Seeds of the colour grouping that are the same colour hiding a small coloured area — run on four made pictures; an empty group keeps its seed and the next round frees the area.
- `colourAt` at a sector edge or the wrap at 360 — run against a reference over 2880 hues.
- The PNG decoder's filters, Paeth ties, several IDAT chunks, sizes that do not match the data, and bad input surfacing as a thrown error the caller catches — run. It checks no CRC, by its head comment.
- A 403 for a picture asked again five times — the usage text says the mode asks again whatever the answer, and the song still ends as `ProPresenter refused the picture`.
- The lights mode reading the songs from the built `.als` and not from the set manifest — by design (`src/set-builder/built-set.ts:8-12`): the manifest has no date and every build replaces it.
- Newest by name in the hour a clock change repeats — Eos names its own saves the same way; dismissed in review 1.
- The recorder's cleanup delete `Delete Cue 1 / 23 Enter Enter` — it ran on 2026-11-12, and the chain run's guard of 2026-11-13 found no cue 23.
- A test that would write to `~/Documents/ETC` — every build in a test passes `--show-folder` or sets `HOME` to its workspace.
- A line of the usage text past 120 columns — the one that is, `src/set-builder/main.ts:102`, is not the branch's.
- The rest of the lists of reviews 1 and 2 stands as written there.

## Minor / nits
- `test/fake-eos.test.ts:1146` and `:1191`: the `it.each` titles end in `($file.json)`, which prints "(undefined)" in four rows.
- `test/fake-eos.ts:614-633`: the fake's Copy To answers with the copy as the command line's cue and does not make it its current cue, where `cue-copy-to.json` shows Eos does. No test rests on it.
- `scripts/eos/record-eos-fixtures.py`: `cue-copy-to` and `cue-copy-to-decimal` copy onto 1/23 and 1/22.5 without the check that the number is free, which `--lights-chain` has (`require_plain`). Every write is still behind the test-copy guard.
- `src/set-builder/propresenter.ts:62-68`: a 200 whose body is no JSON reads as no playlists, or as no presentation for every song. ProPresenter's API answers JSON.
- `src/set-builder/weekly-show.ts:81`: a template show file that is a symlink is not found.
- `src/set-builder/main.ts:454`: `const lights` inside `build()` shadows the function `lights`.
- `test/set-builder-lights.test.ts:753`: the title says "the first cue after the last song cue", the words from before the chain rule; it is true of that show.

## Test quality
Tests added or changed: 360 in 15 files (it.each rows counted singly). Against `93854cf` with HEAD's `test/`: 285 red, 75 green. Tautology shapes found: 0. The 75 green ones:
- 61 are tests of the fake Eos and the fake ProPresenter. With the base's own fakes put back, 60 are red. The one left, `test/fake-propresenter.test.ts:504`, pins that the fake answers as before until a test turns the new session on.
- 9 in `test/build-set-skill.test.ts` (`:104`, `:111`, `:117`, `:208`, `:296` ×5) test the trace parser, `test/build-set-traces.ts`, which is under `test/`.
- 1, `test/build-set-skill-quotes.test.ts:367`, checks that each flag the skill names is in the usage text. On the base's skill it has no lights flag to check; its sibling at `:357` is red.
- 4, `test/set-builder-weekly-show.test.ts:340` ×4, assert that the listings and the skeletons leave the show folder as it was, a criterion of #499. They are green at base because the base makes no weekly show file at all, and they go red when a listing makes one.

None is to delete or rewrite. No test computes its expectation with a helper from `src/`: the colour tests work the red, green and blue out with the test's own `colourOf`. No mock, no snapshot and no call-shaped assertion. Of 20 mutants at `a06833e`, the 15 of the chain rule are killed and the 5 preserved ones survive: they are #537, #538, #539 and finding 6. The doc tests assert wording only, by design, which is why finding 1's false sentence passes them.

## Before opening the PR
- **CI readiness:** the repo has no CI. The full checks are green at `a06833e`: lint, typecheck, 3204 tests, build, 138 Playwright tests.
- **Commit hygiene:** the tree was clean. 31 commits. This doc, `repro/pre-pr-review-3.test.ts` and the three refreshed diffs under `repro/` are the only files to add.
- **Likely reviewer asks:** finding 1's sentence, before #506 makes the template from the install doc. Whether findings 2 to 7 go in one remediation round or join #509. The Mac's user name in three Eos fixtures, which is Nick's call as review 1 said.

## Verdict
Ready with follow-ups: fix finding 1 before the PR opens, and before #506 makes the template.

Finding 1 (MEDIUM) is three sentences of the install doc and four lines of test, with no change under `src/`: the doc promises that every level stays as the template has it, and the branch's own test shows a level of the closing cue change in a week with an extra song. Findings 2 to 7 are LOW and can ship as follow-ups or go in the same round: two stops in `song-cues.ts` for shapes no doc leads to (findings 2 and 3), one summary line (finding 4), two sentences of the skill (finding 5), two lines of test (finding 6) and ten comments (finding 7). Of review 2's nine findings, one is fully fixed, none is half fixed, and eight are untouched: six are tickets #536 to #541, and two are carried here. No CRITICAL and no HIGH was found in a fresh read of the whole branch by three reviewers.

## Remediation — 2026-11-13
Scope: CRITICAL, HIGH and MEDIUM, which is finding 1. Findings 2 to 7 are LOW and are left for Nick on purpose.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `8bde78a` setlist-controller#247 pre-PR review 3 finding 1: the install doc said every level stays as the template has it, where a copy for an extra song changes what the cue after the last song's chain tracks | red→green: `pnpm exec vitest run test/readme-lights.test.ts`, 4 failed and 29 passed with the four test lines added and the doc as it was, 33 passed after the doc edit. `grep -c 'so every level stays as the template has it' docs/install.md` gives 0 where it gave 1, and `grep -c '05_Flags/Block.htm' docs/install.md` gives 1 where it gave 0 | 0 | fixed, proved by execution. No verify agent: the finding is MEDIUM, its proof ran red then green in the repo's runner, and the commit touches no shared computation and no file under `src/` |
| 2 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 3 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 4 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 5 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 6 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 7 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |

The surface of finding 1 was grepped again before the fix and is as the brief lists it: the sentence stands once, in `docs/install.md`, and no other file states that every level stays. The three sentences went in word for word as the Recommended fix gives them. Each paragraph of the install doc is still one line, the commit adds no em-dash and no en-dash, and every earlier pin of `test/readme-lights.test.ts` stands word for word. `test/set-builder-lights.test.ts` is unchanged.

ETC's Block page was fetched again on 2026-11-13 before the sentence went in (a fetch of the page on `etcconnect.com`; there is no ETC skill or documentation server). It reads as the review quotes it, for Eos Family v3.3.10: a cue level block "causes all tracked values in the cue to be treated as move instructions from an editing standpoint, which prohibits any data changes from tracking into the cue", and "Any changes upstream in the cue list will not impact this blocked cue data." Whether a block holds a cue against a copy on the real console is still Needs Further Investigation E.

Line numbers the deferred findings cite, as `8bde78a` leaves them. `docs/install.md:378`, `:380`, `:388`, `:400` and `:421` have not moved, since each paragraph is one line. In `test/readme-lights.test.ts` the four added lines move every later line down: the list of help pages is `:56-65`, `'and nothing else'` (finding 7) is at `:103` and no longer `:102`, the sentence "Eos copies a follow time and a hang time with the cue" (finding 7) is at `:131` and no longer `:129`, the sentence "takes that song's colour each week" (finding 4) is at `:166` and no longer `:163`, and `'under 5% saturation'` (finding 6) is at `:230` and no longer `:226`. Two entries of finding 7 are sentences of the two paragraphs this round changed, "changes two things in it, and nothing else" at `docs/install.md:378` and "Eos copies a follow time and a hang time with the cue" at `:380`. Both stand as they were, and both entries still apply as written.

Checks at `8bde78a`, after `pnpm install --frozen-lockfile`: `pnpm lint` and `pnpm typecheck` pass, the six test files that read the install doc give 68 passed, and `pnpm test` gives 96 files, 3204 passed and 4 skipped, the count of the review, since the commit adds four assertions to tests that were there. No test flaked. `pnpm build` and `pnpm test:e2e` were not run in this round: the commit changes one doc and one Vitest file, and neither is read by the build or by Playwright.

No approach decision was made in this round. The fix follows the two the review recorded: the install doc says what tracks and tells the designer to block the cue, and a sentence that states a rule is pinned by its whole clause.

### Known regressions, deferred
None. The round changed no behaviour.

### Rework briefs
None. No fix was reworked.
