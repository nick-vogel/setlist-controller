---
name: build-set
description: Build the Sunday set from Nick's own words. Turns the songs and transitions he names into the exact `pnpm build-set` command, shows it, runs it on his yes, and shows the summary or the problems. After the build it does the lights step: it shows the weekly show file to open in ETCnomad, and on his word runs `pnpm build-set --lights`, which labels and colours the song cues in Eos and saves the show. Use when Nick names songs for a Sunday set or service, asks to build or rebuild the set, asks for the set from the plan ("Sunday's set from the plan", "build it from Planning Center"), names an overlap, a pad or a gap between songs, asks for the lights alone ("do the lights for Sunday", "run the lights step"), or asks for the chart skeleton ("print the chart skeleton", "chart headings for the plan").
---

# Build the set from Nick's words

Turn the service Nick describes into one `pnpm build-set` command, show it to him, and run it only on his yes. The commands that run without his yes are the two listings, `pnpm build-set --list` and `pnpm build-set --plan --list`, since both write nothing: the first reads the library's folder names and looks for the set folder for the date, the second reads the week's plan from Planning Center and the library. The chart skeleton, `pnpm build-set --skeleton` and `pnpm build-set --plan --skeleton`, runs without his yes too, since it writes nothing, by The chart skeleton below. The build still waits for the yes. That yes covers the lights step after the build, by The lights step below: once the set is built and Nick says the weekly show file is open in ETCnomad, the lights mode, `pnpm build-set --lights`, runs with no second yes. When Nick asks for the set from the plan, follow The plan path below instead of the Steps; every other rule here holds for both. A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad. Songs are numbered by position, from 1 in service order, and every transition flag names the position of the song before its song change. A pad after the last song names the last song's position, since no song change follows it.

The flag grammar's source of truth is the `USAGE` text in `src/set-builder/main.ts`. Read it when a request reaches past the mapping below.

## Steps

1. **List the library.** Run `pnpm build-set --list` from this repo's root. Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder. When Nick comes here from The plan path, the flags he named there cross with him, by From the plan path below. The listing's flags go in step 4's order, without `--template`, which `--list` does not take. Nick naming "replace it" or "rebuild it" up front names `--replace`, which goes on by A `--replace` Nick names: this listing runs without it. It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`. `no key` means the song builds, but a pad cannot take its key from it. After the song lines, when the set folder for the date already exists under the output root, a last line says so: `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, or, with `--replace "<folder>"` for that folder on the listing, `<folder> already exists, and --replace replaces it.` That line is no song line, and it never sets exit 1. The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command. A yes with no change to step 4's replace question is no such change: its command runs at once, by The yes to replacing. On exit 1, show Nick the problem it printed (a library it cannot read) and stop there. Exit 2 is a fault in the listing command you composed: fix it and run it again, and an exit 2 on `--replace` by The folder under The yes to replacing. Run it every time; the listing under Worked examples is only what the examples assume.

   **From the plan path.** Nick comes to the Steps from The plan path by the question under Ask instead of guess on a change to the songs, answered "build it from songs I name", by a problem under plan step 2 whose fix is to build the set from songs he names, or by any other route. On every route, what he named on the plan path for this build crosses with him, as if he had named it again. It crosses until the build ends, by When the build ends under The yes to replacing, and a fix after a build's exit 1 that answers that failure keeps it too, by that section: a switch to these Steps with songs he names is such a fix. A build he asks for after that starts with nothing crossed. What crosses:
   - `--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`. "Replace it" or "rebuild it" up front names `--replace`, as plan step 1 says, and it crosses as he named it: a listing that named its folder on the plan path named it for the Steps too, so the Steps listing for that folder carries `--replace "<folder>"` at once.
   - `--template` he named goes on the build command only.
   - `--service-type` and `--plan-id` stay behind, since they need `--plan`. A `--gap` he named crosses as nothing, since a song change with no transition named is a gap on the Steps.
   - A transition he named on the plan path, up front or at plan step 3, crosses when its song change is still there in the songs he names now: the same two songs side by side in the same order, or, for a pad after the last song, that song still last. Its flag takes the position of the song before the song change in the new order, and keeps any key he named (`--pad <n>=<key>`). When its song change is gone, it is a question under Ask instead of guess.
   - A transition the plan gave, a pad from a `Prayer` item or an overlap from an `overlap` note, is none Nick named, so it does not cross.
   - What Nick names in the Steps request itself wins over what crosses: a date, a folder, a template, or a transition on the same song change.
   - A `--replace` that crosses, named by Nick or carried by a yes to the replace question, stays on the listing and the build command only while they look in the set folder it was given for, by One set folder under The yes to replacing. So a date or `--output-root` in the Steps request that points the listing at another set folder leaves it behind, unless he names `--replace` there too.

   Done when you have every line.
2. **Match each song to one line.** For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title). Each short name matches only its own folder, a whole folder name included: a folder whose whole name is part of another listed folder's name (`Grace-Live-D-98.00bpm` beside `Grace-Live-D-98.00bpm copy`) prints its whole name, which matches that folder alone, since the build prefers the one folder whose whole name it is (setlist-controller#57). Done when each song has its line's short name.
3. **Turn each transition into a flag.** Number the songs from 1 in the order Nick names them, and turn each transition he names into its flag by the mapping below, and each transition that crosses from The plan path by step 1 into its flag at its new position. A song change he names no transition for is a gap and adds nothing. Done when every transition he named is a flag, or a question under Ask instead of guess.
4. **Show the command and wait.** Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`. Under it, open the listing with a date line, the date the set is built for with its weekday. A date on `--date` reads `Date: <weekday> <YYYY-MM-DD>, the date named`. When Nick names no date, the line gives the command's default: `Date: Sunday <YYYY-MM-DD>, today, since no date is named` when today is a Sunday, and otherwise `Date: Sunday <YYYY-MM-DD>, the coming Sunday, since no date is named`. Then list each song by position with its title, the key its line prints and the transition after it, as worked example 6 shows: `<n>. <title> (<key>), then a gap`, `then an overlap`, or `then a pad in <key>`. The last song with no pad after it reads `<n>. <title> (<key>), the last song`, and with a pad after it, `<n>. <title> (<key>), then a pad in <key> for ministry time`. Then ask whether to run it, or, when the listing's last line says the set folder for the date already exists, ask by The yes to replacing. Done when Nick answers.
5. **Run it on a yes.** When Nick's answer to that command is a yes with no change ("yes", "yep", "run it"), run it exactly as shown, from this repo's root. The listing of step 1 is the only command that runs before a yes. A "no", or any other answer that calls the build off ("forget it", "never mind", "cancel"), runs nothing: say that nothing was built, and stop. An answer that names a change, a "no" with a change in it included ("no, make it Goodness of God"), is a change: compose the new command and go back to step 4. An answer to step 4's replace question follows The yes to replacing. Done when the command has run, or Nick has called the build off.
6. **Show the outcome.** Show what the command printed, and by its exit code:
   - 0: the summary, the set's name, each song with the bar it starts on, its tempo and meter and the transition after it, and the set's path. After the set's path the build prints its lines for the lights step: show them as printed, and go on by The lights step.
   - 1: the problems, one per line. After each, say what fixes it: what Nick adds to the library, the template, the stem map or the pads folder, or a change to the command. A set folder that already exists is fixed by the same command with the `--replace "<folder>"` the problem names, copied as printed, which replaces that set: show it and wait for a yes, from step 4. Step 4 asks about a set folder the listing found, so this problem comes only from a set folder that appeared after step 1's listing, such as one another build wrote in between. An exit 1 can leave the set built: `The set is built, but the weekly show file cannot be made in <folder>: <cause>. The lights step is not done.` comes on stderr after the summary, and is answered by When the build says the lights step is not done under The lights step, with no second build. A pad problem is fixed by the pad file rule, whose source is the `--pad n=<key>` paragraph of the usage text in `src/set-builder/main.ts`:
     - Nick adds the file the problem names. It lists every name the build looked for (`has no E.wav`, `has no C#.wav or Db.wav`), and any one of them fixes it.
     - A minor key plays its root's file: `Em` plays `E.wav`, and `C#m` plays `C#.wav`. The build reads no file named for a minor key, so a pads folder that holds `Em.wav` is fixed by renaming it `E.wav`.
     - C# and Db, D# and Eb, F# and Gb, G# and Ab, A# and Bb are one key, so either spelling's file plays it.
     - `Cannot read the pads folder <folder>.` names no file: the build stopped at the folder before it looked for one. The fix is the folder. The pads folder is `_pads` in the library unless `--pads` names another, so Nick creates `_pads` in the library, or names the folder that holds his pads with `--pads`, a change to the command (back to step 4). The next build then names any pad file still missing.
     - `The pad after song <n> plays <file>, which lasts <s> s. ... needs a file of at least <s> s.` is a pad file too short for its clip, which starts on the song's Ending and runs through the 60-second Pad section, then into the next song's Intro, or after the last song through its 4-bar fade. Nick replaces the file with a longer one of the same key.
     - `<folder>: the song has no locator named Ending, where a pad starts.` is fixed in the song, not the pads folder: Nick adds a locator named Ending to that song's set in the library.
     - `The pad after song <n> is in <key>, ...and the pads folder <folder> has no <file>. ...` is the whole line the first rule above answers, quoted once: the file names it lists are those pieces. Its last sentence lists the keys the folder has, `The keys it has are <keys>.` or `It has no pad files.`, so Nick can see a file to rename or one missing.
     - `<folder>: the folder name has no key before its BPM, which the pad after song <n> is played in.` or `<folder>: the folder name's key, "<key>", is not a note name, which the pad after song <n> is played in.`: a pad with no key of its own takes the key of the song after it, or of the last song for a pad after it, from that song's folder name, and the name gives none. Nick renames that song's folder in the library to the `<title>-<artist>-<key>-<bpm>bpm` form, with a note name for its key, or gives the pad its own key on the command, `--pad <n>=<key>` (back to step 4).
     - `<path>: the pad file could not be read as a WAV: <reason>.`: the file is there, but the build cannot read it as a WAV, and the reason says why. Nick replaces that file in the pads folder with a WAV of the same key that plays.

     A song folder's file, the template's names and the stem map are fixed as the line names them. The stem map is `config/stem-map.json` in this repo, which puts each stem under the template group or single track it plays in:
     - `<folder>: <file> is missing from the song folder.`: a WAV the song's clips play is not in its folder, as a half-synced song folder leaves one. A song folder is in the library, so Nick adds the file to that song's folder in the library.
     - `The template has no group or single track named "<name>", which the stem map lists.` or `The stem map has no entry for the template's <group or single track> "<name>".`: the template and the stem map disagree on a track's name. Nick renames the template's track to the name the stem map uses, or changes the name in `config/stem-map.json` to the template's. One rename often gives both lines, one for each name.
     - `<folder>: the stem map has no group for the stem "<stem>".`: the song has a stem the stem map puts under no group. Nick adds the stem to its group in `config/stem-map.json`.
     - `The stem map lists the stem "<stem>" under <groups>.`: one stem is under two or more groups, and a stem plays in one. Nick keeps it under one group in `config/stem-map.json`.
     - `config/stem-map.json cannot be read: ...`, `config/stem-map.json is not valid JSON: ...`, `config/stem-map.json must be an object that lists each group's stem names, ...` or `config/stem-map.json lists the stems of <groups> as something other than a list of stem names. ...`: the file itself cannot be read, is not valid JSON (the line keeps the cause, such as a comma after the last entry), or has the wrong shape. Nick fixes `config/stem-map.json` in this repo; for a group whose stems are no list, the line gives the bracket form to write.
     - `The template has a group and a single track named "<name>".` or `The template has more than one <group or single track> named "<name>".`: two of the template's tracks share one name, so the stem map cannot say which one a stem plays in. Nick renames or removes one of them in the template, so each name is one group or single track, and keeps the stem map on the name its stems go to.
     - `The template has no single track named "PAD", which a pad plays on. Add an audio track named PAD outside every group.`: Nick adds that track to the template as the line says, or takes the pads off the command (back to step 4).
     - `<folder>: <group> needs <n> tracks for this song, and the template has <n>.`: the song has more stems under that name in the stem map than the template has tracks there. The name is a group, or a single track such as GUIDE or MT CLICK, which holds one stem. For a group, Nick adds tracks to that group in the template. For either, Nick can move some of those stems under another name in `config/stem-map.json`, which moves them for every song with a stem of that name. Two of the song's stems with one name move together, so for those Nick renames one in the song's set in the library and lists the new name in `config/stem-map.json`.
     - `<songs>: <the overlap needs or the overlaps need> <n> <group> tracks, <counts>, and the template has <n>.`: an overlap keeps the song before it ringing while the next song starts, so the stems of every song still ringing and the song that starts need tracks in that group at once. `<songs>` names those songs, joined by `into`, and `<counts>` gives each one's share. Nick adds tracks to that group in the template, or makes one of those song changes a gap or a pad instead of an overlap, a change to the command (back to step 4).

     An overlap's locators are fixed in the song's own set in the library, as the Ending line of the pad file rule is:
     - `<folder>: the song has no locator named Ending, where an overlap starts the next song's Count Off.`: Nick adds a locator named `Ending` to that song's set in the library, where the song hands off to the next, or makes that song change a gap (back to step 4).
     - `<folder>: the song's Ending, on beat <beat>, is not on a bar line, where an overlap starts the next song's Count Off.`: the next song's Count Off starts on the Ending, so it sits on a bar line of the song's own meter. Nick moves the `Ending` locator onto a bar line in that song's set.
     - `<folder>: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`: the song an overlap or a pad goes into needs a locator named `Count Off` and a locator after it, its Intro, whatever that one is named. Nick adds the missing locator to that song's set in the library, or makes the song change into it a gap (back to step 4).

     A song's own set is checked before anything is built. Its problems are fixed in that song's set in the library, saved in Live 12, and then Nick builds again:
     - `<folder>: the song could not be read: ...`: the song's set, `MultiTrack.als` in that song's folder in the library, is missing, or is not a Live set the build can read, such as a file that is not gzipped. The reason after the colon says which: "ENOENT" for a missing file, "incorrect header check" for one that is not gzipped. Nick saves the song's set from Live 12 into that folder as `MultiTrack.als`, then builds again.
     - `<folder>: saved by <Live version>, not Live 12. Open the song in Live 12 and save it, then build again.`: the line names its fix.
     - `<folder>: the song has no locators, which the builder does not handle.`: the build places the set's sections from the song's locators. Nick adds a locator at the start of each of the song's sections in its set, with `Count Off` and `Ending` by those names.
     - `<folder>: "<track>" is a group track, which the builder does not handle.`: Nick ungroups it in the song's set, with Ungroup Tracks in Live's Edit menu, so each stem in it is a track of its own.
     - `<folder>: "<track>" is a MIDI track, which the builder does not handle.`: the build plays stems, which are audio. Nick deletes the MIDI track from the song's set, or replaces it with an audio stem of what it plays.
     - `<folder>: the stem "<stem>" <reason>, which the builder does not handle.`: the build copies each stem's audio clips into the set as they are, so a stem holds its audio clips and nothing more. By the reason, quoted below with `...` for the rest of the line, Nick changes that stem in the song's set:
       - `is frozen...`: Nick unfreezes the stem, with Unfreeze Track in Live's Edit menu or the track's context menu. The same build names each other reason the stem has on a line of its own, such as its devices, so Nick fixes those too before he builds again.
       - `has devices...`: Nick removes the devices from the stem.
       - `has automation...`: Nick deletes the stem's automation.
       - `has clips on a take lane...`: Nick deletes the clips on the stem's take lanes, keeping the clips the song plays on the stem itself.
       - `has a warped clip...`: Nick turns Warp off on the stem's clips.
       - `has a clip with clip envelopes...`: Nick clears the envelopes of the stem's clips.
       - `has session-view clips...`: Nick deletes the stem's clips in Session View.
       - `refers to a file outside the song's folder...`: a clip plays a file from outside the song's folder. Nick copies it in with Collect All and Save in Live's File menu. Its dialog copies into the song's project folder only the files from the locations picked in it (Packs, the User Library, other Projects, and elsewhere on the computer), so Nick picks every location the stem's files come from, the User Library and Packs included.

     A short name that matches no song folder, or more than one, is fixed on the command, or in the library:
     - `"<name>" matches no song folder in <library>. The song folders are:...`: the short name is in no folder name the library holds, so the library changed after step 1's listing, or the name is not one the listing printed. When the song is among the folders the line lists, the listing runs again (back to step 1), and Nick's command takes the song's short name from it. When it is not, its song folder is missing from the library: Nick adds it, and the listing runs again (back to step 1).
     - `"<name>" matches <n> song folders; name one more fully:...`: the name is part of more than one folder name the library holds, so the library changed after step 1's listing, or the name is not one the listing printed. The listing runs again (back to step 1), and the command takes the short name it prints for the folder Nick means, which names that folder alone.
   - 2: a usage error, a fault in the composed command. Fix it and go back to step 4, and an exit 2 on `--replace` by The folder under The yes to replacing.

   Done when Nick has the output, and a fix for each problem.

## The plan path

When Nick asks for the set from the plan ("Sunday's set from the plan", "build it from Planning Center"), the songs, their keys and the plan's transitions come from the week's plan in Planning Center, not from his words. The plan's transition rule: an item titled `Prayer` that is the next item after a song, headers left out, puts a pad after that song, and a note on a song whose whole text is `overlap` overlaps it into the next song. Every other song change is a gap.

1. **List the plan.** Run `pnpm build-set --plan --list` from this repo's root, without asking. Add any `--date`, `--service-type`, `--plan-id`, `--library`, `--pads`, `--template` or `--output-root` Nick named, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, after a fix included, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder. Nick naming `--replace`, "replace it" or "rebuild it" up front names `--replace`, which goes on by A `--replace` Nick names: this listing runs without it. It prints the set's name, then each plan song as `<n>. <title>  <plan key>  <folder or its problem>  <transition>, <source>`, two spaces apart, such as `3. Fall Like Rain  E  Fall Like Rain-Call On Heaven-E-70.00bpm  pad in E, from --pad 3`. The source is `the default`, `from the plan` or `from <flag>`; the last song has the transition field only when something gives it one. Then a line for each item that is no song, from the first song on, such as `Prayer: a pad after song 2` or `Message: no effect`, then a `Warning:` line for each song whose plan BPM or meter differs from its folder's, then one for each song whose arrangement has no chart text in Planning Center, and one for each whose chart text has no chords in square brackets. When no song line and no song change has a problem, it then runs the build's own checks on the songs' folders, with the template, stem map, transitions and pads folder the build would use, and prints each problem the build would stop on, on stderr after the listing. When the set folder for the date already exists under the output root, the last line on stdout says so: `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, or, with `--replace "<folder>"` for that folder on the listing, `<folder> already exists, and --replace replaces it.` That line is no problem and never sets exit 1 on its own. Done when you have every line.
2. **Show it, or its problems.**
   - Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`. Under it, the date line as step 4 writes it, then each song in step 4's form, its title, the plan key its line prints and the transition its line gives: `<n>. <title> (<key>), then a gap`, `then an overlap` or `then a pad in <key>`, and the last song `<n>. <title> (<key>), the last song`, or `then a pad in <key> for ministry time`. Then each item line that sits between two songs, as printed, so Nick sees an item that does or does not make a pad, then each warning as printed. A warning never stops the build. Then ask whether to run it, or, when the listing's last line says the set folder for the date already exists, ask by The yes to replacing. An answer to either question that names a change goes to step 3, a change to a transition ("yes, but pad after song 2") and a change to the songs alike.
   - Exit 1 with a song line that has a problem: a song line whose folder field or transition field is a problem in place of a folder name or `<transition>, <source>`, or a `keep one:` folder list after it. Nothing is printed on stderr. Show the lines with a problem, and after each, what fixes it. Show no build command, since the build stops on the same problems.
     - `"<title>" has no song folder in <library>.`: the library has no folder whose title is the plan's title. Nick adds the song to the library, or makes the plan's title and the folder's title the same.
     - `"<title>" has no key in the plan, ...`: Nick gives the song a key in the plan.
     - `"<title>" is planned in <key>, and <library> has it only in <keys>.`: Nick changes the song's key in the plan, or adds the song in that key to the library. A key listed as `<folder> (its folder name's key, "<key>", is not a note name)` means that folder's name writes no note name, and Nick fixes the folder's name. A folder listed as `<folder>, whose name writes no key` means that folder's name breaks the `<title>-<artist>-<key>-<bpm>bpm` naming, and Nick renames it to that form. The same two forms can follow `has no key in the plan, and <library> has it in`.
     - `"<title>" is planned in <key>, which is not a key. ...`: the plan's key for the song is no note name, even read in upper case or before a key change's hyphen. Nick fixes the song's key in the plan to a note name: A to G, then # or b, then m for minor.
     - `"<title>" in <key> has <n> song folders in <library>; keep one:`: Nick keeps one of the folders it lists.
     - A song change the plan gives both a `Prayer` item and an `overlap` note, or an `overlap` note on the last song: Nick fixes the plan, or names the transition he wants, which becomes its flag (`--overlap`, `--pad` or `--gap` for that song) and replaces what the plan gives.
   - Exit 1 with song lines that are all clean (each holds a folder name, and a `<transition>, <source>` field where one is due), and one or more problem lines on stderr after the listing: these are the build's own checks, run because no song line and no song change has a problem. The lines are on stderr, after the listing, word for word as the build prints them. Show each, and after it what fixes it, as step 6 of the Steps gives it: a song folder in the library, the template, the stem map (`config/stem-map.json` in this repo) or the pads folder, or a change to the command, such as `--pads` naming the folder that holds the pads, which then goes on the listing and the build command alike. Show no build command, since the build stops on the same lines.
   - Exit 1 with no song lines: the problem stopped the listing before the plan's songs. Show it, what fixes it, and no build command.
     - `Planning Center has <n> "<type>" plans on <date>. Name one with --plan-id: ...`: ask which of the plans it lists Nick means, and add its `--plan-id`.
     - `The "<type>" plan on <date> has no songs in Planning Center. Add them to the plan, then build again.`: the plan is there, with no song on it yet. Nick adds the songs to the plan, or names another date.
     - `"<type>" has no plan on <date> in Planning Center.`, `Planning Center has no service type "<name>". ...`, or `--plan-id <id> is not a "<type>" plan on <date>. ...`: ask which date, service type or plan he means, from what the problem lists.
     - `Cannot read the Planning Center token file <file>.` or `The Planning Center token file <file> has no <name>.`: Nick makes the file as step 8 of `docs/install.md` says.
     - `The Planning Center token file <file> can be read by other users. Run chmod 600 <file>, then build again.`: Nick runs that `chmod 600`.
     - `Cannot reach Planning Center at ...` or `Planning Center at ... did not answer within ...`: the Mac is off the internet, most often on the stage network. Nick builds the set while the Mac is on the internet, before it joins the stage network.
     - `Planning Center sent an answer to <path> that cannot be read.`: an answer came, but it is no whole JSON:API document. The body is not JSON or not a whole JSON:API document, was cut short on a connection that closes with no length, or is compressed and will not inflate. Most often that is an answer spoiled on the way, so Nick builds again while the Mac is on a steady internet connection, off the stage network. When it repeats on a steady connection, the answer itself is the problem, and `<path>` names the request it answered, such as `/service_types`. Nothing in the library, the plan or the command fixes that, so Nick can build the set from songs he names, by the Steps.
     - `Planning Center refused the token in <file>. ...`: Nick makes a new personal access token and puts it in that file.
     - `Planning Center answered <status> to <path>.`: Planning Center answered a request with an error status. This line is for every status but 401: a 401 comes as the refused token line above, never as this one. `<path>` names the request: `/service_types` (the service types), a service type's `/plans`, or a plan's `/items`. Every id in the path is one Planning Center itself listed moments before. By status:
       - 403: the account the token works as cannot see Services, or that service type or plan in it. Nick makes the token from the account that can see the Sunday plan in Services, as step 8 of `docs/install.md` says, or gives his account that access in Planning Center.
       - 404: Planning Center has nothing at that path, most often a plan or service type deleted or moved between one request and the next. Nick builds again. When it repeats, nothing in the library, the plan or the command fixes that, so Nick can build the set from songs he names, by the Steps.
       - 429: too many requests to Planning Center for that account in a short time. Planning Center's usual limit is 100 requests per 20 seconds per user, shared with every other app that acts as the same Planning Center user. Nick waits about half a minute and builds again.
       - 500, 503 or any other 5xx: a fault or maintenance on Planning Center's own servers. Nick builds again later, while the Mac is on the internet. When it lasts until the service, he builds the set from songs he names, by the Steps.
       - Any other status, such as 400: a request Planning Center will not answer. Nothing in the library, the plan or the command fixes that, so Nick can build the set from songs he names, by the Steps.
     - `Planning Center sent a next page outside <base>.`: a page of a list named a next page outside `<base>`, on another host or another path, and the reader stops rather than follow it, so the token goes to no other host. Nothing in the library, the plan or the command fixes that, so Nick can build the set from songs he names, by the Steps.
     - `Cannot read the song library <library>.`: as step 1 of the Steps.
   - Exit 2: a fault in the listing command you composed. Fix it and run it again, and an exit 2 on `--replace` by The folder under The yes to replacing.

   Done when Nick has the listing and a command, or the problems and their fixes.
3. **Turn a change into a flag.** A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives. Run the listing again with it, and with `--replace "<folder>"` when The yes to replacing carries it, or Nick named it and a listing has named its folder, by A `--replace` Nick names, without asking, and show it again from step 2. A change to the songs themselves is a question under Ask instead of guess. Whether he then changes the plan in Planning Center or names the songs by the Steps, the next listing and command have `--replace` on the same terms, by From the plan path under Steps step 1 and One set folder under The yes to replacing. Done when Nick answers with a yes or calls the build off.
4. **Run it on a yes, and show the outcome,** by steps 5 and 6 of the Steps, with the command step 2 showed. A plan build's summary prints the warnings after its song lines, before the set's path; show them as printed. A plan problem the build prints is fixed as step 2 says. Songs Nick names in reply to the build's exit 1, whatever fix step 2 gives its problem, answer that failure: the set is built from them by the Steps, and what he named on the plan path crosses with him, with the `--replace` the command had, by When the build ends under The yes to replacing. Done when Nick has the output, and a fix for each problem.

## The yes to replacing

Nick says yes to replacing a set once per build. This is the one rule for it, on the Steps and The plan path alike; every other place points here.

- **When it is asked.** When the listing's last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, the set for the date was built before. Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?". The question is about the set folder that line names. With no set folder for the date, the listing prints no such line, and the question is "Run it?" as usual.
- **A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between. The listing that asked already answered for this date and output root, and `--replace` changes only what its last line says.
- **The folder.** Every `--replace` names the set folder it replaces, in double quotes, as `--replace "<folder>"`: the folder copied word for word from a listing's last line, or from the problem Steps step 6 answers. Never write the folder from a date or an output root. The command checks it: a `--replace` that names any other folder than the set folder for the command's date and output root, as a build or as a listing, exits 2, as every usage error does. An exit 2 on `--replace` is fixed by dropping `--replace`, never by copying a folder from the problem it prints: run the listing for the command's date and output root again without it, and go on from its last line as from any listing without `--replace`, so a set folder it names gets the replace question unless Nick's words name `--replace` for that folder, by A `--replace` Nick names.
- **A `--replace` Nick names.** Nick names `--replace` by The mapping, up front or in a later answer. His words name it for the set folder of the date and output root they go with, and only a listing names that folder. So the listing for that date and output root runs without `--replace`. When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?". When the listing prints no such line, no set folder is there to replace, and the command has no `--replace`; a later listing of this build for the same date and output root whose last line names the folder takes it the same way.
- **The consent.** A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names. Every listing and every command of this build after it carries `--replace` while it looks in that set folder, whatever else that answer or a later one changes: a transition, or the songs (by Planning Center or by the Steps). That includes a listing that exits 1, and the listing after its fix. So the next listing's last line reads `<folder> already exists, and --replace replaces it.` while that set folder exists, and the only question is "Run it?".
- **One set folder.** Every `--replace` is for one set folder, whatever gave it: Nick naming it, a yes to the replace question, or a yes to the command Steps step 6 shows with it. That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names. A listing or command keeps `--replace` only while it looks in that same set folder. This holds for a `--replace` that crosses from The plan path, and for one that When the build ends keeps on a fix after a build's exit 1. When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual. A date that gives the folder the listing already looked in, such as the coming Sunday said as "November 1", points at no other folder. A `--replace` Nick names in the same answer as the new date or output root ("make it November 1, and replace it") is named for the new folder, by A `--replace` Nick names. In an answer to the replace question or to the command Steps step 6 shows with it, any words for replacing, "replace it", "rebuild it" and "rebuild the set I already built" among them, are the yes to that question or command, for the folder it was about, and name no `--replace` for a new date or output root in the same answer. A change back to a folder that had a yes earlier in this build asks again.
- **When the build ends.** This build ends when a build command runs, or when Nick calls it off. A build Nick asks for after that starts with no consent. A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1. A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name. The listing a fix under Steps step 6 runs again (back to step 1) is part of that fix, whether Nick's reply comes before it or not. It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name". A request he makes once he has turned from that failure to something else, leaving it unanswered, is no fix: it is a build he asks for after the build ended.
- **A "no".** A "no" with no change builds nothing: say that nothing was built, and stop. A "no" that names a change is a change, by Steps step 5, and gives no consent.
- **Already replacing.** A listing whose last line reads `already exists, and --replace replaces it.` comes from a command that has `--replace`, named by Nick, carried by this rule, or on the command Steps step 6 shows for a set folder that appeared after the listing. Show the line as printed, and ask "Run it?" as usual, with no second question.
- **No yes, no `--replace`.** A command gains `--replace` only when Nick names it, says yes to the replace question, or says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing, with a change or without one. It keeps `--replace` only for the set folder it was given for, by One set folder.

## The lights step

The lights step gives the lights their show file for the Sunday: the build makes the weekly show file, Nick opens it in ETCnomad, and the lights mode, `pnpm build-set --lights`, labels each song cue with its song's title, gives the colour lights in it the colour of the song's ProPresenter background, and saves the show. This is the one rule for it, on the Steps and The plan path alike; every other place points here.

- **The yes covers it.** Nick's yes to the build is the yes to the lights step after it, whichever question it answered: "Run it?", "Replace the set built before?", or the command Steps step 6 shows again after a fix. Ask no second question for the lights. The lights mode is the one command that runs after a build with no new yes, and it runs on Nick's word, never straight after the build.
- **After the build.** When the build exits 0, it prints two lines for the lights after the set's path: a line that starts `Weekly show file:` with the path of the weekly show file, then `Open it in ETCnomad: File, Open; <file>; OK.` Show both as printed, under the summary, and wait for Nick's word that the file is open in ETCnomad. Run nothing until he gives it.
- **His word.** Any answer that says the file is open is his word: "it's open", "open", "done", "go ahead". An answer that calls the lights off ("skip the lights", "not now") runs nothing: say that the set is built and the lights step is not done, and that "do the lights" runs it later, by The lights alone.
- **The lights command.** On his word, run the lights mode at once, from this repo's root: `pnpm build-set --lights --date <YYYY-MM-DD>`, with the date of the date line the build was shown with, even when the build command named no date. His word can come on a later day, when the default date has moved on, and the lights are for the set just built. Add `--output-root <folder>` and `--show-folder <folder>` when the build command had them, with the build's own values, after `--date` and in that order. Nothing else of the build command goes on it: no song name, no `--plan`, `--service-type` or `--plan-id`, no `--overlap`, `--pad` or `--gap`, and no `--replace`, `--library`, `--pads` or `--template`. The lights mode stops on each of those with exit 2.
- **The outcome.** Show what the lights mode printed, and by its exit code:
  - 0: the lights step is done. Show the lines as printed: one line per song, with its cue and its colour as hue and as red, green and blue, then the background file the colour came from, or `template colour` and why; then one line for each cue of a song's chain, `Cue <list>/<cue> is in the chain of cue <list>/<cue> (song <n>, <title>), and is coloured as that song is.`; then one line for each cue that is a copy, `Cue <list>/<cue> (song <n>, <title>) is a copy of cue <list>/<cue> (song <n>, <title>).`, and after it, when Eos copied a follow or a hang with the cue, `Cue <list>/<cue> does not keep <the follow or the hang> of cue <list>/<cue>: the lights step took it off.`; then each warning, `Warning: channel <n> is at intensity 0 in cue <list>/<cue> (song <n>, <title>), so the song's colour will not show on it.`; and last the path of the show file the save made. Say that this last path is the file Nick AirDrops to the production computer. A warning stops nothing: pass it on, since it names a colour light that is dark in that song's cue. A chain line stops nothing either: it names a cue the song cue runs on into by a follow or a hang, such as a build or a hit, and that cue now holds its song's colour. A line that says a copy does not keep a follow or a hang stops nothing: the copy is the cue of a song past the song cues the show has, and such a cue runs on into nothing. For a song line that reads `template colour`, go on by Template colour.
  - 1: the lights step is not done, and one line on stderr says why. Show the line and what fixes it, by Another show open, The playlist question or Every other problem.
  - 2: a fault in the lights command you composed: fix it and run it again, with no new yes.
- **Template colour.** A song line that reads `template colour` kept the colour its song cue has in the template show file, and the words after it say why. `no picture`, `the picture cannot be read` or `ProPresenter refused the picture (<status>)`: ProPresenter gave no picture of the song's background to take a colour from. Most often the background file the line names is not on this Mac, and Nick copies it to this Mac. A refused picture is most often a presentation this Mac is not authorized for, which Nick authorizes in ProPresenter. `no presentation or playlist item of its name in the playlist "<name>"`: the playlist links no presentation whose own name, or whose playlist item's name, is the song's title. Nick adds the song's presentation to that playlist in ProPresenter, renames its playlist item to the song's title when the presentation's own name differs, or leaves the template's colour. After his fix, the same lights command runs again on his word, with no new yes. A second run on the same weekly show file does no harm: it finds each song cue by its title, copies nothing, and writes each colour again.
- **Another show open.** On exit 1 with the two weekly show file lines on stdout, nothing was written to Eos, and the line on stderr, after `The lights step is not done:`, reads `the show open in Eos is <path>, not the weekly show file for <date>. Open the weekly show file, then run the lights step again.` or `the weekly show file for <date> was made just now, so it is not the show open in Eos. Open it, then run the lights step again.` Show the line, then the file and the three steps again, as printed, and wait for Nick's word. The file can be a newer one than the build printed, after a rebuild or a save in Eos, so show the one printed now. On his word, run the same lights command again.
- **The playlist question.** On exit 1 with one `--playlist "<name>"` line per playlist on stdout, the lights mode could not choose the ProPresenter playlist to take the colours from, and wrote nothing to Eos. The line on stderr says why, `ProPresenter has no playlist ...` or `ProPresenter has more than one playlist ...`: none, or more than one, has the date of the set in its name, written as November 15, 2026, or has the name `--playlist` gave. When the line ends `Run the lights step again with --playlist and the name of the one to use.`, show it and the playlists as printed, and ask "Which playlist?". Run the lights command again with the `--playlist "<name>"` of the line Nick picks, copied as printed, after its other flags, with no other yes. That `--playlist` stays on every later run of the lights step for that date in this conversation. When the line ends `Rename one in ProPresenter, then run the lights step again.`, two playlists have the very name `--playlist` gave: Nick renames one in ProPresenter, and the same command runs again on his word.
- **Every other problem.** Every other exit 1 prints one line on stderr, and nothing on stdout but where a line below says so. The line starts `The lights step is not done:`, or `config/lights.json` for a lights config problem. After a fix, run the same lights command again on Nick's word, with no new yes. Show the line, and after it what fixes it, by the rest of the line:
  - `no set is built for <date>, since <path> is not there. Build the set, then run the lights step again.`: the output root holds no set for that date. Nick builds the set, by the Steps or The plan path, or names the date or the output root the set was built with, a change to the lights command.
  - `the set built for <date>, <path>, cannot be read: ...` or `the set built for <date>, <path>, holds no song: ...`: the lights mode cannot read the set's songs from its Live set. Nick builds the set again, with the yes to replacing it.
  - `the connections config file <path>`, then `names no Eos to connect to: ...` or `names no ProPresenter to connect to: ...`: the file the server reads its connections from is not there, or its `eos` or `propresenter` section is missing or rejected, and the rest of the line says which. Nick fixes the file as section 7 of `docs/install.md` says, with the lights' section by section 9 and ProPresenter's by section 11.
  - `no template show file named "<name>" was found in <folder>.`: the date has no weekly show file, and the show folder holds no template show file to copy. Nick saves the template show file under that show name, from ETCnomad, into that folder, as section 9 of `docs/install.md` says.
  - `the weekly show file for <date> cannot be found or made in <folder>: ...`: the show folder cannot be read, or the copy of the template show file failed, and the rest of the line says why. Nick fixes the folder as the cause names it, such as its permissions or a full disk.
  - `Eos at <host>:<port> did not answer.`: ETCnomad is closed, or it is not at the address the `eos` section of the connections config names. Nick opens ETCnomad, and the weekly show file in it by the three steps, or corrects the address by section 9 of `docs/install.md`.
  - `ProPresenter at <host>:<port> did not answer.`: ProPresenter is closed, its network is off, or it is not at the address the `propresenter` section names. Nick opens ProPresenter, or sets its network and its address by section 11 of `docs/install.md`.
  - `ProPresenter at <host>:<port> answered <status> to GET <path>.`: ProPresenter is open and refused a request the lights mode needs. Most often ProPresenter has only just opened, and Nick asks for the lights again. When it repeats, the status and the path name the request ProPresenter refuses, and nothing in the set or the lights command fixes that.
  - `the command line in Eos does not read LIVE, it reads "<line>". Put Eos in Live, then run the lights step again.`: Eos is in Blind, in Patch or on another display, where the lights mode writes nothing. Nick presses Live in ETCnomad.
  - `cue list <n> has no cue labelled ...`: the cue list has no song cue for a song the line names, a cue labelled as `songCueLabel` in `config/lights.json` gives it, such as Song 1. Nick labels that cue in the open show, and in the template show file for the weeks after, or corrects `cueList` in the `eos` section of the connections config.
  - `the chain of <song cue> runs on into cue <list>/<cue>, ...`: a song cue runs on by a follow or a hang, cue after cue, into another song's cue or into a cue of another song's chain, and a cue is one song's. Nick takes the follow or the hang off the last cue of the song's own chain in the open show, or corrects its link, and does the same in the template show file for the weeks after.
  - A line that says a cue `runs on by a link to <link>, which is no cue of cue list <n>.`: a cue of a song's chain has a follow or a hang, and its link names a cue in another cue list or a cue the cue list does not hold. Nick corrects the link of the cue the line names in the open show, or takes its follow and its hang off, and does the same in the template show file for the weeks after.
  - `cue list <n> has no cue number free ...`: the set has more songs than the cue list has song cues, and no cue number is free for the copy of the last song cue that the line names. Nick renumbers the cue after it in the open show, so a number between the two is free.
  - `channel <n> has no red, green and blue in Eos, so it is no colour light. Check colourChannels in config/lights.json.`: the line names its fix.
  - A line that says Eos `rejected the command "<command>", and its command line reads "<line>"`: Eos would not take a command the lights mode sent, and its command line says why. Nick clears the command line in ETCnomad, then asks for the lights again.
  - A line that says Eos `did not make ...`, `did not take off ...`, `did not take the label of ...` or `did not take the colour of ...`: Eos did not show a copy, a follow or a hang taken off a copy, a label or a colour the lights mode sent within its time limit. Nick asks for the lights again, after the fix the line's last sentence gives when the open show is changed.
  - `the song cues are labelled and coloured in the open show, but ... Save the show by hand in ETCnomad.`: every label and colour is written, and only the save is missing. This line comes with the song lines on stdout: show them. Nick saves the show in ETCnomad himself, and the file that save makes is the one he AirDrops.
  - A line that ends `The open show is changed and not saved: open the weekly show file again without saving, then run the lights step again.`: the run stopped after it began to write, and the lights mode never saves a show it wrote half of. Before any other fix for the line, Nick opens the weekly show file again in ETCnomad, by the three steps, without saving the open show.
  - A line that starts `config/lights.json`: the lights config is missing, is not valid JSON, or gives a value the lights step cannot use, and the line says which. Nick fixes `config/lights.json` in this repo. A build stops on the same line with exit 1, before it writes anything, and is fixed the same way.
- **When the build says the lights step is not done.** A build can end with the set built and the lights step not done. On exit 0 it prints `The lights step is not done: no template show file named "<name>" was found in <folder>.` after the set's path, in place of the two lines for the lights. On exit 1 it can print the summary and then, on stderr, `The set is built, but the weekly show file cannot be made in <folder>: <cause>. The lights step is not done.` Say that the set is built and the lights step is not done, show the line, and say what fixes it: the template show file, or the show folder the cause names, by Every other problem. Wait for no file, since none was made, and run no second build: the set is built, the build has ended, and this fix is no fix after a build's exit 1 in the sense of When the build ends under The yes to replacing. Once Nick says it is fixed, run the lights command, as The lights command gives it, with no new yes. With no weekly show file for the date, the lights mode makes one from the template show file, prints the two lines for it, and stops with exit 1, by Another show open.
- **The lights alone.** When Nick asks for the lights with no build ("do the lights for Sunday", "run the lights step", "the lights again"), the request is the yes. Run `pnpm build-set --lights` at once, from this repo's root, with no listing before it and no question. Add `--date` by The mapping when he names a date; with no date named, or "Sunday" alone, add none, since the lights mode's default date is the build's: today when today is a Sunday, and otherwise the coming Sunday. Add any `--output-root`, `--show-folder` or `--playlist "<name>"` he names. After a build in this conversation for that date, the command is the one The lights command gives, with the build's date and folders, and any `--playlist` an answer gave. Then go on by The outcome. The lights mode writes nothing unless the show open in Eos is the newest weekly show file for the date, so a request made before the file is open ends at Another show open, with the file to open.

## The mapping

| Nick says | Flag |
| --- | --- |
| "overlap A into B", with B right after A | `--overlap <A>` |
| "a pad between A and B", "a pad after A", "a pad before B" | `--pad <A>`, A being the song before the song change |
| "a pad after the last song", "a pad for ministry time" after it | `--pad <last>` |
| "a pad in E", any key he names | `--pad <n>=E` |
| "a pad in the key of the song before" | `--pad <n>=<the key the song before's line prints>` |
| "a pad in the key of the song after", "of the next song" | `--pad <n>=<the key the song after's line prints>` |
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
| a pads folder | `--pads <folder>` |
| a template | `--template <set.als>` |
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| "no pad after song n", "take out the overlap", "make it a gap", on the plan path | `--gap <n>`, n being the song before the song change |
| "the Christmas Eve service", a service type he names | `--service-type "<name>"` |
| "the 9:00 plan", one of two plans on a date | `--plan-id <id>`, the id the problem lists beside it |

A key is a note name: a letter A to G, then `#` or `b`, then `m` for minor. Write a spoken key that way: "B flat" is `Bb`, "F sharp minor" is `F#m`, "E minor" is `Em`. "Into", "then" and "and" only order the songs; the transition is the one Nick names.

## Ask instead of guess

Ask, one line per open point, and show no command until Nick has answered each, when the request holds:

- a song whose title is on no listed line, or on more than one (name the folders it could be);
- a pad that would take its key from a song listed with `no key`: a pad with no key named before such a song, or after it when it is the last song, or a pad in the key of the song before or after when that song is such a song (ask which key the pad plays in);
- "overlap A into B" where B does not come right after A;
- an overlap from the last song, which has no song after it;
- a pad before the first song;
- an overlap and a pad on one song change;
- a key that is no note name;
- a transition word other than overlap, pad or gap, such as "flow into" or "segue";
- on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps. The flags and transitions he named on the plan path come with him to the Steps, by From the plan path under Steps step 1. When the plan gave a transition, a pad from a `Prayer` item or an overlap from an `overlap` note, the question names it and says it does not cross to the Steps, so he can name it there;
- on the Steps after The plan path, a transition Nick named on the plan path whose song change is gone from the songs he names now, its two songs moved apart, reordered or dropped, or the song a pad came after no longer last: name it, and ask whether it goes somewhere else or is left out;
- anything the command has no flag for: a gap of another length (the gap is always 4 bars), a crossfade, a fade length, a pad of another length (the Pad section is always 60 seconds);
- a named date whose next occurrence, today or later, is not a Sunday, or is more than 28 days (four weeks) after today. A date that has passed this year comes round next year, most often more than 28 days away; "January 3" said on 2026-12-20 is Sunday 2027-01-03, 14 days away, and goes on the command. Name the date with its year and weekday, and ask which Sunday he means. When he answers that he means that very day, it goes on the command.

## The chart skeleton

When Nick asks for the chart skeleton, the headings to type each song's chord chart under in Planning Center, run it without asking, since it writes nothing. For the plan's songs, such as "the chart skeleton for Sunday's plan", run `pnpm build-set --plan --skeleton`, with any `--date`, `--service-type` or `--plan-id` he names, by the mapping. For songs he names, list the library as step 1 of the Steps does, match each song to its short name as step 2 does, then run `pnpm build-set --skeleton` with the short names, in the order he names them. Add `--library <folder>` or `--pads <folder>` when he names one; the skeleton takes no other flag. Show the output as printed: each song's number and title, then its headings, one per line. Pass on each `Note:` line on stderr, which names the locators a song's skeleton leaves out, such as Outro, since the chart view shows each of those with its name and bar count. A problem on stderr, such as a plan song with no folder, is shown as printed, after the skeletons it could print. Then point Nick to section 12 of `docs/install.md`: he pastes each song's headings, not its number and title line, into its arrangement's Lyrics & Chords editor, and types each chord in square brackets right before the syllable it falls on.

## What it touches

The skill runs `pnpm build-set --list` without asking, since it reads the library's folder names, looks for the set folder for the date, and writes nothing, and `pnpm build-set --plan --list`, which reads the plan from Planning Center and the library and writes nothing. It runs the chart skeleton without asking too, `pnpm build-set --skeleton` and `pnpm build-set --plan --skeleton`, which read the songs' locators, and the plan for `--plan`, and write nothing. It runs the one build command Nick said yes to, and after it the lights mode, `pnpm build-set --lights`, on his word that the weekly show file is open, by The lights step. Every build writes the set manifest, `~/Library/Application Support/setlist-controller/set-manifest.json` beside the leader secret, replacing the last one, so the chart view on the band's phones shows this week's charts; a build by song names writes it with no charts. The skill never adds `--set-manifest`, since Nick's builds write the default file the server reads. After the set is built, a build makes the weekly show file in the Eos show folder, `~/Documents/ETC`, a copy of the newest template show file there, when the folder holds one. It never replaces or deletes a file in that folder: a rebuild makes a newer weekly show file and leaves the older one. The lights mode writes to the show open in Eos, and only when that show is the newest weekly show file for the date and its command line reads LIVE: each song cue's label, the colour of the colour channels of `config/lights.json` in each song cue, in each cue of its chain and in each cue straight after one of a song's cues, a copy of the last song cue for each song past the song cues the show has, numbered after that cue and its chain, with the follow and the hang Eos copied taken off it, and the save, which Eos writes as a new file in the show folder. It sets no intensity and no channel but the colour channels. With no weekly show file for the date, the lights mode makes one from the template show file, as a build does. It reads the set built for the date, ProPresenter and the connections config, and writes to none of them. The template show file and `config/lights.json` stay as they are, Nick's to change. The skill never opens a show in ETCnomad, copies a background file to this Mac or sends the show file to the production computer: those stay Nick's. Nothing is ever written to Planning Center, and the token file is Nick's to make and fix. The library, the template and the pads folder stay exactly as they are: when a build reports something missing from them, Nick adds it. The stem map, `config/stem-map.json` in this repo, stays as it is too: when a build or the plan listing reports a stem map problem, Nick changes it.

## Worked examples

These assume the library as it stood on 2026-10-16, with seven song folders, for which `pnpm build-set --list` prints:

```
life  G  Build My Life-Worthy of Your Name-G-70.00bpm
rain  E  Fall Like Rain-Call On Heaven-E-70.00bpm
goodness  A  Goodness of God-Victory-A-63.00bpm
lord  D  Great Are You Lord-All Sons & Daughters Live-D-72.00bpm
freedom  A  There Is Freedom-Where the Glory Is-A-76.00bpm
grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm
trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm
```

1. One overlap. "Grace, Great Are You Lord, then Fall Like Rain. Overlap Grace into Great Are You Lord." Grace is song 1, and Great Are You Lord comes right after it.

   ```
   pnpm build-set grace lord rain --overlap 1
   ```

2. A pad between songs. "Grace, Goodness of God, Fall Like Rain, with a pad before Fall Like Rain." The song before Fall Like Rain is song 2. No key is named, so the pad plays in Fall Like Rain's key, E, as its line prints.

   ```
   pnpm build-set grace goodness rain --pad 2
   ```

3. A pad with its own key. "Great Are You Lord into Build My Life, with a pad in E between them."

   ```
   pnpm build-set lord life --pad 1=E
   ```

4. A pad in the key of the song before. "Goodness of God, then a pad in the key of the song before, then Fall Like Rain." Goodness of God's line prints A.

   ```
   pnpm build-set goodness rain --pad 1=A
   ```

5. A pad after the last song. "Grace, Great Are You Lord, Fall Like Rain, and a pad after the last song for ministry time." Fall Like Rain is song 3, the last.

   ```
   pnpm build-set grace lord rain --pad 3
   ```

6. A whole service, shown as step 4 shows it, said on Saturday 2026-10-17 with no date named. "Grace, Goodness, Great Are You Lord, Fall Like Rain. Overlap Goodness into Great Are You Lord, a pad in E before Fall Like Rain, and a pad after Fall Like Rain for ministry time."

   ```
   pnpm build-set grace goodness lord rain --overlap 2 --pad 3=E --pad 4
   ```

   Date: Sunday 2026-10-18, the coming Sunday, since no date is named

   1. This Is Amazing Grace (D), then a gap
   2. Goodness of God (A), then an overlap
   3. Great Are You Lord (D), then a pad in E
   4. Fall Like Rain (E), then a pad in E for ministry time

   Run it?

7. Ask instead of guess. "God, then Grace, with a pad before God." No command. Two questions: is "God" `Goodness of God-Victory-A-63.00bpm` or `Trust In God-CAN YOU IMAGINE--A-74.00bpm`? And the command has no pad before the first song: should the pad go somewhere else, or be left out?

8. The set from the plan, said on Saturday 2026-10-31 with no date named. "Build Sunday's set from the plan." The listing runs without asking, against the recorded November 1 plan and the library above, and prints:

   ```
   2026-11-01 Sunday
   1. This Is Amazing Grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm  gap, the default
   2. Great Are You Lord  D  Great Are You Lord-All Sons & Daughters Live-D-72.00bpm  gap, the default
   3. Fall Like Rain  E  Fall Like Rain-Call On Heaven-E-70.00bpm
   FaceTime: no effect
   MC: no effect
   Scripture Reading: no effect
   Message: no effect
   Prayer: no effect
   Dismissal: no effect
   ```

   It exits 0. The plan's `Prayer` comes after the message, not right after a song, so it gives no pad, and no item sits between two songs. There is no warning.

   ```
   pnpm build-set --plan
   ```

   Date: Sunday 2026-11-01, the coming Sunday, since no date is named

   1. This Is Amazing Grace (D), then a gap
   2. Great Are You Lord (D), then a gap
   3. Fall Like Rain (E), the last song

   Run it?

   Nick answers with a change: "A pad after Fall Like Rain for ministry time." Fall Like Rain is song 3, the last, so the change is `--pad 3`. The listing runs again with it, and its third song line now reads `3. Fall Like Rain  E  Fall Like Rain-Call On Heaven-E-70.00bpm  pad in E, from --pad 3`; the other lines are as before.

   ```
   pnpm build-set --plan --pad 3
   ```

   Date: Sunday 2026-11-01, the coming Sunday, since no date is named

   1. This Is Amazing Grace (D), then a gap
   2. Great Are You Lord (D), then a gap
   3. Fall Like Rain (E), then a pad in E for ministry time

   Run it?

9. A rebuild from songs Nick names, said on Saturday 2026-10-17 with no date named, after Sunday's set was built earlier that day. "Grace, Great Are You Lord, Fall Like Rain." The listing runs without asking and prints the library's lines above, then a last line, since the set folder for 2026-10-18 is already in the output root:

   ```
   /Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.
   ```

   ```
   pnpm build-set grace lord rain
   ```

   Date: Sunday 2026-10-18, the coming Sunday, since no date is named

   1. This Is Amazing Grace (D), then a gap
   2. Great Are You Lord (D), then a gap
   3. Fall Like Rain (E), the last song

   /Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.

   Replace the set built before?

   Nick answers yes, so the command gains `--replace` with the folder that line names, and runs as shown, with no second question:

   ```
   pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"
   ```

   Had Nick answered "yes, but make song 2 Goodness of God", the yes is consent to `--replace` by The yes to replacing, and the change is a new command: `pnpm build-set grace goodness rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`. The listing runs again with that `--replace` and ends `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists, and --replace replaces it.`, and the only question is "Run it?".

   A first build, with no set folder for the date, gets no such line from the listing, and reads as example 6 does.

10. A rebuild from the plan, said on Saturday 2026-10-31 after Sunday's set was built from the plan earlier that day. "Build Sunday's set from the plan." The listing runs without asking and prints example 8's lines, then a last line, since the set folder for 2026-11-01 is already in the output root. It exits 0.

    ```
    pnpm build-set --plan
    ```

    Date: Sunday 2026-11-01, the coming Sunday, since no date is named

    1. This Is Amazing Grace (D), then a gap
    2. Great Are You Lord (D), then a gap
    3. Fall Like Rain (E), the last song

    /Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.

    Replace the set built before?

    Nick answers "yes, but swap song 2 for Goodness of God". The yes is consent to `--replace` for this build, by The yes to replacing. The swap is a change to the songs themselves, so it is one question under Ask instead of guess: does he change the plan in Planning Center, or build the set from songs he names? He answers "I'll change it in Planning Center", and does. The listing runs again with `--replace`, `pnpm build-set --plan --list --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`, and exits 1 on song 2, which the plan has in G:

    ```
    2. Goodness of God  G  "Goodness of God" is planned in G, and /Users/nick/Music/MultiTracks has it only in A.  gap, the default
    ```

    Its last line is `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.` Show song 2's line and its fix, a change to the song's key in the plan or the song in G added to the library, and no build command. Nick changes the key to A in Planning Center and asks for the listing again. By plan step 1 it carries `--replace`, exits 0, and ends `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

    ```
    pnpm build-set --plan --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
    ```

    Date: Sunday 2026-11-01, the coming Sunday, since no date is named

    1. This Is Amazing Grace (D), then a gap
    2. Goodness of God (A), then a gap
    3. Fall Like Rain (E), the last song

    /Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.

    Run it?

    The same holds after an exit 1 on the build's own checks, such as a WAV missing from Goodness of God's folder: the listing after Nick adds the file carries `--replace`, and the only question is "Run it?".

11. The lights step after a build, said on Saturday 2026-10-17. Nick answers yes to example 6's command, and the build exits 0. After the summary, whose last line is the set's path, it prints two lines for the lights:

    ```
    Weekly show file: /Users/nick/Documents/ETC/Church Sunday 2026-10-18 2026-10-17 20-04-09.esf3d
    Open it in ETCnomad: File, Open; Church Sunday 2026-10-18 2026-10-17 20-04-09.esf3d; OK.
    ```

    Show the summary and those two lines as printed, and wait. Nick opens the file in ETCnomad and answers "it's open". His yes to the build covers the lights step, so the lights mode runs at once, with the date of example 6's date line and nothing else of the build command:

    ```
    pnpm build-set --lights --date 2026-10-18
    ```

    It exits 1 and writes nothing to Eos. On stdout it prints one line per ProPresenter playlist, `--playlist "Oct 18 Sunday"` and `--playlist "Youth"`, and its line on stderr says that ProPresenter has no playlist with "October 18, 2026" in its name. Show the line and the two playlists as printed, and ask "Which playlist?". Nick answers "the Sunday one", so the same command runs again with that line's flag, with no other yes:

    ```
    pnpm build-set --lights --date 2026-10-18 --playlist "Oct 18 Sunday"
    ```

    It exits 0. Show its lines as printed: a line for each of the four songs with its cue and its colour, a line that says song 4's cue is a copy of song 3's, since the template show file has three song cues, and last the path of the show file the save made. Tell Nick that the last path is the file to AirDrop to the production computer.
