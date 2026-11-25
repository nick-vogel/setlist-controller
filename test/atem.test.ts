import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { atemKind } from '../src/server/atem.ts';
import { manualClock, type Clock } from '../src/server/clock.ts';
import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { ATEM_MINI_SOURCES, fakeSwitcher, type FakeSwitcher } from './fake-switcher.ts';
import { fakeKind, fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

// The ATEM target, through the real server against the fake Live, with a fake switcher client in
// place of the one built on the ATEM library. A test checks only what the fake was told and what the
// producer's row shows.

let rig: Rig | undefined;
// The folder a test's lateness log goes in, inside the worktree's dist, never the OS temp folder.
let logDir: string | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  vi.restoreAllMocks();
  if (logDir) await rm(logDir, { recursive: true, force: true });
  logDir = undefined;
});

const REPO_ROOT = resolve(import.meta.dirname, '..');

// A new, empty folder for a test's lateness log, removed after the test.
async function newLogDir(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  logDir = await mkdtemp(join(REPO_ROOT, 'dist/lateness-'));
  return logDir;
}

// The log's lines, each parsed, or none while there is no file.
async function linesOf(path: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(path, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const fixture = (name: string) => resolve(import.meta.dirname, 'fixtures/connections', name);
// The ATEM's section: host 192.168.10.240, Pro on input 1, Camera on input 2.
const ATEM = fixture('atem.json');
// The fake kind's section good, and the ATEM's with Pro and Camera both on input 2.
const ATEM_BAD_SECTION = fixture('atem-bad-section.json');
// The ATEM's section with Camera on input 1000, which the ATEM Mini gives its Color Bars.
const ATEM_CAMERA_COLOR_BARS = fixture('atem-camera-color-bars.json');
// The ATEM's section with Pro on input 3010, which the ATEM Mini gives its first media player.
const ATEM_PRO_MEDIA_PLAYER = fixture('atem-pro-media-player.json');
const PRO = 1;
const CAMERA = 2;
// The ATEM's manual buttons, in the order its row offers them.
const BUTTONS = [
  { id: 'pro', label: 'Pro' },
  { id: 'camera', label: 'Camera' },
];
const JUMP = '/live/song/cue_point/jump';

// At 120 BPM in 4/4 a beat is 500 ms and a bar is 4 beats.
const BEAT_MS = 500;

// Two songs, each with a Count Off, song 2's on song 1's End, as the set builder lays out an overlap.
const TWO_SONGS: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - Chorus', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Count Off (Trust)', time: 40 },
  { name: '2 - Verse', time: 48 },
  { name: '2 - End', time: 64 },
];

// Live reports the playhead as float32, so a position is compared within a hair.
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;
const rowOf = (snapshot: ProducerSnapshot, name: string): Connection | undefined => snapshot.connections.find((row) => row.name === name);

// A rig playing in song 1's Verse at beat 12, with the ATEM from its config section (the `config`
// file, by default Pro 1 and Camera 2) on the given fake switcher client, and a leader and a producer connected, once the producer sees the set there and,
// unless `online` is false, the ATEM online. The ATEM is armed when `armed` says so. Extra fake
// targets start beside it. Given a clock, the ATEM tells its own cuts by that clock's time, and
// waits on it before it connects again. Given a lateness log, the server writes it there.
async function atemRig(
  switcher: FakeSwitcher,
  {
    armed = true,
    online = true,
    targets = [],
    clock,
    config = ATEM,
    latenessLog,
  }: { armed?: boolean; online?: boolean; targets?: FakeTarget[]; clock?: Pick<Clock, 'now' | 'every'>; config?: string; latenessLog?: { path: string } } = {},
) {
  const options = { connectionsConfig: config, targetKinds: { atem: atemKind({ client: () => switcher, clock }) }, targets, latenessLog };
  const started = await startRig(TWO_SONGS, { playing: true, position: 12 }, options);
  rig = started;
  const producer = await started.connectProducer();
  const leader = await started.connectLeader();
  await leader.snapshot(loaded);
  const atem = (snapshot: ProducerSnapshot) => rowOf(snapshot, 'atem');
  const first = await producer.snapshot((snapshot) => loaded(snapshot) && near(snapshot.position, 12) && (!online || atem(snapshot)?.connection === 'online'));

  // Resolves with the first snapshot the producer receives from now on that matches.
  const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
  };
  const helpers = {
    first,
    next,
    atem,
    // Resolves once the producer sees the ATEM's row online or offline.
    sees: (connection: Connection['connection']) => next((snapshot) => atem(snapshot)?.connection === connection),
    async arm(name = 'atem') {
      const seen = next((snapshot) => rowOf(snapshot, name)?.arm === 'armed');
      producer.send({ kind: 'arm', target: name });
      return seen;
    },
    // The leader's jump, once the producer sees it waiting and the fake Live holds it.
    async jump(song: number, section: number) {
      leader.send({ kind: 'set-safe-mode', enabled: false });
      const seen = next((snapshot) => snapshot.jump?.song === song && snapshot.jump.section === section);
      const sent = started.received(JUMP).length;
      leader.send({ kind: 'jump', song, section });
      await seen;
      await vi.waitFor(() => expect(started.received(JUMP)).toHaveLength(sent + 1));
    },
    // The leader's command, once the producer sees the snapshot it gives.
    async lead(command: unknown, gives: (snapshot: ProducerSnapshot) => boolean) {
      const seen = next(gives);
      leader.send(command);
      return seen;
    },
    // The producer's latest snapshot, once the server has handled every command the leader and the
    // producer sent and the producer has received every snapshot that handling published.
    async settled() {
      await leader.flush();
      await producer.flush();
      const latest = producer.received.at(-1);
      if (!latest) throw new Error('The producer has received no snapshot');
      return latest;
    },
    // The ATEM row's lateness in the producer's latest snapshot, once everything sent is handled.
    async lateness() {
      return atem(await helpers.settled())!.lateness;
    },
    // The producer's command, once the server has handled it.
    async press(command: unknown) {
      producer.send(command);
      await producer.flush();
    },
    // Plays on for that many beats, and waits for the playhead where Live then puts it.
    async play(beats: number, landsOn: number) {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      started.live.advance(beats * BEAT_MS);
      return seen;
    },
  };
  if (armed) await helpers.arm();
  return helpers;
}

describe('the ATEM armed', () => {
  it("cuts to Camera at song 2's Count Off, and at song 1's on a jump back to it, and at no other section", async () => {
    const switcher = fakeSwitcher();
    const { play, jump } = await atemRig(switcher);

    // Into song 1's Chorus at 24.
    await play(14, 26);
    expect(switcher.programs).toEqual([]);
    // Through song 1's End into song 2's Count Off at 40.
    await play(15, 41);
    expect(switcher.programs).toEqual([CAMERA]);
    // Into song 2's Verse at 48.
    await play(8, 49);
    expect(switcher.programs).toEqual([CAMERA]);
    // A jump to song 1's Count Off lands on the bar line at 52, and plays on two beats.
    await jump(1, 0);
    await play(5, 2);
    expect(switcher.programs).toEqual([CAMERA, CAMERA]);
    // Into song 1's Verse at 8.
    await play(7, 9);
    expect(switcher.programs).toEqual([CAMERA, CAMERA]);
  });
});

describe('Fire again on the ATEM', () => {
  it('sends the cut to Camera again in a Count Off, and nothing in another section', async () => {
    const switcher = fakeSwitcher();
    const { play, press } = await atemRig(switcher);
    await play(29, 41);
    expect(switcher.programs).toEqual([CAMERA]);

    await press({ kind: 'fire-again', target: 'atem' });
    expect(switcher.programs).toEqual([CAMERA, CAMERA]);

    // Into song 2's Verse at 48.
    await play(8, 49);
    await press({ kind: 'fire-again', target: 'atem' });
    expect(switcher.programs).toEqual([CAMERA, CAMERA]);
  });
});

describe('the ATEM disarmed or offline', () => {
  it('cuts nothing while disarmed, at either Count Off', async () => {
    const switcher = fakeSwitcher();
    const { play, jump } = await atemRig(switcher, { armed: false });

    await play(29, 41);
    await play(8, 49);
    await jump(1, 0);
    await play(5, 2);

    expect(switcher.programs).toEqual([]);
  });

  it('cuts nothing while offline, and cuts at the next Count Off once it is back online', async () => {
    const switcher = fakeSwitcher();
    const { atem, play, jump, sees } = await atemRig(switcher);
    const offline = sees('offline');
    switcher.goOffline();
    expect(atem(await offline)).toMatchObject({ connection: 'offline', arm: 'armed' });

    await play(29, 41);
    expect(switcher.programs).toEqual([]);

    const online = sees('online');
    switcher.goOnline();
    expect(atem(await online)).toMatchObject({ connection: 'online', arm: 'armed' });
    await play(8, 49);
    await jump(1, 0);
    await play(5, 2);
    expect(switcher.programs).toEqual([CAMERA]);
  });
});

describe('a Fade out', () => {
  it('leaves the ATEM armed while it pauses a target that pauses on a fade, and the next Count Off still cuts', async () => {
    const switcher = fakeSwitcher();
    const fading = fakeTarget({ name: 'fading', label: 'Fading', pausesOnFade: true });
    const { atem, arm, lead, play, settled } = await atemRig(switcher, { targets: [fading] });
    await arm('fading');

    // The Fade out sets each row in turn and publishes a snapshot for each, so the ATEM's row is read
    // once the whole Fade out has been handled, not from the first snapshot that shows it.
    await lead({ kind: 'fade-out' }, (snapshot) => rowOf(snapshot, 'fading')?.pause === 'fade-out');
    const faded = await settled();
    expect(rowOf(faded, 'fading')).toMatchObject({ arm: 'paused', pause: 'fade-out' });
    expect(atem(faded)).toMatchObject({ arm: 'armed', pause: null });

    // Through song 1's End into song 2's Count Off at 40.
    await play(29, 41);
    expect(switcher.programs).toEqual([CAMERA]);
  });
});

describe('a change by hand', () => {
  it('pauses the ATEM armed on a cut made at the ATEM, shown as paused by hand, and the next Count Off does not cut until the producer arms it', async () => {
    const switcher = fakeSwitcher();
    const { atem, arm, jump, next, play } = await atemRig(switcher);

    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(CAMERA);
    expect(atem(await paused)).toMatchObject({ arm: 'paused', pause: 'by-hand' });

    // Through song 1's End into song 2's Count Off at 40, and into its Verse at 48.
    await play(29, 41);
    await play(8, 49);
    expect(switcher.programs).toEqual([]);

    // Armed again, a jump to song 1's Count Off cuts.
    await arm();
    await jump(1, 0);
    await play(5, 2);
    expect(switcher.programs).toEqual([CAMERA]);
  });

  it('pauses the ATEM on a cut made at the ATEM to an input that is neither Pro nor Camera', async () => {
    const switcher = fakeSwitcher();
    const { atem, next, settled } = await atemRig(switcher);

    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(4);
    await paused;
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Input 4'] });
  });

  it("is never the ATEM's own cuts: a Count Off's cut, Fire again, and the Pro and Camera buttons leave it armed", async () => {
    const switcher = fakeSwitcher();
    const { atem, play, press, settled } = await atemRig(switcher);

    // Through song 1's End into song 2's Count Off at 40.
    await play(29, 41);
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null, state: ['Program: Camera'] });
    await press({ kind: 'fire-again', target: 'atem' });
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null });
    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null, state: ['Program: Pro'] });
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null, state: ['Program: Camera'] });

    expect(switcher.programs).toEqual([CAMERA, CAMERA, PRO, CAMERA]);
  });

  it('is never a cut made at the ATEM to the input already on program', async () => {
    const switcher = fakeSwitcher();
    const { atem, settled } = await atemRig(switcher);

    switcher.cutAtSwitcher(PRO);
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null, state: ['Program: Pro'] });
  });

  it("is never the ATEM's own cut when its report comes late, within 2 seconds", async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, press, settled } = await atemRig(switcher, { clock });

    switcher.holdEchoes();
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    clock.advance(1999);
    const camera = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Camera');
    switcher.releaseEchoes();
    await camera;
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null, state: ['Program: Camera'] });
  });

  it("is a report that comes more than 2 seconds after the ATEM's own cut", async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, press, settled } = await atemRig(switcher, { clock });

    switcher.holdEchoes();
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    clock.advance(2001);
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.releaseEchoes();
    await paused;
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Camera'] });
  });

  it("is a cut made at the ATEM to another input while the report of the ATEM's own cut has not come yet", async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, press, settled } = await atemRig(switcher, { clock });

    switcher.holdEchoes();
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(4);
    await paused;
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Input 4'] });
  });

  it("is a cut made at the ATEM after one report stands for two quick cuts of the ATEM's own", async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, press, settled } = await atemRig(switcher, { clock });

    switcher.holdEchoes();
    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    clock.advance(50);
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    // One report of Camera, as the library gives for a packet that carries both cuts.
    switcher.cutAtSwitcher(CAMERA);
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null, state: ['Program: Camera'] });
    clock.advance(1000);
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(PRO);
    await paused;
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Pro'] });
  });

  it('is a cut made at the ATEM to the input of a cut of its own the ATEM refused', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, press, settled } = await atemRig(switcher, { clock });

    switcher.refuseCuts();
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('Setlist server: the ATEM could not cut to Camera', expect.any(Error)));
    expect(switcher.programs).toEqual([CAMERA]);
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null, state: ['Program: Pro'] });
    clock.advance(500);
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(CAMERA);
    await paused;
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Camera'] });
  });

  it('is a cut made at the ATEM to Pro after the ATEM refused the Pro button', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher({ program: CAMERA });
    const { atem, next, press, settled } = await atemRig(switcher, { clock });

    switcher.refuseCuts();
    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('Setlist server: the ATEM could not cut to Pro', expect.any(Error)));
    expect(switcher.programs).toEqual([PRO]);
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null, state: ['Program: Camera'] });
    clock.advance(500);
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(PRO);
    await paused;
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Pro'] });
  });

  it("is a cut made at the ATEM after a reconnect to the input of a cut of its own whose report did not come", async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, press, sees, settled } = await atemRig(switcher, { clock });

    switcher.holdEchoes();
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    // The report of the cut to Camera is lost to the drop, and Pro is on program at the reconnect.
    const offline = sees('offline');
    switcher.goOffline();
    await offline;
    const online = next((snapshot) => atem(snapshot)?.connection === 'online' && atem(snapshot)?.state[0] === 'Program: Pro');
    switcher.goOnline();
    expect(atem(await online)).toMatchObject({ arm: 'armed', pause: null });
    clock.advance(500);
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(CAMERA);
    await paused;
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Camera'] });
  });

  it('leaves the ATEM disarmed', async () => {
    const switcher = fakeSwitcher();
    const { atem, next, settled } = await atemRig(switcher, { armed: false });

    const cut = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Camera');
    switcher.cutAtSwitcher(CAMERA);
    await cut;
    expect(atem(await settled())).toMatchObject({ arm: 'disarmed', pause: null });
  });
});

describe("the ATEM's Pro and Camera buttons", () => {
  it('cut to Pro and to Camera while armed, and leave the ATEM armed', async () => {
    const switcher = fakeSwitcher();
    const { atem, press, settled } = await atemRig(switcher);

    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    expect(switcher.programs).toEqual([PRO]);
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null });
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    expect(switcher.programs).toEqual([PRO, CAMERA]);
    expect(atem(await settled())).toMatchObject({ arm: 'armed', pause: null });
  });

  it('cut to Pro and to Camera while disarmed, and leave the ATEM disarmed', async () => {
    const switcher = fakeSwitcher();
    const { atem, press, settled } = await atemRig(switcher, { armed: false });

    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    expect(switcher.programs).toEqual([PRO]);
    expect(atem(await settled())).toMatchObject({ arm: 'disarmed', pause: null });
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    expect(switcher.programs).toEqual([PRO, CAMERA]);
    expect(atem(await settled())).toMatchObject({ arm: 'disarmed', pause: null });
  });

  it('cut to Pro and to Camera while paused by a change by hand, and leave the ATEM paused', async () => {
    const switcher = fakeSwitcher();
    const { atem, next, press, settled } = await atemRig(switcher);
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(4);
    expect(atem(await paused)).toMatchObject({ arm: 'paused', pause: 'by-hand' });

    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    expect(switcher.programs).toEqual([PRO]);
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand' });
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    expect(switcher.programs).toEqual([PRO, CAMERA]);
    expect(atem(await settled())).toMatchObject({ arm: 'paused', pause: 'by-hand' });
  });

  it('do nothing while the ATEM is offline', async () => {
    const switcher = fakeSwitcher();
    const { press, sees } = await atemRig(switcher);
    const offline = sees('offline');
    switcher.goOffline();
    await offline;

    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });

    expect(switcher.programs).toEqual([]);
  });
});

describe("the ATEM's row", () => {
  it('shows the ATEM configured with its Pro and Camera buttons and Pro on program, and the switcher client was asked to connect to its host', async () => {
    const switcher = fakeSwitcher();
    const { atem, settled } = await atemRig(switcher, { armed: false });

    // The ATEM reports its program input just after it reports itself online, so the row is read
    // once both are handled.
    expect(atem(await settled())).toMatchObject({ name: 'atem', label: 'ATEM', configured: true, problems: [], connection: 'online', arm: 'disarmed', buttons: BUTTONS, state: ['Program: Pro'] });
    expect(switcher.host).toBe('192.168.10.240');
  });

  it('shows each input the producer cuts to by its name', async () => {
    const switcher = fakeSwitcher();
    const { atem, next, press } = await atemRig(switcher, { armed: false });

    const camera = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Camera');
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    expect(atem(await camera)?.state).toEqual(['Program: Camera']);
    const pro = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Pro');
    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    expect(atem(await pro)?.state).toEqual(['Program: Pro']);
  });

  it('shows an external input that is neither Pro nor Camera by the name the ATEM gives it, on connect and on a cut made at the ATEM', async () => {
    const switcher = fakeSwitcher({
      program: 3,
      inputs: [1, 2, { input: 3, external: true, name: 'Lyrics' }, { input: 4, external: true, name: 'Wide' }, ...ATEM_MINI_SOURCES],
    });
    const { atem, next, settled } = await atemRig(switcher, { armed: false });
    expect(atem(await settled())?.state).toEqual(['Program: Lyrics']);

    const cut = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Wide');
    switcher.cutAtSwitcher(4);
    expect(atem(await cut)?.state).toEqual(['Program: Wide']);
    expect(switcher.programs).toEqual([]);
  });

  it("shows one of the ATEM's own sources by the name the ATEM gives it, on connect and on a cut made at the ATEM", async () => {
    const switcher = fakeSwitcher({ program: 3010 });
    const { atem, next, settled } = await atemRig(switcher, { armed: false });
    expect(atem(await settled())?.state).toEqual(['Program: Media Player 1']);

    const cut = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Color Bars');
    switcher.cutAtSwitcher(1000);
    expect(atem(await cut)?.state).toEqual(['Program: Color Bars']);
    expect(switcher.programs).toEqual([]);
  });

  it('shows Pro and Camera by their own names, whatever the ATEM calls their inputs', async () => {
    const switcher = fakeSwitcher({
      inputs: [{ input: 1, external: true, name: 'ProPresenter' }, { input: 2, external: true, name: 'HDMI 2' }, 3, 4, ...ATEM_MINI_SOURCES],
    });
    const { atem, next, press, settled } = await atemRig(switcher, { armed: false });
    expect(atem(await settled())?.state).toEqual(['Program: Pro']);

    const camera = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Camera');
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    expect(atem(await camera)?.state).toEqual(['Program: Camera']);
  });

  it('shows an input by its number when the ATEM gives it no name, an empty one or only spaces', async () => {
    const switcher = fakeSwitcher({
      program: 3,
      inputs: [1, 2, { input: 3, external: true, name: '' }, { input: 4, external: true, name: '  ' }, ...ATEM_MINI_SOURCES],
    });
    const { atem, next, settled } = await atemRig(switcher, { armed: false });
    expect(atem(await settled())?.state).toEqual(['Program: Input 3']);

    const cut = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Input 4');
    switcher.cutAtSwitcher(4);
    expect(atem(await cut)?.state).toEqual(['Program: Input 4']);
  });

  it('shows an input by its number on a cut made at the ATEM to an input the ATEM does not list', async () => {
    const switcher = fakeSwitcher();
    const { atem, next } = await atemRig(switcher, { armed: false });

    const cut = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Input 5');
    switcher.cutAtSwitcher(5);
    expect(atem(await cut)?.state).toEqual(['Program: Input 5']);
  });

  it("shows Camera once a Count Off's cut is on program", async () => {
    const switcher = fakeSwitcher();
    const { atem, next, play } = await atemRig(switcher);

    const camera = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Camera');
    // Through song 1's End into song 2's Count Off at 40.
    await play(29, 41);
    expect(atem(await camera)?.state).toEqual(['Program: Camera']);
  });

  it('shows no program input while offline, and the program input again once back online', async () => {
    const switcher = fakeSwitcher();
    const { atem, sees, settled } = await atemRig(switcher, { armed: false });

    const offline = sees('offline');
    switcher.goOffline();
    expect(atem(await offline)?.state).toEqual([]);
    const online = sees('online');
    switcher.goOnline();
    await online;
    expect(atem(await settled())?.state).toEqual(['Program: Pro']);
  });

  it('is offline until the switcher client connects, offline on a disconnect, and online again on reconnect', async () => {
    const switcher = fakeSwitcher({ online: false });
    const { first, sees, atem } = await atemRig(switcher, { armed: false, online: false });
    expect(atem(first)?.connection).toBe('offline');
    expect(switcher.host).toBe('192.168.10.240');

    const online = sees('online');
    switcher.goOnline();
    expect(atem(await online)?.connection).toBe('online');
    const offline = sees('offline');
    switcher.goOffline();
    expect(atem(await offline)?.connection).toBe('offline');
    const back = sees('online');
    switcher.goOnline();
    expect(atem(await back)?.connection).toBe('online');
  });

  it('closes the switcher client when the server stops', async () => {
    const switcher = fakeSwitcher();
    await atemRig(switcher, { armed: false });

    await rig?.close();
    rig = undefined;

    expect(switcher.closed).toBe(true);
  });
});

describe('a connect that rejects', () => {
  const SOCKET = 'Could not start the socket process';
  const REASON = `The ATEM could not connect: ${SOCKET}.`;
  // The pause before the ATEM connects again after a connect that rejects.
  const RETRY_MS = 5000;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows its reason on the row from the first snapshot, and keeps the log line', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const switcher = fakeSwitcher();
    switcher.failConnects(1, SOCKET);
    const { first, atem } = await atemRig(switcher, { armed: false, online: false, clock: manualClock() });

    expect(atem(first)).toMatchObject({ configured: true, connection: 'offline', problems: [REASON] });
    expect(logged).toHaveBeenCalledWith('Setlist server: the ATEM could not connect to 192.168.10.240', new Error(SOCKET));
  });

  it('connects again after a pause, and the row comes online and the reason goes once that one resolves', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher();
    switcher.failConnects(1, SOCKET);
    const { first, atem, sees, settled } = await atemRig(switcher, { armed: false, online: false, clock });
    expect(atem(first)?.problems).toEqual([REASON]);

    clock.advance(RETRY_MS - 1);
    expect(switcher.connects).toBe(1);
    const online = sees('online');
    clock.advance(1);
    expect(switcher.connects).toBe(2);
    await online;
    expect(atem(await settled())).toMatchObject({ connection: 'online', problems: [], state: ['Program: Pro'] });
    clock.advance(RETRY_MS * 3);
    expect(switcher.connects).toBe(2);
  });

  it('connects again after each one that rejects, logging and showing each, until one resolves', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher();
    switcher.failConnects(2, SOCKET);
    const { atem, sees, settled } = await atemRig(switcher, { armed: false, online: false, clock });

    clock.advance(RETRY_MS);
    await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(2));
    expect(switcher.connects).toBe(2);
    expect(atem(await settled())).toMatchObject({ connection: 'offline', problems: [REASON] });
    const online = sees('online');
    clock.advance(RETRY_MS);
    expect(switcher.connects).toBe(3);
    await online;
    expect(atem(await settled())).toMatchObject({ connection: 'online', problems: [] });
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('drops its reason and connects no more once the ATEM comes online on its own during the pause', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher();
    switcher.failConnects(1, SOCKET);
    const { first, atem, sees, settled } = await atemRig(switcher, { armed: false, online: false, clock });
    expect(atem(first)?.problems).toEqual([REASON]);

    const online = sees('online');
    switcher.connectOnItsOwn();
    expect(atem(await online)).toMatchObject({ connection: 'online', problems: [] });
    clock.advance(RETRY_MS * 2);
    expect(switcher.connects).toBe(1);
    expect(atem(await settled())).toMatchObject({ connection: 'online', problems: [], state: ['Program: Pro'] });
  });

  it('connects no more once the server stops during the pause', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher();
    switcher.failConnects(1, SOCKET);
    await atemRig(switcher, { armed: false, online: false, clock });

    await rig?.close();
    rig = undefined;
    clock.advance(RETRY_MS * 2);

    expect(switcher.connects).toBe(1);
    expect(switcher.closed).toBe(true);
  });
});

describe('a failed reconnect after the socket process respawns', () => {
  // The reason the switcher client gives when the library's own reconnect after a respawn rejects.
  const GAVE_UP = 'The socket process did not answer';
  const REASON = `The ATEM could not connect: ${GAVE_UP}.`;
  const SOCKET = 'Could not start the socket process';
  // The pause before the ATEM connects again.
  const RETRY_MS = 5000;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows its reason on the row within one report, and connects again after a pause', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, sees, settled } = await atemRig(switcher, { armed: false, clock });
    expect(switcher.connects).toBe(1);

    // The row goes offline, then shows the reason on the report straight after, with no wait.
    const offline = sees('offline');
    const gaveUp = next((snapshot) => atem(snapshot)?.problems[0] === REASON);
    switcher.respawnFailingReconnect(GAVE_UP);
    await offline;
    expect(atem(await gaveUp)?.connection).toBe('offline');
    expect(atem(await settled())).toMatchObject({ connection: 'offline', problems: [REASON], state: [] });
    clock.advance(RETRY_MS - 1);
    expect(switcher.connects).toBe(1);
    clock.advance(1);
    expect(switcher.connects).toBe(2);
  });

  it('comes online and drops its reason once the connect again resolves, and connects no more', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, sees, settled } = await atemRig(switcher, { armed: false, clock });
    const offline = sees('offline');
    switcher.respawnFailingReconnect(GAVE_UP);
    await offline;

    const online = sees('online');
    clock.advance(RETRY_MS);
    await online;
    expect(atem(await settled())).toMatchObject({ connection: 'online', problems: [], state: ['Program: Pro'] });
    clock.advance(RETRY_MS * 3);
    expect(switcher.connects).toBe(2);
  });

  it('connects again after each connect that rejects, showing each reason, until one resolves', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, sees, settled } = await atemRig(switcher, { armed: false, clock });
    const offline = sees('offline');
    switcher.respawnFailingReconnect(GAVE_UP);
    await offline;

    switcher.failConnects(1, SOCKET);
    const rejected = next((snapshot) => atem(snapshot)?.problems[0] === `The ATEM could not connect: ${SOCKET}.`);
    clock.advance(RETRY_MS);
    expect(switcher.connects).toBe(2);
    expect(atem(await rejected)?.connection).toBe('offline');
    const online = sees('online');
    clock.advance(RETRY_MS);
    expect(switcher.connects).toBe(3);
    await online;
    expect(atem(await settled())).toMatchObject({ connection: 'online', problems: [] });
  });

  it('drops its reason and connects no more once the ATEM comes online on its own during the pause', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, sees, settled } = await atemRig(switcher, { armed: false, clock });
    const offline = sees('offline');
    switcher.respawnFailingReconnect(GAVE_UP);
    await offline;

    const online = sees('online');
    switcher.connectOnItsOwn();
    expect(atem(await online)).toMatchObject({ connection: 'online', problems: [] });
    clock.advance(RETRY_MS * 2);
    expect(switcher.connects).toBe(1);
    expect(atem(await settled())).toMatchObject({ connection: 'online', problems: [], state: ['Program: Pro'] });
  });

  it('connects once per pause when it gives up while a connect again is pending', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher();
    switcher.failConnects(1, SOCKET);
    const { atem, next } = await atemRig(switcher, { armed: false, online: false, clock });

    const gaveUp = next((snapshot) => atem(snapshot)?.problems[0] === REASON);
    switcher.respawnFailingReconnect(GAVE_UP);
    await gaveUp;
    clock.advance(RETRY_MS);
    expect(switcher.connects).toBe(2);
    clock.advance(RETRY_MS * 3);
    expect(switcher.connects).toBe(2);
  });

  it('drops its reason and connects no more once a connect again resolves after it gives up while that connect is in flight', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = manualClock();
    const switcher = fakeSwitcher({ online: false });
    switcher.failConnects(1, SOCKET);
    const { atem, next, settled } = await atemRig(switcher, { armed: false, online: false, clock });

    const release = switcher.holdConnects();
    clock.advance(RETRY_MS);
    expect(switcher.connects).toBe(2);
    const gaveUp = next((snapshot) => atem(snapshot)?.problems[0] === REASON);
    switcher.respawnFailingReconnect(GAVE_UP);
    await gaveUp;
    const resolved = next((snapshot) => atem(snapshot)?.problems.length === 0);
    release();
    await resolved;
    clock.advance(RETRY_MS * 3);
    expect(switcher.connects).toBe(2);
    expect(atem(await settled())).toMatchObject({ connection: 'offline', problems: [] });
  });

  it('connects no more once the server stops during the pause', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { sees } = await atemRig(switcher, { armed: false, clock });
    const offline = sees('offline');
    switcher.respawnFailingReconnect(GAVE_UP);
    await offline;

    await rig?.close();
    rig = undefined;
    clock.advance(RETRY_MS * 2);

    expect(switcher.connects).toBe(1);
    expect(switcher.closed).toBe(true);
  });

  it('connects no more when it gives up after the server stops', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    await atemRig(switcher, { armed: false, clock });

    await rig?.close();
    rig = undefined;
    switcher.respawnFailingReconnect(GAVE_UP);
    clock.advance(RETRY_MS * 2);

    expect(switcher.connects).toBe(1);
  });
});

describe('a restart of the socket process that fails outright', () => {
  // The reason the switcher client gives when the library's socket process could not restart.
  const FAILED = 'Timeout when trying to restart after 1000';
  const REASON = `The ATEM could not connect: ${FAILED}.`;
  // The pause before the ATEM connects again.
  const RETRY_MS = 5000;

  it('shows its reason on the row within one report, and connects again after a pause', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, sees, settled } = await atemRig(switcher, { armed: false, clock });
    expect(switcher.connects).toBe(1);

    const offline = sees('offline');
    const gaveUp = next((snapshot) => atem(snapshot)?.problems[0] === REASON);
    switcher.restartFailsOutright(FAILED);
    await offline;
    expect(atem(await gaveUp)?.connection).toBe('offline');
    expect(atem(await settled())).toMatchObject({ connection: 'offline', problems: [REASON], state: [] });
    clock.advance(RETRY_MS - 1);
    expect(switcher.connects).toBe(1);
    clock.advance(1);
    expect(switcher.connects).toBe(2);
  });

  it('comes online and drops its reason once the connect again resolves, and connects no more', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, sees, settled } = await atemRig(switcher, { armed: false, clock });
    const gaveUp = next((snapshot) => atem(snapshot)?.problems[0] === REASON);
    switcher.restartFailsOutright(FAILED);
    await gaveUp;

    const online = sees('online');
    clock.advance(RETRY_MS);
    await online;
    expect(atem(await settled())).toMatchObject({ connection: 'online', problems: [], state: ['Program: Pro'] });
    clock.advance(RETRY_MS * 3);
    expect(switcher.connects).toBe(2);
  });
});

describe('an unreachable ATEM', () => {
  it('shows Offline with no reason, is not connected again, and comes online when it appears', async () => {
    const clock = manualClock();
    const switcher = fakeSwitcher({ online: false });
    const { first, atem, sees } = await atemRig(switcher, { armed: false, online: false, clock });
    expect(atem(first)).toMatchObject({ connection: 'offline', problems: [] });

    clock.advance(5000 * 3);
    expect(switcher.connects).toBe(1);
    const online = sees('online');
    switcher.goOnline();
    expect(atem(await online)).toMatchObject({ connection: 'online', problems: [] });
  });
});

describe("the ATEM's pre-service check", () => {
  const MODEL = 'Model: ATEM Mini, firmware 8.1.1.';
  const device = (problems: string[], notes = [MODEL]) => ({ kind: 'device', problems, notes });
  const checked = (row: Connection | undefined) => row !== undefined && row.check.kind !== 'not-checked';
  // The ATEM row's check once it has answered: from the producer's latest snapshot when that holds
  // it, or else from the next snapshot that does.
  const checkOf = async ({ atem, next, settled }: Awaited<ReturnType<typeof atemRig>>) => {
    const latest = await settled();
    const row = checked(atem(latest)) ? atem(latest) : atem(await next((snapshot) => checked(atem(snapshot))));
    return row?.check;
  };

  // The default fake holds the ATEM Mini's own sources beside its four external inputs, so a good
  // config is checked against them too.
  it('names the model and firmware only on a good config, on the producer row and the setup screen', async () => {
    const switcher = fakeSwitcher();
    const atemRow = await atemRig(switcher, { armed: false });

    expect(await checkOf(atemRow)).toEqual(device([]));
    const status = await rig!.connectionsStatus(({ connections }) => checked(connections.find((row) => row.name === 'atem')));
    expect(status.connections.find((row) => row.name === 'atem')?.check).toEqual(device([]));
  });

  it("gives a line for a configured input that is one of the ATEM's own sources, by its name, beside the model and firmware", async () => {
    const switcher = fakeSwitcher();
    const atemRow = await atemRig(switcher, { armed: false, config: ATEM_CAMERA_COLOR_BARS });

    const camera = device(['Camera is input 1000, which is Color Bars, not a camera or video input.']);
    expect(await checkOf(atemRow)).toEqual(camera);
    const status = await rig!.connectionsStatus(({ connections }) => checked(connections.find((row) => row.name === 'atem')));
    expect(status.connections.find((row) => row.name === 'atem')?.check).toEqual(camera);
  });

  it('gives the same line for Pro on a media player', async () => {
    const switcher = fakeSwitcher();
    const atemRow = await atemRig(switcher, { armed: false, config: ATEM_PRO_MEDIA_PLAYER });

    const pro = device(['Pro is input 3010, which is Media Player 1, not a camera or video input.']);
    expect(await checkOf(atemRow)).toEqual(pro);
    const status = await rig!.connectionsStatus(({ connections }) => checked(connections.find((row) => row.name === 'atem')));
    expect(status.connections.find((row) => row.name === 'atem')?.check).toEqual(pro);
  });

  it('gives a line for a configured input the ATEM does not have, beside the model and firmware', async () => {
    const switcher = fakeSwitcher({ inputs: [1, 3, 4] });
    const atemRow = await atemRig(switcher, { armed: false });

    const camera = device(['Camera is input 2, which this ATEM does not have.']);
    expect(await checkOf(atemRow)).toEqual(camera);
    const status = await rig!.connectionsStatus(({ connections }) => checked(connections.find((row) => row.name === 'atem')));
    expect(status.connections.find((row) => row.name === 'atem')?.check).toEqual(camera);
  });

  it('gives a line for each configured input the ATEM does not have, Pro first', async () => {
    const switcher = fakeSwitcher({ inputs: [3, 4] });
    const atemRow = await atemRig(switcher, { armed: false });

    expect(await checkOf(atemRow)).toEqual(device(['Pro is input 1, which this ATEM does not have.', 'Camera is input 2, which this ATEM does not have.']));
  });

  it("runs again on the producer's Refresh", async () => {
    const switcher = fakeSwitcher();
    const atemRow = await atemRig(switcher, { armed: false });
    expect(await checkOf(atemRow)).toEqual(device([]));

    switcher.setInputs([1]);
    const camera = device(['Camera is input 2, which this ATEM does not have.']);
    const refreshed = atemRow.next((snapshot) => JSON.stringify(atemRow.atem(snapshot)?.check) === JSON.stringify(camera));
    await atemRow.press({ kind: 'refresh' });
    expect(atemRow.atem(await refreshed)?.check).toEqual(camera);
  });

  it('is not checked while offline, and runs again once the ATEM is back online', async () => {
    const switcher = fakeSwitcher();
    const atemRow = await atemRig(switcher, { armed: false });
    expect(await checkOf(atemRow)).toEqual(device([]));

    switcher.setInfo({ model: 'ATEM Mini Pro', version: '9.6' });
    const offline = atemRow.sees('offline');
    switcher.goOffline();
    expect(atemRow.atem(await offline)?.check).toEqual({ kind: 'not-checked' });

    const pro = device([], ['Model: ATEM Mini Pro, firmware 9.6.']);
    const back = atemRow.next((snapshot) => JSON.stringify(atemRow.atem(snapshot)?.check) === JSON.stringify(pro));
    switcher.goOnline();
    expect(atemRow.atem(await back)?.check).toEqual(pro);
  });
});

describe('a bad ATEM section', () => {
  it('disables only the ATEM, with its problem on the row and the setup screen, and the other target still starts', async () => {
    const switcher = fakeSwitcher();
    const target = fakeTarget({ name: 'fake', label: 'Fake' });
    rig = await startRig(TWO_SONGS, { playing: false, position: 12 }, {
      connectionsConfig: ATEM_BAD_SECTION,
      targetKinds: { fake: fakeKind(target), atem: atemKind({ client: () => switcher }) },
    });
    const producer = await rig.connectProducer();

    const snapshot = await producer.snapshot((snapshot) => loaded(snapshot) && rowOf(snapshot, 'fake')?.connection === 'online');

    const disabled = { name: 'atem', label: 'ATEM', configured: false, problems: ['The ATEM\'s "pro" and "camera" must be different inputs.'], connection: 'offline', arm: 'disarmed' };
    expect(snapshot.connections).toMatchObject([{ name: 'fake', configured: true, connection: 'online' }, disabled]);
    expect(await rig.connectionsStatus()).toMatchObject({ config: 'loaded', problems: [], connections: [{ name: 'fake', configured: true }, disabled] });
    expect(switcher.host).toBeNull();
  });
});

describe('the ATEM section', () => {
  const create = (section: Record<string, unknown>) => atemKind({ client: () => fakeSwitcher() }).create(section);
  const HOST = 'The ATEM\'s "host" must be its address, such as "192.168.10.240".';
  const PRO = 'The ATEM\'s "pro" must be the input number of the Pro feed, a whole number such as 1.';
  const CAMERA_PROBLEM = 'The ATEM\'s "camera" must be the input number of the camera, a whole number such as 2.';

  it('builds the ATEM target, with its Pro and Camera buttons, from a good section', () => {
    const made = create({ host: '192.168.10.240', pro: 1, camera: 2 });

    expect('target' in made && made.target).toMatchObject({ name: 'atem', label: 'ATEM', pausesOnFade: false, buttons: BUTTONS });
  });

  it.each([
    ['no host', { pro: 1, camera: 2 }, [HOST]],
    ['an empty host', { host: ' ', pro: 1, camera: 2 }, [HOST]],
    ['a host that is not a string', { host: 192, pro: 1, camera: 2 }, [HOST]],
    ['no pro', { host: '10.0.0.2', camera: 2 }, [PRO]],
    ['a pro that is not whole', { host: '10.0.0.2', pro: 1.5, camera: 2 }, [PRO]],
    ['a pro of 0', { host: '10.0.0.2', pro: 0, camera: 2 }, [PRO]],
    ['a pro as a string', { host: '10.0.0.2', pro: '1', camera: 2 }, [PRO]],
    ['a negative camera', { host: '10.0.0.2', pro: 1, camera: -2 }, [CAMERA_PROBLEM]],
    ['no camera', { host: '10.0.0.2', pro: 1 }, [CAMERA_PROBLEM]],
    ['pro the same as camera', { host: '10.0.0.2', pro: 3, camera: 3 }, ['The ATEM\'s "pro" and "camera" must be different inputs.']],
    ['nothing', {}, [HOST, PRO, CAMERA_PROBLEM]],
  ])('rejects %s', (_, section, problems) => {
    expect(create(section)).toEqual({ problems });
  });
});

describe('how late the ATEM gets and acts on a cue', () => {
  const NOT_MEASURED: Connection['lateness'] = { last: null, median: null, acted: null, actedMedian: null };

  it("measures a Count Off alone: a Chorus, a Verse and a song's End change neither its row's lateness nor the log", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { lateness, play } = await atemRig(switcher, { latenessLog: { path } });

    // Each move lands less than two beats past the cue, so the server knows when its beat was due, and
    // with its clock still the cue is that far late: half a beat past song 1's Chorus at 24 is 250 ms.
    await play(12.5, 24.5);
    expect(await lateness()).toEqual(NOT_MEASURED);
    // A quarter beat past song 1's End and song 2's Count Off, both at 40.
    await play(15.75, 40.25);
    expect((await lateness()).last).toBe(125);
    // Half a beat past song 2's Verse at 48, and three quarters past its End at 64.
    await play(8.25, 48.5);
    await play(16.25, 64.75);
    expect((await lateness())).toMatchObject({ last: 125, median: 125 });

    await rig!.close();
    rig = undefined;
    expect((await linesOf(path)).map((line) => [line.target, line.section])).toEqual([['atem', 'Count Off']]);
  });

  // The ATEM's line in the log for song 2's Count Off, but for its wall-clock time.
  const countOffLine = (lateMs: number, actedMs: number | null) => ({ target: 'atem', song: 2, title: 'Trust', section: 'Count Off', cause: 'played-into', lateMs, actedMs });
  const withoutTime = (lines: Record<string, unknown>[]) => lines.map((line) => Object.fromEntries(Object.entries(line).filter(([key]) => key !== 'time')));

  it("acts on a Count Off when the switcher reports its cut to Camera, as its row's acted-on time and the line's actedMs, the End before it in the same move unmeasured", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { atem, next, lateness, play } = await atemRig(switcher, { latenessLog: { path } });

    switcher.holdEchoes();
    // From song 1's Verse at 12 to a quarter beat past song 1's End and song 2's Count Off, both at
    // 40: handed 125 ms late.
    await play(28.25, 40.25);
    expect(switcher.programs).toEqual([CAMERA]);
    await rig!.advanceConnected(300);
    const acted = next((snapshot) => atem(snapshot)?.lateness.acted !== null);
    switcher.releaseEchoes();
    await acted;
    expect(await lateness()).toEqual({ last: 125, median: 125, acted: 425, actedMedian: 425 });

    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOffLine(125, 425)]);
  });

  it('acts on a Count Off as it is handed over when the report of its cut comes at once', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { lateness, play } = await atemRig(switcher, { latenessLog: { path } });

    await play(28.25, 40.25);
    expect(await lateness()).toEqual({ last: 125, median: 125, acted: 125, actedMedian: 125 });

    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([countOffLine(125, 125)]));
  });

  it("never acts on a cut the producer's Pro or Camera button makes, nor writes a line for it", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { lateness, play, press } = await atemRig(switcher, { latenessLog: { path } });

    // Half a beat past song 1's Chorus at 24, a cue the ATEM does not act on.
    await play(12.5, 24.5);
    await press({ kind: 'run-button', target: 'atem', button: 'pro' });
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    expect(switcher.programs).toEqual([PRO, CAMERA]);
    expect(await lateness()).toEqual(NOT_MEASURED);

    await rig!.close();
    rig = undefined;
    expect(await linesOf(path)).toEqual([]);
  });

  it("never takes the report of a button's cut to Camera for a Count Off's cut whose report did not come within 2 seconds", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, lateness, play, press, sees } = await atemRig(switcher, { clock, latenessLog: { path } });

    switcher.holdEchoes();
    await play(28.25, 40.25);
    clock.advance(2001);
    await press({ kind: 'run-button', target: 'atem', button: 'camera' });
    // The first report of Camera is the button's cut, and the second changes nothing on program.
    const camera = next((snapshot) => atem(snapshot)?.state[0] === 'Program: Camera');
    switcher.releaseEchoes();
    expect(atem(await camera)).toMatchObject({ arm: 'armed', pause: null });
    expect(await lateness()).toEqual({ last: 125, median: 125, acted: null, actedMedian: null });

    const offline = sees('offline');
    switcher.goOffline();
    await offline;
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([countOffLine(125, null)]));
  });

  it('never acts on a cut made at the ATEM, which still pauses it, and the Count Off waiting on its report goes out with null', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { atem, next, lateness, play, sees } = await atemRig(switcher, { latenessLog: { path } });

    switcher.holdEchoes();
    await play(28.25, 40.25);
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.cutAtSwitcher(4);
    expect(atem(await paused)).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Input 4'] });
    expect(await lateness()).toEqual({ last: 125, median: 125, acted: null, actedMedian: null });

    const offline = sees('offline');
    switcher.goOffline();
    await offline;
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([countOffLine(125, null)]));
  });

  it("never acts on a Count Off whose cut the switcher client refuses, whose line goes out with null", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { lateness, play, sees } = await atemRig(switcher, { latenessLog: { path } });

    switcher.refuseCuts();
    await play(28.25, 40.25);
    expect(switcher.programs).toEqual([CAMERA]);
    expect(await lateness()).toEqual({ last: 125, median: 125, acted: null, actedMedian: null });

    const offline = sees('offline');
    switcher.goOffline();
    await offline;
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([countOffLine(125, null)]));
  });

  it('never acts on a Count Off whose report comes more than 2 seconds after its cut, which pauses it as a change by hand', async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const clock = manualClock();
    const switcher = fakeSwitcher();
    const { atem, next, lateness, play, sees } = await atemRig(switcher, { clock, latenessLog: { path } });

    switcher.holdEchoes();
    await play(28.25, 40.25);
    clock.advance(2001);
    const paused = next((snapshot) => atem(snapshot)?.pause === 'by-hand');
    switcher.releaseEchoes();
    expect(atem(await paused)).toMatchObject({ arm: 'paused', pause: 'by-hand', state: ['Program: Camera'] });
    expect(await lateness()).toEqual({ last: 125, median: 125, acted: null, actedMedian: null });

    const offline = sees('offline');
    switcher.goOffline();
    await offline;
    await vi.waitFor(async () => expect(withoutTime(await linesOf(path))).toEqual([countOffLine(125, null)]));
  });

  it("keeps a Count Off waiting on its report when song 2's Verse is handed over, and acts on it when the report comes", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { atem, next, lateness, play } = await atemRig(switcher, { latenessLog: { path } });

    switcher.holdEchoes();
    await play(28.25, 40.25);
    await play(8, 48.25);
    await rig!.advanceConnected(300);
    const acted = next((snapshot) => atem(snapshot)?.lateness.acted !== null);
    switcher.releaseEchoes();
    await acted;
    expect(await lateness()).toEqual({ last: 125, median: 125, acted: 425, actedMedian: 425 });

    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOffLine(125, 425)]);
  });

  it("writes no line for Fire again in song 2's Verse", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { play, press } = await atemRig(switcher, { latenessLog: { path } });

    await play(28.25, 40.25);
    await play(8, 48.25);
    await press({ kind: 'fire-again', target: 'atem' });

    await rig!.close();
    rig = undefined;
    expect(withoutTime(await linesOf(path))).toEqual([countOffLine(125, 125)]);
  });

  it("writes no line for a drag to the middle of song 1's Chorus", async () => {
    const path = join(await newLogDir(), 'cue-lateness.log');
    const switcher = fakeSwitcher();
    const { next } = await atemRig(switcher, { latenessLog: { path } });

    const dragged = next((snapshot) => near(snapshot.position, 32));
    rig!.live.setPosition(32);
    await dragged;

    await rig!.close();
    rig = undefined;
    expect(await linesOf(path)).toEqual([]);
  });
});
