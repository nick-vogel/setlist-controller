import { realClock, type Clock } from './clock.ts';
import type { TargetKind } from './connections-config.ts';
import type { Cue } from './cues.ts';
import { COUNT_OFF } from './playback-controller.ts';
import type { DeviceCheck, Target, TargetReport } from './target.ts';

// The ATEM: the video switcher that feeds the lobby screens. Armed, it cuts the lobby feed to Camera
// at each Count Off, so the lobby sees the band as a song starts. Its row offers the producer a cut
// to Pro and a cut to Camera by hand, and shows the input on program. Nothing cuts to Pro on its
// own: the producer presses Pro during setup. A cut made at the ATEM itself, as in ATEM Software
// Control, is a change by hand, which pauses the ATEM armed until the producer arms it again; its
// own cuts never do. The switcher's report of the cut a Count Off caused is the ATEM acting on that
// Count Off, so the server measures how late it acted; no other cue is measured. Its pre-service
// check names any configured input the ATEM does not have, or that is one of the ATEM's own sources,
// such as Color Bars, rather than a camera or video input, and the ATEM's model and firmware.
//
// The adapter talks to the ATEM only through a switcher client of its own (SwitcherClient). The
// production one is built on the atem-connection library (atem-switcher.ts), the only module that
// imports it; the tests pass a fake (test/fake-switcher.ts).

export type SwitcherInfo = {
  // Such as "ATEM Mini".
  model: string;
  // The protocol version the ATEM reports, such as "8.1.1".
  version: string;
};

// One input the ATEM has.
export type SwitcherInput = {
  // The input number, as in the connections config.
  input: number;
  // Whether it is an external video input, such as a camera or a computer, rather than one of the
  // ATEM's own sources, such as Black, Color Bars, a color generator or a media player.
  external: boolean;
  // The name the ATEM gives it, such as "Color Bars".
  name: string;
};

export type SwitcherClient = {
  // Starts connecting to the ATEM at host. It resolves once the client is connecting, and from then
  // on the client retries an ATEM it cannot reach, and reconnects on its own after a drop, until
  // close(). It rejects when the client could not start, or when the call into its running socket
  // process failed, and then the client may come online on its own or never, so the adapter connects
  // again until it is online.
  connect(host: string): void | Promise<void>;
  close(): Promise<void>;
  // Called with true each time the client connects, and with false each time it loses the ATEM.
  onConnection(listener: (connected: boolean) => void): void;
  // Called with the reason each time the client stops reconnecting on its own after a drop, and will
  // not try again until connect is called: a failed reconnect after its socket process respawns, or a
  // socket process that could not restart at all. It reports offline first.
  onGaveUp(listener: (reason: string) => void): void;
  // Called with the input on program on every program report while connected, whoever made the cut:
  // the adapter, or someone at the ATEM. A cut to the input already on program may go unreported:
  // on 2026-11-08 an ATEM Mini (firmware 8.1.1, atem-connection 3.10.3) brought the
  // production client no program change for one, so it never calls this for one. The fake switcher
  // reports one, and the adapter handles either. A report that carries several program changes, as
  // one packet from the ATEM can, calls it once for each, in order.
  onProgram(listener: (input: number) => void): void;
  // The input on program now, or null while not connected.
  programInput(): number | null;
  // The inputs the ATEM has, its own sources included, or none while not connected.
  inputs(): SwitcherInput[];
  // The ATEM's model and version, or null while not connected.
  info(): SwitcherInfo | null;
  // Puts the input on program, as a cut.
  changeProgramInput(input: number): Promise<void>;
};

// The ATEM's section in the connections config file: its address, and the input numbers of the Pro
// feed and the camera.
//
//   { "targets": { "atem": { "host": "192.168.10.240", "pro": 1, "camera": 2 } } }
//
// Its target opts out of the Fade out pause: a cut to Camera is wanted when the music comes back.
export function atemKind({ client, clock = realClock }: { client: () => SwitcherClient; clock?: Pick<Clock, 'now' | 'every'> }): TargetKind {
  return {
    label: LABEL,
    create(section) {
      const problems = sectionProblems(section);
      if (problems.length > 0) return { problems };
      return { target: atemTarget(client(), clock, section.host as string, { pro: section.pro as number, camera: section.camera as number }) };
    },
  };
}

const LABEL = 'ATEM';

// How long after one of its own cuts the ATEM still takes a program report of that input as the
// cut's own. An ATEM on the stage network answers in milliseconds; the window only bounds a cut
// whose report never comes.
const OWN_CUT_WINDOW_MS = 2000;

// How long after a connect that rejects, or after the switcher client gives up reconnecting on its
// own, the ATEM connects again, unless it comes online first. A connect rejects when the library
// cannot start its socket process, and then the library never retries on its own, so without this
// the ATEM would stay offline until a restart. It also rejects when the call into a running socket
// process fails, and then the library may come online by itself once that process restarts. The
// client gives up when the library's socket process respawns and the library's own reconnect after
// it rejects, or when that process could not restart at all, and then nothing in the library tries
// again. The library retries an unreachable ATEM
// every second; a socket process that fails is a fault on this Mac, so a slower pause keeps the log
// readable without leaving the ATEM offline long.
const RETRY_MS = 5000;

function sectionProblems(section: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (typeof section.host !== 'string' || section.host.trim() === '') problems.push('The ATEM\'s "host" must be its address, such as "192.168.10.240".');
  const input = (field: 'pro' | 'camera', example: number) => {
    const value = section[field];
    const good = typeof value === 'number' && Number.isInteger(value) && value > 0;
    if (!good) problems.push(`The ATEM's "${field}" must be the input number of the ${field === 'pro' ? 'Pro feed' : 'camera'}, a whole number such as ${example}.`);
    return good;
  };
  const pro = input('pro', 1);
  const camera = input('camera', 2);
  if (pro && camera && section.pro === section.camera) problems.push('The ATEM\'s "pro" and "camera" must be different inputs.');
  return problems;
}

// The ATEM's two inputs by their names in the config.
type Inputs = { pro: number; camera: number };

// The only cue the ATEM acts on: a Count Off.
const actsOn = (cue: Cue) => cue.name === COUNT_OFF;

function atemTarget(switcher: SwitcherClient, clock: Pick<Clock, 'now' | 'every'>, host: string, inputs: Inputs): Target {
  const failed = (what: string) => (error: unknown) => console.error(`Setlist server: the ATEM could not ${what}`, error);
  // The input on program as last reported, and the ATEM's own cuts whose reports have not come yet,
  // each with the cue that caused it, or null for a cut the producer's button made.
  let known: number | null = null;
  let sent: { input: number; at: number; cue: Cue | null }[] = [];
  // Every cut the ATEM sends goes through here. It is recorded before it is sent, since a switcher
  // client may report it before changeProgramInput returns. A cut the switcher client refuses is
  // dropped from the record before it is logged, since no report of it will come.
  const cut = (input: number, what: string, cue: Cue | null = null) => {
    const mine = { input, at: clock.now(), cue };
    sent.push(mine);
    switcher.changeProgramInput(input).catch((error: unknown) => {
      sent = sent.filter((entry) => entry !== mine);
      failed(what)(error);
    });
  };
  // The ATEM's own cut a program report of input is, or null when it is none: each cut accounts for
  // one report, the oldest first. The ATEM applies cuts in order, so a report that matches one also
  // drops every older own cut: the ATEM has moved past them, and one report can stand for several. A
  // cut whose report has not come within the window is dropped.
  const ownCut = (input: number) => {
    const now = clock.now();
    sent = sent.filter(({ at }) => now - at <= OWN_CUT_WINDOW_MS);
    const own = sent.findIndex((cut) => cut.input === input);
    const match = sent[own] ?? null;
    if (own >= 0) sent = sent.slice(own + 1);
    return match;
  };
  // Set by stop, and the pending connect again, if any.
  let stopped = false;
  let retry: (() => void) | null = null;
  // Connects again after a pause, unless one is already pending or the ATEM has stopped, so a give-up
  // during a pause never starts a second one.
  const retryLater = (report: TargetReport) => {
    if (retry || stopped) return;
    const stop = clock.every(RETRY_MS, () => {
      stop();
      retry = null;
      void connectOnce(report);
    });
    retry = stop;
  };
  // Connects once. A connect that resolves cancels any pending connect again and clears any reason on
  // the row, since the client retries on its own from then on. One that rejects is logged, its reason
  // shown on the row, and connected again after a pause, unless the ATEM has stopped: a connect that
  // close() made reject on the way down neither reports nor connects again.
  const connectOnce = async (report: TargetReport) => {
    try {
      await switcher.connect(host);
      if (stopped) return;
      retry?.();
      retry = null;
      report.problem(null);
    } catch (error) {
      if (stopped) return;
      failed(`connect to ${host}`)(error);
      report.problem(`The ATEM could not connect: ${sentence(error)}`);
      retryLater(report);
    }
  };
  return {
    name: 'atem',
    label: LABEL,
    pausesOnFade: false,
    // The program report of a Count Off's cut is the ATEM acting on that Count Off.
    acknowledges: true,
    // A connect that rejects, or a give-up from the switcher client after a drop (a failed reconnect
    // after a respawn, or a socket process that could not restart), leaves the ATEM offline with its
    // reason on the row, and connects again after a pause, until one resolves or the
    // ATEM comes online on its own; the server is never stopped by it. A give-up is not logged again
    // here, since the client logs the library's own line.
    // The row shows the input on program once the ATEM is online, and each change of it after. The
    // server ignores the line while the ATEM is offline, and clears it when the ATEM goes offline.
    // The input on program at each connect is taken as known: a cut made while the ATEM was offline
    // is no change by hand, since nobody can tell who made it. A connect or a disconnect clears the
    // ATEM's own cuts whose reports have not come, since a report lost to the drop never comes after.
    async start(report) {
      const program = (input: number | null) => report.state(programLine(input, inputs, switcher.inputs()));
      switcher.onConnection((connected) => {
        sent = [];
        if (connected) {
          retry?.();
          retry = null;
          report.problem(null);
        }
        report.status(connected ? 'online' : 'offline');
        if (connected) {
          known = switcher.programInput();
          program(known);
        }
      });
      switcher.onGaveUp((reason) => {
        if (stopped) return;
        report.problem(`The ATEM could not connect: ${sentence(reason)}`);
        retryLater(report);
      });
      // A program report that is not the ATEM's own cut, of an input other than the one on program,
      // is a change by hand, whatever the arm state: the server decides whether it pauses. The row
      // shows the new input before the pause. A report of the input already on program changes
      // nothing on the lobby feed, so it is never a change by hand. The report of a cut a Count Off
      // caused is the ATEM acting on that cue, after the row shows it; the report of a button's cut,
      // or of a cut by hand, acts on none.
      switcher.onProgram((input) => {
        const own = ownCut(input);
        const byHand = !own && input !== known;
        known = input;
        program(input);
        if (own?.cue) report.actedOn(own.cue);
        if (byHand) report.changedByHand();
      });
      await connectOnce(report);
    },
    // Stops any pending connect again before it closes the switcher client, so shutdown never races a
    // new connect.
    stop() {
      stopped = true;
      retry?.();
      retry = null;
      return switcher.close();
    },
    // A Count Off cuts to Camera, each time, Fire again included, even when Camera is on program
    // already. Every other cue, a song's End included, is ignored, and so never measured.
    actsOn,
    cue(cue: Cue) {
      if (!actsOn(cue)) return;
      cut(inputs.camera, 'cut to Camera', cue);
    },
    // The producer's manual cuts. The server runs them whatever the arm state, never while offline,
    // and a run never pauses the ATEM, nor does the cut's report.
    buttons: [
      { id: 'pro', label: 'Pro' },
      { id: 'camera', label: 'Camera' },
    ],
    runButton(id) {
      if (id === 'pro') cut(inputs.pro, 'cut to Pro');
      if (id === 'camera') cut(inputs.camera, 'cut to Camera');
    },
    // The pre-service check matches no song or section name, since the ATEM's only cue is the Count
    // Off. It checks the ATEM itself: each configured input it does not have, and each that is one of
    // its own sources rather than a camera or video input, by the name the ATEM gives it, Pro first,
    // and its model and firmware, problem or not. The firmware is the protocol version the ATEM
    // reports, which the library names by firmware release.
    check: () => deviceCheck(switcher, inputs),
  };
}

function deviceCheck(switcher: SwitcherClient, inputs: Inputs): DeviceCheck {
  const has = new Map(switcher.inputs().map((input) => [input.input, input]));
  const problems = (['pro', 'camera'] as const).flatMap((field) => {
    const label = `${field === 'pro' ? 'Pro' : 'Camera'} is input ${inputs[field]}`;
    const input = has.get(inputs[field]);
    if (!input) return [`${label}, which this ATEM does not have.`];
    if (!input.external) return [`${label}, which is ${input.name}, not a camera or video input.`];
    return [];
  });
  const info = switcher.info();
  const notes = info ? [`Model: ${info.model}, firmware ${info.version}.`] : [];
  return { problems, notes };
}

// The row's line for the input on program, and no line while it is not known. Pro and Camera show by
// their own names, whatever the ATEM calls their inputs. Any other input shows by the name the ATEM
// gives it in named, the switcher's inputs at the time of the report, so a rename at the ATEM shows on
// the next report. An input the ATEM does not list, or names with nothing but spaces, shows by its
// number.
function programLine(input: number | null, { pro, camera }: Inputs, named: SwitcherInput[]): string[] | null {
  if (input === null) return null;
  if (input === pro) return ['Program: Pro'];
  if (input === camera) return ['Program: Camera'];
  const name = named.find((source) => source.input === input)?.name.trim();
  return [name ? `Program: ${name}` : `Program: Input ${input}`];
}

// An error's message as a sentence, ending in a period, or the thing thrown when it is no Error.
function sentence(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /[.!?]$/.test(message) ? message : `${message}.`;
}
