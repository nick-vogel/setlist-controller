import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuePoint, FakeLiveOptions } from '../src/fake-live/fake-live.ts';
import type { Cue } from '../src/server/cues.ts';
import type { ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeTarget } from './fake-target.ts';
import { loaded, startRig, type Rig } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

// At 120 BPM in 4/4 a beat is 500 ms and a bar is 4 beats.
const BEAT_MS = 500;

// One song, as connections.test.ts has it.
const SONG: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];

const cue = (section: number | 'end', name: string, cause: Cue['cause']): Cue => ({ song: 1, title: null, section, name, cause });
const verse = (cause: Cue['cause']) => cue(1, 'Verse', cause);
const chorus = (cause: Cue['cause']) => cue(2, 'Chorus', cause);
const end = (cause: Cue['cause']) => cue('end', 'End', cause);

// Live reports the playhead as float32, so a position is compared within a hair.
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-3;

// A rig whose fake Live starts where `setup` puts it, with one fake target armed by the producer and a
// leader connected, once both pages see the set. Every helper waits for the producer to see the change
// it makes, and a cue reaches the target before the pages hear of the change that raised it.
async function armedRig(cuePoints: CuePoint[], setup: Pick<FakeLiveOptions, 'playing' | 'position'>) {
  const target = fakeTarget({ name: 'propresenter', label: 'ProPresenter' });
  const started = await startRig(cuePoints, setup, { targets: [target] });
  rig = started;
  const producer = await started.connectProducer();
  const leader = await started.connectLeader();
  const online = (snapshot: ProducerSnapshot) => loaded(snapshot) && snapshot.connections[0]?.connection === 'online';
  await producer.snapshot((snapshot) => online(snapshot) && near(snapshot.position, setup.position ?? 0));
  await leader.snapshot(loaded);

  // Resolves with the first snapshot the producer receives from now on that matches.
  const next = (matches: (snapshot: ProducerSnapshot) => boolean) => {
    const start = producer.received.length;
    return producer.snapshot((snapshot) => producer.received.indexOf(snapshot) >= start && matches(snapshot));
  };
  const armed = next((snapshot) => snapshot.connections[0]?.arm === 'armed');
  producer.send({ kind: 'arm', target: 'propresenter' });
  await armed;

  return {
    target,
    // The leader's command, once the producer sees the snapshot it gives.
    async lead(command: unknown, gives: (snapshot: ProducerSnapshot) => boolean) {
      const seen = next(gives);
      leader.send(command);
      return seen;
    },
    // The snapshot can reach a page before the OSC reaches the fake Live, so a test that moves Live's
    // playhead after a command waits for Live to hold every message sent to that address so far.
    async liveHas(address: string, count: number) {
      await vi.waitFor(() => expect(started.received(address)).toHaveLength(count));
    },
    // Plays on for that many beats, and waits for the playhead where Live then puts it.
    async play(beats: number, landsOn: number) {
      const seen = next((snapshot) => near(snapshot.position, landsOn));
      started.live.advance(beats * BEAT_MS);
      await seen;
    },
    // Moves the playhead at once, as a drag at the laptop does.
    async moveTo(beats: number) {
      const seen = next((snapshot) => near(snapshot.position, beats));
      started.live.setPosition(beats);
      await seen;
    },
    // Starts or stops Live at the laptop.
    async setPlaying(playing: boolean) {
      const seen = next((snapshot) => snapshot.playing === playing);
      started.live.setPlaying(playing);
      await seen;
    },
  };
}

const JUMP = '/live/song/cue_point/jump';

describe('nothing while stopped', () => {
  it('fires nothing on Stop, nor on a jump or a move while stopped', async () => {
    const { target, lead, moveTo } = await armedRig(SONG, { playing: true, position: 8 });
    await moveTo(16);

    await lead({ kind: 'stop' }, (snapshot) => !snapshot.playing);
    await lead({ kind: 'jump', song: 1, section: 2 }, (snapshot) => near(snapshot.position, 32));
    await moveTo(8);
    await moveTo(16);

    expect(target.cues).toEqual([verse('played-into')]);
  });

  // The jump the page's Previous song and Next song send while Live is stopped.
  it("fires nothing on a jump to another song's Count Off while stopped, and starts nothing", async () => {
    const { target, lead, liveHas } = await armedRig(
      [
        { name: '1 - Count Off', time: 0 },
        { name: '1 - Verse', time: 8 },
        { name: '1 - End', time: 24 },
        { name: '2 - Count Off', time: 32 },
        { name: '2 - Verse', time: 40 },
        { name: '2 - End', time: 56 },
      ],
      { playing: false, position: 8 },
    );
    const landedOn = (song: number, position: number) => (snapshot: ProducerSnapshot) =>
      near(snapshot.position, position) && snapshot.now?.song === song && snapshot.now.section === 0 && snapshot.jump === null;

    const forward = await lead({ kind: 'jump', song: 2, section: 0 }, landedOn(2, 32));
    const back = await lead({ kind: 'jump', song: 1, section: 0 }, landedOn(1, 0));
    await liveHas(JUMP, 2);

    expect(forward.playing).toBe(false);
    expect(back.playing).toBe(false);
    // Song 2's Count Off is Live's fourth cue point, and song 1's its first.
    expect(rig!.received(JUMP)).toEqual([
      { address: JUMP, args: [3], types: 'i' },
      { address: JUMP, args: [0], types: 'i' },
    ]);
    expect(rig!.received('/live/song/start_playing')).toEqual([]);
    expect(rig!.received('/live/song/continue_playing')).toEqual([]);
    expect(target.cues).toEqual([]);
  });
});

describe("a song's End", () => {
  it('fires a cue named End when the playhead plays into it', async () => {
    const { target, play } = await armedRig(SONG, { playing: true, position: 40 });

    await play(8, 48);

    expect(target.cues).toEqual([end('played-into')]);
  });

  it('fires End with the cause jump when Next on the last section lands there', async () => {
    const { target, lead, liveHas, play } = await armedRig(SONG, { playing: true, position: 40 });

    await lead({ kind: 'next' }, (snapshot) => snapshot.jump?.section === 'end');
    await liveHas(JUMP, 1);
    expect(target.cues).toEqual([]);
    // The bar line is beat 44, so Live lands on End, 48, and plays on a beat.
    await play(5, 49);

    expect(target.cues).toEqual([end('jump')]);
  });
});

describe('a jump', () => {
  it('fires nothing on the tap and one cue when Live lands on the next bar line', async () => {
    const { target, lead, liveHas, play } = await armedRig(SONG, { playing: true, position: 0 });

    await lead({ kind: 'jump', song: 1, section: 2 }, (snapshot) => snapshot.jump?.section === 2);
    await liveHas(JUMP, 1);
    expect(target.cues).toEqual([]);
    // The bar line is beat 4, so Live lands on the Chorus, 32, and plays on a beat.
    await play(5, 33);
    await play(4, 37);

    expect(target.cues).toEqual([chorus('jump')]);
  });

  it('to the start of the section playing fires that section again on the bar line', async () => {
    const { target, lead, liveHas, play } = await armedRig(SONG, { playing: true, position: 20 });

    await lead({ kind: 'jump', song: 1, section: 1 }, (snapshot) => snapshot.jump?.section === 1);
    await liveHas(JUMP, 1);
    expect(target.cues).toEqual([]);
    // The bar line is beat 24, so Live lands back on the Verse, 16, and plays on a beat.
    await play(5, 17);

    expect(target.cues).toEqual([verse('jump')]);
  });

  it('fires once when playback enters the target before Live makes the jump', async () => {
    const { target, lead, play, moveTo } = await armedRig(SONG, { playing: true, position: 15.6 });
    // Live never gets this tap, so playback alone carries the playhead into the Verse.
    rig!.live.loseNext(JUMP);

    // A late tap, 0.4 beats before the Verse's bar line, which Live may make on the bar line after.
    await lead({ kind: 'jump', song: 1, section: 1 }, (snapshot) => snapshot.jump?.section === 1);
    await vi.waitFor(() => expect(rig!.live.lost).toHaveLength(1));
    await play(2, 17.6);
    expect(target.cues).toEqual([verse('jump')]);
    // Live makes the jump on the bar line after, back to the Verse's start.
    await play(2, 19.6);
    await moveTo(16.4);
    await play(8, 24.4);

    expect(target.cues).toEqual([verse('jump')]);
    expect(rig!.received(JUMP)).toEqual([]);
  });
});

describe('a loop', () => {
  it("fires the looped section's cue once for every wrap", async () => {
    const { target, lead, play } = await armedRig(SONG, { playing: true, position: 20 });

    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 1);
    await play(12, 16);
    await play(12, 28);
    await play(12, 24);
    await play(12, 20);

    expect(target.cues).toEqual([verse('loop'), verse('loop'), verse('loop')]);
  });

  it('on the last section fires no End as it wraps, even on a report a hair before the wrap', async () => {
    const { target, lead, play, moveTo } = await armedRig(SONG, { playing: true, position: 36 });

    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 2);
    await play(12, 32);
    await moveTo(47.99995);
    await play(2, 34);

    expect(target.cues).toEqual([chorus('loop'), chorus('loop')]);
  });

  it('mid-song fires only the looped section as it wraps on a report on the brace end, or a hair before it', async () => {
    const { target, lead, moveTo } = await armedRig(SONG, { playing: true, position: 20 });

    await lead({ kind: 'loop' }, (snapshot) => snapshot.loop?.section?.section === 1);
    await moveTo(Math.fround(31.99995));
    await moveTo(16.5);
    await moveTo(32);
    await moveTo(17);

    expect(target.cues).toEqual([verse('loop'), verse('loop')]);
  });
});

// Two songs as the set builder lays out an overlap: song 2's Count Off on song 1's End.
const TWO_SONGS: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Count Off (Trust)', time: 40 },
  { name: '2 - Intro', time: 48 },
  { name: '2 - Verse', time: 64 },
  { name: '2 - End', time: 80 },
];
const COUNT_OFF_2: Cue = { song: 2, title: 'Trust', section: 0, name: 'Count Off', cause: 'play-from-start' };

describe('Play from start, and a start from the start of a section', () => {
  it("fires the song's Count Off with the cause Play from start while stopped", async () => {
    const { target, lead } = await armedRig(TWO_SONGS, { playing: false, position: 28 });

    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.playing && near(snapshot.position, 40));

    expect(target.cues).toEqual([COUNT_OFF_2]);
  });

  // Which of the jump and the start Live reports first is unconfirmed. Losing the jump on its way to
  // the fake Live has it start where it sat; the move after stands in for the jump reported late.
  it('fires the Count Off alone while stopped when Live reports the start before the jump', async () => {
    const { target, lead, moveTo, play } = await armedRig(TWO_SONGS, { playing: false, position: 28 });
    rig!.live.loseNext(JUMP);

    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.playing && near(snapshot.position, 28));
    expect(target.cues).toEqual([]);
    await moveTo(40);
    await play(1, 41);

    expect(target.cues).toEqual([COUNT_OFF_2]);
  });

  it('fires the Count Off alone from later in the same song when Live reports the start before the jump', async () => {
    const { target, lead, moveTo, play } = await armedRig(TWO_SONGS, { playing: false, position: 66 });
    rig!.live.loseNext(JUMP);

    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.playing && near(snapshot.position, 66));
    await moveTo(40);
    await play(1, 41);

    expect(target.cues).toEqual([COUNT_OFF_2]);
  });

  it('fires nothing on the tap and the Count Off on the bar line while playing', async () => {
    const { target, lead, liveHas, play } = await armedRig(TWO_SONGS, { playing: true, position: 28 });

    await lead({ kind: 'play-from-start', song: 2 }, (snapshot) => snapshot.jump?.song === 2);
    await liveHas(JUMP, 1);
    expect(target.cues).toEqual([]);
    // The bar line is beat 32, so Live lands on song 2's Count Off, 40, and plays on a beat.
    await play(5, 41);
    await play(4, 45);

    expect(target.cues).toEqual([COUNT_OFF_2]);
  });

  it('fires the section a jump while stopped put the playhead on once Live starts, as played into', async () => {
    const { target, lead, setPlaying } = await armedRig(SONG, { playing: false, position: 0 });

    await lead({ kind: 'jump', song: 1, section: 2 }, (snapshot) => near(snapshot.position, 32));
    expect(target.cues).toEqual([]);
    await setPlaying(true);

    expect(target.cues).toEqual([chorus('played-into')]);
  });

  // Which of the playhead moving on and the start Live reports first is unconfirmed. The move while
  // still stopped stands in for Live reporting the playhead it has already played on.
  it('fires the section Live started on when Live reports the playhead moving on before the start', async () => {
    const { target, moveTo, setPlaying, play } = await armedRig(TWO_SONGS, { playing: false, position: 48 });

    await moveTo(48.1);
    await setPlaying(true);
    await play(0.4, 48.5);

    expect(target.cues).toEqual([{ song: 2, title: 'Trust', section: 1, name: 'Intro', cause: 'played-into' }]);
  });

  it('fires nothing for a start mid-section, until the next section', async () => {
    const { target, setPlaying, play } = await armedRig(SONG, { playing: false, position: 20 });

    await setPlaying(true);
    expect(target.cues).toEqual([]);
    await play(12, 32);

    expect(target.cues).toEqual([chorus('played-into')]);
  });
});

// Three songs as the set builder lays them out: song 1 overlaps into song 2, song 2 pads into song 3,
// and song 3, last, has its own pad, faded out after Pad Out.
const BUILT_SET: CuePoint[] = [
  { name: '1 - Count Off (Grace)', time: 0 },
  { name: '1 - Intro', time: 8 },
  { name: '1 - Verse', time: 24 },
  { name: '1 - End', time: 40 },
  { name: '2 - Count Off (Trust)', time: 40 },
  { name: '2 - Intro', time: 48 },
  { name: '2 - Ending', time: 64 },
  { name: '2 - Pad', time: 72 },
  { name: '2 - End', time: 88 },
  { name: '3 - Count Off (Goodness)', time: 88 },
  { name: '3 - Intro', time: 96 },
  { name: '3 - Ending', time: 112 },
  { name: '3 - Pad', time: 120 },
  { name: '3 - Pad Out', time: 136 },
  { name: '3 - End', time: 152 },
];

describe('a built set', () => {
  it('fires Count Off, Pad and Pad Out as sections, and each End, in the order they play', async () => {
    const { target, setPlaying, play } = await armedRig(BUILT_SET, { playing: false, position: 0 });

    await setPlaying(true);
    for (let at = 4; at <= 152; at += 4) await play(4, at);

    const played = (song: number, title: string | null, sections: string[]) => [
      ...sections.map((name, section): Cue => ({ song, title, section, name, cause: 'played-into' })),
      { song, title, section: 'end', name: 'End', cause: 'played-into' } satisfies Cue,
    ];
    expect(target.cues).toEqual([
      ...played(1, 'Grace', ['Count Off', 'Intro', 'Verse']),
      ...played(2, 'Trust', ['Count Off', 'Intro', 'Ending', 'Pad']),
      ...played(3, 'Goodness', ['Count Off', 'Intro', 'Ending', 'Pad', 'Pad Out']),
    ]);
  });
});
