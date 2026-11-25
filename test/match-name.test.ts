import { describe, expect, it } from 'vitest';
import { nameKey, namesMatch } from '../src/shared/match-name.ts';

describe('the name match rule every target uses', () => {
  it('ignores letter case and the spaces around a name', () => {
    expect(namesMatch('Chorus', ' chorus ')).toBe(true);
  });

  it('counts a run of spaces as one space', () => {
    expect(namesMatch('Verse  1', 'verse 1')).toBe(true);
  });

  it('counts a tab or a non-breaking space as a space', () => {
    expect(namesMatch('Verse\t1', 'Verse 1')).toBe(true);
    expect(namesMatch('Verse 1', 'Verse 1')).toBe(true);
  });

  it('matches nothing fuzzier', () => {
    expect(namesMatch('Verse 1', 'Verse 2')).toBe(false);
    expect(namesMatch('Chorus 2', 'Chorus')).toBe(false);
    expect(namesMatch('Verse1', 'Verse 1')).toBe(false);
  });

  it('gives matching names the same key, so a target can look its own names up by it', () => {
    expect(nameKey(' Verse  1 ')).toBe(nameKey('verse 1'));
    expect(nameKey('Verse 1')).not.toBe(nameKey('Verse 2'));
  });
});
