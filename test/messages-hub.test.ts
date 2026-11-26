import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { ActiveMessage, BandMessage } from '../src/shared/messages.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

// The producer's messages to the band's devices over real sockets: who each one reaches, the one
// active message per device, Clear, and the active message sent again on every hello. A message on a
// congested link is in hub-coalescing.test.ts, beside the other slow-link cases. That a device hides
// a message it dismissed is the page's work, in e2e/messages.spec.ts.

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - End', time: 16 },
];

const hello = (client: string, name: string) => ({ kind: 'hello', client, name, battery: null });

// The text of the last message frame the client received: the message, null for a clear, or
// undefined before any.
const last = (client: { messages: (BandMessage | null)[] }) => {
  const message = client.messages.at(-1);
  return message === undefined ? undefined : message === null ? null : message.text;
};

async function said<C extends Client | Client<ProducerSnapshot>>(client: C, id: string, name: string): Promise<C> {
  client.send(hello(id, name));
  await client.flush();
  return client;
}

async function stage() {
  rig = await startRig(SET, { playing: false, position: 0 });
  const panel = await said(await rig.connectProducer(), 'panel', 'Producer');
  await panel.snapshot(loaded);
  const leader = await said(await rig.connectLeader(), 'ipad', 'Leader');
  const keys = await said(await rig.connectViewer(), 'keys', 'Keys');
  const bass = await said(await rig.connectViewer(), 'bass', 'Bass');
  // Each hello is answered with the device's active message, none yet.
  await expect.poll(() => [panel, leader, keys, bass].map(last)).toEqual([null, null, null, null]);
  return { panel, leader, keys, bass };
}

async function settled(...clients: (Client | Client<ProducerSnapshot>)[]) {
  for (const client of clients) await client.flush();
}

describe('a message', () => {
  it('to all devices reaches every page that said hello but the producer pages, which list it instead', async () => {
    const { panel, leader, keys, bass } = await stage();
    const booth = await said(await rig!.connectProducer(), 'booth', 'Booth');
    await expect.poll(() => last(booth)).toBeNull();

    panel.send({ kind: 'message', text: 'Hold after this song', to: 'all' });

    await expect.poll(() => [leader, keys, bass].map(last)).toEqual(Array(3).fill('Hold after this song'));
    await settled(panel, booth);
    expect([panel, booth].map(last)).toEqual([null, null]);
  });

  it('to a chosen producer page reaches it', async () => {
    const { panel } = await stage();
    const booth = await said(await rig!.connectProducer(), 'booth', 'Booth');

    panel.send({ kind: 'message', text: 'Watch leader', to: ['booth'] });

    await expect.poll(() => last(booth)).toBe('Watch leader');
  });

  it('to the view-only devices reaches every view-only socket and no leader or producer page', async () => {
    const { panel, leader, keys, bass } = await stage();

    panel.send({ kind: 'message', text: 'Repeat chorus', to: 'viewers' });

    await expect.poll(() => [keys, bass].map(last)).toEqual(['Repeat chorus', 'Repeat chorus']);
    await settled(panel, leader);
    expect([panel, leader].map(last)).toEqual([null, null]);
  });

  it('to chosen devices reaches every socket of each chosen device and no other', async () => {
    const { panel, leader, keys, bass } = await stage();
    // The socket a wake opened before the old one closed: the same device.
    const keysWake = await said(await rig!.connectViewer(), 'keys', 'Keys');

    panel.send({ kind: 'message', text: 'Watch leader', to: ['keys', 'ipad'] });

    await expect.poll(() => [keys, keysWake, leader].map(last)).toEqual(['Watch leader', 'Watch leader', 'Watch leader']);
    await settled(panel, bass);
    expect([panel, bass].map(last)).toEqual([null, null]);
  });

  it('is dropped from a leader or a viewer socket, as is Clear', async () => {
    const { panel, leader, keys } = await stage();
    panel.send({ kind: 'message', text: 'Repeat bridge', to: 'all' });
    await expect.poll(() => last(keys)).toBe('Repeat bridge');
    const before = keys.messages.length;

    leader.send({ kind: 'message', text: 'From the leader', to: 'all' });
    keys.send({ kind: 'message', text: 'From a phone', to: 'all' });
    leader.send({ kind: 'clear-messages' });
    keys.send({ kind: 'clear-messages' });
    await settled(leader, keys);

    expect(keys.messages.length).toBe(before);
    expect(last(keys)).toBe('Repeat bridge');
  });
});

describe('the active message', () => {
  it('is replaced by a second message, one at a time per device', async () => {
    const { panel, keys, bass } = await stage();
    panel.send({ kind: 'message', text: 'Repeat chorus', to: 'viewers' });
    await expect.poll(() => last(bass)).toBe('Repeat chorus');

    panel.send({ kind: 'message', text: 'Watch leader', to: ['keys'] });

    await expect.poll(() => last(keys)).toBe('Watch leader');
    await settled(bass);
    expect(last(bass)).toBe('Repeat chorus');
  });

  it('is sent again on every hello, so a device that reloads or reconnects shows it again', async () => {
    const { panel, keys } = await stage();
    panel.send({ kind: 'message', text: 'Hold after this song', to: ['keys'] });
    await expect.poll(() => last(keys)).toBe('Hold after this song');
    const sent = keys.messages.at(-1);

    keys.close();
    const back = await said(await rig!.connectViewer(), 'keys', 'Keys');
    await expect.poll(() => back.messages).toEqual([sent]);

    // A hello that changes nothing in the list, as a wake's fresh socket sends, still brings it.
    await said(back, 'keys', 'Keys');
    await expect.poll(() => back.messages).toEqual([sent, sent]);
  });

  it('to all devices reaches a device that first connects after the send', async () => {
    const { panel } = await stage();
    panel.send({ kind: 'message', text: 'Repeat bridge', to: 'all' });
    await panel.flush();

    const late = await said(await rig!.connectViewer(), 'late', 'Drums');

    await expect.poll(() => last(late)).toBe('Repeat bridge');
  });

  it('to chosen devices reaches a chosen device that first connects after the send', async () => {
    const { panel } = await stage();
    panel.send({ kind: 'message', text: 'Watch leader', to: ['late'] });
    await panel.flush();

    const late = await said(await rig!.connectViewer(), 'late', 'Drums');

    await expect.poll(() => last(late)).toBe('Watch leader');
  });

  it("to a chosen leader stays its message across a reconnect after a message to the view-only devices", async () => {
    const { panel, leader, keys } = await stage();
    panel.send({ kind: 'message', text: 'Watch leader', to: ['ipad'] });
    await expect.poll(() => last(leader)).toBe('Watch leader');
    panel.send({ kind: 'message', text: 'Repeat chorus', to: 'viewers' });
    await expect.poll(() => last(keys)).toBe('Repeat chorus');

    leader.close();
    const back = await said(await rig!.connectLeader(), 'ipad', 'Leader');

    await expect.poll(() => last(back)).toBe('Watch leader');
  });
});

describe('Clear', () => {
  it('takes the active message off every device it reached, and a device that comes back after it shows none', async () => {
    const { panel, leader, keys, bass } = await stage();
    panel.send({ kind: 'message', text: 'Repeat chorus', to: 'viewers' });
    panel.send({ kind: 'message', text: 'Watch leader', to: ['ipad'] });
    await expect.poll(() => [leader, keys, bass].map(last)).toEqual(['Watch leader', 'Repeat chorus', 'Repeat chorus']);

    panel.send({ kind: 'clear-messages' });

    await expect.poll(() => [leader, keys, bass].map(last)).toEqual([null, null, null]);
    keys.close();
    const back = await said(await rig!.connectViewer(), 'keys', 'Keys');
    await expect.poll(() => back.messages).toEqual([null]);
  });
});

// The producer snapshot's active messages, each as [text, target, the devices that show it].
const listed = (snapshot: ProducerSnapshot) => snapshot.activeMessages.map(({ text, to, shownBy }) => [text, to, shownBy]);

const lists = (expected: unknown[]) => (snapshot: ProducerSnapshot) => JSON.stringify(listed(snapshot)) === JSON.stringify(expected);

describe("the producer page's active messages", () => {
  it('lists each one with its text, its target and its send time, for every target kind', async () => {
    const { panel } = await stage();
    const before = Date.now();

    panel.send({ kind: 'message', text: 'Hold after this song', to: 'all' });
    panel.send({ kind: 'message', text: 'Repeat chorus', to: 'viewers' });
    panel.send({ kind: 'message', text: 'Watch leader', to: ['ipad'] });

    const snapshot = await panel.snapshot((snapshot) => snapshot.activeMessages.length === 3);
    expect(listed(snapshot)).toEqual([
      ['Watch leader', ['ipad'], ['ipad']],
      ['Repeat chorus', 'viewers', ['keys', 'bass']],
      ['Hold after this song', 'all', []],
    ]);
    for (const { sent } of snapshot.activeMessages) expect(sent).toBeGreaterThanOrEqual(before);
    for (const { sent } of snapshot.activeMessages) expect(sent).toBeLessThanOrEqual(Date.now());
  });

  it('shows a newer message that replaces one, and a Clear, at once', async () => {
    const { panel } = await stage();
    panel.send({ kind: 'message', text: 'Repeat chorus', to: ['keys'] });
    await panel.snapshot(lists([['Repeat chorus', ['keys'], ['keys']]]));

    panel.send({ kind: 'message', text: 'Repeat bridge', to: ['keys'] });
    await panel.snapshot(lists([['Repeat bridge', ['keys'], ['keys']]]));

    panel.send({ kind: 'clear-messages' });
    await panel.snapshot(lists([]));
  });

  it('is in the first snapshot of a producer page that reconnects or reloads', async () => {
    const { panel } = await stage();
    panel.send({ kind: 'message', text: 'Watch leader', to: ['ipad'] });
    const shown: ActiveMessage[] = (await panel.snapshot((snapshot) => snapshot.activeMessages.length === 1)).activeMessages;

    panel.close();
    const back = await rig!.connectProducer();

    expect((await back.snapshot()).activeMessages).toEqual(shown);
  });

  it('follows a device that connects, since the list marks the devices that show each one', async () => {
    const { panel } = await stage();
    panel.send({ kind: 'message', text: 'Repeat chorus', to: ['late'] });
    await panel.snapshot(lists([['Repeat chorus', ['late'], []]]));

    await said(await rig!.connectViewer(), 'late', 'Drums');

    await panel.snapshot(lists([['Repeat chorus', ['late'], ['late']]]));
  });
});
