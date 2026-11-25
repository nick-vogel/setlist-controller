import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProducerSnapshot, SetList, Snapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';
import { buildTimeline } from '../web/src/timeline-model.ts';
import { readStylesheet, type Element } from './css.ts';

const stylesheet = readStylesheet(resolve(import.meta.dirname, '../web/src/styles.css'));

const MIXED_SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Build My Life',
      sections: [
        { name: 'Count Off', time: 0, end: 8, cue: 0 },
        { name: 'Verse', time: 8, end: 24, cue: 1 },
        { name: 'Pad', time: 24, end: 30, cue: 2 },
      ],
      end: 30,
      endCue: 3,
    },
    {
      number: 2,
      title: 'Goodness of God',
      sections: [
        { name: 'Intro', time: 42, end: 54, cue: 4 },
        { name: 'Chorus', time: 54, end: 66, cue: 5, skip: true },
        { name: 'Pad Out', time: 66, end: 72, cue: 6 },
      ],
      end: 72,
      endCue: 7,
    },
  ],
  warnings: [],
};

const SNAPSHOT: ProducerSnapshot = {
  live: 'connected',
  set: MIXED_SET,
  playing: true,
  position: 10,
  now: { song: 1, section: 1, next: 2, bar: 1, bars: 4, fraction: 0.125 },
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop', 2: 'stop' },
  loop: null,
  safeMode: true,
  fade: null,
  chartRevision: 1,
  songMeters: { 1: 4, 2: 3 },
  power: { source: 'ac', percent: 100 },
  connections: [],
  connectionProblems: [],
};

describe('timeline layout geometry', () => {
  it('lays out mixed-meter songs end-to-end with equal pixel width per bar and accurate ticks', () => {
    const layout = buildTimeline(MIXED_SET, { 1: 4, 2: 3 });

    expect(layout.songs).toHaveLength(2);
    expect(layout.songs[0]).toMatchObject({ number: 1, title: 'Build My Life', left: 0, width: 576, beatsPerBar: 4 });
    expect(layout.gaps).toEqual([{ startBeat: 30, endBeat: 42, left: 576, width: 288 }]);
    expect(layout.songs[1]).toMatchObject({ number: 2, title: 'Goodness of God', left: 864, width: 720, beatsPerBar: 3 });
    expect(layout.totalWidth).toBe(1584);

    const verse = layout.sections.find((s) => s.song === 1 && s.name === 'Verse')!;
    const intro = layout.sections.find((s) => s.song === 2 && s.name === 'Intro')!;
    expect(verse.width).toBe(288);
    expect(intro.width).toBe(288);
    const barWidth = verse.width / 4;
    expect(1080 / barWidth).toBeGreaterThanOrEqual(12);
    expect(1080 / barWidth).toBeLessThanOrEqual(16);
    expect(verse.ticks.map((t) => [t.bar, t.offsetX])).toEqual([
      [1, 0],
      [2, 72],
      [3, 144],
      [4, 216],
    ]);
    expect(intro.ticks.map((t) => [t.bar, t.offsetX])).toEqual([
      [1, 0],
      [2, 72],
      [3, 144],
      [4, 216],
    ]);
  });

  it('classifies Count Off, Pad, Pad Out, skipped sections, and song End boundaries', () => {
    const layout = buildTimeline(MIXED_SET, { 1: 4, 2: 3 });

    expect(layout.sections.map((s) => ({ name: s.name, kind: s.kind, skipped: s.skipped }))).toEqual([
      { name: 'Count Off', kind: 'count-off', skipped: false },
      { name: 'Verse', kind: 'section', skipped: false },
      { name: 'Pad', kind: 'pad', skipped: false },
      { name: 'Intro', kind: 'section', skipped: false },
      { name: 'Chorus', kind: 'section', skipped: true },
      { name: 'Pad Out', kind: 'pad', skipped: false },
    ]);
    expect(layout.ends).toEqual([
      { song: 1, songTitle: 'Build My Life', beat: 30, x: 576 },
      { song: 2, songTitle: 'Goodness of God', beat: 72, x: 1584 },
    ]);
  });

  it('projects beatToX / xToBeat invertibly across mixed meters and computes loop braces', () => {
    const layout = buildTimeline(MIXED_SET, { 1: 4, 2: 3 });

    expect(layout.beatToX(27)).toBe(504);
    expect(layout.beatToX(36)).toBe(720);
    expect(layout.beatToX(48)).toBe(1008);
    for (const beat of [0, 8, 18, 24, 27, 30, 36, 42, 48, 60, 72]) {
      expect(layout.xToBeat(layout.beatToX(beat))).toBeCloseTo(beat, 6);
    }

    expect(layout.loopRect({ start: 42, length: 12, section: { song: 2, section: 0 } })).toEqual({
      left: 864,
      width: 288,
    });
    expect(layout.loopRect(null)).toBeNull();
  });

  it('handles touching songs with zero gap and a last song with no End locator', () => {
    const set: SetList = {
      songs: [
        {
          number: 1,
          title: 'Song One',
          sections: [{ name: 'Verse', time: 0, end: 16, cue: 0 }],
          end: 16,
          endCue: 1,
        },
        {
          number: 2,
          title: 'Open End',
          sections: [{ name: 'Intro', time: 16, end: null, cue: 2 }],
          end: null,
          endCue: null,
        },
      ],
      warnings: [],
    };
    const layout = buildTimeline(set, { 1: 4, 2: 4 }, 20);
    expect(layout.gaps).toEqual([]);
    expect(layout.songs[1]!.left).toBe(288);
    expect(layout.sections[1]!.width).toBe(288);
  });

  it('draws a Pad before a song in another meter using the next song meter and keeps Pad Out in its own meter', () => {
    const set: SetList = {
      songs: [
        {
          number: 1,
          title: 'Four',
          sections: [
            { name: 'Verse', time: 0, end: 16, cue: 0 },
            { name: 'Pad', time: 16, end: 25, cue: 1 },
          ],
          end: 25,
          endCue: 2,
        },
        {
          number: 2,
          title: 'Six Eight',
          sections: [
            { name: 'Intro', time: 25, end: 37, cue: 3 },
            { name: 'Pad Out', time: 37, end: 43, cue: 4 },
          ],
          end: 43,
          endCue: 5,
        },
      ],
      warnings: [],
    };
    const layout = buildTimeline(set, { 1: 4, 2: 3 });
    const pad = layout.sections.find((s) => s.name === 'Pad')!;
    expect(pad.width).toBe(216);
    expect(pad.beatsPerBar).toBe(3);
    expect(pad.ticks.map((tick) => tick.beat)).toEqual([16, 19, 22]);

    const padOut = layout.sections.find((s) => s.name === 'Pad Out')!;
    expect(padOut.width).toBe(144);
    expect(padOut.beatsPerBar).toBe(3);
    expect(padOut.ticks.map((tick) => tick.beat)).toEqual([37, 40]);
  });

  it('sizes a silent gap before a song in another meter using the entered song meter', () => {
    const set: SetList = {
      songs: [
        {
          number: 1,
          title: 'Four',
          sections: [{ name: 'Verse', time: 0, end: 16, cue: 0 }],
          end: 16,
          endCue: 1,
        },
        {
          number: 2,
          title: 'Six Eight',
          sections: [{ name: 'Intro', time: 28, end: 40, cue: 2 }],
          end: 40,
          endCue: 3,
        },
      ],
      warnings: [],
    };
    const [gap] = buildTimeline(set, { 1: 4, 2: 3 }).gaps;
    expect(gap!.width).toBe(288);
  });
});

describe('leader view switcher and Timeline markup', () => {
  const render = (role: 'leader' | 'producer' | 'viewer', leaderView: 'setlist' | 'timeline', snapshot: Snapshot | ProducerSnapshot = SNAPSHOT) =>
    renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {}, leaderView }));

  it('shows the Setlist / Timeline switcher on the leader page only, never on producer or viewer', () => {
    expect(render('leader', 'setlist')).toContain('leader-mode-switcher');
    expect(render('leader', 'timeline')).toContain('leader-mode-switcher');

    // Producer stays untouched even if timeline is stored in device settings.
    for (const view of ['setlist', 'timeline'] as const) {
      const producer = render('producer', view);
      expect(producer).not.toContain('leader-mode-switcher');
      expect(producer).not.toContain('timeline-view');
      expect(producer).toContain('Connections');
      expect(producer).toContain('Hold to stop');
    }

    expect(render('viewer', 'timeline')).not.toContain('leader-mode-switcher');
    expect(render('viewer', 'timeline')).not.toContain('timeline-view');
  });

  it('renders whole-set blocks, waveform background layer, overlays, skipped grey class, and no song-end toggles', () => {
    const snap: ProducerSnapshot = {
      ...SNAPSHOT,
      jump: { song: 2, section: 0 },
      countIn: true,
      loop: { start: 8, length: 16, section: { song: 1, section: 1 } },
    };
    const markup = render('leader', 'timeline', snap);
    const sectionButton = (song: number, section: number) =>
      markup.match(new RegExp(`<button[^>]*data-song="${song}"[^>]*data-section="${section}"[^>]*>.*?</button>`))?.[0] ?? '';
    const buttonClasses = (song: number, section: number) =>
      sectionButton(song, section).match(/class="([^"]*)"/)?.[1]?.split(' ') ?? [];

    expect(buttonClasses(1, 1)).toEqual(expect.arrayContaining(['timeline-section', 'section', 'current', 'looping']));
    expect(sectionButton(1, 1)).toContain('timeline-waveform-layer');
    expect(buttonClasses(2, 0)).toEqual(expect.arrayContaining(['timeline-section', 'section', 'waiting', 'count-in-target']));
    expect(buttonClasses(2, 1)).toEqual(expect.arrayContaining(['timeline-section', 'section', 'skipped']));
    expect(markup).toMatch(/<div class="timeline-gap" data-gap-start="30" data-gap-end="42"/);
    expect(markup).toMatch(/<div class="timeline-end" data-song-end="1"/);
    expect(markup).toMatch(/<div class="timeline-end" data-song-end="2"/);
    expect(markup).toMatch(/<div class="timeline-loop-brace" data-loop-start="8" data-loop-length="16"/);
    expect(markup).toContain('Pause');
    expect(markup).not.toContain('Hold to stop');
    expect(markup).not.toContain('Stop at end');
    expect(markup).not.toContain('Continue into next song');
  });

  it('styles Pad/Pad Out, Count Off, silent gaps, and skipped sections distinctly in CSS', () => {
    const inLane = (element: Element): Element[] => [
      { tag: 'html' },
      { tag: 'body' },
      { tag: 'main', classes: ['timeline-page'] },
      { tag: 'div', classes: ['timeline-view'] },
      { tag: 'div', classes: ['timeline-viewport'] },
      { tag: 'div', classes: ['timeline-scroll'] },
      { tag: 'div', classes: ['timeline-canvas'] },
      { tag: 'div', classes: ['timeline-track'] },
      { tag: 'div', classes: ['timeline-lane'] },
      element,
    ];

    const regularBg = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'section'] }), 'background');
    const padImage = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'pad'] }), 'background-image');
    const countOffBg = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'count-off'] }), 'background');
    const skippedColor = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'section', 'skipped'] }), 'color');
    const gapBg = stylesheet.value(inLane({ tag: 'div', classes: ['timeline-gap'] }), 'background');

    expect(padImage).toContain('repeating-linear-gradient');
    expect(countOffBg).toBeDefined();
    expect(countOffBg).not.toBe(regularBg);
    expect(gapBg).toBeDefined();
    expect(gapBg).not.toBe(regularBg);

    const regularColor = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'section'] }), 'color');
    const currentBg = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'section', 'current'] }), 'background-color');
    const currentColor = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'section', 'current'] }), 'color');
    const currentSkippedBg = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'section', 'current', 'skipped'] }), 'background-color');
    const currentSkippedColor = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'section', 'current', 'skipped'] }), 'color');
    const currentPadBg = stylesheet.value(inLane({ tag: 'button', classes: ['timeline-section', 'pad', 'current'] }), 'background-color');

    expect(skippedColor).toBeDefined();
    expect(skippedColor).not.toBe(regularColor);
    expect(currentSkippedBg).toBe(currentBg);
    expect(currentSkippedColor).toBe(currentColor);
    expect(currentPadBg).not.toBe(currentBg);
  });
});
