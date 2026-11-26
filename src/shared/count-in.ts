import type { Song } from './snapshot.ts';

// The rule for a count-in, which the server keeps and the leader's page reads to enable its button:
// the leader taps a section while Live is stopped and presses Count in, Live plays the song's own
// Count Off, and lands on that section on the bar line where the Count Off ends.

// The name of the locator a song counts off from, before its first downbeat. The music comes back on
// it, and so do the connection targets a Fade out paused (connections.ts).
export const COUNT_OFF = 'Count Off';

// The set builder puts a Pad after a song's Ending, and a Pad Out on the fade after it (write-set.ts).
// Neither is a section the band comes in on.
const PAD_SECTIONS = ['Pad', 'Pad Out'];

// Whether a section is a song's Pad or Pad Out, which the set builder gives the next song's meter.
export const isPad = (name: string) => PAD_SECTIONS.includes(name);

// What a count-in to a section of the song does: on the Count Off, the section right after it (the
// Intro in the library) or anything before it, what Play from start does; on any later section, the
// count through the Count Off at that index into the song's sections. Refused for a song with no
// section named Count Off, which is the reason the page shows, for a section the song does not have,
// and for a Pad.
export type CountInRule =
  | { kind: 'play-from-start' }
  | { kind: 'count-in'; countOff: number }
  | { kind: 'refused'; reason: 'no-count-off' | 'no-section' | 'pad' };

export function countInFor(song: Song, section: number): CountInRule {
  const target = song.sections[section];
  if (!target) return { kind: 'refused', reason: 'no-section' };
  const countOff = countOffIndex(song);
  if (countOff === -1) return { kind: 'refused', reason: 'no-count-off' };
  if (isPad(target.name)) return { kind: 'refused', reason: 'pad' };
  if (section <= countOff + 1) return { kind: 'play-from-start' };
  return { kind: 'count-in', countOff };
}

// Whether a held count-in can land on that section of the song: the section right after the Count
// Off, which playback reaches with no jump, or any section a count-in counts in to. Not the Count Off
// or anything before it, nor a Pad, nor a section the song does not have. The server moves a held
// count-in's target with Next, Previous or a tap only onto such a section, and the page enables Next,
// Previous and the jump targets from it.
export function countInLandsOn(song: Song, section: number): boolean {
  const rule = countInFor(song, section);
  return rule.kind === 'count-in' || (rule.kind === 'play-from-start' && song.sections[section - 1]?.name === COUNT_OFF);
}

// The index of the song's first section named Count Off, or -1 when it has none.
export function countOffIndex(song: Song): number {
  return song.sections.findIndex((section) => section.name === COUNT_OFF);
}

// Whether the song has a section named Count Off, without which it has no count-in at all.
export function hasCountOff(song: Song): boolean {
  return song.sections.some((section) => section.name === COUNT_OFF);
}
