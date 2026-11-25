// The one rule every connection target matches a song or section name by, against the names in its
// own file: trim the name, collapse every run of whitespace to one space, and ignore letter case.
// Nothing fuzzier, so "Chorus 2" never stands in for "Chorus". Every target matches through these
// two functions, never a rule of its own.

// The name as the rule compares it. Names that match have the same key, so a target can build a map
// of its own names by it.
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function namesMatch(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}
