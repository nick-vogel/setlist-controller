import { mkdirSync, rmSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import type { Cue } from '../src/server/cues.ts';
import { proPresenterKind } from '../src/server/propresenter.ts';
import type { Target } from '../src/server/target.ts';
import type { SetList } from '../src/shared/snapshot.ts';

// setlist-controller#84 pre-PR review 2: the rig of test/propresenter-adapter.test.ts, with a delay
// and a status per request path and the problem lines recorded. Each test passes at 5fc7f89 and goes
// red when one branch of the review 1 remediation is removed (see the review doc, findings 1 and 2).
// Copy into test/ to run: pnpm exec vitest run test/review-2-remediation-branches.test.ts

const PRESENTATIONS: Record<string, unknown> = {
  A: {
    presentation: {
      id: { uuid: 'A', name: 'Song A' },
      is_authorized: true,
      groups: [
        { name: 'Verse 1', slides: [{ text: 'a1' }, { text: 'a2' }] },
        { name: 'Chorus', slides: [{ text: 'c1' }, { text: 'c2' }] },
        { name: 'Tag', slides: [{ text: 't1' }] },
        { name: 'End', slides: [{ text: 'e1' }, { text: 'e2' }] },
      ],
    },
  },
  B: { presentation: { id: { uuid: 'B', name: 'Song B' }, is_authorized: true, groups: [{ name: 'Verse 1', slides: [{ text: 'b1' }, { text: 'b2' }] }] } },
};

const SET: SetList = {
  warnings: [],
  songs: [
    { number: 1, title: 'Song A', sections: [{ name: 'Verse 1', time: 0, end: 16, cue: 0 }, { name: 'Chorus', time: 16, end: 32, cue: 1 }, { name: 'Tag', time: 32, end: 40, cue: 2 }], end: 40, endCue: 3 },
    { number: 2, title: 'Song B', sections: [{ name: 'Verse 1', time: 0, end: 16, cue: 4 }], end: 16, endCue: 5 },
  ],
};

const cue = (song: number, title: string, section: number | 'end', name: string): Cue => ({ song, title, section, name, cause: 'played-into' });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Rig = Awaited<ReturnType<typeof startRig>>;
let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  vi.restoreAllMocks();
});

async function startRig(label: string, requestTimeoutMs = 15_000) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const streams = new Set<ServerResponse>();
  let triggerDelay = 0;
  let presentationDelay = 0;
  let delayFor: (path: string) => number | undefined = () => undefined;
  let statusFor: (path: string) => number | undefined = () => undefined;
  const problems: (string | null)[] = [];
  const triggers: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? '';
    if (path.includes('/group/')) triggers.push(path);
    if (request.method === 'POST') {
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.flushHeaders();
        streams.add(response);
        response.on('close', () => streams.delete(response));
      });
      return;
    }
    const send = (status: number, body?: unknown) =>
      setTimeout(
        () => (body === undefined ? response.writeHead(status).end() : response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))),
        delayFor(path) ?? (path.includes('/trigger') ? triggerDelay : /^\/v1\/presentation\/[AB]$/.test(path) ? presentationDelay : 0),
      );
    if (path === '/version') return send(200, { name: 'ProPresenter-Mac' });
    if (path === '/v1/playlists') return send(200, [{ id: { uuid: 'P', name: 'Playlist' }, field_type: 'playlist' }]);
    if (path === '/v1/playlist/P') return send(200, { items: ['A', 'B'].map((uuid) => ({ type: 'presentation', presentation_info: { presentation_uuid: uuid } })) });
    const presentation = /^\/v1\/presentation\/([AB])$/.exec(path)?.[1];
    if (presentation) return send(200, PRESENTATIONS[presentation]);
    if (path.includes('/trigger') || path.includes('/clear/')) return send(statusFor(path) ?? 204);
    send(404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as { port: number };
  const folder = join(import.meta.dirname, '..', 'dist', 'propresenter-adapter');
  mkdirSync(folder, { recursive: true });
  const statePath = join(folder, `${label}.json`);
  rmSync(statePath, { force: true });
  const clock = manualClock();
  const made = proPresenterKind({ statePath, clock, requestTimeoutMs }).create({ host: '127.0.0.1', port });
  if (!('target' in made)) throw new Error('no target');
  const target: Target = made.target;
  const statuses: string[] = [];
  let hands = 0;
  await target.start({
    status: (status) => statuses.push(status),
    changedByHand: () => (hands += 1),
    state: () => {},
    actedOn: () => {},
    problem: (p) => problems.push(p),
    pick: () => {},
  });
  await sleep(150);
  await target.check(SET);
  await target.pick?.('P', SET);
  await target.check(SET);
  await sleep(100);
  const slide = async (current: string | null, next: string | null = null) => {
    const frame = { url: 'status/slide', data: { current: current === null ? null : { text: current }, next: next === null ? null : { text: next } } };
    for (const stream of streams) stream.write(`${JSON.stringify(frame)}\r\n\r\n`);
    await sleep(60);
  };
  return {
    target,
    clock,
    statuses,
    hands: () => hands,
    slide,
    streams: () => streams.size,
    triggers: () => [...triggers],
    delayTriggers: (ms: number) => (triggerDelay = ms),
    setDelayFor: (f: (path: string) => number | undefined) => (delayFor = f),
    setStatusFor: (f: (path: string) => number | undefined) => (statusFor = f),
    problems,
    delayPresentations: (ms: number) => (presentationDelay = ms),
    drop: () => {
      for (const stream of streams) stream.socket?.destroy();
      streams.clear();
    },
    close: async () => {
      await target.stop();
      server.closeAllConnections();
      server.close();
    },
  };
}

it('finding 1a: End answers fast and the next song cold; the End frame after the End answer, before the second answer, never pauses', async () => {
  rig = await startRig('review-2-identity');
  rig.setDelayFor((path) => (path.includes('/group/End/') ? 50 : path.includes('/group/') ? 700 : undefined));
  rig.target.cue(cue(1, 'Song A', 'end', 'End'));
  rig.target.cue(cue(2, 'Song B', 0, 'Verse 1'));
  await sleep(200);
  await rig.slide('e1', 'e2');
  await sleep(800);
  rig.clock.advance(1500);
  await rig.slide('b1', 'b2');
  expect(rig.hands()).toBe(0);
});

it('finding 1b: a Next slide press while a trigger is out, its frame moves the expected slides', async () => {
  rig = await startRig('review-2-button');
  await rig.slide('a1', 'a2');
  rig.clock.advance(5000);
  const before = rig.hands();
  rig.setDelayFor((path) => (path.includes('/group/') ? 700 : path.includes('/next/') ? 50 : undefined));
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  const pressed = rig.target.runButton!('next');
  await sleep(150);
  await rig.slide('a2', null);
  await pressed;
  await sleep(800);
  rig.clock.advance(5000);
  await rig.slide('a1', 'a2');
  expect(rig.hands()).toBe(before);
});

it('finding 2: a stream drop with a trigger out goes offline once, and the problem names the drop, not the abort', async () => {
  rig = await startRig('review-2-abort', 1000);
  rig.delayTriggers(5000);
  rig.target.cue(cue(1, 'Song A', 0, 'Verse 1'));
  await sleep(50);
  rig.drop();
  await sleep(200);
  expect(rig.problems.at(-1)).toContain('the status stream dropped.');
  expect(rig.statuses.filter((status) => status === 'offline')).toHaveLength(1);
});
