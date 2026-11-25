import { describe, expect, it } from 'vitest';
import { startCues } from '../src/server/cues.ts';
import type { JumpTarget, Loop, PlaybackState, SetList } from '../src/shared/snapshot.ts';

// Feeds startCues crafted states, since the fake Live reports a loop going off before the bar line
// it jumps on and so never shows a jump landing on a brace end with the loop still on.
const section = (name: string, time: number, end: number) => ({ name, time, end, cue: 0 });
const SET: SetList = {
  warnings: [],
  songs: [
    { number: 1, title: 'One', sections: [section('Intro', 0, 8), section('Verse', 8, 24), section('Chorus', 24, 40)], end: 40, endCue: 0 },
    { number: 2, title: 'Two', sections: [section('Count Off', 40, 44), section('Verse', 44, 60)], end: 60, endCue: 0 },
  ],
} as unknown as SetList;
const VERSE_LOOP = { start: 8, length: 16, section: { song: 1, section: 1 } } as Loop;

function now(position: number) {
  const at = position + 1e-4;
  for (const song of SET.songs) {
    if (at < song.sections[0]!.time || at >= song.end!) continue;
    return { song: song.number, section: song.sections.findLastIndex((s) => s.time <= at), next: 'end' as const, bar: 1, bars: 1, fraction: 0 };
  }
  return null;
}

function state(position: number, { playing = true, jump = null, loop = null }: { playing?: boolean; jump?: JumpTarget | null; loop?: Loop | null } = {}): PlaybackState {
  return { live: 'connected', set: SET, playing, position, now: now(position), jump, endToggles: {}, loop } as unknown as PlaybackState;
}

function cuesFor(states: PlaybackState[]): string[] {
  const raised: string[] = [];
  const cues = startCues((cue) => raised.push(`${cue.song} ${cue.name} ${cue.cause}`));
  for (const each of states) cues.observe(each);
  return raised;
}

describe('the brace-end guard', () => {
  it('steps aside for a jump that lands on the brace end while the loop is still reported on', () => {
    expect(
      cuesFor([state(20, { loop: VERSE_LOOP }), state(23.5, { loop: VERSE_LOOP, jump: { song: 1, section: 2 } }), state(24, { loop: VERSE_LOOP }), state(24.5)]),
    ).toEqual(['1 Chorus jump']);
  });

  it('lets a start on the brace end raise its section, the loop still on', () => {
    expect(
      cuesFor([
        state(20, { loop: VERSE_LOOP }),
        state(24, { loop: VERSE_LOOP }),
        state(24, { loop: VERSE_LOOP, playing: false }),
        state(24, { loop: VERSE_LOOP }),
        state(24.5, { loop: VERSE_LOOP }),
      ]),
    ).toEqual(['1 Chorus played-into']);
  });
});
