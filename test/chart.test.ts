import { describe, expect, it } from 'vitest';
import { parseChart, type ChartLine, type ChartSection } from '../src/shared/chart.ts';

// The chart module: from a song's chart text, as Planning Center's Lyrics & Chords editor holds it, to
// its sections with their lines and inline chords. Every chart text here is made up.

const lyrics = (...chunks: [string | null, string][]): ChartLine => ({ kind: 'lyrics', chunks: chunks.map(([chord, text]) => ({ chord, text })) });
const words = (text: string): ChartLine => lyrics([null, text]);
const note = (text: string): ChartLine => ({ kind: 'note', text });
const BLANK: ChartLine = { kind: 'blank' };
const section = (name: string, ...lines: ChartLine[]): ChartSection => ({ name, lines });

describe('the chart module', () => {
  it.each([
    {
      what: 'headings in mixed and upper case',
      text: 'Chorus\nmade up words\nCHORUS\nmore made up words\npre-chorus\nrising words',
      sections: [section('Chorus', words('made up words')), section('CHORUS', words('more made up words')), section('pre-chorus', words('rising words'))],
    },
    {
      what: 'numbered headings, named as typed',
      text: 'VERSE 1\nfirst lines\nVerse 2\nsecond lines',
      sections: [section('VERSE 1', words('first lines')), section('Verse 2', words('second lines'))],
    },
    {
      what: 'a heading with its spaces around it trimmed',
      text: '  Bridge  \nover the bridge',
      sections: [section('Bridge', words('over the bridge'))],
    },
    {
      what: 'a lyric line holding a section word, which stays lyrics',
      text: 'VERSE\nsing the chorus again\nchorus of the made up kind',
      sections: [section('VERSE', words('sing the chorus again'), words('chorus of the made up kind'))],
    },
    {
      what: 'chords in square brackets over the syllables they fall on, slash chords and a chord mid-word',
      text: 'VERSE\n[G]Made up [D/F#]words a-[Em]bove, wan[C]dering',
      sections: [section('VERSE', lyrics(['G', 'Made up '], ['D/F#', 'words a-'], ['Em', 'bove, wan'], ['C', 'dering']))],
    },
    {
      what: 'text before the first chord, which has no chord',
      text: 'VERSE\nOh the [G]made up words',
      sections: [section('VERSE', lyrics([null, 'Oh the '], ['G', 'made up words']))],
    },
    {
      what: 'a line of bracket chords alone',
      text: 'INTRO\n[G] [C] [D]',
      sections: [section('INTRO', lyrics(['G', ' '], ['C', ' '], ['D', '']))],
    },
    {
      what: 'a bracket with no close, which is text',
      text: 'VERSE\n[G]made [up words',
      sections: [section('VERSE', lyrics(['G', 'made [up words']))],
    },
    {
      what: 'a line of chords with no brackets, shown as text',
      text: 'INTRO\nG  C  D  G',
      sections: [section('INTRO', words('G  C  D  G'))],
    },
    {
      what: '{ note } and {{ note }} as note lines',
      text: 'CHORUS\n{ Keys only }\nmade up words\n{{Build to the end}}',
      sections: [section('CHORUS', note('Keys only'), words('made up words'), note('Build to the end'))],
    },
    {
      what: 'braces inside a lyric line, which stay text',
      text: 'VERSE\nwords { and } words',
      sections: [section('VERSE', words('words { and } words'))],
    },
    {
      what: 'the column and page break codes, dropped',
      text: 'VERSE\nfirst half\nCOLUMN_BREAK\nsecond half\nPAGE_BREAK\n{{ COLUMN_BREAK }}\n{{PAGE_BREAK}}\nlast line',
      sections: [section('VERSE', words('first half'), words('second half'), words('last line'))],
    },
    {
      what: 'the formatting tags, dropped with their text kept',
      text: 'VERSE\n<b>bold</b> <strong>strong</strong> <i>italic</i> <em>em</em> <u>under</u> <t>tab</t>\n[G]<b>loud</b> words',
      sections: [section('VERSE', words('bold strong italic em under tab'), lyrics(['G', 'loud words']))],
    },
    {
      what: 'a heading with no text, before another heading and with only blank lines after it',
      text: 'INTRO\nVERSE\nmade up words\nTAG\n\n\n',
      sections: [section('INTRO'), section('VERSE', words('made up words')), section('TAG')],
    },
    {
      what: 'blank lines, one between stanzas and none at the edges',
      text: 'VERSE\n\nfirst stanza\n\n\n\nsecond stanza\n\nCHORUS\nchorus words',
      sections: [section('VERSE', words('first stanza'), BLANK, words('second stanza')), section('CHORUS', words('chorus words'))],
    },
    {
      what: 'Windows line endings',
      text: 'VERSE\r\nmade up words\r\n',
      sections: [section('VERSE', words('made up words'))],
    },
    { what: 'no text at all', text: '', sections: [] },
  ])('reads $what', ({ text, sections }) => {
    expect(parseChart(text).sections).toEqual(sections);
  });

  it('drops the TRANSPOSE KEY and REDEFINE KEY lines, in any letter case, and lists them', () => {
    const chart = parseChart('VERSE\nTRANSPOSE KEY +2\nmade up words\nredefine key -1\nCHORUS\nTranspose Key G');
    expect(chart.sections).toEqual([section('VERSE', words('made up words')), section('CHORUS')]);
    expect(chart.dropped).toEqual(['TRANSPOSE KEY +2', 'redefine key -1', 'Transpose Key G']);
  });

  it('drops the text before the first heading, belonging to no section, and lists each line', () => {
    const chart = parseChart('Made Up Song\n\nby nobody\nVERSE\nmade up words');
    expect(chart.sections).toEqual([section('VERSE', words('made up words'))]);
    expect(chart.dropped).toEqual(['Made Up Song', 'by nobody']);
  });

  it('lists nothing for a chart it reads whole, and never a break code or a blank line', () => {
    expect(parseChart('\nVERSE\nmade up words\nCOLUMN_BREAK\n\n').dropped).toEqual([]);
  });
});
