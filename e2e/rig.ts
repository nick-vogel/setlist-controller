import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { leaderPagePath, producerPagePath, SETUP_PAGE, VIEW_PAGE } from '../src/shared/routes.ts';
import { CLOSE_TIMEOUT_MS, closeInOrder, startRig, type LiveSetup, type Rig, type RigOptions } from '../test/harness.ts';
import { startProxy, type Proxy } from '../test/proxy.ts';

// The real server and the fake Live for one Playwright test, in this process, on ports the OS
// assigns (never Live's 11000 and 11001). The server serves the built page from dist/web, which
// `pnpm test:e2e` builds first. The fake Live's playhead moves only when the test says.

// Two songs in 4/4. Every section name is unique in the set, so a page's text names one section.
export const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
  { name: '2 - Opening', time: 64 },
  { name: '2 - Bridge', time: 80 },
  { name: '2 - End', time: 96 },
];
// Cue indexes into SET, and section indexes into song 1.
export const VERSE = 1;
export const CHORUS = 2;

// A set with bad locators, and the warnings the setup screen lists for it, in order: a locator
// with no song number, song 3 with no End, and no song 2 between songs 1 and 3.
export const BAD_SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: 'Count in', time: 8 },
  { name: '1 - End', time: 16 },
  { name: '3 - Opening', time: 32 },
];
export const BAD_SET_WARNINGS = [
  'The locator "Count in" does not read as "<song number> - <section name>".',
  'Song 3 has no End locator.',
  'There is no song 2.',
];

export type E2eRig = {
  rig: Rig;
  // The server's address, with no path, for a test that types a path of its own.
  baseUrl: string;
  // The leader page, with the rig's leader secret in its path.
  leaderUrl: string;
  // The producer page, with the rig's producer secret in its path.
  producerUrl: string;
  viewerUrl: string;
  // The operator's setup screen. The rig serves on 127.0.0.1, so the page counts as the laptop's.
  setupUrl: string;
  close(): Promise<void>;
};

// A rig whose pages reach the server through a proxy the test can drop or freeze.
export type ProxiedE2eRig = E2eRig & { proxy: Proxy };

// The fake Live holds SET unless the test gives it other locators. The options reach the server,
// such as the connection targets it starts with.
export async function startE2eRig(setup: LiveSetup = {}, cuePoints: CuePoint[] = SET, options: RigOptions = {}): Promise<E2eRig> {
  const rig = await startRig(cuePoints, setup, options);
  return rigAt(rig, rig.server.httpPort, () => rig.close());
}

export async function startProxiedE2eRig(setup: LiveSetup = {}, cuePoints: CuePoint[] = SET): Promise<ProxiedE2eRig> {
  const rig = await startRig(cuePoints, setup);
  const proxy = await startProxy(rig.server.httpPort);
  return {
    // Twice the rig's own budget, so a rig that cannot close rejects with the part of it still open
    // before this close gives up on the rig as a whole.
    ...rigAt(rig, proxy.port, () =>
      closeInOrder(
        [
          { what: 'the proxy', close: () => proxy.close() },
          { what: 'the rig', close: () => rig.close() },
        ],
        2 * CLOSE_TIMEOUT_MS,
      ),
    ),
    proxy,
  };
}

function rigAt(rig: Rig, port: number, close: () => Promise<void>): E2eRig {
  const base = `http://127.0.0.1:${port}`;
  return {
    rig,
    baseUrl: base,
    leaderUrl: `${base}${leaderPagePath(rig.leaderSecret)}`,
    producerUrl: `${base}${producerPagePath(rig.producerSecret)}`,
    viewerUrl: `${base}${VIEW_PAGE}`,
    setupUrl: `${base}${SETUP_PAGE}`,
    close,
  };
}
