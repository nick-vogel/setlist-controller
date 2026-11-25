#!/bin/sh
# setlist-controller#84 pre-PR review 7, findings 1 and 2. At 99fb0e3, guard-removed and every-slide
# survive (all green), and expected-dropped is killed only by the AC2 test, whose name says nothing
# about it. After the remediation, all three must be killed, and expected-dropped by a test named for
# the opening frame over the expected slide.
# Run it in a scratch worktree, never the live one, since it edits and restores source files:
#   git worktree add --detach <scratch>/wt HEAD && ln -s "$PWD/node_modules" <scratch>/wt/node_modules
#   sh docs/reviews/setlist-controller-84/repro/review-7-mutations.sh <scratch>/wt
#   git worktree remove --force <scratch>/wt
set -u
WT=$1
cd "$WT" || exit 2
mutate() {
  name=$1; file=$2; old=$3; new=$4; shift 4
  cp "$file" "$file.orig"
  python3 -c 'import sys
p, o, n = sys.argv[1:4]
s = open(p).read()
assert o in s, (p, o)
open(p, "w").write(s.replace(o, n, 1))' "$file" "$old" "$new" || { mv "$file.orig" "$file"; echo "$name: mutation did not apply"; return; }
  out=$(pnpm exec vitest run "$@" 2>&1)
  if [ $? -eq 0 ]; then echo "$name: survived (all green)"; else echo "$name: killed (red)"; echo "$out" | grep -E '^ FAIL ' | sed 's/^/  /'; fi
  mv "$file.orig" "$file"
}
P="test/propresenter.test.ts test/propresenter-adapter.test.ts"
# Finding 1a: the cold press also moves from the last slide shown after a frame has come.
mutate guard-removed src/server/propresenter.ts 'const beside = !earlier && showing === null && lastShown ?' 'const beside = !earlier && lastShown ?' $P
# Finding 1b: the cold press expects every slide of the last slide's presentation, not its neighbour.
mutate every-slide src/server/propresenter.ts 'lastShown ? slideBeside(button.id, lastShown) : [];' 'lastShown ? lastShown.presentation.groups.flatMap(({ slides }) => slides).filter((slide): slide is string => slide !== null) : [];' $P
# Finding 2: going offline forgets the expected slide.
mutate expected-dropped src/server/propresenter.ts '    showing = null;
    buttonBrings = [];' '    showing = null;
    expected = null;
    buttonBrings = [];' $P
