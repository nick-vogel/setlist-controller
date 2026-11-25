# Pre-PR review: setlist-controller#247 Lights: the set build gives each song cue its ProPresenter background colour

**Branch:** `setlist-controller-247-lights-background-colour` vs `origin/main` (merge-base `93854cf`, "Merge pull request #497 from nick-vogel/setlist-controller-376-one-cue-per-song")
**Reviewed at:** HEAD `e173d9a` (setlist-controller#504 The build-set skill carries the lights step) + 0 files with uncommitted changes, 0 untracked files, 78 files total against `93854cf`, +22537 / −108. About 17,000 of the added lines are recorded fixtures under `test/fixtures/`; the reviewed code is 10 files under `src/set-builder/` (+1481 / −11), `scripts/eos/record-eos-fixtures.py` (+246 / −4), 19 test-side files (+5019 / −75), `config/lights.json`, `README.md`, `docs/install.md` and the build-set skill with its traces.
**Reviewed against:** the epic setlist-controller#247 (its body is the spec) and its sub-issues #498 to #505 with their comments, which correct #500, #501 and #502 from the recordings; `test/fixtures/eos/README.md`, "The lights step on the church show, 2026-11-12", and `test/fixtures/propresenter/README.md`, "The 2026-11-12 session", as the ground truth for what the two devices answer. The repo has no `CODING_STANDARDS.md`, `CLAUDE.md`, `CONTEXT.md` or ADRs, so the five rules every review binds apply: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for a fix. No earlier review doc exists for this epic. #506 and #507 are Nick's own tickets (the template show file, the real Sunday) and are not on the branch.
**Date:** 2026-11-13
**Reviewer:** 3 code-review agents + 1 tautology-audit agent + verify pass (1 repro file, 35 mutants)

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `e173d9a` | pass |
| Typecheck | `pnpm typecheck` at `e173d9a` | pass |
| Unit and integration suites | `pnpm test` at `e173d9a`, load average about 8 | 96 files, 3145 passed, 4 skipped, no flake |
| Build | `pnpm build` at `e173d9a` | pass |
| Playwright | `pnpm test:e2e` at `e173d9a` (builds first) | 138 passed |
| Out of scope stayed out | `git diff --stat 93854cf -- src/server src/shared web e2e package.json pnpm-lock.yaml` | empty: the server, its Eos target, the producer page and the dependencies are untouched |
| Copy rules | em-dash count over every added line outside `test/fixtures/` | 0 |
| Scrubbing | every `text` field of the six recorded presentations read by script; `grep -rc /Users/` over the fixtures | lyrics are scrubbed to place markers; three Eos fixtures hold the Mac's user name in show paths, as their README says (see "Before opening the PR") |
| Finding 1 | executed repro, `repro/pre-pr-review-1.test.ts` "finding 1", 2 cases green at `e173d9a`: they pin what the lights step decides on a cue list whose last song cue has a chain; the Eos half is the recorded follow behaviour (`test/fixtures/eos/README.md`, "Follows and links, 2026-10-24") | confirmed |
| Finding 2 | executed repro, same file, "finding 2", 3 cases red at `e173d9a` (hue 273, hue 0 and hue 27 where the brief asks for none, none and 180 to 195); the recommended fix applied on a scratch worktree turns them green with `test/set-builder-lights.test.ts` and `test/fake-propresenter.test.ts` still green (166 passed); a script over the six recorded thumbnails printed each one's five colour groups | confirmed |
| Mutation sweep of the lights mode | 35 mutants of `lights.ts`, `eos.ts`, `song-cues.ts`, `colour.ts`, `propresenter.ts` and `weekly-show.ts`, each on a scratch worktree at `e173d9a`, against `test/set-builder-lights.test.ts` (and `test/set-builder-weekly-show.test.ts` for the weekly file) | 25 killed, 10 survive (findings 3, 4 and 5). Killed, among others: the wrong-show check removed, the cue after the last song cue not recorded, a song with no picture not recorded, Record Only on every channel, the save skipped, a seventh channel set, the mean colour, the saturation ignored, no second ask of ProPresenter, a label written before the playlist question, the title lookup of a second run dropped, the oldest weekly file taken as the newest |
| Findings 3, 4 and 5 | the surviving mutants, combined into three diffs under `repro/`, each applied on a scratch worktree at `e173d9a`: `test/set-builder-lights.test.ts` gives 121 passed under each | confirmed |
| Findings 6 and 7 | `.claude/skills/build-set/SKILL.md:32`, `:140`, `:142` and `:169` read against `src/set-builder/main.ts:466-470`, `test/set-builder-weekly-show.test.ts:302`, `docs/install.md:404`, and `grep -c connections-config .claude/skills/build-set/SKILL.md` (0) | confirmed by reading |
| A wrong-source template colour | two mutants: the cue after the last song cue takes the last song cue's template colour; a copy takes the after cue's template colour | both killed, so the candidate is dismissed |
| Eos names a save after the file, not the show inside it | `test/fixtures/eos/README.md`: the test copy was a renamed copy whose show name still read `Church Sunday 2026-11-08`, and its save was `Colour test recording <time>.esf3d` | recorded, so the candidate is dismissed |
| One answer per command | the `/eos/out/cmd` packets of six recordings listed by script | each command line command gets exactly one, so the first one after a send is its answer |
| Tautology audit | the 19 new and changed test-side files and both fixture folders copied onto a scratch worktree at `93854cf`, each test file run alone | 843 tests: 372 red at base (all 121 of `set-builder-lights`), 358 untouched and green, 99 tests of the two fakes green by construction, 14 added or changed tests green at base, each for a sound reason (see Test quality) |
| Recorder safety | `scripts/eos/record-eos-fixtures.py` read for a write before both guards; `test/eos-recording-scripts.test.ts` read for the refusal paths | no write precedes the two guards, and the refusal tests pin the wire |
| Real Eos, real ProPresenter | not run | the guardrails forbid it; the two fakes stand in. Four questions only a recording can answer are under Needs Further Investigation |

**Overall:** The lights step does what the spec asks on the template the spec describes, the safety checks hold (nothing is written before the open show, the command line and both devices are checked), the full checks are green, and the tests are strong: 25 of 35 mutants die. Two things want a decision or a fix before the lights run on a real Sunday. The step knows a song by one cue only, so a song cue with a chain of builds or hits gets the wrong colour or the wrong cue (finding 1, a decision for Nick before #506 makes the template). And the colour method lets a near-black area win as the most saturated one, so a dark frame can give the lights a vivid colour the picture does not have (finding 2, a small fix). The other six findings are LOW: paths with no test, two gaps in the skill, and comments.

## Approach decisions
- Tests of the lights mode run the command as a child process against the fake Eos and the fake ProPresenter and assert what Nick sees and what the show holds (spec, Testing Decisions). A new case follows that seam. A picture no recording holds is a made PNG, named as made in `test/fixtures/propresenter/README.md`, served through `answerThumbnails` (precedent: `made-transparent.png`, and the cases at `test/set-builder-lights.test.ts:1626`). Added by this review.
- The colour method stays the spec's: the most saturated of the large areas, at the configured saturation. Finding 2 narrows "large area" to an area that is not near black, by one constant, and changes nothing else. Reversible by deleting the constant. Added by this review.
- The fake Eos answers only from recordings. A test that needs Eos to be late, or to leave Live, drives the fake with a knob in the style of `holdLabels`, `holdCopies`, `holdColours` and `holdSaves` (`test/fake-eos.ts:116-156`) and `emit` (`test/fake-eos.ts:187`), and sends only lines a recording holds. Added by this review.
- A timing test measures arrivals at the fake, never the whole run (precedent: `ec2520a`, "setlist-controller#502 review pass 1 finding 1", and the test at `test/set-builder-lights.test.ts:1608`). Carried from the ticket reviews.
- Which cue ends a song's chain is not decided, and no fix of finding 1 is made in place without that decision. Added by this review.
- A sentence added to a rule section of the build-set skill gets a trace in `.claude/skills/build-set/traces.md` in the same commit, and `TRACE_COUNT` (`test/build-set-skill.test.ts:20`) moves with it (#504). Carried from the ticket.
- A made picture is a file `made-<what it shows>.png` in `test/fixtures/propresenter/2026-11-12/`, 400 by 225, 8-bit RGBA, with the rule for its pixels written out in `test/fixtures/propresenter/README.md` so it can be made again, and a test serves it on Yes and Amen's thumbnail with `answerThumbnails`. A made picture that must be no picture is one more row of the list at "a song with no picture" in `test/set-builder-lights.test.ts`; one that must give a hue gets a case of its own beside it (precedent: `made-transparent.png`). Added by the remediation of 2026-11-13.
- The sentences Nick reads say "large areas that are not near black" and give no number. The number, 20 of 255 on a group's brightest channel, lives in `src/set-builder/colour.ts` alone, with the comment that says why. Both the sentence that says what the colour is and the sentence that says when there is no picture carry the words, in the usage text, `README.md` and `docs/install.md`. Added by the remediation of 2026-11-13.
- A changed sentence of the usage text in `src/set-builder/main.ts` wraps its paragraph again at 120 columns, from the changed sentence to the paragraph's end, and changes no other word. The paragraphs are wrapped that way already, and every test of the usage text reads it with the line breaks taken out (`unwrapped`). Added by the remediation of 2026-11-13.

## Confirmed Issues
### 1. The lights step knows a song by one cue, so a chain after a song cue gets the wrong colour, and an extra song's copy lands inside the last song's chain — MEDIUM
- **Location:** `src/set-builder/song-cues.ts:49-59` (where a copy is numbered) and `:65-66` (`after`); `src/set-builder/lights.ts:294` (the template's colour recorded into `after`); `src/set-builder/eos.ts:93` (`EosCue` holds a number and a label, no follow, hang or link); against `docs/install.md:419`.
- **Attribution:** introduced. `git log -S'const following = cues' 93854cf..HEAD -- src/set-builder/song-cues.ts` gives `7762b55` (setlist-controller#503 Lights: a fourth song copies the last song cue, a short set leaves one alone, and a second run changes nothing), and `git log -S'recordings.push({ cue: after' 93854cf..HEAD -- src/set-builder/lights.ts` gives `c831e0a` (setlist-controller#501 Lights: each song cue takes its ProPresenter background colour on the six colour lights). The sentence of the install doc it collides with is on the base (`git show 93854cf:docs/install.md` holds it once), from setlist-controller#376.
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

Proof: `repro/pre-pr-review-1.test.ts`, "finding 1", two cases, green at `e173d9a`: `after` is `'23'`, and the four cues are `['1', '11', '22', '22.5']`. Not recorded: whether Copy To gives the copy its source's follow, which would run song 4's cue on into the build too.

**Recommended fix** — None in place. This needs one decision from Nick, and both answers are small once it is made:
- (a) A template song cue has no chain. The step reads each cue's follow and hang from the cue list read it already makes, and stops before any write, with one line that names the cue, when a song cue has either. `docs/install.md:419` then says a build or a hit is not available in a weekly show file.
- (b) A song owns its chain. The step follows each song cue's follow, hang and link to the chain's last cue; `after` and a copy's number are taken past that cue; and the doc says a chain cue tracks its song's colour unless it holds one of its own.

**Remediation brief**
- **Design intent:** colour tracks forward in Eos, channel by channel, until a cue that holds a colour of its own. So the step records a colour into every song cue, then records the template's colour back into the first cue after the last song cue, so the closing look does not inherit the last song's colour (spec, "Colour tracks forward in Eos, so every colour is written explicitly"). The spec's template has the three song cues one after another with Closing next, and says nothing of a chain. The server fires only a song's own cue; anything else in a song runs on a follow or a hang inside the show file (#376).
- **Full surface:** `src/set-builder/song-cues.ts:49-59` and `:65-66`; `src/set-builder/eos.ts:93` and the cue read at `:182-198`, which drops arguments 19 to 21 of the reply; `src/set-builder/lights.ts:186-190` (where a problem found in the cue list stops the run before a write) and `:294`; `docs/install.md:380`, `:388` and `:419`; the usage text in `src/set-builder/main.ts` (the `--lights` paragraph, "Nothing is written to Eos with ..."); `README.md` (the same list); the "Every other problem" list of `.claude/skills/build-set/SKILL.md:150-167` with a trace; `test/fake-eos.ts`, whose cues would have to carry a follow as the recorded `list/0/31` reply does.
- **Must preserve:** every case of `test/set-builder-lights.test.ts` on `CHURCH_SHOW`, which has no chain; the decimal copy cases ("numbers the copies with decimals when the next whole number is a cue"); the second run ("copies no cue and ends with the cues, the labels and the levels of the first run"); `test/readme-lights.test.ts:288-293`, which pins "one cue per song" and "in set order".
- **Do not touch:** the order of the writes in `lights.ts` (copies, then labels, then colours, then the save), cleared under Reviewed and Dismissed; `numberBetween` in `song-cues.ts`, whose arithmetic two mutants could not break.
- **Proof:** `cp docs/reviews/setlist-controller-247/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 1'; rm test/pre-pr-review-1.test.ts`. Both cases are green now, since they pin today's decision. Under (a) they stay as they are and a new command-level case shows the refusal; under (b) they change to the chain's end.
- **Escalation:** not remediable in place. Which cue ends a song's chain is a rule of the rig, the ticket reviews of #501 and #505 each met one face of it and set it aside, and #506 makes the template the rule governs. Recommend a ticket of its own, decided before #506.

### 2. A near-black area of the picture wins as its most saturated one, so a dark frame gives the lights a vivid colour — MEDIUM
- **Location:** `src/set-builder/colour.ts:64-67`, with the saturation at `:71-77`.
- **Attribution:** introduced. `git log -S'const LARGE = 0.05' 93854cf..HEAD -- src/set-builder/colour.ts` gives `c831e0a` (setlist-controller#501 Lights: each song cue takes its ProPresenter background colour on the six colour lights); the file is new on this branch.
- **Real-world trigger:** a background whose first cue is a dark frame: a video that fades in from black, or a picture with a deep shadow that has a slight colour cast. The backgrounds are 4K nature videos, and one of the four recorded pictures (the peonies, `..._939B9443-..._thumbnail_0.png`) already has a shadow group at red 27, green 17, blue 13, which is 50% saturated. It gave the right hue only because the petals beside it are redder still. MEDIUM, capped: none of the six recorded thumbnails goes wrong today. It becomes certain the first week a pale picture has a tinted shadow over a twentieth of it; the check is the hue on the song's summary line against the picture, which #507 does in the room.

**Evidence** —
```ts
  const large = groups.filter(({ count }) => count >= LARGE * pixels.length).map(({ colour }) => hueAndSaturation(colour));
  const chosen = large.reduce((best, group) => (group.saturation > best.saturation ? group : best));
  return chosen.saturation < COLOURED ? undefined : Math.round(chosen.hue) % 360;
```
```ts
  return { hue: sector * 60, saturation: spread / most };
```
Saturation is the spread over the brightest channel, so it does not fall with brightness: red 3, green 2, blue 1 is 67% saturated.

**Failure mode** — Executed, `repro/pre-pr-review-1.test.ts`, "finding 2", three cases red at `e173d9a`:
- A frame that is black but for noise of 0 to 3 a channel gives hue 273, where the rule for a picture with no colour should make it no picture. The lights get a strong violet.
- A black frame with one level of red on every other pixel gives hue 0. The lights get red.
- Pale teal water (red 150, green 195, blue 200) with a dark warm shadow (14, 9, 5) over 12% of it gives hue 27, orange, where the water is hue 186.

The song's line prints the hue as a number and the background file, exit 0, so nothing marks the colour as wrong.

**Recommended fix** —
```diff
 const COLOURED = 0.05;
+const DARK = 20;
```
```diff
-  const large = groups.filter(({ count }) => count >= LARGE * pixels.length).map(({ colour }) => hueAndSaturation(colour));
+  const large = groups.filter(({ count, colour }) => count >= LARGE * pixels.length && Math.max(...colour) >= DARK).map(({ colour }) => hueAndSaturation(colour));
+  if (large.length === 0) return undefined;
   const chosen = large.reduce((best, group) => (group.saturation > best.saturation ? group : best));
```
A group whose brightest channel is under 20 of 255 is no area to take a hue from, and a picture with no other large area is no picture.

**Remediation brief**
- **Design intent:** the opaque pixels are grouped into five colours by k-means in red, green and blue, from fixed starts, so one picture gives one hue on every run. A group that holds at least 5% of the pixels is a large area. The most saturated large area gives the hue, and the lights take that hue at the saturation of `config/lights.json` and full value. A chosen area under 5% saturation means no picture, and the song keeps the template's colour, because the lights must never show a guessed colour (spec, stories 11 to 14 and 36). The fix keeps all of that and takes near-black areas out of the candidates.
- **Full surface:** `src/set-builder/colour.ts:12-16` (the new constant, with a comment that says what it is and why 20) and `:64-67`. Four comments turn false and are rewritten with the change: the file header at `:1-6`, the comment on `pictureHue` at `:23-25` ("no opaque pixel, or a chosen group under 5% saturation" gains "or no large area that is not near black"), and `:64` ("Five groups cannot all hold under 5%" stays true, but the list of large areas can now be empty). The sentences that say when there is no picture name the rule and gain the new case: the usage text at `src/set-builder/main.ts:134-135`, `README.md:137-139`, `docs/install.md:396` and `:400`, with the tests that pin them: `test/set-builder-lights.test.ts:2040-2041` and `:2089`, and `test/readme-lights.test.ts:191`. The three repro cases move into `test/set-builder-lights.test.ts` as command-level cases on made PNGs, by the Approach decisions, beside the cases at `:1626`.
- **Must preserve:** the hue of each recorded picture: Ancient Gates stays teal (`test/set-builder-lights.test.ts:888`; its water group is red 31, green 39, blue 41, so `DARK` must stay under 41) and the three pictures of "November 15, 2026" keep theirs (`:753`); the grey placeholder, the checkerboard of a slide with no background and `made-transparent.png` stay no picture; the same picture gives the same hue on every run. `pnpm exec vitest run test/set-builder-lights.test.ts test/fake-propresenter.test.ts` pins all of it, and gave 166 passed with this diff applied on a scratch worktree. The line the old filter held, "at least 5% of the pixels", is kept inside the new one.
- **Do not touch:** `colourAt` (`src/set-builder/colour.ts:81-90`) and the PNG decoder (`src/set-builder/png.ts`), both cleared under Reviewed and Dismissed. Do not rank by chroma (spread alone) instead: on Ancient Gates that picks the pink foam over the water, which the spec names as the wrong answer.
- **Failure of the fix itself:** a background whose only colour sits under 20 of 255 becomes no picture. That fails safe: the song keeps the template's colour and its line says "template colour, no picture" with the background file. A shadow brighter than 20 with a strong cast can still out-rank a pale bright area, as the spec's method allows; that is a tuning question for #507 in the room, not this fix.
- **Proof:** `cp docs/reviews/setlist-controller-247/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 2'; rm test/pre-pr-review-1.test.ts`. Three failed now, three passed after. Then `pnpm exec vitest run test/set-builder-lights.test.ts test/fake-propresenter.test.ts`, which must stay green.

### 3. Losing Live in the middle of a run has no test: five guards can be deleted with every test green — LOW
- **Location:** `src/set-builder/lights.ts:203`, `:230`, `:254` and `:320`; `src/set-builder/eos.ts:173`, with its catch at `src/set-builder/lights.ts:112`; `test/fake-eos.ts:628` and `:635`.
- **Attribution:** introduced. `git log -S'if (!live()) return notLive();' 93854cf..HEAD -- src/set-builder/lights.ts` starts at `daa5ef9` (setlist-controller#500 Lights: the lights mode labels the song cues in the weekly show file and saves it).
- **Real-world trigger:** none today, since the code is right. The cost is a later change that drops one of these guards with every check green. A console that leaves Live mid-run is someone pressing Blind or Patch in ETCnomad during the 10 to 30 seconds the step runs.

**Evidence** — `test/fake-eos.ts:628` echoes every command with a fixed prefix: ``const echo = `LIVE: Cue  ${current ?? ''} : ${text.replace(/#$/, '').replaceAll('_', ' ')}`;``. `setCommandLine` (`test/fake-eos.ts:866`) changes the connect burst only, and the one test that uses it, `test/set-builder-lights.test.ts:645`, covers a console that is not in Live at the start.

**Failure mode** — `repro/pre-pr-review-1-mutants-live.diff` deletes the guard in `command()` and the checks before the first Go To Cue, before the copies and before the labels, and turns the check before the save into `if (false)`. Applied on a scratch worktree at `e173d9a`, `pnpm exec vitest run test/set-builder-lights.test.ts` gives 121 passed. Each of the five also survives alone. So no test shows that the step stops writing, says the open show is changed, or leaves the save to Nick once the command line leaves Live.

**Recommended fix** — Give the fake Eos one knob that sends a recorded command line that is not LIVE (the Blind line of 2026-11-02 that `test/set-builder-lights.test.ts:650` already uses) on `/eos/out/cmd` once a message matching a pattern has been answered. Add one command-level case per guard, each asserting the one problem line, exit 1, and that the fake received nothing but reads after the line was sent:
- after the cue list read, before the first Go To Cue: "Put Eos in Live", nothing written;
- after the last channel read, before the copies, with a set of four songs;
- after the copies are read back, before the labels: the line ends with the changed-and-not-saved sentence;
- after the first Record Only is answered: the next Go To Cue is not sent, and the line comes from `EosNotLive` with the changed-and-not-saved sentence;
- after the last Record Only: the song lines print, and the line says to save the show by hand, with no save received.

**Remediation brief**
- **Design intent:** every command line command and every write runs only while the command line reads LIVE (spec, "The Eos commands"). The step checks before each phase (`live()`), and `command()` checks again before each send, because the recordings (`colour-set.json` and the rest) show a second or more between phases. Once a copy, a label or a colour is in the open show, a stop says the show is changed and not saved; once every colour is recorded, a stop before the save says to save by hand.
- **Full surface:** `test/fake-eos.ts:113` and `:866` (the knob beside `setCommandLine`, with its line in the `FakeEos` type), `test/fake-eos.test.ts` (one case for the knob itself), and the new cases in `test/set-builder-lights.test.ts` beside `:642-662`. No file under `src/` changes.
- **Must preserve:** the fake answers from recordings only, so the knob sends a recorded line and invents no answer to a command sent outside Live (none is sent). `test/fake-eos.test.ts` and `test/eos.test.ts` share the fake and must stay green.
- **Do not touch:** the guards themselves, and the wording of the three problem lines, which the build-set skill quotes (`.claude/skills/build-set/SKILL.md:159`, `:165`, `:166`).
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-1-mutants-live.diff && pnpm exec vitest run test/set-builder-lights.test.ts`. It passes now (121 passed), which is the failure. After the fix it must fail, and each of the diff's five hunks applied alone must fail too.

### 4. The waits the real Eos needs have no test that needs them — LOW
- **Location:** `src/set-builder/eos.ts:205` (the settle after a Go To Cue), `:98` and `:226-233` (the half second between the keys of a save), `:236` (the wait for a saved event that comes after the keys); `src/set-builder/lights.ts:173-181` (`leftOf`, the read again of a copy, a label or a colour); `test/set-builder-lights.test.ts:216` and `:1435`, which set `EOS_SETTLE_MS` to 0 on every run.
- **Attribution:** introduced. `git log -S'settleMs' 93854cf..HEAD -- src/set-builder/eos.ts` gives `c831e0a` (setlist-controller#501 Lights: each song cue takes its ProPresenter background colour on the six colour lights).
- **Real-world trigger:** none today. These waits are what the recordings were made with: every read came a second after a Go To Cue, the keys of the one recorded save were half a second apart, and a label set notified a second later. The fake answers everything at once, so a change that removes a wait passes every check and fails only on the real console.

**Evidence** — `test/set-builder-lights.test.ts:212-216`: "EOS_SETTLE_MS is 0: the mode waits a second after each Go To Cue for the real Eos, and the fake answers at once." The fake's knobs hold a label, a copy, a colour or a save for ever (`holdLabels`, `holdCopies`, `holdColours`, `holdSaves`), and none lets one arrive late.

**Failure mode** — `repro/pre-pr-review-1-mutants-waits.diff` deletes the settle wait, makes `leftOf` read once, makes `save()` return without waiting for a late saved event, and sets the key gap to 0. Applied on a scratch worktree at `e173d9a`, `pnpm exec vitest run test/set-builder-lights.test.ts` gives 121 passed. Each of the four also survives alone. This is the sibling of the one-second ProPresenter wait that `ec2520a` gave a real test.

**Recommended fix** — Four cases, by the Approach decisions:
- the fake Eos records when each message arrives, as `test/fake-propresenter.ts:101` does (`arrivals`), and one run on the set of one song with no `EOS_SETTLE_MS` asserts that each `/eos/get/params` read comes at least 990 ms after the Go To Cue before it;
- the same run asserts that the four key messages of the save arrive at least 490 ms apart;
- a label, a colour and a copy that the fake applies only after the first read back, each ending at exit 0 with the show as an ordinary run leaves it;
- a saved event sent after Shift is released (`holdSaves()`, then `emit` of the recorded event once the fake has received `/eos/key/shift` 0), ending at exit 0 with the show path printed.

**Remediation brief**
- **Design intent:** Eos gives no direct answer to a label set, a colour set or a key, so the step reads back until it sees what it sent or the answer limit passes, and it waits a second after each Go To Cue because that is the only gap a recording proves gives the cue's levels (`test/fixtures/eos/README.md`: "A read 1 s after a Go To Cue in no time gave the cue's levels"). `EOS_SETTLE_MS` and `EOS_TIMEOUT_MS` exist for the tests alone (`src/set-builder/main.ts:590-595`).
- **Full surface:** `test/fake-eos.ts` (arrival times on `received` or beside it; a late variant of `holdLabels`, `holdColours` and `holdCopies` at `:116-127` and `:820-829`), `test/fake-eos.test.ts` (a case for each new knob), and the new cases in `test/set-builder-lights.test.ts`. No file under `src/` changes.
- **Must preserve:** every other run keeps `EOS_SETTLE_MS: '0'`, or the file's three minutes grow by a second for each Go To Cue. The timing cases measure arrivals at the fake, never the whole run. The hold cases at `test/set-builder-lights.test.ts:1398`, `:1413`, `:1723`, `:1948`, `:1973` and `:1992` keep their lines.
- **Do not touch:** `EOS_LIMITS` (`src/set-builder/eos.ts:22`) and `KEY_GAP_MS` (`:98`), whose values are the recordings'.
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-1-mutants-waits.diff && pnpm exec vitest run test/set-builder-lights.test.ts`. It passes now (121 passed), which is the failure. After the fix it must fail, and each of the four hunks alone must fail too.

### 5. The large-area rule and four fallback paths have no test — LOW
- **Location:** `src/set-builder/colour.ts:12` and `:65` (an area needs 5% of the pixels); `src/set-builder/png.ts:26`, `:29-31`, `:48` and `:52` (a PNG cut short, one that is not 8-bit RGBA, picture data cut short, a filter no PNG has); `src/set-builder/weekly-show.ts:22` (a template that cannot be read) and `:39-44` (a copy that fails part way takes its own file away).
- **Attribution:** introduced. `colour.ts` and `png.ts` came with `c831e0a` (setlist-controller#501), `weekly-show.ts` with `b960320` (setlist-controller#499 Lights: the build makes the weekly show file from the template).
- **Real-world trigger:** none today. The 5% rule is the spec's guard against a small vivid mark, such as ProPresenter's media marks, deciding the colour, and nothing would notice its loss.

**Evidence** — `git grep -n 'interlac\|cut short' -- test/set-builder-lights.test.ts` finds nothing; the one decoder failure a test reaches is "it is no PNG" (`test/set-builder-lights.test.ts:1628`, a JSON file served as the picture). `test/set-builder-weekly-show.test.ts:280-299` covers a show folder that is a file (`ENOTDIR`) and no other cause.

**Failure mode** — `repro/pre-pr-review-1-mutants-large.diff` sets `LARGE` to 0, so any group counts as a large area. Applied on a scratch worktree at `e173d9a`, `pnpm exec vitest run test/set-builder-lights.test.ts` gives 121 passed. The other paths are untested by reading: no test names their lines or their causes. A template with no read permission was run by hand through the build and behaved as written (exit 1, one line, no weekly file).

**Recommended fix** — Command-level cases, by the Approach decisions:
- a made PNG that is pale teal with pure red over 3% of it: the song takes the teal hue, not hue 0;
- a made PNG cut short, and a made 8-bit RGB PNG with no alpha: each song keeps the template's colour with "the picture cannot be read";
- a build with a template of mode 000, beside the `ENOTDIR` case: exit 1, the one line with the cause, and no weekly show file.

The cleanup at `weekly-show.ts:39-44` has no way in through the command; leave it without a test and say so in the commit.

**Remediation brief**
- **Design intent:** the spec's colour method takes "the groups that hold at least 5% of the pixels", and the decoder reads the one kind of PNG ProPresenter 22 sends and names why it will not read another. A picture that cannot be read is a song with no picture, never a stop. A weekly show file that cannot be made is one line and exit 1, with the set still built.
- **Full surface:** new cases in `test/set-builder-lights.test.ts` beside `:1626` and in `test/set-builder-weekly-show.test.ts` beside `:280`; the made PNGs under `test/fixtures/propresenter/2026-11-12/`, each named as made in `test/fixtures/propresenter/README.md`, as `made-transparent.png` is. No file under `src/` changes.
- **Must preserve:** the fake ProPresenter serves recorded answers unless a test replaces one with `answerThumbnails`; `test/fake-propresenter.test.ts` lists the folder's files and must be told of a new one if it counts them.
- **Do not touch:** the decoder's filters and the Paeth tie order, cleared under Reviewed and Dismissed.
- **Proof:** on a scratch worktree at the fix's HEAD, `git apply docs/reviews/setlist-controller-247/repro/pre-pr-review-1-mutants-large.diff && pnpm exec vitest run test/set-builder-lights.test.ts`. It passes now (121 passed), which is the failure, and must fail after. When finding 2's fix lands first, the diff's context line still applies.

### 6. When a build exits 1 only because the set manifest could not be written, the skill never shows the weekly show file or runs the lights — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:32` (Steps step 6, exit 1) and `:140` (After the build).
- **Attribution:** introduced. `git log -S'After the build.' 93854cf..HEAD -- .claude/skills/build-set/SKILL.md` gives `5fd669d` (setlist-controller#504 The build-set skill carries the lights step).
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

### 7. The skill cannot carry `--connections-config`, which the install doc's weekly routine relies on, nor `--show-folder` on a build — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:142` (The lights command), `:169` (The lights alone) and `:28` (Steps step 4), against `docs/install.md:404`.
- **Attribution:** introduced. The skill's sentences came with `5fd669d` (setlist-controller#504), the doc's with `fe539c9` (setlist-controller#505 Lights: the install doc describes the lights step and the template show file).
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

### 8. Comment hygiene — LOW (aggregated)
- `src/set-builder/png.ts:15-16` — "Throws an Error whose message says why the file is not one this decoder reads, to follow "the picture cannot be read:" in a problem line." → "Throws an Error whose message says why the file is not one this decoder reads. The lights mode prints only that the picture cannot be read (lights.ts)." The message is dropped at `src/set-builder/lights.ts:377-379`.
- `src/set-builder/eos.ts:70-72` — "Eos sends the cue's fire event, as for a Go, and every colour set by hand is gone." → "Eos sends the cue's fire event, as for a Go. Not recorded: whether a colour set by hand and not recorded is still live after it; the fake Eos drops it." No recording sets a colour, leaves it unrecorded and goes to another cue; `test/fixtures/eos/README.md:47` already lists it as part of the model.
- `docs/install.md:378` — "changes two things in it, and nothing else: the label of each song cue ... and the colour of the six colour lights in each song cue" → "changes two things in each song cue: its label ... and the colour of its six colour lights". The next paragraph (`:380`) says what else it writes: the colour of the first cue after the last song cue, recorded back, and a copy for each extra song.
- `e2e/lights.spec.ts:46` — "A show of a few hundred cues, as the whole library in one cue list, each labelled." → "A show of a few hundred cues, each labelled, to prove the lights' row on a long list." Pre-existing, and made stale by this epic, which replaces the one-list decision of #376; the constant `LIBRARY` beside it reads the same way.

## Needs Further Investigation
### A. A Record Only of the colour that already tracks into a cue, followed by a change to an earlier cue — a recording on a test copy of the show
The step records in set order (`src/set-builder/lights.ts:290-299`). When the song cues are out of list order (a template whose `Song 2` is numbered before its `Song 1`), a later cue is recorded before an earlier one. If Eos stores nothing for a Record Only whose colour equals what tracks into the cue, as it changed nothing for a cue that already held the colour (`record-only-same-colour.json`), the earlier cue's new colour then tracks into the later one. The fake Eos makes the value the cue's own (`test/fake-eos.ts:583-586`), which is a model. Recording that case settles it; sorting the recordings by cue number would make the question moot.

### B. A Go To Cue onto a cue with a follow or a hang — a recording
No recording holds a Go To Cue in no time onto a cue with a follow. If Eos runs the follow, the read a second later (`src/set-builder/lights.ts:205-216`) gives the next cue's levels as the template's. This joins finding 1's decision.

### C. A colour set by hand before the run — a recording
Whether a colour set by hand and not recorded survives a Go To Cue is not recorded (finding 8's second entry). If it survives, a colour Nick left on the six lights before the run reads as the template's colour of the first cue the step goes to.

### D. A colour channel with no fixture — a read by hand
What Eos answers to `/eos/get/params/<chan>` for an unpatched channel is not recorded. With no reply, a wrong `colourChannels` reads as "Eos at <host>:<port> did not answer" and not as the "no colour light" line (`src/set-builder/lights.ts:208-214`).

## Reviewed and Dismissed
- Eos names a save after the show inside the file, so the step's save would land under the template's name — recorded otherwise: the test copy was a renamed copy whose show name still read `Church Sunday 2026-11-08`, and Eos saved it as `Colour test recording <time>.esf3d` (`test/fixtures/eos/README.md`).
- Every template colour of the test show is the same in each cue, so a recording from the wrong cue would pass — two mutants that do exactly that are killed, by the second run case and the fourth song case.
- A stale `/eos/out/cmd` taken as a command's answer — each recorded command gets exactly one, every wait is registered before its send, and a wait that times out ends the run.
- The order of the writes (path and Live checked first, every ProPresenter read before the first Go To Cue, copies, labels read back, colours read back, save last) — read in full, and every mutant of it in the table above is killed.
- `numberBetween` and `written` in `song-cues.ts` — whole thousandths throughout; 22 and 23 give 22.5, then 22.7; two mutants killed.
- `colourAt` — standard hue to red, green and blue at full value, checked at hues 0, 60, 120 and 240; the saturation mutant is killed.
- The PNG decoder's filters, the Paeth tie order, several IDAT chunks and huge sizes — correct, and the recorded pictures use all five filters.
- `large.reduce` with no first value at `colour.ts:66` — five groups cannot all hold under 5% of the pixels. Finding 2's fix adds the guard its own change needs.
- The date match on a playlist's name ("November 1, 2026" inside "November 11, 2026") — the name rule keeps the comma and the space, so neither holds the other.
- A 403 asked again five times, five seconds for a song this Mac is not authorized for — the ticket's own rule (#502's correction).
- The strict compare of the open show's path, with no `realpath` — it can only refuse.
- Newest by name in the repeated hour of a clock change — one hour a year, and the step then refuses the older file.
- An empty `--show-folder` resolves to the folder the command runs from — the same as `--output-root` has always done.
- A weekly show name that ends in a date confuses Eos's own time suffix — the church show's name was `Church Sunday 2026-11-08` and Eos read it whole.
- The recorder's lights modes send a write before their guards — none does; both cleanups are guarded, and the tests pin the refusals.
- "In set order" at `docs/install.md:413` — true of the template the doc describes, and pinned at `test/readme-lights.test.ts:288-293`.
- The 14 added or changed tests that pass at the base — each tests a test-side parser copied with it, or pins what the base already did and the branch must keep (see Test quality).

## Minor / nits
- `src/set-builder/lights.ts:263`: when some labels are taken and others are not, the line says the show is not saved and adds the changed-and-not-saved sentence only when a copy was made. A second run goes through either way.
- `src/set-builder/lights.ts:322`: if Eos stops answering between its saved event and the show path read, the line says the open show is changed and not saved, of a show that was saved.
- `src/set-builder/lights.ts:156`: the open show's path is read once at the start and again only after the save. A show opened by hand during the run would be written to. The recorder has the same gap and its README says so.
- `src/set-builder/main.ts:261-281`: `lights()` has no catch for an error `lightsStep` does not know, so one would print a stack. No input was found that reaches it.
- `src/set-builder/lights-config.ts:40`: the line for a top level that is no object names two of the five keys the file must give.
- `src/set-builder/lights-config.ts:78-96`: a show name with a space at either end passes, and a colour channel has no upper limit.
- `src/set-builder/propresenter.ts:62-79`: a 200 that is not the JSON expected reads as no playlist, or as a playlist with no songs, in which case every song keeps the template's colour and the run exits 0.
- `src/set-builder/song-cues.ts:36-37`: a song titled like another song's cue label, "Song 1", takes that cue.
- `scripts/eos/record-eos-fixtures.py`: the Enter that confirms a Record Only is not checked to end ` #`, and the path guard before the `--lights` cleanup has no refusal test of its own.
- `src/set-builder/main.ts:258` runs to 150 columns in a file that wraps at 120.

## Test quality
Tests added or changed: 843 in 15 files, of which `test/set-builder-lights.test.ts` (121) and `test/set-builder-weekly-show.test.ts` (31) are new. Against `93854cf`: 372 red, 358 untouched and green, 99 tests of the two fakes green by construction, and 14 added or changed tests green: nine in `test/build-set-skill.test.ts` that test the trace parser of `test/build-set-traces.ts`, one in `test/build-set-skill-quotes.test.ts` that checks every flag the skill names against the usage text, and four in `test/set-builder-weekly-show.test.ts` that check a listing or a skeleton leaves the default show folder alone. None is vacuous; keep all 14. The base oracle is coarse here, since most reds are an unknown flag or a missing module, so the stronger measure is the mutation sweep: 25 of 35 killed, and the ten survivors are findings 3, 4 and 5. Shapes found, all LOW and none needing a change by itself: three cases of `test/fake-eos.test.ts` (`:387`, `:546`, `:901`) and two of `test/fake-propresenter.test.ts` (`:514`, `:532`) compare the fake to the recording it was built from, each with a sibling case that uses another value; `test/eos-recording-scripts.test.ts:880` takes its expected bytes from the app's own encoder; three titles in `test/set-builder-lights.test.ts` (`:1079`, `:1141`, `:1687`) say "changes no intensity" of a fake that has no way to change one, and only `:753` holds the real guard, its list of every address and command sent. The fake Eos models cue list 1 alone, so a mutant that hard-codes list 1 would survive; not run.

## Before opening the PR
- **CI readiness:** the repo has no CI. The full checks are green at `e173d9a`: lint, typecheck, 3145 tests, build, 138 Playwright tests.
- **Commit hygiene:** the tree is clean. 24 commits, two per ticket where a lane merged, each subject with its issue. This doc and `repro/` are the only files to add.
- **Likely reviewer asks:** the Mac's user name is in three Eos fixtures (`show-path.json`, `show-save.json`, `show-path-after-save.json`), kept as Eos sent it and named in the fixture README; the repository is private, and scrubbing it is Nick's call. Finding 1's decision, before #506 makes the template. The thirteen proposals the ticket reviews set aside (a half-written weekly file after a killed copy, a presentation read asked once, the notify sequence of the fake, the decimal cue recordings and the rest) were not judged again here.

## Verdict
Ready with follow-ups: fix finding 2 before the PR opens, and decide finding 1 in a ticket of its own before #506 makes the template.

Finding 2 is a two-line change with its proof in `repro/`. Finding 1 cannot be fixed in place: it needs Nick's rule for a song cue's chain, and until the template exists no show file has the shape. Findings 3 to 8 are LOW and can ship as follow-ups or go in one remediation round: three are tests to add with no change under `src/`, two are sentences of the skill, one is four comments. No prior review exists for this epic, so there is no earlier finding to close.

## Remediation — 2026-11-13
Scope: CRITICAL, HIGH and MEDIUM, which is findings 1 and 2. Findings 3 to 8 are LOW and are left for Nick on purpose.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | — skipped | — | — | escalated: split ticket recommended. The brief's Escalation line and the Approach decisions both say no fix is made in place without Nick's rule for which cue ends a song's chain, (a) or (b) of the Recommended fix, decided before #506 makes the template. Carried as a proposal in `.epic-loop/stage2/proposals.md`. |
| 2 (MEDIUM) | `b91fd1d` setlist-controller#247 pre-PR review 1 finding 2: a near-black area of the picture won as its most saturated one, so a dark frame gave the lights a vivid colour | red→green: `cp docs/reviews/setlist-controller-247/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t 'finding 2'; rm test/pre-pr-review-1.test.ts`, 3 failed before and 3 passed after. The three cases are now command-level cases on made PNGs in `test/set-builder-lights.test.ts`, "a song with no picture": 3 failed before the change (hue 273, hue 0, hue 27) and pass after. Preserve suites after: `pnpm exec vitest run test/set-builder-lights.test.ts test/fake-propresenter.test.ts test/readme-lights.test.ts test/set-builder-command.test.ts test/set-builder-weekly-show.test.ts test/build-set-skill.test.ts test/build-set-skill-quotes.test.ts test/build-set-skill-examples.test.ts`, 644 passed, and `pnpm typecheck` passes. | 12 lines, all named by the brief's Full surface: 3 new lines on the constant `DARK` that say what it is and why 20 (it must stay under 41, the water of Ancient Gates), 8 lines that rewrite the three comments of `colour.ts` the change made false, and 1 line of `test/fake-propresenter.ts` that named `made-transparent.png` as the only made picture. The gate's thirteenth line is a line of the usage text that starts `--show-folder`, not a comment. | fixed, proved by execution. No agent: MEDIUM, with the proof run red and green in the repo's runner and the preserve suites green. The hue of every picture in the fixtures was also compared before and after the change, by a script over the 11 PNG files: the three made for this finding changed (273 to none, 0 to none, 27 to 184) and the other eight are the same (none, none, 27, none, 41, 188, none, 6). |
| 3 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 4 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 5 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 6 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 7 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |
| 8 (LOW) | — deferred | — | — | not worked: LOW, outside this round's scope |

Sites of finding 2 the brief's Full surface did not name, found by the grep before the fix: `test/readme-lights.test.ts:217` pins "under 5% saturation" in `docs/install.md`, and still holds, since the sentence keeps those words; the comment at `src/set-builder/lights.ts:369-370` says a picture "with no opaque pixel or no colour" is no picture, which stays true and is unchanged; the comment at `test/fake-propresenter.ts:85` named the one made picture and is corrected in the commit.

One thing the fix leaves as it found it: `docs/install.md` (the paragraph on "No picture") tells Nick to copy the background file to the playback Mac and to check the first slide's background. Neither helps a background whose first frame is near black, which now reads as no picture too. The paragraph names the new cause and gives no step for it, since what Nick should do then (another first slide, another background, or leave the template's colour) is a choice the brief does not make.

Full checks at `b91fd1d`, after `pnpm install --frozen-lockfile`: `pnpm lint` and `pnpm typecheck` pass, `pnpm test` gives 96 files, 3148 passed and 4 skipped (the 3145 of the review and the three new cases), `pnpm build` passes, and `pnpm test:e2e` gives 138 passed. No test flaked.

### Known regressions, deferred
None. The verify pass found no defect the round introduced.

### Rework briefs
None. No fix was reworked.
