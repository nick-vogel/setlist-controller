// The URL decides the role, with no login. The leader's page and its socket carry the install's leader
// secret (see leader-secret.ts), so only a device given the leader URL can control Live. The leader's
// page connects on the leader socket for its secret and may send commands; every other page connects
// on the view-only socket and only receives. The producer's page is the leader's page plus the
// Connections panel, on its own secret and its own socket, and may send every leader command.

// The leader and producer sockets' prefixes. Each socket itself is leaderSocketPath(secret) or
// producerSocketPath(secret).
export const SOCKET_PATHS = { leader: '/ws/leader', producer: '/ws/producer', viewer: '/ws' } as const;

export type Role = keyof typeof SOCKET_PATHS;

// The leader page's prefix. The leader's page, on the iPad, is leaderPagePath(secret). Every other
// page path is the view-only page, for the band's phones and FOH, the prefix alone included.
export const LEADER_PAGE = '/leader';
// The producer page's prefix. The producer's page is producerPagePath(secret); the prefix alone is the
// view-only page, as the leader's is.
export const PRODUCER_PAGE = '/producer';
// The view-only page's own path, the one its QR code opens.
export const VIEW_PAGE = '/';

// The operator's setup screen, on the playback laptop only. It watches as a viewer does.
export const SETUP_PAGE = '/setup';
// The setup screen's join links and QR codes. The server answers only the laptop itself.
export const SETUP_API = '/api/setup';
export const SETUP_REFRESH_API = '/api/setup/refresh';
// The foot pedal's status: the config, its problems, the mappings and the MIDI monitor. The setup
// screen polls it, and the server answers only the laptop itself, so no band page ever sees it.
export const SETUP_PEDAL_API = '/api/setup/pedal';
// Each connection target's row, its pre-service check included. The setup screen polls it, and the
// server answers only the laptop itself, as it does the foot pedal's status.
export const SETUP_CONNECTIONS_API = '/api/setup/connections';
// Every device in the hub's registry, as the producer's snapshot carries it. The setup screen polls it,
// and the server answers only the laptop itself, since a device's name is no band page's business.
export const SETUP_DEVICES_API = '/api/setup/devices';
// The set's charts, from the set manifest (set-manifest.ts), read-only for every device. The page
// fetches them again when the snapshot's chart revision changes.
export const CHARTS_API = '/api/charts';
// What the setup screen and its data say to any machine but the laptop.
export const SETUP_REFUSED = 'Open the setup screen on the playback laptop.';

export function leaderPagePath(secret: string): string {
  return `${LEADER_PAGE}/${secret}`;
}

export function leaderSocketPath(secret: string): string {
  return `${SOCKET_PATHS.leader}/${secret}`;
}

export function producerPagePath(secret: string): string {
  return `${PRODUCER_PAGE}/${secret}`;
}

export function producerSocketPath(secret: string): string {
  return `${SOCKET_PATHS.producer}/${secret}`;
}

// Whether a page in this role may control Live: the leader and the producer, never a viewer.
export function controls(role: Role): boolean {
  return role === 'leader' || role === 'producer';
}

export type PageRole = { role: Role; socketPath: string };

// The page reads its role and the secret from its own path, so an iPad bookmark works on its own. A
// trailing slash, as typed or bookmarked, still opens the leader or producer page. A wrong secret
// still draws that page, whose socket the hub refuses.
export function pageRole(pathname: string): PageRole {
  const path = withoutTrailingSlash(pathname);
  const leader = secretAfter(path, LEADER_PAGE);
  if (leader !== null) return { role: 'leader', socketPath: leaderSocketPath(leader) };
  const producer = secretAfter(path, PRODUCER_PAGE);
  if (producer !== null) return { role: 'producer', socketPath: producerSocketPath(producer) };
  return { role: 'viewer', socketPath: SOCKET_PATHS.viewer };
}

// The one path segment after the prefix, or null when the path holds none or more than one.
function secretAfter(path: string, prefix: string): string | null {
  const secret = path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : '';
  return secret === '' || secret.includes('/') ? null : secret;
}

export function isSetupPage(pathname: string): boolean {
  return withoutTrailingSlash(pathname) === SETUP_PAGE;
}

function withoutTrailingSlash(pathname: string): string {
  return pathname.replace(/\/+$/, '');
}
