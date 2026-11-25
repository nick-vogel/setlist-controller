import { isAbsolute, join } from 'node:path';

// The Setlist Controller app on the stage MacBook: a stay-open AppleScript applet, compiled by the install script with
// `osacompile -s`. It holds no logic beyond the quit dialog. It runs the launcher's start when it opens and, on Stop,
// the launcher's stop when it quits. Picking Keep running returns from the quit handler without `continue quit`, which
// keeps the applet open, and the server with it.
const APPLET_NAME = 'Setlist Controller';
export const STOP_BUTTON = 'Stop';
// The default, so an accidental Cmd-Q and Return during a service leaves the band its controller (#285).
export const KEEP_RUNNING_BUTTON = 'Keep running';

// The quit event's reason, read as a Cocoa app reads it in applicationShouldTerminate:
// https://developer.apple.com/forums/thread/94126. The keyword is 'why?', and each value is a four-character code as
// an integer: 'rlgo' for a logout, 'rest' for a restart and 'shut' for a shut down. A quit Nick asks for has none.
const QUIT_REASON_KEYWORD = 0x7768793f;
const SESSION_ENDS = [0x726c676f, 0x72657374, 0x73687574];

export type AppletOptions = {
  // The repository's absolute path on the stage MacBook.
  repoRoot: string;
  // The node binary's absolute path, captured at install time, since an applet's shell has no useful PATH.
  nodePath: string;
};

// An AppleScript string literal: a backslash and a double quote are the two characters it escapes.
const literal = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

export function appletSource({ repoRoot, nodePath }: AppletOptions): string {
  if (!isAbsolute(nodePath)) throw new Error(`The node path must be absolute, since an applet's shell has no PATH: ${nodePath}`);
  const launcher = join(repoRoot, 'src/launcher/main.ts');
  return `-- Built by scripts/install-launcher.sh from src/install/applet.ts. Run the install script again to rebuild it.
use AppleScript version "2.4"
use framework "Foundation"
use scripting additions

on launcher(subcommand)
	do shell script quoted form of ${literal(nodePath)} & " " & quoted form of ${literal(launcher)} & " " & subcommand
end launcher

-- The launcher's message, which is its stderr when it exits non-zero.
on showError(message)
	display dialog message with title ${literal(APPLET_NAME)} buttons {"OK"} default button "OK" with icon stop
end showError

-- Whether a quit event is macOS quitting the applet to log out, restart or shut down. The session's end stops the
-- server with no dialog, since a dialog would hold up the logout. The codes are past AppleScript's integer range, so
-- its compiler keeps the list as reals. A failure to read the event counts as a quit Nick asked for.
on endsSession(quitEvent)
	try
		if quitEvent is missing value then return false
		set reason to quitEvent's attributeDescriptorForKeyword:${QUIT_REASON_KEYWORD}
		if reason is missing value then return false
		return {${SESSION_ENDS.join(', ')}} contains ((reason's typeCodeValue()) as real)
	on error
		return false
	end try
end endsSession

on run
	try
		launcher("start")
	on error message
		showError(message)
	end try
end run

on quit
	if endsSession(current application's NSAppleEventManager's sharedAppleEventManager()'s currentAppleEvent()) then
		try
			launcher("stop")
		end try
		continue quit
	end if
	set choice to button returned of (display dialog "Stop the setlist server?" with title ${literal(APPLET_NAME)} buttons {${literal(STOP_BUTTON)}, ${literal(KEEP_RUNNING_BUTTON)}} default button ${literal(KEEP_RUNNING_BUTTON)})
	if choice is ${literal(STOP_BUTTON)} then
		try
			launcher("stop")
		on error message
			showError(message)
			return
		end try
		continue quit
	end if
end quit
`;
}
