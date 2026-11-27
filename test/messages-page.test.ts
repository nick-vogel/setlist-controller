import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Device } from '../src/shared/devices.ts';
import { MESSAGE_PRESETS, type ActiveMessage } from '../src/shared/messages.ts';
import { UNKNOWN_POWER } from '../src/shared/power.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';
import { deviceChoices } from '../web/src/ProducerMessages.tsx';
import { contrast, readStylesheet, type Element } from './css.ts';

// The producer's message as each page draws it, and the producer's panel that sends one. A static
// render presses nothing and lays nothing out: that a quick message sends at once, that Send reaches
// the devices it targets, that Dismiss hides the banner across a reload, and that the banner holds to
// the top of a scrolled page, moves nothing and covers no connection signal are in
// e2e/messages.spec.ts.

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
  activeMessages: [],
};

const MESSAGE = { id: 'm1', text: 'Hold after this song' };

const page = (props: object) => renderToStaticMarkup(createElement(Page, { role: 'viewer', snapshot: SNAPSHOT, connected: true, send: () => {}, ...props }));

// The opening tag of the first element inside the page's main, the signals in its top layer in order,
// and the banner's text and button.
const firstInMain = (markup: string) => /<main[^>]*>(<[^>]*>)/.exec(markup)?.[1] ?? null;
const pageTopMarkup = (markup: string) => {
  const start = markup.indexOf('<div class="page-top">');
  if (start === -1) return '';
  let depth = 0;
  for (const tag of markup.slice(start).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return markup.slice(start, start + tag.index + tag[0].length);
  }
  return '';
};
const inPageTop = (markup: string) =>
  [...pageTopMarkup(markup).matchAll(/<(?:p|section|div) class="(server-lost|stage-status|message-banner|power-warning)[ "]/g)].map(([, name]) => name);
const banner = (markup: string) => {
  const found = /<div class="message-banner" role="alert"><p class="message-banner-text">([^<]*)<\/p><button[^>]*>([^<]*)<\/button><\/div>/.exec(markup);
  return found ? { text: found[1], button: found[2] } : null;
};

describe("the producer's message on a page", () => {
  it('opens every page it reaches in the top layer, and is gone with no message', () => {
    const variants = {
      'view-only, no part': page({ message: MESSAGE }),
      'view-only chart page': page({ message: MESSAGE, part: 'Keys' }),
      'leader setlist, on battery': page({ message: MESSAGE, role: 'leader', snapshot: { ...SNAPSHOT, power: { source: 'battery', percent: 20 } } }),
      'leader timeline': page({ message: MESSAGE, role: 'leader', leaderView: 'timeline' }),
      producer: page({ message: MESSAGE, role: 'producer' }),
      'no set yet': page({ message: MESSAGE, snapshot: { ...SNAPSHOT, set: null } }),
    };
    for (const [variant, markup] of Object.entries(variants)) {
      expect(firstInMain(markup), variant).toBe('<div class="page-top">');
      expect(inPageTop(markup), variant).toContain('message-banner');
      expect(banner(markup), variant).toEqual({ text: 'Hold after this song', button: 'Dismiss' });
    }
    expect(banner(page({ message: null, part: 'Keys' }))).toBeNull();
  });
});

describe("the producer's message panel", () => {
  const SELF: Device = { client: 'self', name: 'Producer', role: 'producer', battery: null, online: true, lastSeen: null };
  const producerPage = (connected = true) => page({ role: 'producer', clientId: 'self', connected, snapshot: { ...SNAPSHOT, devices: [SELF] } });
  const panel = (markup: string) => /<section class="messages"[^>]*>(.*?)<\/section>/.exec(markup)?.[1] ?? null;
  const buttons = (markup: string) => [...markup.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attributes, label]) => ({ label: label!, disabled: attributes!.includes('disabled') }));

  it('is on the producer page alone', () => {
    expect(panel(producerPage())).not.toBeNull();
    expect(panel(page({ role: 'leader' }))).toBeNull();
    expect(panel(page({ role: 'viewer' }))).toBeNull();
  });

  it('offers every quick message as a button ahead of the text box', () => {
    const markup = panel(producerPage())!;
    const presets = buttons(markup.slice(0, markup.indexOf('message-text-input'))).map(({ label }) => label);
    expect(presets).toEqual([...MESSAGE_PRESETS]);
  });

  it('disables Send while the text box is blank, and every button while the page is not connected', () => {
    const connected = buttons(panel(producerPage())!);
    expect(connected.find(({ label }) => label === 'Send')?.disabled).toBe(true);
    expect(connected.filter(({ label }) => label !== 'Send').every(({ disabled }) => !disabled)).toBe(true);
    expect(buttons(panel(producerPage(false))!).every(({ disabled }) => disabled)).toBe(true);
  });

  it('offers a choice of every other device, by name and role, offline ones included, with the start of the client ID where two share a name and role', () => {
    const devices: Device[] = [
      SELF,
      { client: 'a1b2c3', name: 'View only', role: 'viewer', battery: null, online: true, lastSeen: null },
      { client: 'd4e5f6', name: 'View only', role: 'viewer', battery: null, online: true, lastSeen: null },
      { client: 'ipad', name: 'Leader', role: 'leader', battery: null, online: true, lastSeen: null },
      { client: 'gone', name: 'Drums', role: 'viewer', battery: null, online: false, lastSeen: 1 },
    ];

    expect(deviceChoices(devices, 'self')).toEqual([
      { client: 'a1b2c3', label: 'View only, View only (a1b2)' },
      { client: 'd4e5f6', label: 'View only, View only (d4e5)' },
      { client: 'ipad', label: 'Leader, Leader' },
      { client: 'gone', label: 'Drums, View only, offline' },
    ]);
  });
});

describe("the producer's message panel, with the active messages", () => {
  const SELF: Device = { client: 'self', name: 'Producer', role: 'producer', battery: null, online: true, lastSeen: null };
  const KEYS: Device = { client: 'keys', name: 'Keys', role: 'viewer', battery: null, online: true, lastSeen: null };
  const IPAD: Device = { client: 'ipad', name: 'Leader', role: 'leader', battery: null, online: false, lastSeen: 1 };
  const at = (hour: number, minute: number) => new Date(2026, 10, 22, hour, minute).getTime();
  const active = (activeMessages: ActiveMessage[]) =>
    page({ role: 'producer', clientId: 'self', snapshot: { ...SNAPSHOT, devices: [SELF, KEYS, IPAD], activeMessages } });
  // Each listed message as its lines read, in order.
  const listed = (markup: string) =>
    [...markup.matchAll(/<li class="message-active">(.*?)<\/li>/g)].map(([, inner]) => [...inner!.matchAll(/<span class="[^"]*">([^<]*)<\/span>/g)].map(([, text]) => text));

  it('lists each active message with its text, its target and when it was sent, for every target kind', () => {
    const markup = active([
      { id: 'm3', text: 'Watch leader', to: ['ipad', 'keys'], sent: at(9, 43), shownBy: ['keys'], dismissedBy: [] },
      { id: 'm2', text: 'Repeat chorus', to: 'viewers', sent: at(9, 42), shownBy: [], dismissedBy: [] },
      { id: 'm1', text: 'Hold after this song', to: 'all', sent: at(9, 41), shownBy: [], dismissedBy: [] },
    ]);

    expect(listed(markup)).toEqual([
      ['Watch leader', 'To Leader, Leader, offline; Keys, View only', expect.stringMatching(/^Sent 0?9\D43/)],
      ['Repeat chorus', 'To view-only devices', expect.stringMatching(/^Sent 0?9\D42/)],
      ['Hold after this song', 'To all devices', expect.stringMatching(/^Sent 0?9\D41/)],
    ]);
  });

  it('counts the chosen devices that Clear offline took off the list, since a name is no longer known', () => {
    const markup = active([{ id: 'm1', text: 'Watch leader', to: ['keys', 'gone', 'lost'], sent: at(9, 41), shownBy: [], dismissedBy: [] }]);

    expect(listed(markup)[0]?.[1]).toBe('To Keys, View only; 2 devices no longer listed');
  });

  it('names this producer page itself where another producer page chose it', () => {
    const markup = active([{ id: 'm1', text: 'Watch leader', to: ['self', 'keys'], sent: at(9, 41), shownBy: ['self', 'keys'], dismissedBy: [] }]);

    expect(listed(markup)[0]?.[1]).toBe('To Producer, Producer; Keys, View only');
  });

  it('shows the no-message line in place of the list, and only while no message is active', () => {
    expect(active([])).toContain('No active message.');
    expect(active([])).not.toContain('message-active-list');
    const one = active([{ id: 'm1', text: 'Watch leader', to: ['keys'], sent: at(9, 41), shownBy: ['keys'], dismissedBy: [] }]);
    expect(one).not.toContain('No active message.');
    expect(one).toContain('message-active-list');
  });
});

describe("the producer's active messages' stylesheet", () => {
  const stylesheet = readStylesheet(resolve(import.meta.dirname, '../web/src/styles.css'));
  const item: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['messages'] }, { tag: 'ul', classes: ['message-active-list'] }, { tag: 'li', classes: ['message-active'] }];

  // WCAG 2.1 AA asks 4.5:1 of normal text.
  it('keeps every line of an active message at 4.5:1 or more on its own surface', () => {
    const surface = stylesheet.value(item, 'background')!;
    for (const part of ['message-active-text', 'message-active-target', 'message-active-sent']) {
      expect(contrast(stylesheet.inherited([...item, { tag: 'span', classes: [part] }], 'color'), surface), part).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the message banner's stylesheet", () => {
  const stylesheet = readStylesheet(resolve(import.meta.dirname, '../web/src/styles.css'));
  const path: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'div', classes: ['page-top'] }, { tag: 'div', classes: ['message-banner'] }];

  // WCAG 2.1 AA asks 4.5:1 of normal text.
  it('keeps its text and its Dismiss button at 4.5:1 or more on their own surfaces', () => {
    const surface = stylesheet.value(path, 'background')!;
    expect(contrast(stylesheet.value([...path, { tag: 'p', classes: ['message-banner-text'] }], 'color') ?? stylesheet.value(path, 'color')!, surface)).toBeGreaterThanOrEqual(4.5);
    const button = [...path, { tag: 'button', classes: ['message-banner-dismiss'] }];
    expect(contrast(stylesheet.value(button, 'color')!, stylesheet.value(button, 'background')!)).toBeGreaterThanOrEqual(4.5);
  });

  it("comes after the page's connection signal and ahead of the battery warning in the top layer, which takes no room in the page", () => {
    const onBattery = { ...SNAPSHOT, power: { source: 'battery' as const, percent: 20 } };
    for (const markup of [page({ message: MESSAGE, connected: false }), page({ message: MESSAGE, role: 'leader' }), page({ message: MESSAGE, role: 'leader', leaderView: 'timeline' })]) {
      expect(inPageTop(markup)).toEqual([markup.includes('server-lost') ? 'server-lost' : 'stage-status', 'message-banner']);
    }
    expect(inPageTop(page({ message: MESSAGE, role: 'leader', snapshot: onBattery }))).toEqual(['stage-status', 'message-banner', 'power-warning']);
    expect(inPageTop(page({ message: MESSAGE, role: 'producer', connected: false, snapshot: onBattery }))).toEqual(['server-lost', 'message-banner', 'power-warning']);
    expect(inPageTop(page({ role: 'producer', snapshot: onBattery }))).toEqual(['power-warning']);
    const layer: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'div', classes: ['page-top'] }];
    expect(stylesheet.value(layer, 'position')).toBe('fixed');
    expect(stylesheet.value(layer, 'flex-direction')).toBe('column');
    for (const signal of [{ tag: 'div', classes: ['message-banner'] }, { tag: 'p', classes: ['server-lost'] }, { tag: 'section', classes: ['stage-status', 'sticky'] }, { tag: 'div', classes: ['power-warning', 'urgent'] }]) {
      expect(stylesheet.value([...layer, signal], 'position'), signal.classes[0]).toBeUndefined();
      expect(stylesheet.value([...layer, signal], 'z-index'), signal.classes[0]).toBeUndefined();
    }
  });
});
