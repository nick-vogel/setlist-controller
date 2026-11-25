import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { recipePath, type SetRecipe } from '../../../../src/set-builder/recipe.ts';
import { CHURCH_SHOW, startFakeEos, type FakeEos } from '../../../../test/fake-eos.ts';
import { startFakeProPresenter } from '../../../../test/fake-propresenter.ts';
import {
  addWeeklyShow,
  copySongAs,
  createWorkspace,
  GOODNESS,
  GREAT_ARE,
  lightsPaths,
  projectFolder,
  removeWorkspaces,
  REPO_ROOT,
  writeConnectionsConfig,
  type Workspace,
} from '../../../../test/set-builder-harness.ts';

const fakes: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await removeWorkspaces();
});

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return output(spawn(process.execPath, ['src/set-builder/main.ts', ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env } }));
}
function output(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
const buildPaths = (w: Workspace) => ['--library', w.library, '--template', w.template, '--output-root', w.outputRoot, '--set-manifest', w.setManifest, '--show-folder', w.showFolder];
const fastEnv = { EOS_TIMEOUT_MS: '2000', EOS_SETTLE_MS: '0', PROPRESENTER_TIMEOUT_MS: '2000', PROPRESENTER_AGAIN_MS: '0' };
const DATE3 = '2026-11-15';
const labels = (eos: FakeEos) => eos.cues().map((c) => `${c.number}=${c.label}`);
const log = (tag: string, r: { code: number | null; stdout: string; stderr: string }) =>
  console.log(`--- ${tag} code=${r.code}\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`);

// Build [Grace, Yes and Amen, Trust] and light it once: cues 1/11/22 labelled with the three titles.
async function litSet() {
  const workspace = await createWorkspace();
  await copySongAs(workspace, GREAT_ARE, 'Yes and Amen-Housefires-D-72.00bpm');
  await copySongAs(workspace, GOODNESS, 'I Speak Jesus-Here Be Lions-A-63.00bpm');
  const built = await run(['grace', 'yes and', 'trust', '--date', DATE3, ...buildPaths(workspace)]);
  expect(built.code).toBe(0);
  const weekly = await addWeeklyShow(workspace, DATE3, '2026-11-10 10-00-00', 'weekly-show');
  const eos = await startFakeEos();
  fakes.push(eos);
  const pro = await startFakeProPresenter();
  fakes.push(pro);
  pro.serveNovember12();
  eos.setShow(CHURCH_SHOW);
  eos.setShowPath(weekly);
  const connectionsConfig = await writeConnectionsConfig(workspace, eos.port, pro.port);
  const lit = await run(['--lights', '--date', DATE3, ...lightsPaths(workspace, connectionsConfig)], fastEnv);
  log('first --lights', lit);
  expect(lit.code).toBe(0);
  console.log('after first --lights:', labels(eos));
  await writeFile(eos.showPath()!, 'saved-show-1');
  return { workspace, eos, connectionsConfig, folder: projectFolder(workspace, DATE3) };
}

describe('lights retry after an edit whose lights step failed', () => {
  it('CLAIM: edit --swap 3 with Eos down, then --lights with Eos up, labels cue 22 with the new song', async () => {
    const { workspace, eos, connectionsConfig, folder } = await litSet();
    await eos.refuse();
    const swapped = await run(['edit', folder, '--swap', '3', 'i speak'], fastEnv);
    log('edit --swap 3 (Eos down)', swapped);
    const recipe = JSON.parse(await readFile(recipePath(folder), 'utf8')) as SetRecipe;
    console.log('recipe songs after failed-lights edit:', recipe.songs.map((s) => s.title));
    await eos.accept();
    console.log('Eos cues before retry:', labels(eos));
    const retry = await run(['--lights', '--date', DATE3, ...lightsPaths(workspace, connectionsConfig)], fastEnv);
    log('retry --lights (Eos up)', retry);
    console.log('Eos cues after retry:', labels(eos));
    expect(eos.cues().find((c) => c.number === '22')?.label).toBe('I Speak Jesus');
    expect(retry.stdout).toContain('3. I Speak Jesus  cue 1/22');
  }, 45_000);

  it('CONTROL: edit --swap 3 with Eos up labels cue 22 with the new song', async () => {
    const { eos, folder } = await litSet();
    const swapped = await run(['edit', folder, '--swap', '3', 'i speak'], fastEnv);
    log('edit --swap 3 (Eos up)', swapped);
    console.log('Eos cues after edit:', labels(eos));
    expect(eos.cues().find((c) => c.number === '22')?.label).toBe('I Speak Jesus');
  }, 45_000);

  it('BASE-EQUIVALENT: rebuild with --replace swapping song 3, then --lights', async () => {
    const { workspace, eos, connectionsConfig, folder } = await litSet();
    const rebuilt = await run(['grace', 'yes and', 'i speak', '--date', DATE3, ...buildPaths(workspace), '--replace', folder]);
    log('rebuild --replace', rebuilt);
    expect(rebuilt.code).toBe(0);
    const retry = await run(['--lights', '--date', DATE3, ...lightsPaths(workspace, connectionsConfig)], fastEnv);
    log('--lights after rebuild', retry);
    console.log('Eos cues after rebuild + --lights:', labels(eos));
    expect(eos.cues().find((c) => c.number === '22')?.label).toBe('I Speak Jesus');
  }, 45_000);
});
