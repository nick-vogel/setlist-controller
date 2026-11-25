import { spawn } from 'node:child_process';
import type { Clock } from './clock.ts';
import { LOCAL_HOST, laptopAddress } from './setup.ts';

// How often the advertiser reads the laptop's address again. The Wi-Fi may join after the server
// starts, and DHCP may hand the laptop a new address.
export const ADVERTISE_EVERY_MS = 5000;

// What the laptop announces over Bonjour: the name, the address it resolves to, and the server's port.
export type Advert = { host: string; address: string; port: number };

// Makes one registration and returns the way to stop it. Calls ended when the registration ends on its
// own, never after stop.
export type Register = (advert: Advert, ended: () => void) => { stop(): void };

export type Advertiser = { close(): void };

export type AdvertiseOptions = { port: number; clock: Clock; register: Register };

// Advertises setlist.local at the laptop's stage-network address for as long as the server runs.
export function startAdvertising({ port, clock, register }: AdvertiseOptions): Advertiser {
  let current: { address: string; ended: boolean; stop(): void } | undefined;

  const check = () => {
    const address = laptopAddress();
    if (current && (current.ended || current.address !== address)) {
      if (!current.ended) current.stop();
      current = undefined;
    }
    if (current || address === undefined) return;
    // A registration that ends is made again on the next tick, not at once, so a dns-sd that fails at
    // start does not spin.
    const registration = { address, ended: false, stop: () => {} };
    registration.stop = register({ host: LOCAL_HOST, address, port }, () => (registration.ended = true)).stop;
    current = registration;
  };

  check();
  const stopTicking = clock.every(ADVERTISE_EVERY_MS, check);

  return {
    close() {
      stopTicking();
      if (current && !current.ended) current.stop();
      current = undefined;
    },
  };
}

// dns-sd's proxy form: it registers a service on behalf of a host and makes the host name resolve to the
// address, as `man dns-sd` shows for apple.local.
export function dnsSdArguments({ host, address, port }: Advert): string[] {
  return ['-P', 'Setlist', '_http._tcp', 'local', String(port), host, address];
}

// Runs dns-sd under a shell that kills it when the server's end of the stdin pipe closes. The pipe
// closes when the server stops it, and when the server exits for any reason, a crash included, so a
// crashed server never leaves a registration behind for its restart to collide with. The shell exits
// with dns-sd, so a registration that ends on its own is reported.
const TETHER = [
  'exec 3<&0',
  '"$@" & child=$!',
  '{ read -r _; kill "$child"; } <&3 2>/dev/null & reader=$!',
  // Quiet, so the shell's "Terminated" notice for a stopped dns-sd stays out of the server's log.
  'wait "$child" 2>/dev/null; status=$?',
  'kill "$reader" 2>/dev/null',
  'exit "$status"',
].join('\n');

// The register function the server uses on the playback Mac: macOS's own dns-sd, which talks to
// mDNSResponder. No test runs it.
export const dnsSdRegister: Register = (advert, ended) => {
  let stopped = false;
  const child = spawn('/bin/sh', ['-c', TETHER, 'sh', 'dns-sd', ...dnsSdArguments(advert)], {
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  const end = (why: string) => {
    if (stopped) return;
    stopped = true;
    console.error(`Bonjour: stopped advertising ${advert.host} (${why}); trying again shortly`);
    ended();
  };
  child.once('error', (error) => end(error.message));
  child.once('exit', (code, signal) => end(signal ? `dns-sd ended on ${signal}` : `dns-sd exited with ${code}`));
  console.log(`Bonjour: advertising ${advert.host} at ${advert.address}, port ${advert.port}`);
  return {
    stop() {
      stopped = true;
      child.stdin?.end();
    },
  };
};
