# Pre-PR review: setlist-controller#108 Lights: cues follow playback

**Branch:** `setlist-controller-108-lights-cues-follow-playback` vs `origin/main` (merge-base `6aec698` "Merge pull request #246 from nick-vogel/setlist-controller-101-count-off-into-section")
**Reviewed at:** HEAD `4d73a19` (setlist-controller#108 pre-PR review 3 remediation closure table), clean tree: 0 files with uncommitted changes, 0 untracked; 48 files total, +7852 / -66 against the merge-base. Of those, 8 are pre-PR reviews 1 to 3 and their repros, and 15 are Eos recordings and their README under `test/fixtures/eos/`.
**Delta under review:** since `95f33fc` (setlist-controller#257 Lights: go online only on a framed packet, and name the OSC TCP mode when Eos never answers), the commit pre-PR review 3 (`90b07ba` "setlist-controller#108 pre-PR review 3") reviewed. 4 files, +300 / -3: pre-PR review 3 and its repro, and the remediation of its finding 1 (`30583db`), which is 7 lines of `src/server/eos.ts` (one line of code, three of comment) and one new test in `test/eos.test.ts`.
**Reviewed against:** pre-PR review 3: finding 1 in full (its intent, Full surface, Must preserve and Failure of the fix), its Approach decisions, Needs Further Investigation, Reviewed and Dismissed, and its remediation closure table. The epic body of setlist-controller#108 and #254's recorded assumption 2, as quoted there. The repo has no `CLAUDE.md`, coding standards file, `CONTEXT.md` or ADRs, so the five universal review rules are the conformance checklist: load-bearing comments only, tests that can go red, the whole surface of a change, a test for every fallback path, the nearest in-repo precedent for every fix shape.
**Date:** 2026-10-24
**Reviewer:** 1 code-review agent + verify pass

## What was verified and how
| Check | Method | Result |
| --- | --- | --- |
| Dependencies | `pnpm install --frozen-lockfile` | up to date, lockfile unchanged |
| Lint | `pnpm lint` | pass |
| Typecheck | `pnpm typecheck` | pass |
| Unit and seam tests | `pnpm test` | first run at load 29: 1 failed, 1660 passed, 4 skipped. The failure was `test/set-builder-command.test.ts:452` ("stops on a set folder that already exists, and replaces it with ..."), a file this branch never touches (`git log 6aec698..HEAD -- test/set-builder-command.test.ts` is empty), the set-builder family already logged on setlist-controller#205. Re-run after 60 s at load 31: 69 files, 1661 passed, 4 skipped. A flake |
| Build | `pnpm build` | pass |
| Playwright | `pnpm test:e2e` | pass: 60 passed, both projects |
| Pre-PR review 3's repro | `sh docs/reviews/setlist-controller-108/repro/review-3-repro.sh` | pass: finding 1 is fixed on the Fire again path |
| New test red before the fix | finder: scratch worktree at `95f33fc`, HEAD's `test/eos.test.ts` copied in, `vitest run test/eos.test.ts -t 'never pause on their own Fire again'` | red, "expected false to be true" on the every-snapshot-armed check |
| Mutants of the fix | finder: four edits to `sendOwn`'s new clear, each run over `test/eos.test.ts` and `test/connections.test.ts` (95 tests, all green unmutated) | M1 (clear deleted): killed by `test/eos.test.ts:1500`. M4 (clear in Go only): killed by `:1500`. M3 (clear in `cue()` only): survives, finding 1. M2 (clear above the `if (!online) return;` guard): survives, equivalent (Minor) |
| Go after a reconnect with no active cue, under M3 | `sh docs/reviews/setlist-controller-108/repro/review-4-repro.sh` | the Go test passes at HEAD; under M3 the existing two suites pass (95 passed) and the Go test fails. Finding 1 |
| Comments describing the reconnect judgement | finder and verify pass: every comment in `src/server/eos.ts` naming `before`, the active-cue branch or the reconnect rule | three state the old rule as complete, and the new comment on `before` runs past 100 characters. Finding 2 |
| Python scripts under `scripts/eos/` | not run: they talk to a real Eos on 3032 | unchanged since review 1 |

**Overall:** Pre-PR review 3's one gating finding is fixed, and fixed at the right place: the lights' own cue now ends the reconnect judgement through `sendOwn`, the one path that sends a cue, so Fire again, a section's cue, Go and Back are all covered. The new test is red before the fix and green after, and the full checks are green. What remains is small: the test covers Fire again only, so a later edit that narrows the clear to section cues would leave Go pausing the lights with every test green; and three comments still state the reconnect rule without the new exception. Neither gates the PR. The PR still waits on #140.

## Approach decisions
- Pause by hand (#138): Nick's follow and link rule of 2026-10-24 stands. A fire event that answers no own command within `OWN_COMMAND_WINDOW_MS` is the lights' own only when it is the cue the live cue before it fires next by itself, from list reply arguments 19 to 21.
- Transport: OSC 1.0 packet-length framing on TCP 3032 (Nick, 2026-10-24 comment on #108), not SLIP.
- Liveness (#249, #257): an OSC ping, `/eos/ping` every 1000 ms, offline after 3 unanswered; connect timeout 3000 ms to Eos's first framed packet. The ping count resets on a complete packet only.
- Reconnect judgement (#254, review 3 finding 1): the cue Eos is on at connect is judged once against the live cue kept from before the drop and its whole `firedAfter` chain. The kept cue `before` is cleared in `sendOwn` (`src/server/eos.ts:169`), the one path that sends a cue-firing command (`cue()` at `:455`, `runButton` at `:468-469`), so the lights' own cue ends the judgement as a fire event does. The fire-event and active-branch resets (`:258`, `:276`) stay. This review keeps the clear where it is and adds a test that pins it for Go (finding 1).
- Shadowed cues (#252, #258): the check never calls a cue that fires "never fires". The exemption is every cue that a follow or hang of any cue reaches, with the false negative #258 accepted. Review 3 finding 2 (open, LOW) changes how the set is built, not what it holds.
- New tests of the adapter drive the real server through `lightsRig` in `test/eos.test.ts` and the fake Eos, never reaching inside the adapter, as the epic's testing decisions require. Row behaviour that needs effects to run is tested in Playwright (`e2e/lights.spec.ts`).

## Confirmed Issues
### 1. No test pins that the lights' own Go ends the reconnect judgement — LOW
- **Location:** `test/eos.test.ts:1500` (the only test of the fix, which drives Fire again through `cue()`); the code it leaves unpinned is `src/server/eos.ts:164-170` (`sendOwn`) as reached from `runButton` at `src/server/eos.ts:468-469`.
- **Attribution:** introduced by `30583db` (setlist-controller#108 pre-PR review 3 finding 1: the lights' own cue after a reconnect to an Eos that names no active cue no longer pauses them by hand), which added the clear and one test of it. Before it, the clear did not exist.
- **Real-world trigger:** none today; the code is right. A later change that moves the clear into `cue()` (mutant M3) ships green, and then: the lights drop and reconnect to an Eos whose connect burst names no active cue of the list (a restarted ETCnomad, review 3's Needs Further Investigation B), the producer presses Go, Eos sends the next cue's active cue ahead of its fire event (`test/fixtures/eos/fire-follow-chain.json`), and the lights show "Paused by hand". LOW: a test gap, no user path at HEAD.
**Evidence**
```ts
  const sendOwn = (address: string, command: Own) => {
    if (!online) return;
    send(address);
    own.push({ command, at: clock.now() });
    before = null;
  };
```
Under M3, `before = null;` removed here and `if (labelled) before = null;` added above `src/server/eos.ts:455`, `test/eos.test.ts` and `test/connections.test.ts` pass, 95 of 95.
**Failure mode** — the fix's intent, "cues the lights send are never a change by hand", covers Go and Back as much as a section's cue, and only the Fire again path can go red. A Go test with the fake's default timing does not catch M3 either: the fake answers Go at once, its fire event lands first, and the later active cue is ignored. The test has to silence the fake and send Go's answer by hand in recorded order. Proved: `sh docs/reviews/setlist-controller-108/repro/review-4-repro.sh` runs such a test green at HEAD, applies M3, shows the existing two suites still green, and shows the Go test red ("expected false to be true" on the every-snapshot-armed check). The finder ran the same test red under M1 too.
**Recommended fix** — add this test in `test/eos.test.ts` directly after the test at `:1500`, inside `describe('a cue Eos fires by itself on a follow time'` (`:1217`). It uses `cueListMessages` and `GO` (`:955-956`), and `fake.silence()` and `fake.speak()` from `test/fake-eos.ts`:
```ts
  it('never pause on their own Go once they have connected again to an Eos that names no active cue of the cue list', async () => {
    const { fake, read, arm, play, press, shows, next, producer, lights, latest, comesOnline } = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    await read();
    await arm();
    await play(5, 33);
    await shows(['Live cue 3: Goodness of God / Chorus', ...FOLLOW_LIST]);

    const dropped = next((snapshot) => lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    fake.setShow(FOLLOW_SHOW);
    await fake.accept();
    await comesOnline();
    await shows([...FOLLOW_LIST]);

    const since = producer.received.length;
    // The fake answers Go at once, so it is silenced to send Go's answer in recorded order: the
    // active cue ahead of the fire event (fire-follow-chain.json).
    fake.silence();
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(fake).at(-1)).toEqual(GO));
    fake.speak();
    fake.emit('/eos/out/active/cue/1/1', [0]);
    fake.emit('/eos/out/event/cue/1/1/fire', ['Goodness of God / Intro']);
    await shows(['Live cue 1: Goodness of God / Intro', ...FOLLOW_LIST]);
    await producer.flush();
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });
```
No production change. A Back variant is optional: with `setShow` the fake has no current cue and its Back fires nothing, so it would need `fake.fireByHand` before the drop to give Eos a cue to go back from.
**Remediation brief**
- **Design intent:** the kept cue `before` exists for one judgement: the cue Eos is on when the lights connect again. Once anything else names the cue Eos is on (a fire event, or one of the lights' own commands, whose answer Eos sends as an active cue and then a fire event), that judgement is over and the follow and link rule of #138 takes over. `sendOwn` is the one place every own command passes, so the clear sits there; the test pins that Go reaches it, not only a section's cue.
- **Full surface:** `test/eos.test.ts`, one new test after `:1528` (the end of the `:1500` test). No production file changes.
- **Must preserve:** every test in `test/eos.test.ts`, `test/connections.test.ts` and `test/osc-tcp.test.ts`, the `:1500` test included; the fake's default instant answer to Go, which the Go and Back tests near `:955` rely on (the new test silences it only for its own press).
- **Do not touch:** `sendOwn` and the clear's place after the `if (!online) return;` guard (see Minor, M2); the `before = null` lines in the fire-event and active branches (`src/server/eos.ts:258`, `:276`).
- **Proof:** the new test is green at HEAD: `pnpm exec vitest run test/eos.test.ts -t 'never pause on their own Go'`. It is red under M3: `sh docs/reviews/setlist-controller-108/repro/review-4-repro.sh` shows the same test red under that mutant; to check the committed test, in a scratch worktree (`git worktree add --detach <scratch> HEAD`, `ln -s "$PWD/node_modules" <scratch>/node_modules`) apply M3 with `perl -0pi -e 's/\n    before = null;\n  \};/\n  };/; s/if \(labelled\) sendOwn\(/if (labelled) before = null;\n      if (labelled) sendOwn(/' src/server/eos.ts` and run the command above there.

### 2. Comment hygiene — LOW (aggregated)
- `src/server/eos.ts:18-21` — "and on a reconnect, the cue Eos is on unless it is the live cue from before the drop or a cue that one Eos fires by itself after it." → "and on a reconnect, the cue Eos is on unless it is the live cue from before the drop or a cue that one Eos fires by itself after it, or the lights have sent a cue of their own since they connected."
- `src/server/eos.ts:149-150` — "On a reconnect, that cue is a change by hand unless it is the live cue from before the drop, kept below, or a cue that one Eos fires by itself after it." → "On a reconnect, that cue is a change by hand unless it is the live cue from before the drop, kept below, or a cue that one Eos fires by itself after it, or the lights have sent a cue of their own since they connected."
- `src/server/eos.ts:246-250` — "It answers none of the lights' own commands. On a reconnect it is a change by hand, judged once, unless it is the live cue from before the drop or a cue that one Eos fires by itself after it, ..." → "It answers none of the lights' own commands, though one sent since the connect ends its judgement. On a reconnect it is a change by hand, judged once, unless it is the live cue from before the drop or a cue that one Eos fires by itself after it, ...", the rest as is.
- `src/server/eos.ts:152-153` — the rewritten comment on `before` runs 102 and 101 characters → rewrap the three lines at 100, as the lines around it are.

## Needs Further Investigation
Review 3's three items stand unchanged, and none is touched by the delta: A (a cue list of about 950 indices or more may never finish reading within the 10 s limit), B (what a restarted Eos sends on connect is not recorded), C (a drop during the first read leaves the reconnect judged against an empty list). A and B belong to #140's session on Augment3d; their text is in `pre-pr-review-3.md` under Needs Further Investigation.

## Reviewed and Dismissed
- Clearing `before` on Back, which may fire no cue (a stop during a fade) — Back is one of the lights' own commands (the `Own` type comment at `src/server/eos.ts:123-125`); its stop event is used up through `answers`, and a later console fire still pauses through the fire-event branch. The judgement it ends had nothing left to judge but the cue the lights moved Eos to.
- An own command Eos never answers (a deleted cue, Go past the end) ending the judgement — Eos named no cue, so there was nothing to judge; later changes are judged by the fire-event branch, #254's assumption 2.
- The clear interacting with a read in flight — `sendOwn` touches neither `read` nor `cues`.
- The clear while `live` is non-null — no effect: `before` is already null whenever the connection is online and `live` is set.
- A section cue sent in the few milliseconds between coming online and the connect burst ending the judgement early — review 3 finding 1's recorded Failure of the fix: one missed pause, never a wrong one.

## Minor / nits
- M2, the clear moved above `if (!online) return;` in `sendOwn`, is an equivalent mutant through the server: `src/server/connections.ts` calls `cue()` and `runButton` only while `entry.connection === 'online'` (`:294`, `:300`, `:314`), and the adapter sets `online` and reports its status in the same synchronous handler. The clear's place after the guard is the right defensive order; only a test below `lightsRig` could pin it, which the epic's testing decisions rule out.
- `test/eos.test.ts:1512`: `fake.setShow(FOLLOW_SHOW)` is the test's whole premise (the fake "has no current cue until one fires", `test/fake-eos.ts:56`, so the connect burst names no active cue), and the Go press at `:1506` exists to make the kept cue 3.1, so that cue 3 is outside `firedAfter(kept)`. Neither line says so; the test name carries the first.

## Test quality
Tests added in the delta: 1 (`test/eos.test.ts:1500`). Red at `95f33fc` with HEAD's test file copied in: 1 of 1. Tautology shapes: 0; it drives the real server through `lightsRig` and asserts on the producer's snapshots. Mutation of the fix: 2 of 4 killed (M1, M4); M3 survives (finding 1), M2 is equivalent (Minor).

## Prior-review closure
Pre-PR review 3 (`90b07ba`, reviewed at `95f33fc`) had four findings. Finding 1 (MEDIUM, the lights' own cue after a reconnect to an Eos that names no active cue pauses them): fully fixed by `30583db`; `repro/review-3-repro.sh` passes, its test is in the suite and red before the fix, and the clear sits in `sendOwn` as the brief directed. Its whole surface was covered for code (Go and Back included) but not for tests: finding 1 here. Findings 2 (LOW, the cubic follow walk, now at `src/server/eos.ts:487`), 3 (LOW, five stage-3 rules with no test going red) and 4 (LOW, comment hygiene): untouched, deferred to Nick by the remediation ("LOW tail, left for Nick"); their briefs still apply, with `src/server/eos.ts` line numbers after `:169` one higher. No MEDIUM-or-higher prior finding is left open. Reviews 1 and 2's open LOW findings are as review 3 left them.

## Before opening the PR
- **CI readiness:** lint, typecheck, test and build green at `4d73a19` (the one red unit test was a set-builder flake under load, green on re-run); Playwright green locally on both projects. The new `repro/review-4-repro.sh` is a shell script, which nothing lints.
- **Commit hygiene:** one commit per ticket and per review pass, each opening with its issue reference. Nothing to drop.
- **Likely reviewer asks:** #140's install doc and the acceptance run on Augment3d, which should restart ETCnomad with the lights connected (review 3 Needs Further Investigation B) and time a read of a large cue list (A); the open LOW findings of reviews 1 to 3, this review's included.

## Verdict
**Ready to open a PR, with follow-ups.** Nothing in this review gates it: review 3's gating finding is fixed and proved, and the confirmed list has shrunk from one MEDIUM and three LOWs to two LOWs, a test gap on the fix and comment drift around it, which is the expected shape of a clean delta and not the branch failing to improve. Findings 1 and 2 can land on this branch through `/pr-review-remediate` or as follow-ups. The PR itself still waits on #140, which is Nick's.
