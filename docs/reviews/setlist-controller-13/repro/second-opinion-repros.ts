import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CHURCH_SHOW, startFakeEos } from '../../../../test/fake-eos.ts';
import { startFakeProPresenter } from '../../../../test/fake-propresenter.ts';
import {
  addPad,
  addPadTrack,
  addWeeklyShow,
  copySongAs,
  createWorkspace,
  DATE,
  GOODNESS,
  GREAT_ARE,
  lightsPaths,
  locatorList,
  projectFolder,
  readSet,
  removeWorkspaces,
  REPO_ROOT,
  setPath,
  writeConnectionsConfig,
  type Workspace,
} from '../../../../test/set-builder-harness.ts';

const results: { name: string; holds: boolean; detail: string }[] = [];

function run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/set-builder/main.ts', ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const paths = (w: Workspace) => [
  '--library',
  w.library,
  '--template',
  w.template,
  '--output-root',
  w.outputRoot,
  '--set-manifest',
  w.setManifest,
  '--show-folder',
  w.showFolder,
];

const fastEnv = { EOS_TIMEOUT_MS: '2000', EOS_SETTLE_MS: '0', PROPRESENTER_TIMEOUT_MS: '2000', PROPRESENTER_AGAIN_MS: '0' };

// Finding 1: replaceFolder's success-path cleanup throws after the new set is swapped in, leaving set-manifest.json stale.
{
  const w = await createWorkspace();
  const built = await run(['grace', 'goodness', '--date', DATE, ...paths(w)]);
  if (built.code !== 0) throw new Error(`build failed: ${built.stderr}`);
  const folder = projectFolder(w);
  const recorded = join(folder, 'Samples', 'Recorded');
  await mkdir(recorded, { recursive: true });
  await writeFile(join(recorded, 'take 1.wav'), 'audio');
  await chmod(recorded, 0o555);
  try {
    const edited = await run(['edit', folder, '--add', 'trust']);
    const recipe = JSON.parse(await readFile(join(folder, 'set-recipe.json'), 'utf8')) as { songs: { title: string }[] };
    const manifest = JSON.parse(await readFile(w.setManifest, 'utf8')) as { songs: { title: string }[] };
    const rootEntries = (await readdir(w.outputRoot)).toSorted();
    const holds =
      edited.code === 1 &&
      /EACCES.*unlink/.test(edited.stderr) &&
      recipe.songs.length === 3 &&
      manifest.songs.length === 2;
    results.push({
      name: 'F1 replaceFolder success-path rm throws after swap, leaving manifest stale',
      holds,
      detail: `exit ${edited.code}; recipe songs=${recipe.songs.length}; manifest songs=${manifest.songs.length}; root entries=${rootEntries.length}`,
    });
  } finally {
    spawnSync('chmod', ['-R', 'u+w', w.outputRoot]);
  }
}

// Finding 2a: lights.labelled records recipe title instead of Live-edited Count Off title (last song -> stale cue + copy).
{
  const w = await createWorkspace();
  const date3 = '2026-11-15';
  await copySongAs(w, GREAT_ARE, 'Yes and Amen-Housefires-D-72.00bpm');
  await copySongAs(w, GOODNESS, 'I Speak Jesus-Here Be Lions-A-63.00bpm');
  const built = await run(['grace', 'yes and', 'trust', '--date', date3, ...paths(w)]);
  if (built.code !== 0) throw new Error(`build failed: ${built.stderr}`);
  const als = setPath(w, date3);
  const xml = gunzipSync(await readFile(als)).toString('utf8');
  await writeFile(als, gzipSync(xml.replace('<Name Value="3 - Count Off (Trust In God)" />', '<Name Value="3 - Count Off (Trust)" />')));

  const weekly = await addWeeklyShow(w, date3, '2026-11-10 10-00-00', 'weekly-show');
  const eos = await startFakeEos();
  const pro = await startFakeProPresenter();
  try {
    pro.serveNovember12();
    eos.setShow(CHURCH_SHOW);
    eos.setShowPath(weekly);
    const conn = await writeConnectionsConfig(w, eos.port, pro.port);
    const lit = await run(['--lights', '--date', date3, ...lightsPaths(w, conn)], fastEnv);
    const folder = projectFolder(w, date3);
    const recipe = JSON.parse(await readFile(join(folder, 'set-recipe.json'), 'utf8')) as { lights?: { labelled?: string[] } };
    await writeFile(eos.showPath()!, 'saved-1');
    const swapped = await run(['edit', folder, '--swap', '3', 'i speak'], fastEnv);
    const cues = eos.cues().filter((c) => ['1', '11', '12', '22'].includes(c.number)).map((c) => `${c.number}=${c.label}`);
    const holds = lit.code === 0 && swapped.code === 0 && cues.includes('22=Trust') && cues.includes('12=I Speak Jesus');
    results.push({
      name: 'F2a lights.labelled diverges from Live Count Off title on last song',
      holds,
      detail: `labelled=${JSON.stringify(recipe.lights?.labelled)}; cues after swap=${JSON.stringify(cues)}`,
    });
  } finally {
    await eos.close();
    await pro.close();
  }
}

// Finding 2b: lights.labelled diverges from Live Count Off title on song 1 -> next edit's lights step fails.
{
  const w = await createWorkspace();
  const date3 = '2026-11-15';
  await copySongAs(w, GREAT_ARE, 'Yes and Amen-Housefires-D-72.00bpm');
  await copySongAs(w, GOODNESS, 'I Speak Jesus-Here Be Lions-A-63.00bpm');
  const built = await run(['grace', 'yes and', 'trust', '--date', date3, ...paths(w)]);
  if (built.code !== 0) throw new Error(`build failed: ${built.stderr}`);
  const als = setPath(w, date3);
  const xml = gunzipSync(await readFile(als)).toString('utf8');
  await writeFile(als, gzipSync(xml.replace('<Name Value="1 - Count Off (This Is Amazing Grace)" />', '<Name Value="1 - Count Off (Amazing Grace)" />')));

  const weekly = await addWeeklyShow(w, date3, '2026-11-10 10-00-00', 'weekly-show');
  const eos = await startFakeEos();
  const pro = await startFakeProPresenter();
  try {
    pro.serveNovember12();
    eos.setShow(CHURCH_SHOW);
    eos.setShowPath(weekly);
    const conn = await writeConnectionsConfig(w, eos.port, pro.port);
    const lit = await run(['--lights', '--date', date3, ...lightsPaths(w, conn)], fastEnv);
    await writeFile(eos.showPath()!, 'saved-1');
    const swapped = await run(['edit', projectFolder(w, date3), '--swap', '1', 'i speak'], fastEnv);
    const holds = lit.code === 0 && swapped.code === 1 && /has no cue labelled "Song 1"/.test(swapped.stderr);
    results.push({
      name: 'F2b lights.labelled diverges from Live Count Off title on song 1',
      holds,
      detail: `exit ${swapped.code}; stderr=${JSON.stringify(swapped.stderr.trim())}`,
    });
  } finally {
    await eos.close();
    await pro.close();
  }
}

// Finding 3: trailing explicit-key pad (--pad 2=A) gives no warning when swapping the last song to a different key.
{
  const w = await createWorkspace();
  await addPadTrack(w);
  await addPad(w, 'A', 120);
  await addPad(w, 'D', 120);
  const built = await run(['goodness', 'trust', '--pad', '2=A', '--date', DATE, ...paths(w)]);
  if (built.code !== 0) throw new Error(`build failed: ${built.stderr}`);
  const edited = await run(['edit', projectFolder(w), '--swap', '2', 'great are']);
  const recipe = JSON.parse(await readFile(join(projectFolder(w), 'set-recipe.json'), 'utf8')) as { transitions: unknown };
  const holds = edited.code === 0 && !edited.stdout.includes('keeps its own key') && JSON.stringify(recipe.transitions) === '{"2":{"type":"pad","key":"A"}}';
  results.push({
    name: 'F3 trailing explicit-key pad emits no warning when last song is swapped',
    holds,
    detail: `exit ${edited.code}; transitions=${JSON.stringify(recipe.transitions)}; warning present=${edited.stdout.includes('keeps its own key')}`,
  });
}

// Finding 4: plain gap set treats song before edit as boundary, resurrecting deleted locator and duplicating moved locator.
{
  const w = await createWorkspace();
  const built = await run(['goodness', 'trust', 'grace', '--date', DATE, ...paths(w)]);
  if (built.code !== 0) throw new Error(`build failed: ${built.stderr}`);
  const als = setPath(w);
  const beforeLocs = locatorList(await readSet(als)).filter((l) => l.name.startsWith('1 - '));
  const verse1 = beforeLocs.find((l) => l.name === '1 - Verse 1')!;
  let xml = gunzipSync(await readFile(als)).toString('utf8');
  xml = xml.replace(/<Locator Id="\d+">(?:(?!<\/Locator>)[\s\S])*?<Name Value="1 - Intro" \/>[\s\S]*?<\/Locator>/, '');
  xml = xml.replace(
    new RegExp(`(<Locator Id="\\d+">(?:(?!</Locator>)[\\s\\S])*?<Time Value=")${verse1.time}(" \\/>(?:(?!</Locator>)[\\s\\S])*?<Name Value="1 - Verse 1" \\/>)`),
    `$1${verse1.time - 4}$2`,
  );
  await writeFile(als, gzipSync(xml));
  const edited = await run(['edit', projectFolder(w), '--swap', '2', 'great are']);
  const afterLocs = locatorList(await readSet(als)).filter((l) => l.name.startsWith('1 - '));
  const hasIntro = afterLocs.some((l) => l.name === '1 - Intro');
  const verse1s = afterLocs.filter((l) => l.name === '1 - Verse 1');
  const holds = edited.code === 0 && hasIntro && verse1s.length === 2;
  results.push({
    name: 'F4 plain gap song before edit resurrects deleted locator and duplicates moved locator',
    holds,
    detail: `exit ${edited.code}; 1 - Intro restored=${hasIntro}; 1 - Verse 1 count=${verse1s.length} (${verse1s.map((l) => l.time).join(', ')})`,
  });
}

await removeWorkspaces();
for (const r of results) console.log(`${r.holds ? 'HOLDS ' : 'FAILS '} ${r.name}\n        ${r.detail}`);
process.exitCode = results.every((r) => r.holds) ? 0 : 1;
