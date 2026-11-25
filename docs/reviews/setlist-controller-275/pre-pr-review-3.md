# Pre-PR review: setlist-controller#275 ProPresenter lyric slides follow the song inside each section, a lead ahead of the line (follow-ups #289 to #299)

**Branch:** `setlist-controller-275-propresenter-lyric-timing` vs `origin/main` (merge-base `98f15c4`, Merge pull request #300 from nick-vogel/setlist-controller-275-propresenter-lyric-timing)
**Reviewed at:** HEAD `e73c4a7` (setlist-controller#293 The pre-service check and the slide timing file use each song's own meter). 21 files committed against the merge-base, +1692 / −261, 29 commits. **The tree was not clean during the review:** `config/slide-timing.json` shows ` M` (+9 / −1, a "Holy Forever" Chorus 1 and Chorus 2 entry, each `changes: [3.5]`). No commit on this branch touches that file, no test or reviewer wrote it, and its mtime moved twice during the review (09:00:36, then 09:02:28) while `pnpm dev:server` and `vite`, started at 08:20 from another session, run from this worktree. It is someone else's live edit, so it is outside this review and is left exactly as found. This review adds this doc and 3 files under `repro/`.
**Reviewed against:** epic `nick-vogel/setlist-controller#275` (its body is the spec) and the eleven follow-up sub-issues this branch carries, #289 to #299 (each body's End state and Nick's recorded decisions for #291, #293 and #294); the Approach decisions of `pre-pr-review-2.md`. No CLAUDE.md, coding standards file, CONTEXT.md or ADR in the repo; the five shared review rules apply. Run with `--fresh`: `pre-pr-review-1.md` and `pre-pr-review-2.md` reviewed the first pass (#277 to #283), which landed in PR #300 and is the merge-base here, so this is a full review of the follow-ups, not a delta.
**Date:** 2026-11-03
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at `e73c4a7` | clean |
| Typecheck | `pnpm typecheck` | clean |
| Unit and integration suites | `pnpm test`, three runs | runs 1 and 2, under load from the review agents' own suite runs, failed 7 and 4 tests (set-builder 5 s timeouts and one ProPresenter jump test); run 3, alone, 70 files, 1820 passed, 4 skipped. The ProPresenter test passed 3 of 3 alone. Flakes, not regressions |
| Build | `pnpm build` | clean |
| E2E | `pnpm test:e2e` (OS-assigned ports) | 56 passed |
| Shipped copy | `git diff 98f15c4 -- src web README.md docs/install.md config \| grep -c '^+.*—'` | 0, no em-dash added |
| Finding 1, the End sent after the crossing went | `repro/review-3-finding-1-test.diff` applied in a scratch worktree at `e73c4a7`, `pnpm exec vitest run test/propresenter.test.ts -t "with a lead of a bar"` | red, twice: ProPresenter received slide 0, slide 0, the clear, slide 0, slide 0 |
| Finding 1, candidate fix | `repro/review-3-finding-1-candidate.diff` plus the test diff in a scratch worktree, `pnpm typecheck`, `pnpm exec vitest run test/propresenter.test.ts test/connections.test.ts test/cue-lateness.test.ts` | typecheck clean; 254 of 254 green, the repro included |
| Finding 2, a signature report before the position report | `repro/review-3-finding-2-test.diff` applied in a scratch worktree at `e73c4a7`, `pnpm exec vitest run test/propresenter.test.ts -t "before the playhead's move into it"` | red, twice: an extra note "Ancient Gates: Verse 3 has 3 slides in 2 bars, changed on beats" |
| #297 library read shapes | the ProPresenter OpenAPI spec fetched 2026-11-03 from https://openapi.propresenter.com/swagger.json (the vendor's own spec), `paths./v1/libraries.get` and `paths./v1/library/{library_id}.get` | the list is `[{ "id": { "uuid", "name", "index" } }]` and a library is `{ "updateType", "items": [{ "uuid", "name", "index" }] }`, the shapes `librariesIn` and `itemNamesIn` read |
| #298 guard | the mutant `if (sending.kind === 'clear')` for `if (sending.kind === 'clear' && run === presses)` at `src/server/propresenter.ts:672`, in a scratch worktree, `pnpm exec vitest run test/propresenter.test.ts` | 1 failed, 198 passed: `:1949` "keeps Verse 3's slide text when the Interlude's clear is answered after Verse 3's trigger went out" kills it, alone |
| Tautology audit (Phase 4.5) | the branch's five changed test files and two support files copied onto `98f15c4` in a scratch worktree and run there, twice; each new test read for the six shapes | 70 tests added or modified: 53 red at base, 17 green at base, each green one expected (see Test quality) |
| Not run | the real ProPresenter and Live; the real order of AbletonOSC's signature and position reports; the real `GET /v1/libraries` answer | #284 is Nick's home run; the guardrails forbid driving Live |

**Overall:** Each of the eleven follow-ups does what its ticket's End state asks, on the paths the tickets name: the notes leave "Cannot match:" and a clean set still reads as matched, the End line in the check agrees with what the End cue sends, the clamp at a clear and the Loop-press cancel hold, and the #298 guard test kills its mutant. Two of the new mechanisms break their own rule on a path the tickets did not test. With a lyric lead at least as long as the next song's first section, the End clears the screen after the next song's first slide already went up (finding 1). A signature report that reaches the server before the position report gives the song the playhead left the new song's meter, and the check then judges it wrongly until the playhead goes back (finding 2). Fix both before the PR. The rest is a missing fallback test, two weak tests, and three lines of docs.

## Approach decisions
- The End inside the crossing's lead (review 3 finding 1, recommended): `droppedEnd` judges whether the crossing went, by the crossing itself (`crossing(entry, song)`) and by whether the change remembered as sent early is the crossing or a later change of the next song. It no longer requires that the last change sent early is the crossing. The `crosses` tag stays as it is, and `observed()`'s end-toggle branch keeps reading it. Precedent: `endInsideLead`, already measured against a `Change` from `crossing()` in `onward()` (`src/server/connections.ts:507`).
- A song's meter on a signature report (review 3 finding 2, recommended): a signature report no longer stamps the song at the last reported playhead at once. It waits for the next position report, which stamps the song it lands in, as the position case already does. A one-shot timer of `LOOP_REPORT_MS` stamps the song at the playhead when no position report comes, and publishes. Precedent: the asked-for loop's lapse, `ask`/`forgetAskedLoop` (`src/server/playback-controller.ts:269-279`).
- Remediation of review 3, 2026-11-03: finding 1 took the recorded approach unchanged. Finding 2's recorded approach (the signature report waits for the next position report, with a one-shot timer of `LOOP_REPORT_MS`) is blocked, not overturned: it turns two of #293's meter hold tests red, which its own brief says to keep. The next round re-issues the brief or picks another mechanism here.
- A library body the check cannot read (review 3 finding 3, recommended): a library answer whose body has no `items` list reads as "could not be read", the same as a non-200, never as an empty library.

## Confirmed Issues

### 1. With a lyric lead at least as long as the next song's first section, the song's End clears the screen after the next song's first slide went up early, then sends that slide twice more — MEDIUM
- **Location:** `src/server/connections.ts:540-545` (`droppedEnd`), with `fire` at `:589-596`; called at `:765`
- **Attribution:** introduced by `edb815c` (setlist-controller#294 The lyric lead across a song boundary). `git log -S'droppedEnd' 98f15c4..HEAD` names only that commit, and the merge-base has no crossing (`git show 98f15c4:src/server/connections.ts | grep -c crosses` gives 0).
- **Real-world trigger:** Nick tunes `leadBeats` after a rehearsal (epic story 11) to 4, one bar of 4/4. A song plays on into the next song, whose 1-bar Count Off begins on the song's End, the overlap the set builder makes, so the toggle starts on Continue. The next song's first slide goes 4 beats early. Its second change, the Intro's slide on the bar after, is due 4 beats after the End, so it goes on the End's beat, before the End's played-into cue arrives. At the default lead of 2, the path needs a next song whose first section is shorter than 2 beats, so the rating holds only for a lead at least as long as that first section. MEDIUM, capped: on-screen only, a blank and a re-send, never wrong words. Check `leadBeats` in the connections config against the set's Count Off lengths.

**Evidence**
```ts
const droppedEnd = (entry: Entry, cue: Cue) => {
  const { early } = entry;
  if (cue.section !== 'end' || cue.cause !== 'played-into' || !early || early.crosses !== cue.song) return false;
  const song = currentSet()?.songs.find((candidate) => candidate.number === cue.song);
  return !!song && endInsideLead(entry, song, early);
};
```
`fire` records each change it sends as `entry.early`, and it carries `crosses` only on the crossing itself. The next change it schedules from the crossing (`ahead(entry, change.cue, …)`) has no `crosses`.

**Failure mode:** the November 8 set with Ancient Gates' End on 44 (`OVERLAP_CUE_POINTS`) and `leadBeats: 4`, playing from 36. Holy Forever's Count Off slide (index 0, on 44) goes on 40, which is right. The Intro's slide (index 0 again, on 48) then goes on 44 and replaces `entry.early`. When the End's played-into cue arrives, `early.crosses` is undefined, so `droppedEnd` is false and the End sends its clear. The End's deliver then schedules again from the End: the crossing's send point has passed, so it fires at once, and the chain fires behind it. ProPresenter received `[HF/0, HF/0, /v1/clear/layer/slide, HF/0, HF/0]` where #294 asks for no clear. The congregation sees Holy Forever's title, a blank on the Count Off's downbeat, then the title again.

**Recommended fix:** `repro/review-3-finding-1-candidate.diff`:
```diff
   const droppedEnd = (entry: Entry, cue: Cue) => {
     const { early } = entry;
-    if (cue.section !== 'end' || cue.cause !== 'played-into' || !early || early.crosses !== cue.song) return false;
+    if (cue.section !== 'end' || cue.cause !== 'played-into' || !early) return false;
     const song = currentSet()?.songs.find((candidate) => candidate.number === cue.song);
-    return !!song && endInsideLead(entry, song, early);
+    const across = song && crossing(entry, song);
+    if (!song || !across || (early.crosses !== cue.song && early.cue.song !== across.cue.song)) return false;
+    return endInsideLead(entry, song, across);
   };
```
Diff audit, line by line:
- The removed `early.crosses !== cue.song` gate becomes "the crossing, or a later change of the next song, went early". Only the chain that starts at the crossing reaches the next song's changes before the End. A jump landing hands a cue, which sets `entry.early` to null (`hand()`), so a stale next-song mark cannot survive one.
- `endInsideLead` is now measured against `crossing(entry, song)` rather than against `early`. For the case that passed before (`early` is the crossing) the two are the same `Change`. `crossing()` returns null when the toggle is on Stop, so an End whose song stopped playing on is never dropped, as before.
- The failure of the fix: when `crossing()` returns null for any other reason (no next song, a next song whose first section clears), the End is sent, which is the pre-#294 behaviour and the safe side.

**Remediation brief**
- **Design intent:** each target with a lead holds at most one pending change (`entry.pending`) and one remembered change sent early (`entry.early`). Each change that fires schedules the next from itself (`fire` calls `ahead`). The crossing is the next song's first slide, tagged `crosses: <song before>`. At the song before's End, `droppedEnd` decides whether the screen already moved to the next song. Its question is "did the crossing go?", which is not the same as "is the crossing the last change that went?".
- **Full surface:** `src/server/connections.ts:540-545` (`droppedEnd`, the change). Unchanged but read: `:548-549` (`endInsideLead`), `:531-537` (`crossing`), `:589-596` (`fire`, which sets `early`), `:765` (the caller in the cue's deliver loop), `:835-837` (`observed()`'s end-toggle branch, which still reads `early.crosses` and `pending.crosses`). Test: add `repro/review-3-finding-1-test.diff`'s case to the `the lyric lead` describe in `test/propresenter.test.ts`.
- **Must preserve:** the crossing tests in `the lyric lead` describe, `test/propresenter.test.ts:3568-3715`. They cover: the End on the shared beat dropped; an End inside the lead dropped; a Fade out before the crossing leaves the End clear then the slide (`:3641`); Stop set before and after scheduling sends the clear (`:3657`, `:3670`); Stop set after the crossing went sends the clear (`:3685`); Continue set after the last report (`:3700`). Also README.md:49's crossing rule.
- **Do not touch:** `observed()`'s end-toggle branch forgetting only a tagged `early` (`:835`). The Stop then Continue flip that re-sends the crossing is a Minor below, not part of this fix.
- **Proof:** from the repo root, `git apply docs/reviews/setlist-controller-275/repro/review-3-finding-1-test.diff && pnpm exec vitest run test/propresenter.test.ts -t "with a lead of a bar"`. Red at `e73c4a7` (received five requests, the clear third); green with the fix. Then `pnpm exec vitest run test/propresenter.test.ts test/connections.test.ts test/cue-lateness.test.ts`, all green.

### 2. A time signature report that reaches the server before the playhead's move gives the song the playhead left the new song's meter, and the check judges it by that meter until the playhead returns — MEDIUM
- **Location:** `src/server/playback-controller.ts:218-223` (`rememberMeter`), called from the signature cases at `:681-692`
- **Attribution:** introduced by `d947b67` (setlist-controller#293 The pre-service check and the slide timing file use each song's own meter). `git log -S'rememberMeter' 98f15c4..HEAD` names only that commit, and the merge-base has no per-song meter (`git show 98f15c4:src/server/playback-controller.ts | grep -c meters` gives 0). It is not one of the LOW findings #293's passes accepted. F3.4 is the opposite order, where the new song briefly holds the old meter until the signature report corrects it. That one heals itself; this one stays wrong.
- **Real-world trigger:** the Saturday walk that #293 asks for, on a mixed-meter set: a click from a 6/8 song into a 4/4 song with Live stopped, or the playhead playing across the boundary. Live's two listeners each report, and when the signature report arrives first, `position` still holds the old song's playhead. The order AbletonOSC uses is not recorded, so the trigger is unproven. MEDIUM, capped (wrong results silently delivered): drop to LOW if AbletonOSC always reports the position before the signature. Check: log the OSC arrivals at the home Live while clicking from a 6/8 song into a 4/4 song (Needs Further Investigation B).

**Evidence**
```ts
const rememberMeter = () => {
  const at = now(position);
  if (!at || isPad(sectionAt(set, at)?.name ?? '')) return;
  if (!reported.numerator || !reported.denominator || meters.get(at.song) === barLength()) return;
  meters = new Map(meters).set(at.song, barLength());
};
```
`position` is the last reported playhead. On a signature report it can still be in the song the playhead just left.

**Failure mode:** `MIXED_METERS` with Live stopped in Ancient Gates at 10, in 6/8. The fake Live reports 4/4, then the playhead at 44, in Holy Forever. Ancient Gates is stamped 4/4 and is never corrected, because later reports are in Holy Forever. Its 9-beat Verse 3, 3 bars of 6/8 for 3 slides, is noted as "Ancient Gates: Verse 3 has 3 slides in 2 bars, changed on beats". By the same mechanism, its slide timing entries are judged against 4/4 bars: a valid one can read as a problem, and a broken one can pass and then be ignored on Sunday. This is the very defect #293 exists to remove.

**Recommended fix:** a signature report waits for the next position report to place it. A one-shot timer stamps the song at the playhead when no position report comes within `LOOP_REPORT_MS`, and publishes.
```diff
+  let stopMeterWait: (() => void) | null = null;
+  const forgetMeterWait = () => {
+    stopMeterWait?.();
+    stopMeterWait = null;
+  };
+  const meterWaits = () => {
+    forgetMeterWait();
+    stopMeterWait = clock.every(LOOP_REPORT_MS, () => {
+      forgetMeterWait();
+      const before = meters;
+      rememberMeter();
+      if (meters !== before) onChange(snapshot());
+    });
+  };
@@ case 'position':
           sendCountIn();
+          forgetMeterWait();
           rememberMeter();
@@ case 'signature-numerator':
           reported.numerator = true;
-          rememberMeter();
+          meterWaits();
           break;
@@ case 'signature-denominator':
           reported.denominator = true;
-          rememberMeter();
+          meterWaits();
           break;
```
Diff audit, line by line:
- The removed immediate `rememberMeter()` on each signature report had one behaviour: a signature report alone stamped the song at the playhead at once. The fix keeps it, but `LOOP_REPORT_MS` later when no position report follows. That drop of immediacy is intended.
- The position case still stamps at every report, as it does now. It now also ends a wait, since that report places the meter.
- The cue-points case's `rememberMeter()` (`:618`) is unchanged.
- The failure of the fix: in the position-first order, the new song holds the old meter until the timer fires, so a stopped Live may run one check with it and then one more once the timer stamps it. That is today's F3.4 transient, stretched to `LOOP_REPORT_MS`. The server's check hold (`src/server/server.ts:116-119`) reruns the check on the timer's publish, because `controller.meters()` changes identity.

**Remediation brief**
- **Design intent:** the controller keeps, per song number of the set, the bar length Live last reported while the playhead was inside that song, never in a Pad or Pad Out. A new set clears the map. The server reads it with `controller.meters()` and reruns the checks when its identity changes, unless Live plays, is not connected, or has a playing report on its way. The check and the slide timing file judge each song's bars only by its own entry. The invariant this finding breaks is that a song is only ever stamped with a meter Live reported while the playhead was inside it.
- **Full surface:** `src/server/playback-controller.ts:218-223` (`rememberMeter`, unchanged), `:625-648` (position case), `:681-692` (signature cases), and the new wait beside `ask`/`forgetAskedLoop` (`:265-279`). Read: `src/server/server.ts:104-150` (`checkMeters`, `waitForReport`, `onChange`), which needs no change but must see the timer's publish. Test: add `repro/review-3-finding-2-test.diff`'s case to the meter describe in `test/propresenter.test.ts`, and update the walk helper.
- **Must preserve:** the meter walk tests `test/propresenter.test.ts:2322` and `:2334`, which call `setPosition` then `setSignature` and wait for the row. With the fix, the signature report waits, so these tests must move the server's clock on by `LOOP_REPORT_MS` (`rig!.advanceConnected`) or the fake Live must report the playhead again. Change the helper `walk` (`:2317-2320`), not the assertions. Also keep `:2347` ("forgets every song's meter on a new set from Live, but the song the playhead sits in keeps Live's"), the pre-service check suite `test/pre-service-check.test.ts`, and the meter hold tests that #293's passes added (`git log --oneline 98f15c4..HEAD -- test/pre-service-check.test.ts`).
- **Do not touch:** the identity comparison in `checkMeters` (accepted LOW F3.2), the Pad skip in `rememberMeter`, and the two-halves case (accepted F3.6).
- **Proof:** from the repo root, `git apply docs/reviews/setlist-controller-275/repro/review-3-finding-2-test.diff && pnpm exec vitest run test/propresenter.test.ts -t "before the playhead's move into it"`. Red at `e73c4a7` (the extra Ancient Gates note); green with the fix. Then `pnpm exec vitest run test/propresenter.test.ts test/pre-service-check.test.ts`, all green.

### 3. Two fallback paths of the library read have no test, and a library body with no item list reads as an empty library — LOW
- **Location:** `src/server/propresenter.ts:472` (`libraries.some((answer) => answer?.status !== 200)` gives null) and `:1197-1199` (`itemNamesIn` returns `[]` for a body with no `items` array)
- **Attribution:** introduced by `f21db09` (setlist-controller#297 The slide timing file checks song titles only against the set, so a typo stays silent).
- **Real-world trigger:** a ProPresenter that answers the list but refuses one library, or answers it in another shape. The second path turns a read failure into "<title>: slide timing for no song in the set or in ProPresenter's libraries" for every title outside the set, which is a false typo report, not silence. The spec shapes match the code (see the verify table), so no user path is known. LOW.

**Evidence:** the fake can refuse only the list. `refuseLibraries` (`test/fake-propresenter.ts:458`) answers `GET /v1/libraries` with the status, and the fake lists only the library it holds, so `GET /v1/library/{name}` always answers 200 with `items`. The only test of the "not checked" problem is `test/propresenter.test.ts:3856`, through the list. This breaks the shared rule of a test for every fallback path.

**Recommended fix:**
```diff
-    if (libraries.some((answer) => answer?.status !== 200)) return null;
+    if (libraries.some((answer) => answer?.status !== 200 || !Array.isArray((answer.body as { items?: unknown } | null)?.items))) return null;
```
Then give the fake a `refuseLibrary(status)` (answers `GET /v1/library/{name}`) and a way to answer a library with no `items`. Add two tests beside `:3856` that assert the one problem "slide timing <titles>: not checked, ProPresenter's libraries could not be read". `itemNamesIn`'s own `!Array.isArray(items)` branch is then unreachable from `libraryNames`; keep it as the type guard.

**Remediation brief**
- **Design intent:** the title check reads the libraries only when a file title falls outside the set. Any read it cannot trust is one "not checked" problem naming those titles, never a per-title typo.
- **Full surface:** `src/server/propresenter.ts:467-474` (`libraryNames`), `:1197-1204` (`itemNamesIn`), `test/fake-propresenter.ts:89-91` and `:458` (the refuse hooks), `test/fake-propresenter.test.ts:141-149` (the fake's own refuse test), `test/propresenter.test.ts:3856` (the test to mirror).
- **Must preserve:** `test/propresenter.test.ts:3879` ("reads no library when every title in the file is a song in the set") and the typo test from #297's proof.
- **Proof:** the two new tests are red at `e73c4a7` (the refused library: the fake has no hook; the body with no `items`: the check names the title as a typo) and green after.

### 4. The #298 guard test and the meter walk tests assert less than they read — LOW
- **Location:** `test/propresenter.test.ts:1967` and `:1973`; `:2331` and `:2344`
- **Attribution:** introduced by `4ba0224` (setlist-controller#298) and `d947b67` (setlist-controller#293).
- **Real-world trigger:** none on stage. A future change could blank the wrong text, or note the wrong song, and stay green.

**Evidence:**
- `expect((await latest()).state.length).toBeGreaterThan(0)` passes for any non-empty slide text, so a stale answer that wrote another slide's text would pass. The test does kill #298's mutant (verify table), so keep it.
- At `:2331` and `:2344` the final `expect(...).toEqual([HOLY_FOREVER_ON_BEATS])` (and `[HOLY_FOREVER_OUTSIDE]`) repeats the `row()` wait predicate on the line before it, so it cannot fail on its own. The test bites only through the wait's timeout.

**Recommended fix:**
- At `:1967` and `:1973`, assert the row's `state` equals Verse 3's slide 11 text exactly, taken from the recorded There Is Freedom fixture.
- At `:2330` and `:2343`, wait only on `meterLines(row.check).length === 0`, then assert the whole `onBeatsLines` and `timingProblems` lists.

**Remediation brief**
- **Design intent:** a test asserts only what the producer sees, and every assertion can fail on its own.
- **Full surface:** the four lines above.
- **Must preserve:** `:1949` stays the test that kills the `run === presses` mutant. Rerun the mutant after the change.
- **Proof:** `pnpm exec vitest run test/propresenter.test.ts -t "keeps Verse 3's slide text|walking"` green, and the mutant from the verify table still turns `:1949` red.

### 5. Comment hygiene — LOW (aggregated)
- `README.md:49` — "…and that song's End, when it falls inside that lead, sends nothing: no clear and no End or Ending group." → "…and that song's End, when it falls inside that lead and that slide went up early, sends nothing: no clear and no End or Ending group. When a Fade out, a loop change or a moved prediction stopped that slide, the End goes as usual."
- `README.md:49` — "A song the playhead has not been in since the set was read or the server started" → "A song the playhead has not been in since the set last changed or the server started" (a Refresh that reads the same set keeps the meters, `src/server/playback-controller.ts:612-617`)
- `docs/install.md:281` — "Until the playhead has been inside a song since the set was read or the server started" → "Until the playhead has been inside a song since the set last changed or the server started"
- `test/fake-propresenter.ts:46` — "…and its place in the list, by name; a library it does not hold is a 404;" → "…and its place in the list, by name; a library it does not hold is a 404."

## Needs Further Investigation
### A. The real ProPresenter's library answers are not recorded
`GET /v1/libraries` and `GET /v1/library/{name}` were never read from the home ProPresenter (`test/fixtures/propresenter/README.md`, "The libraries, not recorded"). The code and the fake follow the OpenAPI spec, and the spec fetched on 2026-11-03 confirms those shapes. A finder's claim that the list holds bare id objects is therefore dismissed below. What would settle it: record both answers at home during #284 and replace the fake's spec-shaped answers. Finding 3's fix makes any surprise a "not checked" problem instead of false typos.

### B. Whether AbletonOSC reports the time signature before the playhead on a boundary
This decides finding 2's severity. What would confirm it: log the server's OSC arrivals (`signature_numerator`, `signature_denominator`, `current_song_time`) at the home Live while clicking from a 6/8 song into a 4/4 song with Live stopped, and while playing across that boundary. The order seen sets the rating: MEDIUM if the signature ever arrives first, LOW if it never does.

## Reviewed and Dismissed
- The library list holds bare `{ uuid, name, index }` objects, so `librariesIn` reads no names and every outside title is a typo. Dismissed: the vendor's OpenAPI spec gives `[{ "id": { … } }]`, the shape read at `src/server/propresenter.ts:1188-1193`.
- A note lands under "Problems:", or a problem under "Notes:" (#289). Dismissed: `checkLines` puts only "no presentation" in `unmatched`. The arrangement, authorization, timing and title lines are problems; every other line is a note. `checkOf` (`src/server/connections.ts:195-200`) gives `matched` with its notes when the other two lists are empty.
- The check's End line disagrees with the End cue (#290, #291). Dismissed: both ask `endCueGroupFor` with the same song and exceptions (`src/server/propresenter.ts:875`, `:1151`), so "no group End, clears" shows exactly when the cue clears, apart from the unread-meter Minor below.
- A missing meter yields NaN or Infinity bars (#293). Dismissed: `bar` is `meters.get(song.number) ?? null`, the changed-on-beats loop returns at null, and `resolveEntry` skips the outside rule at null. A zero numerator or denominator is refused at `src/server/playback-controller.ts:682`, `:688`.
- A one-slide group still noted (#299). Dismissed: `group.slides.length <= Math.max(bars, 1)` holds for one slide at any length.
- The #298 test cannot go red. Dismissed: the mutant turns `:1949` red, alone.
- The unit-suite failures in runs 1 and 2. Dismissed as load flakes: the same tests passed on run 3, and the ProPresenter one passed 3 of 3 alone.

## Minor / nits
- An End exactly on the crossing's send beat is decided by which comes first, the crossing's timer or Live's report of the End. When the report wins, the End goes and the crossing follows at once, a flash. This matches #294's "only when actually sent" (`src/server/connections.ts:548-549`).
- A Loop press that never reaches Live lapses after `LOOP_REPORT_MS` with no publish, so a change dropped against the asked-for loop is rescheduled only at Live's next report, about one report later while playing (`src/server/playback-controller.ts:265-279`).
- Flipping a song's end toggle to Stop and back to Continue after its crossing went sends the same slide again. The screen ends right (`src/server/connections.ts:835-837`).
- A server that first connects to a Live already playing starts no report wait, so a meter that arrives before Live's playing report reruns the check mid-song (`src/server/server.ts`, `liveWas`). The first set read already runs every check regardless, as at the base.
- While a song's meter is unread, a slide timing entry that gives its last section a `group` with `changes` outside the section is taken as valid by the check. Played at Live's meter, the cue ignores it, so the check's End line can differ from the cue until the meter is read. The note "meter not read yet" already flags the check as incomplete.
- The check line "no group End, clears" is per song and ignores the end toggle, so for a song that plays on, with its End inside the crossing's lead, the End sends nothing. README.md describes the crossing separately.
- The library read goes through `request`, whose 15 s timeout puts ProPresenter offline, like every other read the check makes. It is one more read, and only when a title is outside the set.
- `test/propresenter.test.ts:808` and `:3626`: a `not.toContain` implied by the `toEqual` before it. The first was accepted as #291 F1.6.
- `test/pages.test.ts:1385-1399`: the notes colour test reads its expectation from the stylesheet. Accepted as #289 F1.6.
- The Intro with no group re-triggers slide 1 after the Count Off showed it, a repeat ProPresenter shows as no change. This is base behaviour; finding 1's repro pins it as it is.

## Test quality
- Tests added or modified: 70.
- Red against `$BASE` (`98f15c4`): 53. Green against `$BASE`: 17. Tautology shapes found: 2, both in finding 4.
- Every green-at-base test is expected:
  - The fake's own library tests (`test/fake-propresenter.test.ts:119`, `:135`, `:141`) run against the branch's fake.
  - Four `test/pages.test.ts` cases (`:680`, `:693`, `:1334`, `:1346`) only gain `notes: []`.
  - `test/propresenter.test.ts:784` keeps the half of the End rule #291 left alone.
  - `:1949` is #298's guard for behaviour that already existed, and it kills its mutant.
  - Guards that bound new features and pass trivially where the feature is absent: `:2488`, `:3101` and `:3469` for #292; `:3228` for #296; `:3629`, `:3641`, `:3657` and `:3670` for #294. Each sits beside a red test that carries the feature.
- `:3879` ("reads no library when every title in the file is a song in the set") is red at base only through the check's new shape. Its own assertion guards #297's edge.
- Delete nothing.

## Before opening the PR
- **CI readiness:** the repo has no CI (removed in PR #300). Lint, typecheck, build and e2e are green here. The unit suite is green alone and flaky under parallel load (set-builder timeouts, already tracked in setlist-controller#205).
- **Commit hygiene:** `config/slide-timing.json` is modified in the worktree by another session (see the header). It is not part of this branch's commits. Whoever owns it decides whether it lands; it must not ride along by accident.
- **Likely reviewer asks:** the real library answers (A), and the real report order behind finding 2 (B). Both are for #284's home run.

## Verdict
**Not ready as-is.** The gate is findings 1 and 2. Both are MEDIUM, both are introduced, and both break the rule their own ticket decided: #294's "the End sends nothing once the early slide went", and #293's "never the signature Live reports from another song". Findings 3, 4 and 5 are LOW. They can ride along with the remediation or become a follow-up ticket. No prior finding is claimed by this branch: the follow-ups' own proofs are each turned into a test, and each passes.

## Remediation, 2026-11-03
Scope: CRITICAL, HIGH and MEDIUM, so findings 1 and 2. Findings 3, 4 and 5 are LOW and deliberately deferred. Worked at HEAD `a4bca27` (setlist-controller#284 Slide timing exceptions from the home run of the 8 November set), which moved only `config/slide-timing.json` since the review's `e73c4a7`.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `ea899f7` setlist-controller#275 pre-PR review 3 finding 1: With a lead at least as long as the next song's first section, the End clears the screen after the crossing went up early | red→green: `pnpm exec vitest run test/propresenter.test.ts -t "with a lead of a bar"` (red: five requests, the clear third; green: two). Preserve: `pnpm exec vitest run test/propresenter.test.ts test/connections.test.ts test/cue-lateness.test.ts`, 254 of 254 green. `pnpm typecheck` clean | 0 | proved by execution (MEDIUM, proof executed, preserve suites green, no shared core touched); no verify agent |
| 2 (MEDIUM) | none, blocked | red at `a4bca27`: `pnpm exec vitest run test/propresenter.test.ts -t "before the playhead's move into it"` (the extra Ancient Gates note). The recommended diff turned it green, and turned 2 Must preserve tests red | n/a | blocked: the brief contradicts itself, see below |
| 3 (LOW) | deferred | n/a | n/a | not worked: LOW tail |
| 4 (LOW) | deferred | n/a | n/a | not worked: LOW tail |
| 5 (LOW, comment hygiene) | deferred | n/a | n/a | not worked: LOW tail |

### Finding 2, blocked
The recommended diff was applied exactly as written (the wait beside `ask`/`forgetAskedLoop`, `forgetMeterWait()` in the position case, `meterWaits()` in both signature cases). The proof went green. Then `pnpm exec vitest run test/propresenter.test.ts test/pre-service-check.test.ts test/now-playing.test.ts` gave 7 failed, 226 passed:
- 5 in `test/propresenter.test.ts`, the four `walk` tests and "forgets every song's meter on a new set from Live…". The brief expects these and says to change the `walk` helper. Not done, since the finding stopped.
- 2 in `test/pre-service-check.test.ts`, "holds the check while a count-in from a stopped Live starts a song of another meter" and "…Play from start…" (`:349-370`): `expected { '1': 3, '2': 3 } to deeply equal { '1': 3, '2': 4 }` at `:369`. The test reports the signature (`setSignature(4, 4)`), then the stop (`setPlaying(false)`), with no position report between. With the fix, the stop's check runs with song 2 still at the old 6/8, and the timer's stamp comes a second later, as a second check.

The two sentences that disagree:
- Diff audit: "in the position-first order, the new song holds the old meter until the timer fires, so a stopped Live may run one check with it and then one more once the timer stamps it."
- Must preserve: "Also keep … the pre-service check suite `test/pre-service-check.test.ts`, and the meter hold tests that #293's passes added".

The two hold tests pin exactly the check the diff audit accepts as wrong for a moment. The review's verify table ran no candidate for finding 2, so this was not seen. What the re-issued brief has to decide: either those two tests change (for example, the fake Live reports the playhead while it plays, as the real Live does many times a second, so the wait ends before the stop), or the mechanism changes (for example, Live's stop report also ends a waiting signature and stamps it), each with its own Must preserve and proof. The applied diff, with the proof test, is kept at `repro/review-3-finding-2-remediation-attempt.diff`. Nothing of it is committed.

### Finding 2, deferred by Nick
2026-11-03: Nick deferred finding 2. Whether it can happen depends on the order AbletonOSC sends the signature and the playhead at a boundary (Needs Further Investigation B), which the home run of the 8 November set (setlist-controller#284) records. The fix waits for that order; the follow-up is the end report's proposal for a signature report ahead of the position report (#293 prep). A later round treats a repeat of finding 2 as deferred, not open.

### Known regressions, deferred
- None. Finding 1's commit passed its proof and all three preserve suites; nothing from finding 2 is committed.

### Rework briefs
- None. No verify agent ran, so there was no rework pass.

