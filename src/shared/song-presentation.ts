import { namesMatch } from './match-name.ts';

// Which presentation of a ProPresenter playlist is a song's: the rule the lights step finds a song's presentation by
// (setlist-controller#578), and the one the server is to find it by too (setlist-controller#579), so a song's colour
// and its slides come from the same presentation. A presentation has its own name, stored inside it, and the playlist
// item that links it has a name of its own too. A Planning Center import can give the own name a recording's suffix,
// "God I'm Just Grateful (Live)", which ProPresenter gives no way to change, while the producer can rename the playlist
// item. So the rule takes two passes, each by the name rule (match-name.ts):
// 1. the first presentation, in playlist order, whose own name is the song's title;
// 2. only when none is, the first whose playlist item's name, less its arrangement suffix (itemTitle), is the title.
// The first pass alone is the rule from before, so a song that matched by its own name keeps its presentation.

// A playlist item's name with a trailing Planning Center arrangement suffix stripped, as "House of the Lord - [ Full ]"
// is House of the Lord (test/fixtures/propresenter/README.md, "A playlist item's name is not the presentation's name").
export function itemTitle(name: string): string {
  return name.replace(/\s+-\s+\[[^\]]*\]\s*$/, '');
}

// The song's presentation among the playlist's, given in playlist order, each with its own name and its playlist
// item's name, or undefined when neither pass finds one.
export function songPresentation<P extends { name: string; item: string }>(title: string, presentations: readonly P[]): P | undefined {
  return presentations.find(({ name }) => namesMatch(name, title)) ?? presentations.find(({ item }) => namesMatch(itemTitle(item), title));
}
