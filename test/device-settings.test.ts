import { describe, expect, it } from 'vitest';
import {
  CAPOS,
  CHORD_NAMES,
  DISPLAYS,
  FONT_SIZES,
  LEADER_VIEWS,
  PARTS,
  VIEWS,
  defaultDeviceName,
  defaultDisplay,
  newClientId,
  readCapo,
  readClientId,
  readDeviceName,
  readDismissedMessages,
  storeDismissedMessage,
  MAX_DISMISSED_MESSAGES,
  watchDeviceName,
  readChordNames,
  readDisplay,
  readFontSize,
  readLeaderView,
  readPart,
  readTipShown,
  readView,
  storeCapo,
  storeChordNames,
  storeDeviceName,
  storeDisplay,
  storeFontSize,
  storeLeaderView,
  storePart,
  storeTipShown,
  storeView,
  type DeviceStorage,
  type Display,
  type Part,
} from '../web/src/device-settings.ts';
import { parseHello } from '../src/shared/devices.ts';

// What a band member's device remembers between visits: their part, so the chart view opens again
// after a reload.

// A storage backed by a map, as the browser's localStorage behaves.
function mapStorage(entries: Record<string, string> = {}): DeviceStorage & { entries: Map<string, string> } {
  const map = new Map(Object.entries(entries));
  return {
    entries: map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

// A storage that throws on every call, as Safari's private mode can.
const throwing: DeviceStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('the part a device stores', () => {
  it('offers Keys, Guitar, Bass, Vocals and Drums, in that order', () => {
    expect(PARTS).toEqual(['Keys', 'Guitar', 'Bass', 'Vocals', 'Drums']);
  });

  it('reads back each part stored', () => {
    for (const part of PARTS) {
      const storage = mapStorage();
      storePart(storage, part);
      expect(readPart(storage)).toBe(part);
    }
  });

  it('reads no part on a device that never stored one', () => {
    expect(readPart(mapStorage())).toBeNull();
  });

  it('forgets the part when No part is stored, and keeps one key whatever is stored', () => {
    const storage = mapStorage();
    storePart(storage, 'Bass');
    storePart(storage, 'Drums');
    expect(storage.entries.size).toBe(1);
    storePart(storage, null);
    expect(readPart(storage)).toBeNull();
    expect(storage.entries.size).toBe(0);
  });

  it('reads a stored value that is not a part as no part', () => {
    const storage = mapStorage();
    storePart(storage, 'Keys');
    const [key] = [...storage.entries.keys()];
    for (const value of ['Trumpet', 'keys', '', ' Keys']) {
      storage.entries.set(key!, value);
      expect(readPart(storage), value).toBeNull();
    }
  });

  it('reads no part and stores nothing, without throwing, on a device with no storage or one that throws', () => {
    expect(readPart(undefined)).toBeNull();
    expect(readPart(throwing)).toBeNull();
    expect(() => storePart(undefined, 'Keys')).not.toThrow();
    expect(() => storePart(throwing, 'Keys')).not.toThrow();
    expect(() => storePart(throwing, null)).not.toThrow();
  });
});

describe('the display a device stores for each part', () => {
  it('offers Chords over lyrics, Lyrics only and Section map, in that order', () => {
    expect(DISPLAYS).toEqual([
      { value: 'chords-over-lyrics', label: 'Chords over lyrics' },
      { value: 'lyrics-only', label: 'Lyrics only' },
      { value: 'section-map', label: 'Section map' },
    ]);
  });

  const DEFAULTS: [Part, Display][] = [
    ['Keys', 'chords-over-lyrics'],
    ['Guitar', 'chords-over-lyrics'],
    ['Bass', 'chords-over-lyrics'],
    ['Vocals', 'lyrics-only'],
    ['Drums', 'section-map'],
  ];

  it.each(DEFAULTS)('opens %s on its default display, %s, on a device that never stored one', (part, display) => {
    expect(defaultDisplay(part)).toBe(display);
    expect(readDisplay(mapStorage(), part)).toBe(display);
  });

  it("reads back each display stored for each part, under the part's own key", () => {
    for (const part of PARTS) {
      for (const { value } of DISPLAYS) {
        const storage = mapStorage();
        storeDisplay(storage, part, value);
        expect([...storage.entries], `${part} ${value}`).toEqual([[`setlist-controller.display.${part}`, value]]);
        expect(readDisplay(storage, part), `${part} ${value}`).toBe(value);
      }
    }
  });

  it('keeps a display stored for one part away from the other parts and from the part key', () => {
    const storage = mapStorage();
    storePart(storage, 'Keys');
    storeDisplay(storage, 'Keys', 'section-map');
    expect(readDisplay(storage, 'Keys')).toBe('section-map');
    expect(readDisplay(storage, 'Vocals')).toBe('lyrics-only');
    expect(readDisplay(storage, 'Guitar')).toBe('chords-over-lyrics');
    expect(readPart(storage)).toBe('Keys');
    storeDisplay(storage, 'Vocals', 'chords-over-lyrics');
    expect(readDisplay(storage, 'Keys')).toBe('section-map');
    expect(readDisplay(storage, 'Vocals')).toBe('chords-over-lyrics');
  });

  it("reads a stored value that is not a display as the part's default", () => {
    const storage = mapStorage();
    storeDisplay(storage, 'Vocals', 'section-map');
    const key = [...storage.entries.keys()][0]!;
    for (const value of ['Lyrics only', 'map', '', ' section-map']) {
      storage.entries.set(key, value);
      expect(readDisplay(storage, 'Vocals'), value).toBe('lyrics-only');
    }
  });

  it("reads the part's default and stores without throwing on a device with no storage or one that throws", () => {
    expect(readDisplay(undefined, 'Drums')).toBe('section-map');
    expect(readDisplay(throwing, 'Keys')).toBe('chords-over-lyrics');
    expect(() => storeDisplay(undefined, 'Keys', 'lyrics-only')).not.toThrow();
    expect(() => storeDisplay(throwing, 'Keys', 'lyrics-only')).not.toThrow();
  });
});

describe('the view a device stores', () => {
  it('offers This song, the default, and Whole set, in that order', () => {
    expect(VIEWS).toEqual([
      { value: 'song', label: 'This song' },
      { value: 'set', label: 'Whole set' },
    ]);
    expect(readView(mapStorage())).toBe('song');
  });

  it('reads back each view stored, under one key for the device whatever the part', () => {
    const storage = mapStorage();
    storePart(storage, 'Keys');
    for (const { value } of VIEWS) {
      storeView(storage, value);
      expect(readView(storage), value).toBe(value);
    }
    expect(storage.entries.get('setlist-controller.view')).toBe('set');
    storePart(storage, 'Drums');
    expect(readView(storage)).toBe('set');
    storeView(storage, 'song');
    expect(readView(storage)).toBe('song');
    expect(readPart(storage)).toBe('Drums');
    expect(storage.entries.size).toBe(2);
  });

  it('reads a stored value that is not a view as This song', () => {
    const storage = mapStorage({ 'setlist-controller.view': 'set' });
    for (const value of ['Whole set', 'SET', '', ' set']) {
      storage.entries.set('setlist-controller.view', value);
      expect(readView(storage), value).toBe('song');
    }
  });

  it('reads This song and stores without throwing on a device with no storage or one that throws', () => {
    expect(readView(undefined)).toBe('song');
    expect(readView(throwing)).toBe('song');
    expect(() => storeView(undefined, 'set')).not.toThrow();
    expect(() => storeView(throwing, 'set')).not.toThrow();
  });
});

describe('the font size a device stores', () => {
  it('offers five steps from Small to Largest, each a scale on the chart text, Medium the default at 1', () => {
    expect(FONT_SIZES).toEqual([
      { value: 'small', label: 'Small', scale: 0.85 },
      { value: 'medium', label: 'Medium', scale: 1 },
      { value: 'large', label: 'Large', scale: 1.25 },
      { value: 'larger', label: 'Larger', scale: 1.5 },
      { value: 'largest', label: 'Largest', scale: 2 },
    ]);
    expect(readFontSize(mapStorage())).toBe('medium');
  });

  it('reads back each font size stored, under one key for the device', () => {
    const storage = mapStorage();
    for (const { value } of FONT_SIZES) {
      storeFontSize(storage, value);
      expect(readFontSize(storage), value).toBe(value);
    }
    expect([...storage.entries]).toEqual([['setlist-controller.font-size', 'largest']]);
  });

  it('reads a stored value that is not a font size as Medium', () => {
    const storage = mapStorage();
    for (const value of ['Largest', 'huge', '', '2', ' large']) {
      storage.entries.set('setlist-controller.font-size', value);
      expect(readFontSize(storage), value).toBe('medium');
    }
  });

  it('reads Medium and stores without throwing on a device with no storage or one that throws', () => {
    expect(readFontSize(undefined)).toBe('medium');
    expect(readFontSize(throwing)).toBe('medium');
    expect(() => storeFontSize(undefined, 'large')).not.toThrow();
    expect(() => storeFontSize(throwing, 'large')).not.toThrow();
  });
});

describe('the Auto-Lock tip a device remembers showing', () => {
  it('is not shown on a device that never showed it, and is shown once stored', () => {
    const storage = mapStorage();
    expect(readTipShown(storage)).toBe(false);
    storeTipShown(storage);
    expect(readTipShown(storage)).toBe(true);
    expect(storage.entries.has('setlist-controller.auto-lock-tip')).toBe(true);
    expect(storage.entries.size).toBe(1);
  });

  it('keeps away from the part, the display, the view and the font size', () => {
    const storage = mapStorage();
    storePart(storage, 'Vocals');
    storeDisplay(storage, 'Vocals', 'section-map');
    storeView(storage, 'set');
    storeFontSize(storage, 'large');
    expect(readTipShown(storage)).toBe(false);
    storeTipShown(storage);
    expect([readPart(storage), readDisplay(storage, 'Vocals'), readView(storage), readFontSize(storage)]).toEqual(['Vocals', 'section-map', 'set', 'large']);
  });

  it('reads as shown on a device that cannot read its storage, so the tip never shows on every open', () => {
    expect(readTipShown(undefined)).toBe(true);
    expect(readTipShown(throwing)).toBe(true);
    expect(() => storeTipShown(undefined)).not.toThrow();
    expect(() => storeTipShown(throwing)).not.toThrow();
  });
});

describe('the chord names a device stores', () => {
  it('offers Letters, the default, and Nashville numbers', () => {
    expect(CHORD_NAMES).toEqual([
      { value: 'letters', label: 'Letters' },
      { value: 'numbers', label: 'Nashville numbers' },
    ]);
    expect(readChordNames(mapStorage())).toBe('letters');
  });

  it('reads back each choice stored, under one key for the device', () => {
    const storage = mapStorage();
    storeChordNames(storage, 'numbers');
    expect(readChordNames(storage)).toBe('numbers');
    storeChordNames(storage, 'letters');
    expect(readChordNames(storage)).toBe('letters');
    expect([...storage.entries]).toEqual([['setlist-controller.chord-names', 'letters']]);
  });

  it('reads a stored value that is not a choice as Letters', () => {
    const storage = mapStorage();
    for (const value of ['Nashville numbers', 'NUMBERS', '', ' numbers', 'nashville']) {
      storage.entries.set('setlist-controller.chord-names', value);
      expect(readChordNames(storage), value).toBe('letters');
    }
  });

  it('reads Letters and stores without throwing on a device with no storage or one that throws', () => {
    expect(readChordNames(undefined)).toBe('letters');
    expect(readChordNames(throwing)).toBe('letters');
    expect(() => storeChordNames(undefined, 'numbers')).not.toThrow();
    expect(() => storeChordNames(throwing, 'numbers')).not.toThrow();
  });
});

describe('the capo a device stores for each song', () => {
  it('offers no capo and 1 to 7, no capo the default', () => {
    expect(CAPOS).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(readCapo(mapStorage(), 'Made Up Song')).toBe(0);
  });

  it('reads back each capo stored, under one key for the song', () => {
    const storage = mapStorage();
    for (const capo of [1, 2, 3, 4, 5, 6, 7]) {
      storeCapo(storage, 'Made Up Song', capo);
      expect(readCapo(storage, 'Made Up Song'), String(capo)).toBe(capo);
    }
    expect([...storage.entries]).toEqual([['setlist-controller.capo.made up song', '7']]);
  });

  it('forgets the capo for no capo', () => {
    const storage = mapStorage();
    storeCapo(storage, 'Made Up Song', 3);
    storeCapo(storage, 'Made Up Song', 0);
    expect(readCapo(storage, 'Made Up Song')).toBe(0);
    expect(storage.entries.size).toBe(0);
  });

  it('keeps one capo per song', () => {
    const storage = mapStorage();
    storeCapo(storage, 'Made Up Song', 3);
    storeCapo(storage, 'Another Made Up Song', 5);
    expect(readCapo(storage, 'Made Up Song')).toBe(3);
    expect(readCapo(storage, 'Another Made Up Song')).toBe(5);
    expect(readCapo(storage, 'A Third Song')).toBe(0);
  });

  it('finds the capo by the name rule, so a title in other case or spacing keeps it', () => {
    const storage = mapStorage();
    storeCapo(storage, 'Made Up Song', 2);
    expect(readCapo(storage, '  made   UP song ')).toBe(2);
    storeCapo(storage, 'MADE UP  SONG', 4);
    expect(readCapo(storage, 'Made Up Song')).toBe(4);
    expect(storage.entries.size).toBe(1);
  });

  it('reads a stored value that is not 1 to 7 as no capo', () => {
    const storage = mapStorage();
    for (const value of ['0', '8', '-1', '2.5', 'three', '', ' 3', '03']) {
      storage.entries.set('setlist-controller.capo.made up song', value);
      expect(readCapo(storage, 'Made Up Song'), value).toBe(0);
    }
  });

  it('reads no capo and stores without throwing on a device with no storage or one that throws', () => {
    expect(readCapo(undefined, 'Made Up Song')).toBe(0);
    expect(readCapo(throwing, 'Made Up Song')).toBe(0);
    expect(() => storeCapo(undefined, 'Made Up Song', 3)).not.toThrow();
    expect(() => storeCapo(throwing, 'Made Up Song', 3)).not.toThrow();
    expect(() => storeCapo(throwing, 'Made Up Song', 0)).not.toThrow();
  });

  it('keeps the chord names and the capos away from the part, the display, the view, the font size and the tip', () => {
    const storage = mapStorage();
    storePart(storage, 'Guitar');
    storeDisplay(storage, 'Guitar', 'lyrics-only');
    storeView(storage, 'set');
    storeFontSize(storage, 'large');
    storeTipShown(storage);
    storeChordNames(storage, 'numbers');
    storeCapo(storage, 'Made Up Song', 3);
    expect([readPart(storage), readDisplay(storage, 'Guitar'), readView(storage), readFontSize(storage), readTipShown(storage)]).toEqual(['Guitar', 'lyrics-only', 'set', 'large', true]);
    expect([readChordNames(storage), readCapo(storage, 'Made Up Song')]).toEqual(['numbers', 3]);
    expect(storage.entries.size).toBe(7);
  });
});

describe('the leader view a device stores', () => {
  it('offers Setlist, the default, and Timeline, in that order', () => {
    expect(LEADER_VIEWS.map((choice) => choice.value)).toEqual(['setlist', 'timeline']);
    expect(readLeaderView(mapStorage())).toBe('setlist');
  });

  it('reads back each view stored, under its own key', () => {
    const storage = mapStorage();
    for (const { value } of LEADER_VIEWS) {
      storeLeaderView(storage, value);
      expect(readLeaderView(storage), value).toBe(value);
    }
    expect([...storage.entries]).toEqual([['setlist-controller.leader-view', 'timeline']]);
  });

  it('reads a stored value that is not a leader view as Setlist', () => {
    const storage = mapStorage();
    for (const value of ['Timeline', 'SETLIST', '', ' timeline', 'set']) {
      storage.entries.set('setlist-controller.leader-view', value);
      expect(readLeaderView(storage), value).toBe('setlist');
    }
  });

  it('reads Setlist and stores without throwing on a device with no storage or one that throws', () => {
    expect(readLeaderView(undefined)).toBe('setlist');
    expect(readLeaderView(throwing)).toBe('setlist');
    expect(() => storeLeaderView(undefined, 'timeline')).not.toThrow();
    expect(() => storeLeaderView(throwing, 'timeline')).not.toThrow();
  });

  it('keeps away from the chart view setting', () => {
    const storage = mapStorage();
    storeView(storage, 'set');
    storeLeaderView(storage, 'timeline');
    expect(readView(storage)).toBe('set');
    expect(readLeaderView(storage)).toBe('timeline');
    expect(storage.entries.size).toBe(2);
  });
});

describe('the client ID a device keeps', () => {
  it('is the one it made on its first visit, so the device is the same one after a reload', () => {
    const storage = mapStorage();

    expect(readClientId(storage, 'viewer', () => 'made-1')).toBe('made-1');
    expect(readClientId(storage, 'viewer', () => 'made-2')).toBe('made-1');
  });

  it('is one for each page role, so a browser holding the producer page and a leader page is two devices', () => {
    const storage = mapStorage();

    expect(readClientId(storage, 'producer', () => 'made-1')).toBe('made-1');
    expect(readClientId(storage, 'leader', () => 'made-2')).toBe('made-2');
    expect(readClientId(storage, 'viewer', () => 'made-3')).toBe('made-3');
    expect(readClientId(storage, 'producer', () => 'made-4')).toBe('made-1');
  });

  it('is made again in place of a stored value the hub would refuse', () => {
    const storage = mapStorage({ 'setlist-controller.client-id.viewer': 'not an id' });

    expect(readClientId(storage, 'viewer', () => 'made-1')).toBe('made-1');
    expect(readClientId(storage, 'viewer', () => 'made-2')).toBe('made-1');
  });

  it('is made for the visit alone on a device that cannot store', () => {
    expect(readClientId(throwing, 'viewer', () => 'made-1')).toBe('made-1');
    expect(readClientId(undefined, 'viewer', () => 'made-2')).toBe('made-2');
  });

  it('is made as one the hub reads, and a fresh one each time', () => {
    const [first, second] = [newClientId(), newClientId()];

    expect(parseHello(JSON.stringify({ kind: 'hello', client: first, name: 'Keys' }))?.client).toBe(first);
    expect(first).not.toBe(second);
  });
});

describe('the name a device goes by', () => {
  it('reads back the name stored, trimmed', () => {
    const storage = mapStorage();

    storeDeviceName(storage, '  Stage left  ');

    expect(readDeviceName(storage)).toBe('Stage left');
  });

  it('forgets the name when a blank one is stored, so the device goes by its default again', () => {
    const storage = mapStorage();
    storeDeviceName(storage, 'Stage left');

    storeDeviceName(storage, '   ');

    expect(readDeviceName(storage)).toBeNull();
    expect(storage.entries.size).toBe(0);
  });

  it('is read again when another tab stores one or clears the storage, so every tab of the device says hello with it', () => {
    const storage = mapStorage();
    const page = new EventTarget();
    const stored = (key: string | null) => page.dispatchEvent(Object.assign(new Event('storage'), { key }));
    const names: (string | null)[] = [];
    const stop = watchDeviceName(page, storage, (name) => names.push(name));

    storeDeviceName(storage, 'Stage left');
    stored('setlist-controller.device-name');
    storeDeviceName(storage, '');
    stored(null);
    stop();
    storeDeviceName(storage, 'Stage right');
    stored('setlist-controller.device-name');

    expect(names).toEqual(['Stage left', null]);
  });

  it('is not read again when another tab stores some other setting, so a name typed here and not yet stored stays', () => {
    const storage = mapStorage();
    const page = new EventTarget();
    const names: (string | null)[] = [];
    watchDeviceName(page, storage, (name) => names.push(name));

    storePart(storage, 'Bass');
    page.dispatchEvent(Object.assign(new Event('storage'), { key: 'setlist-controller.part' }));

    expect(names).toEqual([]);
  });

  it('reads no name on a device that never stored one or cannot store', () => {
    expect(readDeviceName(mapStorage())).toBeNull();
    expect(readDeviceName(throwing)).toBeNull();
    expect(() => storeDeviceName(throwing, 'Stage left')).not.toThrow();
  });

  it("defaults to the leader's or the producer's role, else the band part picked, else View only", () => {
    expect(defaultDeviceName('leader', null)).toBe('Leader');
    expect(defaultDeviceName('producer', 'Keys')).toBe('Producer');
    expect(defaultDeviceName('viewer', 'Bass')).toBe('Bass');
    expect(defaultDeviceName('viewer', null)).toBe('View only');
  });
});

describe('the messages a device dismissed', () => {
  it('holds a dismissed message once stored, and never a message it did not dismiss', () => {
    const storage = mapStorage();
    expect(readDismissedMessages(storage)).toEqual([]);

    storeDismissedMessage(storage, 'm1');

    expect(readDismissedMessages(storage)).toEqual(['m1']);
    expect(readDismissedMessages(storage)).not.toContain('m2');
  });

  it('keeps the newest dismissed IDs alone, so the list never grows without end', () => {
    const storage = mapStorage();
    const ids = Array.from({ length: MAX_DISMISSED_MESSAGES + 5 }, (_, index) => `m${index}`);
    for (const id of ids) storeDismissedMessage(storage, id);

    expect(readDismissedMessages(storage)).toEqual(ids.slice(5));
  });

  it('reads none, and stores without throwing, on a device with no storage, one that throws, or a stored value that is not a list of IDs', () => {
    expect(readDismissedMessages(undefined)).toEqual([]);
    expect(readDismissedMessages(throwing)).toEqual([]);
    expect(readDismissedMessages(mapStorage({ 'setlist-controller.dismissed-messages': '{"a":1}' }))).toEqual([]);
    expect(readDismissedMessages(mapStorage({ 'setlist-controller.dismissed-messages': 'not json' }))).toEqual([]);
    expect(readDismissedMessages(mapStorage({ 'setlist-controller.dismissed-messages': '["m1",2]' }))).toEqual(['m1']);
    expect(() => storeDismissedMessage(undefined, 'm1')).not.toThrow();
    expect(() => storeDismissedMessage(throwing, 'm1')).not.toThrow();
  });
});
