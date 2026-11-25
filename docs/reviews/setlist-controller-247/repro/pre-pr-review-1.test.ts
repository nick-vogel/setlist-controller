import { describe, expect, it } from 'vitest';
import { pictureHue } from '../src/set-builder/colour.ts';
import { findSongCues } from '../src/set-builder/song-cues.ts';

// setlist-controller#247 pre-PR review 1: the executed proofs of findings 1 and 2. Run it from test/: copy it there,
// run it, and remove the copy. Finding 1's two cases pinned what the lights step decided at e173d9a, on a cue list
// whose last song cue has a chain, and were green there. The finding's decision is that a song owns its chain
// (setlist-controller#508), and the two cases moved with the fix: they now assert the chain's end, and are red at
// e173d9a. Finding 2's three cases assert the hue the brief asks for, and are red at e173d9a.

const SONG = { songCueLabel: 'Song {n}', cueList: 1 };
// A cue with no link, no follow and no hang.
const cue = (number: string, label: string) => ({ number, label, link: null, follow: false, hang: false });
// A template whose last song cue, 22, runs on a follow into cue 23, a build with no label, before Closing.
const CHAIN = [cue('1', 'Song 1'), cue('11', 'Song 2'), { ...cue('22', 'Song 3'), follow: true }, cue('23', ''), cue('35', 'Closing')];
const songs = (count: number) => Array.from({ length: count }, (_, at) => ({ position: at + 1, title: `Title ${at + 1}` }));

describe('finding 1: a song cue with a chain', () => {
  it("takes Closing, the first cue after the last song's chain, and not the song's own build, as the cue that gets the template's colour back", () => {
    const found = findSongCues(CHAIN, songs(3), SONG);
    expect('songCues' in found && found.songCues.at(-1)).toMatchObject({ cue: '22', chain: ['23'] });
    expect('songCues' in found && found.restore).toEqual(['35']);
  });

  it("numbers a fourth song's copy after the last song's build, the end of its chain, and before Closing", () => {
    const found = findSongCues(CHAIN, songs(4), SONG);
    expect('songCues' in found && found.songCues.map(({ cue }) => cue)).toEqual(['1', '11', '22', '24']);
    expect('songCues' in found && found.restore).toEqual(['35']);
  });
});

// A 400 by 225 picture, every pixel opaque, each pixel's red, green and blue from its place.
function picture(pixel: (at: number) => [number, number, number]): Buffer {
  const rgba = Buffer.alloc(400 * 225 * 4);
  for (let at = 0; at < 400 * 225; at += 1) rgba.set([...pixel(at), 255], at * 4);
  return rgba;
}

describe('finding 2: a dark area of the picture', () => {
  it('gives no hue for a frame that is black but for noise of 0 to 3 a channel', () => {
    let seed = 1;
    const noise = () => Math.floor(((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 4);
    expect(pictureHue(picture(() => [noise(), noise(), noise()]))).toBeUndefined();
  });

  it('gives no hue for a black frame with one level of red on every other pixel', () => {
    expect(pictureHue(picture((at) => (at % 2 === 0 ? [1, 0, 0] : [0, 0, 0])))).toBeUndefined();
  });

  it("gives the water's hue for pale teal water with a dark warm shadow over an eighth of it", () => {
    const hue = pictureHue(picture((at) => (at < 400 * 225 * 0.12 ? [14 + (at % 3), 9 + (at % 2), 5] : [150 + (at % 5), 195 + (at % 4), 200])));
    expect(hue).toBeGreaterThanOrEqual(180);
    expect(hue).toBeLessThanOrEqual(195);
  });
});
