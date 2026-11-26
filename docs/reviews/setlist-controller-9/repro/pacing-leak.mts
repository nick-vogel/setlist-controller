// Repro for pre-pr-review-1 finding 1: a position-only publish that lands while a socket's send is in
// flight reaches that socket when the send completes, ahead of the trailing flush, so the ~20 Hz cap
// from #16 does not hold for it. Run from the repo root:
//   node docs/reviews/setlist-controller-9/repro/pacing-leak.mts [source root, default .]
// Exits 0 when the viewer received positions [0, 1] only (paced), 1 when the held position leaked.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

const root = resolve(process.argv[2] ?? '.');
const { startHub, POSITION_BROADCAST_MS } = await import(pathToFileURL(`${root}/src/server/hub.ts`).href);
const { manualClock } = await import(pathToFileURL(`${root}/src/server/clock.ts`).href);
const { UNKNOWN_POWER } = await import(pathToFileURL(`${root}/src/shared/power.ts`).href);

const snap = (position: number) => ({
  live: 'connected',
  set: { songs: [{ number: 1, title: 'Song 1', sections: [{ name: 'Intro', time: 0, end: 64, cue: 0 }], end: 64, endCue: 1 }], warnings: [] },
  playing: false,
  position,
  now: { song: 1, section: 0, next: 'end', bar: Math.floor(position / 4) + 1, bars: 16, fraction: position / 64 },
  jump: null, countIn: false, endToggles: { 1: 'stop' }, loop: null, fade: null, chartRevision: 1, songMeters: { 1: 4 }, songTimings: {}, safeMode: true, power: UNKNOWN_POWER,
});
const none = { connections: [], connectionProblems: [] };

const clock = manualClock();
const http = createServer();
const hub = startHub(http, { snapshot: snap(0), connections: none }, { leader: 'l', producer: 'p' }, () => {}, () => {}, clock);
await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
const positions: number[] = [];
const viewer = new WebSocket(`ws://127.0.0.1:${(http.address() as AddressInfo).port}/ws`);
viewer.on('message', (data) => {
  const value = JSON.parse(String(data));
  if (typeof value.position === 'number') positions.push(value.position);
});
await new Promise((done) => viewer.once('open', done));
while (positions.length === 0) await new Promise((done) => setTimeout(done, 5));

clock.advance(POSITION_BROADCAST_MS);
hub.publish(snap(1), none);
hub.publish(snap(2), none);
await new Promise((done) => setTimeout(done, 200));

viewer.close();
await hub.close();
await new Promise<void>((done) => http.close(() => done()));
console.log(`viewer received positions ${JSON.stringify(positions)}`);
process.exit(JSON.stringify(positions) === '[0,1]' ? 0 : 1);
