import { readFileSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decode, encode } from '../src/shared/osc.ts';
import { CHURCH_SHOW, RECORDED_SHOW, startFakeEos, type FakeEos } from './fake-eos.ts';

// The fake Eos against its recordings (test/fixtures/eos/), over a raw TCP connection with OSC 1.0
// packet-length framing, as setlist-controller#259 recorded them from Eos 3.3.10. No test reaches a
// real Eos.

let eos: FakeEos | undefined;
let socket: Socket | undefined;

afterEach(async () => {
  socket?.destroy();
  socket = undefined;
  await eos?.close();
  eos = undefined;
});

type Recorded = { dir: 'app->eos' | 'eos->app'; address: string; hex: string };
const recording = (name: string): Recorded[] =>
  (JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/eos', `${name}.json`), 'utf8')) as { packets: Recorded[] }).packets;

// A connection to the fake, and every packet it has sent on it, as hex, in order.
async function connect(fake: FakeEos): Promise<{ packets: string[]; send(hex: string): void }> {
  const packets: string[] = [];
  let pending = Buffer.alloc(0);
  const connection = createConnection({ host: '127.0.0.1', port: fake.port });
  socket = connection;
  connection.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4 && pending.length >= 4 + pending.readInt32BE(0)) {
      packets.push(pending.subarray(4, 4 + pending.readInt32BE(0)).toString('hex'));
      pending = pending.subarray(4 + pending.readInt32BE(0));
    }
  });
  await new Promise<void>((done) => connection.once('connect', () => done()));
  return {
    packets,
    send(hex) {
      const packet = Buffer.from(hex, 'hex');
      const length = Buffer.alloc(4);
      length.writeInt32BE(packet.length);
      connection.write(Buffer.concat([length, packet]));
    },
  };
}

// Waits until the connection has sent at least that many packets.
async function received(connection: { packets: string[] }, count: number): Promise<string[]> {
  await expect.poll(() => connection.packets.length).toBeGreaterThanOrEqual(count);
  return connection.packets;
}

const addressOf = (hex: string) => decode(Buffer.from(hex, 'hex'))!.address;

// Waits for the connect burst, which ends with the command line, /eos/out/cmd, in every recording of it.
async function burst(connection: { packets: string[] }): Promise<string[]> {
  await expect.poll(() => connection.packets.map(addressOf).includes('/eos/out/cmd')).toBe(true);
  return connection.packets;
}

describe('the fake Eos answering a ping', () => {
  it('answers each /eos/ping the lights send with the reply Eos sent, byte for byte (ping.json)', async () => {
    eos = await startFakeEos();
    const ping = recording('ping');
    const connectCount = recording('connect').filter((packet) => packet.dir === 'eos->app').length;
    const connection = await connect(eos);
    await received(connection, connectCount);

    for (const packet of ping.filter((packet) => packet.dir === 'app->eos')) connection.send(packet.hex);

    const replies = ping.filter((packet) => packet.dir === 'eos->app').map((packet) => packet.hex);
    expect((await received(connection, connectCount + replies.length)).slice(connectCount)).toEqual(replies);
  });
});

describe("the fake Eos's connect burst with no current cue", () => {
  const NO_ACTIVE = recording('connect-no-active-cue').filter((packet) => packet.dir === 'eos->app');

  it('is what Eos sent with no cue of cue list 1 active, byte for byte, for the recorded show (connect-no-active-cue.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(RECORDED_SHOW);

    const connection = await connect(eos);

    expect(await burst(connection)).toEqual(NO_ACTIVE.map((packet) => packet.hex));
  });

  it('names no numbered active cue, and fires and stops nothing, in what the lights read of it', async () => {
    eos = await startFakeEos();
    eos.setShow(RECORDED_SHOW);

    const connection = await connect(eos);

    const addresses = (await burst(connection)).map(addressOf);
    expect(addresses.filter((address) => /^\/eos\/out\/(active\/cue\/1\/|event\/cue\/1\/)/.test(address))).toEqual([]);
  });

  it("names the first cue of a show the test gives as the pending cue, as Eos names cue 1/1", async () => {
    eos = await startFakeEos();
    eos.setShow([
      { number: '20', label: 'Way Maker / Outro' },
      { number: '21', label: '' },
    ]);

    const connection = await connect(eos);

    const packets = (await burst(connection)).map((hex) => decode(Buffer.from(hex, 'hex'))!);
    const pending = packets.filter((message) => message.address.startsWith('/eos/out/pending/cue'));
    expect(pending.map((message) => [message.address, message.args])).toEqual([
      ['/eos/out/pending/cue/1/20', []],
      ['/eos/out/pending/cue/text', ['1/20 Way Maker / Outro 5.0']],
      ['/eos/out/pending/cue/1/20', []],
      ['/eos/out/pending/cue/text', ['1/20 Way Maker / Outro 5.0']],
    ]);
  });
});

describe("the fake Eos's Back on the first cue", () => {
  const BACK_FIRST = recording('back-first-cue');

  it('sends what Eos sent for a Back on cue 1 of the recorded show, byte for byte, up to its fire event of cue 0 (back-first-cue.json)', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    eos.follow('1');
    await received(connection, sent + 1);

    for (const packet of BACK_FIRST.filter((packet) => packet.dir === 'app->eos')) connection.send(packet.hex);

    const fireOfCue0 = BACK_FIRST.findIndex((packet) => packet.address === '/eos/out/event/cue/1/0/fire');
    const replies = BACK_FIRST.slice(0, fireOfCue0 + 1).filter((packet) => packet.dir === 'eos->app').map((packet) => packet.hex);
    expect((await received(connection, sent + 1 + replies.length)).slice(sent + 1)).toEqual(replies);
  });

  it('leaves no cue of cue list 1 active, so the next connect burst names no numbered active cue, and a Go then fires the first cue', async () => {
    eos = await startFakeEos();
    const first = await connect(eos);
    await burst(first);
    eos.follow('1');
    first.send(encode('/eos/cues/1/stop', []).toString('hex'));
    await expect.poll(() => first.packets.map(addressOf)).toContain('/eos/out/event/cue/1/0/fire');
    socket?.destroy();

    const second = await connect(eos);
    const addresses = (await burst(second)).map(addressOf);
    expect(addresses.filter((address) => address.startsWith('/eos/out/active/cue/1/'))).toEqual([]);

    const sent = second.packets.length;
    second.send(encode('/eos/cues/1/fire', []).toString('hex'));
    await expect.poll(() => second.packets.slice(sent).map(addressOf)).toContain('/eos/out/event/cue/1/1/fire');
  });
});

describe("the fake Eos holding its answers to Go, Back and a follow", () => {
  it.each([
    { what: 'Go', fires: '/eos/out/event/cue/1/3/fire', act: (fake: FakeEos, send: (hex: string) => void) => send(encode('/eos/cues/1/fire', []).toString('hex')) },
    { what: 'Back', fires: '/eos/out/event/cue/1/1/fire', act: (fake: FakeEos, send: (hex: string) => void) => send(encode('/eos/cues/1/stop', []).toString('hex')) },
    { what: 'a follow', fires: '/eos/out/event/cue/1/3/fire', act: (fake: FakeEos) => fake.follow('3') },
  ])('sends the fire event of $what only once the fires are released, after the fires by number held before it', async ({ fires, act }) => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    eos.holdFires();

    // Cue 2 fired by number, then from it a Go fires 3, a Back 1, and the test's follow 3.
    connection.send(encode('/eos/cue/1/2/fire', []).toString('hex'));
    await expect.poll(() => eos!.received.map((message) => message.address)).toContain('/eos/cue/1/2/fire');
    act(eos, connection.send);
    // A ping is answered at once, so once its reply comes every answer before it has been held.
    connection.send(encode('/eos/ping', []).toString('hex'));
    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toEqual(['/eos/out/ping']);

    eos.releaseFires();
    await expect.poll(() => connection.packets.slice(sent + 1).map(addressOf)).toEqual(['/eos/out/event/cue/1/2/fire', fires]);
  });
});

describe('the fake Eos editing its show while connected', () => {
  const KEYPAD = recording('cue-edit-at-keypad-subscribed');
  const SUBSCRIBE = KEYPAD.find((packet) => packet.dir === 'app->eos' && packet.address === '/eos/subscribe')!;
  const NOTIFIES = KEYPAD.filter((packet) => packet.address.startsWith('/eos/out/notify/')).map((packet) => packet.hex);
  const WITH_900 = [...RECORDED_SHOW, { number: '900', label: '' }];

  it('sends a subscribed connection the notify pair Eos sent for each cue edit, byte for byte, the sequence counting up across both (cue-edit-at-keypad-subscribed.json)', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    connection.send(SUBSCRIBE.hex);
    await expect.poll(() => eos!.received.map((message) => message.address)).toContain('/eos/subscribe');

    // Record Cue 1 / 900, then Delete Cue 1 / 900, as Nick did at the keypad.
    eos.editShow(WITH_900, { notify: 900 });
    eos.editShow(RECORDED_SHOW, { notify: 900 });

    const packets = (await received(connection, sent + NOTIFIES.length + 4)).slice(sent);
    expect(packets.filter((hex) => addressOf(hex).startsWith('/eos/out/notify/'))).toEqual(NOTIFIES);
  });

  it('sends a connection that never subscribed, or stopped with /eos/subscribe 0, no notify', async () => {
    eos = await startFakeEos();
    const never = await connect(eos);
    await burst(never);
    const stopped = await connect(eos);
    const sent = (await burst(stopped)).length;
    stopped.send(SUBSCRIBE.hex);
    stopped.send(encode('/eos/subscribe', [{ int: 0 }]).toString('hex'));
    await expect.poll(() => eos!.received.filter((message) => message.address === '/eos/subscribe')).toHaveLength(2);

    eos.editShow(WITH_900, { notify: 900 });
    // A ping is answered at once, so once its reply comes no notify was sent before it.
    never.send(encode('/eos/ping', []).toString('hex'));
    stopped.send(encode('/eos/ping', []).toString('hex'));
    await expect.poll(() => stopped.packets.slice(sent).map(addressOf).filter((address) => address.startsWith('/eos/out/notify/') || address === '/eos/out/ping')).toEqual(['/eos/out/ping']);
    await expect.poll(() => never.packets.map(addressOf).filter((address) => address.startsWith('/eos/out/notify/') || address === '/eos/out/ping')).toEqual(['/eos/out/ping']);
  });

  it('keeps its current cue through an edit, so a Go fires the cue after it in the edited show, and sends nothing for an edit Eos does not notify', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    connection.send(SUBSCRIBE.hex);
    eos.follow('3');
    await received(connection, sent + 1);

    // Cue 3.5 deleted while the show stays on cue 3.
    eos.editShow(
      RECORDED_SHOW.filter((cue) => cue.number !== '3.5'),
      { notify: false },
    );
    connection.send(encode('/eos/cues/1/fire', []).toString('hex'));

    await expect.poll(() => connection.packets.slice(sent + 1).map(addressOf)).toEqual(['/eos/out/event/cue/1/4/fire']);
  });

  it('moves its current cue onto the cue before once an edit deletes it, as Eos does, so the next connect burst names that cue (cue-edit-at-console.json)', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;

    eos.editShow(
      RECORDED_SHOW.filter((cue) => cue.number !== '8'),
      { notify: false },
    );

    expect((await received(connection, sent + 2)).slice(sent)).toEqual([encode('/eos/out/previous/cue/1/6', []), encode('/eos/out/active/cue/1/7', [1.0])].map((packet) => packet.toString('hex')));
    const addresses = (await burst(await connect(eos))).map(addressOf);
    expect([...new Set(addresses.filter((address) => address.startsWith('/eos/out/active/cue/1/')))]).toEqual(['/eos/out/active/cue/1/7']);
  });

  it('puts a cue recorded at the console in number order and moves its current cue onto it, as Eos does, so a Go fires the cue after it (cue-edit-at-console-subscribed.json)', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    eos.follow('3');
    await received(connection, sent + 1);

    eos.editShow([{ number: '3.7', label: 'Goodness of God / Tag' }, ...RECORDED_SHOW], { notify: false });
    connection.send(encode('/eos/cues/1/fire', []).toString('hex'));

    await expect.poll(() => connection.packets.slice(sent + 1).map(addressOf)).toEqual(['/eos/out/previous/cue/1/3.5', '/eos/out/active/cue/1/3.7', '/eos/out/event/cue/1/4/fire']);
  });

  it('moves its current cue to the new number once an edit moves it, as Eos does, with no previous cue (cue-edit-at-console-subscribed.json)', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    eos.follow('3');
    await received(connection, sent + 1);

    eos.editShow(
      RECORDED_SHOW.map((cue) => (cue.number === '3' ? { ...cue, number: '3.7' } : cue)),
      { notify: false },
    );
    connection.send(encode('/eos/cues/1/fire', []).toString('hex'));

    await expect.poll(() => connection.packets.slice(sent + 1).map(addressOf)).toEqual(['/eos/out/active/cue/1/3.7', '/eos/out/event/cue/1/4/fire']);
  });

  it('holds back every notify once told to, and sends them in order on release', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    connection.send(SUBSCRIBE.hex);
    await expect.poll(() => eos!.received.map((message) => message.address)).toContain('/eos/subscribe');
    eos.holdNotifies();

    eos.editShow(WITH_900, { notify: 900 });
    eos.editShow(RECORDED_SHOW, { notify: 900 });
    connection.send(encode('/eos/ping', []).toString('hex'));
    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toEqual(['/eos/out/previous/cue/1/8', '/eos/out/active/cue/1/900', '/eos/out/previous/cue/1/7', '/eos/out/active/cue/1/8', '/eos/out/ping']);

    eos.releaseNotifies();
    expect((await received(connection, sent + 5 + NOTIFIES.length)).slice(sent + 5)).toEqual(NOTIFIES);
  });
});

describe('the fake Eos holding its answers to a cue list read', () => {
  it('answers a read held back only once released, from the show as it is then', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    eos.holdReads();

    connection.send(encode('/eos/get/cue/1/count', []).toString('hex'));
    connection.send(encode('/eos/ping', []).toString('hex'));
    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toEqual(['/eos/out/ping']);
    eos.setShow(RECORDED_SHOW.slice(0, 2));
    eos.releaseReads();

    await expect.poll(() => connection.packets.slice(sent + 1).map((hex) => decode(Buffer.from(hex, 'hex'))).map((message) => [message!.address, message!.args])).toEqual([['/eos/out/get/cue/1/count', [2]]]);
  });
});

// A link to a cue in another list is a string in argument 19 of the list reply, "99/1" for cue 1 of
// list 99, where a link in the same list is an int (link-to-another-list.json). What a Go from such a
// cue fires is not recorded, so the fake takes a stand-in: the linked cue's fire event in its own list.
describe("the fake Eos's link to a cue in another list", () => {
  const LINKED_OUT = RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link: '99/1' } : cue));

  it('gives the link as an OSC string in argument 19 of the list reply, as Eos gave it (link-to-another-list.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(LINKED_OUT);
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;

    connection.send(encode('/eos/get/cue/1/count', []).toString('hex'));
    connection.send(encode('/eos/get/cue/1/index', [{ int: 4 }]).toString('hex'));

    const list = async () => {
      await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/get/cue/1/4/0/list/0/31');
      return decode(Buffer.from(connection.packets.slice(sent).find((hex) => addressOf(hex) === '/eos/out/get/cue/1/4/0/list/0/31')!, 'hex'))!;
    };
    const reply = await list();
    expect(reply.args[19]).toBe('99/1');
    expect(reply.types[19]).toBe('s');
  });

  it('answers a Go from that cue with the fire event of the linked cue in its list and none of list 1, and stays on the cue', async () => {
    eos = await startFakeEos();
    eos.setShow(LINKED_OUT);
    const first = await connect(eos);
    const sent = (await burst(first)).length;
    eos.follow('4');
    await received(first, sent + 1);

    first.send(encode('/eos/cues/1/fire', []).toString('hex'));
    first.send(encode('/eos/ping', []).toString('hex'));

    await expect.poll(() => first.packets.slice(sent + 1).map(addressOf)).toContain('/eos/out/ping');
    const answers = first.packets.slice(sent + 1).map((hex) => decode(Buffer.from(hex, 'hex'))!);
    expect(answers.map((message) => [message.address, message.args])).toEqual([
      ['/eos/out/event/cue/99/1/fire', ['']],
      ['/eos/out/ping', []],
    ]);
    socket?.destroy();

    const second = await connect(eos);
    const addresses = (await burst(second)).map(addressOf);
    expect(new Set(addresses.filter((address) => address.startsWith('/eos/out/active/cue/1/')))).toEqual(new Set(['/eos/out/active/cue/1/4']));
  });

  it('answers a Go from a cue whose string link names a cue of list 1 as an int link, with that cue', async () => {
    eos = await startFakeEos();
    eos.setShow(RECORDED_SHOW.map((cue) => (cue.number === '4' ? { ...cue, link: '1/3' } : cue)));
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    eos.follow('4');
    await received(connection, sent + 1);

    connection.send(encode('/eos/cues/1/fire', []).toString('hex'));

    await expect.poll(() => connection.packets.slice(sent + 1).map(addressOf)).toEqual(['/eos/out/event/cue/1/3/fire']);
  });
});

// What the lights step of the set build asks of Eos (setlist-controller#500), each answer against its recording of
// 2026-11-12 (test/fixtures/eos/README.md, "The lights step on the church show"). The recorded paths name Nick's own show
// folder: they are strings the fake compares and sends, and it opens no file.
describe("the fake Eos's open show path", () => {
  const SHOW_PATH = recording('show-path');
  const RECORDED_PATH = '/Users/nick/Documents/ETC/Colour test recording 2026-11-12 15-40-53.esf3d';

  it('answers /eos/get/show/path with the path the test gives, as Eos answered it, byte for byte (show-path.json)', async () => {
    eos = await startFakeEos();
    expect(eos.showPath()).toBeNull();
    eos.setShowPath(RECORDED_PATH);
    expect(eos.showPath()).toBe(RECORDED_PATH);
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;

    connection.send(SHOW_PATH.find((packet) => packet.dir === 'app->eos' && packet.address === '/eos/get/show/path')!.hex);

    const reply = SHOW_PATH.find((packet) => packet.address === '/eos/out/get/show/path')!;
    expect(decode(Buffer.from(reply.hex, 'hex'))!.args).toEqual([RECORDED_PATH]);
    expect((await received(connection, sent + 1)).slice(sent)).toEqual([reply.hex]);
  });
});

describe('the fake Eos setting a cue label over OSC', () => {
  const LABEL_SET = recording('cue-label-set');
  const SUBSCRIBE = LABEL_SET.find((packet) => packet.dir === 'app->eos' && packet.address === '/eos/subscribe')!;
  const SET = LABEL_SET.find((packet) => packet.dir === 'app->eos' && packet.address === '/eos/set/cue/1/1/label')!;
  const NOTIFIES = LABEL_SET.filter((packet) => packet.address.startsWith('/eos/out/notify/')).map((packet) => packet.hex);
  // The labels of cue list 1, each beside its cue's number, as a read of the list by count and index gives them.
  async function readLabels(connection: { packets: string[]; send(hex: string): void }, count: number): Promise<[string, unknown][]> {
    const from = connection.packets.length;
    connection.send(encode('/eos/get/cue/1/count', []).toString('hex'));
    for (let index = 0; index < count; index += 1) connection.send(encode('/eos/get/cue/1/index', [{ int: index }]).toString('hex'));
    const lists = () =>
      connection.packets
        .slice(from)
        .map((hex) => decode(Buffer.from(hex, 'hex'))!)
        .filter((message) => /^\/eos\/out\/get\/cue\/1\/[^/]+\/0\/list\/0\/\d+$/.test(message.address));
    await expect.poll(() => lists().length).toBe(count);
    return lists().map((message) => [message.address.split('/')[6]!, message.args[2]]);
  }

  it('gives the set no direct answer, sends a subscribed connection the notify pair Eos sent, byte for byte, and holds the label from then on (cue-label-set.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(CHURCH_SHOW);
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    connection.send(SUBSCRIBE.hex);

    connection.send(SET.hex);
    // A ping is answered at once, so everything the set gave came before its reply.
    connection.send(encode('/eos/ping', []).toString('hex'));

    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    expect(connection.packets.slice(sent)).toEqual([...NOTIFIES, encode('/eos/out/ping', []).toString('hex')]);
    expect(eos.cues().map(({ number, label }) => [number, label])).toEqual([
      ['0.5', 'Walk-in'],
      ['1', 'Test Song A'],
      ['11', 'Song 2'],
      ['22', 'Song 3'],
      ['35', 'Closing'],
      ['36', 'Meet and greet'],
      ['37', 'Speaker'],
      ['38', 'Walk-out'],
    ]);
    expect((await readLabels(connection, 8))[1]).toEqual(['1', 'Test Song A']);
  });

  it('sets the label of a cue with a decimal number, and names it in the notify as a string, as Eos names a decimal cue', async () => {
    eos = await startFakeEos();
    eos.setShow(CHURCH_SHOW);
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    connection.send(SUBSCRIBE.hex);

    connection.send(encode('/eos/set/cue/1/0.5/label', ['Doors']).toString('hex'));

    await expect.poll(() => connection.packets.slice(sent).length).toBe(2);
    expect(connection.packets.slice(sent).map((hex) => decode(Buffer.from(hex, 'hex'))!).map((message) => [message.address, message.args, message.types])).toEqual([
      ['/eos/out/notify/cue/1/list/0/2', [0, '0.5'], 'is'],
      ['/eos/out/notify/cuelist/list/0/2', [1, 1], 'ii'],
    ]);
    expect((await readLabels(connection, 8))[0]).toEqual(['0.5', 'Doors']);
  });

  it('changes nothing and notifies nothing for a cue its show does not hold, or a label that is no string', async () => {
    eos = await startFakeEos();
    eos.setShow(CHURCH_SHOW);
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    connection.send(SUBSCRIBE.hex);

    connection.send(encode('/eos/set/cue/1/99/label', ['No such cue']).toString('hex'));
    connection.send(encode('/eos/set/cue/1/1/label', [{ int: 7 }]).toString('hex'));
    connection.send(encode('/eos/set/cue/2/1/label', ['Another list']).toString('hex'));
    connection.send(encode('/eos/ping', []).toString('hex'));

    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    expect(connection.packets.slice(sent).map(addressOf)).toEqual(['/eos/out/ping']);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
  });

  it('takes a label set held back without a word: the cue keeps its label, and no notify is sent', async () => {
    eos = await startFakeEos();
    eos.setShow(CHURCH_SHOW);
    eos.holdLabels();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    connection.send(SUBSCRIBE.hex);

    connection.send(SET.hex);
    connection.send(encode('/eos/ping', []).toString('hex'));

    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    expect(connection.packets.slice(sent).map(addressOf)).toEqual(['/eos/out/ping']);
    expect(eos.cues()).toEqual(CHURCH_SHOW);
    expect(eos.received.map((message) => message.address)).toContain('/eos/set/cue/1/1/label');
  });

  it('sets a label in the recorded show too, and leaves its current cue where it was', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    await burst(connection);

    connection.send(encode('/eos/set/cue/1/3/label', ['Goodness of God']).toString('hex'));

    await expect.poll(() => eos!.cues().find((cue) => cue.number === '3')?.label).toBe('Goodness of God');
    expect(eos.cues().map((cue) => cue.label)).toEqual(RECORDED_SHOW.map((cue) => (cue.number === '3' ? 'Goodness of God' : cue.label)));
    const addresses = (await burst(await connect(eos))).map(addressOf);
    expect([...new Set(addresses.filter((address) => address.startsWith('/eos/out/active/cue/1/')))]).toEqual(['/eos/out/active/cue/1/8']);
  });
});

describe("the fake Eos's church show", () => {
  it('is cue list 1 of the template show file, three song cues among its eight, with the cue numbers of the recorded church show', async () => {
    eos = await startFakeEos();
    eos.setShow(CHURCH_SHOW);

    expect(eos.cues()).toEqual([
      { number: '0.5', label: 'Walk-in' },
      { number: '1', label: 'Song 1' },
      { number: '11', label: 'Song 2' },
      { number: '22', label: 'Song 3' },
      { number: '35', label: 'Closing' },
      { number: '36', label: 'Meet and greet' },
      { number: '37', label: 'Speaker' },
      { number: '38', label: 'Walk-out' },
    ]);
  });

  it('gives the recorded show as its cues until a test gives it another', async () => {
    eos = await startFakeEos();

    expect(eos.cues()).toEqual(RECORDED_SHOW);
  });
});

describe('the fake Eos saving its show', () => {
  const SAVE = recording('show-save');
  const KEYS = SAVE.filter((packet) => packet.dir === 'app->eos' && packet.address.startsWith('/eos/key/'));
  const RECORDED_PATH = '/Users/nick/Documents/ETC/Colour test recording 2026-11-12 15-40-53.esf3d';
  const key = (name: 'shift' | 'update', down: 0 | 1) => encode(`/eos/key/${name}`, [down]).toString('hex');
  const ping = encode('/eos/ping', []).toString('hex');
  const pathRead = encode('/eos/get/show/path', []).toString('hex');
  const lastPath = (packets: string[]) => decode(Buffer.from(packets.at(-1)!, 'hex'))!.args[0] as string;

  it('saves on Update with Shift held, sends the show name and the saved event Eos sent, byte for byte, and its path then names a new file of the same show (show-save.json)', async () => {
    eos = await startFakeEos();
    eos.setShowPath(RECORDED_PATH);
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;
    expect(KEYS.map((packet) => [packet.address, decode(Buffer.from(packet.hex, 'hex'))!.args])).toEqual([
      ['/eos/key/shift', [1]],
      ['/eos/key/update', [1]],
      ['/eos/key/update', [0]],
      ['/eos/key/shift', [0]],
    ]);

    for (const packet of KEYS) connection.send(packet.hex);
    connection.send(ping);

    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    const answers = SAVE.filter((packet) => packet.dir === 'eos->app' && (packet.address === '/eos/out/show/name' || packet.address === '/eos/out/event/show/saved'));
    expect(answers.map((packet) => decode(Buffer.from(packet.hex, 'hex'))!.args)).toEqual([['Colour test recording'], ['/Users/nick/Documents/ETC/Colour test recording.esf3d']]);
    expect(connection.packets.slice(sent)).toEqual([...answers.map((packet) => packet.hex), encode('/eos/out/ping', []).toString('hex')]);
    expect(eos.saves()).toBe(1);
    connection.send(pathRead);
    const path = lastPath(await received(connection, sent + 4));
    // The same folder and show name, with the time of the save, in Eos's form, where the time of the open file was.
    expect(path).toMatch(/^\/Users\/nick\/Documents\/ETC\/Colour test recording \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.esf3d$/);
    expect(path > RECORDED_PATH, path).toBe(true);
    expect(eos.showPath()).toBe(path);
  });

  it('names a save time at least one second after the time in the open file name, so a save never keeps the path it had', async () => {
    eos = await startFakeEos();
    eos.setShowPath('/shows/Church Sunday 2026-10-18 2099-12-31 23-59-59.esf3d');
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;

    connection.send(key('shift', 1));
    connection.send(key('update', 1));
    connection.send(pathRead);

    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/get/show/path');
    expect(connection.packets.slice(sent).map((hex) => decode(Buffer.from(hex, 'hex'))!).map((message) => [message.address, message.args])).toEqual([
      ['/eos/out/show/name', ['Church Sunday 2026-10-18']],
      ['/eos/out/event/show/saved', ['/shows/Church Sunday 2026-10-18.esf3d']],
      ['/eos/out/get/show/path', ['/shows/Church Sunday 2026-10-18 2100-01-01 00-00-00.esf3d']],
    ]);
  });

  it('saves nothing on Update without Shift, on a key release, or once Shift is released', async () => {
    eos = await startFakeEos();
    eos.setShowPath(RECORDED_PATH);
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;

    for (const hex of [key('update', 1), key('update', 0), key('shift', 1), key('update', 0), key('shift', 0), key('update', 1), key('update', 0), pathRead, ping]) connection.send(hex);

    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    expect(connection.packets.slice(sent).map((hex) => decode(Buffer.from(hex, 'hex'))!).map((message) => [message.address, message.args])).toEqual([
      ['/eos/out/get/show/path', [RECORDED_PATH]],
      ['/eos/out/ping', []],
    ]);
    expect(eos.saves()).toBe(0);
  });

  it('takes a save held back without a word: no show name and no saved event', async () => {
    eos = await startFakeEos();
    eos.setShowPath(RECORDED_PATH);
    eos.holdSaves();
    const connection = await connect(eos);
    const sent = (await burst(connection)).length;

    for (const packet of KEYS) connection.send(packet.hex);
    connection.send(ping);

    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    expect(connection.packets.slice(sent).map(addressOf)).toEqual(['/eos/out/ping']);
    expect(eos.saves()).toBe(1);
  });
});

describe("the fake Eos's command line", () => {
  // The line the first --wrap run of 2026-11-02 stopped on (test/fixtures/eos/README.md): the Cue List Index had left
  // the command line in Blind.
  const BLIND = 'BLIND: Cue  1 / : Cue 1 / Back From First Wrap #';

  it("puts the line a test gives in the connect burst's /eos/out/cmd and /eos/out/user/1/cmd, and leaves every other packet as recorded", async () => {
    eos = await startFakeEos();
    eos.setCommandLine(BLIND);
    const recorded = recording('connect').filter((packet) => packet.dir === 'eos->app');

    const packets = await burst(await connect(eos));

    const lines = ['/eos/out/cmd', '/eos/out/user/1/cmd'];
    expect(packets.filter((hex) => !lines.includes(addressOf(hex)))).toEqual(recorded.filter((packet) => !lines.includes(packet.address)).map((packet) => packet.hex));
    expect(packets.map((hex) => decode(Buffer.from(hex, 'hex'))!).filter((message) => lines.includes(message.address)).map((message) => [message.address, message.args, message.types])).toEqual([
      ['/eos/out/user/1/cmd', [BLIND, 0], 'si'],
      ['/eos/out/cmd', [BLIND, 0], 'si'],
    ]);
  });

  it('puts it in the burst of a show with no cue active too', async () => {
    eos = await startFakeEos();
    eos.setShow(CHURCH_SHOW);
    eos.setCommandLine(BLIND);

    const packets = (await burst(await connect(eos))).map((hex) => decode(Buffer.from(hex, 'hex'))!);

    expect(packets.find((message) => message.address === '/eos/out/cmd')?.args).toEqual([BLIND, 0]);
  });
});

// Copy To, the command the lights step makes a song cue with for a song past the last song cue, against its two
// recordings of 2026-11-12 (cue-copy-to.json, cue-copy-to-decimal.json; test/fixtures/eos/README.md, "The lights step
// on the church show"). What the copy holds as its own, and what the fake answers a Copy To that Eos would not take,
// are a model: no recording holds either.
describe("the fake Eos's Copy To", () => {
  // The church show with the labels its cues had before the label set of 2026-11-12, and levels that make channel 16
  // read in 1/22 what cue-copy-to.json read there.
  const churchShow = () => CHURCH_SHOW.map((cue) => ({ ...cue, label: { '1': 'Ancient Gates', '11': 'Holy Forever', '22': 'Worthy Of It All' }[cue.number] ?? cue.label }));
  const LEVELS = { '1': { 16: { intensity: 72, colour: [50.48, 50.78, 100] as [number, number, number] } }, '22': { 16: { intensity: 62 } } };
  const hex = (address: string, args: Parameters<typeof encode>[1] = []) => encode(address, args).toString('hex');
  const readable = (packets: string[]) => packets.map((packet) => decode(Buffer.from(packet, 'hex'))!).map((message) => [message.address, ...message.args]);
  // The packets a recording sent to that address, and the ones Eos sent on the addresses that match, each in order.
  const sentIn = (name: string, address: string) => recording(name).filter((packet) => packet.dir === 'app->eos' && packet.address === address).map((packet) => packet.hex);
  const answeredIn = (name: string, addresses: RegExp) => recording(name).filter((packet) => packet.dir === 'eos->app' && addresses.test(packet.address)).map((packet) => packet.hex);
  const LINES_AND_NOTIFIES = /^\/eos\/out\/(user\/1\/cmd|cmd|notify\/.*)$/;
  type Connection = { packets: string[]; send(hex: string): void };

  // Sends those packets, in order, and gives every packet the fake sent for them: a ping is answered at once, so what
  // came before its reply is all of it.
  async function exchange(connection: Connection, packets: string[]): Promise<string[]> {
    const sent = connection.packets.length;
    for (const packet of packets) connection.send(packet);
    connection.send(hex('/eos/ping'));
    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    return connection.packets.slice(sent, -1);
  }

  // The fake on the church show, with a connection that subscribed and has had one notified edit, the label set of
  // cue-label-set.json, as the connection of each recording had before its copy.
  async function subscribedAfterOneEdit(): Promise<Connection> {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.setLevels(LEVELS);
    const connection = await connect(eos);
    await burst(connection);
    await exchange(connection, [...sentIn('cue-copy-to', '/eos/subscribe').slice(0, 1), ...sentIn('cue-label-set', '/eos/set/cue/1/1/label')]);
    return connection;
  }

  it('makes the new cue with the command line Eos sent, which names the new cue and asks for no confirmation, and the notify pair, byte for byte, and the copy then reads as its source (cue-copy-to.json)', async () => {
    const connection = await subscribedAfterOneEdit();
    const [copy, goTo] = sentIn('cue-copy-to', '/eos/newcmd');

    const answers = await exchange(connection, [copy!]);

    expect(readable(answers)).toEqual([
      ['/eos/out/user/1/cmd', 'LIVE: Cue  23 : Cue 1 / 22 Copy To Cue 1 / 23 #', 0],
      ['/eos/out/cmd', 'LIVE: Cue  23 : Cue 1 / 22 Copy To Cue 1 / 23 #', 0],
      ['/eos/out/notify/cue/1/list/0/2', 2, 23],
      ['/eos/out/notify/cuelist/list/0/2', 3, 1],
    ]);
    expect(answers).toEqual(answeredIn('cue-copy-to', LINES_AND_NOTIFIES).slice(0, 4));
    expect(eos!.cues().map(({ number, label }) => [number, label])).toEqual([
      ['0.5', 'Walk-in'],
      ['1', 'Test Song A'],
      ['11', 'Holy Forever'],
      ['22', 'Worthy Of It All'],
      ['23', 'Worthy Of It All'],
      ['35', 'Closing'],
      ['36', 'Meet and greet'],
      ['37', 'Speaker'],
      ['38', 'Walk-out'],
    ]);
    // After a Go To Cue 1/23, channel 16 reads 1/22's levels: intensity 62, red 50.48, green 50.78 and blue 100. The
    // fake sends the fire event before the command line, as channel-params.json has them, so the order is not compared.
    const read = await exchange(connection, [goTo!, ...sentIn('cue-copy-to', '/eos/get/params/16')]);
    const recorded = [...answeredIn('cue-copy-to', /^\/eos\/out\/(user\/1\/cmd|cmd)$/).slice(2), ...answeredIn('cue-copy-to', /^\/eos\/out\/(event\/cue\/1\/23\/fire|get\/params\/16)$/)];
    expect(readable(read.toSorted())).toEqual(readable(recorded.toSorted()));
    expect(read.toSorted()).toEqual(recorded.toSorted());
    expect(eos!.levels()['23']).toEqual(eos!.levels()['22']);
  });

  it('copies onto a decimal number the same way, names the cue in the notify as a string, and lists the copy between its neighbours with the label of its source (cue-copy-to-decimal.json)', async () => {
    const connection = await subscribedAfterOneEdit();

    const answers = await exchange(connection, sentIn('cue-copy-to-decimal', '/eos/newcmd'));

    expect(readable(answers)).toEqual([
      ['/eos/out/user/1/cmd', 'LIVE: Cue  22.5 : Cue 1 / 22 Copy To Cue 1 / 22.5 #', 0],
      ['/eos/out/cmd', 'LIVE: Cue  22.5 : Cue 1 / 22 Copy To Cue 1 / 22.5 #', 0],
      ['/eos/out/notify/cue/1/list/0/2', 2, '22.5'],
      ['/eos/out/notify/cuelist/list/0/2', 3, 1],
    ]);
    expect(answers).toEqual(answeredIn('cue-copy-to-decimal', LINES_AND_NOTIFIES));
    // The count is 9, and by index the list holds 1/22.5 at 4, between 1/22 at 3 and 1/35 at 5: each cue's reply
    // address, its index and its label, as recorded. The recording's first list reply is of a read by number, index -1.
    const listed = (packets: string[]) =>
      readable(packets)
        .filter(([address, index]) => /^\/eos\/out\/get\/cue\/1\/[^/]+\/0\/list\/0\/31$/.test(String(address)) && index !== -1)
        .map(([address, index, , label]) => [address, index, label]);
    const reads = await exchange(connection, [...sentIn('cue-copy-to-decimal', '/eos/get/cue/1/count'), ...sentIn('cue-copy-to-decimal', '/eos/get/cue/1/index')]);
    expect(reads[0]).toBe(answeredIn('cue-copy-to-decimal', /^\/eos\/out\/get\/cue\/1\/count$/)[0]);
    expect(readable(reads.slice(0, 1))).toEqual([['/eos/out/get/cue/1/count', 9]]);
    expect(listed(reads)).toEqual(listed(answeredIn('cue-copy-to-decimal', /^\/eos\/out\/get\/cue\//)));
    expect(listed(reads).slice(3, 6)).toEqual([
      ['/eos/out/get/cue/1/22/0/list/0/31', 3, 'Worthy Of It All'],
      ['/eos/out/get/cue/1/22.5/0/list/0/31', 4, 'Worthy Of It All'],
      ['/eos/out/get/cue/1/35/0/list/0/31', 5, 'Closing'],
    ]);
  });

  it('sends a connection that did not subscribe the command line alone, and leaves the current cue where it was, so the next connect burst names it', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    const connection = await connect(eos);
    await burst(connection);
    await exchange(connection, [hex('/eos/newcmd', ['Go_To_Cue 1 / 22 Time 0#'])]);

    const answers = await exchange(connection, sentIn('cue-copy-to', '/eos/newcmd').slice(0, 1));

    expect(readable(answers)).toEqual([
      ['/eos/out/user/1/cmd', 'LIVE: Cue  23 : Cue 1 / 22 Copy To Cue 1 / 23 #', 0],
      ['/eos/out/cmd', 'LIVE: Cue  23 : Cue 1 / 22 Copy To Cue 1 / 23 #', 0],
    ]);
    expect(eos.cues()).toHaveLength(9);
    const addresses = (await burst(await connect(eos))).map(addressOf);
    expect([...new Set(addresses.filter((address) => address.startsWith('/eos/out/active/cue/1/')))]).toEqual(['/eos/out/active/cue/1/22']);
  });

  // A model, not a recording, but for the follow: the recordings read a copy that sat straight after its source, on one
  // channel, and one recording holds a copy of a cue with a follow (chain-copy-to-follow.json, in the cases of a song cue
  // with a follow or a hang below). A copy of a cue with a hang or a link is not recorded.
  it("gives the copy its source's link, follow and hang, and on every channel the levels its source reads, wherever the copy sits; where they are what tracks into its place it holds none of its own, so a colour recorded into the cue before it tracks into it", async () => {
    eos = await startFakeEos();
    eos.setShow(CHURCH_SHOW.map((cue) => (cue.number === '11' ? { ...cue, link: 35, follow: 4000, hang: 1500 } : cue)));
    eos.setLevels({
      '1': { 1: { intensity: 50, colour: [10, 20, 30] }, 2: { intensity: 55, colour: [40, 50, 60] }, 24: { intensity: 75 } },
      '11': { 1: { intensity: 70 } },
      '22': { 1: { intensity: 80, colour: [1, 2, 3] }, 24: { intensity: 20 } },
    });
    eos.setRecordConfirm(false);
    const connection = await connect(eos);
    await burst(connection);
    const before = eos.levels();

    await exchange(connection, [hex('/eos/newcmd', ['Cue 1 / 11 Copy_To Cue 1 / 23#']), hex('/eos/newcmd', ['Cue 1 / 22 Copy_To Cue 1 / 22.5#'])]);

    expect(eos.cues().map(({ number }) => number)).toEqual(['0.5', '1', '11', '22', '22.5', '23', '35', '36', '37', '38']);
    expect(eos.cues().find((cue) => cue.number === '23')).toEqual({ number: '23', label: 'Song 2', link: 35, follow: 4000, hang: 1500 });
    // Cue 23 sits after 1/22 and 1/22.5, which read otherwise on channels 1 and 24, and reads as 1/11 all the same.
    expect(eos.levels()['23']).toEqual(before['11']);
    expect(eos.levels()['23']).toEqual({ 1: { intensity: 70, colour: [10, 20, 30] }, 2: { intensity: 55, colour: [40, 50, 60] }, 24: { intensity: 75 } });
    expect(eos.levels()['22.5']).toEqual(before['22']);
    for (const cue of Object.keys(before).filter((number) => Number(number) < 23)) expect(eos.levels()[cue], `cue ${cue}`).toEqual(before[cue]);
    // A new colour recorded into 1/22 shows in 1/22.5, which holds none of its own, and not in 1/23, which holds 1/11's.
    await exchange(connection, [hex('/eos/newcmd', ['Go_To_Cue 1 / 22 Time 0#']), hex('/eos/chan/1/param/red/green/blue', [90, 80, 70]), hex('/eos/newcmd', ['Chan 1 Record_Only Cue 1 / 22#'])]);
    expect(eos.levels()['22']![1]!.colour).toEqual([90, 80, 70]);
    expect(eos.levels()['22.5']![1]!.colour).toEqual([90, 80, 70]);
    expect(eos.levels()['23']![1]!.colour).toEqual([10, 20, 30]);
  });

  // Not recorded: no recording holds a Copy To that Eos did not take. The fake answers it as any command it does not
  // know.
  it.each([
    { name: 'from a cue the show does not hold', text: 'Cue 1 / 23 Copy_To Cue 1 / 24#', line: 'Cue 1 / 23 Copy To Cue 1 / 24', reject: false },
    { name: 'onto a number a cue of the show has', text: 'Cue 1 / 22 Copy_To Cue 1 / 35#', line: 'Cue 1 / 22 Copy To Cue 1 / 35', reject: false },
    { name: 'a test told it to reject', text: 'Cue 1 / 22 Copy_To Cue 1 / 23#', line: 'Cue 1 / 22 Copy To Cue 1 / 23', reject: true },
  ])('answers a Copy To $name with the syntax error it gives any command it does not take, and copies and notifies nothing', async ({ text, line, reject }) => {
    const connection = await subscribedAfterOneEdit();
    const cues = eos!.cues();
    const levels = eos!.levels();
    if (reject) eos!.rejectCommands(/Copy_To/);

    const answers = await exchange(connection, [hex('/eos/newcmd', [text])]);

    expect(readable(answers)).toEqual([
      ['/eos/out/user/1/cmd', `LIVE: Cue   : ${line} - Error: Syntax Error`, 1],
      ['/eos/out/cmd', `LIVE: Cue   : ${line} - Error: Syntax Error`, 1],
    ]);
    expect(eos!.cues()).toEqual(cues);
    expect(eos!.levels()).toEqual(levels);
  });

  it('takes a Copy To held back with its command line alone: the show keeps its cues, and no notify is sent', async () => {
    const connection = await subscribedAfterOneEdit();
    const cues = eos!.cues();
    eos!.holdCopies();

    const answers = await exchange(connection, sentIn('cue-copy-to', '/eos/newcmd').slice(0, 1));

    expect(answers).toEqual(answeredIn('cue-copy-to', /^\/eos\/out\/(user\/1\/cmd|cmd)$/).slice(0, 2));
    expect(eos!.cues()).toEqual(cues);
    expect(eos!.received.map((message) => message.args[0])).toContain('Cue 1 / 22 Copy_To Cue 1 / 23#');
  });

  it('copies a cue of the recorded show too, which becomes a show of its own with its current cue kept', async () => {
    eos = await startFakeEos();
    const connection = await connect(eos);
    await burst(connection);

    await exchange(connection, [hex('/eos/newcmd', ['Cue 1 / 7 Copy_To Cue 1 / 7.5#'])]);

    expect(eos.cues().map(({ number, label }) => [number, label])).toEqual(RECORDED_SHOW.flatMap(({ number, label }) => (number === '7' ? [[number, label], ['7.5', label]] : [[number, label]])));
    const addresses = (await burst(await connect(eos))).map(addressOf);
    expect([...new Set(addresses.filter((address) => address.startsWith('/eos/out/active/cue/1/')))]).toEqual(['/eos/out/active/cue/1/8']);
  });
});

// What the lights step of the set build sends for a song's colour, against the recordings of 2026-11-12
// (test/fixtures/eos/README.md, "The lights step on the church show"). The fake's levels are a model: a test gives
// each cue's own values, and the fake tracks them.
describe("the fake Eos's levels, for the colours of the lights step", () => {
  // The church show with the labels its cues had on 2026-11-12, as the recordings' fire events name them.
  const RECORDED_LABELS: Record<string, string> = { '1': 'Ancient Gates', '11': 'Holy Forever', '22': 'Worthy Of It All' };
  const churchShow = (labels = RECORDED_LABELS) => CHURCH_SHOW.map((cue) => ({ ...cue, label: labels[cue.number] ?? cue.label }));
  const SIX = [1, 2, 3, 16, 17, 18];
  const ping = encode('/eos/ping', []).toString('hex');
  // The addresses the fake answers a command line command and a parameter read on. Eos sends more after each, the
  // wheels and the softkeys among them, which the lights step does not read and the fake does not send.
  const ANSWERS = /^\/eos\/out\/(cmd|user\/1\/cmd|event\/cue\/1\/[^/]+\/fire|get\/params\/\d+|notify\/.*)$/;
  const fromApp = (name: string) => recording(name).filter((packet) => packet.dir === 'app->eos').map((packet) => packet.hex);
  const fromEos = (name: string) => recording(name).filter((packet) => packet.dir === 'eos->app' && ANSWERS.test(packet.address)).map((packet) => packet.hex);
  const readable = (packets: string[]) => packets.map((hex) => decode(Buffer.from(hex, 'hex'))!).map((message) => [message.address, ...message.args]);

  // Sends those packets, in order, and gives every packet the fake sent for them.
  async function exchange(connection: { packets: string[]; send(hex: string): void }, packets: string[]): Promise<string[]> {
    const sent = connection.packets.length;
    for (const hex of packets) connection.send(hex);
    connection.send(ping);
    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    return connection.packets.slice(sent, -1);
  }

  // What a recording read of the six colour lights, by the cue it went to before each read.
  function readsOf(name: string): Record<string, Record<number, { intensity: number; colour: [number, number, number] }>> {
    const reads: Record<string, Record<number, { intensity: number; colour: [number, number, number] }>> = {};
    let cue = '';
    for (const packet of recording(name)) {
      const { address, args } = decode(Buffer.from(packet.hex, 'hex'))!;
      if (address === '/eos/newcmd') cue = /^Go_To_Cue 1 \/ (\S+) Time 0#$/.exec(args[0] as string)?.[1] ?? cue;
      const channel = /^\/eos\/out\/get\/params\/(\d+)$/.exec(address)?.[1];
      if (channel !== undefined) (reads[cue] ??= {})[Number(channel)] = { intensity: args[3] as number, colour: [args[7] as number, args[11] as number, args[15] as number] };
    }
    return reads;
  }

  // The church show's levels as colours-before-record.json read them, as each cue's own values: the intensities of the
  // six lights in 1/11, 1/22, 1/35 and 1/36, their colours as cue 1/1's own, tracking from there, and the colour of its
  // own that channel 16 held in 1/36. Channel 16's intensity in 1/1 is the 72 record-only-confirm-on.json read there.
  function recordedLevels() {
    const before = readsOf('colours-before-record');
    const levels: Record<string, Record<number, { intensity?: number; colour?: [number, number, number] }>> = { '1': {} };
    for (const [cue, channels] of Object.entries(before)) levels[cue] = Object.fromEntries(Object.entries(channels).map(([channel, { intensity }]) => [channel, { intensity }]));
    for (const channel of SIX) levels['1']![channel] = { intensity: channel === 16 ? 72 : 0, colour: before['11']![channel]!.colour };
    levels['36']![16] = { ...levels['36']![16], colour: before['36']![16]!.colour };
    return levels;
  }

  it('goes to a cue in no time with the fire event and the command line Eos sent, and answers the read of an RGB channel and of a dimmer, byte for byte (channel-params.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.setLevels({ '1': { 24: { intensity: 75 } } });
    const connection = await connect(eos);
    await burst(connection);

    const answers = await exchange(connection, fromApp('channel-params'));

    expect(readable(answers)).toEqual(readable(fromEos('channel-params')));
    expect(answers).toEqual(fromEos('channel-params'));
    expect(readable(answers).map(([address]) => address)).toEqual(['/eos/out/event/cue/1/1/fire', '/eos/out/user/1/cmd', '/eos/out/cmd', '/eos/out/get/params/1', '/eos/out/get/params/24']);
  });

  it('takes a colour set through the parameter address with no answer, and reads back the floats sent with the intensity as it was (colour-set.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    const connection = await connect(eos);
    await burst(connection);

    const answers = await exchange(connection, fromApp('colour-set'));

    expect(answers).toEqual(fromEos('colour-set'));
    expect(readable(answers).filter(([address]) => address === '/eos/out/get/params/1').map((reply) => [reply[4], reply[8], reply[12], reply[16]])).toEqual([
      [0, 100, 100, 100],
      [0, 20, 90, 100],
    ]);
  });

  it('keeps a colour set to a thousandth once told to round: 69.333336 reads back as 69.333, and a level a thousandth holds reads back as sent', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.roundColours();
    const connection = await connect(eos);
    await burst(connection);
    const set = [encode('/eos/newcmd', ['Go_To_Cue 1 / 1 Time 0#']), encode('/eos/chan/1/param/red/green/blue', [100, 208 / 3, 2.178]), encode('/eos/get/params/1', [])];

    const answers = await exchange(connection, set.map((packet) => packet.toString('hex')));

    expect(readable(answers).filter(([address]) => address === '/eos/out/get/params/1').map((reply) => [reply[8], reply[12], reply[16]])).toEqual([[100, Math.fround(69.333), Math.fround(2.178)]]);
    expect(Math.fround(69.333)).not.toBe(Math.fround(208 / 3));
  });

  it('takes a colour set held back without a word: the channel reads the colour it had', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.holdColours();
    const connection = await connect(eos);
    await burst(connection);

    const answers = await exchange(connection, fromApp('colour-set'));

    expect(readable(answers).filter(([address]) => address === '/eos/out/get/params/1').map((reply) => [reply[8], reply[12], reply[16]])).toEqual([
      [100, 100, 100],
      [100, 100, 100],
    ]);
    expect(eos.received.map((message) => message.address)).toContain('/eos/chan/1/param/red/green/blue');
  });

  it('asks Please Confirm for a Record Only, records on Enter, and holds the colour in the cue as its own with no intensity changed (record-only-confirm-on.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.setLevels(recordedLevels());
    const before = eos.levels();
    const connection = await connect(eos);
    await burst(connection);
    await exchange(connection, fromApp('colour-set'));

    const answers = await exchange(connection, fromApp('record-only-confirm-on'));

    expect(readable(answers)).toEqual(readable(fromEos('record-only-confirm-on')));
    expect(answers).toEqual(fromEos('record-only-confirm-on'));
    const after = eos.levels();
    for (const channel of SIX) expect(after['1']![channel]).toEqual({ intensity: before['1']![channel]!.intensity, colour: [20, 90, 100] });
    expect(after['0.5']).toEqual(before['0.5']);
  });

  it('records nothing while a Record Only waits for its Enter, and drops it when another command comes first', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.setLevels(recordedLevels());
    const before = eos.levels();
    const connection = await connect(eos);
    await burst(connection);
    await exchange(connection, fromApp('colour-set'));
    const [record] = fromApp('record-only-confirm-on').filter((hex) => addressOf(hex) === '/eos/newcmd');

    await exchange(connection, [record!]);
    expect(eos.levels()).toEqual(before);
    await exchange(connection, [encode('/eos/newcmd', ['Go_To_Cue 1 / 11 Time 0#']).toString('hex'), encode('/eos/cmd', ['Enter']).toString('hex')]);

    expect(eos.levels()).toEqual(before);
  });

  it('records at once with Record Confirm off, with the one command line Eos sent (record-only-confirm-off.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow({ ...RECORDED_LABELS, '1': 'Test Song A' }));
    eos.setLevels(recordedLevels());
    eos.setRecordConfirm(false);
    const connection = await connect(eos);
    await burst(connection);

    const answers = await exchange(connection, fromApp('record-only-confirm-off'));

    expect(readable(answers)).toEqual(readable(fromEos('record-only-confirm-off')));
    expect(answers).toEqual(fromEos('record-only-confirm-off'));
    for (const channel of SIX) expect(eos.levels()['1']![channel]!.colour).toEqual([100, 70, 20]);
  });

  it('tracks a colour recorded into a cue into every later cue, channel by channel, up to a cue with a colour of its own, and stops the tracking where the old colour is recorded back (colours-after-record.json, colour-recorded-back.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.setLevels(recordedLevels());
    const connection = await connect(eos);
    await burst(connection);
    const params = (packets: string[]) => packets.filter((hex) => addressOf(hex).startsWith('/eos/out/get/params/'));
    // The fake reads the six lights as Eos did before anything was recorded.
    expect(params(await exchange(connection, fromApp('colours-before-record')))).toEqual(params(fromEos('colours-before-record')));
    await exchange(connection, [...fromApp('colour-set'), ...fromApp('record-only-confirm-on')]);

    const after = params(await exchange(connection, fromApp('colours-after-record')));

    expect(readable(after)).toEqual(readable(params(fromEos('colours-after-record'))));
    expect(after).toEqual(params(fromEos('colours-after-record')));
    // 20, 90 and 100 in every one of the six in 1/11, 1/22, 1/35 and 1/36, but channel 16 in 1/36, which kept its own.
    const levels = eos.levels();
    for (const cue of ['11', '22', '35', '36']) for (const channel of SIX) expect(levels[cue]![channel]!.colour, `${cue} ${channel}`).toEqual(cue === '36' && channel === 16 ? readsOf('colours-before-record')['36']![16]!.colour : [20, 90, 100]);

    const back = params(await exchange(connection, fromApp('colour-recorded-back')));

    expect(back).toEqual(params(fromEos('colour-recorded-back')));
    expect(back).toEqual(params(fromEos('colours-before-record')).slice(6));
    for (const channel of SIX) expect(eos.levels()['1']![channel]!.colour).toEqual([20, 90, 100]);
  });

  it('answers a command line it does not know as Eos answered the one it rejected, byte for byte, and records nothing (command-rejected.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.setLevels(recordedLevels());
    const before = eos.levels();
    const connection = await connect(eos);
    await burst(connection);
    await exchange(connection, fromApp('colour-set'));

    const answers = await exchange(connection, fromApp('command-rejected'));

    expect(answers).toEqual(fromEos('command-rejected'));
    expect(readable(answers).at(-1)).toEqual(['/eos/out/cmd', 'LIVE: Cue  1 : Chan 1 Thru 3 + 16 Thru 18 Record Only Cue 1 / 1 Q Only - Error: Syntax Error', 1]);
    expect(eos.levels()).toEqual(before);
  });

  it('answers every command line command that way once told to reject them, and neither goes to a cue nor records', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.setLevels(recordedLevels());
    const before = eos.levels();
    eos.rejectCommands();
    const connection = await connect(eos);
    await burst(connection);

    const answers = await exchange(connection, [...fromApp('colour-set'), ...fromApp('record-only-confirm-on')]);

    expect(readable(answers).filter(([address]) => address === '/eos/out/cmd')).toEqual([
      ['/eos/out/cmd', 'LIVE: Cue   : Go To Cue 1 / 1 Time 0 - Error: Syntax Error', 1],
      ['/eos/out/cmd', 'LIVE: Cue   : Chan 1 Thru 3 + 16 Thru 18 Record Only Cue 1 / 1 - Error: Syntax Error', 1],
    ]);
    expect(readable(answers).map(([address]) => address)).not.toContain('/eos/out/event/cue/1/1/fire');
    expect(eos.levels()).toEqual(before);
  });

  it('notifies a subscribed connection of a Record Only that changed a colour, as Eos did, byte for byte, and of one that changed none not at all (record-only-subscribed.json, record-only-same-colour.json)', async () => {
    eos = await startFakeEos();
    eos.setShow(churchShow());
    eos.setLevels(recordedLevels());
    eos.setRecordConfirm(false);
    const connection = await connect(eos);
    await burst(connection);
    const notifies = (packets: string[]) => packets.filter((hex) => addressOf(hex).startsWith('/eos/out/notify/'));
    const lightsStep = (name: string) => fromApp(name).filter((hex) => !addressOf(hex).startsWith('/eos/get/'));

    const changed = notifies(await exchange(connection, lightsStep('record-only-subscribed')));

    expect(readable(changed)).toEqual([
      ['/eos/out/notify/cue/1/list/0/2', 0, 22],
      ['/eos/out/notify/cuelist/list/0/2', 1, 1],
    ]);
    expect(changed).toEqual(notifies(fromEos('record-only-subscribed')));
    // The same colours recorded again into the cue that holds them.
    expect(notifies(await exchange(connection, lightsStep('record-only-subscribed')))).toEqual([]);
    expect(notifies(fromEos('record-only-same-colour'))).toEqual([]);
  });
});

// A song cue that runs on by a follow or a hang, against the recordings of 2026-11-13 (test/fixtures/eos/README.md, "A
// song cue with a follow or a hang"): what the lights step sends to such a cue, and the two commands that take a follow
// and a hang off a cue. Where no recording holds an answer, the case says so.
describe("the fake Eos's song cue with a follow or a hang", () => {
  // The church show with the labels its cues had on 2026-11-13, as the recordings name them, and cue 22 as given.
  const churchShow = (cue22: { link?: number; follow?: number; hang?: number } = {}) =>
    CHURCH_SHOW.map((cue) => ({ ...cue, label: { '1': 'Ancient Gates', '11': 'Holy Forever', '22': 'Worthy Of It All' }[cue.number] ?? cue.label, ...(cue.number === '22' ? cue22 : {}) }));
  const hex = (address: string, args: Parameters<typeof encode>[1] = []) => encode(address, args).toString('hex');
  const readable = (packets: string[]) => packets.map((packet) => decode(Buffer.from(packet, 'hex'))!).map((message) => [message.address, ...message.args]);
  // The command line commands a recording sent, and the packets Eos sent on the addresses the fake answers one on, each
  // in order. Eos sends more after a command, the previous, active and pending cue among them, which the lights step
  // does not read and the fake does not send.
  const commandsIn = (name: string) => recording(name).filter((packet) => packet.dir === 'app->eos' && packet.address === '/eos/newcmd').map((packet) => packet.hex);
  const ANSWERS = /^\/eos\/out\/(user\/1\/cmd|cmd|event\/cue\/1\/[^/]+\/fire|notify\/.*)$/;
  const answeredIn = (name: string) => recording(name).filter((packet) => packet.dir === 'eos->app' && ANSWERS.test(packet.address)).map((packet) => packet.hex);
  // The link, the follow and the hang a recording read of a cue by its number, arguments 19 to 21 of each list reply to
  // that read, in order.
  const chainsReadIn = (name: string, cue: string) =>
    recording(name).flatMap((packet) => (packet.address === `/eos/out/get/cue/1/${cue}/0/list/0/31` ? [decode(Buffer.from(packet.hex, 'hex'))!.args.slice(19, 22)] : []));
  type Connection = { packets: string[]; send(hex: string): void };

  // Sends those packets, in order, and gives every packet the fake sent for them.
  async function exchange(connection: Connection, packets: string[]): Promise<string[]> {
    const sent = connection.packets.length;
    for (const packet of packets) connection.send(packet);
    connection.send(hex('/eos/ping'));
    await expect.poll(() => connection.packets.slice(sent).map(addressOf)).toContain('/eos/out/ping');
    return connection.packets.slice(sent, -1);
  }

  // The link, the follow and the hang of a cue as the fake's cue list read gives them, arguments 19 to 21 of the cue's
  // list reply, read by index as the lights step reads the list.
  async function chainRead(connection: Connection, cue: string): Promise<unknown[]> {
    const index = eos!.cues().findIndex(({ number }) => number === cue);
    const replies = await exchange(connection, [hex('/eos/get/cue/1/index', [{ int: index }])]);
    return readable(replies.filter((packet) => addressOf(packet) === `/eos/out/get/cue/1/${cue}/0/list/0/31`))[0]!.slice(20, 23);
  }

  // The fake on the church show with cue 22 as given, and a connection past its connect burst. With `subscribed`, the
  // connection subscribed and has had one notified edit, a label set, as the connection of the recordings had the
  // follow set on 1/22 before its copy: Eos counts the sequence on from it.
  async function onChurchShow(cue22: { link?: number; follow?: number; hang?: number }, { subscribed = false } = {}): Promise<Connection> {
    eos = await startFakeEos();
    eos.setShow(churchShow(cue22));
    const connection = await connect(eos);
    await burst(connection);
    if (subscribed) await exchange(connection, [hex('/eos/subscribe', [{ int: 1 }]), hex('/eos/set/cue/1/36/label', ['Meet and greet'])]);
    return connection;
  }

  it.each([
    { name: 'a follow', cue22: { follow: 3000 }, file: 'chain-go-to-cue-follow', command: 0 },
    { name: 'a hang', cue22: { hang: 2000 }, file: 'chain-go-to-cue-hang', command: 1 },
  ])('goes to a cue with $name in no time with the fire event of that cue and the command line Eos sent, byte for byte, and fires no other cue ($file.json)', async ({ cue22, file, command }) => {
    const connection = await onChurchShow(cue22);

    const answers = await exchange(connection, [commandsIn(file)[command]!]);

    expect(readable(answers)).toEqual([
      ['/eos/out/event/cue/1/22/fire', 'Worthy Of It All'],
      ['/eos/out/user/1/cmd', 'LIVE: Cue  22 : Go To Cue 1 / 22 Time 0:00 #', 0],
      ['/eos/out/cmd', 'LIVE: Cue  22 : Go To Cue 1 / 22 Time 0:00 #', 0],
    ]);
    expect(answers).toEqual(answeredIn(file).slice(-3));
    // The recording holds the 9 s after the Go To Cue, and one fire event: the cue's own.
    expect(answeredIn(file).map(addressOf).filter((address) => address.endsWith('/fire'))).toEqual(['/eos/out/event/cue/1/22/fire']);
  });

  it('gives a copy the follow of its source in argument 20 of its list reply, and takes it off the copy on Cue 1 / 23 Follow# with the command line and the notify pair Eos sent, byte for byte (chain-copy-to-follow.json)', async () => {
    const connection = await onChurchShow({ follow: 3000 }, { subscribed: true });
    const [copy, followOff] = commandsIn('chain-copy-to-follow');
    const [copied, cleared] = chainsReadIn('chain-copy-to-follow', '23');

    const made = await exchange(connection, [copy!]);

    expect(made).toEqual(answeredIn('chain-copy-to-follow').slice(0, 4));
    expect(copied).toEqual([0, 3000, -1]);
    expect(await chainRead(connection, '23')).toEqual(copied);

    const taken = await exchange(connection, [followOff!]);

    expect(readable(taken)).toEqual([
      ['/eos/out/user/1/cmd', 'LIVE: Cue  23 : Cue 1 / 23 Follow #', 0],
      ['/eos/out/cmd', 'LIVE: Cue  23 : Cue 1 / 23 Follow #', 0],
      ['/eos/out/notify/cue/1/list/0/2', 4, 23],
      ['/eos/out/notify/cuelist/list/0/2', 5, 1],
    ]);
    expect(taken).toEqual(answeredIn('chain-copy-to-follow').slice(4));
    expect(cleared).toEqual([0, -1, -1]);
    expect(await chainRead(connection, '23')).toEqual(cleared);
    // The source keeps its follow.
    expect(await chainRead(connection, '22')).toEqual([0, 3000, -1]);
    expect(eos!.cues().find(({ number }) => number === '23')).toEqual({ number: '23', label: 'Worthy Of It All' });
  });

  it.each([
    { name: 'a follow', word: 'Follow', cue22: { follow: 3000, hang: 1500 }, left: [0, -1, 1500], file: 'chain-follow-cleared' },
    { name: 'a hang', word: 'Hang', cue22: { follow: 3000, hang: 2000 }, left: [0, 3000, -1], file: 'chain-hang-cleared' },
  ])('takes $name off a cue on Cue 1 / 22 $word# with the command line Eos sent, byte for byte, sends a connection that did not subscribe no notify, and leaves the other of the two ($file.json)', async ({ cue22, left, file }) => {
    const connection = await onChurchShow(cue22);

    const answers = await exchange(connection, commandsIn(file));

    expect(answers).toEqual(answeredIn(file));
    expect(answers).toHaveLength(2);
    expect(chainsReadIn(file, '22')).toEqual([[0, -1, -1]]);
    expect(await chainRead(connection, '22')).toEqual(left);
  });

  // A model: the notify pair is recorded for a follow taken off (chain-copy-to-follow.json), and no recording was
  // subscribed when a hang came off.
  it('notifies a subscribed connection of a hang taken off as of a follow taken off, and takes a hang off a cue with a decimal number', async () => {
    eos = await startFakeEos();
    eos.setShow([...churchShow(), { number: '22.5', label: 'Build', link: 35, hang: 2000 }].toSorted((a, b) => Number(a.number) - Number(b.number)));
    const connection = await connect(eos);
    await burst(connection);
    await exchange(connection, [hex('/eos/subscribe', [{ int: 1 }])]);

    const answers = await exchange(connection, [hex('/eos/newcmd', ['Cue 1 / 22.5 Hang#'])]);

    expect(readable(answers)).toEqual([
      ['/eos/out/user/1/cmd', 'LIVE: Cue  22.5 : Cue 1 / 22.5 Hang #', 0],
      ['/eos/out/cmd', 'LIVE: Cue  22.5 : Cue 1 / 22.5 Hang #', 0],
      ['/eos/out/notify/cue/1/list/0/2', 0, '22.5'],
      ['/eos/out/notify/cuelist/list/0/2', 1, 1],
    ]);
    // The link stays: no recording holds a command that takes one off.
    expect(await chainRead(connection, '22.5')).toEqual([35, -1, -1]);
  });

  // A model: no recording holds a Follow# or a Hang# on a cue that has none.
  it.each(['Follow', 'Hang'])('answers Cue 1 / 22 %s# on a cue that has none with the same command line, and changes and notifies nothing', async (word) => {
    const connection = await onChurchShow({}, { subscribed: true });
    const cues = eos!.cues();

    const answers = await exchange(connection, [hex('/eos/newcmd', [`Cue 1 / 22 ${word}#`])]);

    expect(readable(answers)).toEqual([
      ['/eos/out/user/1/cmd', `LIVE: Cue  22 : Cue 1 / 22 ${word} #`, 0],
      ['/eos/out/cmd', `LIVE: Cue  22 : Cue 1 / 22 ${word} #`, 0],
    ]);
    expect(eos!.cues()).toEqual(cues);
  });

  it.each([
    { name: 'a test told it to reject', text: 'Cue 1 / 22 Follow#', line: 'Cue 1 / 22 Follow', reject: true },
    { name: 'of a cue the show does not hold', text: 'Cue 1 / 23 Hang#', line: 'Cue 1 / 23 Hang', reject: false },
  ])('answers a follow or a hang taken off $name with the syntax error it gives any command it does not take, and changes and notifies nothing', async ({ text, line, reject }) => {
    const connection = await onChurchShow({ follow: 3000, hang: 2000 }, { subscribed: true });
    const cues = eos!.cues();
    if (reject) eos!.rejectCommands(/Follow#/);

    const answers = await exchange(connection, [hex('/eos/newcmd', [text])]);

    expect(readable(answers)).toEqual([
      ['/eos/out/user/1/cmd', `LIVE: Cue   : ${line} - Error: Syntax Error`, 1],
      ['/eos/out/cmd', `LIVE: Cue   : ${line} - Error: Syntax Error`, 1],
    ]);
    expect(eos!.cues()).toEqual(cues);
  });

  // Not recorded: an Eos that answers the command and keeps the follow or the hang.
  it('takes a follow and a hang held back with the command line alone: the cue keeps both, and no notify is sent', async () => {
    const connection = await onChurchShow({ follow: 3000, hang: 2000 }, { subscribed: true });
    eos!.holdFollows();

    const answers = await exchange(connection, [...commandsIn('chain-follow-cleared'), ...commandsIn('chain-hang-cleared')]);

    expect(answers).toEqual([...answeredIn('chain-follow-cleared'), ...answeredIn('chain-hang-cleared')]);
    expect(await chainRead(connection, '22')).toEqual([0, 3000, 2000]);
  });
});
