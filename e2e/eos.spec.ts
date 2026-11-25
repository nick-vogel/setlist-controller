import { expect, test } from '@playwright/test';
import { manualClock } from '../src/server/clock.ts';
import { eosKind } from '../src/server/eos.ts';
import { connectionsConfigs, startFakeEos, type FakeEos } from '../test/fake-eos.ts';
import { startE2eRig, type E2eRig } from './rig.ts';

// The lights' row on the producer page, on the fake Eos (test/fake-eos.ts) on a port the OS assigns,
// never Eos's default 3032. The connections config is written at test time, inside the worktree's
// dist, with the fake's port.

let e2e: E2eRig | undefined;
let eos: FakeEos | undefined;
const configs = connectionsConfigs();

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
  await eos?.close();
  eos = undefined;
  await configs.remove();
});

// Every message the fake Eos received on a cue list's own address, such as a Go or a Back, in order.
const cueListAddresses = (fake: FakeEos) => fake.received.filter((message) => message.address.startsWith('/eos/cues/')).map((message) => message.address);

test("the lights' Go and Back show on their row, and pressing one reaches Eos", async ({ page }) => {
  const fake = await startFakeEos();
  eos = fake;
  const path = await configs.write({ eos: { host: '127.0.0.1', port: fake.port, cueList: 1 } });
  e2e = await startE2eRig({}, undefined, { connectionsConfig: path, targetKinds: { eos: eosKind({ clock: manualClock() }) } });

  await page.goto(e2e.producerUrl);
  const row = page.getByRole('region', { name: 'Connections' }).getByRole('listitem', { name: 'Lights' });
  await expect(row).toContainText('Online');
  const go = row.getByRole('button', { name: 'Go', exact: true });
  const back = row.getByRole('button', { name: 'Back', exact: true });
  await expect(go).toBeEnabled();
  await expect(back).toBeEnabled();
  // Armed, so a press that paused the lights would show: only an armed target can be paused.
  await row.getByRole('button', { name: 'Arm', exact: true }).click();
  await expect(row.locator('.connection-arm')).toHaveText('Armed');

  await go.click();
  await expect.poll(() => cueListAddresses(fake)).toEqual(['/eos/cues/1/fire']);

  await back.click();
  await expect.poll(() => cueListAddresses(fake)).toEqual(['/eos/cues/1/fire', '/eos/cues/1/stop']);
  // The presses never pause the lights (target.ts, #137), so the row is still armed after them.
  await expect(row.locator('.connection-arm')).toHaveText('Armed');
});
