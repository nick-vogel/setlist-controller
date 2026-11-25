// Pre-PR review 2, findings 1 and 2. Run with: sh docs/reviews/setlist-controller-108/repro/review-2-repro.sh
// The script copies this file into test/ of a throwaway worktree at HEAD, outside the repo, so its
// imports resolve from there. Today both tests fail; once the findings are fixed, both pass.
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { manualClock } from '../src/server/clock.ts';
import { eosKind } from '../src/server/eos.ts';
import { encode } from '../src/shared/osc.ts';
import { connectionsConfigs, RECORDED_SHOW, startFakeEos, type FakeEos, type FakeEosCue } from './fake-eos.ts';
import { loaded, startRig, type Rig } from './harness.ts';

const SET: CuePoint[] = [
  { name: '1 - Intro (Goodness of God)', time: 0 },
  { name: '1 - Verse 1', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - Bridge', time: 48 },
  { name: '1 - End', time: 64 },
  { name: '2 - Count Off (Great Are You Lord)', time: 64 },
  { name: '2 - Verse 1', time: 72 },
  { name: '2 - Chorus', time: 88 },
  { name: '2 - Tag', time: 104 },
  { name: '2 - End', time: 120 },
];
let rig: Rig | undefined;
let eos: FakeEos | undefined;
let raw: Server | undefined;
const sockets: Socket[] = [];
const configs = connectionsConfigs();
afterEach(async () => {
  await rig?.close();
  await eos?.close();
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((done) => (raw ? raw.close(() => done()) : done()));
  await configs.remove();
});

it('finding 1: a peer that sends no packet-length framing, as an Eos set to OSC 1.1 SLIP, never shows the lights online', async () => {
  const slip = Buffer.concat([Buffer.from([0xc0]), encode('/eos/out/user', [{ int: 1 }]), Buffer.from([0xc0])]);
  raw = createServer((socket) => {
    sockets.push(socket);
    socket.write(slip);
  });
  await new Promise<void>((done) => raw!.listen(0, '127.0.0.1', () => done()));
  const port = (raw.address() as { port: number }).port;
  const path = await configs.write({ eos: { host: '127.0.0.1', port, cueList: 1 } });
  rig = await startRig(SET, { playing: false, position: 0 }, { connectionsConfig: path, targetKinds: { eos: eosKind({ clock: manualClock() }) } });
  const producer = await rig.connectProducer();
  await producer.snapshot(loaded);
  await new Promise((done) => setTimeout(done, 300));
  await producer.flush();
  expect(producer.received.some((snapshot) => snapshot.connections[0]?.connection === 'online')).toBe(false);
});

it('finding 2: names no cue as never firing when a cue of another section fires it on its follow and link', async () => {
  const [intro, verse, chorus, bridge, ...rest] = RECORDED_SHOW;
  const show: FakeEosCue[] = [
    intro!,
    verse!,
    chorus!,
    // The Bridge's follow fires cue 12, which carries the Chorus label after cue 3.
    { ...bridge!, follow: 1000, link: 12 },
    ...rest,
    { number: '9', label: 'Great Are You Lord / Tag' },
    { number: '10', label: 'Great Are You Lord / End' },
    { number: '12', label: 'Goodness of God / Chorus' },
  ];
  eos = await startFakeEos();
  eos.setShow(show);
  const path = await configs.write({ eos: { host: '127.0.0.1', port: eos.port, cueList: 1 } });
  rig = await startRig(SET, { playing: false, position: 0 }, { connectionsConfig: path, targetKinds: { eos: eosKind({ clock: manualClock() }) } });
  const producer = await rig.connectProducer();
  const snapshot = await producer.snapshot((given) => given.connections[0]?.connection === 'online' && given.connections[0]?.check.kind !== 'not-checked');
  expect(snapshot.connections[0]?.check).toEqual({ kind: 'matched' });
});
