// The parser of .claude/skills/build-set/traces.md, the build-set skill's hand traces. The file's head says what it is;
// then each `## <id>` section is one trace, in the fixed shape below, and any other line in a section is an error, so a
// trace cannot lose a field without the test saying so.
//
//   Said on: <weekday> <YYYY-MM-DD>
//   Library: <the library the listings read>
//   Source: <where the trace came from>
//   Nick says:
//   - <each of Nick's turns, in order>
//   Listing:            one or more, each a fenced block of one command, then:
//                       (or one line, `Listing: none`, for a trace that runs no listing: a request for the lights alone)
//   Plan: <the plan>    (a --plan listing only)
//   Set folders: <the set folders under the output root when it runs, or none>
//   Exit: <its exit code>
//   Last line: <its last line on stdout, in backticks, or none>
//   CLI: not run, <why>     (in place of running the listings)
//   Command: <the command shown or run, in backticks, or no command>
//   Date line: <the date line, in backticks, or none>
//   Question: <the question asked>
//   Song lines: a fenced block (optional)
//   Note: <free text> (optional); one that opens `The listing prints `<text>` on stderr` names what its one listing prints there
//   Pins: a fenced block, one SKILL.md sentence or clause per line, word for word
//
// After the last trace, `# Sentences no trace pins` is the exempt list (parseExempt). The head of traces.md states the
// sentence check's rule, which skillSentences and sentenceCoverage follow: a change to the rule changes both together.

export type Listing = { command: string; plan: string | undefined; setFolders: string[]; exit: number; lastLine: string | undefined };

export type Trace = {
  id: string;
  saidOn: { weekday: string; date: string };
  library: string;
  source: string;
  nickSays: string[];
  listings: Listing[];
  notRun: string | undefined;
  command: string;
  dateLine: string;
  question: string;
  songLines: string[];
  note: string | undefined;
  pins: string[];
};

const LABEL = /^([A-Z][a-z]+(?: [a-z]+)*):(?: (.*))?$/;

// A value as written: a value in one pair of backticks is the text inside them.
function unquote(value: string): string {
  const quoted = /^`([^`]*)`$/.exec(value);
  return quoted?.[1] ?? value;
}

// The heading of the exempt list, after the last trace: the sentences of the five sections no trace pins, each with
// why. The traces are the text before it.
const EXEMPT_HEADING = '# Sentences no trace pins';
const beforeExempt = (text: string): string => text.split(new RegExp(`^${EXEMPT_HEADING}$`, 'm'))[0] ?? '';

export function parseTraces(text: string): Trace[] {
  const sections = beforeExempt(text).split(/^## /m).slice(1);
  return sections.map((section) => parseTrace(section));
}

function parseTrace(section: string): Trace {
  const lines = section.split('\n');
  const id = (lines.shift() ?? '').trim();
  const fail = (problem: string): never => {
    throw new Error(`${id || 'A trace with no id'}: ${problem}`);
  };
  const fields = new Map<string, string>();
  // A listing as read so far; its lastLine is null for a Last line of none, and undefined until one is read.
  const listings: (Omit<Partial<Listing>, 'lastLine'> & { lastLine?: string | null })[] = [];
  const nickSays: string[] = [];
  let noListing = false;
  let songLines: string[] = [];
  let pins: string[] | undefined;

  // The fenced block that starts at the next line that is not blank, as its lines.
  const fence = (label: string): string[] => {
    while (lines[0]?.trim() === '') lines.shift();
    if (lines.shift() !== '```') fail(`${label} has no fenced block after it`);
    const body: string[] = [];
    for (let line = lines.shift(); line !== '```'; line = lines.shift()) {
      if (line === undefined) fail(`${label}'s fenced block has no end`);
      else body.push(line);
    }
    return body;
  };
  const listing = (label: string) => listings.at(-1) ?? fail(`${label} comes before any Listing`);

  while (lines.length > 0) {
    const line = lines.shift() ?? '';
    if (line.trim() === '') continue;
    const match = LABEL.exec(line);
    if (match === null) fail(`no field reads "${line}"`);
    const [, label = '', rawValue = ''] = match ?? [];
    const value = rawValue.trim();
    switch (label) {
      case 'Nick says':
        while (lines[0]?.startsWith('- ')) nickSays.push((lines.shift() ?? '').slice(2));
        break;
      case 'Listing': {
        // `Listing: none` is a trace that runs no listing, and stands alone; any other Listing is a fenced block.
        if (value === 'none') {
          if (noListing) fail('Listing is given twice as none');
          noListing = true;
        } else if (value !== '') {
          fail(`Listing reads "${value}", not none or a fenced block of one command`);
        } else {
          const commands = fence(label);
          if (commands.length !== 1) fail('a Listing block holds one command');
          listings.push({ command: commands[0] });
        }
        if (noListing && listings.length > 0) fail('Listing: none stands beside a listing');
        break;
      }
      case 'Plan':
        listing(label).plan = value;
        break;
      case 'Set folders':
        listing(label).setFolders = value === 'none' ? [] : value.split(', ');
        break;
      case 'Exit':
        if (!/^\d+$/.test(value)) fail(`Exit is no exit code: "${value}"`);
        listing(label).exit = Number(value);
        break;
      case 'Last line':
        listing(label).lastLine = value === 'none' ? null : unquote(value);
        break;
      case 'Song lines':
        songLines = fence(label);
        break;
      case 'Pins':
        pins = fence(label);
        break;
      case 'Said on':
      case 'Library':
      case 'Source':
      case 'CLI':
      case 'Command':
      case 'Date line':
      case 'Question':
      case 'Note':
        if (fields.has(label)) fail(`${label} is given twice`);
        fields.set(label, value);
        break;
      default:
        fail(`no field is named ${label}`);
    }
  }

  const field = (label: string): string => fields.get(label) || fail(`it has no ${label}`);
  const saidOn = /^([A-Z][a-z]+day) (\d{4}-\d{2}-\d{2})$/.exec(field('Said on')) ?? fail(`Said on is no weekday and date: "${field('Said on')}"`);
  const cli = fields.get('CLI');
  if (cli !== undefined && !cli.startsWith('not run, ')) fail(`CLI reads "${cli}", not "not run, <why>"`);
  if (nickSays.length === 0) fail('it has no Nick says');
  if (listings.length === 0 && !noListing) fail('it has no Listing');
  if (pins === undefined || pins.length === 0) fail('it has no pin');
  return {
    id,
    saidOn: { weekday: saidOn[1] ?? '', date: saidOn[2] ?? '' },
    library: field('Library'),
    source: field('Source'),
    nickSays,
    listings: listings.map((each, index) => {
      const at = `Listing ${index + 1}`;
      if (each.setFolders === undefined) fail(`${at} has no Set folders`);
      if (each.exit === undefined) fail(`${at} has no Exit`);
      if (each.lastLine === undefined) fail(`${at} has no Last line`);
      if (each.command?.includes('--plan') === (each.plan === undefined)) fail(`${at} has a Plan line if and only if it is a --plan listing`);
      return { command: each.command ?? '', plan: each.plan, setFolders: each.setFolders ?? [], exit: each.exit ?? 0, lastLine: each.lastLine ?? undefined };
    }),
    notRun: cli?.slice('not run, '.length),
    command: unquote(field('Command')),
    dateLine: unquote(field('Date line')),
    question: field('Question'),
    songLines,
    note: fields.get('Note'),
    pins: pins ?? [],
  };
}

// Each pin a trace holds that is not in the skill's text word for word exactly once, as `<trace id>: <pin>`, with how
// many times it is there when that is more than once: a pin found twice stays found when either copy is deleted.
export function missingPins(traces: Trace[], skill: string): string[] {
  return traces.flatMap(({ id, pins }) =>
    pins.flatMap((pin) => {
      const found = skill.split(pin).length - 1;
      if (found === 1) return [];
      return [found === 0 ? `${id}: ${pin}` : `${id}: ${pin} (found ${found} times)`];
    }),
  );
}

// A command's words as a shell splits them: white space separates, and "..." or '...' holds a word with spaces in it,
// such as a `--replace "<set folder>"`. A backslash, or a quote left open, throws, so an odd command fails loudly instead
// of splitting wrong.
export function words(text: string): string[] {
  if (text.includes('\\')) throw new Error(`A command holds a backslash, which this test does not split: ${text}`);
  const found: string[] = [];
  let word: string | undefined;
  let quote: string | undefined;
  for (const char of text) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      word ??= '';
    } else if (/\s/.test(char)) {
      if (word !== undefined) found.push(word);
      word = undefined;
    } else {
      word = (word ?? '') + char;
    }
  }
  if (quote !== undefined) throw new Error(`A command leaves a ${quote} open: ${text}`);
  if (word !== undefined) found.push(word);
  return found;
}

// A word of a trace's command as the workspace stands in for it: a path `standIns` names, or a path under one, such as
// a set folder under a stand-in output root, maps to its stand-in; any other word is itself. A path that is neither is a
// fault in the trace, and throws.
export function standIn(word: string, standIns: Map<string, string>): string {
  const whole = standIns.get(word);
  if (whole !== undefined) return whole;
  for (const [path, stand] of standIns) if (word.startsWith(`${path}/`)) return stand + word.slice(path.length);
  if (word.startsWith('/')) throw new Error(`the workspace has no stand-in for ${word}`);
  return word;
}

// The sentence check's rule, as the head of traces.md states it: the sections it reads, how a line of them becomes
// sentences, and (in sentenceCoverage) what covers one.
export const SECTIONS = ['Steps', 'The plan path', 'The yes to replacing', 'The lights step', 'Ask instead of guess'];

export type Sentence = { line: number; text: string; start: number; end: number };

const CLOSERS = new Set(['*', '"', "'", ')']);

// Each sentence of the five sections, as the skill holds it word for word, with its line (from 1) and its offsets in
// the whole text. A section heading the skill does not have throws, naming it.
export function skillSentences(skill: string): Sentence[] {
  const lines = skill.split('\n');
  const offsets: number[] = [];
  lines.reduce((at, line) => (offsets.push(at), at + line.length + 1), 0);
  const sentences: Sentence[] = [];
  for (const section of SECTIONS) {
    const heading = lines.indexOf(`## ${section}`);
    if (heading === -1) throw new Error(`The skill has no "## ${section}" section`);
    for (let index = heading + 1; index < lines.length && !(lines[index] ?? '').startsWith('## '); index++) {
      const line = lines[index] ?? '';
      // Indentation, one list marker, and a bold label: a bold span at the start whose text ends a sentence.
      const head = /^\s*(?:\d+\. |- )?(?:\*\*[^*]*[.?!]\*\*\s*)?/.exec(line)?.[0] ?? '';
      for (const [from, to] of lineSentences(line, head.length)) {
        sentences.push({ line: index + 1, text: line.slice(from, to), start: (offsets[index] ?? 0) + from, end: (offsets[index] ?? 0) + to });
      }
    }
  }
  return sentences;
}

// The sentences of one line from `from` on, as [start, end) pairs, trimmed. A sentence ends at `.`, `?` or `!` outside
// backticks, with any run of closing `**`, `"`, `'` or `)` after it, followed by a space or the line's end; but a `?` or
// `!` whose run closes a quotation, and a code span whose last character is a terminator, end one only when what follows
// the space is no lowercase word. A tail with no terminator is a sentence too.
function lineSentences(line: string, from: number): [number, number][] {
  const found: [number, number][] = [];
  let start = from;
  let code = false;
  const push = (end: number) => {
    const text = line.slice(start, end);
    const lead = text.length - text.trimStart().length;
    if (text.trim() !== '') found.push([start + lead, start + text.trimEnd().length]);
    start = end;
  };
  const endsHere = (after: number, guarded: boolean) =>
    after === line.length || (line[after] === ' ' && !(guarded && /^[a-z]/.test(line.slice(after + 1))));
  for (let at = from; at < line.length; at++) {
    const char = line[at] ?? '';
    if (char === '`') {
      code = !code;
      if (!code && /[.?!]/.test(line[at - 1] ?? '') && endsHere(at + 1, true)) push(at + 1);
      continue;
    }
    if (code || !/[.?!]/.test(char)) continue;
    let after = at + 1;
    while (CLOSERS.has(line[after] ?? '')) after++;
    const quoted = char !== '.' && line.slice(at + 1, after).includes('"');
    if (endsHere(after, quoted)) {
      push(after);
      at = after - 1;
    }
  }
  push(line.length);
  return found;
}

export type Exempt = { sentence: string; reason: string };

// The exempt list: after its heading, entries of a `Sentence: <the sentence word for word>` line and a `Reason: <why>`
// line, blank lines between them. A Reason left out reads as an empty one, which sentenceCoverage names; any other line
// throws, naming it. A text with no exempt list has no entries.
export function parseExempt(text: string): Exempt[] {
  const at = text.search(new RegExp(`^${EXEMPT_HEADING}$`, 'm'));
  if (at === -1) return [];
  const entries: Exempt[] = [];
  let open: Exempt | undefined;
  for (const line of text.slice(at + EXEMPT_HEADING.length).split('\n')) {
    if (line.trim() === '') continue;
    const sentence = /^Sentence: (.+)$/.exec(line);
    const reason = /^Reason:(.*)$/.exec(line);
    if (sentence !== null) {
      open = { sentence: sentence[1] ?? '', reason: '' };
      entries.push(open);
    } else if (reason !== null) {
      if (open === undefined) throw new Error(`The exempt list has a Reason with no Sentence before it: "${line}"`);
      open.reason = (reason[1] ?? '').trim();
      open = undefined;
    } else {
      throw new Error(`The exempt list has a line that is no Sentence or Reason: "${line}"`);
    }
  }
  return entries;
}

// What the sentence check finds, each naming its sentence: a sentence of the five sections that no pin covers and the
// exempt list does not list, as `SKILL.md:<line>: <sentence>`, and an entry of the list that has no reason, is no
// sentence the split rule gives, is a sentence a pin covers anywhere it stands, or is listed twice. A pin covers a
// sentence when the pin's one place in the skill holds all of it; two pins never cover one sentence between them. A pin
// that is not in the skill exactly once covers nothing here, since missingPins names it.
export function sentenceCoverage(traces: Trace[], exempt: Exempt[], skill: string): string[] {
  const spans = traces.flatMap(({ id, pins }) =>
    pins.flatMap((pin) => {
      const start = skill.indexOf(pin);
      return start === -1 || skill.indexOf(pin, start + 1) !== -1 ? [] : [{ id, start, end: start + pin.length }];
    }),
  );
  const sentences = skillSentences(skill);
  const pinnedBy = (sentence: Sentence) => spans.find(({ start, end }) => start <= sentence.start && sentence.end <= end)?.id;
  const listed = new Set(exempt.map(({ sentence }) => sentence));
  const problems = sentences.filter((sentence) => pinnedBy(sentence) === undefined && !listed.has(sentence.text)).map(({ line, text }) => `SKILL.md:${line}: ${text}`);
  const seen = new Set<string>();
  for (const { sentence, reason } of exempt) {
    const at = `The exempt list: ${sentence}`;
    const copies = sentences.filter(({ text }) => text === sentence);
    const pinner = copies.map(pinnedBy).find((id) => id !== undefined);
    if (reason === '') problems.push(`${at}: it has no reason`);
    if (copies.length === 0) problems.push(`${at}: it is no sentence of the five sections of SKILL.md`);
    if (pinner !== undefined) problems.push(`${at}: ${pinner} pins it`);
    if (seen.has(sentence)) problems.push(`${at}: it is listed twice`);
    seen.add(sentence);
  }
  return problems;
}
