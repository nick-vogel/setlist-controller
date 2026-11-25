import { spawn } from 'node:child_process';
import { expect, it } from 'vitest';

// A child Node process, since the library's exit-hook acts on the whole process. It connects to
// 127.0.0.1 only, where no ATEM listens.

const CHILD = `
const { atemSwitcher } = await import(process.argv[1]);
const client = atemSwitcher();
await client.connect('127.0.0.1');
process.once('SIGTERM', () => {
  setTimeout(() => {
    console.log('closed');
    process.exit(0);
  }, 50);
});
console.log('ready');
`;

it("lets the server's own SIGTERM handler finish its close once the ATEM has connected", async () => {
  const wrapper = new URL('../src/server/atem-switcher.ts', import.meta.url).pathname;
  const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD, wrapper], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  let signalled = false;
  child.stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
    if (signalled || !out.includes('ready')) return;
    signalled = true;
    child.kill('SIGTERM');
  });
  const code = await new Promise<number | null>((resolve) => child.on('exit', (exitCode) => resolve(exitCode)));
  expect({ code, closed: out.includes('closed') }).toEqual({ code: 0, closed: true });
}, 20_000);
