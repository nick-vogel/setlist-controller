import { existsSync } from 'node:fs';
import type { XmlElement } from '@rgrove/parse-xml';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSet, type Transition } from '../src/set-builder/build-set.ts';
import { parseSet } from '../src/server/set-parser.ts';
import {
  addMainTrackEvents,
  arrangementClips,
  createWorkspace,
  DATE,
  editSongTrack,
  element,
  elements,
  envelopeEvents,
  fadesOf,
  GOODNESS,
  GRACE,
  GREAT_ARE,
  locatorList,
  readSet,
  readStemMap,
  removeLocator,
  removeWorkspaces,
  singleTrack,
  slots,
  stemOf,
  trackName,
  value,
  type Workspace,
} from './set-builder-harness.ts';

afterEach(removeWorkspaces);

const OVERLAP: Transition = { type: 'overlap' };

type Transitions = Partial<Record<number, Transition>>;

async function buildIn(workspace: Workspace, songs: string[], transitions: Transitions) {
  return buildSet({
    library: workspace.library,
    template: workspace.template,
    stemMap: await readStemMap(),
    songs,
    transitions,
    date: DATE,
    outputRoot: workspace.outputRoot,
  });
}

// Builds the songs, named by their folders, in `workspace` or a new one, with the transition after each song position
// `transitions` names, and checks that the controller's parser reads the built set with zero warnings.
async function build(songs: string[], transitions: Transitions = {}, workspace?: Workspace) {
  const result = await buildIn(workspace ?? (await createWorkspace()), songs, transitions);
  if (!result.ok) throw new Error(`The build stopped: ${result.problems.join('\n')}`);
  const root: XmlElement = await readSet(result.setPath);
  expect(parseSet(locatorList(root)).warnings).toEqual([]);
  return { result, root };
}

const GROUPS = ['DRUMS', 'BASS', 'A GTRS', 'E GTRS', 'KEYS', 'VOX', 'OTHER'];

describe('an overlap from This Is Amazing Grace into Great Are You Lord', () => {
  it("starts Great Are You Lord's Count Off on This Is Amazing Grace's Ending, 248, and moves its End there", async () => {
    const { root } = await build([GRACE, GREAT_ARE], { 1: OVERLAP });

    const built = locatorList(root);
    expect(built.filter(({ name }) => name.startsWith('1 - ')).slice(-2)).toEqual([
      { time: 232, name: '1 - Outro' },
      { time: 248, name: '1 - End' },
    ]);
    expect(built.filter(({ time }) => time === 248).map(({ name }) => name)).toEqual(['1 - End', '2 - Count Off (Great Are You Lord)']);
    expect(built.find(({ name }) => name === '2 - Intro')).toEqual({ time: 254, name: '2 - Intro' });
  });

  it("puts Great Are You Lord's stems on the slots where This Is Amazing Grace is not ringing, in its track order", async () => {
    const { root } = await build([GRACE, GREAT_ARE], { 1: OVERLAP });

    const placed = (track: XmlElement) => arrangementClips(track).map((clip) => `${clip.attributes.Time} ${stemOf(clip)}`);
    expect(Object.fromEntries(GROUPS.map((group) => [group, slots(root, group).map(placed)]))).toEqual({
      DRUMS: [['0 Drums'], ['248 Drums (Live)'], ['248 Perc'], [], []],
      BASS: [['0 Bass'], ['248 Bass'], [], [], []],
      'A GTRS': [['0 AG'], ['248 AG'], [], [], [], []],
      'E GTRS': [['0 EG 2'], ['248 EG 1'], ['248 EG 3'], ['248 EG 5'], [], [], [], [], [], [], []],
      KEYS: [['0 Keys'], ['248 Piano'], ['248 Bells'], ['248 Strings'], [], [], [], []],
      VOX: [['0 BGVS'], ['248 Tenor'], ['248 BGVS'], []],
      // This Is Amazing Grace has no OTHER stem, so Great Are You Lord's Synth Loop takes the first slot.
      OTHER: [['248 Synth Loop'], [], [], []],
    });
    // The click and guide end on 248, so Great Are You Lord's take the same tracks.
    expect(placed(singleTrack(root, 'MT CLICK'))).toEqual(['0 Click Track', '248 Click Track']);
    expect(placed(singleTrack(root, 'GUIDE'))).toEqual(['0 Guide', '248 Guide']);
  });

  it('steps the tempo from 98 to 72 and the meter to 6/8 on 248, and starts Great Are You Lord on bar 63', async () => {
    const { result, root } = await build([GRACE, GREAT_ARE], { 1: OVERLAP });

    expect(envelopeEvents(root, 'Tempo')).toEqual([
      [-63072000, 98],
      [248, 98],
      [248, 72],
    ]);
    // 201 is 4/4 and 302 is 6/8.
    expect(envelopeEvents(root, 'TimeSignature')).toEqual([
      [-63072000, 201],
      [248, 302],
    ]);
    // 248 beats of 4/4 are 62 bars.
    expect(result.songs).toEqual([
      { folder: GRACE, title: 'This Is Amazing Grace', startBar: 1, tempo: 98, meter: '4/4', transition: { type: 'overlap' } },
      { folder: GREAT_ARE, title: 'Great Are You Lord', startBar: 63, tempo: 72, meter: '6/8' },
    ]);
  });

  // Great Are You Lord as if a ramp ran from 72 at its beat 0 to 80 at beat 100. Its starting tempo already comes in on
  // the Ending, 248, its beat 0, so the ramp runs from there with no second event at 72 beside it.
  it('ramps Great Are You Lord from 72 on 248, its beat 0, to 80 on 348, when a ramp starts at its beat 0', async () => {
    const workspace = await createWorkspace();
    await addMainTrackEvents(workspace, GREAT_ARE, 'FloatEvent', [
      [0, 72],
      [100, 80],
    ]);

    const { root } = await build([GRACE, GREAT_ARE], { 1: OVERLAP }, workspace);

    expect(envelopeEvents(root, 'Tempo')).toEqual([
      [-63072000, 98],
      [248, 98],
      [248, 72],
      [348, 80],
    ]);
  });
});

// Every audio track's clips, each as its track's name, its Time, CurrentStart and CurrentEnd.
function clipPlaces(root: XmlElement): { track: string; time: number; start: number; end: number }[] {
  return elements(element(root, 'LiveSet', 'Tracks'), 'AudioTrack').flatMap((track) =>
    arrangementClips(track).map((clip) => ({
      track: trackName(track),
      time: Number(clip.attributes.Time),
      start: Number(value(clip, 'CurrentStart')),
      end: Number(value(clip, 'CurrentEnd')),
    })),
  );
}

// The fades every stem of the four fixture songs is written with: none.
const NO_FADE = { in: 0, out: 0, defaultIn: 'true', defaultOut: 'true' };

// A fade-out of `length` beats, to 6 decimal places, and no fade-in.
const fadeOut = (length: number) => ({ in: 0, out: expect.closeTo(length, 6), defaultIn: 'true', defaultOut: 'false' });

// A built clip: its stem, its Time, CurrentStart and CurrentEnd, its three Loop end values and its fades.
function clipOf(clip: XmlElement) {
  return {
    stem: stemOf(clip),
    time: Number(clip.attributes.Time),
    start: Number(value(clip, 'CurrentStart')),
    end: Number(value(clip, 'CurrentEnd')),
    loop: ['LoopEnd', 'OutMarker', 'HiddenLoopEnd'].map((name) => Number(value(clip, 'Loop', name))),
    fades: fadesOf(clip),
  };
}

// The clips of the song that starts on `time`, on the single tracks and on the group slots, each as clipOf reads it.
function songClips(root: XmlElement, time: number) {
  const starting = (tracks: XmlElement[]) => tracks.flatMap(arrangementClips).filter((clip) => Number(clip.attributes.Time) === time).map(clipOf);
  return {
    single: starting(['MT CLICK', 'GUIDE'].map((name) => singleTrack(root, name))),
    group: starting(GROUPS.flatMap((group) => slots(root, group))),
  };
}

describe('the song an overlap starts from', () => {
  it("ends This Is Amazing Grace's click and guide on its Ending, 248, and rings its other stems on at 72 BPM to 255.347", async () => {
    const { root } = await build([GRACE, GREAT_ARE], { 1: OVERLAP });

    const { single, group } = songClips(root, 0);
    expect(single.map(({ stem }) => stem)).toEqual(['Click Track', 'Guide']);
    for (const clip of single) {
      expect(clip.end).toBe(248);
      // 248 beats at 98 BPM are 151.836735 seconds of audio.
      for (const loop of clip.loop) expect(loop).toBeCloseTo(151.836735, 6);
    }
    expect(group.map(({ stem }) => stem)).toEqual(['Drums', 'Bass', 'AG', 'EG 2', 'Keys', 'BGVS']);
    for (const clip of group) {
      // The 10 beats from 248 to the audio end at 258 last 6.122449 seconds at 98 BPM, which are 7.346939 beats at
      // Great Are You Lord's 72. The audio itself plays to its end.
      expect(clip.end).toBeCloseTo(255.346939, 6);
      for (const loop of clip.loop) expect(loop).toBeCloseTo(157.959184, 6);
    }
  });

  // This Is Amazing Grace as if its tempo ramped from 98 at its beat 236 to 82 at its Ending, 248. The click's audio is
  // cut through the song's own tempo map, ramp included.
  it("cuts This Is Amazing Grace's click on its Ending, 248, through a ramp from 98 on 236 to 82 on 248", async () => {
    const workspace = await createWorkspace();
    await addMainTrackEvents(workspace, GRACE, 'FloatEvent', [
      [236, 98],
      [248, 82],
    ]);

    const { root } = await build([GRACE, GREAT_ARE], { 1: OVERLAP }, workspace);

    const click = songClips(root, 0).single.find(({ stem }) => stem === 'Click Track');
    expect(click?.end).toBe(248);
    // 236 beats at 98 BPM are 144.489796 seconds, and the 12-beat ramp from 98 to 82 is 720 * ln(82 / 98) / (82 - 98),
    // 8.021170 seconds more. A steady 98 would give 151.836735.
    expect(click?.loop).toEqual([expect.closeTo(152.510966, 6), expect.closeTo(152.510966, 6), expect.closeTo(152.510966, 6)]);
  });

  it("fades This Is Amazing Grace's ringing stems out from Great Are You Lord's Intro, 254, to their end, 255.347, before the Intro plus 2 bars of 6/8, 260", async () => {
    const { root } = await build([GRACE, GREAT_ARE], { 1: OVERLAP });

    const { group } = songClips(root, 0);
    expect(group.map(({ stem }) => stem)).toEqual(['Drums', 'Bass', 'AG', 'EG 2', 'Keys', 'BGVS']);
    for (const clip of group) {
      // The ring ends before 260, so nothing is cut: the end and the audio stay as the ring left them.
      expect(clip.end).toBeCloseTo(255.346939, 6);
      for (const loop of clip.loop) expect(loop).toBeCloseTo(157.959184, 6);
      expect(clip.fades).toEqual(fadeOut(1.346939));
    }
  });

  it("gives This Is Amazing Grace's ringing stems no fade when their ring ends, on 254.429, before Goodness of God's Intro, 256", async () => {
    const { root } = await build([GRACE, GOODNESS], { 1: OVERLAP });

    // Goodness of God's Count Off is 2 bars of 4/4, so its Intro is 8 beats after the Ending, 248.
    expect(locatorList(root).find(({ name }) => name === '2 - Intro')).toEqual({ time: 256, name: '2 - Intro' });
    const { group } = songClips(root, 0);
    expect(group.map(({ stem }) => stem)).toEqual(['Drums', 'Bass', 'AG', 'EG 2', 'Keys', 'BGVS']);
    for (const clip of group) {
      // The 10 beats from 248 to the audio end at 258 last 6.122449 seconds at 98 BPM, which are 6.428571 beats at
      // Goodness of God's 63.
      expect(clip.end).toBeCloseTo(254.428571, 6);
      for (const loop of clip.loop) expect(loop).toBeCloseTo(157.959184, 6);
      expect(clip.fades).toEqual(NO_FADE);
    }
  });

  it.each([
    { pair: 'This Is Amazing Grace into Great Are You Lord', songs: [GRACE, GREAT_ARE], ending: 248, nextClips: 15 },
    { pair: 'Goodness of God into This Is Amazing Grace', songs: [GOODNESS, GRACE], ending: 300, nextClips: 8 },
  ])("gives the click and guide, cut on the Ending, no fade, nor any clip of the next song: $pair", async ({ songs, ending, nextClips }) => {
    const { root } = await build(songs, { 1: OVERLAP });

    const { single } = songClips(root, 0);
    expect(single.map(({ stem, end }) => [stem, end])).toEqual([
      ['Click Track', ending],
      ['Guide', ending],
    ]);
    for (const clip of single) expect(clip.fades).toEqual(NO_FADE);
    const next = songClips(root, ending);
    const clips = [...next.single, ...next.group];
    expect(clips).toHaveLength(nextClips);
    for (const clip of clips) expect(clip.fades).toEqual(NO_FADE);
  });

  it("ends Goodness of God's click and guide on its Ending, 300, through the 42 BPM fermata before it, and drops its tempo event on the Ending", async () => {
    const { result, root } = await build([GOODNESS, GRACE], { 1: OVERLAP });

    // Goodness of God's Ending is on 300, after 76 bars, 74 of 4/4 and two of 2/4, so This Is Amazing Grace starts on bar 77.
    expect(locatorList(root).filter(({ time }) => time === 300).map(({ name }) => name)).toEqual(['1 - End', '2 - Count Off (This Is Amazing Grace)']);
    expect(result.songs.map(({ startBar }) => startBar)).toEqual([1, 77]);
    // In the song: 63 to 42 at 299, back to 63 on the Ending. The step on the Ending goes, and the set steps from the
    // fermata's tempo, the one the song reaches there, to 98.
    expect(envelopeEvents(root, 'Tempo').filter(([time]) => time >= 299)).toEqual([
      [299, 63],
      [299, 42],
      [300, 42],
      [300, 98],
    ]);
    const { single } = songClips(root, 0);
    expect(single.map(({ stem }) => stem)).toEqual(['Click Track', 'Guide']);
    for (const clip of single) {
      expect(clip.end).toBe(300);
      // 299 beats at 63 BPM, then a beat at 42.
      for (const loop of clip.loop) expect(loop).toBeCloseTo(286.190476, 6);
    }
  });

  it("cuts Goodness of God's ringing stems on This Is Amazing Grace's Intro plus 2 bars of 4/4, 316, 16 beats after its Ending, and fades them over the last 8 beats", async () => {
    const { root } = await build([GOODNESS, GRACE], { 1: OVERLAP });

    expect(locatorList(root).find(({ name }) => name === '2 - Intro')).toEqual({ time: 308, name: '2 - Intro' });
    const { group } = songClips(root, 0);
    expect(group).toHaveLength(13);
    for (const clip of group) {
      // The 20.0000476 beats from 300 to the audio end last 19.047664 seconds at 63 BPM, 31.111185 beats at 98, so the
      // ring would run to 331.111185. Cut on 316, the audio plays the 286.190476 seconds to the Ending, then 16 beats at 98 BPM, 9.795918
      // seconds.
      expect(clip.end).toBe(316);
      for (const loop of clip.loop) expect(loop).toBeCloseTo(295.986395, 6);
      expect(clip.fades).toEqual(fadeOut(8));
    }
  });

  it("counts Great Are You Lord's bars in 6/8 to its Ending, 252, when it overlaps into This Is Amazing Grace", async () => {
    const { result, root } = await build([GREAT_ARE, GRACE], { 1: OVERLAP });

    // 252 beats of 6/8 are 84 bars.
    expect(result.songs.map(({ startBar }) => startBar)).toEqual([1, 85]);
    expect(envelopeEvents(root, 'TimeSignature')).toEqual([
      [-63072000, 302],
      [252, 201],
    ]);
    const { single, group } = songClips(root, 0);
    expect(single.map(({ stem, end }) => [stem, end])).toEqual([
      ['Click Track', 252],
      ['Guide', 252],
    ]);
    for (const clip of single) {
      expect(clip.end).toBe(252);
      // 252 beats at 72 BPM are 210 seconds.
      for (const loop of clip.loop) expect(loop).toBeCloseTo(210, 6);
    }
    // 6 beats at 72 BPM, 5 seconds, are 8.166667 beats at 98. This Is Amazing Grace's Intro is 8 beats after the Ending,
    // on 260, so the ring fades over its last 0.166667 beats, and its Intro plus 2 bars of 4/4, 268, cuts nothing.
    expect(group).toHaveLength(13);
    for (const clip of group) {
      expect(clip.end).toBeCloseTo(260.166667, 6);
      for (const loop of clip.loop) expect(loop).toBeCloseTo(215, 6);
      expect(clip.fades).toEqual(fadeOut(0.166667));
    }
  });
});

// One clip of an edited stem: its place in the arrangement, from `start` to `end` in beats, and its audio, from
// `loopStart` to `loopEnd` in seconds.
type ClipShape = { start: number; end: number; loopStart: number; loopEnd: number };

// The song as if its stem `track`, one clip from beat 0 in every fixture song, had been edited in Live into `clips`, each
// a copy of that clip at its own place.
async function editClips(workspace: Workspace, song: string, track: string, clips: ClipShape[]): Promise<void> {
  const set = (xml: string, name: string, to: number) => xml.replace(new RegExp(`<${name} Value="[^"]*" />`), `<${name} Value="${to}" />`);
  await editSongTrack(workspace, song, track, (text) =>
    text.replace(/<AudioClip Id="0" Time="0">[\s\S]*?<\/AudioClip>/, (clip) => {
      const indent = /\n(\t*)<AudioClip /.exec(text)?.[1] ?? '';
      return clips
        .map(({ start, end, loopStart, loopEnd }, id) => {
          let copy = clip.replace('<AudioClip Id="0" Time="0">', `<AudioClip Id="${id}" Time="${start}">`);
          for (const [name, to] of [
            ['CurrentStart', start],
            ['CurrentEnd', end],
            ['LoopStart', loopStart],
            ['HiddenLoopStart', loopStart],
            ['LoopEnd', loopEnd],
            ['OutMarker', loopEnd],
            ['HiddenLoopEnd', loopEnd],
          ] as const) {
            copy = set(copy, name, to);
          }
          return copy;
        })
        .join(`\n${indent}`);
    }),
  );
}

// Goodness of God's audio second at a beat of its own: 63 BPM, but 42 from 299 to its Ending, 300.
const GOODNESS_SECONDS = { 298: 283.8095238095238, 306: 291.9047619047619, 312: 297.61904761904765, 318: 303.33333333333337 };

// Every fixture stem is one clip from beat 0 that runs past the song's Ending, so these edit Goodness of God's stems
// in the workspace. Its Ending is on 300, This Is Amazing Grace's Intro on 308, and the Intro plus 2 bars of 4/4 on 316.
// A beat after the Ending rings at 98 BPM for as long as it lasts at 63: 306 rings to 309.333333 and 312 to 318.666667.
describe('an overlap from Goodness of God into This Is Amazing Grace, with clips the library does not hold', () => {
  it("rings a Drums clip that ends on 306 to 309.333, at 63 BPM, the tempo Goodness of God holds from its Ending, and fades it from the Intro, 308", async () => {
    const workspace = await createWorkspace();
    await editClips(workspace, GOODNESS, 'Drums', [{ start: 0, end: 306, loopStart: 0, loopEnd: GOODNESS_SECONDS[306] }]);
    const { root } = await build([GOODNESS, GRACE], { 1: OVERLAP }, workspace);

    // Goodness of God's Drums takes DRUMS' first slot. At the 42 BPM fermata it would ring to 314.
    const [drums] = slots(root, 'DRUMS');
    if (!drums) throw new Error('No DRUMS slot');
    expect(arrangementClips(drums).map(clipOf)).toEqual([
      {
        stem: 'Drums',
        time: 0,
        start: 0,
        end: expect.closeTo(309.333333, 6),
        // Nothing is cut: the audio plays whole.
        loop: Array(3).fill(expect.closeTo(291.904762, 6)),
        fades: fadeOut(1.333333),
      },
    ]);
  });

  it('drops a click clip that starts after the Ending, 300, and cuts the one that runs past it on the Ending', async () => {
    const workspace = await createWorkspace();
    await editClips(workspace, GOODNESS, 'Click Track', [
      { start: 0, end: 298, loopStart: 0, loopEnd: GOODNESS_SECONDS[298] },
      { start: 298, end: 312, loopStart: GOODNESS_SECONDS[298], loopEnd: GOODNESS_SECONDS[312] },
      { start: 306, end: 318, loopStart: GOODNESS_SECONDS[306], loopEnd: GOODNESS_SECONDS[318] },
    ]);
    const { root } = await build([GOODNESS, GRACE], { 1: OVERLAP }, workspace);

    expect(arrangementClips(singleTrack(root, 'MT CLICK')).map((clip) => [clipOf(clip).time, clipOf(clip).start, clipOf(clip).end])).toEqual([
      [0, 0, 298],
      [298, 298, 300],
      [300, 300, expect.any(Number)],
    ]);
  });

  it('writes a Tambourine 1 clip that ends before the Ending as it is, cuts one that rings from after the Intro on 316 and fades it from its own start, and drops one that would ring from 316 on', async () => {
    const workspace = await createWorkspace();
    await editClips(workspace, GOODNESS, 'Tambourine 1', [
      { start: 0, end: 298, loopStart: 0, loopEnd: GOODNESS_SECONDS[298] },
      { start: 306, end: 312, loopStart: GOODNESS_SECONDS[306], loopEnd: GOODNESS_SECONDS[312] },
      { start: 312, end: 318, loopStart: GOODNESS_SECONDS[312], loopEnd: GOODNESS_SECONDS[318] },
    ]);
    const { root } = await build([GOODNESS, GRACE], { 1: OVERLAP }, workspace);

    // Goodness of God's Tambourine 1 takes DRUMS' second slot.
    const tambourine = slots(root, 'DRUMS')[1];
    if (!tambourine) throw new Error('No second DRUMS slot');
    expect(arrangementClips(tambourine).map(clipOf)).toEqual([
      { stem: 'Tambourine 1', time: 0, start: 0, end: 298, loop: Array(3).fill(expect.closeTo(283.809524, 6)), fades: NO_FADE },
      {
        stem: 'Tambourine 1',
        time: expect.closeTo(309.333333, 6),
        start: expect.closeTo(309.333333, 6),
        end: 316,
        // From 291.904762 seconds, the 6.666667 beats from 309.333333 to 316 at 98 BPM, 4.081633 seconds.
        loop: Array(3).fill(expect.closeTo(295.986395, 6)),
        // A fade cannot cross the clip's start, so it fades over its whole length.
        fades: fadeOut(6.666667),
      },
    ]);
  });
});

describe('a song after an overlap', () => {
  // This Is Amazing Grace, Great Are You Lord and Goodness of God. With gaps, Great Are You Lord's gap starts on 537,
  // its End, and Goodness of God 4 bars of 4/4 later, on 553. The overlap starts Great Are You Lord on 248, not 276, so
  // its gap starts on 509 and Goodness of God on 525.
  const SONGS = [GRACE, GREAT_ARE, GOODNESS];

  // What a build writes from `start` on, every time moved back by `start`.
  function writtenFrom(root: XmlElement, start: number) {
    const since = <T extends { time: number }>(items: T[]) => items.filter(({ time }) => time >= start).map((item) => ({ ...item, time: item.time - start }));
    const events = (parameter: 'Tempo' | 'TimeSignature') => since(envelopeEvents(root, parameter).map(([time, value]) => ({ time, value })));
    return {
      locators: since(locatorList(root)),
      tempo: events('Tempo'),
      meter: events('TimeSignature'),
      clips: since(clipPlaces(root)).map((clip) => ({ ...clip, start: clip.start - start, end: clip.end - start })),
    };
  }

  it('starts 28 beats earlier than in the same build with gaps, its clips, locators and own gap step moved with it', async () => {
    const gaps = await build(SONGS);
    const overlap = await build(SONGS, { 1: OVERLAP });

    const afterGaps = writtenFrom(gaps.root, 537);
    expect(writtenFrom(overlap.root, 509)).toEqual(afterGaps);
    // Great Are You Lord's End, Goodness of God's Count Off and Intro, and its 15 clips.
    expect(afterGaps.locators.slice(0, 3)).toEqual([
      { time: 0, name: '2 - End' },
      { time: 16, name: '3 - Count Off (Goodness of God)' },
      { time: 24, name: '3 - Intro' },
    ]);
    expect(afterGaps.clips.map(({ time, start }) => [time, start])).toEqual(afterGaps.clips.map(() => [16, 16]));
    expect(afterGaps.clips).toHaveLength(15);
    // The gap step: 72 to 63 BPM, and 6/8 to 4/4, as an instant step on the gap start.
    expect(afterGaps.tempo.slice(0, 2)).toEqual([
      { time: 0, value: 72 },
      { time: 0, value: 63 },
    ]);
    expect(afterGaps.meter[0]).toEqual({ time: 0, value: 201 });
    expect(gaps.result.songs.map(({ startBar }) => startBar)).toEqual([1, 71, 162]);
    expect(overlap.result.songs.map(({ startBar }) => startBar)).toEqual([1, 63, 154]);
  });
});

describe('every overlap build', () => {
  it.each([
    { service: 'This Is Amazing Grace into Great Are You Lord', songs: [GRACE, GREAT_ARE], transitions: { 1: OVERLAP } },
    { service: 'the pair, then a gap into Goodness of God', songs: [GRACE, GREAT_ARE, GOODNESS], transitions: { 1: OVERLAP } },
    { service: 'two overlaps in a row', songs: [GRACE, GREAT_ARE, GOODNESS], transitions: { 1: OVERLAP, 2: OVERLAP } },
    { service: 'Goodness of God into This Is Amazing Grace', songs: [GOODNESS, GRACE], transitions: { 1: OVERLAP } },
    { service: 'Great Are You Lord into This Is Amazing Grace', songs: [GREAT_ARE, GRACE], transitions: { 1: OVERLAP } },
  ])('puts no two clips that sound at once on one track: $service', async ({ songs, transitions }) => {
    const { result, root } = await build(songs, transitions);

    const locators = locatorList(root);
    for (const position of Object.keys(transitions).map(Number)) {
      const end = locators.find(({ name }) => name === `${position} - End`);
      expect(locators.filter(({ time }) => time === end?.time).map(({ name }) => name)).toEqual([
        `${position} - End`,
        `${position + 1} - Count Off (${result.songs[position]?.title})`,
      ]);
    }
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
  });
});

// The command stops on an --overlap that names no song position, or the last song, as a usage error before it calls
// buildSet, and an overlap's build problems are in set-builder-stop-rules.test.ts. A transition the build cannot place
// can then only come from a caller's bug, and it throws, before anything is written.
describe('a transition the build cannot place', () => {
  it.each([
    { key: 0, position: 'no song' },
    { key: 2, position: 'the last song' },
    { key: 1.5, position: 'no whole song position' },
  ])('throws, and writes nothing, on a transition after $position', async ({ key }) => {
    const workspace = await createWorkspace();

    await expect(buildIn(workspace, [GRACE, GREAT_ARE], { [key]: OVERLAP })).rejects.toThrow(`A transition after song ${key} needs a song position from 1 to 1.`);
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });
});

// The fade starts on the Intro of the song an overlap goes into, the first section after its Count Off, so a song with
// no Count Off stops the build before anything is written.
describe('an overlap into a song with no Count Off', () => {
  it('stops with the problem among the others, naming the song, and writes nothing', async () => {
    const workspace = await createWorkspace();
    await removeLocator(workspace, GREAT_ARE, 'Count Off');

    const result = await buildIn(workspace, [GRACE, GREAT_ARE, 'zzz'], { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [
        expect.stringMatching(/^"zzz" matches no song folder/),
        `${GREAT_ARE}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`,
      ],
    });
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });
});
