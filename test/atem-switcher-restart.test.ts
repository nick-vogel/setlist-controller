import { spawn } from 'node:child_process';
import { expect, it, onTestFinished } from 'vitest';

// The real switcher client over the installed library, with a real restart of its socket process
// that fails outright, through the library's own copy of threadedclass. A child Node process, since
// the library's exit-hook and its worker act on the whole process. It connects to 127.0.0.1 only,
// where no ATEM listens.
//
// The child makes the init of the restarted socket process fail, once, then ends the worker the
// socket process runs on, as a crash does: threadedclass restarts it, the init fails, and with its
// one restart spent it emits the error on the socket process and kills it. A re-pin that moves the
// socket process, renames the path the client reaches it by, or gives the library a second copy of
// threadedclass, fails this test.

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
say({ threads: children.length });

const sendInit = internal.sendInit;
internal.sendInit = function (child, instance, config, cb) {
  internal.sendInit = sendInit;
  cb(instance, new Error('init refused'));
};
children[0].process.kill();
say({ gaveUp: await gaveUp });

await client.connect('127.0.0.1');
say({ threads: Object.values(internal._children).filter((child) => child.alive).length, connected: true });
await client.close();
say({ closed: true });
`;

it('gives up with the reason when the socket process cannot restart, then connects again on a fresh socket process, and closes', async () => {
  const wrapper = new URL('../src/server/atem-switcher.ts', import.meta.url).pathname;
  const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD, wrapper], { stdio: ['ignore', 'pipe', 'inherit'] });
  // A child that never exits, as when close leaves the socket process running, is ended with the test.
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
  expect({ code, lines }).toEqual({ code: 0, lines: [{ threads: 1 }, { gaveUp: 'init refused' }, { threads: 1, connected: true }, { closed: true }] });
}, 20_000);

const LOST = `
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
say({ gaveUp: await gaveUp });
await new Promise((resolve) => setTimeout(resolve, 500));
say({ errors: errors.filter((line) => line.startsWith('Setlist server:')) });
try {
  await client.close();
  say({ closed: 'resolved' });
} catch (error) {
  say({ closed: 'rejected', reason: String(error).slice(0, 80) });
}
process.exit(0);
`;

it('logs a failed restart of the socket process once, and closes at once while it is lost, before the next connect', async () => {
  const wrapper = new URL('../src/server/atem-switcher.ts', import.meta.url).pathname;
  const child = spawn(process.execPath, ['--input-type=module', '-e', LOST, wrapper], { stdio: ['ignore', 'pipe', 'inherit'] });
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
  expect({ code, lines }).toEqual({ code: 0, lines: [{ gaveUp: 'init refused' }, { errors: ["Setlist server: the ATEM's socket process could not restart"] }, { closed: 'resolved' }] });
}, 20_000);

// A crash the library heals: a datagram of one byte makes the socket process's packet parser throw,
// as a port scan or a truncated packet on the church network can, so the worker it runs on dies with
// an error. threadedclass emits that error on the socket process, then restarts it, and the library
// reconnects by itself. The child sends it twice, once on each socket process, to a fake ATEM on a
// port the OS assigns that only hears the hellos. The client must not give up, and close() must
// leave no socket process running.
const HEALED = `
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import dgram from 'node:dgram';
const wrapper = process.argv[1];
const { atemSwitcher } = await import(wrapper);
const index = createRequire(wrapper).resolve('atem-connection');
const { Atem } = createRequire(wrapper)('atem-connection');
const threadedclass = createRequire(index).resolve('threadedclass');
const { ThreadedClassManagerInternal: internal, ThreadedClassManager: manager } = createRequire(threadedclass)(join(dirname(threadedclass), 'parent-process', 'manager.js'));
const say = (line) => console.log(JSON.stringify(line));
console.error = () => {};
const alive = () => Object.values(internal._children).filter((child) => child.alive).length;

const atem = dgram.createSocket('udp4');
await new Promise((resolve) => atem.bind(0, '127.0.0.1', resolve));
const { port } = atem.address();
const hello = (except) => new Promise((resolve) => {
  const heard = (_message, from) => {
    if (from.port === except) return;
    atem.off('message', heard);
    resolve(from.port);
  };
  atem.on('message', heard);
});

const client = atemSwitcher(() => {
  const made = new Atem();
  const connect = made.connect.bind(made);
  made.connect = (host) => connect(host, port);
  return made;
});
let gaveUp = null;
client.onGaveUp((reason) => (gaveUp = reason));
let from = hello();
await client.connect('127.0.0.1');
from = await from;
const [child] = Object.values(internal._children);
const proxy = Object.values(child.instances)[0].proxy;

for (const crash of [1, 2]) {
  const restarted = new Promise((resolve) => manager.onEvent(proxy, 'restarted', resolve));
  const next = hello(from);
  atem.send(Buffer.alloc(1), from, '127.0.0.1');
  await restarted;
  from = await next;
  say({ crash, gaveUp, threads: alive() });
}

await client.close();
say({ closed: true, threads: alive() });
atem.close();
`;

it('does not give up on a crash of the socket process that threadedclass heals, and closes the one socket process', async () => {
  const wrapper = new URL('../src/server/atem-switcher.ts', import.meta.url).pathname;
  const child = spawn(process.execPath, ['--input-type=module', '-e', HEALED, wrapper], { stdio: ['ignore', 'pipe', 'inherit'] });
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
  expect({ code, lines }).toEqual({
    code: 0,
    lines: [
      { crash: 1, gaveUp: null, threads: 1 },
      { crash: 2, gaveUp: null, threads: 1 },
      { closed: true, threads: 0 },
    ],
  });
}, 20_000);
