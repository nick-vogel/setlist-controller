import { spawn } from 'node:child_process';
import { Socket } from 'node:dgram';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERRUPTED, runContractCheck } from '../src/contract/run.ts';
import { TEST_SET, TEST_SET_LOOP, TEST_SET_SIGNATURE, TEST_SET_TEMPO, TEST_SET_TRACKS } from '../src/contract/test-set.ts';
import { startFakeLive, type FakeLive } from '../src/fake-live/fake-live.ts';
import type { OscMessage } from '../src/shared/osc.ts';

let live: FakeLive | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await live?.close();
  live = undefined;
});

const REPO_ROOT = resolve(import.meta.dirname, '..');

const START = '/live/song/start_playing';
const CONTINUE = '/live/song/continue_playing';
const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';
const LOOP = '/live/song/set/loop';
const TRACK_DATA = '/live/song/get/track_data';
const GET_VOLUME = '/live/track/get/volume';
const SET_VOLUME = '/live/track/set/volume';

// The contract run against the in-process fake Live, as `main.ts run --target fake` starts it, and
// interrupted once the fake Live has received a message that matches, by default once the run has
// started Live playing.
async function interruptedRun(
  interruptOnce: (message: OscMessage) => boolean = (message) => message.address === START,
  tracks = TEST_SET_TRACKS,
  timeout = 5000,
) {
  live = await startFakeLive({
    cuePoints: TEST_SET,
    tempo: TEST_SET_TEMPO,
    signature: TEST_SET_SIGNATURE,
    loop: { on: false, ...TEST_SET_LOOP },
    tracks,
    clock: 'realtime',
    port: 0,
  });
  const interrupted = new AbortController();
  const running = runContractCheck({
    target: { kind: 'fake', host: '127.0.0.1', port: live.port, replyPort: 0 },
    bindHost: '127.0.0.1',
    signal: interrupted.signal,
  });
  await vi.waitFor(() => expect(live?.received.some(interruptOnce)).toBe(true), { timeout });
  return { running, interrupt: () => interrupted.abort() };
}

// The test set's tracks at the volumes the fake Live starts them at.
const START_VOLUMES = [0.75, 0.5, 1];

const afterStart = () => {
  const received = live?.received ?? [];
  return received.slice(received.findIndex((message) => message.address === START) + 1);
};

describe('the contract check', () => {
  it('stops Live and turns the loop off when it is interrupted after Live started playing', async () => {
    const { running, interrupt } = await interruptedRun();

    interrupt();

    expect((await running).aborted).toBe(INTERRUPTED);
    await vi.waitFor(() => expect(afterStart().map((message) => message.address)).toEqual(expect.arrayContaining([STOP, LOOP])));
    expect(afterStart().find((message) => message.address === LOOP)?.args).toEqual([0]);
  }, 10_000);

  it('records that a jump then start_playing plays from the locator, and that continue_playing after a stop and a jump resumes at the stop point', async () => {
    // The first jump the fake Live receives after the run's continue_playing is the next step's, so by
    // then the continue-after-stop step has recorded what it saw.
    const { running, interrupt } = await interruptedRun(
      (message) => {
        const received = live?.received ?? [];
        const continued = received.findIndex((candidate) => candidate.address === CONTINUE);
        return continued >= 0 && message.address === JUMP && received.indexOf(message) > continued;
      },
      TEST_SET_TRACKS,
      8000,
    );

    interrupt();
    const record = await running;

    const observed = (step: string, observation: string) => record.steps.find((candidate) => candidate.name === step)?.observations[observation];
    expect(observed('jump-then-start', 'plays from the locator')).toBe('yes');
    expect(observed('continue-after-stop', 'resumes at the stop point')).toBe('yes');
  }, 10_000);

  it("covers the fade's track messages, and leaves every volume as it found it", async () => {
    const { running, interrupt } = await interruptedRun();

    interrupt();
    const record = await running;

    expect(live?.received.filter((message) => message.address === TRACK_DATA)).toEqual([
      { address: TRACK_DATA, args: [0, -1, 'track.name', 'track.is_grouped'], types: 'iiss' },
    ]);
    // Read every volume, set each to a quarter, read them back, set each back, and read them again.
    const read = [0, 1, 2].map((track) => [GET_VOLUME, track]);
    const volumeMessages = live?.received
      .filter((message) => message.address === GET_VOLUME || message.address === SET_VOLUME)
      .map((message) => [message.address, ...message.args]);
    expect(volumeMessages).toEqual([
      ...read,
      [SET_VOLUME, 0, 0.25],
      [SET_VOLUME, 1, 0.25],
      [SET_VOLUME, 2, 0.25],
      ...read,
      [SET_VOLUME, 0, 0.75],
      [SET_VOLUME, 1, 0.5],
      [SET_VOLUME, 2, 1],
      ...read,
    ]);
    expect(live?.volumes()).toEqual(START_VOLUMES);
    expect(record.steps.find((step) => step.name === 'track-volumes')?.observations).toEqual({
      'reply types': 'sFsTsF',
      tracks: [
        ['Group', 'not grouped'],
        ['Grouped', 'grouped'],
        ['Single', 'not grouped'],
      ],
      'volume reply types': 'if',
      'answers with its index': 'yes',
      'reads back the volume set': 'yes',
      'set back to the volume read': 'yes',
    });
    expect(record.warnings).toEqual([]);
  }, 10_000);

  it("warns when the set's tracks are not the test set's, naming both lists", async () => {
    const { running, interrupt } = await interruptedRun(undefined, [
      { name: 'Drums', grouped: false, volume: 0.75 },
      { name: 'Kick', grouped: true, volume: 0.5 },
    ]);

    interrupt();
    const record = await running;

    expect(record.warnings).toEqual([
      "The tracks are Drums (not grouped), Kick (grouped), not the test set's Group (not grouped), Grouped (grouped), Single (not grouped).",
    ]);
  }, 10_000);

  it('sets every volume back when it is interrupted after it changed one', async () => {
    const { running, interrupt } = await interruptedRun((message) => message.address === SET_VOLUME);

    interrupt();

    expect((await running).aborted).toBe(INTERRUPTED);
    expect(live?.received.some((message) => message.address === START)).toBe(false);
    await vi.waitFor(() => expect(live?.volumes()).toEqual(START_VOLUMES));
  }, 10_000);

  it('still finishes the run when a clean-up send fails', async () => {
    const { running, interrupt } = await interruptedRun();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Socket.prototype, 'send').mockImplementation(function (this: Socket, ...args: unknown[]) {
      const callback = args.at(-1);
      if (typeof callback === 'function') callback(new Error('send failed'));
    } as Socket['send']);

    interrupt();

    expect((await running).aborted).toBe(INTERRUPTED);
    expect(logged).toHaveBeenCalledWith('Contract check: UDP socket error', expect.objectContaining({ message: 'send failed' }));
  }, 10_000);

  it('leaves the last complete report as it was when Ctrl-C stops a run, and writes the partial one beside it', async () => {
    await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
    const dir = await mkdtemp(join(REPO_ROOT, 'dist/contract-'));
    try {
      const out = join(dir, 'rep');
      const complete = '{ "complete": true }\n';
      await writeFile(`${out}.json`, complete);
      const child = spawn(process.execPath, [join(REPO_ROOT, 'src/contract/main.ts'), 'run', '--target', 'fake', '--out', out], { stdio: 'ignore' });
      const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
      setTimeout(() => child.kill('SIGINT'), 1000);

      expect(await exited).toBe(130);
      expect(await readFile(`${out}.json`, 'utf8')).toBe(complete);
      expect(existsSync(`${out}.interrupted.json`)).toBe(true);
      expect(existsSync(`${out}.interrupted.md`)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
