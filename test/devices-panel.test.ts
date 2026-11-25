import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Device } from '../src/shared/devices.ts';
import { UNKNOWN_POWER } from '../src/shared/power.ts';
import type { Role } from '../src/shared/routes.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';
import { DevicesPanel } from '../web/src/DevicesPanel.tsx';

// The Devices panel as the producer page and the setup screen draw it, and each page's device name
// field. A static render presses no button: that Reload reloads the one device and Clear offline
// forgets the offline rows is in e2e/devices.spec.ts.

const SNAPSHOT: ProducerSnapshot = {
  live: 'connected',
  set: { songs: [{ number: 1, title: 'Song 1', sections: [{ name: 'Intro', time: 0, end: 16, cue: 0 }], end: 16, endCue: 1 }], warnings: [] },
  playing: false,
  position: 0,
  now: null,
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop' },
  loop: null,
  safeMode: true,
  fade: null,
  chartRevision: 1,
  songMeters: { 1: 4 },
  songTimings: {},
  power: UNKNOWN_POWER,
  connections: [],
  connectionProblems: [],
  devices: [],
};

const SELF: Device = { client: 'self', name: 'Producer', role: 'producer', battery: 90, online: true, lastSeen: null };
const PHONE: Device = { client: 'phone', name: 'Keys', role: 'viewer', battery: 42, online: true, lastSeen: null };
const IPAD: Device = { client: 'ipad', name: 'Leader', role: 'leader', battery: null, online: true, lastSeen: null };
const GONE: Device = { client: 'gone', name: 'Drums', role: 'viewer', battery: 10, online: false, lastSeen: new Date(2026, 10, 22, 9, 41).getTime() };

type Row = { name: string; text: string[]; buttons: { label: string; disabled: boolean }[]; offline: boolean };

// Each device row as drawn: its name, its text spans in order, and its buttons.
function rows(markup: string): Row[] {
  return [...markup.matchAll(/<li class="(device[^"]*)" aria-label="([^"]*)">(.*?)<\/li>/g)].map(([, classes, name, inner]) => ({
    name: name!,
    offline: classes!.split(' ').includes('offline'),
    text: [...inner!.matchAll(/<span class="[^"]*">([^<]*)<\/span>/g)].map(([, text]) => text!),
    buttons: buttons(inner!),
  }));
}

function buttons(markup: string): { label: string; disabled: boolean }[] {
  return [...markup.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attributes, label]) => ({ label: label!, disabled: attributes!.includes('disabled') }));
}

const devicesSection = (markup: string) => /<section class="devices"[^>]*>(.*?)<\/section>/.exec(markup)?.[1] ?? null;

function producerPage(devices: Device[], connected = true): string {
  return renderToStaticMarkup(createElement(Page, { role: 'producer', snapshot: { ...SNAPSHOT, devices }, connected, send: () => {}, clientId: 'self' }));
}

describe("the producer's Devices panel", () => {
  it('lists each device by its name with its role, Online or Offline with when it was last seen, and its battery', () => {
    const listed = rows(devicesSection(producerPage([SELF, PHONE, IPAD, GONE]))!);

    expect(listed.map(({ name, text, offline }) => ({ name, text, offline }))).toEqual([
      { name: 'Producer', text: ['Producer', 'Producer', 'Online', 'Battery 90%'], offline: false },
      { name: 'Keys', text: ['Keys', 'View only', 'Online', 'Battery 42%'], offline: false },
      { name: 'Leader', text: ['Leader', 'Leader', 'Online', 'Battery not reported'], offline: false },
      { name: 'Drums', text: ['Drums', 'View only', expect.stringMatching(/^Offline, last seen 0?9\D41/), 'Battery 10%'], offline: true },
    ]);
  });

  it("has Reload on every other online device, and none on the producer's own row or an offline row", () => {
    const listed = rows(devicesSection(producerPage([SELF, PHONE, IPAD, GONE]))!);

    expect(listed.map(({ name, buttons }) => [name, buttons.map(({ label }) => label)])).toEqual([
      ['Producer', []],
      ['Keys', ['Reload']],
      ['Leader', ['Reload']],
      ['Drums', []],
    ]);
  });

  it('enables Clear offline only while a device is offline and the page is connected, and Reload only while connected', () => {
    const clear = (markup: string) => buttons(devicesSection(markup)!).find(({ label }) => label === 'Clear offline')?.disabled;

    expect(clear(producerPage([SELF, GONE]))).toBe(false);
    expect(clear(producerPage([SELF, PHONE]))).toBe(true);
    expect(clear(producerPage([SELF, GONE], false))).toBe(true);
    expect(rows(devicesSection(producerPage([SELF, PHONE], false))!)[1]?.buttons).toEqual([{ label: 'Reload', disabled: true }]);
  });
});

describe("the setup screen's Devices panel", () => {
  it('lists the devices as the producer sees them, with no Reload and no Clear offline', () => {
    const markup = renderToStaticMarkup(createElement(DevicesPanel, { devices: [SELF, PHONE, GONE] }));

    expect(rows(markup).map(({ name, text }) => [name, text[2]])).toEqual([
      ['Producer', 'Online'],
      ['Keys', 'Online'],
      ['Drums', expect.stringMatching(/^Offline, last seen/)],
    ]);
    expect(buttons(markup)).toEqual([]);
  });
});

describe('the device name field', () => {
  const field = (markup: string) => /<input class="device-name-input"([^>]*)>/.exec(markup)?.[1] ?? null;
  const attribute = (attributes: string | null, name: string) => (attributes && new RegExp(`${name}="([^"]*)"`).exec(attributes)?.[1]) ?? null;

  it("shows the typed name, else the device's default as its placeholder: the part picked on the view-only page, the role on the leader's and the producer's", () => {
    const page = (role: Role, extra: object) => renderToStaticMarkup(createElement(Page, { role, snapshot: SNAPSHOT, connected: true, send: () => {}, ...extra }));

    expect(attribute(field(page('viewer', { part: 'Bass' })), 'placeholder')).toBe('Bass');
    expect(attribute(field(page('viewer', {})), 'placeholder')).toBe('View only');
    expect(attribute(field(page('leader', {})), 'placeholder')).toBe('Leader');
    expect(attribute(field(page('producer', {})), 'placeholder')).toBe('Producer');
    expect(attribute(field(page('viewer', { part: 'Bass', deviceName: 'Stage left' })), 'value')).toBe('Stage left');
  });
});
