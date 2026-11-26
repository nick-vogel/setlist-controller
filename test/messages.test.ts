import { describe, expect, it } from 'vitest';
import { createMessageBoard } from '../src/server/messages.ts';
import { parseDeviceCommand } from '../src/shared/command.ts';
import { messageFrame, readMessageFrame } from '../src/shared/messages.ts';

// The producer's message commands, the frame that carries a device its message, and the hub's board
// of the active message for each device. The hub's use of the board over real sockets is in
// messages-hub.test.ts.

function board() {
  let count = 0;
  return createMessageBoard(() => `m${(count += 1)}`);
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
  it('gives a message to all to every role, a message to view-only pages to viewers alone, and a chosen one to its devices alone', () => {
    const messages = board();
    const all = messages.send('Hold after this song', 'all');
    expect(['viewer', 'leader', 'producer'].map((role) => messages.activeFor('x', role as 'viewer')?.id)).toEqual([all.id, all.id, all.id]);

    const viewers = messages.send('Repeat chorus', 'viewers');
    expect([messages.activeFor('x', 'viewer')?.id, messages.activeFor('x', 'leader')?.id]).toEqual([viewers.id, all.id]);

    const chosen = messages.send('Watch leader', ['keys']);
    expect([messages.activeFor('keys', 'viewer')?.id, messages.activeFor('bass', 'viewer')?.id]).toEqual([chosen.id, viewers.id]);
  });

  it('keeps one message per device, the newest that reaches it', () => {
    const messages = board();
    messages.send('Watch leader', ['keys']);
    const all = messages.send('Repeat bridge', 'all');
    expect(messages.activeFor('keys', 'viewer')).toEqual(all);

    const second = messages.send('Repeat chorus', ['keys']);
    expect(messages.activeFor('keys', 'viewer')).toEqual(second);
  });

  it('gives a message to all or to view-only pages to a device that first connects after the send', () => {
    const messages = board();
    const viewers = messages.send('Repeat chorus', 'viewers');
    expect(messages.activeFor('late', 'viewer')).toEqual(viewers);
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
    expect(messages.clear()).toBe(false);
  });
});
