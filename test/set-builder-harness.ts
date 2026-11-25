import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parseXml, XmlElement } from '@rgrove/parse-xml';
import { setName } from '../src/set-builder/build-set.ts';

// The set builder's test harness. Every test works in its own folder under the git-ignored dist/, inside
// the worktree, never in the system temp folder or the home folder. It reads built sets back with
// parse-xml directly, not through src/, so a test checks what the build wrote and not how.

export const REPO_ROOT = resolve(import.meta.dirname, '..');
export const FIXTURE_LIBRARY = resolve(REPO_ROOT, 'test/fixtures/set-builder/library');
export const FIXTURE_TEMPLATE = resolve(FIXTURE_LIBRARY, '_template/template Project/template.als');
export const STEM_MAP_PATH = resolve(REPO_ROOT, 'config/stem-map.json');

export const GOODNESS = 'Goodness of God-Victory-A-63.00bpm';
export const TRUST = 'Trust In God-CAN YOU IMAGINE--A-74.00bpm';
export const GRACE = 'This Is Amazing Grace-The Ascension-D-98.00bpm';
export const GREAT_ARE = 'Great Are You Lord-All Sons & Daughters Live-D-72.00bpm';
export const FIXTURE_SONGS = [GOODNESS, TRUST, GRACE, GREAT_ARE];

// Goodness of God's stems in track order, each one clip that ends on the song's audio end (scripts/make-song-fixtures.mjs).
export const GOODNESS_STEMS = ['Click Track', 'Guide', 'Drums', 'Tambourine 1', 'Bass', 'AG', 'AG 3', 'Mandolin', 'EG 1', 'EG 2', 'EG 4', 'Piano', 'Rhodes', 'Strings', 'Oohs'];

// A song saved by Live 8.4.2, made by scripts/make-song-fixtures.mjs, kept outside the fixture library and copied into a
// workspace's library only by the tests that need it.
const LIVE_8_FIXTURES = resolve(REPO_ROOT, 'test/fixtures/set-builder/live-8');
export const LIVE_8_SONG = 'There Is Freedom-Where the Glory Is-A-76.00bpm';

export const DATE = '2026-10-18';

export const PROJECT_INFO = 'Ableton Project Info';
// Two of the files MultiTracks ships in a song's Ableton Project Info folder.
const PROJECT_INFO_FILES = ['Project8_1.cfg', 'MTicon.icns'];

// `setManifest` is the set manifest every build in a test writes, inside the workspace, never the one in the home folder
// the server reads. `showFolder` is the show folder every build in a test passes as --show-folder, inside the workspace,
// never the real Eos show folder, ~/Documents/ETC. createWorkspace does not make it: a show folder that is not there is a
// build with no template show file.
export type Workspace = { dir: string; library: string; template: string; outputRoot: string; setManifest: string; showFolder: string };

const workspaces: string[] = [];

// A copy of the fixture library, with what the fixtures leave out written into each song's folder: a tiny WAV
// at every path the song's clips refer to and its .asd analysis file beside it, both last modified at the
// clip's LastModDate as in the real library, and an Ableton Project Info folder. Every file's bytes name its
// song and path, so a file copied from the wrong song or stem never equals the right one.
export async function createWorkspace(): Promise<Workspace> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  const dir = await mkdtemp(join(REPO_ROOT, 'dist/set-builder-'));
  workspaces.push(dir);
  const library = join(dir, 'library');
  await cp(FIXTURE_LIBRARY, library, { recursive: true });
  for (const song of FIXTURE_SONGS) {
    for (const { relativePath, lastModDate } of await clipFiles(join(library, song, 'MultiTrack.als'))) {
      const wav = join(library, song, relativePath);
      await mkdir(dirname(wav), { recursive: true });
      await writeFile(wav, labelledWav(`${song}/${relativePath}`));
      await writeFile(`${wav}.asd`, `Analysis of ${song}/${relativePath}`);
      for (const file of [wav, `${wav}.asd`]) await utimes(file, lastModDate, lastModDate);
    }
    const projectInfo = join(library, song, PROJECT_INFO);
    await mkdir(projectInfo);
    for (const file of PROJECT_INFO_FILES) await writeFile(join(projectInfo, file), `${file} of ${song}`);
  }
  return {
    dir,
    library,
    template: join(library, '_template/template Project/template.als'),
    outputRoot: join(dir, 'Sets'),
    setManifest: join(dir, 'set-manifest.json'),
    showFolder: join(dir, 'ETC'),
  };
}

export async function removeWorkspaces(): Promise<void> {
  await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

// The built project's folder, which holds the set, its Ableton Project Info and the copied audio. It and the set are
// named by setName, `<date> <weekday>`; the command tests check that name against the calendar themselves.
export function projectFolder(workspace: Workspace, date = DATE): string {
  return join(workspace.outputRoot, setName(date));
}

export function setPath(workspace: Workspace, date = DATE): string {
  return join(projectFolder(workspace, date), `${setName(date)}.als`);
}

// The template show name and the weekly show name prefix of config/lights.json, written out here so a test never agrees
// with the command by reading the same file.
export const TEMPLATE_SHOW_NAME = 'Church Sunday template';
export const WEEKLY_SHOW_PREFIX = 'Church Sunday';

// A show file in the workspace's show folder, named as Eos names each save, `<show name> <YYYY-MM-DD HH-MM-SS>.esf3d`,
// holding `bytes`. It makes the show folder when it is not there. Returns the file's path.
export async function addShowFile(workspace: Workspace, showName: string, timestamp: string, bytes: string | Buffer): Promise<string> {
  await mkdir(workspace.showFolder, { recursive: true });
  const path = join(workspace.showFolder, `${showName} ${timestamp}.esf3d`);
  await writeFile(path, bytes);
  return path;
}

// A template show file in the workspace's show folder, saved at `timestamp`, holding `bytes`. No real show file is a
// fixture: a test's template is whatever bytes name it.
export function addTemplateShow(workspace: Workspace, timestamp: string, bytes: string | Buffer): Promise<string> {
  return addShowFile(workspace, TEMPLATE_SHOW_NAME, timestamp, bytes);
}

// A weekly show file for the set of `date` in the workspace's show folder, saved at `timestamp`, holding `bytes`, named as
// the build names the one it makes: `Church Sunday <date> <YYYY-MM-DD HH-MM-SS>.esf3d`.
export function addWeeklyShow(workspace: Workspace, date: string, timestamp: string, bytes: string | Buffer): Promise<string> {
  return addShowFile(workspace, `${WEEKLY_SHOW_PREFIX} ${date}`, timestamp, bytes);
}

// A connections config file in the workspace whose "eos" section points at 127.0.0.1 on `eos`, a fake Eos's port, with
// cue list 1, whose "propresenter" section points at 127.0.0.1 on `proPresenter`, a fake ProPresenter's port, and
// whatever other sections `others` gives. Returns its path. The lights mode's default is the connections config in the
// home folder, which points at the real Eos and the real ProPresenter on this Mac, so every run of the mode in a test
// names this file.
export async function writeConnectionsConfig(workspace: Workspace, eos: number, proPresenter: number, others: Record<string, unknown> = {}): Promise<string> {
  const path = join(workspace.dir, `connections-${eos}.json`);
  await writeFile(path, `${JSON.stringify({ targets: { eos: { host: '127.0.0.1', port: eos, cueList: 1 }, propresenter: { host: '127.0.0.1', port: proPresenter }, ...others } }, null, 2)}\n`);
  return path;
}

// The lights mode's paths, each inside the workspace: the output root the set was built under, the show folder, and the
// connections config that points at a fake Eos and a fake ProPresenter.
export function lightsPaths(workspace: Workspace, connectionsConfig: string): string[] {
  return ['--output-root', workspace.outputRoot, '--show-folder', workspace.showFolder, '--connections-config', connectionsConfig];
}

// The line a build prints after the set's path when the workspace's show folder holds no template show file, as it holds
// none in every test that adds none.
export function noTemplateLine(workspace: Workspace): string {
  return `The lights step is not done: no template show file named "Church Sunday template" was found in ${workspace.showFolder}.`;
}

// A file in a song's MultiTracks folder in the workspace library.
export function libraryFile(workspace: Workspace, song: string, file: string): string {
  return join(workspace.library, song, 'MultiTracks', file);
}

export async function readStemMap(): Promise<Record<string, string[]>> {
  return JSON.parse(await readFile(STEM_MAP_PATH, 'utf8')) as Record<string, string[]>;
}

// Variant inputs, derived from the committed fixtures inside a workspace.

async function editSet(path: string, edit: (xml: string) => string): Promise<void> {
  const xml = await readSetXml(path);
  const edited = edit(xml);
  if (edited === xml) throw new Error(`The edit changed nothing in ${path}`);
  await writeFile(path, gzipSync(edited));
}

// The song as if MultiTracks had left out its blank-named end marker.
export async function removeBlankLocator(workspace: Workspace, song: string): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(/\n\t*<Locator Id="\d+">(?:(?!<\/Locator>)[\s\S])*?<Name Value=" " \/>[\s\S]*?<\/Locator>/, ''),
  );
}

// The song as if its locator named `name` had been deleted in Live.
export async function removeLocator(workspace: Workspace, song: string, name: string): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(new RegExp(`\\n\\t*<Locator Id="\\d+">(?:(?!</Locator>)[\\s\\S])*?<Name Value="${name}" />[\\s\\S]*?</Locator>`), ''),
  );
}

// The song as if it held no locators at all, as Live 12 can save a set.
export async function removeLocators(workspace: Workspace, song: string): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) => xml.replaceAll(/\n\t*<Locator Id="\d+">[\s\S]*?<\/Locator>/g, ''));
}

// The song as if its blank-named end marker had been given the name `name`.
export async function nameBlankLocator(workspace: Workspace, song: string, name: string): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(/(<Locator Id="\d+">(?:(?!<\/Locator>)[\s\S])*?<Name Value=)" "/, `$1"${name}"`),
  );
}

// The song as if its blank-named end marker had been moved to beat `time`.
export async function moveBlankLocator(workspace: Workspace, song: string, time: number): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(/(<Locator Id="\d+">(?:(?!<\/Locator>)[\s\S])*?<Time Value=)"[^"]*"((?:(?!<\/Locator>)[\s\S])*?<Name Value=" ")/, `$1"${time}"$2`),
  );
}

// The song as if its locator named `name` had been moved to beat `time` in Live.
export async function moveLocator(workspace: Workspace, song: string, name: string, time: number): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(new RegExp(`(<Locator Id="\\d+">(?:(?!</Locator>)[\\s\\S])*?<Time Value=)"[^"]*"((?:(?!</Locator>)[\\s\\S])*?<Name Value="${name}" />)`), `$1"${time}"$2`),
  );
}

// The song as if its tempo and time-signature events had been stored with their Ids in reverse, each
// envelope's events keeping their stored order.
export async function reverseEnvelopeEventIds(workspace: Workspace, song: string): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(/<MainTrack [\s\S]*?<\/MainTrack>/, (mainTrack) =>
      mainTrack.replaceAll(/<Events>[\s\S]*?<\/Events>/g, (events) => {
        let id = (events.match(/<(?:Float|Enum)Event Id="/g) ?? []).length;
        return events.replaceAll(/<(Float|Enum)Event Id="\d+"/g, (_, kind: string) => `<${kind}Event Id="${--id}"`);
      }),
    ),
  );
}

// The song as if its main track held these extra events, each [Time, Value], stored after its own: `kind`
// FloatEvent adds to the tempo envelope, EnumEvent to the time-signature one.
export async function addMainTrackEvents(workspace: Workspace, song: string, kind: 'FloatEvent' | 'EnumEvent', events: [number, number][]): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(/<MainTrack [\s\S]*?<\/MainTrack>/, (mainTrack) =>
      mainTrack.replace(new RegExp(`\\n(\\t*)<${kind} Id="(\\d+)"[^\\n]*(?=\\n\\t*</Events>)`), (last, indent: string, id: string) =>
        [last, ...events.map(([time, value], index) => `\n${indent}<${kind} Id="${Number(id) + 1 + index}" Time="${time}" Value="${value}" />`)].join(''),
      ),
    ),
  );
}

// The song as if its main track's `kind` event before beat 0, the one Live writes at -63072000, had been moved to beat
// 1, so the song has no starting value: FloatEvent for the tempo, EnumEvent for the time signature.
export async function moveStartingMainTrackEvent(workspace: Workspace, song: string, kind: 'FloatEvent' | 'EnumEvent'): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(/<MainTrack [\s\S]*?<\/MainTrack>/, (mainTrack) => mainTrack.replace(new RegExp(`(<${kind} Id="\\d+" Time=)"-63072000"`), '$1"1"')),
  );
}

// The audio track named `name` in a set's track list, a song's or the template's: its text, from the line break
// before <AudioTrack> to </AudioTrack>, and where that text starts in the set. `set` names the set in the error when
// it has no such track.
function audioTrack(set: string, xml: string, name: string): { start: number; text: string } {
  const track = [...xml.matchAll(/\n\t\t\t<AudioTrack [\s\S]*?\n\t\t\t<\/AudioTrack>/g)].find((candidate) =>
    candidate[0].includes(`\n\t\t\t\t\t<EffectiveName Value="${name}" />`),
  );
  if (!track) throw new Error(`${set} has no audio track ${name}`);
  return { start: track.index, text: track[0] };
}

// The song as if its tracks named `first` and `second` had swapped places in Live's track list.
export async function swapSongTracks(workspace: Workspace, song: string, first: string, second: string): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) => {
    const [a, b] = [first, second].map((name) => audioTrack(song, xml, name)).toSorted((x, y) => x.start - y.start);
    if (!a || !b) throw new Error('Two tracks are needed');
    return xml.slice(0, a.start) + b.text + xml.slice(a.start + a.text.length, b.start) + a.text + xml.slice(b.start + b.text.length);
  });
}

// The song as if its audio track named `track` had been changed in Live: `edit` rewrites that track's text.
export async function editSongTrack(workspace: Workspace, song: string, track: string, edit: (text: string) => string): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) => {
    const { start, text } = audioTrack(song, xml, track);
    return xml.slice(0, start) + edit(text) + xml.slice(start + text.length);
  });
}

// The song as if another Live had saved it: each of `attributes` replaces the root element's attribute of that name,
// and one given as undefined is removed.
export async function setSongVersion(workspace: Workspace, song: string, attributes: Record<string, string | undefined>): Promise<void> {
  await editSet(join(workspace.library, song, 'MultiTrack.als'), (xml) =>
    xml.replace(/<Ableton [^>]*>/, (root) =>
      Object.entries(attributes).reduce((tag, [name, value]) => tag.replace(new RegExp(` ${name}="[^"]*"`), value === undefined ? '' : ` ${name}="${value}"`), root),
    ),
  );
}

// The library as if it also held the Live 8 song, with no audio: a build stops before it reads any clip.
export async function addLive8Song(workspace: Workspace): Promise<void> {
  await cp(join(LIVE_8_FIXTURES, LIVE_8_SONG), join(workspace.library, LIVE_8_SONG), { recursive: true, errorOnExist: true, force: false });
}

// Every folder and file under `path`, by its path from `path`: a folder as 'folder', a file as the sha256 of
// its bytes. Undefined when `path` does not exist.
export async function snapshotFolder(path: string): Promise<Record<string, string> | undefined> {
  if (!existsSync(path)) return undefined;
  const snapshot: Record<string, string> = {};
  for (const entry of await readdir(path, { recursive: true, withFileTypes: true })) {
    const full = join(entry.parentPath, entry.name);
    snapshot[relative(path, full)] = entry.isDirectory() ? 'folder' : createHash('sha256').update(await readFile(full)).digest('hex');
  }
  return snapshot;
}

// The song as if the library held no .asd analysis file for its WAV `file`.
export async function removeAnalysisFile(workspace: Workspace, song: string, file: string): Promise<void> {
  await rm(`${libraryFile(workspace, song, file)}.asd`);
}

// The song as if its folder held no Ableton Project Info folder.
export async function removeProjectInfo(workspace: Workspace, song: string): Promise<void> {
  await rm(join(workspace.library, song, PROJECT_INFO), { recursive: true });
}

// A second library folder, `folder`, holding a copy of the song.
export async function copySongAs(workspace: Workspace, song: string, folder: string): Promise<void> {
  await cp(join(workspace.library, song), join(workspace.library, folder), { recursive: true, errorOnExist: true, force: false });
}

// The template as if it had been saved with the arrangement loop on and the playhead at beat 8.
export async function saveTemplateLooping(workspace: Workspace): Promise<void> {
  await editSet(workspace.template, (xml) =>
    xml.replace(/(<Transport>[\s\S]*?<LoopOn Value=)"false"/, '$1"true"').replace(/(<Transport>[\s\S]*?<CurrentTime Value=)"0"/, '$1"8"'),
  );
}

// The template as if its audio track named `name` had been dragged to the top of Live's track list.
export async function moveTemplateTrackFirst(workspace: Workspace, name: string): Promise<void> {
  await editSet(workspace.template, (xml) => {
    const { start, text } = audioTrack('The template', xml, name);
    return (xml.slice(0, start) + xml.slice(start + text.length)).replace('<Tracks>', `<Tracks>${text}`);
  });
}

// The template as if a track had been renamed in Live: its EffectiveName and UserName both become `to`.
export async function renameTemplateTrack(workspace: Workspace, from: string, to: string): Promise<void> {
  await editSet(workspace.template, (xml) => xml.replaceAll(`Name Value="${from}" />`, `Name Value="${to}" />`));
}

// The template as if an audio track named PAD had been added in Live outside every group, after the last audio track
// and before the return tracks: a copy of its GUIDE track, renamed, with a track Id no other track or group uses.
export async function addPadTrack(workspace: Workspace): Promise<void> {
  await editSet(workspace.template, (xml) => {
    const ids = [...xml.matchAll(/\n\t\t\t<(?:AudioTrack|GroupTrack|ReturnTrack|MidiTrack) Id="(\d+)"/g)].map((match) => Number(match[1]));
    const pad = audioTrack('The template', xml, 'GUIDE')
      .text.replaceAll('Name Value="GUIDE" />', 'Name Value="PAD" />')
      .replace(/<AudioTrack Id="\d+"/, `<AudioTrack Id="${Math.max(...ids) + 1}"`);
    const returns = xml.indexOf('\n\t\t\t<ReturnTrack ');
    return xml.slice(0, returns) + pad + xml.slice(returns);
  });
}

// The modification time, in Unix seconds, addPad gives every pad file it writes.
export const PAD_MODIFIED = 1_760_000_000;

export type PadOptions = {
  // The WAV's sample rate. A low rate keeps a pad of many seconds small.
  sampleRate?: number;
  // The folder the pad goes in: the library's _pads folder by default.
  folder?: string;
  // Writes a LIST chunk of an odd length, so followed by a pad byte, between the fmt and data chunks, as pad packs ship.
  listChunk?: boolean;
  // Leaves this many bytes of its audio out of the file's end, its header still giving the whole length, as an
  // interrupted copy or download leaves a file.
  cutShort?: number;
};

// A silent 16-bit mono PCM pad `seconds` long, written as `<key>.wav` and last modified at PAD_MODIFIED. Returns its
// path.
export async function addPad(workspace: Workspace, key: string, seconds: number, options: PadOptions = {}): Promise<string> {
  const { sampleRate = 1000, folder = join(workspace.library, '_pads'), listChunk = false, cutShort = 0 } = options;
  const path = join(folder, `${key}.wav`);
  await mkdir(folder, { recursive: true });
  const list = Buffer.concat([Buffer.from('INFOISFT'), Buffer.from([5, 0, 0, 0]), Buffer.from('Pads\0')]);
  const bytes = wav(sampleRate, Buffer.alloc(seconds * sampleRate * 2), listChunk ? [['LIST', list]] : []);
  await writeFile(path, bytes.subarray(0, bytes.length - cutShort));
  await utimes(path, PAD_MODIFIED, PAD_MODIFIED);
  return path;
}

// Reading a set.

export async function readSetXml(path: string): Promise<string> {
  return gunzipSync(await readFile(path)).toString('utf8');
}

export async function readSet(path: string): Promise<XmlElement> {
  const root = parseXml(await readSetXml(path)).root;
  if (!root) throw new Error(`${path} has no root element`);
  return root;
}

export function elements(parent: XmlElement, name?: string): XmlElement[] {
  return parent.children.filter((node): node is XmlElement => node instanceof XmlElement && (!name || node.name === name));
}

export function element(parent: XmlElement, ...path: string[]): XmlElement {
  let current = parent;
  for (const name of path) {
    const next = elements(current, name)[0];
    if (!next) throw new Error(`No <${name}> in <${current.name}>`);
    current = next;
  }
  return current;
}

export function value(parent: XmlElement, ...path: string[]): string {
  const found = element(parent, ...path).attributes.Value;
  if (found === undefined) throw new Error(`<${path.join('/')}> has no Value`);
  return found;
}

// A track's arrangement clip list: the MainSequencer's, never the FreezeSequencer's, which has its own
// Sample.
export function arrangementEvents(track: XmlElement): XmlElement {
  return element(track, 'DeviceChain', 'MainSequencer', 'Sample', 'ArrangerAutomation', 'Events');
}

export const trackName = (track: XmlElement) => value(track, 'Name', 'EffectiveName');
export const arrangementClips = (track: XmlElement) => elements(arrangementEvents(track), 'AudioClip');
// The stem a clip plays: its WAV's file name.
export const stemOf = (clip: XmlElement) => basename(value(clip, 'SampleRef', 'FileRef', 'RelativePath'), '.wav');

// A clip's fades: its fade-in and fade-out lengths, in beats, and whether each is Live's default.
export function fadesOf(clip: XmlElement) {
  const fade = (name: string) => value(clip, 'Fades', name);
  return { in: Number(fade('FadeInLength')), out: Number(fade('FadeOutLength')), defaultIn: fade('IsDefaultFadeIn'), defaultOut: fade('IsDefaultFadeOut') };
}

// The template's slots for a group: the audio tracks whose TrackGroupId is the group track's Id, in track order.
export function slots(root: XmlElement, group: string): XmlElement[] {
  const tracks = element(root, 'LiveSet', 'Tracks');
  const groupTrack = elements(tracks, 'GroupTrack').find((track) => trackName(track) === group);
  if (!groupTrack) throw new Error(`No group track ${group}`);
  return elements(tracks, 'AudioTrack').filter((track) => value(track, 'TrackGroupId') === groupTrack.attributes.Id);
}

// A single track sits outside every group: its TrackGroupId is -1.
export function singleTrack(root: XmlElement, name: string): XmlElement {
  const track = elements(element(root, 'LiveSet', 'Tracks'), 'AudioTrack').find(
    (candidate) => trackName(candidate) === name && value(candidate, 'TrackGroupId') === '-1',
  );
  if (!track) throw new Error(`No track ${name}`);
  return track;
}

// The main track's envelope events for its Tempo or TimeSignature parameter, each as [Time, Value], in stored order.
// The envelope is matched by the parameter's AutomationTarget Id, never by position.
export function envelopeEvents(root: XmlElement, parameter: 'Tempo' | 'TimeSignature'): [number, number][] {
  const mainTrack = element(root, 'LiveSet', 'MainTrack');
  const target = element(mainTrack, 'DeviceChain', 'Mixer', parameter, 'AutomationTarget').attributes.Id;
  const envelope = elements(element(mainTrack, 'AutomationEnvelopes', 'Envelopes'), 'AutomationEnvelope').find(
    (candidate) => value(candidate, 'EnvelopeTarget', 'PointeeId') === target,
  );
  if (!envelope) throw new Error(`No envelope for ${parameter}`);
  return elements(element(envelope, 'Automation', 'Events')).map((event) => [Number(event.attributes.Time), Number(event.attributes.Value)]);
}

// The set's locators, in stored order, each with its Time and Name.
export function locatorList(root: XmlElement): { time: number; name: string }[] {
  return elements(element(root, 'LiveSet', 'Locators', 'Locators'), 'Locator').map((locator) => ({
    time: Number(value(locator, 'Time')),
    name: value(locator, 'Name'),
  }));
}

// Each clip's file, as the path from the song's folder, and the file's modification time in Unix seconds.
async function clipFiles(alsPath: string): Promise<{ relativePath: string; lastModDate: number }[]> {
  const liveSet = element(await readSet(alsPath), 'LiveSet');
  return elements(element(liveSet, 'Tracks'), 'AudioTrack').flatMap((track) =>
    elements(arrangementEvents(track), 'AudioClip').map((clip) => ({
      relativePath: value(clip, 'SampleRef', 'FileRef', 'RelativePath'),
      lastModDate: Number(value(clip, 'SampleRef', 'LastModDate')),
    })),
  );
}

// A valid 16-bit mono PCM WAV at 44100 Hz whose samples spell `label`, padded to a whole sample.
function labelledWav(label: string): Buffer {
  const text = Buffer.from(label);
  return wav(44100, Buffer.concat([text, Buffer.alloc(text.length % 2)]));
}

// A 16-bit mono PCM WAV of `samples` at `sampleRate`, with `chunks`, each [id, body], between its fmt and data chunks.
// A chunk of an odd length is followed by a pad byte, as RIFF requires.
function wav(sampleRate: number, samples: Buffer, chunks: [string, Buffer][] = []): Buffer {
  const chunk = (id: string, body: Buffer) => {
    const header = Buffer.alloc(8);
    header.write(id, 0);
    header.writeUInt32LE(body.length, 4);
    return Buffer.concat([header, body, Buffer.alloc(body.length % 2)]);
  };
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(1, 2);
  format.writeUInt32LE(sampleRate, 4);
  format.writeUInt32LE(sampleRate * 2, 8);
  format.writeUInt16LE(2, 12);
  format.writeUInt16LE(16, 14);
  return chunk('RIFF', Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', format), ...chunks.map(([id, body]) => chunk(id, body)), chunk('data', samples)]));
}
