import { expect, test } from '@playwright/test';
import { LEADER_PAGE, SOCKET_PATHS } from '../src/shared/routes.ts';
import { loaded } from '../test/harness.ts';
import { CHORUS, startE2eRig, VERSE, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

const JUMP = '/live/song/cue_point/jump';
const STOP = '/live/song/stop_playing';

test('the view-only page has no control of Live, only its Part select, and a command forced from it is rejected', async ({ page }) => {
  e2e = await startE2eRig({ playing: true, position: 0 });
  await page.goto(e2e.viewerUrl);
  await expect(page.getByText('Intro', { exact: true }).first()).toBeVisible();

  // No Stop, no tap targets, no section controls, no Refresh, no Play from start, no toggle choices.
  // Its one control is the Part select, which sends nothing to the server.
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(1);
  await expect(page.getByLabel('Part')).toBeVisible();

  // Force a stop and a jump to the Chorus from the page, on its own view-only socket. The server
  // answers the closing handshake only after it has read every frame before it, so once the close
  // comes back the server has handled both commands.
  await page.evaluate(
    async ({ path, section }) => {
      const socket = new WebSocket(`ws://${location.host}${path}`);
      await new Promise((resolve) => socket.addEventListener('open', resolve));
      socket.send(JSON.stringify({ kind: 'stop' }));
      socket.send(JSON.stringify({ kind: 'jump', song: 1, section }));
      const closed = new Promise((resolve) => socket.addEventListener('close', resolve));
      socket.close();
      await closed;
    },
    { path: SOCKET_PATHS.viewer, section: CHORUS },
  );

  // The leader's jump, sent after, reaches Live, and Live's messages arrive in order, so anything
  // the page sent would have reached it first.
  const leader = await e2e.rig.connectLeader();
  await leader.snapshot(loaded);
  leader.send({ kind: 'jump', song: 1, section: VERSE });
  await expect.poll(() => e2e?.rig.received(JUMP).length).toBe(1);

  expect(e2e.rig.received(JUMP)).toEqual([{ address: JUMP, args: [VERSE], types: 'i' }]);
  expect(e2e.rig.received(STOP)).toEqual([]);
  expect(leader.received.at(-1)?.playing).toBe(true);
  // The page shows the leader's waiting jump, never the forced one.
  await expect(page.getByText('Jumping to Verse.')).toBeVisible();
  await expect(page.getByText('Jumping to Chorus.')).toHaveCount(0);
});

test('the leader path typed with no secret opens the view-only page, with no control of Live', async ({ page }) => {
  e2e = await startE2eRig({ playing: false, position: 0 });
  for (const path of [LEADER_PAGE, `${LEADER_PAGE}/`]) {
    await page.goto(`${e2e.baseUrl}${path}`);
    await expect(page.getByText('Intro', { exact: true }).first()).toBeVisible();

    // No Stop, no tap targets, no section controls, no Refresh, no Play from start, no toggle choices.
    // Its one control is the Part select, which sends nothing to the server.
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(1);
    await expect(page.getByLabel('Part')).toBeVisible();
  }
});
