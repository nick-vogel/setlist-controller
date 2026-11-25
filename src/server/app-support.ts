import { homedir } from 'node:os';
import { join } from 'node:path';

// Beside the server's logs in ~/Library, where a macOS app keeps its settings: the pedal config, the connections config,
// the leader secret, the producer secret and the set manifest. The server reads from it and the set builder writes the
// set manifest into it, so the two commands share one path.
export const APP_SUPPORT = join(homedir(), 'Library', 'Application Support', 'setlist-controller');
