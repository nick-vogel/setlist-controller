# Pre-PR review: setlist-controller#604 Public copy cleanup

**Branch:** `setlist-controller-604-public-cleanup` vs `origin/main` (merge-base `74f2edc`, "Merge pull request #602 from nick-vogel/setlist-controller-285-desktop-launcher")
**Reviewed at:** HEAD `b480f99` (setlist-controller#604 Stand-ins for the sermon titles in the ProPresenter and Planning Center fixtures) + 0 files with uncommitted changes, 0 untracked files, 75 files total, +1608 / −1547
**Reviewed against:** epic `nick-vogel/setlist-controller#604` (open; no sub-issues), PR `nick-vogel/setlist-controller#618`, `.out-of-scope/connection-targets-network.md`, `.out-of-scope/hand-edited-song-shapes.md`, and the global rules in `~/.claude/rules/`. The repo has no `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, ADRs, or `.claude/rules/`. Run with `--fresh`.
**Date:** 2026-11-24
**Redacted before commit:** the quotes of the truncated church email, the old stage subnet, the church-domain search stems, and the sermon-title constant name are replaced with descriptions, so this doc does not put them back in the public copy. The repros for findings 1 and 4 check for `nick@` and for the stand-in constant name.
**Reviewer:** Gemini through Antigravity (Gemini 4 Neon) + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `ls node_modules/.bin` | present (`eslint`, `playwright`, `tsc`, `vite`, `vitest`); lockfile unchanged since `74f2edc` |
| Typecheck | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | pass |
| Unit and integration suites | `pnpm test -- --maxWorkers=4`, then all 8 timed-out/load-affected files rerun individually with `--maxWorkers=1` | full run: 91 passed, 8 failed (23 tests, load timeouts / timing assertions under heavy load); each of the 8 files passed 100% alone (`test/launcher.test.ts` 15/15, `test/propresenter.test.ts` 385/385, `test/set-builder-charts.test.ts` 16/16, `test/set-builder-command.test.ts` 99/99, `test/set-builder-plan-folders.test.ts` 25/25, `test/set-builder-plan-list.test.ts` 39/39, `test/set-builder-plan.test.ts` 68/68, `test/set-builder-weekly-show.test.ts` 31/31); combined: 99 files, 3,264 passed, 4 skipped |
| Build-set skill suites | `pnpm exec vitest run test/build-set-skill.test.ts test/build-set-skill-examples.test.ts test/build-set-skill-quotes.test.ts --maxWorkers=1` | pass: 3 files, 319 passed |
| New public-fixture test | `pnpm exec vitest run test/fixture-sets-public.test.ts --reporter=verbose` | pass: 7 passed (count + all 6 `.als` sets); inspected at `74f2edc` via `git show`: 5 of 6 `.als` files fail at base (another person's home folder path in template, `/Users/nick` in the 4 library songs) |
| Generator determinism and XML integrity | ran a temp-directory copy of `scripts/make-song-fixtures.mjs` against `test/fixtures/set-builder` and `diff -rq`; verified track IDs, `TrackGroupId`, pointee IDs, `NextPointeeId`, and all `<Path>`/`<RelativePath>` values across all 6 `.als` files | byte-identical to committed `.als` files; 0 duplicate track IDs, 0 duplicate pointees, 0 `/Users/` paths, all stems outside groups (`TrackGroupId="-1"`) |
| Stand-in PNGs and colour math | decoded all 4 stand-in PNGs via `src/set-builder/png.ts` and ran `pictureHue` / `colourAt` from `src/set-builder/colour.ts` | 400×225 opaque RGBA, exact byte counts matching `_thumbnail_0.json` (758, 759, 755, 755), hues 41, 6, 25, 192; `I Speak Jesus` max-sat band 0.0779 (`~0.078`); `Ancient Gates` max-RGB 41; all bands match `test/fixtures/propresenter/README.md` |
| Repo-wide public-cleanup scrub audit | `git grep` across all tracked files (excluding `docs/reviews/setlist-controller-604/`) for church name/abbreviations, domain/emails (including truncated stems), Advent family names, venue/school/router details, stage IPs, `chart-songs`, and all 257 fixture strings removed across `80a1192`, `e8bf647`, `b0ff4d4`, `b480f99`, `8e53bcf`; JSON walk of every Planning Center, ProPresenter, and Eos fixture | `chart-songs` gone; all 257 scrubbed fixture strings gone from fixtures (only TypeScript type `Saved` matched); found truncated church email in `docs/reviews/setlist-controller-58/pre-pr-review-9.md:20` (Finding 1) and sermon constant `SERMON_TITLE_CONSTANT` in `test/propresenter.test.ts` (Finding 4) |
| Structural comparison of `BASE` vs `HEAD` `.als` fixtures | parsed all 4 library `.als` files at `74f2edc` vs `b480f99` for `<LiveSet><Locators>`, `<Mapping>`, `<PersistentKeyString>`, tempo/meter events, and audio ends | found `NextLocatorMapping`, `PreviousLocatorMapping`, and non-empty `PersistentKeyString` dropped from `This Is Amazing Grace`, making `test/set-builder.test.ts:362` vacuous (Finding 3) |
| Preserved repros (Findings 1–4) | `node --test docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` | all 4 fail red on `b480f99`, proving each defect by execution |
| Tautology audit on `$BASE` checkout | full base-checkout run not executed (non-Claude reviewer rule forbids `git worktree add`); instead verified `test/fixture-sets-public.test.ts` directly against all 6 `.als` blobs at `74f2edc` via `git show` and inspected every modified test file's diff | `test/fixture-sets-public.test.ts` is red at `74f2edc` on 5 of 6 `.als` files; `test/set-builder-plan.test.ts:275` (`USER_AGENT`) is red at `74f2edc`; found two degraded test surfaces introduced by the branch (Findings 2 and 3) |
| End-to-end Playwright (`pnpm test:e2e`) | not run | heavy machine load and browser suite; inspected `e2e/propresenter.spec.ts` diff directly (`Series One - October 25, 2026` matches `v1_playlists.json`) |
| Live Planning Center, ProPresenter, Eos, ATEM | not run | guardrails forbid contacting live services or devices |

**Overall:** Almost all of the #604 public cleanup landed cleanly: the `chart-songs` skill is gone, the five MultiTracks `.als` sessions are replaced by a deterministic generator with zero `/Users/` paths, the four stock motion-background thumbnails are replaced by matching five-band PNGs, the Planning Center `User-Agent` points to the public repo, and the fixtures/docs drop the church, venue, Advent families, and sermon titles. Four real gaps remain before squashing to the public copy, three of them MEDIUM: a truncated copy of the church email survived in an older review doc two lines below a line this branch scrubbed, renaming the church's own youth service type to `Youth` silently broke the `plan-listing-no-such-service-type` trace into a 404 with a self-contradictory Note, dropping `This Is Amazing Grace`'s locator key mappings made `test/set-builder.test.ts:362` vacuous, and `test/propresenter.test.ts` still holds the sermon-title constant `SERMON_TITLE_CONSTANT`. Fix all four (plus the minor README hygiene) before copying `main` into the public repository.

## Confirmed Issues

### 1. Truncated church email (the truncated church email) remains in `docs/reviews/setlist-controller-58/pre-pr-review-9.md:20` — MEDIUM
- **Location:** `docs/reviews/setlist-controller-58/pre-pr-review-9.md:20`
- **Attribution:** pre-existing, untouched on line 20 (`git show 74f2edc:docs/reviews/setlist-controller-58/pre-pr-review-9.md | grep -n <church-domain stem>` hits lines 18 and 20). Commit `80a1192` (`setlist-controller#604 No church or venue details in the README and the install doc`) scrubbed line 18 of the same table and walked past line 20 because Vitest's assertion diff truncated the email, escaping the searches for the church name and the full domain (`whole-surface-of-a-change`).
- **Real-world trigger:** squashing `main` into the single initial commit of the public `setlist-controller` repository publishes the truncated church email permanently in public git history, directly failing #604's "No church references in the public copy" requirement ("Remove the church's name and abbreviations, its domain and email addresses").
**Evidence**
```markdown
| #202: the constant | read `src/set-builder/plan-reader.ts:63-66` | `USER_AGENT` is exactly `setlist-controller (<the maintainer's email>)`; the comment above it (`<app name> (<link or email>)`, the recorder imports it) still holds |
| #202: one source for the value | `git grep -n "USER_AGENT\|github.com/nick-vogel/setlist-controller"` outside `docs/reviews` | `scripts/record-pco-fixtures.mjs:18` imports the constant and `:46` sends it; `plan-reader.ts:141` sends it; the old URL is gone from code and tests |
| #202: the test can go red | tautology audit: the branch's `test/set-builder-plan.test.ts` copied into a scratch worktree at `1d7b38f`, then `pnpm exec vitest run test/set-builder-plan.test.ts -t "User-Agent"` | red at base: `expected 'setlist-controller (https://github.co…' to be 'setlist-controller (<the truncated church email>)'` at `:271`. Green at HEAD in the full suite |
```
**Failure mode** — `node --test docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` ("finding 1") matches the truncated church email in `docs/reviews/setlist-controller-58/pre-pr-review-9.md`.
**Recommended fix**
```diff
@@ docs/reviews/setlist-controller-58/pre-pr-review-9.md
-| #202: the test can go red | tautology audit: the branch's `test/set-builder-plan.test.ts` copied into a scratch worktree at `1d7b38f`, then `pnpm exec vitest run test/set-builder-plan.test.ts -t "User-Agent"` | red at base: `expected 'setlist-controller (https://github.co…' to be 'setlist-controller (<the truncated church email>)'` at `:271`. Green at HEAD in the full suite |
+| #202: the test can go red | tautology audit: the branch's `test/set-builder-plan.test.ts` copied into a scratch worktree at `1d7b38f`, then `pnpm exec vitest run test/set-builder-plan.test.ts -t "User-Agent"` | red at base: `expected 'setlist-controller (https://github.co…' to be 'setlist-controller (<the maintainer's email>)'` at `:271`. Green at HEAD in the full suite |
```
Line audit: replaces only the truncated email literal with `<the maintainer's email>`, matching the replacement commit `80a1192` used on line 18 of the same table. No behaviour or code path is affected.
**Remediation brief**
- **Design intent:** `main` is copied into the public repository as one initial commit (`setlist-controller#604`), so no file under `docs/reviews/` may retain the church's domain or email address, even truncated in a quoted test failure.
- **Full surface:** `docs/reviews/setlist-controller-58/pre-pr-review-9.md:20` (confirmed the sole remaining hit of `<church-domain stems>|nick@` across all tracked files outside `docs/reviews/setlist-controller-604/`).
- **Must preserve:** the rest of `docs/reviews/setlist-controller-58/pre-pr-review-9.md` as historical review record.
- **Do not touch:** `docs/reviews/setlist-controller-58/pre-pr-review-7.md:49` (uses `example.com` and `nlvogel.com`, not the church domain; see Dismissed).
- **Proof:** `node --test --test-name-pattern="finding 1" docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` (red now, green after), plus `git grep -inE '<church-domain stems>|nick@' -- ':!docs/reviews/setlist-controller-604/*'` returning 0 hits.

### 2. The `plan-listing-no-such-service-type` trace now hits HTTP 404 instead of "no such service type", and its Note contradicts itself — MEDIUM
- **Location:** `.claude/skills/build-set/traces.md:4014-4036` (interacts with `test/fixtures/planning-center/service_types_per_page_100.json:109-115`)
- **Attribution:** introduced by `b0ff4d4` (`setlist-controller#604 Stand-in names and IDs for the church's own Planning Center service types`). At `74f2edc`, `service_types_per_page_100.json` held the church's own youth service type (`1689108`) and no service type named `Youth`, so `--service-type "Youth"` triggered `Planning Center has no service type "Youth"`. Renaming the church's own youth service type to `Youth` (`1000021`) made `--service-type "Youth"` match an existing service type.
- **Real-world trigger:** `test/build-set-skill.test.ts` runs every trace in `traces.md` against the fake Planning Center, but only checks `exit` and `lastLine` of stdout (`test/build-set-skill.test.ts:513-514`), never `stderr`. So `plan-listing-no-such-service-type` stayed green while silently switching from testing an unknown service type to failing with HTTP 404 on `/service_types/1000021/plans`. Anyone or any agent reading `traces.md:4034-4036` sees a self-contradictory trace claiming `Planning Center has no service type "Youth"` while listing `Youth (1000021)` in the same sentence.
**Evidence**
```markdown
Nick says:
- Build Sunday's set from the plan, for the Youth service.

Listing:

```
pnpm build-set --plan --list --service-type "Youth"
```
...
Question: which service type he means, from the ones the problem lists, such as Youth, Youth Night or YTH - Mid

Note: The listing prints `Planning Center has no service type "Youth". Its service types: Service (997539), Hospitality (1000011), Nursery (1000012), Sunday Service (1000013), Kids Team (1000014), Host/Check-In (1000015), Youth Night (1000016), Prayer - Sunday Service (1000017), Life Safety Team (1000018), Event (1000019), Kids (1000020), Youth (1000021), YTH - Mid (1000022).` on stderr, and nothing on stdout.
```
**Failure mode** — Running `src/set-builder/main.ts --plan --list --service-type "Youth" --date 2027-01-03` against `startPlanningCenter` with `readFixtures()` exits 1 with `stdout: ""` and `stderr: "Planning Center answered 404 to /service_types/1000021/plans.\n"`. `node --test docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` ("finding 2") fails on that mismatch. Running the same command with `--service-type "Youth Ministry"` produces `stderr: 'Planning Center has no service type "Youth Ministry". Its service types: Service (997539), ..., Youth (1000021), YTH - Mid (1000022).\n'`.
**Recommended fix**
```diff
@@ .claude/skills/build-set/traces.md
 Nick says:
-- Build Sunday's set from the plan, for the Youth service.
+- Build Sunday's set from the plan, for the Youth Ministry service.
 
 Listing:
 
 ```
-pnpm build-set --plan --list --service-type "Youth"
+pnpm build-set --plan --list --service-type "Youth Ministry"
 ```
 
 Plan: the recorded Phase 0 plan, on 2027-01-03
 Set folders: none
 Exit: 1
 Last line: none
 
 Command: no command
 Date line: none
 Question: which service type he means, from the ones the problem lists, such as Youth, Youth Night or YTH - Mid
 
-Note: The listing prints `Planning Center has no service type "Youth". Its service types: Service (997539), Hospitality (1000011), Nursery (1000012), Sunday Service (1000013), Kids Team (1000014), Host/Check-In (1000015), Youth Night (1000016), Prayer - Sunday Service (1000017), Life Safety Team (1000018), Event (1000019), Kids (1000020), Youth (1000021), YTH - Mid (1000022).` on stderr, and nothing on stdout. The skill shows it and asks, and guesses no service type.
+Note: The listing prints `Planning Center has no service type "Youth Ministry". Its service types: Service (997539), Hospitality (1000011), Nursery (1000012), Sunday Service (1000013), Kids Team (1000014), Host/Check-In (1000015), Youth Night (1000016), Prayer - Sunday Service (1000017), Life Safety Team (1000018), Event (1000019), Kids (1000020), Youth (1000021), YTH - Mid (1000022).` on stderr, and nothing on stdout. The skill shows it and asks, and guesses no service type.
```
Line audit: changes only the requested service-type string in the one trace (`"Youth"` → `"Youth Ministry"`). Keeps `service_types_per_page_100.json`, `test/set-builder-plan.test.ts:616-618`, and `test/fixtures/planning-center/README.md:11` unchanged, keeps `Question:` (`such as Youth, Youth Night or YTH - Mid`) realistic and accurate, and does not alter `Pins:`. No fallback path added.
**Remediation brief**
- **Design intent:** Each trace in `.claude/skills/build-set/traces.md` pins a real failure or success path of `pnpm build-set` against the recorded fixtures, verified by `test/build-set-skill.test.ts` and `test/build-set-skill-quotes.test.ts`. `plan-listing-no-such-service-type` must pass a `--service-type` name absent from `test/fixtures/planning-center/service_types_per_page_100.json` so the CLI actually exits 1 with `Planning Center has no service type "<name>". Its service types: ...`.
- **Full surface:** `.claude/skills/build-set/traces.md:4018, 4024, 4036`. Checked every other `--service-type` occurrence in `.claude/skills/build-set/SKILL.md` and `.claude/skills/build-set/traces.md`: none of the others name `"Youth"`.
- **Must preserve:** all 131 tests in `test/build-set-skill.test.ts` and all 169 tests in `test/build-set-skill-quotes.test.ts`; the stand-in service type names in `test/fixtures/planning-center/service_types_per_page_100.json` and `test/set-builder-plan.test.ts:616-618`.
- **Do not touch:** `.claude/skills/build-set/traces.md:4604` (`--playlist "Youth"` is a ProPresenter playlist example, not a Planning Center service type).
- **Proof:** `node --test --test-name-pattern="finding 2" docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` (red now, green after) and `pnpm exec vitest run test/build-set-skill.test.ts test/build-set-skill-quotes.test.ts --maxWorkers=1`.

### 3. Synthetic `This Is Amazing Grace` omits locator key strings and `NextLocatorMapping`/`PreviousLocatorMapping`, making `test/set-builder.test.ts:362` vacuous — MEDIUM
- **Location:** `scripts/make-song-fixtures.mjs:70-82, 279-298, 326-328` (and the regenerated `test/fixtures/set-builder/library/This Is Amazing Grace-The Ascension-D-98.00bpm/MultiTrack.als`), tested by `test/set-builder.test.ts:352-363`
- **Attribution:** introduced by `08d2376` (`setlist-controller#604 Synthetic songs in place of the five MultiTracks Ableton sessions`). At `74f2edc`, `This Is Amazing Grace/MultiTrack.als` had `NextLocatorMapping` (key `.`) and `PreviousLocatorMapping` (key `,`) inside `<LiveSet><Locators>`, plus non-empty `<PersistentKeyString>` (`c`, `q`, `w`, `e`, …) on 12 of its 13 locators. In `HEAD`, all four synthetic songs have `<LiveSet><Locators>` children `['Locators']` only and `<PersistentKeyString Value="" />` on every locator.
- **Real-world trigger:** `test/set-builder.test.ts:361-362` asserts that a song's own next and previous locator keys are not copied into the built set, but the fixture it builds no longer carries them (`tests-can-go-red`). A regression in `src/set-builder/write-set.ts:36` that replaced `<LiveSet><Locators>` with the song's `<LiveSet><Locators>` wrapper would now pass the suite silently. Likewise, the test title at `:352` claims every locator of `This Is Amazing Grace` carries a computer-key mapping, whereas the synthetic locators only carry blank `<Mapping>` shells with `<PersistentKeyString Value="" />` (the same as the other three songs).
**Evidence**
```js
// scripts/make-song-fixtures.mjs:286-295
    '\n\t\t\t\t\t<Mapping>',
    '\n\t\t\t\t\t\t<PersistentKeyString Value="" />',
...
// scripts/make-song-fixtures.mjs:327
  xml = xml.replace('\t\t<Locators>\n\t\t\t<Locators />', `\t\t<Locators>\n\t\t\t<Locators>${stored.map(locator).join('')}\n\t\t\t</Locators>`);
```
```ts
// test/set-builder.test.ts:352-363
  it('drops the computer-key mapping every locator of This Is Amazing Grace carries', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GRACE);

    const root = await readSet(setPath(workspace));
    const built = locators(root);
    expect(built).toHaveLength(13);
    expect(built.filter(({ keyMapped }) => keyMapped)).toEqual([]);
    // The song's own next and previous locator keys are not copied either.
    expect(elements(element(root, 'LiveSet', 'Locators')).map((child) => child.name)).toEqual(['Locators']);
  });
```
**Failure mode** — `node --test docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` ("finding 3") parses `This Is Amazing Grace/MultiTrack.als` and gets `<LiveSet><Locators>` children `['Locators']` (missing `NextLocatorMapping` and `PreviousLocatorMapping`) and 0 non-empty `PersistentKeyString` values.
**Recommended fix**
```diff
@@ scripts/make-song-fixtures.mjs
   {
     folder: 'This Is Amazing Grace-The Ascension-D-98.00bpm',
     meter: FOUR_FOUR,
+    nextPreviousKeys: true,
+    locatorKeys: ['c', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'a', 's'],
     tempo: [[-63072000, 98]],
@@ scripts/make-song-fixtures.mjs
-function locator([time, name], id) {
+function locator([time, name], id, key = '') {
   return [
     `\n\t\t\t\t<Locator Id="${id}">`,
     '\n\t\t\t\t\t<LomId Value="0" />',
     `\n\t\t\t\t\t<Time Value="${time}" />`,
     `\n\t\t\t\t\t<Name Value="${escape(name)}" />`,
     '\n\t\t\t\t\t<Annotation Value="" />',
     '\n\t\t\t\t\t<Mapping>',
-    '\n\t\t\t\t\t\t<PersistentKeyString Value="" />',
+    `\n\t\t\t\t\t\t<PersistentKeyString Value="${escape(key)}" />`,
     '\n\t\t\t\t\t\t<IsNote Value="false" />',
@@ scripts/make-song-fixtures.mjs
+function locatorNavMapping(tag, key) {
+  return [
+    `\n\t\t\t<${tag}>`,
+    `\n\t\t\t\t<PersistentKeyString Value="${escape(key)}" />`,
+    '\n\t\t\t\t<IsNote Value="false" />',
+    '\n\t\t\t\t<Channel Value="-1" />',
+    '\n\t\t\t\t<NoteOrController Value="-1" />',
+    '\n\t\t\t\t<LowerRangeNote Value="-1" />',
+    '\n\t\t\t\t<UpperRangeNote Value="-1" />',
+    '\n\t\t\t\t<ControllerMapMode Value="0" />',
+    `\n\t\t\t</${tag}>`,
+  ].join('');
+}
@@ scripts/make-song-fixtures.mjs
   const stored = song.endMarkerFirst ? [song.locators.at(-1), ...song.locators.slice(0, -1)] : song.locators;
-  xml = xml.replace('\t\t<Locators>\n\t\t\t<Locators />', `\t\t<Locators>\n\t\t\t<Locators>${stored.map(locator).join('')}\n\t\t\t</Locators>`);
+  const nav = song.nextPreviousKeys ? `${locatorNavMapping('NextLocatorMapping', '.')}${locatorNavMapping('PreviousLocatorMapping', ',')}` : '';
+  xml = xml.replace(
+    '\t\t<Locators>\n\t\t\t<Locators />',
+    `\t\t<Locators>\n\t\t\t<Locators>${stored.map((item, id) => locator(item, id, song.locatorKeys?.[id] ?? '')).join('')}\n\t\t\t</Locators>${nav}`,
+  );
```
Then run `node scripts/make-song-fixtures.mjs` to regenerate `test/fixtures/set-builder/library/This Is Amazing Grace-The Ascension-D-98.00bpm/MultiTrack.als` (the other three library songs and Live 8 song stay byte-identical).
Line audit: adds synthetic computer-key mappings only to `This Is Amazing Grace`, leaving the other four generated `.als` files byte-for-byte unchanged. `make-song-fixtures.mjs:333` verifies `serializeAls(parseAls(xml)) === xml` and `readSong()` reads only `<Locators><Locators><Locator>`, so no built-set output or existing test assertion changes. No fallback path added.
**Remediation brief**
- **Design intent:** `scripts/make-song-fixtures.mjs` deterministically builds synthetic Live 12 fixtures that preserve the structural edge cases the set-builder tests exercise (bar-line tolerance, out-of-order end marker, 2/4 meter changes, fermata, and `This Is Amazing Grace`'s locator key mappings and next/previous locator mappings), while keeping all values synthetic and free of `/Users/` paths. `src/set-builder/write-set.ts:36, 331` drops every locator's `<Mapping>` and writes only the inner `<Locators>` list so the template's `<LiveSet><Locators>` wrapper is preserved and a song's next/previous locator keys never leak into the built set.
- **Full surface:** `scripts/make-song-fixtures.mjs:70-82, 279-298, 326-328`, plus regenerating `test/fixtures/set-builder/library/This Is Amazing Grace-The Ascension-D-98.00bpm/MultiTrack.als` via `node scripts/make-song-fixtures.mjs`. Update the header comment in `scripts/make-song-fixtures.mjs:34-37` if desired to note that `This Is Amazing Grace` carries synthetic locator and next/previous key mappings.
- **Must preserve:** deterministic output on repeated runs of `node scripts/make-song-fixtures.mjs`; `test/fixture-sets-public.test.ts` (7/7); `test/set-builder.test.ts` (79/79), `test/set-builder-overlap.test.ts`, `test/set-builder-pad.test.ts`, `test/set-builder-stop-rules.test.ts`, `test/set-builder-command.test.ts`, `test/set-builder-skeleton.test.ts`, `test/set-builder-plan.test.ts`, `test/set-builder-plan-list.test.ts`.
- **Do not touch:** `test/fixtures/set-builder/library/_template/template Project/template.als` (already cleaned; must remain free of `NextLocatorMapping`/`PreviousLocatorMapping`).
- **Proof:** `node --test --test-name-pattern="finding 3" docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` (red now, green after), then `pnpm exec vitest run test/fixture-sets-public.test.ts test/set-builder.test.ts --maxWorkers=1`.

### 4. `test/propresenter.test.ts` retains the real sermon title `SERMON_TITLE_CONSTANT` as a constant name — LOW
- **Location:** `test/propresenter.test.ts:7127, 7359, 7378`
- **Attribution:** pre-existing, untouched (`git show 74f2edc:test/propresenter.test.ts | grep -n SERMON_TITLE_CONSTANT` hits the same three lines). Commit `b480f99` (`setlist-controller#604 Stand-ins for the sermon titles in the ProPresenter and Planning Center fixtures`) renamed the sermon title to `"Sample Message B"` in the fixtures, `test/fixtures/propresenter/README.md`, and the comments at `test/propresenter.test.ts:7357` and `:7376`, while walking past the constant name on the very next lines (`whole-surface-of-a-change`).
- **Real-world trigger:** squashing `main` into the public repository leaves one real sermon title in source code under `test/`, inconsistent with commit `b480f99`'s scrub. Low severity because the identifier is undated and unlinked from any date or church name, unlike Finding 1.
**Evidence**
```ts
// test/propresenter.test.ts:7127
const SERMON_TITLE_CONSTANT = '2D24702C-9B33-4140-9D97-72E2701C955C';
...
// test/propresenter.test.ts:7357-7359
    // Through Facetime, MC, Scripture Reading, Test Message, Sample Message B and Dismissal onto
    // Worthy Of It All's second listing, each crossed from its last slide.
    for (const crossed of [FACETIME, MC, SCRIPTURE_READING, TEST_MESSAGE, SERMON_TITLE_CONSTANT, DISMISSAL, WORTHY_OF_IT_ALL]) {
```
**Failure mode** — `node --test docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` ("finding 4") finds 3 occurrences of `SERMON_TITLE_CONSTANT` in `test/propresenter.test.ts`.
**Recommended fix**
```diff
@@ test/propresenter.test.ts
-const SERMON_TITLE_CONSTANT = '2D24702C-9B33-4140-9D97-72E2701C955C';
+const SAMPLE_MESSAGE_B = '2D24702C-9B33-4140-9D97-72E2701C955C';
@@ test/propresenter.test.ts
-    for (const crossed of [FACETIME, MC, SCRIPTURE_READING, TEST_MESSAGE, SERMON_TITLE_CONSTANT, DISMISSAL, WORTHY_OF_IT_ALL]) {
+    for (const crossed of [FACETIME, MC, SCRIPTURE_READING, TEST_MESSAGE, SAMPLE_MESSAGE_B, DISMISSAL, WORTHY_OF_IT_ALL]) {
@@ test/propresenter.test.ts
-    for (const crossed of [FACETIME, MC, SCRIPTURE_READING, TEST_MESSAGE, SERMON_TITLE_CONSTANT, DISMISSAL]) {
+    for (const crossed of [FACETIME, MC, SCRIPTURE_READING, TEST_MESSAGE, SAMPLE_MESSAGE_B, DISMISSAL]) {
```
Line audit: pure rename of a file-local constant; no runtime or test behaviour changes.
**Remediation brief**
- **Design intent:** Every sermon title in the ProPresenter fixtures and the tests that reference them uses its stand-in name (`Sample Message A`, `Sample Message B`, `Series One`–`Series Four`).
- **Full surface:** `test/propresenter.test.ts:7127, 7359, 7378` (verified zero other hits across the repository with `git grep -i SERMON_TITLE_CONSTANT`).
- **Must preserve:** all 385 tests in `test/propresenter.test.ts`.
- **Do not touch:** the UUID `'2D24702C-9B33-4140-9D97-72E2701C955C'`, which matches `test/fixtures/propresenter/v1_presentation_2D24702C-9B33-4140-9D97-72E2701C955C.json` and the playlist fixtures.
- **Proof:** `node --test --test-name-pattern="finding 4" docs/reviews/setlist-controller-604/repro/review-1-findings.mjs` (red now, green after), then `pnpm exec vitest run test/propresenter.test.ts --maxWorkers=1`.

### 5. Comment hygiene — LOW (aggregated)
- `test/fixtures/planning-center/README.md:9-12` — says "the committed `service_types_per_page_100.json` was edited by hand after the scrub: ... Every plan title but \"TEST TEST TEST\" was a sermon title, and became `Message 1` to `Message 16`, in date order." → name `service_types_997539_plans_filter_past_order_-sort_date_per_page_25.json` for the plan titles, remove the extra blank line on `:10`, and add a blank line before `## What is in it` on `:12`.
- `test/fixtures/propresenter/README.md:10-13` — extra blank line on `:11` and missing blank line before `## What is in it` on `:13` → single blank line before and after the hand-edits paragraph.

## Needs Further Investigation
None. Every candidate was verified directly against the working tree, `git show 74f2edc:...`, or execution. (Confirming the provenance of `_template/template Project/template.als` is already tracked in PR #618's "Left for me" section.)

## Reviewed and Dismissed
- **23 test failures during the initial 4-worker `pnpm test` run** — all 8 affected test files (`test/launcher.test.ts`, `test/propresenter.test.ts`, `test/set-builder-charts.test.ts`, `test/set-builder-command.test.ts`, `test/set-builder-plan-folders.test.ts`, `test/set-builder-plan-list.test.ts`, `test/set-builder-plan.test.ts`, `test/set-builder-weekly-show.test.ts`) passed 100% when rerun individually with `--maxWorkers=1`; all 23 were 5 s timeouts or timing-margin misses caused by machine load.
- **`192.168.10.240` and `192.168.10.50` in `docs/install.md`, `src/server/{atem,eos,propresenter}.ts`, and tests** — `192.168.10.240` is Blackmagic's documented factory default fixed IP for the ATEM Mini, and `192.168.10.50` is the generic example address on that subnet (the old stage subnet, which was completely replaced with RFC 5737 `192.0.2.x`).
- **`/Users/nick/` paths in `README.md:86`, `.claude/skills/build-set/{SKILL,traces}.md`, `test/fixtures/eos/*.json`, and `test/build-set-skill*.test.ts`** — Nick (`nick-vogel`) is the public repository's author; #604's home-folder cleanup specifically targets the MultiTracks `.als` sessions and `_template/template.als`'s another person's home folder path path ("another person's Mac"), all of which are clean.
- **`test/set-builder-pad.test.ts:46` ("after Goodness of God with a 34 BPM fermata, plays the file to 94.678 s")** — accurate; `padAfterGoodness()` at `:1059` explicitly injects a held 34 BPM fermata at beat 316, producing `94.677871 s`.
- **`src/set-builder/colour.ts:16, 21-22` ("its made stand-in is at 0.078" / "is at 41, as in its made stand-in")** — verified by decoding the committed stand-in PNGs: `I Speak Jesus` max-sat band has saturation `0.0779` (`0.078`) and `Ancient Gates` max-sat band has max RGB `41`.
- **`docs/reviews/setlist-controller-58/pre-pr-review-7.md:49` emails** — `me@pcodemo.example.com` is an RFC 2606 example address from Planning Center's docs and `https://nlvogel.com` is Nick's public site; no church reference.
- **`test/fixtures/propresenter/v1_presentation_EB4A51A6-8A84-4435-AA45-F50097F93BC6.json` (`Both And.jpg`) and `v1_library_Default.json` (`gemini-code-1785534731834`, `Graduation Service`, `Communion Service`, `Kids Christmas Play`)** — none names a person, church, or dated sermon (PR #618 explicitly keeps generic event/media labels).
- **`.out-of-scope/connection-targets-network.md`** — read in full; contains no stage IPs, church name, school Wi-Fi, or router brand.
- **`test/fixture-sets-public.test.ts` using `describe(..., async () => ...)`** — verified with `vitest run --reporter=verbose`: Vitest 5 awaits the async describe and executes all 7 tests (count + 6 `.als` files).

## Minor / nits
- `test/fixture-sets-public.test.ts:18` matches `/\/Users\/[^/"]*/g`, which catches macOS `<Path>` values like a path under another person's home folder but would not catch a bare relative path into a user directory such as a relative path into another person's home folder if `<Path>` were stripped without `<RelativePath>` (both were stripped in `template.als`).
- `scripts/make-song-fixtures.mjs:334` asserts `!xml.includes('/Users/')` for the four library songs but does not repeat the check for `live8` at `:344-347` (`test/fixture-sets-public.test.ts` covers `live8` directly).
- `docs/install.md:270, 560, 565` still use `192.168.10.50` for ProPresenter examples while sections 3 and 9 switched laptop/Eos examples to `192.0.2.x` (`192.0.2.20`, `192.0.2.21`). Not a church reference, just a minor example-IP inconsistency.

## Test quality
- **Tests added:** 1 file (`test/fixture-sets-public.test.ts`, 7 cases: 1 count assertion + 6 parameterized `.als` checks).
- **Red against `$BASE` (`74f2edc`):** verified against all 6 `.als` blobs at `74f2edc` via `git show`: 5 of 6 `.als` files fail at base (another person's home folder path in `template.als`, `/Users/nick` in the 4 library songs). `test/set-builder-plan.test.ts:275` (`USER_AGENT`) is also red at `74f2edc`.
- **Tautology / lost-coverage shapes found:** 2 — (1) `test/set-builder.test.ts:362` became vacuous because synthetic `This Is Amazing Grace` no longer carries `NextLocatorMapping`/`PreviousLocatorMapping` (Finding 3); (2) `.claude/skills/build-set/traces.md:4014-4036` (`plan-listing-no-such-service-type`) stayed green in `test/build-set-skill.test.ts` despite switching from a no-such-service-type error to HTTP 404 because the trace runner checks only exit code and stdout (Finding 2).

## Before opening the PR
- **CI readiness:** `pnpm typecheck`, `pnpm lint`, and all 99 Vitest files pass (`pnpm test:e2e` was not run in this session; `e2e/propresenter.spec.ts` was verified against `v1_playlists.json`).
- **Commit hygiene:** PR #618 is already open at `b480f99`; working tree has no unrelated edits.
- **Likely reviewer asks:** confirm the provenance of `test/fixtures/set-builder/library/_template/template Project/template.als` (already listed in PR #618's "Left for me").

## Verdict
**Not ready** to merge and squash into the public copy as-is.

- **Merge gate (must fix before copying `main` into the public repository):**
  - **Finding 1 (MEDIUM):** remove the truncated the truncated church email from `docs/reviews/setlist-controller-58/pre-pr-review-9.md:20` so no church domain/email lands in the public initial commit.
  - **Finding 2 (MEDIUM):** change `"Youth"` to `"Youth Ministry"` in `.claude/skills/build-set/traces.md:4018, 4024, 4036` so `plan-listing-no-such-service-type` exercises the unknown-service-type path again and stops contradicting itself.
  - **Finding 3 (MEDIUM):** add synthetic locator key mappings and `NextLocatorMapping`/`PreviousLocatorMapping` to `This Is Amazing Grace` in `scripts/make-song-fixtures.mjs` and regenerate its `.als` so `test/set-builder.test.ts:352-363` is not vacuous.
  - **Finding 4 (LOW):** rename `SERMON_TITLE_CONSTANT` to `SAMPLE_MESSAGE_B` in `test/propresenter.test.ts:7127, 7359, 7378` so no real sermon title remains in the public copy.
- **Can ride along in the same cleanup pass:** Finding 5 (Comment hygiene in the two fixture READMEs).

## Remediation — 2026-11-24
| Finding | Commit | Proof | Comments added | Verify verdict |
| --- | --- | --- | --- | --- |
| 1 (MEDIUM) | `2339f93` pre-PR review 1 finding 1 and review 2 finding 1: an old review keeps the truncated church email | red→green: `node --test --test-name-pattern="finding 1" docs/reviews/setlist-controller-604/repro/review-1-findings.mjs`; `git grep -inE 'nick@' -- ':!docs/reviews/setlist-controller-604/*'` prints nothing | 0 | fixed (proved by execution) |
| 2 (MEDIUM) | `704ce54` pre-PR review 1 finding 2: the unknown service type trace names a service type that now exists | red→green: `env -u NO_COLOR -u FORCE_COLOR pnpm exec vitest run test/build-set-skill.test.ts -t "plan-listing-no-such-service-type"` (new stderr check from the trace's Note; red with the 404), repro "finding 2"; `test/build-set-skill.test.ts` and `test/build-set-skill-quotes.test.ts` 300/300 | 1 (the trace format's Note line in `test/build-set-traces.ts`) | fixed (proved by execution) |
| 3 (MEDIUM) | `715603d` pre-PR review 1 finding 3: the synthetic This Is Amazing Grace carries no locator keys, so its key test cannot fail | red→green: `env -u NO_COLOR -u FORCE_COLOR pnpm exec vitest run test/set-builder.test.ts -t "computer-key mapping every locator"` (new input check, red before regenerating), repro "finding 3"; mutation of `write-set.ts:331` turns it red; preserve suites 504/504; the other five sets byte-identical | 2 (the generator's SONGS header) | fixed (proved by execution) |
| 4 (LOW) | `fedf845` pre-PR review 1 finding 4: a ProPresenter test constant keeps a sermon title | red→green: repro "finding 4"; `test/propresenter.test.ts` 385/385 | 0 | fixed (proved by execution); worked as a LOW because Nick asked for every sermon title to be replaced |
| 5 (LOW) | `f9b63e8` pre-PR review 1 finding 5: the fixture READMEs name the wrong file for the plan titles | comment hygiene, checked by reading: the past plans file holds the `Message` titles, and no README has two blank lines in a row | 0 | fixed; Nick asked for both reviews cleared |

Full checks after the round: `pnpm typecheck` and `pnpm lint` clean; `env -u NO_COLOR -u FORCE_COLOR pnpm test -- --maxWorkers=5` 3,264 passed, 4 skipped.

### Known regressions, deferred
None.

### Rework briefs
None.

## Approach decisions
- Finding 1 takes review 2 finding 1's two-row rewrite, not this doc's one-row fix, because line 18 also called the constant exactly an email. Both reviews' finding 1 close in one commit.
- Finding 2 changes the trace's requested name (this doc's recommended fix), not the fixture's stand-in, and adds a stderr check for a trace whose Note opens "The listing prints `<text>` on stderr", so a listing that fails for another reason goes red.
- Finding 3 mirrors the MultiTracks session's own shape at `74f2edc`: a key on each locator, and `NextLocatorMapping` (`.`) and `PreviousLocatorMapping` (`,`) after the list. The test checks its input carries them before it checks the built set drops them.
