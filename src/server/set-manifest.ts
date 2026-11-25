import { watch, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { parseSetManifest, type ManifestSong, type SetCharts } from '../shared/set-manifest.ts';

// The set manifest as the server holds it (src/shared/set-manifest.ts): read at start, on the
// leader's Refresh, and when the file changes. The revision rises on each read that finds the file's
// text, or its absence, changed, and only then does onChange run, so the pages fetch the charts again
// only when there is something new. The set poll never reads it.

export type SetManifestFile = {
  // 1 after the read at start, whatever it found.
  revision(): number;
  // The songs the last read found, none for no file or one that cannot be read.
  charts(): SetCharts;
  // Why the last read found no songs in a file that is there, or null.
  problem(): string | null;
  // Whether the last read found no file at the path, or there is no path. Not a problem: the server
  // logs nothing for it, but the Charts check names it (charts.ts).
  missing(): boolean;
  // Reads the file again, as the leader's Refresh does.
  reload(): Promise<void>;
  // Stops watching. No onChange runs after.
  close(): void;
};

// A rewrite can reach the folder as several events, so the read waits for them to settle.
const SETTLE_MS = 100;

// What a read found, as compared with the last read: the file's text, or none.
type Read = { text: string | null; songs: ManifestSong[]; problem: string | null; missing: boolean };

export async function startSetManifest({ path, onChange }: { path: string | null; onChange(): void }): Promise<SetManifestFile> {
  let last: Read = await read(path);
  let revision = 1;
  let closed = false;
  // One read at a time, in the order asked for, so a slow read never lands after a later one.
  let reading = Promise.resolve();
  const reload = () => {
    reading = reading.then(async () => {
      const next = await read(path);
      if (closed || next.text === last.text) return;
      last = next;
      revision += 1;
      report(path, last);
      onChange();
    });
    return reading;
  };
  report(path, last);

  // The folder, not the file: a file replaced by rename leaves a watch on the file itself watching
  // nothing.
  let watcher: FSWatcher | null = null;
  let settle: ReturnType<typeof setTimeout> | undefined;
  if (path !== null) {
    const name = basename(path);
    try {
      watcher = watch(dirname(path), (_event, changed) => {
        if (changed !== null && changed !== name) return;
        clearTimeout(settle);
        settle = setTimeout(() => void reload(), SETTLE_MS);
      });
      watcher.on('error', (error) => {
        console.error(`Setlist server: stopped watching the set manifest at ${path}; Refresh still reads it.`, error);
        watcher?.close();
        watcher = null;
      });
    } catch (error) {
      console.error(`Setlist server: cannot watch the set manifest's folder ${dirname(path)}: ${(error as Error).message}. Refresh still reads it.`);
    }
  }

  return {
    revision: () => revision,
    charts: () => ({ revision, songs: last.songs }),
    problem: () => last.problem,
    missing: () => last.missing,
    reload,
    close() {
      closed = true;
      clearTimeout(settle);
      watcher?.close();
      watcher = null;
    },
  };
}

async function read(path: string | null): Promise<Read> {
  if (path === null) return { text: null, songs: [], problem: null, missing: true };
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: null, songs: [], problem: null, missing: true };
    // Not the text of any file, so a file that becomes readable again counts as a change.
    return { text: `\0${(error as Error).message}`, songs: [], problem: `Could not read the set manifest at ${path}: ${(error as Error).message}`, missing: false };
  }
  const parsed = parseSetManifest(text);
  return 'problem' in parsed ? { text, songs: [], problem: parsed.problem, missing: false } : { text, songs: parsed.manifest.songs, problem: null, missing: false };
}

// Logs what a read found wrong, once per read that changed. No file is no problem: every song shows
// no chart text.
function report(path: string | null, read: Read) {
  if (read.problem !== null) console.error(`Setlist server: ${read.problem} No song shows chart text. (${path})`);
}
