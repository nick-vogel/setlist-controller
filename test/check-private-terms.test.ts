import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from './set-builder-harness.ts';

// scripts/check-private-terms.mjs against a scratch git repository and a scratch terms file. The terms here are made up:
// the real list stays outside the repository, since it names what it guards (.claude/rules/public-repository.md).
const SCRIPT = join(REPO_ROOT, 'scripts/check-private-terms.mjs');
const TERMS = ['# a comment', '', 'Example Fellowship', 'word:EXF', 'retired-host-01'].join('\n');

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

async function scratch(email = 'maintainer@users.noreply.github.com') {
  dir = await mkdtemp(join(REPO_ROOT, 'dist/private-terms-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Maintainer');
  git('config', 'user.email', email);
  await writeFile(join(dir, 'terms.txt'), TERMS);
  await writeFile(join(dir, 'README.md'), 'A setlist controller.\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'First commit');
  return git('rev-parse', 'HEAD');
}

async function commit(file: string, text: string, message = 'A change') {
  await writeFile(join(dir, file), text);
  git('add', file);
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

function check(args: string[], { terms = join(dir, 'terms.txt'), input }: { terms?: string; input?: string } = {}) {
  return spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', input, env: { ...process.env, PRIVATE_TERMS_FILE: terms } });
}

describe('pnpm check:private', () => {
  it('passes a tree and a range that hold no private term', async () => {
    const first = await scratch();
    await commit('notes.md', 'The Sunday set, with an EXFIL line that is no whole word.\n');
    expect(check([]).status).toBe(0);
    expect(check(['--range', `${first}..HEAD`]).status).toBe(0);
  });

  it('fails a tracked file that holds a term, in any letter case, and names the file and the line', async () => {
    await scratch();
    await commit('notes.md', 'one\nPlayback at example fellowship.\n');
    const result = check([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('notes.md:2');
  });

  it('matches a word: term as a whole word only', async () => {
    await scratch();
    await commit('notes.md', 'Ready for the EXF band.\n');
    expect(check([]).status).toBe(1);
  });

  it('fails a range in which one commit adds a term and a later one removes it, since the history is public too', async () => {
    const first = await scratch();
    await commit('notes.md', 'retired-host-01.local\n');
    await commit('notes.md', 'the production Mac\n');
    expect(check([]).status).toBe(0);
    const result = check(['--range', `${first}..HEAD`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('notes.md');
  });

  it('fails a range whose commit message holds a term', async () => {
    const first = await scratch();
    await commit('notes.md', 'clean\n', 'Lights for Example Fellowship');
    expect(check(['--range', `${first}..HEAD`]).status).toBe(1);
  });

  it('fails a range with a commit whose author address holds a term', async () => {
    const first = await scratch();
    git('config', 'user.email', 'me@retired-host-01.example');
    await commit('notes.md', 'clean\n');
    expect(check(['--range', `${first}..HEAD`]).status).toBe(1);
  });

  it('fails text on stdin that holds a term, for a pull request title and body', async () => {
    await scratch();
    expect(check(['--stdin'], { input: 'Fix the cue lights\n\nFor Example Fellowship.' }).status).toBe(1);
    expect(check(['--stdin'], { input: 'Fix the cue lights' }).status).toBe(0);
  });

  it.for([[['--', '--stdin']], [['--', '--range', 'HEAD~1..HEAD']], [['--rang', 'HEAD~1..HEAD']], [['--stdin', '--range', 'HEAD~1..HEAD']], [['--range', '']]])(
    'refuses %j with exit 2 and checks nothing, even with no terms file',
    async ([args]) => {
      await scratch();
      await commit('notes.md', 'clean\n');
      const result = check(args, { terms: join(dir, 'no-such-terms.txt') });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/^check:private: /);
      expect(result.stderr).not.toContain('no private terms file');
    },
  );

  it('reads --range=<range> as --range <range>', async () => {
    const first = await scratch();
    await commit('notes.md', 'retired-host-01\n');
    await commit('notes.md', 'clean\n');
    const result = check([`--range=${first}..HEAD`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('notes.md holds the term on line 5');
  });

  it('skips with a note, exit 0, where no terms file exists, as in a contributor clone', async () => {
    await scratch();
    await commit('notes.md', 'Example Fellowship\n');
    const result = check([], { terms: join(dir, 'no-such-terms.txt') });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('no private terms file');
  });
});
