import { existsSync } from 'node:fs';
import { chmod, mkdir, readdir, readFile, rename, stat, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { XmlElement } from '@rgrove/parse-xml';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSet, type BuildOptions, type BuildResult } from '../src/set-builder/build-set.ts';
import { parseSet } from '../src/server/set-parser.ts';
import {
  addMainTrackEvents,
  arrangementEvents,
  copySongAs,
  createWorkspace,
  DATE,
  editSongTrack,
  element,
  elements,
  FIXTURE_LIBRARY,
  GOODNESS,
  GOODNESS_STEMS,
  GRACE,
  GREAT_ARE,
  libraryFile,
  moveBlankLocator,
  nameBlankLocator,
  PROJECT_INFO,
  projectFolder,
  readSet,
  readStemMap,
  removeAnalysisFile,
  removeBlankLocator,
  removeProjectInfo,
  removeWorkspaces,
  renameTemplateTrack,
  reverseEnvelopeEventIds,
  saveTemplateLooping,
  setPath,
  snapshotFolder,
  swapSongTracks,
  TRUST,
  value,
  type Workspace,
} from './set-builder-harness.ts';

afterEach(removeWorkspaces);

const trackName = (track: XmlElement) => value(track, 'Name', 'EffectiveName');
const arrangementClips = (track: XmlElement) => elements(arrangementEvents(track), 'AudioClip');
const stemOf = (clip: XmlElement) => basename(value(clip, 'SampleRef', 'FileRef', 'RelativePath'), '.wav');

// The template's slots for a group, found the way the spec says: the audio tracks whose TrackGroupId is the
// group track's Id, in track order. Slot names play no part.
function slots(root: XmlElement, group: string): XmlElement[] {
  const tracks = element(root, 'LiveSet', 'Tracks');
  const groupTrack = elements(tracks, 'GroupTrack').find((track) => trackName(track) === group);
  if (!groupTrack) throw new Error(`No group track ${group}`);
  return elements(tracks, 'AudioTrack').filter((track) => value(track, 'TrackGroupId') === groupTrack.attributes.Id);
}

// A single track sits outside every group: its TrackGroupId is -1.
function singleTrack(root: XmlElement, name: string): XmlElement {
  const track = elements(element(root, 'LiveSet', 'Tracks'), 'AudioTrack').find(
    (candidate) => trackName(candidate) === name && value(candidate, 'TrackGroupId') === '-1',
  );
  if (!track) throw new Error(`No track ${name}`);
  return track;
}

// The main track's two parameters the build replaces, by their element names in the set.
const MAIN_PARAMETERS = ['Tempo', 'TimeSignature'] as const;
type MainParameter = (typeof MAIN_PARAMETERS)[number];

// The main track's envelope for its Tempo or TimeSignature parameter, matched by the parameter's
// AutomationTarget Id, never by position.
function envelopeOf(mainTrack: XmlElement, parameter: MainParameter): XmlElement {
  const target = element(mainTrack, 'DeviceChain', 'Mixer', parameter, 'AutomationTarget').attributes.Id;
  const envelope = elements(element(mainTrack, 'AutomationEnvelopes', 'Envelopes'), 'AutomationEnvelope').find(
    (candidate) => value(candidate, 'EnvelopeTarget', 'PointeeId') === target,
  );
  if (!envelope) throw new Error(`No envelope for ${parameter}`);
  return envelope;
}

// A main-track parameter's Manual value and its envelope's events.
function parameterState(root: XmlElement, parameter: MainParameter) {
  const mainTrack = element(root, 'LiveSet', 'MainTrack');
  const envelope = envelopeOf(mainTrack, parameter);
  return {
    manual: Number(value(mainTrack, 'DeviceChain', 'Mixer', parameter, 'Manual')),
    events: elements(element(envelope, 'Automation', 'Events')).map((event) => ({
      kind: event.name,
      id: event.attributes.Id,
      time: Number(event.attributes.Time),
      value: Number(event.attributes.Value),
    })),
  };
}

function locators(root: XmlElement) {
  return elements(element(root, 'LiveSet', 'Locators', 'Locators'), 'Locator').map((locator) => ({
    id: locator.attributes.Id,
    time: Number(value(locator, 'Time')),
    name: value(locator, 'Name'),
    keyMapped: elements(locator, 'Mapping').length > 0,
  }));
}

// The set with every part the build may change blanked out: the arrangement clips on each audio track,
// the main track's tempo and time-signature events and Manual values, the inner locator list and the two
// transport values. Returned as one entry per Tracks child and per other LiveSet child, so a difference
// points at its track.
function untouchedParts(root: XmlElement) {
  const liveSet = element(root, 'LiveSet');
  for (const track of elements(element(liveSet, 'Tracks'), 'AudioTrack')) {
    arrangementEvents(track).children = [];
  }
  const mainTrack = element(liveSet, 'MainTrack');
  for (const parameter of MAIN_PARAMETERS) {
    element(envelopeOf(mainTrack, parameter), 'Automation', 'Events').children = [];
    element(mainTrack, 'DeviceChain', 'Mixer', parameter, 'Manual').attributes.Value = 'masked';
  }
  element(liveSet, 'Locators', 'Locators').children = [];
  element(liveSet, 'Transport', 'LoopOn').attributes.Value = 'masked';
  element(liveSet, 'Transport', 'CurrentTime').attributes.Value = 'masked';
  return [
    { name: root.name, attributes: root.attributes },
    ...elements(element(liveSet, 'Tracks')).map((track) => track.toJSON()),
    ...elements(liveSet)
      .filter((part) => part.name !== 'Tracks')
      .map((part) => part.toJSON()),
  ];
}

const GROUPS = ['DRUMS', 'BASS', 'A GTRS', 'E GTRS', 'KEYS', 'VOX', 'OTHER'];

async function build(workspace: Workspace, ...songs: string[]) {
  const result = await buildSet(await buildOptions(workspace, songs));
  if (result.ok) {
    const root = await readSet(result.setPath);
    expect(parseSet(locators(root).map(({ name, time }) => ({ name, time }))).warnings).toEqual([]);
  }
  return result;
}

async function buildOptions(workspace: Workspace, songs: string[]): Promise<BuildOptions> {
  return {
    library: workspace.library,
    template: workspace.template,
    stemMap: await readStemMap(),
    songs,
    date: DATE,
    outputRoot: workspace.outputRoot,
  };
}

// This Is Amazing Grace as if events at `time`, beat 0 or before it, had moved it to 110 BPM and 6/8 after the
// events Live writes at -63072000, 98 and 4/4: the song starts on 110 and 6/8.
const LATE_STARTS = [
  { at: 'at beat 0', time: 0 },
  { at: 'before beat 0', time: -2 },
];

// The tempo at a set beat: Live ramps from each tempo event to the next.
function tempoAt(map: [number, number][], beat: number): number {
  const [time, tempo] = map.findLast(([at]) => at <= beat) ?? [beat, Number.NaN];
  const next = map.find(([at]) => at > beat);
  return next ? tempo + ((beat - time) / (next[0] - time)) * (next[1] - tempo) : tempo;
}

async function startGraceLate(workspace: Workspace, time: number): Promise<void> {
  await addMainTrackEvents(workspace, GRACE, 'FloatEvent', [
    [time, 98],
    [time, 110],
  ]);
  await addMainTrackEvents(workspace, GRACE, 'EnumEvent', [[time, 302]]);
}

describe('building one song into a set on the Sunday template', () => {
  it('writes <date> Sunday/<date> Sunday.als under the output root as a Live 12 set', async () => {
    const workspace = await createWorkspace();

    const result = await build(workspace, GOODNESS);

    expect(result).toEqual({
      ok: true,
      // test/set-builder-durations.test.ts checks them.
      durations: expect.any(Array),
      setPath: setPath(workspace),
      songs: [{ folder: GOODNESS, title: 'Goodness of God', startBar: 1, tempo: 63, meter: '4/4' }],
    });
    const root = await readSet(setPath(workspace));
    expect(root.name).toBe('Ableton');
    expect(root.attributes.MajorVersion).toBe('5');
    expect(root.attributes.MinorVersion).toMatch(/^12\./);
    expect(element(root, 'LiveSet', 'Tracks')).toBeDefined();
  });

  it('puts each stem on the slot that the map and the song track order give, at Time 0 with its own start and end', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GOODNESS);

    const root = await readSet(setPath(workspace));
    const placed = Object.fromEntries(GROUPS.map((group) => [group, slots(root, group).map((slot) => arrangementClips(slot).map(stemOf))]));
    expect(placed).toEqual({
      DRUMS: [['Drums'], ['Tambourine 1'], [], [], []],
      BASS: [['Bass'], [], [], [], []],
      'A GTRS': [['AG'], ['AG 3'], ['Mandolin'], [], [], []],
      // Each group fills from its own first slot: EG 1 starts E GTRS on its first slot, though the song's three A GTRS
      // stems come before it in the song's track list.
      'E GTRS': [['EG 1'], ['EG 2'], ['EG 4'], [], [], [], [], [], [], [], []],
      KEYS: [['Piano'], ['Rhodes'], ['Strings'], [], [], [], [], []],
      VOX: [['Oohs'], [], [], []],
      OTHER: [[], [], [], []],
    });
    expect(arrangementClips(singleTrack(root, 'GUIDE')).map(stemOf)).toEqual(['Guide']);
    expect(arrangementClips(singleTrack(root, 'MT CLICK')).map(stemOf)).toEqual(['Click Track']);

    const clips = [...GROUPS.flatMap((group) => slots(root, group)), singleTrack(root, 'GUIDE'), singleTrack(root, 'MT CLICK')].flatMap(arrangementClips);
    expect(clips).toHaveLength(15);
    for (const clip of clips) {
      expect(Number(clip.attributes.Time)).toBe(0);
      expect(Number(value(clip, 'CurrentStart'))).toBe(0);
      expect(Number(value(clip, 'CurrentEnd'))).toBe(320.0000476190476);
    }
  });

  it("fills a group's slots in the song's track order, not the stem map's", async () => {
    const workspace = await createWorkspace();
    await swapSongTracks(workspace, GOODNESS, 'Piano', 'Rhodes');

    await build(workspace, GOODNESS);

    const root = await readSet(setPath(workspace));
    // The map lists Piano before Rhodes; the song now lists Rhodes first.
    expect(slots(root, 'KEYS').map((slot) => arrangementClips(slot).map(stemOf))).toEqual([['Rhodes'], ['Piano'], ['Strings'], [], [], [], [], []]);
  });

  it.each([
    { name: 'GUIDE', stem: 'Guide' },
    { name: 'MT CLICK', stem: 'Click Track' },
  ])('puts $stem on the single track $name even when a slot track is renamed $name', async ({ name, stem }) => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'Other 4', name);

    await build(workspace, GOODNESS);

    const root = await readSet(setPath(workspace));
    expect(slots(root, 'OTHER').map(trackName)).toEqual(['Other 1', 'Other 2', 'Other 3', name]);
    expect(slots(root, 'OTHER').map((slot) => arrangementClips(slot).map(stemOf))).toEqual([[], [], [], []]);
    expect(arrangementClips(singleTrack(root, name)).map(stemOf)).toEqual([stem]);
  });

  it('replaces the tempo and time-signature envelopes with the song ones, instant steps and 2/4 bars included', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GOODNESS);

    const root = await readSet(setPath(workspace));
    const tempo = parameterState(root, 'Tempo');
    expect(tempo.manual).toBe(63);
    expect(tempo.events).toEqual([
      { kind: 'FloatEvent', id: '0', time: -63072000, value: 63 },
      // The fermata near the end: two instant steps, each two events at one Time, old value then new.
      { kind: 'FloatEvent', id: '1', time: 299, value: 63 },
      { kind: 'FloatEvent', id: '2', time: 299, value: 42 },
      { kind: 'FloatEvent', id: '3', time: 300, value: 42 },
      { kind: 'FloatEvent', id: '4', time: 300, value: 63 },
    ]);
    const meter = parameterState(root, 'TimeSignature');
    expect(meter.manual).toBe(201);
    // 201 is 4/4 and 199 is 2/4: two single 2/4 bars.
    expect(meter.events).toEqual([
      { kind: 'EnumEvent', id: '0', time: -63072000, value: 201 },
      { kind: 'EnumEvent', id: '1', time: 104, value: 199 },
      { kind: 'EnumEvent', id: '2', time: 106, value: 201 },
      { kind: 'EnumEvent', id: '3', time: 202, value: 199 },
      { kind: 'EnumEvent', id: '4', time: 204, value: 201 },
    ]);
  });

  it('numbers the tempo and time-signature events 0 to n in time order, whatever Ids the song stored', async () => {
    const workspace = await createWorkspace();
    await reverseEnvelopeEventIds(workspace, GOODNESS);
    const song = await readSet(join(workspace.library, GOODNESS, 'MultiTrack.als'));
    expect(parameterState(song, 'Tempo').events.map(({ id }) => id)).toEqual(['4', '3', '2', '1', '0']);
    expect(parameterState(song, 'TimeSignature').events.map(({ id }) => id)).toEqual(['4', '3', '2', '1', '0']);

    await build(workspace, GOODNESS);

    const root = await readSet(setPath(workspace));
    for (const parameter of MAIN_PARAMETERS) {
      const times = parameterState(root, parameter).events.map(({ time }) => time);
      expect(times).toEqual(times.toSorted((a, b) => a - b));
      expect(parameterState(root, parameter).events.map(({ id }) => id)).toEqual(times.map((_, index) => String(index)));
    }
  });

  it('sets the tempo and time-signature Manual values to the song starting ones, where the template holds others', async () => {
    const workspace = await createWorkspace();
    const template = await readSet(workspace.template);
    expect(parameterState(template, 'Tempo').manual).toBe(120);
    expect(parameterState(template, 'TimeSignature').manual).toBe(201);

    await build(workspace, TRUST);

    const root = await readSet(setPath(workspace));
    // Trust In God starts at 74 in 6/8, which Live stores as 302.
    expect(parameterState(root, 'Tempo').manual).toBe(74);
    expect(parameterState(root, 'TimeSignature').manual).toBe(302);
  });

  it.each(LATE_STARTS)('opens the set on the tempo and time signature the song starts on, set by events $at', async ({ time }) => {
    const workspace = await createWorkspace();
    await startGraceLate(workspace, time);

    await build(workspace, GRACE);

    const root = await readSet(setPath(workspace));
    const tempo = parameterState(root, 'Tempo');
    expect(tempo.manual).toBe(110);
    expect(tempo.events.map(({ time, value }) => [time, value])).toEqual([[-63072000, 110]]);
    const meter = parameterState(root, 'TimeSignature');
    expect(meter.manual).toBe(302);
    expect(meter.events.map(({ time, value }) => [time, value])).toEqual([[-63072000, 302]]);
  });

  it('sorts, numbers and renames the locators for the controller, with no key mappings', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GOODNESS);

    const built = locators(await readSet(setPath(workspace)));
    expect(built.map(({ time, name }) => [time, name])).toEqual([
      [0, '1 - Count Off (Goodness of God)'],
      [8, '1 - Intro'],
      [40, '1 - Verse 1'],
      [72, '1 - Chorus'],
      [106, '1 - Verse 2'],
      [138, '1 - Chorus'],
      [170, '1 - Bridge'],
      [186, '1 - Bridge'],
      [204, '1 - Interlude'],
      [212, '1 - Chorus'],
      [244, '1 - Vamp'],
      [252, '1 - Chorus'],
      [284, '1 - Tag'],
      [300, '1 - Ending'],
      // The song's blank-named end marker, as MultiTracks marks a song's End.
      [324, '1 - End'],
    ]);
    expect(built.map(({ id }) => id)).toEqual(built.map((_, index) => String(index)));
    expect(built.filter(({ keyMapped }) => keyMapped)).toEqual([]);
  });

  it('drops the computer-key mapping every locator of This Is Amazing Grace carries', async () => {
    const song = await readSet(join(FIXTURE_LIBRARY, GRACE, 'MultiTrack.als'));
    const songLocators = elements(element(song, 'LiveSet', 'Locators', 'Locators'), 'Locator');
    expect(songLocators.filter((locator) => element(locator, 'Mapping', 'PersistentKeyString').attributes.Value === '')).toEqual([]);
    expect(elements(element(song, 'LiveSet', 'Locators')).map((child) => child.name)).toEqual(['Locators', 'NextLocatorMapping', 'PreviousLocatorMapping']);
    const workspace = await createWorkspace();

    await build(workspace, GRACE);

    const root = await readSet(setPath(workspace));
    const built = locators(root);
    expect(built).toHaveLength(13);
    expect(built.filter(({ keyMapped }) => keyMapped)).toEqual([]);
    // The song's own next and previous locator keys are not copied either.
    expect(elements(element(root, 'LiveSet', 'Locators')).map((child) => child.name)).toEqual(['Locators']);
  });

  it('puts locators stored out of time order, as Trust In God stores them, in time order', async () => {
    const workspace = await createWorkspace();

    await build(workspace, TRUST);

    const built = locators(await readSet(setPath(workspace)));
    expect(built).toHaveLength(17);
    expect(built[0]).toEqual({ id: '0', time: 0, name: '1 - Count Off (Trust In God)', keyMapped: false });
    expect(built.at(-1)).toEqual({ id: '16', time: 324, name: '1 - End', keyMapped: false });
    expect(built.map(({ time }) => time)).toEqual(built.map(({ time }) => time).toSorted((a, b) => a - b));
  });

  it.each([
    // The audio ends at 258, a bar line of its 6/8, and the bar line after its last named locator, the Ending on 252, is
    // 255, earlier, so the End goes on 258, where the song's own marker sat at 261.
    { song: GREAT_ARE, end: 258, count: 17 },
    // The audio ends at 320.0000476, less than the tolerance past the bar line at 320 (the bars walked through its two
    // 2/4 bars), so the End goes on 320, where the song's own marker sat at 324.
    { song: GOODNESS, end: 320, count: 15 },
    // The audio ends at 258, between the bar lines at 256 and 260; the song's own marker sat at 264.
    { song: GRACE, end: 260, count: 13 },
    // The audio ends at 318.0001159, less than the tolerance past the bar line of its 6/8 at 318, and the bar line after
    // its last named locator, the Ending on 309, is 312, earlier, so the End goes on 318, where the song's own marker sat
    // at 324.
    { song: TRUST, end: 318, count: 17 },
  ])('adds 1 - End on the bar line the audio end is on, or else the next one, when $song has no blank end marker', async ({ song, end, count }) => {
    const workspace = await createWorkspace();
    await removeBlankLocator(workspace, song);

    await build(workspace, song);

    const built = locators(await readSet(setPath(workspace)));
    expect(built).toHaveLength(count);
    expect(built.at(-1)).toEqual({ id: String(count - 1), time: end, name: '1 - End', keyMapped: false });
    expect(built.filter(({ name }) => name === '1 - End')).toHaveLength(1);
  });

  it('puts an added 1 - End on the first bar line after a named locator that sits past the audio end, so no section is at or after End', async () => {
    const workspace = await createWorkspace();
    // This Is Amazing Grace's audio ends at 258, and its end marker at 264, a bar line, now carries a name.
    await nameBlankLocator(workspace, GRACE, 'Outro');

    await build(workspace, GRACE);

    const built = locators(await readSet(setPath(workspace)));
    expect(built).toHaveLength(14);
    expect(built.slice(-2)).toEqual([
      { id: '12', time: 264, name: '1 - Outro', keyMapped: false },
      { id: '13', time: 268, name: '1 - End', keyMapped: false },
    ]);
    expect(built.map(({ time }) => time)).toEqual(built.map(({ time }) => time).toSorted((a, b) => a - b));
    expect(built.map(({ id }) => id)).toEqual(built.map((_, index) => String(index)));
  });

  it("takes an end marker named End as the song's End, as the controller reads it, so the song gets one End", async () => {
    const workspace = await createWorkspace();
    await nameBlankLocator(workspace, GRACE, 'End');

    await build(workspace, GRACE, GOODNESS);

    const built = locators(await readSet(setPath(workspace)));
    expect(built.filter(({ name }) => name.startsWith('1 - '))).toHaveLength(13);
    expect(built.filter(({ name }) => name === '1 - End')).toEqual([{ id: '12', time: 264, name: '1 - End', keyMapped: false }]);
    expect(built[13]).toMatchObject({ time: 280, name: '2 - Count Off (Goodness of God)' });
  });

  it('keeps a locator named end in lower case as a section, as the controller reads it, and adds 1 - End after it', async () => {
    const workspace = await createWorkspace();
    await nameBlankLocator(workspace, GRACE, 'end');

    await build(workspace, GRACE);

    const built = locators(await readSet(setPath(workspace)));
    expect(built.slice(-2)).toEqual([
      { id: '12', time: 264, name: '1 - end', keyMapped: false },
      { id: '13', time: 268, name: '1 - End', keyMapped: false },
    ]);
  });

  it('opens with the arrangement loop off and the playhead at the start, whatever the template was saved with', async () => {
    const workspace = await createWorkspace();
    await saveTemplateLooping(workspace);
    const template = await readSet(workspace.template);
    expect(value(template, 'LiveSet', 'Transport', 'LoopOn')).toBe('true');
    expect(value(template, 'LiveSet', 'Transport', 'CurrentTime')).toBe('8');

    await build(workspace, GOODNESS);

    const root = await readSet(setPath(workspace));
    expect(value(root, 'LiveSet', 'Transport', 'LoopOn')).toBe('false');
    expect(value(root, 'LiveSet', 'Transport', 'CurrentTime')).toBe('0');
  });

  it('leaves the template as it was apart from the clips, the two main-track envelopes, the locators and the transport', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GOODNESS);

    const built = await readSet(setPath(workspace));
    const template = await readSet(workspace.template);
    expect(value(built, 'LiveSet', 'NextPointeeId')).toBe('23994');
    expect(untouchedParts(built)).toEqual(untouchedParts(template));
  });
});

// Worked from the fixtures by the spec's rule. This Is Amazing Grace's End marker, 264, is later than its
// audio end, 258, and a bar line, so its gap starts there; Goodness of God starts 4 bars of 4/4 later, at
// 280. Its End, 324, is later than its audio end and a bar line in its own meter, so its gap starts at
// 280 + 324 = 604; Trust In God starts 4 bars of 6/8, 3 beats each, later, at 616.
const SERVICE = [
  { song: GRACE, start: 0, audioEnd: 258 },
  { song: GOODNESS, start: 280, audioEnd: 320.0000476190476 },
  { song: TRUST, start: 616, audioEnd: 318.00011585362137 },
];

// Beats per bar for the codes the fixtures use: 4/4, 2/4 and 6/8.
const BAR_BEATS: Record<number, number> = { 201: 4, 199: 2, 302: 3 };

// The bar lines from beat 0 up to `until`, walked through time-signature events in time order: a change
// starts a new bar at its time.
function barLines(meter: { time: number; value: number }[], until: number): number[] {
  const beats = (code: number) => {
    const length = BAR_BEATS[code];
    if (length === undefined) throw new Error(`No bar length for ${code}`);
    return length;
  };
  const [start, ...changes] = meter;
  if (!start) throw new Error('No starting meter');
  const lines: number[] = [];
  let length = beats(start.value);
  let bar = 0;
  while (bar <= until) {
    let change = changes[0];
    while (change && change.time <= bar) {
      length = beats(change.value);
      changes.shift();
      change = changes[0];
    }
    lines.push(bar);
    bar = change && change.time < bar + length ? change.time : bar + length;
  }
  return lines;
}

const allClips = (root: XmlElement) => elements(element(root, 'LiveSet', 'Tracks'), 'AudioTrack').flatMap(arrangementClips);

describe('building several songs end to end', () => {
  it('starts This Is Amazing Grace, Goodness of God and Trust In God at 0, 280 and 616, each clip with its own length', async () => {
    const workspace = await createWorkspace();

    const result = await build(workspace, GRACE, GOODNESS, TRUST);

    expect(result).toMatchObject({ ok: true, setPath: setPath(workspace) });
    const root = await readSet(setPath(workspace));
    for (const name of ['GUIDE', 'MT CLICK']) {
      expect(arrangementClips(singleTrack(root, name)).map((clip) => Number(clip.attributes.Time))).toEqual([0, 280, 616]);
    }
    const clips = allClips(root);
    // 8 stems in This Is Amazing Grace, 15 in Goodness of God, 18 in Trust In God.
    expect(clips).toHaveLength(41);
    for (const clip of clips) {
      const time = Number(clip.attributes.Time);
      const song = SERVICE.find(({ start }) => start === time);
      if (!song) throw new Error(`A clip starts at ${time}, where no song starts`);
      expect(Number(value(clip, 'CurrentStart'))).toBe(time);
      expect(Number(value(clip, 'CurrentEnd'))).toBe(time + song.audioEnd);
    }
  });

  it('fills each group from its first slot again for every song, one clip per song on a slot, in time order with no overlap', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GRACE, GOODNESS, TRUST);

    const root = await readSet(setPath(workspace));
    const placed = (track: XmlElement) => arrangementClips(track).map((clip) => `${clip.attributes.Time} ${stemOf(clip)}`);
    expect(Object.fromEntries(GROUPS.map((group) => [group, slots(root, group).map(placed)]))).toEqual({
      DRUMS: [['0 Drums', '280 Drums', '616 Drums'], ['280 Tambourine 1', '616 Perc'], ['616 Tambourine 1'], [], []],
      BASS: [['0 Bass', '280 Bass', '616 Bass'], ['616 Synth Bass 2'], [], [], []],
      'A GTRS': [['0 AG', '280 AG', '616 AG Group'], ['280 AG 3'], ['280 Mandolin'], [], [], []],
      'E GTRS': [['0 EG 2', '280 EG 1', '616 EG 1'], ['280 EG 2', '616 EG 2'], ['280 EG 4', '616 EG Group'], [], [], [], [], [], [], [], []],
      KEYS: [['0 Keys', '280 Piano', '616 Piano 2'], ['280 Rhodes', '616 Organ'], ['280 Strings', '616 Synth Pad'], [], [], [], [], []],
      // Trust In God's four VOX stems fill VOX's four slots exactly.
      VOX: [['0 BGVS', '280 Oohs', '616 BGVS 1'], ['616 Tenor'], ['616 Choir'], ['616 Choir 2']],
      OTHER: [[], [], [], []],
    });
    expect(placed(singleTrack(root, 'GUIDE'))).toEqual(['0 Guide', '280 Guide', '616 Guide']);
    expect(placed(singleTrack(root, 'MT CLICK'))).toEqual(['0 Click Track', '280 Click Track', '616 Click Track']);

    for (const track of elements(element(root, 'LiveSet', 'Tracks'), 'AudioTrack')) {
      const clips = arrangementClips(track);
      expect(clips.map((clip) => clip.attributes.Id)).toEqual(clips.map((_, index) => String(index)));
      clips.slice(1).forEach((clip, index) => {
        const before = clips[index];
        if (!before) throw new Error('No clip before');
        expect(Number(value(before, 'CurrentEnd'))).toBeLessThanOrEqual(Number(clip.attributes.Time));
      });
    }
  });

  it("puts Goodness of God's tempo steps and 2/4 bars at their own positions plus its offset, 280", async () => {
    const workspace = await createWorkspace();

    await build(workspace, GRACE, GOODNESS, TRUST);

    const root = await readSet(setPath(workspace));
    const within = (from: number, to: number) => (event: { time: number }) => event.time > from && event.time < to;
    const goodness = within(280, 604);
    // In the song: the fermata's two instant steps at 299 and 300, and 2/4 bars at 104 and 202.
    expect(parameterState(root, 'Tempo').events.filter(goodness).map(({ time, value }) => [time, value])).toEqual([
      [579, 63],
      [579, 42],
      [580, 42],
      [580, 63],
    ]);
    expect(parameterState(root, 'TimeSignature').events.filter(goodness).map(({ time, value }) => [time, value])).toEqual([
      [384, 199],
      [386, 201],
      [482, 199],
      [484, 201],
    ]);
  });

  it('steps the tempo from 63 to 74 and the meter to 6/8 at the gap start before Trust In God, 604', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GRACE, GOODNESS, TRUST);

    const root = await readSet(setPath(workspace));
    const atGapStart = (event: { time: number }) => event.time === 604;
    // An instant step: two events at one Time, old value then new.
    expect(parameterState(root, 'Tempo').events.filter(atGapStart).map(({ value }) => value)).toEqual([63, 74]);
    // 302 is 6/8.
    expect(parameterState(root, 'TimeSignature').events.filter(atGapStart).map(({ value }) => value)).toEqual([302]);
  });

  it('stitches one tempo map and one time-signature map for the set, numbered 0 to n in time order', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GRACE, GOODNESS, TRUST);

    const root = await readSet(setPath(workspace));
    const tempo = parameterState(root, 'Tempo');
    expect(tempo.manual).toBe(98);
    expect(tempo.events.map(({ time, value }) => [time, value])).toEqual([
      // This Is Amazing Grace holds 98 throughout.
      [-63072000, 98],
      // The gap start before Goodness of God.
      [264, 98],
      [264, 63],
      [579, 63],
      [579, 42],
      [580, 42],
      [580, 63],
      // The gap start before Trust In God.
      [604, 63],
      [604, 74],
      // Trust In God's ritardando, its song times 301 to 309 plus 616.
      [917, 74],
      [917, 71],
      [920, 71],
      [920, 66],
      [922, 66],
      [922, 61],
      [924, 61],
      [924, 34],
      [925, 34],
      [925, 74],
    ]);
    const meter = parameterState(root, 'TimeSignature');
    expect(meter.manual).toBe(201);
    expect(meter.events.map(({ time, value }) => [time, value])).toEqual([
      [-63072000, 201],
      [264, 201],
      [384, 199],
      [386, 201],
      [482, 199],
      [484, 201],
      [604, 302],
    ]);
    expect(tempo.events.map(({ kind }) => kind)).toEqual(tempo.events.map(() => 'FloatEvent'));
    expect(meter.events.map(({ kind }) => kind)).toEqual(meter.events.map(() => 'EnumEvent'));
    for (const { events } of [tempo, meter]) expect(events.map(({ id }) => id)).toEqual(events.map((_, index) => String(index)));
  });

  it("starts every song on a bar line of the built set's own meter", async () => {
    const workspace = await createWorkspace();

    await build(workspace, GRACE, GOODNESS, TRUST);

    const meter = parameterState(await readSet(setPath(workspace)), 'TimeSignature').events;
    const lines = barLines(meter, 900);
    for (const { start } of SERVICE) expect(lines).toContain(start);
    // The gap before Trust In God is in 6/8: bar lines 3 beats apart from its gap start.
    expect(lines.filter((line) => line >= 604 && line <= 616)).toEqual([604, 607, 610, 613, 616]);
  });

  it("numbers each song's locators with its position, from its Count Off at its start to its End, in time order", async () => {
    const workspace = await createWorkspace();

    await build(workspace, GRACE, GOODNESS, TRUST);

    const built = locators(await readSet(setPath(workspace)));
    // 13 from This Is Amazing Grace, 15 from Goodness of God, 17 from Trust In God.
    expect(built).toHaveLength(45);
    expect(built.map(({ time }) => time)).toEqual(built.map(({ time }) => time).toSorted((a, b) => a - b));
    expect(built.map(({ id }) => id)).toEqual(built.map((_, index) => String(index)));
    expect(built.filter(({ keyMapped }) => keyMapped)).toEqual([]);
    const numbers = built.map(({ name }) => Number(name.split(' - ')[0]));
    expect(numbers).toEqual(numbers.toSorted((a, b) => a - b));
    // Each song's End: This Is Amazing Grace's marker at 264, Goodness of God's at 280 + 324 and Trust In
    // God's at 616 + 324.
    const songs = [
      { number: 1, title: 'This Is Amazing Grace', start: 0, end: 264, count: 13 },
      { number: 2, title: 'Goodness of God', start: 280, end: 604, count: 15 },
      { number: 3, title: 'Trust In God', start: 616, end: 940, count: 17 },
    ];
    for (const { number, title, start, end, count } of songs) {
      const own = built.filter(({ name }) => name.startsWith(`${number} - `));
      expect(own).toHaveLength(count);
      expect(own[0]).toMatchObject({ time: start, name: `${number} - Count Off (${title})` });
      expect(own.at(-1)).toMatchObject({ time: end, name: `${number} - End` });
      expect(own.filter(({ name }) => name.startsWith(`${number} - Count Off`))).toHaveLength(1);
      expect(own.filter(({ name }) => name === `${number} - End`)).toHaveLength(1);
    }
    expect(parseSet(built.map(({ name, time }) => ({ name, time }))).songs.map(({ number, title, end }) => ({ number, title, end }))).toEqual(
      songs.map(({ number, title, end }) => ({ number, title, end })),
    );
    // Goodness of God's sections sit at their own times plus 280.
    expect(built.filter(({ name }) => name.startsWith('2 - ')).map(({ time, name }) => [time, name])).toEqual([
      [280, '2 - Count Off (Goodness of God)'],
      [288, '2 - Intro'],
      [320, '2 - Verse 1'],
      [352, '2 - Chorus'],
      [386, '2 - Verse 2'],
      [418, '2 - Chorus'],
      [450, '2 - Bridge'],
      [466, '2 - Bridge'],
      [484, '2 - Interlude'],
      [492, '2 - Chorus'],
      [524, '2 - Vamp'],
      [532, '2 - Chorus'],
      [564, '2 - Tag'],
      [580, '2 - Ending'],
      [604, '2 - End'],
    ]);
  });

  it.each([
    {
      // This Is Amazing Grace's audio ends at 258, now later than its End: the gap starts on the bar line after the
      // audio end, 260, and Goodness of God 4 bars of 4/4 later.
      variant: 'its End marker moved to 256, before its audio end',
      edit: (workspace: Workspace) => moveBlankLocator(workspace, GRACE, 256),
      end: 256,
      start: 276,
    },
    {
      // The build adds 1 - End on the first bar line after the named marker at 264; that End, past the audio
      // end, starts the gap.
      variant: 'its End marker named Outro',
      edit: (workspace: Workspace) => nameBlankLocator(workspace, GRACE, 'Outro'),
      end: 268,
      start: 284,
    },
  ])('starts Goodness of God 4 bars after the later of the audio end and the End of This Is Amazing Grace, with $variant', async ({ edit, end, start }) => {
    const workspace = await createWorkspace();
    await edit(workspace);

    await build(workspace, GRACE, GOODNESS);

    const root = await readSet(setPath(workspace));
    expect(arrangementClips(singleTrack(root, 'GUIDE')).map((clip) => Number(clip.attributes.Time))).toEqual([0, start]);
    const built = locators(root);
    expect(built.filter(({ name }) => name === '1 - End').map(({ time }) => time)).toEqual([end]);
    expect(built.filter(({ name }) => name.startsWith('2 - Count Off')).map(({ time }) => time)).toEqual([start]);
    expect(built.filter(({ name }) => name === '2 - End').map(({ time }) => time)).toEqual([start + 324]);
  });

  // Goodness of God's audio ends at 320.0000476, less than the tolerance past the bar line at 320, which it reaches after 81
  // bars. With its End moved to or before that, the audio end is the later of the two, so the gap starts on 320, set bar
  // 82, and Trust In God starts 4 bars of its 6/8, 3 beats each, later, on 332, set bar 86. An End past the audio end is
  // the later one, and an End is walked exactly, so from one off the grid the gap starts on the next bar line, 324.
  it.each([
    { variant: 'moved to 316, before its audio end', end: 316, gapStart: 320, startBar: 86 },
    { variant: 'moved to 320.00002, between the bar line at 320 and its audio end', end: 320.00002, gapStart: 320, startBar: 86 },
    { variant: 'moved onto its audio end, 320.0000476190476', end: 320.0000476190476, gapStart: 320, startBar: 86 },
    { variant: 'moved to 320.00008, past its audio end', end: 320.00008, gapStart: 324, startBar: 87 },
  ])('starts the gap after Goodness of God on $gapStart, with its End marker $variant', async ({ end, gapStart, startBar }) => {
    const workspace = await createWorkspace();
    await moveBlankLocator(workspace, GOODNESS, end);

    const result = await build(workspace, GOODNESS, TRUST);

    expect(result).toMatchObject({ ok: true, songs: [{ startBar: 1 }, { folder: TRUST, startBar }] });
    const start = gapStart + 12;
    const root = await readSet(setPath(workspace));
    expect(arrangementClips(singleTrack(root, 'GUIDE')).map((clip) => Number(clip.attributes.Time))).toEqual([0, start]);
    const built = locators(root);
    expect(built.filter(({ name }) => name === '1 - End').map(({ time }) => time)).toEqual([end]);
    expect(built.filter(({ name }) => name.startsWith('2 - Count Off')).map(({ time }) => time)).toEqual([start]);
    expect(built.filter(({ name }) => name === '2 - End').map(({ time }) => time)).toEqual([start + 324]);
    // Trust In God's starting 74 BPM and 6/8 come in on the gap start.
    const around = (events: { time: number; value: number }[]) => events.filter(({ time }) => time >= 316 && time <= start).map(({ time, value }) => [time, value]);
    expect(around(parameterState(root, 'Tempo').events)).toEqual([
      [gapStart, 63],
      [gapStart, 74],
    ]);
    expect(around(parameterState(root, 'TimeSignature').events)).toEqual([[gapStart, 302]]);
  });

  it("cuts This Is Amazing Grace's tempo and meter at its gap start, so Goodness of God starts on its own tempo and a bar line", async () => {
    const workspace = await createWorkspace();
    // This Is Amazing Grace as if its tempo ramped from 98 at 232 to 82 at 296 and its meter turned 6/8 at 266,
    // both past its gap start at 264.
    await addMainTrackEvents(workspace, GRACE, 'FloatEvent', [
      [232, 98],
      [296, 82],
    ]);
    await addMainTrackEvents(workspace, GRACE, 'EnumEvent', [[266, 302]]);

    await build(workspace, GRACE, GOODNESS);

    const root = await readSet(setPath(workspace));
    expect(arrangementClips(singleTrack(root, 'GUIDE')).map((clip) => Number(clip.attributes.Time))).toEqual([0, 280]);
    expect(parameterState(root, 'Tempo').events.map(({ time, value }) => [time, value])).toEqual([
      [-63072000, 98],
      [232, 98],
      // The ramp's tempo at the gap start, halfway from 98 to 82, then Goodness of God's.
      [264, 90],
      [264, 63],
      [579, 63],
      [579, 42],
      [580, 42],
      [580, 63],
    ]);
    const meter = parameterState(root, 'TimeSignature').events;
    expect(meter.map(({ time, value }) => [time, value])).toEqual([
      [-63072000, 201],
      [264, 201],
      [384, 199],
      [386, 201],
      [482, 199],
      [484, 201],
    ]);
    expect(barLines(meter, 500)).toContain(280);
  });

  it("writes one tempo step and one meter event at the gap start, where Goodness of God has events of its own", async () => {
    const workspace = await createWorkspace();
    // Goodness of God as if it ended on a 2/4 bar from 322, back to 4/4 at its End, 324, and ramped from 63 at
    // 300 to 70 at 324, then stepped to 80 there. 324 is still its gap start.
    await addMainTrackEvents(workspace, GOODNESS, 'EnumEvent', [
      [322, 199],
      [324, 201],
    ]);
    await addMainTrackEvents(workspace, GOODNESS, 'FloatEvent', [
      [324, 70],
      [324, 80],
    ]);

    await build(workspace, GOODNESS, TRUST);

    const root = await readSet(setPath(workspace));
    // Trust In God starts 4 bars of 6/8 after the gap start.
    expect(arrangementClips(singleTrack(root, 'GUIDE')).map((clip) => Number(clip.attributes.Time))).toEqual([0, 336]);
    // After the fermata's last step, at 300.
    const nearGap = (event: { time: number }) => event.time > 300 && event.time <= 336;
    // The tempo the ramp arrives at, 70, then Trust In God's.
    expect(parameterState(root, 'Tempo').events.filter(nearGap).map(({ time, value }) => [time, value])).toEqual([
      [324, 70],
      [324, 74],
    ]);
    expect(parameterState(root, 'TimeSignature').events.filter(nearGap).map(({ time, value }) => [time, value])).toEqual([
      [322, 199],
      [324, 302],
    ]);
  });

  it("steps the tempo at the gap start from the tempo Goodness of God ends on, not the one it starts on", async () => {
    const workspace = await createWorkspace();
    // Goodness of God as if it slowed from 63 to 50 at 310 and ended there, as Build My Life ends on 34 after
    // starting on 70.
    await addMainTrackEvents(workspace, GOODNESS, 'FloatEvent', [
      [310, 63],
      [310, 50],
    ]);

    await build(workspace, GOODNESS, TRUST);

    const root = await readSet(setPath(workspace));
    // After the fermata's last step, at 300.
    const nearGap = (event: { time: number }) => event.time > 300 && event.time <= 336;
    expect(parameterState(root, 'Tempo').events.filter(nearGap).map(({ time, value }) => [time, value])).toEqual([
      [310, 63],
      [310, 50],
      [324, 50],
      [324, 74],
    ]);
  });

  it.each(LATE_STARTS)('starts This Is Amazing Grace after Goodness of God on the tempo and time signature it starts on, set by events $at', async ({ time }) => {
    const workspace = await createWorkspace();
    await startGraceLate(workspace, time);

    await build(workspace, GOODNESS, GRACE);

    const root = await readSet(setPath(workspace));
    // Goodness of God's gap starts at 324, and its gap is 4 bars of 6/8, 3 beats each.
    expect(arrangementClips(singleTrack(root, 'GUIDE')).map((clip) => Number(clip.attributes.Time))).toEqual([0, 336]);
    expect(parameterState(root, 'Tempo').events.map(({ time, value }) => [time, value])).toEqual([
      [-63072000, 63],
      [299, 63],
      [299, 42],
      [300, 42],
      [300, 63],
      [324, 63],
      [324, 110],
    ]);
    const meter = parameterState(root, 'TimeSignature').events;
    expect(meter.map(({ time, value }) => [time, value])).toEqual([
      [-63072000, 201],
      [104, 199],
      [106, 201],
      [202, 199],
      [204, 201],
      [324, 302],
    ]);
    expect(barLines(meter, 340)).toContain(336);
  });

  // This Is Amazing Grace as if a ramp ran from 98 at its beat 0 to 120 at beat 100: it plays 98 at its first beat and
  // 109 at beat 50, wherever it sits in the set.
  it.each([
    { place: 'song 1', songs: [GRACE], start: 0 },
    { place: 'song 2', songs: [GOODNESS, GRACE], start: 340 },
  ])('keeps a tempo ramp that starts at beat 0 of $place', async ({ songs, start }) => {
    const workspace = await createWorkspace();
    await addMainTrackEvents(workspace, GRACE, 'FloatEvent', [
      [0, 98],
      [100, 120],
    ]);
    await build(workspace, ...songs);
    const map = parameterState(await readSet(setPath(workspace)), 'Tempo').events.map(({ time, value }): [number, number] => [time, value]);
    expect(tempoAt(map, start)).toBeCloseTo(98);
    expect(tempoAt(map, start + 50)).toBeCloseTo(109);
  });
});

describe("copying each song's audio into the project", () => {
  it('points every clip at its copy in Songs/<title>/, by the path from the project folder and the absolute path, keeping what Live wrote about the file', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GOODNESS);

    const song = allClips(await readSet(join(workspace.library, GOODNESS, 'MultiTrack.als')));
    const clips = allClips(await readSet(setPath(workspace)));
    expect(clips.map(stemOf).toSorted()).toEqual(GOODNESS_STEMS.toSorted());
    for (const clip of clips) {
      const stem = stemOf(clip);
      const fileRef = element(clip, 'SampleRef', 'FileRef');
      expect(value(fileRef, 'RelativePathType')).toBe('3');
      expect(value(fileRef, 'RelativePath')).toBe(`Songs/Goodness of God/${stem}.wav`);
      expect(value(fileRef, 'Path')).toBe(join(projectFolder(workspace), 'Songs', 'Goodness of God', `${stem}.wav`));
      const own = song.find((candidate) => stemOf(candidate) === stem);
      if (!own) throw new Error(`Goodness of God has no clip for ${stem}`);
      for (const path of [['FileRef', 'OriginalFileSize'], ['FileRef', 'OriginalCrc'], ['LastModDate']]) {
        expect(value(clip, 'SampleRef', ...path)).toBe(value(own, 'SampleRef', ...path));
      }
    }
  });

  it('copies each WAV a clip names and its .asd into Songs/<title>/, byte for byte and last modified at the clip LastModDate', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GOODNESS);

    expect(await readdir(join(projectFolder(workspace), 'Songs'))).toEqual(['Goodness of God']);
    const copies = join(projectFolder(workspace), 'Songs', 'Goodness of God');
    expect((await readdir(copies)).toSorted()).toEqual(GOODNESS_STEMS.flatMap((stem) => [`${stem}.wav`, `${stem}.wav.asd`]).toSorted());
    for (const file of await readdir(copies)) {
      expect(await readFile(join(copies, file))).toEqual(await readFile(libraryFile(workspace, GOODNESS, file)));
    }
    for (const clip of allClips(await readSet(setPath(workspace)))) {
      const lastModDate = Number(value(clip, 'SampleRef', 'LastModDate'));
      for (const file of [`${stemOf(clip)}.wav`, `${stemOf(clip)}.wav.asd`]) {
        expect(Math.floor((await stat(join(copies, file))).mtimeMs / 1000)).toBe(lastModDate);
      }
    }
  });

  it('copies a WAV that has no .asd on its own, as Fall Like Rain has ten', async () => {
    const workspace = await createWorkspace();
    await removeAnalysisFile(workspace, GOODNESS, 'Bass.wav');

    const result = await build(workspace, GOODNESS);

    expect(result).toMatchObject({ ok: true, setPath: setPath(workspace) });
    const copies = join(projectFolder(workspace), 'Songs', 'Goodness of God');
    expect(await readFile(join(copies, 'Bass.wav'))).toEqual(await readFile(libraryFile(workspace, GOODNESS, 'Bass.wav')));
    expect(existsSync(join(copies, 'Bass.wav.asd'))).toBe(false);
    expect(existsSync(join(copies, 'Guide.wav.asd'))).toBe(true);
  });

  it('keeps a separate copy of Bass.wav for This Is Amazing Grace and Goodness of God, and points each song at its own', async () => {
    const workspace = await createWorkspace();

    await build(workspace, GRACE, GOODNESS);

    const songs = join(projectFolder(workspace), 'Songs');
    expect((await readdir(songs)).toSorted()).toEqual(['Goodness of God', 'This Is Amazing Grace']);
    const graceBass = await readFile(join(songs, 'This Is Amazing Grace', 'Bass.wav'));
    const goodnessBass = await readFile(join(songs, 'Goodness of God', 'Bass.wav'));
    expect(graceBass).toEqual(await readFile(libraryFile(workspace, GRACE, 'Bass.wav')));
    expect(goodnessBass).toEqual(await readFile(libraryFile(workspace, GOODNESS, 'Bass.wav')));
    expect(graceBass).not.toEqual(goodnessBass);

    const root = await readSet(setPath(workspace));
    const fileOf = (clip: XmlElement) => value(clip, 'SampleRef', 'FileRef', 'RelativePath');
    const [bass] = slots(root, 'BASS');
    if (!bass) throw new Error('No BASS slot');
    expect(arrangementClips(bass).map((clip) => [Number(clip.attributes.Time), fileOf(clip)])).toEqual([
      [0, 'Songs/This Is Amazing Grace/Bass.wav'],
      [280, 'Songs/Goodness of God/Bass.wav'],
    ]);
    // This Is Amazing Grace starts at 0 and Goodness of God at 280.
    const clips = allClips(root);
    expect(clips).toHaveLength(8 + 15);
    for (const clip of clips) {
      const title = Number(clip.attributes.Time) === 0 ? 'This Is Amazing Grace' : 'Goodness of God';
      expect(fileOf(clip)).toBe(`Songs/${title}/${stemOf(clip)}.wav`);
      expect(value(clip, 'SampleRef', 'FileRef', 'Path')).toBe(join(projectFolder(workspace), fileOf(clip)));
      expect(existsSync(value(clip, 'SampleRef', 'FileRef', 'Path'))).toBe(true);
    }
  });

  it('copies a song named twice in the service once, and points both at that copy', async () => {
    const workspace = await createWorkspace();

    const result = await build(workspace, GRACE, GOODNESS, GRACE);

    expect(result).toMatchObject({ ok: true, setPath: setPath(workspace) });
    const songs = join(projectFolder(workspace), 'Songs');
    expect((await readdir(songs)).toSorted()).toEqual(['Goodness of God', 'This Is Amazing Grace']);
    const root = await readSet(setPath(workspace));
    // Each song's clips start where the song does; the second This Is Amazing Grace starts after Goodness of God.
    const starts = arrangementClips(singleTrack(root, 'GUIDE')).map((clip) => Number(clip.attributes.Time));
    expect(starts).toHaveLength(3);
    const [, goodness, secondGrace] = starts;
    const grace = allClips(root).filter((clip) => Number(clip.attributes.Time) !== goodness);
    expect(grace).toHaveLength(8 * 2);
    expect(grace.filter((clip) => Number(clip.attributes.Time) === secondGrace)).toHaveLength(8);
    for (const clip of grace) {
      expect(value(clip, 'SampleRef', 'FileRef', 'RelativePath')).toBe(`Songs/This Is Amazing Grace/${stemOf(clip)}.wav`);
    }
  });

  it('stops before writing anything when two song folders share a title, naming each file both would copy, with every other problem', async () => {
    const workspace = await createWorkspace();
    const otherGoodness = 'Goodness of God-Live-B-70.00bpm';
    await copySongAs(workspace, GOODNESS, otherGoodness);
    await renameTemplateTrack(workspace, 'KEYS', 'PIANOS');

    const result = await build(workspace, GOODNESS, otherGoodness);

    const stems = GOODNESS_STEMS;
    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "KEYS", which the stem map lists.',
        'The stem map has no entry for the template\'s group "PIANOS".',
        ...stems.map(
          (stem) =>
            `Songs/Goodness of God/${stem}.wav would hold two different files, ${GOODNESS}/MultiTracks/${stem}.wav and ${otherGoodness}/MultiTracks/${stem}.wav. Each song's audio is copied to Songs/<title>/ by file name, so one set cannot hold two song folders with one title.`,
        ),
      ],
    });
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('copies the first song Ableton Project Info folder into the project, so Live sees a project', async () => {
    const workspace = await createWorkspace();

    await build(workspace, TRUST, GOODNESS);

    const project = projectFolder(workspace);
    expect((await readdir(project)).toSorted()).toEqual([`${DATE} Sunday.als`, PROJECT_INFO, 'Songs']);
    const trust = join(workspace.library, TRUST, PROJECT_INFO);
    const files = await readdir(trust);
    expect(files).toHaveLength(2);
    expect((await readdir(join(project, PROJECT_INFO))).toSorted()).toEqual(files.toSorted());
    for (const file of files) expect(await readFile(join(project, PROJECT_INFO, file))).toEqual(await readFile(join(trust, file)));
  });

  it('gives the project an empty Ableton Project Info folder, as Live makes for a new project, when the first song has none', async () => {
    const workspace = await createWorkspace();
    await removeProjectInfo(workspace, TRUST);

    const result = await build(workspace, TRUST, GOODNESS);

    expect(result).toMatchObject({ ok: true, setPath: setPath(workspace) });
    expect(await readdir(join(projectFolder(workspace), PROJECT_INFO))).toEqual([]);
  });
});

// The fixture library's song folders, as a name problem lists them: sorted, one per line, indented two spaces.
const listed = (...folders: string[]) => folders.map((folder) => `\n  ${folder}`).join('');

describe('naming songs by a short name', () => {
  it.each([
    { name: 'grace', title: 'This Is Amazing Grace' },
    // Letter case plays no part.
    { name: 'GOODNESS OF GOD', title: 'Goodness of God' },
  ])('builds $title from "$name", a part of its folder name', async ({ name, title }) => {
    const workspace = await createWorkspace();

    const result = await build(workspace, name);

    expect(result.ok).toBe(true);
    expect(locators(await readSet(setPath(workspace)))[0]?.name).toBe(`1 - Count Off (${title})`);
  });

  // A Finder duplicate's folder name holds the original's whole name, so only a whole name can pick the original.
  it.each([
    { name: GRACE, folder: GRACE },
    // Letter case plays no part in a whole name either.
    { name: GRACE.toUpperCase(), folder: GRACE },
    { name: `${GRACE} copy`, folder: `${GRACE} copy` },
  ])('builds $folder from "$name", its whole folder name, beside a longer folder name that holds it', async ({ name, folder }) => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, `${GRACE} copy`);

    const result = await build(workspace, name);

    expect(result).toMatchObject({ ok: true, songs: [{ folder }] });
    expect(locators(await readSet(setPath(workspace)))[0]?.name).toBe('1 - Count Off (This Is Amazing Grace)');
  });

  it('stops on a part of the name that a folder and its duplicate both hold, listing the two, and writes nothing', async () => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GRACE, `${GRACE} copy`);

    const result = await build(workspace, 'grace');

    expect(result).toEqual({
      ok: false,
      problems: [`"grace" matches 2 song folders; name one more fully:${listed(GRACE, `${GRACE} copy`)}`],
    });
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('stops on a name that matches no song folder, listing every song folder but _template, and writes nothing', async () => {
    const workspace = await createWorkspace();
    // Finder leaves a .DS_Store file in the real library; a file is never a song.
    await writeFile(join(workspace.library, '.DS_Store'), 'Finder settings');

    const result = await build(workspace, 'freedom');

    expect(result).toEqual({
      ok: false,
      problems: [`"freedom" matches no song folder in ${workspace.library}. The song folders are:${listed(GOODNESS, GREAT_ARE, GRACE, TRUST)}`],
    });
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  // A song folder kept on another drive and linked into the library is a song folder; a link to a file, or to nothing,
  // is not.
  it('offers a song folder the library holds as a symbolic link, and builds it', async () => {
    const workspace = await createWorkspace();
    const elsewhere = join(workspace.dir, 'Other Drive', GRACE);
    await mkdir(dirname(elsewhere));
    await rename(join(workspace.library, GRACE), elsewhere);
    await symlink(elsewhere, join(workspace.library, GRACE));
    await symlink(join(workspace.dir, 'Nothing'), join(workspace.library, 'Broken Link'));
    await symlink(join(workspace.library, GOODNESS, 'MultiTrack.als'), join(workspace.library, 'File Link'));

    expect(await build(workspace, 'freedom')).toEqual({
      ok: false,
      problems: [`"freedom" matches no song folder in ${workspace.library}. The song folders are:${listed(GOODNESS, GREAT_ARE, GRACE, TRUST)}`],
    });
    const result = await build(workspace, 'grace');

    expect(result).toMatchObject({ ok: true, songs: [{ folder: GRACE }] });
    expect(locators(await readSet(setPath(workspace)))[0]?.name).toBe('1 - Count Off (This Is Amazing Grace)');
  });

  it('stops on a name that matches two song folders, listing the two, and writes nothing', async () => {
    const workspace = await createWorkspace();

    const result = await build(workspace, 'god');

    expect(result).toEqual({
      ok: false,
      problems: [`"god" matches 2 song folders; name one more fully:${listed(GOODNESS, TRUST)}`],
    });
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('never matches _template, the folder that holds the template', async () => {
    const workspace = await createWorkspace();

    const result = await build(workspace, 'template');

    expect(result).toEqual({
      ok: false,
      problems: [`"template" matches no song folder in ${workspace.library}. The song folders are:${listed(GOODNESS, GREAT_ARE, GRACE, TRUST)}`],
    });
  });

  // The Mac's disk opens a folder by its name in any letter case, so _Template is the folder the template is read from
  // and _Pads the one the pads are read from.
  it.each(['template', 'pads'])('never matches _Template or _Pads, the reserved folders in another letter case, for "%s"', async (name) => {
    const workspace = await createWorkspace();
    await rename(join(workspace.library, '_template'), join(workspace.library, '_Template'));
    await mkdir(join(workspace.library, '_Pads'));
    const template = join(workspace.library, '_Template/template Project/template.als');

    const result = await buildSet({ ...(await buildOptions(workspace, [name])), template });

    expect(result).toEqual({
      ok: false,
      problems: [`"${name}" matches no song folder in ${workspace.library}. The song folders are:${listed(GOODNESS, GREAT_ARE, GRACE, TRUST)}`],
    });
  });

  it("reports each name's problem once, in its place among the songs' problems, in the order named", async () => {
    const workspace = await createWorkspace();
    const stemMap = await readStemMap();
    // Goodness of God's Mandolin stem, left out of the map, gives that song a problem of its own.
    stemMap['A GTRS'] = (stemMap['A GTRS'] ?? []).filter((stem) => stem !== 'Mandolin');

    // "goodness" and "GOODNESS OF GOD" both name Goodness of God, whose problem comes back once.
    const result = await buildSet({ ...(await buildOptions(workspace, ['freedom', 'goodness', 'god', 'GOODNESS OF GOD', 'freedom'])), stemMap });

    expect(result).toEqual({
      ok: false,
      problems: [
        `"freedom" matches no song folder in ${workspace.library}. The song folders are:${listed(GOODNESS, GREAT_ARE, GRACE, TRUST)}`,
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Mandolin".',
        `"god" matches 2 song folders; name one more fully:${listed(GOODNESS, TRUST)}`,
      ],
    });
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  it('stops with one problem naming the library when the library cannot be read, and writes nothing', async () => {
    const workspace = await createWorkspace();
    const library = join(workspace.dir, 'MultiTraks');

    const result = await buildSet({ ...(await buildOptions(workspace, ['grace', 'goodness'])), library });

    expect(result).toEqual({ ok: false, problems: [`Cannot read the song library ${library}.`] });
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });

  // The template here lives outside the mistyped library, so it can still be read and checked.
  it("reports the template's problems and an existing set folder with the library problem, in one pass", async () => {
    const workspace = await createWorkspace();
    await build(workspace, GOODNESS);
    await renameTemplateTrack(workspace, 'KEYS', 'PIANOS');
    const library = join(workspace.dir, 'MultiTraks');

    const result = await buildSet({ ...(await buildOptions(workspace, ['grace'])), library });

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "KEYS", which the stem map lists.',
        'The stem map has no entry for the template\'s group "PIANOS".',
        `Cannot read the song library ${library}.`,
        `${projectFolder(workspace)} already exists. Build with --replace "${projectFolder(workspace)}" to replace it.`,
      ],
    });
  });

  it('stops with the library problem alone, and throws nothing, when the template is the default one inside the unreadable library', async () => {
    const workspace = await createWorkspace();
    const library = join(workspace.dir, 'MultiTraks');
    const template = join(library, '_template/template Project/template.als');

    const result = await buildSet({ ...(await buildOptions(workspace, ['grace'])), library, template });

    expect(result).toEqual({ ok: false, problems: [`Cannot read the song library ${library}.`] });
    expect(existsSync(workspace.outputRoot)).toBe(false);
  });
});

describe('a set folder that already exists', () => {
  it('stops a second build for the same date, naming the folder, and leaves the first set exactly as it was', async () => {
    const workspace = await createWorkspace();
    await build(workspace, GOODNESS);
    const before = await snapshotFolder(workspace.outputRoot);

    const result = await build(workspace, 'grace');

    expect(result).toEqual({ ok: false, problems: [`${projectFolder(workspace)} already exists. Build with --replace "${projectFolder(workspace)}" to replace it.`] });
    expect(await snapshotFolder(workspace.outputRoot)).toEqual(before);
  });

  it('replaces the folder with the new set when the build replaces, so nothing of the old set is left in it', async () => {
    const workspace = await createWorkspace();
    await build(workspace, GOODNESS);
    // A file only the old folder holds, as an edit by hand in Live might leave.
    await writeFile(join(projectFolder(workspace), 'hand edit.txt'), 'Notes for the band');

    const result = await buildSet({ ...(await buildOptions(workspace, ['grace'])), replace: true });

    expect(result).toMatchObject({ ok: true, setPath: setPath(workspace) });
    const root = await readSet(setPath(workspace));
    expect(locators(root)[0]?.name).toBe('1 - Count Off (This Is Amazing Grace)');
    // Every clip points at the set folder, not at the work folder the replacing build wrote the set in.
    const clips = allClips(root);
    expect(clips.length).toBeGreaterThan(0);
    for (const clip of clips) {
      const path = value(clip, 'SampleRef', 'FileRef', 'Path');
      expect(path.startsWith(`${projectFolder(workspace)}/`), path).toBe(true);
      expect(existsSync(path)).toBe(true);
    }
    expect((await readdir(projectFolder(workspace))).toSorted()).toEqual([`${DATE} Sunday.als`, PROJECT_INFO, 'Songs']);
    expect(await readdir(join(projectFolder(workspace), 'Songs'))).toEqual(['This Is Amazing Grace']);
    // Nothing the replacing build worked in is left beside the set folder.
    expect(await readdir(workspace.outputRoot)).toEqual([`${DATE} Sunday`]);
  });

  it('builds when the build replaces and no folder exists yet', async () => {
    const workspace = await createWorkspace();

    const result = await buildSet({ ...(await buildOptions(workspace, ['grace'])), replace: true });

    expect(result).toMatchObject({ ok: true, setPath: setPath(workspace) });
    expect(existsSync(setPath(workspace))).toBe(true);
  });

  it('lists the existing folder after every other problem', async () => {
    const workspace = await createWorkspace();
    await build(workspace, GOODNESS);

    const result = await build(workspace, 'freedom');

    expect(result).toEqual({
      ok: false,
      problems: [
        `"freedom" matches no song folder in ${workspace.library}. The song folders are:${listed(GOODNESS, GREAT_ARE, GRACE, TRUST)}`,
        `${projectFolder(workspace)} already exists. Build with --replace "${projectFolder(workspace)}" to replace it.`,
      ],
    });
  });

  it.each([
    {
      stop: 'stops on a problem',
      songs: ['freedom'],
      arrange: async () => {},
      outcome: (built: Promise<BuildResult>) => expect(built).resolves.toMatchObject({ ok: false }),
    },
    {
      // A clip whose file is outside its song folder is a song problem, found before anything is written.
      stop: 'stops on a clip whose file is outside its song folder',
      songs: ['goodness'],
      arrange: (workspace: Workspace) =>
        editSongTrack(workspace, GOODNESS, 'EG 1', (text) => text.replace('<RelativePathType Value="3" />', '<RelativePathType Value="1" />')),
      outcome: (built: Promise<BuildResult>) =>
        expect(built).resolves.toEqual({
          ok: false,
          problems: [`${GOODNESS}: the stem "EG 1" refers to a file outside the song's folder, which the builder does not handle.`],
        }),
    },
  ])('leaves the old folder exactly as it was when a build that replaces $stop', async ({ songs, arrange, outcome }) => {
    const workspace = await createWorkspace();
    await build(workspace, GOODNESS);
    await writeFile(join(projectFolder(workspace), 'hand edit.txt'), 'Notes for the band');
    await arrange(workspace);
    const before = await snapshotFolder(workspace.outputRoot);

    await outcome(buildSet({ ...(await buildOptions(workspace, songs)), replace: true }));

    expect(await snapshotFolder(workspace.outputRoot)).toEqual(before);
  });

  // A WAV the library holds but cannot read passes every check, and copying it fails part way through writing the new
  // set. Root reads a file of mode 000, so these tests do not run as root.
  it.skipIf(process.getuid?.() === 0)(
    'leaves the old folder exactly as it was when a build that replaces fails part way through writing the new set',
    async () => {
      const workspace = await createWorkspace();
      await build(workspace, GOODNESS);
      await writeFile(join(projectFolder(workspace), 'hand edit.txt'), 'Notes for the band');
      const unreadable = libraryFile(workspace, GOODNESS, 'AG 3.wav');
      await chmod(unreadable, 0o000);
      try {
        const before = await snapshotFolder(workspace.outputRoot);

        await expect(buildSet({ ...(await buildOptions(workspace, ['goodness'])), replace: true })).rejects.toThrow('AG 3.wav');

        expect(await snapshotFolder(workspace.outputRoot)).toEqual(before);
      } finally {
        await chmod(unreadable, 0o644);
      }
    },
  );

  it.skipIf(process.getuid?.() === 0)('leaves the output root exactly as it was when a build without replace fails part way through writing', async () => {
    const workspace = await createWorkspace();
    await buildSet({ ...(await buildOptions(workspace, ['grace'])), date: '2026-10-25' });
    const unreadable = libraryFile(workspace, GOODNESS, 'AG 3.wav');
    await chmod(unreadable, 0o000);
    try {
      const before = await snapshotFolder(workspace.outputRoot);

      await expect(buildSet(await buildOptions(workspace, ['goodness']))).rejects.toThrow('AG 3.wav');

      expect(await snapshotFolder(workspace.outputRoot)).toEqual(before);
    } finally {
      await chmod(unreadable, 0o644);
    }
  });

  it.skipIf(process.getuid?.() === 0)(
    'stops the next build on the folder a failed cleanup leaves, and replaces that folder when the build replaces',
    async () => {
      const workspace = await createWorkspace();
      const unreadable = libraryFile(workspace, GOODNESS, 'AG 3.wav');
      const projectInfo = join(workspace.library, GOODNESS, PROJECT_INFO);
      const copied = join(projectFolder(workspace), PROJECT_INFO);
      await chmod(unreadable, 0o000);
      await chmod(projectInfo, 0o555);
      try {
        await expect(buildSet(await buildOptions(workspace, ['goodness']))).rejects.toThrow();
      } finally {
        await chmod(unreadable, 0o644);
        await chmod(projectInfo, 0o755);
        if (existsSync(copied)) await chmod(copied, 0o755);
      }
      expect(existsSync(copied)).toBe(true);

      expect(await build(workspace, 'grace')).toEqual({ ok: false, problems: [`${projectFolder(workspace)} already exists. Build with --replace "${projectFolder(workspace)}" to replace it.`] });

      const replaced = await buildSet({ ...(await buildOptions(workspace, ['grace'])), replace: true });

      expect(replaced).toMatchObject({ ok: true, setPath: setPath(workspace) });
      expect(await readdir(join(projectFolder(workspace), 'Songs'))).toEqual(['This Is Amazing Grace']);
      expect(await readdir(workspace.outputRoot)).toEqual([`${DATE} Sunday`]);
    },
  );
});

describe('the summary a build gives', () => {
  it("gives each song's folder, title, start bar in the set, starting tempo and starting meter, in service order", async () => {
    const workspace = await createWorkspace();

    const result = await build(workspace, 'grace', 'goodness', 'trust');

    // Worked from the fixtures: This Is Amazing Grace's gap starts at 264, after 66 bars of 4/4, and Goodness of God
    // starts 4 bars later, on bar 71. Goodness of God's gap starts 324 beats in, after 82 bars (80 of 4/4 and two of
    // 2/4), and Trust In God starts 4 bars of 6/8 later, on bar 157.
    expect(result).toEqual({
      ok: true,
      // test/set-builder-durations.test.ts checks them.
      durations: expect.any(Array),
      setPath: setPath(workspace),
      songs: [
        { folder: GRACE, title: 'This Is Amazing Grace', startBar: 1, tempo: 98, meter: '4/4', transition: { type: 'gap' } },
        { folder: GOODNESS, title: 'Goodness of God', startBar: 71, tempo: 63, meter: '4/4', transition: { type: 'gap' } },
        { folder: TRUST, title: 'Trust In God', startBar: 157, tempo: 74, meter: '6/8' },
      ],
    });
    // The same bars, counted through the built set's own time-signature map up to where each song's clips start.
    const lines = barLines(parameterState(await readSet(setPath(workspace)), 'TimeSignature').events, 900);
    expect(SERVICE.map(({ start }) => lines.indexOf(start) + 1)).toEqual([1, 71, 157]);
  });

  it.each(LATE_STARTS)('gives the tempo and meter This Is Amazing Grace starts on, set by events $at', async ({ time }) => {
    const workspace = await createWorkspace();
    await startGraceLate(workspace, time);

    const result = await build(workspace, 'grace');

    expect(result).toMatchObject({ ok: true, songs: [{ folder: GRACE, startBar: 1, tempo: 110, meter: '6/8' }] });
  });

  it('counts one bar line where two time-signature events share a time', async () => {
    const workspace = await createWorkspace();
    // Goodness of God as if it changed to 2/4 and straight back to 4/4 at 100, a bar line: its bars stay as they were.
    await addMainTrackEvents(workspace, GOODNESS, 'EnumEvent', [
      [100, 199],
      [100, 201],
    ]);

    const result = await build(workspace, 'goodness', 'trust');

    // Goodness of God's 82 bars, then the 4-bar gap: Trust In God starts on bar 87, at beat 336.
    expect(result).toMatchObject({ ok: true, songs: [{ startBar: 1 }, { folder: TRUST, startBar: 87 }] });
    const lines = barLines(parameterState(await readSet(setPath(workspace)), 'TimeSignature').events, 400);
    expect(lines.indexOf(336) + 1).toBe(87);
  });
});
