import { createSocket, type Socket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { startFakeLive } from '../src/fake-live/fake-live.ts';
import { CUE, TEST_SET, TEST_SET_TEMPO } from '../src/contract/test-set.ts';
import { PROBE } from '../src/shared/abletonosc.ts';
import { decode, encode, type OscMessage, type OscOutArgument } from '../src/shared/osc.ts';

// Live keeps two positions while stopped (setlist-controller#13's trials on Live Lite 12.4.6, the
// 1-song contract check set at 120 BPM): the start marker, which start_playing plays from and a jump
// or a set current_song_time while stopped moves, and the stop point, which continue_playing resumes
// from whatever moved while stopped. These cases replay those trials against the fake Live, and read
// only what its listeners report.

const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const POSITION = '/live/song/get/current_song_time';
const IS_PLAYING = '/live/song/get/is_playing';
// At 120 BPM a beat lasts 500 ms.
const MS_PER_BEAT = 60000 / TEST_SET_TEMPO;

async function start() {
  const live = await startFakeLive({ cuePoints: TEST_SET, tempo: TEST_SET_TEMPO });
  cleanups.push(() => live.close());

  const socket: Socket = createSocket('udp4');
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      socket.off('error', reject);
      resolve();
    });
  });
  cleanups.push(() => new Promise<void>((resolve) => socket.close(() => resolve())));

  let inbox: OscMessage[] = [];
  let waiting: ((messages: OscMessage[]) => void) | undefined;
  socket.on('message', (packet) => {
    const message = decode(packet);
    if (!message) return;
    if (message.address === PROBE && waiting) {
      const done = waiting;
      const messages = inbox;
      waiting = undefined;
      inbox = [];
      done(messages);
    } else {
      inbox.push(message);
    }
  });

  const send = (address: string, args: OscOutArgument[] = []) => socket.send(encode(address, args), live.port, '127.0.0.1');
  // Sends the version probe and waits for its reply. The fake Live replies in order, so everything
  // the steps before it caused arrives first. Returns what arrived since the last barrier.
  const barrier = () =>
    new Promise<OscMessage[]>((resolve) => {
      waiting = resolve;
      send(PROBE);
    });

  send('/live/song/start_listen/current_song_time');
  send('/live/song/start_listen/is_playing');
  await barrier();

  const positions = (messages: OscMessage[]) => messages.filter(({ address }) => address === POSITION).map(({ args }) => args[0] as number);
  const playing = (messages: OscMessage[]) => messages.filter(({ address }) => address === IS_PLAYING).map(({ args }) => args[0]);

  return {
    fake: live,
    jump: (cue: number) => send('/live/song/cue_point/jump', [{ int: cue }]),
    setSongTime: (beats: number) => send('/live/song/set/current_song_time', [beats]),
    startPlaying: () => send('/live/song/start_playing'),
    continuePlaying: () => send('/live/song/continue_playing'),
    stopPlaying: () => send('/live/song/stop_playing'),
    // Plays on for that many beats, once the fake Live has acted on everything sent before. What
    // arrived meanwhile stays in the inbox for the next barrier.
    async play(beats: number) {
      const before = await barrier();
      inbox.unshift(...before);
      live.advance(beats * MS_PER_BEAT);
    },
    barrier,
    positions,
    playing,
    // Where playback started: plays on for one beat and reads where the playhead went, one beat back.
    async playsFrom() {
      await this.play(1);
      const reported = positions(await barrier());
      const last = reported.at(-1);
      if (last === undefined) throw new Error('The fake Live reported no playhead after a beat of playing');
      return last - 1;
    },
  };
}

describe('the fake Live transport while stopped', () => {
  it('resumes at the stop point on continue_playing after a jump while stopped', async () => {
    const live = await start();
    live.startPlaying();
    await live.play(54.5);
    live.stopPlaying();
    expect(live.playing(await live.barrier())).toEqual([true, false]);

    live.jump(CUE.chorus);
    expect(live.positions(await live.barrier())).toEqual([32]);

    live.continuePlaying();
    expect(live.playing(await live.barrier())).toEqual([true]);
    expect(await live.playsFrom()).toBeCloseTo(54.5, 3);
  });

  it('resumes at the stop point on continue_playing after a set current_song_time while stopped', async () => {
    const live = await start();
    live.startPlaying();
    await live.play(54.5);
    live.stopPlaying();
    await live.barrier();

    live.setSongTime(32);
    expect(live.positions(await live.barrier())).toEqual([32]);

    live.continuePlaying();
    expect(await live.playsFrom()).toBeCloseTo(54.5, 3);
  });

  it('resumes at the stop point after a short play from the Verse, a stop in the Chorus, and a jump', async () => {
    const live = await start();
    live.jump(CUE.verse);
    live.startPlaying();
    expect(await live.playsFrom()).toBeCloseTo(16, 3);
    await live.play(35.4 - 17);
    live.stopPlaying();
    await live.barrier();

    live.jump(CUE.chorus);
    expect(live.positions(await live.barrier())).toEqual([32]);

    live.continuePlaying();
    expect(await live.playsFrom()).toBeCloseTo(35.4, 3);
  });

  it('plays from the locator on a jump then start_playing in the same tick', async () => {
    const live = await start();
    live.jump(CUE.chorus);
    live.startPlaying();
    const messages = await live.barrier();
    expect(live.positions(messages)).toEqual([32]);
    expect(live.playing(messages)).toEqual([true]);
    expect(await live.playsFrom()).toBeCloseTo(32, 3);
  });

  it('plays from the Intro on a jump to it then start_playing, from a stop past the Verse', async () => {
    const live = await start();
    live.jump(CUE.chorus);
    live.startPlaying();
    await live.play(8);
    live.stopPlaying();
    expect(live.positions(await live.barrier()).at(-1)).toBeCloseTo(40, 3);

    live.jump(CUE.intro);
    live.startPlaying();
    expect(await live.playsFrom()).toBeCloseTo(0, 3);
  });

  it('plays from where the last start began on start_playing with no jump, not from the stop point and not the top', async () => {
    const live = await start();
    live.jump(CUE.chorus);
    live.startPlaying();
    await live.play(0.6);
    live.stopPlaying();
    expect(live.positions(await live.barrier()).at(-1)).toBeCloseTo(32.6, 3);

    live.startPlaying();
    expect(await live.playsFrom()).toBeCloseTo(32, 3);
  });
});

const JUMP = '/live/song/cue_point/jump';

// AbletonOSC runs over UDP and sends no reply to a jump, so a lost datagram is a jump Live never
// makes and never hears of.
describe('a lost datagram to the fake Live', () => {
  it('leaves the playhead playing on across the bar line after a lost jump, and acts on the next jump', async () => {
    const live = await start();
    live.startPlaying();
    await live.play(21);

    live.fake.loseNext(JUMP);
    live.jump(CUE.chorus);
    await live.barrier();
    expect(live.fake.lost).toEqual([{ address: JUMP, args: [CUE.chorus], types: 'i' }]);
    expect(live.fake.received.filter(({ address }) => address === JUMP)).toEqual([]);

    // Across the bar line at 24 by a beat, still in the Verse.
    await live.play(4);
    expect(live.positions(await live.barrier()).at(-1)).toBeCloseTo(25, 3);

    // The next jump is acted on: across the bar line at 28 by a beat, into the Chorus at 32.
    live.jump(CUE.chorus);
    await live.play(4);
    expect(live.positions(await live.barrier()).at(-1)).toBeCloseTo(33, 3);
    expect(live.fake.lost).toHaveLength(1);
  });
});
