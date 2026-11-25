import { readFile } from 'node:fs/promises';
import { FORMAT, show, type ComparisonFile } from './report.ts';

// Compare mode: the differences between two runs' comparison files, observation by observation.

export class Unreadable extends Error {}

export async function readComparisonFile(path: string): Promise<ComparisonFile> {
  let file: unknown;
  try {
    file = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Unreadable(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof file !== 'object' || file === null || !('format' in file) || file.format !== FORMAT || !('steps' in file)) {
    throw new Unreadable(`${path} is not a contract check comparison file in format ${FORMAT}.`);
  }
  return file as ComparisonFile;
}

export function differences(a: ComparisonFile, b: ComparisonFile): string[] {
  const lines: string[] = [];
  for (const step of union(Object.keys(a.steps), Object.keys(b.steps))) {
    const left = a.steps[step];
    const right = b.steps[step];
    for (const observation of union(Object.keys(left ?? {}), Object.keys(right ?? {}))) {
      const valueA = left?.[observation];
      const valueB = right?.[observation];
      const shownA = valueA === undefined ? '(absent)' : show(valueA);
      const shownB = valueB === undefined ? '(absent)' : show(valueB);
      if (shownA !== shownB) lines.push(`${step} / ${observation}: ${shownA} | ${shownB}`);
    }
  }
  return lines;
}

export function header(label: string, path: string, file: ComparisonFile): string {
  const target = file.target.kind === 'fake' ? 'fake Live' : `real AbletonOSC at ${file.target.host}:${file.target.port}`;
  return `${label}: ${path} (${target}, Live ${file.version}, ran ${file.ranAt}${file.aborted ? ', stopped early' : ''})`;
}

function union(a: string[], b: string[]): string[] {
  return [...a, ...b.filter((key) => !a.includes(key))];
}
