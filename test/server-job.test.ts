import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appletSource, KEEP_RUNNING_BUTTON, STOP_BUTTON } from '../src/install/applet.ts';
import { SERVER_JOB_LABEL, serverErrorLogPath, serverJob, serverJobPath, type ServerJob } from '../src/install/server-job.ts';
import { fakeRig, REPO_ROOT, type FakeRig } from './fake-launchctl.ts';

const HOME = '/Users/operator';
const NODE = '/opt/homebrew/bin/node';
const without = { ...process.env };
delete without.SETLIST_NODE;

// Nothing here loads the job. plutil reads and writes stdin and stdout only, so no plist is written anywhere.
describe('the launchd job', () => {
  const job = serverJob({ repoRoot: REPO_ROOT, nodePath: NODE, home: HOME });
  // The JSON the install script pipes to plutil, exactly as printed.
  const printedJson = (env: NodeJS.ProcessEnv) =>
    execFileSync(process.execPath, [join(REPO_ROOT, 'src/install/print-server-job.ts')], { env, encoding: 'utf8' });
  const printed = (env: NodeJS.ProcessEnv) => JSON.parse(printedJson(env)) as ServerJob;
  const hasPlutil = existsSync('/usr/bin/plutil');
  const plutil = (args: string[], input: string) => execFileSync('/usr/bin/plutil', args, { input, encoding: 'utf8' });

  it('runs the server with an absolute node path, since launchd gives the job no shell PATH', () => {
    const [node, entry, ...rest] = job.ProgramArguments;
    expect(node).toBe(NODE);
    expect(entry).toBe(join(REPO_ROOT, 'src/server/main.ts'));
    expect(rest).toEqual([]);
    expect(existsSync(entry ?? '')).toBe(true);
    expect(job.WorkingDirectory).toBe(REPO_ROOT);
    expect(job.Label).toBe('com.nlvogel.setlist-controller');
  });

  it('prints the node path SETLIST_NODE names, a symlink kept as is, or its own node without it', () => {
    expect(printed({ ...without, SETLIST_NODE: NODE }).ProgramArguments[0]).toBe(NODE);
    expect(printed(without).ProgramArguments[0]).toBe(process.execPath);
  });

  it('prints the whole definition the install script hands to plutil, every key and every value type', () => {
    expect(JSON.parse(printedJson({ ...without, SETLIST_NODE: NODE, HOME }))).toStrictEqual(job);
  });

  // plutil ships with macOS, so this runs on the dev and stage Macs and skips anywhere else.
  it.skipIf(!hasPlutil)('converts to a property list that plutil passes, with booleans and the integer kept as such', () => {
    const xml = plutil(['-convert', 'xml1', '-o', '-', '-'], printedJson({ ...without, SETLIST_NODE: NODE, HOME }));
    expect(() => plutil(['-lint', '-'], xml)).not.toThrow();
    expect(JSON.parse(plutil(['-convert', 'json', '-o', '-', '-'], xml))).toStrictEqual(job);
  });

  it('refuses a node path that is not absolute', () => {
    expect(() => serverJob({ repoRoot: REPO_ROOT, nodePath: 'node', home: HOME })).toThrow(/absolute/);
  });

  it('lives in the app support folder, so login never loads it, and starts the server when the launcher loads it', () => {
    expect(serverJobPath(HOME)).toBe('/Users/operator/Library/Application Support/setlist-controller/com.nlvogel.setlist-controller.plist');
    expect(job.RunAtLoad).toBe(true);
  });

  it('restarts the server about a second after a crash', () => {
    expect(job.KeepAlive).toBe(true);
    // launchd's default throttle spawns a job at most once every 10 seconds.
    expect(job.ThrottleInterval).toBe(1);
  });

  it("writes the server's output to a log folder under ~/Library/Logs", () => {
    expect(job.StandardOutPath).toBe('/Users/operator/Library/Logs/setlist-controller/server.log');
    expect(job.StandardErrorPath).toBe('/Users/operator/Library/Logs/setlist-controller/server.error.log');
    expect(serverErrorLogPath(HOME)).toBe(job.StandardErrorPath);
  });
});

// The install and uninstall scripts, run as Nick runs them, with the fakes first on PATH and HOME inside the worktree's
// dist, so neither loads, starts or unloads a real launchd job, builds, or writes under ~/Library or ~/Applications.
// plutil, osacompile and node are the real ones, so the definition and the applet are what the stage MacBook gets.
// macOS only: the scripts refuse to run anywhere else, and osacompile ships with macOS.
describe.skipIf(process.platform !== 'darwin')('the install and uninstall scripts', () => {
  const service = `gui/${process.getuid?.() ?? 0}/${SERVER_JOB_LABEL}`;
  const oldAgent = (home: string) => join(home, 'Library/LaunchAgents/com.nlvogel.setlist-controller.plist');
  const applet = (home: string) => join(home, 'Applications/Setlist Controller.app');
  const plistJson = (path: string) => JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' })) as Record<string, unknown>;

  async function run(script: string, rig: FakeRig) {
    await rig.clearRecord();
    execFileSync(join(REPO_ROOT, script), { env: rig.env, cwd: rig.home, encoding: 'utf8', stdio: 'pipe' });
    return rig.recorded();
  }

  // Every file under the home folder, by its path from there, with the definition's text, which is the only file whose
  // bytes matter: osacompile stamps the applet's files.
  async function tree(home: string) {
    const files = (await readdir(home, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => relative(home, join(entry.parentPath, entry.name)));
    return { files: files.sort(), definition: await readFile(serverJobPath(home), 'utf8') };
  }

  it('removes the old login agent, writes the definition and the applet, never starts the server, and gives the same result twice', async ({ onTestFinished }) => {
    const rig = await fakeRig(onTestFinished, 'install-launcher');
    // The login agent from before the launcher, installed and loaded.
    await mkdir(dirname(oldAgent(rig.home)), { recursive: true });
    await writeFile(oldAgent(rig.home), 'the old agent');
    await writeFile(rig.loaded, '');

    const first = await run('scripts/install-launcher.sh', rig);

    expect(first).toEqual(['pnpm install --frozen-lockfile', 'pnpm build', `launchctl print ${service}`, `launchctl bootout ${service}`, `launchctl print ${service}`]);
    expect(existsSync(oldAgent(rig.home))).toBe(false);
    expect(existsSync(rig.loaded)).toBe(false);
    // The node the script's shell finds on PATH, a symlink kept as is, so a Homebrew upgrade keeps it working.
    const node = execFileSync('/bin/bash', ['-c', 'command -v node'], { env: rig.env, encoding: 'utf8' }).trim();
    expect(plistJson(serverJobPath(rig.home))).toStrictEqual(serverJob({ repoRoot: REPO_ROOT, nodePath: node, home: rig.home }));

    // osacompile -s: the applet stays open, so its Dock dot shows while the server is up, and its quit handler runs.
    expect(plistJson(join(applet(rig.home), 'Contents/Info.plist')).OSAAppletStayOpen).toBe(true);
    const source = execFileSync('/usr/bin/osadecompile', [join(applet(rig.home), 'Contents/Resources/Scripts/main.scpt')], { encoding: 'utf8' });
    expect(source).toContain(`quoted form of "${node}" & " " & quoted form of "${join(REPO_ROOT, 'src/launcher/main.ts')}"`);

    const before = await tree(rig.home);
    const second = await run('scripts/install-launcher.sh', rig);

    expect(second).toEqual(['pnpm install --frozen-lockfile', 'pnpm build', `launchctl print ${service}`]);
    expect(await tree(rig.home)).toStrictEqual(before);
    expect(before.files.filter((file) => file.startsWith('Library/LaunchAgents'))).toEqual([]);
  });

  it('removes the job, the applet, the definition and an old login agent on uninstall, and keeps the logs', async ({ onTestFinished }) => {
    const rig = await fakeRig(onTestFinished, 'install-launcher');
    await run('scripts/install-launcher.sh', rig);
    const log = serverErrorLogPath(rig.home);
    await writeFile(log, 'an error\n');
    await mkdir(dirname(oldAgent(rig.home)), { recursive: true });
    await writeFile(oldAgent(rig.home), 'the old agent');
    await writeFile(rig.loaded, '');

    expect(await run('scripts/uninstall-launcher.sh', rig)).toEqual([`launchctl print ${service}`, `launchctl bootout ${service}`, `launchctl print ${service}`]);
    expect(existsSync(rig.loaded)).toBe(false);
    expect(existsSync(applet(rig.home))).toBe(false);
    expect(existsSync(serverJobPath(rig.home))).toBe(false);
    expect(existsSync(oldAgent(rig.home))).toBe(false);
    expect(readFileSync(log, 'utf8')).toBe('an error\n');

    // Again, with nothing left to remove.
    expect(await run('scripts/uninstall-launcher.sh', rig)).toEqual([`launchctl print ${service}`]);
  });
});

// The applet's quit handler, compiled by the real osacompile and loaded with `load script`, which runs none of its
// handlers by itself, so neither the launcher nor a dialog runs.
describe.skipIf(process.platform !== 'darwin')('the applet', () => {
  const code = (text: string) => Buffer.from(text, 'latin1').readUInt32BE();

  async function compiled(onTestFinished: Parameters<typeof fakeRig>[0]) {
    const rig = await fakeRig(onTestFinished, 'applet');
    const app = join(rig.home, 'Setlist Controller.app');
    execFileSync('/usr/bin/osacompile', ['-s', '-o', app], { input: appletSource({ repoRoot: REPO_ROOT, nodePath: NODE }), stdio: ['pipe', 'pipe', 'pipe'] });
    return { rig, script: join(app, 'Contents/Resources/Scripts/main.scpt') };
  }

  it('asks before it stops the server on a quit Nick asks for, with Keep running the default, and stops only on Stop', async ({ onTestFinished }) => {
    const { script } = await compiled(onTestFinished);
    const source = execFileSync('/usr/bin/osadecompile', [script], { encoding: 'utf8' });
    const dialog = /display dialog "Stop the setlist server\?".*buttons \{(.*)\} default button "(.*)"\)/.exec(source);

    expect(dialog?.[1]?.split(', ').sort()).toEqual([`"${KEEP_RUNNING_BUTTON}"`, `"${STOP_BUTTON}"`].sort());
    expect(dialog?.[2]).toBe(KEEP_RUNNING_BUTTON);
    expect(source).toContain(`if choice is "${STOP_BUTTON}" then`);
  });

  // macOS gives the quit event a reason when it quits the applet to end the session. A real logout is Nick's hand check
  // on the stage MacBook; this builds the event the way the forum thread the applet cites reads it.
  it('tells a logout, a restart and a shut down from a quit Nick asks for', async ({ onTestFinished }) => {
    const { rig, script } = await compiled(onTestFinished);
    const probe = join(rig.home, 'probe.applescript');
    await writeFile(
      probe,
      `use AppleScript version "2.4"
use framework "Foundation"
use scripting additions
on run argv
	set applet to load script ((item 1 of argv) as POSIX file)
	set answers to {}
	repeat with reason in {${['rlgo', 'rest', 'shut', 'appl'].map(code).join(', ')}, missing value}
		set quitEvent to current application's NSAppleEventDescriptor's appleEventWithEventClass:${code('aevt')} eventID:${code('quit')} targetDescriptor:(missing value) returnID:-1 transactionID:0
		if contents of reason is not missing value then quitEvent's setAttributeDescriptor:(current application's NSAppleEventDescriptor's descriptorWithTypeCode:(contents of reason)) forKeyword:${code('why?')}
		set end of answers to applet's endsSession(quitEvent)
	end repeat
	set end of answers to applet's endsSession(missing value)
	return answers
end run
`,
    );

    const answers = execFileSync('/usr/bin/osascript', [probe, script], { encoding: 'utf8' }).trim();

    // A logout, a restart, a shut down; then a quit with another reason, one with none, and no event at all.
    expect(answers).toBe('true, true, true, false, false, false');
  });
});
