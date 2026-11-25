import type { NetworkInterfaceInfo } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADVERTISE_EVERY_MS, dnsSdArguments, startAdvertising, type Advert, type Advertiser, type Register } from '../src/server/advertise.ts';
import { manualClock } from '../src/server/clock.ts';

// The laptop's network interfaces as a test sets them.
const host = vi.hoisted(() => ({ interfaces: {} as Record<string, NetworkInterfaceInfo[]> }));
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, networkInterfaces: () => host.interfaces };
});

let advertiser: Advertiser | undefined;

afterEach(() => {
  advertiser?.close();
  advertiser = undefined;
  host.interfaces = {};
});

function ipv4(address: string): NetworkInterfaceInfo {
  return { address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: `${address}/24` };
}

const LOOPBACK = { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' } as const;

type Registration = { advert: Advert; stopped: boolean; end(): void };

// Stands in for Bonjour: records each registration, and lets a test end one as a crashed dns-sd would.
function fakeBonjour() {
  const registrations: Registration[] = [];
  const register: Register = (advert, ended) => {
    const registration: Registration = {
      advert,
      stopped: false,
      end: () => ended(),
    };
    registrations.push(registration);
    return { stop: () => void (registration.stopped = true) };
  };
  const live = () => registrations.filter((registration) => !registration.stopped);
  return { register, registrations, live };
}

describe('the server advertising setlist.local', () => {
  it("registers setlist.local at the laptop's stage-network address and the server's port when started", () => {
    host.interfaces = { lo0: [LOOPBACK], en0: [ipv4('192.0.2.20')] };
    const bonjour = fakeBonjour();

    advertiser = startAdvertising({ port: 8080, clock: manualClock(), register: bonjour.register });

    expect(bonjour.registrations.map((registration) => registration.advert)).toEqual([
      { host: 'setlist.local', address: '192.0.2.20', port: 8080 },
    ]);
  });

  it('registers once the laptop joins the network, when it had no address at start', () => {
    host.interfaces = { lo0: [LOOPBACK] };
    const clock = manualClock();
    const bonjour = fakeBonjour();

    advertiser = startAdvertising({ port: 8080, clock, register: bonjour.register });
    expect(bonjour.registrations).toEqual([]);

    host.interfaces = { lo0: [LOOPBACK], en0: [ipv4('10.0.0.5')] };
    clock.advance(ADVERTISE_EVERY_MS);

    expect(bonjour.live().map((registration) => registration.advert.address)).toEqual(['10.0.0.5']);
  });

  it('moves the registration to the new address when DHCP hands the laptop another', () => {
    host.interfaces = { en0: [ipv4('192.0.2.20')] };
    const clock = manualClock();
    const bonjour = fakeBonjour();
    advertiser = startAdvertising({ port: 8080, clock, register: bonjour.register });

    host.interfaces = { en0: [ipv4('192.0.2.31')] };
    clock.advance(ADVERTISE_EVERY_MS);

    expect(bonjour.registrations[0]?.stopped).toBe(true);
    expect(bonjour.live().map((registration) => registration.advert.address)).toEqual(['192.0.2.31']);
  });

  it('keeps one registration while the address stays the same', () => {
    host.interfaces = { en0: [ipv4('192.0.2.20')] };
    const clock = manualClock();
    const bonjour = fakeBonjour();
    advertiser = startAdvertising({ port: 8080, clock, register: bonjour.register });

    clock.advance(ADVERTISE_EVERY_MS * 5);

    expect(bonjour.registrations).toHaveLength(1);
    expect(bonjour.live()).toHaveLength(1);
  });

  it('stops advertising when the laptop leaves the network', () => {
    host.interfaces = { en0: [ipv4('192.0.2.20')] };
    const clock = manualClock();
    const bonjour = fakeBonjour();
    advertiser = startAdvertising({ port: 8080, clock, register: bonjour.register });

    host.interfaces = { lo0: [LOOPBACK] };
    clock.advance(ADVERTISE_EVERY_MS);

    expect(bonjour.live()).toEqual([]);
  });

  it('registers again on the next tick when a registration ends on its own', () => {
    host.interfaces = { en0: [ipv4('192.0.2.20')] };
    const clock = manualClock();
    const bonjour = fakeBonjour();
    advertiser = startAdvertising({ port: 8080, clock, register: bonjour.register });

    bonjour.registrations[0]?.end();
    expect(bonjour.registrations).toHaveLength(1);

    clock.advance(ADVERTISE_EVERY_MS);

    expect(bonjour.registrations).toHaveLength(2);
    expect(bonjour.registrations[1]?.advert).toEqual({ host: 'setlist.local', address: '192.0.2.20', port: 8080 });
  });

  it('stops the registration on close, and registers nothing after', () => {
    host.interfaces = { en0: [ipv4('192.0.2.20')] };
    const clock = manualClock();
    const bonjour = fakeBonjour();
    advertiser = startAdvertising({ port: 8080, clock, register: bonjour.register });

    advertiser.close();
    host.interfaces = { en0: [ipv4('192.0.2.31')] };
    clock.advance(ADVERTISE_EVERY_MS * 3);

    expect(bonjour.registrations).toHaveLength(1);
    expect(bonjour.live()).toEqual([]);
  });

  it('asks dns-sd for a proxy registration, which makes setlist.local resolve to the address', () => {
    expect(dnsSdArguments({ host: 'setlist.local', address: '192.0.2.20', port: 8080 })).toEqual([
      '-P',
      'Setlist',
      '_http._tcp',
      'local',
      '8080',
      'setlist.local',
      '192.0.2.20',
    ]);
  });
});
