// The name rule a plan's names are matched by, a song title against a folder's title, a service type against the one
// asked for: two names are one name when they are equal trimmed, with each run of white space as one space, letter case
// ignored. Nothing fuzzier, so "Grace" never names "This Is Amazing Grace". It is not library.ts's short-name rule, which
// matches a part of a folder name for a typed command.

// A name as the rule compares it.
export function nameKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}
