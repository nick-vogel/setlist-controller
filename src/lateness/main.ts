import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_LATENESS_LOG } from '../server/lateness-log.ts';
import { formatSummary, readLines, summarize } from './summary.ts';

// `pnpm lateness`: prints the summary of the lateness log, for deciding the lead time after a
// rehearsal. A thin wrapper over summary.ts, which holds every rule; the command reads the log's
// `.1` file, then the log, and prints. A missing log is one sentence and exit 0, not an error.

const USAGE = `Usage: pnpm lateness [--log <path>]

Reads the lateness log the server writes, ~/Library/Logs/setlist-controller/cue-lateness.log, or the one --log
names, and its rotated <path>.1 first, and prints one block per day in this Mac's time zone, one group per target,
and one row per cause, plus all causes.`;

let parsed;
try {
  parsed = parseArgs({ options: { log: { type: 'string' } } });
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
  process.exit(2);
}
// A relative --log is from the folder the command was run in, which pnpm gives as INIT_CWD.
const from = (process.env.npm_lifecycle_event === 'lateness' && process.env.INIT_CWD) || process.cwd();
const path = parsed.values.log === undefined ? DEFAULT_LATENESS_LOG : resolve(from, parsed.values.log);

// A file's text, or null when it does not exist. Any other failure to read it stops the command.
async function textOf(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    console.error(`Could not read the lateness log at ${file}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const texts = (await Promise.all([textOf(`${path}.1`), textOf(path)])).filter((text) => text !== null);
if (texts.length === 0) {
  console.log(`No lateness log at ${path}.`);
} else {
  const { lines, malformed } = readLines(texts);
  process.stdout.write(formatSummary(summarize(lines, {}), malformed));
}
