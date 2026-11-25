# Pre-PR review: setlist-controller#101 the top section's Count in, Play from start, Previous song and Next song (#303, #378, #390)

**Branch:** `setlist-controller-101-count-off-into-section` vs `origin/main` (merge-base `f30a1bb` "Merge pull request #389 from nick-vogel/setlist-controller-145-atem-real-unit")
**Reviewed at:** HEAD `7d4ecfd` (setlist-controller#390 Previous song and Next song in the top section), clean tree: 0 files with uncommitted changes, 0 untracked; 11 files total, +679 / -40. This review adds 1 repro file under `repro/`.
**Reviewed against:** the epic body of setlist-controller#101 and the bodies of the three sub-issues this branch carries, #303 (Count in in the top section beside Fade out), #378 (A play button in the top section too) and #390 (Previous song and Next song in the top section). The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist. Run with `--fresh`: pre-PR reviews 1 to 6 reviewed the epic's earlier server work, which is already on `main` through PR #246, and none of their findings is in this diff.
**Date:** 2026-11-09
**Reviewer:** 1 code-review agent + 1 tautology-audit agent + verify pass

Commits under review: `59f7032` and `57d30e5` (setlist-controller#303 Count in in the top section beside Fade out), `6c06bbf` and `ce1fd87` (setlist-controller#378 A play button in the top section too), `6548268` and `7d4ecfd` (setlist-controller#390 Previous song and Next song in the top section). Each ticket's second commit is a no-op merge of its lane.

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | already up to date |
| Lint | `pnpm lint` at HEAD | pass |
| Typecheck | `pnpm typecheck` at HEAD | pass |
| Unit and seam tests | `pnpm test` at HEAD | 74 files, 2229 passed, 4 skipped |
| Build | `pnpm build` at HEAD | pass |
| Playwright | `pnpm test:e2e` at HEAD (WebKit iPad and Chromium Android, OS-assigned ports) | 72 passed |
| Tautology audit, unit | branch `test/pages.test.ts` and `test/cue-causes.test.ts` run in a scratch worktree at `f30a1bb`, with null stubs for the three new components so the import does not mask per-test results | all 25 new or modified `pages.test.ts` tests red at base; the new `cue-causes.test.ts:105` row green at base (see Test quality) |
| Tautology audit, e2e | branch `e2e/count-in.spec.ts` and `e2e/reconnect.spec.ts` run at `f30a1bb` after `pnpm build` | the 3 new count-in tests red at base in both projects; the modified reconnect test green at base, as a disambiguation is expected to be |
| Base tests against branch code | base `test/` and `e2e/` against branch `web/` | base `reconnect.spec.ts` fails `strict mode violation: getByRole('button', { name: 'Previous' }) resolved to 2 elements`, which the branch's `exact: true` fixes; base "Fade out sits beside Stop" and "disables every one..." fail only on the exact lists the branch updated |
| Mutant: heading Play from start fed `connected` instead of `liveReady` (`web/src/App.tsx:99`) | scratch worktree at HEAD, `repro/review-7-mutant-heading-live-gate.diff`, `pnpm exec vitest run test/pages.test.ts test/count-in.test.ts` | survives at HEAD (182 passed); the same mutant at `f30a1bb` (`App.tsx:89`) is red at "disables Stop, Fade out and Play from start while Live is not connected" with `expected false to be true`. Finding 1 |
| Mutant: transport Play from start fed `connected` (`web/src/App.tsx:78`) | scratch worktree at HEAD, `pnpm exec vitest run test/pages.test.ts` | red at "is disabled while the server or Live is not connected, and with the playhead in no song" |
| Mutant: heading Play from start fed `true` (`web/src/SongHeading.tsx`) | scratch worktree at HEAD, `pnpm exec vitest run test/pages.test.ts` | red at "disables every one of the leader's controls while the server is out of reach" |
| `now` on an overlap or pad handoff | read `nowPlaying` (`src/server/playback-controller.ts:970`) and the set builder's handoff (`src/set-builder/timeline.ts:12`, `main.ts:51`) | an overlap moves a song's End onto its Ending, where the next song's Count Off sits, so a jump to the next song's section 0 reports `now.song` as the next song: Next song steps through overlap sets |
| Row width on the e2e iPad | `min-width` in `web/src/styles.css:472,522,590` against `devices['iPad (gen 7)']` (810 px) | six 12rem buttons and five 0.75rem gaps are 75.75rem, about 1212 px, so the row wraps on the iPad too. Comment hygiene |
| Real Live | not run | guardrails forbid opening or controlling Live; nothing in this diff talks to Live beyond commands the server already accepts |

**Overall:** The three tickets are built as written. Every button is in the transport row in the order Stop, Fade out, Count in, Play from start, Previous song, Next song, on the leader and producer pages only, with the enabled and disabled rules each ticket names, and every check is green. One LOW finding: moving the heading's Play from start out to a shared component put a second "Play from start" first in the page, so the one test that pinned the heading button's Live-not-connected gate now reads the transport button instead, and a mutant that drops the gate survives. The rest is README and comment wording. Nothing blocks the PR.

## Approach decisions
- Test that names a button by label on a page with two of that label: scope it to its section (`section.transport`, `section.song`) or check every match, never `.find` on the label. Precedent: `e2e/count-in.spec.ts` (`topCountIn`, `countIn(page, title)`) and the branch's own `exact: true` in `e2e/reconnect.spec.ts:58`.

## Confirmed Issues
### 1. The heading's Play from start lost its only test for being disabled while Live is not connected — LOW
- **Location:** `test/pages.test.ts:1434-1441`
- **Attribution:** introduced, by `6c06bbf` (setlist-controller#378 A play button in the top section too). At `f30a1bb` the page had one "Play from start", in the song heading, so `lost.find((button) => button.label === 'Play from start')` read it. Since `6c06bbf` the transport row's comes first in document order, and with `now: null` in this test it is disabled whatever Live does.
- **Real-world trigger:** none today; the gate is correct at HEAD. A later change that feeds the heading the server connection instead of Live's (`playable={connected}`) would ship green, and the leader would see an enabled Play from start in each song heading while Live is not connected, whose press goes nowhere. LOW, capped: no user path until that change lands.
**Evidence**
```ts
it('disables Stop, Fade out and Play from start while Live is not connected, and leaves the end toggles usable', () => {
  const lost = buttons(page('leader', true, { ...SNAPSHOT, live: 'not-connected', now: null, position: null }));
  const disabled = (label: string) => lost.find((button) => button.label === label)?.disabled;
  ...
  expect(disabled('Play from start')).toBe(true);
```
**Failure mode** — with `repro/review-7-mutant-heading-live-gate.diff` applied (`web/src/App.tsx:99` `playable={liveReady}` to `playable={connected}`), `pnpm exec vitest run test/pages.test.ts test/count-in.test.ts` passes 182 of 182 at HEAD. The same one-line mutant at `f30a1bb` (`web/src/App.tsx:89`) fails this test with `expected false to be true`.
**Recommended fix** — in `test/pages.test.ts`, the test at `:1434`, replace the single `Play from start` line:
```diff
-    expect(disabled('Play from start')).toBe(true);
+    const playFromStart = lost.filter((button) => button.label === 'Play from start');
+    expect(playFromStart).toHaveLength(2);
+    expect(playFromStart.every((button) => button.disabled)).toBe(true);
```
**Remediation brief**
- **Design intent:** every leader playback button reads one `liveReady` (server connected and Live connected) from `Page` in `web/src/App.tsx:63`. The transport row passes it at `:77-80`, and each song heading gets it as `playable` at `:99`, which `SongHeading` hands to its own `PlayFromStartButton` and `CountInButton`. The transport's Play from start is also off with the playhead in no song (`now` null); the heading's is not, since it is for its own song. This test's `now: null` therefore disables the transport's by the no-song rule, and only the heading's says anything about Live.
- **Full surface:** `test/pages.test.ts:1434-1441` only. No production change.
- **Must preserve:** the test's other four assertions (Stop and Fade out disabled, both end toggles enabled), whose labels are unique on the page; "is disabled while the server or Live is not connected, and with the playhead in no song" (`test/pages.test.ts:1067`), which pins the transport's gate; "disables every one of the leader's controls while the server is out of reach" (`:1416`).
- **Do not touch:** `web/src/App.tsx` and `web/src/PlayFromStartButton.tsx`; both are correct. "marks the disabled controls as unavailable" (`:1443`) checks that some disabled button carries each class, which still holds; see Minor.
- **Proof:** from the repo root, in a scratch worktree so the live tree is never mutated: `git worktree add --detach <scratch> HEAD && cd <scratch> && ln -s <repo>/node_modules node_modules && git apply <repo>/docs/reviews/setlist-controller-101/repro/review-7-mutant-heading-live-gate.diff && pnpm exec vitest run test/pages.test.ts`. Passes before the fix (the gap); after the fix, copy the fixed `test/pages.test.ts` in and the same run is red at "disables Stop, Fade out and Play from start while Live is not connected". Then `git -C <repo> worktree remove --force <scratch>`. In the real tree, `pnpm exec vitest run test/pages.test.ts` stays green.

### 2. Comment hygiene — LOW (aggregated)
- `README.md:49` — "On a phone, Stop, Fade out, Count in, Play from start, Previous song and Next song wrap onto more than one line." → "On a phone or an iPad, Stop, Fade out, Count in, Play from start, Previous song and Next song wrap onto more than one line."
- `web/src/styles.css:455` — "On a phone the six are wider than the screen, so the row wraps onto more than one line." → "On a phone or an iPad the six are wider than the screen, so the row wraps onto more than one line."
- `README.md:49` — "Previous song is disabled on the set's first song, and Next song on its last." → "Previous song is disabled on the set's first song, and Next song on its last, and each is disabled when the song it would move to has no section." (`web/src/SongStepButton.tsx:33`, pinned by `test/pages.test.ts` `:1222` "disable Next song when the song after has no sections...")
- `README.md:122` — "the Count in buttons beside Play from start and beside Fade out and the "Count in to" line they bring up on the leader page and the view-only page" → "the Count in buttons beside Play from start and beside Fade out, and the "Count in to" line on the leader page and the view-only page" (the top Count in's e2e test checks `.now-jump` on the leader page only; the view-only page's line is from the older heading test).

## Needs Further Investigation
None.

## Reviewed and Dismissed
- The click handlers guard on `target`, `song` and `now`, not on the full enabled rule (`SongStepButton.tsx`, `PlayFromStartButton.tsx`, `CountInButton.tsx`) — a `disabled` button fires no click in React or the browser, and the heading's old inline handler (`if (now)`) is the precedent. Do not add the rule to the handlers.
- Next song cannot step past an overlap boundary because `now` resolves to the earlier song — not so: an overlap build puts the song's End on its Ending, where the next song's Count Off starts (`src/set-builder/timeline.ts:12`), and `nowPlaying` skips a song once the position reaches its End. Only a hand-made set with interleaved locators, which `set-parser.ts:62` already warns about as `overlapping-songs`, could do it.
- A second Count in press is possible between the press and Live's play report — the heading's Count in did the same before this branch, #303 asks for the same rules, and the server refuses a count-in once Live plays.
- The top Play from start is enabled while Live plays and during a count-in — #378 asks for the heading button's rules, which are exactly that; the server's play-from-start while playing waits for the bar line (`src/server/playback-controller.ts:799`).
- All four new transport buttons are disabled with `now` null, including after a "Stop at end" leaves the playhead on End in a gap set — written into #378 and #390 as the rule.
- `test/cue-causes.test.ts:105` is green at base — it pins pre-existing server behaviour (no cue and no start on a cross-song jump while stopped) that #390's README and component comment now rely on; the page side is pinned in `test/pages.test.ts` and `e2e/count-in.spec.ts`. Keep it.
- `e2e/reconnect.spec.ts:58,62` green at base — the `exact: true` is required now that "Previous song" exists (the base version fails strict mode on branch code), and it pins the same section Previous as before.

## Minor / nits
- Two buttons share the accessible name "Count in", and two "Play from start", on the leader and producer pages, with nothing to tell a screen reader or voice control which is which. An `aria-label` naming the song on the heading's would do it.
- The new transport buttons take `playable={liveReady}` where Stop and Fade out take `available={liveReady}`; the name follows `SongHeading`, which shares the components.
- "marks the disabled controls as unavailable" (`test/pages.test.ts:1443`) uses `.some`, so the transport's `play-from-start unavailable` and `count-in unavailable` now satisfy it for the heading's buttons too. The shared components make that equivalent today.

## Test quality
Tests added or modified: 30 (26 new, 4 modified). Red at `$BASE`: 28. Green at `$BASE`: 2, both from `6548268` and both justified above (`test/cue-causes.test.ts:105`, a regression pin on unchanged server code; `e2e/reconnect.spec.ts:58,62`, a disambiguation). Tautology shapes found: 0 (no production helper in an expectation, no mocks, no call-shaped-only assertions, no snapshots, no assertion-free tests; the CSS tests compare to Fade out through the cascade but also pin literals). One modified test lost its discriminating power without going green: finding 1.

## Before opening the PR
- **CI readiness:** the repo has no CI; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm test:e2e` are all green at `7d4ecfd`.
- **Commit hygiene:** six commits, two per ticket, each pair a lane commit and its no-op merge. This doc and its repro go in one commit.
- **Likely reviewer asks:** a screenshot of the wrapped transport row on the iPad; whether Next song should stay disabled after "Stop at end" leaves the playhead on End.

## Verdict
Ready to open the PR with follow-ups. Nothing gates it: finding 1 is a one-test fix that can ride along or follow, and finding 2 is wording.
