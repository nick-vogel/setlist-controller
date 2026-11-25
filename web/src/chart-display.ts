import type { ChartLine } from '../../src/shared/chart.ts';
import type { Display } from './device-settings.ts';

// The lines a block shows in a display. Chords over lyrics shows them as typed. Lyrics only shows each
// line as its words with no chord, keeps the notes, and drops a line of chords alone, such as an Intro
// typed `[G] [C] [G] [D]`, with the gap it leaves, so a block of chords alone shows no lines. The
// section map shows no lines at all, only each block's name and bar count.
export function displayLines(lines: readonly ChartLine[], display: Display): ChartLine[] {
  if (display === 'chords-over-lyrics') return [...lines];
  if (display === 'section-map') return [];
  const kept: ChartLine[] = [];
  for (const line of lines) {
    if (line.kind === 'lyrics') {
      const text = line.chunks.map((chunk) => chunk.text).join('');
      if (text.trim() !== '') kept.push({ kind: 'lyrics', chunks: [{ chord: null, text }] });
    } else if (line.kind === 'note') kept.push(line);
    else if (kept.length > 0 && kept.at(-1)?.kind !== 'blank') kept.push(line);
  }
  if (kept.at(-1)?.kind === 'blank') kept.pop();
  return kept;
}
