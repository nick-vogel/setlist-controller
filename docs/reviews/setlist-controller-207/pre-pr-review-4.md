# Pre-PR review: setlist-controller#207 Test gaps: every guard a review left unpinned fails pnpm test when removed, round 4 (stage 2 round 1)

**Branch:** `setlist-controller-207-unpinned-guards` vs `origin/main` (merge-base `6f5280d` "Merge pull request #211 from nick-vogel/setlist-controller-58-planning-center-plan"; `origin/main` has moved since round 3's merge-base `1d7b38f`, and the branch merged it in at `1fcb7e5` "Merge remote-tracking branch 'origin/main' into setlist-controller-207-unpinned-guards")
**Reviewed at:** HEAD `18ca30d` (setlist-controller#219 No test keeps the build-set skill's quoted problem lines and --list listing in step with the code, the merge of lane commit `afced82`), clean tree: 0 files with uncommitted changes, 0 untracked; 23 files total against the merge-base, +1760 / -92, of which 4 are review records (`pre-pr-review-1.md` to `-3.md` and `repro/pre-pr-review-1-mutation-missing-template.diff`); code and tests are 19 files, +1103 / -92
**Delta under review:** none; this is a `--fresh` full review of the branch against its merge-base. It is the first review of epic-loop stage 2's run, after sub-issues #218, #219 and #220 (filed from round 3's findings 1 and 3, and from #177's start-up wiring) landed.
**Reviewed against:** the epic setlist-controller#207 (scope and End state) and its eight sub-issues: #80, #81, #82, #83 and #177 (closed), and #218, #219 and #220 (open, landed on this branch) with their acceptance criteria; the lanes' recorded assumptions and proposals for #218, #219 and #220; the lanes' own reviews (`.epic-loop/tickets/218/review-1.md`, `219/review-2.md`, `220/review-1.md`); `pre-pr-review-3.md` with its Approach decisions. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist, plus no em-dashes in shipped copy (none in the diff).
**Date:** 2026-10-23
**Reviewer:** 2 code-review agents + 1 base-oracle and mutation agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` in the worktree | exit 0 |
| `pnpm lint` | run at HEAD | exit 0 |
| `pnpm typecheck` | run at HEAD | exit 0 |
| `pnpm test` | run at HEAD | exit 0, 62 files, 1298 passed, 4 skipped |
| `pnpm build` | run at HEAD | exit 0 |
| `pnpm test:e2e` | run at HEAD (builds first, ports the OS assigns) | exit 0, 44 passed |
| `startUp` against the old `main.ts` | line by line, `git show 6f5280d:src/server/main.ts` against `src/server/start-up.ts` | same six flags, same defaults (`appSupport` is the same `~/Library/Application Support/setlist-controller`), same order of side effects, same eight log lines in order; signal handlers still in `main.ts`; `package.json` `start` and `dev:server` unchanged; e2e starts the server in-process (`e2e/rig.ts`), never through `main.ts` |
| Base oracle | the branch's new and changed test files copied onto a scratch worktree at `6f5280d`, each file run alone | `start-up.test.ts` and `native-loaders.test.ts` fail to import (new modules); the #83 close-guard test in `fade-out.test.ts` is red; every other new test is green at base, by design: #80, #81, #82, #177, #219 and #220 pin behaviour that was already right, so the mutation matrix below is their oracle |
| Mutation matrix, kept mutants | scratch worktree at `18ca30d`, each mutant applied alone and its test file run | killed: #218 AC1 (`atem` dropped from the target kinds, `start-up.ts:42`) and AC2 (`midiInput` dropped, `:51`); a default path (`pedal.json`, `connections.json`) and a log line reworded; #219 AC1 (the Ending line reworded, `checks.ts:122`) and AC2 (short-name threshold, and `.toLowerCase()` dropped, `song-list.ts:54`, `:67`); #220 (`> ending)` to `>= ending)`, `checks.ts:170`); #83 (`if (closed) return;` removed, `fade-out.ts:223`); #80 (`cancel()` leaves `reading-volumes`); #177's ATEM non-Error branch (`native-loaders.ts:37`) |
| Mutation matrix, survivors | same | `pedalConfigPath` and `latenessLog` dropped from `startServer` (finding 1); template missing, so every example stops before name matching (finding 2); pad file line reworded (finding 3); matcher's concrete-quote rule dropped (finding 4); MIDI non-Error `String(error)` to `''` (finding 5); `main.ts` handing stand-in loaders (dismissed); the Count Off line reworded with only the quotes test run (dismissed: SKILL.md quotes no Count Off line, and 7 set-builder tests hard-code it) |
| Recommended fixes | each finding's fix applied in a scratch worktree, run green, then run under its mutant | findings 1 to 5: green unmutated, red under the mutant (see each Proof) |
| Tautology audit | the agent's read of `start-up.test.ts`, `build-set-skill-quotes.test.ts`, `native-loaders.test.ts` | no tautology shape; see Test quality |
| Scratch worktrees | `git worktree remove --force --force` (Supacode auto-locks them) | all removed; `git worktree list` shows no scratch entry; `git status --porcelain` printed only this doc and its `repro/` files before the commit |
| Not run | a mutant of `oscSendPort`/`oscReceivePort` reaching `startServer`, and of their defaults | dropping either sends to or binds the production OSC ports 11000 and 11001, which the repo guardrail forbids |

**Overall:** the epic's End state is met at HEAD. Every mutation the sub-issues keep turns `pnpm test` red, the skill's commands and quoted problem lines are checked against the code by a test, and the five full checks are green. `startUp` reproduces the old `main.ts` exactly. What remains is five LOW coverage gaps in the new tests, each a mutant that survives with a verified one-to-eight-line test fix, plus a comment-hygiene batch. None blocks the PR.

## Approach decisions
- The skill-examples test runs the command by spawning `pnpm --silent build-set` from the repo root, as `test/set-builder-command.test.ts` and `test/set-builder-plan-list.test.ts:81` do, with no flag parsing factored out of `src/set-builder/main.ts` (#82 lane assumption). Fixes keep that route.
- The examples test proves name matching ran with a positive assertion on the build's own per-folder line for an empty song folder (`<folder>: the song could not be read: ...`), not only absences of problem lines (finding 2, carried from rounds 1 to 3).
- The native loaders take their dynamic import as a default parameter (`src/server/native-loaders.ts:14-15`, `:29-30`), which tests replace (#177 lane assumption). Kept.
- `startUp(args, natives)` in `src/server/start-up.ts` holds the parsing and wiring; `main.ts` keeps only the real loaders, `APP_SUPPORT` and the signal handlers (#218 lane assumption). The start-up test reads what the server took through its setup routes (`readSetup`, exported from `test/harness.ts`), as the `atem` and MIDI tests already do; finding 1's fix follows that.
- The quoted-problem-lines check matches SKILL.md quotes against `src/set-builder/*.ts` literals read with the TypeScript compiler API, in `test/build-set-skill-quotes.test.ts` (#219 lane assumption). A gap in what SKILL.md quotes is fixed by quoting the line in SKILL.md, not by loosening the matcher (finding 3).

## Prior-review closure
This is a `--fresh` review, so it rebuilt the finding list from scratch; for the audit trail, round 3's five findings stand as follows. Finding 1 (MEDIUM, quoted problem lines unchecked): fixed by #219, `c5bf683`, `c2ca677`, `afced82`; the Ending-line mutant is killed, and finding 3 below is the part it leaves open. Finding 2 (LOW, examples test absence-only): untouched, re-emitted as finding 2. Finding 3 (LOW, ring boundary): fixed by #220, `5ff711a`; the mutant is killed. Finding 4 (LOW, MIDI non-Error): untouched, re-emitted as finding 5. Finding 5 (comment hygiene): partly fixed (the `native-loaders.ts:5-6` and `coremidi-input.ts:15` entries now hold); the rest is re-emitted in finding 6. None was "resolved" by a comment or doc edit alone.

## Confirmed Issues
### 1. The start-up test pins the pedal config path and the lateness log only in the printed lines, so either can stop reaching the server with every test green — LOW
- **Location:** `src/server/start-up.ts:52` (`pedalConfigPath: values['pedal-config'],`) and `:55` (`latenessLog: { path: values['lateness-log'] },`); the tests at `test/start-up.test.ts:99-121` and `:123-129`.
- **Attribution:** introduced by `6ce4165` (setlist-controller#218 The server's start-up wiring in main.ts can be dropped with pnpm test still green); `start-up.ts` and its test are new on the branch. The lane review recorded it as F1.1 (LOW, open).
- **Real-world trigger:** a later edit to `startUp` drops or hard-codes one of the two options. With no `pedalConfigPath`, the server maps no switch and the pedal does nothing on a Sunday while the log still prints `Pedal config from ...`; with no `latenessLog`, the lateness log silently stops being written. LOW, capped: no user path at HEAD, which passes both correctly; it is the same "wiring dropped with every check green" class #218 closed for the ATEM and MIDI.

**Evidence**
```ts
    const lines = vi.mocked(console.log).mock.calls.map(([line]) => String(line));
    expect(lines).toContain(`Pedal config from ${appSupport}/pedal.json`);
    expect(lines).toContain(`Connections config from ${appSupport}/connections.json`);
```
The log lines are built from `values`, not from what `startServer` received, so the test titled "reads the pedal config ... from the settings folder" asserts only the log.

**Failure mode** — `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-4-mutation-start-up-options.diff` (deletes `:52` and `:55`) in a scratch worktree: `pnpm exec vitest run test/start-up.test.ts` is 4 of 4 passed, and the whole suite stays green (finder run). Hard-coding `pedalConfigPath: join(appSupport, 'pedal.json')` (flag ignored) is also 4 of 4.

**Recommended fix** — read the pedal status the server built, in both log tests:
```diff
     expect(adverts.map((advert) => advert.port)).toEqual(laptopAddress() === undefined ? [] : [port]);
+    expect((await readSetup<PedalStatus>(port, SETUP_PEDAL_API, 'a pedal status')).configPath).toBe(pedal);
   });
@@
-    const { appSupport } = await start();
+    const { server, appSupport } = await start();
@@
     expect(lines).toContain(`Connections config from ${appSupport}/connections.json`);
+    expect((await readSetup<PedalStatus>(server.httpPort, SETUP_PEDAL_API, 'a pedal status')).configPath).toBe(join(appSupport, 'pedal.json'));
   });
```
Checked in a scratch worktree: 4 of 4 green as written; with the repro diff applied, both tests red; with the flag hard-coded to the default, the flag test red.

**Remediation brief**
- **Design intent:** `startUp` turns the command line into `startServer`'s options; the log lines echo the parsed values. A test of the wiring has to read what the server took (its setup routes report `configPath`, `src/shared/setup.ts:46-48`), not the echo. The pedal config is read once at start (`src/server/server.ts:87`).
- **Full surface:** `test/start-up.test.ts:99-121` and `:123-129` only. `PedalStatus` and `SETUP_PEDAL_API` are already imported (`:11-12`).
- **Must preserve:** the four tests of `test/start-up.test.ts` and their exact log expectation (`:106-115`); `--lateness-log` always passed inside the test's folder by `start` (`:55`), since its default is under `~/Library` (guardrail, #218 lane assumption). No change under `src/`.
- **Declared out of this fix:** the lateness log reaching the server stays unpinned. It is observable only after a cue fires and its line is written (`src/server/lateness-log.ts:52-76`), which needs a cue run against the fake Live, as `test/cue-lateness.test.ts` does; add it only if it fits in a few lines there, otherwise leave it as follow-up. The leader and producer secrets swapped at `:56-57` are the lane's other F1.1 mutants and are likewise out of this fix.
- **Do not touch:** `main.ts`'s loaders (dismissed below); the port flags (guardrail).
- **Proof:** in a scratch worktree, `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-4-mutation-start-up-options.diff && pnpm exec vitest run test/start-up.test.ts` is 4 passed now and must be 2 failed after the fix; without the diff the file must be 4 passed.

### 2. The skill-examples test passes on a run that stops before any short name is matched — LOW
- **Location:** `test/build-set-skill-examples.test.ts:163-164`
- **Attribution:** introduced by `c8d4048` (setlist-controller#82 No test keeps the build-set skill's example commands in step with the command's flag rules). Round 3's finding 2, deferred three times as the LOW tail; unchanged by #219, which added the `--list` test beside it.
- **Real-world trigger:** a later change makes every build stop early with exit 1 (the fixture template moves, `config/stem-map.json` cannot be read, the plan read fails on fixture drift). Every example then passes without its names or flags being checked, and a broken example ships with a green suite. LOW, capped: needs a second break in the same window.

**Evidence**
```ts
      expect(result.stdout + result.stderr).not.toContain('Usage:');
      expect(result.code).not.toBe(2);
```
Every per-run check is an absence.

**Failure mode** — at `18ca30d`, `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-1-mutation-missing-template.diff` in a scratch worktree (it applies at the shifted line): every command prints only an `ENOENT` for the template, and `pnpm exec vitest run test/build-set-skill-examples.test.ts` is 14 of 14 passed.

**Recommended fix**
```diff
       expect(result.stdout + result.stderr).not.toContain('Usage:');
-      expect(result.code).not.toBe(2);
+      expect(result.code).toBe(1);
+      expect(result.stderr).toMatch(/: the song could not be read: /);
       expect(result.stderr).not.toContain('needs a song position from');
```
Checked at `18ca30d`: 14 of 14 green as written; 12 of 14 red with the repro diff (the twelve commands; the fence test and the `--list` test are unaffected).

**Remediation brief**
- **Design intent:** each example runs against a scratch library of empty folders named by the skill's listing, so a run that passed the flag rules and matched every name reaches the build, which stops with exit 1 and one `<folder>: the song could not be read: ENOENT ... MultiTrack.als` line per song. That line is the positive proof; for `--plan` it also proves the plan read finished, since the build runs only after `readWeekPlan` returns.
- **Full surface:** `test/build-set-skill-examples.test.ts:163-164` only.
- **Must preserve:** every other assertion in the loop body (`:163-173`), the fence test (`:131-135`) and the `--list` test (`:140-148`); #82's four mutants stay red (`--overlap 3` in worked example 1, `padPosition` capped at the second-to-last song, `god`, `zzz`). The fix's own failure: a rewording of the build's empty-folder line turns all twelve tests red at once, loud.
- **Do not touch:** the `--date`/path append and the parser (Minor / nits).
- **Proof:** in a scratch worktree, `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-1-mutation-missing-template.diff && pnpm exec vitest run test/build-set-skill-examples.test.ts` is 14 passed now and must be 12 failed after the fix; without the diff the file must be 14 passed.

### 3. The pad file problem line is quoted only in pieces that match seven literals, so rewording it leaves the quotes test green — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:33` (`has no E.wav`, `has no C#.wav or Db.wav`); the line it stands for is `src/set-builder/pads.ts:103`.
- **Attribution:** introduced with the check, by `c2ca677` (setlist-controller#219 review pass 1 finding 1: the quote reader dropped quoted pieces of problem lines that end in neither . nor :), which made these pieces fragments; SKILL.md:33 itself is unchanged against `6f5280d`. The lane review deferred it as F2.1 (MEDIUM, "deferred"), with the proposal "The build-set skill gives no fix for the overlap, track-count and song problem lines the build prints" in `.epic-loop/tickets/219/proposals.md`.
- **Real-world trigger:** a later change rewords the pad file line in `pads.ts`. Step 6 still describes it by `has no E.wav`, and Claude, running the skill, has to recognise the new wording on its own, with every check green. LOW, capped (docs drift): no wrong set is built, the printed line still names the file, and the skill says to show each problem as printed.

**Evidence** — the fragment rule lets a hole take written-out text in a concrete piece (`test/build-set-skill-quotes.test.ts:87`), so `has no E.wav` lines up with `has no ${...}` in `checks.ts:67`, `:205`, `pads.ts:103`, `plan-folders.ts:42`, `plan-reader.ts:56`, `:224` and `song.ts:166` (finder dump).

**Failure mode** — `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-4-mutation-pad-file-line.diff` (`has no ${names.join` to `lacks ${names.join` at `pads.ts:103`) in a scratch worktree: `pnpm exec vitest run test/build-set-skill-quotes.test.ts` is 80 of 80 passed.

**Recommended fix** — quote the whole line once in SKILL.md, keeping the pieces as the examples of names:
```diff
-     - Nick adds the file the problem names. It lists every name the build looked for (`has no E.wav`, `has no C#.wav or Db.wav`), and any one of them fixes it.
+     - Nick adds the file the problem names. The line reads `The pad after song <n> is in <key>, ... the pads folder <folder> has no <names>. ...` and lists every name the build looked for (`has no E.wav`, `has no C#.wav or Db.wav`), and any one of them fixes it.
```
Checked in a scratch worktree: the quotes file is 81 of 81 green with it; with the repro diff, the new `SKILL.md:33 The pad after song <n> is in <key>, ...` test is red.

**Remediation brief**
- **Design intent:** SKILL.md is the operator contract Claude follows to turn a printed problem line into its fix; the quotes test pins each quote to a literal the code can print. A quote with placeholders is pinned to its own literal; a concrete piece such as `has no E.wav` is not, because its written values let a hole soak up text. A line is pinned by quoting it whole with placeholders.
- **Full surface:** `.claude/skills/build-set/SKILL.md:33` only. No test or `src/` change.
- **Must preserve:** the 80 tests of `test/build-set-skill-quotes.test.ts`; the matcher (`linesUp`, `:67-93`) and reader (`readQuotes`, `:165-210`) unchanged; SKILL.md:33's two example pieces and its meaning. The line stays one line (no hard wrap).
- **Do not touch:** the matcher's concrete-quote rule (finding 4 adds a guard for it, not a change); the listing fields `the default`, `from the plan` and `Warning:` at `SKILL.md:54` (Minor / nits, and the example 8 proposal).
- **Proof:** in a scratch worktree with the fix, `pnpm exec vitest run test/build-set-skill-quotes.test.ts` is 81 passed; then `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-4-mutation-pad-file-line.diff` and the same command must be 1 failed (it is 80 passed today).

### 4. No matcher unit case guards the concrete-quote rule, so dropping it leaves every quotes test green — LOW
- **Location:** `test/build-set-skill-quotes.test.ts:87` (`else row[j] = concrete && (at(i + 1, j + 1) || at(i, j + 1));`); the fixed cases at `:218-252`.
- **Attribution:** introduced by `c5bf683` (setlist-controller#219 No test keeps the build-set skill's quoted problem lines and --list listing in step with the code). The lane review recorded it as F2.5 (LOW, open).
- **Real-world trigger:** a later edit to the matcher drops the rule, and a quote with a placeholder then lines up with a literal whose hole takes a written value, which is how a reworded line stays green (the lane's prototype found `<folder> already exists. ...` matching 7 literals without it). LOW: guards test code; no user path.

**Evidence** — `git log -S'concrete && ('` names `c5bf683` and `c2ca677`; no case in `:218-252` has a placeholder quote against a literal whose hole sits where the quote writes a value.

**Failure mode** — `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-4-mutation-concrete-rule.diff` in a scratch worktree: `pnpm exec vitest run test/build-set-skill-quotes.test.ts` is 80 of 80 passed.

**Recommended fix** — one case at the top of the `cases` list at `:218`:
```diff
   const cases: { quote: string; literal: string; matches: boolean }[] = [
+    { quote: 'The pad after song 2 plays <file>.', literal: 'The pad after song ${position} plays ${file.name}.', matches: false },
```
Checked: 81 of 81 green; with the repro diff, that case red (1 failed, 80 passed).

**Remediation brief**
- **Design intent:** a `<placeholder>` marks a quote as written with holes, so its other characters are fixed text and a code hole may not take them; only a concrete quote (no placeholder, no `...`) may write a value where the code has a hole (`:60-63` comment).
- **Full surface:** `test/build-set-skill-quotes.test.ts:218` only.
- **Must preserve:** every existing case in both tables (`:218-252`, `:254-...`) and the 56 SKILL.md quote tests.
- **Do not touch:** `linesUp` itself.
- **Proof:** with the fix, `pnpm exec vitest run test/build-set-skill-quotes.test.ts` is 81 passed; in a scratch worktree with `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-4-mutation-concrete-rule.diff` it must be 1 failed (80 passed today).

### 5. `openMidiInput`'s fallback for a thrown value that is no Error has no test — LOW
- **Location:** `src/server/native-loaders.ts:22`
- **Attribution:** pre-existing, exposed: `d7349af` (setlist-controller#177) moved the code out of `main.ts`, where no test reached it, and tested every other branch of both loaders; the ATEM's matching branch has a test (`test/native-loaders.test.ts:63-69`). Round 3's finding 4, deferred as the LOW tail.
- **Real-world trigger:** a native loader that rejects with a string. Under a mutant of `String(error)` the setup screen shows the MIDI input as unavailable with an empty reason. LOW: no user path today.

**Evidence**
```ts
    return unavailableMidiInput(error instanceof Error ? error.message : String(error));
```

**Failure mode** — `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-4-mutation-midi-non-error.diff` in a scratch worktree: `pnpm exec vitest run test/native-loaders.test.ts` is 7 of 7 passed.

**Recommended fix** — before `it('is the CoreMIDI input itself when it starts'` at `:126`:
```ts
  it('is unavailable, with the reason as it was thrown, when the load fails with no Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const input = await openMidiInput(() => Promise.reject('dlopen failed'));

    expect(input.state).toEqual({ kind: 'unavailable', message: 'dlopen failed' });
  });
```
Checked: 8 of 8 green; with the repro diff, the new test red.

**Remediation brief**
- **Design intent:** a laptop whose MIDI cannot be opened still runs the server; the setup screen shows the reason as thrown. Both loaders treat a non-Error the same way, and the ATEM's test at `:63-69` is the precedent.
- **Full surface:** `test/native-loaders.test.ts`, inside `describe('the MIDI input')` (`:102`).
- **Must preserve:** the three existing MIDI tests; `afterEach`'s `vi.restoreAllMocks()`.
- **Do not touch:** `src/server/native-loaders.ts`.
- **Proof:** `pnpm exec vitest run test/native-loaders.test.ts` is 8 passed with the fix; in a scratch worktree with `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-4-mutation-midi-non-error.diff` it must be 1 failed (7 passed today).

### 6. Comment hygiene — LOW (aggregated)
- `src/server/native-loaders.ts:26-28` — "so the server module and every test stay clear of its native package" → "so the server module and every rig test stay clear of its native package" (`test/atem-switcher.test.ts:7` imports `atem-switcher.ts`; `src/server/atem-switcher.ts:6-7` already says "every rig test").
- `src/server/start-up.ts:24` — "Starts the server as main.ts does, from the command line's arguments" → "Starts the server from the command line's arguments, for main.ts" (`main.ts` no longer starts it itself).
- `src/server/start-up.ts:13-15` — "so it loads neither native package, writes nothing under ~/Library and never runs dns-sd" → "so it loads neither native package and never runs dns-sd; it writes nothing under ~/Library when it also names --lateness-log" (the lateness log default, `src/server/lateness-log.ts:14`, is under `~/Library/Logs` and is not in `Natives`).
- `src/server/fade-out.ts:83-84` — "would otherwise set the same volumes again, on a socket that may have closed." → "would otherwise set the same volumes a second time after the close." (`server.close()` calls `fade.close()` before `live.close()`, `src/server/server.ts:247-255`, and the bridge reports Live only while its socket is open, `src/server/live-bridge.ts:199-203`; the guard's harm is the duplicate restore #83 pins. Introduced by `788b42e`.)
- `test/build-set-skill-quotes.test.ts:6-8` — "Steps step 6 and plan step 2 ..., and its worked examples, quote the problem lines" → "SKILL.md quotes the problem lines the build prints, mostly in Steps step 6, plan step 2 and its worked examples" (`readQuotes`, `:165-210`, reads every code span in the file).
- `test/build-set-skill-examples.test.ts:131` — test name "and no command outside a fence" → "and no line outside a fence that starts with the command" (the check sees only lines that start `pnpm build-set`).

## Needs Further Investigation
None.

## Reviewed and Dismissed
- `main.ts` could hand `startUp` stand-in loaders with every check green (lane F1.2; mutant M4 survives the whole suite) — dismissed as a defect: `main.ts` is now 20 lines of entry point whose only job is to pass the real loaders, and testing it means loading both native packages, which the loaders exist to keep out of tests. `pnpm typecheck` pins the loader signatures.
- The lateness-log and OSC port defaults are unpinned (mutant M3c) — dismissed: deliberate under the guardrails (#218 lane assumption: the lateness default is under `~/Library`; the port defaults are 11000 and 11001).
- Rewording the Count Off line (`checks.ts:104`) leaves the quotes test green (lane F2.2) — dismissed for the quotes test: SKILL.md quotes no Count Off line, so the test has nothing to compare, and 7 tests in `set-builder-stop-rules`, `-pad` and `-overlap` hard-code the line and go red. Giving the skill a fix for that line is the existing proposal in `.epic-loop/tickets/219/proposals.md`.
- `startUp` drifts from the old `main.ts` — dismissed: same flags, defaults, side-effect order and log lines (line-by-line read); a bad argument still rejects before anything starts, now through `main.ts`'s top-level await.
- The `if (closed) return;` guard in `fromLive` changes behaviour before close — dismissed (round 3): `closed` is set only in `close()`.
- Exporting `readSetup` from `test/harness.ts` breaks a caller — dismissed: one new caller, `start-up.test.ts`.
- One full `vitest run` during the finder's mutation had 6 set-builder subprocess failures — dismissed: two reviewer agents were running vitest at once; the orchestrator's full run at HEAD was green, and the audit agent saw no flake in its re-runs.
- `test/fixtures/connections/atem-and-fake.json` port 4031 — dismissed (round 3): config data, never bound.
- The `--plan` cases could reach the real Planning Center — dismissed (round 3): a failed fake start fails `beforeAll`, and the fake binds port 0 on 127.0.0.1.

## Minor / nits
- Three SKILL.md quote tests check nothing: `the default` and `from the plan` (`SKILL.md:54`) line up with unrelated literals (`checks.ts:133`, `:203`, `main.ts:21`, `:180`, `:217`), and `Warning:` matches any line that starts with it; rewording `plan-list.ts:82-83` or `plan-warnings.ts:30-33` stays 80 of 80. These are listing fields, not problem lines; the proposal "No test keeps worked example 8's --plan --list output in step with the code" (`.epic-loop/tickets/219/proposals.md`) is where they get a real check.
- Plan-listing pieces in inline spans (`Prayer: a pad after song 2`, `Message: no effect`, the `3. Fall Like Rain  E  ...` song line, `no key`) are skipped by `readQuotes`, by its field filter; same proposal.
- Only a non-empty check guards the quote count (`test/build-set-skill-quotes.test.ts:329-332`); a reworded `Date: ` line in SKILL.md would drop the plain printed lines of three worked examples without a red.
- `test/start-up.test.ts:120` computes the advert expectation from `laptopAddress()`, so on a host with no IPv4 address it is `[]` against `[]`; CI's ubuntu runner has one (lane assumption).
- The examples test appends `--library`, `--template`, `--output-root`, `--pads` and, for `--plan`, `--date` after the example's own words; `parseArgs` keeps the last (round 3).
- Parser gaps in `readExamples`: `~~~` fences and `$ `-prefixed command lines are skipped silently (round 3).
- `test/fade-out.test.ts` cites "story 57", #80's own reference (round 3).
- The lane's style findings for #218 (F1.4 to F1.9), #219 (F2.6 to F2.16) and #220 (F1.1, a fifth inline copy of the BGVS edit) stand as recorded in `.epic-loop/tickets/*/review-*.md`; none is a defect.

## Test quality
Tests added: 115 across 11 files (fade-out 2, atem 1, native-loaders 7, start-up 4, build-set skill examples 14, build-set skill quotes 80 including the matcher's unit cases, overlap 1, pad 2, stop-rules 4). Red at `$BASE`: the 11 in `start-up.test.ts` and `native-loaders.test.ts` (import) and the #83 close-guard test. Green at `$BASE`: the rest, by design, since #80, #81, #82, #177, #219 and #220 pin behaviour that was already right; the mutation matrix is their oracle, and every mutant the sub-issues keep is killed. Tautology shapes: none (the units are real; only the native loads, the console and dns-sd are stood in). Weak assertions: the absence-only example runs (finding 2), the log-only start-up wiring (finding 1), the pad pieces and the listing fields in the quotes test (finding 3, Minor / nits), and the unguarded concrete rule (finding 4). Strengthen; delete none.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `18ca30d`; e2e green locally (44 passed).
- **Commit hygiene:** lane merges plus their commits, one subject per ticket; rounds 1 to 3's review docs and closure tables; this doc and its four `repro/` diffs.
- **Likely reviewer asks:** why most new tests pass at base (the mutation matrix here and in `pre-pr-review-1.md`); why `main.ts` itself is untested (dismissed above); whether #218, #219 and #220 close with the PR (they are open on GitHub and landed here).

## Verdict
Ready to open a PR with follow-ups. The epic's End state is met: every kept mutation turns `pnpm test` red, the skill's commands and quoted problem lines are checked by a test, and all five full checks pass. Nothing gates the PR. Findings 1 to 5 are LOW coverage gaps in the new tests, each with a fix verified red-then-green in a scratch worktree; they can be remediated on this branch by opting in, or follow up. Finding 6 is comment hygiene. Prior review findings (round 3): 5 claimed, 2 fixed (by #219 and #220), 1 partly fixed (comment hygiene), 2 open and re-emitted (findings 2 and 5), none "resolved" by a comment or doc edit.
