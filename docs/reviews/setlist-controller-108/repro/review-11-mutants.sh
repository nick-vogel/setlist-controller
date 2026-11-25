#!/bin/sh
# Pre-PR review 11, finding 2: rules of the #327, #328 and #330 work that no test pins.
# Applies one mutant of src/server/eos.ts in a throwaway worktree at HEAD, outside the repo, and runs
# test/eos.test.ts and test/fake-eos.test.ts there. Today every mutant passes (exit 0). Once the
# finding is fixed, each must fail.
#   echo-other-cue  a fire event of another cue that answers a command of the lights keeps the echo
#   echo-any-follow a plain follow, with no fire by number, sets the echo
#   named-on-close  a close keeps the cues Eos named active
#   link-unreadable a string link with no "/" or no cue number reads as no link, not outside the list
#   sh docs/reviews/setlist-controller-108/repro/review-11-mutants.sh <mutant>
set -eu
repo=$(git rev-parse --show-toplevel)
case "${1:-}" in
  echo-other-cue) expr='s/else if \(!command \|\| echo\?\.number !== number\) echo = null;/else if (!command) echo = null;/' ;;
  echo-any-follow) expr='s/if \(byNumber && followed\) echo = /if (followed) echo = /' ;;
  named-on-close) expr='s/      named = \[\];\n      echo = null;/      echo = null;/' ;;
  link-unreadable) expr='s/  if \(Number\(link\.slice\(0, at\)\) !== cueList \|\| !Number\.isFinite\(cue\) \|\| cue <= 0\) return .outside.;/  if (!Number.isFinite(cue) || cue <= 0) return null;\n  if (Number(link.slice(0, at)) !== cueList) return "outside";/' ;;
  *) echo "usage: $0 echo-other-cue|echo-any-follow|named-on-close|link-unreadable" >&2; exit 2 ;;
esac
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
before=$(shasum "$scratch/wt/src/server/eos.ts")
perl -0pi -e "$expr" "$scratch/wt/src/server/eos.ts"
[ "$before" != "$(shasum "$scratch/wt/src/server/eos.ts")" ] || { echo "mutant $1 did not apply" >&2; exit 3; }
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts test/fake-eos.test.ts
