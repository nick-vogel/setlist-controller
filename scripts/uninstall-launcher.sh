#!/usr/bin/env bash
# Stops the setlist server and removes the Setlist Controller app and the server's launchd job definition. The logs in
# ~/Library/Logs/setlist-controller stay.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/launcher-common.sh"

if stop_job; then
  echo "Stopped $LABEL."
else
  echo "$LABEL was not loaded."
fi

rm -rf "$APP"
# The old login agent too, in case the install script never ran over it.
rm -f "$PLIST" "$OLD_PLIST"
echo "Removed $APP and $PLIST."
