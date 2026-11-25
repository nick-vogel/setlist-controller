import { dnsSdRegister } from './advertise.ts';
import { APP_SUPPORT } from './app-support.ts';
import { loadAtemKind, openMidiInput } from './native-loaders.ts';
import { startUp } from './start-up.ts';

// The real loaders and dns-sd. Each loader is wrapped, so its optional load is never handed anything.
const { server, advertiser } = await startUp(process.argv.slice(2), {
  appSupport: APP_SUPPORT,
  loadAtemKind: () => loadAtemKind(),
  openMidiInput: () => openMidiInput(),
  register: dnsSdRegister,
});

// launchctl bootout sends SIGTERM; Ctrl-C in a terminal sends SIGINT.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    advertiser.close();
    // A client that holds its connection open must not keep the server from exiting.
    setTimeout(() => process.exit(0), 3000).unref();
    server.close().finally(() => process.exit(0));
  });
}
