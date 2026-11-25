#!/bin/sh
# Pre-PR review 7. Inserts five tests into test/eos.test.ts's describe "the fire event that answers
# the lights' own Go and Back", in a throwaway worktree at HEAD, outside the repo, and runs them.
# Each of the first four asserts the correct behaviour, so each is red today and must be green once
# its finding is fixed; the fifth is a control, green today and after:
#   review 7 f1a  a cue added at the console since the last read: the producer's Go from cue 3 fires
#                 it, and the lights pause by hand on their own Go (finding 1)
#   review 7 f1b  a cue deleted at the console since the last read: the producer's Go from cue 3
#                 fires cue 4, and the lights pause by hand on their own Go (finding 1)
#   review 7 f2   cue 3 follows on to 3.5, the producer's Go fires 3.5 before the follow does, and
#                 a cue fired at the console just after it never pauses the lights (finding 2)
#   review 7 f3   a Go on the last cue fires nothing, Fire again then fires cue 1, and a cue 1
#                 fired at the console just after it never pauses the lights (finding 3)
#   review 7 control  as f1a, but Eos fires the cue the list predicts, 3.5: never pauses
# The fake has no way to edit its show and keep its current cue, so f1a and f1b let the fake's Go
# fire 3.5 unheard and send the fire event Eos sends from the edited list.
#   sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh            (eos.ts at HEAD)
#   sh docs/reviews/setlist-controller-108/repro/review-7-repro.sh 5813ba0    (eos.ts from 5813ba0)
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
if [ $# -gt 0 ]; then git -C "$repo" show "$1:src/server/eos.ts" > "$scratch/wt/src/server/eos.ts"; fi
cat > "$scratch/tests.ts" <<'TESTS'
  for (const [name, number, label] of [
    ['review 7 f1a: never pauses on a Go that Eos answers with a cue added at the console since the read', '3.7', 'Goodness of God / Tag'],
    ['review 7 f1b: never pauses on a Go that Eos answers with the cue after one deleted at the console since the read', '4', 'Goodness of God / End'],
    ['review 7 control: never pauses on a Go that Eos answers with the cue the list predicts', '3.5', 'Goodness of God / Bridge'],
  ] as const) {
    it(name, async () => {
      const rig = await armedOnCue3();
      const since = rig.producer.received.length;
      await pressUnheard(rig, ['go'], 'silent');
      rig.fake.speak();
      rig.fake.emit(`/eos/out/event/cue/1/${number}/fire`, [label]);
      await rig.shows([`Live cue ${number}: ${label}`, ...RECORDED_LIST]);
      await neverPaused(rig, since);
    });
  }

  it('review 7 f2: pauses for a cue fired at the console just after a Go fired the cue the live cue follows on to', async () => {
    const rig = await armedOnCue3(FOLLOWED_3);
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await rig.shows(['Live cue 3.5: Goodness of God / Bridge', ...RECORDED_LIST]);
    await rig.producer.flush();
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
    rig.fake.fireByHand('4');
    await rig.shows(['Live cue 4: Goodness of God / End', ...RECORDED_LIST]);
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 3000 });
  });

  it('review 7 f3: pauses for cue 1 fired at the console just after a Go on the last cue and Fire again of cue 1', async () => {
    const rig = await lightsRig({ position: 12 });
    await rig.read();
    await rig.arm();
    await rig.shows(['Live cue 8', ...RECORDED_LIST]);
    await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(rig.fake).at(-1)).toEqual(GO));
    await rig.press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(rig.fake)).toContain(fire('1')));
    await rig.shows(['Live cue 1: Goodness of God / Intro', ...RECORDED_LIST]);
    await rig.producer.flush();
    expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
    rig.fake.fireByHand('1');
    await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 3000 });
  });

TESTS
node -e '
const fs = require("fs");
const [file, extra] = process.argv.slice(1);
const lines = fs.readFileSync(file, "utf8").split("\n");
const start = lines.findIndex((line) => line.startsWith("describe(\"the fire event that answers the lights\x27 own Go and Back\""));
if (start < 0) { console.error("insertion point not found"); process.exit(3); }
lines.splice(start + 1, 0, ...fs.readFileSync(extra, "utf8").split("\n"));
fs.writeFileSync(file, lines.join("\n"));
' "$scratch/wt/test/eos.test.ts" "$scratch/tests.ts"
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 7'
