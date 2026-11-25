import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { words } from './build-set-traces.ts';
import { requestKey, startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import { FIXTURE_TEMPLATE, REPO_ROOT } from './set-builder-harness.ts';

// The build-set skill's worked examples, run through the command's own flag rules. The examples in
// .claude/skills/build-set/SKILL.md hold exact `pnpm build-set` commands, a copy of the command's flag grammar that
// nothing else reads, so a change to the flags would leave them wrong with every check green, and the skill would then
// teach Claude a command that fails or builds a different service. setlist-controller#58 extends the same command and
// skill. Each fenced command under `## Worked examples` runs as the operator runs it, against a scratch library of the
// folders the examples' listing names, as empty folders: the build then stops on the empty folders with exit 1, which is
// fine, since this file is about the flags and the names. Worked example 8's plan listing, and the changed song line it
// quotes for --pad 3, are read against what `--plan --list` prints for the recorded November 1 plan, since that listing
// is joined from fields, not printed from one literal the quoted-line matcher sees (setlist-controller#222). A fenced
// lights command, `pnpm build-set --lights`, runs through the lights mode's own flag rules: it takes none of a build's
// path flags but the output root and the show folder, so it gets those two and a connections config, all three in the
// scratch folder, and stops on the scratch output root's having no set built, before it reads the connections config
// or opens a connection (setlist-controller#504).

const SKILL = join(REPO_ROOT, '.claude/skills/build-set/SKILL.md');
const SECTION = '## Worked examples';
const COMMAND = 'pnpm build-set';

const CLIENT_ID = 'fake-client-id-82';
const SECRET = 'fake-secret-82';
// The recorded November 1 plan the --plan examples are said against, on Saturday 2026-10-31 with no date named, and the
// request for its items, songs and keys, which a --plan command makes once it has read the plan.
const NOVEMBER_1 = '2026-11-01';
const NOVEMBER_1_ITEMS = '/service_types/997539/plans/90897397/items?include=song,key,arrangement&per_page=100';

type Command = { line: number; text: string; args: string[] };
type PlanListing = { line: number; lines: string[]; padLine: string };
type Examples = { listing: string[]; library: string[]; commands: Command[]; unfenced: number[]; planListing: PlanListing };

// A set name, the first line --plan --list prints, which marks worked example 8's fence of that listing.
const SET_NAME = /^\d{4}-\d{2}-\d{2} Sunday$/;

// The worked examples section of SKILL.md, from its heading to the next `## ` heading: the lines of its first fence, the
// `--list` output the examples assume, as written, and their folders, each line a short name, a key and a folder split
// by runs of two or more spaces; every fenced line that starts `pnpm build-set`, with its line number; and the line numbers of any line in the
// section that starts `pnpm build-set` outside a fence; and worked example 8's plan listing, the one fence whose first
// line is a set name, as written, with the SKILL.md line of that set name, and the song line the prose after it quotes,
// the first inline code span there that starts `<n>. `. A missing heading, a listing line of another shape, no plan
// listing or more than one, or no quoted song line after it, throws.
function readExamples(text: string): Examples {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === SECTION);
  if (start === -1) throw new Error(`${SKILL} has no "${SECTION}" heading.`);
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const section = lines.slice(start + 1, next === -1 ? undefined : next).map((text, index) => ({ line: start + 2 + index, text: text.trim() }));
  const listing: string[] = [];
  const library: string[] = [];
  const commands: Command[] = [];
  const unfenced: number[] = [];
  const planFences: { line: number; lines: string[]; end: number }[] = [];
  let fence: { line: number; lines: string[] } | undefined;
  let inFence = false;
  let fences = 0;
  for (const { line, text } of section) {
    if (text.startsWith('```')) {
      inFence = !inFence;
      if (inFence) {
        fences += 1;
        fence = { line: line + 1, lines: [] };
      } else if (fence !== undefined && SET_NAME.test(fence.lines[0] ?? '')) {
        planFences.push({ ...fence, end: line });
      }
      continue;
    }
    if (inFence) fence?.lines.push(text);
    if (inFence && fences === 1) {
      const [, , folder, ...rest] = text.split(/\s{2,}/);
      if (folder === undefined || rest.length > 0) throw new Error(`SKILL.md:${line} is no listing line of a short name, a key and a folder: ${text}`);
      listing.push(text);
      library.push(folder);
    } else if (text.startsWith(COMMAND)) {
      if (inFence) commands.push({ line, text, args: words(text.slice(COMMAND.length)) });
      else unfenced.push(line);
    }
  }
  if (planFences.length !== 1) throw new Error(`${SKILL} holds ${planFences.length} fences that start with a set name under "${SECTION}", not the one of worked example 8.`);
  const [plan] = planFences as [(typeof planFences)[number]];
  let fenced = false;
  let padLine: string | undefined;
  for (const { line, text } of section) {
    if (text.startsWith('```')) fenced = !fenced;
    else if (!fenced && line > plan.end) padLine ??= [...text.matchAll(/`([^`]+)`/g)].map(([, span]) => span).find((span) => /^\d+\. /.test(span ?? ''));
    if (padLine !== undefined) break;
  }
  if (padLine === undefined) throw new Error(`${SKILL} quotes no song line after the plan listing at SKILL.md:${plan.line}.`);
  return { listing, library, commands, unfenced, planListing: { line: plan.line, lines: plan.lines, padLine } };
}

// The command as the operator runs it, through the package.json script, with pnpm's own output silenced. `env` is added
// to the environment it runs in.
function run(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const examples = readExamples(readFileSync(SKILL, 'utf8'));

// A command's `--replace "<set folder>"` names a set folder under Nick's output root; the scratch output root `sets`
// stands in for it, so the value names the same set folder name there. The folder's name opens with the date it is the
// set folder for, which goes on the command as --date, since a command with no --date builds for today's coming Sunday.
function scratchReplace(args: string[], sets: string): { args: string[]; date: string | undefined } {
  const at = args.indexOf('--replace');
  if (at === -1) return { args, date: undefined };
  const name = basename(args[at + 1] ?? '');
  const date = /^(\d{4}-\d{2}-\d{2}) [A-Z][a-z]+day$/.exec(name)?.[1];
  if (date === undefined) throw new Error(`--replace names no set folder: ${args.join(' ')}`);
  return { args: args.map((arg, index) => (index === at + 1 ? join(sets, name) : arg)), date };
}

// Each test here spawns pnpm build-set, which a loaded CI runner can take past vitest's 5 s default, so every describe
// gives its tests 30 s, as set-builder-lights.test.ts does. A build that hangs still fails, at 30 s.
describe('the build-set skill\'s worked examples', { timeout: 30_000 }, () => {
  let dir: string;
  let fake: PlanningCenter;
  let tokenFile: string;

  // A scratch folder under the git-ignored dist/, inside the worktree: the listed folders as empty folders in its
  // library, an empty pads folder, an output root, and a token file for the fake Planning Center.
  beforeAll(async () => {
    await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
    dir = await mkdtemp(join(REPO_ROOT, 'dist/build-set-skill-'));
    for (const folder of examples.library) await mkdir(join(dir, 'library', folder), { recursive: true });
    await mkdir(join(dir, 'pads'));
    await mkdir(join(dir, 'Sets'));
    tokenFile = join(dir, 'pco.env');
    await writeFile(tokenFile, `PCO_CLIENT_ID=${CLIENT_ID}\nPCO_SECRET='${SECRET}'\n`);
    await chmod(tokenFile, 0o600);
    fake = await startPlanningCenter({ clientId: CLIENT_ID, secret: SECRET });
  });

  afterAll(async () => {
    await fake?.close();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it('hold fenced pnpm build-set commands and the listing they assume, and no command outside a fence', () => {
    expect(examples.library).not.toEqual([]);
    expect(examples.commands).not.toEqual([]);
    expect(examples.unfenced.map((line) => `SKILL.md:${line}`)).toEqual([]);
    expect(examples.planListing.lines).not.toEqual([]);
    expect(examples.planListing.padLine).not.toBe('');
  });

  // The listing the examples assume is what --list prints on the scratch library of its own folders: the short name, the
  // key and the folder of each line, in order, and nothing after them. The output root is an empty folder of its own, so
  // no set folder for the date adds a last line (setlist-controller#219).
  it('hold the listing --list prints on the folders it names', async () => {
    const outputRoot = await mkdtemp(join(dir, 'list-Sets-'));

    const result = await run(['--list', '--library', join(dir, 'library'), '--output-root', outputRoot], {});

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toEqual([...examples.listing, '']);
  }, 20_000);

  // Worked example 8's listing is what --plan --list prints for the recorded November 1 plan on the scratch library: the
  // set name, each song's line with its fields in order, each other item's line, and no warning, then nothing. The
  // folders are empty, so the build's own checks then print problems on stderr with exit 1; the listing on stdout comes
  // first and whole, so only stdout is read (setlist-controller#222).
  async function planList(flags: string[]): Promise<string[]> {
    const outputRoot = await mkdtemp(join(dir, 'plan-list-Sets-'));
    const paths = ['--library', join(dir, 'library'), '--pads', join(dir, 'pads'), '--template', FIXTURE_TEMPLATE, '--output-root', outputRoot];
    const result = await run(['--plan', '--list', ...flags, '--date', NOVEMBER_1, ...paths], { PCO_API_BASE: fake.base, PCO_ENV: tokenFile });
    return result.stdout.split('\n');
  }

  it(`SKILL.md:${examples.planListing.line} holds the listing --plan --list prints for the November 1 plan`, async () => {
    expect(await planList([])).toEqual([...examples.planListing.lines, '']);
  }, 20_000);

  // After the plan listing, example 8 quotes the song line --pad 3 changes, and says the other lines are as before.
  it(`SKILL.md:${examples.planListing.line} holds the song line --plan --list --pad 3 changes`, async () => {
    const { lines, padLine } = examples.planListing;
    const position = padLine.slice(0, padLine.indexOf(' ') + 1);
    expect(lines.filter((line) => line.startsWith(position))).toHaveLength(1);

    expect(await planList(['--pad', '3'])).toEqual([...lines.map((line) => (line.startsWith(position) ? padLine : line)), '']);
  }, 20_000);

  const lights = ({ args }: Command) => args.includes('--lights');

  it('hold a lights command, and a build command', () => {
    expect(examples.commands.filter(lights)).not.toEqual([]);
    expect(examples.commands.filter((command) => !lights(command))).not.toEqual([]);
  });

  // A lights command gets the lights mode's three path flags, each in the scratch folder, after its own words so they
  // win, and HOME is the scratch folder. A flag the mode does not take, or a song name, exits 2 with the usage text.
  // Its output root is a folder of its own that no build writes to, so the mode stops on its first read after the
  // lights config, with the one line that says no set is built there and nothing on stdout: it reads no connections
  // config and connects to no Eos and no ProPresenter.
  for (const { line, text, args } of examples.commands.filter(lights)) {
    it(`SKILL.md:${line} ${text} passes the lights mode's flag rules`, async () => {
      const outputRoot = join(dir, 'lights-Sets');
      const paths = ['--output-root', outputRoot, '--show-folder', join(dir, 'ETC'), '--connections-config', join(dir, 'connections.json')];

      const result = await run([...args, ...paths], { HOME: dir });

      expect(result.stdout + result.stderr).not.toContain('Usage:');
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('The lights step is not done: no set is built for ');
      expect(result.stderr).toContain(`since ${outputRoot}/`);
    }, 20_000);
  }

  // Every path flag points into the scratch folder, after the command's own words so it wins, the show folder too, so no
  // build looks in the real Eos show folder, HOME is the scratch folder,
  // so a build's default set manifest is there and never the home folder's, and a --plan command reads
  // the recorded November 1 plan from the fake. The command's guard against a bad flag exits 2 with the usage text; the
  // library's own copy of the transition rules (checkTransitions) throws one of its two lines, with exit 1; a typed
  // name that matches no folder, or more than one, and a plan song with no one folder, each print a problem line.
  for (const { line, text, args } of examples.commands.filter((command) => !lights(command))) {
    it(`SKILL.md:${line} ${text} passes the command's flag rules and names one listed folder per song`, async () => {
      const plan = args.includes('--plan');
      const paths = ['--library', join(dir, 'library'), '--template', FIXTURE_TEMPLATE, '--output-root', join(dir, 'Sets'), '--pads', join(dir, 'pads'), '--show-folder', join(dir, 'ETC')];
      const replaced = scratchReplace(args, join(dir, 'Sets'));
      const date = plan ? NOVEMBER_1 : replaced.date;
      const before = fake.requests.length;

      const result = await run([...replaced.args, ...paths, ...(date === undefined ? [] : ['--date', date])], { PCO_API_BASE: fake.base, PCO_ENV: tokenFile, HOME: dir });

      expect(result.stdout + result.stderr).not.toContain('Usage:');
      expect(result.code).not.toBe(2);
      expect(result.stderr).not.toContain('needs a song position from');
      expect(result.stderr).not.toContain('which is not a note name');
      if (plan) {
        expect(fake.requests.slice(before).map(({ path }) => requestKey(path))).toContain(requestKey(NOVEMBER_1_ITEMS));
        for (const problem of ['has no song folder in', 'has no key in the plan', 'is planned in', 'song folders in']) expect(result.stderr).not.toContain(problem);
      } else {
        expect(result.stderr).not.toContain('matches no song folder');
        expect(result.stderr).not.toMatch(/matches \d+ song folders/);
      }
    }, 20_000);
  }
});
