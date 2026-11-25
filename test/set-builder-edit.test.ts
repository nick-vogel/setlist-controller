import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSet } from '../src/server/set-parser.ts';
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
        { folder: GRACE, title: 'This Is Amazing Grace' },
        { folder: GOODNESS, title: 'Goodness of God' },
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
    expect(recipe.songs).toEqual([
      { folder: GRACE, title: 'This Is Amazing Grace' },
      { folder: GOODNESS, title: 'Goodness of God' },
    ]);
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
  it('preserves +SKIP, +LOOP, >>> locator flags, track mixer volumes, and clip gains on untouched songs across --swap, --add, and --drop', async () => {
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
    // - Song 3 (Grace): +LOOP on Bridge
    // - Track mixer volumes on GroupTrack (KEYS), AudioTrack slot (Drums 1), single tracks (GUIDE, PAD), and MainTrack
    // - Clip SampleVolume on Song 1's Piano clip and Song 2's Piano clip
    await mutateAlsXml(setPath(workspace), (xml) => {
      let next = xml;
      next = renameLocator(next, '1 - Verse 1', '1 - Verse 1 +SKIP');
      next = renameLocator(next, '1 - Chorus', '1 - Chorus +LOOP:2', 1);
      next = renameLocator(next, '1 - Bridge', '1 - Bridge >>> Chorus@2');
      next = renameLocator(next, '1 - Pad', '1 - Pad +LOOP');
      next = renameLocator(next, '2 - Verse 1', '2 - Verse 1 +SKIP');
      next = renameLocator(next, '3 - Bridge', '3 - Bridge +LOOP');
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
    // Newly added song 1 has no flags.
    expect(names.filter((name) => name.startsWith('1 - ') && /\+SKIP|\+LOOP|>>>/.test(name))).toEqual([]);
    expect(mixerVolume(root, 'KEYS')).toBe('0.72');
    expect(mixerVolume(root, 'PAD')).toBe('0.62');
    expect(mainTrackVolume(root)).toBe('0.91');
    // Verify PAD clip exists on PAD track.
    expect(arrangementClips(singleTrack(root, 'PAD')).map(stemOf)).toEqual(['A']);
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
});

describe('validation errors and atomic failure safety', () => {
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
