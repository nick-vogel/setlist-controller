// setlist-controller#33 pre-PR review 1, finding 1. One view-only socket says hello with a new client
// ID each time and dismisses the message to the view-only devices, as the hub's hello path does
// (src/server/hub.ts: devices.hello, then messages.dismiss). The registry keeps at most
// MAX_OFFLINE_DEVICES offline rows, so it stays small. The board keeps a mark for every client ID.
// Exit 1 while the marks outlive the registry, exit 0 once they are bounded by it.
// Run from the repo root: node docs/reviews/setlist-controller-33/repro/dismissed-marks-outlive-registry.mts
import { createDeviceRegistry, MAX_OFFLINE_DEVICES } from '../../../../src/server/devices.ts';
import { createMessageBoard } from '../../../../src/server/messages.ts';

const HELLOS = 20000;
const devices = createDeviceRegistry<object>();
const messages = createMessageBoard();
const { id } = messages.send('Repeat chorus', 'viewers');
const socket = {};
const clientOf = (i: number) => `c${String(i).padStart(63, '0')}`;

for (let i = 0; i < HELLOS; i += 1) {
  const hello = { kind: 'hello' as const, client: clientOf(i), name: 'x', battery: null, dismissed: [id] };
  devices.hello(socket, 'viewer', hello);
  messages.dismiss(hello.client, 'viewer', hello.dismissed);
  if (i % 1000 === 0) messages.active(devices.list());
}

// A client the registry evicted long ago comes back with no dismissed IDs in its hello. If its mark
// was kept, the board still lists it as dismissed.
const evicted = clientOf(0);
devices.hello({}, 'viewer', { kind: 'hello', client: evicted, name: 'x', battery: null, dismissed: [] });
const listed = devices.list().length;
const stillMarked = messages.active(devices.list())[0].dismissedBy.includes(evicted);

let marksHeld = 0;
for (let i = 0; i < HELLOS; i += 1) if (!messages.dismiss(clientOf(i), 'viewer', [id])) marksHeld += 1;

console.log(`registry rows ${listed} (offline cap ${MAX_OFFLINE_DEVICES}), hellos ${HELLOS}`);
console.log(`marks the board still holds ${marksHeld}`);
console.log(`client evicted after its first hello still marked dismissed on its return: ${stillMarked}`);
process.exit(marksHeld > listed ? 1 : 0);
