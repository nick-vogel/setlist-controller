import { describe, expect, it } from 'vitest';
import { findSongCues } from '../src/set-builder/song-cues.ts';

// setlist-controller#247 pre-PR review 3: the executed proofs of findings 2 and 3. Run it from test/: copy it there,
// run it, and remove the copy. The first case of each finding asserts what its brief asks for, and is red at a06833e.
// The second case of finding 3 is green there, and stays green: it is the brief's Must preserve.

const SONG = { songCueLabel: 'Song {n}', cueList: 1 };
// A cue with no link, no follow and no hang.
const cue = (number: string, label: string) => ({ number, label, link: null, follow: false, hang: false });
const songs = (count: number) => Array.from({ length: count }, (_, at) => ({ position: at + 1, title: `Title ${at + 1}` }));

describe('finding 2: a chain that runs on into a song cue the set does not use', () => {
  // Song 2's cue has a follow and no build after it, so it runs on into the cue labelled Song 3.
  const SHORT = [cue('1', 'Song 1'), { ...cue('11', 'Song 2'), follow: true }, cue('22', 'Song 3'), cue('35', 'Closing')];

  it('stops a set of two songs with the problem a set of three songs gets, and takes cue 22 into no chain', () => {
    expect(findSongCues(SHORT, songs(3), SONG)).toHaveProperty('problem');
    expect(findSongCues(SHORT, songs(2), SONG)).toHaveProperty('problem');
  });
});

describe("finding 3: a last song cue that is the cue list's last cue and runs on", () => {
  const LAST = [cue('1', 'Song 1'), cue('11', 'Song 2'), { ...cue('22', 'Song 3'), follow: true }];

  it('numbers no copy after it for a fourth song, since its follow would fire the copy: the set is a problem', () => {
    expect(findSongCues(LAST, songs(4), SONG)).toHaveProperty('problem');
  });

  it('still takes a set of three songs, which needs no copy', () => {
    expect(findSongCues(LAST, songs(3), SONG)).toMatchObject({ restore: [] });
  });
});
