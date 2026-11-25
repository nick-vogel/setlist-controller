import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { SERVER_JOB_LABEL, serverErrorLogPath, serverJobPath } from '../install/server-job.ts';

// The command the Setlist Controller app runs: `start` when it opens and `stop` when Nick quits it and picks Stop. It
// owns the server's life on the stage MacBook through the launchd job, so launchd still restarts a crash while the job
// is loaded, and nothing starts the server again once `stop` removes the job. The app shows what this prints on
// stderr in a dialog when it exits non-zero.

const USAGE = `Usage: node src/launcher/main.ts start|stop [--address <url>]

start  Opens the setup screen. When the page does not answer, it loads the server's launchd job from
       ~/Library/Application Support/setlist-controller and waits for the page first, up to 15 seconds in all.
stop   Removes the server's launchd job, which stops the server until the next start.

--address  The page start checks and opens, the setup screen at http://localhost:8080/setup by default.`;

// The bound #285 sets on a start, from the moment the command runs: a server that has not answered by then is a failed
// start, a hang like #100 among them.
const WAIT_MS = 15_000;
// How long one check of the page may take, so a server that holds the request open cannot stretch the wait.
const CHECK_MS = 1_000;
const RETRY_MS = 250;
const LOG_LINES = 10;
// How long stop waits for a job that bootout failed on to finish unloading, as the install scripts wait.
const UNLOAD_WAIT_MS = 5_000;

const began = Date.now();

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { address: { type: 'string', default: 'http://localhost:8080/setup' } } });
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
  process.exit(2);
}
const [subcommand, ...extra] = parsed.positionals;
const address = parsed.values.address;
const home = homedir();
const domain = `gui/${process.getuid?.() ?? 0}`;
const service = `${domain}/${SERVER_JOB_LABEL}`;

class LauncherError extends Error {}

// launchctl and open are found on PATH: an applet's shell has a PATH that still holds /bin and /usr/bin, where both
// live. A command that cannot run at all stops the launcher, since its exit code would say nothing.
function run(command: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => fail(new LauncherError(`Could not run ${command}: ${error.message}`)));
    child.on('close', (code) => done({ code, stderr: stderr.trim() }));
  });
}

const loaded = async () => (await run('launchctl', ['print', service])).code === 0;
const pause = (ms: number) => new Promise((wait) => setTimeout(wait, Math.max(0, ms)));

// Whether the page answers. The server has no health route, so a successful answer from the page is the check.
async function answers(timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(address, { signal: AbortSignal.timeout(timeoutMs) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

async function open(): Promise<void> {
  const opened = await run('open', [address]);
  if (opened.code !== 0) throw new LauncherError(`Could not open ${address}: ${opened.stderr}`);
}

async function logTail(path: string): Promise<string> {
  try {
    const lines = (await readFile(path, 'utf8')).trimEnd().split('\n');
    return `The last lines of ${path}:\n${lines.slice(-LOG_LINES).join('\n')}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return `No error log at ${path}.`;
    return `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function start(): Promise<void> {
  const deadline = began + WAIT_MS;
  if (await answers(CHECK_MS)) return open();
  // A loaded job is already starting the server, or restarting it after a crash, so it is only waited for.
  if (!(await loaded())) {
    const bootstrapped = await run('launchctl', ['bootstrap', domain, serverJobPath(home)]);
    if (bootstrapped.code !== 0) throw new LauncherError(`Could not load the setlist server's job from ${serverJobPath(home)}: ${bootstrapped.stderr}`);
  }
  while (deadline - Date.now() > 0) {
    if (await answers(Math.min(CHECK_MS, deadline - Date.now()))) return open();
    await pause(Math.min(RETRY_MS, deadline - Date.now()));
  }
  throw new LauncherError(`The setlist server did not answer at ${address} within ${WAIT_MS / 1000} seconds.\n${await logTail(serverErrorLogPath(home))}`);
}

async function stop(): Promise<void> {
  const removed = await run('launchctl', ['bootout', service]);
  if (removed.code === 0) return;
  // bootout fails for a job that is not loaded, and for one that is still unloading. Either way the server is stopped
  // once the job is gone.
  const deadline = Date.now() + UNLOAD_WAIT_MS;
  for (;;) {
    if (!(await loaded())) return;
    if (Date.now() >= deadline) throw new LauncherError(`Could not stop the setlist server: ${removed.stderr}`);
    await pause(RETRY_MS);
  }
}

const subcommands = new Map([['start', start], ['stop', stop]]);
const chosen = extra.length > 0 ? undefined : subcommands.get(subcommand ?? '');
if (chosen === undefined) {
  console.error(USAGE);
  process.exit(2);
}
try {
  await chosen();
  process.exit(0);
} catch (error) {
  if (!(error instanceof LauncherError)) throw error;
  console.error(error.message);
  process.exit(1);
}
