# Installing on the playback Mac

These are the one-time steps that make the setlist server simply be there on a Sunday: Live talks OSC through AbletonOSC, Live jumps on the bar, the iPad and the phones find the laptop on the stage router, and one app, Setlist Controller, starts and stops the server. Do them in order on the playback Mac.

You need Node 24 or later, pnpm, Ableton Live 12, and a clone of this repository in a folder that will not move, such as `~/setlist-controller`.

## 1. AbletonOSC as a Live control surface

The server talks to Live through AbletonOSC, pinned to commit `0ca6821` (2025-11-19). Install that commit, not the latest one, since the server and the fake Live are built and checked against it.

1. Download the repository at that commit: https://github.com/ideoforms/AbletonOSC/archive/0ca68214bd62c9b5cb641ca34006cfd70ba94430.zip
2. Unzip it and rename the folder it makes (`AbletonOSC-0ca68214bd62c9b5cb641ca34006cfd70ba94430`) to `AbletonOSC`.
3. Copy the `AbletonOSC` folder into `~/Music/Ableton/User Library/Remote Scripts`. Create the `Remote Scripts` folder if it is not there.
4. Restart Live.
5. Open Live's Settings (Cmd-comma) and go to the Link, Tempo & MIDI tab. In the first empty Control Surface chooser, pick AbletonOSC. Live shows "AbletonOSC: Listening for OSC on port 11000" in its status bar.

AbletonOSC listens on port 11000 and replies on port 11001. The server uses those ports by default, so it needs no flags. Do not run the fake Live on this Mac while Live is open, since both want port 11000.

After any Live update, run the fake Live contract check against the real AbletonOSC before the next rehearsal (step 6).

## 2. Global launch quantization to 1 bar

A jump from the iPad or the pedal lands on the next downbeat because Live quantizes jumps to locators by the global launch quantization. Set it to 1 bar in the Global Quantization chooser in Live's Control Bar, or press Cmd-9. Cmd-0 turns quantization off, so check the chooser reads 1 Bar before the service.

Save the set after changing it, so the set opens with 1 bar next time.

## 3. The travel router: a fixed IP for the laptop

The iPad and the phones reach the server in two ways: at `http://setlist.local:8080`, which the server advertises over Bonjour, and at the laptop's IP address, which is what the setup screen's QR codes hold. Bonjour can fail on some networks and some phones, so give the laptop an IP that never changes, and the QR codes and any saved bookmark keep working.

1. Join the laptop to the stage router's Wi-Fi.
2. Keep the laptop's Wi-Fi hardware address fixed on that network. macOS can use a private Wi-Fi address that rotates, and a reservation keyed on an address that changes stops working. In System Settings, click Wi-Fi, click Details next to the stage network, and set Private Wi-Fi Address to Fixed or Off, never Rotating.
3. Read the address the router will see: on the same Details screen, note the Wi-Fi address (it looks like `a4:83:e7:12:34:56`).
4. Open the router's admin page in a browser, at the address on the router's label, such as `http://192.0.2.1`; its password is on the label too. Find the DHCP settings, often under LAN, and add a reservation (also called a static lease or address reservation) that gives that Wi-Fi address one IP, such as `192.0.2.20`. Pick an address inside the router's range that no other device uses.
5. Turn the laptop's Wi-Fi off and on again, and check that it got the reserved IP (the Details screen shows it).
6. On a phone on the stage network, open `http://<the reserved IP>:8080` and `http://setlist.local:8080`. Both should show the view-only page once the server runs (step 4).

The setup screen at `http://localhost:8080/setup` on the laptop shows the QR codes for the leader page, the producer page and the view-only page with the laptop's current IP, so after this step the codes stay the same every week. If the laptop has no IP on the network, the codes hold the `setlist.local` form instead.

### The leader and producer secrets

The leader page's URL ends in a secret, such as `http://192.0.2.20:8080/leader/3f9c...`, so only a device given that URL can control Live. A phone that types `/leader` alone gets the view-only page. The server makes the secret on its first start and keeps it in `~/Library/Application Support/setlist-controller/leader-secret`, beside the pedal config, so it stays the same across restarts and updates. Each playback Mac makes its own secret, so on a new install, bookmark the leader page on the iPad from the setup screen's leader QR code; an old bookmark from another install does not work.

To change the secret, such as when a device that should no longer control Live has the URL, delete the file and restart the server:

```sh
rm ~/Library/Application\ Support/setlist-controller/leader-secret
```

Then restart the server: quit the Setlist Controller app, pick Stop, and open the app again (section 4).

Every old leader bookmark then stops working: its page stays on "Connecting to the server." Scan the new leader QR code on the setup screen and bookmark it again.

The producer page's URL ends in its own secret, such as `http://192.0.2.20:8080/producer/7a1e...`. It guards the producer page, which has every leader control plus the Connections panel that arms, disarms and fires the connection targets. A device that types `/producer` alone gets the view-only page. The server makes this secret on its first start too, and keeps it in `~/Library/Application Support/setlist-controller/producer-secret`, beside `leader-secret`. The two secrets are independent, so the leader URL never opens the producer page and the producer URL never opens the leader page. On a new install, bookmark the producer page on the producer's iPad from the setup screen's producer QR code.

To change the producer secret, delete its file and restart the server:

```sh
rm ~/Library/Application\ Support/setlist-controller/producer-secret
```

Then restart the server the same way: quit the app, pick Stop, and open it again.

Every old producer bookmark then stops working, and the leader URL stays as it is. Scan the new producer QR code on the setup screen and bookmark it again.

## 4. The Setlist Controller app: it starts and stops the server

The Setlist Controller app owns the server's life. Open it when you need the controller: it starts the server and opens the setup screen at `http://localhost:8080/setup`. While the app is open, the dot under it in the Dock says the server is running, and launchd starts the server again about a second after it crashes. Live keeps playing while the server is down. Quit the app to stop the server. Nothing starts the server at login, so it runs only while the app is open.

To install it, from the repository folder:

```sh
scripts/install-launcher.sh
```

The script installs the dependencies, builds the web app (the server serves it from `dist/web`), writes the server's launchd job to `~/Library/Application Support/setlist-controller/com.nlvogel.setlist-controller.plist`, and builds the app at `~/Applications/Setlist Controller.app`. It never starts the server. If a login agent from before the app is installed, the script stops it and deletes `~/Library/LaunchAgents/com.nlvogel.setlist-controller.plist`, so the server no longer starts at login. Drag the app from `~/Applications` to the Dock once.

The job and the app hold two absolute paths: the repository folder and the `node` your shell finds when you run the install script (`command -v node`), such as Homebrew's `/opt/homebrew/bin/node`. That path stays put through a `brew upgrade`. Run the install script again after you switch Node installs (for example from Homebrew to nvm), or after you move the repository, or the app keeps pointing at the old ones and the server does not start.

To update: quit the app and pick Stop, pull the new code, run the install script again, then open the app.

When you open the app:

- If the setup screen already answers, the app opens it.
- Otherwise the app loads the server's job, waits up to 15 seconds for the setup screen, then opens it.
- If the setup screen does not answer in 15 seconds, the app shows a dialog with the last lines of `server.error.log` instead. The job stays loaded, so launchd keeps trying. Quit the app and pick Stop to stop it.

When you quit the app (Cmd-Q, or Quit in its Dock menu), it asks "Stop the setlist server?":

- Stop: the app stops the server and quits. Nothing starts the server again until you open the app.
- Keep running: the app stays open and the server keeps running. It is the default button, so Cmd-Q and then Return by accident during a service leaves the band its controller.

When you log out, restart or shut down, the app stops the server and quits with no dialog, so it never holds up the logout. If macOS opens the app again when you log back in, the app starts the server. To keep the server stopped after a login, turn off "Reopen windows when logging back in" in the log out dialog.

A force quit skips the dialog, so the server keeps running with no app open. To stop it, open the app, then quit it and pick Stop.

The server's output goes to `~/Library/Logs/setlist-controller/server.log`, and its errors to `server.error.log` in the same folder. The log shows the Bonjour advertisement too, such as "Bonjour: advertising setlist.local at 192.0.2.20, port 8080".

The server also measures how late each cue reaches each connection target, and writes it to `cue-lateness.log` in the same folder, beside `server.log`. The server's log names the file at start, as `Lateness log at <path>`. Each cue handed to a target is one JSON line, measured or not. A cue the target does not act on gets no line: the ATEM acts on a Count Off only, so it gets one line per Count Off and none for any other section or a song's End. The lights act only on the song cue they fire, on the song's Count Off (section 9), so each time the song cue fires on playback, the lights get one line, and no other cue gets one. That line's `section` names the section the song cue fired on. Fire again fires the song cue but writes no lights line. Each line has these fields:

- `time`: when the server handed the cue over, as an ISO 8601 time, such as `2026-10-25T15:04:12.345Z`.
- `target`: the target's key in the connections config, such as `atem`.
- `song` and `title`: the song's number, and its title or `null`.
- `section`: the section's name, or `End` for a song's End.
- `cause`: why the cue fired: `played-into`, `loop`, `jump`, `play-from-start`, `count-in` or `fire-again`. A slide change inside a section is `played-into`.
- `slide`: for ProPresenter, the presentation index of the slide the cue triggered: a section's first slide, a slide change inside it, slide 1, or a song's End. A clear, a cue that triggers nothing, and every other target's line have no `slide` field.
- `lateMs`: how late the server handed the cue over, in whole milliseconds: the time it handed it over minus the time the cue's beat was due, from Live's last report of the playhead and its tempo. A ProPresenter slide played into, or brought back by a loop's wrap, is due on its beat less the lyric lead, the wrap's slide on the wrap less the lead. `null` on an unmeasured line.
- `actedMs`: how late the target acted on the cue, in whole milliseconds, for a target that reports it, or `null`. Always `null` on an unmeasured line.
- `unmeasured`: on an unmeasured line only, why the server could not measure the cue: `fire-again`, since Fire again has no beat it is due on, or `not-played-across`, since the server did not see the playhead play across the cue's beat, as with a drag into the middle of a section, or a report of the playhead more than half a bar from the beat. A measured line has no `unmeasured` field.

A target that reports acting on its cues gets its line once it does, or with `actedMs` as `null` at the next cue it acts on, when it goes offline, or when the server stops. The ATEM reports acting on a Count Off when the switcher reports the cut to Camera that the Count Off caused, so its lines carry `actedMs`. A Count Off whose cut the switcher refuses, or whose report does not come within 2 seconds, gets `null`. A cut made at the ATEM by hand, or with the producer's Pro or Camera button, is no cue, and never counts as acting on one. ProPresenter reports acting on a cue when it answers the cue's slide trigger with a success, so its lines carry `actedMs` too. Each slide trigger gets a line, the slide changes the server sends inside a section included, each measured against the beat its slide goes on, less ProPresenter's lyric lead (`leadBeats`, section 7), and naming the slide's index in `slide`. A slide the server sends early is on time when it goes the lead before its beat, and one it could only send on its beat, such as a section's first slide when no report of the playhead came before the lead, reads the lead late. A trigger it refuses, such as a 403 or a 404, one that gets no answer before it goes offline, and a cue that triggers nothing, such as one of a song with no presentation, get `null`. A section with no group of its name sends slide 1 or a clear, which ProPresenter acts on as on a trigger. The lights report acting on a cue when Eos's fire event for it comes, so their lines carry `actedMs` too. A fire whose event does not come within 1 second gets `null`. A cue fired at the console, the producer's Go or Back, and a cue Eos fires by itself on a follow or a hang never count as acting on one. When a line would take the file past 5 MB, the file moves to `cue-lateness.log.1`, replacing the one there, and a new file starts. To write the log somewhere else, start the server with `--lateness-log <path>`.

To read the log, run `pnpm lateness` from the repository folder. It reads `cue-lateness.log.1` first, then `cue-lateness.log`, and `pnpm lateness --log <path>` reads another log and its `.1` file the same way. It prints one block per day, oldest first, the day taken from each line's `time` in the Mac's time zone, so one day is one rehearsal. Inside a day there is one group per target, with its count of unmeasured cues by reason, and inside that one row per cause, plus an "all causes" row. Each row has the count of measured cues and the median, the 90th percentile and the maximum of `lateMs`, and, where any of its lines has an `actedMs`, the same four for `actedMs`, counting only the lines that have one. Every number is in whole milliseconds, and every percentile, the median included, is by nearest rank: the value at rank p / 100 times n, rounded up, of the sorted values. The producer row's median is taken the same way, so for the same cues it shows the median the summary prints. With no log at the path, it says so in one sentence. A line that is not one of the log's lines is skipped, and the count of skipped lines prints once at the end.

To remove it:

```sh
scripts/uninstall-launcher.sh
```

That stops the server, and removes the app and the server's job. The logs stay.

The app runs in the operator's login session, so the Mac must be logged in, not sitting at the login window, for the server to run.

## 5. The pedal config file

The server reads the leader's MIDI foot pedal directly, with no second app. A config file on the laptop maps the pedal's MIDI messages to actions, so the server works with any pedal without knowing its messages in advance.

The defaults are: switch 1 toggles the loop, switch 2 jumps to the next section, and switch 3 jumps to the previous section. Further switches do nothing. Stop can never be mapped to a pedal switch, so a stray foot cannot stop the tracks: the server rejects a config that maps anything to Stop, says so on the setup screen, and starts with Stop unmapped. With no config file, the pedal does nothing and the server runs as usual.

The file lives at `~/Library/Application Support/setlist-controller/pedal.json`. The server the app starts uses that path, so it needs no change. To read a file somewhere else, start the server with `--pedal-config <path>`.

The file is JSON, with one entry per switch under `switches`:

```json
{
  "switches": {
    "1": { "message": "B0 50 7F" },
    "2": { "message": "B0 51 7F" },
    "3": { "message": "B0 52 7F" }
  }
}
```

Each `message` is the exact bytes the switch sends, as hex, the way the MIDI monitor prints them. Only switches 1, 2 and 3 can be mapped. A switch takes its default action unless its entry names another with `"action"`: `"loop"`, `"next"` or `"previous"`, such as `"3": { "message": "B0 52 7F", "action": "next" }`. Leave a switch out to leave it unmapped.

The server matches the exact bytes. Many pedals send one message on the press and another on the release, such as `B0 50 7F` then `B0 50 00`: map the press, and the release does nothing.

Some pedals alternate between two messages instead, one on each press. The MeloAudio MIDI Commander's switches 1 to 4 do this: one press sends `B0 50 7F`, and the next press sends `B0 50 00`. Mapped to one message, such a switch works on every second press only. Give it a list of both messages, and each one runs the switch's action:

```json
{
  "switches": {
    "1": { "message": ["B0 50 7F", "B0 50 00"] },
    "2": { "message": ["B0 51 7F", "B0 51 00"] },
    "3": { "message": ["B0 52 7F", "B0 52 00"] }
  }
}
```

List both values only when the pedal alternates. A pedal that sends `B0 50 00` on the release would then run each action twice per press.

On a pedal with pages, map switches whose message stays the same on every page, and leave the page switches unmapped. On the MIDI Commander, switches A to D send a different Program Change on each page, and the page switches send Program Changes of their own, so map switches 1 to 3.

Any problem in the file (a mapping to Stop, a switch other than 1 to 3, a message that is not hex, an empty list, one message twice in a list, two switches on one message, a line the server cannot read) rejects the whole file, so no switch is mapped until it is fixed. The setup screen lists every problem.

To fill in the file for a new pedal:

1. Plug the pedal into the laptop and open the setup screen at `http://localhost:8080/setup`. A pedal plugged in after the server started should appear within a few seconds. If pressing a switch shows nothing, restart the server (step 4 below).
2. Press each switch two times, one switch after another. The setup screen's MIDI monitor lists each MIDI message as it arrives, newest first, such as `B0 50 7F Control change 80, value 127, channel 1 unmapped`. A switch that shows two lines on a single press sends a press and a release.
3. Copy the hex at the start of each switch's first press line, such as `B0 50 7F`, into that switch's `message` in the config file. When the second press of a switch sends a different message, such as `B0 50 00`, list both: `"message": ["B0 50 7F", "B0 50 00"]`. Create the folder first if it is not there: `mkdir -p ~/Library/Application\ Support/setlist-controller`.
4. Restart the server, so it reads the new file: quit the Setlist Controller app, pick Stop, and open the app again.
5. Check the setup screen says "Pedal config loaded." and lists each switch with its message and action. Then check each switch from the leader page: switch 1 starts and ends the loop, switch 2 and switch 3 move between sections. The monitor shows the action each press ran.

## 6. The fake Live contract check

The tests run the server against a fake Live, so they are only as good as the fake Live is honest. The contract check keeps it honest: it sends the controller's own OSC messages to a target in a fixed sequence, and records every reply and listener report. Run it once against the real AbletonOSC and once against the fake Live, then compare the two runs.

It covers every message the controller sends: the version probe, `get/cue_points`, the `start_listen` registrations, `cue_point/jump` while stopped and while playing, `start_playing`, `continue_playing`, `set/loop_start`, `set/loop_length`, `set/loop` and `stop_playing`, and the fade's `get/track_data`, `track/get/volume` and `track/set/volume`. It sets each track's volume and then sets it back to the volume it read, so a run, an interrupted one included, leaves every fader where it found it. It also records four behaviours the fake Live assumes, which only real Live can confirm: a jump then `start_playing` plays from the locator, `continue_playing` after a stop and a jump resumes at the stop point, a second jump replaces one still waiting for the bar line, and where Live leaves the playhead after `stop_playing`.

The check is run by hand. It is not part of `pnpm test` or CI.

### The test set

Make a new Live set for the check and save it outside the repository, such as `~/Music/Ableton/Contract Check.als`. It needs no clips. Set it up like this:

- Tempo 120 BPM, time signature 4/4.
- Global quantization 1 Bar (step 2).
- The arrangement loop off, with its brace from 1.1.1 and 4 bars long, as a new set has it. The check moves the brace to the Tag and puts it back when it turns the loop off.
- Five locators, named exactly as below, at these positions. Add a locator with Create > Add Locator, or right-click the scrub area, then rename it with Cmd-R.

| Locator | Position |
|---|---|
| `1 - Intro (Contract Check)` | 1.1.1 |
| `1 - Verse` | 5.1.1 |
| `1 - Chorus` | 9.1.1 |
| `1 - Tag` | 13.1.1 |
| `1 - End` | 14.1.1 |

The Tag is one bar long, so the check can loop it. The script checks the locators before it plays anything, and stops with the list above when the open set does not match.

The set also needs three tracks, named exactly as below, in this order. Delete a new set's tracks down to two audio tracks, select the first and press Cmd-G to put it inside a new group track, then rename each track with Cmd-R. The faders can sit anywhere.

| Track | What it is |
|---|---|
| `Group` | A group track |
| `Grouped` | The audio track inside `Group` |
| `Single` | An audio track on its own, after the group |

The fade reads each track's name and whether it sits inside a group, so the set holds one track that does and two that do not, and the check records each name as Live reports it. The fade finds the `GUIDE` and `MT CLICK` tracks, which keep their level, by the names Live reports, so a reported name that differs from the one Live shows turns up here. The script warns, and runs on, when the tracks differ.

### Running it against real Live

1. Stop the setlist server, since it holds port 11001, where AbletonOSC replies, and it would take Live's listener reports: quit the Setlist Controller app and pick Stop.
2. Open the test set in Live, with AbletonOSC selected as a control surface (step 1). Leave Live stopped, with the playhead at 1.1.1.
3. From the repository folder, run the check against Live. It plays the set for about half a minute, then stops it:

   ```sh
   node src/contract/main.ts run --target live --out ~/contract-check/live
   ```

   It writes `live.md`, the readable report, and `live.json`, the comparison file. If AbletonOSC listens somewhere other than this Mac's ports 11000 and 11001, add `--host`, `--port` and `--reply-port`.

4. Run the same check against the fake Live, which the script starts by itself on ports the system picks, so it never touches 11000 or 11001:

   ```sh
   node src/contract/main.ts run --target fake --out ~/contract-check/fake
   ```

5. Compare the two runs:

   ```sh
   node src/contract/main.ts compare ~/contract-check/live.json ~/contract-check/fake.json
   ```

6. Start the server again: open the Setlist Controller app.

A run stops early, with a message, when nothing answers on port 11000, when the open set is not the test set, or when Live is already playing. A port 11001 that is in use means the server is still running, as after a force quit of the app: open the app, then quit it and pick Stop. A run you stop with Ctrl-C writes what it got to `live.interrupted.md` and `live.interrupted.json` instead, so `live.md` and `live.json` keep the last complete run.

### Reading the result

Compare prints "No differences" when the fake Live and Live agree, and exits 0. Otherwise it prints one line per difference, as `<step> / <observation>: <live> | <fake>`, and exits 1. The readable reports show what each step sent and every message that came back, with its time from the start of the run, so open both at the step a difference names.

Each difference means one of two things. Either the fake Live is wrong, and the fake Live needs a fix, or Live behaves differently from what the spec assumes, and the controller needs a change. Either way, file an issue with the difference and both reports, before the next rehearsal.

An observation reads `unobserved` when Live sent no report the step could read, such as no playhead position. The behaviours read `unobserved` too when the listeners never report, so check the listen step first: each listener should be "reported at once".

## 7. The connections config file

The connection targets, such as ProPresenter, follow the set while the producer has them armed. Each target's address and settings live in one connections config file on the laptop. The server reads it once at start, as it reads the pedal config.

The file lives at `~/Library/Application Support/setlist-controller/connections.json`, beside `pedal.json`. The server the app starts uses that path, so it needs no change. To read a file somewhere else, start the server with `--connections-config <path>`. The server's log names the file it read, as `Connections config from <path>`.

With no file, no target starts and the controller runs as it does without one. The producer page's Connections panel says no connections are configured, and the setup screen says "No connections config."

The file is JSON, with one section per target under `targets`, keyed by the target's kind:

```json
{
  "targets": {
    "<kind>": { "...": "the target's own fields" }
  }
}
```

The kinds the server knows are `propresenter`, `eos` and `atem`, and any other key names a kind it does not know. ProPresenter's fields are in section 11 and its slide rules in the paragraphs below, the lights' (`eos`) in section 9, and the ATEM's (`atem`) in section 10.

A mistake in one section disables that target alone. A section for a kind the server does not know, or one whose fields the target rejects, shows as "Not configured" on the producer page's Connections panel and on the setup screen, with the problem under it, and that target never starts. Every other target starts normally. This is deliberately softer than the pedal config, where any problem rejects the whole file: one wrong address should not take the other targets down on a Sunday.

ProPresenter's presentations must carry no Go To Next timers. The server triggers every slide inside a section itself, on an even split of the section's bars, each a lead ahead of its beat while Live plays forward, and a loop's first slide a lead ahead of each wrap, and ProPresenter's API does not expose a slide's timer, so the pre-service check cannot find one. The lead is `leadBeats` in ProPresenter's section, 2 beats when left out, and 0 sends each slide on its beat: `{ "targets": { "propresenter": { "host": "192.168.10.50", "port": 50001, "leadBeats": 2 } } }`. A slide's lead never reaches back before a clear: after a section that clears and is shorter than the lead, such as a 1-beat Turnaround, the next slide goes right after the clear, not a lead ahead of its beat. The one exception is a section's first slide on a pickup, a slide timing entry's `start` (below): when it comes due at or before the downbeat of a section that clears just before it, the clear is skipped and the slide replaces the slide before it directly. When that slide has not gone by then, as after a Fade out and the producer arming ProPresenter again, the section that clears sends the slide at once in place of its clear. A `leadBeats` that is not a number of 0 or more disables ProPresenter alone, with the reason on its row. A timer left on a slide moves ProPresenter on its own, and the server reads that move as a change by hand and pauses ProPresenter. Remove every timer from the presentations in the playlist before the service. Until ProPresenter takes the server's first cue after the producer arms it, a slide with no words, such as a pre-service loop on timers, does not pause it.

A problem with the file itself starts no target at all: a file that is not JSON, a file with no `targets` object, or a file the server cannot read. The Connections panel and the setup screen show the one problem, and the setup screen says "Connections config rejected."

The server reads the file only at start. After you change it, restart the server: quit the Setlist Controller app, pick Stop, and open the app again. Then check the setup screen at `http://localhost:8080/setup`: it says "Connections config loaded." and lists each target as Online, Offline or Not configured.

### The slide timing file

ProPresenter's slides follow two rules: the nth section of a name shows the nth group of that name, and a group's slides go on an even split of the section's bars. A song that needs something else takes per-song exceptions in the slide timing file, `config/slide-timing.json` in this repository, beside the stem map. The repository's file holds the entries the 8 November set needed, for Holy Forever and Worthy Of It All. A file of `{}` means no exceptions, and so does a missing file.

```json
{
  "Ancient Gates": [{ "section": "Verse 3", "occurrence": 1, "changes": [3, 6] }],
  "Great Are You Lord": [{ "section": "Outro", "occurrence": 1, "group": 15 }]
}
```

Each key is a song title, matched as the set's song titles are, ignoring letter case and extra spaces, and holds a list of entries. Each entry names one section of the song and gives `changes`, `group`, `start`, or any of them:

- `section`: the section's name, as its locator names it.
- `occurrence`: which section of that name it is, counted from 1. Left out, it is 1.
- `changes`: the bar of each slide change after the first, counted from the section's start, decimals allowed, so 2.5 is halfway through bar 3. The first slide goes at the section's start, and each change replaces the even split, with the same lead ahead of its beat.
- `group`: the position of the group the section shows, counted from 1 in the order ProPresenter lists the presentation's groups, every group counted, an unnamed one included. It is for a section with no group of its name, such as an Outro that should show the lyrics of an unnamed group near the end. With no `changes`, that group's slides take the even split.
- `start`: where the section's first sung line starts, in bars before the section's start, as a negative number, for a line sung on a pickup. It counts the way `changes` counts, decimals allowed, so -0.625 is 2.5 beats early in 4/4. The normal lead goes on top of it: the first slide goes up at the section's start plus `start`, less `leadBeats`, and the rest of the song keeps the normal lead. It applies when Live plays forward into the section, on a loop wrap on the section itself, and when a song plays on into the next song's first section. A jump landing, Fire again and a start mid-section send the slide for the playhead at once, as without it. The earlier start takes the slide before it down early, and when it comes due at or before the downbeat of a section that clears just before it, such as a Vamp, a Turnaround or an Interlude with no group, that clear is skipped. When the slide has not gone by then, as after a Fade out and the producer arming ProPresenter again, the section that clears sends the slide at once in place of its clear. Stop, a jump request, a loop change and a Fade out drop it before it goes, as they drop any slide sent early, and a loop on the section before keeps it from going up at all. On a loop wrap whose earlier start would land at or before the section's own last change, slide 1 goes the normal lead early instead, so the song never shows a slide out of order.

The rules: the song has a section of that name and that many of them; the entry gives `changes`, `group`, `start`, or any of them; `group` is a whole number from 1 to the presentation's count of groups; with no `group`, the section has a group of its name for the changes or the start to move; `changes` holds one fewer number than the group has slides, going up, each after the section's start and before its end; `start` is a number below 0; no earlier entry names the same section; and the start lands after the last change of the section before, its last slide or its downbeat when it shows one slide or clears, or, for a song's first section, after the end of the song before it in the set: its End, or for a song with no End the last change of its last section, which runs to this song's first locator. Each entry that breaks a rule is a problem in ProPresenter's pre-service check, naming the song and the entry, such as "Ancient Gates: slide timing Verse 3 1, changes must go up", and the server ignores that entry whole: its section keeps the even split and the name match. A file the server cannot read, one that is not valid JSON, and one whose top level is not an object of songs is one problem naming the file, and no exception applies. Each title is checked against the set's songs and, when it matches none of them, against the presentations in ProPresenter's libraries, by the same name rule: a title that matches neither is a problem, such as "Holy Forevr: slide timing for no song in the set or in ProPresenter's libraries", so a typo shows any week. The entries themselves are checked only for the songs in the set, so a bad entry for a song this week does not play says nothing until that song is in a set. When ProPresenter's libraries cannot be read, the check says so in one problem naming the titles it could not check. A change's bars count in the song's own time signature, the one Live reported while the playhead sat inside that song, so a 6/8 song is judged in 6/8 whichever song Live sits in during the check. Until the playhead has been inside a song since the set was read or the server started, the check does not judge where its changes and its start fall and notes "<song>: meter not read yet". On Saturday, walk the playhead through each song of the set, a click in each song is enough, and the check fills in.

The check notes each entry whose `start` would land at or before its own section's last change on a loop wrap, such as "Worthy Of It All: slide timing Chorus 3, start -0.625 passes its last change, a loop wrap sends slide 1 the normal lead early". It is a note, not a problem: a loop is a live decision, and on that wrap slide 1 takes the normal lead.

The check names each section whose group holds more slides than the section has whole beats as a problem, such as "Ancient Gates: Verse 3 has 3 slides in 2 beats, needs a slide timing entry", since the even split puts its last slides at or past the section's end and the next section's cue replaces them before they show. It does so even for a song whose meter is not read yet. The fix is an entry with `changes` for that section, decimals placing the slides inside its beats, or a `group` with fewer slides.

The check also notes each unnamed group with words that no section reaches, such as "Holy Forever: unnamed group 12 (2 slides), no section shows it", with the position to give an entry's `group`.

The server reads the slide timing file with the set and the presentations, and again on every Refresh. After you change it, press Refresh: no restart is needed.

## 8. The Planning Center token file

`pnpm build-set --plan` reads the week's plan from Planning Center with a personal access token, kept in a file only you can read. Make it once.

1. Sign in to Planning Center with the account that can see the Sunday plan in Services, and open your developer account at https://api.planningcenteronline.com/personal_access_tokens. Create a new personal access token there. Planning Center shows it as two values, an application ID and a secret. The token works as your own account, so never share it or post it anywhere (Planning Center's [authentication docs](https://api.planningcenteronline.com/docs/overview/authentication)).
2. Create the folder and the file, and open the file in TextEdit:

   ```sh
   mkdir -p ~/.config/setlist-controller
   touch ~/.config/setlist-controller/pco.env
   open -e ~/.config/setlist-controller/pco.env
   ```

3. Put the two values in it, one per line, then save and close it:

   ```
   PCO_CLIENT_ID=<the application ID>
   PCO_SECRET=<the secret>
   ```

4. Make the file readable by you alone:

   ```sh
   chmod 600 ~/.config/setlist-controller/pco.env
   ```

The command refuses a token file that the group or other users can read, before it reads the file, and names the `chmod 600` that fixes it: the secret is as good as your password. The token goes only in this file, never on the command line, where it would stay in the shell's history. To keep the file somewhere else, name it in `PCO_ENV`, such as `PCO_ENV="$HOME/pco.env" pnpm build-set --plan --list`.

When Planning Center refuses the token, the command says so and names the file. Delete that token in your developer account, make a new one, and put its two values in the file.

Read the plan before the service, while the Mac is on a network with the internet. The stage router has no internet, so `--plan` cannot reach Planning Center once the Mac has joined it: build the set first, then join the stage network.

### The set manifest

The chart view on the band's phones takes each song's lyrics and chords from the set manifest, `~/Library/Application Support/setlist-controller/set-manifest.json`, beside the leader secret. `pnpm build-set` writes it each time it builds a set, so there is nothing to make by hand. The server the app starts reads it there with no flag; `--set-manifest <path>` names another file, as `--pedal-config` does.

It holds the set's songs in set order, each with its title, the key of its stems, its starting meter, which the chart view counts the bars of every block but the current one in (4/4 for a song with none), and, for a song with a chart, the chart's key and its text as typed in Planning Center (section 12). A song with no chart has no `chartKey` and no `chartText`. A build by song names, with no `--plan`, writes every song with no chart, so last week's charts never show on this week's set; `pnpm build-set --plan --list` warns for each plan song with no chart text, and for chart text with no chords in square brackets, before the build:

```json
{
  "songs": [
    { "title": "Made Up Song", "stemsKey": "G", "meter": "4/4", "chartKey": "G", "chartText": "VERSE\n[G]Made up words" },
    { "title": "Another Song", "stemsKey": null, "meter": "6/8" }
  ]
}
```

The server reads the file at start, on Refresh and whenever the file changes, so a new manifest reaches every open page with no restart and no reload. A chart matches a song in the set by the title on its Count Off locator. With no file, every song shows its blocks with no chart text. A file that is not JSON, or whose songs are not in this shape, shows no chart text either, and the server logs its problem.

## 9. The lights: Eos and the DMX cable

The lights are ETC Eos, ETCnomad on the production computer at FOH, and they follow the set while the producer has them armed. The playback Mac runs ETCnomad too: there the lights step writes each Sunday's show file while the set is built (the weekly routine, below). The production computer then opens that file for the service. The server talks only to Eos, over OSC on TCP, and Eos drives the fixtures through the ETC Gadget II. The Eos settings below are made once, in ETCnomad on the production computer, which needs no install of this repository, and in the playback Mac's ETCnomad for the lights step; the DMX cable moves at every setup and teardown. The menu paths are Eos 3.2 and later, checked against ETC's documentation for Eos 3.2 and 3.3, and the OSC tab against ETCnomad 3.3.10; before 3.2 the network settings were in the shell (ETC's [v3.2 setting changes](https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Setup_and_Shell_Setting_Changes_in_Eos_v3.2)).

### Eos's OSC settings

1. In Setup > System > Show Control, on the OSC tab, turn on OSC RX and OSC TX, so each reads Enabled. The lights use TCP, and TCP still needs both on (ETC's [Eos OSC Setup](https://web.archive.org/web/20260215140233/https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/Eos_OSC_Setup.htm), from the Eos 3.3.5 manual, an archived copy since ETC's live page is gone).
2. On the same tab, leave OSC TCP Mode at its default, Packet Length (v1.0), not the SLIP mode (v1.1). The server frames each packet behind its length, as OSC 1.0 does (`test/fixtures/eos/README.md`). With OSC 1.1 the lights never come online, and the Lights row reads "The lights could not reach Eos at <address>: no answer within 3 seconds. Check the address, that OSC RX and TX are on, and that the OSC TCP mode is OSC 1.0."
3. In Setup > Device > Network, find the Interface Protocols section. Each column is one network interface, with its name at the top when Eos shows one (Wi-Fi, for one) and its Physical Address in the second row. In the column of the interface on the stage network, tick OSC TCP, Third Party OSC, and UDP String & OSC UDP. The lights talk over OSC TCP; the working setup on ETCnomad 3.3.10 has all three ticked on every interface, so leave them that way. Older Eos versions show one setting, UDP Strings & OSC, in its place (ETC's [Triggering Eos from QLab using OSC](https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Triggering_Eos_from_QLab_using_OSC)). The Physical Address on this screen is the hardware address a router reservation needs (below).
4. Leave the port alone. Eos listens for OSC over TCP on port 3032 (ETC's [TCP port for OSC](https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/TCP_port_for_OSC_communication_with_Eos_Software)), and the server connects there unless the config names another. The OSC UDP ports in Show Control are for UDP, which the lights do not use.

ETCnomad takes its IP address from macOS, not from Eos (the same QLab article), so the address the server needs is the production computer's own address on the stage network.

### The lights' section of the connections config

The lights' section in the connections config file (section 7) is keyed `eos`:

```json
{
  "targets": {
    "eos": { "host": "192.0.2.21", "cueList": 1 }
  }
}
```

- `host`: Eos's address, the IP of the computer that runs ETCnomad, such as `192.0.2.21`. The server also takes a host name, such as `production-mac.local`, and asks macOS to look it up on each connect. Name Eos by its IP: at the 2026-11-08 service the production computer's host name did not work, and the address the hotspot gave it by DHCP changed within the afternoon. So give the production computer a reservation on the stage router, as section 3 gives the laptop one, and put that IP here. Section 3's steps 2 to 5 do it for a Mac on the router's Wi-Fi; on Ethernet, key the reservation on the Ethernet port's hardware address instead.
- `port`: Eos's OSC TCP port, a whole number from 1 to 65535. Leave it out for 3032, which is Eos's.
- `cueList`: the number of the cue list the lights follow, a whole number such as 1.

A `host` that is missing or empty, a `port` out of range, or a `cueList` that is not a whole number of 1 or more disables the lights alone: their row reads "Not configured" with the reason, and every other target starts. The server reads the file at start, so restart it after a change (section 7). To keep the service's addresses in a file of their own beside the one you test with at home, such as `connections-production.json`, start the server with `--connections-config <path>`.

The lights are online only while Eos answers. Once connected, the server sends Eos `/eos/ping` every second, and three in a row with no word from Eos take the lights offline with "Eos stopped answering the lights at <address>.", 3 to 4 seconds of silence. The server connects again every 5 seconds on its own, and Live plays on throughout. So a link between the two computers that loses packets in bursts drops the lights, though slides on the screen may hide it: at the 2026-11-08 service both computers were on Wi-Fi, and `ping -c 60 -i 0.5 <Eos's IP>` from the playback Mac lost 6 and then 9 of 60. Run that ping before the service. A run that loses any is a link that can drop the lights.

### The weekly show file

Each Sunday has its own show file, the weekly show file. Every build of the set (`pnpm build-set`) makes it: a copy of the newest template show file (below), in the Eos show folder on the playback Mac, `~/Documents/ETC` unless `--show-folder` names another, named `<weekly show name prefix> <date of the set> <time of the copy>.esf3d`, such as `Church Sunday 2026-11-15 2026-11-12 20-04-09.esf3d`. The prefix is the `weeklyShowNamePrefix` of `config/lights.json`. Eos saves a show under its name with a timestamp suffix (ETC's [Saving Show Files](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/05_Show_Files/Saving_Show_Files.htm)) and keeps the earlier saves as versions of that show (ETC's [Opening Show Files](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/05_Show_Files/Opening_Show_Files.htm)), so the build never replaces or deletes a file in the show folder, and nothing carries over from one week's show file to the next.

Once that file is open in ETCnomad, the lights step (`pnpm build-set --lights`) changes two things in it, and nothing else: the label of each song cue, which becomes the song's title as the set holds it, and the colour of the six colour lights, channels 1 to 3 and 16 to 18, the `colourChannels` of `config/lights.json`, in each song cue and in each cue of its chain. A song owns its chain: every cue its song cue runs on into by a follow time or a hang time, cue after cue (the cue list, below). It never sets an intensity, and it sets no other channel, so every level a cue holds as its own stays as the template has it, the house lights included.

A change to a parameter in a cue tracks forward through the cue list until a cue with a move instruction for it (ETC's [Tracking vs. Cue Only](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/04_System_Basics/Important_Concepts.htm#TrackingvsCueOnly)), so the lights step records the six lights' colour into every song cue and every cue of its chain with Record Only, which stores only the levels set by hand for the channels it names (ETC's [Selective Storing Cues in Live](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/12_Cues_and_Cue_Lists/Selective_Storing_Cues_in_Live.htm)), and records the colour each cue straight after one of a song's cues had back into that cue, so a song's colour stops at the end of its chain and a cue no chain reaches keeps the template's colour. A set with more songs than the template has song cues gets, for each extra song, a copy of the last song cue, made with Copy To (ETC's [Copy To](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/08_Manual_Control/04_Advanced_Manual_Control/Copy_To.htm)), numbered after that cue and every cue of its chain, and then labelled and coloured like any song cue. Eos copies a follow time and a hang time with the cue, and the lights step takes them off the copy, so an extra song runs on into nothing. The copy stands in front of the cue that followed the last song's chain, so every level that cue does not hold as its own now tracks from the copy, the last song cue's look, and no longer from the last cue of the chain. A set with fewer songs leaves the unused song cue as it is.

The lights step writes only when the show open in Eos is the newest weekly show file for the date of the set, so it cannot change the template, last week's show file or any other show. Then it saves the show, which makes a new version of the weekly show file, with the time of the save in its name.

### The template show file

The template show file is one show in the playback Mac's Eos show folder, named `Church Sunday template`, the `templateShowName` of `config/lights.json`. The build copies the newest save of that name.

The template must hold everything the lights step does not change: the patch; the service's cue list, the one `cueList` names in the connections config, as the service runs it, with its three song cues labelled `Song 1`, `Song 2` and `Song 3`; and each song cue's full look, with its house light level. The label is the `songCueLabel` of the lights config, `Song {n}`, and the lights step finds a song cue by its label, by the name rule of the cue list (below), so the song cues can take any cue numbers. Have the six colour lights on in each song cue: a colour light at intensity 0 shows no colour there, and the lights step's summary warns of each one. A cue in no song's chain keeps the colour the template gives it, wherever it stands in the cue list. A build or a hit in a song's chain (the cue list, below) takes that song's colour each week, so the colour the template gives it on the six colour lights does not show. Block the cue that follows the last song's chain, such as Closing, in the template: a cue level block treats every tracked value in the cue as a move instruction, so no change upstream in the cue list reaches it (ETC's [Block](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/12_Cues_and_Cue_Lists/05_Flags/Block.htm)), a copy in front of it in a week with an extra song included.

To make the template, open a Sunday's show file in ETCnomad, label its three song cues (ETC's [Cue Label](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/12_Cues_and_Cue_Lists/04_Cue_Attributes/Cue_Label.htm)), set each one's look, and save the show with File > Save As under the name `Church Sunday template`, in the playback Mac's Eos show folder. Eos saves it under the name you enter with a timestamp suffix (ETC's [Saving Show Files](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/05_Show_Files/Saving_Show_Files.htm)). With no template show file in the show folder, the build still builds the set, and one line after its summary says that the lights step is not done.

To change a look, change it in the template and save: open the template in ETCnomad with File > Open, where a bold show name holds several versions and selecting it opens the newest (ETC's [Opening Show Files](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/05_Show_Files/Opening_Show_Files.htm)), change the look in its song cue, and save the show. The next build copies the newest save. A weekly show file made before the change keeps the old look, so build the set again for that date with `--replace`, which makes a newer weekly show file, and take that one through the weekly routine (below).

### The song's colour

A song's colour comes from ProPresenter on the playback Mac, at the address in the `propresenter` section of the connections config. The lights step takes the playlist whose name holds the date of the set, written as `November 15, 2026`, which is the week's playlist that section 11 makes from Planning Center. In that playlist it takes the first presentation whose own name is the song's title, by the name rule of the cue list (below), or, with none, the first whose playlist item's name is the song's title, less a Planning Center arrangement such as ` - [ Full ]`. Of that presentation it takes the picture of the first cue. The colour is the hue of the most saturated of the picture's large areas that are not near black, never its mean. With no playlist for the date, or more than one, the lights step writes nothing to Eos and prints each playlist it could mean as `--playlist "<name>"`: run it again with that flag.

The lights take the picture's hue and not its saturation. They take the hue at the `saturation` of `config/lights.json`, a number from 0 to 100, and at full brightness, because the backgrounds are pale and their own saturation reads as white light. A higher number gives a stronger colour and a lower one a paler colour. It is 80 to start: change it in the file and run the lights step again.

No picture means the lights step found no colour to take: the picture has no opaque pixel, it has no large area that is not near black, or the most saturated of those areas is under 5% saturation. That is what ProPresenter's grey placeholder gives when the song's background file is not on the playback Mac, and what a first slide with no background gives. The song's line in the summary then reads `template colour  no picture, <background file>`, and the song cue keeps the template's colour, so the lights never show a guessed colour. To fix it, copy the background file the line names to the playback Mac, check that ProPresenter shows the background on the first slide of the song's presentation, and run the lights step again. A line that reads `template colour  no presentation or playlist item of its name in the playlist "<playlist>"` means the playlist links no presentation of the song's title. When the playlist does not link the song, link it (section 11) and run the lights step again. When it links a presentation whose own name differs from the song's title, as a Planning Center import names one for its recording, `<title> (Live)`, rename its playlist item in ProPresenter to the song's title, and run the lights step again. ProPresenter does not change a presentation's own name when you rename it in the library.

### The weekly routine

For the routine, ETCnomad and ProPresenter are open on the playback Mac, with the week's playlist in ProPresenter (section 11). The lights step talks to the Eos and the ProPresenter that the `eos` and `propresenter` sections of the connections config name, so while you build the set those sections name the playback Mac itself, and `--connections-config <path>` reads another file when the service's addresses are in the default one. The playback Mac's ETCnomad takes the settings of "Eos's OSC settings" (above). A server that is running with the lights armed sees the lights step's moves from cue to cue as cues fired by hand (`test/fixtures/eos/README.md`) and pauses the lights: arm them again before the service.

1. Build the set: `pnpm build-set`. After its summary it prints the weekly show file's path and the three steps that open it.
2. Open the weekly show file in ETCnomad: File, Open, the file, OK (ETC's [Opening Show Files](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/05_Show_Files/Opening_Show_Files.htm)). The lights step cannot open a show in Eos, so this is the one step done by hand.
3. Let the lights step run: `pnpm build-set --lights`. It labels and colours the song cues, saves the show as Shift and Update do at the keypad (ETC's [Saving Show Files](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/05_Show_Files/Saving_Show_Files.htm)), and prints one line per song, a line for each cue of a chain with the song it belongs to, a line for each cue it copied, and one more when it took a follow or a hang off the copy, a warning for each colour light at intensity 0 in a song cue, and last the path of the saved file. Read the summary. With another show open in Eos it writes nothing, and prints the weekly show file and the steps that open it again.
4. AirDrop the saved file, the path on the last line, to the production computer, put it in that computer's Eos show folder, and open it there at setup (below). The pre-service check on the lights then reads "Every song has a cue."; a show file the lights step did not finish reads `<song title>: no cue`.

### The cue list

The cue list that `cueList` names, in the weekly show file, holds this Sunday's songs, with one cue per song, in set order. A song does not keep its cue from one Sunday to the next.

The lights step labels each song cue with the song title only, such as `There Is Freedom`, and a cue labelled at the console follows the same rule. The title is the one in the song's first locator, `1 - Count Off (There Is Freedom)`, which the producer page heads the song with. A label matches by the rule every target uses: after trimming, with each run of spaces as one, and ignoring letter case, the two must be the same. Nothing fuzzier: the whole label must match, so `There Is Freedom / Verse 1` matches nothing.

A song's song-start section is its Count Off, or its first section when it has no Count Off. The server fires the song cue at the start of that section, so the look is up as the band counts off. Playing into that section, Play from start, and a jump from another song that lands on it fire it. A Count Off on the previous song's End fires it too: once the band counts off, the previous song is done. A jump comes from another song when the last section the lights were handed in a song, from its Count Off on, or the last End or Fire again, was another song's, or when there has been none since the producer's Arm or a drop. The Count Off is part of its song, so a jump from the song's own Count Off onto its next section is a jump inside the song. A loop wrap, a jump inside the song, a start in the middle of the song, any other section, a Pad, a Pad Out and the End fire nothing. A count-in onto the Count Off or the section after it is Play from start, so it fires the song cue on the Count Off. A count-in onto a later section fires no song cue. The song's look stays until the next song's cue. Fire again fires the song cue of the song playing, and nothing between songs. When two cues carry one label, the first in list order fires, and the check names each other one as a problem.

The server fires only the song cue. A build or a hit inside the song lives in the show file: put it in the list as the next cue after the song cue, and give the song cue a follow time or a hang time. A follow fires the next cue when its time has passed, counted from the moment the cue fires, and a hang counts from when the cue completes (ETC's [Follow/Hang](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/12_Cues_and_Cue_Lists/04_Cue_Attributes/Follow_Hang.htm)). A follow or a hang on a cue with a link fires the cue it links to instead of the next one. A cue Eos fires by itself on a follow or a hang needs no label, never pauses the lights, and is never a problem in the check.

A song owns its chain: its song cue and every cue that cue runs on into this way, cue after cue, up to a cue with no follow and no hang. A link on a cue with no follow and no hang runs on into nothing. The lights step gives every cue of the chain its song's colour, and a cue no chain reaches keeps the template's colour, wherever it stands in the list. An extra song's cue, the copy the lights step makes (the weekly show file, above), stands after the last song's chain and has no follow and no hang. Leave the last cue of a song's chain with no follow, or Eos runs on into the next cue in the list, another song's cue, and that look holds until the next song cue fires. The lights step stops on a chain that runs on into another song's cue, into a cue of another song's chain, or by a link to a cue that is not in the cue list: it writes nothing, and one line names the cue.

A cue fired at the console by hand pauses the lights ("Paused by hand") until the producer arms them again. The producer's Go and Back act on the same cue list, and never pause them.

The pre-service check reads the cue list again and lists, under "Cannot match:", each song of the set with no cue, as `<song title>: no cue`. A song with no title on its first locator matches no cue, and reads `Song <n>: no cue`. Two cues with one label are a problem, as above. A cue list that is missing or empty is one problem: "Cue list <n> is not in the show file, or holds no cues." When every song has a cue, the check reads "Every song has a cue." Eos tells the server when a cue is recorded, moved or deleted at the console, and the server reads the list and runs the check again, with no Refresh.

### Setup and teardown: the DMX cable

The room's own lighting board stays where it is: the app never talks to it. For a service with the lights on the controller, the room's DMX cable moves from that board to the Gadget II at setup, and back at teardown.

At setup:

1. Unplug the DMX cable from the room's lighting board.
2. Plug it into the Gadget II.
3. Plug the ETCnomad dongle into the production computer. The dongle has two USB ports: the Gadget II's USB cable goes into the dongle, not into the computer.
4. Open this Sunday's show file in ETCnomad, the one AirDropped from the playback Mac (the weekly routine, above). Before the producer arms the lights, fire a cue at the console and check the room's lights change.
5. If nothing changes, work through ETC's [Gadget unresponsive with Eos on Mac](https://support.etcconnect.com/ETC/Networking/Gadget_and_Gadget_II/Gadget_Unresponsive_with_Eos_on_Mac): in Patch (double-tap Address), Protocols > Local DMX in the CIA has Enabled Protocol set to Enabled; Setup > Diagnostics lists an I/O Board Firmware Version; and the Gadget II's indicator next to its USB port blinks green rapidly. With no indicator, try another USB port, then another USB cable.
6. On the playback Mac's setup screen at `http://localhost:8080/setup`, check the Lights row reads Online, and read its pre-service check on the producer page.

At teardown:

1. Disarm the lights on the producer page.
2. Unplug the DMX cable from the Gadget II and plug it back into the room's lighting board, where it came from, so the board is back the way it was found.

## 10. The lobby ATEM: a wired link to the playback Mac

The ATEM is a Blackmagic ATEM Mini, the switcher that feeds the lobby screens. While the producer has it armed, it cuts the lobby to Camera at a song's Count Off, so the lobby sees the band as the song starts. Nothing cuts to Pro on its own: the producer presses Pro during setup (below). The steps here were checked on 2026-11-08 against an ATEM Mini on firmware 8.1.1, with this repository's `atem-connection` 3.10.3, except the change of the ATEM's address, which no one has tried yet (below).

### The cable: Ethernet, not USB

The server talks to the ATEM over the network only. `atem-connection`, the library it uses, does not control an ATEM over USB ("USB control of devices is not supported by this library", in `node_modules/atem-connection/README.md`). Blackmagic's own ATEM Software Control can switch over USB, so a USB cable alone can look like it works, but the server never sees the ATEM through it. Run an Ethernet cable from the ATEM's Ethernet port to the playback Mac's wired port, or, on a laptop with no Ethernet port, to a USB Ethernet adapter. The USB cable can stay in as well: ATEM Setup needs it (below).

The plain ATEM Mini has a fixed IP address and does not use DHCP. It ships on `192.168.10.240`, subnet mask `255.255.255.0` (the ATEM Mini Manual in `/Applications/Blackmagic ATEM Switchers/Manuals/`, "Using DHCP and Fixed IP Addresses", pages 103 to 104; the ATEM Mini Pro and Extreme use DHCP instead). Nothing on the cable hands out an address, so the Mac's wired port takes a link-local `169.254.x.x` address by itself and cannot reach the ATEM until it has an address of its own on `192.168.10.x`.

### The Mac's wired port: a manual address with no router

Give the wired port a manual address in the ATEM's subnet, once, in System Settings (Apple's [Change TCP/IP settings on Mac](https://support.apple.com/guide/mac-help/change-tcpip-settings-on-mac-mh14129/mac)):

1. Open System Settings, click Network, and click the wired port's service, such as "USB 10/100/1000 LAN 2" for a USB adapter.
2. Click Details, then click TCP/IP.
3. Set Configure IPv4 to Manually.
4. Type `192.168.10.50` in IP Address and `255.255.255.0` in Subnet Mask, and leave Router empty.
5. Click OK.

Router stays empty because the wired port's service can sit above Wi-Fi in the Mac's service order, and with a router on it, macOS can send all of its traffic down the ATEM's cable, away from the stage router's Wi-Fi, where the iPad, the phones and the production computer are. `networksetup -setmanual` always takes a router, so use System Settings, not that command. An `ifconfig <port> alias` address works for a test, but it is gone after a restart.

Then check the link from Terminal:

1. `ping -c 3 192.168.10.240` gets 3 replies.
2. `route -n get default` names the Wi-Fi interface (`en0` on the 2026-11-08 playback Mac), not the wired port, so the stage network still goes over Wi-Fi.

### Changing the ATEM's address

An ATEM whose cable goes to the playback Mac alone can keep its default `192.168.10.240`. To put it on another subnet, such as a stage router's, give it an address inside that network's subnet that no other device uses (the same manual, "Manually Setting a Fixed IP Address", page 103). ATEM Setup changes it over a direct USB connection (the same manual, "Changing ATEM Mini Network Settings", page 105). No one has tried these steps yet:

1. Connect the ATEM to the Mac with its USB cable.
2. Open Blackmagic ATEM Setup and select the ATEM Mini.
3. On the Configure tab, read the IP address, subnet mask and gateway it shows.
4. Type the new numbers, then click Save. To only read the address, click Cancel.

Then change `host` in the ATEM's section (below), and on a direct cable, the Mac's wired port too, so the first three numbers of the two addresses match.

ATEM Setup is installed with ATEM Software Control, which Blackmagic's [ATEM Mini getting started page](https://www.blackmagicdesign.com/products/atemmini/gettingstarted) covers. On the 2026-11-08 playback Mac only its plug-ins were left, in `/Library/Application Support/Blackmagic Design/Switchers/AdminUtility/PlugIns/ATEM/`, with no ATEM Setup app, so install the ATEM software again if the app is missing.

### The ATEM's section of the connections config

The ATEM's section in the connections config file (section 7) is keyed `atem`. For an ATEM Mini on its default address, with the Pro feed on input 2 and the camera on input 1:

```json
{
  "targets": {
    "atem": { "host": "192.168.10.240", "pro": 2, "camera": 1 }
  }
}
```

- `host`: the ATEM's address, such as `192.168.10.240`.
- `pro`: the input number of the Pro feed, the ProPresenter output, a whole number, such as 2.
- `camera`: the input number of the camera, a whole number, such as 1.

A `host` that is missing or empty, a `pro` or `camera` that is not a whole number of 1 or more, or a `pro` and `camera` on the same input disables the ATEM alone: its row reads "Not configured" with the reason, and every other target starts. The server reads the file at start, so restart it after a change (section 7).

Once the ATEM is online, its pre-service check on the producer page names a `pro` or `camera` input the ATEM does not have, or one that is one of the ATEM's own sources, such as Color Bars or a media player, and shows the ATEM's model and firmware, such as "Model: ATEM Mini, firmware 8.1.1." An empty problem list with that line is a good check.

### Setup: press Pro, then arm

1. On the playback Mac's setup screen at `http://localhost:8080/setup`, check the ATEM row reads Online.
2. On the producer page, press Pro on the ATEM row. The lobby shows the slides until the first Count Off, and the row reads "Program: Pro".
3. Arm the ATEM. At the first song's Count Off it cuts to Camera, and the row reads "Program: Camera".

While the ATEM is armed, a cut to another input made at the ATEM itself, in ATEM Software Control or on its buttons, pauses it ("Paused by hand") until the producer arms it again. The producer's Pro and Camera buttons never arm or pause it.

Do not count on a cut at a later song's Count Off. On 2026-11-08, with the set played straight through from the first song into the second, the producer pressed Pro during the first song, and the second song's Count Off sent no cut, so the lobby stayed on Pro. Only the first song's cut matters for the lobby, so this is left as it is.

The ATEM sends no report for a cut to the input already on program. A Count Off with Camera already on program still sends its cut, but the lateness log records it with `actedMs` as `null` (section 4), which is expected.

### An ATEM firmware update needs a test before the next service

`atem-connection` is pinned to exactly 3.10.3 in `package.json`, and its README warns that new ATEM firmware tends to need a new version of the library. When the ATEM software on a computer is newer than the firmware on the ATEM, ATEM Setup offers an update as soon as it opens (the ATEM Mini Manual, "Updating your ATEM Mini"). Decline it in the week of a service. After any update, before the next service:

1. Restart the server and check the ATEM row reads Online.
2. Check its pre-service check shows no problems and the new firmware.
3. Press Pro and Camera on the producer page, and check the ATEM cuts to each.
4. Arm the ATEM, play a song from its Count Off, and check the ATEM cuts to Camera.
5. Press Pro, cut to Camera in ATEM Software Control, and check the row reads "Paused by hand".

If any step fails, the library needs an update for that firmware before the ATEM can follow the set.

## 11. ProPresenter: the network API and the playlist

ProPresenter shows the lyrics, and its slides follow the set while the producer has it armed. The server talks to ProPresenter's network API over HTTP: it reads the playlists and the presentations, triggers each slide, and holds the status stream open for the slide text on the producer's row. The settings below are made in ProPresenter on the Mac that runs it, which needs no install of this repository. The API is in ProPresenter 7.9 and later; the recordings the tests replay are from ProPresenter 22 (`test/fixtures/propresenter/README.md`). The menu paths are from Renewed Vision's [Connecting to ProPresenter Control](https://support.renewedvision.com/hc/en-us/articles/6024791423763-Connecting-to-ProPresenter-Control), for ProPresenter 7.9.1 and later, and its [Adding a Planning Center Plan to ProPresenter](https://support.renewedvision.com/hc/en-us/articles/360062310714-Adding-a-Planning-Center-Plan-to-ProPresenter).

### ProPresenter's network settings

1. In ProPresenter, open the ProPresenter menu, then Settings, then Network. Turn the network on with its toggle.
2. Read the IP address and the port on the Network tab. They go in ProPresenter's section of the connections config (below). The port at home is 50001, the server's default. Check the port again after a ProPresenter update.
3. If the server cannot reach ProPresenter, check that no firewall on the ProPresenter Mac blocks the port.
4. Give the ProPresenter Mac a reservation on the stage router, as section 3 gives the laptop one, so its address does not change between services. Section 3's steps 2 to 5 do it for a Mac on the router's Wi-Fi; on Ethernet, key the reservation on the Ethernet port's hardware address instead.

### ProPresenter's section of the connections config

ProPresenter's section in the connections config file (section 7) is keyed `propresenter`:

```json
{
  "targets": {
    "propresenter": { "host": "192.168.10.50", "port": 50001, "leadBeats": 2 }
  }
}
```

- `host`: the address of the Mac that runs ProPresenter, the IP on the Network tab, such as `192.168.10.50`.
- `port`: the port on the Network tab, a whole number from 1 to 65535. Leave it out for 50001.
- `leadBeats`: how many beats before its beat each lyric slide goes up while Live plays forward, a number of 0 or more. Leave it out for 2. Section 7 says how the lead works.

A `host` that is missing or empty, a `port` out of range, or a `leadBeats` that is not a number of 0 or more disables ProPresenter alone: its row reads "Not configured" with the reason, and every other target starts. The server reads the file at start, so restart it after a change (section 7).

ProPresenter is online while it answers `GET /version`. A request that gets no answer, or a refused connection, puts it offline, and the server asks again on its own until it answers. A status stream that goes quiet does not put ProPresenter offline while its API still answers: the row shows "slide text not live, status stream quiet", and the pre-service check says "ProPresenter's status stream is quiet: quit and reopen ProPresenter before the service." Do what it says. On 2026-11-03 a ProPresenter that had run for a day and a half stopped sending its heartbeat, and only a restart brought it back.

### The week's playlist from Planning Center

1. In ProPresenter, click the plus sign next to Library, choose Planning Center Service, click the week's plan, then click Select. ProPresenter adds the plan as a playlist.
2. ProPresenter links each song of the plan to the presentation in its library with the same title. A song with no match shows a drop area: drag the song's presentation onto it to link it. The server and the lights step find a song's presentation in two passes. First they take the first presentation whose own name is the song's title. When none has it, they take the first whose playlist item's name is the song's title, less a Planning Center arrangement such as ` - [ Full ]`. A Planning Center import can name a presentation for its recording, `<title> (Live)`, and ProPresenter does not change that own name when you rename the presentation in the library. For such a song, rename its playlist item to the song's title, then press Refresh (step 4). The check says "<song>: no presentation or playlist item of its name" for a song that neither pass finds.
3. On the producer page, pick the playlist in the ProPresenter row's Playlist select. The pick is kept per set, so it survives a restart of the server, and a set the server has not seen asks for a pick again.
4. Press Refresh on the row after the songs link. ProPresenter links a Planning Center song to its presentation only some time after it pulls the plan, and the server reads the playlist again on Refresh, when ProPresenter comes online, and when the set read from Live changes.

Each song's playlist item must be on the Master arrangement. The API does not return another arrangement's slides, so a cue for a song on any other arrangement sends nothing, and the check says "<song>: arrangement <name> in ProPresenter, not Master". An item with no arrangement named counts as on Master.

### The presentations: authorization, groups and the End

A MultiTracks presentation has to be authorized on the ProPresenter Mac. ProPresenter refuses every trigger of one that is not, with a 403, and the check says "<song>: not authorized in ProPresenter".

Name each group like the section it shows. The server matches names with case and extra spaces ignored, so a group "Pre Chorus" matches a section "pre chorus". The nth section of a name shows the nth group of that name, so a song with two Choruses that sing different words needs two Chorus groups, in order. A section with no group of its name shows slide 1 of the presentation before the song's first group, such as a Count Off or an Intro, and clears the screen after it, such as a Turnaround, an Interlude or an Outro. The check notes each such section, for example "<song>: no group Intro, shows slide 1". A song that needs another group or other slide changes takes an entry in the slide timing file (section 7).

The presentations carry no Go To Next timers (section 7).

A song's End shows the first slide of its group named End when the presentation has one, else of its group named Ending, the name Planning Center and MultiTracks give a song's closing group. With neither, the End clears the screen, and the check notes "<song>: no group End, clears". A song whose set has its own Ending section shows the Ending group at that section, so its End adds nothing more: it shows an End group if there is one, and clears otherwise. So add an End group only to a song whose screen must change at the End.

### The slide buttons

The ProPresenter row's Next slide and Previous slide move one slide in the presentation ProPresenter has up, whatever the arm state. On the last slide of a presentation, Next slide moves on to slide 1 of the next presentation in the playlist picked on the row, past its headers and placeholders, such as from the last song into Facetime. On the first slide, Previous slide moves back to the last slide of the presentation before it, so one Next slide and one Previous slide come back to the same slide. They follow the playlist picked on the row, not the one ProPresenter has open. A presentation listed twice is left from the place it was shown at. With no playlist picked, with a presentation up that is not in the picked playlist, such as one shown from the library, and on the last slide of the last presentation, such as Dismissal, the row says "Pressed Next slide: nothing to move."

A move into a presentation that is not a song of the set, such as Facetime, MC or the message, pauses ProPresenter, and the row reads "Paused: moved to Facetime", so no cue from Live, such as a Pad clearing the screen, lands on it. A move into another song of the set does not pause it. The pause ends when the producer arms ProPresenter, or at the next song's Count Off, as a Fade out's pause does. It pauses ProPresenter alone: the lights and the ATEM follow the music.

After a slide shown by hand in another presentation, such as an announcement after a Turnaround clears the screen, Next slide moves on inside that presentation.

### Before the service

1. Open ProPresenter well before the service. The first commands after it opens can take several seconds: at home the first triggers answered in 1.2 to 7.8 seconds, and every command after them in about 60 ms (`test/fixtures/propresenter/README.md`).
2. On the playback Mac's setup screen at `http://localhost:8080/setup`, check the ProPresenter row reads Online.
3. On the producer page, pick the week's playlist (above), press Refresh, and read ProPresenter's pre-service check. An empty Problems list is a good check. Read the notes too: each one says what a section will show.
4. Arm ProPresenter. A slide pressed by hand in ProPresenter pauses it ("Paused by hand") until the producer arms it again, and a Fade out pauses it until the next Count Off. Until ProPresenter takes the first cue after the producer arms it, a slide with no words, such as the pre-service loop on its timers, does not pause it.

## 12. Typing a song's chart from the skeleton

The chart view shows each song's words and chords under the locator they belong to, so each heading in a song's chord chart has to match a locator's name. The skeleton gives the headings, so they match by design.

1. While the Mac is on the internet, run `pnpm build-set --plan --skeleton` for the week's plan, or `pnpm build-set --skeleton <song> ...` with the songs' short names, as `pnpm build-set --list` prints them. It writes nothing. For each song it prints a line with its number and title, then its headings, one per line, in upper case.
2. In Planning Center Services, open Songs, select the song, and select its arrangement in the left sidebar. Select the Lyrics & Chords button in the Files section to open the editor.
3. Paste that song's headings into the editor: every line under its number and title, not the number and title line itself.
4. Under each heading, type that section's words. Type each chord in square brackets right before the syllable it falls on: `[G]Amazing [D]grace`. Never put a chord in brackets on a heading line, since Planning Center moves it to the line above.
5. Set the Original Key dropdown to the key the chords are typed in, then save.

A locator the skeleton leaves out, such as Outro, is named in a note after the skeletons. It has no heading yet, so the chart view shows it with its name and bar count.

### Before the service: the Charts check

After typing the charts, build the set with `pnpm build-set`, which writes the set manifest. Then read the Charts row on the playback Mac's setup screen at `http://localhost:8080/setup`, or on the producer page. Press Refresh first if Live's set changed since the server last read it. The row needs no section in the connections config: the server adds it whenever it reads a set manifest, and checks again each time the manifest changes.

Each Cannot match line, `<song>: <locator>`, is a locator with no heading of its name in that song's chart. Fix the heading in Planning Center's Lyrics & Chords editor so it reads as the locator does, or rename the locator in Live, then build the set again. Count Off, Pad, Pad Out and End never need a heading.

Each Problems line is a song with no chart, or a set manifest that is missing or cannot be read. For a song with no chart, type its chart (above) and build the set again. For a missing or unreadable manifest, build the set again.

Read the Notes too. None of them stops the chart view, but each one says what a band member will see: a chart with no key is taken to be typed in the stems key, a chart with no chords in brackets shows no chords, a dropped line such as `TRANSPOSE KEY` is not shown, and a heading no locator reaches is never shown.

## 13. The band's phones: Auto-Lock to Never

The chart view follows the song on each band member's phone, so a phone that locks mid-song loses the chart until someone unlocks it. The page cannot keep the screen on by itself: the Screen Wake Lock needs HTTPS, and the server serves plain HTTP on the travel router. The view-only page shows a tip about this once per device, on its first open. Before the service, have each band member set it on their own phone:

1. On an iPhone or iPad, go to Settings, then Display & Brightness, then Auto-Lock, and choose Never.
2. On an Android phone, go to Settings, then Display (Display & touch on a recent Pixel), then Screen timeout, and choose the longest time it offers. Android has no Never for it.

After the service, each band member can set Auto-Lock or Screen timeout back, since a screen that never locks uses more battery.
