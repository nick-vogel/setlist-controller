import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { addPad, addPadTrack, createWorkspace, DATE, projectFolder, REPO_ROOT, removeWorkspaces, setPath, type Workspace } from '../../../../test/set-builder-harness.ts';


const results: { name: string; holds: boolean; detail: string }[] = [];

function run(args: string[]) {
  const child = spawnSync(process.execPath, ['src/set-builder/main.ts', ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { code: child.status, stdout: child.stdout, stderr: child.stderr };
}
const paths = (w: Workspace) => ['--library', w.library, '--template', w.template, '--output-root', w.outputRoot, '--set-manifest', w.setManifest, '--show-folder', w.showFolder];
async function build(songs: string[]) {
  const w = await createWorkspace();
  const built = run([...songs, '--date', DATE, ...paths(w)]);
  if (built.code !== 0) throw new Error(`build failed: ${built.stderr}`);
  return w;
}
async function recipeSongs(folder: string): Promise<string[]> {
  return (JSON.parse(await readFile(join(folder, 'set-recipe.json'), 'utf8')) as { songs: { title: string }[] }).songs.map((s) => s.title);
}
async function locatorNames(als: string): Promise<string[]> {
  const xml = gunzipSync(await readFile(als)).toString('utf8');
  return [...xml.matchAll(/<Locator [^>]*>[\s\S]*?<Name Value="([^"]*)" \/>/g)].map((m) => m[1]!);
}

// Finding 1: edit on a copied folder replaces the date-named sibling instead.
{
  const w = await build(['grace', 'goodness', 'trust']);
  const original = projectFolder(w);
  const copy = `${original} copy`;
  await cp(original, copy, { recursive: true });
  await writeFile(join(original, 'MARKER'), 'only in the original');
  const edited = run(['edit', copy, '--drop', '1']);
  const originalSongs = await recipeSongs(original);
  const copySongs = await recipeSongs(copy);
  const holds = edited.code === 0 && !existsSync(join(original, 'MARKER')) && originalSongs.length === 2 && copySongs.length === 3;
  results.push({ name: 'F1 copied folder: edit replaces the original', holds, detail: `exit ${edited.code}; original MARKER present=${existsSync(join(original, 'MARKER'))}; original songs=${JSON.stringify(originalSongs)}; copy songs=${JSON.stringify(copySongs)}` });
}

// Finding 2: a throw inside buildSet escapes edit() as an uncaught stack trace.
{
  const w = await build(['grace', 'goodness', 'trust']);
  const folder = projectFolder(w);
  const recipePath = join(folder, 'set-recipe.json');
  const recipe = JSON.parse(await readFile(recipePath, 'utf8')) as Record<string, unknown>;
  recipe.template = join(w.dir, 'moved/template.als');
  await writeFile(recipePath, JSON.stringify(recipe, null, 2));
  const edited = run(['edit', folder, '--drop', '3']);
  const holds = edited.code === 1 && /\n\s+at /.test(edited.stderr);
  const first = edited.stderr.split('\n').filter((l) => l.trim() !== '').slice(0, 3).join(' | ');
  results.push({ name: 'F2 moved template: uncaught stack trace', holds, detail: `exit ${edited.code}; stderr lines=${edited.stderr.split('\n').length}; first lines: ${first}` });
}

// Finding 3: edit removes Live's Backup folder from the project.
{
  const w = await build(['grace', 'goodness']);
  const folder = projectFolder(w);
  await mkdir(join(folder, 'Backup'), { recursive: true });
  await writeFile(join(folder, 'Backup', `${DATE} Sunday [2026-11-28 101500].als`), 'a Live backup');
  await mkdir(join(folder, 'Samples', 'Recorded'), { recursive: true });
  await writeFile(join(folder, 'Samples', 'Recorded', 'take 1.wav'), 'a recorded take');
  const alsBefore = await readFile(setPath(w));
  const edited = run(['edit', folder, '--add', 'trust']);
  const oldAlsKept = (await readdir(folder, { recursive: true })).some((entry) => entry.endsWith('.als') && !entry.endsWith(`${DATE} Sunday.als`));
  const holds = edited.code === 0 && !existsSync(join(folder, 'Backup')) && !existsSync(join(folder, 'Samples')) && !oldAlsKept;
  results.push({ name: 'F3 Backup, recorded audio and the pre-edit .als removed by edit', holds, detail: `exit ${edited.code}; Backup present after=${existsSync(join(folder, 'Backup'))}; Samples/Recorded present after=${existsSync(join(folder, 'Samples'))}; pre-edit .als (${alsBefore.length} bytes) kept anywhere=${oldAlsKept}; entries=${JSON.stringify((await readdir(folder)).toSorted())}` });
}

// Finding 4: swapping a song for its own folder drops its locator flags.
{
  const w = await build(['goodness', 'trust', 'grace']);
  const als = setPath(w);
  const xml = gunzipSync(await readFile(als)).toString('utf8');
  const next = xml.replace('<Name Value="2 - Verse 1" />', '<Name Value="2 - Verse 1 +SKIP" />');
  if (next === xml) throw new Error('no 2 - Verse 1 locator');
  await writeFile(als, gzipSync(next));
  const edited = run(['edit', projectFolder(w), '--swap', '2', 'trust']);
  const names = await locatorNames(als);
  const holds = edited.code === 0 && !names.includes('2 - Verse 1 +SKIP');
  results.push({ name: 'F4 self-swap drops flags', holds, detail: `exit ${edited.code}; song 2 locators after=${JSON.stringify(names.filter((n) => n.startsWith('2 - ')))}` });
}

// Second opinion item 4: an explicit pad key survives a swap of the song after it, and the summary shows it.
{
  const w = await createWorkspace();
  await addPadTrack(w);
  await addPad(w, 'A', 120);
  await addPad(w, 'D', 120);
  const built = run(['goodness', 'trust', 'grace', '--pad', '1=A', '--date', DATE, ...paths(w)]);
  if (built.code !== 0) throw new Error(`build failed: ${built.stderr}`);
  const edited = run(['edit', projectFolder(w), '--swap', '2', 'great are']);
  const recipe = JSON.parse(await readFile(join(projectFolder(w), 'set-recipe.json'), 'utf8')) as { transitions: unknown };
  const line1 = edited.stdout.split('\n').find((l) => l.startsWith('1. ')) ?? '';
  const holds = edited.code === 0 && JSON.stringify(recipe.transitions) === '{"1":{"type":"pad","key":"A"}}';
  results.push({ name: 'F5 explicit pad key kept after the next song changes key', holds, detail: `exit ${edited.code}; stderr=${JSON.stringify(edited.stderr.trim())}; transitions=${JSON.stringify(recipe.transitions)}; summary line 1=${JSON.stringify(line1)}` });
}

await removeWorkspaces();
for (const r of results) console.log(`${r.holds ? 'HOLDS ' : 'FAILS '} ${r.name}\n        ${r.detail}`);
process.exitCode = results.every((r) => r.holds) ? 0 : 1;
