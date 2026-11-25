# Eos fixtures

Recorded 2026-10-24 from Eos 3.3.10 (ETCnomad on macOS, no dongle) by `scripts/eos/record-eos-fixtures.py`, against the test show `scripts/eos/build-eos-test-show.py` builds. Phase 0 of setlist-controller#108 (ticket #150). The fake Eos replays these; no test needs Eos running.

    python3 scripts/eos/build-eos-test-show.py
    python3 scripts/eos/record-eos-fixtures.py test/fixtures/eos

The five edge case scenarios of setlist-controller#259 were recorded on their own on 2026-11-02, by a run that writes no other file (see "Edge cases, 2026-11-02" below):

    python3 -B scripts/eos/record-eos-fixtures.py --edge-cases test/fixtures/eos

The eight scenarios of setlist-controller#286 were recorded the same way later that day, in two runs with Nick's change to Wrap between them (see "Wrap, cue edits, links and races, 2026-11-02" below):

    python3 -B scripts/eos/record-eos-fixtures.py --before-wrap test/fixtures/eos
    python3 -B scripts/eos/record-eos-fixtures.py --wrap test/fixtures/eos

The sixteen scenarios of setlist-controller#498, what the lights step of the set build sends, were recorded on 2026-11-12 on a test copy of the church show, not on the test show below, in three runs with Nick's change to Record Confirm after the first (see "The lights step on the church show, 2026-11-12"):

    python3 -B scripts/eos/record-eos-fixtures.py --lights test/fixtures/eos
    python3 -B scripts/eos/record-eos-fixtures.py --lights-confirm-off test/fixtures/eos
    python3 -B scripts/eos/record-eos-fixtures.py --lights-again test/fixtures/eos

The transport is TCP 127.0.0.1:3032 with OSC 1.0 packet-length framing (a big-endian int32 length, then the packet), Eos's default, per the 2026-10-24 comment on #108. Nothing needed scrubbing: Eos sent no host name, address or user name, until the 2026-11-12 recordings, whose show paths hold the Mac's user name and are kept as Eos sent them. The show is `(untitled)`, and the cue UIDs are random.

Each file is one scenario: `{ scenario, description, eos_version, transport, packets }`. Each packet is `{ t_ms, dir, address, args, hex }`, where `dir` is `app->eos` or `eos->app`, `t_ms` counts from the start of the scenario, and `hex` is the OSC packet without its length prefix. Within one run, the scenarios run in order, so each starts where the one before left the cue list. A run can open more than one connection, and the sections below say where it does.

## The test show

Cue list 1, each cue a 5 s fade (the Eos default):

| Cue | Label |
|---|---|
| 1 | Goodness of God / Intro |
| 2 | Goodness of God / Verse 1 |
| 3 | Goodness of God / Chorus |
| 3.5 | Goodness of God / Bridge |
| 4 | Goodness of God / End |
| 5 | Great Are You Lord / Count Off |
| 6 | Great Are You Lord / Verse 1 |
| 7 | Great Are You Lord / Chorus |
| 8 | (no label) |

There is no part cue: the build's `Record Cue 1 / 7 Part 2` gave no error and recorded nothing.

The lights tests run on a second show, `SONG_SHOW` in `test/fake-eos.ts`: one cue per song, labelled by the song title (cue 3 `Goodness of God`, cue 6 `Great Are You Lord`), with the other seven cue numbers unlabelled. It was never built at Eos. Every recording still holds the recorded show above, and the fake answers the second show by swapping its numbers and labels into the recorded packets.

The tests of the lights step of the set build run on a third show, `CHURCH_SHOW` in `test/fake-eos.ts`, with the cue numbers of the church show the recordings of 2026-11-12 were made on. Its levels are a model, not a recording: no template show file was ever recorded. A test gives each cue's own intensity and colour by channel (`setLevels`), and the fake tracks them as the recordings showed Eos does, per channel, the colour apart from the intensity, up to the next cue that holds a value of its own. A channel no cue holds a colour for reads as the recorded channel 1 did, a channel given an intensity alone answers as the recorded dimmer did, Record Confirm is on until a test turns it off, and a Go To Cue drops every colour set by hand. The fake does not model the two fields of a cue's list reply that a Record Only of a new colour changes (arguments 9 and 10), and what it answers to a Go To Cue of a cue the show does not hold, Eos's syntax error, is not recorded. Neither is an Eos that keeps a level less finely than the float sent: every level a recording set was a whole number or had come out of Eos first. So the fake holds a colour set as the float sent until a test tells it to keep one to a thousandth (`roundColours`), the grid the three levels Eos gave that are not whole (2.178, 50.48 and 50.78) sit on.

The fake's Copy To, `Cue 1 / <a> Copy_To Cue 1 / <b>#`, is the recorded one where a recording holds it (`cue-copy-to`, `cue-copy-to-decimal`): the command line, which names the new cue and asks for no confirmation, the notify pair on a subscribed connection, with the new cue as an int for a whole number and as a string for a decimal, the copy's place in the list by index, its label, which is its source's, and that it reads as its source after a Go To Cue. The rest is a model or is not recorded:

- What the copy holds as its own. The fake gives it each value of its source that differs from what tracks into its place, and nothing where the value is the same, so a copy straight after its source holds nothing and tracks. The recordings read one channel of a copy that sat straight after its source, and show that its list reply reads `-1, -1` where a cue that holds a recorded colour reads `2000, 0`, and nothing else about it. The lights step records every copy's colour itself, so no test of the step rests on this.
- The copy's link and hang, which the fake takes from its source. The copy's follow is recorded: a copy of a cue with a follow holds that follow (`chain-copy-to-follow`, under "A song cue with a follow or a hang, 2026-11-13"). No recording holds a copy of a cue with a hang or a link.
- A Copy To onto a number a cue of the show has, and one from a cue the show does not hold. The fake answers both with the syntax error it gives any command it does not know, and copies nothing. Eos may ask for a confirmation where the cue exists: the lights step sends a Copy To no Enter, and stops on any answer that does not end ` #`.
- The pending cue, the wheels and the softkeys Eos sent after the copy onto 22.5, which the fake does not send.
- A Go To Cue, a Record Only and a label set of a cue with a decimal number, such as 1/22.5. The fake takes a decimal number in all three, in the forms recorded for a whole number.
- An Eos that answers a Copy To and makes no cue (`holdCopies`), for the test of the lights step's read of the cue list after its copies.

## The scenarios

- `connect`: everything Eos sends after the TCP connect, before the app sends anything (softkeys, the command line, the show name, the previous, active and pending cue).
- `read-cue-list`: the count, the count without parts, and every cue by index from 0 to 9.
- `read-missing`: a cue that does not exist (1/99), a cue list that does not exist (list 2), and the cue list count.
- `fire`, `fire-decimal`: the app fires 1/3, then 1/3.5, with no argument.
- `fire-missing`: the app fires 1/99.
- `go`: `/eos/cues/1/fire` after 1/3.5 completed.
- `back`: `/eos/cues/1/stop` with no fade running.
- `back-during-fade`: fire 1/7, `/eos/cues/1/stop` 1 s into its fade, then `/eos/cues/1/stop` again 2 s later.
- `fire-by-hand`: Nick runs Go To Cue 6 at the console. The file keeps the 3 s before the fire and the 7 s after. A run that sees no fire within 15 minutes leaves the file as it was, prints `NO FIRE SEEN: fire-by-hand.json left as it was`, and exits non-zero.

With `--edge-cases`, only these, on two connections. Each Go and Back starts from a cue parked with `Go_To_Cue 1 / <cue> Time 0#`, which the file leaves out, and a park Eos rejects stops the run:

- `ping`: the lights' ping, `/eos/ping` with no argument, twice, 1 s apart.
- `connect-no-active-cue`: after `Go_To_Cue 1 / 0 Time 0#`, the first connection closes and a new one opens; everything Eos sends on it before the app sends anything.
- `go-last-cue`: `/eos/cues/1/fire` with cue 1/8, the last, completed.
- `back-first-cue`: `/eos/cues/1/stop` with cue 1/1, the first, completed.
- `back-during-fade-then-go`: from 1/6 completed, fire 1/7, `/eos/cues/1/stop` 1 s into its fade, then `/eos/cues/1/fire` 2 s later.

## Found while recording

- Eos sends a lot unprompted on connect, and the active cue's percent once a second while a cue fades. The adapter ignores what it does not need.
- The connect burst names the cue Eos is on: `/eos/out/active/cue/1/8` with its percent (`1.0`) and no label, twice, then `/eos/out/active/cue/text` (`"1/8 5.0 100%"`), which joins the number, the label, the fade time and the percent with spaces. The adapter takes the numbered active cue as the live cue until the first fire event, and takes its label from the cue list read (setlist-controller#250). After a drop, the adapter judges that active cue against the live cue from before it, by the follow and link rule: any other cue is a change by hand (setlist-controller#254). What Eos sends on connect with no cue of the list active is in `connect-no-active-cue.json` (see "Edge cases, 2026-11-02").
- `/eos/get/cue/1/count` replies `/eos/out/get/cue/1/count` with an int. `noparts/count` replies the same 9.
- `/eos/get/cue/1/index` takes the index as an int argument. Each cue replies with four packets: `/eos/out/get/cue/1/<cue>/0/list/0/31` (index, UID, label, then 28 more), and `fx/list`, `links/list` and `actions/list` with only the index and UID. The part in the address is `0` for a base cue, the cue number is as typed (`3.5`), and the last argument (multipart index) is `-1`.
- An unlabelled cue replies with the label `""`.
- An index past the end replies `/eos/out/get/cue/0/0` with the index as its only argument.
- A cue that does not exist replies `/eos/out/get/cue/1/99` with no arguments. A cue list that does not exist replies count `0`, and `/eos/get/cuelist/2` replies with no arguments.
- Firing a cue that does not exist gets no reply at all.
- Every fire, from the app or by hand, gives `/eos/out/event/cue/1/<cue>/fire` with the label, about 45 ms after the command, then the previous, active and pending cue.
- Go gives the fire event of the next cue (1/4).
- Back with no fade running gives a **fire** event for the cue before (1/3.5 after 1/4). So the adapter's own Back looks like a fire of a cue it did not name, and only its own-command window tells it apart from a cue fired by hand.
- Back during a fade stops the fade and gives `/eos/out/event/cue/1/0/stop` with the label `""`: cue 0, not the fading cue. A second Back then goes back (a fire event for 1/6).
- A cue fired by hand gives the same fire event as one the app fires. The command line packets (`/eos/out/cmd`) show the typing before it.
- Eos used only the type tags `s`, `i`, `f` and `F`, all of which `src/shared/osc.ts` decodes, so the codec gains nothing.

## Follows and links, 2026-10-24

Recorded for setlist-controller#138 by `scripts/eos/record-follow.py`, from the "Church baseline" show in ETCnomad 3.3.10, in a temporary cue list 99 that was deleted afterwards. #138's review found that a fire event says nothing about what fired it, so a follow or a link back to a cue looks the same as the operator firing that cue. The cue list read carries each cue's link and follow, so the adapter can expect the next cue a follow or link fires.

The list was built over OSC in Live with `/eos/newcmd`, each cue with a 1 s fade:

    Chan 1 At 20#   Record Cue 99 / 1 Time 1#   (then 40, 60, 80, 100 for cues 2 to 5)
    Cue 99 / 1 Follow 1#
    Cue 99 / 2 Follow 1#   Cue 99 / 2 Link 4#
    Cue 99 / 4 Hang 1#
    Cue 99 / 5 Follow 1#   Cue 99 / 5 Link 3#

and labelled `Follow test / <n>` through `/eos/set/cue/99/<n>/label`.

- `read-follow-list`: the count (5), then every cue by index 0 to 5.
- `fire-follow-chain`: the app fires 99/1 only, and Eos fires the rest by itself.

Found:

- In each cue's `list/0/31` reply, argument 19 is the link, argument 20 the follow time, and argument 21 the hang time. The link is the target cue number as an int, `0` for none (`4` on 99/2, `3` on 99/5). Follow and hang are milliseconds as ints, `-1` for none (`1000` here). The OSC Dictionary says a link to a cue in another list is a string; that form is not recorded, and neither is a link to a decimal cue.
- The chain fired 99/1 at 77 ms, 99/2 at 1014 ms (99/1's follow), 99/4 at 2019 ms (99/2's follow, taking its link and skipping 99/3), 99/5 at 4038 ms (99/4's hang, counted from the end of its 1 s fade), and 99/3 at 5039 ms (99/5's follow and link), then stopped. Each event is the same `/eos/out/event/cue/99/<n>/fire` a cue fired by hand gives.
- So the cue a follow or hang fires next is the link target when the link is not 0, else the next cue in the list. A cue with neither a follow nor a hang fires nothing by itself.
- The active cue can come before its fire event: `/eos/out/active/cue/99/1` at 64 ms, the fire event of 99/1 at 77 ms. So the adapter takes the active cue as the live cue only while it has none, never after a fire event, or a follow would be judged against itself.

## Edge cases, 2026-11-02

Recorded for setlist-controller#259 on 2026-11-02 at about 14:45, from Eos 3.3.10 (ETCnomad on macOS) by `record-eos-fixtures.py --edge-cases`, which exited 0 after 42.7 s. The show was "Church baseline", Nick's show, not `(untitled)`: its cue list 1 was emptied and rebuilt by `build-eos-test-show.py`, and the nine cues' labels read back match the table above. The show also has a cue list 2, and cue 2/1 was the active cue on the command line before the run. Cue list 1's Go From Last, Back From First and Wrap could not be read over OSC: `/eos/get/cuelist/1` replied `[-1, <uid>, "Goodness of God / Intro", "1/1", "Proportional", False, False, False, False, True, False, -1, False]`. The manual (Cue List Properties) gives Go From Last a default of Do Nothing and Back From First a default of Cue Out, which "uses the Back time for fading", and what Eos sent fits both. The fade out took 2 s, where the manual (Manual Timing) gives a default Back time of 1 s, so "Church baseline" may set its own; that was not read.

- `ping`: Eos answers each `/eos/ping` with `/eos/out/ping` and no argument, 9 ms and 17 ms after the ping. The reply carries the type tag string `,` like every other packet, so the fake's reply, built from ETC's help, was already right byte for byte.
- `connect-no-active-cue`: 45 packets, and no numbered active cue (`/eos/out/active/cue/1/<cue>`) anywhere. The active cue has no number: `/eos/out/active/cue` with `1.0`, and `/eos/out/active/cue/text` with `" 0.0 100%"`, the text with no cue in front. There is no previous cue (`/eos/out/previous/cue` with no arguments, text `""`), and the first cue is pending (`/eos/out/pending/cue/1/1`, text `"1/1 Goodness of God / Intro 5.0"`). The command line packets echo the park, `Go To Cue 1 / 0 Time 0:00 #`, and the show name is `Church baseline`. The fake sends this burst for a show with no current cue, naming the show's first cue as the pending cue.
- `go-last-cue`: Eos sent nothing in the 7 s after the Go: no fire event, no active or pending cue.
- `back-first-cue`: Eos fades the list out in 2 s and sends a **fire** event for cue 0, `/eos/out/event/cue/1/0/fire` with the label `""`, 52 ms after the Back. Before it come the active cue with no number at `0.0` and its text `" 2.0 0%"`, and cue 1/1 pending. The active cue with no number then reports `0.5` and `1.0` a second apart. No numbered active cue and no previous cue are sent.
- `back-during-fade-then-go`: the fire of 1/7 gives its fire event, previous 1/6, active 1/7 and pending 1/8, as every fire does. The Back 1 s in gives the active cue at `0.21` and `/eos/out/event/cue/1/0/stop` with `""`, as in `back-during-fade`, and cue 7 stays stopped at 21%, with no percent sent while it is stopped. The Go then gives `/eos/out/event/cue/1/0/resume` with `""`, 41 ms after it, and cue 7's fade runs on from 21% to 100% in about 4 s, its percent once a second. That Go fires no cue: no fire event and no new pending cue.

## Wrap, cue edits, links and races, 2026-11-02

Recorded for setlist-controller#286 on 2026-11-02 from Eos 3.3.10 (ETCnomad on macOS), on "Church baseline" with cue list 1 as the table above builds it. `--before-wrap` ran at about 19:02 and exited 0 after about 70 s. Nick then set Go From Last and Back From First to Wrap on cue list 1 by hand, in the Cue List Index (Cue Cue), and `--wrap` ran at about 21:01 and exited 0 after 23 s. The first `--wrap` run stopped before it sent anything: the Cue List Index had left the command line in Blind (`BLIND: Cue  1 / : Cue 1 / Back From First Wrap #`), and the run starts only on a command line that reads LIVE. Both runs check for LIVE before each command line, and a command Eos rejects stops the run. Each run cleans up after itself, outside its scenarios, so no fixture shows the clean-up. After `--before-wrap`, a read over OSC showed 9 cues in list 1, 2 cue lists (no list 99), and no link on 1/4.

The cue edits ran on the OSC user's own command line (`/eos/newcmd`, user 1), on the same connection that subscribed, not on the console keypad. So these files do not show whether Eos notifies a connection of an edit made by another user or at the keypad. The keypad edit was recorded for setlist-controller#287 (see "A cue edit at the keypad, 2026-11-06" below).

With `--before-wrap`, in order, on one connection:

- `cuelist-properties-wrap-off`: `/eos/get/cuelist/1` with Go From Last and Back From First as the show left them.
- `cue-edit-at-console`: from 1/8 completed, the command line records 1/9, moves it to 1/10, and deletes 1/10, 3 s apart, then the cue count. The app has not subscribed.
- `cue-edit-at-console-subscribed`: the same on 1/11 and 1/12, after `/eos/subscribe` with the int `1`, then `/eos/subscribe` with `0`.
- `link-to-another-list`: cue 1/4 is linked to 99/1 in a temporary list 99, then 1/4 and list 99 are read.
- `fire-racing-follow`: in a temporary list 99 (99/1 with a 1 s follow, then 99/2 and 99/3, each a 1 s fade), the app fires 99/1, then fires 99/2 by number 1 s later, as the follow is due.

With `--wrap`, on a new connection:

- `cuelist-properties-wrap-on`: `/eos/get/cuelist/1` again, with both set to Wrap.
- `go-last-cue-wrap`: `/eos/cues/1/fire` with 1/8, the last cue, completed.
- `back-first-cue-wrap`: `/eos/cues/1/stop` with 1/1, the first cue, completed and no fade running.

Found:

- **Wrap cannot be read over OSC.** The `/eos/get/cuelist/1` reply is the same byte for byte with Wrap off and with Wrap on: `[-1, <uid>, "Goodness of God / Intro", "1/1", "Proportional", False, False, False, False, True, False, -1, False]`. So the app cannot learn the setting from Eos, and has to take it from the operator or from what Eos does.
- With Go From Last set to Wrap, Go on the last cue fires the first: `/eos/out/event/cue/1/1/fire` with its label 33 ms after the Go, no previous cue, 1/1 active, and 1/2 pending. 1/1 fades in over its own 5 s. Without Wrap the same Go sent nothing (`go-last-cue`).
- With Back From First set to Wrap, Back on the first cue fires the last: `/eos/out/event/cue/1/8/fire` with `""` 52 ms after the Back, previous 1/7, 1/8 active, and **1/1 pending**, not a cue after 1/8. 1/8 reaches 100% about 1 s later. Without Wrap the same Back faded the list out with a fire event for cue 0 (`back-first-cue`).
- **A cue edit on the OSC command line sends no notify unless the app subscribes.** Without a subscribe, recording, moving and deleting a cue there send only the command line echo, the active cue, and for the record and the delete the previous cue, beside the softkey packets every file carries. Recording 1/9 makes it the active cue (`/eos/out/active/cue/1/9` at `1.0`) with no fire event, moving it makes 1/10 the active cue, and deleting 1/10 makes 1/8 the active cue again with previous 1/7. So a cue edit can change the active cue with no fire event, and nothing says that the cue list changed.
- After `/eos/subscribe 1`, each edit gives two notify packets about 1 s after it: `/eos/out/notify/cue/1/list/0/2` with a sequence number and the cue, then `/eos/out/notify/cuelist/list/0/2` with the next sequence number and the list number `1`. The record gives `[0, 11]`, the move from 11 to 12 `[2, "11-12"]` (a string, which one recording cannot tell apart from a range of 11 through 12), and the delete `[4, 12]`. The sequence numbers count up across both addresses. Nothing else in the run changed, and the cue count read after it is the same 9.
- A link to a cue in another list is a **string** in argument 19 of the `list/0/31` reply: `"99/1"` on 1/4. A link in the same list is an int (see "Follows and links, 2026-10-24"). List 99's own `links/list` reply holds only the index and UID, so it does not name the cues that link to it. The run read 1/4 by number (`/eos/get/cue/1/4`), not by index as the adapter reads the list, and did not fire 1/4, so what a Go from a cue with that link fires is not recorded.
- A fire by number that races a follow onto the same cue gives **two** fire events for that cue: `/eos/out/event/cue/99/2/fire` at 1057 ms and again at 1087 ms, after the app's fire at 1036 ms. The previous, active and pending cue come once, before the first event: previous 99/1, active 99/2, pending 99/3. 99/3 does not fire, since 99/2 has no follow.

## A cue edit at the keypad, 2026-11-06

Recorded for setlist-controller#287 on 2026-11-06 from Eos 3.3.10 (ETCnomad on macOS), with "Church baseline" open and 34 cues in cue list 1, not the nine-cue test show above. The run was attended: a one-off driver, run by hand, opened one connection through `Recorder`, `open_eos`, `require_live` and `write` from `scripts/eos/record-eos-fixtures.py`, so the file has the same shape as the others, but it is not a mode of that script. It checked the command line read LIVE, sent `/eos/subscribe` with the int `1`, and waited while Nick typed at the ETCnomad keypad. Then it read the cue count and sent `/eos/subscribe` with `0`.

- `cue-edit-at-keypad-subscribed`: Nick typed `Record Cue 1 / 900 Enter`, then `Delete Cue 1 / 900 Enter Enter`, by hand at the keypad.

Found:

- **Eos notifies a subscribed connection of a cue edit made at the keypad**, in the same shape as an edit on the OSC user's command line (`cue-edit-at-console-subscribed`). About 1 s after the command line's `#`, each edit gave `/eos/out/notify/cue/1/list/0/2` with a sequence number and the cue, then `/eos/out/notify/cuelist/list/0/2` with the next sequence number and the list number `1`: `[0, 900]` and `[1, 1]` for the record, `[2, 900]` and `[3, 1]` for the delete. The sequence numbers start at 0 after the subscribe and count up across both addresses, as in the console recording.
- The keypad and the OSC connection were both user 1 on ETCnomad, so the keypad's typing came back on `/eos/out/cmd` and `/eos/out/user/1/cmd`, one keystroke at a time, as the OSC connection's own command line does. So this file still does not show what a connection gets for an edit made by another user.
- As on the command line, the record made 1/900 the active cue (`/eos/out/active/cue/1/900` at `1.0`, previous 1/34) with no fire event, and the delete made 1/34 the active cue again, previous 1/33, with no fire event. The delete asked `Please Confirm` before the second Enter.
- The cue count read at the end is 34, the same as before the run.

## The lights step on the church show, 2026-11-12

Recorded for setlist-controller#498 on 2026-11-12 from Eos 3.3.10.28 (ETCnomad on macOS; `/eos/get/version`, read by hand before the run and in no file here, gave `3.3.10.28`), by `record-eos-fixtures.py --lights`, which started at 16:03:43 and exited 0 after 73.8 s. Nick then turned Record Confirm off by hand (Setup, User, Record Defaults), and `--lights-confirm-off` ran at 16:09:16 on the show the first run had saved and exited 0 after 8.8 s. `--lights-again` ran at 16:50:10 on the same open show, with Record Confirm still off, and exited 0 after 37.2 s: it records what the tickets after #498 need and #498 did not list, found in the review of the first two runs. These are the commands the lights step of the set build (setlist-controller#247) sends, so the fake Eos can answer them from a recording.

**The show is not the test show above.** It is a test copy of Nick's church show of 2026-11-08: the file `Church Sunday 2026-11-08 2026-11-12 14-10-52.esf3d` in the Downloads folder, copied on disk to `Colour test recording 2026-11-12 15-40-53.esf3d` in the Eos show folder, and opened by hand. No recording ran on the church show's own file or on a template. Its cue list 1 holds eight cues: 0.5, 1, 11, 22 (the three song cues are 1, 11 and 22), 35, 36, 37 and 38. Channels 1 to 18 are RGB fixtures (ETC D22 Studio RGB with strobe), channels 1 to 3 and 16 to 18 are the six colour lights, and channel 24 is a dimmer. Record Confirm was on.

**The guard.** A lights mode reads the open show's path, `/eos/get/show/path`, at the start, again before each scenario, and before the cleanup after `cue-copy-to`. It sends nothing else unless the command line reads LIVE and the path's file name holds `Colour test`, and inside a scenario it checks for LIVE again before each command line, colour and label. The path is not read again inside a scenario, so a show opened by hand in the seconds a scenario runs is not caught until the next one. The reads of the path that guard a scenario are not in its file. The recordings were made by the script as it stood at commit `b443dc3`. The review after them added the read of the path before the cleanup and made the Record Only step wait for the command line's answer, and neither changes a file.

The two runs changed the test copy. `--lights` recorded red 20, green 90 and blue 100 into cue 1/1 on the six colour lights, labelled it `Test Song A`, recorded 1/11's old colours into 1/11 as its own, and saved the show as a new file. `--lights-confirm-off` then recorded 100, 70 and 20 into 1/1 of the open show and did not save. `--lights-again` recorded 100, 70 and 20 into 1/22, which then tracks into the cues after it, and did not save either.

With `--lights`, in order, on one connection but the last:

- `show-path`: the connect burst, then `/eos/get/show/path`.
- `channel-params`: Go To Cue 1/1 in no time, then `/eos/get/params/1` (RGB) and `/eos/get/params/24` (dimmer).
- `command-rejected`: `Chan 1 Thru 3 + 16 Thru 18 Record_Only Cue 1 / 1 Q_Only#`, which Eos rejects. It ran before anything was written to the show.
- `colours-before-record`: Go To Cue 1/11, 1/22, 1/35 and 1/36 in no time, each followed by the live levels of the six colour lights.
- `colour-set`: Go To Cue 1/1 in no time, channel 1 read, set to 20, 90 and 100 with `/eos/chan/1/param/red/green/blue`, and read again.
- `record-only-confirm-on`: the other five colour lights set the same, then `Chan 1 Thru 3 + 16 Thru 18 Record_Only Cue 1 / 1#`, the confirmation, and channels 1 and 16 read.
- `colours-after-record`: the reads of `colours-before-record` again.
- `colour-recorded-back`: Go To Cue 1/11, each colour light set to what `colours-before-record` read for it in 1/11, Record Only into 1/11 with its confirmation, then the six lights read in 1/22, 1/35 and 1/36.
- `cue-label-set`: subscribed, `/eos/set/cue/1/1/label` with `Test Song A`, then `/eos/get/cue/1/1`.
- `cue-copy-to`: subscribed, `Cue 1 / 22 Copy_To Cue 1 / 23#`, then 1/23 and the cue count read, Go To Cue 1/23 and channel 16 read. The run then deleted 1/23, outside the file.
- `show-save`: `/eos/key/shift` 1.0, `/eos/key/update` 1.0 then 0.0, `/eos/key/shift` 0.0, half a second apart, then `/eos/get/show/path`.
- `show-path-after-save`: on a new connection, the connect burst and `/eos/get/show/path`.

With `--lights-confirm-off`, on a new connection:

- `record-only-confirm-off`: Go To Cue 1/1 in no time, the six colour lights set to 100, 70 and 20, then `Chan 1 Thru 3 + 16 Thru 18 Record_Only Cue 1 / 1#` with no Enter, and channels 1 and 16 read. It left that colour in 1/1 of the open show and did not save.

With `--lights-again`, on a new connection, each scenario subscribed:

- `record-only-same-colour`: what a second run of the lights step sends. Cue 1/11 read with `/eos/get/cue/1/11`, Go To Cue 1/11, the six colour lights read, each set to the red, green and blue just read, Record Only into 1/11, then the cue and channels 1 and 16 read again.
- `record-only-subscribed`: cue 1/22 read, Go To Cue 1/22, the six lights set to 100, 70 and 20, Record Only into 1/22, then the cue and channels 1 and 16 read again.
- `cue-copy-to-decimal`: `Cue 1 / 22 Copy_To Cue 1 / 22.5#`, then 1/22.5 read, the cue count, and every cue by index 0 to 8. The run then deleted 1/22.5, outside the file, and a read by hand after it gave a count of 8.

Found:

- **The path names the file that is open, and the show name does not.** `/eos/get/show/path` gave `[".../ETC/Colour test recording 2026-11-12 15-40-53.esf3d"]` on `/eos/out/get/show/path`, 19 ms after the read, while the connect burst's `/eos/out/show/name` still said `Church Sunday 2026-11-08`, the name the copied file was last saved under. After the save, the name is `Colour test recording`. So the lights step has to know the open show by its path.
- **A channel parameter read answers on `/eos/out/get/params/<chan>`** with the fixture's maker and model, then name, level, min and max for each parameter, all floats: `["ETC Fixtures", "D22 Studio RGB Str", "Intens", 0.0, 0.0, 100.0, "Red", 100.0, 0.0, 100.0, "Green", ..., "Blue", ..., "Hue", 0.0, 0.0, 360.0, "Saturation", 0.0, 0.0, 100.0, "Shutter Strobe", 0.0, 0.0, 0.0]` for channel 1, and `["Generic", "Dimmer", "Intens", 75.0, 0.0, 100.0]` for channel 24. Hue and Saturation read 0 whatever the colour. Over the 75 reads in these files the reply came 4 ms to 34 ms after the read. A read 1 s after a Go To Cue in no time gave the cue's levels.
- **Each Go To Cue in no time sends a fire event**, `/eos/out/event/cue/1/<cue>/fire` with the cue's label, as a Go does. So a server that is connected and armed sees the lights step's moves as cues fired by hand.
- **A colour set through the parameter address reads back exactly.** `/eos/chan/1/param/red/green/blue` with the floats 20, 90 and 100 gave Red 20.0, Green 90.0 and Blue 100.0 half a second later, and Eos sent no packet of its own for the set. The show's own colours are not round numbers: red 2.178 and red 50.48 with green 50.78 came back from the cues, and the same floats sent back gave the same reads.
- **Record Only with Record Confirm on asks, and an Enter confirms.** 53 ms after the command line, `/eos/out/cmd` reads `LIVE: Cue  1 : Chan 1 Thru 3 + 16 Thru 18 Record Only Cue 1 / 1  Please Confirm` with the int `1`. After `/eos/cmd` with `Enter`, 58 ms later it reads the same line ending ` #` with the int `0`. The channels keep their levels after the record. The run was not subscribed here, so the file does not show whether a Record Only notifies.
- **With Record Confirm off, the same Record Only records at once.** 55 ms after the command line, `/eos/out/cmd` reads `LIVE: Cue  1 : Chan 1 Thru 3 + 16 Thru 18 Record Only Cue 1 / 1 #` with the int `0`, the line the confirmed record ends on, and no `Please Confirm` comes before it. So the lights step tells the two apart by the first `/eos/out/cmd` after its command: it sends the Enter only when that line ends `Please Confirm`.
- **A Record Only of the colour a cue already holds is taken, and changes and notifies nothing.** In `record-only-same-colour` the command line ends ` #` 80 ms after the command, as for any record, no notify comes in the 5 s after it though the run is subscribed, and the two reads of cue 1/11 are the same argument for argument. So a second run of the lights step can send the same commands again, and a subscribed connection hears nothing of it.
- **A Record Only of a new colour notifies a subscribed connection, and sets two more fields of the cue.** In `record-only-subscribed`, 1.04 s after the command come `/eos/out/notify/cue/1/list/0/2` with `[0, 22]` and `/eos/out/notify/cuelist/list/0/2` with `[1, 1]`. Arguments 9 and 10 of the cue's `list/0/31` reply go from `-1, -1` to `2000, 0`, the cue's own time and delay, and nothing else in the reply changes: not the label, the UID or the time. Cues 1/1 and 1/11, which hold a recorded colour, read `2000, 0` there too, and 1/35 and the copies of 1/22 read `-1, -1`. This session's reading, not ETC's: the two are the cue's colour time and delay, which Eos gives only for a cue where a colour changes.
- **A colour recorded into a cue tracks into every later cue, channel by channel, until a cue with a colour of its own for that channel.** Before the record, the six lights held the same colours in 1/11, 1/22 and 1/35, and in 1/36 channel 16 held another (red 2.178, green 0, blue 100). After 20, 90 and 100 went into 1/1, every one of the six read 20, 90 and 100 in 1/11, 1/22, 1/35 and 1/36, but channel 16 in 1/36, which kept its own. So none of those cues held a colour of its own for these lights, but that one. The intensities did not change.
- **Recording the old colour back into a later cue stops the tracking there.** With each light's old red, green and blue recorded into 1/11, the six lights in 1/22, 1/35 and 1/36 read exactly as in `colours-before-record`. No file reads 1/1 again after that.
- **A label set over OSC notifies a subscribed connection like a cue edit.** `/eos/set/cue/1/1/label` gave no direct answer. 1.04 s later came `/eos/out/notify/cue/1/list/0/2` with `[0, 1]` (sequence number, cue) and `/eos/out/notify/cuelist/list/0/2` with `[1, 1]`, and the cue then read back with `Test Song A` as argument 2 of its `list/0/31` reply.
- **Copy To makes the new cue with no confirmation, and notifies the same way.** The command line read `Cue 1 / 22 Copy To Cue 1 / 23 #`, and 1.04 s after the command came the two notifies, `[2, 23]` and `[3, 1]`. Cue 1/23 read back with 1/22's label (`Worthy Of It All`) and 1/22's 2 s time, the cue count read 9, one more than the show's eight, and after a Go To Cue 1/23 channel 16 read 1/22's levels (intensity 62, red 50.48, green 50.78, blue 100). The copy also made 1/23 the cue on the command line (`LIVE: Cue  23 :`).
- **A copy onto a decimal number works the same, and the notify names the cue as a string.** `Cue 1 / 22 Copy_To Cue 1 / 22.5#` gave `[2, "22.5"]` on `/eos/out/notify/cue/1/list/0/2`, where the copy onto 23 gave the int `23`. Read by index, the list holds 1/22.5 at index 4, between 1/22 at 3 and 1/35 at 5, and its reply address is `/eos/out/get/cue/1/22.5/0/list/0/31`.
- **The save is done when the Update key goes down, and the saved event does not name the file.** 121 ms after `/eos/key/update` 1.0 with Shift held, Eos sent `/eos/out/show/name` with `Colour test recording`, then `/eos/out/event/show/saved` with `[".../ETC/Colour test recording.esf3d"]`, a path with no timestamp that is no file on disk. `/eos/get/show/path`, read after it, gave the real file, `.../ETC/Colour test recording 2026-11-12 16-04-48.esf3d`. The key releases gave nothing. So the lights step waits for the saved event and then reads the path, and never prints the event's path as the file. The spec's line that the event carries the new file's path is wrong in this.
- **A command line Eos rejects stays on the command line with its error.** `/eos/out/cmd` reads `LIVE: Cue  1 : Chan 1 Thru 3 + 16 Thru 18 Record Only Cue 1 / 1 Q Only - Error: Syntax Error` with the int `1`, 78 ms after the command. Eos still selected the channels (`/eos/out/active/chan` names `1-3,16-18`), and recorded nothing. The next `/eos/newcmd` cleared it.

## A song cue with a follow or a hang, 2026-11-13

Recorded for setlist-controller#508 on 2026-11-13 from Eos 3.3.10 (ETCnomad on macOS), by `record-eos-fixtures.py --lights-chain`, which started at 09:31:32 and exited 0 after 101.7 s. A first run at 09:29:12 had no `chain-hang-cleared` scenario, gave the same answers, and its files were written over. Pre-PR review 1 of setlist-controller#247 found that the lights step knows a song by one cue, and Nick chose the rule that a song owns its chain. These files show what Eos does when a song cue runs on into the next cue.

**The show** is the test copy of "The lights step on the church show" as the 2026-11-12 runs left it, open as `Colour test recording 2026-11-12 16-04-48.esf3d` with their unsaved changes: cue list 1 holds 0.5, 1, 11, 22, 35, 36, 37 and 38, and no cue of it has a link, a follow or a hang. Record Confirm was on. The run works on 1/22 ("Worthy Of It All", a 2 s fade), the last song cue, with 1/35 ("Closing") the next cue in the list.

**The guard** is the one of the other lights modes, with one check more: after `chain-cue-list-before` the run reads 1/22 and 1/23, and writes nothing unless 1/22 has no link, follow or hang and there is no 1/23. It takes the follow, the hang and the copy away again in a `finally`, each step behind its own read of the show path, and stops with `THE SHOW IS NOT AS IT WAS` when a last read of the two cues says otherwise. It did not save. The reads that guard a scenario, the cleanup (`Cue 1 / 22 Follow#`, `Cue 1 / 22 Hang#`, `Delete Cue 1 / 23#` with its Enter) and the last two reads are in no file.

In order, on one connection:

- `chain-cue-list-before`: the cue count, then every cue by index 0 to 9.
- `chain-follow-set`: subscribed, `Cue 1 / 22 Follow 3#`, then `/eos/get/cue/1/22`.
- `chain-go-to-cue-follow`: `Go_To_Cue 1 / 22 Time 0#`, channel 16 read a second later, 8 s with nothing sent, channel 16 again.
- `chain-record-only-follow`: what the lights step sends for a song cue. Go To Cue 1/22 in no time, the six colour lights read, each set to what was just read, `Chan 1 Thru 3 + 16 Thru 18 Record_Only Cue 1 / 22#` with its Enter, then 8 s with nothing sent and channel 16 read.
- `chain-fire-follow`: `/eos/cue/1/22/fire`, then 8 s with nothing sent.
- `chain-copy-to-follow`: subscribed, `Cue 1 / 22 Copy_To Cue 1 / 23#`, 1/23 read, `Cue 1 / 23 Follow#`, 1/23 read again.
- `chain-fire-follow-with-copy`: `/eos/cue/1/22/fire` with 1/23 in the list and no follow on it, then 8 s with nothing sent.
- `chain-follow-cleared`: `Cue 1 / 22 Follow#`, then 1/22 read.
- `chain-go-to-cue-hang`: `Cue 1 / 22 Hang 2#`, 1/22 read, Go To Cue 1/22 in no time, channel 16 a second later, 8 s with nothing sent, channel 16 again.
- `chain-hang-cleared`: `Cue 1 / 22 Hang#`, then 1/22 read.
- `chain-cue-list-after`: the reads of `chain-cue-list-before` again.

Found:

- **A Go To Cue in no time does not start a follow or a hang.** With a follow of 3 s on 1/22, `Go_To_Cue 1 / 22 Time 0#` gave the fire event of 1/22 at 54 ms and no other fire event in the 9.2 s the file holds; channel 16 read the same levels at 1.1 s and at 9.2 s. With a hang of 2 s it was the same: the fire event of 1/22, and none for 1/35 in the 9 s after it. So the lights step's own moves never set a chain running. ETC's help for [Go To Cue] says the form with [Time] and no number uses the cue's times "and also uses any associated follow/hang times", and gives {Minus Links} to go without them (https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/13_Cue_Playback/[Go_To_Cue].htm, read 2026-11-13). The form with a time, which the lights step sends, is the one recorded here. A Go To Cue with [Time] and no number is not recorded.
- **The lights step's commands on a cue with a follow fire nothing either.** In `chain-record-only-follow` the Record Only asked `Please Confirm` 51 ms after the command, took the Enter, and ended ` #` 84 ms after it, as on a cue with no follow. No fire event came in the 10 s after the record.
- **A fire by number does start the follow, counted from the fire.** `/eos/cue/1/22/fire` gave the fire event of 1/22 at 50 ms and the fire event of 1/35 at 3044 ms, 1 s after 1/22's 2 s fade was done. This is the follow of "Follows and links, 2026-10-24" on the church show's own cues.
- **A follow set on the command line notifies, and reads back in argument 20.** `Cue 1 / 22 Follow 3#` echoed `LIVE: Cue  22 : Cue 1 / 22 Follow 0:03 #`, a subscribed connection got `[0, 22]` and `[1, 1]` on the two notify addresses about 1 s later, and 1/22 read back with `0, 3000, -1` in arguments 19 to 21. `Cue 1 / 22 Hang 2#` echoed `... Hang 0:02 #` and read back `0, -1, 2000`.
- **A follow or a hang with no time takes it off.** `Cue 1 / 22 Follow#` echoed `LIVE: Cue  22 : Cue 1 / 22 Follow #` and the cue read `0, -1, -1` again; `Cue 1 / 22 Hang#` did the same for the hang. ETC's support note says the same of the keypad, [Cue] [1] [2] {Follow} [Enter] (https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Removing_a_Follow_Time_from_a_Cue, read 2026-11-13).
- **Copy To copies the follow.** 1/23, the copy of 1/22, read `0, 3000, -1` in arguments 19 to 21, with 1/22's label and 2 s time. `Cue 1 / 23 Follow#` took it off, with the two notifies `[4, 23]` and `[5, 1]`, and the copy then read `0, -1, -1`. A copy of a cue with a hang or a link is not recorded.
- **With the copy in the list, the follow of the last song cue fires the copy.** After `/eos/cue/1/22/fire`, the pending cue was `1/23 Worthy Of It All 2.0` at 104 ms, and the fire event of 1/23 came at 3012 ms, where `chain-fire-follow` had 1/35. The copy had no follow by then, so nothing fired after it and 1/35 stayed pending. This is the defect of pre-PR review 1 finding 1 on the real console: a copy numbered straight after a song cue that has a follow is the cue that follow fires.
- **The church show of 2026-11-08 has no chain.** Every cue of list 1 reads `0, -1, -1` in `chain-cue-list-before`, and `chain-cue-list-after` holds the same replies, argument for argument.

**What the fake Eos answers from these files.** A Go To Cue in no time onto a cue with a follow or a hang gets that cue's fire event and the command line, and no other cue fires (`chain-go-to-cue-follow`, `chain-go-to-cue-hang`). A Record Only into such a cue fires nothing either (`chain-record-only-follow`). A copy holds its source's follow in argument 20 of its list reply (`chain-copy-to-follow`). `Cue 1 / <cue> Follow#` and `Cue 1 / <cue> Hang#` take the follow and the hang off a cue of the show, with the command line `LIVE: Cue  <cue> : Cue 1 / <cue> Follow #` (or `Hang #`) and the int `0` on `/eos/out/user/1/cmd` and `/eos/out/cmd`, and a subscribed connection gets the notify pair after a follow comes off (`chain-follow-cleared`, `chain-hang-cleared`, and `chain-copy-to-follow` for the pair). The rest is a model or is not recorded:

- The notify pair after a hang comes off. It is recorded for a follow only: no recording was subscribed when a hang came off. The fake sends the same pair.
- A `Follow#` or a `Hang#` on a cue that has none. The fake answers with the same command line, changes nothing and sends no notify. The lights step sends neither command to a cue whose own read shows none.
- A `Follow#` or a `Hang#` on a cue the show does not hold. The fake answers with the syntax error it gives any command it does not know.
- A copy's hang and link, which the fake takes from its source, as above.
- A follow or a hang set with a time (`Cue 1 / 22 Follow 3#`, `Cue 1 / 22 Hang 2#`). The fake does not take either: a test gives a cue its follow and its hang in the show it sets.
- An Eos that answers a `Follow#` or a `Hang#` and keeps the time (`holdFollows`), for the test of the lights step's read of the cue list after it takes one off a copy.
