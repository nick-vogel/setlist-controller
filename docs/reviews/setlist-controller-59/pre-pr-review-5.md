# Pre-PR review: setlist-controller#59 the third run's follow-ups, #85 to #90

**Branch:** `setlist-controller-59-song-transitions` vs `origin/main` (merge-base `f0a97f4`, setlist-controller#1 Follow-ups: dead sockets, the leader secret, lost and late jumps, and play from start on real Live (#102))
**Reviewed at:** HEAD `5b5031a` (setlist-controller#89 A reserved folder named in another letter case, such as _Pads, is listed and matched as a song), with no uncommitted changes and no untracked files: 13 files, +300 / −46
**Delta under review:** none. This round is `--fresh`, so it reviews the whole working surface against `origin/main`. Runs 1 and 2 of the epic merged into `main` by PR #94, so the surface is only the six tickets of run 3.
**Reviewed against:** setlist-controller#85, #86, #87, #88, #89 and #90 (their bodies are the spec, with the dropped items struck through), the epic's sub-issue list, and `pre-pr-review-4.md` (its Approach decisions and finding 3, which #89 implements). The repo has no `CLAUDE.md` and no coding-standards file, so the five binding rules of the review conventions are the standard.
**Date:** 2026-10-20
**Reviewer:** 2 code-review agents, 1 test-audit agent, and a verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Lint, types, unit tests, build, end to end | `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` at HEAD | all exit 0. 33 files, 656 passed and 3 skipped (the skips are the existing `plutil` and root-user gates, `test/launch-agent.test.ts:48` and `test/set-builder.test.ts:1305`). Playwright 30 passed |
| #86 under other time zones | `TZ=Pacific/Kiritimati` and `TZ=Pacific/Pago_Pago pnpm exec vitest run test/set-name.test.ts` | 7/7 in each, so the acceptance criterion holds when run by hand. Nothing in the repo runs it so (finding 2) |
| New tests against the base | the branch's six test files copied into a scratch worktree at `f0a97f4`, then run there | 22 tests added or changed. 19 are red at the base and 3 are green (see Test quality) |
| Mutations of the new rules | 19 mutations of the branch's `src/` in a scratch worktree (fade expiry `<` for `<=`, measured from the restore, no expiry, an expired connect left `lost`; reserved names by prefix, case-sensitive parent; tolerance 1e-3, 5e-4, 2.9e-4, 1.1e-4, 1e-4; `setName` with `getDay`, local midnight, no rollover check, another format) | every one is killed except the two `setName` time-zone mutations, which survive in UTC (CI) and America/New_York (this Mac), and two tolerances inside the specified band. The two survivors are kept as `repro/review-5-mutation-setname-*.diff` |
| Fade close after an expired loss | `repro/review-5-close-after-expiry.test.ts`, copied into `test/` and run | red at HEAD: `expected [ 'set 0 0.5', 'set 1 0.25' ] to deeply equal []` (finding 1). It is green with the recommended fix, and so are all 31 tests in `test/fade-out.test.ts`, checked in a scratch worktree. `tsc` is clean |
| Short-name quoting | `node src/set-builder/main.ts --list` over a scratch library with `Say "Yes" Lord`, at HEAD and at the base | HEAD prints `"yes" lord"`, which the shell cannot parse. The base printed `""yes""`, which the shell reads as `yes` (finding 3) |
| #89 paths and letter case | `--list` over scratch libraries: `_TEMPLATE`, `_Pads`, `--pads` with a trailing slash, the library part in another case, `Ämbient` given as `ämbient`, `Straße`, `ΟΔΟΣ`, NFD against NFC, a symlinked library, `/tmp` against `/private/tmp` | ASCII and simple-lowercase cases are hidden. The Unicode folding cases and the two link cases still list the pads folder (nits) |
| #90 edge cases | `--list` over scratch libraries: `Hope & Glory`, `!!!`, `10,000`, `don't`, `(bless`, an emoji with U+FE0F, `(Live)` beside `Live Forever` | no pair is made across a lone `&`, and every printed name matches its own folder alone. Edge shapes are listed under nits |
| The clock across sleep | `process.hrtime` compared with uptime since `kern.boottime` on this Mac (Node 26.3, libuv 1.52.1), across 360 `pmset` sleep entries | 334775 s against 334766 s, so the monotonic clock counts sleep and the 10-minute limit is real time. That `performance.now()` uses the same clock is an inference |
| #87 skill text | read `.claude/skills/build-set/SKILL.md` at HEAD against #87's list and `src/set-builder/main.ts` `USAGE` | every item #87 kept is in the text and consistent with the mapping and worked examples. The read-through criteria need fresh Claude sessions, which this review did not run |
| The library's real titles | `ls ~/Music/MultiTracks` (read only) | seven song folders and `_template`. None has `"`, `$`, a backtick or a backslash in its name, and none has punctuation `--list` now strips |
| Not run | the read-through in fresh sessions (#87), a build with pads in a case-variant folder, anything against real Live | the read-through and the build go to the acceptance run #71, which is Nick's. Real Live is out of bounds |

**Overall:** Run 3's six tickets do what their issues ask, and every check passes. No finding is above LOW. Two small gaps sit in the tickets' own surface. First, the fade's new 10-minute limit is applied when Live connects but not when the server closes (finding 1). Second, #86's time-zone guard exists only as a comment, because nothing runs the test file in another zone (finding 2). Both are one-commit fixes, and fixing them before the PR keeps the epic's claims true. Finding 3 is older and belongs in a follow-up ticket.

## Approach decisions
The Approach decisions of rounds 1 to 4 (`pre-pr-review-1.md` to `pre-pr-review-4.md`, `## Approach decisions`) stand unchanged. This run's tickets settled these, and the review keeps them: the kept restore expires `KEPT_RESTORE_MS`, 10 minutes, after the bridge reports the loss, compared with no timer (#85); a set is named for its date's own weekday, read at midnight UTC (#86); `ON_BAR_LINE_TOLERANCE` is 2e-4 beat and stays apart from the controller's `EPSILON` (#88); reserved folders are compared in any letter case, as review 4 finding 3 recommended (#89); a short name's word drops its edge punctuation, and a pair is the title's own text (#90). This round adds:
- **The kept restore at close (finding 1):** the limit applies on every path that sets kept volumes back, close as well as connect. It uses the same comparison `regain()` makes, `clock.now() - state.since <= KEPT_RESTORE_MS`, with no timer.
- **Time-zone tests (finding 2):** a test that depends on the time zone sets `process.env.TZ` itself, inside `describe.each` over the zones, and puts the old value back in `afterAll`. This was proved to take effect under this repo's vitest 5. It does not depend on a CI step or a script flag.
- **Remediation of findings 1 and 2 (2026-10-20):** both followed the two decisions above as written. The close path's condition is the brief's diff, and its test sits in `describe('the fade out on its own')` beside the inside-the-limit close test, built on `fadeAlone()` as its neighbours are. The time-zone test is the brief's `describe.each`, with no CI or script change.
- **Quoting a printed short name (finding 3), for the follow-up ticket:** keep the double quotes, and escape `"`, `$`, a backtick and `\` with a backslash inside them, as POSIX shell double quotes expect. This changes no line `--list` prints for the library today.

## Prior-review closure
This round is `--fresh`. It reviewed all of run 3's surface and re-checked review 4's findings at HEAD.
- **Review 4, finding 3 (LOW), fully fixed** by #89 (`cbb3bb6`, merged as `5b5031a`). It follows the review's recommended diff, and `6129303` (setlist-controller#89 review pass 1 finding 1) adds the test of the case-insensitive parent comparison. The mutations L2 to L4 turn it red.
- **Review 4, findings 1, 2, 4, 5, 6 and 7 (all LOW), untouched.** This branch does not change their code. Finding 2 was escalated, and run 2's close-out settled the rest without filing them (`docs/HANDOFF-setlist-controller-59.md`, Open items).

No prior finding at MEDIUM or higher is open, so none is partly fixed or untouched at that level, and none was deferred.

## Confirmed Issues

### 1. The server's close still sets a lost fade's volumes back after the 10-minute limit — LOW
- **Location:** `src/server/fade-out.ts:190`. Its comments are at `:11` and `:68-70`.
- **Attribution:** pre-existing and untouched. At the base, `close` restored a `lost` fade unconditionally (`git show f0a97f4:src/server/fade-out.ts | grep -n -A5 "close: () =>"` gives `:177`, the same line). #85 bounded only the connect path, `regain()` at `:141-146`. The branch's new header text at `:12-14` says "A Live that answers later may have another set open, and gets none of the old set's volumes", and the close path contradicts it.
- **Real-world trigger:** Live drops during a fade and does not answer again. More than 10 minutes later the server closes (logout, restart, or the launch agent stopping), and `server.ts:153` calls `fade.close()`. The saved volumes go to Live's OSC port. While Live is gone, nobody hears them. The only Live that gets them is one that started in the last second without answering a probe yet, because any reply calls `regain()` first (`live-bridge.ts:139-146`). There is no plausible user path, so the severity is **LOW, capped**. Raise it if the server ever closes after Live has started but before the bridge reports it connected. Check by reading the order of `live.close()` and the bridge's probe in `src/server/server.ts:150-156`.

**Evidence**
```ts
    close: () => {
      closed = true;
      stopStepping();
      if (state.kind === 'stepping' || state.kind === 'lost') restore(state);
      state = { kind: 'idle' };
    },
```
**Failure mode:** fade out, read two tracks at 0.5 and 0.25, step for 1 s, then Live lost. Advance the clock `KEPT_RESTORE_MS + 1`, then `close()`. The fade sends `['set 0 0.5', 'set 1 0.25']` where it should send `[]`. This was executed with `repro/review-5-close-after-expiry.test.ts`.

**Recommended fix**
```diff
-      if (state.kind === 'stepping' || state.kind === 'lost') restore(state);
+      if (state.kind === 'stepping' || (state.kind === 'lost' && clock.now() - state.since <= KEPT_RESTORE_MS)) restore(state);
```
Then correct the two comments.
- `:11`: change "Whatever ends a fade, each volume goes back." to "Whatever ends a fade, each volume goes back, unless Live has been gone longer than KEPT_RESTORE_MS."
- `:68-69`: change "Stops a fade where it is and sets each saved volume back at once" to "Stops a fade where it is and sets each saved volume back at once, except volumes kept for a Live lost more than KEPT_RESTORE_MS ago".

**Remediation brief**
- **Design intent:** a fade that loses Live keeps its saved volumes in the `lost` state, and `since` records when the bridge reported the loss. These volumes belong to the Live that went away, so they are valid only for `KEPT_RESTORE_MS` after the loss. After that, a Live on the port may have next Sunday's set open, which is built on the same template with the same track indexes. The limit is compared at the moment of use, with no timer. Each path out of `lost` that would send volumes makes the same comparison.
- **Full surface:** `src/server/fade-out.ts:190` (the condition), `:11` and `:68-69` (comments), and `test/fade-out.test.ts`, in `describe('the fade out on its own')` beside the test at `:547`: a new test, the repro's body. `regain()` at `:141-146` already compares and stays as it is.
- **Must preserve:**
  - Close while stepping sets every volume back and sends no step after (`test/fade-out.test.ts:504`).
  - Close after a loss inside the limit sets every saved volume back (`:547`).
  - No fade starts on a press after close (`:563`).
  - Close while reading sends nothing (`:582`).
  - `closed = true` and `stopStepping()` still run first, and `state` always ends `idle`.
  - The #85 limit tests at `:703`, `:709` and `:719` stay green.
  - No new fallback path is added, so no new failure case arises.
- **Do not touch:** a second `lose()` while `lost` returning early (Reviewed and Dismissed), and the repeated drop-and-reconnect that renews `since` (Reviewed and Dismissed).
- **Proof:** `cp docs/reviews/setlist-controller-59/repro/review-5-close-after-expiry.test.ts test/ && pnpm exec vitest run test/review-5-close-after-expiry.test.ts; rm test/review-5-close-after-expiry.test.ts`. It is red now and must be green after. Then `pnpm exec vitest run test/fade-out.test.ts` is green with the new test in it.

### 2. #86's time-zone guard exists only in a comment: nothing runs the weekday test in another zone, so a time-zone bug passes CI and this Mac — LOW
- **Location:** `test/set-name.test.ts:4-5`. The rule it should pin is `src/set-builder/build-set.ts:73` and `:77`.
- **Attribution:** introduced. `5896aef` (setlist-controller#86 The command names a set "<date> Sunday" whatever weekday its --date falls on) added the file. `git grep -n "Kiritimati\|Pago\|TZ="` finds only that comment, and nothing in `package.json`, `vitest.config.ts` or `.github/workflows/ci.yml` sets `TZ`.
- **Real-world trigger:** none today, because `setName` is correct. The risk is a later edit. Parsing the date as local midnight (`T00:00:00` with no `Z`) would name a Sunday set "Saturday" for anyone east of UTC+5 or so. Using `getDay()` would name it "Saturday" anywhere west of UTC, which includes the Mac. Either edit passes `pnpm test` in CI (UTC), and the local-midnight one also passes on the Mac (America/New_York). Severity **LOW, capped**: this is a claim of test coverage the branch does not have, with no user path until the code changes.

**Evidence**
```ts
// The weekday is read from the date's own parts, so these hold whatever time zone the tests run in: this file also runs
// as TZ=Pacific/Kiritimati (UTC+14) and TZ=Pacific/Pago_Pago (UTC-11).
```
**Failure mode:**
- With `repro/review-5-mutation-setname-local-midnight.diff` applied, `test/set-name.test.ts` passes 7/7 in UTC, America/New_York and Pacific/Pago_Pago. Only Pacific/Kiritimati catches it.
- With `repro/review-5-mutation-setname-getday.diff` applied, it passes 7/7 in UTC and Pacific/Kiritimati.

**Recommended fix:** in `test/set-name.test.ts`, delete the comment at `:4-5`, import `afterAll` and `beforeAll`, and run the weekday cases in each zone:
```diff
-import { describe, expect, it } from 'vitest';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { setName } from '../src/set-builder/build-set.ts';
 
-// The weekday is read from the date's own parts, so these hold whatever time zone the tests run in: this file also runs
-// as TZ=Pacific/Kiritimati (UTC+14) and TZ=Pacific/Pago_Pago (UTC-11).
-describe("the set's name", () => {
+describe.each(['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'])("the set's name in %s", (zone) => {
+  const before = process.env.TZ;
+  beforeAll(() => {
+    process.env.TZ = zone;
+  });
+  afterAll(() => {
+    if (before === undefined) delete process.env.TZ;
+    else process.env.TZ = before;
+  });
+
   it.each([
```
Leave the `it.each` rows and the throw test unchanged. The throw test is not tied to a time zone, so it may stay in the zone loop or move to its own `describe`.

**Remediation brief**
- **Design intent:** `setName` reads the weekday from the date's own parts, by parsing `YYYY-MM-DDT00:00:00Z` and taking `getUTCDay()`, so the Mac's time zone never moves a set to another day. The two zones cover both directions a mistake can take. UTC+14 catches a local-midnight parse, and UTC-11 catches a local `getDay()`. The test has to put itself in those zones, because CI runs in UTC and the Mac in America/New_York. Setting `process.env.TZ` at runtime takes effect under this repo's vitest 5: a probe that set it in `beforeAll` saw a local-midnight parse fail under Kiritimati.
- **Full surface:** `test/set-name.test.ts:1-20` only. No `src/` change.
- **Must preserve:**
  - The four weekday rows and the three not-a-date rows, with their titles and expected strings.
  - `process.env.TZ` is restored after the file, so no other test file in the same worker inherits a zone.
  - The weekday rows in `test/set-builder-command.test.ts:79-92` stay as they are.
- **Do not touch:** the harness's `projectFolder` and `setPath` through `setName` (`test/set-builder-harness.ts:75-81`, Reviewed and Dismissed).
- **Proof:** for each of the two diffs, `git apply docs/reviews/setlist-controller-59/repro/review-5-mutation-setname-local-midnight.diff && pnpm exec vitest run test/set-name.test.ts; git apply -R docs/reviews/setlist-controller-59/repro/review-5-mutation-setname-local-midnight.diff`, then the same with `review-5-mutation-setname-getday.diff`. Each run is green now with no `TZ` set, and must be red after the fix. With no mutation applied, `pnpm exec vitest run test/set-name.test.ts` is green.

### 3. A printed short name with `"`, `$`, a backtick or `\` in it does not reach the command as printed — LOW
- **Location:** `src/set-builder/song-list.ts:31`. The promise it breaks is at `:27` ("so that it goes onto a command as printed") and in `src/set-builder/main.ts:43`.
- **Attribution:** pre-existing and untouched in kind. At the base, `Say "Yes" Lord` printed `""yes""`, which the shell reads as `yes`, a name that matches three folders. HEAD prints `"yes" lord"`, which the shell cannot parse, because #90's pair is now the title's own text (`9a579e0`). The base quotes the same way: `git show f0a97f4:src/set-builder/song-list.ts | grep -n 'shortName}"'`.
- **Real-world trigger:** a song folder with a double quote, a `$`, a backtick or a backslash in its title. The library's seven titles have none (`ls ~/Music/MultiTracks`), so there is no user path today. Severity **LOW, capped**: raise it if a MultiTracks download ever names a folder with one of those characters (`ls ~/Music/MultiTracks | grep -E '["$\`\\]'`). A backtick runs a command when the skill passes the line to Bash, so treat that case as the one that matters.

**Evidence**
```ts
  return [/^[a-z0-9]+$/.test(shortName) ? shortName : `"${shortName}"`, key ?? 'no key', folder].join('  ');
```
**Failure mode:**
- A library of `Say "Yes" Lord-E-G-70.00bpm`, `Say Yes-E-G-70.00bpm`, `Yes Lord-E-G-70.00bpm` and `Lord Say-E-G-70.00bpm` lists `"yes" lord"  G  Say "Yes" Lord-E-G-70.00bpm`. `bash -c 'set -- "yes" lord"'` fails: "unexpected EOF while looking for matching `"'".
- `"ke$ha"` reaches the command as `ke`.
- A title with `` `echo X` `` in it runs `echo X`.

**Recommended fix**
```diff
-  return [/^[a-z0-9]+$/.test(shortName) ? shortName : `"${shortName}"`, key ?? 'no key', folder].join('  ');
+  return [/^[a-z0-9]+$/.test(shortName) ? shortName : `"${shortName.replace(/["$`\\]/g, '\\$&')}"`, key ?? 'no key', folder].join('  ');
```
**Remediation brief**
- **Design intent:** the skill copies a listed short name onto a `pnpm build-set` command exactly as printed, and the shell gives the command the name. A name of only lowercase letters and digits prints bare. Any other name prints in double quotes. Inside double quotes, POSIX shells treat only `"`, `$`, a backtick and `\` specially, and each is literal after a backslash. So escaping those four makes every printed name reach the command intact. The name itself, and how `matchSongs` matches it, do not change.
- **Full surface:**
  - `src/set-builder/song-list.ts:31`.
  - The comment at `:26-27`, which should say the four characters are escaped.
  - The `--list` paragraph of `USAGE`, `src/set-builder/main.ts:42-46`.
  - `.claude/skills/build-set/SKILL.md:15` ("quotes included"), which should say backslashes included.
  - A new test in `describe('pnpm build-set --list')` (`test/set-builder-command.test.ts:537`): list the four folders above, and check that the printed name, passed through `/bin/sh -c 'printf %s <name>'`, gives back `yes" lord`, which matches only its own folder through `matchSongs`.
- **Must preserve:** every line the existing `--list` tests expect, including the `+` and `&` rows and the two-spaces test, since none holds one of the four characters. The seven listing lines in the skill's worked examples (`SKILL.md:71-77`) also stay the same.
- **Do not touch:** the `named[0] === folder` guard (`song-list.ts:68`, Reviewed and Dismissed).
- **Proof:** the new command test is red now (the shell fails or gives back another string) and green after. `pnpm exec vitest run test/set-builder-command.test.ts` passes.

### 4. Comment hygiene — LOW (aggregated)
- `src/set-builder/timeline.ts:103-104`: "…of silence before a pad after it, and Trust In God's ends on 549.0001017, 1.0172e-4 beat, about 4 samples at its 74 BPM, past its bar line at 549." → "…of silence before a pad after it. Trust In God's ends on 549.0001017, 1.0172e-4 beat, about 4 samples at its 74 BPM, past its bar line at 549." The Trust In God figure is a second example, not part of Goodness of God's consequence.
- `src/set-builder/library.ts:9` and `:34`: "in any letter case, as the Mac's disk opens them" → "in any letter case, as `toLowerCase` folds it, which is how the Mac's disk opens an ASCII name such as `_Pads`". The disk also folds `ß` and `SS`, the final sigma, and NFD against NFC, and the comparison does not (see nits).

## Needs Further Investigation

### A. A build, not only `--list`, with the pads in a folder named in another letter case — confirm in the acceptance run (#71)
`padsFolder` is unchanged, and the Mac's disk opens `_Pads` for `_pads`, so the build should read the pads from it. No build ran here, because one needs real song fixtures. A build in #71 with the pads folder named `_Pads` confirms it.

### B. Review 4's investigations A to G, unchanged — confirm in #71 and #76
This branch does not touch their code.

## Reviewed and Dismissed
- A Live that drops again within 5.1 s of each reconnect renews `since`, so the kept volumes can outlast 10 minutes from the first loss. Each restore really may not have been handled, and #85 measures from "that loss", the most recent one.
- A second `lose()` while `lost` returns early and does not renew `since`. This is unreachable: the bridge sends `connected: false` only when it goes from connected to not (`src/server/live-bridge.ts:127-131`).
- An expired `lost` state blocking a later fade. `regain()` sets `idle` before it compares, and `test/fade-out.test.ts:709` pins it (mutation F5).
- The fade's clock stopping while the Mac sleeps, which would make a week look like minutes. On this Mac the monotonic clock counts sleep (see the table).
- `ON_BAR_LINE_TOLERANCE` (2e-4) differing from the controller's `EPSILON` (1e-4). The controller never sees an audio end. Every locator the builder writes is an exact bar line, and `git grep ON_BAR_LINE_TOLERANCE` finds only `timeline.ts`.
- `setName`'s throw reaching a user. Its only callers are `buildSet` (`build-set.ts:93`), called only from `main.ts:125`, and the summary (`main.ts:157`). `main.ts:107` rejects such a date with `isDate` first, and the `try` at `main.ts:124-148` would catch it in any case. The throw has a test (`test/set-name.test.ts:17-19`).
- `named.length === 1 && named[0] === folder` (`src/set-builder/song-list.ts:68`) can no longer fail on its second half, because every candidate is cut from the folder's own title. The comment above `shortName` says it stays deliberately, so a listed name can never build another song. Do not remove it in a cleanup.
- The harness's `projectFolder` and `setPath` now go through production `setName` (`test/set-builder-harness.ts:75-81`), so an expected path agrees with production by construction. The new weekday test checks the literal path and first line (`test/set-builder-command.test.ts:79-92`), and changing the name format turns 14 tests red.
- A pair across a lone `&` or `+`. A token with no letter or digit is `undefined`, and no pair spans it, as at the base (`Hope & Glory` executed).
- #87 adding no ask for two pads on one song change. That item was dropped from #87 under eng-pipeline#34.

## Minor / nits
- `setName`'s validity check (`src/set-builder/build-set.ts:73-76`) repeats `isDate` (`src/set-builder/main.ts:177-181`) line for line. One shared predicate would keep the two from drifting apart.
- The `--list` paragraph of `USAGE` (`src/set-builder/main.ts:45-46`) says `_template, _pads and a --pads folder in the library are no song folders` without "in any letter case".
- These `--pads` folders still list as songs:
  - a non-ASCII name typed in another folding or Unicode form (`Straße` as `STRASSE`, `ΟΔΟΣ` as `οδοσ`, NFD against NFC)
  - a folder given through a symlinked library path, or through `/tmp` where the library is under `/private/tmp`, as at the base

  The reserved `_template` and `_pads` are ASCII and are not affected.
- A pictograph followed by U+FE0F keeps the selector at a word's edge, since `\p{M}` includes it. `Peace🕊️` lists as `"peace🕊️"`, as at the base.
- #90's rule makes a few short names longer. `(Live)` beside `Live Forever` now falls to the whole folder name, and `Holy, (Holy)` beside `Holy Holy` lists as `"holy, (holy"`. Each still matches its own folder alone.
- The tolerance tests pin a band, 1.0172e-4 to below 3e-4, not 2e-4 itself: the mutations 1.1e-4 and 2.9e-4 survive. That fits #88's "at most this tolerance".
- The `--date` validation test (`test/set-builder-command.test.ts:466`) now also checks the usage text's new sentence. It checks help text, and it rides on a test about another rule.

## Test quality
22 tests added or changed. 19 are red at `f0a97f4`. 3 are green there, all boundary or preservation tests from the lane commits, and none is a review finding's proof:
- `_pads old` is still a song (`test/set-builder-command.test.ts:708`, `cbb3bb6`), killed by a prefix-match mutation.
- 318.0003 still rounds up (`test/set-builder-pad.test.ts:616`, `b4c44a1`), killed by a tolerance of 5e-4.
- `2026-10-18 Sunday` (`test/set-name.test.ts:7`, `5896aef`), killed by a format change.

Tautology shapes found: 0. Nothing mocks the unit under test, asserts only that something was called, snapshots, or asserts nothing. The one coverage gap is finding 2: the time-zone half of #86 runs in UTC or America/New_York only, where its two plausible mutations survive.

## Before opening the PR
- **CI readiness:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass at HEAD, and so does `pnpm test:e2e`.
- **Commit hygiene:** the branch's 17 commits are lane commits, merges and one review-pass fix, each opening with its ticket reference. Commit this doc and its three new files in `repro/`.
- **Likely reviewer asks:** whether the close path honours #85's limit (finding 1). Why a test file claims time-zone runs that CI does not do (finding 2). Whether #87's read-through ran in fresh sessions, which belongs to #71.

## Verdict
**Ready to open a PR with follow-ups.** No finding blocks it: zero CRITICAL, HIGH or MEDIUM. Findings 1 and 2 are in this run's own surface and take one small commit each, so fix them before the PR to keep #85's and #86's claims true. Finding 3 is older and has no user path in today's library: file it as a follow-up ticket. Finding 4 is one batch commit of comment text. Review 4 finding 3 is fully fixed by #89. The rest of review 4's findings are untouched and were settled at run 2's close-out. No finding was "resolved" only by editing a comment.

## Remediation — 2026-10-20
Scope: findings 1 and 2 only, the LOW tail Nick opted in to at the run's close-out. Findings 3 and 4 and the nits stay unfixed, by that decision.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (LOW) | `9ebd24f` setlist-controller#59 pre-PR review 5 finding 1: the server's close still sets a lost fade's volumes back after the 10-minute limit | red→green: the repro body, added to `test/fade-out.test.ts` as "sends no saved volume when the server closes more than 10 minutes after Live went away mid-fade", failed with `expected [ 'set 0 0.5', 'set 1 0.25' ] to deeply equal []` and passes after. `repro/review-5-close-after-expiry.test.ts` copied into `test/` is green after. `pnpm exec vitest run test/fade-out.test.ts` 32/32 | 0 new. The two comments at `:11` and `:68-69` carry the brief's corrections and were reflowed to the file's width | proved by execution |
| 2 (LOW) | `512bcfa` setlist-controller#59 pre-PR review 5 finding 2: #86's time-zone guard exists only in a comment, so nothing runs the weekday test in another zone | red→green: before the fix, the local-midnight mutation passed 7/7 on this Mac and the getday mutation passed 7/7 under `TZ=UTC`. After the fix, each mutation fails 4 of 21 both with no `TZ` and with `TZ=UTC`, and the unmutated file passes 21/21 both ways | 0 (the comment at `:4-5` is deleted) | proved by execution |

Full checks after both commits, after `pnpm install --frozen-lockfile`: `pnpm lint`, `pnpm typecheck`, `pnpm test` (33 files, 671 passed, 3 skipped), `pnpm build` and `pnpm test:e2e` (30 passed) all exit 0.

One correction to finding 2's proof line: the getday mutation was already red on this Mac with no `TZ` set (4 of 7 failed), because America/New_York is west of UTC. It survived only under `TZ=UTC`, which is CI's zone, so the gap the finding names was real for CI.

No fix qualified for agent verification: both are LOW, both proofs ran red then green in the repo's runner, and neither touched a shared computation core or a symmetric surface.

### Known regressions, deferred
None.

### Rework briefs
None. No rework pass ran.
