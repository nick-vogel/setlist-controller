import { parseArgs } from 'node:util';
import { startFakeLive, type CuePoint } from './fake-live.ts';

// The fake Live as a standalone program, on the AbletonOSC ports unless told otherwise.

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '11000' },
    'reply-port': { type: 'string', default: '11001' },
  },
});

// Two songs at 4 beats a bar.
const DEMO_SET: CuePoint[] = [
  { name: '1 - Intro (Goodness of God)', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 48 },
  { name: '1 - Bridge', time: 80 },
  { name: '1 - Chorus', time: 112 },
  { name: '1 - End', time: 144 },
  { name: '2 - Intro', time: 160 },
  { name: '2 - Verse', time: 176 },
  { name: '2 - Chorus', time: 208 },
  { name: '2 - End', time: 240 },
];

// The demo set starts stopped at the top. The leader page plays it, and with each song's end
// toggle on Stop at end, the server stops it at song 1's End.
const live = await startFakeLive({
  cuePoints: DEMO_SET,
  port: Number(values.port),
  replyPort: Number(values['reply-port']),
  playing: false,
  clock: 'realtime',
  // As AbletonOSC does on load, so a restarted fake Live has a running server register its listeners.
  startup: true,
});

console.log(`Fake Live on OSC port ${live.port}, replies on ${values['reply-port']}`);
console.log('The demo set is stopped at beat 0, at 120 BPM in 4/4');
