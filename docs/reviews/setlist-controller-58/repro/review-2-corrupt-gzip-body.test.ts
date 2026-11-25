import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { readPlan } from '../src/set-builder/plan-reader.ts';

// Repro for docs/reviews/setlist-controller-58/pre-pr-review-2.md, finding 3. Copy into test/ to run. It fails at the
// review's HEAD: a whole answer whose gzip body cannot be inflated reads as "Cannot reach Planning Center" with the
// offline advice, though the connection held. The control keeps a body the connection drops on the connection line.

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

async function serve(handle: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handle);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const read = (apiBase: string) =>
  readPlan({ apiBase, authorization: 'Basic x', tokenFile: '/tmp/none', timeoutMs: 5000, serviceType: 'Service', date: '2026-11-01' });

it('reads a whole answer whose gzip body cannot be inflated as an answer that cannot be read', async () => {
  const apiBase = await serve((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
    response.end('not gzip');
  });

  expect(await read(apiBase)).toEqual({ ok: false, problems: ['Planning Center sent an answer to /service_types that cannot be read.'] });
});

it('keeps a body the connection drops partway through on the connection line', async () => {
  const apiBase = await serve((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json', 'content-length': '10000' });
    response.write('{"data":[');
    setTimeout(() => request.socket.destroy(), 20);
  });

  const reading = await read(apiBase);

  expect(reading.ok).toBe(false);
  expect(reading.ok ? [] : reading.problems).toEqual([`Cannot reach Planning Center at ${apiBase}. Build the set while this Mac is on the internet, before it joins the stage network.`]);
});
