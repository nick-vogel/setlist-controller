import { describe, expect, it } from 'vitest';
import { chartHeading, SECTION_WORDS } from '../src/shared/chart-heading.ts';

// The spec's heading rule: a chart line is a section heading when it holds one section word and an optional number, in
// any letter case.

describe('the chart heading rule', () => {
  it('names the section words of the spec, in its order', () => {
    expect(SECTION_WORDS).toEqual(['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Tag', 'Interlude', 'Instrumental', 'Turnaround', 'Vamp', 'Ending']);
  });

  it.each([
    ['Intro', { word: 'Intro' }],
    ['VERSE', { word: 'Verse' }],
    ['pre-chorus', { word: 'Pre-Chorus' }],
    ['PRE-CHORUS', { word: 'Pre-Chorus' }],
    ['Chorus', { word: 'Chorus' }],
    ['bRiDgE', { word: 'Bridge' }],
    ['TAG', { word: 'Tag' }],
    ['Interlude', { word: 'Interlude' }],
    ['INSTRUMENTAL', { word: 'Instrumental' }],
    ['turnaround', { word: 'Turnaround' }],
    ['Vamp', { word: 'Vamp' }],
    ['ENDING', { word: 'Ending' }],
    ['VERSE 1', { word: 'Verse', number: 1 }],
    ['Chorus 2', { word: 'Chorus', number: 2 }],
    ['  Bridge 3  ', { word: 'Bridge', number: 3 }],
    ['Verse  12', { word: 'Verse', number: 12 }],
  ])('reads %j as a heading', (line, heading) => {
    expect(chartHeading(line)).toEqual(heading);
  });

  it.each(['Pre Chorus', 'Outro', 'Breakdown', 'Count Off', 'Chorus 2a', 'Verse 1 2', ' ', '', 'The chorus of the saints', '[G]Chorus', 'Chorus:', 'Verse1', '1 Verse'])(
    'reads %j as no heading',
    (line) => {
      expect(chartHeading(line)).toBeUndefined();
    },
  );
});
