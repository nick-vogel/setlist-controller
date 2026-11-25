import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import type { Command } from '../src/shared/command.ts';
import { activeSong } from '../src/shared/safe-mode.ts';
import type { ProducerSnapshot, SetList, Snapshot } from '../src/shared/snapshot.ts';
import { Page } from '../web/src/App.tsx';
import { STOP_HOLD_MS } from '../web/src/hold.ts';
import { SafeModeToggle } from '../web/src/SafeModeToggle.tsx';
import { TimelinePauseButton } from '../web/src/TimelinePauseButton.tsx';
import { readStylesheet, type Element } from './css.ts';
import { fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Client, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const SET: CuePoint[] = [
  { name: '1 - Count Off', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Intro', time: 48 },
  { name: '2 - Chorus', time: 64 },
  { name: '2 - End', time: 80 },
];

const BEAT_MS = 500;
const JUMP = '/live/song/cue_point/jump';
const CONTINUE = '/live/song/continue_playing';
const START = '/live/song/start_playing';
const STOP = '/live/song/stop_playing';

const at = (beats: number) => (snapshot: Snapshot) => loaded(snapshot) && snapshot.position === beats;

// The controller publishes a refused command's snapshot, if any, before the barrier's on the same
// socket, so the barrier's proves what the refusal left. Live's inbox fills over UDP later and cannot
// prove an absence.
async function barrier(client: Client) {
  const from = client.received.length;
  const toggle = client.received.at(-1)?.endToggles[2] === 'stop' ? 'continue' : 'stop';
  client.send({ kind: 'set-end-toggle', song: 2, toggle });
  return client.snapshot((s) => s.endToggles[2] === toggle && client.received.indexOf(s) >= from);
}

describe('safe mode (server rig)', () => {
  it('starts enabled on every server start, toggles from leader and producer, rejects viewers, and never persists across restarts', async () => {
    rig = await startRig(SET, { playing: false, position: 8 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    const producer = await rig.connectProducer();

    expect((await viewer.snapshot(loaded)).safeMode).toBe(true);
    expect((await leader.snapshot(loaded)).safeMode).toBe(true);
    expect((await producer.snapshot(loaded)).safeMode).toBe(true);

    // View-only sockets cannot change Safe Mode.
    viewer.send({ kind: 'set-safe-mode', enabled: false });
    await viewer.flush();
    expect((await barrier(leader)).safeMode).toBe(true);

    // Leader toggles Safe Mode off -> every connected client sees false.
    leader.send({ kind: 'set-safe-mode', enabled: false });
    expect((await viewer.snapshot((s) => !s.safeMode)).safeMode).toBe(false);
    expect((await leader.snapshot((s) => !s.safeMode)).safeMode).toBe(false);
    expect((await producer.snapshot((s) => !s.safeMode)).safeMode).toBe(false);

    // A payload that is not a boolean changes nothing, even one that reads as true.
    leader.send({ kind: 'set-safe-mode', enabled: 'yes' });
    expect((await barrier(leader)).safeMode).toBe(false);

    // Producer toggles Safe Mode back on -> every connected client sees true.
    const viewerFrom = viewer.received.length;
    const leaderFrom = leader.received.length;
    producer.send({ kind: 'set-safe-mode', enabled: true });
    expect((await viewer.snapshot((s) => s.safeMode && viewer.received.indexOf(s) >= viewerFrom)).safeMode).toBe(true);
    expect((await leader.snapshot((s) => s.safeMode && leader.received.indexOf(s) >= leaderFrom)).safeMode).toBe(true);

    // Nor one that reads as false.
    leader.send({ kind: 'set-safe-mode', enabled: 0 });
    expect((await barrier(leader)).safeMode).toBe(true);

    // Producer turns Safe Mode off again, then the server restarts -> always back to true.
    const leaderFromOff = leader.received.length;
    producer.send({ kind: 'set-safe-mode', enabled: false });
    await leader.snapshot((s) => !s.safeMode && leader.received.indexOf(s) >= leaderFromOff);

    await rig.close();
    rig = await startRig(SET, { playing: false, position: 8 });
    const freshLeader = await rig.connectLeader();
    expect((await freshLeader.snapshot(loaded)).safeMode).toBe(true);
  });

  it('can be toggled before Live connects and stays as set once Live connects', async () => {
    rig = await startRig(SET, { playing: false, position: 8 }, { liveRunning: false });
    const leader = await rig.connectLeader();
    expect((await leader.snapshot()).safeMode).toBe(true);

    leader.send({ kind: 'set-safe-mode', enabled: false });
    expect((await leader.snapshot((s) => !s.safeMode)).safeMode).toBe(false);

    await rig.startLive();
    await rig.advanceConnected(1000);
    const connected = await leader.snapshot(loaded);
    expect(connected.safeMode).toBe(false);
  });

  it('refuses cross-song jumps and Play from start while playing with Safe Mode on, while allowing same-song jumps', async () => {
    rig = await startRig(SET, { playing: true, position: 10 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((s) => at(10)(s) && s.playing && s.safeMode);

    // Cross-song jump and cross-song play-from-start are refused.
    leader.send({ kind: 'jump', song: 2, section: 0 });
    leader.send({ kind: 'play-from-start', song: 2 });
    expect((await barrier(leader)).jump).toBeNull();

    expect(rig.received(JUMP)).toEqual([]);
    expect(rig.received(CONTINUE)).toEqual([]);
    expect(rig.received(START)).toEqual([]);

    // Same-song jump still works while Safe Mode is on.
    leader.send({ kind: 'jump', song: 1, section: 2 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(1));
    expect((await viewer.snapshot((s) => s.jump !== null)).jump).toEqual({ song: 1, section: 2 });

    // Cross the bar line at beat 12 -> lands in Song 1 Verse (beat 24).
    rig.live.advance(3 * BEAT_MS);
    const landed = await viewer.snapshot(at(25));
    expect(landed.now).toMatchObject({ song: 1, section: 2 });
    expect(landed.jump).toBeNull();

    // Same-song Play from start also works while playing with Safe Mode on.
    leader.send({ kind: 'play-from-start', song: 1 });
    await vi.waitFor(() => expect(rig?.received(CONTINUE)).toHaveLength(1));
    expect((await viewer.snapshot((s) => s.jump?.song === 1 && s.jump.section === 0)).jump).toEqual({ song: 1, section: 0 });
  });

  it('keeps the slide change a target with a lead has scheduled when Safe Mode refuses a cross-song jump or Play from start', async () => {
    const lead = 2;
    const introChange = 16;
    const target: FakeTarget = {
      ...fakeTarget({ name: 'propresenter', label: 'ProPresenter' }),
      lead,
      plan: (cue) => (cue.section === 'end' ? [{ beat: 0, slide: 0 }] : [{ beat: 0, slide: 0 }, { beat: 8, slide: 1 }]),
    };
    rig = await startRig(SET, { playing: true, position: 6 }, { targets: [target] });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();
    await producer.snapshot((s) => at(6)(s) && s.connections[0]?.connection === 'online');
    producer.send({ kind: 'arm', target: 'propresenter' });
    await producer.snapshot((s) => s.connections[0]?.arm === 'armed');
    rig.live.advance(4 * BEAT_MS);
    await producer.snapshot(at(10));
    const reported = rig.clock.now();
    expect(target.cues.map(({ song, section, slide }) => ({ song, section, slide }))).toEqual([{ song: 1, section: 1, slide: 0 }]);

    leader.send({ kind: 'jump', song: 2, section: 0 });
    leader.send({ kind: 'play-from-start', song: 2 });
    leader.send({ kind: 'set-end-toggle', song: 2, toggle: 'continue' });
    const after = await leader.snapshot((s) => s.endToggles[2] === 'continue');
    expect(after.jump).toBeNull();
    const cuesBefore = target.cues.length;

    await rig.advanceConnected(reported + (introChange - lead - 10) * BEAT_MS - rig.clock.now());
    expect(target.cues.slice(cuesBefore).map(({ song, section, slide }) => ({ song, section, slide }))).toEqual([{ song: 1, section: 1, slide: 1 }]);
    expect(target.cues.filter((cue) => cue.song === 2)).toEqual([]);
  });

  it('refuses cross-song jumps while playing in a gap between songs or during a held count-in when Safe Mode is on', async () => {
    rig = await startRig(SET, { playing: true, position: 44 });
    const leader = await rig.connectLeader();
    await leader.snapshot((s) => at(44)(s) && s.playing && s.now === null);

    leader.send({ kind: 'jump', song: 2, section: 0 });
    leader.send({ kind: 'play-from-start', song: 2 });
    expect((await barrier(leader)).jump).toBeNull();
    expect(rig.received(JUMP)).toEqual([]);

    // Stop Live and start a count-in to Song 1 Verse.
    const beforeStop = leader.received.length;
    leader.send({ kind: 'stop' });
    await leader.snapshot((s) => !s.playing && leader.received.indexOf(s) >= beforeStop);
    leader.send({ kind: 'count-in', song: 1, section: 2 });
    await leader.snapshot((s) => s.playing && s.countIn);

    const jumpsAfterCountIn = rig.received(JUMP).length;
    // Cross-song tap during count-in is refused; same-song retarget to Intro succeeds.
    leader.send({ kind: 'jump', song: 2, section: 0 });
    expect((await barrier(leader)).jump).toEqual({ song: 1, section: 2 });
    expect(rig.received(JUMP)).toHaveLength(jumpsAfterCountIn);

    leader.send({ kind: 'jump', song: 1, section: 1 });
    expect((await leader.snapshot((s) => s.jump?.song === 1 && s.jump.section === 1)).countIn).toBe(true);
  });

  it('allows cross-song jumps while stopped even with Safe Mode on, and while playing once Safe Mode is turned off', async () => {
    rig = await startRig(SET, { playing: false, position: 10 });
    const viewer = await rig.connectViewer();
    const leader = await rig.connectLeader();
    await leader.snapshot((s) => at(10)(s) && !s.playing && s.safeMode);

    // Cross-song jump while stopped works with Safe Mode on.
    leader.send({ kind: 'jump', song: 2, section: 0 });
    await viewer.snapshot(at(48));

    // Start playing Song 2 and try jumping to Song 1 while Safe Mode is still on -> refused.
    leader.send({ kind: 'play-from-start', song: 2 });
    await viewer.snapshot((s) => s.playing && s.now?.song === 2);
    const jumpsBefore = rig.received(JUMP).length;
    leader.send({ kind: 'jump', song: 1, section: 1 });
    expect((await barrier(leader)).jump).toBeNull();
    expect(rig.received(JUMP)).toHaveLength(jumpsBefore);

    // Turn Safe Mode off -> cross-song jump while playing now queues and lands in Song 1.
    leader.send({ kind: 'set-safe-mode', enabled: false });
    await leader.snapshot((s) => !s.safeMode);

    leader.send({ kind: 'jump', song: 1, section: 1 });
    await vi.waitFor(() => expect(rig?.received(JUMP)).toHaveLength(jumpsBefore + 1));
    expect((await viewer.snapshot((s) => s.jump?.song === 1 && s.jump.section === 1)).jump).toEqual({ song: 1, section: 1 });

    const beforeJumpBack = viewer.received.length;
    rig.live.advance(5 * BEAT_MS);
    const inSong1 = await viewer.snapshot((s) => s.now?.song === 1 && s.now.section === 1 && viewer.received.indexOf(s) >= beforeJumpBack);
    expect(inSong1.jump).toBeNull();
    expect(inSong1.playing).toBe(true);

    // Cross-song Play from start also works while playing with Safe Mode off.
    leader.send({ kind: 'play-from-start', song: 2 });
    expect((await viewer.snapshot((s) => s.jump?.song === 2 && s.jump.section === 0)).jump).toEqual({ song: 2, section: 0 });
    expect(rig.received(STOP)).toEqual([]);
  });
});

const UI_SET: SetList = {
  songs: [
    {
      number: 1,
      title: 'Build My Life',
      sections: [
        { name: 'Intro', time: 0, end: 16, cue: 0 },
        { name: 'Verse', time: 16, end: 32, cue: 1 },
      ],
      end: 32,
      endCue: 2,
    },
    {
      number: 2,
      title: 'Goodness of God',
      sections: [
        { name: 'Intro', time: 40, end: 56, cue: 3 },
        { name: 'Chorus', time: 56, end: 72, cue: 4 },
      ],
      end: 72,
      endCue: 5,
    },
  ],
  warnings: [],
};

const BASE_SNAPSHOT: ProducerSnapshot = {
  live: 'connected',
  set: UI_SET,
  playing: true,
  position: 4,
  now: { song: 1, section: 0, next: 1, bar: 2, bars: 4, fraction: 0.25 },
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop', 2: 'stop' },
  loop: null,
  safeMode: true,
  fade: null,
  chartRevision: 1,
  songMeters: { 1: 4, 2: 4 },
  songTimings: {},
  power: { source: 'ac', percent: 100 },
  connections: [],
  connectionProblems: [],
};

describe('activeSong', () => {
  it('guards the held count-in song even when now points elsewhere or nowhere, and ignores a waiting jump outside a count-in', () => {
    const inSong1 = BASE_SNAPSHOT.now;
    expect(activeSong(true, { song: 2, section: 1 }, inSong1)).toBe(2);
    expect(activeSong(true, { song: 2, section: 1 }, null)).toBe(2);
    expect(activeSong(false, { song: 2, section: 0 }, inSong1)).toBe(1);
    expect(activeSong(false, null, null)).toBeNull();
  });
});

const stylesheet = readStylesheet(resolve(import.meta.dirname, '../web/src/styles.css'));

const buttonsIn = (markup: string) =>
  [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attrs = '', body = '']) => ({
    attrs,
    label: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    disabled: /disabled=""/.test(attrs),
  }));

describe('Safe Mode UI and Timeline Pause guard', () => {
  const renderPage = (role: 'leader' | 'producer' | 'viewer', overrides: Partial<ProducerSnapshot> = {}, leaderView: 'setlist' | 'timeline' = 'setlist', connected = true) =>
    renderToStaticMarkup(createElement(Page, { role, snapshot: { ...BASE_SNAPSHOT, ...overrides }, connected, send: () => {}, leaderView }));

  it('shows Safe Mode status and toggle on leader (Setlist & Timeline) and producer pages, and never on viewer', () => {
    for (const [role, view] of [
      ['leader', 'setlist'],
      ['leader', 'timeline'],
      ['producer', 'setlist'],
    ] as const) {
      const onMarkup = renderPage(role, { safeMode: true }, view);
      expect(onMarkup, `${role}/${view} on`).toContain('Safe Mode: On');
      expect(onMarkup, `${role}/${view} on`).toContain('aria-pressed="true"');

      const offMarkup = renderPage(role, { safeMode: false }, view);
      expect(offMarkup, `${role}/${view} off`).toContain('Safe Mode: Off');
      expect(offMarkup, `${role}/${view} off`).toContain('aria-pressed="false"');
    }

    const viewer = renderPage('viewer', { safeMode: true });
    expect(viewer).not.toContain('Safe Mode');
  });

  it('sends set-safe-mode with the toggled boolean on click', () => {
    const sent: Command[] = [];
    const onEl = SafeModeToggle({ safeMode: true, available: true, send: (c) => sent.push(c) });
    (onEl.props as { onClick(): void }).onClick();
    const offEl = SafeModeToggle({ safeMode: false, available: true, send: (c) => sent.push(c) });
    (offEl.props as { onClick(): void }).onClick();
    expect(sent).toEqual([
      { kind: 'set-safe-mode', enabled: false },
      { kind: 'set-safe-mode', enabled: true },
    ]);
  });

  it('keeps Previous song and Next song disabled while playing regardless of Safe Mode', () => {
    for (const safeMode of [true, false]) {
      const markup = renderPage('leader', { playing: true, safeMode });
      const transport = /<section class="transport"[^>]*>(.*?)<\/section>/.exec(markup)?.[1] ?? '';
      const stepButtons = buttonsIn(transport).filter((b) => b.label === 'Previous song' || b.label === 'Next song');
      expect(stepButtons, `safeMode=${safeMode}`).toEqual([
        { attrs: expect.any(String), label: 'Previous song', disabled: true },
        { attrs: expect.any(String), label: 'Next song', disabled: true },
      ]);
    }
  });

  it('disables cross-song Play from start on Setlist view while playing with Safe Mode on, and enables it with Safe Mode off', () => {
    const songPlayButtons = (safeMode: boolean) => {
      const markup = renderPage('leader', { playing: true, safeMode });
      return [...markup.matchAll(/<section class="song">(.*?)<\/section>/g)].map(([, body = '']) => {
        const btn = buttonsIn(body).find((b) => b.label === 'Play from start');
        return btn?.disabled;
      });
    };

    // Song 1 (current) enabled, Song 2 (other) disabled while Safe Mode is on.
    expect(songPlayButtons(true)).toEqual([false, true]);
    // Both enabled while Safe Mode is off.
    expect(songPlayButtons(false)).toEqual([false, false]);
  });

  it('marks cross-song Timeline sections safe-guarded only while playing with Safe Mode on', () => {
    const song2Section = (markup: string) =>
      markup.match(/<button[^>]*data-song="2"[^>]*data-section="0"[^>]*>/)?.[0] ?? '';

    const onPlaying = song2Section(renderPage('leader', { playing: true, safeMode: true }, 'timeline'));
    expect(onPlaying).toContain('safe-guarded');
    expect(onPlaying).toContain('aria-disabled="true"');

    const offPlaying = song2Section(renderPage('leader', { playing: true, safeMode: false }, 'timeline'));
    expect(offPlaying).not.toContain('safe-guarded');
    expect(offPlaying).not.toContain('aria-disabled');

    const onStopped = song2Section(renderPage('leader', { playing: false, safeMode: true }, 'timeline'));
    expect(onStopped).not.toContain('safe-guarded');
    expect(onStopped).not.toContain('aria-disabled');
  });

  it('renders Timeline Pause with one-second hold chrome when Safe Mode is on, and single-tap when Safe Mode is off', () => {
    const holdMarkup = renderToStaticMarkup(createElement(TimelinePauseButton, { available: true, safeMode: true, send: () => {} }));
    expect(holdMarkup).toContain('Hold to pause');
    expect(holdMarkup).toContain('stop-fill');
    expect(holdMarkup).toContain('hold-required');

    const tapMarkup = renderToStaticMarkup(createElement(TimelinePauseButton, { available: true, safeMode: false, send: () => {} }));
    expect(tapMarkup).not.toContain('Hold to pause');
    expect(tapMarkup).not.toContain('stop-fill');

    const fill = (classes: string[]): Element[] => [
      { tag: 'html' },
      { tag: 'body' },
      { tag: 'main', classes: ['timeline-page'] },
      { tag: 'div', classes: ['timeline-view'] },
      { tag: 'section', classes: ['timeline-transport'] },
      { tag: 'button', classes },
      { tag: 'span', classes: ['stop-fill'] },
    ];
    expect(stylesheet.value(fill(['timeline-pause', 'hold-required']), 'transform')).toBe('scaleX(0)');
    expect(stylesheet.value(fill(['timeline-pause', 'hold-required', 'holding']), 'transform')).toBe('scaleX(1)');
    expect(stylesheet.value(fill(['timeline-pause', 'hold-required', 'holding']), 'transition')).toBe(`transform ${STOP_HOLD_MS}ms linear`);
    expect(stylesheet.value(fill(['timeline-pause', 'hold-required']).slice(0, -1), 'touch-action')).toBe('none');
  });
});
