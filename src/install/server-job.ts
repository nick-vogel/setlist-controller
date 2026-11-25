import { isAbsolute, join } from 'node:path';

// The launchd job that keeps the server running on the stage MacBook while the Setlist Controller app is open. The
// install script writes this definition to serverJobPath, in the app support folder and not in ~/Library/LaunchAgents,
// so login never loads it: the launcher's start loads it with `launchctl bootstrap`, and its stop removes it by the label.
export const SERVER_JOB_LABEL = 'com.nlvogel.setlist-controller';

export function serverJobPath(home: string): string {
  return join(home, 'Library/Application Support/setlist-controller', `${SERVER_JOB_LABEL}.plist`);
}

// The server's log folder, where the job writes its output and the launcher reads the error log after a failed start.
function logFolder(home: string): string {
  return join(home, 'Library/Logs/setlist-controller');
}

export function serverErrorLogPath(home: string): string {
  return join(logFolder(home), 'server.error.log');
}

export type ServerJob = {
  Label: string;
  ProgramArguments: string[];
  WorkingDirectory: string;
  RunAtLoad: boolean;
  KeepAlive: boolean;
  ThrottleInterval: number;
  StandardOutPath: string;
  StandardErrorPath: string;
};

export type ServerJobOptions = {
  // The repository's absolute path on the stage MacBook.
  repoRoot: string;
  // The node binary's absolute path, captured at install time, since launchd gives the job no shell PATH.
  nodePath: string;
  // The operator's home folder, for the log folder.
  home: string;
};

export function serverJob({ repoRoot, nodePath, home }: ServerJobOptions): ServerJob {
  if (!isAbsolute(nodePath)) throw new Error(`The node path must be absolute, since launchd has no PATH: ${nodePath}`);
  return {
    Label: SERVER_JOB_LABEL,
    // Node 24 runs the TypeScript entry directly, as `pnpm start` does.
    ProgramArguments: [nodePath, join(repoRoot, 'src/server/main.ts')],
    WorkingDirectory: repoRoot,
    // Starts the server when the launcher's start loads the job.
    RunAtLoad: true,
    // Starts it again whenever it exits while the job is loaded, a crash included.
    KeepAlive: true,
    // launchd spawns a job at most once every 10 seconds by default; a crash should cost about a second.
    ThrottleInterval: 1,
    StandardOutPath: join(logFolder(home), 'server.log'),
    StandardErrorPath: serverErrorLogPath(home),
  };
}
