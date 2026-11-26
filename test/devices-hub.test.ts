import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Device } from '../src/shared/devices.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

// The hub's device registry over real sockets: each page's hello, the producer's Devices panel and the
// setup screen's list, the offline rows, Clear offline, and the producer's Reload. The reload of a
// socket on a congested link is in hub-coalescing.test.ts, beside the other slow-link cases.

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 16 },
];

const hello = (client: string, name: string, battery: number | null = null) => ({ kind: 'hello', client, name, battery });

const listing = (...clients: string[]) =>
  function listing(snapshot: ProducerSnapshot) {
    return loaded(snapshot) && snapshot.devices.map((device) => device.client).join() === clients.join();
  };

const row = (devices: Device[], client: string) => devices.find((device) => device.client === client);

async function producer(): Promise<Client<ProducerSnapshot>> {
  const client = await rig!.connectProducer();
  await client.snapshot(loaded);
  return client;
}

describe('a device that says hello', () => {
  it("is listed on the producer's snapshot by its name and battery, with the role of the socket it said hello on", async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const panel = await producer();
    const phone = await rig.connectViewer();
    const ipad = await rig.connectLeader();

    phone.send(hello('phone', 'Keys', 71));
    await phone.flush();
    ipad.send(hello('ipad', 'Leader'));

    const { devices } = await panel.snapshot(listing('phone', 'ipad'));
    expect(devices).toEqual([
      { client: 'phone', name: 'Keys', role: 'viewer', battery: 71, online: true, lastSeen: null },
      { client: 'ipad', name: 'Leader', role: 'leader', battery: null, online: true, lastSeen: null },
    ]);
  });

  it('sends the viewers and the leader nothing, since the devices are only on the producer snapshot', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const panel = await producer();
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await viewer.snapshot(loaded);
    await leader.snapshot(loaded);
    const [viewerBefore, leaderBefore] = [viewer.received.length, leader.received.length];

    viewer.send(hello('phone', 'Keys'));
    await panel.snapshot(listing('phone'));
    await viewer.flush();
    await leader.flush();

    expect(viewer.received.length).toBe(viewerBefore);
    expect(leader.received.length).toBe(leaderBefore);
  });

  it('is listed on the setup screen from the laptop, as the producer sees it', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const phone = await rig.connectViewer();

    phone.send(hello('phone', 'Bass', 12));

    expect(await rig.devices((devices) => devices.length === 1)).toEqual([
      { client: 'phone', name: 'Bass', role: 'viewer', battery: 12, online: true, lastSeen: null },
    ]);
  });

  it('stays listed offline, with the time its socket closed, once the socket closes', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const panel = await producer();
    const phone = await rig.connectViewer();
    phone.send(hello('phone', 'Keys'));
    await panel.snapshot(listing('phone'));
    const before = Date.now();

    phone.close();

    const { devices } = await panel.snapshot((snapshot) => row(snapshot.devices, 'phone')?.online === false);
    const lastSeen = row(devices, 'phone')!.lastSeen!;
    expect(lastSeen).toBeGreaterThanOrEqual(before);
    expect(lastSeen).toBeLessThanOrEqual(Date.now());
  });

  it('comes back online in its own row when it says hello on a fresh socket', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const panel = await producer();
    const first = await rig.connectViewer();
    first.send(hello('phone', 'Keys'));
    await panel.snapshot(listing('phone'));
    first.close();
    await panel.snapshot((snapshot) => row(snapshot.devices, 'phone')?.online === false);

    const again = await rig.connectViewer();
    again.send(hello('phone', 'Keys'));

    const { devices } = await panel.snapshot((snapshot) => row(snapshot.devices, 'phone')?.online === true);
    expect(devices).toHaveLength(1);
  });
});

describe('Clear offline', () => {
  it("forgets the offline devices on the producer's command and keeps the online ones", async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const panel = await producer();
    const gone = await rig.connectViewer();
    const here = await rig.connectViewer();
    gone.send(hello('gone', 'Drums'));
    here.send(hello('here', 'Keys'));
    await panel.snapshot(listing('gone', 'here'));
    gone.close();
    await panel.snapshot((snapshot) => row(snapshot.devices, 'gone')?.online === false);

    panel.send({ kind: 'clear-offline' });

    await panel.snapshot(listing('here'));
  });

  it('is dropped from a leader or a viewer socket', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const panel = await producer();
    const leader = await rig.connectLeader();
    const viewer = await rig.connectViewer();
    const gone = await rig.connectViewer();
    gone.send(hello('gone', 'Drums'));
    await panel.snapshot(listing('gone'));
    gone.close();
    await panel.snapshot((snapshot) => row(snapshot.devices, 'gone')?.online === false);

    leader.send({ kind: 'clear-offline' });
    viewer.send({ kind: 'clear-offline' });
    await leader.flush();
    await viewer.flush();

    expect(await rig.devices()).toMatchObject([{ client: 'gone', online: false }]);
  });
});

describe('Reload', () => {
  it("reloads every socket of the target device on the producer's command, and no other device", async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const panel = await producer();
    const target = await rig.connectViewer();
    // The socket a wake opened before the old one closed: the same device.
    const targetWake = await rig.connectViewer();
    const other = await rig.connectViewer();
    target.send(hello('target', 'Keys'));
    targetWake.send(hello('target', 'Keys'));
    other.send(hello('other', 'Bass'));
    panel.send(hello('panel', 'Producer'));
    await panel.snapshot(listing('target', 'other', 'panel'));

    panel.send({ kind: 'reload', client: 'target' });

    await expect.poll(() => [target.reloads, targetWake.reloads]).toEqual([1, 1]);
    await other.flush();
    await panel.flush();
    expect([other.reloads, panel.reloads]).toEqual([0, 0]);
  });

  it('is dropped from a leader or a viewer socket', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const panel = await producer();
    const leader = await rig.connectLeader();
    const viewer = await rig.connectViewer();
    const target = await rig.connectViewer();
    target.send(hello('target', 'Keys'));
    await panel.snapshot(listing('target'));

    leader.send({ kind: 'reload', client: 'target' });
    viewer.send({ kind: 'reload', client: 'target' });
    await leader.flush();
    await viewer.flush();
    await target.flush();

    expect(target.reloads).toBe(0);
  });
});
