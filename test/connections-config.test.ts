import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CuePoint } from '../src/fake-live/fake-live.ts';
import { loadConnectionsConfig } from '../src/server/connections-config.ts';
import type { Connection, ProducerSnapshot } from '../src/shared/snapshot.ts';
import { fakeKind, fakeTarget, type FakeTarget } from './fake-target.ts';
import { loaded, startRig, type Client, type Rig, type RigOptions } from './harness.ts';

let rig: Rig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const fixture = (name: string) => resolve(import.meta.dirname, 'fixtures/connections', name);
// Never created, so the server finds no file there.
const MISSING = fixture('missing.json');
// The fake kind's one section, good.
const GOOD = fixture('good.json');
// The fake kind's section good, and the other kind's with a port that is not a number.
const BAD_SECTION = fixture('bad-section.json');
// The fake kind's section good, and a section for "lights", a kind no test registers.
const UNKNOWN_KIND = fixture('unknown-kind.json');
// A trailing comma and no closing brace, so not JSON.
const NOT_JSON = fixture('not-json.json');
// The fake kind's section at the top level, with no "targets" object around it.
const NO_TARGETS_OBJECT = fixture('no-targets-object.json');
const PORT_PROBLEM = 'The fake target\'s "port" must be a whole number, such as 4031.';

// One song in 4/4 at 120 BPM, so a beat is 500 ms.
const SET: CuePoint[] = [
  { name: '1 - Intro', time: 0 },
  { name: '1 - Verse', time: 16 },
  { name: '1 - Chorus', time: 32 },
  { name: '1 - End', time: 48 },
];
const JUMP = '/live/song/cue_point/jump';
const VERSE = { song: 1, title: null, section: 1, name: 'Verse', cause: 'played-into' };
const CHORUS = { song: 1, title: null, section: 2, name: 'Chorus', cause: 'played-into' };

const rowNamed = (snapshot: ProducerSnapshot, name: string): Connection | undefined => snapshot.connections.find((row) => row.name === name);

// Starts the rig with Live playing from the Intro and the given config, and resolves once the producer
// sees the set at the Intro and every named target online.
async function playingRig(options: RigOptions, online: string[]) {
  rig = await startRig(SET, { playing: true, position: 0 }, options);
  const producer = await rig.connectProducer();
  const ready = (snapshot: ProducerSnapshot) =>
    loaded(snapshot) && snapshot.position === 0 && online.every((name) => rowNamed(snapshot, name)?.connection === 'online');
  const first = await producer.snapshot(ready);
  return { producer, first };
}

// Arms the target, then plays Intro to Verse to Chorus, each move seen by the producer.
async function armAndPlay(producer: Client<ProducerSnapshot>, name: string) {
  producer.send({ kind: 'arm', target: name });
  await producer.snapshot((snapshot) => rowNamed(snapshot, name)?.arm === 'armed');
  for (const beats of [8, 16, 24, 32]) {
    rig?.live.setPosition(beats);
    await producer.snapshot((snapshot) => snapshot.position === beats);
  }
}

// The fake kind, registered as "fake", building the given target.
const kinds = (target: FakeTarget) => ({ fake: fakeKind(target) });
const fake = () => fakeTarget({ name: 'fake', label: 'Fake' });

describe('with no connections config file', () => {
  it('starts no target, says so with no problem, and playback works as today', async () => {
    rig = await startRig(SET, { playing: false, position: 0 }, { connectionsConfig: MISSING });
    const producer = await rig.connectProducer();
    const leader = await rig.connectLeader();

    const snapshot: ProducerSnapshot = await producer.snapshot(loaded);
    expect(snapshot.connections).toEqual([]);
    expect(snapshot.connectionProblems).toEqual([]);
    expect(await rig.connectionsStatus()).toEqual({ configPath: MISSING, config: 'missing', problems: [], connections: [] });

    await leader.snapshot(loaded);
    leader.send({ kind: 'jump', song: 1, section: 1 });
    await expect.poll(() => rig?.received(JUMP).length).toBe(1);
  });

  it('says missing with no path when the server was given none', async () => {
    rig = await startRig(SET);

    expect(await rig.connectionsStatus()).toEqual({ configPath: null, config: 'missing', problems: [], connections: [] });
  });
});

describe('a good connections config file', () => {
  it('starts the target its section names, which follows playback once armed', async () => {
    const target = fake();
    const { producer, first } = await playingRig({ connectionsConfig: GOOD, targetKinds: kinds(target) }, ['fake']);

    expect(first.connections).toMatchObject([{ name: 'fake', label: 'Fake', configured: true, problems: [], connection: 'online', arm: 'disarmed' }]);
    expect(first.connectionProblems).toEqual([]);
    await armAndPlay(producer, 'fake');

    expect(target.cues).toEqual([VERSE, CHORUS]);
    expect(await rig!.connectionsStatus()).toMatchObject({ configPath: GOOD, config: 'loaded', problems: [], connections: [{ name: 'fake', configured: true }] });
  });
});

describe('a bad section in the connections config file', () => {
  it('disables only its target, shows its problem on the producer panel and the setup screen, and the good target still starts', async () => {
    const target = fake();
    const other = fakeTarget({ name: 'other', label: 'Other' });
    const targetKinds = { fake: fakeKind(target), other: fakeKind(other) };
    const { producer, first } = await playingRig({ connectionsConfig: BAD_SECTION, targetKinds }, ['fake']);

    const disabled = { name: 'other', label: 'Other', configured: false, problems: [PORT_PROBLEM], connection: 'offline', arm: 'disarmed' };
    expect(first.connections).toMatchObject([{ name: 'fake', configured: true, problems: [], connection: 'online' }, disabled]);
    expect(first.connectionProblems).toEqual([]);
    expect(await rig!.connectionsStatus()).toMatchObject({ config: 'loaded', problems: [], connections: [{ name: 'fake', configured: true }, disabled] });

    producer.send({ kind: 'arm', target: 'other' });
    await armAndPlay(producer, 'fake');

    expect(target.cues).toEqual([VERSE, CHORUS]);
    expect(producer.received.every((snapshot) => rowNamed(snapshot, 'other')?.arm === 'disarmed')).toBe(true);
    expect(other.cues).toEqual([]);
  });
});

describe('an unknown kind in the connections config file', () => {
  it('shows as a problem, and the known target starts and follows playback', async () => {
    const target = fake();
    const { producer, first } = await playingRig({ connectionsConfig: UNKNOWN_KIND, targetKinds: kinds(target) }, ['fake']);

    const lights = first.connections.find((row) => row.name === 'lights');
    expect(lights).toMatchObject({ label: 'lights', configured: false, connection: 'offline', arm: 'disarmed' });
    expect(lights?.problems).toHaveLength(1);
    expect(lights?.problems[0]).toContain('"lights" is not a kind of connection target');
    expect(first.connectionProblems).toEqual([]);
    expect((await rig!.connectionsStatus()).connections.find((row) => row.name === 'lights')).toEqual(lights);

    await armAndPlay(producer, 'fake');

    expect(target.cues).toEqual([VERSE, CHORUS]);
  });
});

describe('a connections config file that is not JSON', () => {
  for (const [what, path, wording] of [
    ['is not JSON', NOT_JSON, 'is not valid JSON'],
    ['has no "targets" object', NO_TARGETS_OBJECT, 'needs a "targets" object'],
  ] as const) {
    it(`shows one problem and starts no target when it ${what}`, async () => {
      const target = fake();
      rig = await startRig(SET, { playing: true, position: 0 }, { connectionsConfig: path, targetKinds: kinds(target) });
      const producer = await rig.connectProducer();

      const first = await producer.snapshot((snapshot) => loaded(snapshot) && snapshot.position === 0);
      expect(first.connections).toEqual([]);
      expect(first.connectionProblems).toHaveLength(1);
      expect(first.connectionProblems[0]).toContain(wording);
      expect(await rig.connectionsStatus()).toEqual({ configPath: path, config: 'invalid', problems: first.connectionProblems, connections: [] });

      // An Arm naming it changes nothing, and playing through the song cues nothing.
      producer.send({ kind: 'arm', target: 'fake' });
      for (const beats of [16, 32]) {
        rig.live.setPosition(beats);
        await producer.snapshot((snapshot) => snapshot.position === beats);
      }
      expect(producer.received.every((snapshot) => snapshot.connections.length === 0)).toBe(true);
      expect(target.cues).toEqual([]);
      expect(target.checks).toEqual([]);
    });
  }
});

describe('loading the connections config file', () => {
  it('disables a target whose factory throws, with the error as its problem, and builds the others', async () => {
    const target = fake();
    const throwing = { label: 'Other', create: () => { throw new Error('the socket would not open'); } };

    const config = await loadConnectionsConfig(BAD_SECTION, { fake: fakeKind(target), other: throwing });

    expect(config).toMatchObject({ config: 'loaded', problems: [] });
    expect(config.targets).toEqual([
      { kind: 'ready', target },
      { kind: 'disabled', name: 'other', label: 'Other', problems: ['The "other" section could not be read: the socket would not open'] },
    ]);
  });

  it('disables a target whose section is not an object, without asking its factory', async () => {
    const target = fake();
    let asked = 0;
    const counting = { label: 'Fake', create: () => ((asked += 1), { target }) };

    const config = await loadConnectionsConfig(fixture('section-not-object.json'), { fake: counting });

    expect(asked).toBe(0);
    expect(config.targets).toEqual([{ kind: 'disabled', name: 'fake', label: 'Fake', problems: ['The "fake" section needs to be an object, such as { ... }.'] }]);
  });

  it('rejects a file it cannot read with one problem and no targets', async () => {
    const config = await loadConnectionsConfig(fixture(''), { fake: fakeKind(fake()) });

    expect(config.config).toBe('invalid');
    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]).toContain('Could not read the connections config file');
    expect(config.targets).toEqual([]);
  });
});
