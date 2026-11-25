#!/bin/sh
# Pre-PR review 5. Finding 1 (a Go or Back whose fire event a drop eats paused the lights by hand on
# reconnect) is fixed by setlist-controller#271, whose tests are in the suite. Finding 2: rules of
# the reconnect judgement change with no test going red. Appends five finding 2 tests to
# test/eos.test.ts in a throwaway worktree at HEAD, outside the repo, and runs them green. Then it
# applies one mutant at a time and shows the test that pins its rule red, and the existing two
# suites green under it where finding 2 still leaves a gap. Mutants:
#   a   the lights' own cue no longer clears the kept fires (sendOwn)
#   b   a fire event no longer clears the kept fires (the fire branch of receive)
#   g2  an unanswered Go or Back at the close excuses any cue on reconnect
#   l   only the last unanswered command's cue is kept at the close
#   r4  review 4 finding 1's mutant, corrected for #268: the kept cue is cleared in cue() alone
#       (review-4-repro.sh's first substitution no longer matches since #268)
# #271's tests already turn the suite red under g2 and r4, so only a, b and l are still gaps.
# Once finding 2 is fixed, the tests are in the suite and each mutant turns the suite red.
#   sh docs/reviews/setlist-controller-108/repro/review-5-repro.sh
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
cat >> "$scratch/wt/test/eos.test.ts" <<'TESTS'

describe('review 5 finding 2', () => {
  it.each(DROPS)("review 5 a: the lights' own cue after a reconnect to an Eos that names no active cue ends the kept fires: $how", async ({ how }) => {
    const rig = await lightsRig({ position: 28 });
    const { fake, read, arm, play, jump, shows, producer, lights, latest } = rig;
    await read();
    await arm();
    await play(5, 33);
    await shows(['Live cue 3: Goodness of God / Chorus', ...RECORDED_LIST]);
    eatFireEvents(rig, how);
    await play(16, 49);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3.5')));
    await drop(rig, how);
    fake.setShow(RECORDED_SHOW);
    await reconnect(rig, how);
    await shows([...RECORDED_LIST]);
    const since = producer.received.length;
    fake.holdFires();
    await jump(1, 1);
    await play(5, 18);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('2')));
    fake.emit('/eos/out/active/cue/1/2', [0]);
    fake.releaseFires();
    await shows(['Live cue 2: Goodness of God / Verse 1', ...RECORDED_LIST]);
    await producer.flush();
    expect(producer.received.slice(since).every((s) => lights(s)?.arm === 'armed' && lights(s)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it.each(DROPS)('review 5 b: a fire event after a reconnect to an Eos that names no active cue ends the kept fires: $how', async ({ how }) => {
    const rig = await lightsRig({ position: 28 });
    const { fake, read, arm, play, shows, next, lights, latest } = rig;
    await read();
    await arm();
    await play(5, 33);
    await shows(['Live cue 3: Goodness of God / Chorus', ...RECORDED_LIST]);
    eatFireEvents(rig, how);
    await play(16, 49);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3.5')));
    await drop(rig, how);
    fake.setShow(RECORDED_SHOW);
    await reconnect(rig, how);
    await shows([...RECORDED_LIST]);
    const pausedOnce = next((s) => lights(s)?.pause === 'by-hand');
    fake.fireByHand('1');
    await pausedOnce;
    await shows(['Live cue 1: Goodness of God / Intro', ...RECORDED_LIST]);
    await arm();
    if (how === 'silent') fake.silence();
    await drop(rig, how);
    fake.fireByHand('3.5');
    const paused = next((s) => lights(s)?.pause === 'by-hand');
    await reconnect(rig, how);
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it("review 5 g: a cue fired at the console during a drop that ate the lights' Go still pauses them", async () => {
    const rig = await lightsRig({ position: 28 });
    const { fake, read, arm, play, press, shows, next, latest, lights } = rig;
    await read();
    await arm();
    await play(5, 33);
    await shows(['Live cue 3: Goodness of God / Chorus', ...RECORDED_LIST]);
    fake.silence();
    await press({ kind: 'run-button', target: 'eos', button: 'go' });
    await vi.waitFor(() => expect(cueListMessages(fake).at(-1)).toEqual(GO));
    await drop(rig, 'silent');
    fake.fireByHand('2');
    const paused = next((s) => lights(s)?.pause === 'by-hand');
    await reconnect(rig, 'silent');
    await paused;
    expect(latest()).toEqual(expect.objectContaining({ arm: 'paused', pause: 'by-hand' }));
  });

  it.each(DROPS)('review 5 l: every unanswered fire is kept at the close, not only the last: $how', async ({ how }) => {
    const rig = await lightsRig({ show: FOLLOW_SHOW, position: 12 });
    const { fake, read, arm, play, shows, producer, lights, latest } = rig;
    await read();
    await arm();
    await play(5, 17);
    await shows(['Live cue 2: Goodness of God / Verse 1', ...FOLLOW_LIST]);
    const since = producer.received.length;
    eatFireEvents(rig, how);
    await play(16, 33);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3')));
    await play(16, 49);
    await vi.waitFor(() => expect(fires(fake).at(-1)).toEqual(fire('3.5')));
    await drop(rig, how);
    fake.follow('3.1');
    await reconnect(rig, how);
    await shows(['Live cue 3.1', ...FOLLOW_LIST]);
    await producer.flush();
    expect(producer.received.slice(since).every((s) => lights(s)?.arm === 'armed' && lights(s)?.pause === null)).toBe(true);
    expect(latest()).toEqual(expect.objectContaining({ arm: 'armed', pause: null }));
  });

  it("review 5 r4: the lights' own Go after a reconnect to an Eos that names no active cue never pauses them", async () => {
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
vitest="$repo/node_modules/.bin/vitest"
echo "Finding 2's tests at HEAD, expect pass:"
"$vitest" run test/eos.test.ts -t 'review 5 finding 2'
status=0
mutate() {
  git checkout -- src/server/eos.ts
  case "$1" in
    a) perl -0pi -e 's/(\n    before = null;)\n    beforeOwn = new Set\(\);\n  \};/$1\n  };/' src/server/eos.ts ;;
    b) perl -0pi -e 's/(\n      before = null;)\n      beforeOwn = new Set\(\);(\n      showLines\(\);\n      \/\/ A fire of a cue)/$1$2/' src/server/eos.ts ;;
    g2) perl -0pi -e "s/if \(from !== null\) beforeOwn\.add\(from\);/beforeOwn.add(typeof command === 'object' ? command.cue : '*');/; s/\.some\(\(cue\) => cue === number \|\|/.some((cue) => cue === '*' || cue === number ||/" src/server/eos.ts ;;
    l) perl -0pi -e "s/if \(from !== null\) beforeOwn\.add\(from\);\n      \}/}\n      if (from !== null) beforeOwn.add(from);/" src/server/eos.ts ;;
    r4) perl -0pi -e 's/\n    before = null;(\n    beforeOwn = new Set\(\);\n  \};)/$1/; s/if \(labelled\) sendOwn\(/if (labelled) before = null;\n      if (labelled) sendOwn(/' src/server/eos.ts ;;
  esac
  if git diff --quiet -- src/server/eos.ts; then echo "MUTANT $1 DID NOT APPLY"; exit 3; fi
}
for mutant in a b g2 l r4; do
  mutate "$mutant"
  case "$mutant" in
    g2|r4)
      echo "Mutant $mutant, the existing two suites (expect fail, #271's tests pin it):"
      if "$vitest" run test/eos.test.ts test/connections.test.ts -t '^(?!review 5)'; then echo "UNEXPECTED: the suite let mutant $mutant through"; status=1; fi ;;
    *)
      echo "Mutant $mutant, the existing two suites (expect pass, the gap):"
      "$vitest" run test/eos.test.ts test/connections.test.ts -t '^(?!review 5)' || { echo "UNEXPECTED: the suite killed mutant $mutant"; status=1; } ;;
  esac
  echo "Mutant $mutant, its review 5 test (expect fail):"
  if "$vitest" run test/eos.test.ts -t "review 5 ${mutant%2}:"; then echo "UNEXPECTED: review 5 $mutant passed under its mutant"; status=1; fi
done
git checkout -- src/server/eos.ts
[ "$status" -eq 0 ] && echo "As expected: every mutant fails its review 5 test, and a, b and l survive the suite."
exit "$status"
