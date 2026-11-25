import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSet } from '../src/server/set-parser.ts';
import { matchSongs } from '../src/set-builder/library.ts';
import {
  addPad,
  addPadTrack,
  copySongAs,
  createWorkspace,
  DATE,
  editSongTrack,
  element,
  elements,
  GOODNESS,
  GRACE,
  GREAT_ARE,
  locatorList,
  noTemplateLine,
  readSet,
  REPO_ROOT,
  removeWorkspaces,
  projectFolder,
  setPath,
  snapshotFolder,
  TRUST,
  value,
  type Workspace,
} from './set-builder-harness.ts';

afterEach(removeWorkspaces);

// The command as the operator runs it, through the package.json script, with pnpm's own output silenced.
// Every path flag points into the test's workspace: the command's defaults write to ~/Music. `env` is added to the
// environment the command runs in.
function run(args: string[], cwd = REPO_ROOT, env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return output(spawn('pnpm', ['--silent', 'build-set', ...args], { cwd, env: { ...process.env, ...env } }));
}

function output(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// The usage text with each run of white space, its line breaks included, as one space, so a sentence reads whole
// wherever the text wraps it.
const unwrapped = (text: string) => text.replace(/\s+/g, ' ');

// A build's paths, each inside the workspace, so it never writes the real ~/Music/Ableton/Sets or set manifest, and never
// reads or writes the real Eos show folder, ~/Documents/ETC.
const paths = (workspace: Workspace) => ['--library', workspace.library, '--template', workspace.template, '--output-root', workspace.outputRoot, '--set-manifest', workspace.setManifest, '--show-folder', workspace.showFolder];

const DAY = 86_400_000;

// A date written YYYY-MM-DD, as midnight UTC, so the days between two dates never shift with daylight saving.
function utcDay(date: string): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts) throw new Error(`${date} is not written YYYY-MM-DD`);
  return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

describe('pnpm build-set', () => {
  it('builds the song a short name names into <output root>/<date> Sunday and prints the summary, the set path last, then the line of the lights step', async () => {
    const workspace = await createWorkspace();

    const result = await run(['grace', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe([`${DATE} Sunday`, '1. This Is Amazing Grace  bar 1  98 BPM  4/4', setPath(workspace), noTemplateLine(workspace), ''].join('\n'));
    expect(existsSync(setPath(workspace))).toBe(true);
  });

  it.each([
    { date: '2026-11-02', name: '2026-11-02 Monday' },
    { date: '2026-12-24', name: '2026-12-24 Thursday' },
  ])('names a set for $date by its own weekday, $name, in the summary, the folder and the .als', async ({ date, name }) => {
    const workspace = await createWorkspace();

    const result = await run(['grace', '--date', date, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe([name, '1. This Is Amazing Grace  bar 1  98 BPM  4/4', setPath(workspace, date), noTemplateLine(workspace), ''].join('\n'));
    // The literal path, not only the harness's, so the test cannot pass by the harness agreeing with the command.
    expect(existsSync(join(workspace.outputRoot, name, `${name}.als`))).toBe(true);
  });

  it('dates the set by the coming Sunday, or today on a Sunday, when no --date is given', async () => {
    const workspace = await createWorkspace();

    // The run may cross midnight, so the local date before it and the one after it both count as today.
    const before = new Date();
    const result = await run(['grace', ...paths(workspace)]);
    const after = new Date();

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const date = result.stdout.split('\n')[0]?.replace(/ Sunday$/, '') ?? '';
    // Checked against the calendar, not against the command's own defaultSetDate: a Sunday, 0 to 6 days after today.
    const sunday = utcDay(date);
    expect(new Date(sunday).getUTCDay(), `${date} is a Sunday`).toBe(0);
    const daysAfter = [before, after].map((today) => (sunday - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY);
    expect(
      daysAfter.some((days) => days >= 0 && days <= 6),
      `${date} is ${daysAfter.join(' or ')} days after today`,
    ).toBe(true);
    expect(result.stdout.trim().split('\n').slice(-2)).toEqual([setPath(workspace, date), noTemplateLine(workspace)]);
    expect(existsSync(setPath(workspace, date))).toBe(true);
  });

  it('builds several songs into one set, numbered in the order named, and prints each with its start bar, tempo and meter', async () => {
    const workspace = await createWorkspace();

    const result = await run(['grace', 'goodness', 'trust', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        `${DATE} Sunday`,
        '1. This Is Amazing Grace  bar 1  98 BPM  4/4  gap',
        '2. Goodness of God  bar 71  63 BPM  4/4  gap',
        '3. Trust In God  bar 157  74 BPM  6/8',
        setPath(workspace),
        noTemplateLine(workspace),
        '',
      ].join('\n'),
    );
    const root = await readSet(setPath(workspace));
    const names = elements(element(root, 'LiveSet', 'Locators', 'Locators'), 'Locator').map((locator) => value(locator, 'Name'));
    expect(names.filter((name) => name.includes('Count Off'))).toEqual([
      '1 - Count Off (This Is Amazing Grace)',
      '2 - Count Off (Goodness of God)',
      '3 - Count Off (Trust In God)',
    ]);
  });

  it('overlaps the song --overlap names into the next one, and prints each transition', async () => {
    const workspace = await createWorkspace();

    const result = await run(['grace', 'great are', 'goodness', '--overlap', '1', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        `${DATE} Sunday`,
        '1. This Is Amazing Grace  bar 1  98 BPM  4/4  overlap',
        '2. Great Are You Lord  bar 63  72 BPM  6/8  gap',
        '3. Goodness of God  bar 154  63 BPM  4/4',
        setPath(workspace),
        noTemplateLine(workspace),
        '',
      ].join('\n'),
    );
    const root = await readSet(setPath(workspace));
    const counts = elements(element(root, 'LiveSet', 'Locators', 'Locators'), 'Locator').filter((locator) => value(locator, 'Name').startsWith('2 - Count Off'));
    expect(counts.map((locator) => value(locator, 'Time'))).toEqual(['248']);
  });

  it('takes --overlap more than once', async () => {
    const workspace = await createWorkspace();

    const result = await run(['grace', 'great are', 'goodness', '--overlap', '1', '--overlap', '2', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    // Great Are You Lord's Ending is on 252, 84 bars of 6/8 after its start on bar 63.
    expect(result.stdout.split('\n').slice(1, 4)).toEqual([
      '1. This Is Amazing Grace  bar 1  98 BPM  4/4  overlap',
      '2. Great Are You Lord  bar 63  72 BPM  6/8  overlap',
      '3. Goodness of God  bar 147  63 BPM  4/4',
    ]);
  });

  it('takes --pad more than once, one for each song', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'G', 120);
    await addPad(workspace, 'A', 120);

    const result = await run(['grace', 'goodness', '--pad', '1=G', '--pad', '2', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    // A Pad section lasts 60 s whatever the pad, so Goodness of God starts on bar 81, as after one --pad 1.
    expect(result.stdout.split('\n').slice(1, 3)).toEqual(['1. This Is Amazing Grace  bar 1  98 BPM  4/4  pad in G', '2. Goodness of God  bar 81  63 BPM  4/4  pad in A']);
    const root = await readSet(setPath(workspace));
    const names = elements(element(root, 'LiveSet', 'Locators', 'Locators'), 'Locator').map((locator) => value(locator, 'Name'));
    expect(names.filter((name) => name.endsWith(' - Pad'))).toEqual(['1 - Pad', '2 - Pad']);
    expect(existsSync(join(projectFolder(workspace), 'Songs/_pads/G.wav'))).toBe(true);
    expect(existsSync(join(projectFolder(workspace), 'Songs/_pads/A.wav'))).toBe(true);
  });

  it('puts a pad after the song --pad names, in the next song\'s key, and prints "pad in <key>" after it', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);

    const result = await run(['grace', 'goodness', '--pad', '1', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [`${DATE} Sunday`, '1. This Is Amazing Grace  bar 1  98 BPM  4/4  pad in A', '2. Goodness of God  bar 81  63 BPM  4/4', setPath(workspace), noTemplateLine(workspace), ''].join('\n'),
    );
    const root = await readSet(setPath(workspace));
    const pads = elements(element(root, 'LiveSet', 'Locators', 'Locators'), 'Locator').filter((locator) => value(locator, 'Name') === '1 - Pad');
    expect(pads.map((locator) => value(locator, 'Time'))).toEqual(['260']);
  });

  it('puts a pad in the key --pad <n>=<key> gives it, whatever the next song\'s key, and prints "pad in <key>"', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'G', 120);
    await addPad(workspace, 'A', 120);

    const result = await run(['grace', 'goodness', '--pad', '1=G', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[1]).toBe('1. This Is Amazing Grace  bar 1  98 BPM  4/4  pad in G');
    expect(existsSync(join(projectFolder(workspace), 'Songs/_pads/G.wav'))).toBe(true);
    expect(existsSync(join(projectFolder(workspace), 'Songs/_pads/A.wav'))).toBe(false);
  });

  it('puts a pad after the last song --pad names, in its own key, and prints "pad in <key>" after it', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);
    await addPad(workspace, 'D', 120);

    const result = await run(['great are', 'grace', 'goodness', '--pad', '3', '--date', DATE, ...paths(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[3]).toBe('3. Goodness of God  bar 162  63 BPM  4/4  pad in A');
    const root = await readSet(setPath(workspace));
    const pads = elements(element(root, 'LiveSet', 'Locators', 'Locators'), 'Locator').filter((locator) => ['3 - Pad', '3 - Pad Out'].includes(value(locator, 'Name')));
    expect(pads.map((locator) => value(locator, 'Time'))).toEqual(['877', '937']);
    expect(parseSet(locatorList(root)).warnings).toEqual([]);
  });

  it.each([
    { value: '1=H', problem: '--pad 1=H: "H" is not a key. A key is a note name, A to G, then # or b, then m for minor: G, F#, Bb, Em.' },
    { value: '1=', problem: '--pad 1= names no key after "=". A key is a note name, A to G, then # or b, then m for minor: G, F#, Bb, Em.' },
    { value: '1=Gmaj', problem: '--pad 1=Gmaj: "Gmaj" is not a key. A key is a note name, A to G, then # or b, then m for minor: G, F#, Bb, Em.' },
  ])('stops with a usage message and writes nothing on --pad $value', async ({ value, problem }) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);

    const result = await run(['grace', 'goodness', '--pad', value, '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('reads the pads from the folder --pads names, resolved against the folder the command is run from', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120, { folder: join(workspace.dir, 'Pads') });

    const result = await run(['grace', 'goodness', '--pad', '1', '--pads', 'Pads', '--date', DATE, ...paths(workspace)], workspace.dir);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[1]).toBe('1. This Is Amazing Grace  bar 1  98 BPM  4/4  pad in A');
    expect(existsSync(join(projectFolder(workspace), 'Songs/_pads/A.wav'))).toBe(true);
  });

  it('takes --gap for a song, which changes nothing without --plan: a gap is what follows a song with no other transition', async () => {
    const workspace = await createWorkspace();
    const other = await createWorkspace();

    const result = await run(['grace', 'goodness', '--gap', '1', '--date', DATE, ...paths(workspace)]);
    const without = await run(['grace', 'goodness', '--date', DATE, ...paths(other)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[1]).toBe('1. This Is Amazing Grace  bar 1  98 BPM  4/4  gap');
    // The set's path and the lights step's line each name a folder of the workspace.
    expect(result.stdout.replaceAll(workspace.dir, '')).toBe(without.stdout.replaceAll(other.dir, ''));
  });

  it.each([
    { flags: ['--gap', '1', '--overlap', '1'], problem: 'Song 1 has both --gap and --overlap. Give each song change one transition.' },
    { flags: ['--gap', '1', '--pad', '1'], problem: 'Song 1 has both --gap and --pad. Give each song change one transition.' },
    { flags: ['--gap', '0'], problem: '--gap must name a song by its position, a whole number from 1 to 2, not "0".' },
    { flags: ['--gap', '3'], problem: '--gap must name a song by its position, a whole number from 1 to 2, not "3".' },
  ])('stops with a usage message and writes nothing on $flags', async ({ flags, problem }) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);

    const result = await run(['grace', 'goodness', ...flags, '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('stops with a usage message and writes nothing when one song change gets both --overlap and --pad', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);

    const result = await run(['grace', 'goodness', '--pad', '1', '--overlap', '1', '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^Song 1 has both --overlap and --pad\. Give each song change one transition\.\n\nUsage:/);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it.each([
    { values: ['1=G', '1=A'], problem: 'Song 1 has --pad twice, "1=G" and "1=A". Give each song change one transition.' },
    { values: ['1', '1=A'], problem: 'Song 1 has --pad twice, "1" and "1=A". Give each song change one transition.' },
    { values: ['1', '1'], problem: 'Song 1 has --pad twice, "1" and "1". Give each song change one transition.' },
  ])('stops with a usage message and writes nothing when --pad names one song twice, as --pad $values.0 --pad $values.1', async ({ values, problem }) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'G', 30);
    await addPad(workspace, 'A', 30);

    const result = await run(['grace', 'goodness', ...values.flatMap((value) => ['--pad', value]), '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('gives a --pad value its own problem before the song it repeats, on --pad 1 --pad 1=H', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);

    const result = await run(['grace', 'goodness', '--pad', '1', '--pad', '1=H', '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    const problem = '--pad 1=H: "H" is not a key. A key is a note name, A to G, then # or b, then m for minor: G, F#, Bb, Em.';
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('documents --pad and --pads in the usage text', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/\[--pad <n>\[=<key>\] \.\.\.\] \[--pads <folder>\]/);
    expect(result.stderr).toMatch(/^--pad n puts a pad after song n/m);
    expect(result.stderr).toMatch(/^--pad n=<key> gives the pad its own key/m);
    expect(result.stderr).toMatch(/--pad on the last song/);
    expect(result.stderr).toMatch(/^--pads defaults to <library>\/_pads/m);
  });

  it("says in the usage text where a pad starts, how long its Pad section lasts, and how it fades in and out, after the last song too", async () => {
    const workspace = await createWorkspace();

    const result = await run(['--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(unwrapped(result.stderr)).toContain(
      "--pad n puts a pad after song n: the pad file in the next song's key plays on the template's PAD track from song n's Ending, under its last bars, through a 60-second Pad section after its audio ends,",
    );
    expect(unwrapped(result.stderr)).toContain(
      "The pad comes in with the file's own swell, played from late enough in the file that the swell ends where the Pad section starts, keeps sounding under the next song's Count Off, and fades out over the first 2 bars of its Intro, all in one clip.",
    );
    expect(unwrapped(result.stderr)).toContain("Song n must have a locator named Ending, and the pad file must last past the clip's end by 20 seconds, the file's own fade-out.");
    expect(unwrapped(result.stderr)).toContain(
      "--pad on the last song puts the pad after it, in its own key, with the click back at its starting tempo and meter. It starts on the song's Ending like any pad. After its 60-second Pad section, a Pad Out section fades it out over 4 bars, and Live stops at its end, so a loop on the Pad holds no fade.",
    );
  });

  it('documents --overlap in the usage text', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/\[--overlap <n> \.\.\.\]/);
    expect(result.stderr).toMatch(/^--overlap n overlaps song n into the next one/m);
    expect(result.stderr).toMatch(/n counts the songs from 1/);
  });

  it("says in the usage text that an overlap's ringing stems fade out over the first 2 bars of the next song's Intro", async () => {
    const workspace = await createWorkspace();

    const result = await run(['--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(unwrapped(result.stderr)).toContain(
      "--overlap n overlaps song n into the next one: the next song's Count Off starts on song n's Ending, where song n's click and guide stop. Its other stems ring on and fade out over the first 2 bars of the next song's Intro, the first section after its Count Off, and a stem that ends before then keeps its own end.",
    );
  });

  it('prints every problem on its own line, exits non-zero and writes nothing when the songs have problems', async () => {
    const workspace = await createWorkspace();
    // Two stems renamed in Live to names the map does not list.
    const renames = [
      ['Tambourine 1', 'Banjo'],
      ['Rhodes', 'Kazoo'],
    ] as const;
    for (const [from, to] of renames) {
      await editSongTrack(workspace, GOODNESS, from, (text) =>
        text.replace(`<EffectiveName Value="${from}" />`, `<EffectiveName Value="${to}" />`).replace(`<UserName Value="${from}" />`, `<UserName Value="${to}" />`),
      );
    }

    const result = await run([GOODNESS, '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      [
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Banjo".',
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Kazoo".',
        '',
      ].join('\n'),
    );
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('stops with a usage message and writes nothing when no song is named', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/^Name at least one song\.\n\nUsage:/);
    expect(result.stderr).toMatch(/^ {2}pnpm build-set <song> .*\[--replace <set folder>\]/m);
    expect(unwrapped(result.stderr)).toContain('--replace <set folder> replaces the set folder for the date when it already exists; without it, the build stops.');
    expect(unwrapped(result.stderr)).toContain(
      'Its value is that set folder, <output root>/<date> <weekday>, as the last line of --list and --plan --list prints it, and a relative one resolves as --output-root does. A --replace that names any other folder, or a second --replace, is a usage error, for the build, --list and --plan --list alike.',
    );
    expect(unwrapped(result.stderr)).toContain(
      "A song's whole folder name, in any letter case, names that folder even when longer folder names hold it, as a Finder copy's does.",
    );
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('stops on a set folder that already exists, and replaces it with --replace naming that set folder', async () => {
    const workspace = await createWorkspace();
    const args = ['grace', '--date', DATE, ...paths(workspace)];
    expect((await run(args)).code).toBe(0);
    await writeFile(join(projectFolder(workspace), 'built before.txt'), 'the set built before\n');

    const again = await run(args);

    expect(again.code).toBe(1);
    expect(again.stdout).toBe('');
    expect(again.stderr).toBe(`${projectFolder(workspace)} already exists. Build with --replace "${projectFolder(workspace)}" to replace it.\n`);

    const replaced = await run([...args, '--replace', projectFolder(workspace)]);

    expect(replaced.stderr).toBe('');
    expect(replaced.code).toBe(0);
    expect(replaced.stdout.trim().split('\n').slice(-2)).toEqual([setPath(workspace), noTemplateLine(workspace)]);
    expect(existsSync(join(projectFolder(workspace), 'built before.txt'))).toBe(false);
  });

  // setlist-controller#230: --replace names the set folder it replaces, so a command whose --replace names another set
  // folder than the one it would write stops before it reads or writes anything, whatever composed it.
  describe('--replace <set folder>', () => {
    const NOVEMBER_1 = '2026-11-01';
    const NOVEMBER_8 = '2026-11-08';
    // The fix a usage problem on --replace names: the listing without --replace, whose last line names the set folder.
    // It gives no --replace to copy, since a copied one would replace the folder with no question asked (#230 review 1
    // finding 1).
    const RELIST = 'Run --list, or --plan --list, without --replace: its last line names the set folder for the date when it already exists.';

    // A set folder built before for November 1, with a file in it, so a replace would show as the file gone.
    async function builtBefore(workspace: Workspace): Promise<string> {
      const folder = projectFolder(workspace, NOVEMBER_1);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'built before.txt'), 'the set built before\n');
      return folder;
    }

    // Review 10 finding 1's case: the date is November 1, and --replace names the November 8 set folder.
    it('stops with a usage message, exit 2, and writes nothing when --replace names the set folder for another date', async () => {
      const workspace = await createWorkspace();
      const folder = await builtBefore(workspace);
      const other = projectFolder(workspace, NOVEMBER_8);
      const before = await snapshotFolder(workspace.dir);

      const result = await run(['grace', '--date', NOVEMBER_1, ...paths(workspace), '--replace', other]);

      expect(result.code).toBe(2);
      expect(result.stdout).toBe('');
      const problem = `--replace names ${other}, which is not the set folder for this command's date and output root. ${RELIST}`;
      expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
      // The problem, before the usage text, which quotes `--replace "<folder>"` with a placeholder and names no folder.
      expect(result.stderr.split('\n\nUsage:')[0]).not.toContain('--replace "');
      expect(await snapshotFolder(workspace.dir)).toEqual(before);
      expect(await readFile(join(folder, 'built before.txt'), 'utf8')).toBe('the set built before\n');
    });

    it('stops with a usage message, exit 2, and writes nothing when --replace names the set folder for the date under another output root', async () => {
      const workspace = await createWorkspace();
      const folder = await builtBefore(workspace);
      const other = join(workspace.dir, 'Other Sets', `${NOVEMBER_1} Sunday`);
      const before = await snapshotFolder(workspace.dir);

      const result = await run(['grace', '--date', NOVEMBER_1, ...paths(workspace), '--replace', other]);

      expect(result.code).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.startsWith(`--replace names ${other}, which is not the set folder for this command's date and output root. ${RELIST}\n\nUsage:`), result.stderr).toBe(true);
      expect(result.stderr).not.toContain(folder);
      expect(await snapshotFolder(workspace.dir)).toEqual(before);
    });

    it('stops with a usage message, exit 2, and writes nothing on two --replace flags, even when the last names the set folder', async () => {
      const workspace = await createWorkspace();
      const folder = await builtBefore(workspace);
      const before = await snapshotFolder(workspace.dir);

      const result = await run(['grace', '--date', NOVEMBER_1, ...paths(workspace), '--replace', projectFolder(workspace, NOVEMBER_8), '--replace', folder]);

      expect(result.code).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.startsWith(`--replace is given 2 times. ${RELIST}\n\nUsage:`), result.stderr).toBe(true);
      // The problem, before the usage text, which quotes `--replace "<folder>"` with a placeholder and names no folder.
      expect(result.stderr.split('\n\nUsage:')[0]).not.toContain('--replace "');
      expect(await snapshotFolder(workspace.dir)).toEqual(before);
    });

    it('stops with a usage message, exit 2, on a --replace with no set folder after it', async () => {
      const workspace = await createWorkspace();
      await builtBefore(workspace);
      const before = await snapshotFolder(workspace.dir);

      const result = await run(['grace', '--date', NOVEMBER_1, ...paths(workspace), '--replace']);

      expect(result.code).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/--replace[\s\S]*\n\nUsage:/);
      expect(await snapshotFolder(workspace.dir)).toEqual(before);
    });

    it('resolves a relative --replace against the folder the command is run from, as it resolves --output-root, and replaces the set folder it names', async () => {
      const workspace = await createWorkspace();
      const folder = await builtBefore(workspace);

      const result = await run(['grace', '--date', NOVEMBER_1, '--library', 'library', '--output-root', 'Sets', '--set-manifest', 'set-manifest.json', '--show-folder', 'ETC', '--replace', `Sets/${NOVEMBER_1} Sunday`], workspace.dir);

      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(result.stdout.trim().split('\n').slice(-2)).toEqual([setPath(workspace, NOVEMBER_1), noTemplateLine(workspace)]);
      expect(existsSync(join(folder, 'built before.txt'))).toBe(false);
    });

    it('builds when --replace names the set folder it writes and that folder does not exist yet', async () => {
      const workspace = await createWorkspace();

      const result = await run(['grace', '--date', NOVEMBER_1, ...paths(workspace), '--replace', projectFolder(workspace, NOVEMBER_1)]);

      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(existsSync(setPath(workspace, NOVEMBER_1))).toBe(true);
    });

    it('stops --list with a usage message, exit 2, and prints no song line when --replace names another set folder', async () => {
      const workspace = await createWorkspace();
      const folder = await builtBefore(workspace);
      const other = projectFolder(workspace, NOVEMBER_8);
      const before = await snapshotFolder(workspace.dir);

      const result = await run(['--list', '--library', workspace.library, '--date', NOVEMBER_1, '--output-root', workspace.outputRoot, '--replace', other]);

      expect(result.code).toBe(2);
      expect(result.stdout).toBe('');
      const problem = `--replace names ${other}, which is not the set folder for this command's date and output root. ${RELIST}`;
      expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
      expect(result.stderr).not.toContain(folder);
      expect(await snapshotFolder(workspace.dir)).toEqual(before);
    });

    it('stops --list with a usage message, exit 2, on two --replace flags', async () => {
      const workspace = await createWorkspace();
      const folder = await builtBefore(workspace);

      const result = await run(['--list', '--library', workspace.library, '--date', NOVEMBER_1, '--output-root', workspace.outputRoot, '--replace', folder, '--replace', folder]);

      expect(result.code).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.startsWith(`--replace is given 2 times. ${RELIST}\n\nUsage:`), result.stderr).toBe(true);
      // The problem, before the usage text, which quotes `--replace "<folder>"` with a placeholder and names no folder.
      expect(result.stderr.split('\n\nUsage:')[0]).not.toContain('--replace "');
    });
  });

  it.each([
    { template: 'a relative --template', flags: (workspace: Workspace) => ['--template', relative(workspace.dir, workspace.template)] },
    { template: 'the default template inside the library', flags: () => [] },
  ])('resolves a relative --library and --output-root, and $template, against the folder the command is run from', async ({ flags }) => {
    const workspace = await createWorkspace();

    const result = await run(['grace', '--date', DATE, '--library', 'library', ...flags(workspace), '--output-root', 'Sets', '--set-manifest', 'set-manifest.json', '--show-folder', 'ETC'], workspace.dir);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split('\n').slice(-2)).toEqual([setPath(workspace), noTemplateLine(workspace)]);
    expect(existsSync(setPath(workspace))).toBe(true);
  });

  it('resolves relative path flags against the folder node runs in when the command runs without pnpm, whatever INIT_CWD an earlier script left', async () => {
    const workspace = await createWorkspace();
    const main = join(REPO_ROOT, 'src/set-builder/main.ts');
    const env = { ...process.env, INIT_CWD: REPO_ROOT, npm_lifecycle_event: 'dev:server' };

    const result = await output(spawn(process.execPath, [main, 'grace', '--date', DATE, '--library', 'library', '--output-root', 'Sets', '--set-manifest', 'set-manifest.json', '--show-folder', 'ETC'], { cwd: workspace.dir, env }));

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split('\n').slice(-2)).toEqual([setPath(workspace), noTemplateLine(workspace)]);
    expect(existsSync(setPath(workspace))).toBe(true);
  });

  it('stops with a usage message and writes nothing on an unknown flag', async () => {
    const workspace = await createWorkspace();

    const result = await run(['grace', '--bogus', ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/--bogus[\s\S]*\n\nUsage:/);
    expect(existsSync(projectFolder(workspace))).toBe(false);
  });

  it('stops with a usage message and writes nothing on a --date that is not a real date', async () => {
    const workspace = await createWorkspace();

    const result = await run(['grace', '--date', '2026-02-30', ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^--date must be a real date written YYYY-MM-DD, not 2026-02-30\.\n\nUsage:/);
    expect(unwrapped(result.stderr)).toContain(
      'The set is written to <output root>/<date> <weekday>/<date> <weekday>.als, such as 2026-10-18 Sunday.',
    );
    expect(existsSync(projectFolder(workspace))).toBe(false);
  });

  it.each([
    { value: '0', problem: '--overlap must name a song by its position, a whole number from 1 to 3, not "0".' },
    { value: '4', problem: '--overlap must name a song by its position, a whole number from 1 to 3, not "4".' },
    { value: 'two', problem: '--overlap must name a song by its position, a whole number from 1 to 3, not "two".' },
    { value: '3', problem: '--overlap 3 names the last song, which has no song after it to overlap into.' },
  ])('stops with a usage message and writes nothing on --overlap $value in a 3-song build', async ({ value, problem }) => {
    const workspace = await createWorkspace();

    const result = await run(['grace', 'great are', 'goodness', '--overlap', value, '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it.each(['0', '3', 'two', '1.0', '=G', '9=H'])('stops with a usage message and writes nothing on --pad %s in a 2-song build', async (value) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);

    const result = await run(['grace', 'goodness', '--pad', value, '--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    const problem = `--pad must name a song by its position, a whole number from 1 to 2, not "${value}".`;
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('prints the error without a stack, exits 1 and writes nothing when the build throws on a template it cannot read', async () => {
    const workspace = await createWorkspace();
    const template = join(workspace.dir, 'none.als');

    const result = await run(['grace', '--date', DATE, '--library', workspace.library, '--template', template, '--output-root', workspace.outputRoot, '--set-manifest', workspace.setManifest, '--show-folder', workspace.showFolder]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('ENOENT');
    expect(result.stderr).toContain(template);
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(existsSync(projectFolder(workspace))).toBe(false);
  });

  // The command reads config/stem-map.json beside its own source, so each case runs a copy of src/ in the workspace
  // with its own config/ beside it. node finds the packages up the tree, in the repo's node_modules.
  it.each([
    {
      name: 'malformed, with a trailing comma',
      stemMap: async (config: string) => {
        const text = await readFile(join(REPO_ROOT, 'config/stem-map.json'), 'utf8');
        await writeFile(join(config, 'stem-map.json'), text.replace(/\]\s*\}\s*$/, '],\n}\n'));
      },
    },
    { name: 'missing', stemMap: async () => {} },
    { name: 'a list at the top level', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '[["BGVS"]]\n') },
    { name: 'a number at the top level', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '42\n') },
    { name: 'null at the top level', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), 'null\n') },
    { name: 'a string at the top level', stemMap: async (config: string) => writeFile(join(config, 'stem-map.json'), '"VOX"\n') },
    {
      name: 'a group written as a string instead of a list',
      group: 'VOX',
      stemMap: async (config: string) => {
        const text = await readFile(join(REPO_ROOT, 'config/stem-map.json'), 'utf8');
        const map = JSON.parse(text) as Record<string, unknown>;
        await writeFile(join(config, 'stem-map.json'), JSON.stringify({ ...map, VOX: 'BGVS' }, null, 2));
      },
    },
    {
      name: 'a group whose list holds a number',
      group: 'VOX',
      stemMap: async (config: string) => {
        const text = await readFile(join(REPO_ROOT, 'config/stem-map.json'), 'utf8');
        const map = JSON.parse(text) as Record<string, unknown>;
        await writeFile(join(config, 'stem-map.json'), JSON.stringify({ ...map, VOX: ['BGVS', 1] }, null, 2));
      },
    },
  ])('prints one problem line without a stack, exits 1 and writes nothing when config/stem-map.json is $name', async ({ stemMap, group }) => {
    const workspace = await createWorkspace();
    const app = join(workspace.dir, 'app');
    await cp(join(REPO_ROOT, 'src'), join(app, 'src'), { recursive: true });
    await mkdir(join(app, 'config'));
    await stemMap(join(app, 'config'));

    const result = await output(spawn(process.execPath, [join(app, 'src/set-builder/main.ts'), 'grace', '--date', DATE, ...paths(workspace)], { cwd: workspace.dir }));

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(result.stderr.trimEnd().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain('config/stem-map.json');
    if (group !== undefined) expect(result.stderr).toContain(group);
    expect(existsSync(projectFolder(workspace))).toBe(false);
  });
});

// The listing's lines, each split into its short name as printed, quotes included, its key or `no key`, and its folder.
function listedLines(stdout: string): { shortName: string; key: string; folder: string }[] {
  return stdout
    .trimEnd()
    .split('\n')
    .map((line) => {
      const parts = /^("[^"]*"|\S+) {2}(no key|\S+) {2}(.+)$/.exec(line);
      if (!parts) throw new Error(`"${line}" is no listing line`);
      return { shortName: parts[1] ?? '', key: parts[2] ?? '', folder: parts[3] ?? '' };
    });
}

describe('pnpm build-set --list', () => {
  it("prints each song folder of the library with its short name and key, in the build's order, and writes nothing", async () => {
    const workspace = await createWorkspace();
    const before = await snapshotFolder(workspace.dir);

    // With HOME in the workspace, the snapshot holds the command's default output root, ~/Music/Ableton/Sets, too.
    const result = await run(['--list', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        'goodness  A  Goodness of God-Victory-A-63.00bpm',
        'lord  D  Great Are You Lord-All Sons & Daughters Live-D-72.00bpm',
        'grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm',
        'trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm',
        '',
      ].join('\n'),
    );
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });

  it('prints for each song folder a short name that matches that one folder through matchSongs, the whole folder name, quoted, for two downloads of one title', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, 'This Is Amazing Grace-The Ascension-E-98.00bpm');
    await copySongAs(workspace, GRACE, 'Grace Acoustic-98.00bpm');
    await copySongAs(workspace, GRACE, 'Grace Live-The Ascension-H-98.00bpm');

    const result = await run(['--list', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const lines = listedLines(result.stdout);
    expect(lines.map(({ folder }) => folder)).toEqual([
      'Goodness of God-Victory-A-63.00bpm',
      'Grace Acoustic-98.00bpm',
      'Grace Live-The Ascension-H-98.00bpm',
      'Great Are You Lord-All Sons & Daughters Live-D-72.00bpm',
      'This Is Amazing Grace-The Ascension-D-98.00bpm',
      'This Is Amazing Grace-The Ascension-E-98.00bpm',
      'Trust In God-CAN YOU IMAGINE--A-74.00bpm',
    ]);
    for (const { shortName, folder } of lines) {
      const found = await matchSongs({ library: workspace.library }, [shortName.replace(/^"(.*)"$/, '$1')]);
      expect(found, shortName).toEqual({ ok: true, matches: [{ ok: true, folder }] });
    }
    expect(lines.filter(({ folder }) => folder.startsWith('This Is Amazing Grace')).map(({ shortName }) => shortName)).toEqual([
      '"This Is Amazing Grace-The Ascension-D-98.00bpm"',
      '"This Is Amazing Grace-The Ascension-E-98.00bpm"',
    ]);
  });

  it("prints a folder's whole name, quoted, as its short name beside a Finder duplicate whose name holds it, and that name matches it through matchSongs", async () => {
    const workspace = await createWorkspace();
    const copy = `${GRACE} copy`;
    await copySongAs(workspace, GRACE, copy);

    const result = await run(['--list', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const lines = listedLines(result.stdout);
    for (const { shortName, folder } of lines) {
      const found = await matchSongs({ library: workspace.library }, [shortName.replace(/^"(.*)"$/, '$1')]);
      expect(found, shortName).toEqual({ ok: true, matches: [{ ok: true, folder }] });
    }
    expect(lines.filter(({ folder }) => folder.startsWith(GRACE)).map(({ shortName }) => shortName)).toEqual([`"${GRACE}"`, `"${copy}"`]);
  });

  it("prints a short name that matches its own folder when its title holds two spaces where another folder's title holds one", async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, 'Holy  Spirit-Bethel-A-70.00bpm');
    await copySongAs(workspace, GRACE, 'Holy Spirit-Francesca Battistelli-D-70.00bpm');

    const result = await run(['--list', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    for (const { shortName, folder } of listedLines(result.stdout)) {
      const found = await matchSongs({ library: workspace.library }, [shortName.replace(/^"(.*)"$/, '$1')]);
      expect(found, shortName).toEqual({ ok: true, matches: [{ ok: true, folder }] });
    }
  });

  // "+" names this folder alone, and so does "& anointed", since the fixture's "All Sons & Daughters" holds "&" too; no
  // whole word or pair of words does, so the short name is the whole folder name.
  it.each(['Holy + Anointed One', 'Holy & Anointed One'])('prints no punctuation mark as a word of a short name, alone or in a pair, for %s', async (title) => {
    const workspace = await createWorkspace();
    const folder = `${title}-Worship Night-A-70.00bpm`;
    for (const name of [folder, 'Holy One-Worship Night-A-70.00bpm', 'Anointed One-Worship Night-A-70.00bpm']) await copySongAs(workspace, GRACE, name);

    const result = await run(['--list', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toContain(`"${folder}"  A  ${folder}`);
  });

  it("prints a short name without the punctuation at a word's edges, and a pair with the title's own punctuation, each matching its own folder", async () => {
    const workspace = await createWorkspace();
    // --list reads folder names only, so a library of empty folders is enough.
    const library = join(workspace.dir, 'punctuation');
    const folders = [
      '10,000 Reasons (Bless the Lord)-Matt Redman-G-73.00bpm',
      'Great Are You Lord-All Sons & Daughters Live-D-72.00bpm',
      'Holy Spirit-Francesca Battistelli-E-68.00bpm',
      'Holy, Holy, Holy-Traditional-D-70.00bpm',
      'Raise A Hallelujah (Live)-Bethel-C-82.00bpm',
    ];
    for (const folder of folders) await mkdir(join(library, folder), { recursive: true });

    const result = await run(['--list', '--library', library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        'bless  G  10,000 Reasons (Bless the Lord)-Matt Redman-G-73.00bpm',
        'you  D  Great Are You Lord-All Sons & Daughters Live-D-72.00bpm',
        'spirit  E  Holy Spirit-Francesca Battistelli-E-68.00bpm',
        '"holy, holy"  D  Holy, Holy, Holy-Traditional-D-70.00bpm',
        'hallelujah  C  Raise A Hallelujah (Live)-Bethel-C-82.00bpm',
        '',
      ].join('\n'),
    );
    for (const { shortName, folder } of listedLines(result.stdout)) {
      const found = await matchSongs({ library }, [shortName.replace(/^"(.*)"$/, '$1')]);
      expect(found, shortName).toEqual({ ok: true, matches: [{ ok: true, folder }] });
    }
  });

  it('prints "no key" for a song folder whose name has no key token, and for one whose key token is no note name', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, 'Grace Acoustic-98.00bpm');
    await copySongAs(workspace, GRACE, 'Grace Live-The Ascension-H-98.00bpm');

    const result = await run(['--list', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    // "live" is part of Great Are You Lord's folder name too, so the second copy takes a pair of its title's words.
    expect(result.stdout.split('\n').slice(1, 3)).toEqual([
      'acoustic  no key  Grace Acoustic-98.00bpm',
      '"grace live"  no key  Grace Live-The Ascension-H-98.00bpm',
    ]);
  });

  it('lists neither _pads nor the --pads folder when it sits in the library, both resolved against the folder the command is run from', async () => {
    const workspace = await createWorkspace();
    await addPad(workspace, 'A', 4);
    await addPad(workspace, 'G', 4, { folder: join(workspace.library, 'Ambient Pads') });

    const result = await run(['--list', '--library', 'library', '--pads', 'library/Ambient Pads'], workspace.dir, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(listedLines(result.stdout).map(({ folder }) => folder)).toEqual([GOODNESS, GREAT_ARE, GRACE, TRUST]);
  });

  // The Mac's disk opens a folder by its name in any letter case, so _Pads is the folder the build reads its pads from,
  // _Template the one it reads the template from, and "library/ambient pads" names the Ambient Pads folder. --list reads
  // folder names only, so on a disk that minds letter case the --pads path need not exist.
  it('lists neither _template, _pads nor the --pads folder in the library when each is named in another letter case', async () => {
    const workspace = await createWorkspace();
    await rename(join(workspace.library, '_template'), join(workspace.library, '_Template'));
    await mkdir(join(workspace.library, '_Pads'));
    await mkdir(join(workspace.library, 'Ambient Pads'));

    const result = await run(['--list', '--library', 'library', '--pads', 'library/ambient pads'], workspace.dir, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(listedLines(result.stdout).map(({ folder }) => folder)).toEqual([GOODNESS, GREAT_ARE, GRACE, TRUST]);
  });

  // The --pads folder's parent is the library in another letter case: "LIBRARY/Ambient Pads" names the library's Ambient
  // Pads folder on the Mac's disk, so it is no song either.
  it('lists no --pads folder in the library when the library part of its path is in another letter case', async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace.library, 'Ambient Pads'));

    const result = await run(['--list', '--library', 'library', '--pads', 'LIBRARY/Ambient Pads'], workspace.dir, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(listedLines(result.stdout).map(({ folder }) => folder)).toEqual([GOODNESS, GREAT_ARE, GRACE, TRUST]);
  });

  it('lists a folder whose name only holds a reserved name, such as _pads old, as a song', async () => {
    const workspace = await createWorkspace();
    for (const folder of ['_pads old', '_template old']) await mkdir(join(workspace.library, folder));

    const result = await run(['--list', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const folders = listedLines(result.stdout).map(({ folder }) => folder);
    expect(folders).toHaveLength(6);
    for (const folder of ['_pads old', '_template old', GOODNESS, GREAT_ARE, GRACE, TRUST]) expect(folders).toContain(folder);
  });

  it('stops with a usage message when a song name is given beside --list', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--list', 'grace', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    const problem = '--list lists the library\'s songs and takes no song name, not "grace".';
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
  });

  it.each([
    { flag: 'overlap', args: ['--overlap', '1'] },
    { flag: 'gap', args: ['--gap', '1'] },
    { flag: 'pad', args: ['--pad', '1'] },
    { flag: 'template', args: ['--template', 'template.als'] },
  ])('stops with a usage message and writes nothing when --$flag is given beside --list', async ({ flag, args }) => {
    const workspace = await createWorkspace();
    const before = await snapshotFolder(workspace.dir);

    const result = await run(['--list', ...args, '--library', 'library'], workspace.dir, { HOME: workspace.dir });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    const problem = `--list takes only --library, --pads, --date, --replace and --output-root, not --${flag}.`;
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });

  // The listing of the workspace's library, as the first test of this describe expects it.
  const LISTING = [
    'goodness  A  Goodness of God-Victory-A-63.00bpm',
    'lord  D  Great Are You Lord-All Sons & Daughters Live-D-72.00bpm',
    'grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm',
    'trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm',
  ];

  it('prints, after the song lines, that the set folder for the date already exists under --output-root and the build stops on it, exit 0, and writes nothing', async () => {
    const workspace = await createWorkspace();
    await mkdir(projectFolder(workspace), { recursive: true });
    const before = await snapshotFolder(workspace.dir);

    const result = await run(['--list', '--library', workspace.library, '--date', DATE, '--output-root', workspace.outputRoot]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe([...LISTING, `${projectFolder(workspace)} already exists. The build stops on it unless --replace "${projectFolder(workspace)}" replaces it.`, ''].join('\n'));
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });

  it('prints, after the song lines, that --replace replaces the set folder for the date when it names that folder, exit 0, and writes nothing', async () => {
    const workspace = await createWorkspace();
    await mkdir(projectFolder(workspace), { recursive: true });
    const before = await snapshotFolder(workspace.dir);

    const result = await run(['--list', '--library', workspace.library, '--date', DATE, '--output-root', workspace.outputRoot, '--replace', projectFolder(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe([...LISTING, `${projectFolder(workspace)} already exists, and --replace replaces it.`, ''].join('\n'));
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });

  it.each([
    { with: 'no --replace', flags: () => [] },
    { with: '--replace naming the set folder for the date', flags: (workspace: Workspace) => ['--replace', projectFolder(workspace)] },
  ])('prints the listing it prints today, byte for byte, when there is no set folder for the date, with $with', async ({ flags }) => {
    const workspace = await createWorkspace();
    // A set folder for another date is no set folder for this one.
    await mkdir(projectFolder(workspace, '2026-10-25'), { recursive: true });
    const before = await snapshotFolder(workspace.dir);

    const result = await run(['--list', '--library', workspace.library, '--date', DATE, '--output-root', workspace.outputRoot, ...flags(workspace)]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe([...LISTING, ''].join('\n'));
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });

  it("looks for the set folder for the default date under the build's default output root when neither --date nor --output-root is given", async () => {
    const workspace = await createWorkspace();
    // Worked out from the calendar, not from the command's own defaultSetDate: today when today is Sunday, otherwise the
    // coming Sunday. HOME is the workspace, so the default output root, ~/Music/Ableton/Sets, is inside it.
    const today = new Date();
    const sunday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + ((7 - today.getDay()) % 7)));
    const folder = join(workspace.dir, 'Music/Ableton/Sets', `${sunday.toISOString().slice(0, 10)} Sunday`);
    await mkdir(folder, { recursive: true });

    const result = await run(['--list', '--library', workspace.library], REPO_ROOT, { HOME: workspace.dir });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe([...LISTING, `${folder} already exists. The build stops on it unless --replace "${folder}" replaces it.`, ''].join('\n'));
  });

  it('resolves a relative --output-root against the folder the command is run from', async () => {
    const workspace = await createWorkspace();
    await mkdir(projectFolder(workspace), { recursive: true });

    const result = await run(['--list', '--library', 'library', '--date', DATE, '--output-root', 'Sets'], workspace.dir);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toBe([...LISTING, `${projectFolder(workspace)} already exists. The build stops on it unless --replace "${projectFolder(workspace)}" replaces it.`, ''].join('\n'));
  });

  it('stops with a usage message and writes nothing when --date is no real date', async () => {
    const workspace = await createWorkspace();
    const before = await snapshotFolder(workspace.dir);

    const result = await run(['--list', '--library', workspace.library, '--date', '2026-02-30', '--output-root', workspace.outputRoot]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    const problem = '--date must be a real date written YYYY-MM-DD, not 2026-02-30.';
    expect(result.stderr.startsWith(`${problem}\n\nUsage:`), result.stderr).toBe(true);
    expect(await snapshotFolder(workspace.dir)).toEqual(before);
  });

  it('prints the problem alone and exits 1 when the library cannot be read, with no line about a set folder for the date that exists', async () => {
    const workspace = await createWorkspace();
    const library = join(workspace.dir, 'no library');
    await mkdir(projectFolder(workspace), { recursive: true });

    const result = await run(['--list', '--library', library, '--date', DATE, '--output-root', workspace.outputRoot]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Cannot read the song library ${library}.\n`);
  });

  it('documents --list in the usage text', async () => {
    const workspace = await createWorkspace();

    const result = await run(['--date', DATE, ...paths(workspace)]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/^ {2}pnpm build-set --list \[--library <folder>\] \[--pads <folder>\] \[--date YYYY-MM-DD\] \[--replace <set folder>\] \[--output-root <folder>\]$/m);
    expect(unwrapped(result.stderr)).toContain(
      '--list prints each song folder in the library on its own line, in the order the build matches them: a short name that names that one folder, in quotes when it holds anything but lowercase letters and digits, the song\'s key as its folder name writes it (Em stays Em), or "no key" when the name has no key that is a note name, and the folder name.',
    );
    expect(unwrapped(result.stderr)).toContain('"no key" means a pad cannot take its key from that song by default.');
    expect(unwrapped(result.stderr)).toContain(
      '--list reads folder names only and writes nothing. When the set folder for the date already exists under the output root, a last line after the songs says so, as --plan --list says it: "<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.", or with --replace, "<folder> already exists, and --replace replaces it." That line never sets exit 1.',
    );
    expect(unwrapped(result.stderr)).toContain('It takes no song name, and no flag but --library, --pads, --date, --replace and --output-root.');
  });
});

describe('the usage text on --plan', () => {
  // The usage text, as a build with no song named prints it.
  async function usageText(): Promise<string> {
    const workspace = await createWorkspace();
    const result = await run(['--date', DATE, ...paths(workspace)]);
    expect(result.code).toBe(2);
    return result.stderr;
  }

  it('has a synopsis line for --plan and one for --plan --list, and --gap on the songs synopsis', async () => {
    const usage = await usageText();

    expect(usage).toMatch(/^ {2}pnpm build-set <song> \[<song> \.\.\.\] .*\[--gap <n> \.\.\.\]/m);
    expect(usage).toMatch(/^ {2}pnpm build-set --plan \[--service-type <name or id>\] \[--plan-id <id>\] .*\[--gap <n> \.\.\.\].*\[--replace <set folder>\]/m);
    expect(usage).toMatch(/^ {2}pnpm build-set --plan --list \[--service-type <name or id>\] \[--plan-id <id>\] .*\[--gap <n> \.\.\.\].*\[--replace <set folder>\].*\[--output-root <folder>\]/m);
  });

  it('documents --plan: the songs from the plan for the date, in plan order, each folder by its title and the plan key, and no song name beside it', async () => {
    const usage = unwrapped(await usageText());

    expect(usage).toContain(
      "--plan takes the songs from the Planning Center plan for the set's date instead, in plan order, and a song name beside it is a usage error.",
    );
    expect(usage).toContain(
      "Each plan song's folder is the one whose title, the part of its name before the first hyphen, is the song's title, and whose key is the plan's key for it.",
    );
  });

  it("documents the plan's transition rule, and that a transition flag replaces what the plan gives", async () => {
    const usage = unwrapped(await usageText());

    expect(usage).toContain(
      "An item titled Prayer that is the next item after a song, headers left out, puts a pad after that song in the next song's key, and after the last song in its own key.",
    );
    expect(usage).toContain('A note on a song whose whole text is overlap overlaps it into the next song. Every other song change is a gap.');
    expect(usage).toContain('A transition flag for a song replaces what the plan gives the song change after it.');
  });

  it('documents --gap, which changes nothing without --plan, and names it in the one-transition sentence', async () => {
    const usage = unwrapped(await usageText());

    expect(usage).toMatch(/(^| )--gap n makes the song change after song n a gap, to take back a pad or an overlap the plan gives it\./);
    expect(usage).toContain('Without --plan it changes nothing, since a song with no other transition is followed by a gap.');
    expect(usage).toContain('One song takes one of --overlap, --pad and --gap.');
    expect(usage).not.toContain('One song takes --overlap or --pad, not both.');
  });

  it('documents --service-type and --plan-id, both needing --plan', async () => {
    const usage = unwrapped(await usageText());

    expect(usage).toMatch(/(^| )--service-type names the plan's service type by its name or its id, and defaults to Service\./);
    expect(usage).toContain('--plan-id names the plan by its id when the service type has more than one plan on the date.');
    expect(usage).toContain('--service-type and --plan-id need --plan.');
  });

  it('documents the token file, its mode, and that the token is never typed on the command line', async () => {
    const usage = unwrapped(await usageText());

    expect(usage).toContain(
      '--plan reads the plan with the Planning Center personal access token in ~/.config/setlist-controller/pco.env, or in the file PCO_ENV names, as two lines: PCO_CLIENT_ID=<client id> and PCO_SECRET=<secret>.',
    );
    expect(usage).toContain('The command refuses the file when its group or other users can read it, and chmod 600 <file> fixes that.');
    expect(usage).toContain('The token never goes on the command line.');
    expect(usage).toContain('A value may sit in single or double quotes, and a line may start with export.');
    expect(usage).toContain('Outside quotes, a # after a space or a tab starts a comment, and so does a # at the start of a line.');
    expect(usage).toContain('PCO_ENV may start with ~/ for your home folder.');
    expect(usage).not.toContain('PCO_API_BASE');
    expect(usage).not.toContain('PCO_TIMEOUT_MS');
  });

  it('documents --plan --list: what it prints, that it writes nothing, and the flags it takes', async () => {
    const usage = unwrapped(await usageText());

    expect(usage).toContain(
      '--plan --list prints what the plan resolves to and writes nothing: the set\'s name, then each plan song on its own line with its key in the plan, or "no key", its folder or the problem that leaves it none, and the transition after it with where it comes from (the default, the plan, or the flag that gives it) or its problem, then each item that is no song, from the first song on, with what it does to the set, then the warnings.',
    );
    expect(usage).toContain('It exits 1 when a song or a song change has a problem.');
    expect(usage).toContain(
      'When the set folder for the date already exists under the output root, a last line says so: "<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.", or with --replace, "<folder> already exists, and --replace replaces it." That line never sets exit 1.',
    );
    expect(usage).toContain(
      "When none has, it runs the build's own checks on the songs' folders, with the template, stem map, transitions and pads folder the build would use, prints each problem the build would stop on, on stderr after the listing, and exits 1.",
    );
    expect(usage).not.toContain('It does not check whether the set folder for the date already exists.');
    expect(usage).toContain('--plan --list takes no song name, and no flag but --library, --pads, --template, --date, --service-type, --plan-id, --overlap, --pad, --gap, --replace and --output-root.');
  });

  it("documents the set manifest every build writes, at the server's own default, with no chart for a build by song names", async () => {
    const usage = unwrapped(await usageText());

    expect(usage).toContain(
      "Every build writes the set manifest to --set-manifest <path>, by default ~/Library/Application Support/setlist-controller/set-manifest.json, the server's own default, replacing the last one",
    );
    expect(usage).toContain('A build by song names writes no chart key and no chart text. A build with a problem writes no manifest.');
  });

  it('documents the chart, tempo and meter warnings, which never stop the build', async () => {
    const usage = unwrapped(await usageText());

    expect(usage).toContain('--plan --list warns, after the songs, for a song whose arrangement has no chart text in Planning Center, and for chart text with no chords in square brackets.');
    expect(usage).toContain(
      "A plan build's summary and --plan --list warn, after the songs, when the plan's BPM for a song differs from the BPM its folder name writes, or the plan's meter from the meter the song starts in. A warning never stops the build.",
    );
  });
});
