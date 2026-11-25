// Writes the set builder's song fixtures, test/fixtures/set-builder/library/<song>/MultiTrack.als and the Live 8 song in
// test/fixtures/set-builder/live-8/, as made-up Live sets built from the fixture template. They replace the MultiTracks
// sessions the fixtures once were (setlist-controller#604): every locator, tempo change, meter change, stem, clip length
// and warp marker below is made up, and no path names a home folder. Two values are kept: a song starts at the BPM its
// folder name gives, since the build's summary prints the two side by side, and in the meter the Planning Center
// fixtures plan it in, which the plan warnings compare. The folder names, a song's title, artist, key and BPM as
// MultiTracks names a folder, are the real ones. Goodness of God's and Trust In God's audio end a few samples past a
// bar line, as MultiTracks' sessions did, so the build's bar-line tolerance (src/set-builder/timeline.ts) is exercised.
//
//   node scripts/make-song-fixtures.mjs
//
// Each song is the template with its groups and audio tracks taken out and one audio track per stem put in, a copy of
// the template's GUIDE track, renamed, outside every group and holding one unwarped clip from beat 0. The main track
// holds the song's tempo and time-signature events, and the locator list its sections. A run gives the same bytes
// every time.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parseAls, serializeAls } from '../src/set-builder/als.ts';
import { timeSignature } from '../src/set-builder/meter.ts';
import { readSong } from '../src/set-builder/song.ts';
import { secondsBetween } from '../src/set-builder/tempo.ts';

const LIBRARY = resolve(import.meta.dirname, '../test/fixtures/set-builder/library');
const LIVE_8 = resolve(import.meta.dirname, '../test/fixtures/set-builder/live-8');
const TEMPLATE = join(LIBRARY, '_template/template Project/template.als');
const SAMPLE_RATE = 44100;

// Live's time-signature value: the numerator less 1, plus 99 times the power of 2 the denominator is.
const FOUR_FOUR = 201;
const TWO_FOUR = 199;
const SIX_EIGHT = 302;

// Each song: its folder, its starting meter, its tempo events and later meter events as [beat, value] (an instant
// tempo step is two events at one beat), its locators as [beat, name] with the blank-named end marker last, the
// length of its audio in frames at 44,100 Hz, its warp markers as [seconds, beat], and its stems in track order. Trust In
// God stores its end marker first, out of time order, as Live can store a locator added last. This Is Amazing Grace gives
// each locator a computer key, and keys to jump to the next and previous locator, which a built set must not copy.
const SONGS = [
  {
    folder: 'Goodness of God-Victory-A-63.00bpm',
    meter: FOUR_FOUR,
    tempo: [[-63072000, 63], [299, 63], [299, 42], [300, 42], [300, 63]],
    meterChanges: [[104, TWO_FOUR], [106, FOUR_FOUR], [202, TWO_FOUR], [204, FOUR_FOUR]],
    locators: [
      [0, 'Count Off'], [8, 'Intro'], [40, 'Verse 1'], [72, 'Chorus'], [106, 'Verse 2'], [138, 'Chorus'], [170, 'Bridge'], [186, 'Bridge'],
      [204, 'Interlude'], [212, 'Chorus'], [244, 'Vamp'], [252, 'Chorus'], [284, 'Tag'], [300, 'Ending'], [324, ' '],
    ],
    frames: 13_461_002,
    warpMarkers: [[0, 0], [15.238095238095238, 16], [30.476190476190476, 32]],
    stems: ['Click Track', 'Guide', 'Drums', 'Tambourine 1', 'Bass', 'AG', 'AG 3', 'Mandolin', 'EG 1', 'EG 2', 'EG 4', 'Piano', 'Rhodes', 'Strings', 'Oohs'],
  },
  {
    folder: 'Trust In God-CAN YOU IMAGINE--A-74.00bpm',
    meter: SIX_EIGHT,
    endMarkerFirst: true,
    tempo: [[-63072000, 74], [301, 74], [301, 71], [304, 71], [304, 66], [306, 66], [306, 61], [308, 61], [308, 34], [309, 34], [309, 74]],
    meterChanges: [],
    locators: [
      [0, 'Count Off'], [6, 'Intro'], [18, 'Verse 1'], [42, 'Chorus'], [66, 'Verse 2'], [90, 'Chorus'], [114, 'Vamp'], [117, 'Bridge'],
      [141, 'Bridge'], [165, 'Instrumental'], [189, 'Chorus'], [213, 'Chorus'], [237, 'Verse 3'], [261, 'Instrumental'], [285, 'Chorus'],
      [309, 'Ending'], [324, ' '],
    ],
    frames: 11_441_161,
    warpMarkers: [[0, 0], [4.864864864864865, 6], [14.594594594594595, 18]],
    stems: [
      'Click Track', 'Guide', 'Drums', 'Perc', 'Tambourine 1', 'Bass', 'Synth Bass 2', 'AG Group', 'EG 1', 'EG 2', 'EG Group', 'Piano 2', 'Organ',
      'Synth Pad', 'BGVS 1', 'Tenor', 'Choir', 'Choir 2',
    ],
  },
  {
    folder: 'This Is Amazing Grace-The Ascension-D-98.00bpm',
    meter: FOUR_FOUR,
    tempo: [[-63072000, 98]],
    meterChanges: [],
    locators: [
      [0, 'Count Off'], [8, 'Intro'], [24, 'Verse 1'], [56, 'Chorus'], [88, 'Intro'], [104, 'Verse 2'], [136, 'Chorus'], [168, 'Bridge'], [184, 'Bridge'],
      [200, 'Chorus'], [232, 'Outro'], [248, 'Ending'], [264, ' '],
    ],
    locatorKeys: ['c', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'a', 's'],
    nextPreviousKeys: ['.', ','],
    frames: 6_966_000,
    warpMarkers: [[0, 0], [9.795918367346939, 16]],
    stems: ['Click Track', 'Guide', 'Drums', 'Bass', 'AG', 'EG 2', 'Keys', 'BGVS'],
  },
  {
    folder: 'Great Are You Lord-All Sons & Daughters Live-D-72.00bpm',
    meter: SIX_EIGHT,
    tempo: [[-63072000, 72]],
    meterChanges: [],
    locators: [
      [0, 'Count Off'], [6, 'Intro'], [18, 'Verse 1'], [42, 'Pre Chorus'], [54, 'Chorus'], [78, 'Interlude'], [84, 'Verse 2'], [108, 'Pre Chorus'],
      [120, 'Chorus'], [144, 'Breakdown'], [156, 'Bridge'], [180, 'Bridge'], [204, 'Chorus'], [228, 'Outro'], [240, 'Outro'], [252, 'Ending'], [261, ' '],
    ],
    frames: 9_481_500,
    warpMarkers: [[0, 0], [5, 6]],
    stems: ['Click Track', 'Guide', 'Drums (Live)', 'Perc', 'Synth Loop', 'Bass', 'AG', 'EG 1', 'EG 3', 'EG 5', 'Piano', 'Bells', 'Strings', 'Tenor', 'BGVS'],
  },
];

// The song saved by Live 8 needs only its version: the build stops on it before it reads anything else.
const LIVE_8_SONG = 'There Is Freedom-Where the Glory Is-A-76.00bpm';

const template = gunzipSync(readFileSync(TEMPLATE)).toString('utf8');

// Every Live track of the template, as its text from the line break before it, by kind.
const trackTexts = (xml, kind) => [...xml.matchAll(new RegExp(`\\n\\t\\t\\t<${kind} [\\s\\S]*?\\n\\t\\t\\t</${kind}>`, 'g'))].map((match) => match[0]);
const guide = trackTexts(template, 'AudioTrack').find((text) => text.includes('\n\t\t\t\t\t<EffectiveName Value="GUIDE" />'));
if (!guide) throw new Error('The template has no GUIDE track.');

// The beat the song's audio ends on, `seconds` in: the song's own tempo map, walked by bisection.
function beatAfter(tempo, seconds) {
  const song = { tempo: tempo.map(([time, value]) => ({ attributes: { Time: String(time), Value: String(value) } })) };
  let [low, high] = [0, 10_000];
  for (let round = 0; round < 200; round += 1) {
    const middle = (low + high) / 2;
    if (secondsBetween(song, 0, middle) < seconds) low = middle;
    else high = middle;
  }
  return high;
}

function clip(song, stem, index, end, seconds) {
  const [numerator, denominator] = timeSignature(song.meter).split('/');
  const file = `MultiTracks/${stem}.wav`;
  const tab = (depth) => '\t'.repeat(depth);
  const lines = [
    [9, '<AudioClip Id="0" Time="0">'],
    [10, '<LomId Value="0" />'],
    [10, '<LomIdView Value="0" />'],
    [10, '<CurrentStart Value="0" />'],
    [10, `<CurrentEnd Value="${end}" />`],
    [10, '<Loop>'],
    [11, '<LoopStart Value="0" />'],
    [11, `<LoopEnd Value="${seconds}" />`],
    [11, '<StartRelative Value="0" />'],
    [11, '<LoopOn Value="false" />'],
    [11, `<OutMarker Value="${seconds}" />`],
    [11, '<HiddenLoopStart Value="0" />'],
    [11, `<HiddenLoopEnd Value="${seconds}" />`],
    [10, '</Loop>'],
    [10, `<Name Value="${stem}" />`],
    [10, '<Annotation Value="" />'],
    [10, `<Color Value="${(index * 7) % 70}" />`],
    [10, '<LaunchMode Value="0" />'],
    [10, '<LaunchQuantisation Value="0" />'],
    [10, '<TimeSignature>'],
    [11, '<TimeSignatures>'],
    [12, '<RemoteableTimeSignature Id="0">'],
    [13, `<Numerator Value="${numerator}" />`],
    [13, `<Denominator Value="${denominator}" />`],
    [13, '<Time Value="0" />'],
    [12, '</RemoteableTimeSignature>'],
    [11, '</TimeSignatures>'],
    [10, '</TimeSignature>'],
    [10, '<Envelopes>'],
    [11, '<Envelopes />'],
    [10, '</Envelopes>'],
    [10, '<ScrollerTimePreserver>'],
    [11, '<LeftTime Value="0" />'],
    [11, '<RightTime Value="0" />'],
    [10, '</ScrollerTimePreserver>'],
    [10, '<TimeSelection>'],
    [11, '<AnchorTime Value="0" />'],
    [11, '<OtherTime Value="0" />'],
    [10, '</TimeSelection>'],
    [10, '<Legato Value="false" />'],
    [10, '<Ram Value="false" />'],
    [10, '<GrooveSettings>'],
    [11, '<GrooveId Value="-1" />'],
    [10, '</GrooveSettings>'],
    [10, '<Disabled Value="false" />'],
    [10, '<VelocityAmount Value="0" />'],
    [10, '<FollowAction>'],
    [11, '<FollowTime Value="1" />'],
    [11, '<IsLinked Value="false" />'],
    [11, '<LoopIterations Value="1" />'],
    [11, '<FollowActionA Value="0" />'],
    [11, '<FollowActionB Value="0" />'],
    [11, '<FollowChanceA Value="100" />'],
    [11, '<FollowChanceB Value="0" />'],
    [11, '<JumpIndexA Value="1" />'],
    [11, '<JumpIndexB Value="1" />'],
    [11, '<FollowActionEnabled Value="false" />'],
    [10, '</FollowAction>'],
    [10, '<Grid>'],
    [11, '<FixedNumerator Value="1" />'],
    [11, '<FixedDenominator Value="16" />'],
    [11, '<GridIntervalPixel Value="20" />'],
    [11, '<Ntoles Value="2" />'],
    [11, '<SnapToGrid Value="true" />'],
    [11, '<Fixed Value="false" />'],
    [10, '</Grid>'],
    [10, '<FreezeStart Value="0" />'],
    [10, '<FreezeEnd Value="0" />'],
    [10, '<IsWarped Value="false" />'],
    [10, '<TakeId Value="0" />'],
    [10, '<IsInKey Value="false" />'],
    [10, '<ScaleInformation>'],
    [11, '<Root Value="0" />'],
    [11, '<Name Value="0" />'],
    [10, '</ScaleInformation>'],
    [10, '<AutomationEnvelopesListWrapper LomId="0" />'],
    [10, '<SampleRef>'],
    [11, '<FileRef>'],
    [12, '<RelativePathType Value="3" />'],
    [12, `<RelativePath Value="${escape(file)}" />`],
    [12, `<Path Value="${escape(`/Volumes/Songs/${song.folder}/${file}`)}" />`],
    [12, '<Type Value="2" />'],
    [12, '<LivePackName Value="" />'],
    [12, '<LivePackId Value="" />'],
    [12, `<OriginalFileSize Value="${song.frames * 6 + 44}" />`],
    [12, `<OriginalCrc Value="${(index * 4099 + song.frames) % 65536}" />`],
    [12, '<SourceHint Value="" />'],
    [11, '</FileRef>'],
    [11, `<LastModDate Value="${1_700_000_000 + index * 60}" />`],
    [11, '<SourceContext />'],
    [11, '<SampleUsageHint Value="0" />'],
    [11, `<DefaultDuration Value="${song.frames}" />`],
    [11, `<DefaultSampleRate Value="${SAMPLE_RATE}" />`],
    [11, '<SamplesToAutoWarp Value="0" />'],
    [10, '</SampleRef>'],
    [10, '<Onsets>'],
    [11, '<UserOnsets />'],
    [11, '<HasUserOnsets Value="false" />'],
    [10, '</Onsets>'],
    [10, '<WarpMode Value="0" />'],
    [10, '<GranularityTones Value="30" />'],
    [10, '<GranularityTexture Value="65" />'],
    [10, '<FluctuationTexture Value="25" />'],
    [10, '<TransientResolution Value="6" />'],
    [10, '<TransientLoopMode Value="2" />'],
    [10, '<TransientEnvelope Value="100" />'],
    [10, '<ComplexProFormants Value="100" />'],
    [10, '<ComplexProEnvelope Value="128" />'],
    [10, '<Sync Value="true" />'],
    [10, '<HiQ Value="true" />'],
    [10, '<Fade Value="true" />'],
    [10, '<Fades>'],
    [11, '<FadeInLength Value="0" />'],
    [11, '<FadeOutLength Value="0" />'],
    [11, '<ClipFadesAreInitialized Value="true" />'],
    [11, '<CrossfadeInState Value="0" />'],
    [11, '<FadeInCurveSkew Value="0" />'],
    [11, '<FadeInCurveSlope Value="0" />'],
    [11, '<FadeOutCurveSkew Value="0" />'],
    [11, '<FadeOutCurveSlope Value="0" />'],
    [11, '<IsDefaultFadeIn Value="true" />'],
    [11, '<IsDefaultFadeOut Value="true" />'],
    [10, '</Fades>'],
    [10, '<PitchCoarse Value="0" />'],
    [10, '<PitchFine Value="0" />'],
    [10, '<SampleVolume Value="1" />'],
    [10, '<WarpMarkers>'],
    ...song.warpMarkers.map(([second, beat], id) => [11, `<WarpMarker Id="${id}" SecTime="${second}" BeatTime="${beat}" />`]),
    [10, '</WarpMarkers>'],
    [10, '<SavedWarpMarkersForStretched />'],
    [10, '<MarkersGenerated Value="false" />'],
    [10, '<IsSongTempoLeader Value="false" />'],
    [9, '</AudioClip>'],
  ];
  return lines.map(([depth, line]) => `\n${tab(depth)}${line}`).join('');
}

function escape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// A copy of the GUIDE track for `stem`, with a track Id and pointee Ids no other track uses, holding `clipText`.
function stemTrack(stem, trackId, nextPointee, clipText) {
  let pointee = nextPointee;
  const text = guide
    .replace(/<AudioTrack Id="\d+"/, `<AudioTrack Id="${trackId}"`)
    .replaceAll('Name Value="GUIDE" />', `Name Value="${escape(stem)}" />`)
    .replace('<MemorizedFirstClipName Value="" />', `<MemorizedFirstClipName Value="${escape(stem)}" />`)
    .replace(/<(\w*(?:AutomationTarget|ModulationTarget)|Pointee) Id="\d+"/g, (_, name) => `<${name} Id="${pointee++}"`)
    .replace(/(<MainSequencer>[\s\S]*?<Sample>\s*<ArrangerAutomation>\n\t*)<Events \/>/, (_, before) => `${before}<Events>${clipText}\n\t\t\t\t\t\t\t\t</Events>`);
  if (!text.includes('<AudioClip ')) throw new Error(`The clip of ${stem} found no place on its track.`);
  return { text, nextPointee: pointee };
}

function keyMapping(indent, key) {
  return [
    `\n${indent}<PersistentKeyString Value="${escape(key)}" />`,
    `\n${indent}<IsNote Value="false" />`,
    `\n${indent}<Channel Value="-1" />`,
    `\n${indent}<NoteOrController Value="-1" />`,
    `\n${indent}<LowerRangeNote Value="-1" />`,
    `\n${indent}<UpperRangeNote Value="-1" />`,
    `\n${indent}<ControllerMapMode Value="0" />`,
  ].join('');
}

function locator([time, name], id, key) {
  return [
    `\n\t\t\t\t<Locator Id="${id}">`,
    '\n\t\t\t\t\t<LomId Value="0" />',
    `\n\t\t\t\t\t<Time Value="${time}" />`,
    `\n\t\t\t\t\t<Name Value="${escape(name)}" />`,
    '\n\t\t\t\t\t<Annotation Value="" />',
    '\n\t\t\t\t\t<Mapping>',
    keyMapping('\t\t\t\t\t\t', key),
    '\n\t\t\t\t\t</Mapping>',
    '\n\t\t\t\t\t<IsSongStart Value="false" />',
    '\n\t\t\t\t</Locator>',
  ].join('');
}

function songXml(song) {
  const seconds = song.frames / SAMPLE_RATE;
  const end = beatAfter(song.tempo, seconds);
  let nextPointee = Number(/<NextPointeeId Value="(\d+)" \/>/.exec(template)?.[1]);
  const usedIds = [...template.matchAll(/\n\t\t\t<(?:AudioTrack|GroupTrack|ReturnTrack|MidiTrack) Id="(\d+)"/g)].map((match) => Number(match[1]));
  let trackId = Math.max(...usedIds) + 1;
  const tracks = song.stems.map((stem, index) => {
    const made = stemTrack(stem, trackId++, nextPointee, clip(song, stem, index, end, seconds));
    nextPointee = made.nextPointee;
    return made.text;
  });
  let xml = template;
  for (const text of [...trackTexts(template, 'GroupTrack'), ...trackTexts(template, 'AudioTrack')]) xml = xml.replace(text, '');
  xml = xml.replace('\n\t\t\t<ReturnTrack ', `${tracks.join('')}\n\t\t\t<ReturnTrack `);
  xml = xml.replace(/<NextPointeeId Value="\d+" \/>/, `<NextPointeeId Value="${nextPointee}" />`);
  xml = xml.replace(/<MainTrack [\s\S]*?<\/MainTrack>/, (mainTrack) =>
    mainTrack
      .replace(/(<Tempo>\s*<LomId Value="0" \/>\s*<Manual Value=)"[^"]*"/, `$1"${song.tempo[0][1]}"`)
      .replace(/(<TimeSignature>\s*<LomId Value="0" \/>\s*<Manual Value=)"[^"]*"/, `$1"${song.meter}"`)
      .replace(/\n(\t*)<EnumEvent Id="0" Time="-63072000" Value="\d+" \/>/, (_, indent) =>
        [[-63072000, song.meter], ...song.meterChanges].map(([time, value], id) => `\n${indent}<EnumEvent Id="${id}" Time="${time}" Value="${value}" />`).join(''),
      )
      .replace(/\n(\t*)<FloatEvent Id="0" Time="-63072000" Value="[^"]*" \/>/, (_, indent) =>
        song.tempo.map(([time, value], id) => `\n${indent}<FloatEvent Id="${id}" Time="${time}" Value="${value}" />`).join(''),
      ),
  );
  const stored = song.endMarkerFirst ? [song.locators.at(-1), ...song.locators.slice(0, -1)] : song.locators;
  const listed = stored.map((each, id) => locator(each, id, song.locatorKeys?.[id] ?? '')).join('');
  const [next, previous] = song.nextPreviousKeys ?? [];
  const jumps =
    next === undefined
      ? ''
      : `\n\t\t\t<NextLocatorMapping>${keyMapping('\t\t\t\t', next)}\n\t\t\t</NextLocatorMapping>` +
        `\n\t\t\t<PreviousLocatorMapping>${keyMapping('\t\t\t\t', previous)}\n\t\t\t</PreviousLocatorMapping>`;
  xml = xml.replace('\t\t<Locators>\n\t\t\t<Locators />', `\t\t<Locators>\n\t\t\t<Locators>${listed}\n\t\t\t</Locators>${jumps}`);
  return xml;
}

for (const song of SONGS) {
  const xml = songXml(song);
  if (serializeAls(parseAls(xml)) !== xml) throw new Error(`${song.folder} does not read back byte for byte.`);
  if (xml.includes('/Users/')) throw new Error(`${song.folder} names a home folder.`);
  writeFileSync(join(LIBRARY, song.folder, 'MultiTrack.als'), gzipSync(xml));
  const { song: read, problems } = await readSong(LIBRARY, song.folder);
  // The WAVs are no fixture: the test harness writes them into each workspace.
  const contentProblems = problems.filter((problem) => !problem.endsWith('is missing from the song folder.'));
  if (!read || contentProblems.length > 0) throw new Error(`${song.folder} reads with problems: ${contentProblems.join(' ')}`);
}

// Live 8 wrote XML comments, which Live 12 never writes and the strict parser refuses, so the song holds one: the
// build reads its version leniently first.
const live8 = template
  .replace(/<Ableton [^>]*>/, '<Ableton MajorVersion="4" MinorVersion="8.1_226" SchemaChangeCount="13" Creator="Ableton Live 8.4.2">')
  .replace('\n\t\t\t<GroupTrack ', '\n\t\t\t<!--A track of a Live 8 set-->\n\t\t\t<GroupTrack ');
writeFileSync(join(LIVE_8, LIVE_8_SONG, 'MultiTrack.als'), gzipSync(live8));
