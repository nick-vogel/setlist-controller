import { describe, expect, it } from 'vitest';
import { readLines, summarize } from '../src/lateness/summary.ts';
import { measured, text, TWO_SUNDAYS, unmeasured } from './lateness-fixture.ts';

// The summary of the lateness log, read in-process from the log's text, with the time zone named so
// the day a line falls on never depends on the machine running the test.

describe('reading the log', () => {
  it("gives the lines of each file in the order given, the .1 file's first, each once", () => {
    const older = text(measured('2026-10-25T17:00:00.000Z', 'lights', 'played-into', 10), measured('2026-10-25T17:00:01.000Z', 'lights', 'loop', 20));
    const newer = text(unmeasured('2026-10-25T17:00:02.000Z', 'propresenter', 'fire-again'));

    const { lines, malformed } = readLines([older, newer]);

    expect(lines.map((line) => [line.target, line.lateMs])).toEqual([
      ['lights', 10],
      ['lights', 20],
      ['propresenter', null],
    ]);
    expect(malformed).toBe(0);
  });

  it('skips and counts a line that is not JSON, or JSON without the shape of a line', () => {
    const good = measured('2026-10-25T17:00:00.000Z', 'lights', 'played-into', 10);
    const log = text(good, '{"time": "2026-10-25T17:00:01.0', good, JSON.stringify({ target: 'lights', lateMs: 'late' }), JSON.stringify({ ...JSON.parse(good), unmeasured: 'fire-again' }));

    const { lines, malformed } = readLines([log]);

    expect(lines).toHaveLength(2);
    expect(malformed).toBe(3);
  });
});

describe('the summary', () => {
  const days = summarize(readLines([TWO_SUNDAYS]).lines, { timeZone: 'America/Chicago' });
  const target = (day: number, name: string) => days[day]!.targets.find((group) => group.target === name)!;
  const row = (day: number, name: string, cause: string) => target(day, name).rows.find((candidate) => candidate.cause === cause);

  it('has one block per local day, oldest first, and the targets in the order the day first names them', () => {
    expect(days.map(({ date, weekday }) => `${date} ${weekday}`)).toEqual(['2026-10-18 Sunday', '2026-10-25 Sunday']);
    expect(days.map((day) => day.targets.map((group) => group.target))).toEqual([
      ['propresenter', 'lights'],
      ['lights', 'propresenter'],
    ]);
  });

  it('has a row per cause, in a fixed order, then all causes, each with the count and the lateness by nearest rank', () => {
    expect(target(0, 'propresenter').rows.map((candidate) => candidate.cause)).toEqual(['played-into', 'loop', 'all']);
    expect(target(0, 'lights').rows.map((candidate) => candidate.cause)).toEqual(['played-into', 'jump', 'all']);
    // 10, 20, 30, 40: the median is the second, 20, not the mean of the middle two, 25.
    expect(row(0, 'propresenter', 'played-into')).toMatchObject({ count: 4, late: { median: 20, p90: 40, max: 40 } });
    expect(row(0, 'propresenter', 'loop')).toMatchObject({ count: 1, late: { median: 50, p90: 50, max: 50 } });
    expect(row(0, 'propresenter', 'all')).toMatchObject({ count: 5, late: { median: 30, p90: 50, max: 50 } });
    // 5, 15: the median is the first, 5, not 10.
    expect(row(0, 'lights', 'played-into')).toMatchObject({ count: 2, late: { median: 5, p90: 15, max: 15 } });
    expect(row(0, 'lights', 'jump')).toMatchObject({ count: 3, late: { median: 7, p90: 100, max: 100 } });
    expect(row(0, 'lights', 'all')).toMatchObject({ count: 5, late: { median: 7, p90: 100, max: 100 } });
    // 10 to 100 by tens: the median is the fifth, 50, not 55, and the 90th percentile the ninth, 90.
    expect(row(1, 'lights', 'loop')).toMatchObject({ count: 10, late: { median: 50, p90: 90, max: 100 } });
  });

  it('gives the acted-on lateness only for a row with any, of only the lines that have it, never counting null as zero', () => {
    // 100, 300 and 200, out of four lines.
    expect(row(0, 'propresenter', 'played-into')!.acted).toEqual({ count: 3, median: 200, p90: 300, max: 300 });
    expect(row(0, 'propresenter', 'loop')!.acted).toBeNull();
    expect(row(0, 'propresenter', 'all')!.acted).toEqual({ count: 3, median: 200, p90: 300, max: 300 });
    for (const cause of ['played-into', 'jump', 'all']) expect(row(0, 'lights', cause)!.acted, cause).toBeNull();
  });

  it("counts each target's unmeasured cues for the day by reason, in no row, and keeps a target with only those", () => {
    expect(target(0, 'propresenter').unmeasured).toEqual({ 'fire-again': 1, 'not-played-across': 0 });
    expect(target(0, 'lights').unmeasured).toEqual({ 'fire-again': 0, 'not-played-across': 2 });
    expect(target(1, 'lights').unmeasured).toEqual({ 'fire-again': 0, 'not-played-across': 0 });
    expect(target(1, 'propresenter')).toEqual({ target: 'propresenter', rows: [], unmeasured: { 'fire-again': 0, 'not-played-across': 1 } });
  });

  it("has a row for a count-in's landing cue, after Play from start's and before all causes, and skips none of its lines", () => {
    const at = '2026-10-25T12:00:00.000Z';
    const { lines, malformed } = readLines([
      text(measured(at, 'lights', 'count-in', 40), measured(at, 'lights', 'play-from-start', 10), measured(at, 'lights', 'count-in', 20), measured(at, 'lights', 'jump', 5)),
    ]);

    expect(malformed).toBe(0);
    const [day] = summarize(lines, { timeZone: 'America/Chicago' });
    const rows = day!.targets[0]!.rows;
    expect(rows.map((candidate) => candidate.cause)).toEqual(['jump', 'play-from-start', 'count-in', 'all']);
    // 20, 40: the median is the first, 20.
    expect(rows.find((candidate) => candidate.cause === 'count-in')).toMatchObject({ count: 2, late: { median: 20, p90: 40, max: 40 }, acted: null });
    expect(rows.find((candidate) => candidate.cause === 'all')).toMatchObject({ count: 4 });
  });

  it('cuts the days in the time zone it is given', () => {
    // 04:30 UTC on the 26th is 23:30 on the 25th in Chicago, and 05:30 UTC is 00:30 on the 26th.
    const { lines } = readLines([text(measured('2026-10-26T04:30:00.000Z', 'lights', 'loop', 1), measured('2026-10-26T05:30:00.000Z', 'lights', 'loop', 2))]);

    expect(summarize(lines, { timeZone: 'America/Chicago' }).map((day) => day.date)).toEqual(['2026-10-25', '2026-10-26']);
    expect(summarize(lines, { timeZone: 'UTC' }).map((day) => day.date)).toEqual(['2026-10-26']);
  });
});
