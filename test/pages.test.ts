import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Command, PageCommand } from '../src/shared/command.ts';
import { controls, leaderPagePath, leaderSocketPath, pageRole, producerPagePath, producerSocketPath, type Role } from '../src/shared/routes.ts';
import type { SetCharts } from '../src/shared/set-manifest.ts';
import type { ConnectionsStatus, PedalStatus } from '../src/shared/setup.ts';
import type { Connection, ProducerSnapshot, SetList, Snapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';
import { CHORD_NAMES, DISPLAYS, FONT_SIZES, PARTS, VIEWS, type ChordNames, type Display, type FontSize, type Part, type View } from '../web/src/device-settings.ts';
import { ConnectionsPanel } from '../web/src/ConnectionsPanel.tsx';
import { ConnectionsSetup } from '../web/src/ConnectionsSetup.tsx';
import { AUTO_LOCK_TIP } from '../web/src/AutoLockTip.tsx';
import { CountInButton } from '../web/src/CountInButton.tsx';
import { FadeOutButton } from '../web/src/FadeOutButton.tsx';
import { NowPlaying } from '../web/src/NowPlaying.tsx';
import { PedalSetup } from '../web/src/PedalSetup.tsx';
import { PlayFromStartButton } from '../web/src/PlayFromStartButton.tsx';
import { RefreshButton } from '../web/src/RefreshButton.tsx';
import { SectionControls } from '../web/src/SectionControls.tsx';
import { sectionState } from '../web/src/section-state.ts';
import { Setup } from '../web/src/Setup.tsx';
import { SongHeading } from '../web/src/SongHeading.tsx';
import { SongStepButton } from '../web/src/SongStepButton.tsx';
import { readStylesheet, type Element } from './css.ts';

// The pages, rendered without a browser: their markup, and the stylesheet's cascade over it.

const SET: SetList = {
  songs: [
    {
      number: 1,
      title: null,
      sections: [
        { name: 'Verse', time: 0, end: 16, cue: 0 },
        { name: 'A chorus with a name long enough to wrap on a phone', time: 16, end: 32, cue: 1 },
      ],
      end: 32,
      endCue: 2,
    },
  ],
  warnings: [],
};
const PLAYING: Snapshot['now'] = { song: 1, section: 0, next: 1, bar: 2, bars: 4, fraction: 0.25 };
const WAITING: Snapshot['jump'] = { song: 1, section: 1 };
// The jump Next makes from a song's last section, to the song's End, while it waits.
const END_JUMP: Snapshot['jump'] = { song: 1, section: 'end' };
// The playhead on the song's last section, from which Next goes to End.
const LAST: Snapshot['now'] = { song: 1, section: 1, next: 'end', bar: 2, bars: 4, fraction: 0.25 };
const LOOPING: Snapshot['loop'] = { start: 0, length: 16, section: { song: 1, section: 0 } };
// A brace set by hand at the laptop, on no section.
const HAND_LOOP: Snapshot['loop'] = { start: 4, length: 8, section: null };
// A song with no End locator, and the playhead on its last section.
const NO_END_SET: SetList = {
  songs: [
    {
      number: 1,
      title: null,
      sections: [
        { name: 'Verse', time: 0, end: 16, cue: 0 },
        { name: 'Chorus', time: 16, end: null, cue: 1 },
      ],
      end: null,
      endCue: null,
    },
  ],
  warnings: [],
};
const NO_END_LAST: Snapshot['now'] = { song: 1, section: 1, next: 'end', bar: 2, bars: null, fraction: null };
// Song 1 opens on a Count Off and ends on a Pad before its End. Song 2 has no Count Off.
const COUNT_IN_SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Build My Life',
      sections: [
        { name: 'Count Off', time: 0, end: 8, cue: 0 },
        { name: 'Intro', time: 8, end: 24, cue: 1 },
        { name: 'Verse', time: 24, end: 40, cue: 2 },
        { name: 'Bridge', time: 40, end: 48, cue: 3 },
        { name: 'Pad', time: 48, end: 56, cue: 4 },
      ],
      end: 56,
      endCue: 5,
    },
    {
      number: 2,
      title: 'Goodness of God',
      sections: [
        { name: 'Intro', time: 64, end: 72, cue: 6 },
        { name: 'Verse', time: 72, end: 80, cue: 7 },
      ],
      end: 80,
      endCue: 8,
    },
  ],
  warnings: [],
};
const onSection = (song: number, section: number): Snapshot['now'] => ({ song, section, next: section + 1, bar: 1, bars: 2, fraction: 0 });
// A song that opens on a Count Off and runs from its last section straight to its End, with no Pad.
const COUNT_OFF_TO_END_SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Way Maker',
      sections: [
        { name: 'Count Off', time: 0, end: 8, cue: 0 },
        { name: 'Intro', time: 8, end: 24, cue: 1 },
        { name: 'Chorus', time: 24, end: 40, cue: 2 },
      ],
      end: 40,
      endCue: 3,
    },
  ],
  warnings: [],
};
// The same song with no End locator.
const COUNT_OFF_NO_END_SET: SetList = {
  songs: [
    {
      ...COUNT_OFF_TO_END_SET.songs[0]!,
      sections: COUNT_OFF_TO_END_SET.songs[0]!.sections.map((section) => (section.name === 'Chorus' ? { ...section, end: null } : section)),
      end: null,
      endCue: null,
    },
  ],
  warnings: [],
};

const nowPlaying = (
  now: Snapshot['now'],
  jump: Snapshot['jump'],
  live: Snapshot['live'] = 'connected',
  loop: Snapshot['loop'] = null,
  countIn = false,
) => renderToStaticMarkup(createElement(NowPlaying, { live, set: SET, now, jump, countIn, loop }));
// The text a page shows, without its markup.
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
// A pre-service check's problem lines, and the names under its Cannot match:, as the markup holds them.
const problemLines = (markup: string) => [...markup.matchAll(/<li class="check-problem">([^<]*)<\/li>/g)].map(([, line]) => line);
const unmatchedNames = (markup: string) => [...markup.matchAll(/<li class="check-unmatched-name">([^<]*)<\/li>/g)].map(([, name]) => name);
// The classes on each element, in document order.
const classes = (markup: string) => [...markup.matchAll(/class="([^"]*)"/g)].map(([, names = '']) => names.split(' '));
// The elements and their attributes, without the text in them.
const shape = (markup: string) => markup.replace(/>[^<]*</g, '><');

const stylesheet = readStylesheet(resolve(import.meta.dirname, '../web/src/styles.css'));
const inNowPlaying = (element: Element): Element[] => [
  { tag: 'html' },
  { tag: 'body' },
  { tag: 'div' },
  { tag: 'main' },
  { tag: 'section', classes: ['now-playing'] },
  element,
];

describe('the now-playing block', () => {
  // The leader's tap targets sit under it, so a line that comes and goes would move them under the
  // leader's finger.
  it('keeps the same elements whether or not a jump waits', () => {
    expect(shape(nowPlaying(PLAYING, WAITING))).toBe(shape(nowPlaying(PLAYING, null)));
    expect(shape(nowPlaying(null, WAITING))).toBe(shape(nowPlaying(null, null)));
  });

  it('says "Count in to" the waiting jump while it is a count-in, and "Jumping to" it otherwise, in the same place', () => {
    const chorus = SET.songs[0]!.sections[1]!.name;
    expect(text(nowPlaying(PLAYING, WAITING, 'connected', null, true))).toContain(`Count in to ${chorus}.`);
    expect(text(nowPlaying(PLAYING, WAITING, 'connected', null, true))).not.toContain('Jumping to');
    expect(text(nowPlaying(PLAYING, WAITING))).toContain(`Jumping to ${chorus}.`);
    expect(text(nowPlaying(PLAYING, WAITING))).not.toContain('Count in to');
    expect(shape(nowPlaying(PLAYING, WAITING, 'connected', null, true))).toBe(shape(nowPlaying(PLAYING, null)));
  });

  it('says "Jumping to End." while the jump to End waits, in the same place as any other jump', () => {
    expect(text(nowPlaying(LAST, END_JUMP))).toContain('Jumping to End.');
    expect(text(nowPlaying(null, END_JUMP))).toContain('Jumping to End.');
    expect(shape(nowPlaying(LAST, END_JUMP))).toBe(shape(nowPlaying(LAST, null)));
    expect(shape(nowPlaying(null, END_JUMP))).toBe(shape(nowPlaying(null, null)));
  });

  it('shows no Next on the last section of a song with no End, and keeps the line in its place', () => {
    const markup = renderToStaticMarkup(createElement(NowPlaying, { live: 'connected', set: NO_END_SET, now: NO_END_LAST, jump: null, countIn: false, loop: null }));
    expect(text(markup)).not.toContain('Next');
    expect(text(nowPlaying(PLAYING, null))).toContain('Next');
    expect(markup).toContain('class="now-next"');
  });

  // During a count-in the Count Off plays, but the band comes in on the target, so the Next line names
  // the section after the target, in the target's song.
  it("names the section after a count-in's target on the Next line, and the one after the playhead for a tap", () => {
    const markup = (set: SetList, section: number, countIn: boolean) =>
      renderToStaticMarkup(createElement(NowPlaying, { live: 'connected', set, now: onSection(1, 0), jump: { song: 1, section }, countIn, loop: null }));
    const nextLine = (set: SetList, section: number, countIn: boolean) => text(/<p class="now-next">(.*?)<\/p>/.exec(markup(set, section, countIn))?.[1] ?? 'missing');
    expect(nextLine(COUNT_IN_SET, 1, true)).toBe('Next Verse');
    expect(nextLine(COUNT_IN_SET, 2, true)).toBe('Next Bridge');
    expect(nextLine(COUNT_IN_SET, 3, true)).toBe('Next Pad');
    expect(nextLine(COUNT_OFF_TO_END_SET, 2, true)).toBe('Next End');
    expect(nextLine(COUNT_OFF_NO_END_SET, 2, true)).toBe('');
    expect(markup(COUNT_OFF_NO_END_SET, 2, true)).toContain('class="now-next"');
    for (const section of [1, 2, 3]) {
      expect(nextLine(COUNT_IN_SET, section, false), `tap to ${section}`).toBe('Next Intro');
      expect(shape(markup(COUNT_IN_SET, section, true))).toBe(shape(markup(COUNT_IN_SET, section, false)));
    }
    expect(nextLine(COUNT_OFF_NO_END_SET, 2, false)).toBe('Next Intro');
  });

  it('keeps the jump line to one line, however long the section name', () => {
    expect(stylesheet.value(inNowPlaying({ tag: 'p', classes: ['now-jump'] }), 'white-space')).toBe('nowrap');
  });

  it('sets the Next line and the jump line apart from the lines above them', () => {
    expect(stylesheet.value(inNowPlaying({ tag: 'p', classes: ['now-next'] }), 'margin-top')).toBe('0.75rem');
    expect(stylesheet.value(inNowPlaying({ tag: 'p', classes: ['now-jump'] }), 'margin-top')).toBe('0.75rem');
  });
});

describe('the loop line', () => {
  // Like the jump line, it sits above the leader's controls, so it never comes and goes.
  it('keeps the same elements whether or not a loop is on', () => {
    for (const loop of [LOOPING, HAND_LOOP]) {
      expect(shape(nowPlaying(PLAYING, null, 'connected', loop))).toBe(shape(nowPlaying(PLAYING, null)));
      expect(shape(nowPlaying(null, null, 'connected', loop))).toBe(shape(nowPlaying(null, null)));
    }
  });

  it('names the looped section, or says a loop is on when the brace matches no section', () => {
    expect(text(nowPlaying(PLAYING, null, 'connected', LOOPING))).toContain('Looping Verse.');
    expect(text(nowPlaying(null, null, 'connected', LOOPING))).toContain('Looping Verse.');
    expect(text(nowPlaying(PLAYING, null, 'connected', HAND_LOOP))).toContain('Loop on.');
    expect(text(nowPlaying(PLAYING, null))).not.toMatch(/Loop/);
  });

  it('keeps the loop line to one line, however long the section name', () => {
    expect(stylesheet.value(inNowPlaying({ tag: 'p', classes: ['now-loop'] }), 'white-space')).toBe('nowrap');
  });
});

describe('the section controls', () => {
  const controls = (now: Snapshot['now'], loop: Snapshot['loop'], set: SetList = SET, jump: Snapshot['jump'] = null, countIn = false) =>
    renderToStaticMarkup(createElement(SectionControls, { set, now, jump, countIn, loop, available: true, send: () => {} }));
  // Each button's label and whether it is pressed and disabled, in order.
  const buttons = (markup: string) =>
    [...markup.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attributes = '', label]) => ({
      label,
      pressed: /aria-pressed="true"/.test(attributes),
      disabled: /disabled=""/.test(attributes),
    }));

  it('offers Previous, Loop and Next, with Loop pressed while a loop is on', () => {
    expect(buttons(controls(PLAYING, null))).toEqual([
      { label: 'Previous', pressed: false, disabled: false },
      { label: 'Loop', pressed: false, disabled: false },
      { label: 'Next', pressed: false, disabled: false },
    ]);
    expect(buttons(controls(PLAYING, LOOPING)).map((button) => button.pressed)).toEqual([false, true, false]);
    expect(buttons(controls(PLAYING, HAND_LOOP)).map((button) => button.pressed)).toEqual([false, true, false]);
  });

  it('disables them with no section playing, but lets the leader release a loop that is on', () => {
    expect(buttons(controls(null, null)).map((button) => button.disabled)).toEqual([true, true, true]);
    expect(buttons(controls(null, HAND_LOOP)).map((button) => button.disabled)).toEqual([true, false, true]);
  });

  it('disables Next and Loop on the last section of a song with no End, where the server ignores both', () => {
    expect(buttons(controls(NO_END_LAST, null, NO_END_SET)).map((button) => button.disabled)).toEqual([false, true, true]);
    expect(buttons(controls(NO_END_LAST, HAND_LOOP, NO_END_SET)).map((button) => button.disabled)).toEqual([false, false, true]);
    expect(buttons(controls({ ...NO_END_LAST, section: 0, next: 1 }, null, NO_END_SET)).map((button) => button.disabled)).toEqual([false, false, false]);
  });

  it('enables Loop by the section a waiting jump goes to, which the server braces in place of the one playing', () => {
    const loopDisabled = (now: Snapshot['now'], jump: Snapshot['jump']) => buttons(controls(now, null, NO_END_SET, jump))[1]?.disabled;
    expect(loopDisabled(NO_END_LAST, { song: 1, section: 0 })).toBe(false);
    expect(loopDisabled({ ...NO_END_LAST, section: 0, next: 1 }, { song: 1, section: 1 })).toBe(true);
  });

  it('disables Loop while the jump to End waits, which the server refuses', () => {
    expect(buttons(controls(LAST, null, SET, END_JUMP))[1]?.disabled).toBe(true);
    expect(buttons(controls(LAST, null, SET, null))[1]?.disabled).toBe(false);
  });

  // During a count-in the server moves its target with Next and Previous, and ignores either where the
  // target cannot move: Previous on the section right after the Count Off, Next on the last section
  // before a Pad or End.
  it('enables Previous and Next during a count-in from its target, as the server judges them', () => {
    const disabled = (set: SetList, section: number) => buttons(controls(onSection(1, 0), null, set, { song: 1, section }, true)).map((button) => button.disabled);
    expect(disabled(COUNT_IN_SET, 1), 'Intro').toEqual([true, false, false]);
    expect(disabled(COUNT_IN_SET, 2), 'Verse').toEqual([false, false, false]);
    expect(disabled(COUNT_IN_SET, 3), 'Bridge, before the Pad').toEqual([false, false, true]);
    expect(disabled(COUNT_OFF_TO_END_SET, 2), 'Chorus, before End').toEqual([false, false, true]);
  });

  it('enables Previous and Next from the section playing for a tap, as it does outside a count-in', () => {
    for (const [set, section] of [
      [COUNT_IN_SET, 1],
      [COUNT_IN_SET, 2],
      [COUNT_IN_SET, 3],
      [COUNT_OFF_TO_END_SET, 2],
    ] as const) {
      expect(buttons(controls(onSection(1, 0), null, set, { song: 1, section })).map((button) => button.disabled), `section ${section}`).toEqual([false, false, false]);
    }
  });

  it('follows a count-in\'s target on the leader and producer pages', () => {
    const snapshot = (section: number): ProducerSnapshot => ({
      ...SNAPSHOT,
      set: COUNT_IN_SET,
      endToggles: { 1: 'stop', 2: 'stop' },
      playing: true,
      now: onSection(1, 0),
      jump: { song: 1, section },
      countIn: true,
      connections: [],
      connectionProblems: [],
    });
    const onPage = (role: Role, section: number) => {
      const markup = renderToStaticMarkup(createElement(Page, { role, snapshot: snapshot(section), connected: true, send: () => {} }));
      return buttons(/<section class="section-controls"[^>]*>(.*?)<\/section>/.exec(markup)?.[1] ?? '').map((button) => [button.label, button.disabled]);
    };
    for (const role of ['leader', 'producer'] as const) {
      expect(onPage(role, 1), role).toEqual([
        ['Previous', true],
        ['Loop', false],
        ['Next', false],
      ]);
      expect(onPage(role, 3), role).toEqual([
        ['Previous', false],
        ['Loop', false],
        ['Next', true],
      ]);
    }
  });

  // The jump targets on a page, each by its label and whether it is disabled, in order.
  const jumpTargets = (role: Role, set: SetList, now: Snapshot['now'], jump: Snapshot['jump'], countIn: boolean) => {
    const snapshot: ProducerSnapshot = {
      ...SNAPSHOT,
      set,
      endToggles: { 1: 'stop', 2: 'stop' },
      playing: true,
      now,
      jump,
      countIn,
      connections: [],
      connectionProblems: [],
    };
    const markup = renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {} }));
    return buttons(/<section class="jump-targets"[^>]*>(.*?)<\/section>/.exec(markup)?.[1] ?? '').map((button) => [button.label, button.disabled]);
  };

  // During a count-in the server takes a tap in its song only onto a section the count can land on,
  // and ignores a tap on the Count Off, anything before it, or a Pad (playback-controller.ts, the
  // jump command's count-in branch). The leader's and producer's tap targets are enabled the same
  // way.
  it("disables the tap targets of a count-in's song that the server ignores, on the leader and producer pages", () => {
    for (const role of ['leader', 'producer'] as const) {
      expect(jumpTargets(role, COUNT_IN_SET, onSection(1, 0), { song: 1, section: 3 }, true), role).toEqual([
        ['Count Off', true],
        ['Intro', false],
        ['Verse', false],
        ['Bridge', false],
        ['Pad', true],
      ]);
    }
  });

  it('enables every tap target outside a count-in', () => {
    for (const role of ['leader', 'producer'] as const) {
      expect(jumpTargets(role, COUNT_IN_SET, onSection(1, 0), { song: 1, section: 3 }, false), role).toEqual([
        ['Count Off', false],
        ['Intro', false],
        ['Verse', false],
        ['Bridge', false],
        ['Pad', false],
      ]);
    }
  });

  // The server takes a tap in a song other than the count-in's as an ordinary jump.
  it("enables every tap target of a song other than the count-in's", () => {
    const set: SetList = {
      ...COUNT_IN_SET,
      songs: [
        COUNT_IN_SET.songs[0]!,
        {
          number: 2,
          title: 'Goodness of God',
          sections: [
            { name: 'Count Off', time: 64, end: 72, cue: 6 },
            { name: 'Intro', time: 72, end: 80, cue: 7 },
            { name: 'Verse', time: 80, end: 88, cue: 8 },
          ],
          end: 88,
          endCue: 9,
        },
      ],
    };
    for (const role of ['leader', 'producer'] as const) {
      expect(jumpTargets(role, set, onSection(1, 0), { song: 2, section: 2 }, true), role).toEqual([
        ['Count Off', false],
        ['Intro', false],
        ['Verse', false],
        ['Bridge', false],
        ['Pad', false],
      ]);
    }
  });

  it('sizes them for a finger, as the tap targets are', () => {
    const control: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['section-controls'] }, { tag: 'button', classes: ['section-control'] }];
    expect(stylesheet.value(control, 'min-height')).toBe('4.5rem');
    expect(stylesheet.value(control, 'touch-action')).toBe('manipulation');
  });

  it('marks the pressed Loop apart from the others', () => {
    const control = (classes: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['section-controls'] }, { tag: 'button', classes }];
    expect(stylesheet.value(control(['section-control', 'on']), 'border-color')).toBeDefined();
    expect(stylesheet.value(control(['section-control', 'on']), 'border-color')).not.toBe(stylesheet.value(control(['section-control']), 'border-color'));
  });
});

describe('the looped section', () => {
  const VERSE = { song: 1, section: 0 };
  const CHORUS = { song: 1, section: 1 };

  it('is marked as looping in the setlist and the tap targets, and no other section is', () => {
    expect(sectionState(VERSE, PLAYING, null, LOOPING).classes.split(' ')).toContain('looping');
    expect(sectionState(CHORUS, PLAYING, null, LOOPING).classes.split(' ')).not.toContain('looping');
    expect(sectionState(VERSE, PLAYING, null, HAND_LOOP).classes.split(' ')).not.toContain('looping');
    expect(sectionState(VERSE, PLAYING, null, null).classes.split(' ')).not.toContain('looping');
  });

  it('looks unlike a waiting jump in both places', () => {
    const item = (names: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['song'] }, { tag: 'ol', classes: ['sections'] }, { tag: 'li', classes: names }];
    expect(stylesheet.value(item(['looping']), 'outline')).toMatch(/solid/);
    expect(stylesheet.value(item(['looping']), 'outline')).not.toBe(stylesheet.value(item(['waiting']), 'outline'));

    const target = (names: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['jump-targets'] }, { tag: 'button', classes: ['jump-target', ...names] }];
    expect(stylesheet.value(target(['looping']), 'border-color')).toBeDefined();
    expect(stylesheet.value(target(['looping']), 'border-color')).not.toBe(stylesheet.value(target(['waiting']), 'border-color'));
  });

  it('keeps the waiting mark on a section that is also looped, with the loop mark beside it', () => {
    const item = (names: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['song'] }, { tag: 'ol', classes: ['sections'] }, { tag: 'li', classes: names }];
    expect(stylesheet.value(item(['waiting', 'looping']), 'outline')).toBe(stylesheet.value(item(['waiting']), 'outline'));
    expect(stylesheet.value(item(['waiting', 'looping']), 'box-shadow')).toContain('#46a758');

    const target = (names: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['jump-targets'] }, { tag: 'button', classes: ['jump-target', ...names] }];
    expect(stylesheet.value(target(['waiting', 'looping']), 'border-color')).toBe(stylesheet.value(target(['waiting']), 'border-color'));
    expect(stylesheet.value(target(['waiting', 'looping']), 'border-style')).toBe('dashed');
    expect(stylesheet.value(target(['waiting', 'looping']), 'box-shadow')).toContain('#46a758');
  });
});

describe('the Live not connected state', () => {
  const lost = nowPlaying(null, null, 'not-connected');
  const stopped = nowPlaying(null, null);

  it('says Live is not connected where the song would be, and not that the set is between songs', () => {
    expect(text(lost)).toContain('Live not connected');
    expect(text(lost)).not.toContain('Between songs.');
    expect(text(stopped)).not.toContain('Live not connected');
  });

  it('looks unlike a stopped song: a warning colour and a border the stopped panel has none of', () => {
    const lostPanel = classes(lost)[0] ?? [];
    const stoppedPanel = classes(stopped)[0] ?? [];
    const panel = (names: string[]): Element[] => [
      { tag: 'html' },
      { tag: 'body' },
      { tag: 'div' },
      { tag: 'main' },
      { tag: 'section', classes: names },
    ];
    const border = (names: string[]) => stylesheet.value(panel(names), 'border');
    const background = (names: string[]) => stylesheet.value(panel(names), 'background');

    expect(border(lostPanel)).toMatch(/solid/);
    expect(border(stoppedPanel)).toBeUndefined();
    expect(background(lostPanel)).not.toBe(background(stoppedPanel));

    const title = (markup: string, names: string[]) =>
      stylesheet.value([...panel(names), { tag: 'p', classes: classes(markup)[1] ?? [] }], 'color');
    // The helper models no inheritance, so a title with no colour of its own reads as undefined.
    expect(title(lost, lostPanel)).toBeDefined();
    expect(title(lost, lostPanel)).not.toBe(title(stopped, stoppedPanel));
  });
});

const NO_PEDAL: PedalStatus = {
  configPath: null,
  config: 'missing',
  problems: ['No pedal config file was given. The pedal does nothing.'],
  mappings: [],
  input: { kind: 'none' },
  monitor: [],
};
const SNAPSHOT: Snapshot = {
  live: 'connected',
  set: SET,
  playing: false,
  position: 0,
  now: PLAYING,
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop' },
  fade: null,
  loop: null,
  safeMode: true,
  chartRevision: 1,
  songMeters: { 1: 4 },
};
const setup = (snapshot: Snapshot | null) => text(renderToStaticMarkup(createElement(Setup, { snapshot, connected: true })));
// The text of the setup screen's status line alone, apart from the now-playing panel under it.
const liveStatus = (snapshot: Snapshot) =>
  /<p class="live-status[^"]*">([^<]*)<\/p>/.exec(renderToStaticMarkup(createElement(Setup, { snapshot, connected: true })))?.[1];

describe('the setup screen', () => {
  it("lists every warning about the set's locators", () => {
    const set: SetList = {
      ...SET,
      warnings: [
        { kind: 'unparseable-locator', locator: 'Bridge', message: 'The locator "Bridge" does not read as "<song number> - <section name>".' },
        { kind: 'song-number-gap', song: 2, message: 'There is no song 2.' },
      ],
    };
    const markup = renderToStaticMarkup(createElement(Setup, { snapshot: { ...SNAPSHOT, set }, connected: true }));

    const list = /<ul class="warnings">(.*?)<\/ul>/.exec(markup)?.[1] ?? '';
    expect([...list.matchAll(/<li>([^<]*)<\/li>/g)].map(([, item]) => item)).toEqual([
      'The locator &quot;Bridge&quot; does not read as &quot;&lt;song number&gt; - &lt;section name&gt;&quot;.',
      'There is no song 2.',
    ]);
  });

  it('says so when the set has no warnings', () => {
    expect(setup(SNAPSHOT)).toContain('No warnings.');
  });

  it("shows Live's connection status as its own line", () => {
    expect(liveStatus(SNAPSHOT)).toBe('Live connected');
    expect(liveStatus({ ...SNAPSHOT, live: 'not-connected', now: null, position: null })).toBe('Live not connected');
  });

  it('keeps the warnings in view while Live is not connected', () => {
    const set: SetList = { ...SET, warnings: [{ kind: 'missing-end', song: 1, message: 'Song 1 has no End locator.' }] };

    expect(setup({ ...SNAPSHOT, live: 'not-connected', set, now: null, position: null })).toContain('Song 1 has no End locator.');
  });
  // The leader's join URL carries the 32-character secret and has no space to break at, so on a
  // narrow window it must break anywhere or it widens the page.
  it('wraps a join URL anywhere, so the leader URL never widens the page', () => {
    const url: Element[] = [{ tag: 'figure', classes: ['join-code'] }, { tag: 'figcaption' }, { tag: 'span', classes: ['join-url'] }];
    expect(stylesheet.value(url, 'overflow-wrap')).toBe('anywhere');
  });
});

describe("the setup screen's pedal section", () => {
  const LOADED: PedalStatus = {
    configPath: '/Users/nick/Library/Application Support/setlist-controller/pedal.json',
    config: 'loaded',
    problems: [],
    mappings: [
      { switch: 1, message: 'B0 50 7F', action: 'loop' },
      { switch: 2, message: 'B0 51 7F', action: 'next' },
      { switch: 3, message: 'B0 52 7F', action: 'previous' },
    ],
    input: { kind: 'ready' },
    monitor: [],
  };
  // The setup screen reads the pedal status on its own route, so the section is drawn from it directly.
  const pedalMarkup = (pedal: PedalStatus) => renderToStaticMarkup(createElement(PedalSetup, { pedal }));
  // The text of each item in the list with that class, in order.
  const items = (markup: string, list: string) =>
    [...(new RegExp(`<ul class="${list}">(.*?)</ul>`).exec(markup)?.[1] ?? '').matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(([, item = '']) => text(item));

  it('holds the foot pedal section, loading its status, before and after the first snapshot', () => {
    for (const snapshot of [null, SNAPSHOT]) {
      const markup = renderToStaticMarkup(createElement(Setup, { snapshot, connected: true }));
      expect(markup).toContain('<h2 id="pedal">Foot pedal</h2>');
      expect(text(markup)).toContain('Loading the foot pedal.');
    }
  });

  it('lists each problem with the pedal config file, and the path it read', () => {
    const pedal: PedalStatus = {
      ...LOADED,
      config: 'invalid',
      problems: ['Switch 2 is mapped to Stop. Stop can never be on the pedal, so the pedal config is not used.', 'There is a second problem.'],
      mappings: [],
    };
    const markup = pedalMarkup(pedal);

    expect(items(markup, 'pedal-problems')).toEqual(pedal.problems);
    expect(text(markup)).toContain(LOADED.configPath);
    expect(text(markup)).toContain('Pedal config rejected');
  });

  it('says when there is no pedal config file', () => {
    expect(text(pedalMarkup(NO_PEDAL))).toContain('No pedal config file was given. The pedal does nothing.');
  });

  it('shows each switch with its message and action', () => {
    const markup = pedalMarkup(LOADED);

    expect(text(markup)).toContain('Pedal config loaded');
    expect(items(markup, 'pedal-mappings')).toEqual([
      'Switch 1 B0 50 7F Loop',
      'Switch 2 B0 51 7F Next section',
      'Switch 3 B0 52 7F Previous section',
    ]);
  });

  it('shows every message of a switch that alternates between messages, each in a monospaced face', () => {
    const markup = pedalMarkup({
      ...LOADED,
      mappings: [
        { switch: 1, message: ['B0 50 7F', 'B0 50 00'], action: 'loop' },
        { switch: 2, message: 'B0 51 7F', action: 'next' },
      ],
    });

    expect(items(markup, 'pedal-mappings')).toEqual(['Switch 1 B0 50 7F B0 50 00 Loop', 'Switch 2 B0 51 7F Next section']);
    expect(markup).toContain('<code>B0 50 7F</code> <code>B0 50 00</code>');
  });

  it("shows the MIDI input's state", () => {
    expect(text(pedalMarkup(LOADED))).toContain('MIDI input ready.');
    expect(text(pedalMarkup(NO_PEDAL))).toContain('No MIDI input.');
    expect(text(pedalMarkup({ ...LOADED, input: { kind: 'unavailable', message: 'CoreMIDI did not load.' } }))).toContain(
      'MIDI input unavailable: CoreMIDI did not load.',
    );
  });

  it('shows the MIDI monitor newest first, each message as hex, in words, and the action it ran', () => {
    const markup = pedalMarkup({
      ...LOADED,
      monitor: [
        { id: 1, message: 'B0 50 7F', description: 'Control change 80, value 127, channel 1', action: 'loop' },
        { id: 2, message: 'B0 50 00', description: 'Control change 80, value 0, channel 1', action: null },
      ],
    });

    expect(items(markup, 'midi-monitor')).toEqual([
      'B0 50 00 Control change 80, value 0, channel 1 unmapped',
      'B0 50 7F Control change 80, value 127, channel 1 Loop',
    ]);
  });

  it('asks for a press while the MIDI monitor is empty', () => {
    expect(text(pedalMarkup(LOADED))).toContain('Press a pedal switch to see its message.');
  });

  it('sets the hex in the monitor and the mappings in a monospaced face', () => {
    const font = (list: string) =>
      stylesheet.value([{ tag: 'html' }, { tag: 'body' }, { tag: 'ul', classes: [list] }, { tag: 'li' }, { tag: 'code' }], 'font-family');
    expect(font('midi-monitor')).toMatch(/monospace/);
    expect(font('pedal-mappings')).toMatch(/monospace/);
  });
});

describe("the setup screen's connections section", () => {
  const ROW: Connection = {
    name: 'propresenter',
    label: 'ProPresenter',
    configured: true,
    problems: [],
    connection: 'online',
    arm: 'disarmed',
    pause: null,
    movedTo: null,
    check: { kind: 'matched', passText: 'Every song and section matches.', notes: [] },
    buttons: [],
    pick: null,
    state: [],
    list: [],
    listCurrent: null,
    lateness: { last: null, median: null, acted: null, actedMedian: null },
  };
  const LOADED_CONFIG: ConnectionsStatus = { configPath: '/config/connections.json', config: 'loaded', problems: [], connections: [] };
  const setupOf = (status: ConnectionsStatus) => renderToStaticMarkup(createElement(ConnectionsSetup, { status }));
  const checks = (connections: Connection[]) => setupOf({ ...LOADED_CONFIG, connections });
  const LIST_HEAD = 'Connections Connections config loaded. File: /config/connections.json';

  it('holds the connections section, loading the checks, after the foot pedal and before the join codes', () => {
    for (const snapshot of [null, SNAPSHOT]) {
      const markup = renderToStaticMarkup(createElement(Setup, { snapshot, connected: true }));
      expect(markup).toContain('<h2 id="setup-connections">Connections</h2>');
      expect(text(markup)).toContain('Loading the connections.');
      expect(markup.indexOf('id="pedal"')).toBeLessThan(markup.indexOf('id="setup-connections"'));
      expect(markup.indexOf('id="setup-connections"')).toBeLessThan(markup.indexOf('id="join"'));
    }
  });

  it("lists each target's label and its pre-service check", () => {
    const markup = checks([
      { ...ROW, check: { kind: 'unmatched', names: ['Chorus'], problems: [], notes: [] } },
      { ...ROW, name: 'lights', label: 'Lights' },
      { ...ROW, name: 'stream', label: 'Stream', connection: 'offline', check: { kind: 'not-checked' } },
    ]);

    expect(text(markup)).toBe(
      `${LIST_HEAD} ProPresenter Online Cannot match: Chorus Lights Online Every song and section matches. Stream Offline Not checked.`,
    );
    expect(text(markup)).not.toContain('Problems:');
  });

  it("lists a matched target with the pass text its check carries, not another target's", () => {
    const markup = checks([{ ...ROW, name: 'eos', label: 'Lights', check: { kind: 'matched', passText: 'Every song has a cue.', notes: [] } }]);

    expect(text(markup)).toBe(`${LIST_HEAD} Lights Online Every song has a cue.`);
    expect(text(markup)).not.toContain('Every song and section matches.');
  });

  it("lists a target's own problems under Problems:, before the songs and sections it cannot match", () => {
    const mixed = checks([
      { ...ROW, check: { kind: 'unmatched', names: ['There Is Freedom: no presentation or playlist item of its name'], problems: ['House of the Lord: not authorized in ProPresenter'], notes: [] } },
    ]);
    const unpicked = checks([{ ...ROW, check: { kind: 'unmatched', names: [], problems: ['no playlist picked'], notes: [] } }]);

    expect(text(mixed)).toBe(`${LIST_HEAD} ProPresenter Online Problems: House of the Lord: not authorized in ProPresenter Cannot match: There Is Freedom: no presentation or playlist item of its name`);
    expect(text(unpicked)).toBe(`${LIST_HEAD} ProPresenter Online Problems: no playlist picked`);
  });

  it("lists a target's notes under Notes:, last, whether its check matched or not", () => {
    const notes = ['There Is Freedom: no group Count Off, shows slide 1', 'There Is Freedom: no group Outro, clears'];
    const matchedWithNotes = checks([{ ...ROW, check: { kind: 'matched', passText: 'Every song and section matches.', notes } }]);
    const unmatchedWithNotes = checks([
      { ...ROW, check: { kind: 'unmatched', names: ['Prayer: no presentation or playlist item of its name'], problems: ['House of the Lord: not authorized in ProPresenter'], notes } },
    ]);

    expect(text(matchedWithNotes)).toBe(
      `${LIST_HEAD} ProPresenter Online Every song and section matches. Notes: There Is Freedom: no group Count Off, shows slide 1 There Is Freedom: no group Outro, clears`,
    );
    expect(text(unmatchedWithNotes)).toBe(
      `${LIST_HEAD} ProPresenter Online Problems: House of the Lord: not authorized in ProPresenter Cannot match: Prayer: no presentation or playlist item of its name Notes: There Is Freedom: no group Count Off, shows slide 1 There Is Freedom: no group Outro, clears`,
    );
    for (const markup of [matchedWithNotes, unmatchedWithNotes]) {
      expect([...markup.matchAll(/<li class="check-note">([^<]*)<\/li>/g)].map(([, line]) => line)).toEqual(notes);
    }
    expect(text(checks([ROW]))).not.toContain('Notes:');
  });

  it("lists a check's problems that are not a failed match under Problems:, before Cannot match:, and no Cannot match: for problems alone", () => {
    const markup = checks([
      {
        ...ROW,
        name: 'eos',
        label: 'Lights',
        check: { kind: 'unmatched', names: ['Great Are You Lord: no cue Tag'], problems: ['Goodness of God: cue 11 never fires, cue 3 has the same label'], notes: [] },
      },
      { ...ROW, name: 'eos2', label: 'Lights 2', check: { kind: 'unmatched', names: [], problems: ['Cue list 2 is not in the show file, or holds no cues.'], notes: [] } },
    ]);

    expect(text(markup)).toBe(
      `${LIST_HEAD} Lights Online Problems: Goodness of God: cue 11 never fires, cue 3 has the same label Cannot match: Great Are You Lord: no cue Tag Lights 2 Online Problems: Cue list 2 is not in the show file, or holds no cues.`,
    );
    expect(problemLines(markup)).toEqual(['Goodness of God: cue 11 never fires, cue 3 has the same label', 'Cue list 2 is not in the show file, or holds no cues.']);
    expect(unmatchedNames(markup)).toEqual(['Great Are You Lord: no cue Tag']);
  });

  it("lists a device check's notes and problems, and no song or section line", () => {
    const markup = checks([
      {
        ...ROW,
        name: 'atem',
        label: 'ATEM',
        check: { kind: 'device', problems: ['Camera is input 9, which this ATEM does not have.'], notes: ['Model: ATEM Mini, firmware 8.1.1.'] },
      },
    ]);

    expect(text(markup)).toBe(`${LIST_HEAD} ATEM Online Model: ATEM Mini, firmware 8.1.1. Camera is input 9, which this ATEM does not have.`);
    expect([...markup.matchAll(/<li class="check-problem">([^<]*)<\/li>/g)].map(([, line]) => line)).toEqual(['Camera is input 9, which this ATEM does not have.']);
  });

  it('says so when no connections are configured', () => {
    expect(text(checks([]))).toBe(`${LIST_HEAD} No connections are configured.`);
  });

  it('shows a target the config disabled as not configured, with its problems and no check', () => {
    const markup = checks([
      ROW,
      { ...ROW, name: 'lights', label: 'Lights', configured: false, problems: ['The port must be a number.', 'The host is missing.'], connection: 'offline', check: { kind: 'not-checked' } },
    ]);

    expect(text(markup)).toBe(
      `${LIST_HEAD} ProPresenter Online Every song and section matches. Lights Not configured The port must be a number. The host is missing.`,
    );
    expect([...markup.matchAll(/<li class="connection-problem">([^<]*)<\/li>/g)].map(([, problem]) => problem)).toEqual([
      'The port must be a number.',
      'The host is missing.',
    ]);
  });

  it("lists a configured target's reported problem beside its check, and no problem list when it has none", () => {
    const PROBLEM = 'The ATEM could not connect: Could not start the socket process.';
    const markup = checks([{ ...ROW, name: 'atem', label: 'ATEM', connection: 'offline', check: { kind: 'not-checked' }, problems: [PROBLEM] }]);

    expect(text(markup)).toBe(`${LIST_HEAD} ATEM Offline Not checked. ${PROBLEM}`);
    expect([...markup.matchAll(/<li class="connection-problem">([^<]*)<\/li>/g)].map(([, problem]) => problem)).toEqual([PROBLEM]);
    expect(checks([ROW])).not.toContain('connection-problems');
  });

  it('says when there is no connections config file', () => {
    expect(text(setupOf({ configPath: '/config/connections.json', config: 'missing', problems: [], connections: [] }))).toBe(
      'Connections No connections config. File: /config/connections.json No connections are configured.',
    );
    expect(text(setupOf({ configPath: null, config: 'missing', problems: [], connections: [] }))).toBe(
      'Connections No connections config. No connections are configured.',
    );
  });

  it("shows the file's own problem when the config was rejected, in place of the empty list", () => {
    const markup = setupOf({ configPath: '/config/connections.json', config: 'invalid', problems: ['The file is not valid JSON.'], connections: [] });

    expect(text(markup)).toBe('Connections Connections config rejected. File: /config/connections.json The file is not valid JSON.');
  });
});

describe('the song heading', () => {
  const song = SET.songs[0]!;
  const heading = (role: 'leader' | 'viewer', end: number | null) =>
    text(
      renderToStaticMarkup(
        createElement(SongHeading, { song: { ...song, end }, toggle: 'stop', role, available: true, playable: true, playing: false, now: PLAYING, send: () => {} }),
      ),
    );

  it('shows the end toggle on every page for a song with an End', () => {
    expect(heading('viewer', 32)).toContain('Stop at end');
    expect(heading('leader', 32)).toContain('Stop at end');
    expect(heading('leader', 32)).toContain('Continue into next song');
  });

  it('shows no end toggle for a song with no End, since it never stops there', () => {
    for (const role of ['viewer', 'leader'] as const) {
      expect(heading(role, null)).toContain('No End locator');
      expect(heading(role, null)).not.toContain('Stop at end');
      expect(heading(role, null)).not.toContain('Continue into next song');
    }
    expect(heading('leader', null)).toContain('Play from start');
  });
});

describe('the Count in button', () => {
  const [SONG_1, SONG_2] = COUNT_IN_SET.songs as [SetList['songs'][number], SetList['songs'][number]];
  const ON_BRIDGE = onSection(1, 3);
  const props = {
    song: SONG_1,
    toggle: 'stop' as const,
    role: 'leader' as Role,
    available: true,
    playable: true,
    playing: false,
    now: ON_BRIDGE,
    send: (() => {}) as (command: Command) => void,
  };
  const heading = (changes: Partial<typeof props> = {}) => renderToStaticMarkup(createElement(SongHeading, { ...props, ...changes }));
  // The Count in button's attributes and its text, or undefined when the heading has none.
  const countInButton = (markup: string) => {
    const found = [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].find(([, attributes = '']) => /class="count-in/.test(attributes));
    return found && { attributes: found[1] ?? '', label: text(found[2] ?? ''), disabled: /disabled=""/.test(found[1] ?? '') };
  };

  it("sits beside Play from start in the song's heading, on the leader and producer pages", () => {
    for (const role of ['leader', 'producer'] as const) {
      const controlsRow = /<div class="song-controls">(.*?)<div class="end-toggle"/.exec(heading({ role }))?.[1] ?? '';
      expect(text(controlsRow)).toBe('Play from start Count in');
    }
  });

  it('is not on the view-only page', () => {
    expect(countInButton(heading({ role: 'viewer' }))).toBeUndefined();
    expect(text(heading({ role: 'viewer' }))).not.toContain('Count in');
  });

  it('is enabled while Live is connected and stopped with the playhead in a section of this song it can count in to', () => {
    for (const section of [0, 1, 2, 3]) {
      expect(countInButton(heading({ now: onSection(1, section) }))?.disabled, `section ${section}`).toBe(false);
    }
    expect(countInButton(heading())?.attributes).toMatch(/class="count-in"/);
  });

  it('is disabled while Live plays, while Live is not connected, between songs or on End, on a Pad, and in a song the playhead is not in', () => {
    expect(countInButton(heading({ playing: true }))?.disabled).toBe(true);
    expect(countInButton(heading({ playable: false }))?.disabled).toBe(true);
    expect(countInButton(heading({ now: null }))?.disabled).toBe(true);
    expect(countInButton(heading({ now: onSection(1, 4) }))?.disabled).toBe(true);
    expect(countInButton(heading({ now: onSection(2, 1) }))?.disabled).toBe(true);
    expect(countInButton(heading({ playing: true }))?.attributes).toMatch(/class="count-in unavailable"/);
  });

  it('is disabled with the reason for a song with no Count Off', () => {
    const button = countInButton(heading({ song: SONG_2, now: onSection(2, 1) }));
    expect(button?.disabled).toBe(true);
    expect(button?.label).toBe('Count in No Count Off');
    expect(countInButton(heading())?.label).toBe('Count in');
  });

  it('sends a count-in for the section the playhead is in', () => {
    const sent: Command[] = [];
    // The heading's buttons, found in the rendered tree without a browser.
    const buttonsIn = (node: unknown): { props: { className?: string; onClick?: () => void; children?: unknown } }[] => {
      if (!node || typeof node !== 'object') return [];
      if (Array.isArray(node)) return node.flatMap(buttonsIn);
      const { type, props } = node as { type: unknown; props: { children?: unknown } };
      if (typeof type === 'function') return buttonsIn((type as (props: unknown) => unknown)(props));
      return type === 'button' ? [node as { props: { className?: string; onClick?: () => void } }] : buttonsIn(props?.children);
    };
    const element = createElement(SongHeading, { ...props, send: (command: Command) => sent.push(command) });

    buttonsIn(element).find((button) => button.props.className === 'count-in')?.props.onClick?.();

    expect(sent).toEqual([{ kind: 'count-in', song: 1, section: 3 }]);
  });

  it('reads "Count in to" the target on every page while the count-in waits', () => {
    for (const role of ['leader', 'viewer'] as const) {
      const snapshot: Snapshot = { ...SNAPSHOT, set: COUNT_IN_SET, endToggles: { 1: 'stop', 2: 'stop' }, playing: true, now: onSection(1, 0), jump: { song: 1, section: 3 }, countIn: true };
      const markup = renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {} }));
      expect(text(markup), role).toContain('Count in to Bridge.');
      expect(classes(markup).flat(), role).toContain('waiting');
    }
  });

  it('is sized as Play from start is, and fades when disabled', () => {
    const button = (classes: string[]): Element[] => [
      { tag: 'html' },
      { tag: 'body' },
      { tag: 'div' },
      { tag: 'main' },
      { tag: 'section', classes: ['song'] },
      { tag: 'header', classes: ['song-heading'] },
      { tag: 'div', classes: ['song-controls'] },
      { tag: 'button', classes },
    ];
    expect(stylesheet.value(button(['count-in']), 'min-height')).toBe(stylesheet.value(button(['play-from-start']), 'min-height'));
    expect(stylesheet.value(button(['count-in']), 'touch-action')).toBe('manipulation');
    expect(stylesheet.value(button(['count-in', 'unavailable']), 'opacity')).toBe('0.4');
    expect(stylesheet.value(button(['count-in']), 'opacity')).toBeUndefined();
  });
});

describe('the top Count in', () => {
  const COUNT_IN_SNAPSHOT: Snapshot = { ...SNAPSHOT, set: COUNT_IN_SET, endToggles: { 1: 'stop', 2: 'stop' }, playing: false, now: onSection(1, 3) };
  const props = (changes: Partial<Snapshot> = {}, role: Role = 'leader', connected = true) => ({
    role,
    snapshot: { ...COUNT_IN_SNAPSHOT, ...changes },
    connected,
    send: (() => {}) as (command: PageCommand) => void,
  });
  const page = (changes: Partial<Snapshot> = {}, role: Role = 'leader', connected = true) =>
    renderToStaticMarkup(createElement(Page, props(changes, role, connected)));
  const transport = (markup: string) => /<section class="transport"[^>]*>(.*?)<\/section>/.exec(markup)?.[1];
  // The transport row's Count in: its attributes, its text and whether it is disabled, or undefined when there is none.
  const topCountIn = (markup: string) => {
    const found = [...(transport(markup) ?? '').matchAll(/<button([^>]*)>(.*?)<\/button>/g)].find(([, attributes = '']) => /class="count-in/.test(attributes));
    return found && { attributes: found[1] ?? '', label: text(found[2] ?? ''), disabled: /disabled=""/.test(found[1] ?? '') };
  };

  it('sits in the transport row after Fade out on the leader and producer pages, and not on the view-only page', () => {
    for (const role of ['leader', 'producer'] as const) {
      expect(text(transport(page({}, role)) ?? ''), role).toBe('Stop Hold to stop Fade out Count in Play from start Previous song Next song');
    }
    expect(transport(page({}, 'viewer'))).toBeUndefined();
    expect(text(page({}, 'viewer'))).not.toContain('Count in');
  });

  it('is enabled while the server and Live are connected and Live is stopped, with the playhead on a section it can count in to', () => {
    for (const section of [0, 1, 2, 3]) {
      expect(topCountIn(page({ now: onSection(1, section) }))?.disabled, `section ${section}`).toBe(false);
    }
    expect(topCountIn(page())?.attributes).toMatch(/class="count-in"/);
  });

  it('is disabled while Live plays, while the server or Live is not connected, on End or between songs, and on a Pad', () => {
    const disabled = [
      page({ playing: true }),
      page({}, 'leader', false),
      page({ live: 'not-connected' }),
      page({ now: null }),
      page({ now: onSection(1, 4) }),
    ];
    for (const markup of disabled) {
      expect(topCountIn(markup)?.disabled).toBe(true);
      expect(topCountIn(markup)?.attributes).toMatch(/class="count-in unavailable"/);
    }
  });

  it('is disabled with the reason in a song with no Count Off, and with no reason in no song', () => {
    const noCountOff = topCountIn(page({ now: onSection(2, 1) }));
    expect(noCountOff?.disabled).toBe(true);
    expect(noCountOff?.label).toBe('Count in No Count Off');
    expect(topCountIn(page({ now: null }))?.label).toBe('Count in');
    expect(topCountIn(page())?.label).toBe('Count in');
  });

  it('sends a count-in for the section the playhead is in', () => {
    const sent: PageCommand[] = [];
    // The transport row's Count in, found in the tree the page returns without a browser.
    type Node = { type: unknown; props: { className?: string; children?: unknown } };
    const find = (node: unknown, match: (node: Node) => boolean): Node | undefined => {
      if (!node || typeof node !== 'object') return undefined;
      if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean);
      const element = node as Node;
      return match(element) ? element : find(element.props?.children, match);
    };
    const tree = Page({ ...props(), send: (command) => sent.push(command) });
    const row = find(tree, (node) => node.type === 'section' && node.props.className === 'transport');
    const countIn = find(row?.props.children, (node) => node.type === CountInButton);
    const button = countIn && (CountInButton(countIn.props as Parameters<typeof CountInButton>[0]).props as { onClick(): void });

    button?.onClick();

    expect(sent).toEqual([{ kind: 'count-in', song: 1, section: 3 }]);
  });

  it("leaves the song heading's Count in beside Play from start", () => {
    const markup = page();
    // One in the transport row, and one in each of the set's two songs' headings.
    expect(classes(markup).filter((names) => names.includes('count-in'))).toHaveLength(3);
    expect(topCountIn(markup)).toBeDefined();
    const song = /<section class="song">(.*?)<\/section>/.exec(markup)?.[1] ?? '';
    expect(text(/<div class="song-controls">(.*?)<div class="end-toggle"/.exec(song)?.[1] ?? '')).toBe('Play from start Count in');
  });

  it('is sized as Fade out is, and fades when disabled', () => {
    const button = (classes: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['transport'] }, { tag: 'button', classes }];
    expect(stylesheet.value(button(['count-in']), 'min-height')).toBe('4.5rem');
    expect(stylesheet.value(button(['count-in']), 'min-height')).toBe(stylesheet.value(button(['fade-out']), 'min-height'));
    expect(stylesheet.value(button(['count-in']), 'min-width')).toBe('12rem');
    expect(stylesheet.value(button(['count-in']), 'min-width')).toBe(stylesheet.value(button(['fade-out']), 'min-width'));
    expect(stylesheet.value(button(['count-in']), 'touch-action')).toBe('manipulation');
    expect(stylesheet.value(button(['count-in', 'unavailable']), 'opacity')).toBe('0.4');
    expect(stylesheet.value(button(['count-in']), 'opacity')).toBeUndefined();
  });

  // Stop, Fade out, Count in, Play from start, Previous song and Next song at 12rem each are wider
  // than a phone, so the row wraps rather than lay one button over another.
  it('lets the transport row wrap onto more than one line on a narrow screen', () => {
    const row: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['transport'] }];
    expect(stylesheet.value(row, 'flex-wrap')).toBe('wrap');
  });
});

describe('the top Play from start', () => {
  const PLAY_SNAPSHOT: Snapshot = { ...SNAPSHOT, set: COUNT_IN_SET, endToggles: { 1: 'stop', 2: 'stop' }, playing: false, now: onSection(1, 3) };
  const props = (changes: Partial<Snapshot> = {}, role: Role = 'leader', connected = true) => ({
    role,
    snapshot: { ...PLAY_SNAPSHOT, ...changes },
    connected,
    send: (() => {}) as (command: PageCommand) => void,
  });
  const page = (changes: Partial<Snapshot> = {}, role: Role = 'leader', connected = true) =>
    renderToStaticMarkup(createElement(Page, props(changes, role, connected)));
  const transport = (markup: string) => /<section class="transport"[^>]*>(.*?)<\/section>/.exec(markup)?.[1];
  // The transport row's Play from start: its attributes and whether it is disabled, or undefined when there is none.
  const topPlayFromStart = (markup: string) => {
    const found = [...(transport(markup) ?? '').matchAll(/<button([^>]*)>(.*?)<\/button>/g)].find(([, attributes = '']) => /class="play-from-start/.test(attributes));
    return found && { attributes: found[1] ?? '', label: text(found[2] ?? ''), disabled: /disabled=""/.test(found[1] ?? '') };
  };

  it('sits in the transport row after the top Count in on the leader and producer pages, and not on the view-only page', () => {
    for (const role of ['leader', 'producer'] as const) {
      expect(text(transport(page({}, role)) ?? ''), role).toBe('Stop Hold to stop Fade out Count in Play from start Previous song Next song');
    }
    expect(transport(page({}, 'viewer'))).toBeUndefined();
    expect(text(page({}, 'viewer'))).not.toContain('Play from start');
  });

  it('is enabled while the server and Live are connected with the playhead in a song, Live stopped or playing', () => {
    for (const section of [0, 1, 2, 3, 4]) {
      for (const playing of [false, true]) {
        expect(topPlayFromStart(page({ now: onSection(1, section), playing }))?.disabled, `section ${section}, playing ${playing}`).toBe(false);
      }
    }
    expect(topPlayFromStart(page())?.attributes).toMatch(/class="play-from-start"/);
    expect(topPlayFromStart(page())?.label).toBe('Play from start');
  });

  it('is disabled while the server or Live is not connected, and with the playhead in no song', () => {
    const disabled = [page({}, 'leader', false), page({ live: 'not-connected' }), page({ now: null }), page({ now: null, playing: true })];
    for (const markup of disabled) {
      expect(topPlayFromStart(markup)?.disabled).toBe(true);
      expect(topPlayFromStart(markup)?.attributes).toMatch(/class="play-from-start unavailable"/);
    }
  });

  it('sends a play-from-start for the song the playhead is in', () => {
    const sent: PageCommand[] = [];
    // The transport row's Play from start, found in the tree the page returns without a browser.
    type Node = { type: unknown; props: { className?: string; children?: unknown } };
    const find = (node: unknown, match: (node: Node) => boolean): Node | undefined => {
      if (!node || typeof node !== 'object') return undefined;
      if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean);
      const element = node as Node;
      return match(element) ? element : find(element.props?.children, match);
    };
    // The playhead in song 2, so a press for the first song would show.
    const tree = Page({ ...props({ now: onSection(2, 1) }), send: (command) => sent.push(command) });
    const row = find(tree, (node) => node.type === 'section' && node.props.className === 'transport');
    const playFromStart = find(row?.props.children, (node) => node.type === PlayFromStartButton);
    const button = playFromStart && (PlayFromStartButton(playFromStart.props as Parameters<typeof PlayFromStartButton>[0]).props as { onClick(): void });

    button?.onClick();

    expect(sent).toEqual([{ kind: 'play-from-start', song: 2 }]);
  });

  it("sends the same command from a song heading's Play from start, for that heading's song", () => {
    const sent: Command[] = [];
    // Song 2's heading, with the playhead in song 1.
    const heading = SongHeading({ song: COUNT_IN_SET.songs[1]!, toggle: 'stop', role: 'leader', available: true, playable: true, playing: false, now: onSection(1, 3), send: (command) => sent.push(command) });
    type Node = { type: unknown; props: { children?: unknown } };
    const find = (node: unknown): Node | undefined => {
      if (!node || typeof node !== 'object') return undefined;
      if (Array.isArray(node)) return node.map(find).find(Boolean);
      const element = node as Node;
      return element.type === PlayFromStartButton ? element : find(element.props?.children);
    };
    const playFromStart = find(heading);
    const button = playFromStart && (PlayFromStartButton(playFromStart.props as Parameters<typeof PlayFromStartButton>[0]).props as { onClick(): void });

    button?.onClick();

    expect(sent).toEqual([{ kind: 'play-from-start', song: 2 }]);
  });

  it("leaves the song heading's Play from start beside Count in", () => {
    const markup = page();
    // One in the transport row, and one in each of the set's two songs' headings.
    expect(classes(markup).filter((names) => names.includes('play-from-start'))).toHaveLength(3);
    expect(topPlayFromStart(markup)).toBeDefined();
    for (const song of [...markup.matchAll(/<section class="song">(.*?)<\/section>/g)].map(([, body = '']) => body)) {
      expect(text(/<div class="song-controls">(.*?)<div class="end-toggle"/.exec(song)?.[1] ?? '')).toMatch(/^Play from start Count in/);
    }
  });

  it('is sized as Fade out is, and fades when disabled', () => {
    const button = (classes: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['transport'] }, { tag: 'button', classes }];
    expect(stylesheet.value(button(['play-from-start']), 'min-height')).toBe('4.5rem');
    expect(stylesheet.value(button(['play-from-start']), 'min-height')).toBe(stylesheet.value(button(['fade-out']), 'min-height'));
    expect(stylesheet.value(button(['play-from-start']), 'min-width')).toBe('12rem');
    expect(stylesheet.value(button(['play-from-start']), 'min-width')).toBe(stylesheet.value(button(['fade-out']), 'min-width'));
    expect(stylesheet.value(button(['play-from-start']), 'touch-action')).toBe('manipulation');
    expect(stylesheet.value(button(['play-from-start', 'unavailable']), 'opacity')).toBe('0.4');
    expect(stylesheet.value(button(['play-from-start']), 'opacity')).toBeUndefined();
  });
});

describe('the Previous song and Next song buttons', () => {
  // Three songs, numbered 1, 2 and 4: a gap at 3, so the set's order and the song numbers differ.
  const THREE_SONG_SET: SetList = {
    ...COUNT_IN_SET,
    songs: [
      ...COUNT_IN_SET.songs,
      {
        number: 4,
        title: 'Way Maker',
        sections: [
          { name: 'Intro', time: 88, end: 96, cue: 9 },
          { name: 'Chorus', time: 96, end: 104, cue: 10 },
        ],
        end: 104,
        endCue: 11,
      },
    ],
  };
  const STEP_SNAPSHOT: Snapshot = { ...SNAPSHOT, set: THREE_SONG_SET, endToggles: { 1: 'stop', 2: 'stop', 4: 'stop' }, playing: false, countIn: false, now: onSection(1, 3) };
  const props = (changes: Partial<Snapshot> = {}, role: Role = 'leader', connected = true) => ({
    role,
    snapshot: { ...STEP_SNAPSHOT, ...changes },
    connected,
    send: (() => {}) as (command: PageCommand) => void,
  });
  const page = (changes: Partial<Snapshot> = {}, role: Role = 'leader', connected = true) =>
    renderToStaticMarkup(createElement(Page, props(changes, role, connected)));
  const transport = (markup: string) => /<section class="transport"[^>]*>(.*?)<\/section>/.exec(markup)?.[1];
  // The transport row's Previous song or Next song: its attributes and whether it is disabled, or
  // undefined when there is none.
  const stepButton = (markup: string, label: 'Previous song' | 'Next song') => {
    const found = [...(transport(markup) ?? '').matchAll(/<button([^>]*)>(.*?)<\/button>/g)].find(
      ([, attributes = '', inner = '']) => /class="song-step/.test(attributes) && text(inner) === label,
    );
    return found && { attributes: found[1] ?? '', disabled: /disabled=""/.test(found[1] ?? '') };
  };
  const previous = (markup: string) => stepButton(markup, 'Previous song');
  const next = (markup: string) => stepButton(markup, 'Next song');

  it('sit in the transport row after the top Play from start on the leader and producer pages, and not on the view-only page', () => {
    for (const role of ['leader', 'producer'] as const) {
      expect(text(transport(page({}, role)) ?? ''), role).toBe('Stop Hold to stop Fade out Count in Play from start Previous song Next song');
      expect(previous(page({}, role)), role).toBeDefined();
      expect(next(page({}, role)), role).toBeDefined();
    }
    expect(transport(page({}, 'viewer'))).toBeUndefined();
    expect(text(page({}, 'viewer'))).not.toContain('Previous song');
    expect(text(page({}, 'viewer'))).not.toContain('Next song');
  });

  it("disable Previous song on the set's first song and Next song on its last, while Live is stopped", () => {
    // Song 1 is the set's first: every section of it, the Pad included.
    for (const section of [0, 1, 2, 3, 4]) {
      const markup = page({ now: onSection(1, section) });
      expect(previous(markup)?.disabled, `song 1, section ${section}`).toBe(true);
      expect(next(markup)?.disabled, `song 1, section ${section}`).toBe(false);
    }
    expect(previous(page({ now: onSection(2, 1) }))?.disabled).toBe(false);
    expect(next(page({ now: onSection(2, 1) }))?.disabled).toBe(false);
    // Song 4 is the set's last.
    expect(previous(page({ now: onSection(4, 0) }))?.disabled).toBe(false);
    expect(next(page({ now: onSection(4, 0) }))?.disabled).toBe(true);
  });

  // From song 2 both have a song to move to, so only the rule under test can disable them.
  it('are both disabled while Live plays, during a count-in, with the playhead in no song, and while the server or Live is not connected', () => {
    const inSong2 = { now: onSection(2, 1) };
    const disabled = {
      playing: page({ ...inSong2, playing: true }),
      'count-in before Live starts': page({ ...inSong2, countIn: true, jump: { song: 2, section: 0 } }),
      'count-in while Live plays': page({ ...inSong2, countIn: true, jump: { song: 2, section: 0 }, playing: true }),
      'no song': page({ now: null }),
      'server not connected': page(inSong2, 'leader', false),
      'Live not connected': page({ ...inSong2, live: 'not-connected' }),
    };
    for (const [why, markup] of Object.entries(disabled)) {
      expect(previous(markup)?.disabled, why).toBe(true);
      expect(next(markup)?.disabled, why).toBe(true);
      expect(previous(markup)?.attributes, why).toMatch(/class="song-step unavailable"/);
      expect(next(markup)?.attributes, why).toMatch(/class="song-step unavailable"/);
    }
  });

  // A song that is only an End locator has no section to jump to, and the server ignores a jump to
  // one that is not there.
  it('disable Next song when the song after has no sections, and Previous song when the song before has none', () => {
    const [song1, song2, song4] = THREE_SONG_SET.songs as [SetList['songs'][number], SetList['songs'][number], SetList['songs'][number]];
    const set: SetList = { ...THREE_SONG_SET, songs: [song1, { ...song2, sections: [] }, song4] };
    expect(next(page({ set, now: onSection(1, 3) }))?.disabled).toBe(true);
    expect(previous(page({ set, now: onSection(4, 0) }))?.disabled).toBe(true);
  });

  it("send an ordinary jump to the first section of the song before or after, in the set's order", () => {
    // The transport row's Previous song or Next song, found in the tree the page returns without a
    // browser, and pressed.
    type Node = { type: unknown; props: { className?: string; step?: string; children?: unknown } };
    const find = (node: unknown, match: (node: Node) => boolean): Node | undefined => {
      if (!node || typeof node !== 'object') return undefined;
      if (Array.isArray(node)) return node.map((child) => find(child, match)).find(Boolean);
      const element = node as Node;
      return match(element) ? element : find(element.props?.children, match);
    };
    const press = (step: 'previous' | 'next') => {
      const sent: PageCommand[] = [];
      const tree = Page({ ...props({ now: onSection(2, 1) }), send: (command) => sent.push(command) });
      const row = find(tree, (node) => node.type === 'section' && node.props.className === 'transport');
      const element = find(row?.props.children, (node) => node.type === SongStepButton && node.props.step === step);
      const button = element && (SongStepButton(element.props as Parameters<typeof SongStepButton>[0]).props as { onClick(): void });
      button?.onClick();
      return sent;
    };

    // Song 4 follows song 2 in the set: there is no song 3.
    expect(press('next')).toEqual([{ kind: 'jump', song: 4, section: 0 }]);
    expect(press('previous')).toEqual([{ kind: 'jump', song: 1, section: 0 }]);
  });

  it('are marked unavailable while disabled, and only then', () => {
    const markup = page({ now: onSection(1, 3) });
    expect(previous(markup)?.attributes).toMatch(/class="song-step unavailable"/);
    expect(next(markup)?.attributes).toMatch(/class="song-step"/);
  });

  it('are sized as Fade out is, and fade when disabled', () => {
    const button = (classes: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['transport'] }, { tag: 'button', classes }];
    expect(stylesheet.value(button(['song-step']), 'min-height')).toBe('4.5rem');
    expect(stylesheet.value(button(['song-step']), 'min-height')).toBe(stylesheet.value(button(['fade-out']), 'min-height'));
    expect(stylesheet.value(button(['song-step']), 'min-width')).toBe('12rem');
    expect(stylesheet.value(button(['song-step']), 'min-width')).toBe(stylesheet.value(button(['fade-out']), 'min-width'));
    expect(stylesheet.value(button(['song-step']), 'touch-action')).toBe('manipulation');
    expect(stylesheet.value(button(['song-step', 'unavailable']), 'opacity')).toBe('0.4');
    expect(stylesheet.value(button(['song-step']), 'opacity')).toBeUndefined();
  });
});

describe('the jump to End', () => {
  const page = (role: Role, jump: Snapshot['jump']) =>
    renderToStaticMarkup(createElement(Page, { role, snapshot: { ...SNAPSHOT, playing: true, now: LAST, jump }, connected: true, send: () => {} }));

  // End is not a section, so no row in the setlist and no tap target stands for it.
  it('marks no section as waiting on the leader page or the view-only page', () => {
    for (const role of ['leader', 'viewer'] as const) {
      const markup = page(role, END_JUMP);
      expect(text(markup)).toContain('Jumping to End.');
      expect(classes(markup).flat()).not.toContain('waiting');
      expect(markup).not.toMatch(/class="jump-target[^"]*" aria-pressed="true"/);
      // A jump to a section marks it on the same page.
      expect(classes(page(role, WAITING)).flat()).toContain('waiting');
      if (role === 'leader') expect(page(role, WAITING)).toMatch(/class="jump-target[^"]*" aria-pressed="true"/);
    }
  });
});

describe('the Refresh button', () => {
  const refresh = (live: Snapshot['live'], playing: boolean) =>
    renderToStaticMarkup(createElement(RefreshButton, { live, playing, available: true, send: () => {} }));

  it('is labelled Refresh', () => {
    expect(text(refresh('connected', false))).toBe('Refresh');
  });

  // The server reads the set only while Live is connected and stopped, and ignores a Refresh otherwise.
  it('is enabled only while Live is connected and stopped', () => {
    expect(refresh('connected', false)).not.toMatch(/disabled/);
    expect(refresh('connected', true)).toMatch(/disabled=""/);
    expect(refresh('not-connected', false)).toMatch(/disabled=""/);
  });

  it('sends a refresh command when tapped', () => {
    const sent: Command[] = [];
    const button = RefreshButton({ live: 'connected', playing: false, available: true, send: (command) => sent.push(command) });
    (button.props as { onClick(): void }).onClick();
    expect(sent).toEqual([{ kind: 'refresh' }]);
  });

  it('shows on the leader page and the setup screen, and not on the view-only page', () => {
    const page = (role: Role) => text(renderToStaticMarkup(createElement(Page, { role, snapshot: SNAPSHOT, connected: true, send: () => {} })));
    expect(page('leader')).toContain('Refresh');
    expect(page('viewer')).not.toContain('Refresh');
    expect(setup(SNAPSHOT)).toContain('Refresh');
  });
});

describe('the Fade out button', () => {
  const page = (connected: boolean, snapshot: Partial<Snapshot>, role: Role = 'leader') =>
    renderToStaticMarkup(createElement(Page, { role, snapshot: { ...SNAPSHOT, ...snapshot }, connected, send: () => {} }));
  // The Fade out button's attributes on the leader page, or undefined when there is none.
  const fadeOut = (connected: boolean, snapshot: Partial<Snapshot>) =>
    [...page(connected, snapshot).matchAll(/<button([^>]*)>(.*?)<\/button>/g)].find(([, , label = '']) => text(label) === 'Fade out')?.[1];

  it('is labelled Fade out', () => {
    expect(fadeOut(true, { playing: true })).toBeDefined();
  });

  // The server fades only while Live is connected and plays, and ignores a Fade out otherwise.
  it('is enabled only while the server and Live are connected and Live plays', () => {
    expect(fadeOut(true, { playing: true })).not.toMatch(/disabled/);
    expect(fadeOut(true, { playing: false })).toMatch(/disabled=""/);
    expect(fadeOut(false, { playing: true })).toMatch(/disabled=""/);
    expect(fadeOut(true, { playing: true, live: 'not-connected' })).toMatch(/disabled=""/);
  });

  it('is marked unavailable while it is disabled, and only then', () => {
    expect(fadeOut(true, { playing: true })).toMatch(/class="fade-out"/);
    expect(fadeOut(true, { playing: false })).toMatch(/class="fade-out unavailable"/);
  });

  it('sends a fade-out command when tapped', () => {
    const sent: Command[] = [];
    const button = FadeOutButton({ available: true, playing: true, fade: null, send: (command) => sent.push(command) });
    (button.props as { onClick(): void }).onClick();
    expect(sent).toEqual([{ kind: 'fade-out' }]);
  });

  // The button's label and attributes on the leader page.
  const fadeButton = (snapshot: Partial<Snapshot>) => {
    const [, attributes = '', label = ''] = /<button([^>]*class="fade-out[^"]*"[^>]*)>(.*?)<\/button>/.exec(page(true, snapshot)) ?? [];
    return { label: text(label), attributes };
  };

  it('reads Fade in while the music is silent, and is enabled', () => {
    const { label, attributes } = fadeButton({ playing: true, fade: 'silent' });
    expect(label).toBe('Fade in');
    expect(attributes).not.toMatch(/disabled/);
  });

  it('is disabled while the music steps out, and while it steps back in', () => {
    expect(fadeButton({ playing: true, fade: 'out' })).toEqual({ label: 'Fade out', attributes: expect.stringMatching(/disabled=""/) });
    expect(fadeButton({ playing: true, fade: 'in' })).toEqual({ label: 'Fade in', attributes: expect.stringMatching(/disabled=""/) });
  });

  it('sends a fade-in command when tapped while the music is silent', () => {
    const sent: Command[] = [];
    const button = FadeOutButton({ available: true, playing: true, fade: 'silent', send: (command) => sent.push(command) });
    (button.props as { onClick(): void }).onClick();
    expect(sent).toEqual([{ kind: 'fade-in' }]);
  });

  it("sits beside Stop in the leader's transport row, and not on the view-only page", () => {
    const transport = /<section class="transport"[^>]*>(.*?)<\/section>/.exec(page(true, { playing: true }))?.[1] ?? '';
    // The song has no Count Off, so the Count in after Fade out carries its reason, and Play from
    // start, Previous song and Next song come after it.
    expect(text(transport)).toBe('Stop Hold to stop Fade out Count in No Count Off Play from start Previous song Next song');
    expect(text(page(true, { playing: true }, 'viewer'))).not.toContain('Fade out');
  });

  it('is sized for a finger, as Stop is', () => {
    const button: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['transport'] }, { tag: 'button', classes: ['fade-out'] }];
    expect(stylesheet.value(button, 'min-height')).toBe('4.5rem');
    expect(stylesheet.value(button, 'touch-action')).toBe('manipulation');
  });

  it('fades when disabled, as every other leader control does', () => {
    const button = (classes: string[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['transport'] }, { tag: 'button', classes }];
    expect(stylesheet.value(button(['fade-out', 'unavailable']), 'opacity')).toBe('0.4');
    expect(stylesheet.value(button(['fade-out']), 'opacity')).toBeUndefined();
  });
});

describe('the server connection', () => {
  const page = (role: Role, connected: boolean, snapshot: Snapshot = SNAPSHOT) =>
    renderToStaticMarkup(createElement(Page, { role, snapshot, connected, send: () => {} }));
  const buttons = (markup: string) =>
    [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attributes = '', label = '']) => ({
      label: text(label),
      disabled: /disabled=""/.test(attributes),
    }));

  it('says on every page that the server is out of reach while it is, and not once it is back', () => {
    for (const role of ['leader', 'viewer'] as const) {
      expect(text(page(role, false))).toContain('Reconnecting to the server.');
      expect(text(page(role, true))).not.toContain('Reconnecting to the server.');
    }
    expect(text(page('viewer', false, { ...SNAPSHOT, set: null }))).toContain('Reconnecting to the server.');
    expect(text(page('viewer', false, { ...SNAPSHOT, set: null, live: 'not-connected' }))).toContain('Reconnecting to the server.');
    expect(setup(SNAPSHOT)).not.toContain('Reconnecting to the server.');
    expect(text(renderToStaticMarkup(createElement(Setup, { snapshot: SNAPSHOT, connected: false })))).toContain('Reconnecting to the server.');
  });

  it("disables every one of the leader's controls while the server is out of reach", () => {
    const down = buttons(page('leader', false));
    expect(down.filter((button) => button.label === 'Setlist' || button.label === 'Timeline')).toEqual([
      { label: 'Setlist', disabled: false },
      { label: 'Timeline', disabled: false },
    ]);
    const serverControls = down.filter((button) => button.label !== 'Setlist' && button.label !== 'Timeline');
    expect(serverControls.map((button) => button.label)).toEqual(
      expect.arrayContaining(['Stop Hold to stop', 'Fade out', 'Previous', 'Loop', 'Next', 'Verse', 'Play from start', 'Count in No Count Off', 'Previous song', 'Next song', 'Stop at end', 'Continue into next song', 'Refresh']),
    );
    expect(serverControls.filter((button) => !button.disabled)).toEqual([]);

    // Back in reach, only what Live's transport rules out stays disabled: Fade out while Live is
    // stopped, and Refresh while it plays. Both Count in buttons, the transport row's and the song
    // heading's, stay disabled too, since the song has no Count Off. Both Play from start buttons,
    // the transport row's and the song heading's, are enabled whenever Live is connected, since the
    // playhead is in the song. Previous song and Next song stay disabled too, since a one-song set has
    // no song before or after.
    const disabledLabels = (snapshot: Snapshot) => buttons(page('leader', true, snapshot)).filter((button) => button.disabled).map((button) => button.label);
    expect(disabledLabels({ ...SNAPSHOT, playing: false })).toEqual(['Fade out', 'Count in No Count Off', 'Previous song', 'Next song', 'Count in No Count Off']);
    expect(disabledLabels({ ...SNAPSHOT, playing: true })).toEqual(['Count in No Count Off', 'Previous song', 'Next song', 'Refresh', 'Count in No Count Off']);
  });

  it('disables Stop, Fade out and Play from start while Live is not connected, and leaves the end toggles usable', () => {
    const lost = buttons(page('leader', true, { ...SNAPSHOT, live: 'not-connected', now: null, position: null }));
    const disabled = (label: string) => lost.find((button) => button.label === label)?.disabled;
    expect(disabled('Stop Hold to stop')).toBe(true);
    expect(disabled('Fade out')).toBe(true);
    expect(disabled('Play from start')).toBe(true);
    expect(disabled('Stop at end')).toBe(false);
    expect(disabled('Continue into next song')).toBe(false);
  });

  it('marks the disabled controls as unavailable', () => {
    const marked = classes(page('leader', false)).filter((names) => names.includes('unavailable'));
    for (const name of ['stop', 'fade-out', 'section-control', 'jump-target', 'play-from-start', 'count-in', 'song-step', 'end-choice', 'refresh']) {
      expect(marked.some((names) => names.includes(name))).toBe(true);
    }
  });

  it('shows the line over the top of the page, so nothing under it moves', () => {
    const line: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'p', classes: ['server-lost'] }];
    expect(stylesheet.value(line, 'position')).toBe('fixed');
    // Over the chart view's pinned strip, held to the same place at the top of the screen.
    const strip: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main', classes: ['chart-page'] }, { tag: 'section', classes: ['chart-strip'] }];
    expect(Number(stylesheet.value(line, 'z-index'))).toBeGreaterThan(Number(stylesheet.value(strip, 'z-index')));
  });
});

describe('the producer page', () => {
  const page = (role: Role, snapshot: Snapshot | ProducerSnapshot) =>
    renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {} }));
  const PRODUCER: ProducerSnapshot = { ...SNAPSHOT, connections: [], connectionProblems: [] };
  const buttons = (markup: string) => [...markup.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([, label = '']) => text(label));

  it('shows the Connections panel, which says no connections are configured', () => {
    const markup = page('producer', PRODUCER);

    expect(markup).toMatch(/<section[^>]*class="connections"/);
    expect(text(markup)).toContain('Connections No connections are configured.');
  });

  it('shows the Connections panel while Live has not reported a set', () => {
    expect(text(page('producer', { ...PRODUCER, set: null }))).toContain('No connections are configured.');
  });

  it("shows every leader control", () => {
    const leaderAll = buttons(page('leader', SNAPSHOT));
    const producerButtons = buttons(page('producer', PRODUCER));
    expect(leaderAll).toEqual(expect.arrayContaining(['Setlist', 'Timeline']));
    expect(producerButtons).not.toContain('Setlist');
    expect(producerButtons).not.toContain('Timeline');
    const leader = leaderAll.filter((label) => label !== 'Setlist' && label !== 'Timeline');

    expect(leader.length).toBeGreaterThan(0);
    expect(producerButtons).toEqual(leader);
  });

  it('shows no Connections panel on the leader page or the view-only page', () => {
    for (const role of ['leader', 'viewer'] as const) {
      expect(text(page(role, SNAPSHOT)), role).not.toContain('Connections');
    }
  });

  const ONLINE: Connection = {
    name: 'propresenter',
    label: 'ProPresenter',
    configured: true,
    problems: [],
    connection: 'online',
    arm: 'disarmed',
    pause: null,
    movedTo: null,
    check: { kind: 'matched', passText: 'Every song and section matches.', notes: [] },
    buttons: [],
    pick: null,
    state: [],
    list: [],
    listCurrent: null,
    lateness: { last: null, median: null, acted: null, actedMedian: null },
  };
  const WITH_BUTTONS: Connection = {
    ...ONLINE,
    buttons: [
      { id: 'clear', label: 'Clear slides' },
      { id: 'logo', label: 'Show logo' },
    ],
  };
  const NOT_CONFIGURED: Connection = {
    ...ONLINE,
    name: 'lights',
    label: 'Lights',
    configured: false,
    problems: ['The port must be a number.'],
    connection: 'offline',
    check: { kind: 'not-checked' },
  };
  const panel = (connections: Connection[], connected = true, send: (command: PageCommand) => void = () => {}, problems: string[] = [], setKnown = true) =>
    createElement(ConnectionsPanel, { connections, problems, connected, setKnown, send });
  const rowOf = (connection: Connection, connected = true) => renderToStaticMarkup(panel([connection], connected));
  // Each button's label and whether it is disabled, in document order.
  const rowButtons = (markup: string) =>
    [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attributes = '', label = '']) => ({
      label: text(label),
      disabled: attributes.includes('disabled'),
    }));

  it("shows a row per target with its label, its state, Arm, Disarm, Fire again and the target's own buttons", () => {
    const markup = page('producer', { ...PRODUCER, connections: [WITH_BUTTONS] });

    expect(text(markup)).toContain('ProPresenter Online Disarmed Arm Disarm Fire again Clear slides Show logo');
    expect(text(markup)).not.toContain('No connections are configured.');
  });

  it("shows the target's read-only state after its check, as plain lines, and nothing when it has none", () => {
    const markup = rowOf({ ...WITH_BUTTONS, state: ['Cue 12', 'Look 3'] });

    expect(text(markup)).toContain('Show logo Every song and section matches. Cue 12 Look 3');
    expect(rowButtons(markup).map(({ label }) => label)).toEqual(['Arm', 'Disarm', 'Fire again', 'Clear slides', 'Show logo']);
    expect(rowOf(ONLINE)).not.toContain('connection-state');
  });

  it("shows the target's read-only list under its state lines, such as the cue list under the live cue, and nothing when it has none", () => {
    const markup = rowOf({ ...ONLINE, state: ['Live cue 6: Verse 1'], list: ['Cue 5: Count Off', 'Cue 6: Verse 1'] });

    expect(text(markup)).toContain('Every song and section matches. Live cue 6: Verse 1 Cue 5: Count Off Cue 6: Verse 1');
    expect(markup).toContain('<ul class="connection-state"><li>Live cue 6: Verse 1</li></ul><ul class="connection-state-list"><li>Cue 5: Count Off</li><li>Cue 6: Verse 1</li></ul>');
    expect(rowOf({ ...ONLINE, state: ['Live cue 6'] })).not.toContain('connection-state-list');
    const listAlone = rowOf({ ...ONLINE, list: ['Cue list 2 has no cues.'] });
    expect(listAlone).toContain('<ul class="connection-state-list"><li>Cue list 2 has no cues.</li></ul>');
    expect(listAlone).not.toContain('class="connection-state"');
  });

  it('caps the height of the read-only list and scrolls it, and never the state lines above it, so a long cue list leaves the live cue in view', () => {
    const inRow = (classes: string[]) => [
      { tag: 'html' },
      { tag: 'body' },
      { tag: 'section', classes: ['connections'] },
      { tag: 'ul', classes: ['connection-list'] },
      { tag: 'li', classes: ['connection'] },
      { tag: 'ul', classes },
    ];

    expect(stylesheet.value(inRow(['connection-state-list']), 'max-height')).toBe('15rem');
    expect(stylesheet.value(inRow(['connection-state-list']), 'overflow-y')).toBe('auto');
    expect(stylesheet.value(inRow(['connection-state-list']), 'list-style')).toBe('none');
    expect(stylesheet.value(inRow(['connection-state']), 'max-height')).toBeUndefined();
    expect(stylesheet.value(inRow(['connection-state']), 'overflow-y')).toBeUndefined();
  });

  it("marks the list line the target names as current, such as the live cue's, and no line when it names none", () => {
    const list = ['Cue 5: Count Off', 'Cue 6: Verse 1', 'Cue 7: Chorus'];
    const markup = rowOf({ ...ONLINE, state: ['Live cue 6: Verse 1'], list, listCurrent: 1 });

    expect(markup).toContain('<ul class="connection-state-list"><li>Cue 5: Count Off</li><li class="current" aria-current="true">Cue 6: Verse 1</li><li>Cue 7: Chorus</li></ul>');
    expect(markup.match(/aria-current/g)).toHaveLength(1);
    const unmarked = rowOf({ ...ONLINE, list, listCurrent: null });
    expect(unmarked).not.toContain('aria-current');
    expect(unmarked).not.toContain('class="current"');
  });

  it('gives the marked list line the blue the page marks the current section with, and white text', () => {
    const line = (classes: string[]) => [
      { tag: 'html' },
      { tag: 'body' },
      { tag: 'section', classes: ['connections'] },
      { tag: 'ul', classes: ['connection-list'] },
      { tag: 'li', classes: ['connection'] },
      { tag: 'ul', classes: ['connection-state-list'] },
      { tag: 'li', classes },
    ];
    const section = [{ tag: 'html' }, { tag: 'body' }, { tag: 'ul', classes: ['sections'] }, { tag: 'li', classes: ['current'] }];

    expect(stylesheet.value(line(['current']), 'background')).toBe('#2f6fd6');
    expect(stylesheet.value(line(['current']), 'background')).toBe(stylesheet.value(section, 'background'));
    expect(stylesheet.value(line(['current']), 'color')).toBe('#fff');
    expect(stylesheet.value(line([]), 'background')).toBeUndefined();
  });

  it('shows how late the cues reach the target once one is measured, and how late it acted once it reports it', () => {
    const late = (lateness: Partial<Connection['lateness']>) => rowOf({ ...ONLINE, state: ['Cue 12'], lateness: { ...ONLINE.lateness, ...lateness } });

    expect(text(late({ last: 250.4, median: 239.6 }))).toContain('Cue 12 Late 250 ms, median 240 ms');
    expect(late({ last: 250, median: 240 })).not.toContain('Acted on');
    expect(text(late({ last: 250, median: 240, acted: 370, actedMedian: 360.5 }))).toContain('Late 250 ms, median 240 ms Acted on 370 ms, median 361 ms');
    expect(late({ last: 250, median: 240 })).toContain('connection-lateness');
    expect(rowOf(ONLINE)).not.toContain('connection-lateness');
    expect(text(rowOf(ONLINE))).not.toContain('Late');
  });

  it('enables only the arm button that would change the arm state', () => {
    expect(rowButtons(rowOf(ONLINE))).toEqual([
      { label: 'Arm', disabled: false },
      { label: 'Disarm', disabled: true },
      { label: 'Fire again', disabled: false },
    ]);
    expect(text(rowOf({ ...ONLINE, arm: 'armed' }))).toContain('Armed');
    expect(rowButtons(rowOf({ ...ONLINE, arm: 'armed' }))).toEqual([
      { label: 'Arm', disabled: true },
      { label: 'Disarm', disabled: false },
      { label: 'Fire again', disabled: false },
    ]);
  });

  it("enables Fire again and the target's own buttons on an online row, whatever its arm state", () => {
    const rows: Connection[] = [WITH_BUTTONS, { ...WITH_BUTTONS, arm: 'armed' }, { ...WITH_BUTTONS, arm: 'paused', pause: 'by-hand' }];
    for (const row of rows) {
      expect(rowButtons(rowOf(row)).slice(2), row.arm).toEqual([
        { label: 'Fire again', disabled: false },
        { label: 'Clear slides', disabled: false },
        { label: 'Show logo', disabled: false },
      ]);
    }
  });

  it("disables Fire again and the target's own buttons on an offline row, and while the page is not connected", () => {
    const disabled = (markup: string) => rowButtons(markup).slice(2).map(({ disabled }) => disabled);

    expect(disabled(rowOf({ ...WITH_BUTTONS, connection: 'offline', arm: 'armed' }))).toEqual([true, true, true]);
    expect(disabled(rowOf(WITH_BUTTONS, false))).toEqual([true, true, true]);
    expect(rowOf({ ...WITH_BUTTONS, connection: 'offline' })).toMatch(/class="connection-button unavailable" disabled="">Fire again</);
  });

  it('shows a paused row with its reason, and enables both Arm and Disarm on it', () => {
    const byHand: Connection = { ...ONLINE, arm: 'paused', pause: 'by-hand' };
    const byFade: Connection = { ...ONLINE, arm: 'paused', pause: 'fade-out' };
    const moved: Connection = { ...ONLINE, arm: 'paused', pause: 'moved', movedTo: 'Facetime' };

    expect(text(rowOf(byHand))).toContain('ProPresenter Online Paused by hand Arm Disarm Fire again');
    expect(text(rowOf(byFade))).toContain('ProPresenter Online Paused by Fade out Arm Disarm Fire again');
    expect(text(rowOf(moved))).toContain('ProPresenter Online Paused: moved to Facetime Arm Disarm Fire again');
    for (const row of [byHand, byFade, moved]) {
      expect(rowButtons(rowOf(row))).toEqual([
        { label: 'Arm', disabled: false },
        { label: 'Disarm', disabled: false },
        { label: 'Fire again', disabled: false },
      ]);
      expect(rowButtons(rowOf(row, false)).map(({ disabled }) => disabled)).toEqual([true, true, true]);
    }
  });

  it('disables every button while the page is not connected', () => {
    expect(rowButtons(rowOf(ONLINE, false)).map(({ disabled }) => disabled)).toEqual([true, true, true]);
  });

  it("sends Arm, Disarm and Fire again by the target name, and each of its own buttons by the button's id", () => {
    const sent: PageCommand[] = [];
    const element = panel([WITH_BUTTONS], true, (command) => sent.push(command));
    // The panel's buttons, found in the rendered tree without a browser.
    const buttonsIn = (node: unknown): { props: { children: unknown; onClick?: () => void } }[] => {
      if (!node || typeof node !== 'object') return [];
      if (Array.isArray(node)) return node.flatMap(buttonsIn);
      const { type, props } = node as { type: unknown; props: { children?: unknown } };
      if (typeof type === 'function') return buttonsIn((type as (props: unknown) => unknown)(props));
      return type === 'button' ? [node as { props: { children: unknown; onClick?: () => void } }] : buttonsIn(props?.children);
    };

    for (const button of buttonsIn(element)) button.props.onClick?.();

    expect(sent).toEqual([
      { kind: 'arm', target: 'propresenter' },
      { kind: 'disarm', target: 'propresenter' },
      { kind: 'fire-again', target: 'propresenter' },
      { kind: 'run-button', target: 'propresenter', button: 'clear' },
      { kind: 'run-button', target: 'propresenter', button: 'logo' },
    ]);
  });

  const PLAYLISTS = [
    { id: 'p1', label: 'October 25' },
    { id: 'p2', label: 'October 11' },
  ];
  const WITH_PICK: Connection = { ...ONLINE, pick: { label: 'Playlist', options: PLAYLISTS, picked: null } };
  const PICKED: Connection = { ...ONLINE, pick: { label: 'Playlist', options: PLAYLISTS, picked: PLAYLISTS[1]! } };
  // The row's select: its label, whether it is disabled, its options' labels and the one selected.
  const selectOf = (markup: string) => {
    const select = /<label class="connection-pick"><span class="connection-pick-label">([^<]*)<\/span><select([^>]*)>(.*?)<\/select><\/label>/.exec(markup);
    if (!select) return null;
    const [, label = '', attributes = '', inner = ''] = select;
    const options = [...inner.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)];
    return {
      label,
      disabled: attributes.includes('disabled'),
      options: options.map(([, , text = '']) => text),
      selected: options.filter(([, optionAttributes = '']) => optionAttributes.includes('selected')).map(([, , text = '']) => text),
    };
  };

  it("shows a row's pick as a labelled select of what it offers, after its buttons, with a line naming the pick", () => {
    const picked = rowOf(PICKED);

    expect(selectOf(picked)).toEqual({ label: 'Playlist', disabled: false, options: ['Pick a playlist', 'October 25', 'October 11'], selected: ['October 11'] });
    expect(text(picked)).toContain('Fire again Playlist Pick a playlist October 25 October 11 Playlist: October 11 Every song and section matches.');
  });

  it('says no playlist is picked while none is, with the select on its prompt', () => {
    const none = rowOf(WITH_PICK);

    expect(selectOf(none)?.selected).toEqual(['Pick a playlist']);
    expect(text(none)).toContain('No playlist picked');
  });

  it('shows no select on a row that offers no pick', () => {
    expect(selectOf(rowOf(ONLINE))).toBeNull();
    expect(rowOf(ONLINE)).not.toContain('connection-pick');
  });

  it('disables the select on an offline row and while the page is not connected, and keeps showing the pick', () => {
    expect(selectOf(rowOf({ ...PICKED, connection: 'offline' }))?.disabled).toBe(true);
    expect(selectOf(rowOf(PICKED, false))?.disabled).toBe(true);
    expect(text(rowOf({ ...PICKED, connection: 'offline' }))).toContain('Playlist: October 11');
  });

  it('disables the select while no set is known, and says why in place of naming the pick', () => {
    const markup = renderToStaticMarkup(panel([WITH_PICK], true, () => {}, [], false));

    expect(selectOf(markup)?.disabled).toBe(true);
    expect(text(markup)).toContain('No playlist can be picked until the set is read from Live.');
    expect(text(markup)).not.toContain('No playlist picked');
  });

  it("disables the select on the producer page while the server has read no set from Live, and enables it once one is", () => {
    const producerPage = (set: ProducerSnapshot['set']) =>
      renderToStaticMarkup(createElement(Page, { role: 'producer', snapshot: { ...SNAPSHOT, set, connections: [WITH_PICK], connectionProblems: [] }, connected: true, send: () => {} }));

    expect(selectOf(producerPage(null))?.disabled).toBe(true);
    expect(selectOf(producerPage(SNAPSHOT.set))?.disabled).toBe(false);
  });

  it('sends the pick by the target name and the choice id when the producer chooses one', () => {
    const sent: PageCommand[] = [];
    const element = panel([WITH_PICK], true, (command) => sent.push(command));
    // The panel's select, found in the rendered tree without a browser.
    const selectsIn = (node: unknown): { props: { onChange?: (event: { target: { value: string } }) => void } }[] => {
      if (!node || typeof node !== 'object') return [];
      if (Array.isArray(node)) return node.flatMap(selectsIn);
      const { type, props } = node as { type: unknown; props: { children?: unknown } };
      if (typeof type === 'function') return selectsIn((type as (props: unknown) => unknown)(props));
      return type === 'select' ? [node as { props: { onChange?: (event: { target: { value: string } }) => void } }] : selectsIn(props?.children);
    };

    const [select] = selectsIn(element);
    select?.props.onChange?.({ target: { value: 'p2' } });

    expect(sent).toEqual([{ kind: 'pick', target: 'propresenter', choice: 'p2' }]);
  });

  it("shows each row's pre-service check", () => {
    expect(text(rowOf(ONLINE))).toContain('Every song and section matches.');
    expect(text(rowOf({ ...ONLINE, connection: 'offline', check: { kind: 'not-checked' } }))).toContain('Not checked.');

    const markup = rowOf({ ...ONLINE, check: { kind: 'unmatched', names: ['Chorus', 'Bridge 2'], problems: [], notes: [] } });
    expect(text(markup)).toContain('Cannot match: Chorus Bridge 2');
    expect(text(markup)).not.toContain('Every song and section matches.');
    expect(text(markup)).not.toContain('Problems:');
    expect(markup).not.toContain('check-problem');
    expect([...markup.matchAll(/<li class="check-unmatched-name">([^<]*)<\/li>/g)].map(([, name]) => name)).toEqual(['Chorus', 'Bridge 2']);
    expect(markup).not.toContain('check-problems');
  });

  it("shows a matched row's pass text as its check carries it, not another target's", () => {
    const markup = rowOf({ ...ONLINE, name: 'eos', label: 'Lights', check: { kind: 'matched', passText: 'Every song has a cue.', notes: [] } });

    expect(text(markup)).toContain('Every song has a cue.');
    expect(text(markup)).not.toContain('Every song and section matches.');
  });

  it("shows a row's check problems that are not a failed match apart from the names it cannot match, never under Cannot match:", () => {
    const markup = rowOf({
      ...ONLINE,
      check: { kind: 'unmatched', names: ['Great Are You Lord: no cue Tag'], problems: ['Goodness of God: cue 11 never fires, cue 3 has the same label'], notes: [] },
    });
    expect(problemLines(markup)).toEqual(['Goodness of God: cue 11 never fires, cue 3 has the same label']);
    expect(unmatchedNames(markup)).toEqual(['Great Are You Lord: no cue Tag']);
    const [before, after] = text(markup).split('Cannot match:');
    expect(before).toContain('Goodness of God: cue 11 never fires, cue 3 has the same label');
    expect(after).not.toContain('never fires');
    expect(after).toContain('Great Are You Lord: no cue Tag');

    const missing = rowOf({ ...ONLINE, check: { kind: 'unmatched', names: [], problems: ['Cue list 2 is not in the show file, or holds no cues.'], notes: [] } });
    expect(problemLines(missing)).toEqual(['Cue list 2 is not in the show file, or holds no cues.']);
    expect(text(missing)).toContain('Cue list 2 is not in the show file, or holds no cues.');
    expect(text(missing)).not.toContain('Cannot match:');
    expect(text(missing)).not.toContain('Every song and section matches.');
    expect(missing).not.toContain('check-unmatched');
  });

  it("shows a row's own problems under Problems:, apart from and before the songs and sections it cannot match", () => {
    const problemLines = (markup: string) => [...markup.matchAll(/<li class="check-problem">([^<]*)<\/li>/g)].map(([, line]) => line);
    const matchLines = (markup: string) => [...markup.matchAll(/<li class="check-unmatched-name">([^<]*)<\/li>/g)].map(([, line]) => line);

    const mixed = rowOf({ ...ONLINE, check: { kind: 'unmatched', names: ['There Is Freedom: no presentation or playlist item of its name'], problems: ['House of the Lord: not authorized in ProPresenter'], notes: [] } });
    expect(text(mixed)).toContain('Problems: House of the Lord: not authorized in ProPresenter Cannot match: There Is Freedom: no presentation or playlist item of its name');
    expect(problemLines(mixed)).toEqual(['House of the Lord: not authorized in ProPresenter']);
    expect(matchLines(mixed)).toEqual(['There Is Freedom: no presentation or playlist item of its name']);

    for (const problem of ['no playlist picked', 'Gone Playlist: could not be read from ProPresenter']) {
      const markup = rowOf({ ...ONLINE, check: { kind: 'unmatched', names: [], problems: [problem], notes: [] } });
      expect(text(markup)).toContain(`Problems: ${problem}`);
      expect(problemLines(markup)).toEqual([problem]);
      expect(matchLines(markup)).toEqual([]);
      expect(text(markup)).not.toContain('Cannot match:');
      expect(text(markup)).not.toContain('Every song and section matches.');
    }
  });

  it("shows a row's notes under Notes:, after what it cannot match, and a check with notes alone as matched", () => {
    const noteLines = (markup: string) => [...markup.matchAll(/<li class="check-note">([^<]*)<\/li>/g)].map(([, line]) => line);
    const notes = ['Holy Forever: 3 sections Chorus 1, 1 group', 'Holy Forever: Verse 1 has 4 slides in 2 bars, changed on beats'];

    const matchedWithNotes = rowOf({ ...ONLINE, check: { kind: 'matched', passText: 'Every song and section matches.', notes } });
    expect(text(matchedWithNotes)).toContain(`Every song and section matches. Notes: ${notes.join(' ')}`);
    expect(text(matchedWithNotes)).not.toContain('Cannot match:');
    expect(noteLines(matchedWithNotes)).toEqual(notes);

    const unmatchedWithNotes = rowOf({ ...ONLINE, check: { kind: 'unmatched', names: ['No Such Song: no presentation or playlist item of its name'], problems: [], notes } });
    expect(text(unmatchedWithNotes)).toContain(`Cannot match: No Such Song: no presentation or playlist item of its name Notes: ${notes.join(' ')}`);
    expect(noteLines(unmatchedWithNotes)).toEqual(notes);
    expect([...unmatchedWithNotes.matchAll(/<li class="check-unmatched-name">([^<]*)<\/li>/g)].map(([, line]) => line)).toEqual(['No Such Song: no presentation or playlist item of its name']);

    for (const markup of [rowOf(ONLINE), rowOf({ ...ONLINE, check: { kind: 'unmatched', names: ['Chorus'], problems: [], notes: [] } })]) {
      expect(text(markup)).not.toContain('Notes:');
      expect(markup).not.toContain('check-notes');
    }
  });

  it("shows a row's notes in the grey of the check's status line, not its green or the warning colour of what cannot match", () => {
    const heading = { tag: 'p', classes: ['check-notes-heading'] };
    const list = { tag: 'ul', classes: ['check-notes'] };
    const warning = stylesheet.value([{ tag: 'div', classes: ['check', 'unmatched'] }, { tag: 'ul', classes: ['check-unmatched'] }], 'color');
    const grey = stylesheet.value([{ tag: 'div', classes: ['check', 'not-checked'] }, { tag: 'p', classes: ['check-status'] }], 'color');

    for (const kind of ['matched', 'unmatched']) {
      const check = { tag: 'div', classes: ['check', kind] };
      expect(stylesheet.value([check, heading], 'color')).toBe(grey);
      expect(stylesheet.value([check, list], 'color')).toBe(grey);
      expect(stylesheet.value([check, list], 'color')).not.toBe(warning);
    }
    expect(stylesheet.value([list], 'margin-top')).toBe(stylesheet.value([{ tag: 'ul', classes: ['check-unmatched'] }], 'margin-top'));
    expect(stylesheet.value([list], 'padding-left')).toBe(stylesheet.value([{ tag: 'ul', classes: ['check-unmatched'] }], 'padding-left'));
  });

  it("shows a row's device check: its notes, and its problems as the check's problem lines", () => {
    const device = (problems: string[]) => rowOf({ ...ONLINE, name: 'atem', label: 'ATEM', check: { kind: 'device', problems, notes: ['Model: ATEM Mini, firmware 8.1.1.'] } });

    const good = device([]);
    expect(text(good)).toContain('Model: ATEM Mini, firmware 8.1.1.');
    expect(problemLines(good)).toEqual([]);
    expect(good).not.toContain('check-problems');

    const missing = device(['Pro is input 7, which this ATEM does not have.', 'Camera is input 9, which this ATEM does not have.']);
    expect(text(missing)).toContain('Model: ATEM Mini, firmware 8.1.1. Pro is input 7, which this ATEM does not have. Camera is input 9, which this ATEM does not have.');
    expect(problemLines(missing)).toEqual(['Pro is input 7, which this ATEM does not have.', 'Camera is input 9, which this ATEM does not have.']);
    for (const markup of [good, missing]) {
      expect(text(markup)).not.toContain('Every song and section matches.');
      expect(text(markup)).not.toContain('Cannot match:');
      expect(text(markup)).not.toContain('Not checked.');
    }
  });

  it("shows a configured row's reported problem after its buttons and before its check, and no problem list when it has none", () => {
    const PROBLEM = 'The ATEM could not connect: Could not start the socket process.';
    const markup = rowOf({ ...WITH_BUTTONS, name: 'atem', label: 'ATEM', connection: 'offline', check: { kind: 'not-checked' }, problems: [PROBLEM] });

    expect(text(markup)).toBe(`Connections ATEM Offline Disarmed Arm Disarm Fire again Clear slides Show logo ${PROBLEM} Not checked.`);
    expect([...markup.matchAll(/<li class="connection-problem">([^<]*)<\/li>/g)].map(([, problem]) => problem)).toEqual([PROBLEM]);
    expect(rowOf(ONLINE)).not.toContain('connection-problems');
  });

  const rowClasses = (connection: Connection) => classes(rowOf(connection)).find((names) => names.includes('connection')) ?? [];
  const inPanel = (names: string[]): Element[] => [
    { tag: 'html' },
    { tag: 'body' },
    { tag: 'div' },
    { tag: 'main' },
    { tag: 'section', classes: ['connections'] },
    { tag: 'ul', classes: ['connection-list'] },
    { tag: 'li', classes: names },
  ];

  it('shows a target the config disabled as not configured, with its problem and no Arm or Disarm', () => {
    const markup = rowOf(NOT_CONFIGURED);

    expect(text(markup)).toBe('Connections Lights Not configured The port must be a number.');
    expect(rowButtons(markup)).toEqual([]);
    expect(rowClasses(NOT_CONFIGURED)).toEqual(['connection', 'not-configured']);
  });

  it('marks a not-configured row in red', () => {
    expect(stylesheet.value(inPanel(rowClasses(NOT_CONFIGURED)), 'border')).toContain('#e5484d');
  });

  it("shows the config file's own problem in place of the empty list", () => {
    const markup = renderToStaticMarkup(panel([], true, () => {}, ['The connections config file is not valid JSON.']));

    expect(text(markup)).toBe('Connections The connections config file is not valid JSON.');
  });

  it("passes the producer snapshot's config problems to the panel", () => {
    const markup = page('producer', { ...PRODUCER, connectionProblems: ['The connections config file is not valid JSON.'] });

    expect(text(markup)).toContain('Connections The connections config file is not valid JSON.');
    expect(text(markup)).not.toContain('No connections are configured.');
  });

  it('marks an offline row in red, and an online row not', () => {
    const offline = rowClasses({ ...ONLINE, connection: 'offline' });

    expect(text(rowOf({ ...ONLINE, connection: 'offline' }))).toContain('Offline');
    expect(offline).toContain('offline');
    expect(stylesheet.value(inPanel(offline), 'border')).toContain('#e5484d');
    expect(stylesheet.value(inPanel(rowClasses(ONLINE)), 'border')).not.toContain('#e5484d');
  });
});

describe('the page role', () => {
  it('gives the leader page, on the leader socket for its secret, with or without a trailing slash', () => {
    expect(pageRole('/leader/abc')).toEqual({ role: 'leader', socketPath: '/ws/leader/abc' });
    expect(pageRole('/leader/abc/')).toEqual({ role: 'leader', socketPath: '/ws/leader/abc' });
  });

  it('gives the producer page, on the producer socket for its secret, with or without a trailing slash', () => {
    expect(pageRole('/producer/abc')).toEqual({ role: 'producer', socketPath: '/ws/producer/abc' });
    expect(pageRole('/producer/abc/')).toEqual({ role: 'producer', socketPath: '/ws/producer/abc' });
  });

  it('gives the view-only page on every other path, the leader and producer paths with no secret included', () => {
    for (const path of ['/', '/leader', '/leader/', '/leaderboard', '/leader/abc/def', '/setup', '/producer', '/producer/', '/producers', '/producer/abc/def']) {
      expect(pageRole(path), path).toEqual({ role: 'viewer', socketPath: '/ws' });
    }
  });

  it('builds the leader page and its socket from the secret', () => {
    expect(leaderPagePath('abc')).toBe('/leader/abc');
    expect(leaderSocketPath('abc')).toBe('/ws/leader/abc');
  });

  it('builds the producer page and its socket from the secret', () => {
    expect(producerPagePath('abc')).toBe('/producer/abc');
    expect(producerSocketPath('abc')).toBe('/ws/producer/abc');
  });

  it('lets the leader and the producer control Live, and never a viewer', () => {
    expect(controls('leader')).toBe(true);
    expect(controls('producer')).toBe(true);
    expect(controls('viewer')).toBe(false);
  });
});

// A set for the chart view: song 1 repeats its Verse and its Chorus, with a one-bar Tag before its
// End, in 4/4 by its locators. Song 2 follows it.
const CHART_SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Build My Life',
      sections: [
        { name: 'Count Off', time: 0, end: 8, cue: 0 },
        { name: 'Verse', time: 8, end: 24, cue: 1 },
        { name: 'Chorus', time: 24, end: 56, cue: 2 },
        { name: 'Verse', time: 56, end: 72, cue: 3 },
        { name: 'Chorus', time: 72, end: 104, cue: 4 },
        { name: 'Tag', time: 104, end: 108, cue: 5 },
      ],
      end: 108,
      endCue: 6,
    },
    {
      number: 2,
      title: 'Goodness of God',
      sections: [{ name: 'Intro', time: 112, end: 128, cue: 7 }],
      end: 128,
      endCue: 8,
    },
  ],
  warnings: [],
};
// The playhead in song 1's second Chorus. Live counts it in its own signature, 16 bars where the
// locators make 8 bars of 4/4, so the current block shows Live's count.
const SECOND_CHORUS: Snapshot['now'] = { song: 1, section: 4, next: 5, bar: 3, bars: 16, fraction: 0.125 };
const CHART_SNAPSHOT: Snapshot = { ...SNAPSHOT, set: CHART_SET, now: SECOND_CHORUS, endToggles: { 1: 'stop', 2: 'stop' } };

describe('the part picker', () => {
  const page = (role: Role, part?: Part | null, snapshot: Snapshot | ProducerSnapshot = CHART_SNAPSHOT) =>
    renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {}, part, onPart: () => {} }));
  const picker = (markup: string) => /<label class="part-picker">.*?<\/label>/.exec(markup)?.[0];
  const options = (markup: string) => [...(picker(markup) ?? '').matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map(([, value, selected, label]) => ({ value, selected: !!selected, label }));

  it('is a select labelled Part on the view-only page, first on the page, with No part and then each part', () => {
    const markup = page('viewer', null);
    expect(markup).toMatch(/^<main><label class="part-picker">/);
    expect(text(picker(markup) ?? '')).toMatch(/^Part /);
    expect(options(markup).map(({ label }) => label)).toEqual(['No part', 'Keys', 'Guitar', 'Bass', 'Vocals', 'Drums']);
    expect(options(markup).map(({ label }) => label).slice(1)).toEqual([...PARTS]);
  });

  it('shows the part picked, or No part', () => {
    expect(options(page('viewer', null)).filter(({ selected }) => selected).map(({ label }) => label)).toEqual(['No part']);
    expect(options(page('viewer')).filter(({ selected }) => selected).map(({ label }) => label)).toEqual(['No part']);
    for (const part of PARTS) {
      expect(options(page('viewer', part)).filter(({ selected }) => selected).map(({ label }) => label)).toEqual([part]);
    }
  });

  it('is on the view-only page before the set is known, and while Live is not connected', () => {
    expect(picker(page('viewer', 'Keys', { ...CHART_SNAPSHOT, set: null }))).toBeDefined();
    expect(picker(page('viewer', 'Keys', { ...CHART_SNAPSHOT, live: 'not-connected' }))).toBeDefined();
  });

  it('is not on the leader page or the producer page, which stay as they are with or without a part', () => {
    const producer: ProducerSnapshot = { ...CHART_SNAPSHOT, connections: [], connectionProblems: [] };
    for (const [role, snapshot] of [
      ['leader', CHART_SNAPSHOT],
      ['producer', producer],
    ] as const) {
      expect(picker(page(role, 'Keys', snapshot))).toBeUndefined();
      expect(page(role, 'Keys', snapshot)).toBe(page(role, undefined, snapshot));
      expect(page(role, 'Keys', snapshot)).not.toContain('chart');
    }
  });

  it('leaves the view-only page as it is below the picker with no part', () => {
    const markup = page('viewer', null);
    const below = markup.replace(picker(markup) ?? '', '');
    expect(page('viewer').replace(picker(page('viewer')) ?? '', '')).toBe(below);
    expect(below).toContain('class="now-playing"');
    expect(classes(below).flat().filter((name) => name === 'song')).toHaveLength(2);
    expect(below).not.toContain('chart');
  });

  it('adds no button to the view-only page, with or without a part', () => {
    for (const part of [null, ...PARTS]) expect(page('viewer', part)).not.toContain('<button');
  });
});

describe('the chart view', () => {
  const page = (part: Part | null, snapshot: Partial<Snapshot> = {}, connected = true) =>
    renderToStaticMarkup(createElement(Page, { role: 'viewer', snapshot: { ...CHART_SNAPSHOT, ...snapshot }, connected, send: () => {}, part, onPart: () => {} }));
  const blocks = (markup: string) =>
    [...markup.matchAll(/<li class="chart-block([^"]*)"><span class="chart-block-name">([^<]*)<\/span>(?:<span class="chart-block-bars">([^<]*)<\/span>)?<\/li>/g)].map(([, names = '', name, bars]) => ({
      name,
      bars: bars ?? null,
      classes: names.trim().split(' ').filter(Boolean),
    }));

  it("shows the song the playhead is in as one block per locator in played order, a repeated section each time, each with its name and bar count", () => {
    const markup = page('Keys');
    expect(/<h2 class="chart-song">([^<]*)<\/h2>/.exec(markup)?.[1]).toBe('Build My Life');
    expect(blocks(markup).map(({ name, bars }) => [name, bars])).toEqual([
      ['Count Off', '2 bars'],
      ['Verse', '4 bars'],
      ['Chorus', '8 bars'],
      ['Verse', '4 bars'],
      // The current block, counted by Live.
      ['Chorus', '16 bars'],
      ['Tag', '1 bar'],
      ['End', null],
    ]);
  });

  it('marks the current block, the second Chorus and not the first, and only it', () => {
    const marked = blocks(page('Keys')).map(({ classes }) => classes);
    expect(marked).toEqual([[], [], [], [], ['current'], [], []]);
    expect(blocks(page('Keys', { now: { ...SECOND_CHORUS!, section: 2, next: 3, bars: 8 } })).map(({ classes }) => classes.includes('current'))).toEqual([false, false, true, false, false, false, false]);
  });

  it('marks a waiting jump and the looped section as the setlist does', () => {
    const marked = blocks(page('Keys', { jump: { song: 1, section: 1 }, loop: { start: 72, length: 32, section: { song: 1, section: 4 } } })).map(({ classes }) => classes);
    expect(marked).toEqual([[], ['waiting'], [], [], ['current', 'looping'], [], []]);
  });

  it('never marks End, even while a jump to it waits', () => {
    expect(blocks(page('Keys', { jump: { song: 1, section: 'end' } })).at(-1)).toEqual({ name: 'End', bars: null, classes: [] });
  });

  it("follows the playhead into the next song", () => {
    const markup = page('Keys', { now: { song: 2, section: 0, next: 'end', bar: 1, bars: 4, fraction: 0 } });
    expect(/<h2 class="chart-song">([^<]*)<\/h2>/.exec(markup)?.[1]).toBe('Goodness of God');
    expect(blocks(markup)).toEqual([
      { name: 'Intro', bars: '4 bars', classes: ['current'] },
      { name: 'End', bars: null, classes: [] },
    ]);
  });

  it("shows the set's first song with no block marked before the playhead is in a song", () => {
    const markup = page('Keys', { now: null });
    expect(/<h2 class="chart-song">([^<]*)<\/h2>/.exec(markup)?.[1]).toBe('Build My Life');
    expect(blocks(markup).flatMap(({ classes }) => classes)).toEqual([]);
  });

  it('replaces the now-playing panel and the setlist', () => {
    const markup = page('Guitar');
    expect(markup).not.toContain('now-playing');
    expect(classes(markup).flat()).not.toContain('song');
    expect(classes(markup).flat()).not.toContain('sections');
  });

  it('keeps the Reconnecting line, the Live not connected panel and the no-set statuses', () => {
    expect(text(page('Keys', {}, false))).toContain('Reconnecting to the server.');
    const lost = page('Keys', { live: 'not-connected', now: null });
    expect(text(lost)).toContain('Live not connected');
    expect(blocks(lost)).toHaveLength(7);
    expect(text(page('Keys', { set: null }))).toContain('Waiting for Live.');
    expect(text(page('Keys', { set: { songs: [], warnings: [] } }))).toContain('The set in Live has no songs.');
  });

  const inChart = (...elements: Element[]): Element[] => [
    { tag: 'html' },
    { tag: 'body' },
    { tag: 'div' },
    { tag: 'main' },
    { tag: 'section', classes: ['chart'] },
    ...elements,
  ];
  const block = (names: string[]) => inChart({ tag: 'ol', classes: ['chart-blocks'] }, { tag: 'li', classes: ['chart-block', ...names] });

  it("uses the dark stylesheet's system fonts, and the setlist's highlight for the current block", () => {
    const setlistCurrent: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['song'] }, { tag: 'ol', classes: ['sections'] }, { tag: 'li', classes: ['current'] }];
    expect(stylesheet.value([{ tag: 'html' }], 'font-family')).toMatch(/-apple-system/);
    // The helper models no inheritance: no rule on the way down sets a font of its own, so the root's wins.
    for (const path of [inChart(), block([]), block(['current']), [...block([]), { tag: 'span', classes: ['chart-block-name'] }]]) {
      expect(stylesheet.value(path, 'font-family')).toBeUndefined();
      expect(stylesheet.value(path, 'font')).toBeUndefined();
    }
    expect(stylesheet.value(block(['current']), 'background')).toBe(stylesheet.value(setlistCurrent, 'background'));
    expect(stylesheet.value(block([]), 'background')).not.toBe(stylesheet.value(block(['current']), 'background'));
  });

  it('gives the part select the page font, where a browser would give a select its own', () => {
    const select: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'label', classes: ['part-picker'] }, { tag: 'select', classes: ['part-select'] }];
    expect(stylesheet.value(select, 'font')).toBe('inherit');
    expect(stylesheet.value(select, 'color')).toBe('inherit');
  });

  it('leaves a viewport of space under the last block, so it can scroll to the top', () => {
    expect(stylesheet.value(inChart({ tag: 'ol', classes: ['chart-blocks'] }), 'padding-bottom')).toBe('100vh');
  });

  describe('the pinned strip', () => {
    const strip = (markup: string) => /<section class="chart-strip" aria-label="Next section">(.*?)<\/section>/.exec(markup)?.[1];
    const VERSE: Snapshot['now'] = { song: 1, section: 1, next: 2, bar: 3, bars: 8, fraction: 0.25 };

    it('names the next section and the bars until it starts, first under the pickers and over the song', () => {
      const markup = page('Keys', { now: VERSE });
      expect(strip(markup)).toBe('<span class="label">Next</span><span class="chart-strip-section">Chorus</span><span class="chart-strip-bars">in 6 bars</span>');
      expect(markup).toMatch(/<\/label><section class="chart-strip"[^>]*>.*?<\/section><section class="chart" aria-label="Chart">/);
      expect(text(strip(page('Keys', { now: { ...VERSE, bar: 8 } })) ?? '')).toBe('Next Chorus in 1 bar');
      expect(text(strip(page('Keys')) ?? '')).toBe('Next Tag in 14 bars');
    });

    it('says Loop with no countdown while the loop is on', () => {
      const markup = strip(page('Keys', { loop: { start: 72, length: 32, section: { song: 1, section: 4 } } })) ?? '';
      expect(markup).toBe('<span class="chart-strip-loop">Loop</span>');
      expect(markup).not.toContain('chart-strip-bars');
    });

    it("names the next song's title and its first section in a song's last section", () => {
      const markup = page('Keys', { now: { song: 1, section: 5, next: 'end', bar: 1, bars: 1, fraction: 0 } });
      expect(strip(markup)).toBe('<span class="label">Next</span><span class="chart-strip-song">Goodness of God</span><span class="chart-strip-section">Intro</span><span class="chart-strip-bars">in 1 bar</span>');
    });

    it("says Last section with no countdown in the last section of the set's last song with no End", () => {
      const set: SetList = { ...CHART_SET, songs: [CHART_SET.songs[0]!, { ...CHART_SET.songs[1]!, sections: [{ name: 'Intro', time: 112, end: null, cue: 7 }], end: null, endCue: null }] };
      const markup = strip(page('Keys', { set, now: { song: 2, section: 0, next: 'end', bar: 2, bars: null, fraction: null } })) ?? '';
      expect(markup).toBe('<span class="chart-strip-section">Last section</span>');
    });

    it('is not drawn before the playhead is in a song, nor while Live is not connected', () => {
      expect(page('Keys', { now: null })).not.toContain('chart-strip');
      expect(page('Keys', { live: 'not-connected', now: null })).not.toContain('chart-strip');
    });

    it('is not on the leader page, the producer page, or the view-only page with no part', () => {
      const producer: ProducerSnapshot = { ...CHART_SNAPSHOT, connections: [], connectionProblems: [] };
      for (const [role, snapshot] of [
        ['leader', CHART_SNAPSHOT],
        ['producer', producer],
      ] as const) {
        expect(renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {}, part: 'Keys', onPart: () => {} }))).not.toContain('chart-strip');
      }
      expect(page(null)).not.toContain('chart-strip');
    });

    const inStrip = (...elements: Element[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main', classes: ['chart-page'] }, { tag: 'section', classes: ['chart-strip'] }, ...elements];

    it('holds to the top of the screen over the blocks, opaque, in the page font', () => {
      expect(stylesheet.value(inStrip(), 'position')).toBe('sticky');
      expect(stylesheet.value(inStrip(), 'top')).toBe('0');
      expect(stylesheet.value(inStrip(), 'background')).toMatch(/^#[0-9a-f]{3,6}$/);
      for (const path of [inStrip(), ...['label', 'chart-strip-song', 'chart-strip-section', 'chart-strip-bars', 'chart-strip-loop'].map((name) => inStrip({ tag: 'span', classes: [name] }))]) {
        expect(stylesheet.value(path, 'font-family')).toBeUndefined();
        expect(stylesheet.value(path, 'font')).toBeUndefined();
      }
    });
  });
});

describe("the chart view's lyrics and chords", () => {
  // Build My Life's chart, made up: one VERSE, two CHORUS headings, a note and a gap between stanzas.
  // Goodness of God has none. The songs are not in the set's order, so a chart picked by its place in
  // the list, or by the song's number, is another song's.
  const CHARTS: SetCharts = {
    revision: 3,
    songs: [
      { title: 'Way Maker', stemsKey: 'E', chartKey: 'E', chartText: 'VERSE\n[E]Way maker words' },
      { title: 'Goodness of God', stemsKey: 'A' },
      { title: 'build my  life', stemsKey: 'B', chartKey: 'B', chartText: 'VERSE\n[B]Verse words [E]here\n\nmore verse words\nCHORUS\n{ Keys only }\n[E]First [B/D#]chorus\nCHORUS\n[F#]Second chorus' },
    ],
  };
  // The set with Goodness of God given a Verse, which Build My Life's chart has a heading for, and Way
  // Maker after it with a chart of its own, so a song drawing another song's chart draws its lines.
  const THREE_SONGS: SetList = {
    songs: [
      CHART_SET.songs[0]!,
      {
        ...CHART_SET.songs[1]!,
        sections: [
          { name: 'Intro', time: 112, end: 120, cue: 7 },
          { name: 'Verse', time: 120, end: 128, cue: 8 },
        ],
        endCue: 9,
      },
      { number: 3, title: 'Way Maker', sections: [{ name: 'Verse', time: 132, end: 148, cue: 10 }], end: 148, endCue: 11 },
    ],
    warnings: [],
  };
  const page = (charts: SetCharts | null | undefined, snapshot: Partial<Snapshot> = {}, role: Role = 'viewer', display?: Display, part: Part = 'Keys') =>
    renderToStaticMarkup(createElement(Page, { role, snapshot: { ...CHART_SNAPSHOT, ...snapshot }, connected: true, send: () => {}, part, onPart: () => {}, display, onDisplay: () => {}, charts }));
  // Each block's name and the text of its lines, a chord written as [chord] before its words.
  const blocks = (markup: string) =>
    [...markup.matchAll(/<li class="chart-block[^"]*">(.*?)<\/li>/g)].map(([, inner = '']) => ({
      name: /<span class="chart-block-name">([^<]*)<\/span>/.exec(inner)?.[1],
      bars: /<span class="chart-block-bars">([^<]*)<\/span>/.exec(inner)?.[1] ?? null,
      lines: [...inner.matchAll(/<(p|div) class="(chart-line|chart-note|chart-gap)">(.*?)<\/\1>/g)].map(([, , kind, line = '']) =>
        kind === 'chart-gap' ? '' : kind === 'chart-note' ? `{${line}}` : line.replace(/<span class="chart-chord">([^<]*)<\/span>/g, (_, chord: string) => (chord === '\u00a0' ? '' : `[${chord}]`)).replace(/<[^>]*>/g, ''),
      ),
    }));

  it('shows each block the lines of its matched heading, the chords over the lyrics, the second Chorus taking the second CHORUS', () => {
    expect(blocks(page(CHARTS))).toEqual([
      { name: 'Count Off', bars: '2 bars', lines: [] },
      { name: 'Verse', bars: '4 bars', lines: ['[B]Verse words [E]here', '', 'more verse words'] },
      { name: 'Chorus', bars: '8 bars', lines: ['{Keys only}', '[E]First [B/D#]chorus'] },
      { name: 'Verse', bars: '4 bars', lines: ['[B]Verse words [E]here', '', 'more verse words'] },
      { name: 'Chorus', bars: '16 bars', lines: ['[F#]Second chorus'] },
      { name: 'Tag', bars: '1 bar', lines: [] },
      { name: 'End', bars: null, lines: [] },
    ]);
  });

  it('draws a chord over its words as one chunk, and a line with no chord as its words alone', () => {
    const markup = page(CHARTS);
    expect(markup).toContain('<span class="chart-chunk"><span class="chart-chord">E</span><span class="chart-lyric">First </span></span>');
    expect(markup).toContain('<p class="chart-line"><span class="chart-lyric">more verse words</span></p>');
    expect(markup).toContain('<p class="chart-note">Keys only</p>');
  });

  const MISSING = '<p class="chart-missing">No chart for this song</p>';
  const goodness = { now: { song: 2, section: 0, next: 'end' as const, bar: 1, bars: 4, fraction: 0 } };

  it('shows "No chart for this song" under the song, over its blocks\' names and bar counts, in every display, once the fetched charts hold none for it', () => {
    const inSecond = { set: THREE_SONGS, now: { song: 2, section: 0, next: 1, bar: 1, bars: 2, fraction: 0 } };
    for (const { value } of DISPLAYS) {
      const empty = page({ revision: 1, songs: [] }, {}, 'viewer', value);
      expect(empty, value).toContain(`<h2 class="chart-song">Build My Life</h2>${MISSING}`);
      expect(blocks(empty).map(({ name, bars, lines }) => [name, bars, lines]), value).toEqual([
        ['Count Off', '2 bars', []],
        ['Verse', '4 bars', []],
        ['Chorus', '8 bars', []],
        ['Verse', '4 bars', []],
        ['Chorus', '16 bars', []],
        ['Tag', '1 bar', []],
        ['End', null, []],
      ]);
      expect(empty, value).not.toContain('chart-lines');
      // Goodness of God is in the charts with no chart text.
      const none = page(CHARTS, goodness, 'viewer', value);
      expect(none, value).toContain(`<h2 class="chart-song">Goodness of God</h2>${MISSING}`);
      expect(blocks(none), value).toEqual([
        { name: 'Intro', bars: '4 bars', lines: [] },
        { name: 'End', bars: null, lines: [] },
      ]);
      expect(page(CHARTS, inSecond, 'viewer', value), value).toContain(`<h2 class="chart-song">Goodness of God</h2>${MISSING}`);
      expect(page(CHARTS, inSecond, 'viewer', value), value).not.toContain('chart-lines');
    }
  });

  it('shows "No chart for this song" for every part, Drums\' section map included', () => {
    for (const part of PARTS) expect(page(CHARTS, goodness, 'viewer', undefined, part), part).toContain(MISSING);
  });

  it('shows no "No chart for this song" for a song with a chart, nor before the charts are fetched', () => {
    for (const { value } of DISPLAYS) expect(page(CHARTS, {}, 'viewer', value), value).not.toContain('No chart for this song');
    const plain = page(undefined);
    expect(page(null)).toBe(plain);
    expect(plain).not.toContain('No chart for this song');
    expect(plain).not.toContain('chart-line');
    expect(page(null, goodness)).not.toContain('No chart for this song');
    expect(page(null, goodness)).toBe(page({ revision: 1, songs: [] }, goodness).replace(MISSING, ''));
  });

  it("counts every block but the current one in the bars of the song's meter from the charts, with a chart or none, and 4/4 for a song with no meter", () => {
    const sixEight: SetCharts = { revision: 4, songs: CHARTS.songs.map((song) => ({ ...song, meter: '6/8' })) };
    expect(blocks(page(sixEight)).map(({ name, bars }) => [name, bars])).toEqual([
      ['Count Off', '3 bars'],
      ['Verse', '6 bars'],
      ['Chorus', '11 bars'],
      ['Verse', '6 bars'],
      ['Chorus', '16 bars'],
      ['Tag', '2 bars'],
      ['End', null],
    ]);
    expect(blocks(page(sixEight, { now: { ...SECOND_CHORUS!, song: 1, section: 1, next: 2, bars: 8 } })).map(({ bars }) => bars)).toEqual(['3 bars', '8 bars', '11 bars', '6 bars', '11 bars', '2 bars', null]);
    expect(blocks(page({ revision: 4, songs: [{ title: 'Build My Life', stemsKey: 'B', meter: '6/8' }] }, { now: null })).map(({ bars }) => bars)).toEqual(['3 bars', '6 bars', '11 bars', '6 bars', '11 bars', '2 bars', null]);
    expect(blocks(page(CHARTS, { now: null })).map(({ bars }) => bars)).toEqual(['2 bars', '4 bars', '8 bars', '4 bars', '8 bars', '1 bar', null]);
  });

  it("takes each song's meter from the first manifest song of its own title, not another song's", () => {
    const meters: SetCharts = {
      revision: 5,
      songs: [
        { title: 'Goodness of God', stemsKey: 'A', meter: '6/8' },
        { title: 'Build My Life', stemsKey: 'B', meter: '4/4' },
        { title: 'build my  life', stemsKey: 'B', meter: '6/8' },
      ],
    };
    expect(blocks(page(meters, { set: THREE_SONGS, now: null })).map(({ bars }) => bars)).toEqual(['2 bars', '4 bars', '8 bars', '4 bars', '8 bars', '1 bar', null]);
    expect(blocks(page(meters, { set: THREE_SONGS, now: { song: 2, section: 1, next: 'end', bar: 1, bars: 2, fraction: 0 } })).map(({ name, bars }) => [name, bars])).toEqual([
      ['Intro', '3 bars'],
      ['Verse', '2 bars'],
      ['End', null],
    ]);
  });

  it("draws a song's own chart, found by its title, and no other song's chart for a song with none", () => {
    const inSong = (song: number, next: number | 'end') => ({ set: THREE_SONGS, now: { song, section: 0, next, bar: 1, bars: 2, fraction: 0 } });
    expect(blocks(page(CHARTS, inSong(3, 'end')))).toEqual([
      { name: 'Verse', bars: '2 bars', lines: ['[E]Way maker words'] },
      { name: 'End', bars: null, lines: [] },
    ]);
    expect(page(CHARTS, inSong(2, 1))).toBe(page({ revision: 1, songs: [] }, inSong(2, 1)));
    expect(page(CHARTS, inSong(2, 1))).not.toContain('chart-line');
  });

  it('draws no chart text on the leader page', () => {
    expect(page(CHARTS, {}, 'leader')).toBe(page(null, {}, 'leader'));
    expect(page(CHARTS, {}, 'leader')).not.toContain('Second chorus');
  });

  const inLines = (current: boolean, ...elements: Element[]): Element[] => [
    { tag: 'html' },
    { tag: 'body' },
    { tag: 'div' },
    { tag: 'main' },
    { tag: 'section', classes: ['chart'] },
    { tag: 'ol', classes: ['chart-blocks'] },
    { tag: 'li', classes: current ? ['chart-block', 'current'] : ['chart-block'] },
    { tag: 'div', classes: ['chart-lines'] },
    ...elements,
  ];
  const chunk = (current: boolean, part: string) => inLines(current, { tag: 'p', classes: ['chart-line'] }, { tag: 'span', classes: ['chart-chunk'] }, { tag: 'span', classes: [part] });

  it("uses the dark stylesheet's system fonts for the lines, with the chords set apart from the words", () => {
    for (const current of [false, true]) {
      for (const path of [inLines(current), inLines(current, { tag: 'p', classes: ['chart-note'] }), chunk(current, 'chart-chord'), chunk(current, 'chart-lyric')]) {
        expect(stylesheet.value(path, 'font-family')).toBeUndefined();
        expect(stylesheet.value(path, 'font')).toBeUndefined();
      }
      expect(stylesheet.value(chunk(current, 'chart-chord'), 'color')).not.toBe(stylesheet.value(chunk(current, 'chart-lyric'), 'color'));
    }
    // A chord on the current block's blue is not the blue itself.
    expect(stylesheet.value(chunk(true, 'chart-chord'), 'color')).not.toBe(stylesheet.value(inLines(true).slice(0, 7), 'background'));
    // The words keep the spaces at a chunk's edge.
    expect(stylesheet.value(chunk(false, 'chart-lyric'), 'white-space')).toBe('break-spaces');
  });

  it('draws "No chart for this song" in the page font and the page\'s grey', () => {
    const missing: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'section', classes: ['chart'] }, { tag: 'p', classes: ['chart-missing'] }];
    expect(stylesheet.value(missing, 'font-family')).toBeUndefined();
    expect(stylesheet.value(missing, 'font')).toBeUndefined();
    expect(stylesheet.value(missing, 'color')).toBe(stylesheet.value([{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'label', classes: ['part-picker'] }, { tag: 'span', classes: ['part-picker-label'] }], 'color'));
  });

  describe("the chart view's displays", () => {
    // The Build My Life blocks in each display, a chord written as [chord] before its words.
    const CHORDS = [
      { name: 'Count Off', bars: '2 bars', lines: [] },
      { name: 'Verse', bars: '4 bars', lines: ['[B]Verse words [E]here', '', 'more verse words'] },
      { name: 'Chorus', bars: '8 bars', lines: ['{Keys only}', '[E]First [B/D#]chorus'] },
      { name: 'Verse', bars: '4 bars', lines: ['[B]Verse words [E]here', '', 'more verse words'] },
      { name: 'Chorus', bars: '16 bars', lines: ['[F#]Second chorus'] },
      { name: 'Tag', bars: '1 bar', lines: [] },
      { name: 'End', bars: null, lines: [] },
    ];
    const LYRICS = [
      { name: 'Count Off', bars: '2 bars', lines: [] },
      { name: 'Verse', bars: '4 bars', lines: ['Verse words here', '', 'more verse words'] },
      { name: 'Chorus', bars: '8 bars', lines: ['{Keys only}', 'First chorus'] },
      { name: 'Verse', bars: '4 bars', lines: ['Verse words here', '', 'more verse words'] },
      { name: 'Chorus', bars: '16 bars', lines: ['Second chorus'] },
      { name: 'Tag', bars: '1 bar', lines: [] },
      { name: 'End', bars: null, lines: [] },
    ];
    const MAP = CHORDS.map((block) => ({ ...block, lines: [] }));
    const SHOWN: Record<Display, typeof CHORDS> = { 'chords-over-lyrics': CHORDS, 'lyrics-only': LYRICS, 'section-map': MAP };

    const picker = (markup: string) => /<label class="display-picker">.*?<\/label>/.exec(markup)?.[0];
    const options = (markup: string) => [...(picker(markup) ?? '').matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map(([, value, selected, label]) => ({ value, selected: !!selected, label }));
    const selected = (markup: string) => options(markup).filter(({ selected }) => selected).map(({ label }) => label);

    it.each([
      ['Keys', CHORDS, 'Chords over lyrics'],
      ['Guitar', CHORDS, 'Chords over lyrics'],
      ['Bass', CHORDS, 'Chords over lyrics'],
      ['Vocals', LYRICS, 'Lyrics only'],
      ['Drums', MAP, 'Section map'],
    ] as const)('opens %s on its default display', (part, shown, label) => {
      const markup = page(CHARTS, {}, 'viewer', undefined, part);
      expect(blocks(markup)).toEqual(shown);
      expect(selected(markup)).toEqual([label]);
      if (shown === CHORDS) expect(markup).toContain('class="chart-chord"');
      else expect(markup).not.toContain('chart-chord');
      if (shown === MAP) expect(markup).not.toContain('chart-lines');
    });

    it("draws the display picked over the part's default, for every part", () => {
      for (const part of PARTS) {
        for (const { value, label } of DISPLAYS) {
          const markup = page(CHARTS, {}, 'viewer', value, part);
          expect(blocks(markup), `${part} ${value}`).toEqual(SHOWN[value]);
          expect(selected(markup), `${part} ${value}`).toEqual([label]);
        }
      }
    });

    it('is a select labelled Display, right after the Part select, with the three displays in order', () => {
      const markup = page(CHARTS);
      expect(markup).toMatch(/^<main class="chart-page"><label class="part-picker">.*?<\/label><label class="display-picker">/);
      expect(text(picker(markup) ?? '')).toMatch(/^Display /);
      expect(markup).toContain('<select class="display-select">');
      expect(options(markup)).toEqual([
        { value: 'chords-over-lyrics', selected: true, label: 'Chords over lyrics' },
        { value: 'lyrics-only', selected: false, label: 'Lyrics only' },
        { value: 'section-map', selected: false, label: 'Section map' },
      ]);
    });

    it('is on the chart page only: not on the view-only page with no part, nor on the leader or producer page', () => {
      const viewer = (part: Part | null) => renderToStaticMarkup(createElement(Page, { role: 'viewer', snapshot: CHART_SNAPSHOT, connected: true, send: () => {}, part, onPart: () => {}, display: 'lyrics-only', onDisplay: () => {} }));
      expect(picker(viewer(null))).toBeUndefined();
      expect(viewer(null)).not.toContain('display-');
      const producer: ProducerSnapshot = { ...CHART_SNAPSHOT, connections: [], connectionProblems: [] };
      for (const [role, snapshot] of [
        ['leader', CHART_SNAPSHOT],
        ['producer', producer],
      ] as const) {
        const markup = renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {}, part: 'Keys', onPart: () => {}, display: 'lyrics-only', onDisplay: () => {} }));
        expect(picker(markup)).toBeUndefined();
        expect(markup).not.toContain('display-');
      }
    });

    it('adds no button to the chart page in any display', () => {
      for (const part of PARTS) for (const { value } of DISPLAYS) expect(page(CHARTS, {}, 'viewer', value, part)).not.toContain('<button');
    });

    it('gives the display select the page font, where a browser would give a select its own', () => {
      const select: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'label', classes: ['display-picker'] }, { tag: 'select', classes: ['display-select'] }];
      expect(stylesheet.value(select, 'font')).toBe('inherit');
      expect(stylesheet.value(select, 'color')).toBe('inherit');
      expect(stylesheet.value(select, 'min-height')).toBe('3rem');
    });
  });
});

describe('the whole-set view', () => {
  // Goodness of God has no chart, Build My Life has one.
  const CHARTS: SetCharts = {
    revision: 1,
    songs: [{ title: 'Build My Life', stemsKey: 'B', chartKey: 'B', chartText: 'VERSE\n[B]Verse words\nCHORUS\n[E]First chorus\nCHORUS\n[F#]Second chorus' }],
  };
  const page = (view: View | undefined, snapshot: Partial<Snapshot> = {}, charts: SetCharts | null = null) =>
    renderToStaticMarkup(createElement(Page, { role: 'viewer', snapshot: { ...CHART_SNAPSHOT, ...snapshot }, connected: true, send: () => {}, part: 'Keys', onPart: () => {}, charts, view, onView: () => {} }));
  const songs = (markup: string) => [...markup.matchAll(/<h2 class="chart-song">([^<]*)<\/h2>/g)].map(([, title]) => title);
  // Each song's block names, by the song's section in the set.
  const songBlocks = (markup: string) =>
    [...markup.matchAll(/<section class="chart"[^>]*><h2 class="chart-song">([^<]*)<\/h2>(.*?)<\/section>/g)].map(([, title, inner = '']) => ({
      title,
      blocks: [...inner.matchAll(/<li class="chart-block([^"]*)"><span class="chart-block-name">([^<]*)<\/span>/g)].map(([, names = '', name]) => (names.includes('current') ? `${name}*` : name)),
    }));

  it('shows every song one after the next, in set order, each as its blocks in played order', () => {
    const markup = page('set');
    expect(songs(markup)).toEqual(['Build My Life', 'Goodness of God']);
    expect(songBlocks(markup)).toEqual([
      { title: 'Build My Life', blocks: ['Count Off', 'Verse', 'Chorus', 'Verse', 'Chorus*', 'Tag', 'End'] },
      { title: 'Goodness of God', blocks: ['Intro', 'End'] },
    ]);
    expect(markup).toContain('<div class="chart-set">');
  });

  it("highlights only the current block, song 1's second Chorus, and follows the playhead into song 2 with song 1 still drawn", () => {
    expect(page('set').match(/class="chart-block current"/g)).toHaveLength(1);
    const inSecond = page('set', { now: { song: 2, section: 0, next: 'end', bar: 1, bars: 4, fraction: 0 } });
    expect(songBlocks(inSecond)).toEqual([
      { title: 'Build My Life', blocks: ['Count Off', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Tag', 'End'] },
      { title: 'Goodness of God', blocks: ['Intro*', 'End'] },
    ]);
  });

  it('marks a waiting jump and the loop as the one-song view does', () => {
    const markup = page('set', { jump: { song: 2, section: 0 }, loop: { start: 72, length: 32, section: { song: 1, section: 4 } } });
    expect(markup).toContain('<li class="chart-block current looping"><span class="chart-block-name">Chorus</span>');
    expect(markup).toContain('<li class="chart-block waiting"><span class="chart-block-name">Intro</span>');
  });

  it('keeps one pinned strip over the whole set, before the songs', () => {
    const markup = page('set');
    expect(markup.match(/class="chart-strip"/g)).toHaveLength(1);
    expect(markup).toMatch(/<section class="chart-strip"[^>]*>.*?<\/section><div class="chart-set">/);
  });

  it('says "No chart for this song" under the heading of each song the charts hold none for, and only there', () => {
    const markup = page('set', {}, CHARTS);
    expect(markup.match(/No chart for this song/g)).toHaveLength(1);
    expect(markup).toContain('<h2 class="chart-song">Goodness of God</h2><p class="chart-missing">No chart for this song</p>');
    expect(markup).toContain('<span class="chart-lyric">Second chorus</span>');
    expect(page('set', {}, { revision: 1, songs: [] }).match(/No chart for this song/g)).toHaveLength(2);
  });

  it('leaves the one-song view as it is', () => {
    expect(page('song')).toBe(page(undefined));
    expect(page('song', {}, CHARTS)).toBe(page(undefined, {}, CHARTS));
    expect(songs(page('song'))).toEqual(['Build My Life']);
    expect(page('song')).not.toContain('chart-set');
  });

  it('adds no button in either view', () => {
    for (const { value } of VIEWS) expect(page(value, {}, CHARTS)).not.toContain('<button');
  });

  it("leaves a viewport of space under the set's last song only, so its last block can scroll to the top", () => {
    const inSet = (...elements: Element[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'div', classes: ['chart-set'] }, ...elements];
    expect(stylesheet.value(inSet({ tag: 'section', classes: ['chart'] }, { tag: 'ol', classes: ['chart-blocks'] }), 'padding-bottom')).toBe('0');
    expect(stylesheet.value(inSet(), 'padding-bottom')).toBe('100vh');
  });
});

describe("the chart page's View and Font size selects", () => {
  const page = (props: { view?: View; fontSize?: FontSize; part?: Part | null } = {}, role: Role = 'viewer', snapshot: Snapshot | ProducerSnapshot = CHART_SNAPSHOT) =>
    renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {}, part: 'Keys', onPart: () => {}, onView: () => {}, onFontSize: () => {}, ...props }));
  const picker = (name: string, markup: string) => new RegExp(`<label class="${name}">.*?</label>`).exec(markup)?.[0];
  const options = (markup: string | undefined) => [...(markup ?? '').matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map(([, value, selected, label]) => ({ value, selected: !!selected, label }));

  it('puts a View select and then a Font size select right after the Display select and its Chord names select', () => {
    const markup = page();
    expect(markup).toMatch(/^<main class="chart-page"><label class="part-picker">.*?<\/label><label class="display-picker">.*?<\/label><label class="chord-names-picker">.*?<\/label><label class="view-picker">.*?<\/label><label class="font-size-picker">.*?<\/label><section class="chart-strip"/);
    expect(text(picker('view-picker', markup) ?? '')).toMatch(/^View /);
    expect(text(picker('font-size-picker', markup) ?? '')).toMatch(/^Font size /);
    expect(markup).toContain('<select class="view-select">');
    expect(markup).toContain('<select class="font-size-select">');
  });

  it('offers This song and Whole set, This song selected until another is picked', () => {
    expect(options(picker('view-picker', page()))).toEqual([
      { value: 'song', selected: true, label: 'This song' },
      { value: 'set', selected: false, label: 'Whole set' },
    ]);
    expect(options(picker('view-picker', page({ view: 'set' }))).filter(({ selected }) => selected).map(({ label }) => label)).toEqual(['Whole set']);
  });

  it('offers the five font sizes from Small to Largest, Medium selected until another is picked', () => {
    expect(options(picker('font-size-picker', page())).map(({ label, selected }) => [label, selected])).toEqual([
      ['Small', false],
      ['Medium', true],
      ['Large', false],
      ['Larger', false],
      ['Largest', false],
    ]);
    for (const { value, label } of FONT_SIZES) {
      expect(options(picker('font-size-picker', page({ fontSize: value }))).filter(({ selected }) => selected).map(({ label }) => label), value).toEqual([label]);
    }
  });

  it('scales the chart text by the font size picked, and sets nothing at Medium', () => {
    expect(page()).toMatch(/^<main class="chart-page">/);
    expect(page({ fontSize: 'medium' })).toBe(page());
    expect(page({ fontSize: 'large' })).toMatch(/^<main class="chart-page" style="--chart-font-scale:1.25">/);
    expect(page({ fontSize: 'small' })).toMatch(/^<main class="chart-page" style="--chart-font-scale:0.85">/);
    expect(page({ fontSize: 'largest' })).toMatch(/^<main class="chart-page" style="--chart-font-scale:2">/);
    // Nothing else on the page changes.
    expect(page({ fontSize: 'largest' }).replace(' style="--chart-font-scale:2"', '').replace(/<option value="medium" selected="">/, '<option value="medium">')).toBe(
      page().replace(/<option value="largest">/, '<option value="largest" selected="">').replace(/<option value="medium" selected="">/, '<option value="medium">'),
    );
  });

  it("scales every chart text size in the stylesheet by the font size, and not the selects' text", () => {
    const inPage = (...elements: Element[]): Element[] => [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main', classes: ['chart-page'] }, ...elements];
    const scaled: [Element[], string][] = [
      [inPage({ tag: 'section', classes: ['chart'] }, { tag: 'h2', classes: ['chart-song'] }), '1.5rem'],
      [inPage({ tag: 'section', classes: ['chart-strip'] }), '1.25rem'],
      [inPage({ tag: 'section', classes: ['chart'] }, { tag: 'p', classes: ['chart-missing'] }), '1rem'],
      [inPage({ tag: 'section', classes: ['chart'] }, { tag: 'ol', classes: ['chart-blocks'] }, { tag: 'li', classes: ['chart-block'] }, { tag: 'span', classes: ['chart-block-name'] }), '1.5rem'],
      [inPage({ tag: 'section', classes: ['chart'] }, { tag: 'ol', classes: ['chart-blocks'] }, { tag: 'li', classes: ['chart-block'] }, { tag: 'span', classes: ['chart-block-bars'] }), '1.125rem'],
      [inPage({ tag: 'section', classes: ['chart'] }, { tag: 'ol', classes: ['chart-blocks'] }, { tag: 'li', classes: ['chart-block'] }, { tag: 'div', classes: ['chart-lines'] }), '1.25rem'],
    ];
    for (const [path, size] of scaled) expect(stylesheet.value(path, 'font-size'), path.at(-1)!.classes![0]).toBe(`calc(${size} * var(--chart-font-scale, 1))`);
    for (const name of ['part-select', 'display-select', 'view-select', 'font-size-select']) {
      expect(stylesheet.value(inPage({ tag: 'label' }, { tag: 'select', classes: [name] }), 'font-size'), name).toBeUndefined();
    }
  });

  it('gives both selects the page font and a tap target height, as the Part and Display selects have', () => {
    for (const [label, select] of [
      ['view-picker', 'view-select'],
      ['font-size-picker', 'font-size-select'],
    ]) {
      const path: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'label', classes: [label!] }, { tag: 'select', classes: [select!] }];
      expect(stylesheet.value(path, 'font'), select).toBe('inherit');
      expect(stylesheet.value(path, 'color'), select).toBe('inherit');
      expect(stylesheet.value(path, 'min-height'), select).toBe('3rem');
      expect(stylesheet.value(path.slice(0, 5), 'display'), label).toBe('flex');
    }
  });

  it('is on the chart page only: not on the view-only page with no part, nor on the leader or producer page', () => {
    const noPart = page({ part: null, view: 'set', fontSize: 'largest' });
    expect(noPart).not.toContain('view-');
    expect(noPart).not.toContain('font-size');
    expect(noPart).toBe(page({ part: null }));
    const producer: ProducerSnapshot = { ...CHART_SNAPSHOT, connections: [], connectionProblems: [] };
    for (const [role, snapshot] of [
      ['leader', CHART_SNAPSHOT],
      ['producer', producer],
    ] as const) {
      const markup = page({ view: 'set', fontSize: 'largest' }, role, snapshot);
      expect(markup, role).not.toContain('view-');
      expect(markup, role).not.toContain('font-size');
      expect(markup, role).toBe(page({}, role, snapshot));
    }
  });

  it('adds no button to the chart page for any view and font size', () => {
    for (const { value: view } of VIEWS) for (const { value: fontSize } of FONT_SIZES) expect(page({ view, fontSize })).not.toContain('<button');
  });
});

describe("the chart page's Nashville numbers and capo", () => {
  // Build My Life's chart in B, Goodness of God with none, and Way Maker's in E, all made up. Build My
  // Life plays its Verse twice, so its verse chords show twice.
  const CHARTS: SetCharts = {
    revision: 2,
    songs: [
      { title: 'Build My Life', stemsKey: 'B', chartKey: 'B', chartText: 'VERSE\n[B]Verse words [E]here\nCHORUS\n[E]First [B/D#]chorus\nCHORUS\n[F#]Second chorus' },
      { title: 'Goodness of God', stemsKey: 'A' },
      { title: 'Way Maker', stemsKey: 'E', chartKey: 'E', chartText: 'VERSE\n[E]Way maker [A/C#]words' },
    ],
  };
  const SET: SetList = {
    songs: [...CHART_SET.songs, { number: 3, title: 'Way Maker', sections: [{ name: 'Verse', time: 132, end: 148, cue: 9 }], end: 148, endCue: 10 }],
    warnings: [],
  };
  type Props = { chordNames?: ChordNames; capos?: Record<string, number>; display?: Display; view?: View; part?: Part | null };
  const page = ({ capos = {}, ...props }: Props = {}, role: Role = 'viewer', snapshot: Snapshot | ProducerSnapshot = { ...CHART_SNAPSHOT, set: SET }) =>
    renderToStaticMarkup(
      createElement(Page, {
        role,
        snapshot,
        connected: true,
        send: () => {},
        part: 'Keys',
        onPart: () => {},
        charts: CHARTS,
        onChordNames: () => {},
        capoOf: (title: string) => capos[title] ?? 0,
        onCapo: () => {},
        ...props,
      }),
    );
  const picker = (markup: string) => /<label class="chord-names-picker">.*?<\/label>/.exec(markup)?.[0];
  const options = (markup: string | undefined) => [...(markup ?? '').matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map(([, value, selected, label]) => ({ value, selected: !!selected, label }));
  // Each song's title, its capo row's selected option and label, and its chords, by the song's section.
  const songs = (markup: string) =>
    [...markup.matchAll(/<section class="chart"[^>]*><h2 class="chart-song">([^<]*)<\/h2>(.*?)<\/section>/g)].map(([, title, inner = '']) => {
      const row = /<div class="chart-capo">(.*?)<\/div>/.exec(inner)?.[1];
      return {
        title,
        capo: row === undefined ? null : options(row).find(({ selected }) => selected)?.label,
        label: /<span class="chart-capo-label">([^<]*)<\/span>/.exec(inner)?.[1] ?? null,
        chords: [...inner.matchAll(/<span class="chart-chord">([^<]*)<\/span>/g)].map(([, chord]) => chord),
      };
    });

  it('puts a Chord names select right after the Display select, with Letters and Nashville numbers, Letters selected until another is picked', () => {
    const markup = page();
    expect(markup).toMatch(/^<main class="chart-page"><label class="part-picker">.*?<\/label><label class="display-picker">.*?<\/label><label class="chord-names-picker">/);
    expect(text(picker(markup) ?? '')).toMatch(/^Chord names /);
    expect(markup).toContain('<select class="chord-names-select">');
    expect(options(picker(markup))).toEqual([
      { value: 'letters', selected: true, label: 'Letters' },
      { value: 'numbers', selected: false, label: 'Nashville numbers' },
    ]);
    expect(options(picker(page({ chordNames: 'numbers' }))).filter(({ selected }) => selected).map(({ label }) => label)).toEqual(['Nashville numbers']);
    expect(options(picker(markup)).map(({ value, label }) => ({ value, label }))).toEqual(CHORD_NAMES);
  });

  it('shows the chords in letters, or in Nashville numbers from the stems key once picked', () => {
    expect(songs(page({ view: 'set' })).map(({ title, chords }) => ({ title, chords }))).toEqual([
      { title: 'Build My Life', chords: ['B', 'E', 'E', 'B/D#', 'B', 'E', 'F#'] },
      { title: 'Goodness of God', chords: [] },
      { title: 'Way Maker', chords: ['E', 'A/C#'] },
    ]);
    expect(songs(page({ view: 'set', chordNames: 'numbers' })).map(({ title, chords }) => ({ title, chords }))).toEqual([
      { title: 'Build My Life', chords: ['1', '4', '4', '1/3', '1', '4', '5'] },
      { title: 'Goodness of God', chords: [] },
      { title: 'Way Maker', chords: ['1', '4/6'] },
    ]);
    expect(page({ chordNames: 'numbers' })).toContain('<span class="chart-chunk"><span class="chart-chord">4</span><span class="chart-lyric">First </span></span>');
  });

  it('gives each song with a chart a Capo select with No capo and 1 to 7, in both views, and none to a song with no chart', () => {
    expect(songs(page({ view: 'set' })).map(({ title, capo, label }) => ({ title, capo, label }))).toEqual([
      { title: 'Build My Life', capo: 'No capo', label: null },
      { title: 'Goodness of God', capo: null, label: null },
      { title: 'Way Maker', capo: 'No capo', label: null },
    ]);
    const markup = page();
    expect(songs(markup).map(({ title, capo }) => ({ title, capo }))).toEqual([{ title: 'Build My Life', capo: 'No capo' }]);
    const row = /<div class="chart-capo">(.*?)<\/div>/.exec(markup)?.[1] ?? '';
    expect(text(row)).toMatch(/^Capo /);
    expect(row).toContain('<label class="capo-picker">');
    expect(row).toContain('<select class="capo-select">');
    expect(options(row).map(({ value, label }) => [value, label])).toEqual([
      ['0', 'No capo'],
      ['1', '1'],
      ['2', '2'],
      ['3', '3'],
      ['4', '4'],
      ['5', '5'],
      ['6', '6'],
      ['7', '7'],
    ]);
    // The row sits under the title and over the blocks.
    expect(markup).toMatch(/<h2 class="chart-song">Build My Life<\/h2><div class="chart-capo">.*?<\/div><ol class="chart-blocks">/);
  });

  it('selects the capo the device keeps for a song, labels that song "Capo n" and moves its chords to the shape key', () => {
    const markup = page({ view: 'set', capos: { 'Build My Life': 2 } });
    expect(songs(markup)).toEqual([
      { title: 'Build My Life', capo: '2', label: 'Capo 2', chords: ['A', 'D', 'D', 'A/C#', 'A', 'D', 'E'] },
      { title: 'Goodness of God', capo: null, label: null, chords: [] },
      { title: 'Way Maker', capo: 'No capo', label: null, chords: ['E', 'A/C#'] },
    ]);
    expect(markup.match(/class="chart-capo-label"/g)).toHaveLength(1);
    expect(songs(page({ view: 'set', capos: { 'Way Maker': 7 } })).map(({ title, label, chords }) => ({ title, label, chords }))).toEqual([
      { title: 'Build My Life', label: null, chords: ['B', 'E', 'E', 'B/D#', 'B', 'E', 'F#'] },
      { title: 'Goodness of God', label: null, chords: [] },
      { title: 'Way Maker', label: 'Capo 7', chords: ['A', 'D/F#'] },
    ]);
  });

  it('keeps the numbers as they are with a capo, and still labels the song', () => {
    expect(songs(page({ view: 'set', chordNames: 'numbers', capos: { 'Build My Life': 3 } }))).toEqual([
      { title: 'Build My Life', capo: '3', label: 'Capo 3', chords: ['1', '4', '4', '1/3', '1', '4', '5'] },
      { title: 'Goodness of God', capo: null, label: null, chords: [] },
      { title: 'Way Maker', capo: 'No capo', label: null, chords: ['1', '4/6'] },
    ]);
  });

  it('shows neither the Chord names select nor a capo row in Lyrics only or Section map', () => {
    for (const display of ['lyrics-only', 'section-map'] as const) {
      const markup = page({ display, view: 'set', chordNames: 'numbers', capos: { 'Build My Life': 3 } });
      expect(markup, display).not.toContain('chord-names');
      expect(markup, display).not.toContain('capo');
    }
  });

  it('is on the chart page only: not on the view-only page with no part, nor on the leader or producer page', () => {
    const noPart = page({ part: null, chordNames: 'numbers', capos: { 'Build My Life': 3 } });
    expect(noPart).not.toContain('chord-names');
    expect(noPart).not.toContain('capo');
    const producer: ProducerSnapshot = { ...CHART_SNAPSHOT, set: SET, connections: [], connectionProblems: [] };
    for (const [role, snapshot] of [
      ['leader', { ...CHART_SNAPSHOT, set: SET }],
      ['producer', producer],
    ] as const) {
      const markup = page({ chordNames: 'numbers', capos: { 'Build My Life': 3 } }, role, snapshot);
      expect(markup, role).not.toContain('chord-names');
      expect(markup, role).not.toContain('capo');
    }
  });

  it('adds no button to the chart page for any chord names or capo', () => {
    for (const { value: chordNames } of CHORD_NAMES) {
      for (const view of ['song', 'set'] as const) expect(page({ chordNames, view, capos: { 'Build My Life': 4 } })).not.toContain('<button');
    }
  });

  it('gives both selects the page font and a tap target height, and scales the Capo n label with the chart text', () => {
    for (const [label, select] of [
      ['chord-names-picker', 'chord-names-select'],
      ['capo-picker', 'capo-select'],
    ]) {
      const path: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main' }, { tag: 'label', classes: [label!] }, { tag: 'select', classes: [select!] }];
      expect(stylesheet.value(path, 'font'), select).toBe('inherit');
      expect(stylesheet.value(path, 'color'), select).toBe('inherit');
      expect(stylesheet.value(path, 'min-height'), select).toBe('3rem');
      expect(stylesheet.value(path.slice(0, 5), 'display'), label).toBe('flex');
    }
    const capoLabel: Element[] = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div' }, { tag: 'main', classes: ['chart-page'] }, { tag: 'section', classes: ['chart'] }, { tag: 'div', classes: ['chart-capo'] }, { tag: 'span', classes: ['chart-capo-label'] }];
    expect(stylesheet.value(capoLabel, 'font-size')).toBe('calc(1.25rem * var(--chart-font-scale, 1))');
  });
});

describe('the Auto-Lock tip', () => {
  const page = (tip: boolean | undefined, part: Part | null, role: Role = 'viewer', snapshot: Snapshot | ProducerSnapshot = CHART_SNAPSHOT) =>
    renderToStaticMarkup(createElement(Page, { role, snapshot, connected: true, send: () => {}, part, onPart: () => {}, tip, onTipShown: () => {} }));
  // As the markup escapes it.
  const TIP = `<p class="auto-lock-tip">${AUTO_LOCK_TIP.replace('&', '&amp;')}</p>`;

  it('tells the band member to set Auto-Lock to Never for the service, and Android its longest Screen timeout', () => {
    expect(AUTO_LOCK_TIP).toBe('Tip: set Auto-Lock to Never for the service (Settings, Display & Brightness, Auto-Lock), so the screen does not lock mid-song. On Android, set Screen timeout to its longest.');
    expect(AUTO_LOCK_TIP).not.toContain('\u2014');
  });

  it('shows on the chart page right after the Font size select', () => {
    const markup = page(true, 'Keys');
    expect(markup).toMatch(/<label class="font-size-picker">.*?<\/label><p class="auto-lock-tip">/);
    expect(markup.replace(TIP, '')).toBe(page(false, 'Keys'));
  });

  it('shows on the view-only page with no part right after the Part select, with a set and before one is known', () => {
    for (const snapshot of [CHART_SNAPSHOT, { ...CHART_SNAPSHOT, set: null }]) {
      const markup = page(true, null, 'viewer', snapshot);
      expect(markup).toMatch(/^<main><label class="part-picker">.*?<\/label><p class="auto-lock-tip">/);
      expect(markup.replace(TIP, '')).toBe(page(false, null, 'viewer', snapshot));
    }
    expect(page(true, 'Keys', 'viewer', { ...CHART_SNAPSHOT, set: null })).toMatch(/^<main><label class="part-picker">.*?<\/label><p class="auto-lock-tip">/);
  });

  it('is not shown once the device has shown it', () => {
    for (const part of [null, 'Keys'] as const) {
      expect(page(false, part)).not.toContain('auto-lock-tip');
      expect(page(undefined, part)).toBe(page(false, part));
    }
  });

  it('is never on the leader page or the producer page', () => {
    const producer: ProducerSnapshot = { ...CHART_SNAPSHOT, connections: [], connectionProblems: [] };
    for (const [role, snapshot] of [
      ['leader', CHART_SNAPSHOT],
      ['producer', producer],
    ] as const) {
      expect(page(true, 'Keys', role, snapshot), role).not.toContain('auto-lock-tip');
      expect(page(true, null, role, snapshot), role).toBe(page(false, null, role, snapshot));
    }
  });

  it('adds no button: it stays for the visit, with nothing to dismiss', () => {
    for (const part of [null, ...PARTS]) expect(page(true, part)).not.toContain('<button');
  });
});
