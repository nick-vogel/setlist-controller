import { spawn } from 'node:child_process';
import { expect, it, onTestFinished } from 'vitest';

// pre-PR review 7, finding 2: a real restart of the socket process that fails outright logs two
// error lines, not one, because the client's destroy of the lost Atem always rejects against the
// installed library ("Child instance ... is not initialized"), before it reaches any clean-up.
const CHILD = `
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const wrapper = process.argv[1];
const { atemSwitcher } = await import(wrapper);
const index = createRequire(wrapper).resolve('atem-connection');
const threadedclass = createRequire(index).resolve('threadedclass');
const { ThreadedClassManagerInternal: internal } = createRequire(threadedclass)(join(dirname(threadedclass), 'parent-process', 'manager.js'));
const say = (line) => console.log(JSON.stringify(line));
const errors = [];
console.error = (first) => errors.push(String(first));

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
await gaveUp;
await new Promise((resolve) => setTimeout(resolve, 500));
say({ errors: errors.filter((line) => line.startsWith('Setlist server:')) });
process.exit(0);
`;

it('logs one line for a restart of the socket process that fails outright', async () => {
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
    .map((line) => JSON.parse(line) as unknown);
  expect({ code, lines }).toEqual({ code: 0, lines: [{ errors: ["Setlist server: the ATEM's socket process could not restart"] }] });
}, 20_000);
