import { setTimeout as wait } from 'node:timers/promises';
import { loadConnectionsConfig } from '../server/connections-config.ts';
import { eosKind } from '../server/eos.ts';
import { proPresenterKind } from '../server/propresenter.ts';
import { nameKey, namesMatch } from '../shared/match-name.ts';
import { songPresentation } from '../shared/song-presentation.ts';
import { readBuiltSet, type BuiltSong } from './built-set.ts';
import { colourAt, pictureHue } from './colour.ts';
import { connectEos, EOS_PORT, EosNotLive, EosRejected, EosSilent, type Eos, type EosAddress, type EosColour, type EosCue, type EosLimits, type EosTime } from './eos.ts';
import { readLightsConfig, type LightsConfig } from './lights-config.ts';
import { decodePng } from './png.ts';
import { proPresenter, PROPRESENTER_ASKS_AGAIN, PROPRESENTER_PORT, ProPresenterRefused, ProPresenterSilent, type ProPresenter, type ProPresenterAddress } from './propresenter.ts';
import { findSongCues, listed, type SongCue } from './song-cues.ts';
import { makeWeeklyShow, newestWeeklyShow, noTemplateLine, weeklyShowLines } from './weekly-show.ts';

// The lights mode of the set builder, `pnpm build-set --lights`: the lights step for the set built for a date. It reads
// that set's songs, finds or makes the date's weekly show file, and connects to Eos. Only when the show open in Eos is
// the newest weekly show file for the date does it write: each song cue's label becomes its song's title, the colour
// lights in it take the colour of the song's ProPresenter background, and the show is saved. A song owns its chain,
// every cue its song cue runs on into by a follow or a hang: each cue of the chain takes the song's colour too, and
// keeps its label. Each cue no song owns that stands straight after a cue a song owns gets the colour it had back,
// since a colour tracks into the cues after it, so a cue no chain reaches keeps the template's colour wherever it
// stands. A chain that runs on into another song's cue or chain, or by a link out of the cue list, stops the run
// before anything is written (setlist-controller#508, song-cues.ts). A song it can get no colour for, one with no
// picture or no presentation or playlist item of its name in the playlist, keeps the template's colour, the colour
// each of its cues had, recorded into the cue, and its line says why (setlist-controller#502). A playlist it cannot
// choose is a question: it writes nothing and prints the playlists it could mean. A colour channel at intensity 0 in
// a song cue gives a warning line.
// A set with more songs than the cue list has song cues gets, for each song after the last that has one, a copy of
// that song's cue, made with Copy To before any other write and numbered past that song's chain, which is then a song
// cue like any other, with no chain: the follow and the hang Eos copied with it are taken off it. A set with fewer
// leaves the other song cues as they are; and a second run finds each song's cue by its title, copies nothing, and
// leaves the show as the first did (setlist-controller#503, song-cues.ts). Everything that can stop the run comes
// before the one file it may make, and every read of Eos and of ProPresenter before the first write to Eos. It never
// sets an intensity, never sets a channel that is no colour channel, and fires no cue but by going to one.

// What a run of the mode gives the command to print: its lines for stdout, and its one problem line for stderr, with
// exit 1, when the lights step is not done.
export type LightsRun = { lines: string[]; problem?: string };

// What the mode is run with: the date of the set, the output root the set was built under, the show folder, the
// connections config file, the one the server reads, whose "eos" section names Eos and whose "propresenter" section
// names ProPresenter, how long to wait for Eos, how long a request to ProPresenter waits for its answer, how long the
// mode waits before it asks ProPresenter for a picture again, and, with --playlist, the name of the playlist to take
// the songs' colours from.
export type LightsOptions = {
  date: string;
  outputRoot: string;
  showFolder: string;
  connectionsConfig: string;
  limits: EosLimits;
  proPresenterTimeoutMs: number;
  proPresenterAgainMs: number;
  playlist?: string | undefined;
};

// Eos's address and the number of the cue list the song cues are in.
type EosSection = EosAddress & { cueList: number };

const NOT_DONE = 'The lights step is not done:';
// What a run says when it stops once a copy, a label or a colour is in the open show: the mode never saves a show it
// wrote half of. A second run on that show would find its song cues by their titles and go through, and would take
// whatever colour now tracks into a cue as the template's, so the way back is the file as it was.
const CHANGED = 'The open show is changed and not saved: open the weekly show file again without saving, then run the lights step again.';
// How long the mode waits between two reads while a label or a colour has not read back yet.
const READ_BACK_GAP_MS = 100;
// How far from the level sent, of 100, a red, green or blue read back from Eos may be and still be the one sent: Eos
// may keep a level less finely than the float sent, and the levels it has given sit on a grid of a thousandth.
const COLOUR_TOLERANCE = 0.01;
// The two times that make a cue run on, in the order the mode takes them off a copy.
const TIMES: EosTime[] = ['Follow', 'Hang'];

export async function lightsStep({ date, outputRoot, showFolder, connectionsConfig, limits, proPresenterTimeoutMs, proPresenterAgainMs, playlist }: LightsOptions): Promise<LightsRun> {
  // A lights config that is missing or broken is the mode's one problem line, as it is the build's.
  let config: LightsConfig;
  try {
    config = await readLightsConfig();
  } catch (error) {
    return { lines: [], problem: oneLine(error) };
  }
  const set = await readBuiltSet(outputRoot, date);
  if (!set.ok) return { lines: [], problem: `${NOT_DONE} ${set.problem}` };
  const devices = await connectionSections(connectionsConfig);
  if ('problem' in devices) return { lines: [], problem: `${NOT_DONE} the connections config file ${connectionsConfig} ${devices.problem}` };
  const { eos, proPresenter: slides } = devices;
  // The weekly show file for the date: the newest one in the show folder, or, with none, one made now as the build makes
  // it. One made now cannot be the show open in Eos, so the run ends there, with the file to open and no connection.
  let weekly: string;
  try {
    const found = await newestWeeklyShow({ showFolder, config, date });
    if (found === undefined) {
      const made = await makeWeeklyShow({ showFolder, config, date });
      if (made === undefined) return { lines: [], problem: noTemplateLine(showFolder, config.templateShowName) };
      return { lines: weeklyShowLines(made), problem: `${NOT_DONE} the weekly show file for ${date} was made just now, so it is not the show open in Eos. Open it, then run the lights step again.` };
    }
    weekly = found;
  } catch (error) {
    return { lines: [], problem: `${NOT_DONE} the weekly show file for ${date} cannot be found or made in ${showFolder}: ${oneLine(error).replace(/\.$/, '')}.` };
  }
  // The connection is closed on every path, so the command exits. A run that stops on a device that did not answer, or
  // on a command Eos did not take, says so in its one line, and says that the open show is changed once it is.
  let connection: Eos | undefined;
  const progress = { written: false };
  try {
    connection = await connectEos(eos, limits);
    return await writeSongCues(connection, proPresenter(slides, proPresenterTimeoutMs), {
      date,
      weekly,
      songs: set.songs,
      config,
      cueList: eos.cueList,
      limits,
      againMs: proPresenterAgainMs,
      playlist,
      progress,
    });
  } catch (error) {
    const stopped = (problem: string): LightsRun => ({ lines: [], problem: `${NOT_DONE} ${problem}${progress.written ? ` ${CHANGED}` : ''}` });
    if (error instanceof EosSilent) return stopped(`Eos at ${eos.host}:${eos.port} did not answer.`);
    if (error instanceof EosRejected) return stopped(`${error.message}.`);
    if (error instanceof EosNotLive) return stopped(`${error.message}.${progress.written ? '' : ' Put Eos in Live, then run the lights step again.'}`);
    if (error instanceof ProPresenterSilent) return stopped(`ProPresenter at ${slides.host}:${slides.port} did not answer.`);
    if (error instanceof ProPresenterRefused) return stopped(`ProPresenter at ${slides.host}:${slides.port} answered ${error.status} to GET ${error.path}.`);
    throw error;
  } finally {
    connection?.close();
  }
}

// What the mode found for a song. Its colour: the hue of its picture, a whole number of degrees, that hue at the
// configured saturation as the red, green and blue the colour lights take, and the background file the picture came
// from. Or, for a song it can get no colour for, why, as the song's line says it, with the background file when the
// song has a presentation: such a song keeps the template's colour.
type SongColour = { hue: number; colour: EosColour; backgroundFile: string } | { why: string; backgroundFile?: string };

// The mode's conversation with Eos and ProPresenter, once connected to Eos: the checks and the reads, which write
// nothing, then the copies, the labels, the colours and the save.
async function writeSongCues(
  eos: Eos,
  slides: ProPresenter,
  {
    date,
    weekly,
    songs,
    config: { songCueLabel, colourChannels, saturation },
    cueList,
    limits,
    againMs,
    playlist,
    progress,
  }: {
    date: string;
    weekly: string;
    songs: BuiltSong[];
    config: LightsConfig;
    cueList: number;
    limits: EosLimits;
    againMs: number;
    playlist: string | undefined;
    progress: { written: boolean };
  },
): Promise<LightsRun> {
  // Until the show open in Eos is the newest weekly show file for the date, by its whole path, the mode sends reads
  // only: a path that differs in any way is another show, and nothing is written to it.
  const open = await eos.showPath();
  if (open !== weekly) {
    return {
      lines: weeklyShowLines(weekly),
      problem: `${NOT_DONE} the show open in Eos is ${open}, not the weekly show file for ${date}. Open the weekly show file, then run the lights step again.`,
    };
  }
  // The command line must read LIVE: a console left in Blind or in Patch is not one to label cues in or save from. It is
  // checked here, and again straight before the first Go To Cue, the labels, each command line command and the save.
  const live = () => eos.commandLine().startsWith('LIVE');
  const notLive = (): LightsRun => ({
    lines: [],
    problem: `${NOT_DONE} the command line in Eos does not read LIVE, it reads "${eos.commandLine()}". ${progress.written ? CHANGED : 'Put Eos in Live, then run the lights step again.'}`,
  });
  if (!live()) return notLive();
  // What is still left of a write that Eos gives no answer to, read until none is left or the time limit for an answer
  // has passed.
  const leftOf = async <T>(read: () => Promise<T[]>): Promise<T[]> => {
    const until = Date.now() + limits.answerMs;
    let left = await read();
    while (left.length > 0 && Date.now() < until) {
      await wait(READ_BACK_GAP_MS);
      left = await read();
    }
    return left;
  };
  // Each song's cue, by the rules of song-cues.ts: the cue with the song cue label for the song, or the one a run before
  // this one labelled with its title, or, for a song past the last that has one, a copy to make of that song's cue,
  // with the number it takes. Every song's cue is found before anything is written, so a set with a song that can have
  // none leaves the show as it was.
  const cues = await eos.cues(cueList);
  const found = findSongCues(cues, songs, { songCueLabel, cueList });
  if ('problem' in found) return { lines: [], problem: `${NOT_DONE} ${found.problem}` };
  const { songCues: labels, restore } = found;
  const copies = labels.flatMap(({ song, cue, copyOf }) => (copyOf === undefined ? [] : [{ song, cue, copyOf }]));

  // ProPresenter, read whole before Eos is sent anything but a read: a Go To Cue moves the live look, and none is sent
  // until both devices have answered.
  const colours = await songColours(slides, songs, { date, saturation, againMs, playlist });
  if ('problem' in colours) return { lines: colours.lines, problem: `${NOT_DONE} ${colours.problem}` };

  // Colour tracks forward in Eos, so a song's colour would show in the cue after each cue the song owns, its song cue
  // and its chain. Each restore cue, a cue no song owns that stands straight after an owned cue in the list as it will
  // stand, gets the colour it has now recorded back into it. So that colour is read first, with no writes, and the
  // colour of each song cue the show holds and of each cue of its chain with it: the mode goes to the cue and reads each
  // colour channel. A Go To Cue in no time starts no follow and no hang (chain-go-to-cue-follow.json,
  // chain-go-to-cue-hang.json), so going to a cue of a chain fires no other cue. The same read gives each channel's
  // intensity. A copy is not in the show yet, and reads as the cue it copies, so its colours and intensities at the
  // start are that cue's.
  if (!live()) return notLive();
  const template = new Map<string, Map<number, { intensity: number | undefined; colour: EosColour }>>();
  for (const cue of [...labels.flatMap(({ cue, chain, copyOf }) => (copyOf === undefined ? [cue, ...chain] : [])), ...restore]) {
    await eos.goToCue(cueList, cue);
    const held = new Map<number, { intensity: number | undefined; colour: EosColour }>();
    for (const channel of colourChannels) {
      const { intensity, colour } = await eos.channel(channel);
      if (colour === undefined) {
        return { lines: [], problem: `${NOT_DONE} channel ${channel} has no red, green and blue in Eos, so it is no colour light. Check colourChannels in config/lights.json.` };
      }
      held.set(channel, { intensity, colour });
    }
    template.set(cue, held);
  }
  for (const { cue, copyOf } of copies) template.set(cue, template.get(copyOf.cue)!);
  // A colour channel at intensity 0 in a song cue shows no colour there, so it gives a warning for the summary, in the
  // order of the songs and then of the colour channels. A cue of a chain gives none, since a build or a hit can hold a
  // colour light at 0 on purpose, and neither does a restore cue.
  const warnings = labels.flatMap(({ song, cue }) =>
    colourChannels
      .filter((channel) => template.get(cue)!.get(channel)!.intensity === 0)
      .map((channel) => `Warning: channel ${channel} is at intensity 0 in cue ${cueList}/${cue} (song ${song.position}, ${song.title}), so the song's colour will not show on it.`),
  );

  // The copies, the first writes: each extra song's cue is made with Copy To, in set order, so every song has a cue
  // before a label or a colour is written. A Copy To that Eos rejected, or that was not sent, changed nothing; from the
  // first one Eos took, or did not answer, the open show is changed. Then the cue list is read again until each copy
  // is in it. Eos gives a copy its source's follow (chain-copy-to-follow.json), and a copy that ran on would fire the
  // cue after it during its song, so each follow and each hang the read shows on a copy is taken off, with Follow or
  // Hang and no time, and the cue list is read until no copy holds one. A copy that holds neither is sent nothing, and
  // a copy keeps its link, which fires nothing with no follow and no hang: no recording holds a command that takes a
  // link off. All of it comes before the first label.
  if (!live()) return notLive();
  for (const { cue, copyOf } of copies) {
    try {
      await eos.copyCue(cueList, copyOf.cue, cue);
    } catch (error) {
      if (error instanceof EosSilent) progress.written = true;
      throw error;
    }
    progress.written = true;
  }
  // Each follow and each hang this run took off a copy, in the order it was taken off, for the summary.
  let takenOff: { cue: string; copyOf: SongCue; time: EosTime }[] = [];
  if (copies.length > 0) {
    let read: EosCue[] = [];
    const notMade = await leftOf(async () => {
      read = await eos.cues(cueList);
      return copies.filter(({ cue }) => !read.some(({ number }) => number === cue));
    });
    if (notMade.length > 0) {
      const named = notMade.map(({ cue, copyOf }) => `cue ${cueList}/${cue}, the copy of cue ${cueList}/${copyOf.cue}`);
      return { lines: [], problem: `${NOT_DONE} Eos did not make ${listed(named, 'and')}. ${CHANGED}` };
    }
    // The follow and the hang each copy holds in that read of the cue list, the copies in set order.
    const timesOf = (cues: EosCue[]) =>
      copies.flatMap(({ cue, copyOf }) => {
        const copy = cues.find(({ number }) => number === cue);
        return TIMES.filter((time) => copy?.[time === 'Follow' ? 'follow' : 'hang']).map((time) => ({ cue, copyOf, time }));
      });
    takenOff = timesOf(read);
    for (const { cue, time } of takenOff) await eos.takeOff(cueList, cue, time);
    const kept = takenOff.length === 0 ? [] : await leftOf(async () => timesOf(await eos.cues(cueList)));
    if (kept.length > 0) {
      const named = kept.map(({ cue, copyOf, time }) => `the ${time.toLowerCase()} of cue ${cueList}/${cue}, the copy of cue ${cueList}/${copyOf.cue}`);
      return { lines: [], problem: `${NOT_DONE} Eos did not take off ${listed(named, 'and')}. ${CHANGED}` };
    }
  }

  // The labels: each song cue takes its song's title, as the set holds it, a copy among them. Eos gives a label set no
  // direct answer, so the cue list is read again until each song cue reads back its title, and no colour is recorded
  // before.
  if (!live()) return notLive();
  progress.written = true;
  for (const { song, cue } of labels) eos.setLabel(cueList, cue, song.title);
  const unlabelled = await leftOf(async () => {
    const read = await eos.cues(cueList);
    return labels.filter(({ song, cue }) => read.find(({ number }) => number === cue)?.label !== song.title);
  });
  if (unlabelled.length > 0) {
    const named = unlabelled.map(({ song, cue }) => `cue ${cueList}/${cue} (${song.title})`);
    return { lines: [], problem: `${NOT_DONE} Eos did not take the label of ${listed(named, 'and')}, so the show is not saved.${copies.length > 0 ? ` ${CHANGED}` : ''}` };
  }

  // The colours: the mode goes to the cue, sets each colour channel through the parameter address, and records those
  // channels alone into the cue with Record Only. Eos gives a colour set no answer, and a Record Only sent before the
  // colour is live would record the old one, so each channel is read until it reads what was sent, to within
  // COLOUR_TOLERANCE. Gives the channels that never did, or none once the cue is recorded.
  const record = async (cue: string, colourOf: (channel: number) => EosColour): Promise<number[]> => {
    await eos.goToCue(cueList, cue);
    for (const channel of colourChannels) eos.setColour(channel, colourOf(channel));
    const not = await leftOf(async () => {
      const unset: number[] = [];
      for (const channel of colourChannels) {
        const { colour } = await eos.channel(channel);
        if (!colourOf(channel).every((part, at) => Math.abs(part - (colour?.[at] ?? NaN)) <= COLOUR_TOLERANCE)) unset.push(channel);
      }
      return unset;
    });
    if (not.length === 0) await eos.recordOnly(colourChannels, cueList, cue);
    return not;
  };
  // Each song cue, a copy among them, and each cue of its chain takes its song's colour on every colour channel, the
  // songs in set order, a song cue and then its chain in the order Eos fires it. A song with none keeps the template's
  // colour: each of its cues takes, on each colour channel, the colour read from that channel in it at the start, for a
  // copy the one read in the cue it copies, recorded into it, since a cue that holds no colour of its own would track
  // the colour of the song before it. Last, each restore cue, in list order, takes the colour read from each channel
  // in it the same way. A Record Only into a cue with a follow fires nothing (chain-record-only-follow.json).
  const held = (cue: string) => (channel: number) => template.get(cue)!.get(channel)!.colour;
  const recordings: { cue: string; colourOf: (channel: number) => EosColour }[] = labels.flatMap(({ cue, chain }, at) => {
    const found = colours[at]!;
    return [cue, ...chain].map((owned) => ({ cue: owned, colourOf: 'colour' in found ? () => found.colour : held(owned) }));
  });
  for (const cue of restore) recordings.push({ cue, colourOf: held(cue) });
  for (const { cue, colourOf } of recordings) {
    const not = await record(cue, colourOf);
    if (not.length > 0) {
      return { lines: [], problem: `${NOT_DONE} Eos did not take the colour of ${not.length === 1 ? 'channel' : 'channels'} ${listed(not.map(String), 'and')} for cue ${cueList}/${cue}. ${CHANGED}` };
    }
  }

  // The save, and the summary: each song with its cue, and its colour as hue and as red, green and blue with the
  // background file the colour came from, or "template colour" and why; then each cue of a chain with the song cue and
  // the song it belongs to; then each copy made in this run with the cue it copies, and after it the follow or the hang
  // taken off it; then the warnings; then the show file the save made, which Eos names only in the show path read after
  // its saved event. A show with no chain prints no line for one. A warning never stops the run and never sets exit 1.
  // From here the labels and the colours are in the open show, so a run that stops says so.
  const file = (backgroundFile: string) => (backgroundFile === '' ? '(no label)' : backgroundFile);
  const songLines = labels.map(({ song, cue }, at) => {
    const found = colours[at]!;
    const start = `${song.position}. ${song.title}  cue ${cueList}/${cue}`;
    if (!('colour' in found)) return `${start}  template colour  ${[found.why, ...(found.backgroundFile === undefined ? [] : [file(found.backgroundFile)])].join(', ')}`;
    const [red, green, blue] = found.colour.map(Math.round);
    return `${start}  hue ${found.hue}, red ${red} green ${green} blue ${blue}  ${file(found.backgroundFile)}`;
  });
  const chainLines = labels.flatMap(({ song, cue, chain }) =>
    chain.map((owned) => `Cue ${cueList}/${owned} is in the chain of cue ${cueList}/${cue} (song ${song.position}, ${song.title}), and is coloured as that song is.`),
  );
  const copyLines = copies.flatMap(({ song, cue, copyOf }) => {
    const times = takenOff.filter((taken) => taken.cue === cue).map(({ time }) => `the ${time.toLowerCase()}`);
    return [
      `Cue ${cueList}/${cue} (song ${song.position}, ${song.title}) is a copy of cue ${cueList}/${copyOf.cue} (song ${copyOf.song.position}, ${copyOf.song.title}).`,
      ...(times.length === 0 ? [] : [`Cue ${cueList}/${cue} does not keep ${listed(times, 'and')} of cue ${cueList}/${copyOf.cue}: the lights step took ${times.length === 1 ? 'it' : 'them'} off.`]),
    ];
  });
  const lines = [...songLines, ...chainLines, ...copyLines, ...warnings];
  const unsaved = (why: string): LightsRun => ({ lines, problem: `${NOT_DONE} the song cues are labelled and coloured in the open show, but ${why}. Save the show by hand in ETCnomad.` });
  if (!live()) return unsaved(`the command line in Eos no longer reads LIVE, it reads "${eos.commandLine()}", so the show is not saved`);
  if (!(await eos.save())) return unsaved('Eos did not say it saved the show');
  return { lines: [...lines, await eos.showPath()] };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// What the mode found for each song, in set order, read from ProPresenter; or, for a playlist it cannot choose, the
// reason as a sentence and the lines that list the playlists it could mean. The playlist is the one whose name holds
// the date of the set written as "November 15, 2026", compared under the shared name rule, or with --playlist the one
// of that whole name under that rule. Song n's presentation is the one the shared rule finds among those the playlist
// links (song-presentation.ts): the first whose own name matches the song's title, else the first whose playlist
// item's name, less its arrangement, does. Its colour is the hue of the picture of its first cue, at the configured
// saturation. A song with no presentation or playlist item of its name in the playlist, and one whose presentation
// gives no picture, has no colour, and neither stops the run or another song.
async function songColours(
  slides: ProPresenter,
  songs: BuiltSong[],
  { date, saturation, againMs, playlist: named }: { date: string; saturation: number; againMs: number; playlist: string | undefined },
): Promise<SongColour[] | { problem: string; lines: string[] }> {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const written = `${MONTHS[month - 1]} ${day}, ${year}`;
  // The playlists the run could mean: with --playlist, each whose whole name is the one given, and the date is not
  // looked for; else each whose name holds the date. Exactly one is the playlist. None, or more than one, is a question
  // the mode does not answer by guessing: it gives the playlists it could mean, every playlist when none matched, each
  // as the flag to type, before any playlist's items are read.
  const all = await slides.playlists();
  const meant = all.filter(({ name }) => (named === undefined ? nameKey(name).includes(nameKey(written)) : namesMatch(name, named)));
  const [playlist] = meant;
  if (playlist === undefined || meant.length > 1) {
    const which = named === undefined ? `with "${written}" in its name` : `named "${named}"`;
    const next = named !== undefined && meant.length > 1 ? 'Rename one in ProPresenter, then run the lights step again.' : 'Run the lights step again with --playlist and the name of the one to use.';
    return {
      problem: `ProPresenter has ${playlist === undefined ? 'no' : 'more than one'} playlist ${which}. ${next}`,
      lines: (playlist === undefined ? all : meant).map(({ name }) => `--playlist "${name}"`),
    };
  }
  // Every presentation the playlist links is read. One whose read is no 200 matches no song.
  const presentations: { uuid: string; name: string; item: string; backgroundFile: string }[] = [];
  const unread: string[] = [];
  for (const { item, uuid } of await slides.linked(playlist.uuid)) {
    const { status, name, backgroundFile = '' } = await slides.presentation(uuid);
    if (status === 200 && name !== undefined) presentations.push({ uuid, name, item, backgroundFile });
    else unread.push(`"${item}" (${status})`);
  }
  // A song with no presentation or playlist item of its name in the playlist keeps the template's colour, and the others
  // are not stopped by it. Its reason names each linked presentation ProPresenter did not give, since one of them may
  // be the song's.
  const unlinked = `no presentation or playlist item of its name in the playlist "${playlist.name}"${unread.length === 0 ? '' : `, and ProPresenter did not give the presentation of ${listed(unread, 'and')}`}`;
  // One answer to a request for the picture of a presentation's first cue: its hue, or why it gives none. A status that
  // is no 200 is a picture ProPresenter refused, as it refuses one of a presentation this Mac is not authorized for;
  // bytes the decoder cannot read are a picture that cannot be read; and a picture with no opaque pixel or no colour is
  // no picture, as the grey placeholder and a slide with no background are.
  const answer = async (uuid: string): Promise<{ hue: number } | { why: string }> => {
    const { status, png } = await slides.thumbnail(uuid);
    if (png === undefined) return { why: `ProPresenter refused the picture (${status})` };
    let hue: number | undefined;
    try {
      hue = pictureHue(decodePng(png).rgba);
    } catch {
      return { why: 'the picture cannot be read' };
    }
    return hue === undefined ? { why: 'no picture' } : { hue };
  };
  // The hue of the picture of a presentation's first cue, or why it has none. An answer that gives none is asked again
  // after `againMs`, up to PROPRESENTER_ASKS_AGAIN more times, whatever it is, since the placeholder cannot be told from
  // a slide with no background and a first request has answered 500. The first answer with a hue is taken, and with
  // none the reason is the last answer's. The count bounds the asks, not the clock, so a slow machine cannot turn the
  // placeholder and then the picture into no picture. A ProPresenter that does not answer at all still stops the run.
  const pictureOf = async (uuid: string): Promise<{ hue: number } | { why: string }> => {
    let given = await answer(uuid);
    for (let again = 0; again < PROPRESENTER_ASKS_AGAIN && !('hue' in given); again += 1) {
      await wait(againMs);
      given = await answer(uuid);
    }
    return given;
  };
  // The songs are asked one after another, so ProPresenter gets the same requests in the same order on every run.
  const colours: SongColour[] = [];
  for (const song of songs) {
    const presentation = songPresentation(song.title, presentations);
    if (presentation === undefined) {
      colours.push({ why: unlinked });
      continue;
    }
    const { uuid, backgroundFile } = presentation;
    const picture = await pictureOf(uuid);
    colours.push('hue' in picture ? { hue: picture.hue, colour: colourAt(picture.hue, saturation), backgroundFile } : { why: picture.why, backgroundFile });
  }
  return colours;
}

// An error's message on one line, for a problem line that keeps its cause.
function oneLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ');
}

// Eos's address and cue list, from the "eos" section of the connections config file, and ProPresenter's address, from
// its "propresenter" section, or why the file does not give one of the two, Eos first, to follow the file's path in a
// problem line. The file is read by the server's own reader, with the server's own check of each section, so a section
// the server takes is one the mode takes, and one it rejects is rejected here in the server's sentences. Building the
// server's targets for the check opens no connection and reads no file: ProPresenter's state path is never used. The
// file's other sections are no concern of the mode's: they come back as kinds this reader does not know, and are left
// alone.
async function connectionSections(path: string): Promise<{ eos: EosSection; proPresenter: ProPresenterAddress } | { problem: string }> {
  const lights = eosKind();
  const slides = proPresenterKind({ statePath: '' });
  let eos: EosSection | undefined;
  let proPresenter: ProPresenterAddress | undefined;
  const config = await loadConnectionsConfig(path, {
    eos: {
      label: lights.label,
      create(section) {
        const made = lights.create(section);
        if ('target' in made) eos = { host: section.host as string, port: (section.port as number | undefined) ?? EOS_PORT, cueList: section.cueList as number };
        return made;
      },
    },
    propresenter: {
      label: slides.label,
      create(section) {
        const made = slides.create(section);
        if ('target' in made) proPresenter = { host: (section.host as string).trim(), port: (section.port as number | undefined) ?? PROPRESENTER_PORT };
        return made;
      },
    },
  });
  const why = (name: string): string => {
    if (config.config === 'missing') return 'the file is not there.';
    if (config.config === 'invalid') return oneLine(config.problems.join(' '));
    const section = config.targets.find((target) => target.kind === 'disabled' && target.name === name);
    return section?.kind === 'disabled' ? section.problems.join(' ') : `it has no "${name}" section under "targets".`;
  };
  if (eos === undefined) return { problem: `names no Eos to connect to: ${why('eos')}` };
  if (proPresenter === undefined) return { problem: `names no ProPresenter to connect to: ${why('propresenter')}` };
  return { eos, proPresenter };
}
