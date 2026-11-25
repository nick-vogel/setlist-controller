#!/bin/sh
# Pre-PR review 2, findings 1 and 2: runs review-2-repro.test.ts in a throwaway worktree at HEAD,
# outside the repo. Today both tests fail; once the findings are fixed, both pass.
#   sh docs/reviews/setlist-controller-108/repro/review-2-repro.sh
set -eu
repo=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
cp "$repo/docs/reviews/setlist-controller-108/repro/review-2-repro.test.ts" "$scratch/wt/test/"
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/review-2-repro.test.ts
