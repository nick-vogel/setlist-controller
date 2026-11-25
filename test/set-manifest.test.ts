import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARTS_API, SETUP_PEDAL_API } from '../src/shared/routes.ts';
import { beatsPerBar, chartForSong, meterForSong, parseBeatsPerBar, parseSetManifest, SET_MANIFEST_FILE, type ManifestSong, type SetCharts } from '../src/shared/set-manifest.ts';
import type { Snapshot } from '../src/shared/snapshot.ts';
import { loaded, readSetup, startRig, type Rig } from './harness.ts';

// The address the server sees a connection come from, when a test sets one. Only Linux routes all of
// 127.0.0.0/8 to the loopback, so on a Mac a test cannot send from an address other than the server's;
// this gives each socket the server accepts the given remote address instead, as a band phone's is.
const peer = vi.hoisted(() => ({ address: undefined as string | undefined }));
vi.mock('node:http', async (importOriginal) => {
  const http = await importOriginal<typeof import('node:http')>();
  const createServer = ((...args: Parameters<typeof http.createServer>) => {
    const server = http.createServer(...args);
    server.on('connection', (socket) => {
      if (peer.address) Object.defineProperty(socket, 'remoteAddress', { value: peer.address });
    });
    return server;
  }) as typeof http.createServer;
  return { ...http, createServer };
});

// The set manifest: one JSON file holding each song's title, stems key, meter, chart key and chart text, in
// set order. Every chart text here is made up.

const NOT_READABLE = 'The set manifest needs a "songs" list, each song with a "title", a "stemsKey" (a key or null), a "meter" when it has one and, for a song with a chart, a "chartKey" and a "chartText".';

describe('reading the set manifest', () => {
  it.each([
    {
      what: 'a song with a chart and a song with none',
      text: JSON.stringify({
        songs: [
          { title: 'Made Up Song', stemsKey: 'G', chartKey: 'G', chartText: 'VERSE\n[G]Made up words' },
          { title: 'Another Song', stemsKey: null },
        ],
      }),
      songs: [
        { title: 'Made Up Song', stemsKey: 'G', chartKey: 'G', chartText: 'VERSE\n[G]Made up words' },
        { title: 'Another Song', stemsKey: null },
      ],
    },
    { what: 'a set with no songs', text: '{ "songs": [] }', songs: [] },
    {
      what: "each song's starting meter",
      text: JSON.stringify({ songs: [{ title: 'Made Up Song', stemsKey: 'G', meter: '6/8' }] }),
      songs: [{ title: 'Made Up Song', stemsKey: 'G', meter: '6/8' }],
    },
    {
      what: "each song's durations, the last song's gap null",
      text: JSON.stringify({ songs: [{ title: 'Made Up Song', stemsKey: 'G', durations: { sections: [{ beats: 8, seconds: 4 }], gap: null }, extra: 1 }] }),
      songs: [{ title: 'Made Up Song', stemsKey: 'G', durations: { sections: [{ beats: 8, seconds: 4 }], gap: null } }],
    },
  ])('reads $what', ({ text, songs }) => {
    expect(parseSetManifest(text)).toEqual({ manifest: { songs } });
  });

  // The song's chart and meter still serve, and the server times it by Live's tempo.
  it.each([
    { what: 'durations that are not an object', durations: 3 },
    { what: 'no sections list', durations: { gap: null } },
    { what: 'a section with no seconds', durations: { sections: [{ beats: 8 }], gap: null } },
    { what: 'a negative length', durations: { sections: [{ beats: 8, seconds: -1 }], gap: null } },
    { what: 'a gap that is left out', durations: { sections: [{ beats: 8, seconds: 4 }] } },
    { what: 'a gap that is not a span', durations: { sections: [], gap: 12 } },
  ])('drops only the durations with $what', ({ durations }) => {
    const text = JSON.stringify({ songs: [{ title: 'Made Up Song', stemsKey: 'G', meter: '6/8', durations }] });
    expect(parseSetManifest(text)).toEqual({ manifest: { songs: [{ title: 'Made Up Song', stemsKey: 'G', meter: '6/8' }] } });
  });

  it.each([
    { what: 'no songs list', text: '{ "tracks": [] }' },
    { what: 'a list at the top', text: '[]' },
    { what: 'a song that is not an object', text: '{ "songs": ["Made Up Song"] }' },
    { what: 'a song with no title', text: '{ "songs": [{ "stemsKey": "G" }] }' },
    { what: 'a stems key that is a number', text: '{ "songs": [{ "title": "Made Up Song", "stemsKey": 7 }] }' },
    { what: 'a song with no stems key', text: '{ "songs": [{ "title": "Made Up Song" }] }' },
    { what: 'a chart text that is not text', text: '{ "songs": [{ "title": "Made Up Song", "stemsKey": "G", "chartKey": "G", "chartText": 3 }] }' },
    { what: 'a meter that is not text', text: '{ "songs": [{ "title": "Made Up Song", "stemsKey": "G", "meter": 6 }] }' },
    { what: 'a chart key that is not text', text: '{ "songs": [{ "title": "Made Up Song", "stemsKey": "G", "chartKey": false, "chartText": "VERSE" }] }' },
  ])('gives one problem for the whole file with $what', ({ text }) => {
    expect(parseSetManifest(text)).toEqual({ problem: NOT_READABLE });
  });

  it('gives one problem naming JSON for text that is not JSON', () => {
    expect(parseSetManifest('{ "songs": [')).toEqual({ problem: expect.stringMatching(/^The set manifest is not valid JSON: /) });
  });
});

describe("the beats a bar of a manifest song's meter holds", () => {
  it.each([
    { meter: '6/8', beats: 3 },
    { meter: '3/4', beats: 3 },
    { meter: '4/4', beats: 4 },
    { meter: '12/8', beats: 6 },
    { meter: undefined, beats: 4 },
    { meter: 'x', beats: 4 },
    { meter: '0/4', beats: 4 },
    { meter: '4/0', beats: 4 },
  ])('gives $beats for $meter', ({ meter, beats }) => {
    expect(beatsPerBar(meter)).toBe(beats);
  });

  it('returns null from parseBeatsPerBar when a meter is missing or unreadable', () => {
    expect(parseBeatsPerBar('6/8')).toBe(3);
    expect(parseBeatsPerBar(undefined)).toBeNull();
    expect(parseBeatsPerBar('invalid')).toBeNull();
    expect(parseBeatsPerBar('0/4')).toBeNull();
  });

  it('matches songs by title in meterForSong and returns null when missing', () => {
    const songs: ManifestSong[] = [
      { title: 'Build My Life', stemsKey: 'G', meter: '6/8' },
      { title: 'No Meter', stemsKey: 'D' },
    ];
    expect(meterForSong(songs, '  build my LIFE ')).toBe(3);
    expect(meterForSong(songs, 'No Meter')).toBeNull();
    expect(meterForSong(songs, 'Unknown')).toBeNull();
    expect(meterForSong(songs, null)).toBeNull();
  });
});

describe("a song's chart in the manifest", () => {
  const SONGS: ManifestSong[] = [
    { title: 'Song', stemsKey: 'D', chartKey: 'D', chartText: 'VERSE\n[D]First' },
    { title: 'Song 2', stemsKey: 'E', chartKey: 'E', chartText: 'VERSE\n[E]Second' },
    { title: 'No Chart Song', stemsKey: 'A' },
  ];

  it.each([
    { what: 'its title exactly', title: 'Song', found: 'Song' },
    { what: 'its title in another letter case and spacing', title: '  song ', found: 'Song' },
    { what: 'a longer title holding it, which is another song', title: 'Song 2', found: 'Song 2' },
    { what: 'a title in no song', title: 'Song 3', found: undefined },
    { what: 'no title', title: null, found: undefined },
    { what: 'a song with a title and no chart', title: 'No Chart Song', found: undefined },
  ])('matches by the name rule: $what', ({ title, found }) => {
    expect(chartForSong(SONGS, title)?.title).toBe(found);
  });

  it('takes the first of two songs whose titles match', () => {
    const twice: ManifestSong[] = [
      { title: 'Song', stemsKey: 'D', chartKey: 'D', chartText: 'VERSE\nfirst' },
      { title: 'SONG', stemsKey: 'D', chartKey: 'D', chartText: 'VERSE\nsecond' },
    ];
    expect(chartForSong(twice, 'song')?.chartText).toBe('VERSE\nfirst');
  });
});

const REPO_ROOT = resolve(import.meta.dirname, '..');
// Made Up Song, with a chart, and Short Song, with none.
const FIXTURE = resolve(import.meta.dirname, 'fixtures/set-manifest/set-manifest.json');
const SET = [
  { name: '1 - Count Off (Made Up Song)', time: 0 },
  { name: '1 - Verse', time: 8 },
  { name: '1 - End', time: 24 },
];
// Longer than the server waits for a file's events to settle, so a change it would read has been read.
const SETTLED_MS = 400;

let rig: Rig | undefined;
// The folder a test's manifest goes in, inside the worktree's dist, never the home folder.
let folder: string | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = undefined;
  peer.address = undefined;
  vi.restoreAllMocks();
});

// A folder in dist for the test's manifest, and the manifest's path in it.
async function manifestFolder(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  folder = await mkdtemp(join(REPO_ROOT, 'dist/set-manifest-'));
  return join(folder, SET_MANIFEST_FILE);
}

// A rig whose server reads the fixture, copied into the test's folder.
async function rigWithFixture(): Promise<{ rig: Rig; path: string }> {
  const path = await manifestFolder();
  await copyFile(FIXTURE, path);
  rig = await startRig(SET, {}, { setManifest: path });
  return { rig, path };
}

const charts = (rig: Rig) => readSetup<SetCharts>(rig.server.httpPort, CHARTS_API, 'the charts');
const fixtureSongs = async () => (JSON.parse(await readFile(FIXTURE, 'utf8')) as { songs: ManifestSong[] }).songs;
const revision = (wanted: number) => Object.defineProperty((snapshot: Snapshot) => snapshot.chartRevision === wanted, 'name', { value: `chart revision ${wanted}` });
const ONE_SONG: ManifestSong[] = [{ title: 'Made Up Song', stemsKey: 'G', chartKey: 'G', chartText: 'CHORUS\n[C]A changed made up line' }];
const manifestOf = (songs: ManifestSong[]) => JSON.stringify({ songs });

// A request for the charts with another method, answered with its status.
function statusOf(port: number, method: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path: CHARTS_API, method, agent: false }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

describe('the server and the set manifest', () => {
  it('reads the manifest from the path option, serves its songs to any page, and carries its revision in the snapshot', async () => {
    const { rig } = await rigWithFixture();
    const viewer = await rig.connectViewer();

    expect((await viewer.snapshot(loaded)).chartRevision).toBe(1);
    expect(await charts(rig)).toEqual({ revision: 1, songs: await fixtureSongs() });
  });

  it('serves the charts to a band phone, which the laptop-only routes refuse', async () => {
    const { rig } = await rigWithFixture();
    peer.address = '192.0.2.10';

    await expect(readSetup(rig.server.httpPort, SETUP_PEDAL_API, 'the foot pedal status')).rejects.toThrow('answered 403');
    expect(await charts(rig)).toEqual({ revision: 1, songs: await fixtureSongs() });
  });

  it('raises the revision when the file is rewritten, and serves the new songs', async () => {
    const { rig, path } = await rigWithFixture();
    const viewer = await rig.connectViewer();
    await viewer.snapshot(loaded);

    await writeFile(path, manifestOf(ONE_SONG));

    await viewer.snapshot(revision(2));
    expect(await charts(rig)).toEqual({ revision: 2, songs: ONE_SONG });
  });

  it('raises the revision each time the file is replaced by a rename, as an atomic write does', async () => {
    const { rig, path } = await rigWithFixture();
    const viewer = await rig.connectViewer();
    await viewer.snapshot(loaded);

    await writeFile(`${path}.new`, manifestOf(ONE_SONG));
    await rename(`${path}.new`, path);

    await viewer.snapshot(revision(2));
    expect(await charts(rig)).toEqual({ revision: 2, songs: ONE_SONG });

    // The next rebuild replaces the file the last one put there, which a watch on the file would miss.
    const next: ManifestSong[] = [{ title: 'Made Up Song', stemsKey: 'G', chartKey: 'G', chartText: 'CHORUS\n[D]A made up line for the next build' }];
    await writeFile(`${path}.new`, manifestOf(next));
    await rename(`${path}.new`, path);

    await viewer.snapshot(revision(3));
    expect(await charts(rig)).toEqual({ revision: 3, songs: next });
  });

  it('raises nothing for a rewrite with the same text', async () => {
    const { rig, path } = await rigWithFixture();
    const viewer = await rig.connectViewer();
    await viewer.snapshot(loaded);

    await writeFile(path, await readFile(FIXTURE, 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, SETTLED_MS));

    expect(viewer.received.map(({ chartRevision }) => chartRevision)).not.toContain(2);
    expect((await charts(rig)).revision).toBe(1);
    // The control: a changed text does raise it.
    await writeFile(path, manifestOf(ONE_SONG));
    await viewer.snapshot(revision(2));
  });

  it('serves no songs once the file is deleted', async () => {
    const { rig, path } = await rigWithFixture();
    const viewer = await rig.connectViewer();
    await viewer.snapshot(loaded);

    await rm(path);

    await viewer.snapshot(revision(2));
    expect(await charts(rig)).toEqual({ revision: 2, songs: [] });
  });

  it('serves no songs from a file that is not a manifest, and logs its problem', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rig, path } = await rigWithFixture();
    const viewer = await rig.connectViewer();
    await viewer.snapshot(loaded);

    await writeFile(path, '{ "songs": [');

    await viewer.snapshot(revision(2));
    expect(await charts(rig)).toEqual({ revision: 2, songs: [] });
    expect(error.mock.calls.map(([line]) => String(line))).toEqual([expect.stringMatching(/^Setlist server: The set manifest is not valid JSON: .* No song shows chart text\. \(.*set-manifest\.json\)$/)]);
  });

  it("reads it again on the leader's Refresh, for a folder that was not there to watch at start", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
    folder = await mkdtemp(join(REPO_ROOT, 'dist/set-manifest-'));
    const path = join(folder, 'not-yet', SET_MANIFEST_FILE);
    rig = await startRig(SET, {}, { setManifest: path });
    const leader = await rig.connectLeader();
    await leader.snapshot(loaded);
    expect(error.mock.calls.map(([line]) => String(line))).toEqual([expect.stringContaining('cannot watch the set manifest')]);

    await mkdir(join(folder, 'not-yet'));
    await copyFile(FIXTURE, path);
    await new Promise((resolve) => setTimeout(resolve, SETTLED_MS));
    expect((await charts(rig)).revision).toBe(1);

    leader.send({ kind: 'refresh' });

    await leader.snapshot(revision(2));
    expect(await charts(rig)).toEqual({ revision: 2, songs: await fixtureSongs() });
  });

  it('answers only GET and HEAD on the charts route', async () => {
    const { rig } = await rigWithFixture();

    expect(await statusOf(rig.server.httpPort, 'POST')).toBe(405);
    expect(await statusOf(rig.server.httpPort, 'PUT')).toBe(405);
    expect(await statusOf(rig.server.httpPort, 'HEAD')).toBe(200);
  });

  it('serves no songs at revision 1 with no manifest given', async () => {
    rig = await startRig(SET);
    const viewer = await rig.connectViewer();

    expect((await viewer.snapshot(loaded)).chartRevision).toBe(1);
    expect(await charts(rig)).toEqual({ revision: 1, songs: [] });
  });
});
