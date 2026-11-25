import { describe, expect, it } from 'vitest';
import { itemFor, itemsNamed, matchSection, occurrenceAt } from '../src/shared/occurrence.ts';

const named = (...names: string[]) => names.map((name, at) => ({ name, at }));

describe('the occurrence matcher every target matches a section to its item by', () => {
  const items = named('Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Verse');

  it('matches the first, second and third section of a name to the first, second and third item of that name', () => {
    const sections = named('Verse', 'Verse', 'Verse');
    expect(matchSection(sections, 0, items)?.at).toBe(0);
    expect(matchSection(sections, 1, items)?.at).toBe(2);
    expect(matchSection(sections, 2, items)?.at).toBe(5);
  });

  it('counts each name on its own, so sections of other names between them do not move the count', () => {
    const sections = named('Verse', 'Chorus', 'Verse', 'Chorus');
    expect(sections.map((_, index) => matchSection(sections, index, items)?.at)).toEqual([0, 1, 2, 3]);
  });

  it('matches a section past the last item of its name to that last item', () => {
    const sections = named('Chorus', 'Chorus', 'Chorus', 'Bridge', 'Bridge');
    expect(matchSection(sections, 2, items)?.at).toBe(3);
    expect(matchSection(sections, 4, items)?.at).toBe(4);
  });

  it('matches nothing for a name with no item', () => {
    const sections = named('Intro', 'Verse');
    expect(matchSection(sections, 0, items)).toBeUndefined();
    expect(itemFor(items, 'Intro')).toBeUndefined();
    expect(itemFor([], 'Verse', 2)).toBeUndefined();
  });

  it('matches nothing for an index outside the sections', () => {
    expect(matchSection(named('Verse'), 1, items)).toBeUndefined();
    expect(matchSection(named('Verse'), -1, items)).toBeUndefined();
  });

  it('compares names by the name rule: spaces around a name trimmed, a run of whitespace as one space, letter case ignored', () => {
    const sections = named(' verse ', 'VERSE', 'Verse\t2', 'Pre  Chorus');
    const others = named('Verse', 'verse', 'Verse 2', 'pre chorus');
    expect(sections.map((_, index) => matchSection(sections, index, others)?.at)).toEqual([0, 1, 2, 3]);
  });

  it('never lets "Chorus 2" stand in for "Chorus"', () => {
    expect(matchSection(named('Chorus 2'), 0, named('Chorus'))).toBeUndefined();
    expect(matchSection(named('Chorus'), 0, named('Chorus 2'))).toBeUndefined();
  });

  it('lists the items of a name in their order', () => {
    expect(itemsNamed(items, ' verse').map(({ at }) => at)).toEqual([0, 2, 5]);
    expect(itemsNamed(items, 'Outro')).toEqual([]);
  });

  it('gives the first item of a name when no occurrence is asked for', () => {
    expect(itemFor(items, 'Chorus')?.at).toBe(1);
  });

  it('tells which section of a name the section at an index is, counting the sections before it', () => {
    const sections = named('Verse', 'Chorus', 'verse', 'Chorus', 'Verse');
    expect(occurrenceAt(sections, 0, 'Verse')).toBe(1);
    expect(occurrenceAt(sections, 2, 'Verse')).toBe(2);
    expect(occurrenceAt(sections, 4, 'Verse')).toBe(3);
    expect(occurrenceAt(sections, 3, 'Chorus')).toBe(2);
  });

  it('counts a name absent from the sections so far as its first section', () => {
    expect(occurrenceAt(named('Verse', 'Chorus'), 0, 'Chorus')).toBe(1);
    expect(occurrenceAt(named('Verse'), 0, 'Bridge')).toBe(1);
  });

  it('counts every section for an index past the end', () => {
    expect(occurrenceAt(named('Verse', 'Verse'), 9, 'Verse')).toBe(2);
  });
});
