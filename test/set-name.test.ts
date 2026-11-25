import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setName } from '../src/set-builder/build-set.ts';

describe.each(['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'])("the set's name in %s", (zone) => {
  const before = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
  });
  afterAll(() => {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  });

  it.each([
    { date: '2026-10-18', expected: '2026-10-18 Sunday' },
    { date: '2026-11-02', expected: '2026-11-02 Monday' },
    { date: '2026-12-24', expected: '2026-12-24 Thursday' },
    { date: '2028-02-29', expected: '2028-02-29 Tuesday' },
  ])('is $expected for $date', ({ date, expected }) => {
    expect(setName(date)).toBe(expected);
  });

  // The command rejects such a date with a usage error first, so only a caller's mistake reaches this.
  it.each(['2026-02-30', '2026-13-01', '18 Oct 2026'])('is no name at all for %s, which is not a real date written YYYY-MM-DD', (date) => {
    expect(() => setName(date)).toThrow(`${date} is not a real date written YYYY-MM-DD.`);
  });
});
