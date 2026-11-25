#!/usr/bin/env bash
# Installs the Setlist Controller app on the stage MacBook: the server's launchd job definition in the app support
# folder, and the applet in ~/Applications that loads the job when it opens and removes it when it quits. It never starts
# the server, and login never loads the job. Run it from anywhere in the checkout, with the app quit. Run it again after
# a git pull, after switching Node installs, or after moving the repository, since the definition and the applet hold
# both paths.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/launcher-common.sh"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The server serves the built web app from dist/web, which git does not hold.
pnpm install --frozen-lockfile
pnpm build

# The next open of the app loads the new definition.
stop_job || true
rm -f "$OLD_PLIST"

mkdir -p "$SUPPORT" "$LOGS" "$HOME/Applications"

# The node that runs these lines is the node the job and the applet run, by its absolute path.
NODE="$(command -v node)"
SETLIST_NODE="$NODE" node src/install/print-server-job.ts | plutil -convert xml1 -o "$PLIST" -
plutil -lint "$PLIST" >/dev/null

# osacompile keeps parts of an applet that already exists, so the applet is built beside it and then replaces it.
BUILD="$(mktemp -d "$SUPPORT/applet.XXXXXX")"
trap 'rm -rf "$BUILD"' EXIT
SETLIST_NODE="$NODE" node src/install/print-applet.ts | osacompile -s -o "$BUILD/Setlist Controller.app"
rm -rf "$APP"
mv "$BUILD/Setlist Controller.app" "$APP"

echo "Installed $APP. Drag it to the Dock once, then open it to start the server."
echo "Logs: $LOGS"
