import { spawn } from 'node:child_process';
import { expect, it, onTestFinished } from 'vitest';

// pre-PR review 7, finding 1: close() while the client holds a lost Atem (after a restart of its
// socket process failed outright, before the adapter's next connect builds a fresh one) rejects,
// because it destroys the lost Atem a second time on a killed socket process. The adapter's stop
// returns that promise, so connections.stop and the server's close reject with it.
const CHILD = `
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const wrapper = process.argv[1];
const { atemSwitcher } = await import(wrapper);
const index = createRequire(wrapper).resolve('atem-connection');
const threadedclass = createRequire(index).resolve('threadedclass');
const { ThreadedClassManagerInternal: internal } = createRequire(threadedclass)(join(dirname(threadedclass), 'parent-process', 'manager.js'));
const say = (line) => console.log(JSON.stringify(line));
console.error = () => {};

const client = atemSwitcher();
const gaveUp = new Promise((resolve) => client.onGaveUp(resolve));
await client.connect('127.0.0.1');
const children = Object.values(internal._children);
const sendInit = internal.sendInit;
internal.sendInit = function (child, instance, config, cb) {
  internal.sendInit = sendInit;
  cb(instance, new Error('init refused'));
};
children[0].process.kill();
say({ gaveUp: await gaveUp });
await new Promise((resolve) => setTimeout(resolve, 100));
try {
  await client.close();
  say({ closed: 'resolved' });
} catch (error) {
  say({ closed: 'rejected', reason: String(error).slice(0, 80) });
}
process.exit(0);
`;

it('close() while the Atem is lost resolves, so the server shuts down in full', async () => {
  const wrapper = new URL('../src/server/atem-switcher.ts', import.meta.url).pathname;
  const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD, wrapper], { stdio: ['ignore', 'pipe', 'inherit'] });
  onTestFinished(() => void child.kill('SIGKILL'));
  let out = '';
  child.stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
  });
  const code = await new Promise<number | null>((resolve) => child.on('exit', (exitCode) => resolve(exitCode)));
  const lines = out
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as { closed?: string });
  expect({ code, closed: lines.find((line) => line.closed)?.closed, lines }).toMatchObject({ code: 0, closed: 'resolved' });
}, 20_000);
