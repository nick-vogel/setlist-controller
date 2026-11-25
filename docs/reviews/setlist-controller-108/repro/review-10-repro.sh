#!/bin/sh
# Pre-PR review 10. Inserts two tests into test/eos.test.ts's describe "the fire event that answers
# the lights' own Go and Back", in a throwaway worktree at HEAD, outside the repo, and runs them.
#   review 10 f1       cues 3.7 then 5.5 recorded at the console while on cue 3, so Eos's active cue
#                      is 5.5 and its next Go fires 6; the producer's Go is in flight (its answer
#                      held), and cue 4 is fired at the console: pauses. Red today: the re-judge
#                      accepts 4 as a Go from 3.7, a cue Eos is no longer on.
#   review 10 control  the same with only 5.5 recorded: pauses. Green today and after.
#   review 10 order    cue 3.7 recorded, then the producer's Go answered with Eos's active cue 4
#                      before its fire event of 4, as Eos sent for the app's fire of 99/1
#                      (fire-follow-chain.json): never pauses. Green today and after; red under a
#                      fix that keeps only the latest active cue.
#   sh docs/reviews/setlist-controller-108/repro/review-10-repro.sh                  (eos.ts at HEAD)
#   sh docs/reviews/setlist-controller-108/repro/review-10-repro.sh <path to eos.ts> (another eos.ts)
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
if [ $# -gt 0 ]; then cp "$1" "$scratch/wt/src/server/eos.ts"; fi
cat > "$scratch/tests.ts" <<'TESTS'
  for (const [name, records] of [
    ['review 10 f1: pauses for a cue fired at the console with a Go pending, when it is a Go from a cue recorded before the cue Eos is on now', ['3.7', '5.5']],
    ['review 10 control: pauses for a cue fired at the console with a Go pending, after one cue recorded past it', ['5.5']],
  ] as const) {
    it(name, async () => {
      const rig = await armedOnCue3();
      let show = RECORDED_SHOW.map((cue) => ({ ...cue }));
      for (const number of records) {
        show = [...show, { number, label: `Recorded ${number}` }].sort((a, b) => Number(a.number) - Number(b.number));
        rig.fake.editShow(show, { notify: Number(number) });
        await rig.shows(['Live cue 3: Goodness of God / Chorus', ...show.map((cue) => (cue.label === '' ? `Cue ${cue.number}` : `Cue ${cue.number}: ${cue.label}`))]);
      }
      rig.fake.holdFires();
      const sent = cueListMessages(rig.fake).length;
      await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
      await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));

      rig.fake.fireByHand('4');

      await vi.waitFor(() => expect(rig.latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' })), { timeout: 2000 });
    });
  }

  it('review 10 order: never pauses on a Go after a cue recorded at the console, answered with its active cue before its fire event', async () => {
    const rig = await armedOnCue3();
    const since = rig.producer.received.length;
    const show = [...RECORDED_SHOW.map((cue) => ({ ...cue })), { number: '3.7', label: 'Recorded 3.7' }].sort((a, b) => Number(a.number) - Number(b.number));
    rig.fake.editShow(show, { notify: 3.7 });
    const lines = show.map((cue) => (cue.label === '' ? `Cue ${cue.number}` : `Cue ${cue.number}: ${cue.label}`));
    await rig.shows(['Live cue 3: Goodness of God / Chorus', ...lines]);
    await pressUnheard(rig, ['go'], 'silent');
    rig.fake.speak();
    rig.fake.emit('/eos/out/active/cue/1/4', [1.0]);
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
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 10'
