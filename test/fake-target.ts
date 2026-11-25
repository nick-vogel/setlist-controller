import type { TargetKind } from '../src/server/connections-config.ts';
import type { Cue } from '../src/server/cues.ts';
import type { Target, TargetReport, TargetStatus } from '../src/server/target.ts';
import type { ConnectionButton, ConnectionChoice, SetList } from '../src/shared/snapshot.ts';

// A connection target for tests, passed to the server through the rig. It records every cue it
// receives, in order, and the test makes it go online and offline. It reports online at start; a
// status change while it is not started is only remembered, and reported at the next start. Its
// pre-service check answers with the names and the notes the test last set, none by default, and
// with the pass text it is built with (by default "Every song and section matches."). The test makes it report a change by hand, and builds it to pause on a Fade out or not (by default it
// does not), and with the manual buttons it declares (none by default). It records every button it
// runs, and counts each time the server tells it of the producer's Arm. Built to acknowledge (by
// default it does not), it says so to the server; the test makes it report acting on a cue either
// way. The test also makes it report a problem reaching it, such as a connect that failed, and clear
// it. Built with a pick to offer (none by default), it reports it at
// each start with nothing picked, records every pick the server hands it with the set, and reports
// the choice picked. The test also makes it report that its own file changed.
export type FakeTarget = Target & {
  // Every cue the server handed it, in order.
  cues: Cue[];
  // Every set the server asked it to check, in order.
  checks: SetList[];
  // The meters the server handed each of those checks, in the same order, by song number.
  meters: ReadonlyMap<number, number>[];
  // The id of every manual button the server ran on it, in order.
  runs: string[];
  // Every pick the server handed it, with the set, in order.
  picks: { choice: string; set: SetList }[];
  // How many times the server told it of the producer's Arm (armed).
  arms(): number;
  // The names its pre-service check answers it cannot match from now on.
  setUnmatched(names: string[]): void;
  // The notes its pre-service check answers from now on.
  setNotes(lines: string[]): void;
  goOnline(): void;
  goOffline(): void;
  // Reports a change by hand, as an operator at the target makes one. Nothing while not started.
  changeByHand(): void;
  // Reports the read-only state the target shows on its row, the list under it, and the index of the
  // list line it marks. Nothing while not started.
  setState(lines: string[] | null, list?: string[] | null, current?: number | null): void;
  // Reports acting on the cue given, or on the last cue it was handed. Nothing while not started.
  act(cue?: Cue): void;
  // Reports what is wrong with reaching the target now, or null for nothing. Nothing while not
  // started.
  setProblem(problem: string | null): void;
  // Reports that its own file changed at the target, as an operator's edit there does. Nothing while
  // not started.
  changeFile(): void;
};

export function fakeTarget({
  name,
  label,
  pausesOnFade = false,
  buttons = [],
  acknowledges = false,
  pick,
  passText = 'Every song and section matches.',
}: {
  name: string;
  label: string;
  pausesOnFade?: boolean;
  buttons?: ConnectionButton[];
  acknowledges?: boolean;
  pick?: { label: string; options: ConnectionChoice[] };
  passText?: string;
}): FakeTarget {
  let report: TargetReport | null = null;
  let status: TargetStatus = 'online';
  const cues: Cue[] = [];
  const checks: SetList[] = [];
  const meters: ReadonlyMap<number, number>[] = [];
  const runs: string[] = [];
  const picks: { choice: string; set: SetList }[] = [];
  let arms = 0;
  let picked: ConnectionChoice | null = null;
  const reportPick = () => {
    if (pick) report?.pick({ label: pick.label, options: pick.options, picked });
  };
  let unmatched: string[] = [];
  let notes: string[] = [];
  const go = (next: TargetStatus) => {
    status = next;
    report?.status(next);
  };
  return {
    name,
    label,
    pausesOnFade,
    acknowledges,
    start(given) {
      report = given;
      reportPick();
      given.status(status);
    },
    async stop() {
      report = null;
    },
    cue: (cue) => void cues.push(cue),
    cues,
    buttons,
    runButton: (id) => void runs.push(id),
    runs,
    armed: () => void (arms += 1),
    arms: () => arms,
    ...(pick && {
      pick(choice: string, set: SetList) {
        picks.push({ choice, set });
        picked = pick.options.find(({ id }) => id === choice) ?? null;
        reportPick();
      },
    }),
    picks,
    check(set, given = new Map()) {
      checks.push(set);
      meters.push(given);
      return { unmatched: [...unmatched], problems: [], notes: [...notes], passText };
    },
    checks,
    meters,
    setUnmatched(names) {
      unmatched = [...names];
    },
    setNotes(lines) {
      notes = [...lines];
    },
    goOnline: () => go('online'),
    goOffline: () => go('offline'),
    changeByHand: () => report?.changedByHand(),
    setState: (lines, list, current) => report?.state(lines, list, current),
    act(cue = cues.at(-1)) {
      if (cue) report?.actedOn(cue);
    },
    setProblem: (problem) => report?.problem(problem),
    changeFile: () => report?.fileChanged(),
  };
}

// A target kind for tests, which the connections config file names as the test registers it, such
// as { fake: fakeKind(target) }. Its section needs a whole-number "port"; any other section is
// rejected with one problem. A good section builds the given target, so the test holds it.
export function fakeKind(target: FakeTarget, { label = target.label }: { label?: string } = {}): TargetKind {
  return {
    label,
    create(section) {
      if (!Number.isInteger(section.port)) return { problems: ['The fake target\'s "port" must be a whole number, such as 4031.'] };
      return { target };
    },
  };
}
