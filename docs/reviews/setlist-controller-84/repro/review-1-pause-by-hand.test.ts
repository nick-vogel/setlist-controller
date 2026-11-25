import { mkdirSync, rmSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import type { Cue } from '../src/server/cues.ts';
import { proPresenterKind } from '../src/server/propresenter.ts';
import type { Target } from '../src/server/target.ts';
import type { SetList } from '../src/shared/snapshot.ts';

// setlist-controller#84 pre-PR review 1: the pause by hand and the status stream, driven straight
// against the adapter with a small HTTP ProPresenter of two made-up presentations. Copy this file
// into test/ and run `pnpm exec vitest run test/review-1-pause-by-hand.test.ts`.

const PRESENTATIONS: Record<string, unknown> = {
  A: {
    presentation: {
      id: { uuid: 'A', name: 'Song A' },
      is_authorized: true,
      groups: [
        { name: 'Verse 1', slides: [{ text: 'a1' }, { text: 'a2' }] },
        { name: 'Chorus', slides: [{ text: 'c1' }, { text: 'c2' }] },
        { name: 'Tag', slides: [{ text: 't1' }] },
        { name: 'End', slides: [{ text: 'e1' }] },
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
  const server = createServer((request, response) => {
    const path = request.url ?? '';
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
        path.includes('/trigger') ? triggerDelay : 0,
      );
    if (path === '/version') return send(200, { name: 'ProPresenter-Mac' });
    if (path === '/v1/playlists') return send(200, [{ id: { uuid: 'P', name: 'Playlist' }, field_type: 'playlist' }]);
    if (path === '/v1/playlist/P') return send(200, { items: ['A', 'B'].map((uuid) => ({ type: 'presentation', presentation_info: { presentation_uuid: uuid } })) });
    const presentation = /^\/v1\/presentation\/([AB])$/.exec(path)?.[1];
    if (presentation) return send(200, PRESENTATIONS[presentation]);
    if (path.includes('/trigger') || path.includes('/clear/')) return send(204);
    send(404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as { port: number };
  const folder = join(import.meta.dirname, '..', 'dist', 'review-1-pause-by-hand');
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
    problem: () => {},
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
    delayTriggers: (ms: number) => (triggerDelay = ms),
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

it('finding 1: a song End trigger and the next song first trigger in one move, with the second frame cold, never pause', async () => {
  rig = await startRig('f1');
  rig.delayTriggers(300);
  rig.target.cue(cue(1, 'Song A', 'end', 'End'));
  rig.target.cue(cue(2, 'Song B', 0, 'Verse 1'));
  await sleep(100);
  await rig.slide('e1');
  await sleep(400);
  rig.clock.advance(1500);
  await rig.slide('b1', 'b2');
  expect(rig.hands()).toBe(0);
});

it('finding 1 control: the next song first trigger alone, its frame as cold, never pauses', async () => {
  rig = await startRig('f1c');
  rig.delayTriggers(300);
  rig.target.cue(cue(2, 'Song B', 0, 'Verse 1'));
  await sleep(500);
  rig.clock.advance(1500);
  await rig.slide('b1', 'b2');
  expect(rig.hands()).toBe(0);
});

it('finding 2: a request sent before a drop that times out after the reconnect leaves ProPresenter online with its stream', async () => {
  rig = await startRig('f2', 1000);
  rig.delayTriggers(5000);
  rig.target.cue(cue(1, 'Song A', 0, 'Verse 1'));
  await sleep(50);
  rig.drop();
  await sleep(100);
  rig.clock.advance(2000);
  await sleep(300);
  expect(rig.statuses.at(-1)).toBe('online');
  expect(rig.streams()).toBe(1);
  await sleep(1000);
  expect(rig.statuses.at(-1)).toBe('online');
  expect(rig.streams()).toBe(1);
});

it('finding 4: the first Next slide after a reconnect, its frame cold into the next group, never pauses', async () => {
  rig = await startRig('f4a');
  rig.target.cue(cue(1, 'Song A', 0, 'Verse 1'));
  await sleep(100);
  await rig.slide('a1', 'a2');
  rig.clock.advance(2000);
  await rig.slide('a2', 'c1');
  rig.drop();
  await sleep(100);
  rig.clock.advance(2000);
  await sleep(200);
  expect(rig.streams()).toBe(1);
  rig.clock.advance(3000);
  await rig.target.runButton('next');
  rig.clock.advance(1100);
  await rig.slide('c1', 'c2');
  expect(rig.hands()).toBe(0);
});

it('finding 4 control: the same Next slide with no reconnect never pauses', async () => {
  rig = await startRig('f4c');
  rig.target.cue(cue(1, 'Song A', 0, 'Verse 1'));
  await sleep(100);
  await rig.slide('a1', 'a2');
  rig.clock.advance(2000);
  await rig.slide('a2', 'c1');
  rig.clock.advance(3000);
  await rig.target.runButton('next');
  rig.clock.advance(1100);
  await rig.slide('c1', 'c2');
  expect(rig.hands()).toBe(0);
});

it('finding 4: a Next slide after a trigger that brought no frame, its frame cold into the next group, never pauses', async () => {
  rig = await startRig('f4b');
  rig.target.cue(cue(1, 'Song A', 0, 'Verse 1'));
  await sleep(100);
  await rig.slide('a1', 'a2');
  rig.clock.advance(3000);
  rig.target.cue(cue(1, 'Song A', 2, 'Tag'));
  await sleep(100);
  rig.clock.advance(3000);
  await rig.target.runButton('next');
  rig.clock.advance(1100);
  await rig.slide('e1');
  expect(rig.hands()).toBe(0);
});
