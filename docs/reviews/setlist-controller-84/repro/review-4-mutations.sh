#!/bin/sh
# setlist-controller#84 pre-PR review 4, findings 2 and 3: each mutation below leaves every test
# green at 4e70ffe. After the remediation, each must turn at least one test red.
# Run it in a scratch worktree, never the live one, since it edits and restores source files:
#   git worktree add --detach <scratch>/wt HEAD && ln -s "$PWD/node_modules" <scratch>/wt/node_modules
#   sh docs/reviews/setlist-controller-84/repro/review-4-mutations.sh <scratch>/wt
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
  if pnpm exec vitest run "$@" > /dev/null 2>&1; then echo "$name: survived (all green)"; else echo "$name: killed (red)"; fi
  mv "$file.orig" "$file"
}
P="test/propresenter.test.ts test/propresenter-adapter.test.ts"
# Finding 2a: the live slide read runs the pause-by-hand decision.
mutate read-decides src/server/propresenter.ts '    slide = slideLines(answer.body);
    reportState();' '    slide = slideLines(answer.body);
    reportState();
    decide(answer.body);' $P
# Finding 2b: the live slide read goes as a command, so it opens a pause-by-hand window.
mutate read-as-command src/server/propresenter.ts 'await request(LIVE_SLIDE_PATH)' 'await command(LIVE_SLIDE_PATH)' $P
# Finding 2c: a refused trigger's line replaces a later command's line.
mutate refused-line-ungated src/server/propresenter.ts '        if (run !== presses) return;
' '' $P
# Finding 2d: an End group no longer triggers for a song with an Ending section of its own.
mutate own-ending-no-end src/server/propresenter.ts 'return ownEnding ? groupFor(presentation, END)' 'return ownEnding ? undefined' $P
# Finding 3: a set with no songs disables the pick, on the page and on the server.
mutate page-empty-set-disables web/src/App.tsx 'setKnown={snapshot.set !== null}' 'setKnown={!!snapshot.set?.songs.length}' test/pages.test.ts
mutate server-empty-set-ignores src/server/connections.ts 'if (!list) {' 'if (!list || list.songs.length === 0) {' test/connections.test.ts test/propresenter.test.ts
