import { describe, expect, it } from 'vitest';
import { createMessageBoard } from '../src/server/messages.ts';
import { parseDeviceCommand, parseDismissal } from '../src/shared/command.ts';
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

describe("a page's Dismiss", () => {
  it('is read with the ID of the message it dismissed, and refused with no ID or another kind', () => {
    expect(parseDismissal(JSON.stringify({ kind: 'dismissed', id: 'm1' }))).toEqual({ kind: 'dismissed', id: 'm1' });
    for (const value of [{ kind: 'dismissed' }, { kind: 'dismissed', id: 7 }, { kind: 'message', id: 'm1' }, null]) {
      expect(parseDismissal(JSON.stringify(value)), JSON.stringify(value)).toBeNull();
    }
    expect(parseDismissal('not json')).toBeNull();
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
      { id: 'm3', text: 'Watch leader', to: ['keys', 'ipad'], sent: 3000, shownBy: [], dismissedBy: [] },
      { id: 'm2', text: 'Repeat chorus', to: 'viewers', sent: 2000, shownBy: [], dismissedBy: [] },
      { id: 'm1', text: 'Hold after this song', to: 'all', sent: 1000, shownBy: [], dismissedBy: [] },
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

describe('a Dismiss on the board', () => {
  const devices = [
    { client: 'keys', role: 'viewer' },
    { client: 'bass', role: 'viewer' },
    { client: 'ipad', role: 'leader' },
  ] as const;
  const dismissedBy = (messages: ReturnType<typeof board>) => messages.active(devices).map(({ text, dismissedBy }) => [text, dismissedBy]);

  it('marks the device that dismissed the message it shows, and no other device that shows it', () => {
    const messages = board();
    const sent = messages.send('Repeat chorus', 'all');

    expect(messages.dismiss('keys', 'viewer', [sent.id])).toBe(true);

    expect(dismissedBy(messages)).toEqual([['Repeat chorus', ['keys']]]);
  });

  it('reports no change for a Dismiss the device already sent, as a second tab of its page sends', () => {
    const messages = board();
    const sent = messages.send('Repeat chorus', 'all');
    messages.dismiss('keys', 'viewer', [sent.id]);

    expect(messages.dismiss('keys', 'viewer', [sent.id])).toBe(false);
    expect(dismissedBy(messages)).toEqual([['Repeat chorus', ['keys']]]);
  });

  it('ignores an ID that is not active on that device, so a page cannot mark a message it never showed', () => {
    const messages = board();
    const old = messages.send('Watch leader', ['keys']);
    const toIpad = messages.send('Hold after this song', ['ipad']);
    messages.send('Repeat chorus', 'viewers');

    expect(messages.dismiss('keys', 'viewer', [old.id, toIpad.id, 'unknown'])).toBe(false);
    expect(messages.dismiss('bass', 'leader', [toIpad.id])).toBe(false);

    expect(dismissedBy(messages)).toEqual([
      ['Repeat chorus', []],
      ['Hold after this song', []],
      ['Watch leader', []],
    ]);
  });

  it('takes a Dismiss from a producer page for a message chosen for it, and none for a message to all', () => {
    const messages = board();
    const toAll = messages.send('Hold after this song', 'all');
    expect(messages.dismiss('panel', 'producer', [toAll.id])).toBe(false);

    const chosen = messages.send('Watch leader', ['panel']);
    expect(messages.dismiss('panel', 'producer', [chosen.id])).toBe(true);

    expect(messages.active([{ client: 'panel', role: 'producer' }]).map(({ text, dismissedBy }) => [text, dismissedBy])).toEqual([
      ['Watch leader', ['panel']],
      ['Hold after this song', []],
    ]);
  });

  it('marks the device by the message among its stored IDs that it shows, as a hello carries them', () => {
    const messages = board();
    const old = messages.send('Watch leader', ['ipad']);
    const sent = messages.send('Hold after this song', ['ipad']);

    expect(messages.dismiss('ipad', 'leader', [old.id, sent.id])).toBe(true);

    expect(dismissedBy(messages)).toEqual([['Hold after this song', ['ipad']]]);
  });

  it('leaves a newer message that replaces the dismissed one shown and not dismissed', () => {
    const messages = board();
    const first = messages.send('Watch leader', ['keys', 'bass']);
    messages.dismiss('keys', 'viewer', [first.id]);
    messages.dismiss('bass', 'viewer', [first.id]);

    messages.send('Repeat chorus', ['keys']);
    expect(dismissedBy(messages)).toEqual([
      ['Repeat chorus', []],
      ['Watch leader', ['bass']],
    ]);

    messages.send('Repeat bridge', 'viewers');
    expect(dismissedBy(messages)).toEqual([['Repeat bridge', []], ['Repeat chorus', []], ['Watch leader', []]]);
  });

  it('forgets the mark of a device outside the list it is given, so the marks stay as few as the devices listed', () => {
    const messages = board();
    const sent = messages.send('Repeat chorus', 'all');
    for (const { client, role } of devices) messages.dismiss(client, role, [sent.id]);

    expect(messages.active([devices[0]]).map(({ dismissedBy }) => dismissedBy)).toEqual([['keys']]);

    expect(dismissedBy(messages)).toEqual([['Repeat chorus', ['keys']]]);
    expect(messages.dismiss('bass', 'viewer', [sent.id])).toBe(true);
    expect(dismissedBy(messages)).toEqual([['Repeat chorus', ['keys', 'bass']]]);
  });

  it('forgets every dismissal on Clear, so the same ID never marks a device again', () => {
    const messages = board();
    const sent = messages.send('Repeat chorus', 'all');
    messages.dismiss('keys', 'viewer', [sent.id]);

    messages.clear();

    expect(messages.dismiss('keys', 'viewer', [sent.id])).toBe(false);
    expect(messages.active(devices)).toEqual([]);
  });
});
