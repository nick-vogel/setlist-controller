#!/bin/sh
# Pre-PR review 4, finding 1: no test pins that the lights' own Go ends the reconnect judgement.
# Moving the clear of the kept cue out of sendOwn and into cue() alone leaves every test green.
# Appends a Go test to test/eos.test.ts in a throwaway worktree at HEAD, outside the repo, runs it
# (green), then applies that mutant and runs it again (red). Today the existing suite lets the
# mutant through; once the finding is fixed, the test in the suite kills it.
#   sh docs/reviews/setlist-controller-108/repro/review-4-repro.sh
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
cat >> "$scratch/wt/test/eos.test.ts" <<'TESTS'

describe('review 4 finding 1', () => {
  it("review 4 finding 1: the lights' own Go after a reconnect to an Eos that names no active cue never pauses them", async () => {
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
});
TESTS
cd "$scratch/wt"
echo "At HEAD, expect pass:"
"$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 4 finding 1'
perl -0pi -e 's/\n    before = null;\n  \};/\n  };/; s/if \(labelled\) sendOwn\(/if (labelled) before = null;\n      if (labelled) sendOwn(/' src/server/eos.ts
git diff --stat -- src/server/eos.ts
echo "With the clear in cue() alone, the existing suite (expect pass, the gap):"
"$repo/node_modules/.bin/vitest" run test/eos.test.ts test/connections.test.ts -t '^(?!review 4)' || true
echo "With the clear in cue() alone, the Go test (expect fail):"
if "$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 4 finding 1'; then
  echo "UNEXPECTED: the Go test passed under the mutant"
  exit 1
fi
echo "As expected: the Go test fails under the mutant."
