# Pre-PR review: setlist-controller#58 Planning Center plan, second run (#158 to #161)

**Branch:** `setlist-controller-58-planning-center-plan` vs `origin/main` (merge-base `fe40b98` "Merge pull request #167 from nick-vogel/setlist-controller-113-connections-foundation")
**Reviewed at:** HEAD `af822f1` (setlist-controller#160 Plan problem lines that read wrong), clean tree: 0 files with uncommitted changes, 0 untracked; 14 files total, +736 / -155 against the merge-base
**Reviewed against:** the epic body of setlist-controller#58; the bodies of its four open sub-issues #158 (a plan key that is not a note name), #159 (the build's song checks in `--plan --list`), #160 (plan problem lines that read wrong) and #161 (the token file and `PCO_ENV`); the run's recorded decisions and proposals per ticket (`.epic-loop/tickets/<n>/assumptions.md`, `proposals.md`), read so that a recorded decision is not re-reported as a defect; the Approach decisions of `pre-pr-review-1.md` (the first run's review, whose findings 1, 2 and 4 and NFI A are #160's and #161's scope). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape. Round 1 of this run, `--fresh`, so the whole surface is reviewed and no delta scoping applies.
**Date:** 2026-10-21
**Reviewer:** 2 code-review agents + 1 test-audit agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | up to date; the branch changes neither `package.json` nor `pnpm-lock.yaml` |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and command suites | `pnpm test` | pass: 48 files, 983 passed, 4 skipped |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | pass: 42 passed |
| Tautology audit | the branch's 4 modified test files run against a scratch worktree at `fe40b98` | 40 tests added or changed: 36 red at base for the missing behaviour, 4 green at base and kept (see Test quality) |
| `buildSet` / `setProblems` split | diff read line by line, both agents | every check moved into `readInputs` in its old order with its old inputs; the existing-set-folder check runs only in `buildSet`, last; nothing is read twice |
| Listing and build share inputs | `main.ts` read: `templatePath()`, `stemMapFile()`, `transitionsWithFlags`, `padsPath`; `pickFolders` folders equal `planFolders` folders | held |
| Listing with an unreadable `--template` | executed repro `repro/review-2-listing-unreadable-template.test.ts` | works: full listing on stdout, one stderr line, exit 1, the build prints the same line, nothing written. No test in `test/` pins it (finding 1) |
| `planKey` edge cases | agent probe importing `planKey` and `pickFolders` | `e`→E, `em`→Em, `bb`→Bb, `f#m`→F#m, `G-A`→G, `G - A`→G, `C#-D`→C#; `Gm7`, `H`, `-A`, `EM` stay as written |
| `keysOf` mixed library | agent probe: D, two in D, key `e`, key `Gm7`, two keyless | `D, X (its folder name's key, "e", ...) and Y (...), and in A and B, whose names write no key`; D once, "no key" never stands for a key |
| Token path and parse rules | agent probe of `tokenFilePath` and `tokenValues` | `''`/unset → default under HOME; `~`, `~/a` → home; `~user/a` and relative → from INIT_CWD; `export<TAB>A=1` → A; `exportA=1` → `exportA`; `A=x=y` → `x=y`; one matching quote pair stripped |
| Body-read failure classification | executed probes against a local server; repro `repro/review-2-corrupt-gzip-body.test.ts` | a socket destroyed mid-body → "Cannot reach" (correct); a whole answer with a corrupt gzip body → "Cannot reach" too (finding 3) |
| Recorder import | agent: scratch `.mjs` importing `plan-reader.ts` under Node 26.3.0 | loads; no runtime cycle; eslint clean. Never run against the real API |
| Docs | README, USAGE and SKILL sentences the diff touches, sampled against the code | match; SKILL's "step 6 of the Steps" exists |
| Not run | the fixture recorder; anything against the real Planning Center API | by the repo's guardrails |

**Overall:** The four tickets do what their acceptance criteria ask, and all five full checks are green. The refactor at the centre of #159 moved every build check into one shared function without changing its order or its inputs, and the listing feeds it exactly what the build would. The review confirmed three LOW findings and a comment-hygiene batch, none MEDIUM or higher, so the branch can open its PR as it stands, with the findings as optional follow-ups or a short remediation pass.

## Approach decisions
- **A plan with no songs (review 1 finding 1, #160 item 1):** one reader problem in `readPlan` after the order-of-service loop, worded with the type's name; `build-set.ts`'s own guard stays. Landed as decided.
- **A multi-line folder problem in the listing (review 1 finding 2, #160 item 2):** the problem's first line keeps the folder field, its other lines follow the song line. Landed as decided.
- **Fallback tests (review 1 finding 3):** each new test runs the command through the package script against the fake, with a body derived from a recorded fixture, as `planningCenterWith` (`test/set-builder-plan-list.test.ts:96`) and `planningCenterEditing` (`test/set-builder-plan-folders.test.ts:57`) do. Findings 1 and 2 below follow it. A reader-level classification test may call `readPlan` against a scratch server, as `brokenPlanningCenter` (`test/set-builder-plan.test.ts:100`) and #160's own proof did, since the fake cannot send a corrupt body.
- **Body-read failures (finding 3):** classify by the error, as `timedOut` (`src/set-builder/plan-reader.ts:120`) already does: a timeout is late, a `SyntaxError` or an inflate error (`cause.code` starting `Z_`) is an answer that cannot be read, anything else is the connection.

## Confirmed Issues
### 1. The listing's stop for a template or stem map it cannot read has no test — LOW
- **Location:** `src/set-builder/main.ts:183-190`
- **Attribution:** introduced by `cb54362` (setlist-controller#159 Run the build's song checks in --plan --list); `git log -S'setProblems' fe40b98..HEAD` names only that commit.
- **Real-world trigger:** none that delivers a wrong result: the behaviour is correct by execution. The gap is that #159's acceptance criterion "a stem map it cannot read stops the listing with the same one line as the build" is unpinned, so a later change to the catch could break it silently. LOW, capped: no user path to a wrong outcome today.

**Evidence**
```ts
  try {
    const stemMap = await stemMapFile();
    const songs = folders.filter((folder) => folder !== undefined);
    const found = await setProblems({ library, template: templatePath(), stemMap, songs, transitions, pads: padsPath });
    if (found.length > 0) fail(found);
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
```
`grep -n "template\|stem-map\|stemMap" test/set-builder-plan-list.test.ts` finds only the readable no-PAD-track template test at `:396`; no test in `test/` sends the listing an unreadable template or stem map.

**Failure mode** — none today. `repro/review-2-listing-unreadable-template.test.ts` passes at `af822f1`: with `--template <missing.als>` on the November 1 plan, the listing prints the clean listing on stdout, one line naming the missing file on stderr, exit 1; `--plan` with the same flag prints the same stderr; nothing is written. At `fe40b98` the listing ran no checks, so the same test is red there (exit 0).

**Recommended fix** — move the repro's case into `test/set-builder-plan-list.test.ts` beside `:396`, using that file's `run`, `tokenFile`, `planningCenter` and `expectReadOnly` helpers, and add a stem-map case that runs a copy of `src/` with a broken `config/stem-map.json`, as `test/set-builder-command.test.ts:562-574` does, asserting the listing on stdout, the build's one stem-map line on stderr, and exit 1.

**Remediation brief**
- **Design intent:** `--plan --list` runs the build's own checks (`setProblems`, `src/set-builder/build-set.ts`) only when every song has a folder and no song change has a problem. A stem map or template that cannot be read throws inside the `try`, and the listing prints that one line on stderr after the listing, the same line the build prints from its own `catch` (`main.ts:229-232`). Tests only; no code change.
- **Full surface:** `test/set-builder-plan-list.test.ts` (new tests beside `:396`); the stem-map precedent at `test/set-builder-command.test.ts:562-574`.
- **Must preserve:** every current test in `test/set-builder-plan-list.test.ts`, which must pass unchanged; the stdout listing byte-identical to the clean run.
- **Do not touch:** `main.ts:183-190` itself, which behaves correctly.
- **Proof:** `cp docs/reviews/setlist-controller-58/repro/review-2-listing-unreadable-template.test.ts test/ && pnpm exec vitest run test/review-2-listing-unreadable-template.test.ts; rm test/review-2-listing-unreadable-template.test.ts` passes now; the moved tests must pass, and must fail when the `catch` at `main.ts:188-190` is removed.

### 2. The plan-key reading through the `starting_key` fallback, and two token-file fallbacks, have no test — LOW
- **Location:** `src/set-builder/plan-reader.ts:243-244`; `src/set-builder/plan-reader.ts:16-19` and `:49-50`
- **Attribution:**
  - The `starting_key` reading is introduced by `11a6db2` (setlist-controller#158 Read a Planning Center key that is not a note name): at `fe40b98` the fallback's text went to the match raw (`git show fe40b98:src/set-builder/plan-reader.ts`, line 220).
  - `PCO_SECRET=""` reaching "has no PCO_SECRET" is pre-existing, exposed by `063c635` (#161), whose double-quote strip makes an empty quoted value reach that path.
  - The relative `PCO_ENV` resolved from INIT_CWD is pre-existing; `063c635` rewrote it into `tokenFilePath`.
- **Real-world trigger:** none that delivers a wrong result. The behaviour holds by probe; nothing pins it. LOW, capped: upgrade if a plan's song item arrives with `key_name` null and a lower-case or key-change `starting_key`, which no recording shows (every recorded `starting_key` is D, E, F or G with `starting_minor: false`).

**Evidence**
```ts
const written = text(item.attributes.key_name) ?? (text(key?.starting_key) && `${text(key?.starting_key)}${key?.starting_minor === true ? 'm' : ''}`);
const keyName = written ? planKey(written) : undefined;
```
`grep -rn "starting_key\|starting_minor" test/*.ts` finds nothing. `planningCenterEditing` (`test/set-builder-plan-folders.test.ts:57-75`) with `key: null` nulls both `key_name` and the key relationship, so the fallback never runs. `grep -rn "has no PCO_" test/*.ts` finds nothing. No test in `test/set-builder-plan.test.ts:899-990` passes a relative `PCO_ENV`.

**Failure mode** — none today. A change that dropped `planKey` from the fallback, or that stopped treating `PCO_SECRET=""` as missing, would leave every test green.

**Recommended fix** — tests only:
- In `test/set-builder-plan-folders.test.ts`, an edit that sets Fall Like Rain's `key_name` to null, keeps its key relationship, and sets the included Key's `starting_key` to `e`: the build picks the E folder, exit 0. A second case with `starting_minor: true` against an `Em` folder.
- In `test/set-builder-plan.test.ts`'s token describe (`:899`), a token file with `PCO_SECRET=""` gives `The Planning Center token file <file> has no PCO_SECRET.`, exit 1, no request; and a relative `PCO_ENV` (run with `cwd` the workspace's home folder and `INIT_CWD` set to it) reads that file.

**Remediation brief**
- **Design intent:** the plan reader is the one place a plan key enters; `planKey` (`src/set-builder/pads.ts:150`) reads either source the same way. `readToken` checks the path is a file, then its mode, then parses with `tokenValues`, and a problem names the file and the missing name, never a value.
- **Full surface:** `test/set-builder-plan-folders.test.ts:57-75` (`planningCenterEditing` needs a way to keep the relationship and edit the included Key; or a sibling helper); `test/set-builder-plan.test.ts:899-990`.
- **Must preserve:** every current test in both files; `planningCenterEditing`'s current `key: null` meaning (no key at all), which the "no key in the plan" tests rely on.
- **Do not touch:** `plan-reader.ts:243-244`, `:16-19`, `:24-35`, which behave correctly.
- **Proof:** the new tests pass at HEAD, and the `starting_key` case fails when `planKey(written)` at `plan-reader.ts:244` is replaced by `written`.

### 3. A whole answer whose compressed body cannot be inflated reads as "Cannot reach Planning Center" — LOW
- **Location:** `src/set-builder/plan-reader.ts:138-141`
- **Attribution:** introduced by `f187dac` (setlist-controller#160 Plan problem lines that read wrong): at `fe40b98` every non-timeout body error fell through to "cannot be read"; `git log -S'instanceof SyntaxError' fe40b98..HEAD` names only `f187dac`.
- **Real-world trigger:** Planning Center, or a proxy between the Mac and it, sends `content-encoding: gzip` with a body that does not inflate. The operator is online, and the line tells them to build while the Mac is on the internet. LOW, capped: no observed case; upgrade if a Planning Center answer is ever seen to fail inflation.

**Evidence**
```ts
    } catch (error) {
      if (timedOut(error)) return late();
      if (!(error instanceof SyntaxError)) return fail(`Cannot reach Planning Center at ${apiBase}. ${offline}`);
    }
```
Under Node 26.3.0, `response.json()` on a corrupt gzip body throws `TypeError: terminated` with `cause.code` `Z_DATA_ERROR`; on a socket closed mid-body it throws `TypeError: terminated` with `cause.code` `UND_ERR_SOCKET`. Only the cause tells them apart.

**Failure mode** — executed: `repro/review-2-corrupt-gzip-body.test.ts` case 1 expects `Planning Center sent an answer to /service_types that cannot be read.` and receives `Cannot reach Planning Center at http://127.0.0.1:<port>. Build the set while this Mac is on the internet, before it joins the stage network.` Case 2 (the control, a socket destroyed mid-body) passes and must keep passing.

**Recommended fix**
```diff
-      if (!(error instanceof SyntaxError)) return fail(`Cannot reach Planning Center at ${apiBase}. ${offline}`);
+      if (!(error instanceof SyntaxError) && !inflateFailed(error)) return fail(`Cannot reach Planning Center at ${apiBase}. ${offline}`);
```
with, beside `timedOut` at `:120`:
```ts
  const inflateFailed = (error: unknown) =>
    error instanceof Error && typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause && typeof error.cause.code === 'string' && error.cause.code.startsWith('Z_');
```
The fall-through then reaches `isDocument(undefined)`, false, and the existing "cannot be read" line. Update the comment at `:132-134` to name the inflate case with the not-JSON case.

**Remediation brief**
- **Design intent:** each request's failure reads as exactly one cause: a timeout is late (`late()`), a connection failure reads `Cannot reach Planning Center at <base>.` with the offline advice, and an answer that arrived but cannot be turned into a JSON:API document reads `... sent an answer to <path> that cannot be read.` No line ever carries the body.
- **Full surface:** `src/set-builder/plan-reader.ts:120` (the new helper beside `timedOut`), `:132-134` (comment), `:139-140` (the condition). The header-phase catch at `:127-128` is a different phase and does not change.
- **Must preserve:** a socket dropped mid-body keeps the connection line: `test/set-builder-plan.test.ts:616` ("says it cannot reach Planning Center ... when the connection drops partway through an answer"). A whole body that is not JSON keeps "cannot be read": the `notADocument` `it.each` at `test/set-builder-plan.test.ts:283`. A timeout keeps `late()`.
- **Do not touch:** the fix's failure case: an error with no `cause`, or a `cause` with no string `code`, must still fall to the connection line, which the helper's guards ensure.
- **Proof:** `cp docs/reviews/setlist-controller-58/repro/review-2-corrupt-gzip-body.test.ts test/ && pnpm exec vitest run test/review-2-corrupt-gzip-body.test.ts; rm test/review-2-corrupt-gzip-body.test.ts` fails case 1 now and must pass both cases after; then move both cases into `test/set-builder-plan.test.ts` beside `:616`.

### 4. Comment hygiene — LOW (aggregated)
- `src/set-builder/build-set.ts:134-135` — "It throws as the build does: on no song, a transition at no song position, and a template it cannot read." → "... and a template it cannot read once the library is listed; with a library it cannot list, a template it cannot read adds no problem (readableTemplateProblems)."
- `src/set-builder/plan-reader.ts:132-134` — "A body the connection drops partway through is the connection's problem" → "A body the connection drops before its stated length or its last chunk is the connection's problem; one cut short on a connection that closes with no length arrives as JSON that does not parse, and cannot be read." (an agent probe of a close-delimited body cut short gave `SyntaxError`; HTTP cannot tell that from a whole body)
- `src/set-builder/plan-folders.ts:11` — a header line of about 190 characters in a block that wraps near 120 → rewrap the block.

## Needs Further Investigation
### A. The `starting_key` fallback could read `Emm` — what would confirm it
The fallback appends `m` when `starting_minor` is true (`plan-reader.ts:243`, unchanged from `fe40b98`). If Planning Center ever writes a minor `starting_key` as `Em` with `starting_minor: true`, the reader builds `Emm`, which #158 now reports as "planned in Emm, which is not a key", a key the plan never shows. Every recorded Key has `starting_minor: false`. Recording one song item with a minor key and no `key_name` would settle it; the proposal already filed under #158 (record a lower-case or key-change `key_name`) could record it in the same pass. Pre-existing.

## Reviewed and Dismissed
- `planKey` reads the plan key leniently while `songNoteKey` reads folder keys strictly, so a folder `X-y-e-70.00bpm` never matches a plan key `e` — by design per #158: a folder whose key is no note name is named by its folder name, and the folder is what to fix (`test/set-builder-plan-folders.test.ts:322` pins it).
- A plan song title with an embedded newline would split oddly in `planListing`'s `.split('\n')` — unreachable in practice, and the title field already carries that newline.
- `export` with a tab, `export` with a quoted value, `A=x=y`, a trailing `\r`, mismatched quotes — all parse correctly by probe.
- `e#` and `fb` read as `E#` and `Fb`, accepted as note names — `isKey` is unchanged from `fe40b98`; not this branch.
- `checkPlanId` placement — before the token read in both `build()` and `planList()`, after the flag checks; the `--plan` test proves it with a token path that does not exist.
- The recorder's import of a `.ts` module from `.mjs` — loads under Node 26 type stripping; it now gains the not-a-file and mode checks, intended per #161.
- The listing's `folders.filter(...)` passing only defined folders — reached only when every pick is ok, so no position shifts.
- The changed fixture of "names a pad's own key from --pad n=<key>" (`test/set-builder-plan-list.test.ts:288`, `addPad(workspace, 'G', 120)`) — a listing test, not a build test, adjusted because the listing now runs the pad checks; recorded in #159's assumptions.

## Minor / nits
- A `PCO_ENV` of spaces alone resolves to `<from>/ ` and fails "Cannot read the Planning Center token file", while `--plan-id` treats spaces alone as empty. `pcoEnv?.trim() === ''` would align them.
- `--plan-id ' 92852532 '` passes `checkPlanId` but is sent untrimmed (`main.ts:300`), so it reads as no such plan; pre-existing, `planId: values['plan-id']?.trim()` would fix it.
- The skill's "Exit 1 with song lines" step does not say a "keep one:" problem's folder names follow on indented lines; the "Nick keeps one of the folders it lists" entry mostly covers it.

## Test quality
Tests added or changed: 40 · red at `fe40b98`: 36, each for the missing behaviour · green at `fe40b98`: 4, all kept:
- "builds a plan whose listing exits 0, exit 0, in the same workspace" (`test/set-builder-plan-list.test.ts:410`, `cb54362`) — #159 asks for it; it guards against a false positive from the listing's checks.
- "does not report a set folder for the date that already exists ..." (`:427`, `cb54362`) — #159 asks for it; it would go red if the existing-folder check moved into `setProblems`.
- "lists the plan with an absolute PCO_ENV and a plain token file" (`test/set-builder-plan.test.ts:902`, `063c635`) — the control of #161's proof, and the only token test with an unquoted secret.
- "names a pad's own key from --pad n=<key>" (`test/set-builder-plan-list.test.ts:286`) — setup only changed; assertions unchanged.

Tautology shapes found: 0 (no mocks of the unit, no snapshots, no expectation computed with production helpers, no assertion-free test). Weak spots, none a finding:
- The five token-file tests that list the plan (`test/set-builder-plan.test.ts:902`, `:914`, `:926`, `:939`, `:951`) assert `stderr === ''` and the date line, not the exit code; the bare workspace has no Fall Like Rain folder, so they likely exit 1 on that folder line. They still go red for the right reason. Adding the folder and asserting exit 0 would pin the whole outcome.
- `not.toContain('in no key')` at `test/set-builder-plan-folders.test.ts:210` and `not.toContain(mark)` at `test/set-builder-plan.test.ts:630` follow exact `toBe` assertions and cannot go red alone.
- `expectNoTokenValue` (`test/set-builder-plan.test.ts:892`) passed at base for every case: a guard against a future leak, not proof of a fix.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `af822f1`; Playwright green too. The two new repro files under `repro/` pass `eslint`.
- **Commit hygiene:** commit this doc and the two repro files; nothing else is in the tree.
- **Likely reviewer asks:** a test for the listing's unreadable stem map (finding 1); whether Planning Center sends 0 or null for a missing BPM (#160's open question, a proposal under #160).

## Verdict
**Ready to open the PR.** Zero CRITICAL, HIGH or MEDIUM findings. Findings 1 to 4 are LOW; they can be remediated in one short pass or filed as follow-ups, and none gates the PR.
