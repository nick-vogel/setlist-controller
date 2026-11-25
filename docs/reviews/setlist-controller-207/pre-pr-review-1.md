# Pre-PR review: setlist-controller#207 Test gaps: every guard a review left unpinned fails pnpm test when removed, round 1

**Branch:** `setlist-controller-207-unpinned-guards` vs `origin/main` (merge-base `1d7b38f` "Merge pull request #206 from nick-vogel/setlist-controller-115-cue-lead-time")
**Reviewed at:** HEAD `0df5c11` (setlist-controller#82 No test keeps the build-set skill's example commands in step with the command's flag rules, the merge of lane commit `c8d4048` of the same subject), clean tree: 0 files with uncommitted changes, 0 untracked; 15 files total against the merge-base, +518 / -38
**Delta under review:** none; this is a `--fresh` full review of the branch against its merge-base, and the first review doc in this folder.
**Reviewed against:** the epic setlist-controller#207 (its scope and End state), its five sub-issues #80, #81, #82, #83 and #177 with their acceptance criteria, the #82 comments of 2026-10-17 (`--list` check, "can") and 2026-10-22 (quoted problem lines, "should also check"), the #177 triage comment of 2026-10-22, and the lanes' recorded assumptions for #177, #81 and #82. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist, plus no em-dashes in shipped copy (none in the diff).
**Date:** 2026-10-22
**Reviewer:** 2 code-review agents + 1 mutation and base-oracle agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` in the worktree | up to date |
| `pnpm lint` | run at HEAD | exit 0 |
| `pnpm typecheck` | run at HEAD | exit 0 |
| `pnpm test` | run at HEAD | exit 0, 59 files, 1210 passed, 4 skipped |
| `pnpm build` | run at HEAD | exit 0 |
| `pnpm test:e2e` | run at HEAD (builds first) | exit 0, 44 passed |
| Base oracle | the 8 new or changed test files copied into a scratch worktree at `1d7b38f`, each run alone | only the #83 test fails at base, and `test/native-loaders.test.ts` fails to import; every other new test passes at base, as designed, since they pin guards that were already right |
| Mutation matrix | 31 mutants, each applied alone in a scratch worktree at `0df5c11`, the named test file run, then undone; every mutant typechecks | every kept mutation of #80, #81, #82, #83 and #177 goes red, except the ticket's literal rule-3 mutant (finding 3); full table below under Test quality |
| Real default load of the ATEM library | `node -e` importing `src/server/native-loaders.ts` and calling `loadAtemKind()` with no argument, then `create()` on a section (no target started, no network) | the real kind, label `ATEM`, `create` gives a target named `atem`; the default dynamic import works under Node's type stripping |
| Native packages stay out of the module graph | a `module.registerHooks` resolve hook while importing `native-loaders.ts` (finder agent) | no `atem-connection`, `@julusian/midi`, `atem-switcher.ts` or `coremidi-input.ts` resolved until the default load runs |
| `openMidiInput()` default load | not run | it would open CoreMIDI; its default is the same pattern and directory as the ATEM one, which ran |
| Examples test on a run that never matches names | scratch worktree: the test's `--template` pointed at a missing file | the test stays 13 of 13 green (finding 2); proof preserved in `repro/` |
| Stronger examples assertion | scratch worktree: `not.toBe(2)` replaced by finding 2's recommended fix | 13 of 13 green as written, 12 of 13 red with the missing template |
| Ring boundary, no-Intro branch | finder agent, in memory: Trust In God's Count Off removed, BGVS on 298, with and without `> ending` changed to `>= ending` at `src/set-builder/checks.ts:170` | unmutated: only the Count Off problem; mutant: an extra 5-VOX problem (finding 3) |
| Production OSC ports, network | read every new test and fixture | the rig binds ports the OS assigns (`test/harness.ts:18`); port 4031 in the new fixture is config data the fake kind never binds; the ATEM tests run on `test/fake-switcher.ts`; the Planning Center fake binds port 0 on 127.0.0.1 |

**Overall:** every acceptance criterion of the five sub-issues holds, the full checks are green, and 29 of the 31 mutants go red; the two survivors are the rule-3 literal mutant and one equivalent variant. One requirement is not on the branch at all: the epic's End state, and #82's comment of 2026-10-22, ask that a test check the skill's quoted problem lines against the lines the code prints, and nothing does (finding 1). The #82 lane saw it and filed a proposal. Three LOW findings tighten tests the branch adds. The PR can open once the orchestrator decides where finding 1 lands.

## Approach decisions
- The skill-examples test runs the command by spawning `pnpm --silent build-set` from the repo root, as `test/set-builder-command.test.ts` and `test/set-builder-plan-list.test.ts:81` do, with no flag parsing factored out of `src/set-builder/main.ts` (#82 lane assumption). Fixes keep that route.
- The examples test proves name matching ran with a positive assertion on the build's own per-folder line for an empty song folder (`<folder>: the song could not be read: ...`), not only absences of problem lines (finding 2).
- The native loaders take their dynamic import as a default parameter (`src/server/native-loaders.ts:13-14`, `:28-29`), which tests replace (#177 lane assumption). Kept.
- The quoted-problem-lines check (finding 1) is a new deliverable, not a fix, and goes through its own ticket, from the proposal under `.epic-loop/tickets/82/proposals.md`.

## Confirmed Issues
### 1. No test checks the build-set skill's quoted problem lines against the lines the code prints, which the epic's End state requires — MEDIUM
- **Location:** `test/build-set-skill-examples.test.ts:34-61` (`readExamples` reads only the listing fence and `pnpm build-set` lines); the quotes it never reads are in `.claude/skills/build-set/SKILL.md` step 6 (`:21-34`) and The plan path (`:39-75`), plus the fences at `:237-239` and `:283-285` and prose quotes at `:207`, `:221`, `:251`, `:261`, `:277`, `:287` and `:299`.
- **Attribution:** pre-existing, untouched. The gap is on base; the branch's only skill test covers the commands. `git diff 1d7b38f --stat` shows no change under `.claude/` or `src/set-builder/`, and `git grep -n "SKILL.md" -- test` finds only `test/build-set-skill-examples.test.ts`.
- **Real-world trigger:** a later change rewords a problem line in `src/set-builder/` (as #172 found and fixed by hand). The skill then quotes a line the build no longer prints, and Claude, running the skill, cannot match the printed line to its fix and guesses one, with every check green. MEDIUM, capped (docs drift class): no wrong set is built, and the skill falls back to showing the line as printed.

**Evidence** — the epic body: "the build-set skill: its example commands and its quoted problem lines, read against the command's own flag rules and the lines the code prints", and its End state: "the build-set skill's commands and quoted problem lines are checked against the code by a test". The #82 comment of 2026-10-22: "When this test is built, it should also check that each quoted problem line in `SKILL.md` matches a line the code can print (`src/set-builder/checks.ts`, `build-set.ts`, `plan-reader.ts`, `plan-list.ts`, `pads.ts`, `song.ts` and `main.ts`), with each `<placeholder>` read as a wildcard, and go red when a line in the code is reworded (mutation, reverted after)." The #82 lane's plan (`.epic-loop/tickets/82/plan.md:51`) took the opposite view, that "this ticket covers only the commands", and filed the proposal "Check the problem lines the build-set skill quotes against the lines the code prints".

**Failure mode** — reword any quoted line in the code, such as `Cannot read the pads folder ${folder}.` to `Cannot open the pads folder ${folder}.` in `src/set-builder/`, and `pnpm test` stays green while `SKILL.md:25` still quotes the old line.

**Recommended fix** — a new test (in `test/build-set-skill-examples.test.ts` or a sibling file) that extracts every backtick-quoted problem line from `SKILL.md`'s Steps step 6 and The plan path, reads each `<placeholder>` and a trailing `...` as a wildcard, and requires each one to match a line the code can print: the string and template literals of the seven modules the comment names, each `${...}` read as a wildcard. It goes red under a rewording mutation of one quoted line in the code. This is a new deliverable with design choices of its own (how a quote that writes a literal, such as `config/stem-map.json`, matches a template that interpolates it; how a quote cut short with `...` matches), so it is no in-place fix.

**Remediation brief**
- **Design intent:** `SKILL.md` is the operator-facing contract Claude follows to turn a printed problem line into its fix, so its quotes are a copy of the code's problem strings. The test has to read the same strings the command prints, and fail loudly when it finds no quote at all, as the commands half does (`test/build-set-skill-examples.test.ts:130-134`).
- **Full surface:** `.claude/skills/build-set/SKILL.md:21-75` and the later quotes above; the problem strings in `src/set-builder/checks.ts`, `build-set.ts`, `plan-reader.ts`, `plan-list.ts`, `pads.ts`, `song.ts` and `main.ts`; the test file.
- **Must preserve:** the 13 tests of `test/build-set-skill-examples.test.ts`; no change to `src/set-builder/*` or to `SKILL.md` unless a quote turns out wrong, which is then a finding of its own.
- **Do not touch:** the commands half's spawn route (Approach decisions, first line).
- **Proof:** the new test passes at the tip, and goes red when one quoted line in the code is reworded, with the mutation reverted after. `pnpm exec vitest run test/build-set-skill-examples.test.ts`.
- **Escalation:** a new deliverable, not a fix: take it as its own ticket from `.epic-loop/tickets/82/proposals.md` ("Check the problem lines the build-set skill quotes against the lines the code prints"), under this epic, or amend the epic's End state. `/pr-review-remediate` should not build it in place.

### 2. The skill-examples test passes on a run that stops before any short name is matched — LOW
- **Location:** `test/build-set-skill-examples.test.ts:148-158`
- **Attribution:** introduced, by `c8d4048` (setlist-controller#82 No test keeps the build-set skill's example commands in step with the command's flag rules); the file is new on the branch.
- **Real-world trigger:** a later change makes every build stop early with exit 1: the fixture template moves, `config/stem-map.json` cannot be read (`src/set-builder/main.ts:226-227` reads it before `buildSet`), or the plan reader's second request fails on fixture drift. Every example then passes without its names or (for `--plan`) its transition flags ever being checked, and a broken example ships with a green suite. LOW, capped: no user meets it until a second change breaks an example in the same window.

**Evidence**
```ts
expect(result.stdout + result.stderr).not.toContain('Usage:');
expect(result.code).not.toBe(2);
expect(result.stderr).not.toContain('needs a song position from');
expect(result.stderr).not.toContain('which is not a note name');
```
Every check on a run is an absence, so any exit 1 that prints none of the named lines passes, and so does `code === null` from a signal.

**Failure mode** — proved by execution: with the test's `--template` pointed at a missing file (`docs/reviews/setlist-controller-207/repro/pre-pr-review-1-mutation-missing-template.diff`), every command prints only `ENOENT: no such file or directory, open '<template>'` and exits 1, and the file stays 13 of 13 green. `pnpm --silent build-set god grace --library <missing dir> ...` likewise prints only `Cannot read the song library ...` and passes every assertion the test makes, though `god` matches two folders.

**Recommended fix**
```diff
       expect(result.stdout + result.stderr).not.toContain('Usage:');
-      expect(result.code).not.toBe(2);
+      expect(result.code).toBe(1);
+      expect(result.stderr).toMatch(/: the song could not be read: /);
       expect(result.stderr).not.toContain('needs a song position from');
```
Checked in a scratch worktree: 13 of 13 green as written, and 12 of 13 red with the repro diff applied (the twelve commands; the fence test is unaffected).

**Remediation brief**
- **Design intent:** each example runs against a scratch library of empty folders named by the skill's listing, so a run that matched every name and passed every flag rule reaches the build, which stops with exit 1 and one `<folder>: the song could not be read: ENOENT ... MultiTrack.als` line per song. That line is the positive proof the run got past the flags and the names; for a `--plan` command it also proves the plan read finished and its folders were picked, since the build runs only after `readWeekPlan` returns (`src/set-builder/main.ts:288-289`).
- **Full surface:** `test/build-set-skill-examples.test.ts:148-149` only.
- **Must preserve:** every other assertion in the loop body (`:147-158`): no `Usage:`, no `needs a song position from`, no `which is not a note name`, the `--plan` items request and the four plan problem lines, and the two match lines for typed commands. All four mutants of #82's acceptance criteria stay red: `--overlap 3` in worked example 1 (exit 2), `padPosition` capped at the second-to-last song (exit 2), `god` (the `matches 2 song folders` line), `zzz` (the `matches no song folder` line). The fix's own failure: a rewording of the build's empty-folder line turns all twelve tests red at once, loud, never silently green.
- **Do not touch:** the `--date`/path append (Minor, F5) and the parser (Minor, parser gaps).
- **Proof:** `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-1-mutation-missing-template.diff && pnpm exec vitest run test/build-set-skill-examples.test.ts; git apply -R docs/reviews/setlist-controller-207/repro/pre-pr-review-1-mutation-missing-template.diff` is 13 passed now and must be 12 failed after the fix; without the diff the file must be 13 passed. Run the apply only in a scratch worktree.

### 3. The ticket's literal ring-boundary mutant survives: `> ending` in the no-Intro branch is unpinned — LOW
- **Location:** `src/set-builder/checks.ts:170`; the test that pins its sibling is `test/set-builder-stop-rules.test.ts:894`.
- **Attribution:** pre-existing, untouched gap; the branch's 298 test pins the Intro branch's boundary (`end > start`, `checks.ts:176`, mutant red) but not this one. #81 rule 3 names the literal mutant "`> ending` changed to `>= ending`", and the epic's End state is that each kept mutation turns `pnpm test` red. The #81 lane recorded that the literal mutant is equivalent "no test can kill" (`.epic-loop/tickets/81/assumptions.md`, second line); it is equivalent only on the Intro branch.
- **Real-world trigger:** an overlap into a song with no Count Off, whose build already stops with the Count Off problem. Under the mutant, a stem that ends exactly on the Ending also counts as ringing, so the stopped build prints a second, false problem (`... the overlap needs 5 VOX tracks, ...`), and Nick may chase a track count that is not wrong. LOW, capped: the build stops either way, and no set is written.

**Evidence**
```ts
const intro = hasStartingValues(next) ? findIntro(next) : undefined;
if (intro === undefined) return (stem) => rightBefore && stem.clips.some((clip) => Number(valueOf(clip, 'CurrentEnd')) > ending);
```

**Failure mode** — executed by the finder agent in memory, Goodness of God into Trust In God with overlap 1, BGVS edited to end on 298 and Trust In God's `Count Off` removed: unmutated, the only problem is `Trust In God-...: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`; with `> ending` changed to `>= ending` at `:170`, the 5-VOX problem appears beside it. With the BGVS clip unedited (318), both problems appear, so the control holds. The mutation agent's mutant 5a (`:170`) left the file green.

**Recommended fix** — a test beside `test/set-builder-stop-rules.test.ts:894`:
```ts
  it("counts a stem that ends exactly on the first song's Ending as not ringing into a song with no Count Off", async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'BGVS', (text) => text.replace('<CurrentEnd Value="318.00004942973692" />', '<CurrentEnd Value="298" />'));
    await removeLocator(workspace, TRUST, 'Count Off');

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [`${TRUST}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`],
    });
  });
```
Note that `removeLocator(workspace, TRUST, 'Intro')` is not enough: `findIntro` takes the first locator after the Count Off, which is then Verse 1.

**Remediation brief**
- **Design intent:** `holdsAt` decides whether a stem of the song right before an overlap still holds its track when the next song starts. With an Intro it uses the ring-out window (`:171-177`); without one it falls back to "any clip ends past the Ending" (`:170`). A clip that ends exactly on the Ending is free in both branches.
- **Full surface:** `test/set-builder-stop-rules.test.ts` only, beside `:894`; `removeLocator` is exported by `test/set-builder-harness.ts:109` and already imported by the file (`:23`); `stoppedBuild` is the file's own (`:53`).
- **Must preserve:** the 298 test at `:894` and the 290 test above it; no file under `src/` changes (#81 acceptance criteria).
- **Do not touch:** `checks.ts:176` (pinned by `:894`, mutant 5c red).
- **Proof:** the new test passes at the tip; with `> ending` changed to `>= ending` at `src/set-builder/checks.ts:170` (in a scratch worktree), `pnpm exec vitest run test/set-builder-stop-rules.test.ts` goes red on it. If the exact problem text differs at the tip, take it from `src/set-builder/checks.ts:104` and keep the `toEqual` on a one-item list.

### 4. `openMidiInput`'s fallback for a thrown value that is no Error has no test — LOW
- **Location:** `src/server/native-loaders.ts:21`
- **Attribution:** pre-existing, exposed: the branch moved the code out of `src/server/main.ts` (where no test could reach it) and tested every other branch of both loaders; the ATEM loader's matching branch has a test (`test/native-loaders.test.ts:63-69`), and this one does not.
- **Real-world trigger:** a native loader that rejects with a string, as the ATEM test simulates with `'dlopen failed'`. Under a mutant of `String(error)` (to `''`, say) the setup screen shows the MIDI input as unavailable with an empty reason, and `pnpm test` stays green. LOW: no user path today.

**Evidence**
```ts
return unavailableMidiInput(error instanceof Error ? error.message : String(error));
```
The three MIDI tests (`test/native-loaders.test.ts:102-134`) reject or throw only `Error` instances.

**Recommended fix** — in `describe('the MIDI input')`:
```ts
  it('is unavailable, with the reason as it was thrown, when the load fails with no Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const input = await openMidiInput(() => Promise.reject('dlopen failed'));

    expect(input.state).toEqual({ kind: 'unavailable', message: 'dlopen failed' });
  });
```

**Remediation brief**
- **Design intent:** a laptop whose MIDI cannot be opened still runs the server; the setup screen shows the reason as thrown. Both loaders treat a non-Error the same way, and the ATEM's test at `:63-69` is the precedent.
- **Full surface:** `test/native-loaders.test.ts`, inside `describe('the MIDI input')` (`:102`).
- **Must preserve:** the three existing MIDI tests; `afterEach`'s `vi.restoreAllMocks()` (`:16-20`).
- **Do not touch:** `src/server/native-loaders.ts`.
- **Proof:** the test passes at the tip; with `String(error)` replaced by `''` at `src/server/native-loaders.ts:21` (scratch worktree), `pnpm exec vitest run test/native-loaders.test.ts` goes red on it.

### 5. Comment hygiene — LOW (aggregated)
- `src/server/native-loaders.ts:5-6` — "Only main.ts calls them." → "In production, only main.ts calls them." (`test/native-loaders.test.ts` calls both.)
- `src/server/native-loaders.ts:25-26` — "so the server module and every test stay clear of its native package" → "so the server module and every rig test stay clear of its native package" (`test/atem-switcher.test.ts:7` imports `atem-switcher.ts`, and the restart and signals tests spawn it; `src/server/atem-switcher.ts:6-7` already says "every rig test"). The sentence moved verbatim from base `main.ts`.
- `src/server/coremidi-input.ts:15` — "native-loaders.ts reports that on the setup screen." → "native-loaders.ts turns that into the unavailable input whose reason the setup screen shows."
- `test/build-set-skill-examples.test.ts:130` — test name "and no command outside a fence" → "and no line outside a fence that starts with the command" (the check at `:133` sees only lines that start `pnpm build-set`; `SKILL.md:261` and `:281` hold commands inside prose).

## Needs Further Investigation
### A. The close comment's "on a socket that may have closed" (`src/server/fade-out.ts:83-84`) — confirm whether the bridge can report Live after its socket closes
The second restore at base ran in `regain()`, synchronously inside a Live event the bridge delivered, so the bridge was open then, and the real harm the #83 test pins is a duplicate restore after close. The comment's socket claim holds only if the bridge can deliver a connection event after its socket closed. Confirm by reading `src/server/live-bridge.ts`'s close path for any event emitted after the socket closes; if none, reword to "would otherwise set the same volumes a second time after the close".

## Reviewed and Dismissed
- The 298 test cannot go red (finder, provisional HIGH) — dismissed: at the tip the Intro branch's boundary is `end > start` at `src/set-builder/checks.ts:176`, and the mutant `end >= start` turns the test red (mutation 5c). Only the no-Intro branch's literal is unpinned, which is finding 3.
- The default loads in `native-loaders.ts` have no unit test — dismissed: `pnpm typecheck` checks both specifiers and their exports through `Pick<typeof import(...)>`, and the real ATEM default load was executed.
- `native-loaders.ts`'s static `./atem.ts` import drags in the native package — dismissed: `atem.ts` imports only clock, connections-config, cues, playback-controller and target, and a resolve hook saw no native module.
- `if (closed) return;` in `fromLive` changes behaviour before close — dismissed: `closed` is set only in `close()` (`src/server/fade-out.ts:256`); after close the state is idle, so only `lose()`'s at-risk path changes, which is the fix.
- The examples test's scratch folder under `dist/` races `pnpm build` — dismissed: vite empties only `dist/web` (`vite.config.ts`), and `mkdtemp` gives each run its own folder, as `createWorkspace` does.
- The `--plan` cases could reach the real Planning Center — dismissed: a failed `startPlanningCenter` fails `beforeAll`, so no case runs, and the fake binds port 0 on 127.0.0.1.
- Port 4031 in `test/fixtures/connections/atem-and-fake.json` binds a fixed port — dismissed: config data the fake kind checks as an integer and never binds, as in the other fixtures.
- #177's mutations 1 and 2 need new tests — dismissed: both go red through existing `refuseCuts()` and `failConnects()` tests (mutations 9a and 9b); the Pro-button test is the only killer of a Pro-path-only mutant (11b).
- The ramp test computes its own expectation — dismissed: 274.959946 is derived independently in its comment (436 x 60 / 98 + 720 x ln(82/98) / (82 - 98)), and both named mutants give 274.285714.

## Minor / nits
- The examples test appends `--library`, `--template`, `--output-root`, `--pads` and, for `--plan`, `--date` after the example's own words, so an example that one day carries one of them is run with the test's value; `parseArgs` keeps the last. A fenced `pnpm build-set --list` example would get `--template`, a usage error for `--list` (`src/set-builder/main.ts:155`), and go red falsely. No example carries any of these today.
- Parser gaps in `readExamples` (`test/build-set-skill-examples.test.ts:46-60`): `~~~` fences and `$ `-prefixed command lines are skipped silently, and a 4-backtick fence holding a ``` line would toggle the fence state.
- Only `SKILL.md:224` (`--plan --pad 3`) pins a transition flag on a plan; the other three `--plan` examples carry no transition flag. That is the skill's content, not the test's.
- The listing fence's short names and keys are never checked against what `pnpm build-set --list` prints (the #82 comment of 2026-10-17 says the test "can"); the #82 lane filed this, and the inline commands at `SKILL.md:261` and `:281`, as proposals.
- `test/fade-out.test.ts:924` cites "story 57", which is #80's own reference ("a Stop always wins (story 57)").

## Test quality
Tests added: 29 (fade-out 2, atem 1, native-loaders 7, build-set skill examples 13, set-builder overlap 1, pad 2, stop-rules 3). Green against `$BASE`: 21, by design, since #80, #81, #82 and #177 pin guards that were already right; the oracle for those is the mutation matrix. Red at base: the #83 test, and the 7 native-loaders tests (import fails). Tautology shapes: none; one absence-only assertion set (finding 2).

| Mutant | Change | Result |
| --- | --- | --- |
| #80 | `cancel()` returns early from `reading-volumes` (`fade-out.ts:173`) | red |
| #83 | `if (closed) return;` removed from `fromLive` | red |
| #81.1a, 1b | `bpmAt` returns `point.bpm`; `rampSeconds` steady for a ramp (`tempo.ts:21`, `:30`) | red, red |
| #81.2a, 2b | `!song ||` removed (`checks.ts:86`); `next ?` to `next!` (`:94`) | red, red |
| #81.3 literal | `> ending` to `>= ending` (`checks.ts:170`) | **green** (finding 3) |
| #81.3 variant | `end <= ending` to `end < ending` (`checks.ts:176`) | green, equivalent |
| #81.3 tip | `end > start` to `end >= start` (`checks.ts:176`) | red |
| #81.8 | step back skipped for a one-song set (`write-set.ts:278`) | red |
| #81.9 | `!next` skip removed in `padProblems` (`checks.ts:126`) | red |
| #82 | `--overlap 3` in example 1; `padPosition` capped; `god`; `zzz`; `checkTransitions` pad cap; `--plan --pad 4`, `--pad 3=H`, `--plan --overlap 3`, `--plan --replace --pad 9` | all red |
| #177 | cut `.catch` dropped; connect rethrows; fallback `create` throws; `loadAtemKind` try/catch deleted; `openMidiInput` try/catch deleted; loaded client ignored (two forms); refused cut kept as own (both forms) | all red |

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `0df5c11`; e2e green locally.
- **Commit hygiene:** the branch is lane merges plus their commits, one subject per ticket; this doc and its `repro/` diff are the only additions.
- **Likely reviewer asks:** why #80's and #81's new tests pass at base (they pin guards; the mutation table above is the evidence); where the quoted-problem-lines half of the epic went (finding 1).

## Verdict
Ready to open a PR with follow-ups. No finding blocks the PR on its own: findings 2 to 5 are LOW and can be remediated on this branch or follow up. The epic's End state is not met until finding 1 lands: the quoted-problem-lines test is a new deliverable, so the orchestrator decides whether it lands as its own ticket under this epic before the PR, or the epic's End state is amended. Prior review findings: none (round 1).

## Remediation, 2026-10-22
Scope: CRITICAL, HIGH and MEDIUM, the `/pr-review-remediate` default. The only finding in scope is finding 1, and its brief carries an Escalation that says not to build it in place, so this round changes no code. Findings 2 to 5 are LOW and deliberately deferred: they stay open for Nick to opt in to, or for the next round.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | skipped | not run: no code written | 0 | escalated: split ticket recommended. The quoted-problem-lines test is a new deliverable with design choices of its own (a quote that writes a literal against a template that interpolates it; a quote cut short with `...`), per the brief's Escalation line. Filed as a proposal in `.epic-loop/stage2/proposals.md`, from the #82 lane's proposal "Check the problem lines the build-set skill quotes against the lines the code prints". The epic's End state is not met until it lands or the End state is amended. |
| 2 (LOW) | deferred | not run | 0 | open, LOW tail |
| 3 (LOW) | deferred | not run | 0 | open, LOW tail |
| 4 (LOW) | deferred | not run | 0 | open, LOW tail |
| 5 (LOW, comment hygiene) | deferred | not run | 0 | open, LOW tail |

### Known regressions, deferred
- None: this round made no code change.

### Rework briefs
- None: no fix was made, so none was reworked.

No Phase 2 verify ran, since no fix was committed. The Approach decisions above stand unchanged; the fourth line (finding 1 goes through its own ticket) is the one this round applied.
