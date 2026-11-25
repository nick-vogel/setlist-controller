// Lines of the lateness log as the server writes them, for the summary's tests and the command's.

// A measured line, as the server writes it.
export const measured = (time: string, target: string, cause: string, lateMs: number, actedMs: number | null = null) =>
  JSON.stringify({ time, target, song: 1, title: 'Way Maker', section: 'Verse', cause, lateMs, actedMs });
// An unmeasured line, as the server writes it.
export const unmeasured = (time: string, target: string, reason: string, cause = reason === 'fire-again' ? 'fire-again' : 'played-into') =>
  JSON.stringify({ time, target, song: 1, title: 'Way Maker', section: 'Verse', cause, lateMs: null, actedMs: null, unmeasured: reason });
export const text = (...lines: string[]) => lines.map((line) => `${line}\n`).join('');

// Two Sundays in Chicago, each line at midday UTC, 07:00 there, for the summary's module test and its
// command test. The second Sunday's lines come first, so the days are sorted, not taken as read.
const FIRST = '2026-10-18T12:00:00.000Z';
const SECOND = '2026-10-25T12:00:00.000Z';
export const TWO_SUNDAYS = text(
  measured(SECOND, 'lights', 'loop', 30),
  unmeasured(SECOND, 'propresenter', 'not-played-across'),
  ...[10, 20, 40, 50, 60, 70, 80, 90, 100].map((late) => measured(SECOND, 'lights', 'loop', late)),
  measured(FIRST, 'propresenter', 'played-into', 10, 100),
  measured(FIRST, 'lights', 'jump', 100),
  measured(FIRST, 'propresenter', 'played-into', 40),
  unmeasured(FIRST, 'propresenter', 'fire-again'),
  measured(FIRST, 'lights', 'played-into', 5),
  measured(FIRST, 'propresenter', 'loop', 50),
  measured(FIRST, 'lights', 'jump', 3),
  unmeasured(FIRST, 'lights', 'not-played-across'),
  measured(FIRST, 'propresenter', 'played-into', 20, 300),
  measured(FIRST, 'lights', 'played-into', 15),
  measured(FIRST, 'propresenter', 'played-into', 30, 200),
  measured(FIRST, 'lights', 'jump', 7),
  unmeasured(FIRST, 'lights', 'not-played-across', 'loop'),
);

