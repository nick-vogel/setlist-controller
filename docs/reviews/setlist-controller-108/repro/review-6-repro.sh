#!/bin/sh
# Pre-PR review 6. Inserts five tests into test/eos.test.ts's describe "the lights' own Go and
# Back whose fire event a drop eats", in a throwaway worktree at HEAD, outside the repo, and runs
# them. Each asserts the correct behaviour, so each is red today and must be green once its finding
# is fixed:
#   review 6 f1a  a Back that only stopped a fade, then a Go, both unheard: Eos is on the cue after
#                 the live cue, and the reconnect pauses the lights (finding 1)
#   review 6 f1b  the live cue's follow runs unheard, then a Go: Eos is on the cue after the
#                 follow's, and the reconnect pauses the lights (finding 1)
#   review 6 f1c  a Go from the last cue fires nothing, then a Back: Eos is on the cue before, and
#                 the reconnect pauses the lights (finding 1)
#   review 6 f2a  no drop: the live cue's follow event comes after a Go was sent, uses the Go up,
#                 and the Go's own fire event pauses the lights (finding 2)
#   review 6 f2b  no drop: a Go from the last cue fires nothing, and a cue fired at the console
#                 within the next second never pauses the lights (finding 2)
# The fake runs no fades, so f1a moves it onto 3.5 with follow(), where a real Eos is after a Back
# that stopped cue 3's fade and a Go.
#   sh docs/reviews/setlist-controller-108/repro/review-6-repro.sh
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
cat > "$scratch/tests.ts" <<'TESTS'
  const FOLLOWED_3 = RECORDED_SHOW.map((cue) => (cue.number === '3' ? { ...cue, follow: 1000 } : cue));

  it('review 6 f1a: never pauses once they have connected again after a Back that only stopped a fade and a Go', async () => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    await pressUnheard(rig, ['back', 'go']);
    await drop(rig, 'silent');
    rig.fake.follow('3.5');
    await reconnect(rig, 'silent');
    await rig.shows(['Live cue 3.5: Goodness of God / Bridge', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it("review 6 f1b: never pauses once they have connected again after the live cue's follow and a Go", async () => {
    const rig = await armedOnCue3(FOLLOWED_3);
    const since = rig.producer.received.length;
    rig.fake.silence();
    rig.fake.follow('3.5');
    await pressUnheard(rig, ['go']);
    await drop(rig, 'silent');
    await reconnect(rig, 'silent');
    await rig.shows(['Live cue 4: Goodness of God / End', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it('review 6 f1c: never pauses once they have connected again after a Go from the last cue and a Back', async () => {
    const rig = await lightsRig({ position: 28 });
    await rig.read();
    await rig.arm();
    await rig.shows(['Live cue 8', ...RECORDED_LIST]);
    const since = rig.producer.received.length;
    await pressUnheard(rig, ['go', 'back']);
    await drop(rig, 'silent');
    await reconnect(rig, 'silent');
    await rig.shows(['Live cue 7: Great Are You Lord / Chorus', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it("review 6 f2a: never pauses when the live cue's follow event comes after a Go was sent", async () => {
    const rig = await armedOnCue3(FOLLOWED_3);
    const since = rig.producer.received.length;
    rig.fake.silence();
    rig.fake.follow('3.5');
    await pressUnheard(rig, ['go']);
    rig.fake.speak();
    rig.fake.emit('/eos/out/event/cue/1/3.5/fire', ['Goodness of God / Bridge']);
    rig.fake.emit('/eos/out/event/cue/1/4/fire', ['Goodness of God / End']);
    await rig.shows(['Live cue 4: Goodness of God / End', ...RECORDED_LIST]);
    await neverPaused(rig, since);
  });

  it('review 6 f2b: pauses for a cue fired at the console just after a Go from the last cue', async () => {
    const rig = await lightsRig({ position: 28 });
    await rig.read();
    await rig.arm();
    await rig.shows(['Live cue 8', ...RECORDED_LIST]);
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(GO));
    rig.fake.fireByHand('6');
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
  });

TESTS
node -e '
const fs = require("fs");
const [file, extra] = process.argv.slice(1);
const lines = fs.readFileSync(file, "utf8").split("\n");
const start = lines.findIndex((line) => line.startsWith("describe(\"the lights\x27 own Go and Back whose fire event a drop eats\""));
const at = lines.findIndex((line, index) => index > start && line.startsWith("  it.each(["));
if (start < 0 || at < 0) { console.error("insertion point not found"); process.exit(3); }
lines.splice(at, 0, ...fs.readFileSync(extra, "utf8").split("\n"));
fs.writeFileSync(file, lines.join("\n"));
' "$scratch/wt/test/eos.test.ts" "$scratch/tests.ts"
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 6'
