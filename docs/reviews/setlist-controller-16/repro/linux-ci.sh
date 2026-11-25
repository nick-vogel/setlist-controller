#!/usr/bin/env bash
# Runs test/hub-coalescing.test.ts in a node:24 Linux container held to 4 CPUs, the size of the
# ubuntu-latest runner CI uses. Copies the working tree (not HEAD) to a temp folder, so an
# uncommitted fix is what gets tested. Run from the repo root. Needs Docker and the network.
# pre-PR review 1, finding 1: red at fcc69f0 with "expected 400 to be less than 200".
set -euo pipefail
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude test-results ./ "$work/"
docker run --rm --cpus=4 -v "$work":/app -w /app node:24 bash -c '
  corepack enable >/dev/null 2>&1
  CI=true pnpm install --frozen-lockfile >/tmp/install.log 2>&1 || { tail -20 /tmp/install.log; exit 1; }
  sysctl net.ipv4.tcp_wmem net.ipv4.tcp_rmem
  for i in 1 2 3; do pnpm -s vitest run test/hub-coalescing.test.ts || exit 1; done'
