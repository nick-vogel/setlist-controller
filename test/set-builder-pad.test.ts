import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { XmlElement } from '@rgrove/parse-xml';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSet, type BuildOptions, type Transition } from '../src/set-builder/build-set.ts';
import { parseSet } from '../src/server/set-parser.ts';
import {
  addMainTrackEvents,
  addPad,
  addPadTrack,
  arrangementClips,
  copySongAs,
  createWorkspace,
  DATE,
  editSongTrack,
  element,
  elements,
  envelopeEvents,
  fadesOf,
  GOODNESS,
  GOODNESS_STEMS,
  GRACE,
  GREAT_ARE,
  locatorList,
  moveLocator,
  moveStartingMainTrackEvent,
  PAD_MODIFIED,
  projectFolder,
  readSet,
  readStemMap,
  removeLocator,
  removeWorkspaces,
  singleTrack,
  snapshotFolder,
  trackName,
  TRUST,
  value,
  type Workspace,
} from './set-builder-harness.ts';

afterEach(removeWorkspaces);

const PAD: Transition = { type: 'pad' };

// A pad file long enough for any pad clip in these tests: the longest, after Goodness of God with a 34 BPM fermata, plays
// the file to 94.678 s, and the file's last 20 s are kept clear of the clip, for the file's own fade-out.
const LONG = 120;

type Transitions = Partial<Record<number, Transition>>;

async function buildIn(workspace: Workspace, songs: string[], transitions: Transitions = {}, options: Partial<BuildOptions> = {}) {
  return buildSet({
    library: workspace.library,
    template: workspace.template,
    stemMap: await readStemMap(),
    songs,
    transitions,
    date: DATE,
    outputRoot: workspace.outputRoot,
    ...options,
  });
}

// Builds the songs, named by their folders, in `workspace`, with the transition after each song position `transitions`
// names, and checks that the controller's parser reads the built set with zero warnings.
async function build(workspace: Workspace, songs: string[], transitions: Transitions = {}, options: Partial<BuildOptions> = {}) {
  const result = await buildIn(workspace, songs, transitions, options);
  if (!result.ok) throw new Error(`The build stopped: ${result.problems.join('\n')}`);
  const root: XmlElement = await readSet(result.setPath);
  expect(parseSet(locatorList(root)).warnings).toEqual([]);
  return { result, root };
}

// The clips on the PAD track, in stored order, which is time order. Each is read as the pad tests check it: its Time,
// CurrentStart and CurrentEnd, its name and the file it plays, its Loop values in seconds of the file, and its fades;
// `xml` is the clip itself, for a test that reads more of it.
function padClips(root: XmlElement) {
  return arrangementClips(singleTrack(root, 'PAD')).map((xml) => {
    const loop = (name: string) => Number(value(xml, 'Loop', name));
    return {
      xml,
      time: Number(xml.attributes.Time),
      start: Number(value(xml, 'CurrentStart')),
      end: Number(value(xml, 'CurrentEnd')),
      name: value(xml, 'Name'),
      file: value(xml, 'SampleRef', 'FileRef', 'RelativePath'),
      loop: {
        LoopStart: loop('LoopStart'),
        StartRelative: loop('StartRelative'),
        HiddenLoopStart: loop('HiddenLoopStart'),
        LoopEnd: loop('LoopEnd'),
        OutMarker: loop('OutMarker'),
        HiddenLoopEnd: loop('HiddenLoopEnd'),
      },
      fades: fadesOf(xml),
    };
  });
}

// Checks that no audio track of the built set holds two clips that sound at once: sorted by start, each clip ends at or
// before the next one starts.
function expectNoOverlappingClips(root: XmlElement): void {
  for (const track of elements(element(root, 'LiveSet', 'Tracks'), 'AudioTrack')) {
    const clips = arrangementClips(track)
      .map((clip) => ({ start: Number(value(clip, 'CurrentStart')), end: Number(value(clip, 'CurrentEnd')) }))
      .toSorted((a, b) => a.start - b.start);
    clips.slice(1).forEach(({ start }, index) => {
      const before = clips[index];
      if (!before) throw new Error('No clip before');
      expect(before.end, `a clip on ${trackName(track)} that starts on ${start}`).toBeLessThanOrEqual(start);
    });
  }
}

// The first clip on the PAD track, as padClips reads it: the set's first Pad clip.
function firstPadClip(root: XmlElement) {
  const [clip] = padClips(root);
  if (!clip) throw new Error('No pad clip');
  return clip;
}

describe('the pads folder', () => {
  it('is never offered as a song: a short name that only the pads folder holds matches no song folder', async () => {
    const workspace = await createWorkspace();
    await addPad(workspace, 'A', 30);

    const result = await buildIn(workspace, ['pads']);

    expect(result).toEqual({
      ok: false,
      problems: [`"pads" matches no song folder in ${workspace.library}. The song folders are:\n  ${GOODNESS}\n  ${GREAT_ARE}\n  ${GRACE}\n  ${TRUST}`],
    });
  });

  it('is never offered as a song when the build names another folder in the library as its pads folder', async () => {
    const workspace = await createWorkspace();
    const pads = join(workspace.library, 'Pad Pack');
    await addPad(workspace, 'A', 30, { folder: pads });

    const result = await buildIn(workspace, ['pad pack'], {}, { pads });

    expect(result).toEqual({
      ok: false,
      problems: [`"pad pack" matches no song folder in ${workspace.library}. The song folders are:\n  ${GOODNESS}\n  ${GREAT_ARE}\n  ${GRACE}\n  ${TRUST}`],
    });
  });
});

describe('a build with no pad', () => {
  it('builds on a template with no PAD track', async () => {
    const workspace = await createWorkspace();

    const { result } = await build(workspace, [GRACE, GOODNESS]);

    expect(result.songs.map(({ startBar }) => startBar)).toEqual([1, 71]);
  });

  it('builds on a template with a PAD track, and leaves the PAD track with no clips', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);

    const { root } = await build(workspace, [GRACE, GOODNESS]);

    expect(padClips(root)).toEqual([]);
  });
});

// Builds `songs` over an output root that holds an earlier set, and checks that the build left the output root exactly
// as it was: every stop rule is checked before anything is written.
async function stoppedBuild(workspace: Workspace, songs: string[], transitions: Transitions, options: Partial<BuildOptions> = {}) {
  const earlier = join(workspace.outputRoot, '2026-10-11 Sunday');
  await mkdir(earlier, { recursive: true });
  await writeFile(join(earlier, '2026-10-11 Sunday.als'), 'An earlier set');
  const before = await snapshotFolder(workspace.outputRoot);
  const result = await buildIn(workspace, songs, transitions, options);
  expect(await snapshotFolder(workspace.outputRoot)).toEqual(before);
  return result;
}

describe('a pad the build cannot make', () => {
  // This Is Amazing Grace into Goodness of God: the clip plays A.wav from 2.653 s to 82.381 s (as "a pad between This Is
  // Amazing Grace and Goodness of God" works out), so with the file's last 20 s kept clear it needs 102.381 s. Goodness of
  // God alone, with a pad after it: from 0 s to 91.429 s, 19.048 s of its last 20 beats at 63 BPM, the 57.143 s Pad
  // section and the 15.238 s of its 4-bar fade, so it needs 111.429 s.
  it.each([
    { case: 'between two songs', songs: [GRACE, GOODNESS], seconds: 102.38, from: 2.653, to: 82.381, needs: 102.381 },
    { case: 'after the last song', songs: [GOODNESS], seconds: 111, from: 0, to: 91.429, needs: 111.429 },
  ])('stops on a pad file too short for its clip and the 20 s of its own fade-out, $case', async ({ songs, seconds, from, to, needs }) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', seconds);

    const result = await stoppedBuild(workspace, songs, { 1: PAD });

    expect(result).toEqual({
      ok: false,
      problems: [
        `The pad after song 1 plays A.wav, which lasts ${seconds} s. Its clip plays the file from ${from} s to ${to} s, and the file's last 20 s are its own fade-out, so the pad needs a file of at least ${needs} s.`,
      ],
    });
  });

  it('builds on a pad file just long enough for its clip and the 20 s of its own fade-out', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 102.4);

    const { result } = await build(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(result.songs.map(({ startBar }) => startBar)).toEqual([1, 81]);
  });

  it('stops on a pad after a song with no locator named Ending, where the pad starts, naming the song once for two pads after it', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    // Too short for any clip: a song with no Ending has no clip to measure the file against, so only the Ending is named.
    await addPad(workspace, 'A', 1);
    await addPad(workspace, 'D', 1);
    await removeLocator(workspace, GRACE, 'Ending');

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS, GRACE], { 1: PAD, 3: PAD });

    expect(result).toEqual({ ok: false, problems: [`${GRACE}: the song has no locator named Ending, where a pad starts.`] });
  });

  // A pad in its own key, too short for any clip, into a name that matches no song: with no song after it, the pad has no
  // clip to measure the file against, so only the match problem is named, rather than thrown on.
  it('stops on a short own-key pad into a name that matches no song with only the match problem, and does not throw', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 1);

    const result = await stoppedBuild(workspace, [GRACE, 'zzz'], { 1: { type: 'pad', key: 'A' } });

    expect(result).toEqual({
      ok: false,
      problems: [`"zzz" matches no song folder in ${workspace.library}. The song folders are:\n  ${GOODNESS}\n  ${GREAT_ARE}\n  ${GRACE}\n  ${TRUST}`],
    });
  });

  it("gives a pad's Ending and file-length problems after the Intro problems and the pads' own, in one pass", async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);
    await removeLocator(workspace, GRACE, 'Ending');
    await removeLocator(workspace, GREAT_ARE, 'Count Off');

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS, GREAT_ARE, GOODNESS], { 1: PAD, 2: { type: 'pad', key: 'E' }, 3: PAD });

    // The pad after Great Are You Lord, into Goodness of God, plays the 30 s A.wav from 5 s to 82.381 s.
    expect(result).toEqual({
      ok: false,
      problems: [
        `${GREAT_ARE}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`,
        `The pad after song 2 is in E, and the pads folder ${join(workspace.library, '_pads')} has no E.wav. The keys it has are A.`,
        `${GRACE}: the song has no locator named Ending, where a pad starts.`,
        "The pad after song 3 plays A.wav, which lasts 30 s. Its clip plays the file from 5 s to 82.381 s, and the file's last 20 s are its own fade-out, so the pad needs a file of at least 102.381 s.",
      ],
    });
  });

  // This Is Amazing Grace as if its Ending had been moved to 262, after its audio end, 258, and its Pad locator, 260.
  it('starts the pad clip on the Pad locator when the Ending comes after it, and plays the file from the end of its swell', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);
    await moveLocator(workspace, GRACE, 'Ending', 262);

    const { root } = await build(workspace, [GRACE, GOODNESS], { 1: PAD });

    const { start, end, loop } = firstPadClip(root);
    // No seconds before the Pad locator, so the clip plays A.wav from 10 s, then 57.142857 s and 15.238095 s as before.
    expect({ start, end, loopStart: loop.LoopStart, loopEnd: loop.LoopEnd }).toEqual({ start: 260, end: 336, loopStart: 10, loopEnd: expect.closeTo(82.380952, 6) });
  });

  it.each(['FloatEvent', 'EnumEvent'] as const)("leaves a pad's length unchecked, and does not throw, when the song after it has no starting %s", async (kind) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 1);
    await moveStartingMainTrackEvent(workspace, GOODNESS, kind);

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS, 'zzz'], { 1: PAD });

    expect(result).toEqual({ ok: false, problems: [expect.stringMatching(/^"zzz" matches no song folder/)] });
  });

  it('stops when the pads folder has no file for the next song\'s key, and lists the keys it has', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'E', 30);
    await addPad(workspace, 'D', 30);

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(result).toEqual({
      ok: false,
      problems: [`The pad after song 1 is in A, the key of ${GOODNESS}, and the pads folder ${join(workspace.library, '_pads')} has no A.wav. The keys it has are D, E.`],
    });
  });

  it('stops when the pads folder cannot be read', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(result).toEqual({ ok: false, problems: [`Cannot read the pads folder ${join(workspace.library, '_pads')}.`] });
  });

  it('stops when the template has no PAD track', async () => {
    const workspace = await createWorkspace();
    await addPad(workspace, 'A', LONG);

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(result).toEqual({
      ok: false,
      problems: ['The template has no single track named "PAD", which a pad plays on. Add an audio track named PAD outside every group.'],
    });
  });

  it('stops on a template with no PAD track along with a library that cannot be read', async () => {
    const workspace = await createWorkspace();
    const library = join(workspace.dir, 'no library');

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD }, { library });

    expect(result).toEqual({
      ok: false,
      problems: ['The template has no single track named "PAD", which a pad plays on. Add an audio track named PAD outside every group.', `Cannot read the song library ${library}.`],
    });
  });

  it("stops with every problem in one pass: the template's, then each song's, then each pad's", async () => {
    const workspace = await createWorkspace();
    await addPad(workspace, 'D', 30);
    const stemMap = await readStemMap();
    const withoutTambourine = { ...stemMap, DRUMS: (stemMap.DRUMS ?? []).filter((stem) => stem !== 'Tambourine 1') };

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD }, { stemMap: withoutTambourine });

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no single track named "PAD", which a pad plays on. Add an audio track named PAD outside every group.',
        `${GOODNESS}: the stem map has no group for the stem "Tambourine 1".`,
        `The pad after song 1 is in A, the key of ${GOODNESS}, and the pads folder ${join(workspace.library, '_pads')} has no A.wav. The keys it has are D.`,
      ],
    });
  });
});

// This Is Amazing Grace's audio ends on 258, inside a bar of its 4/4, so a pad after it has its Pad locator on the next
// bar line, 260, after 65 bars, set bar 66. The Pad section is 60 s at Goodness of God's 63 BPM, 63 beats, rounded down to
// 15 bars of its 4/4, 60 beats, so it runs to 320 and Goodness of God starts on set bar 81. Its Intro is 8 beats after its
// Count Off, on 328, and 2 bars of its 4/4 after that, 336, is where the pad goes silent. The pad clip starts on This Is
// Amazing Grace's Ending, 248: its 12 beats to the Pad locator at 98 BPM are 7.347 s, so the clip plays A.wav from
// 10 - 7.347 = 2.653 s, and the file's 10 s swell ends on the Pad locator.
async function graceIntoGoodness(options: { listChunk?: boolean } = {}) {
  const workspace = await createWorkspace();
  await addPadTrack(workspace);
  const pad = await addPad(workspace, 'A', LONG, options);
  return { workspace, pad, ...(await build(workspace, [GRACE, GOODNESS], { 1: PAD })) };
}

describe('a pad between This Is Amazing Grace and Goodness of God', () => {
  it("puts 1 - Pad on 260, keeps every locator of This Is Amazing Grace, and moves its End onto Goodness of God's Count Off, 320", async () => {
    const { root } = await graceIntoGoodness();

    const built = locatorList(root);
    expect(built.filter(({ name }) => name.startsWith('1 - '))).toEqual([
      { time: 0, name: '1 - Count Off (This Is Amazing Grace)' },
      { time: 8, name: '1 - Intro' },
      { time: 24, name: '1 - Verse 1' },
      { time: 56, name: '1 - Chorus' },
      { time: 88, name: '1 - Intro' },
      { time: 104, name: '1 - Verse 2' },
      { time: 136, name: '1 - Chorus' },
      { time: 168, name: '1 - Bridge' },
      { time: 184, name: '1 - Bridge' },
      { time: 200, name: '1 - Chorus' },
      { time: 232, name: '1 - Outro' },
      { time: 248, name: '1 - Ending' },
      { time: 260, name: '1 - Pad' },
      { time: 320, name: '1 - End' },
    ]);
    expect(built.filter(({ time }) => time === 320).map(({ name }) => name)).toEqual(['1 - End', '2 - Count Off (Goodness of God)']);
    expect(built.find(({ name }) => name === '2 - Intro')).toEqual({ time: 328, name: '2 - Intro' });
  });

  it("steps the tempo from 98 to 63 and the meter to Goodness of God's 4/4 on the Pad locator, 260, and starts Goodness of God on bar 81", async () => {
    const { result, root } = await graceIntoGoodness();

    // Goodness of God's own events from 320 on: its fermata, 299 to 300, and its 2/4 bars.
    expect(envelopeEvents(root, 'Tempo')).toEqual([
      [-63072000, 98],
      [260, 98],
      [260, 63],
      [619, 63],
      [619, 42],
      [620, 42],
      [620, 63],
    ]);
    // 201 is 4/4 and 199 is 2/4.
    expect(envelopeEvents(root, 'TimeSignature')).toEqual([
      [-63072000, 201],
      [260, 201],
      [424, 199],
      [426, 201],
      [522, 199],
      [524, 201],
    ]);
    expect(result.songs).toEqual([
      { folder: GRACE, title: 'This Is Amazing Grace', startBar: 1, tempo: 98, meter: '4/4', transition: { type: 'pad', key: 'A' } },
      { folder: GOODNESS, title: 'Goodness of God', startBar: 81, tempo: 63, meter: '4/4' },
    ]);
  });

  it("writes one pad clip on the PAD track, from This Is Amazing Grace's Ending, 248, through Goodness of God's Count Off to its Intro plus 2 bars, 336", async () => {
    const { root } = await graceIntoGoodness();

    expect(padClips(root).map(({ time, start, end, name, file }) => ({ time, start, end, name, file }))).toEqual([
      { time: 248, start: 248, end: 336, name: 'A', file: 'Songs/_pads/A.wav' },
    ]);
  });

  it('plays A.wav from 2.653 s, so its swell ends on the Pad locator, for the seconds each span lasts at its own tempo', async () => {
    const { root } = await graceIntoGoodness();

    // 12 beats at This Is Amazing Grace's 98 BPM are 7.346939 s, so the clip starts 10 - 7.346939 = 2.653061 s in. Then the
    // 60-beat Pad section and Goodness of God's 16 beats to its silence point, both at its 63 BPM, are 57.142857 s and
    // 15.238095 s: the clip ends 82.380952 s in.
    expect(firstPadClip(root).loop).toEqual({
      LoopStart: expect.closeTo(2.653061, 6),
      StartRelative: 0,
      HiddenLoopStart: expect.closeTo(2.653061, 6),
      LoopEnd: expect.closeTo(82.380952, 6),
      OutMarker: expect.closeTo(82.380952, 6),
      HiddenLoopEnd: expect.closeTo(82.380952, 6),
    });
  });

  it("leaves the pad clip's fade-in at Live's default, the file's own swell, and fades it out over the 2 bars from Goodness of God's Intro, 8 beats", async () => {
    const { root } = await graceIntoGoodness();

    expect(firstPadClip(root).fades).toEqual({ in: 0, out: 8, defaultIn: 'true', defaultOut: 'false' });
  });

  it("refers the pad clip to the pad file's copy in the project, with the file's real size, CRC 0, and the frames and sample rate its header gives", async () => {
    const { workspace, root } = await graceIntoGoodness({ listChunk: true });

    const sampleRef = element(firstPadClip(root).xml, 'SampleRef');
    expect({
      relativePathType: value(sampleRef, 'FileRef', 'RelativePathType'),
      relativePath: value(sampleRef, 'FileRef', 'RelativePath'),
      path: value(sampleRef, 'FileRef', 'Path'),
      size: value(sampleRef, 'FileRef', 'OriginalFileSize'),
      crc: value(sampleRef, 'FileRef', 'OriginalCrc'),
      lastModDate: value(sampleRef, 'LastModDate'),
      duration: value(sampleRef, 'DefaultDuration'),
      sampleRate: value(sampleRef, 'DefaultSampleRate'),
    }).toEqual({
      relativePathType: '3',
      relativePath: 'Songs/_pads/A.wav',
      path: join(projectFolder(workspace), 'Songs/_pads/A.wav'),
      // A 44-byte header, a 26-byte LIST chunk with its pad byte, and 120,000 frames of 2 bytes.
      size: '240070',
      crc: '0',
      lastModDate: String(PAD_MODIFIED),
      // 120 seconds at 1000 Hz.
      duration: '120000',
      sampleRate: '1000',
    });
  });

  it('copies A.wav into the project, at Songs/_pads/A.wav, byte for byte and with its modification time, and not its analysis file', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    const pad = await addPad(workspace, 'A', LONG);
    await writeFile(`${pad}.asd`, 'Analysis of A.wav');
    await build(workspace, [GRACE, GOODNESS], { 1: PAD });

    const copy = join(projectFolder(workspace), 'Songs/_pads/A.wav');
    expect(await readFile(copy)).toEqual(await readFile(pad));
    expect(Math.floor((await stat(copy)).mtimeMs / 1000)).toBe(PAD_MODIFIED);
    expect(await readdir(join(projectFolder(workspace), 'Songs/_pads'))).toEqual(['A.wav']);
  });

  it('puts no two clips that sound at once on one track', async () => {
    const { root } = await graceIntoGoodness();

    expect(padClips(root)).toHaveLength(1);
    expectNoOverlappingClips(root);
  });
});

// The Pad section is 60 s, whatever the pad file's length.
describe('the Pad section', () => {
  it.each([LONG, 300])("lasts 60 s at the next song's starting tempo, in whole bars of its starting meter, with a %s s pad file", async (seconds) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', seconds);

    const { result, root } = await build(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(locatorList(root).filter(({ name }) => ['1 - Pad', '1 - End'].includes(name))).toEqual([
      { time: 260, name: '1 - Pad' },
      { time: 320, name: '1 - End' },
    ]);
    expect(firstPadClip(root).end).toBe(336);
    expect(result.songs.map(({ startBar }) => startBar)).toEqual([1, 81]);
  });
});

// Great Are You Lord's Ending is on 252 and its audio ends on 258, a bar line of its 6/8: 6 beats at its 72 BPM, 5 s. So
// the pad clip plays A.wav from 10 - 5 = 5 s, and the file's swell ends on the Pad locator, 258. The Pad section is 60
// beats at Goodness of God's 63 BPM, to 318, and the pad goes silent 16 beats after Goodness of God's Count Off, on 334.
describe("a pad after a song whose last bars after its Ending are shorter than the pad file's swell", () => {
  it('starts the pad clip on the Ending, 252, and plays the file from 5 s', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);

    const { root } = await build(workspace, [GREAT_ARE, GOODNESS], { 1: PAD });

    const { start, end, loop } = firstPadClip(root);
    // 5 s, then the 57.142857 s Pad section and 15.238095 s of Goodness of God's first 16 beats.
    expect({ start, end, loopStart: loop.LoopStart, loopEnd: loop.LoopEnd }).toEqual({
      start: 252,
      end: 334,
      loopStart: expect.closeTo(5, 6),
      loopEnd: expect.closeTo(82.380952, 6),
    });
    expect(locatorList(root).filter(({ name }) => ['1 - Ending', '1 - Pad', '1 - End'].includes(name))).toEqual([
      { time: 252, name: '1 - Ending' },
      { time: 258, name: '1 - Pad' },
      { time: 318, name: '1 - End' },
    ]);
  });
});

// The pad clip ends 2 bars after the Intro of the song a pad goes into, the first section after its Count Off, so a pad
// into a song with no Count Off stops the build before anything is written.
describe('a pad into a song with no Count Off', () => {
  it('stops with the problem before the pads\' own, naming the song, and writes nothing', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);
    await removeLocator(workspace, GOODNESS, 'Count Off');

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD, 2: { type: 'pad', key: 'E' } });

    expect(result).toEqual({
      ok: false,
      problems: [
        `${GOODNESS}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`,
        `The pad after song 2 is in E, and the pads folder ${join(workspace.library, '_pads')} has no E.wav. The keys it has are A.`,
      ],
    });
  });

  it('names the song once when an overlap and a pad both go into it', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);
    await removeLocator(workspace, GOODNESS, 'Count Off');

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS, GRACE, GOODNESS], { 1: PAD, 3: { type: 'overlap' } });

    expect(result).toEqual({
      ok: false,
      problems: [`${GOODNESS}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`],
    });
  });
});


// The song as if its clip on the stem `track`, one clip from beat 0 in every fixture song, ended on `end`: the audio end,
// when no other clip of the song ends later.
function endClipOn(workspace: Workspace, song: string, track: string, end: string): Promise<void> {
  return editSongTrack(workspace, song, track, (text) => text.replace(/<CurrentEnd Value="[^"]*" \/>/, `<CurrentEnd Value="${end}" />`));
}

// Goodness of God's audio ends on 320.0000476, 4.76e-5 beat, 2 samples at its 63 BPM, past a bar line of its 4/4, less
// than the tolerance for "on a bar line" (ON_BAR_LINE_TOLERANCE, 2e-4 beat). Walked through its own meter, with its two
// 2/4 bars, that bar line is 320, reached after 81 bars, so a pad after it has its Pad locator on 320, set bar 82, with
// no bar of silence before it. Trust In God starts on 74 BPM and 6/8, 3 beats a bar, so the 60 s Pad section is 74
// beats, rounded down to 24 bars of 6/8, 72 beats: it runs to 392 and Trust In God starts on set bar 106. Its Intro is
// 6 beats after its Count Off, so the pad goes silent 2 bars of its 6/8 after that, on 404. The pad clip starts on
// Goodness of God's Ending, 300: its 20 beats to the Pad locator at 63 BPM are 19.048 s, longer than the file's 10 s
// swell, so the clip plays A.wav from its start.
describe('a pad between Goodness of God, whose audio ends 2 samples past a bar line, and Trust In God, which starts in 6/8', () => {
  async function goodnessIntoTrust(audioEnd?: string) {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);
    if (audioEnd) await endClipOn(workspace, GOODNESS, 'Oohs', audioEnd);
    return build(workspace, [GOODNESS, TRUST], { 1: PAD });
  }

  it('puts 1 - Pad on the bar line the audio end is on, 320, and sizes the Pad section in whole bars of 6/8, to 392', async () => {
    const { root } = await goodnessIntoTrust();

    expect(locatorList(root).filter(({ name }) => ['1 - Ending', '1 - Pad', '1 - End', '2 - Count Off (Trust In God)'].includes(name))).toEqual([
      { time: 300, name: '1 - Ending' },
      { time: 320, name: '1 - Pad' },
      { time: 392, name: '1 - End' },
      { time: 392, name: '2 - Count Off (Trust In God)' },
    ]);
  });

  it("writes the pad clip from the Ending, 300, to Trust In God's Intro plus 2 bars of its 6/8, 404, from the start of A.wav, fading out over 6 beats", async () => {
    const { root } = await goodnessIntoTrust();

    const { start, end, loop, fades } = firstPadClip(root);
    // 20 beats at Goodness of God's 63 BPM are 19.047619 s, then the 72-beat Pad section and Trust In God's 12 beats to its
    // silence point, both at its 74 BPM, are 58.378378 s and 9.729730 s: the clip ends 87.155727 s in.
    expect({ start, end, loopStart: loop.LoopStart, hiddenLoopStart: loop.HiddenLoopStart, loopEnd: loop.LoopEnd, outMarker: loop.OutMarker, fades }).toEqual({
      start: 300,
      end: 404,
      loopStart: 0,
      hiddenLoopStart: 0,
      loopEnd: expect.closeTo(87.155727, 6),
      outMarker: expect.closeTo(87.155727, 6),
      fades: { in: 0, out: 6, defaultIn: 'true', defaultOut: 'false' },
    });
  });

  it('steps the tempo to 74 and the meter to 6/8 on 320, and starts Trust In God on bar 106', async () => {
    const { result, root } = await goodnessIntoTrust();

    expect(envelopeEvents(root, 'Tempo').filter(([time]) => time >= 300 && time <= 392)).toEqual([
      [300, 42],
      [300, 63],
      [320, 63],
      [320, 74],
    ]);
    // 302 is 6/8.
    expect(envelopeEvents(root, 'TimeSignature').filter(([time]) => time >= 204 && time <= 392)).toEqual([
      [204, 201],
      [320, 302],
    ]);
    expect(result.songs.map(({ startBar, meter, transition }) => ({ startBar, meter, transition }))).toEqual([
      { startBar: 1, meter: '4/4', transition: { type: 'pad', key: 'A' } },
      { startBar: 106, meter: '6/8', transition: undefined },
    ]);
  });

  // Goodness of God as if its Oohs clip, the one that ends last, ended on 320.001, five times the tolerance past the bar
  // line at 320 (320.001 - 320 is 9.99999999976e-4 in floating point). That audio end is past the bar line, so the Pad
  // locator is on the next one, 324, set bar 83, and Trust In God starts on set bar 107.
  it('still puts 1 - Pad on the next bar line, 324, when the audio end is more than the tolerance past the bar line at 320', async () => {
    const { result, root } = await goodnessIntoTrust('320.001');

    expect(locatorList(root).filter(({ name }) => ['1 - Pad', '1 - End', '2 - Count Off (Trust In God)'].includes(name))).toEqual([
      { time: 324, name: '1 - Pad' },
      { time: 396, name: '1 - End' },
      { time: 396, name: '2 - Count Off (Trust In God)' },
    ]);
    expect(result.songs.map(({ startBar }) => startBar)).toEqual([1, 107]);
  });

  // Goodness of God as if its Oohs clip ended on 320.0003, half again the tolerance past the bar line at 320. That audio
  // end is past the bar line too, so the Pad locator is on the next one, 324, and Trust In God starts on set bar 107, as at
  // 320.001. It pins the tolerance under 3e-4, where 320.001 sits too far out to catch one raised past 2e-4.
  it('puts 1 - Pad on the next bar line, 324, when the audio end is 3e-4 beat past the bar line at 320, just past the tolerance', async () => {
    const { result, root } = await goodnessIntoTrust('320.0003');

    expect(locatorList(root).filter(({ name }) => ['1 - Pad', '1 - End', '2 - Count Off (Trust In God)'].includes(name))).toEqual([
      { time: 324, name: '1 - Pad' },
      { time: 396, name: '1 - End' },
      { time: 396, name: '2 - Count Off (Trust In God)' },
    ]);
    expect(result.songs.map(({ startBar }) => startBar)).toEqual([1, 107]);
  });
});

// Trust In God's audio ends on 318.00011585, 1.1585e-4 beat, about 4 samples at its 74 BPM, past the bar line of its 6/8 at
// 318, less than the tolerance for "on a bar line" (ON_BAR_LINE_TOLERANCE, 2e-4 beat). So a pad after it has its Pad
// locator on 318, set bar 107, with no bar of silence before it, where past the tolerance it would be a whole 6/8 bar, 3
// beats, later on 321. This Is Amazing Grace starts on 98 BPM and 4/4, so the 60 s Pad section is 98 beats, rounded down
// to 24 bars of 4/4, 96 beats: it runs to 414 and This Is Amazing Grace starts on set bar 131, where it would start on 132
// from 321. Its Intro is 8 beats after its Count Off, so the pad goes silent on 430. The pad clip starts on Trust In God's
// Ending, 309.
describe('a pad between Trust In God, whose audio ends 4 samples past a bar line, and This Is Amazing Grace', () => {
  async function trustIntoGrace() {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'D', LONG);
    return build(workspace, [TRUST, GRACE], { 1: PAD });
  }

  it('puts 1 - Pad on the bar line the audio end is on, 318, and starts the Pad section and This Is Amazing Grace a 6/8 bar earlier than on 321', async () => {
    const { result, root } = await trustIntoGrace();

    expect(locatorList(root).filter(({ name }) => ['1 - Pad', '1 - End', '2 - Count Off (This Is Amazing Grace)'].includes(name))).toEqual([
      { time: 318, name: '1 - Pad' },
      { time: 414, name: '1 - End' },
      { time: 414, name: '2 - Count Off (This Is Amazing Grace)' },
    ]);
    const { start, end } = firstPadClip(root);
    expect({ start, end }).toEqual({ start: 309, end: 430 });
    expect(result.songs.map(({ startBar }) => startBar)).toEqual([1, 131]);
  });
});

// Two pads, both in A: This Is Amazing Grace into Goodness of God as above, so Goodness of God starts on 320, set bar 81,
// then Goodness of God into Trust In God. Goodness of God's Pad locator is on its own 320, the bar line its audio end is
// on, set beat 640, set bar 162, and its 60 s Pad section at Trust In God's 74 BPM is 24
// bars of 6/8, 72 beats, so Trust In God starts on 712, set bar 186. The second pad clip starts on Goodness of God's
// Ending, its own 300, set beat 620.
describe('two pads in one set, both in A', () => {
  async function twoPads() {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);
    return { workspace, ...(await build(workspace, [GRACE, GOODNESS, TRUST], { 1: PAD, 2: PAD })) };
  }

  it('stacks the two Pad sections into the start bars and the locators', async () => {
    const { result, root } = await twoPads();

    expect(result.songs.map(({ startBar, transition }) => ({ startBar, transition }))).toEqual([
      { startBar: 1, transition: { type: 'pad', key: 'A' } },
      { startBar: 81, transition: { type: 'pad', key: 'A' } },
      { startBar: 186, transition: undefined },
    ]);
    expect(locatorList(root).filter(({ name }) => /^\d - (Pad|End|Count Off \(.*\))$/.test(name))).toEqual([
      { time: 0, name: '1 - Count Off (This Is Amazing Grace)' },
      { time: 260, name: '1 - Pad' },
      { time: 320, name: '1 - End' },
      { time: 320, name: '2 - Count Off (Goodness of God)' },
      { time: 640, name: '2 - Pad' },
      { time: 712, name: '2 - End' },
      { time: 712, name: '3 - Count Off (Trust In God)' },
      { time: 1036, name: '3 - End' },
    ]);
  });

  it("writes one pad clip on the PAD track for each pad, from the song's Ending to the next song's Intro plus 2 bars, and copies A.wav into the project once", async () => {
    const { workspace, root } = await twoPads();

    // Goodness of God's Intro is 8 beats after its Count Off, and 2 bars of its 4/4 later is 16; Trust In God's is 6 beats
    // after, and 2 bars of its 6/8 later is 12.
    const clips = padClips(root);
    expect(clips.map(({ start, end, file }) => ({ start, end, file }))).toEqual([
      { start: 248, end: 336, file: 'Songs/_pads/A.wav' },
      { start: 620, end: 724, file: 'Songs/_pads/A.wav' },
    ]);
    expect(clips.map(({ loop }) => [loop.LoopStart, loop.LoopEnd])).toEqual([
      [expect.closeTo(2.653061, 6), expect.closeTo(82.380952, 6)],
      [0, expect.closeTo(87.155727, 6)],
    ]);
    expect(await readdir(join(projectFolder(workspace), 'Songs/_pads'))).toEqual(['A.wav']);
  });

  it('puts no two clips that sound at once on one track', async () => {
    const { root } = await twoPads();

    expect(padClips(root)).toHaveLength(2);
    expectNoOverlappingClips(root);
  });
});

describe('the pad clip, when the clip it is copied from carries its own settings', () => {
  it("plays the pad clip at gain 1, untransposed, enabled and unlooped, with the pad's own fades, not the copied clip's", async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);
    // Goodness of God as if its first clip, the one on its Click Track that the pad clip is copied from, had been turned
    // down, transposed, deactivated, looped and faded in and out in Live. A warped clip or one with clip envelopes stops the
    // build (readSong).
    await editSongTrack(workspace, GOODNESS, 'Click Track', (track) =>
      track.replace(/<AudioClip [\s\S]*?<\/AudioClip>/, (clip) =>
        [
          ['<SampleVolume Value="1" />', '<SampleVolume Value="0.5" />'],
          ['<PitchCoarse Value="0" />', '<PitchCoarse Value="3" />'],
          ['<PitchFine Value="0" />', '<PitchFine Value="20" />'],
          ['<Disabled Value="false" />', '<Disabled Value="true" />'],
          ['<LoopOn Value="false" />', '<LoopOn Value="true" />'],
          ['<FadeInLength Value="0" />', '<FadeInLength Value="3" />'],
          ['<FadeOutLength Value="0" />', '<FadeOutLength Value="5" />'],
          ['<IsDefaultFadeIn Value="true" />', '<IsDefaultFadeIn Value="false" />'],
          ['<IsDefaultFadeOut Value="true" />', '<IsDefaultFadeOut Value="false" />'],
        ].reduce((edited, [from = '', to = '']) => {
          if (!edited.includes(from)) throw new Error(`The clip has no ${from}`);
          return edited.replace(from, to);
        }, clip),
      ),
    );

    const { root } = await build(workspace, [GRACE, GOODNESS], { 1: PAD });

    const clips = padClips(root);
    const plays = { volume: '1', pitchCoarse: '0', pitchFine: '0', disabled: 'false', loopOn: 'false' };
    expect(
      clips.map(({ xml, fades }) => ({
        volume: value(xml, 'SampleVolume'),
        pitchCoarse: value(xml, 'PitchCoarse'),
        pitchFine: value(xml, 'PitchFine'),
        disabled: value(xml, 'Disabled'),
        loopOn: value(xml, 'Loop', 'LoopOn'),
        fades,
      })),
    ).toEqual([{ ...plays, fades: { in: 0, out: 8, defaultIn: 'true', defaultOut: 'false' } }]);
  });
});

describe('a pad file cut short', () => {
  it('measures the audio the file holds, not the length its header gives', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    // A 120 s pad at 1000 Hz whose last 40000 bytes, 20000 frames, never arrived: the file holds 100 s, less than the
    // 102.381 s the pad needs.
    await addPad(workspace, 'A', LONG, { cutShort: 40000 });

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(result).toEqual({
      ok: false,
      problems: [
        "The pad after song 1 plays A.wav, which lasts 100 s. Its clip plays the file from 2.653 s to 82.381 s, and the file's last 20 s are its own fade-out, so the pad needs a file of at least 102.381 s.",
      ],
    });
  });

  it('writes the frames the file holds as its length', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    // 110 s of the 120 s survive, enough for the pad.
    await addPad(workspace, 'A', LONG, { cutShort: 20000 });

    const { root } = await build(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(value(firstPadClip(root).xml, 'SampleRef', 'DefaultDuration')).toBe('110000');
  });
});

describe('a pad file that cannot be read as a WAV', () => {
  const u32 = (value: number) => {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32LE(value);
    return bytes;
  };
  const chunk = (id: string, body: Buffer) => Buffer.concat([Buffer.from(id), u32(body.length), body]);
  const riff = (...chunks: Buffer[]) => chunk('RIFF', Buffer.concat([Buffer.from('WAVE'), ...chunks]));
  const fmt = (sampleRate: number) => {
    const body = Buffer.alloc(16);
    body.writeUInt16LE(1, 0);
    body.writeUInt16LE(1, 2);
    body.writeUInt32LE(sampleRate, 4);
    body.writeUInt32LE(sampleRate * 2, 8);
    body.writeUInt16LE(2, 12);
    body.writeUInt16LE(16, 14);
    return chunk('fmt ', body);
  };
  const data = chunk('data', Buffer.alloc(2000));

  it.each([
    { case: 'not a RIFF WAVE', bytes: Buffer.from('ID3 an MP3 named A.wav'), reason: 'it is not a RIFF WAVE file' },
    { case: 'no fmt chunk', bytes: riff(data), reason: 'it has no fmt chunk' },
    { case: 'no data chunk', bytes: riff(fmt(1000)), reason: 'it has no data chunk' },
    { case: 'a fmt chunk cut short', bytes: riff(Buffer.concat([Buffer.from('fmt '), u32(16), Buffer.alloc(4)])), reason: 'its fmt chunk is cut short' },
    { case: 'a sample rate of 0', bytes: riff(fmt(0), data), reason: 'its fmt chunk gives no sample rate or frame size' },
  ])('stops on a pad file with $case, naming the file and the reason, and writes nothing', async ({ bytes, reason }) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    const path = join(workspace.library, '_pads', 'A.wav');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(result).toEqual({ ok: false, problems: [`${path}: the pad file could not be read as a WAV: ${reason}.`] });
  });
});

// A pad's key: its own, as `--pad <n>=<key>` gives it, or the key of the song it takes its key from, as its folder name
// writes it. Goodness of God is in A, so a pad that ignored its own key would play A.wav.
describe('a pad given its own key', () => {
  it('plays G.wav after a pad in G, whatever the key of the song after it, and the summary shows the pad in G', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'G', LONG);
    await addPad(workspace, 'A', 20);

    const { result, root } = await build(workspace, [GRACE, GOODNESS], { 1: { type: 'pad', key: 'G' } });

    // A.wav, 20 s, is too short for the pad, so a pad that played it would stop the build.
    expect(padClips(root).map(({ start, end, name, file }) => ({ start, end, name, file }))).toEqual([{ start: 248, end: 336, name: 'G', file: 'Songs/_pads/G.wav' }]);
    expect(locatorList(root).filter(({ time }) => time === 320).map(({ name }) => name)).toEqual(['1 - End', '2 - Count Off (Goodness of God)']);
    expect(await readdir(join(projectFolder(workspace), 'Songs/_pads'))).toEqual(['G.wav']);
    expect(result.songs[0]?.transition).toEqual({ type: 'pad', key: 'G' });
  });

  // Goodness of God as if its folder named it in A minor.
  const GOODNESS_IN_AM = 'Goodness of God-Victory-Am-63.00bpm';

  it("plays the pad of a minor key's root: A.wav after a pad into a song in Am, and the summary shows the pad in Am", async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await copySongAs(workspace, GOODNESS, GOODNESS_IN_AM);
    await addPad(workspace, 'A', LONG);

    const { result, root } = await build(workspace, [GRACE, GOODNESS_IN_AM], { 1: PAD });

    expect(padClips(root).map(({ name, file }) => ({ name, file }))).toEqual([{ name: 'A', file: 'Songs/_pads/A.wav' }]);
    expect(result.songs[0]?.transition).toEqual({ type: 'pad', key: 'Am' });
  });

  it.each([
    { asked: 'Db', file: 'C#', next: GOODNESS, transition: { type: 'pad', key: 'Db' } },
    { asked: 'C#', file: 'Db', next: GOODNESS, transition: { type: 'pad', key: 'C#' } },
    { asked: 'Db', file: 'C#', next: 'Goodness of God-Victory-Db-63.00bpm', transition: PAD },
  ] as const)("plays the $file pad file, its key's enharmonic twin, for a pad in $asked when the pads folder has only that one: into $next", async ({ asked, file, next, transition }) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    if (next !== GOODNESS) await copySongAs(workspace, GOODNESS, next);
    await addPad(workspace, file, LONG);

    const { result, root } = await build(workspace, [GRACE, next], { 1: transition });

    expect(padClips(root).map(({ name, file }) => ({ name, file }))).toEqual([{ name: file, file: `Songs/_pads/${file}.wav` }]);
    expect(await readdir(join(projectFolder(workspace), 'Songs/_pads'))).toEqual([`${file}.wav`]);
    expect(result.songs[0]?.transition).toEqual({ type: 'pad', key: asked });
  });

  it.each(['Db', 'C#'])("plays the pad file of the key's own spelling, %s, when the pads folder has both twins", async (key) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await rename(await addPad(workspace, 'C#', LONG), join(workspace.library, '_pads', 'c#.WAV'));
    await addPad(workspace, 'Db', LONG);

    const { root } = await build(workspace, [GRACE, GOODNESS], { 1: { type: 'pad', key } });

    expect(padClips(root).map(({ file }) => file)).toEqual([`Songs/_pads/${key === 'Db' ? 'Db.wav' : 'c#.WAV'}`]);
  });

  it.each(['A.WAV', 'a.wav'])('plays the pad file named %s for a pad in A, in any letter case, and copies it under its own name', async (name) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    const path = await addPad(workspace, 'A', LONG);
    await rename(path, join(workspace.library, '_pads', name));

    const { result, root } = await build(workspace, [GRACE, GOODNESS], { 1: PAD });

    const clipName = name.slice(0, -'.wav'.length);
    expect(padClips(root).map(({ name, file }) => ({ name, file }))).toEqual([{ name: clipName, file: `Songs/_pads/${name}` }]);
    expect(await readdir(join(projectFolder(workspace), 'Songs/_pads'))).toEqual([name]);
    expect(result.songs[0]?.transition).toEqual({ type: 'pad', key: 'A' });
  });

  it('lists the keys of pad files whose extension is in any letter case when the pads folder has none for the key', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await rename(await addPad(workspace, 'E', 30), join(workspace.library, '_pads', 'E.WAV'));

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: PAD });

    expect(result).toEqual({
      ok: false,
      problems: [`The pad after song 1 is in A, the key of ${GOODNESS}, and the pads folder ${join(workspace.library, '_pads')} has no A.wav. The keys it has are E.`],
    });
  });
});

describe('a pad key the build cannot play', () => {
  it('stops when the pads folder has no file for a pad\'s own key by either of its names, and lists both and the keys it has', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'E', 30);
    await addPad(workspace, 'D', 30);

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], { 1: { type: 'pad', key: 'Db' } });

    expect(result).toEqual({
      ok: false,
      problems: [`The pad after song 1 is in Db, and the pads folder ${join(workspace.library, '_pads')} has no Db.wav or C#.wav. The keys it has are D, E.`],
    });
  });

  it("names both of a folder key's names when the pads folder has neither", async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    const next = 'Goodness of God-Victory-Db-63.00bpm';
    await copySongAs(workspace, GOODNESS, next);
    await addPad(workspace, 'D', 30);

    const result = await stoppedBuild(workspace, [GRACE, next], { 1: PAD });

    expect(result).toEqual({
      ok: false,
      problems: [`The pad after song 1 is in Db, the key of ${next}, and the pads folder ${join(workspace.library, '_pads')} has no Db.wav or C#.wav. The keys it has are D.`],
    });
  });

  it('stops when the folder name of the song a pad takes its key from has no key before its BPM, naming the folder', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    const next = 'Goodness of God-Victory--63.00bpm';
    await copySongAs(workspace, GOODNESS, next);
    await addPad(workspace, 'A', 30);

    const result = await stoppedBuild(workspace, [GRACE, next], { 1: PAD });

    expect(result).toEqual({
      ok: false,
      problems: [`${next}: the folder name has no key before its BPM, which the pad after song 1 is played in.`],
    });
  });

  it('stops when the folder name of the song a pad takes its key from has a key that is not a note name, naming the folder', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    const next = 'Goodness of God-Victory-H-63.00bpm';
    await copySongAs(workspace, GOODNESS, next);
    await addPad(workspace, 'A', 30);

    const result = await stoppedBuild(workspace, [GRACE, next], { 1: PAD });

    expect(result).toEqual({
      ok: false,
      problems: [`${next}: the folder name's key, "H", is not a note name, which the pad after song 1 is played in.`],
    });
  });

  it("gives a pad's own key's problem in the same pass as the problem of the song after it, which the key does not depend on", async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);

    const result = await stoppedBuild(workspace, [GRACE, 'no such song'], { 1: { type: 'pad', key: 'G' } });

    expect(result).toEqual({
      ok: false,
      problems: [
        `"no such song" matches no song folder in ${workspace.library}. The song folders are:\n  ${GOODNESS}\n  ${GREAT_ARE}\n  ${GRACE}\n  ${TRUST}`,
        `The pad after song 1 is in G, and the pads folder ${join(workspace.library, '_pads')} has no G.wav. The keys it has are A.`,
      ],
    });
  });
});

// The command stops on a --pad key that is not a note name as a usage error before it calls buildSet, so one can then
// only come from a caller's bug, and it throws, before anything is written.
describe('a pad key that is not a note name', () => {
  it.each(['H', '', 'g', 'F#m7'])('throws, and writes nothing, on a pad in "%s"', async (key) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);

    await expect(buildIn(workspace, [GRACE, GOODNESS], { 1: { type: 'pad', key } })).rejects.toThrow(`The pad after song 1 is in "${key}", which is not a note name.`);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });
});

// Great Are You Lord, This Is Amazing Grace and Goodness of God, end to end with gaps, put Goodness of God on set beat
// 557, bar 162. Goodness of God is given a held 34 BPM fermata from its own 316, as Build My Life has one, so its last
// tempo is not its starting 63. Its audio ends on 320.00005, less than the tolerance past a bar line, so its Pad locator
// is on its own 320, set beat 877. The 60 s Pad section at its own starting 63 BPM is 63 beats, rounded down to 15 bars of its starting
// 4/4, 60 beats, so 3 - Pad Out is on 937, and the 4-bar fade after it, 16 beats, puts its End on 953. The pad clip starts
// on its Ending, its own 300, set beat 857. The pads folder also holds D.wav, This Is Amazing Grace's key, which a pad
// that took the key of the song before the last would play.
describe('a pad after the last song', () => {
  async function padAfterGoodness(extra: (workspace: Workspace) => Promise<void> = async () => {}) {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);
    await addPad(workspace, 'D', LONG);
    await addMainTrackEvents(workspace, GOODNESS, 'FloatEvent', [
      [316, 63],
      [316, 34],
    ]);
    await extra(workspace);
    return { workspace, ...(await build(workspace, [GREAT_ARE, GRACE, GOODNESS], { 3: PAD })) };
  }

  it("puts 3 - Pad on the bar line Goodness of God's audio end is on, 877, 3 - Pad Out at the end of the 60 s section, 937, and its End after a 4-bar fade, 953", async () => {
    const { result, root } = await padAfterGoodness();

    const built = locatorList(root);
    expect(built.filter(({ name }) => ['3 - Count Off (Goodness of God)', '3 - Ending', '3 - Pad', '3 - Pad Out', '3 - End'].includes(name))).toEqual([
      { time: 557, name: '3 - Count Off (Goodness of God)' },
      { time: 857, name: '3 - Ending' },
      { time: 877, name: '3 - Pad' },
      { time: 937, name: '3 - Pad Out' },
      { time: 953, name: '3 - End' },
    ]);
    expect(built.filter(({ name }) => name.startsWith('3 - ')).at(-1)).toEqual({ time: 953, name: '3 - End' });
    expect(result.songs.map(({ transition }) => transition)).toEqual([{ type: 'gap' }, { type: 'gap' }, { type: 'pad', key: 'A' }]);
    expect(result.songs[2]?.startBar).toBe(162);
  });

  it("steps the tempo back from the fermata's 34 to Goodness of God's starting 63, and the meter to its starting 4/4, on the Pad locator, 877", async () => {
    const { root } = await padAfterGoodness();

    expect(envelopeEvents(root, 'Tempo').slice(-8)).toEqual([
      [856, 63],
      [856, 42],
      [857, 42],
      [857, 63],
      [873, 63],
      [873, 34],
      [877, 34],
      [877, 63],
    ]);
    expect(envelopeEvents(root, 'TimeSignature').slice(-2)).toEqual([
      [761, 201],
      [877, 201],
    ]);
  });

  it('writes one pad clip on the PAD track, from the Ending, 857, to the End, 953, fading out over the 4 bars after 3 - Pad Out, 16 beats', async () => {
    const { root } = await padAfterGoodness();

    const clips = padClips(root);
    expect(clips.map(({ start, end, name, file, fades }) => ({ start, end, name, file, fades }))).toEqual([
      { start: 857, end: 953, name: 'A', file: 'Songs/_pads/A.wav', fades: { in: 0, out: 16, defaultIn: 'true', defaultOut: 'false' } },
    ]);
    // From the Ending, 16 beats at 63 BPM, 15.238095 s, and 4 beats of the fermata at 34 BPM, 7.058824 s: 22.296919 s,
    // longer than the file's swell, so the clip plays A.wav from its start. Then the 60-beat Pad section and the 16-beat
    // fade, at Goodness of God's starting 63 BPM, are 57.142857 s and 15.238095 s: the clip ends 94.677871 s in.
    expect(clips[0]?.loop).toEqual({
      LoopStart: 0,
      StartRelative: 0,
      HiddenLoopStart: 0,
      LoopEnd: expect.closeTo(94.677871, 6),
      OutMarker: expect.closeTo(94.677871, 6),
      HiddenLoopEnd: expect.closeTo(94.677871, 6),
    });
  });

  // A 2/4 from 316 puts bar lines on 316, 318 and 320, so the audio end, 320.00005, is on the bar line at 320, as it is
  // without the 2/4, and the Pad locator on set beat 877, where the meter steps back from the 2/4.
  it('steps the meter back from a late 2/4 to the starting 4/4 on the Pad locator, 877', async () => {
    const { root } = await padAfterGoodness((workspace) => addMainTrackEvents(workspace, GOODNESS, 'EnumEvent', [[316, 199]]));

    expect(locatorList(root).filter(({ name }) => ['3 - Pad', '3 - Pad Out', '3 - End'].includes(name))).toEqual([
      { time: 877, name: '3 - Pad' },
      { time: 937, name: '3 - Pad Out' },
      { time: 953, name: '3 - End' },
    ]);
    expect(envelopeEvents(root, 'TimeSignature').slice(-2)).toEqual([
      [873, 199],
      [877, 201],
    ]);
    expect(envelopeEvents(root, 'Tempo').slice(-4)).toEqual([
      [873, 63],
      [873, 34],
      [877, 34],
      [877, 63],
    ]);
  });

  // A 3/4 from 316 puts bar lines on 316, 319 and 322, so 320 is no longer one. With every clip edited to end on
  // 319.00005, less than the tolerance past the bar line the 3/4 puts on 319, the Pad locator is on its own 319, set beat
  // 876, where without the 3/4 it would be on the next 4/4 bar line, 320.
  it('puts the Pad locator on the bar line a late 3/4 moves it to, 876, with the audio end less than the tolerance past it', async () => {
    const { root } = await padAfterGoodness(async (workspace) => {
      await addMainTrackEvents(workspace, GOODNESS, 'EnumEvent', [[316, 200]]);
      for (const stem of GOODNESS_STEMS) await endClipOn(workspace, GOODNESS, stem, '319.00005');
    });

    expect(locatorList(root).filter(({ name }) => ['3 - Pad', '3 - Pad Out', '3 - End'].includes(name))).toEqual([
      { time: 876, name: '3 - Pad' },
      { time: 936, name: '3 - Pad Out' },
      { time: 952, name: '3 - End' },
    ]);
    expect(envelopeEvents(root, 'TimeSignature').slice(-2)).toEqual([
      [873, 200],
      [876, 201],
    ]);
  });

  it('puts a pad after a song that is both the first and the last', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);

    const { result, root } = await build(workspace, [GOODNESS], { 1: PAD });

    expect(locatorList(root).filter(({ name }) => ['1 - Pad', '1 - Pad Out', '1 - End'].includes(name))).toEqual([
      { time: 320, name: '1 - Pad' },
      { time: 380, name: '1 - Pad Out' },
      { time: 396, name: '1 - End' },
    ]);
    expect(padClips(root).map(({ start, end }) => [start, end])).toEqual([[300, 396]]);
    expect(result.songs[0]?.transition).toEqual({ type: 'pad', key: 'A' });
  });

  // Goodness of God alone, with a 34 BPM fermata and a 2/4 from its own 316, as the tests above give it after two songs.
  // The set starts on its beat 0, so its Pad locator is on 320, and the set steps back there from the fermata and the 2/4
  // to its starting 63 BPM and 4/4, as it does when the song is last but not first.
  it('steps the tempo and meter back to their starting values on the Pad locator, 320, when the song is both the first and the last', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);
    await addMainTrackEvents(workspace, GOODNESS, 'FloatEvent', [
      [316, 63],
      [316, 34],
    ]);
    await addMainTrackEvents(workspace, GOODNESS, 'EnumEvent', [[316, 199]]);

    const { root } = await build(workspace, [GOODNESS], { 1: PAD });

    expect(locatorList(root).find(({ name }) => name === '1 - Pad')).toEqual({ time: 320, name: '1 - Pad' });
    expect(envelopeEvents(root, 'TimeSignature').slice(-2)).toEqual([
      [316, 199],
      [320, 201],
    ]);
    expect(envelopeEvents(root, 'Tempo').slice(-4)).toEqual([
      [316, 63],
      [316, 34],
      [320, 34],
      [320, 63],
    ]);
  });

  // A song with no end marker of its own gets the End the build adds, after the fade too. Goodness of God's own end
  // marker, on 324, would otherwise move there.
  it('puts the End it adds to a song with no end marker after the fade', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);
    await removeLocator(workspace, GOODNESS, ' ');

    const { root } = await build(workspace, [GOODNESS], { 1: PAD });

    expect(locatorList(root).filter(({ name }) => ['1 - Pad', '1 - Pad Out', '1 - End'].includes(name))).toEqual([
      { time: 320, name: '1 - Pad' },
      { time: 380, name: '1 - Pad Out' },
      { time: 396, name: '1 - End' },
    ]);
  });

  // This Is Amazing Grace into Goodness of God as above, so Goodness of God starts on 320. Its Ending is on its own 300, set
  // beat 620, its Pad locator on its own 320, set beat 640, its Pad Out 60 beats later, 700, and its End 16 beats after
  // that, 716.
  it('writes one pad clip for a pad after each of two songs, no two sounding at once', async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);

    const { root } = await build(workspace, [GRACE, GOODNESS], { 1: PAD, 2: PAD });

    expect(padClips(root).map(({ start, end, fades }) => ({ start, end, fadeOut: fades.out }))).toEqual([
      { start: 248, end: 336, fadeOut: 8 },
      { start: 620, end: 716, fadeOut: 16 },
    ]);
    expectNoOverlappingClips(root);
  });

  // This Is Amazing Grace into Trust In God with a gap. Trust In God starts on its own 6/8 and 74 BPM, so its 60 s Pad
  // section is 24 bars, 72 beats, and its fade 4 bars of 6/8, 12 beats.
  it("fades the pad clip after the last song out over 4 bars of that song's own starting meter: 12 beats after Trust In God, in 6/8", async () => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', LONG);

    const { root } = await build(workspace, [GRACE, TRUST], { 2: PAD });

    expect(padClips(root).map(({ fades }) => fades)).toEqual([{ in: 0, out: 12, defaultIn: 'true', defaultOut: 'false' }]);
  });

  it('keeps every tempo and meter event of a last song with no pad', async () => {
    const workspace = await createWorkspace();
    await addMainTrackEvents(workspace, GOODNESS, 'FloatEvent', [
      [316, 63],
      [316, 34],
    ]);
    await addMainTrackEvents(workspace, GOODNESS, 'EnumEvent', [[316, 199]]);

    const { root } = await build(workspace, [GRACE, GOODNESS]);

    // Goodness of God starts on 280, after a gap, so its own 316 is on 596.
    expect(envelopeEvents(root, 'Tempo').slice(-2)).toEqual([
      [596, 63],
      [596, 34],
    ]);
    expect(envelopeEvents(root, 'TimeSignature').filter(([time]) => time >= 596)).toEqual([[596, 199]]);
  });

  // The command stops on a --pad that names no song position before it calls buildSet, so one can only come from a
  // caller's bug, and it throws, before anything is written.
  it.each([0, 3])('throws, and writes nothing, on a pad after song %s of 2', async (position) => {
    const workspace = await createWorkspace();
    await addPadTrack(workspace);
    await addPad(workspace, 'A', 30);

    await expect(buildIn(workspace, [GRACE, GOODNESS], { [position]: PAD })).rejects.toThrow(`A transition after song ${position} needs a song position from 1 to 2.`);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });
});
