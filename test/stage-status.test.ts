import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Role } from '../src/shared/routes.ts';
import type { ProducerSnapshot, SetList, Snapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';
import { stageStatus, type StageSnapshot } from '../web/src/stage-status.ts';
import { StageStatusLine } from '../web/src/StageStatusLine.tsx';
import { readStylesheet, type Element } from './css.ts';

// The stage status line: what it says for each state of the set, which pages pin it, and the
// stylesheet that keeps it one line tall at the top of the screen.

// Song 1 opens on a Count Off and has an End. Song 2 has no title and no End.
const SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Build My Life',
      sections: [
        { name: 'Count Off', time: 0, end: 8, cue: 0 },
        { name: 'Intro', time: 8, end: 24, cue: 1 },
        { name: 'Verse', time: 24, end: 40, cue: 2 },
        { name: 'Chorus', time: 40, end: 56, cue: 3 },
      ],
      end: 56,
      endCue: 4,
    },
    {
      number: 2,
      title: null,
      sections: [
        { name: 'Opening', time: 64, end: 80, cue: 5 },
        { name: 'Bridge', time: 80, end: null, cue: 6 },
      ],
      end: null,
      endCue: null,
    },
  ],
  warnings: [],
};

const ON_VERSE: Snapshot['now'] = { song: 1, section: 2, next: 3, bar: 2, bars: 4, fraction: 0.25 };
const ON_COUNT_OFF: Snapshot['now'] = { song: 1, section: 0, next: 1, bar: 1, bars: 2, fraction: 0 };
const ON_LAST: Snapshot['now'] = { song: 1, section: 3, next: 'end', bar: 1, bars: 4, fraction: 0 };
const ON_LAST_NO_END: Snapshot['now'] = { song: 2, section: 1, next: 'end', bar: 1, bars: null, fraction: null };

type Changes = Partial<StageSnapshot> & { connected?: boolean };
const input = ({ connected = true, ...changes }: Changes = {}): [StageSnapshot, boolean] => [
  {
    live: 'connected',
    set: SET,
    playing: true,
    now: ON_VERSE,
    jump: null,
    countIn: false,
    ...changes,
  },
  connected,
];
const status = (changes: Changes = {}) => stageStatus(...input(changes));

// The text a page shows, without its markup.
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const line = (changes: Changes = {}) => {
  const [snapshot, connected] = input(changes);
  return text(renderToStaticMarkup(createElement(StageStatusLine, { snapshot, connected })));
};

describe('the stage status', () => {
  it('names the song, the section and the next section while Live plays', () => {
    expect(status()).toEqual({
      kind: 'active',
      song: 'Build My Life',
      section: 'Verse',
      next: 'Chorus',
      transport: { kind: 'playing', label: 'Playing' },
    });
    expect(line()).toBe('Playing Build My Life · Verse Next Chorus');
  });

  it('says Live is stopped while it is', () => {
    expect(status({ playing: false })).toMatchObject({ kind: 'active', transport: { kind: 'stopped', label: 'Stopped' } });
    expect(line({ playing: false })).toBe('Stopped Build My Life · Verse Next Chorus');
  });

  it('names the jump that waits for the downbeat, End included', () => {
    expect(line({ jump: { song: 1, section: 1 } })).toBe('Jumping to Intro Build My Life · Verse Next Chorus');
    expect(line({ jump: { song: 1, section: 'end' } })).toBe('Jumping to End Build My Life · Verse Next Chorus');
  });

  it("names a count-in's target, and the section after the target as Next", () => {
    const found = status({ now: ON_COUNT_OFF, jump: { song: 1, section: 2 }, countIn: true });
    expect(found).toEqual({
      kind: 'active',
      song: 'Build My Life',
      section: 'Count Off',
      next: 'Chorus',
      transport: { kind: 'count-in', label: 'Count in to Verse' },
    });
  });

  it("names End after a song's last section, and nothing when the song has no End", () => {
    expect(status({ now: ON_LAST })).toMatchObject({ next: 'End' });
    expect(status({ now: ON_LAST_NO_END })).toMatchObject({ song: 'Song 2', section: 'Bridge', next: null });
    expect(line({ now: ON_LAST_NO_END })).toBe('Playing Song 2 · Bridge');
  });

  it('says the playhead is between songs, with the transport', () => {
    expect(line({ now: null, playing: false })).toBe('Stopped Between songs');
    expect(line({ now: null, jump: { song: 2, section: 0 } })).toBe('Jumping to Opening Between songs');
  });

  it('says the server or Live is out of reach before anything else, the server first', () => {
    expect(line({ connected: false, live: 'not-connected' })).toBe('Reconnecting to the server.');
    expect(line({ connected: false })).toBe('Reconnecting to the server.');
    expect(line({ live: 'not-connected' })).toBe('Live not connected');
  });

  it('says there is no set yet, or no songs in it', () => {
    expect(line({ set: null, now: null })).toBe('Waiting for Live');
    expect(line({ set: { songs: [], warnings: [] }, now: null })).toBe('No songs in set');
  });
});

const SNAPSHOT: Snapshot = {
  live: 'connected',
  set: SET,
  playing: true,
  position: 26,
  now: ON_VERSE,
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop', 2: 'stop' },
  fade: null,
  loop: null,
  chartRevision: 1,
  songMeters: { 1: 4, 2: 4 },
  songTimings: {},
  power: { source: 'ac', percent: 100 },
  safeMode: true,
};
const PRODUCER_SNAPSHOT: ProducerSnapshot = { ...SNAPSHOT, connections: [], connectionProblems: [], devices: [] };

const page = (role: Role, changes: Partial<Snapshot> = {}, extra: { leaderView?: 'setlist' | 'timeline' } = {}, connected = true) =>
  renderToStaticMarkup(
    createElement(Page, {
      role,
      snapshot: role === 'producer' ? { ...PRODUCER_SNAPSHOT, ...changes } : { ...SNAPSHOT, ...changes },
      connected,
      send: () => {},
      ...extra,
    }),
  );
const STATUS_LINE = /<section class="stage-status[^"]*" aria-label="Stage status">/;

describe('the pages that pin the stage status line', () => {
  it('opens the leader page, before the view switcher and the now-playing panel', () => {
    const markup = page('leader');
    expect(markup).toMatch(new RegExp(`^<main class="leader-page"><div class="page-top">${STATUS_LINE.source}`));
    expect(markup.search(STATUS_LINE)).toBeLessThan(markup.indexOf('leader-mode-bar'));
    expect(markup.search(STATUS_LINE)).toBeLessThan(markup.indexOf('aria-label="Now playing"'));
  });

  it("opens the leader's timeline view, and the leader page with no set yet", () => {
    expect(page('leader', {}, { leaderView: 'timeline' })).toMatch(new RegExp(`^<main class="timeline-page leader-page"><div class="page-top">${STATUS_LINE.source}`));
    expect(text(page('leader', { set: null, now: null }))).toMatch(/^Waiting for Live/);
  });

  it('is not on the producer page or the view-only page by default', () => {
    expect(page('producer')).not.toMatch(STATUS_LINE);
    expect(page('viewer')).not.toMatch(STATUS_LINE);
  });

  // The line and the banner share the top of the page, so the leader page says it once, in the line.
  it('says the server is out of reach in the line on the leader page, and in the banner on every other page', () => {
    const count = (markup: string) => text(markup).split('Reconnecting to the server.').length - 1;
    for (const extra of [{}, { leaderView: 'timeline' as const }]) {
      const markup = page('leader', {}, extra, false);
      expect(count(markup)).toBe(1);
      expect(markup).toMatch(/<section class="stage-status[^"]*" aria-label="Stage status"><span class="stage-status-message" role="status">Reconnecting to the server.<\/span><\/section>/);
    }
    expect(count(page('leader', { set: null, now: null }, {}, false))).toBe(1);
    for (const role of ['producer', 'viewer'] as const) {
      expect(page(role, {}, {}, false)).toMatch(/<p class="server-lost" role="status">Reconnecting to the server.<\/p>/);
    }
  });
});

describe("the stage status line's stylesheet", () => {
  const stylesheet = readStylesheet(resolve(import.meta.dirname, '../web/src/styles.css'));
  const bar: Element = { tag: 'section', classes: ['stage-status', 'sticky', 'stage-status-active'] };
  const onLeader = (...elements: Element[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main', classes: ['leader-page'] }, { tag: 'div', classes: ['page-top'] }, ...elements];

  it('holds the line to the top of the screen in the top layer', () => {
    expect(stylesheet.value(onLeader(), 'position')).toBe('fixed');
    expect(stylesheet.value(onLeader(), 'inset')).toBe('0 0 auto');
  });

  it('stays one line tall: nothing wraps, and a long name is cut short', () => {
    expect(stylesheet.value(onLeader(bar), 'flex-wrap')).toBe('nowrap');
    expect(stylesheet.value(onLeader(bar), 'white-space')).toBe('nowrap');
    expect(stylesheet.value(onLeader(bar), 'overflow')).toBe('hidden');
    for (const part of ['stage-status-song', 'stage-status-section', 'stage-status-next', 'stage-status-message']) {
      expect(stylesheet.value(onLeader(bar, { tag: 'span', classes: [part] }), 'text-overflow')).toBe('ellipsis');
    }
  });

  it("says the server is out of reach in the Reconnecting banner's colours", () => {
    const banner = onLeader({ tag: 'p', classes: ['server-lost'] });
    const lost: Element = { tag: 'section', classes: ['stage-status', 'sticky', 'stage-status-server-lost'] };
    expect(stylesheet.value(onLeader(lost), 'background')).toBe(stylesheet.value(banner, 'background'));
    expect(stylesheet.value(onLeader(lost, { tag: 'span', classes: ['stage-status-message'] }), 'color')).toBe(stylesheet.value(banner, 'color'));
  });

});
