// Repro for docs/reviews/setlist-controller-1/pre-pr-review-4.md, finding 2. Copy into test/ to run.
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { LEADER_SECRET_FILE, readLeaderSecret } from '../src/server/leader-secret.ts';

let folder = '';
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

it('replaces a leader-secret that is a dangling symlink instead of retrying forever', async () => {
  folder = await mkdtemp(join(tmpdir(), 'review-4-secret-'));
  await symlink(join(folder, 'nowhere'), join(folder, LEADER_SECRET_FILE));
  const outcome = await Promise.race([
    readLeaderSecret(folder).then((secret) => ({ secret })),
    new Promise<{ secret: null }>((resolve) => setTimeout(() => resolve({ secret: null }), 2000)),
  ]);
  expect(outcome.secret).toMatch(/^[0-9a-f]{32}$/);
  expect((await readdir(folder)).filter((name) => name !== LEADER_SECRET_FILE && name !== 'nowhere')).toEqual([]);
});
