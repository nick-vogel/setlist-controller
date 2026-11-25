import { request } from 'node:http';
import { resolve } from 'node:path';
import type { NetworkInterfaceInfo } from 'node:os';
import jsqr from 'jsqr';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { SETUP_CONNECTIONS_API, SETUP_DEVICES_API, SETUP_PEDAL_API, SETUP_REFRESH_API, SETUP_REFUSED } from '../src/shared/routes.ts';
import type { SetupInfo } from '../src/shared/setup.ts';
import { fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

// The laptop's network interfaces as a test sets them, or the real ones when it sets none.
const host = vi.hoisted(() => ({ interfaces: undefined as Record<string, NetworkInterfaceInfo[]> | undefined }));
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, networkInterfaces: () => host.interfaces ?? os.networkInterfaces() };
});

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  host.interfaces = undefined;
});

// jsqr is CommonJS that sets exports.default, so under Node's interop the function sits one level down.
const jsQR = jsqr.default;

const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 16 },
];
const CUE_POINTS = '/live/song/get/cue_points';
const PEDAL_CONFIG = resolve(import.meta.dirname, 'fixtures/pedal/default.json');
const JUMP = '/live/song/cue_point/jump';

// A GET from the given local address, with no keep-alive, so closing the server does not wait on
// an idle connection.
function get(port: number, path: string, localAddress = '127.0.0.1', method = 'GET'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, method, localAddress, agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.once('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

// Draws the code's modules as pixels, dark modules black, and reads it back as a phone camera would.
function decodeQr(modules: boolean[][]): string | undefined {
  const scale = 4;
  const size = modules.length * scale;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const shade = modules[Math.floor(y / scale)]?.[Math.floor(x / scale)] ? 0 : 255;
      pixels.set([shade, shade, shade, 255], (y * size + x) * 4);
    }
  }
  return jsQR(pixels, size, size)?.data;
}

async function setupInfo(): Promise<SetupInfo> {
  rig = await startRig(SET);
  const { status, body } = await get(rig.server.httpPort, '/api/setup');
  expect(status).toBe(200);
  return JSON.parse(body) as SetupInfo;
}

function ipv4(address: string): NetworkInterfaceInfo {
  return { address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: `${address}/24` };
}

// The laptop's own address on the stage network, or setlist.local when it has none.
const LAPTOP_HOST = /^(?!127\.)\d+\.\d+\.\d+\.\d+$|^setlist\.local$/;

describe('the setup screen', () => {
  it("shows a QR code that opens the leader page, secret included, on the laptop's server", async () => {
    const { leader } = await setupInfo();

    const decoded = decodeQr(leader.qr);
    expect(decoded).toBe(leader.url);
    const url = new URL(decoded ?? '');
    expect(url.hostname).toMatch(LAPTOP_HOST);
    expect(url.port).toBe(String(rig?.server.httpPort));
    expect(url.pathname).toBe(`/leader/${rig?.leaderSecret}`);
  });

  it("shows a QR code that opens the producer page, its own secret included, on the laptop's server", async () => {
    const { leader, producer } = await setupInfo();

    const decoded = decodeQr(producer.qr);
    expect(decoded).toBe(producer.url);
    const url = new URL(decoded ?? '');
    expect(url.host).toBe(new URL(leader.url).host);
    expect(url.pathname).toBe(`/producer/${rig?.producerSecret}`);
  });

  it('shows a QR code that opens the view-only page on the same server', async () => {
    const { leader, view } = await setupInfo();

    const decoded = decodeQr(view.qr);
    expect(decoded).toBe(view.url);
    const url = new URL(decoded ?? '');
    expect(url.host).toBe(new URL(leader.url).host);
    expect(url.pathname).toBe('/');
  });

  it('lists the setlist.local form of each URL beside the code', async () => {
    const { leader, producer, view } = await setupInfo();
    const port = rig?.server.httpPort;

    expect(leader.urls).toContain(`http://setlist.local:${port}/leader/${rig?.leaderSecret}`);
    expect(producer.urls).toContain(`http://setlist.local:${port}/producer/${rig?.producerSecret}`);
    expect(view.urls).toContain(`http://setlist.local:${port}/`);
    expect(leader.urls).toContain(leader.url);
    expect(producer.urls).toContain(producer.url);
    expect(view.urls).toContain(view.url);
  });

  // An interface listed before the stage network's must not take the code: a self-assigned address
  // with no DHCP answer, a VPN, or a virtual machine's bridge opens nothing on a band phone.
  it.each([
    ['a self-assigned address', { en5: [ipv4('169.254.12.34')], en0: [ipv4('192.168.1.20')] }, '192.168.1.20'],
    ['a VPN address', { utun4: [ipv4('100.101.102.103')], en0: [ipv4('192.168.1.20')] }, '192.168.1.20'],
    ['a virtual machine bridge', { bridge100: [ipv4('192.168.64.1')], en0: [ipv4('10.0.0.5')] }, '10.0.0.5'],
    ['a lone self-assigned address', { en0: [ipv4('169.254.12.34')] }, 'setlist.local'],
  ])('keeps %s out of the QR code', async (_, interfaces, expected) => {
    host.interfaces = { lo0: [{ ...ipv4('127.0.0.1'), internal: true }], ...interfaces };
    const { leader, producer, view } = await setupInfo();

    expect(new URL(decodeQr(leader.qr) ?? '').hostname).toBe(expected);
    expect(new URL(decodeQr(producer.qr) ?? '').hostname).toBe(expected);
    expect(new URL(decodeQr(view.qr) ?? '').hostname).toBe(expected);
  });

  // Only Linux routes all of 127.0.0.0/8 to the loopback by default, so only there can a test
  // send from an address other than the server's. CI runs on Linux.
  it.runIf(process.platform === 'linux')('refuses the join codes to any machine but the laptop', async () => {
    rig = await startRig(SET);

    const refused = await get(rig.server.httpPort, '/api/setup', '127.0.0.2');
    expect(refused).toEqual({ status: 403, body: `${SETUP_REFUSED}\n` });
    expect(refused.body).not.toContain(rig.leaderSecret);
    expect(refused.body).not.toContain(rig.producerSecret);
  });

  it.runIf(process.platform === 'linux')('refuses the foot pedal status to any machine but the laptop', async () => {
    rig = await startRig(SET, {}, { pedalConfig: PEDAL_CONFIG });

    const refused = await get(rig.server.httpPort, SETUP_PEDAL_API, '127.0.0.2');
    expect(refused).toEqual({ status: 403, body: `${SETUP_REFUSED}\n` });
    const answered = await get(rig.server.httpPort, SETUP_PEDAL_API, '127.0.0.1');
    expect(answered.status).toBe(200);
    expect(answered.body).toContain(PEDAL_CONFIG);
  });

  it('answers the foot pedal status only to a GET or a HEAD', async () => {
    rig = await startRig(SET, {}, { pedalConfig: PEDAL_CONFIG });

    expect((await get(rig.server.httpPort, SETUP_PEDAL_API, '127.0.0.1', 'POST')).status).toBe(405);
    expect(await get(rig.server.httpPort, SETUP_PEDAL_API, '127.0.0.1', 'HEAD')).toEqual({ status: 200, body: '' });
    expect(JSON.parse((await get(rig.server.httpPort, SETUP_PEDAL_API)).body)).toMatchObject({ configPath: PEDAL_CONFIG, config: 'loaded' });
  });

  it("lists each target's label and pre-service check for the laptop", async () => {
    const propresenter = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    const lights = fakeTarget({ name: 'lights', label: 'Lights' });
    propresenter.setUnmatched(['Intro']);
    propresenter.setNotes(['Verse: no group Verse, clears']);
    rig = await startRig(SET, {}, { targets: [propresenter, lights] });

    const { connections: rows } = await rig.connectionsStatus(({ connections }) => connections.every((row) => row.check.kind !== 'not-checked'));

    expect(rows.map(({ label, check }) => ({ label, check }))).toEqual([
      { label: 'ProPresenter', check: { kind: 'unmatched', names: ['Intro'], problems: [], notes: ['Verse: no group Verse, clears'] } },
      { label: 'Lights', check: { kind: 'matched', passText: 'Every song and section matches.', notes: [] } },
    ]);
  });

  it("answers the connections' checks only to a GET or a HEAD", async () => {
    rig = await startRig(SET, {}, { targets: [fakeTarget({ name: 'propresenter', label: 'ProPresenter' })] });

    expect((await get(rig.server.httpPort, SETUP_CONNECTIONS_API, '127.0.0.1', 'POST')).status).toBe(405);
    expect(await get(rig.server.httpPort, SETUP_CONNECTIONS_API, '127.0.0.1', 'HEAD')).toEqual({ status: 200, body: '' });
    expect((await get(rig.server.httpPort, SETUP_CONNECTIONS_API)).body).toContain('ProPresenter');
  });

  it.runIf(process.platform === 'linux')("refuses the connections' checks to any machine but the laptop", async () => {
    rig = await startRig(SET, {}, { targets: [fakeTarget({ name: 'propresenter', label: 'ProPresenter' })] });

    const refused = await get(rig.server.httpPort, SETUP_CONNECTIONS_API, '127.0.0.2');
    expect(refused).toEqual({ status: 403, body: `${SETUP_REFUSED}\n` });
    const answered = await get(rig.server.httpPort, SETUP_CONNECTIONS_API, '127.0.0.1');
    expect(answered.status).toBe(200);
    expect(answered.body).toContain('ProPresenter');
  });

  it.runIf(process.platform === 'linux')('refuses the devices to any machine but the laptop', async () => {
    rig = await startRig(SET, {});
    const phone = await rig.connectViewer();
    phone.send({ kind: 'hello', client: 'phone', name: 'Keys', battery: null });
    await rig.devices((devices) => devices.length === 1);

    expect(await get(rig.server.httpPort, SETUP_DEVICES_API, '127.0.0.2')).toEqual({ status: 403, body: `${SETUP_REFUSED}\n` });
  });

  it.runIf(process.platform === 'linux')("refuses the setup screen's Refresh to any machine but the laptop", async () => {
    const reads = await setChangedInLive();

    expect((await get(rig!.server.httpPort, SETUP_REFRESH_API, '127.0.0.2', 'POST')).status).toBe(403);
    await leaderBarrier();
    expect(rig?.received(CUE_POINTS)).toHaveLength(reads);
    expect((await get(rig!.server.httpPort, SETUP_REFRESH_API, '127.0.0.1', 'POST')).status).toBe(204);
    await vi.waitFor(() => expect(rig?.received(CUE_POINTS)).toHaveLength(reads + 1));
  });
});

// A leader jump leaves the server's one OSC socket after any read a request before it could have
// sent, so once Live has it, Live has every such read.
async function leaderBarrier() {
  const leader = await rig!.connectLeader();
  leader.send({ kind: 'jump', song: 1, section: 0 });
  await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));
}

// Starts the rig, waits for the set it starts with, then adds a locator in Live that only a read
// will show. Returns how many reads Live has had.
async function setChangedInLive() {
  rig = await startRig(SET);
  const viewer = await rig.connectViewer();
  await viewer.snapshot(loaded);
  rig.live.setCuePoints([...SET, { name: '1 - Verse', time: 8 }]);
  return rig.received(CUE_POINTS).length;
}

describe("the setup screen's Refresh", () => {
  it('reads the set from Live again at once', async () => {
    const reads = await setChangedInLive();
    const viewer = await rig!.connectViewer();

    expect((await get(rig!.server.httpPort, SETUP_REFRESH_API, '127.0.0.1', 'POST')).status).toBe(204);
    await viewer.snapshot((snapshot) => snapshot.set?.songs[0]?.sections.length === 2);
    expect(rig?.received(CUE_POINTS)).toHaveLength(reads + 1);
  });

  it('answers only a POST', async () => {
    const reads = await setChangedInLive();
    const viewer = await rig!.connectViewer();

    expect((await get(rig!.server.httpPort, SETUP_REFRESH_API)).status).toBe(405);
    await leaderBarrier();
    expect(rig?.received(CUE_POINTS)).toHaveLength(reads);
    expect((await get(rig!.server.httpPort, SETUP_REFRESH_API, '127.0.0.1', 'POST')).status).toBe(204);
    await viewer.snapshot((snapshot) => snapshot.set?.songs[0]?.sections.length === 2);
    expect(rig?.received(CUE_POINTS)).toHaveLength(reads + 1);
  });
});
