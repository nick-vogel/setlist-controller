import { createSocket, type Socket } from 'node:dgram';
import { setTimeout as delay } from 'node:timers/promises';
import * as abletonosc from '../shared/abletonosc.ts';
import { CUE_POINTS, LISTENED_PROPERTIES, listenReply, PROBE, TRACK_DATA, TRACK_VOLUME, type OutMessage } from '../shared/abletonosc.ts';
import { decode, encode, type OscArgument, type OscOutArgument } from '../shared/osc.ts';
import {
  BEATS_PER_BAR,
  CUE,
  cueTime,
  groupedLabel,
  isTestSet,
  isTestSetTracks,
  locatorLine,
  sectionAt,
  type Section,
  TEST_SET,
  TEST_SET_LOOP,
  TEST_SET_SIGNATURE,
  TEST_SET_TEMPO,
  TEST_SET_TRACKS,
  trackLine,
} from './test-set.ts';

// One run of the contract check: send the controller's AbletonOSC messages to a target in a fixed
// sequence, and record every reply and listener report. The observations each step takes are derived
// from those reports so that two runs against the same target agree, whatever the timing: sections
// landed in, yes or no, exact locator and loop values and type tags. The raw stream, with its ms
// offsets, goes to the readable report only.

// A JSON value. Every observation is one.
export type Value = string | number | Value[] | { [key: string]: Value };

export type SentRecord = { at: number; address: string; args: string };
export type ReceivedRecord = { at: number; address: string; types: string; args: string };

export type StepRecord = {
  name: string;
  title: string;
  sent: SentRecord[];
  received: ReceivedRecord[];
  observations: Record<string, Value>;
  notes: string[];
};

export type Target = { kind: 'fake' | 'live'; host: string; port: number; replyPort: number };

export type RunRecord = {
  target: Target;
  ranAt: string;
  // The target's version as it replied to the probe, such as '12.1'.
  version: string;
  warnings: string[];
  // Why the run stopped early, when it did.
  aborted?: string;
  steps: StepRecord[];
};

export const UNOBSERVED = 'unobserved';

// The observations the report reads by name, as the step and the key each is recorded under.
export const LOCATORS = { step: 'cue-points', observation: 'locators' } as const;
export const PLAYS_FROM_LOCATOR = { step: 'jump-then-start', observation: 'plays from the locator' } as const;
export const RESUMES_AT_STOP_POINT = { step: 'continue-after-stop', observation: 'resumes at the stop point' } as const;
export const SECOND_JUMP_REPLACES = { step: 'second-jump-replaces', observation: 'second jump replaces the waiting one' } as const;
export const PLAYHEAD_AFTER_STOP = { step: 'stop', observation: 'playhead after stop' } as const;

// Longer than AbletonOSC's ~100 ms tick, so a message sent has been handled and its reports are in.
const SETTLE_MS = 500;
const REPLY_TIMEOUT_MS = 2000;
// Two bars at the test set's tempo.
const MID_BAR_TIMEOUT_MS = 4000;
const POLL_MS = 10;
// How far the playhead may sit from the last report before a stop and still read "at stop point". At
// 120 BPM a report can be a tick old and the stop can land a tick later, about 0.4 beats in all, and a
// slow tick adds more; a playhead that went back to a locator or the start moves many beats.
const STOP_TOLERANCE_BEATS = 1;
// The volume the track step sets each track to: exact in float32, and none of the fake Live's.
const PROBE_VOLUME = 0.25;

class Abort extends Error {}

type Report = { at: number; step: string; address: string; types: string; args: OscArgument[] };

export type RunOptions = {
  target: Target;
  // The address the run's socket binds. It receives the target's replies on target.replyPort.
  bindHost: string;
  signal?: AbortSignal;
};

export const INTERRUPTED = 'Interrupted before the run finished.';

export async function runContractCheck({ target, bindHost, signal }: RunOptions): Promise<RunRecord> {
  const socket = await bind(bindHost, target.replyPort);
  // The fake Live replies to the port a message came from, so a run on port 0 hears it there.
  const run = session(socket, target, signal);
  try {
    for (const step of STEPS) {
      signal?.throwIfAborted();
      await step(run);
    }
  } catch (error) {
    if (signal?.aborted) run.record.aborted = INTERRUPTED;
    else if (error instanceof Abort) run.record.aborted = error.message;
    else throw error;
  } finally {
    // The clean-up sends, and late replies, belong to no step.
    run.endStep();
    if (run.started && !run.stopped) {
      await run.flush(abletonosc.stopPlaying());
      await run.flush(abletonosc.loopOff());
    }
    if (run.braceMoved) {
      for (const message of abletonosc.loopBrace(TEST_SET_LOOP.start, TEST_SET_LOOP.length)) await run.flush(message);
    }
    for (const [track, volume] of run.savedVolumes) await run.flush(abletonosc.setTrackVolume(track, volume));
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
  return run.record;
}

// The state one run shares between its steps: the socket's sends and every report, the record it
// fills, and the helpers that read the reports and wait on them.
function session(socket: Socket, target: Target, signal?: AbortSignal) {
  const start = performance.now();
  const now = () => Math.round(performance.now() - start);
  const reports: Report[] = [];
  const steps: StepRecord[] = [];
  const record: RunRecord = { target, ranAt: new Date().toISOString(), version: UNOBSERVED, warnings: [], steps };
  let step: StepRecord | undefined;

  socket.on('message', (packet) => {
    const message = decode(packet);
    if (!message) return;
    const at = now();
    reports.push({ at, step: step?.name ?? '', ...message });
    step?.received.push({ at, address: message.address, types: message.types, args: formatArgs(message.args) });
  });

  const send = (message: OutMessage) => {
    step?.sent.push({ at: now(), address: message.address, args: formatOutArgs(message.args) });
    socket.send(encode(message.address, message.args), target.port, target.host);
  };

  const flush = (message: OutMessage) =>
    new Promise<void>((resolve) =>
      socket.send(encode(message.address, message.args), target.port, target.host, (error) => {
        if (error) console.error('Contract check: UDP socket error', error);
        resolve();
      }),
    );

  const begin = (name: string, title: string) => {
    step = { name, title, sent: [], received: [], observations: {}, notes: [] };
    steps.push(step);
    return step;
  };

  // What the target has reported on an address since a time, oldest first.
  const reportsOn = (address: string, since = 0) => reports.filter((report) => report.address === address && report.at >= since);
  const positions = (since = 0) =>
    reportsOn(listenReply('current_song_time'), since).flatMap((report) =>
      typeof report.args[0] === 'number' ? [{ at: report.at, beats: report.args[0] }] : [],
    );
  const latestPosition = () => positions().at(-1)?.beats;
  const latestPlaying = (): Value => {
    const value = reportsOn(listenReply('is_playing')).at(-1)?.args[0];
    return typeof value === 'boolean' ? yesNo(value) : UNOBSERVED;
  };
  const latestTempo = () => {
    const value = reportsOn(listenReply('tempo')).at(-1)?.args[0];
    return typeof value === 'number' ? value : TEST_SET_TEMPO;
  };

  // Waits until the condition holds, or the timeout passes. True when it held.
  const waitFor = async (condition: () => boolean, timeoutMs: number) => {
    const until = performance.now() + timeoutMs;
    while (!condition()) {
      if (performance.now() >= until) return false;
      await sleep(POLL_MS, signal);
    }
    return true;
  };

  // Waits until the playhead, as last reported, is between beats 1 and 2 of a bar (counted from 0),
  // so a message sent then lands well clear of a bar line under AbletonOSC's tick.
  const waitForMidBar = async (current: StepRecord, section?: Section) => {
    const midBar = await waitFor(() => {
      const beats = latestPosition();
      if (beats === undefined) return false;
      const offset = beats % BEATS_PER_BAR;
      return offset >= 1 && offset < 2 && (!section || sectionAt(beats) === section);
    }, MID_BAR_TIMEOUT_MS);
    if (!midBar) current.notes.push(`No mid-bar playhead${section ? ` in ${section}` : ''} within ${MID_BAR_TIMEOUT_MS} ms; sent anyway.`);
    return midBar;
  };

  // The ms until the playhead, as last reported, reaches a beat, plus a settle. A fixed wait when the
  // target has not reported the playhead.
  const msUntil = (beats: number | undefined) => {
    const from = latestPosition();
    if (beats === undefined || from === undefined) return BEATS_PER_BAR * msPerBeat(TEST_SET_TEMPO) + SETTLE_MS;
    return Math.max(0, (beats - from) * msPerBeat(latestTempo())) + SETTLE_MS;
  };

  return {
    target,
    record,
    now,
    send,
    flush,
    sleep: (ms: number) => sleep(ms, signal),
    begin,
    // Ends the current step, so what comes in or goes out after belongs to none.
    endStep: () => {
      step = undefined;
    },
    reportsOn,
    positions,
    latestPosition,
    latestPlaying,
    latestTempo,
    waitFor,
    waitForMidBar,
    msUntil,
    // Each run leaves Live stopped, with the loop off, the test set's brace and every volume as it
    // found it. A run that fails after it started playing sends the stop it never reached, turns the
    // loop off, and puts the brace back. One that fails while it has a volume changed sets it back.
    started: false,
    stopped: false,
    braceMoved: false,
    // Each track's volume as the track step read it, by index, until the step has set it back.
    savedVolumes: new Map<number, number>(),
  };
}

type Session = ReturnType<typeof session>;

// The steps, in the order they run. Each one records what it sent, what came back and what it
// observed, under its own name.
const STEPS: ((run: Session) => Promise<void>)[] = [
  probeStep,
  cuePointsStep,
  listenStep,
  trackVolumesStep,
  loopOffStep,
  jumpWhileStoppedStep,
  jumpThenStartStep,
  continueAfterStopStep,
  jumpWhilePlayingStep,
  secondJumpReplacesStep,
  loopStep,
  stopStep,
];

// The probe the bridge sends to learn that Live is there.
async function probeStep(run: Session): Promise<void> {
  const current = run.begin('version', 'Probe: the application version');
  const sentAt = run.now();
  run.send(abletonosc.probe());
  const replied = await run.waitFor(() => run.reportsOn(PROBE, sentAt).length > 0, REPLY_TIMEOUT_MS);
  if (!replied) throw new Abort(`No AbletonOSC at ${run.target.host}:${run.target.port}: no reply to ${PROBE} within ${REPLY_TIMEOUT_MS} ms.`);
  const reply = run.reportsOn(PROBE, sentAt)[0];
  run.record.version = reply?.args.join('.') ?? UNOBSERVED;
  current.observations['reply types'] = reply?.types ?? UNOBSERVED;
}

async function cuePointsStep(run: Session): Promise<void> {
  const current = run.begin(LOCATORS.step, 'Read the locators');
  const sentAt = run.now();
  run.send(abletonosc.getCuePoints());
  const replied = await run.waitFor(() => run.reportsOn(CUE_POINTS, sentAt).length > 0, REPLY_TIMEOUT_MS);
  if (!replied) throw new Abort(`No reply to ${CUE_POINTS} within ${REPLY_TIMEOUT_MS} ms.`);
  const reply = run.reportsOn(CUE_POINTS, sentAt)[0];
  const pairs: Value[] = [];
  for (let index = 0; index < (reply?.args.length ?? 0); index += 2) {
    const [name, time] = [reply?.args[index], reply?.args[index + 1]];
    pairs.push([String(name), typeof time === 'number' ? round(time) : String(time)]);
  }
  current.observations['reply types'] = reply?.types ?? UNOBSERVED;
  current.observations[LOCATORS.observation] = pairs;
  if (!isTestSet(pairs)) {
    throw new Abort(`The open set is not the test set. Expected these locators:\n${TEST_SET.map((cue) => `  ${locatorLine(cue)}`).join('\n')}`);
  }
}

async function listenStep(run: Session): Promise<void> {
  const current = run.begin('listen', 'Register the listeners');
  const sentAt = run.now();
  for (const property of LISTENED_PROPERTIES) run.send(abletonosc.startListen(property));
  await run.sleep(SETTLE_MS);
  for (const property of LISTENED_PROPERTIES) {
    const report = run.reportsOn(listenReply(property), sentAt)[0];
    current.observations[property] = report
      ? { 'reported at once': 'yes', address: report.address, types: report.types, value: observedArg(report.args[0]) }
      : { 'reported at once': 'no' };
  }
  if (run.latestPlaying() === 'yes') throw new Abort('Live is playing. Stop Live, put the playhead at the start, and run again.');
  const tempo = run.reportsOn(listenReply('tempo')).at(-1)?.args[0];
  if (typeof tempo === 'number' && round(tempo) !== TEST_SET_TEMPO) {
    run.record.warnings.push(`The tempo is ${round(tempo)} BPM, not the test set's ${TEST_SET_TEMPO}.`);
  }
  const numerator = run.reportsOn(listenReply('signature_numerator')).at(-1)?.args[0];
  const denominator = run.reportsOn(listenReply('signature_denominator')).at(-1)?.args[0];
  if (
    (typeof numerator === 'number' && numerator !== TEST_SET_SIGNATURE.numerator) ||
    (typeof denominator === 'number' && denominator !== TEST_SET_SIGNATURE.denominator)
  ) {
    run.record.warnings.push(
      `The time signature is ${numerator}/${denominator}, not the test set's ${TEST_SET_SIGNATURE.numerator}/${TEST_SET_SIGNATURE.denominator}.`,
    );
  }
  const loopStart = run.reportsOn(listenReply('loop_start')).at(-1)?.args[0];
  const loopLength = run.reportsOn(listenReply('loop_length')).at(-1)?.args[0];
  if (
    (typeof loopStart === 'number' && round(loopStart) !== TEST_SET_LOOP.start) ||
    (typeof loopLength === 'number' && round(loopLength) !== TEST_SET_LOOP.length)
  ) {
    run.record.warnings.push(
      `The loop brace starts at beat ${round(Number(loopStart))} and is ${round(Number(loopLength))} beats long, not the test set's ${TEST_SET_LOOP.start} and ${TEST_SET_LOOP.length}.`,
    );
  }
}

// The fade's messages: the track list, then each track's volume read, set, read back, set back to the
// volume read, and read again. It runs before anything plays, so no change is ever heard. The volumes
// stay out of the observations, since real Live's sit wherever the faders are; the readable report
// lists them with every message.
async function trackVolumesStep(run: Session): Promise<void> {
  const current = run.begin('track-volumes', "Read the track list, set each track's volume and set it back");
  const sentAt = run.now();
  run.send(abletonosc.getTrackData());
  const replied = await run.waitFor(() => run.reportsOn(TRACK_DATA, sentAt).length > 0, REPLY_TIMEOUT_MS);
  const reply = run.reportsOn(TRACK_DATA, sentAt)[0];
  if (!replied || !reply) {
    current.notes.push(`No reply to ${TRACK_DATA} within ${REPLY_TIMEOUT_MS} ms.`);
    current.observations['reply types'] = UNOBSERVED;
    return;
  }
  // The reply is a flat list: name, is_grouped, repeated, one pair per track from index 0.
  const tracks: [string, string][] = [];
  for (let index = 0; index + 1 < reply.args.length; index += 2) {
    const [name, grouped] = [reply.args[index], reply.args[index + 1]];
    tracks.push([String(name), typeof grouped === 'boolean' ? groupedLabel(grouped) : String(grouped)]);
  }
  current.observations['reply types'] = reply.types;
  current.observations['tracks'] = tracks;
  if (!isTestSetTracks(tracks)) {
    const listed = (lines: string[]) => (lines.length === 0 ? 'none' : lines.join(', '));
    run.record.warnings.push(
      `The tracks are ${listed(tracks.map(([name, grouped]) => `${name} (${grouped})`))}, not the test set's ${listed(TEST_SET_TRACKS.map(trackLine))}.`,
    );
  }

  // Asks for every track's volume, one track at a time, and waits for the answers. Each answer, by
  // the index it carries.
  const indexes = tracks.map((_, index) => index);
  const readVolumes = async () => {
    const readAt = run.now();
    for (const track of indexes) run.send(abletonosc.getTrackVolume(track));
    await run.waitFor(() => run.reportsOn(TRACK_VOLUME, readAt).length >= indexes.length, REPLY_TIMEOUT_MS);
    const answers = run.reportsOn(TRACK_VOLUME, readAt);
    const volumes = new Map<number, number>();
    for (const { args } of answers) {
      const [track, volume] = args;
      if (typeof track === 'number' && Number.isInteger(track) && typeof volume === 'number') volumes.set(track, volume);
    }
    return { answers, volumes };
  };

  const before = await readVolumes();
  for (const [track, volume] of before.volumes) run.savedVolumes.set(track, volume);
  current.observations['volume reply types'] = before.answers.length === 0 ? UNOBSERVED : dedupe(before.answers.map(({ types }) => types).sort()).join(' ');
  current.observations['answers with its index'] =
    before.answers.length === 0
      ? UNOBSERVED
      : yesNo(before.answers.length === indexes.length && indexes.every((track) => before.answers.filter(({ args }) => args[0] === track).length === 1));
  if (before.volumes.size === 0) {
    current.notes.push(`No track volume read within ${REPLY_TIMEOUT_MS} ms, so none was set.`);
    current.observations['reads back the volume set'] = UNOBSERVED;
    current.observations['set back to the volume read'] = UNOBSERVED;
    return;
  }

  for (const track of before.volumes.keys()) run.send(abletonosc.setTrackVolume(track, PROBE_VOLUME));
  await run.sleep(SETTLE_MS);
  const set = await readVolumes();
  current.observations['reads back the volume set'] = yesNo([...before.volumes.keys()].every((track) => set.volumes.get(track) === PROBE_VOLUME));

  for (const [track, volume] of before.volumes) run.send(abletonosc.setTrackVolume(track, volume));
  await run.sleep(SETTLE_MS);
  const back = await readVolumes();
  run.savedVolumes.clear();
  current.observations['set back to the volume read'] = yesNo([...before.volumes].every(([track, volume]) => back.volumes.get(track) === volume));
}

async function loopOffStep(run: Session): Promise<void> {
  const current = run.begin('loop-off', 'Turn the loop off');
  const sentAt = run.now();
  run.send(abletonosc.loopOff());
  await run.sleep(SETTLE_MS);
  current.observations['loop reports'] = typedValues(run.reportsOn(listenReply('loop'), sentAt));
}

async function jumpWhileStoppedStep(run: Session): Promise<void> {
  const current = run.begin('jump-while-stopped', 'Jump to Verse while stopped');
  const sentAt = run.now();
  run.send(abletonosc.jump(CUE.verse));
  await run.sleep(SETTLE_MS);
  const landed = run.positions(sentAt).at(-1)?.beats;
  current.observations['position'] = landed === undefined ? UNOBSERVED : round(landed);
  current.observations['section'] = landed === undefined ? UNOBSERVED : sectionAt(landed);
  current.observations['playing'] = run.latestPlaying();
}

async function jumpThenStartStep(run: Session): Promise<void> {
  // The controller's play from start while stopped: a jump to the locator, then start_playing, back
  // to back. The jump while stopped moves Live's start marker, which start_playing plays from.
  const current = run.begin(PLAYS_FROM_LOCATOR.step, 'Jump to Chorus, then start playing');
  const sentAt = run.now();
  run.send(abletonosc.jump(CUE.chorus));
  run.send(abletonosc.startPlaying());
  run.started = true;
  await run.sleep(1000);
  const after = run.positions(sentAt);
  const last = after.at(-1)?.beats;
  const chorus = cueTime(CUE.chorus);
  current.observations['playing'] = run.latestPlaying();
  current.observations['section'] = last === undefined ? UNOBSERVED : sectionAt(last);
  current.observations['bar of the section'] = last === undefined ? UNOBSERVED : Math.floor((last - chorus) / BEATS_PER_BAR) + 1;
  // Every playhead report after the sends is in the Chorus's first bar: it played from the
  // locator, not from where the playhead stood before the jump.
  current.observations[PLAYS_FROM_LOCATOR.observation] =
    after.length === 0
      ? UNOBSERVED
      : yesNo(run.latestPlaying() === 'yes' && after.every(({ beats }) => beats >= chorus && beats < chorus + BEATS_PER_BAR));
}

async function continueAfterStopStep(run: Session): Promise<void> {
  // Why play from start never continues while stopped: on Live Lite 12.4.6 continue_playing resumes
  // from where playback last stopped, and ignores a jump made while stopped (setlist-controller#13).
  // Live plays in the Chorus again afterwards, as the next step needs. The clean-up stop still fires
  // on an abort anywhere in here, since run.stopped stays false.
  const current = run.begin(RESUMES_AT_STOP_POINT.step, 'Stop, jump to Verse while stopped, then continue playing');
  const stopPoint = run.latestPosition();
  run.send(abletonosc.stopPlaying());
  await run.sleep(SETTLE_MS);
  run.send(abletonosc.jump(CUE.verse));
  await run.sleep(SETTLE_MS);
  const continuedAt = run.now();
  run.send(abletonosc.continuePlaying());
  await run.sleep(1000);
  const after = run.positions(continuedAt);
  const last = after.at(-1)?.beats;
  current.observations['playing'] = run.latestPlaying();
  current.observations['section'] = last === undefined ? UNOBSERVED : sectionAt(last);
  // Every playhead report after the send sits at the stop point, or on from it by the time played
  // since, and none is in the Verse the jump moved the playhead to.
  const beatsPerMs = run.latestTempo() / 60000;
  const atStopPoint = (at: number, beats: number) =>
    stopPoint !== undefined &&
    beats >= stopPoint - STOP_TOLERANCE_BEATS &&
    beats <= stopPoint + STOP_TOLERANCE_BEATS + (at - continuedAt) * beatsPerMs &&
    sectionAt(beats) !== 'Verse';
  current.observations[RESUMES_AT_STOP_POINT.observation] =
    after.length === 0 || stopPoint === undefined
      ? UNOBSERVED
      : yesNo(run.latestPlaying() === 'yes' && after.every(({ at, beats }) => atStopPoint(at, beats)));
}

async function jumpWhilePlayingStep(run: Session): Promise<void> {
  const current = run.begin('jump-while-playing', 'Jump to Verse while playing');
  await run.waitForMidBar(current, 'Chorus');
  const before = run.latestPosition();
  const barLine = before === undefined ? undefined : nextBarLine(before);
  const sentAt = run.now();
  run.send(abletonosc.jump(CUE.verse));
  // A quarter of a bar later the jump is still waiting for the bar line.
  await run.sleep(msPerBeat(run.latestTempo()));
  const waiting = run.latestPosition();
  current.observations['still in Chorus a beat later'] =
    waiting === undefined || run.positions(sentAt).length === 0 ? UNOBSERVED : yesNo(sectionAt(waiting) === 'Chorus');
  await run.sleep(run.msUntil(barLine));
  const after = run.positions(sentAt);
  const verse = cueTime(CUE.verse);
  const landedAt = after.findIndex(({ beats }) => sectionAt(beats) === 'Verse');
  const landed = after[landedAt];
  current.observations['landed in'] = after.length === 0 ? UNOBSERVED : landed ? 'Verse' : sectionAt(after.at(-1)?.beats ?? 0);
  // On the bar line: the playhead was within a beat of the bar line just before it moved, and
  // came in within a beat of the Verse locator.
  const lastBefore = landedAt > 0 ? after[landedAt - 1]?.beats : before;
  current.observations['landed on the bar line'] =
    !landed || barLine === undefined || lastBefore === undefined
      ? UNOBSERVED
      : yesNo(lastBefore >= barLine - 1 && lastBefore < barLine && landed.beats >= verse && landed.beats < verse + 1);
}

async function secondJumpReplacesStep(run: Session): Promise<void> {
  // A second quantized jump while the first waits: the fake Live replaces the waiting one.
  const current = run.begin(SECOND_JUMP_REPLACES.step, 'Jump to Intro, then to Chorus before the bar line');
  await run.waitForMidBar(current, 'Verse');
  const before = run.latestPosition();
  const barLine = before === undefined ? undefined : nextBarLine(before);
  const sentAt = run.now();
  run.send(abletonosc.jump(CUE.intro));
  await run.sleep(200);
  run.send(abletonosc.jump(CUE.chorus));
  await run.sleep(run.msUntil(barLine));
  const visited = dedupe(run.positions(sentAt).map(({ beats }) => sectionAt(beats)));
  current.observations['sections after the sends'] = visited.length === 0 ? UNOBSERVED : visited;
  current.observations[SECOND_JUMP_REPLACES.observation] =
    visited.length === 0 ? UNOBSERVED : yesNo(JSON.stringify(visited) === JSON.stringify(['Verse', 'Chorus']));
}

async function loopStep(run: Session): Promise<void> {
  const current = run.begin('loop', 'Loop the Tag, then turn the loop off');
  const tag = cueTime(CUE.tag);
  const tagEnd = cueTime(CUE.end);
  const loopAt = run.now();
  run.braceMoved = true;
  for (const message of abletonosc.loopOn(tag, tagEnd - tag)) run.send(message);
  await run.sleep(SETTLE_MS);
  current.observations['loop_start reports on'] = typedValues(run.reportsOn(listenReply('loop_start'), loopAt));
  current.observations['loop_length reports on'] = typedValues(run.reportsOn(listenReply('loop_length'), loopAt));
  current.observations['loop reports on'] = typedValues(run.reportsOn(listenReply('loop'), loopAt));

  await run.waitForMidBar(current);
  run.send(abletonosc.jump(CUE.tag));
  const inTag = await run.waitFor(() => {
    const beats = run.latestPosition();
    return beats !== undefined && sectionAt(beats) === 'Tag';
  }, run.msUntil(tag) + 2000);
  if (inTag) {
    // Two turns of the one-bar loop.
    const watchFrom = run.now();
    await run.sleep(2 * BEATS_PER_BAR * msPerBeat(run.latestTempo()));
    const watched = run.positions(watchFrom);
    current.observations['stayed in the loop'] =
      watched.length === 0 ? UNOBSERVED : yesNo(watched.every(({ beats }) => beats >= tag && beats < tagEnd));
  } else {
    current.notes.push('The playhead never reported a beat in the Tag.');
    current.observations['stayed in the loop'] = UNOBSERVED;
  }

  const offAt = run.now();
  run.send(abletonosc.loopOff());
  const playsOn = await run.waitFor(() => (run.latestPosition() ?? 0) >= tagEnd, 3000);
  await run.sleep(SETTLE_MS);
  current.observations['loop reports off'] = typedValues(run.reportsOn(listenReply('loop'), offAt));
  current.observations['plays on past the loop'] = run.positions(offAt).length === 0 ? UNOBSERVED : yesNo(playsOn);
  // Put the brace back, so a second run in this Live session starts from the test set's.
  for (const message of abletonosc.loopBrace(TEST_SET_LOOP.start, TEST_SET_LOOP.length)) run.send(message);
  run.braceMoved = false;
}

async function stopStep(run: Session): Promise<void> {
  // Where Live leaves the playhead after a stop. The fake Live leaves it where it stopped.
  const current = run.begin(PLAYHEAD_AFTER_STOP.step, 'Stop playing');
  await run.waitForMidBar(current);
  const before = run.latestPosition();
  const sentAt = run.now();
  run.send(abletonosc.stopPlaying());
  run.stopped = true;
  await run.sleep(1000);
  const after = run.latestPosition();
  current.observations['playing'] = run.latestPlaying();
  if (before === undefined || after === undefined) {
    current.observations[PLAYHEAD_AFTER_STOP.observation] = UNOBSERVED;
  } else if (
    Math.abs(after - before) <= STOP_TOLERANCE_BEATS &&
    run.positions(sentAt).every(({ beats }) => Math.abs(beats - before) <= STOP_TOLERANCE_BEATS)
  ) {
    current.observations[PLAYHEAD_AFTER_STOP.observation] = 'at stop point';
  } else {
    const beat = Math.round(after);
    current.observations[PLAYHEAD_AFTER_STOP.observation] = `moved to beat ${beat}`;
    current.observations['section after stop'] = sectionAt(beat);
  }
}

export class PortInUse extends Error {}

function bind(host: string, port: number): Promise<Socket> {
  const socket = createSocket('udp4');
  return new Promise((resolve, reject) => {
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.close();
      reject(error.code === 'EADDRINUSE' ? new PortInUse(`Port ${port} is in use.`) : error);
    });
    socket.bind(port, host, () => {
      socket.removeAllListeners('error');
      socket.on('error', (error) => console.error('Contract check: UDP socket error', error));
      resolve(socket);
    });
  });
}

const sleep = (ms: number, signal?: AbortSignal) => delay(ms, undefined, { signal });

const round = (value: number) => Math.round(value * 1000) / 1000;

// An OSC argument as an observation: a number rounded, a bool as 'true' or 'false', and a missing
// argument as unobserved.
const observedArg = (value: OscArgument | undefined): Value =>
  value === undefined ? UNOBSERVED : typeof value === 'number' ? round(value) : typeof value === 'boolean' ? String(value) : value;

const msPerBeat = (tempo: number) => 60000 / tempo;

// The first bar line after a beat, on a grid of bars from beat 0.
const nextBarLine = (beats: number) => (Math.floor(beats / BEATS_PER_BAR) + 1) * BEATS_PER_BAR;

const yesNo = (value: boolean) => (value ? 'yes' : 'no');

// Reports as type tags and values, one string each, such as 'T true' or 'f 48'.
const typedValues = (reports: Report[]): Value[] =>
  reports.map(({ types, args }) => `${types} ${args.map((arg) => String(observedArg(arg))).join(' ')}`.trim());

function dedupe<T>(values: T[]): T[] {
  return values.filter((value, index) => index === 0 || values[index - 1] !== value);
}

function formatArgs(args: OscArgument[]): string {
  return args.map((arg) => (typeof arg === 'number' ? String(round(arg)) : typeof arg === 'string' ? JSON.stringify(arg) : String(arg))).join(' ');
}

function formatOutArgs(args: OscOutArgument[]): string {
  return args
    .map((arg) => (typeof arg === 'object' ? `${arg.int} (int32)` : typeof arg === 'number' ? `${arg} (float32)` : JSON.stringify(arg)))
    .join(' ');
}
