// Prints the server's launchd job definition for this checkout as JSON. The install script converts it to a
// property list with `plutil -convert xml1`.
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { serverJob } from './server-job.ts';

const repoRoot = resolve(import.meta.dirname, '../..');

console.log(JSON.stringify(serverJob({ repoRoot, nodePath: process.env.SETLIST_NODE ?? process.execPath, home: homedir() }), null, 2));
