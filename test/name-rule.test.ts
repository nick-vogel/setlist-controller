import { describe, expect, it } from 'vitest';
import { nameKey, sameName } from '../src/set-builder/name-rule.ts';

// The name rule a plan's names are matched by: trimmed, each run of white space one space, letter case ignored, and
// nothing fuzzier.
describe('the name rule', () => {
  it('reads a name trimmed, with each run of white space as one space, in any letter case', () => {
    expect(nameKey('  Goodness   Of God ')).toBe('goodness of god');
    expect(sameName('  Goodness   Of God ', 'goodness of god')).toBe(true);
    expect(sameName('Goodness\tof\nGod', 'GOODNESS OF GOD')).toBe(true);
  });

  it('never matches a part of a name', () => {
    expect(sameName('Grace', 'This Is Amazing Grace')).toBe(false);
    expect(sameName('Service', 'Sunday Service')).toBe(false);
  });
});
