# Pre-PR review: setlist-controller#225 Chord and lyric view

**Branch:** `setlist-controller-225-chord-and-lyric-view` vs `origin/main` (merge-base `4c608d5`)
**Reviewed at:** HEAD `6edac05` (setlist-controller#403 Chart view: Nashville numbers and a capo per song) + 0 files with uncommitted changes, 0 untracked files, 84 files total, +7551 / −123
**Reviewed against:** the epic body of setlist-controller#225 (the spec), the bodies of sub-issues #395 to #405, the recorded ticket assumptions in `.epic-loop/tickets/*/assumptions.md` (confirmed by Nick in `.epic-loop/closeout.md`). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the spec and the five universal rules are the checklist. No prior review doc for this epic.
**Date:** 2026-11-11
**Reviewer:** 3 code-review agents + 1 tautology-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | run in the worktree | already up to date |
| `pnpm lint` | run at 6edac05 | green |
| `pnpm typecheck` | run at 6edac05 | green |
| `pnpm test` | run at 6edac05 | green, 93 files, 2758 passed, 4 skipped, no flakes |
| `pnpm build` | run at 6edac05 | green |
| `pnpm test:e2e` | run at 6edac05, both projects | green, 138 of 138 passed, no flakes |
| Server, shared matching, server tests | finder agent over 27 files, 6 vitest files run, one executed probe of the manifest reader | finding 4 confirmed by execution; the rest Low or dismissed |
| Set builder, heading rule, docs | finder agent over 26 files, 8 vitest files run, one executed probe over the fixture library | findings 5, 6, 7, 8 and Needs Further Investigation A |
| Chart module and browser chart view | finder agent over 31 files, four executed probes of `chart.ts`, `transpose.ts`, `chart-blocks.ts`, `chart-strip.ts` | transposition over 15 major spellings and 13 minors, numbers, capo shapes, parser, blocks and strip all clean; finding 1 and several Low items |
| ProPresenter refactor onto `src/shared/occurrence.ts` | line-by-line comparison with base (`groupsNamed`/`groupFor` against `itemsNamed`/`itemFor`), plus `test/propresenter.test.ts`, which the branch does not touch, passing unchanged | behaviour identical; no differential harness built, since the unchanged suite is the execution proof the #395 ticket asked for |
| Fixture library meters | `startingMeter` over the four songs in `test/fixtures/set-builder/library` | Goodness of God 4/4, Great Are You Lord 6/8, This Is Amazing Grace 4/4, Trust In God 6/8 |
| Fixture library locator names | `readSong` plus `songSkeleton` over the same four songs | Great Are You Lord leaves out Pre Chorus, Breakdown and Outro; This Is Amazing Grace leaves out Outro |
| Repros for findings 1, 3, 4, 5, 6 | `repro/pre-pr-review-1.test.ts`, run in a scratch worktree at 6edac05 | 7 of 8 cases red at HEAD (the eighth, a `[ ]` chart, agrees today and guards the shared predicate) |
| Tautology audit | the branch's 43 new or modified test files and helpers copied into a scratch worktree at `4c608d5`; vitest over all 29 test files, Playwright `webkit-ipad` over the 4 specs that load at base | 99 new or modified tests green at base, 96 of them legitimate guards on pre-existing build-set skill traces; finding 2 holds the rest |
| Chromium for the tautology audit's e2e at base | not run | the audit ran `webkit-ipad` only, to bound its cost |
| Real Planning Center response carrying `chord_chart` and `chord_chart_key` on the included Arrangement | not run | needs a live recording; see Needs Further Investigation B |

**Overall:** The branch does what the spec asks, and the hard parts hold up under execution: transposition, Nashville numbers, capo shapes, the parser, the occurrence matcher, the manifest write and read contract, the viewer-only socket and the Charts check's exclusions. Two MEDIUM findings gate the PR. In the two 6/8 songs of the fixture library, every block but the current one shows the wrong bar count. Four new tests cannot go red for the behaviour they name. Seven LOW findings can ride with that remediation or go to follow-up tickets.

## Approach decisions
- Bar counts of blocks other than the current one: the set manifest carries each song's starting meter, written by the build from `SongSummary.meter`, and a block divides its beats by that meter's beats per bar (`numerator * 4 / denominator`), the formula `src/server/playback-controller.ts:229` (`barLength`) uses. A manifest song with no meter counts 4/4. This **overturns** the #396 assumption "Bar counts: every block but the current one counts 4/4 bars from its locator times" (`.epic-loop/tickets/396/assumptions.md`, confirmed in close-out decision 2), on the evidence that 2 of the 4 fixture library songs are in 6/8. If Nick keeps the 4/4 assumption, finding 1 is withdrawn rather than fixed.
- Which manifest song a set song takes: the nth set song of a title takes the nth manifest song of that title, or the last of them for a set song past it, by the name rule. This is the occurrence rule of `src/shared/occurrence.ts` (`itemFor`), applied to songs and titles.
- Whether a chart has chords: one shared predicate over the parsed chart in `src/shared/chart.ts`, a lyrics chunk whose chord holds a non-space character. `--plan --list` and the Charts check both call it.
- A rejected step in a promise chain that later steps follow: `.catch` and log, so the chain never stays rejected, as `src/server/lateness-log.ts:86` does for its write queue.

## Confirmed Issues

### 1. Every block but the current one counts its bars in 4/4, so a 6/8 song's section map shows the wrong bar counts — MEDIUM
- **Location:** `web/src/chart-blocks.ts:20-22`, `web/src/chart-blocks.ts:39`, shown at `web/src/ChartView.tsx:162-166`
- **Attribution:** introduced by 7f6b875 (setlist-controller#396 Chart view: a part picker and one block per locator in played order), as a recorded assumption. `git log -S'const BAR = 4' 4c608d5..HEAD` names that commit first; the file is new on the branch.
- **Real-world trigger:** a 6/8 song in the set, such as Great Are You Lord or Trust In God in the fixture library, with a drummer on the Section map display, or any band member reading ahead. Live measures a 6/8 bar as 3 beats (`barLength`), so an 8-bar Verse is 24 beats, and the block reads "6 bars". When the highlight reaches the block, its count changes to Live's own "8 bars" (`now.bars`), and changes back when it leaves.

**Evidence**
```ts
// The snapshot carries no song's meter, so a block counts 4/4 bars; the current block takes Live's
// own count from now.bars.
const BAR = 4;
...
      bars: end === null ? null : Math.ceil((end - section.time) / BAR - EPSILON),
```

**Failure mode** — Executed in `repro/pre-pr-review-1.test.ts`, "counts an 8-bar Verse of a 6/8 song (24 beats, 3 beats a bar) as 8 bars": `AssertionError: expected 6 to be 8`. The section map is the drummer's whole display (spec user story 5), so a wrong number there is a wrong result delivered silently. The server knows each song's meter only once the playhead has played in it (`meters` in `playback-controller.ts:229-240`), but the build knows each song's starting meter before the service (`SongSummary.meter`, which `startingMeter` reads from the song's Live set).

**Recommended fix**
```diff
--- a/src/shared/set-manifest.ts
+++ b/src/shared/set-manifest.ts
 export type ManifestSong = {
   title: string;
   stemsKey: string | null;
+  meter?: string;
   chartKey?: string;
   chartText?: string;
 };
@@ parseSetManifest
-  return { manifest: { songs: songs.map(({ title, stemsKey, chartKey, chartText }) => ({ title, stemsKey, ...(chartKey === undefined ? {} : { chartKey }), ...(chartText === undefined ? {} : { chartText }) })) } };
+  return { manifest: { songs: songs.map(({ title, stemsKey, meter, chartKey, chartText }) => ({ title, stemsKey, ...(meter === undefined ? {} : { meter }), ...(chartKey === undefined ? {} : { chartKey }), ...(chartText === undefined ? {} : { chartText }) })) } };
 }
+
+export function beatsPerBar(meter: string | undefined): number {
+  const parts = /^(\d+)\/(\d+)$/.exec(meter ?? '');
+  const numerator = Number(parts?.[1]);
+  const denominator = Number(parts?.[2]);
+  return numerator > 0 && denominator > 0 ? (numerator * 4) / denominator : 4;
+}
@@ isManifestSong
-  const { title, stemsKey, chartKey, chartText } = value;
+  const { title, stemsKey, meter, chartKey, chartText } = value;
   return (
     typeof title === 'string' &&
     (stemsKey === null || typeof stemsKey === 'string') &&
+    (meter === undefined || typeof meter === 'string') &&
--- a/src/set-builder/set-manifest.ts
+++ b/src/set-builder/set-manifest.ts
-    songs: songs.map(({ folder, title }, index): ManifestSong => {
+    songs: songs.map(({ folder, title, meter }, index): ManifestSong => {
...
         stemsKey: stems.ok ? stems.key : null,
+        meter,
--- a/web/src/chart-blocks.ts
+++ b/web/src/chart-blocks.ts
-const BAR = 4;
...
-export function chartBlocks(set: SetList, songNumber: number, chart: readonly ChartSection[] = []): ChartBlock[] {
+export function chartBlocks(set: SetList, songNumber: number, chart: readonly ChartSection[] = [], beats = 4): ChartBlock[] {
...
-      bars: end === null ? null : Math.ceil((end - section.time) / BAR - EPSILON),
+      bars: end === null ? null : Math.ceil((end - section.time) / beats - EPSILON),
--- a/web/src/ChartView.tsx
+++ b/web/src/ChartView.tsx (SongChart)
+  const meter = beatsPerBar(charts?.songs.find((candidate) => song.title !== null && namesMatch(candidate.title, song.title))?.meter);
...
-        {chartBlocks(set, song.number, chart).map((block) => {
+        {chartBlocks(set, song.number, chart, meter).map((block) => {
```
Update the comments at `web/src/chart-blocks.ts:12-13` and `:20-21`, and the manifest's description at `src/shared/set-manifest.ts:3-4`, to say the block counts in the song's starting meter from the manifest, 4/4 when it has none.

**Remediation brief**
- **Design intent:** the set manifest is the build's per-song record for the band pages (title, stems key, chart key, chart text), written whole on every successful build and read by the server, which serves it on `/api/charts`. The chart view's blocks come from the snapshot's locator times, in beats. The current block shows Live's own count (`now.bars`), so it is always right; the other blocks need the song's beats per bar, which only the build knows ahead of play. A song that changes meter mid-song is counted in its starting meter, as the build's summary reports it.
- **Full surface:** `src/shared/set-manifest.ts:11-18` (type), `:26` (`NOT_READABLE` names the fields: add "a meter" only if its pin in `test/set-manifest.test.ts` is updated with it), `:38` (parse), `:49-58` (`isManifestSong`), a new `beatsPerBar`; `src/set-builder/set-manifest.ts:10-25` (`buildManifest` and its comment); `web/src/chart-blocks.ts:12-13, 20-22, 27, 39`; `web/src/ChartView.tsx:137-141` and `:155` (`SongChart`). The manifest's field list in prose: `README.md:110`, `docs/install.md:328`, the usage text at `src/set-builder/main.ts:91-95`, each with its pinning test (`test/readme-chart-view.test.ts`, `test/set-builder-command.test.ts`). Expected manifests in `test/set-builder-charts.test.ts` (`PHASE_0_SONGS` at :121 and the by-names manifest) gain each song's `meter`.
- **Must preserve:** the current block's count from `now.bars` (`ChartView.tsx:162-163`); End's null bar count and the last-section-of-the-set null (`chart-blocks.ts:34, 43`); 4/4 for a manifest song with no `meter`, so the e2e fixture manifests in `test/fixtures/set-manifest/` and every e2e spec's bar counts stay as they are; a manifest whose `meter` is not a string is unreadable as a whole, like any other wrong field; `test/chart-blocks.test.ts` (all 4/4), `test/set-manifest.test.ts`, `test/start-up.test.ts`, `test/set-builder-charts.test.ts`, `e2e/chart.spec.ts`, `e2e/chart-strip.spec.ts`.
- **Do not touch:** the strip's countdown (`web/src/chart-strip.ts`), which already counts from `now.bars`; the server's `barLength`.
- **Proof:** `cp docs/reviews/setlist-controller-225/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t "finding 1"; rm test/pre-pr-review-1.test.ts`. Red now (`expected 6 to be 8`), green after. Move the case into `test/chart-blocks.test.ts`, and add a `test/set-builder-charts.test.ts` case that reads back `meter: '6/8'` for Great Are You Lord, plus a `beatsPerBar` table (`'6/8'` 3, `'3/4'` 3, `'4/4'` 4, `undefined` 4, `'x'` 4).

### 2. Three new tests cannot go red for the behaviour they name — MEDIUM
- **Location:** `e2e/chart-settings.spec.ts:172-177`, `test/device-settings.test.ts:124-150` (the display key), `e2e/view-only.spec.ts:58-69`
- **Attribution:** introduced by a1c2689 (setlist-controller#404), 7f6b875 (setlist-controller#396) and the #401 display storage. None was added as a review finding's proof (`git log -S` on each test name).
- **Real-world trigger:** none for users. The cost is a claim of coverage the branch does not have: a tip shown or stored on the leader page, or a renamed display storage key that resets every band member's display on the next service, would pass the suite.

**Evidence**
```ts
test('the Auto-Lock tip is not on the leader page', async ({ page }) => {
  e2e = await startE2eRig({ position: 10 }, SET);
  await page.goto(e2e.leaderUrl);
  await expect(page.locator('.song')).toHaveCount(3);
  await expect(tip(page)).toHaveCount(0);
```

**Failure mode** — The tautology audit copied the branch's tests into a checkout at `4c608d5`. "the Auto-Lock tip is not on the leader page" passes there, where no page has a tip at all. "the leader path typed with no secret opens the view-only page, with no control of Live" passes there too: its new comment says "Its one control is the Part select", but the test asserts only zero buttons, which base already met. `test/device-settings.test.ts:150` reads the display key back from the module's own write (`[...storage.entries.keys()][0]`), so no test pins `setlist-controller.display.<Part>`. The part key is pinned by `e2e/chart-settings.spec.ts:160`; the display key is pinned nowhere.

**Recommended fix**
- `e2e/chart-settings.spec.ts:172`: after the leader page's zero-tip check, in the same page, `await page.goto(e2e.viewerUrl)` and `await expect(tip(page)).toBeVisible()`, so the test proves the tip is live and that the leader visit neither showed it nor stored it as shown.
- `e2e/view-only.spec.ts:58-69`: inside the loop, after the zero-button check, `await expect(page.getByRole('combobox')).toHaveCount(1)` and `await expect(page.getByLabel('Part')).toBeVisible()`, as the first test does at :24-25.
- `test/device-settings.test.ts`: in the display store test, `expect([...storage.entries.keys()]).toEqual(['setlist-controller.display.Keys'])` after `storeDisplay(storage, 'Keys', ...)`, as the view, font size, chord names and capo tests already pin theirs.

**Remediation brief**
- **Design intent:** each device stores its settings in `localStorage` under fixed keys (`web/src/device-settings.ts:15, 55, 86, 118, 139, 168`); a key is a contract with every phone that already stored a value. The Auto-Lock tip shows once per device, on the view-only page only (`web/src/AutoLockTip.tsx`, `TIP_KEY`).
- **Full surface:** the three tests above; no production code.
- **Must preserve:** every assertion the three tests already make; the tip's once-per-device behaviour pinned by the other tests in `e2e/chart-settings.spec.ts`.
- **Do not touch:** `test/chart-blocks.test.ts:134-139` (Reviewed and Dismissed: redundant, not vacuous).
- **Proof:** each strengthened test passes at HEAD and fails at `4c608d5`: in a scratch `git worktree add --detach <scratchpad>/base 4c608d5`, copy the three files in and run `pnpm exec playwright test e2e/chart-settings.spec.ts e2e/view-only.spec.ts --project=webkit-ipad` after `pnpm build`, and `pnpm exec vitest run test/device-settings.test.ts` (red at base by import, so for the vitest case the proof is a mutant: change `displayKey` in `web/src/device-settings.ts:55` and see the test go red).

### 3. A song that appears twice in the set takes the first manifest entry of its title, its chart and its stems key — LOW
- **Location:** `src/shared/set-manifest.ts:41-47`, called at `src/server/charts.ts:57` and `web/src/ChartView.tsx:137`
- **Attribution:** introduced by fb26535 (setlist-controller#397). New file.
- **Real-world trigger:** a set that lists one song twice, such as a reprise, from two library folders in different keys or two Planning Center arrangements of which only one has a chart. Both set songs take the first manifest entry: the second's chords are moved to the first folder's stems key, or both say "No chart for this song". Capped at LOW: upgrade to MEDIUM if any real plan lists one song twice (check `--plan --list` output for a repeated title).

**Evidence**
```ts
// The manifest song holding the chart for the set's song of this title: the first whose title matches
// by the name rule and that has chart text. None for a song with no title.
export function chartForSong(songs: readonly ManifestSong[], title: string | null): ManifestSong | undefined {
  if (title === null) return undefined;
  const song = songs.find((candidate) => namesMatch(candidate.title, title));
  return song?.chartText === undefined ? undefined : song;
}
```

**Failure mode** — The comment promises the first match with chart text; the code takes the first match and gives up when it has none. Executed in `repro/pre-pr-review-1.test.ts`, "finding 3": with manifest entries `Made Up Song` (no chart, stems G) and `made up song` (a chart, stems A), the second set song of that title gets no chart and no stems key A. The manifest is written in set order, one entry per built song, so the nth set song of a title has its own nth entry.

**Recommended fix**
```ts
export function manifestSongFor(songs: readonly ManifestSong[], titles: readonly (string | null)[], index: number): ManifestSong | undefined {
  const title = titles[index];
  if (title === null || title === undefined) return undefined;
  const occurrence = titles.slice(0, index + 1).filter((each) => each !== null && namesMatch(each, title)).length;
  const named = songs.filter((candidate) => namesMatch(candidate.title, title));
  return named[Math.min(occurrence, named.length) - 1];
}

export function chartForSong(songs: readonly ManifestSong[], titles: readonly (string | null)[], index: number): ManifestSong | undefined {
  const song = manifestSongFor(songs, titles, index);
  return song?.chartText === undefined ? undefined : song;
}
```
Callers pass the set's titles and the song's index: `charts.ts:55` loops `for (const [index, song] of set.songs.entries())` and calls `chartForSong(songs, set.songs.map(({ title }) => title), index)`; `SongChart` in `ChartView.tsx` finds its index with `set.songs.findIndex((each) => each.number === song.number)`. Finding 1's meter lookup in `SongChart` goes through `manifestSongFor` too. Rewrite the comment at :41-42 to state the occurrence rule.

**Remediation brief**
- **Design intent:** a chart reaches a set song by its title, by the name rule, against the Count Off locator's title (spec). The manifest lists the built songs in set order, so occurrence order lines the nth set song of a title up with the nth manifest song of that title. A set song past the last manifest song of its title takes that last one, so a manifest that lists a song once still serves both of its plays.
- **Full surface:** `src/shared/set-manifest.ts:41-47`; `src/server/charts.ts:55-59` (the loop and the call; the `inManifest` test at :59 stays a title test); `web/src/ChartView.tsx:137` (and the meter lookup finding 1 adds there); `test/set-manifest.test.ts:87` ("takes the first of two songs whose titles match") moves to the new signature.
- **Must preserve:** a set song with no title gets no chart; a set whose manifest lists each song once behaves exactly as today; the Charts check's `no chart` and `not in the set manifest` Problems lines (`charts.ts:85-90`), pinned in `test/charts-check.test.ts`.
- **Do not touch:** the strict name rule (`src/shared/match-name.ts`).
- **Proof:** `cp docs/reviews/setlist-controller-225/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t "finding 3"; rm test/pre-pr-review-1.test.ts`. Two cases red now, green after. Move them into `test/set-manifest.test.ts`.

### 4. One throw while acting on a manifest change stops every later read and raises an unhandled rejection — LOW
- **Location:** `src/server/set-manifest.ts:38-49`, with the unawaited callers at `:62` and `src/server/server.ts:281`
- **Attribution:** introduced by fb26535 (setlist-controller#397). New file.
- **Real-world trigger:** none known. `onChange` runs `publish()` and `charts?.changed()`, and no path that throws was found. Capped at LOW: upgrade if `hub.publish` or a target's `fileChanged` can throw.

**Evidence**
```ts
  const reload = () => {
    reading = reading.then(async () => {
      const next = await read(path);
      if (closed || next.text === last.text) return;
      last = next;
      revision += 1;
      report(path, last);
      onChange();
    });
    return reading;
  };
```

**Failure mode** — Once a step rejects, `reading` stays rejected and every later `.then` is skipped, so neither the watch nor Refresh ever reads the manifest again, and the pages keep the old charts. Each `void reload()` is an unhandled rejection, which ends a Node process by default. Executed in `repro/pre-pr-review-1.test.ts`, "finding 4": after `onChange` threw once, a later change is never read (`expected [ 'A' ] to deeply equal [ 'B' ]`).

**Recommended fix**
```diff
-    reading = reading.then(async () => {
+    reading = reading
+      .then(async () => {
         const next = await read(path);
         if (closed || next.text === last.text) return;
         last = next;
         revision += 1;
         report(path, last);
         onChange();
-    });
+      })
+      .catch((error: unknown) => {
+        console.error(`Setlist server: could not act on a change to the set manifest at ${path}`, error);
+      });
     return reading;
```

**Remediation brief**
- **Design intent:** reads run one at a time in the order asked, so a slow read never lands after a later one; the revision rises and `onChange` runs only when the file's text, or its absence, changed. A failed step must leave the queue usable for the next one.
- **Full surface:** `src/server/set-manifest.ts:39-49`.
- **Must preserve:** read order; the revision rising only on a changed text; no `onChange` after `close()`; `reload()` still resolving after its read, which `test/set-manifest.test.ts` awaits. If `onChange` throws after `last` and `revision` moved, they stay moved: the next change publishes as usual.
- **Do not touch:** `read()`'s ENOENT and read-error handling (`:89-101`), already caught.
- **Proof:** `cp docs/reviews/setlist-controller-225/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t "finding 4"; rm test/pre-pr-review-1.test.ts`. Red now, green after; move it into `test/set-manifest.test.ts`.

### 5. The chart skeleton notes a song's End locator as a missing heading — LOW
- **Location:** `src/set-builder/skeleton.ts:22`
- **Attribution:** introduced by c491b46 (setlist-controller#399). New file.
- **Real-world trigger:** a library song whose Live set ends on a locator named End rather than the blank marker MultiTracks uses. The build treats both as the song's end marker (`src/set-builder/timeline.ts:221-224`), and the Charts check never asks End for a heading (`src/server/charts.ts:24`), but the skeleton prints `Note: "<title>" has the locator End, which is no chart heading...` on stderr. None of the four fixture songs has an End locator, so no test reaches it.

**Evidence**
```ts
    if (key === '' || key === 'count off' || seen.has(key)) continue;
```

**Failure mode** — Executed in `repro/pre-pr-review-1.test.ts`, "finding 5": `songSkeleton(['Count Off', 'Verse 1', 'Chorus', 'End'])` gives `leftOut: ['End']`, where the expected is none.

**Recommended fix**
```diff
-    if (key === '' || key === 'count off' || seen.has(key)) continue;
+    if (key === '' || key === 'end' || key === 'count off' || seen.has(key)) continue;
```
Name End beside the blank marker in the comment at `:7-8`.

**Remediation brief**
- **Design intent:** the skeleton prints the headings Nick types, each locator name once in first-played order, and silently leaves out the locators no chart holds; every other name the heading rule cannot read gets a note.
- **Full surface:** `src/set-builder/skeleton.ts:7-8, 22`; a case in `test/set-builder-skeleton.test.ts` beside its `songSkeleton` table (:45-52).
- **Must preserve:** `test/set-builder-skeleton.test.ts` (Pre Chorus, Breakdown and Outro still noted; Count Off and blank silent); the skeleton's stdout in the build-set skill traces (`.claude/skills/build-set/traces.md`).
- **Do not touch:** the heading rule (`src/shared/chart-heading.ts`); see Needs Further Investigation A.
- **Proof:** `cp docs/reviews/setlist-controller-225/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t "finding 5"; rm test/pre-pr-review-1.test.ts`. Red now, green after.

### 6. `--plan --list` and the Charts check disagree about a chart with no chords — LOW
- **Location:** `src/set-builder/plan-warnings.ts:47-49` against `src/server/charts.ts:77`
- **Attribution:** introduced by 2220ed5 (setlist-controller#398) and 0ef1aa3 (setlist-controller#405). Both lines are new.
- **Real-world trigger:** a chart whose only bracket chords sit on a line the chart view drops (before the first heading, or a `TRANSPOSE KEY [+2]` line): `--plan --list` gives no warning, and the band sees no chords. A chart whose only brackets are empty, `[ ]`: `--plan --list` warns, and the Charts check gives no "no chords in brackets" note.

**Evidence**
```ts
    if (!/\[[^\]]*\S[^\]]*\]/.test(chartText)) {
```
```ts
    const chords = chart.sections.some((section) => section.lines.some((line) => line.kind === 'lyrics' && line.chunks.some((chunk) => chunk.chord !== null)));
```

**Failure mode** — The build tests the raw text, the check tests the parsed chart, and the check counts an empty bracket as a chord. Executed in `repro/pre-pr-review-1.test.ts`, "finding 6": for `[G]... before any heading\nVERSE\n...` and `VERSE\nTRANSPOSE KEY [+2]\n...`, `chartWarnings` gives no warning while the parsed chart shows no chord.

**Recommended fix**
```ts
// src/shared/chart.ts
export function hasChords(chart: Chart): boolean {
  return chart.sections.some((section) => section.lines.some((line) => line.kind === 'lyrics' && line.chunks.some((chunk) => chunk.chord !== null && chunk.chord.trim() !== '')));
}
```
`src/server/charts.ts:77-78` becomes `if (!hasChords(chart)) result.notes.push(...)`; `src/set-builder/plan-warnings.ts:47` becomes `if (!hasChords(parseChart(chartText))) {`. Reword the comment at `plan-warnings.ts:40-42` from "a bracket holding something other than spaces" to "no chord the chart view shows".

**Remediation brief**
- **Design intent:** the build's warning and the server's note answer one question, whether the band will see any chord, so both read the chart as the chart view does (`parseChart`, browser-safe and already imported by the server).
- **Full surface:** `src/shared/chart.ts` (new export), `src/server/charts.ts:77-78`, `src/set-builder/plan-warnings.ts:40-49`.
- **Must preserve:** the warning and note copy, word for word (pinned in `test/set-builder-charts.test.ts`, `test/charts-check.test.ts`, `test/readme-chart-view.test.ts`); a warning never stops the build or sets exit 1.
- **Do not touch:** `parseChart`'s dropped-line rules.
- **Proof:** `cp docs/reviews/setlist-controller-225/repro/pre-pr-review-1.test.ts test/ && pnpm exec vitest run test/pre-pr-review-1.test.ts -t "finding 6"; rm test/pre-pr-review-1.test.ts`. Two cases red now, all three green after. Add a `[ ]` chart to the Charts check's note cases in `test/charts-check.test.ts`.

### 7. Two sentences in the install doc misdescribe the chart behaviour — LOW
- **Location:** `docs/install.md:557`, `docs/install.md:561`
- **Attribution:** introduced by c491b46 (setlist-controller#399) and 0ef1aa3 (setlist-controller#405).
- **Real-world trigger:** Nick reads :557 as "a heading can be added later" and types `PRE CHORUS` by hand for a left-out Pre Chorus. The parser reads that line as a lyric line of the section above (probe: the Verse block shows "PRE CHORUS" and the pre-chorus words), so the band sees the pre-chorus inside the Verse.

**Evidence** — `docs/install.md:557`: "It has no heading yet, so the chart view shows it with its name and bar count." `docs/install.md:561`: "the server adds it whenever it reads a set manifest", where `src/server/server.ts:117` adds the Charts target whenever it has a manifest path, file or not (the README says so correctly).

**Failure mode** — The first misleads the reader into an edit that moves lyrics into the wrong block; the second says a server with no manifest file shows no Charts row, while it shows one with the problem "No set manifest at <path>".

**Recommended fix**
- `docs/install.md:557`: "It has no heading yet, so the chart view shows it with its name and bar count." → "The chart view reads no heading for it and shows it with its name and bar count. Leave it out of the chart: a heading typed for it by hand reads as a lyric line of the section above."
- `docs/install.md:561`: "the server adds it whenever it reads a set manifest" → "the server adds it whenever it has a set manifest path, which it always does".

**Remediation brief**
- **Design intent:** the install doc is Nick's procedure for typing charts and reading the Charts check; it must match the heading rule (`src/shared/chart-heading.ts`) and `server.ts:117`.
- **Full surface:** `docs/install.md:557, 561`, and any pin in `test/readme-charts-check.test.ts` or `test/readme-chart-view.test.ts` that quotes them.
- **Must preserve:** the section numbering the README tests pin (`test/readme-charts-check.test.ts:48-58`).
- **Do not touch:** the advice to rename a locator in Live elsewhere in the doc: a renamed Pre Chorus locator would stop matching ProPresenter's "Pre Chorus" group (`docs/install.md:534`).
- **Proof:** `pnpm exec vitest run test/readme-charts-check.test.ts test/readme-chart-view.test.ts` green after the edit.

### 8. Four fallback paths have no test — LOW
- **Location:** `src/set-builder/set-manifest.ts:38-41`, `web/src/App.tsx:353`, `src/server/server.ts:452`, `src/set-builder/main.ts:292`
- **Attribution:** introduced by 2220ed5 (#398), fb26535 (#397), fb26535 (#397) and c491b46 (#399).
- **Real-world trigger:** none; each is the universal rule "a test for every fallback path".

**Evidence** — `git grep -n "no-store" -- test e2e` finds nothing; `git grep -n "partial" -- test` finds only `test/contract.test.ts:177`, unrelated; `git grep -n "has no locators, so it" -- test` finds nothing; nothing in `test/` or `e2e/` fails a `/api/charts` request.

**Failure mode** — Each path could break unseen: the hidden partial file left beside the manifest after a failed rename; the chart page never retrying a failed charts fetch on stage Wi-Fi; a phone caching the charts across a manifest change; the skeleton's "no locators" problem line and exit 1.

**Recommended fix**
- `test/set-builder-charts.test.ts`: a build whose `--set-manifest` path is an existing directory exits 1 with the "cannot be written" line, and the folder holds no `.set-manifest.json.*.partial` (the manifest test at :353 fails at `mkdir`, before the rename branch).
- `e2e/chart.spec.ts`: `page.route` fails the first `/api/charts` request with a 500, and the chart text still appears after the retry.
- `test/set-manifest.test.ts:261`: assert `cache-control` is `no-store` on the charts route's GET.
- `test/set-builder-skeleton.test.ts`: `--skeleton` on a song with no locators (use `removeLocators`, as `test/set-builder-stop-rules.test.ts:600` does) prints the problem on stderr and exits 1.

**Remediation brief**
- **Design intent:** each fallback is the behaviour on stage Wi-Fi or a broken install, so each needs a test that goes red when it is removed.
- **Full surface:** the four test files above; no production code.
- **Must preserve:** every existing test in those files; the e2e rig's OS-assigned ports.
- **Do not touch:** `CHARTS_RETRY_MS` (1000 ms).
- **Proof:** each new test passes at HEAD, and goes red when its fallback is removed (delete the `rm(partial)`, the retry `setTimeout`, the header, or the `problems.push` line).

### 9. Comment hygiene — LOW (aggregated)
- `src/server/propresenter.ts:75-76` — a new paragraph ("The slide is the one the server hands the cue with...") starts on the line after "...plus k." with no blank `//` line between → insert `//` between the two paragraphs, as the comment block above does.

## Needs Further Investigation

### A. The section word list leaves out names the fixture library's MultiTracks songs use — a product call for Nick
The heading rule's words (`src/shared/chart-heading.ts:8`) follow the spec. Great Are You Lord's locators include Pre Chorus (twice), Breakdown and Outro (twice), and This Is Amazing Grace's include Outro, so those sections can never take chart text: the skeleton leaves them out with a note, the Charts check lists them under Cannot match, and the chart view shows them as name and bar count. The spec anticipates this ("If a locator uses a word outside the list, the Charts check names it ... and the list grows then"), and #399's assumptions accepted the note, so it is not a defect against the plan. What would settle it: Nick decides whether the list grows now with `Pre Chorus`, `Outro` and `Breakdown` (the rule at `chart-heading.ts:17` would then accept a two-word section word), or at #406 when he types the real charts. ProPresenter's groups are already named "Pre Chorus" (`docs/install.md:534`), so renaming the locators is not the way out.

### B. That a real Planning Center plan item carries `chord_chart` and `chord_chart_key` on its included Arrangement
The fake lays a made-up chart on every Arrangement, and the recorded fixtures are scrubbed of real charts, so no test proves the real response's shape, nor that the editor's "Original Key" is `chord_chart_key`. What would confirm it: one `pnpm build-set --plan --list` against the live plan once #406 has typed a chart, or Planning Center's API reference for Arrangement.

### C. The current block can sit under a taller strip
`web/src/ChartView.tsx:69-79` scrolls on a change of song, section, view, font size, display, chord names, capos or charts, not when the strip's height changes on its own (the last section's longer text wrapping at a large font size, loop on or off) or when a phone rotates. What would confirm it: a WebKit run at the Largest font size in the last section of a song with a long next title, measuring the current block's top against the strip's bottom.

### D. Planning Center chord chart syntax the parser may not cover
A key change written in braces (`{{ transpose key +1 }}`) becomes a note line and no Charts note; `{COLUMN_BREAK}` in single braces becomes a note; tags other than `b`, `strong`, `i`, `em`, `u`, `t` (such as `<br>`) stay as text; `C-7`, `C♭` and `C♯` are not read as chords, so they stay in the typed key beside moved chords. What would confirm any of them: Planning Center's Lyrics & Chords help, or a real chart that uses the form.

## Reviewed and Dismissed
- The End entry in the Charts check's exclusions (`src/server/charts.ts:24`) is dead — no: the set parser drops only a locator named exactly `End` (`src/server/set-parser.ts:96`), so `end` in another case becomes a section, and `test/charts-check.test.ts:121` exercises the exclusion with `2 - end`.
- The capo label and picker stay visible with Nashville numbers on (`ChartView.tsx:148-151`) — numbers are the same with any capo, and the label still tells the guitarist where the capo goes.
- Minor-key Nashville numbers count against the natural minor scale (the bIII of F#m shows as 3) — the #403 assumption, confirmed.
- The heading rule rejects `Chorus:`, `Verse1` and `1 Verse` — the #399 assumption and the spec's "one section word and an optional number", pinned by `test/chart-heading.test.ts:33`.
- The module-level parse cache in `ChartView.tsx:179-193` clears and re-parses in the whole-set view — keyed by content, so never stale; cost only.
- The Charts row has an Arm control that does nothing — every target row has one; the Charts target acts on no cue by design (#405 assumption).
- `useCharts` ignores the response's own `revision` — the fetch always follows the snapshot that raised it, so there is no race.
- `test/chart-blocks.test.ts:134-139` asserts on an empty chart — its line 137 pins the real property, that the heading rule makes no COUNT OFF, PAD or PAD OUT heading, so the line after it is redundant, not vacuous. Do not rewrite it to hand-built PAD sections: `chartBlocks` has no exclusion of its own, by design.
- The ProPresenter refactor changes behaviour — no: same filter, same `Math.min(occurrence, named.length) - 1`, same default occurrence, the slide timing `group` override untouched, and `test/propresenter.test.ts` unchanged and green.

## Minor / nits
- `src/server/set-manifest.ts:34` reads the file before it starts the watch, so a rename in that instant waits for Refresh.
- `src/server/server.ts:110`: a failed `startLiveBridge` leaves the manifest watcher open (the hub and HTTP server leaked the same way at base; production exits).
- `src/server/start-up.ts:40` passes a relative `--set-manifest` unresolved, while the build resolves it against INIT_CWD; the server's other path options do the same.
- `src/server/charts.ts:74-76` notes an empty chart key but not a chart key with no stems key, nor a key `readKey` cannot read; in both the chords show as typed.
- An empty `--set-manifest ''` is caught only after the set is built (EISDIR, exit 1).
- `src/shared/chart.ts:41`: the note pattern is greedy (`{a} lyric {b}` becomes one note) and accepts an empty note.
- `web/src/chart-strip.ts:27-32`: a waiting jump that is not a count-in still names the following section, for under a bar.

## Test quality
Tests added or modified: 43 files examined. Green against `4c608d5`: 99 new or modified tests, of which 96 are the build-set skill trace and example tests the branch only widened (`test/build-set-skill.test.ts:471`, `test/build-set-skill-examples.test.ts:196`) and 1 is the count-in race fix (`e2e/count-in.spec.ts:167`, f0ae5fa), all legitimate guards. Tautology shapes: 3 tests that cannot go red (finding 2). Weaker shapes to strengthen when the files are next touched, no action required for the PR:
- `test/chart-transpose.test.ts:176-177, 188` compare `parseChart` output with `parseChart` output; literals would pin the dropped lines and section names.
- `test/charts-check.test.ts:162` asserts `toHaveBeenCalled()` on `console.error`; check the logged line, as `test/set-manifest.test.ts:237` does.
- `test/pages.test.ts:2051, 2450, 2525, 2630, 2780, 2846` assert only that no `<button` renders; each could also find the chart page.
- `test/readme-chart-key.test.ts:15-29` and `test/readme-charts-check.test.ts:22-45` pin README wording only, unlike `readme-chart-view`, `-numbers` and `-settings`, which derive their text from the code.
- `test/set-builder-skeleton.test.ts:175-176` checks the CLI's headings with the production `chartHeading` and `nameKey`; literal-output tests sit beside it.

## Before opening the PR
- **CI readiness:** the repo has no CI; all five full checks are green at 6edac05 with no flakes.
- **Commit hygiene:** commit this doc and `repro/pre-pr-review-1.test.ts` together. The repro is not in vitest's `test/**` include, so it runs only when copied into `test/`.
- **Likely reviewer asks:** the 6/8 bar counts (finding 1); the section word list (A); a real Planning Center recording with a chart (B).

## Verdict
**Not ready as-is.** Gate: findings 1 and 2 (MEDIUM) are fixed before the PR opens, or Nick keeps the #396 4/4 assumption, which withdraws finding 1. Findings 3 to 9 (LOW) can ride with that remediation or go to follow-up tickets. Needs Further Investigation A is a decision for Nick, not a gate.

## Remediation — 2026-11-11
Scope: CRITICAL, HIGH and MEDIUM (findings 1 and 2). Finding 1 was kept by Nick (close-out decision 17), reversing #396 assumption 7. Findings 3 to 9 (LOW) are deliberately deferred, not attempted.

| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `e80972f` setlist-controller#225 pre-PR review 1 finding 1: every block but the current one counted its bars in 4/4, so a 6/8 song's section map showed the wrong bar counts | red→green: the repro's finding 1 case red at f6a5893 (`expected 6 to be 8`); the new and updated cases in `test/chart-blocks.test.ts`, `test/set-manifest.test.ts` (`beatsPerBar` table, a `meter` read, a non-string `meter` unreadable), `test/pages.test.ts`, `test/set-builder-charts.test.ts` (Yes And Amen, built from Great Are You Lord, reads back `meter: '6/8'`) and `test/readme-chart-view.test.ts` were 30 red in a scratch worktree at f6a5893 and green at HEAD | 1 (`test/set-builder-charts.test.ts`, which fixture song is 6/8); the other comment lines are the brief's requested rewrites of existing comments | fixed |
| 1 rework | `09dda4c` setlist-controller#225 pre-PR review 1 finding 1 rework: the docs say the meter counts every block but the current one, and a test pins the lookup by title | the new `test/pages.test.ts` case goes red under three lookup mutants (`songs[0]`, first song with any meter, `findLast`), green at HEAD; `test/readme-chart-view.test.ts` green | 0 | fixed (scoped re-verify) |
| 2 (MEDIUM) | `b85797f` setlist-controller#225 pre-PR review 1 finding 2: three new tests could not go red for the behaviour they name | the two strengthened e2e tests red at 4c608d5 (webkit-ipad, base build) and green at HEAD on both projects; the display key case red under a `displayKey` mutant in a scratch worktree | 0 | fixed |
| 3 to 9 (LOW) | — deferred | — | — | not worked this round, by the default scope |

Full checks at 09dda4c: `pnpm lint`, `pnpm typecheck`, `pnpm test` (93 files, 2771 passed, 4 skipped) green; `pnpm build` and `pnpm test:e2e` (138 of 138) green at b85797f, and the rework touched only tests and docs. No flakes.

### Known regressions, deferred
- None introduced. The verify pass raised three LOW notes on `e80972f` that were not reworked: a hand-written meter with spaces (`" 6/8"`, `"6 / 8"`) counts 4/4 with no warning, by the brief's "4 when it cannot be read"; the usage text line at `src/set-builder/main.ts:94` runs to 135 characters where the paragraph wraps near 118, with no width rule or test; the docs phrase "counts the bars of every block but the current one in" ends on "in", grammatical and pinned.

### Rework briefs
- Finding 1 rework. Achieve: README and `docs/install.md` say the manifest meter counts every block but the current one, and a test holds the meter lookup to the first manifest song of the set song's own title. Preserve: all of `e80972f`'s production code and tests, the readme pins of the other manifest wording, no production code touched. Proof: the new `test/pages.test.ts` case red under `songs[0]`, first-with-any-meter and `findLast` mutants of the `beats` line in `web/src/ChartView.tsx`, green at HEAD; `pnpm exec vitest run test/pages.test.ts test/readme-chart-view.test.ts` green.

### Approach decisions added this round
- Meter lookup in the chart view: the first manifest song whose title matches by the name rule, with or without chart text, so a song with no chart still counts its section map in its own meter. It mirrors `chartForSong`'s `find` minus the chart-text test. Finding 3's occurrence rule, when it lands, moves this lookup to `manifestSongFor` with the chart lookup, as its brief says.
- An unreadable or missing meter counts 4/4 silently (`beatsPerBar`), and a non-string `meter` makes the whole manifest unreadable, as every other wrong field does; the unreadable message names "meter".
