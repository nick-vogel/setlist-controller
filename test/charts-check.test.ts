import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { SET_MANIFEST_FILE, type ManifestSong } from '../src/shared/set-manifest.ts';
import type { Connection, PreServiceCheck, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

// The Charts connection target: a file target over the set manifest, whose pre-service check holds
// each song of the set against its chart there. Every chart text here is made up.

const REPO_ROOT = resolve(import.meta.dirname, '..');
// Made Up Song, with a chart that drops two lines and has a Bridge no locator reaches; Second Made Up
// Song, with an empty chart key and no chords in brackets; No Chart Song, with no chart; and Third
// Made Up Song, with no chart key and no stems key.
const FIXTURE = resolve(import.meta.dirname, 'fixtures/set-manifest/charts-check.json');

// Song 3 is a title the manifest does not hold, and song 5 has no title.
const SET: CuePoint[] = [
  { name: '1 - Count Off (Made Up Song)', time: 0 },
  { name: '1 - Intro', time: 4 },
  { name: '1 - Verse', time: 12 },
  { name: '1 - Refrain', time: 28 },
  { name: '1 - Chorus', time: 36 },
  { name: '1 - Chorus', time: 52 },
  { name: '1 - Pad', time: 68 },
  { name: '1 - Pad Out', time: 72 },
  { name: '1 - End', time: 76 },
  { name: '2 - Intro (Second Made Up Song)', time: 100 },
  { name: '2 - Verse', time: 108 },
  { name: '2 - End', time: 124 },
  { name: '3 - Verse (Song Not In Manifest)', time: 140 },
  { name: '3 - End', time: 156 },
  { name: '4 - Verse (No Chart Song)', time: 170 },
  { name: '4 - End', time: 186 },
  { name: '5 - Verse', time: 200 },
  { name: '5 - End', time: 216 },
  { name: '6 - Verse (Third Made Up Song)', time: 230 },
  { name: '6 - End', time: 246 },
];

const SONG_PROBLEMS = ['Song Not In Manifest: not in the set manifest', 'No Chart Song: no chart', 'Song 5: no title on its first locator, so no chart matches it'];
const MADE_UP_NOTES = ['Made Up Song: dropped line "Made up words before any heading"', 'Made Up Song: dropped line "TRANSPOSE KEY +2"', 'Made Up Song: heading BRIDGE, no locator reaches it'];
const SECOND_KEY_NOTE = 'Second Made Up Song: no chart key, the stems key D is used';
const SECOND_CHORDS_NOTE = 'Second Made Up Song: no chords in brackets';
const THIRD_KEY_NOTE = 'Third Made Up Song: no chart key and no stems key, the chords show as typed';

const FIXTURE_CHECK: PreServiceCheck = {
  kind: 'unmatched',
  names: ['Made Up Song: Refrain'],
  problems: SONG_PROBLEMS,
  notes: [...MADE_UP_NOTES, SECOND_KEY_NOTE, SECOND_CHORDS_NOTE, THIRD_KEY_NOTE],
};

// At 120 BPM in 4/4 a beat is 500 ms.
const BEAT_MS = 500;
const NOT_MEASURED: Connection['lateness'] = { last: null, median: null, acted: null, actedMedian: null };

let rig: Rig | undefined;
// The folder a test's manifest goes in, inside the worktree's dist, never the home folder.
let folder: string | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
  vi.restoreAllMocks();
});

// A folder in dist for the test's manifest, and the manifest's path in it, with no file there yet.
async function manifestPath(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  folder = await mkdtemp(join(REPO_ROOT, 'dist/charts-check-'));
  return join(folder, SET_MANIFEST_FILE);
}

const chartsRow = (snapshot: ProducerSnapshot) => snapshot.connections.find((row) => row.name === 'charts');
const checkOf = (snapshot: ProducerSnapshot) => chartsRow(snapshot)?.check;

// Resolves with the first snapshot the producer receives from now on that matches.
function next(producer: Client<ProducerSnapshot>, matches: (snapshot: ProducerSnapshot) => boolean) {
  const start = producer.received.length;
  return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
}

const shows = (check: PreServiceCheck) => (snapshot: ProducerSnapshot) => loaded(snapshot) && JSON.stringify(checkOf(snapshot)) === JSON.stringify(check);

// A rig with Live stopped, whose server reads the manifest at that path, and the producer connected.
async function checkedRig(path: string, cuePoints: CuePoint[] = SET) {
  rig = await startRig(cuePoints, { playing: false, position: 0 }, { setManifest: path });
  return rig.connectProducer();
}

describe('the Charts check', () => {
  it('produces each Cannot match, Problems and Notes line from the manifest, in set order', async () => {
    const path = await manifestPath();
    await copyFile(FIXTURE, path);
    const producer = await checkedRig(path);

    const snapshot = await producer.snapshot((snapshot) => loaded(snapshot) && checkOf(snapshot)?.kind !== 'not-checked');

    expect(checkOf(snapshot)).toEqual(FIXTURE_CHECK);
    expect(chartsRow(snapshot)).toMatchObject({ label: 'Charts', configured: true, connection: 'online', arm: 'disarmed', buttons: [], problems: [] });
  });

  it('never lists Count Off, Pad, Pad Out or End under Cannot match, by the name rule', async () => {
    const path = await manifestPath();
    const songs: ManifestSong[] = [
      { title: 'Made Up Song', stemsKey: 'G', chartKey: 'G', chartText: '[G]Made up words under no heading' },
      { title: 'Second Made Up Song', stemsKey: 'D', chartKey: 'D', chartText: '[D]No heading here either' },
    ];
    await writeFile(path, JSON.stringify({ songs }));
    const producer = await checkedRig(path, [
      { name: '1 - Count Off (Made Up Song)', time: 0 },
      { name: '1 - Intro', time: 4 },
      { name: '1 - Verse', time: 12 },
      { name: '1 - Chorus', time: 28 },
      { name: '1 - Chorus', time: 44 },
      { name: '1 - Pad', time: 60 },
      { name: '1 - Pad Out', time: 64 },
      { name: '1 - End', time: 68 },
      { name: '2 - count off (Second Made Up Song)', time: 80 },
      { name: '2 - Verse', time: 84 },
      { name: '2 - PAD  OUT', time: 100 },
      { name: '2 - end', time: 104 },
    ]);

    const snapshot = await producer.snapshot((snapshot) => loaded(snapshot) && checkOf(snapshot)?.kind === 'unmatched');
    const check = checkOf(snapshot);

    expect(check?.kind === 'unmatched' && check.names).toEqual(['Made Up Song: Intro', 'Made Up Song: Verse', 'Made Up Song: Chorus', 'Second Made Up Song: Verse']);
  });

  it('runs again when the manifest changes, with no Refresh', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = await manifestPath();
    await copyFile(FIXTURE, path);
    const producer = await checkedRig(path);
    await producer.snapshot(shows(FIXTURE_CHECK));

    // Second Made Up Song gets its chart key and No Chart Song its chart. Refrain is no section word, so
    // it stays unmatched.
    const songs = (JSON.parse(await readFile(FIXTURE, 'utf8')) as { songs: ManifestSong[] }).songs.map((song) =>
      song.title === 'Second Made Up Song' ? { ...song, chartKey: 'D' } : song.title === 'No Chart Song' ? { ...song, chartKey: 'A', chartText: 'VERSE\n[A]A made up line' } : song,
    );
    let seen = next(producer, shows({ kind: 'unmatched', names: ['Made Up Song: Refrain'], problems: [SONG_PROBLEMS[0]!, SONG_PROBLEMS[2]!], notes: [...MADE_UP_NOTES, SECOND_CHORDS_NOTE, THIRD_KEY_NOTE] }));
    await writeFile(path, JSON.stringify({ songs }));
    await seen;

    seen = next(producer, shows({ kind: 'unmatched', names: [], problems: [`No set manifest at ${path}. pnpm build-set writes it.`], notes: [] }));
    await rm(path);
    await seen;

    const parse = next(producer, (snapshot) => {
      const check = checkOf(snapshot);
      return check?.kind === 'unmatched' && check.names.length === 0 && check.notes.length === 0 && check.problems.length === 1 && /^The set manifest is not valid JSON: /.test(check.problems[0]!);
    });
    await writeFile(path, '{ "songs": [');
    await parse;
    expect(error).toHaveBeenCalled();
  });

  it('is no row at all for a server with no set manifest', async () => {
    rig = await startRig(SET, { playing: false, position: 0 });
    const producer = await rig.connectProducer();

    const snapshot = await producer.snapshot(loaded);

    expect(snapshot.connections.map(({ name }) => name)).toEqual([]);
  });

  it('comes last, after the targets given, and an armed Charts row is never measured as the set plays', async () => {
    const path = await manifestPath();
    await copyFile(FIXTURE, path);
    const pro = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
    rig = await startRig(SET, { playing: true, position: 2 }, { setManifest: path, targets: [pro] });
    const producer = await rig.connectProducer();
    await producer.snapshot((snapshot) => loaded(snapshot) && snapshot.connections.every((row) => row.connection === 'online'));
    for (const target of ['propresenter', 'charts']) {
      const armed = next(producer, (snapshot) => snapshot.connections.find((row) => row.name === target)?.arm === 'armed');
      producer.send({ kind: 'arm', target });
      await armed;
    }

    // Plays across the Intro's downbeat at 4, reported half a beat after it.
    const played = next(producer, (snapshot) => snapshot.position !== null && Math.abs(snapshot.position - 4.5) < 1e-3);
    rig.live.advance(2.5 * BEAT_MS);
    const snapshot = await played;

    expect(snapshot.connections.map(({ name }) => name)).toEqual(['propresenter', 'charts']);
    expect(pro.cues.at(-1)).toMatchObject({ name: 'Intro' });
    expect(snapshot.connections[0]?.lateness.last).toBe(250);
    expect(chartsRow(snapshot)).toMatchObject({ connection: 'online', arm: 'armed', lateness: NOT_MEASURED });
  });
});
