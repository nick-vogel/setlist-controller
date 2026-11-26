import { describe, expect, it } from 'vitest';
import { createMessageBoard } from '../src/server/messages.ts';
import { parseDeviceCommand } from '../src/shared/command.ts';
import { messageFrame, readMessageFrame } from '../src/shared/messages.ts';

// The producer's message commands, the frame that carries a device its message, and the hub's board
// of the active message for each device. The hub's use of the board over real sockets is in
// messages-hub.test.ts.

// A board whose IDs count up, and whose clock reads 1000 more on each send.
function board() {
  let count = 0;
  let time = 0;
  return createMessageBoard(
    () => `m${(count += 1)}`,
    () => (time += 1000),
  );
}

describe("the producer's message command", () => {
  it('is read with its text trimmed and its target: every page, every view-only page, or a list of client IDs named once each', () => {
    const read = (value: object) => parseDeviceCommand(JSON.stringify({ kind: 'message', ...value }));
    expect(read({ text: '  Repeat chorus ', to: 'all' })).toEqual({ kind: 'message', text: 'Repeat chorus', to: 'all' });
    expect(read({ text: 'Watch leader', to: 'viewers' })).toEqual({ kind: 'message', text: 'Watch leader', to: 'viewers' });
    expect(read({ text: 'Watch leader', to: ['a1', 'b2', 'a1'] })).toEqual({ kind: 'message', text: 'Watch leader', to: ['a1', 'b2'] });
  });

  it('cuts a text past 120 characters, so a long one still shows', () => {
    const command = parseDeviceCommand(JSON.stringify({ kind: 'message', text: 'x'.repeat(200), to: 'all' }));
    expect(command?.kind === 'message' && command.text).toBe('x'.repeat(120));
  });

  it('is refused with a blank or missing text, or a target that reaches nobody or names no client ID', () => {
    const refused = [
      { kind: 'message', text: '   ', to: 'all' },
      { kind: 'message', to: 'all' },
      { kind: 'message', text: 12, to: 'all' },
      { kind: 'message', text: 'Hold', to: [] },
      { kind: 'message', text: 'Hold', to: ['a b'] },
      { kind: 'message', text: 'Hold', to: 'leaders' },
      { kind: 'message', text: 'Hold' },
    ];
    for (const value of refused) expect(parseDeviceCommand(JSON.stringify(value)), JSON.stringify(value)).toBeNull();
  });

  it('reads Clear as a command of its own', () => {
    expect(parseDeviceCommand(JSON.stringify({ kind: 'clear-messages' }))).toEqual({ kind: 'clear-messages' });
  });
});

describe('a message frame', () => {
  it('carries a message, or null to clear it, and reads nothing from a snapshot or a malformed frame', () => {
    expect(readMessageFrame(messageFrame({ id: 'm1', text: 'Repeat chorus' }))).toEqual({ id: 'm1', text: 'Repeat chorus' });
    expect(readMessageFrame(messageFrame(null))).toBeNull();
    expect(readMessageFrame(JSON.stringify({ live: 'connected', set: null }))).toBeUndefined();
    expect(readMessageFrame('{"kind":"message","message":{"id":1}}')).toBeUndefined();
    expect(readMessageFrame('{"kind":"message",')).toBeUndefined();
  });
});

describe('the message board', () => {
  it('gives a message to all to every role but the producer, a message to view-only pages to viewers alone, and a chosen one to its devices alone', () => {
    const messages = board();
    const all = messages.send('Hold after this song', 'all');
    expect(['viewer', 'leader', 'producer'].map((role) => messages.activeFor('x', role as 'viewer')?.id)).toEqual([all.id, all.id, undefined]);

    const viewers = messages.send('Repeat chorus', 'viewers');
    expect([messages.activeFor('x', 'viewer')?.id, messages.activeFor('x', 'leader')?.id]).toEqual([viewers.id, all.id]);

    const chosen = messages.send('Watch leader', ['keys', 'booth']);
    expect([messages.activeFor('keys', 'viewer')?.id, messages.activeFor('bass', 'viewer')?.id, messages.activeFor('booth', 'producer')?.id]).toEqual([chosen.id, viewers.id, chosen.id]);
  });

  it('keeps one message per device, the newest that reaches it', () => {
    const messages = board();
    messages.send('Watch leader', ['keys']);
    const all = messages.send('Repeat bridge', 'all');
    expect(messages.activeFor('keys', 'viewer')).toEqual(all);

    const second = messages.send('Repeat chorus', ['keys']);
    expect(messages.activeFor('keys', 'viewer')).toEqual(second);
  });

  it('gives a message to view-only pages to a device that first connects after the send', () => {
    const messages = board();
    const viewers = messages.send('Repeat chorus', 'viewers');
    expect(messages.activeFor('late', 'viewer')).toEqual(viewers);
  });

  it('replaces an older message to a chosen view-only device with a message to the view-only devices', () => {
    const messages = board();
    messages.send('Watch leader', ['keys']);
    const viewers = messages.send('Repeat chorus', 'viewers');
    expect(messages.activeFor('keys', 'viewer')).toEqual(viewers);
  });

  it("leaves a chosen leader's message in place under a message to the view-only devices", () => {
    const messages = board();
    const chosen = messages.send('Watch leader', ['ipad']);
    messages.send('Repeat chorus', 'viewers');
    expect(messages.activeFor('ipad', 'leader')).toEqual(chosen);
  });

  it('makes a new ID for every send, the same text included', () => {
    const messages = board();
    expect(messages.send('Repeat chorus', 'all').id).not.toBe(messages.send('Repeat chorus', 'all').id);
  });

  it('clears every active message, and reports whether there was one', () => {
    const messages = board();
    expect(messages.clear()).toBe(false);
    messages.send('Repeat chorus', 'viewers');
    messages.send('Watch leader', ['ipad']);
    messages.send('Hold', 'all');

    expect(messages.clear()).toBe(true);

    expect([messages.activeFor('x', 'viewer'), messages.activeFor('ipad', 'leader')]).toEqual([null, null]);
    expect(messages.active([])).toEqual([]);
    expect(messages.clear()).toBe(false);
  });
});

describe("the board's active messages, as the producer page lists them", () => {
  it('lists each active message newest first, with its text, its target and when it was sent', () => {
    const messages = board();
    messages.send('Hold after this song', 'all');
    messages.send('Repeat chorus', 'viewers');
    messages.send('Watch leader', ['keys', 'ipad']);

    expect(messages.active([])).toEqual([
      { id: 'm3', text: 'Watch leader', to: ['keys', 'ipad'], sent: 3000, shownBy: [] },
      { id: 'm2', text: 'Repeat chorus', to: 'viewers', sent: 2000, shownBy: [] },
      { id: 'm1', text: 'Hold after this song', to: 'all', sent: 1000, shownBy: [] },
    ]);
  });

  it('names a chosen message by the devices a newer one has not replaced it on, and drops it once none is left', () => {
    const messages = board();
    messages.send('Watch leader', ['keys', 'bass']);
    messages.send('Repeat chorus', ['keys']);
    expect(messages.active([]).map(({ text, to }) => [text, to])).toEqual([
      ['Repeat chorus', ['keys']],
      ['Watch leader', ['bass']],
    ]);

    messages.send('Repeat bridge', ['bass']);
    expect(messages.active([]).map(({ text }) => text)).toEqual(['Repeat bridge', 'Repeat chorus']);
  });

  it('keeps a chosen message listed with its whole target after a newer message to the view-only devices covers it', () => {
    const messages = board();
    messages.send('Watch leader', ['keys', 'ipad']);
    messages.send('Repeat chorus', 'viewers');
    const devices = [
      { client: 'keys', role: 'viewer' },
      { client: 'ipad', role: 'leader' },
    ] as const;

    expect(messages.active(devices).map(({ text, to, shownBy }) => [text, to, shownBy])).toEqual([
      ['Repeat chorus', 'viewers', ['keys']],
      ['Watch leader', ['keys', 'ipad'], ['ipad']],
    ]);
  });

  it('lists a message to all devices alone, since it replaces every older one', () => {
    const messages = board();
    messages.send('Repeat chorus', 'viewers');
    messages.send('Watch leader', ['ipad']);
    messages.send('Hold after this song', 'all');

    expect(messages.active([]).map(({ text }) => text)).toEqual(['Hold after this song']);
  });

  it('marks each listed device by the one message it shows, by its role', () => {
    const messages = board();
    messages.send('Hold after this song', 'all');
    messages.send('Repeat chorus', 'viewers');
    messages.send('Watch leader', ['bass']);
    const devices = [
      { client: 'panel', role: 'producer' },
      { client: 'ipad', role: 'leader' },
      { client: 'keys', role: 'viewer' },
      { client: 'bass', role: 'viewer' },
    ] as const;

    expect(messages.active(devices).map(({ text, shownBy }) => [text, shownBy])).toEqual([
      ['Watch leader', ['bass']],
      ['Repeat chorus', ['keys']],
      ['Hold after this song', ['ipad']],
    ]);
  });
});
