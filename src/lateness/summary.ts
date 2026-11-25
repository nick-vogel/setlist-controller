import type { CueCause } from '../server/cues.ts';
import type { LatenessLine, MeasuredLine, UnmeasuredReason } from '../server/lateness-log.ts';
import { nearestRank } from '../server/lateness.ts';

// The summary of the lateness log that `pnpm lateness` prints, for deciding the lead time after a
// rehearsal or two: the log's lines read back, then one block per day, per target and per cause.
// Pure: it takes the files' text and gives plain data, and the command reads the files and prints.

// The rows of a target's group come in this order, whichever cause the day had first.
const CAUSES: CueCause[] = ['played-into', 'loop', 'jump', 'play-from-start', 'count-in', 'fire-again'];
const REASONS: UnmeasuredReason[] = ['fire-again', 'not-played-across'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWholeOrNull = (value: unknown) => value === null || Number.isInteger(value);

// Whether a parsed line has the shape the server writes: every field of its type, and a reason only
// on a line with no lateness, which every such line has.
function isLine(value: unknown): value is LatenessLine {
  if (!isRecord(value)) return false;
  const { time, target, song, title, section, cause, lateMs, actedMs, unmeasured } = value;
  const common =
    typeof time === 'string' &&
    !Number.isNaN(Date.parse(time)) &&
    typeof target === 'string' &&
    typeof song === 'number' &&
    (title === null || typeof title === 'string') &&
    typeof section === 'string' &&
    typeof cause === 'string' &&
    CAUSES.includes(cause as CueCause) &&
    isWholeOrNull(actedMs);
  if (!common) return false;
  if (unmeasured === undefined) return Number.isInteger(lateMs);
  return typeof unmeasured === 'string' && REASONS.includes(unmeasured as UnmeasuredReason) && lateMs === null && actedMs === null;
}

// The lines of the log's files, each file's text given in the order it was written, the `.1` file's
// first. A line that is not JSON, or is JSON without a line's shape, is skipped and counted.
export function readLines(texts: string[]): { lines: LatenessLine[]; malformed: number } {
  const lines: LatenessLine[] = [];
  let malformed = 0;
  for (const text of texts) {
    for (const raw of text.split('\n')) {
      if (raw.trim() === '') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        malformed += 1;
        continue;
      }
      if (isLine(parsed)) lines.push(parsed);
      else malformed += 1;
    }
  }
  return { lines, malformed };
}

// The median, the 90th percentile and the maximum, in whole milliseconds as logged. Every percentile
// is by nearest rank: the value at rank ceil(p / 100 * n), counted from 1, of the sorted values.
export type Spread = { median: number; p90: number; max: number };

export type Row = {
  // One cause, or every cause together.
  cause: CueCause | 'all';
  // The measured cues.
  count: number;
  late: Spread;
  // The lines that carry an acted-on lateness, and its spread, or null when none does. A line without
  // one counts for nothing here.
  acted: (Spread & { count: number }) | null;
};

export type TargetSummary = {
  target: string;
  // One row per cause the target's measured cues had that day, then all causes, or none when it had
  // no measured cue.
  rows: Row[];
  // The cues handed to the target that day with no lateness, by reason.
  unmeasured: Record<UnmeasuredReason, number>;
};

export type DaySummary = {
  // The day, YYYY-MM-DD, and its weekday, in the time zone the summary was given.
  date: string;
  weekday: string;
  // In the order the day's lines first name them.
  targets: TargetSummary[];
};

function spread(values: number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: nearestRank(sorted, 50), p90: nearestRank(sorted, 90), max: sorted.at(-1)! };
}

function row(cause: Row['cause'], lines: MeasuredLine[]): Row {
  const acted = lines.flatMap((line) => (line.actedMs === null ? [] : [line.actedMs]));
  return { cause, count: lines.length, late: spread(lines.map((line) => line.lateMs)), acted: acted.length === 0 ? null : { count: acted.length, ...spread(acted) } };
}

// The day a moment falls on in the time zone, or the process's own when none is given.
function dayOf(time: string, timeZone: string | undefined): { date: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).formatToParts(new Date(time));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, weekday: part('weekday') };
}

// The log's lines as one block per day, oldest first, each line's day its time in the time zone
// given, or the process's own when none is: one day is one rehearsal.
export function summarize(lines: LatenessLine[], { timeZone }: { timeZone?: string }): DaySummary[] {
  const days = new Map<string, { weekday: string; targets: Map<string, LatenessLine[]> }>();
  for (const line of lines) {
    const { date, weekday } = dayOf(line.time, timeZone);
    const day = days.get(date) ?? days.set(date, { weekday, targets: new Map() }).get(date)!;
    const target = day.targets.get(line.target) ?? day.targets.set(line.target, []).get(line.target)!;
    target.push(line);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, { weekday, targets }]) => ({
      date,
      weekday,
      targets: [...targets.entries()].map(([target, own]) => {
        const measured = own.filter((line): line is MeasuredLine => line.lateMs !== null);
        const unmeasured = Object.fromEntries(REASONS.map((reason) => [reason, own.filter((line) => 'unmeasured' in line && line.unmeasured === reason).length])) as Record<UnmeasuredReason, number>;
        const rows = CAUSES.flatMap((cause) => {
          const caused = measured.filter((line) => line.cause === cause);
          return caused.length === 0 ? [] : [row(cause, caused)];
        });
        return { target, rows: measured.length === 0 ? [] : [...rows, row('all', measured)], unmeasured };
      }),
    }));
}

const spreadText = ({ median, p90, max }: Spread) => `median ${median} ms, 90th percentile ${p90} ms, max ${max} ms`;

// The summary as the command prints it: a line on the method, then each day, its targets and their
// rows, every number in whole milliseconds, and, when any line was skipped, the count last.
export function formatSummary(days: DaySummary[], malformed: number): string {
  const out = ['Lateness by day, target and cause. Percentiles by nearest rank. Acted on only where a target reported it.'];
  for (const day of days) {
    out.push('', `${day.date} ${day.weekday}`);
    for (const { target, rows, unmeasured } of day.targets) {
      const reasons = Object.entries(unmeasured).map(([reason, count]) => `${reason} ${count}`);
      out.push(`  ${target} (unmeasured: ${reasons.join(', ')})`);
      if (rows.length === 0) out.push('    no measured cues');
      for (const { cause, count, late, acted } of rows) {
        const label = cause === 'all' ? 'all causes' : cause;
        const actedText = acted ? `; acted on ${acted.count}: ${spreadText(acted)}` : '';
        out.push(`    ${label}: count ${count}, late: ${spreadText(late)}${actedText}`);
      }
    }
  }
  if (days.length === 0) out.push('', 'No cues in the log.');
  if (malformed > 0) out.push('', `Skipped ${malformed} malformed ${malformed === 1 ? 'line' : 'lines'}.`);
  return `${out.join('\n')}\n`;
}
