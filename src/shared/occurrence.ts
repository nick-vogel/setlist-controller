import { namesMatch } from './match-name.ts';

// The one rule every target matches a section of a song to one of its own named items by, a
// ProPresenter group, a chart block: the nth section of a name in the song matches the nth item of
// that name, in the items' order, and a section past the last item of its name matches that last
// item. Names compare by the name rule (match-name.ts). Sections and items are anything with a name,
// so no target's types reach this file.

type Named = { name: string };

// The items whose name matches, in their order.
export function itemsNamed<T extends Named>(items: readonly T[], name: string): T[] {
  return items.filter((item) => namesMatch(item.name, name));
}

// Which section of this name the section at that index is, from 1, counting the sections up to and
// including it. A name no section so far has counts as 1.
export function occurrenceAt(sections: readonly Named[], index: number, name: string): number {
  return sections.slice(0, index + 1).filter((section) => namesMatch(section.name, name)).length || 1;
}

// The item the nth section of this name matches, n from 1: the nth item of that name, or the last of
// them for a section past it, or undefined for a name with no item.
export function itemFor<T extends Named>(items: readonly T[], name: string, occurrence = 1): T | undefined {
  const named = itemsNamed(items, name);
  return named[Math.min(occurrence, named.length) - 1];
}

// The item the section at that index matches, or undefined for none or for an index outside the
// sections.
export function matchSection<T extends Named>(sections: readonly Named[], index: number, items: readonly T[]): T | undefined {
  const section = sections[index];
  if (section === undefined) return undefined;
  return itemFor(items, section.name, occurrenceAt(sections, index, section.name));
}
