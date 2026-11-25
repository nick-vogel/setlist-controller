#!/usr/bin/env bash
# Proves pre-PR review 2, finding 1 (test/hub-coalescing.test.ts:374-379).
# Step 5 leaves fade === 'out'. When step 7 calls rig.live.setPlaying(false), server.ts:335-336
# publishes { playing: false, fade: 'out' } and then { playing: false, fade: null } in the same
# tick. hub.ts holds the second frame behind inFlight until the first send callback fires.
# Holding that callback until leader's flush() ping (with a 10 ms fallback so a fixed test that
# waits for fade === null does not hang) makes the race deterministic:
# red 3/3 on HEAD ("AssertionError: expected 19 to be 18"), green 3/3 once line 374 waits for
# snapshot.fade === null.
# Copies the working tree to a temp folder and links node_modules, so nothing in the repo changes.
set -euo pipefail
repo=$(pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude test-results ./ "$work/"
ln -s "$repo/node_modules" "$work/node_modules"
node -e '
const fs = require("node:fs");
const p = process.argv[1];
let s = fs.readFileSync(p, "utf8");
const before = "    socket.send(payload, (error) => {\n      state.inFlight = false;\n      if (closed || error || socket.readyState !== WebSocket.OPEN) return;\n      if (state.dirty) deliver(socket, state);\n    });";
const after = `    const isStopWithFade = payload.includes("\\"playing\\":false") && payload.includes("\\"fade\\":\\"out\\"");
    socket.send(payload, (error) => {
      const finish = () => {
        state.inFlight = false;
        if (closed || error || socket.readyState !== WebSocket.OPEN) return;
        if (state.dirty) deliver(socket, state);
      };
      if (isStopWithFade) {
        let done = false;
        const run = () => {
          if (done) return;
          done = true;
          finish();
        };
        socket.once("ping", run);
        setTimeout(run, 10);
      } else finish();
    });`;
if (!s.includes(before)) {
  console.error("Could not instrument src/server/hub.ts: send block changed.");
  process.exit(2);
}
fs.writeFileSync(p, s.replace(before, after));
' "$work/src/server/hub.ts"
cd "$work"
for i in 1 2 3; do
  echo "=== run $i ==="
  pnpm -s vitest run test/hub-coalescing.test.ts -t 'flushes immediately' --maxWorkers=2
done
