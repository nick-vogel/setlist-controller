import { createSocket, type Socket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { startFakeLive, type FakeLive } from '../src/fake-live/fake-live.ts';
import { PROBE } from '../src/shared/abletonosc.ts';
import { decode, encode, type OscMessage, type OscOutArgument } from '../src/shared/osc.ts';

// AbletonOSC registers a listener only on /live/song/start_listen/<property>, for a property the
// song has. The fake Live must refuse every other form, or the suite stops catching a bridge that
// registers on the wrong address.

// Things a test opened, closed after it whether it passed or not.
const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

// A UDP client that talks to the fake Live, standing in for the bridge.
type Client = {
  send(address: string, args?: OscOutArgument[]): void;
  // Sends the version probe and waits for its reply. The fake Live sends every reply and report
  // in order, as soon as it acts, so everything the steps before it caused arrives first. Returns
  // what arrived since the last barrier, without the probe's reply.
  barrier(): Promise<OscMessage[]>;
};

async function start(): Promise<{ live: FakeLive; client: Client }> {
  const live = await startFakeLive({ cuePoints: [] });
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
  return {
    live,
    client: {
      send,
      barrier: () =>
        new Promise((resolve) => {
          waiting = resolve;
          send(PROBE);
        }),
    },
  };
}

const reports = (messages: OscMessage[]) => messages.map(({ address, args }) => ({ address, args }));

describe('the fake Live start_listen', () => {
  it.each([
    { form: 'the bare address with the property as an argument', address: '/live/song/start_listen', args: ['current_song_time'] },
    { form: 'a property the song does not have', address: '/live/song/start_listen/not_a_property', args: [] },
    { form: 'a name the property table inherits', address: '/live/song/start_listen/toString', args: [] },
  ])('ignores $form, at once and after the playhead moves', async ({ address, args }) => {
    const { live, client } = await start();

    client.send(address, args);
    expect(reports(await client.barrier())).toEqual([]);

    live.setPosition(8);
    expect(reports(await client.barrier())).toEqual([]);
  });

  it('reports current_song_time at once and after the playhead moves, for /live/song/start_listen/current_song_time', async () => {
    const { live, client } = await start();

    client.send('/live/song/start_listen/current_song_time');
    expect(reports(await client.barrier())).toEqual([{ address: '/live/song/get/current_song_time', args: [0] }]);

    live.setPosition(8);
    expect(reports(await client.barrier())).toEqual([{ address: '/live/song/get/current_song_time', args: [8] }]);
  });
});
