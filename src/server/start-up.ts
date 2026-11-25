import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { leaderPagePath, producerPagePath, SETUP_PAGE } from '../shared/routes.ts';
import { SET_MANIFEST_FILE } from '../shared/set-manifest.ts';
import { startAdvertising, type Advertiser, type Register } from './advertise.ts';
import { realClock } from './clock.ts';
import type { TargetKind, TargetKinds } from './connections-config.ts';
import { eosKind } from './eos.ts';
import { DEFAULT_LATENESS_LOG } from './lateness-log.ts';
import { readLeaderSecret, readProducerSecret } from './leader-secret.ts';
import { proPresenterKind } from './propresenter.ts';
import type { MidiInput } from './midi-input.ts';
import type { PowerSource } from './power.ts';
import { DEFAULTS, startServer, type Server } from './server.ts';

// What the server's start-up takes from outside: the folder its settings live in, the loaders for the
// two native packages, the way to register setlist.local, and the playback Mac's power source.
// main.ts hands over the real ones; a test hands over stand-ins, so it loads neither native package,
// writes nothing under ~/Library, and never runs dns-sd or pmset.
export type Natives = {
  // The pedal config, the connections config, the set manifest, the leader secret, the producer secret
  // and ProPresenter's playlist picks live here.
  appSupport: string;
  loadAtemKind: () => Promise<TargetKind>;
  openMidiInput: () => Promise<MidiInput>;
  register: Register;
  openPowerSource: () => PowerSource;
};

// Starts the server as main.ts does, from the command line's arguments, and logs where it is. The
// caller closes what it returns.
export async function startUp(args: string[], natives: Natives): Promise<{ server: Server; advertiser: Advertiser }> {
  const { appSupport } = natives;
  const { values } = parseArgs({
    args,
    options: {
      'http-port': { type: 'string', default: String(DEFAULTS.httpPort) },
      'osc-send-port': { type: 'string', default: String(DEFAULTS.oscSendPort) },
      'osc-receive-port': { type: 'string', default: String(DEFAULTS.oscReceivePort) },
      'pedal-config': { type: 'string', default: join(appSupport, 'pedal.json') },
      'connections-config': { type: 'string', default: join(appSupport, 'connections.json') },
      'set-manifest': { type: 'string', default: join(appSupport, SET_MANIFEST_FILE) },
      'lateness-log': { type: 'string', default: DEFAULT_LATENESS_LOG },
    },
  });

  // The kinds of connection target the connections config file may name, by their key in the file.
  // Each target's epic registers its kind here. The lights need no native package, so their kind is
  // built here, not loaded.
  const TARGET_KINDS: TargetKinds = {
    atem: await natives.loadAtemKind(),
    eos: eosKind(),
    // The slide timing file is the repository's, beside the stem map (slide-timing.ts).
    propresenter: proPresenterKind({ statePath: join(appSupport, 'propresenter-picks.json'), slideTimingPath: resolve(import.meta.dirname, '../../config/slide-timing.json') }),
  };

  const leaderSecret = await readLeaderSecret(appSupport);
  const producerSecret = await readProducerSecret(appSupport);

  const server = await startServer({
    httpPort: Number(values['http-port']),
    oscSendPort: Number(values['osc-send-port']),
    oscReceivePort: Number(values['osc-receive-port']),
    midiInput: await natives.openMidiInput(),
    pedalConfigPath: values['pedal-config'],
    connectionsConfigPath: values['connections-config'],
    targetKinds: TARGET_KINDS,
    setManifestPath: values['set-manifest'],
    latenessLog: { path: values['lateness-log'] },
    leaderSecret,
    producerSecret,
    powerSource: natives.openPowerSource(),
  });

  // The phones and the iPad find the laptop as setlist.local. The register is handed in, so a test
  // passes a stand-in and never runs dns-sd.
  const advertiser = startAdvertising({ port: server.httpPort, clock: realClock, register: natives.register });

  console.log(`Setlist server on http://localhost:${server.httpPort}`);
  console.log(`Setup screen on http://localhost:${server.httpPort}${SETUP_PAGE}, on this machine only`);
  console.log(`Leader page on http://localhost:${server.httpPort}${leaderPagePath(leaderSecret)}`);
  console.log(`Producer page on http://localhost:${server.httpPort}${producerPagePath(producerSecret)}`);
  console.log(`Talking to Live on OSC port ${values['osc-send-port']}, replies on ${values['osc-receive-port']}`);
  console.log(`Pedal config from ${values['pedal-config']}`);
  console.log(`Connections config from ${values['connections-config']}`);
  console.log(`Set manifest from ${values['set-manifest']}`);
  console.log(`Lateness log at ${values['lateness-log']}`);

  return { server, advertiser };
}
