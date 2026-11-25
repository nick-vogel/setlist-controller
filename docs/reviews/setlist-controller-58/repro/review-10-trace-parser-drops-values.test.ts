import { expect, it } from 'vitest';
import { parseTraces } from './build-set-traces.ts';

// Repro for docs/reviews/setlist-controller-58/pre-pr-review-10.md, finding 5. Copy into test/ to run. It fails at the
// review's HEAD: text on a `Nick says:` or `Pins:` line, and a listing field given twice, parse with no error, so a
// turn or a pin is lost and a listing's exit code is overwritten.

const TRACE = [
  '# Traces',
  '',
  '## a-trace',
  '',
  'Said on: Saturday 2026-10-17',
  'Library: the worked examples\' seven folders',
  'Source: a test',
  'Nick says:',
  '- Grace, Great Are You Lord, Fall Like Rain.',
  '- yes',
  '',
  'Listing:',
  '',
  '```',
  'pnpm build-set --list',
  '```',
  '',
  'Set folders: none',
  'Exit: 0',
  'Last line: none',
  '',
  'Command: `pnpm build-set grace lord rain`',
  'Date line: none',
  'Question: Run it?',
  '',
  'Pins:',
  '',
  '```',
  'Show it to him.',
  '```',
  '',
].join('\n');

it('parses the trace as written', () => {
  expect(parseTraces(TRACE)[0]?.nickSays).toEqual(['Grace, Great Are You Lord, Fall Like Rain.', 'yes']);
});

it('stops on a turn written on the Nick says line', () => {
  expect(() => parseTraces(TRACE.replace('Nick says:\n- Grace', 'Nick says: Grace'))).toThrow('a-trace');
});

it('stops on a pin written on the Pins line', () => {
  expect(() => parseTraces(TRACE.replace('Pins:', 'Pins: Run it only on his yes.'))).toThrow('a-trace');
});

it('stops on a listing exit code given twice', () => {
  expect(() => parseTraces(TRACE.replace('Last line: none', 'Last line: none\nExit: 1'))).toThrow('a-trace');
});
