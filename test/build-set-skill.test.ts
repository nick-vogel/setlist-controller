import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { missingPins, parseExempt, parseTraces, sentenceCoverage, skillSentences, standIn, words, type Listing, type Trace } from './build-set-traces.ts';
import { readFixtures, requestKey, startPlanningCenter, type Fixture, type PlanningCenter } from './planning-center-fake.ts';
import { addPad, addPadTrack, copySongAs, createWorkspace, GOODNESS, GRACE, GREAT_ARE, libraryFile, REPO_ROOT, removeWorkspaces, type Workspace } from './set-builder-harness.ts';

// The build-set skill's hand traces, kept in .claude/skills/build-set/traces.md. Each pins the sentences of SKILL.md it
// reads, so an edit to a pinned sentence fails here until its traces are traced again by hand. Each trace's listings
// then run as the operator runs them, against a workspace under dist/ and the fake Planning Center, and give the exit
// code and last line the trace records. Only listings run: a listing writes nothing, and every one gets an output root
// in the workspace. The sentence check fails on a sentence of SKILL.md's five rule sections that no pin covers and the
// exempt list at the end of traces.md does not list, by the rule the head of traces.md states.

const SKILL = join(REPO_ROOT, '.claude/skills/build-set/SKILL.md');
const TRACES = join(REPO_ROOT, '.claude/skills/build-set/traces.md');

// The traces in traces.md. A trace added or deleted changes this count in the same commit.
const TRACE_COUNT = 102;

const TRACE = `# Traces

The head says what the file is.

## a-trace

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: a test
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.

Listing:

\`\`\`
pnpm build-set --list
\`\`\`

Set folders: none
Exit: 0
Last line: \`trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm\`

Command: \`pnpm build-set grace lord rain\`
Date line: \`Date: Sunday 2026-10-18, the coming Sunday, since no date is named\`
Question: Run it?

Pins:

\`\`\`
Show it to him.
Run it only on his yes.
\`\`\`
`;

const readTraces = async () => parseTraces(await readFile(TRACES, 'utf8'));

describe('the pin check', () => {
  it('names the trace and the pin that is not in the skill word for word', () => {
    const traces = parseTraces(TRACE);

    expect(missingPins(traces, 'Show it to him. Run it only on a yes.')).toEqual(['a-trace: Run it only on his yes.']);
    expect(missingPins(traces, 'Show it to him. Run it only on his yes.')).toEqual([]);
  });

  it('names a pin the skill holds twice, since deleting either copy would leave it found', () => {
    const traces = parseTraces(TRACE);

    expect(missingPins(traces, 'Show it to him. Run it only on his yes. Then: Run it only on his yes.')).toEqual(['a-trace: Run it only on his yes. (found 2 times)']);
  });

  it('reads a trace whole, its listing included', () => {
    const [trace] = parseTraces(TRACE);

    expect(trace).toEqual({
      id: 'a-trace',
      saidOn: { weekday: 'Saturday', date: '2026-10-17' },
      library: "the worked examples' seven folders",
      source: 'a test',
      nickSays: ['Grace, Great Are You Lord, Fall Like Rain.'],
      listings: [{ command: 'pnpm build-set --list', plan: undefined, setFolders: [], exit: 0, lastLine: 'trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm' }],
      notRun: undefined,
      command: 'pnpm build-set grace lord rain',
      dateLine: 'Date: Sunday 2026-10-18, the coming Sunday, since no date is named',
      question: 'Run it?',
      songLines: [],
      pins: ['Show it to him.', 'Run it only on his yes.'],
    });
  });

  it.each([
    ['a field', 'Question: Run it?\n', 'a-trace: it has no Question'],
    ['every pin', 'Show it to him.\nRun it only on his yes.\n', 'a-trace: it has no pin'],
    ['a listing\'s exit code', 'Exit: 0\n', 'a-trace: Listing 1 has no Exit'],
    ['a listing\'s last line', 'Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`\n', 'a-trace: Listing 1 has no Last line'],
    ['the listing', 'Listing:\n\n```\npnpm build-set --list\n```\n\nSet folders: none\nExit: 0\nLast line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`\n', 'a-trace: it has no Listing'],
  ])('stops on a trace with no %s, naming it', (_what, cut, problem) => {
    expect(() => parseTraces(TRACE.replace(cut, ''))).toThrow(problem);
  });

  // A request for the lights alone runs no listing, and its trace says so with `Listing: none`.
  const LISTING = 'Listing:\n\n```\npnpm build-set --list\n```\n\nSet folders: none\nExit: 0\nLast line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`\n';

  it('reads a trace that runs no listing, written Listing: none, with no listing', () => {
    const [trace] = parseTraces(TRACE.replace(LISTING, 'Listing: none\n'));

    expect(trace?.listings).toEqual([]);
    expect(trace?.command).toBe('pnpm build-set grace lord rain');
  });

  it('stops on Listing: none beside a listing, before it or after it, naming the trace', () => {
    expect(() => parseTraces(TRACE.replace(LISTING, `${LISTING}\nListing: none\n`))).toThrow('a-trace: Listing: none stands beside a listing');
    expect(() => parseTraces(TRACE.replace(LISTING, `Listing: none\n\n${LISTING}`))).toThrow('a-trace: Listing: none stands beside a listing');
    expect(() => parseTraces(TRACE.replace(LISTING, 'Listing: none\nListing: none\n'))).toThrow('a-trace: Listing is given twice as none');
  });

  it('stops on a Listing with anything but none or a fenced block after it, naming the trace', () => {
    expect(() => parseTraces(TRACE.replace(LISTING, 'Listing: no\n'))).toThrow('a-trace: Listing reads "no", not none or a fenced block of one command');
  });

  it('stops on a line that is no field, naming the trace', () => {
    expect(() => parseTraces(TRACE.replace('Question: Run it?', 'Questions: Run it?'))).toThrow('a-trace: no field is named Questions');
    expect(() => parseTraces(TRACE.replace('Question: Run it?', 'Run it?'))).toThrow('a-trace: no field reads "Run it?"');
  });

  it('splits a command as a shell does, a quoted set folder as one word', () => {
    expect(words('pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"')).toEqual([
      'pnpm',
      'build-set',
      '--list',
      '--replace',
      '/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday',
    ]);
    expect(words("pnpm build-set '2026-11-01 Sunday'  grace")).toEqual(['pnpm', 'build-set', '2026-11-01 Sunday', 'grace']);
    expect(() => words('pnpm build-set --replace "/Users/nick/Music')).toThrow('A command leaves a " open');
  });

  it('stands a path, or a path under one, in for its workspace path, and throws on a path under none', () => {
    const paths = new Map([
      ['/Users/nick/Music/Ableton/Sets', '/work/Sets'],
      ['/Volumes/Stage/Sets', '/work/Stage Sets'],
    ]);

    expect(standIn('/Users/nick/Music/Ableton/Sets', paths)).toBe('/work/Sets');
    expect(standIn('/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday', paths)).toBe('/work/Sets/2026-11-01 Sunday');
    expect(standIn('/Volumes/Stage/Sets/2026-11-08 Sunday', paths)).toBe('/work/Stage Sets/2026-11-08 Sunday');
    expect(standIn('--replace', paths)).toBe('--replace');
    expect(() => standIn('/Users/nick/Music/Ableton/Sets Old/2026-11-01 Sunday', paths)).toThrow('the workspace has no stand-in for /Users/nick/Music/Ableton/Sets Old/2026-11-01 Sunday');
    expect(() => standIn('/Users/nick/Desktop/2026-11-01 Sunday', paths)).toThrow('the workspace has no stand-in for');
  });

  it('holds every trace whole, each with its own id', async () => {
    const traces = await readTraces();

    expect(traces).toHaveLength(TRACE_COUNT);
    expect(new Set(traces.map(({ id }) => id)).size).toBe(TRACE_COUNT);
    const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    expect(traces.filter(({ saidOn }) => weekday(saidOn.date) !== saidOn.weekday).map(({ id }) => id)).toEqual([]);
  });

  it('finds every pinned sentence in SKILL.md word for word, once', async () => {
    const [traces, skill] = await Promise.all([readTraces(), readFile(SKILL, 'utf8')]);

    expect(missingPins(traces, skill)).toEqual([]);
  });

  // The split rule, what covers a sentence and the exempt list's shape are written out at the head of traces.md.
  it('covers every sentence of the five sections with a pin or an exempt entry', async () => {
    const [text, skill] = await Promise.all([readFile(TRACES, 'utf8'), readFile(SKILL, 'utf8')]);

    expect(sentenceCoverage(parseTraces(text), parseExempt(text), skill)).toEqual([]);
  });
});

// A skill text in the shape of SKILL.md: a head no sentence comes from, the five sections, and a section after them.
const SKILL_TEXT = `# Build the set

Outside every section. It counts for nothing.

## Steps

1. **List the library.** Run \`pnpm build-set --list\`. It prints \`a. b? c!\` lines.
   - \`--date\` goes on the listing (by the mapping). Then the build
2. **Show the command and wait.**

## The plan path

**A yes with no change** ("yes", "yep") runs it. Ask "Replace the set built before?" in place of "Run it?". Done.

## The yes to replacing

- **The folder.** A line \`<folder> already exists, and --replace replaces it.\` That line is no song line. It says \`It has no pad files.\` or not.

## The lights step

- **On his word.** Run \`pnpm build-set --lights\` for the same date. Ask no second question.

## Ask instead of guess

- a song on no listed line;

## What it touches

Outside again.
`;

describe('the sentence check', () => {
  it('splits the five sections into sentences, each with its line in the skill', () => {
    expect(skillSentences(SKILL_TEXT).map(({ line, text }) => `${line}: ${text}`)).toEqual([
      '7: Run `pnpm build-set --list`.',
      '7: It prints `a. b? c!` lines.',
      '8: `--date` goes on the listing (by the mapping).',
      '8: Then the build',
      '13: **A yes with no change** ("yes", "yep") runs it.',
      '13: Ask "Replace the set built before?" in place of "Run it?".',
      '13: Done.',
      '17: A line `<folder> already exists, and --replace replaces it.`',
      '17: That line is no song line.',
      '17: It says `It has no pad files.` or not.',
      '21: Run `pnpm build-set --lights` for the same date.',
      '21: Ask no second question.',
      '25: a song on no listed line;',
    ]);
  });

  it('gives each sentence as the skill holds it, at its place in the text', () => {
    for (const { text, start, end } of skillSentences(SKILL_TEXT)) expect(SKILL_TEXT.slice(start, end)).toBe(text);
  });

  it('stops on a section heading the skill does not have, naming it', () => {
    expect(() => skillSentences(SKILL_TEXT.replace('## The plan path', '## The plan'))).toThrow('The skill has no "## The plan path" section');
  });

  // TRACE pins two sentences of COVERED, and EXEMPT lists two more: COVERED's every sentence of the five sections.
  const EXEMPT = `
# Sentences no trace pins

Sentence: Then the build
Reason: no listing, command or question depends on it

Sentence: Done.
Reason: a test reason
`;
  const COVERED = `# Build the set

## Steps

Show it to him. Run it only on his yes. Then the build

## The plan path

Done.

## The yes to replacing

## The lights step

## Ask instead of guess

## What it touches

Outside every section, so no sentence.
`;
  const coverage = (trace: string, exempt: string, skill: string) => sentenceCoverage(parseTraces(trace + exempt), parseExempt(trace + exempt), skill);

  it('reads the traces before the exempt list as before, and the list after them', () => {
    expect(parseTraces(TRACE + EXEMPT)).toEqual(parseTraces(TRACE));
    expect(parseExempt(TRACE + EXEMPT)).toEqual([
      { sentence: 'Then the build', reason: 'no listing, command or question depends on it' },
      { sentence: 'Done.', reason: 'a test reason' },
    ]);
    expect(parseExempt(TRACE)).toEqual([]);
  });

  it('stops on a line of the exempt list that is no Sentence or Reason, naming it', () => {
    expect(() => parseExempt(TRACE + EXEMPT.replace('Reason: a test reason', 'Why: a test reason'))).toThrow('The exempt list has a line that is no Sentence or Reason: "Why: a test reason"');
    expect(() => parseExempt(TRACE + EXEMPT.replace('Reason: a test reason', 'Reason: a test reason\nReason: another'))).toThrow('The exempt list has a Reason with no Sentence before it: "Reason: another"');
  });

  it('finds nothing when every sentence is pinned or listed', () => {
    expect(coverage(TRACE, EXEMPT, COVERED)).toEqual([]);
  });

  it('names a sentence neither pinned nor listed, with its line in the skill', () => {
    expect(coverage(TRACE, EXEMPT, COVERED.replace('Done.', 'Done. A new sentence.'))).toEqual(['SKILL.md:9: A new sentence.']);
  });

  it('counts a sentence covered only when one pin holds all of it', () => {
    const halves = TRACE.replace('Show it to him.\nRun it only on his yes.', 'Show it to him. Run it\nonly on his yes.');
    const part = TRACE.replace('Show it to him.\nRun it only on his yes.', 'Show it to him.\nonly on his yes.');

    expect(coverage(halves, EXEMPT, COVERED)).toEqual(['SKILL.md:5: Run it only on his yes.']);
    expect(coverage(part, EXEMPT, COVERED)).toEqual(['SKILL.md:5: Run it only on his yes.']);
  });

  it.each([
    ['has no reason', EXEMPT.replace('Reason: a test reason', 'Reason:'), 'The exempt list: Done.: it has no reason'],
    ['has no Reason line', EXEMPT.replace('\nReason: a test reason', ''), 'The exempt list: Done.: it has no reason'],
    ['is no sentence of the five sections', `${EXEMPT}\nSentence: Done now.\nReason: a test reason\n`, 'The exempt list: Done now.: it is no sentence of the five sections of SKILL.md'],
    ['is a sentence a pin holds', `${EXEMPT}\nSentence: Run it only on his yes.\nReason: a test reason\n`, 'The exempt list: Run it only on his yes.: a-trace pins it'],
    ['is listed twice', `${EXEMPT}\nSentence: Done.\nReason: a test reason\n`, 'The exempt list: Done.: it is listed twice'],
  ])('names an entry that %s', (_what, exempt, problem) => {
    expect(coverage(TRACE, exempt, COVERED)).toEqual([problem]);
  });
});

// The CLI half: each trace's listings, run.

const CLIENT_ID = 'fake-client-id-5d21';
const SECRET = 'fake-secret-0c8e';
const SETS = '/Users/nick/Music/Ableton/Sets';

// The worked examples' library, as SKILL.md lists it. --list reads folder names only, so Build My Life and There Is
// Freedom are bare folders; the plan's songs are fixture songs a build can read.
const FALL_LIKE_RAIN = 'Fall Like Rain-Call On Heaven-E-70.00bpm';
const BUILD_MY_LIFE = 'Build My Life-Worthy of Your Name-G-70.00bpm';
const THERE_IS_FREEDOM = 'There Is Freedom-Where the Glory Is-A-76.00bpm';

// The Phase 0 plan's songs, as test/set-builder-plan-list.test.ts makes them.
const WELCOME_HOME = 'WELCOME HOME-Elevation Rhythm-F-98.00bpm';
const YES_AND_AMEN = 'Yes And Amen-Jesus Culture-G-72.00bpm';
const PHASE_0_FALL_LIKE_RAIN = 'Fall Like Rain-Passion-E-70.00bpm';

// The worked examples' library as its own step, so a library that adds to it starts from it.
async function workedExamples(workspace: Workspace): Promise<void> {
  await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
  await mkdir(join(workspace.library, BUILD_MY_LIFE));
  await mkdir(join(workspace.library, THERE_IS_FREEDOM));
}

const LIBRARIES: Record<string, (workspace: Workspace) => Promise<void>> = {
  "the worked examples' seven folders": workedExamples,
  // A folder whose name writes no key, which --list prints as `no key`.
  "the worked examples' seven folders, and Way Maker with no key": async (workspace) => {
    await workedExamples(workspace);
    await mkdir(join(workspace.library, 'Way Maker-Sinach-68.00bpm'));
  },
  // A WAV Fall Like Rain's clips play, gone from its folder, which the plan listing's build checks find.
  "the worked examples' seven folders, with a WAV missing from Fall Like Rain": async (workspace) => {
    await workedExamples(workspace);
    await rm(libraryFile(workspace, FALL_LIKE_RAIN, 'AG 3.wav'));
  },
  // A song added after a listing whose short name, lord, its name holds too, so the build matches two folders on it.
  "the worked examples' seven folders, and Lord I Need You": async (workspace) => {
    await workedExamples(workspace);
    await mkdir(join(workspace.library, 'Lord I Need You-Matt Maher-E-72.00bpm'));
  },
  // Two downloads of one title, which --list prints by whole folder name, the one in A renamed after a listing.
  "the worked examples' seven folders, with Goodness of God at 68 BPM and a second download in B": async (workspace) => {
    await workedExamples(workspace);
    await rename(join(workspace.library, GOODNESS), join(workspace.library, 'Goodness of God-Victory-A-68.00bpm'));
    await mkdir(join(workspace.library, 'Goodness of God-Victory-B-63.00bpm'));
  },
  "the Phase 0 plan's songs": async (workspace) => {
    await copySongAs(workspace, GRACE, WELCOME_HOME);
    await copySongAs(workspace, GREAT_ARE, YES_AND_AMEN);
    await copySongAs(workspace, GOODNESS, PHASE_0_FALL_LIKE_RAIN);
  },
};

// The recorded November 1 plan, its items also answering for the plan on November 8, and `edit` applied to them.
const NOVEMBER_1_PLAN = '/plans/90897397/';
const NOVEMBER_8_PLAN = '/plans/90897398/';
const NOVEMBER_1_ITEMS = '/service_types/997539/plans/90897397/items?include=song,key,arrangement&per_page=100';

type ApiRecord = { type: string; id: string; attributes: Record<string, unknown> };
type ItemsBody = { data: ApiRecord[]; included: ApiRecord[] };

async function novemberPlans(edit: (items: ItemsBody) => void = () => {}): Promise<Fixture[]> {
  const fixtures = structuredClone(await readFixtures());
  const items = fixtures.find((fixture) => requestKey(fixture.path) === requestKey(NOVEMBER_1_ITEMS));
  if (items === undefined) throw new Error('No fixture records the November 1 items');
  edit(items.body as ItemsBody);
  const november8 = fixtures
    .filter((fixture) => fixture.path.includes(NOVEMBER_1_PLAN))
    .map((fixture) => ({ ...fixture, path: fixture.path.replace(NOVEMBER_1_PLAN, NOVEMBER_8_PLAN) }));
  return [...fixtures, ...november8];
}

// The November 1 plan with Goodness of God at song 2, in `key`, in place of Great Are You Lord.
const goodnessAtSong2 = (key: string) =>
  novemberPlans(({ data, included }) => {
    const find = (records: ApiRecord[], type: string, id: string) => {
      const found = records.find((each) => each.type === type && each.id === id);
      if (found === undefined) throw new Error(`No ${type} ${id}`);
      return found.attributes;
    };
    Object.assign(find(data, 'Item', '1223369536'), { title: 'Goodness of God', key_name: key });
    find(included, 'Song', '19355547').title = 'Goodness of God';
    find(included, 'Key', '36792902').starting_key = key;
    Object.assign(find(included, 'Arrangement', '22168561'), { bpm: 63, meter: '4/4' });
  });

const PLANS: Record<string, () => Promise<Fixture[]>> = {
  'the recorded November 1 plan, on November 1 and November 8': () => novemberPlans(),
  'the recorded November 1 plan, with Goodness of God at song 2 in G': () => goodnessAtSong2('G'),
  'the recorded November 1 plan, with Goodness of God at song 2 in A': () => goodnessAtSong2('A'),
  'Planning Center answering 503 to /service_types': async () =>
    (await readFixtures()).map((fixture) =>
      requestKey(fixture.path) === requestKey('/service_types?per_page=100') ? { ...fixture, status: 503, body: { errors: [{ status: '503' }] } } : fixture,
    ),
  'the recorded Phase 0 plan, on 2027-01-03': () => readFixtures(),
};

// The traces run side by side, so each closes its own fakes and removes its own workspace, and this removes any a
// failed trace left.
afterAll(removeWorkspaces);

// The trace's paths, each as the workspace stands in for it, a path under one too (standIn). Any other path in a
// listing is a fault in the trace. The two output roots stand in as two folders, so a --replace for a set folder under
// one never names the set folder under the other.
const stageSets = (workspace: Workspace) => join(workspace.dir, 'Stage Sets');
function standIns(workspace: Workspace): Map<string, string> {
  return new Map([
    [SETS, workspace.outputRoot],
    ['/Volumes/Stage/Sets', stageSets(workspace)],
    ['/Volumes/Stage/MultiTracks', workspace.library],
    ['/Volumes/Stage/Pads', join(workspace.library, '_pads')],
    ['/Volumes/Stage/Sunday.als', workspace.template],
    // A library folder that is not there.
    ['/Volumes/Stage/Missing', join(workspace.dir, 'Missing')],
  ]);
}

// The date a listing with no --date looks for: the coming Sunday from the day the trace is said on, that day when it
// is a Sunday.
function comingSunday(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + ((7 - day.getUTCDay()) % 7));
  return day.toISOString().slice(0, 10);
}

// The listing's argv as it runs: the trace's words, split as a shell splits them, with each path in the workspace, and
// --date, --library and --output-root added when the listing has none. A chart skeleton, `--skeleton`, takes no
// --output-root and, without --plan, no --date, so it gets --library alone, and --date with --plan. Also the output root
// the trace names, for its last line.
function listingArgs(trace: Trace, listing: Listing, workspace: Workspace): { args: string[]; outputRoot: string } {
  const [pnpm, command, ...flags] = words(listing.command);
  if (`${pnpm} ${command}` !== 'pnpm build-set') throw new Error(`${trace.id}: "${listing.command}" is no pnpm build-set listing`);
  const paths = standIns(workspace);
  const args = flags.map((flag) => {
    try {
      return standIn(flag, paths);
    } catch (error) {
      throw new Error(`${trace.id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  });
  const skeleton = flags.includes('--skeleton');
  if (!flags.includes('--date') && (!skeleton || flags.includes('--plan'))) args.push('--date', comingSunday(trace.saidOn.date));
  if (!flags.includes('--library')) args.push('--library', workspace.library);
  if (!flags.includes('--output-root') && !skeleton) args.push('--output-root', workspace.outputRoot);
  return { args, outputRoot: flags.includes('--output-root') ? (flags[flags.indexOf('--output-root') + 1] ?? SETS) : SETS };
}

// The command as the operator runs it, through the package.json script, against the fake and the workspace's token file,
// with HOME in the workspace too.
function run(args: string[], workspace: Workspace, base: string, token: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, PCO_API_BASE: base, PCO_ENV: token, HOME: workspace.dir } });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function traceWorkspace(trace: Trace): Promise<{ workspace: Workspace; token: string }> {
  const library = LIBRARIES[trace.library];
  if (library === undefined) throw new Error(`${trace.id}: no workspace makes the library "${trace.library}"`);
  const workspace = await createWorkspace();
  await library(workspace);
  await addPadTrack(workspace);
  await addPad(workspace, 'E', 120);
  const token = join(workspace.dir, 'pco.env');
  await writeFile(token, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET='${SECRET}'\n`);
  await chmod(token, 0o600);
  return { workspace, token };
}

// The fake Planning Center for a --plan listing, answering from its plan's fixtures; a listing with no --plan gets one
// too, which it never asks.
async function planningCenter(trace: Trace, listing: Listing): Promise<PlanningCenter> {
  const plan = listing.plan === undefined ? readFixtures : PLANS[listing.plan];
  if (plan === undefined) throw new Error(`${trace.id}: no fixture gives the plan "${listing.plan}"`);
  return startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET, fixtures: await plan() });
}

describe('the traces\' listings, run', async () => {
  const traces = await readTraces();
  // A trace with no listing, a request for the lights alone, has nothing to run here, and gets no workspace.
  const ran = traces.filter((trace) => trace.notRun === undefined && trace.listings.length > 0);

  it('runs the listings of every trace, since none says why it cannot', () => {
    expect(traces.filter((trace) => trace.notRun !== undefined).map(({ id, notRun }) => `${id}: ${notRun}`)).toEqual([]);
  });

  it.for(ran)('$id', { concurrent: true, timeout: 120_000 }, async (trace, { expect }) => {
    const { workspace, token } = await traceWorkspace(trace);
    const results: { command: string; exit: number | null; lastLine: string | undefined }[] = [];
    const stderrs: string[] = [];

    for (const listing of trace.listings) {
      const { args, outputRoot } = listingArgs(trace, listing, workspace);
      // Nothing it runs builds a set, or looks outside the workspace for one. A chart skeleton writes nothing and looks
      // for no set folder, so it takes no output root, and its set folders go under the workspace's.
      const skeleton = args.includes('--skeleton');
      const root = skeleton ? workspace.outputRoot : (args[args.indexOf('--output-root') + 1] ?? '');
      expect(skeleton || args.includes('--list'), listing.command).toBe(true);
      if (skeleton) expect(args).not.toContain('--output-root');
      expect(root.startsWith(join(REPO_ROOT, 'dist') + sep), root).toBe(true);
      // The set folders are those under the listing's own output root, and no other root holds one.
      for (const each of [workspace.outputRoot, stageSets(workspace)]) await rm(each, { recursive: true, force: true });
      for (const folder of listing.setFolders) await mkdir(join(root, folder), { recursive: true });
      const fake = await planningCenter(trace, listing);
      const result = await run(args, workspace, fake.base, token).finally(fake.close);

      const lines = result.stdout.split('\n').filter((line) => line !== '');
      results.push({ command: listing.command, exit: result.code, lastLine: lines.at(-1)?.replaceAll(root, outputRoot) });
      stderrs.push(result.stderr);
    }

    await rm(workspace.dir, { recursive: true, force: true });
    expect(results).toEqual(trace.listings.map(({ command, exit, lastLine }) => ({ command, exit, lastLine })));
    const printed = /^The listing prints `([^`]+)` on stderr/.exec(trace.note ?? '')?.[1];
    if (printed !== undefined) expect(stderrs).toEqual([`${printed}\n`]);
  });
});
