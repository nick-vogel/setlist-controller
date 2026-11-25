import { mkdirSync, rmSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { manualClock } from '../src/server/clock.ts';
import type { Cue } from '../src/server/cues.ts';
import { proPresenterKind } from '../src/server/propresenter.ts';
import type { Target } from '../src/server/target.ts';
import type { SetList } from '../src/shared/snapshot.ts';

// The ProPresenter adapter driven straight, with no server, against a small HTTP ProPresenter of two
// made-up presentations whose triggers it can answer late, so two cues can be out at once
// (setlist-controller#84 pre-PR review 1).

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

// A cue's trigger, the first slide of a group by its index: Song A's Chorus is 2 and its End 5, and
// Song B's Verse 1 is 0.
const INDEX_TRIGGER = /^\/v1\/presentation\/[^/]+\/\d+\/trigger$/;
const isTrigger = (path: string) => INDEX_TRIGGER.test(path);

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
  const triggers: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? '';
    if (isTrigger(path)) triggers.push(path);
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
    const status = statusFor(path);
    if (status !== undefined) return send(status);
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
  const folder = join(import.meta.dirname, '..', 'dist', 'propresenter-adapter');
  mkdirSync(folder, { recursive: true });
  const statePath = join(folder, `${label}.json`);
  rmSync(statePath, { force: true });
  const clock = manualClock();
  const made = proPresenterKind({ statePath, clock, requestTimeoutMs }).create({ host: '127.0.0.1', port });
  if (!('target' in made)) throw new Error('no target');
  const target: Target = made.target;
  const statuses: string[] = [];
  const states: (string[] | null)[] = [];
  let hands = 0;
  await target.start({
    status: (status) => statuses.push(status),
    changedByHand: () => (hands += 1),
    movedOut: () => {},
    state: (lines) => states.push(lines),
    actedOn: () => {},
    missed: () => {},
    problem: () => {},
    pick: () => {},
    fileChanged: () => {},
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
  // A frame whose slides carry a UUID, as the real stream's do.
  const slideWithUuid = async (current: { text: string; uuid: string }, next: { text: string; uuid: string }) => {
    const frame = { url: 'status/slide', data: { current, next } };
    for (const stream of streams) stream.write(`${JSON.stringify(frame)}\r\n\r\n`);
    await sleep(60);
  };
  return {
    target,
    clock,
    statuses,
    states,
    hands: () => hands,
    slide,
    slideWithUuid,
    streams: () => streams.size,
    triggers: () => [...triggers],
    delayTriggers: (ms: number) => (triggerDelay = ms),
    delayPresentations: (ms: number) => (presentationDelay = ms),
    setDelayFor: (f: (path: string) => number | undefined) => (delayFor = f),
    setStatusFor: (f: (path: string) => number | undefined) => (statusFor = f),
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

it("never pauses when a song's End trigger and the next song's first trigger go out in one move, and the second trigger's frame comes late", async () => {
  rig = await startRig('two-triggers');
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

it("never pauses on the next song's first trigger alone, its frame as late", async () => {
  rig = await startRig('one-trigger');
  rig.delayTriggers(300);
  rig.target.cue(cue(2, 'Song B', 0, 'Verse 1'));
  await sleep(500);
  rig.clock.advance(1500);
  await rig.slide('b1', 'b2');
  expect(rig.hands()).toBe(0);
});

it("never pauses when a song's End trigger is answered fast and the next song's slow, and the End frame comes between the two answers", async () => {
  rig = await startRig('end-answered-first');
  rig.setDelayFor((path) => (path === '/v1/presentation/A/5/trigger' ? 50 : isTrigger(path) ? 700 : undefined));
  rig.target.cue(cue(1, 'Song A', 'end', 'End'));
  rig.target.cue(cue(2, 'Song B', 0, 'Verse 1'));
  await sleep(200);
  await rig.slide('e1');
  await sleep(800);
  rig.clock.advance(1500);
  await rig.slide('b1', 'b2');
  expect(rig.hands()).toBe(0);
});

// A Next slide pressed while a cue's trigger is out goes to ProPresenter once that trigger is
// answered, so it moves on from the cue's slide, not from the slide the last frame showed.
it("never pauses on the slide a Next slide press brings from the slide of a cue whose trigger was out when it was pressed, its frame late past the window", async () => {
  rig = await startRig('button-while-trigger-out');
  await rig.slide('a1', 'a2');
  rig.clock.advance(5000);
  const before = rig.hands();
  rig.setDelayFor((path) => (isTrigger(path) ? 700 : path.includes('/next/') ? 50 : undefined));
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await rig.target.runButton!('next');
  rig.clock.advance(1500);
  await rig.slide('c1', 'c2');
  await rig.slide('c2', 't1');
  expect(rig.hands()).toBe(before);
});

// A trigger ProPresenter refuses leaves the screen where it was, so a Next slide pressed while it was
// out moves on from the slide showing, not from the cue's.
it('never pauses on the slide a Next slide press brings from the slide showing when the trigger out at the press is refused, its frame late past the window', async () => {
  rig = await startRig('button-after-refused-trigger');
  await rig.slide('a1', 'a2');
  rig.clock.advance(5000);
  const before = rig.hands();
  rig.setDelayFor((path) => (isTrigger(path) ? 700 : path.includes('/next/') ? 50 : undefined));
  rig.setStatusFor((path) => (isTrigger(path) ? 404 : undefined));
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await rig.target.runButton!('next');
  rig.clock.advance(1500);
  await rig.slide('a2', 'c1');
  expect(rig.hands()).toBe(before);
});

// A trigger ProPresenter accepts with no frame of its own slide since it went puts the adapter's place
// on its slide, whatever other frame came while it was out, so a Next slide pressed after the answer
// moves on from the trigger's slide (setlist-controller#266 review pass 2 finding 1).
it("never pauses on a Next slide's late frame after a cue's trigger is accepted with no frame of its own, when an earlier Next slide's late frame came while the trigger was out", async () => {
  rig = await startRig('late-next-frame-while-trigger-out');
  await rig.slide('a1', 'a2');
  rig.clock.advance(5000);
  const before = rig.hands();
  rig.setDelayFor((path) => (isTrigger(path) ? 700 : path.includes('/next/') ? 50 : undefined));
  await rig.target.runButton!('next');
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await sleep(100);
  await rig.slide('a2', 'c1');
  await sleep(800);
  rig.clock.advance(1500);
  await rig.target.runButton!('next');
  rig.clock.advance(1010);
  await rig.slide('c2', 't1');
  expect(rig.hands()).toBe(before);
});

it("never pauses on a Next slide's late frame after the next song's first trigger is accepted with no frame of its own, when the End clear's blank frame came while it was out", async () => {
  rig = await startRig('clear-frame-while-trigger-out');
  await rig.slide('b2');
  rig.clock.advance(5000);
  const before = rig.hands();
  rig.setDelayFor((path) => (isTrigger(path) ? 700 : path.includes('/clear/') ? 50 : undefined));
  rig.target.cue(cue(2, 'Song B', 'end', 'End'));
  rig.target.cue(cue(1, 'Song A', 0, 'Verse 1'));
  await sleep(150);
  await rig.slide(null);
  await sleep(800);
  rig.clock.advance(1500);
  await rig.target.runButton!('next');
  rig.clock.advance(1010);
  await rig.slide('a2', 'c1');
  expect(rig.hands()).toBe(before);
});

it("never pauses on a Next slide's late frame after the first cue's trigger is accepted with no frame of its own, when a pre-service loop's timer frame came while it was out", async () => {
  rig = await startRig('loop-frame-while-trigger-out');
  await rig.slideWithUuid({ text: '', uuid: 'L1' }, { text: '', uuid: 'L2' });
  rig.clock.advance(5000);
  const before = rig.hands();
  rig.setDelayFor((path) => (isTrigger(path) ? 700 : path.includes('/next/') ? 50 : undefined));
  rig.target.cue(cue(1, 'Song A', 0, 'Verse 1'));
  await sleep(100);
  rig.clock.advance(3000);
  await rig.slideWithUuid({ text: '', uuid: 'L2' }, { text: '', uuid: 'L3' });
  await sleep(800);
  rig.clock.advance(1500);
  await rig.target.runButton!('next');
  rig.clock.advance(1010);
  await rig.slide('a2', 'c1');
  expect(rig.hands()).toBe(before);
});

// A cue handed after a Next slide press leaves that press's slide its own, so the press's cold frame,
// late past the window while the cue's trigger is out, is no change by hand (setlist-controller#266
// review pass 2 finding 2).
it("never pauses on a Next slide's late frame past the window while a cue's trigger handed after the press's answer is out", async () => {
  rig = await startRig('answered-next-then-cue');
  await rig.slide('a1', 'a2');
  rig.clock.advance(5000);
  const before = rig.hands();
  rig.setDelayFor((path) => (isTrigger(path) ? 1500 : path.includes('/next/') ? 50 : undefined));
  await rig.target.runButton!('next');
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await sleep(100);
  rig.clock.advance(1010);
  await rig.slide('a2', 'c1');
  expect(rig.hands()).toBe(before);
});

it("never pauses on a Next slide's late frame past the window while a cue's trigger handed while the press was out is out", async () => {
  rig = await startRig('next-out-then-cue');
  await rig.slide('a1', 'a2');
  rig.clock.advance(5000);
  const before = rig.hands();
  rig.setDelayFor((path) => (isTrigger(path) ? 1500 : path.includes('/next/') ? 300 : undefined));
  const pressed = rig.target.runButton!('next');
  await sleep(100);
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await pressed;
  await sleep(100);
  rig.clock.advance(1010);
  await rig.slide('a2', 'c1');
  expect(rig.hands()).toBe(before);
});

// A Clear slide pressed while a cue's trigger is out goes out once the trigger is answered and is
// answered before the trigger's own frame comes, which shows the slide the clear has since blanked.
it("keeps the row's slide text blank after a Clear slide pressed while a cue's trigger is out, when the trigger's frame comes after the clear", async () => {
  rig = await startRig('clear-while-trigger-out');
  rig.delayTriggers(300);
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await rig.target.runButton!('clear');
  await sleep(150);
  await rig.slide('c1', 'c2');
  expect(rig.states.at(-1)).toBeNull();
  expect(rig.hands()).toBe(0);
});

// A cue handed while a slide button's press is out waits for that press, as it waits for a cue before
// it, so ProPresenter cannot act on the cue's slide before a Clear slide pressed just before it.
it('sends a cue handed while a Clear slide press is out only once ProPresenter answers that press', async () => {
  rig = await startRig('cue-behind-press');
  rig.setDelayFor((path) => (path.includes('/clear/') ? 300 : undefined));
  const pressed = rig.target.runButton!('clear');
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await sleep(150);
  expect(rig.triggers()).toEqual([]);

  await pressed;
  await vi.waitFor(() => expect(rig!.triggers()).toEqual(['/v1/presentation/A/2/trigger']));
});

// Each cue and press waits for the one before it, so a cue handed after a slow trigger goes out once
// ProPresenter refuses that trigger. The refusal is then no longer the latest command, so the row
// shows no line about it.
it('shows no line for a trigger ProPresenter refuses after a later cue was handed, and still logs the refusal', async () => {
  rig = await startRig('refused-before-later-cue');
  rig.setDelayFor((path) => (path === '/v1/presentation/A/2/trigger' ? 300 : undefined));
  rig.setStatusFor((path) => (path === '/v1/presentation/A/2/trigger' ? 404 : undefined));
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  rig.target.cue(cue(2, 'Song B', 0, 'Verse 1'));
  await vi.waitFor(() => expect(rig!.triggers()).toEqual(['/v1/presentation/A/2/trigger', '/v1/presentation/B/0/trigger']));
  await sleep(100);

  expect(rig.states.flat()).not.toContain('Trigger refused for Song A, Chorus: ProPresenter answered 404.');
  expect(vi.mocked(console.error).mock.calls.filter(([message]) => String(message).includes('refused the trigger for Song A, Chorus'))).toHaveLength(1);
});

// The same for a press: a cue handed after it is the latest command once the press is answered.
it('shows no line for a press ProPresenter answers after a later cue was handed', async () => {
  rig = await startRig('press-before-later-cue');
  rig.setDelayFor((path) => (path.includes('/next/') ? 300 : undefined));
  rig.setStatusFor((path) => (path.includes('/next/') ? 404 : undefined));
  const pressed = rig.target.runButton!('next');
  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await pressed;
  await vi.waitFor(() => expect(rig!.triggers()).toEqual(['/v1/presentation/A/2/trigger']));
  await sleep(100);

  expect(rig.states.flat()).not.toContain('Pressed Next slide: nothing to move.');
});

it('leaves the reconnected ProPresenter online with its stream when a trigger sent before the stream dropped times out after the reconnect', async () => {
  rig = await startRig('stale-request', 1000);
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

  rig.target.cue(cue(1, 'Song A', 1, 'Chorus'));
  await sleep(1300);
  expect(rig.statuses.at(-1)).toBe('offline');
});

it('keeps the last read of the picked playlist when going offline cuts off a read of its presentations', async () => {
  rig = await startRig('aborted-read');
  rig.delayPresentations(300);
  const checked = rig.target.check(SET);
  await sleep(50);
  rig.drop();
  await sleep(100);
  rig.clock.advance(2000);
  await sleep(300);
  expect(rig.statuses.at(-1)).toBe('online');
  await checked;

  rig.target.cue(cue(2, 'Song B', 0, 'Verse 1'));
  await sleep(100);

  expect(rig.triggers()).toEqual(['/v1/presentation/B/0/trigger']);
});
