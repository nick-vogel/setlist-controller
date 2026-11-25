# Pre-PR review: setlist-controller#32 Set builder follow-up #151, the stem map's shape

**Branch:** `setlist-controller-32-set-builder` vs `origin/main` (merge-base `7b7f066` "Merge pull request #152 from nick-vogel/setlist-controller-32-set-builder")
**Reviewed at:** HEAD `d974cf9` (setlist-controller#151 A stem map with the wrong shape stops pnpm build-set without naming config/stem-map.json, the lane merge of `718518e`), clean tree: 0 files with uncommitted changes, 0 untracked; 3 files total, +59 / -4 against the merge-base (`src/set-builder/main.ts`, `test/set-builder-command.test.ts`, `README.md`). 2 commits: the implement commit `718518e` and its merge.
**Reviewed against:** the body of setlist-controller#151 (filed from `pre-pr-review-4.md` finding 4 and its Minor note on `null` and `{ "VOX": 5 }`), and the Approach decisions of `pre-pr-review-4.md`. The repo still has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Run with `--fresh`: round 1 of this run, reviewing the whole diff against `origin/main`, not a delta.
**Date:** 2026-10-21
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | up to date |
| Lint | `pnpm lint` | green |
| Typecheck | `pnpm typecheck` | green |
| Unit and integration suites | `pnpm test` | green: 34 files, 723 passed, 3 skipped |
| Build | `pnpm build` | green |
| End to end | `pnpm test:e2e` (Playwright, OS-assigned ports) | green: 30 passed |
| Branch tests at `$BASE` (tautology oracle) | `test/set-builder-command.test.ts` copied into a scratch worktree at `7b7f066`, `-t "config/stem-map.json is"` run, worktree removed | 6 red, 2 green. Every new row is red for its intended reason: the list, number and string top levels print 17, 17 and 20 lines; `null` prints `Cannot convert undefined or null to object`; the string group prints `the stem map has no group for the stem "BGVS"`; the number in a list exits 0 and writes a set. The two #110 rows are green, as they should be |
| Mutation: base `main.ts` (no gate) | finder agent, filtered run | all 6 new rows red |
| Mutation: drop `Array.isArray(value)`; drop `value === null`; drop `stems.every(...)`; drop the file name from the group line | finder agent, filtered run | red under each: covered |
| Mutation: drop `${names}` from the group line; name only `groups.at(-1)` | finder agent, filtered run | green under each (finding 1) |
| Mutation: plain `join(', ')` for the group list | finder agent, filtered run | green (finding 1) |
| Mutation: `jsonKind` always `'a list'`; `jsonKind` without the boolean branch | finder agent, filtered run | green under each (finding 2) |
| Mutation: reject an empty group (`stems.length > 0`) | finder agent, whole suite | green, 723 passed (finding 3) |
| Mutation: accept an object-valued group in place of `Array.isArray(stems)` | finder agent, filtered run | green (Minor) |
| Mutation: `return value as StemMap` in place of `Object.fromEntries(entries)` | finder agent, filtered run | green; equivalent for a map that passed the loop, not a defect |
| `stemMapShape` over seven inputs | its source extracted into a scratchpad script and run with node | outputs quoted in findings 1, 2 and 4 and the Minor notes; `{"OTHER":[]}` passes |
| Every reader of the stem map | `git grep stem-map` and `grep -rn StemMap src` | `main.ts:127` is the one production read, through `stemMapFile`; `checks.ts`, `template.ts` and `write-set.ts` take the gated map; `test/set-builder-harness.ts:88` (`readStemMap`) is a test-only reader that bypasses the gate |
| Not run | real library songs under `~/Music/MultiTracks`, Live itself | out of the run's guardrails, and nothing in this diff reaches them |

**Overall:** #151 does what its issue asks: the gate sits in `stemMapFile` as round 4 recorded, runs before anything walks the map, and every case the issue names now stops with one line that names `config/stem-map.json`, and the group for a group. Every full check is green and no finding is above LOW. Three findings are test gaps that hand-made mutations survive: the group line's naming clause and its "A, B and C" join, the top-level line's "what it is instead", and an empty group passing the gate. The fourth is copy: for a group whose list holds a number, the line says to put the stems in brackets when they already are. The branch can open its PR as it stands.

## Approach decisions
- **Cleanup after a failed write, failed cleanup, write-failure trigger, controller cross-check, end marker, relative path flags, name matching, doubled stem, clip outside its song's folder (rounds 1 to 4):** unchanged.
- **Stem map read errors (#110) and shape (#151):** `stemMapFile` (`main.ts:157-172`) is the one gate between `config/stem-map.json` and the build, inside `build()`'s `try`. A read error, a JSON error and a wrong shape each throw one line that names the file; the shape check is `stemMapShape` (`main.ts:177-195`), called last in `stemMapFile`. Everything after the gate trusts `StemMap` (`build-set.ts:21`). Round 4 finding 4's `isStemMap` predicate is superseded by `stemMapShape`, which also names the bad groups. The fixes below keep that mechanism and change only the line's text and the tests.

## Confirmed Issues
### 1. Nothing tests that the group line names the group, or how it joins several groups — LOW
- **Location:** `test/set-builder-command.test.ts:578`; the code it should pin at `src/set-builder/main.ts:188-190`
- **Attribution:** introduced by `718518e` (setlist-controller#151), which added both the line and the assertion.
- **Real-world trigger:** none for a user; it is a test gap. A later edit that drops `${names}` from the line, or breaks the join, ships green. LOW.

**Evidence**
```ts
if (group !== undefined) expect(result.stderr).toContain(group);
```
```ts
const names = groups.length === 1 ? groups[0] : `${groups.slice(0, -1).join(', ')} and ${groups.at(-1)}`;
`config/stem-map.json lists the stems of ${names} as something other than a list of stem names. Put each group's stems in brackets: "${groups[0]}": ["<stem>"].`,
```

**Failure mode** — The line names the first bad group twice: once in the clause and once in the closing example. `toContain('VOX')` is met by the example alone, so the finder's mutations that drop `${names}` from the clause, or name only `groups.at(-1)`, stay green. Every row has exactly one bad group, so the multi-group branch never runs; a plain `join(', ')` stays green too. Executed: `{"VOX":"x","KEYS":1,"OTHER":null}` prints `lists the stems of VOX, KEYS and OTHER as`, which is right today and pinned by nothing.

**Recommended fix** — Assert the clause, and add a row with three bad groups. In the `it.each` at `test/set-builder-command.test.ts:531-564`, rename the `group` field to `names` (the two existing group rows keep `names: 'VOX'`), add this row after `:562`:
```ts
    {
      name: 'three groups that are not lists of stem names',
      names: 'KEYS, VOX and OTHER',
      stemMap: async (config: string) => {
        const text = await readFile(join(REPO_ROOT, 'config/stem-map.json'), 'utf8');
        const map = JSON.parse(text) as Record<string, unknown>;
        await writeFile(join(config, 'stem-map.json'), JSON.stringify({ ...map, VOX: 'BGVS', KEYS: 1, OTHER: null }, null, 2));
      },
    },
```
and replace `:564` and `:578`:
```diff
-  ])('prints one problem line without a stack, exits 1 and writes nothing when config/stem-map.json is $name', async ({ stemMap, group }) => {
+  ])('prints one problem line without a stack, exits 1 and writes nothing when config/stem-map.json is $name', async ({ stemMap, names }) => {
...
-    if (group !== undefined) expect(result.stderr).toContain(group);
+    if (names !== undefined) expect(result.stderr).toContain(`config/stem-map.json lists the stems of ${names} as `);
```

**Remediation brief**
- **Design intent:** the group line is how the operator finds the group to fix, so the clause `lists the stems of <groups> as` carries every bad group, in `Object.entries` order, joined "A, B and C". The closing example names only the first, as a template to copy.
- **Full surface:** `test/set-builder-command.test.ts:531-579` only. No source change. The spread `{ ...map, VOX, KEYS, OTHER }` keeps each key at its position in the committed map (KEYS, VOX, OTHER in that order), which is why the expected list reads `KEYS, VOX and OTHER`.
- **Must preserve:** the existing eight rows and their assertions (one line, no stack, exit 1, file named, nothing written); the two #110 rows, which carry no `names` field.
- **Do not touch:** `stemMapShape`'s join and message (`main.ts:188-190`), which are correct; only the tests change here. Finding 4 changes the advice half of the same line: whichever lands second keeps the other's text.
- **Proof:** with the clause assertion in place, temporarily replace `${names}` with `a group` at `main.ts:190`: the two existing group rows and the new row go red; with `join(', ')` at `:188`, the new row goes red. Then `pnpm exec vitest run test/set-builder-command.test.ts -t "config/stem-map.json is"` is green on the real code.

### 2. Nothing tests that the top-level line says what the top level is, and the boolean case never runs — LOW
- **Location:** `test/set-builder-command.test.ts:542-545`; the code at `src/set-builder/main.ts:178-180` and `:197-201`
- **Attribution:** introduced by `718518e` (setlist-controller#151).
- **Real-world trigger:** none for a user; a test gap. #151's acceptance criteria ask that the line "says what's wrong with it", and nothing pins that half. LOW.

**Evidence**
```ts
throw new Error(`config/stem-map.json must be an object that lists each group's stem names, and its top level is ${jsonKind(value)}.`);
...
function jsonKind(value: unknown): string {
  if (Array.isArray(value)) return 'a list';
  if (value === null || typeof value === 'boolean') return String(value);
  return `a ${typeof value}`;
}
```

**Failure mode** — The four top-level rows assert one line, exit 1, the file name and nothing written. The finder's mutation of `jsonKind` to always return `'a list'` stays green, as does removing its boolean branch. Executed: `true` prints `its top level is true.`, correct and untested.

**Recommended fix** — Give each top-level row a `kind` field and assert the tail of the line, and add a `true` row:
```diff
-    { name: 'a list at the top level', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '[["BGVS"]]\n') },
-    { name: 'a number at the top level', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '42\n') },
-    { name: 'null at the top level', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), 'null\n') },
-    { name: 'a string at the top level', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '"VOX"\n') },
+    { name: 'a list at the top level', kind: 'a list', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '[["BGVS"]]\n') },
+    { name: 'a number at the top level', kind: 'a number', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '42\n') },
+    { name: 'null at the top level', kind: 'null', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), 'null\n') },
+    { name: 'a string at the top level', kind: 'a string', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '"VOX"\n') },
+    { name: 'true at the top level', kind: 'true', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), 'true\n') },
```
with `kind` added to the destructured row and, beside the `names` assertion of finding 1:
```diff
+    if (kind !== undefined) expect(result.stderr).toContain(`its top level is ${kind}.`);
```

**Remediation brief**
- **Design intent:** a top level that is not a plain object stops with one line that names the file and says what the top level is instead, through `jsonKind`: `a list`, `null`, `true` or `false`, else `a <typeof>`.
- **Full surface:** `test/set-builder-command.test.ts:542-545`, the destructuring at `:564`, and the assertions at `:577-578`. No source change.
- **Must preserve:** every existing row and assertion, including the #110 rows, which carry no `kind`.
- **Do not touch:** `jsonKind` (`main.ts:197-201`), correct for every JSON value.
- **Proof:** temporarily make `jsonKind` return `'a list'`: the number, null, string and true rows go red; remove its boolean branch: the true row goes red (`a boolean`). Then `pnpm exec vitest run test/set-builder-command.test.ts -t "config/stem-map.json is"` is green.

### 3. Nothing tests that an empty group passes the gate — LOW
- **Location:** `src/set-builder/main.ts:184`; no test
- **Attribution:** introduced by `718518e` (setlist-controller#151), which added the gate. Round 4 finding 4's brief named "An empty group (`"OTHER": []`) passes" as a Must preserve.
- **Real-world trigger:** none today. The committed `config/stem-map.json` has no empty group, and the build tests read the map through `test/set-builder-harness.ts:88` (`readStemMap`), which bypasses the gate. A later tightening of the gate (say, `stems.length > 0`) would stop a build the day Nick empties a group in the map, and the whole suite stays green (finder, 723 passed under that mutation). LOW.

**Evidence**
```ts
if (Array.isArray(stems) && stems.every((stem): stem is string => typeof stem === 'string')) entries.push([group, stems]);
```

**Failure mode** — Executed: `{"OTHER":[]}` passes `stemMapShape` today. Nothing pins it.

**Recommended fix** — Add one command test after the `it.each` at `test/set-builder-command.test.ts:580`, running the same copied `src/` with the committed map plus an empty group, and asserting only that the gate is silent:
```ts
  it('lets a stem map with an empty group through to the build', async () => {
    const workspace = await createWorkspace();
    const app = join(workspace.dir, 'app');
    await cp(join(REPO_ROOT, 'src'), join(app, 'src'), { recursive: true });
    await mkdir(join(app, 'config'));
    const map = JSON.parse(await readFile(join(REPO_ROOT, 'config/stem-map.json'), 'utf8')) as Record<string, unknown>;
    await writeFile(join(app, 'config/stem-map.json'), JSON.stringify({ ...map, OTHER: [] }, null, 2));

    const result = await output(spawn(process.execPath, [join(app, 'src/set-builder/main.ts'), 'grace', '--date', DATE, ...paths(workspace)], { cwd: workspace.dir }));

    expect(result.stderr).not.toContain('config/stem-map.json');
  });
```

**Remediation brief**
- **Design intent:** the gate checks shape, not content. A group with no stems is a valid map; whether every song's stems are mapped is `stemProblems`' job (`checks.ts:59`), after the gate.
- **Full surface:** `test/set-builder-command.test.ts`, one new `it` after `:580`. No source change. The test asserts nothing about the exit code, because emptying OTHER may leave a stem of This Is Amazing Grace unmapped, and that is the later check's business.
- **Must preserve:** the `it.each` above it; the copied-`src/` pattern and its comment at `:529-530`, which the new test follows.
- **Do not touch:** `stemMapShape`'s condition at `main.ts:184`.
- **Proof:** temporarily add `stems.length > 0 &&` to the condition at `main.ts:184`: the new test goes red with the group line naming OTHER. Then `pnpm exec vitest run test/set-builder-command.test.ts -t "empty group"` is green.

### 4. For a group whose list holds a number, the line says to put the stems in brackets when they already are — LOW
- **Location:** `src/set-builder/main.ts:190`
- **Attribution:** introduced by `718518e` (setlist-controller#151).
- **Real-world trigger:** hand-editing `config/stem-map.json` and leaving a stem without quotes, `"VOX": ["BGVS", 1]` or a stray nested list. The build still stops with the file and the group named, so the operator finds the spot; only the advice points at the wrong fix. LOW.

**Evidence**
```ts
`config/stem-map.json lists the stems of ${names} as something other than a list of stem names. Put each group's stems in brackets: "${groups[0]}": ["<stem>"].`,
```

**Failure mode** — Executed: `{"VOX":["BGVS",1]}` prints `... Put each group's stems in brackets: "VOX": ["<stem>"].`, the same advice as `{"VOX":"BGVS"}`, for a group whose stems are in brackets already.

**Recommended fix** — Choose the advice by what the first bad group holds, since the example names that group:
```diff
   const entries: [string, string[]][] = [];
   const groups: string[] = [];
+  let firstIsList = false;
   for (const [group, stems] of Object.entries(value as Record<string, unknown>)) {
     if (Array.isArray(stems) && stems.every((stem): stem is string => typeof stem === 'string')) entries.push([group, stems]);
-    else groups.push(group);
+    else {
+      if (groups.length === 0) firstIsList = Array.isArray(stems);
+      groups.push(group);
+    }
   }
   if (groups.length > 0) {
     const names = groups.length === 1 ? groups[0] : `${groups.slice(0, -1).join(', ')} and ${groups.at(-1)}`;
+    const advice = firstIsList ? 'Put each stem name in quotes inside the brackets' : "Put each group's stems in brackets";
     throw new Error(
-      `config/stem-map.json lists the stems of ${names} as something other than a list of stem names. Put each group's stems in brackets: "${groups[0]}": ["<stem>"].`,
+      `config/stem-map.json lists the stems of ${names} as something other than a list of stem names. ${advice}: "${groups[0]}": ["<stem>"].`,
     );
   }
```
and assert it in the number row: give the `it.each` rows an optional `advice` field, `advice: 'Put each stem name in quotes inside the brackets'` on `a group whose list holds a number` and `advice: "Put each group's stems in brackets"` on `a group written as a string instead of a list`, with `if (advice !== undefined) expect(result.stderr).toContain(advice);`.

**Remediation brief**
- **Design intent:** the group line names every bad group, then gives one example fix for the first. The example is right only when it matches what that group got wrong: not a list, or a list holding something other than quoted stem names.
- **Full surface:** `src/set-builder/main.ts:182-191`; the comment at `:174-176` stays true as written; `test/set-builder-command.test.ts:546-563` (the two group rows) and the assertions at `:577-578`. `README.md:96` describes the shape, not the advice, and needs no change.
- **Must preserve:** one line on stderr; the clause `config/stem-map.json lists the stems of <names> as something other than a list of stem names.` unchanged, since finding 1's assertion pins it; the example `"<first group>": ["<stem>"]`; every passing map returned unchanged (`Object.fromEntries(entries)`); the empty group passing (finding 3).
- **Failure of the fix:** none new; it changes only text in a line the existing catch prints.
- **Do not touch:** the top-level branch (`main.ts:178-180`) and `jsonKind`.
- **Proof:** with the `advice` assertions in place and the source unchanged, the number row is red (`Put each stem name in quotes` missing); after the source diff, `pnpm exec vitest run test/set-builder-command.test.ts -t "config/stem-map.json is"` is green.

## Needs Further Investigation
None.

## Reviewed and Dismissed
- The gate's placement — `stemMapShape` runs last in `stemMapFile` (`main.ts:171`), which `build()` calls inside its `try` before `buildSet` (`main.ts:126-128`), so a wrong shape writes nothing and prints one line through the existing catch, as #151 and round 4's Approach decision require.
- `Object.fromEntries(entries)` in place of returning `value` — equivalent for a map that passed the loop (finder mutation green), and it hands the build a fresh object of only the checked entries.
- `{"__proto__": [...]}` — `JSON.parse` makes it an own key, `Object.entries` walks it, and `Object.fromEntries` writes it as an own data property, so it passes as an ordinary group; the template check then reports it as a group the template lacks. `{"__proto__": "x"}` is named in the group line.
- Duplicate keys (`{"VOX":"x","VOX":["a"]}`) — `JSON.parse` keeps the last, so the map passes; undetectable after the parse and outside #151.
- `{}` — passes the gate; `templateProblems` then names every missing group, as at base.
- README `:96` — matches the behaviour: a top level that is not an object, or a group not a list of stem names, stops the build with one line naming the file, and the group for a group.
- `test/set-builder-harness.ts:88` (`readStemMap`) bypassing the gate — test-only; it reads the committed map, which the command tests prove passes the gate.
- The `it.each` copy of `src/` — unchanged pattern from #110, under the gitignored `dist/` and removed by `afterEach(removeWorkspaces)`.

## Minor / nits
- Group names go into the line raw (`main.ts:188`, `:190`). Executed: a key `"A\nB"` prints a real newline, so two stderr lines, and a key holding `"` makes the example invalid JSON; `""` reads `lists the stems of  as`. `checks.ts:18` quotes group names (`"${name}"`); `JSON.stringify(group)` in both places would keep one line and match it. No real group name holds a newline or a quote, and a group name must match a template track to build at all.
- "in map order" (`main.ts:176`) is `Object.entries` order, which puts integer-like keys first: executed, `{"VOX":"x","1":"y"}` prints `1 and VOX`. The same wording is used in `checks.ts`; no real group name is a number.
- An object-valued group (`"VOX": {"0": "BGVS"}`) is rejected correctly (probed) but no row pins it; finding 1's three-group row covers a number and `null`, not an object.
- `src/server/pedal.ts:150-151` already has an `isObject` guard with the same three conditions; `main.ts:178` spells it inline and casts at `:183`. Different domain and not exported, so the duplicate is defensible.
- Pedal config errors (`src/server/pedal.ts:110-111`) name the offending value with `JSON.stringify(entry)`; the stem map's group line names the group but not the value. Finding 4's advice covers the practical gap.

## Test quality
Tests added: 6 rows in the existing `it.each` at `test/set-builder-command.test.ts:531-579`, plus one conditional assertion (`:578`). Red at `$BASE`: 6, each for its intended reason (17, 17 and 20 lines for the list, number and string top levels; `Cannot convert undefined or null to object` for `null`; `the stem map has no group for the stem "BGVS"` for the string group; exit 0 and a written set for the number in a list). Green at `$BASE`: 0 of the new rows; the two #110 rows stay green, as they should. Tautology shapes: none. Every expectation is a literal, nothing is mocked, and each row spawns the real `main.ts`. The group assertion at `:578` is partly met by the line's closing example rather than its naming clause (finding 1). Mutation gaps: findings 1, 2 and 3, and the object-valued group (Minor).

## Before opening the PR
- **CI readiness:** lint, typecheck, `pnpm test` and `pnpm build` green at `d974cf9`; `pnpm test:e2e` green locally.
- **Commit hygiene:** 2 commits, the implement commit and its lane merge, both with the ticket reference; nothing to drop. Commit this doc.
- **Likely reviewer asks:** why the advice reads "in brackets" for a list that holds a number (finding 4).

## Verdict
Ready to open the PR as it stands. No finding gates it: the four LOW findings (three test gaps and one advice line) can be remediated first through `/pr-review-remediate` or carried as follow-ups. Round 4's finding 4 (the string group split into one-letter stems) and its Minor note on `null` and `{ "VOX": 5 }` printing lines that do not name the file are fixed in code by #151, through the mechanism round 4 recorded (a shape check in `stemMapFile`), and none was resolved only by editing a comment or a doc.
