#!/bin/sh
# Pre-PR review 9. Inserts three tests into test/eos.test.ts's describe "the fire event that answers
# the lights' own Go and Back", in a throwaway worktree at HEAD, outside the repo, and runs them.
# The first two assert the correct behaviour, so each is red today and must be green once finding 1
# is fixed; the third is a control, green today and after:
#   review 9 f1a  a cue added at the console, the producer's Go fires it before Eos's notify, and a
#                 Back answered before the fresh read of the cue list ends: never pauses
#   review 9 f1b  the same, with Fire again in place of the Back: never pauses, since neither the
#                 Back or Fire again keeps its own answer
#   review 9 control  the same Go with nothing after it before the read ends: never pauses
#   review 9 f2   a cue 3.7 recorded at the console while on cue 3, which Eos makes its active cue
#                 with no fire event (cue-edit-at-console-subscribed.json, cue-edit-at-keypad-
#                 subscribed.json), notified; the producer's Go then fires 4, the cue after 3.7, as
#                 Eos does: never pauses (finding 2, red today and under finding 1's fix)
#   sh docs/reviews/setlist-controller-108/repro/review-9-repro.sh                  (eos.ts at HEAD)
#   sh docs/reviews/setlist-controller-108/repro/review-9-repro.sh <path to eos.ts> (another eos.ts)
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
if [ $# -gt 0 ]; then cp "$1" "$scratch/wt/src/server/eos.ts"; fi
cat > "$scratch/tests.ts" <<'TESTS'
  for (const [name, then, lands] of [
    ['review 9 f1a: never pauses on a Go that Eos answers with a cue added at the console before its notify, then a Back answered before the fresh read ends', 'back', 'Live cue 3: Goodness of God / Chorus'],
    ['review 9 f1b: never pauses on a Go that Eos answers with a cue added at the console before its notify, then Fire again answered before the fresh read ends', 'fire-again', 'Live cue 3: Goodness of God / Chorus'],
    ['review 9 control: never pauses on a Go that Eos answers with a cue added at the console before its notify, with nothing after it before the fresh read ends', 'none', 'Live cue 3.7: Goodness of God / Tag'],
  ] as const) {
    it(name, async () => {
      const added = [...RECORDED_SHOW.slice(0, 3), { number: '3.7', label: 'Goodness of God / Tag' }, ...RECORDED_SHOW.slice(3)];
      const lines = added.map((cue) => (cue.label === '' ? `Cue ${cue.number}` : `Cue ${cue.number}: ${cue.label}`));
      const rig = await armedOnCue3();
      const since = rig.producer.received.length;
      rig.fake.holdNotifies();
      rig.fake.editShow(added, { notify: 3.7 });
      rig.fake.holdReads();
      await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
      await rig.shows(['Live cue 3.7: Goodness of God / Tag', ...RECORDED_LIST]);
      if (then === 'back') await rig.press({ kind: 'run-button', target: 'eos', button: 'back' });
      if (then === 'fire-again') await rig.press({ kind: 'fire-again', target: 'eos' });
      await rig.shows([lands, ...RECORDED_LIST]);
      rig.fake.releaseReads();
      await rig.shows([lands, ...lines]);
      rig.fake.releaseNotifies();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await neverPaused(rig, since);
    });
  }

  it('review 9 f2: never pauses on a Go after a cue recorded at the console, which Eos makes its active cue', async () => {
    const recorded = [...RECORDED_SHOW.slice(0, 4), { number: '3.7', label: 'Goodness of God / Tag' }, ...RECORDED_SHOW.slice(4)];
    const lines = recorded.map((cue) => (cue.label === '' ? `Cue ${cue.number}` : `Cue ${cue.number}: ${cue.label}`));
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    rig.fake.editShow(recorded, { notify: 3.7 });
    rig.fake.emit('/eos/out/active/cue/1/3.7', [1.0]);
    await rig.shows(['Live cue 3: Goodness of God / Chorus', ...lines]);
    await pressUnheard(rig, ['go'], 'silent');
    rig.fake.speak();
    rig.fake.emit('/eos/out/event/cue/1/4/fire', ['Goodness of God / End']);
    await rig.shows(['Live cue 4: Goodness of God / End', ...lines]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await neverPaused(rig, since);
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
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 9'
