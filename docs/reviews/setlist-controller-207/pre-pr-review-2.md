# Pre-PR review: setlist-controller#207 Test gaps: every guard a review left unpinned fails pnpm test when removed, round 2

**Branch:** `setlist-controller-207-unpinned-guards` vs `origin/main` (merge-base `1d7b38f` "Merge pull request #206 from nick-vogel/setlist-controller-115-cue-lead-time"; `origin/main` has not moved since round 1)
**Reviewed at:** HEAD `9066bb9` (setlist-controller#207 pre-PR review 1 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 17 files total against the merge-base, +757 / -38, of which 2 are round 1's review doc and its `repro/` diff
**Delta under review:** since `0df5c11` (setlist-controller#82 No test keeps the build-set skill's example commands in step with the command's flag rules), the HEAD `pre-pr-review-1.md` reviewed. The delta is empty in code: `git diff --stat 0df5c11` shows only `docs/reviews/setlist-controller-207/pre-pr-review-1.md` and `repro/pre-pr-review-1-mutation-missing-template.diff` (+239), from `9ed8134` (setlist-controller#207 pre-PR review 1) and `9066bb9` (its closure table). Round 1's remediation changed no code: it escalated finding 1 and deferred findings 2 to 5. So this round re-verifies every prior finding against its intent at HEAD, settles round 1's open investigation, and re-emits the findings with their briefs.
**Reviewed against:** the epic setlist-controller#207 and its five sub-issues #80, #81, #82, #83 and #177 (all still open on GitHub; no new sub-issue carries round 1's finding 1), `pre-pr-review-1.md` with its closure table and Approach decisions, and `.epic-loop/stage2/proposals.md`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist, plus no em-dashes in shipped copy (none in the diff).
**Date:** 2026-10-22
**Reviewer:** 0 code-review agents (empty code delta, nothing to partition) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| `$LAST_REVIEWED` | `git cat-file -t 0df5c11` | commit |
| Delta | `git diff --stat 0df5c11` | review doc and repro diff only, no code or test file |
| Dependencies | `pnpm install --frozen-lockfile` in the worktree | exit 0 |
| `pnpm lint` | run at HEAD | exit 0 |
| `pnpm typecheck` | run at HEAD | exit 0 |
| `pnpm test` | run at HEAD | exit 0, 59 files, 1210 passed, 4 skipped |
| `pnpm build` | run at HEAD | exit 0 |
| `pnpm test:e2e` | run at HEAD (builds first, ports the OS assigns) | exit 0, 44 passed |
| Finding 1 still open | `git grep -n "SKILL.md" -- test`; read `test/build-set-skill-examples.test.ts:140-160` | only the commands test reads `SKILL.md`, and it reads no problem line |
| Finding 2 still open | scratch worktree at `9066bb9`: the examples file unmutated, then with `repro/pre-pr-review-1-mutation-missing-template.diff` applied | 13 of 13 passed, then 13 of 13 passed with every run stopping on a missing template |
| Finding 3 still open | same scratch worktree: `> ending)` to `>= ending)` at `src/set-builder/checks.ts:170`, `pnpm exec vitest run test/set-builder-stop-rules.test.ts` | 79 of 79 passed under the mutant |
| Finding 4 still open | same scratch worktree: `String(error)` to `''` at `src/server/native-loaders.ts:21`, `pnpm exec vitest run test/native-loaders.test.ts` | 7 of 7 passed under the mutant |
| Round 1's investigation A | read `src/server/live-bridge.ts:127-204` and `src/server/server.ts:246-256` | settled: comment drift, folded into finding 5 |
| Mutation matrix, base oracle | not re-run | no code or test file changed since round 1 ran both at `0df5c11`; its table stands |
| Scratch worktree | `git worktree remove` after the checks | removed; `git status --porcelain` clean |

**Overall:** nothing changed in code since round 1, the full checks are green, and every prior finding still holds as written. The one MEDIUM, the missing quoted-problem-lines test, was escalated by decision to its own ticket and sits as a proposal in `.epic-loop/stage2/proposals.md`; no sub-issue for it exists yet. Round 1's open investigation resolves to a wrong clause in one comment, which joins the comment hygiene batch. The PR can open once the orchestrator decides where finding 1 lands; findings 2 to 5 are LOW.

## Approach decisions
- The skill-examples test runs the command by spawning `pnpm --silent build-set` from the repo root, as `test/set-builder-command.test.ts` and `test/set-builder-plan-list.test.ts:81` do, with no flag parsing factored out of `src/set-builder/main.ts` (#82 lane assumption). Fixes keep that route.
- The examples test proves name matching ran with a positive assertion on the build's own per-folder line for an empty song folder (`<folder>: the song could not be read: ...`), not only absences of problem lines (finding 2).
- The native loaders take their dynamic import as a default parameter (`src/server/native-loaders.ts:13-14`, `:28-29`), which tests replace (#177 lane assumption). Kept.
- The quoted-problem-lines check (finding 1) is a new deliverable, not a fix, and goes through its own ticket, from the proposal in `.epic-loop/stage2/proposals.md` ("Check the problem lines the build-set skill quotes against the lines the code prints"). Applied by round 1's remediation; this round keeps it.

## Prior-review closure
Round 1 (`pre-pr-review-1.md`, reviewed at `0df5c11`) confirmed 5 findings: fully fixed 0, partially fixed 0, untouched 5. Of the untouched, finding 1 (MEDIUM) is deferred by decision: its closure-table row reads "escalated: split ticket recommended", and it is filed as a stage-2 proposal. Findings 2 to 5 (LOW) were deferred as the LOW tail ("open, LOW tail"). No fix was resolved by a comment or doc edit alone. Round 1's investigation A is settled below, under finding 5.

## Confirmed Issues
### 1. No test checks the build-set skill's quoted problem lines against the lines the code prints, which the epic's End state requires — MEDIUM
- **Location:** `test/build-set-skill-examples.test.ts:34-61` (`readExamples` reads only the listing fence and `pnpm build-set` lines); the quotes it never reads are in `.claude/skills/build-set/SKILL.md` step 6 (`:21-34`) and The plan path (`:39-75`), plus the fences at `:237-239` and `:283-285` and prose quotes at `:207`, `:221`, `:251`, `:261`, `:277`, `:287` and `:299`.
- **Attribution:** pre-existing, untouched against `$BASE` (`git diff 1d7b38f --stat` shows no change under `.claude/` or `src/set-builder/`); unchanged since `0df5c11`. Escalated at round 1, deferred by decision: the closure table reads "escalated: split ticket recommended", and `.epic-loop/stage2/proposals.md` holds the ticket.
- **Real-world trigger:** a later change rewords a problem line in `src/set-builder/` (as #172 found and fixed by hand). The skill then quotes a line the build no longer prints, and Claude, running the skill, cannot match the printed line to its fix and guesses one, with every check green. MEDIUM, capped (docs drift class): no wrong set is built, and the skill falls back to showing the line as printed.

**Evidence** — the epic body: "the build-set skill: its example commands and its quoted problem lines, read against the command's own flag rules and the lines the code prints", and its End state: "the build-set skill's commands and quoted problem lines are checked against the code by a test". The #82 comment of 2026-10-22 asks that the test "also check that each quoted problem line in `SKILL.md` matches a line the code can print (`src/set-builder/checks.ts`, `build-set.ts`, `plan-reader.ts`, `plan-list.ts`, `pads.ts`, `song.ts` and `main.ts`), with each `<placeholder>` read as a wildcard". At HEAD, `git grep -n "SKILL.md" -- test` finds only `test/build-set-skill-examples.test.ts`, whose assertions (`:147-158`) check commands only.

**Failure mode** — reword any quoted line in the code, such as `Cannot read the pads folder ${folder}.` to `Cannot open the pads folder ${folder}.` in `src/set-builder/`, and `pnpm test` stays green while `SKILL.md:25` still quotes the old line.

**Recommended fix** — a new test (in `test/build-set-skill-examples.test.ts` or a sibling file) that extracts every backtick-quoted problem line from `SKILL.md`'s Steps step 6 and The plan path, reads each `<placeholder>` and a trailing `...` as a wildcard, and requires each one to match a line the code can print: the string and template literals of the seven modules the comment names, each `${...}` read as a wildcard. It goes red under a rewording mutation of one quoted line in the code. This is a new deliverable with design choices of its own (how a quote that writes a literal, such as `config/stem-map.json`, matches a template that interpolates it; how a quote cut short with `...` matches), so it is no in-place fix.

**Remediation brief**
- **Design intent:** `SKILL.md` is the operator-facing contract Claude follows to turn a printed problem line into its fix, so its quotes are a copy of the code's problem strings. The test has to read the same strings the command prints, and fail loudly when it finds no quote at all, as the commands half does (`test/build-set-skill-examples.test.ts:130-134`).
- **Full surface:** `.claude/skills/build-set/SKILL.md:21-75` and the later quotes above; the problem strings in `src/set-builder/checks.ts`, `build-set.ts`, `plan-reader.ts`, `plan-list.ts`, `pads.ts`, `song.ts` and `main.ts`; the test file.
- **Must preserve:** the 13 tests of `test/build-set-skill-examples.test.ts`; no change to `src/set-builder/*` or to `SKILL.md` unless a quote turns out wrong, which is then a finding of its own.
- **Do not touch:** the commands half's spawn route (Approach decisions, first line).
- **Proof:** the new test passes at the tip, and goes red when one quoted line in the code is reworded, with the mutation made in a scratch worktree. `pnpm exec vitest run test/build-set-skill-examples.test.ts`.
- **Escalation:** a new deliverable, not a fix: take it as its own ticket from `.epic-loop/stage2/proposals.md`, under this epic, or amend the epic's End state. `/pr-review-remediate` should not build it in place. Round 1's remediation already applied this; the decision still waits on the orchestrator.

### 2. The skill-examples test passes on a run that stops before any short name is matched — LOW
- **Location:** `test/build-set-skill-examples.test.ts:148-149`
- **Attribution:** introduced, by `c8d4048` (setlist-controller#82 No test keeps the build-set skill's example commands in step with the command's flag rules); the file is new on the branch. Unchanged since `0df5c11`; deferred at round 1 as the LOW tail.
- **Real-world trigger:** a later change makes every build stop early with exit 1: the fixture template moves, `config/stem-map.json` cannot be read (`src/set-builder/main.ts:226-227` reads it before `buildSet`), or the plan reader's second request fails on fixture drift. Every example then passes without its names or (for `--plan`) its transition flags ever being checked, and a broken example ships with a green suite. LOW, capped: no user meets it until a second change breaks an example in the same window.

**Evidence**
```ts
expect(result.stdout + result.stderr).not.toContain('Usage:');
expect(result.code).not.toBe(2);
expect(result.stderr).not.toContain('needs a song position from');
expect(result.stderr).not.toContain('which is not a note name');
```
Every check on a run is an absence, so any exit 1 that prints none of the named lines passes, and so does `code === null` from a signal.

**Failure mode** — re-proved at `9066bb9` this round: with `docs/reviews/setlist-controller-207/repro/pre-pr-review-1-mutation-missing-template.diff` applied in a scratch worktree, every command prints only an `ENOENT` for the template and exits 1, and `pnpm exec vitest run test/build-set-skill-examples.test.ts` stays 13 of 13 passed.

**Recommended fix**
```diff
       expect(result.stdout + result.stderr).not.toContain('Usage:');
-      expect(result.code).not.toBe(2);
+      expect(result.code).toBe(1);
+      expect(result.stderr).toMatch(/: the song could not be read: /);
       expect(result.stderr).not.toContain('needs a song position from');
```
Checked in a scratch worktree at round 1: 13 of 13 green as written, and 12 of 13 red with the repro diff applied (the twelve commands; the fence test is unaffected). The code under it has not changed since.

**Remediation brief**
- **Design intent:** each example runs against a scratch library of empty folders named by the skill's listing, so a run that matched every name and passed every flag rule reaches the build, which stops with exit 1 and one `<folder>: the song could not be read: ENOENT ... MultiTrack.als` line per song. That line is the positive proof the run got past the flags and the names; for a `--plan` command it also proves the plan read finished and its folders were picked, since the build runs only after `readWeekPlan` returns (`src/set-builder/main.ts:288-289`).
- **Full surface:** `test/build-set-skill-examples.test.ts:148-149` only.
- **Must preserve:** every other assertion in the loop body (`:147-158`): no `Usage:`, no `needs a song position from`, no `which is not a note name`, the `--plan` items request and the four plan problem lines, and the two match lines for typed commands. All four mutants of #82's acceptance criteria stay red: `--overlap 3` in worked example 1 (exit 2), `padPosition` capped at the second-to-last song (exit 2), `god` (the `matches 2 song folders` line), `zzz` (the `matches no song folder` line). The fix's own failure: a rewording of the build's empty-folder line turns all twelve tests red at once, loud, never silently green.
- **Do not touch:** the `--date`/path append and the parser (both under Minor / nits).
- **Proof:** in a scratch worktree, `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-1-mutation-missing-template.diff && pnpm exec vitest run test/build-set-skill-examples.test.ts` is 13 passed now and must be 12 failed after the fix; without the diff the file must be 13 passed.

### 3. The ticket's literal ring-boundary mutant survives: `> ending` in the no-Intro branch is unpinned — LOW
- **Location:** `src/set-builder/checks.ts:170`; the test that pins its sibling is `test/set-builder-stop-rules.test.ts:894`.
- **Attribution:** pre-existing, untouched gap; the branch's 298 test pins the Intro branch's boundary (`end > start`, `checks.ts:176`) but not this one. #81 rule 3 names the literal mutant "`> ending` changed to `>= ending`", and the epic's End state is that each kept mutation turns `pnpm test` red. Unchanged since `0df5c11`; deferred at round 1 as the LOW tail.
- **Real-world trigger:** an overlap into a song with no Count Off, whose build already stops with the Count Off problem. Under the mutant, a stem that ends exactly on the Ending also counts as ringing, so the stopped build prints a second, false problem (`... the overlap needs 5 VOX tracks, ...`), and Nick may chase a track count that is not wrong. LOW, capped: the build stops either way, and no set is written.

**Evidence**
```ts
const intro = hasStartingValues(next) ? findIntro(next) : undefined;
if (intro === undefined) return (stem) => rightBefore && stem.clips.some((clip) => Number(valueOf(clip, 'CurrentEnd')) > ending);
```

**Failure mode** — re-proved at `9066bb9` this round: with `> ending)` changed to `>= ending)` at `:170` in a scratch worktree, `pnpm exec vitest run test/set-builder-stop-rules.test.ts` is 79 of 79 passed. Round 1 executed the scenario in memory (Goodness of God into Trust In God with overlap 1, BGVS ending on 298, Trust In God's `Count Off` removed): unmutated, only the Count Off problem; mutated, the 5-VOX problem appears beside it.

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
`removeLocator(workspace, TRUST, 'Intro')` is not enough: `findIntro` takes the first locator after the Count Off, which is then Verse 1.

**Remediation brief**
- **Design intent:** `holdsAt` decides whether a stem of the song right before an overlap still holds its track when the next song starts. With an Intro it uses the ring-out window (`:171-177`); without one it falls back to "any clip ends past the Ending" (`:170`). A clip that ends exactly on the Ending is free in both branches.
- **Full surface:** `test/set-builder-stop-rules.test.ts` only, beside `:894`; `removeLocator` is exported by `test/set-builder-harness.ts:109` and already imported by the file (`:23`); `stoppedBuild` is the file's own (`:53`).
- **Must preserve:** the 298 test at `:894` and the 290 test above it; no file under `src/` changes (#81 acceptance criteria).
- **Do not touch:** `checks.ts:176` (pinned by `:894`, round 1 mutant 5c red).
- **Proof:** the new test passes at the tip; with `> ending)` changed to `>= ending)` at `src/set-builder/checks.ts:170` in a scratch worktree, `pnpm exec vitest run test/set-builder-stop-rules.test.ts` goes red on it (it is 79 passed under that mutant today). If the exact problem text differs at the tip, take it from `src/set-builder/checks.ts:104` and keep the `toEqual` on a one-item list.

### 4. `openMidiInput`'s fallback for a thrown value that is no Error has no test — LOW
- **Location:** `src/server/native-loaders.ts:21`
- **Attribution:** pre-existing, exposed: the branch moved the code out of `src/server/main.ts` (where no test could reach it) and tested every other branch of both loaders; the ATEM loader's matching branch has a test (`test/native-loaders.test.ts:63-69`), and this one does not. Unchanged since `0df5c11`; deferred at round 1 as the LOW tail.
- **Real-world trigger:** a native loader that rejects with a string, as the ATEM test simulates with `'dlopen failed'`. Under a mutant of `String(error)` the setup screen shows the MIDI input as unavailable with an empty reason, and `pnpm test` stays green. LOW: no user path today.

**Evidence**
```ts
return unavailableMidiInput(error instanceof Error ? error.message : String(error));
```
The three MIDI tests (`test/native-loaders.test.ts:102-134`) reject or throw only `Error` instances.

**Failure mode** — re-proved at `9066bb9` this round: with `String(error)` changed to `''` at `:21` in a scratch worktree, `pnpm exec vitest run test/native-loaders.test.ts` is 7 of 7 passed.

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
- **Proof:** the test passes at the tip; with `String(error)` replaced by `''` at `src/server/native-loaders.ts:21` in a scratch worktree, `pnpm exec vitest run test/native-loaders.test.ts` goes red on it (it is 7 passed under that mutant today).

### 5. Comment hygiene — LOW (aggregated)
- `src/server/native-loaders.ts:5-6` — "Only main.ts calls them." → "In production, only main.ts calls them." (`test/native-loaders.test.ts` calls both.)
- `src/server/native-loaders.ts:25-26` — "so the server module and every test stay clear of its native package" → "so the server module and every rig test stay clear of its native package" (`test/atem-switcher.test.ts:7` imports `atem-switcher.ts`; `src/server/atem-switcher.ts:6-7` already says "every rig test").
- `src/server/coremidi-input.ts:15` — "native-loaders.ts reports that on the setup screen." → "native-loaders.ts turns that into the unavailable input whose reason the setup screen shows."
- `test/build-set-skill-examples.test.ts:130` — test name "and no command outside a fence" → "and no line outside a fence that starts with the command" (the check at `:133` sees only lines that start `pnpm build-set`; `SKILL.md:261` and `:281` hold commands inside prose).
- `src/server/fade-out.ts:83-84` — "would otherwise set the same volumes again, on a socket that may have closed." → "would otherwise set the same volumes a second time after the close." (new this round, from round 1's investigation A: the bridge reports Live only from its socket's `message` handler and its probe timer, `src/server/live-bridge.ts:127-171`, and its `close()` stops the probe before closing the socket, `:199-203`; `server.close()` calls `fade.close()` at `src/server/server.ts:249` and `live.close()` six lines later at `:255`, so a Live lost and back in between arrives, and would be answered, on an open socket. The guard's real harm is the duplicate restore #83 pins, not a send on a closed socket. Pre-existing, exposed: the clause came in with #83's `788b42e` on this branch.)

## Needs Further Investigation
None. Round 1's A is settled as the last entry of finding 5.

## Reviewed and Dismissed
- The 298 test cannot go red (round 1 finder, provisional HIGH) — dismissed: the Intro branch's boundary is `end > start` at `src/set-builder/checks.ts:176`, and the mutant `end >= start` turns the test red (round 1 mutation 5c). Only the no-Intro branch's literal is unpinned, which is finding 3.
- The default loads in `native-loaders.ts` have no unit test — dismissed: `pnpm typecheck` checks both specifiers and their exports through `Pick<typeof import(...)>`, and round 1 executed the real ATEM default load.
- `native-loaders.ts`'s static `./atem.ts` import drags in the native package — dismissed: `atem.ts` imports only clock, connections-config, cues, playback-controller and target, and a resolve hook saw no native module.
- `if (closed) return;` in `fromLive` changes behaviour before close — dismissed: `closed` is set only in `close()` (`src/server/fade-out.ts:256`); after close the state is idle, so only `lose()`'s at-risk path changes, which is the fix.
- The bridge can deliver a Live event after its socket closes (round 1's investigation A, the strong reading) — dismissed: both event sources stop at close (`src/server/live-bridge.ts:199-203`). The guard in `fromLive` is still needed for the window between `fade.close()` and `live.close()` (`src/server/server.ts:249-255`), so do not remove it; only its comment changes (finding 5).
- The examples test's scratch folder under `dist/` races `pnpm build` — dismissed: vite empties only `dist/web` (`vite.config.ts`), and `mkdtemp` gives each run its own folder.
- The `--plan` cases could reach the real Planning Center — dismissed: a failed `startPlanningCenter` fails `beforeAll`, so no case runs, and the fake binds port 0 on 127.0.0.1.
- Port 4031 in `test/fixtures/connections/atem-and-fake.json` binds a fixed port — dismissed: config data the fake kind checks as an integer and never binds.
- #177's mutations 1 and 2 need new tests — dismissed: both go red through existing `refuseCuts()` and `failConnects()` tests (round 1 mutations 9a and 9b).
- The ramp test computes its own expectation — dismissed: 274.959946 is derived independently in its comment, and both named mutants give 274.285714.

## Minor / nits
- The examples test appends `--library`, `--template`, `--output-root`, `--pads` and, for `--plan`, `--date` after the example's own words, so an example that one day carries one of them is run with the test's value; `parseArgs` keeps the last. A fenced `pnpm build-set --list` example would get `--template`, a usage error for `--list` (`src/set-builder/main.ts:155`), and go red falsely. No example carries any of these today.
- Parser gaps in `readExamples` (`test/build-set-skill-examples.test.ts:46-60`): `~~~` fences and `$ `-prefixed command lines are skipped silently, and a 4-backtick fence holding a ``` line would toggle the fence state.
- Only `SKILL.md:224` (`--plan --pad 3`) pins a transition flag on a plan; the other three `--plan` examples carry no transition flag. That is the skill's content, not the test's.
- The listing fence's short names and keys are never checked against what `pnpm build-set --list` prints; the #82 lane filed this, and the inline commands at `SKILL.md:261` and `:281`, as proposals.
- `test/fade-out.test.ts:924` cites "story 57", which is #80's own reference ("a Stop always wins (story 57)").

## Test quality
No test file changed since round 1, so its audit stands: tests added 29 (fade-out 2, atem 1, native-loaders 7, build-set skill examples 13, set-builder overlap 1, pad 2, stop-rules 3); green against `$BASE` 21, by design, since #80, #81, #82 and #177 pin guards that were already right and the mutation matrix in `pre-pr-review-1.md` is their oracle; tautology shapes none; one absence-only assertion set (finding 2). This round re-ran the three surviving mutants (findings 2, 3 and 4) at `9066bb9`, and each still leaves its file green.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `9066bb9`; e2e green locally (44 passed).
- **Commit hygiene:** the branch is lane merges plus their commits, one subject per ticket, then round 1's review doc, its closure table, and this doc.
- **Likely reviewer asks:** why #80's and #81's new tests pass at base (the round 1 mutation table is the evidence); where the quoted-problem-lines half of the epic went (finding 1).

## Verdict
Ready to open a PR with follow-ups, and the gate has not moved since round 1. No code changed between the rounds, so the Confirmed count holds at five rather than shrinking: these are the same findings re-proved at the new HEAD, not new ones, and nothing new surfaced. Round 1's investigation resolved to one more comment entry. The epic's End state is not met until finding 1 lands: it was escalated by decision and waits as a proposal in `.epic-loop/stage2/proposals.md`, so the orchestrator decides whether it becomes its own ticket under this epic before the PR, or the End state is amended. Findings 2 to 5 are LOW and can be remediated on this branch or follow up. Prior review findings: 5 claimed, 0 fixed, 0 partially fixed, 5 open (1 escalated by decision, 4 LOW deferred), none "resolved" by a comment or doc edit.

## Remediation, 2026-10-22
Scope: CRITICAL, HIGH and MEDIUM, the `/pr-review-remediate` default; the doc carries no Remediation scope note. The only finding in scope is finding 1, and its brief carries an Escalation that says not to build it in place, so this round changes no code, as round 1's did. Findings 2 to 5 are LOW and deliberately deferred: they stay open for Nick to opt in to, or for the next round.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | skipped | not run: no code written | 0 | escalated: split ticket recommended. The quoted-problem-lines test is a new deliverable with design choices of its own, per the brief's Escalation line. Its proposal, "Check the problem lines the build-set skill quotes against the lines the code prints", is already in `.epic-loop/stage2/proposals.md` from round 1, so no second copy was added. The epic's End state is not met until it lands or the End state is amended; the decision still waits on the orchestrator. |
| 2 (LOW) | deferred | not run | 0 | open, LOW tail |
| 3 (LOW) | deferred | not run | 0 | open, LOW tail |
| 4 (LOW) | deferred | not run | 0 | open, LOW tail |
| 5 (LOW, comment hygiene) | deferred | not run | 0 | open, LOW tail |

### Known regressions, deferred
- None: this round made no code change.

### Rework briefs
- None: no fix was made, so none was reworked.

No Phase 2 verify ran, since no fix was committed, and no check was re-run: `git diff --stat 9066bb9 HEAD` shows only this doc, so the full checks this review ran at `9066bb9` stand. The Approach decisions above stand unchanged; the fourth line (finding 1 goes through its own ticket) is the one this round applied.
