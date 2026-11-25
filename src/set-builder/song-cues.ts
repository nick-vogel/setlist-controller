import { nameKey } from '../shared/match-name.ts';
import type { BuiltSong } from './built-set.ts';
import type { EosCue } from './eos.ts';
import { SONG_NUMBER } from './lights-config.ts';

// Which cues of the cue list are each song's, for the lights mode (lights.ts). It talks to nothing: from the cue list
// as read, the set's songs and the song cue label, it gives each song its cue and its chain, or the copy to make for
// it, and the cues that get the template's colour back, or the one reason it cannot.
//
// Song n's cue is the first cue of the list, in list order, that no earlier song took, whose label is the song cue
// label for n, "Song 1" for "Song {n}", under the shared name rule; with none, the first cue no earlier song took whose
// label is the song's title under that rule, as a run before this one left it. A cue is one song's, so a set that holds
// one title twice gives its two songs two cues on a second run.
//
// A song owns its chain (setlist-controller#508). A cue runs on when it has a follow or a hang: Eos then fires, by
// itself, the cue its link names, or with no link the next cue of the list (test/fixtures/eos/README.md, "Follows and
// links, 2026-10-24"). A link with no follow and no hang runs on into nothing. A song's chain is every cue its song cue
// runs on into, cue after cue, in the order Eos fires them, up to a cue that does not run on, the end of the list, or
// a cue the song already owns, a link back. A song's cue and its chain are that song's, its owned cues, and a cue is
// one song's: a chain that runs on into another song's cue of the set, or into a cue of another song's chain, is a
// problem. So is a cue of a chain that runs on by a link to a cue the list does not hold, a cue of another list among
// them, since what Eos fires from it is not this list's.
//
// Colour tracks forward in list order, so a song's colour would show in the cue after each cue it owns. The restore
// cues are the cues no song owns that stand straight after an owned cue in the list: each gets the colour the template
// gave it recorded back into it. With no chain and the song cues next to each other, that is the one cue after the
// last song cue.
//
// A song with no cue, when an earlier song has one and no later song has one, is an extra song: the set has more songs
// than the list has song cues. Each extra song gets a copy of one cue, the cue of the last song that has one, and has
// no chain: the chain of the song it copies stays that song's. The first copy's number sorts after that song's owned
// cue that stands last in the list, so past its chain, and before the cue that follows it there, and each later copy's
// after the copy before it and before that same following cue, so the copies stand in set order: the next whole number
// when it is free, otherwise a decimal between the two. Any other song with no cue, song 1 or a song before one that
// has a cue, is a problem: there is no last song cue to copy that keeps the songs in order. So is an extra song with
// no cue number free for its copy.

// A song's cue: the song, the cue's number as Eos writes it, and its chain, the numbers of the cues the song cue runs
// on into, in the order Eos fires them, none for a cue that does not run on. For an extra song the cue is not in the
// show yet: `copyOf` is the song cue to copy onto that number, and the chain is empty.
export type SongCue = { song: BuiltSong; cue: string; chain: string[]; copyOf?: SongCue };

// Each song's cue, in set order, and the restore cues, in list order; or why the songs cannot each have a cue and a
// chain of their own, as a sentence.
export type SongCues = { songCues: SongCue[]; restore: string[] } | { problem: string };

export function findSongCues(cues: EosCue[], songs: BuiltSong[], { songCueLabel, cueList }: { songCueLabel: string; cueList: number }): SongCues {
  const labelOf = (song: BuiltSong) => songCueLabel.replaceAll(SONG_NUMBER, String(song.position));
  // The place in the list of each song's cue, in set order, undefined for a song with none.
  const taken = new Set<number>();
  const places = songs.map((song) => {
    const free = (name: string) => cues.findIndex((cue, at) => !taken.has(at) && nameKey(cue.label) === nameKey(name));
    const at = free(labelOf(song)) >= 0 ? free(labelOf(song)) : free(song.title);
    if (at >= 0) taken.add(at);
    return at >= 0 ? at : undefined;
  });
  // The extra songs are the ones after the last song that has a cue. A song with no cue before that one, and every
  // song when none has a cue, is missing its cue.
  const lastWithCue = places.findLastIndex((place) => place !== undefined);
  const missing = lastWithCue < 0 ? songs : songs.filter((_, at) => places[at] === undefined && at < lastWithCue);
  if (missing.length > 0) return { problem: `cue list ${cueList} has no cue labelled ${listed(missing.map((song) => `"${labelOf(song)}" (song ${song.position}, ${song.title})`), 'or')}.` };

  const songCues: SongCue[] = songs.slice(0, lastWithCue + 1).map((song, at) => ({ song, cue: cues[places[at]!]!.number, chain: [] }));
  // The chains. Which song owns each place of the list: every song cue first, so a chain that reaches a song cue is seen
  // whichever of the two songs comes first, then each song's chain, walked from its song cue.
  const owner = new Map<number, SongCue>(songCues.map((songCue, at) => [places[at]!, songCue]));
  const named = ({ song, cue }: SongCue) => `cue ${cueList}/${cue} (song ${song.position}, ${song.title})`;
  for (const [at, songCue] of songCues.entries()) {
    let place = places[at]!;
    for (;;) {
      const { number, link, follow, hang } = cues[place]!;
      if (!follow && !hang) break;
      const next = link === null ? place + 1 : 'cue' in link ? cues.findIndex((cue) => thousandths(cue.number) === thousandths(link.cue)) : -1;
      if (next < 0) {
        const from = place === places[at] ? named(songCue) : `cue ${cueList}/${number}, in the chain of ${named(songCue)},`;
        return { problem: `${from} runs on by a link to ${link !== null && 'cue' in link ? `cue ${link.cue}` : `"${link?.outside}"`}, which is no cue of cue list ${cueList}.` };
      }
      const held = owner.get(next);
      // The end of the list, or a link back to a cue the song owns: the chain ends.
      if (next >= cues.length || held === songCue) break;
      if (held !== undefined) {
        const whose =
          cues[next]!.number === held.cue
            ? `the cue of song ${held.song.position}, ${held.song.title}. A song's chain has to end before another song's cue.`
            : `which is in the chain of ${named(held)}. A cue can be in the chain of one song only.`;
        return { problem: `the chain of ${named(songCue)} runs on into cue ${cueList}/${cues[next]!.number}, ${whose}` };
      }
      owner.set(next, songCue);
      songCue.chain.push(cues[next]!.number);
      place = next;
    }
  }
  // The copies: each numbered after the source's owned cue that stands last in the list, or the copy before it, and
  // before the cue that follows that owned cue.
  const source = songCues.at(-1)!;
  const lastOwned = Math.max(...[...owner].flatMap(([place, held]) => (held === source ? [place] : [])));
  const following = cues[lastOwned + 1];
  const below = following === undefined ? PAST_LAST : thousandths(following.number);
  let above = thousandths(cues[lastOwned]!.number);
  for (const song of songs.slice(lastWithCue + 1)) {
    const number = numberBetween(above, below);
    if (number === undefined) {
      const where = following === undefined ? `after cue ${cueList}/${written(above)}` : `between cue ${cueList}/${written(above)} and cue ${cueList}/${following.number}`;
      return { problem: `cue list ${cueList} has no cue number free ${where} for the copy song ${song.position}, ${song.title}, needs.` };
    }
    songCues.push({ song, cue: written(number), chain: [], copyOf: source });
    above = number;
  }
  // The restore cues, in the list as it will stand once the copies are in it: each cue no song owns that stands
  // straight after an owned cue. The copies stand between an owned cue and the cue that follows it, so each restore cue
  // is one the show already holds, and the cue after the last copy is the cue that followed the owned cue.
  const restore = cues.flatMap(({ number }, place) => (owner.has(place - 1) && !owner.has(place) ? [number] : []));
  return { songCues, restore };
}

// One past the last cue number Eos takes: cues are numbered from 0.001 to 9999.999 (ETC's Eos Family v3.3.10 online
// help, "About Cues and Cue Lists"), so a cue number has at most three decimal places. Numbers are worked in whole
// thousandths, never in floats.
const PAST_LAST = 10_000_000;

// A cue number as Eos writes it, such as "22" or "22.5", in whole thousandths.
function thousandths(number: string): number {
  return Math.round(Number(number) * 1000);
}

// A cue number in whole thousandths as Eos writes it, with no trailing zero.
function written(number: number): string {
  const decimals = String(number % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${Math.floor(number / 1000)}${decimals === '' ? '' : `.${decimals}`}`;
}

// A cue number that sorts after `above` and before `below`, both in whole thousandths: the next whole number after
// `above` when it is under `below`; otherwise the midpoint of the two cut to one decimal place when that is above
// `above`, else cut to two places, else to three. So 22 and 35 give 23, 22 and 23 give 22.5, 22.5 and 23 give 22.7, and
// 22.9 and 23 give 22.95. Undefined when three places hold no number between the two.
function numberBetween(above: number, below: number): number | undefined {
  const whole = (Math.floor(above / 1000) + 1) * 1000;
  if (whole < below) return whole;
  const middle = (above + below) / 2;
  return [100, 10, 1].map((place) => Math.floor(middle / place) * place).find((cut) => cut > above);
}

// The items as a sentence lists them: "a", "a or b", "a, b or c", with `word` before the last.
export function listed(items: string[], word: 'and' | 'or'): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1)}`;
}
