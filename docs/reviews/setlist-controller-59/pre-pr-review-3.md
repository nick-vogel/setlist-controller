# Pre-PR review: setlist-controller#59 Song transitions: overlap into the next count-off, a prayer pad, and fades

**Branch:** `setlist-controller-59-song-transitions` vs `origin/setlist-controller-32-set-builder` (merge-base `e4aa4e6` "setlist-controller#32 pre-PR review 2")
**Reviewed at:** HEAD `68ecdea` (setlist-controller#59 Say in the usage text how an overlap's ringing stems and a pad fade in and out), clean tree: 0 files with uncommitted changes, 0 untracked; 60 files total, +5847 / -174 against the merge-base
**Delta under review:** since `0a5af38` (setlist-controller#59 pre-PR review 1 remediation closure table), the HEAD that `pre-pr-review-2.md` reviewed: 18 files, +552 / -27, of which 10 are review 2's own doc and repro files (committed in `96d43a7`, setlist-controller#59 pre-PR review 2) and 8 are the fix of proposals P2, P5 and P15 in `42c8140` (setlist-controller#59 Keep the GUIDE and MT CLICK tracks at their level during a Fade out) and `68ecdea`: `src/server/fade-out.ts`, `src/server/live-bridge.ts`, `src/set-builder/main.ts`, `web/src/FadeOutButton.tsx`, `README.md`, `docs/install.md`, `test/fade-out.test.ts`, `test/set-builder-command.test.ts`, +110 / -27
**Reviewed against:** the three decided changes: P2 (the fade keeps the click at its level when MT CLICK carries it) with Nick's decision of 2026-10-17 that both the GUIDE and the MT CLICK tracks keep their level during a Fade out; P5 (the `--overlap` usage text names the ring's fade over the first 2 bars of the next song's Intro); P15 (the `--pad` usage text names the pad's fade-in, its tail under the next Count Off and its fade-out). The epic body of setlist-controller#59 for stories 17, 18, 36, 38 and 52 to 58 and the Clips in an overlap, Pad audio and Controller: the fade sections. `pre-pr-review-2.md`: its findings, Approach decisions and Reviewed and Dismissed. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Round 3, delta-scoped.
**Date:** 2026-10-17
**Reviewer:** 1 code-review agent + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date; `pnpm-lock.yaml` and `package.json` unchanged since `0a5af38` |
| Lint | `pnpm lint` | pass, `docs/` included |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 28 files, 501 passed, 2 skipped (the two `it.runIf(linux)` cases in `test/setup-screen.test.ts`, unchanged) |
| Build and Playwright | `pnpm test:e2e` (runs `pnpm build` first) | build ok; 8 passed (webkit-ipad), `e2e/fade-out.spec.ts` included |
| No path steps, reads or restores GUIDE or MT CLICK | finder: every use of `Saved.tracks` traced (`restore`, `cancel`, `lose` and `regain` with the at-risk `lastRestore`, `close`, the step loop, the stale re-press) | clean: the one filter (`src/server/fade-out.ts:154`) builds the list every later path reads; indexes come from `TrackInfo.track`, not position, so leaving two tracks out shifts no other track |
| Every producer and consumer of `TrackInfo` carries `name` | finder: `toTracks` (`src/server/live-bridge.ts:204`), the fake Live's `track.name` answer (`src/fake-live/fake-live.ts:95`), `playback-controller.ts:220`, the contract check (`src/contract/run.ts:338-350`, `test-set.ts:39`), the unit tests' literals | clean: `toTracks` is the only runtime producer and keeps `index / 2`; the contract check builds its own `[name, label]` pairs and already recorded each name |
| The USAGE text is true of the builder | finder, read against `cutOrRing` (`src/set-builder/write-set.ts:209-237`), `padClip` (`:139-140`), `tailClip` (`:152-167`), `findIntro` and `silenceAfter` (`src/set-builder/timeline.ts:130-141`) | true: the click and guide end on the Ending (the single-track branch), the ring fades from the Intro and is cut 2 bars of the next song's starting meter after it, the pad fades in over `min(2 bars, section)`, the tail runs from the Count Off to the Intro plus 2 bars and fades over those 2 bars, and a pad after the last song has no tail clip and a default fade-out. Edge wording under Minor / nits |
| README and FadeOutButton prose | finder, grep of README, `docs/`, `web/src` for metronome, "keeps its level", "ring on", "tail clip", "fades in", Count Off | true; no other prose describes the click during a fade or the overlap and pad fades. `docs/install.md:139` under finding 1 |
| The builder is unchanged but for the help text | `git diff --stat 0a5af38 -- src/set-builder` | `main.ts` only, 10 + / 6 -, all inside the `USAGE` string; no differential harness needed |
| Tautology audit, oracle `0a5af38` | test-audit agent: HEAD's two changed test files copied into a scratch worktree at `0a5af38`, `pnpm exec vitest run test/fade-out.test.ts test/set-builder-command.test.ts` | 3 failed, 57 passed: the three new tests red for the intended reason, the six unit tests that only gained `name` green (see Test quality) |
| Mutations of the GUIDE and MT CLICK rule | test-audit agent and finder, scratch copies at HEAD, each alone: only `MT CLICK` kept, only `GUIDE` kept, a case-insensitive match, the `KEEP_LEVEL` term removed, `toTracks` losing the name (`''` and `String(index)`), the kept tracks read and restored but not stepped, a positional index after the filter | red, each in the new test at `test/fade-out.test.ts:141`; the positional index also reddens 5 older tests |
| What the usage tests pin | test-audit agent: the Pad clip's fade-in changed to 4 bars in `write-set.ts:139` | `test/set-builder-command.test.ts` 36 of 36 green (it pins the wording only); `test/set-builder-pad.test.ts` 5 of 73 red, so the behaviour is pinned there |
| Review 2's proofs still run | test-audit agent, scratch worktree at HEAD: `git apply --check` on each `repro/review-2-mutation-*.diff`; both review 2 repro tests copied into `test/` and run, then `pnpm exec tsc --noEmit -p .` | all 7 diffs apply (3 at offset 7 lines); both repros 7 of 7 green; `review-2-fade-unpinned-lines.test.ts` no longer typechecks (Prior-review closure) |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; whether Live reports `MT CLICK` with its space as `track.name` is #71's run by ear |

**Overall:** The P2, P5 and P15 fix holds. The fade leaves the GUIDE and MT CLICK tracks alone on every path, from the first read to the restore after a lost connection, and the new fade test goes red under every mutation of that rule. The new usage text is true of what the builder writes. This round confirms no defect in the product: one LOW finding batches two descriptions that misstate a rule (a test title and a sentence in `docs/install.md`). The PR can open.

## Approach decisions
Round 1's and round 2's Approach decisions (`pre-pr-review-1.md` and `pre-pr-review-2.md`, `## Approach decisions`) stand unchanged. This round records the two mechanisms the delta chose:
- **The tracks a Fade out leaves at their level (P2):** found by exact name, `GUIDE` and `MT CLICK`, in the `KEEP_LEVEL` set (`src/server/fade-out.ts:32`), at the one filter where the track list arrives (`:154`), so no later path can touch them. Precedent: `PAD_TRACK` (`src/set-builder/template.ts:32`), a template track name the code holds as a constant and matches in its exact letter case, as `templateTargets` matches the stem map's targets.
- **The usage text (P5, P15):** each new sentence pinned whole by a `toContain` on the whitespace-flattened stderr of a usage error (`unwrapped`, `test/set-builder-command.test.ts:44`). Precedent: "documents --overlap in the usage text" in the same file. The behaviour the text describes stays pinned by the builder suites, not by these tests.

## Prior-review closure
Review 2 had three findings, all LOW; stage 2 converged on it without remediating them, and the delta does not touch them.
- **1 (LOW), untouched.** Three lines of the fade's round 1 fix stay unpinned. One staleness from this delta: `TrackInfo` now requires `name`, so the track-data events in finding 1's recommended test text and in `repro/review-2-fade-unpinned-lines.test.ts` fail `pnpm typecheck` once copied into `test/` (TS2345 "Property 'name' is missing", at the repro's lines 27, 38 and 52). Vitest still runs the repro green at HEAD, and its three mutation diffs still apply, at offset 7 lines. Whoever remediates finding 1 adds `name: 'Track <n>'` to each track, as `42c8140` did for the existing unit tests.
- **2 (LOW), untouched.** Four builder rules stay unpinned; its repro and four mutation diffs still apply and run as described.
- **3 (LOW), untouched.** The comment on `PadFile.key` (`src/set-builder/pads.ts:14`) is still stale.

Zero prior findings of MEDIUM or higher, so none is partially fixed or untouched at that level, and none was deferred.

## Confirmed Issues

### 1. Comment hygiene — LOW (aggregated)
Attribution: introduced by the delta, `42c8140` (the `docs/install.md` sentence) and `68ecdea` (the test title), per `git log -S`.
- `test/set-builder-command.test.ts:259` — test title "says in the usage text how a pad fades in, and fades out under the next song's Count Off, but not after the last song" → "says in the usage text how a pad fades in, sounds on under the next song's Count Off and fades out over its Intro, and has no tail after the last song". The sentence the test asserts says the pad keeps sounding under the Count Off and fades out over the first 2 bars of the Intro, as `tailClip` writes it.
- `docs/install.md:139` — "The fade reads each track's name and whether it sits inside a group, so the set holds one track that does and two that do not, and the check records each name as Live reports it. The fade finds the `GUIDE` and `MT CLICK` tracks, which keep their level, by the names Live reports, so a reported name that differs from the one Live shows turns up here." → "The fade reads whether each track sits inside a group, so the set holds one track that does and two that do not. It also finds the `GUIDE` and `MT CLICK` tracks, which keep their level, by the names Live reports, so the check records each name as Live reports it, and a name that differs from the table turns up here." Reading names is not why the set holds one grouped and two ungrouped tracks, and the check compares the reported names with the table's (`isTestSetTracks`, `src/contract/test-set.ts:39`), not with what Live shows. Keep the sentence after it, "The script warns, and runs on, when the tracks differ.", unchanged.

## Needs Further Investigation
Round 1's A to D (Loop on the Pad section dipping at the wrap, effect tails after the restore, fade steps in Live's undo history and automation, a tail clip past a short pad file's end) are unchanged by the delta and still belong to the acceptance run (#71) in Live. See `pre-pr-review-1.md`. One addition for that run, not a defect: the fade test proves the server leaves a track named `MT CLICK` alone when the fake Live reports that name; whether real Live reports it through AbletonOSC's `track.name` with its space intact is unproven, since the contract check's test set has no name with a space. A Fade out in #71 with the metronome off and MT CLICK unmuted settles it by ear.

## Reviewed and Dismissed
- **The fade could still touch GUIDE or MT CLICK on Stop, a lost connection, close or a stale re-press** — every one of those paths reads `Saved.tracks`, built from the filtered list at `fade-out.ts:154`; the new test pins the read, step and restore on the normal path, and the other paths take the same list.
- **Leaving tracks out shifts another track's index** — indexes are `TrackInfo.track`, set by `toTracks` as `index / 2`; a positional-index mutation reddens the new test and 5 older ones.
- **A set whose only top-level tracks are GUIDE and MT CLICK** — the filter returns `[]` and takes the existing empty-list path, which stops Live 6 seconds on (`test/fade-out.test.ts`, "stops Live 6 seconds on when the set has no top-level track to fade").
- **A non-string name drops the track from the list, so it is never faded** — unchanged from the base: `toTracks` already dropped a pair whose name was not a string.
- **A group named GUIDE, or a GUIDE track inside a group** — not the template's shape: the builder's GUIDE and MT CLICK are single tracks outside every group, and a track inside a group is faded by its group as before.
- **"keep their level until Live stops" (`fade-out.ts:7-8`) implies the level changes after the stop** — it restates story 54 ("keep its level during the fade and stop when Live stops"); the fade never touches these tracks.
- **The usage text's "a stem that ends before then keeps its own end" omits that such a stem fades from the Intro to its end, or not at all when it ends by the Intro** — the sentence is true as written, and the fade detail lives in `cutOrRing`'s comment and the overlap suite.
- **The pad text's "keeps sounding under the next song's Count Off" fails for a pad file shorter than its tail** — round 1's Needs Further Investigation D and the open proposal P16, already deferred to #71 and Nick's decision.
- **The overlap text says nothing of a clip that would start ringing after the silence point, which the builder drops** — reachable only with a stem holding a late second clip; MultiTracks stems are one clip from beat 0.
- **SKILL.md for build-set restates the old usage text** — it names `USAGE` as the source of truth and restates none of the fade wording.

## Minor / nits
- "over the first 2 bars of the next song's Intro" (`src/set-builder/main.ts:20`) and "over the first 2 bars of its Intro" (`:26`) are 2 bars of the next song's starting meter from the Intro's start (`silenceAfter`), which run past the Intro into the next section when the Intro is shorter than 2 bars. The wording is the epic's own (story 17, story 38), so it is left as is.
- "with no tail" (`main.ts:33`): "tail" appears nowhere else in USAGE; the pad sentence above calls it sounding on under the Count Off. A change here also changes the sentence `test/set-builder-command.test.ts:269` asserts.
- `KEEP_LEVEL` (`fade-out.ts:32`) repeats two target names from `config/stem-map.json`; a template that renames MT CLICK would have the fade fade it with no test going red. The server reads no builder config, and `PAD_TRACK` sets the precedent.
- The two usage tests pin wording, not behaviour, which is all a help-text test can do; the 4-bar fade-in mutation leaves them green and reddens 5 tests in `test/set-builder-pad.test.ts`.
- Round 2's Minor / nits stand unchanged; the delta touches none of them.

## Test quality
Tests added or changed since `0a5af38`: 9 · red against `0a5af38`: 3 · green against `0a5af38`: 6 · tautology shapes found: 0.

The 3 red: the fade test at `test/fade-out.test.ts:141` (the old fade reads 4 volumes, not 2) and the two usage tests at `test/set-builder-command.test.ts:259` and `:284` (the old text lacks each sentence). The 6 green are existing unit tests in `test/fade-out.test.ts` whose track-data events only gained `name` (three inline, three through `TWO_TRACKS`); they assert no new rule and need none. The fade test runs the real server against the fake Live, writes its expected volumes and step counts as literals, asserts both the messages sent and the fake Live's resulting volumes, and includes a lower-case `Guide` track that catches a case-insensitive match. No snapshots, mocked units under test, assertion-free tests or call-shaped-only assertions.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass at `68ecdea`, and so does `pnpm test:e2e`.
- **Commit hygiene:** the tree is clean. Commit this doc. Nothing to drop.
- **Likely reviewer asks:** why the guide keeps its level through a Fade out (Nick's decision of 2026-10-17, with P2); whether real Live reports `MT CLICK` by that name (#71); and round 2's asks, which stand.

## Verdict
**Ready to open the PR, with follow-ups.** No finding gates it: zero CRITICAL, HIGH or MEDIUM. The delta does what P2, P5 and P15 asked: the fade leaves GUIDE and MT CLICK at their level on every path, and the usage text now names the overlap's and the pad's fades truthfully. The one LOW finding is a batch of two misleading descriptions, a test title and an install-doc sentence, cheap to fix in one commit. Review 2's three LOW findings are still open and untouched, and finding 1's test text needs `name` on each track before it typechecks. The confirmed list went from three to one, all description drift: the fix landed clean.
