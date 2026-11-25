import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { LEADER_SECRET_FILE, readLeaderSecret } from '../src/server/leader-secret.ts';
import { leaderSocketPath, SOCKET_PATHS } from '../src/shared/routes.ts';
import { connect, loaded, startRig, type Rig } from './harness.ts';

const cleanups: (() => Promise<unknown>)[] = [];
let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function tempFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'setlist-secret-'));
  cleanups.push(() => rm(folder, { recursive: true, force: true }));
  return folder;
}

const HEX_128_BITS = /^[0-9a-f]{32}$/;

describe('the leader secret on disk', () => {
  it('is the same across two starts with the same folder', async () => {
    const folder = await tempFolder();

    const first = await readLeaderSecret(folder);
    const second = await readLeaderSecret(folder);

    expect(first).toMatch(HEX_128_BITS);
    expect(second).toBe(first);
  });

  it('differs between two folders', async () => {
    const [one, other] = [await tempFolder(), await tempFolder()];

    expect(await readLeaderSecret(one)).not.toBe(await readLeaderSecret(other));
  });

  it('makes a folder that does not exist yet, as on a first start', async () => {
    const folder = join(await tempFolder(), 'Application Support', 'setlist-controller');

    const secret = await readLeaderSecret(folder);

    expect((await readFile(join(folder, LEADER_SECRET_FILE), 'utf8')).trim()).toBe(secret);
  });

  it('keeps the file readable by its owner alone', async () => {
    const folder = await tempFolder();
    await readLeaderSecret(folder);

    expect((await stat(join(folder, LEADER_SECRET_FILE))).mode & 0o777).toBe(0o600);
  });

  it('gives one secret to two starts that race on an empty folder', async () => {
    const folder = await tempFolder();

    const [first, second] = await Promise.all([readLeaderSecret(folder), readLeaderSecret(folder)]);

    expect(second).toBe(first);
  });

  it('replaces a file that does not hold a secret, and says so', async () => {
    const folder = await tempFolder();
    await writeFile(join(folder, LEADER_SECRET_FILE), 'not a secret\n');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanups.push(async () => logged.mockRestore());

    const secret = await readLeaderSecret(folder);

    expect(secret).toMatch(HEX_128_BITS);
    expect(await readLeaderSecret(folder)).toBe(secret);
    expect(logged).toHaveBeenCalledOnce();
  });
});

// One song in 4/4. The Chorus is cue 2 in this list and section 2 of the song.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];
const VERSE = 1;
const CHORUS = 2;
const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';

describe('the leader socket', () => {
  it('refuses a connection with no secret, a wrong secret, or the secret in a query string', async () => {
    rig = await startRig(SET, { playing: true, position: 0 });
    const base = `ws://127.0.0.1:${rig.server.httpPort}`;
    const wrong = randomBytes(16).toString('hex');

    for (const path of [SOCKET_PATHS.leader, `${SOCKET_PATHS.leader}/`, leaderSocketPath(wrong), `${SOCKET_PATHS.leader}?secret=${rig.leaderSecret}`]) {
      // ws reports the hub's refusal as an error that names the status.
      await expect(connect(`${base}${path}`), path).rejects.toThrow(/400/);
    }

    // None of them got a socket to send a stop or a jump on. The leader's jump, on the right path,
    // is the only command that reaches Live.
    const leader = await rig.connectLeader();
    await leader.snapshot(loaded);
    leader.send({ kind: 'jump', song: 1, section: VERSE });
    await leader.flush();
    await expect.poll(() => rig?.received(JUMP).length).toBe(1);
    expect(rig.received(JUMP)).toEqual([{ address: JUMP, args: [VERSE], types: 'i' }]);
    expect(rig.received(STOP)).toEqual([]);
  });

  it('gives the leader role on the right secret path, so its command reaches Live', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const leader = await connect(`ws://127.0.0.1:${rig.server.httpPort}${leaderSocketPath(rig.leaderSecret)}`);
    cleanups.push(async () => leader.close());
    await leader.snapshot(loaded);

    leader.send({ kind: 'jump', song: 1, section: CHORUS });

    await expect.poll(() => rig?.received(JUMP)).toEqual([{ address: JUMP, args: [CHORUS], types: 'i' }]);
  });
});
