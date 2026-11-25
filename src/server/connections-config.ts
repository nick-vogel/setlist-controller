import { readFile } from 'node:fs/promises';
import type { Target } from './target.ts';

// The connections config file: each connection target's address and settings, read once at start, as
// the pedal config is. It is JSON, with one section per target under "targets", keyed by the
// target's kind:
//
//   { "targets": { "propresenter": { ... } } }
//
// Each kind defines its own section's fields, and its factory in the registry checks them and builds
// the adapter. A section for a kind the registry does not hold, or one its factory rejects, disables
// that target alone: it shows as not configured, with the problem, and every other target starts.
// This is deliberately softer than the pedal config, where any problem rejects the whole file. Only
// a problem with the file itself, such as a file that is not JSON, starts no target.

// One kind of target, such as ProPresenter. Its factory checks the section and builds the adapter,
// whose name is the kind, or says what is wrong with the section, as sentences for the setup screen.
export type TargetKind = {
  // What the panels show for a target of this kind, such as "ProPresenter".
  label: string;
  create(section: Record<string, unknown>): { target: Target } | { problems: string[] };
};

// The registry: each kind the server can build, by its key in the file.
export type TargetKinds = Record<string, TargetKind>;

// A target the file names: built and ready to start, or disabled with the reasons why.
export type ConfiguredTarget = { kind: 'ready'; target: Target } | { kind: 'disabled'; name: string; label: string; problems: string[] };

export type ConnectionsConfig = {
  // The file the server read at start, or null when it was given none.
  configPath: string | null;
  // Missing: no file, so no targets. Invalid: the file itself was rejected, so no targets.
  config: 'loaded' | 'missing' | 'invalid';
  // The file's own problems. Each one means no target starts. A section's problems sit on its
  // disabled target.
  problems: string[];
  // In the file's order.
  targets: ConfiguredTarget[];
};

const EXAMPLE = '{ "targets": { "propresenter": { ... } } }';

// Never throws: a missing or broken file is a status for the panels, not a reason to stop.
export async function loadConnectionsConfig(path: string | null, kinds: TargetKinds): Promise<ConnectionsConfig> {
  const none = (config: 'missing' | 'invalid', problems: string[] = []): ConnectionsConfig => ({ configPath: path, config, problems, targets: [] });
  if (path === null) return none('missing');

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return none('missing');
    return none('invalid', [`Could not read the connections config file at ${path}: ${(error as Error).message}`]);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return none('invalid', [`The connections config file at ${path} is not valid JSON: ${(error as Error).message}`]);
  }

  const sections = isObject(value) ? value.targets : undefined;
  if (!isObject(sections)) return none('invalid', [`The connections config file needs a "targets" object, such as ${EXAMPLE}.`]);

  const targets = Object.entries(sections).map(([name, section]) => configure(name, section, kinds));
  return { configPath: path, config: 'loaded', problems: [], targets };
}

function configure(name: string, section: unknown, kinds: TargetKinds): ConfiguredTarget {
  const kind = Object.hasOwn(kinds, name) ? kinds[name] : undefined;
  if (!kind) {
    const known = Object.keys(kinds);
    const listed = known.length === 0 ? 'This server knows no target kinds yet.' : `The kinds it knows are ${known.map((key) => `"${key}"`).join(', ')}.`;
    return { kind: 'disabled', name, label: name, problems: [`"${name}" is not a kind of connection target this server knows. ${listed}`] };
  }
  const disabled = (problems: string[]): ConfiguredTarget => ({ kind: 'disabled', name, label: kind.label, problems });
  if (!isObject(section)) return disabled([`The "${name}" section needs to be an object, such as { ... }.`]);
  try {
    const made = kind.create(section);
    return 'target' in made ? { kind: 'ready', target: made.target } : disabled(made.problems);
  } catch (error) {
    return disabled([`The "${name}" section could not be read: ${error instanceof Error ? error.message : String(error)}`]);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
