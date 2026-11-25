import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encode } from '../src/shared/osc.ts';
import { REPO_ROOT } from './set-builder-harness.ts';

// The hand-run Eos recording scripts in scripts/eos/, run by the python3 an operator runs them with. -I keeps the
// user's site-packages and environment out, and -B keeps __pycache__ out of scripts/eos.
const SCRIPTS = join(REPO_ROOT, 'scripts/eos');
const RECORDER = join(SCRIPTS, 'record-eos-fixtures.py');
const FIRE_BY_HAND = join(REPO_ROOT, 'test/fixtures/eos/fire-by-hand.json');

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// An output folder under the git-ignored dist/ holding a copy of the committed fire-by-hand.json, as the folder a
// re-recording writes into holds the last recording. No test writes to test/fixtures/eos/.
async function seededOutput(): Promise<string> {
  await mkdir(join(REPO_ROOT, 'dist'), { recursive: true });
  const out = await mkdtemp(join(REPO_ROOT, 'dist/eos-recording-'));
  scratch.push(out);
  await cp(FIRE_BY_HAND, join(out, 'fire-by-hand.json'));
  return out;
}

function python(driver: string): { code: number | null; stdout: string; stderr: string } {
  const prelude = `import sys, json\nsys.path.insert(0, ${JSON.stringify(SCRIPTS)})\n`;
  const { status, stdout, stderr } = spawnSync('python3', ['-I', '-B', '-c', prelude + driver], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { code: status, stdout, stderr };
}

function pythonJson(driver: string): unknown {
  const result = python(driver);
  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  return JSON.parse(result.stdout);
}

describe('eososc, the OSC client the recording scripts send with', () => {
  // OSC 1.0: an OSC-string is the characters, then "a null, followed by 0-3 additional null characters" to make the
  // total a multiple of 4. https://opensoundcontrol.stanford.edu/spec-1_0.html
  it('pads a string to the next multiple of 4 after its terminator, and no further', () => {
    const lengths = pythonJson(
      `import eososc\nprint(json.dumps([len(eososc.ostr(s)) for s in ["", "abc", "abcd", "abcdefg"]]))`,
    );

    expect(lengths).toEqual([4, 4, 8, 8]);
  });

  // The address plus its terminator is 20 bytes, already a multiple of 4, and the type tag string "," pads to 4.
  it('sends /eos/cue/1/3.5/fire as 24 bytes, as the lights adapter does', () => {
    const packet = pythonJson(
      `import eososc\nm = eososc.msg("/eos/cue/1/3.5/fire")\nprint(json.dumps({"length": len(m), "hex": m.hex()}))`,
    );

    expect(packet).toEqual({ length: 24, hex: encode('/eos/cue/1/3.5/fire').toString('hex') });
  });

  it('encodes a string and an int argument as the lights adapter does', () => {
    const hex = pythonJson(
      `import eososc\nprint(json.dumps(eososc.msg("/eos/newcmd", "Go_To_Cue 1 / 8 Time 0#", 7).hex()))`,
    );

    expect(hex).toBe(encode('/eos/newcmd', ['Go_To_Cue 1 / 8 Time 0#', { int: 7 }]).toString('hex'));
  });
});

// Runs the fire-by-hand scenario of record-eos-fixtures.py into `out`, with no Eos. The socket hands over each entry of
// `chunks` in turn on a recv, an entry of null as a timeout, and times out once they run out. Each entry is a list of
// OSC messages as [address, ...args], sent in one TCP read with their length prefixes. The clock steps a second each
// time it is read, so the 900 s wait runs out at once.
function fireByHand(out: string, chunks: (unknown[][] | null)[]): { code: number | null; stdout: string; stderr: string } {
  return python(`
import importlib.util, socket, struct
from eososc import msg
spec = importlib.util.spec_from_file_location("record_eos_fixtures", ${JSON.stringify(RECORDER)})
recorder = importlib.util.module_from_spec(spec); spec.loader.exec_module(recorder)

class FakeSocket:
    def __init__(self, chunks): self.chunks = list(chunks)
    def recv(self, n):
        chunk = self.chunks.pop(0) if self.chunks else None
        if chunk is None: raise socket.timeout()
        return b"".join(struct.pack(">i", len(m)) + m for m in (msg(*x) for x in chunk))
    def sendall(self, data): raise AssertionError("the fire-by-hand scenario sends nothing")

class SteppingClock:
    def __init__(self): self.now = 0.0
    def __call__(self): self.now += 1.0; return self.now

rec = recorder.Recorder(FakeSocket(json.loads(${JSON.stringify(JSON.stringify(chunks))})), clock=SteppingClock())
recorder.fire_by_hand(rec, ${JSON.stringify(out)})
`);
}

describe('the fire-by-hand scenario of record-eos-fixtures.py', () => {
  it('leaves fire-by-hand.json as it was, and says so, when no fire comes in the wait', async () => {
    const out = await seededOutput();
    const before = await readFile(join(out, 'fire-by-hand.json'));

    const result = fireByHand(out, []);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('NO FIRE SEEN: fire-by-hand.json left as it was');
    expect(await readFile(join(out, 'fire-by-hand.json'))).toEqual(before);
  });

  it('writes the fire with the 3 s before it and what follows, when a cue is fired by hand', async () => {
    const out = await seededOutput();
    const timeouts = Array.from({ length: 10 }, () => null);

    const result = fireByHand(out, [
      [['/eos/out/user/1/cmd', 'LIVE: Cue  5 : ', 0]],
      ...timeouts,
      [
        ['/eos/out/user/1/cmd', 'LIVE: Cue  6 : Go To Cue ', 0],
        ['/eos/out/event/cue/1/6/fire', 'Great Are You Lord / Verse 1'],
      ],
      [['/eos/out/active/cue/1/6', 0.5]],
    ]);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('GOT FIRE');
    const written = JSON.parse(await readFile(join(out, 'fire-by-hand.json'), 'utf8'));
    expect(Object.keys(written)).toEqual(['scenario', 'description', 'eos_version', 'transport', 'packets']);
    expect(written.scenario).toBe('fire-by-hand');
    expect(written.packets.map((p: { dir: string; address: string; args: unknown[] }) => [p.dir, p.address, p.args])).toEqual([
      ['eos->app', '/eos/out/user/1/cmd', ['LIVE: Cue  6 : Go To Cue ', 0]],
      ['eos->app', '/eos/out/event/cue/1/6/fire', ['Great Are You Lord / Verse 1']],
      ['eos->app', '/eos/out/active/cue/1/6', [0.5]],
    ]);
  });
});

const FIXTURES = join(REPO_ROOT, 'test/fixtures/eos');
const RECORDED = [
  'back-during-fade',
  'back',
  'connect',
  'fire-by-hand',
  'fire-decimal',
  'fire-follow-chain',
  'fire-missing',
  'fire',
  'go',
  'read-cue-list',
  'read-follow-list',
  'read-missing',
];
const EDGE_CASES = ['ping', 'connect-no-active-cue', 'go-last-cue', 'back-first-cue', 'back-during-fade-then-go'];

// An output folder under dist/ holding a copy of every fixture the default run records, as test/fixtures/eos/ does
// when the edge cases are recorded into it.
async function seededWithRecorded(): Promise<string> {
  const out = await seededOutput();
  await Promise.all(RECORDED.map((name) => cp(join(FIXTURES, `${name}.json`), join(out, `${name}.json`))));
  return out;
}

type Wire = ['opened', number] | [number, 'closed'] | [number, string, unknown[]];

// Runs record-eos-fixtures.py's main with `argv`, with no Eos. Each TCP connection the script opens gets the next
// entry of `bursts`: the chunks it hands over on a recv, as fireByHand's socket does. A connection answers each
// /eos/ping with /eos/out/ping and the same arguments, after the chunks before it. `wire` is every connection opened,
// every packet sent with the connection it went on, and every close, in order. A command line in `rejects` gets an
// /eos/out/cmd echo with an error, as Eos echoes a command it rejects, and a command line in `echoes` gets the
// messages given for it. Any other address in `replies` gets the next entry of its list, and the last entry again once
// the list runs out; an empty entry is no reply. The clock steps a quarter second each time it is read, so a 1 s wait still reads the socket, and
// the 900 s wait for a fire by hand runs out at once.
function record(
  argv: string[],
  bursts: (unknown[][] | null)[][],
  rejects: string[] = [],
  echoes: Record<string, unknown[][]> = {},
  replies: Record<string, unknown[][][]> = {},
): { wire: Wire[]; stdout: string; exit: unknown } {
  return pythonJson(`
import contextlib, importlib.util, io, socket, struct
from eososc import msg, parse
spec = importlib.util.spec_from_file_location("record_eos_fixtures", ${JSON.stringify(RECORDER)})
recorder = importlib.util.module_from_spec(spec); spec.loader.exec_module(recorder)
wire = []; bursts = json.loads(${JSON.stringify(JSON.stringify(bursts))}); rejects = json.loads(${JSON.stringify(JSON.stringify(rejects))})
echoes = json.loads(${JSON.stringify(JSON.stringify(echoes))})
replies = json.loads(${JSON.stringify(JSON.stringify(replies))})

class FakeSocket:
    def __init__(self, index, chunks): self.index = index; self.chunks = list(chunks); self.closed = False
    def recv(self, n):
        assert not self.closed, "recv on a closed connection"
        chunk = self.chunks.pop(0) if self.chunks else None
        if chunk is None: raise socket.timeout()
        return b"".join(struct.pack(">i", len(m)) + m for m in (msg(*x) for x in chunk))
    def sendall(self, data):
        assert not self.closed, "send on a closed connection"
        assert struct.unpack(">i", data[:4])[0] == len(data) - 4, "a packet without its length prefix"
        address, args = parse(data[4:]); wire.append([self.index, address, args])
        if address == "/eos/ping": self.chunks.append([["/eos/out/ping", *args]])
        if address == "/eos/newcmd" and args[0] in rejects: self.chunks.append([["/eos/out/cmd", "LIVE: Error: Syntax", 0]])
        if address == "/eos/newcmd" and args[0] in echoes: self.chunks.append(echoes[args[0]])
        if address in replies:
            reply = replies[address].pop(0) if len(replies[address]) > 1 else replies[address][0]
            if reply: self.chunks.append(reply)
    def close(self): self.closed = True; wire.append([self.index, "closed"])

def connect():
    index = len([x for x in wire if x[0] == "opened"]); wire.append(["opened", index])
    return FakeSocket(index, bursts[index] if index < len(bursts) else [])

class SteppingClock:
    def __init__(self): self.now = 0.0
    def __call__(self): self.now += 0.25; return self.now

stdout = io.StringIO(); exit = None
with contextlib.redirect_stdout(stdout):
    try: recorder.main(json.loads(${JSON.stringify(JSON.stringify(argv))}), connect=connect, clock=SteppingClock())
    except SystemExit as e: exit = str(e.code)
print(json.dumps({"wire": wire, "stdout": stdout.getvalue(), "exit": exit}))
`) as { wire: Wire[]; stdout: string; exit: unknown };
}

async function packets(out: string, name: string): Promise<[string, string, unknown[]][]> {
  const written = JSON.parse(await readFile(join(out, `${name}.json`), 'utf8'));
  expect(Object.keys(written)).toEqual(['scenario', 'description', 'eos_version', 'transport', 'packets']);
  expect(written.scenario).toBe(name);
  return written.packets.map((p: { dir: string; address: string; args: unknown[] }) => [p.dir, p.address, p.args]);
}

describe('record-eos-fixtures.py --edge-cases, the scenarios setlist-controller#259 records', () => {
  const noActiveCue = [
    ['/eos/out/active/cue/text', ''],
    ['/eos/out/pending/cue/1/1'],
  ];

  it('writes exactly the edge case files, and leaves every recorded fixture as it was', async () => {
    const out = await seededWithRecorded();
    const before = await Promise.all(RECORDED.map((name) => readFile(join(out, `${name}.json`))));

    const result = record(['--edge-cases', out], [[], [noActiveCue]]);

    expect(result.exit).toBeNull();
    expect((await readdir(out)).sort()).toEqual([...RECORDED, ...EDGE_CASES].map((name) => `${name}.json`).sort());
    expect(await Promise.all(RECORDED.map((name) => readFile(join(out, `${name}.json`))))).toEqual(before);
  });

  it('pings as the lights do, parks each scenario, and connects again once cue list 1 has no active cue', async () => {
    const out = await seededWithRecorded();

    const { wire } = record(['--edge-cases', out], [[], [noActiveCue]]);

    expect(wire).toEqual([
      ['opened', 0],
      [0, '/eos/ping', []],
      [0, '/eos/ping', []],
      [0, '/eos/newcmd', ['Go_To_Cue 1 / 0 Time 0#']],
      [0, 'closed'],
      ['opened', 1],
      [1, '/eos/newcmd', ['Go_To_Cue 1 / 8 Time 0#']],
      [1, '/eos/cues/1/fire', []],
      [1, '/eos/newcmd', ['Go_To_Cue 1 / 1 Time 0#']],
      [1, '/eos/cues/1/stop', []],
      [1, '/eos/newcmd', ['Go_To_Cue 1 / 6 Time 0#']],
      [1, '/eos/cue/1/7/fire', []],
      [1, '/eos/cues/1/stop', []],
      [1, '/eos/cues/1/fire', []],
      [1, 'closed'],
    ]);
  });

  it('sends /eos/ping as the 16 bytes the lights send', () => {
    const hex = pythonJson(`import eososc\nprint(json.dumps(eososc.msg("/eos/ping").hex()))`);

    expect(hex).toBe(encode('/eos/ping', []).toString('hex'));
  });

  it('records each scenario without its parking, and the connect with no active cue before anything is sent', async () => {
    const out = await seededWithRecorded();

    record(['--edge-cases', out], [[], [noActiveCue]]);

    expect(await packets(out, 'ping')).toEqual([
      ['app->eos', '/eos/ping', []],
      ['eos->app', '/eos/out/ping', []],
      ['app->eos', '/eos/ping', []],
      ['eos->app', '/eos/out/ping', []],
    ]);
    expect(await packets(out, 'connect-no-active-cue')).toEqual([
      ['eos->app', '/eos/out/active/cue/text', ['']],
      ['eos->app', '/eos/out/pending/cue/1/1', []],
    ]);
    expect(await packets(out, 'go-last-cue')).toEqual([['app->eos', '/eos/cues/1/fire', []]]);
    expect(await packets(out, 'back-first-cue')).toEqual([['app->eos', '/eos/cues/1/stop', []]]);
    expect(await packets(out, 'back-during-fade-then-go')).toEqual([
      ['app->eos', '/eos/cue/1/7/fire', []],
      ['app->eos', '/eos/cues/1/stop', []],
      ['app->eos', '/eos/cues/1/fire', []],
    ]);
  });

  it('stops, and records nothing after it, when Eos rejects the command line that parks a scenario', async () => {
    const out = await seededWithRecorded();

    const result = record(['--edge-cases', out], [[], [noActiveCue]], ['Go_To_Cue 1 / 0 Time 0#']);

    expect(result.exit).toBe("Eos rejected 'Go_To_Cue 1 / 0 Time 0#': LIVE: Error: Syntax");
    expect(result.wire.filter((x) => x[0] === 'opened')).toEqual([['opened', 0]]);
    expect((await readdir(out)).sort()).toEqual([...RECORDED, 'ping'].map((name) => `${name}.json`).sort());
  });
});

// setlist-controller#286. Eos names the OSC user's command line in its connect burst, and Patch and Live share it.
const LIVE = [['/eos/out/cmd', 'LIVE: Cue  8 : ', 0]];
const PATCH = [['/eos/out/cmd', 'PATCH: ', 0]];
const BEFORE_WRAP = [
  'cuelist-properties-wrap-off',
  'cue-edit-at-console',
  'cue-edit-at-console-subscribed',
  'link-to-another-list',
  'fire-racing-follow',
];
const WRAP = ['cuelist-properties-wrap-on', 'go-last-cue-wrap', 'back-first-cue-wrap'];
// setlist-controller#287: recorded by a one-off attended driver, so no mode of the script writes it.
const AT_KEYPAD = ['cue-edit-at-keypad-subscribed'];
// setlist-controller#498, in the order --lights records them.
const LIGHTS = [
  'show-path',
  'channel-params',
  'command-rejected',
  'colours-before-record',
  'colour-set',
  'record-only-confirm-on',
  'colours-after-record',
  'colour-recorded-back',
  'cue-label-set',
  'cue-copy-to',
  'show-save',
  'show-path-after-save',
];
const CONFIRM_OFF = ['record-only-confirm-off'];
const AGAIN = ['record-only-same-colour', 'record-only-subscribed', 'cue-copy-to-decimal'];
// setlist-controller#508, in the order --lights-chain records them.
const CHAIN = [
  'chain-cue-list-before',
  'chain-follow-set',
  'chain-go-to-cue-follow',
  'chain-record-only-follow',
  'chain-fire-follow',
  'chain-copy-to-follow',
  'chain-fire-follow-with-copy',
  'chain-follow-cleared',
  'chain-go-to-cue-hang',
  'chain-hang-cleared',
  'chain-cue-list-after',
];
const COMMITTED = [
  ...[...RECORDED, ...EDGE_CASES, ...BEFORE_WRAP, ...WRAP, ...AT_KEYPAD],
  ...[...LIGHTS, ...CONFIRM_OFF, ...AGAIN, ...CHAIN],
];
const LIGHTS_OTHERS = COMMITTED.filter((name) => !LIGHTS.includes(name));
const CONFIRM_OFF_OTHERS = COMMITTED.filter((name) => !CONFIRM_OFF.includes(name));
const BEFORE_WRAP_OTHERS = COMMITTED.filter((name) => !BEFORE_WRAP.includes(name));
const WRAP_OTHERS = COMMITTED.filter((name) => !WRAP.includes(name));

// An output folder under dist/ holding a copy of every committed Eos fixture but `own`, the files the run under test
// writes, so a test sees both what the run writes and that it leaves every other committed fixture as it was.
async function seededWithCommittedBut(own: string[]): Promise<string> {
  const out = await seededOutput();
  const others = COMMITTED.filter((name) => !own.includes(name));
  await Promise.all(others.map((name) => cp(join(FIXTURES, `${name}.json`), join(out, `${name}.json`))));
  return out;
}

const newcmd = (text: string): Wire => [0, '/eos/newcmd', [text]];
const files = (names: string[]): string[] => names.map((name) => `${name}.json`).sort();

describe('record-eos-fixtures.py --before-wrap, the setlist-controller#286 scenarios with Wrap off', () => {
  it('writes exactly its five files, and leaves every committed fixture as it was', async () => {
    const out = await seededWithCommittedBut(BEFORE_WRAP);
    const before = await Promise.all(BEFORE_WRAP_OTHERS.map((name) => readFile(join(out, `${name}.json`))));

    const result = record(['--before-wrap', out], [[LIVE]]);

    expect(result.exit).toBeNull();
    expect((await readdir(out)).sort()).toEqual(files([...BEFORE_WRAP_OTHERS, ...BEFORE_WRAP]));
    expect(await Promise.all(BEFORE_WRAP_OTHERS.map((name) => readFile(join(out, `${name}.json`))))).toEqual(before);
  });

  it('reads cue list 1, edits a cue, links to list 99, races a follow and cleans up, in order', async () => {
    const out = await seededWithCommittedBut(BEFORE_WRAP);

    const { wire } = record(['--before-wrap', out], [[LIVE]]);

    expect(wire).toEqual([
      ['opened', 0],
      [0, '/eos/get/cuelist/1', []],
      newcmd('Go_To_Cue 1 / 8 Time 0#'),
      newcmd('Record Cue 1 / 9#'),
      newcmd('Cue 1 / 9 Move_To Cue 1 / 10#'),
      newcmd('Delete Cue 1 / 10 Enter Enter'),
      [0, '/eos/get/cue/1/count', []],
      newcmd('Go_To_Cue 1 / 8 Time 0#'),
      [0, '/eos/subscribe', [1]],
      newcmd('Record Cue 1 / 11#'),
      newcmd('Cue 1 / 11 Move_To Cue 1 / 12#'),
      newcmd('Delete Cue 1 / 12 Enter Enter'),
      [0, '/eos/get/cue/1/count', []],
      [0, '/eos/subscribe', [0]],
      newcmd('Go_To_Cue 1 / 8 Time 0#'),
      newcmd('Record Cue 99 / 1 Time 1#'),
      newcmd('Cue 1 / 4 Link 99 / 1#'),
      [0, '/eos/get/cue/1/4', []],
      [0, '/eos/get/cuelist/99', []],
      newcmd('Cue 1 / 4 Link#'),
      newcmd('Delete Cue 99 / Enter Enter'),
      newcmd('Go_To_Cue 1 / 8 Time 0#'),
      newcmd('Record Cue 99 / 1 Time 1#'),
      newcmd('Record Cue 99 / 2 Time 1#'),
      newcmd('Record Cue 99 / 3 Time 1#'),
      newcmd('Cue 99 / 1 Follow 1#'),
      [0, '/eos/cue/99/1/fire', []],
      [0, '/eos/cue/99/2/fire', []],
      newcmd('Delete Cue 99 / Enter Enter'),
      [0, 'closed'],
    ]);
  });

  it('records each scenario without its parking, building or cleanup', async () => {
    const out = await seededWithCommittedBut(BEFORE_WRAP);

    record(['--before-wrap', out], [[LIVE]]);

    expect(await packets(out, 'cuelist-properties-wrap-off')).toEqual([['app->eos', '/eos/get/cuelist/1', []]]);
    expect(await packets(out, 'cue-edit-at-console')).toEqual([
      ['app->eos', '/eos/newcmd', ['Record Cue 1 / 9#']],
      ['app->eos', '/eos/newcmd', ['Cue 1 / 9 Move_To Cue 1 / 10#']],
      ['app->eos', '/eos/newcmd', ['Delete Cue 1 / 10 Enter Enter']],
      ['app->eos', '/eos/get/cue/1/count', []],
    ]);
    expect(await packets(out, 'cue-edit-at-console-subscribed')).toEqual([
      ['app->eos', '/eos/subscribe', [1]],
      ['app->eos', '/eos/newcmd', ['Record Cue 1 / 11#']],
      ['app->eos', '/eos/newcmd', ['Cue 1 / 11 Move_To Cue 1 / 12#']],
      ['app->eos', '/eos/newcmd', ['Delete Cue 1 / 12 Enter Enter']],
      ['app->eos', '/eos/get/cue/1/count', []],
      ['app->eos', '/eos/subscribe', [0]],
    ]);
    expect(await packets(out, 'link-to-another-list')).toEqual([
      ['app->eos', '/eos/newcmd', ['Cue 1 / 4 Link 99 / 1#']],
      ['app->eos', '/eos/get/cue/1/4', []],
      ['app->eos', '/eos/get/cuelist/99', []],
    ]);
    expect(await packets(out, 'fire-racing-follow')).toEqual([
      ['app->eos', '/eos/cue/99/1/fire', []],
      ['app->eos', '/eos/cue/99/2/fire', []],
    ]);
  });

  // 99/1's follow of 1 s is due 1 s after its fire. The stepping clock adds a quarter second for each read around
  // the wait, so a 1 s wait reads as 1.5 s here, and a 0.5 s or 2 s wait falls outside.
  it('fires the follow target by number 1 s after the cue with the follow, when the follow is due', async () => {
    const out = await seededWithCommittedBut(BEFORE_WRAP);

    record(['--before-wrap', out], [[LIVE]]);

    const written = JSON.parse(await readFile(join(out, 'fire-racing-follow.json'), 'utf8'));
    const [first, second] = written.packets.map((p: { t_ms: number }) => p.t_ms);
    expect(second - first).toBeGreaterThan(1000);
    expect(second - first).toBeLessThanOrEqual(1500);
  });

  it('stops, and sends and records nothing after it, when Eos rejects a command line', async () => {
    const out = await seededWithCommittedBut(BEFORE_WRAP);

    const result = record(['--before-wrap', out], [[LIVE]], ['Cue 1 / 9 Move_To Cue 1 / 10#']);

    expect(result.exit).toBe("Eos rejected 'Cue 1 / 9 Move_To Cue 1 / 10#': LIVE: Error: Syntax");
    expect(result.wire.slice(-2)).toEqual([newcmd('Cue 1 / 9 Move_To Cue 1 / 10#'), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files([...BEFORE_WRAP_OTHERS, 'cuelist-properties-wrap-off']));
  });

  it('stops, and sends and records nothing after it, when Eos rejects an edit of the subscribed pass', async () => {
    const out = await seededWithCommittedBut(BEFORE_WRAP);

    const result = record(['--before-wrap', out], [[LIVE]], ['Cue 1 / 11 Move_To Cue 1 / 12#']);

    expect(result.exit).toBe("Eos rejected 'Cue 1 / 11 Move_To Cue 1 / 12#': LIVE: Error: Syntax");
    expect(result.wire.slice(-2)).toEqual([newcmd('Cue 1 / 11 Move_To Cue 1 / 12#'), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(
      files([...BEFORE_WRAP_OTHERS, 'cuelist-properties-wrap-off', 'cue-edit-at-console']),
    );
  });

  // The OSC Dictionary's notify entry: "OSC devices can request to be notified of changes with /eos/subscribe=1",
  // and OSC Get: "/eos/subscribe=x", "unit32 for x where 0=unsubscribe and 1=subscribe".
  it('subscribes with the int 1 and unsubscribes with the int 0', () => {
    const hex = pythonJson(
      `import eososc\nprint(json.dumps([eososc.msg("/eos/subscribe", x).hex() for x in (1, 0)]))`,
    );

    expect(hex).toEqual([
      encode('/eos/subscribe', [{ int: 1 }]).toString('hex'),
      encode('/eos/subscribe', [{ int: 0 }]).toString('hex'),
    ]);
  });

  it('stops before it reads or sends anything when the command line does not read LIVE', async () => {
    const out = await seededWithCommittedBut(BEFORE_WRAP);

    const result = record(['--before-wrap', out], [[PATCH]]);

    expect(result.exit).toBe("The command line does not read LIVE: 'PATCH: '");
    expect(result.wire).toEqual([
      ['opened', 0],
      [0, 'closed'],
    ]);
    expect((await readdir(out)).sort()).toEqual(files(BEFORE_WRAP_OTHERS));
  });

  it('stops before the next command when the command line leaves Live during the run', async () => {
    const out = await seededWithCommittedBut(BEFORE_WRAP);

    const result = record(['--before-wrap', out], [[LIVE]], [], { 'Go_To_Cue 1 / 8 Time 0#': PATCH });

    expect(result.exit).toBe("The command line does not read LIVE: 'PATCH: '");
    expect(result.wire.slice(-2)).toEqual([newcmd('Go_To_Cue 1 / 8 Time 0#'), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files([...BEFORE_WRAP_OTHERS, 'cuelist-properties-wrap-off']));
  });
});

describe('record-eos-fixtures.py --wrap, the setlist-controller#286 scenarios with Wrap set by hand', () => {
  it('writes exactly its three files, and leaves every committed fixture as it was', async () => {
    const out = await seededWithCommittedBut(WRAP);
    const before = await Promise.all(WRAP_OTHERS.map((name) => readFile(join(out, `${name}.json`))));

    const result = record(['--wrap', out], [[LIVE]]);

    expect(result.exit).toBeNull();
    expect((await readdir(out)).sort()).toEqual(files([...WRAP_OTHERS, ...WRAP]));
    expect(await Promise.all(WRAP_OTHERS.map((name) => readFile(join(out, `${name}.json`))))).toEqual(before);
  });

  it('reads cue list 1, then parks on the last cue for a Go and on the first for a Back', async () => {
    const out = await seededWithCommittedBut(WRAP);

    const { wire } = record(['--wrap', out], [[LIVE]]);

    expect(wire).toEqual([
      ['opened', 0],
      [0, '/eos/get/cuelist/1', []],
      newcmd('Go_To_Cue 1 / 8 Time 0#'),
      [0, '/eos/cues/1/fire', []],
      newcmd('Go_To_Cue 1 / 1 Time 0#'),
      [0, '/eos/cues/1/stop', []],
      [0, 'closed'],
    ]);
    expect(await packets(out, 'cuelist-properties-wrap-on')).toEqual([['app->eos', '/eos/get/cuelist/1', []]]);
    expect(await packets(out, 'go-last-cue-wrap')).toEqual([['app->eos', '/eos/cues/1/fire', []]]);
    expect(await packets(out, 'back-first-cue-wrap')).toEqual([['app->eos', '/eos/cues/1/stop', []]]);
  });

  it('stops, and records nothing after it, when Eos rejects the command line that parks a scenario', async () => {
    const out = await seededWithCommittedBut(WRAP);

    const result = record(['--wrap', out], [[LIVE]], ['Go_To_Cue 1 / 1 Time 0#']);

    expect(result.exit).toBe("Eos rejected 'Go_To_Cue 1 / 1 Time 0#': LIVE: Error: Syntax");
    expect(result.wire.slice(-2)).toEqual([newcmd('Go_To_Cue 1 / 1 Time 0#'), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(
      files([...WRAP_OTHERS, 'cuelist-properties-wrap-on', 'go-last-cue-wrap']),
    );
  });

  it('stops before it reads or sends anything when the command line does not read LIVE', async () => {
    const out = await seededWithCommittedBut(WRAP);

    const result = record(['--wrap', out], [[PATCH]]);

    expect(result.exit).toBe("The command line does not read LIVE: 'PATCH: '");
    expect(result.wire).toEqual([
      ['opened', 0],
      [0, 'closed'],
    ]);
    expect((await readdir(out)).sort()).toEqual(files(WRAP_OTHERS));
  });
});

// setlist-controller#498: what the lights step of the set build sends, recorded on a test copy of the church show.
// Its cue list 1 holds 0.5, 1, 11, 22, 35, 36, 37 and 38, and channels 1 to 3 and 16 to 18 are the colour lights.
const ETC = '/Users/operator/Documents/ETC';
const TEST_COPY = `${ETC}/Colour test recording 2026-11-12 15-40-53.esf3d`;
// Eos names the show in its saved event, with no timestamp: a path that is no file on disk.
const SAVED = [
  ['/eos/out/show/name', 'Colour test recording'],
  ['/eos/out/event/show/saved', `${ETC}/Colour test recording.esf3d`],
];
const SUNDAY = `${ETC}/Church Sunday 2026-11-08 2026-11-12 14-10-52.esf3d`;
const COLOUR_CHANNELS = [1, 2, 3, 16, 17, 18];
const showPath = (path: string): unknown[][] => [['/eos/out/get/show/path', path]];
// A channel parameter read as Eos 3.3.10 answers it: the fixture's maker and model, then name, level, min and max for
// each parameter. Each channel has a colour of its own, so a colour recorded back shows which read it came from.
const rgb = (chan: number): number[] => [chan + 10.5, chan + 20.5, chan + 30.5];
const params = (chan: number): unknown[][] => {
  const [red, green, blue] = rgb(chan);
  return [
    [
      `/eos/out/get/params/${chan}`,
      'ETC Fixtures',
      'D22 Studio RGB Str',
      ...['Intens', 0.5, 0, 100, 'Red', red, 0, 100, 'Green', green, 0, 100, 'Blue', blue, 0, 100],
      ...['Hue', 0, 0, 360, 'Saturation', 0, 0, 100, 'Shutter Strobe', 0, 0, 0],
    ],
  ];
};
const lightsReplies = (paths: string[] = [TEST_COPY]): Record<string, unknown[][][]> => ({
  '/eos/get/show/path': paths.map(showPath),
  ...Object.fromEntries(COLOUR_CHANNELS.map((chan) => [`/eos/get/params/${chan}`, [params(chan)]])),
  '/eos/get/params/24': [[['/eos/out/get/params/24', 'Generic', 'Dimmer', 'Intens', 55.5, 0, 100]]],
  // Eos saves as the Update key goes down, and sends nothing as it comes up.
  '/eos/key/update': [SAVED, []],
});
const recordOnly = (cue: number): string => `Chan 1 Thru 3 + 16 Thru 18 Record_Only Cue 1 / ${cue}#`;
const asking = (cue: number): string =>
  `LIVE: Cue  ${cue} : Chan 1 Thru 3 + 16 Thru 18 Record Only Cue 1 / ${cue}  Please Confirm`;
const asks = (cue: number): unknown[][] => [['/eos/out/cmd', asking(cue), 1]];
const ASKS = { [recordOnly(1)]: asks(1), [recordOnly(11)]: asks(11) };
// With Record Confirm off, Eos ends the command line at once.
const records = (cue: number): unknown[][] => [
  ['/eos/out/cmd', `LIVE: Cue  ${cue} : Chan 1 Thru 3 + 16 Thru 18 Record Only Cue 1 / ${cue} #`, 0],
];
const RECORDS = { [recordOnly(1)]: records(1) };
const NOT_LIVE = "The command line does not read LIVE: 'PATCH: '";
const TEAL = [20, 90, 100];
// The hex of the first packet a scenario's file holds for an address, as the recorder sent it.
async function sentHex(out: string, name: string, address: string): Promise<string> {
  const written = JSON.parse(await readFile(join(out, `${name}.json`), 'utf8')) as { packets: { address: string; hex: string }[] };
  return written.packets.find((packet) => packet.address === address)?.hex ?? '';
}
const REJECTED = 'Chan 1 Thru 3 + 16 Thru 18 Record_Only Cue 1 / 1 Q_Only#';
const without = (address: string): Record<string, unknown[][][]> =>
  Object.fromEntries(Object.entries(lightsReplies()).filter(([key]) => key !== address));
const NOT_THE_TEST_COPY = `The open show is not the test copy, so nothing was sent: '${SUNDAY}'`;

const PATH: Wire = [0, '/eos/get/show/path', []];
const ENTER: Wire = [0, '/eos/cmd', ['Enter']];
const go = (cue: number): Wire => newcmd(`Go_To_Cue 1 / ${cue} Time 0#`);
const get = (chan: number): Wire => [0, `/eos/get/params/${chan}`, []];
const paint = (chan: number, colour: number[]): Wire => [0, `/eos/chan/${chan}/param/red/green/blue`, colour];
const goAndRead = (cues: number[]): Wire[] => cues.flatMap((cue) => [go(cue), ...COLOUR_CHANNELS.map(get)]);

describe('record-eos-fixtures.py --lights, the setlist-controller#498 scenarios on a test copy of the church show', () => {
  const lights = async (
    rejects = [REJECTED],
    echoes: Record<string, unknown[][]> = ASKS,
    replies = lightsReplies(),
    bursts: (unknown[][] | null)[][] = [[LIVE], []],
  ) => {
    const out = await seededWithCommittedBut(LIGHTS);
    return { out, ...record(['--lights', out], bursts, rejects, echoes, replies) };
  };
  const others = LIGHTS_OTHERS;

  it('writes exactly its twelve files, and leaves every committed fixture as it was', async () => {
    const out = await seededWithCommittedBut(LIGHTS);
    const before = await Promise.all(others.map((name) => readFile(join(out, `${name}.json`))));

    const result = record(['--lights', out], [[LIVE], []], [REJECTED], ASKS, lightsReplies());

    expect(result.exit).toBeNull();
    expect((await readdir(out)).sort()).toEqual(files([...others, ...LIGHTS]));
    expect(await Promise.all(others.map((name) => readFile(join(out, `${name}.json`))))).toEqual(before);
  });

  it('reads the show path before each scenario, and sends what the lights step sends, in order', async () => {
    const { wire } = await lights();

    expect(wire).toEqual([
      ['opened', 0],
      PATH,
      ...[PATH, go(1), get(1), get(24)],
      ...[PATH, newcmd(REJECTED)],
      ...[PATH, ...goAndRead([11, 22, 35, 36])],
      ...[PATH, go(1), get(1), paint(1, TEAL), get(1)],
      ...[PATH, ...[2, 3, 16, 17, 18].map((chan) => paint(chan, TEAL)), newcmd(recordOnly(1)), ENTER, get(1), get(16)],
      ...[PATH, ...goAndRead([11, 22, 35, 36])],
      ...[PATH, go(11), ...COLOUR_CHANNELS.map((chan) => paint(chan, rgb(chan))), newcmd(recordOnly(11)), ENTER],
      ...goAndRead([22, 35, 36]),
      ...[PATH, [0, '/eos/subscribe', [1]], [0, '/eos/set/cue/1/1/label', ['Test Song A']], [0, '/eos/get/cue/1/1', []]],
      [0, '/eos/subscribe', [0]],
      ...[PATH, [0, '/eos/subscribe', [1]], newcmd('Cue 1 / 22 Copy_To Cue 1 / 23#'), [0, '/eos/get/cue/1/23', []]],
      ...[[0, '/eos/get/cue/1/count', []], go(23), get(16), [0, '/eos/subscribe', [0]]],
      ...[PATH, newcmd('Delete Cue 1 / 23 Enter Enter')],
      ...[PATH, [0, '/eos/key/shift', [1]], [0, '/eos/key/update', [1]], [0, '/eos/key/update', [0]]],
      ...[[0, '/eos/key/shift', [0]], PATH],
      [0, 'closed'],
      ['opened', 1],
      [1, '/eos/get/show/path', []],
      [1, 'closed'],
    ]);
  });

  it('records each scenario without the read of the show path that guards it or its cleanup', async () => {
    const { out } = await lights();

    expect(await packets(out, 'show-path')).toEqual([
      ['eos->app', '/eos/out/cmd', ['LIVE: Cue  8 : ', 0]],
      ['app->eos', '/eos/get/show/path', []],
      ['eos->app', '/eos/out/get/show/path', [TEST_COPY]],
    ]);
    expect((await packets(out, 'channel-params')).map(([, address]) => address)).toEqual([
      '/eos/newcmd',
      '/eos/get/params/1',
      '/eos/out/get/params/1',
      '/eos/get/params/24',
      '/eos/out/get/params/24',
    ]);
    expect(await packets(out, 'command-rejected')).toEqual([
      ['app->eos', '/eos/newcmd', [REJECTED]],
      ['eos->app', '/eos/out/cmd', ['LIVE: Error: Syntax', 0]],
    ]);
    expect((await packets(out, 'record-only-confirm-on')).slice(5, 8)).toEqual([
      ['app->eos', '/eos/newcmd', [recordOnly(1)]],
      ['eos->app', '/eos/out/cmd', [asking(1), 1]],
      ['app->eos', '/eos/cmd', ['Enter']],
    ]);
    expect((await packets(out, 'cue-copy-to')).filter(([dir]) => dir === 'app->eos').map(([, , args]) => args)).not.toContainEqual([
      'Delete Cue 1 / 23 Enter Enter',
    ]);
    expect((await packets(out, 'show-save')).map(([, address]) => address)).toEqual([
      '/eos/key/shift',
      '/eos/key/update',
      '/eos/out/show/name',
      '/eos/out/event/show/saved',
      '/eos/key/update',
      '/eos/key/shift',
      '/eos/get/show/path',
      '/eos/out/get/show/path',
    ]);
    expect(await packets(out, 'show-path-after-save')).toEqual([
      ['app->eos', '/eos/get/show/path', []],
      ['eos->app', '/eos/out/get/show/path', [TEST_COPY]],
    ]);
  });

  it('sends nothing but the read of the show path when the open show is not the test copy', async () => {
    const { out, wire, exit } = await lights([REJECTED], ASKS, lightsReplies([SUNDAY]));

    expect(exit).toBe(NOT_THE_TEST_COPY);
    expect(wire).toEqual([['opened', 0], PATH, [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });

  it('does not take a folder named for the test copy as the test copy', async () => {
    const inFolder = `${ETC}/Colour test/Church Sunday 2026-11-08 2026-11-12 14-10-52.esf3d`;

    const { wire, exit } = await lights([REJECTED], ASKS, lightsReplies([inFolder]));

    expect(exit).toBe(`The open show is not the test copy, so nothing was sent: '${inFolder}'`);
    expect(wire).toEqual([['opened', 0], PATH, [0, 'closed']]);
  });

  it('sends nothing when Eos does not answer the read of the show path', async () => {
    const { wire, exit } = await lights([REJECTED], ASKS, without('/eos/get/show/path'));

    expect(exit).toBe('Eos did not answer /eos/get/show/path');
    expect(wire).toEqual([['opened', 0], PATH, [0, 'closed']]);
  });

  it('stops before it reads or sends anything when the command line does not read LIVE', async () => {
    const { out, wire, exit } = await lights([REJECTED], ASKS, lightsReplies(), [[PATCH], []]);

    expect(exit).toBe("The command line does not read LIVE: 'PATCH: '");
    expect(wire).toEqual([
      ['opened', 0],
      [0, 'closed'],
    ]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });

  it('stops before the next scenario when another show is opened during the run', async () => {
    const { out, wire, exit } = await lights([REJECTED], ASKS, lightsReplies([TEST_COPY, TEST_COPY, SUNDAY]));

    expect(exit).toBe(NOT_THE_TEST_COPY);
    expect(wire.slice(-3)).toEqual([get(24), PATH, [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files([...others, 'show-path', 'channel-params']));
  });

  it('stops before the next scenario when the command line leaves Live during the run', async () => {
    const { wire, exit } = await lights([REJECTED], { ...ASKS, 'Go_To_Cue 1 / 36 Time 0#': PATCH }, lightsReplies());

    expect(exit).toBe(NOT_LIVE);
    expect(wire.slice(-2)).toEqual([get(18), [0, 'closed']]);
    expect(wire.filter(([, address]) => String(address).includes('/param/'))).toEqual([]);
  });

  // The sixth read of channel 1 is the one colour-set makes before it sets the colour.
  it('sets no colour when the command line leaves Live inside a scenario', async () => {
    const reads = [...Array.from({ length: 5 }, () => params(1)), [...PATCH, ...params(1)]];

    const { wire, exit } = await lights([REJECTED], ASKS, { ...lightsReplies(), '/eos/get/params/1': reads });

    expect(exit).toBe(NOT_LIVE);
    expect(wire.slice(-2)).toEqual([get(1), [0, 'closed']]);
    expect(wire.filter(([, address]) => String(address).includes('/param/'))).toEqual([]);
  });

  it('sends no Record Only when the command line leaves Live after the colours are set', async () => {
    const replies = { ...lightsReplies(), '/eos/chan/18/param/red/green/blue': [PATCH] };

    const { wire, exit } = await lights([REJECTED], ASKS, replies);

    expect(exit).toBe(NOT_LIVE);
    expect(wire.slice(-2)).toEqual([paint(18, TEAL), [0, 'closed']]);
  });

  it('sets no label when the command line leaves Live after the subscribe', async () => {
    const { wire, exit } = await lights([REJECTED], ASKS, { ...lightsReplies(), '/eos/subscribe': [PATCH] });

    expect(exit).toBe(NOT_LIVE);
    expect(wire.slice(-2)).toEqual([[0, '/eos/subscribe', [1]], [0, 'closed']]);
  });

  it('stops when Eos takes the command line it has to reject, before anything is written to the show', async () => {
    const { out, wire, exit } = await lights([]);

    expect(exit).toBe(`Eos did not reject '${REJECTED}'`);
    expect(wire.slice(-2)).toEqual([newcmd(REJECTED), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files([...others, 'show-path', 'channel-params']));
  });

  it('stops when Eos records at once and does not ask to confirm, since Record Confirm is then off', async () => {
    const { out, wire, exit } = await lights([REJECTED], RECORDS);

    expect(exit).toBe(
      `Eos recorded '${recordOnly(1)}' and did not ask to confirm: Record Confirm is off. Use --lights-confirm-off`,
    );
    expect(wire.slice(-2)).toEqual([newcmd(recordOnly(1)), [0, 'closed']]);
    expect(await readdir(out)).not.toContain('record-only-confirm-on.json');
  });

  it('stops, and sends no Enter, when Eos does not answer the Record Only', async () => {
    const { wire, exit } = await lights([REJECTED], {});

    expect(exit).toBe(`Eos did not answer '${recordOnly(1)}'`);
    expect(wire.slice(-2)).toEqual([newcmd(recordOnly(1)), [0, 'closed']]);
  });

  it('stops when Eos rejects the Record Only', async () => {
    const { wire, exit } = await lights([REJECTED, recordOnly(1)]);

    expect(exit).toBe(`Eos rejected '${recordOnly(1)}': LIVE: Error: Syntax`);
    expect(wire.slice(-2)).toEqual([newcmd(recordOnly(1)), [0, 'closed']]);
  });

  it('stops when a colour light does not answer with a red, a green and a blue', async () => {
    const replies = { ...lightsReplies(), '/eos/get/params/16': [[['/eos/out/get/params/16', 'Generic', 'Dimmer', 'Intens', 55.5, 0, 100]]] };

    const { wire, exit } = await lights([REJECTED], ASKS, replies);

    expect(exit).toBe("Channel 16 has no Red, Green and Blue: ['Generic', 'Dimmer', 'Intens', 55.5, 0, 100]");
    expect(wire.slice(-2)).toEqual([get(16), [0, 'closed']]);
  });

  it('releases Shift, and stops, when Eos sends no saved event', async () => {
    const { out, wire, exit } = await lights([REJECTED], ASKS, without('/eos/key/update'));

    expect(exit).toBe('Eos sent no /eos/out/event/show/saved in 10 s');
    expect(wire.slice(-2)).toEqual([[0, '/eos/key/shift', [0]], [0, 'closed']]);
    expect(await readdir(out)).not.toContain('show-save.json');
  });

  it('waits for the saved event when it comes after the keys', async () => {
    const replies = { ...without('/eos/key/update'), '/eos/key/shift': [[], SAVED] };

    const { out, exit } = await lights([REJECTED], ASKS, replies);

    expect(exit).toBeNull();
    expect((await packets(out, 'show-save')).map(([, address]) => address)).toEqual([
      '/eos/key/shift',
      '/eos/key/update',
      '/eos/key/update',
      '/eos/key/shift',
      '/eos/out/show/name',
      '/eos/out/event/show/saved',
      '/eos/get/show/path',
      '/eos/out/get/show/path',
    ]);
  });

  // Eos takes a key as a float, 1.0 for down and 0.0 for up, and a colour parameter as three floats. A number goes
  // out from encode as a float32.
  it('sends a key and a colour as floats', async () => {
    const { out } = await lights();

    expect(await sentHex(out, 'show-save', '/eos/key/shift')).toBe(encode('/eos/key/shift', [1]).toString('hex'));
    expect(await sentHex(out, 'colour-set', '/eos/chan/1/param/red/green/blue')).toBe(
      encode('/eos/chan/1/param/red/green/blue', TEAL).toString('hex'),
    );
  });
});

describe('record-eos-fixtures.py --lights-confirm-off, the Record Only with Record Confirm turned off by hand', () => {
  const others = CONFIRM_OFF_OTHERS;
  const confirmOff = async (echoes: Record<string, unknown[][]> = RECORDS, replies = lightsReplies(), burst = LIVE) => {
    const out = await seededWithCommittedBut(CONFIRM_OFF);
    return { out, ...record(['--lights-confirm-off', out], [[burst]], [], echoes, replies) };
  };

  it('writes exactly its one file, and leaves every committed fixture as it was', async () => {
    const out = await seededWithCommittedBut(CONFIRM_OFF);
    const before = await Promise.all(others.map((name) => readFile(join(out, `${name}.json`))));

    const result = record(['--lights-confirm-off', out], [[LIVE]], [], RECORDS, lightsReplies());

    expect(result.exit).toBeNull();
    expect((await readdir(out)).sort()).toEqual(files([...others, ...CONFIRM_OFF]));
    expect(await Promise.all(others.map((name) => readFile(join(out, `${name}.json`))))).toEqual(before);
  });

  it('sets a colour on the six colour lights and records it into the first song cue with no Enter', async () => {
    const { out, wire } = await confirmOff();

    const sent = [go(1), ...COLOUR_CHANNELS.map((chan) => paint(chan, [100, 70, 20])), newcmd(recordOnly(1)), get(1), get(16)];
    expect(wire).toEqual([['opened', 0], PATH, ...sent, [0, 'closed']]);
    expect((await packets(out, 'record-only-confirm-off')).filter(([dir]) => dir === 'app->eos')).toEqual(
      (sent as [number, string, unknown[]][]).map(([, address, args]) => ['app->eos', address, args]),
    );
  });

  it('stops, and sends no Enter, when Eos asks to confirm, since Record Confirm is then on', async () => {
    const { out, wire, exit } = await confirmOff(ASKS);

    expect(exit).toBe(`Eos asked to confirm '${recordOnly(1)}': Record Confirm is on. Clear the command line, then use --lights`);
    expect(wire.slice(-2)).toEqual([newcmd(recordOnly(1)), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });

  it('stops, and records nothing, when Eos does not answer the Record Only', async () => {
    const { out, wire, exit } = await confirmOff({});

    expect(exit).toBe(`Eos did not answer '${recordOnly(1)}'`);
    expect(wire.slice(-2)).toEqual([newcmd(recordOnly(1)), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });

  it('stops before it reads or sends anything when the command line does not read LIVE', async () => {
    const { out, wire, exit } = await confirmOff(RECORDS, lightsReplies(), PATCH);

    expect(exit).toBe(NOT_LIVE);
    expect(wire).toEqual([
      ['opened', 0],
      [0, 'closed'],
    ]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });

  it('sends nothing but the read of the show path when the open show is not the test copy', async () => {
    const { out, wire, exit } = await confirmOff(RECORDS, lightsReplies([SUNDAY]));

    expect(exit).toBe(NOT_THE_TEST_COPY);
    expect(wire).toEqual([['opened', 0], PATH, [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });
});

describe('record-eos-fixtures.py --lights-again, a second run of the lights step and a copy onto a decimal cue', () => {
  const DELETE = 'Delete Cue 1 / 22.5#';
  const deletes = (end: string): unknown[][] => [['/eos/out/cmd', `LIVE: Cue  22 : Delete Cue 1 / 22.5 ${end}`, 0]];
  const OFF = { [recordOnly(11)]: records(11), [recordOnly(22)]: records(22), [DELETE]: deletes('#') };
  const ON = { [recordOnly(11)]: asks(11), [recordOnly(22)]: asks(22), [DELETE]: deletes(' Please Confirm') };
  const others = COMMITTED.filter((name) => !AGAIN.includes(name));
  const again = async (echoes: Record<string, unknown[][]> = OFF, replies = lightsReplies(), burst = LIVE) => {
    const out = await seededWithCommittedBut(AGAIN);
    return { out, ...record(['--lights-again', out], [[burst]], [], echoes, replies) };
  };
  const subscribe = (on: number): Wire => [0, '/eos/subscribe', [on]];
  const cue = (number: number): Wire => [0, `/eos/get/cue/1/${number}`, []];
  const AMBER = [100, 70, 20];
  const COUNT: Wire = [0, '/eos/get/cue/1/count', []];
  // What the run sends, with `enter` after each command line Eos asks to confirm.
  const sent = (enter: Wire[]): Wire[] => [
    ['opened', 0],
    ...[PATH, subscribe(1), cue(11), go(11), ...COLOUR_CHANNELS.map(get)],
    ...[...COLOUR_CHANNELS.map((chan) => paint(chan, rgb(chan))), newcmd(recordOnly(11)), ...enter],
    ...[cue(11), get(1), get(16), subscribe(0)],
    ...[PATH, subscribe(1), cue(22), go(22), ...COLOUR_CHANNELS.map((chan) => paint(chan, AMBER))],
    ...[newcmd(recordOnly(22)), ...enter, cue(22), get(1), get(16), subscribe(0)],
    ...[PATH, subscribe(1), newcmd('Cue 1 / 22 Copy_To Cue 1 / 22.5#'), cue(22.5), COUNT],
    ...Array.from({ length: 9 }, (_, index): Wire => [0, '/eos/get/cue/1/index', [index]]),
    subscribe(0),
    ...[PATH, newcmd(DELETE), ...enter],
    [0, 'closed'],
  ];

  it('writes exactly its three files, and leaves every committed fixture as it was', async () => {
    const out = await seededWithCommittedBut(AGAIN);
    const before = await Promise.all(others.map((name) => readFile(join(out, `${name}.json`))));

    const result = record(['--lights-again', out], [[LIVE]], [], OFF, lightsReplies());

    expect(result.exit).toBeNull();
    expect((await readdir(out)).sort()).toEqual(files([...others, ...AGAIN]));
    expect(await Promise.all(others.map((name) => readFile(join(out, `${name}.json`))))).toEqual(before);
  });

  it('records each light back as it read it, then a new colour, then copies onto 1/22.5 and deletes it', async () => {
    const { out, wire } = await again();

    expect(wire).toEqual(sent([]));
    expect((await packets(out, 'cue-copy-to-decimal')).map(([, , args]) => args)).not.toContainEqual([DELETE]);
  });

  it('sends an Enter after each command line Eos asks to confirm, when Record Confirm is on', async () => {
    const { wire, exit } = await again(ON);

    expect(exit).toBeNull();
    expect(wire).toEqual(sent([ENTER]));
  });

  it('stops when Eos rejects the copy, and leaves no delete to send', async () => {
    const out = await seededWithCommittedBut(AGAIN);

    const result = record(['--lights-again', out], [[LIVE]], ['Cue 1 / 22 Copy_To Cue 1 / 22.5#'], OFF, lightsReplies());

    expect(result.exit).toBe("Eos rejected 'Cue 1 / 22 Copy_To Cue 1 / 22.5#': LIVE: Error: Syntax");
    expect(result.wire.slice(-2)).toEqual([newcmd('Cue 1 / 22 Copy_To Cue 1 / 22.5#'), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files([...others, 'record-only-same-colour', 'record-only-subscribed']));
  });

  it('stops before it reads or sends anything when the command line does not read LIVE', async () => {
    const { out, wire, exit } = await again(OFF, lightsReplies(), PATCH);

    expect(exit).toBe(NOT_LIVE);
    expect(wire).toEqual([
      ['opened', 0],
      [0, 'closed'],
    ]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });

  it('sends nothing but the read of the show path when the open show is not the test copy', async () => {
    const { out, wire, exit } = await again(OFF, lightsReplies([SUNDAY]));

    expect(exit).toBe(NOT_THE_TEST_COPY);
    expect(wire).toEqual([['opened', 0], PATH, [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });

  it('sends no delete when another show is opened after the copy', async () => {
    const { wire, exit } = await again(OFF, lightsReplies([TEST_COPY, TEST_COPY, TEST_COPY, SUNDAY]));

    expect(exit).toBe(NOT_THE_TEST_COPY);
    expect(wire.slice(-3)).toEqual([subscribe(0), PATH, [0, 'closed']]);
  });
});

// setlist-controller#508: a song cue that runs on into the next cue by a follow or a hang, on the same test copy.
describe('record-eos-fixtures.py --lights-chain, a song cue with a follow or a hang', () => {
  const COPY = 'Cue 1 / 22 Copy_To Cue 1 / 23#';
  const DELETE = 'Delete Cue 1 / 23#';
  const deletes = (end: string): unknown[][] => [['/eos/out/cmd', `LIVE: Cue  22 : Delete Cue 1 / 23 ${end}`, 0]];
  const OFF = { [recordOnly(22)]: records(22), [DELETE]: deletes('#') };
  const ON = { [recordOnly(22)]: asks(22), [DELETE]: deletes(' Please Confirm') };
  // A cue read as Eos answers it: arguments 19 to 21 of the list/0/31 reply are the link, the follow and the hang.
  const read = (number: number, follow = -1, hang = -1): unknown[][] => [
    [
      `/eos/out/get/cue/1/${number}/0/list/0/31`,
      ...[3, 'UID', 'Worthy Of It All', 2000, 0, -1, -1, -1, -1, 2000, 0, -1, -1, false, '0', 100, '', '', ''],
      ...[0, follow, hang, false, -1, false, '', 0, '', '', false, -1],
    ],
  ];
  const MISSING = [['/eos/out/get/cue/1/23']];
  // The answers of a show the run may change, in the order the run reads the two cues: the last song cue plain, with
  // the follow, plain again, with the hang, then plain; the copy not there, there with the follow, without it, gone.
  const chainReplies = (paths: string[] = [TEST_COPY]): Record<string, unknown[][][]> => ({
    ...lightsReplies(paths),
    '/eos/get/cue/1/22': [read(22), read(22, 3000), read(22), read(22, -1, 2000), read(22)],
    '/eos/get/cue/1/23': [MISSING, read(23, 3000), read(23), MISSING],
  });
  const others = COMMITTED.filter((name) => !CHAIN.includes(name));
  const chain = async (
    echoes: Record<string, unknown[][]> = OFF,
    replies = chainReplies(),
    rejects: string[] = [],
    burst = LIVE,
  ) => {
    const out = await seededWithCommittedBut(CHAIN);
    return { out, ...record(['--lights-chain', out], [[burst]], rejects, echoes, replies) };
  };
  const subscribe = (on: number): Wire => [0, '/eos/subscribe', [on]];
  const cue = (number: number): Wire => [0, `/eos/get/cue/1/${number}`, []];
  const FIRE: Wire = [0, '/eos/cue/1/22/fire', []];
  const LIST: Wire[] = [
    [0, '/eos/get/cue/1/count', []],
    ...Array.from({ length: 10 }, (_, index): Wire => [0, '/eos/get/cue/1/index', [index]]),
  ];
  const CHECK: Wire[] = [PATH, cue(22), cue(23)];
  const CLEANUP = (enter: Wire[]): Wire[] => [
    ...[PATH, newcmd('Cue 1 / 22 Follow#'), PATH, newcmd('Cue 1 / 22 Hang#'), PATH, newcmd(DELETE), ...enter],
  ];
  // What the run sends, with `enter` after each command line Eos asks to confirm.
  const sent = (enter: Wire[]): Wire[] => [
    ['opened', 0],
    ...[PATH, ...LIST, ...CHECK],
    ...[PATH, subscribe(1), newcmd('Cue 1 / 22 Follow 3#'), cue(22), subscribe(0)],
    ...[PATH, go(22), get(16), get(16)],
    ...[PATH, go(22), ...COLOUR_CHANNELS.map(get), ...COLOUR_CHANNELS.map((chan) => paint(chan, rgb(chan)))],
    ...[newcmd(recordOnly(22)), ...enter, get(16)],
    ...[PATH, FIRE],
    ...[PATH, subscribe(1), newcmd(COPY), cue(23), newcmd('Cue 1 / 23 Follow#'), cue(23), subscribe(0)],
    ...[PATH, FIRE],
    ...[PATH, newcmd('Cue 1 / 22 Follow#'), cue(22)],
    ...[PATH, newcmd('Cue 1 / 22 Hang 2#'), cue(22), go(22), get(16), get(16)],
    ...[PATH, newcmd('Cue 1 / 22 Hang#'), cue(22)],
    ...CLEANUP(enter),
    ...[PATH, ...LIST, cue(22), cue(23)],
    [0, 'closed'],
  ];

  it('writes exactly its eleven files, and leaves every committed fixture as it was', async () => {
    const out = await seededWithCommittedBut(CHAIN);
    const before = await Promise.all(others.map((name) => readFile(join(out, `${name}.json`))));

    const result = record(['--lights-chain', out], [[LIVE]], [], OFF, chainReplies());

    expect(result.exit).toBeNull();
    expect((await readdir(out)).sort()).toEqual(files([...others, ...CHAIN]));
    expect(await Promise.all(others.map((name) => readFile(join(out, `${name}.json`))))).toEqual(before);
  });

  it('sets the follow, goes to the cue, records, fires, copies, sets the hang, and takes each away, in order', async () => {
    const { out, wire, exit } = await chain();

    expect(exit).toBeNull();
    expect(wire).toEqual(sent([]));
    const cleared = (await packets(out, 'chain-hang-cleared')).map(([, , args]) => args);
    expect(cleared).not.toContainEqual([DELETE]);
  });

  it('sends an Enter after each command line Eos asks to confirm, when Record Confirm is on', async () => {
    const { wire, exit } = await chain(ON);

    expect(exit).toBeNull();
    expect(wire).toEqual(sent([ENTER]));
  });

  it('writes nothing to the show when the last song cue already has a follow', async () => {
    const replies = { ...chainReplies(), '/eos/get/cue/1/22': [read(22, 5000)] };
    const { out, wire, exit } = await chain(OFF, replies);

    expect(exit).toBe('Cue 1/22 has to be there with no link, follow or hang, so nothing was sent: (0, 5000, -1)');
    expect(wire).toEqual([['opened', 0], PATH, ...LIST, PATH, cue(22), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files([...others, 'chain-cue-list-before']));
  });

  it('writes nothing to the show when a cue already has the number of the copy', async () => {
    const replies = { ...chainReplies(), '/eos/get/cue/1/23': [read(23)] };
    const { wire, exit } = await chain(OFF, replies);

    expect(exit).toBe('Cue 1/23 is there already, so nothing was sent');
    expect(wire).toEqual([['opened', 0], PATH, ...LIST, ...CHECK, [0, 'closed']]);
  });

  it('takes the follow, the hang and the copy away again when Eos rejects a command line in the middle', async () => {
    const { out, wire, exit } = await chain(OFF, chainReplies(), [COPY]);

    expect(exit).toBe(`Eos rejected '${COPY}': LIVE: Error: Syntax`);
    expect(wire.slice(-8)).toEqual([newcmd(COPY), ...CLEANUP([]), [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files([...others, ...CHAIN.slice(0, 5)]));
  });

  it('sends no cleanup command when another show is open by then', async () => {
    const paths = [...Array.from({ length: 7 }, () => TEST_COPY), SUNDAY];
    const { wire, stdout, exit } = await chain(OFF, chainReplies(paths), [COPY]);

    expect(exit).toBe(`Eos rejected '${COPY}': LIVE: Error: Syntax`);
    expect(wire.slice(-5)).toEqual([newcmd(COPY), PATH, PATH, PATH, [0, 'closed']]);
    expect(stdout.split('\n').filter((line) => line.startsWith('CLEANUP STOPPED: '))).toHaveLength(3);
  });

  it('says so when the show is not as it was at the end', async () => {
    const replies = { ...chainReplies(), '/eos/get/cue/1/22': [read(22), read(22, 3000)] };
    const { exit } = await chain(OFF, replies);

    expect(exit).toBe('THE SHOW IS NOT AS IT WAS: cue 1/22 reads (0, 3000, -1), and cue 1/23 may still be there');
  });

  it('stops before it reads or sends anything when the command line does not read LIVE', async () => {
    const { out, wire, exit } = await chain(OFF, chainReplies(), [], PATCH);

    expect(exit).toBe(NOT_LIVE);
    expect(wire).toEqual([
      ['opened', 0],
      [0, 'closed'],
    ]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });

  it('sends nothing but the read of the show path when the open show is not the test copy', async () => {
    const { out, wire, exit } = await chain(OFF, chainReplies([SUNDAY]));

    expect(exit).toBe(NOT_THE_TEST_COPY);
    expect(wire).toEqual([['opened', 0], PATH, [0, 'closed']]);
    expect((await readdir(out)).sort()).toEqual(files(others));
  });
});

describe('record-eos-fixtures.py with no flag', () => {
  it('records the scenarios it always has on one connection, and none of the edge cases', async () => {
    const out = await seededOutput();
    const before = await readFile(join(out, 'fire-by-hand.json'));

    const result = record([out], [[]]);

    expect(result.exit).toBe('NO FIRE SEEN: fire-by-hand.json left as it was');
    expect(result.wire.filter((x) => x[0] === 'opened')).toEqual([['opened', 0]]);
    expect(result.wire[1]).toEqual([0, '/eos/newcmd', ['Go_To_Cue 1 / 8 Time 0#']]);
    expect((await readdir(out)).sort()).toEqual(
      RECORDED.filter((name) => !['fire-follow-chain', 'read-follow-list'].includes(name))
        .map((name) => `${name}.json`)
        .sort(),
    );
    expect(await readFile(join(out, 'fire-by-hand.json'))).toEqual(before);
  });
});
