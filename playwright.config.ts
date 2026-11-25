import { defineConfig, devices } from '@playwright/test';

// Seam 3: what only a browser can prove, against the real server and the fake Live, in WebKit as on
// the leader's iPad and in Chromium as on a band member's Android phone. Every spec runs in both.
// Run by hand with `pnpm test:e2e`, never in CI. Each test starts its own server and fake Live
// in-process (e2e/rig.ts), on ports the OS assigns, so there is no webServer here.
export default defineConfig({
  testDir: 'e2e',
  // One at a time: the hold test times real milliseconds.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  projects: [
    {
      // WebKit, as on the leader's iPad and the band's iPhones.
      name: 'webkit-ipad',
      use: { ...devices['iPad (gen 7)'] },
    },
    {
      // Chromium, as on the band's Android phones.
      name: 'chromium-android',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
