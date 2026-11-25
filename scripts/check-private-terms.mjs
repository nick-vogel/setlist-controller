#!/usr/bin/env node
// Fails when the tree, a range of commits, or text on stdin holds a term from the maintainer's private list
// (.claude/rules/public-repository.md). The list lives outside the repository, at PRIVATE_TERMS_FILE or
// ~/.config/setlist-controller/private-terms.txt, because it names what it guards. Where no list exists, as in a
// contributor's clone, the check notes that and passes.
//
//   node scripts/check-private-terms.mjs                 every tracked text file of the working tree
//   node scripts/check-private-terms.mjs --range A..B    each line the commits in A..B add, their messages, and their
//                                                        author and committer names and addresses
//   node scripts/check-private-terms.mjs --stdin         the text on stdin, such as a pull request's title and body
//
// Binary files are not read: a term inside an image's bytes is outside what this check can see.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const refuse = (problem) => {
  console.error(`check:private: ${problem}`);
  process.exit(2);
};
let values;
try {
  ({ values } = parseArgs({ options: { stdin: { type: 'boolean', default: false }, range: { type: 'string' } } }));
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}
if (values.stdin && values.range !== undefined) refuse('pass --stdin or --range, not both');
if (values.range === '') refuse('--range needs a range, such as origin/main..HEAD');

const termsFile = process.env.PRIVATE_TERMS_FILE || join(homedir(), '.config/setlist-controller/private-terms.txt');
if (!existsSync(termsFile)) {
  console.error(`check:private: no private terms file at ${termsFile}, so nothing was checked.`);
  process.exit(0);
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const terms = readFileSync(termsFile, 'utf8')
  .split('\n')
  .map((line, index) => ({ line: line.trim(), number: index + 1 }))
  .filter(({ line }) => line !== '' && !line.startsWith('#'))
  .map(({ line, number }) => {
    const word = line.startsWith('word:');
    const term = word ? line.slice('word:'.length) : line;
    return { number, pattern: new RegExp(word ? `(?<![\\p{L}\\p{N}_])${escape(term)}(?![\\p{L}\\p{N}_])` : escape(term), 'iu') };
  });

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
const found = [];
const scan = (where, text) => {
  for (const { number, pattern } of terms) if (pattern.test(text)) found.push(`${where} holds the term on line ${number} of ${termsFile}`);
};

if (values.stdin) {
  scan('stdin', readFileSync(0, 'utf8'));
} else if (values.range !== undefined) {
  for (const sha of git('rev-list', values.range).split('\n').filter(Boolean)) {
    const short = sha.slice(0, 7);
    scan(`commit ${short}'s message`, git('show', '-s', '--format=%B', sha));
    scan(`commit ${short}'s author and committer`, git('show', '-s', '--format=%an <%ae>%n%cn <%ce>', sha));
    for (const path of git('diff-tree', '--no-commit-id', '--name-only', '--diff-filter=AMCR', '-r', '-z', '--root', '-c', sha).split('\0').filter(Boolean)) {
      scan(`commit ${short}, path ${path}`, path);
    }
    let file = '';
    let inHunk = false;
    for (const line of git('show', '--format=', '--unified=0', '--no-color', '--no-ext-diff', sha).split('\n')) {
      if (line.startsWith('diff ')) {
        file = '';
        inHunk = false;
      } else if (/^@{2,} /.test(line)) inHunk = true;
      else if (!inHunk && line.startsWith('+++ ')) file = line.replace(/^\+\+\+ (b\/)?/, '');
      else if (inHunk && line.startsWith('+')) scan(`commit ${short}, ${file}`, line.slice(1));
    }
  }
} else {
  for (const file of git('ls-files', '-z').split('\0').filter(Boolean)) scan(`path ${file}`, file);
  for (const file of git('grep', '-I', '--name-only', '-e', '', '--', '.', ':!pnpm-lock.yaml').split('\n').filter(Boolean)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => scan(`${file}:${index + 1}`, line));
  }
}

if (found.length > 0) {
  for (const each of found) console.error(`check:private: ${each}`);
  process.exit(1);
}
