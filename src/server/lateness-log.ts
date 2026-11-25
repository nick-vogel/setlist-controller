import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CueCause } from './cues.ts';

// The lateness log: one JSON line per cue handed to a target, measured or not, for reading after a
// rehearsal, when the lead time is decided from it, with `pnpm lateness`. Lines are appended in the order written, one write at a time. A
// line that would take the file past its size moves the file to `<path>.1` first, replacing the one
// there, so the log never splits a line across the two. A write that fails is logged and dropped,
// and never stops the server or a cue.

// Beside server.log, which the launchd job writes, so the measurement is always on. The server
// writes here, and `pnpm lateness` reads here, unless each is given another path.
export const DEFAULT_LATENESS_LOG = join(homedir(), 'Library', 'Logs', 'setlist-controller', 'cue-lateness.log');

// Why a cue handed to a target has no lateness: Fire again has no beat it is due on, and any other
// cue the server did not see the playhead play across, such as a drag into the middle of a section,
// or a report more than half a bar from the cue's beat.
export type UnmeasuredReason = 'fire-again' | 'not-played-across';

type LineFields = {
  // The wall-clock time the cue was handed over, ISO 8601.
  time: string;
  // The target's name, its key in the config.
  target: string;
  song: number;
  title: string | null;
  // The cue's name: the section's, or "End".
  section: string;
  cause: CueCause;
  // The slide the cue showed, as the target numbers it, such as ProPresenter's presentation index:
  // a section's first slide, a slide inside it, or a song's End. Left out for a target that plans no
  // slides, and for a cue that showed none.
  slide?: number;
};

// A measured cue: how late it was handed over, and how late the target acted on it, in whole
// milliseconds. Null for actedMs when the target reports no acting on the cue. It has no unmeasured
// field.
export type MeasuredLine = LineFields & { lateMs: number; actedMs: number | null };

// A cue handed over with no time it was due: no lateness, and the reason.
export type UnmeasuredLine = LineFields & { lateMs: null; actedMs: null; unmeasured: UnmeasuredReason };

export type LatenessLine = MeasuredLine | UnmeasuredLine;

export type LatenessLog = {
  write(line: LatenessLine): void;
  // Resolves once every line written before it is in the file.
  close(): Promise<void>;
};

// A few rehearsals' worth of lines.
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export function openLatenessLog({ path, maxBytes = DEFAULT_MAX_BYTES }: { path: string; maxBytes?: number }): LatenessLog {
  let queue = Promise.resolve();
  // The file's size as this log last knew it, or null when it must read it again: at the first write,
  // and after a failed one.
  let size: number | null = null;

  const append = async (text: string) => {
    const bytes = Buffer.byteLength(text);
    if (size === null) {
      await mkdir(dirname(path), { recursive: true });
      size = await stat(path).then(
        (found) => found.size,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return 0;
          throw error;
        },
      );
    }
    if (size > 0 && size + bytes > maxBytes) {
      await rename(path, `${path}.1`);
      size = 0;
    }
    await appendFile(path, text);
    size += bytes;
  };

  return {
    write(line) {
      const text = `${JSON.stringify(line)}\n`;
      queue = queue.then(() =>
        append(text).catch((error: unknown) => {
          size = null;
          console.error(`Setlist server: could not write the lateness log at ${path}`, error);
        }),
      );
    },
    close: () => queue,
  };
}
