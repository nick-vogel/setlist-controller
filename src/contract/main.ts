import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { startFakeLive } from '../fake-live/fake-live.ts';
import { differences, header, readComparisonFile, Unreadable } from './compare.ts';
import { toComparisonFile, toReport } from './report.ts';
import { PortInUse, runContractCheck, type RunRecord } from './run.ts';
import { TEST_SET, TEST_SET_LOOP, TEST_SET_SIGNATURE, TEST_SET_TEMPO, TEST_SET_TRACKS } from './test-set.ts';

// The fake Live contract check, run by hand. It is not part of pnpm test or CI; docs/install.md says
// when and how to run it.

const USAGE = `Usage:
  node src/contract/main.ts run --target fake --out <path>
  node src/contract/main.ts run --target live --out <path> [--host 127.0.0.1] [--port 11000] [--reply-port 11001]
  node src/contract/main.ts compare <a.json> <b.json>

run writes <path>.md, the readable report, and <path>.json, the comparison file.
compare exits 0 for no differences, 1 for differences, and 2 for a file it cannot read.`;

function usage(problem: string): never {
  console.error(`${problem}\n\n${USAGE}`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: 'string' },
      out: { type: 'string' },
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '11000' },
      'reply-port': { type: 'string', default: '11001' },
    },
  });
} catch (error) {
  usage(error instanceof Error ? error.message : String(error));
}
const { values, positionals } = parsed;
const [command, ...rest] = positionals;

if (command === 'run') {
  if (rest.length > 0) usage(`Unexpected argument: ${rest.join(' ')}`);
  if (values.target !== 'fake' && values.target !== 'live') usage('run needs --target fake or --target live.');
  if (!values.out) usage('run needs --out <path>.');
  process.exit(await run(values.target, values.out));
} else if (command === 'compare') {
  if (rest.length !== 2) usage('compare needs two comparison files.');
  process.exit(await compare(rest[0] ?? '', rest[1] ?? ''));
} else {
  usage(command ? `Unknown command: ${command}` : 'Name a command: run or compare.');
}

async function run(kind: 'fake' | 'live', out: string): Promise<number> {
  const interrupted = new AbortController();
  process.once('SIGINT', () => interrupted.abort());
  const signal = interrupted.signal;
  let record: RunRecord;
  if (kind === 'fake') {
    // The fake Live runs in-process on a port the OS picks, with the test set, and replies to the port
    // a message came from, so this run never touches 11000 or 11001.
    const live = await startFakeLive({
      cuePoints: TEST_SET,
      tempo: TEST_SET_TEMPO,
      signature: TEST_SET_SIGNATURE,
      loop: { on: false, ...TEST_SET_LOOP },
      tracks: TEST_SET_TRACKS,
      clock: 'realtime',
      port: 0,
    });
    try {
      record = await runContractCheck({ target: { kind, host: '127.0.0.1', port: live.port, replyPort: 0 }, bindHost: '127.0.0.1', signal });
    } finally {
      await live.close();
    }
  } else {
    const port = toPort(values.port, '--port');
    const replyPort = toPort(values['reply-port'], '--reply-port');
    const host = values.host;
    // AbletonOSC replies to the sender's host on the reply port.
    const bindHost = host === '127.0.0.1' || host === 'localhost' ? '127.0.0.1' : '0.0.0.0';
    console.log(`Running against AbletonOSC at ${host}:${port}. Live plays the test set for about half a minute.`);
    try {
      record = await runContractCheck({ target: { kind, host, port, replyPort }, bindHost, signal });
    } catch (error) {
      if (error instanceof PortInUse) {
        console.error(`Port ${replyPort} is in use. Stop the setlist server first (docs/install.md).`);
        return 1;
      }
      throw error;
    }
  }

  const path = signal.aborted ? `${out}.interrupted` : out;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.json`, `${JSON.stringify(toComparisonFile(record), null, 2)}\n`);
  await writeFile(`${path}.md`, toReport(record));
  console.log(`Wrote ${path}.md`);
  console.log(`Wrote ${path}.json`);
  for (const warning of record.warnings) console.warn(`Warning: ${warning}`);
  if (record.aborted) {
    console.error(`The run stopped early. ${record.aborted}`);
    return signal.aborted ? 130 : 1;
  }
  return 0;
}

async function compare(pathA: string, pathB: string): Promise<number> {
  try {
    const [a, b] = await Promise.all([readComparisonFile(pathA), readComparisonFile(pathB)]);
    console.log(header('A', pathA, a));
    console.log(header('B', pathB, b));
    const lines = differences(a, b);
    if (lines.length === 0) {
      console.log('No differences');
      return 0;
    }
    console.log(`${lines.length} difference${lines.length === 1 ? '' : 's'}, as <step> / <observation>: <A> | <B>`);
    for (const line of lines) console.log(line);
    return 1;
  } catch (error) {
    if (error instanceof Unreadable) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }
}

function toPort(value: string, flag: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) usage(`${flag} must be a port number.`);
  return port;
}
