#!/bin/sh
# Pre-PR review 3, finding 1: after a reconnect whose connect burst names no active cue of the cue
# list, the active cue Eos sends ahead of the fire event for the lights' own Fire again or Go is
# judged against the cue kept from before the drop, and pauses the lights by hand. Appends a test
# to test/eos.test.ts in a throwaway worktree at HEAD, outside the repo, so lightsRig is in scope, and
# runs only it. Today it fails; once the finding is fixed, it passes.
#   sh docs/reviews/setlist-controller-108/repro/review-3-repro.sh
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
cat >> "$scratch/wt/test/eos.test.ts" <<'TESTS'

describe('review 3 finding 1', () => {
  // Armed on cue 3.1 by Go, dropped, and connected again to an Eos whose burst names no active cue
  // of the cue list, as the fake's setShow leaves it.
  const dropToNoActiveCue = async () => {
    const lights = await lightsRig({ show: FOLLOW_SHOW, position: 28 });
    const { fake, read, arm, play, press, shows, next, comesOnline } = lights;
    await read();
    await arm();
    await play(5, 33);
    await shows(['Live cue 3: Goodness of God / Chorus', ...FOLLOW_LIST]);
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);
    const dropped = next((snapshot) => lights.lights(snapshot)?.connection === 'offline');
    await fake.refuse();
    await dropped;
    fake.setShow(FOLLOW_SHOW);
    await fake.accept();
    await comesOnline();
    await shows([...FOLLOW_LIST]);
    return lights;
  };

  it("review 3 finding 1: the lights' own Fire again after such a reconnect never pauses them", async () => {
    const { fake, press, shows, producer, lights, latest } = await dropToNoActiveCue();
    const since = producer.received.length;
    fake.holdFires();
    await press({ kind: 'fire-again', target: 'eos' });
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3')));
    // fire-follow-chain.json: Eos sends the fired cue's active cue ahead of its fire event.
    fake.emit('/eos/out/active/cue/1/3', [0]);
    fake.releaseFires();
    await shows(['Live cue 3: Goodness of God / Chorus', ...FOLLOW_LIST]);
    await producer.flush();
    expect(producer.received.slice(since).every((snapshot) => lights(snapshot)?.arm === 'armed' && lights(snapshot)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

});
TESTS
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts -t 'review 3 finding 1'
