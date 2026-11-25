import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { TestContext } from 'vitest';

export const REPO_ROOT = resolve(import.meta.dirname, '..');

// A fake launchctl, open and pnpm, first on a command's PATH, so no test loads, starts or unloads a real launchd job,
// opens a browser, or installs and builds. Each appends its arguments to the record. The fake launchctl keeps the job's
// loaded state in a marker file: bootstrap creates it, bootout removes it, and print answers from it, as launchctl print
// does for a service that is not loaded. An environment variable makes each fail the way the real one can.
const FAKES = {
  launchctl: `#!/bin/bash
echo "launchctl $*" >> "$FAKE_RECORD"
case "$1" in
  bootstrap)
    if [[ -n "\${FAKE_BOOTSTRAP_ERROR:-}" ]]; then echo "$FAKE_BOOTSTRAP_ERROR" >&2; exit 5; fi
    touch "$FAKE_LOADED" ;;
  bootout)
    if [[ ! -e "$FAKE_LOADED" ]]; then echo "Boot-out failed: 3: No such process" >&2; exit 3; fi
    if [[ -n "\${FAKE_BOOTOUT_ERROR:-}" ]]; then
      # The job goes on unloading after bootout gives up, when FAKE_UNLOAD_AFTER names the seconds it takes.
      if [[ -n "\${FAKE_UNLOAD_AFTER:-}" ]]; then (sleep "$FAKE_UNLOAD_AFTER"; rm -f "$FAKE_LOADED") >/dev/null 2>&1 & fi
      echo "$FAKE_BOOTOUT_ERROR" >&2
      exit 1
    fi
    rm -f "$FAKE_LOADED" ;;
  print)
    if [[ ! -e "$FAKE_LOADED" ]]; then echo "Could not find service" >&2; exit 113; fi ;;
esac
`,
  open: `#!/bin/bash
echo "open $*" >> "$FAKE_RECORD"
if [[ -n "\${FAKE_OPEN_ERROR:-}" ]]; then echo "$FAKE_OPEN_ERROR" >&2; exit 1; fi
`,
  pnpm: `#!/bin/bash
echo "pnpm $*" >> "$FAKE_RECORD"
`,
};

export type FakeRig = {
  // A home folder for the command, so it finds its job definition, its logs and its applet there, never in ~/Library.
  home: string;
  // The marker file whose presence is the job loaded.
  loaded: string;
  env: NodeJS.ProcessEnv;
  // The commands the fakes ran, one line each, in order.
  recorded: () => Promise<string[]>;
  clearRecord: () => Promise<void>;
};

// A rig inside the worktree's dist, never the OS temp folder or ~/Library, removed when the test that made it
// finishes. The hook comes from the test's own context, since the global one can name the wrong test while two run at
// once.
export async function fakeRig(onTestFinished: TestContext['onTestFinished'], name: string): Promise<FakeRig> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  const folder = await mkdtemp(join(REPO_ROOT, `dist/${name}-`));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  const home = join(folder, 'home');
  const bin = join(folder, 'bin');
  await mkdir(home);
  await mkdir(bin);
  for (const [command, text] of Object.entries(FAKES)) {
    await writeFile(join(bin, command), text);
    await chmod(join(bin, command), 0o755);
  }
  const record = join(folder, 'record');
  const loaded = join(folder, 'loaded');
  await writeFile(record, '');
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH ?? ''}`, FAKE_RECORD: record, FAKE_LOADED: loaded };
  delete env.SETLIST_NODE;
  return {
    home,
    loaded,
    env,
    recorded: async () => (await readFile(record, 'utf8')).split('\n').filter(Boolean),
    clearRecord: () => writeFile(record, ''),
  };
}
