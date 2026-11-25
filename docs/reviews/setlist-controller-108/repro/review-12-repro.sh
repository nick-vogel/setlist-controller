#!/bin/sh
# Pre-PR review 12. Inserts a test into test/eos.test.ts's describe "the fire event that answers
# the lights' own Go and Back", in a throwaway worktree at HEAD, outside the repo, and runs them.
# It starts with no live cue on a show whose cue 3 follows into 3.5 (FOLLOWED_3), as at a reconnect
# before the connect burst's active cue, with the fake's own answer to the Go held and never sent.
#   review 12 f1 go-resumed  a Go; Eos names cue 3 active, then the resume event that answers a Go;
#                            then 3's follow fires 3.5.
# It must never pause, since 3.5 is the cue Eos fires by itself after cue 3. Red at HEAD (d715230's
# guard skips the active cue while the Go is pending) and green with eos.ts from e2433af.
#   sh docs/reviews/setlist-controller-108/repro/review-12-repro.sh                  (eos.ts at HEAD)
#   sh docs/reviews/setlist-controller-108/repro/review-12-repro.sh <path to eos.ts> (another eos.ts)
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
if [ $# -gt 0 ]; then cp "$1" "$scratch/wt/src/server/eos.ts"; fi
cat > "$scratch/tests.ts" <<'TESTS'
  {
    it('review 12 f1 go-resumed: never pauses on the follow of the cue Eos named active before the resume that answers a Go', async () => {
      const rig = await lightsRig({ show: FOLLOWED_3, position: 28 });
      await rig.read();
      await rig.arm();
      const since = rig.producer.received.length;
      rig.fake.holdFires();
      const sent = cueListMessages(rig.fake).length;
      await rig.press({ kind: 'run-button', target: 'eos', button: 'go' });
      await vi.waitFor(() => expect(cueListMessages(rig.fake)).toHaveLength(sent + 1));
      rig.fake.emit('/eos/out/active/cue/1/3', [1.0]);
      rig.fake.emit('/eos/out/event/cue/1/0/resume', ['']);
      await new Promise((resolve) => setTimeout(resolve, 100));
      rig.fake.emit('/eos/out/event/cue/1/3.5/fire', ['Goodness of God / Bridge']);
      await vi.waitFor(() => expect(rig.latest()?.state).toEqual([expect.stringMatching(/^Live cue 3\.5\b/)]), { timeout: 2000 });
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
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 12'
