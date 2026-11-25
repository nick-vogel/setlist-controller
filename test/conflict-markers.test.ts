import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './set-builder-harness.ts';

// No tracked file keeps a line that starts with a merge conflict marker. A hand-resolved merge once left one in
// docs/install.md, and lint, typecheck, test and build all passed over it, since none of them reads Markdown for markers.
//
// The pattern also matches a Markdown setext heading underlined with exactly seven equals signs, because that line is the
// same as the middle marker. The repo has none, and the pattern stays as it is: if one is ever wanted, underline it with
// more or fewer than seven. Binary files are searched too (no -I), since none matches today.
const MARKER = '^(<<<<<<<|>>>>>>>|\\|\\|\\|\\|\\|\\|\\||=======)( |$)';

describe('conflict markers', () => {
  it('leaves no tracked file with a line that starts with a merge conflict marker', () => {
    const { status, stdout, stderr, error } = spawnSync('git', ['grep', '-nE', MARKER], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    // git grep exits 1 when nothing matches and 0 when something does. Anything else means the search itself failed, which
    // must not read as a clean tree.
    expect(error, 'git could not be run').toBeUndefined();
    expect([0, 1], `git grep failed (exit ${status}): ${stderr}`).toContain(status);
    expect(stdout, `conflict markers left in tracked files:\n${stdout}`).toBe('');
  });
});
