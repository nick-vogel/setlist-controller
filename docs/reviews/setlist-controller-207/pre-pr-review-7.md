# Pre-PR review: setlist-controller#207 Test gaps: every guard a review left unpinned fails pnpm test when removed, round 7 (run 4, #226 and #227)

**Branch:** `setlist-controller-207-unpinned-guards` vs `origin/main` (merge-base `66a0439` "Merge pull request #228 from nick-vogel/setlist-controller-207-unpinned-guards")
**Reviewed at:** HEAD `10126b3` (setlist-controller#226 The build-set skill gives no fix for a song name that matches no folder or several, or a song that can't be read), clean tree: 0 files with uncommitted changes, 0 untracked; 2 files total against the merge-base, +30 / -4
**Delta under review:** none; a `--fresh` full review of everything since the merge-base: `cec2c1a` and `10126b3` (#226, `.claude/skills/build-set/SKILL.md`), `6dc87af` and `ff9682b` (#227, `test/start-up.test.ts`), and the merge `3f29b84`.
**Reviewed against:** setlist-controller#207 (epic body), setlist-controller#226 and #227 (bodies and acceptance criteria), the Approach decisions of `pre-pr-review-6.md`. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist, plus no em-dashes in shipped copy (none in the added SKILL.md lines).
**Date:** 2026-10-23
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| `pnpm lint` | integration worktree | clean |
| `pnpm typecheck` | integration worktree | clean |
| `pnpm test` | integration worktree | 62 files, 1334 passed, 4 skipped |
| `pnpm build` | integration worktree | built |
| `pnpm test:e2e` | not run | the diff is one skill markdown file and one vitest file; neither is in the Playwright build or its specs. The start gate ran it green at `66a0439` (44 passed) |
| #226 quotes are read and match | `pnpm exec vitest run test/build-set-skill-quotes.test.ts` | SKILL.md:60, :76, :77 each read as a quote and each lines up with its literal (library.ts:80, :81, build-set.ts:259) |
| #226 AC: reword library.ts:80 | mutation in a scratch worktree at HEAD | red, SKILL.md:76 only (reviewer and finder, two different rewordings) |
| #226: reword library.ts:81 | mutation | red, SKILL.md:77 only |
| #226 AC: reword build-set.ts:259 | mutation | red, SKILL.md:60 only |
| #226 reason strings | `node -e` on `gunzipSync` of plain text and `readFile` of a missing path | "incorrect header check" and "ENOENT: no such file or directory, open '...'", as SKILL.md:60 says |
| #226 exit code | read `src/set-builder/main.ts:243-248` | these lines come back from `buildSet` as problems with exit 1, so the exit-1 bullet is their home |
| #226 "saved by a newer Live" | read `song.ts:33-36` | a gzipped set from another Live passes `readAlsXml` and gets the `saved by <Live version>` line, so SKILL.md:60 rightly leaves it out though #226's deliverable named it |
| #227 AC: drop the default at start-up.ts:36 | mutation | red, the new test |
| #227 AC: change `DEFAULT_LATENESS_LOG` | mutation (`lateness.log`) | red, on the `launchAgent` assertion |
| #227: the option names another literal path | mutation (`/nonexistent/.../cue-lateness.log`) | red, the new test |
| #227 `launchAgent` assertion is not circular | read `lateness-log.ts:14`, `launch-agent.ts:29` | the two build the path separately, which is why the constant's mutation goes red |
| #227 nothing written under ~/Library, no production port | read the mock (`start-up.test.ts:24-27`), `lateness-log.ts:59`, the helper's flags | stand-in log queued, the real log only creates its folder on a first write, no cue points, every port flag still 0 or the fake Live's |
| `pnpm lateness` default reader | mutation of `src/lateness/main.ts:26` | survives: finding 3 |
| New SKILL.md remedies pinned | mutation cutting the three remedies | survives: finding 2 |
| Tautology audit | branch's `test/start-up.test.ts` and SKILL.md copied into a scratch worktree at `66a0439` | 118 of 118 green at base; expected, since both tickets pin behaviour that already exists, so the mutations above are the oracle and all six named ones go red |
| SKILL.md step 2 #57 exception | `foldersNamed(['Grace-Live-D-98.00bpm', 'Grace-Live-D-98.00bpm copy'], 'Grace-Live-D-98.00bpm')` run with node | `["Grace-Live-D-98.00bpm"]`: one folder, so the build does not stop as step 2 says (pre-existing, see nits) |

**Overall:** Both tickets meet their acceptance criteria: every mutation #226 and #227 name turns `pnpm test` red, and all four CI checks pass. Three LOW gaps remain: the new name-match fixes send Claude back to a listing that may be the very one that failed, none of the three new remedies is pinned by a prose check as the round 5 Approach decision asks, and the reader half of the lateness log's default path is still unpinned although the new test's name claims it. No finding blocks the PR.

## Approach decisions
- Carried from round 5 and 6: SKILL.md quotes are matched against `src/set-builder/*.ts` literals by `test/build-set-skill-quotes.test.ts`; a hole in a printed line is quoted as a placeholder; no sentence before SKILL.md:39 is reworded (setlist-controller#210 pins SKILL.md:32); a Live menu command is named only when grounded in the Live 12 manual.
- Carried from round 6: a step 6 fix that has to cover a case its line can print is pinned by a prose check on that bullet, which finds the bullet by its quote and matches the words of the remedy, not only the words that name the case. Precedent: the `per-song track-count fix` and `outside-file fix` describe blocks in `test/build-set-skill-quotes.test.ts:356-373`. Finding 2 applies it to SKILL.md:60, :76 and :77.
- New: a name-match problem is fixed from a fresh listing. The listing runs without a yes and costs nothing, and a short name it prints names its own folder alone (`src/set-builder/song-list.ts:45-52`), so a name that now matches no folder or several means the library changed after the listing, or the name did not come from it. Finding 1.
- New: a test of a default under ~/Library reads or writes there only through a stand-in: a mocked opener (`start-up.test.ts`), or `HOME` pointed at a folder under the worktree's `dist/` for a spawned command, since `os.homedir()` reads `HOME`. Finding 3.

## Confirmed Issues
### 1. The fixes for a name that matches no folder, or several, send Claude back to a listing that may be the one that failed — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:76`, `.claude/skills/build-set/SKILL.md:77`
- **Attribution:** introduced, `cec2c1a` (setlist-controller#226 ...). `git show 66a0439:.claude/skills/build-set/SKILL.md | grep -c 'matches no song folder'` prints 0.
- **Real-world trigger:** the skill builds the command from step 1's listing, and a listed short name always names its own folder alone (`song-list.ts:45-52`: "a listed short name can never build another song"). So in the skill's flow the build prints these lines when the library changes between the listing and the build, such as a song folder Nick renames, adds, or a Finder copy or sync conflict that appears while he answers step 4. LOW, capped: no reported case of the library changing mid-session. The consequence is one more failed run before Claude lists again.

**Evidence** —
```
- `"<name>" matches no song folder in <library>. The song folders are:...`: the short name is in no folder name the library holds. Nick changes the command to a short name from the listing (back to step 4), or, when the song is not among the folders the line lists, its song folder is missing from the library: Nick adds it, and the listing runs again (back to step 1).
- `"<name>" matches <n> song folders; name one more fully:...`: a longer name, one that only one of the folders the line lists holds, such as that folder's short name from the listing (back to step 4).
```
Step 4 re-runs the listing only when the date, `--output-root` or `--replace` changes (SKILL.md:14).

**Failure mode** — library holds `Grace-Live-D-98.00bpm` and the listing printed `grace` for it. Before the build, a second folder `Grace Acoustic-D-72.00bpm` appears. The build prints `"grace" matches 2 song folders; name one more fully:...`. The fix says "that folder's short name from the listing (back to step 4)": the listing Claude holds still says `grace`, so Claude shows the same command, and it fails the same way. For the no-match line after a rename, "a short name from the listing" names the old folder name the stale listing holds. Proved by reading the skill's flow, not executed against a live library.

**Recommended fix** — SKILL.md:76 and :77, the text after each quote's closing backtick and colon:
```
76: the short name is in no folder name the library holds, so the library changed after step 1's listing, or the name is not one the listing printed. When the song is among the folders the line lists, the listing runs again (back to step 1), and Nick's command takes the song's short name from it. When it is not, its song folder is missing from the library: Nick adds it, and the listing runs again (back to step 1).
77: the name is part of more than one folder name the library holds, so the library changed after step 1's listing, or the name is not one the listing printed. The listing runs again (back to step 1), and the command takes the short name it prints for the folder Nick means, which names that folder alone.
```
The quotes themselves do not change.

**Remediation brief**
- **Design intent:** step 6 gives a fix for each problem line the build prints. The listing (step 1) is the only command that runs without a yes, and it is where every short name comes from; `shortName` (`song-list.ts:53`) checks each one names its own folder alone. A name-match problem therefore means the listing Claude holds is out of date, and the fix is a fresh listing, not a pick from the old one.
- **Full surface:** `.claude/skills/build-set/SKILL.md:76`, `.claude/skills/build-set/SKILL.md:77`. The section intro at SKILL.md:75 ("is fixed on the command, or in the library") still holds and stays. Finding 2's prose check pins the wording this finding writes, so land this first.
- **Must preserve:** both quotes byte for byte (`test/build-set-skill-quotes.test.ts` "the build-set skill's quoted problem lines", SKILL.md:76 and :77 rows); the missing-folder branch of :76 (Nick adds it, back to step 1); SKILL.md:60 and every other step 6 bullet untouched; no sentence before SKILL.md:39 reworded; no em-dashes.
- **Do not touch:** SKILL.md:26 (step 2's #57 exception) is stale but pre-existing and out of #226's scope (Minor / nits); the case-only duplicate folders case (Reviewed and Dismissed).
- **Proof:** `pnpm exec vitest run test/build-set-skill-quotes.test.ts` stays green; `grep -n 'back to step 4' .claude/skills/build-set/SKILL.md | grep -E '^7[67]:'` prints nothing after the fix.

### 2. The three new fixes are pinned by their quotes only, so cutting a remedy leaves the tests green — LOW
- **Location:** `.claude/skills/build-set/SKILL.md:60`, `:76`, `:77`; `test/build-set-skill-quotes.test.ts:356-373` (where the prose checks live)
- **Attribution:** introduced, `cec2c1a`: the bullets are new. #226 scoped its test to "the #219 test reads each new quote and pins it", which it does; the gap is against the round 6 Approach decision, which the issue does not mention.
- **Real-world trigger:** a later edit to step 6 drops a remedy, such as the missing-folder branch of :76 or the re-save of :60, and Claude then has no fix for that case, with every check green. LOW, capped: a test gap with no current user path.

**Evidence** — `docs/reviews/setlist-controller-207/repro/pre-pr-review-7-mutation-match-remedies-cut.diff` deletes the remedy sentence of :60 ("Nick saves the song's set from Live 12 into that folder as `MultiTrack.als`, then builds again."), both remedies of :76, and the remedy of :77.

**Failure mode** — with that diff applied in a scratch worktree at `10126b3`, `pnpm exec vitest run test/build-set-skill-quotes.test.ts` passes 113 of 113.

**Recommended fix** — append to `test/build-set-skill-quotes.test.ts`, after finding 1's fix lands (the patterns below match finding 1's wording):
```ts
describe('the build-set skill\'s song-read fix', () => {
  it('says to save the set from Live 12 as MultiTrack.als', () => {
    const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.includes('`<folder>: the song could not be read: ...`'));
    expect(line).toMatch(/saves the song's set from Live 12 into that folder as `MultiTrack\.als`/);
  });
});

describe('the build-set skill\'s name-match fixes', () => {
  it('list again for a name that matches no folder, and add a missing folder', () => {
    const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.includes('matches no song folder in <library>'));
    expect(line).toMatch(/the listing runs again \(back to step 1\), and Nick's command takes the song's short name from it/);
    expect(line).toMatch(/song folder is missing from the library: Nick adds it/);
  });

  it('list again for a name that matches several folders', () => {
    const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.includes('matches <n> song folders; name one more fully'));
    expect(line).toMatch(/The listing runs again \(back to step 1\), and the command takes the short name it prints/);
  });
});
```

**Remediation brief**
- **Design intent:** the quotes test pins that each quoted line is one the code prints; a prose check pins that its bullet still carries the remedy for each case the line covers (round 6 Approach decision). The prose check finds the bullet by its quote, so it survives a move of the bullet.
- **Full surface:** `test/build-set-skill-quotes.test.ts` (append after line 373); the three bullets at SKILL.md:60, :76, :77 as finding 1 leaves them.
- **Must preserve:** the existing describe blocks and every quote row; `readQuotes` and `linesUp` unchanged.
- **Do not touch:** the `the build-set skill's stem reason fixes`, `per-song track-count fix` and `outside-file fix` blocks.
- **Proof:** after the fix, `git apply docs/reviews/setlist-controller-207/repro/pre-pr-review-7-mutation-match-remedies-cut.diff` in a scratch worktree at the fix's HEAD fails to apply once finding 1 rewords :76 and :77; instead delete each remedy sentence by hand there and `pnpm exec vitest run test/build-set-skill-quotes.test.ts` must go red on each new test, then remove the worktree. The test passes in the integration worktree.

### 3. The reader half of the lateness log's default is still unpinned, though the new test's name says it is checked — LOW
- **Location:** `src/lateness/main.ts:26`; `test/start-up.test.ts:149` (the test's name and its comment at :158-160)
- **Attribution:** pre-existing, untouched: `git show 66a0439:src/lateness/main.ts | grep -n DEFAULT_LATENESS_LOG` shows the same fallback, and `test/lateness-command.test.ts` passes `--log` in every run (lines 58-120). This branch's test names the reader ("where pnpm lateness reads") but asserts only the server and the launch agent.
- **Real-world trigger:** #227's own "what is wrong": a change to the fallback at `main.ts:26` makes `pnpm lateness` with no `--log` read somewhere the Sunday server does not write, with every check green, and #147's lead-time decision reads an empty log. LOW, capped: a test gap with no current user path; it sits outside #227's acceptance criteria, so it is a follow-up, not a gate.

**Evidence** —
```ts
const path = parsed.values.log === undefined ? DEFAULT_LATENESS_LOG : resolve(from, parsed.values.log);
```

**Failure mode** — `docs/reviews/setlist-controller-207/repro/pre-pr-review-7-mutation-lateness-reader-default.diff` makes the fallback `resolve(from, 'cue-lateness.log')`. With it applied in a scratch worktree at `10126b3`, `pnpm exec vitest run test/lateness-command.test.ts test/cue-lateness.test.ts test/start-up.test.ts` passes 40 of 40.

**Recommended fix** — in `test/lateness-command.test.ts`, give `run` an optional `env` and add one test that runs with no `--log` and `HOME` set to a folder under the worktree's `dist/`:
```ts
function run(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'lateness', ...args], { cwd: REPO_ROOT, env: { ...process.env, TZ: 'America/Chicago', ...env } });
```
```ts
  it('reads the log beside the launch agent\'s server.log when no --log names one', async () => {
    const home = dirname(await logPath());
    const path = join(home, 'Library', 'Logs', 'setlist-controller', 'cue-lateness.log');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, TWO_SUNDAYS);
    const { code, stdout } = await run([], { HOME: home });
    expect(code).toBe(0);
    expect(days(stdout)).not.toEqual([]);
  });
```
`TWO_SUNDAYS` (already a log's text, `test/lateness-fixture.ts:15`) and `days` (`test/lateness-command.test.ts:40`) are the ones the file already imports and defines; `writeFile`, `mkdir` and `dirname` are already imported. A sharper assertion is the day headings an existing `TWO_SUNDAYS` test expects.

**Remediation brief**
- **Design intent:** the server (no `--lateness-log`, as the launch agent starts it) writes to `DEFAULT_LATENESS_LOG`, and `pnpm lateness` (no `--log`) reads it; both import the one constant from `src/server/lateness-log.ts:14`, which is `join(homedir(), 'Library', 'Logs', 'setlist-controller', 'cue-lateness.log')` and is evaluated when the module loads, so a spawned command picks up `HOME`. #227 pinned the writer and the constant's place beside `server.log`; this pins the reader.
- **Full surface:** `test/lateness-command.test.ts:25-36` (`run`), a new test in that file; no `src/` change.
- **Must preserve:** every existing `run([...'--log', path])` call; `TZ: 'America/Chicago'`; the `afterEach` that removes `logDir`. Guardrail: nothing written outside the worktree, so `HOME` must be the `dist/lateness-*` folder `logPath` makes, never the real home.
- **Do not touch:** `test/start-up.test.ts`'s new test (it is right for the writer); `src/lateness/main.ts`.
- **Proof:** `pnpm exec vitest run test/lateness-command.test.ts` green at the fix; with `docs/reviews/setlist-controller-207/repro/pre-pr-review-7-mutation-lateness-reader-default.diff` applied in a scratch worktree at the fix's HEAD, the new test goes red.

### 4. Comment hygiene — LOW (aggregated)
- `test/start-up.test.ts:22-23` — "so the path the server opened it at is read from a spy that still opens the real log." → "so the path the server opened it at is read from a spy that opens the real log, except in the test of the default path, which queues a stand-in so nothing is written under ~/Library."

## Needs Further Investigation
None.

## Reviewed and Dismissed
- `mockImplementationOnce` at `start-up.test.ts:152` can outlive its test (`mockClear` in `afterEach` does not empty the once queue) — only when `start()` throws before `openLatenessLog` runs, which fails that test anyway, and it is the last test in the file with no shuffle or retry in `vitest.config.ts`. Not a defect; leave the `afterEach` as it is.
- SKILL.md:77 has no fix for two folders whose names differ only in letter case — only a case-sensitive volume can hold them (`library.ts:47-49`, `song-list.ts:49-50`), and macOS volumes are case-insensitive by default. No user path.
- SKILL.md:60 omits "saved by a newer Live", which #226's deliverable named — correct: such a set gets the `saved by <Live version>, not Live 12` line (`song.ts:35-36`), not "could not be read".
- The `DEFAULT_LATENESS_LOG` versus `launchAgent().StandardOutPath` assertion is circular — no: the two paths are built separately (`lateness-log.ts:14`, `launch-agent.ts:29`), and changing the constant turns it red.
- The new test writes under ~/Library or binds a production port — no: stand-in log, no cue points, every port flag 0 or the fake Live's; `launchAgent()` only builds an object.
- The could-not-be-read bullet sits under the wrong intro — no: it is a song-set problem, checked before anything is built, which SKILL.md:59 says.

## Minor / nits
- SKILL.md:60 "The reason after the colon says which: "ENOENT" ..., "incorrect header check" ..." reads as if those are the only two; a truncated gzip gives "unexpected end of file" and a folder named `MultiTrack.als` gives "EISDIR". The fix (re-save from Live 12) covers them all. "says which, such as" would read truer.
- SKILL.md:26, step 2's exception (pre-existing, untouched, from `2e906f3` before `34d7a3a` setlist-controller#57 landed): it says a whole folder name that is part of another listed folder's name "matches both, so the build stops on it". Since #57, `foldersNamed` prefers the one whole-name match (executed: `["Grace-Live-D-98.00bpm"]`), so the build does not stop. Follow-up material.

## Test quality
Tests added: 1 (`test/start-up.test.ts:149`), plus 3 quote rows read from SKILL.md. Green against `$BASE`: all of them, which is expected, since #226 and #227 pin behaviour that already exists; the oracle is mutation, and the five mutations the two issues name (plus two more) all go red. Tautology shapes found: 0. The `launchAgent` assertion is independent of the constant. Gaps: findings 2 and 3.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (1334 passed, 4 skipped) and `pnpm build` pass at `10126b3`.
- **Commit hygiene:** the branch's five commits are scoped one ticket each; this review doc and its two `repro/` diffs are the only additions.
- **Likely reviewer asks:** why the SKILL.md fixes go back to step 4 rather than a fresh listing (finding 1); whether the reader of the default log is pinned (finding 3).

## Verdict
Ready to open a PR with follow-ups. No finding is MEDIUM or higher. Findings 1 and 2 are small and in #226's own file and test, so they are cheap to fix before the PR; finding 3 is pre-existing and outside #227's criteria, and can ship as a follow-up ticket. Finding 4 is one comment.

## Remediation — 2026-10-23
Remediation scope: Nick chose, at the run 4 end report, to fix finding 1 and the step 2 nit (SKILL.md:26) in this work. Findings 2, 3 and 4 and the SKILL.md:60 nit stay open, for follow-up.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `47e337d` setlist-controller#207 pre-PR review 7 finding 1: the name-match fixes send Claude back to step 4 with a name from a listing that is out of date | red→green: `pnpm exec vitest run test/build-set-skill-quotes.test.ts` (new `the build-set skill's name-match fixes` block, red on both bullets before); `grep -n 'back to step 4' .claude/skills/build-set/SKILL.md \| grep -E '^7[67]:'` prints nothing | 0 | proved by execution |
| Nit, SKILL.md:26 | `c9c2fd9` setlist-controller#207 step 2 of the build-set skill says a whole folder name inside another's matches both, which #57 changed | red→green: same file, new `the build-set skill's whole-name match` block, which runs `foldersNamed` on step 2's own example and requires "matches that folder alone" | 0 | proved by execution |
| 2 (LOW) | — not worked | — | — | open: out of this round's scope. The finding 1 check pins the "back to step 1" remedy of :76 and :77, but not the missing-folder branch of :76 nor the re-save remedy of :60 |
| 3 (LOW) | — not worked | — | — | open: out of scope, follow-up ticket |
| 4 (LOW) | — not worked | — | — | open: out of scope |

Full checks after both commits: `pnpm lint`, `pnpm typecheck`, `pnpm test` (62 files, 1337 passed, 4 skipped), `pnpm build`, `pnpm test:e2e` (44 passed), all green.

### Known regressions, deferred
None.

### Rework briefs
None.

### Approach decisions (this round)
- A name-match problem's fix in step 6 runs the listing again (back to step 1), since a listed short name names its own folder alone; precedent: the review's own Approach decision for finding 1, and the missing-folder branch the bullet already had.
- The round 5 rule that no sentence before SKILL.md:39 is reworded gives way for SKILL.md:26 only, by Nick's choice; SKILL.md:32, which setlist-controller#210 pins, is untouched.
- A skill sentence that states what the build does is pinned by running the build's own function on the sentence's example, then matching the sentence's words (`the build-set skill's whole-name match`); precedent: the prose checks in `test/build-set-skill-quotes.test.ts`.
