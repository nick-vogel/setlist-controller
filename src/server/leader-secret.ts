import { randomBytes } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The leader page and its socket carry this secret in their paths (see routes.ts), so only a device
// given the leader URL can control Live. It is made once per install and kept on the playback laptop,
// so it survives restarts and updates. Deleting the file and restarting the server makes a new one,
// and every old leader bookmark stops working.
//
// The producer page and its socket carry a second secret, made, kept and replaced exactly the same
// way in its own file. The two are independent: neither URL opens the other's page or socket.

export const LEADER_SECRET_FILE = 'leader-secret';
export const PRODUCER_SECRET_FILE = 'producer-secret';

// 128 bits, as 32 lowercase hex characters: safe in a URL with no encoding, and short enough for a
// QR code.
const SECRET = /^[0-9a-f]{32}$/;

// Resolves to the leader secret in the folder, making the folder and the secret on a first start.
export function readLeaderSecret(folder: string): Promise<string> {
  return readSecretFile(folder, LEADER_SECRET_FILE, 'leader');
}

// Resolves to the producer secret in the folder, making the folder and the secret on a first start.
export function readProducerSecret(folder: string): Promise<string> {
  return readSecretFile(folder, PRODUCER_SECRET_FILE, 'producer');
}

// The role names the QR code to scan again in the log line when a bad file is replaced.
async function readSecretFile(folder: string, file: string, role: string): Promise<string> {
  const path = join(folder, file);
  const existing = await readSecret(path);
  if (existing !== null && SECRET.test(existing)) return existing;
  if (existing !== null) {
    // Empty, cut short or edited by hand. A server that comes up with a new QR code beats one that
    // launchd restarts in a loop.
    console.error(`Setlist server: ${path} holds no ${role} secret, so a new one replaces it. Scan the new ${role} QR code.`);
    return placeSecret(path, (written) => rename(written, path));
  }
  await mkdir(folder, { recursive: true });
  try {
    // A link fails on a file that exists, so two starts that race never overwrite each other's
    // secret, and the file is whole the moment it appears.
    return await placeSecret(path, (written) => link(written, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return readSecretFile(folder, file, role);
  }
}

// Writes a new secret beside the file, owner-only, and moves it into place with place.
async function placeSecret(path: string, place: (written: string) => Promise<void>): Promise<string> {
  const secret = randomBytes(16).toString('hex');
  const written = `${path}.${process.pid}.${randomBytes(4).toString('hex')}`;
  await writeFile(written, `${secret}\n`, { mode: 0o600, flag: 'wx' });
  try {
    await place(written);
  } finally {
    await rm(written, { force: true });
  }
  return secret;
}

// Null when the file does not exist.
async function readSecret(path: string): Promise<string | null> {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
