import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { PRODUCER_SECRET_FILE, readLeaderSecret, readProducerSecret } from '../src/server/leader-secret.ts';
import { leaderSocketPath, producerSocketPath, SOCKET_PATHS } from '../src/shared/routes.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { connect, loaded, startRig, type Rig } from './harness.ts';

const cleanups: (() => Promise<unknown>)[] = [];
let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function tempFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'setlist-producer-'));
  cleanups.push(() => rm(folder, { recursive: true, force: true }));
  return folder;
}

const HEX_128_BITS = /^[0-9a-f]{32}$/;

describe('the producer secret on disk', () => {
  it('is made on a first start, owner-only, in its own file', async () => {
    const folder = join(await tempFolder(), 'setlist-controller');

    const secret = await readProducerSecret(folder);

    expect(secret).toMatch(HEX_128_BITS);
    expect((await stat(join(folder, PRODUCER_SECRET_FILE))).mode & 0o777).toBe(0o600);
  });

  it('is the same across two starts with the same folder', async () => {
    const folder = await tempFolder();

    const first = await readProducerSecret(folder);

    expect(await readProducerSecret(folder)).toBe(first);
  });

  it('replaces a file that does not hold a secret, and says so once', async () => {
    const folder = await tempFolder();
    await writeFile(join(folder, PRODUCER_SECRET_FILE), 'not a secret\n');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanups.push(async () => logged.mockRestore());

    const secret = await readProducerSecret(folder);

    expect(secret).toMatch(HEX_128_BITS);
    expect(await readProducerSecret(folder)).toBe(secret);
    expect(logged).toHaveBeenCalledOnce();
    expect(String(logged.mock.calls[0]?.[0])).toContain('producer');
  });

  it('differs from the leader secret in the same folder, and each keeps its own', async () => {
    const folder = await tempFolder();

    const leader = await readLeaderSecret(folder);
    const producer = await readProducerSecret(folder);

    expect(producer).not.toBe(leader);
    expect(await readLeaderSecret(folder)).toBe(leader);
    expect(await readProducerSecret(folder)).toBe(producer);
  });
});

// One song in 4/4 at 120 BPM, so a beat is 500 ms.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];
const INTRO = 0;
const CHORUS = 2;
const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';
const LOOP_START = '/live/song/set/loop_start';
const LOOP_LENGTH = '/live/song/set/loop_length';
const LOOP = '/live/song/set/loop';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

describe('the producer socket', () => {
  it('lets the producer jump, the same as the leader', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const producer = await rig.connectProducer();
    await producer.snapshot(loaded);

    producer.send({ kind: 'jump', song: 1, section: CHORUS });

    await expect.poll(() => rig?.received(JUMP)).toEqual([{ address: JUMP, args: [CHORUS], types: 'i' }]);
  });

  it('lets the producer loop the current section, and Live gets the brace', async () => {
    rig = await startRig(SET, { playing: true, position: 5 });
    const producer = await rig.connectProducer();
    await producer.snapshot(at(5));

    producer.send({ kind: 'loop' });

    await expect
      .poll(() => rig?.live.received.filter((message) => message.address.startsWith('/live/song/set/loop')))
      .toEqual([
        { address: LOOP_START, args: [0], types: 'f' },
        { address: LOOP_LENGTH, args: [16], types: 'f' },
        { address: LOOP, args: [1], types: 'i' },
      ]);
    expect((await producer.snapshot((snapshot) => snapshot.loop !== null)).loop?.section).toEqual({ song: 1, section: INTRO });
  });

  it('lets the producer stop Live', async () => {
    rig = await startRig(SET, { playing: true, position: 5 });
    const producer = await rig.connectProducer();
    await producer.snapshot(at(5));

    producer.send({ kind: 'stop' });

    await expect.poll(() => rig?.received(STOP).length).toBe(1);
  });

  it("opens on its own secret alone, and the leader socket does not open on the producer's", async () => {
    rig = await startRig(SET, { playing: true, position: 0 });
    const base = `ws://127.0.0.1:${rig.server.httpPort}`;
    const wrong = randomBytes(16).toString('hex');
    const refused = [
      producerSocketPath(rig.leaderSecret),
      leaderSocketPath(rig.producerSecret),
      SOCKET_PATHS.producer,
      `${SOCKET_PATHS.producer}/`,
      producerSocketPath(wrong),
      `${SOCKET_PATHS.producer}?secret=${rig.producerSecret}`,
    ];

    for (const path of refused) {
      // ws reports the hub's refusal as an error that names the status.
      await expect(connect(`${base}${path}`), path).rejects.toThrow(/400/);
    }

    // None of them got a socket to send a command on, so Live has had no stop and no jump.
    const producer = await rig.connectProducer();
    await producer.snapshot(loaded);
    await producer.flush();
    expect(rig.received(STOP)).toEqual([]);
    expect(rig.received(JUMP)).toEqual([]);
  });
});

describe('the snapshot by role', () => {
  it('gives the producer the playback snapshot plus an empty connections list, no config problem, no devices and no active message, and the leader and viewer none of them', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    const viewer = await rig.connectViewer();

    const forProducer = await producer.snapshot(loaded);
    const forLeader = await leader.snapshot(loaded);
    const forViewer = await viewer.snapshot(loaded);

    expect(forProducer).toEqual({ ...forLeader, connections: [], connectionProblems: [], devices: [], activeMessages: [] });
    for (const snapshot of [forLeader, forViewer]) {
      expect(snapshot).not.toHaveProperty('connections');
      expect(snapshot).not.toHaveProperty('connectionProblems');
      expect(snapshot).not.toHaveProperty('devices');
      expect(snapshot).not.toHaveProperty('activeMessages');
    }
  });

  it('keeps each role its own part after a change, and skips a duplicate per role', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    const viewer = await rig.connectViewer();
    await Promise.all([producer.snapshot(loaded), leader.snapshot(loaded), viewer.snapshot(loaded)]);

    leader.send({ kind: 'jump', song: 1, section: CHORUS });

    const jumped = (snapshot: Snapshot) => snapshot.position === 32;
    const [forProducer, forLeader, forViewer] = await Promise.all([producer.snapshot(jumped), leader.snapshot(jumped), viewer.snapshot(jumped)]);
    expect(forProducer.connections).toEqual([]);
    expect(forLeader).not.toHaveProperty('connections');
    expect(forViewer).not.toHaveProperty('connections');
    // Every snapshot a client received differs from the one before it.
    for (const client of [producer, leader, viewer]) {
      const sent = client.received.map((snapshot) => JSON.stringify(snapshot));
      expect(sent.filter((snapshot, index) => snapshot === sent[index - 1])).toEqual([]);
    }
  });
});
