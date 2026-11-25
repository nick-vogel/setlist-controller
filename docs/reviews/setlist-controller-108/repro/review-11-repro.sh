#!/bin/sh
# Pre-PR review 11. Inserts two tests into test/eos.test.ts's describe "the fire event that answers
# the lights' own Go and Back", in a throwaway worktree at HEAD, outside the repo, and runs them.
#   review 11 f1         no live cue (a show whose list has fired no cue, as connect-no-active-cue.json);
#                        the producer's Go, answered with Eos's active cue 1 before its fire event of
#                        1, as Eos sent for the app's fire of 99/1 from a list with nothing active
#                        (fire-follow-chain.json): never pauses. Red today.
#   review 11 control    the same Go answered with the fire event alone: never pauses. Green today and after.
#   sh docs/reviews/setlist-controller-108/repro/review-11-repro.sh                  (eos.ts at HEAD)
#   sh docs/reviews/setlist-controller-108/repro/review-11-repro.sh <path to eos.ts> (another eos.ts)
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
if [ $# -gt 0 ]; then cp "$1" "$scratch/wt/src/server/eos.ts"; fi
cat > "$scratch/tests.ts" <<'TESTS'
  for (const [name, activeFirst] of [
    ['review 11 f1: never pauses on the Go with no live cue, answered with its active cue before its fire event', true],
    ['review 11 control: never pauses on the Go with no live cue, answered with its fire event alone', false],
  ] as const) {
    it(name, async () => {
      const rig = await lightsRig({ show: RECORDED_SHOW, position: 28 });
      await rig.read();
      await rig.arm();
      const since = rig.producer.received.length;
      rig.fake.holdFires();
      const sent = cueListMessages(rig.fake).length;
      await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
      await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));
      if (activeFirst) rig.fake.emit('/eos/out/active/cue/1/1', [0.0]);
      rig.fake.releaseFires();
      await vi.waitFor(() => expect(rig.latest()?.state).toEqual([expect.stringMatching(/^Live cue 1\b/)]), { timeout: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await neverPaused(rig, since);
    });
  }

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
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 11'
