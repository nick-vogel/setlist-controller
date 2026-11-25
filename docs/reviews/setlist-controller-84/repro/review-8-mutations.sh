#!/bin/sh
# setlist-controller#84 pre-PR review 8, finding 1. At 3abd9b9, both-neighbours survives (all green):
# the cold press's cover may take the slide on the other side of the last slide shown too, with no
# test red. After the remediation it must be killed by the tests from review-8-candidate-tests.diff.
# two-ahead is a control, killed at 3abd9b9 and after.
# Run it in a scratch worktree, never the live one, since it edits and restores source files:
#   git worktree add --detach <scratch>/wt HEAD && ln -s "$PWD/node_modules" <scratch>/wt/node_modules
#   sh docs/reviews/setlist-controller-84/repro/review-8-mutations.sh <scratch>/wt
#   git worktree remove --force <scratch>/wt
set -u
WT=$1
cd "$WT" || exit 2
mutate() {
  name=$1; file=$2; old=$3; new=$4; shift 4
  cp "$file" "$file.orig"
  python3 -I -c 'import sys
p, o, n = sys.argv[1:4]
s = open(p).read()
assert o in s, (p, o)
open(p, "w").write(s.replace(o, n, 1))' "$file" "$old" "$new" || { mv "$file.orig" "$file"; echo "$name: mutation did not apply"; return; }
  out=$(pnpm exec vitest run "$@" 2>&1)
  if [ $? -eq 0 ]; then echo "$name: survived (all green)"; else echo "$name: killed (red)"; echo "$out" | grep -E '^ FAIL ' | sed 's/^/  /'; fi
  mv "$file.orig" "$file"
}
P="test/propresenter.test.ts test/propresenter-adapter.test.ts"
# Finding 1: the cold press expects both slides beside the last slide shown, not the one its button brings.
mutate both-neighbours src/server/propresenter.ts "const text = slideAt(shown.presentation, shown.index + (id === 'next' ? 1 : -1));
  return text === null ? [] : [text];" "return [slideAt(shown.presentation, shown.index + 1), slideAt(shown.presentation, shown.index - 1)].filter((t): t is string => t !== null);" $P
# Control: the cold press expects the slide two along.
mutate two-ahead src/server/propresenter.ts "shown.index + (id === 'next' ? 1 : -1)" "shown.index + (id === 'next' ? 2 : -2)" $P
