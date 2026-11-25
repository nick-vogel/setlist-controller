import { LOCATORS, PLAYHEAD_AFTER_STOP, PLAYS_FROM_LOCATOR, RESUMES_AT_STOP_POINT, SECOND_JUMP_REPLACES, type RunRecord, type Value } from './run.ts';
import { isTestSet, locatorLine, TEST_SET, TEST_SET_SIGNATURE, TEST_SET_TEMPO, TEST_SET_TRACKS, trackLine } from './test-set.ts';

// The two outputs of one run: the comparison file, which compare mode diffs, and the readable report.

export const FORMAT = 1;

export type ComparisonFile = {
  format: number;
  target: RunRecord['target'];
  ranAt: string;
  version: string;
  aborted?: string;
  // Only this part is compared. Every value in it is timing-independent by construction.
  steps: Record<string, Record<string, Value>>;
};

export function toComparisonFile(run: RunRecord): ComparisonFile {
  return {
    format: FORMAT,
    target: run.target,
    ranAt: run.ranAt,
    version: run.version,
    ...(run.aborted !== undefined && { aborted: run.aborted }),
    steps: Object.fromEntries(run.steps.map((step) => [step.name, step.observations])),
  };
}

// The behaviours the fake Live assumes and the hardware check confirms, by step and observation.
const BEHAVIOURS: { label: string; step: string; observation: string; fake: string }[] = [
  { label: 'A jump then start_playing plays from the locator', ...PLAYS_FROM_LOCATOR, fake: 'yes' },
  { label: 'continue_playing after a stop and a jump resumes at the stop point', ...RESUMES_AT_STOP_POINT, fake: 'yes' },
  { label: 'A second quantized jump replaces a waiting one', ...SECOND_JUMP_REPLACES, fake: 'yes' },
  { label: 'Where Live leaves the playhead after stop_playing', ...PLAYHEAD_AFTER_STOP, fake: 'at stop point' },
];

export function toReport(run: RunRecord): string {
  const { target } = run;
  const lines: string[] = [];
  lines.push(`# Contract check against the ${target.kind === 'fake' ? 'fake Live' : 'real AbletonOSC'}`);
  lines.push('');
  lines.push(`- Ran at: ${run.ranAt}`);
  lines.push(
    `- Target: ${target.host}, sending to port ${target.port}, ${target.replyPort === 0 ? 'replies to the sending port' : `replies on port ${target.replyPort}`}`,
  );
  lines.push(`- Live version: ${run.version}`);
  const steps = Object.fromEntries(run.steps.map((step) => [step.name, step]));
  const locators = steps[LOCATORS.step]?.observations[LOCATORS.observation];
  lines.push(`- Test set: ${locators === undefined ? 'not read' : isTestSet(locators) ? 'yes, the locators match' : 'no, the locators differ'}`);
  lines.push('');
  if (run.aborted) {
    lines.push(`**The run stopped early.** ${run.aborted.replace(/\n/g, '\n\n')}`);
    lines.push('');
  }
  for (const warning of run.warnings) lines.push(`**Warning.** ${warning}`, '');

  lines.push('## The behaviours');
  lines.push('');
  lines.push('| Behaviour | Observed | The fake Live assumes |');
  lines.push('|---|---|---|');
  for (const behaviour of BEHAVIOURS) {
    const value = steps[behaviour.step]?.observations[behaviour.observation];
    lines.push(`| ${behaviour.label} | ${value === undefined ? 'not reached' : show(value)} | ${behaviour.fake} |`);
  }
  lines.push('');

  lines.push('## The test set');
  lines.push('');
  lines.push(`${TEST_SET_TEMPO} BPM in ${TEST_SET_SIGNATURE.numerator}/${TEST_SET_SIGNATURE.denominator}, locators:`);
  lines.push('');
  for (const cue of TEST_SET) lines.push(`- ${locatorLine(cue)}`);
  lines.push('');
  lines.push("Tracks, in Live's order:");
  lines.push('');
  for (const track of TEST_SET_TRACKS) lines.push(`- ${trackLine(track)}`);
  lines.push('');

  lines.push('## Steps');
  for (const step of run.steps) {
    lines.push('');
    lines.push(`### ${step.name}: ${step.title}`);
    lines.push('');
    lines.push('Sent:');
    lines.push('');
    if (step.sent.length === 0) lines.push('- nothing');
    for (const sent of step.sent) lines.push(`- +${sent.at} ms \`${sent.address}\`${sent.args ? ` ${sent.args}` : ''}`);
    lines.push('');
    lines.push('Received:');
    lines.push('');
    if (step.received.length === 0) lines.push('- nothing');
    for (const received of step.received) {
      lines.push(`- +${received.at} ms \`${received.address}\` ,${received.types}${received.args ? ` ${received.args}` : ''}`);
    }
    lines.push('');
    lines.push('Observations:');
    lines.push('');
    const observations = Object.entries(step.observations);
    if (observations.length === 0) lines.push('- none');
    for (const [name, value] of observations) lines.push(`- ${name}: ${show(value)}`);
    for (const note of step.notes) lines.push('', `Note: ${note}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function show(value: Value): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
