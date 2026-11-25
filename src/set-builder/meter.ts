// Live stores a time signature as one code: `(numerator - 1) + 99 * log2(denominator)`, so 201 is 4/4,
// 199 is 2/4 and 302 is 6/8. Positions are quarter-note beats in every meter.

export type MeterChange = { time: number; code: number };

// A song's meter: the code it starts on at beat 0, and its changes after beat 0, in time order.
export type Meter = { start: number; changes: MeterChange[] };

function decode(code: number): { numerator: number; denominator: number } {
  return { numerator: (code % 99) + 1, denominator: 2 ** Math.floor(code / 99) };
}

export function barLength(code: number): number {
  const { numerator, denominator } = decode(code);
  return (numerator * 4) / denominator;
}

// The time signature as it is written, `6/8`.
export function timeSignature(code: number): string {
  const { numerator, denominator } = decode(code);
  return `${numerator}/${denominator}`;
}

// The first bar line at or after `point`, walking bar lines from beat 0 through the song's meter. A change
// starts a new bar at its time.
export function roundUpToBar(point: number, meter: Meter): number {
  return barLineAtOrAfter(point, meter).bar;
}

// The first bar line at or after `point`, as roundUpToBar finds it, and how many bars start before it: from beat 0 to
// that bar line, the bars between them, a bar a change cuts short counted as one. One walk gives both.
export function barLineAtOrAfter(point: number, meter: Meter): { bar: number; passed: number } {
  return firstBarLine(meter, (bar) => bar >= point);
}

// The first bar line after `point`, never on it.
export function barAfter(point: number, meter: Meter): number {
  return firstBarLine(meter, (bar) => bar > point).bar;
}

// The first bar line `reached` takes, and how many bar lines the walk passed before it. Two changes at one time
// make one bar line.
function firstBarLine({ start, changes }: Meter, reached: (bar: number) => boolean): { bar: number; passed: number } {
  let length = barLength(start);
  const later = [...changes];
  let bar = 0;
  let passed = 0;
  while (!reached(bar)) {
    const next = later[0];
    const previous = bar;
    if (next && next.time <= bar + length) {
      bar = next.time;
      length = barLength(next.code);
      later.shift();
    } else {
      bar += length;
    }
    if (bar > previous) passed += 1;
  }
  return { bar, passed };
}
