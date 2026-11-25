#!/bin/sh
# Pre-PR review 1 of setlist-controller#331, findings 1 and 2: the two halves of #335's rule for
# another list's fire event, and the active-cue fill, that the tests do not each pin.
# Applies one mutant of src/server/eos.ts in a throwaway worktree at HEAD, outside the repo, and runs
# test/eos.test.ts there. Exit 0 means every test passed with the mutant in place.
#   now-rule      another list's fire event judges a pending Go only by the link it recorded when sent,
#                 never by the cue list as read now (finding 1: passes all of test/eos.test.ts today)
#   refill        an active cue Eos names with no live cue replaces the link a pending Go recorded when
#                 sent, not only a missing one (finding 1: passes all of test/eos.test.ts today)
#   list-number   a link whose list before the "/" is not a whole number above 0, such as "/1" or "x/1",
#                 names that list and cue rather than no cue the lights can read (finding 1: passes all
#                 of test/eos.test.ts today)
#   no-press-time a Go records no link when it is sent (finding 2: the "renumbered to 4.5" cases stay green)
#   no-fill       an active cue Eos names with no live cue never fills a pending Go's link (finding 2:
#                 the "named active while the Go was pending" test stays green)
#   sh docs/reviews/setlist-controller-331/repro/review-1-mutants.sh <mutant>
set -eu
repo=$(git rev-parse --show-toplevel)
case "${1:-}" in
  now-rule) expr='s/ && \(names\(outside\) \|\| names\(outsideLink\(goFrom\(\)\)\)\)\);/ \&\& names(outside));/' ;;
  refill) expr='s/sent\.outside \?\?= link;/sent.outside = link;/' ;;
  list-number) expr='s/readable && Number\.isInteger\(list\) && list > 0 \?/readable ?/' ;;
  no-press-time) expr="s/outside: command === 'go' \? outsideLink\(goFrom\(\)\) : null/outside: null/" ;;
  no-fill) expr='s/      if \(link\) for \(const sent of own\) if \(sent\.command === .go.\) sent\.outside \?\?= link;\n//' ;;
  *) echo "usage: $0 now-rule|refill|list-number|no-press-time|no-fill" >&2; exit 2 ;;
esac
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
before=$(shasum "$scratch/wt/src/server/eos.ts")
perl -0pi -e "$expr" "$scratch/wt/src/server/eos.ts"
[ "$before" != "$(shasum "$scratch/wt/src/server/eos.ts")" ] || { echo "mutant $1 did not apply" >&2; exit 3; }
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts
