# Sourced by install-launcher.sh and uninstall-launcher.sh: the server job's label and paths, and the stop both run.
# The launcher finds the same definition through serverJobPath in src/install/server-job.ts.

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The launcher runs on macOS only." >&2
  exit 1
fi

LABEL="com.nlvogel.setlist-controller"
SUPPORT="$HOME/Library/Application Support/setlist-controller"
PLIST="$SUPPORT/$LABEL.plist"
APP="$HOME/Applications/Setlist Controller.app"
# Where the login agent from before the launcher lived. The scripts only delete it.
OLD_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGS="$HOME/Library/Logs/setlist-controller"
DOMAIN="gui/$(id -u)"

# Removes the job, whether the old login agent or the app loaded it, and waits up to 10 seconds for launchd to let it
# go. Returns non-zero when the job was not loaded.
stop_job() {
  launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || return 1
  launchctl bootout "$DOMAIN/$LABEL" || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
    sleep 1
  done
}
