#!/bin/sh
# Pre-PR review 2, finding 3: rules of the lights that no test pins. Applies one mutant in a
# throwaway worktree at HEAD, outside the repo, and runs the suite that should catch it. Today every
# mutant passes (exit 0). Once the finding is fixed, each must fail.
#   sh docs/reviews/setlist-controller-108/repro/review-2-mutants.sh acts-before-read|shown-reset|live-on-close|reset-online|close-timers|list-copy
set -eu
repo=$(git rev-parse --show-toplevel)
file=src/server/eos.ts
suite=test/eos.test.ts
case "${1:-}" in
  acts-before-read) expr='s/actsOn: \(cue: Cue\) => labelledFor/actsOn: (cue: Cue) => !listRead || labelledFor/' ;;
  shown-reset) expr='s/\n        shown = null;\n/\n/' ;;
  live-on-close) expr='s/\n      live = null;\n      own = \[\];/\n      own = [];/' ;;
  reset-online) expr='s/error !== null && !wasOnline \?/error !== null ?/' ;;
  close-timers) expr='s/(if \(socket === connection\) \{\n\s+socket = null;\n)\s+stopTimers\?\.\(\);\n\s+stopTimers = null;\n/$1/' ;;
  list-copy) file=src/server/connections.ts; suite=test/connections.test.ts; expr='s/list: list \? \[\.\.\.list\] : \[\]/list: list ?? []/' ;;
  *) echo "usage: $0 acts-before-read|shown-reset|live-on-close|reset-online|close-timers|list-copy" >&2; exit 2 ;;
esac
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
before=$(shasum "$scratch/wt/$file")
perl -0pi -e "$expr" "$scratch/wt/$file"
[ "$before" != "$(shasum "$scratch/wt/$file")" ] || { echo "mutant $1 did not apply" >&2; exit 3; }
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run "$suite"
