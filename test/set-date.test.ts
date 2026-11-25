import { describe, expect, it } from 'vitest';
import { defaultSetDate } from '../src/set-builder/set-date.ts';

// Every "today" is built from local date parts, so the tests hold in any time zone: the set date is the operator's
// own calendar day, not a UTC one.
describe('the default set date', () => {
  it.each([
    { today: 'a Sunday just after midnight', date: new Date(2026, 9, 18, 0, 0), expected: '2026-10-18' },
    { today: 'a Sunday just before midnight', date: new Date(2026, 9, 18, 23, 59), expected: '2026-10-18' },
  ])('is the same day on $today', ({ date, expected }) => {
    expect(defaultSetDate(date)).toBe(expected);
  });

  it.each([
    { today: 'a Friday', date: new Date(2026, 9, 16, 9, 30), expected: '2026-10-18' },
    { today: 'a Monday', date: new Date(2026, 9, 19, 8, 0), expected: '2026-10-25' },
    // The US daylight-saving change falls in the night before 2026-11-01.
    { today: 'the Saturday before the clocks go back, late at night', date: new Date(2026, 9, 31, 23, 30), expected: '2026-11-01' },
    { today: 'a Monday whose coming Sunday is in the next month and year', date: new Date(2026, 11, 28, 12, 0), expected: '2027-01-03' },
  ])('is the coming Sunday on $today', ({ date, expected }) => {
    expect(defaultSetDate(date)).toBe(expected);
  });
});
