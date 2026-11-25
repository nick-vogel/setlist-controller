import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { foldersNamed } from '../src/set-builder/library.ts';
import { REPO_ROOT } from './set-builder-harness.ts';

// The build-set skill's quoted problem lines, read against the lines the code can print. Steps step 6 and plan step 2 of
// .claude/skills/build-set/SKILL.md, and its worked examples, quote the problem lines the build prints, each with its
// fix, so Claude can match a problem to its fix. Nothing else reads those quotes, so a problem line reworded in
// src/set-builder/ would leave the skill quoting a line the build no longer prints, with every check green
// (setlist-controller#219). Each quote has to line up with a string or template literal in src/set-builder/.

const SKILL = join(REPO_ROOT, '.claude/skills/build-set/SKILL.md');
const SOURCE = join(REPO_ROOT, 'src/set-builder');
const EXAMPLES = '## Worked examples';
const COMMAND = 'pnpm build-set';
// A literal with fewer letters of fixed text than this is a joiner, such as `${a} and ${b}` or `${x}.asd`, which a
// concrete quote's written-out values would line up with whatever the line is.
const LETTER_FLOOR = 8;

// A literal from the code: fixed characters, and a hole for each ${...}.
type LiteralToken = { kind: 'char'; char: string } | { kind: 'hole' };
// A quote from the skill: fixed characters, a <placeholder> for a value, and ... for a part it leaves out.
type QuoteToken = { kind: 'char'; char: string } | { kind: 'placeholder' } | { kind: 'elision' };

// What the code joins a list of values with, which one <placeholder> stands for, such as <groups> for
// `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`.
const JOINERS = [', ', ' and ', ' or ', ', and '];

// A quote's tokens. A quote that ends in `:` goes on past it (`keep one:` and the folders after it), so it ends in an
// elision.
function quoteTokens(quote: string): QuoteToken[] {
  const tokens: QuoteToken[] = [];
  for (const [, placeholder, elision, char] of quote.matchAll(/(<[^<>]+>)|(\.\.\.)|([\s\S])/g)) {
    if (placeholder !== undefined) tokens.push({ kind: 'placeholder' });
    else if (elision !== undefined) tokens.push({ kind: 'elision' });
    else if (char !== undefined) tokens.push({ kind: 'char', char });
  }
  if (quote.endsWith(':')) tokens.push({ kind: 'elision' });
  return tokens;
}

// The ends of the run of holes a placeholder can stand for, from the hole at `start`: the hole alone, or a list of holes
// with a joiner between each two.
function listEnds(literal: LiteralToken[], start: number): number[] {
  const ends = [start + 1];
  let end = start + 1;
  for (;;) {
    const joiner = JOINERS.find((text) => [...text].every((char, offset) => {
      const token = literal[end + offset];
      return token?.kind === 'char' && token.char === char;
    }) && literal[end + text.length]?.kind === 'hole');
    if (joiner === undefined) return ends;
    end += joiner.length + 1;
    ends.push(end);
  }
}

// Whether a quote lines up with a literal, the whole quote with the whole literal. Fixed text matches the same fixed
// text; `...` stands for any run of the literal, fixed text and holes alike; a <placeholder> stands for one hole, or a
// list of holes the code joins (JOINERS), and never for fixed text. A hole stands for a value the quote writes out only
// in a concrete quote, one with no placeholder and no `...`: elsewhere a value written out would let a quote line up
// with a line that only shares its end. A quote that starts lowercase is the tail of a line, so it may start at any
// fixed character of the literal. A fragment, a piece of a line the skill quotes in prose, may start and end anywhere
// inside the literal, but a hole never takes its first written-out character. A table filled from the ends back, not
// recursion, which the long USAGE literal would take past the stack.
function linesUp(quote: string, literal: LiteralToken[], fragment = false): boolean {
  const tokens = quoteTokens(quote);
  const concrete = tokens.every((token) => token.kind === 'char');
  if (fragment) tokens.push({ kind: 'elision' });
  const n = literal.length;
  const m = tokens.length;
  // after[i][j]: literal from i lines up with quote from j.
  const after = Array.from({ length: n + 1 }, () => new Array<boolean>(m + 1).fill(false));
  const at = (i: number, j: number) => after[i]?.[j] === true;
  for (let i = n; i >= 0; i -= 1) {
    const row = after[i];
    if (row === undefined) continue;
    for (let j = m; j >= 0; j -= 1) {
      const token = tokens[j];
      const code = literal[i];
      if (token === undefined) row[j] = i === n;
      else if (token.kind === 'elision') row[j] = at(i, j + 1) || (i < n && at(i + 1, j));
      else if (code === undefined) row[j] = false;
      else if (token.kind === 'placeholder') row[j] = code.kind === 'hole' && listEnds(literal, i).some((end) => at(end, j + 1));
      else if (code.kind === 'char') row[j] = code.char === token.char && at(i + 1, j + 1);
      else row[j] = concrete && (at(i + 1, j + 1) || at(i, j + 1));
    }
  }
  if (fragment) return literal.some((code, i) => (code.kind === 'char' || tokens[0]?.kind !== 'char') && at(i, 0));
  if (!/^\p{Ll}/u.test(quote)) return at(0, 0);
  return literal.some((code, i) => code.kind === 'char' && at(i, 0));
}

type Literal = { at: string; tokens: LiteralToken[] };
type Quote = { line: number; text: string; fragment: boolean };

function chars(text: string): LiteralToken[] {
  return [...text].map((char) => ({ kind: 'char', char }));
}

// What a ${...} can print: each written string a conditional picks between, such as `whose ${n === 1 ? 'name writes' :
// 'names write'} no key`, or a hole for a value.
function printed(expression: ts.Expression): LiteralToken[][] {
  if (ts.isParenthesizedExpression(expression)) return printed(expression.expression);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [chars(expression.text)];
  if (ts.isConditionalExpression(expression)) return [...printed(expression.whenTrue), ...printed(expression.whenFalse)];
  return [[{ kind: 'hole' }]];
}

// Every string and template literal in one source file, read with the TypeScript compiler: a template is its fixed
// text with a hole for each ${...}, or one literal for each written string a ${...} picks between, and a template nested
// in a ${...} is a literal of its own. Only literals with at least LETTER_FLOOR letters of fixed text count.
function literalsOf(name: string, text: string): Literal[] {
  const literals: Literal[] = [];
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    let variants: LiteralToken[][] = [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) variants = [chars(node.text)];
    else if (ts.isTemplateExpression(node)) {
      variants = node.templateSpans.reduce(
        (sofar, span) => sofar.flatMap((before) => printed(span.expression).map((value) => [...before, ...value, ...chars(span.literal.text)])),
        [chars(node.head.text)],
      );
    }
    for (const tokens of variants) {
      const letters = tokens.filter((token) => token.kind === 'char' && /\p{L}/u.test(token.char)).length;
      if (letters >= LETTER_FLOOR) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        literals.push({ at: `${name}:${line}`, tokens });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return literals;
}

// Every literal in src/set-builder/*.ts, by literalsOf.
function readLiterals(): Literal[] {
  return readdirSync(SOURCE)
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .flatMap((name) => {
      const path = join(SOURCE, name);
      return literalsOf(relative(REPO_ROOT, path), readFileSync(path, 'utf8'));
    });
}

// The skill's own song line form, `<n>. <title> (<key>), then a gap`, and its transition tails such as `then an
// overlap`, which the skill writes under a command and the build never prints.
const SONG_FORM = /^(?:<n>\. <title> \(<key>\), |then )/;

// The quoted printed lines in SKILL.md, with their line numbers: each inline code span outside a fence, and each fenced
// line but the worked examples' --list listing (build-set-skill-examples.test.ts checks it) and a `pnpm build-set`
// command (checked there too), split into fields on runs of two or more spaces, as a plan listing line holds a problem
// in its folder field. A field is a printed line when it ends in `.` or `:` and holds a letter outside its
// <placeholders>: every whole line the build prints is a sentence, and that leaves out the skill's own display forms
// (`Date: ...`, `<n>. <title> (<key>), then a gap`), file names, flags and a bare `<n>.`. A span in prose that is one
// field and no such line is a fragment, a piece of a printed line such as `has no E.wav`, when it starts lowercase or
// with a <placeholder>, holds a space and at least LETTER_FLOOR letters outside its placeholders, and is no command and
// no SONG_FORM: that leaves out flags, file names, and short words such as `no key`. A worked example that shows a
// command as step 4 shows it, a `Date:` line, the song lines, then any line as printed, then its question, has those
// printed lines in plain text, and each is read whole, as a fenced line is.
function readQuotes(text: string): Quote[] {
  const spans: { line: number; text: string; whole: boolean }[] = [];
  let inFence = false;
  let inExamples = false;
  let examplesFences = 0;
  let shown = false;
  for (const [index, raw] of text.split('\n').entries()) {
    const line = index + 1;
    const trimmed = raw.trim();
    if (raw.startsWith('## ')) inExamples = trimmed === EXAMPLES;
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      if (inFence && inExamples) examplesFences += 1;
      shown = false;
      continue;
    }
    if (inFence) {
      if (!(inExamples && examplesFences === 1) && !trimmed.startsWith(COMMAND)) spans.push({ line, text: trimmed, whole: true });
    } else if (inExamples && trimmed.startsWith('Date: ')) {
      shown = true;
    } else if (shown && trimmed.endsWith('?')) {
      shown = false;
    } else if (shown) {
      if (trimmed !== '' && !/^\d+\. /.test(trimmed)) spans.push({ line, text: trimmed, whole: true });
    } else {
      for (const [, span] of raw.matchAll(/`([^`]+)`/g)) if (span !== undefined) spans.push({ line, text: span, whole: false });
    }
  }
  return spans.flatMap(({ line, text, whole }) => {
    const fields = text.trim().split(/\s{2,}/);
    const letters = (field: string) => field.replaceAll(/<[^<>]*>/g, '').match(/\p{L}/gu)?.length ?? 0;
    const quoted = fields.filter((field) => /[.:]$/.test(field) && letters(field) > 0).map((field) => ({ line, text: field, fragment: false }));
    const [field] = fields;
    const fragment =
      !whole &&
      fields.length === 1 &&
      field !== undefined &&
      quoted.length === 0 &&
      /^(?:\p{Ll}|<)/u.test(field) &&
      field.includes(' ') &&
      letters(field) >= LETTER_FLOOR &&
      !field.startsWith(COMMAND) &&
      !SONG_FORM.test(field);
    return fragment ? [{ line, text: field, fragment: true }] : quoted;
  });
}

// A template's source text as a literal, for the cases below: each ${...} is a hole.
function template(text: string): LiteralToken[] {
  return text.split(/(\$\{[^}]*\})/).flatMap((part, index): LiteralToken[] => (index % 2 === 1 ? [{ kind: 'hole' }] : chars(part)));
}

describe('a quoted problem line lines up with a code literal', () => {
  const cases: { quote: string; literal: string; matches: boolean }[] = [
    { quote: '<folder>: the song has no locator named Ending, where a pad starts.', literal: '${song.folder}: the song has no locator named Ending, where a pad starts.', matches: true },
    { quote: '<folder>: the song has no locator named Ending, where a pad starts.', literal: '${song.folder}: the song has no locator named Ending, where the pad starts.', matches: false },
    {
      quote: 'The pad after song <n> plays <file>, which lasts <s> s. ... needs a file of at least <s> s.',
      literal: "The pad after song ${position} plays ${file.name}, which lasts ${shown(lasts)} s. Its clip plays the file from ${shown(from)} s to ${shown(from + seconds)} s, and the file's last ${FILE_FADE_OUT_SECONDS} s are its own fade-out, so the pad needs a file of at least ${shown(needs)} s.",
      matches: true,
    },
    { quote: 'The stem map lists the stem "<stem>" under <groups>.', literal: 'The stem map lists the stem "${stem}" under ${names.slice(0, -1).join(\', \')} and ${names.at(-1)}.', matches: true },
    { quote: 'Cannot read the pads folder <folder>.', literal: '${a}: ${b} needs ${c} tracks for this song, and the template has ${d}.', matches: false },
    { quote: 'config/stem-map.json cannot be read: ...', literal: '${folder}: the song could not be read: ${error instanceof Error ? error.message : String(error)}', matches: false },
    { quote: 'config/stem-map.json cannot be read: ...', literal: 'config/stem-map.json cannot be read: ${reason}', matches: true },
    {
      quote: '/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.',
      literal: '${folder} already exists. The build stops on it unless --replace "${folder}" replaces it.',
      matches: true,
    },
    { quote: 'already exists, and --replace replaces it.', literal: '${folder} already exists, and --replace replaces it.', matches: true },
    { quote: 'keep one:', literal: '"${song.title}" in ${song.key} has ${matches.length} song folders in ${libraryPath}; keep one:${listed(matches)}', matches: true },
    { quote: 'Warning:', literal: 'Warning: ${song}, is planned in ${meter.trim()}, and its song starts in ${songMeter.trim()}.', matches: true },
    {
      quote: 'Planning Center refused the token in <file>.',
      literal: 'Planning Center refused the token in ${tokenFile}. Make a new personal access token, put it in that file, and build again.',
      matches: false,
    },
  ];

  for (const { quote, literal, matches } of cases) {
    it(`${matches ? 'matches' : 'does not match'}: ${quote} against ${literal}`, () => {
      expect(linesUp(quote, template(literal))).toBe(matches);
    });
  }
});

describe('a quoted piece of a problem line lines up inside a code literal', () => {
  const plan = '"${song.title}" has no key in the plan, and ${libraryPath} has it in ${keysOf(titled)}. Give it a key in the plan.';
  const cases: { piece: string; literal: string; matches: boolean }[] = [
    { piece: 'has no key in the plan, and <library> has it in', literal: plan, matches: true },
    { piece: 'has no key in the plan, and <library> has it in', literal: plan.replace('has it in', 'holds it in'), matches: false },
    { piece: '<folder> (its folder name\'s key, "<key>", is not a note name)', literal: '${folder} (its folder name\'s key, "${reading.written}", is not a note name)', matches: true },
    { piece: '<folder> (its folder name\'s key, "<key>", is not a note name)', literal: '${folder} (its folder name\'s key, "${reading.written}", is no note name)', matches: false },
    { piece: 'has no E.wav', literal: 'The pad after song ${position} is in ${key}, ${keyOf}and the pads folder ${folder} has no ${names.join(\' or \')}. ${keysIn(entries)}', matches: true },
    { piece: 'has no E.wav', literal: '"${song.title}" has no song folder in ${libraryPath}.', matches: false },
    { piece: 'has no E.wav', literal: '${reason} and the rest of the line', matches: false },
  ];

  for (const { piece, literal, matches } of cases) {
    it(`${matches ? 'matches' : 'does not match'}: ${piece} inside ${literal}`, () => {
      expect(linesUp(piece, template(literal), true)).toBe(matches);
    });
  }

  it('reads a ${...} that picks between written strings as each of them', () => {
    const source = "const named = `${joined(keyless)}, whose ${keyless.length === 1 ? 'name writes' : 'names write'} no key`;";
    const read = literalsOf('plan-folders.ts', source);
    expect(read.some(({ tokens }) => linesUp('<folder>, whose name writes no key', tokens, true))).toBe(true);
    expect(read.some(({ tokens }) => linesUp('<folder>, whose names write no key', tokens, true))).toBe(true);
  });
});

describe('the quotes read from the skill', () => {
  it('reads a span in prose that quotes a piece of a printed line', () => {
    const text = [
      'A key listed as `<folder> (its folder name\'s key, "<key>", is not a note name)` means a folder to fix.',
      'It lists every name the build looked for (`has no E.wav`, `has no C#.wav or Db.wav`).',
      'The same forms can follow `has no key in the plan, and <library> has it in`.',
    ].join('\n');
    expect(readQuotes(text)).toEqual([
      { line: 1, text: '<folder> (its folder name\'s key, "<key>", is not a note name)', fragment: true },
      { line: 2, text: 'has no E.wav', fragment: true },
      { line: 2, text: 'has no C#.wav or Db.wav', fragment: true },
      { line: 3, text: 'has no key in the plan, and <library> has it in', fragment: true },
    ]);
  });

  it('leaves out the skill\'s own song line forms, commands, flags, file names and short words', () => {
    const text = [
      'Then list each song: `<n>. <title> (<key>), then a gap`, `then an overlap`, or `then a pad in <key> for ministry time`.',
      'Run `pnpm build-set --plan --list` with `--library <folder>`, and fix `config/stem-map.json`, or `no key`, or `chmod 600`.',
      'It prints `3. Fall Like Rain  E  Fall Like Rain-Call On Heaven-E-70.00bpm  pad in E, from --pad 3`.',
    ].join('\n');
    expect(readQuotes(text)).toEqual([]);
  });

  it('reads a line a worked example shows as printed, between its song lines and its question', () => {
    const text = [
      '## Worked examples',
      '',
      '9. A rebuild.',
      '',
      '   Date: Sunday 2026-10-18, the coming Sunday, since no date is named',
      '',
      '   1. This Is Amazing Grace (D), then a gap',
      '   2. Fall Like Rain (E), the last song',
      '',
      '   /Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.',
      '',
      '   Replace the set built before?',
      '',
      '   Nick answers yes, so the command gains the flag and runs as shown.',
    ].join('\n');
    expect(readQuotes(text)).toEqual([
      { line: 10, text: '/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.', fragment: false },
    ]);
  });
});

const literals = readLiterals();
const quotes = readQuotes(readFileSync(SKILL, 'utf8'));

describe('the build-set skill\'s quoted problem lines', () => {
  it('are read, against literals read from src/set-builder/', () => {
    expect(literals).not.toEqual([]);
    expect(quotes).not.toEqual([]);
  });

  for (const { line, text, fragment } of quotes) {
    it(`SKILL.md:${line} ${text}`, () => {
      const found = literals.filter(({ tokens }) => linesUp(text, tokens, fragment)).map(({ at }) => at);
      expect(found, `SKILL.md:${line} quotes "${text}", which no line in src/set-builder/ can print.`).not.toEqual([]);
    });
  }
});

// The usage text the command prints, the `USAGE` literal of main.ts: the one literal that starts `Usage:`.
function usageText(): string {
  const text = (tokens: LiteralToken[]) => tokens.map((token) => (token.kind === 'char' ? token.char : '')).join('');
  const found = literals.filter(({ at, tokens }) => at.startsWith('src/set-builder/main.ts:') && text(tokens).startsWith('Usage:'));
  if (found.length !== 1) throw new Error(`src/set-builder/main.ts holds ${found.length} literals that start "Usage:", not the one usage text.`);
  return text(found[0]?.tokens ?? []);
}

// Every distinct `--flag` a text names, as test/readme.test.ts reads them, and those of `text` the usage text does not
// name.
const flags = (text: string) => [...new Set(text.match(/--[a-z][a-z-]*/g) ?? [])].toSorted();
const flagsNotInUsage = (text: string, usage: string) => flags(text).filter((flag) => !flags(usage).includes(flag));

describe('the build-set skill\'s flags', () => {
  it('names a flag a text holds that the usage text does not, and none the usage text holds', () => {
    const usage = usageText();

    expect(flags(usage)).toContain('--lights');
    expect(flagsNotInUsage('Run `pnpm build-set --lights --date <date>`, with `--playlist "<name>"`.', usage)).toEqual([]);
    expect(flagsNotInUsage('Run `pnpm build-set --lights-only --date <date>`, or `--light`.', usage)).toEqual(['--light', '--lights-only']);
  });

  // The skill composes commands from the flags it names, so a flag it names that the command does not have is a command
  // that exits 2 on Nick (setlist-controller#504).
  it('are flags the usage text names, each one', () => {
    const skill = readFileSync(SKILL, 'utf8');

    expect(flags(skill)).not.toEqual([]);
    expect(flagsNotInUsage(skill, usageText())).toEqual([]);
  });
});

describe('the build-set skill\'s stem reason fixes', () => {
  // song.ts names every reason a stem has in one build, one line each (contentProblems, and the stop rule test that
  // lists `is frozen` and `has a warped clip` for one stem), so a fix that says a later build names the rest sends Nick
  // to build again for a line he already has (setlist-controller#221 review pass 2).
  it('do not leave a reason the same build names to a later build', () => {
    const lines = readFileSync(SKILL, 'utf8').split('\n');
    const start = lines.findIndex((text) => text.includes('`<folder>: the stem "<stem>" <reason>, which the builder does not handle.`'));
    const after = lines.slice(start + 1);
    const reasons = after.slice(0, after.findIndex((text) => !/^ {7}- `[a-z]/.test(text)));
    expect(reasons).toHaveLength(8);
    for (const reason of reasons) expect(reason).not.toMatch(/\b(next|later|another) build\b/);
  });
});

describe('the build-set skill\'s per-song track-count fix', () => {
  // stemProblems prints this line for a single track too, whose target holds one track (templateTargets).
  it('gives a fix for a single track as well as a group', () => {
    const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.includes('`<folder>: <group> needs <n> tracks for this song, and the template has <n>.`'));
    expect(line).toMatch(/single track/);
    expect(line).toMatch(/For a group, Nick adds tracks/);
  });
});

describe('the build-set skill\'s outside-file fix', () => {
  // Live 12's Collect All and Save copies only the locations its dialog picks (Live 12 manual, Managing Files and Sets).
  it('names the dialog\'s choice of locations, the User Library and Packs included', () => {
    const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.includes('`refers to a file outside the song\'s folder...`'));
    expect(line).toMatch(/dialog/);
    expect(line).toMatch(/User Library/);
    expect(line).toMatch(/Packs/);
  });
});

describe('the build-set skill\'s name-match fixes', () => {
  for (const quote of ['`"<name>" matches no song folder in <library>. The song folders are:...`', '`"<name>" matches <n> song folders; name one more fully:...`']) {
    it(`send Claude back to a fresh listing for ${quote}, since a listed short name names its own folder alone`, () => {
      const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.includes(quote));
      expect(line).toMatch(/the listing runs again \(back to step 1\)/i);
      expect(line).not.toMatch(/back to step 4/);
    });
  }
});

describe('the build-set skill\'s whole-name match', () => {
  it('says a whole folder name inside another listed folder\'s name matches that folder alone, as foldersNamed does', () => {
    const line = readFileSync(SKILL, 'utf8').split('\n').find((text) => text.startsWith('2. **Match each song to one line.**')) ?? '';
    const [, folder, longer] = /\(`([^`]+)` beside `([^`]+)`\)/.exec(line) ?? [];
    expect(folder).toBeDefined();
    expect(longer).toContain(folder);
    expect(foldersNamed([folder ?? '', longer ?? ''], folder ?? '')).toEqual([folder]);
    expect(line).toMatch(/matches that folder alone/);
    expect(line).not.toMatch(/matches both/);
  });
});
