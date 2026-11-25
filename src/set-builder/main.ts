import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { APP_SUPPORT } from '../server/app-support.ts';
import { SET_MANIFEST_FILE } from '../shared/set-manifest.ts';
import { valueOf } from './als.ts';
import { buildSet, setFolder, setName, setProblems, type SongSummary, type StemMap, type SummaryTransition, type Transition } from './build-set.ts';
import { editSet, EDIT_USAGE, type EditAction } from './edit-set.ts';
import { matchSongs, TEMPLATE_FOLDER } from './library.ts';
import { EOS_LIMITS, type EosLimits } from './eos.ts';
import { lightsStep } from './lights.ts';
import { PROPRESENTER_AGAIN_MS, PROPRESENTER_TIMEOUT_MS } from './propresenter.ts';
import { readLightsConfig, type LightsConfig } from './lights-config.ts';
import { isKey, KEY_GRAMMAR } from './pads.ts';
import { pickFolders, planFolders, type FolderPick } from './plan-folders.ts';
import { existingSetLine, listingHasProblems, planListing } from './plan-list.ts';
import { API_BASE, readPlan, readToken, tokenFilePath, type Plan, type PlanSong } from './plan-reader.ts';
import { chartWarnings, planWarnings, startingMeter } from './plan-warnings.ts';
import { transitionsWithFlags, type FlagTransition } from './plan-transitions.ts';
import { DEFAULT_STEM_MAP_PATH, readStemMapFile, updateRecipe } from './recipe.ts';
import { defaultSetDate } from './set-date.ts';
import { buildManifest, writeSetManifest } from './set-manifest.ts';
import { leftOutNote, skeletonLines, songSkeleton } from './skeleton.ts';
import { readSong } from './song.ts';
import { listSongs, songLine } from './song-list.ts';
import { makeWeeklyShow, noTemplateLine, weeklyShowLines } from './weekly-show.ts';

// `pnpm build-set`: builds the Sunday set from the song library, the songs end to end in the order named. A
// thin wrapper over buildSet, which holds every rule; the command works out the default date and prints the
// summary or the problems. After a set is built, it makes that Sunday's weekly show file for the lights, by the rules
// of weekly-show.ts. Its lights mode, --lights, builds nothing: it runs the lights step of lights.ts for a set already
// built, and prints its lines or its one problem.

const USAGE = `Usage:
  pnpm build-set <song> [<song> ...] [--overlap <n> ...] [--gap <n> ...] [--pad <n>[=<key>] ...] [--pads <folder>] [--date YYYY-MM-DD] [--replace <set folder>] [--library <folder>] [--template <set.als>] [--output-root <folder>] [--set-manifest <path>] [--show-folder <folder>]
  pnpm build-set --plan [--service-type <name or id>] [--plan-id <id>] [--overlap <n> ...] [--gap <n> ...] [--pad <n>[=<key>] ...] [--pads <folder>] [--date YYYY-MM-DD] [--replace <set folder>] [--library <folder>] [--template <set.als>] [--output-root <folder>] [--set-manifest <path>] [--show-folder <folder>]
  pnpm build-set --list [--library <folder>] [--pads <folder>] [--date YYYY-MM-DD] [--replace <set folder>] [--output-root <folder>]
  pnpm build-set --plan --list [--service-type <name or id>] [--plan-id <id>] [--overlap <n> ...] [--gap <n> ...] [--pad <n>[=<key>] ...] [--pads <folder>] [--date YYYY-MM-DD] [--replace <set folder>] [--library <folder>] [--template <set.als>] [--output-root <folder>]
  pnpm build-set --skeleton <song> [<song> ...] [--library <folder>] [--pads <folder>]
  pnpm build-set --plan --skeleton [--service-type <name or id>] [--plan-id <id>] [--date YYYY-MM-DD] [--library <folder>] [--pads <folder>]
  pnpm build-set --lights [--date YYYY-MM-DD] [--output-root <folder>] [--show-folder <folder>] [--connections-config <path>] [--playlist <name>]
  pnpm build-set edit [<set folder>] [--date YYYY-MM-DD] [--output-root <folder>] (--swap <song> <replacement> | --add <song> [--at <pos>] | --drop <song>)

Name the songs in service order. A song is any part of its folder name in the library, in any letter case, that
names that one folder: "grace" for "This Is Amazing Grace-The Ascension-D-98.00bpm". A song's whole folder name, in
any letter case, names that folder even when longer folder names hold it, as a Finder copy's does.
--plan takes the songs from the Planning Center plan for the set's date instead, in plan order, and a song name
beside it is a usage error. Each plan song's folder is the one whose title, the part of its name before the first
hyphen, is the song's title, and whose key is the plan's key for it. A plan key in lower case reads as its note name,
e as E, and a key change as the key before its first hyphen, G-A as G; a plan key that is still no note name stops
the build. Titles match trimmed, with each run of spaces as one, in any letter case. A song with no such folder, no
key in the plan, or two such folders stops the build, and every song's problem is printed.
The plan gives each song change its transition. An item titled Prayer that is the next item after a song, headers
left out, puts a pad after that song in the next song's key, and after the last song in its own key. A note on a song
whose whole text is overlap overlaps it into the next song. Every other song change is a gap. A transition flag for a
song replaces what the plan gives the song change after it.
--service-type names the plan's service type by its name or its id, and defaults to Service. --plan-id names the plan
by its id when the service type has more than one plan on the date. --service-type and --plan-id need --plan.
--plan reads the plan with the Planning Center personal access token in ~/.config/setlist-controller/pco.env, or in
the file PCO_ENV names, as two lines: PCO_CLIENT_ID=<client id> and PCO_SECRET=<secret>. A value may sit in single
or double quotes, and a line may start with export. Outside quotes, a # after a space or a tab starts a comment, and
so does a # at the start of a line. PCO_ENV may start with ~/ for your home folder. The command refuses the file
when its group or other users can read it, and chmod 600 <file> fixes that. The token never goes on the command
line.
Build while the Mac is on the internet, before it joins the stage network.
--plan --list warns, after the songs, for a song whose arrangement has no chart text in Planning Center, and for chart
text with no chords in square brackets.
A plan build's summary and --plan --list warn, after the songs, when the plan's BPM for a song differs from the BPM
its folder name writes, or the plan's meter from the meter the song starts in. A warning never stops the build.
--overlap n overlaps song n into the next one: the next song's Count Off starts on song n's Ending, where song n's
click and guide stop. Its other stems ring on and fade out over the first 2 bars of the next song's Intro, the first
section after its Count Off, and a stem that ends before then keeps its own end. n counts the songs from 1. Give it
once for each song to overlap.
--pad n puts a pad after song n: the pad file in the next song's key plays on the template's PAD track from song n's
Ending, under its last bars, through a 60-second Pad section after its audio ends, with the click at the next song's
tempo, in whole bars, and the next song's Count Off starts at its end. The pad comes in with the file's own swell,
played from late enough in the file that the swell ends where the Pad section starts, keeps sounding under the next
song's Count Off, and fades out over the first 2 bars of its Intro, all in one clip. Song n must have a locator named
Ending, and the pad file must last past the clip's end by 20 seconds, the file's own fade-out. n counts the songs from
1. Give it once for each pad. One song takes one of --overlap, --pad and --gap. Every other song is followed by a
4-bar gap.
--pad n=<key> gives the pad its own key instead: --pad 2=G. A key is a note name, A to G, then # or b, then m for
minor: G, F#, Bb, Em. A minor key plays its root's pad (Am plays A.wav), and C# and Db, D# and Eb, F# and Gb, G# and
Ab, A# and Bb are one key, for a song's key and a pad file's name too.
--pad on the last song puts the pad after it, in its own key, with the click back at its starting tempo and meter. It
starts on the song's Ending like any pad. After its 60-second Pad section, a Pad Out section fades it out over 4 bars,
and Live stops at its end, so a loop on the Pad holds no fade.
--gap n makes the song change after song n a gap, to take back a pad or an overlap the plan gives it. n counts the
songs from 1, and n may be the last song, to take back a pad after it. Without --plan it changes nothing, since a
song with no other transition is followed by a gap.
--pads defaults to <library>/_pads, the folder of pad files, one WAV per key named by its key: A.wav.
--date defaults to today when today is Sunday, otherwise the coming Sunday.
--replace <set folder> replaces the set folder for the date when it already exists; without it, the build stops. Its
value is that set folder, <output root>/<date> <weekday>, as the last line of --list and --plan --list prints it, and
a relative one resolves as --output-root does. A --replace that names any other folder, or a second --replace, is a
usage error, for the build, --list and --plan --list alike.
--library defaults to ~/Music/MultiTracks, --template to <library>/_template/template Project/template.als,
and --output-root to ~/Music/Ableton/Sets. The set is written to <output root>/<date> <weekday>/<date> <weekday>.als,
such as 2026-10-18 Sunday.
Every build writes the set manifest to --set-manifest <path>, by default
~/Library/Application Support/setlist-controller/set-manifest.json, the server's own default, replacing the last one:
each song's title, the key of its stems from its folder name, its starting meter, and with --plan its chart key and
chart text from its arrangement in Planning Center. A build by song names writes no chart key and no chart text. A build with a problem
writes no manifest. A relative path resolves as --output-root does.
After the set, every build makes the weekly show file for the lights in the show folder: a copy of the newest template
show file there, named <weekly show name prefix> <date> <time of the copy>.esf3d. Eos names each save of a show
<show name> <YYYY-MM-DD HH-MM-SS>.esf3d and keeps every save as its own file, so the newest is the one with the latest
time in its name. The template show name and the weekly show name prefix come from config/lights.json in this
repository. --show-folder <folder> names the show folder, by default ~/Documents/ETC, Eos's own, and a relative one
resolves as --output-root does. After the summary, the build prints the path of the weekly show file and the three steps
that open it in ETCnomad: File, Open; the file; OK. With no template show file in the show folder, the set is still
built, exit 0, and one line after the summary says the lights step is not done, with the folder and the show name it
looked for. The build never replaces or deletes a file in the show folder: a rebuild with --replace makes a newer weekly
show file and leaves the older one. A build with a problem makes no weekly show file, and neither do --list,
--plan --list and --skeleton, which take no --show-folder. The build talks to no Eos.
--lights runs the lights step for the set built for the date, and builds nothing: it labels each song cue of the weekly
show file open in Eos with its song's title, gives the colour lights in it the colour of the song's ProPresenter
background, and saves the show. It reads the songs, in order, from the set built for the date under the output root, the
song cue label, the colour channels and the saturation from config/lights.json, and Eos's address and cue list from the
eos section, and ProPresenter's address from the propresenter section, of the connections config, the file the server
reads: --connections-config <path>, by default ~/Library/Application Support/setlist-controller/connections.json, and a
relative one resolves as --output-root does. It writes to Eos only when the show open in Eos is the newest weekly show
file for the date in the show folder, and only while the command line reads LIVE. Song n's cue is the first cue of the
cue list labelled as the song cue label gives it for n, Song 1 for "Song {n}", trimmed, with each run of spaces as one,
in any letter case, or, with none, the first cue labelled with the song's title, as a run before this one left it. A
song owns its chain: every cue its song cue runs on into by a follow or a hang, cue after cue, by its link or with none
into the next cue of the cue list. A link with no follow and no hang runs on into nothing. A set with more songs than
the cue list has song cues gets, for each song after the last that has one, a copy of that song's cue, made with Copy To
before anything else is written, numbered after that cue and every cue of its chain, and before the next cue: the next
whole number when it is free, otherwise a decimal between the two. A follow or a hang Eos copies with the cue is taken
off the copy, so the copy runs on into nothing. A set with fewer songs leaves the other song cues as they are. A second
run on the same weekly show file copies nothing and leaves the show as the first did. Song n's colour comes from the one
ProPresenter playlist whose name holds the date of the set, written as November 15, 2026, or with --playlist <name> from
the one playlist of that whole name, by the same rule: from the picture of the first cue of the song's presentation in
it: the first presentation it links whose own name is the song's title, by the same rule, or, with none, the first whose
playlist item's name is the song's title, less a Planning Center arrangement such as " - [ Full ]". A presentation whose
own name is not the song's title, as a Planning Center import names one for its recording, "<title> (Live)", matches
once its playlist item is renamed to the song's title in ProPresenter. With no playlist for the date or more than one,
or with --playlist and no playlist of that name or more than one, nothing is written to Eos, the playlists it could mean
are printed, one a line, each as --playlist "<name>", and one line on stderr says why, exit 1. The colour is the hue of
the most saturated of the picture's large areas that are not near black, never its mean, at the saturation of
config/lights.json and full brightness. There is no picture when it has no opaque pixel, when it has no large area that
is not near black, when the most saturated of those areas is under 5% saturation, as ProPresenter's grey placeholder and
a slide with no background are, when ProPresenter refuses it, or when it cannot be read. ProPresenter gives the
placeholder for a picture it has not drawn yet, so the mode asks for a picture it did not get again, once a second, up
to 5 times, and takes the first it gets. A song that still has no picture, and a song with no presentation or playlist
item of its name in the playlist, keeps the template's colour: on each colour channel the colour its song cue had,
recorded into the cue so the colour of the song before it does not track into it. Each song cue's label becomes its
song's title, as the set holds it, and its colour channels take the song's colour, recorded into the cue with Record
Only, and into each cue of its chain, which keeps its label. For a song that keeps the template's colour, each cue of
its chain keeps the colour it had. Each cue no chain holds that stands straight after one of a song's cues gets the
colour it had recorded back into it, since a colour tracks into the cues after it, so a cue no chain reaches keeps the
template's colour. Then the show is saved, as Shift and Update save it at the keypad. It prints one line per song, its
number, its title, its cue, and its colour as hue and as red, green and blue with the background file the colour came
from, or template colour and why; then one line for each cue of a chain, with the song it belongs to; then one line for
each cue it copied, with the cue it is a copy of, and one more when a follow or a hang was taken off the copy; then one
warning line for each colour channel at intensity 0 in a song cue, where the colour will not show; and last the path of
the show file the save made. A warning never stops the run. It sets no intensity and no channel but the colour channels.
When the lights step is not done, one line on stderr says why, exit 1. Nothing is written to Eos with no set built for
the date, a connections config that names no Eos or no ProPresenter, Eos or ProPresenter not answering, another show
open in Eos, a command line that does not read LIVE, no cue for song 1 or for a song before one that has a cue, a chain
that runs on into another song's cue, into a cue of another song's chain or by a link to no cue of the cue list, no cue
number free for a copy, or a playlist the mode cannot choose. With another show open, the weekly show file and the three
steps that open it are printed too. With no weekly show file for the date, --lights makes one from the template show
file, as a build does, prints it and the three steps, and stops there, since a file made just now is not the show open
in Eos. When Eos sends no saved event, the song cues are labelled and coloured in the open show, and the line says to
save the show by hand. When the run stops after it began to write, the line says that the open show is changed and not
saved: open the weekly show file again without saving, then run the lights step again. --lights takes no song name, and
no flag but --date, --output-root, --show-folder, --connections-config and --playlist. --connections-config and
--playlist need --lights.
--list prints each song folder in the library on its own line, in the order the build matches them: a short name that
names that one folder, in quotes when it holds anything but lowercase letters and digits, the song's key as its folder
name writes it (Em stays Em), or "no key" when the name has no key that is a note name, and the folder name. "no key"
means a pad cannot take its key from that song by default. _template, _pads and a --pads folder in the library are no
song folders. --list reads folder names only and writes nothing. When the set folder for the date already exists under
the output root, a last line after the songs says so, as --plan --list says it: "<folder> already exists. The build
stops on it unless --replace "<folder>" replaces it.", or with --replace, "<folder> already exists, and --replace
replaces it." That line never sets exit 1. It takes no song name, and no flag but --library, --pads, --date, --replace
and --output-root.
--plan --list prints what the plan resolves to and writes nothing: the set's name, then each plan song on its own
line with its key in the plan, or "no key", its folder or the problem that leaves it none, and the transition after
it with where it comes from (the default, the plan, or the flag that gives it) or its problem, then each item that is
no song, from the first song on, with what it does to the set, then the warnings. When the set folder for the date
already exists under the output root, a last line says so: "<folder> already exists. The build stops on it unless
--replace "<folder>" replaces it.", or with --replace, "<folder> already exists, and --replace replaces it." That line
never sets exit 1. It exits 1 when a song or a song change has a problem. When none has, it runs the build's own
checks on the songs' folders, with the template, stem map, transitions and pads folder the build would use, prints
each problem the build would stop on, on stderr after the listing, and exits 1. --plan --list takes no song name, and
no flag but --library, --pads, --template, --date, --service-type, --plan-id, --overlap, --pad, --gap, --replace and
--output-root.
--skeleton prints each song's chart skeleton, for the songs named, or for the plan's songs with --plan, and writes
nothing: a line with the song's number and title, then each locator name of its Live set as a chord chart heading, in
upper case, once, in the order first played, with a blank line between songs. Paste each song's headings into its
arrangement's chord chart in Planning Center. Count Off and a blank locator are left out. A locator name that is no
section word with an optional number, such as Outro, is left out too, and a note on stderr names it; a note never sets
exit 1. A song that has no folder, cannot be read or has no locators prints its problem on stderr after the skeletons,
exit 1. --skeleton takes no flag but --library and --pads, and --plan --skeleton adds --date, --service-type and
--plan-id.`;

function usage(problem: string): never {
  console.error(`${problem}\n\n${USAGE}`);
  process.exit(2);
}

// The command's flags. --list takes only those of LIST_OPTIONS beside it, and --plan --list only those of
// PLAN_LIST_OPTIONS; every other one is a build's alone. Both take --date, --output-root and --replace, so they look for
// the set folder the build would write and say whether --replace, which names that set folder, replaces it.
// --show-folder is a build's and the lights mode's, and comes after every flag before it, as --lights,
// --connections-config and --playlist come last, so each mode's "takes only" line still names the same flag for every
// command it stopped before (the first in this order). --lights takes only those of LIGHTS_OPTIONS beside it.
const OPTIONS = {
  overlap: { type: 'string', multiple: true },
  pad: { type: 'string', multiple: true },
  gap: { type: 'string', multiple: true },
  pads: { type: 'string' },
  date: { type: 'string' },
  replace: { type: 'string', multiple: true },
  library: { type: 'string' },
  template: { type: 'string' },
  'output-root': { type: 'string' },
  'set-manifest': { type: 'string' },
  list: { type: 'boolean' },
  plan: { type: 'boolean' },
  'service-type': { type: 'string' },
  'plan-id': { type: 'string' },
  skeleton: { type: 'boolean' },
  'show-folder': { type: 'string' },
  lights: { type: 'boolean' },
  'connections-config': { type: 'string' },
  playlist: { type: 'string' },
} satisfies ParseArgsOptionsConfig;
const LIST_OPTIONS: string[] = ['list', 'library', 'pads', 'date', 'replace', 'output-root'];
// The flags --plan --list takes: --list's, the plan's own, the transition flags, whose plan it lists, --template,
// which it checks the songs against as the build does, and --output-root and --replace, so it looks for the set folder
// the build would write and says whether --replace replaces it.
const PLAN_LIST_OPTIONS: string[] = ['list', 'plan', 'library', 'pads', 'template', 'date', 'service-type', 'plan-id', 'overlap', 'pad', 'gap', 'replace', 'output-root'];
// The flags --skeleton takes, and --plan --skeleton: it reads the songs' locators only and writes nothing, so it takes
// the flags that find the songs, and none of a build's.
const SKELETON_OPTIONS: string[] = ['skeleton', 'library', 'pads'];
const PLAN_SKELETON_OPTIONS: string[] = ['skeleton', 'plan', 'library', 'pads', 'date', 'service-type', 'plan-id'];
// The flags --lights takes: it reads the set built for the date under the output root and builds none, so it takes the
// two that find that set, the show folder, the connections config that names Eos and ProPresenter, and the playlist to
// take the songs' colours from when the date does not name one.
const LIGHTS_OPTIONS: string[] = ['lights', 'date', 'output-root', 'show-folder', 'connections-config', 'playlist'];

function editUsage(problem: string): never {
  console.error(`${problem}\n\n${EDIT_USAGE}`);
  process.exit(2);
}

const isEdit = process.argv[2] === 'edit';
let parsed;
try {
  parsed = parseArgs({ args: isEdit ? [] : process.argv.slice(2), allowPositionals: true, options: OPTIONS });
} catch (error) {
  usage(error instanceof Error ? error.message : String(error));
}
const { values, positionals } = parsed;
const from = (process.env.npm_lifecycle_event === 'build-set' && process.env.INIT_CWD) || process.cwd();
const library = resolve(from, values.library ?? join(homedir(), 'Music/MultiTracks'));
const padsPath = values.pads === undefined ? undefined : resolve(from, values.pads);

if (isEdit) {
  await edit(process.argv.slice(3));
} else if (values.skeleton === true) {
  await skeleton();
} else if (values.list === true && values.plan === true) {
  await planList();
} else if (values.list === true) {
  await list();
} else if (values.lights === true) {
  await lights();
} else {
  await build();
}

// The edit subcommand: modifies an already-built set using its saved set-recipe.json, preserving
// Live locator flags and track mixer volumes on untouched songs, and regenerating all recorded
// outputs (the .als, audio/pad copies, set-manifest.json, and Eos lighting cues when --lights was used).
async function edit(args: string[]): Promise<void> {
  const { folder, action } = await parseEditArgs(args);
  let result: Awaited<ReturnType<typeof editSet>>;
  try {
    result = await editSet({
      folder,
      action,
      limits: eosLimits(),
      proPresenterTimeoutMs: proPresenterTimeout(),
      proPresenterAgainMs: proPresenterAgain(),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  if (!result.ok) {
    fail(result.problems);
    return;
  }
  console.log(summary(result.date, result.songs, result.warnings, result.setPath));
  for (const line of result.lightsLines) console.log(line);
  if (result.manifestProblem !== undefined) {
    console.error(result.manifestProblem);
    process.exitCode = 1;
  }
  if (result.lightsProblem !== undefined) {
    console.error(result.lightsProblem);
    process.exitCode = 1;
  }
}

async function parseEditArgs(args: string[]): Promise<{ folder: string; action: EditAction }> {
  let action: EditAction | undefined;
  let atRaw: string | undefined;
  let date: string | undefined;
  let editOutputRoot: string | undefined;
  let folderArg: string | undefined;

  const setAction = (next: EditAction) => {
    if (action !== undefined) editUsage('Give one edit action per command: --swap, --add, or --drop.');
    action = next;
  };

  const nextArg = (index: number, flag: string): string => {
    const value = args[index];
    if (value === undefined || value.startsWith('--')) editUsage(`${flag} requires a value.`);
    return value;
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === '--swap') {
      const song = args[i + 1];
      const replacement = args[i + 2];
      if (song === undefined || song.startsWith('--') || replacement === undefined || replacement.startsWith('--')) {
        editUsage('--swap requires two arguments: --swap <song> <replacement>.');
      }
      setAction({ kind: 'swap', song, replacement });
      i += 2;
    } else if (token === '--add' || token.startsWith('--add=')) {
      const song = token === '--add' ? nextArg(++i, '--add') : token.slice('--add='.length);
      if (song === '') editUsage('--add requires a song name.');
      setAction({ kind: 'add', song });
    } else if (token === '--at' || token.startsWith('--at=')) {
      if (atRaw !== undefined) editUsage('--at may only be given once.');
      atRaw = token === '--at' ? nextArg(++i, '--at') : token.slice('--at='.length);
    } else if (token === '--drop' || token.startsWith('--drop=')) {
      const song = token === '--drop' ? nextArg(++i, '--drop') : token.slice('--drop='.length);
      if (song === '') editUsage('--drop requires a song name or position.');
      setAction({ kind: 'drop', song });
    } else if (token === '--date' || token.startsWith('--date=')) {
      date = token === '--date' ? nextArg(++i, '--date') : token.slice('--date='.length);
    } else if (token === '--output-root' || token.startsWith('--output-root=')) {
      editOutputRoot = token === '--output-root' ? nextArg(++i, '--output-root') : token.slice('--output-root='.length);
    } else if (token.startsWith('--')) {
      editUsage(`Unknown option for build-set edit: ${token}.`);
    } else if (folderArg === undefined) {
      folderArg = token;
    } else {
      editUsage(`Unexpected extra argument "${token}".`);
    }
  }

  if (action === undefined) editUsage('Give one edit action: --swap <song> <replacement>, --add <song> [--at <pos>], or --drop <song>.');
  if (atRaw !== undefined) {
    if (action.kind !== 'add') editUsage('--at can only be used with --add.');
    if (!/^[1-9]\d*$/.test(atRaw)) editUsage(`--at must be a positive whole number, not "${atRaw}".`);
    action = { ...action, at: Number(atRaw) };
  }
  if (date !== undefined && !isDate(date)) editUsage(`--date must be a real date written YYYY-MM-DD, not ${date}.`);
  if (folderArg !== undefined && (date !== undefined || editOutputRoot !== undefined)) {
    editUsage('Give either a set folder path or --date/--output-root, not both.');
  }

  let folder: string;
  if (folderArg !== undefined) {
    const resolved = resolve(from, folderArg);
    const info = await stat(resolved).catch(() => undefined);
    folder = info?.isFile() && resolved.endsWith('.als') ? dirname(resolved) : resolved;
  } else {
    const root = resolve(from, editOutputRoot ?? join(homedir(), 'Music/Ableton/Sets'));
    folder = setFolder(root, date ?? defaultSetDate(new Date()));
  }

  return { folder, action };
}

// The lights mode: for the set built for the date, the song cues of the weekly show file open in Eos labelled and given
// their songs' colours, and the show saved. A song name, a flag the mode does not take (the first in parseArgs option order), then a date that is not
// one, then a --playlist that names no playlist, `--playlist ""` or spaces alone, is a usage problem, before anything is
// read.
async function lights(): Promise<void> {
  const [name] = positionals;
  if (name !== undefined) usage(`--lights labels the song cues of the set built for the date and takes no song name, not "${name}".`);
  const flag = (Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).find((option) => !LIGHTS_OPTIONS.includes(option) && values[option] !== undefined);
  if (flag !== undefined) usage(`--lights takes only --date, --output-root, --show-folder, --connections-config and --playlist, not --${flag}.`);
  if (values.date !== undefined && !isDate(values.date)) usage(`--date must be a real date written YYYY-MM-DD, not ${values.date}.`);
  if (values.playlist?.trim() === '') usage("--playlist names no playlist. Give it the playlist's name: --playlist <name>.");
  const date = values.date ?? defaultSetDate(new Date());
  const outRoot = outputRoot();
  const showDir = showFolder();
  const connConfig = connectionsConfigPath();
  const run = await lightsStep({
    date,
    outputRoot: outRoot,
    showFolder: showDir,
    connectionsConfig: connConfig,
    limits: eosLimits(),
    proPresenterTimeoutMs: proPresenterTimeout(),
    proPresenterAgainMs: proPresenterAgain(),
    playlist: values.playlist,
  });
  for (const line of run.lines) console.log(line);
  if (run.problem !== undefined) {
    fail([run.problem]);
  } else {
    await updateRecipe(setFolder(outRoot, date), (recipe) => ({
      ...recipe,
      lights: {
        showFolder: showDir,
        connectionsConfig: connConfig,
        ...(values.playlist === undefined ? {} : { playlist: values.playlist }),
      },
    })).catch(() => {});
  }
}

// Each song folder's line, or the library's problem alone with exit 1. After the song lines, when the set folder for the
// date already exists under the build's output root (outputRoot), a last line says so and whether --replace replaces
// it; that line never sets exit 1. A song name, or a flag only a build takes (the first in parseArgs option order), then
// a date that is not one, then a --replace that names another set folder (replaces), is a usage problem.
async function list(): Promise<void> {
  const [name] = positionals;
  if (name !== undefined) usage(`--list lists the library's songs and takes no song name, not "${name}".`);
  const flag = (Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).find((option) => !LIST_OPTIONS.includes(option) && values[option] !== undefined);
  if (flag !== undefined) usage(`--list takes only --library, --pads, --date, --replace and --output-root, not --${flag}.`);
  if (values.date !== undefined && !isDate(values.date)) usage(`--date must be a real date written YYYY-MM-DD, not ${values.date}.`);
  const date = values.date ?? defaultSetDate(new Date());
  const replace = replaces(date);
  const listing = await listSongs({ library, pads: padsPath });
  if (listing.ok) {
    for (const song of listing.songs) console.log(songLine(song));
    const found = existingSet(date, replace);
    if (found !== undefined) console.log(existingSetLine(found));
  } else {
    console.error(listing.problem);
    process.exitCode = 1;
  }
}

// What the plan resolves to, listed (planListing) with its warnings, the BPM and meter ones then the chart ones, and
// nothing written, exit 1 when a song has a folder problem or a song
// change a transition problem. With neither, the build's own checks (setProblems) run on the songs' folders with the
// template, stem map, transitions and pads folder the build would use, and each problem they find, or the one line a
// stem map or template that cannot be read gives, is printed on stderr after the listing, exit 1. The listing looks for
// the set folder for the date under the build's output root (outputRoot), and when it exists, its last line says so and
// whether --replace replaces it. That line never sets exit 1, and it prints with a listing that has problems too. A song
// name, a flag --plan --list does not take (the first in parseArgs option order), an empty --plan-id, then a date that is
// not one, then a --replace that names another set folder (replaces), is a usage problem before any request. A token, plan or library problem, which leaves nothing to list, is
// printed alone, exit 1, with no line about the set folder.
async function planList(): Promise<void> {
  const [named] = positionals;
  if (named !== undefined) usage(`--plan takes the songs from the plan, not "${named}".`);
  const flag = (Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).find((option) => !PLAN_LIST_OPTIONS.includes(option) && values[option] !== undefined);
  if (flag !== undefined) usage(`--plan --list takes only --library, --pads, --template, --date, --service-type, --plan-id, --overlap, --pad, --gap, --replace and --output-root, not --${flag}.`);
  checkPlanId();
  if (values.date !== undefined && !isDate(values.date)) usage(`--date must be a real date written YYYY-MM-DD, not ${values.date}.`);
  const date = values.date ?? defaultSetDate(new Date());
  const replace = replaces(date);
  const plan = await readWeekPlan(date);
  if (plan === undefined) return;
  const { transitions, problems, sources } = transitionsWithFlags(plan, flagTransitions(plan.songs.length));
  const picked = await pickFolders({ library, pads: padsPath }, plan.songs);
  if (!picked.ok) return fail([picked.problem]);
  const { picks } = picked;
  const folders = picks.map((pick) => (pick.ok ? pick.folder : undefined));
  const meters = await Promise.all(folders.map((folder) => (folder === undefined ? undefined : startingMeter(library, folder))));
  const warnings = [...planWarnings(plan.songs, folders, meters), ...chartWarnings(plan.songs)];
  for (const line of planListing({ date, plan, picks, transitions, problems, sources, warnings, existingSet: existingSet(date, replace) })) console.log(line);
  if (listingHasProblems({ picks, problems })) {
    process.exitCode = 1;
    return;
  }
  try {
    const stemMap = await stemMapFile();
    const songs = folders.filter((folder) => folder !== undefined);
    const found = await setProblems({ library, template: templatePath(), stemMap, songs, transitions, pads: padsPath });
    if (found.length > 0) fail(found);
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
}

// The chart skeleton of each song named, or of each plan song with --plan, in that order, on stdout, and nothing written.
// A song with a problem (a name that matches no folder or two, a plan song with no folder, a song not saved by Live 12 or
// one that cannot be read, a song with no locators) keeps its number and prints no skeleton; after every skeleton, each
// song's note on the locators its skeleton leaves out goes on stderr, then each problem, exit 1. A note never sets exit
// 1. A token, plan or library problem, which leaves no song to read, is printed alone, exit 1. --list, a song name beside
// --plan, no song named without it, a flag the mode does not take (the first in parseArgs option order), an empty
// --plan-id and a date that is not one are usage problems, before any request.
async function skeleton(): Promise<void> {
  if (values.list === true) usage('--skeleton prints the chart skeleton and takes no --list.');
  const [named] = positionals;
  if (values.plan === true && named !== undefined) usage(`--plan takes the songs from the plan, not "${named}".`);
  if (values.plan !== true && named === undefined) usage('Name at least one song.');
  const allowed = values.plan === true ? PLAN_SKELETON_OPTIONS : SKELETON_OPTIONS;
  const flag = (Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).find((option) => !allowed.includes(option) && values[option] !== undefined);
  if (flag !== undefined) {
    usage(
      values.plan === true
        ? `--plan --skeleton takes only --library, --pads, --date, --service-type and --plan-id, not --${flag}.`
        : `--skeleton takes only --library and --pads, not --${flag}.`,
    );
  }
  checkPlanId();
  if (values.date !== undefined && !isDate(values.date)) usage(`--date must be a real date written YYYY-MM-DD, not ${values.date}.`);
  const picks = values.plan === true ? await planSkeletonFolders(values.date ?? defaultSetDate(new Date())) : await namedSkeletonFolders();
  if (picks === undefined) return;
  const songs: { number: number; title: string; headings: string[] }[] = [];
  const notes: string[] = [];
  const problems: string[] = [];
  for (const [index, pick] of picks.entries()) {
    if (!pick.ok) {
      problems.push(pick.problem);
      continue;
    }
    const reading = await readSong(library, pick.folder).catch((error: unknown) => ({
      song: undefined,
      problems: [`${pick.folder}: the song could not be read: ${error instanceof Error ? error.message : String(error)}`],
    }));
    // The skeleton reads the locators alone, so the content problems a build stops on (frozen stems, devices, a missing
    // WAV) do not stop it; a song that gives no song gives its one problem.
    const { song } = reading;
    if (song === undefined) {
      problems.push(...reading.problems);
      continue;
    }
    if (song.locators.length === 0) {
      problems.push(`${song.folder}: the song has no locators, so it has no chart skeleton.`);
      continue;
    }
    const { headings, leftOut } = songSkeleton(song.locators.map((locator) => valueOf(locator, 'Name')));
    songs.push({ number: index + 1, title: song.title, headings });
    const songNote = leftOutNote(song.title, leftOut);
    if (songNote !== undefined) notes.push(songNote);
  }
  for (const line of skeletonLines(songs)) console.log(line);
  for (const line of notes) console.error(line);
  if (problems.length > 0) fail(problems);
}

// The folder each song named matches, or its problem, in the order named; or undefined, with the library's problem
// printed and exit 1.
async function namedSkeletonFolders(): Promise<FolderPick[] | undefined> {
  const matched = await matchSongs({ library, pads: padsPath }, positionals);
  return matched.ok ? matched.matches : fail(matched.problems);
}

// Each plan song's folder, or its problem, in plan order; or undefined, with the token's, the plan's or the library's
// problem printed and exit 1.
async function planSkeletonFolders(date: string): Promise<FolderPick[] | undefined> {
  const plan = await readWeekPlan(date);
  if (plan === undefined) return undefined;
  const picked = await pickFolders({ library, pads: padsPath }, plan.songs);
  return picked.ok ? picked.picks : fail([picked.problem]);
}

// The set built from the songs named, the set manifest written for it (setManifestPath), its summary, and after the
// summary the lights step (weeklyShow); or the problems with exit 1, no manifest written and no weekly show file made.
// A --replace that names another set folder than the one the build writes (replaces) is a usage problem before the
// token is read or anything is written.
async function build(): Promise<void> {
  const [named] = positionals;
  for (const flag of ['service-type', 'plan-id'] as const) {
    if (values.plan !== true && values[flag] !== undefined) usage(`--${flag} needs --plan.`);
  }
  if (values['connections-config'] !== undefined) usage('--connections-config needs --lights.');
  if (values.playlist !== undefined) usage('--playlist needs --lights.');
  checkPlanId();
  if (values.plan === true && named !== undefined) usage(`--plan takes the songs from the plan, not "${named}".`);
  if (values.plan !== true && positionals.length === 0) usage('Name at least one song.');
  if (values.date !== undefined && !isDate(values.date)) usage(`--date must be a real date written YYYY-MM-DD, not ${values.date}.`);
  const date = values.date ?? defaultSetDate(new Date());
  const replace = replaces(date);
  // The songs, named on the command line or read from the plan, come before the transition flags' positions are checked
  // against their count; the plan's own transitions come with its songs.
  const set = values.plan === true ? await planSet(date) : { songs: positionals, transitions: typedTransitions(flagTransitions(positionals.length)), planSongs: undefined };
  if (set === undefined) return;
  const { songs, transitions, planSongs } = set;
  try {
    const stemMap = await stemMapFile();
    // Read before anything is written, so a lights config that is missing or broken is the build's one problem line.
    const lights = await readLightsConfig();
    const manifest = setManifestPath();
    const result = await buildSet({
      library,
      template: templatePath(),
      stemMap,
      songs,
      date,
      outputRoot: outputRoot(),
      replace,
      transitions,
      pads: padsPath,
      recipe: {
        stemMapPath: DEFAULT_STEM_MAP_PATH,
        setManifest: manifest,
        showFolder: showFolder(),
        ...(values.plan === true
          ? { plan: { serviceType: values['service-type'] ?? 'Service', ...(values['plan-id'] === undefined ? {} : { planId: values['plan-id'] }) } }
          : {}),
        ...(planSongs === undefined
          ? {}
          : {
              charts: planSongs.map((song) =>
                song.chartText === undefined ? undefined : { ...(song.chartKey === undefined ? {} : { chartKey: song.chartKey }), chartText: song.chartText },
              ),
            }),
      },
    });
    if (result.ok) {
      const warnings = planSongs === undefined ? [] : planWarnings(planSongs, result.songs.map(({ folder }) => folder), result.songs.map(({ meter }) => meter));
      // The set is built either way, so its summary prints; a manifest left unwritten would keep last week's charts on
      // this week's set, so it is one line on stderr and exit 1.
      const written = await writeSetManifest(manifest, buildManifest(result.songs, planSongs)).then(() => undefined, oneLine);
      console.log(summary(date, result.songs, warnings, result.setPath));
      await weeklyShow(date, lights);
      if (written !== undefined) {
        console.error(`The set is built, but the set manifest ${manifest} cannot be written: ${written}. The chart view still shows the last manifest's charts.`);
        process.exitCode = 1;
      }
    } else {
      for (const problem of result.problems) console.error(problem);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

// The lights step of a build, after its summary: the weekly show file, made in the show folder (showFolder) from the
// newest template show file there, and the lines that name it and the three steps to open it. With no template show file
// there, one line says the lights step is not done and why, which never sets exit 1. The set is built either way. A show
// folder that is there and cannot be read, or a copy that fails, is one line on stderr and exit 1, as a set manifest that
// cannot be written is.
async function weeklyShow(date: string, config: LightsConfig): Promise<void> {
  const folder = showFolder();
  try {
    const path = await makeWeeklyShow({ showFolder: folder, config, date });
    for (const line of path === undefined ? [noTemplateLine(folder, config.templateShowName)] : weeklyShowLines(path)) console.log(line);
  } catch (error) {
    console.error(`The set is built, but the weekly show file cannot be made in ${folder}: ${oneLine(error)}. The lights step is not done.`);
    process.exitCode = 1;
  }
}

// An error's message on one line, for a problem line that keeps its cause.
function oneLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ');
}

// A --plan-id that names no plan, `--plan-id=` or spaces alone, is a usage problem, before the token is read or any
// request goes out.
function checkPlanId(): void {
  if (values['plan-id']?.trim() === '') usage("--plan-id names no plan. Give it the plan's id: --plan-id <id>.");
}

// The transition each transition flag gives its song, by the song's position: --overlap's and --pad's, and --gap's as
// none, since a song with no transition is followed by a gap, each with the flag as typed. A value that names no song of
// `songs`, then a song two flags name, is a usage problem.
function flagTransitions(songs: number): Map<number, FlagTransition> {
  const overlaps = (values.overlap ?? []).map((value) => ({ value, position: overlapPosition(value, songs) }));
  const pads = (values.pad ?? []).map((value) => ({ value, ...padValue(value, songs) }));
  const gaps = (values.gap ?? []).map((value) => ({ value, position: gapPosition(value, songs) }));
  // The transitions keep one pad for each song, so a second --pad for a song would drop one without a word. Every value's
  // own check comes first; then the first value, in command order, whose song an earlier value named is the problem.
  const padFor = new Map<number, string>();
  for (const { value, position } of pads) {
    const earlier = padFor.get(position);
    if (earlier !== undefined) usage(`Song ${position} has --pad twice, "${earlier}" and "${value}". Give each song change one transition.`);
    padFor.set(position, value);
  }
  const positionsOf = (flags: { position: number }[]) => flags.map(({ position }) => position);
  const both = (flag: string, other: string, positions: number[], others: number[]) => {
    const position = positions.find((each) => others.includes(each));
    if (position !== undefined) usage(`Song ${position} has both --${flag} and --${other}. Give each song change one transition.`);
  };
  both('overlap', 'pad', positionsOf(pads), positionsOf(overlaps));
  both('gap', 'overlap', positionsOf(gaps), positionsOf(overlaps));
  both('gap', 'pad', positionsOf(gaps), positionsOf(pads));
  return new Map<number, FlagTransition>([
    ...overlaps.map(({ value, position }): [number, FlagTransition] => [position, { transition: { type: 'overlap' }, flag: `--overlap ${value}` }]),
    ...pads.map(({ value, position, key }): [number, FlagTransition] => [
      position,
      { transition: key === undefined ? { type: 'pad' } : { type: 'pad', key }, flag: `--pad ${value}` },
    ]),
    ...gaps.map(({ value, position }): [number, FlagTransition] => [position, { flag: `--gap ${value}` }]),
  ]);
}

// The set the plan for `date` gives: its songs, as the library's folder names, so the build matches each by its whole
// name as a typed command would, the plan's songs, for the summary's warnings, and the transitions its items and notes give, each transition flag replacing the
// plan's for its position, problem and all; or undefined, with the problems printed and exit 1. The token is read
// before any request. The plan's own problems stop the build first, then a transition flag that names no song of the
// plan, as a usage problem; then every song's folder problem and every transition problem left, all at once.
async function planSet(date: string): Promise<{ songs: string[]; transitions: Partial<Record<number, Transition>>; planSongs: PlanSong[] } | undefined> {
  const plan = await readWeekPlan(date);
  if (plan === undefined) return undefined;
  const { transitions, problems } = transitionsWithFlags(plan, flagTransitions(plan.songs.length));
  const picked = await planFolders({ library, pads: padsPath }, plan.songs);
  const left = [...(picked.ok ? [] : picked.problems), ...[...problems].toSorted(([a], [b]) => a - b).map(([, problem]) => problem)];
  return picked.ok && left.length === 0 ? { songs: picked.folders, transitions, planSongs: plan.songs } : fail(left);
}

// The plan for `date`, of --service-type and --plan-id, read with the token from its file before any request; or
// undefined, with the token's or the plan's problems printed and exit 1.
async function readWeekPlan(date: string): Promise<Plan | undefined> {
  const tokenFile = tokenFilePath(process.env.PCO_ENV, from);
  const token = await readToken(tokenFile);
  if (!token.ok) return fail([token.problem]);
  const reading = await readPlan({
    apiBase: process.env.PCO_API_BASE ?? API_BASE,
    authorization: token.authorization,
    tokenFile,
    timeoutMs: timeoutMs(),
    serviceType: values['service-type'] ?? 'Service',
    planId: values['plan-id'],
    date,
  });
  return reading.ok ? reading.plan : fail(reading.problems);
}

// Prints each problem on stderr and sets exit 1.
function fail(problems: string[]): undefined {
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
  return undefined;
}

// How long a request to Planning Center waits for its answer: PCO_TIMEOUT_MS when it is a positive number, for the tests
// and not a user setting, like PCO_API_BASE; else 15 seconds.
function timeoutMs(): number {
  const value = Number(process.env.PCO_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 15_000;
}

// How long the lights mode waits for Eos: EOS_TIMEOUT_MS for every wait for an answer when it is a positive number, and
// EOS_SETTLE_MS for the wait after a Go To Cue when it is a number of 0 or more, both for the tests and not a user
// setting, like PCO_TIMEOUT_MS; else Eos's own limits.
function eosLimits(): EosLimits {
  const value = Number(process.env.EOS_TIMEOUT_MS);
  const settle = Number(process.env.EOS_SETTLE_MS ?? '');
  const settleMs = process.env.EOS_SETTLE_MS?.trim() && Number.isFinite(settle) && settle >= 0 ? settle : EOS_LIMITS.settleMs;
  return Number.isFinite(value) && value > 0 ? { answerMs: value, savedMs: value, settleMs } : { ...EOS_LIMITS, settleMs };
}

// How long a request of the lights mode to ProPresenter waits for its answer: PROPRESENTER_TIMEOUT_MS when it is a
// positive number, for the tests and not a user setting, like EOS_TIMEOUT_MS; else ProPresenter's own limit.
function proPresenterTimeout(): number {
  const value = Number(process.env.PROPRESENTER_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : PROPRESENTER_TIMEOUT_MS;
}

// How long the lights mode waits before it asks ProPresenter for a picture again: PROPRESENTER_AGAIN_MS when it is a
// number of 0 or more, for the tests and not a user setting, like EOS_SETTLE_MS; else ProPresenter's own second.
function proPresenterAgain(): number {
  const value = Number(process.env.PROPRESENTER_AGAIN_MS ?? '');
  return process.env.PROPRESENTER_AGAIN_MS?.trim() && Number.isFinite(value) && value >= 0 ? value : PROPRESENTER_AGAIN_MS;
}

// The transitions of a typed command: each flag's, a --gap giving none.
function typedTransitions(flags: Map<number, FlagTransition>): Partial<Record<number, Transition>> {
  return Object.fromEntries([...flags].flatMap(([position, { transition }]) => (transition === undefined ? [] : [[position, transition]])));
}

// The template a build, and the checks of --plan --list, read: --template, or <library>/_template/template Project/template.als.
function templatePath(): string {
  return resolve(from, values.template ?? join(library, TEMPLATE_FOLDER, 'template Project/template.als'));
}

// The folder a build writes the set folder in, and the one --list and --plan --list look in for the set folder for the
// date: --output-root, or ~/Music/Ableton/Sets.
function outputRoot(): string {
  return resolve(from, values['output-root'] ?? join(homedir(), 'Music/Ableton/Sets'));
}

// The show folder a build looks in for the template show file and makes the weekly show file in, and the lights mode
// looks in for the weekly show file: --show-folder,
// resolved against the folder the command runs from as --output-root is, or Eos's own show folder, ~/Documents/ETC.
function showFolder(): string {
  return resolve(from, values['show-folder'] ?? join(homedir(), 'Documents/ETC'));
}

// The connections config the lights mode reads Eos's address and cue list from: --connections-config, resolved against
// the folder the command runs from as --output-root is, or the server's own default, connections.json in the app's
// support folder.
function connectionsConfigPath(): string {
  return resolve(from, values['connections-config'] ?? join(APP_SUPPORT, 'connections.json'));
}

// The set manifest a build writes: --set-manifest, resolved against the folder the command runs from as --output-root
// is, or the server's own default, set-manifest.json in the app's support folder.
function setManifestPath(): string {
  return resolve(from, values['set-manifest'] ?? join(APP_SUPPORT, SET_MANIFEST_FILE));
}

// Whether the command replaces the set folder for the date: true when --replace names it, false with no --replace. A
// --replace names the set folder it replaces, <output root>/<date> <weekday>, as the last line of --list and --plan
// --list prints it, and resolves against the folder the command runs from, as --output-root does. A value that is not
// the set folder for the date under the output root, or a second --replace, is a usage problem, before the token is read,
// any request goes out or anything is written, so no command replaces a set folder it does not name
// (setlist-controller#230). Its fix is the listing without --replace, and the problem names no set folder to copy onto
// --replace: a copied one would replace that folder before anyone was asked about it (#230 review 1 finding 1).
function replaces(date: string): boolean {
  const named = values.replace ?? [];
  const [value] = named;
  if (value === undefined) return false;
  const relist = 'Run --list, or --plan --list, without --replace: its last line names the set folder for the date when it already exists.';
  if (named.length > 1) usage(`--replace is given ${named.length} times. ${relist}`);
  if (resolve(from, value) !== setFolder(outputRoot(), date)) {
    usage(`--replace names ${value}, which is not the set folder for this command's date and output root. ${relist}`);
  }
  return true;
}

// The set folder for the date the build would write, when it already exists, with whether the command's --replace
// replaces it (replaces), for the last line of --list and --plan --list.
function existingSet(date: string, replace: boolean): { folder: string; replace: boolean } | undefined {
  const folder = setFolder(outputRoot(), date);
  return existsSync(folder) ? { folder, replace } : undefined;
}

// The stem map at config/stem-map.json in this repository. A file it cannot read, or one that is not valid JSON, throws
// one line that names the file and keeps the cause's own message, such as the line and column of a stray comma. A map
// of the wrong shape throws one line that names the file too, before the build walks the map (stemMapShape).
function stemMapFile(): Promise<StemMap> {
  return readStemMapFile(DEFAULT_STEM_MAP_PATH);
}

// The set's name, each song with the bar it starts on, the tempo and meter it starts in and the transition after it,
// then a plan build's warnings, and last the set's path, to check before opening the set in Live.
function summary(date: string, songs: SongSummary[], warnings: string[], setPath: string): string {
  const lines = songs.map(({ title, startBar, tempo, meter, transition }, index) =>
    [`${index + 1}. ${title}`, `bar ${startBar}`, `${tempo} BPM`, meter, ...(transition ? [transitionName(transition)] : [])].join('  '),
  );
  return [setName(date), ...lines, ...warnings, setPath].join('\n');
}

// The transition as the summary names it: `gap`, `overlap`, or `pad in <key>`.
function transitionName(transition: SummaryTransition): string {
  return transition.type === 'pad' ? `pad in ${transition.key}` : transition.type;
}

// A --pad value, `<n>` or `<n>=<key>`, split at its first `=`: the song position the pad follows, and the pad's own key
// when it is given one. A position that names no song, then a key that is not a note name, is a usage problem.
function padValue(value: string, songs: number): { position: number; key?: string } {
  const split = value.indexOf('=');
  const position = padPosition(split === -1 ? value : value.slice(0, split), value, songs);
  if (split === -1) return { position };
  const key = value.slice(split + 1);
  if (key === '') usage(`--pad ${value} names no key after "=". ${KEY_GRAMMAR}`);
  if (!isKey(key)) usage(`--pad ${value}: "${key}" is not a key. ${KEY_GRAMMAR}`);
  return { position, key };
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value);
}

// The song position an --overlap value names: a whole number, written in digits, from 1 to the second-to-last song,
// since the last song has no song after it.
function overlapPosition(value: string, songs: number): number {
  const position = /^\d+$/.test(value) ? Number(value) : 0;
  if (position < 1 || position > songs) usage(`--overlap must name a song by its position, a whole number from 1 to ${songs}, not "${value}".`);
  if (position === songs) usage(`--overlap ${position} names the last song, which has no song after it to overlap into.`);
  return position;
}

// A pad may follow the last song, so a --pad position runs to the song count, where an --overlap position stops short of it.
function padPosition(text: string, value: string, songs: number): number {
  const position = /^\d+$/.test(text) ? Number(text) : 0;
  if (position < 1 || position > songs) usage(`--pad must name a song by its position, a whole number from 1 to ${songs}, not "${value}".`);
  return position;
}

// A gap may follow the last song, to take back a pad the plan puts after it, so a --gap position runs to the song count.
function gapPosition(value: string, songs: number): number {
  const position = /^\d+$/.test(value) ? Number(value) : 0;
  if (position < 1 || position > songs) usage(`--gap must name a song by its position, a whole number from 1 to ${songs}, not "${value}".`);
  return position;
}
