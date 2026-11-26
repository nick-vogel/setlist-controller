import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { manualClock } from '../../../../src/server/clock.ts';
import { POSITION_BROADCAST_MS, startHub } from '../../../../src/server/hub.ts';
import { UNKNOWN_POWER } from '../../../../src/shared/power.ts';
import { SOCKET_PATHS } from '../../../../src/shared/routes.ts';
import type { ConnectionsPart, Snapshot } from '../../../../src/shared/snapshot.ts';

const SET = {
  songs: [{ number: 1, title: 'Song', sections: [{ name: 'Intro', time: 0, end: 64, cue: 0 }], end: 64, endCue: 1 }],
  warnings: [],
};

const snap = (position: number): Snapshot => ({
  live: 'connected',
  set: SET,
  playing: true,
  position,
  now: { song: 1, section: 0, next: 'end', bar: 1, bars: 16, fraction: position / 64 },
  jump: null,
  countIn: false,
  endToggles: { 1: 'stop' },
  loop: null,
  safeMode: true,
  fade: null,
  chartRevision: 1,
  songMeters: { 1: 4 },
  songTimings: {},
  power: UNKNOWN_POWER,
});

const empty: ConnectionsPart = { connections: [], connectionProblems: [] };
const withTarget: ConnectionsPart = {
  connections: [
    {
      name: 'propresenter',
      label: 'ProPresenter',
      configured: true,
      problems: [],
      connection: 'online',
      arm: 'disarmed',
      pause: null,
      movedTo: null,
      check: { kind: 'not-checked' },
      buttons: [],
      pick: null,
      state: [],
      list: [],
      listCurrent: null,
      lateness: { last: null, median: null, acted: null, actedMedian: null },
    },
  ],
  connectionProblems: [],
};

async function runCase(mode: 'producer-only' | 'revert'): Promise<number[]> {
  const clock = manualClock();
  const http = createServer();
  const hub = startHub(http, { snapshot: snap(0), connections: empty }, { leader: 'l', producer: 'p' }, () => {}, () => {}, clock);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as AddressInfo).port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}${SOCKET_PATHS.viewer}`);
  const positions: number[] = [];
  ws.on('message', (data) => {
    const parsed = JSON.parse(String(data)) as Record<string, unknown>;
    if ('position' in parsed) positions.push(parsed.position as number);
  });
  await new Promise<void>((resolve) => ws.once('open', resolve));
  const waitFor = (count: number) =>
    new Promise<void>((resolve) => {
      const check = () => (positions.length >= count ? resolve() : setTimeout(check, 5));
      check();
    });
  await waitFor(1);

  clock.advance(POSITION_BROADCAST_MS);
  if (mode === 'producer-only') {
    hub.publish(snap(1), empty);
    hub.publish(snap(1), withTarget);
    hub.publish(snap(2), withTarget);
  } else {
    hub.publish(snap(1), empty);
    hub.publish(snap(2), empty);
    hub.publish(snap(1), empty);
    hub.publish(snap(3), empty);
  }
  await waitFor(2);
  await new Promise((resolve) => setTimeout(resolve, 80));

  ws.close();
  await hub.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
  return positions;
}

const producerOnly = await runCase('producer-only');
const revert = await runCase('revert');
console.log(`producer-only: ${JSON.stringify(producerOnly)} (expected [0,1])`);
console.log(`revert: ${JSON.stringify(revert)} (expected [0,1])`);
if (JSON.stringify(producerOnly) !== '[0,1]' || JSON.stringify(revert) !== '[0,1]') {
  process.exit(1);
}
