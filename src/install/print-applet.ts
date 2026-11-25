// Prints the Setlist Controller applet's AppleScript source for this checkout. The install script compiles it with
// `osacompile -s`.
import { resolve } from 'node:path';
import { appletSource } from './applet.ts';

const repoRoot = resolve(import.meta.dirname, '../..');

console.log(appletSource({ repoRoot, nodePath: process.env.SETLIST_NODE ?? process.execPath }));
