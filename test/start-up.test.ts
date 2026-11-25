import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFakeLive, type CuePoint, type FakeLive } from '../src/fake-live/fake-live.ts';
import type { Advert, Advertiser } from '../src/server/advertise.ts';
import type { TargetKind } from '../src/server/connections-config.ts';
import { serverJob } from '../src/install/server-job.ts';
import { DEFAULT_LATENESS_LOG, openLatenessLog } from '../src/server/lateness-log.ts';
import { manualMidiInput, noMidiInput, type MidiInput } from '../src/server/midi-input.ts';
import { manualPowerSource, type PowerSource } from '../src/server/power.ts';
import type { Server } from '../src/server/server.ts';
import { laptopAddress } from '../src/server/setup.ts';
import { startUp } from '../src/server/start-up.ts';
import { CHARTS_API, producerSocketPath, SETUP_CONNECTIONS_API, SETUP_PEDAL_API } from '../src/shared/routes.ts';
import { SET_MANIFEST_FILE, type SetCharts } from '../src/shared/set-manifest.ts';
import type { ConnectionsStatus, PedalStatus } from '../src/shared/setup.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { startFakeProPresenter, writeProPresenterConfig, type FakeProPresenter } from './fake-propresenter.ts';
import { connect, readSetup, type Client } from './harness.ts';

// The wiring main.ts runs at start-up, called with stand-ins for the native loaders and for dns-sd,
// on ports the OS assigns, with the settings folder inside the worktree's dist. Nothing here binds
// 11000 or 11001, writes under ~/Library, or runs dns-sd.

// The lateness log has no route, and its file appears only on a first write, so the path the server
// opened it at is read from a spy that still opens the real log.
vi.mock('../src/server/lateness-log.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lateness-log.ts')>();
  return { ...real, openLatenessLog: vi.fn(real.openLatenessLog) };
});

const REPO_ROOT = resolve(import.meta.dirname, '..');
// The ATEM's section: host 192.168.10.240, Pro on input 1, Camera on input 2.
const ATEM = resolve(import.meta.dirname, 'fixtures/connections/atem.json');
const ATEM_REASON = 'The stand-in ATEM kind takes no section.';
// The fake kind's section good, and the lights' with no host and cue list 0.
const EOS_BAD_SECTION = resolve(import.meta.dirname, 'fixtures/connections/eos-bad-section.json');
// Made Up Song, with a chart, and Short Song, with none.
const SET_MANIFEST = resolve(import.meta.dirname, 'fixtures/set-manifest/set-manifest.json');

let started: { server: Server; advertiser: Advertiser } | undefined;
let live: FakeLive | undefined;
// The folder a test's settings and lateness log go in, never the OS temp folder or ~/Library.
let appSupport: string | undefined;
// A fake ProPresenter, the folder its connections config is written to, inside the worktree's dist,
// and the producer's connection, when a test makes them.
let pro: FakeProPresenter | undefined;
let configDir: string | undefined;
let producer: Client<ProducerSnapshot> | undefined;

afterEach(async () => {
  producer?.close();
  producer = undefined;
  started?.advertiser.close();
  await started?.server.close();
  started = undefined;
  await live?.close();
  live = undefined;
  vi.restoreAllMocks();
  vi.mocked(openLatenessLog).mockClear();
  if (appSupport) await rm(appSupport, { recursive: true, force: true });
  appSupport = undefined;
  await pro?.close();
  pro = undefined;
  if (configDir) await rm(configDir, { recursive: true, force: true });
  configDir = undefined;
});

type Natives = {
  loadAtemKind?: () => Promise<TargetKind>;
  openMidiInput?: () => Promise<MidiInput>;
  openPowerSource?: () => PowerSource;
};

// Starts the wiring with every port flag given, the fake Live's port to talk to and 0 for the rest, the
// lateness log in the test's folder, and the stand-ins given. The ATEM kind defaults to one whose
// every section is disabled with ATEM_REASON, the MIDI input to none, and the power source to one on
// mains power that the test sets by hand, so no test runs pmset. Extra flags go after these.
// `latenessLog: false` leaves the lateness log flag out, for the test of the path the server opens
// when no flag names one; that test queues a stand-in log first, since the default is under ~/Library.
async function start(natives: Natives = {}, flags: string[] = [], { latenessLog = true, cuePoints = [] }: { latenessLog?: boolean; cuePoints?: CuePoint[] } = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  appSupport = await mkdtemp(join(REPO_ROOT, 'dist/start-up-'));
  live = await startFakeLive({ cuePoints });
  const adverts: Advert[] = [];
  const lateness = latenessLog ? ['--lateness-log', join(appSupport, 'cue-lateness.log')] : [];
  const args = ['--http-port', '0', '--osc-send-port', String(live.port), '--osc-receive-port', '0', ...lateness, ...flags];
  started = await startUp(args, {
    appSupport,
    loadAtemKind: natives.loadAtemKind ?? (async () => ({ label: 'ATEM', create: () => ({ problems: [ATEM_REASON] }) })),
    openMidiInput: natives.openMidiInput ?? (async () => noMidiInput),
    register: (advert) => {
      adverts.push(advert);
      return { stop: () => {} };
    },
    openPowerSource: natives.openPowerSource ?? (() => manualPowerSource()),
  });
  return { ...started, appSupport, adverts };
}

describe('the target kinds the server starts with', () => {
  it('include the ATEM from the loader, so its row on the setup screen is the kind the loader gave', async () => {
    const loadAtemKind = vi.fn(async (): Promise<TargetKind> => ({ label: 'ATEM', create: () => ({ problems: [ATEM_REASON] }) }));
    const { server } = await start({ loadAtemKind }, ['--connections-config', ATEM]);

    const status = await readSetup<ConnectionsStatus>(server.httpPort, SETUP_CONNECTIONS_API, 'a connections status');

    expect(loadAtemKind).toHaveBeenCalledTimes(1);
    expect(status.connections).toEqual([
      expect.objectContaining({ name: 'atem', label: 'ATEM', configured: false, problems: [ATEM_REASON] }),
      expect.objectContaining({ name: 'charts', label: 'Charts', configured: true }),
      expect.objectContaining({ name: 'power', label: 'Playback Mac', configured: true }),
    ]);
  });

  // A bad section, so the lights never connect: no test reaches Eos.
  it('include the lights, so a lights section on the setup screen is the Lights row with its problems', async () => {
    const { server } = await start({}, ['--connections-config', EOS_BAD_SECTION]);

    const status = await readSetup<ConnectionsStatus>(server.httpPort, SETUP_CONNECTIONS_API, 'a connections status');

    expect(status.connections).toContainEqual(
      expect.objectContaining({
        name: 'eos',
        label: 'Lights',
        configured: false,
        problems: [
          'The lights\' "host" must be the Eos console\'s address, such as "192.168.10.50".',
          'The lights\' "cueList" must be the number of the cue list to follow, a whole number such as 1.',
        ],
      }),
    );
  });
});

describe('ProPresenter', () => {
  it('is a kind the server starts with, and a pick lands in propresenter-picks.json in the settings folder', async () => {
    pro = await startFakeProPresenter();
    await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
    configDir = await mkdtemp(join(REPO_ROOT, 'dist/start-up-propresenter-'));
    const config = await writeProPresenterConfig(configDir, pro.port);
    const cuePoints = [
      { name: '1 - Verse 1 (There Is Freedom)', time: 0 },
      { name: '1 - End', time: 16 },
    ];
    const { server, appSupport } = await start({}, ['--connections-config', config], { cuePoints });

    const status = await readSetup<ConnectionsStatus>(server.httpPort, SETUP_CONNECTIONS_API, 'a connections status');
    expect(status.connections).toEqual([
      expect.objectContaining({ name: 'propresenter', label: 'ProPresenter', configured: true }),
      expect.objectContaining({ name: 'charts', label: 'Charts', configured: true }),
      expect.objectContaining({ name: 'power', label: 'Playback Mac', configured: true }),
    ]);

    const secret = (await readFile(join(appSupport, 'producer-secret'), 'utf8')).trim();
    producer = await connect<ProducerSnapshot>(`ws://127.0.0.1:${server.httpPort}${producerSocketPath(secret)}`);
    const listed = (snapshot: ProducerSnapshot) => snapshot.set !== null && snapshot.connections[0]?.connection === 'online' && (snapshot.connections[0]?.pick?.options.length ?? 0) > 0;
    await producer.snapshot(listed);
    producer.send({ kind: 'pick', target: 'propresenter', choice: '49F3C197-E743-45AB-8670-C53959B82BDC' });

    await vi.waitFor(async () => {
      const picks = JSON.parse(await readFile(join(appSupport, 'propresenter-picks.json'), 'utf8')) as unknown;
      expect(picks).toEqual({
        sets: [{ songs: [{ number: 1, title: 'There Is Freedom' }], playlist: { id: '49F3C197-E743-45AB-8670-C53959B82BDC', name: 'Series One - October 25, 2026' } }],
      });
    });
  });
});

describe('the MIDI input the server starts with', () => {
  it('is the one the loader opened, so the setup screen shows it ready and its messages reach the pedal', async () => {
    const midi = manualMidiInput();
    const { server } = await start({ openMidiInput: async () => midi });

    midi.send([0xb0, 0x50, 0x7f]);
    const status = await readSetup<PedalStatus>(server.httpPort, SETUP_PEDAL_API, 'a pedal status');

    expect(status.input).toEqual({ kind: 'ready' });
    expect(status.monitor.map((entry) => entry.message)).toEqual(['B0 50 7F']);
  });
});

describe('the start-up log', () => {
  // The secret start-up made in the folder, as the leader and producer lines carry it.
  const secretIn = async (folder: string, file: string) => (await readFile(join(folder, file), 'utf8')).trim();

  it('names the port, the pages, the OSC ports and the files the flags gave, in the order main.ts always printed them', async () => {
    const pedal = join(REPO_ROOT, 'dist/no-such-pedal.json');
    const { server, appSupport, adverts } = await start({}, ['--pedal-config', pedal, '--connections-config', ATEM, '--set-manifest', SET_MANIFEST]);
    const port = server.httpPort;
    const leader = await secretIn(appSupport, 'leader-secret');
    const producer = await secretIn(appSupport, 'producer-secret');

    expect(vi.mocked(console.log).mock.calls).toEqual([
      [`Setlist server on http://localhost:${port}`],
      [`Setup screen on http://localhost:${port}/setup, on this machine only`],
      [`Leader page on http://localhost:${port}/leader/${leader}`],
      [`Producer page on http://localhost:${port}/producer/${producer}`],
      [`Talking to Live on OSC port ${live?.port}, replies on 0`],
      [`Pedal config from ${pedal}`],
      [`Connections config from ${ATEM}`],
      [`Set manifest from ${SET_MANIFEST}`],
      [`Lateness log at ${join(appSupport, 'cue-lateness.log')}`],
    ]);
    expect(leader).toMatch(/^[0-9a-f]{32}$/);
    expect(producer).toMatch(/^[0-9a-f]{32}$/);
    expect(producer).not.toBe(leader);
    // setlist.local is advertised on the server's port, once the laptop has an address to give it.
    expect(adverts.map((advert) => advert.port)).toEqual(laptopAddress() === undefined ? [] : [port]);
    // The server got the files the lines name, not only the lines.
    expect((await readSetup<PedalStatus>(port, SETUP_PEDAL_API, 'a pedal status')).configPath).toBe(pedal);
    expect(vi.mocked(openLatenessLog)).toHaveBeenCalledExactlyOnceWith({ path: join(appSupport, 'cue-lateness.log') });
    expect((await readSetup<SetCharts>(port, CHARTS_API, 'the charts')).songs.map(({ title }) => title)).toEqual(['Made Up Song', 'Short Song']);
  });

  it('reads the pedal config and the connections config from the settings folder when no flag names them', async () => {
    const { server, appSupport } = await start();

    const lines = vi.mocked(console.log).mock.calls.map(([line]) => String(line));
    expect(lines).toContain(`Pedal config from ${appSupport}/pedal.json`);
    expect(lines).toContain(`Connections config from ${appSupport}/connections.json`);
    expect((await readSetup<PedalStatus>(server.httpPort, SETUP_PEDAL_API, 'a pedal status')).configPath).toBe(join(appSupport, 'pedal.json'));
  });

  it('reads the set manifest from the settings folder, beside the leader secret, when no flag names it', async () => {
    const { server, appSupport } = await start();
    const lines = vi.mocked(console.log).mock.calls.map(([line]) => String(line));
    expect(lines).toContain(`Set manifest from ${join(appSupport, SET_MANIFEST_FILE)}`);
    expect((await readSetup<SetCharts>(server.httpPort, CHARTS_API, 'the charts')).songs).toEqual([]);

    // A manifest written there is the one the server serves, and the folder is the leader secret's.
    await readFile(join(appSupport, 'leader-secret'), 'utf8');
    await copyFile(SET_MANIFEST, join(appSupport, SET_MANIFEST_FILE));
    await vi.waitFor(async () => {
      expect((await readSetup<SetCharts>(server.httpPort, CHARTS_API, 'the charts')).songs.map(({ title }) => title)).toEqual(['Made Up Song', 'Short Song']);
    });
  });

  it('adds the Charts row, whose check names the set manifest missing from the settings folder', async () => {
    const { server, appSupport } = await start();

    const status = await readSetup<ConnectionsStatus>(server.httpPort, SETUP_CONNECTIONS_API, 'a connections status');
    expect(status.connections.map(({ name }) => name)).toEqual(['charts', 'power']);
    await vi.waitFor(async () => {
      const charts = (await readSetup<ConnectionsStatus>(server.httpPort, SETUP_CONNECTIONS_API, 'a connections status')).connections[0];
      expect(charts?.check).toEqual({ kind: 'unmatched', names: [], problems: [`No set manifest at ${join(appSupport, SET_MANIFEST_FILE)}. pnpm build-set writes it.`], notes: [] });
    });
  });

  it('reads the power from the source it is handed, so every page and the Playback Mac row follow it', async () => {
    const power = manualPowerSource({ source: 'ac', percent: 100 });
    const { server, appSupport } = await start({ openPowerSource: () => power }, [], { cuePoints: [{ name: '1 - Intro', time: 0 }, { name: '1 - End', time: 16 }] });
    const secret = (await readFile(join(appSupport, 'producer-secret'), 'utf8')).trim();
    producer = await connect<ProducerSnapshot>(`ws://127.0.0.1:${server.httpPort}${producerSocketPath(secret)}`);

    power.set({ source: 'battery', percent: 95 });
    const snapshot = await producer.snapshot((given) => given.power.source === 'battery');
    expect(snapshot.power).toEqual({ source: 'battery', percent: 95 });
    await vi.waitFor(async () => {
      const row = (await readSetup<ConnectionsStatus>(server.httpPort, SETUP_CONNECTIONS_API, 'a connections status')).connections.find(({ name }) => name === 'power');
      expect(row?.check).toEqual({ kind: 'device', problems: ["On battery at 95%. Plug in the playback Mac's power before the set starts."], notes: [] });
    });
  });

  it("opens the lateness log beside the launchd job's server.log when no flag names it, where pnpm lateness reads", async () => {
    // A stand-in for the one log the server opens, so nothing can be written under ~/Library. No cue is
    // played in any case: the fake Live has no cue points.
    vi.mocked(openLatenessLog).mockImplementationOnce(() => ({ write: () => {}, close: async () => {} }));
    await start({}, [], { latenessLog: false });

    const lines = vi.mocked(console.log).mock.calls.map(([line]) => String(line));
    expect(vi.mocked(openLatenessLog)).toHaveBeenCalledExactlyOnceWith({ path: DEFAULT_LATENESS_LOG });
    expect(lines).toContain(`Lateness log at ${DEFAULT_LATENESS_LOG}`);
    // The server the launchd job starts passes no flag, and pnpm lateness with no --log reads the same
    // constant, so the constant must name cue-lateness.log beside the job's server.log, where
    // docs/install.md tells Nick to find it. Only the path is computed; nothing reads or writes there.
    const job = serverJob({ repoRoot: REPO_ROOT, nodePath: process.execPath, home: homedir() });
    expect(DEFAULT_LATENESS_LOG).toBe(join(dirname(job.StandardOutPath), 'cue-lateness.log'));
  });
});
