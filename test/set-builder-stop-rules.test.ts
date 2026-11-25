import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { XmlElement } from '@rgrove/parse-xml';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSet, type BuildResult, type StemMap, type Transition } from '../src/set-builder/build-set.ts';
import {
  addLive8Song,
  arrangementClips,
  copySongAs,
  createWorkspace,
  DATE,
  editSongTrack,
  GOODNESS,
  GOODNESS_STEMS,
  GRACE,
  GREAT_ARE,
  libraryFile,
  LIVE_8_SONG,
  moveLocator,
  moveStartingMainTrackEvent,
  moveTemplateTrackFirst,
  readSet,
  readStemMap,
  removeLocator,
  removeLocators,
  removeWorkspaces,
  renameTemplateTrack,
  setPath,
  setSongVersion,
  slots,
  snapshotFolder,
  stemOf,
  TRUST,
  value,
  type Workspace,
} from './set-builder-harness.ts';

afterEach(removeWorkspaces);

const OVERLAP: Transition = { type: 'overlap' };

type Transitions = Partial<Record<number, Transition>>;

// An earlier set already in the output root, so a test can tell that a stopped build left it as it was.
async function seedOutputRoot(workspace: Workspace): Promise<void> {
  const earlier = join(workspace.outputRoot, '2026-10-11 Sunday');
  await mkdir(earlier, { recursive: true });
  await writeFile(join(earlier, '2026-10-11 Sunday.als'), 'An earlier set');
}

// Builds `songs` over a seeded output root, with `stemMap` or the committed map and the transitions after each song
// position, and checks that the build, whether it returns or throws, left the output root exactly as it was: every
// stop rule is checked before anything is written.
async function stoppedBuild(workspace: Workspace, songs: string[], stemMap?: StemMap, transitions?: Transitions): Promise<BuildResult> {
  await seedOutputRoot(workspace);
  const before = await snapshotFolder(workspace.outputRoot);
  try {
    return await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: stemMap ?? (await readStemMap()),
      songs,
      transitions,
      date: DATE,
      outputRoot: workspace.outputRoot,
    });
  } finally {
    expect(await snapshotFolder(workspace.outputRoot)).toEqual(before);
  }
}

// The map as if no target listed `stems`.
function withoutStems(stemMap: StemMap, ...stems: string[]): StemMap {
  return Object.fromEntries(Object.entries(stemMap).map(([target, listed]) => [target, listed.filter((stem) => !stems.includes(stem))]));
}

// The map as if `stems` were listed under `target` and nowhere else.
function movedStems(stemMap: StemMap, target: string, ...stems: string[]): StemMap {
  const moved = withoutStems(stemMap, ...stems);
  return { ...moved, [target]: [...(moved[target] ?? []), ...stems] };
}

// The map with `stems` also listed under `target`, after its own stems, wherever else the map lists them.
function addedStems(stemMap: StemMap, target: string, ...stems: string[]): StemMap {
  return { ...stemMap, [target]: [...(stemMap[target] ?? []), ...stems] };
}

// The problem for each of Goodness of God's WAVs when the library holds the song in the folders `first` and `other`,
// whose titles name one folder on the disk: both WAVs are bound for the first's place in Songs/<title>/.
function sharedTitleProblems(first: string, other: string): string[] {
  const title = first.split('-')[0] ?? first;
  return GOODNESS_STEMS.map(
    (stem) =>
      `Songs/${title}/${stem}.wav would hold two different files, ${first}/MultiTracks/${stem}.wav and ${other}/MultiTracks/${stem}.wav. Each song's audio is copied to Songs/<title>/ by file name, so one set cannot hold two song folders with one title.`,
  );
}

// The first match of `pattern` in `text`: its first group when it has one, else the whole match.
function matched(pattern: RegExp, text: string): string {
  const match = pattern.exec(text);
  if (!match) throw new Error(`No match for ${pattern}`);
  return match[1] ?? match[0];
}

// An automation or clip envelope, as Live writes one, on the track's volume, whose AutomationTarget Id is read
// from the track's own text.
function envelope(kind: 'AutomationEnvelope' | 'ClipEnvelope', track: string): string {
  const volume = matched(/<Volume>[\s\S]*?<AutomationTarget Id="(\d+)"/, track);
  return `<${kind} Id="0"><EnvelopeTarget><PointeeId Value="${volume}" /></EnvelopeTarget><Automation><Events><FloatEvent Id="0" Time="-63072000" Value="0.5" /></Events></Automation></${kind}>`;
}

// The track's text with one take lane, as Live writes one, whose clip list is `events`.
function withTakeLane(track: string, events: string): string {
  const lane = `<TakeLane Id="0"><ClipAutomation>${events}</ClipAutomation><Name Value="Take 1" /></TakeLane>`;
  return track.replace('<TakeLanes>\n\t\t\t\t\t<TakeLanes />', `<TakeLanes>\n\t\t\t\t\t<TakeLanes>${lane}</TakeLanes>`);
}

describe('stopping before writing', () => {
  it('stops on a song saved by Live 8, telling the operator to open and save it in Live 12', async () => {
    const workspace = await createWorkspace();
    await addLive8Song(workspace);

    const result = await stoppedBuild(workspace, [LIVE_8_SONG]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'There Is Freedom-Where the Glory Is-A-76.00bpm: saved by Ableton Live 8.4.2, not Live 12. Open the song in Live 12 and save it, then build again.',
      ],
    });
  });

  // Live 11 writes MajorVersion 5, as Live 12 does, so only its MinorVersion tells them apart.
  it.each([
    { saved: 'by Live 11', version: { MinorVersion: '11.0_11300', Creator: 'Ableton Live 11.3.4' }, by: 'Ableton Live 11.3.4' },
    { saved: 'by a Live that wrote no Creator', version: { MinorVersion: '11.0_11300', Creator: undefined }, by: 'an unknown Live version' },
  ])('stops on a song saved $saved, naming the Live that saved it', async ({ version, by }) => {
    const workspace = await createWorkspace();
    await setSongVersion(workspace, GOODNESS, version);

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [`Goodness of God-Victory-A-63.00bpm: saved by ${by}, not Live 12. Open the song in Live 12 and save it, then build again.`],
    });
  });

  it('stops on a template group that does not match the map, naming the map name it lacks and the group the map lacks', async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'KEYS', 'PIANOS');

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "KEYS", which the stem map lists.',
        'The stem map has no entry for the template\'s group "PIANOS".',
      ],
    });
  });

  it('stops on a template single track that does not match the map, naming the map name it lacks and the single track the map lacks', async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'MT CLICK', 'CLICK');

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "MT CLICK", which the stem map lists.',
        'The stem map has no entry for the template\'s single track "CLICK".',
      ],
    });
  });

  // The template's KEYS group and its GUIDE single track both renamed PIANOS: the map lacks PIANOS, its problem names
  // the group as the target of that name, and the single track the build would leave empty stops the build.
  it.each([
    { where: 'below', arrange: async () => {} },
    { where: 'above', arrange: (workspace: Workspace) => moveTemplateTrackFirst(workspace, 'GUIDE') },
  ])('stops on a group and a single track $where it that share a name, keeping the group as the target', async ({ arrange }) => {
    const workspace = await createWorkspace();
    await arrange(workspace);
    await renameTemplateTrack(workspace, 'KEYS', 'PIANOS');
    await renameTemplateTrack(workspace, 'GUIDE', 'PIANOS');

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "KEYS", which the stem map lists.',
        'The template has no group or single track named "GUIDE", which the stem map lists.',
        'The stem map has no entry for the template\'s group "PIANOS".',
        'The template has a group and a single track named "PIANOS".',
      ],
    });
  });

  it('stops on two template groups with one name, naming it', async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'A GTRS', 'E GTRS');

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "A GTRS", which the stem map lists.',
        'The template has more than one group named "E GTRS".',
      ],
    });
  });

  // With MT CLICK left out of the map, nothing else stops the build, and the second GUIDE would stay empty.
  it('stops on two template single tracks with one name, naming it', async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'MT CLICK', 'GUIDE');
    const { 'MT CLICK': click = [], ...stemMap } = await readStemMap();

    const result = await stoppedBuild(workspace, [GOODNESS], { ...stemMap, OTHER: [...(stemMap.OTHER ?? []), ...click] });

    expect(result).toEqual({ ok: false, problems: ['The template has more than one single track named "GUIDE".'] });
  });

  it('names a name three template groups share once', async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'A GTRS', 'E GTRS');
    await renameTemplateTrack(workspace, 'KEYS', 'E GTRS');

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "A GTRS", which the stem map lists.',
        'The template has no group or single track named "KEYS", which the stem map lists.',
        'The template has more than one group named "E GTRS".',
      ],
    });
  });

  // The template's groups become DRUMS, BASS, A GTRS, BASS, DRUMS, VOX, OTHER: BASS repeats first, DRUMS comes first.
  it('names the names template groups share in template track order', async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'E GTRS', 'BASS');
    await renameTemplateTrack(workspace, 'KEYS', 'DRUMS');

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "E GTRS", which the stem map lists.',
        'The template has no group or single track named "KEYS", which the stem map lists.',
        'The template has more than one group named "DRUMS".',
        'The template has more than one group named "BASS".',
      ],
    });
  });

  // Two groups and the GUIDE single track all named E GTRS: both of the name's problems start at its first group, and
  // the name repeated within one kind comes before the name shared across kinds.
  it('names a name two groups and a single track share once for each problem, the groups first', async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'A GTRS', 'E GTRS');
    await renameTemplateTrack(workspace, 'GUIDE', 'E GTRS');

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "A GTRS", which the stem map lists.',
        'The template has no group or single track named "GUIDE", which the stem map lists.',
        'The template has more than one group named "E GTRS".',
        'The template has a group and a single track named "E GTRS".',
      ],
    });
  });

  it('stops on a stem the map lists under two targets, naming the stem and both targets', async () => {
    const workspace = await createWorkspace();
    // AG sits under A GTRS, and Goodness of God has an AG stem.
    const stemMap = addedStems(await readStemMap(), 'KEYS', 'AG');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({ ok: false, problems: ['The stem map lists the stem "AG" under A GTRS and KEYS.'] });
  });

  it('names a stem the map lists under three targets once, with every target', async () => {
    const workspace = await createWorkspace();
    const stemMap = addedStems(addedStems(await readStemMap(), 'KEYS', 'AG'), 'VOX', 'AG');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({ ok: false, problems: ['The stem map lists the stem "AG" under A GTRS, KEYS and VOX.'] });
  });

  it('stops on a stem under two targets that no song in the build has', async () => {
    const workspace = await createWorkspace();
    // No song in the build has an Alto stem or a Mellotron.
    const stemMap = addedStems(addedStems(await readStemMap(), 'OTHER', 'Alto', 'Mellotron'), 'KEYS', 'Mellotron');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: ['The stem map lists the stem "Mellotron" under KEYS and OTHER.', 'The stem map lists the stem "Alto" under VOX and OTHER.'],
    });
  });

  it('builds with a stem the map lists twice under one target', async () => {
    const workspace = await createWorkspace();

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: addedStems(await readStemMap(), 'A GTRS', 'AG'),
      songs: [GOODNESS],
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    expect(result).toMatchObject({ ok: true, setPath: setPath(workspace) });
  });

  it('names a target that lists a stem twice once', async () => {
    const workspace = await createWorkspace();
    const stemMap = addedStems(addedStems(await readStemMap(), 'A GTRS', 'AG'), 'KEYS', 'AG');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({ ok: false, problems: ['The stem map lists the stem "AG" under A GTRS and KEYS.'] });
  });

  it('names the stems under more than one target in the order the map first lists them', async () => {
    const workspace = await createWorkspace();
    // OTHER lists Bells before AG, but the map lists AG, under A GTRS, before Bells, under KEYS.
    const stemMap = addedStems(await readStemMap(), 'OTHER', 'Bells', 'AG');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: ['The stem map lists the stem "AG" under A GTRS and OTHER.', 'The stem map lists the stem "Bells" under KEYS and OTHER.'],
    });
  });

  it('stops on stems under two targets with no track count for the target listed last', async () => {
    const workspace = await createWorkspace();
    // AG, EG 1, EG 2 and EG 4 stay under A GTRS and E GTRS and are also listed under VOX, which has 4 slots.
    const stemMap = addedStems(await readStemMap(), 'VOX', 'AG', 'EG 1', 'EG 2', 'EG 4');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The stem map lists the stem "AG" under A GTRS and VOX.',
        'The stem map lists the stem "EG 1" under E GTRS and VOX.',
        'The stem map lists the stem "EG 2" under E GTRS and VOX.',
        'The stem map lists the stem "EG 4" under E GTRS and VOX.',
      ],
    });
  });

  it('lists a stem under more than one target after the template problems and before every song problem', async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'KEYS', 'PIANOS');
    const stemMap = addedStems(withoutStems(await readStemMap(), 'Mandolin'), 'E GTRS', 'AG');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "KEYS", which the stem map lists.',
        'The stem map has no entry for the template\'s group "PIANOS".',
        'The stem map lists the stem "AG" under A GTRS and E GTRS.',
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Mandolin".',
      ],
    });
  });

  // Every build test reads the committed map, so a stem pasted under a second target there would stop them all.
  it('commits a stem map that lists each stem once', async () => {
    const stems = Object.values(await readStemMap()).flat();

    expect(stems.filter((stem, index) => stems.indexOf(stem) !== index)).toEqual([]);
  });

  it('stops on stems the map does not contain, naming every one in every song, not only the first', async () => {
    const workspace = await createWorkspace();
    const stemMap = withoutStems(await readStemMap(), 'Mandolin', 'Synth Pad');

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Mandolin".',
        'Trust In God-CAN YOU IMAGINE--A-74.00bpm: the stem map has no group for the stem "Synth Pad".',
      ],
    });
  });

  it('stops on a song with more stems for a group than the template has slots, naming the group and the count it needs', async () => {
    const workspace = await createWorkspace();
    // VOX has 4 slots; Goodness of God's Oohs joins its AG and three electric guitars there.
    const stemMap = movedStems(await readStemMap(), 'VOX', 'AG', 'EG 1', 'EG 2', 'EG 4');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: ['Goodness of God-Victory-A-63.00bpm: VOX needs 5 tracks for this song, and the template has 4.'],
    });
  });

  it('stops on a song with more stems for a single track than its one track', async () => {
    const workspace = await createWorkspace();
    const stemMap = movedStems(await readStemMap(), 'GUIDE', 'Drums');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: ['Goodness of God-Victory-A-63.00bpm: GUIDE needs 2 tracks for this song, and the template has 1.'],
    });
  });

  // Each row is a change Live would save into one Goodness of God track, made as a text edit on that track.
  it.each([
    {
      content: 'a frozen stem',
      track: 'EG 1',
      edit: (text: string) => text.replace('<Freeze Value="false" />', '<Freeze Value="true" />'),
      problem: 'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" is frozen, which the builder does not handle.',
    },
    {
      content: 'devices on a stem',
      track: 'EG 1',
      edit: (text: string) => text.replace('<Devices />', '<Devices><AudioEffectGroupDevice Id="0" /></Devices>'),
      problem: 'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" has devices, which the builder does not handle.',
    },
    {
      content: 'automation on a stem track',
      track: 'EG 1',
      edit: (text: string) =>
        text.replace('<AutomationEnvelopes>\n\t\t\t\t\t<Envelopes />', `<AutomationEnvelopes>\n\t\t\t\t\t<Envelopes>${envelope('AutomationEnvelope', text)}</Envelopes>`),
      problem: 'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" has automation, which the builder does not handle.',
    },
    {
      content: 'take-lane clips',
      track: 'EG 1',
      // A copy of the track's own arrangement clip.
      edit: (text: string) => withTakeLane(text, `<Events>${matched(/<AudioClip [\s\S]*?<\/AudioClip>/, text)}</Events>`),
      problem: 'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" has clips on a take lane, which the builder does not handle.',
    },
    {
      content: 'a warped clip',
      track: 'EG 1',
      edit: (text: string) => text.replace('<IsWarped Value="false" />', '<IsWarped Value="true" />'),
      problem: 'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" has a warped clip, which the builder does not handle.',
    },
    {
      content: 'clip envelopes',
      track: 'EG 1',
      // The clip's own <Envelopes>, not the track's, which sits inside <AutomationEnvelopes>.
      edit: (text: string) => text.replace(/(<Envelopes>\n\t*)<Envelopes \/>/, `$1<Envelopes>${envelope('ClipEnvelope', text)}</Envelopes>`),
      problem: 'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" has a clip with clip envelopes, which the builder does not handle.',
    },
    {
      content: 'a MIDI track',
      track: 'Oohs',
      edit: (text: string) => text.replace('<AudioTrack ', '<MidiTrack ').replace('</AudioTrack>', '</MidiTrack>'),
      problem: 'Goodness of God-Victory-A-63.00bpm: "Oohs" is a MIDI track, which the builder does not handle.',
    },
    {
      content: 'a group track',
      track: 'Oohs',
      edit: (text: string) => text.replace('<AudioTrack ', '<GroupTrack ').replace('</AudioTrack>', '</GroupTrack>'),
      problem: 'Goodness of God-Victory-A-63.00bpm: "Oohs" is a group track, which the builder does not handle.',
    },
  ])('stops on $content, naming the song and the reason', async ({ track, edit, problem }) => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, track, edit);

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({ ok: false, problems: [problem] });
  });

  // Live 12 writes a take lane that holds no clip, as the Live 12 demo set does.
  it('builds a song whose stem has an empty take lane', async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'EG 1', (text) => withTakeLane(text, '<Events />'));

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: [GOODNESS],
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    expect(result).toMatchObject({ ok: true, setPath: setPath(workspace) });
  });

  // Two of the stem's MainSequencer session slots each hold a copy of its own arrangement clip. The inner
  // <ClipSlot>'s <Value />, not the earlier ones in LastPresetRef and SourceContext; the MainSequencer's
  // ClipSlotList comes before the FreezeSequencer's, so the first two matches are its slots 0 and 1.
  it("stops on a stem with session-view clips once, however many slots hold one, with another song's problems", async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'EG 1', (text) => {
      const clip = matched(/<AudioClip [\s\S]*?<\/AudioClip>/, text);
      const fillSlot = (track: string) => track.replace(/(<ClipSlot>\n\t*)<Value \/>/, `$1<Value>${clip}</Value>`);
      return fillSlot(fillSlot(text));
    });
    const stemMap = withoutStems(await readStemMap(), 'Synth Pad');

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" has session-view clips, which the builder does not handle.',
        'Trust In God-CAN YOU IMAGINE--A-74.00bpm: the stem map has no group for the stem "Synth Pad".',
      ],
    });
  });

  it("lists a song's problems in order: a stem's content reasons in turn, then unmapped stems, then too-full targets", async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'EG 1', (text) =>
      text.replace('<Freeze Value="false" />', '<Freeze Value="true" />').replace('<IsWarped Value="false" />', '<IsWarped Value="true" />'),
    );
    const stemMap = withoutStems(movedStems(await readStemMap(), 'VOX', 'AG', 'EG 1', 'EG 2', 'EG 4'), 'Mandolin');

    const result = await stoppedBuild(workspace, [GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" is frozen, which the builder does not handle.',
        'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" has a warped clip, which the builder does not handle.',
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Mandolin".',
        'Goodness of God-Victory-A-63.00bpm: VOX needs 5 tracks for this song, and the template has 4.',
      ],
    });
  });

  it("reports every problem in one pass: the template's first, then each song's in service order", async () => {
    const workspace = await createWorkspace();
    await renameTemplateTrack(workspace, 'KEYS', 'PIANOS');
    await editSongTrack(workspace, GOODNESS, 'EG 1', (text) => text.replace('<Freeze Value="false" />', '<Freeze Value="true" />'));
    await addLive8Song(workspace);
    const stemMap = withoutStems(await readStemMap(), 'Mandolin');

    const result = await stoppedBuild(workspace, [LIVE_8_SONG, GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'The template has no group or single track named "KEYS", which the stem map lists.',
        'The stem map has no entry for the template\'s group "PIANOS".',
        'There Is Freedom-Where the Glory Is-A-76.00bpm: saved by Ableton Live 8.4.2, not Live 12. Open the song in Live 12 and save it, then build again.',
        'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" is frozen, which the builder does not handle.',
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Mandolin".',
      ],
    });
  });

  it('reports the problems of a song named twice in the service once', async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'EG 1', (text) => text.replace('<Freeze Value="false" />', '<Freeze Value="true" />'));
    const stemMap = withoutStems(await readStemMap(), 'Mandolin');

    const result = await stoppedBuild(workspace, [GOODNESS, GRACE, GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" is frozen, which the builder does not handle.',
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Mandolin".',
      ],
    });
  });

  it("stops on a song with no locators, with the other songs' problems", async () => {
    const workspace = await createWorkspace();
    await removeLocators(workspace, GRACE);
    const stemMap = withoutStems(await readStemMap(), 'Mandolin');

    const result = await stoppedBuild(workspace, [GRACE, GOODNESS], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'This Is Amazing Grace-The Ascension-D-98.00bpm: the song has no locators, which the builder does not handle.',
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Mandolin".',
      ],
    });
  });

  it("reports a song it cannot read with the other songs' problems", async () => {
    const workspace = await createWorkspace();
    await writeFile(join(workspace.library, GOODNESS, 'MultiTrack.als'), 'Not a gzipped Live set');
    const stemMap = withoutStems(await readStemMap(), 'Synth Pad');

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], stemMap);

    expect(result).toEqual({
      ok: false,
      problems: [
        'Goodness of God-Victory-A-63.00bpm: the song could not be read: incorrect header check',
        'Trust In God-CAN YOU IMAGINE--A-74.00bpm: the stem map has no group for the stem "Synth Pad".',
      ],
    });
  });

  // The output root's disk, APFS as macOS formats it, tells two names apart by neither letter case nor Unicode
  // normalization, so the two titles would share one Songs/<title>/ folder.
  it.each([
    { differ: 'in letter case', first: 'Goodness of God-Live-A-63.00bpm', other: 'goodness of God-Live-B-70.00bpm' },
    { differ: 'in Unicode normalization', first: 'Café-Live-A-63.00bpm'.normalize('NFC'), other: 'Café-Live-B-70.00bpm'.normalize('NFD') },
  ])('stops on two song folders whose titles differ only $differ, naming each file both would copy', async ({ first, other }) => {
    const workspace = await createWorkspace();
    await copySongAs(workspace, GOODNESS, first);
    await copySongAs(workspace, GOODNESS, other);

    const result = await stoppedBuild(workspace, [first, other]);

    expect(result).toEqual({ ok: false, problems: sharedTitleProblems(first, other) });
  });

  it('names each file two song folders with one title would copy once, however often the service names them', async () => {
    const workspace = await createWorkspace();
    const otherGoodness = 'Goodness of God-Live-B-70.00bpm';
    await copySongAs(workspace, GOODNESS, otherGoodness);

    const result = await stoppedBuild(workspace, [GOODNESS, otherGoodness, otherGoodness]);

    expect(result).toEqual({ ok: false, problems: sharedTitleProblems(GOODNESS, otherGoodness) });
  });

  it("stops on a clip whose file is outside its song folder, beside the song's other problems, and writes nothing", async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'EG 1', (text) => text.replace('<RelativePathType Value="3" />', '<RelativePathType Value="1" />'));

    const result = await stoppedBuild(workspace, [GOODNESS], withoutStems(await readStemMap(), 'Mandolin'));

    expect(result).toEqual({
      ok: false,
      problems: [
        'Goodness of God-Victory-A-63.00bpm: the stem "EG 1" refers to a file outside the song\'s folder, which the builder does not handle.',
        'Goodness of God-Victory-A-63.00bpm: the stem map has no group for the stem "Mandolin".',
      ],
    });
  });

  // Live 12 stores a WAV in a folder beside the song's as relative path type 3 with a path that climbs out.
  it.each([
    { sibling: 'holds the WAV', keep: true },
    { sibling: 'does not hold the WAV', keep: false },
  ])("stops on a clip whose path climbs out of its song folder as outside the folder when the sibling folder $sibling, and writes nothing", async ({ keep }) => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'EG 1', (text) =>
      text.replace('<RelativePath Value="MultiTracks/EG 1.wav" />', '<RelativePath Value="../Shared Stems/EG 1.wav" />'),
    );
    await mkdir(join(workspace.library, 'Shared Stems'));
    if (keep) await rename(libraryFile(workspace, GOODNESS, 'EG 1.wav'), join(workspace.library, 'Shared Stems', 'EG 1.wav'));
    else await rm(libraryFile(workspace, GOODNESS, 'EG 1.wav'));

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [`${GOODNESS}: the stem "EG 1" refers to a file outside the song's folder, which the builder does not handle.`],
    });
  });

  // A half-synced song folder, with a stem deleted or renamed, as an interrupted download leaves one.
  it("stops on a WAV a clip refers to that the song folder does not hold, beside another song's problem, and writes nothing", async () => {
    const workspace = await createWorkspace();
    await rm(libraryFile(workspace, GOODNESS, 'AG 3.wav'));

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], withoutStems(await readStemMap(), 'Synth Pad'));

    expect(result).toEqual({
      ok: false,
      problems: [
        'Goodness of God-Victory-A-63.00bpm: MultiTracks/AG 3.wav is missing from the song folder.',
        'Trust In God-CAN YOU IMAGINE--A-74.00bpm: the stem map has no group for the stem "Synth Pad".',
      ],
    });
  });

  it('names each missing WAV once, however many clips refer to it, in track order', async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'AG 3', (text) => {
      const clip = matched(/<AudioClip [\s\S]*?<\/AudioClip>/, text);
      return text.replace(clip, `${clip}${clip}`);
    });
    await rm(libraryFile(workspace, GOODNESS, 'AG 3.wav'));
    await rm(libraryFile(workspace, GOODNESS, 'Bass.wav'));

    const result = await stoppedBuild(workspace, [GOODNESS]);

    expect(result).toEqual({
      ok: false,
      problems: [
        'Goodness of God-Victory-A-63.00bpm: MultiTracks/Bass.wav is missing from the song folder.',
        'Goodness of God-Victory-A-63.00bpm: MultiTracks/AG 3.wav is missing from the song folder.',
      ],
    });
  });

  it('leaves no output root behind when there was none before the build', async () => {
    const workspace = await createWorkspace();
    await addLive8Song(workspace);

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: [LIVE_8_SONG, GOODNESS],
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    expect(result.ok).toBe(false);
    expect(await snapshotFolder(workspace.outputRoot)).toBeUndefined();
  });
});

describe('stopping an overlap before writing', () => {
  it('stops on an overlap from a song with no locator named Ending, naming the song', async () => {
    const workspace = await createWorkspace();
    await removeLocator(workspace, GRACE, 'Ending');

    const result = await stoppedBuild(workspace, [GRACE, GREAT_ARE], undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: ["This Is Amazing Grace-The Ascension-D-98.00bpm: the song has no locator named Ending, where an overlap starts the next song's Count Off."],
    });
  });

  // This Is Amazing Grace is 4/4 throughout, so its bar lines fall on every fourth beat: its Ending on 248 is one.
  // 248.00005 is not, though it is less than the tolerance an audio end gets past 248: an Ending is a locator Live places
  // on the grid, so it is walked exactly, and the next song's start bar counts the bars to it.
  it.each([249, 248.5, 248.00005])('stops on an overlap from a song whose Ending, moved to %s, is not on a bar line, naming the song and the beat', async (beat) => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', beat);

    const result = await stoppedBuild(workspace, [GRACE, GREAT_ARE], undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [`${GRACE}: the song's Ending, on beat ${beat}, is not on a bar line, where an overlap starts the next song's Count Off.`],
    });
  });

  // Goodness of God is 4/4 with a bar of 2/4 at 104 and 202, so from 106 to 202 its bar lines fall on 2 more than a
  // multiple of 4. Its own Ending, 300, is a bar line 76 bars from beat 0, past both 2/4 bars, so the next song starts on
  // bar 77, not the 76 that 300 / 4 would give; 200 is no bar line. A check that took the Ending modulo 4 would pass 200
  // (200 % 4 is 0).
  it('builds an overlap from a song whose Ending is on a bar line its meter changes reach, and counts the bars to it', async () => {
    const workspace = await createWorkspace();

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: [GOODNESS, GRACE],
      transitions: { 1: OVERLAP },
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    if (!result.ok) throw new Error(`The build stopped: ${result.problems.join('\n')}`);
    expect(result.songs[1]?.startBar).toBe(77);
  });

  it('stops on an overlap from a song whose Ending is on a multiple of its starting bar length but off the bar lines its meter changes reach', async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GOODNESS, 'Ending', 200);

    const result = await stoppedBuild(workspace, [GOODNESS, GRACE], undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [`${GOODNESS}: the song's Ending, on beat 200, is not on a bar line, where an overlap starts the next song's Count Off.`],
    });
  });

  it("reports an Ending off a bar line after another song's unmapped stem, in one pass", async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', 248.5);
    const stemMap = withoutStems(await readStemMap(), 'Bells');

    const result = await stoppedBuild(workspace, [GRACE, GREAT_ARE], stemMap, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [
        `${GREAT_ARE}: the stem map has no group for the stem "Bells".`,
        `${GRACE}: the song's Ending, on beat 248.5, is not on a bar line, where an overlap starts the next song's Count Off.`,
      ],
    });
  });

  it('names an Ending off a bar line once, however many overlaps start from it', async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', 248.5);

    const result = await stoppedBuild(workspace, [GRACE, GREAT_ARE, GRACE, GREAT_ARE], undefined, { 1: OVERLAP, 3: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [`${GRACE}: the song's Ending, on beat 248.5, is not on a bar line, where an overlap starts the next song's Count Off.`],
    });
  });

  // The bar lines are walked through the song's meter, from the one it starts on, so a song with none is left unchecked
  // rather than thrown on, which would hide every other problem.
  it('leaves the Ending unchecked, and does not throw, when the song has no starting time signature, beside the other problems', async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', 248.5);
    await moveStartingMainTrackEvent(workspace, GRACE, 'EnumEvent');
    const stemMap = withoutStems(await readStemMap(), 'Bells');

    const result = await stoppedBuild(workspace, [GRACE, GREAT_ARE], stemMap, { 1: OVERLAP });

    expect(result).toEqual({ ok: false, problems: [`${GREAT_ARE}: the stem map has no group for the stem "Bells".`] });
  });

  // VOX has 4 slots. Goodness of God's one VOX stem, Oohs, rings on past its Ending, and Trust In God brings four.
  it('stops on an overlap that needs more tracks in a group than the template has, naming the songs, the group and the counts', async () => {
    const workspace = await createWorkspace();

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [
        "Goodness of God-Victory-A-63.00bpm into Trust In God-CAN YOU IMAGINE--A-74.00bpm: the overlap needs 5 VOX tracks, 1 for the first song's ring and 4 for the second song, and the template has 4.",
      ],
    });
  });

  // Goodness of God's Oohs clip edited to end on 290, before its Ending on 300: it does not ring, so its track is free
  // again when Trust In God starts, and Trust In God's four VOX stems fit the template's 4 VOX tracks.
  it("counts only the first song's stems that ring past its Ending, so a pair that fits builds", async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'Oohs', (text) => text.replace('<CurrentEnd Value="320.0000476190476" />', '<CurrentEnd Value="290" />'));

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: [GOODNESS, TRUST],
      transitions: { 1: OVERLAP },
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    if (!result.ok) throw new Error(`The build stopped: ${result.problems.join('\n')}`);
    const vox = slots(await readSet(result.setPath), 'VOX');
    const placed = (track: XmlElement) =>
      arrangementClips(track).map((clip) => ({ stem: stemOf(clip), start: Number(value(clip, 'CurrentStart')), end: Number(value(clip, 'CurrentEnd')) }));
    expect(vox.map((track) => placed(track).map(({ stem, start }) => `${start} ${stem}`))).toEqual([
      ['0 Oohs', '300 BGVS 1'],
      ['300 Tenor'],
      ['300 Choir'],
      ['300 Choir 2'],
    ]);
    // Oohs ends on 290, before BGVS 1 starts on 300, so the two never sound at once on VOX 1.
    const [first] = vox;
    if (!first) throw new Error('The template has no VOX track');
    expect(placed(first)[0]).toEqual({ stem: 'Oohs', start: 0, end: 290 });
  });

  // Goodness of God's Oohs clip edited to end on 300, exactly its Ending: it rings for no time past the Ending, so its
  // track is free again when Trust In God starts there, as with the clip that ends on 290 above.
  it("counts a stem that ends exactly on the first song's Ending as not ringing, so a pair that fits builds", async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'Oohs', (text) => text.replace('<CurrentEnd Value="320.0000476190476" />', '<CurrentEnd Value="300" />'));

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: [GOODNESS, TRUST],
      transitions: { 1: OVERLAP },
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    if (!result.ok) throw new Error(`The build stopped: ${result.problems.join('\n')}`);
    const vox = slots(await readSet(result.setPath), 'VOX');
    const placed = (track: XmlElement) =>
      arrangementClips(track).map((clip) => ({ stem: stemOf(clip), start: Number(value(clip, 'CurrentStart')), end: Number(value(clip, 'CurrentEnd')) }));
    expect(vox.map((track) => placed(track).map(({ stem, start }) => `${start} ${stem}`))).toEqual([
      ['0 Oohs', '300 BGVS 1'],
      ['300 Tenor'],
      ['300 Choir'],
      ['300 Choir 2'],
    ]);
    const [first] = vox;
    if (!first) throw new Error('The template has no VOX track');
    expect(placed(first)[0]).toEqual({ stem: 'Oohs', start: 0, end: 300 });
  });

  // The same Oohs clip ending on 300, with Trust In God's Count Off removed so it has no Intro: the ring's end is then
  // unknown, and a clip that ends exactly on the Ending still does not ring, so only the Count Off problem stops the build.
  it("counts a stem that ends exactly on the first song's Ending as not ringing into a song with no Count Off", async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'Oohs', (text) => text.replace('<CurrentEnd Value="320.0000476190476" />', '<CurrentEnd Value="300" />'));
    await removeLocator(workspace, TRUST, 'Count Off');

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [`${TRUST}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`],
    });
  });

  // A song position whose name matches no song folder has no song to read, so an overlap beside it is left unchecked
  // rather than thrown on, which would hide the match problem.
  it.each([
    { side: 'before', songs: ['no such song', GRACE] },
    { side: 'after', songs: [GRACE, 'no such song'] },
  ])('stops on a name that matches no song $side an overlap with only its match problem, and does not throw', async ({ songs }) => {
    const workspace = await createWorkspace();

    const result = await stoppedBuild(workspace, songs, undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [`"no such song" matches no song folder in ${workspace.library}. The song folders are:\n  ${GOODNESS}\n  ${GREAT_ARE}\n  ${GRACE}\n  ${TRUST}`],
    });
  });

  // With Oohs ending on 290 the pair fits, as the test above shows. Both songs have a Tambourine 1 stem, a DRUMS stem,
  // and Goodness of God's rings past its Ending.
  it('stops on a stem under two targets with no overlap track count for the target listed last', async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'Oohs', (text) => text.replace('<CurrentEnd Value="320.0000476190476" />', '<CurrentEnd Value="290" />'));
    const stemMap = addedStems(await readStemMap(), 'VOX', 'Tambourine 1');

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], stemMap, { 1: OVERLAP });

    expect(result).toEqual({ ok: false, problems: ['The stem map lists the stem "Tambourine 1" under DRUMS and VOX.'] });
  });

  it('stops on an overlap with a stem moved to a group with too few tracks, naming the count the overlap needs', async () => {
    const workspace = await createWorkspace();
    await editSongTrack(workspace, GOODNESS, 'Oohs', (text) => text.replace('<CurrentEnd Value="320.0000476190476" />', '<CurrentEnd Value="290" />'));
    const stemMap = movedStems(await readStemMap(), 'VOX', 'Tambourine 1');

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], stemMap, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [
        'Trust In God-CAN YOU IMAGINE--A-74.00bpm: VOX needs 5 tracks for this song, and the template has 4.',
        "Goodness of God-Victory-A-63.00bpm into Trust In God-CAN YOU IMAGINE--A-74.00bpm: the overlap needs 6 VOX tracks, 1 for the first song's ring and 5 for the second song, and the template has 4.",
      ],
    });
  });

  const moveOohsTo = (workspace: Workspace, start: number) =>
    editSongTrack(workspace, GOODNESS, 'Oohs', (text) =>
      text.replace('<AudioClip Id="0" Time="0">', `<AudioClip Id="0" Time="${start}">`).replace('<CurrentStart Value="0" />', `<CurrentStart Value="${start}" />`),
    );

  it("does not count a stem whose clip would start ringing at or after the next song's silence point, which the overlap drops, so the pair builds", async () => {
    const workspace = await createWorkspace();
    await moveOohsTo(workspace, 316);

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: [GOODNESS, TRUST],
      transitions: { 1: OVERLAP },
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    if (!result.ok) throw new Error(`The build stopped: ${result.problems.join('\n')}`);
    const vox = slots(await readSet(result.setPath), 'VOX');
    expect(vox.map((track) => arrangementClips(track).map((clip) => `${value(clip, 'CurrentStart')} ${stemOf(clip)}`))).toEqual([
      ['300 BGVS 1'],
      ['300 Tenor'],
      ['300 Choir'],
      ['300 Choir 2'],
    ]);
  });

  it("counts a stem whose clip starts after the Ending but rings before the next song's silence point", async () => {
    const workspace = await createWorkspace();
    await moveOohsTo(workspace, 302);

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [
        "Goodness of God-Victory-A-63.00bpm into Trust In God-CAN YOU IMAGINE--A-74.00bpm: the overlap needs 5 VOX tracks, 1 for the first song's ring and 4 for the second song, and the template has 4.",
      ],
    });
  });

  it.each(['FloatEvent', 'EnumEvent'] as const)(
    'counts every stem that rings past the Ending, and does not throw, when the next song has no starting %s',
    async (kind) => {
      const workspace = await createWorkspace();
      await moveOohsTo(workspace, 316);
      await moveStartingMainTrackEvent(workspace, TRUST, kind);

      const result = await stoppedBuild(workspace, [GOODNESS, TRUST], undefined, { 1: OVERLAP });

      expect(result).toEqual({
        ok: false,
        problems: [
          "Goodness of God-Victory-A-63.00bpm into Trust In God-CAN YOU IMAGINE--A-74.00bpm: the overlap needs 5 VOX tracks, 1 for the first song's ring and 4 for the second song, and the template has 4.",
        ],
      });
    },
  );

  it('counts every stem that rings past the Ending when the next song has no section after its Count Off, beside that problem', async () => {
    const workspace = await createWorkspace();
    await moveOohsTo(workspace, 316);
    await removeLocator(workspace, TRUST, 'Count Off');

    const result = await stoppedBuild(workspace, [GOODNESS, TRUST], undefined, { 1: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [
        "Goodness of God-Victory-A-63.00bpm into Trust In God-CAN YOU IMAGINE--A-74.00bpm: the overlap needs 5 VOX tracks, 1 for the first song's ring and 4 for the second song, and the template has 4.",
        `${TRUST}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`,
      ],
    });
  });

  // This Is Amazing Grace into Goodness of God has no Ending to count from, so the pair gives no track problem.
  it("reports an overlap's problems after every song's, in service order of the overlaps, in one pass", async () => {
    const workspace = await createWorkspace();
    await removeLocator(workspace, GRACE, 'Ending');
    const stemMap = withoutStems(await readStemMap(), 'Bells');

    const result = await stoppedBuild(workspace, [GREAT_ARE, GRACE, GOODNESS, TRUST], stemMap, { 2: OVERLAP, 3: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [
        'Great Are You Lord-All Sons & Daughters Live-D-72.00bpm: the stem map has no group for the stem "Bells".',
        "This Is Amazing Grace-The Ascension-D-98.00bpm: the song has no locator named Ending, where an overlap starts the next song's Count Off.",
        "Goodness of God-Victory-A-63.00bpm into Trust In God-CAN YOU IMAGINE--A-74.00bpm: the overlap needs 5 VOX tracks, 1 for the first song's ring and 4 for the second song, and the template has 4.",
      ],
    });
  });

  // This Is Amazing Grace's Intro is on 8 and its silence point on 16, 2 bars of 4/4 later, where Goodness of God's ring
  // is cut. With its Ending moved before 16, the second Goodness of God starts while the first one's AG, AG 3 and
  // Mandolin still ring: with Grace's AG they need 7 of the template's 6 A GTRS tracks.
  const CHAIN_PROBLEM =
    "Goodness of God-Victory-A-63.00bpm into This Is Amazing Grace-The Ascension-D-98.00bpm into Goodness of God-Victory-A-63.00bpm: the overlaps need 7 A GTRS tracks, 3 for the first song's ring, 1 for the second song's ring and 3 for the third song, and the template has 6.";

  // 9, 10 and 14 are off This Is Amazing Grace's 4/4 bar lines, which another overlap rule may also name, so those rows
  // ask only for the chain problem among the problems; 12 is on a bar line, and its row asks for the whole list.
  it.each([
    { ending: 9, problems: expect.arrayContaining([CHAIN_PROBLEM]) },
    { ending: 10, problems: expect.arrayContaining([CHAIN_PROBLEM]) },
    { ending: 12, problems: [CHAIN_PROBLEM] },
    { ending: 14, problems: expect.arrayContaining([CHAIN_PROBLEM]) },
  ])(
    "stops on two overlaps through a song whose Ending on $ending comes before its silence point, counting the first song's ring at the third song",
    async ({ ending, problems }) => {
      const workspace = await createWorkspace();
      await moveLocator(workspace, GRACE, 'Ending', ending);

      const result = await stoppedBuild(workspace, [GOODNESS, GRACE, GOODNESS], undefined, { 1: OVERLAP, 2: OVERLAP });

      expect(result).toEqual({ ok: false, problems });
    },
  );

  // With This Is Amazing Grace's Ending on 16, its silence point, the first Goodness of God's ring is cut on 316, where the
  // second one starts, so it holds no track there: the second one takes A GTRS 1 to 3 back from 316, beside Grace's AG.
  it("builds two overlaps through a song whose Ending is on its silence point, where the first song's ring ends", async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', 16);

    const result = await buildSet({
      library: workspace.library,
      template: workspace.template,
      stemMap: await readStemMap(),
      songs: [GOODNESS, GRACE, GOODNESS],
      transitions: { 1: OVERLAP, 2: OVERLAP },
      date: DATE,
      outputRoot: workspace.outputRoot,
    });

    if (!result.ok) throw new Error(`The build stopped: ${result.problems.join('\n')}`);
    const aGtrs = slots(await readSet(result.setPath), 'A GTRS');
    expect(aGtrs.map((track) => arrangementClips(track).map((clip) => `${value(clip, 'CurrentStart')} ${stemOf(clip)}`))).toEqual([
      ['0 AG', '316 AG'],
      ['0 AG 3', '316 AG 3'],
      ['0 Mandolin', '316 Mandolin'],
      ['300 AG'],
      [],
      [],
    ]);
  });

  it("reports two overlaps' problem through a short song in one pass, beside another song's unmapped stem", async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', 12);
    const stemMap = withoutStems(await readStemMap(), 'Bells');

    const result = await stoppedBuild(workspace, [GREAT_ARE, GOODNESS, GRACE, GOODNESS], stemMap, { 2: OVERLAP, 3: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: ['Great Are You Lord-All Sons & Daughters Live-D-72.00bpm: the stem map has no group for the stem "Bells".', CHAIN_PROBLEM],
    });
  });

  // Goodness of God, This Is Amazing Grace, Goodness of God gives the problem at the third song and again at the fifth,
  // which the second Goodness of God's ring and the second Grace start; the fourth song fits, 3 for the third song's ring
  // and 1 for its own of the 6 A GTRS tracks.
  it('names the problem of two overlaps through a short song once, however many songs give it', async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', 12);

    const result = await stoppedBuild(workspace, [GOODNESS, GRACE, GOODNESS, GRACE, GOODNESS], undefined, { 1: OVERLAP, 2: OVERLAP, 3: OVERLAP, 4: OVERLAP });

    expect(result).toEqual({ ok: false, problems: [CHAIN_PROBLEM] });
  });

  // With its Count Off gone, This Is Amazing Grace has no Intro, so where Goodness of God's ring is cut is unknown: it
  // holds no track where the second Goodness of God starts, which leaves Grace's AG and that song's 3 of the 6.
  it("does not count a ring whose end is unknown at a later song, and does not throw, beside the missing section's problem", async () => {
    const workspace = await createWorkspace();
    await moveLocator(workspace, GRACE, 'Ending', 12);
    await removeLocator(workspace, GRACE, 'Count Off');

    const result = await stoppedBuild(workspace, [GOODNESS, GRACE, GOODNESS], undefined, { 1: OVERLAP, 2: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: [`${GRACE}: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`],
    });
  });

  it('names an overlap problem once, however many overlaps give it', async () => {
    const workspace = await createWorkspace();
    await removeLocator(workspace, GRACE, 'Ending');

    const result = await stoppedBuild(workspace, [GRACE, GREAT_ARE, GRACE, GREAT_ARE], undefined, { 1: OVERLAP, 3: OVERLAP });

    expect(result).toEqual({
      ok: false,
      problems: ["This Is Amazing Grace-The Ascension-D-98.00bpm: the song has no locator named Ending, where an overlap starts the next song's Count Off."],
    });
  });
});
