import { expect, test } from '@playwright/test';
import { startE2eRig, type E2eRig } from './rig.ts';

let e2e: E2eRig | undefined;

test.afterEach(async () => {
  await e2e?.close();
  e2e = undefined;
});

// The pedal's status reaches the setup screen on its own route, which the page reads again and
// again, not in the snapshot. Only a browser shows that the screen keeps up as switches are pressed.
test("the setup screen's MIDI monitor lists each message as a switch is pressed, newest first", async ({ page }) => {
  e2e = await startE2eRig();
  await page.goto(e2e.setupUrl);

  const pedal = page.locator('section[aria-labelledby="pedal"]');
  await expect(pedal).toContainText('No pedal config.');
  await expect(pedal).toContainText('Press a pedal switch to see its message.');

  e2e.rig.midi.send([0xb0, 0x50, 0x7f]);
  const lines = pedal.locator('ul.midi-monitor li');
  await expect(lines).toHaveText(['B0 50 7F Control change 80, value 127, channel 1 unmapped'], { timeout: 3000 });

  e2e.rig.midi.send([0xb0, 0x51, 0x7f]);
  await expect(lines).toHaveText(
    ['B0 51 7F Control change 81, value 127, channel 1 unmapped', 'B0 50 7F Control change 80, value 127, channel 1 unmapped'],
    { timeout: 3000 },
  );
});
