# Pre-PR review: setlist-controller#59 Song transitions: overlap into the next count-off, a prayer pad, and fades

**Branch:** `setlist-controller-59-song-transitions` vs `origin/setlist-controller-32-set-builder` (merge-base `e4aa4e6` "setlist-controller#32 pre-PR review 2")
**Reviewed at:** HEAD `ee13465` (setlist-controller#79 Count an audio end a few samples past a bar line as on it, for the Pad locator and the gap alike), clean tree: 0 files with uncommitted changes, 0 untracked; 62 files total, +6749 / -225 against the merge-base
**Reviewed against:** the epic body of setlist-controller#59 and the bodies of its sub-issues #61 to #70 and #72 to #79 (the seven stage 2 tickets #72, #73, #74, #75, #77, #78 and #79 landed after review 3, at `320bb27`); the stage 2 tickets' recorded decisions and proposals (`.epic-loop/tickets/<n>/assumptions.md` and `proposals.md`), read so that a recorded decision is not re-reported as a defect; `pre-pr-review-1.md` to `pre-pr-review-3.md`: their Approach decisions, Reviewed and Dismissed, and the LOW findings still open. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 4 of the branch's review series, run `--fresh`: the whole working surface, not a delta.
**Date:** 2026-10-17
**Reviewer:** 3 code-review agents + 1 test-audit agent + 1 differential-harness agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | lockfile up to date, nothing installed |
| Lint | `pnpm lint` | pass, `docs/` included (and this round's repros under `repro/`) |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 28 files, 547 passed, 2 skipped (the two `it.runIf(linux)` cases in `test/setup-screen.test.ts`, unchanged) |
| Build and Playwright | `pnpm test:e2e` (runs `pnpm build` first) | build ok; 8 passed (webkit-ipad), `e2e/fade-out.spec.ts` included |
| A gap-only build writes what the base writes (story 1) | differential harness: `buildSet` at HEAD and at `e4aa4e6` imported by absolute path, identical inputs from HEAD's fixture library; BuildResult, every written file (path, size, sha256) and the gunzipped `.als` compared, output root normalised | 1153 cases. The 128 on unmodified fixtures (every order of 1 to 4 songs, no `transitions` and `{}`) are identical but for the added `transition: { type: 'gap' }` on songs 1 to n-1. End-marker variants differ only where #79 says they do: Goodness of God with its End removed or moved to or before its audio end (318.00004943) starts its gap on 318, and every time at or after its old gap start is exactly 4 beats earlier; an End at 318.00008, past the audio end, changes nothing. Trust In God, Grace and Great Are You Lord variants are identical |
| The stage 2 tickets change only what they mean to (overlaps and pads) | the same harness, HEAD against `320bb27`, 30-second pad WAVs for every key, both templates | 1816 cases: 1499 identical, 317 differ, all of them builds with a pad after Goodness of God, whose Pad locator moves from 322 to 318 with the Pad section length unchanged and every later time exactly 4 beats earlier (locators, clips, tempo and meter) and each later start bar 1 lower. No build newly stops or throws. 5 negative controls differ, 3 positive controls are identical. Harness kept in the session scratchpad, not in `repro/`, since it proves no finding |
| `matchSongs` after #78 moved the pads exclusion into it | harness: HEAD's `({ library, pads }, names)` against `320bb27`'s `(library, names, reserved)` with the `reserved` list its `buildSet` computed | 21 setups (the default `_pads`, a `--pads` folder inside, nested in and outside the library, relative paths, trailing slashes, `./`, an unreadable library) times 30 names: identical |
| Every `--list` short name names its own folder | finder B: the seven-folder library of the skill's worked examples rebuilt as empty folders with `_template` and `_pads` | `pnpm build-set --list` prints exactly the seven lines `SKILL.md` holds, in its order; each short name matches its own folder |
| Command usage errors | finder B, the real CLI: `--pad` with no value, `--pad -x`, `--list=1`, `--overlap=-1`, `--pad 1=g`, `--pad "1= G"`, `grace --list`, `--list --library` with no value, `--overlap 1` on one song, `--pad 1 --pad 01` | each exits 2 with the usage text and builds nothing |
| `SKILL.md` against the code | finder B, read against `main.ts`, `song-list.ts`, `pads.ts` | its commands, flags, listing format, exit codes, date rule, minor-root and enharmonic pad rules and the fix for an unreadable pads folder match the code; nothing runs before Nick's yes but `--list` |
| The fade's states and the controller's gates | finder C: every interleaving of Stop, Live stopping, a jump, a loss and a regain, a second press, a stale reply and close traced; 5 controller test files run in a scratch worktree | clean; two `lost` guards stay green when deleted, both unreachable (Minor / nits) |
| Tautology audit, oracle `e4aa4e6` | test-audit agent: every added or modified test file, both harnesses and the new fixture copied into a scratch worktree at the merge-base; tests keyed by describe path and name, bodies compared by AST | 234 tests added or changed (183 declarations): 219 red, 15 green (see Test quality); `test/fade-out.test.ts` and `test/pages.test.ts` red on import |
| Tautology audit, oracle `320bb27` | the same, for the stage 2 tickets' test changes | 62 tests added or changed: 51 red, 11 green (see Test quality) |
| Mutations of the stage 2 rules | test-audit agent, scratch worktree at HEAD, each alone | red: the tolerance set to 0 (18 tests), the tolerance on a gap's End (1), the Ending check made tolerant (1), the earlier-ring walk cut to the pair (6), the Ending check as a modulo of the starting bar (15), the repeated `--pad` check removed (3), `_pads` or the `--pads` folder listed (1 each), a pair preferred over one word (2), the restore window at 4100 ms (2) and at 6100 ms (1). All green: the tolerance's boundary made strict (finding 4), the walk run on through a gap or a pad (finding 4), and the overlap's bar count made tolerant (an equivalent mutant, Reviewed and Dismissed) |
| Earlier rounds' proofs still run | `git apply` of each `repro/review-1-mutation-*.diff` and `repro/review-2-mutation-*.diff` at HEAD, then the suites; both review 2 repro tests copied into `test/` and run | review 1's two diffs: 11 and 24 tests red, still pinned. Review 2's six that apply stay green in the suites and red in their repro (findings 5 and 6); `review-2-mutation-ring-raw-start.diff` no longer applies, since #72 rewrote `slotProblems`, and its rule, adapted to `holdsAt` (`repro/review-4-mutation-ring-raw-start.diff`), keeps 284 of 284 set-builder tests green while the review 2 repro goes red |
| Finding 1 repro | `repro/review-4-builder-edges.test.ts`, "review 4 finding 1" | red at HEAD, both rows: both pads build. With the recommended fix in a scratch worktree (since removed): both rows green, 284 of 284 set-builder tests green, `tsc` and lint clean |
| Finding 2 repro | `repro/review-4-builder-edges.test.ts`, "review 4 finding 2" | red at HEAD: 293.7727 s of audio for 294.6554 s of set time. The same invariant passes for Goodness of God into This Is Amazing Grace alone (control) |
| Finding 3 proof | the real CLI on a scratch library holding `_Pads`, `_Template` and `My-Pads` | `--list` prints `"_pads"  no key  _Pads` and `"_template"  no key  _Template`, and `--pads <library>/my-pads` still lists `My-Pads`. With the recommended fix: none of the three listed, 284 of 284 set-builder tests green |
| Finding 4 repro | `repro/review-4-unpinned-rules.test.ts` | 3 of 3 green at HEAD; red under `repro/review-4-mutation-tolerance-strict.diff` (1) and `repro/review-4-mutation-walk-through-gap.diff` (2); lint and `tsc` clean |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #71 is Nick's run by ear and on the iPad, #76 the contract check against real Live |

**Overall:** The branch holds up. The full checks are green, a gap-only service is still byte-identical to what the base writes, and the seven stage 2 tickets change exactly what they set out to: across 1816 transition builds the only difference from `320bb27` is a pad after Goodness of God starting a bar earlier, carried through consistently. No finding reaches MEDIUM. The seven LOW findings are three builder edges that no library song reaches (a locator after a song's audio end before a pad, a ring through a song only a couple of bars long, a reserved folder named in another letter case), two rules the stage 2 tests do not pin, and the four LOW findings reviews 2 and 3 left open, still open. The PR can open; all seven suit the loop's remediation or a follow-up.

## Approach decisions
Round 1's to round 3's Approach decisions (`pre-pr-review-1.md`, `pre-pr-review-2.md`, `pre-pr-review-3.md`, `## Approach decisions`) stand unchanged, and so do the stage 2 tickets' recorded decisions: the earlier-ring walk runs only through an unbroken run of overlaps and counts in each earlier song's own beats (#72); an overlap's Ending is checked exactly, and only an audio end gets `ON_BAR_LINE_TOLERANCE`, 1e-4 beat (#75, #79); a repeated `--pad` is checked before the both-flags rule (#77); the short-name candidate order (#78); the restore window of 5100 ms (#73). This round adds:
- **Locators of a song a pad follows (finding 1):** a problem in the one-pass list, not a dropped locator, since the song keeps every locator before a pad (story 27) and the Pad section is its last section (story 28). The check reads the Pad locator through one helper exported from `timeline.ts`, built on placement's own `onOrNextBarLine` and `meterOf`, as `onBarLine` serves the Ending check (#75), and guards a song with no starting tempo or meter with `hasStartingValues`, as round 1's starting-values decision requires of any check that calls `meterOf`.
- **A ring through a short middle song (finding 2):** escalated, not decided here. The recommendation is to convert the ring through the tempo the set plays after each handoff, which keeps #72's choice that such a chain builds when its slots fit; the alternative, a problem that stops the chain, overturns it.
- **Reserved folder names (finding 3):** compared in any letter case, `_template`, `_pads` and a `--pads` folder in the library alike, as pad file names are matched in any letter case (round 1's decision on pad file names, `9f94144`).
- **Unpinned rules (findings 4 to 6):** test-only, as round 2 decided: one test per rule, in the describe block that already holds that rule's tests, each red under its mutation diff in `repro/` and green at HEAD. No source change, and no existing assertion is weakened or removed.

## Prior-review closure
This round is `--fresh`, so it re-reviewed everything rather than a delta, but the findings earlier rounds left open were re-checked at HEAD.
- **Review 3, finding 1 (LOW), untouched.** Both comment hygiene entries (the test title and the `docs/install.md` sentence) are still as they were: carried into finding 7.
- **Review 2, finding 1 (LOW), untouched.** The three fade lines are still unpinned; their mutation diffs still apply and their repro still goes red under each: finding 5.
- **Review 2, finding 2 (LOW), untouched.** The four builder rules are still unpinned; three of the four mutation diffs apply, the fourth is replaced by `repro/review-4-mutation-ring-raw-start.diff`: finding 6.
- **Review 2, finding 3 (LOW), untouched.** The `PadFile.key` comment is still stale: carried into finding 7.

Zero prior findings of MEDIUM or higher are open, so none is partially fixed or untouched at that level, and none was deferred.

## Confirmed Issues

### 1. A locator the song holds at or after its Pad locator ends the Pad section early, and past the section's end the controller warns on the set — LOW
- **Location:** `src/set-builder/write-set.ts:349` (`kept` keeps every locator of a song a pad follows) and `:360` (the Pad locator added beside them), with the pad branch of `placeSongs`, `src/set-builder/timeline.ts:74-79`; no check in `buildSet`'s list, `src/set-builder/build-set.ts:108-118`
- **Attribution:** introduced by `df291e7` (setlist-controller#66 Pad tracer bullet), per `git log -S'if (pad && first) locators.push' e4aa4e6..HEAD`; the base has no pad.
- **Real-world trigger:** a song whose set holds a named locator after the bar line its audio ends on. No library song does: every one has only its end marker after its Ending (the epic's library facts), and the fixture Endings (298, 537, 448, 348) all sit before their Pad locators (318, 552, 460, 354). LOW, capped: upgrade to MEDIUM if a song joins the library whose last locator before its end marker sits at or after its audio end, which a build with `--pad` after that song shows once the fix is in.

**Evidence**
```ts
  const kept = overlap ? song.locators.filter((locator) => locator === marker || Number(valueOf(locator, 'Time')) < end) : song.locators;
  ...
  if (pad && first) locators.push(plainLocator(first, `${number} - Pad`, offset + pad.at));
```

**Failure mode** — executed, `repro/review-4-builder-edges.test.ts` ("review 4 finding 1"): This Is Amazing Grace's Outro moved to 466 (its audio ends on 460), a pad into Great Are You Lord. Both builds return `ok: true`. With a 3-second D pad (one bar of 6/8 at 72 BPM) the set holds `460 1 - Pad`, `463 1 - End`, `463 2 - Count Off`, `466 1 - Outro`, and the controller's parser warns `The locator "1 - Outro" is at or after song 1's End.` and `Songs 1 and 2 overlap: a locator of one sits inside the other.` With a 30-second pad the parser is silent, but the Pad section runs only from 460 to 466 and an "Outro" section runs from 466 to the Count Off on 496: Loop on the Pad loops 6 beats, and Next on the Pad lands on that Outro, not on the next song's Count Off (stories 28, 37 and 41). The gap path has no such hole: `addedEnd` and the later of the audio end and the End keep every section before End.

**Recommended fix** — audited in a scratch worktree: the repro's two rows go green, 284 of 284 set-builder tests stay green, `tsc` and lint clean.
```diff
--- a/src/set-builder/timeline.ts
+++ b/src/set-builder/timeline.ts
@@ -113,6 +113,10 @@ function onOrNextBarLine(point: number, meter: Meter): { bar: number; passed: nu
   return barLineAtOrAfter(point - ON_BAR_LINE_TOLERANCE, meter);
 }
 
+export function padLocator(song: Song): number {
+  return onOrNextBarLine(song.audioEnd, meterOf(song)).bar;
+}
+
--- a/src/set-builder/checks.ts
+++ b/src/set-builder/checks.ts
-import { findEnding, findIntro, onBarLine, padBars, ringingBeat, silenceAfter } from './timeline.ts';
+import { findEnding, findIntro, isEndMarker, onBarLine, padBars, padLocator, ringingBeat, silenceAfter } from './timeline.ts';
@@ -81,6 +81,16 @@ export function introProblems(service: (Song | undefined)[], transitions: Partia
   return [...new Set(problems)];
 }
 
+export function padLocatorProblems(service: (Song | undefined)[], transitions: Partial<Record<number, Transition>>): string[] {
+  return service.flatMap((song, index) => {
+    if (!song || transitions[index + 1]?.type !== 'pad' || !hasStartingValues(song)) return [];
+    const at = padLocator(song);
+    return song.locators
+      .filter((locator) => !isEndMarker(locator) && Number(valueOf(locator, 'Time')) >= at)
+      .map((locator) => `${song.folder}: the locator "${valueOf(locator, 'Name')}", on beat ${valueOf(locator, 'Time')}, is not before the Pad locator on beat ${at}, where the pad after song ${index + 1} starts the song's last section.`);
+  });
+}
+
--- a/src/set-builder/build-set.ts
+++ b/src/set-builder/build-set.ts
-import { introProblems, overlapProblems, padTrackProblems, shortPadProblems, stemProblems, templateProblems } from './checks.ts';
+import { introProblems, overlapProblems, padLocatorProblems, padTrackProblems, shortPadProblems, stemProblems, templateProblems } from './checks.ts';
@@ -113,6 +113,7 @@
     ...shortPadProblems(service, padReading.pads),
+    ...padLocatorProblems(service, transitions),
     ...audioProblems(songs),
```
Then copy the repro's two rows into `test/set-builder-pad.test.ts` beside the other stop cases in `describe('a pad the build cannot make')` (`:175`), asserting the exact problem text.

**Remediation brief**
- **Design intent:** before a pad, the song keeps every locator it has (story 27), gains `N - Pad` on its Pad locator, the first bar line at or after its audio end, counting an audio end at most `ON_BAR_LINE_TOLERANCE` past a bar line as on it (#79), and its end marker moves to the end of the Pad section, which must be the song's last section (story 28) so that Loop holds the whole pad and Next lands on the next song's Count Off. A locator the song holds at or after its Pad locator breaks that, so it is a problem in the one-pass list, named by folder, locator name and beat, beside the other pad problems, and nothing is written. The end marker (blank or `End`, `isEndMarker`) is never such a locator. The repo's exported checks each carry a doc comment stating their rule; write one for `padLocatorProblems` and `padLocator`.
- **Full surface:** `src/set-builder/timeline.ts` (the new `padLocator`, beside `onOrNextBarLine` at `:112`); `src/set-builder/checks.ts` (the import at `:6`, the new check after `introProblems` at `:75-82`); `src/set-builder/build-set.ts` (the import at `:6`, the list at `:115`); `test/set-builder-pad.test.ts` (two rows in `describe('a pad the build cannot make')`, `:175`). Placement (`placeSongs`' pad branch, `timeline.ts:74-79`) and `locatorsFor` (`write-set.ts:346-362`) stay as they are: once the check stops the case, they never meet it.
- **Must preserve:** every pad build that builds today, unchanged byte for byte (no fixture song trips the check: the differential's 317 pad-after-Goodness builds and every other pad case); the other pad problems and their order (`test/set-builder-pad.test.ts`, 73 tests; `test/set-builder-command.test.ts`); a song with no starting tempo or meter left to placement's throw (round 1's `hasStartingValues` decision); the overlap path's own locator drop.
- **Do not touch:** the overlap's `kept` filter (`write-set.ts:349`), which drops the Ending and every later locator of the song by design (#61), and `addedEnd` (`timeline.ts:191-195`).
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-59/repro/review-4-builder-edges.test.ts test/ && pnpm exec vitest run test/review-4-builder-edges.test.ts -t "review 4 finding 1"`: red now (both rows build), green after. Then `rm test/review-4-builder-edges.test.ts` and `pnpm test`.

### 2. A ring that outlasts a short middle song is converted at that song's tempo after the set has stepped to the next one's, so its audio runs out before its clip ends — LOW
- **Location:** `src/set-builder/timeline.ts:170-172` (`ringingBeat`), `src/set-builder/write-set.ts:210-238` (`cutOrRing`, its ring end and `ringSeconds` at `:233`), and the check's copy of the rule, `src/set-builder/checks.ts:123-140` (`holdsAt`)
- **Attribution:** introduced by this branch: the ring conversion by `e112686` (setlist-controller#61 Overlap tracer bullet) and the cut at the silence point by `e5a60e1` (setlist-controller#65 Overlap fade). Such a chain has built since #61; `e5f50b9` (setlist-controller#72) checks its slots and lets it build when they fit (#72's second criterion).
- **Real-world trigger:** song A overlaps into song B and B overlaps into song C, where B's Ending comes before B's Intro plus 2 bars: a tag or an interlude only a few bars long. No library song comes close (every Ending is 274 s or more into its song, #72). LOW, capped: upgrade to MEDIUM if such a song joins the library.

**Evidence**
```ts
  if (ringsTo > silence) {
    const ringSeconds = ((silence - Math.max(ringStart, ending)) * 60) / nextTempo;
    const audioEnd = String(Number(valueOf(copy, 'Loop', 'LoopStart')) + secondsBetween(song, start, Math.max(start, ending)) + ringSeconds);
```

**Failure mode** — executed, `repro/review-4-builder-edges.test.ts` ("review 4 finding 2"): This Is Amazing Grace's Ending moved to 12 (its Intro is on 8, its silence point on 16), then Goodness of God, Grace and Great Are You Lord with overlaps 1 and 2. The build succeeds. The stitched tempo is `[298, 98], [310, 98], [310, 72]`: Grace at 98 BPM from Goodness of God's Ending, Great Are You Lord at 72 from Grace's Ending on set beat 310. Goodness of God's AG, AG 2 and Lap Steel are cut on its silence point, set beat 314, with `LoopEnd` 293.7727 s, since `ringSeconds` counts all 16 beats after the Ending at 98 BPM. The set takes 294.6554 s to reach 314, since its last 4 beats run at 72. So each clip's audio ends 0.88 s before the clip does, near beat 312.94, where its 8-beat fade-out still stands at about 13%: the ring stops short instead of fading to silence. The same invariant holds for Goodness of God into Grace with no short song (control). What Live does with an unwarped clip whose span outlasts its audio is unproven.

**Recommended fix** — convert a ring's seconds after the Ending through the tempo the set plays there, in both directions and in both places the rule lives. Today `ringingBeat(song, ending, nextTempo, beat)` assumes the next song's starting tempo holds from the Ending to the silence point. Give the rule the next song's own handoff when the next song overlaps out before the silence point: from the Ending to that handoff (the next song's Ending, in the song's own beats `ending + nextEnding`) at the next song's starting tempo, and from there at the starting tempo of the song after it. Apply it in `ringingBeat` (seconds to beats, for the ring's end), in `cutOrRing`'s `ringSeconds` (beats to seconds, for the cut clip's audio), and in `holdsAt` (`checks.ts`), which must keep giving the same ring end as placement (`ringingSongs` already walks the chain and knows each song's Ending). `Overlap` in `write-set.ts:175` gains the next song's handoff and the following song's starting tempo, filled in `overlapAfter` (`:177-186`) from `placed[index + 1]` and `placed[index + 2]`. No diff here: see Escalation.

**Remediation brief**
- **Design intent:** every clip is unwarped, so a clip's audio plays at its own speed whatever the tempo map, and a correct clip's audio seconds equal the set's seconds from its start to its end. A ring's beats after the Ending are its seconds converted at the tempo the set holds after the Ending (story 16, "keep ringing in real time"), and it is cut on the next song's silence point with a fade from the next song's Intro to its end, so the fade reaches silence where the audio ends (story 17). The slot check (`holdsAt`) mirrors placement's ring end so the two never disagree (#72); any change to the conversion changes both. The rule converts at the next song's starting tempo, not its whole tempo map (spec, "Clips in an overlap"), and that part stays.
- **Full surface:** `src/set-builder/timeline.ts:170-172` (`ringingBeat`); `src/set-builder/write-set.ts:175-186` (`Overlap`, `overlapAfter`), `:210-238` (`cutOrRing`: `ringStart`, `ringsTo`, `ringSeconds`); `src/set-builder/checks.ts:102-140` (`ringingSongs`, `holdsAt`); a test in `test/set-builder-overlap.test.ts` for the chain, from the repro.
- **Must preserve:** every ring where the next song's handoff comes at or after its silence point (every library pair, and every case in `test/set-builder-overlap.test.ts` and `test/set-builder-stop-rules.test.ts`, the #72 chain rows on 9, 10, 12, 14 and 16 included), byte for byte; the check and placement agreeing (`test/set-builder-stop-rules.test.ts`, "builds two overlaps through a song whose Ending is on its silence point"); the click and guide cut on the Ending.
- **Do not touch:** #72's walk (only through an unbroken run of overlaps) and its counting in each earlier song's own beats, both recorded decisions.
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-59/repro/review-4-builder-edges.test.ts test/ && pnpm exec vitest run test/review-4-builder-edges.test.ts -t "review 4 finding 2"`: red now (`expected 293.7727192438888 to be close to 294.65536471173425`), green after. Then `rm test/review-4-builder-edges.test.ts` and `pnpm test`.
- **Escalation:** the fix touches the shared ring rule in three files for a case no library song reaches, so recommend a follow-up ticket over an in-loop fix. The alternative, a problem that stops an overlap out of a song whose Ending comes before its silence point when an overlap also goes into it, is smaller but overturns #72's choice that such a chain builds when its slots fit, and changes the exact problem list #72's row on 12 pins: Nick's call.

### 3. A reserved folder named in another letter case is listed as a song and matched by the build — LOW
- **Location:** `src/set-builder/library.ts:37` and `:40` (`songFolders`)
- **Attribution:** `_pads` and a `--pads` folder: introduced by `df291e7` (setlist-controller#66), and listed by `560619e` (setlist-controller#78). `_template`: pre-existing, exposed: the base already compared it exactly (`e4aa4e6:src/set-builder/library.ts:22`, `.filter((name) => name !== TEMPLATE_FOLDER)`), and #78's listing now prints it.
- **Real-world trigger:** Nick creates the pads folder as `_Pads` (#60 is his to do), or names `--pads` in another letter case than the folder on disk. On the Mac's case-insensitive disk the build reads `_Pads` as the pads folder, and `--list` offers it as a song too, against story 48 ("the pads folder never offered as a song"). A build is affected only if a song name matches it.

**Evidence**
```ts
  const reserved = [TEMPLATE_FOLDER, PADS_FOLDER, ...(dirname(padsUsed) === resolve(library) ? [basename(padsUsed)] : [])];
  ...
    .filter((name) => !reserved.includes(name))
```

**Failure mode** — executed: a scratch library holding `_Pads`, `_Template`, `My-Pads` and Goodness of God. `node src/set-builder/main.ts --list --library <lib>` prints `"_pads"  no key  _Pads`, `"_template"  no key  _Template`, `god  A  Goodness of God-Victory-A-63.00bpm` and `my  no key  My-Pads`, and `--pads <lib>/my-pads` still lists `My-Pads`. The skill's step 2 then holds a `no key` line for the pads folder among the songs.

**Recommended fix** — audited in a scratch worktree with finding 1's: none of the three is listed, 284 of 284 set-builder tests green.
```diff
--- a/src/set-builder/library.ts
+++ b/src/set-builder/library.ts
@@ -34,10 +34,10 @@
   const padsUsed = padsFolder({ library, pads });
-  const reserved = [TEMPLATE_FOLDER, PADS_FOLDER, ...(dirname(padsUsed) === resolve(library) ? [basename(padsUsed)] : [])];
+  const reserved = [TEMPLATE_FOLDER, PADS_FOLDER, ...(dirname(padsUsed).toLowerCase() === resolve(library).toLowerCase() ? [basename(padsUsed)] : [])].map((name) => name.toLowerCase());
   return (await Promise.all(entries.map(async (entry) => ((await isFolder(library, entry)) ? [entry.name] : []))))
     .flat()
-    .filter((name) => !reserved.includes(name))
+    .filter((name) => !reserved.includes(name.toLowerCase()))
```
Then a test in `test/set-builder-command.test.ts` beside "--list lists neither _pads nor the --pads folder when it sits in the library", with `_Pads` and `_Template` folders added to the workspace library and a `--pads` folder named in another letter case, expecting only the four song lines.

**Remediation brief**
- **Design intent:** the library's song folders are every folder in it but the template's (`_template`), the pads' default (`_pads`) and the pads folder a build or a listing names when it sits directly in the library; one function, `songFolders`, decides it for the build (`matchSongs`) and the listing (`listSongs`) alike, so the two always agree. A folder is reserved by its name in any letter case, as the Mac's disk opens it, the rule pad file names already follow. On a case-sensitive disk the wider rule only hides a folder named like a reserved one, which no song is.
- **Full surface:** `src/set-builder/library.ts:37` and `:40`; one test in `test/set-builder-command.test.ts` (or `test/set-builder.test.ts` beside "never matches _template, the folder that holds the template").
- **Must preserve:** `_template`, `_pads` and an in-library `--pads` folder in their exact case still excluded ("--list lists neither _pads nor the --pads folder when it sits in the library", "never matches _template, the folder that holds the template"); a folder whose name only contains a reserved name (`_pads old`) still a song; `padsFolder` and the template's default path unchanged; the listing's order.
- **Do not touch:** a symlinked library or pads path compared as a string (Minor / nits); hidden folders (Minor / nits).
- **Proof:** a scratch library: `mkdir -p <scratch>/lib/_Pads <scratch>/lib/_Template "<scratch>/lib/Goodness of God-Victory-A-63.00bpm"` and `node src/set-builder/main.ts --list --library <scratch>/lib`: prints the `_Pads` and `_Template` lines now, only Goodness of God's after. The new test red before, green after.

### 4. Two rules the stage 2 tickets added can be removed with every test still green — LOW
- **Location:** (a) `src/set-builder/timeline.ts:112-114`, `onOrNextBarLine`'s inclusive boundary, an audio end exactly `ON_BAR_LINE_TOLERANCE` past a bar line counting as on it; (b) `src/set-builder/checks.ts:107`, the earlier-ring walk ending at a gap or a pad into the next song (`transitions[position + 1]?.type !== 'overlap'`)
- **Attribution:** introduced: (a) by `4b15da7` (setlist-controller#79), whose tests pin 318.00005 (inside) and 318.001 (outside) but not the edge; (b) by `e5f50b9` (setlist-controller#72), whose tests all run unbroken overlap chains.
- **Real-world trigger:** none in the product today; each is a claim of coverage the tests do not have. Removed, (a) moves a pad a bar late for an audio end exactly on the tolerance (float64 gives `318.0001 - 1e-4 === 318`), and (b) makes the slot check count a ring that a gap or a pad has already ended, so a valid service stops on a false "the overlaps need 7 A GTRS tracks" problem.

**Evidence**
```ts
function onOrNextBarLine(point: number, meter: Meter): { bar: number; passed: number } {
  return barLineAtOrAfter(point - ON_BAR_LINE_TOLERANCE, meter);
}
```
```ts
    if (!song || !next || ending === undefined || transitions[position + 1]?.type !== 'overlap') break;
```

**Failure mode** — executed in a scratch worktree at HEAD, each mutation alone: `repro/review-4-mutation-tolerance-strict.diff` (`bar > point - tolerance`) keeps the five set-builder files 284 of 284 green; `repro/review-4-mutation-walk-through-gap.diff` keeps `test/set-builder-stop-rules.test.ts` and `test/set-builder-overlap.test.ts` 83 of 83 green, while Goodness of God, This Is Amazing Grace (Ending on 12) and Goodness of God with only `{ 2: overlap }`, or with `{ 1: pad, 2: overlap }`, which build at HEAD, stop on the chain problem. `repro/review-4-unpinned-rules.test.ts` is green at HEAD and red under each.

**Recommended fix** — test-only.
- (a) In `test/set-builder-pad.test.ts`, in `describe('a pad between Goodness of God, whose audio ends 2 samples past a bar line, and Trust In God, which starts in 6/8')` (`:529`), after "still puts 1 - Pad on the next bar line, 322, when the audio end is more than the tolerance past the bar line at 318" (`:600`):
```ts
  it('puts 1 - Pad on 318 when the audio end is exactly the tolerance past the bar line at 318', async () => {
    const { root } = await goodnessIntoTrust((workspace) =>
      editSongTrack(workspace, GOODNESS, 'BGVS', (text) => text.replace('<CurrentEnd Value="318.00004942973692" />', '<CurrentEnd Value="318.0001" />')),
    );

    expect(locatorList(root).find(({ name }) => name === '1 - Pad')).toEqual({ time: 318, name: '1 - Pad' });
  });
```
- (b) In `test/set-builder-stop-rules.test.ts`, in `describe('stopping an overlap before writing')`, after "builds two overlaps through a song whose Ending is on its silence point, where the first song's ring ends" (`:790`), the `it.each` of `repro/review-4-unpinned-rules.test.ts` over a gap (`{}`) and a pad (`{ 1: { type: 'pad' } }`) before This Is Amazing Grace with its Ending on 12, then `{ 2: OVERLAP }` into Goodness of God, with `addPadTrack(workspace)` and `addPad(workspace, 'D', 30)`, expecting `ok: true`.

**Remediation brief**
- **Design intent:** "on a bar line" for an audio end means at most `ON_BAR_LINE_TOLERANCE` past one, the tolerance itself included, through `onOrNextBarLine` only (#79). The earlier-ring walk counts a ring only through an unbroken run of overlaps: a gap or a pad into a song places that song after every earlier ring has been cut (#72's recorded decision); the case where it has not is the open #72 proposal, not this finding.
- **Full surface:** one test in `test/set-builder-pad.test.ts` (after `:600`, using that describe's `goodnessIntoTrust`); one `it.each` in `test/set-builder-stop-rules.test.ts` (after `:790`; the file has `moveLocator`, `OVERLAP` and the harness; import `addPad` and `addPadTrack` if absent); no source change. The rules they pin: `src/set-builder/timeline.ts:112-114` and `src/set-builder/checks.ts:107`.
- **Must preserve:** every existing test in both files unchanged; the source unchanged.
- **Do not touch:** the overlap's bar count (`timeline.ts:70`, `barLineAtOrAfter(end, meter)`): making it tolerant leaves every test green, but `onBarLine` already stops an Ending off a bar line, so that mutation is equivalent (Reviewed and Dismissed).
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-59/repro/review-4-unpinned-rules.test.ts test/`, then for each of `tolerance-strict` and `walk-through-gap`: `git apply docs/reviews/setlist-controller-59/repro/review-4-mutation-<name>.diff && pnpm exec vitest run test/set-builder-pad.test.ts test/set-builder-stop-rules.test.ts test/review-4-unpinned-rules.test.ts; git apply -R docs/reviews/setlist-controller-59/repro/review-4-mutation-<name>.diff`. Now the two suite files stay green under each and only the repro goes red; after the fix each mutation turns its new test red. Then `rm test/review-4-unpinned-rules.test.ts` and `pnpm test` green at HEAD.

### 5. Three lines of the fade's round 1 fix can still be removed with every fade test green (review 2, finding 1) — LOW
- **Location:** `src/server/fade-out.ts:178` (`state = { kind: 'idle' };` in `close`), `:161` (`since: state.since` in the move to `reading-volumes`), `:140` (`since: clock.now()` on every press that starts a read, stale re-reads included); the tests that should pin them, `test/fade-out.test.ts:582` ("sends nothing when the server closes while the fade still reads"), `:596` and `:627`
- **Attribution:** introduced by the round 1 remediation: `:178` in `60f9c5b` (finding 1), `:140` and `:161` in `96c0e59` (finding 4). Unchanged since review 2.
- **Real-world trigger:** none in the product today; each is a claim of coverage the tests do not have. Dropped, the first lets a late volume reply start stepping onto a bridge about to close; the other two move the read deadline by up to the time a track list takes to arrive.

**Evidence**
```ts
    close: () => {
      closed = true;
      stopStepping();
      if (state.kind === 'stepping' || state.kind === 'lost') restore(state);
      state = { kind: 'idle' };
    },
```

**Failure mode** — executed in a scratch worktree at HEAD: `repro/review-2-mutation-close-keeps-state.diff`, `repro/review-2-mutation-since-reset-on-track-list.diff` and `repro/review-2-mutation-repress-keeps-since.diff` each apply and keep `test/fade-out.test.ts` 27 of 27 green; `repro/review-2-fade-unpinned-lines.test.ts`, copied into `test/`, is 4 of 4 green at HEAD and red under each (two tests under the first, one under each of the others).

**Recommended fix** — test-only, the four tests of `repro/review-2-fade-unpinned-lines.test.ts`, in `test/fade-out.test.ts`, `describe('the fade out on its own')` (`:546`): one line added to "sends nothing when the server closes while the fade still reads" (`:582`), `fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });` right after `fade.close();`, so the outstanding reply arrives after the close; and, after `TWO_TRACKS` (`:594`), three tests: "sends nothing more when Live stops, or the leader stops, after the server closed mid-fade", "counts the read deadline from the press, not from the track list reply" (press, 600 ms, `TWO_TRACKS`, 401 ms, press: expect `['track_data', 'get 0', 'get 1', 'track_data']`), and "counts the deadline again from a press that reads the tracks again" (press, 1500 ms, press, 100 ms, press: expect `['track_data', 'track_data']`). Every `track-data` event needs a `name` on each track since `42c8140` (`{ track: 0, name: 'Track 0', grouped: false }`, as `TWO_TRACKS` has); the repro's literal events lack it, so `pnpm typecheck` fails on them until it is added.

**Remediation brief**
- **Design intent:** the fade holds the pre-fade volumes only in memory, in `stepping` and `lost`; every way a fade ends sets them back once. `close()` is the server's last word: it restores from `stepping` or `lost`, returns to `idle` so no reply or stop that arrives before the bridge closes can start a fade or restore again, and refuses later presses (`closed`). A read that has not finished more than `READ_TIMEOUT_MS` after the press that started it is abandoned on the next press, counted from that press (`since`, carried from `reading-tracks` into `reading-volumes`), and every press that starts a read starts its own deadline. No timer.
- **Full surface:** `test/fade-out.test.ts:582-592` (one added line) and three new tests after `:594`; no source change. The rules they pin: `src/server/fade-out.ts:178`, `:161`, `:140`.
- **Must preserve:** every existing test in `test/fade-out.test.ts` and `e2e/fade-out.spec.ts`, unchanged; `fade-out.ts` unchanged.
- **Do not touch:** the stale `track-data` adopted after a re-read (review 2's Minor / nits) and the second restore after close (round 1's known regression, deferred).
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-59/repro/review-2-fade-unpinned-lines.test.ts test/`, then for each of `close-keeps-state`, `since-reset-on-track-list` and `repress-keeps-since`: `git apply docs/reviews/setlist-controller-59/repro/review-2-mutation-<name>.diff && pnpm exec vitest run test/fade-out.test.ts test/review-2-fade-unpinned-lines.test.ts; git apply -R docs/reviews/setlist-controller-59/repro/review-2-mutation-<name>.diff`. Now `test/fade-out.test.ts` stays green under each and only the repro goes red; after the fix `test/fade-out.test.ts` goes red under each. Then `rm test/review-2-fade-unpinned-lines.test.ts`, `pnpm typecheck` and `pnpm exec vitest run test/fade-out.test.ts`.

### 6. Four rules the round 1 fixes added to the set builder can still be removed with every set-builder test green (review 2, finding 2) — LOW
- **Location:** (a) `src/set-builder/checks.ts:132`, the ring conversion of a clip's start in `holdsAt` (`ringing(Number(valueOf(clip, 'CurrentStart'))) < silence`), against `test/set-builder-stop-rules.test.ts:673`; (b) `introProblems` (`checks.ts:75-82`) leaving the pad after the last song unchecked, since it never visits a position past the last song; (c) `checks.ts:89`, the `!holder` skip in `shortPadProblems`; (d) `src/set-builder/wav.ts:45`, the `format.blockAlign === 0` half, against `test/set-builder-pad.test.ts:760-777`
- **Attribution:** (a) introduced by `bd4770c` (finding 5), and carried by `e5f50b9` (#72) from `slotProblems` into `holdsAt`; (b) `0386df2` (finding 6); (c) `a51b16d` (finding 3); (d) the throw from `df291e7` (setlist-controller#66), whose test `bd1e74d` (finding 9) covers only the sample-rate half. Unchanged since review 2, but for (a)'s move.
- **Real-world trigger:** none in the product today. Removed, (a) brings back round 1's false stop for a stem clip that starts between the Ending and the silence point, (b) stops a ministry-time pad after a last song with no section after its Count Off, (c) turns a one-pass problem list into a thrown `TypeError`, and (d) lets a WAV with a block align of 0 read as `Infinity` frames.

**Evidence**
```ts
    return ringing(Number(valueOf(clip, 'CurrentStart'))) < silence && Math.min(ringing(end), silence) > start;
```
```ts
    if (!holder || !hasStartingValues(holder) || padBars(holder, seconds) >= 1) return [];
```

**Failure mode** — executed in a scratch worktree at HEAD: `repro/review-4-mutation-ring-raw-start.diff` (the raw start against the silence point, review 2's mutation moved to `holdsAt`) keeps the five set-builder files 284 of 284 green; `repro/review-2-mutation-pad-after-last-needs-intro.diff`, `repro/review-2-mutation-no-holder-guard.diff` and `repro/review-2-mutation-wav-block-align.diff` each keep `test/set-builder-pad.test.ts` and `test/set-builder-command.test.ts` 132 of 132 green. `repro/review-2-builder-unpinned-rules.test.ts`, copied into `test/`, is 3 of 3 green at HEAD and red under the first three (`a BGVS clip on 309 ...`, `a pad after the last song ...`, `a short pad with its own key into a name that matches no song ...`); (d) has no repro test, its proof is the test below.

**Recommended fix** — test-only.
- (a) In `test/set-builder-stop-rules.test.ts`, after "does not count a stem whose clip would start ringing at or after the next song's silence point, which the overlap drops, so the pair builds" (`:673`), a test that moves Goodness of God's BGVS to 309 with the describe's `moveBgvsTo` (`:668`) and builds `[GOODNESS, TRUST]` with `{ 1: OVERLAP }`, expecting `ok: true` (the repro's first test: the clip starts ringing at about 310.9, past the silence point on 310).
- (b) and (c) In `test/set-builder-pad.test.ts`: (b) in `describe('a pad into a song with no Count Off')` (`:458`), a build of `[GRACE, GOODNESS]` with `{ 2: PAD }`, `addPadTrack`, `addPad(workspace, 'A', 30)` and `removeLocator(workspace, GOODNESS, 'Count Off')`, expecting `ok: true`; (c) in `describe('a pad the build cannot make')` (`:175`), a build of `[GRACE, 'zzz']` with `{ 1: { type: 'pad', key: 'A' } }`, `addPadTrack` and `addPad(workspace, 'A', 1)`, expecting `ok: false` and exactly one problem, starting `"zzz" matches no song folder`. The repro holds both builds.
- (d) In `test/set-builder-pad.test.ts`, the `fmt` helper (`:760`) takes `blockAlign = 2` and writes it in place of the literal 2 at byte 12, and the `it.each` beside `{ case: 'a sample rate of 0', ... }` (`:777`) gains `{ case: 'a block align of 0', bytes: riff(fmt(1000, 0), data), reason: 'its fmt chunk gives no sample rate or frame size' }`.

**Remediation brief**
- **Design intent:** every input problem joins the one-pass list and no check throws where it could report. The slot check and placement agree on which earlier stems still hold a track: a ringing clip's start and end are both converted after the Ending at the next song's starting tempo (`ringingBeat`), and one that would start ringing at or after the silence point is dropped, as `cutOrRing` drops it. A pad after the last song has no tail clip, so it needs no Intro. A pad whose holder could not be read gets no short-pad problem, since the holder's own problem names it. A WAV header with a sample rate or a block align of 0 is a problem, never a frame count.
- **Full surface:** `test/set-builder-stop-rules.test.ts` (one test after the test at `:673`); `test/set-builder-pad.test.ts` (one test in each of the describe blocks at `:175` and `:458`, the `fmt` helper at `:760` and one `it.each` row after `:777`); no source change. The rules they pin: `src/set-builder/checks.ts:132`, `:75-82`, `:89`, `src/set-builder/wav.ts:45`.
- **Must preserve:** every existing test in both files unchanged, the existing `fmt(1000)` and `fmt(0)` calls included (the new parameter defaults to 2); the source unchanged.
- **Do not touch:** a song with no starting tempo or meter stopping the build by a thrown error from placement (round 1's recorded `hasStartingValues` approach).
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-59/repro/review-2-builder-unpinned-rules.test.ts test/`, then for each diff of `repro/review-4-mutation-ring-raw-start.diff`, `repro/review-2-mutation-pad-after-last-needs-intro.diff` and `repro/review-2-mutation-no-holder-guard.diff`: `git apply <diff> && pnpm exec vitest run test/set-builder-stop-rules.test.ts test/set-builder-pad.test.ts test/review-2-builder-unpinned-rules.test.ts; git apply -R <diff>`; and `git apply docs/reviews/setlist-controller-59/repro/review-2-mutation-wav-block-align.diff && pnpm exec vitest run test/set-builder-pad.test.ts -t "stops on a pad file with"; git apply -R docs/reviews/setlist-controller-59/repro/review-2-mutation-wav-block-align.diff`. Now the two suite files stay green under each; after the fix each mutation turns its new test red. Then `rm test/review-2-builder-unpinned-rules.test.ts` and `pnpm test`.

### 7. Comment hygiene — LOW (aggregated)
- `src/set-builder/pads.ts:14` — "The key it is in, and its file name in the pads folder: `A` and `A.wav`." → "Its file name less its extension, which Live names its clip after, and its file name in the pads folder: `A` and `A.wav`, or `a` and `a.WAV`." Since `9f94144` the field holds the file's own spelling (`a`, `c#`), not a note name; the summary's key comes from `Pad.key` (review 2, finding 3).
- `src/set-builder/pads.ts:9-10` — "The pads folder holds one WAV per key, named by its key (`A.wav`, `Eb.wav`)" → "The pads folder holds one WAV per key, named by its root in either spelling of an enharmonic pair and in any letter case (`A.wav` plays A and Am, `Eb.wav` or `D#.wav` plays Eb)". A minor key plays its root's file, so "named by its key" reads as `Em.wav`, which the build never reads (#74's own finding).
- `src/set-builder/pads.ts:162` — "The pad file `name`, which is named by its key, or the problem that stops the build on it." → "The pad file `name`, as the pads folder spells it, or the problem that stops the build on it."
- `src/set-builder/build-set.ts:48` — "The folder of pad files, one WAV per key named by its key (`A.wav`)" → "The folder of pad files, one WAV per key named by its root (`A.wav` plays A and Am)".
- `src/set-builder/main.ts:36` (the `USAGE` text) — "--pads defaults to <library>/_pads, the folder of pad files, one WAV per key named by its key: A.wav." → "--pads defaults to <library>/_pads, the folder of pad files, one WAV per key named by its root: A.wav plays A and Am." This is the sentence `SKILL.md` names as the source of the pad file rule; no test pins it. This entry and the two above close the run proposal "The usage text and the build's options comment still say a pad file is named by its key" (`.epic-loop/tickets/74/proposals.md`).
- `test/set-builder-command.test.ts:320` — test title "says in the usage text how a pad fades in, and fades out under the next song's Count Off, but not after the last song" → "says in the usage text how a pad fades in, sounds on under the next song's Count Off and fades out over its Intro, and has no tail after the last song" (review 3).
- `docs/install.md:139` — "The fade reads each track's name and whether it sits inside a group, so the set holds one track that does and two that do not, and the check records each name as Live reports it. The fade finds the `GUIDE` and `MT CLICK` tracks, which keep their level, by the names Live reports, so a reported name that differs from the one Live shows turns up here." → "The fade reads whether each track sits inside a group, so the set holds one track that does and two that do not. It also finds the `GUIDE` and `MT CLICK` tracks, which keep their level, by the names Live reports, so the check records each name as Live reports it, and a name that differs from the table turns up here." Keep the sentence after it, "The script warns, and runs on, when the tracks differ.", unchanged (review 3).

## Needs Further Investigation

### A to D. Round 1's four, unchanged — confirm in the acceptance run (#71)
Loop on the Pad section dipping at each wrap; effect tails coming back at full level when the fade restores the volumes; fade steps landing in Live's undo history or overriding volume automation; a tail clip longer than its pad file. See `pre-pr-review-1.md`. This round's controller finder raised B again from the code: the fade's last step to 0, `stop_playing` and the restore leave in one synchronous call (`src/server/fade-out.ts:95-102`), so AbletonOSC applies all three in one 100 ms tick and silence never holds for a whole tick; Stop during a fade sends stop then restore the same way (`src/server/server.ts:73-76`). It follows the spec's order. Confirm by fading a song whose group or track carries a long reverb and listening after the stop; the run proposal "Hold the volumes down after a Fade out's stop until effect tails die away" holds the fix.

### E. Two pads around a short middle song may put two clips on the PAD track at once — confirm with a build
With a pad into song B and a pad after B, the first pad's tail clip runs from B's Count Off to B's Intro plus 2 bars (`tailClip`, `src/set-builder/write-set.ts:153`), and B's own Pad clip starts on B's Pad locator (`placePads`, `:83-97`). When B's audio ends before its Intro plus 2 bars, the two overlap on one track, which no check stops. Not executed. Confirm with a build of `[GRACE, X, GOODNESS]` with `{ 1: pad, 2: pad }` where X's clips are edited (`editSongTrack`) to end before X's Intro plus 2 bars, reading the PAD track's clips. It needs a song only a few bars long, the same trigger as finding 2.

### F. The contract check's volume read may count a late reply to the read before — confirm against real Live (#76)
`readVolumes` (`src/contract/run.ts:356-367`) counts every `TRACK_VOLUME` report after its own send and stops waiting at one per index. A reply to the first read that arrives after its `REPLY_TIMEOUT_MS` and after the second read's send is counted by the second, which may then end before the real answers and record "reads back the volume set" as "no". The faders are still set back. Not executed; on localhost replies come in milliseconds. Watch for a "no" on that row in #76.

### G. Whether real Live reports `MT CLICK` by that name — review 3's, unchanged
The fade test proves the server leaves a track named `MT CLICK` alone when the fake Live reports that name; whether AbletonOSC's `track.name` reports it with its space is #71's to hear.

## Reviewed and Dismissed
- **Trust In God's audio end, 1.0172e-4 beat past its bar line at 549, still rounds up to 552, so a pad after it opens with a 6/8 bar of silence** — #79's recorded decision to take the ticket's 1e-4 exactly; the run proposal "Count Trust In God's audio end, 4 samples past its bar line at 549, as on it" (`.epic-loop/tickets/79/proposals.md`) is Nick's call. The differential confirms the build does what the decision says.
- **A jump during a fade sets the volumes back at once, while Live makes the jump on the next bar line** — `fade.cancel()` on a jump (`src/server/server.ts:66-69`) is the fix of #63's review pass 1 finding 1, `cf1c4a7`, so a fade's `stop_playing` never stops the song played next; the README says a jump ends the fade.
- **The overlap's bar count made tolerant stays green (`timeline.ts:70`)** — an equivalent mutant: `onBarLine` stops every Ending off a bar line before placement, so the exact and the tolerant walk give the same count for every Ending that builds.
- **The chain check and placement add the same beats in different orders** — every offset is a sum of bar lines of 4/4, 6/8 and 2/4, exact in float64, and the Ending-on-16 test pins the boundary.
- **A symlinked pad file is copied into the project as a symlink** — round 1's dismissal stands: the pads folder holds downloaded files (#60), and song audio is copied the same way.
- **A short name holding `"`, `$`, a backtick or `\` breaks its quotes** — #78's recorded decision; no library folder holds one.
- **Two `--list` short-name tests check names only through `matchSongs` (`test/set-builder-command.test.ts:540`, and `:570` with no other assertion)** — #78's criterion as written ("run over the printed lines"); the exact lines are pinned by the test at `:519`, which goes red when a pair is preferred over one word.
- **Tests green at `320bb27` (11)** — each pins a boundary or a non-regression of its ticket: the window's far side at 5101 ms (#73), two `--pad` values on different songs and a value's own problem before the repeat (#77), an audio end past the tolerance (#79), an Ending on a bar line through meter changes and an Ending unchecked without a starting meter (#75), the Ending on 16 building and the unknown-ring fallback (#72), and three renamed or re-described tests whose bodies did not change.
- **A gap-only build or a stage 2 build changes what it writes beyond the tickets** — disproved by execution: 1153 and 1816 cases, every difference the #79 rule.

## Minor / nits
- `padClip` throws for a pad whose holder has no arrangement clip (`src/set-builder/write-set.ts:113-114`), after every check passes; every MultiTracks song has clips.
- `songFolders` lists hidden folders (`.Trashes`, `.fseventsd`) of a library at a drive root, as `matchSongs` matched them before #78; no library sits at a drive root.
- `--library ""`, `--pads ""` and `--output-root ""` mean the current folder, and an empty song name is a build problem (exit 1), not a usage error; all pre-existing in shape.
- `isKey` takes `Cb`, `Fb`, `E#` and `B#`, which no pad file can play (they have no twin among the five pairs); the problem then lists the keys the folder has.
- An AppleDouble `._E.wav` in the pads folder shows as the key `._E` in the missing-pad problem (`keysIn`, `src/set-builder/pads.ts:154-160`); the lookup is unaffected.
- A library or pads path reached through a symlink is compared as a string, so a `--pads` folder named through one is listed as a song.
- The `USAGE` sentence "a short name that names that one folder" (`src/set-builder/main.ts:42`) is false for a folder whose whole name is part of another's (setlist-controller#57), which `SKILL.md` documents; the sentence is pinned verbatim at `test/set-builder-command.test.ts:677`.
- A folder name stored in NFD is matched by `includes` against a name typed in NFC; unverified, and pre-existing in `matchSongs`.
- The `lost` guards at the top of `cancel` and `lose` (`src/server/fade-out.ts:107`, `:118`) stay green when deleted; both are unreachable through the server (the controller takes no command while Live is gone, and the bridge reports a loss only on a change).
- `readWavHeader` loses the data chunk after an odd chunk written without its pad byte, and does not check the format code; round 1's nit.
- Rounds 1 to 3's other Minor / nits stand unchanged.

## Test quality
Tests added or changed against `e4aa4e6`: 234 (183 declarations) · red against `e4aa4e6`: 219 · green against `e4aa4e6`: 15 · added or changed since `320bb27`: 62, red there 51, green 11 · tautology shapes found: 2 stage 2 rules unpinned (finding 4), plus review 2's 7 still unpinned (findings 5 and 6).

The 15 green at the merge-base: the end-toggle default's off-tolerance row (32.0002) and its song with no End, both "stop", the base's default, and "keeps the leader's toggles when the set is the same"; "builds on a template with no PAD track" and "keeps every tempo and meter event of a last song with no pad"; "leaves the Ending unchecked, and does not throw, when the song has no starting time signature" (`a51b16d`'s and `1044f5f`'s boundary); two `set-builder.test.ts` rows the base already met (Grace's added End, renamed, and the End at 318.00008, past the audio end, #79 review pass finding 3's `29b9c62`); five `set-builder.test.ts` tests whose only change is the new fixture in their folder lists; and two transport tests that now set "Stop at end" explicitly. Each pins behaviour the branch must keep. The 11 green at `320bb27` are under Reviewed and Dismissed. No snapshots, no mocked unit under test (the fade's unit tests drive the real `startFadeOut` through recording ports), no assertion-free tests, no assertion on a comment or a log line. Partial assertions: the #72 rows on 9, 10 and 14 use `arrayContaining`, as their comment says, since #75 may name those Endings too; the usage-text tests pin wording only, as a help-text test can.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass at `ee13465`, and so does `pnpm test:e2e`.
- **Commit hygiene:** the tree was clean. Commit this doc with its five files under `repro/` (`review-4-builder-edges.test.ts`, `review-4-unpinned-rules.test.ts`, `review-4-mutation-ring-raw-start.diff`, `review-4-mutation-tolerance-strict.diff`, `review-4-mutation-walk-through-gap.diff`); `pnpm lint` passes with them. Nothing to drop.
- **Likely reviewer asks:** what the acceptance run (#71) proved by ear (rounds 1 to 3's asks stand); why a pad after Trust In God still starts a bar late (#79's tolerance, the open proposal); and how the builder treats a song only a couple of bars long (finding 2, #72).

## Verdict
**Ready to open the PR, with follow-ups.** No finding gates it: zero CRITICAL, HIGH or MEDIUM. The stage 2 tickets landed clean: the differential shows the only change in what the builder writes is the one #79 asked for, and every stage 2 rule but two is pinned by a test that goes red without it. Of the seven LOW findings, finding 1 (a locator after the audio end before a pad) and finding 3 (a reserved folder in another letter case) are small source fixes with audited diffs; finding 2 (a ring through a very short middle song) is escalated to a follow-up ticket or Nick's call; findings 4 to 6 are test-only, each with its test and its mutation proof in `repro/`; finding 7 batches seven drifting descriptions, five of them the pad file rule #74 left in `src/`. Reviews 2 and 3's four LOW findings are still open and are carried here as findings 5, 6 and 7, none worse than described.
