import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSet } from '../src/server/set-parser.ts';
import { keepReplacedSet } from '../src/set-builder/audio.ts';
import { buildSet } from '../src/set-builder/build-set.ts';
import { editSet } from '../src/set-builder/edit-set.ts';
import { recipePath, SET_RECIPE_FILE, type SetRecipe } from '../src/set-builder/recipe.ts';
import { CHARTS_API } from '../src/shared/routes.ts';
import type { SetCharts, SetManifest } from '../src/shared/set-manifest.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { CHURCH_SHOW, startFakeEos } from './fake-eos.ts';
import { startFakeProPresenter } from './fake-propresenter.ts';
import { loaded, readSetup, startRig, type Rig } from './harness.ts';
import { madeUpChart, readFixtures, startPlanningCenter, type PlanningCenter } from './planning-center-fake.ts';
import {
  addPad,
  addPadTrack,
  addWeeklyShow,
  arrangementClips,
  copySongAs,
  createWorkspace,
  DATE,
  element,
  elements,
  GOODNESS,
  GRACE,
  GREAT_ARE,
  lightsPaths,
  locatorList,
  projectFolder,
  readSet,
  readSetXml,
  readStemMap,
  removeLocator,
  removeWorkspaces,
  REPO_ROOT,
  setPath,
  singleTrack,
  slots,
  snapshotFolder,
  stemOf,
  trackName,
  TRUST,
  value,
  writeConnectionsConfig,
  type Workspace,
} from './set-builder-harness.ts';

const fakes: { close(): Promise<void> }[] = [];
let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await removeWorkspaces();
});

function run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return output(spawn(process.execPath, ['src/set-builder/main.ts', ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } }));
}

function runViaPnpm(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return output(spawn('pnpm', ['--silent', 'build-set', ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } }));
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

const buildPaths = (workspace: Workspace) => [
  '--library',
  workspace.library,
  '--template',
  workspace.template,
  '--output-root',
  workspace.outputRoot,
  '--set-manifest',
  workspace.setManifest,
  '--show-folder',
  workspace.showFolder,
];

async function readRecipeJson(folder: string): Promise<SetRecipe> {
  return JSON.parse(await readFile(recipePath(folder), 'utf8')) as SetRecipe;
}

async function readManifestJson(path: string): Promise<SetManifest> {
  return JSON.parse(await readFile(path, 'utf8')) as SetManifest;
}

async function mutateAlsXml(alsPath: string, edit: (xml: string) => string): Promise<void> {
  const xml = await readSetXml(alsPath);
  const next = edit(xml);
  if (next === xml) throw new Error(`No XML change applied to ${alsPath}`);
  await writeFile(alsPath, gzipSync(next));
}

// Replaces the first (or `occurrence`th, 0-based) locator whose Name equals `from` with `to`.
function renameLocator(xml: string, from: string, to: string, occurrence = 0): string {
  let seen = 0;
  return xml.replaceAll(`<Name Value="${from}" />`, (match) => {
    const replace = seen === occurrence;
    seen += 1;
    return replace ? `<Name Value="${to}" />` : match;
  });
}

// Adds a copy of the locator named `from`, named `to` at `time`.
function addLocator(xml: string, from: string, to: string, time: number): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.replace(new RegExp(`<Locator Id="\\d+">(?:(?!</Locator>)[\\s\\S])*?<Name Value="${escaped}" />[\\s\\S]*?</Locator>`), (block) =>
    `${block}${block.replace(/<Locator Id="\d+">/, '<Locator Id="999">').replace(/<Time Value="[^"]*" \/>/, `<Time Value="${time}" />`).replace(`<Name Value="${from}" />`, `<Name Value="${to}" />`)}`,
  );
}

// Sets the mixer Volume Manual value on the first track (GroupTrack or AudioTrack) with EffectiveName `name`.
function setTrackMixerVolume(xml: string, name: string, volume: string): string {
  const pattern = new RegExp(`(<(?:GroupTrack|AudioTrack) [^>]*>[\\s\\S]*?<EffectiveName Value="${name}" />[\\s\\S]*?<Mixer>[\\s\\S]*?<Volume>[\\s\\S]*?<Manual Value=")[^"]*(")`);
  return xml.replace(pattern, `$1${volume}$2`);
}

// Sets the MainTrack mixer Volume Manual value.
function setMainTrackVolume(xml: string, volume: string): string {
  return xml.replace(/(<MainTrack [^>]*>[\s\S]*?<Mixer>[\s\S]*?<Volume>[\s\S]*?<Manual Value=")[^"]*(")/, `$1${volume}$2`);
}

// Sets SampleVolume on the first AudioClip whose RelativePath equals `relativePath`.
function setClipSampleVolume(xml: string, relativePath: string, volume: string): string {
  const escaped = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(<AudioClip [^>]*>(?:(?!</AudioClip>)[\\s\\S])*?<RelativePath Value="${escaped}" />(?:(?!</AudioClip>)[\\s\\S])*?<SampleVolume Value=")[^"]*(")`);
  return xml.replace(pattern, `$1${volume}$2`);
}

function mixerVolume(root: Awaited<ReturnType<typeof readSet>>, trackTitle: string): string {
  const track = elements(element(root, 'LiveSet', 'Tracks')).find((candidate) => trackName(candidate) === trackTitle);
  if (!track) throw new Error(`No track named ${trackTitle}`);
  return value(track, 'DeviceChain', 'Mixer', 'Volume', 'Manual');
}

function mainTrackVolume(root: Awaited<ReturnType<typeof readSet>>): string {
  return value(root, 'LiveSet', 'MainTrack', 'DeviceChain', 'Mixer', 'Volume', 'Manual');
}

describe('set-recipe.json generation', () => {
  it('saves a valid set-recipe.json beside the built .als for programmatic buildSet calls', async () => {
    const workspace = await createWorkspace();
    const stemMap = await readStemMap();

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap,
      songs: ['grace', 'goodness'],
      date: DATE,
      outputRoot: workspace.outputRoot,
      transitions: { 1: { type: 'overlap' } },
    });

    expect(result.ok).toBe(true);
    const folder = projectFolder(workspace);
    expect(existsSync(recipePath(folder))).toBe(true);
    const recipe = await readRecipeJson(folder);
    expect(recipe).toEqual({
      version: 1,
      date: DATE,
      library: workspace.library,
      template: workspace.template,
      outputRoot: workspace.outputRoot,
      stemMap,
      songs: [
        { folder: GRACE, title: 'This Is Amazing Grace', start: 0 },
        { folder: GOODNESS, title: 'Goodness of God', start: 248 },
      ],
      transitions: { 1: { type: 'overlap' } },
    });
  });

  it('saves set-recipe.json on CLI builds with paths, resolved songs, transitions, and manifest path', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);

    const built = await runViaPnpm(['grace', 'goodness', '--pad', '1', '--date', DATE, ...buildPaths(workspace)]);

    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);
    const recipe = await readRecipeJson(projectFolder(workspace));
    expect(recipe.version).toBe(1);
    expect(recipe.date).toBe(DATE);
    expect(recipe.library).toBe(workspace.library);
    expect(recipe.template).toBe(workspace.template);
    expect(recipe.outputRoot).toBe(workspace.outputRoot);
    expect(recipe.setManifest).toBe(workspace.setManifest);
    expect(recipe.showFolder).toBe(workspace.showFolder);
    expect(recipe.stemMapPath).toBe(join(REPO_ROOT, 'config/stem-map.json'));
    expect(recipe.songs.map(({ folder, title }) => ({ folder, title }))).toEqual([
      { folder: GRACE, title: 'This Is Amazing Grace' },
      { folder: GOODNESS, title: 'Goodness of God' },
    ]);
    expect(recipe.songs[0]?.start).toBe(0);
    expect(recipe.songs[1]?.start).toBeGreaterThan(0);
    expect(recipe.transitions).toEqual({ 1: { type: 'pad' } });
  });

  it('saves plan settings and per-song charts in set-recipe.json on --plan builds and preserves untouched charts across offline edit', async () => {
    const workspace = await createWorkspace();
    const PHASE_0 = '2027-01-03';
    const WELCOME_HOME = 'WELCOME HOME-Elevation Rhythm-F-98.00bpm';
    const YES_AND_AMEN = 'Yes And Amen-Jesus Culture-G-72.00bpm';
    const FALL_LIKE_RAIN = 'Fall Like Rain-Passion-E-70.00bpm';
    await copySongAs(workspace, GRACE, WELCOME_HOME);
    await copySongAs(workspace, GREAT_ARE, YES_AND_AMEN);
    await copySongAs(workspace, GOODNESS, FALL_LIKE_RAIN);
    await addPadTrack(workspace);
    await addPad(workspace, 'E', 120);

    const tokenFile = join(workspace.dir, 'pco.env');
    await writeFile(tokenFile, `PCO_CLIENT_ID=fake-id\nPCO_SECRET='fake-secret'\n`);
    await chmod(tokenFile, 0o600);
    const fake: PlanningCenter = await startPlanningCenter({ clientId: 'fake-id', secret: 'fake-secret', fixtures: await readFixtures() });
    fakes.push(fake);

    const built = await run(
      ['--plan', '--date', PHASE_0, ...buildPaths(workspace)],
      { PCO_API_BASE: fake.base, PCO_ENV: tokenFile },
    );
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);

    const folder = projectFolder(workspace, PHASE_0);
    const recipe = await readRecipeJson(folder);
    expect(recipe.plan).toEqual({ serviceType: 'Service' });
    expect(recipe.songs).toHaveLength(3);
    expect(recipe.songs[0]?.chartText).toBe(madeUpChart('36313264').chord_chart);
    expect(recipe.songs[1]?.chartText).toBe(madeUpChart('21716143').chord_chart);
    expect(recipe.songs[2]?.chartText).toBe(madeUpChart('36302201').chord_chart);

    // Close Planning Center completely to prove edit works offline and preserves untouched charts.
    fakes.pop();
    await fake.close();

    // Swap song 2 (Yes And Amen -> Goodness of God, which fits the 4-VOX template after WELCOME HOME's overlap).
    const edited = await run(['edit', folder, '--swap', '2', 'goodness']);
    expect(edited.stderr).toBe('');
    expect(edited.code).toBe(0);

    const manifest = await readManifestJson(workspace.setManifest);
    expect(manifest.songs).toEqual([
      {
        title: 'WELCOME HOME',
        stemsKey: 'F',
        meter: '4/4',
        chartKey: madeUpChart('36313264').chord_chart_key,
        chartText: madeUpChart('36313264').chord_chart,
      },
      {
        title: 'Goodness of God',
        stemsKey: 'A',
        meter: '4/4',
      },
      {
        title: 'Fall Like Rain',
        stemsKey: 'E',
        meter: '4/4',
        chartKey: madeUpChart('36302201').chord_chart_key,
        chartText: madeUpChart('36302201').chord_chart,
      },
    ]);
  }, 20_000);
});

describe('build-set edit (--swap, --add, --drop)', () => {
  it('swaps a song by position or name, updates audio, pad key, manifest, and recipe', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);
    await addPad(workspace, 'D', 120);

    // Build: 1. Grace (D) --pad 1--> 2. Trust (A) --gap--> 3. Goodness (A)
    const built = await run(['grace', 'trust', 'goodness', '--pad', '1', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);
    expect(existsSync(join(projectFolder(workspace), 'Songs/_pads/A.wav'))).toBe(true);
    expect(existsSync(join(projectFolder(workspace), 'Songs/_pads/D.wav'))).toBe(false);

    // Swap song 2 ("trust") -> "great are" (in D). Pad after song 1 should automatically follow to D.wav!
    const swapped = await run(['edit', '--date', DATE, '--output-root', workspace.outputRoot, '--swap', 'trust', 'great are']);
    expect(swapped.stderr).toBe('');
    expect(swapped.code).toBe(0);
    expect(swapped.stdout).toContain('1. This Is Amazing Grace');
    expect(swapped.stdout).toContain('pad in D');
    expect(swapped.stdout).not.toContain('keeps its own key');
    expect(swapped.stdout).toContain('2. Great Are You Lord');
    expect(swapped.stdout).toContain('3. Goodness of God');

    const folder = projectFolder(workspace);
    expect((await readdir(join(folder, 'Songs'))).toSorted()).toEqual(['Goodness of God', 'Great Are You Lord', 'This Is Amazing Grace', '_pads']);
    expect(existsSync(join(folder, 'Songs/_pads/D.wav'))).toBe(true);
    expect(existsSync(join(folder, 'Songs/_pads/A.wav'))).toBe(false);

    const root = await readSet(setPath(workspace));
    const parsed = parseSet(locatorList(root));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.songs.map((song) => song.title)).toEqual(['This Is Amazing Grace', 'Great Are You Lord', 'Goodness of God']);

    const manifest = await readManifestJson(workspace.setManifest);
    expect(manifest.songs.map(({ title, stemsKey, meter }) => ({ title, stemsKey, meter }))).toEqual([
      { title: 'This Is Amazing Grace', stemsKey: 'D', meter: '4/4' },
      { title: 'Great Are You Lord', stemsKey: 'D', meter: '6/8' },
      { title: 'Goodness of God', stemsKey: 'A', meter: '4/4' },
    ]);

    const recipe = await readRecipeJson(folder);
    expect(recipe.songs.map((song) => song.folder)).toEqual([GRACE, GREAT_ARE, GOODNESS]);
    expect(recipe.transitions).toEqual({ 1: { type: 'pad' } });
  }, 20_000);

  it('adds a song at the end or at --at <pos>, shifting transitions cleanly', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'goodness', '--overlap', '1', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);

    // Insert Trust In God at position 1: Grace becomes #2 and keeps its overlap into Goodness (#3).
    const inserted = await run(['edit', projectFolder(workspace), '--add', 'trust', '--at', '1']);
    expect(inserted.stderr).toBe('');
    expect(inserted.code).toBe(0);
    expect(inserted.stdout.split('\n').slice(1, 4)).toEqual([
      '1. Trust In God  bar 1  74 BPM  6/8  gap',
      '2. This Is Amazing Grace  bar 113  98 BPM  4/4  overlap',
      '3. Goodness of God  bar 175  63 BPM  4/4',
    ]);

    // Append Great Are You Lord at the end (no --at).
    const appended = await run(['edit', setPath(workspace), '--add', 'great are']);
    expect(appended.stderr).toBe('');
    expect(appended.code).toBe(0);

    const recipe = await readRecipeJson(projectFolder(workspace));
    expect(recipe.songs.map((song) => song.folder)).toEqual([TRUST, GRACE, GOODNESS, GREAT_ARE]);
    expect(recipe.transitions).toEqual({ 2: { type: 'overlap' } });

    const manifest = await readManifestJson(workspace.setManifest);
    expect(manifest.songs.map((song) => song.title)).toEqual(['Trust In God', 'This Is Amazing Grace', 'Goodness of God', 'Great Are You Lord']);
  }, 20_000);

  it('an edit that changes the song after an explicit-key pad says the pad keeps its key', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);
    await addPad(workspace, 'D', 120);
    const built = await run(['goodness', 'trust', 'grace', '--pad', '1=A', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const folder = projectFolder(workspace);
    const steps: { args: string[]; warning: string }[] = [
      { args: ['--swap', '2', 'great are'], warning: 'The pad after song 1 keeps its own key, A, and now leads into Great Are You Lord.' },
      { args: ['--add', 'trust', '--at', '2'], warning: 'The pad after song 1 keeps its own key, A, and now leads into Trust In God.' },
      { args: ['--drop', '2'], warning: 'The pad after song 1 keeps its own key, A, and now leads into Great Are You Lord.' },
      { args: ['--drop', '2'], warning: 'The pad after song 1 keeps its own key, A, and now leads into This Is Amazing Grace.' },
      { args: ['--drop', '2'], warning: 'The pad after song 1 keeps its own key, A, and now ends the set.' },
    ];

    for (const { args, warning } of steps) {
      const edited = await run(['edit', folder, ...args]);
      expect(edited.stderr, args.join(' ')).toBe('');
      expect(edited.code, args.join(' ')).toBe(0);
      expect(edited.stdout.split('\n'), args.join(' ')).toContain(warning);
      expect((await readRecipeJson(folder)).transitions, args.join(' ')).toEqual({ 1: { type: 'pad', key: 'A' } });
    }
  }, 30_000);

  it('swapping the last song before an explicit-key pad that ends the set says the pad keeps its key', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);
    const built = await run(['goodness', 'trust', '--pad', '2=A', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const folder = projectFolder(workspace);

    const swapped = await run(['edit', folder, '--swap', '2', 'great are']);

    expect(swapped.stderr).toBe('');
    expect(swapped.code).toBe(0);
    expect(swapped.stdout.split('\n')).toContain('The pad after song 2 keeps its own key, A, and now follows Great Are You Lord.');
    expect((await readRecipeJson(folder)).transitions).toEqual({ 2: { type: 'pad', key: 'A' } });
  }, 20_000);

  it('drops a song by position or name, removes its audio, and drops a dangling overlap if the last song is dropped', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'great are', 'goodness', '--overlap', '1', '--overlap', '2', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);

    // Drop the last song (goodness): overlap after song 2 becomes invalid at the new end and is cleanly dropped.
    const droppedLast = await run(['edit', projectFolder(workspace), '--drop', 'goodness']);
    expect(droppedLast.stderr).toBe('');
    expect(droppedLast.code).toBe(0);

    let recipe = await readRecipeJson(projectFolder(workspace));
    expect(recipe.songs.map((song) => song.folder)).toEqual([GRACE, GREAT_ARE]);
    expect(recipe.transitions).toEqual({ 1: { type: 'overlap' } });
    expect((await readdir(join(projectFolder(workspace), 'Songs'))).toSorted()).toEqual(['Great Are You Lord', 'This Is Amazing Grace']);

    // Drop song 1 by position.
    const droppedFirst = await run(['edit', projectFolder(workspace), '--drop', '1']);
    expect(droppedFirst.stderr).toBe('');
    expect(droppedFirst.code).toBe(0);

    recipe = await readRecipeJson(projectFolder(workspace));
    expect(recipe.songs.map((song) => song.folder)).toEqual([GREAT_ARE]);
    expect(recipe.transitions).toEqual({});
    expect((await readdir(join(projectFolder(workspace), 'Songs'))).toSorted()).toEqual(['Great Are You Lord']);
  }, 20_000);
});

describe('preserving Live edits across build-set edit', () => {
  it('carries every untouched song\'s locators as Live has them, and its volumes and clip gains, across --swap, --add, and --drop', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);
    await addPad(workspace, 'D', 120);

    const built = await run(['goodness', 'trust', 'grace', '--pad', '1=A', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);

    // Simulate rehearsal edits saved in Ableton Live on the built .als:
    // - Song 1 (Goodness): +SKIP on Verse 1, +LOOP:2 on the 2nd Chorus, >>> Chorus@2 on Bridge, +LOOP on Pad
    // - Song 2 (Trust, about to be swapped): +SKIP on Verse 1 (must NOT transfer to replacement!)
    // - Song 3 (Grace): +LOOP on Bridge, a flag before the title on its Count Off, and +LOOP:1 on its Outro
    // - Song 1: a section renamed with no flag in it, and a locator added in Live
    // - Track mixer volumes on GroupTrack (KEYS), AudioTrack slot (Drums 1), single tracks (GUIDE, PAD), and MainTrack
    // - Clip SampleVolume on Song 1's Piano clip
    await mutateAlsXml(setPath(workspace), (xml) => {
      let next = xml;
      next = renameLocator(next, '1 - Verse 1', '1 - Verse 1 +SKIP');
      next = renameLocator(next, '1 - Chorus', '1 - Chorus +LOOP:2', 1);
      next = renameLocator(next, '1 - Bridge', '1 - Bridge >>> Chorus@2');
      next = renameLocator(next, '1 - Pad', '1 - Pad +LOOP');
      next = renameLocator(next, '2 - Verse 1', '2 - Verse 1 +SKIP');
      next = renameLocator(next, '3 - Bridge', '3 - Bridge +LOOP');
      next = renameLocator(next, '3 - Count Off (This Is Amazing Grace)', '3 - Count Off +skip (This Is Amazing Grace)');
      next = renameLocator(next, '3 - Outro', '3 - Outro +LOOP:1');
      next = renameLocator(next, '1 - Verse 2', '1 - Verse 2 (soft)');
      next = addLocator(next, '1 - Intro', '1 - Band Hold', 100);
      next = setTrackMixerVolume(next, 'KEYS', '0.72');
      next = setTrackMixerVolume(next, 'Drums 1', '0.84');
      next = setTrackMixerVolume(next, 'GUIDE', '0.55');
      next = setTrackMixerVolume(next, 'PAD', '0.62');
      next = setMainTrackVolume(next, '0.91');
      next = setClipSampleVolume(next, 'Songs/Goodness of God/Piano.wav', '0.77');
      return next;
    });

    // 1. Swap song 2 (Trust -> Great Are You Lord): Song 1 and Song 3 keep every edit, Song 2 starts clean.
    const swapped = await run(['edit', projectFolder(workspace), '--swap', '2', 'great are']);
    expect(swapped.stderr).toBe('');
    expect(swapped.code).toBe(0);

    let root = await readSet(setPath(workspace));
    let names = locatorList(root).map((locator) => locator.name);
    expect(names).toContain('1 - Verse 1 +SKIP');
    expect(names.filter((name) => name.startsWith('1 - Chorus'))).toEqual(['1 - Chorus', '1 - Chorus +LOOP:2', '1 - Chorus', '1 - Chorus']);
    expect(names).toContain('1 - Bridge >>> Chorus@2');
    expect(names).toContain('1 - Pad +LOOP');
    expect(names).toContain('3 - Bridge +LOOP');
    // Replacement song 2 must NOT inherit old song 2's +SKIP flag.
    expect(names.filter((name) => name.startsWith('2 - ') && name.includes('+SKIP'))).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(['1 - Verse 2 (soft)', '1 - Band Hold', '3 - Count Off +skip (This Is Amazing Grace)', '3 - Outro +LOOP:1']));
    expect(names).not.toContain('1 - Verse 2');
    expect(names).not.toContain('3 - Outro');
    expect(locatorList(root).find((locator) => locator.name === '1 - Band Hold')?.time).toBe(100);
    let parsed = parseSet(locatorList(root));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.songs.map((song) => song.title)).toEqual(['Goodness of God', 'Great Are You Lord', 'This Is Amazing Grace']);

    expect(mixerVolume(root, 'KEYS')).toBe('0.72');
    expect(mixerVolume(root, 'Drums 1')).toBe('0.84');
    expect(mixerVolume(root, 'GUIDE')).toBe('0.55');
    expect(mixerVolume(root, 'PAD')).toBe('0.62');
    expect(mainTrackVolume(root)).toBe('0.91');

    const pianoClip = slots(root, 'KEYS')
      .flatMap(arrangementClips)
      .find((clip) => value(clip, 'SampleRef', 'FileRef', 'RelativePath') === 'Songs/Goodness of God/Piano.wav');
    expect(pianoClip && value(pianoClip, 'SampleVolume')).toBe('0.77');

    // 2. Drop song 2 (Great Are You Lord): Song 3 (Grace) shifts to Song 2 and keeps its +LOOP on Bridge!
    const dropped = await run(['edit', projectFolder(workspace), '--drop', '2']);
    expect(dropped.stderr).toBe('');
    expect(dropped.code).toBe(0);

    root = await readSet(setPath(workspace));
    names = locatorList(root).map((locator) => locator.name);
    expect(names).toContain('1 - Verse 1 +SKIP');
    expect(names).toContain('1 - Chorus +LOOP:2');
    expect(names).toContain('1 - Bridge >>> Chorus@2');
    expect(names).toContain('1 - Pad +LOOP');
    expect(names).toContain('2 - Bridge +LOOP');
    expect(names).toEqual(expect.arrayContaining(['1 - Verse 2 (soft)', '1 - Band Hold', '2 - Count Off +skip (This Is Amazing Grace)', '2 - Outro +LOOP:1']));
    parsed = parseSet(locatorList(root));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.songs.map((song) => song.title)).toEqual(['Goodness of God', 'This Is Amazing Grace']);
    expect(mixerVolume(root, 'KEYS')).toBe('0.72');
    expect(mixerVolume(root, 'Drums 1')).toBe('0.84');
    expect(mixerVolume(root, 'GUIDE')).toBe('0.55');
    expect(mixerVolume(root, 'PAD')).toBe('0.62');
    expect(mainTrackVolume(root)).toBe('0.91');

    // 3. Add Trust In God at position 1 (--at 1): Goodness shifts 1 -> 2, Grace shifts 2 -> 3, all flags & volumes preserved!
    const added = await run(['edit', projectFolder(workspace), '--add', 'trust', '--at', '1']);
    expect(added.stderr).toBe('');
    expect(added.code).toBe(0);

    root = await readSet(setPath(workspace));
    names = locatorList(root).map((locator) => locator.name);
    expect(names).toContain('2 - Verse 1 +SKIP');
    expect(names).toContain('2 - Chorus +LOOP:2');
    expect(names).toContain('2 - Bridge >>> Chorus@2');
    expect(names).toContain('2 - Pad +LOOP');
    expect(names).toContain('3 - Bridge +LOOP');
    expect(names).toEqual(expect.arrayContaining(['2 - Verse 2 (soft)', '2 - Band Hold', '3 - Count Off +skip (This Is Amazing Grace)', '3 - Outro +LOOP:1']));
    const songTwoStart = locatorList(root).find((locator) => locator.name === '2 - Count Off (Goodness of God)')?.time;
    expect(locatorList(root).find((locator) => locator.name === '2 - Band Hold')?.time).toBe(songTwoStart! + 100);
    parsed = parseSet(locatorList(root));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.songs.map((song) => song.title)).toEqual(['Trust In God', 'Goodness of God', 'This Is Amazing Grace']);
    // Newly added song 1 has no flags.
    expect(names.filter((name) => name.startsWith('1 - ') && /\+SKIP|\+LOOP|>>>/.test(name))).toEqual([]);
    expect(mixerVolume(root, 'KEYS')).toBe('0.72');
    expect(mixerVolume(root, 'PAD')).toBe('0.62');
    expect(mainTrackVolume(root)).toBe('0.91');
    // Verify PAD clip exists on PAD track.
    expect(arrangementClips(singleTrack(root, 'PAD')).map(stemOf)).toEqual(['A']);
  }, 20_000);
});

describe('swapping a song for itself', () => {
  it('swapping a song for its own folder rebuilds it from the library and says so', async () => {
    const workspace = await createWorkspace();
    const built = await run(['goodness', 'trust', 'grace', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const songTwo = (root: Awaited<ReturnType<typeof readSet>>) => locatorList(root).map((locator) => locator.name).filter((name) => name.startsWith('2 - '));
    const library = songTwo(await readSet(setPath(workspace)));
    await mutateAlsXml(setPath(workspace), (xml) => renameLocator(xml, '2 - Verse 1', '2 - Verse 1 (soft)'));

    const swapped = await run(['edit', projectFolder(workspace), '--swap', '2', 'trust']);

    expect(swapped.stderr).toBe('');
    expect(swapped.code).toBe(0);
    expect(swapped.stdout).toContain(`Song 2 is rebuilt from ${TRUST} in the library, so its locators and clip gains start as the library has them.`);
    expect(songTwo(await readSet(setPath(workspace)))).toEqual(library);
  }, 20_000);
});

describe('the song before the edited position', () => {
  it('a song added after a pad that ended the set leaves no Pad Out from the old set inside the new Pad section', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);
    await addPad(workspace, 'D', 120);
    const built = await run(['goodness', 'trust', '--pad', '2', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    expect(locatorList(await readSet(setPath(workspace))).map((locator) => locator.name)).toContain('2 - Pad Out');

    const added = await run(['edit', projectFolder(workspace), '--add', 'grace']);

    expect(added.stderr).toBe('');
    expect(added.code).toBe(0);
    const root = await readSet(setPath(workspace));
    const songTwo = locatorList(root).map((locator) => locator.name).filter((name) => name.startsWith('2 - '));
    expect(songTwo).not.toContain('2 - Pad Out');
    expect(songTwo.slice(-2)).toEqual(['2 - Pad', '2 - End']);
    expect(parseSet(locatorList(root)).warnings).toEqual([]);
  }, 20_000);

  it('the song before a dropped last song keeps its renamed sections and gets back the sections its overlap had cut', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'great are', 'goodness', '--overlap', '2', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const before = locatorList(await readSet(setPath(workspace))).map((locator) => locator.name);
    expect(before).not.toContain('2 - Ending');
    await mutateAlsXml(setPath(workspace), (xml) => renameLocator(xml, '2 - Bridge', '2 - Bridge (soft)'));

    const dropped = await run(['edit', projectFolder(workspace), '--drop', '3']);

    expect(dropped.stderr).toBe('');
    expect(dropped.code).toBe(0);
    const root = await readSet(setPath(workspace));
    const songTwo = locatorList(root).map((locator) => locator.name).filter((name) => name.startsWith('2 - '));
    expect(songTwo).toContain('2 - Bridge (soft)');
    expect(songTwo.filter((name) => name === '2 - Bridge')).toHaveLength(1);
    expect(songTwo).toContain('2 - Ending');
    expect(songTwo.filter((name) => name === '2 - End')).toHaveLength(1);
    expect(songTwo.at(-1)).toBe('2 - End');
    expect(parseSet(locatorList(root)).warnings).toEqual([]);
  }, 20_000);

  it('a song with an unchanged gap before an edit keeps deleted and moved locators verbatim', async () => {
    const workspace = await createWorkspace();
    const built = await run(['goodness', 'trust', 'grace', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const songOne = (locators: { time: number; name: string }[]) => locators.filter((locator) => locator.name.startsWith('1 - '));
    const verse = songOne(locatorList(await readSet(setPath(workspace)))).find((locator) => locator.name === '1 - Verse 1')!;
    await mutateAlsXml(setPath(workspace), (xml) =>
      xml
        .replace(/<Locator Id="\d+">(?:(?!<\/Locator>)[\s\S])*?<Name Value="1 - Intro" \/>[\s\S]*?<\/Locator>/, '')
        .replace(
          new RegExp(`(<Locator Id="\\d+">(?:(?!</Locator>)[\\s\\S])*?<Time Value=")${verse.time}(" />(?:(?!</Locator>)[\\s\\S])*?<Name Value="1 - Verse 1" />)`),
          `$1${verse.time - 4}$2`,
        ),
    );
    const edited = songOne(locatorList(await readSet(setPath(workspace))));

    const swapped = await run(['edit', projectFolder(workspace), '--swap', '2', 'great are']);

    expect(swapped.stderr).toBe('');
    expect(swapped.code).toBe(0);
    const after = songOne(locatorList(await readSet(setPath(workspace))));
    expect(after.map((locator) => locator.name)).not.toContain('1 - Intro');
    expect(after.filter((locator) => locator.name === '1 - Verse 1')).toEqual([{ time: verse.time - 4, name: '1 - Verse 1' }]);
    expect(after).toEqual(edited);
  }, 20_000);
});

describe('Eos lighting cue regeneration on build-set edit', () => {
  it('records --lights settings in set-recipe.json and regenerates Eos cues automatically on --swap, --add, and --drop', async () => {
    const workspace = await createWorkspace();
    const THREE_PICTURES = '2026-11-15';
    await copySongAs(workspace, GREAT_ARE, 'Yes and Amen-Housefires-D-72.00bpm');
    await copySongAs(workspace, GOODNESS, 'I Speak Jesus-Here Be Lions-A-63.00bpm');

    const built = await run(['grace', 'yes and', 'trust', '--date', THREE_PICTURES, ...buildPaths(workspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);

    const weekly = await addWeeklyShow(workspace, THREE_PICTURES, '2026-11-10 10-00-00', 'weekly-show');
    const eos = await startFakeEos();
    fakes.push(eos);
    const pro = await startFakeProPresenter();
    fakes.push(pro);
    pro.serveNovember12();
    eos.setShow(CHURCH_SHOW);
    eos.setShowPath(weekly);
    const connectionsConfig = await writeConnectionsConfig(workspace, eos.port, pro.port);

    const fastEnv = { EOS_TIMEOUT_MS: '2000', EOS_SETTLE_MS: '0', PROPRESENTER_TIMEOUT_MS: '2000', PROPRESENTER_AGAIN_MS: '0' };

    // Run --lights once: labels Song 1..3 (cues 1, 11, 22) and records lights settings in set-recipe.json.
    const lit = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, connectionsConfig)], fastEnv);
    expect(lit.stderr).toBe('');
    expect(lit.code).toBe(0);

    const folder = projectFolder(workspace, THREE_PICTURES);
    const recipe = await readRecipeJson(folder);
    expect(recipe.lights).toEqual({
      showFolder: workspace.showFolder,
      connectionsConfig,
      labelled: ['This Is Amazing Grace', 'Yes and Amen', 'Trust In God'],
    });
    expect(eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label)).toEqual([
      'This Is Amazing Grace',
      'Yes and Amen',
      'Trust In God',
    ]);

    // Mirror Eos's saved show file on disk so newestWeeklyShow matches the open show path.
    await writeFile(eos.showPath()!, 'saved-show-1');

    // Now swap song 3 (Trust In God -> I Speak Jesus) via build-set edit: Eos cue 22 must automatically update!
    const swapped = await run(['edit', folder, '--swap', '3', 'i speak'], fastEnv);
    expect(swapped.stderr).toBe('');
    expect(swapped.code).toBe(0);
    expect(swapped.stdout).toContain('3. I Speak Jesus  cue 1/22');
    expect(eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label)).toEqual([
      'This Is Amazing Grace',
      'Yes and Amen',
      'I Speak Jesus',
    ]);

    await writeFile(eos.showPath()!, 'saved-show-2');

    // Drop song 2 (Yes and Amen): cues become Grace (1), I Speak Jesus (11), and cue 22 resets to "Song 3"!
    const dropped = await run(['edit', folder, '--drop', '2'], fastEnv);
    expect(dropped.stderr).toBe('');
    expect(dropped.code).toBe(0);
    expect(eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label)).toEqual([
      'This Is Amazing Grace',
      'I Speak Jesus',
      'Song 3',
    ]);

    await writeFile(eos.showPath()!, 'saved-show-3');

    // Add Yes and Amen back at the end: reuses reset cue 22 ("Song 3") cleanly!
    const added = await run(['edit', folder, '--add', 'yes and'], fastEnv);
    expect(added.stderr).toBe('');
    expect(added.code).toBe(0);
    expect(eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label)).toEqual([
      'This Is Amazing Grace',
      'I Speak Jesus',
      'Yes and Amen',
    ]);
  }, 45_000);

  it('a --lights retry after an edit whose lights step failed relabels the swapped song\'s cue', async () => {
    const workspace = await createWorkspace();
    const THREE_PICTURES = '2026-11-15';
    await copySongAs(workspace, GREAT_ARE, 'Yes and Amen-Housefires-D-72.00bpm');
    await copySongAs(workspace, GOODNESS, 'I Speak Jesus-Here Be Lions-A-63.00bpm');
    const built = await run(['grace', 'yes and', 'trust', '--date', THREE_PICTURES, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const weekly = await addWeeklyShow(workspace, THREE_PICTURES, '2026-11-10 10-00-00', 'weekly-show');
    const eos = await startFakeEos();
    fakes.push(eos);
    const pro = await startFakeProPresenter();
    fakes.push(pro);
    pro.serveNovember12();
    eos.setShow(CHURCH_SHOW);
    eos.setShowPath(weekly);
    const connectionsConfig = await writeConnectionsConfig(workspace, eos.port, pro.port);
    const fastEnv = { EOS_TIMEOUT_MS: '2000', EOS_SETTLE_MS: '0', PROPRESENTER_TIMEOUT_MS: '2000', PROPRESENTER_AGAIN_MS: '0' };
    const lit = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, connectionsConfig)], fastEnv);
    expect(lit.code).toBe(0);
    await writeFile(eos.showPath()!, 'saved-show-1');
    const folder = projectFolder(workspace, THREE_PICTURES);

    await eos.refuse();
    const swapped = await run(['edit', folder, '--swap', '3', 'i speak'], fastEnv);
    expect(swapped.code).toBe(1);
    expect(swapped.stderr).toMatch(/The lights step is not done/);
    let recipe = await readRecipeJson(folder);
    expect(recipe.songs.map((song) => song.title)).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);
    expect(recipe.lights?.labelled).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'Trust In God']);

    await eos.accept();
    const retry = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, connectionsConfig)], fastEnv);

    expect(retry.stderr).toBe('');
    expect(retry.code).toBe(0);
    expect(retry.stdout).toContain('3. I Speak Jesus  cue 1/22');
    expect(eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label)).toEqual([
      'This Is Amazing Grace',
      'Yes and Amen',
      'I Speak Jesus',
    ]);
    recipe = await readRecipeJson(folder);
    expect(recipe.lights?.labelled).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);
  }, 45_000);
});

describe('recording the lights in the recipe', () => {
  const fastEnv = { EOS_TIMEOUT_MS: '10000', EOS_SETTLE_MS: '0', PROPRESENTER_TIMEOUT_MS: '2000', PROPRESENTER_AGAIN_MS: '0' };
  const THREE_PICTURES = '2026-11-15';

  async function litWorkspace() {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GREAT_ARE, 'Yes and Amen-Housefires-D-72.00bpm');
    await copySongAs(workspace, GOODNESS, 'I Speak Jesus-Here Be Lions-A-63.00bpm');
    const built = await run(['grace', 'yes and', 'trust', '--date', THREE_PICTURES, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const weekly = await addWeeklyShow(workspace, THREE_PICTURES, '2026-11-10 10-00-00', 'weekly-show');
    const eos = await startFakeEos();
    fakes.push(eos);
    const pro = await startFakeProPresenter();
    fakes.push(pro);
    pro.serveNovember12();
    eos.setShow(CHURCH_SHOW);
    eos.setShowPath(weekly);
    const connectionsConfig = await writeConnectionsConfig(workspace, eos.port, pro.port);
    return { workspace, eos, connectionsConfig, folder: projectFolder(workspace, THREE_PICTURES) };
  }

  it('lights.labelled records the title written from the Live set so a later edit relabels a renamed Count Off cue', async () => {
    const { workspace, eos, connectionsConfig, folder } = await litWorkspace();
    const alsPath = join(folder, `${THREE_PICTURES} Sunday.als`);
    await mutateAlsXml(alsPath, (xml) =>
      renameLocator(renameLocator(xml, '1 - Count Off (This Is Amazing Grace)', '1 - Count Off (Amazing Grace)'), '3 - Count Off (Trust In God)', '3 - Count Off (Trust)'),
    );
    const songCues = () => eos.cues().filter((cue) => ['1', '11', '22'].includes(cue.number)).map((cue) => cue.label);

    const lit = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, connectionsConfig)], fastEnv);
    expect(lit.stderr).toBe('');
    expect(lit.code).toBe(0);
    expect(songCues()).toEqual(['Amazing Grace', 'Yes and Amen', 'Trust']);
    expect((await readRecipeJson(folder)).lights?.labelled).toEqual(['Amazing Grace', 'Yes and Amen', 'Trust']);
    const cueNumbers = eos.cues().map((cue) => cue.number);
    await writeFile(eos.showPath()!, 'saved-show-1');

    const first = await run(['edit', folder, '--swap', '1', 'i speak'], fastEnv);
    expect(first.stderr).toBe('');
    expect(first.code).toBe(0);
    expect(songCues()).toEqual(['I Speak Jesus', 'Yes and Amen', 'Trust']);
    expect((await readRecipeJson(folder)).lights?.labelled).toEqual(['I Speak Jesus', 'Yes and Amen', 'Trust']);
    await writeFile(eos.showPath()!, 'saved-show-2');

    const last = await run(['edit', folder, '--swap', '3', 'goodness'], fastEnv);
    expect(last.stderr).toBe('');
    expect(last.code).toBe(0);
    expect(songCues()).toEqual(['I Speak Jesus', 'Yes and Amen', 'Goodness of God']);
    expect(eos.cues().map((cue) => cue.number)).toEqual(cueNumbers);
    expect((await readRecipeJson(folder)).lights?.labelled).toEqual(['I Speak Jesus', 'Yes and Amen', 'Goodness of God']);
  }, 45_000);

  it('--lights on a set whose recipe does not parse says the cues will not follow an edit, and exits 1', async () => {
    const { workspace, eos, connectionsConfig, folder } = await litWorkspace();
    await writeFile(recipePath(folder), '{ invalid');

    const lit = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, connectionsConfig)], fastEnv);

    expect(lit.code).toBe(1);
    expect(lit.stderr.trim().split('\n')).toHaveLength(1);
    expect(lit.stderr).toMatch(/The lights are done, but the set's recipe cannot record them, so build-set edit will not relabel the cues: .*not valid JSON/);
    expect(lit.stdout).toContain('3. Trust In God  cue 1/22');
    expect(eos.cues().find((cue) => cue.number === '22')?.label).toBe('Trust In God');
    expect(await readFile(recipePath(folder), 'utf8')).toBe('{ invalid');
  }, 45_000);

  it('--lights on a set with no recipe labels the cues and exits 0 with nothing on stderr', async () => {
    const { workspace, eos, connectionsConfig, folder } = await litWorkspace();
    await rm(recipePath(folder));

    const lit = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, connectionsConfig)], fastEnv);

    expect(lit.stderr).toBe('');
    expect(lit.code).toBe(0);
    expect(eos.cues().find((cue) => cue.number === '22')?.label).toBe('Trust In God');
    expect(existsSync(recipePath(folder))).toBe(false);
  }, 45_000);

  it('an edit whose lights step succeeds but whose recipe cannot record it says so, and exits 1', async () => {
    const { workspace, eos, connectionsConfig, folder } = await litWorkspace();
    const lit = await run(['--lights', '--date', THREE_PICTURES, ...lightsPaths(workspace, connectionsConfig)], fastEnv);
    expect(lit.code).toBe(0);
    await writeFile(eos.showPath()!, 'saved-show-1');
    const recordedBefore = (await readRecipeJson(folder)).lights?.labelled;

    eos.holdReads();
    const reads = eos.received.length;
    const editing = run(['edit', folder, '--swap', '3', 'i speak'], fastEnv);
    const deadline = Date.now() + 15_000;
    while (!eos.received.slice(reads).some((message) => message.address.startsWith('/eos/get/cue/'))) {
      if (Date.now() > deadline) throw new Error('The edit never read the cue list.');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await chmod(folder, 0o555);
    eos.releaseReads();
    const edited = await editing.finally(() => chmod(folder, 0o755));

    expect(edited.code).toBe(1);
    expect(edited.stderr).toMatch(/The lights are done, but the set's recipe cannot record them, so build-set edit will not relabel the cues: .*EACCES/);
    expect(edited.stdout).toContain('3. I Speak Jesus  cue 1/22');
    expect(eos.cues().find((cue) => cue.number === '22')?.label).toBe('I Speak Jesus');
    expect((await readRecipeJson(folder)).songs.map((song) => song.title)).toEqual(['This Is Amazing Grace', 'Yes and Amen', 'I Speak Jesus']);
    expect((await readRecipeJson(folder)).lights?.labelled).toEqual(recordedBefore);
  }, 45_000);
});

describe('validation errors and atomic failure safety', () => {
  it('an edit keeps everything of the old set it does not write, and the replaced set in Backup', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'goodness', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const folder = projectFolder(workspace);
    const liveBackup = join(folder, 'Backup', `${DATE} Sunday [2026-11-28 101500].als`);
    const take = join(folder, 'Samples', 'Recorded', 'take 1.wav');
    await mkdir(join(folder, 'Backup'), { recursive: true });
    await writeFile(liveBackup, 'a backup Live saved');
    await mkdir(join(folder, 'Samples', 'Recorded'), { recursive: true });
    await writeFile(take, 'a take recorded in rehearsal');
    const setBefore = await readFile(setPath(workspace));

    const edited = await run(['edit', folder, '--add', 'trust']);

    expect(edited.stderr).toBe('');
    expect(edited.code).toBe(0);
    expect(await readFile(liveBackup, 'utf8')).toBe('a backup Live saved');
    expect(await readFile(take, 'utf8')).toBe('a take recorded in rehearsal');
    const kept = (await readdir(join(folder, 'Backup'))).filter((entry) => entry.startsWith(`${DATE} Sunday (before edit `) && entry.endsWith(').als'));
    expect(kept).toHaveLength(1);
    expect(await readFile(join(folder, 'Backup', kept[0]!))).toEqual(setBefore);
    expect((await readRecipeJson(folder)).songs.map((song) => song.folder)).toEqual([GRACE, GOODNESS, TRUST]);
  }, 20_000);

  it('an edit that cannot carry the old set across fails and leaves the set as it was', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'goodness', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const folder = projectFolder(workspace);
    const samples = join(folder, 'Samples');
    await mkdir(join(samples, 'Recorded'), { recursive: true });
    await writeFile(join(samples, 'Recorded', 'take 1.wav'), 'a take recorded in rehearsal');
    const folderBefore = await snapshotFolder(folder);

    await chmod(samples, 0o000);
    const edited = await run(['edit', folder, '--add', 'trust']).finally(() => chmod(samples, 0o755));

    expect(edited.code).toBe(1);
    expect(edited.stderr).toMatch(/EACCES|permission denied/i);
    expect(await snapshotFolder(folder)).toEqual(folderBefore);
    expect(await readdir(workspace.outputRoot)).toEqual([`${DATE} Sunday`]);
  }, 20_000);

  it('an edit that cannot keep the replaced set in a read-only Backup fails with that error and leaves the set as it was', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'goodness', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const folder = projectFolder(workspace);
    await mkdir(join(folder, 'Backup'));
    await writeFile(join(folder, 'Backup', `${DATE} Sunday [2026-11-28 101500].als`), 'a backup Live saved');
    await chmod(join(folder, 'Backup'), 0o555);
    const folderBefore = await snapshotFolder(folder);

    const edited = await run(['edit', folder, '--add', 'trust']).finally(() => spawnSync('chmod', ['-R', 'u+w', workspace.outputRoot]));

    expect(edited.code).toBe(1);
    expect(edited.stderr.trim().split('\n')).toHaveLength(1);
    expect(edited.stderr).toMatch(/EACCES.*before edit/);
    expect(await snapshotFolder(folder)).toEqual(folderBefore);
  }, 20_000);

  it('an edit carrying a read-only folder still updates set-manifest.json and exits 0', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'goodness', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const folder = projectFolder(workspace);
    const recorded = join(folder, 'Samples', 'Recorded');
    await mkdir(recorded, { recursive: true });
    await writeFile(join(recorded, 'take 1.wav'), 'a take recorded in rehearsal');
    await chmod(recorded, 0o555);

    const added = await run(['edit', folder, '--add', 'trust']).finally(() => spawnSync('chmod', ['-R', 'u+w', workspace.outputRoot]));

    expect(added.stderr).toBe('');
    expect(added.code).toBe(0);
    expect((await readRecipeJson(folder)).songs.map((song) => song.folder)).toEqual([GRACE, GOODNESS, TRUST]);
    expect((await readManifestJson(workspace.setManifest)).songs.map((song) => song.title)).toEqual(['This Is Amazing Grace', 'Goodness of God', 'Trust In God']);
    expect(await readFile(join(recorded, 'take 1.wav'), 'utf8')).toBe('a take recorded in rehearsal');
    const left = (await readdir(workspace.outputRoot)).filter((entry) => entry !== `${DATE} Sunday`);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatch(new RegExp(`^\\.${DATE} Sunday replacing `));

    const dropped = await run(['edit', folder, '--drop', '1']);
    expect(dropped.stderr).toBe('');
    expect(dropped.code).toBe(0);
    expect((await readManifestJson(workspace.setManifest)).songs.map((song) => song.title)).toEqual(['Goodness of God', 'Trust In God']);
  }, 30_000);

  it('keeps a second replaced set from the same second under the next second, and never overwrites the first', async () => {
    const workspace = await createWorkspace();
    const project = join(workspace.dir, 'project');
    const als = join(workspace.dir, 'old.als');
    await mkdir(project);
    await writeFile(als, 'the set before the first edit');
    const second = new Date(2026, 10, 29, 10, 15, 0, 900);
    const clock = [second, second, new Date(2026, 10, 29, 10, 15, 1, 0)];

    await keepReplacedSet(als, project, `${DATE} Sunday`, () => clock.shift()!);
    await writeFile(als, 'the set before the second edit');
    await keepReplacedSet(als, project, `${DATE} Sunday`, () => clock.shift()!);

    expect(clock).toEqual([]);
    expect((await readdir(join(project, 'Backup'))).toSorted()).toEqual([
      `${DATE} Sunday (before edit 2026-11-29 10-15-00).als`,
      `${DATE} Sunday (before edit 2026-11-29 10-15-01).als`,
    ]);
    expect(await readFile(join(project, 'Backup', `${DATE} Sunday (before edit 2026-11-29 10-15-00).als`), 'utf8')).toBe('the set before the first edit');
    expect(await readFile(join(project, 'Backup', `${DATE} Sunday (before edit 2026-11-29 10-15-01).als`), 'utf8')).toBe('the set before the second edit');
  });

  it('keeping the replaced set throws what the disk throws when Backup cannot be written, without trying again', async () => {
    const workspace = await createWorkspace();
    const project = join(workspace.dir, 'project');
    const als = join(workspace.dir, 'old.als');
    await mkdir(join(project, 'Backup'), { recursive: true });
    await writeFile(als, 'the set before the edit');
    let reads = 0;

    await chmod(join(project, 'Backup'), 0o555);
    const kept = keepReplacedSet(als, project, `${DATE} Sunday`, () => (reads++, new Date(2026, 10, 29, 10, 15, 0))).finally(() => chmod(join(project, 'Backup'), 0o755));

    await expect(kept).rejects.toMatchObject({ code: 'EACCES' });
    expect(reads).toBe(1);
    expect(await readdir(join(project, 'Backup'))).toEqual([]);
  });

  it('an edit whose recorded template has moved fails with one line and leaves the set as it was', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'goodness', 'trust', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const folder = projectFolder(workspace);
    const moved = join(workspace.dir, 'moved', 'template.als');
    const recipe = await readRecipeJson(folder);
    await writeFile(recipePath(folder), JSON.stringify({ ...recipe, template: moved }, null, 2));
    const folderBefore = await snapshotFolder(folder);

    const edited = await run(['edit', folder, '--drop', '3']);

    expect(edited.code).toBe(1);
    expect(edited.stderr).toContain(moved);
    expect(edited.stderr.trim().split('\n')).toHaveLength(1);
    expect(await snapshotFolder(folder)).toEqual(folderBefore);
  }, 20_000);

  it('an edit of a copied set folder is refused and changes neither folder', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', 'goodness', 'trust', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);
    const original = projectFolder(workspace);
    const copy = `${original} copy`;
    await cp(original, copy, { recursive: true });
    const originalBefore = await snapshotFolder(original);
    const copyBefore = await snapshotFolder(copy);

    const edited = await run(['edit', copy, '--drop', '1']);

    expect(edited.code).toBe(1);
    expect(edited.stderr).toContain(`which is ${original}.`);
    expect(await snapshotFolder(original)).toEqual(originalBefore);
    expect(await snapshotFolder(copy)).toEqual(copyBefore);
  }, 20_000);

  it('fails cleanly with no partial overwrite of the .als, project folder, or set-manifest.json', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 120);

    const built = await run(['grace', 'goodness', 'trust', '--pad', '1', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);

    const folder = projectFolder(workspace);
    const folderBefore = await snapshotFolder(folder);
    const manifestBefore = await readFile(workspace.setManifest, 'utf8');

    const cases: { what: string; args: string[]; expectedCode: number; errorMatch: RegExp }[] = [
      { what: 'missing song selector', args: ['edit', folder, '--swap', 'nonexistent', 'great are'], expectedCode: 1, errorMatch: /matches no song/ },
      { what: 'ambiguous song selector', args: ['edit', folder, '--drop', 'God'], expectedCode: 1, errorMatch: /matches 2 songs/ },
      { what: 'out-of-range position', args: ['edit', folder, '--swap', '9', 'great are'], expectedCode: 1, errorMatch: /out of range/ },
      { what: 'missing replacement in library', args: ['edit', folder, '--swap', '2', 'nonexistent'], expectedCode: 1, errorMatch: /matches no song folder/ },
      { what: 'out-of-range --at', args: ['edit', folder, '--add', 'great are', '--at', '9'], expectedCode: 1, errorMatch: /--at must be a whole number from 1 to 4/ },
      { what: 'bad --at syntax', args: ['edit', folder, '--add', 'great are', '--at', '0'], expectedCode: 2, errorMatch: /--at must be a positive whole number/ },
      { what: '--at without --add', args: ['edit', folder, '--drop', '2', '--at', '1'], expectedCode: 2, errorMatch: /--at can only be used with --add/ },
      { what: 'missing --swap replacement', args: ['edit', folder, '--swap', '2'], expectedCode: 2, errorMatch: /--swap requires two arguments/ },
      { what: 'multiple edit actions', args: ['edit', folder, '--swap', '1', 'great are', '--drop', '2'], expectedCode: 2, errorMatch: /Give one edit action/ },
      { what: 'missing pad file for new song key (D)', args: ['edit', folder, '--swap', '2', 'great are'], expectedCode: 1, errorMatch: /has no D\.wav/ },
    ];

    for (const { what, args, expectedCode, errorMatch } of cases) {
      const result = await run(args);
      expect(result.code, what).toBe(expectedCode);
      expect(result.stderr, what).toMatch(errorMatch);
      expect(await snapshotFolder(folder), `${what} left folder intact`).toEqual(folderBefore);
      expect(await readFile(workspace.setManifest, 'utf8'), `${what} left manifest intact`).toBe(manifestBefore);
    }

    // Also test dropping the only song in a 1-song set.
    const single = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: ['grace'],
      date: '2026-10-25',
      outputRoot: workspace.outputRoot,
    });
    expect(single.ok).toBe(true);
    const singleFolder = projectFolder(workspace, '2026-10-25');
    const singleBefore = await snapshotFolder(singleFolder);
    const dropOnly = await editSet({ folder: singleFolder, action: { kind: 'drop', song: '1' } });
    expect(dropOnly.ok).toBe(false);
    if (!dropOnly.ok) expect(dropOnly.problems[0]).toMatch(/only song in the set/);
    expect(await snapshotFolder(singleFolder)).toEqual(singleBefore);
  }, 20_000);

  it('fails cleanly when a swapped song lacks Ending needed by an existing overlap, leaving existing files untouched', async () => {
    const workspace = await createWorkspace();
    await removeLocator(workspace, GREAT_ARE, 'Ending');

    const built = await run(['grace', 'goodness', '--overlap', '1', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);

    const folder = projectFolder(workspace);
    const folderBefore = await snapshotFolder(folder);
    const manifestBefore = await readFile(workspace.setManifest, 'utf8');

    const swapped = await run(['edit', folder, '--swap', '1', 'great are']);
    expect(swapped.code).toBe(1);
    expect(swapped.stderr).toMatch(/no locator named Ending/);
    expect(await snapshotFolder(folder)).toEqual(folderBefore);
    expect(await readFile(workspace.setManifest, 'utf8')).toBe(manifestBefore);
  });

  it('fails cleanly when set-recipe.json is missing or corrupt', async () => {
    const workspace = await createWorkspace();
    const built = await run(['grace', '--date', DATE, ...buildPaths(workspace)]);
    expect(built.code).toBe(0);

    const folder = projectFolder(workspace);
    await writeFile(recipePath(folder), '{ invalid json');
    const corrupt = await editSet({ folder, action: { kind: 'add', song: 'goodness' } });
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.problems[0]).toMatch(/not valid JSON/);

    await rm(recipePath(folder));
    const missing = await editSet({ folder, action: { kind: 'add', song: 'goodness' } });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.problems[0]).toContain(`No ${SET_RECIPE_FILE} found`);
  });
});

describe('server manifest-watch rig integration with build-set edit', () => {
  const revision = (wanted: number) =>
    Object.defineProperty((snapshot: Snapshot) => snapshot.chartRevision === wanted, 'name', { value: `chart revision ${wanted}` });
  const charts = (activeRig: Rig) => readSetup<SetCharts>(activeRig.server.httpPort, CHARTS_API, 'the charts');

  it('bumps chartRevision and serves updated songs and stemsKey when build-set edit rewrites set-manifest.json', async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace.dir, 'manifest-dir'), { recursive: true });
    const manifestPath = join(workspace.dir, 'manifest-dir', 'set-manifest.json');
    const customWorkspace: Workspace = { ...workspace, setManifest: manifestPath };

    const built = await run(['grace', 'trust', '--date', DATE, ...buildPaths(customWorkspace)]);
    expect(built.stderr).toBe('');
    expect(built.code).toBe(0);

    const initialLocators = locatorList(await readSet(setPath(customWorkspace)));
    rig = await startRig(initialLocators, {}, { setManifest: manifestPath });
    const viewer = await rig.connectViewer();
    expect((await viewer.snapshot(loaded)).chartRevision).toBe(1);
    expect((await charts(rig)).songs.map(({ title, stemsKey }) => ({ title, stemsKey }))).toEqual([
      { title: 'This Is Amazing Grace', stemsKey: 'D' },
      { title: 'Trust In God', stemsKey: 'A' },
    ]);

    // Swap Trust In God (A) -> Great Are You Lord (D): server watches set-manifest.json and bumps chartRevision -> 2!
    const swapped = await run(['edit', projectFolder(customWorkspace), '--swap', '2', 'great are']);
    expect(swapped.stderr).toBe('');
    expect(swapped.code).toBe(0);

    await viewer.snapshot(revision(2));
    expect((await charts(rig)).revision).toBe(2);
    expect((await charts(rig)).songs.map(({ title, stemsKey }) => ({ title, stemsKey }))).toEqual([
      { title: 'This Is Amazing Grace', stemsKey: 'D' },
      { title: 'Great Are You Lord', stemsKey: 'D' },
    ]);

    // Drop song 1: bumps chartRevision -> 3!
    const dropped = await run(['edit', projectFolder(customWorkspace), '--drop', '1']);
    expect(dropped.stderr).toBe('');
    expect(dropped.code).toBe(0);

    await viewer.snapshot(revision(3));
    expect((await charts(rig)).revision).toBe(3);
    expect((await charts(rig)).songs.map(({ title, stemsKey }) => ({ title, stemsKey }))).toEqual([
      { title: 'Great Are You Lord', stemsKey: 'D' },
    ]);

    // A failing edit must NOT rewrite set-manifest.json or bump chartRevision.
    const failed = await run(['edit', projectFolder(customWorkspace), '--drop', '1']);
    expect(failed.code).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect((await charts(rig)).revision).toBe(3);
  }, 20_000);
});
