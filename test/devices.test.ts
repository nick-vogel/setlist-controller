import { describe, expect, it } from 'vitest';
import { createDeviceRegistry, MAX_OFFLINE_DEVICES } from '../src/server/devices.ts';
import { parseHello, type DeviceHello } from '../src/shared/devices.ts';

// The hub's registry of the devices that introduced themselves, by client ID, and the hello that
// introduces one. The hub's own use of it, over real sockets, is in devices-hub.test.ts.

const hello = (client: string, name: string, battery: number | null = null): DeviceHello => ({ kind: 'hello', client, name, battery });

function registry() {
  let time = 1_000;
  const devices = createDeviceRegistry<string>(() => time);
  return {
    devices,
    advance(ms: number) {
      time += ms;
    },
  };
}

describe('a hello', () => {
  it('is read with its client ID, its name trimmed and its battery', () => {
    expect(parseHello(JSON.stringify({ kind: 'hello', client: 'a1-B2', name: '  Keys  ', battery: 80 }))).toEqual(hello('a1-B2', 'Keys', 80));
  });

  it('cuts a name past 40 characters, so a long one still shows', () => {
    expect(parseHello(JSON.stringify({ kind: 'hello', client: 'a1', name: 'x'.repeat(60), battery: null }))?.name).toBe('x'.repeat(40));
  });

  it('reads a battery that is missing, not a whole number or out of 0 to 100 as not reported', () => {
    for (const battery of [undefined, 42.5, -1, 101, '80']) {
      expect(parseHello(JSON.stringify({ kind: 'hello', client: 'a1', name: 'Keys', battery }))?.battery, String(battery)).toBeNull();
    }
  });

  it('is refused with no client ID, a client ID of other characters, a blank name, or another kind', () => {
    const refused = [
      { kind: 'hello', name: 'Keys' },
      { kind: 'hello', client: '', name: 'Keys' },
      { kind: 'hello', client: 'a b', name: 'Keys' },
      { kind: 'hello', client: 'x'.repeat(65), name: 'Keys' },
      { kind: 'hello', client: 'a1', name: '   ' },
      { kind: 'hello', client: 'a1' },
      { kind: 'jump', client: 'a1', name: 'Keys' },
    ];
    for (const value of refused) expect(parseHello(JSON.stringify(value)), JSON.stringify(value)).toBeNull();
    expect(parseHello('not json')).toBeNull();
  });
});

describe('the device registry', () => {
  it('lists a device online by its name, role and battery once its socket says hello', () => {
    const { devices } = registry();

    expect(devices.hello('socket 1', 'viewer', hello('a', 'Keys', 64))).toBe(true);

    expect(devices.list()).toEqual([{ client: 'a', name: 'Keys', role: 'viewer', battery: 64, online: true, lastSeen: null }]);
  });

  it('updates the same row for a second hello from the client, and reports no change for a hello that changes nothing', () => {
    const { devices } = registry();
    devices.hello('socket 1', 'viewer', hello('a', 'Keys', 64));

    expect(devices.hello('socket 1', 'viewer', hello('a', 'Keys 2', 63))).toBe(true);
    expect(devices.hello('socket 1', 'viewer', hello('a', 'Keys 2', 63))).toBe(false);

    expect(devices.list()).toEqual([{ client: 'a', name: 'Keys 2', role: 'viewer', battery: 63, online: true, lastSeen: null }]);
  });

  it('keeps a device whose last socket closed, offline, with the time it closed', () => {
    const { devices, advance } = registry();
    devices.hello('socket 1', 'leader', hello('a', 'Leader'));
    advance(5_000);

    expect(devices.leave('socket 1')).toBe(true);

    expect(devices.list()).toEqual([{ client: 'a', name: 'Leader', role: 'leader', battery: null, online: false, lastSeen: 6_000 }]);
  });

  it('keeps a device online while another of its sockets is open, as when a wake replaces one', () => {
    const { devices } = registry();
    devices.hello('socket 1', 'viewer', hello('a', 'Keys'));
    devices.hello('socket 2', 'viewer', hello('a', 'Keys'));

    expect(devices.leave('socket 1')).toBe(false);
    expect(devices.list()[0]?.online).toBe(true);
    expect(devices.sockets('a')).toEqual(['socket 2']);
  });

  it('puts a device that comes back online again, in the row it had', () => {
    const { devices } = registry();
    devices.hello('socket 1', 'viewer', hello('a', 'Keys'));
    devices.hello('socket 2', 'viewer', hello('b', 'Bass'));
    devices.leave('socket 1');

    devices.hello('socket 3', 'viewer', hello('a', 'Keys'));

    expect(devices.list().map(({ client, online, lastSeen }) => ({ client, online, lastSeen }))).toEqual([
      { client: 'a', online: true, lastSeen: null },
      { client: 'b', online: true, lastSeen: null },
    ]);
  });

  it('takes the role from the socket the device last said hello on', () => {
    const { devices } = registry();
    devices.hello('socket 1', 'viewer', hello('a', 'iPad'));

    devices.hello('socket 2', 'producer', hello('a', 'iPad'));

    expect(devices.list()[0]?.role).toBe('producer');
  });

  it('leaves the old device offline when a socket says hello with another client ID', () => {
    const { devices } = registry();
    devices.hello('socket 1', 'viewer', hello('a', 'Keys'));

    devices.hello('socket 1', 'viewer', hello('b', 'Bass'));

    expect(devices.list().map(({ client, online }) => ({ client, online }))).toEqual([
      { client: 'a', online: false },
      { client: 'b', online: true },
    ]);
    expect(devices.sockets('a')).toEqual([]);
  });

  it('forgets every offline device on Clear offline and keeps the online ones', () => {
    const { devices } = registry();
    devices.hello('socket 1', 'viewer', hello('a', 'Keys'));
    devices.hello('socket 2', 'viewer', hello('b', 'Bass'));
    devices.leave('socket 1');

    expect(devices.clearOffline()).toBe(true);
    expect(devices.clearOffline()).toBe(false);

    expect(devices.list().map(({ client }) => client)).toEqual(['b']);
  });

  it('reports no change when a socket that never said hello closes', () => {
    const { devices } = registry();

    expect(devices.leave('socket 1')).toBe(false);
    expect(devices.list()).toEqual([]);
  });

  it(`forgets the device offline longest once more than ${MAX_OFFLINE_DEVICES} are offline, so a page that keeps changing its client ID cannot grow the list without end`, () => {
    const { devices, advance } = registry();
    for (let index = 0; index <= MAX_OFFLINE_DEVICES; index += 1) {
      devices.hello(`socket ${index}`, 'viewer', hello(`d${index}`, `Device ${index}`));
      advance(1_000);
      devices.leave(`socket ${index}`);
    }

    const clients = devices.list().map(({ client }) => client);
    expect(clients).toHaveLength(MAX_OFFLINE_DEVICES);
    expect(clients).not.toContain('d0');
    expect(clients).toContain('d1');
    expect(clients).toContain(`d${MAX_OFFLINE_DEVICES}`);
  });
});
