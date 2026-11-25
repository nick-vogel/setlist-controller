#!/usr/bin/env bash
# Rewrites every fixed real-time sleep in test/hub-coalescing.test.ts into the same sleep with the
# event loop held busy 5 ms past it, as a loaded CI runner does, then runs the file. A test whose
# ordering rests on "the UDP report has surely arrived by now" fails; a test that waits on an
# observed fact passes. Copies the working tree to a temp folder and links node_modules, so nothing
# in the repo changes. Run from the repo root.
# pre-PR review 1, finding 2: red at fcc69f0 on the 80 Hz test with "got 25 that did not".
set -euo pipefail
repo=$(pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude test-results ./ "$work/"
ln -s "$repo/node_modules" "$work/node_modules"
perl -0pi -e 's/await new Promise\(\(resolve\) => setTimeout\(resolve, (\d+)\)\);/await (() => { const slept = new Promise((resolve) => setTimeout(resolve, $1)); const until = performance.now() + $1 + 5; while (performance.now() < until); return slept; })();/g' "$work/test/hub-coalescing.test.ts"
echo "stalled sleeps: $(grep -c 'const until = performance.now()' "$work/test/hub-coalescing.test.ts")"
cd "$work" && pnpm -s vitest run test/hub-coalescing.test.ts -t '20 Hz|cue timing'
