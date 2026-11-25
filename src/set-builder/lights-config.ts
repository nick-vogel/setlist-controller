import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The lights config at config/lights.json in this repository, beside the stem map: the names the lights step knows its
// show files and its song cues by. The template show file's show name, and the prefix a weekly show file's name starts
// with, before the date of the set. Eos names a show file `<show name> <YYYY-MM-DD HH-MM-SS>.esf3d`, so each name becomes
// part of a file name in the show folder. And the song cue label: the label of a song's cue in the template show file,
// with `{n}` where the song's number goes, "Song {n}" for the cues labelled Song 1, Song 2 and Song 3. And the rig facts
// of a song's colour: the channels of the colour lights, the only channels the lights step sets, and the saturation,
// from 0 to 100, they take a song's hue at.
export type LightsConfig = { templateShowName: string; weeklyShowNamePrefix: string; songCueLabel: string; colourChannels: number[]; saturation: number };

const FILE = 'config/lights.json';
const NAMES = ['templateShowName', 'weeklyShowNamePrefix'] as const;
// Where the song's number goes in the song cue label.
export const SONG_NUMBER = '{n}';

// The lights config, read and checked. Each failure throws one line that names the file, as the stem map's does: a file
// that cannot be read, or is not valid JSON, with the cause's own message kept on that line; a top level that is no
// object, with what it is instead; then a name that is missing, is no string, is empty, or holds a "/", which would
// make a file outside the show folder, every such name in the one line; then a song cue label that is missing, is no
// string, or holds no `{n}`, in a line of its own; then colour channels that are missing, no list, empty, or hold
// anything but whole numbers from 1 with none twice, in a line of their own; then a saturation that is missing or is no
// number from 0 to 100, in a line of its own. A key the lights step does not know is left alone.
export async function readLightsConfig(): Promise<LightsConfig> {
  const oneLine = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ');
  let text: string;
  try {
    text = await readFile(join(import.meta.dirname, '../..', FILE), 'utf8');
  } catch (error) {
    throw new Error(`${FILE} cannot be read: ${oneLine(error)}`, { cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${FILE} is not valid JSON: ${oneLine(error)}`, { cause: error });
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${FILE} must be an object that gives ${NAMES.join(' and ')}, and its top level is ${jsonKind(value)}.`);
  }
  const given = value as Record<string, unknown>;
  const problems = NAMES.flatMap((name) => {
    const problem = nameProblem(given[name]);
    return problem === undefined ? [] : [`${name} ${problem}`];
  });
  if (problems.length > 0) {
    throw new Error(`${FILE} must give ${NAMES.join(' and ')} each as a show name in quotes, not empty and with no "/" in it: ${problems.join(', and ')}.`);
  }
  const { songCueLabel } = given;
  const labelProblem = songCueLabel === undefined ? 'is missing' : typeof songCueLabel !== 'string' ? `is ${jsonKind(songCueLabel)}` : songCueLabel.includes(SONG_NUMBER) ? undefined : `holds no ${SONG_NUMBER}`;
  if (labelProblem !== undefined) {
    throw new Error(
      `${FILE} must give songCueLabel as the label of a song cue in quotes, with ${SONG_NUMBER} where the number of the song goes, such as "Song ${SONG_NUMBER}": songCueLabel ${labelProblem}.`,
    );
  }
  const { colourChannels, saturation } = given;
  const channelsProblem = colourChannelsProblem(colourChannels);
  if (channelsProblem !== undefined) {
    throw new Error(`${FILE} must give colourChannels as the channels of the colour lights, a list of whole numbers from 1 with none twice, such as [1, 2, 3, 16, 17, 18]: colourChannels ${channelsProblem}.`);
  }
  const saturationProblem =
    saturation === undefined ? 'is missing' : typeof saturation !== 'number' ? `is ${jsonKind(saturation)}` : saturation >= 0 && saturation <= 100 ? undefined : `is ${saturation}`;
  if (saturationProblem !== undefined) {
    throw new Error(`${FILE} must give saturation as the saturation the colour lights take, a number from 0 to 100, such as 80: saturation ${saturationProblem}.`);
  }
  return {
    templateShowName: given.templateShowName as string,
    weeklyShowNamePrefix: given.weeklyShowNamePrefix as string,
    songCueLabel: songCueLabel as string,
    colourChannels: colourChannels as number[],
    saturation: saturation as number,
  };
}

// What is wrong with the colour channels as the config gives them, to follow their key in the problem line, or
// undefined for a list of channels Eos can hold.
function colourChannelsProblem(value: unknown): string | undefined {
  if (value === undefined) return 'is missing';
  if (!Array.isArray(value)) return `is ${jsonKind(value)}`;
  if (value.length === 0) return 'is empty';
  const wrong = value.find((channel) => !(typeof channel === 'number' && Number.isInteger(channel) && channel >= 1));
  if (wrong !== undefined) return `holds ${JSON.stringify(wrong)}`;
  const twice = value.find((channel, at) => value.indexOf(channel) !== at);
  return twice === undefined ? undefined : `holds ${twice} twice`;
}

// What is wrong with a show name as the config gives it, to follow the name's key in the problem line, or undefined for
// a name the show folder can hold.
function nameProblem(value: unknown): string | undefined {
  if (value === undefined) return 'is missing';
  if (typeof value !== 'string') return `is ${jsonKind(value)}`;
  if (value.trim() === '') return 'is empty';
  if (value.includes('/')) return 'holds a "/"';
  return undefined;
}

// A parsed JSON value that is not what the config asks for, as a problem line names it.
function jsonKind(value: unknown): string {
  if (Array.isArray(value)) return 'a list';
  if (value === null || typeof value === 'boolean') return String(value);
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}
