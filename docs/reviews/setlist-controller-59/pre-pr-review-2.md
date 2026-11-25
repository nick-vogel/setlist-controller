# Pre-PR review: setlist-controller#59 Song transitions: overlap into the next count-off, a prayer pad, and fades

**Branch:** `setlist-controller-59-song-transitions` vs `origin/setlist-controller-32-set-builder` (merge-base `e4aa4e6` "setlist-controller#32 pre-PR review 2")
**Reviewed at:** HEAD `0a5af38` (setlist-controller#59 pre-PR review 1 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 50 files total, +5322 / -174 against the merge-base
**Delta under review:** since `95462f3` (setlist-controller#69 Pad fades: fade in, and fade out under the next count-off), the HEAD that `pre-pr-review-1.md` reviewed: 22 files, +1170 / -64, of which 8 source files (`src/server/fade-out.ts`, `src/set-builder/build-set.ts`, `checks.ts`, `main.ts`, `pads.ts`, `song.ts`, `timeline.ts`, `write-set.ts`), 8 test files, and review 1's doc and five repro files
**Reviewed against:** `pre-pr-review-1.md`: its nine findings' intents and briefs, its Approach decisions, its remediation closure table, Known regressions deferred and Rework briefs; the epic body of setlist-controller#59 for the one-pass rule, the usage-error rule and stories 53 to 58. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 2, delta-scoped.
**Date:** 2026-10-17
**Reviewer:** 2 code-review agents + 1 test-audit agent + 1 differential-harness agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date; lockfile unchanged since the merge-base |
| Lint | `pnpm lint` | pass, the review 2 repros under `repro/` included (`eslint .` lints `docs/`) |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | 28 files, 498 passed, 2 skipped (the two `it.runIf(linux)` cases in `test/setup-screen.test.ts`, unchanged) |
| Build and Playwright | `pnpm test:e2e` (runs `pnpm build` first) | build ok; 8 passed (webkit-ipad), `e2e/fade-out.spec.ts` included |
| The remediation changes nothing it was not meant to (gap, overlap and pad builds) | differential harness: `buildSet` at `95462f3` (scratch worktree) and at HEAD imported by absolute path, identical inputs from HEAD's fixture library on both templates, BuildResult, every written file (path, size, sha256) and each gunzipped `.als` compared with only the output-root prefix normalised | **3295 of 3295 identical** (1711 built, 1582 stopped with the same problem list, 2 threw the same error): gap-only builds of every order of 1 to 4 fixture songs, explicit gaps, repeated songs, overlap pairs and chains of 2 and 3, pads between songs and after the last with 30-second pads, default keys, `=<key>` overrides and enharmonic twin files, pad chains, and mixed 3- and 4-song chains of overlaps and pads; plus 7 edge cases (BGVS on 300, a next song with no starting tempo, overlaps and pads from a song with no Count Off). 14 of 14 controls differ as they should: 1-second and 2.499-second pads now stop, `a.wav`, `D.WAV` and `db.wav` now resolve, an overlap or a pad into a song with no Count Off now reports instead of throwing, BGVS on 316 now builds. Harness kept in the session scratchpad, not in `repro/`, since it proves no finding |
| Slot check against placement (finding 5's intent) | finder B, scratch worktree: Goodness of God's BGVS clip moved from 296 to 317.5 in 0.5 steps into Trust In God; each start built once with the slot check and once with it skipped, placement's "has no free track" throw as the ground truth | 44 of 44 rows agree; the boundary sits between 308 and 308.5 (predicted 308.22). `silence` in `cutOrRing` is the previous song's Ending plus `silenceAfter`, the same number the check compares with, under the same strict `<`; `nextTempo` is the same expression; `PlacedSong.meter` is `meterOf(song)`, so `silenceAfter` changes nothing for placement |
| No check throws on a song with no starting tempo or meter (findings 3 and 5 rework) | finder B, executed: an overlap from and into such a song beside a name that matches no song; `hasStartingValues` read against `mainEvents`' throw condition | returns the problem list, no throw; `hasStartingValues` and `mainEvents` agree for an empty list, no event at or before 0, and an event with no Value |
| `--pad` positions (finding 2) | finder A traced `''`, `=`, `1=`, `01`, ` 1`, `1 `, `+1`, `1e0`, `99999999999999999999`, `0=G`, `9=H` through `padPosition` and `padValue` | each a usage error as intended; `1=` reaches the key message; `01` is accepted as 1, as `overlapPosition` does |
| Close, the read deadline, stale replies (findings 1 and 4) | finder A, scratch worktree, `startFadeOut` driven directly | restore once from `stepping` and `lost`, nothing from the reading states, no step after close, no fade after close; a stale `track-data` after a re-read is used in place of the fresh one (Minor) |
| Tautology audit, oracle `95462f3` | HEAD's eight changed test files copied into a scratch worktree at `95462f3` and run | 54 tests added or changed: 23 red, 31 green (see Test quality); none failed to import |
| Mutations of the round 1 claims | test-audit agent, scratch worktree at HEAD: `review-1-mutation-overlap-as-gap.diff`, `review-1-mutation-last-song-meter.diff`, deleting `write-set.ts:215`, the PAD-clip guards, every `readWavHeader` throw, the no-key folder problem, the end-toggle tolerance both ways, the fade's reply guard, the contract warning, and five fade mutations (`READ_TIMEOUT_MS = 0`, `>=`, `since` reset, no `closed` check, no restore in close) | red, each in the test that claims it, except the four listed under findings 1 and 2 |
| Finding 1 proof | `repro/review-2-fade-unpinned-lines.test.ts` plus three mutation diffs, scratch worktree at HEAD | `test/fade-out.test.ts` stays 23 of 23 green under each mutation; the repro goes red under each |
| Finding 2 proof | `repro/review-2-builder-unpinned-rules.test.ts` plus four mutation diffs, scratch worktree at HEAD | the set-builder suites (`set-builder-overlap`, `-stop-rules`, `-pad`, `-command`, `set-builder.test.ts`) stay 239 of 239 green under each of the first three mutations, and `test/set-builder-pad.test.ts` 73 of 73 under the fourth; the repro goes red under each of the first three |
| Live, launchd, the acceptance run | not run | the repo guardrails forbid opening or controlling Live; #71 is Nick's run by ear and on the iPad |

**Overall:** The round 1 remediation holds. All nine findings are fixed in behaviour, both MEDIUMs included, the full checks are green, and the differential harness shows the fixes change nothing else that `buildSet` writes. This round confirms no defect in the product: two LOW findings are tests that stay green when a rule the remediation added is removed, and one LOW is a stale comment. The PR can open; the three findings are cheap, test-only and comment-only, and suit the loop's own remediation or a follow-up.

## Approach decisions
Round 1's Approach decisions (`pre-pr-review-1.md`, `## Approach decisions`) stand unchanged and govern any further work on the fade, the `--pad` positions, the short-pad check, the read deadline, the Intro check, the ring rule, the starting-values guard and pad file names. This round adds:
- **Unpinned rules (findings 1 and 2):** test-only. One test per rule, in the describe block that already holds that rule's tests, each red under its mutation diff in `repro/` and green at HEAD. No source change, and no existing assertion is weakened or removed.
- **The comment on `PadFile.key` (finding 3):** the comment follows the code. The field stays the file name less its extension, which `write-set.ts:127` writes as the clip's Name (round 1's decision on pad file names); the summary's key comes from `Pad.key`, not from it.

## Prior-review closure
Nine of nine prior findings are fixed in behaviour. Zero are untouched, and none was "resolved" only by editing a comment or a doc.
- **1 (MEDIUM), fully fixed.** `close()` restores from `stepping` and `lost`, sends nothing from the reading states, sends no step after close, and refuses a later press. The test of one line in it (`state = { kind: 'idle' }`) is missing: finding 1 below. The known regression round 1 deferred (a second, identical restore after close on a lost-then-regained connection) is still present and no worse than described; finder A found the window bounded by the MIDI input and hub close time.
- **2 (MEDIUM), fully fixed.** Every out-of-range or non-digit `--pad` position exits 2 with the usage message before `buildSet` runs.
- **3 (LOW), fixed.** The rule its brief's Must preserve named, "a pad whose holder could not be read gets no new problem", has no test: finding 2c.
- **4 (LOW), fixed.** Two rules of the deadline have no test (where it counts from, and its reset by a re-read press): finding 1b and 1c.
- **5 (LOW), fixed.** The proof its brief prescribed (BGVS on 316) cannot tell the ring conversion from the raw start: finding 2a.
- **6 (LOW), fixed.** The rule its brief's Must preserve named, "a pad after the last song needs no Intro", has no test: finding 2b.
- **7 and 8 (LOW), fully fixed**, each strengthened test red under its mutation.
- **9 (LOW), partly fixed.** All five paths it named have tests that go red when the path is removed, except one half of `wav.ts:45`: a block align of 0 is untested (finding 2d).
- **Findings 3 and 5 rework, finding 1 rework, finding 4 rework:** each meets its rework brief.

## Confirmed Issues

### 1. Three lines of the fade's round 1 fix can be removed with every fade test still green — LOW
- **Location:** `src/server/fade-out.ts:169` (`state = { kind: 'idle' };` in `close`), `:152` (`since: state.since` in the move to `reading-volumes`), `:131` (`since: clock.now()` on every press that starts a read, stale re-reads included); the tests that should pin them, `test/fade-out.test.ts:540`, `:554` and `:567`
- **Attribution:** introduced by the round 1 remediation: `:169` in `60f9c5b` (finding 1), `:131` and `:152` in `96c0e59` (finding 4). `git show 95462f3:src/server/fade-out.ts` has `close: () => stopStepping()` and no `since`.
- **Real-world trigger:** none in the product today; each is a claim of coverage the tests do not have. A later change that drops one of these lines ships with a green suite: the first would let a late volume reply start stepping onto a bridge that is about to close (the exact throw round 1's finding 1 guarded against), the other two would move the read deadline by up to the time a track list takes to arrive.

**Evidence**
```ts
    close: () => {
      closed = true;
      stopStepping();
      if (state.kind === 'stepping' || state.kind === 'lost') restore(state);
      state = { kind: 'idle' };
    },
```

**Failure mode** — executed in a scratch worktree at HEAD, each mutation diff applied alone, `pnpm exec vitest run test/fade-out.test.ts test/review-2-fade-unpinned-lines.test.ts`:
- `repro/review-2-mutation-close-keeps-state.diff` (deletes `:169`): `test/fade-out.test.ts` 23 of 23 green. The repro goes red twice: a volume reply after a close while reading starts a full fade (`expected [ 'track_data', 'get 0', …(124) ] to deeply equal [ 'track_data', 'get 0', 'get 1' ]`), and Live stopping after a close mid-fade sends a second restore (`expected [ 'set 0 0.5' ] to deeply equal []`). The test at `:540` closes while reading but never delivers the outstanding reply after the close.
- `repro/review-2-mutation-since-reset-on-track-list.diff` (`:152` takes `clock.now()`): 23 of 23 green. Every deadline test delivers the track list at the moment of the press, so a deadline counted from the press and one counted from the reply cannot be told apart.
- `repro/review-2-mutation-repress-keeps-since.diff` (a stale re-press keeps the old `since`): 23 of 23 green. "sets no volume and stops nothing while Live never answers a read" spaces its presses 2000 ms apart, so each press is stale either way; under the mutation a press 100 ms after a re-read press sends a third `track_data`.

**Recommended fix** — in `test/fade-out.test.ts`, in `describe('the fade out on its own')`:
```diff
   it('sends nothing when the server closes while the fade still reads', () => {
     const { clock, sent, fade } = fadeAlone();
     fade.fadeOut();
     fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, grouped: false }, { track: 1, grouped: false }] });
     fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
 
     fade.close();
+    fade.fromLive({ kind: 'track-volume', track: 1, volume: 0.25 });
     clock.advance(6000);
 
     expect(sent).toEqual(['track_data', 'get 0', 'get 1']);
   });
```
and, after the test at `:567` (so `TWO_TRACKS` is in scope):
```ts
  it('sends nothing more when Live stops, or the leader stops, after the server closed mid-fade', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    fade.fromLive({ kind: 'track-data', tracks: [{ track: 0, grouped: false }] });
    fade.fromLive({ kind: 'track-volume', track: 0, volume: 0.5 });
    clock.advance(1000);
    fade.close();
    sent.length = 0;

    fade.fromLive({ kind: 'playing', playing: false });
    fade.cancel();

    expect(sent).toEqual([]);
  });

  it('counts the read deadline from the press, not from the track list reply', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    clock.advance(600);
    fade.fromLive(TWO_TRACKS);
    clock.advance(401);
    fade.fadeOut();

    expect(sent).toEqual(['track_data', 'get 0', 'get 1', 'track_data']);
  });

  it('counts the deadline again from a press that reads the tracks again', () => {
    const { clock, sent, fade } = fadeAlone();
    fade.fadeOut();
    clock.advance(1500);
    fade.fadeOut();
    clock.advance(100);
    fade.fadeOut();

    expect(sent).toEqual(['track_data', 'track_data']);
  });
```

**Remediation brief**
- **Design intent:** the fade holds the pre-fade volumes only in memory, in `stepping` and `lost`; every way a fade ends sets them back once. `close()` is the server's last word: it restores from `stepping` or `lost`, returns to `idle` so no reply or stop that arrives before the bridge closes can start a fade or restore again, and refuses later presses (`closed`). A read that has not finished more than `READ_TIMEOUT_MS` after the press that started it is abandoned on the next press, counted from that press (`since`, carried from `reading-tracks` into `reading-volumes`), and every press that starts a read starts its own deadline. No timer.
- **Full surface:** `test/fade-out.test.ts:540-550` (one added line) and three new tests after `:583`; no source change. The rules they pin: `src/server/fade-out.ts:169`, `:152`, `:131`.
- **Must preserve:** every existing test in `test/fade-out.test.ts` and `e2e/fade-out.spec.ts`, unchanged; `fade-out.ts` unchanged.
- **Do not touch:** the stale `track-data` adopted after a re-read (Minor / nits) and the second restore after close (round 1's known regression, deferred); neither is in scope for a test-only fix.
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-59/repro/review-2-fade-unpinned-lines.test.ts test/`, then for each of `close-keeps-state`, `since-reset-on-track-list` and `repress-keeps-since`: `git apply docs/reviews/setlist-controller-59/repro/review-2-mutation-<name>.diff && pnpm exec vitest run test/fade-out.test.ts test/review-2-fade-unpinned-lines.test.ts; git apply -R docs/reviews/setlist-controller-59/repro/review-2-mutation-<name>.diff`. Now `test/fade-out.test.ts` stays green under each and only the repro goes red; after the fix `test/fade-out.test.ts` goes red under each. Then `rm test/review-2-fade-unpinned-lines.test.ts` and `pnpm exec vitest run test/fade-out.test.ts` green at HEAD.

### 2. Four rules the round 1 fixes added to the set builder can be removed with every set-builder test still green — LOW
- **Location:** (a) `src/set-builder/checks.ts:97-98`, the ring conversion in `slotProblems`, against `test/set-builder-stop-rules.test.ts:584` and `:608`; (b) `checks.ts:68-74`, `introProblems` leaving the transition after the last song unchecked; (c) `checks.ts:82`, the `!holder` skip in `shortPadProblems`; (d) `src/set-builder/wav.ts:45`, the `format.blockAlign === 0` half, against `test/set-builder-pad.test.ts:742-760`
- **Attribution:** (a) introduced by `bd4770c` (finding 5), whose brief prescribed the 316 case that cannot see the conversion; (b) `0386df2` (finding 6), whose brief listed the rule under Must preserve; (c) `a51b16d` (finding 3), whose brief listed the rule under Must preserve; (d) the throw is pre-existing from `df291e7` (setlist-controller#66), and `bd1e74d` (finding 9) tested only its sample-rate half.
- **Real-world trigger:** none in the product today; each is a claim of coverage the tests do not have. Removed, (a) brings back finding 5's false stop for a stem clip that starts between the Ending and the silence point, (b) stops a ministry-time pad after a last song with no section after its Count Off, (c) turns a one-pass problem list into a thrown `TypeError`, and (d) lets a WAV with a block align of 0 read as `Infinity` frames.

**Evidence**
```ts
  const ringsBeforeSilence = (start: number) =>
    intro === undefined || ringingBeat(song, ending, Number(valueOf(mainEvents(next, 'Tempo').start)), start) < ending + silenceAfter(next, intro);
```
```ts
    if (!holder || !hasStartingValues(holder) || padBars(holder, seconds) >= 1) return [];
```

**Failure mode** — executed in a scratch worktree at HEAD, each mutation diff applied alone:
- (a) `repro/review-2-mutation-ring-raw-start.diff` (compare the raw `start`): the five set-builder suites stay 239 of 239 green. BGVS on 300 rings under either rule and BGVS on 316 is dropped under either; on 309 the real rule drops it (it starts ringing at about 310.9, past the silence point at 310) and the raw rule counts it. Finder B's 44-row matrix diverged at 308.5, 309 and 309.5 under this mutation: the check reports "needs 5 VOX tracks" while placement builds.
- (b) `repro/review-2-mutation-pad-after-last-needs-intro.diff`: 239 of 239 green; the repro's "a pad after the last song, which has no section after its Count Off, builds" goes red with the Count Off problem.
- (c) `repro/review-2-mutation-no-holder-guard.diff`: 239 of 239 green; the repro's own-key 1-second pad into `zzz` throws `TypeError: Cannot read properties of undefined (reading 'tempo')` instead of returning the `"zzz" matches no song folder` problem.
- (d) `repro/review-2-mutation-wav-block-align.diff`: `test/set-builder-pad.test.ts` 73 of 73 green; the test file's `fmt` helper always writes a block align of 2.

**Recommended fix**
- (a) `test/set-builder-stop-rules.test.ts`, beside `:584`:
```ts
  it("does not count a stem whose clip starts after the Ending and before the silence point but starts ringing after it, so the pair builds", async () => {
    const workspace = await createWorkspace();
    await moveBgvsTo(workspace, 309);

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: [GOODNESS, TRUST],
      transitions: { 1: OVERLAP },
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    expect(result.ok ? 'ok' : result.problems).toBe('ok');
  });
```
- (b) and (c) `test/set-builder-pad.test.ts`: (b) in `describe('a pad into a song with no Count Off')` (`:458`), a build of `[GRACE, GOODNESS]` with `{ 2: PAD }`, `addPadTrack`, `addPad(workspace, 'A', 30)` and `removeLocator(workspace, GOODNESS, 'Count Off')`, expecting `ok: true`; (c) in `describe('a pad the build cannot make')` (`:175`), a build of `[GRACE, 'zzz']` with `{ 1: { type: 'pad', key: 'A' } }`, `addPadTrack` and `addPad(workspace, 'A', 1)`, expecting `ok: false`, exactly one problem, and that problem starting `"zzz" matches no song folder` (no throw, and no short-pad problem). `repro/review-2-builder-unpinned-rules.test.ts` holds both builds.
- (d) `test/set-builder-pad.test.ts:742-760`:
```diff
-  const fmt = (sampleRate: number) => {
+  const fmt = (sampleRate: number, blockAlign = 2) => {
     const body = Buffer.alloc(16);
     body.writeUInt16LE(1, 0);
     body.writeUInt16LE(1, 2);
     body.writeUInt32LE(sampleRate, 4);
     body.writeUInt32LE(sampleRate * 2, 8);
-    body.writeUInt16LE(2, 12);
+    body.writeUInt16LE(blockAlign, 12);
     body.writeUInt16LE(16, 14);
     return chunk('fmt ', body);
   };
```
```diff
     { case: 'a sample rate of 0', bytes: riff(fmt(0), data), reason: 'its fmt chunk gives no sample rate or frame size' },
+    { case: 'a block align of 0', bytes: riff(fmt(1000, 0), data), reason: 'its fmt chunk gives no sample rate or frame size' },
```

**Remediation brief**
- **Design intent:** every input problem joins the one-pass list and no check throws where it could report. The slot check and placement agree on which of song n's stems still hold a track when song n+1 starts: a stem rings when a clip ends after the Ending and starts ringing, its beats after the Ending converted at the next song's starting tempo (`ringingBeat`), before the next song's silence point (`silenceAfter`), the rule `cutOrRing` applies. A pad after the last song has no tail clip, so it needs no Intro. A pad whose holder could not be read gets no short-pad problem, because the holder's own problem names it. A WAV header with a sample rate or a block align of 0 is a problem, never a frame count.
- **Full surface:** `test/set-builder-stop-rules.test.ts` (one test after `:606`); `test/set-builder-pad.test.ts` (one test in each of the describe blocks at `:175` and `:458`, the `fmt` helper at `:742-750` and one `it.each` row after the sample-rate row); no source change. The rules they pin: `src/set-builder/checks.ts:97-98`, `:68-74`, `:82`, `src/set-builder/wav.ts:45`.
- **Must preserve:** every existing test in both files unchanged, the existing `fmt(1000)` and `fmt(0)` calls included (the new parameter defaults to 2); the source unchanged.
- **Do not touch:** a song with no starting tempo or meter stopping the build by a thrown error from placement (Reviewed and Dismissed, round 1's recorded approach for `hasStartingValues`).
- **Proof:** from the repo root, `cp docs/reviews/setlist-controller-59/repro/review-2-builder-unpinned-rules.test.ts test/`, then for each of `ring-raw-start`, `pad-after-last-needs-intro` and `no-holder-guard`: `git apply docs/reviews/setlist-controller-59/repro/review-2-mutation-<name>.diff && pnpm exec vitest run test/set-builder-stop-rules.test.ts test/set-builder-pad.test.ts test/review-2-builder-unpinned-rules.test.ts; git apply -R docs/reviews/setlist-controller-59/repro/review-2-mutation-<name>.diff`; and `git apply docs/reviews/setlist-controller-59/repro/review-2-mutation-wav-block-align.diff && pnpm exec vitest run test/set-builder-pad.test.ts -t "stops on a pad file with"; git apply -R docs/reviews/setlist-controller-59/repro/review-2-mutation-wav-block-align.diff`. Now the two suite files stay green under each mutation; after the fix each mutation turns its new test red. Then `rm test/review-2-builder-unpinned-rules.test.ts` and `pnpm test` green at HEAD.

### 3. Comment hygiene — LOW (aggregated)
- `src/set-builder/pads.ts:14` — "The key it is in, and its file name in the pads folder: `A` and `A.wav`." → "Its file name less its extension, which Live names its clip after, and its file name in the pads folder: `A` and `A.wav`, or `a` and `a.WAV`." Since `9f94144` the field holds the file's own spelling (`a`, `c#`), not a note name; the summary's key comes from `Pad.key`.

## Needs Further Investigation
Round 1's A to D (Loop on the Pad section dipping at the wrap, effect tails after the restore, fade steps in Live's undo history and automation, a tail clip past a short pad file's end) are unchanged by the delta and still belong to the acceptance run (#71) in Live. See `pre-pr-review-1.md`.

## Reviewed and Dismissed
- **A server shutdown during a fade now brings the music back to full level while Live plays on** — round 1's recorded approach for finding 1 (story 53: "set every volume back ... so that the next song plays at its normal level"); the alternative, stopping Live on shutdown, is an outward action the spec does not ask for.
- **A song with no starting tempo or meter still stops the build by a thrown error from placement, not a problem in the list** — pre-existing, and round 1's recorded approach (`b20e668`, `hasStartingValues`): the checks no longer throw on it, and placement names the song when nothing else stops the build.
- **The second, identical restore after close on a lost-then-regained connection** — round 1's known regression, deferred (`60f9c5b`); still present, no worse than described.
- **The slot check and `cutOrRing` compare in different coordinates** — disproved: `cutOrRing`'s `silence` is the previous song's Ending plus `silenceAfter`, the check compares with the same number under the same strict `<`, and a 44-row matrix agrees with placement.
- **`silenceAfter(next.song, intro)` differs from the old `next.meter.start` arithmetic** — `PlacedSong.meter` is `meterOf(song)` (`timeline.ts:60`, `:70`); identical.
- **`hasStartingValues` disagrees with `mainEvents`' throw** — both read `startingValue`; `!first` implies an undefined value.
- **`introProblems` and `shortPadProblems` index the wrong song** — `transitions[index]` goes into `service[index]`; the short-pad holder matches `padKey` and placement's `songs[index + 1] ?? song`.
- **A `.WAV` file's key is cut wrong in `keysIn`** — `'.wav'.length` is 4 whatever the case.
- **Tests from the findings 1 to 7 commits that pass at `95462f3`** (`test/fade-out.test.ts:540`, `:554`; `test/set-builder-pad.test.ts:193`, `:834` in Db; `test/set-builder-stop-rules.test.ts:608`, `:622`) — each guards a boundary of its fix and goes red under a mutation of it (test audit).
- **Deleting only `song.end !== null &&` in `defaultEndToggles` leaves the end-toggle tests green** — an equivalent mutant: `Math.abs(null - next)` is `next`, never within the tolerance.
- **Two pad files differing only in letter case** — APFS on Nick's Mac is case-insensitive, so they cannot sit side by side.

## Minor / nits
- After a re-read, a late `track-data` reply to the abandoned read is used in place of the fresh one (`src/server/fade-out.ts:146-154`); it matters only if the set's track list changed between two reads more than a second apart, and the requests carry no id to tell them apart.
- `READ_TIMEOUT_MS` (`fade-out.ts:25`) still has no comment, unlike its neighbours, and nothing fires at it (round 1's verifier note).
- `shortPadProblems` (`checks.ts:77`) and `padBars` (`timeline.ts:109`) have no doc comment, unlike every other exported check and finder beside them.
- The short-pad problem rounds the file's length to 3 decimals and does not give the bar length, so a file a hair under one bar can read as "lasts 2.5 s, less than one bar".
- `--pad 1=G --pad 1` keeps the last value with no warning (`src/set-builder/main.ts:85-88`); round 1's nit, with its run proposal.
- `test/set-builder-overlap.test.ts:451` builds the expected Count Off name from the build's own `result.songs[...].title`; the locator check it guards still catches round 1's overlap-as-gap mutation, and four other tests pin the title.
- `test/fade-out.test.ts:607` writes its expected step as `0.5 * (1 - 1 / 60)`, the production formula, rather than a literal.
- `moveBgvsTo` (`test/set-builder-stop-rules.test.ts:579-582`) does not check that its text replacement happened; the 316 test would still catch a fixture drift.
- `test/set-builder-pad.test.ts:996` (song 3's last locator is its End) never fails first: the `build` helper's zero-warnings parse already catches a misnamed late locator.
- Round 1's other Minor / nits stand unchanged; the delta touches none of them.

## Test quality
Tests added or changed since `95462f3`: 54 · red against `95462f3`: 23 · green against `95462f3`: 31 · tautology shapes found: 4 rules unpinned (findings 1 and 2), 1 test computing its expectation from output and 1 restating the production formula (nits).

The 31 green: 23 come from the test-only commits `18a6d89` (finding 8) and `bd1e74d` (finding 9), which pin behaviour `95462f3` already had; each goes red under its mutation except the block-align half of `wav.ts:45` (finding 2d). The other 8 come from the findings 1 to 7 commits and each guards a boundary of its fix (Reviewed and Dismissed). All 23 red tests fail for the intended reason. No snapshots, mocked units under test, assertion-free tests, or assertions on comments.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass at `0a5af38`, and so does `pnpm test:e2e`.
- **Commit hygiene:** the tree is clean. Commit this doc, the two repro tests and the seven mutation diffs under `repro/`. Nothing to drop.
- **Likely reviewer asks:** what the acceptance run (#71) proved by ear (round 1's A to D); why a server shutdown mid-fade restores the volumes rather than stopping Live; and why a song with no starting tempo or meter still throws rather than reports.

## Verdict
**Ready to open the PR, with follow-ups.** No finding gates it: zero CRITICAL, HIGH or MEDIUM. Of round 1's nine findings, all nine are fixed in behaviour, both MEDIUMs fully, and none only by a comment. The three LOW findings here are two test-only gaps the round 1 fixes left (findings 1 and 2, each with its test written out and its mutation proof in `repro/`) and one stale comment; they suit the loop's remediation pass or a follow-up ticket. The confirmed list shrank from nine to three, and its content moved from behaviour to test coverage and comment drift: that is the remediation working, not the review missing things.
