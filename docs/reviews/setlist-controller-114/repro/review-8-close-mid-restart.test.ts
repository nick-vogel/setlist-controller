import { spawn } from 'node:child_process';
import { expect, it, onTestFinished } from 'vitest';

// pre-PR review 8, finding 1: close() while the socket process is down and threadedclass is still
// trying to restart it rejects, even when that restart then fails and nothing is left alive. The
// client marks the Atem lost only when the restart's error arrives, so a close in between destroys
// the Atem, and the destroy rejects on the process that is not running.
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
  setTimeout(() => cb(instance, new Error('init refused')), 300);
};
children[0].process.kill();
await new Promise((resolve) => setTimeout(resolve, 100));
const closed = client.close().then(
  () => ({ closed: 'resolved' }),
  (error) => ({ closed: 'rejected', reason: String(error).slice(0, 80) }),
);
say(await closed);
say({ gaveUp: await gaveUp });
process.exit(0);
`;

it('close() while a restart of the socket process is under way, and then fails, resolves', async () => {
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
    .map((line) => JSON.parse(line) as { closed?: string; gaveUp?: string });
  expect({ code, closed: lines.find((line) => line.closed)?.closed, lines }).toMatchObject({ code: 0, closed: 'resolved', lines: [{}, { gaveUp: 'init refused' }] });
}, 20_000);
