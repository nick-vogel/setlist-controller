#!/bin/sh
# Pre-PR review 1, finding 1: three rules of the Eos adapter that no test pins.
# Applies one mutant of src/server/eos.ts in a throwaway worktree at HEAD, outside the repo, and runs
# test/eos.test.ts there. Today every mutant passes (exit 0). Once the finding is fixed, each must fail.
#   sh docs/reviews/setlist-controller-108/repro/eos-mutants.sh own-splice|any-stop|label-string
set -eu
repo=$(git rev-parse --show-toplevel)
case "${1:-}" in
  own-splice) expr='s/own = own\.slice(at + 1);/own.splice(at, 1);/' ;;
  any-stop) expr="s/message\.address === STOPPED/message.address.endsWith('\/stop')/" ;;
  label-string) expr="s/label: typeof label === 'string' ? label : ''/label: String(label)/" ;;
  *) echo "usage: $0 own-splice|any-stop|label-string" >&2; exit 2 ;;
esac
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT
git -C "$repo" worktree add --detach "$scratch/wt" HEAD >/dev/null 2>&1
ln -s "$repo/node_modules" "$scratch/wt/node_modules"
before=$(shasum "$scratch/wt/src/server/eos.ts")
sed -i '' "$expr" "$scratch/wt/src/server/eos.ts"
[ "$before" != "$(shasum "$scratch/wt/src/server/eos.ts")" ] || { echo "mutant $1 did not apply" >&2; exit 3; }
cd "$scratch/wt" && "$repo/node_modules/.bin/vitest" run test/eos.test.ts
