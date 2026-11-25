import { open, readdir, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import type { LightsConfig } from './lights-config.ts';

// The weekly show file: that Sunday's copy of the template show file, in the show folder. Eos names a show file
// `<show name> <YYYY-MM-DD HH-MM-SS>.esf3d`, the time being the save's in the Mac's local time, and keeps every save as
// its own file. So the template show file is the newest file of the template show name by that time, and a weekly show
// file is named `<weekly show name prefix> <date of the set> <time of the copy>.esf3d`. File names alone decide all of
// it: no show file is opened as a show, and nothing here talks to Eos.

const EXTENSION = '.esf3d';
const SAVE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}$/;

// Makes the weekly show file for the set of `date` in `showFolder`, a byte-for-byte copy of the template show file, and
// gives its path; or undefined, with nothing made, when the folder holds no template show file, or is not there, as on
// a Mac with no Eos. A show folder that is there and cannot be read, a template that cannot be read, and a copy that
// fails each throw.
export async function makeWeeklyShow({ showFolder, config, date }: { showFolder: string; config: LightsConfig; date: string }): Promise<string | undefined> {
  const template = await newestShow(showFolder, config.templateShowName);
  if (template === undefined) return undefined;
  const bytes = await readFile(join(showFolder, template));
  // Created exclusively, so the copy never replaces a file. A file of the name already there is one made within the
  // same second, as a rebuild's can be: the name is taken again once the clock reaches its next second.
  for (;;) {
    const now = new Date();
    const path = join(showFolder, `${config.weeklyShowNamePrefix} ${date} ${saveTime(now)}${EXTENSION}`);
    const file = await open(path, 'wx').catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return undefined;
      throw error;
    });
    if (file === undefined) {
      await wait(1000 - now.getMilliseconds());
      continue;
    }
    try {
      await file.writeFile(bytes);
      await file.close();
    } catch (error) {
      // The file is this copy's own, made a moment ago, so a copy that fails part way takes it away again, and leaves
      // no half a show file under a weekly show file's name. Nothing else in the show folder is ever removed.
      await file.close().catch(() => {});
      await rm(path, { force: true }).catch(() => {});
      throw error;
    }
    return path;
  }
}

// The newest weekly show file for the set of `date` in `showFolder`, as its path: the one of that date whose name holds
// the latest save time, the build's own copy or a later save of it by Eos. Undefined when the folder holds none for the
// date, or is not there. A show folder that is there and cannot be read throws.
export async function newestWeeklyShow({ showFolder, config, date }: { showFolder: string; config: LightsConfig; date: string }): Promise<string | undefined> {
  const name = await newestShow(showFolder, `${config.weeklyShowNamePrefix} ${date}`);
  return name === undefined ? undefined : join(showFolder, name);
}

// The lines that name a weekly show file and the three steps that open it in ETCnomad, for the build to print after the
// set's summary.
export function weeklyShowLines(path: string): string[] {
  return [`Weekly show file: ${path}`, `Open it in ETCnomad: File, Open; ${basename(path)}; OK.`];
}

// The one line a build prints in place of those when the show folder holds no template show file, with the folder and
// the show name it looked for.
export function noTemplateLine(showFolder: string, templateShowName: string): string {
  return `The lights step is not done: no template show file named "${templateShowName}" was found in ${showFolder}.`;
}

// The name of the newest show file of a show name in the show folder, the template show file's for the template show
// name: of the files directly in it named `<show name> <save time>.esf3d`, the one with the latest save time, which is
// the greatest name, since the time is written at a fixed width from the year down. The show name is compared whole, by
// string operations, so a name with a character a pattern would read as its own still matches itself and nothing else.
async function newestShow(showFolder: string, showName: string): Promise<string | undefined> {
  const entries = await readdir(showFolder, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  const start = `${showName} `;
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(start) && name.endsWith(EXTENSION) && SAVE_TIME.test(name.slice(start.length, -EXTENSION.length)))
    .toSorted()
    .at(-1);
}

// A time as Eos writes it in a show file's name: YYYY-MM-DD HH-MM-SS, in local time.
function saveTime(time: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  const day = [time.getFullYear(), two(time.getMonth() + 1), two(time.getDate())].join('-');
  return `${day} ${[time.getHours(), time.getMinutes(), time.getSeconds()].map(two).join('-')}`;
}
