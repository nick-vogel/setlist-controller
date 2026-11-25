import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SetCharts } from '../src/shared/set-manifest.ts';
import type { SetList, Snapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';

// setlist-controller#225 pre-PR review 2: the executed proof of finding 1. All three cases are red
// at 32af179 and assert the behaviour the finding's brief asks for. Run it from test/: copy it there,
// run it, and remove the copy.

// A 6/8 song with a Pad after it into a 4/4 song. The set builder starts the next song's meter on
// the Pad locator (write-set.ts stitch, timeline.ts), so Live counts the Pad in 4/4: its 72 beats
// are 18 bars, and the server's now.bars for it is 18 (playback-controller.ts, Live's signature).
const SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Great Are You Lord',
      sections: [
        { name: 'Count Off', time: 0, end: 6, cue: 0 },
        { name: 'Verse 1', time: 6, end: 30, cue: 1 },
        { name: 'Pad', time: 30, end: 102, cue: 2 },
      ],
      end: 102,
      endCue: 3,
    },
    {
      number: 2,
      title: 'Build My Life',
      sections: [
        { name: 'Count Off', time: 102, end: 110, cue: 4 },
        { name: 'Verse', time: 110, end: 126, cue: 5 },
      ],
      end: 126,
      endCue: 6,
    },
  ],
  warnings: [],
};
const CHARTS: SetCharts = {
  revision: 2,
  songs: [
    { title: 'Great Are You Lord', stemsKey: 'D', meter: '6/8' },
    { title: 'Build My Life', stemsKey: 'B', meter: '4/4' },
  ],
};
const SNAPSHOT: Snapshot = {
  live: 'connected',
  set: SET,
  playing: true,
  position: 10,
  now: { song: 1, section: 1, next: 2, bar: 2, bars: 8, fraction: 0.1 },
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop', 2: 'stop' },
  fade: null,
  loop: null,
  chartRevision: 2,
};
const page = (snapshot: Partial<Snapshot>) =>
  renderToStaticMarkup(createElement(Page, { role: 'viewer', snapshot: { ...SNAPSHOT, ...snapshot }, connected: true, send: () => {}, part: 'Drums', onPart: () => {}, onDisplay: () => {}, charts: CHARTS }));
const padBars = (markup: string) =>
  [...markup.matchAll(/<li class="chart-block[^"]*">(.*?)<\/li>/g)]
    .map(([, inner = '']) => ({ name: /<span class="chart-block-name">([^<]*)<\/span>/.exec(inner)?.[1], bars: /<span class="chart-block-bars">([^<]*)<\/span>/.exec(inner)?.[1] ?? null }))
    .find(({ name }) => name === 'Pad')?.bars;

describe("finding 1: a song's Pad block counts in the next song's meter, as Live does", () => {
  it('shows the Pad of a 6/8 song before a 4/4 song as 18 bars before the playhead reaches it', () => {
    expect(padBars(page({}))).toBe('18 bars');
  });
  it('keeps the same count when the playhead is in the Pad and Live reports 18 bars', () => {
    expect(padBars(page({ now: { song: 1, section: 2, next: 'end', bar: 1, bars: 18, fraction: 0 } }))).toBe(padBars(page({})));
  });
  it('shows the Pad of a 4/4 song before a 6/8 song as 20 bars, as Live counts its 60 beats at 3 a bar', () => {
    const fourFour: SetCharts = { revision: 3, songs: [{ title: 'Great Are You Lord', stemsKey: 'D', meter: '4/4' }, { title: 'Build My Life', stemsKey: 'B', meter: '6/8' }] };
    const set: SetList = { ...SET, songs: [{ ...SET.songs[0]!, sections: [...SET.songs[0]!.sections.slice(0, 2), { name: 'Pad', time: 30, end: 90, cue: 2 }], end: 90 }, SET.songs[1]!] };
    const markup = renderToStaticMarkup(createElement(Page, { role: 'viewer', snapshot: { ...SNAPSHOT, set }, connected: true, send: () => {}, part: 'Drums', onPart: () => {}, onDisplay: () => {}, charts: fourFour }));
    expect(padBars(markup)).toBe('20 bars');
  });
});
