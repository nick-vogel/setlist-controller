import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseAls, serializeAls } from '../src/set-builder/als.ts';
import { FIXTURE_LIBRARY, FIXTURE_SONGS, FIXTURE_TEMPLATE } from './set-builder-harness.ts';

// The one test that reaches past buildSet: no build writes an unchanged set, and the build relies on this
// layer leaving every part of the template it does not touch exactly as Live wrote it.
describe('reading and writing a Live set', () => {
  const sets = [...FIXTURE_SONGS.map((song) => `${FIXTURE_LIBRARY}/${song}/MultiTrack.als`), FIXTURE_TEMPLATE];

  it.each(sets)('writes an unchanged Live 12 set back byte for byte: %s', async (path) => {
    const xml = gunzipSync(await readFile(path)).toString('utf8');

    expect(serializeAls(parseAls(xml))).toBe(xml);
  });

  it('keeps an ampersand, < and > in an attribute escaped the way Live writes them', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Ableton MajorVersion="5" MinorVersion="12.0_12402">',
      '\t<FileRef>',
      '\t\t<Path Value="/Music/Great Are You Lord-All Sons &amp; Daughters Live-D-72.00bpm/Bass.wav" />',
      '\t\t<Name Value="Trans      - &lt;0&gt; +" />',
      '\t</FileRef>',
      '</Ableton>',
      '',
    ].join('\n');

    expect(serializeAls(parseAls(xml))).toBe(xml);
  });

  // Lines as Live 12 writes them: a value is double-quoted, unless its first quote character is a double
  // quote; then it is single-quoted. Only the delimiting quote is escaped, as &quot; or &apos;.
  it('quotes an attribute holding quote characters the way Live does', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Ableton MajorVersion="5" MinorVersion="12.0_12402">',
      `\t<ViewData Value='{"push-selected-note-mode": "play", "push-instrument-selected-notes": [36], "push-note-repeat-rate": 0.5, "push-note-repeat-enabled": false}' />`,
      `\t<UserName Value="Break Ahmir's Voodoo 119 bpm" />`,
      `\t<Annotation Value="Vinyl Distortion's &quot;Crackle&quot; generator creates resonant soundscapes." />`,
      `\t<Annotation Value='This "rainstorm" generator starts with the Vinyl Distortion&apos;s "crackle" sound.' />`,
      '</Ableton>',
      '',
    ].join('\n');

    expect(serializeAls(parseAls(xml))).toBe(xml);
  });

  // The line feed and tab lines are as Live 12 writes them, in two-digit hex references. No Live set seen
  // holds a carriage return in an attribute; it is written in the same form.
  it('keeps a tab, line feed or carriage return in an attribute as the character reference Live writes, so it is not read back as a space', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Ableton MajorVersion="5" MinorVersion="12.0_12402">',
      '\t<Annotation Value="Created by: Michele Darling &amp; Huston Singletary&#x0A;" />',
      '\t<Annotation Value="This preset uses MPE and Mod Wheel to modulate the sounds of each zone:&#x0A;&#x09;▪&#x09;Slide is routed to filter frequency and Shaper amount." />',
      '\t<Annotation Value="Verse&#x0D;" />',
      '</Ableton>',
      '',
    ].join('\n');

    const written = serializeAls(parseAls(xml));

    expect(written).toBe(xml);
    expect(parseAls(written).root.children.filter((node) => 'name' in node).map((node) => node.attributes.Value)).toEqual([
      'Created by: Michele Darling & Huston Singletary\n',
      'This preset uses MPE and Mod Wheel to modulate the sounds of each zone:\n\t▪\tSlide is routed to filter frequency and Shaper amount.',
      'Verse\r',
    ]);
  });

  it('refuses XML that Live 12 never writes, so nothing is dropped without notice', () => {
    expect(() => parseAls('<?xml version="1.0" encoding="UTF-8"?>\n<Ableton><!-- note --></Ableton>\n')).toThrow(/comment/);
  });
});
