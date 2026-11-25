# Pre-PR review: setlist-controller#247 Lights: the set build gives each song cue its ProPresenter background colour

**Branch:** `setlist-controller-247-lights-background-colour` vs `origin/main` (merge-base `93854cf`, "Merge pull request #497 from nick-vogel/setlist-controller-376-one-cue-per-song")
**Reviewed at:** HEAD `be48287` (setlist-controller#247 pre-PR review 1 remediation closure table) + 0 files with uncommitted changes, 0 untracked files, 86 files total against `93854cf`, +23040 / −108.
**Delta under review:** since `e173d9a` (setlist-controller#504 The build-set skill carries the lights step), the commit `pre-pr-review-1.md` reviewed: 16 files, +544 / −41. Five of them are review 1's own doc and repro files. The reviewed delta is the other 11 files, +66 / −41, all from one commit, `b91fd1d` (setlist-controller#247 pre-PR review 1 finding 2: a near-black area of the picture won as its most saturated one, so a dark frame gave the lights a vivid colour). Under `src/` it touches `src/set-builder/colour.ts` and the usage text in `src/set-builder/main.ts`, and nothing else.
**Reviewed against:** `pre-pr-review-1.md` in this folder: its eight findings, its Approach decisions and its remediation closure table of 2026-11-13; the epic setlist-controller#247, whose body is the spec ("The colour method", stories 11 to 14 and 36); `test/fixtures/propresenter/README.md`. The repo has no `CODING_STANDARDS.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs, so the five rules every review binds apply: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for a fix.
**Date:** 2026-11-13
**Reviewer:** 1 code-review agent + 1 verification agent (delta oracle, 8 mutants) + verify pass (2 new mutant diffs, 1 pixel check of the made pictures)

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `be48287` | pass |
| Typecheck | `pnpm typecheck` at `be48287` | pass |
| Unit and integration suites | `pnpm test` at `be48287`, load average 5 to 9 | 96 files, 3148 passed, 4 skipped, no flake |
| Build | `pnpm build` at `be48287` | pass |
| Playwright | `pnpm test:e2e` at `be48287` (builds first) | 138 passed |
| What the delta touches | `git diff --stat e173d9a` | 16 files; outside `docs/reviews/` they are `README.md`, `docs/install.md`, `src/set-builder/colour.ts`, `src/set-builder/main.ts`, `test/fake-propresenter.ts` (one comment), three made PNGs, `test/fixtures/propresenter/README.md`, `test/readme-lights.test.ts` and `test/set-builder-lights.test.ts`. `lights.ts`, `eos.ts`, `song-cues.ts`, `png.ts`, `weekly-show.ts`, the fake Eos and the build-set skill are byte for byte as review 1 read them |
| The usage text's new wrap | lines 100 to 165 of `src/set-builder/main.ts` at `e173d9a` and at `be48287`, each joined to one word a line and compared with `diff`; the width of each line | the only words that differ are the ones the fix names ("that are not near black", "it has no large area that is not near black, when the most saturated of those areas"); no line of the paragraph passes 120 columns |
| Copy rules | em-dash count over every line the delta adds outside `docs/reviews/` | 0 |
| Review 1 finding 2, the fix against its intent | `repro/pre-pr-review-1.test.ts` "finding 2" on a scratch worktree at `be48287`: 3 passed (they were red at `e173d9a`). `pictureHue` of `e173d9a` and of `be48287` run over the 11 PNG files of `test/fixtures/propresenter/2026-11-12/` | fixed. The three made pictures change (273 to none, 0 to none, 27 to 184) and the other eight give what they gave: none, none, none, none, 27, 41, 188, 6. Each file gives the same answer twice |
| Edges of the new filter | `pictureHue` on made buffers: one dark pixel, one bright pixel, an empty buffer, a buffer of 3 bytes, 100 pixels at red 19 and at red 20, 96% dark with 4% grey, 90% dark with 10% red | none, 20, none, none, none and 0, none, 0. A group no pixel joined never reaches the brightness test, and the guard before the `reduce` is the one path that could have thrown |
| The made pictures against their written rule | each of the three `made-*.png` files of the fix decoded and compared pixel by pixel with the rule in `test/fixtures/propresenter/README.md` | 0 pixels differ in each; 400 by 225, 8-bit RGBA, every pixel opaque, filter 0 on every line; 92,091, 871 and 1,589 bytes, as written. The noise is drawn red, then green, then blue for each pixel |
| Delta oracle | the delta's two test files, the three made PNGs and the fixture README copied onto a scratch worktree at `e173d9a`; `pnpm exec vitest run test/set-builder-lights.test.ts test/readme-lights.test.ts` | 6 failed, 150 passed. The six are the three new picture cases (hue 273, hue 0, hue 27) and the three tests that pin the changed sentences of the usage text, the README and the install doc. No new or changed test is green on the old code |
| Mutants of the fix | five mutants of `colour.ts` on a scratch worktree at `be48287`, each against the whole of `test/set-builder-lights.test.ts` (124 passed with no mutant), and each over the 11 PNG files | `DARK` at 0: killed by the three new cases. The guard before the `reduce` deleted: killed by the two black frames, whose line reads "the picture cannot be read". `Math.min` for `Math.max`: survives, every hue the same (finding 6). `DARK` at 42: survives, Ancient Gates gives 184 for 188, inside the test's 170 to 200 (Test quality). The 5% share dropped from the new filter: survives, every hue the same (finding 6) |
| Review 1 finding 1 | `repro/pre-pr-review-1.test.ts` "finding 1" at `be48287` | 2 passed: `after` is still `'23'` and the four cues are still `['1', '11', '22', '22.5']`, so the finding stands as review 1 wrote it |
| Review 1 findings 3, 4 and 5 | `repro/pre-pr-review-1-mutants-live.diff`, `-waits.diff` and `-large.diff`, each applied alone on a scratch worktree at `be48287` | each applies with no offset error, and `test/set-builder-lights.test.ts` gives 124 passed under each, so all three stand |
| Review 1 findings 6 and 7 | `git diff --stat e173d9a -- .claude` (empty); `grep -c connections-config .claude/skills/build-set/SKILL.md` (0) | the skill is unchanged, so both stand |
| Finding 3 | `repro/pre-pr-review-2-mutants-sentences.diff` on a scratch worktree at `be48287`, then the tests that read the README, the install doc and the usage text; then 14 test files run together, every one that names either doc but the lights file, `test/eos.test.ts` and `test/fake-eos.test.ts`, with the three of the skill | 44 passed and 112 skipped by the filter; 427 passed. Nothing goes red when the new words are taken out of two sentences |
| Finding 6, the near-black rule | `repro/pre-pr-review-2-mutants-dark.diff` on a scratch worktree at `be48287`; a made buffer with a bright red fifth on pale grey-blue under both | 124 passed with the mutant. The made buffer gives hue 6 at `be48287` and hue 211 under the mutant, so one made picture would kill it |
| Finding 2 | `docs/install.md:400`, `.claude/skills/build-set/SKILL.md:147` and the trace at `.claude/skills/build-set/traces.md:4762-4796` read against `src/set-builder/colour.ts:71-74` and the two black frames' summary lines in `test/set-builder-lights.test.ts:1530-1571` | confirmed by reading |
| Tautology audit | the delta oracle above, and the three new cases read with their helpers | none of the shapes: the two rows assert the exact reason "no picture, Blossom_01_4K.mp4" and the template's colour in cue 11; the teal case checks its levels with the test's own `colourOf`, not the app's `colourAt`; `answerThumbnails(YES_AND_AMEN, [], file)` serves the made file on every ask, the five asks again included |
| Real Eos, real ProPresenter | not run | the guardrails forbid it; the two fakes stand in |

**Overall:** The fix of review 1's finding 2 does what its brief asked and nothing else: a near-black area no longer gives a hue, every recorded picture keeps its hue, and the full checks are green with no flake. No defect of behaviour is new. One MEDIUM remains, review 1's finding 1, which waits on Nick's rule for a song cue's chain and is not fixed in place. The fix left three small things behind: the help for a `no picture` line does not cover a dark first frame (finding 2), the new words of two sentences have no test (finding 3), and three comments (finding 9). Review 1's six LOW findings were left for Nick on purpose and stand unchanged.

## Approach decisions
- Tests of the lights mode run the command as a child process against the fake Eos and the fake ProPresenter and assert what Nick sees and what the show holds (spec, Testing Decisions). A new case follows that seam. A picture no recording holds is a made PNG, named as made in `test/fixtures/propresenter/README.md`, served through `answerThumbnails` (precedent: `made-transparent.png`, and the cases at `test/set-builder-lights.test.ts:1643`). Carried from review 1.
- The colour method stays the spec's: the most saturated of the large areas, at the configured saturation. "Large area" means an area that is not near black, by the one constant `DARK` in `src/set-builder/colour.ts`. Reversible by deleting the constant. Carried from review 1, and done in `b91fd1d`.
- The fake Eos answers only from recordings. A test that needs Eos to be late, or to leave Live, drives the fake with a knob in the style of `holdLabels`, `holdCopies`, `holdColours` and `holdSaves` (`test/fake-eos.ts:116-156`) and `emit` (`test/fake-eos.ts:187`), and sends only lines a recording holds. Carried from review 1.
- A timing test measures arrivals at the fake, never the whole run (precedent: `ec2520a`, "setlist-controller#502 review pass 1 finding 1", and the test at `test/set-builder-lights.test.ts:1625`). Carried from the ticket reviews.
- Which cue ends a song's chain is not decided, and no fix of finding 1 is made in place without that decision. Carried from review 1.
- A sentence added to a rule section of the build-set skill gets a trace in `.claude/skills/build-set/traces.md` in the same commit, and `TRACE_COUNT` (`test/build-set-skill.test.ts:20`) moves with it (#504). Carried from the ticket.
- A made picture is a file `made-<what it shows>.png` in `test/fixtures/propresenter/2026-11-12/`, 400 by 225, 8-bit RGBA, with the rule for its pixels written out in `test/fixtures/propresenter/README.md` so it can be made again, and a test serves it on Yes and Amen's thumbnail with `answerThumbnails`. A made picture that must be no picture is one more row of the list at "a song with no picture" in `test/set-builder-lights.test.ts`; one that must give a hue gets a case of its own beside it (precedent: `made-teal-dark-shadow.png` and the case at `test/set-builder-lights.test.ts:1573`). Carried from the remediation of 2026-11-13.
- The sentences Nick reads say "large areas that are not near black" and give no number. The number, 20 of 255 on a group's brightest channel, lives in `src/set-builder/colour.ts` alone, with the comment that says why. Carried from the remediation of 2026-11-13.
- A changed sentence of the usage text in `src/set-builder/main.ts` wraps its paragraph again at 120 columns, from the changed sentence to the paragraph's end, and changes no other word. Carried from the remediation of 2026-11-13.
- A sentence of the README or the install doc that states a rule of the colour method is pinned by its whole clause, word for word, in the test that reads that file (precedent: `test/set-builder-lights.test.ts:2106` for the README, `test/readme-lights.test.ts:191` for the install doc). Added by this review.
- What a `no picture` line means for a dark first frame is stated as a fact, with no new routine: the song keeps the template's colour unless the first slide gets another background. Reversible by deleting the sentence. Added by this review.

## Confirmed Issues
### 1. The lights step knows a song by one cue, so a chain after a song cue gets the wrong colour, and an extra song's copy lands inside the last song's chain — MEDIUM
- **Prior finding:** review 1's finding 1, carried and not new. Its row in review 1's closure table reads "escalated: split ticket recommended", and it is a proposal in the run's records. Nothing it names changed since `e173d9a`.
- **Location:** `src/set-builder/song-cues.ts:49-59` (where a copy is numbered) and `:65-66` (`after`); `src/set-builder/lights.ts:294` (the template's colour recorded into `after`); `src/set-builder/eos.ts:93` (`EosCue` holds a number and a label, no follow, hang or link); against `docs/install.md:419`.
- **Attribution:** introduced by the branch, before `e173d9a`. `git log -S'const following = cues' 93854cf..HEAD -- src/set-builder/song-cues.ts` gives `7762b55` (setlist-controller#503 Lights: a fourth song copies the last song cue, a short set leaves one alone, and a second run changes nothing), and `git log -S'recordings.push({ cue: after' 93854cf..HEAD -- src/set-builder/lights.ts` gives `c831e0a` (setlist-controller#501 Lights: each song cue takes its ProPresenter background colour on the six colour lights). The sentence of the install doc it collides with is on the base, from setlist-controller#376.
- **Real-world trigger:** a template whose last song cue has a follow or a hang into a build or a hit, which is how `docs/install.md:419` says to light a build ("put it in the list as the next cue after the song cue, and give the song cue a follow time or a hang time"). Then every Sunday the last song's build shows the template's colour on the six colour lights, not the song's. With a fourth song as well, the last template song's follow fires the fourth song's cue part-way through the third song. MEDIUM, capped: the template does not exist yet (#506 is Nick's), so no show file has the shape today. It drops to LOW once the template is made with no follow, no hang and no cue between or after its song cues but Closing; check the three song cues in ETCnomad's cue list, or arguments 20 and 21 of each cue's `list/0/31` reply (`test/fixtures/eos/README.md`, "Follows and links, 2026-10-24").

**Evidence** —
```ts
  const source = songCues.at(-1)!;
  const following = cues[places[lastWithCue]! + 1];
  const below = following === undefined ? PAST_LAST : thousandths(following.number);
  ...
  const lastPlace = Math.max(...places.filter((place) => place !== undefined));
  return { songCues, after: cues[lastPlace + 1]?.number };
```
`following` and `after` are the next cue in list order, whatever it is. `src/set-builder/lights.ts:294` then records the template's colour into `after`: `if (after !== undefined) recordings.push({ cue: after, colourOf: held(after) });`.

**Failure mode** — On the cue list 1 "Song 1", 11 "Song 2", 22 "Song 3", 23 (a build with no label, which 22 follows into), 35 "Closing":
- Three songs: `after` is 23. The step records the colour cue 23 had in the template into cue 23, so the third song's look changes colour at its first build, and Closing tracks from there. A build after song 1 or song 2 is treated the other way: nothing is recorded into it, so it tracks its song's new colour, unless it holds a colour of its own, which it then keeps. Nothing in the summary names any of these cues.
- Four songs: the copy for song 4 is numbered 22.5, between 22 and 23. At the service cue 22's follow fires the next cue in the list (recorded: "the cue a follow or hang fires next is the link target when the link is not 0, else the next cue in the list"), which is now song 4's cue, in the middle of song 3. The server expects a cue fired on a follow, so the lights do not pause and the pre-service check names nothing.

Proof: `repro/pre-pr-review-1.test.ts`, "finding 1", two cases, green at `be48287`: `after` is `'23'`, and the four cues are `['1', '11', '22', '22.5']`. Not recorded: whether Copy To gives the copy its source's follow, which would run song 4's cue on into the build too.

**Recommended fix** — None in place. This needs one decision from Nick, and both answers are small once it is made:
- (a) A template song cue has no chain. The step reads each cue's follow and hang from the cue list read it already makes, and stops before any write, with one line that names the cue, when a song cue has either. `docs/install.md:419` then says a build or a hit is not available in a weekly show file.
- (b) A song owns its chain. The step follows each song cue's follow, hang and link to the chain's last cue; `after` and a copy's number are taken past that cue; and the doc says a chain cue tracks its song's colour unless it holds one of its own.

**Remediation brief**
- **Design intent:** colour tracks forward in Eos, channel by channel, until a cue that holds a colour of its own. So the step records a colour into every song cue, then records the template's colour back into the first cue after the last song cue, so the closing look does not inherit the last song's colour (spec, "Colour tracks forward in Eos, so every colour is written explicitly"). The spec's template has the three song cues one after another with Closing next, and says nothing of a chain. The server fires only a song's own cue; anything else in a song runs on a follow or a hang inside the show file (#376).
- **Full surface:** `src/set-builder/song-cues.ts:49-59` and `:65-66`; `src/set-builder/eos.ts:93` and the cue read at `:182-198`, which drops arguments 19 to 21 of the reply; `src/set-builder/lights.ts:186-190` (where a problem found in the cue list stops the run before a write) and `:294`; `docs/install.md:380`, `:388` and `:419`; the usage text in `src/set-builder/main.ts` (the `--lights` paragraph, "Nothing is written to Eos with ..."); `README.md` (the same list); the "Every other problem" list of `.claude/skills/build-set/SKILL.md:150-167` with a trace; `test/fake-eos.ts`, whose cues would have to carry a follow as the recorded `list/0/31` reply does.
- **Must preserve:** every case of `test/set-builder-lights.test.ts` on `CHURCH_SHOW`, which has no chain; the decimal copy cases ("numbers the copies with decimals when the next whole number is a cue"); the second run ("copies no cue and ends with the cues, the labels and the levels of the first run"); `test/readme-lights.test.ts:288-293`, which pins "one cue per song" and "in set order".
- **Do not touch:** the order of the writes in `lights.ts` (copies, then labels, then colours, then the save), and `numberBetween` in `song-cues.ts`, whose arithmetic two mutants could not break. Both are under Reviewed and Dismissed.
- **Proof:** `cp docs/reviews/setlist-controller-247/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 1'; rm test/pre-pr-review-1.test.ts`. Both cases are green now, since they pin today's decision. Under (a) they stay as they are and a new command-level case shows the refusal; under (b) they change to the chain's end.
- **Escalation:** not remediable in place. Which cue ends a song's chain is a rule of the rig, the ticket reviews of #501 and #505 each met one face of it and set it aside, review 1 escalated it, and #506 makes the template the rule governs. Recommend a ticket of its own, decided before #506.

### 2. A dark first frame now reads `no picture`, and the help for that line tells Nick to copy a file that is already there — LOW
- **Location:** `docs/install.md:400`; `.claude/skills/build-set/SKILL.md:147`, with the trace that pins it at `.claude/skills/build-set/traces.md:4762-4796` ("504-template-colour-then-the-file-copied").
- **Attribution:** pre-existing at `e173d9a` for a frame that is exactly black, which gave no picture then too (its saturation is 0); widened by the remediation, `b91fd1d`, to every near-black frame, which gave a hue before. The two sentences came with `fe539c9` (setlist-controller#505 Lights: the install doc describes the lights step and the template show file) and `5fd669d` (setlist-controller#504 The build-set skill carries the lights step). Review 1's remediation notes name it and leave it: "The paragraph names the new cause and gives no step for it, since what Nick should do then (another first slide, another background, or leave the template's colour) is a choice the brief does not make." It is not in that doc's "Known regressions, deferred" list, which reads "None".
- **Real-world trigger:** a background video that fades in from black, with its file on the playback Mac. The song's line reads `template colour  no picture, <background file>`. Nick, or a session that follows the skill, copies the file the line names, which is there already, and runs the lights step again: 5 seconds more for the song, and the same line. Nothing wrong reaches the lights, since the song keeps the template's colour.

**Evidence** — `docs/install.md:400`: "That is what ProPresenter's grey placeholder gives when the song's background file is not on the playback Mac, and what a first slide with no background gives. ... To fix it, copy the background file the line names to the playback Mac, check that ProPresenter shows the background on the first slide of the song's presentation, and run the lights step again." `.claude/skills/build-set/SKILL.md:147`: "ProPresenter gave no picture of the song's background to take a colour from. Most often the background file the line names is not on this Mac, and Nick copies it to this Mac." Against `src/set-builder/colour.ts:71-72`, where a picture whose every large area is under 20 of 255 is no picture.

**Failure mode** — ProPresenter gives a real picture of the first frame, the frame is near black, and the line and both helps read as a missing file. Neither step of the install doc changes the outcome, and the skill has no other word for it.

**Recommended fix** — One sentence in each place, by the Approach decisions:
- `docs/install.md:400`, after "and run the lights step again.": "A background whose first frame is near black, such as a video that fades in from black, reads as no picture with its file on the playback Mac: the song keeps the template's colour unless the first slide gets another background."
- `.claude/skills/build-set/SKILL.md:147`, after "and Nick copies it to this Mac.": "When the file is on this Mac and the line still reads `no picture`, the first frame of the background is near black or has no colour, and the song keeps the template's colour unless Nick gives the first slide another background."

**Remediation brief**
- **Design intent:** a song with no usable picture keeps the template's colour, and its line names the background file so Nick knows what to look at (spec, stories 11 and 12). The helps say what each reason means and what changes it. Since `b91fd1d` a picture is unusable for three causes: no opaque pixel, no large area that is not near black, or a chosen area under 5% saturation. The helps cover a missing file and a slide with no background, and say nothing of a dark frame.
- **Full surface:** `docs/install.md:400` and its test at `test/readme-lights.test.ts:212-224` (one more `toContain` for the new sentence); `.claude/skills/build-set/SKILL.md:147`; a new trace in `.claude/skills/build-set/traces.md` that pins the new sentence, in the shape of the one at `:4762-4796`; `TRACE_COUNT` at `test/build-set-skill.test.ts:20`, 101 today. `README.md:139` lists the causes and gives no fix, so it does not change.
- **Must preserve:** every sentence the tests pin stays word for word: `test/readme-lights.test.ts:215-223` (among them "copy the background file the line names to the playback Mac" and at least three of "run the lights step again"), and the five pins of the trace at `.claude/skills/build-set/traces.md:4792-4796`. `pnpm exec vitest run test/readme-lights.test.ts test/build-set-skill.test.ts test/build-set-skill-quotes.test.ts test/build-set-skill-examples.test.ts` stays green.
- **Do not touch:** the summary line itself (`no picture, <background file>`), which the tests and the skill quote, and `src/set-builder/colour.ts`.
- **Proof:** `grep -c 'first frame is near black' docs/install.md` gives 0 now and 1 after; `grep -c 'near black' .claude/skills/build-set/SKILL.md` gives 0 now and 1 after; then the four test files above, green with the new trace count.

### 3. The new words of two sentences Nick reads have no test that pins them — LOW
- **Location:** `README.md:137` ("The colour is the hue of the most saturated of the picture's large areas that are not near black, never its mean") against the README test at `test/set-builder-lights.test.ts:2081`; `docs/install.md:400` ("it has no large area that is not near black, or the most saturated of those areas is under 5% saturation") against `test/readme-lights.test.ts:212-224`.
- **Attribution:** the README sentence had no pin at `e173d9a` either (`git grep -n 'never its mean' e173d9a -- test` finds the usage text and the install doc only), so that half is pre-existing on the branch and left open; the install doc's clause was pinned by three words, "under 5% saturation", and `b91fd1d` added the new clause with no pin. Review 1's Approach decisions asked for both sentences "with the tests that pin them".
- **Real-world trigger:** none today, since both sentences are right. A later edit that drops the words from either passes every check, and the README and the install doc then describe the method `e173d9a` had.

**Evidence** — `git grep -n 'never its mean\|not near black' -- test` gives `test/readme-lights.test.ts:191` (the install doc's colour sentence), `test/set-builder-lights.test.ts:2057-2058` (the usage text) and `:2106` (the README's no-picture sentence). `test/readme-lights.test.ts:217` reads `expect(colour).toContain('under 5% saturation');`.

**Failure mode** — `repro/pre-pr-review-2-mutants-sentences.diff` takes "that are not near black" out of `README.md:137` and puts the old clause back in `docs/install.md:400`. Applied on a scratch worktree at `be48287`, `pnpm exec vitest run test/readme-lights.test.ts test/set-builder-lights.test.ts -t "README|install doc|usage text"` gives 44 passed. A run of 14 more test files together (every one that names either doc but `test/eos.test.ts` and `test/fake-eos.test.ts`, with the three of the skill) gives 427 passed.

**Recommended fix** —
```diff
+    expect(section).toContain("The colour is the hue of the most saturated of the picture's large areas that are not near black, never its mean, at the lights config's `saturation` and full brightness");
```
beside `test/set-builder-lights.test.ts:2106`, and
```diff
+    expect(colour).toContain('the picture has no opaque pixel, it has no large area that is not near black, or the most saturated of those areas is under 5% saturation');
```
beside `test/readme-lights.test.ts:217`.

**Remediation brief**
- **Design intent:** the usage text, the README and the install doc each say what the colour is and when there is no picture, in the same words, and a test reads each file for the whole clause (Approach decisions). The usage text has both pins and the other two files have one each.
- **Full surface:** `test/set-builder-lights.test.ts:2106` (one line added beside it) and `test/readme-lights.test.ts:217` (one line added beside it). No doc and no file under `src/` changes.
- **Must preserve:** `test/readme-lights.test.ts:217` keeps its own line. When finding 2 lands first, `docs/install.md:400` gains a sentence after this clause and the clause itself does not move.
- **Do not touch:** the three sentences themselves, which are right and agree with each other.
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-2-mutants-sentences.diff && pnpm exec vitest run test/readme-lights.test.ts test/set-builder-lights.test.ts -t "README|install doc|usage text"`. It passes now (44 passed), which is the failure. After the fix it must fail in two tests, and each of the diff's two hunks applied alone must fail one.

### 4. Losing Live in the middle of a run has no test: five guards can be deleted with every test green — LOW
- **Prior finding:** review 1's finding 3, carried unchanged. Left for Nick by the remediation ("not worked: LOW, outside this round's scope").
- **Location:** `src/set-builder/lights.ts:203`, `:230`, `:254` and `:320`; `src/set-builder/eos.ts:173`, with its catch at `src/set-builder/lights.ts:112`; `test/fake-eos.ts:628` and `:635`.
- **Attribution:** introduced by the branch, before `e173d9a`. `git log -S'if (!live()) return notLive();' 93854cf..HEAD -- src/set-builder/lights.ts` starts at `daa5ef9` (setlist-controller#500 Lights: the lights mode labels the song cues in the weekly show file and saves it).
- **Real-world trigger:** none today, since the code is right. The cost is a later change that drops one of these guards with every check green. A console that leaves Live mid-run is someone pressing Blind or Patch in ETCnomad during the 10 to 30 seconds the step runs.

**Evidence** — `test/fake-eos.ts:628` echoes every command with a fixed prefix: ``const echo = `LIVE: Cue  ${current ?? ''} : ${text.replace(/#$/, '').replaceAll('_', ' ')}`;``. `setCommandLine` (`test/fake-eos.ts:866`) changes the connect burst only, and the one test that uses it, `test/set-builder-lights.test.ts:647`, covers a console that is not in Live at the start.

**Failure mode** — `repro/pre-pr-review-1-mutants-live.diff` deletes the guard in `command()` and the checks before the first Go To Cue, before the copies and before the labels, and turns the check before the save into `if (false)`. Applied on a scratch worktree at `be48287`, `pnpm exec vitest run test/set-builder-lights.test.ts` gives 124 passed. So no test shows that the step stops writing, says the open show is changed, or leaves the save to Nick once the command line leaves Live.

**Recommended fix** — Give the fake Eos one knob that sends a recorded command line that is not LIVE (the Blind line of 2026-11-02 that `test/set-builder-lights.test.ts:650` already uses) on `/eos/out/cmd` once a message matching a pattern has been answered. Add one command-level case per guard, each asserting the one problem line, exit 1, and that the fake received nothing but reads after the line was sent:
- after the cue list read, before the first Go To Cue: "Put Eos in Live", nothing written;
- after the last channel read, before the copies, with a set of four songs;
- after the copies are read back, before the labels: the line ends with the changed-and-not-saved sentence;
- after the first Record Only is answered: the next Go To Cue is not sent, and the line comes from `EosNotLive` with the changed-and-not-saved sentence;
- after the last Record Only: the song lines print, and the line says to save the show by hand, with no save received.

**Remediation brief**
- **Design intent:** every command line command and every write runs only while the command line reads LIVE (spec, "The Eos commands"). The step checks before each phase (`live()`), and `command()` checks again before each send, because the recordings (`colour-set.json` and the rest) show a second or more between phases. Once a copy, a label or a colour is in the open show, a stop says the show is changed and not saved; once every colour is recorded, a stop before the save says to save by hand.
- **Full surface:** `test/fake-eos.ts:113` and `:866` (the knob beside `setCommandLine`, with its line in the `FakeEos` type), `test/fake-eos.test.ts` (one case for the knob itself), and the new cases in `test/set-builder-lights.test.ts` beside `:646-662`. No file under `src/` changes.
- **Must preserve:** the fake answers from recordings only, so the knob sends a recorded line and invents no answer to a command sent outside Live (none is sent). `test/fake-eos.test.ts` and `test/eos.test.ts` share the fake and must stay green.
- **Do not touch:** the guards themselves, and the wording of the three problem lines, which the build-set skill quotes (`.claude/skills/build-set/SKILL.md:159`, `:165`, `:166`).
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-1-mutants-live.diff && pnpm exec vitest run test/set-builder-lights.test.ts`. It passes now (124 passed), which is the failure. After the fix it must fail, and each of the diff's five hunks applied alone must fail too.

### 5. The waits the real Eos needs have no test that needs them — LOW
- **Prior finding:** review 1's finding 4, carried unchanged. Left for Nick by the remediation.
- **Location:** `src/set-builder/eos.ts:205` (the settle after a Go To Cue), `:98` and `:226-233` (the half second between the keys of a save), `:236` (the wait for a saved event that comes after the keys); `src/set-builder/lights.ts:173-181` (`leftOf`, the read again of a copy, a label or a colour); `test/set-builder-lights.test.ts:216` and `:1435`, which set `EOS_SETTLE_MS` to 0 on every run.
- **Attribution:** introduced by the branch, before `e173d9a`. `git log -S'settleMs' 93854cf..HEAD -- src/set-builder/eos.ts` gives `c831e0a` (setlist-controller#501 Lights: each song cue takes its ProPresenter background colour on the six colour lights).
- **Real-world trigger:** none today. These waits are what the recordings were made with: every read came a second after a Go To Cue, the keys of the one recorded save were half a second apart, and a label set notified a second later. The fake answers everything at once, so a change that removes a wait passes every check and fails only on the real console.

**Evidence** — `test/set-builder-lights.test.ts:212-216`: "EOS_SETTLE_MS is 0: the mode waits a second after each Go To Cue for the real Eos, and the fake answers at once." The fake's knobs hold a label, a copy, a colour or a save for ever (`holdLabels`, `holdCopies`, `holdColours`, `holdSaves`), and none lets one arrive late.

**Failure mode** — `repro/pre-pr-review-1-mutants-waits.diff` deletes the settle wait, makes `leftOf` read once, makes `save()` return without waiting for a late saved event, and sets the key gap to 0. Applied on a scratch worktree at `be48287`, `pnpm exec vitest run test/set-builder-lights.test.ts` gives 124 passed. This is the sibling of the one-second ProPresenter wait that `ec2520a` gave a real test.

**Recommended fix** — Four cases, by the Approach decisions:
- the fake Eos records when each message arrives, as `test/fake-propresenter.ts:101` does (`arrivals`), and one run on the set of one song with no `EOS_SETTLE_MS` asserts that each `/eos/get/params` read comes at least 990 ms after the Go To Cue before it;
- the same run asserts that the four key messages of the save arrive at least 490 ms apart;
- a label, a colour and a copy that the fake applies only after the first read back, each ending at exit 0 with the show as an ordinary run leaves it;
- a saved event sent after Shift is released (`holdSaves()`, then `emit` of the recorded event once the fake has received `/eos/key/shift` 0), ending at exit 0 with the show path printed.

**Remediation brief**
- **Design intent:** Eos gives no direct answer to a label set, a colour set or a key, so the step reads back until it sees what it sent or the answer limit passes, and it waits a second after each Go To Cue because that is the only gap a recording proves gives the cue's levels (`test/fixtures/eos/README.md`: "A read 1 s after a Go To Cue in no time gave the cue's levels"). `EOS_SETTLE_MS` and `EOS_TIMEOUT_MS` exist for the tests alone (`src/set-builder/main.ts:590-595`).
- **Full surface:** `test/fake-eos.ts` (arrival times on `received` or beside it; a late variant of `holdLabels`, `holdColours` and `holdCopies` at `:116-127` and `:820-829`), `test/fake-eos.test.ts` (a case for each new knob), and the new cases in `test/set-builder-lights.test.ts`. No file under `src/` changes.
- **Must preserve:** every other run keeps `EOS_SETTLE_MS: '0'`, or the file's three minutes grow by a second for each Go To Cue. The timing cases measure arrivals at the fake, never the whole run. The hold cases at `test/set-builder-lights.test.ts:1398`, `:1413`, `:1740`, `:1965`, `:1990` and `:2009` keep their lines.
- **Do not touch:** `EOS_LIMITS` (`src/set-builder/eos.ts:22`) and `KEY_GAP_MS` (`:98`), whose values are the recordings'.
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-1-mutants-waits.diff && pnpm exec vitest run test/set-builder-lights.test.ts`. It passes now (124 passed), which is the failure. After the fix it must fail, and each of the four hunks alone must fail too.

### 6. The large-area rule, one side of the near-black rule and four fallback paths have no test — LOW
- **Prior finding:** review 1's finding 5, carried, with one addition from this round: the near-black rule of `b91fd1d` is tested from the dark side only.
- **Location:** `src/set-builder/colour.ts:13` and `:71` (an area needs 5% of the pixels, and its brightest channel must reach `DARK`); `src/set-builder/png.ts:26`, `:29-31`, `:48` and `:52` (a PNG cut short, one that is not 8-bit RGBA, picture data cut short, a filter no PNG has); `src/set-builder/weekly-show.ts:22` (a template that cannot be read) and `:39-44` (a copy that fails part way takes its own file away).
- **Attribution:** introduced by the branch. `colour.ts` and `png.ts` came with `c831e0a` (setlist-controller#501), `weekly-show.ts` with `b960320` (setlist-controller#499 Lights: the build makes the weekly show file from the template), both before `e173d9a`. The near-black half is introduced by the remediation: `git log -S'Math.max(...colour) >= DARK' e173d9a..HEAD -- src/set-builder/colour.ts` gives `b91fd1d`.
- **Real-world trigger:** none today. The 5% rule is the spec's guard against a small vivid mark, such as ProPresenter's media marks, deciding the colour, and nothing would notice its loss. The near-black rule reads the brightest channel on purpose: read from the darkest channel it would throw out every strongly coloured area, which is the area the method looks for, and nothing would notice that either.

**Evidence** — `git grep -n 'interlac\|cut short' -- test/set-builder-lights.test.ts` finds nothing; the one decoder failure a test reaches is "is no PNG the mode can read" (`test/set-builder-lights.test.ts:1645`, a JSON file served as the picture). `test/set-builder-weekly-show.test.ts:280-299` covers a show folder that is a file (`ENOTDIR`) and no other cause. No picture in `test/fixtures/propresenter/2026-11-12/` has a large area whose brightest channel is 20 or more and whose darkest is under 20.

**Failure mode** — Two diffs, each applied alone on a scratch worktree at `be48287`, each leaving `pnpm exec vitest run test/set-builder-lights.test.ts` at 124 passed:
- `repro/pre-pr-review-1-mutants-large.diff` sets `LARGE` to 0, so any group counts as a large area. Dropping the 5% share from the new filter alone survives the same way.
- `repro/pre-pr-review-2-mutants-dark.diff` reads `Math.min(...colour) >= DARK` for `Math.max`. Every one of the 11 fixture pictures gives the hue it gives today. A made buffer that is pale grey-blue with a bright red fifth (red 220, green 30, blue 10) gives hue 6 at `be48287` and hue 211 under the mutant.

The other paths are untested by reading: no test names their lines or their causes. A template with no read permission was run by hand through the build in review 1 and behaved as written (exit 1, one line, no weekly file).

**Recommended fix** — Command-level cases, by the Approach decisions:
- a made PNG that is pale teal (red `150 + at % 5`, green `195 + at % 4`, blue 200) with pure red over the first 3% of the pixels: the song takes the teal hue, 180 to 195, not hue 0. Checked on a made buffer: 186 at `be48287`, 0 with `LARGE` at 0;
- a made PNG that is pale grey-blue (red `180 + at % 4`, green `190 + at % 3`, blue 200) with a bright red area (red `220 + at % 3`, green `30 + at % 2`, blue 10) over the first fifth of the pixels: the song takes the red hue, 0 to 15. Checked on a made buffer: 6 at `be48287`, 211 under the `Math.min` mutant;
- a made PNG cut short, and a made 8-bit RGB PNG with no alpha: each song keeps the template's colour with "the picture cannot be read";
- a build with a template of mode 000, beside the `ENOTDIR` case: exit 1, the one line with the cause, and no weekly show file.

The cleanup at `weekly-show.ts:39-44` has no way in through the command; leave it without a test and say so in the commit.

**Remediation brief**
- **Design intent:** the spec's colour method takes "the groups that hold at least 5% of the pixels", and since `b91fd1d` a group gives a hue only when its brightest channel is at least 20 of 255, because saturation does not fall with brightness. The decoder reads the one kind of PNG ProPresenter 22 sends and names why it will not read another. A picture that cannot be read is a song with no picture, never a stop. A weekly show file that cannot be made is one line and exit 1, with the set still built.
- **Full surface:** new cases in `test/set-builder-lights.test.ts` beside `:1573` and `:1643`, and in `test/set-builder-weekly-show.test.ts` beside `:280`; the made PNGs under `test/fixtures/propresenter/2026-11-12/`, each named as made in `test/fixtures/propresenter/README.md` with the rule for its pixels, as the bullet at `:147` does. No file under `src/` changes.
- **Must preserve:** the fake ProPresenter serves recorded answers unless a test replaces one with `answerThumbnails`. No test counts the PNG files of the folder (the 14 of `test/fake-propresenter.test.ts` counts playlists), so a new file needs no other change.
- **Do not touch:** the decoder's filters and the Paeth tie order, cleared under Reviewed and Dismissed; `DARK` and the filter at `src/set-builder/colour.ts:71`, which are right.
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-1-mutants-large.diff && pnpm exec vitest run test/set-builder-lights.test.ts`, then on a clean scratch worktree the same with `docs/reviews/setlist-controller-247/repro/pre-pr-review-2-mutants-dark.diff`. Each passes now (124 passed), which is the failure, and each must fail after.

### 7. When a build exits 1 only because the set manifest could not be written, the skill never shows the weekly show file or runs the lights — LOW
- **Prior finding:** review 1's finding 6, carried unchanged. Left for Nick by the remediation.
- **Location:** `.claude/skills/build-set/SKILL.md:32` (Steps step 6, exit 1) and `:140` (After the build).
- **Attribution:** introduced by the branch, before `e173d9a`. `git log -S'After the build.' 93854cf..HEAD -- .claude/skills/build-set/SKILL.md` gives `5fd669d` (setlist-controller#504 The build-set skill carries the lights step).
- **Real-world trigger:** a build whose set manifest cannot be written, such as an app support folder that is missing or read-only. Rare. The set is built and the weekly show file is made, and a session that follows the skill tells Nick about neither the file nor the lights.

**Evidence** — `.claude/skills/build-set/SKILL.md:140`: "When the build exits 0, it prints two lines for the lights after the set's path". Step 6's exit 1 knows one line that leaves the set built, `The set is built, but the weekly show file cannot be made in <folder>: ...`. The build prints the two lines on this path too: `src/set-builder/main.ts:465-470` prints the summary, then the weekly show file's lines, then the manifest's line on stderr, and `test/set-builder-weekly-show.test.ts:302` pins that order with exit 1.

**Failure mode** — The manifest folder cannot be written. The build prints the summary, `Weekly show file: ...`, `Open it in ETCnomad: ...`, and on stderr `The set is built, but the set manifest <path> cannot be written: ...`, exit 1. By step 6 the skill treats exit 1 as problems to fix and build again; nothing sends it to The lights step, so the lights are never run for a set that is built.

**Recommended fix** — In step 6's exit 1 bullet, after the sentence on the weekly show file that cannot be made, add that an exit 1 whose line on stderr starts `The set is built, but the set manifest` comes with the two lines for the lights on stdout: show them as printed and go on by The lights step, with no second build. In "After the build", change "When the build exits 0, it prints" to cover that exit 1 as well. Add one trace for the path and raise `TRACE_COUNT`.

**Remediation brief**
- **Design intent:** the yes to the build covers the lights step, and the skill hands over to it whenever the build made a weekly show file (#504). The build counts as done whenever its output says the set is built.
- **Full surface:** `.claude/skills/build-set/SKILL.md:32` and `:140`; a new trace in `.claude/skills/build-set/traces.md`, by the rule at its head; `TRACE_COUNT` at `test/build-set-skill.test.ts:20` (101 today); the plan path shows its outcome by step 6 (`.claude/skills/build-set/SKILL.md:118`), so the one edit covers both paths.
- **Must preserve:** every pinned sentence stays word for word unless its trace moves with it in the same commit; `pnpm exec vitest run test/build-set-skill.test.ts test/build-set-skill-quotes.test.ts test/build-set-skill-examples.test.ts` stays green.
- **Do not touch:** what fixes the manifest itself. The skill has no fix for that line, which the review of #504 set aside as a proposal of its own; this finding restores the lights hand-off only.
- **Proof:** read the edited step 6 against `test/set-builder-weekly-show.test.ts:302`, then the three skill test files above, green with the new trace count.

### 8. The skill cannot carry `--connections-config`, which the install doc's weekly routine relies on, nor `--show-folder` on a build — LOW
- **Prior finding:** review 1's finding 7, carried unchanged. Left for Nick by the remediation.
- **Location:** `.claude/skills/build-set/SKILL.md:142` (The lights command), `:169` (The lights alone) and `:28` (Steps step 4), against `docs/install.md:404`.
- **Attribution:** introduced by the branch, before `e173d9a`. The skill's sentences came with `5fd669d` (setlist-controller#504), the doc's with `fe539c9` (setlist-controller#505 Lights: the install doc describes the lights step and the template show file).
- **Real-world trigger:** the default connections config holds the church's addresses, which `docs/install.md:404` allows for ("`--connections-config <path>` reads another file when the church's addresses are in the default one"). Nick asks a session for the lights at home. The skill has no rule that adds the flag, so the run ends at "Eos at <host>:<port> did not answer", and the skill's fix for that line is to correct the address in the file the server reads. Today the config on this Mac names 127.0.0.1, so the path is not live.

**Evidence** — `grep -c connections-config .claude/skills/build-set/SKILL.md` is 0. `:142` reads "Add `--output-root <folder>` and `--show-folder <folder>` when the build command had them", and step 4 (`:28`) lists the flags a build command takes as "`--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`", so no build the skill composes has a `--show-folder` to carry over.

**Failure mode** — As the trigger says. The second half is quieter: a show folder Nick names for a build has no rule that puts it on the build command, so the weekly show file is made in the default folder.

**Recommended fix** — In "The lights command" and "The lights alone", add `--connections-config <path>` to what the lights command takes when Nick names another connections file, kept on every later run of the lights step in the conversation, as `--playlist` is. In steps 1 and 4, and plan steps 1 and 2, add `--show-folder <folder>` to the flags Nick can name for a build, after `--output-root`. One trace for each, and `TRACE_COUNT` with them.

**Remediation brief**
- **Design intent:** the skill names no flag the command lacks and composes every command Nick's request needs (#504). The lights mode takes `--date`, `--output-root`, `--show-folder`, `--connections-config` and `--playlist` (`LIGHTS_OPTIONS`, `src/set-builder/main.ts`), and a build takes `--show-folder` and refuses `--connections-config` and `--playlist`.
- **Full surface:** `.claude/skills/build-set/SKILL.md:14`, `:28`, `:86`, `:88`, `:142` and `:169`; new traces in `.claude/skills/build-set/traces.md`; `TRACE_COUNT` at `test/build-set-skill.test.ts:20`; `test/build-set-skill-examples.test.ts`, which runs each fenced lights command of the skill through the mode's flag rules.
- **Must preserve:** "Nothing else of the build command goes on it" at `:142` stays true: `--connections-config` comes from Nick's words, never from the build command, which cannot hold it. The three skill test files stay green.
- **Do not touch:** `docs/install.md:404`, which is right about the command.
- **Proof:** `pnpm exec vitest run test/build-set-skill.test.ts test/build-set-skill-quotes.test.ts test/build-set-skill-examples.test.ts`, green with the new trace count, and `grep -c connections-config .claude/skills/build-set/SKILL.md` above 0.

### 9. Comment hygiene — LOW (aggregated)
The first three entries are new, left by `b91fd1d`. The last four are review 1's finding 8, carried unchanged.
- `test/fixtures/propresenter/README.md:123` — "`thumbnail-first-request-then-again.json`, `made-transparent.png` and `placeholder-with-marks-14-13.png` are no answer to a path ... The bytes are recorded, or for `made-transparent.png` made" → "`thumbnail-first-request-then-again.json`, `placeholder-with-marks-14-13.png` and each file named `made-*.png` are no answer to a path ... The bytes are recorded, or for a file named `made-*.png` made". The fix changed the same sentence in `test/fake-propresenter.ts:85` and not its copy here, and the bullet at `:147` of the same README names three more made files.
- `test/set-builder-lights.test.ts:1573` — "a dark warm shadow over an eighth of it" → "a dark warm shadow over 12% of it". The shadow is the first 10,800 of 90,000 pixels, as the fixture README says.
- `src/set-builder/colour.ts:20` — "the water of Ancient Gates, is at 41" → "the water of Ancient Gates, is at 40.6". The group's mean is red 31.2, green 39.4, blue 40.6, so `DARK` at 41 already drops it.
- `src/set-builder/png.ts:15-16` — "Throws an Error whose message says why the file is not one this decoder reads, to follow "the picture cannot be read:" in a problem line." → "Throws an Error whose message says why the file is not one this decoder reads. The lights mode prints only that the picture cannot be read (lights.ts)." The message is dropped at `src/set-builder/lights.ts:377-379`.
- `src/set-builder/eos.ts:70-72` — "Eos sends the cue's fire event, as for a Go, and every colour set by hand is gone." → "Eos sends the cue's fire event, as for a Go. Not recorded: whether a colour set by hand and not recorded is still live after it; the fake Eos drops it." No recording sets a colour, leaves it unrecorded and goes to another cue; `test/fixtures/eos/README.md:47` already lists it as part of the model.
- `docs/install.md:378` — "changes two things in it, and nothing else: the label of each song cue ... and the colour of the six colour lights in each song cue" → "changes two things in each song cue: its label ... and the colour of its six colour lights". The next paragraph (`:380`) says what else it writes: the colour of the first cue after the last song cue, recorded back, and a copy for each extra song.
- `e2e/lights.spec.ts:46` — "A show of a few hundred cues, as the whole library in one cue list, each labelled." → "A show of a few hundred cues, each labelled, to prove the lights' row on a long list." Pre-existing, and made stale by this epic, which replaces the one-list decision of #376; the constant `LIBRARY` beside it reads the same way.

## Prior-review closure
Review 1 (`pre-pr-review-1.md`, at `e173d9a`) confirmed eight findings: two MEDIUM and six LOW.
- **Fully fixed: 1.** Finding 2 (MEDIUM, a near-black area won as the most saturated one), by `b91fd1d`. Checked against its intent, not its diff: the three repro cases are green, the three made pictures give none, none and 184, every recorded picture keeps its hue, the 5% share is still inside the filter, the placeholder, the checkerboard and the transparent picture are still no picture, and the same picture gives the same hue twice. Nothing was "fixed" by a comment or a doc alone.
- **Partially fixed: 0.**
- **Untouched: 7.** Finding 1 (MEDIUM) by decision: its closure row reads "escalated: split ticket recommended", and it is this doc's finding 1. Findings 3 to 8 (LOW) by scope: each row reads "not worked: LOW, outside this round's scope", and they are this doc's findings 4, 5, 6, 7, 8 and 9.

No prior finding of MEDIUM or above is left open but for the one that was escalated. The fix did leave small things of its own, which is the pattern a re-review expects: this doc's findings 2 and 3, the near-black half of finding 6, and the first three entries of finding 9. None is a defect of behaviour, and `colour.ts` has been changed once in answer to a review, so no split ticket is called for on that count.

## Needs Further Investigation
All four are review 1's, unchanged, and each needs a recording or a read on a test copy of the show, which the guardrails keep out of this run.
### A. A Record Only of the colour that already tracks into a cue, followed by a change to an earlier cue — a recording on a test copy of the show
The step records in set order (`src/set-builder/lights.ts:290-299`). With song cues out of list order, a later cue is recorded before an earlier one. If Eos stores nothing for a Record Only whose colour equals what tracks into the cue, the earlier cue's new colour then tracks into the later one. The fake Eos makes the value the cue's own (`test/fake-eos.ts:583-586`), which is a model. Sorting the recordings by cue number would make the question moot.

### B. A Go To Cue onto a cue with a follow or a hang — a recording
No recording holds a Go To Cue in no time onto a cue with a follow. If Eos runs the follow, the read a second later (`src/set-builder/lights.ts:205-216`) gives the next cue's levels as the template's. This joins finding 1's decision.

### C. A colour set by hand before the run — a recording
Whether a colour set by hand and not recorded survives a Go To Cue is not recorded. If it survives, a colour Nick left on the six lights before the run reads as the template's colour of the first cue the step goes to.

### D. A colour channel with no fixture — a read by hand
What Eos answers to `/eos/get/params/<chan>` for an unpatched channel is not recorded. With no reply, a wrong `colourChannels` reads as "Eos at <host>:<port> did not answer" and not as the "no colour light" line (`src/set-builder/lights.ts:208-214`).

## Reviewed and Dismissed
From this round, on the delta:
- A group no pixel joined reaching the brightness test with its start colour — it fails the 5% share first, for any picture with a pixel.
- `large.reduce` with no first value at `src/set-builder/colour.ts:73` — the guard at `:72` is before it; the mutant that deletes the guard is killed.
- A caller that relied on a hue always coming back once a picture had an opaque pixel — `pictureHue` has one caller, `src/set-builder/lights.ts:376`, which reads no hue as "no picture".
- The grey placeholder and the checkerboard now stopping at the near-black rule and not at the 5% saturation rule, which would make the sentence "as ProPresenter's grey placeholder and a slide with no background are" false — both have a grey group at 33 or more, so both still reach the saturation rule.
- The comment at `src/set-builder/lights.ts:366-369` ("a picture with no opaque pixel or no colour is no picture") — still true.
- A sentence of the old rule left somewhere the fix did not look — `git grep -n -i` for "saturated", "large area", "opaque pixel", "near black" and "its mean" over `src`, `test`, `README.md`, `docs/install.md`, the build-set skill, `scripts` and `config` finds the changed sentences and no other.
- A word of the usage text changed by the new wrap — compared word for word.
- A test that counts the files of `test/fixtures/propresenter/2026-11-12/` and missed the three new ones — none does.
- The made pictures differing from their written rule — 0 pixels differ.
- `DARK` at 20 dropping an area a recorded picture takes its hue from — the darkest is Ancient Gates' water at 40.6, and the peonies' shadow at 26.9 stays a candidate that the petals out-rank.

From review 1, on code unchanged since `e173d9a`, and named by the briefs above as do-not-touch:
- The order of the writes (path and Live checked first, every ProPresenter read before the first Go To Cue, copies, labels read back, colours read back, save last) — read in full, and every mutant of it was killed.
- `numberBetween` and `written` in `song-cues.ts` — whole thousandths throughout; two mutants killed.
- `colourAt` — standard hue to red, green and blue at full value; the saturation mutant is killed.
- The PNG decoder's filters, the Paeth tie order, several IDAT chunks and huge sizes — correct, and the recorded pictures use all five filters.
- The rest of review 1's list (the save's name, a stale `/eos/out/cmd`, the date match on a playlist's name, a 403 asked again, the strict compare of the show's path, newest by name in a repeated hour, an empty `--show-folder`, a show name that ends in a date, the recorder's guards, "in set order") stands as written there.

## Minor / nits
- `test/fixtures/propresenter/README.md:147` does not say in what order the noise values are drawn. It is red, then green, then blue for each pixel, and a reader making the file again would most likely guess so.
- The ten nits of review 1 stand as written there; none is on a line the delta touched.

## Test quality
Tests added by the delta: 3 cases in `test/set-builder-lights.test.ts` (two rows of the list at "a song with no picture" and the teal water case), and 3 tests whose pinned sentences changed. Against `e173d9a` with the new fixtures: all 6 red, 150 others green, so none passes on the old code. Tautology shapes found: 0. Of five mutants of the fix, two are killed (no rule at all, and no guard for a picture with no candidate) and three survive. Two survivors are finding 6: the brightest channel read as the darkest, and the 5% share dropped. The third is a tuning band and no finding: `DARK` at 42 passes every test, since Ancient Gates stays teal from its next group (hue 184, inside the test's 170 to 200) once its water group at 40.6 is dropped. The made shadow at 15 holds the band from below. The comment's "41" is therefore a fact about the recording that no test holds, which is entry three of finding 9 and wants no test of its own: where the number sits is #507's question in the room. The audit of the branch's other tests is review 1's and was not run again, since no other test file changed.

## Before opening the PR
- **CI readiness:** the repo has no CI. The full checks are green at `be48287`: lint, typecheck, 3148 tests, build, 138 Playwright tests.
- **Commit hygiene:** the tree is clean. 27 commits. This doc and the two new diffs under `repro/` are the only files to add.
- **Likely reviewer asks:** finding 1's decision, before #506 makes the template. The Mac's user name in three Eos fixtures, kept as Eos sent it and named in the fixture README, which is Nick's call as review 1 said. Whether the eight LOW findings go in one more round or in follow-up tickets.

## Verdict
Ready with follow-ups: nothing must be fixed before the PR opens, and finding 1 is decided in a ticket of its own before #506 makes the template.

The one fix this round asked for is in and holds against its intent. Finding 1 (MEDIUM) cannot be fixed in place: it needs Nick's rule for a song cue's chain, and until the template exists no show file has the shape. Findings 2 to 9 are LOW and can ship as follow-ups or go in one remediation round: one is two sentences of help (finding 2), one is two lines of test (finding 3), three are tests to add with no change under `src/` (findings 4, 5 and 6), two are sentences of the skill (findings 7 and 8), and one is seven comments (finding 9). Findings 2 and 3 come from the fix itself, so they are the natural ones to take first. Of review 1's eight findings, one is fully fixed, none is half fixed, and seven are untouched: one by escalation and six by scope. The count of confirmed findings went from eight to nine while the count of MEDIUM went from two to one, and everything new is a test gap or a sentence: the branch is not getting worse, the review is reaching the small things.
