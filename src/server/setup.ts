import { networkInterfaces } from 'node:os';
import { encode } from 'uqr';
import { leaderPagePath, producerPagePath, VIEW_PAGE } from '../shared/routes.ts';
import type { JoinLink, SetupInfo } from '../shared/setup.ts';

// The name the laptop answers to on the stage network, over Bonjour.
export const LOCAL_HOST = 'setlist.local';
// The quiet zone a scanner needs around a QR code, in modules.
const QUIET_ZONE = 4;

// The join links for the leader page, the producer page and the view-only page on this server. The
// leader's carries the install's leader secret and the producer's the producer secret. The address is
// read on every call, since DHCP may hand the laptop a new one.
export function setupInfo(port: number, secrets: { leader: string; producer: string }): SetupInfo {
  const address = laptopAddress();
  return {
    leader: joinLink(address, port, leaderPagePath(secrets.leader)),
    producer: joinLink(address, port, producerPagePath(secrets.producer)),
    view: joinLink(address, port, VIEW_PAGE),
  };
}

// The QR code holds the IP form, which a phone opens without Bonjour. With no IPv4 address, it holds
// the setlist.local form.
function joinLink(address: string | undefined, port: number, path: string): JoinLink {
  const local = url(LOCAL_HOST, port, path);
  const direct = address === undefined ? undefined : url(address, port, path);
  const inCode = direct ?? local;
  return {
    url: inCode,
    urls: direct ? [direct, local] : [local],
    qr: encode(inCode, { border: QUIET_ZONE }).data,
  };
}

function url(host: string, port: number, path: string): string {
  return `http://${host}${port === 80 ? '' : `:${port}`}${path}`;
}

// The laptop's IPv4 address on the stage network. A self-assigned address (169.254.x.x, an interface
// with no DHCP answer) is never it. A private address on a built-in interface (en0, en1) comes first,
// ahead of a VPN (utun, 100.x) or a virtual machine's bridge (bridge100) that macOS may list earlier.
export function laptopAddress(): string | undefined {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses = []]) =>
    addresses
      .filter((entry) => entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.'))
      .map((entry) => ({ address: entry.address, rank: (isPrivate(entry.address) ? 0 : 2) + (/^en\d/.test(name) ? 0 : 1) })),
  );
  // A stable sort, so equal ranks keep the order the system lists them in.
  return candidates.sort((a, b) => a.rank - b.rank)[0]?.address;
}

// The private ranges a stage network router hands out (RFC 1918).
function isPrivate(address: string): boolean {
  const [first = 0, second = 0] = address.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
